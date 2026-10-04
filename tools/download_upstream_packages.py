#!/usr/bin/env python3
import argparse
import enum
import glob
import json
import os
import sys
import urllib.request
from typing import Any, Dict, List, Optional, Tuple

BUFFER_SIZE = 65536
DEFAULT_DEB_DIR = "all-debs"
DEFAULT_RPM_DIR = "all-rpms"
UPSTREAM_GLOB = "plugins/*/upstream.json"


class AssetType(enum.Enum):
    DEB = "deb"
    RPM = "rpm"


def find_configs(root_dir: str = ".") -> List[str]:
    # Discover all plugin upstream configurations
    pattern = os.path.join(root_dir, UPSTREAM_GLOB)
    configs = sorted(glob.glob(pattern))
    return configs


def load_config(config_path: str) -> Dict[str, Any]:
    # Parse declarative package config file
    with open(config_path, "r", encoding="utf-8") as f:
        return json.load(f)


def build_asset_list(
    package_config: Dict[str, Any],
    version_overrides: Optional[Dict[str, str]] = None,
) -> List[Tuple[AssetType, str, str]]:
    # Resolve asset URLs and target filenames using configured version
    results: List[Tuple[AssetType, str, str]] = []
    overrides = version_overrides or {}

    for pkg in package_config.get("packages", []):
        name = pkg.get("name", "")
        version = overrides.get(name, pkg.get("version", ""))
        if not version:
            continue

        for asset in pkg.get("assets", []):
            asset_type_str = asset.get("type", "").lower()
            try:
                asset_type = AssetType(asset_type_str)
            except ValueError:
                continue

            raw_url = asset.get("url", "")
            raw_filename = asset.get("filename", "")
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


def sync_assets(
    assets: List[Tuple[AssetType, str, str]],
    deb_dir: str,
    rpm_dir: str,
) -> None:
    # Download pending upstream deb and rpm packages
    os.makedirs(deb_dir, exist_ok=True)
    os.makedirs(rpm_dir, exist_ok=True)

    for asset_type, url, filename in assets:
        target_dir = deb_dir if asset_type == AssetType.DEB else rpm_dir
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
        sync_assets(assets, args.deb_dir, args.rpm_dir)

    print("==> All upstream packages synchronized successfully.")


if __name__ == "__main__":
    main()
