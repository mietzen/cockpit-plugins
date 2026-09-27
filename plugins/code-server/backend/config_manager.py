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


def get_user_config_path(username: Optional[str] = None) -> str:
    user = username or os.environ.get("SUDO_USER") or os.environ.get("LOGNAME") or os.environ.get("USER")
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


def write_code_server_config(path: str, config: CodeServerConfig, username: Optional[str] = None) -> bool:
    try:
        parent_dir = os.path.dirname(path)
        os.makedirs(parent_dir, mode=0o700, exist_ok=True)

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

        if username:
            try:
                pw = pwd.getpwnam(username)
                os.chown(parent_dir, pw.pw_uid, pw.pw_gid)
                os.chown(temp_path, pw.pw_uid, pw.pw_gid)
            except Exception:
                pass

        os.replace(temp_path, path)
        return True
    except Exception:
        if "temp_path" in locals() and os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except Exception:
                pass
        return False
