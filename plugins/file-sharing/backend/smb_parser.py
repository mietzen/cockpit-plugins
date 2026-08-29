#!/usr/bin/env python3
"""
Samba Configuration Parser & Generator.
Preserves comments, formatting, and detects wildcard Ansible managed blocks.
"""
import fnmatch
import os
import re
from typing import Any, Dict, List, Optional, Tuple

DEFAULT_BEGIN_MARKER = "# <-- BEGIN ANSIBLE MANAGED * CONFIG -->"
DEFAULT_END_MARKER = "# <-- END ANSIBLE MANAGED * CONFIG -->"


def wildcard_to_regex(pattern: str) -> re.Pattern:
    """Converts a glob pattern like '# <-- BEGIN ANSIBLE MANAGED * CONFIG -->' to a regex."""
    escaped = fnmatch.translate(pattern)
    # Extract group for the wildcard match
    # Replace the .* in regex with (.*?)
    regex_str = escaped.replace(".*", "(.*?)")
    return re.compile(f"^{regex_str}$", re.IGNORECASE)


class SmbParser:
    def __init__(
        self,
        config_path: str = "/etc/samba/smb.conf",
        begin_pattern: str = DEFAULT_BEGIN_MARKER,
        end_pattern: str = DEFAULT_END_MARKER,
    ):
        self.config_path = config_path
        self.begin_pattern = begin_pattern
        self.end_pattern = end_pattern
        self.begin_regex = wildcard_to_regex(begin_pattern)
        self.end_regex = wildcard_to_regex(end_pattern)

    def parse(self, content: Optional[str] = None) -> Dict[str, Any]:
        if content is None:
            if not os.path.exists(self.config_path):
                return {"global": {}, "shares": [], "raw_lines": []}
            with open(self.config_path, "r", encoding="utf-8", errors="replace") as f:
                content = f.read()

        lines = content.splitlines()
        global_params: Dict[str, str] = {}
        shares: List[Dict[str, Any]] = []

        current_section: Optional[str] = None
        current_params: Dict[str, str] = {}
        current_managed: bool = False
        current_managed_by: str = ""
        current_comments: List[str] = []

        in_managed_block = False
        managed_block_name = ""

        def flush_section():
            nonlocal current_section, current_params, current_managed, current_managed_by, current_comments
            if not current_section:
                return
            if current_section.lower() == "global":
                global_params.update(current_params)
            else:
                shares.append({
                    "name": current_section,
                    "path": current_params.get("path", ""),
                    "comment": current_params.get("comment", ""),
                    "read_only": current_params.get("read only", "yes").lower() in ("yes", "true", "1"),
                    "browseable": current_params.get("browseable", "yes").lower() in ("yes", "true", "1"),
                    "guest_ok": current_params.get("guest ok", "no").lower() in ("yes", "true", "1")
                    or current_params.get("public", "no").lower() in ("yes", "true", "1"),
                    "valid_users": current_params.get("valid users", ""),
                    "write_list": current_params.get("write list", ""),
                    "read_list": current_params.get("read list", ""),
                    "invalid_users": current_params.get("invalid users", ""),
                    "force_user": current_params.get("force user", ""),
                    "force_group": current_params.get("force group", ""),
                    "create_mask": current_params.get("create mask", current_params.get("create mode", "0744")),
                    "directory_mask": current_params.get("directory mask", current_params.get("directory mode", "0755")),
                    "vfs_objects": current_params.get("vfs objects", ""),
                    "is_managed": current_managed,
                    "managed_by": current_managed_by,
                    "raw_params": dict(current_params),
                })
            current_section = None
            current_params = {}
            current_managed = False
            current_managed_by = ""
            current_comments = []

        for line in lines:
            stripped = line.strip()

            # Check for Ansible Block Start
            begin_match = self.begin_regex.match(stripped)
            if not begin_match:
                # Fallback standard pattern check
                fallback_begin = re.match(r"^#\s*<--\s*BEGIN ANSIBLE MANAGED\s+(.*?)\s*CONFIG\s*-->", stripped, re.IGNORECASE)
                if fallback_begin:
                    in_managed_block = True
                    managed_block_name = fallback_begin.group(1).strip()
            else:
                in_managed_block = True
                managed_block_name = begin_match.group(1).strip() if begin_match.groups() else "Ansible"

            # Check for Ansible Block End
            end_match = self.end_regex.match(stripped)
            if not end_match:
                fallback_end = re.match(r"^#\s*<--\s*END ANSIBLE MANAGED\s+(.*?)\s*CONFIG\s*-->", stripped, re.IGNORECASE)
                if fallback_end:
                    in_managed_block = False
                    managed_block_name = ""
            else:
                in_managed_block = False
                managed_block_name = ""

            # Check for Section Header [section]
            section_match = re.match(r"^\s*\[([^\]]+)\]\s*$", line)
            if section_match:
                flush_section()
                current_section = section_match.group(1).strip()
                current_managed = in_managed_block
                current_managed_by = managed_block_name
                continue

            # Check for Parameter key = value
            if "=" in line and not stripped.startswith("#") and not stripped.startswith(";"):
                parts = line.split("=", 1)
                k = parts[0].strip().lower()
                v = parts[1].strip()
                current_params[k] = v
                if in_managed_block:
                    current_managed = True
                    current_managed_by = managed_block_name
            elif stripped.startswith("#") or stripped.startswith(";"):
                current_comments.append(line)

        flush_section()
        return {
            "global": global_params,
            "shares": shares,
            "raw_lines": lines,
        }

    def save_share(self, share_data: Dict[str, Any]) -> Tuple[bool, str]:
        """Adds or updates a Samba share in smb.conf, preserving existing comments and structure."""
        share_name = share_data.get("name", "").strip()
        if not share_name:
            return False, "Share name cannot be empty"

        content = ""
        if os.path.exists(self.config_path):
            with open(self.config_path, "r", encoding="utf-8", errors="replace") as f:
                content = f.read()

        parsed = self.parse(content)
        # Check if attempting to overwrite an Ansible-managed share
        for existing in parsed["shares"]:
            if existing["name"].lower() == share_name.lower() and existing.get("is_managed"):
                return False, f"Share '[{share_name}]' is managed by Ansible ({existing.get('managed_by')}) and is read-only"

        # Build share block string
        def bool_str(val: Any) -> str:
            return "yes" if val in (True, "yes", "true", "1", 1) else "no"

        params = [
            f"   path = {share_data.get('path', '')}",
        ]
        if share_data.get("comment"):
            params.append(f"   comment = {share_data['comment']}")
        params.append(f"   read only = {bool_str(share_data.get('read_only', True))}")
        params.append(f"   browseable = {bool_str(share_data.get('browseable', True))}")
        params.append(f"   guest ok = {bool_str(share_data.get('guest_ok', False))}")

        if share_data.get("valid_users"):
            params.append(f"   valid users = {share_data['valid_users']}")
        if share_data.get("write_list"):
            params.append(f"   write list = {share_data['write_list']}")
        if share_data.get("read_list"):
            params.append(f"   read list = {share_data['read_list']}")
        if share_data.get("invalid_users"):
            params.append(f"   invalid users = {share_data['invalid_users']}")
        if share_data.get("force_user"):
            params.append(f"   force user = {share_data['force_user']}")
        if share_data.get("force_group"):
            params.append(f"   force group = {share_data['force_group']}")
        if share_data.get("create_mask"):
            params.append(f"   create mask = {share_data['create_mask']}")
        if share_data.get("directory_mask"):
            params.append(f"   directory mask = {share_data['directory_mask']}")
        if share_data.get("vfs_objects"):
            params.append(f"   vfs objects = {share_data['vfs_objects']}")

        new_block = f"[{share_name}]\n" + "\n".join(params) + "\n"

        # Replace existing or append
        lines = content.splitlines()
        section_start = -1
        section_end = len(lines)

        for i, line in enumerate(lines):
            m = re.match(r"^\s*\[([^\]]+)\]\s*$", line)
            if m:
                if m.group(1).strip().lower() == share_name.lower():
                    section_start = i
                elif section_start != -1:
                    section_end = i
                    break

        if section_start != -1:
            # Replace existing section
            new_lines = lines[:section_start] + [new_block.strip()] + lines[section_end:]
            final_content = "\n".join(new_lines).strip() + "\n"
        else:
            # Append new section
            final_content = content.rstrip() + "\n\n" + new_block

        # Atomic write
        tmp_path = f"{self.config_path}.tmp"
        with open(tmp_path, "w", encoding="utf-8") as f:
            f.write(final_content)
        os.replace(tmp_path, self.config_path)
        return True, f"Share '[{share_name}]' saved successfully"

    def delete_share(self, share_name: str) -> Tuple[bool, str]:
        if not os.path.exists(self.config_path):
            return False, "smb.conf does not exist"

        with open(self.config_path, "r", encoding="utf-8", errors="replace") as f:
            content = f.read()

        parsed = self.parse(content)
        for existing in parsed["shares"]:
            if existing["name"].lower() == share_name.lower() and existing.get("is_managed"):
                return False, f"Share '[{share_name}]' is managed by Ansible ({existing.get('managed_by')}) and cannot be deleted"

        lines = content.splitlines()
        section_start = -1
        section_end = len(lines)

        for i, line in enumerate(lines):
            m = re.match(r"^\s*\[([^\]]+)\]\s*$", line)
            if m:
                if m.group(1).strip().lower() == share_name.lower():
                    section_start = i
                elif section_start != -1:
                    section_end = i
                    break

        if section_start == -1:
            return False, f"Share '[{share_name}]' not found"

        new_lines = lines[:section_start] + lines[section_end:]
        final_content = "\n".join(new_lines).strip() + "\n"

        tmp_path = f"{self.config_path}.tmp"
        with open(tmp_path, "w", encoding="utf-8") as f:
            f.write(final_content)
        os.replace(tmp_path, self.config_path)
        return True, f"Share '[{share_name}]' deleted successfully"

    def save_global(self, global_data: Dict[str, str]) -> Tuple[bool, str]:
        """Updates parameters in the [global] section."""
        content = ""
        if os.path.exists(self.config_path):
            with open(self.config_path, "r", encoding="utf-8", errors="replace") as f:
                content = f.read()

        lines = content.splitlines()
        global_start = -1
        global_end = len(lines)

        for i, line in enumerate(lines):
            m = re.match(r"^\s*\[([^\]]+)\]\s*$", line)
            if m:
                if m.group(1).strip().lower() == "global":
                    global_start = i
                elif global_start != -1:
                    global_end = i
                    break

        # Extract current global params
        current_global = {}
        if global_start != -1:
            for l in lines[global_start + 1 : global_end]:
                if "=" in l and not l.strip().startswith(("#", ";")):
                    k, v = l.split("=", 1)
                    current_global[k.strip().lower()] = v.strip()

        # Update with new values
        for k, v in global_data.items():
            if v is not None and v != "":
                current_global[k.lower()] = str(v)

        global_block_lines = ["[global]"]
        for k, v in current_global.items():
            global_block_lines.append(f"   {k} = {v}")

        if global_start != -1:
            new_lines = lines[:global_start] + global_block_lines + lines[global_end:]
        else:
            new_lines = global_block_lines + [""] + lines

        final_content = "\n".join(new_lines).strip() + "\n"
        tmp_path = f"{self.config_path}.tmp"
        with open(tmp_path, "w", encoding="utf-8") as f:
            f.write(final_content)
        os.replace(tmp_path, self.config_path)
        return True, "Global configuration updated successfully"
