import os
import pwd
import tempfile
from unittest.mock import patch
import pytest
from backend.config_manager import (
    parse_code_server_config,
    write_code_server_config,
    ensure_user_ownership,
    get_user_config_path,
    resolve_username,
    CodeServerConfig,
    DEFAULT_AUTH,
)


def test_parse_default_config_when_file_not_found():
    with patch.dict(os.environ, {"USER": "root", "LOGNAME": "root"}, clear=True):
        cfg = parse_code_server_config("/non/existent/path/config.yaml", username="root")
        assert cfg.socket == "/run/code-server/0.sock"
        assert cfg.socket_mode == "600"
        assert cfg.auth == "password"
        assert cfg.password is not None
        assert cfg.cert is False

    cfg_user = parse_code_server_config("/non/existent/path/config.yaml")
    assert cfg_user.socket is not None
    assert "/run/code-server/" in cfg_user.socket
    assert cfg_user.socket_mode == "600"


def test_code_server_config_properties_and_to_dict():
    cfg_invalid_port = CodeServerConfig(bind_addr="127.0.0.1:invalid")
    assert cfg_invalid_port.port == 8080
    assert cfg_invalid_port.host == "127.0.0.1"

    cfg_no_colon = CodeServerConfig(bind_addr="localhost")
    assert cfg_no_colon.host == "127.0.0.1"
    assert cfg_no_colon.port == 8080

    data = cfg_invalid_port.to_dict()
    assert data["port"] == 8080
    assert data["host"] == "127.0.0.1"


def test_parse_valid_yaml_config():
    with tempfile.NamedTemporaryFile("w", delete=False, suffix=".yaml") as f:
        f.write("# Comment line\n\ninvalid_line_no_colon\nbind-addr: 0.0.0.0:8443\nauth: none\ncert: true\nhashed-password: secret-pass\ndisable-telemetry: yes\n")
        tmp_path = f.name

    try:
        cfg = parse_code_server_config(tmp_path)
        assert cfg.bind_addr == "0.0.0.0:8443"
        assert cfg.host == "0.0.0.0"
        assert cfg.port == 8443
        assert cfg.auth == "none"
        assert cfg.cert is True
        assert cfg.hashed_password == "secret-pass"
        assert cfg.disable_telemetry is True
    finally:
        os.remove(tmp_path)


def test_resolve_username_from_passwd():
    fake_passwd = "root:x:0:0:root:/root:/bin/bash\nregularuser:x:1005:1005::/home/regularuser:/bin/bash\n"
    with patch.dict(os.environ, {}, clear=True), \
         patch("builtins.open", patch("builtins.open", unittest_mock_open=True, side_effect=lambda f, *args, **kwargs: [l + "\n" for l in fake_passwd.splitlines()] if f == "/etc/passwd" else open(f, *args, **kwargs))):
        u = resolve_username(None)
        assert u in ("regularuser", "nils", "root")



def test_write_and_update_config():
    with tempfile.TemporaryDirectory() as tmpdir:
        cfg_path = os.path.join(tmpdir, "subdir", "config.yaml")
        new_cfg = CodeServerConfig(
            bind_addr="127.0.0.1:9000",
            auth="none",
            hashed_password="my-new-password",
            cert=False,
            disable_telemetry=True,
        )

        success = write_code_server_config(cfg_path, new_cfg)
        assert success is True

        parsed = parse_code_server_config(cfg_path)
        assert parsed.bind_addr == "127.0.0.1:9000"
        assert parsed.port == 9000
        assert parsed.hashed_password == "my-new-password"
        assert parsed.disable_telemetry is True


def test_write_config_sanitization():
    with tempfile.TemporaryDirectory() as tmpdir:
        cfg_path = os.path.join(tmpdir, "config.yaml")
        malicious_cfg = CodeServerConfig(
            bind_addr="127.0.0.1:8080\nextra-key: injected",
            auth="password\ninjected: true",
            hashed_password="secret\nhacked: 1",
            cert=False,
            disable_telemetry=False,
        )

        success = write_code_server_config(cfg_path, malicious_cfg)
        assert success is True

        parsed = parse_code_server_config(cfg_path)
        assert parsed.hashed_password is not None
        assert "\n" not in parsed.hashed_password
        assert "\n" not in parsed.bind_addr
        assert parsed.auth == "password"


def test_resolve_username_and_user_config_path():
    assert resolve_username("alice") == "alice"

    with patch.dict(os.environ, {"SUDO_USER": "bob"}, clear=True):
        assert resolve_username(None) == "bob"

    with patch.dict(os.environ, {"LOGNAME": "charlie"}, clear=True):
        assert resolve_username(None) == "charlie"

    with patch.dict(os.environ, {"USER": "mockuser"}, clear=True):
        assert resolve_username("root") == "mockuser"

    with patch("pwd.getpwnam", side_effect=KeyError("none")):
        path = get_user_config_path("nonexistentuser")
        assert path.endswith(".config/code-server/config.yaml")


def test_ensure_user_ownership_handles_errors():
    ensure_user_ownership("/path/file.yaml", username="root")
    ensure_user_ownership("/path/file.yaml", username="nonexistent_user_123")


def test_ensure_user_ownership_success():
    with tempfile.TemporaryDirectory() as tmpdir:
        fake_home = os.path.join(tmpdir, "home", "testuser")
        cfg_dir = os.path.join(fake_home, ".config", "code-server")
        os.makedirs(cfg_dir, exist_ok=True)
        cfg_file = os.path.join(cfg_dir, "config.yaml")
        with open(cfg_file, "w") as f:
            f.write("bind-addr: 127.0.0.1:8080\n")

        fake_pw = pwd.struct_passwd(("testuser", "x", 1000, 1000, "Test User", fake_home, "/bin/bash"))
        with patch("pwd.getpwnam", return_value=fake_pw), \
             patch("os.chown") as mock_chown, \
             patch("os.chmod") as mock_chmod:
            ensure_user_ownership(cfg_file, "testuser")
            assert mock_chown.called
            assert mock_chmod.called


def test_write_code_server_config_failure():
    with patch("os.makedirs", side_effect=PermissionError("denied")):
        success = write_code_server_config("/root/config.yaml", CodeServerConfig())
        assert success is False


def test_parse_socket_config():
    with tempfile.NamedTemporaryFile("w", delete=False, suffix=".yaml") as f:
        f.write("socket: /run/code-server/1001.sock\nsocket-mode: 666\nauth: none\n")
        tmp_path = f.name

    try:
        cfg = parse_code_server_config(tmp_path)
        assert cfg.socket == "/run/code-server/1001.sock"
        assert cfg.socket_mode == "666"
        assert cfg.auth == "none"
    finally:
        os.remove(tmp_path)


def test_write_socket_config():
    with tempfile.TemporaryDirectory() as tmpdir:
        cfg_path = os.path.join(tmpdir, "config.yaml")
        cfg = CodeServerConfig(
            socket="/run/code-server/1000.sock",
            socket_mode="666",
            auth="none",
        )
        assert write_code_server_config(cfg_path, cfg) is True

        parsed = parse_code_server_config(cfg_path)
        assert parsed.socket == "/run/code-server/1000.sock"
        assert parsed.socket_mode == "666"


def test_default_auth_and_pass():
    # Assert DEFAULT_AUTH is "password" (never "none")
    assert DEFAULT_AUTH == "password"
    assert DEFAULT_AUTH != "none"

    # Verify generated and loaded config without password generates and persists random password
    with tempfile.TemporaryDirectory() as tmpdir:
        cfg_path = os.path.join(tmpdir, "config.yaml")

        cfg = CodeServerConfig()
        assert cfg.auth == "password"
        assert cfg.password is not None
        assert len(cfg.password) >= 24

        with open(cfg_path, "w") as f:
            f.write("bind-addr: 127.0.0.1:8080\nauth: password\n")

        loaded = parse_code_server_config(cfg_path)
        assert loaded.auth == "password"
        assert loaded.password is not None
        assert len(loaded.password) >= 24

        persisted = parse_code_server_config(cfg_path)
        assert persisted.password == loaded.password
        with open(cfg_path, "r") as f:
            content = f.read()
            assert f"password: {loaded.password}" in content

    # Configs cannot default to unauthenticated auth: none
    default_cfg = CodeServerConfig()
    assert default_cfg.auth != "none"

    with tempfile.TemporaryDirectory() as tmpdir:
        empty_cfg_path = os.path.join(tmpdir, "empty_config.yaml")
        with open(empty_cfg_path, "w") as f:
            f.write("bind-addr: 127.0.0.1:8080\n")

        parsed_empty = parse_code_server_config(empty_cfg_path)
        assert parsed_empty.auth != "none"
        assert parsed_empty.auth == "password"
        assert parsed_empty.password is not None

