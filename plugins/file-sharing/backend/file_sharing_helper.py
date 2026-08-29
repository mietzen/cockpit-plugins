#!/usr/bin/env python3
"""
Privileged backend helper for Cockpit File Sharing plugin.
Handles SMB/NFS management, Samba user passdb operations, service management, and ZFS discovery.
"""
import argparse
import json
import os
import pwd
import re
import shutil
import subprocess
import sys
from typing import Any, Dict, List, Optional, Tuple

# Ensure local backend imports resolve
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from access_matrix import calculate_nfs_client_matrix, calculate_smb_user_matrix
from nfs_parser import NfsParser
from smb_parser import SmbParser


def run_cmd(cmd: List[str], check: bool = False, input_data: Optional[str] = None) -> Tuple[int, str, str]:
    try:
        p = subprocess.run(
            cmd,
            input=input_data if input_data is not None else None,
            capture_output=True,
            text=True,
            check=check,
        )
        return p.returncode, p.stdout.strip(), p.stderr.strip()
    except Exception as e:
        return -1, "", str(e)


def get_service_status(unit: str) -> Dict[str, Any]:
    rc, out, _ = run_cmd(["systemctl", "is-active", unit])
    active_state = out.strip() if rc == 0 else "inactive"
    rc_enabled, out_enabled, _ = run_cmd(["systemctl", "is-enabled", unit])
    enabled_state = out_enabled.strip() if rc_enabled == 0 else "disabled"
    is_installed = shutil.which("systemctl") is not None and rc in (0, 3)

    return {
        "unit": unit,
        "active": active_state == "active",
        "state": active_state,
        "enabled": enabled_state == "enabled",
        "installed": active_state != "unknown",
    }


def get_all_services_status() -> Dict[str, Any]:
    # Check Debian nfs-kernel-server vs RHEL nfs-server
    nfs_unit = "nfs-kernel-server" if os.path.exists("/lib/systemd/system/nfs-kernel-server.service") else "nfs-server"
    return {
        "smbd": get_service_status("smbd"),
        "nmbd": get_service_status("nmbd"),
        "nfs": get_service_status(nfs_unit),
    }


def get_smb_users() -> List[Dict[str, Any]]:
    if not shutil.which("pdbedit"):
        return []

    rc, out, _ = run_cmd(["pdbedit", "-L", "-v"])
    if rc != 0:
        return []

    users: List[Dict[str, Any]] = []
    current: Dict[str, Any] = {}

    for line in out.splitlines():
        if line.startswith("---------------"):
            if current.get("username"):
                users.append(current)
            current = {}
            continue

        if ":" in line:
            k, v = line.split(":", 1)
            k = k.strip()
            v = v.strip()
            if k == "Unix username":
                current["username"] = v
            elif k == "Full Name":
                current["full_name"] = v
            elif k == "User SID":
                current["sid"] = v
            elif k == "Account Flags":
                current["flags"] = v
                # 'D' in flags indicates disabled account in Samba
                current["is_enabled"] = "D" not in v

    if current.get("username"):
        users.append(current)

    return users


def get_system_unix_users() -> List[str]:
    """Returns local non-system Unix users who can be added to Samba."""
    users = []
    for entry in pwd.getpwall():
        # Typically normal human users UID >= 1000 and have a valid shell
        if entry.pw_uid >= 1000 and not entry.pw_shell.endswith(("nologin", "false")):
            users.append(entry.pw_name)
    return sorted(users)


def get_smb_sessions() -> List[Dict[str, Any]]:
    if not shutil.which("smbstatus"):
        return []

    rc, out, _ = run_cmd(["smbstatus", "-b"])
    if rc != 0:
        return []

    sessions = []
    lines = out.splitlines()
    in_section = False

    for line in lines:
        if line.startswith("PID") and "Username" in line:
            in_section = True
            continue
        if line.startswith("---"):
            continue
        if not line.strip() or line.startswith("Service") or line.startswith("Locked"):
            in_section = False
            continue

        if in_section:
            parts = line.split()
            if len(parts) >= 4:
                sessions.append({
                    "pid": parts[0],
                    "username": parts[1],
                    "group": parts[2],
                    "machine": parts[3],
                    "protocol": parts[4] if len(parts) > 4 else "SMB3",
                })

    return sessions


def get_zfs_mountpoints() -> List[Dict[str, str]]:
    if not shutil.which("zfs"):
        return []

    rc, out, _ = run_cmd(["zfs", "list", "-H", "-o", "name,mountpoint,type"])
    if rc != 0:
        return []

    mounts = []
    for line in out.splitlines():
        parts = line.split("\t")
        if len(parts) >= 3 and parts[2] == "filesystem" and parts[1] not in ("none", "legacy", "-"):
            mounts.append({
                "dataset": parts[0],
                "mountpoint": parts[1],
            })

    return mounts


def testparm_verify() -> Tuple[bool, str]:
    if not shutil.which("testparm"):
        return True, "testparm not installed, skipping syntax verification"
    rc, _, err = run_cmd(["testparm", "-s"])
    if rc != 0:
        return False, f"Samba configuration testparm check failed: {err}"
    return True, "testparm verification successful"


def reload_smb() -> None:
    if shutil.which("systemctl"):
        run_cmd(["systemctl", "reload-or-restart", "smbd"])


def reload_nfs() -> Tuple[bool, str]:
    if shutil.which("exportfs"):
        rc, out, err = run_cmd(["exportfs", "-ra"])
        if rc != 0:
            return False, f"exportfs error: {err or out}"
    return True, "NFS exports reloaded"


def handle_get_overview(args: argparse.Namespace) -> Dict[str, Any]:
    begin_p = getattr(args, "ansible_begin", None) or SmbParser().begin_pattern
    end_p = getattr(args, "ansible_end", None) or SmbParser().end_pattern

    smb = SmbParser(begin_pattern=begin_p, end_pattern=end_p)
    smb_data = smb.parse()

    nfs = NfsParser(begin_pattern=begin_p, end_pattern=end_p)
    nfs_exports = nfs.parse_all()

    smb_users = get_smb_users()
    unix_users = get_system_unix_users()
    services = get_all_services_status()
    sessions = get_smb_sessions()
    zfs_mounts = get_zfs_mountpoints()

    user_matrix = calculate_smb_user_matrix(smb_data["shares"], smb_users)
    nfs_client_map = calculate_nfs_client_matrix(nfs_exports)

    return {
        "status": "success",
        "services": services,
        "smb": {
            "global": smb_data["global"],
            "shares": smb_data["shares"],
        },
        "nfs": {
            "exports": nfs_exports,
            "client_map": nfs_client_map,
        },
        "users": {
            "smb_users": smb_users,
            "unix_users": unix_users,
            "access_matrix": user_matrix,
        },
        "sessions": sessions,
        "zfs_mounts": zfs_mounts,
    }


def main():
    parser = argparse.ArgumentParser(description="Cockpit File Sharing Privileged Backend Helper")
    subparsers = parser.add_subparsers(dest="action", required=True)

    # Overview
    p_overview = subparsers.add_parser("get_overview")
    p_overview.add_argument("--ansible-begin", default=None)
    p_overview.add_argument("--ansible-end", default=None)

    # SMB Actions
    p_save_smb = subparsers.add_parser("save_smb_share")
    p_save_smb.add_argument("--data", required=True, help="JSON share configuration")

    p_del_smb = subparsers.add_parser("delete_smb_share")
    p_del_smb.add_argument("--name", required=True)

    p_save_global = subparsers.add_parser("save_smb_global")
    p_save_global.add_argument("--data", required=True, help="JSON global parameters")

    # NFS Actions
    p_save_nfs = subparsers.add_parser("save_nfs_export")
    p_save_nfs.add_argument("--data", required=True, help="JSON export configuration")

    p_del_nfs = subparsers.add_parser("delete_nfs_export")
    p_del_nfs.add_argument("--path", required=True)

    # User Actions
    p_create_user = subparsers.add_parser("create_smb_user")
    p_create_user.add_argument("--username", required=True)
    p_create_user.add_argument("--password", required=True)

    p_passwd_user = subparsers.add_parser("set_smb_user_password")
    p_passwd_user.add_argument("--username", required=True)
    p_passwd_user.add_argument("--password", required=True)

    p_state_user = subparsers.add_parser("set_smb_user_state")
    p_state_user.add_argument("--username", required=True)
    p_state_user.add_argument("--enable", action="store_true")

    p_del_user = subparsers.add_parser("delete_smb_user")
    p_del_user.add_argument("--username", required=True)

    # Service Action
    p_svc = subparsers.add_parser("service_action")
    p_svc.add_argument("--service", required=True, choices=["smbd", "nmbd", "nfs", "nfs-kernel-server", "nfs-server"])
    p_svc.add_argument("--verb", required=True, choices=["start", "stop", "restart", "reload"])

    # ZFS Mounts
    subparsers.add_parser("get_zfs_mounts")

    args = parser.parse_args()

    try:
        if args.action == "get_overview":
            res = handle_get_overview(args)
            print(json.dumps(res))

        elif args.action == "save_smb_share":
            share_data = json.loads(args.data)
            smb = SmbParser()
            ok, msg = smb.save_share(share_data)
            if not ok:
                print(json.dumps({"status": "error", "message": msg}))
                sys.exit(1)
            t_ok, t_msg = testparm_verify()
            if not t_ok:
                print(json.dumps({"status": "error", "message": t_msg}))
                sys.exit(1)
            reload_smb()
            print(json.dumps({"status": "success", "message": msg}))

        elif args.action == "delete_smb_share":
            smb = SmbParser()
            ok, msg = smb.delete_share(args.name)
            if not ok:
                print(json.dumps({"status": "error", "message": msg}))
                sys.exit(1)
            reload_smb()
            print(json.dumps({"status": "success", "message": msg}))

        elif args.action == "save_smb_global":
            global_data = json.loads(args.data)
            smb = SmbParser()
            ok, msg = smb.save_global(global_data)
            if not ok:
                print(json.dumps({"status": "error", "message": msg}))
                sys.exit(1)
            t_ok, t_msg = testparm_verify()
            if not t_ok:
                print(json.dumps({"status": "error", "message": t_msg}))
                sys.exit(1)
            reload_smb()
            print(json.dumps({"status": "success", "message": msg}))

        elif args.action == "save_nfs_export":
            export_data = json.loads(args.data)
            nfs = NfsParser()
            ok, msg = nfs.save_export(export_data["path"], export_data.get("clients", []))
            if not ok:
                print(json.dumps({"status": "error", "message": msg}))
                sys.exit(1)
            r_ok, r_msg = reload_nfs()
            if not r_ok:
                print(json.dumps({"status": "error", "message": r_msg}))
                sys.exit(1)
            print(json.dumps({"status": "success", "message": msg}))

        elif args.action == "delete_nfs_export":
            nfs = NfsParser()
            ok, msg = nfs.delete_export(args.path)
            if not ok:
                print(json.dumps({"status": "error", "message": msg}))
                sys.exit(1)
            reload_nfs()
            print(json.dumps({"status": "success", "message": msg}))

        elif args.action == "create_smb_user" or args.action == "set_smb_user_password":
            input_pass = f"{args.password}\n{args.password}\n"
            flags = ["-a", "-s"] if args.action == "create_smb_user" else ["-s"]
            rc, out, err = run_cmd(["smbpasswd"] + flags + [args.username], input_data=input_pass)
            if rc != 0:
                print(json.dumps({"status": "error", "message": f"smbpasswd failed: {err or out}"}))
                sys.exit(1)
            print(json.dumps({"status": "success", "message": f"Password set for user '{args.username}'"}))

        elif args.action == "set_smb_user_state":
            flag = "-e" if args.enable else "-d"
            verb = "enabled" if args.enable else "disabled"
            rc, out, err = run_cmd(["smbpasswd", flag, args.username])
            if rc != 0:
                print(json.dumps({"status": "error", "message": f"smbpasswd state update failed: {err or out}"}))
                sys.exit(1)
            print(json.dumps({"status": "success", "message": f"User '{args.username}' {verb}"}))

        elif args.action == "delete_smb_user":
            rc, out, err = run_cmd(["smbpasswd", "-x", args.username])
            if rc != 0:
                print(json.dumps({"status": "error", "message": f"smbpasswd deletion failed: {err or out}"}))
                sys.exit(1)
            print(json.dumps({"status": "success", "message": f"User '{args.username}' deleted from Samba"}))

        elif args.action == "service_action":
            svc_name = args.service
            if svc_name == "nfs":
                svc_name = "nfs-kernel-server" if os.path.exists("/lib/systemd/system/nfs-kernel-server.service") else "nfs-server"
            rc, out, err = run_cmd(["systemctl", args.verb, svc_name])
            if rc != 0:
                print(json.dumps({"status": "error", "message": f"Failed to {args.verb} {svc_name}: {err or out}"}))
                sys.exit(1)
            print(json.dumps({"status": "success", "message": f"Service {svc_name} {args.verb}ed successfully"}))

        elif args.action == "get_zfs_mounts":
            mounts = get_zfs_mountpoints()
            print(json.dumps({"status": "success", "zfs_mounts": mounts}))

    except Exception as e:
        print(json.dumps({"status": "error", "message": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
