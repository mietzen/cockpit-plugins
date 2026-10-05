#!/usr/bin/env bash
set -e

PLUGIN_DIR="${1:-plugins/zfs-storage}"
RAW_VERSION="${2:-auto}"
OUTPUT_DIR="${3:-dist-rpms}"

if [ ! -d "$PLUGIN_DIR" ]; then
    echo "Error: Plugin directory '$PLUGIN_DIR' not found."
    exit 1
fi

PLUGIN_NAME=$(basename "$PLUGIN_DIR")
PKG_NAME="cockpit-${PLUGIN_NAME}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATES_DIR="${SCRIPT_DIR}/templates"
POSTINST_TEMPLATE="${TEMPLATES_DIR}/postinst.sh"
PRERM_TEMPLATE="${TEMPLATES_DIR}/prerm.sh"

# Determine version from tag, argument, or package.json
VERSION="$RAW_VERSION"
if [ "$VERSION" = "auto" ] || [ -z "$VERSION" ]; then
    GIT_TAG=""
    if [ "${GITHUB_REF_TYPE:-}" = "tag" ]; then
        GIT_TAG="${GITHUB_REF_NAME:-}"
    elif [ -n "${GITHUB_REF_NAME:-}" ] && [[ "${GITHUB_REF_NAME:-}" =~ ^(${PLUGIN_NAME}-)?v?[0-9] ]]; then
        GIT_TAG="${GITHUB_REF_NAME}"
    else
        GIT_TAG="$(git describe --tags --exact-match 2>/dev/null || true)"
    fi

    if [[ "$GIT_TAG" =~ ^${PLUGIN_NAME}-v?([0-9]+\.[0-9]+\.[0-9]+.*)$ ]]; then
        VERSION="${BASH_REMATCH[1]}"
    elif [[ "$GIT_TAG" =~ ^v?([0-9]+\.[0-9]+\.[0-9]+.*)$ ]]; then
        VERSION="${BASH_REMATCH[1]}"
    elif [ -f "${PLUGIN_DIR}/package.json" ]; then
        VERSION=$(python3 -c "import json; print(json.load(open('${PLUGIN_DIR}/package.json')).get('version', '1.0.0'))" 2>/dev/null || echo "1.0.0")
    else
        VERSION="1.0.0"
    fi
fi
VERSION="${VERSION#v}"

# Set SOURCE_DATE_EPOCH for reproducible builds
if [ -z "${SOURCE_DATE_EPOCH:-}" ]; then
    git fetch --tags origin 2>/dev/null || true
    if [ -n "${GIT_TAG:-}" ] && git rev-parse "refs/tags/$GIT_TAG" >/dev/null 2>&1; then
        SOURCE_DATE_EPOCH=$(git log -1 --pretty=%ct "refs/tags/$GIT_TAG" -- "$PLUGIN_DIR" 2>/dev/null || true)
    elif git rev-parse "refs/tags/${PLUGIN_NAME}-v${VERSION}" >/dev/null 2>&1; then
        SOURCE_DATE_EPOCH=$(git log -1 --pretty=%ct "refs/tags/${PLUGIN_NAME}-v${VERSION}" -- "$PLUGIN_DIR" 2>/dev/null || true)
    elif git rev-parse "refs/tags/v${VERSION}" >/dev/null 2>&1; then
        SOURCE_DATE_EPOCH=$(git log -1 --pretty=%ct "refs/tags/v${VERSION}" -- "$PLUGIN_DIR" 2>/dev/null || true)
    fi

    if [ -z "${SOURCE_DATE_EPOCH:-}" ]; then
        SOURCE_DATE_EPOCH=$(git log -1 --pretty=%ct "$PLUGIN_DIR" 2>/dev/null || true)
    fi
    if [ -z "${SOURCE_DATE_EPOCH:-}" ]; then
        SOURCE_DATE_EPOCH=$(git log -1 --pretty=%ct 2>/dev/null || date +%s)
    fi
    export SOURCE_DATE_EPOCH
fi

echo "==> Packaging RPM for ${PKG_NAME} (version ${VERSION})..."
mkdir -p "$OUTPUT_DIR"

if command -v rpmbuild >/dev/null 2>&1; then
    echo "==> Using rpmbuild to build RPM package..."
    RPMBUILD_DIR="build/rpmbuild"
    rm -rf "$RPMBUILD_DIR"
    mkdir -p "$RPMBUILD_DIR"/{BUILD,RPMS,SOURCES,SPECS,SRPMS,BUILDROOT}

    CHANGELOG_DATE=$(date -u -d "@$SOURCE_DATE_EPOCH" "+%a %b %d %Y" 2>/dev/null || date -u -r "$SOURCE_DATE_EPOCH" "+%a %b %d %Y" 2>/dev/null || date "+%a %b %d %Y")

    HELPER_DIR_NAME="cockpit-${PLUGIN_NAME}"
    if [ "$PLUGIN_NAME" = "zfs-storage" ]; then
        HELPER_DIR_NAME="cockpit-zfs"
    fi

    RPM_SUMMARY="Cockpit plugin ${PLUGIN_NAME}"
    RPM_DESC="Cockpit plugin ${PLUGIN_NAME}"
    RPM_REQUIRES="cockpit-bridge, python3"
    if [ "$PLUGIN_NAME" = "zfs-storage" ]; then
        RPM_SUMMARY="OpenZFS storage management plugin for Cockpit"
        RPM_REQUIRES="cockpit-bridge, python3"
        RPM_DESC="OpenZFS storage management plugin for Cockpit."
    elif [ "$PLUGIN_NAME" = "file-sharing" ]; then
        RPM_SUMMARY="SMB and NFS file sharing management plugin for Cockpit"
        RPM_REQUIRES="cockpit-bridge, python3, samba, nfs-utils"
        RPM_DESC="SMB and NFS file sharing management plugin for Cockpit."
    elif [ "$PLUGIN_NAME" = "container-manager" ]; then
        RPM_SUMMARY="Docker and Podman container management plugin for Cockpit"
        RPM_REQUIRES="cockpit-bridge, python3, openssl"
        RPM_DESC="Docker and Podman container management plugin for Cockpit."
    elif [ "$PLUGIN_NAME" = "code-server" ]; then
        RPM_SUMMARY="VS Code Server plugin for Cockpit"
        RPM_REQUIRES="cockpit-bridge, python3, code-server"
        RPM_DESC="VS Code Server plugin for Cockpit."
    fi

    RPM_EXTRA_FILES=""
    if [ "${PLUGIN_NAME}" = "code-server" ]; then
        RPM_EXTRA_FILES="%{_sysconfdir}/systemd/system/cockpit.socket.d/10-code-server.conf
%{_sysconfdir}/systemd/system/cockpit-caddy.service
%{_sysconfdir}/cockpit-code-server/Caddyfile
/usr/lib/tmpfiles.d/cockpit-code-server.conf"
    fi

    if [ "$PLUGIN_NAME" = "code-server" ]; then
        ARCH_PAIRS=("amd64:x86_64" "arm64:aarch64")
    else
        ARCH_PAIRS=("all:noarch")
    fi

    for pair in "${ARCH_PAIRS[@]}"; do
        TAR_ARCH="${pair%%:*}"
        RPM_ARCH="${pair##*:}"
        rm -rf "$RPMBUILD_DIR"
        mkdir -p "$RPMBUILD_DIR/BUILD" "$RPMBUILD_DIR/RPMS" "$RPMBUILD_DIR/SOURCES" "$RPMBUILD_DIR/SPECS" "$RPMBUILD_DIR/SRPMS"

        CADDY_INSTALL_CMD=""
        if [ "$PLUGIN_NAME" = "code-server" ]; then
            CADDY_VER=$(python3 -c "import json; print(next((p['version'] for p in json.load(open('${PLUGIN_DIR}/upstream.json'))['packages'] if p['name'] == 'caddy'), '2.11.7'))" 2>/dev/null || echo "2.11.7")
            ARCHIVE_FILE=""
            for c_dir in "build/archives" "dist-archives" "all-archives"; do
                if [ -f "${c_dir}/caddy_${CADDY_VER}_linux_${TAR_ARCH}.tar.gz" ]; then
                    ARCHIVE_FILE="${c_dir}/caddy_${CADDY_VER}_linux_${TAR_ARCH}.tar.gz"
                    break
                fi
            done
            if [ -z "$ARCHIVE_FILE" ] || [ ! -f "$ARCHIVE_FILE" ]; then
                python3 tools/download_upstream_packages.py --config "${PLUGIN_DIR}/upstream.json" --type tar.gz --archive-dir build/archives
                ARCHIVE_FILE="build/archives/caddy_${CADDY_VER}_linux_${TAR_ARCH}.tar.gz"
            fi
            mkdir -p "$RPMBUILD_DIR/SOURCES"
            tar -xzf "$ARCHIVE_FILE" -C "$RPMBUILD_DIR/SOURCES" caddy
            chmod 755 "$RPMBUILD_DIR/SOURCES/caddy"
            CADDY_INSTALL_CMD="cp \"${PWD}/${RPMBUILD_DIR}/SOURCES/caddy\" %{buildroot}/usr/libexec/${HELPER_DIR_NAME}/caddy"
        fi

        SPEC_BUILD_ARCH=""
        if [ "$RPM_ARCH" = "noarch" ]; then
            SPEC_BUILD_ARCH="BuildArch:      noarch"
        fi

        POSTINST_CONTENT=$(sed \
            -e "s|@@HELPER_DIR_NAME@@|${HELPER_DIR_NAME}|g" \
            -e "s|@@PLUGIN_NAME@@|${PLUGIN_NAME}|g" \
            "${POSTINST_TEMPLATE}")

        PRERM_CONTENT=$(sed \
            -e "s|@@HELPER_DIR_NAME@@|${HELPER_DIR_NAME}|g" \
            -e "s|@@PLUGIN_NAME@@|${PLUGIN_NAME}|g" \
            "${PRERM_TEMPLATE}")

        SPEC_FILE="$RPMBUILD_DIR/SPECS/${PKG_NAME}.spec"
        cat << SPEC_EOF > "$SPEC_FILE"
%define _buildhost localhost
%define _build_id_links none
%define __os_install_post %{nil}
%define _clamp_mtime 1
%define _build_time ${SOURCE_DATE_EPOCH}
%define _buildtime ${SOURCE_DATE_EPOCH}
%define _source_date_epoch ${SOURCE_DATE_EPOCH}
%define _binary_payload w9.gzdio
%define _source_payload w9.gzdio

Name:           ${PKG_NAME}
Version:        ${VERSION}
Release:        1
Summary:        ${RPM_SUMMARY}
${SPEC_BUILD_ARCH}
License:        MIT
URL:            https://github.com/mietzen/cockpit-plugins
Requires:       ${RPM_REQUIRES}

%description
${RPM_DESC}

%prep

%build

%install
rm -rf %{buildroot}
mkdir -p %{buildroot}/usr/share/cockpit/${PLUGIN_NAME}
mkdir -p %{buildroot}/usr/libexec/${HELPER_DIR_NAME}

if [ -d "${PWD}/${PLUGIN_DIR}/dist" ]; then
    cp -r "${PWD}/${PLUGIN_DIR}/dist/"* %{buildroot}/usr/share/cockpit/${PLUGIN_NAME}/
    rm -rf %{buildroot}/usr/share/cockpit/${PLUGIN_NAME}/backend || true
fi
if [ -f "${PWD}/${PLUGIN_DIR}/manifest.json" ]; then
    cp "${PWD}/${PLUGIN_DIR}/manifest.json" %{buildroot}/usr/share/cockpit/${PLUGIN_NAME}/
fi
if [ -f "${PWD}/${PLUGIN_DIR}/upstream.json" ]; then
    cp "${PWD}/${PLUGIN_DIR}/upstream.json" %{buildroot}/usr/share/cockpit/${PLUGIN_NAME}/
fi
if [ -d "${PWD}/${PLUGIN_DIR}/backend" ]; then
    cp -r "${PWD}/${PLUGIN_DIR}/backend/"* %{buildroot}/usr/libexec/${HELPER_DIR_NAME}/
fi
if [ -d "${PWD}/${PLUGIN_DIR}/packaging" ]; then
    if [ -f "${PWD}/${PLUGIN_DIR}/packaging/systemd/10-code-server.conf" ]; then
        mkdir -p %{buildroot}/etc/systemd/system/cockpit.socket.d
        cp "${PWD}/${PLUGIN_DIR}/packaging/systemd/10-code-server.conf" %{buildroot}/etc/systemd/system/cockpit.socket.d/
    fi
    if [ -f "${PWD}/${PLUGIN_DIR}/packaging/systemd/cockpit-caddy.service" ]; then
        mkdir -p %{buildroot}/etc/systemd/system
        cp "${PWD}/${PLUGIN_DIR}/packaging/systemd/cockpit-caddy.service" %{buildroot}/etc/systemd/system/
    fi
    if [ -f "${PWD}/${PLUGIN_DIR}/packaging/caddy/Caddyfile" ]; then
        mkdir -p %{buildroot}/etc/cockpit-code-server
        cp "${PWD}/${PLUGIN_DIR}/packaging/caddy/Caddyfile" %{buildroot}/etc/cockpit-code-server/
    fi
    if [ -f "${PWD}/${PLUGIN_DIR}/packaging/tmpfiles/cockpit-code-server.conf" ]; then
        mkdir -p %{buildroot}/usr/lib/tmpfiles.d
        cp "${PWD}/${PLUGIN_DIR}/packaging/tmpfiles/cockpit-code-server.conf" %{buildroot}/usr/lib/tmpfiles.d/
    fi
fi
if [ -d "${PWD}/packages/common/python/cockpit_common" ]; then
    mkdir -p %{buildroot}/usr/libexec/${HELPER_DIR_NAME}/cockpit_common
    cp -r "${PWD}/packages/common/python/cockpit_common/"* %{buildroot}/usr/libexec/${HELPER_DIR_NAME}/cockpit_common/
fi
${CADDY_INSTALL_CMD}
rm -rf %{buildroot}/usr/libexec/${HELPER_DIR_NAME}/tests
find %{buildroot} -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null || true
find %{buildroot} -name "*.pyc" -delete 2>/dev/null || true
find %{buildroot} -name "*.pyo" -delete 2>/dev/null || true
find %{buildroot}/usr/libexec/${HELPER_DIR_NAME} -name "*.py" -exec chmod 755 {} + 2>/dev/null || true
find %{buildroot}/usr/libexec/${HELPER_DIR_NAME} -name "caddy" -exec chmod 755 {} + 2>/dev/null || true
find %{buildroot} -exec touch -d "@${SOURCE_DATE_EPOCH}" {} + 2>/dev/null || true

%clean
rm -rf %{buildroot}

%files
%defattr(-,root,root,-)
/usr/share/cockpit/${PLUGIN_NAME}
/usr/libexec/${HELPER_DIR_NAME}
${RPM_EXTRA_FILES}

%post
${POSTINST_CONTENT}

%preun
${PRERM_CONTENT}

%changelog
* ${CHANGELOG_DATE} Nils Stein <github.nstein@mailbox.org> - ${VERSION}-1
- Release ${VERSION}

SPEC_EOF

        rpmbuild \
            --define "_topdir ${PWD}/${RPMBUILD_DIR}" \
            --define "_buildhost localhost" \
            --define "_clamp_mtime 1" \
            --define "_build_time ${SOURCE_DATE_EPOCH}" \
            --define "_buildtime ${SOURCE_DATE_EPOCH}" \
            --define "_source_date_epoch ${SOURCE_DATE_EPOCH}" \
            --define "_source_date_epoch_from_changelog 0" \
            --define "_binary_payload w9.gzdio" \
            --define "_source_payload w9.gzdio" \
            --define "_build_id_links none" \
            --define "__os_install_post %{nil}" \
            --target "${RPM_ARCH}" \
            -bb "$SPEC_FILE"
        find "$RPMBUILD_DIR/RPMS" -name "*.rpm" -exec cp {} "$OUTPUT_DIR/" \;
        for rpm_f in "$RPMBUILD_DIR/RPMS"/*/*.rpm; do
            if [ -f "$rpm_f" ]; then
                base_name=$(basename "$rpm_f")
                python3 tools/reproducible_rpm.py "$OUTPUT_DIR/$base_name" --epoch "$SOURCE_DATE_EPOCH"
            fi
        done
        echo "Created reproducible RPM package (${RPM_ARCH}) in $OUTPUT_DIR"
    done
else
    echo "==> rpmbuild not found on host, creating fallback RPM staging..."
    mkdir -p "$OUTPUT_DIR"
fi
