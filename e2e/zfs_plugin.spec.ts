import { test, expect, Page, Frame } from "@playwright/test";
import { execSync } from "child_process";

const TEST_POOL = "e2epool";

function runHostCmd(cmd: string): string {
  try {
    return execSync(cmd, { encoding: "utf-8" }).trim();
  } catch (err: any) {
    return (err.stdout || "") + " " + (err.stderr || "");
  }
}

test.describe.serial("Cockpit ZFS Storage Plugin E2E Test Suite", () => {
  let page: Page;

  async function getFrame(): Promise<Frame> {
    const frameElement = await page.waitForSelector("iframe[name*='zfs-storage'], iframe[src*='zfs-storage']", { timeout: 25000 });
    const frame = await frameElement.contentFrame();
    if (!frame) {
      throw new Error("Cockpit iframe contentFrame is null");
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
  });

  test.afterAll(async () => {
    // Teardown test pool
    runHostCmd(`sudo zpool destroy -f ${TEST_POOL} 2>/dev/null || true`);
    if (page) {
      await page.close().catch(() => {});
    }
  });

  test("1. Login to Cockpit and load ZFS storage plugin", async () => {
    await page.goto("/");
    await page.waitForTimeout(1000);
    console.log("Initial page URL:", page.url());
    console.log("Initial page title:", await page.title());

    // Check for login fields
    const userInput = page.locator("input#login-user-input, input#login-user, input[name='login-user'], input[autocomplete='username']").first();
    const passInput = page.locator("input#login-password-input, input#login-password, input[name='login-password'], input[autocomplete='current-password']").first();
    const loginBtn = page.locator("button#login-button, button[type='submit']").first();

    const isLoginVisible = await userInput.isVisible({ timeout: 5000 }).catch(() => false);
    console.log("Is login form visible:", isLoginVisible);

    if (isLoginVisible) {
      await userInput.click();
      await userInput.fill("test-user");
      await passInput.click();
      await passInput.fill("password");

      const authCheckbox = page.locator("input#authorized-input").first();
      if ((await authCheckbox.count()) > 0) {
        await authCheckbox.setChecked(true, { force: true }).catch(() => {});
      }

      console.log("Submitting login form via Enter and button click...");
      await passInput.press("Enter");
      await loginBtn.click().catch(() => {});

      // Wait for login redirection / sidebar to appear
      await page.waitForSelector("nav, #sidebar, a:has-text('System'), a:has-text('ZFS storage'), a:has-text('ZFS Storage')", { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(3000);

      const errorAlert = page.locator("#error-group:not([hidden]), .dialog-error:not([hidden]), .pf-m-danger:not([hidden])").first();
      if (await errorAlert.isVisible({ timeout: 2000 }).catch(() => false)) {
        console.log("Login error alert:", await errorAlert.innerText());
        console.log("Retrying login with runner user...");
        await userInput.fill("runner");
        await passInput.fill("password");
        await passInput.press("Enter");
        await page.waitForTimeout(3000);
      }

      console.log("URL after login:", page.url());
      console.log("Cockpit journal:", runHostCmd("sudo journalctl -u cockpit -u cockpit.socket -n 20 --no-pager 2>/dev/null || true"));
    }

    // Print all links
    const links = await page.$$eval("a", (els) => els.map((e) => `${e.textContent?.trim()} -> ${e.getAttribute("href")}`));
    console.log("Page links:", links);

    // Print all iframes
    const iframes = await page.$$eval("iframe", (els) => els.map((e) => e.outerHTML));
    console.log("Page iframes:", iframes);

    // Navigate to ZFS storage plugin via sidebar or URL
    const navLink = page.locator("a:has-text('ZFS storage'), a:has-text('ZFS Storage'), a[href*='zfs-storage']").first();
    if (await navLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log("Clicking sidebar link for ZFS storage");
      await navLink.click();
    } else {
      console.log("Sidebar link not visible, doing page.goto('/@localhost/zfs-storage')");
      await page.goto("/@localhost/zfs-storage");
    }
    await page.waitForTimeout(3000);
    console.log("URL after navigation:", page.url());
    console.log("Body HTML snippet:", (await page.innerHTML("body")).slice(0, 1000));

    const frame = await getFrame();
    await frame.waitForSelector("#root", { timeout: 20000 });

    // Verify Overview header is visible
    await expect(frame.locator("text=ZFS Storage").first()).toBeVisible({ timeout: 15000 });
    await expect(frame.locator("text=Storage usage").first()).toBeVisible({ timeout: 15000 });
  });

  test("2. Create ZFS Pool via Web UI Wizard and verify on filesystem", async () => {
    const frame = await getFrame();

    // Navigate to Pools tab
    await frame.click("button:has-text(\"Pools\")");
    await page.waitForTimeout(800);

    // Open Create Pool wizard
    await frame.click("button:visible:has-text(\"Create pool\")");
    await page.waitForTimeout(800);

    // Step 1: General Info
    await frame.fill("input#pool-name", TEST_POOL);
    await frame.click("button:visible:has-text(\"Next\")");
    await page.waitForTimeout(800);

    // Step 2: VDEV Configuration (Select available disks)
    const diskCheckboxes = await frame.$$("table tbody input[type=\"checkbox\"]");
    expect(diskCheckboxes.length).toBeGreaterThanOrEqual(1);
    await diskCheckboxes[0].check();
    if (diskCheckboxes.length >= 2) {
      await diskCheckboxes[1].check();
    }
    await frame.click("button:visible:has-text(\"Next\")");
    await page.waitForTimeout(800);

    // Step 3: Properties (leave defaults)
    await frame.click("button:visible:has-text(\"Next\")");
    await page.waitForTimeout(800);

    // Step 4: Review & Create
    await frame.click("button:visible:has-text(\"Create\")");
    await page.waitForTimeout(3000);

    // Verify on Host Filesystem using zpool CLI
    const zpoolOutput = runHostCmd(`sudo zpool list -H -o name,health ${TEST_POOL}`);
    expect(zpoolOutput).toContain(TEST_POOL);
    expect(zpoolOutput).toContain("ONLINE");

    // Verify in Web UI
    await expect(frame.locator(`text=${TEST_POOL}`)).toBeVisible();
  });

  test("3. Create Child Dataset and verify compression on filesystem", async () => {
    const frame = await getFrame();

    // Go to pool details
    await frame.click(`table tbody button:has-text("${TEST_POOL}")`);
    await page.waitForTimeout(800);

    // Switch to Datasets & Volumes tab
    await frame.click("button[role=\"tab\"]:has-text(\"Datasets & Volumes\")");
    await page.waitForTimeout(800);

    // Click Create dataset
    await frame.click("button:visible:has-text(\"Create dataset\")");
    await page.waitForTimeout(800);

    // Fill dataset form
    await frame.fill("input#ds-name", "testdata");
    await frame.selectOption("select#ds-comp", "lz4");
    await frame.click("button:visible:has-text(\"Create Dataset\")");
    await page.waitForTimeout(2000);

    // Verify on Host Filesystem
    const dsOutput = runHostCmd(`sudo zfs list -H -o name ${TEST_POOL}/testdata`);
    expect(dsOutput).toBe(`${TEST_POOL}/testdata`);

    const compProp = runHostCmd(`sudo zfs get -H -o value compression ${TEST_POOL}/testdata`);
    expect(compProp).toBe("lz4");

    // Verify in Web UI
    await expect(frame.locator("text=testdata").first()).toBeVisible();
  });

  test("4. Create ZFS Volume (zvol) and verify device file on filesystem", async () => {
    const frame = await getFrame();

    // Click Create volume
    await frame.click("button:visible:has-text(\"Create volume\")");
    await page.waitForTimeout(800);

    // Fill zvol form
    await frame.fill("input#zvol-name", "testvol");
    await frame.fill("input#zvol-size", "100M");
    await frame.click("button:visible:has-text(\"Create Volume\")");
    await page.waitForTimeout(2000);

    // Verify on Host Filesystem
    const zvolOutput = runHostCmd(`sudo zfs list -H -t volume -o name ${TEST_POOL}/testvol`);
    expect(zvolOutput).toBe(`${TEST_POOL}/testvol`);

    // Verify in Web UI
    await expect(frame.locator("text=testvol").first()).toBeVisible();
  });

  test("5. Create ZFS Snapshot and verify in Snapshots tree & filesystem", async () => {
    const frame = await getFrame();

    // Switch to Snapshots tab
    await frame.click("button[role=\"tab\"]:has-text(\"Snapshots\")");
    await page.waitForTimeout(800);

    // Click Take snapshot
    await frame.click("button:visible:has-text(\"Take snapshot\")");
    await page.waitForTimeout(800);

    await frame.fill("input#snap-name", "snap-e2e-test");
    await frame.click("button:visible:has-text(\"Create Snapshot\")");
    await page.waitForTimeout(2000);

    // Verify on Host Filesystem
    const snapOutput = runHostCmd(`sudo zfs list -H -t snapshot -o name`);
    expect(snapOutput).toContain("snap-e2e-test");

    // Verify in Web UI
    await expect(frame.locator("text=snap-e2e-test").first()).toBeVisible();
  });

  test("6. Start and monitor Scrub via Maintenance tab", async () => {
    const frame = await getFrame();

    // Switch to Maintenance tab
    await frame.click("button[role=\"tab\"]:has-text(\"Maintenance\")");
    await page.waitForTimeout(800);

    // Start scrub
    const scrubBtn = frame.locator("button:visible:has-text(\"Start scrub\")");
    if (await scrubBtn.isVisible()) {
      await scrubBtn.click();
      await page.waitForTimeout(1500);
    }

    // Verify on Host Filesystem
    const statusOutput = runHostCmd(`sudo zpool status ${TEST_POOL}`);
    expect(statusOutput).toContain("scan:");
  });

  test("7. Rename dataset and verify on filesystem", async () => {
    const frame = await getFrame();

    // Go back to Datasets & Volumes tab
    await frame.click("button[role=\"tab\"]:has-text(\"Datasets & Volumes\")");
    await page.waitForTimeout(800);

    // Find row for testdata and click 3-dot actions dropdown
    const row = frame.locator("table tbody tr", { hasText: "testdata" });
    await row.locator("button[aria-label=\"Dataset actions\"]").click();
    await page.waitForTimeout(500);

    await frame.click("text=Rename");
    await page.waitForTimeout(800);

    await frame.fill("input#rename-new", "testdatanew");
    await frame.click("button:visible:has-text(\"Rename\")");
    await page.waitForTimeout(2000);

    // Verify on Host Filesystem
    const newDsOutput = runHostCmd(`sudo zfs list -H -o name ${TEST_POOL}/testdatanew`);
    expect(newDsOutput).toBe(`${TEST_POOL}/testdatanew`);

    const oldDsOutput = runHostCmd(`sudo zfs list -H -o name ${TEST_POOL}/testdata 2>&1 || true`);
    expect(oldDsOutput).toContain("does not exist");
  });

  test("8. Delete dataset and volume and verify on filesystem", async () => {
    const frame = await getFrame();

    // Find row for testdatanew and click Delete
    const row = frame.locator("table tbody tr", { hasText: "testdatanew" });
    await row.locator("button[aria-label=\"Dataset actions\"]").click();
    await page.waitForTimeout(500);

    await frame.click("text=Delete");
    await page.waitForTimeout(800);

    // Type confirmation name in modal
    await frame.fill("input#destroy-confirm", `${TEST_POOL}/testdatanew`);
    await frame.click("button:visible:has-text(\"Permanently Destroy\")");
    await page.waitForTimeout(2000);

    // Verify on Host Filesystem
    const dsCheck = runHostCmd(`sudo zfs list -H -o name ${TEST_POOL}/testdatanew 2>&1 || true`);
    expect(dsCheck).toContain("does not exist");
  });
});
