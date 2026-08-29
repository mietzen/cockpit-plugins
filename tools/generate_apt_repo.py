#!/usr/bin/env python3
import os
import sys
import tarfile
import io
import gzip
import hashlib
import shutil
import argparse
from datetime import datetime, timezone

def get_hashes(data):
    return {
        "md5": hashlib.md5(data).hexdigest(),
        "sha1": hashlib.sha1(data).hexdigest(),
        "sha256": hashlib.sha256(data).hexdigest(),
        "size": len(data)
    }

def parse_deb_control(deb_path):
    """Extract control file content from .deb archive."""
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
                with tarfile.open(fileobj=control_tar_io, mode="r:*") as tar:
                    for member in tar.getmembers():
                        if member.name.endswith("control") or member.name == "./control":
                            ef = tar.extractfile(member)
                            if ef:
                                return ef.read().decode("utf-8")
    return ""

def generate_apt_repo(deb_dir, output_dir, dist_name="stable", component="main", owner="mietzen", repo="cockpit-plugins"):
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
            "size": f"{hashes['size'] / 1024:.1f} KiB",
            "sha256": hashes['sha256'],
            "description": pkg_desc
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
    now_utc = datetime.now(timezone.utc).strftime("%a, %d %b %Y %H:%M:%S UTC")

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
    with open(os.path.join(release_dir, "Release"), "w", encoding="utf-8") as f:
        f.write(release_content)

    # Generate modern HTML index for GitHub Pages
    packages_table_rows = "".join([
        f"""<tr>
            <td><strong><code>{p['name']}</code></strong></td>
            <td><span class="badge">{p['version']}</span></td>
            <td>{p['description']}</td>
            <td><a href="{p['filename']}" class="download-link">Download .deb</a> ({p['size']})</td>
        </tr>""" for p in packages_summary
    ])

    html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Cockpit Plugins APT Repository</title>
    <style>
        :root {{
            --bg: #0f141c;
            --card-bg: #18202c;
            --border: #283548;
            --text-primary: #e6edf3;
            --text-secondary: #8b949e;
            --accent: #58a6ff;
            --code-bg: #0b0e14;
            --badge-bg: rgba(88, 166, 255, 0.15);
            --badge-text: #58a6ff;
        }}
        @media (prefers-color-scheme: light) {{
            :root {{
                --bg: #f6f8fa;
                --card-bg: #ffffff;
                --border: #d0d7de;
                --text-primary: #1f2328;
                --text-secondary: #656d76;
                --accent: #0969da;
                --code-bg: #f3f4f6;
                --badge-bg: #ddf4ff;
                --badge-text: #0969da;
            }}
        }}
        body {{
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            background-color: var(--bg);
            color: var(--text-primary);
            margin: 0;
            padding: 2rem 1rem;
            line-height: 1.6;
        }}
        .container {{
            max-width: 880px;
            margin: 0 auto;
        }}
        .header {{
            text-align: center;
            margin-bottom: 2.5rem;
        }}
        .header h1 {{
            font-size: 2.2rem;
            margin-bottom: 0.5rem;
        }}
        .header p {{
            color: var(--text-secondary);
            font-size: 1.1rem;
            margin: 0;
        }}
        .card {{
            background: var(--card-bg);
            border: 1px solid var(--border);
            border-radius: 12px;
            padding: 1.5rem;
            margin-bottom: 2rem;
            box-shadow: 0 4px 12px rgba(0,0,0,0.05);
        }}
        .card h2 {{
            margin-top: 0;
            font-size: 1.3rem;
            border-bottom: 1px solid var(--border);
            padding-bottom: 0.75rem;
        }}
        pre {{
            background: var(--code-bg);
            border: 1px solid var(--border);
            border-radius: 8px;
            padding: 1rem;
            overflow-x: auto;
            font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
            font-size: 0.9rem;
            color: var(--text-primary);
        }}
        table {{
            width: 100%;
            border-collapse: collapse;
            margin-top: 1rem;
        }}
        th, td {{
            text-align: left;
            padding: 0.75rem 1rem;
            border-bottom: 1px solid var(--border);
        }}
        th {{
            color: var(--text-secondary);
            font-size: 0.85rem;
            text-transform: uppercase;
        }}
        .badge {{
            background: var(--badge-bg);
            color: var(--badge-text);
            padding: 0.2rem 0.6rem;
            border-radius: 999px;
            font-size: 0.8rem;
            font-weight: 600;
        }}
        a.download-link {{
            color: var(--accent);
            text-decoration: none;
            font-weight: 600;
        }}
        a.download-link:hover {{
            text-decoration: underline;
        }}
        .footer {{
            text-align: center;
            color: var(--text-secondary);
            font-size: 0.9rem;
            margin-top: 3rem;
        }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📦 Cockpit Plugins APT Repository</h1>
            <p>Official Debian / Ubuntu repository for Cockpit extensions by <a href="https://github.com/{owner}" style="color: var(--accent); text-decoration: none;">{owner}</a></p>
        </div>

        <div class="card">
            <h2>🚀 Quick Setup</h2>
            <p>Add this repository to your Debian/Ubuntu server to install and automatically update Cockpit plugins:</p>
            <pre><code># 1. Add repository source list
echo "deb [trusted=yes] https://{owner}.github.io/{repo}/ {dist_name} {component}" | sudo tee /etc/apt/sources.list.d/cockpit-plugins.list

# 2. Update package lists
sudo apt update

# 3. Install ZFS Storage plugin
sudo apt install cockpit-zfs-storage</code></pre>
        </div>

        <div class="card">
            <h2>📦 Available Packages</h2>
            <table>
                <thead>
                    <tr>
                        <th>Package</th>
                        <th>Version</th>
                        <th>Description</th>
                        <th>Direct Download</th>
                    </tr>
                </thead>
                <tbody>
                    {packages_table_rows}
                </tbody>
            </table>
        </div>

        <div class="footer">
            <p>Source code available on <a href="https://github.com/{owner}/{repo}" style="color: var(--accent);">GitHub: {owner}/{repo}</a></p>
        </div>
    </div>
</body>
</html>
"""
    with open(os.path.join(output_dir, "index.html"), "w", encoding="utf-8") as f:
        f.write(html_content)

    print(f"APT repository generated in {output_dir} ({len(packages_summary)} packages).")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate APT repository for Cockpit plugins")
    parser.add_argument("--deb-dir", default="dist-debs", help="Directory containing .deb files")
    parser.add_argument("--output-dir", default="pages", help="Output directory for APT repo / GitHub Pages")
    parser.add_argument("--dist", default="stable", help="Distribution name (default: stable)")
    parser.add_argument("--component", default="main", help="Component name (default: main)")
    parser.add_argument("--owner", default="mietzen", help="GitHub repo owner")
    parser.add_argument("--repo", default="cockpit-plugins", help="GitHub repository name")
    args = parser.parse_args()

    generate_apt_repo(args.deb_dir, args.output_dir, args.dist, args.component, args.owner, args.repo)
