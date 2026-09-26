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
    docker_active = False
    if docker_bin:
        rc, out, _ = run_cmd([docker_bin, "--version"])
        if rc == 0:
            docker_version = out.replace("Docker version", "").split(",")[0].strip()
        info_rc, _, _ = run_cmd([docker_bin, "info"], timeout=5)
        docker_active = info_rc == 0

    podman_version = ""
    podman_active = False
    if podman_bin:
        rc, out, _ = run_cmd([podman_bin, "--version"])
        if rc == 0:
            podman_version = out.replace("podman version", "").strip()
        info_rc, _, _ = run_cmd([podman_bin, "info"], timeout=5)
        podman_active = info_rc == 0 or podman_version != ""

    docker_svc = get_service_status("docker")
    podman_svc = get_service_status("podman")

    preferred = (
        "docker"
        if (docker_bin and docker_active)
        else (
            "podman"
            if (podman_bin and podman_active)
            else ("docker" if docker_bin else ("podman" if podman_bin else "none"))
        )
    )

    return {
        "docker": {
            "installed": docker_bin is not None,
            "version": docker_version,
            "path": docker_bin or "",
            "active": docker_active or docker_svc.get("active", False),
            "service": docker_svc,
        },
        "podman": {
            "installed": podman_bin is not None,
            "version": podman_version,
            "path": podman_bin or "",
            "active": podman_active or podman_svc.get("active", False),
            "service": podman_svc,
        },
        "active_engine": preferred,
    }


def normalize_image_ref(ref: str) -> set:
    """Generates a set of normalized aliases for an image reference/tag/ID."""
    if not ref or ref == "<none>":
        return set()
    ref = str(ref).strip()
    results = {ref}

    if ref.startswith("sha256:"):
        raw_hash = ref[7:]
        results.add(raw_hash)
        results.add(raw_hash[:12])
    elif len(ref) >= 12 and all(c in "0123456789abcdefABCDEF" for c in ref):
        results.add(ref[:12])

    registries = [
        "docker.io/library/",
        "docker.io/",
        "localhost/",
        "registry.fedoraproject.org/",
        "quay.io/",
        "ghcr.io/",
    ]
    for prefix in registries:
        if ref.startswith(prefix):
            stripped = ref[len(prefix):]
            results.add(stripped)
            if ":" in stripped:
                name_only = stripped.rsplit(":", 1)[0]
                results.add(name_only)
            else:
                results.add(f"{stripped}:latest")

    # Handle custom domain/port registries, e.g. registry.example.com/app:v1 or host:5000/app
    if "/" in ref:
        first_segment, rest = ref.split("/", 1)
        if ("." in first_segment or ":" in first_segment or first_segment == "localhost") and rest:
            results.add(rest)
            if ":" in rest:
                results.add(rest.rsplit(":", 1)[0])
            else:
                results.add(f"{rest}:latest")

    if ":" in ref:
        name_only, tag = ref.rsplit(":", 1)
        if tag == "latest":
            results.add(name_only)
    else:
        results.add(f"{ref}:latest")

    return results


def get_volume_size(mountpoint: str) -> str:
    """Calculates disk usage for a local volume mountpoint."""
    if not mountpoint or not os.path.exists(mountpoint):
        return ""

    total = 0
    try:
        if os.path.isfile(mountpoint):
            total = os.path.getsize(mountpoint)
        else:
            for root, _, files in os.walk(mountpoint):
                for f in files:
                    fp = os.path.join(root, f)
                    try:
                        if not os.path.islink(fp):
                            total += os.path.getsize(fp)
                    except OSError:
                        pass
    except Exception:
        return ""

    if total <= 0:
        return "0 B"
    if total < 1024:
        return f"{total} B"
    if total < 1024 * 1024:
        return f"{total / 1024:.1f} KB"
    if total < 1024 * 1024 * 1024:
        return f"{total / (1024 * 1024):.1f} MB"
    return f"{total / (1024 * 1024 * 1024):.2f} GB"


def extract_compose_metadata(raw_labels: Any) -> Tuple[Dict[str, str], str, str]:
    """Extracts labels dictionary, compose project name, and service name."""
    labels_dict: Dict[str, str] = {}
    if isinstance(raw_labels, dict):
        labels_dict = {str(k): str(v) for k, v in raw_labels.items()}
    elif isinstance(raw_labels, str) and raw_labels.strip():
        for pair in raw_labels.split(","):
            if "=" in pair:
                k, v = pair.split("=", 1)
                labels_dict[k.strip()] = v.strip()

    project = (
        labels_dict.get("com.docker.compose.project")
        or labels_dict.get("io.podman.compose.project")
        or labels_dict.get("com.docker.stack.namespace")
        or ""
    )
    service = (
        labels_dict.get("com.docker.compose.service")
        or labels_dict.get("io.podman.compose.service")
        or ""
    )
    return labels_dict, project, service


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

    def inspect_entity(self, kind: str, id_or_name: str) -> Dict[str, Any]:
        if kind == "container":
            cmd = [self.bin, "inspect", id_or_name]
        elif kind == "image":
            cmd = [self.bin, "image", "inspect", id_or_name]
        elif kind == "volume":
            cmd = [self.bin, "volume", "inspect", id_or_name]
        elif kind == "network":
            cmd = [self.bin, "network", "inspect", id_or_name]
        else:
            cmd = [self.bin, "inspect", id_or_name]

        rc, out, err = run_cmd(cmd, timeout=30)
        if rc != 0:
            return {"status": "error", "error": err or out}

        try:
            parsed = json.loads(out)
            item = parsed[0] if isinstance(parsed, list) and len(parsed) > 0 else parsed
            return {"status": "success", "data": item, "raw": out}
        except Exception:
            return {"status": "success", "data": {}, "raw": out}

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

    def check_shells(self, container_id: str) -> Dict[str, Any]:
        """Detects available interactive shells in container with fallback to entrypoint."""
        candidates = ["/bin/bash", "/bin/sh", "/bin/ash", "/bin/zsh"]
        available: List[str] = []

        for shell in candidates:
            rc, _, _ = run_cmd([self.bin, "exec", container_id, shell, "-c", "exit 0"], timeout=3)
            if rc == 0:
                available.append(shell)

        entrypoint = ""
        cmd = ""
        inspect_res = self.inspect_entity("container", container_id)
        if inspect_res.get("status") == "success" and isinstance(inspect_res.get("data"), dict):
            config = inspect_res["data"].get("Config", {})
            ep = config.get("Entrypoint")
            if isinstance(ep, list) and ep:
                entrypoint = " ".join(ep)
            elif isinstance(ep, str) and ep:
                entrypoint = ep

            cm = config.get("Cmd")
            if isinstance(cm, list) and cm:
                cmd = " ".join(cm)
            elif isinstance(cm, str) and cm:
                cmd = cm

        default_shell = "/bin/sh"
        if available:
            default_shell = "/bin/bash" if "/bin/bash" in available else available[0]
        elif entrypoint:
            default_shell = entrypoint
        elif cmd:
            default_shell = cmd

        return {
            "status": "success",
            "shells": available,
            "entrypoint": entrypoint,
            "cmd": cmd,
            "default_shell": default_shell,
        }


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
            raw_labels = data.get("Labels", "")
            labels_dict, project, service = extract_compose_metadata(raw_labels)

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
                "labels": labels_dict,
                "project": project,
                "service": service,
            })
        return containers

    def list_images(self) -> List[Dict[str, Any]]:
        rc, out, _ = run_cmd([self.bin, "images", "-a", "--no-trunc", "--format", "{{json .}}"])
        if rc != 0 or not out.strip():
            return []

        # Find in-use image IDs and references from running/stopped containers
        containers = self.list_containers()
        used_image_refs = set()
        for c in containers:
            used_image_refs.update(normalize_image_ref(c.get("image", "")))

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
            clean_id = full_id.removeprefix("sha256:") if isinstance(full_id, str) else str(full_id)
            repo = data.get("Repository", "<none>")
            tag = data.get("Tag", "<none>")
            full_ref = f"{repo}:{tag}" if repo != "<none>" and tag != "<none>" else repo

            img_refs = normalize_image_ref(full_id)
            img_refs.update(normalize_image_ref(full_ref))
            img_refs.update(normalize_image_ref(repo))
            is_in_use = bool(img_refs.intersection(used_image_refs))

            images.append({
                "id": clean_id,
                "shortId": clean_id[:12] if clean_id else "",
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
            mountpoint = data.get("Mountpoint", "")
            vol_size = get_volume_size(mountpoint)
            volumes.append({
                "name": name,
                "driver": data.get("Driver", "local"),
                "scope": data.get("Scope", "local"),
                "mountpoint": mountpoint,
                "size": vol_size,
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
            raw_labels = item.get("labels", item.get("Labels", {}))
            labels_dict, project, service = extract_compose_metadata(raw_labels)

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
                "labels": labels_dict,
                "project": project,
                "service": service,
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
        used_image_refs = set()
        for c in containers:
            used_image_refs.update(normalize_image_ref(c.get("image", "")))

        images = []
        for item in data_list:
            full_id = item.get("id", item.get("Id", item.get("ID", "")))
            clean_id = full_id.removeprefix("sha256:") if isinstance(full_id, str) else str(full_id)
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
            img_refs = normalize_image_ref(full_id)
            if isinstance(repo_tags, list):
                for t in repo_tags:
                    img_refs.update(normalize_image_ref(t))
            elif repo_tags:
                img_refs.update(normalize_image_ref(str(repo_tags)))
            img_refs.update(normalize_image_ref(full_ref))
            img_refs.update(normalize_image_ref(repo))
            is_in_use = bool(img_refs.intersection(used_image_refs))

            size_bytes = item.get("size", item.get("Size", 0))
            size_formatted = f"{size_bytes / (1024 * 1024):.1f} MB" if isinstance(size_bytes, (int, float)) and size_bytes > 0 else str(size_bytes)

            images.append({
                "id": clean_id,
                "shortId": clean_id[:12] if clean_id else "",
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
            mountpoint = item.get("mountPoint", item.get("mountpoint", item.get("MountPoint", item.get("Mountpoint", ""))))
            vol_size = get_volume_size(mountpoint)
            volumes.append({
                "name": name,
                "driver": item.get("driver", item.get("Driver", "local")),
                "scope": item.get("scope", item.get("Scope", "local")),
                "mountpoint": mountpoint,
                "size": vol_size,
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
