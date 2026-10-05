from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
APP_TSX = REPO_ROOT / "plugins/container-manager/src/App.tsx"
CLIENT_TS = REPO_ROOT / "plugins/container-manager/src/api/containerClient.ts"


def test_no_nav_listeners():
    # Verify loadData is not bound to navigation events to prevent flicker.
    content = APP_TSX.read_text(encoding="utf-8")

    assert "hashchange" not in content
    assert "locationchanged" not in content


def test_helper_spawn_boundary():
    # Verify spawnTerminal and spawnLogs route via privileged helper.
    content = CLIENT_TS.read_text(encoding="utf-8")

    assert "spawn([safeEngine," not in content
    assert "[safeEngine, 'logs'" not in content

    terminal_section = content[content.index("spawnTerminal") : content.index("spawnLogs")]
    logs_section = content[content.index("spawnLogs") :]

    assert "HELPER_PATH" in terminal_section
    assert "HELPER_PATH" in logs_section

