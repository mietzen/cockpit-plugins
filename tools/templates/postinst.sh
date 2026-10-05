#!/bin/sh
set -e

# Ensure helper scripts have execution permissions
if [ -d /usr/libexec/@@HELPER_DIR_NAME@@ ]; then
    chmod -R 755 /usr/libexec/@@HELPER_DIR_NAME@@
fi

# Configure code-server plugin environment and certificates
if [ "@@PLUGIN_NAME@@" = "code-server" ]; then
    mkdir -p /run/code-server
    chmod 1777 /run/code-server
    if command -v systemd-tmpfiles >/dev/null 2>&1; then
        systemd-tmpfiles --create /usr/lib/tmpfiles.d/cockpit-code-server.conf 2>/dev/null || true
    fi

    if [ ! -f /etc/cockpit/ws-certs.d/0-self-signed.cert ] || [ ! -f /etc/cockpit/ws-certs.d/0-self-signed.key ]; then
        if command -v remotectl >/dev/null 2>&1; then
            remotectl certificate --ensure 2>/dev/null || true
        fi
        SYS_CERT=$(find /etc/cockpit/ws-certs.d -name "*.cert" -o -name "*.crt" 2>/dev/null | sort -r | head -n 1)
        SYS_KEY=$(find /etc/cockpit/ws-certs.d -name "*.key" 2>/dev/null | sort -r | head -n 1)
        if [ -n "$SYS_CERT" ]; then
            if [ -z "$SYS_KEY" ]; then
                SYS_KEY="$SYS_CERT"
            fi
            if [ -n "$SYS_CERT" ] && [ "$SYS_CERT" != "/etc/cockpit/ws-certs.d/0-self-signed.cert" ]; then
                ln -sf "$SYS_CERT" /etc/cockpit/ws-certs.d/0-self-signed.cert 2>/dev/null || true
            fi
            if [ -n "$SYS_KEY" ] && [ "$SYS_KEY" != "/etc/cockpit/ws-certs.d/0-self-signed.key" ]; then
                ln -sf "$SYS_KEY" /etc/cockpit/ws-certs.d/0-self-signed.key 2>/dev/null || true
            fi
            chmod 600 /etc/cockpit/ws-certs.d/0-self-signed.cert /etc/cockpit/ws-certs.d/0-self-signed.key 2>/dev/null || true
        fi
    fi

    # Ensure cockpit.conf has reverse-proxy headers under [WebService]
    if [ -f /etc/cockpit/cockpit.conf ]; then
        if ! grep -q "^\\[WebService\\]" /etc/cockpit/cockpit.conf 2>/dev/null; then
            printf "\n[WebService]\nProtocolHeader = X-Forwarded-Proto\nForwardedForHeader = X-Forwarded-For\n" >> /etc/cockpit/cockpit.conf
        else
            if ! grep -q "^ProtocolHeader" /etc/cockpit/cockpit.conf 2>/dev/null; then
                sed -i -E "s|^\\[WebService\\]|[WebService]\nProtocolHeader = X-Forwarded-Proto|" /etc/cockpit/cockpit.conf 2>/dev/null || true
            fi
            if ! grep -q "^ForwardedForHeader" /etc/cockpit/cockpit.conf 2>/dev/null; then
                sed -i -E "s|^\\[WebService\\]|[WebService]\nForwardedForHeader = X-Forwarded-For|" /etc/cockpit/cockpit.conf 2>/dev/null || true
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

    CODE_BIN=$(command -v code-server 2>/dev/null || true)
    if [ -n "$CODE_BIN" ]; then
        mkdir -p /usr/local/bin
        cat << 'CODE_WRAPPER_EOF' > /usr/local/bin/code
#!/bin/sh
exec code-server "$@"
CODE_WRAPPER_EOF
        chmod 755 /usr/local/bin/code
    fi
fi

exit 0
