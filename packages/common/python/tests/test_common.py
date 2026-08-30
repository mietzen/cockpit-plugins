import subprocess
import unittest
from unittest.mock import patch, MagicMock

from cockpit_common.runner import run_cmd
from cockpit_common.services import get_service_status, is_service_active


class TestCockpitCommon(unittest.TestCase):

    @patch("subprocess.run")
    def test_run_cmd_success(self, mock_run):
        mock_run.return_value = MagicMock(returncode=0, stdout="success\n", stderr="")
        rc, out, err = run_cmd(["echo", "hello"])
        self.assertEqual(rc, 0)
        self.assertEqual(out, "success")
        self.assertEqual(err, "")

    @patch("subprocess.run", side_effect=subprocess.TimeoutExpired(cmd=["sleep"], timeout=5))
    def test_run_cmd_timeout(self, mock_run):
        rc, out, err = run_cmd(["sleep", "10"], timeout=5)
        self.assertEqual(rc, -1)
        self.assertIn("timed out", err)

    @patch("subprocess.run", side_effect=Exception("Generic failure"))
    def test_run_cmd_error(self, mock_run):
        rc, out, err = run_cmd(["bad"])
        self.assertEqual(rc, -1)
        self.assertIn("Generic failure", err)

    @patch("cockpit_common.services.run_cmd")
    @patch("shutil.which", return_value="/bin/systemctl")
    def test_get_service_status(self, mock_which, mock_cmd):
        mock_cmd.side_effect = [
            (0, "active", ""),
            (0, "enabled", ""),
        ]
        res = get_service_status("smbd")
        self.assertTrue(res["active"])
        self.assertTrue(res["enabled"])

    @patch("cockpit_common.services.run_cmd")
    def test_is_service_active(self, mock_cmd):
        mock_cmd.return_value = (0, "active", "")
        self.assertTrue(is_service_active("smbd"))

        mock_cmd.return_value = (3, "inactive", "")
        self.assertFalse(is_service_active("smbd"))


if __name__ == "__main__":
    unittest.main()
