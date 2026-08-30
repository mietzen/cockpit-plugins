import os
import shutil
from typing import Any, Dict
from .runner import run_cmd


def get_service_status(unit: str) -> Dict[str, Any]:
    """Inspects status of a systemd unit via systemctl."""
    rc, out, _ = run_cmd(["systemctl", "is-active", unit])
    active_state = out.strip() if rc == 0 else "inactive"
    rc_enabled, out_enabled, _ = run_cmd(["systemctl", "is-enabled", unit])
    enabled_state = out_enabled.strip() if rc_enabled == 0 else "disabled"
    is_installed = shutil.which("systemctl") is not None and rc in (0, 3)

    return {
        "unit": unit,
        "active": active_state == "active",
        "state": active_state,
        "enabled": enabled_state == "enabled",
        "installed": active_state != "unknown",
    }


def is_service_active(unit: str) -> bool:
    """Returns True if the systemd service is actively running."""
    rc, out, _ = run_cmd(["systemctl", "is-active", unit])
    return rc == 0 and out.strip() == "active"
