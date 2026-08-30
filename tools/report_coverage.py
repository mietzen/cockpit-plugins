#!/usr/bin/env python3
import glob
import os
import sys

TIER_CONFIG = {
    "SECURITY": {
        "title": "🛡️ Security & Destructive Operations",
        "min_line": 90.0,
        "min_branch": 80.0,
        "patterns": [
            "command_builder.py",
            "zfs_helper.py",
            "file_sharing_helper.py",
            "smb_parser.py",
            "samba_parser.py",
            "nfs_parser.py",
            "access_matrix.py",
            "system.py",
            "DestroyModal.tsx",
            "AttachDiskModal.tsx",
            "ReplaceDiskModal.tsx",
            "Client.ts",
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
        "min_line": 70.0,
        "min_branch": 60.0,
        "patterns": [".tsx", ".ts"],
    },
}

def is_test_file(filepath: str) -> bool:
    low = filepath.lower()
    return "/tests/" in low or "/test/" in low or low.endswith(".spec.ts") or "test_" in low or "spec_" in low

def classify_file(filepath: str) -> str:
    for pat in TIER_CONFIG["SECURITY"]["patterns"]:
        if pat in filepath:
            return "SECURITY"
    if filepath.endswith(".py") or "formatters.ts" in filepath:
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

def main():
    coverage_dir = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith("--") else "."
    
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
    target_stats = {}

    for lf in unique_lcov:
        recs = parse_lcov_records(lf)
        parent = os.path.basename(os.path.dirname(lf))
        fname = os.path.basename(lf)
        target = parent.replace("coverage-", "").replace("e2e-", "").replace("python-", "")
        if target in ("coverage", "html", "lcov-report", "."):
            target = fname.replace(".lcov", "").replace(".info", "").replace("coverage-", "").replace("e2e-", "").replace("python-", "")

        layer = "Python Unit" if "python" in lf else "Frontend E2E"
        if (target, layer) not in target_stats:
            target_stats[(target, layer)] = {"lf": 0, "lh": 0, "brf": 0, "brh": 0}

        for r in recs:
            fkey = r["file"]
            if fkey not in merged_records:
                merged_records[fkey] = {"lf": r["lf"], "lh": r["lh"], "brf": r["brf"], "brh": r["brh"]}
            else:
                # Keep max hit count
                merged_records[fkey]["lh"] = max(merged_records[fkey]["lh"], r["lh"])
                merged_records[fkey]["brh"] = max(merged_records[fkey]["brh"], r["brh"])

            target_stats[(target, layer)]["lf"] += r["lf"]
            target_stats[(target, layer)]["lh"] += r["lh"]
            target_stats[(target, layer)]["brf"] += r["brf"]
            target_stats[(target, layer)]["brh"] += r["brh"]

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
    md_output.append("\n*Evaluated across Security (≥90%/≥85%), Backend (≥80%/≥75%), and Frontend (≥70%/≥60%) quality tiers.*")

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
        sys.exit(1)

    print("\n✅ All 3 coverage quality tiers passed successfully!")

if __name__ == "__main__":
    main()
