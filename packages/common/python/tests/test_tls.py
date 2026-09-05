import os
import shutil
import tempfile
import unittest
from unittest.mock import patch

from cockpit_common.tls import (
    check_openssl,
    generate_ca,
    generate_server_cert,
    generate_client_cert,
    generate_pki_bundle,
)


class TestTlsGeneration(unittest.TestCase):
    def setUp(self):
        self.test_dir = tempfile.mkdtemp()

    def tearDown(self):
        if os.path.exists(self.test_dir):
            shutil.rmtree(self.test_dir)

    def test_check_openssl(self):
        # OpenSSL should be detected on host system
        self.assertTrue(check_openssl())

    def test_generate_ca(self):
        ca_cert, ca_key = generate_ca(self.test_dir)
        self.assertTrue(os.path.exists(ca_cert))
        self.assertTrue(os.path.exists(ca_key))
        with open(ca_cert, "r") as f:
            self.assertIn("BEGIN CERTIFICATE", f.read())
        with open(ca_key, "r") as f:
            self.assertIn("BEGIN PRIVATE KEY", f.read())

    def test_generate_server_and_client_certs(self):
        ca_cert, ca_key = generate_ca(self.test_dir)
        server_cert, server_key = generate_server_cert(
            self.test_dir, ca_cert, ca_key, ["192.168.1.50", "example.com"]
        )
        self.assertTrue(os.path.exists(server_cert))
        self.assertTrue(os.path.exists(server_key))

        client_cert, client_key = generate_client_cert(
            self.test_dir, ca_cert, ca_key
        )
        self.assertTrue(os.path.exists(client_cert))
        self.assertTrue(os.path.exists(client_key))

    def test_generate_pki_bundle(self):
        bundle = generate_pki_bundle(self.test_dir, ["10.0.0.1", "docker-host"])
        for k, p in bundle.items():
            self.assertTrue(os.path.exists(p), f"{k} path does not exist: {p}")

    @patch("cockpit_common.tls.run_cmd", return_value=(-1, "", "mock openssl error"))
    def test_openssl_failure_raises(self, _mock_cmd):
        with self.assertRaises(RuntimeError):
            generate_ca(self.test_dir)


if __name__ == "__main__":
    unittest.main()
