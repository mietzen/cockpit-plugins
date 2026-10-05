#!/usr/bin/env python3
import os
import sys
import shutil
import argparse
import subprocess
import gzip
import hashlib
from datetime import datetime, timezone

def get_hashes(data: bytes):
    return {
        "md5": hashlib.md5(data).hexdigest(),
        "sha256": hashlib.sha256(data).hexdigest(),
        "size": len(data)
    }

def parse_rpm_pkg_name(filename: str) -> str:
    base = filename.replace(".noarch.rpm", "").replace(".rpm", "")
    parts = base.rsplit("-", 2)
    if len(parts) >= 2 and parts[1] and parts[1][0].isdigit():
        return parts[0]
    return base

def parse_rpm_arch(filename: str) -> str:
    lower = filename.lower()
    if "aarch64" in lower or "arm64" in lower:
        return "aarch64"
    if "x86_64" in lower or "amd64" in lower:
        return "x86_64"
    return "noarch"


def parse_rpm_version(filename: str) -> str:
    base = filename.replace(".noarch.rpm", "").replace(".rpm", "")
    parts = base.rsplit("-", 2)
    if len(parts) >= 2 and parts[1] and parts[1][0].isdigit():
        return parts[1]
    return "1.0.0"


def import_gpg_key_if_present() -> bool:
    # Read private key from environment and import into GPG keyring
    gpg_key_env = os.environ.get("GPG_PRIVATE_KEY", "").strip()
    if not gpg_key_env:
        return False

    try:
        import_cmd = ["gpg", "--batch", "--yes", "--import"]
        subprocess.run(import_cmd, input=gpg_key_env.encode(), capture_output=True, check=True)
        return True
    except Exception as e:
        print(f"Warning: Failed to import GPG_PRIVATE_KEY: {e}")
        return False


def generate_rpm_repo(rpm_dir: str, output_dir: str, owner: str = "mietzen", repo: str = "cockpit-plugins"):
    os.makedirs(output_dir, exist_ok=True)
    repodata_dir = os.path.join(output_dir, "repodata")
    os.makedirs(repodata_dir, exist_ok=True)

    rpm_files = [os.path.join(rpm_dir, f) for f in os.listdir(rpm_dir) if f.endswith(".rpm")] if os.path.exists(rpm_dir) else []
    
    # Copy RPMs to output_dir
    packages_summary = []
    for rpm_path in rpm_files:
        filename = os.path.basename(rpm_path)
        dest_path = os.path.join(output_dir, filename)
        shutil.copy2(rpm_path, dest_path)
        
        with open(dest_path, "rb") as f:
            data = f.read()
        hashes = get_hashes(data)
        packages_summary.append({
            "name": parse_rpm_pkg_name(filename),
            "version": parse_rpm_version(filename),
            "filename": filename,
            "arch": parse_rpm_arch(filename),
            "size": f"{len(data) / (1024 * 1024):.1f} MiB",
            "sha256": hashes['sha256']
        })

    # If createrepo_c is available, use it
    if shutil.which("createrepo_c") or shutil.which("createrepo"):
        cmd = "createrepo_c" if shutil.which("createrepo_c") else "createrepo"
        subprocess.run([cmd, "--update", output_dir], check=True)
    else:
        # Generate minimal primary.xml
        primary_xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<metadata xmlns="http://linux.duke.edu/metadata/common" xmlns:rpm="http://linux.duke.edu/metadata/rpm" packages="{len(packages_summary)}">
"""
        for p in packages_summary:
            primary_xml += f"""  <package type="rpm">
    <name>{p['name']}</name>
    <arch>{p['arch']}</arch>
    <version epoch="0" ver="{p['version']}" rel="1"/>
    <checksum type="sha256" pkgid="YES">{p['sha256']}</checksum>
    <summary>Cockpit Plugin</summary>
    <description>Advanced Cockpit Plugin</description>
    <location href="{p['filename']}"/>
  </package>
"""
        primary_xml += "</metadata>\n"
        
        primary_bytes = primary_xml.encode("utf-8")
        primary_gz_path = os.path.join(repodata_dir, "primary.xml.gz")
        with gzip.open(primary_gz_path, "wb") as f:
            f.write(primary_bytes)
        
        pri_gz_hashes = get_hashes(open(primary_gz_path, "rb").read())
        pri_raw_hashes = get_hashes(primary_bytes)
        timestamp = int(datetime.now(timezone.utc).timestamp())

        repomd_xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<repomd xmlns="http://linux.duke.edu/metadata/repo">
  <revision>{timestamp}</revision>
  <data type="primary">
    <checksum type="sha256">{pri_gz_hashes['sha256']}</checksum>
    <open-checksum type="sha256">{pri_raw_hashes['sha256']}</open-checksum>
    <location href="repodata/primary.xml.gz"/>
    <timestamp>{timestamp}</timestamp>
    <size>{pri_gz_hashes['size']}</size>
    <open-size>{pri_raw_hashes['size']}</open-size>
  </data>
</repomd>
"""
        with open(os.path.join(repodata_dir, "repomd.xml"), "w", encoding="utf-8") as f:
            f.write(repomd_xml)

    # GPG signing of repomd.xml and public key export
    gpg_imported = import_gpg_key_if_present()

    gpg_has_keys = False
    try:
        p_keys = subprocess.run(["gpg", "--list-secret-keys", "--with-colons"], capture_output=True, text=True)
        if p_keys.returncode == 0 and "sec:" in p_keys.stdout:
            gpg_has_keys = True
    except Exception:
        pass

    if gpg_has_keys or gpg_imported:
        # Export armored public key to key.gpg if not already present
        key_path = os.path.join(output_dir, "key.gpg")
        if not os.path.exists(key_path):
            try:
                p_export = subprocess.run(["gpg", "--armor", "--export"], capture_output=True)
                if p_export.returncode == 0 and p_export.stdout:
                    with open(key_path, "wb") as f:
                        f.write(p_export.stdout)
                    print("Created key.gpg (armored)")
            except Exception as e:
                print(f"Warning: Failed to export public key: {e}")

        # Sign repomd.xml to produce repomd.xml.asc
        repomd_file = os.path.join(repodata_dir, "repomd.xml")
        if os.path.exists(repomd_file):
            try:
                sign_cmd = ["gpg", "--batch", "--yes", "-abs", "--digest-algo", "SHA256", "-o", f"{repomd_file}.asc", repomd_file]
                passphrase = os.environ.get("GPG_PASSPHRASE", "").strip()
                if passphrase:
                    sign_cmd.extend(["--pinentry-mode", "loopback", "--passphrase", passphrase])
                subprocess.run(sign_cmd, check=True)
                print("Created repomd.xml.asc")
            except Exception as e:
                print(f"Warning: Failed to sign repomd.xml: {e}")

    # Generate install-rpm.sh
    install_rpm_content = f"""#!/usr/bin/env bash
set -e

echo "==> Configuring Cockpit Plugins RPM Repository ({owner}/{repo})..."

# Import official repository GPG key if available
rpm --import "https://{owner}.github.io/{repo}/key.gpg" 2>/dev/null || true

cat << 'EOF' > /etc/yum.repos.d/cockpit-plugins.repo
[cockpit-plugins]
name=Cockpit Plugins Repository
baseurl=https://{owner}.github.io/{repo}/rpm/
enabled=1
gpgcheck=1
repo_gpgcheck=1
gpgkey=https://{owner}.github.io/{repo}/key.gpg
sslverify=1
EOF

echo "==> Installing cockpit-zfs-storage..."
dnf install -y cockpit-zfs-storage || yum install -y cockpit-zfs-storage

echo "==> Installation complete! Access Cockpit at https://<server-ip>:9090."
"""
    with open(os.path.join(output_dir, "install-rpm.sh"), "w", encoding="utf-8") as f:
        f.write(install_rpm_content)
    os.chmod(os.path.join(output_dir, "install-rpm.sh"), 0o755)

    print(f"RPM repository generated in {output_dir} ({len(packages_summary)} packages).")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate RPM repository for Cockpit plugins")
    parser.add_argument("--rpm-dir", default="dist-rpms", help="Directory containing .rpm files")
    parser.add_argument("--output-dir", default="pages/rpm", help="Output directory for RPM repo")
    parser.add_argument("--owner", default="mietzen", help="GitHub repo owner")
    parser.add_argument("--repo", default="cockpit-plugins", help="GitHub repository name")
    args = parser.parse_args()

    generate_rpm_repo(args.rpm_dir, args.output_dir, args.owner, args.repo)
