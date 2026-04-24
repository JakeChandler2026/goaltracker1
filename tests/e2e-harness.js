const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const url = process.env.E2E_URL || "http://localhost:8080/test-harness.html";
const outputPath = process.env.E2E_OUTPUT_PATH || path.join(process.cwd(), "chrome-test-output.html");
const browserPath = process.env.E2E_BROWSER_PATH || "";

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: browserPath || undefined
  });

  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 2200 } });
    const browserErrors = [];

    page.on("pageerror", (error) => {
      browserErrors.push(error.message);
    });

    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("text=All browser tests passed.", { timeout: 60000 });

    const failures = await page.locator(".fail").allTextContents();
    const html = await page.content();
    fs.writeFileSync(outputPath, html, "utf8");

    if (failures.length) {
      throw new Error(`E2E test failed: ${failures.join("; ")}`);
    }

    if (browserErrors.length) {
      throw new Error(`Browser error: ${browserErrors.join("; ")}`);
    }

    const passCount = await page.locator(".pass").count();
    console.log(`E2E tests passed (${passCount} assertions).`);
    console.log(`Output: ${outputPath}`);
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
