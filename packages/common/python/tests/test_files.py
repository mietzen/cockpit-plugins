import fcntl
import os
import tempfile
import unittest
from unittest.mock import patch
from cockpit_common.files import atomic_write, file_lock

TEST_DATA = "payload data\n"
TEST_DATA_FAIL = "failing payload\n"
LOCK_SUFFIX = ".lock"


class TestFiles(unittest.TestCase):
    def setUp(self):
        self.tmp_dir = tempfile.mkdtemp()
        self.target = os.path.join(self.tmp_dir, "test.txt")

    def tearDown(self):
        for fname in os.listdir(self.tmp_dir):
            os.unlink(os.path.join(self.tmp_dir, fname))
        os.rmdir(self.tmp_dir)

    def test_file_lock_exclusive(self):
        # Verify lock file created and released
        lock_file = f"{self.target}{LOCK_SUFFIX}"
        self.assertFalse(os.path.exists(lock_file))

        with file_lock(self.target):
            self.assertTrue(os.path.exists(lock_file))

    def test_file_lock_blocks(self):
        # Verify concurrent exclusive lock raises BlockingIOError
        with file_lock(self.target):
            lock_path = f"{self.target}{LOCK_SUFFIX}"
            with open(lock_path, "r") as fd:
                with self.assertRaises(BlockingIOError):
                    fcntl.flock(fd.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)

    def test_atomic_write_success(self):
        # Verify content written cleanly to destination
        atomic_write(self.target, TEST_DATA)

        with open(self.target, "r", encoding="utf-8") as f:
            content = f.read()

        self.assertEqual(content, TEST_DATA)
        self.assertEqual(len(os.listdir(self.tmp_dir)), 1)

    def test_atomic_write_cleanup(self):
        # Verify temp file unlinked on write failure
        with patch("os.fsync", side_effect=OSError("Sync error")):
            with self.assertRaises(OSError):
                atomic_write(self.target, TEST_DATA_FAIL)

        self.assertFalse(os.path.exists(self.target))
        self.assertEqual(len(os.listdir(self.tmp_dir)), 0)
