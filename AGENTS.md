# Agent Instructions: cockpit-plugins Monorepo

## 1. Monorepo Structure
- `packages/common/`: Foundation package (`@cockpit-plugins/common`) containing canonical theme CSS, `useCockpitTheme()` hook, UI helpers, and `cockpit_common` Python utilities.
- `plugins/`: Cockpit plugin packages:
  - `plugins/zfs-storage/`: OpenZFS storage manager (`cockpit-zfs-storage`, v1.2.0).
  - `plugins/file-sharing/`: SMB & NFS manager (`cockpit-file-sharing`, v1.2.0).
  - `plugins/container-manager/`: Docker & Podman manager (`cockpit-container-manager`, v1.2.0).
  - `plugins/code-server/`: VS Code Server manager (`cockpit-code-server`, v1.2.0).
- `tools/`: Packaging and repository automation (`build_deb.sh`, `build_rpm.sh`, `generate_apt_repo.py`, `generate_rpm_repo.py`).
- `.agents/skills/`: Discovered agent skill definitions.

- **Shared Foundation**: All plugins must import theme CSS and hooks from `@cockpit-plugins/common`.
- **Zero-Flicker Navigation**: Use `useCockpitRoute()` with in-memory routing. Never pass empty arrays (`[]`) to `cockpit.location.replace/go` (pass path segments directly or omit to keep iframe loaded; passing `[]` resets Cockpit shell to root and triggers iframe reloads). Never bind `loadData()` / API fetches to `hashchange`/`locationchanged` to avoid loading spinners during tab switching. Never include plugin tab names in `IGNORED_PREFIXES` (e.g., `'containers'`), which strips valid sub-routes and bounces navigation back to overview.
- **Portaling Dropdowns**: Pass `popperProps={{ appendTo: () => document.body }}` (or use `ActionMenuPortal`) on all PatternFly v5 menus.
- **Parent-Authoritative Theming**: Query parent Cockpit shell DOM classes (`pf-v6-theme-dark` / `pf-v5-theme-dark`); never use raw `@media (prefers-color-scheme: dark)` overrides.
- **Privilege Separation**: Frontend calls backend helper via `cockpit.spawn(['/usr/libexec/<helper>/<helper>.py', ...], { superuser: 'require' })`.
- **Reproducible Builds**: All packages must build with clamped `SOURCE_DATE_EPOCH` and pass the CI reproducibility gate bit-for-bit.
- **3-Tier Quality Gate**: All code must satisfy 3-tier coverage thresholds evaluated in `tools/report_coverage.py`:
  - 🛡️ **Security & Destructive Operations** (`≥ 90.0%` Lines, `≥ 80.0%` Branches): Privileged backend helpers, command builders, configuration parsers/sanitizers, access control matrices, destructive action modals (`DestroyModal`, `ReplaceDiskModal`, `AttachDiskModal`), and API client bridges. Whenever creating security-critical logic, register its path in the `SECURITY` tier.
  - ⚙️ **Backend Services & Business Logic** (`≥ 80.0%` Lines, `≥ 75.0%` Branches): Backend aggregators, query parsers, and data formatting services.
  - 🖥️ **Frontend / UI Components** (`≥ 65.0%` Lines, `≥ 45.0%` Branches): UI views, navigation tabs, cards, wizards, and read-only dialogs.

## 3. Reference Skills
- Cockpit Plugin Development: [.agents/skills/cockpit-plugin/SKILL.md](.agents/skills/cockpit-plugin/SKILL.md)


## 4. Review convention

Final reviews of implemented issues use a dedicated Gemini Flash sub-agent (`TypeName: "research"`, `Model: "flash"`).

## 5. Development workflow (Ticket -> Subagent -> AI Review -> Check CI -> Merge)

Every issue must follow this exact sequence:

1. **Ticket**: Create a GitHub issue (`gh issue create`) with complete specifications, architectural decisions, and acceptance criteria.
2. **Branch**: Create topic branch `git switch -c <topic>/<issue-slug>` off `main`.
3. **Subagent Implementation**: Dispatch an implementation subagent (`TypeName: "self"`) to implement changes using TDD, open a PR (`gh pr create`), and push the branch. Never write feature code directly in the parent orchestrator agent.
4. **Subagent AI Review**: Dispatch a review subagent (`TypeName: "research"`, `Model: "flash"`) on the PR. Address any blocking findings with follow-up commits.
5. **Check CI**: Check CI status yourself using `gh pr checks --watch` (NEVER `-w` or `--web`).
6. **Merge**: Merge the PR to `main` via `gh pr merge --squash --delete-branch` (NEVER `--admin`) only after CI is green AND the AI review passed.
7. **Deploy & Release**: Tag release (`<plugin>-v<version>`) and push to trigger CI repository build and deployment to GitHub Pages. Direct pushes on `main` ignore plugin/package source paths to protect immutable release artifacts. No local-build deploys.
8. **E2E on Test VM**: Install updated package on `debian-test` VM via apt/dnf and verify acceptance criteria end-to-end.
9. **Cleanup**: Delete merged local branch and verify branch cleanup.

### Checkpoints & Decision Logging
- **Frequent Checkpoints**: Commit frequently with concise commit messages for incremental checkpoints during development.
- **Git Notes**: Document significant architectural, security, or user decisions using `git notes` (`git notes add -m "<decision>" <commit>`). Push notes via `git push origin refs/notes/*`.