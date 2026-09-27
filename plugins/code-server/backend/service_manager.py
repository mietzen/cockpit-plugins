import os
import shutil
import subprocess
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


def get_service_unit_name(username: Optional[str] = None) -> str:
    if username and username != "root":
        return f"code-server@{username}.service"
    return "code-server.service"


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


def manage_service(action: str, username: Optional[str] = None) -> Dict[str, Any]:
    if action not in ALLOWED_ACTIONS:
        return {"success": False, "error": f"Invalid action: {action}. Allowed: {list(ALLOWED_ACTIONS)}"}

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


def install_code_server() -> Dict[str, Any]:
    try:
        cmd = ["curl", "-fsSL", "https://code-server.dev/install.sh"]
        sh_cmd = ["sh", "-s", "--", "--method=standalone"]
        p1 = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        p2 = subprocess.Popen(sh_cmd, stdin=p1.stdout, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        p1.stdout.close()
        out, err = p2.communicate(timeout=300)

        if p2.returncode == 0:
            return {"success": True, "error": None, "output": out.decode("utf-8", errors="replace")}
        return {
            "success": False,
            "error": err.decode("utf-8", errors="replace") or "Installer returned error",
            "output": out.decode("utf-8", errors="replace"),
        }
    except Exception as e:
        return {"success": False, "error": str(e)}
