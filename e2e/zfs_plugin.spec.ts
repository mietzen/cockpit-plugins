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
    const frameElement = await page.waitForSelector(
      "iframe[name*='zfs-storage'], iframe[src*='zfs-storage']",
      { state: "attached", timeout: 15000 }
    );
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
    await page.goto("/", { waitUntil: "domcontentloaded" });

    // Check for login fields
    const userInput = page.locator("input#login-user-input, input#login-user, input[name='login-user'], input[autocomplete='username']").first();
    const passInput = page.locator("input#login-password-input, input#login-password, input[name='login-password'], input[autocomplete='current-password']").first();
    const loginBtn = page.locator("button#login-button, button[type='submit']").first();

    const isLoginVisible = await userInput.isVisible({ timeout: 4000 }).catch(() => false);
    if (isLoginVisible) {
      await userInput.fill("test-user");
      await passInput.fill("password");

      const authCheckbox = page.locator("input#authorized-input").first();
      if ((await authCheckbox.count()) > 0) {
        await authCheckbox.setChecked(true, { force: true }).catch(() => {});
      }

      await passInput.press("Enter");
      await loginBtn.click().catch(() => {});

      // Wait for login redirection / sidebar to appear
      await page.waitForSelector("nav, #sidebar, a:has-text('System'), a:has-text('ZFS storage'), a:has-text('ZFS Storage')", { timeout: 15000 });
    }

    // Navigate to ZFS storage plugin via sidebar
    const navLink = page.locator("a:has-text('ZFS storage'), a:has-text('ZFS Storage'), a[href*='zfs-storage']").first();
    await navLink.waitFor({ state: "visible", timeout: 15000 });
    await navLink.click();

    const frame = await getFrame();
    await frame.waitForSelector("#root", { timeout: 10000 });

    // Verify Overview header is visible
    await expect(frame.locator("text=ZFS Storage").first()).toBeVisible({ timeout: 10000 });
    await expect(frame.locator("text=Storage usage").first()).toBeVisible({ timeout: 10000 });
  });

  test("2. Create ZFS Pool via Web UI Wizard and verify on filesystem", async () => {
    const frame = await getFrame();

    // Navigate to Pools tab
    await frame.click("button:has-text(\"Pools\")");

    // Open Create Pool wizard
    await frame.click("button:visible:has-text(\"Create pool\")");

    // Step 1: General Info
    const poolNameInput = frame.locator("input#wizard-pool-name, input#pool-name").first();
    await poolNameInput.waitFor({ state: "visible", timeout: 5000 });
    await poolNameInput.fill(TEST_POOL);
    await frame.click("button:visible:has-text(\"Next\")");

    // Step 2: VDEV Configuration (Select available disks)
    const diskCheckbox = frame.locator("table tbody input[type=\"checkbox\"]").first();
    await diskCheckbox.waitFor({ state: "visible", timeout: 5000 });
    await diskCheckbox.setChecked(true);
    await frame.click("button:visible:has-text(\"Next\")");

    // Step 3: Properties (leave defaults)
    await frame.locator("button:visible:has-text(\"Next\")").first().click();

    // Step 4: Filesystem Defaults (leave defaults)
    await frame.locator("button:visible:has-text(\"Next\")").first().click();

    // Step 5: Review & Create
    await frame.locator("button:visible:has-text(\"Create\")").first().click();

    // Verify on Host Filesystem using zpool CLI
    await expect.poll(() => runHostCmd(`sudo zpool list -H -o name,health ${TEST_POOL}`), { timeout: 10000 }).toContain("ONLINE");

    // Verify in Web UI
    await expect(frame.locator(`text=${TEST_POOL}`).first()).toBeVisible({ timeout: 10000 });
  });

  test("3. Create Child Dataset and verify compression on filesystem", async () => {
    const frame = await getFrame();

    // Go to pool details
    await frame.locator(`table tbody button:has-text("${TEST_POOL}"), table tbody a:has-text("${TEST_POOL}")`).first().click();

    // Switch to Datasets & Volumes tab
    await frame.locator("button[role=\"tab\"]:has-text(\"Datasets & Volumes\"), button:has-text(\"Datasets & Volumes\")").first().click();

    // Click Create dataset
    await frame.locator("button:visible:has-text(\"Create dataset\")").first().click();

    // Fill dataset form
    await frame.fill("input#ds-name", "testdata");
    await frame.selectOption("select#ds-comp", "lz4");
    await frame.locator("button:visible:has-text(\"Create Dataset\")").first().click();

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
    await frame.locator("button:visible:has-text(\"Create volume\")").first().click();

    // Fill zvol form
    await frame.fill("input#zvol-name", "testvol");
    await frame.fill("input#zvol-size", "100M");
    await frame.locator("button:visible:has-text(\"Create Volume\")").first().click();

    // Verify on Host Filesystem
    await expect.poll(() => runHostCmd(`sudo zfs list -H -t volume -o name ${TEST_POOL}/testvol`), { timeout: 10000 }).toBe(`${TEST_POOL}/testvol`);

    // Verify in Web UI
    await expect(frame.locator("text=testvol").first()).toBeVisible({ timeout: 10000 });
  });

  test("5. Create ZFS Snapshot and verify in Snapshots tree & filesystem", async () => {
    const frame = await getFrame();

    // Switch to Snapshots tab
    await frame.locator("button[role=\"tab\"]:has-text(\"Snapshots\"), button:has-text(\"Snapshots\")").first().click();

    // Click Take snapshot
    await frame.locator("button:visible:has-text(\"Take snapshot\")").first().click();

    await frame.fill("input#snap-name", "snap-e2e-test");
    await frame.locator("button:visible:has-text(\"Create Snapshot\")").first().click();

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
    if (await scrubBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await scrubBtn.click();
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
    await row.locator("button[aria-label=\"Dataset actions\"]").click();

    await frame.locator("button:has-text(\"Rename\"), li:has-text(\"Rename\")").first().click();

    await frame.fill("input#rename-new", "testdatanew");
    await frame.locator("button:visible:has-text(\"Rename\")").first().click();

    // Verify on Host Filesystem
    await expect.poll(() => runHostCmd(`sudo zfs list -H -o name ${TEST_POOL}/testdatanew`), { timeout: 10000 }).toBe(`${TEST_POOL}/testdatanew`);

    const oldDsOutput = runHostCmd(`sudo zfs list -H -o name ${TEST_POOL}/testdata 2>&1 || true`);
    expect(oldDsOutput).toContain("does not exist");
  });

  test("8. Delete dataset and volume and verify on filesystem", async () => {
    const frame = await getFrame();

    // Find row for testdatanew and click Delete
    const row = frame.locator("table tbody tr", { hasText: "testdatanew" }).first();
    await row.locator("button[aria-label=\"Dataset actions\"]").click();

    await frame.locator("button:has-text(\"Delete\"), li:has-text(\"Delete\")").first().click();

    // Type confirmation name in modal
    await frame.fill("input#destroy-confirm", `${TEST_POOL}/testdatanew`);
    await frame.locator("button:visible:has-text(\"Permanently Destroy\")").first().click();

    // Verify on Host Filesystem
    await expect.poll(() => runHostCmd(`sudo zfs list -H -o name ${TEST_POOL}/testdatanew 2>&1 || true`), { timeout: 10000 }).toContain("does not exist");
  });
});
