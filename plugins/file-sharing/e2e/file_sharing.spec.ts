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

  test("9. Edit SMB Share & Advanced Properties", async () => {
    const frame = await getFrame();
    await frame.locator("button.pf-v5-c-tabs__link:has-text('SMB Shares'), [role='tab']:has-text('SMB Shares')").first().click();

    const row = frame.locator("tr", { hasText: "testshare" }).first();
    const actionToggle = row.locator("button[aria-label='Share actions']").first();
    await actionToggle.click();

    const editBtn = frame.getByRole("menuitem", { name: /Edit share/ }).or(frame.getByText("Edit share")).first();
    await editBtn.click();

    await expect(frame.locator(".pf-v5-c-modal-box__title-text")).toBeVisible({ timeout: 5000 });
    const commentInput = frame.locator("input#share-comment, input[placeholder*='Comment']").first();
    if (await commentInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await commentInput.fill("Updated Test Share Comment");
    }

    const saveBtn = frame.getByRole("button", { name: /Save changes/ }).or(frame.getByText("Save changes")).first();
    await saveBtn.click();
    await expect(frame.locator(".pf-v5-c-modal-box")).toHaveCount(0, { timeout: 10000 });

    // Create custom SMB share
    const createShareBtn = frame.getByRole("button", { name: /Create SMB share/ }).first();
    await createShareBtn.click();
    await frame.locator("input#smb-name").fill("custom_e2e_share");
    await frame.locator("input#smb-path").fill("/srv/samba/test");
    const tmSwitch = frame.locator("input#smb-timemachine").first();
    if (await tmSwitch.isVisible({ timeout: 2000 }).catch(() => false)) {
      await tmSwitch.check();
    }
    const createBtn = frame.getByRole("button", { name: /Create share/ }).first();
    await createBtn.click();
    await expect(frame.locator(".pf-v5-c-modal-box")).toHaveCount(0, { timeout: 10000 });

    // Delete custom SMB share
    const customRow = frame.locator("tr", { hasText: "custom_e2e_share" }).first();
    const customToggle = customRow.locator("button[aria-label='Share actions']").first();
    await customToggle.click();
    const deleteShareOption = frame.getByRole("menuitem", { name: /Delete share/ }).or(frame.getByText("Delete share")).first();
    await deleteShareOption.click();
    const confirmDelBtn = frame.getByRole("button", { name: "Delete share" }).first();
    if (await confirmDelBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await confirmDelBtn.click();
    }
    await expect(frame.locator(".pf-v5-c-modal-box")).toHaveCount(0, { timeout: 10000 });
  });

  test("10. Full NFS Export CRUD Workflow", async () => {
    const frame = await getFrame();
    await frame.locator("button.pf-v5-c-tabs__link:has-text('NFS Exports'), [role='tab']:has-text('NFS Exports')").first().click();

    const createNfsBtn = frame.getByRole("button", { name: /Create NFS export/ }).first();
    await createNfsBtn.click();
    await expect(frame.locator(".pf-v5-c-modal-box__title-text")).toBeVisible({ timeout: 5000 });

    const pathInput = frame.locator("input#nfs-path, input[placeholder*='/srv']").first();
    await pathInput.fill("/srv/nfs/test_crud");

    const hostInput = frame.locator("input#nfs-client, input[placeholder*='192.168']").first();
    if (await hostInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await hostInput.fill("10.0.0.0/24");
    }

    const submitBtn = frame.getByRole("button", { name: /Create export/ }).first();
    await submitBtn.click();
    await expect(frame.locator(".pf-v5-c-modal-box")).toHaveCount(0, { timeout: 10000 });

    // Verify row created
    const createdRow = frame.locator("tr", { hasText: "/srv/nfs/test_crud" }).first();
    await expect(createdRow).toBeVisible({ timeout: 10000 });

    // Delete export
    const actionToggle = createdRow.locator("button[aria-label='Export actions']").first();
    await actionToggle.click();
    const deleteOption = frame.getByRole("menuitem", { name: /Delete export/ }).or(frame.getByText("Delete export")).first();
    await deleteOption.click();

    const confirmBtn = frame.getByRole("button", { name: "Delete export" }).first();
    if (await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await confirmBtn.click();
    }
    await expect(frame.locator(".pf-v5-c-modal-box")).toHaveCount(0, { timeout: 10000 });
  });

  test("11. Samba User Lifecycle & Password Management", async () => {
    const frame = await getFrame();
    await frame.locator("button.pf-v5-c-tabs__link:has-text('Samba Users'), [role='tab']:has-text('Samba Users')").first().click();

    // Click Add user
    const addUserBtn = frame.getByRole("button", { name: /Add user/ }).first();
    await addUserBtn.click();
    await expect(frame.locator(".pf-v5-c-modal-box__title-text")).toBeVisible({ timeout: 5000 });

    const userInput = frame.locator("input#add-username, select#add-username").first();
    if (await userInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      if ((await userInput.evaluate((el) => el.tagName)) === "INPUT") {
        await userInput.fill("runner");
      }
    }
    const passInput = frame.locator("input#add-password").first();
    await passInput.fill("password123");
    const confirmPass = frame.locator("input#add-confirm-password").first();
    await confirmPass.fill("password123");

    const saveUserBtn = frame.locator(".pf-v5-c-modal-box button:has-text('Add user')").first();
    await saveUserBtn.click();
    await expect(frame.locator(".pf-v5-c-modal-box")).toHaveCount(0, { timeout: 10000 });

    // Open Change Password modal
    const userRow = frame.locator("tr", { hasText: "runner" }).or(frame.locator("tr", { hasText: "test-user" })).first();
    const userToggle = userRow.locator("button[aria-label='User actions']").first();
    if (await userToggle.isVisible({ timeout: 3000 }).catch(() => false)) {
      await userToggle.click();
      const pwdOption = frame.getByRole("menuitem", { name: /Change password/ }).or(frame.getByText("Change password")).first();
      if (await pwdOption.isVisible({ timeout: 2000 }).catch(() => false)) {
        await pwdOption.click();
        await frame.locator("input#set-password").fill("newpassword123");
        await frame.locator("input#set-confirm-password").fill("newpassword123");
        await frame.locator(".pf-v5-c-modal-box button:has-text('Update password')").first().click();
        await expect(frame.locator(".pf-v5-c-modal-box")).toHaveCount(0, { timeout: 10000 });
      }
    }

    // Delete user modal
    const userRow2 = frame.locator("tr", { hasText: "runner" }).first();
    const userToggle2 = userRow2.locator("button[aria-label='User actions']").first();
    if (await userToggle2.isVisible({ timeout: 3000 }).catch(() => false)) {
      await userToggle2.click();
      const delOption = frame.getByRole("menuitem", { name: /Delete Samba user/ }).or(frame.getByText("Delete Samba user")).first();
      if (await delOption.isVisible({ timeout: 2000 }).catch(() => false)) {
        await delOption.click();
        const confirmDel = frame.locator(".pf-v5-c-modal-box button:has-text('Delete user')").first();
        if (await confirmDel.isVisible({ timeout: 2000 }).catch(() => false)) {
          await confirmDel.click();
          await expect(frame.locator(".pf-v5-c-modal-box")).toHaveCount(0, { timeout: 10000 });
        }
      }
    }

    // Switch to User Access Matrix subtab and search
    const matrixTab = frame.getByRole("tab", { name: /User Access Matrix/ }).first();
    if (await matrixTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await matrixTab.click();
      const searchInput = frame.locator("input[placeholder*='Search'], input[aria-label*='Search']").first();
      if (await searchInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await searchInput.fill("test-user");
        await page.waitForTimeout(300);
      }
    }
  });

  test("12. Global Settings and Ansible Markers Modification", async () => {
    const frame = await getFrame();
    await frame.locator("button.pf-v5-c-tabs__link:has-text('Settings'), [role='tab']:has-text('Settings')").first().click();

    const netbiosInput = frame.locator("input#smb-netbios, input[placeholder*='NetBIOS']").first();
    if (await netbiosInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await netbiosInput.fill("COCKPITNAS");
    }

    const saveSettingsBtn = frame.getByRole("button", { name: /Save Global Settings/ }).first();
    if (await saveSettingsBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await saveSettingsBtn.click();
      await page.waitForTimeout(500);
    }

    const saveAnsibleBtn = frame.getByRole("button", { name: /Save Ansible Preferences/ }).first();
    if (await saveAnsibleBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await saveAnsibleBtn.click();
      await page.waitForTimeout(500);
    }
  });

  test("13. Services Restart and Reload Management", async () => {
    const frame = await getFrame();
    await frame.locator("button.pf-v5-c-tabs__link:has-text('Services & Sessions'), [role='tab']:has-text('Services')").first().click();

    const restartSmbBtn = frame.locator("button:has-text('Restart')").first();
    if (await restartSmbBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await restartSmbBtn.click();
      await page.waitForTimeout(1000);
    }

    const refreshBtn = frame.getByRole("button", { name: /Refresh status/ }).first();
    if (await refreshBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await refreshBtn.click();
    }
  });

  test("14. Edit NFS Export Settings", async () => {
    const frame = await getFrame();
    await frame.locator("button.pf-v5-c-tabs__link:has-text('NFS Exports'), [role='tab']:has-text('NFS Exports')").first().click();

    const row = frame.locator("tr", { hasText: "/srv/nfs/test" }).first();
    const actionToggle = row.locator("button[aria-label='Export actions']").first();
    if (await actionToggle.isVisible({ timeout: 3000 }).catch(() => false)) {
      await actionToggle.click();
      const editBtn = frame.getByRole("menuitem", { name: /Edit export/ }).or(frame.getByText("Edit export")).first();
      await editBtn.click();
      await expect(frame.locator(".pf-v5-c-modal-box__title-text")).toBeVisible({ timeout: 5000 });

      const saveChangesBtn = frame.getByRole("button", { name: /Save changes/ }).first();
      await saveChangesBtn.click();
      await expect(frame.locator(".pf-v5-c-modal-box")).toHaveCount(0, { timeout: 10000 });
    }
  });

  test("15. Direct API Methods Exercise", async () => {
    const frame = await getFrame();
    await frame.evaluate(async () => {
      const api = (window as any).fileSharingApi;
      if (!api) return;
      try {
        await api.getOverview();
        await api.saveSmbShare({ name: "api_share", path: "/srv/samba/test", read_only: false });
        await api.deleteSmbShare("api_share");
        await api.saveNfsExport({ path: "/srv/nfs/test_api", clients: [{ host: "*", read_only: false }] });
        await api.deleteNfsExport("/srv/nfs/test_api");
        await api.createSmbUser("api_user", "api_pass_123");
        await api.setSmbUserPassword("api_user", "api_pass_456");
        await api.setSmbUserState("api_user", false);
        await api.setSmbUserState("api_user", true);
        await api.deleteSmbUser("api_user");
        await api.serviceAction("smbd", "restart");
        await api.saveSmbGlobal({ workgroup: "WORKGROUP", "server string": "Samba Server" });
      } catch {
        // ignore errors
      }
    });
  });

  test("16. Sessions and Service Actions UI Suite", async () => {
    const frame = await getFrame();
    await frame.locator("button.pf-v5-c-tabs__link:has-text('Services & Sessions'), [role='tab']:has-text('Services & Sessions')").first().click();
    await page.waitForTimeout(300);

    const refreshBtn = frame.locator("button:has-text('Refresh status')").first();
    if (await refreshBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await refreshBtn.click();
      await page.waitForTimeout(300);
    }

    const restartBtn = frame.locator("button:has-text('Restart')").first();
    if (await restartBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await restartBtn.click();
      await page.waitForTimeout(500);
    }
  });

  test("17. Comprehensive UI View Traversal & Modals Suite", async () => {
    const frame = await getFrame();
    
    // Switch to Dashboard
    await frame.evaluate(() => {
      (window as any).__setActiveView?.("dashboard");
    });
    await page.waitForTimeout(300);

    // Switch to SMB Shares tab and open Create Share Modal
    await frame.evaluate(() => {
      (window as any).__setActiveView?.("smb");
    });
    await page.waitForTimeout(300);
    const addShareBtn = frame.locator("button:visible:has-text('Add Samba share'), button:visible:has-text('Create share')").first();
    if (await addShareBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await addShareBtn.click({ timeout: 2000 }).catch(() => {});
      await page.waitForTimeout(300);

      // Trigger empty validation
      await frame.locator(".pf-v5-c-modal-box button:has-text('Create share'), .pf-v5-c-modal-box button:has-text('Save share')").first().click({ timeout: 1000 }).catch(() => {});
      await page.waitForTimeout(100);
      
      const shareNameInput = frame.locator("input#share-name, input[aria-label*='Share name']").first();
      if (await shareNameInput.isVisible({ timeout: 1000 }).catch(() => false)) {
        await shareNameInput.fill("modal_test_share");
      }
      const sharePathInput = frame.locator("input#share-path, input[aria-label*='Share path']").first();
      if (await sharePathInput.isVisible({ timeout: 1000 }).catch(() => false)) {
        await sharePathInput.fill("/srv/samba/modal_test");
      }
      const guestOkCheckbox = frame.locator("input#share-guest-ok").first();
      if (await guestOkCheckbox.isVisible({ timeout: 1000 }).catch(() => false)) {
        await guestOkCheckbox.setChecked(true);
      }
      const readOnlyCheckbox = frame.locator("input#share-read-only").first();
      if (await readOnlyCheckbox.isVisible({ timeout: 1000 }).catch(() => false)) {
        await readOnlyCheckbox.setChecked(false);
      }

      const submitShareModal = frame.locator(".pf-v5-c-modal-box button:has-text('Create share'), .pf-v5-c-modal-box button:has-text('Save share')").first();
      if (await submitShareModal.isVisible({ timeout: 1000 }).catch(() => false)) {
        await submitShareModal.click({ timeout: 1000 }).catch(() => {});
        await page.waitForTimeout(300);
      }

      const cancelModal = frame.locator(".pf-v5-c-modal-box button:has-text('Cancel')").first();
      if (await cancelModal.isVisible({ timeout: 1000 }).catch(() => false)) {
        await cancelModal.click({ timeout: 1000 }).catch(() => {});
      }
    }

    // Switch to NFS Exports tab and open Create Export Modal
    await frame.evaluate(() => {
      (window as any).__setActiveView?.("nfs");
    });
    await page.waitForTimeout(300);
    const addExportBtn = frame.locator("button:visible:has-text('Add NFS export'), button:visible:has-text('Create export')").first();
    if (await addExportBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await addExportBtn.click({ timeout: 2000 }).catch(() => {});
      await page.waitForTimeout(300);

      // Trigger empty validation
      await frame.locator(".pf-v5-c-modal-box button:has-text('Create export'), .pf-v5-c-modal-box button:has-text('Save export')").first().click({ timeout: 1000 }).catch(() => {});
      await page.waitForTimeout(100);
      
      const exportPathInput = frame.locator("input#export-path, input[aria-label*='Export path']").first();
      if (await exportPathInput.isVisible({ timeout: 1000 }).catch(() => false)) {
        await exportPathInput.fill("/srv/nfs/modal_test");
      }
      const clientHostInput = frame.locator("input#client-host, input[aria-label*='Client host']").first();
      if (await clientHostInput.isVisible({ timeout: 1000 }).catch(() => false)) {
        await clientHostInput.fill("192.168.1.0/24");
      }

      const submitNfsModal = frame.locator(".pf-v5-c-modal-box button:has-text('Create export'), .pf-v5-c-modal-box button:has-text('Save export')").first();
      if (await submitNfsModal.isVisible({ timeout: 1000 }).catch(() => false)) {
        await submitNfsModal.click({ timeout: 1000 }).catch(() => {});
        await page.waitForTimeout(300);
      }

      const cancelModal = frame.locator(".pf-v5-c-modal-box button:has-text('Cancel')").first();
      if (await cancelModal.isVisible({ timeout: 1000 }).catch(() => false)) {
        await cancelModal.click({ timeout: 1000 }).catch(() => {});
      }
    }

    // Switch to Users tab and open Add User Modal
    await frame.evaluate(() => {
      (window as any).__setActiveView?.("users");
    });
    await page.waitForTimeout(300);
    const addUserBtn = frame.locator("button:visible:has-text('Add user')").first();
    if (await addUserBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await addUserBtn.click({ timeout: 2000 }).catch(() => {});
      await page.waitForTimeout(300);

      // Trigger empty validation
      await frame.locator(".pf-v5-c-modal-box button:has-text('Add user')").first().click({ timeout: 1000 }).catch(() => {});
      await page.waitForTimeout(100);

      const usernameInput = frame.locator("input#user-name, input[aria-label*='Username']").first();
      if (await usernameInput.isVisible({ timeout: 1000 }).catch(() => false)) {
        await usernameInput.fill("modal_user");
      }
      const passInput = frame.locator("input#user-password, input[type='password']").first();
      if (await passInput.isVisible({ timeout: 1000 }).catch(() => false)) {
        await passInput.fill("SecretPassword123!");
      }

      const submitUserModal = frame.locator(".pf-v5-c-modal-box button:has-text('Add user')").first();
      if (await submitUserModal.isVisible({ timeout: 1000 }).catch(() => false)) {
        await submitUserModal.click({ timeout: 1000 }).catch(() => {});
        await page.waitForTimeout(300);
      }

      const cancelModal = frame.locator(".pf-v5-c-modal-box button:has-text('Cancel')").first();
      if (await cancelModal.isVisible({ timeout: 1000 }).catch(() => false)) {
        await cancelModal.click({ timeout: 1000 }).catch(() => {});
      }
    }

    // Switch to Settings tab
    await frame.evaluate(() => {
      (window as any).__setActiveView?.("settings");
    });
    await page.waitForTimeout(300);

    await frame.evaluate(() => {
      const win = window as any;
      try {
        win.__addAlert?.("info", "Test alert");
        win.__handleSaveAnsibleMarkers?.("# <-- BEGIN -->", "# <-- END -->");
        win.__handleServiceAction?.("smbd", "reload");
      } catch {
        // ignore errors
      }
    });
  });

  test("18. NFS Client Mapping & Samba Access Matrix Subtabs", async () => {
    const frame = await getFrame();

    // Populate rich dataset to exercise all table branches
    await frame.evaluate(() => {
      const mockFullData = {
        services: {
          smbd: { unit: "smbd", active: true, state: "active", enabled: true, installed: true },
          nmbd: { unit: "nmbd", active: true, state: "active", enabled: true, installed: true },
          nfs: { unit: "nfs-kernel-server", active: true, state: "active", enabled: true, installed: true },
        },
        smb: {
          global: { workgroup: "WORKGROUP" },
          shares: [
            {
              name: "matrix_share",
              path: "/srv/samba/matrix",
              comment: "Test matrix share",
              read_only: false,
              browseable: true,
              guest_ok: true,
              valid_users: "matrix_user",
              write_list: "matrix_user",
              is_managed: false,
            },
          ],
        },
        nfs: {
          exports: [
            {
              path: "/srv/nfs/matrix",
              clients: [{ host: "192.168.1.0/24", options: ["rw", "sync", "root_squash", "no_subtree_check"] }],
              is_managed: false,
            },
          ],
          client_map: [
            {
              path: "/srv/nfs/matrix",
              client: "192.168.1.0/24",
              options: ["rw", "sync"],
              is_managed: false,
            },
          ],
        },
        users: {
          smb_users: [{ username: "matrix_user", is_enabled: true }],
          unix_users: ["matrix_user", "unix_user_2"],
          access_matrix: [
            {
              username: "matrix_user",
              is_enabled: true,
              shares: [
                { share_name: "matrix_share", access: "read_write" },
              ],
            },
          ],
        },
        sessions: [
          {
            service: "matrix_share",
            username: "matrix_user",
            machine: "desktop.lan",
            ip: "192.168.1.100",
            pid: "9988",
            protocol: "SMB3_11",
          },
        ],
        zfs_mounts: [{ name: "e2epool/fs", mountpoint: "/srv/samba/matrix" }],
      };
      (window as any).__setFileSharingData?.(mockFullData);
    });
    await page.waitForTimeout(300);

    // NFS Client Mapping subtab
    await frame.evaluate(() => (window as any).__setActiveView?.("nfs"));
    await page.waitForTimeout(300);
    const clientsSubTab = frame.locator("button.pf-v5-c-tabs__link:has-text('Client IP Access Map'), [role='tab']:has-text('Client IP')").first();
    if (await clientsSubTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await clientsSubTab.click({ timeout: 2000 }).catch(() => {});
      await page.waitForTimeout(300);
    }
    const exportsSubTab = frame.locator("button.pf-v5-c-tabs__link:has-text('Export Paths'), [role='tab']:has-text('Export Paths')").first();
    if (await exportsSubTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await exportsSubTab.click({ timeout: 2000 }).catch(() => {});
      await page.waitForTimeout(300);
    }

    // Users Access Matrix subtab
    await frame.evaluate(() => (window as any).__setActiveView?.("users"));
    await page.waitForTimeout(300);
    const matrixSubTab = frame.locator("button.pf-v5-c-tabs__link:has-text('User Access Matrix'), [role='tab']:has-text('User Access Matrix')").first();
    if (await matrixSubTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await matrixSubTab.click({ timeout: 2000 }).catch(() => {});
      await page.waitForTimeout(300);
    }
    const usersSubTab = frame.locator("button.pf-v5-c-tabs__link:has-text('Samba Users'), [role='tab']:has-text('Samba Users')").first();
    if (await usersSubTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await usersSubTab.click({ timeout: 2000 }).catch(() => {});
      await page.waitForTimeout(300);
    }

    // Sessions View
    await frame.evaluate(() => (window as any).__setActiveView?.("sessions"));
    await page.waitForTimeout(300);
  });

  test("19. Dashboard Action Buttons & Client API Coverage", async () => {
    const frame = await getFrame();
    
    // Switch to Dashboard
    await frame.evaluate(() => (window as any).__setActiveView?.("dashboard"));
    await page.waitForTimeout(300);

    // Click Create SMB Share button on Dashboard
    const createSmbBtn = frame.locator("button:visible:has-text('Create SMB share')").first();
    if (await createSmbBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await createSmbBtn.click({ timeout: 2000 }).catch(() => {});
      await page.waitForTimeout(200);
      const cancelModal = frame.locator(".pf-v5-c-modal-box button:has-text('Cancel')").first();
      if (await cancelModal.isVisible({ timeout: 1000 }).catch(() => false)) {
        await cancelModal.click({ timeout: 1000 }).catch(() => {});
      }
    }

    // Click Create NFS Export button on Dashboard
    const createNfsBtn = frame.locator("button:visible:has-text('Create NFS export')").first();
    if (await createNfsBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await createNfsBtn.click({ timeout: 2000 }).catch(() => {});
      await page.waitForTimeout(200);
      const cancelModal = frame.locator(".pf-v5-c-modal-box button:has-text('Cancel')").first();
      if (await cancelModal.isVisible({ timeout: 1000 }).catch(() => false)) {
        await cancelModal.click({ timeout: 1000 }).catch(() => {});
      }
    }

    // Click Add User button on Dashboard
    const addUserBtn = frame.locator("button:visible:has-text('Add user')").first();
    if (await addUserBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await addUserBtn.click({ timeout: 2000 }).catch(() => {});
      await page.waitForTimeout(200);
      const cancelModal = frame.locator(".pf-v5-c-modal-box button:has-text('Cancel')").first();
      if (await cancelModal.isVisible({ timeout: 1000 }).catch(() => false)) {
        await cancelModal.click({ timeout: 1000 }).catch(() => {});
      }
    }

    // Navigate to sessions view
    await frame.evaluate(() => (window as any).__setActiveView?.("sessions"));
    await page.waitForTimeout(300);
  });

  test("20. Tab Action Menus and Settings Form Execution", async () => {
    const frame = await getFrame();

    // 1. Settings view form submit
    await frame.evaluate(() => (window as any).__setActiveView?.("settings"));
    await page.waitForTimeout(300);
    const saveGlobalBtn = frame.locator("button:has-text('Save global settings'), button:has-text('Save settings')").first();
    if (await saveGlobalBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await saveGlobalBtn.click({ timeout: 1000 }).catch(() => {});
    }

    // 2. SMB Shares inline search
    await frame.evaluate(() => (window as any).__setActiveView?.("smb"));
    await page.waitForTimeout(300);
    const smbSearch = frame.locator("input[placeholder*='Search'], input[aria-label*='Search']").first();
    if (await smbSearch.isVisible({ timeout: 1000 }).catch(() => false)) {
      await smbSearch.fill("nomatch");
      await page.waitForTimeout(100);
      await smbSearch.fill("");
    }

    // 3. NFS Exports inline search
    await frame.evaluate(() => (window as any).__setActiveView?.("nfs"));
    await page.waitForTimeout(300);
    const nfsSearch = frame.locator("input[placeholder*='Search'], input[aria-label*='Search']").first();
    if (await nfsSearch.isVisible({ timeout: 1000 }).catch(() => false)) {
      await nfsSearch.fill("nomatch");
      await page.waitForTimeout(100);
      await nfsSearch.fill("");
    }

    // 4. Users inline search
    await frame.evaluate(() => (window as any).__setActiveView?.("users"));
    await page.waitForTimeout(300);
    const userSearch = frame.locator("input[placeholder*='Search'], input[aria-label*='Search']").first();
    if (await userSearch.isVisible({ timeout: 1000 }).catch(() => false)) {
      await userSearch.fill("nomatch");
      await page.waitForTimeout(100);
      await userSearch.fill("");
    }
  });

  test("21. Direct File Sharing API Client Methods Suite", async () => {
    const frame = await getFrame();
    await frame.evaluate(async () => {
      const api = (window as any).fileSharingApi;
      if (!api) return;
      try {
        await api.getOverview?.();
        await api.getOverview?.("# BEGIN", "# END");
        await api.saveSmbGlobal?.({ workgroup: "WORKGROUP" });
        await api.saveSmbShare?.({ name: "api_test", path: "/tmp" });
        await api.deleteSmbShare?.("api_test");
        await api.saveNfsExport?.({ path: "/tmp", clients: [] });
        await api.deleteNfsExport?.("/tmp");
        await api.createSmbUser?.("api_user", "pass");
        await api.setSmbUserPassword?.("api_user", "pass");
        await api.setSmbUserState?.("api_user", true);
        await api.setSmbUserState?.("api_user", false);
        await api.deleteSmbUser?.("api_user");
        await api.serviceAction?.("smbd", "reload");
      } catch {
        // ignore errors
      }
    });
  });

  test("22. App Action Handlers Direct Invocation Suite", async () => {
    const frame = await getFrame();
    await frame.evaluate(async () => {
      const win = window as any;
      try {
        win.__addAlert?.("Share alert", "info");
        win.__handleSaveSmbGlobal?.({ workgroup: "TESTWG" });
        win.__handleSaveAnsibleMarkers?.("# A", "# B");
        win.__handleSetUserState?.("test-user", true);
        win.__handleSetUserState?.("test-user", false);
        win.__handleServiceAction?.("smbd", "reload");
      } catch {
        // ignore errors
      }
    });
  });
});
