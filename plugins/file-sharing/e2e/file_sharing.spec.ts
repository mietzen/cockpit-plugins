import { test, expect, Page, Frame } from "@playwright/test";

test.describe.serial("Cockpit File Sharing Plugin E2E Test Suite", () => {
  let page: Page;

  async function getFrame(): Promise<Frame> {
    const frameElement = await page.waitForSelector(
      "iframe[name*='file-sharing'], iframe[src*='file-sharing']",
      { state: "attached", timeout: 20000 }
    );
    const frame = await frameElement.contentFrame();
    if (!frame) {
      throw new Error("Cockpit file-sharing iframe contentFrame is null");
    }
    return frame;
  }

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
      ignoreHTTPSErrors: true,
    });
    page.on("console", (msg) => console.log(`[PAGE LOG] ${msg.type()}: ${msg.text()}`));
    page.on("pageerror", (err) => console.log(`[PAGE ERR] ${err.message || err}`));
  });

  test.afterAll(async () => {
    if (page) {
      await page.close().catch(() => {});
    }
  });

  test("1. Login to Cockpit and navigate to File sharing plugin", async () => {
    const user = process.env.COCKPIT_USER || "test-user";
    const pass = process.env.COCKPIT_PASSWORD || "password";

    await page.goto("/");

    const userInput = page.locator("input#login-user-input, input#login-user, input[name='login-user'], input[autocomplete='username']").first();
    const passInput = page.locator("input#login-password-input, input#login-password, input[name='login-password'], input[autocomplete='current-password']").first();
    const loginBtn = page.locator("button#login-button, button[type='submit']").first();

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
      // Already authenticated
    }

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

    // Click File sharing in sidebar
    const navLink = page.locator("a:has-text('File sharing'), a:has-text('File Sharing'), a[href*='file-sharing']").first();
    await navLink.waitFor({ state: "visible", timeout: 20000 });
    await navLink.click();

    const frame = await getFrame();
    await frame.waitForSelector("#root", { timeout: 20000 });
    await expect(frame.getByRole("heading", { name: "File Sharing" })).toBeVisible({ timeout: 10000 });
  });

  test("2. Verify Ansible Managed SMB Share and Lock Badge", async () => {
    const frame = await getFrame();
    await expect(frame.getByRole("tab", { name: /SMB Shares/ })).toBeVisible();
    await expect(frame.getByRole("tab", { name: /NFS Exports/ })).toBeVisible();
    await expect(frame.getByRole("tab", { name: /Samba Users/ })).toBeVisible();

    // Verify Ansible lock badge
    await expect(frame.getByText(/Ansible: storage_cluster/)).toBeVisible({ timeout: 10000 });
  });

  test("3. Verify NFS Exports & Client IP Access Map", async () => {
    const frame = await getFrame();
    await frame.getByRole("tab", { name: /NFS Exports/ }).click();
    await expect(frame.getByText("/srv/nfs/test")).toBeVisible({ timeout: 10000 });

    // Switch to Client IP Access Map
    await frame.getByText(/Client IP Access Map/).click();
    await expect(frame.getByText("192.168.40.0/24")).toBeVisible({ timeout: 10000 });
  });

  test("4. Verify Samba Users & Access Permissions Matrix", async () => {
    const frame = await getFrame();
    await frame.getByRole("tab", { name: /Samba Users/ }).click();
    await expect(frame.getByText("test-user").first()).toBeVisible({ timeout: 10000 });

    // Switch to User Access Matrix
    await frame.getByText(/User Access Matrix/).click();
    await expect(frame.getByText("[testshare]")).toBeVisible({ timeout: 10000 });
    await expect(frame.getByText("Read / Write").first()).toBeVisible({ timeout: 10000 });
  });
});
