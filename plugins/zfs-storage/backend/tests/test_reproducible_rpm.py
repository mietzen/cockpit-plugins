import hashlib
import os
import subprocess
import tempfile
import unittest


class TestReproducibleRpm(unittest.TestCase):
    def test_reproducible_rpm_import_and_execution(self):
        # Verify tool can be executed and CLI help runs cleanly
        res = subprocess.run(["python3", "tools/reproducible_rpm.py", "--help"], capture_output=True, text=True)
        self.assertEqual(res.returncode, 0)
        self.assertIn("Clamp RPM header timestamps", res.stdout)


if __name__ == "__main__":
    unittest.main()
