import tempfile
import os
import unittest
from backend.smb_parser import SmbParser

SAMPLE_SMB_CONF = """
# Global Configuration
[global]
   workgroup = WORKGROUP
   server string = Samba Server
   passdb backend = tdbsam
   security = user

# Public share
[public]
   path = /srv/samba/public
   comment = Public Share
   read only = no
   guest ok = yes
   browseable = yes

# <-- BEGIN ANSIBLE MANAGED storage CONFIG -->
[ansible_share]
   path = /tank/ansible_data
   comment = Managed by Ansible
   read only = yes
   valid users = alice bob
# <-- END ANSIBLE MANAGED storage CONFIG -->

[private_share]
   path = /srv/samba/private
   comment = Private Share
   read only = yes
   valid users = alice
   write list = admin
"""

class TestSmbParser(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.NamedTemporaryFile(mode="w+", delete=False)
        self.tmp.write(SAMPLE_SMB_CONF)
        self.tmp.close()
        self.parser = SmbParser(config_path=self.tmp.name)

    def tearDown(self):
        if os.path.exists(self.tmp.name):
            os.unlink(self.tmp.name)

    def test_parse_global_and_shares(self):
        data = self.parser.parse()
        self.assertEqual(data["global"]["workgroup"], "WORKGROUP")
        self.assertEqual(data["global"]["passdb backend"], "tdbsam")
        self.assertEqual(len(data["shares"]), 3)

    def test_ansible_managed_block_detection(self):
        data = self.parser.parse()
        shares = {s["name"]: s for s in data["shares"]}
        
        self.assertFalse(shares["public"]["is_managed"])
        self.assertTrue(shares["ansible_share"]["is_managed"])
        self.assertEqual(shares["ansible_share"]["managed_by"], "storage")
        self.assertFalse(shares["private_share"]["is_managed"])

    def test_save_new_share(self):
        ok, msg = self.parser.save_share({
            "name": "new_share",
            "path": "/srv/new",
            "comment": "Brand New Share",
            "read_only": False,
            "guest_ok": False,
            "valid_users": "alice"
        })
        self.assertTrue(ok)
        
        # Verify in parsed output
        data = self.parser.parse()
        shares = {s["name"]: s for s in data["shares"]}
        self.assertIn("new_share", shares)
        self.assertEqual(shares["new_share"]["path"], "/srv/new")
        self.assertFalse(shares["new_share"]["read_only"])

    def test_prevent_editing_ansible_managed_share(self):
        ok, msg = self.parser.save_share({
            "name": "ansible_share",
            "path": "/tampered/path",
        })
        self.assertFalse(ok)
        self.assertIn("managed by Ansible", msg)

    def test_delete_share(self):
        ok, msg = self.parser.delete_share("public")
        self.assertTrue(ok)
        data = self.parser.parse()
        shares = [s["name"] for s in data["shares"]]
        self.assertNotIn("public", shares)

    def test_prevent_deleting_ansible_managed_share(self):
        ok, msg = self.parser.delete_share("ansible_share")
        self.assertFalse(ok)
        self.assertIn("managed by Ansible", msg)

    def test_save_global_settings(self):
        ok, msg = self.parser.save_global({
            "workgroup": "MYGROUP",
            "server string": "Updated Server",
        })
        self.assertTrue(ok)
        data = self.parser.parse()
        self.assertEqual(data["global"]["workgroup"], "MYGROUP")
        self.assertEqual(data["global"]["server string"], "Updated Server")

    def test_save_share_with_all_properties(self):
        # Empty name failure
        ok, msg = self.parser.save_share({"name": ""})
        self.assertFalse(ok)

        # Full properties update
        ok, msg = self.parser.save_share({
            "name": "public",
            "path": "/srv/public_new",
            "comment": "New Comment",
            "read_only": True,
            "browseable": False,
            "guest_ok": True,
            "valid_users": "user1",
            "write_list": "user2",
            "read_list": "user3",
            "invalid_users": "baduser",
            "force_user": "nobody",
            "force_group": "nogroup",
            "create_mask": "0644",
            "directory_mask": "0755",
            "vfs_objects": "acl_xattr",
        })
        self.assertTrue(ok)

    def test_delete_nonexistent_share(self):
        ok, msg = self.parser.delete_share("nonexistent_share_name")
        self.assertFalse(ok)


if __name__ == "__main__":
    unittest.main()

