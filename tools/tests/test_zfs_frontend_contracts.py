from pathlib import Path
import re

REPO_ROOT = Path(__file__).resolve().parents[2]
APP_TSX = REPO_ROOT / "plugins/zfs-storage/src/App.tsx"
EDIT_MODAL_TSX = REPO_ROOT / "plugins/zfs-storage/src/components/Modals/EditPropertiesModal.tsx"


def get_modal_snippet(content: str, modal_tag: str) -> str:
    pattern = rf"<{modal_tag}\b[\s\S]*?/>"
    match = re.search(pattern, content)
    assert match is not None, f"Modal {modal_tag} not found in App.tsx"
    return match.group(0)


def test_rollback_contract():
    content = APP_TSX.read_text(encoding="utf-8")
    snippet = get_modal_snippet(content, "RollbackSnapshotModal")

    assert "args.snapshotName" in snippet
    assert "args.destroyMoreRecent" in snippet
    assert "args.snapshot." not in snippet
    assert "args.snapshot?" not in snippet


def test_clone_contract():
    content = APP_TSX.read_text(encoding="utf-8")
    snippet = get_modal_snippet(content, "CloneSnapshotModal")

    assert "args.snapshotName" in snippet
    assert "args.clonePath" in snippet
    assert "args.snapshot." not in snippet
    assert "args.snapshot?" not in snippet


def test_edit_props_contract():
    app_content = APP_TSX.read_text(encoding="utf-8")
    snippet = get_modal_snippet(app_content, "EditPropertiesModal")

    assert "inheritProperties = []" in snippet
    assert "Array.isArray(inheritProperties)" in snippet

    modal_content = EDIT_MODAL_TSX.read_text(encoding="utf-8")
    assert "inheritProperties?: string[];" in modal_content
    assert "inheritProperties: []" in modal_content


def test_disk_action_force_forward():
    content = APP_TSX.read_text(encoding="utf-8")
    attach_snippet = get_modal_snippet(content, "AttachDiskModal")
    replace_snippet = get_modal_snippet(content, "ReplaceDiskModal")

    assert 'zfsApi.diskAction("attach", args.poolName, args.existingDevice, args.newDevice, args.force)' in attach_snippet
    assert 'zfsApi.diskAction("replace", args.poolName, args.oldDevice, args.newDevice, args.force)' in replace_snippet

