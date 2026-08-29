#!/usr/bin/env python3
import sys
import os
import json
import subprocess
from typing import Dict, Any, List, Optional

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PARENT_DIR = os.path.dirname(SCRIPT_DIR)
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)
if PARENT_DIR not in sys.path:
    sys.path.insert(0, PARENT_DIR)

try:
    from backend.enums import (
        VDevType,
        AshiftType,
        ScrubAction,
        TrimAction,
        CompressionType,
        DatasetType,
    )
    from backend.command_builder import CommandBuilder, VDevConfig
    from backend.parsers import (
        parse_zpool_list,
        parse_zpool_status,
        parse_zpool_properties,
        parse_zfs_list,
        parse_zfs_snapshots,
        parse_lsblk,
        parse_smartctl,
        parse_arcstats,
    )
except ImportError:
    from enums import (
        VDevType,
        AshiftType,
        ScrubAction,
        TrimAction,
        CompressionType,
        DatasetType,
    )
    from command_builder import CommandBuilder, VDevConfig
    from parsers import (
        parse_zpool_list,
        parse_zpool_status,
        parse_zpool_properties,
        parse_zfs_list,
        parse_zfs_snapshots,
        parse_lsblk,
        parse_smartctl,
        parse_arcstats,
    )


def run_cmd(args: List[str], check: bool = False) -> subprocess.CompletedProcess:
    return subprocess.run(
        args,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        check=check,
    )


class ZfsService:

    def __init__(self):
        self.builder = CommandBuilder()

    def get_system_info(self) -> Dict[str, Any]:
        kmod_loaded = os.path.exists("/proc/spl/kstat/zfs") or os.path.exists("/sys/module/zfs")
        
        zfs_ver = ""
        try:
            p = run_cmd(["zfs", "version"])
            if p.returncode == 0:
                zfs_ver = p.stdout.strip()
        except Exception:
            pass

        arc_stats = {}
        arcstats_file = "/proc/spl/kstat/zfs/arcstats"
        if os.path.exists(arcstats_file):
            try:
                with open(arcstats_file, "r") as f:
                    arc_stats = parse_arcstats(f.read())
            except Exception:
                pass

        return {
            "kernel_module_loaded": kmod_loaded,
            "version": zfs_ver,
            "arc": arc_stats,
        }

    def get_pools(self) -> List[Dict[str, Any]]:
        p_list = run_cmd(["zpool", "list", "-p", "-H", "-o", "name,size,alloc,free,frag,cap,dedup,health,altroot,guid"])
        if p_list.returncode != 0:
            return []

        pools = parse_zpool_list(p_list.stdout)
        
        for pool in pools:
            name = pool["name"]
            p_status = run_cmd(["zpool", "status", "-p", "-P", name])
            if p_status.returncode == 0:
                status_data = parse_zpool_status(p_status.stdout)
                pool["scan"] = status_data.get("scan", {})
                pool["vdevs"] = status_data.get("vdevs", [])
                pool["cache"] = status_data.get("cache", [])
                pool["logs"] = status_data.get("logs", [])
                pool["spares"] = status_data.get("spares", [])
                pool["special"] = status_data.get("special", [])
                pool["dedup"] = status_data.get("dedup", [])

        return pools

    def get_pool_status(self, pool_name: str) -> Dict[str, Any]:
        p = run_cmd(["zpool", "status", "-p", "-P", pool_name])
        if p.returncode != 0:
            return {"error": p.stderr.strip()}
        return parse_zpool_status(p.stdout)

    def get_pool_properties(self, pool_name: str) -> Dict[str, str]:
        p = run_cmd(["zpool", "get", "all", "-p", "-H", pool_name])
        if p.returncode != 0:
            return {}
        return parse_zpool_properties(p.stdout)

    def get_datasets(self, pool_name: Optional[str] = None) -> List[Dict[str, Any]]:
        cmd = [
            "zfs", "list", "-p", "-H", "-t", "filesystem,volume",
            "-o", "name,type,used,avail,refer,mountpoint,mounted,compression,compressratio,dedup,encryption,keystatus,atime,sync,quota,reservation,recordsize,volsize,volblocksize,origin"
        ]
        if pool_name:
            cmd.append(pool_name)

        p = run_cmd(cmd)
        if p.returncode != 0:
            return []

        datasets = parse_zfs_list(p.stdout)
        
        snap_cmd = ["zfs", "list", "-p", "-H", "-t", "snapshot", "-o", "name"]
        if pool_name:
            snap_cmd.append(pool_name)
        p_snaps = run_cmd(snap_cmd)
        snap_counts: Dict[str, int] = {}
        if p_snaps.returncode == 0:
            for line in p_snaps.stdout.strip().splitlines():
                if "@" in line:
                    ds = line.split("@", 1)[0]
                    snap_counts[ds] = snap_counts.get(ds, 0) + 1

        for d in datasets:
            d["snapshot_count"] = snap_counts.get(d["name"], 0)

        return datasets

    def get_snapshots(self, path: Optional[str] = None) -> List[Dict[str, Any]]:
        cmd = ["zfs", "list", "-p", "-H", "-t", "snapshot", "-o", "name,creation,used,refer,clones"]
        if path:
            cmd.append(path)

        p = run_cmd(cmd)
        if p.returncode != 0:
            return []

        return parse_zfs_snapshots(p.stdout)

    def get_disks(self) -> List[Dict[str, Any]]:
        p = run_cmd(["lsblk", "-J", "-b", "-o", "NAME,KNAME,PATH,SIZE,ROTA,TYPE,TRAN,SERIAL,WWN,MODEL,MOUNTPOINT,FSTYPE,UUID,HOTPLUG"])
        if p.returncode != 0:
            return []

        raw_devices = parse_lsblk(p.stdout)
        disks = []

        pools = self.get_pools()
        pool_device_map: Dict[str, str] = {}
        for pool in pools:
            pool_name = pool["name"]
            
            def map_vdevs(vdev_list):
                for v in vdev_list:
                    dev_name = v.get("name", "")
                    if dev_name:
                        pool_device_map[dev_name] = pool_name
                        base_dev = os.path.basename(dev_name)
                        pool_device_map[base_dev] = pool_name
                    if v.get("children"):
                        map_vdevs(v["children"])

            map_vdevs(pool.get("vdevs", []))
            map_vdevs(pool.get("cache", []))
            map_vdevs(pool.get("logs", []))
            map_vdevs(pool.get("spares", []))
            map_vdevs(pool.get("special", []))
            map_vdevs(pool.get("dedup", []))

        for dev in raw_devices:
            dev_name = dev.get("name", "")
            if dev.get("type") == "disk" and not dev_name.startswith("zd") and not dev_name.startswith("loop") and not dev_name.startswith("ram"):
                path = dev.get("path") or f"/dev/{dev.get('name')}"
                
                smart_info = {"health": "UNKNOWN", "temperature": None}
                try:
                    p_smart = run_cmd(["smartctl", "-j", "-H", "-A", "-i", path])
                    if p_smart.returncode in (0, 4):
                        smart_info = parse_smartctl(p_smart.stdout)
                except Exception:
                    pass

                pool_name = pool_device_map.get(path) or pool_device_map.get(dev.get("name"))
                if not pool_name and dev.get("children"):
                    for child in dev["children"]:
                        cpath = child.get("path") or f"/dev/{child.get('name')}"
                        if cpath in pool_device_map or child.get("name") in pool_device_map:
                            pool_name = f"{pool_device_map.get(cpath) or pool_device_map.get(child.get('name'))} ({child.get('name')})"
                            break

                disks.append({
                    "name": dev.get("name"),
                    "path": path,
                    "size": dev.get("size", 0),
                    "model": dev.get("model") or smart_info.get("model") or "",
                    "serial": dev.get("serial") or smart_info.get("serial") or "",
                    "wwn": dev.get("wwn") or "",
                    "transport": dev.get("tran") or "",
                    "rotational": dev.get("rota", True),
                    "smart_health": smart_info.get("health", "UNKNOWN"),
                    "temperature": smart_info.get("temperature"),
                    "pool": pool_name,
                    "partitions": dev.get("children", []),
                })

        return disks

    def execute_command(self, cmd_args: List[str]) -> Dict[str, Any]:
        p = run_cmd(cmd_args)
        return {
            "success": p.returncode == 0,
            "returncode": p.returncode,
            "stdout": p.stdout.strip(),
            "stderr": p.stderr.strip(),
            "command": " ".join(cmd_args),
        }


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No action specified"}))
        sys.exit(1)

    action = sys.argv[1]
    svc = ZfsService()

    try:
        if action == "system-info":
            res = svc.get_system_info()
        elif action == "pools-list":
            res = svc.get_pools()
        elif action == "pool-status":
            pool = sys.argv[2] if len(sys.argv) > 2 else ""
            res = svc.get_pool_status(pool)
        elif action == "pool-properties":
            pool = sys.argv[2] if len(sys.argv) > 2 else ""
            res = svc.get_pool_properties(pool)
        elif action == "datasets-list":
            pool = sys.argv[2] if len(sys.argv) > 2 else None
            res = svc.get_datasets(pool)
        elif action == "snapshots-list":
            path = sys.argv[2] if len(sys.argv) > 2 else None
            res = svc.get_snapshots(path)
        elif action == "disks-list":
            res = svc.get_disks()
        elif action == "exec":
            if len(sys.argv) < 3:
                res = {"error": "Missing command payload"}
            else:
                cmd_args = json.loads(sys.argv[2])
                res = svc.execute_command(cmd_args)
        else:
            res = {"error": f"Unknown action '{action}'"}

        print(json.dumps(res, indent=2))
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
