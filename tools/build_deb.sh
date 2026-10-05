#!/usr/bin/env bash
set -euo pipefail

PLUGIN_DIR="${1:-plugins/zfs-storage}"
RAW_VERSION="${2:-auto}"
OUTPUT_DIR="${3:-dist-debs}"

PLUGIN_NAME=$(basename "$PLUGIN_DIR")
PKG_NAME="cockpit-${PLUGIN_NAME}"
MANIFEST="${PLUGIN_DIR}/manifest.json"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATES_DIR="${SCRIPT_DIR}/templates"
POSTINST_TEMPLATE="${TEMPLATES_DIR}/postinst.sh"
PRERM_TEMPLATE="${TEMPLATES_DIR}/prerm.sh"

if [ -f "$MANIFEST" ]; then
    CUSTOM_NAME=$(python3 -c "import json; print(json.load(open('$MANIFEST')).get('name', ''))" 2>/dev/null || true)
    if [ -n "$CUSTOM_NAME" ]; then
        PKG_NAME="cockpit-${CUSTOM_NAME}"
    fi
fi

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

# Locate dpkg-deb
DPKG_DEB=""
if command -v dpkg-deb >/dev/null 2>&1; then
    DPKG_DEB=$(command -v dpkg-deb)
elif [ -x "/opt/homebrew/bin/dpkg-deb" ]; then
    DPKG_DEB="/opt/homebrew/bin/dpkg-deb"
elif [ -x "/usr/bin/dpkg-deb" ]; then
    DPKG_DEB="/usr/bin/dpkg-deb"
fi

if [ -n "$DPKG_DEB" ]; then
    echo "==> Using system $DPKG_DEB to build Debian package..."
    HELPER_DIR_NAME="cockpit-${PLUGIN_NAME}"
    if [ "$PLUGIN_NAME" = "zfs-storage" ]; then
        HELPER_DIR_NAME="cockpit-zfs"
    fi

    DEB_DEPENDS="cockpit-bridge | cockpit, python3"
    DEB_DESC="Cockpit plugin ${PLUGIN_NAME}"
    if [ "$PLUGIN_NAME" = "zfs-storage" ]; then
        DEB_DEPENDS="cockpit-bridge | cockpit, zfsutils-linux, python3, smartmontools"
        DEB_DESC="OpenZFS storage management plugin for Cockpit"
    elif [ "$PLUGIN_NAME" = "file-sharing" ]; then
        DEB_DEPENDS="cockpit-bridge | cockpit, python3, samba, nfs-kernel-server | nfs-common"
        DEB_DESC="SMB and NFS file sharing management plugin for Cockpit"
    elif [ "$PLUGIN_NAME" = "container-manager" ]; then
        DEB_DEPENDS="cockpit-bridge | cockpit, python3, openssl"
        DEB_DESC="Docker and Podman container management plugin for Cockpit"
    elif [ "$PLUGIN_NAME" = "code-server" ]; then
        DEB_DEPENDS="cockpit-bridge | cockpit, python3, code-server"
        DEB_DESC="VS Code Server plugin for Cockpit"
    fi

    if [ "$PLUGIN_NAME" = "code-server" ]; then
        ARCHS=("amd64" "arm64")
    else
        ARCHS=("all")
    fi

    for TARGET_ARCH in "${ARCHS[@]}"; do
        STAGE_DIR="build/deb-staging/${PKG_NAME}-${TARGET_ARCH}"
        rm -rf "$STAGE_DIR"
        mkdir -p "$STAGE_DIR/DEBIAN"
        mkdir -p "$STAGE_DIR/usr/share/cockpit/${PLUGIN_NAME}"
        mkdir -p "$STAGE_DIR/usr/libexec/${HELPER_DIR_NAME}"
        mkdir -p "$OUTPUT_DIR"

        # Control file
        cat << CONTROL_EOF > "$STAGE_DIR/DEBIAN/control"
Package: ${PKG_NAME}
Version: ${VERSION}
Section: admin
Priority: optional
Architecture: ${TARGET_ARCH}
Maintainer: Nils Stein <github.nstein@mailbox.org>
Depends: ${DEB_DEPENDS}
Homepage: https://github.com/mietzen/cockpit-plugins
Description: ${DEB_DESC}
CONTROL_EOF

    # Maintainer scripts
    sed \
        -e "s|@@HELPER_DIR_NAME@@|${HELPER_DIR_NAME}|g" \
        -e "s|@@PLUGIN_NAME@@|${PLUGIN_NAME}|g" \
        "${POSTINST_TEMPLATE}" > "$STAGE_DIR/DEBIAN/postinst"
    chmod 755 "$STAGE_DIR/DEBIAN/postinst"

    sed \
        -e "s|@@HELPER_DIR_NAME@@|${HELPER_DIR_NAME}|g" \
        -e "s|@@PLUGIN_NAME@@|${PLUGIN_NAME}|g" \
        "${PRERM_TEMPLATE}" > "$STAGE_DIR/DEBIAN/prerm"
    chmod 755 "$STAGE_DIR/DEBIAN/prerm"

    # Frontend assets
    if [ -d "${PLUGIN_DIR}/dist" ]; then
        cp -r "${PLUGIN_DIR}/dist/"* "$STAGE_DIR/usr/share/cockpit/${PLUGIN_NAME}/"
        rm -rf "$STAGE_DIR/usr/share/cockpit/${PLUGIN_NAME}/backend" || true
    fi
    if [ -f "${PLUGIN_DIR}/manifest.json" ]; then
        cp "${PLUGIN_DIR}/manifest.json" "$STAGE_DIR/usr/share/cockpit/${PLUGIN_NAME}/"
    fi
    if [ -f "${PLUGIN_DIR}/upstream.json" ]; then
        cp "${PLUGIN_DIR}/upstream.json" "$STAGE_DIR/usr/share/cockpit/${PLUGIN_NAME}/"
    fi

    # Packaging drop-in configurations (systemd, caddy, tmpfiles)
    if [ -d "${PLUGIN_DIR}/packaging" ]; then
        if [ -f "${PLUGIN_DIR}/packaging/systemd/10-code-server.conf" ]; then
            mkdir -p "$STAGE_DIR/etc/systemd/system/cockpit.socket.d"
            cp "${PLUGIN_DIR}/packaging/systemd/10-code-server.conf" "$STAGE_DIR/etc/systemd/system/cockpit.socket.d/"
        fi
        if [ -f "${PLUGIN_DIR}/packaging/systemd/cockpit-caddy.service" ]; then
            mkdir -p "$STAGE_DIR/etc/systemd/system"
            cp "${PLUGIN_DIR}/packaging/systemd/cockpit-caddy.service" "$STAGE_DIR/etc/systemd/system/"
        fi
        if [ -f "${PLUGIN_DIR}/packaging/caddy/Caddyfile" ]; then
            mkdir -p "$STAGE_DIR/etc/cockpit-code-server"
            cp "${PLUGIN_DIR}/packaging/caddy/Caddyfile" "$STAGE_DIR/etc/cockpit-code-server/"
        fi
        if [ -f "${PLUGIN_DIR}/packaging/tmpfiles/cockpit-code-server.conf" ]; then
            mkdir -p "$STAGE_DIR/usr/lib/tmpfiles.d"
            cp "${PLUGIN_DIR}/packaging/tmpfiles/cockpit-code-server.conf" "$STAGE_DIR/usr/lib/tmpfiles.d/"
        fi
    fi

    # Backend helper
    if [ -d "${PLUGIN_DIR}/backend" ]; then
        cp -r "${PLUGIN_DIR}/backend/"* "$STAGE_DIR/usr/libexec/${HELPER_DIR_NAME}/"
    fi

    # Shared common python library (packaged per-helper to prevent dpkg file conflicts)
    if [ -d "packages/common/python/cockpit_common" ]; then
        mkdir -p "$STAGE_DIR/usr/libexec/${HELPER_DIR_NAME}/cockpit_common"
        cp -r "packages/common/python/cockpit_common/"* "$STAGE_DIR/usr/libexec/${HELPER_DIR_NAME}/cockpit_common/"
    fi

    # Clean non-production test files and bytecode caches
    rm -rf "$STAGE_DIR/usr/libexec/${HELPER_DIR_NAME}/tests"
    find "$STAGE_DIR" -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null || true
    find "$STAGE_DIR" -name "*.pyc" -delete 2>/dev/null || true
    find "$STAGE_DIR" -name "*.pyo" -delete 2>/dev/null || true

        # Bundle caddy binary for code-server
        if [ "$PLUGIN_NAME" = "code-server" ]; then
            CADDY_VER=$(python3 -c "import json; print(next((p['version'] for p in json.load(open('${PLUGIN_DIR}/upstream.json'))['packages'] if p['name'] == 'caddy'), '2.11.7'))" 2>/dev/null || echo "2.11.7")
            ARCHIVE_FILE=""
            for c_dir in "build/archives" "dist-archives" "all-archives"; do
                if [ -f "${c_dir}/caddy_${CADDY_VER}_linux_${TARGET_ARCH}.tar.gz" ]; then
                    ARCHIVE_FILE="${c_dir}/caddy_${CADDY_VER}_linux_${TARGET_ARCH}.tar.gz"
                    break
                fi
            done
            if [ -z "$ARCHIVE_FILE" ] || [ ! -f "$ARCHIVE_FILE" ]; then
                python3 tools/download_upstream_packages.py --config "${PLUGIN_DIR}/upstream.json" --type tar.gz --archive-dir build/archives
                ARCHIVE_FILE="build/archives/caddy_${CADDY_VER}_linux_${TARGET_ARCH}.tar.gz"
            fi
            tar -xzf "$ARCHIVE_FILE" -C "$STAGE_DIR/usr/libexec/${HELPER_DIR_NAME}" caddy
            chmod 755 "$STAGE_DIR/usr/libexec/${HELPER_DIR_NAME}/caddy"
        fi

        # Fix permissions and timestamps for reproducible builds
        find "$STAGE_DIR" -type d -exec chmod 755 {} +
        find "$STAGE_DIR/usr" -type f -exec chmod 644 {} +
        find "$STAGE_DIR/usr/libexec/${HELPER_DIR_NAME}" -name "*.py" -exec chmod 755 {} + 2>/dev/null || true
        find "$STAGE_DIR/usr/libexec/${HELPER_DIR_NAME}" -name "caddy" -exec chmod 755 {} + 2>/dev/null || true
        find "$STAGE_DIR" -exec touch -d "@$SOURCE_DATE_EPOCH" {} + 2>/dev/null || find "$STAGE_DIR" -exec touch -t "$(date -r "$SOURCE_DATE_EPOCH" +%Y%m%d%H%M.%S 2>/dev/null || date -u -d "@$SOURCE_DATE_EPOCH" +%Y%m%d%H%M.%S)" {} + 2>/dev/null || true

        DEB_FILE="${OUTPUT_DIR}/${PKG_NAME}_${VERSION}_${TARGET_ARCH}.deb"
        "$DPKG_DEB" -Zgzip --uniform-compression --build --root-owner-group "$STAGE_DIR" "$DEB_FILE" 2>/dev/null || "$DPKG_DEB" -Zgzip --build --root-owner-group "$STAGE_DIR" "$DEB_FILE"
        echo "Created Debian package: $DEB_FILE"
    done
else
    echo "==> dpkg-deb not found on host, using python fallback..."
    python3 tools/build_deb.py "$PLUGIN_DIR" --output-dir "$OUTPUT_DIR" --version "$VERSION"
fi
