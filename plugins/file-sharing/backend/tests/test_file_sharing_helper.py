import json
import os
import sys
import unittest
from unittest.mock import MagicMock, patch

import file_sharing_helper


class TestFileSharingHelper(unittest.TestCase):
    @patch("subprocess.run")
    def test_run_cmd_success(self, mock_run):
        mock_run.return_value = MagicMock(returncode=0, stdout="hello\n", stderr="")
        rc, out, err = file_sharing_helper.run_cmd(["echo", "hello"])
        self.assertEqual(rc, 0)
        self.assertEqual(out, "hello")
        self.assertEqual(err, "")

    @patch("subprocess.run", side_effect=Exception("Execution failed"))
    def test_run_cmd_exception(self, mock_run):
        rc, out, err = file_sharing_helper.run_cmd(["bad_cmd"])
        self.assertEqual(rc, -1)
        self.assertIn("Execution failed", err)

    @patch("file_sharing_helper.run_cmd")
    @patch("shutil.which", return_value="/bin/systemctl")
    def test_get_service_status_active(self, mock_which, mock_cmd):
        mock_cmd.side_effect = [
            (0, "active", ""),
            (0, "enabled", ""),
        ]
        status = file_sharing_helper.get_service_status("smbd")
        self.assertTrue(status["active"])
        self.assertTrue(status["enabled"])
        self.assertEqual(status["state"], "active")

    @patch("file_sharing_helper.run_cmd")
    @patch("shutil.which", return_value="/bin/systemctl")
    def test_get_service_status_inactive(self, mock_which, mock_cmd):
        mock_cmd.side_effect = [
            (3, "inactive", ""),
            (1, "disabled", ""),
        ]
        status = file_sharing_helper.get_service_status("smbd")
        self.assertFalse(status["active"])
        self.assertFalse(status["enabled"])
        self.assertEqual(status["state"], "inactive")

    @patch("file_sharing_helper.get_service_status")
    @patch("os.path.exists", return_value=True)
    def test_get_all_services_status(self, mock_exists, mock_svc):
        mock_svc.return_value = {"active": True}
        res = file_sharing_helper.get_all_services_status()
        self.assertIn("smbd", res)
        self.assertIn("nfs", res)

    @patch("shutil.which", return_value=None)
    def test_get_smb_users_not_installed(self, mock_which):
        self.assertEqual(file_sharing_helper.get_smb_users(), [])

    @patch("file_sharing_helper.run_cmd")
    @patch("shutil.which", return_value="/usr/bin/pdbedit")
    def test_get_smb_users_parsed(self, mock_which, mock_cmd):
        pdbedit_output = """---------------
Unix username:        alice
Full Name:            Alice Wonderland
User SID:             S-1-5-21-12345
Account Flags:        [U          ]
---------------
Unix username:        bob
Full Name:            Bob Marley
User SID:             S-1-5-21-67890
Account Flags:        [UD         ]
"""
        mock_cmd.return_value = (0, pdbedit_output, "")
        users = file_sharing_helper.get_smb_users()
        self.assertEqual(len(users), 2)
        self.assertEqual(users[0]["username"], "alice")
        self.assertTrue(users[0]["is_enabled"])
        self.assertEqual(users[1]["username"], "bob")
        self.assertFalse(users[1]["is_enabled"])

    @patch("pwd.getpwall")
    def test_get_system_unix_users(self, mock_pwall):
        mock_pwall.return_value = [
            MagicMock(pw_name="root", pw_uid=0, pw_shell="/bin/bash"),
            MagicMock(pw_name="nobody", pw_uid=65534, pw_shell="/usr/sbin/nologin"),
            MagicMock(pw_name="alice", pw_uid=1000, pw_shell="/bin/bash"),
            MagicMock(pw_name="bob", pw_uid=1001, pw_shell="/bin/zsh"),
        ]
        users = file_sharing_helper.get_system_unix_users()
        self.assertEqual(users, ["alice", "bob"])

    @patch("shutil.which", return_value="/usr/bin/smbstatus")
    @patch("file_sharing_helper.run_cmd")
    def test_get_smb_sessions(self, mock_cmd, mock_which):
        smbstatus_output = """PID     Username     Group        Machine               Protocol Version
------------------------------------------------------------------------------
12345   alice        users        192.168.1.50          SMB3_11
67890   bob          users        192.168.1.60          SMB3_02
"""
        mock_cmd.return_value = (0, smbstatus_output, "")
        sessions = file_sharing_helper.get_smb_sessions()
        self.assertEqual(len(sessions), 2)
        self.assertEqual(sessions[0]["pid"], "12345")
        self.assertEqual(sessions[0]["username"], "alice")
        self.assertEqual(sessions[0]["machine"], "192.168.1.50")

    @patch("shutil.which", return_value="/sbin/zfs")
    @patch("file_sharing_helper.run_cmd")
    def test_get_zfs_mountpoints(self, mock_cmd, mock_which):
        mock_cmd.return_value = (0, "tank/data\t/tank/data\tfilesystem\ntank/vol\t-\tvolume", "")
        mounts = file_sharing_helper.get_zfs_mountpoints()
        self.assertEqual(len(mounts), 1)
        self.assertEqual(mounts[0]["dataset"], "tank/data")
        self.assertEqual(mounts[0]["mountpoint"], "/tank/data")

    @patch("shutil.which", return_value="/usr/bin/testparm")
    @patch("file_sharing_helper.run_cmd")
    def test_testparm_verify(self, mock_cmd, mock_which):
        mock_cmd.return_value = (0, "Loaded services file OK.", "")
        ok, msg = file_sharing_helper.testparm_verify()
        self.assertTrue(ok)

        mock_cmd.return_value = (1, "", "Syntax error on line 42")
        ok, msg = file_sharing_helper.testparm_verify()
        self.assertFalse(ok)
        self.assertIn("Syntax error", msg)

    @patch("shutil.which", return_value="/usr/sbin/exportfs")
    @patch("file_sharing_helper.run_cmd")
    def test_reload_nfs(self, mock_cmd, mock_which):
        mock_cmd.return_value = (0, "", "")
        ok, msg = file_sharing_helper.reload_nfs()
        self.assertTrue(ok)

        mock_cmd.return_value = (1, "", "exportfs: Failed")
        ok, msg = file_sharing_helper.reload_nfs()
        self.assertFalse(ok)

    @patch("file_sharing_helper.run_cmd")
    def test_get_system_versions(self, mock_cmd):
        mock_cmd.side_effect = [
            (0, "Version 4.19.5-Ubuntu", ""),
            (0, "Version 2.6.4", ""),
        ]
        versions = file_sharing_helper.get_system_versions()
        self.assertEqual(versions["smb"], "4.19.5-Ubuntu")
        self.assertEqual(versions["nfs"], "2.6.4")

    @patch("file_sharing_helper.SmbParser")
    @patch("file_sharing_helper.NfsParser")
    @patch("file_sharing_helper.get_smb_users", return_value=[])
    @patch("file_sharing_helper.get_system_unix_users", return_value=[])
    @patch("file_sharing_helper.get_all_services_status", return_value={})
    @patch("file_sharing_helper.get_smb_sessions", return_value=[])
    @patch("file_sharing_helper.get_zfs_mountpoints", return_value=[])
    @patch("file_sharing_helper.get_system_versions", return_value={"smb": "4.19", "nfs": "2.6"})
    def test_handle_get_overview(self, *mocks):
        args = MagicMock(ansible_begin=None, ansible_end=None)
        res = file_sharing_helper.handle_get_overview(args)
        self.assertEqual(res["status"], "success")
        self.assertIn("services", res)
        self.assertIn("smb", res)
        self.assertIn("nfs", res)
        self.assertIn("users", res)

    @patch("sys.argv", ["file_sharing_helper.py", "get_overview"])
    @patch("file_sharing_helper.handle_get_overview", return_value={"status": "success"})
    def test_main_get_overview(self, mock_overview):
        with patch("builtins.print") as mock_print:
            file_sharing_helper.main()
            mock_print.assert_called_once()
            res = json.loads(mock_print.call_args[0][0])
            self.assertEqual(res["status"], "success")

    @patch("sys.argv", ["file_sharing_helper.py", "save_smb_share", "--data", json.dumps({"name": "data", "path": "/srv/data"})])
    @patch("file_sharing_helper.SmbParser.save_share", return_value=(True, "Saved"))
    @patch("file_sharing_helper.testparm_verify", return_value=(True, "OK"))
    @patch("file_sharing_helper.reload_smb")
    def test_main_save_smb_share(self, mock_reload, mock_testparm, mock_save):
        with patch("builtins.print") as mock_print:
            file_sharing_helper.main()
            mock_print.assert_called_once()
            res = json.loads(mock_print.call_args[0][0])
            self.assertEqual(res["status"], "success")

    @patch("sys.argv", ["file_sharing_helper.py", "delete_smb_share", "--name", "data"])
    @patch("file_sharing_helper.SmbParser.delete_share", return_value=(True, "Deleted"))
    @patch("file_sharing_helper.reload_smb")
    def test_main_delete_smb_share(self, mock_reload, mock_del):
        with patch("builtins.print") as mock_print:
            file_sharing_helper.main()
            mock_print.assert_called_once()
            res = json.loads(mock_print.call_args[0][0])
            self.assertEqual(res["status"], "success")

    @patch("sys.argv", ["file_sharing_helper.py", "save_nfs_export", "--data", json.dumps({"path": "/srv/nfs", "clients": []})])
    @patch("file_sharing_helper.NfsParser.save_export", return_value=(True, "Export saved"))
    @patch("file_sharing_helper.reload_nfs", return_value=(True, "Reloaded"))
    def test_main_save_nfs_export(self, mock_reload, mock_save):
        with patch("builtins.print") as mock_print:
            file_sharing_helper.main()
            mock_print.assert_called_once()
            res = json.loads(mock_print.call_args[0][0])
            self.assertEqual(res["status"], "success")

    @patch("sys.argv", ["file_sharing_helper.py", "create_smb_user", "--username", "testuser", "--password", "secret"])
    @patch("file_sharing_helper.run_cmd", return_value=(0, "", ""))
    def test_main_create_smb_user(self, mock_cmd):
        with patch("builtins.print") as mock_print:
            file_sharing_helper.main()
            mock_print.assert_called_once()
            res = json.loads(mock_print.call_args[0][0])
            self.assertEqual(res["status"], "success")

    @patch("sys.argv", ["file_sharing_helper.py", "set_smb_user_state", "--username", "testuser", "--enable"])
    @patch("file_sharing_helper.run_cmd", return_value=(0, "", ""))
    def test_main_set_smb_user_state(self, mock_cmd):
        with patch("builtins.print") as mock_print:
            file_sharing_helper.main()
            mock_print.assert_called_once()
            res = json.loads(mock_print.call_args[0][0])
            self.assertEqual(res["status"], "success")

    @patch("sys.argv", ["file_sharing_helper.py", "delete_smb_user", "--username", "testuser"])
    @patch("file_sharing_helper.run_cmd", return_value=(0, "", ""))
    def test_main_delete_smb_user(self, mock_cmd):
        with patch("builtins.print") as mock_print:
            file_sharing_helper.main()
            mock_print.assert_called_once()
            res = json.loads(mock_print.call_args[0][0])
            self.assertEqual(res["status"], "success")

    @patch("sys.argv", ["file_sharing_helper.py", "service_action", "--service", "smbd", "--verb", "restart"])
    @patch("file_sharing_helper.run_cmd", return_value=(0, "", ""))
    def test_main_service_action(self, mock_cmd):
        with patch("builtins.print") as mock_print:
            file_sharing_helper.main()
            mock_print.assert_called_once()
            res = json.loads(mock_print.call_args[0][0])
            self.assertEqual(res["status"], "success")


if __name__ == "__main__":
    unittest.main()
