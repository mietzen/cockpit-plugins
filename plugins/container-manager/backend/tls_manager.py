import base64
import io
import os
import shutil
import sys
import zipfile
from typing import Any, Dict, List, Optional

# Ensure local libexec directory and common python paths are resolvable
_CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
if _CURRENT_DIR not in sys.path:
    sys.path.insert(0, _CURRENT_DIR)

from cockpit_common.runner import run_cmd
from cockpit_common.tls import check_openssl, generate_pki_bundle

DOCKER_CERTS_DIR = "/etc/docker/certs"
DOCKER_SYSTEMD_DROPIN_DIR = "/etc/systemd/system/docker.service.d"
DOCKER_DROPIN_FILE = os.path.join(DOCKER_SYSTEMD_DROPIN_DIR, "override-cockpit-tls.conf")

PODMAN_CERTS_DIR = "/etc/containers/certs"
PODMAN_SYSTEMD_DROPIN_DIR = "/etc/systemd/system/podman.service.d"
PODMAN_DROPIN_FILE = os.path.join(PODMAN_SYSTEMD_DROPIN_DIR, "override-cockpit-tls.conf")


def _get_engine_paths(engine: str):
    if engine == "podman":
        return PODMAN_CERTS_DIR, PODMAN_SYSTEMD_DROPIN_DIR, PODMAN_DROPIN_FILE, "podman.service"
    return DOCKER_CERTS_DIR, DOCKER_SYSTEMD_DROPIN_DIR, DOCKER_DROPIN_FILE, "docker.service"


def get_tls_status(engine: str = "docker") -> Dict[str, Any]:
    """Inspects whether remote TCP+TLS socket is configured and running."""
    certs_dir, _, dropin_file, service_name = _get_engine_paths(engine)

    has_ca = os.path.exists(os.path.join(certs_dir, "ca.pem"))
    has_server_cert = os.path.exists(os.path.join(certs_dir, "server-cert.pem"))
    has_server_key = os.path.exists(os.path.join(certs_dir, "server-key.pem"))
    has_client_cert = os.path.exists(os.path.join(certs_dir, "cert.pem"))
    has_client_key = os.path.exists(os.path.join(certs_dir, "key.pem"))

    certs_exist = has_ca and has_server_cert and has_server_key and has_client_cert and has_client_key
    dropin_exists = os.path.exists(dropin_file)

    expiry = ""
    sans = []
    if has_server_cert:
        rc, out, _ = run_cmd(["openssl", "x509", "-enddate", "-noout", "-in", os.path.join(certs_dir, "server-cert.pem")])
        if rc == 0 and "notAfter=" in out:
            expiry = out.split("notAfter=", 1)[1].strip()

        rc, out, _ = run_cmd(["openssl", "x509", "-text", "-noout", "-in", os.path.join(certs_dir, "server-cert.pem")])
        if rc == 0 and "Subject Alternative Name:" in out:
            san_section = out.split("Subject Alternative Name:", 1)[1].split("\n")[1].strip()
            sans = [s.strip().replace("IP Address:", "").replace("DNS:", "") for s in san_section.split(",")]

    port = 2376
    if dropin_exists:
        try:
            with open(dropin_file, "r") as f:
                content = f.read()
                if "tcp://0.0.0.0:" in content:
                    port_part = content.split("tcp://0.0.0.0:", 1)[1].split()[0]
                    port = int(port_part)
        except Exception:
            pass

    return {
        "engine": engine,
        "enabled": dropin_exists,
        "certsExist": certs_exist,
        "port": port,
        "expiry": expiry,
        "sans": sans,
        "service": service_name,
    }


def setup_tls(
    engine: str = "docker",
    port: int = 2376,
    sans: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Generates TLS certificates and configures systemd override drop-in."""
    if not check_openssl():
        return {"status": "error", "error": "OpenSSL CLI utility is required"}

    certs_dir, dropin_dir, dropin_file, service_name = _get_engine_paths(engine)

    effective_sans = sans or []
    if "127.0.0.1" not in effective_sans:
        effective_sans.append("127.0.0.1")
    if "localhost" not in effective_sans:
        effective_sans.append("localhost")

    # Generate PKI in target certs dir
    os.makedirs(certs_dir, exist_ok=True)
    try:
        generate_pki_bundle(certs_dir, effective_sans)
    except Exception as e:
        return {"status": "error", "error": f"Failed to generate TLS certificates: {e}"}

    # Generate systemd drop-in override
    os.makedirs(dropin_dir, exist_ok=True)
    if engine == "podman":
        dropin_content = f"""[Service]
ExecStart=
ExecStart=/usr/bin/podman system service --time=0 tcp:0.0.0.0:{port}
"""
    else:
        # Docker drop-in
        dropin_content = f"""[Service]
ExecStart=
ExecStart=/usr/bin/dockerd -H fd:// -H tcp://0.0.0.0:{port} --tlsverify --tlscacert={certs_dir}/ca.pem --tlscert={certs_dir}/server-cert.pem --tlskey={certs_dir}/server-key.pem
"""

    with open(dropin_file, "w") as f:
        f.write(dropin_content)

    # Reload systemd and restart service
    run_cmd(["systemctl", "daemon-reload"])
    rc, _, err = run_cmd(["systemctl", "restart", service_name])
    if rc != 0:
        return {"status": "error", "error": f"Failed to restart {service_name}: {err}"}

    return {"status": "success", "port": port, "sans": effective_sans}


def disable_tls(engine: str = "docker") -> Dict[str, Any]:
    """Removes remote TCP systemd override and restarts service."""
    _, _, dropin_file, service_name = _get_engine_paths(engine)

    if os.path.exists(dropin_file):
        os.remove(dropin_file)

    run_cmd(["systemctl", "daemon-reload"])
    rc, _, err = run_cmd(["systemctl", "restart", service_name])
    if rc != 0:
        return {"status": "error", "error": f"Failed to restart {service_name}: {err}"}

    return {"status": "success"}


def get_client_bundle(engine: str = "docker") -> Dict[str, Any]:
    """Returns CA, client cert, and client key contents and a zip archive."""
    certs_dir, _, _, _ = _get_engine_paths(engine)

    ca_path = os.path.join(certs_dir, "ca.pem")
    cert_path = os.path.join(certs_dir, "cert.pem")
    key_path = os.path.join(certs_dir, "key.pem")

    if not (os.path.exists(ca_path) and os.path.exists(cert_path) and os.path.exists(key_path)):
        return {"status": "error", "error": "Client certificates not found. Please enable TLS first."}

    with open(ca_path, "r") as f:
        ca_text = f.read()
    with open(cert_path, "r") as f:
        cert_text = f.read()
    with open(key_path, "r") as f:
        key_text = f.read()

    # Create in-memory zip archive
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("ca.pem", ca_text)
        zf.writestr("cert.pem", cert_text)
        zf.writestr("key.pem", key_text)

    zip_b64 = base64.b64encode(zip_buffer.getvalue()).decode("ascii")

    return {
        "status": "success",
        "ca": ca_text,
        "cert": cert_text,
        "key": key_text,
        "zipBase64": zip_b64,
        "zipFilename": f"{engine}-tls-client-certs.zip",
    }
