import unittest
from unittest.mock import patch, MagicMock
from backend.zfs_helper import ZfsService


class TestZfsServiceActions(unittest.TestCase):

    def setUp(self):
        self.svc = ZfsService()

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
    def test_pool_scrub_action(self, mock_run):
        mock_run.return_value = MagicMock(returncode=0, stdout="", stderr="")
        res = self.svc.pool_scrub("tank", action="start")
        self.assertTrue(res["success"])
        mock_run.assert_called_once_with(["zpool", "scrub", "tank"])

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

    def test_exec_proxy_does_not_exist(self):
        self.assertFalse(hasattr(self.svc, "execute_command"))


if __name__ == "__main__":
    unittest.main()
