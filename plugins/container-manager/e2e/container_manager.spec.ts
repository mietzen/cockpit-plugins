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

test.describe.serial('Cockpit Container Manager Plugin Comprehensive E2E Suite', () => {
  let page: Page;

  async function getFrame(): Promise<Frame> {
    const frameElement = await page.waitForSelector("iframe[name*='container-manager']", {
      state: 'attached',
      timeout: 20000,
    });
    const frame = await frameElement.contentFrame();
    if (!frame) {
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
          if (cov) {
            coverageData = cov;
            break;
          }
        } catch {
          // Ignore
        }
      }

      if (coverageData) {
        const covDir = path.join(process.cwd(), 'coverage-e2e');
        fs.mkdirSync(covDir, { recursive: true });
        const covFile = path.join(covDir, `cov-container-manager-${testInfo.title.replace(/\s+/g, '_')}.json`);
        fs.writeFileSync(covFile, JSON.stringify(coverageData));
      }
    } catch {
      // Ignore coverage dump error
    }
  });

  test('01. Authenticate to Cockpit shell', async () => {
    const cockpitUrl = process.env.COCKPIT_URL || 'https://192.168.40.142:9090';
    const user = process.env.COCKPIT_USER || 'test-user';
    const pass = process.env.COCKPIT_PASS || 'password';

    await page.goto(cockpitUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    const loginInput = page.locator('#login-user-input, input[name="login"], input[id*="user"]');
    if (await loginInput.count() > 0) {
      await loginInput.first().fill(user);
      const passInput = page.locator('#login-password-input, input[type="password"]');
      await passInput.first().fill(pass);

      const authCheckbox = page.locator("input#authorized-input").first();
      if ((await authCheckbox.count()) > 0) {
        await authCheckbox.setChecked(true, { force: true }).catch(() => {});
      }

      const submitBtn = page.locator('#login-button, button[type="submit"], button:has-text("Log in")');
      await submitBtn.first().click();
      await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 20000 }).catch(() => {});
    }

    // Elevate access to administrative if needed
    const elevateBtn = page.locator("button:has-text('Limited access'), a:has-text('Limited access')").first();
    if (await elevateBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await elevateBtn.click();
      const sudoPass = page.locator("input#superuser-password-input, input[type='password']").first();
      if (await sudoPass.isVisible({ timeout: 3000 }).catch(() => false)) {
        await sudoPass.fill(pass);
        const confirmBtn = page.locator("button:has-text('Authorize'), button:has-text('Authenticate'), button[type='submit']").first();
        await confirmBtn.click();
        await page.waitForTimeout(1000);
      }
    }

    await saveScreenshot(page, '01_logged_in.png');
  });

  test('02. Navigate to Container Manager plugin', async () => {
    const cockpitUrl = process.env.COCKPIT_URL || 'https://192.168.40.142:9090';
    await page.goto(`${cockpitUrl}/container-manager`, { waitUntil: 'domcontentloaded', timeout: 30000 });

    const frame = await getFrame();
    await frame.waitForSelector('h1:has-text("Containers")', { timeout: 15000 });
    await frame.waitForSelector('table[aria-label="Containers Table"], div:has-text("No Containers Found")', { timeout: 10000 });

    const title = await frame.locator('h1').textContent();
    expect(title).toContain('Containers');

    await saveScreenshot(page, '02_container_manager_loaded.png');
  });

  test('03. Tab switching with persistent views', async () => {
    const frame = await getFrame();

    // Click Images tab
    await frame.locator('button:has-text("Images")').first().click();
    await frame.waitForSelector('table[aria-label="Images Table"], div:has-text("No Images Found")', { timeout: 10000 });
    await saveScreenshot(page, '03_images_tab.png');

    // Click Volumes tab
    await frame.locator('button:has-text("Volumes")').first().click();
    await frame.waitForSelector('table[aria-label="Volumes Table"], div:has-text("No Volumes Found")', { timeout: 10000 });
    await saveScreenshot(page, '03_volumes_tab.png');

    // Click Networks tab
    await frame.locator('button:has-text("Networks")').first().click();
    await frame.waitForSelector('table[aria-label="Networks Table"], div:has-text("No Networks Found")', { timeout: 10000 });
    await saveScreenshot(page, '03_networks_tab.png');

    // Return to Containers tab
    await frame.locator('button:has-text("Containers")').first().click();
    await frame.waitForSelector('table[aria-label="Containers Table"], div:has-text("No Containers Found")', { timeout: 10000 });
    await saveScreenshot(page, '03_containers_tab_returned.png');
  });

  test('04. Open System Prune Modal', async () => {
    const frame = await getFrame();

    const pruneBtn = frame.locator('button:has-text("System Prune")');
    await pruneBtn.click();

    // Verify modal appears
    await frame.waitForSelector('.pf-v5-c-modal-box:has-text("System Prune")', { timeout: 5000 });

    const checkbox = frame.locator('#prune-volumes-checkbox');
    if (await checkbox.count() > 0) {
      await checkbox.click();
    }

    await saveScreenshot(page, '04_system_prune_modal.png');

    // Close modal
    const cancelBtn = frame.locator('.pf-v5-c-modal-box button:has-text("Cancel")');
    await cancelBtn.click();
    await frame.waitForSelector('.pf-v5-c-modal-box', { state: 'detached', timeout: 5000 });
  });

  test('05. Open Remote API & TLS Modal and inspect instructions', async () => {
    const frame = await getFrame();

    const remoteApiBtn = frame.locator('button:has-text("Remote API & TLS")');
    await remoteApiBtn.waitFor({ state: 'visible', timeout: 5000 });
    await remoteApiBtn.click();

    await frame.waitForSelector('.pf-v5-c-modal-box:has-text("Remote API & TLS")', { timeout: 10000 });

    // Verify instructions tabs
    const sshTab = frame.locator('button:has-text("SSH Context")');
    const tcpTab = frame.locator('button:has-text("TCP + Mutual TLS Context")');
    const envTab = frame.locator('button:has-text("Environment Variables")');

    expect(await sshTab.count()).toBeGreaterThan(0);
    expect(await tcpTab.count()).toBeGreaterThan(0);
    expect(await envTab.count()).toBeGreaterThan(0);

    // Switch to TCP tab
    await tcpTab.click();
    await frame.locator('code:has-text("Unzip")').waitFor({ state: 'visible', timeout: 5000 });
    await saveScreenshot(page, '05_remote_api_tcp_instructions.png');

    // Switch to Env tab
    await envTab.click();
    await frame.locator('code:has-text("DOCKER_TLS_VERIFY")').waitFor({ state: 'visible', timeout: 5000 });
    await saveScreenshot(page, '05_remote_api_env_instructions.png');

    // Close modal
    const closeBtn = frame.locator('.pf-v5-c-modal-box button:has-text("Close")');
    await closeBtn.click();
    await frame.waitForSelector('.pf-v5-c-modal-box', { state: 'detached', timeout: 5000 });
  });
});
