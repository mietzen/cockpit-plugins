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
if [ -d /usr/libexec/${HELPER_DIR_NAME} ]; then
    chmod -R 755 /usr/libexec/${HELPER_DIR_NAME}
fi
if [ "${PLUGIN_NAME}" = "code-server" ]; then
    mkdir -p /run/code-server
    chmod 1777 /run/code-server
    if command -v systemd-tmpfiles >/dev/null 2>&1; then
        systemd-tmpfiles --create /usr/lib/tmpfiles.d/cockpit-code-server.conf 2>/dev/null || true
    fi

    if [ ! -f /etc/cockpit/ws-certs.d/0-self-signed.cert ] || [ ! -f /etc/cockpit/ws-certs.d/0-self-signed.key ]; then
        if command -v remotectl >/dev/null 2>&1; then
            remotectl certificate --ensure 2>/dev/null || true
        fi
        SYS_CERT=\$(find /etc/cockpit/ws-certs.d -name "*.cert" -o -name "*.crt" 2>/dev/null | sort -r | head -n 1)
        SYS_KEY=\$(find /etc/cockpit/ws-certs.d -name "*.key" 2>/dev/null | sort -r | head -n 1)
        if [ -n "\$SYS_CERT" ]; then
            if [ -z "\$SYS_KEY" ]; then
                SYS_KEY="\$SYS_CERT"
            fi
            if [ -n "\$SYS_CERT" ] && [ "\$SYS_CERT" != "/etc/cockpit/ws-certs.d/0-self-signed.cert" ]; then
                ln -sf "\$SYS_CERT" /etc/cockpit/ws-certs.d/0-self-signed.cert 2>/dev/null || true
            fi
            if [ -n "\$SYS_KEY" ] && [ "\$SYS_KEY" != "/etc/cockpit/ws-certs.d/0-self-signed.key" ]; then
                ln -sf "\$SYS_KEY" /etc/cockpit/ws-certs.d/0-self-signed.key 2>/dev/null || true
            fi
            chmod 600 /etc/cockpit/ws-certs.d/0-self-signed.cert /etc/cockpit/ws-certs.d/0-self-signed.key 2>/dev/null || true
        fi
    fi

    # Ensure cockpit.conf has reverse-proxy headers under [WebService]
    if [ -f /etc/cockpit/cockpit.conf ]; then
        if ! grep -q "^\\[WebService\\]" /etc/cockpit/cockpit.conf 2>/dev/null; then
            printf "\\n[WebService]\\nProtocolHeader = X-Forwarded-Proto\\nForwardedForHeader = X-Forwarded-For\\n" >> /etc/cockpit/cockpit.conf
        else
            if ! grep -q "^ProtocolHeader" /etc/cockpit/cockpit.conf 2>/dev/null; then
                sed -i -E "s|^\\[WebService\\]|[WebService]\\nProtocolHeader = X-Forwarded-Proto|" /etc/cockpit/cockpit.conf 2>/dev/null || true
            fi
            if ! grep -q "^ForwardedForHeader" /etc/cockpit/cockpit.conf 2>/dev/null; then
                sed -i -E "s|^\\[WebService\\]|[WebService]\\nForwardedForHeader = X-Forwarded-For|" /etc/cockpit/cockpit.conf 2>/dev/null || true
            fi
        fi
    else
        mkdir -p /etc/cockpit
        cat << 'COCKPIT_CONF_EOF' > /etc/cockpit/cockpit.conf
[WebService]
ProtocolHeader = X-Forwarded-Proto
ForwardedForHeader = X-Forwarded-For
COCKPIT_CONF_EOF
    fi

    if command -v systemctl >/dev/null 2>&1; then
        if systemctl list-unit-files caddy.service >/dev/null 2>&1; then
            if grep -q "Hello, world!" /etc/caddy/Caddyfile 2>/dev/null || grep -q "/usr/share/caddy" /etc/caddy/Caddyfile 2>/dev/null; then
                systemctl stop caddy.service 2>/dev/null || true
                systemctl disable caddy.service 2>/dev/null || true
                systemctl reset-failed caddy.service 2>/dev/null || true
            fi
        fi
        systemctl stop cockpit.socket 2>/dev/null || true
        systemctl daemon-reload 2>/dev/null || true
        systemctl start cockpit.socket 2>/dev/null || true
        systemctl enable --now cockpit-caddy.service 2>/dev/null || systemctl restart cockpit-caddy.service 2>/dev/null || true
    fi

    TARGET_USERS=\$(awk -F: '\$3 >= 1000 && \$3 < 65534 {print \$1}' /etc/passwd 2>/dev/null || true)
    for u in \${TARGET_USERS}; do
        if id "\$u" >/dev/null 2>&1; then
            U_HOME=\$(getent passwd "\$u" | cut -d: -f6)
            UID_NUM=\$(id -u "\$u" 2>/dev/null || echo 1000)
            if [ -n "\$U_HOME" ]; then
                CFG_DIR="\$U_HOME/.config/code-server"
                CFG="\$CFG_DIR/config.yaml"
                mkdir -p "\$CFG_DIR" 2>/dev/null || true

                if [ ! -f "\$CFG" ]; then
                    PASS_TOKEN=\$(python3 -c "import secrets; print(secrets.token_urlsafe(24))" 2>/dev/null || tr -dc 'A-Za-z0-9' < /dev/urandom | head -c 32)
                    printf "socket: /run/code-server/%s.sock\\nsocket-mode: 600\\nauth: password\\npassword: %s\\ncert: false\\napp-name: Code-Server\\ndisable-telemetry: true\\n" "\$UID_NUM" "\$PASS_TOKEN" > "\$CFG"
                else
                    sed -i -E "s|^bind-addr:.*|socket: /run/code-server/\${UID_NUM}.sock\\nsocket-mode: 600|" "\$CFG" 2>/dev/null || true
                    if grep -q "^socket:" "\$CFG" 2>/dev/null; then
                        sed -i -E "s|^socket:.*|socket: /run/code-server/\${UID_NUM}.sock|" "\$CFG" 2>/dev/null || true
                    else
                        printf "socket: /run/code-server/%s.sock\\nsocket-mode: 600\\n" "\$UID_NUM" >> "\$CFG"
                    fi
                    sed -i -E "s|^socket-mode:.*|socket-mode: 600|" "\$CFG" 2>/dev/null || true
                    if ! grep -q "^socket-mode:" "\$CFG" 2>/dev/null; then
                        echo "socket-mode: 600" >> "\$CFG"
                    fi
                    sed -i -E "s|^cert:.*|cert: false|" "\$CFG" 2>/dev/null || true
                    sed -i -E "s|^cert-key:.*||" "\$CFG" 2>/dev/null || true
                    if grep -qE "^auth:[[:space:]]*none" "\$CFG" 2>/dev/null; then
                        sed -i -E "s|^auth:.*|auth: password|" "\$CFG" 2>/dev/null || true
                    elif ! grep -q "^auth:" "\$CFG" 2>/dev/null; then
                        echo "auth: password" >> "\$CFG"
                    fi
                    if ! grep -qE "^(password|hashed-password):[[:space:]]*[^[:space:]]+" "\$CFG" 2>/dev/null; then
                        PASS_TOKEN=\$(python3 -c "import secrets; print(secrets.token_urlsafe(24))" 2>/dev/null || tr -dc 'A-Za-z0-9' < /dev/urandom | head -c 32)
                        sed -i -E "s|^password:.*||" "\$CFG" 2>/dev/null || true
                        echo "password: \$PASS_TOKEN" >> "\$CFG"
                    fi
                fi

                for p in ".config/code-server" ".local/share/code-server" ".cache/code-server"; do
                    if [ -d "\$U_HOME/\$p" ]; then
                        chown -R "\$u:\$u" "\$U_HOME/\$p" 2>/dev/null || true
                        chmod -R u+rwX "\$U_HOME/\$p" 2>/dev/null || true
                    fi
                done
                rm -f "/run/code-server/\${UID_NUM}.sock" 2>/dev/null || true
            fi
            systemctl enable "code-server@\${u}.service" 2>/dev/null || true
            systemctl restart "code-server@\${u}.service" 2>/dev/null || true
        fi
    done
    CODE_BIN=\$(command -v code-server 2>/dev/null || true)
    if [ -n "\$CODE_BIN" ]; then
        mkdir -p /usr/local/bin
        cat << 'CODE_WRAPPER_EOF' > /usr/local/bin/code
#!/bin/sh
exec code-server "\$@"
CODE_WRAPPER_EOF
        chmod 755 /usr/local/bin/code
    fi
fi

%preun
if [ "${PLUGIN_NAME}" = "code-server" ]; then
    if [ "\$1" -eq 0 ]; then
        if [ -f /usr/local/bin/code ] && grep -q "exec code-server" /usr/local/bin/code 2>/dev/null; then
            rm -f /usr/local/bin/code
        fi
        if command -v systemctl >/dev/null 2>&1; then
            systemctl stop cockpit-caddy.service 2>/dev/null || true
            systemctl disable cockpit-caddy.service 2>/dev/null || true
        fi
        rm -f /etc/systemd/system/cockpit.socket.d/10-code-server.conf
        rm -f /etc/systemd/system/cockpit-caddy.service
        rm -rf /etc/cockpit-code-server
        rm -f /usr/lib/tmpfiles.d/cockpit-code-server.conf
        if command -v systemctl >/dev/null 2>&1; then
            systemctl daemon-reload 2>/dev/null || true
            systemctl restart cockpit.socket 2>/dev/null || true
        fi
    fi
fi

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
