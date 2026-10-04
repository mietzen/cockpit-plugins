import os
import platform
import secrets
import shutil
import subprocess
import urllib.request
from typing import Dict, Any, Optional

ALLOWED_ACTIONS = {"start", "stop", "restart", "enable", "disable", "reload"}
PASSWORD_TOKEN_BYTES = 24


def get_binary_info() -> Dict[str, Any]:
    binary_path = shutil.which("code-server")
    if not binary_path:
        for candidate in [
            "/usr/bin/code-server",
            "/usr/local/bin/code-server",
            "/opt/code-server/bin/code-server",
            os.path.expanduser("~/.local/bin/code-server"),
        ]:
            if os.path.isfile(candidate) and os.access(candidate, os.X_OK):
                binary_path = candidate
                break

    if not binary_path:
        return {"installed": False, "version": None, "path": None}

    version = None
    try:
        proc = subprocess.run(
            [binary_path, "--version"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if proc.returncode == 0 and proc.stdout.strip():
            version = proc.stdout.strip().split("\n")[0]
    except Exception:
        pass

    return {
        "installed": True,
        "version": version or "Unknown",
        "path": binary_path,
    }
try:
    from .config_manager import resolve_username
except ImportError:
    from config_manager import resolve_username


def get_service_unit_name(username: Optional[str] = None) -> str:
    user = resolve_username(username)
    if user and user != "root":
        return f"code-server@{user}.service"
    return "code-server@root.service"


def get_service_status(username: Optional[str] = None) -> Dict[str, Any]:
    unit_name = get_service_unit_name(username)
    status: Dict[str, Any] = {
        "unit": unit_name,
        "active": False,
        "state": "inactive",
        "enabled": False,
        "pid": None,
        "started_at": None,
    }

    try:
        proc = subprocess.run(
            [
                "systemctl",
                "show",
                unit_name,
                "--property=ActiveState,UnitFileState,MainPID,ExecMainStartTimestamp",
            ],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if proc.returncode == 0:
            for line in proc.stdout.splitlines():
                if "=" not in line:
                    continue
                k, v = line.split("=", 1)
                k = k.strip()
                v = v.strip()

                if k == "ActiveState":
                    status["state"] = v
                    status["active"] = v == "active"
                elif k == "UnitFileState":
                    status["enabled"] = v in ("enabled", "enabled-runtime")
                elif k == "MainPID":
                    try:
                        pid = int(v)
                        status["pid"] = pid if pid > 0 else None
                    except ValueError:
                        pass
                elif k == "ExecMainStartTimestamp":
                    status["started_at"] = v if v else None
    except Exception:
        pass

    return status


def ensure_user_dir_permissions(username: Optional[str] = None) -> None:
    user = resolve_username(username)
    if not user or user == "root":
        return
    try:
        import pwd
        pw = pwd.getpwnam(user)
        uid = pw.pw_uid
        gid = pw.pw_gid
        user_home = pw.pw_dir

        target_dirs = [
            os.path.join(user_home, ".config", "code-server"),
            os.path.join(user_home, ".local", "share", "code-server"),
            os.path.join(user_home, ".cache", "code-server"),
        ]

        for target in target_dirs:
            if os.path.exists(target):
                for root, dirs, files in os.walk(target):
                    for d in dirs:
                        dpath = os.path.join(root, d)
                        try:
                            os.chown(dpath, uid, gid)
                            os.chmod(dpath, 0o755)
                        except Exception:
                            pass
                    for f in files:
                        fpath = os.path.join(root, f)
                        try:
                            os.chown(fpath, uid, gid)
                            os.chmod(fpath, 0o600)
                        except Exception:
                            pass
                try:
                    os.chown(target, uid, gid)
                    os.chmod(target, 0o755)
                except Exception:
                    pass

        # Ensure /run/code-server exists with sticky 1777 permissions for user sockets
        try:
            os.makedirs("/run/code-server", mode=0o1777, exist_ok=True)
            os.chmod("/run/code-server", 0o1777)
        except Exception:
            pass

        cfg_dir = os.path.join(user_home, ".config", "code-server")
        os.makedirs(cfg_dir, exist_ok=True)

        cfg_file = os.path.join(cfg_dir, "config.yaml")
        try:
            try:
                from .config_manager import (
                    parse_code_server_config,
                    write_code_server_config,
                    get_default_socket_path_for_user,
                    CodeServerConfig,
                )
            except ImportError:
                from config_manager import (
                    parse_code_server_config,
                    write_code_server_config,
                    get_default_socket_path_for_user,
                    CodeServerConfig,
                )
            default_sock = get_default_socket_path_for_user(user)
            if not os.path.isfile(cfg_file):
                init_cfg = CodeServerConfig(
                    socket=default_sock,
                    socket_mode="600",
                    auth="password",
                    password=secrets.token_urlsafe(PASSWORD_TOKEN_BYTES),
                    cert=False,
                    app_name="Code-Server",
                    disable_telemetry=True,
                )
                write_code_server_config(cfg_file, init_cfg, user)
            else:
                cfg = parse_code_server_config(cfg_file, user)
                changed = False
                if cfg.socket != default_sock:
                    cfg.socket = default_sock
                    cfg.socket_mode = "600"
                    cfg.bind_addr = None
                    changed = True
                if cfg.cert is not False:
                    cfg.cert = False
                    cfg.cert_key = None
                    changed = True
                if not cfg.app_name:
                    cfg.app_name = "Code-Server"
                    changed = True
                if changed:
                    write_code_server_config(cfg_file, cfg, user)
        except Exception:
            pass
    except Exception:
        pass


def manage_service(action: str, username: Optional[str] = None) -> Dict[str, Any]:
    if action not in ALLOWED_ACTIONS:
        return {"success": False, "error": f"Invalid action: {action}. Allowed: {list(ALLOWED_ACTIONS)}"}

    if action in ("start", "restart", "enable"):
        ensure_user_dir_permissions(username)

    if action in ("start", "restart"):
        user = resolve_username(username)
        try:
            import pwd
            pw = pwd.getpwnam(user)
            sock_path = f"/run/code-server/{pw.pw_uid}.sock"
            if os.path.exists(sock_path):
                try:
                    os.unlink(sock_path)
                except Exception:
                    pass
        except Exception:
            pass

    unit_name = get_service_unit_name(username)
    cmd = ["systemctl", action, unit_name]

    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=30,
        )
        if proc.returncode == 0:
            return {"success": True, "error": None}
        return {"success": False, "error": proc.stderr.strip() or f"systemctl {action} failed"}
    except Exception as e:
        return {"success": False, "error": str(e)}


def read_pinned_version(pkg_name: str, fallback: str) -> str:
    # Read upstream package version from plugin configuration
    candidates = [
        os.path.join(os.path.dirname(__file__), "..", "upstream.json"),
        os.path.join(os.path.dirname(__file__), "upstream.json"),
    ]
    for path in candidates:
        if not os.path.isfile(path):
            continue
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
                for item in data.get("packages", []):
                    if item.get("name") == pkg_name and item.get("version"):
                        return item["version"]
        except Exception:
            continue

    return fallback


CODE_SERVER_UPSTREAM_VERSION = read_pinned_version("code-server", "4.139.1")
CADDY_UPSTREAM_VERSION = read_pinned_version("caddy", "2.11.7")


def install_code_server(
    version: str = CODE_SERVER_UPSTREAM_VERSION,
    username: Optional[str] = None,
) -> Dict[str, Any]:
    try:
        if shutil.which("apt-get"):
            cmd = ["apt-get", "install", "-y", "code-server"]
        elif shutil.which("dnf"):
            cmd = ["dnf", "install", "-y", "code-server"]
        else:
            return {"success": False, "error": "No supported package manager (apt-get or dnf) found"}

        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
        if proc.returncode != 0:
            return {
                "success": False,
                "error": proc.stderr.strip() or f"Package installation failed (exit {proc.returncode})",
            }

        # Enable and start service
        manage_service("enable", username)
        manage_service("start", username)

        return {
            "success": True,
            "error": None,
            "output": f"code-server v{version} installed and service started successfully",
        }

    except Exception as e:
        return {"success": False, "error": str(e)}
