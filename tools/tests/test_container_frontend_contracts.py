from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
APP_TSX = REPO_ROOT / "plugins/container-manager/src/App.tsx"


def test_no_nav_listeners():
    # Verify loadData is not bound to navigation events to prevent flicker.
    content = APP_TSX.read_text(encoding="utf-8")

    assert "hashchange" not in content
    assert "locationchanged" not in content
