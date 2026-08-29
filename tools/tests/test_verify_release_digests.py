import subprocess
import unittest


class TestVerifyReleaseDigests(unittest.TestCase):
    def test_cli_help(self):
        res = subprocess.run(["python3", "tools/verify_release_digests.py", "--help"], capture_output=True, text=True)
        self.assertEqual(res.returncode, 0)
        self.assertIn("Verify built package digests", res.stdout)


if __name__ == "__main__":
    unittest.main()
