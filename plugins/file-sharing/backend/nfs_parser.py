#!/usr/bin/env python3
"""
NFS Exports Parser & Generator.
Parses /etc/exports and /etc/exports.d/*.exports with wildcard Ansible managed block support.
Manages Cockpit exports cleanly in /etc/exports.d/cockpit.exports.
"""
import fnmatch
import glob
import os
import re
from typing import Any, Dict, List, Optional, Tuple

DEFAULT_BEGIN_MARKER = "# <-- BEGIN ANSIBLE MANAGED * CONFIG -->"
DEFAULT_END_MARKER = "# <-- END ANSIBLE MANAGED * CONFIG -->"


def wildcard_to_regex(pattern: str) -> re.Pattern:
    escaped = fnmatch.translate(pattern)
    regex_str = escaped.replace(".*", "(.*?)")
    return re.compile(f"^{regex_str}$", re.IGNORECASE)


class NfsParser:
    def __init__(
        self,
        main_exports_path: str = "/etc/exports",
        exports_d_dir: str = "/etc/exports.d",
        cockpit_exports_file: str = "/etc/exports.d/cockpit.exports",
        begin_pattern: str = DEFAULT_BEGIN_MARKER,
        end_pattern: str = DEFAULT_END_MARKER,
    ):
        self.main_exports_path = main_exports_path
        self.exports_d_dir = exports_d_dir
        self.cockpit_exports_file = cockpit_exports_file
        self.begin_regex = wildcard_to_regex(begin_pattern)
        self.end_regex = wildcard_to_regex(end_pattern)

    def parse_line(self, line: str, file_path: str, is_managed: bool, managed_by: str) -> Optional[Dict[str, Any]]:
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            return None

        # Format: /path/to/export client1(opts) client2(opts)
        parts = stripped.split()
        if not parts:
            return None

        export_path = parts[0]
        clients: List[Dict[str, Any]] = []

        # Find all client(options) pairs in the remainder of the line
        client_tokens = " ".join(parts[1:])
        matches = re.findall(r"([^\s\(]+)(?:\(([^\)]*)\))?", client_tokens)

        for host, opts in matches:
            if not host:
                continue
            opts_list = [o.strip() for o in opts.split(",") if o.strip()] if opts else ["ro", "sync", "no_subtree_check"]
            clients.append({
                "host": host,
                "options": opts_list,
                "read_only": "ro" in opts_list or "rw" not in opts_list,
                "sync": "async" not in opts_list,
                "root_squash": "no_root_squash" not in opts_list,
                "all_squash": "all_squash" in opts_list,
                "no_subtree_check": "no_subtree_check" in opts_list,
            })

        if not clients:
            clients.append({
                "host": "*",
                "options": ["ro", "sync", "no_subtree_check"],
                "read_only": True,
                "sync": True,
                "root_squash": True,
                "all_squash": False,
                "no_subtree_check": True,
            })

        return {
            "path": export_path,
            "clients": clients,
            "file": file_path,
            "is_managed": is_managed,
            "managed_by": managed_by,
            "raw_line": stripped,
        }

    def parse_all(self) -> List[Dict[str, Any]]:
        exports: List[Dict[str, Any]] = []
        files_to_read = []

        if os.path.exists(self.main_exports_path):
            files_to_read.append(self.main_exports_path)

        if os.path.exists(self.exports_d_dir):
            for exp_f in sorted(glob.glob(os.path.join(self.exports_d_dir, "*.exports"))):
                if exp_f not in files_to_read:
                    files_to_read.append(exp_f)

        for fpath in files_to_read:
            try:
                with open(fpath, "r", encoding="utf-8", errors="replace") as f:
                    lines = f.readlines()
            except Exception:
                continue

            in_managed = False
            managed_name = ""

            for line in lines:
                stripped = line.strip()
                begin_m = self.begin_regex.match(stripped) or re.match(
                    r"^#\s*<--\s*BEGIN ANSIBLE MANAGED\s+(.*?)\s*CONFIG\s*-->", stripped, re.IGNORECASE
                )
                if begin_m:
                    in_managed = True
                    managed_name = begin_m.group(1).strip() if begin_m.groups() else "Ansible"

                end_m = self.end_regex.match(stripped) or re.match(
                    r"^#\s*<--\s*END ANSIBLE MANAGED\s+(.*?)\s*CONFIG\s*-->", stripped, re.IGNORECASE
                )
                if end_m:
                    in_managed = False
                    managed_name = ""

                parsed = self.parse_line(line, fpath, in_managed, managed_name)
                if parsed:
                    exports.append(parsed)

        return exports

    def save_export(self, export_path: str, clients: List[Dict[str, Any]]) -> Tuple[bool, str]:
        """Saves a Cockpit-managed export to /etc/exports.d/cockpit.exports."""
        if not export_path or not export_path.startswith("/"):
            return False, "Export path must be an absolute path starting with '/'"

        # Verify not overwriting an Ansible managed export elsewhere
        all_exports = self.parse_all()
        for exp in all_exports:
            if exp["path"] == export_path and exp.get("is_managed"):
                return False, f"Export '{export_path}' is managed by Ansible ({exp.get('managed_by')}) and is read-only"

        os.makedirs(self.exports_d_dir, exist_ok=True)
        content = ""
        if os.path.exists(self.cockpit_exports_file):
            with open(self.cockpit_exports_file, "r", encoding="utf-8", errors="replace") as f:
                content = f.read()

        client_entries = []
        for c in clients:
            host = c.get("host", "*").strip() or "*"
            opts = c.get("options", [])
            if not opts:
                opts = []
                opts.append("ro" if c.get("read_only", False) else "rw")
                opts.append("sync" if c.get("sync", True) else "async")
                opts.append("no_subtree_check" if c.get("no_subtree_check", True) else "subtree_check")
                if c.get("root_squash", True):
                    opts.append("root_squash")
                else:
                    opts.append("no_root_squash")
                if c.get("all_squash", False):
                    opts.append("all_squash")
                if c.get("anonuid"):
                    opts.append(f"anonuid={c['anonuid']}")
                if c.get("anongid"):
                    opts.append(f"anongid={c['anongid']}")
            client_entries.append(f"{host}({','.join(opts)})")

        export_line = f"{export_path} {' '.join(client_entries)}"

        lines = content.splitlines()
        found = False
        new_lines = []

        for line in lines:
            stripped = line.strip()
            if stripped.startswith(export_path + " ") or stripped == export_path:
                new_lines.append(export_line)
                found = True
            else:
                new_lines.append(line)

        if not found:
            new_lines.append(export_line)

        final_content = "\n".join(new_lines).strip() + "\n"
        tmp_path = f"{self.cockpit_exports_file}.tmp"
        with open(tmp_path, "w", encoding="utf-8") as f:
            f.write(final_content)
        os.replace(tmp_path, self.cockpit_exports_file)
        return True, f"NFS export for '{export_path}' saved successfully"

    def delete_export(self, export_path: str) -> Tuple[bool, str]:
        """Deletes an export from /etc/exports.d/cockpit.exports."""
        all_exports = self.parse_all()
        for exp in all_exports:
            if exp["path"] == export_path and exp.get("is_managed"):
                return False, f"Export '{export_path}' is managed by Ansible ({exp.get('managed_by')}) and cannot be deleted"

        if not os.path.exists(self.cockpit_exports_file):
            return False, f"Export file '{self.cockpit_exports_file}' does not exist"

        with open(self.cockpit_exports_file, "r", encoding="utf-8", errors="replace") as f:
            content = f.read()

        lines = content.splitlines()
        new_lines = [l for l in lines if not (l.strip().startswith(export_path + " ") or l.strip() == export_path)]

        if len(new_lines) == len(lines):
            return False, f"Export '{export_path}' not found in '{self.cockpit_exports_file}'"

        final_content = "\n".join(new_lines).strip() + "\n"
        tmp_path = f"{self.cockpit_exports_file}.tmp"
        with open(tmp_path, "w", encoding="utf-8") as f:
            f.write(final_content)
        os.replace(tmp_path, self.cockpit_exports_file)
        return True, f"NFS export '{export_path}' deleted successfully"


def parse_nfs_conf(content: str) -> Dict[str, Dict[str, str]]:
    """Parses /etc/nfs.conf INI-style configuration file."""
    sections: Dict[str, Dict[str, str]] = {}
    current_section = "global"
    sections[current_section] = {}

    for line in content.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or stripped.startswith(";"):
            continue

        if stripped.startswith("[") and stripped.endswith("]"):
            current_section = stripped[1:-1].strip().lower()
            if current_section not in sections:
                sections[current_section] = {}
            continue

        if "=" in stripped:
            k, v = stripped.split("=", 1)
            k = k.strip().lower()
            v = v.strip()
            sections[current_section][k] = v

    return sections


def get_nfs_global(config_path: str = "/etc/nfs.conf") -> Dict[str, Any]:
    """Retrieves global NFS server configuration from /etc/nfs.conf with safe defaults."""
    content = ""
    if os.path.exists(config_path):
        try:
            with open(config_path, "r", encoding="utf-8", errors="replace") as f:
                content = f.read()
        except Exception:
            pass

    parsed = parse_nfs_conf(content)
    nfsd = parsed.get("nfsd", {})

    def is_enabled(val: str, default: bool = True) -> bool:
        if not val:
            return default
        return val.lower() in ("y", "yes", "1", "true", "on")

    return {
        "threads": int(nfsd.get("threads", 8)) if nfsd.get("threads", "").isdigit() else 8,
        "vers3": is_enabled(nfsd.get("vers3", "y"), default=True),
        "vers4": is_enabled(nfsd.get("vers4", "y"), default=True),
        "vers4_1": is_enabled(nfsd.get("vers4.1", "y"), default=True),
        "vers4_2": is_enabled(nfsd.get("vers4.2", "y"), default=True),
        "grace_time": int(nfsd.get("grace-time", 90)) if nfsd.get("grace-time", "").isdigit() else 90,
        "lease_time": int(nfsd.get("lease-time", 90)) if nfsd.get("lease-time", "").isdigit() else 90,
        "port": int(nfsd.get("port", 2049)) if nfsd.get("port", "").isdigit() else 2049,
    }


def save_nfs_global(settings: Dict[str, Any], config_path: str = "/etc/nfs.conf") -> Tuple[bool, str]:
    """Saves global NFS server configuration to /etc/nfs.conf under [nfsd]."""
    content = ""
    if os.path.exists(config_path):
        try:
            with open(config_path, "r", encoding="utf-8", errors="replace") as f:
                content = f.read()
        except Exception:
            pass

    lines = content.splitlines()
    in_nfsd = False
    nfsd_found = False
    new_lines = []

    for line in lines:
        stripped = line.strip()
        if stripped.startswith("[") and stripped.endswith("]"):
            sec = stripped[1:-1].strip().lower()
            if sec == "nfsd":
                in_nfsd = True
                nfsd_found = True
                new_lines.append("[nfsd]")
                continue
            else:
                if in_nfsd:
                    in_nfsd = False
                new_lines.append(line)
                continue

        if in_nfsd:
            # Skip old nfsd parameters we manage
            if "=" in stripped:
                k = stripped.split("=", 1)[0].strip().lower()
                if k in ("threads", "vers3", "vers4", "vers4.0", "vers4.1", "vers4.2", "grace-time", "lease-time", "port"):
                    continue
            new_lines.append(line)
        else:
            new_lines.append(line)

    nfsd_params = [
        f"threads = {settings.get('threads', 8)}",
        f"vers3 = {'y' if settings.get('vers3', True) else 'n'}",
        f"vers4 = {'y' if settings.get('vers4', True) else 'n'}",
        f"vers4.1 = {'y' if settings.get('vers4_1', True) else 'n'}",
        f"vers4.2 = {'y' if settings.get('vers4_2', True) else 'n'}",
        f"grace-time = {settings.get('grace_time', 90)}",
        f"lease-time = {settings.get('lease_time', 90)}",
        f"port = {settings.get('port', 2049)}",
    ]

    if not nfsd_found:
        new_lines.append("\n[nfsd]")
        for p in nfsd_params:
            new_lines.append(f" {p}")
    else:
        # Insert params right after [nfsd]
        idx = new_lines.index("[nfsd]") + 1
        for i, p in enumerate(nfsd_params):
            new_lines.insert(idx + i, f" {p}")

    final_content = "\n".join(new_lines).strip() + "\n"
    tmp_path = f"{config_path}.tmp"
    os.makedirs(os.path.dirname(config_path) or ".", exist_ok=True)
    with open(tmp_path, "w", encoding="utf-8") as f:
        f.write(final_content)
    os.replace(tmp_path, config_path)
    return True, "Global NFS settings saved successfully"
