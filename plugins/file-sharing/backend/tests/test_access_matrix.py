import unittest
from backend.access_matrix import calculate_smb_user_matrix, calculate_nfs_client_matrix

class TestAccessMatrix(unittest.TestCase):
    def test_smb_user_matrix_calculation(self):
        shares = [
            {
                "name": "public",
                "path": "/srv/public",
                "read_only": False,
                "guest_ok": True,
                "valid_users": "",
                "write_list": "",
                "invalid_users": "",
            },
            {
                "name": "finance",
                "path": "/srv/finance",
                "read_only": True,
                "guest_ok": False,
                "valid_users": "alice bob",
                "write_list": "alice",
                "invalid_users": "charlie",
            },
            {
                "name": "secret",
                "path": "/srv/secret",
                "read_only": True,
                "guest_ok": False,
                "valid_users": "admin",
                "write_list": "admin",
                "invalid_users": "",
            }
        ]

        users = [
            {"username": "alice", "full_name": "Alice Admin", "is_enabled": True},
            {"username": "bob", "full_name": "Bob Buyer", "is_enabled": True},
            {"username": "charlie", "full_name": "Charlie Guest", "is_enabled": True},
        ]

        matrix = calculate_smb_user_matrix(shares, users)
        self.assertEqual(len(matrix), 3)

        # Alice: public=read_write, finance=read_write (in write_list), secret=denied (not in valid_users)
        alice_shares = {s["share_name"]: s["access"] for s in matrix[0]["shares"]}
        self.assertEqual(alice_shares["public"], "read_write")
        self.assertEqual(alice_shares["finance"], "read_write")
        self.assertEqual(alice_shares["secret"], "denied")

        # Bob: public=read_write, finance=read_only (in valid_users, read_only=True), secret=denied
        bob_shares = {s["share_name"]: s["access"] for s in matrix[1]["shares"]}
        self.assertEqual(bob_shares["public"], "read_write")
        self.assertEqual(bob_shares["finance"], "read_only")
        self.assertEqual(bob_shares["secret"], "denied")

        # Charlie: public=read_write, finance=denied (in invalid_users), secret=denied
        charlie_shares = {s["share_name"]: s["access"] for s in matrix[2]["shares"]}
        self.assertEqual(charlie_shares["public"], "read_write")
        self.assertEqual(charlie_shares["finance"], "denied")
        self.assertEqual(charlie_shares["secret"], "denied")

    def test_nfs_client_matrix_calculation(self):
        exports = [
            {
                "path": "/tank/data",
                "clients": [
                    {"host": "192.168.1.0/24", "read_only": False, "sync": True, "root_squash": True, "all_squash": False, "no_subtree_check": True, "options": ["rw", "sync"]},
                    {"host": "*", "read_only": True, "sync": True, "root_squash": True, "all_squash": False, "no_subtree_check": True, "options": ["ro", "sync"]}
                ],
                "is_managed": False,
                "managed_by": ""
            },
            {
                "path": "/tank/backup",
                "clients": [
                    {"host": "192.168.1.0/24", "read_only": True, "sync": True, "root_squash": True, "all_squash": False, "no_subtree_check": True, "options": ["ro", "sync"]}
                ],
                "is_managed": True,
                "managed_by": "backup_job"
            }
        ]

        client_map = calculate_nfs_client_matrix(exports)
        self.assertEqual(len(client_map), 2)

        # 192.168.1.0/24 should have 2 exports
        subnet_entry = next(c for c in client_map if c["client"] == "192.168.1.0/24")
        self.assertEqual(subnet_entry["exports_count"], 2)
        self.assertFalse(subnet_entry["exports"][0]["read_only"])
        self.assertTrue(subnet_entry["exports"][1]["read_only"])

if __name__ == "__main__":
    unittest.main()
