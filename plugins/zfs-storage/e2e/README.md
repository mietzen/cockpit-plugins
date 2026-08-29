# Cockpit ZFS Storage E2E Testing Guide & Troubleshooting

This document records the end-to-end (E2E) testing architecture, requirements, and solutions to issues encountered when running automated Playwright tests against live Cockpit and OpenZFS in headless CI environments (GitHub Actions) and local VMs.

---

## Architecture Overview

Cockpit plugins execute inside a sandboxed iframe embedded within the Cockpit shell. Automated browser tests must handle:
1. System-level PAM authentication and session elevation.
2. Cross-frame DOM traversal (Cockpit Host vs Plugin Iframe).
3. Live OpenZFS kernel module and virtual block device management.

```
┌─────────────────────────────────────────────────────────────┐
│ Playwright Test Runner (Chromium)                           │
└──────────────┬──────────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────────┐
│ Cockpit Host Web Service (port 9090)                        │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Top-Level Shell (Sidebar, Navigation, Top Bar)          │ │
│ └─────────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Plugin Iframe (name="cockpit1:localhost/zfs-storage")   │ │
│ │ ┌─────────────────────────────────────────────────────┐ │ │
│ │ │ React + PatternFly v5 UI (#root)                    │ │ │
│ │ └──────────┬──────────────────────────────────────────┘ │ │
│ └────────────┼────────────────────────────────────────────┘ │
└──────────────┼──────────────────────────────────────────────┘
               │ cockpit.spawn (superuser: 'require')
               ▼
┌─────────────────────────────────────────────────────────────┐
│ Backend Helper (/usr/libexec/cockpit-zfs/zfs_helper.py)     │
└──────────────┬──────────────────────────────────────────────┘
               │ zpool / zfs / lsblk
               ▼
┌─────────────────────────────────────────────────────────────┐
│ Linux Kernel & OpenZFS (Loop Devices /tmp/zfs-test-disks)   │
└─────────────────────────────────────────────────────────────┘
```

---

## Troubleshooting & Solutions

### 1. Linux PAM & Shadow Authentication in Headless CI

- **Symptom**: Playwright was unable to log into Cockpit via web form (401 Unauthorized, login loop, or account disabled errors).
- **Root Cause**:
  - `useradd` creates accounts with uninitialized/disabled password hashes (`!`) in `/etc/shadow`.
  - Default PAM stacks on Ubuntu/Debian enforce account aging rules that fail for newly provisioned headless accounts.
- **Solution** (`setup_test_env.sh`):
  - Generate explicit SHA-512 password hash via `openssl passwd -6 "password"` and apply via `usermod -p` and `chpasswd`.
  - Unlock user accounts with `passwd -u <user>`.
  - Initialize shadow account expiration parameters via `chage -d 20000 -m 0 -M 99999 -I -1 -E -1 <user>`.
  - Configure `/etc/pam.d/cockpit` with standard authentication includes.
  - Set `AllowUnencrypted = true` and allowed `Origins` in `/etc/cockpit/cockpit.conf`.
  - Pre-generate TLS self-signed certificates in `/etc/cockpit/ws-certs.d/0-self-signed.cert`.

---

### 2. Cockpit Iframe DOM Scoping

- **Symptom**: Playwright locators timed out searching for `#root` or UI buttons on the page.
- **Root Cause**: Cockpit isolates plugins in an iframe (`<iframe src="/zfs-storage">`). Locators executed on `page.locator(...)` search the host shell, not the plugin DOM.
- **Solution** (`zfs_plugin.spec.ts`):
  - Implemented `getFrame()` helper:
    ```typescript
    async function getFrame(): Promise<Frame> {
      const frameElement = await page.waitForSelector(
        "iframe[name*='zfs-storage'], iframe[src*='zfs-storage']",
        { state: "attached", timeout: 15000 }
      );
      const frame = await frameElement.contentFrame();
      if (!frame) throw new Error("Cockpit iframe contentFrame is null");
      return frame;
    }
    ```
  - All plugin UI interactions are scoped via `frame.locator(...)`.

---

### 3. Virtual Block Device & SMART Health Enumeration

- **Symptom**: Pool creation wizard showed no available disks in CI, or backend crashed during drive enumeration.
- **Root Cause**:
  - Virtual GitHub Actions runners have no physical drives; tests use loop devices (`/dev/loop0-3`).
  - Block parser filtered out non-`disk` types (`TYPE == 'loop'`).
  - `smartctl` returns exit code 1 or 2 on loop devices.
- **Solution** (`parsers.py` & `zfs_helper.py`):
  - Permitted `TYPE in ("disk", "loop")` in `parse_lsblk`.
  - Added `-a` flag to `lsblk -b -J -o NAME,SIZE,TYPE,TRAN,MODEL,SERIAL,ROTA,MOUNTPOINTS,FSTYPE -a`.
  - Added conditional bypass for `smartctl` on loop block devices (`if name.startswith("loop"): skip`).

---

### 4. PatternFly v5 Wizard Next Button Argument Handling

- **Symptom**: Clicking "Next" in the Create Pool Wizard failed to navigate to Step 2.
- **Root Cause**: PatternFly v5 Wizard `onNext` signature expects `() => void`. Passing `onClick={onNext}` directly passes the React SyntheticMouseEvent `(e)` as the first argument, which PF interpreted as a target step ID and failed navigation.
- **Solution** (`CreatePoolWizard.tsx`):
  - Explicitly wrapped button callback:
    ```typescript
    const handleNext = () => {
      onNext();
    };
    ```

---

## Running E2E Tests

### Local Execution (Debian/Ubuntu/DevContainer)

```shell
# 1. Setup loop devices and Cockpit test user
sudo bash plugins/zfs-storage/e2e/setup_test_env.sh

# 2. Run Playwright test suite
make e2e
```
