import os
import tempfile
import unittest
from unittest.mock import MagicMock, patch

try:
    import download_upstream_packages as dup
except ModuleNotFoundError:
    from tools import download_upstream_packages as dup


class TestDownloadUpstreamPackages(unittest.TestCase):
    def test_find_configs(self):
        configs = dup.find_configs(".")
        self.assertTrue(len(configs) > 0)
        self.assertTrue(any("code-server" in c for c in configs))

    def test_build_asset_list_interpolation_and_arch(self):
        sample_config = {
            "packages": [
                {
                    "name": "caddy",
                    "version": "2.11.7",
                    "archs": ["amd64", "arm64"],
                    "assets": [
                        {
                            "type": "tar.gz",
                            "filename": "caddy_${version}_linux_${arch}.tar.gz",
                            "url": "https://example.com/v${version}/caddy_${version}_linux_${arch}.tar.gz",
                        }
                    ],
                }
            ]
        }
        assets = dup.build_asset_list(sample_config)
        self.assertEqual(len(assets), 2)

        type1, url1, file1 = assets[0]
        self.assertEqual(type1, "tar.gz")
        self.assertEqual(file1, "caddy_2.11.7_linux_amd64.tar.gz")
        self.assertEqual(url1, "https://example.com/v2.11.7/caddy_2.11.7_linux_amd64.tar.gz")

        type2, url2, file2 = assets[1]
        self.assertEqual(type2, "tar.gz")
        self.assertEqual(file2, "caddy_2.11.7_linux_arm64.tar.gz")

        # Test CLI version override
        overridden = dup.build_asset_list(sample_config, {"caddy": "3.0.0"})
        self.assertEqual(overridden[0][2], "caddy_3.0.0_linux_amd64.tar.gz")

    def test_get_target_dir(self):
        deb_dir = "/tmp/debs"
        rpm_dir = "/tmp/rpms"
        archive_dir = "/tmp/archives"

        self.assertEqual(dup.get_target_dir("deb", deb_dir, rpm_dir, archive_dir), deb_dir)
        self.assertEqual(dup.get_target_dir("rpm", deb_dir, rpm_dir, archive_dir), rpm_dir)
        self.assertEqual(dup.get_target_dir("tar.gz", deb_dir, rpm_dir, archive_dir), archive_dir)
        self.assertEqual(dup.get_target_dir("binary", deb_dir, rpm_dir, archive_dir), archive_dir)

    def test_parse_overrides(self):
        raw = ["tool-a=1.0.0", "tool-b=2.5.1", "invalid_entry"]
        parsed = dup.parse_overrides(raw)
        self.assertEqual(parsed, {"tool-a": "1.0.0", "tool-b": "2.5.1"})

    def test_download_file(self):
        mock_resp = MagicMock()
        mock_resp.read.side_effect = [b"chunk1", b"chunk2", b""]
        mock_resp.__enter__.return_value = mock_resp

        with patch.object(dup.urllib.request, "urlopen", return_value=mock_resp), \
             tempfile.TemporaryDirectory() as tmpdir:
            dest_file = os.path.join(tmpdir, "test.tar.gz")
            dup.download_file("https://example.com/test.tar.gz", dest_file)
            self.assertTrue(os.path.exists(dest_file))
            with open(dest_file, "rb") as f:
                self.assertEqual(f.read(), b"chunk1chunk2")

    def test_sync_assets(self):
        def side_effect(url, dest):
            with open(dest, "wb") as f:
                f.write(b"dummy")

        with patch.object(dup, "download_file", side_effect=side_effect) as mock_download, \
             tempfile.TemporaryDirectory() as tmpdir:
            deb_dir = os.path.join(tmpdir, "debs")
            rpm_dir = os.path.join(tmpdir, "rpms")
            archive_dir = os.path.join(tmpdir, "archives")

            assets = [
                ("deb", "https://example.com/a.deb", "a.deb"),
                ("rpm", "https://example.com/b.rpm", "b.rpm"),
                ("tar.gz", "https://example.com/c.tar.gz", "c.tar.gz"),
            ]
            dup.sync_assets(assets, deb_dir, rpm_dir, archive_dir)
            self.assertEqual(mock_download.call_count, 3)
            self.assertTrue(os.path.isfile(os.path.join(archive_dir, "c.tar.gz")))


if __name__ == "__main__":
    unittest.main()
