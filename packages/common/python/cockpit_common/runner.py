import subprocess
from typing import List, Optional, Tuple


def run_cmd(
    cmd: List[str],
    check: bool = False,
    input_data: Optional[str] = None,
    timeout: int = 60,
) -> Tuple[int, str, str]:
    """
    Executes a system command with strict arguments list (no shell=True),
    capturing stdout/stderr with optional timeout.
    """
    try:
        p = subprocess.run(
            cmd,
            input=input_data if input_data is not None else None,
            capture_output=True,
            text=True,
            check=check,
            timeout=timeout,
        )
        return p.returncode, p.stdout.strip(), p.stderr.strip()
    except subprocess.TimeoutExpired:
        return -1, "", f"Command timed out after {timeout} seconds"
    except Exception as e:
        return -1, "", str(e)
