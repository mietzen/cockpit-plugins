import os
import shutil
import subprocess
import sys
import tempfile
import unittest

class TestReportCoverage(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()

    def tearDown(self):
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_e2e_target_filtering(self):
        # Create mock E2E lcov for zfs-storage containing cross-plugin records
        cov_dir = os.path.join(self.temp_dir, "coverage-e2e-zfs-storage")
        os.makedirs(cov_dir, exist_ok=True)
        lcov_path = os.path.join(cov_dir, "lcov.info")

        content = (
            "TN:\n"
            "SF:plugins/zfs-storage/src/app.tsx\n"
            "LF:10\n"
            "LH:10\n"
            "BRF:0\n"
            "BRH:0\n"
            "end_of_record\n"
            "SF:plugins/file-sharing/src/share.tsx\n"
            "LF:20\n"
            "LH:20\n"
            "BRF:0\n"
            "BRH:0\n"
            "end_of_record\n"
            "SF:packages/common/src/theme.ts\n"
            "LF:5\n"
            "LH:5\n"
            "BRF:0\n"
            "BRH:0\n"
            "end_of_record\n"
        )
        with open(lcov_path, "w", encoding="utf-8") as f:
            f.write(content)

        tools_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
        script = os.path.join(tools_dir, "report_coverage.py")

        res = subprocess.run(
            [sys.executable, script, self.temp_dir],
            capture_output=True,
            text=True,
            cwd=self.temp_dir,
        )

        self.assertEqual(res.returncode, 0, f"Script failed: {res.stderr}")
        # Only zfs-storage (10) and packages/common (5) should be counted in target stats: 15 lines
        self.assertIn("| Frontend E2E | `zfs-storage` | **100.0%** (15/15) | — |", res.stdout)
