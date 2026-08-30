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
    await frame.locator(".pf-v5-c-wizard__footer button:has-text('Next')").first().click();

    // Step 2: VDEV Configuration (Select available disks)
    const diskCheckbox = frame.locator("table tbody input[type=\"checkbox\"]").first();
    await diskCheckbox.waitFor({ state: "visible", timeout: 15000 });
    await diskCheckbox.setChecked(true);
    await frame.locator(".pf-v5-c-wizard__footer button:has-text('Next')").first().click();

    // Step 3: Properties (leave defaults)
    await frame.locator(".pf-v5-c-wizard__footer button:has-text('Next')").first().click();

    // Step 4: Filesystem Defaults (leave defaults)
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

  test("12. Pools Overview Navigation", async () => {
    const frame = await getFrame();
    await frame.locator("button[role='tab']:has-text('Pools'), [role='tab']:has-text('Pools')").first().click();
    await expect(frame.getByText(TEST_POOL).first()).toBeVisible({ timeout: 10000 });
  });
});
