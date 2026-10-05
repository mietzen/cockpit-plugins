"""Tests for code-server Caddyfile configuration and permissions."""

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
CADDYFILE_PATH = (
    REPO_ROOT / "plugins" / "code-server" / "packaging" / "caddy" / "Caddyfile"
)
TMPFILES_PATH = (
    REPO_ROOT
    / "plugins"
    / "code-server"
    / "packaging"
    / "tmpfiles"
    / "cockpit-code-server.conf"
)

FORWARD_AUTH_DIRECTIVE = "forward_auth unix//run/cockpit/cockpit.sock"
FORWARD_AUTH_URI = "uri /cockpit/login"
REDIRECT_CODE_SERVER = "redir @code_server_no_slash /code-server/{re.cs_ns.uid}/ 308"
REVERSE_PROXY_TARGET = (
    "reverse_proxy unix//run/code-server/{re.cs.uid}/code-server.sock"
)
REVERSE_PROXY_FALLBACK = (
    "reverse_proxy unix//run/code-server/{re.cs.uid}/code-server.sock unix//run/code-server/{re.cs.uid}.sock"
)
EXPECTED_TMPFILES_PERM = "1777"


def test_caddy_forward_auth():
    """Verify code-server route validates session via Cockpit forward_auth."""
    content = CADDYFILE_PATH.read_text(encoding="utf-8")

    assert FORWARD_AUTH_DIRECTIVE in content
    assert FORWARD_AUTH_URI in content


def test_caddy_slash_redirect():
    """Verify missing trailing slash redirects cleanly with 308 status."""
    content = CADDYFILE_PATH.read_text(encoding="utf-8")

    assert REDIRECT_CODE_SERVER in content


def test_caddy_socket_target():
    """Verify code-server reverse proxy targets per-user socket."""
    content = CADDYFILE_PATH.read_text(encoding="utf-8")

    assert REVERSE_PROXY_TARGET in content
    # Ensure forward_auth precedes reverse_proxy in the block
    auth_pos = content.find(FORWARD_AUTH_DIRECTIVE)
    proxy_pos = content.find(REVERSE_PROXY_TARGET)
    assert auth_pos != -1
    assert proxy_pos != -1
    assert auth_pos < proxy_pos


def test_tmpfiles_permission():
    """Verify runtime directory has sticky bit permissions for multi-user safety."""
    content = TMPFILES_PATH.read_text(encoding="utf-8")

    assert EXPECTED_TMPFILES_PERM in content


def test_caddy_socket_fallback():
    """Verify code-server reverse proxy includes fallback socket."""
    content = CADDYFILE_PATH.read_text(encoding="utf-8")

    assert REVERSE_PROXY_FALLBACK in content
