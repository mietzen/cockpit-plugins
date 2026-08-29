#!/usr/bin/env python3
import os
import sys
import tarfile
import io
import struct
import hashlib
import json
import shutil
import argparse

def create_ar_archive(output_path, files):
    """Create a standard Unix ar archive (.deb file)."""
    with open(output_path, "wb") as ar_file:
        ar_file.write(b"!<arch>\n")
        for filename, data in files:
            name_bytes = filename.encode("ascii").ljust(16)
            timestamp_bytes = b"0".ljust(12)
            owner_bytes = b"0".ljust(6)
            group_bytes = b"0".ljust(6)
            mode_bytes = b"100644".ljust(8)
            size_bytes = str(len(data)).encode("ascii").ljust(10)
            header = name_bytes + timestamp_bytes + owner_bytes + group_bytes + mode_bytes + size_bytes + b"`\n"
            ar_file.write(header)
            ar_file.write(data)
            if len(data) % 2 != 0:
                ar_file.write(b"\n")

def build_deb(plugin_dir, output_dir, version="1.0.0"):
    os.makedirs(output_dir, exist_ok=True)
    plugin_name = os.path.basename(os.path.abspath(plugin_dir))
    
    # Read manifest if available
    manifest_path = os.path.join(plugin_dir, "manifest.json")
    pkg_name = f"cockpit-{plugin_name}"
    description = "Cockpit plugin"
    if os.path.exists(manifest_path):
        with open(manifest_path, "r") as f:
            manifest = json.load(f)
            pkg_name = f"cockpit-{manifest.get("name", plugin_name)}"
            description = f"Cockpit ZFS Storage management plugin"

    dist_dir = os.path.join(plugin_dir, "dist")
    backend_dir = os.path.join(plugin_dir, "backend")

    if not os.path.exists(dist_dir):
        print(f"Error: {dist_dir} does not exist. Run build first.")
        sys.exit(1)

    # 1. debian-binary
    debian_binary = b"2.0\n"

    # 2. control.tar.gz
    control_content = f"""Package: {pkg_name}
Version: {version}
Section: admin
Priority: optional
Architecture: all
Maintainer: Nils Stein <nils@mietzen.de>
Depends: cockpit-bridge | cockpit, zfsutils-linux, python3, smartmontools
Homepage: https://github.com/mietzen/cockpit-plugins
Description: {description}
 Advanced OpenZFS storage manager for Cockpit.
 Manage ZFS pools, datasets, zvols, snapshots, scrubs, trims,
 and SMART disk health with PatternFly v5 UI.
"""
    postinst_content = """#!/bin/sh
set -e
if [ -f /usr/libexec/cockpit-zfs/zfs_helper.py ]; then
    chmod +x /usr/libexec/cockpit-zfs/zfs_helper.py
fi
exit 0
"""
    prerm_content = """#!/bin/sh
set -e
exit 0
"""

    # 2. control.tar.gz
    control_tar_io = io.BytesIO()
    with tarfile.open(fileobj=control_tar_io, mode="w:gz", format=tarfile.USTAR_FORMAT) as tar:
        root_ti = tarfile.TarInfo(name="./")
        root_ti.type = tarfile.DIRTYPE
        root_ti.mode = 0o755
        root_ti.uid = 0
        root_ti.gid = 0
        root_ti.mtime = 0
        tar.addfile(root_ti)

        def add_control_file(name, content, mode=0o644):
            data = content.encode("utf-8") if isinstance(content, str) else content
            ti = tarfile.TarInfo(name=f"./{name}")
            ti.size = len(data)
            ti.mode = mode
            ti.uid = 0
            ti.gid = 0
            ti.uname = "root"
            ti.gname = "root"
            ti.mtime = 0
            tar.addfile(ti, io.BytesIO(data))

        add_control_file("control", control_content, 0o644)
        add_control_file("postinst", postinst_content, 0o755)
        add_control_file("prerm", prerm_content, 0o755)

    control_tar_bytes = control_tar_io.getvalue()

    # 3. data.tar.gz
    data_tar_io = io.BytesIO()
    with tarfile.open(fileobj=data_tar_io, mode="w:gz", format=tarfile.USTAR_FORMAT) as tar:
        added_dirs = set()

        def ensure_dirs(dir_path):
            parts = os.path.normpath(dir_path).split(os.sep)
            cur = "."
            if cur not in added_dirs:
                ti = tarfile.TarInfo(name=cur + "/")
                ti.type = tarfile.DIRTYPE
                ti.mode = 0o755
                ti.uid = 0
                ti.gid = 0
                ti.mtime = 0
                tar.addfile(ti)
                added_dirs.add(cur)

            for p in parts:
                if not p or p == ".":
                    continue
                cur = f"{cur}/{p}"
                if cur not in added_dirs:
                    ti = tarfile.TarInfo(name=cur + "/")
                    ti.type = tarfile.DIRTYPE
                    ti.mode = 0o755
                    ti.uid = 0
                    ti.gid = 0
                    ti.mtime = 0
                    tar.addfile(ti)
                    added_dirs.add(cur)

        def add_file_to_tar(file_path, arcname, is_exec=False):
            ensure_dirs(os.path.dirname(arcname))
            stat_res = os.stat(file_path)
            ti = tarfile.TarInfo(name=f"./{arcname}")
            ti.size = stat_res.st_size
            ti.uid = 0
            ti.gid = 0
            ti.uname = "root"
            ti.gname = "root"
            ti.mtime = 0
            ti.mode = 0o755 if is_exec or arcname.endswith(".py") or arcname.endswith(".sh") else 0o644
            with open(file_path, "rb") as f:
                tar.addfile(ti, f)

        # Add frontend files to /usr/share/cockpit/<plugin_name>/
        share_target = f"usr/share/cockpit/{plugin_name}"
        for root, dirs, files in os.walk(dist_dir):
            rel_dir = os.path.relpath(root, dist_dir)
            target_dir = share_target if rel_dir == "." else f"{share_target}/{rel_dir}"
            for f in files:
                if f.startswith("backend"):
                    continue
                file_path = os.path.join(root, f)
                arcname = f"{target_dir}/{f}"
                add_file_to_tar(file_path, arcname)

        # Add backend files to /usr/libexec/cockpit-zfs/
        libexec_target = "usr/libexec/cockpit-zfs"
        if os.path.exists(backend_dir):
            for root, dirs, files in os.walk(backend_dir):
                rel_dir = os.path.relpath(root, backend_dir)
                target_dir = libexec_target if rel_dir == "." else f"{libexec_target}/{rel_dir}"
                for f in files:
                    file_path = os.path.join(root, f)
                    arcname = f"{target_dir}/{f}"
                    add_file_to_tar(file_path, arcname, is_exec=f.endswith(".py"))

    data_tar_bytes = data_tar_io.getvalue()

    deb_filename = f"{pkg_name}_{version}_all.deb"
    deb_path = os.path.join(output_dir, deb_filename)

    create_ar_archive(deb_path, [
        ("debian-binary", debian_binary),
        ("control.tar.gz", control_tar_bytes),
        ("data.tar.gz", data_tar_bytes)
    ])

    print(f"Created Debian package: {deb_path} ({os.path.getsize(deb_path)} bytes)")
    return deb_path

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Build Debian package for Cockpit plugin")
    parser.add_argument("plugin_dir", help="Path to plugin directory (e.g. zfs-storage)")
    parser.add_argument("--output-dir", default="dist-debs", help="Output directory for .deb files")
    parser.add_argument("--version", default="1.0.0", help="Package version")
    args = parser.parse_args()

    build_deb(args.plugin_dir, args.output_dir, args.version)
