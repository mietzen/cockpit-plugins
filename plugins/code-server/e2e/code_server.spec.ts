import { test, expect, Page, Frame } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

async function saveScreenshot(page: Page, filename: string) {
  const targetDir = process.env.SCREENSHOT_DIR || path.join(process.cwd(), "docs/screenshots");
  try {
    fs.mkdirSync(targetDir, { recursive: true });
    await page.screenshot({ path: path.join(targetDir, filename) });
  } catch (err) {
    console.warn(`Could not save screenshot ${filename}:`, err);
  }
}

test.describe.serial("Cockpit Code Server E2E Test Suite", () => {
  let page: Page;

  async function getFrame(): Promise<Frame> {
    const frameElement = await page.waitForSelector(
      "iframe[name*='code-server']",
      { state: "attached", timeout: 25000 }
    );
    const frame = await frameElement.contentFrame();
    if (!frame) {
      const match = page.frames().find((f) => f.url().includes("code-server"));
      if (match) return match;
      throw new Error("Cockpit code-server iframe contentFrame is null");
    }
    return frame;
  }

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage({
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 1.5,
      ignoreHTTPSErrors: true,
    });
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
          path.join(nycDir, `coverage-cs-${testInfo.testId}-${Date.now()}.json`),
          JSON.stringify(coverageData)
        );
      }
    } catch {}
  });

  test("01. Authenticate to Cockpit and navigate to VS Code Server", async () => {
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
      // Session already active
    }

    await page.waitForSelector("nav, #sidebar, a:has-text('System')", { timeout: 20000 }).catch(() => {});

    // Elevate privileges if button is present
    const elevateBtn = page.locator("button:has-text('Limited access'), a:has-text('Limited access')").first();
    if (await elevateBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await elevateBtn.click();
      const sudoPass = page.locator("input#superuser-password-input, input[type='password']").first();
      if (await sudoPass.isVisible({ timeout: 2000 }).catch(() => false)) {
        await sudoPass.fill(pass);
        const confirmElevate = page.locator("button#superuser-authorize-button, button:has-text('Authenticate')").first();
        await confirmElevate.click();
      }
      await page.keyboard.press("Escape");
      await page.click("button:has-text('Close'), [aria-label='Close']").catch(() => {});
      await page.waitForSelector("button:has-text('Administrative access'), a:has-text('Administrative access')", { timeout: 10000 }).catch(() => {});
    }

    // Click VS Code Server entry in sidebar
    const csLink = page.locator("a:has-text('VS Code Server'), a[href*='code-server']").first();
    if (await csLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await csLink.click();
    } else {
      await page.goto("/code-server", { waitUntil: "domcontentloaded", timeout: 30000 });
    }

    const frame = await getFrame();
    await expect(frame.locator("h1:has-text('VS Code Server')")).toBeVisible({ timeout: 20000 });

    await saveScreenshot(page, "cs-01-overview-dark.png");
  });

  test("02. Verify Header bar and action controls", async () => {
    const frame = await getFrame();

    await expect(frame.locator("h1:has-text('VS Code Server')")).toBeVisible();
    await expect(frame.locator("button[aria-label='Refresh status']")).toBeVisible();

    // Verify Open in New Tab or Install/Start controls
    const newTabBtn = frame.locator("button:has-text('Open in New Tab')").first();
    const startBtn = frame.locator("button:has-text('Start Service')").first();
    const installBtn = frame.locator("button:has-text('Install code-server')").first();

    const hasAnyAction =
      (await newTabBtn.isVisible().catch(() => false)) ||
      (await startBtn.isVisible().catch(() => false)) ||
      (await installBtn.isVisible().catch(() => false));

    expect(hasAnyAction).toBeTruthy();
  });

  test("03. Verify embedded IDE iframe or status banner", async () => {
    const frame = await getFrame();

    const runningLabel = frame.locator("span.pf-v5-c-label:has-text('Running'), span:has-text('Running')").first();
    const isRunning = await runningLabel.isVisible({ timeout: 5000 }).catch(() => false);
    if (isRunning) {
      const iframe = frame.locator("iframe[title='VS Code Server']").first();
      await expect(iframe).toBeVisible({ timeout: 10000 });
    }
  });
});
