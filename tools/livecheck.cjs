/* ROPE DUEL - live-feed check: the deployed page must reach a real venue (not SIM)
   and its displayed price must agree with an independent REST ticker. */
const path = require("path");
const { chromium } = require(path.join(process.env.NODE_PATH, "playwright-core"));

const BASE = process.argv[2] || "https://shojaee76-cmyk.github.io/rope-duel-v2/";

async function restPrice() {
  const urls = [
    "https://api.bybit.com/v5/market/tickers?category=spot&symbol=BTCUSDT",
    "https://api.gateio.ws/api/v4/spot/tickers?currency_pair=BTC_USDT"
  ];
  for (const u of urls) {
    try {
      const r = await fetch(u, { headers: { "User-Agent": "Mozilla/5.0" } });
      const j = await r.json();
      if (j.result && j.result.list && j.result.list[0]) return { p: +j.result.list[0].lastPrice, src: "bybit" };
      if (Array.isArray(j) && j[0]) return { p: +j[0].last, src: "gate" };
    } catch (e) {}
  }
  return null;
}

(async () => {
  const ref = await restPrice();
  const browser = await chromium.launch({
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: true
  });
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 40000 });

  let st = null;
  for (let i = 0; i < 30; i++) {
    st = await page.evaluate(() => (window.__duel ? window.__duel.state() : null));
    if (st && st.provider && st.provider !== "SIM" && st.price > 0) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  const badge = await page.evaluate(() => document.getElementById("venue").textContent);
  console.log("STATE", JSON.stringify(st));
  console.log("BADGE", badge);
  console.log("REF", JSON.stringify(ref));

  const live = st && st.provider && st.provider !== "SIM";
  const dev = ref && st ? Math.abs(st.price - ref.p) / ref.p * 100 : null;
  const pass = live && dev != null && dev < 0.5 && /LIVE/.test(badge) && errors.length === 0;
  console.log("price deviation %", dev == null ? "n/a" : dev.toFixed(4));
  console.log("ERRORS", JSON.stringify(errors));
  console.log(pass ? "LIVE FEED VERIFIED" : "LIVE FEED FAILED");
  await browser.close();
  process.exit(pass ? 0 : 1);
})().catch((e) => { console.error("CRASH", e); process.exit(2); });
