/* ROPE DUEL - screenshot + smoke harness (playwright-core + system Chrome). */
const path = require("path");
const fs = require("fs");
const { chromium } = require(path.join(process.env.NODE_PATH, "playwright-core"));

const BASE = process.env.SHOT_BASE || "http://127.0.0.1:8099/?demo=1";
const OUT = path.join(__dirname, "..", "qa");
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch({
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: true
  });
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("favicon")) errors.push("console: " + m.text()); });

  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction("window.__duel && window.__duel.state().price > 0", null, { timeout: 30000 });
  await page.waitForTimeout(1500);

  await page.evaluate("window.__duel.hold(true)");
  await page.waitForTimeout(900);
  const pos = await page.evaluate("window.__duel.positions()");
  await page.screenshot({ path: path.join(OUT, "01-desktop-idle.png") });
  const cropY = Math.max(0, pos.ropeY - 340);
  const cropH = Math.min(pos.H - cropY, 420);
  await page.screenshot({ path: path.join(OUT, "03-cat-buy.png"), clip: { x: Math.max(0, pos.buy - 190), y: cropY, width: 380, height: cropH } });
  await page.screenshot({ path: path.join(OUT, "04-cat-sell.png"), clip: { x: Math.min(pos.W - 380, pos.sell - 190), y: cropY, width: 380, height: cropH } });

  await page.evaluate("window.__duel.hold(false)");
  await page.waitForTimeout(3200);
  await page.screenshot({ path: path.join(OUT, "02-desktop-fight.png") });
  console.log("DESKTOP", JSON.stringify({ ...(await page.evaluate("window.__duel.state()")), ...(await page.evaluate("window.__duel.stats()")) }));

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction("window.__duel && window.__duel.state().price > 0", null, { timeout: 30000 });
  await page.waitForTimeout(1600);
  await page.evaluate("window.__duel.hold(true)");
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(OUT, "05-phone-idle.png") });
  await page.evaluate("window.__duel.hold(false)");
  await page.waitForTimeout(2400);
  await page.screenshot({ path: path.join(OUT, "06-phone-fight.png") });
  console.log("PHONE", JSON.stringify(await page.evaluate("window.__duel.state()")));

  console.log("ERRORS", JSON.stringify(errors));
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})().catch((e) => { console.error("HARNESS FAIL", e); process.exit(2); });
