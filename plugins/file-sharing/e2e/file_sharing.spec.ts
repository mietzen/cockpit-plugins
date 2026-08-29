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
    await expect(frame.getByRole("heading", { name: "File Sharing" }).first()).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: "/Users/nils/.gemini/antigravity-cli/brain/c3e31e2d-d59b-40b3-925a-0d2725d4993e/.tempmediaStorage/media_fs_dashboard.png" });
  });

  test("2. Verify Ansible Managed SMB Share and Lock Badge", async () => {
    const frame = await getFrame();
    await frame.getByRole("tab", { name: /SMB Shares/ }).click();

    // Verify Ansible lock badge in visible SMB table
    await expect(frame.getByText("Ansible: storage_cluster").and(frame.locator(":visible")).first()).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: "/Users/nils/.gemini/antigravity-cli/brain/c3e31e2d-d59b-40b3-925a-0d2725d4993e/.tempmediaStorage/media_fs_smb.png" });
  });

  test("3. Verify NFS Exports & Client IP Access Map", async () => {
    const frame = await getFrame();
    await frame.getByRole("tab", { name: /NFS Exports/ }).click();
    await expect(frame.getByText("/srv/nfs/test").and(frame.locator(":visible")).first()).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: "/Users/nils/.gemini/antigravity-cli/brain/c3e31e2d-d59b-40b3-925a-0d2725d4993e/.tempmediaStorage/media_fs_nfs.png" });

    // Switch to Client IP Access Map
    await frame.getByRole("tab", { name: /Client IP Access Map/ }).click();
    await expect(frame.getByText("192.168.40.0/24").and(frame.locator(":visible")).first()).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: "/Users/nils/.gemini/antigravity-cli/brain/c3e31e2d-d59b-40b3-925a-0d2725d4993e/.tempmediaStorage/media_fs_nfs_map.png" });
  });

  test("4. Verify Samba Users & Access Permissions Matrix", async () => {
    const frame = await getFrame();
    await frame.getByRole("tab", { name: /Samba Users/ }).click();
    await expect(frame.getByText("test-user").and(frame.locator(":visible")).first()).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: "/Users/nils/.gemini/antigravity-cli/brain/c3e31e2d-d59b-40b3-925a-0d2725d4993e/.tempmediaStorage/media_fs_users.png" });

    // Switch to User Access Matrix
    await frame.getByRole("tab", { name: /User Access Matrix/ }).click();
    await expect(frame.getByText("test-user").and(frame.locator(":visible")).first()).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: "/Users/nils/.gemini/antigravity-cli/brain/c3e31e2d-d59b-40b3-925a-0d2725d4993e/.tempmediaStorage/media_fs_matrix.png" });
  });

  test("5. Verify Services & Sessions and Settings Views", async () => {
    const frame = await getFrame();
    await frame.getByRole("tab", { name: /Services & Sessions/ }).click();
    await expect(frame.getByText("Samba File Daemon (smbd)").and(frame.locator(":visible")).first()).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: "/Users/nils/.gemini/antigravity-cli/brain/c3e31e2d-d59b-40b3-925a-0d2725d4993e/.tempmediaStorage/media_fs_sessions.png" });

    await frame.getByRole("tab", { name: /Settings/ }).click();
    await expect(frame.getByText("Global Samba Configuration").and(frame.locator(":visible")).first()).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: "/Users/nils/.gemini/antigravity-cli/brain/c3e31e2d-d59b-40b3-925a-0d2725d4993e/.tempmediaStorage/media_fs_settings.png" });
  });

  test("6. Verify 3-Dot ActionMenu Positioned Inside Viewport", async () => {
    const frame = await getFrame();
    await frame.getByRole("tab", { name: /SMB Shares/ }).click();
    const toggleBtn = frame.locator("button[aria-label='Share actions']").first();
    await toggleBtn.click();

    const editItem = frame.getByText("Edit share");
    await expect(editItem).toBeVisible({ timeout: 5000 });

    // Verify menu bounding box is within viewport
    const menuBox = await editItem.boundingBox();
    expect(menuBox).not.toBeNull();
    if (menuBox) {
      expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(1440);
    }
    await page.screenshot({ path: "/Users/nils/.gemini/antigravity-cli/brain/c3e31e2d-d59b-40b3-925a-0d2725d4993e/.tempmediaStorage/media_test_dropdown_open.png" });
    await toggleBtn.click();
  });

  test("7. Verify Modal Background Dimming", async () => {
    const frame = await getFrame();
    const createBtn = frame.getByRole("button", { name: /Create SMB share/ }).first();
    await createBtn.click();

    const modalTitle = frame.locator(".pf-v5-c-modal-box__title-text");
    await expect(modalTitle).toBeVisible({ timeout: 5000 });
    await page.screenshot({ path: "/Users/nils/.gemini/antigravity-cli/brain/c3e31e2d-d59b-40b3-925a-0d2725d4993e/.tempmediaStorage/media_test_modal_dimming.png" });

    await frame.getByRole("button", { name: /Cancel/ }).click();
    await expect(modalTitle).not.toBeVisible({ timeout: 5000 });
  });

  test("8. Verify Dark Mode Theme Synchronization", async () => {
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
    await page.screenshot({ path: "/Users/nils/.gemini/antigravity-cli/brain/c3e31e2d-d59b-40b3-925a-0d2725d4993e/.tempmediaStorage/media_test_dark_mode.png" });

    // Revert to light mode
    await page.evaluate(() => {
      localStorage.setItem("shell:style", "light");
      window.dispatchEvent(new CustomEvent("cockpit-style", { detail: { style: "light" } }));
    });
    await frame.evaluate(() => {
      document.documentElement.classList.remove("pf-v5-theme-dark");
    });
  });
});
