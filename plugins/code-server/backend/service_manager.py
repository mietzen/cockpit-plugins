import os
import platform
import shutil
import subprocess
import urllib.request
from typing import Dict, Any, Optional

ALLOWED_ACTIONS = {"start", "stop", "restart", "enable", "disable", "reload"}


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


def resolve_username(username: Optional[str] = None) -> str:
    if username and username != "root":
        return username
    sudo_user = os.environ.get("SUDO_USER")
    if sudo_user and sudo_user != "root":
        return sudo_user
    logname = os.environ.get("LOGNAME") or os.environ.get("USER")
    if logname and logname != "root":
        return logname
    try:
        with open("/etc/passwd", "r") as f:
            for line in f:
                parts = line.strip().split(":")
                if len(parts) >= 3 and parts[2].isdigit():
                    uid = int(parts[2])
                    if 1000 <= uid < 65534:
                        return parts[0]
    except Exception:
        pass
    return username or "root"


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
        config_dir = os.path.join(user_home, ".config", "code-server")
        if os.path.isdir(config_dir):
            for root, dirs, files in os.walk(config_dir):
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
                os.chown(config_dir, uid, gid)
                os.chmod(config_dir, 0o755)
            except Exception:
                pass
    except Exception:
        pass


def manage_service(action: str, username: Optional[str] = None) -> Dict[str, Any]:
    if action not in ALLOWED_ACTIONS:
        return {"success": False, "error": f"Invalid action: {action}. Allowed: {list(ALLOWED_ACTIONS)}"}

    if action in ("start", "restart", "enable"):
        ensure_user_dir_permissions(username)

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


CODE_SERVER_UPSTREAM_VERSION = "4.139.1"


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
