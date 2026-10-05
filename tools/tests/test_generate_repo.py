import io
import os
import tarfile
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


def _create_dummy_deb(path: str, name: str, version: str, arch: str, desc: str = "Cockpit plugin"):
    # Generate minimal valid deb ar-archive with control.tar.gz
    ctrl_text = f"Package: {name}\nVersion: {version}\nArchitecture: {arch}\nDescription: {desc}\n"
    ctrl_io = io.BytesIO()
    with tarfile.open(fileobj=ctrl_io, mode="w:gz") as tar:
        data = ctrl_text.encode("utf-8")
        ti = tarfile.TarInfo("control")
        ti.size = len(data)
        tar.addfile(ti, io.BytesIO(data))
    ctrl_bytes = ctrl_io.getvalue()

    with open(path, "wb") as f:
        f.write(b"!<arch>\n")
        deb_bin = b"2.0\n"
        f.write(f"{'debian-binary':<16}{'0':<12}{'0':<6}{'0':<6}{'100644':<8}{len(deb_bin):<10}`\n".encode("ascii"))
        f.write(deb_bin)
        f.write(f"{'control.tar.gz':<16}{'0':<12}{'0':<6}{'0':<6}{'100644':<8}{len(ctrl_bytes):<10}`\n".encode("ascii"))
        f.write(ctrl_bytes)
        if len(ctrl_bytes) % 2 != 0:
            f.write(b"\n")


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

    def test_table_has_arch_column(self):
        # Verify Architecture column header and arch badge in generated index.html
        with tempfile.TemporaryDirectory() as tmp_dir:
            deb_dir = os.path.join(tmp_dir, "debs")
            out_dir = os.path.join(tmp_dir, "out")
            os.makedirs(deb_dir, exist_ok=True)

            deb_path = os.path.join(deb_dir, "cockpit-zfs-storage_1.0.0_all.deb")
            _create_dummy_deb(deb_path, "cockpit-zfs-storage", "1.0.0", "all")

            generate_apt_repo(deb_dir, out_dir)

            index_path = os.path.join(out_dir, "index.html")
            self.assertTrue(os.path.exists(index_path))
            with open(index_path, "r", encoding="utf-8") as f:
                content = f.read()

            self.assertTrue(
                "<th>Arch</th>" in content or "<th>Architecture</th>" in content,
                "Expected Arch or Architecture column header in table",
            )
            self.assertIn('<span class="arch-badge">all</span>', content)

    def test_rpm_arch_matching(self):
        # Verify amd64 and arm64 packages link to their respective RPM counterparts
        with tempfile.TemporaryDirectory() as tmp_dir:
            deb_dir = os.path.join(tmp_dir, "debs")
            rpm_dir = os.path.join(tmp_dir, "rpms")
            out_dir = os.path.join(tmp_dir, "out")
            os.makedirs(deb_dir, exist_ok=True)
            os.makedirs(rpm_dir, exist_ok=True)

            deb_amd64 = os.path.join(deb_dir, "cockpit-code-server_1.0.0_amd64.deb")
            deb_arm64 = os.path.join(deb_dir, "cockpit-code-server_1.0.0_arm64.deb")
            _create_dummy_deb(deb_amd64, "cockpit-code-server", "1.0.0", "amd64")
            _create_dummy_deb(deb_arm64, "cockpit-code-server", "1.0.0", "arm64")

            rpm_x86 = os.path.join(rpm_dir, "cockpit-code-server-1.0.0-1.x86_64.rpm")
            rpm_arm = os.path.join(rpm_dir, "cockpit-code-server-1.0.0-1.aarch64.rpm")
            with open(rpm_x86, "wb") as f:
                f.write(b"rpm_x86_data")
            with open(rpm_arm, "wb") as f:
                f.write(b"rpm_arm_data")

            generate_apt_repo(deb_dir, out_dir, rpm_dir=rpm_dir)

            index_path = os.path.join(out_dir, "index.html")
            self.assertTrue(os.path.exists(index_path))
            with open(index_path, "r", encoding="utf-8") as f:
                content = f.read()

            self.assertIn("cockpit-code-server-1.0.0-1.x86_64.rpm", content)
            self.assertIn("cockpit-code-server-1.0.0-1.aarch64.rpm", content)

            rows = content.split("<tr>")
            for row in rows:
                if 'class="arch-badge">amd64<' in row:
                    self.assertIn("x86_64.rpm", row)
                    self.assertNotIn("aarch64.rpm", row)
                if 'class="arch-badge">arm64<' in row:
                    self.assertIn("aarch64.rpm", row)
                    self.assertNotIn("x86_64.rpm", row)

    def test_plugin_sorting(self):
        # Verify cockpit-* plugins are sorted before third-party packages
        with tempfile.TemporaryDirectory() as tmp_dir:
            deb_dir = os.path.join(tmp_dir, "debs")
            out_dir = os.path.join(tmp_dir, "out")
            os.makedirs(deb_dir, exist_ok=True)

            deb_third_party = os.path.join(deb_dir, "aaa-dependency_4.0.0_amd64.deb")
            deb_plugin = os.path.join(deb_dir, "cockpit-zfs-storage_1.0.0_all.deb")
            _create_dummy_deb(deb_third_party, "aaa-dependency", "4.0.0", "amd64")
            _create_dummy_deb(deb_plugin, "cockpit-zfs-storage", "1.0.0", "all")

            generate_apt_repo(deb_dir, out_dir)

            index_path = os.path.join(out_dir, "index.html")
            self.assertTrue(os.path.exists(index_path))
            with open(index_path, "r", encoding="utf-8") as f:
                content = f.read()

            tbody = content[content.find("<tbody>"):content.find("</tbody>")]
            idx_plugin = tbody.find("cockpit-zfs-storage")
            idx_third_party = tbody.find("aaa-dependency")
            self.assertNotEqual(idx_plugin, -1)
            self.assertNotEqual(idx_third_party, -1)
            self.assertLess(idx_plugin, idx_third_party)


if __name__ == "__main__":
    unittest.main()

