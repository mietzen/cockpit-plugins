"""Tests for dependency security audits."""

import json
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
PACKAGE_LOCK_PATH = REPO_ROOT / "package-lock.json"
VULNERABLE_TARBALL = "brace-expansion/-/brace-expansion-1.1.18.tgz"
MIN_PATCHED_VERSION = (1, 1, 21)


def test_brace_expansion_ver():
    """Verify brace-expansion dependencies are patched against ReDoS."""
    # Ensure lockfile exists before checking
    assert PACKAGE_LOCK_PATH.is_file()

    lock_content = PACKAGE_LOCK_PATH.read_text(encoding="utf-8")
    assert VULNERABLE_TARBALL not in lock_content

    lock_data = json.loads(lock_content)
    packages = lock_data.get("packages", {})

    for pkg_path, pkg_info in packages.items():
        if not pkg_path.endswith("brace-expansion"):
            continue

        version_str = pkg_info.get("version", "0.0.0")
        parts = tuple(int(num) for num in version_str.split("."))
        if parts[0] == 1:
            assert parts >= MIN_PATCHED_VERSION
