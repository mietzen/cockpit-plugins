import os
import sys

repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
tools_dir = os.path.join(repo_root, "tools")

for p in [repo_root, tools_dir]:
    if p not in sys.path:
        sys.path.insert(0, p)
