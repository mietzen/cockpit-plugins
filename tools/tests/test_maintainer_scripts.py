"""Tests for package maintainer scripts."""

import subprocess
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
CERTS_DIR_NAME = "ws-certs.d"
CERT_FILE_NAME = "0-self-signed.cert"
KEY_FILE_NAME = "0-self-signed.key"
DUMMY_CERT_DATA = "MOCK_CERTIFICATE_CONTENT\n"
TARGET_DIR_PATTERN = "/etc/cockpit/ws-certs.d"
START_MARKER = "if [ ! -f /etc/cockpit/ws-certs.d/0-self-signed.cert ]"

SCRIPT_PATHS = (
    REPO_ROOT / "tools" / "build_deb.sh",
    REPO_ROOT / "tools" / "build_deb.py",
    REPO_ROOT / "tools" / "build_rpm.sh",
)

TEMPLATES_DIR = REPO_ROOT / "tools" / "templates"
POSTINST_TEMPLATE = TEMPLATES_DIR / "postinst.sh"
PRERM_TEMPLATE = TEMPLATES_DIR / "prerm.sh"

HELPER_DIR_PLACEHOLDER = "@@HELPER_DIR_NAME@@"
PLUGIN_NAME_PLACEHOLDER = "@@PLUGIN_NAME@@"


def test_maintainer_templates():
    """Verify maintainer script templates exist and are used by builders."""
    assert POSTINST_TEMPLATE.is_file()
    assert PRERM_TEMPLATE.is_file()

    postinst = POSTINST_TEMPLATE.read_text(encoding="utf-8")
    prerm = PRERM_TEMPLATE.read_text(encoding="utf-8")

    assert HELPER_DIR_PLACEHOLDER in postinst
    assert PLUGIN_NAME_PLACEHOLDER in postinst
    assert "chmod -R 755 /usr/libexec/" in postinst
    assert "code-server" in postinst
    assert "ws-certs.d" in postinst
    assert "ProtocolHeader = X-Forwarded-Proto" in postinst
    assert "cockpit-caddy.service" in postinst
    assert "/usr/local/bin/code" in postinst

    assert PLUGIN_NAME_PLACEHOLDER in prerm
    assert "code-server" in prerm
    assert "rm -f /usr/local/bin/code" in prerm
    assert "systemctl stop 'code-server@*.service'" in prerm
    assert "cockpit-caddy.service" in prerm
    assert "cockpit.socket.d/10-code-server.conf" in prerm

    for builder in SCRIPT_PATHS:
        content = builder.read_text(encoding="utf-8")
        assert "postinst.sh" in content
        assert "prerm.sh" in content


def extract_cert_snippet(file_path: Path) -> str:
    """Extract cert symlink block from maintainer script."""
    content = file_path.read_text(encoding="utf-8")
    start_pos = content.find(START_MARKER)
    if start_pos == -1:
        raise ValueError(f"Marker not found in {file_path}")

    lines = content[start_pos:].splitlines()
    snippet_lines = []
    depth = 0

    for line in lines:
        stripped = line.strip()
        words = stripped.split()
        if "if" in words and (words[0] == "if" or (len(words) > 1 and words[1] == "if")):
            depth += 1
        if "fi" in words and words[-1] == "fi":
            depth -= 1
        snippet_lines.append(line)
        if depth == 0:
            break

    snippet = "\n".join(snippet_lines)
    return snippet.replace(r"\$", "$")


def test_cert_symlink_safety(tmp_path: Path):
    """Verify maintainer script creates no self-referential symlink."""
    mock_certs_dir = tmp_path / CERTS_DIR_NAME
    mock_certs_dir.mkdir(parents=True, exist_ok=True)

    cert_file = mock_certs_dir / CERT_FILE_NAME
    cert_file.write_text(DUMMY_CERT_DATA, encoding="utf-8")

    key_file = mock_certs_dir / KEY_FILE_NAME
    assert not key_file.exists()

    # Extract shell logic and point to mock directory
    raw_snippet = extract_cert_snippet(POSTINST_TEMPLATE)
    mock_script = raw_snippet.replace(TARGET_DIR_PATTERN, str(mock_certs_dir))

    # Run extracted shell snippet in bash
    subprocess.run(["bash", "-c", mock_script], check=True)

    # Cert must remain an intact regular file
    assert cert_file.is_file()
    assert not cert_file.is_symlink()
    assert cert_file.read_text(encoding="utf-8") == DUMMY_CERT_DATA

    # Key must be symlink pointing to cert
    assert key_file.is_symlink()
    assert key_file.resolve() == cert_file.resolve()
    assert key_file.read_text(encoding="utf-8") == DUMMY_CERT_DATA


def test_tmpfiles_perms():
    conf_path = REPO_ROOT / "plugins" / "code-server" / "packaging" / "tmpfiles" / "cockpit-code-server.conf"
    content = conf_path.read_text(encoding="utf-8")
    assert "1777" in content
    assert "0755" not in content


SOCKET_CONF_PATH = (
    REPO_ROOT / "plugins" / "code-server" / "packaging" / "systemd" / "10-code-server.conf"
)
FALLBACK_PORT_ENTRY = "ListenStream=127.0.0.1:9091"
UNIX_SOCKET_ENTRY = "ListenStream=/run/cockpit/cockpit.sock"


def test_cockpit_socket_fallback():
    """Verify cockpit.socket drop-in configures fallback localhost port."""
    content = SOCKET_CONF_PATH.read_text(encoding="utf-8")

    # Ensure standalone localhost access is preserved if Caddy fails
    assert FALLBACK_PORT_ENTRY in content
    assert UNIX_SOCKET_ENTRY in content


STOP_SERVICE_CMD = "systemctl stop 'code-server@*.service'"
FORBIDDEN_MUTATION_PATTERNS = (
    "/etc/passwd",
    "TARGET_USERS",
    "CFG_DIR",
    "U_HOME",
)


def test_no_home_mutation():
    """Verify maintainer script does not scan or mutate user homes."""
    for script_path in (POSTINST_TEMPLATE, PRERM_TEMPLATE, *SCRIPT_PATHS):
        content = script_path.read_text(encoding="utf-8")
        for pattern in FORBIDDEN_MUTATION_PATTERNS:
            assert pattern not in content

    assert STOP_SERVICE_CMD in PRERM_TEMPLATE.read_text(encoding="utf-8")
