import os
import pwd
from dataclasses import dataclass, asdict
from typing import Optional, Dict, Any

DEFAULT_BIND_ADDR = "127.0.0.1:8080"
DEFAULT_AUTH = "password"


@dataclass
class CodeServerConfig:
    bind_addr: str = DEFAULT_BIND_ADDR
    auth: str = DEFAULT_AUTH
    password: Optional[str] = None
    cert: bool = False
    disable_telemetry: bool = False

    @property
    def host(self) -> str:
        if ":" in self.bind_addr:
            return self.bind_addr.split(":")[0]
        return "127.0.0.1"

    @property
    def port(self) -> int:
        if ":" in self.bind_addr:
            try:
                return int(self.bind_addr.split(":")[1])
            except ValueError:
                return 8080
        return 8080

    def to_dict(self) -> Dict[str, Any]:
        data = asdict(self)
        data["host"] = self.host
        data["port"] = self.port
        return data


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


def get_user_config_path(username: Optional[str] = None) -> str:
    user = resolve_username(username)
    if user and user != "root":
        try:
            pw = pwd.getpwnam(user)
            return os.path.join(pw.pw_dir, ".config", "code-server", "config.yaml")
        except KeyError:
            pass
    home = os.environ.get("HOME", "/root")
    return os.path.join(home, ".config", "code-server", "config.yaml")


def parse_code_server_config(path: str) -> CodeServerConfig:
    if not os.path.isfile(path):
        return CodeServerConfig()

    config = CodeServerConfig()
    try:
        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or ":" not in line:
                    continue
                k, v = line.split(":", 1)
                key = k.strip().lower()
                val = v.strip().strip("'\"")

                if key == "bind-addr":
                    config.bind_addr = val
                elif key == "auth":
                    config.auth = val
                elif key == "password":
                    config.password = val
                elif key == "cert":
                    config.cert = val.lower() in ("true", "1", "yes")
                elif key == "disable-telemetry":
                    config.disable_telemetry = val.lower() in ("true", "1", "yes")
    except Exception:
        pass

    return config


def sanitize_yaml_val(val: Optional[str]) -> str:
    if not val:
        return ""
    # Strip any newlines or carriage returns to prevent YAML injection
    return val.replace("\r", "").replace("\n", "").strip()


def ensure_user_ownership(path: str, username: Optional[str] = None) -> None:
    user = resolve_username(username)
    if not user or user == "root":
        return
    try:
        pw = pwd.getpwnam(user)
        uid = pw.pw_uid
        gid = pw.pw_gid
        user_home = pw.pw_dir

        curr = os.path.dirname(os.path.abspath(path))
        while curr and curr != user_home and curr.startswith(user_home):
            try:
                os.chown(curr, uid, gid)
                os.chmod(curr, 0o755)
            except Exception:
                pass
            curr = os.path.dirname(curr)

        if os.path.exists(path):
            os.chown(path, uid, gid)
            os.chmod(path, 0o600)
    except Exception:
        pass


def write_code_server_config(path: str, config: CodeServerConfig, username: Optional[str] = None) -> bool:
    try:
        parent_dir = os.path.dirname(path)
        os.makedirs(parent_dir, mode=0o755, exist_ok=True)

        clean_bind = sanitize_yaml_val(config.bind_addr) or DEFAULT_BIND_ADDR
        clean_auth = "password" if sanitize_yaml_val(config.auth) != "none" else "none"

        lines = [
            f"bind-addr: {clean_bind}",
            f"auth: {clean_auth}",
        ]
        if config.password:
            clean_pass = sanitize_yaml_val(config.password)
            lines.append(f"password: {clean_pass}")
        lines.append(f"cert: {str(bool(config.cert)).lower()}")
        if config.disable_telemetry:
            lines.append("disable-telemetry: true")

        content = "\n".join(lines) + "\n"

        # Atomic write via temporary file in same directory
        temp_path = f"{path}.tmp.{os.getpid()}"
        with open(temp_path, "w", encoding="utf-8") as f:
            f.write(content)

        os.chmod(temp_path, 0o600)

        user = resolve_username(username)
        if user and user != "root":
            try:
                pw = pwd.getpwnam(user)
                os.chown(temp_path, pw.pw_uid, pw.pw_gid)
            except Exception:
                pass

        os.replace(temp_path, path)
        ensure_user_ownership(path, username)
        return True
    except Exception:
        if "temp_path" in locals() and os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except Exception:
                pass
        return False
