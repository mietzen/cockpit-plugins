#!/usr/bin/env bash
set -euo pipefail

echo "========================================="
echo " Setting up Container Manager Test Env   "
echo "========================================="

# 1. Install packages if on Debian/Ubuntu
if command -v apt-get &>/dev/null; then
    echo "==> Installing system packages (cockpit, docker/podman, openssl)..."
    export DEBIAN_FRONTEND=noninteractive
    sudo apt-get update -qq
    sudo apt-get install -y -qq --no-install-recommends cockpit-ws cockpit-bridge cockpit-system libpam-systemd python3 openssl docker.io || true
fi

# 2. Configure Cockpit
sudo mkdir -p /etc/cockpit
cat << 'EOF' | sudo tee /etc/cockpit/cockpit.conf
[WebService]
AllowUnencrypted = true
AuthTypes = password
MaxStartups = 50

[Session]
IdleTimeout = 0
EOF

sudo systemctl daemon-reload || true
sudo systemctl restart docker.service || true
sudo systemctl restart cockpit.socket || true
sudo systemctl restart cockpit.service || true

# 3. Create test fixtures (images, containers, volumes, networks)
ENGINE="docker"
if ! command -v docker &>/dev/null; then
    if command -v podman &>/dev/null; then
        ENGINE="podman"
    fi
fi

echo "==> Using container engine: $ENGINE"

if command -v "$ENGINE" &>/dev/null; then
    # Pull lightweight image
    sudo "$ENGINE" pull alpine:latest || true

    # Create running container
    sudo "$ENGINE" rm -f e2e-web e2e-stopped 2>/dev/null || true
    sudo "$ENGINE" run -d --name e2e-web -p 8081:80 alpine:latest sh -c "while true; do echo 'server live'; sleep 10; done" || true

    # Create stopped container
    sudo "$ENGINE" create --name e2e-stopped alpine:latest echo "finished" || true

    # Create volume
    sudo "$ENGINE" volume create e2e-data-volume || true

    # Create network
    sudo "$ENGINE" network create e2e-custom-net || true
fi

echo "==> Container Manager test environment ready."
