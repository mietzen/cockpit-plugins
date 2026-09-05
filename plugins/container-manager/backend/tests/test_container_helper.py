import json
import subprocess
import sys
import unittest
from unittest.mock import MagicMock, patch

import container_helper


class TestContainerHelperCLI(unittest.TestCase):

    @patch("container_helper.detect_engines")
    def test_get_overview_none_installed(self, mock_detect):
        mock_detect.return_value = {
            "docker": {"installed": False, "active": False},
            "podman": {"installed": False, "active": False},
            "active_engine": "none",
        }

        args = MagicMock(engine="auto")
        res = container_helper.cmd_get_overview(args)
        self.assertEqual(res["status"], "success")
        self.assertEqual(res["active_engine"], "none")
        self.assertEqual(len(res["containers"]), 0)

    @patch("container_helper.get_adapter")
    @patch("container_helper.detect_engines")
    def test_get_overview_success(self, mock_detect, mock_get_adapter):
        mock_detect.return_value = {
            "docker": {"installed": True, "active": True},
            "podman": {"installed": False, "active": False},
            "active_engine": "docker",
        }
        mock_adapter = MagicMock()
        mock_adapter.list_containers.return_value = [{"id": "c1", "name": "web"}]
        mock_adapter.list_images.return_value = [{"id": "img1"}]
        mock_adapter.list_volumes.return_value = [{"name": "vol1"}]
        mock_adapter.list_networks.return_value = [{"id": "net1"}]
        mock_get_adapter.return_value = mock_adapter

        args = MagicMock(engine="docker")
        res = container_helper.cmd_get_overview(args)
        self.assertEqual(res["status"], "success")
        self.assertEqual(len(res["containers"]), 1)
        self.assertEqual(len(res["images"]), 1)
        self.assertEqual(len(res["volumes"]), 1)
        self.assertEqual(len(res["networks"]), 1)

    @patch("container_helper.get_adapter")
    def test_container_actions_and_deletes(self, mock_get_adapter):
        mock_adapter = MagicMock()
        mock_adapter.container_action.return_value = {"status": "success"}
        mock_adapter.delete_entity.return_value = {"status": "success"}
        mock_adapter.prune_entity.return_value = {"status": "success"}
        mock_adapter.system_prune.return_value = {"status": "success"}
        mock_get_adapter.return_value = mock_adapter

        # action
        res_act = container_helper.cmd_container_action(MagicMock(engine="docker", id="c1", action="start"))
        self.assertEqual(res_act["status"], "success")

        # delete
        res_del = container_helper.cmd_delete_entity(MagicMock(engine="docker", kind="container", id="c1", force=True))
        self.assertEqual(res_del["status"], "success")

        # prune entity
        res_prune = container_helper.cmd_prune(MagicMock(engine="docker", kind="image", all=True, volumes=False))
        self.assertEqual(res_prune["status"], "success")

        # system prune
        res_sys = container_helper.cmd_prune(MagicMock(engine="docker", kind="system", all=False, volumes=True))
        self.assertEqual(res_sys["status"], "success")

    @patch("container_helper.get_tls_status", return_value={"enabled": True, "port": 2376})
    def test_get_tls_status(self, mock_stat):
        res = container_helper.cmd_get_tls_status(MagicMock(engine="docker"))
        self.assertEqual(res["status"], "success")
        self.assertTrue(res["tls"]["enabled"])

    @patch("container_helper.setup_tls", return_value={"status": "success", "port": 2376})
    def test_setup_tls(self, mock_setup):
        res = container_helper.cmd_setup_tls(MagicMock(engine="docker", port=2376, sans="10.0.0.1,host.local"))
        self.assertEqual(res["status"], "success")

    @patch("container_helper.disable_tls", return_value={"status": "success"})
    def test_disable_tls(self, mock_dis):
        res = container_helper.cmd_disable_tls(MagicMock(engine="docker"))
        self.assertEqual(res["status"], "success")

    @patch("container_helper.get_client_bundle", return_value={"status": "success", "ca": "ca"})
    def test_get_client_bundle(self, mock_bundle):
        res = container_helper.cmd_get_client_bundle(MagicMock(engine="docker"))
        self.assertEqual(res["status"], "success")

    @patch("container_helper.cmd_get_overview", return_value={"status": "success"})
    def test_main_overview(self, mock_cmd):
        with patch.object(sys, "argv", ["container_helper.py", "get_overview", "--engine", "docker"]):
            with patch("builtins.print") as mock_print:
                container_helper.main()
                mock_print.assert_called_once()
                self.assertIn('"status": "success"', mock_print.call_args[0][0])

    @patch("container_helper.cmd_container_action", return_value={"status": "success"})
    def test_main_container_action(self, mock_cmd):
        with patch.object(sys, "argv", ["container_helper.py", "container_action", "--id", "c1", "--action", "start"]):
            with patch("builtins.print") as mock_print:
                container_helper.main()
                mock_print.assert_called_once()

    @patch("container_helper.cmd_delete_entity", return_value={"status": "success"})
    def test_main_delete_entity(self, mock_cmd):
        with patch.object(sys, "argv", ["container_helper.py", "delete_entity", "--kind", "container", "--id", "c1", "--force"]):
            with patch("builtins.print") as mock_print:
                container_helper.main()
                mock_print.assert_called_once()

    @patch("container_helper.cmd_prune", return_value={"status": "success"})
    def test_main_prune(self, mock_cmd):
        with patch.object(sys, "argv", ["container_helper.py", "prune", "--kind", "system", "--volumes"]):
            with patch("builtins.print") as mock_print:
                container_helper.main()
                mock_print.assert_called_once()

    @patch("container_helper.cmd_get_tls_status", return_value={"status": "success"})
    def test_main_get_tls_status(self, mock_cmd):
        with patch.object(sys, "argv", ["container_helper.py", "get_tls_status"]):
            with patch("builtins.print") as mock_print:
                container_helper.main()
                mock_print.assert_called_once()

    @patch("container_helper.cmd_setup_tls", return_value={"status": "success"})
    def test_main_setup_tls(self, mock_cmd):
        with patch.object(sys, "argv", ["container_helper.py", "setup_tls", "--sans", "1.2.3.4"]):
            with patch("builtins.print") as mock_print:
                container_helper.main()
                mock_print.assert_called_once()

    @patch("container_helper.cmd_disable_tls", return_value={"status": "success"})
    def test_main_disable_tls(self, mock_cmd):
        with patch.object(sys, "argv", ["container_helper.py", "disable_tls"]):
            with patch("builtins.print") as mock_print:
                container_helper.main()
                mock_print.assert_called_once()

    @patch("container_helper.cmd_get_client_bundle", return_value={"status": "success"})
    def test_main_get_client_bundle(self, mock_cmd):
        with patch.object(sys, "argv", ["container_helper.py", "get_client_bundle"]):
            with patch("builtins.print") as mock_print:
                container_helper.main()
                mock_print.assert_called_once()

    @patch("container_helper.cmd_get_overview", side_effect=Exception("Critical failure"))
    def test_main_exception_handling(self, mock_cmd):
        with patch.object(sys, "argv", ["container_helper.py", "get_overview"]):
            with patch("builtins.print") as mock_print:
                with self.assertRaises(SystemExit):
                    container_helper.main()
                mock_print.assert_called_once()
                self.assertIn("Critical failure", mock_print.call_args[0][0])


if __name__ == "__main__":
    unittest.main()
