import os
import unittest
from unittest.mock import MagicMock, patch

try:
    import download_upstream_packages as dup
except ModuleNotFoundError:
    from tools import download_upstream_packages as dup


class TestDownloadUpstreamPackages(unittest.TestCase):
    def test_get_default_version(self):
        version = dup.get_default_version()
        self.assertTrue(len(version) > 0)
        self.assertRegex(version, r"^\d+\.\d+\.\d+")

    def test_get_upstream_urls(self):
        urls = dup.get_upstream_urls("4.139.1")
        self.assertEqual(len(urls), 4)

        filenames = [f for _, _, f in urls]
        self.assertIn("code-server_4.139.1_amd64.deb", filenames)
        self.assertIn("code-server_4.139.1_arm64.deb", filenames)
        self.assertIn("code-server-4.139.1-amd64.rpm", filenames)
        self.assertIn("code-server-4.139.1-arm64.rpm", filenames)

    @patch("download_upstream_packages.urllib.request.urlopen")
    def test_download_file(self, mock_urlopen):
        mock_resp = MagicMock()
        mock_resp.read.side_effect = [b"chunk1", b"chunk2", b""]
        mock_resp.__enter__.return_value = mock_resp
        mock_urlopen.return_value = mock_resp

        dest_file = "/tmp/test_download_file.deb"
        if os.path.exists(dest_file):
            os.remove(dest_file)

        dup.download_file("https://example.com/test.deb", dest_file)
        self.assertTrue(os.path.exists(dest_file))
        with open(dest_file, "rb") as f:
            self.assertEqual(f.read(), b"chunk1chunk2")

        if os.path.exists(dest_file):
            os.remove(dest_file)

    @patch("download_upstream_packages.download_file")
    def test_sync_packages(self, mock_download):
        def side_effect(url, dest):
            with open(dest, "wb") as f:
                f.write(b"dummy")

        mock_download.side_effect = side_effect
        deb_dir = "/tmp/test_sync_deb"
        rpm_dir = "/tmp/test_sync_rpm"
        os.makedirs(deb_dir, exist_ok=True)
        os.makedirs(rpm_dir, exist_ok=True)

        dup.sync_packages("4.139.1", deb_dir, rpm_dir)
        self.assertEqual(mock_download.call_count, 4)

        # Cleanup
        for f in os.listdir(deb_dir):
            os.remove(os.path.join(deb_dir, f))
        for f in os.listdir(rpm_dir):
            os.remove(os.path.join(rpm_dir, f))


if __name__ == "__main__":
    unittest.main()
