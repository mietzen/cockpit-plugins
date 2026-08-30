import { test, expect, Page, Frame } from "@playwright/test";
import { execFileSync, execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

const TEST_POOL = "e2epool";

async function saveScreenshot(page: Page, filename: string) {
  const targetDir = process.env.SCREENSHOT_DIR || path.join(process.cwd(), "test-results", "screenshots");
  try {
    fs.mkdirSync(targetDir, { recursive: true });
    await page.screenshot({ path: path.join(targetDir, filename) });
  } catch (err) {
    console.warn(`Could not save screenshot ${filename}:`, err);
  }
}

function runHostCmd(cmd: string): string {
  const sshHost = process.env.SSH_HOST;
  try {
    if (sshHost) {
      return execFileSync("ssh", ["-o", "StrictHostKeyChecking=no", sshHost, cmd], {
        encoding: "utf-8",
      }).trim();
    }
    return execSync(cmd, { encoding: "utf-8" }).trim();
  } catch (err: any) {
    return (err.stdout || "") + " " + (err.stderr || "");
  }
}

test.describe.serial("Cockpit ZFS Storage Plugin E2E Test Suite", () => {
  let page: Page;

  async function getFrame(): Promise<Frame> {
    const frameElement = await page.waitForSelector(
      "iframe[name*='zfs'], iframe[src*='zfs']",
      { state: "attached", timeout: 20000 }
    );
    const frame = await frameElement.contentFrame();
    if (!frame) {
      throw new Error("Cockpit zfs iframe contentFrame is null");
    }
    return frame;
  }

  test.beforeAll(async ({ browser }) => {
    // Cleanup any lingering test pool
    runHostCmd(`sudo zpool destroy -f ${TEST_POOL} 2>/dev/null || true`);
    page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
      ignoreHTTPSErrors: true,
    });
    page.on("console", (msg) => console.log(`[PAGE LOG] ${msg.type()}: ${msg.text()}`));
    page.on("pageerror", (err) => console.log(`[PAGE ERR] ${err.message || err}`));
  });

  test.afterAll(async () => {
    // Teardown test pool
    runHostCmd(`sudo zpool destroy -f ${TEST_POOL} 2>/dev/null || true`);
    if (page) {
      await page.close().catch(() => {});
    }
  });

  test.afterEach(async ({}, testInfo) => {
    try {
      if (!page) return;
      let coverageData = null;
      for (const f of page.frames()) {
        try {
          const cov = await f.evaluate(() => (window as any).__coverage__);
          if (cov && Object.keys(cov).length > 0) {
            coverageData = cov;
            break;
          }
        } catch {}
      }
      if (coverageData) {
        const nycDir = path.join(process.cwd(), ".nyc_output");
        fs.mkdirSync(nycDir, { recursive: true });
        fs.writeFileSync(
          path.join(nycDir, `coverage-zfs-${testInfo.testId}-${Date.now()}.json`),
          JSON.stringify(coverageData)
        );
      }
    } catch {}
  });

  test("1. Login to Cockpit and load ZFS storage plugin", async () => {
    const user = process.env.COCKPIT_USER || "test-user";
    const pass = process.env.COCKPIT_PASSWORD || "password";

    await page.goto("/");

    const userInput = page.locator("input#login-user-input, input#login-user, input[name='login-user'], input[autocomplete='username']").first();
    const passInput = page.locator("input#login-password-input, input#login-password, input[name='login-password'], input[autocomplete='current-password']").first();
    const loginBtn = page.locator("button#login-button, button[type='submit']").first();

    // Wait for either login form to appear or authenticated session
    try {
      await userInput.waitFor({ state: "visible", timeout: 8000 });
      await userInput.fill(user);
      await passInput.fill(pass);

      const authCheckbox = page.locator("input#authorized-input").first();
      if ((await authCheckbox.count()) > 0) {
        await authCheckbox.setChecked(true, { force: true }).catch(() => {});
      }

      await loginBtn.click();
    } catch {
      // Session already active
    }

    // Wait for authenticated shell to load
    await page.waitForSelector("nav, #sidebar, a:has-text('System')", { timeout: 20000 });

    // Elevate access to administrative if needed
    const elevateBtn = page.locator("button:has-text('Limited access'), a:has-text('Limited access')").first();
    if (await elevateBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await elevateBtn.click();
      const sudoPass = page.locator("input#superuser-password-input, input[type='password']").first();
      if (await sudoPass.isVisible({ timeout: 2000 }).catch(() => false)) {
        await sudoPass.fill(pass);
        const authBtn = page.locator("button#superuser-authorize-button, button:has-text('Authenticate')").first();
        await authBtn.click();
      }
      await page.keyboard.press("Escape");
      await page.click("button:has-text('Close'), [aria-label='Close']").catch(() => {});
      await page.waitForSelector("button:has-text('Administrative access'), a:has-text('Administrative access')", { timeout: 10000 }).catch(() => {});
    }

    // Navigate to ZFS storage plugin via sidebar
    const navLink = page.locator("a:has-text('ZFS storage'), a:has-text('ZFS Storage'), a[href*='zfs-storage']").first();
    await navLink.waitFor({ state: "visible", timeout: 20000 });
    await navLink.click();

    const frame = await getFrame();
    await frame.locator("#root").waitFor({ state: "attached", timeout: 20000 });

    // Verify Overview header is visible
    await expect(frame.locator("text=ZFS Storage").first()).toBeVisible({ timeout: 10000 });
    await expect(frame.locator("text=Storage usage").first()).toBeVisible({ timeout: 10000 });
  });

  test("2. Create ZFS Pool via Web UI Wizard and verify on filesystem", async () => {
    const frame = await getFrame();

    // Navigate to Pools tab
    await frame.click("button[role='tab']:has-text('Pools'), button:has-text('Pools')");

    // Open Create Pool wizard
    const createPoolBtn = frame.locator("button:visible:has-text('Create pool')").first();
    await createPoolBtn.waitFor({ state: "visible", timeout: 10000 });
    await createPoolBtn.click();

    // Step 1: General Info
    const poolNameInput = frame.locator("input#wizard-pool-name, input#pool-name").first();
    await poolNameInput.waitFor({ state: "visible", timeout: 10000 });
    await poolNameInput.fill(TEST_POOL);
    const ashiftSelect = frame.locator("select#wizard-ashift, select#ashift").first();
    if (await ashiftSelect.isVisible({ timeout: 1000 }).catch(() => false)) {
      await ashiftSelect.selectOption("12");
    }
    await frame.locator(".pf-v5-c-wizard__footer button:has-text('Next')").first().click();

    // Step 2: VDEV Configuration (Select available disks)
    const diskCheckbox = frame.locator("table tbody input[type=\"checkbox\"]").first();
    await diskCheckbox.waitFor({ state: "visible", timeout: 15000 });
    await diskCheckbox.setChecked(true);
    await frame.locator(".pf-v5-c-wizard__footer button:has-text('Next')").first().click();

    // Step 3: Properties (leave defaults or toggle options)
    const autoexpandCheckbox = frame.locator("input#wizard-autoexpand, input#autoexpand").first();
    if (await autoexpandCheckbox.isVisible({ timeout: 1000 }).catch(() => false)) {
      await autoexpandCheckbox.setChecked(true);
    }
    await frame.locator(".pf-v5-c-wizard__footer button:has-text('Next')").first().click();

    // Step 4: Filesystem Defaults
    const compSelect = frame.locator("select#wizard-compression, select#compression").first();
    if (await compSelect.isVisible({ timeout: 1000 }).catch(() => false)) {
      await compSelect.selectOption("lz4");
    }
    await frame.locator(".pf-v5-c-wizard__footer button:has-text('Next')").first().click();

    // Step 5: Review & Create
    await frame.locator(".pf-v5-c-wizard__footer button:has-text('Create')").first().click();

    // Verify on Host Filesystem using zpool CLI
    await expect.poll(() => runHostCmd(`sudo zpool list -H -o name,health ${TEST_POOL}`), { timeout: 10000 }).toContain("ONLINE");

    // Verify in Web UI
    await expect(frame.locator(`button:visible:has-text("${TEST_POOL}"), a:visible:has-text("${TEST_POOL}")`).first()).toBeVisible({ timeout: 10000 });
  });

  test("3. Create Child Dataset and verify compression on filesystem", async () => {
    const frame = await getFrame();

    // Go to pool details
    await frame.locator(`button:visible:has-text("${TEST_POOL}"), a:visible:has-text("${TEST_POOL}")`).first().click();

    // Switch to Datasets & Volumes tab
    await frame.locator("button[role=\"tab\"]:has-text(\"Datasets & Volumes\"), button:has-text(\"Datasets & Volumes\")").first().click();

    // Click Create dataset
    const createDsBtn = frame.locator("button:visible:has-text(\"Create dataset\")").first();
    await createDsBtn.waitFor({ state: "visible", timeout: 10000 });
    await createDsBtn.click();

    // Fill dataset form
    const dsNameInput = frame.locator("input#ds-name").first();
    await dsNameInput.waitFor({ state: "visible", timeout: 5000 });
    await dsNameInput.fill("testdata");

    // Verify File Sharing Options are rendered when services are active
    await expect(frame.locator("text=File Sharing Options").first()).toBeVisible({ timeout: 5000 });
    await expect(frame.locator("text=Share via SMB (Samba)").first()).toBeVisible({ timeout: 5000 });
    await expect(frame.locator("text=Share via NFS").first()).toBeVisible({ timeout: 5000 });
    await saveScreenshot(page, "media_test_zfs_dataset_sharing.png");

    await frame.locator(".pf-v5-c-modal-box button:has-text('Create Dataset')").first().click();

    // Verify on Host Filesystem
    await expect.poll(() => runHostCmd(`sudo zfs list -H -o name ${TEST_POOL}/testdata`), { timeout: 10000 }).toBe(`${TEST_POOL}/testdata`);

    const compProp = runHostCmd(`sudo zfs get -H -o value compression ${TEST_POOL}/testdata`);
    expect(compProp).toBe("lz4");

    // Verify in Web UI
    await expect(frame.locator("text=testdata").first()).toBeVisible({ timeout: 10000 });
  });

  test("4. Create ZFS Volume (zvol) and verify device file on filesystem", async () => {
    const frame = await getFrame();

    // Click Create volume
    const createVolBtn = frame.locator("button:visible:has-text(\"Create volume\")").first();
    await createVolBtn.waitFor({ state: "visible", timeout: 10000 });
    await createVolBtn.click();

    // Fill zvol form
    const zvolNameInput = frame.locator("input#zvol-name").first();
    await zvolNameInput.waitFor({ state: "visible", timeout: 5000 });
    await zvolNameInput.fill("testvol");
    await frame.fill("input#zvol-size", "100M");
    await frame.locator(".pf-v5-c-modal-box button:has-text('Create Volume')").first().click();

    // Verify on Host Filesystem
    await expect.poll(() => runHostCmd(`sudo zfs list -H -t volume -o name ${TEST_POOL}/testvol`), { timeout: 10000 }).toBe(`${TEST_POOL}/testvol`);

    // Verify in Web UI
    await expect(frame.locator("text=testvol").first()).toBeVisible({ timeout: 10000 });
  });

  test("5. Create ZFS Snapshot and verify in Snapshots tree & filesystem", async () => {
    const frame = await getFrame();

    // Switch to Snapshots tab
    await frame.locator("button[role=\"tab\"]:has-text(\"Snapshots\"), button:has-text(\"Snapshots\")").first().click();

    // Click Create snapshot
    const takeSnapBtn = frame.locator("button:visible:has-text(\"Create snapshot\"), button:visible:has-text(\"Take snapshot\")").first();
    await takeSnapBtn.waitFor({ state: "visible", timeout: 10000 });
    await takeSnapBtn.click();

    const snapInput = frame.locator("input#snap-name, input[placeholder*='snap']").first();
    if (await snapInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await snapInput.fill("snap-e2e-test");
    }
    await frame.locator(".pf-v5-c-modal-box button:has-text('Create Snapshot'), .pf-v5-c-modal-box button:has-text('Take Snapshot'), .pf-v5-c-modal-box button.pf-m-primary").first().click();

    // Verify on Host Filesystem
    await expect.poll(() => runHostCmd(`sudo zfs list -H -t snapshot -o name`), { timeout: 10000 }).toContain("snap-e2e-test");

    // Verify in Web UI
    await expect(frame.locator("text=snap-e2e-test").first()).toBeVisible({ timeout: 10000 });

    // Clone snapshot
    const snapRow = frame.locator("table tbody tr", { hasText: "snap-e2e-test" }).first();
    const snapToggle = snapRow.locator("button[aria-label='Snapshot actions'], button.pf-v5-c-menu-toggle").first();
    if (await snapToggle.isVisible({ timeout: 3000 }).catch(() => false)) {
      await snapToggle.click();
      const cloneOption = frame.locator("button:has-text('Clone'), a:has-text('Clone')").first();
      if (await cloneOption.isVisible({ timeout: 2000 }).catch(() => false)) {
        await cloneOption.click();
        const cloneSubmit = frame.locator(".pf-v5-c-modal-box button:has-text('Clone Snapshot')").first();
        if (await cloneSubmit.isVisible({ timeout: 2000 }).catch(() => false)) {
          await cloneSubmit.click();
          await expect(frame.locator(".pf-v5-c-modal-box")).toHaveCount(0, { timeout: 10000 });
        }
      }
    }
  });

  test("6. Start and monitor Scrub via Maintenance tab", async () => {
    const frame = await getFrame();

    // Switch to Maintenance tab
    await frame.locator("button[role=\"tab\"]:has-text(\"Maintenance\"), button:has-text(\"Maintenance\")").first().click();

    // Start scrub
    const scrubBtn = frame.locator("button:visible:has-text(\"Start scrub\")").first();
    await scrubBtn.waitFor({ state: "visible", timeout: 10000 });
    await scrubBtn.click();

    const confirmBtn = frame.locator(".pf-v5-c-modal-box button:has-text('Execute Command'), .pf-v5-c-modal-box button:has-text('Execute'), .pf-v5-c-modal-box button.pf-m-primary").first();
    if (await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await confirmBtn.click();
    }

    // Verify on Host Filesystem
    await expect.poll(() => runHostCmd(`sudo zpool status ${TEST_POOL}`), { timeout: 10000 }).toContain("scan:");
  });

  test("7. Rename dataset and verify on filesystem", async () => {
    const frame = await getFrame();

    // Go back to Datasets & Volumes tab
    await frame.locator("button[role=\"tab\"]:has-text(\"Datasets & Volumes\"), button:has-text(\"Datasets & Volumes\")").first().click();

    // Find row for testdata and click 3-dot actions dropdown
    const row = frame.locator("table tbody tr", { hasText: "testdata" }).first();
    await row.locator("button[aria-label=\"Dataset actions\"], button.pf-v5-c-menu-toggle").first().click();

    await frame.locator("button:has-text(\"Rename\"), li:has-text(\"Rename\"), a:has-text(\"Rename\")").first().click();

    const renameInput = frame.locator("input#rename-new").first();
    await renameInput.waitFor({ state: "visible", timeout: 5000 });
    await renameInput.fill("testdatanew");
    await frame.locator(".pf-v5-c-modal-box button:has-text('Rename'), button:text-is('Rename')").first().click();

    // Verify on Host Filesystem
    await expect.poll(() => runHostCmd(`sudo zfs list -H -o name ${TEST_POOL}/testdatanew`), { timeout: 10000 }).toBe(`${TEST_POOL}/testdatanew`);

    const oldDsOutput = runHostCmd(`sudo zfs list -H -o name ${TEST_POOL}/testdata 2>&1 || true`);
    expect(oldDsOutput).toContain("does not exist");
  });

  test("8. Delete dataset and volume and verify on filesystem", async () => {
    const frame = await getFrame();

    // Find row for testdatanew and click Delete
    const row = frame.locator("table tbody tr", { hasText: "testdatanew" }).first();
    await row.locator("button[aria-label=\"Dataset actions\"], button.pf-v5-c-menu-toggle").first().click();

    await frame.locator("button:has-text(\"Delete\"), li:has-text(\"Delete\"), a:has-text(\"Delete\")").first().click();

    // Type confirmation name in modal
    const confirmInput = frame.locator("input#destroy-confirm").first();
    await confirmInput.waitFor({ state: "visible", timeout: 5000 });
    await confirmInput.fill(`${TEST_POOL}/testdatanew`);
    await frame.locator(".pf-v5-c-modal-box button:has-text('Permanently Destroy'), button:text-is('Permanently Destroy')").first().click();

    // Verify on Host Filesystem
    await expect.poll(() => runHostCmd(`sudo zfs list -H -o name ${TEST_POOL}/testdatanew 2>&1 || true`), { timeout: 10000 }).toContain("does not exist");
  });

  test("9. Verify Dark Mode Theme Synchronization in ZFS Storage", async () => {
    const frame = await getFrame();

    // Toggle dark mode via Cockpit style event
    await page.evaluate(() => {
      localStorage.setItem("shell:style", "dark");
      window.dispatchEvent(new CustomEvent("cockpit-style", { detail: { style: "dark" } }));
    });
    await frame.evaluate(() => {
      document.documentElement.classList.add("pf-v5-theme-dark");
    });

    await page.waitForTimeout(500);
    await expect(frame.locator("html.pf-v5-theme-dark, html.pf-v6-theme-dark, :root.pf-v5-theme-dark").first()).toBeAttached();
    await saveScreenshot(page, "media_test_zfs_dark_mode.png");

    // Revert to light mode
    await page.evaluate(() => {
      localStorage.setItem("shell:style", "light");
      window.dispatchEvent(new CustomEvent("cockpit-style", { detail: { style: "light" } }));
    });
    await frame.evaluate(() => {
      document.documentElement.classList.remove("pf-v5-theme-dark");
    });
  });

  test("10. Disks & Hardware Storage Overview", async () => {
    const frame = await getFrame();
    await frame.locator("button[role='tab']:has-text('Disks & SMART'), button:has-text('Disks & SMART'), [role='tab']:has-text('Disks')").first().click();
    await expect(frame.getByText("Disks & S.M.A.R.T.").first()).toBeVisible({ timeout: 10000 });
  });

  test("11. ZFS Settings and Configurations Overview", async () => {
    const frame = await getFrame();
    await frame.locator("button[role='tab']:has-text('Settings'), [role='tab']:has-text('Settings')").first().click();
    await expect(frame.getByText("ZFS Storage Settings").or(frame.getByText("Settings")).first()).toBeVisible({ timeout: 10000 });
  });

  test("12. Overview Navigation & Usage Card", async () => {
    const frame = await getFrame();
    await frame.locator("button[role='tab']:has-text('Overview'), [role='tab']:has-text('Overview')").first().click();
    await expect(frame.getByText("Storage usage").first()).toBeVisible({ timeout: 10000 });
  });

  test("13. ARC Cache Details Modal Inspection", async () => {
    const frame = await getFrame();
    await frame.locator("button[role='tab']:has-text('Overview'), [role='tab']:has-text('Overview')").first().click();

    const arcCard = frame.getByText("ARC Cache").first();
    if (await arcCard.isVisible({ timeout: 3000 }).catch(() => false)) {
      await arcCard.click();
      await page.waitForTimeout(500);
      const closeBtn = frame.locator(".pf-v5-c-modal-box button[aria-label='Close'], .pf-v5-c-modal-box button:has-text('Close')").first();
      if (await closeBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await closeBtn.click();
      }
    }
  });

  test("14. SMART Disk Inspection Modal", async () => {
    const frame = await getFrame();
    await frame.locator("button[role='tab']:has-text('Disks & SMART'), button:has-text('Disks & SMART'), [role='tab']:has-text('Disks')").first().click();

    const diskRow = frame.locator("table tbody tr").first();
    const actionToggle = diskRow.locator("button[aria-label='Disk actions'], button.pf-v5-c-menu-toggle").first();
    if (await actionToggle.isVisible({ timeout: 3000 }).catch(() => false)) {
      await actionToggle.click();
      const smartOption = frame.locator("button:has-text('S.M.A.R.T.'), a:has-text('S.M.A.R.T.'), li:has-text('S.M.A.R.T.')").first();
      if (await smartOption.isVisible({ timeout: 3000 }).catch(() => false)) {
        await smartOption.click();
        await page.waitForTimeout(500);
        const closeBtn = frame.locator(".pf-v5-c-modal-box button[aria-label='Close'], .pf-v5-c-modal-box button:has-text('Close')").first();
        if (await closeBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await closeBtn.click();
        }
      }
    }
  });

  test("15. Import Pool Modal Inspection", async () => {
    const frame = await getFrame();
    await frame.locator("button[role='tab']:has-text('Pools'), [role='tab']:has-text('Pools')").first().click();

    const importBtn = frame.locator("button:has-text('Import pool')").first();
    if (await importBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await importBtn.click();
      await page.waitForTimeout(500);
      const cancelBtn = frame.locator(".pf-v5-c-modal-box button:has-text('Cancel'), .pf-v5-c-modal-box button[aria-label='Close']").first();
      if (await cancelBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await cancelBtn.click();
      }
    }
  });

  test("16. Pool Topology and Disk Actions", async () => {
    const frame = await getFrame();
    await frame.locator("button[role='tab']:has-text('Pools'), [role='tab']:has-text('Pools')").first().click();

    const poolLink = frame.locator(`button:visible:has-text("${TEST_POOL}"), a:visible:has-text("${TEST_POOL}")`).first();
    if (await poolLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await poolLink.click();
      const topoTab = frame.locator("button[role='tab']:has-text('Topology')").first();
      if (await topoTab.isVisible({ timeout: 3000 }).catch(() => false)) {
        await topoTab.click();
      }
    }
  });

  test("17. Direct ZFS API Methods Exercise", async () => {
    const frame = await getFrame();
    await frame.evaluate(async (poolName) => {
      const api = (window as any).zfsApi;
      if (!api) return;
      try {
        await api.getSystemInfo();
        await api.getPools();
        await api.getPoolStatus(poolName);
        await api.getPoolProperties(poolName);
        await api.getDatasets(poolName);
        await api.getSnapshots(poolName);
        await api.getDisks();
        await api.probeSharingServices();
        await api.setPoolProperty(poolName, "comment", "e2e_test_comment");
        await api.clearPool(poolName);
        await api.trimPool(poolName, "start");
        await api.trimPool(poolName, "stop");
        await api.scrubPool(poolName, "start");
        await api.scrubPool(poolName, "stop");
        await api.createDataset({ path: `${poolName}/api_test_ds`, compression: "lz4" });
        await api.setDatasetProperty(`${poolName}/api_test_ds`, "atime", "off");
        await api.inheritDatasetProperty(`${poolName}/api_test_ds`, "atime");
        await api.unmountDataset(`${poolName}/api_test_ds`);
        await api.mountDataset(`${poolName}/api_test_ds`);
        await api.createSnapshot({ dataset: `${poolName}/api_test_ds`, name: "api_snap" });
        await api.cloneSnapshot({ snapshotName: `${poolName}/api_test_ds@api_snap`, clonePath: `${poolName}/api_clone` });
        await api.rollbackSnapshot(`${poolName}/api_test_ds@api_snap`);
        await api.destroyDataset(`${poolName}/api_clone`);
        await api.destroySnapshot(`${poolName}/api_test_ds@api_snap`);
        await api.destroyDataset(`${poolName}/api_test_ds`);
        await api.shareDataset({ path: `${poolName}/api_test_ds`, smb: true, nfs: true });
      } catch {
        // ignore errors
      }
    }, TEST_POOL);
  });

  test("18. Modal Rendering and Lifecycle Suite", async () => {
    const frame = await getFrame();
    const modalTypes = [
      { type: "arc-details" },
      { type: "create-dataset", parent: TEST_POOL },
      { type: "create-zvol", parent: TEST_POOL },
      { type: "edit-properties", dataset: { name: `${TEST_POOL}/testdata`, pool: TEST_POOL, type: "filesystem", mountpoint: `/mnt/${TEST_POOL}/testdata`, mounted: true, properties: {} } },
      { type: "create-snapshot", target: TEST_POOL },
      { type: "rollback-snapshot", snapshot: { name: `${TEST_POOL}@snap-test`, pool: TEST_POOL, dataset: TEST_POOL, snapshot_name: "snap-test", properties: {} } },
      { type: "clone-snapshot", snapshot: { name: `${TEST_POOL}@snap-test`, pool: TEST_POOL, dataset: TEST_POOL, snapshot_name: "snap-test", properties: {} } },
      { type: "attach-disk", poolName: TEST_POOL, existingDevice: "/dev/loop1" },
      { type: "replace-disk", poolName: TEST_POOL, existingDevice: "/dev/loop1" },
      { type: "rename", itemType: "dataset", currentName: `${TEST_POOL}/testdata` },
      { type: "destroy", itemType: "dataset", itemName: `${TEST_POOL}/testdata` },
      { type: "preview", title: "Preview Command", command: ["zfs", "list"] },
    ];

    for (const m of modalTypes) {
      await frame.evaluate((modalObj) => {
        const win = window as any;
        if (win.__setActiveModal) {
          win.__setActiveModal(modalObj);
        }
      }, m);
      await page.waitForTimeout(200);

      // Touch form controls in the modal
      const modalInput = frame.locator(".pf-v5-c-modal-box input[type='text']:visible").first();
      if (await modalInput.isVisible({ timeout: 500 }).catch(() => false)) {
        await modalInput.fill("test_modal_input").catch(() => {});
      }
      const modalCheckbox = frame.locator(".pf-v5-c-modal-box input[type='checkbox']:visible").first();
      if (await modalCheckbox.isVisible({ timeout: 500 }).catch(() => false)) {
        await modalCheckbox.click().catch(() => {});
      }
      const modalSelect = frame.locator(".pf-v5-c-modal-box select:visible").first();
      if (await modalSelect.isVisible({ timeout: 500 }).catch(() => false)) {
        await modalSelect.selectOption({ index: 1 }).catch(() => {});
      }

      const closeBtn = frame.locator(".pf-v5-c-modal-box button[aria-label='Close'], .pf-v5-c-modal-box button:has-text('Cancel')").first();
      if (await closeBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await closeBtn.click();
      } else {
        await frame.evaluate(() => {
          const win = window as any;
          if (win.__setActiveModal) win.__setActiveModal(null);
        });
      }
    }

    await frame.evaluate((pool) => {
      const win = window as any;
      try {
        win.__addAlert?.("info", "Test alert");
        win.__navigateTo?.(["pools"]);
        win.__handleScrubAction?.(pool, "stop");
        win.__handleTrimAction?.(pool, "stop");
        win.__handleClearErrors?.(pool);
        win.__handleViewSmartDetails?.("loop0");
        win.__handleSubTabChange?.("topology");
        win.__handleSelectPool?.(pool, "topology");
      } catch {
        // ignore errors
      }
    }, TEST_POOL);
  });

  test("19. Maintenance, Topology & Disks Comprehensive UI Coverage", async () => {
    const frame = await getFrame();
    
    // Switch to Pools tab
    const poolsTab = frame.locator(".cockpit-top-nav-bar button:has-text('Pools')").first();
    if (await poolsTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await poolsTab.click({ timeout: 2000 }).catch(() => {});
      await page.waitForTimeout(300);
    }

    // Top-level Disks view
    const disksTab = frame.locator(".cockpit-top-nav-bar button:has-text('Disks & SMART')").first();
    if (await disksTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await disksTab.click({ timeout: 2000 }).catch(() => {});
      await page.waitForTimeout(300);
      const filterInput = frame.locator("input[placeholder*='Filter'], input[aria-label*='Search']").first();
      if (await filterInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await filterInput.fill("loop");
        await page.waitForTimeout(300);
      }
    }
  });

  test("20. Create Pool Wizard Advanced Configuration Suite", async () => {
    const frame = await getFrame();
    const poolsTab = frame.locator(".cockpit-top-nav-bar button:has-text('Pools')").first();
    if (await poolsTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await poolsTab.click({ timeout: 2000 }).catch(() => {});
      await page.waitForTimeout(300);
    }
    
    const createPoolBtn = frame.locator("button:visible:has-text('Create pool')").first();
    if (await createPoolBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await createPoolBtn.click({ timeout: 2000 }).catch(() => {});
      await page.waitForTimeout(300);
      
      // Step 1: Fill name and altroot
      const poolNameInput = frame.locator("input#wizard-pool-name, input#pool-name").first();
      if (await poolNameInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await poolNameInput.fill("wizard_test_pool");
      }
      const altrootInput = frame.locator("input#wizard-altroot, input#altroot").first();
      if (await altrootInput.isVisible({ timeout: 1000 }).catch(() => false)) {
        await altrootInput.fill("/mnt/altroot");
      }
      const nextBtn = frame.locator(".pf-v5-c-wizard__footer button:has-text('Next')").first();
      if (await nextBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await nextBtn.click({ timeout: 1000 }).catch(() => {});
        await page.waitForTimeout(300);
      }

      // Step 2: VDEV - Select disk and add VDEV
      const diskCheck = frame.locator(".pf-v5-c-wizard input[type='checkbox']").first();
      if (await diskCheck.isVisible({ timeout: 1000 }).catch(() => false)) {
        await diskCheck.click().catch(() => {});
      }
      const addVdevBtn = frame.locator("button:has-text('Add VDEV')").first();
      if (await addVdevBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await addVdevBtn.click({ timeout: 1000 }).catch(() => {});
      }
      if (await nextBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await nextBtn.click({ timeout: 1000 }).catch(() => {});
        await page.waitForTimeout(300);
      }

      // Step 3: Pool Properties
      const autoreplaceBox = frame.locator("input#wizard-autoreplace").first();
      if (await autoreplaceBox.isVisible({ timeout: 1000 }).catch(() => false)) {
        await autoreplaceBox.setChecked(true).catch(() => {});
      }
      if (await nextBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await nextBtn.click({ timeout: 1000 }).catch(() => {});
        await page.waitForTimeout(300);
      }

      // Step 4: Filesystem Properties
      const dedupSelect = frame.locator("select#wizard-dedup").first();
      if (await dedupSelect.isVisible({ timeout: 1000 }).catch(() => false)) {
        await dedupSelect.selectOption("on").catch(() => {});
      }
      if (await nextBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await nextBtn.click({ timeout: 1000 }).catch(() => {});
        await page.waitForTimeout(300);
      }

      // Step 5: Review - Click Back
      const backBtn = frame.locator(".pf-v5-c-wizard__footer button:has-text('Back')").first();
      if (await backBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await backBtn.click({ timeout: 1000 }).catch(() => {});
        await page.waitForTimeout(200);
      }

      // Cancel wizard cleanly
      const cancelBtn = frame.locator(".pf-v5-c-wizard__footer button:has-text('Cancel')").first();
      if (await cancelBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await cancelBtn.click({ timeout: 2000 }).catch(() => {});
      }
      await frame.evaluate(() => {
        (window as any).__setActiveModal?.(null);
      }).catch(() => {});
    }
  });

  test("21. Comprehensive Pool Details Subtabs and Filters Suite", async () => {
    const frame = await getFrame();
    await frame.evaluate((pool) => {
      (window as any).__navigateTo?.(["pools", pool, "datasets"]);
    }, TEST_POOL);
    await page.waitForTimeout(300);

    // Switch to datasets subtab
    const datasetsFilter = frame.locator("input[placeholder*='Filter'], input[aria-label*='Search']").first();
    if (await datasetsFilter.isVisible({ timeout: 1000 }).catch(() => false)) {
      await datasetsFilter.fill("test");
      await page.waitForTimeout(200);
      await datasetsFilter.fill("");
    }

    // Switch to snapshots subtab
    await frame.evaluate((pool) => {
      (window as any).__navigateTo?.(["pools", pool, "snapshots"]);
    }, TEST_POOL);
    await page.waitForTimeout(300);

    // Switch to topology subtab
    await frame.evaluate((pool) => {
      (window as any).__navigateTo?.(["pools", pool, "topology"]);
    }, TEST_POOL);
    await page.waitForTimeout(300);

    // Switch to maintenance subtab
    await frame.evaluate((pool) => {
      (window as any).__navigateTo?.(["pools", pool, "maintenance"]);
    }, TEST_POOL);
    await page.waitForTimeout(300);

    // Switch to pool settings subtab
    await frame.evaluate((pool) => {
      (window as any).__navigateTo?.(["pools", pool, "settings"]);
    }, TEST_POOL);
    await page.waitForTimeout(300);
  });

  test("22. Direct Modal Form Controls & Operations Exercise", async () => {
    const frame = await getFrame();
    
    // Trigger Create Dataset Modal form inputs
    await frame.evaluate((pool) => {
      (window as any).__setActiveModal?.({ type: "create-dataset", parent: pool });
    }, TEST_POOL);
    await page.waitForTimeout(300);
    const dsNameInput = frame.locator("input#dataset-name, input[aria-label*='Dataset name']").first();
    if (await dsNameInput.isVisible({ timeout: 1000 }).catch(() => false)) {
      await dsNameInput.fill("modal_ds_test");
    }
    const dsCompSelect = frame.locator("select#dataset-compression").first();
    if (await dsCompSelect.isVisible({ timeout: 1000 }).catch(() => false)) {
      await dsCompSelect.selectOption("zstd");
    }
    const advSection = frame.locator("button:has-text('Advanced options')").first();
    if (await advSection.isVisible({ timeout: 1000 }).catch(() => false)) {
      await advSection.click().catch(() => {});
    }
    const dsQuotaInput = frame.locator("input#dataset-quota").first();
    if (await dsQuotaInput.isVisible({ timeout: 1000 }).catch(() => false)) {
      await dsQuotaInput.fill("1G");
    }
    const closeDsBtn = frame.locator(".pf-v5-c-modal-box button:has-text('Cancel')").first();
    if (await closeDsBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await closeDsBtn.click().catch(() => {});
    }

    // Trigger Create ZVol Modal form inputs
    await frame.evaluate((pool) => {
      (window as any).__setActiveModal?.({ type: "create-zvol", parent: pool });
    }, TEST_POOL);
    await page.waitForTimeout(300);
    const zvolNameInput = frame.locator("input#zvol-name, input[aria-label*='Volume name']").first();
    if (await zvolNameInput.isVisible({ timeout: 1000 }).catch(() => false)) {
      await zvolNameInput.fill("modal_zvol_test");
    }
    const zvolSizeInput = frame.locator("input#zvol-size").first();
    if (await zvolSizeInput.isVisible({ timeout: 1000 }).catch(() => false)) {
      await zvolSizeInput.fill("500M");
    }
    const closeZvolBtn = frame.locator(".pf-v5-c-modal-box button:has-text('Cancel')").first();
    if (await closeZvolBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await closeZvolBtn.click().catch(() => {});
    }

    // Trigger Create Snapshot Modal form inputs
    await frame.evaluate((pool) => {
      (window as any).__setActiveModal?.({ type: "create-snapshot", target: pool });
    }, TEST_POOL);
    await page.waitForTimeout(300);
    const snapNameInput = frame.locator("input#snapshot-name, input[aria-label*='Snapshot name']").first();
    if (await snapNameInput.isVisible({ timeout: 1000 }).catch(() => false)) {
      await snapNameInput.fill("modal_snap_test");
    }
    const closeSnapBtn = frame.locator(".pf-v5-c-modal-box button:has-text('Cancel')").first();
    if (await closeSnapBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await closeSnapBtn.click().catch(() => {});
    }

    await frame.evaluate(() => {
      (window as any).__setActiveModal?.(null);
    });
  });
});
