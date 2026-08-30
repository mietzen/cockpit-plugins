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

## 3. Reference Skills
- Cockpit Plugin Development: [.agents/skills/cockpit-plugin/SKILL.md](.agents/skills/cockpit-plugin/SKILL.md)
