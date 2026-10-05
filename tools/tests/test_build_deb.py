import io
import json
import os
import shutil
import struct
import tarfile
import tempfile
import unittest

from build_deb import build_deb, get_source_date_epoch

ENV_SOURCE_DATE_EPOCH = "SOURCE_DATE_EPOCH"
TARGET_EPOCH = 1700000000
DUMMY_VERSION = "1.0.0"
AR_HEADER_SIZE = 60
AR_MAGIC = b"!<arch>\n"


def parse_ar_archive(deb_path: str) -> dict:
    """Extract files from a Unix ar (.deb) archive into a byte dict."""
    entries = {}
    with open(deb_path, "rb") as ar_file:
        magic = ar_file.read(len(AR_MAGIC))
        assert magic == AR_MAGIC, "Invalid ar magic"

        while True:
            header = ar_file.read(AR_HEADER_SIZE)
            if len(header) < AR_HEADER_SIZE:
                break

            name = header[:16].decode("ascii").strip().rstrip("/")
            size = int(header[48:58].decode("ascii").strip())
            data = ar_file.read(size)
            if size % 2 != 0:
                ar_file.read(1)

            entries[name] = data

    return entries


def read_gz_mtime(gz_bytes: bytes) -> int:
    """Read little-endian 32-bit mtime from gzip header."""
    return struct.unpack("<I", gz_bytes[4:8])[0]


class TestBuildDeb(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self.plugin_dir = os.path.join(self.temp_dir, "test-plugin")
        os.makedirs(os.path.join(self.plugin_dir, "dist"))
        os.makedirs(os.path.join(self.plugin_dir, "backend"))

        with open(os.path.join(self.plugin_dir, "manifest.json"), "w") as f:
            json.dump({"name": "test-plugin"}, f)

        with open(os.path.join(self.plugin_dir, "dist", "index.html"), "w") as f:
            f.write("<h1>Test Plugin</h1>")

        self.output_dir = os.path.join(self.temp_dir, "output")
        os.makedirs(self.output_dir)

    def tearDown(self):
        shutil.rmtree(self.temp_dir)

    def test_epoch_from_env(self):
        """Verify get_source_date_epoch returns int from env var."""
        old_env = os.environ.get(ENV_SOURCE_DATE_EPOCH)
        try:
            os.environ[ENV_SOURCE_DATE_EPOCH] = str(TARGET_EPOCH)
            epoch = get_source_date_epoch(self.plugin_dir, DUMMY_VERSION)
            self.assertEqual(epoch, TARGET_EPOCH)
        finally:
            if old_env is None:
                os.environ.pop(ENV_SOURCE_DATE_EPOCH, None)
            else:
                os.environ[ENV_SOURCE_DATE_EPOCH] = old_env

    def test_epoch_fallback(self):
        """Verify get_source_date_epoch falls back gracefully without env var."""
        old_env = os.environ.get(ENV_SOURCE_DATE_EPOCH)
        try:
            os.environ.pop(ENV_SOURCE_DATE_EPOCH, None)
            epoch = get_source_date_epoch(self.plugin_dir, DUMMY_VERSION)
            self.assertIsInstance(epoch, int)
            self.assertGreaterEqual(epoch, 0)
        finally:
            if old_env is not None:
                os.environ[ENV_SOURCE_DATE_EPOCH] = old_env

    def test_deb_mtime_matches_epoch(self):
        """Verify build_deb produces debs where tar and gzip mtimes match epoch."""
        old_env = os.environ.get(ENV_SOURCE_DATE_EPOCH)
        try:
            os.environ[ENV_SOURCE_DATE_EPOCH] = str(TARGET_EPOCH)
            deb_files = build_deb(self.plugin_dir, self.output_dir, DUMMY_VERSION)
            self.assertTrue(len(deb_files) > 0)

            for deb_path in deb_files:
                entries = parse_ar_archive(deb_path)
                self.assertIn("control.tar.gz", entries)
                self.assertIn("data.tar.gz", entries)

                for tar_name in ["control.tar.gz", "data.tar.gz"]:
                    gz_data = entries[tar_name]

                    # Verify gzip header mtime
                    gz_mtime = read_gz_mtime(gz_data)
                    self.assertEqual(
                        gz_mtime,
                        TARGET_EPOCH,
                        f"{tar_name} gzip mtime is {gz_mtime}, expected {TARGET_EPOCH}",
                    )

                    # Verify tar archive members mtime
                    with tarfile.open(fileobj=io.BytesIO(gz_data), mode="r:gz") as tar:
                        members = tar.getmembers()
                        self.assertTrue(len(members) > 0)
                        for ti in members:
                            self.assertEqual(
                                ti.mtime,
                                TARGET_EPOCH,
                                f"{tar_name}:{ti.name} mtime is {ti.mtime}, expected {TARGET_EPOCH}",
                            )
        finally:
            if old_env is None:
                os.environ.pop(ENV_SOURCE_DATE_EPOCH, None)
            else:
                os.environ[ENV_SOURCE_DATE_EPOCH] = old_env


if __name__ == "__main__":
    unittest.main()
