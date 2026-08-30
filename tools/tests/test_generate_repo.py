import unittest
from tools.generate_apt_repo import format_size_mib, sanitize_description, parse_rpm_pkg_name


class TestGenerateRepo(unittest.TestCase):
    def test_format_size_mib(self):
        self.assertEqual(format_size_mib(1024 * 1024), "1.0 MiB")
        self.assertEqual(format_size_mib(1572864), "1.5 MiB")
        self.assertEqual(format_size_mib(786432), "0.8 MiB")

    def test_sanitize_description(self):
        desc = "Advanced OpenZFS storage manager for Cockpit.\\n Manage ZFS pools, datasets, zvols, snapshots"
        self.assertEqual(sanitize_description("cockpit-zfs-storage", desc), "Advanced OpenZFS storage manager for Cockpit")

        desc_newlines = "SMB and NFS sharing plugin.\\nSecond line with details"
        self.assertEqual(sanitize_description("cockpit-file-sharing", desc_newlines), "SMB and NFS sharing plugin")

        desc_default = "Cockpit plugin"
        self.assertEqual(sanitize_description("cockpit-zfs-storage", desc_default), "OpenZFS storage management plugin for Cockpit")

    def test_parse_rpm_pkg_name(self):
        self.assertEqual(
            parse_rpm_pkg_name("cockpit-zfs-storage-0.5.0-1.noarch.rpm"),
            "cockpit-zfs-storage",
        )
        self.assertEqual(
            parse_rpm_pkg_name("cockpit-file-sharing-0.1.0-1.noarch.rpm"),
            "cockpit-file-sharing",
        )


if __name__ == "__main__":
    unittest.main()
