#!/usr/bin/env python3
import os
import sys
import subprocess
import tarfile
import gzip
import io
import struct
import hashlib
import json
import shutil
import argparse

DEFAULT_EPOCH = 0
ENV_SOURCE_DATE_EPOCH = "SOURCE_DATE_EPOCH"
ENV_GIT_TAG = "GIT_TAG"


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

def get_caddy_binary(plugin_dir, arch):
    upstream_file = os.path.join(plugin_dir, "upstream.json")
    version = "2.11.7"
    if os.path.isfile(upstream_file):
        with open(upstream_file, "r", encoding="utf-8") as f:
            cfg = json.load(f)
            for p in cfg.get("packages", []):
                if p.get("name") == "caddy":
                    version = p.get("version", version)

    archive_name = f"caddy_{version}_linux_{arch}.tar.gz"
    search_dirs = ["build/archives", "dist-archives", "all-archives"]
    archive_path = None
    for d in search_dirs:
        candidate = os.path.join(d, archive_name)
        if os.path.isfile(candidate) and os.path.getsize(candidate) > 0:
            archive_path = candidate
            break

    if not archive_path:
        os.makedirs("build/archives", exist_ok=True)
        archive_path = os.path.join("build/archives", archive_name)
        url = f"https://github.com/caddyserver/caddy/releases/download/v{version}/{archive_name}"
        print(f"  ↓ Downloading {archive_name} from {url}...")
        import urllib.request
        req = urllib.request.Request(url, headers={"User-Agent": "cockpit-plugins-builder"})
        with urllib.request.urlopen(req) as resp, open(archive_path, "wb") as out_f:
            while chunk := resp.read(65536):
                out_f.write(chunk)
        print(f"  ✓ Downloaded {archive_name} ({os.path.getsize(archive_path)} bytes)")

    with tarfile.open(archive_path, "r:gz") as tar:
        caddy_f = tar.extractfile("caddy")
        if caddy_f:
            return caddy_f.read()
    return None

def get_source_date_epoch(plugin_dir: str, version: str) -> int:
    """Resolve reproducible build epoch from env, git tags, or commit log."""
    env_epoch = os.environ.get(ENV_SOURCE_DATE_EPOCH)
    if env_epoch:
        try:
            return int(env_epoch)
        except ValueError:
            pass

    plugin_name = os.path.basename(os.path.abspath(plugin_dir))
    git_tag = os.environ.get(ENV_GIT_TAG)

    candidate_refs = []
    if git_tag:
        candidate_refs.append(f"refs/tags/{git_tag}")
    candidate_refs.append(f"refs/tags/{plugin_name}-v{version}")
    candidate_refs.append(f"refs/tags/v{version}")

    for ref in candidate_refs:
        try:
            res = subprocess.run(
                ["git", "log", "-1", "--pretty=%ct", ref, "--", plugin_dir],
                capture_output=True,
                text=True,
                check=False,
            )
            val = res.stdout.strip()
            if val and val.isdigit():
                return int(val)
        except Exception:
            continue

    try:
        res = subprocess.run(
            ["git", "log", "-1", "--pretty=%ct", plugin_dir],
            capture_output=True,
            text=True,
            check=False,
        )
        val = res.stdout.strip()
        if val and val.isdigit():
            return int(val)
    except Exception:
        pass

    return DEFAULT_EPOCH


def build_deb(plugin_dir, output_dir, version="1.0.0"):
    os.makedirs(output_dir, exist_ok=True)
    plugin_name = os.path.basename(os.path.abspath(plugin_dir))
    epoch = get_source_date_epoch(plugin_dir, version)

    
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

    helper_dir_name = f"cockpit-{plugin_name}"
    if plugin_name == "zfs-storage":
        helper_dir_name = "cockpit-zfs"
        deb_depends = "cockpit-bridge | cockpit, zfsutils-linux, python3, smartmontools"
        description = "Advanced OpenZFS storage manager for Cockpit.\n Manage ZFS pools, datasets, zvols, snapshots, scrubs, trims,\n and SMART disk health with PatternFly v5 UI."
    elif plugin_name == "file-sharing":
        deb_depends = "cockpit-bridge | cockpit, python3, samba, nfs-kernel-server | nfs-common"
        description = "Advanced SMB (Samba) and NFS file sharing manager for Cockpit.\n Manage Samba shares, NFS exports, Samba users, permissions matrix,\n and live client connection monitoring with PatternFly v5 UI."
    elif plugin_name == "container-manager":
        deb_depends = "cockpit-bridge | cockpit, python3, openssl"
        description = "Docker and Podman container manager for Cockpit."
    elif plugin_name == "code-server":
        deb_depends = "cockpit-bridge | cockpit, python3, code-server"
        description = "VS Code Server plugin for Cockpit."
    else:
        deb_depends = "cockpit-bridge | cockpit, python3"
        description = f"Cockpit plugin {plugin_name}"

    # Load maintainer scripts from templates
    templates_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "templates")
    postinst_tmpl = os.path.join(templates_dir, "postinst.sh")
    prerm_tmpl = os.path.join(templates_dir, "prerm.sh")

    with open(postinst_tmpl, "r", encoding="utf-8") as f:
        postinst_content = (
            f.read()
            .replace("@@HELPER_DIR_NAME@@", helper_dir_name)
            .replace("@@PLUGIN_NAME@@", plugin_name)
        )

    with open(prerm_tmpl, "r", encoding="utf-8") as f:
        prerm_content = (
            f.read()
            .replace("@@HELPER_DIR_NAME@@", helper_dir_name)
            .replace("@@PLUGIN_NAME@@", plugin_name)
        )

    target_archs = ["amd64", "arm64"] if plugin_name == "code-server" else ["all"]
    created_debs = []

    for target_arch in target_archs:
        # 1. debian-binary
        debian_binary = b"2.0\n"

        # 2. control.tar.gz
        control_content = f"""Package: {pkg_name}
Version: {version}
Section: admin
Priority: optional
Architecture: {target_arch}
Maintainer: Nils Stein <github.nstein@mailbox.org>
Depends: {deb_depends}
Homepage: https://github.com/mietzen/cockpit-plugins
Description: {description}
"""
        control_tar_io = io.BytesIO()
        with gzip.GzipFile(fileobj=control_tar_io, mode="wb", mtime=epoch) as gz:
            with tarfile.open(fileobj=gz, mode="w", format=tarfile.USTAR_FORMAT) as tar:
                root_ti = tarfile.TarInfo(name="./")
                root_ti.type = tarfile.DIRTYPE
                root_ti.mode = 0o755
                root_ti.uid = 0
                root_ti.gid = 0
                root_ti.mtime = epoch
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
                    ti.mtime = epoch
                    tar.addfile(ti, io.BytesIO(data))
    
                add_control_file("control", control_content, 0o644)
                add_control_file("postinst", postinst_content, 0o755)
                add_control_file("prerm", prerm_content, 0o755)
    
        control_tar_bytes = control_tar_io.getvalue()
    
        # 3. data.tar.gz
        data_tar_io = io.BytesIO()
        with gzip.GzipFile(fileobj=data_tar_io, mode="wb", mtime=epoch) as gz:
            with tarfile.open(fileobj=gz, mode="w", format=tarfile.USTAR_FORMAT) as tar:
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
                        ti.mtime = epoch
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
                            ti.mtime = epoch
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
                    ti.mtime = epoch
                    ti.mode = 0o755 if is_exec or arcname.endswith(".py") or arcname.endswith(".sh") else 0o644
                    with open(file_path, "rb") as f:
                        tar.addfile(ti, f)
    
                # Add frontend files to /usr/share/cockpit/<plugin_name>/
                share_target = f"usr/share/cockpit/{plugin_name}"
                manifest_file = os.path.join(plugin_dir, "manifest.json")
                if os.path.exists(manifest_file):
                    add_file_to_tar(manifest_file, f"{share_target}/manifest.json")
    
                upstream_file = os.path.join(plugin_dir, "upstream.json")
                if os.path.exists(upstream_file):
                    add_file_to_tar(upstream_file, f"{share_target}/upstream.json")
    
                for root, dirs, files in os.walk(dist_dir):
                    dirs.sort()
                    files.sort()
                    rel_dir = os.path.relpath(root, dist_dir)
                    target_dir = share_target if rel_dir == "." else f"{share_target}/{rel_dir}"
                    for f in files:
                        if f.startswith("backend") or f == "manifest.json":
                            continue
                        file_path = os.path.join(root, f)
                        arcname = f"{target_dir}/{f}"
                        add_file_to_tar(file_path, arcname)
    
                # Add backend files to /usr/libexec/<helper_dir_name>/
                libexec_target = f"usr/libexec/{helper_dir_name}"
                if os.path.exists(backend_dir):
                    for root, dirs, files in os.walk(backend_dir):
                        dirs[:] = [d for d in dirs if d != "__pycache__" and d != "tests"]
                        dirs.sort()
                        files.sort()
                        rel_dir = os.path.relpath(root, backend_dir)
                        target_dir = libexec_target if rel_dir == "." else f"{libexec_target}/{rel_dir}"
                        for f in files:
                            if f.startswith(".") or f.endswith(".pyc") or f.endswith(".pyo"):
                                continue
                            file_path = os.path.join(root, f)
                            arcname = f"{target_dir}/{f}"
                            add_file_to_tar(file_path, arcname, is_exec=f.endswith(".py"))
    
                # Add shared cockpit_common python library per-helper
                common_py_dir = "packages/common/python/cockpit_common"
                if os.path.exists(common_py_dir):
                    target_base = f"usr/libexec/{helper_dir_name}/cockpit_common"
                    for root, dirs, files in os.walk(common_py_dir):
                        dirs[:] = [d for d in dirs if d != "__pycache__" and d != "tests"]
                        dirs.sort()
                        files.sort()
                        rel_dir = os.path.relpath(root, common_py_dir)
                        target_dir = target_base if rel_dir == "." else f"{target_base}/{rel_dir}"
                        for f in files:
                            if f.startswith(".") or f.endswith(".pyc") or f.endswith(".pyo"):
                                continue
                            file_path = os.path.join(root, f)
                            arcname = f"{target_dir}/{f}"
                            add_file_to_tar(file_path, arcname, is_exec=f.endswith(".py"))
    
                # Add drop-in configurations (systemd, caddy, tmpfiles)
                packaging_dir = os.path.join(plugin_dir, "packaging")
                if os.path.exists(packaging_dir):
                    sysd_conf = os.path.join(packaging_dir, "systemd", "10-code-server.conf")
                    if os.path.isfile(sysd_conf):
                        add_file_to_tar(sysd_conf, "etc/systemd/system/cockpit.socket.d/10-code-server.conf")
                    caddy_service = os.path.join(packaging_dir, "systemd", "cockpit-caddy.service")
                    if os.path.isfile(caddy_service):
                        add_file_to_tar(caddy_service, "etc/systemd/system/cockpit-caddy.service")
                    caddyfile = os.path.join(packaging_dir, "caddy", "Caddyfile")
                    if os.path.isfile(caddyfile):
                        add_file_to_tar(caddyfile, "etc/cockpit-code-server/Caddyfile")
                    tmpf_conf = os.path.join(packaging_dir, "tmpfiles", "cockpit-code-server.conf")
                    if os.path.isfile(tmpf_conf):
                        add_file_to_tar(tmpf_conf, "usr/lib/tmpfiles.d/cockpit-code-server.conf")
    
                if plugin_name == "code-server":
                    caddy_bytes = get_caddy_binary(plugin_dir, target_arch)
                    if caddy_bytes:
                        ti = tarfile.TarInfo(name=f"{libexec_target}/caddy")
                        ti.size = len(caddy_bytes)
                        ti.uid = 0
                        ti.gid = 0
                        ti.uname = "root"
                        ti.gname = "root"
                        ti.mtime = epoch
                        ti.mode = 0o755
                        tar.addfile(ti, io.BytesIO(caddy_bytes))
    
        data_tar_bytes = data_tar_io.getvalue()

        deb_filename = f"{pkg_name}_{version}_{target_arch}.deb"
        deb_path = os.path.join(output_dir, deb_filename)

        create_ar_archive(deb_path, [
            ("debian-binary", debian_binary),
            ("control.tar.gz", control_tar_bytes),
            ("data.tar.gz", data_tar_bytes)
        ])

        print(f"Created Debian package: {deb_path} ({os.path.getsize(deb_path)} bytes)")
        created_debs.append(deb_path)

    return created_debs

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Build Debian package for Cockpit plugin")
    parser.add_argument("plugin_dir", help="Path to plugin directory (e.g. zfs-storage)")
    parser.add_argument("--output-dir", default="dist-debs", help="Output directory for .deb files")
    parser.add_argument("--version", default="1.0.0", help="Package version")
    args = parser.parse_args()

    build_deb(args.plugin_dir, args.output_dir, args.version)
