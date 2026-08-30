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

    def test_parse_line_edge_cases(self):
        self.assertIsNone(self.parser.parse_line("", "file", False, ""))
        self.assertIsNone(self.parser.parse_line("# comment", "file", False, ""))
        res = self.parser.parse_line("/export/path", "file", False, "")
        self.assertIsNotNone(res)
        self.assertEqual(res["clients"][0]["host"], "*")


if __name__ == "__main__":
    unittest.main()

