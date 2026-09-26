#!/usr/bin/env python3
"""
Calculates effective access matrices:
1. Samba User -> Shares Permission Matrix (Read/Write, Read Only, Denied, Guest)
2. NFS Client IP/Subnet -> Exports Access Map
"""
from typing import Any, Dict, List, Optional, Set, Tuple


def get_user_system_groups(username: str) -> Set[str]:
    groups: Set[str] = set()
    try:
        import grp
        import pwd
        pw = pwd.getpwnam(username)
        try:
            groups.add(grp.getgrgid(pw.pw_gid).gr_name.lower())
        except Exception:
            pass
        for g in grp.getgrall():
            if username in g.gr_mem:
                groups.add(g.gr_name.lower())
    except Exception:
        pass
    return groups


def parse_acl_tokens(acl_str: str) -> List[Tuple[str, str]]:
    if not acl_str:
        return []
    tokens = []
    for raw in acl_str.replace(",", " ").split():
        t = raw.strip()
        if not t:
            continue
        if t.startswith(("@", "+", "&")):
            g_name = t.lstrip("@+&").strip().lower()
            if g_name:
                tokens.append(("group", g_name))
        else:
            tokens.append(("user", t.lower()))
    return tokens


def match_acl(username: str, user_groups: Set[str], acl_str: str) -> Tuple[bool, Optional[str], Optional[str]]:
    tokens = parse_acl_tokens(acl_str)
    if not tokens:
        return False, None, None
    u_lower = username.lower()
    for t_type, name in tokens:
        if t_type == "user" and name == u_lower:
            return True, "user", name
        if t_type == "group" and name in user_groups:
            return True, "group", name
    return False, None, None


def parse_user_list(list_str: str) -> List[str]:
    if not list_str:
        return []
    return [u.strip().lstrip("@+&").lower() for u in list_str.replace(",", " ").split() if u.strip()]


def calculate_smb_user_matrix(shares: List[Dict[str, Any]], users: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    matrix: List[Dict[str, Any]] = []

    for u in users:
        username = u.get("username", "").strip().lower()
        if "groups" in u:
            user_groups = {g.strip().lower() for g in u.get("groups", [])}
        else:
            user_groups = get_user_system_groups(username)
        user_shares = []

        for s in shares:
            s_name = s.get("name", "")
            s_path = s.get("path", "")
            read_only = s.get("read_only", True)
            guest_ok = s.get("guest_ok", False)

            inv_match, inv_type, inv_name = match_acl(username, user_groups, s.get("invalid_users", ""))
            val_tokens = parse_acl_tokens(s.get("valid_users", ""))
            val_match, val_type, val_name = match_acl(username, user_groups, s.get("valid_users", ""))
            wr_match, wr_type, wr_name = match_acl(username, user_groups, s.get("write_list", ""))
            rd_match, rd_type, rd_name = match_acl(username, user_groups, s.get("read_list", ""))

            # Evaluate effective permission
            status = "read_only"
            reason = "Default share permissions"

            if inv_match:
                status = "denied"
                reason = "Explicitly in invalid users list" if inv_type == "user" else f"Member of group '@{inv_name}' in invalid users list"
            elif val_tokens and not val_match:
                if guest_ok:
                    status = "guest_only"
                    reason = "Not in valid users, but guest access allowed"
                else:
                    status = "denied"
                    reason = "Not included in valid users or group list"
            elif wr_match:
                status = "read_write"
                reason = "Explicitly in write list" if wr_type == "user" else f"Member of group '@{wr_name}' in write list"
            elif rd_match:
                status = "read_only"
                reason = "Explicitly in read list" if rd_type == "user" else f"Member of group '@{rd_name}' in read list"
            elif not read_only:
                status = "read_write"
                reason = "Share configured as read only = no"
            elif read_only:
                status = "read_only"
                reason = "Share configured as read only = yes"

            user_shares.append({
                "share_name": s_name,
                "share_path": s_path,
                "access": status,  # "read_write" | "read_only" | "denied" | "guest_only"
                "reason": reason,
                "is_managed": s.get("is_managed", False),
                "guest_ok": guest_ok,
            })

        matrix.append({
            "username": u.get("username", ""),
            "full_name": u.get("full_name", ""),
            "is_enabled": u.get("is_enabled", True),
            "shares": user_shares,
        })

    return matrix



def calculate_nfs_client_matrix(exports: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    client_map: Dict[str, List[Dict[str, Any]]] = {}

    for exp in exports:
        path = exp.get("path", "")
        is_managed = exp.get("is_managed", False)
        managed_by = exp.get("managed_by", "")

        for c in exp.get("clients", []):
            host = c.get("host", "*")
            if host not in client_map:
                client_map[host] = []

            client_map[host].append({
                "path": path,
                "read_only": c.get("read_only", True),
                "sync": c.get("sync", True),
                "root_squash": c.get("root_squash", True),
                "all_squash": c.get("all_squash", False),
                "no_subtree_check": c.get("no_subtree_check", True),
                "options": c.get("options", []),
                "is_managed": is_managed,
                "managed_by": managed_by,
            })

    # Convert to structured list sorted by host
    result = []
    for host, paths in sorted(client_map.items()):
        result.append({
            "client": host,
            "exports_count": len(paths),
            "exports": paths,
        })

    return result
