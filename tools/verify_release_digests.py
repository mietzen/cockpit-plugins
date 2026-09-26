#!/usr/bin/env python3
"""
Verification check and release gate for GitHub Pages deployment.
Ensures GitHub Pages APT/RPM repositories serve only published, immutable release packages.
"""
import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
from enum import Enum
from typing import Dict, List, Optional, Tuple

HASH_BUFFER_SIZE = 65536
DEFAULT_RELEASE_LIMIT = 50
KNOWN_PLUGINS = ["zfs-storage", "file-sharing", "container-manager"]


class TriggerType(Enum):
    TAG = "tag"
    BRANCH = "branch"


def compute_sha256(file_path: str) -> str:
    """Compute SHA256 digest of a local file."""
    sha = hashlib.sha256()
    with open(file_path, "rb") as f:
        while chunk := f.read(HASH_BUFFER_SIZE):
            sha.update(chunk)
    return sha.hexdigest()


def parse_pkg_info(filename: str) -> Tuple[str, str]:
    """Parse plugin name and version from package filename."""
    deb_match = re.match(r"^cockpit-(.+)_([0-9]+\.[0-9]+\.[0-9]+.*)_all\.deb$", filename)
    if deb_match:
        return deb_match.group(1), deb_match.group(2)

    rpm_match = re.match(r"^cockpit-(.+)-([0-9]+\.[0-9]+\.[0-9]+.*)-[0-9]+\.noarch\.rpm$", filename)
    if rpm_match:
        return rpm_match.group(1), rpm_match.group(2)

    return "", ""


def fetch_release_tags(limit: int = DEFAULT_RELEASE_LIMIT) -> List[str]:
    """Fetch published GitHub Release tag names in descending chronological order."""
    cmd = ["gh", "release", "list", "--limit", str(limit), "--json", "tagName,isDraft,isPrerelease"]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        return []

    try:
        data = json.loads(res.stdout)
        return [
            item["tagName"]
            for item in data
            if not item.get("isDraft", False) and not item.get("isPrerelease", False)
        ]
    except Exception:
        return []


def fetch_release_assets(tag: str) -> Dict[str, str]:
    """Fetch asset names and SHA256 digests for a given GitHub Release tag."""
    cmd = ["gh", "release", "view", tag, "--json", "assets"]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        return {}

    try:
        data = json.loads(res.stdout)
        return {
            asset["name"]: asset.get("digest", "").replace("sha256:", "").lower()
            for asset in data.get("assets", [])
            if "name" in asset
        }
    except Exception:
        return {}


def download_asset(tag: str, filename: str, dest_path: str) -> bool:
    """Download a specific asset from a GitHub Release tag."""
    cmd = ["gh", "release", "download", tag, "-p", filename, "-O", dest_path, "--clobber"]
    res = subprocess.run(cmd, capture_output=True, text=True)
    return res.returncode == 0


def find_latest_tag(plugin: str, tags: List[str]) -> Optional[str]:
    """Find the latest published release tag for a given plugin."""
    prefix = f"{plugin}-v"
    for tag in tags:
        if tag.startswith(prefix):
            return tag
    return None


def clean_mismatched(plugin: str, directory: str, ext: str) -> None:
    """Remove any existing files for the plugin that do not match the official release."""
    if not directory or not os.path.exists(directory):
        return

    for fname in os.listdir(directory):
        if fname.endswith(ext) and f"cockpit-{plugin}" in fname:
            fpath = os.path.join(directory, fname)
            try:
                os.remove(fpath)
            except OSError:
                pass


def sync_plugin_assets(
    plugin: str,
    tag: str,
    deb_dir: str,
    rpm_dir: str,
) -> bool:
    """Synchronize official deb and rpm assets for a published release tag."""
    assets = fetch_release_assets(tag)
    if not assets:
        print(f"  ✗ ERROR: No assets found in release tag {tag}")
        return False

    success = True

    # Synchronize deb packages
    for asset_name, expected_digest in assets.items():
        if asset_name.endswith(".deb"):
            dest_file = os.path.join(deb_dir, asset_name)
            local_valid = False
            if os.path.exists(dest_file):
                local_digest = compute_sha256(dest_file)
                if expected_digest and local_digest == expected_digest:
                    local_valid = True
                    print(f"  ✓ {asset_name}: Matches release {tag} digest ({local_digest[:16]}...)")

            if not local_valid:
                clean_mismatched(plugin, deb_dir, ".deb")
                print(f"  ↓ Downloading official release asset {asset_name} from {tag}...")
                if download_asset(tag, asset_name, dest_file):
                    actual_digest = compute_sha256(dest_file)
                    if expected_digest and actual_digest != expected_digest:
                        print(f"  ✗ Digest mismatch for downloaded {asset_name}")
                        success = False
                    else:
                        print(f"  ✓ Downloaded {asset_name} ({actual_digest[:16]}...)")
                else:
                    print(f"  ✗ Failed to download {asset_name} from {tag}")
                    success = False

        elif asset_name.endswith(".rpm"):
            dest_file = os.path.join(rpm_dir, asset_name)
            local_valid = False
            if os.path.exists(dest_file):
                local_digest = compute_sha256(dest_file)
                if expected_digest and local_digest == expected_digest:
                    local_valid = True
                    print(f"  ✓ {asset_name}: Matches release {tag} digest ({local_digest[:16]}...)")

            if not local_valid:
                clean_mismatched(plugin, rpm_dir, ".rpm")
                print(f"  ↓ Downloading official release asset {asset_name} from {tag}...")
                if download_asset(tag, asset_name, dest_file):
                    actual_digest = compute_sha256(dest_file)
                    if expected_digest and actual_digest != expected_digest:
                        print(f"  ✗ Digest mismatch for downloaded {asset_name}")
                        success = False
                    else:
                        print(f"  ✓ Downloaded {asset_name} ({actual_digest[:16]}...)")
                else:
                    print(f"  ✗ Failed to download {asset_name} from {tag}")
                    success = False

    return success


def sync_packages(
    deb_dir: str,
    rpm_dir: str,
    trigger_mode: TriggerType,
    current_tag: Optional[str] = None,
    plugins: Optional[List[str]] = None,
) -> bool:
    """Gating gate: verify and synchronize official release packages."""
    if plugins is None:
        plugins = KNOWN_PLUGINS

    os.makedirs(deb_dir, exist_ok=True)
    os.makedirs(rpm_dir, exist_ok=True)

    published_tags = fetch_release_tags()
    all_ok = True

    print(f"==> Release Gate Execution (Trigger: {trigger_mode.value.upper()}, Tag: {current_tag or 'None'})")

    for plugin in plugins:
        # If triggered by a tag matching this plugin, keep the freshly built artifact
        if trigger_mode == TriggerType.TAG and current_tag and current_tag.startswith(f"{plugin}-v"):
            print(f"  ★ Plugin {plugin}: Active tag release ({current_tag}). Preserving freshly built artifacts.")
            continue

        latest_tag = find_latest_tag(plugin, published_tags)
        if not latest_tag:
            print(f"  ℹ Plugin {plugin}: No published GitHub Release found. Discarding unreleased packages.")
            clean_mismatched(plugin, deb_dir, ".deb")
            clean_mismatched(plugin, rpm_dir, ".rpm")
            continue

        print(f"==> Processing plugin '{plugin}' against official release '{latest_tag}'...")
        if not sync_plugin_assets(plugin, latest_tag, deb_dir, rpm_dir):
            all_ok = False

    return all_ok


def main() -> None:
    parser = argparse.ArgumentParser(description="Verify and gate release packages for GitHub Pages deployment")
    parser.add_argument("--deb-dir", default="all-debs", help="Directory containing .deb packages")
    parser.add_argument("--rpm-dir", default="all-rpms", help="Directory containing .rpm packages")
    parser.add_argument("--current-tag", default=None, help="Current Git tag name if triggered by a tag release")
    parser.add_argument("--sync-assets", action="store_true", help="Sync official release assets if needed")
    args = parser.parse_args()

    ref_type_env = os.environ.get("GITHUB_REF_TYPE", "")
    ref_env = os.environ.get("GITHUB_REF", "")
    tag_name = args.current_tag or os.environ.get("GITHUB_REF_NAME", "")

    if ref_type_env == "tag" or ref_env.startswith("refs/tags/"):
        mode = TriggerType.TAG
    elif args.current_tag:
        mode = TriggerType.TAG
    else:
        mode = TriggerType.BRANCH
        tag_name = None

    success = sync_packages(
        deb_dir=args.deb_dir,
        rpm_dir=args.rpm_dir,
        trigger_mode=mode,
        current_tag=tag_name,
    )

    if not success:
        print("\n==> Package release gate FAILED. Deployment aborted.")
        sys.exit(1)

    print("\n==> Package release gate PASSED. Official release packages assembled.")


if __name__ == "__main__":
    main()
