import { chromium } from "playwright";
import * as fs from "fs";
import * as path from "path";

const COCKPIT_URL = process.env.COCKPIT_URL || "https://192.168.40.142:9090";
const USER = process.env.COCKPIT_USER || "test-user";
const PASS = process.env.COCKPIT_PASSWORD || "password";
const OUTPUT_DIR = path.resolve(process.cwd(), "docs/screenshots");

async function run() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1.5,
    ignoreHTTPSErrors: true,
  });

  const page = await context.newPage();
  console.log(`Connecting to Cockpit at ${COCKPIT_URL}...`);
  await page.goto(COCKPIT_URL, { waitUntil: "networkidle" });

  // Login flow
  const userInput = page.locator("input#login-user-input, input#login-user, input[name='login-user'], input[autocomplete='username']").first();
  const passInput = page.locator("input#login-password-input, input#login-password, input[name='login-password'], input[autocomplete='current-password']").first();
  const loginBtn = page.locator("button#login-button, button[type='submit']").first();

  if (await userInput.isVisible({ timeout: 5000 }).catch(() => false)) {
    console.log("Entering credentials...");
    await userInput.fill(USER);
    await passInput.fill(PASS);
    const authCheckbox = page.locator("input#authorized-input").first();
    if (await authCheckbox.count() > 0) {
      await authCheckbox.setChecked(true, { force: true }).catch(() => {});
    }
    await loginBtn.click();
  }

  await page.waitForSelector("nav, #sidebar, a:has-text('System')", { timeout: 20000 }).catch(() => {});
  console.log("Logged in successfully.");

  // Elevate to administrative access
  const elevateBtn = page.locator("button:has-text('Limited access'), a:has-text('Limited access')").first();
  if (await elevateBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    console.log("Elevating administrative access...");
    await elevateBtn.click();
    const sudoPass = page.locator("input#superuser-password-input, input[type='password']").first();
    if (await sudoPass.isVisible({ timeout: 2000 }).catch(() => false)) {
      await sudoPass.fill(PASS);
      const confirmElevate = page.locator("button#superuser-authorize-button, button:has-text('Authorize'), button:has-text('Authenticate')").first();
      await confirmElevate.click();
    }
    await page.keyboard.press("Escape");
    await page.click("button:has-text('Close'), [aria-label='Close']").catch(() => {});
    await page.waitForTimeout(1000);
  }

  console.log("Navigating to VS Code Server...");
  const csLink = page.locator("a:has-text('VS Code Server'), a[href*='code-server']").first();
  if (await csLink.isVisible({ timeout: 3000 }).catch(() => false)) {
    await csLink.click();
  } else {
    await page.goto(`${COCKPIT_URL}/code-server`);
  }

  const frameElement = await page.waitForSelector("iframe[name*='code-server']", { timeout: 20000 });
  const frame = await frameElement.contentFrame();
  if (!frame) throw new Error("Could not find code-server iframe");

  console.log("VS Code Server plugin loaded inside iframe.");
  await frame.waitForSelector("h1:has-text('VS Code Server')", { timeout: 15000 });

  // Light theme screenshot
  await page.screenshot({ path: path.join(OUTPUT_DIR, "cs-01-overview-light.png") });
  console.log("Saved cs-01-overview-light.png");

  // Dark theme screenshot
  await page.evaluate(() => {
    document.documentElement.classList.add("pf-v5-theme-dark");
    document.documentElement.classList.remove("pf-v5-theme-light");
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUTPUT_DIR, "cs-01-overview-dark.png") });
  console.log("Saved cs-01-overview-dark.png");

  // Open settings modal
  const settingsBtn = frame.locator("button[aria-label='Code Server settings']").first();
  if (await settingsBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await settingsBtn.click({ force: true });
    await frame.waitForSelector("[role='dialog']:has-text('VS Code Server Configuration')", { timeout: 5000 });
    await page.screenshot({ path: path.join(OUTPUT_DIR, "cs-02-settings-dark.png") });
    console.log("Saved cs-02-settings-dark.png");
  }

  await browser.close();
  console.log("All code-server screenshots captured successfully.");
}

run().catch((err) => {
  console.error("Error capturing screenshots:", err);
  process.exit(1);
});
