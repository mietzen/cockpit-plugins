import os
import subprocess
import pytest
from unittest.mock import patch, MagicMock
from backend.service_manager import (
    get_binary_info,
    get_service_status,
    manage_service,
    resolve_username,
    get_service_unit_name,
    ensure_user_dir_permissions,
    install_code_server,
    CODE_SERVER_UPSTREAM_VERSION,
)


def test_get_binary_info_not_installed():
    with patch("shutil.which", return_value=None), \
         patch("os.path.isfile", return_value=False):
        info = get_binary_info()
        assert info["installed"] is False
        assert info["version"] is None
        assert info["path"] is None


def test_get_binary_info_candidate_fallback():
    with patch("shutil.which", return_value=None), \
         patch("os.path.isfile", side_effect=lambda p: p == "/usr/bin/code-server"), \
         patch("os.access", return_value=True):
        mock_proc = MagicMock()
        mock_proc.returncode = 0
        mock_proc.stdout = "4.139.1\n"
        with patch("subprocess.run", return_value=mock_proc):
            info = get_binary_info()
            assert info["installed"] is True
            assert info["path"] == "/usr/bin/code-server"
            assert info["version"] == "4.139.1"


def test_get_binary_info_version_failure():
    with patch("shutil.which", return_value="/usr/bin/code-server"), \
         patch("subprocess.run", side_effect=Exception("timeout")):
        info = get_binary_info()
        assert info["installed"] is True
        assert info["version"] == "Unknown"


def test_resolve_username_and_unit_name():
    assert resolve_username("alice") == "alice"
    assert get_service_unit_name("alice") == "code-server@alice.service"
    unit = get_service_unit_name("root")
    assert unit.startswith("code-server@") and unit.endswith(".service")


def test_get_service_status_success():
    mock_proc = MagicMock()
    mock_proc.returncode = 0
    mock_proc.stdout = "ActiveState=active\nUnitFileState=enabled\nMainPID=1234\nExecMainStartTimestamp=Sun 2026-09-27 10:00:00 UTC\n"
    with patch("subprocess.run", return_value=mock_proc):
        status = get_service_status("test-user")
        assert status["active"] is True
        assert status["state"] == "active"
        assert status["enabled"] is True
        assert status["pid"] == 1234
        assert status["started_at"] is not None


def test_get_service_status_error_handling():
    with patch("subprocess.run", side_effect=Exception("systemctl failure")):
        status = get_service_status("test-user")
        assert status["active"] is False
        assert status["state"] == "inactive"


def test_manage_service_valid_action():
    mock_proc = MagicMock()
    mock_proc.returncode = 0
    mock_proc.stdout = ""
    mock_proc.stderr = ""
    with patch("subprocess.run", return_value=mock_proc):
        res = manage_service("restart", "test-user")
        assert res["success"] is True


def test_manage_service_failure():
    mock_proc = MagicMock()
    mock_proc.returncode = 1
    mock_proc.stderr = "Unit not found."
    with patch("subprocess.run", return_value=mock_proc):
        res = manage_service("start", "test-user")
        assert res["success"] is False
        assert "Unit not found" in res["error"]


def test_manage_service_invalid_action():
    res = manage_service("invalid_action", "test-user")
    assert res["success"] is False
    assert "Invalid action" in res["error"]


def test_ensure_user_dir_permissions():
    ensure_user_dir_permissions("root")
    ensure_user_dir_permissions("nonexistent_user_xyz")


def test_ensure_user_dir_permissions_success():
    import pwd
    import tempfile
    with tempfile.TemporaryDirectory() as tmpdir:
        fake_home = os.path.join(tmpdir, "home", "testuser")
        cfg_dir = os.path.join(fake_home, ".config", "code-server")
        data_dir = os.path.join(fake_home, ".local", "share", "code-server", "extensions")
        os.makedirs(cfg_dir, exist_ok=True)
        os.makedirs(data_dir, exist_ok=True)
        with open(os.path.join(cfg_dir, "config.yaml"), "w") as f:
            f.write("bind-addr: 127.0.0.1:8080\n")
        with open(os.path.join(data_dir, "ext.json"), "w") as f:
            f.write("{}\n")

        fake_pw = pwd.struct_passwd(("testuser", "x", 1000, 1000, "Test User", fake_home, "/bin/bash"))
        with patch("pwd.getpwnam", return_value=fake_pw), \
             patch("os.chown") as mock_chown, \
             patch("os.chmod") as mock_chmod:
            ensure_user_dir_permissions("testuser")
            assert mock_chown.called
            assert mock_chmod.called

            with open(os.path.join(cfg_dir, "config.yaml"), "r") as f:
                content = f.read()
                assert "auth: password" in content
                assert "password:" in content
                assert "socket: /run/code-server/1000.sock" in content


def test_ensure_user_dir_new_cfg():
    import pwd
    import tempfile
    with tempfile.TemporaryDirectory() as tmpdir:
        fake_home = os.path.join(tmpdir, "home", "testuser")
        fake_pw = pwd.struct_passwd(("testuser", "x", 1000, 1000, "Test User", fake_home, "/bin/bash"))
        with patch("pwd.getpwnam", return_value=fake_pw), \
             patch("os.chown"), patch("os.chmod"):
            ensure_user_dir_permissions("testuser")
            cfg_file = os.path.join(fake_home, ".config", "code-server", "config.yaml")
            assert os.path.isfile(cfg_file)
            with open(cfg_file, "r") as f:
                content = f.read()
                assert "auth: password" in content
                assert "password:" in content


def test_ensure_user_dir_migrate():
    import pwd
    import tempfile
    with tempfile.TemporaryDirectory() as tmpdir:
        fake_home = os.path.join(tmpdir, "home", "testuser")
        cfg_dir = os.path.join(fake_home, ".config", "code-server")
        os.makedirs(cfg_dir, exist_ok=True)
        cfg_file = os.path.join(cfg_dir, "config.yaml")
        with open(cfg_file, "w") as f:
            f.write("socket: /run/code-server/1000.sock\nauth: none\n")

        fake_pw = pwd.struct_passwd(("testuser", "x", 1000, 1000, "Test User", fake_home, "/bin/bash"))
        with patch("pwd.getpwnam", return_value=fake_pw), \
             patch("os.chown"), patch("os.chmod"):
            ensure_user_dir_permissions("testuser")
            with open(cfg_file, "r") as f:
                content = f.read()
                assert "auth: password" in content
                assert "password:" in content


def test_ensure_user_dir_keep_pass():
    import pwd
    import tempfile
    with tempfile.TemporaryDirectory() as tmpdir:
        fake_home = os.path.join(tmpdir, "home", "testuser")
        cfg_dir = os.path.join(fake_home, ".config", "code-server")
        os.makedirs(cfg_dir, exist_ok=True)
        cfg_file = os.path.join(cfg_dir, "config.yaml")
        with open(cfg_file, "w") as f:
            f.write("socket: /run/code-server/1000.sock\nauth: password\npassword: keep-this-secret\n")

        fake_pw = pwd.struct_passwd(("testuser", "x", 1000, 1000, "Test User", fake_home, "/bin/bash"))
        with patch("pwd.getpwnam", return_value=fake_pw), \
             patch("os.chown"), patch("os.chmod"):
            ensure_user_dir_permissions("testuser")
            with open(cfg_file, "r") as f:
                content = f.read()
                assert "password: keep-this-secret" in content


def test_install_code_server_deb_success():
    with patch("shutil.which", side_effect=lambda x: "/usr/bin/apt-get" if x == "apt-get" else None), \
         patch("subprocess.run") as mock_run:
        mock_proc = MagicMock()
        mock_proc.returncode = 0
        mock_run.return_value = mock_proc

        res = install_code_server(CODE_SERVER_UPSTREAM_VERSION, "test-user")
        assert res["success"] is True
        assert CODE_SERVER_UPSTREAM_VERSION in res["output"]


def test_install_code_server_rpm_success():
    with patch("shutil.which", side_effect=lambda x: "/usr/bin/dnf" if x == "dnf" else None), \
         patch("subprocess.run") as mock_run:
        mock_proc = MagicMock()
        mock_proc.returncode = 0
        mock_run.return_value = mock_proc

        res = install_code_server(CODE_SERVER_UPSTREAM_VERSION, "test-user")
        assert res["success"] is True
        assert CODE_SERVER_UPSTREAM_VERSION in res["output"]


def test_install_code_server_no_pkg_manager():
    with patch("shutil.which", return_value=None):
        res = install_code_server(CODE_SERVER_UPSTREAM_VERSION, "test-user")
        assert res["success"] is False
        assert "No supported package manager" in res["error"]


def test_install_code_server_failure():
    with patch("shutil.which", side_effect=lambda x: "/usr/bin/apt-get" if x == "apt-get" else None), \
         patch("subprocess.run") as mock_run:
        mock_proc = MagicMock()
        mock_proc.returncode = 100
        mock_proc.stderr = "apt-get error"
        mock_run.return_value = mock_proc

        res = install_code_server(CODE_SERVER_UPSTREAM_VERSION, "test-user")
        assert res["success"] is False
        assert "apt-get error" in res["error"]
