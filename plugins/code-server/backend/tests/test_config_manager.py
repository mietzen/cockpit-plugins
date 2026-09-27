import os
import tempfile
import pytest
from backend.config_manager import parse_code_server_config, write_code_server_config, CodeServerConfig


def test_parse_default_config_when_file_not_found():
    cfg = parse_code_server_config("/non/existent/path/config.yaml")
    assert cfg.bind_addr == "127.0.0.1:8080"
    assert cfg.host == "127.0.0.1"
    assert cfg.port == 8080
    assert cfg.auth == "password"
    assert cfg.cert is False


def test_parse_valid_yaml_config():
    with tempfile.NamedTemporaryFile("w", delete=False, suffix=".yaml") as f:
        f.write("bind-addr: 0.0.0.0:8443\nauth: none\ncert: true\npassword: secret-pass\n")
        tmp_path = f.name

    try:
        cfg = parse_code_server_config(tmp_path)
        assert cfg.bind_addr == "0.0.0.0:8443"
        assert cfg.host == "0.0.0.0"
        assert cfg.port == 8443
        assert cfg.auth == "none"
        assert cfg.cert is True
        assert cfg.password == "secret-pass"
    finally:
        os.remove(tmp_path)


def test_write_and_update_config():
    with tempfile.TemporaryDirectory() as tmpdir:
        cfg_path = os.path.join(tmpdir, "subdir", "config.yaml")
        new_cfg = CodeServerConfig(
            bind_addr="127.0.0.1:9000",
            auth="password",
            password="my-new-password",
            cert=False,
            disable_telemetry=True,
        )

        success = write_code_server_config(cfg_path, new_cfg)
        assert success is True

        parsed = parse_code_server_config(cfg_path)
        assert parsed.bind_addr == "127.0.0.1:9000"
        assert parsed.port == 9000
        assert parsed.password == "my-new-password"
        assert parsed.disable_telemetry is True
