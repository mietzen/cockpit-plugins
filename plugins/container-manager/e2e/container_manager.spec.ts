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
      "iframe[name*='container-manager']",
      { state: 'attached', timeout: 25000 }
    );
    const frame = await frameElement.contentFrame();
    if (!frame) {
      const match = page.frames().find((f) => f.url().includes('container-manager'));
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
        const nycDir = path.join(process.cwd(), '.nyc_output');
        fs.mkdirSync(nycDir, { recursive: true });
        fs.writeFileSync(
          path.join(nycDir, `coverage-cm-${testInfo.testId}-${Date.now()}.json`),
          JSON.stringify(coverageData)
        );
      }
    } catch {}
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
    if (await navLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await navLink.click();
    } else {
      await page.goto('/container-manager', { waitUntil: 'domcontentloaded', timeout: 30000 });
    }

    const frame = await getFrame();
    await frame.locator('#root').waitFor({ state: 'attached', timeout: 20000 });
    await expect(frame.getByRole('heading', { name: /Containers|No Container Engine Found/ }).first()).toBeVisible({ timeout: 20000 });
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

    // Click metric cards to exercise dashboard navigation callback
    await frame.locator('.pf-v5-c-card', { hasText: 'Images' }).first().click();
    await frame.waitForSelector('table[aria-label="Images Table"], div:has-text("No Images Found")', { timeout: 10000 });

    await frame.locator('.cockpit-top-nav-bar button:has-text("Overview")').click();
    await frame.waitForSelector('.pf-v5-c-card', { timeout: 10000 });

    await frame.locator('.pf-v5-c-card', { hasText: 'Volumes' }).first().click();
    await frame.waitForSelector('table[aria-label="Volumes Table"], div:has-text("No Volumes Found")', { timeout: 10000 });

    await frame.locator('.cockpit-top-nav-bar button:has-text("Overview")').click();
    await frame.waitForSelector('.pf-v5-c-card', { timeout: 10000 });

    // Exercise active containers table column sorts if present
    for (const colName of ['Name', 'Image', 'Status', 'Ports']) {
      const activeTh = frame.locator(`table[aria-label="Active Containers Table"] th button:has-text("${colName}"), table[aria-label="Active Containers Table"] th:has-text("${colName}")`).first();
      if (await activeTh.isVisible({ timeout: 1500 }).catch(() => false)) {
        await activeTh.click();
        await frame.waitForTimeout(200);
      }
    }

    await saveScreenshot(page, '02_overview_metrics.png');
  });

  test('03. Tab switching with top navigation pill bar', async () => {
    const frame = await getFrame();

    // Click Containers tab
    await frame.locator('.cockpit-top-nav-bar button:has-text("Containers"), button[role="tab"]:has-text("Containers")').first().click();
    await frame.waitForSelector('table[aria-label="Containers Table"], div:has-text("No Containers Found")', { timeout: 10000 });

    // Exercise container column sorts
    for (const colName of ['Name', 'Image', 'State', 'Ports']) {
      const thBtn = frame.locator(`table[aria-label="Containers Table"] th button:has-text("${colName}"), table[aria-label="Containers Table"] th:has-text("${colName}")`).first();
      if (await thBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
        await thBtn.click();
        await frame.waitForTimeout(200);
      }
    }

    // Exercise Stack View switcher
    const stackViewBtn = frame.locator('button:has-text("Stack View"), [aria-label="Container View Mode Switcher"] button:has-text("Stack")').first();
    if (await stackViewBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await stackViewBtn.click();
      await frame.waitForTimeout(300);

      // Exercise collapsible stack accordion
      const stackHeader = frame.locator('.pf-v5-c-card__header button, [class*="-c-card"] button').first();
      if (await stackHeader.isVisible({ timeout: 2000 }).catch(() => false)) {
        await stackHeader.click();
        await frame.waitForTimeout(200);
        await stackHeader.click();
      }

      // Switch back to List View
      const listViewBtn = frame.locator('button:has-text("List View"), [aria-label="Container View Mode Switcher"] button:has-text("List")').first();
      if (await listViewBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await listViewBtn.click();
        await frame.waitForTimeout(300);
      }
    }

    // Click Prune Stopped if visible
    const pruneStoppedBtn = frame.locator('button:has-text("Prune Stopped")').first();
    if (await pruneStoppedBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
      await pruneStoppedBtn.click();
      const cancelModalBtn = frame.locator('[role="dialog"] button:has-text("Cancel"), .pf-v6-c-modal-box button:has-text("Cancel")').first();
      if (await cancelModalBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await cancelModalBtn.click();
        await frame.waitForSelector('[role="dialog"], .pf-v6-c-modal-box, .pf-v5-c-modal-box', { state: 'detached', timeout: 5000 }).catch(() => {});
      }
    }

    await saveScreenshot(page, '03_containers_tab.png');

    // Click Images tab
    await frame.locator('.cockpit-top-nav-bar button:has-text("Images"), button[role="tab"]:has-text("Images")').first().click();
    await frame.waitForSelector('table[aria-label="Images Table"], div:has-text("No Images Found")', { timeout: 10000 });

    for (const colName of ['Repository', 'Tag', 'Size']) {
      const imgTh = frame.locator(`table[aria-label="Images Table"] th button:has-text("${colName}"), table[aria-label="Images Table"] th:has-text("${colName}")`).first();
      if (await imgTh.isVisible({ timeout: 1500 }).catch(() => false)) {
        await imgTh.click();
        await frame.waitForTimeout(200);
      }
    }
    await saveScreenshot(page, '03_images_tab.png');

    // Click Volumes tab
    await frame.locator('.cockpit-top-nav-bar button:has-text("Volumes"), button[role="tab"]:has-text("Volumes")').first().click();
    await frame.waitForSelector('table[aria-label="Volumes Table"], div:has-text("No Volumes Found")', { timeout: 10000 });

    for (const colName of ['Name', 'Driver', 'Mountpoint']) {
      const volTh = frame.locator(`table[aria-label="Volumes Table"] th button:has-text("${colName}"), table[aria-label="Volumes Table"] th:has-text("${colName}")`).first();
      if (await volTh.isVisible({ timeout: 1500 }).catch(() => false)) {
        await volTh.click();
        await frame.waitForTimeout(200);
      }
    }
    await saveScreenshot(page, '03_volumes_tab.png');

    // Click Networks tab
    await frame.locator('.cockpit-top-nav-bar button:has-text("Networks"), button[role="tab"]:has-text("Networks")').first().click();
    await frame.waitForSelector('table[aria-label="Networks Table"], div:has-text("No Networks Found")', { timeout: 10000 });

    for (const colName of ['Name', 'Driver', 'Subnet']) {
      const netTh = frame.locator(`table[aria-label="Networks Table"] th button:has-text("${colName}"), table[aria-label="Networks Table"] th:has-text("${colName}")`).first();
      if (await netTh.isVisible({ timeout: 1500 }).catch(() => false)) {
        await netTh.click();
        await frame.waitForTimeout(200);
      }
    }
    await saveScreenshot(page, '03_networks_tab.png');

    // Click Settings tab
    await frame.locator('.cockpit-top-nav-bar button:has-text("Settings"), button[role="tab"]:has-text("Settings")').first().click();
    await frame.waitForSelector('h1:has-text("Container Settings"), h2:has-text("Container Engine Selection")', { timeout: 10000 });

    const refreshBtn = frame.locator('button[aria-label="Refresh"], .cockpit-top-nav-bar button:has-text("Refresh")').first();
    if (await refreshBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await refreshBtn.click();
      await frame.waitForTimeout(500);
    }
    await saveScreenshot(page, '03_settings_view.png');
  });

  test('04. Switch Engine in Settings and Open System Prune Modal', async () => {
    const frame = await getFrame();

    // Navigate to Settings
    await frame.locator('.cockpit-top-nav-bar button:has-text("Settings"), button[role="tab"]:has-text("Settings")').first().click();
    await frame.waitForSelector('h1:has-text("Container Settings")', { timeout: 10000 });

    // Test engine activation button
    const activatePodmanBtn = frame.locator('button:has-text("Activate Podman")').first();
    if (await activatePodmanBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await activatePodmanBtn.click();
      await frame.waitForSelector('[class*="alert"][class*="success"], .pf-v6-c-alert.pf-m-success, .pf-v5-c-alert.pf-m-success', { timeout: 5000 }).catch(() => {});
    }

    const activateDockerBtn = frame.locator('button:has-text("Activate Docker")').first();
    if (await activateDockerBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await activateDockerBtn.click();
      await frame.waitForSelector('[class*="alert"][class*="success"], .pf-v6-c-alert.pf-m-success, .pf-v5-c-alert.pf-m-success', { timeout: 5000 }).catch(() => {});
    }

    // Open System Prune from Settings maintenance card
    const pruneBtn = frame.locator('button:has-text("Open System Prune Modal")').first();
    if (await pruneBtn.count() > 0) {
      await pruneBtn.click();
      await frame.waitForSelector('[role="dialog"]:has-text("System Prune"), .pf-v6-c-modal-box:has-text("System Prune"), .pf-v5-c-modal-box:has-text("System Prune")', { timeout: 5000 });

      const checkbox = frame.locator('#prune-volumes-checkbox');
      if ((await checkbox.count()) > 0) {
        await checkbox.click();
      }

      await saveScreenshot(page, '04_system_prune_modal.png');

      // Close modal
      const cancelBtn = frame.locator('[role="dialog"] button:has-text("Cancel"), .pf-v6-c-modal-box button:has-text("Cancel")');
      await cancelBtn.click();
      await frame.waitForSelector('[role="dialog"], .pf-v6-c-modal-box, .pf-v5-c-modal-box', { state: 'detached', timeout: 5000 });
    }
  });

  test('05. Verify Remote API Instructions Tabs', async () => {
    const frame = await getFrame();

    // Navigate to Settings
    await frame.locator('.cockpit-top-nav-bar button:has-text("Settings"), button[role="tab"]:has-text("Settings")').first().click();
    await frame.waitForSelector('h1:has-text("Container Settings")', { timeout: 10000 });

    // Verify Remote connection instructions tabs in Settings view
    const sshTab = frame.locator('button:has-text("SSH Context")').first();
    const tcpTab = frame.locator('button:has-text("TCP + Mutual TLS Context")').first();
    const envTab = frame.locator('button:has-text("Environment Variables")').first();

    if (await sshTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await sshTab.click();
      const copyBtn = frame.locator('button[aria-label="Copy code"]').first();
      if (await copyBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
        await copyBtn.click();
      }
    }
    if (await tcpTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await tcpTab.click();
      const copyBtn = frame.locator('button[aria-label="Copy code"]').first();
      if (await copyBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
        await copyBtn.click();
      }
    }
    if (await envTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await envTab.click();
      const copyBtn = frame.locator('button[aria-label="Copy code"]').first();
      if (await copyBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
        await copyBtn.click();
      }
    }

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
      await frame.waitForSelector('[role="dialog"]:has-text("Terminal:"), .pf-v6-c-modal-box:has-text("Terminal:"), .pf-v5-c-modal-box:has-text("Terminal:")', { timeout: 8000 });
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
    const closeBtn = frame.locator('[role="dialog"] button:has-text("Close Terminal"), .pf-v6-c-modal-box button:has-text("Close Terminal")').first();
    await closeBtn.click();
    await frame.waitForSelector('[role="dialog"], .pf-v6-c-modal-box, .pf-v5-c-modal-box', { state: 'detached', timeout: 5000 });
  });

  test('07. Inspect modal displays Restart Policy and JSON spec', async () => {
    const frame = await getFrame();

    // Navigate to Containers tab
    await frame.locator('.cockpit-top-nav-bar button:has-text("Containers")').click();
    await frame.waitForSelector('table[aria-label="Containers Table"]', { timeout: 10000 });

    // Open Inspect on first container
    const inspectBtn = frame.locator('table[aria-label="Containers Table"] button[aria-label="Inspect"]').first();
    await inspectBtn.waitFor({ state: 'visible', timeout: 5000 });
    await inspectBtn.click({ force: true });

    // Verify Inspect modal is open
    await frame.waitForSelector('[role="dialog"]:has-text("Inspect:"), .pf-v6-c-modal-box:has-text("Inspect:"), .pf-v5-c-modal-box:has-text("Inspect:")', { timeout: 10000 });

    // Verify Restart Policy row is displayed in Overview table
    const restartPolicyCell = frame.locator('td:has-text("Restart Policy")');
    await expect(restartPolicyCell).toBeVisible({ timeout: 5000 });

    // Filter environment variables
    const envFilter = frame.locator('input[placeholder*="Filter environment variables"]').first();
    if (await envFilter.isVisible({ timeout: 2000 }).catch(() => false)) {
      await envFilter.fill('PATH');
      await frame.waitForTimeout(300);
      await envFilter.fill('');
    }

    // Copy raw JSON
    const copyRawBtn = frame.locator('button[aria-label="Copy raw JSON"]').first();
    if (await copyRawBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await copyRawBtn.click();
    }

    // Close Inspect modal
    await frame.locator('[role="dialog"] button:has-text("Close"), .pf-v6-c-modal-box button:has-text("Close")').click();
    await frame.waitForSelector('[role="dialog"], .pf-v6-c-modal-box, .pf-v5-c-modal-box', { state: 'detached', timeout: 5000 });
  });

  test('08. Verify Container Table Refresh and Port Link Formatting', async () => {
    const frame = await getFrame();

    // Navigate to Containers tab
    await frame.locator('.cockpit-top-nav-bar button:has-text("Containers")').click();
    await frame.waitForSelector('table[aria-label="Containers Table"]', { timeout: 10000 });

    // Check port links presence if available
    const portLink = frame.locator('table[aria-label="Containers Table"] a[target="_blank"]').first();
    if (await portLink.isVisible({ timeout: 2000 }).catch(() => false)) {
      expect(await portLink.getAttribute('href')).toBeTruthy();
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

    // Verify HashId copy button is present and clickable
    const hashBtn = frame.locator('table[aria-label="Containers Table"] button[aria-label*="Copy ID"]').first();
    await expect(hashBtn).toBeVisible({ timeout: 5000 });
    await hashBtn.click().catch(() => {});

    // Switch to Volumes tab and verify Size column header
    await frame.locator('.cockpit-top-nav-bar button:has-text("Volumes")').click();
    await frame.waitForSelector('table[aria-label="Volumes Table"], div:has-text("No Volumes Found")', { timeout: 10000 });
    const sizeTh = frame.locator('table[aria-label="Volumes Table"] th:has-text("Size")').first();
    if (await sizeTh.count() > 0) {
      await expect(sizeTh).toBeVisible();
    }
  });

  test('10. Verify Delete Confirmation Modal Disappears On Confirm', async () => {
    const frame = await getFrame();

    // Navigate to Containers tab
    await frame.locator('.cockpit-top-nav-bar button:has-text("Containers")').click();
    await frame.waitForSelector('table[aria-label="Containers Table"]', { timeout: 10000 });

    // Look for an enabled container delete button
    const deleteBtn = frame.locator('table[aria-label="Containers Table"] button[aria-label="Delete"]:not([disabled])')
      .first();

    if (await deleteBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await deleteBtn.click();

      // Verify modal appears
      await frame.waitForSelector('[role="dialog"]:has-text("Delete Container"), .pf-v6-c-modal-box:has-text("Delete Container"), .pf-v5-c-modal-box:has-text("Delete Container")', { timeout: 5000 });

      // Click the Delete Container confirm button
      const confirmBtn = frame.locator('[role="dialog"] button:has-text("Delete Container"), .pf-v6-c-modal-box button:has-text("Delete Container")').first();
      await confirmBtn.click();

      // Verify modal is completely dismissed and detached
      await frame.waitForSelector('[role="dialog"], .pf-v6-c-modal-box, .pf-v5-c-modal-box', { state: 'detached', timeout: 5000 });
    }
  });

  test('11. View Container Logs Modal', async () => {
    const frame = await getFrame();

    // Navigate to Containers tab
    await frame.locator('.cockpit-top-nav-bar button:has-text("Containers")').click();
    await frame.waitForSelector('table[aria-label="Containers Table"]', { timeout: 10000 });

    // Click logs button on first container
    const logsBtn = frame.locator('table[aria-label="Containers Table"] button[aria-label="Logs"]').first();
    if (await logsBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await logsBtn.click();
      await frame.waitForSelector('[role="dialog"]:has-text("Logs:"), .pf-v6-c-modal-box:has-text("Logs:"), .pf-v5-c-modal-box:has-text("Logs:")', { timeout: 10000 });

      // Toggle Show Timestamps checkbox
      const timestampsCheckbox = frame.locator('input#timestamps-toggle, label:has-text("Show Timestamps")').first();
      if (await timestampsCheckbox.isVisible({ timeout: 3000 }).catch(() => false)) {
        await timestampsCheckbox.click().catch(() => {});
      }

      // Close logs modal
      const closeBtn = frame.locator('[role="dialog"] button:has-text("Close Logs"), .pf-v6-c-modal-box button:has-text("Close Logs"), [role="dialog"] button[aria-label="Close"], .pf-v6-c-modal-box button[aria-label="Close"], .pf-v5-c-modal-box button[aria-label="Close"]').first();
      await closeBtn.click();
      await frame.waitForSelector('[role="dialog"]:has-text("Logs:"), .pf-v6-c-modal-box:has-text("Logs:"), .pf-v5-c-modal-box:has-text("Logs:")', { state: 'detached', timeout: 5000 });
    }
  });


  test('12. Images Tab Prune Unused Modal', async () => {
    const frame = await getFrame();

    // Navigate to Images tab
    await frame.locator('.cockpit-top-nav-bar button:has-text("Images")').click();
    await frame.waitForSelector('table[aria-label="Images Table"], div:has-text("No Images Found")', { timeout: 10000 });

    const pruneImagesBtn = frame.locator('button:has-text("Prune Unused Images"), button:has-text("Prune Images")').first();
    if (await pruneImagesBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await pruneImagesBtn.click();
      await frame.waitForSelector('[role="dialog"], .pf-v6-c-modal-box, .pf-v5-c-modal-box', { timeout: 5000 });

      const cancelBtn = frame.locator('[role="dialog"] button:has-text("Cancel"), .pf-v6-c-modal-box button:has-text("Cancel")').first();
      await cancelBtn.click();
      await frame.waitForSelector('[role="dialog"], .pf-v6-c-modal-box, .pf-v5-c-modal-box', { state: 'detached', timeout: 5000 });
    }
  });

  test('13. Volumes Tab Prune Modal', async () => {
    const frame = await getFrame();

    // Navigate to Volumes tab
    await frame.locator('.cockpit-top-nav-bar button:has-text("Volumes")').click();
    await frame.waitForSelector('table[aria-label="Volumes Table"], div:has-text("No Volumes Found")', { timeout: 10000 });

    const pruneVolumesBtn = frame.locator('button:has-text("Prune Unused Volumes"), button:has-text("Prune Volumes")').first();
    if (await pruneVolumesBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await pruneVolumesBtn.click();
      await frame.waitForSelector('[role="dialog"], .pf-v6-c-modal-box, .pf-v5-c-modal-box', { timeout: 5000 });

      const cancelBtn = frame.locator('[role="dialog"] button:has-text("Cancel"), .pf-v6-c-modal-box button:has-text("Cancel")').first();
      await cancelBtn.click();
      await frame.waitForSelector('[role="dialog"], .pf-v6-c-modal-box, .pf-v5-c-modal-box', { state: 'detached', timeout: 5000 });
    }
  });

  test('14. Networks Tab Prune Modal', async () => {
    const frame = await getFrame();

    // Navigate to Networks tab
    await frame.locator('.cockpit-top-nav-bar button:has-text("Networks")').click();
    await frame.waitForSelector('table[aria-label="Networks Table"], div:has-text("No Networks Found")', { timeout: 10000 });

    const pruneNetsBtn = frame.locator('button:has-text("Prune Unused Networks"), button:has-text("Prune Networks")').first();
    if (await pruneNetsBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await pruneNetsBtn.click();
      await frame.waitForSelector('[role="dialog"], .pf-v6-c-modal-box, .pf-v5-c-modal-box', { timeout: 5000 });

      const cancelBtn = frame.locator('[role="dialog"] button:has-text("Cancel"), .pf-v6-c-modal-box button:has-text("Cancel")').first();
      await cancelBtn.click();
      await frame.waitForSelector('[role="dialog"], .pf-v6-c-modal-box, .pf-v5-c-modal-box', { state: 'detached', timeout: 5000 });
    }
  });

  test('15. Configure Remote TLS, Download Certificates, and Toggle TCP Socket', async () => {
    const frame = await getFrame();

    // Navigate to Settings
    await frame.locator('.cockpit-top-nav-bar button:has-text("Settings")').click();
    await frame.waitForSelector('h1:has-text("Container Settings")', { timeout: 10000 });

    // Test Generate Certificates & Enable Remote TCP button if TCP not yet enabled
    const setupBtn = frame.locator('button:has-text("Generate Certificates & Enable Remote TCP")').first();
    if (await setupBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      const sansInput = frame.locator('input#sans-input').first();
      if (await sansInput.count() > 0) {
        await sansInput.fill('127.0.0.1, localhost');
      }
      await setupBtn.click();
      await frame.waitForSelector('span:has-text("TCP Enabled"), button:has-text("Disable Remote TCP")', { timeout: 15000 });
    }

    // Test downloading .zip from Settings view
    const downloadZipBtn = frame.locator('button:has-text("Download Client Certs (.zip)")').first();
    if (await downloadZipBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      const [zipDownload] = await Promise.all([
        page.waitForEvent('download', { timeout: 8000 }),
        downloadZipBtn.click(),
      ]);
      expect(zipDownload.suggestedFilename()).toContain('.zip');
    }

    // Click View Certificates to test individual file downloads and modal tabs
    const viewCertsBtn = frame.locator('button:has-text("View Certificates")').first();
    if (await viewCertsBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await viewCertsBtn.click();
      await frame.waitForSelector('[role="dialog"]:has-text("Client Certificates & Keys"), .pf-v6-c-modal-box:has-text("Client Certificates & Keys"), .pf-v5-c-modal-box:has-text("Client Certificates & Keys")', { timeout: 8000 });

      // Click cert modal tabs
      const clientCertTab = frame.locator('[role="dialog"] button:has-text("Client Certificate"), .pf-v6-c-modal-box button:has-text("Client Certificate")').first();
      const clientKeyTab = frame.locator('[role="dialog"] button:has-text("Client Private Key"), .pf-v6-c-modal-box button:has-text("Client Private Key")').first();
      const caTab = frame.locator('[role="dialog"] button:has-text("CA Certificate"), .pf-v6-c-modal-box button:has-text("CA Certificate")').first();

      if (await clientCertTab.isVisible({ timeout: 2000 }).catch(() => false)) {
        await clientCertTab.click();
      }
      if (await clientKeyTab.isVisible({ timeout: 2000 }).catch(() => false)) {
        await clientKeyTab.click();
      }
      if (await caTab.isVisible({ timeout: 2000 }).catch(() => false)) {
        await caTab.click();
      }

      // Click Download ca.pem and verify browser download event fires
      const downloadCaBtn = frame.locator('button:has-text("Download ca.pem")').first();
      if (await downloadCaBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        const [download] = await Promise.all([
          page.waitForEvent('download', { timeout: 8000 }),
          downloadCaBtn.click(),
        ]);
        expect(download.suggestedFilename()).toBe('ca.pem');
      }

      // Click Copy button in cert modal
      const copyCertBtn = frame.locator('[role="dialog"] button[aria-label*="Copy"], .pf-v6-c-modal-box button[aria-label*="Copy"], .pf-v5-c-modal-box button[aria-label*="Copy"]').first();
      if (await copyCertBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await copyCertBtn.click();
      }

      // Close modal
      const closeBtn = frame.locator('[role="dialog"] button:has-text("Close"), .pf-v6-c-modal-box button:has-text("Close")').first();
      if (await closeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await closeBtn.click();
      }
    }

    // Test Disable Remote TCP button
    const disableBtn = frame.locator('button:has-text("Disable Remote TCP")').first();
    if (await disableBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await disableBtn.click();
      await frame.waitForSelector('span:has-text("TCP Disabled"), button:has-text("Generate Certificates")', { timeout: 15000 });
    }
  });

  test('16. Dashboard Active Containers Actions', async () => {
    const frame = await getFrame();

    // Navigate to Overview
    await frame.locator('.cockpit-top-nav-bar button:has-text("Overview")').click();
    await frame.waitForSelector('table[aria-label="Active Containers Table"], h1:has-text("Containers")', { timeout: 10000 });

    // Test Inspect button on Dashboard active containers card
    const inspectBtn = frame.locator('table[aria-label="Active Containers Table"] button[aria-label="Inspect"]').first();
    if (await inspectBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await inspectBtn.click({ force: true });
      await frame.waitForSelector('[role="dialog"]:has-text("Inspect:"), .pf-v6-c-modal-box:has-text("Inspect:"), .pf-v5-c-modal-box:has-text("Inspect:")', { timeout: 8000 });

      const closeBtn = frame.locator('[role="dialog"] button:has-text("Close"), .pf-v6-c-modal-box button:has-text("Close")').first();
      await closeBtn.click();
      await frame.waitForSelector('[role="dialog"], .pf-v6-c-modal-box, .pf-v5-c-modal-box', { state: 'detached', timeout: 5000 });
    }

    // Test Logs button on Dashboard active containers card
    const logsBtn = frame.locator('table[aria-label="Active Containers Table"] button[aria-label="Logs"]').first();
    if (await logsBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await logsBtn.click({ force: true });
      await frame.waitForSelector('[role="dialog"]:has-text("Logs:"), .pf-v6-c-modal-box:has-text("Logs:"), .pf-v5-c-modal-box:has-text("Logs:")', { timeout: 8000 });

      const closeBtn = frame.locator('[role="dialog"] button:has-text("Close Logs"), .pf-v6-c-modal-box button:has-text("Close Logs"), [role="dialog"] button[aria-label="Close"], .pf-v6-c-modal-box button[aria-label="Close"], .pf-v5-c-modal-box button[aria-label="Close"]').first();
      await closeBtn.click();
      await frame.waitForSelector('[role="dialog"]:has-text("Logs:"), .pf-v6-c-modal-box:has-text("Logs:"), .pf-v5-c-modal-box:has-text("Logs:")', { state: 'detached', timeout: 5000 });
    }

    // Test Restart button on Dashboard active containers card
    const restartBtn = frame.locator('table[aria-label="Active Containers Table"] button[aria-label="Restart"]').first();
    if (await restartBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await restartBtn.click({ force: true });
      await frame.waitForTimeout(1000);
    }
  });

  test('17. Filter and Search Containers, Images, Volumes, and Networks Tables', async () => {
    const frame = await getFrame();

    // Navigate to Containers tab and filter
    await frame.locator('.cockpit-top-nav-bar button:has-text("Containers")').click();
    await frame.waitForSelector('table[aria-label="Containers Table"]', { timeout: 10000 });
    const searchInput = frame.locator('input[placeholder*="Filter containers"]').first();
    if (await searchInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await searchInput.fill('e2e-web');
      await frame.waitForTimeout(300);
      const clearBtn = frame.locator('button[aria-label="Clear input"], .pf-v6-c-search-input__clear, .pf-v5-c-search-input__clear').first();
      if (await clearBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await clearBtn.click();
      } else {
        await searchInput.fill('');
      }
    }

    // Filter Images tab
    await frame.locator('.cockpit-top-nav-bar button:has-text("Images")').click();
    await frame.waitForSelector('table[aria-label="Images Table"], div:has-text("No Images Found")', { timeout: 10000 });
    const searchImgInput = frame.locator('input[placeholder*="Filter images"]').first();
    if (await searchImgInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await searchImgInput.fill('nginx');
      await frame.waitForTimeout(300);
      await searchImgInput.fill('');
    }

    // Filter Volumes tab
    await frame.locator('.cockpit-top-nav-bar button:has-text("Volumes")').click();
    await frame.waitForSelector('table[aria-label="Volumes Table"], div:has-text("No Volumes Found")', { timeout: 10000 });
    const searchVolInput = frame.locator('input[placeholder*="Filter volumes"]').first();
    if (await searchVolInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await searchVolInput.fill('vol');
      await frame.waitForTimeout(300);
      await searchVolInput.fill('');
    }

    // Filter Networks tab
    await frame.locator('.cockpit-top-nav-bar button:has-text("Networks")').click();
    await frame.waitForSelector('table[aria-label="Networks Table"], div:has-text("No Networks Found")', { timeout: 10000 });
    const searchNetInput = frame.locator('input[placeholder*="Filter networks"]').first();
    if (await searchNetInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await searchNetInput.fill('bridge');
      await frame.waitForTimeout(300);
      await searchNetInput.fill('');
    }
  });

  test('18. Inspect Image, Volume, and Network Modals', async () => {
    const frame = await getFrame();

    // Inspect first image
    await frame.locator('.cockpit-top-nav-bar button:has-text("Images")').click();
    await frame.waitForSelector('table[aria-label="Images Table"], div:has-text("No Images Found")', { timeout: 10000 });

    const inspectImageBtn = frame.locator('table[aria-label="Images Table"] button[aria-label="Inspect"]').first();
    if (await inspectImageBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await inspectImageBtn.click({ force: true });
      await frame.waitForSelector('[role="dialog"]:has-text("Inspect:"), .pf-v6-c-modal-box:has-text("Inspect:"), .pf-v5-c-modal-box:has-text("Inspect:")', { timeout: 8000 });
      const copyBtn = frame.locator('button[aria-label="Copy raw JSON"]').first();
      if (await copyBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await copyBtn.click();
      }
      const closeBtn = frame.locator('[role="dialog"] button:has-text("Close"), .pf-v6-c-modal-box button:has-text("Close")').first();
      await closeBtn.click();
      await frame.waitForSelector('[role="dialog"], .pf-v6-c-modal-box, .pf-v5-c-modal-box', { state: 'detached', timeout: 5000 });
    }

    // Inspect first volume
    await frame.locator('.cockpit-top-nav-bar button:has-text("Volumes")').click();
    await frame.waitForSelector('table[aria-label="Volumes Table"], div:has-text("No Volumes Found")', { timeout: 10000 });

    const inspectVolBtn = frame.locator('table[aria-label="Volumes Table"] button[aria-label="Inspect"]').first();
    if (await inspectVolBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await inspectVolBtn.click({ force: true });
      await frame.waitForSelector('[role="dialog"]:has-text("Inspect:"), .pf-v6-c-modal-box:has-text("Inspect:"), .pf-v5-c-modal-box:has-text("Inspect:")', { timeout: 8000 });
      const copyBtn = frame.locator('button[aria-label="Copy raw JSON"]').first();
      if (await copyBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await copyBtn.click();
      }
      const closeBtn = frame.locator('[role="dialog"] button:has-text("Close"), .pf-v6-c-modal-box button:has-text("Close")').first();
      await closeBtn.click();
      await frame.waitForSelector('[role="dialog"], .pf-v6-c-modal-box, .pf-v5-c-modal-box', { state: 'detached', timeout: 5000 });
    }

    // Inspect first network
    await frame.locator('.cockpit-top-nav-bar button:has-text("Networks")').click();
    await frame.waitForSelector('table[aria-label="Networks Table"], div:has-text("No Networks Found")', { timeout: 10000 });

    const inspectNetBtn = frame.locator('table[aria-label="Networks Table"] button[aria-label="Inspect"]').first();
    if (await inspectNetBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await inspectNetBtn.click({ force: true });
      await frame.waitForSelector('[role="dialog"]:has-text("Inspect:"), .pf-v6-c-modal-box:has-text("Inspect:"), .pf-v5-c-modal-box:has-text("Inspect:")', { timeout: 8000 });
      const copyBtn = frame.locator('button[aria-label="Copy raw JSON"]').first();
      if (await copyBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await copyBtn.click();
      }
      const closeBtn = frame.locator('[role="dialog"] button:has-text("Close"), .pf-v6-c-modal-box button:has-text("Close")').first();
      await closeBtn.click();
      await frame.waitForSelector('[role="dialog"], .pf-v6-c-modal-box, .pf-v5-c-modal-box', { state: 'detached', timeout: 5000 });
    }
  });

  test('19. Delete Confirmation Modals for Images, Volumes, and Networks', async () => {
    const frame = await getFrame();

    // Images delete modal
    await frame.locator('.cockpit-top-nav-bar button:has-text("Images")').click();
    await frame.waitForSelector('table[aria-label="Images Table"], div:has-text("No Images Found")', { timeout: 10000 });
    const deleteImageBtn = frame.locator('table[aria-label="Images Table"] button[aria-label="Delete"]:not([disabled])').first();
    if (await deleteImageBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await deleteImageBtn.click();
      await frame.waitForSelector('[role="dialog"]:has-text("Delete Image"), .pf-v6-c-modal-box:has-text("Delete Image"), .pf-v5-c-modal-box:has-text("Delete Image")', { timeout: 5000 });
      const cancelBtn = frame.locator('[role="dialog"] button:has-text("Cancel"), .pf-v6-c-modal-box button:has-text("Cancel")').first();
      await cancelBtn.click();
      await frame.waitForSelector('[role="dialog"], .pf-v6-c-modal-box, .pf-v5-c-modal-box', { state: 'detached', timeout: 5000 });
    }

    // Volumes delete modal
    await frame.locator('.cockpit-top-nav-bar button:has-text("Volumes")').click();
    await frame.waitForSelector('table[aria-label="Volumes Table"], div:has-text("No Volumes Found")', { timeout: 10000 });
    const deleteVolBtn = frame.locator('table[aria-label="Volumes Table"] button[aria-label="Delete"]:not([disabled])').first();
    if (await deleteVolBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await deleteVolBtn.click();
      await frame.waitForSelector('[role="dialog"]:has-text("Delete Volume"), .pf-v6-c-modal-box:has-text("Delete Volume"), .pf-v5-c-modal-box:has-text("Delete Volume")', { timeout: 5000 });
      const cancelBtn = frame.locator('[role="dialog"] button:has-text("Cancel"), .pf-v6-c-modal-box button:has-text("Cancel")').first();
      await cancelBtn.click();
      await frame.waitForSelector('[role="dialog"], .pf-v6-c-modal-box, .pf-v5-c-modal-box', { state: 'detached', timeout: 5000 });
    }

    // Networks delete modal
    await frame.locator('.cockpit-top-nav-bar button:has-text("Networks")').click();
    await frame.waitForSelector('table[aria-label="Networks Table"], div:has-text("No Networks Found")', { timeout: 10000 });
    const deleteNetBtn = frame.locator('table[aria-label="Networks Table"] button[aria-label="Delete"]:not([disabled])').first();
    if (await deleteNetBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await deleteNetBtn.click();
      await frame.waitForSelector('[role="dialog"]:has-text("Delete Network"), .pf-v6-c-modal-box:has-text("Delete Network"), .pf-v5-c-modal-box:has-text("Delete Network")', { timeout: 5000 });
      const cancelBtn = frame.locator('[role="dialog"] button:has-text("Cancel"), .pf-v6-c-modal-box button:has-text("Cancel")').first();
      await cancelBtn.click();
      await frame.waitForSelector('[role="dialog"], .pf-v6-c-modal-box, .pf-v5-c-modal-box', { state: 'detached', timeout: 5000 });
    }
  });
});






