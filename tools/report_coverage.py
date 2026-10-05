#!/usr/bin/env python3
import argparse
import glob
import os
import sys
from typing import Dict, Tuple

COMMON_PKG_PREFIX = "packages/common/"


TIER_CONFIG = {
    "SECURITY": {
        "title": "🛡️ Security & Destructive Operations",
        "min_line": 90.0,
        "min_branch": 80.0,
        "patterns": [
            "command_builder.py",
            "zfs_helper.py",
            "sanoid_manager.py",
            "file_sharing_helper.py",
            "container_helper.py",
            "engine_adapter.py",
            "tls_manager.py",
            "smb_parser.py",
            "samba_parser.py",
            "nfs_parser.py",
            "access_matrix.py",
            "system.py",
            "DestroyModal.tsx",
            "AttachDiskModal.tsx",
            "ReplaceDiskModal.tsx",
            "containerClient.ts",
            "fileSharingClient.ts",
            "zfsClient.ts",
            "codeServerClient.ts",
            "code_server_helper.py",
            "config_manager.py",
            "service_manager.py",
            "files.py",
        ],
    },
    "BACKEND": {
        "title": "⚙️ Backend Services & Business Logic",
        "min_line": 80.0,
        "min_branch": 75.0,
        "patterns": [".py", "formatters.ts"],
    },
    "FRONTEND": {
        "title": "🖥️ Frontend / UI Components",
        "min_line": 65.0,
        "min_branch": 45.0,
        "patterns": [".tsx", ".ts"],
    },
}

def is_test_file(filepath: str) -> bool:
    low = filepath.lower()
    return "/tests/" in low or "/test/" in low or low.endswith(".spec.ts") or "test_" in low or "spec_" in low

def classify_file(filepath: str) -> str:
    base = os.path.basename(filepath).lower()
    for pat in TIER_CONFIG["SECURITY"]["patterns"]:
        if base == pat.lower():
            return "SECURITY"
    if filepath.endswith(".py") or base == "formatters.ts":
        return "BACKEND"
    return "FRONTEND"

def parse_lcov_records(file_path: str):
    if not os.path.exists(file_path):
        return []
    
    records = []
    curr = {"file": "", "lf": 0, "lh": 0, "brf": 0, "brh": 0}
    with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            if line.startswith("SF:"):
                curr = {"file": line.strip().split("SF:")[1], "lf": 0, "lh": 0, "brf": 0, "brh": 0}
            elif line.startswith("LF:"):
                try:
                    curr["lf"] = int(line.strip().split(":")[1])
                except Exception:
                    pass
            elif line.startswith("LH:"):
                try:
                    curr["lh"] = int(line.strip().split(":")[1])
                except Exception:
                    pass
            elif line.startswith("BRF:"):
                try:
                    curr["brf"] = int(line.strip().split(":")[1])
                except Exception:
                    pass
            elif line.startswith("BRH:"):
                try:
                    curr["brh"] = int(line.strip().split(":")[1])
                except Exception:
                    pass
            elif line.startswith("end_of_record"):
                if curr["lf"] > 0 and not is_test_file(curr["file"]):
                    records.append(curr)
    return records

def parse_args():
    parser = argparse.ArgumentParser(description="Generate 3-tier coverage summary.")
    parser.add_argument("coverage_dir", nargs="?", default=".", help="Directory containing LCOV coverage files")
    parser.add_argument("--min-coverage", type=float, default=None, help="Minimum overall line coverage percentage")
    parser.add_argument("--fail-under", type=float, default=None, help="Alias for --min-coverage")
    return parser.parse_args()


def main():
    args = parse_args()
    coverage_dir = args.coverage_dir
    min_coverage = args.min_coverage if args.min_coverage is not None else args.fail_under
    
    # 1. Collect all LCOV files
    lcov_files = sorted(
        glob.glob(os.path.join(coverage_dir, "**/*.lcov"), recursive=True) +
        glob.glob(os.path.join(coverage_dir, "**/lcov.info"), recursive=True)
    )
    
    # Deduplicate files by canonical path
    seen_paths = set()
    unique_lcov = []
    for lf in lcov_files:
        real_p = os.path.realpath(lf)
        if real_p not in seen_paths:
            seen_paths.add(real_p)
            unique_lcov.append(lf)
            
    # Deduplicate file records across target runs
    merged_records = {}
    target_file_records: Dict[Tuple[str, str], Dict[str, Dict[str, int]]] = {}

    for lf in unique_lcov:
        recs = parse_lcov_records(lf)
        parent = os.path.basename(os.path.dirname(lf))
        fname = os.path.basename(lf)
        target = parent.replace("coverage-", "").replace("e2e-", "").replace("python-", "")
        if target in ("coverage", "html", "lcov-report", "."):
            target = fname.replace(".lcov", "").replace(".info", "").replace("coverage-", "").replace("e2e-", "").replace("python-", "")

        layer = "Python Unit" if "python" in lf else "Frontend E2E"
        target_key = (target, layer)
        if target_key not in target_file_records:
            target_file_records[target_key] = {}

        for r in recs:
            fkey = r["file"]
            if fkey not in merged_records:
                merged_records[fkey] = {"lf": r["lf"], "lh": r["lh"], "brf": r["brf"], "brh": r["brh"]}
            else:
                # Keep max line and branch counts
                merged_records[fkey]["lf"] = max(merged_records[fkey]["lf"], r["lf"])
                merged_records[fkey]["lh"] = max(merged_records[fkey]["lh"], r["lh"])
                merged_records[fkey]["brf"] = max(merged_records[fkey]["brf"], r["brf"])
                merged_records[fkey]["brh"] = max(merged_records[fkey]["brh"], r["brh"])

            # Filter E2E records to target plugin and shared common package
            if layer == "Frontend E2E":
                target_prefix = f"plugins/{target}/"
                clean_fkey = fkey[2:] if fkey.startswith("./") else fkey
                if not (clean_fkey.startswith(target_prefix) or clean_fkey.startswith(COMMON_PKG_PREFIX)):
                    continue

            # Deduplicate per target and layer
            if fkey not in target_file_records[target_key]:
                target_file_records[target_key][fkey] = {
                    "lf": r["lf"],
                    "lh": r["lh"],
                    "brf": r["brf"],
                    "brh": r["brh"],
                }
            else:
                target_file_records[target_key][fkey]["lf"] = max(
                    target_file_records[target_key][fkey]["lf"], r["lf"]
                )
                target_file_records[target_key][fkey]["lh"] = max(
                    target_file_records[target_key][fkey]["lh"], r["lh"]
                )
                target_file_records[target_key][fkey]["brf"] = max(
                    target_file_records[target_key][fkey]["brf"], r["brf"]
                )
                target_file_records[target_key][fkey]["brh"] = max(
                    target_file_records[target_key][fkey]["brh"], r["brh"]
                )

    # Aggregate target_stats by summing values across deduplicated target_file_records
    target_stats = {}
    for target_key, file_records in target_file_records.items():
        stats = {"lf": 0, "lh": 0, "brf": 0, "brh": 0}
        for rec in file_records.values():
            stats["lf"] += rec["lf"]
            stats["lh"] += rec["lh"]
            stats["brf"] += rec["brf"]
            stats["brh"] += rec["brh"]
        target_stats[target_key] = stats


    # Tier statistics aggregation
    tier_stats = {
        "SECURITY": {"lf": 0, "lh": 0, "brf": 0, "brh": 0},
        "BACKEND": {"lf": 0, "lh": 0, "brf": 0, "brh": 0},
        "FRONTEND": {"lf": 0, "lh": 0, "brf": 0, "brh": 0},
    }

    for filepath, counts in merged_records.items():
        tier = classify_file(filepath)
        tier_stats[tier]["lf"] += counts["lf"]
        tier_stats[tier]["lh"] += counts["lh"]
        tier_stats[tier]["brf"] += counts["brf"]
        tier_stats[tier]["brh"] += counts["brh"]

    # Generate Markdown Summary
    md_output = []
    md_output.append("<!-- sticky-coverage-report -->\n## 📊 3-Tier Code & Branch Coverage Summary\n")
    md_output.append("| Domain / Tier | Line Coverage | Branch Coverage | Line Gate | Branch Gate | Status |")
    md_output.append("| :--- | :--- | :--- | :--- | :--- | :--- |")

    all_passed = True
    failed_reasons = []
    failed_tiers = []

    for tier_key in ["SECURITY", "BACKEND", "FRONTEND"]:
        cfg = TIER_CONFIG[tier_key]
        stats = tier_stats[tier_key]
        
        line_pct = (stats["lh"] / stats["lf"] * 100.0) if stats["lf"] > 0 else 100.0
        line_pass = line_pct >= cfg["min_line"]

        # If branches tracked, enforce branch gate; if not present (0 branches), evaluate as pass
        has_branches = stats["brf"] > 0
        branch_pct = (stats["brh"] / stats["brf"] * 100.0) if has_branches else 100.0
        branch_pass = branch_pct >= cfg["min_branch"] if has_branches else True

        tier_pass = line_pass and branch_pass
        if not tier_pass:
            all_passed = False
            failed_tiers.append(tier_key)
            failed_reasons.append(
                f"{cfg['title']}: Lines {line_pct:.1f}% (target >={cfg['min_line']}%), "
                f"Branches {branch_pct:.1f}% (target >={cfg['min_branch']}%)"
            )

        status_emoji = "✅" if tier_pass else "❌"
        br_display = f"**{branch_pct:.1f}%** ({stats['brh']}/{stats['brf']})" if has_branches else "N/A"
        line_display = f"**{line_pct:.1f}%** ({stats['lh']}/{stats['lf']})"

        md_output.append(
            f"| **{cfg['title']}** | {line_display} | {br_display} | ≥ {cfg['min_line']:.0f}% | ≥ {cfg['min_branch']:.0f}% | {status_emoji} |"
        )

    # Evaluate optional overall line coverage threshold
    if min_coverage is not None:
        total_lf = sum(r["lf"] for r in merged_records.values())
        total_lh = sum(r["lh"] for r in merged_records.values())
        overall_line_pct = (total_lh / total_lf * 100.0) if total_lf > 0 else 100.0
        if overall_line_pct < min_coverage:
            all_passed = False
            failed_reasons.append(
                f"Overall Line Coverage: {overall_line_pct:.1f}% (minimum required >={min_coverage:.1f}%)"
            )

    md_output.append("\n### 📦 Target & Layer Breakdown\n")
    md_output.append("| Layer | Target | Lines | Branches |")
    md_output.append("| :--- | :--- | :--- | :--- |")
    for (target, layer), st in sorted(target_stats.items()):
        lp = (st["lh"] / st["lf"] * 100.0) if st["lf"] > 0 else 0.0
        bp = (st["brh"] / st["brf"] * 100.0) if st["brf"] > 0 else 0.0
        b_str = f"{bp:.1f}% ({st['brh']}/{st['brf']})" if st["brf"] > 0 else "—"
        md_output.append(f"| {layer} | `{target}` | **{lp:.1f}%** ({st['lh']}/{st['lf']}) | {b_str} |")

    gate_status_str = "PASSED" if all_passed else "FAILED"
    md_output.append(f"\n**3-Tier Quality Gate**: **{gate_status_str}**")
    md_output.append("\n*Evaluated across Security (≥90%/≥80%), Backend (≥80%/≥75%), and Frontend (≥65%/≥45%) quality tiers.*")

    summary_text = "\n".join(md_output)
    print(summary_text)

    # Write to Step Summary and Comment file
    summary_file = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary_file:
        with open(summary_file, "a", encoding="utf-8") as f:
            f.write(summary_text + "\n")

    with open("coverage-summary.md", "w", encoding="utf-8") as f:
        f.write(summary_text + "\n")

    if not all_passed:
        print("\n❌ 3-Tier Coverage Gate Failed:")
        for reason in failed_reasons:
            print(f"  - {reason}")

        for tier_key in failed_tiers:
            cfg = TIER_CONFIG[tier_key]
            print(f"\nPer-file breakdown for failing tier {cfg['title']}:")
            for fpath, counts in sorted(merged_records.items()):
                if classify_file(fpath) == tier_key:
                    flp = (counts["lh"] / counts["lf"] * 100.0) if counts["lf"] > 0 else 100.0
                    fbp = (counts["brh"] / counts["brf"] * 100.0) if counts["brf"] > 0 else 100.0
                    b_str = f"{fbp:.1f}% ({counts['brh']}/{counts['brf']})" if counts["brf"] > 0 else "—"
                    print(f"  {flp:5.1f}% L ({counts['lh']}/{counts['lf']}), {b_str} B : {fpath}")

        sys.exit(1)

    print("\n✅ All 3 coverage quality tiers passed successfully!")

if __name__ == "__main__":
    main()
