#!/usr/bin/env python3
import argparse
import glob
import json
import os
import sys
import urllib.request
from typing import Any, Dict, List, Optional, Tuple

BUFFER_SIZE = 65536
DEFAULT_DEB_DIR = "all-debs"
DEFAULT_RPM_DIR = "all-rpms"
DEFAULT_ARCHIVE_DIR = "all-archives"
DEFAULT_ARCHS = ["amd64", "arm64"]
UPSTREAM_GLOB = "plugins/*/upstream.json"


def find_configs(root_dir: str = ".") -> List[str]:
    # Discover all plugin upstream configurations
    pattern = os.path.join(root_dir, UPSTREAM_GLOB)
    return sorted(glob.glob(pattern))


def load_config(config_path: str) -> Dict[str, Any]:
    # Parse declarative package config file
    with open(config_path, "r", encoding="utf-8") as f:
        return json.load(f)


def build_asset_list(
    package_config: Dict[str, Any],
    version_overrides: Optional[Dict[str, str]] = None,
) -> List[Tuple[str, str, str]]:
    # Resolve asset URLs and target filenames using configured version and arch
    results: List[Tuple[str, str, str]] = []
    overrides = version_overrides or {}

    for pkg in package_config.get("packages", []):
        name = pkg.get("name", "")
        version = overrides.get(name, pkg.get("version", ""))
        if not version:
            continue

        pkg_archs = pkg.get("archs", DEFAULT_ARCHS)

        for asset in pkg.get("assets", []):
            asset_type = asset.get("type", "generic").lower()
            raw_url = asset.get("url", "")
            raw_filename = asset.get("filename", "")
            target_archs = asset.get("archs", pkg_archs)

            if "${arch}" in raw_url or "${arch}" in raw_filename:
                for arch in target_archs:
                    url = raw_url.replace("${version}", version).replace("${arch}", arch)
                    filename = raw_filename.replace("${version}", version).replace("${arch}", arch)
                    results.append((asset_type, url, filename))
            else:
                url = raw_url.replace("${version}", version)
                filename = raw_filename.replace("${version}", version)
                results.append((asset_type, url, filename))

    return results


def download_file(url: str, dest_path: str) -> None:
    # Stream remote asset to temp file before atomic rename
    tmp_path = f"{dest_path}.tmp"
    req = urllib.request.Request(url, headers={"User-Agent": "cockpit-plugins-builder"})

    with urllib.request.urlopen(req) as resp, open(tmp_path, "wb") as out_file:
        while chunk := resp.read(BUFFER_SIZE):
            out_file.write(chunk)

    os.replace(tmp_path, dest_path)


def get_target_dir(
    asset_type: str,
    deb_dir: str,
    rpm_dir: str,
    archive_dir: str,
) -> str:
    # Map generic asset type to target directory
    if asset_type == "deb":
        return deb_dir
    if asset_type == "rpm":
        return rpm_dir
    return archive_dir


def sync_assets(
    assets: List[Tuple[str, str, str]],
    deb_dir: str,
    rpm_dir: str,
    archive_dir: str = DEFAULT_ARCHIVE_DIR,
) -> None:
    # Download pending upstream deb, rpm, and archive assets
    for asset_type, url, filename in assets:
        target_dir = get_target_dir(asset_type, deb_dir, rpm_dir, archive_dir)
        os.makedirs(target_dir, exist_ok=True)
        dest_path = os.path.join(target_dir, filename)

        if os.path.isfile(dest_path) and os.path.getsize(dest_path) > 0:
            print(f"  ✓ Upstream package exists: {filename}")
            continue

        print(f"  ↓ Downloading {filename} from {url}...")
        download_file(url, dest_path)
        print(f"  ✓ Downloaded {filename} ({os.path.getsize(dest_path)} bytes)")


def parse_overrides(raw_overrides: List[str]) -> Dict[str, str]:
    # Convert 'name=version' CLI arguments to dictionary
    result = {}
    for item in raw_overrides:
        if "=" in item:
            k, v = item.split("=", 1)
            result[k.strip()] = v.strip()
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description="Download upstream packages declared by plugins.")
    parser.add_argument("--config", action="append", help="Path to upstream.json (defaults to plugins/*/upstream.json)")
    parser.add_argument("--deb-dir", default=DEFAULT_DEB_DIR, help="Target directory for .deb packages")
    parser.add_argument("--rpm-dir", default=DEFAULT_RPM_DIR, help="Target directory for .rpm packages")
    parser.add_argument("--archive-dir", default=DEFAULT_ARCHIVE_DIR, help="Target directory for generic archives")
    parser.add_argument("--override", action="append", default=[], help="Version override (e.g. caddy=2.9.0)")
    args = parser.parse_args()

    configs = args.config or find_configs()
    if not configs:
        print("==> No upstream.json configurations found.")
        return

    overrides = parse_overrides(args.override)

    for config_path in configs:
        if not os.path.isfile(config_path):
            print(f"Warning: Config file not found: {config_path}", file=sys.stderr)
            continue

        print(f"==> Processing upstream packages from {config_path}...")
        cfg = load_config(config_path)
        assets = build_asset_list(cfg, overrides)
        sync_assets(assets, args.deb_dir, args.rpm_dir, args.archive_dir)

    print("==> All upstream packages synchronized successfully.")


if __name__ == "__main__":
    main()
