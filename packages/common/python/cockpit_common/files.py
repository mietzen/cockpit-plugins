"""
Atomic file operations and locking utilities.
"""
from contextlib import contextmanager
import fcntl
import os
import tempfile
from typing import Generator

LOCK_SUFFIX = ".lock"
FILE_ENCODING = "utf-8"


@contextmanager
def file_lock(filepath: str) -> Generator[None, None, None]:
    # Acquire exclusive advisory flock on target.lock
    parent_dir = os.path.dirname(os.path.abspath(filepath))
    if parent_dir:
        os.makedirs(parent_dir, exist_ok=True)

    lock_path = f"{filepath}{LOCK_SUFFIX}"
    fd = open(lock_path, "a")

    try:
        fcntl.flock(fd.fileno(), fcntl.LOCK_EX)
        yield
    finally:
        try:
            fcntl.flock(fd.fileno(), fcntl.LOCK_UN)
        finally:
            fd.close()


def atomic_write(target_path: str, content: str) -> None:
    # Write to unique temporary file and atomically replace target
    target_dir = os.path.dirname(os.path.abspath(target_path))
    if target_dir:
        os.makedirs(target_dir, exist_ok=True)

    tmp_file = tempfile.NamedTemporaryFile(
        mode="w",
        dir=target_dir,
        delete=False,
        encoding=FILE_ENCODING,
    )
    tmp_path = tmp_file.name

    try:
        tmp_file.write(content)
        tmp_file.flush()
        os.fsync(tmp_file.fileno())
        tmp_file.close()
        os.replace(tmp_path, target_path)
    except Exception:
        if not tmp_file.closed:
            tmp_file.close()
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)
        raise
