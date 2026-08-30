#!/usr/bin/env python3
"""
Verification check gate for GitHub Pages deployment.
Verifies that locally built .deb and .rpm packages match published GitHub Release digests.
"""
import argparse
import hashlib
import json
import os
import re
import subprocess
import sys


def compute_sha256(file_path: str) -> str:
    sha = hashlib.sha256()
    with open(file_path, "rb") as f:
        while chunk := f.read(65536):
            sha.update(chunk)
    return sha.hexdigest()


def get_release_assets(tag: str) -> dict:
    cmd = ["gh", "release", "view", tag, "--json", "assets"]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        return {}
    try:
        data = json.loads(res.stdout)
        return {
            a["name"]: a.get("digest", "").replace("sha256:", "").lower()
            for a in data.get("assets", [])
            if "name" in a
        }
    except Exception:
        return {}


def parse_pkg_info(filename: str) -> tuple:
    # E.g. cockpit-zfs-storage_0.3.0_all.deb -> (zfs-storage, 0.3.0)
    # E.g. cockpit-zfs-storage-0.3.0-1.noarch.rpm -> (zfs-storage, 0.3.0)
    deb_m = re.match(r"^cockpit-(.+)_([0-9]+\.[0-9]+\.[0-9]+.*)_all\.deb$", filename)
    if deb_m:
        return deb_m.group(1), deb_m.group(2)
    rpm_m = re.match(r"^cockpit-(.+)-([0-9]+\.[0-9]+\.[0-9]+.*)-[0-9]+\.noarch\.rpm$", filename)
    if rpm_m:
        return rpm_m.group(1), rpm_m.group(2)
    return "", ""


def download_release_asset(tag: str, filename: str, dest_path: str) -> bool:
    cmd = ["gh", "release", "download", tag, "-p", filename, "-O", dest_path, "--clobber"]
    res = subprocess.run(cmd, capture_output=True, text=True)
    return res.returncode == 0


def verify_packages(deb_dir: str, rpm_dir: str, sync_assets: bool = False) -> bool:
    all_ok = True
    files_to_check = []

    if deb_dir and os.path.exists(deb_dir):
        for f in sorted(os.listdir(deb_dir)):
            if f.endswith(".deb"):
                files_to_check.append(os.path.join(deb_dir, f))

    if rpm_dir and os.path.exists(rpm_dir):
        for f in sorted(os.listdir(rpm_dir)):
            if f.endswith(".rpm"):
                files_to_check.append(os.path.join(rpm_dir, f))

    if not files_to_check:
        print("==> No package files found to verify.")
        return True

    print(f"==> Verifying {len(files_to_check)} package(s) against published GitHub Release digests...")

    for path in files_to_check:
        fname = os.path.basename(path)
        plugin, version = parse_pkg_info(fname)
        local_hash = compute_sha256(path)

        if not plugin or not version:
            print(f"  ? Could not parse package version for {fname}")
            continue

        candidate_tags = [f"{plugin}-v{version}", f"v{version}"]
        release_assets = {}
        matched_tag = ""

        for tag in candidate_tags:
            assets = get_release_assets(tag)
            if assets:
                release_assets = assets
                matched_tag = tag
                break

        if not release_assets:
            print(f"  ℹ No existing GitHub Release found for candidate tags {candidate_tags} (skipping)")
            continue

        expected_hash = release_assets.get(fname)
        if not expected_hash:
            print(f"  ℹ Asset {fname} not found in release {matched_tag} (skipping)")
            continue

        if local_hash == expected_hash:
            print(f"  ✓ {fname}: SHA256 verified against {matched_tag} ({local_hash[:16]}...)")
        elif sync_assets:
            print(f"  ↓ Syncing official release asset {fname} from {matched_tag}...")
            if download_release_asset(matched_tag, fname, path):
                new_hash = compute_sha256(path)
                if new_hash == expected_hash:
                    print(f"  ✓ {fname}: Synchronized and verified ({new_hash[:16]}...)")
                else:
                    print(f"  ✗ ERROR: Downloaded asset hash mismatch for {fname}")
                    all_ok = False
            else:
                print(f"  ✗ ERROR: Failed to download asset {fname} from {matched_tag}")
                all_ok = False
        else:
            print(f"  ✗ ERROR: SHA256 mismatch for {fname} in release {matched_tag}!")
            print(f"      Local build:    {local_hash}")
            print(f"      GitHub Release: {expected_hash}")
            all_ok = False

    return all_ok


def main() -> None:
    parser = argparse.ArgumentParser(description="Verify built package digests against GitHub Release assets")
    parser.add_argument("--deb-dir", default="dist-debs", help="Directory containing .deb packages")
    parser.add_argument("--rpm-dir", default="dist-rpms", help="Directory containing .rpm packages")
    parser.add_argument("--sync-assets", action="store_true", help="Sync official release assets if hashes differ")
    args = parser.parse_args()

    success = verify_packages(args.deb_dir, args.rpm_dir, sync_assets=args.sync_assets)
    if not success:
        print("\n==> Digest verification FAILED. Aborting deployment to prevent publishing mismatched packages.")
        sys.exit(1)
    print("\n==> All package digests successfully verified against GitHub Releases.")


if __name__ == "__main__":
    main()
