import os
import tempfile
import unittest
from unittest.mock import MagicMock, patch

try:
    from generate_apt_repo import (
        format_size_mib,
        sanitize_description,
        parse_rpm_pkg_name,
        generate_apt_repo,
    )
    from generate_rpm_repo import (
        parse_rpm_arch,
        import_gpg_key_if_present,
        generate_rpm_repo,
    )
except ModuleNotFoundError:
    from tools.generate_apt_repo import (
        format_size_mib,
        sanitize_description,
        parse_rpm_pkg_name,
        generate_apt_repo,
    )
    from tools.generate_rpm_repo import (
        parse_rpm_arch,
        import_gpg_key_if_present,
        generate_rpm_repo,
    )


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

        desc_cs = "Cockpit plugin"
        self.assertEqual(sanitize_description("cockpit-code-server", desc_cs), "VS Code Server plugin for Cockpit")

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
        self.assertEqual(
            parse_rpm_pkg_name("code-server-4.139.1-amd64.rpm"),
            "code-server",
        )

    def test_parse_rpm_arch(self):
        self.assertEqual(parse_rpm_arch("cockpit-zfs-storage-1.0.0-1.noarch.rpm"), "noarch")
        self.assertEqual(parse_rpm_arch("code-server-4.139.1-amd64.rpm"), "x86_64")
        self.assertEqual(parse_rpm_arch("code-server-4.139.1-arm64.rpm"), "aarch64")

    @patch("subprocess.run")
    @patch.dict("os.environ", {"GPG_PRIVATE_KEY": "FAKE_KEY"})
    def test_rpm_gpg_import_present(self, mock_run):
        # Verify key import invocation when private key environment variable is present
        result = import_gpg_key_if_present()

        self.assertTrue(result)
        mock_run.assert_called_once_with(
            ["gpg", "--batch", "--yes", "--import"],
            input=b"FAKE_KEY",
            capture_output=True,
            check=True,
        )

    @patch.dict("os.environ", {}, clear=True)
    def test_rpm_gpg_import_absent(self):
        # Verify no-op and False returned when private key is absent
        result = import_gpg_key_if_present()

        self.assertFalse(result)

    @patch("subprocess.run")
    @patch("shutil.which", return_value=None)
    def test_rpm_repo_gpg_export(self, mock_which, mock_run):
        # Verify armored key export and repomd signing during repo generation
        with tempfile.TemporaryDirectory() as tmp_dir:
            rpm_dir = os.path.join(tmp_dir, "rpms")
            out_dir = os.path.join(tmp_dir, "out")
            os.makedirs(rpm_dir, exist_ok=True)

            mock_export = MagicMock(returncode=0, stdout=b"ARMORED_KEY")
            mock_keys = MagicMock(returncode=0, stdout="sec:rsa2048:...")
            mock_sign = MagicMock(returncode=0)

            def mock_side_effect(cmd, **kwargs):
                if "--export" in cmd:
                    return mock_export
                if "--list-secret-keys" in cmd:
                    return mock_keys
                return mock_sign

            mock_run.side_effect = mock_side_effect

            generate_rpm_repo(rpm_dir, out_dir)

            key_file = os.path.join(out_dir, "key.gpg")
            self.assertTrue(os.path.exists(key_file))
            with open(key_file, "rb") as f:
                self.assertEqual(f.read(), b"ARMORED_KEY")

    def test_apt_installer_plugins(self):
        # Verify install.sh supports positional arguments and defaults to all plugins
        with tempfile.TemporaryDirectory() as tmp_dir:
            deb_dir = os.path.join(tmp_dir, "debs")
            out_dir = os.path.join(tmp_dir, "out")
            os.makedirs(deb_dir, exist_ok=True)

            generate_apt_repo(deb_dir, out_dir)

            install_sh = os.path.join(out_dir, "install.sh")
            self.assertTrue(os.path.exists(install_sh))
            with open(install_sh, "r", encoding="utf-8") as f:
                content = f.read()

            self.assertIn('TARGET_PLUGINS="$*"', content)
            self.assertIn("cockpit-zfs-storage", content)
            self.assertIn("cockpit-file-sharing", content)
            self.assertIn("cockpit-container-manager", content)
            self.assertIn("cockpit-code-server", content)
            self.assertIn("apt-get install -y $TARGET_PLUGINS", content)

    def test_rpm_installer_plugins(self):
        # Verify install-rpm.sh supports positional arguments and defaults to all plugins
        with tempfile.TemporaryDirectory() as tmp_dir:
            rpm_dir = os.path.join(tmp_dir, "rpms")
            out_dir = os.path.join(tmp_dir, "out")
            os.makedirs(rpm_dir, exist_ok=True)

            generate_rpm_repo(rpm_dir, out_dir)

            install_rpm_sh = os.path.join(out_dir, "install-rpm.sh")
            self.assertTrue(os.path.exists(install_rpm_sh))
            with open(install_rpm_sh, "r", encoding="utf-8") as f:
                content = f.read()

            self.assertIn('TARGET_PLUGINS="$*"', content)
            self.assertIn("cockpit-zfs-storage", content)
            self.assertIn("cockpit-file-sharing", content)
            self.assertIn("cockpit-container-manager", content)
            self.assertIn("cockpit-code-server", content)
            self.assertIn("dnf install -y $TARGET_PLUGINS", content)


if __name__ == "__main__":
    unittest.main()

