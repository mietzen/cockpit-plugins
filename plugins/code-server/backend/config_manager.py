import os
import pwd
import secrets
from dataclasses import dataclass, asdict
from typing import Optional, Dict, Any

AUTH_PASSWORD = "password"
AUTH_NONE = "none"
DEFAULT_BIND_ADDR = "127.0.0.1:8080"
DEFAULT_AUTH = AUTH_NONE
DEFAULT_SOCKET_MODE = "600"
PASSWORD_TOKEN_BYTES = 24


@dataclass
class CodeServerConfig:
    bind_addr: Optional[str] = None
    socket: Optional[str] = None
    socket_mode: Optional[str] = DEFAULT_SOCKET_MODE
    auth: str = DEFAULT_AUTH
    password: Optional[str] = None
    hashed_password: Optional[str] = None
    cert: Any = False
    cert_key: Optional[str] = None
    disable_telemetry: bool = False
    app_name: str = "Code-Server"

    def __post_init__(self):
        # Auto-generate secure token when auth is password and no secret provided
        if self.auth == AUTH_PASSWORD and not self.password and not self.hashed_password:
            self.password = secrets.token_urlsafe(PASSWORD_TOKEN_BYTES)

    @property
    def host(self) -> str:
        if self.bind_addr and ":" in self.bind_addr:
            return self.bind_addr.split(":")[0]
        return "127.0.0.1"

    @property
    def port(self) -> int:
        if self.bind_addr and ":" in self.bind_addr:
            try:
                return int(self.bind_addr.split(":")[1])
            except ValueError:
                return 8080
        return 8080

    def to_dict(self) -> Dict[str, Any]:
        is_auth_configured = self.auth == AUTH_PASSWORD
        return {
            "bind_addr": self.bind_addr,
            "socket": self.socket,
            "socket_mode": self.socket_mode,
            "auth": self.auth,
            "cert": self.cert,
            "cert_key": self.cert_key,
            "disable_telemetry": self.disable_telemetry,
            "app_name": self.app_name,
            "host": self.host,
            "port": self.port,
            "auth_configured": is_auth_configured,
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
    if username == "root":
        return "root"
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
    return "root"


def get_user_uid(username: Optional[str] = None) -> int:
    user = resolve_username(username)
    if user and user != "root":
        try:
            pw = pwd.getpwnam(user)
            return pw.pw_uid
        except Exception:
            pass
    return 1000


def get_default_socket_path_for_user(username: Optional[str] = None) -> str:
    user = resolve_username(username)
    if user == "root":
        return "/run/code-server/0/code-server.sock"
    uid = get_user_uid(username)
    return f"/run/code-server/{uid}/code-server.sock"


def get_default_port_for_user(username: Optional[str] = None) -> int:
    user = resolve_username(username)
    if user and user != "root":
        try:
            pw = pwd.getpwnam(user)
            if pw.pw_uid >= 1000:
                return 8080 + (pw.pw_uid - 1000)
        except Exception:
            pass
    return 8080


def get_default_bind_addr_for_user(username: Optional[str] = None) -> str:
    return f"127.0.0.1:{get_default_port_for_user(username)}"


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


def parse_code_server_config(path: str, username: Optional[str] = None) -> CodeServerConfig:
    default_socket = get_default_socket_path_for_user(username)
    if not os.path.isfile(path):
        return CodeServerConfig(socket=default_socket, socket_mode=DEFAULT_SOCKET_MODE)

    raw_data: Dict[str, Any] = {}
    has_explicit_target = False

    try:
        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or ":" not in line:
                    continue
                k, v = line.split(":", 1)
                key = k.strip().lower()
                val = v.strip().strip("'\"")

                if key == "socket":
                    raw_data["socket"] = val
                    has_explicit_target = True
                elif key == "socket-mode":
                    raw_data["socket_mode"] = val
                elif key == "bind-addr":
                    raw_data["bind_addr"] = val
                    has_explicit_target = True
                elif key == "auth":
                    raw_data["auth"] = val
                elif key == "password":
                    raw_data["password"] = val
                elif key == "hashed-password":
                    raw_data["hashed_password"] = val
                elif key == "cert":
                    if val.lower() in ("true", "1", "yes"):
                        raw_data["cert"] = True
                    elif val.lower() in ("false", "0", "no"):
                        raw_data["cert"] = False
                    else:
                        raw_data["cert"] = val
                elif key == "cert-key":
                    raw_data["cert_key"] = val
                elif key == "disable-telemetry":
                    raw_data["disable_telemetry"] = val.lower() in ("true", "1", "yes")
                elif key == "app-name":
                    raw_data["app_name"] = val
    except Exception:
        pass

    if not has_explicit_target:
        raw_data["socket"] = default_socket
        raw_data["socket_mode"] = DEFAULT_SOCKET_MODE

    if not raw_data.get("auth"):
        raw_data["auth"] = DEFAULT_AUTH

    return CodeServerConfig(**raw_data)


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

        lines = []
        if config.socket:
            clean_socket = sanitize_yaml_val(config.socket)
            clean_mode = sanitize_yaml_val(config.socket_mode) or DEFAULT_SOCKET_MODE
            lines.append(f"socket: {clean_socket}")
            lines.append(f"socket-mode: {clean_mode}")
        elif config.bind_addr:
            clean_bind = sanitize_yaml_val(config.bind_addr)
            lines.append(f"bind-addr: {clean_bind}")
        else:
            default_socket = get_default_socket_path_for_user(username)
            lines.append(f"socket: {default_socket}")
            lines.append(f"socket-mode: {DEFAULT_SOCKET_MODE}")

        raw_auth = sanitize_yaml_val(config.auth)
        clean_auth = AUTH_NONE if raw_auth == AUTH_NONE else AUTH_PASSWORD
        lines.append(f"auth: {clean_auth}")
        if config.app_name:
            lines.append(f"app-name: {sanitize_yaml_val(config.app_name)}")
        if config.password:
            lines.append(f"password: {sanitize_yaml_val(config.password)}")

        if config.hashed_password:
            lines.append(f"hashed-password: {sanitize_yaml_val(config.hashed_password)}")
        if isinstance(config.cert, str) and config.cert:
            lines.append(f"cert: {sanitize_yaml_val(config.cert)}")
            if config.cert_key:
                lines.append(f"cert-key: {sanitize_yaml_val(config.cert_key)}")
        elif config.cert:
            lines.append("cert: true")
        else:
            lines.append("cert: false")
        if config.disable_telemetry:
            lines.append("disable-telemetry: true")

        content = "\n".join(lines) + "\n"

        # Atomic write via temporary file in same directory with 0600 permissions
        temp_path = f"{path}.tmp.{os.getpid()}"
        fd = os.open(temp_path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        try:
            os.write(fd, content.encode("utf-8"))
        finally:
            os.close(fd)

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
