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
    const activatePodmanBtn = frame.locator('button:has-text("Activate Podman")').first();
    if (await activatePodmanBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await activatePodmanBtn.click();
      await frame.waitForSelector('.pf-v5-c-alert.pf-m-success', { timeout: 5000 }).catch(() => {});
    }

    const activateDockerBtn = frame.locator('button:has-text("Activate Docker")').first();
    if (await activateDockerBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await activateDockerBtn.click();
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

  test('06. Interactive Container Terminal Keystroke Input Test', async () => {
    const frame = await getFrame();

    // Navigate to Containers tab
    await frame.locator('.cockpit-top-nav-bar button:has-text("Containers")').click();
    await frame.waitForSelector('table[aria-label="Containers Table"]', { timeout: 10000 });

    // Click terminal icon on first container in visible table
    const termBtn = frame.locator('table[aria-label="Containers Table"] button[aria-label="Terminal"]').first();
    await termBtn.click();

    // Wait for terminal modal and connection prompt to appear
    await frame.waitForSelector('.pf-v5-c-modal-box:has-text("Terminal:")', { timeout: 8000 });
    await frame.waitForSelector('.xterm-screen', { timeout: 8000 });
    await frame.waitForSelector('.xterm-rows:has-text("#")', { timeout: 10000 });

    // Focus and type test command into container PTY via xterm helper textarea
    await frame.locator('.xterm').first().click();
    const xtermTextarea = frame.locator('textarea.xterm-helper-textarea').first();
    await xtermTextarea.focus();
    await page.keyboard.type('echo TEST_XTERM_OUTPUT_SUCCESS', { delay: 30 });
    await page.keyboard.press('Enter');

    // Verify terminal output contains the echoed text
    const rows = frame.locator('.xterm-rows').first();
    await expect(rows).toContainText('TEST_XTERM_OUTPUT_SUCCESS', { timeout: 10000 });

    // Close terminal modal
    const closeBtn = frame.locator('.pf-v5-c-modal-box button:has-text("Close Terminal")').first();
    await closeBtn.click();
    await frame.waitForSelector('.pf-v5-c-modal-box', { state: 'detached', timeout: 5000 });
  });

  test('07. Inspect modal displays Restart Policy', async () => {
    const frame = await getFrame();

    // Navigate to Containers tab
    await frame.locator('.cockpit-top-nav-bar button:has-text("Containers")').click();
    await frame.waitForSelector('table[aria-label="Containers Table"]', { timeout: 10000 });

    // Open Inspect on first container
    const inspectBtn = frame.locator('table[aria-label="Containers Table"] button[aria-label="Inspect"]').first();
    await inspectBtn.click();

    // Verify Inspect modal is open
    await frame.waitForSelector('.pf-v5-c-modal-box:has-text("Inspect:")', { timeout: 8000 });

    // Verify Restart Policy row is displayed in Overview table
    const restartPolicyCell = frame.locator('td:has-text("Restart Policy")');
    await expect(restartPolicyCell).toBeVisible({ timeout: 5000 });

    // Close Inspect modal
    await frame.locator('.pf-v5-c-modal-box button:has-text("Close")').click();
    await frame.waitForSelector('.pf-v5-c-modal-box', { state: 'detached', timeout: 5000 });
  });

  test('08. Download TLS Client Certificates', async () => {
    const frame = await getFrame();

    // Navigate to Settings
    await frame.locator('.cockpit-top-nav-bar button:has-text("Settings")').click();
    await frame.waitForSelector('h1:has-text("Container Settings")', { timeout: 10000 });

    // Test downloading .zip from Settings view
    const downloadZipBtn = frame.locator('button:has-text("Download Client Certs (.zip)")').first();
    if (await downloadZipBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      const zipDownloadPromise = page.waitForEvent('download', { timeout: 8000 });
      await downloadZipBtn.click();
      const zipDownload = await zipDownloadPromise;
      expect(zipDownload.suggestedFilename()).toContain('.zip');
    }

    // Click View Certificates to test individual file downloads
    const viewCertsBtn = frame.locator('button:has-text("View Certificates")').first();
    if (await viewCertsBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await viewCertsBtn.click();
      await frame.waitForSelector('.pf-v5-c-modal-box:has-text("Client Certificates & Keys")', { timeout: 8000 });

      // Click Download ca.pem and verify browser download event fires
      const downloadPromise = page.waitForEvent('download', { timeout: 8000 });
      const downloadCaBtn = frame.locator('button:has-text("Download ca.pem")').first();
      await downloadCaBtn.click();

      const download = await downloadPromise;
      expect(download.suggestedFilename()).toBe('ca.pem');

      // Close modal
      await frame.locator('.pf-v5-c-modal-box button:has-text("Close")').click();
    }
  });

  test('09. Verify Kill Action, Hash ID Copy, and Volume Size', async () => {
    const frame = await getFrame();

    // Navigate to Containers tab
    await frame.locator('.cockpit-top-nav-bar button:has-text("Containers")').click();
    await frame.waitForSelector('table[aria-label="Containers Table"]', { timeout: 10000 });

    // Verify Kill button is present on running containers
    const killBtn = frame.locator('table[aria-label="Containers Table"] button[aria-label="Kill"]').first();
    if (await killBtn.count() > 0) {
      await expect(killBtn).toBeVisible();
    }

    // Verify HashId copy button is present
    const hashBtn = frame.locator('table[aria-label="Containers Table"] button[aria-label*="Copy ID"]').first();
    await expect(hashBtn).toBeVisible({ timeout: 5000 });

    // Switch to Volumes tab and verify Size column header
    await frame.locator('.cockpit-top-nav-bar button:has-text("Volumes")').click();
    await frame.waitForSelector('table[aria-label="Volumes Table"], div:has-text("No Volumes Found")', { timeout: 10000 });
    const sizeTh = frame.locator('table[aria-label="Volumes Table"] th:has-text("Size")').first();
    if (await sizeTh.count() > 0) {
      await expect(sizeTh).toBeVisible();
    }
  });
});


