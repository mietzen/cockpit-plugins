import json
import pytest
from unittest.mock import patch, MagicMock
from backend.code_server_helper import handle_command, main
from backend.config_manager import CodeServerConfig


def test_handle_status_command():
    with patch("backend.code_server_helper.get_binary_info", return_value={"installed": True, "version": "4.139.1", "path": "/usr/bin/code-server"}), \
         patch("backend.code_server_helper.get_service_status", return_value={"active": True, "state": "active", "enabled": True, "pid": 1234, "unit": "code-server@test-user.service"}), \
         patch("backend.code_server_helper.parse_code_server_config") as mock_cfg:

        mock_obj = MagicMock()
        mock_obj.to_dict.return_value = {
            "bind_addr": "127.0.0.1:8080",
            "host": "127.0.0.1",
            "port": 8080,
            "auth": "password",
            "cert": False,
            "password_configured": True,
        }
        mock_cfg.return_value = mock_obj

        res = handle_command(["status", "--user", "test-user"])
        assert res["status"] == "ok"
        assert res["binary"]["installed"] is True
        assert res["service"]["active"] is True
        assert res["config"]["port"] == 8080
        assert res["password_configured"] is True
        assert "password" not in res["config"]


def test_handle_service_action_command_success_and_failure():
    with patch("backend.code_server_helper.manage_service", return_value={"success": True}):
        res = handle_command(["service", "restart", "--user", "test-user"])
        assert res["status"] == "ok"

    with patch("backend.code_server_helper.manage_service", return_value={"success": False, "error": "failed"}):
        res = handle_command(["service", "stop", "--user", "test-user"])
        assert res["status"] == "error"
        assert res["error"] == "failed"


def test_handle_save_config_command():
    with patch("backend.code_server_helper.write_code_server_config", return_value=True):
        payload = json.dumps({
            "bind_addr": "0.0.0.0:8080",
            "auth": "none",
            "cert": False,
        })
        res = handle_command(["save_config", "--user", "test-user", "--data", payload])
        assert res["status"] == "ok"

    with patch("backend.code_server_helper.write_code_server_config", return_value=False):
        res = handle_command(["save_config", "--user", "test-user", "--data", payload])
        assert res["status"] == "error"

    res = handle_command(["save_config", "--user", "test-user", "--data", "invalid-json{"])
    assert res["status"] == "error"


def test_handle_save_config_preserves_creds_and_socket():
    mock_existing = CodeServerConfig(
        socket="/run/code-server/1000.sock",
        socket_mode="600",
        auth="password",
        password="existing-secret",
    )
    with patch("backend.code_server_helper.parse_code_server_config", return_value=mock_existing), \
         patch("backend.code_server_helper.write_code_server_config") as mock_write:
        mock_write.return_value = True
        payload = json.dumps({"cert": True})
        res = handle_command(["save_config", "--user", "test-user", "--data", payload])
        assert res["status"] == "ok"
        saved_cfg = mock_write.call_args[0][1]
        assert saved_cfg.socket == "/run/code-server/1000.sock"
        assert saved_cfg.password == "existing-secret"
        assert saved_cfg.cert is True


def test_handle_install_command():
    with patch("backend.code_server_helper.install_code_server", return_value={"success": True, "output": "installed"}):
        res = handle_command(["install", "--user", "test-user"])
        assert res["status"] == "ok"

    with patch("backend.code_server_helper.install_code_server", return_value={"success": False, "error": "install failed", "output": ""}):
        res = handle_command(["install", "--user", "test-user"])
        assert res["status"] == "error"
        assert res["error"] == "install failed"


def test_handle_unknown_and_invalid_command():
    res = handle_command(["unknown_cmd"])
    assert res["status"] == "error"


def test_main_cli_execution():
    with patch("sys.argv", ["code_server_helper.py", "status"]), \
         patch("backend.code_server_helper.handle_command", return_value={"status": "ok"}):
        with pytest.raises(SystemExit) as exc:
            main()
        assert exc.value.code == 0

    with patch("sys.argv", ["code_server_helper.py"]), \
         patch("backend.code_server_helper.handle_command", return_value={"status": "error"}):
        with pytest.raises(SystemExit) as exc:
            main()
        assert exc.value.code == 1
