import os
import shutil
import tempfile
import unittest
from unittest.mock import MagicMock, patch

import tls_manager
from tls_manager import disable_tls, get_client_bundle, get_tls_status, setup_tls


class TestTlsManager(unittest.TestCase):

    def setUp(self):
        self.test_dir = tempfile.mkdtemp()
        self.orig_docker_certs = tls_manager.DOCKER_CERTS_DIR
        self.orig_docker_dropin_dir = tls_manager.DOCKER_SYSTEMD_DROPIN_DIR
        self.orig_docker_dropin = tls_manager.DOCKER_DROPIN_FILE

        self.orig_podman_certs = tls_manager.PODMAN_CERTS_DIR
        self.orig_podman_dropin_dir = tls_manager.PODMAN_SYSTEMD_DROPIN_DIR
        self.orig_podman_dropin = tls_manager.PODMAN_DROPIN_FILE

        tls_manager.DOCKER_CERTS_DIR = os.path.join(self.test_dir, "docker-certs")
        tls_manager.DOCKER_SYSTEMD_DROPIN_DIR = os.path.join(self.test_dir, "docker-dropin")
        tls_manager.DOCKER_DROPIN_FILE = os.path.join(tls_manager.DOCKER_SYSTEMD_DROPIN_DIR, "override.conf")

        tls_manager.PODMAN_CERTS_DIR = os.path.join(self.test_dir, "podman-certs")
        tls_manager.PODMAN_SYSTEMD_DROPIN_DIR = os.path.join(self.test_dir, "podman-dropin")
        tls_manager.PODMAN_DROPIN_FILE = os.path.join(tls_manager.PODMAN_SYSTEMD_DROPIN_DIR, "override.conf")

    def tearDown(self):
        tls_manager.DOCKER_CERTS_DIR = self.orig_docker_certs
        tls_manager.DOCKER_SYSTEMD_DROPIN_DIR = self.orig_docker_dropin_dir
        tls_manager.DOCKER_DROPIN_FILE = self.orig_docker_dropin

        tls_manager.PODMAN_CERTS_DIR = self.orig_podman_certs
        tls_manager.PODMAN_SYSTEMD_DROPIN_DIR = self.orig_podman_dropin_dir
        tls_manager.PODMAN_DROPIN_FILE = self.orig_podman_dropin
        if os.path.exists(self.test_dir):
            shutil.rmtree(self.test_dir)

    def test_get_tls_status_disabled(self):
        status = get_tls_status("docker")
        self.assertFalse(status["enabled"])
        self.assertFalse(status["certsExist"])
        self.assertEqual(status["port"], 2376)

    @patch("tls_manager.run_cmd")
    def test_get_tls_status_with_certs_and_sans(self, mock_run):
        os.makedirs(tls_manager.DOCKER_CERTS_DIR, exist_ok=True)
        for f in ["ca.pem", "server-cert.pem", "server-key.pem", "cert.pem", "key.pem"]:
            with open(os.path.join(tls_manager.DOCKER_CERTS_DIR, f), "w") as fp:
                fp.write("dummy")

        os.makedirs(tls_manager.DOCKER_SYSTEMD_DROPIN_DIR, exist_ok=True)
        with open(tls_manager.DOCKER_DROPIN_FILE, "w") as fp:
            fp.write("ExecStart=/usr/bin/dockerd -H tcp://0.0.0.0:2377")

        mock_run.side_effect = [
            (0, "notAfter=Dec 31 23:59:59 2030 GMT", ""),
            (0, "X509v3 Subject Alternative Name:\n    IP Address:192.168.40.142, DNS:test-host", ""),
        ]

        status = get_tls_status("docker")
        self.assertTrue(status["enabled"])
        self.assertTrue(status["certsExist"])
        self.assertEqual(status["port"], 2377)
        self.assertEqual(status["expiry"], "Dec 31 23:59:59 2030 GMT")
        self.assertIn("192.168.40.142", status["sans"])

    @patch("tls_manager.check_openssl", return_value=True)
    @patch("tls_manager.generate_pki_bundle")
    @patch("tls_manager.run_cmd", return_value=(0, "", ""))
    def test_setup_tls_success(self, mock_run, mock_pki, _mock_ssl):
        res = setup_tls(engine="docker", port=2376, sans=["192.168.40.142"])
        self.assertEqual(res["status"], "success")
        self.assertEqual(res["port"], 2376)
        self.assertTrue(os.path.exists(tls_manager.DOCKER_DROPIN_FILE))

        with open(tls_manager.DOCKER_DROPIN_FILE, "r") as f:
            content = f.read()
            self.assertIn("tcp://0.0.0.0:2376", content)
            self.assertIn("--tlsverify", content)

    @patch("tls_manager.check_openssl", return_value=False)
    def test_setup_tls_no_openssl(self, _mock_ssl):
        res = setup_tls(engine="docker")
        self.assertEqual(res["status"], "error")
        self.assertIn("OpenSSL CLI utility is required", res["error"])

    @patch("tls_manager.check_openssl", return_value=True)
    @patch("tls_manager.generate_pki_bundle", side_effect=Exception("PKI failure"))
    def test_setup_tls_pki_exception(self, _mock_pki, _mock_ssl):
        res = setup_tls(engine="docker")
        self.assertEqual(res["status"], "error")
        self.assertIn("PKI failure", res["error"])

    @patch("tls_manager.check_openssl", return_value=True)
    @patch("tls_manager.generate_pki_bundle")
    @patch("tls_manager.run_cmd", side_effect=[(0, "", ""), (1, "", "Service failed")])
    def test_setup_tls_restart_failure(self, _mock_run, _mock_pki, _mock_ssl):
        res = setup_tls(engine="docker")
        self.assertEqual(res["status"], "error")
        self.assertIn("Failed to restart", res["error"])

    @patch("tls_manager.check_openssl", return_value=True)
    @patch("tls_manager.generate_pki_bundle")
    @patch("tls_manager.run_cmd", return_value=(0, "", ""))
    def test_setup_tls_podman(self, mock_run, mock_pki, _mock_ssl):
        res = setup_tls(engine="podman", port=2376)
        self.assertEqual(res["status"], "success")

    @patch("tls_manager.run_cmd", return_value=(0, "", ""))
    def test_disable_tls(self, mock_run):
        os.makedirs(tls_manager.DOCKER_SYSTEMD_DROPIN_DIR, exist_ok=True)
        with open(tls_manager.DOCKER_DROPIN_FILE, "w") as f:
            f.write("mock dropin")

        res = disable_tls("docker")
        self.assertEqual(res["status"], "success")
        self.assertFalse(os.path.exists(tls_manager.DOCKER_DROPIN_FILE))

    @patch("tls_manager.run_cmd", side_effect=[(0, "", ""), (1, "", "Failed restart")])
    def test_disable_tls_restart_failure(self, mock_run):
        res = disable_tls("docker")
        self.assertEqual(res["status"], "error")
        self.assertIn("Failed to restart", res["error"])

    def test_get_client_bundle(self):
        # When certs missing
        res_missing = get_client_bundle("docker")
        self.assertEqual(res_missing["status"], "error")

        # When certs present
        os.makedirs(tls_manager.DOCKER_CERTS_DIR, exist_ok=True)
        with open(os.path.join(tls_manager.DOCKER_CERTS_DIR, "ca.pem"), "w") as f:
            f.write("MOCK CA CERT")
        with open(os.path.join(tls_manager.DOCKER_CERTS_DIR, "cert.pem"), "w") as f:
            f.write("MOCK CLIENT CERT")
        with open(os.path.join(tls_manager.DOCKER_CERTS_DIR, "key.pem"), "w") as f:
            f.write("MOCK CLIENT KEY")

        res = get_client_bundle("docker")
        self.assertEqual(res["status"], "success")
        self.assertEqual(res["ca"], "MOCK CA CERT")
        self.assertTrue(len(res["zipBase64"]) > 0)


if __name__ == "__main__":
    unittest.main()
