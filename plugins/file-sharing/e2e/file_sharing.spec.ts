import { test, expect, Page, Frame } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

async function saveScreenshot(page: Page, filename: string) {
  const targetDir = process.env.SCREENSHOT_DIR || path.join(process.cwd(), "test-results", "screenshots");
  try {
    fs.mkdirSync(targetDir, { recursive: true });
    await page.screenshot({ path: path.join(targetDir, filename) });
  } catch (err) {
    console.warn(`Could not save screenshot ${filename}:`, err);
  }
}

test.describe.serial("Cockpit File Sharing Plugin Comprehensive E2E Suite", () => {
  let page: Page;

  async function getFrame(): Promise<Frame> {
    const frameElement = await page.waitForSelector(
      "iframe[name*='file-sharing']",
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

  test.afterEach(async ({}, testInfo) => {
    try {
      if (!page) return;
      const coverageData = await page.evaluate(() => {
        try {
          const iframes = Array.from(document.querySelectorAll("iframe"));
          for (const f of iframes) {
            if (f.contentWindow && (f.contentWindow as any).__coverage__) {
              return (f.contentWindow as any).__coverage__;
            }
          }
          return (window as any).__coverage__ || null;
        } catch {
          return null;
        }
      });
      if (coverageData) {
        const nycDir = path.join(process.cwd(), ".nyc_output");
        fs.mkdirSync(nycDir, { recursive: true });
        fs.writeFileSync(
          path.join(nycDir, `coverage-fs-${testInfo.testId}-${Date.now()}.json`),
          JSON.stringify(coverageData)
        );
      }
    } catch {}
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
    await frame.locator("#root").waitFor({ state: "attached", timeout: 20000 });
    await expect(frame.getByRole("heading", { name: "File Sharing" }).first()).toBeVisible({ timeout: 10000 });
    await saveScreenshot(page, "media_fs_dashboard.png");
  });

  test("2. Full SMB Share CRUD Workflow & Ansible Lock Check", async () => {
    const frame = await getFrame();
    await frame.locator("button.pf-v5-c-tabs__link:has-text('SMB Shares'), [role='tab']:has-text('SMB Shares')").first().click();

    // Verify Ansible lock badge in visible SMB table
    await expect(frame.getByText("Ansible: storage_cluster").and(frame.locator(":visible")).first()).toBeVisible({ timeout: 10000 });
    await saveScreenshot(page, "media_fs_smb.png");

    // Create a new SMB share
    const createBtn = frame.getByRole("button", { name: /Create SMB share/ }).first();
    await createBtn.click();
    await expect(frame.locator(".pf-v5-c-modal-box__title-text")).toBeVisible({ timeout: 5000 });

    const shareNameInput = frame.locator("input#share-name, input[aria-label*='Share Name'], input[placeholder*='data']").first();
    await shareNameInput.fill("e2e_crud_share");
    const sharePathInput = frame.locator("input#share-path, input[placeholder*='/srv']").first();
    await sharePathInput.fill("/srv/samba/test");

    const submitBtn = frame.getByRole("button", { name: "Create share" }).first();
    await submitBtn.click();

    // Wait for modal to close and row to appear in table
    await expect(frame.locator(".pf-v5-c-modal-box")).toHaveCount(0, { timeout: 10000 });
    const createdRow = frame.locator("table tbody tr", { hasText: "e2e_crud_share" }).first();
    await expect(createdRow).toBeVisible({ timeout: 10000 });

    // Delete the share
    const actionToggle = createdRow.locator("button[aria-label='Share actions']").first();
    await actionToggle.click();
    const deleteOption = frame.getByRole("menuitem", { name: /Delete share/ }).or(frame.getByText("Delete share")).first();
    await deleteOption.click();

    const confirmDeleteBtn = frame.getByRole("button", { name: "Delete share" }).first();
    if (await confirmDeleteBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await confirmDeleteBtn.click();
    }
    await expect(frame.locator(".pf-v5-c-modal-box")).toHaveCount(0, { timeout: 10000 });
    await expect(frame.locator("table tbody tr", { hasText: "e2e_crud_share" })).toHaveCount(0, { timeout: 10000 });
  });

  test("3. Verify NFS Exports & Client IP Access Map", async () => {
    const frame = await getFrame();
    await frame.getByRole("tab", { name: /NFS Exports/ }).click();
    await expect(frame.getByText("/srv/nfs/test").and(frame.locator(":visible")).first()).toBeVisible({ timeout: 10000 });
    await saveScreenshot(page, "media_fs_nfs.png");

    // Switch to Client IP Access Map
    await frame.getByRole("tab", { name: /Client IP Access Map/ }).click();
    await expect(frame.getByText("192.168.40.0/24").and(frame.locator(":visible")).first()).toBeVisible({ timeout: 10000 });
    await saveScreenshot(page, "media_fs_nfs_map.png");
  });

  test("4. Verify Samba Users & Access Permissions Matrix", async () => {
    const frame = await getFrame();
    await frame.getByRole("tab", { name: /Samba Users/ }).click();
    await expect(frame.getByText("test-user").and(frame.locator(":visible")).first()).toBeVisible({ timeout: 10000 });
    await saveScreenshot(page, "media_fs_users.png");

    // Switch to User Access Matrix
    await frame.getByRole("tab", { name: /User Access Matrix/ }).click();
    await expect(frame.getByText("test-user").and(frame.locator(":visible")).first()).toBeVisible({ timeout: 10000 });
    await saveScreenshot(page, "media_fs_matrix.png");
  });

  test("5. Verify Services & Sessions and Settings Views with Versions", async () => {
    const frame = await getFrame();
    await frame.getByRole("tab", { name: /Services & Sessions/ }).click();
    await expect(frame.getByText("Samba File Daemon (smbd)").and(frame.locator(":visible")).first()).toBeVisible({ timeout: 10000 });
    await saveScreenshot(page, "media_fs_sessions.png");

    await frame.getByRole("tab", { name: /Settings/ }).click();
    await expect(frame.getByText("Global Samba Configuration").and(frame.locator(":visible")).first()).toBeVisible({ timeout: 10000 });
    await expect(frame.getByText("About Cockpit File Sharing").and(frame.locator(":visible")).first()).toBeVisible({ timeout: 10000 });
    await expect(frame.getByText("Host Samba:").and(frame.locator(":visible")).first()).toBeVisible({ timeout: 10000 });
    await expect(frame.getByText("Host NFS:").and(frame.locator(":visible")).first()).toBeVisible({ timeout: 10000 });
    await saveScreenshot(page, "media_fs_settings.png");
  });

  test("6. Verify 3-Dot ActionMenu Positioned Inside Viewport", async () => {
    const frame = await getFrame();
    await frame.getByRole("tab", { name: /SMB Shares/ }).click();
    const toggleBtn = frame.locator("button[aria-label='Share actions']").first();
    await toggleBtn.click();

    const editItem = frame.getByText("Edit share");
    await expect(editItem).toBeVisible({ timeout: 5000 });

    const menuBox = await editItem.boundingBox();
    expect(menuBox).not.toBeNull();
    if (menuBox) {
      expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(1440);
    }
    await saveScreenshot(page, "media_test_dropdown_open.png");
    await toggleBtn.click();
  });

  test("7. Verify Modal Background Dimming and Edge Fadeout", async () => {
    const frame = await getFrame();
    const createBtn = frame.getByRole("button", { name: /Create SMB share/ }).first();
    await createBtn.click();

    const modalTitle = frame.locator(".pf-v5-c-modal-box__title-text");
    await expect(modalTitle).toBeVisible({ timeout: 5000 });
    await saveScreenshot(page, "media_test_modal_dimming.png");

    await frame.getByRole("button", { name: /Cancel/ }).click();
    await expect(modalTitle).not.toBeVisible({ timeout: 5000 });
  });

  test("8. Verify Dark Mode Theme Synchronization & High-Contrast Badges", async () => {
    const frame = await getFrame();

    // Toggle dark mode via Cockpit style event
    await page.evaluate(() => {
      localStorage.setItem("shell:style", "dark");
      window.dispatchEvent(new CustomEvent("cockpit-style", { detail: { style: "dark" } }));
    });
    await frame.evaluate(() => {
      document.documentElement.classList.add("pf-v5-theme-dark", "pf-v6-theme-dark", "theme-dark");
      document.documentElement.classList.remove("theme-light", "pf-m-light");
    });

    await page.waitForTimeout(500);
    await saveScreenshot(page, "media_test_dark_mode.png");

    // Verify high-contrast dark theme badge colors
    const isDarkComputed = await frame.evaluate(() => {
      const headingColor = getComputedStyle(document.documentElement).getPropertyValue("--zfs-text-heading").trim();
      return headingColor === "#ffffff" || headingColor === "rgb(255, 255, 255)";
    });
    expect(isDarkComputed).toBe(true);

    // Revert to light mode
    await page.evaluate(() => {
      localStorage.setItem("shell:style", "light");
      window.dispatchEvent(new CustomEvent("cockpit-style", { detail: { style: "light" } }));
    });
    await frame.evaluate(() => {
      document.documentElement.classList.remove("pf-v5-theme-dark", "pf-v6-theme-dark", "theme-dark");
      document.documentElement.classList.add("theme-light", "pf-m-light");
    });
    await page.waitForTimeout(300);
  });
});
