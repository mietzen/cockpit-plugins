#!/usr/bin/env bash
set -euo pipefail

echo "========================================="
echo " Setting up Cockpit ZFS E2E Test Env     "
echo "========================================="

# 1. Install packages if on Debian/Ubuntu
if command -v apt-get &>/dev/null; then
    echo "==> Installing system packages (cockpit, zfsutils-linux, smartmontools)..."
    export DEBIAN_FRONTEND=noninteractive
    sudo apt-get update -qq
    sudo apt-get install -y -qq cockpit zfsutils-linux smartmontools python3 util-linux curl
fi

# 2. Setup virtual loop disks for ZFS testing
echo "==> Setting up loop disk images..."
sudo mkdir -p /tmp/zfs-test-disks
for i in {1..4}; do
    img="/tmp/zfs-test-disks/disk${i}.img"
    if [ ! -f "$img" ]; then
        sudo truncate -s 2G "$img"
    fi
    # Attach loop device if not already attached
    if ! sudo losetup -j "$img" | grep -q "loop"; then
        sudo losetup -f "$img"
    fi
done

echo "Attached loop devices:"
sudo losetup -a

# 3. Create test user for Cockpit web UI authentication
echo "==> Creating test-user..."
if ! id "test-user" &>/dev/null; then
    sudo useradd -m -s /bin/bash test-user
fi
echo "test-user:password" | sudo chpasswd
echo "test-user ALL=(ALL) NOPASSWD:ALL" | sudo tee /etc/sudoers.d/test-user

# 4. Install cockpit-zfs plugin
echo "==> Installing plugin..."
if ls dist-debs/*.deb 1> /dev/null 2>&1; then
    sudo dpkg -i dist-debs/*.deb || sudo apt-get install -f -y
else
    echo "No .deb found, installing directly via make..."
    sudo make -C zfs-storage install
fi

# 5. Start Cockpit service
echo "==> Starting Cockpit service..."
sudo systemctl daemon-reload || true
sudo systemctl restart cockpit.socket || sudo systemctl restart cockpit || true

echo "==> Waiting for Cockpit on port 9090..."
for i in {1..15}; do
    if curl -sk https://127.0.0.1:9090 >/dev/null 2>&1; then
        echo "Cockpit is up and listening on port 9090!"
        break
    fi
    sleep 1
done

echo "E2E environment setup complete!"
