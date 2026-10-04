#!/usr/bin/env python3
import argparse
import enum
import os
import re
import sys
import urllib.request
from typing import List, Tuple

DEFAULT_DEB_DIR = "all-debs"
DEFAULT_RPM_DIR = "all-rpms"
BUFFER_SIZE = 65536


class PackageType(enum.Enum):
    DEB = "deb"
    RPM = "rpm"


def get_default_version() -> str:
    """Read default upstream version from service_manager.py."""
    svc_mgr = os.path.join(
        os.path.dirname(__file__),
        "..",
        "plugins",
        "code-server",
        "backend",
        "service_manager.py",
    )
    if os.path.isfile(svc_mgr):
        with open(svc_mgr, "r", encoding="utf-8") as f:
            match = re.search(r'CODE_SERVER_UPSTREAM_VERSION\s*=\s*"([^"]+)"', f.read())
            if match:
                return match.group(1)
    return "4.139.1"


DEFAULT_CADDY_VERSION = "2.8.4"


def get_upstream_urls(version: str, caddy_version: str = DEFAULT_CADDY_VERSION) -> List[Tuple[PackageType, str, str]]:
    """Build list of upstream package URLs with target filenames."""
    base_url = f"https://github.com/coder/code-server/releases/download/v{version}"
    caddy_base_url = f"https://github.com/caddyserver/caddy/releases/download/v{caddy_version}"
    return [
        (PackageType.DEB, f"{base_url}/code-server_{version}_amd64.deb", f"code-server_{version}_amd64.deb"),
        (PackageType.DEB, f"{base_url}/code-server_{version}_arm64.deb", f"code-server_{version}_arm64.deb"),
        (PackageType.RPM, f"{base_url}/code-server-{version}-amd64.rpm", f"code-server-{version}-amd64.rpm"),
        (PackageType.RPM, f"{base_url}/code-server-{version}-arm64.rpm", f"code-server-{version}-arm64.rpm"),
        (PackageType.DEB, f"{caddy_base_url}/caddy_{caddy_version}_linux_amd64.deb", f"caddy_{caddy_version}_linux_amd64.deb"),
        (PackageType.DEB, f"{caddy_base_url}/caddy_{caddy_version}_linux_arm64.deb", f"caddy_{caddy_version}_linux_arm64.deb"),
    ]


def download_file(url: str, dest_path: str) -> None:
    """Download remote asset to local destination path with atomic replace."""
    tmp_path = f"{dest_path}.tmp"
    req = urllib.request.Request(url, headers={"User-Agent": "cockpit-plugins-builder"})

    with urllib.request.urlopen(req) as resp, open(tmp_path, "wb") as out_file:
        while chunk := resp.read(BUFFER_SIZE):
            out_file.write(chunk)

    os.replace(tmp_path, dest_path)


def sync_packages(version: str, deb_dir: str, rpm_dir: str) -> None:
    """Download upstream deb and rpm packages to specified directories."""
    os.makedirs(deb_dir, exist_ok=True)
    os.makedirs(rpm_dir, exist_ok=True)

    items = get_upstream_urls(version)
    for pkg_type, url, filename in items:
        target_dir = deb_dir if pkg_type == PackageType.DEB else rpm_dir
        dest_path = os.path.join(target_dir, filename)

        if os.path.isfile(dest_path) and os.path.getsize(dest_path) > 0:
            print(f"  ✓ Upstream package exists: {filename}")
            continue

        print(f"  ↓ Downloading {filename} from {url}...")
        download_file(url, dest_path)
        print(f"  ✓ Downloaded {filename} ({os.path.getsize(dest_path)} bytes)")


def main() -> None:
    parser = argparse.ArgumentParser(description="Download official code-server upstream packages.")
    parser.add_argument("--version", default=get_default_version(), help="Upstream release version")
    parser.add_argument("--deb-dir", default=DEFAULT_DEB_DIR, help="Target directory for .deb packages")
    parser.add_argument("--rpm-dir", default=DEFAULT_RPM_DIR, help="Target directory for .rpm packages")
    args = parser.parse_args()

    print(f"==> Downloading upstream code-server packages v{args.version}...")
    sync_packages(args.version, args.deb_dir, args.rpm_dir)
    print("==> All upstream packages synchronized successfully.")


if __name__ == "__main__":
    main()
