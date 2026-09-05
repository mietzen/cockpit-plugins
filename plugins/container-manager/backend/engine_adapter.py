import json
import os
import shutil
import sys
from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional, Tuple

# Ensure local libexec directory and common python paths are resolvable
_CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
if _CURRENT_DIR not in sys.path:
    sys.path.insert(0, _CURRENT_DIR)

from cockpit_common.runner import run_cmd
from cockpit_common.services import get_service_status, is_service_active


def detect_engines() -> Dict[str, Any]:
    """Detects presence and status of Docker and Podman engines."""
    docker_bin = shutil.which("docker")
    podman_bin = shutil.which("podman")

    docker_version = ""
    if docker_bin:
        rc, out, _ = run_cmd([docker_bin, "--version"])
        if rc == 0:
            docker_version = out.replace("Docker version", "").split(",")[0].strip()

    podman_version = ""
    if podman_bin:
        rc, out, _ = run_cmd([podman_bin, "--version"])
        if rc == 0:
            podman_version = out.replace("podman version", "").strip()

    docker_svc = get_service_status("docker")
    podman_svc = get_service_status("podman")

    preferred = "docker" if docker_bin else ("podman" if podman_bin else "none")

    return {
        "docker": {
            "installed": docker_bin is not None,
            "version": docker_version,
            "path": docker_bin or "",
            "active": docker_svc.get("active", False),
            "service": docker_svc,
        },
        "podman": {
            "installed": podman_bin is not None,
            "version": podman_version,
            "path": podman_bin or "",
            "active": podman_svc.get("active", False),
            "service": podman_svc,
        },
        "active_engine": preferred,
    }


class ContainerEngineAdapter(ABC):
    """Abstract adapter unifying Docker and Podman CLI interactions."""

    def __init__(self, binary_name: str):
        self.binary_name = binary_name
        self.bin = shutil.which(binary_name) or binary_name

    @abstractmethod
    def list_containers(self) -> List[Dict[str, Any]]:
        pass

    @abstractmethod
    def list_images(self) -> List[Dict[str, Any]]:
        pass

    @abstractmethod
    def list_volumes(self) -> List[Dict[str, Any]]:
        pass

    @abstractmethod
    def list_networks(self) -> List[Dict[str, Any]]:
        pass

    def container_action(self, container_id: str, action: str) -> Dict[str, Any]:
        valid_actions = {"start", "stop", "kill", "restart"}
        if action not in valid_actions:
            raise ValueError(f"Invalid container action '{action}'")

        cmd = [self.bin, action, container_id]
        rc, out, err = run_cmd(cmd, timeout=30)
        if rc != 0:
            return {"status": "error", "error": err or out}
        return {"status": "success", "output": out}

    def delete_entity(self, kind: str, id_or_name: str, force: bool = False) -> Dict[str, Any]:
        if kind == "container":
            cmd = [self.bin, "rm", "-f" if force else "", id_or_name]
        elif kind == "image":
            cmd = [self.bin, "rmi", "-f" if force else "", id_or_name]
        elif kind == "volume":
            cmd = [self.bin, "volume", "rm", "-f" if force else "", id_or_name]
        elif kind == "network":
            cmd = [self.bin, "network", "rm", id_or_name]
        else:
            raise ValueError(f"Invalid entity kind '{kind}'")

        cmd = [arg for arg in cmd if arg]
        rc, out, err = run_cmd(cmd, timeout=30)
        if rc != 0:
            return {"status": "error", "error": err or out}
        return {"status": "success", "output": out}

    def prune_entity(self, kind: str, prune_all: bool = False) -> Dict[str, Any]:
        if kind == "container":
            cmd = [self.bin, "container", "prune", "-f"]
        elif kind == "image":
            cmd = [self.bin, "image", "prune", "-a" if prune_all else "", "-f"]
        elif kind == "volume":
            cmd = [self.bin, "volume", "prune", "-f"]
        elif kind == "network":
            cmd = [self.bin, "network", "prune", "-f"]
        else:
            raise ValueError(f"Invalid entity kind '{kind}'")

        cmd = [arg for arg in cmd if arg]
        rc, out, err = run_cmd(cmd, timeout=60)
        if rc != 0:
            return {"status": "error", "error": err or out}
        return {"status": "success", "output": out}

    def system_prune(self, include_volumes: bool = False) -> Dict[str, Any]:
        cmd = [self.bin, "system", "prune", "-a", "-f"]
        if include_volumes:
            cmd.append("--volumes")

        rc, out, err = run_cmd(cmd, timeout=120)
        if rc != 0:
            return {"status": "error", "error": err or out}
        return {"status": "success", "output": out}


class DockerAdapter(ContainerEngineAdapter):
    """Adapter for Docker Engine."""

    def __init__(self):
        super().__init__("docker")

    def list_containers(self) -> List[Dict[str, Any]]:
        rc, out, _ = run_cmd([self.bin, "ps", "-a", "--no-trunc", "--format", "{{json .}}"])
        if rc != 0 or not out.strip():
            return []

        containers = []
        for line in out.strip().splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                data = json.loads(line)
            except Exception:
                continue

            # Parse state
            raw_status = data.get("Status", "")
            raw_state = data.get("State", "").lower()
            if not raw_state:
                if "up" in raw_status.lower():
                    raw_state = "running"
                elif "exited" in raw_status.lower():
                    raw_state = "exited"
                elif "paused" in raw_status.lower():
                    raw_state = "paused"
                else:
                    raw_state = "created"

            full_id = data.get("ID", "")
            containers.append({
                "id": full_id,
                "shortId": full_id[:12] if full_id else "",
                "name": data.get("Names", "").lstrip("/"),
                "image": data.get("Image", ""),
                "state": raw_state,
                "status": raw_status,
                "created": data.get("CreatedAt", ""),
                "ports": data.get("Ports", ""),
                "command": data.get("Command", ""),
                "networks": data.get("Networks", "").split(",") if data.get("Networks") else [],
            })
        return containers

    def list_images(self) -> List[Dict[str, Any]]:
        rc, out, _ = run_cmd([self.bin, "images", "-a", "--no-trunc", "--format", "{{json .}}"])
        if rc != 0 or not out.strip():
            return []

        # Find in-use image IDs from running/stopped containers
        containers = self.list_containers()
        used_images = {c["image"] for c in containers}

        images = []
        for line in out.strip().splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                data = json.loads(line)
            except Exception:
                continue

            full_id = data.get("ID", "")
            repo = data.get("Repository", "<none>")
            tag = data.get("Tag", "<none>")
            full_ref = f"{repo}:{tag}" if repo != "<none>" and tag != "<none>" else repo

            is_in_use = (full_ref in used_images) or (full_id in used_images) or (full_id[:12] in used_images)

            images.append({
                "id": full_id,
                "shortId": full_id[:12] if full_id else "",
                "repository": repo,
                "tag": tag,
                "size": data.get("Size", ""),
                "created": data.get("CreatedAt", ""),
                "inUse": is_in_use,
            })
        return images

    def list_volumes(self) -> List[Dict[str, Any]]:
        rc, out, _ = run_cmd([self.bin, "volume", "ls", "--format", "{{json .}}"])
        if rc != 0 or not out.strip():
            return []

        # Find in-use volume names from containers
        containers_rc, containers_out, _ = run_cmd([self.bin, "ps", "-a", "--no-trunc", "--format", "{{json .}}"])
        used_volumes = set()
        if containers_rc == 0 and containers_out.strip():
            for line in containers_out.strip().splitlines():
                try:
                    cdata = json.loads(line)
                    mounts_str = cdata.get("Mounts", "")
                    if mounts_str:
                        for m in mounts_str.split(","):
                            m = m.strip()
                            if m:
                                used_volumes.add(m)
                except Exception:
                    pass

        volumes = []
        for line in out.strip().splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                data = json.loads(line)
            except Exception:
                continue

            name = data.get("Name", "")
            volumes.append({
                "name": name,
                "driver": data.get("Driver", "local"),
                "scope": data.get("Scope", "local"),
                "mountpoint": data.get("Mountpoint", ""),
                "inUse": name in used_volumes,
            })
        return volumes

    def list_networks(self) -> List[Dict[str, Any]]:
        rc, out, _ = run_cmd([self.bin, "network", "ls", "--no-trunc", "--format", "{{json .}}"])
        if rc != 0 or not out.strip():
            return []

        # Find in-use network names from containers
        containers_rc, containers_out, _ = run_cmd([self.bin, "ps", "-a", "--no-trunc", "--format", "{{json .}}"])
        used_networks = set()
        if containers_rc == 0 and containers_out.strip():
            for line in containers_out.strip().splitlines():
                try:
                    cdata = json.loads(line)
                    nets_str = cdata.get("Networks", "")
                    if nets_str:
                        for n in nets_str.split(","):
                            n = n.strip()
                            if n:
                                used_networks.add(n)
                except Exception:
                    pass

        networks = []
        for line in out.strip().splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                data = json.loads(line)
            except Exception:
                continue

            net_id = data.get("ID", "")
            name = data.get("Name", "")
            is_built_in = name in ("bridge", "host", "none")

            networks.append({
                "id": net_id,
                "shortId": net_id[:12] if net_id else "",
                "name": name,
                "driver": data.get("Driver", ""),
                "scope": data.get("Scope", "local"),
                "isBuiltIn": is_built_in,
                "inUse": is_built_in or (name in used_networks) or (net_id in used_networks),
            })
        return networks


class PodmanAdapter(ContainerEngineAdapter):
    """Adapter for Podman Engine."""

    def __init__(self):
        super().__init__("podman")

    def list_containers(self) -> List[Dict[str, Any]]:
        rc, out, _ = run_cmd([self.bin, "ps", "-a", "--format", "json"])
        if rc != 0 or not out.strip():
            return []

        try:
            data_list = json.loads(out)
        except Exception:
            return []

        containers = []
        for item in data_list:
            full_id = item.get("id", item.get("Id", item.get("ID", "")))
            names = item.get("names", item.get("Names", []))
            name = names[0] if isinstance(names, list) and names else str(names)

            raw_state = str(item.get("state", item.get("State", ""))).lower()
            raw_status = str(item.get("status", item.get("Status", "")))

            # Ports normalization
            ports_raw = item.get("ports", item.get("Ports", []))
            ports_str = ""
            if isinstance(ports_raw, list):
                ports_str = ", ".join([
                    f"{p.get('host_ip', p.get('hostIP', ''))}:{p.get('host_port', p.get('hostPort', ''))}->{p.get('container_port', p.get('containerPort', ''))}/{p.get('protocol', 'tcp')}"
                    for p in ports_raw if isinstance(p, dict)
                ])
            elif isinstance(ports_raw, str):
                ports_str = ports_raw

            raw_cmd = item.get("command", item.get("Command", []))
            cmd_str = " ".join(raw_cmd) if isinstance(raw_cmd, list) else str(raw_cmd)
            net_list = item.get("networks", item.get("Networks", []))

            containers.append({
                "id": full_id,
                "shortId": full_id[:12] if full_id else "",
                "name": name.lstrip("/"),
                "image": item.get("image", item.get("Image", "")),
                "state": raw_state,
                "status": raw_status or raw_state,
                "created": str(item.get("created", item.get("Created", ""))),
                "ports": ports_str,
                "command": cmd_str,
                "networks": net_list if isinstance(net_list, list) else [],
            })
        return containers

    def list_images(self) -> List[Dict[str, Any]]:
        rc, out, _ = run_cmd([self.bin, "images", "--format", "json"])
        if rc != 0 or not out.strip():
            return []

        try:
            data_list = json.loads(out)
        except Exception:
            return []

        containers = self.list_containers()
        used_images = {c["image"] for c in containers}

        images = []
        for item in data_list:
            full_id = item.get("id", item.get("Id", item.get("ID", "")))
            repo_tags = item.get("names", item.get("Names", item.get("repo_tags", item.get("RepoTags", []))))
            repo = item.get("repository", item.get("Repository", "<none>"))
            tag = item.get("tag", item.get("Tag", "<none>"))
            if repo_tags and isinstance(repo_tags, list) and repo_tags[0]:
                ref = repo_tags[0]
                if ":" in ref:
                    repo, tag = ref.rsplit(":", 1)
                else:
                    repo = ref
                    tag = "latest"

            full_ref = f"{repo}:{tag}"
            is_in_use = (full_ref in used_images) or (full_id in used_images) or (full_id[:12] in used_images)

            size_bytes = item.get("size", item.get("Size", 0))
            size_formatted = f"{size_bytes / (1024 * 1024):.1f} MB" if isinstance(size_bytes, (int, float)) and size_bytes > 0 else str(size_bytes)

            images.append({
                "id": full_id,
                "shortId": full_id[:12] if full_id else "",
                "repository": repo,
                "tag": tag,
                "size": size_formatted,
                "created": str(item.get("created", item.get("Created", ""))),
                "inUse": is_in_use,
            })
        return images

    def list_volumes(self) -> List[Dict[str, Any]]:
        rc, out, _ = run_cmd([self.bin, "volume", "ls", "--format", "json"])
        if rc != 0 or not out.strip():
            return []

        try:
            data_list = json.loads(out)
        except Exception:
            return []

        # Find in-use volume names from containers
        used_volumes = set()
        containers_rc, containers_out, _ = run_cmd([self.bin, "ps", "-a", "--format", "json"])
        if containers_rc == 0 and containers_out.strip():
            try:
                cdata_list = json.loads(containers_out)
                for citem in cdata_list:
                    mounts = citem.get("mounts", citem.get("Mounts", []))
                    if isinstance(mounts, list):
                        for m in mounts:
                            if isinstance(m, dict):
                                src = m.get("Name", m.get("Source", m.get("source", "")))
                                if src:
                                    used_volumes.add(src)
                            elif isinstance(m, str):
                                used_volumes.add(m)
                    vols = citem.get("volumes", citem.get("Volumes", []))
                    if isinstance(vols, list):
                        for v in vols:
                            if isinstance(v, str):
                                used_volumes.add(v)
            except Exception:
                pass

        volumes = []
        for item in data_list:
            name = item.get("name", item.get("Name", ""))
            volumes.append({
                "name": name,
                "driver": item.get("driver", item.get("Driver", "local")),
                "scope": item.get("scope", item.get("Scope", "local")),
                "mountpoint": item.get("mountPoint", item.get("mountpoint", item.get("MountPoint", item.get("Mountpoint", "")))),
                "inUse": name in used_volumes,
            })
        return volumes

    def list_networks(self) -> List[Dict[str, Any]]:
        rc, out, _ = run_cmd([self.bin, "network", "ls", "--format", "json"])
        if rc != 0 or not out.strip():
            return []

        try:
            data_list = json.loads(out)
        except Exception:
            return []

        # Find in-use network names from containers
        used_networks = set()
        containers_rc, containers_out, _ = run_cmd([self.bin, "ps", "-a", "--format", "json"])
        if containers_rc == 0 and containers_out.strip():
            try:
                cdata_list = json.loads(containers_out)
                for citem in cdata_list:
                    nets = citem.get("networks", citem.get("Networks", []))
                    if isinstance(nets, list):
                        for n in nets:
                            if isinstance(n, str):
                                used_networks.add(n)
                            elif isinstance(n, dict):
                                nname = n.get("Name", n.get("name", ""))
                                if nname:
                                    used_networks.add(nname)
                    elif isinstance(nets, str) and nets:
                        used_networks.add(nets)
            except Exception:
                pass

        networks = []
        for item in data_list:
            net_id = item.get("id", item.get("Id", item.get("ID", item.get("network_interface", item.get("NetworkInterface", "")))))
            name = item.get("name", item.get("Name", ""))
            is_built_in = name in ("podman", "bridge", "host", "none")

            subnets = []
            subnets_raw = item.get("subnets", item.get("Subnets", []))
            if isinstance(subnets_raw, list):
                for s in subnets_raw:
                    if isinstance(s, dict):
                        sub_val = s.get("subnet", s.get("Subnet"))
                        if sub_val:
                            subnets.append(str(sub_val))

            networks.append({
                "id": net_id,
                "shortId": net_id[:12] if net_id else "",
                "name": name,
                "driver": item.get("driver", item.get("Driver", "")),
                "scope": "local",
                "subnet": ", ".join(subnets) if subnets else "",
                "isBuiltIn": is_built_in,
                "inUse": is_built_in or (name in used_networks) or (net_id in used_networks),
            })
        return networks


def get_adapter(engine_name: Optional[str] = None) -> ContainerEngineAdapter:
    """Returns appropriate adapter based on requested or detected engine."""
    if not engine_name or engine_name == "auto":
        detected = detect_engines()
        engine_name = detected.get("active_engine", "docker")

    if engine_name == "podman":
        return PodmanAdapter()
    return DockerAdapter()
