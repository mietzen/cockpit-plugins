"""Validate GitHub Actions workflow syntax."""

from pathlib import Path
import pytest
import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]
WORKFLOW_DIR = REPO_ROOT / ".github" / "workflows"
YAML_PATTERNS = ("*.yml", "*.yaml")


def _get_workflow_files():
    """Discover all workflow files in the repository."""
    files = []
    for pattern in YAML_PATTERNS:
        files.extend(WORKFLOW_DIR.glob(pattern))

    return sorted(files)


@pytest.mark.parametrize("file_path", _get_workflow_files(), ids=lambda p: p.name)
def test_workflow_yaml(file_path: Path):
    """Verify workflow file contains valid YAML."""
    # Parse workflow with PyYAML
    with open(file_path, "r", encoding="utf-8") as handle:
        parsed = yaml.safe_load(handle)

    assert isinstance(parsed, dict)
