import json
import unittest
from unittest.mock import MagicMock, patch

from engine_adapter import (
    ContainerEngineAdapter,
    DockerAdapter,
    PodmanAdapter,
    detect_engines,
    get_adapter,
)


class TestEngineAdapter(unittest.TestCase):

    @patch("shutil.which")
    @patch("engine_adapter.run_cmd")
    @patch("engine_adapter.get_service_status")
    def test_detect_engines_both(self, mock_svc, mock_run, mock_which):
        mock_which.side_effect = lambda cmd: f"/usr/bin/{cmd}" if cmd in ("docker", "podman") else None
        mock_run.side_effect = [
            (0, "Docker version 27.1.1, build 6312585", ""),
            (0, "Server Version: 27.1.1", ""),
            (0, "podman version 5.2.0", ""),
            (0, "version: 5.2.0", ""),
        ]
        mock_svc.side_effect = [
            {"active": True, "state": "active", "enabled": True},
            {"active": False, "state": "inactive", "enabled": False},
        ]

        res = detect_engines()
        self.assertTrue(res["docker"]["installed"])
        self.assertEqual(res["docker"]["version"], "27.1.1")
        self.assertTrue(res["docker"]["active"])
        self.assertTrue(res["podman"]["installed"])
        self.assertEqual(res["podman"]["version"], "5.2.0")
        self.assertTrue(res["podman"]["active"])
        self.assertEqual(res["active_engine"], "docker")

    @patch("engine_adapter.run_cmd")
    def test_inspect_entity(self, mock_run):
        mock_run.return_value = (0, json.dumps([{"Id": "c1", "State": {"Status": "running"}}]), "")
        adapter = DockerAdapter()
        res = adapter.inspect_entity("container", "c1")
        self.assertEqual(res["status"], "success")
        self.assertEqual(res["data"]["Id"], "c1")

    @patch("shutil.which", return_value=None)
    @patch("engine_adapter.get_service_status", return_value={"active": False})
    def test_detect_engines_none(self, _mock_svc, _mock_which):
        res = detect_engines()
        self.assertFalse(res["docker"]["installed"])
        self.assertFalse(res["podman"]["installed"])
        self.assertEqual(res["active_engine"], "none")

    def test_get_adapter(self):
        with patch("engine_adapter.detect_engines", return_value={"active_engine": "docker"}):
            adapter = get_adapter("auto")
            self.assertIsInstance(adapter, DockerAdapter)

        adapter_podman = get_adapter("podman")
        self.assertIsInstance(adapter_podman, PodmanAdapter)

    @patch("engine_adapter.run_cmd")
    def test_docker_list_containers(self, mock_run):
        mock_output = (
            '{"ID":"1234567890abcdef","Names":"web-app","Image":"nginx:latest","State":"running","Status":"Up 2 hours","CreatedAt":"2026-09-01","Ports":"0.0.0.0:80->80/tcp","Command":"nginx -g","Networks":"bridge"}\n'
            '{"ID":"abcdef1234567890","Names":"db-app","Image":"postgres:16","State":"","Status":"Exited (0) 10 minutes ago","CreatedAt":"2026-09-01","Ports":"","Command":"postgres","Networks":""}\n'
        )
        mock_run.return_value = (0, mock_output, "")

        adapter = DockerAdapter()
        containers = adapter.list_containers()
        self.assertEqual(len(containers), 2)
        self.assertEqual(containers[0]["name"], "web-app")
        self.assertEqual(containers[0]["state"], "running")
        self.assertEqual(containers[0]["shortId"], "1234567890ab")
        self.assertEqual(containers[1]["name"], "db-app")
        self.assertEqual(containers[1]["state"], "exited")

    @patch("engine_adapter.run_cmd")
    def test_docker_list_images(self, mock_run):
        # mock list_images then list_containers
        mock_run.side_effect = [
            (0, '{"ID":"sha256:abcdef1234567890abcdef1234567890","Repository":"nginx","Tag":"latest","Size":"140MB","CreatedAt":"2026-08-15"}\n{"ID":"img2","Repository":"redis","Tag":"alpine","Size":"30MB","CreatedAt":"2026-08-10"}\n', ""),
            (0, '{"ID":"c1","Names":"web","Image":"nginx:latest"}\n', ""),
        ]

        adapter = DockerAdapter()
        images = adapter.list_images()
        self.assertEqual(len(images), 2)
        self.assertEqual(images[0]["id"], "abcdef1234567890abcdef1234567890")
        self.assertEqual(images[0]["shortId"], "abcdef123456")
        self.assertEqual(images[0]["repository"], "nginx")
        self.assertTrue(images[0]["inUse"])
        self.assertFalse(images[1]["inUse"])

    @patch("engine_adapter.run_cmd")
    def test_docker_list_volumes(self, mock_run):
        mock_output = '{"Name":"app-data","Driver":"local","Scope":"local","Mountpoint":"/var/lib/docker/volumes/app-data/_data"}\n'
        mock_run.side_effect = [
            (0, mock_output, ""),
            (0, '{"Mounts":"app-data"}', ""),
        ]

        adapter = DockerAdapter()
        volumes = adapter.list_volumes()
        self.assertEqual(len(volumes), 1)
        self.assertEqual(volumes[0]["name"], "app-data")
        self.assertTrue(volumes[0]["inUse"])

    @patch("engine_adapter.run_cmd")
    def test_docker_list_networks(self, mock_run):
        mock_output = (
            '{"ID":"net1","Name":"bridge","Driver":"bridge","Scope":"local"}\n'
            '{"ID":"net2","Name":"custom-net","Driver":"bridge","Scope":"local"}\n'
        )
        mock_run.side_effect = [
            (0, mock_output, ""),
            (0, '{"Networks":"bridge"}', ""),
        ]

        adapter = DockerAdapter()
        networks = adapter.list_networks()
        self.assertEqual(len(networks), 2)
        self.assertTrue(networks[0]["isBuiltIn"])
        self.assertFalse(networks[1]["isBuiltIn"])

    @patch("engine_adapter.run_cmd")
    def test_podman_list_containers(self, mock_run):
        mock_data = [
            {
                "Id": "9876543210fedcba",
                "Names": ["podman-web"],
                "Image": "docker.io/library/alpine:latest",
                "State": "running",
                "Status": "Up 5 minutes",
                "Ports": [{"host_ip": "0.0.0.0", "host_port": 8080, "container_port": 80, "protocol": "tcp"}],
                "Command": ["sh", "-c", "echo hi"],
                "Networks": ["podman"],
            }
        ]
        mock_run.return_value = (0, json.dumps(mock_data), "")

        adapter = PodmanAdapter()
        containers = adapter.list_containers()
        self.assertEqual(len(containers), 1)
        self.assertEqual(containers[0]["name"], "podman-web")
        self.assertEqual(containers[0]["state"], "running")
        self.assertIn("8080->80/tcp", containers[0]["ports"])

    @patch("engine_adapter.run_cmd")
    def test_podman_list_images(self, mock_run):
        # mock list_images then list_containers
        mock_run.side_effect = [
            (0, json.dumps([{"Id": "img1", "RepoTags": ["docker.io/library/alpine:latest"], "Size": 5000000}]), ""),
            (0, "[]", ""),
        ]

        adapter = PodmanAdapter()
        images = adapter.list_images()
        self.assertEqual(len(images), 1)
        self.assertEqual(images[0]["repository"], "docker.io/library/alpine")
        self.assertEqual(images[0]["tag"], "latest")

    @patch("engine_adapter.run_cmd")
    def test_image_in_use_normalization_traefik_whoami(self, mock_run):
        # Container running traefik/whoami without registry or tag
        # Image has docker.io/traefik/whoami:latest
        mock_run.side_effect = [
            (0, '{"ID":"img_whoami_123","Repository":"docker.io/traefik/whoami","Tag":"latest","Size":"10MB","CreatedAt":"2026-08-15"}\n', ""),
            (0, '{"ID":"c_whoami","Names":"whoami-service","Image":"traefik/whoami"}\n', ""),
        ]
        adapter = DockerAdapter()
        images = adapter.list_images()
        self.assertEqual(len(images), 1)
        self.assertTrue(images[0]["inUse"])

    @patch("engine_adapter.run_cmd")
    def test_podman_image_in_use_normalization_whoami(self, mock_run):
        mock_run.side_effect = [
            (0, json.dumps([{"Id": "img_whoami_456", "RepoTags": ["docker.io/traefik/whoami:latest"], "Size": 10000000}]), ""),
            (0, json.dumps([{"Id": "c_whoami_pod", "Names": ["my-whoami"], "Image": "traefik/whoami", "State": "running"}]), ""),
        ]
        adapter = PodmanAdapter()
        images = adapter.list_images()
        self.assertEqual(len(images), 1)
        self.assertTrue(images[0]["inUse"])

    @patch("engine_adapter.get_volume_size", return_value="15.5 MB")
    @patch("engine_adapter.run_cmd")
    def test_podman_list_volumes_and_networks(self, mock_run, _mock_size):
        mock_run.side_effect = [
            (0, json.dumps([{"Name": "vol1", "Driver": "local", "MountPoint": "/data"}]), ""),
            (0, json.dumps([{"Mounts": [{"Name": "vol1"}]}]), ""),
            (0, json.dumps([{"Id": "net1", "Name": "podman", "Subnets": [{"Subnet": "10.88.0.0/16"}]}]), ""),
            (0, json.dumps([{"Networks": ["podman"]}]), ""),
        ]

        adapter = PodmanAdapter()
        vols = adapter.list_volumes()
        self.assertEqual(len(vols), 1)
        self.assertEqual(vols[0]["name"], "vol1")
        self.assertEqual(vols[0]["size"], "15.5 MB")
        self.assertTrue(vols[0]["inUse"])

        nets = adapter.list_networks()
        self.assertEqual(len(nets), 1)
        self.assertEqual(nets[0]["subnet"], "10.88.0.0/16")
        self.assertTrue(nets[0]["isBuiltIn"])
        self.assertTrue(nets[0]["inUse"])

    @patch("engine_adapter.run_cmd")
    def test_container_actions(self, mock_run):
        mock_run.return_value = (0, "container1", "")
        adapter = DockerAdapter()

        res = adapter.container_action("container1", "start")
        self.assertEqual(res["status"], "success")

        res_stop = adapter.container_action("container1", "stop")
        self.assertEqual(res_stop["status"], "success")

        with self.assertRaises(ValueError):
            adapter.container_action("container1", "invalid_action")

    @patch("engine_adapter.run_cmd")
    def test_delete_entities(self, mock_run):
        mock_run.return_value = (0, "deleted", "")
        adapter = DockerAdapter()

        self.assertEqual(adapter.delete_entity("container", "c1")["status"], "success")
        self.assertEqual(adapter.delete_entity("image", "i1")["status"], "success")
        self.assertEqual(adapter.delete_entity("volume", "v1")["status"], "success")
        self.assertEqual(adapter.delete_entity("network", "n1")["status"], "success")

        with self.assertRaises(ValueError):
            adapter.delete_entity("unknown", "x1")

    @patch("engine_adapter.run_cmd")
    def test_prune_operations(self, mock_run):
        mock_run.return_value = (0, "Total reclaimed space: 0B", "")
        adapter = DockerAdapter()

        self.assertEqual(adapter.prune_entity("container")["status"], "success")
        self.assertEqual(adapter.prune_entity("image", prune_all=True)["status"], "success")
        self.assertEqual(adapter.prune_entity("volume")["status"], "success")
        self.assertEqual(adapter.prune_entity("network")["status"], "success")
        self.assertEqual(adapter.system_prune(include_volumes=True)["status"], "success")

    @patch("engine_adapter.run_cmd")
    def test_check_shells_detected(self, mock_run):
        # mock bash success, sh success, ash fail, zsh fail, inspect container
        mock_run.side_effect = [
            (0, "", ""),  # /bin/bash
            (0, "", ""),  # /bin/sh
            (1, "", "not found"),  # /bin/ash
            (1, "", "not found"),  # /bin/zsh
            (0, json.dumps([{"Config": {"Entrypoint": ["/entrypoint.sh"], "Cmd": ["nginx"]}}]), ""),
        ]
        adapter = DockerAdapter()
        res = adapter.check_shells("c1")
        self.assertEqual(res["status"], "success")
        self.assertEqual(res["shells"], ["/bin/bash", "/bin/sh"])
        self.assertEqual(res["default_shell"], "/bin/bash")
        self.assertEqual(res["entrypoint"], "/entrypoint.sh")

    @patch("engine_adapter.run_cmd")
    def test_check_shells_fallback_entrypoint(self, mock_run):
        # mock all 4 shells fail, inspect returns entrypoint
        mock_run.side_effect = [
            (1, "", ""),
            (1, "", ""),
            (1, "", ""),
            (1, "", ""),
            (0, json.dumps([{"Config": {"Entrypoint": ["/app/start"], "Cmd": []}}]), ""),
        ]
        adapter = DockerAdapter()
        res = adapter.check_shells("c1")
        self.assertEqual(res["status"], "success")
        self.assertEqual(res["shells"], [])
        self.assertEqual(res["default_shell"], "/app/start")
        self.assertEqual(res["entrypoint"], "/app/start")

    @patch("engine_adapter.run_cmd")
    def test_check_shells_cmd_fallback(self, mock_run):
        # mock shells fail, inspect returns string Entrypoint and list Cmd
        mock_run.side_effect = [
            (1, "", ""),
            (1, "", ""),
            (1, "", ""),
            (1, "", ""),
            (0, json.dumps([{"Config": {"Entrypoint": "/bin/myentry", "Cmd": ["run"]}}]), ""),
        ]
        adapter = DockerAdapter()
        res = adapter.check_shells("c1")
        self.assertEqual(res["status"], "success")
        self.assertEqual(res["default_shell"], "/bin/myentry")

        # mock inspect failure
        mock_run.side_effect = [
            (1, "", ""),
            (1, "", ""),
            (1, "", ""),
            (1, "", ""),
            (1, "", "inspect failed"),
        ]
        res_fail = adapter.check_shells("c1")
        self.assertEqual(res_fail["status"], "success")
        self.assertEqual(res_fail["default_shell"], "/bin/sh")

    @patch("engine_adapter.run_cmd")
    def test_inspect_entity_all_kinds_and_errors(self, mock_run):
        adapter = DockerAdapter()

        # Image inspect
        mock_run.return_value = (0, json.dumps([{"Id": "img1"}]), "")
        self.assertEqual(adapter.inspect_entity("image", "img1")["status"], "success")

        # Volume inspect
        mock_run.return_value = (0, json.dumps([{"Name": "vol1"}]), "")
        self.assertEqual(adapter.inspect_entity("volume", "vol1")["status"], "success")

        # Network inspect
        mock_run.return_value = (0, json.dumps([{"Id": "net1"}]), "")
        self.assertEqual(adapter.inspect_entity("network", "net1")["status"], "success")

        # Unknown kind fallback inspect
        mock_run.return_value = (0, json.dumps([{"Id": "other1"}]), "")
        self.assertEqual(adapter.inspect_entity("other", "other1")["status"], "success")

        # Command failure
        mock_run.return_value = (1, "", "No such object")
        self.assertEqual(adapter.inspect_entity("container", "bad")["status"], "error")

        # Non-json parse fallback
        mock_run.return_value = (0, "not a json string", "")
        res_raw = adapter.inspect_entity("container", "c1")
        self.assertEqual(res_raw["status"], "success")
        self.assertEqual(res_raw["raw"], "not a json string")

    @patch("engine_adapter.run_cmd")
    def test_container_actions_and_delete_errors(self, mock_run):
        adapter = DockerAdapter()

        # Action failure
        mock_run.return_value = (1, "", "Cannot start container")
        self.assertEqual(adapter.container_action("c1", "start")["status"], "error")

        # Delete with force=True
        mock_run.return_value = (0, "deleted", "")
        self.assertEqual(adapter.delete_entity("container", "c1", force=True)["status"], "success")
        self.assertEqual(adapter.delete_entity("image", "i1", force=True)["status"], "success")
        self.assertEqual(adapter.delete_entity("volume", "v1", force=True)["status"], "success")

        # Delete error
        mock_run.return_value = (1, "", "resource in use")
        self.assertEqual(adapter.delete_entity("container", "c1")["status"], "error")

    @patch("engine_adapter.run_cmd")
    def test_prune_operations_and_errors(self, mock_run):
        adapter = DockerAdapter()

        # Invalid prune kind
        with self.assertRaises(ValueError):
            adapter.prune_entity("unknown")

        # Prune error
        mock_run.return_value = (1, "", "prune error")
        self.assertEqual(adapter.prune_entity("container")["status"], "error")

        # System prune without volumes and error
        mock_run.return_value = (0, "Reclaimed", "")
        self.assertEqual(adapter.system_prune(include_volumes=False)["status"], "success")

        mock_run.return_value = (1, "", "system prune error")
        self.assertEqual(adapter.system_prune()["status"], "error")

    @patch("engine_adapter.run_cmd")
    def test_docker_list_volumes_and_networks_edge_cases(self, mock_run):
        adapter = DockerAdapter()

        # Empty output
        mock_run.return_value = (0, "", "")
        self.assertEqual(adapter.list_volumes(), [])
        self.assertEqual(adapter.list_networks(), [])

        # Non-zero return code
        mock_run.return_value = (1, "", "error")
        self.assertEqual(adapter.list_volumes(), [])
        self.assertEqual(adapter.list_networks(), [])

        # Malformed lines
        mock_run.side_effect = [
            (0, "bad-json\n", ""),
            (0, '{"Mounts":"vol1, vol2"}\n', ""),
        ]
        self.assertEqual(adapter.list_volumes(), [])

    @patch("engine_adapter.run_cmd")
    def test_podman_list_containers_and_images_edge_cases(self, mock_run):
        adapter = PodmanAdapter()

        # Containers error and empty
        mock_run.return_value = (1, "", "error")
        self.assertEqual(adapter.list_containers(), [])
        mock_run.return_value = (0, "invalid-json", "")
        self.assertEqual(adapter.list_containers(), [])

        # Containers with ports string, command string, network list
        mock_run.return_value = (0, json.dumps([{
            "Id": "p123456789012",
            "Names": ["/test-pod"],
            "State": "running",
            "Status": "Up 5 minutes",
            "Ports": "8080->80/tcp",
            "Command": "nginx",
            "Networks": ["podman"],
        }]), "")
        containers = adapter.list_containers()
        self.assertEqual(len(containers), 1)
        self.assertEqual(containers[0]["name"], "test-pod")
        self.assertEqual(containers[0]["ports"], "8080->80/tcp")

        # Images error and empty
        mock_run.return_value = (1, "", "error")
        self.assertEqual(adapter.list_images(), [])
        mock_run.return_value = (0, "invalid-json", "")
        self.assertEqual(adapter.list_images(), [])

        # Images with untagged name
        mock_run.side_effect = [
            (0, json.dumps([{"Id": "img_untagged", "Names": ["myimage"], "Size": 0}]), ""),
            (0, "[]", ""),
        ]
        images = adapter.list_images()
        self.assertEqual(len(images), 1)
        self.assertEqual(images[0]["repository"], "myimage")
        self.assertEqual(images[0]["tag"], "latest")

    @patch("engine_adapter.run_cmd")
    def test_podman_volumes_and_networks_edge_cases(self, mock_run):
        podman = PodmanAdapter()

        # Volume list errors and string/dict mounts
        mock_run.side_effect = [
            (1, "", "error"),
            (0, json.dumps([{"Name": "v1", "Driver": "local"}]), ""),
            (0, json.dumps([
                {"mounts": ["v1", {"Source": "v1"}]},
                {"volumes": ["v1"]},
            ]), ""),
            (1, "", "error"),
            (0, json.dumps([{"Name": "custom_net", "subnets": [{"subnet": "192.168.1.0/24"}]}]), ""),
            (0, json.dumps([
                {"networks": ["custom_net", {"name": "custom_net"}]},
                {"networks": "custom_net"},
            ]), ""),
        ]

        self.assertEqual(podman.list_volumes(), [])
        vols = podman.list_volumes()
        self.assertEqual(len(vols), 1)
        self.assertTrue(vols[0]["inUse"])

        self.assertEqual(podman.list_networks(), [])
        nets = podman.list_networks()
        self.assertEqual(len(nets), 1)
        self.assertEqual(nets[0]["subnet"], "192.168.1.0/24")
        self.assertTrue(nets[0]["inUse"])

    @patch("shutil.which")
    @patch("engine_adapter.run_cmd")
    @patch("engine_adapter.get_service_status")
    def test_detect_engines_edge_cases(self, mock_svc, mock_run, mock_which):
        # Only docker installed
        mock_which.side_effect = lambda cmd: "/usr/bin/docker" if cmd == "docker" else None
        mock_run.side_effect = [
            (0, "Docker version 27.0.0", ""),
            (0, "Server Version: 27.0.0", ""),
        ]
        mock_svc.return_value = {"active": True, "state": "active", "enabled": True}

        res = detect_engines()
        self.assertTrue(res["docker"]["installed"])
        self.assertFalse(res["podman"]["installed"])
        self.assertEqual(res["active_engine"], "docker")

        # Podman version failure
        mock_which.side_effect = lambda cmd: "/usr/bin/podman" if cmd == "podman" else None
        mock_run.side_effect = [
            (1, "", "version command failed"),
            (1, "", "info command failed"),
        ]
        mock_svc.return_value = {"active": False, "state": "inactive", "enabled": False}

        res_podman = detect_engines()
        self.assertTrue(res_podman["podman"]["installed"])
        self.assertEqual(res_podman["podman"]["version"], "")
        self.assertEqual(res_podman["active_engine"], "podman")

    def test_normalize_image_ref_edge_cases(self):
        from engine_adapter import normalize_image_ref

        # Empty or <none>
        self.assertEqual(normalize_image_ref(""), set())
        self.assertEqual(normalize_image_ref("<none>"), set())

        # sha256 hash
        refs = normalize_image_ref("sha256:1234567890abcdef1234567890abcdef")
        self.assertIn("1234567890abcdef1234567890abcdef", refs)
        self.assertIn("1234567890ab", refs)

        # Standard hex ID
        hex_refs = normalize_image_ref("1234567890abcdef1234")
        self.assertIn("1234567890ab", hex_refs)

        # Registries and custom domains
        quay_refs = normalize_image_ref("quay.io/org/app:v2")
        self.assertIn("org/app:v2", quay_refs)

        custom_refs = normalize_image_ref("registry.internal.net:5000/myteam/service:latest")
        self.assertIn("myteam/service", custom_refs)
        self.assertIn("myteam/service:latest", custom_refs)

    def test_get_volume_size_unit(self):
        import tempfile
        import os
        from engine_adapter import get_volume_size

        # Non-existent path
        self.assertEqual(get_volume_size("/non/existent/path/123"), "")
        self.assertEqual(get_volume_size(""), "")

        # Single file
        with tempfile.NamedTemporaryFile() as tmp:
            tmp.write(b"x" * 500)
            tmp.flush()
            self.assertEqual(get_volume_size(tmp.name), "500 B")

        # Directory with files
        with tempfile.TemporaryDirectory() as tmpdir:
            # 0 B empty directory
            self.assertEqual(get_volume_size(tmpdir), "0 B")

            # 2 KB file
            fpath = os.path.join(tmpdir, "file.bin")
            with open(fpath, "wb") as f:
                f.write(b"a" * 2048)
            self.assertEqual(get_volume_size(tmpdir), "2.0 KB")

            # 2 MB file
            with open(fpath, "wb") as f:
                f.write(b"a" * (2 * 1024 * 1024))
            self.assertEqual(get_volume_size(tmpdir), "2.0 MB")

            # 1.5 GB simulated via mock
            with patch("os.walk", return_value=[(tmpdir, [], ["big.bin"])]):
                with patch("os.path.getsize", return_value=int(1.5 * 1024 * 1024 * 1024)):
                    self.assertEqual(get_volume_size(tmpdir), "1.50 GB")

            # Exception handling
            with patch("os.walk", side_effect=PermissionError("denied")):
                self.assertEqual(get_volume_size(tmpdir), "")


if __name__ == "__main__":
    unittest.main()
