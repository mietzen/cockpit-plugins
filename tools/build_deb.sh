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
    GIT_TAG="${GITHUB_REF_NAME:-$(git describe --tags --exact-match 2>/dev/null || true)}"
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
    mkdir -p "$STAGE_DIR/usr/share/cockpit/${PLUGIN_NAME}"
    mkdir -p "$STAGE_DIR/usr/libexec/cockpit-zfs"
    mkdir -p "$OUTPUT_DIR"

    # Control file
    cat << CONTROL_EOF > "$STAGE_DIR/DEBIAN/control"
Package: ${PKG_NAME}
Version: ${VERSION}
Section: admin
Priority: optional
Architecture: all
Maintainer: Nils Stein <nils@mietzen.de>
Depends: cockpit-bridge | cockpit, zfsutils-linux, python3, smartmontools
Homepage: https://github.com/mietzen/cockpit-plugins
Description: Advanced OpenZFS storage manager for Cockpit.
 Manage ZFS pools, datasets, zvols, snapshots, scrubs, trims,
 and SMART disk health with PatternFly v5 UI.
CONTROL_EOF

    # Maintainer scripts
    cat << 'POSTINST_EOF' > "$STAGE_DIR/DEBIAN/postinst"
#!/bin/sh
set -e
if [ -f /usr/libexec/cockpit-zfs/zfs_helper.py ]; then
    chmod +x /usr/libexec/cockpit-zfs/zfs_helper.py
fi
exit 0
POSTINST_EOF
    chmod 755 "$STAGE_DIR/DEBIAN/postinst"

    cat << 'PRERM_EOF' > "$STAGE_DIR/DEBIAN/prerm"
#!/bin/sh
set -e
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

    # Backend helper
    if [ -d "${PLUGIN_DIR}/backend" ]; then
        cp -r "${PLUGIN_DIR}/backend/"* "$STAGE_DIR/usr/libexec/cockpit-zfs/"
    fi

    # Fix permissions
    find "$STAGE_DIR/usr" -type d -exec chmod 755 {} +
    find "$STAGE_DIR/usr" -type f -exec chmod 644 {} +
    if [ -f "$STAGE_DIR/usr/libexec/cockpit-zfs/zfs_helper.py" ]; then
        chmod 755 "$STAGE_DIR/usr/libexec/cockpit-zfs/zfs_helper.py"
    fi

    DEB_FILE="${OUTPUT_DIR}/${PKG_NAME}_${VERSION}_all.deb"
    "$DPKG_DEB" -Zgzip --build --root-owner-group "$STAGE_DIR" "$DEB_FILE"
    echo "Created Debian package: $DEB_FILE"
else
    echo "==> dpkg-deb not found on host, using python fallback..."
    python3 tools/build_deb.py "$PLUGIN_DIR" --output-dir "$OUTPUT_DIR" --version "$VERSION"
fi
