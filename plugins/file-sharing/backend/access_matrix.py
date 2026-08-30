#!/usr/bin/env python3
"""
Calculates effective access matrices:
1. Samba User -> Shares Permission Matrix (Read/Write, Read Only, Denied, Guest)
2. NFS Client IP/Subnet -> Exports Access Map
"""
from typing import Any, Dict, List


def parse_user_list(list_str: str) -> List[str]:
    if not list_str:
        return []
    return [u.strip().lstrip("@+&").lower() for u in list_str.replace(",", " ").split() if u.strip()]


def calculate_smb_user_matrix(shares: List[Dict[str, Any]], users: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    matrix: List[Dict[str, Any]] = []

    for u in users:
        username = u.get("username", "").strip().lower()
        user_shares = []

        for s in shares:
            s_name = s.get("name", "")
            s_path = s.get("path", "")
            read_only = s.get("read_only", True)
            guest_ok = s.get("guest_ok", False)

            valid_users = parse_user_list(s.get("valid_users", ""))
            invalid_users = parse_user_list(s.get("invalid_users", ""))
            write_list = parse_user_list(s.get("write_list", ""))
            read_list = parse_user_list(s.get("read_list", ""))

            # Evaluate effective permission
            status = "read_only"
            reason = "Default share permissions"

            if username in invalid_users:
                status = "denied"
                reason = "Explicitly in invalid users list"
            elif valid_users and username not in valid_users:
                if guest_ok:
                    status = "guest_only"
                    reason = "Not in valid users, but guest access allowed"
                else:
                    status = "denied"
                    reason = "Not included in valid users list"
            elif username in write_list:
                status = "read_write"
                reason = "Explicitly in write list"
            elif username in read_list:
                status = "read_only"
                reason = "Explicitly in read list"
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
