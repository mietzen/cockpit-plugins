#!/usr/bin/env python3
"""
Privileged backend helper for Cockpit File Sharing plugin.
Handles SMB/NFS management, Samba user passdb operations, service management, and ZFS discovery.
"""
import argparse
import grp
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
from nfs_parser import NfsParser, get_nfs_global, save_nfs_global
from smb_parser import SmbParser

COMMON_PY_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../packages/common/python"))
if os.path.exists(COMMON_PY_DIR) and COMMON_PY_DIR not in sys.path:
    sys.path.insert(0, COMMON_PY_DIR)

from cockpit_common.services import get_service_status


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


def get_user_system_groups(username: str) -> List[str]:
    """Retrieves all Unix groups associated with a username via libc/NSS."""
    groups = set()
    try:
        import grp
        entry = pwd.getpwnam(username)
        try:
            gids = os.getgrouplist(username, entry.pw_gid)
            for gid in gids:
                try:
                    groups.add(grp.getgrgid(gid).gr_name.lower())
                except Exception:
                    pass
        except Exception:
            groups.add(grp.getgrgid(entry.pw_gid).gr_name.lower())
    except Exception:
        pass
    return sorted(list(groups))


def get_all_services_status() -> Dict[str, Any]:
    nfs_status = get_service_status("nfs-server")
    if not nfs_status["installed"]:
        nfs_status = get_service_status("nfs-kernel-server")

    return {
        "smbd": get_service_status("smbd"),
        "nmbd": get_service_status("nmbd"),
        "nfs": nfs_status,
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

    for u in users:
        u_name = u.get("username", "")
        if u_name:
            u["groups"] = sorted(list(get_user_system_groups(u_name)))

    return users



def get_system_unix_users() -> List[str]:
    """Returns local non-system Unix users who can be added to Samba."""
    users = []
    for entry in pwd.getpwall():
        # Typically normal human users UID >= 1000 and have a valid shell
        if entry.pw_uid >= 1000 and not entry.pw_shell.endswith(("nologin", "false")):
            users.append(entry.pw_name)
    return sorted(users)


def get_smb_groups() -> List[Dict[str, Any]]:
    """Retrieves all non-system or sharing-related Unix groups with GID and member list."""
    groups: List[Dict[str, Any]] = []
    sharing_group_names = {"sambashare", "smb_users", "smb_admin", "smbusers", "smbadmin", "users"}

    smb_users = {u.get("username", "").lower() for u in get_smb_users() if u.get("username")}

    primary_group_users: Dict[int, List[str]] = {}
    for p in pwd.getpwall():
        if p.pw_uid >= 1000 or p.pw_name in smb_users:
            primary_group_users.setdefault(p.pw_gid, []).append(p.pw_name)

    for g in grp.getgrall():
        members_set = set(g.gr_mem) | set(primary_group_users.get(g.gr_gid, []))
        is_sharing = (
            g.gr_gid >= 1000
            or g.gr_name.lower() in sharing_group_names
            or any(m.lower() in smb_users for m in members_set)
        )
        if is_sharing:
            groups.append({
                "name": g.gr_name,
                "gid": g.gr_gid,
                "members": sorted(list(members_set)),
            })
    return sorted(groups, key=lambda x: x["name"])


def create_smb_group(name: str, members: Optional[List[str]] = None) -> Tuple[bool, str]:
    """Creates a new Unix group for SMB and optionally adds members."""
    if not name or not re.match(r"^[a-zA-Z0-9_\-\.]+$", name):
        return False, f"Invalid group name '{name}'"

    if not shutil.which("groupadd"):
        return False, "groupadd utility not found"

    rc, out, err = run_cmd(["groupadd", name])
    if rc != 0:
        return False, f"Failed to create group: {err or out}"

    if members and shutil.which("gpasswd"):
        for m in members:
            if m.strip():
                run_cmd(["gpasswd", "-a", m.strip(), name])

    return True, f"Group '{name}' created successfully"


def modify_smb_group(name: str, new_name: Optional[str] = None, members: Optional[List[str]] = None) -> Tuple[bool, str]:
    """Modifies a Unix group name and synchronizes member list."""
    if not name:
        return False, "Group name is required"

    target_name = name
    if new_name and new_name.strip() and new_name.strip() != name:
        clean_new = new_name.strip()
        if not re.match(r"^[a-zA-Z0-9_\-\.]+$", clean_new):
            return False, f"Invalid new group name '{clean_new}'"
        rc, out, err = run_cmd(["groupmod", "-n", clean_new, name])
        if rc != 0:
            return False, f"Failed to rename group: {err or out}"
        target_name = clean_new

    if members is not None and shutil.which("gpasswd"):
        try:
            current_entry = grp.getgrnam(target_name)
            current_members = set(current_entry.gr_mem)
        except KeyError:
            current_members = set()

        desired_members = {m.strip() for m in members if m.strip()}

        for m in desired_members - current_members:
            run_cmd(["gpasswd", "-a", m, target_name])

        for m in current_members - desired_members:
            run_cmd(["gpasswd", "-d", m, target_name])

    return True, f"Group '{target_name}' updated successfully"


def delete_smb_group(name: str) -> Tuple[bool, str]:
    """Deletes a Unix group."""
    if not name:
        return False, "Group name is required"

    if not shutil.which("groupdel"):
        return False, "groupdel utility not found"

    rc, out, err = run_cmd(["groupdel", name])
    if rc != 0:
        return False, f"Failed to delete group: {err or out}"

    return True, f"Group '{name}' deleted successfully"


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


def get_system_versions() -> Dict[str, str]:
    smb_ver = "Not installed"
    for bin_path in ["/usr/sbin/smbd", "/usr/bin/smbd", "smbd"]:
        rc, out, _ = run_cmd([bin_path, "-V"])
        if rc == 0 and out:
            smb_ver = out.replace("Version ", "").strip()
            break

    nfs_ver = "Not installed"
    for bin_path in ["/usr/sbin/rpc.nfsd", "/usr/sbin/rpc.mountd", "rpc.nfsd", "rpc.mountd"]:
        rc, out, _ = run_cmd([bin_path, "-V"])
        if rc == 0 and out:
            nfs_ver = out.replace("Version ", "").strip()
            break
    if nfs_ver == "Not installed":
        rc_dpkg, out_dpkg, _ = run_cmd(["dpkg-query", "-W", "-f=${Version}", "nfs-kernel-server"])
        if rc_dpkg == 0 and out_dpkg:
            nfs_ver = out_dpkg.strip()
        else:
            rc_rpm, out_rpm, _ = run_cmd(["rpm", "-q", "--qf", "%{VERSION}-%{RELEASE}", "nfs-utils"])
            if rc_rpm == 0 and out_rpm and "not installed" not in out_rpm:
                nfs_ver = out_rpm.strip()

    return {
        "smb": smb_ver,
        "nfs": nfs_ver,
    }


def handle_get_overview(args: argparse.Namespace) -> Dict[str, Any]:
    begin_p = getattr(args, "ansible_begin", None) or SmbParser().begin_pattern
    end_p = getattr(args, "ansible_end", None) or SmbParser().end_pattern

    smb = SmbParser(begin_pattern=begin_p, end_pattern=end_p)
    smb_data = smb.parse()

    nfs = NfsParser(begin_pattern=begin_p, end_pattern=end_p)
    nfs_exports = nfs.parse_all()
    nfs_global = get_nfs_global()

    smb_users = get_smb_users()
    smb_groups = get_smb_groups()
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
            "global": nfs_global,
            "client_map": nfs_client_map,
        },
        "users": {
            "smb_users": smb_users,
            "smb_groups": smb_groups,
            "unix_users": unix_users,
            "access_matrix": user_matrix,
        },
        "sessions": sessions,
        "zfs_mounts": zfs_mounts,
        "versions": get_system_versions(),
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

    p_get_nfs_global = subparsers.add_parser("get_nfs_global")

    p_save_nfs_global = subparsers.add_parser("save_nfs_global")
    p_save_nfs_global.add_argument("--data", required=True, help="JSON global NFS configuration")

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

    # Group Actions
    p_create_grp = subparsers.add_parser("create_smb_group")
    p_create_grp.add_argument("--name", required=True)
    p_create_grp.add_argument("--members", default="", help="Comma-separated member list")

    p_mod_grp = subparsers.add_parser("modify_smb_group")
    p_mod_grp.add_argument("--name", required=True)
    p_mod_grp.add_argument("--new-name", default=None)
    p_mod_grp.add_argument("--members", default=None, help="Comma-separated member list")

    p_del_grp = subparsers.add_parser("delete_smb_group")
    p_del_grp.add_argument("--name", required=True)

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

        elif args.action == "get_nfs_global":
            res = get_nfs_global()
            print(json.dumps({"status": "success", "global": res}))

        elif args.action == "save_nfs_global":
            settings = json.loads(args.data)
            ok, msg = save_nfs_global(settings)
            if not ok:
                print(json.dumps({"status": "error", "message": msg}))
                sys.exit(1)
            # Restart or reload NFS server
            svc_name = "nfs-server" if get_service_status("nfs-server")["installed"] else "nfs-kernel-server"
            run_cmd(["systemctl", "restart", svc_name])
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

        elif args.action == "create_smb_group":
            members_list = [m.strip() for m in args.members.split(",") if m.strip()] if args.members else []
            ok, msg = create_smb_group(args.name, members_list)
            if not ok:
                print(json.dumps({"status": "error", "message": msg}))
                sys.exit(1)
            print(json.dumps({"status": "success", "message": msg}))

        elif args.action == "modify_smb_group":
            members_list = [m.strip() for m in args.members.split(",") if m.strip()] if args.members is not None else None
            ok, msg = modify_smb_group(args.name, new_name=args.new_name, members=members_list)
            if not ok:
                print(json.dumps({"status": "error", "message": msg}))
                sys.exit(1)
            print(json.dumps({"status": "success", "message": msg}))

        elif args.action == "delete_smb_group":
            ok, msg = delete_smb_group(args.name)
            if not ok:
                print(json.dumps({"status": "error", "message": msg}))
                sys.exit(1)
            print(json.dumps({"status": "success", "message": msg}))

        elif args.action == "service_action":
            svc_name = args.service
            if svc_name == "nfs":
                svc_name = "nfs-server" if get_service_status("nfs-server")["installed"] else "nfs-kernel-server"
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
