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

### Pitfall 5: Dark & Light Mode Theme Synchronization
- **Problem**: If the theme is checked only inside React `useEffect`, light mode flashes white before switching to dark mode during page refresh.
- **Solution**:
  - Add an inline blocking script in `<head>` of `index.html`:
    ```html
    <script type="text/javascript">
      (function () {
        const theme = localStorage.getItem("cockpit_zfs_theme") || localStorage.getItem("shell:style") || "auto";
        const isDark = theme === "dark" || (theme === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);
        if (isDark) {
          document.documentElement.classList.add("pf-v5-theme-dark");
        } else {
          document.documentElement.classList.remove("pf-v5-theme-dark");
        }
      })();
    </script>
    ```
  - Listen to `storage` and `cockpit-style` events in React.

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
