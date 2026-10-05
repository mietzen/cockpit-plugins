#!/bin/sh
set -e

# Tear down code-server services and configuration on removal
if [ "@@PLUGIN_NAME@@" = "code-server" ]; then
    if [ -z "$1" ] || [ "$1" = "remove" ] || [ "$1" = "0" ]; then
        if [ -f /usr/local/bin/code ] && grep -q "exec code-server" /usr/local/bin/code 2>/dev/null; then
            rm -f /usr/local/bin/code
        fi
        if command -v systemctl >/dev/null 2>&1; then
            systemctl stop 'code-server@*.service' 2>/dev/null || true
            systemctl stop cockpit-caddy.service 2>/dev/null || true
            systemctl disable cockpit-caddy.service 2>/dev/null || true
        fi
        rm -f /etc/systemd/system/cockpit.socket.d/10-code-server.conf
        rm -f /etc/systemd/system/cockpit-caddy.service
        rm -rf /etc/cockpit-code-server
        rm -f /usr/lib/tmpfiles.d/cockpit-code-server.conf
        rm -rf /run/code-server
        if command -v systemctl >/dev/null 2>&1; then
            systemctl daemon-reload 2>/dev/null || true
            systemctl restart cockpit.socket 2>/dev/null || true
        fi
    fi
fi

exit 0
