import pytest
from unittest.mock import patch, MagicMock
from backend.service_manager import get_binary_info, get_service_status, manage_service


def test_get_binary_info_not_installed():
    with patch("shutil.which", return_value=None):
        info = get_binary_info()
        assert info["installed"] is False
        assert info["version"] is None
        assert info["path"] is None


def test_get_binary_info_installed():
    with patch("shutil.which", return_value="/usr/bin/code-server"):
        mock_proc = MagicMock()
        mock_proc.returncode = 0
        mock_proc.stdout = "4.96.4 0c2838122c60e40880bfdeebaa06cbdbf2f11e92 with Code 1.96.2\n"
        with patch("subprocess.run", return_value=mock_proc):
            info = get_binary_info()
            assert info["installed"] is True
            assert info["path"] == "/usr/bin/code-server"
            assert "4.96.4" in info["version"]


def test_get_service_status():
    mock_proc = MagicMock()
    mock_proc.returncode = 0
    mock_proc.stdout = "ActiveState=active\nUnitFileState=enabled\nMainPID=1234\nExecMainStartTimestamp=Sun 2026-09-27 10:00:00 UTC\n"
    with patch("subprocess.run", return_value=mock_proc):
        status = get_service_status("test-user")
        assert status["active"] is True
        assert status["state"] == "active"
        assert status["enabled"] is True
        assert status["pid"] == 1234


def test_manage_service_valid_action():
    mock_proc = MagicMock()
    mock_proc.returncode = 0
    mock_proc.stdout = ""
    mock_proc.stderr = ""
    with patch("subprocess.run", return_value=mock_proc):
        res = manage_service("restart", "test-user")
        assert res["success"] is True


def test_manage_service_invalid_action():
    res = manage_service("invalid_action", "test-user")
    assert res["success"] is False
    assert "Invalid action" in res["error"]
