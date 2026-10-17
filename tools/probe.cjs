/* ROPE DUEL - acceptance probe. Real Chrome, real pixels, real mechanics.
   node tools/probe.cjs [--base URL] [--demo 1]  → exit 0 only when every check passes. */
const path = require("path");
const { chromium } = require(path.join(process.env.NODE_PATH, "playwright-core"));

const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf("--" + k); return i >= 0 ? args[i + 1] : d; };
const BASE = arg("base", "http://127.0.0.1:8099/");
const DEMO = arg("demo", "1");
const URL = BASE + (BASE.includes("?") ? "&" : "?") + "demo=" + DEMO;

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail });
  console.log((ok ? "PASS " : "FAIL ") + name + (detail != null ? "  [" + JSON.stringify(detail) + "]" : ""));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run(width, height, tag) {
  const browser = await chromium.launch({
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: true
  });
  const errors = [];
  const page = await browser.newPage({ viewport: { width, height } });
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("favicon")) errors.push("console: " + m.text()); });

  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction("window.__duel && window.__duel.state().price > 0", null, { timeout: 30000 });
  await sleep(1600);

  // ── 1. boot / errors
  check(tag + ": no page errors", errors.length === 0, errors.slice(0, 4));

  // ── 2. fonts actually render (render-hash, not fonts.check)
  const fontOk = await page.evaluate(() => {
    const faces = ["Archivo Black", "Space Mono"];
    const hash = (face) => {
      const c = document.createElement("canvas"); c.width = 220; c.height = 60;
      const x = c.getContext("2d");
      x.fillStyle = "#000"; x.fillRect(0, 0, 220, 60);
      x.fillStyle = "#fff"; x.font = "40px '" + face + "', monospace";
      x.fillText("ROPE 8", 4, 44);
      const d = x.getImageData(0, 0, 220, 60).data;
      let h = 0;
      for (let i = 0; i < d.length; i += 4) h = (h * 31 + d[i]) >>> 0;
      return h;
    };
    const base = hash("no-such-face-xyz");
    return faces.map((f) => ({ face: f, differs: hash(f) !== base, loaded: document.fonts.check("40px '" + f + "'") }));
  });
  check(tag + ": bundled fonts render distinctly", fontOk.every((f) => f.differs), fontOk);

  // ── 3. canvas is painted + scene parts exist in PIXELS
  const px = await page.evaluate(() => {
    const cv = document.getElementById("duel");
    const dpr = cv.width / window.innerWidth;
    const ctx = cv.getContext("2d");
    const W = cv.width, H = cv.height;
    const d = ctx.getImageData(0, 0, W, H).data;
    const lum = (i) => d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
    let sum = 0, n = 0;
    for (let y = 0; y < H; y += 10) for (let x = 0; x < W; x += 10) { sum += lum((y * W + x) * 4); n++; }
    const pos = window.__duel.positions();
    const box = (cx, cy, bw, bh, pred) => {
      let c = 0;
      const x0 = Math.max(0, Math.floor((cx - bw / 2) * dpr)), x1 = Math.min(W, Math.floor((cx + bw / 2) * dpr));
      const y0 = Math.max(0, Math.floor((cy - bh / 2) * dpr)), y1 = Math.min(H, Math.floor((cy + bh / 2) * dpr));
      for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) { const i = (y * W + x) * 4; if (pred(d[i], d[i + 1], d[i + 2], lum(i))) c++; }
      return c;
    };
    const bright = (r, g, b, l) => l > 85;
    const gold = (r, g, b) => r > 95 && g > 60 && b < 135 && r > b + 25;
    const catY = pos.ropeY - 80;
    return {
      mean: sum / n,
      catBuy: box(pos.buy, catY, 190, 230, bright),
      catSell: box(pos.sell, catY, 190, 230, bright),
      rope: box((pos.buy + pos.sell) / 2, pos.ropeY + 16, pos.sell - pos.buy, 96, gold),
      w: W, h: H
    };
  });
  check(tag + ": canvas painted (not blank)", px.mean > 8 && px.mean < 140, { mean: +px.mean.toFixed(1) });
  check(tag + ": BUY cat visible in pixels", px.catBuy > 900, { bright: px.catBuy });
  check(tag + ": SELL cat visible in pixels", px.catSell > 900, { bright: px.catSell });
  check(tag + ": rope + gold marker visible in pixels", px.rope > 120, { gold: px.rope });

  // ── 4. HUD correctness
  const hud = await page.evaluate(() => {
    const st = window.__duel.state();
    const priceTxt = document.getElementById("price").textContent;
    const buyW = parseFloat(getComputedStyle(document.getElementById("meter-buy")).width);
    const sellW = parseFloat(getComputedStyle(document.getElementById("meter-sell")).width);
    const meterW = document.querySelector(".meter").clientWidth;
    const fontOf = (sel) => parseFloat(getComputedStyle(document.querySelector(sel)).fontSize);
    return {
      priceTxt, price: st.price, pressure: st.pressure,
      buyPct: Math.round(buyW / meterW * 100), sellPct: Math.round(sellW / meterW * 100),
      labels: [fontOf(".fighter-state"), fontOf(".meter-label"), fontOf(".tag"), fontOf(".chart-title")],
      stateBuy: document.getElementById("state-buy").textContent,
      stateSell: document.getElementById("state-sell").textContent,
      venue: document.getElementById("venue").textContent
    };
  });
  const shown = parseFloat(hud.priceTxt.replace(/[$,]/g, ""));
  check(tag + ": price HUD matches feed", Math.abs(shown - hud.price) / hud.price < 0.001, { shown, feed: +hud.price.toFixed(1) });
  check(tag + ": pressure meter sums to 100%", Math.abs(hud.buyPct + hud.sellPct - 100) <= 2, { buy: hud.buyPct, sell: hud.sellPct });
  check(tag + ": meter direction matches pressure", (hud.pressure >= 0) === (hud.buyPct >= 50), { pressure: +hud.pressure.toFixed(2), buy: hud.buyPct });
  check(tag + ": HUD labels >= 10px", hud.labels.every((f) => f >= 10), hud.labels);
  check(tag + ": fighter state text present", /EN GARDE|WIND|STRIKE|RECOVER|GUARD|HOP|HIT|K\.O\.|WINS/.test(hud.stateBuy + hud.stateSell), [hud.stateBuy, hud.stateSell]);
  check(tag + ": venue labelled", /LIVE|SIM|SPOT/.test(hud.venue), hud.venue);

  // ── 5. no overflow at this viewport
  const ov = await page.evaluate(() => {
    const W = window.innerWidth, H = window.innerHeight;
    const bad = [];
    document.querySelectorAll(".topbar,.brand,.priceblock,.status,.fighter,.meter-wrap,.chart").forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return;
      if (r.left < -1 || r.right > W + 1 || r.top < -1 || r.bottom > H + 1) bad.push(el.className + ":" + [r.left, r.top, r.right, r.bottom].map((v) => Math.round(v)).join(","));
    });
    return { scrollW: document.documentElement.scrollWidth, W, H, bad };
  });
  check(tag + ": no horizontal overflow", ov.scrollW <= ov.W + 1, { scrollW: ov.scrollW, W: ov.W });
  check(tag + ": all HUD panels inside viewport", ov.bad.length === 0, ov.bad);

  // ── 6. market drives the attacker
  await page.evaluate("window.__duel.reset(); window.__duel.pressure(0.95); window.__duel.hold(false)");
  await sleep(5200);
  let s = await page.evaluate("window.__duel.state()");
  check(tag + ": BUY pressure -> BUY attacks", s.attacks.buy >= 3 && s.attacks.buy > s.attacks.sell * 1.5, s.attacks);

  await page.evaluate("window.__duel.reset(); window.__duel.pressure(-0.95); window.__duel.hold(false)");
  await sleep(5200);
  s = await page.evaluate("window.__duel.state()");
  check(tag + ": SELL pressure -> SELL attacks", s.attacks.sell >= 3 && s.attacks.sell > s.attacks.buy * 1.5, s.attacks);

  // ── 7. rope marker follows pressure (and HUD agrees)
  await page.evaluate("window.__duel.pressure(1)");
  await sleep(1800);
  const hi = await page.evaluate("window.__duel.state()");
  await page.evaluate("window.__duel.pressure(-1)");
  await sleep(1800);
  const lo = await page.evaluate("window.__duel.state()");
  check(tag + ": rope marker slides with order flow", hi.marker > 0.6 && lo.marker < 0.4, { hi: +hi.marker.toFixed(2), lo: +lo.marker.toFixed(2) });

  // ── 8. a real fight: both sides act (alternating tape), hits land, guards answer
  await page.evaluate("window.__duel.reset(); window.__duel.pressure(0.8); window.__duel.hold(false)");
  await sleep(4000);
  const first = await page.evaluate("window.__duel.state()");
  await page.evaluate("window.__duel.pressure(-0.8)");
  await sleep(4000);
  s = await page.evaluate("window.__duel.state()");
  const c = s.contacts;
  const bothAttacks = { buy: first.attacks.buy + s.attacks.buy, sell: first.attacks.sell + s.attacks.sell };
  check(tag + ": both sides attack (alternating tape)", bothAttacks.buy > 0 && bothAttacks.sell > 0, bothAttacks);
  check(tag + ": strikes land (hits > 0)", c.hit > 0, c);
  // deterministic: a guard that is up at contact must stop the blade
  const before = await page.evaluate("window.__duel.state().contacts");
  await page.evaluate("window.__duel.exchange('buy','LUNGE')");
  await sleep(1100);
  const afterGuard = await page.evaluate("window.__duel.state().contacts");
  check(tag + ": a raised guard stops the blade (block/lock)",
    (afterGuard.block + afterGuard.lock) > (before.block + before.lock),
    { before: before.block + before.lock, after: afterGuard.block + afterGuard.lock });
  check(tag + ": hp actually drains", s.hp.buy < 100 || s.hp.sell < 100, s.hp);

  // ── 9. KO -> banner -> round reset
  await page.evaluate("window.__duel.forceKo('buy')");
  await sleep(400);
  const ko = await page.evaluate(() => ({
    banner: !document.getElementById("banner").hidden,
    title: document.getElementById("banner-title").textContent,
    price: document.getElementById("banner-price").textContent,
    rounds: window.__duel.state().rounds
  }));
  check(tag + ": KO shows banner with winner", ko.banner && /BID/.test(ko.title), ko.title);
  check(tag + ": KO banner stamps a real price", /\$[\d,]+/.test(ko.price) && !/\$-/.test(ko.price), ko.price);
  check(tag + ": KO increments round score", ko.rounds.buy === 1, ko.rounds);
  await sleep(3600);
  const after = await page.evaluate(() => ({ banner: !document.getElementById("banner").hidden, hp: window.__duel.state().hp }));
  check(tag + ": next round resets (banner gone, hp restored)", !after.banner && after.hp.buy >= 80 && after.hp.sell >= 80, after);

  // ── 10. frame budget
  const fps = await page.evaluate(() => new Promise((res) => {
    let n = 0; const t0 = performance.now();
    function tick() { n++; if (performance.now() - t0 < 2200) requestAnimationFrame(tick); else res(n / ((performance.now() - t0) / 1000)); }
    requestAnimationFrame(tick);
  }));
  check(tag + ": frame rate >= 40fps", fps >= 40, { fps: +fps.toFixed(1) });

  check(tag + ": still no page errors", errors.length === 0, errors.slice(0, 4));
  await browser.close();
}

(async () => {
  await run(1440, 900, "desktop");
  await run(390, 844, "phone");
  const failed = results.filter((r) => !r.ok);
  console.log("\n" + (results.length - failed.length) + "/" + results.length + " PASS" + (failed.length ? " - " + failed.length + " FAILED" : ""));
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error("PROBE CRASH", e); process.exit(2); });
