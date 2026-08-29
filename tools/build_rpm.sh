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

# Set SOURCE_DATE_EPOCH for reproducible builds
if [ -z "${SOURCE_DATE_EPOCH:-}" ]; then
    SOURCE_DATE_EPOCH=$(git log -1 --pretty=%ct "$PLUGIN_DIR" 2>/dev/null || true)
    if [ -z "$SOURCE_DATE_EPOCH" ]; then
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

    SPEC_FILE="$RPMBUILD_DIR/SPECS/${PKG_NAME}.spec"
    cat << SPEC_EOF > "$SPEC_FILE"
%define _buildhost localhost
%define _build_id_links none
%define _clamp_mtime 1
%define _build_time ${SOURCE_DATE_EPOCH}
%define _buildtime ${SOURCE_DATE_EPOCH}
%define _source_date_epoch ${SOURCE_DATE_EPOCH}
%define _binary_payload w9.gzdio
%define _source_payload w9.gzdio

Name:           ${PKG_NAME}
Version:        ${VERSION}
Release:        1
Summary:        Advanced OpenZFS storage manager for Cockpit
BuildArch:      noarch
License:        MIT
URL:            https://github.com/mietzen/cockpit-plugins
Requires:       cockpit-bridge, python3

%description
Advanced OpenZFS storage manager for Cockpit.
Manage ZFS pools, datasets, zvols, snapshots, scrubs, trims,
and SMART disk health with PatternFly v5 UI.

%prep

%build

%install
rm -rf %{buildroot}
mkdir -p %{buildroot}/usr/share/cockpit/${PLUGIN_NAME}
mkdir -p %{buildroot}/usr/libexec/cockpit-zfs

if [ -d "${PWD}/${PLUGIN_DIR}/dist" ]; then
    cp -r "${PWD}/${PLUGIN_DIR}/dist/"* %{buildroot}/usr/share/cockpit/${PLUGIN_NAME}/
    rm -rf %{buildroot}/usr/share/cockpit/${PLUGIN_NAME}/backend || true
fi
if [ -f "${PWD}/${PLUGIN_DIR}/manifest.json" ]; then
    cp "${PWD}/${PLUGIN_DIR}/manifest.json" %{buildroot}/usr/share/cockpit/${PLUGIN_NAME}/
fi
if [ -d "${PWD}/${PLUGIN_DIR}/backend" ]; then
    cp -r "${PWD}/${PLUGIN_DIR}/backend/"* %{buildroot}/usr/libexec/cockpit-zfs/
fi
rm -rf %{buildroot}/usr/libexec/cockpit-zfs/tests
find %{buildroot} -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null || true
find %{buildroot} -name "*.pyc" -delete 2>/dev/null || true
find %{buildroot} -name "*.pyo" -delete 2>/dev/null || true
chmod 755 %{buildroot}/usr/libexec/cockpit-zfs/zfs_helper.py 2>/dev/null || true
find %{buildroot} -exec touch -d "@${SOURCE_DATE_EPOCH}" {} + 2>/dev/null || true

%clean
rm -rf %{buildroot}

%files
%defattr(-,root,root,-)
/usr/share/cockpit/${PLUGIN_NAME}
/usr/libexec/cockpit-zfs

%changelog
* ${CHANGELOG_DATE} Nils Stein <nils@mietzen.de> - ${VERSION}-1
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
        -bb "$SPEC_FILE"
    find "$RPMBUILD_DIR/RPMS" -name "*.rpm" -exec cp {} "$OUTPUT_DIR/" \;
    for rpm_f in "$OUTPUT_DIR"/*.rpm; do
        if [ -f "$rpm_f" ]; then
            python3 tools/reproducible_rpm.py "$rpm_f" --epoch "$SOURCE_DATE_EPOCH"
        fi
    done
    echo "Created reproducible RPM package in $OUTPUT_DIR"
else
    echo "==> rpmbuild not found on host, creating fallback RPM staging..."
    mkdir -p "$OUTPUT_DIR"
fi
