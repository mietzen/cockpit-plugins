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
            (0, "podman version 5.2.0", ""),
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
        self.assertEqual(res["active_engine"], "docker")

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
            (0, '{"ID":"img1","Repository":"nginx","Tag":"latest","Size":"140MB","CreatedAt":"2026-08-15"}\n{"ID":"img2","Repository":"redis","Tag":"alpine","Size":"30MB","CreatedAt":"2026-08-10"}\n', ""),
            (0, '{"ID":"c1","Names":"web","Image":"nginx:latest"}\n', ""),
        ]

        adapter = DockerAdapter()
        images = adapter.list_images()
        self.assertEqual(len(images), 2)
        self.assertEqual(images[0]["repository"], "nginx")
        self.assertTrue(images[0]["inUse"])
        self.assertFalse(images[1]["inUse"])

    @patch("engine_adapter.run_cmd")
    def test_docker_list_volumes(self, mock_run):
        mock_output = '{"Name":"app-data","Driver":"local","Scope":"local","Mountpoint":"/var/lib/docker/volumes/app-data/_data"}\n'
        mock_run.return_value = (0, mock_output, "")

        adapter = DockerAdapter()
        volumes = adapter.list_volumes()
        self.assertEqual(len(volumes), 1)
        self.assertEqual(volumes[0]["name"], "app-data")

    @patch("engine_adapter.run_cmd")
    def test_docker_list_networks(self, mock_run):
        mock_output = (
            '{"ID":"net1","Name":"bridge","Driver":"bridge","Scope":"local"}\n'
            '{"ID":"net2","Name":"custom-net","Driver":"bridge","Scope":"local"}\n'
        )
        mock_run.return_value = (0, mock_output, "")

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
    def test_podman_list_volumes_and_networks(self, mock_run):
        mock_run.side_effect = [
            (0, json.dumps([{"Name": "vol1", "Driver": "local", "MountPoint": "/data"}]), ""),
            (0, json.dumps([{"Id": "net1", "Name": "podman", "Subnets": [{"Subnet": "10.88.0.0/16"}]}]), ""),
        ]

        adapter = PodmanAdapter()
        vols = adapter.list_volumes()
        self.assertEqual(len(vols), 1)
        self.assertEqual(vols[0]["name"], "vol1")

        nets = adapter.list_networks()
        self.assertEqual(len(nets), 1)
        self.assertEqual(nets[0]["subnet"], "10.88.0.0/16")
        self.assertTrue(nets[0]["isBuiltIn"])

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


if __name__ == "__main__":
    unittest.main()
