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

    def test_build_asset_list_interpolation(self):
        sample_config = {
            "packages": [
                {
                    "name": "my-tool",
                    "version": "1.2.3",
                    "assets": [
                        {
                            "type": "deb",
                            "filename": "my-tool_${version}_amd64.deb",
                            "url": "https://example.com/v${version}/my-tool_${version}_amd64.deb",
                        },
                        {
                            "type": "rpm",
                            "filename": "my-tool-${version}-amd64.rpm",
                            "url": "https://example.com/v${version}/my-tool-${version}-amd64.rpm",
                        },
                    ],
                }
            ]
        }
        assets = dup.build_asset_list(sample_config)
        self.assertEqual(len(assets), 2)
        deb_type, deb_url, deb_file = assets[0]
        self.assertEqual(deb_type, dup.AssetType.DEB)
        self.assertEqual(deb_file, "my-tool_1.2.3_amd64.deb")
        self.assertEqual(deb_url, "https://example.com/v1.2.3/my-tool_1.2.3_amd64.deb")

        # Test CLI version override
        overridden = dup.build_asset_list(sample_config, {"my-tool": "2.0.0"})
        self.assertEqual(overridden[0][2], "my-tool_2.0.0_amd64.deb")

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
            dest_file = os.path.join(tmpdir, "test.deb")
            dup.download_file("https://example.com/test.deb", dest_file)
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

            assets = [
                (dup.AssetType.DEB, "https://example.com/a.deb", "a.deb"),
                (dup.AssetType.RPM, "https://example.com/b.rpm", "b.rpm"),
            ]
            dup.sync_assets(assets, deb_dir, rpm_dir)
            self.assertEqual(mock_download.call_count, 2)


if __name__ == "__main__":
    unittest.main()
