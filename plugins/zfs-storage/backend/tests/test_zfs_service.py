import json
import os
import sys
import unittest
from unittest.mock import patch, MagicMock, mock_open

from backend.zfs_helper import ZfsService, main, validate_name


class TestZfsServiceActions(unittest.TestCase):

    def setUp(self):
        self.svc = ZfsService()

    def test_validate_name(self):
        self.assertEqual(validate_name("tank/data"), "tank/data")
        self.assertEqual(validate_name("pool@snap-1"), "pool@snap-1")
        with self.assertRaises(ValueError):
            validate_name("tank; rm -rf /")

    @patch("backend.zfs_helper.run_cmd")
    def test_pool_create_action(self, mock_run):
        mock_run.return_value = MagicMock(returncode=0, stdout="", stderr="")
        payload = {
            "name": "tank",
            "vdevs": [{"type": "mirror", "devices": ["/dev/sdb", "/dev/sdc"]}],
            "ashift": 12,
            "compression": "lz4",
            "force": True,
        }
        res = self.svc.pool_create(payload)
        self.assertTrue(res["success"])
        mock_run.assert_called_once_with(
            ["zpool", "create", "-f", "-o", "ashift=12", "-O", "compression=lz4", "tank", "mirror", "/dev/sdb", "/dev/sdc"]
        )

    @patch("backend.zfs_helper.run_cmd")
    def test_dataset_create_action(self, mock_run):
        mock_run.return_value = MagicMock(returncode=0, stdout="", stderr="")
        payload = {
            "path": "tank/data",
            "type": "filesystem",
            "properties": {"compression": "zstd", "recordsize": "128k"},
        }
        res = self.svc.dataset_create(payload)
        self.assertTrue(res["success"])
        mock_run.assert_called_once_with(
            ["zfs", "create", "-o", "compression=zstd", "-o", "recordsize=128k", "tank/data"]
        )

    @patch("backend.zfs_helper.run_cmd")
    def test_dataset_destroy_action(self, mock_run):
        mock_run.return_value = MagicMock(returncode=0, stdout="", stderr="")
        res = self.svc.dataset_destroy("tank/data", recursive=True)
        self.assertTrue(res["success"])
        mock_run.assert_called_once_with(["zfs", "destroy", "-r", "-f", "tank/data"])

    @patch("backend.zfs_helper.run_cmd")
    def test_dataset_rename_action(self, mock_run):
        mock_run.return_value = MagicMock(returncode=0, stdout="", stderr="")
        res = self.svc.dataset_rename("tank/data", "tank/newdata")
        self.assertTrue(res["success"])
        mock_run.assert_called_once_with(["zfs", "rename", "tank/data", "tank/newdata"])

    @patch("backend.zfs_helper.run_cmd")
    def test_dataset_mount_unmount(self, mock_run):
        mock_run.return_value = MagicMock(returncode=0, stdout="", stderr="")
        res = self.svc.dataset_mount("tank/data")
        self.assertTrue(res["success"])
        res = self.svc.dataset_unmount("tank/data", force=True)
        self.assertTrue(res["success"])

    @patch("backend.zfs_helper.run_cmd")
    def test_dataset_inherit_property(self, mock_run):
        mock_run.return_value = MagicMock(returncode=0, stdout="", stderr="")
        res = self.svc.dataset_inherit_property("tank/data", "compression")
        self.assertTrue(res["success"])
        mock_run.assert_called_once_with(["zfs", "inherit", "compression", "tank/data"])

    @patch("backend.zfs_helper.run_cmd")
    def test_pool_scrub_action(self, mock_run):
        mock_run.return_value = MagicMock(returncode=0, stdout="", stderr="")
        res = self.svc.pool_scrub("tank", action="start")
        self.assertTrue(res["success"])
        mock_run.assert_called_once_with(["zpool", "scrub", "tank"])

    @patch("backend.zfs_helper.run_cmd")
    def test_pool_trim_action(self, mock_run):
        mock_run.return_value = MagicMock(returncode=0, stdout="", stderr="")
        res = self.svc.pool_trim("tank", action="start")
        self.assertTrue(res["success"])
        mock_run.assert_called_once_with(["zpool", "trim", "tank"])

    @patch("backend.zfs_helper.run_cmd")
    def test_pool_clear_action(self, mock_run):
        mock_run.return_value = MagicMock(returncode=0, stdout="", stderr="")
        res = self.svc.pool_clear("tank")
        self.assertTrue(res["success"])
        mock_run.assert_called_once_with(["zpool", "clear", "tank"])

    @patch("backend.zfs_helper.run_cmd")
    def test_pool_export_action(self, mock_run):
        mock_run.return_value = MagicMock(returncode=0, stdout="", stderr="")
        res = self.svc.pool_export("tank", force=True)
        self.assertTrue(res["success"])
        mock_run.assert_called_once_with(["zpool", "export", "-f", "tank"])

    @patch("backend.zfs_helper.run_cmd")
    def test_pool_destroy_action(self, mock_run):
        mock_run.return_value = MagicMock(returncode=0, stdout="", stderr="")
        res = self.svc.pool_destroy("tank", force=True)
        self.assertTrue(res["success"])
        mock_run.assert_called_once_with(["zpool", "destroy", "-f", "tank"])

    @patch("backend.zfs_helper.run_cmd")
    def test_snapshot_destroy_action(self, mock_run):
        mock_run.return_value = MagicMock(returncode=0, stdout="", stderr="")
        res = self.svc.snapshot_destroy("Test-Pool/Test-Dataset@snap-2026-08-29T14-16-19", recursive=False)
        self.assertTrue(res["success"])
        mock_run.assert_called_once_with(["zfs", "destroy", "Test-Pool/Test-Dataset@snap-2026-08-29T14-16-19"])

    @patch("backend.zfs_helper.run_cmd")
    def test_snapshot_rollback_action(self, mock_run):
        mock_run.return_value = MagicMock(returncode=0, stdout="", stderr="")
        res = self.svc.snapshot_rollback("Test-Pool/Test-Dataset@snap-2026-08-29T14-16-19", destroy_intermediate=True)
        self.assertTrue(res["success"])
        mock_run.assert_called_once_with(["zfs", "rollback", "-r", "Test-Pool/Test-Dataset@snap-2026-08-29T14-16-19"])

    @patch("backend.zfs_helper.run_cmd")
    def test_snapshot_clone_action(self, mock_run):
        mock_run.return_value = MagicMock(returncode=0, stdout="", stderr="")
        payload = {
            "snapshot": "Test-Pool/Test-Dataset@snap-2026-08-29T14-16-19",
            "clone_path": "Test-Pool/Clone",
        }
        res = self.svc.snapshot_clone(payload)
        self.assertTrue(res["success"])
        mock_run.assert_called_once_with(["zfs", "clone", "Test-Pool/Test-Dataset@snap-2026-08-29T14-16-19", "Test-Pool/Clone"])

    @patch("backend.zfs_helper.run_cmd")
    def test_dataset_set_property(self, mock_run):
        mock_run.return_value = MagicMock(returncode=0, stdout="", stderr="")
        res = self.svc.dataset_set_property("tank/data", "compression", "zstd")
        self.assertTrue(res["success"])
        mock_run.assert_called_once_with(["zfs", "set", "compression=zstd", "tank/data"])

    @patch("backend.zfs_helper.run_cmd")
    def test_disk_actions(self, mock_run):
        mock_run.return_value = MagicMock(returncode=0, stdout="", stderr="")
        res = self.svc.disk_action("offline", "tank", "/dev/sdb")
        self.assertTrue(res["success"])
        mock_run.assert_called_once_with(["zpool", "offline", "tank", "/dev/sdb"])

        mock_run.reset_mock()
        res = self.svc.disk_action("attach", "tank", "/dev/sdb", "/dev/sdc")
        self.assertTrue(res["success"])
        mock_run.assert_called_once_with(["zpool", "attach", "tank", "/dev/sdb", "/dev/sdc"])

    @patch("backend.zfs_helper.run_cmd")
    @patch("os.path.exists", return_value=True)
    def test_get_system_info(self, mock_exists, mock_run):
        mock_run.return_value = MagicMock(returncode=0, stdout="zfs-2.2.4\n", stderr="")
        with patch("builtins.open", mock_open(read_data="hits 4 1000\nmisses 4 200\n")):
            info = self.svc.get_system_info()
            self.assertTrue(info["kernel_module_loaded"])
            self.assertEqual(info["version"], "zfs-2.2.4")

    @patch("backend.zfs_helper.run_cmd")
    def test_get_pools(self, mock_run):
        pool_line = "tank\t100000000000\t10000000000\t90000000000\t0\t10\t1.00\tONLINE\t-\t123456789\n"
        mock_run.side_effect = [
            MagicMock(returncode=0, stdout=pool_line, stderr=""),
            MagicMock(returncode=0, stdout="pool: tank\nstate: ONLINE\nconfig:\n\ttank ONLINE 0 0 0\n\t  sdb ONLINE 0 0 0\n", stderr=""),
        ]
        pools = self.svc.get_pools()
        self.assertEqual(len(pools), 1)
        self.assertEqual(pools[0]["name"], "tank")

    @patch("backend.zfs_helper.run_cmd")
    def test_get_datasets(self, mock_run):
        ds_line = "tank/data\tfilesystem\t1000\t9000\t1000\t/tank/data\tyes\tlz4\t1.00\toff\toff\tnone\ton\tstandard\t0\t0\t131072\t-\t-\t-\n"
        mock_run.return_value = MagicMock(returncode=0, stdout=ds_line, stderr="")
        datasets = self.svc.get_datasets()
        self.assertEqual(len(datasets), 1)
        self.assertEqual(datasets[0]["name"], "tank/data")

    @patch("backend.zfs_helper.ZfsService.get_pools", return_value=[])
    @patch("backend.zfs_helper.run_cmd")
    def test_get_disks(self, mock_run, mock_pools):
        lsblk_json = json.dumps({
            "blockdevices": [
                {"name": "sda", "kname": "sda", "path": "/dev/sda", "size": 107374182400, "rota": False, "type": "disk", "model": "Samsung SSD"}
            ]
        })
        mock_run.return_value = MagicMock(returncode=0, stdout=lsblk_json, stderr="")
        disks = self.svc.get_disks()
        self.assertEqual(len(disks), 1)
        self.assertEqual(disks[0]["name"], "sda")

    @patch("sys.argv", ["zfs_helper.py", "system-info"])
    @patch("backend.zfs_helper.ZfsService.get_system_info", return_value={"kernel_module_loaded": True})
    def test_main_cli_system_info(self, mock_info):
        with patch("builtins.print") as mock_print:
            main()
            mock_print.assert_called_once()
            res = json.loads(mock_print.call_args[0][0])
            self.assertTrue(res["kernel_module_loaded"])

    @patch("sys.argv", ["zfs_helper.py", "pools-list"])
    @patch("backend.zfs_helper.ZfsService.get_pools", return_value=[{"name": "tank"}])
    def test_main_cli_pools_list(self, mock_pools):
        with patch("builtins.print") as mock_print:
            main()
            mock_print.assert_called_once()
            res = json.loads(mock_print.call_args[0][0])
            self.assertEqual(len(res), 1)

    @patch("sys.argv", ["zfs_helper.py", "datasets-list"])
    @patch("backend.zfs_helper.ZfsService.get_datasets", return_value=[{"name": "tank/data"}])
    def test_main_cli_datasets_list(self, mock_ds):
        with patch("builtins.print") as mock_print:
            main()
            mock_print.assert_called_once()
            res = json.loads(mock_print.call_args[0][0])
            self.assertEqual(len(res), 1)

    @patch("sys.argv", ["zfs_helper.py", "disks-list"])
    @patch("backend.zfs_helper.ZfsService.get_disks", return_value=[{"name": "sda"}])
    def test_main_cli_disks_list(self, mock_disks):
        with patch("builtins.print") as mock_print:
            main()
            mock_print.assert_called_once()
            res = json.loads(mock_print.call_args[0][0])
            self.assertEqual(len(res), 1)

    @patch("sys.argv", ["zfs_helper.py", "probe-sharing-services"])
    @patch("subprocess.run")
    def test_main_probe_sharing(self, mock_sub):
        mock_sub.return_value = MagicMock(returncode=0)
        with patch("builtins.print") as mock_print:
            main()
            mock_print.assert_called_once()
            res = json.loads(mock_print.call_args[0][0])
            self.assertTrue(res["smb"])


if __name__ == "__main__":
    unittest.main()
