#!/usr/bin/env bash
set -euo pipefail

echo "========================================="
echo " Setting up Cockpit ZFS E2E Test Env     "
echo "========================================="

# 1. Install packages if on Debian/Ubuntu
if command -v apt-get &>/dev/null; then
    echo "==> Installing system packages (cockpit-ws, cockpit-bridge, cockpit-system, libpam-systemd, zfsutils-linux)..."
    export DEBIAN_FRONTEND=noninteractive
    sudo apt-get update -qq
    sudo apt-get install -y -qq --no-install-recommends cockpit-ws cockpit-bridge cockpit-system libpam-systemd zfsutils-linux smartmontools python3 util-linux curl
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

# 3. Create test user and configure Cockpit authentication
echo "==> Configuring users and authentication..."
if ! id "test-user" &>/dev/null; then
    sudo useradd -m -s /bin/bash test-user
fi
PASS_HASH=$(openssl passwd -6 "password")
sudo usermod -p "$PASS_HASH" test-user || true
echo "test-user:password" | sudo chpasswd || true
sudo passwd -u test-user || true
sudo usermod -aG sudo,adm test-user || true
sudo chage -d 20000 -m 0 -M 99999 -I -1 -E -1 test-user || true
echo "test-user ALL=(ALL) NOPASSWD:ALL" | sudo tee /etc/sudoers.d/test-user

# Also ensure runner user has known password
if id "runner" &>/dev/null; then
    sudo usermod -p "$PASS_HASH" runner || true
    echo "runner:password" | sudo chpasswd || true
    sudo passwd -u runner || true
    sudo usermod -aG sudo,adm runner || true
    sudo chage -d 20000 -m 0 -M 99999 -I -1 -E -1 runner || true
    echo "runner ALL=(ALL) NOPASSWD:ALL" | sudo tee /etc/sudoers.d/runner || true
fi

echo "Shadow entry verification:"
sudo grep -E "test-user|runner" /etc/shadow || true

# Configure Cockpit
sudo mkdir -p /etc/cockpit /etc/cockpit/ws-certs.d /etc/pam.d
cat << 'EOF' | sudo tee /etc/pam.d/cockpit
#%PAM-1.0
auth      requisite pam_nologin.so
auth      include   common-auth
account   include   common-account
password  include   common-password
session   required  pam_loginuid.so
session   include   common-session
EOF

cat << 'EOF' | sudo tee /etc/cockpit/cockpit.conf
[WebService]
AllowUnencrypted = true
Origins = https://127.0.0.1:9090 https://localhost:9090 http://127.0.0.1:9090 http://localhost:9090
EOF

# Pre-generate self-signed certificate to prevent missing sscg warning
if [ ! -f /etc/cockpit/ws-certs.d/0-self-signed.cert ]; then
    sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout /tmp/cockpit.key \
        -out /tmp/cockpit.crt \
        -subj "/CN=localhost" -batch
    sudo cat /tmp/cockpit.key /tmp/cockpit.crt | sudo tee /etc/cockpit/ws-certs.d/0-self-signed.cert >/dev/null
    sudo chmod 600 /etc/cockpit/ws-certs.d/0-self-signed.cert
    sudo rm -f /tmp/cockpit.key /tmp/cockpit.crt
fi

# 4. Install cockpit-zfs plugin
echo "==> Installing plugin..."
if ls dist-debs/*.deb 1> /dev/null 2>&1; then
    sudo dpkg -i dist-debs/*.deb || sudo apt-get install -f -y
else
    echo "No .deb found, installing directly via make..."
    sudo make -C plugins/zfs-storage install
fi

sudo chmod -R 755 /usr/share/cockpit/zfs-storage || true
sudo chmod -R 755 /usr/libexec/cockpit-zfs || true

# 5. Start Cockpit service
echo "==> Starting Cockpit service..."
sudo systemctl daemon-reload || true
sudo systemctl restart cockpit.socket cockpit.service || sudo systemctl restart cockpit || true

echo "==> Waiting for Cockpit on port 9090..."
for i in {1..15}; do
    if curl -sk https://127.0.0.1:9090 >/dev/null 2>&1; then
        echo "Cockpit is up and listening on port 9090!"
        break
    fi
    sleep 1
done

echo "E2E environment setup complete!"
