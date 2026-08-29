#!/usr/bin/env python3
import sys
import os
import json
import re
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

SAFE_NAME_RE = re.compile(r"^[a-zA-Z0-9_\-\.\:\/\@\#\%\=\+]+$")


def validate_name(name: str, field_name: str = "Name") -> str:
    if not name or not SAFE_NAME_RE.match(name):
        raise ValueError(f"Invalid {field_name}: '{name}' contains forbidden characters")
    return name


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
        validate_name(pool_name, "pool_name")
        p = run_cmd(["zpool", "status", "-p", "-P", pool_name])
        if p.returncode != 0:
            return {"error": p.stderr.strip()}
        return parse_zpool_status(p.stdout)

    def get_pool_properties(self, pool_name: str) -> Dict[str, str]:
        validate_name(pool_name, "pool_name")
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
            validate_name(pool_name, "pool_name")
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
            validate_name(path, "path")
            cmd.append(path)

        p = run_cmd(cmd)
        if p.returncode != 0:
            return []

        return parse_zfs_snapshots(p.stdout)

    def get_disks(self) -> List[Dict[str, Any]]:
        p = run_cmd(["lsblk", "-a", "-J", "-b", "-o", "NAME,KNAME,PATH,SIZE,ROTA,TYPE,TRAN,SERIAL,WWN,MODEL,MOUNTPOINT,FSTYPE,UUID,HOTPLUG"])
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

        def has_system_mount(d: Dict[str, Any]) -> bool:
            mp = d.get("mountpoint")
            if mp and (mp in ("/", "/boot", "/boot/efi", "/usr", "/var", "/home", "/etc") or mp.startswith("/snap") or mp == "[SWAP]"):
                return True
            for c in d.get("children", []):
                if has_system_mount(c):
                    return True
            return False

        for dev in raw_devices:
            dev_name = dev.get("name", "")
            dev_type = dev.get("type", "")
            if dev_type in ("disk", "loop") and not dev_name.startswith("zd") and not dev_name.startswith("ram"):
                if dev.get("size", 0) <= 0:
                    continue
                if has_system_mount(dev):
                    continue
                path = dev.get("path") or f"/dev/{dev.get('name')}"
                
                smart_info = {"health": "UNKNOWN", "temperature": None}
                if not dev_name.startswith("loop"):
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

    def _exec(self, cmd: List[str]) -> Dict[str, Any]:
        p = run_cmd(cmd)
        return {
            "success": p.returncode == 0,
            "returncode": p.returncode,
            "stdout": p.stdout.strip(),
            "stderr": p.stderr.strip(),
            "command": " ".join(cmd),
        }

    def pool_create(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        name = validate_name(payload["name"], "pool_name")
        vdevs = []
        for v in payload.get("vdevs", []):
            raw_type = v.get("type", "data")
            v_type = VDevType(raw_type) if raw_type in [e.value for e in VDevType] else VDevType.DATA
            devices = [validate_name(d, "device") for d in v.get("devices", [])]
            vdevs.append(VDevConfig(type=v_type, devices=devices))
        
        ashift_val = payload.get("ashift")
        ashift = AshiftType(int(ashift_val)) if ashift_val else AshiftType.ASHIFT_AUTO
        
        comp_val = payload.get("compression")
        compression = CompressionType(comp_val) if comp_val else CompressionType.OFF

        cmd = self.builder.build_pool_create(
            name=name,
            vdevs=vdevs,
            ashift=ashift,
            compression=compression,
            altroot=payload.get("altroot"),
            mountpoint=payload.get("mountpoint"),
            properties=payload.get("properties"),
            force=payload.get("force", False),
        )
        return self._exec(cmd)

    def pool_destroy(self, pool_name: str, force: bool = True) -> Dict[str, Any]:
        name = validate_name(pool_name, "pool_name")
        cmd = self.builder.build_pool_destroy(name, force=force)
        return self._exec(cmd)

    def pool_export(self, pool_name: str, force: bool = False) -> Dict[str, Any]:
        name = validate_name(pool_name, "pool_name")
        cmd = self.builder.build_pool_export(name, force=force)
        return self._exec(cmd)

    def pool_import(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        name = payload.get("name")
        if name:
            validate_name(name, "pool_name")
        cmd = self.builder.build_pool_import(
            name=name,
            force=payload.get("force", True),
            altroot=payload.get("altroot"),
            directory=payload.get("directory", "/dev/disk/by-id"),
        )
        return self._exec(cmd)

    def pool_scrub(self, pool_name: str, action: str = "start") -> Dict[str, Any]:
        name = validate_name(pool_name, "pool_name")
        scrub_action = ScrubAction(action)
        cmd = self.builder.build_pool_scrub(name, action=scrub_action)
        return self._exec(cmd)

    def pool_trim(self, pool_name: str, action: str = "start", device: Optional[str] = None) -> Dict[str, Any]:
        name = validate_name(pool_name, "pool_name")
        trim_action = TrimAction(action)
        dev = validate_name(device, "device") if device else None
        cmd = self.builder.build_pool_trim(name, action=trim_action, device=dev)
        return self._exec(cmd)

    def pool_clear(self, pool_name: str, device: Optional[str] = None) -> Dict[str, Any]:
        name = validate_name(pool_name, "pool_name")
        dev = validate_name(device, "device") if device else None
        cmd = self.builder.build_pool_clear(name, device=dev)
        return self._exec(cmd)

    def pool_set_property(self, pool_name: str, prop: str, value: str) -> Dict[str, Any]:
        name = validate_name(pool_name, "pool_name")
        validate_name(prop, "prop")
        cmd = self.builder.build_pool_set_property(name, prop=prop, value=value)
        return self._exec(cmd)

    def dataset_create(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        path = validate_name(payload["path"], "dataset_path")
        ds_type = payload.get("type", "filesystem")
        properties = payload.get("properties")

        if ds_type == "volume":
            size = payload.get("size", "10G")
            volblocksize = payload.get("volblocksize")
            sparse = payload.get("sparse", True)
            cmd = self.builder.build_dataset_create_zvol(
                path=path,
                size=size,
                volblocksize=volblocksize,
                sparse=sparse,
                properties=properties,
            )
        else:
            cmd = self.builder.build_dataset_create(
                path=path,
                type=DatasetType.FILESYSTEM,
                properties=properties,
            )
        return self._exec(cmd)

    def dataset_destroy(self, path: str, recursive: bool = True, force: bool = True) -> Dict[str, Any]:
        ds_path = validate_name(path, "dataset_path")
        cmd = self.builder.build_dataset_destroy(ds_path, recursive=recursive, force=force)
        return self._exec(cmd)

    def dataset_rename(self, old_path: str, new_path: str) -> Dict[str, Any]:
        old_p = validate_name(old_path, "old_path")
        new_p = validate_name(new_path, "new_path")
        cmd = self.builder.build_dataset_rename(old_p, new_p)
        return self._exec(cmd)

    def dataset_mount(self, path: str) -> Dict[str, Any]:
        ds_path = validate_name(path, "dataset_path")
        cmd = self.builder.build_dataset_mount(ds_path)
        return self._exec(cmd)

    def dataset_unmount(self, path: str, force: bool = False) -> Dict[str, Any]:
        ds_path = validate_name(path, "dataset_path")
        cmd = self.builder.build_dataset_unmount(ds_path, force=force)
        return self._exec(cmd)

    def dataset_set_property(self, path: str, prop: str, value: str) -> Dict[str, Any]:
        ds_path = validate_name(path, "dataset_path")
        validate_name(prop, "prop")
        cmd = self.builder.build_dataset_set_property(ds_path, prop=prop, value=value)
        return self._exec(cmd)

    def dataset_inherit_property(self, path: str, prop: str) -> Dict[str, Any]:
        ds_path = validate_name(path, "dataset_path")
        validate_name(prop, "prop")
        cmd = self.builder.build_dataset_inherit(ds_path, prop=prop)
        return self._exec(cmd)

    def snapshot_create(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        path = validate_name(payload["path"], "dataset_path")
        snap_name = validate_name(payload["name"], "snapshot_name")
        recursive = payload.get("recursive", False)
        cmd = self.builder.build_snapshot_create(path, snapshot_name=snap_name, recursive=recursive)
        return self._exec(cmd)

    def snapshot_destroy(self, snapshot_path: str, recursive: bool = False) -> Dict[str, Any]:
        snap_p = validate_name(snapshot_path, "snapshot_path")
        cmd = self.builder.build_snapshot_destroy(snap_p, recursive=recursive)
        return self._exec(cmd)

    def snapshot_rollback(self, snapshot_path: str, destroy_intermediate: bool = True) -> Dict[str, Any]:
        snap_p = validate_name(snapshot_path, "snapshot_path")
        cmd = self.builder.build_snapshot_rollback(snap_p, destroy_intermediate=destroy_intermediate)
        return self._exec(cmd)

    def snapshot_clone(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        snapshot_path = validate_name(payload["snapshot"], "snapshot_path")
        clone_path = validate_name(payload["clone_path"], "clone_path")
        properties = payload.get("properties")
        cmd = self.builder.build_snapshot_clone(snapshot_path, clone_path=clone_path, properties=properties)
        return self._exec(cmd)

    def disk_action(self, action: str, pool: str, device: str, new_device: Optional[str] = None) -> Dict[str, Any]:
        pool_name = validate_name(pool, "pool_name")
        dev = validate_name(device, "device")
        new_dev = validate_name(new_device, "new_device") if new_device else None

        if action == "offline":
            cmd = self.builder.build_pool_offline(pool_name, dev)
        elif action == "online":
            cmd = self.builder.build_pool_online(pool_name, dev)
        elif action == "detach":
            cmd = self.builder.build_pool_detach(pool_name, dev)
        elif action == "attach" and new_dev:
            cmd = self.builder.build_pool_attach(pool_name, dev, new_dev)
        elif action == "replace" and new_dev:
            cmd = self.builder.build_pool_replace(pool_name, dev, new_dev)
        else:
            raise ValueError(f"Unknown or invalid disk action: '{action}'")

        return self._exec(cmd)


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
        elif action == "pool-create":
            payload = json.loads(sys.argv[2])
            res = svc.pool_create(payload)
        elif action == "pool-destroy":
            pool = sys.argv[2]
            res = svc.pool_destroy(pool)
        elif action == "pool-export":
            pool = sys.argv[2]
            res = svc.pool_export(pool)
        elif action == "pool-import":
            payload = json.loads(sys.argv[2]) if len(sys.argv) > 2 else {}
            res = svc.pool_import(payload)
        elif action == "pool-scrub":
            pool = sys.argv[2]
            scrub_action = sys.argv[3] if len(sys.argv) > 3 else "start"
            res = svc.pool_scrub(pool, scrub_action)
        elif action == "pool-trim":
            pool = sys.argv[2]
            trim_action = sys.argv[3] if len(sys.argv) > 3 else "start"
            device = sys.argv[4] if len(sys.argv) > 4 else None
            res = svc.pool_trim(pool, trim_action, device)
        elif action == "pool-clear":
            pool = sys.argv[2]
            device = sys.argv[3] if len(sys.argv) > 3 else None
            res = svc.pool_clear(pool, device)
        elif action == "pool-set-property":
            pool, prop, val = sys.argv[2], sys.argv[3], sys.argv[4]
            res = svc.pool_set_property(pool, prop, val)
        elif action == "datasets-list":
            pool = sys.argv[2] if len(sys.argv) > 2 else None
            res = svc.get_datasets(pool)
        elif action == "dataset-create":
            payload = json.loads(sys.argv[2])
            res = svc.dataset_create(payload)
        elif action == "dataset-destroy":
            path = sys.argv[2]
            recursive = sys.argv[3].lower() == "true" if len(sys.argv) > 3 else True
            res = svc.dataset_destroy(path, recursive=recursive)
        elif action == "dataset-rename":
            old_p, new_p = sys.argv[2], sys.argv[3]
            res = svc.dataset_rename(old_p, new_p)
        elif action == "dataset-mount":
            path = sys.argv[2]
            res = svc.dataset_mount(path)
        elif action == "dataset-unmount":
            path = sys.argv[2]
            force = sys.argv[3].lower() == "true" if len(sys.argv) > 3 else False
            res = svc.dataset_unmount(path, force=force)
        elif action == "dataset-set-property":
            path, prop, val = sys.argv[2], sys.argv[3], sys.argv[4]
            res = svc.dataset_set_property(path, prop, val)
        elif action == "dataset-inherit-property":
            path, prop = sys.argv[2], sys.argv[3]
            res = svc.dataset_inherit_property(path, prop)
        elif action == "snapshots-list":
            path = sys.argv[2] if len(sys.argv) > 2 else None
            res = svc.get_snapshots(path)
        elif action == "snapshot-create":
            payload = json.loads(sys.argv[2])
            res = svc.snapshot_create(payload)
        elif action == "snapshot-destroy":
            snap_path = sys.argv[2]
            recursive = sys.argv[3].lower() == "true" if len(sys.argv) > 3 else False
            res = svc.snapshot_destroy(snap_path, recursive=recursive)
        elif action == "snapshot-rollback":
            snap_path = sys.argv[2]
            destroy_inter = sys.argv[3].lower() == "true" if len(sys.argv) > 3 else True
            res = svc.snapshot_rollback(snap_path, destroy_intermediate=destroy_inter)
        elif action == "snapshot-clone":
            payload = json.loads(sys.argv[2])
            res = svc.snapshot_clone(payload)
        elif action == "disks-list":
            res = svc.get_disks()
        elif action == "disk-action":
            act = sys.argv[2]
            pool = sys.argv[3]
            device = sys.argv[4]
            new_device = sys.argv[5] if len(sys.argv) > 5 else None
            res = svc.disk_action(act, pool, device, new_device)
        elif action == "probe-sharing-services":
            smb_rc = subprocess.run(["systemctl", "is-active", "smbd"], capture_output=True).returncode
            nfs_rc = subprocess.run(["systemctl", "is-active", "nfs-server"], capture_output=True).returncode
            if nfs_rc != 0:
                nfs_rc = subprocess.run(["systemctl", "is-active", "nfs-kernel-server"], capture_output=True).returncode
            res = {
                "smb": smb_rc == 0,
                "nfs": nfs_rc == 0,
            }
        else:
            res = {"error": f"Unknown action '{action}'"}

        print(json.dumps(res, indent=2))
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
