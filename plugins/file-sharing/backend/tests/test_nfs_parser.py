import tempfile
import os
import shutil
import unittest
from backend.nfs_parser import NfsParser

SAMPLE_EXPORTS = """
# Main Exports
/srv/nfs/public *(ro,sync,no_subtree_check)
/srv/nfs/secure 192.168.1.0/24(rw,sync,no_root_squash) 10.0.0.5(ro,async)

# <-- BEGIN ANSIBLE MANAGED nfs_cluster CONFIG -->
/tank/managed 10.0.0.0/8(rw,sync,no_subtree_check)
# <-- END ANSIBLE MANAGED nfs_cluster CONFIG -->
"""

class TestNfsParser(unittest.TestCase):
    def setUp(self):
        self.tmp_dir = tempfile.mkdtemp()
        self.main_file = os.path.join(self.tmp_dir, "exports")
        with open(self.main_file, "w") as f:
            f.write(SAMPLE_EXPORTS)
            
        self.exports_d = os.path.join(self.tmp_dir, "exports.d")
        os.makedirs(self.exports_d, exist_ok=True)
        self.cockpit_file = os.path.join(self.exports_d, "cockpit.exports")
        
        self.parser = NfsParser(
            main_exports_path=self.main_file,
            exports_d_dir=self.exports_d,
            cockpit_exports_file=self.cockpit_file
        )

    def tearDown(self):
        shutil.rmtree(self.tmp_dir)

    def test_parse_all_exports(self):
        exports = self.parser.parse_all()
        self.assertEqual(len(exports), 3)
        
        paths = {e["path"]: e for e in exports}
        self.assertIn("/srv/nfs/public", paths)
        self.assertIn("/srv/nfs/secure", paths)
        self.assertIn("/tank/managed", paths)
        
        # Check clients in /srv/nfs/secure
        secure_clients = paths["srv/nfs/secure".replace("srv", "/srv")]["clients"]
        self.assertEqual(len(secure_clients), 2)
        self.assertEqual(secure_clients[0]["host"], "192.168.1.0/24")
        self.assertFalse(secure_clients[0]["read_only"])
        self.assertFalse(secure_clients[0]["root_squash"])
        
        # Check Ansible managed
        self.assertTrue(paths["/tank/managed"]["is_managed"])
        self.assertEqual(paths["/tank/managed"]["managed_by"], "nfs_cluster")

    def test_save_new_cockpit_export(self):
        ok, msg = self.parser.save_export("/tank/new_export", [
            {"host": "192.168.10.0/24", "read_only": False, "sync": True, "no_subtree_check": True, "root_squash": True}
        ])
        self.assertTrue(ok)
        
        # Verify in cockpit file
        exports = self.parser.parse_all()
        paths = {e["path"]: e for e in exports}
        self.assertIn("/tank/new_export", paths)
        self.assertFalse(paths["/tank/new_export"]["is_managed"])

    def test_delete_cockpit_export(self):
        self.parser.save_export("/tank/temp", [{"host": "*", "read_only": True}])
        ok, msg = self.parser.delete_export("/tank/temp")
        self.assertTrue(ok)
        
        exports = self.parser.parse_all()
        paths = [e["path"] for e in exports]
        self.assertNotIn("/tank/temp", paths)

    def test_prevent_delete_ansible_managed_export(self):
        ok, msg = self.parser.delete_export("/tank/managed")
        self.assertFalse(ok)
        self.assertIn("managed by Ansible", msg)

    def test_save_export_edge_cases(self):
        # Invalid path
        ok, msg = self.parser.save_export("invalid_path", [])
        self.assertFalse(ok)

        # Overwrite managed export
        ok, msg = self.parser.save_export("/tank/managed", [])
        self.assertFalse(ok)

        # Custom options
        ok, msg = self.parser.save_export("/tank/custom", [{
            "host": "10.0.0.1",
            "read_only": True,
            "sync": False,
            "no_subtree_check": False,
            "root_squash": False,
            "all_squash": True,
            "anonuid": 1001,
            "anongid": 1001,
        }])
        self.assertTrue(ok)

        # Update existing export in place
        ok, msg = self.parser.save_export("/tank/custom", [{"host": "10.0.0.2", "read_only": False}])
        self.assertTrue(ok)

    def test_reject_newlines_in_path(self):
        ok, _ = self.parser.save_export("/tank/path\nnewline", [{"host": "*"}])
        self.assertFalse(ok)
        ok, _ = self.parser.save_export("/tank/path\rreturn", [{"host": "*"}])
        self.assertFalse(ok)

    def test_reject_invalid_host(self):
        bad_hosts = ["*(rw,no_root_squash)\n/", "host with spaces", "host(parens)", "host\nname"]
        for host in bad_hosts:
            ok, _ = self.parser.save_export("/tank/sec_test", [{"host": host}])
            self.assertFalse(ok)

    def test_reject_invalid_options(self):
        bad_opts = [["rw\nno_root_squash"], ["rw;rm -rf /"], ["ro", "bad opt"]]
        for opts in bad_opts:
            ok, _ = self.parser.save_export("/tank/sec_test", [{"host": "*", "options": opts}])
            self.assertFalse(ok)

    def test_validate_anonuid_anongid(self):
        ok, _ = self.parser.save_export("/tank/sec_test", [{"host": "*", "anonuid": -1}])
        self.assertFalse(ok)
        ok, _ = self.parser.save_export("/tank/sec_test", [{"host": "*", "anongid": -10}])
        self.assertFalse(ok)
        ok, _ = self.parser.save_export("/tank/sec_test", [{"host": "*", "anonuid": "invalid"}])
        self.assertFalse(ok)
        ok, _ = self.parser.save_export("/tank/sec_test", [{"host": "*", "anongid": "1000\nno_root_squash"}])
        self.assertFalse(ok)
        ok, _ = self.parser.save_export("/tank/sec_test", [{"host": "*", "anonuid": 0, "anongid": 65534}])
        self.assertTrue(ok)

    def test_export_path_with_spaces(self):
        path = "/srv/my share"
        ok, _ = self.parser.save_export(path, [{"host": "*", "read_only": True}])
        self.assertTrue(ok)

        exports = self.parser.parse_all()
        paths = {e["path"]: e for e in exports}
        self.assertIn(path, paths)
        self.assertEqual(paths[path]["path"], path)

    def test_delete_export_with_spaces(self):
        path = "/srv/my space path"
        self.parser.save_export(path, [{"host": "*"}])
        ok, _ = self.parser.delete_export(path)
        self.assertTrue(ok)
        exports = self.parser.parse_all()
        self.assertNotIn(path, [e["path"] for e in exports])

    def test_parse_line_edge_cases(self):
        self.assertIsNone(self.parser.parse_line("", "file", False, ""))
        self.assertIsNone(self.parser.parse_line("# comment", "file", False, ""))
        res = self.parser.parse_line("/export/path", "file", False, "")
        self.assertIsNotNone(res)
        self.assertEqual(res["clients"][0]["host"], "*")

    def test_nfs_global_config(self):
        from backend.nfs_parser import get_nfs_global, save_nfs_global
        nfs_conf = os.path.join(self.tmp_dir, "nfs.conf")

        # Initial read on empty/non-existent
        cfg = get_nfs_global(nfs_conf)
        self.assertEqual(cfg["threads"], 8)
        self.assertTrue(cfg["vers3"])

        # Save new configuration
        new_settings = {
            "threads": 16,
            "vers3": True,
            "vers4": True,
            "vers4_1": True,
            "vers4_2": False,
            "grace_time": 60,
            "lease_time": 60,
            "port": 2049,
        }
        ok, msg = save_nfs_global(new_settings, nfs_conf)
        self.assertTrue(ok)

        # Read back
        loaded = get_nfs_global(nfs_conf)
        self.assertEqual(loaded["threads"], 16)
        self.assertTrue(loaded["vers3"])
        self.assertTrue(loaded["vers4_1"])
        self.assertFalse(loaded["vers4_2"])
        self.assertEqual(loaded["grace_time"], 60)


if __name__ == "__main__":
    unittest.main()

