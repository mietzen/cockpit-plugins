---
name: cockpit-plugin-development
description: Comprehensive guide and best practices for developing Cockpit plugins, including PatternFly v5 integration, avoiding iframe flicker, zero-DOM-thrashing persistence, portaling, backend helpers, and Debian APT packaging.
---

# Cockpit Plugin Development Guide & Best Practices

This guide documents the architecture, lifecycle, and critical engineering pitfalls encountered when building high-performance plugins for [Cockpit](https://cockpit-project.org/).

---

## 1. System Architecture

A Cockpit plugin is a web application executed inside an isolated `<iframe>` managed by the Cockpit host shell.

```
┌─────────────────────────────────────────────────────────────┐
│ Cockpit Host Shell (Port 9090)                              │
│ Top navigation, system sidebar, theme manager               │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ Plugin <iframe> (/usr/share/cockpit/<plugin>/)        │  │
│  │ React 18 + PatternFly v5 + In-Memory Router           │  │
│  │                                                       │  │
│  │  ┌─────────────────────────────────────────────────┐  │  │
│  │  │ cockpit.js JavaScript Bridge                    │  │  │
│  │  │ (cockpit.spawn, cockpit.transport)               │  │  │
│  │  └──────────────────┬──────────────────────────────┘  │  │
│  └─────────────────────┼─────────────────────────────────┘  │
└────────────────────────┼────────────────────────────────────┘
                         │ Unix Socket / sudo
┌────────────────────────▼────────────────────────────────────┐
│ Backend Helper (/usr/libexec/<plugin>/<helper>.py)          │
│ Python CLI invoking system utilities (zpool, zfs, smartctl) │
└─────────────────────────────────────────────────────────────┘
```

### Directory Hierarchy on Target System
- **/usr/share/cockpit/<plugin-name>/**: Static frontend assets (`index.html`, `manifest.json`, `assets/*.js`, `assets/*.css`).
- **/usr/libexec/<helper-name>/**: Backend helper executables with executable permissions (`chmod 755`).
- **/etc/cockpit/**: Global Cockpit configuration and overrides.

### The `manifest.json`
The plugin manifest registers navigation items with the Cockpit host shell:
```json
{
  "name": "zfs-storage",
  "version": 1,
  "menu": {
    "index": {
      "label": "ZFS storage",
      "order": 33
    }
  },
  "content-security-policy": "connect-src 'self'; default-src 'self' 'unsafe-inline' 'unsafe-eval'"
}
```

---

## 2. Critical Pitfalls & Engineering Solutions

### Pitfall 1: Parent Shell Paint Invalidation & Iframe Flicker
- **Problem**: When a plugin calls `cockpit.location.go(["pools", poolName])`, Cockpit's parent frame receives a postMessage to update the outer browser URL hash. The parent frame re-evaluates its container layout, triggering a momentary paint invalidation (white/gray frame flash) on the plugin `<iframe>`.
- **Solution**:
  - Run routing **in-memory** within the iframe.
  - Update internal URL hash via `window.history.replaceState(null, "", targetHash)`.
  - Do **not** call `cockpit.location.go()` on internal tab changes unless full top-level parent synchronization is required.

---

### Pitfall 2: Component Destruction vs. In-Memory Persistent Views
- **Problem**: Using conditional rendering (`{activeTab === "topology" && <TopologyTab />}`) unmounts and destroys the DOM tree when switching tabs. React must recreate hundreds of PatternFly components from scratch, causing layout jumps and losing scroll position and filters.
- **Solution**:
  - Keep all views and subtabs persistently mounted in memory.
  - Toggle visibility using CSS:
    ```tsx
    <div style={{ display: activeTab === "topology" ? "block" : "none" }}>
      <TopologyTab pool={pool} />
    </div>
    <div style={{ display: activeTab === "datasets" ? "block" : "none" }}>
      <DatasetsTab poolName={pool.name} />
    </div>
    ```
  - Result: True **0ms redraw** with zero layout thrashing.

---

### Pitfall 3: Dropdown & Modal Clipping in Rounded Overflow Containers
- **Problem**: Tables wrapped in rounded card containers (`border-radius: 16px; overflow: hidden`) clip dropdown menus and modals. Action items at the bottom of the table (e.g. *Rename*, *Delete*) are cut off.
- **Solution**:
  - Portal all floating dropdown menus and tooltips to `document.body`:
    ```tsx
    <Dropdown
      popperProps={{
        position: "right",
        preventOverflow: true,
        appendTo: () => document.body
      }}
      isOpen={isOpen}
      onOpenChange={setIsOpen}
      toggle={(toggleRef) => (
        <MenuToggle ref={toggleRef} variant="plain" onClick={toggle}>
          <EllipsisVIcon />
        </MenuToggle>
      )}
    >
      <DropdownList>
        <DropdownItem key="rename" onClick={handleRename}>Rename</DropdownItem>
        <DropdownItem key="delete" style={{ color: "red" }} onClick={handleDelete}>Delete</DropdownItem>
      </DropdownList>
    </Dropdown>
    ```

---

### Pitfall 4: PatternFly v5 SearchInput Double Borders & Line Bleeds
- **Problem**: PatternFly v5's `<SearchInput>` renders nested `.pf-v5-c-text-input-group` elements with internal `::before` and `::after` borders. Applying `border-radius: 999px` to the outer container results in square outlines bleeding over the pill.
- **Solution**:
  - Strip inner pseudo-element borders in CSS:
    ```css
    .pf-v5-c-search-input,
    .pf-v5-c-text-input-group {
      border-radius: 999px !important;
      border: 1px solid var(--zfs-input-border) !important;
      background-color: var(--zfs-card-bg) !important;
    }
    .pf-v5-c-search-input::before,
    .pf-v5-c-search-input::after,
    .pf-v5-c-text-input-group::before,
    .pf-v5-c-text-input-group::after {
      display: none !important;
      border: none !important;
    }
    ```

---

### Pitfall 5: Dark & Light Mode Theme Synchronization & Contrast
- **Problem**:
  1. **OS Theme Leakage**: If plugin CSS uses `@media (prefers-color-scheme: dark)` root overrides, an OS in dark mode will force the iframe dark even when the Cockpit host shell is set to light mode, resulting in jarring theme mismatches.
  2. **Initial Flash**: Checking theme only inside React `useEffect` causes a white/dark flash on page reload.
  3. **Unreadable Badges**: Static dark text colors on status badges (e.g. `#004080` text on blue tint) become completely illegible against dark mode backgrounds.
  4. **PatternFly Variable Shadowing**: PatternFly components (`<Title>`, `<CardTitle>`, `<Th>`) use internal CSS variables that fall back to default white/black unless explicitly overridden for both light and dark classes.
- **Engineering Solutions**:
  - **Parent Cockpit Shell is Single Source of Truth**:
    Inside the `<head>` of `index.html`, add a blocking synchronization script:
    ```html
    <script type="text/javascript">
      (function () {
        function updateTheme() {
          let isDark = false;
          try {
            if (window.parent && window.parent !== window && window.parent.document) {
              const pClasses = window.parent.document.documentElement.classList;
              isDark = pClasses.contains("pf-v6-theme-dark") || pClasses.contains("pf-v5-theme-dark") || pClasses.contains("theme-dark");
            } else {
              isDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
            }
          } catch {
            isDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
          }
          if (isDark) {
            document.documentElement.classList.add("pf-v5-theme-dark", "pf-v6-theme-dark", "theme-dark");
            document.documentElement.classList.remove("theme-light", "pf-m-light");
          } else {
            document.documentElement.classList.remove("pf-v5-theme-dark", "pf-v6-theme-dark", "theme-dark");
            document.documentElement.classList.add("theme-light", "pf-m-light");
          }
        }
        updateTheme();
        try {
          if (window.parent && window.parent.document) {
            const observer = new MutationObserver(updateTheme);
            observer.observe(window.parent.document.documentElement, { attributes: true, attributeFilter: ["class"] });
          }
        } catch {}
        setInterval(updateTheme, 500);
      })();
    </script>
    ```
  - **Purge Raw CSS `@media (prefers-color-scheme: dark)` Root Blocks**:
    Theme variables must be strictly governed by CSS classes (`:root` for light, `:root.pf-v5-theme-dark, :root.pf-v6-theme-dark, :root.theme-dark` for dark), never raw media queries.
  - **Explicit High-Contrast Dual-Mode Badge Tokens**:
    ```css
    /* Light mode badges: dark colored text on soft tint */
    .pf-v5-c-label.pf-m-blue, .pf-v5-c-badge.pf-m-blue {
      background-color: rgba(0, 102, 204, 0.12) !important;
      color: #004080 !important;
      border: 1px solid rgba(0, 102, 204, 0.3) !important;
    }
    /* Dark mode badges: bright pastel text on deep tint with matching border */
    .pf-v5-theme-dark .pf-v5-c-label.pf-m-blue,
    .pf-v6-theme-dark .pf-v5-c-label.pf-m-blue,
    .theme-dark .pf-v5-c-label.pf-m-blue {
      background-color: rgba(0, 102, 204, 0.25) !important;
      color: #73bcf7 !important;
      border: 1px solid rgba(115, 188, 247, 0.4) !important;
    }
    ```
  - **Modal Backdrop Edge Fadeout Mask**:
    Prevent hard dark borders over the Cockpit shell using a gradient mask:
    ```css
    .pf-v5-c-backdrop::before {
      content: "" !important;
      position: absolute !important;
      inset: 0 !important;
      z-index: -1 !important;
      background-color: rgba(0, 0, 0, 0.6) !important;
      mask-image:
        linear-gradient(to right, transparent 0px, black 10px, black calc(100% - 10px), transparent 100%),
        linear-gradient(to bottom, transparent 0px, black 10px, black calc(100% - 10px), transparent 100%) !important;
      mask-composite: intersect !important;
    }
    ```

---

### Pitfall 6: Backend Execution & Privilege Elevation
- **Problem**: Direct shell command execution from the browser is vulnerable to escaping bugs and lacks structured error handling.
- **Solution**:
  - Encapsulate all operations inside a Python 3 helper (`zfs_helper.py`) in `/usr/libexec/cockpit-zfs/`.
  - Output strict JSON envelopes: `{"status": "ok", "data": ...}` or `{"status": "error", "message": ...}`.
  - Invoke via `cockpit.spawn(["/usr/libexec/cockpit-zfs/zfs_helper.py", "<cmd>", ...], { superuser: "try" })`.
  - Always provide typed confirmation dialogs (`DestroyModal`) with shell command preview for destructive actions.

---

## 3. Debian Packaging & APT Repository

Cockpit plugins on Debian/Ubuntu are deployed as architecture-independent (`Architecture: all`) packages.

### Debian Package Structure
```
cockpit-zfs-storage_1.0.0_all.deb
├── debian-binary (2.0)
├── control.tar.gz
│   ├── control (Package: cockpit-zfs-storage, Depends: cockpit, zfsutils-linux, ...)
│   └── postinst (chmod 755 /usr/libexec/cockpit-zfs/zfs_helper.py)
└── data.tar.gz
    ├── usr/share/cockpit/zfs-storage/
    └── usr/libexec/cockpit-zfs/zfs_helper.py
```

### Automated APT Repository Generation
GitHub Pages can host a complete APT repository containing `pool/`, `dists/stable/main/binary-all/Packages.gz`, and `Release` files, allowing end users to install and update plugins via standard `apt update && apt install cockpit-zfs-storage`.

---

## 4. Automated E2E CI Testing & Headless Pitfalls

Testing Cockpit plugins with Playwright in headless CI (GitHub Actions) requires addressing several headless virtualization pitfalls:

1. **Linux PAM & Shadow Authentication**:
   - `useradd` leaves password hashes disabled (`!`) and shadow aging uninitialized in `/etc/shadow`.
   - Set SHA-512 hashes via `openssl passwd -6`, unlock account with `passwd -u`, and initialize aging via `chage -d 20000 -m 0 -M 99999 -I -1 -E -1`.
   - Configure `/etc/pam.d/cockpit` and set `AllowUnencrypted = true` in `/etc/cockpit/cockpit.conf`.

2. **Iframe Scoping in Playwright**:
   - Cockpit hosts plugins in an isolated iframe. Scope all test locators to `frameElement.contentFrame()` rather than the root page.

3. **Virtual Loop Block Devices**:
   - Headless CI runners lack physical storage drives. Loop devices (`/dev/loop0-3`) must be permitted by block parsers (`lsblk -a`), and `smartctl` execution must be bypassed for loop devices.

