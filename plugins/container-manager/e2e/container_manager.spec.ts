import { test, expect, Page, Frame } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

async function saveScreenshot(page: Page, filename: string) {
  const targetDir = process.env.SCREENSHOT_DIR || path.join(process.cwd(), 'test-results', 'screenshots');
  try {
    fs.mkdirSync(targetDir, { recursive: true });
    await page.screenshot({ path: path.join(targetDir, filename) });
  } catch (err) {
    console.warn(`Could not save screenshot ${filename}:`, err);
  }
}

test.describe.serial('Cockpit Container Manager E2E Test Suite', () => {
  let page: Page;

  async function getFrame(): Promise<Frame> {
    const frameElement = await page.waitForSelector(
      "iframe[name*='container'], iframe[src*='container']",
      { state: 'attached', timeout: 25000 }
    );
    const frame = await frameElement.contentFrame();
    if (!frame) {
      const match = page.frames().find((f) => f.url().includes('container'));
      if (match) return match;
      throw new Error('Cockpit container-manager iframe contentFrame is null');
    }
    return frame;
  }

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
      ignoreHTTPSErrors: true,
    });
    page.on('console', (msg) => console.log(`[PAGE LOG] ${msg.type()}: ${msg.text()}`));
    page.on('pageerror', (err) => console.log(`[PAGE ERR] ${err.message || err}`));
  });

  test.afterAll(async () => {
    if (page) {
      await page.close().catch(() => {});
    }
  });

  test('01. Authenticate to Cockpit and navigate to Container Manager', async () => {
    const user = process.env.COCKPIT_USER || 'test-user';
    const pass = process.env.COCKPIT_PASSWORD || 'password';

    await page.goto('/');

    const userInput = page.locator("input#login-user-input, input#login-user, input[name='login-user'], input[autocomplete='username']").first();
    const passInput = page.locator("input#login-password-input, input#login-password, input[name='login-password'], input[autocomplete='current-password']").first();
    const loginBtn = page.locator("button#login-button, button[type='submit']").first();

    try {
      await userInput.waitFor({ state: 'visible', timeout: 8000 });
      await userInput.fill(user);
      await passInput.fill(pass);

      const authCheckbox = page.locator('input#authorized-input').first();
      if ((await authCheckbox.count()) > 0) {
        await authCheckbox.setChecked(true, { force: true }).catch(() => {});
      }

      await loginBtn.click();
    } catch {
      // Session already active
    }

    await page.waitForSelector("nav, #sidebar, a:has-text('System')", { timeout: 20000 }).catch(() => {});

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
      await page.keyboard.press('Escape');
      await page.click("button:has-text('Close'), [aria-label='Close']").catch(() => {});
      await page.waitForSelector("button:has-text('Administrative access'), a:has-text('Administrative access')", { timeout: 10000 }).catch(() => {});
    }

    // Click Containers in sidebar or navigate directly
    const navLink = page.locator("a:has-text('Containers'), a:has-text('Container Manager'), a[href*='container-manager']").first();
    await navLink.waitFor({ state: 'visible', timeout: 20000 });
    await navLink.click();

    const frame = await getFrame();
    await frame.locator('#root').waitFor({ state: 'attached', timeout: 20000 });
    await expect(frame.getByRole('heading', { name: 'Containers' }).first()).toBeVisible({ timeout: 15000 });
    await saveScreenshot(page, '01_overview_dashboard_loaded.png');
  });

  test('02. Verify Overview Dashboard and Clean Top Navigation Bar', async () => {
    const frame = await getFrame();

    // Verify top sticky navigation pill bar
    await expect(frame.locator('.cockpit-top-nav-bar, .pf-v5-c-tabs').first()).toBeVisible({ timeout: 10000 });

    // Verify metric cards
    await expect(frame.locator('.pf-v5-c-card', { hasText: 'Containers' }).first()).toBeVisible({ timeout: 10000 });
    await expect(frame.locator('.pf-v5-c-card', { hasText: 'Images' }).first()).toBeVisible({ timeout: 10000 });
    await expect(frame.locator('.pf-v5-c-card', { hasText: 'Volumes' }).first()).toBeVisible({ timeout: 10000 });
    await expect(frame.locator('.pf-v5-c-card', { hasText: 'Networks' }).first()).toBeVisible({ timeout: 10000 });

    await saveScreenshot(page, '02_overview_metrics.png');
  });

  test('03. Tab switching with top navigation pill bar', async () => {
    const frame = await getFrame();

    // Click Containers tab
    await frame.locator('button.pf-v5-c-tabs__link:has-text("Containers"), [role="tab"]:has-text("Containers")').first().click();
    await frame.waitForSelector('table[aria-label="Containers Table"], div:has-text("No Containers Found")', { timeout: 10000 });
    await saveScreenshot(page, '03_containers_tab.png');

    // Click Images tab
    await frame.locator('button.pf-v5-c-tabs__link:has-text("Images"), [role="tab"]:has-text("Images")').first().click();
    await frame.waitForSelector('table[aria-label="Images Table"], div:has-text("No Images Found")', { timeout: 10000 });
    await saveScreenshot(page, '03_images_tab.png');

    // Click Volumes tab
    await frame.locator('button.pf-v5-c-tabs__link:has-text("Volumes"), [role="tab"]:has-text("Volumes")').first().click();
    await frame.waitForSelector('table[aria-label="Volumes Table"], div:has-text("No Volumes Found")', { timeout: 10000 });
    await saveScreenshot(page, '03_volumes_tab.png');

    // Click Networks tab
    await frame.locator('button.pf-v5-c-tabs__link:has-text("Networks"), [role="tab"]:has-text("Networks")').first().click();
    await frame.waitForSelector('table[aria-label="Networks Table"], div:has-text("No Networks Found")', { timeout: 10000 });
    await saveScreenshot(page, '03_networks_tab.png');

    // Click Settings tab
    await frame.locator('button.pf-v5-c-tabs__link:has-text("Settings"), [role="tab"]:has-text("Settings")').first().click();
    await frame.waitForSelector('h1:has-text("Container Settings"), h2:has-text("Container Engine Selection")', { timeout: 10000 });
    await saveScreenshot(page, '03_settings_view.png');
  });

  test('04. Switch Engine in Settings and Open System Prune Modal', async () => {
    const frame = await getFrame();

    // Navigate to Settings
    await frame.locator('button.pf-v5-c-tabs__link:has-text("Settings"), [role="tab"]:has-text("Settings")').first().click();
    await frame.waitForSelector('h1:has-text("Container Settings")', { timeout: 10000 });

    // Test engine activation button
    const activateBtn = frame.locator('button:has-text("Activate Docker"), button:has-text("Activate Podman")').first();
    if (await activateBtn.count() > 0) {
      await activateBtn.click();
      await frame.waitForSelector('.pf-v5-c-alert.pf-m-success', { timeout: 5000 }).catch(() => {});
    }

    // Open System Prune from Settings maintenance card
    const pruneBtn = frame.locator('button:has-text("Open System Prune Modal")').first();
    if (await pruneBtn.count() > 0) {
      await pruneBtn.click();
      await frame.waitForSelector('.pf-v5-c-modal-box:has-text("System Prune")', { timeout: 5000 });

      const checkbox = frame.locator('#prune-volumes-checkbox');
      if ((await checkbox.count()) > 0) {
        await checkbox.click();
      }

      await saveScreenshot(page, '04_system_prune_modal.png');

      // Close modal
      const cancelBtn = frame.locator('.pf-v5-c-modal-box button:has-text("Cancel")');
      await cancelBtn.click();
      await frame.waitForSelector('.pf-v5-c-modal-box', { state: 'detached', timeout: 5000 });
    }
  });

  test('05. Verify Remote API, Mutual TLS & Instructions', async () => {
    const frame = await getFrame();

    // Navigate to Settings
    await frame.locator('button.pf-v5-c-tabs__link:has-text("Settings"), [role="tab"]:has-text("Settings")').first().click();
    await frame.waitForSelector('h1:has-text("Container Settings")', { timeout: 10000 });

    // Verify Remote connection instructions tabs in Settings view
    const sshTab = frame.locator('button:has-text("SSH Context")').first();
    const tcpTab = frame.locator('button:has-text("TCP + Mutual TLS Context")').first();

    expect(await sshTab.count()).toBeGreaterThan(0);
    expect(await tcpTab.count()).toBeGreaterThan(0);

    // Switch to TCP tab
    await tcpTab.click();
    await saveScreenshot(page, '05_settings_tcp_instructions.png');
  });
});
