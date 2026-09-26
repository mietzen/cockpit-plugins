#!/usr/bin/env python3
"""
Calculates effective access matrices:
1. Samba User -> Shares Permission Matrix (Read/Write, Read Only, Denied, Guest)
2. NFS Client IP/Subnet -> Exports Access Map
"""
import shlex
from typing import Any, Dict, List, Optional, Set, Tuple


def parse_acl_tokens(acl_str: str) -> List[Tuple[str, str]]:
    """Parses space- or comma-separated tokens into (token_type, name), supporting quotes."""
    if not acl_str:
        return []

    tokens = []
    try:
        raw_items = shlex.split(acl_str.replace(",", " "))
    except ValueError:
        raw_items = acl_str.replace(",", " ").split()

    for raw in raw_items:
        token = raw.strip()
        if not token:
            continue
        if token.startswith(("@", "+", "&")):
            group_name = token.lstrip("@+&").strip().lower()
            if group_name:
                tokens.append(("group", group_name))
        else:
            tokens.append(("user", token.lower()))

    return tokens



def evaluate_acl(username: str, user_groups: Set[str], tokens: List[Tuple[str, str]]) -> Tuple[bool, str]:
    """Evaluates if a user or user's group matches any token in the ACL."""
    if not tokens:
        return False, ""

    user_lower = username.lower()
    for token_type, name in tokens:
        if token_type == "user" and name == user_lower:
            return True, "user"
        if token_type == "group" and name in user_groups:
            return True, f"@{name}"

    return False, ""


def format_acl_reason(list_name: str, match_source: str) -> str:
    """Formats human-readable reason for an ACL match."""
    if match_source == "user":
        return f"Explicitly in {list_name} list"
    return f"Member of group '{match_source}' in {list_name} list"


def calculate_smb_user_matrix(shares: List[Dict[str, Any]], users: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    matrix: List[Dict[str, Any]] = []

    for user in users:
        username = user.get("username", "").strip().lower()
        user_groups = {group.strip().lower() for group in user.get("groups", [])}
        user_shares = []

        for share in shares:
            share_name = share.get("name", "")
            share_path = share.get("path", "")
            read_only = share.get("read_only", True)
            guest_ok = share.get("guest_ok", False)

            inv_tokens = parse_acl_tokens(share.get("invalid_users", ""))
            val_tokens = parse_acl_tokens(share.get("valid_users", ""))
            wr_tokens = parse_acl_tokens(share.get("write_list", ""))
            rd_tokens = parse_acl_tokens(share.get("read_list", ""))

            inv_match, inv_src = evaluate_acl(username, user_groups, inv_tokens)
            val_match, _ = evaluate_acl(username, user_groups, val_tokens)
            wr_match, wr_src = evaluate_acl(username, user_groups, wr_tokens)
            rd_match, rd_src = evaluate_acl(username, user_groups, rd_tokens)

            status = "read_only"
            reason = "Default share permissions"

            if inv_match:
                status = "denied"
                reason = format_acl_reason("invalid users", inv_src)
            elif val_tokens and not val_match:
                if guest_ok:
                    status = "guest_only"
                    reason = "Not in valid users, but guest access allowed"
                else:
                    status = "denied"
                    reason = "Not included in valid users or group list"
            elif wr_match:
                status = "read_write"
                reason = format_acl_reason("write", wr_src)
            elif rd_match:
                status = "read_only"
                reason = format_acl_reason("read", rd_src)
            elif not read_only:
                status = "read_write"
                reason = "Share configured as read only = no"
            elif read_only:
                status = "read_only"
                reason = "Share configured as read only = yes"

            user_shares.append({
                "share_name": share_name,
                "share_path": share_path,
                "access": status,
                "reason": reason,
                "is_managed": share.get("is_managed", False),
                "guest_ok": guest_ok,
            })

        matrix.append({
            "username": user.get("username", ""),
            "full_name": user.get("full_name", ""),
            "is_enabled": user.get("is_enabled", True),
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
