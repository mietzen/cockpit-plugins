import os
import shutil
import tempfile
from typing import Dict, List, Tuple
from .runner import run_cmd


def check_openssl() -> bool:
    """Verifies that openssl is available in system PATH."""
    return shutil.which("openssl") is not None


def generate_ca(
    output_dir: str,
    subject: str = "/CN=CockpitContainerCA",
    days: int = 3650,
) -> Tuple[str, str]:
    """
    Generates CA private key and self-signed CA certificate.
    Returns (ca_cert_path, ca_key_path).
    """
    os.makedirs(output_dir, exist_ok=True)
    ca_key = os.path.join(output_dir, "ca-key.pem")
    ca_cert = os.path.join(output_dir, "ca.pem")

    # Generate CA key
    rc, _, err = run_cmd(["openssl", "genrsa", "-out", ca_key, "4096"])
    if rc != 0:
        raise RuntimeError(f"Failed to generate CA key: {err}")

    # Generate self-signed CA cert
    rc, _, err = run_cmd([
        "openssl", "req", "-new", "-x509",
        "-days", str(days),
        "-key", ca_key,
        "-sha256",
        "-out", ca_cert,
        "-subj", subject,
    ])
    if rc != 0:
        raise RuntimeError(f"Failed to generate CA certificate: {err}")

    os.chmod(ca_key, 0o400)
    os.chmod(ca_cert, 0o444)
    return ca_cert, ca_key


def generate_server_cert(
    output_dir: str,
    ca_cert: str,
    ca_key: str,
    sans: List[str],
    days: int = 365,
) -> Tuple[str, str]:
    """
    Generates server private key and certificate signed by CA,
    including Subject Alternative Names (SANs).
    Returns (server_cert_path, server_key_path).
    """
    os.makedirs(output_dir, exist_ok=True)
    server_key = os.path.join(output_dir, "server-key.pem")
    server_cert = os.path.join(output_dir, "server-cert.pem")
    csr_file = os.path.join(output_dir, "server.csr")

    # Generate server private key
    rc, _, err = run_cmd(["openssl", "genrsa", "-out", server_key, "4096"])
    if rc != 0:
        raise RuntimeError(f"Failed to generate server key: {err}")

    # Generate CSR
    primary_cn = sans[0] if sans else "localhost"
    rc, _, err = run_cmd([
        "openssl", "req", "-subj", f"/CN={primary_cn}",
        "-sha256", "-new",
        "-key", server_key,
        "-out", csr_file,
    ])
    if rc != 0:
        raise RuntimeError(f"Failed to generate server CSR: {err}")

    # Build SAN extfile
    san_entries = []
    for s in sans:
        s_clean = s.strip()
        if not s_clean:
            continue
        # Check if IP address or DNS
        parts = s_clean.split(".")
        if len(parts) == 4 and all(p.isdigit() for p in parts):
            san_entries.append(f"IP:{s_clean}")
        elif ":" in s_clean:
            # IPv6
            san_entries.append(f"IP:{s_clean}")
        else:
            san_entries.append(f"DNS:{s_clean}")

    if not any("127.0.0.1" in e for e in san_entries):
        san_entries.append("IP:127.0.0.1")
    if not any("DNS:localhost" in e for e in san_entries):
        san_entries.append("DNS:localhost")

    san_str = ",".join(san_entries)
    ext_content = (
        f"subjectAltName = {san_str}\n"
        "extendedKeyUsage = serverAuth\n"
    )

    ext_file = os.path.join(output_dir, "extfile-server.cnf")
    with open(ext_file, "w") as f:
        f.write(ext_content)

    # Sign server cert with CA
    rc, _, err = run_cmd([
        "openssl", "x509", "-req",
        "-days", str(days),
        "-sha256",
        "-in", csr_file,
        "-CA", ca_cert,
        "-CAkey", ca_key,
        "-CAcreateserial",
        "-out", server_cert,
        "-extfile", ext_file,
    ])
    if rc != 0:
        raise RuntimeError(f"Failed to sign server certificate: {err}")

    # Cleanup temporary CSR and extfile
    if os.path.exists(csr_file):
        os.remove(csr_file)
    if os.path.exists(ext_file):
        os.remove(ext_file)

    os.chmod(server_key, 0o400)
    os.chmod(server_cert, 0o444)
    return server_cert, server_key


def generate_client_cert(
    output_dir: str,
    ca_cert: str,
    ca_key: str,
    days: int = 365,
) -> Tuple[str, str]:
    """
    Generates client private key and certificate signed by CA.
    Returns (client_cert_path, client_key_path).
    """
    os.makedirs(output_dir, exist_ok=True)
    client_key = os.path.join(output_dir, "key.pem")
    client_cert = os.path.join(output_dir, "cert.pem")
    csr_file = os.path.join(output_dir, "client.csr")

    # Generate client private key
    rc, _, err = run_cmd(["openssl", "genrsa", "-out", client_key, "4096"])
    if rc != 0:
        raise RuntimeError(f"Failed to generate client key: {err}")

    # Generate CSR
    rc, _, err = run_cmd([
        "openssl", "req", "-subj", "/CN=client",
        "-new",
        "-key", client_key,
        "-out", csr_file,
    ])
    if rc != 0:
        raise RuntimeError(f"Failed to generate client CSR: {err}")

    ext_file = os.path.join(output_dir, "extfile-client.cnf")
    with open(ext_file, "w") as f:
        f.write("extendedKeyUsage = clientAuth\n")

    # Sign client cert with CA
    rc, _, err = run_cmd([
        "openssl", "x509", "-req",
        "-days", str(days),
        "-sha256",
        "-in", csr_file,
        "-CA", ca_cert,
        "-CAkey", ca_key,
        "-CAcreateserial",
        "-out", client_cert,
        "-extfile", ext_file,
    ])
    if rc != 0:
        raise RuntimeError(f"Failed to sign client certificate: {err}")

    # Cleanup temporary CSR and extfile
    if os.path.exists(csr_file):
        os.remove(csr_file)
    if os.path.exists(ext_file):
        os.remove(ext_file)

    os.chmod(client_key, 0o400)
    os.chmod(client_cert, 0o444)
    return client_cert, client_key


def generate_pki_bundle(output_dir: str, sans: List[str]) -> Dict[str, str]:
    """
    Generates full PKI suite (CA, Server cert/key, Client cert/key)
    in the specified directory.
    """
    if not check_openssl():
        raise RuntimeError("OpenSSL is not installed on this system")

    ca_cert, ca_key = generate_ca(output_dir)
    server_cert, server_key = generate_server_cert(output_dir, ca_cert, ca_key, sans)
    client_cert, client_key = generate_client_cert(output_dir, ca_cert, ca_key)

    return {
        "ca_cert": ca_cert,
        "ca_key": ca_key,
        "server_cert": server_cert,
        "server_key": server_key,
        "client_cert": client_cert,
        "client_key": client_key,
    }
