import { chromium } from "playwright";

async function inspect() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true });
  const page = await context.newPage();
  await page.goto("https://192.168.40.142:9090", { waitUntil: "networkidle" });
  
  const userInput = page.locator("input#login-user-input, input#login-user, input[name='login-user']").first();
  if (await userInput.isVisible({ timeout: 5000 }).catch(() => false)) {
    await userInput.fill("test-user");
    await page.locator("input#login-password-input, input#login-password, input[name='login-password']").first().fill("password");
    await page.locator("button#login-button, button[type='submit']").first().click();
    await page.waitForNavigation({ waitUntil: "networkidle", timeout: 15000 }).catch(() => {});
  }
  
  await page.waitForSelector("nav, #sidebar, a:has-text('ZFS storage')", { timeout: 20000 });
  
  // Elevate admin access
  const elevateBtn = page.locator("button:has-text('Limited access'), a:has-text('Limited access')").first();
  if (await elevateBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await elevateBtn.click();
    const sudoPass = page.locator("input#superuser-password-input, input[type='password']").first();
    if (await sudoPass.isVisible({ timeout: 2000 }).catch(() => false)) {
      await sudoPass.fill("password");
      const authBtn = page.locator("button#superuser-authorize-button, button:has-text('Authenticate')").first();
      await authBtn.click();
    }
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
  }
  
  const zfsNav = page.locator("a:has-text('ZFS storage'), a[href*='zfs']").first();
  if (await zfsNav.isVisible({ timeout: 5000 }).catch(() => false)) {
    await zfsNav.click();
  }
  
  const frameEl = await page.waitForSelector("iframe[name*='zfs'], iframe[src*='zfs']", { state: "attached", timeout: 15000 });
  const frame = await frameEl.contentFrame();
  await page.waitForTimeout(2000);
  
  // Click Pools tab
  await frame.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll("button, .pf-v5-c-tabs__link, a"));
    const btn = buttons.find((b) => b.textContent && b.textContent.trim().startsWith("Pools"));
    if (btn) btn.click();
  });
  await page.waitForTimeout(1000);
  
  // Click Test-Pool
  await frame.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll("button, a, td"));
    const btn = buttons.find((b) => b.textContent && b.textContent.trim().includes("Test-Pool"));
    if (btn) btn.click();
  });
  await page.waitForTimeout(1000);
  
  // Click Datasets & Volumes tab
  await frame.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll("button, .pf-v5-c-tabs__link, a"));
    const btn = buttons.find((b) => b.textContent && b.textContent.trim().startsWith("Datasets & Volumes"));
    if (btn) btn.click();
  });
  await page.waitForTimeout(1500);
  
  const labelData = await frame.evaluate(() => {
    const labels = Array.from(document.querySelectorAll(".pf-v5-c-label"));
    return labels.map(el => {
      const c = window.getComputedStyle(el);
      const content = el.querySelector(".pf-v5-c-label__content");
      const cc = content ? window.getComputedStyle(content) : null;
      const b = window.getComputedStyle(el, "::before");
      const cb = content ? window.getComputedStyle(content, "::before") : null;
      
      return {
        text: el.textContent?.trim(),
        className: el.className,
        elStyles: {
          borderRadius: c.borderRadius,
          border: c.border,
          borderBottom: c.borderBottom,
          backgroundColor: c.backgroundColor,
          overflow: c.overflow,
          padding: c.padding,
          display: c.display,
          outline: c.outline,
          boxShadow: c.boxShadow,
        },
        contentStyles: cc ? {
          borderRadius: cc.borderRadius,
          border: cc.border,
          borderBottom: cc.borderBottom,
          backgroundColor: cc.backgroundColor,
          overflow: cc.overflow,
          padding: cc.padding,
          display: cc.display,
          outline: cc.outline,
          boxShadow: cc.boxShadow,
        } : null,
        beforeStyles: {
          display: b.display,
          content: b.content,
          border: b.border,
        },
        contentBeforeStyles: cb ? {
          display: cb.display,
          content: cb.content,
          border: cb.border,
        } : null,
      };
    });
  });
  
  console.log("LABELS FOUND ON DATASETS TAB:", JSON.stringify(labelData, null, 2));
  
  const fsLabel = frame.locator(".pf-v5-c-label:has-text('Filesystem')").first();
  if (await fsLabel.isVisible()) {
    await fsLabel.screenshot({ path: "inspect-filesystem-pill.png" });
    console.log("Saved inspect-filesystem-pill.png");
  }
  
  await browser.close();
}

inspect().catch(err => {
  console.error(err);
  process.exit(1);
});
