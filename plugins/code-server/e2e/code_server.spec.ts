import { test, expect, Page, Frame } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const COVERAGE_FRAME_TARGET = "code-server";

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
      "iframe[name*='code-server'], iframe[src*='code-server']",
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
      if (!page) {
        return;
      }
      let coverageData = null;
      for (const f of page.frames()) {
        if (!f.url().includes(COVERAGE_FRAME_TARGET)) {
          continue;
        }

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

    // Click Code-Server entry in sidebar
    const csLink = page.locator("#sidebar a:has-text('VS Code Server'), #sidebar a:has-text('Code-Server'), nav a:has-text('VS Code Server'), nav a:has-text('Code-Server'), a:has-text('VS Code Server'), a:has-text('Code-Server'), a[href*='code-server']").first();
    if (await csLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await csLink.click();
    } else {
      await page.goto("/#/code-server", { waitUntil: "domcontentloaded", timeout: 30000 });
    }

    const frame = await getFrame();
    await frame.locator("#root").waitFor({ state: "attached", timeout: 20000 });
    const contentLocator = frame.locator("iframe[title*='Code'], h2:has-text('Code-Server is Stopped'), h2:has-text('Install')").first();
    await contentLocator.waitFor({ state: "visible", timeout: 25000 });
    expect(await contentLocator.isVisible()).toBeTruthy();

    await saveScreenshot(page, "cs-01-overview-dark.png");
  });

  test("02. Verify Overlay Controls and Actions", async () => {
    const frame = await getFrame();

    const actionLocator = frame.locator("button[aria-label='Open in New Tab'], button:has-text('Open in New Tab'), button:has-text('Start Service'), button:has-text('Install code-server')").first();
    await actionLocator.waitFor({ state: "visible", timeout: 15000 });
    expect(await actionLocator.isVisible()).toBeTruthy();
  });

  test("03. Verify embedded IDE iframe", async () => {
    const frame = await getFrame();

    const ideIframe = frame.locator("iframe[title='Code-Server'], iframe[title='VS Code Server']").first();
    await ideIframe.waitFor({ state: "visible", timeout: 15000 });
    await expect(ideIframe).toBeVisible();
    const src = await ideIframe.getAttribute("src");
    expect(src).toContain("/code-server/");
  });
});
