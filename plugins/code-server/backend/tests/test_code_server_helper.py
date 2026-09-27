import json
import pytest
from unittest.mock import patch, MagicMock
from backend.code_server_helper import handle_command


def test_handle_status_command():
    with patch("backend.code_server_helper.get_binary_info", return_value={"installed": True, "version": "4.96.4", "path": "/usr/bin/code-server"}), \
         patch("backend.code_server_helper.get_service_status", return_value={"active": True, "state": "active", "enabled": True, "pid": 1234, "unit": "code-server@test-user.service"}), \
         patch("backend.code_server_helper.parse_code_server_config") as mock_cfg:
        
        mock_obj = MagicMock()
        mock_obj.to_dict.return_value = {
            "bind_addr": "127.0.0.1:8080",
            "host": "127.0.0.1",
            "port": 8080,
            "auth": "password",
            "password": "secret",
            "cert": False,
        }
        mock_cfg.return_value = mock_obj

        res = handle_command(["status", "--user", "test-user"])
        assert res["status"] == "ok"
        assert res["binary"]["installed"] is True
        assert res["service"]["active"] is True
        assert res["config"]["port"] == 8080


def test_handle_service_action_command():
    with patch("backend.code_server_helper.manage_service", return_value={"success": True}):
        res = handle_command(["service", "restart", "--user", "test-user"])
        assert res["status"] == "ok"


def test_handle_save_config_command():
    with patch("backend.code_server_helper.write_code_server_config", return_value=True):
        payload = json.dumps({
            "bind_addr": "0.0.0.0:8080",
            "auth": "password",
            "password": "new-pass",
            "cert": False,
        })
        res = handle_command(["save_config", "--user", "test-user", "--data", payload])
        assert res["status"] == "ok"


def test_handle_unknown_command():
    res = handle_command(["unknown_cmd"])
    assert res["status"] == "error"
