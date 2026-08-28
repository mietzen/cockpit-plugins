from dataclasses import dataclass, field
from typing import List, Dict, Optional
import os
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

try:
    from backend.enums import (
        VDevType,
        AshiftType,
        ScrubAction,
        TrimAction,
        CompressionType,
        DatasetType,
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


@dataclass
class VDevConfig:
    type: VDevType
    devices: List[str] = field(default_factory=list)


class CommandBuilder:

    def build_pool_create(
        self,
        name: str,
        vdevs: List[VDevConfig],
        ashift: AshiftType = AshiftType.ASHIFT_AUTO,
        compression: CompressionType = CompressionType.OFF,
        altroot: Optional[str] = None,
        mountpoint: Optional[str] = None,
        properties: Optional[Dict[str, str]] = None,
        force: bool = False,
    ) -> List[str]:
        cmd = ["zpool", "create"]

        if force:
            cmd.append("-f")

        if ashift != AshiftType.ASHIFT_AUTO:
            cmd.extend(["-o", f"ashift={ashift.value}"])

        if altroot:
            cmd.extend(["-R", altroot])

        if mountpoint:
            cmd.extend(["-m", mountpoint])

        if compression != CompressionType.OFF:
            cmd.extend(["-O", f"compression={compression.value}"])

        if properties:
            for k, v in properties.items():
                cmd.extend(["-o", f"{k}={v}"])

        cmd.append(name)

        for vdev in vdevs:
            if vdev.type in (VDevType.DATA,):
                cmd.extend(vdev.devices)
            elif vdev.type == VDevType.MIRROR:
                cmd.append("mirror")
                cmd.extend(vdev.devices)
            elif vdev.type == VDevType.RAIDZ1:
                cmd.append("raidz1")
                cmd.extend(vdev.devices)
            elif vdev.type == VDevType.RAIDZ2:
                cmd.append("raidz2")
                cmd.extend(vdev.devices)
            elif vdev.type == VDevType.RAIDZ3:
                cmd.append("raidz3")
                cmd.extend(vdev.devices)
            elif vdev.type == VDevType.LOG:
                cmd.append("log")
                cmd.extend(vdev.devices)
            elif vdev.type == VDevType.CACHE:
                cmd.append("cache")
                cmd.extend(vdev.devices)
            elif vdev.type == VDevType.SPARE:
                cmd.append("spare")
                cmd.extend(vdev.devices)
            elif vdev.type == VDevType.SPECIAL:
                cmd.append("special")
                cmd.extend(vdev.devices)
            elif vdev.type == VDevType.DEDUP:
                cmd.append("dedup")
                cmd.extend(vdev.devices)

        return cmd

    def build_pool_destroy(self, name: str, force: bool = True) -> List[str]:
        cmd = ["zpool", "destroy"]
        if force:
            cmd.append("-f")
        cmd.append(name)
        return cmd

    def build_pool_export(self, name: str, force: bool = False) -> List[str]:
        cmd = ["zpool", "export"]
        if force:
            cmd.append("-f")
        cmd.append(name)
        return cmd

    def build_pool_import(
        self,
        name: Optional[str] = None,
        force: bool = True,
        altroot: Optional[str] = None,
        directory: str = "/dev/disk/by-id",
    ) -> List[str]:
        cmd = ["zpool", "import"]
        if directory:
            cmd.extend(["-d", directory])
        if force:
            cmd.append("-f")
        if altroot:
            cmd.extend(["-R", altroot])
        if name:
            cmd.append(name)
        return cmd

    def build_pool_scrub(self, name: str, action: ScrubAction = ScrubAction.START) -> List[str]:
        cmd = ["zpool", "scrub"]
        if action == ScrubAction.STOP:
            cmd.append("-s")
        elif action == ScrubAction.PAUSE:
            cmd.append("-p")
        cmd.append(name)
        return cmd

    def build_pool_trim(
        self,
        name: str,
        action: TrimAction = TrimAction.START,
        device: Optional[str] = None,
    ) -> List[str]:
        cmd = ["zpool", "trim"]
        if action == TrimAction.STOP:
            cmd.append("-c")
        elif action == TrimAction.SUSPEND:
            cmd.append("-d")
        cmd.append(name)
        if device:
            cmd.append(device)
        return cmd

    def build_pool_attach(self, name: str, existing_device: str, new_device: str) -> List[str]:
        return ["zpool", "attach", name, existing_device, new_device]

    def build_pool_detach(self, name: str, device: str) -> List[str]:
        return ["zpool", "detach", name, device]

    def build_pool_replace(self, name: str, old_device: str, new_device: str) -> List[str]:
        return ["zpool", "replace", name, old_device, new_device]

    def build_pool_offline(self, name: str, device: str) -> List[str]:
        return ["zpool", "offline", name, device]

    def build_pool_online(self, name: str, device: str) -> List[str]:
        return ["zpool", "online", name, device]

    def build_pool_clear(self, name: str, device: Optional[str] = None) -> List[str]:
        cmd = ["zpool", "clear", name]
        if device:
            cmd.append(device)
        return cmd

    def build_pool_set_property(self, name: str, prop: str, value: str) -> List[str]:
        return ["zpool", "set", f"{prop}={value}", name]

    def build_dataset_create(
        self,
        path: str,
        type: DatasetType = DatasetType.FILESYSTEM,
        properties: Optional[Dict[str, str]] = None,
    ) -> List[str]:
        cmd = ["zfs", "create"]
        if properties:
            for k, v in properties.items():
                cmd.extend(["-o", f"{k}={v}"])
        cmd.append(path)
        return cmd

    def build_dataset_create_zvol(
        self,
        path: str,
        size: str,
        volblocksize: Optional[str] = None,
        sparse: bool = True,
        properties: Optional[Dict[str, str]] = None,
    ) -> List[str]:
        cmd = ["zfs", "create"]
        if sparse:
            cmd.append("-s")
        cmd.extend(["-V", size])
        if volblocksize:
            cmd.extend(["-b", volblocksize])
        if properties:
            for k, v in properties.items():
                cmd.extend(["-o", f"{k}={v}"])
        cmd.append(path)
        return cmd

    def build_dataset_destroy(self, path: str, recursive: bool = True, force: bool = True) -> List[str]:
        cmd = ["zfs", "destroy"]
        if recursive:
            cmd.append("-r")
        if force:
            cmd.append("-f")
        cmd.append(path)
        return cmd

    def build_dataset_rename(self, old_path: str, new_path: str) -> List[str]:
        return ["zfs", "rename", old_path, new_path]

    def build_dataset_mount(self, path: str) -> List[str]:
        return ["zfs", "mount", path]

    def build_dataset_unmount(self, path: str, force: bool = False) -> List[str]:
        cmd = ["zfs", "unmount"]
        if force:
            cmd.append("-f")
        cmd.append(path)
        return cmd

    def build_dataset_set_property(self, path: str, prop: str, value: str) -> List[str]:
        return ["zfs", "set", f"{prop}={value}", path]

    def build_dataset_inherit(self, path: str, prop: str) -> List[str]:
        return ["zfs", "inherit", prop, path]

    def build_snapshot_create(self, path: str, snapshot_name: str, recursive: bool = False) -> List[str]:
        cmd = ["zfs", "snapshot"]
        if recursive:
            cmd.append("-r")
        cmd.append(f"{path}@{snapshot_name}")
        return cmd

    def build_snapshot_rollback(self, snapshot_path: str, destroy_intermediate: bool = True) -> List[str]:
        cmd = ["zfs", "rollback"]
        if destroy_intermediate:
            cmd.append("-r")
        cmd.append(snapshot_path)
        return cmd

    def build_snapshot_clone(
        self,
        snapshot_path: str,
        clone_path: str,
        properties: Optional[Dict[str, str]] = None,
    ) -> List[str]:
        cmd = ["zfs", "clone"]
        if properties:
            for k, v in properties.items():
                cmd.extend(["-o", f"{k}={v}"])
        cmd.extend([snapshot_path, clone_path])
        return cmd

    def build_snapshot_destroy(self, snapshot_path: str, recursive: bool = False) -> List[str]:
        cmd = ["zfs", "destroy"]
        if recursive:
            cmd.append("-r")
        cmd.append(snapshot_path)
        return cmd

    def build_snapshot_rename(self, snapshot_path: str, new_snapshot_name: str) -> List[str]:
        return ["zfs", "rename", snapshot_path, new_snapshot_name]
