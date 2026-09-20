#!/usr/bin/env python3
import os
import sys
import tarfile
import io
import gzip
import hashlib
import shutil
import argparse
import subprocess
from datetime import datetime, timezone, timedelta

import re

def get_hashes(data):
    return {
        "md5": hashlib.md5(data).hexdigest(),
        "sha1": hashlib.sha1(data).hexdigest(),
        "sha256": hashlib.sha256(data).hexdigest(),
        "size": len(data)
    }

def format_size_mib(size_bytes: int) -> str:
    mib = size_bytes / (1024 * 1024)
    return f"{mib:.1f} MiB"

def sanitize_description(pkg_name: str, desc: str) -> str:
    clean = desc.replace("\\n", " ").replace("\n", " ").strip()
    if "." in clean:
        clean = clean.split(".")[0].strip()
    if not clean or clean.lower() == "cockpit plugin":
        if "zfs" in pkg_name:
            clean = "OpenZFS storage management plugin for Cockpit"
        elif "sharing" in pkg_name:
            clean = "SMB and NFS file sharing management plugin for Cockpit"
        elif "container" in pkg_name:
            clean = "Docker and Podman container management plugin for Cockpit"
        else:
            clean = "Cockpit plugin extension"
    return clean

def parse_rpm_pkg_name(filename: str) -> str:
    base = filename.replace(".noarch.rpm", "").replace(".rpm", "")
    parts = base.rsplit("-", 2)
    if len(parts) >= 2 and parts[1] and parts[1][0].isdigit():
        return parts[0]
    return base

def parse_deb_control(deb_path):
    """Extract control file content from .deb archive."""
    try:
        p = subprocess.run(["dpkg-deb", "-f", deb_path], capture_output=True, text=True)
        if p.returncode == 0 and p.stdout:
            return p.stdout
    except Exception:
        pass

    with open(deb_path, "rb") as f:
        magic = f.read(8)
        if magic != b"!<arch>\n":
            raise ValueError(f"Invalid ar archive: {deb_path}")
        
        while True:
            header = f.read(60)
            if len(header) < 60:
                break
            name = header[:16].strip().decode("ascii", "replace")
            size = int(header[48:58].strip())
            file_data = f.read(size)
            if size % 2 != 0:
                f.read(1) # ar padding

            if name.startswith("control.tar"):
                control_tar_io = io.BytesIO(file_data)
                try:
                    with tarfile.open(fileobj=control_tar_io, mode="r:*") as tar:
                        for member in tar.getmembers():
                            if member.name.endswith("control") or member.name == "./control":
                                ef = tar.extractfile(member)
                                if ef:
                                    return ef.read().decode("utf-8")
                except Exception:
                    pass
    return ""

def generate_apt_repo(deb_dir, output_dir, dist_name="stable", component="main", owner="mietzen", repo="cockpit-plugins", rpm_dir=None):
    os.makedirs(output_dir, exist_ok=True)
    dists_dir = os.path.join(output_dir, "dists", dist_name, component, "binary-all")
    os.makedirs(dists_dir, exist_ok=True)

    packages_entries = []
    packages_summary = []

    deb_files = [os.path.join(deb_dir, f) for f in os.listdir(deb_dir) if f.endswith(".deb")]
    if not deb_files:
        print(f"Warning: No .deb files found in {deb_dir}")

    for deb_path in deb_files:
        deb_filename = os.path.basename(deb_path)
        with open(deb_path, "rb") as f:
            deb_bytes = f.read()

        hashes = get_hashes(deb_bytes)
        control_text = parse_deb_control(deb_path)

        # Parse package name for pool directory
        pkg_name = "cockpit-plugin"
        pkg_version = "1.0.0"
        pkg_desc = "Cockpit plugin"
        for line in control_text.splitlines():
            if line.startswith("Package:"):
                pkg_name = line.split(":", 1)[1].strip()
            elif line.startswith("Version:"):
                pkg_version = line.split(":", 1)[1].strip()
            elif line.startswith("Description:"):
                pkg_desc = line.split(":", 1)[1].strip()

        pool_rel_dir = os.path.join("pool", component, pkg_name[0], pkg_name)
        pool_full_dir = os.path.join(output_dir, pool_rel_dir)
        os.makedirs(pool_full_dir, exist_ok=True)

        dest_deb_rel_path = os.path.join(pool_rel_dir, deb_filename)
        dest_deb_full_path = os.path.join(output_dir, dest_deb_rel_path)
        shutil.copy2(deb_path, dest_deb_full_path)

        # Build Packages entry
        clean_control = "\n".join([line for line in control_text.strip().splitlines() if line.strip()])
        entry = f"""{clean_control}
Filename: {dest_deb_rel_path}
Size: {hashes['size']}
MD5sum: {hashes['md5']}
SHA1: {hashes['sha1']}
SHA256: {hashes['sha256']}
"""
        packages_entries.append(entry.strip())
        packages_summary.append({
            "name": pkg_name,
            "version": pkg_version,
            "filename": dest_deb_rel_path,
            "size": format_size_mib(hashes['size']),
            "sha256": hashes['sha256'],
            "description": sanitize_description(pkg_name, pkg_desc)
        })

    # Write Packages & Packages.gz
    packages_content = "\n\n".join(packages_entries) + "\n"
    packages_bytes = packages_content.encode("utf-8")
    packages_path = os.path.join(dists_dir, "Packages")
    with open(packages_path, "wb") as f:
        f.write(packages_bytes)

    packages_gz_path = os.path.join(dists_dir, "Packages.gz")
    with gzip.open(packages_gz_path, "wb") as f:
        f.write(packages_bytes)

    # Release file for dists/stable/
    release_dir = os.path.join(output_dir, "dists", dist_name)
    now_dt = datetime.now(timezone.utc) - timedelta(minutes=10)
    valid_dt = datetime.now(timezone.utc) + timedelta(days=365)
    now_utc = now_dt.strftime("%a, %d %b %Y %H:%M:%S UTC")
    valid_utc = valid_dt.strftime("%a, %d %b %Y %H:%M:%S UTC")

    pkgs_info = get_hashes(packages_bytes)
    pkgs_gz_info = get_hashes(open(packages_gz_path, "rb").read())

    rel_pkgs_path = f"{component}/binary-all/Packages"
    rel_pkgs_gz_path = f"{component}/binary-all/Packages.gz"

    release_content = f"""Origin: {owner}
Label: Cockpit Plugins Repository
Suite: {dist_name}
Codename: {dist_name}
Version: 1.0
Date: {now_utc}
Valid-Until: {valid_utc}
Architectures: all amd64 arm64
Components: {component}
Description: APT Repository for Cockpit Plugins
MD5Sum:
 {pkgs_info['md5']} {pkgs_info['size']} {rel_pkgs_path}
 {pkgs_gz_info['md5']} {pkgs_gz_info['size']} {rel_pkgs_gz_path}
SHA1:
 {pkgs_info['sha1']} {pkgs_info['size']} {rel_pkgs_path}
 {pkgs_gz_info['sha1']} {pkgs_gz_info['size']} {rel_pkgs_gz_path}
SHA256:
 {pkgs_info['sha256']} {pkgs_info['size']} {rel_pkgs_path}
 {pkgs_gz_info['sha256']} {pkgs_gz_info['size']} {rel_pkgs_gz_path}
"""
    release_path = os.path.join(release_dir, "Release")
    with open(release_path, "w", encoding="utf-8") as f:
        f.write(release_content)

    # GPG signing & key export
    gpg_imported = False
    gpg_key_env = os.environ.get("GPG_PRIVATE_KEY", "").strip()
    gpg_passphrase = os.environ.get("GPG_PASSPHRASE", "").strip()

    if gpg_key_env:
        try:
            import_cmd = ["gpg", "--batch", "--yes", "--import"]
            subprocess.run(import_cmd, input=gpg_key_env.encode(), capture_output=True, check=True)
            gpg_imported = True
        except Exception as e:
            print(f"Warning: Failed to import GPG_PRIVATE_KEY: {e}")

    # Check for available GPG secret keys
    gpg_has_keys = False
    try:
        p_keys = subprocess.run(["gpg", "--list-secret-keys", "--with-colons"], capture_output=True, text=True)
        if p_keys.returncode == 0 and "sec:" in p_keys.stdout:
            gpg_has_keys = True
    except Exception:
        pass

    if gpg_has_keys or gpg_imported:
        print("==> GPG secret key detected. Exporting public keys and signing Release file...")
        try:
            # Export ASCII armored public key (key.gpg)
            p_export_armor = subprocess.run(["gpg", "--armor", "--export"], capture_output=True)
            if p_export_armor.returncode == 0 and p_export_armor.stdout:
                with open(os.path.join(output_dir, "key.gpg"), "wb") as f:
                    f.write(p_export_armor.stdout)
                print("Created key.gpg (armored)")

            # Export binary keyring (cockpit-plugins.gpg)
            p_export_bin = subprocess.run(["gpg", "--export"], capture_output=True)
            if p_export_bin.returncode == 0 and p_export_bin.stdout:
                with open(os.path.join(output_dir, "cockpit-plugins.gpg"), "wb") as f:
                    f.write(p_export_bin.stdout)
                print("Created cockpit-plugins.gpg (binary keyring)")

            # Sign InRelease (clearsign)
            inrelease_path = os.path.join(release_dir, "InRelease")
            sign_inrelease_cmd = ["gpg", "--batch", "--yes", "--clearsign", "--digest-algo", "SHA256"]
            if gpg_passphrase:
                sign_inrelease_cmd.extend(["--pinentry-mode", "loopback", "--passphrase", gpg_passphrase])
            sign_inrelease_cmd.extend(["-o", inrelease_path, release_path])
            subprocess.run(sign_inrelease_cmd, check=True)
            print("Created InRelease (clear-signed)")

            # Sign Release.gpg (detached)
            release_gpg_path = os.path.join(release_dir, "Release.gpg")
            sign_rel_cmd = ["gpg", "--batch", "--yes", "-abs", "--digest-algo", "SHA256"]
            if gpg_passphrase:
                sign_rel_cmd.extend(["--pinentry-mode", "loopback", "--passphrase", gpg_passphrase])
            sign_rel_cmd.extend(["-o", release_gpg_path, release_path])
            subprocess.run(sign_rel_cmd, check=True)
            print("Created Release.gpg (detached signature)")
        except Exception as e:
            print(f"Warning: Failed to sign Release file: {e}")
    else:
        print("Note: No GPG signing key provided. Repository will be served without GPG signatures.")

    # Write one-line install script install.sh
    install_sh_content = f"""#!/usr/bin/env bash
set -e

echo "==> Configuring Cockpit Plugins APT Repository ({owner}/{repo})..."

# Ensure prerequisites
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq && apt-get install -y -qq curl ca-certificates gnupg

# Setup keyring and DEB822 repository source
install -m 0755 -d /etc/apt/keyrings
rm -f /etc/apt/sources.list.d/cockpit-plugins.list

if curl -fsSL "https://{owner}.github.io/{repo}/cockpit-plugins.gpg" -o /etc/apt/keyrings/cockpit-plugins.gpg 2>/dev/null; then
    chmod 644 /etc/apt/keyrings/cockpit-plugins.gpg
    cat << EOF > /etc/apt/sources.list.d/cockpit-plugins.sources
Types: deb
URIs: https://{owner}.github.io/{repo}/
Suites: {dist_name}
Components: {component}
Signed-By: /etc/apt/keyrings/cockpit-plugins.gpg
EOF
else
    cat << EOF > /etc/apt/sources.list.d/cockpit-plugins.sources
Types: deb
URIs: https://{owner}.github.io/{repo}/
Suites: {dist_name}
Components: {component}
Trusted: yes
EOF
fi

echo "==> Updating package cache and installing cockpit-zfs-storage..."
apt-get update -qq
apt-get install -y cockpit-zfs-storage

echo "==> Installation complete! Access Cockpit at https://<server-ip>:9090 and select 'ZFS storage'."
"""
    with open(os.path.join(output_dir, "install.sh"), "w", encoding="utf-8") as f:
        f.write(install_sh_content)
    os.chmod(os.path.join(output_dir, "install.sh"), 0o755)

    # Check for RPM packages and build map
    rpm_map = {}
    if rpm_dir and os.path.exists(rpm_dir):
        for rpm_f in sorted(os.listdir(rpm_dir)):
            if rpm_f.endswith(".rpm"):
                rpm_path = os.path.join(rpm_dir, rpm_f)
                with open(rpm_path, "rb") as rf:
                    rpm_bytes = rf.read()
                rpm_sha256 = hashlib.sha256(rpm_bytes).hexdigest()
                pkg_key = parse_rpm_pkg_name(rpm_f)
                rpm_map[pkg_key] = {
                    "filename": f"rpm/{rpm_f}",
                    "size": format_size_mib(len(rpm_bytes)),
                    "sha256": rpm_sha256,
                }

    # Generate modern HTML index for GitHub Pages
    def format_row(p):
        rpm_info = rpm_map.get(p["name"])
        
        # Deb download & SHA
        deb_download = f'<div class="download-item"><a href="{p["filename"]}" class="download-link">.deb</a> <span class="pkg-size">({p["size"]})</span></div>'
        deb_sha_short = p["sha256"][:8]
        deb_sha_block = f'''<div class="sha-box">
            <code>{deb_sha_short}…</code>
            <button class="copy-btn" onclick="navigator.clipboard.writeText('{p["sha256"]}');this.classList.add('copied');setTimeout(()=>this.classList.remove('copied'),1500)" title="Copy .deb SHA256" aria-label="Copy .deb SHA256">
                <svg class="copy-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                <svg class="check-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
            </button>
        </div>'''

        # RPM download & SHA
        rpm_download = ""
        rpm_sha_block = ""
        if rpm_info:
            rpm_download = f'<div class="download-item"><a href="{rpm_info["filename"]}" class="download-link">.rpm</a> <span class="pkg-size">({rpm_info["size"]})</span></div>'
            rpm_sha_short = rpm_info["sha256"][:8]
            rpm_sha_block = f'''<div class="sha-box">
                <code>{rpm_sha_short}…</code>
                <button class="copy-btn" onclick="navigator.clipboard.writeText('{rpm_info["sha256"]}');this.classList.add('copied');setTimeout(()=>this.classList.remove('copied'),1500)" title="Copy .rpm SHA256" aria-label="Copy .rpm SHA256">
                    <svg class="copy-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                    <svg class="check-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                </button>
            </div>'''

        return f"""<tr>
            <td><strong><code>{p['name']}</code></strong></td>
            <td style="text-align: center;"><code>{p['version']}</code></td>
            <td>{p['description']}</td>
            <td><div class="download-cell">{deb_download}{rpm_download}</div></td>
            <td><div class="sha-cell">{deb_sha_block}{rpm_sha_block}</div></td>
        </tr>"""

    packages_table_rows = "".join([format_row(p) for p in packages_summary])

    template_path = os.path.join(os.path.dirname(__file__), "templates", "index.html")
    if os.path.exists(template_path):
        with open(template_path, "r", encoding="utf-8") as f:
            template = f.read()
    else:
        template = "<html><body><h1>Cockpit Plugins</h1>{{PACKAGES_TABLE_ROWS}}</body></html>"

    html_content = (
        template
        .replace("{{OWNER}}", owner)
        .replace("{{REPO}}", repo)
        .replace("{{DIST_NAME}}", dist_name)
        .replace("{{COMPONENT}}", component)
        .replace("{{PACKAGES_TABLE_ROWS}}", packages_table_rows)
    )
    with open(os.path.join(output_dir, "index.html"), "w", encoding="utf-8") as f:
        f.write(html_content)

    print(f"APT repository generated in {output_dir} ({len(packages_summary)} packages).")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate APT repository for Cockpit plugins")
    parser.add_argument("--deb-dir", default="dist-debs", help="Directory containing .deb files")
    parser.add_argument("--rpm-dir", default="dist-rpms", help="Directory containing .rpm files")
    parser.add_argument("--output-dir", default="pages", help="Output directory for APT repo / GitHub Pages")
    parser.add_argument("--dist", default="stable", help="Distribution name (default: stable)")
    parser.add_argument("--component", default="main", help="Component name (default: main)")
    parser.add_argument("--owner", default="mietzen", help="GitHub repo owner")
    parser.add_argument("--repo", default="cockpit-plugins", help="GitHub repository name")
    args = parser.parse_args()

    generate_apt_repo(args.deb_dir, args.output_dir, args.dist, args.component, args.owner, args.repo, args.rpm_dir)
