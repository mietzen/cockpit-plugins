import os
import subprocess
import tempfile
import unittest
from unittest.mock import patch

try:
    import verify_release_digests as vrd
except ModuleNotFoundError:
    from tools import verify_release_digests as vrd


class TestVerifyReleaseDigests(unittest.TestCase):
    def test_cli_help(self):
        res = subprocess.run(["python3", "tools/verify_release_digests.py", "--help"], capture_output=True, text=True)
        self.assertEqual(res.returncode, 0)
        self.assertIn("Verify and gate release packages", res.stdout)

    def test_parse_pkg_info(self):
        # Deb parsing
        pkg, ver = vrd.parse_pkg_info("cockpit-zfs-storage_0.6.1_all.deb")
        self.assertEqual(pkg, "zfs-storage")
        self.assertEqual(ver, "0.6.1")

        pkg, ver = vrd.parse_pkg_info("cockpit-file-sharing_0.2.1_all.deb")
        self.assertEqual(pkg, "file-sharing")
        self.assertEqual(ver, "0.2.1")

        # RPM parsing
        pkg, ver = vrd.parse_pkg_info("cockpit-container-manager-0.2.1-1.noarch.rpm")
        self.assertEqual(pkg, "container-manager")
        self.assertEqual(ver, "0.2.1")

        # Invalid
        pkg, ver = vrd.parse_pkg_info("invalid-file.txt")
        self.assertEqual(pkg, "")
        self.assertEqual(ver, "")

    def test_discover_plugins(self):
        with tempfile.TemporaryDirectory() as repo_root, \
             tempfile.TemporaryDirectory() as deb_dir, \
             tempfile.TemporaryDirectory() as rpm_dir:

            plugins_dir = os.path.join(repo_root, "plugins")
            os.makedirs(os.path.join(plugins_dir, "zfs-storage"))
            os.makedirs(os.path.join(plugins_dir, "custom-plugin"))

            with open(os.path.join(deb_dir, "cockpit-file-sharing_0.2.1_all.deb"), "w") as f:
                f.write("test")

            discovered = vrd.discover_plugins(deb_dir, rpm_dir, repo_root=repo_root)
            self.assertIn("zfs-storage", discovered)
            self.assertIn("custom-plugin", discovered)
            self.assertIn("file-sharing", discovered)

    def test_find_tag_semver(self):
        tags = [
            "zfs-storage-v0.6.0",
            "zfs-storage-v0.6.10",
            "zfs-storage-v0.6.2",
            "file-sharing-v0.2.1",
        ]
        self.assertEqual(vrd.find_latest_tag("zfs-storage", tags), "zfs-storage-v0.6.10")
        self.assertEqual(vrd.find_latest_tag("file-sharing", tags), "file-sharing-v0.2.1")
        self.assertIsNone(vrd.find_latest_tag("non-existent", tags))

    def test_is_active_target(self):
        self.assertTrue(vrd.is_active_tag_target("zfs-storage", "zfs-storage-v0.6.1"))
        self.assertFalse(vrd.is_active_tag_target("file-sharing", "zfs-storage-v0.6.1"))
        self.assertTrue(vrd.is_active_tag_target("zfs-storage", "v1.0.0"))
        self.assertTrue(vrd.is_active_tag_target("file-sharing", "v1.0.0"))
        self.assertFalse(vrd.is_active_tag_target("zfs-storage", None))

    def test_prune_mismatched(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            file1 = os.path.join(tmpdir, "cockpit-zfs-storage_0.5.0_all.deb")
            file2 = os.path.join(tmpdir, "cockpit-zfs-storage_0.6.1_all.deb")
            file3 = os.path.join(tmpdir, "cockpit-file-sharing_0.2.1_all.deb")
            with open(file1, "w") as f:
                f.write("test")
            with open(file2, "w") as f:
                f.write("test")
            with open(file3, "w") as f:
                f.write("test")

            vrd.prune_mismatched("zfs-storage", tmpdir, ".deb", {"cockpit-zfs-storage_0.6.1_all.deb"})
            self.assertFalse(os.path.exists(file1))
            self.assertTrue(os.path.exists(file2))
            self.assertTrue(os.path.exists(file3))

    def test_compute_sha256(self):
        with tempfile.NamedTemporaryFile(delete=False) as f:
            f.write(b"hello world\n")
            f_path = f.name

        try:
            h = vrd.compute_sha256(f_path)
            self.assertEqual(h, "a948904f2f0f479b8f8197694b30184b0d2ed1c1cd2a1ec0fb85d299a192a447")
        finally:
            if os.path.exists(f_path):
                os.remove(f_path)

    def test_branch_discards_unrel(self):
        with tempfile.TemporaryDirectory() as deb_dir, tempfile.TemporaryDirectory() as rpm_dir:
            # Stale unreleased version
            stale_deb = os.path.join(deb_dir, "cockpit-zfs-storage_0.7.0-dev_all.deb")
            with open(stale_deb, "wb") as f:
                f.write(b"unreleased-dev-content")

            expected_hash = "90c326e4d367b5af40dd5eb4d866eadd459017062661fffe215a899ec71a5a8b"

            def fake_download(tag, name, path):
                with open(path, "wb") as f:
                    f.write(b"official-release-content")
                return True

            with patch.object(vrd, "fetch_release_tags", return_value=["zfs-storage-v0.6.1"]), \
                 patch.object(vrd, "fetch_release_assets", return_value={"cockpit-zfs-storage_0.6.1_all.deb": expected_hash}), \
                 patch.object(vrd, "download_asset", side_effect=fake_download) as mock_dl, \
                 patch.object(vrd, "compute_sha256", return_value=expected_hash):

                success = vrd.sync_packages(
                    deb_dir=deb_dir,
                    rpm_dir=rpm_dir,
                    trigger_mode=vrd.TriggerType.BRANCH,
                    current_tag=None,
                    plugins=["zfs-storage"],
                )

            self.assertTrue(success)
            self.assertTrue(mock_dl.called)
            # Stale unreleased version must be pruned
            self.assertFalse(os.path.exists(stale_deb))
            # Official downloaded release package must exist
            self.assertTrue(os.path.exists(os.path.join(deb_dir, "cockpit-zfs-storage_0.6.1_all.deb")))

    def test_branch_cleans_no_rel(self):
        with tempfile.TemporaryDirectory() as deb_dir, tempfile.TemporaryDirectory() as rpm_dir:
            unreleased_deb = os.path.join(deb_dir, "cockpit-unknown_0.1.0_all.deb")
            with open(unreleased_deb, "wb") as f:
                f.write(b"unreleased-content")

            with patch.object(vrd, "fetch_release_tags", return_value=["zfs-storage-v0.6.1"]):
                success = vrd.sync_packages(
                    deb_dir=deb_dir,
                    rpm_dir=rpm_dir,
                    trigger_mode=vrd.TriggerType.BRANCH,
                    current_tag=None,
                    plugins=["unknown"],
                )

            self.assertTrue(success)
            self.assertFalse(os.path.exists(unreleased_deb))

    def test_tag_keeps_artifact(self):
        with tempfile.TemporaryDirectory() as deb_dir, tempfile.TemporaryDirectory() as rpm_dir:
            deb_path = os.path.join(deb_dir, "cockpit-zfs-storage_0.6.1_all.deb")
            with open(deb_path, "wb") as f:
                f.write(b"new-tagged-build-content")

            with patch.object(vrd, "fetch_release_tags", return_value=[]), \
                 patch.object(vrd, "download_asset") as mock_dl:

                success = vrd.sync_packages(
                    deb_dir=deb_dir,
                    rpm_dir=rpm_dir,
                    trigger_mode=vrd.TriggerType.TAG,
                    current_tag="zfs-storage-v0.6.1",
                    plugins=["zfs-storage"],
                )

            self.assertTrue(success)
            mock_dl.assert_not_called()
            self.assertTrue(os.path.exists(deb_path))


if __name__ == "__main__":
    unittest.main()
