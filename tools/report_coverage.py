#!/usr/bin/env python3
import glob
import os
import re
import sys

def parse_lcov(file_path):
    if not os.path.exists(file_path):
        return None
    
    total_lines = 0
    hit_lines = 0
    with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            if line.startswith("LF:"):
                try:
                    total_lines += int(line.strip().split(":")[1])
                except Exception:
                    pass
            elif line.startswith("LH:"):
                try:
                    hit_lines += int(line.strip().split(":")[1])
                except Exception:
                    pass
    
    percentage = (hit_lines / total_lines * 100.0) if total_lines > 0 else 0.0
    return {
        "total": total_lines,
        "hit": hit_lines,
        "percentage": percentage
    }

def main():
    coverage_dir = sys.argv[1] if len(sys.argv) > 1 else "."
    
    rows = []
    
    # 1. Search for Python unit test coverage
    py_files = sorted(glob.glob(os.path.join(coverage_dir, "**/*python*.lcov"), recursive=True))
    for pf in py_files:
        label = os.path.basename(pf).replace(".lcov", "").replace("coverage-", "")
        data = parse_lcov(pf)
        if data and data["total"] > 0:
            rows.append(("Python Unit Tests", label, f"{data['percentage']:.1f}%", f"{data['hit']}/{data['total']} lines"))
            
    # 2. Search for Frontend E2E coverage
    e2e_files = sorted(glob.glob(os.path.join(coverage_dir, "**/coverage-e2e*/**/lcov.info"), recursive=True) + 
                       glob.glob(os.path.join(coverage_dir, "**/*e2e*.lcov"), recursive=True))
    for ef in e2e_files:
        target = "file-sharing" if "file-sharing" in ef else "zfs-storage" if "zfs-storage" in ef else os.path.basename(os.path.dirname(ef))
        data = parse_lcov(ef)
        if data and data["total"] > 0:
            rows.append(("Frontend E2E (Playwright)", target, f"{data['percentage']:.1f}%", f"{data['hit']}/{data['total']} lines"))
    
    md_output = []
    md_output.append("## 📊 Code Coverage Summary\n")
    if not rows:
        md_output.append("No coverage data files found.\n")
    else:
        md_output.append("| Layer | Target / Plugin | Coverage | Covered Lines |")
        md_output.append("| :--- | :--- | :--- | :--- |")
        for layer, target, cov, lines in rows:
            md_output.append(f"| **{layer}** | `{target}` | **{cov}** | {lines} |")
        md_output.append("\n*Generated automatically from Python pytest-cov & Playwright Istanbul coverage metrics.*")
    
    summary_text = "\n".join(md_output)
    print(summary_text)
    
    summary_file = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary_file:
        with open(summary_file, "a", encoding="utf-8") as f:
            f.write(summary_text + "\n")
            
    # Also write to comment markdown file
    with open("coverage-summary.md", "w", encoding="utf-8") as f:
        f.write(summary_text + "\n")

if __name__ == "__main__":
    main()
