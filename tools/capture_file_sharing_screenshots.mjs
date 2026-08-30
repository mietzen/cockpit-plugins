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

  await page.waitForSelector("nav, #sidebar, a:has-text('File sharing'), a:has-text('System')", { timeout: 20000 });
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

  // Navigate to File sharing plugin
  const fileSharingNav = page.locator("a:has-text('File sharing'), a[href*='file-sharing']").first();
  if (await fileSharingNav.isVisible({ timeout: 5000 }).catch(() => false)) {
    console.log("Clicking File sharing sidebar entry...");
    await fileSharingNav.click();
  } else {
    console.log("Navigating directly to /cockpit/@localhost/file-sharing/index.html...");
    await page.goto(`${COCKPIT_URL}/cockpit/@localhost/file-sharing/index.html`);
  }

  // Get frame helper
  async function getFrame() {
    const frameEl = await page.waitForSelector("iframe[name*='file-sharing'], iframe[src*='file-sharing']", {
      state: "attached",
      timeout: 15000,
    }).catch(() => null);

    if (frameEl) {
      const f = await frameEl.contentFrame();
      if (f) return f;
    }
    return page.mainFrame();
  }

  const frame = await getFrame();
  await frame.waitForSelector("text=File Sharing", { timeout: 15000 });
  console.log("File Sharing plugin loaded inside iframe.");

  // Click refresh inside plugin to load live data with administrative privilege
  await frame.locator("button:has-text('Refresh')").first().click().catch(() => {});
  await page.waitForTimeout(1500);

  // Theme helper
  async function setTheme(mode) {
    await page.evaluate((isDark) => {
      const html = document.documentElement;
      if (isDark) {
        html.classList.add("pf-v6-theme-dark", "pf-v5-theme-dark", "theme-dark");
        html.classList.remove("theme-light", "pf-m-light", "pf-v5-theme-light", "pf-v6-theme-light");
        localStorage.setItem("shell:style", "dark");
      } else {
        html.classList.remove("pf-v6-theme-dark", "pf-v5-theme-dark", "theme-dark");
        html.classList.add("theme-light", "pf-m-light", "pf-v5-theme-light", "pf-v6-theme-light");
        localStorage.setItem("shell:style", "light");
      }
      window.dispatchEvent(new CustomEvent("cockpit-style", { detail: { style: isDark ? "dark" : "light" } }));
    }, mode === "dark");

    await frame.evaluate((isDark) => {
      const html = document.documentElement;
      if (isDark) {
        html.classList.add("pf-v6-theme-dark", "pf-v5-theme-dark", "theme-dark");
        html.classList.remove("theme-light", "pf-m-light");
      } else {
        html.classList.remove("pf-v6-theme-dark", "pf-v5-theme-dark", "theme-dark");
        html.classList.add("theme-light", "pf-m-light");
      }
    }, mode === "dark");

    await page.waitForTimeout(300);
  }

  async function clickTabByText(tabText) {
    await frame.evaluate((text) => {
      const buttons = Array.from(document.querySelectorAll("button, .pf-v5-c-tabs__link"));
      const btn = buttons.find((b) => b.textContent && b.textContent.includes(text));
      if (btn) btn.click();
    }, tabText);
  }

  const views = [
    {
      name: "fs-01-dashboard",
      setup: async () => {
        await clickTabByText("Overview");
      },
    },
    {
      name: "fs-02-smb-shares",
      setup: async () => {
        await clickTabByText("SMB Shares");
      },
    },
    {
      name: "fs-03-nfs-exports",
      setup: async () => {
        await clickTabByText("NFS Exports");
      },
    },
    {
      name: "fs-04-users",
      setup: async () => {
        await clickTabByText("Samba Users & Permissions");
        await page.waitForTimeout(200);
        await clickTabByText("Samba Users");
      },
    },
    {
      name: "fs-05-permissions-matrix",
      setup: async () => {
        await clickTabByText("Samba Users & Permissions");
        await page.waitForTimeout(200);
        await clickTabByText("User Access Matrix");
      },
    },
    {
      name: "fs-06-live-sessions",
      setup: async () => {
        await clickTabByText("Services & Sessions");
      },
    },
    {
      name: "fs-07-global-settings",
      setup: async () => {
        await clickTabByText("Settings");
      },
    },
    {
      name: "fs-08-create-share-modal",
      setup: async () => {
        await clickTabByText("SMB Shares");
        await page.waitForTimeout(200);
        await frame.evaluate(() => {
          const btns = Array.from(document.querySelectorAll("button"));
          const createBtn = btns.find((b) => b.textContent && b.textContent.includes("Create SMB share"));
          if (createBtn) createBtn.click();
        });
      },
      cleanup: async () => {
        await page.keyboard.press("Escape");
        await frame.evaluate(() => {
          const btns = Array.from(document.querySelectorAll("button"));
          const cancelBtn = btns.find((b) => b.textContent && b.textContent.includes("Cancel"));
          if (cancelBtn) cancelBtn.click();
        });
        await page.waitForTimeout(200);
      },
    },
  ];

  for (const v of views) {
    console.log(`Setting up view: ${v.name}...`);
    await v.setup();
    await page.waitForTimeout(400);

    // Light theme screenshot
    await setTheme("light");
    const lightPath = path.join(OUTPUT_DIR, `${v.name}-light.png`);
    await page.screenshot({ path: lightPath });
    console.log(`Saved ${lightPath}`);

    // Dark theme screenshot
    await setTheme("dark");
    const darkPath = path.join(OUTPUT_DIR, `${v.name}-dark.png`);
    await page.screenshot({ path: darkPath });
    console.log(`Saved ${darkPath}`);

    if (v.cleanup) {
      await v.cleanup();
    }
  }

  await browser.close();
  console.log("All screenshots captured successfully.");
}

run().catch((err) => {
  console.error("Screenshot capture failed:", err);
  process.exit(1);
});
