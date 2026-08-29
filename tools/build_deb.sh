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
        DEB_DESC="Advanced OpenZFS storage manager for Cockpit.\n Manage ZFS pools, datasets, zvols, snapshots, scrubs, trims,\n and SMART disk health with PatternFly v5 UI."
    elif [ "$PLUGIN_NAME" = "file-sharing" ]; then
        DEB_DEPENDS="cockpit-bridge | cockpit, python3, samba, nfs-kernel-server | nfs-common"
        DEB_DESC="Advanced SMB (Samba) and NFS file sharing manager for Cockpit.\n Manage Samba shares, NFS exports, Samba users, permissions matrix,\n and live client connection monitoring with PatternFly v5 UI."
    fi

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
        cp -r "${PLUGIN_DIR}/backend/"* "$STAGE_DIR/usr/libexec/${HELPER_DIR_NAME}/"
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
