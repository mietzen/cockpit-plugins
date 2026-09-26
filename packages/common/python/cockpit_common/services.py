import os
import shutil
from typing import Any, Dict
from .runner import run_cmd


def get_service_status(unit: str) -> Dict[str, Any]:
    """Inspects status of a systemd unit via systemctl."""
    rc_active, out_active, _ = run_cmd(["systemctl", "is-active", unit])
    active_str = out_active.strip() if out_active.strip() else ("active" if rc_active == 0 else "inactive")
    
    rc_enabled, out_enabled, _ = run_cmd(["systemctl", "is-enabled", unit])
    enabled_str = out_enabled.strip()
    
    is_enabled = rc_enabled == 0 and enabled_str in ("enabled", "alias", "static", "indirect")
    is_installed = bool(shutil.which("systemctl")) and active_str != "unknown" and enabled_str not in ("not-found", "") and (rc_active in (0, 3) or rc_enabled == 0)

    return {
        "unit": unit,
        "active": rc_active == 0 and active_str == "active",
        "state": active_str,
        "enabled": is_enabled,
        "installed": is_installed,
    }



def is_service_active(unit: str) -> bool:
    """Returns True if the systemd service is actively running."""
    rc, out, _ = run_cmd(["systemctl", "is-active", unit])
    return rc == 0 and out.strip() == "active"
