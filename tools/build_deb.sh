#!/usr/bin/env bash
set -euo pipefail

PLUGIN_DIR="${1:-plugins/zfs-storage}"
RAW_VERSION="${2:-auto}"
OUTPUT_DIR="${3:-dist-debs}"

PLUGIN_NAME=$(basename "$PLUGIN_DIR")
PKG_NAME="cockpit-${PLUGIN_NAME}"
MANIFEST="${PLUGIN_DIR}/manifest.json"

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
    STAGE_DIR="build/deb-staging/${PKG_NAME}"
    rm -rf "$STAGE_DIR"
    mkdir -p "$STAGE_DIR/DEBIAN"
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
        DEB_DEPENDS="cockpit-bridge | cockpit, python3, code-server, caddy"
        DEB_DESC="VS Code Server plugin for Cockpit"
    fi

    mkdir -p "$STAGE_DIR/usr/share/cockpit/${PLUGIN_NAME}"
    mkdir -p "$STAGE_DIR/usr/libexec/${HELPER_DIR_NAME}"
    mkdir -p "$OUTPUT_DIR"

    # Control file
    cat << CONTROL_EOF > "$STAGE_DIR/DEBIAN/control"
Package: ${PKG_NAME}
Version: ${VERSION}
Section: admin
Priority: optional
Architecture: all
Maintainer: Nils Stein <github.nstein@mailbox.org>
Depends: ${DEB_DEPENDS}
Homepage: https://github.com/mietzen/cockpit-plugins
Description: ${DEB_DESC}
CONTROL_EOF

    # Maintainer scripts
    cat << POSTINST_EOF > "$STAGE_DIR/DEBIAN/postinst"
#!/bin/sh
set -e
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
        if [ -n "\$SYS_CERT" ] && [ -n "\$SYS_KEY" ]; then
            ln -sf "\$SYS_CERT" /etc/cockpit/ws-certs.d/0-self-signed.cert 2>/dev/null || true
            ln -sf "\$SYS_KEY" /etc/cockpit/ws-certs.d/0-self-signed.key 2>/dev/null || true
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
        if systemctl is-active caddy.service >/dev/null 2>&1; then
            if grep -q "Hello, world!" /etc/caddy/Caddyfile 2>/dev/null || grep -q "/usr/share/caddy" /etc/caddy/Caddyfile 2>/dev/null; then
                systemctl stop caddy.service 2>/dev/null || true
                systemctl disable caddy.service 2>/dev/null || true
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
                    printf "socket: /run/code-server/%s.sock\\nsocket-mode: 600\\nauth: none\\ncert: false\\napp-name: Code-Server\\ndisable-telemetry: true\\n" "\$UID_NUM" > "\$CFG"
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
                fi

                for p in ".config/code-server" ".local/share/code-server" ".cache/code-server"; do
                    if [ -d "\$U_HOME/\$p" ]; then
                        chown -R "\$u:\$u" "\$U_HOME/\$p" 2>/dev/null || true
                        chmod -R u+rwX "\$U_HOME/\$p" 2>/dev/null || true
                    fi
                done
            fi
            systemctl enable --now "code-server@\${u}.service" 2>/dev/null || true
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
exit 0
POSTINST_EOF
    chmod 755 "$STAGE_DIR/DEBIAN/postinst"

    cat << PRERM_EOF > "$STAGE_DIR/DEBIAN/prerm"
#!/bin/sh
set -e
if [ "${PLUGIN_NAME}" = "code-server" ]; then
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
exit 0
PRERM_EOF
    chmod 755 "$STAGE_DIR/DEBIAN/prerm"

    # Frontend assets
    if [ -d "${PLUGIN_DIR}/dist" ]; then
        cp -r "${PLUGIN_DIR}/dist/"* "$STAGE_DIR/usr/share/cockpit/${PLUGIN_NAME}/"
        rm -rf "$STAGE_DIR/usr/share/cockpit/${PLUGIN_NAME}/backend" || true
    fi
    if [ -f "${PLUGIN_DIR}/manifest.json" ]; then
        cp "${PLUGIN_DIR}/manifest.json" "$STAGE_DIR/usr/share/cockpit/${PLUGIN_NAME}/"
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

    # Fix permissions and timestamps for reproducible builds
    find "$STAGE_DIR" -type d -exec chmod 755 {} +
    find "$STAGE_DIR/usr" -type f -exec chmod 644 {} +
    find "$STAGE_DIR/usr/libexec/${HELPER_DIR_NAME}" -name "*.py" -exec chmod 755 {} + 2>/dev/null || true
    find "$STAGE_DIR" -exec touch -d "@$SOURCE_DATE_EPOCH" {} + 2>/dev/null || find "$STAGE_DIR" -exec touch -t "$(date -r "$SOURCE_DATE_EPOCH" +%Y%m%d%H%M.%S 2>/dev/null || date -u -d "@$SOURCE_DATE_EPOCH" +%Y%m%d%H%M.%S)" {} + 2>/dev/null || true

    DEB_FILE="${OUTPUT_DIR}/${PKG_NAME}_${VERSION}_all.deb"
    "$DPKG_DEB" -Zgzip --uniform-compression --build --root-owner-group "$STAGE_DIR" "$DEB_FILE" 2>/dev/null || "$DPKG_DEB" -Zgzip --build --root-owner-group "$STAGE_DIR" "$DEB_FILE"
    echo "Created Debian package: $DEB_FILE"
else
    echo "==> dpkg-deb not found on host, using python fallback..."
    python3 tools/build_deb.py "$PLUGIN_DIR" --output-dir "$OUTPUT_DIR" --version "$VERSION"
fi
