import json
import re
from typing import List, Dict, Any, Optional


def parse_int(val: str, default: int = 0) -> int:
    try:
        clean = val.strip().rstrip("%").rstrip("x")
        return int(clean)
    except (ValueError, TypeError):
        return default


def parse_float(val: str, default: float = 0.0) -> float:
    try:
        clean = val.strip().rstrip("%").rstrip("x")
        return float(clean)
    except (ValueError, TypeError):
        return default


def parse_zpool_list(raw: str) -> List[Dict[str, Any]]:
    pools = []
    if not raw or not raw.strip():
        return pools

    lines = raw.strip().splitlines()
    for line in lines:
        parts = line.split("\t")
        if len(parts) < 8:
            continue

        name = parts[0].strip()
        size = parse_int(parts[1])
        alloc = parse_int(parts[2])
        free = parse_int(parts[3])
        frag = parse_int(parts[4])
        cap = parse_int(parts[5])
        dedup = parse_float(parts[6], 1.0)
        health = parts[7].strip()
        altroot = parts[8].strip() if len(parts) > 8 and parts[8].strip() != "-" else None
        guid = parts[9].strip() if len(parts) > 9 else None

        pools.append({
            "name": name,
            "size": size,
            "alloc": alloc,
            "free": free,
            "frag": frag,
            "cap": cap,
            "dedup": dedup,
            "health": health,
            "altroot": altroot,
            "guid": guid,
        })

    return pools


def parse_zpool_status(raw: str) -> Dict[str, Any]:
    res: Dict[str, Any] = {
        "name": "",
        "state": "UNKNOWN",
        "status": "",
        "action": "",
        "scan": {
            "function": "none",
            "state": "none",
            "percentage": 0.0,
            "raw": "",
        },
        "errors": "",
        "vdevs": [],
        "cache": [],
        "logs": [],
        "spares": [],
        "special": [],
        "dedup": [],
    }

    if not raw or not raw.strip():
        return res

    lines = raw.splitlines()
    current_section = None
    current_vdev_category = "data"

    for line in lines:
        stripped = line.strip()

        if stripped.startswith("pool:"):
            res["name"] = stripped.split("pool:", 1)[1].strip()
            continue

        if stripped.startswith("state:"):
            res["state"] = stripped.split("state:", 1)[1].strip()
            continue

        if stripped.startswith("status:"):
            res["status"] = stripped.split("status:", 1)[1].strip()
            continue

        if stripped.startswith("action:"):
            res["action"] = stripped.split("action:", 1)[1].strip()
            continue

        if stripped.startswith("scan:"):
            scan_text = stripped.split("scan:", 1)[1].strip()
            res["scan"]["raw"] = scan_text
            if "scrub" in scan_text:
                res["scan"]["function"] = "scrub"
                res["scan"]["state"] = "in_progress" if "in progress" in scan_text else "finished"
            elif "resilver" in scan_text:
                res["scan"]["function"] = "resilver"
                res["scan"]["state"] = "in_progress" if "in progress" in scan_text else "finished"
            elif "none" in scan_text:
                res["scan"]["function"] = "none"
                res["scan"]["state"] = "none"

            pct_match = re.search(r"([\d\.]+)%\s+done", raw)
            if pct_match:
                res["scan"]["percentage"] = parse_float(pct_match.group(1))
            continue

        if stripped.startswith("errors:"):
            res["errors"] = stripped.split("errors:", 1)[1].strip()
            continue

        if stripped.startswith("config:"):
            current_section = "config"
            continue

        if current_section == "config":
            if not stripped or stripped.startswith("NAME"):
                continue

            if stripped == "cache":
                current_vdev_category = "cache"
                continue
            elif stripped in ("logs", "log"):
                current_vdev_category = "logs"
                continue
            elif stripped in ("spares", "spare"):
                current_vdev_category = "spares"
                continue
            elif stripped == "special":
                current_vdev_category = "special"
                continue
            elif stripped == "dedup":
                current_vdev_category = "dedup"
                continue

            # Parse config line: NAME STATE READ WRITE CKSUM
            parts = stripped.split()
            if len(parts) >= 2:
                dev_name = parts[0]
                if dev_name == res["name"]:
                    continue

                dev_state = parts[1]
                read_err = parse_int(parts[2]) if len(parts) > 2 else 0
                write_err = parse_int(parts[3]) if len(parts) > 3 else 0
                cksum_err = parse_int(parts[4]) if len(parts) > 4 else 0

                is_group = any(g in dev_name for g in ("mirror", "raidz", "draid"))
                
                # Check indentation to determine hierarchy
                indent = len(line) - len(line.lstrip())

                item: Dict[str, Any] = {
                    "name": dev_name,
                    "state": dev_state,
                    "read": read_err,
                    "write": write_err,
                    "cksum": cksum_err,
                    "is_group": is_group,
                    "children": [],
                }

                target_list = res[current_vdev_category] if current_vdev_category != "data" else res["vdevs"]

                if is_group:
                    target_list.append(item)
                else:
                    if target_list and target_list[-1].get("is_group") and indent > 4:
                        target_list[-1]["children"].append(item)
                    else:
                        target_list.append(item)

    return res


def parse_zpool_properties(raw: str) -> Dict[str, str]:
    props: Dict[str, str] = {}
    if not raw or not raw.strip():
        return props

    for line in raw.strip().splitlines():
        parts = line.split("\t")
        if len(parts) >= 3:
            prop_name = parts[1].strip()
            prop_val = parts[2].strip()
            props[prop_name] = prop_val

    return props


def parse_zfs_list(raw: str) -> List[Dict[str, Any]]:
    datasets = []
    if not raw or not raw.strip():
        return datasets

    for line in raw.strip().splitlines():
        parts = line.split("\t")
        if len(parts) < 10:
            continue

        name = parts[0].strip()
        ds_type = parts[1].strip()
        used = parse_int(parts[2])
        avail = parse_int(parts[3])
        refer = parse_int(parts[4])
        mountpoint = parts[5].strip() if parts[5].strip() != "none" else None
        mounted = parts[6].strip().lower() == "yes"
        compression = parts[7].strip()
        compressratio = parse_float(parts[8], 1.0)
        dedup = parts[9].strip()
        encryption = parts[10].strip() if len(parts) > 10 else "off"
        keystatus = parts[11].strip() if len(parts) > 11 else None
        atime = parts[12].strip().lower() == "on" if len(parts) > 12 else True
        sync = parts[13].strip() if len(parts) > 13 else "standard"
        quota = parse_int(parts[14]) if len(parts) > 14 else 0
        reservation = parse_int(parts[15]) if len(parts) > 15 else 0
        recordsize = parse_int(parts[16]) if len(parts) > 16 else 131072
        volsize = parse_int(parts[17]) if len(parts) > 17 and parts[17].strip() != "-" else None
        volblocksize = parse_int(parts[18]) if len(parts) > 18 and parts[18].strip() != "-" else None
        origin = parts[19].strip() if len(parts) > 19 and parts[19].strip() != "-" else None

        datasets.append({
            "name": name,
            "type": ds_type,
            "used": used,
            "avail": avail,
            "refer": refer,
            "mountpoint": mountpoint,
            "mounted": mounted,
            "compression": compression,
            "compressratio": compressratio,
            "dedup": dedup,
            "encryption": encryption,
            "keystatus": keystatus,
            "atime": atime,
            "sync": sync,
            "quota": quota,
            "reservation": reservation,
            "recordsize": recordsize,
            "volsize": volsize,
            "volblocksize": volblocksize,
            "origin": origin,
        })

    return datasets


def parse_zfs_snapshots(raw: str) -> List[Dict[str, Any]]:
    snaps = []
    if not raw or not raw.strip():
        return snaps

    for line in raw.strip().splitlines():
        parts = line.split("\t")
        if len(parts) < 4:
            continue

        full_name = parts[0].strip()
        dataset, snap_name = full_name.split("@", 1) if "@" in full_name else (full_name, "")
        creation = parse_int(parts[1])
        used = parse_int(parts[2])
        refer = parse_int(parts[3])
        clones = parts[4].strip().split(",") if len(parts) > 4 and parts[4].strip() != "-" else []

        snaps.append({
            "name": full_name,
            "dataset": dataset,
            "snapshot_name": snap_name,
            "creation": creation,
            "used": used,
            "refer": refer,
            "clones": clones,
        })

    return snaps


def parse_lsblk(raw_json: str) -> List[Dict[str, Any]]:
    try:
        data = json.loads(raw_json)
        devices = data.get("blockdevices", [])
        return [
            d for d in devices
            if not d.get("name", "").startswith("zd")
            and not d.get("name", "").startswith("ram")
        ]
    except Exception:
        return []


def parse_smartctl(raw_json: str) -> Dict[str, Any]:
    try:
        data = json.loads(raw_json)
        passed = data.get("smart_status", {}).get("passed", None)
        temp = data.get("temperature", {}).get("current", None)
        model = data.get("model_name") or data.get("model_family") or ""
        serial = data.get("serial_number", "")
        return {
            "health": "PASSED" if passed is True else ("FAILED" if passed is False else "UNKNOWN"),
            "temperature": temp,
            "model": model,
            "serial": serial,
            "raw": data,
        }
    except Exception:
        return {"health": "UNKNOWN", "temperature": None, "model": "", "serial": "", "raw": {}}


def parse_arcstats(raw: str) -> Dict[str, Any]:
    stats: Dict[str, int] = {}
    for line in raw.splitlines():
        parts = line.split()
        if len(parts) >= 3:
            key = parts[0]
            val = parse_int(parts[2])
            stats[key] = val

    hits = stats.get("hits", 0)
    misses = stats.get("misses", 0)
    total = hits + misses
    hit_ratio = (hits / total) if total > 0 else 0.0

    c_size = stats.get("compressed_size", 0)
    u_size = stats.get("uncompressed_size", 0)
    comp_ratio = (u_size / c_size) if c_size > 0 else 1.0

    return {
        "size": stats.get("size", 0),
        "target_size": stats.get("c", 0),
        "min_size": stats.get("c_min", 0),
        "max_size": stats.get("c_max", 0),
        "hits": hits,
        "misses": misses,
        "hit_ratio": hit_ratio,
        "data_hits": stats.get("demand_data_hits", 0),
        "data_misses": stats.get("demand_data_misses", 0),
        "metadata_hits": stats.get("demand_metadata_hits", 0),
        "metadata_misses": stats.get("demand_metadata_misses", 0),
        "mru_size": stats.get("mru_size", 0),
        "mru_hits": stats.get("mru_hits", 0),
        "mru_ghost_hits": stats.get("mru_ghost_hits", 0),
        "mfu_size": stats.get("mfu_size", 0),
        "mfu_hits": stats.get("mfu_hits", 0),
        "mfu_ghost_hits": stats.get("mfu_ghost_hits", 0),
        "p_size": stats.get("p", 0),
        "data_size": stats.get("data_size", 0),
        "metadata_size": stats.get("metadata_size", 0),
        "hdr_size": stats.get("hdr_size", 0),
        "other_size": stats.get("other_size", 0),
        "dbuf_size": stats.get("dbuf_size", 0),
        "dnode_size": stats.get("dnode_size", 0),
        "bonus_size": stats.get("bonus_size", 0),
        "compressed_size": c_size,
        "uncompressed_size": u_size,
        "compression_ratio": round(comp_ratio, 2),
        "prefetch_data_hits": stats.get("prefetch_data_hits", 0),
        "prefetch_data_misses": stats.get("prefetch_data_misses", 0),
        "prefetch_metadata_hits": stats.get("prefetch_metadata_hits", 0),
        "prefetch_metadata_misses": stats.get("prefetch_metadata_misses", 0),
        "l2_size": stats.get("l2_size", 0),
        "l2_asize": stats.get("l2_asize", 0),
        "l2_hits": stats.get("l2_hits", 0),
        "l2_misses": stats.get("l2_misses", 0),
        "l2_feeds": stats.get("l2_feeds", 0),
        "l2_rw_clash": stats.get("l2_rw_clash", 0),
        "l2_cksum_bad": stats.get("l2_cksum_bad", 0),
        "l2_io_error": stats.get("l2_io_error", 0),
        "memory_throttle_count": stats.get("memory_throttle_count", 0),
    }


def parse_sanoid_conf(raw: str) -> List[Dict[str, Any]]:
    if not raw or not raw.strip():
        return []

    sections: Dict[str, Dict[str, Any]] = {}
    current_section = None
    current_props: Dict[str, Any] = {}

    for line in raw.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or line.startswith(";"):
            continue

        if line.startswith("[") and line.endswith("]"):
            if current_section:
                sections[current_section] = current_props
            current_section = line[1:-1].strip()
            current_props = {}
            continue

        if "=" in line and current_section:
            parts = line.split("=", 1)
            key = parts[0].strip().lower()
            val = parts[1].strip()

            val_lower = val.lower()
            if val_lower in ("yes", "true", "1", "on"):
                current_props[key] = True
            elif val_lower in ("no", "false", "0", "off"):
                current_props[key] = False
            elif val_lower.isdigit():
                current_props[key] = int(val_lower)
            else:
                current_props[key] = val

    if current_section:
        sections[current_section] = current_props

    templates: Dict[str, Dict[str, Any]] = {}
    for sec_name, props in sections.items():
        if sec_name.startswith("template_"):
            tpl_name = sec_name.replace("template_", "", 1)
            templates[tpl_name] = props

    policies = []
    for sec_name, props in sections.items():
        if sec_name.startswith("template_"):
            continue

        resolved: Dict[str, Any] = {}
        tpl_name = props.get("use_template")
        if tpl_name and tpl_name in templates:
            resolved.update(templates[tpl_name])

        resolved.update(props)
        policies.append({
            "dataset": sec_name,
            **resolved,
        })

    return policies


