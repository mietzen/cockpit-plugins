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
    viewport: { width: 1440, height: 900 },
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
    await page.waitForNavigation({ waitUntil: "networkidle", timeout: 15000 }).catch(() => {});
  }

  await page.waitForSelector("nav, #sidebar, a:has-text('Containers'), a:has-text('System')", { timeout: 20000 });
  console.log("Logged in successfully.");

  // Elevate to administrative access
  const elevateBtn = page.locator("button:has-text('Limited access'), a:has-text('Limited access')").first();
  if (await elevateBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    console.log("Elevating administrative access...");
    await elevateBtn.click();
    const sudoPass = page.locator("input#superuser-password-input, input[type='password']").first();
    if (await sudoPass.isVisible({ timeout: 2000 }).catch(() => false)) {
      await sudoPass.fill(PASS);
      const authBtn = page.locator("button#superuser-authorize-button, button:has-text('Authenticate')").first();
      await authBtn.click();
    }
    await page.keyboard.press("Escape");
    await page.click("button:has-text('Close'), [aria-label='Close']").catch(() => {});
    await page.waitForTimeout(1000);
  }

  // Navigate to Container manager plugin
  const containerNav = page.locator("a:has-text('Containers'), a[href*='container-manager']").first();
  if (await containerNav.isVisible({ timeout: 5000 }).catch(() => false)) {
    console.log("Clicking Containers sidebar entry...");
    await containerNav.click();
  } else {
    console.log("Navigating directly to /cockpit/@localhost/container-manager/index.html...");
    await page.goto(`${COCKPIT_URL}/cockpit/@localhost/container-manager/index.html`);
  }

  // Get frame helper
  async function getFrame() {
    const frameEl = await page.waitForSelector("iframe[name*='container-manager']", {
      state: "attached",
      timeout: 25000,
    }).catch(() => null);

    if (frameEl) {
      const f = await frameEl.contentFrame();
      if (f) return f;
    }
    const match = page.frames().find((f) => f.url().includes("container-manager"));
    if (match) return match;
    return page.mainFrame();
  }

  const frame = await getFrame();
  await frame.waitForSelector("#root, body", { timeout: 15000 });
  await page.waitForTimeout(2000);
  console.log("Container Manager plugin loaded inside iframe.");

  // Theme helper
  async function setTheme(mode) {
    await page.evaluate((isDark) => {
      const html = document.documentElement;
      if (isDark) {
        html.classList.add("pf-v6-theme-dark", "pf-v5-theme-dark", "theme-dark");
        html.classList.remove("theme-light", "pf-m-light");
      } else {
        html.classList.add("theme-light", "pf-m-light");
        html.classList.remove("pf-v6-theme-dark", "pf-v5-theme-dark", "theme-dark");
      }
      localStorage.setItem("shell:style", isDark ? "dark" : "light");
      window.dispatchEvent(new CustomEvent("cockpit-style", { detail: { style: isDark ? "dark" : "light" } }));
    }, mode === "dark");

    await frame.evaluate((isDark) => {
      const html = document.documentElement;
      if (isDark) {
        html.classList.add("pf-v6-theme-dark", "pf-v5-theme-dark", "theme-dark");
        html.classList.remove("theme-light", "pf-m-light");
      } else {
        html.classList.add("theme-light", "pf-m-light");
        html.classList.remove("pf-v6-theme-dark", "pf-v5-theme-dark", "theme-dark");
      }
    }, mode === "dark");

    await page.waitForTimeout(500);
  }

  const views = [
    { name: "cm-01-dashboard", tab: "Overview", selector: "button:has-text('Overview'), [role='tab']:has-text('Overview')" },
    { name: "cm-02-containers", tab: "Containers", selector: "button:has-text('Containers'), [role='tab']:has-text('Containers')" },
    { name: "cm-03-images", tab: "Images", selector: "button:has-text('Images'), [role='tab']:has-text('Images')" },
    { name: "cm-04-volumes", tab: "Volumes", selector: "button:has-text('Volumes'), [role='tab']:has-text('Volumes')" },
    { name: "cm-05-networks", tab: "Networks", selector: "button:has-text('Networks'), [role='tab']:has-text('Networks')" },
    { name: "cm-06-settings", tab: "Settings", selector: "button:has-text('Settings'), [role='tab']:has-text('Settings')" },
  ];

  for (const v of views) {
    console.log(`Capturing ${v.tab} view...`);
    const tabBtn = frame.locator(v.selector).first();
    if (await tabBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await tabBtn.click();
      await page.waitForTimeout(1000);
    }

    for (const theme of ["light", "dark"]) {
      await setTheme(theme);
      const shotPath = path.join(OUTPUT_DIR, `${v.name}-${theme}.png`);
      await page.screenshot({ path: shotPath, fullPage: false });
      console.log(`Saved: ${shotPath}`);
    }
  }

  // Capture inspect modal
  console.log("Capturing inspect modal...");
  const containersTab = frame.locator("button:has-text('Containers'), [role='tab']:has-text('Containers')").first();
  if (await containersTab.isVisible({ timeout: 3000 }).catch(() => false)) {
    await containersTab.click();
    await page.waitForTimeout(1000);
    const inspectBtn = frame.locator('button[aria-label="Inspect container"], button:has-text("Inspect")').first();
    if (await inspectBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await inspectBtn.click();
      await page.waitForTimeout(1000);
      for (const theme of ["light", "dark"]) {
        await setTheme(theme);
        const shotPath = path.join(OUTPUT_DIR, `cm-07-inspect-modal-${theme}.png`);
        await page.screenshot({ path: shotPath, fullPage: false });
        console.log(`Saved: ${shotPath}`);
      }
      await frame.locator('button:has-text("Close"), [aria-label="Close"]').first().click().catch(() => {});
    }
  }

  await browser.close();
  console.log("Container Manager screenshots captured successfully.");
}

run().catch((err) => {
  console.error("Error capturing container manager screenshots:", err);
  process.exit(1);
});
