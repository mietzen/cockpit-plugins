# Agent Instructions: cockpit-plugins Monorepo

## 1. Monorepo Structure
- `packages/common/`: Foundation package (`@cockpit-plugins/common`) containing canonical theme CSS, `useCockpitTheme()` hook, UI helpers, and `cockpit_common` Python utilities.
- `plugins/`: Cockpit plugin packages:
  - `plugins/zfs-storage/`: OpenZFS storage manager (`cockpit-zfs-storage`, v0.5.0).
  - `plugins/file-sharing/`: SMB & NFS manager (`cockpit-file-sharing`, v0.1.0).
- `tools/`: Packaging and repository automation (`build_deb.sh`, `build_rpm.sh`, `generate_apt_repo.py`, `generate_rpm_repo.py`).
- `.agents/skills/`: Discovered agent skill definitions.

## 2. Cockpit Plugin Engineering Rules
- **Shared Foundation**: All plugins must import theme CSS and hooks from `@cockpit-plugins/common`.
- **Zero-Flicker Navigation**: Use in-memory state for tab switching; avoid modifying host shell location.
- **Portaling Dropdowns**: Pass `popperProps={{ appendTo: () => document.body }}` (or use `ActionMenuPortal`) on all PatternFly v5 menus.
- **Parent-Authoritative Theming**: Query parent Cockpit shell DOM classes (`pf-v6-theme-dark` / `pf-v5-theme-dark`); never use raw `@media (prefers-color-scheme: dark)` overrides.
- **Privilege Separation**: Frontend calls backend helper via `cockpit.spawn(['/usr/libexec/<helper>/<helper>.py', ...], { superuser: 'require' })`.
- **Reproducible Builds**: All packages must build with clamped `SOURCE_DATE_EPOCH` and pass the CI reproducibility gate bit-for-bit.
- **3-Tier Quality Gate**: All code must satisfy 3-tier coverage thresholds evaluated in `tools/report_coverage.py`:
  - 🛡️ **Security & Destructive Operations** (`≥ 90.0%` Lines, `≥ 85.0%` Branches): Privileged backend helpers, command builders, configuration parsers/sanitizers, access control matrices, destructive action modals (`DestroyModal`, `ReplaceDiskModal`, `AttachDiskModal`), and API client bridges. Whenever creating security-critical logic, register its path in the `SECURITY` tier.
  - ⚙️ **Backend Services & Business Logic** (`≥ 80.0%` Lines, `≥ 75.0%` Branches): Backend aggregators, query parsers, and data formatting services.
  - 🖥️ **Frontend / UI Components** (`≥ 70.0%` Lines, `≥ 60.0%` Branches): UI views, navigation tabs, cards, wizards, and read-only dialogs.

## 3. Reference Skills
- Cockpit Plugin Development: [.agents/skills/cockpit-plugin/SKILL.md](.agents/skills/cockpit-plugin/SKILL.md)

