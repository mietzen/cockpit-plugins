# Agent Instructions: cockpit-plugins Monorepo

## 1. Monorepo Structure
- `zfs-storage/`: Advanced OpenZFS storage manager plugin for Cockpit.
- `tools/`: Build and packaging utilities (`build_deb.py`, `generate_apt_repo.py`).
- `e2e/`: Playwright end-to-end test suite and runner provisioning.
- `.agents/skills/`: Discovered agent skill definitions.

## 2. Cockpit Plugin Engineering Rules
- **Zero-Flicker Navigation**: Use in-memory state for tab switching; avoid modifying host shell location.
- **Portaling Dropdowns**: Pass `popperProps={{ appendTo: () => document.body }}` on all PatternFly v5 ActionMenu and Dropdowns.
- **Privilege Separation**: Frontend calls backend helper via `cockpit.spawn(['/usr/libexec/cockpit-zfs/zfs_helper.py', ...], { superuser: 'require' })`.
- **Packaging**: Install web assets to `/usr/share/cockpit/<plugin>` and helpers to `/usr/libexec/<helper>`.

## 3. Reference Skills
- Cockpit Plugin Development: [.agents/skills/cockpit-plugin/SKILL.md](.agents/skills/cockpit-plugin/SKILL.md)
