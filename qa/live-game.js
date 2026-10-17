/* ROPE DUEL - boot, loop, HUD wiring, sound, probe surface. */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var demo = new URLSearchParams(location.search).get("demo") === "1";
  var timeScale = 1, targetScale = 1, timeScaleAt = 0;
  var t = 0, last = performance.now(), paused = false;
  var tapeBuf = [], tapeEl = null, tapeDup = false;
  var hudAcc = 0, chartAcc = 0;

  var feed = new BtcFeed({ demo: demo });
  var duel = new Duel({});
  var arena = new Arena($("duel"));
  var rope = new window.Rope(32);

  /* ── sound (WebAudio, lazy, quiet) ── */
  var AC = null;
  function audio() {
    if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
    if (AC && AC.state === "suspended") AC.resume();
    return AC;
  }
  function tone(freq, dur, type, vol, slide) {
    var a = audio(); if (!a) return;
    try {
      var o = a.createOscillator(), g = a.createGain();
      o.type = type || "square"; o.frequency.value = freq;
      if (slide) o.frequency.exponentialRampToValueAtTime(slide, a.currentTime + dur);
      g.gain.setValueAtTime(vol, a.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
      o.connect(g); g.connect(a.destination);
      o.start(); o.stop(a.currentTime + dur + 0.02);
    } catch (e) {}
  }
  var sfx = {
    clink: function () { tone(1400, 0.07, "triangle", 0.12); },
    hit: function (buy) { tone(buy ? 190 : 150, 0.12, "sawtooth", 0.14, buy ? 90 : 70); },
    lock: function () { tone(620, 0.16, "sawtooth", 0.16, 480); },
    ko: function () { tone(320, 0.6, "sawtooth", 0.2, 60); },
    whale: function () { tone(880, 0.5, "sine", 0.1, 1760); }
  };

  /* ── HUD ── */
  function fmtPrice(p) {
    return p >= 1000 ? "$" + p.toLocaleString("en-US", { maximumFractionDigits: 1 })
      : p ? "$" + p.toFixed(2) : "$-";
  }
  function setHud(s) {
    var pr = $("price");
    var dir = s.pressure >= 0 ? (pr.dataset.dir === "down" ? "flat" : "up") : (pr.dataset.dir === "up" ? "flat" : "down");
    if (s.pressure > 0.02) dir = "up"; else if (s.pressure < -0.02) dir = "down";
    if (s.price) {
      if (pr.dataset.dir !== dir) { pr.dataset.dir = dir; }
      pr.textContent = fmtPrice(s.price);
      pr.dataset.price = s.price.toFixed(2);
    }
    var chg = s.chg24;
    $("chg").textContent = (chg >= 0 ? "+" : "") + chg.toFixed(2) + "%";
    $("chg").dataset.dir = chg >= 0 ? "up" : "down";
    var venue = $("venue");
    venue.textContent = s.provider === "SIM" ? "SIM TAPE" : (s.provider ? "LIVE · " + s.provider : "SPOT");

    // pressure meter
    var p = Math.max(-1, Math.min(1, s.pressure));
    var buyPct = 50 + p * 50;
    $("meter-buy").style.width = buyPct + "%";
    $("meter-sell").style.width = (100 - buyPct) + "%";
    $("meter-mid").style.left = buyPct + "%";
    $("pct-buy").textContent = Math.round(buyPct) + "%";
    $("pct-sell").textContent = Math.round(100 - buyPct) + "%";
    $("chart-chip").textContent = venue.textContent;
  }
  function setStatus(live, text) {
    var st = $("status");
    st.dataset.live = String(live === true ? 1 : live === false ? 0 : -1);
    $("status-text").textContent = text;
  }
  var LABELS = {
    idle: "EN GARDE", windup: "WIND UP", swing: "STRIKE", recover: "RECOVER",
    guard: "HOLDS GUARD", hop: "HOP BACK", hit: "HIT!", ko: "K.O.", win: "WINS"
  };
  var ACTS = {
    windup: "attack", swing: "attack", guard: "guard", hop: "guard",
    hit: "hit", ko: "ko", win: "win"
  };
  var lastDuelLabel = "", lastLabelAt = 0;
  function setPlates() {
    ["buy", "sell"].forEach(function (side) {
      var c = duel.cats[side];
      var plate = $("plate-" + side);
      var act = ACTS[c.state] || "idle";
      if (c.state === "recover") act = "attack";
      plate.dataset.act = act;
      $("state-" + side).textContent = LABELS[c.state] || "EN GARDE";
      $("mom-" + side).style.width = c.hp + "%";
      $("rounds-" + side).textContent = duel.rounds[side] + c.rounds;
      if (duel.rounds[side] + c.rounds > 0 && c.rounds === 0 && c.state === "idle") {
        $("rounds-" + side).textContent = duel.rounds[side];
      }
    });
  }
  function setDuelLabel(label) {
    var now = performance.now() / 1000;
    var urgent = label === "BLADE LOCK" || label === "CLASH!";
    if (label === lastDuelLabel) return;
    if (!urgent && now - lastLabelAt < 0.5) return;
    lastDuelLabel = label; lastLabelAt = now;
    $("duel-state").textContent = label;
  }
  function showBanner(winner, price, chg24) {
    var b = $("banner");
    b.hidden = false;
    var isBuy = winner === "buy";
    $("banner-title").textContent = isBuy ? "BID PULLS THE ROPE" : "ASK PULLS THE ROPE";
    $("banner-title").style.color = isBuy ? "var(--buy)" : "var(--sell)";
    $("banner-kicker").textContent = "ROUND " + (duel.rounds.buy + duel.rounds.sell);
    $("banner-price").textContent = fmtPrice(price);
    var agree = (isBuy && chg24 >= 0) || (!isBuy && chg24 < 0);
    $("banner-sub").textContent = agree ? "MARKET AGREES WITH THE WINNER" : "MARKET DISAGREES";
  }
  function hideBanner() { $("banner").hidden = true; }

  function callout(text, cls, x, y) {
    var el = document.createElement("div");
    el.className = "callout " + (cls || "");
    el.innerHTML = text;
    var box = $("callouts");
    box.appendChild(el);
    var bw = el.offsetWidth, bh = el.offsetHeight;
    var px = x == null ? box.clientWidth / 2 : x;
    var py = y == null ? box.clientHeight * 0.35 : y;
    el.style.left = Math.max(bw / 2, Math.min(box.clientWidth - bw / 2, px)) + "px";
    el.style.top = Math.max(bh / 2, Math.min(box.clientHeight - bh / 2, py)) + "px";
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 2600);
  }

  function fmtUsd(u) { return u >= 1000000 ? (u / 1000000).toFixed(2) + "M" : Math.round(u).toLocaleString("en-US"); }

  /* ── events ── */
  duel.onEvent = function (ev) {
    var midX = (duel.cats.buy.x + duel.cats.sell.x) / 2;
    var ropeY = arena.layout().ropeY;
    var buy = ev.side === "buy";
    var col = buy ? "#35D07F" : "#EF5350";
    if (ev.type === "hit") {
      var tip = buy ? duel.cats.sell.x - 20 : duel.cats.buy.x + 20;
      arena.burst(tip, ropeY - 120, col, 18, 300);
      arena.ring(tip, ropeY - 120, col);
      arena.shake = Math.min(1, arena.shake + 0.55);
      arena.flash = Math.min(1, arena.flash + 0.5);
      rope.impulse(1.4, buy);
      sfx.hit(buy);
      setDuelLabel("CLASH!");
    } else if (ev.type === "block") {
      arena.burst(midX, ropeY - 110, "#E8C568", 10, 220);
      arena.shake = Math.min(1, arena.shake + 0.25);
      sfx.clink();
    } else if (ev.type === "lock") {
      arena.burst(midX, ropeY - 120, "#F0B429", 22, 340);
      arena.ring(midX, ropeY - 120, "#F0B429");
      arena.shake = Math.min(1, arena.shake + 0.5);
      sfx.lock();
      setDuelLabel("BLADE LOCK");
    } else if (ev.type === "ko") {
      arena.shake = 1;
      arena.flash = 1;
      rope.impulse(2.2, ev.winner === "buy");
      sfx.ko();
      targetScale = 0.34; timeScaleAt = 0;
      var st = feed.state();
      showBanner(ev.winner, st.price, st.chg24);
      callout("💥 <b>" + (ev.winner === "buy" ? "BID" : "ASK") + " WINS THE EXCHANGE</b>", ev.winner === "buy" ? "buy whale" : "sell whale", midX, ropeY - 200);
    } else if (ev.type === "round") {
      hideBanner();
    } else if (ev.type === "attack") {
      // blade trail handled by pose; plates react via state
    }
  };
  duel.onState = function (s) { setDuelLabel(s); };

  /* ── feed wiring ── */
  var bootStep = 0;
  feed.onStatus = function (s) {
    setStatus(s.live, s.provider === "SIM" ? "REPLAY" : "LIVE · " + s.provider);
    var line = s.provider === "SIM" ? "NO LIVE PROVIDER - REPLAYING RECORDED TAPE" : "CONNECTED TO " + s.provider;
    $("boot-line").textContent = line;
  };
  feed.onChange = function (s) { setHud(s); };
  feed.onTape = function (tr) {
    tapeBuf.push(tr);
    if (tapeBuf.length > 24) tapeBuf.shift();
    renderTape();
  };
  feed.onWhale = function (w) {
    var st = feed.state();
    arena.moonPulse = 1;
    sfx.whale();
    var midX = (duel.cats.buy.x + duel.cats.sell.x) / 2;
    callout("🐋 <b>" + fmtUsd(w.usd) + "</b> " + (w.side === "B" ? "BID" : "ASK") + "@" + w.p.toFixed(0), w.side === "B" ? "buy whale" : "sell whale", midX + (Math.random() - 0.5) * 200, arena.layout().ropeY - 260);
    duel.cats[w.side === "B" ? "buy" : "sell"].hitFlash = 0.5;
  };

  /* ── tape marquee ── */
  function renderTape() {
    if (!tapeEl) { tapeEl = document.createElement("div"); tapeEl.className = "tape-track"; $("tape").appendChild(tapeEl); }
    var html = tapeBuf.map(function (tr) {
      var cls = tr.side === "B" ? "up" : "dn";
      return "<span>" + (tr.side === "B" ? "▲" : "▼") + " <b class='" + cls + "'>" + fmtUsd(tr.usd) + "</b> @ " + tr.p.toFixed(0) + "</span>";
    }).join("");
    tapeEl.innerHTML = html + html;
  }

  /* ── loop ── */
  function frame(now) {
    requestAnimationFrame(frame);
    if (paused) return;
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    t += dt * timeScale;
    if (timeScale < targetScale) { timeScaleAt += dt; timeScale = Math.min(targetScale, timeScale + dt * 0.5); }
    else if (timeScale < 1) { timeScale = Math.min(1, timeScale + dt * 1.4); }

    // layout
    var L = arena.layout();
    duel.layout(arena.W, arena.H);
    var st = feed.state();
    duel.update(dt * timeScale, st);
    duel.onState && duel.onState(null);
    // rope pins
    var nBuy = Math.max(1, Math.min(31, Math.round((duel.cats.buy.x - L.poleL.x) / (L.poleR.x - L.poleL.x) * 32)));
    var nSell = Math.max(1, Math.min(31, Math.round((duel.cats.sell.x - L.poleL.x) / (L.poleR.x - L.poleL.x) * 32)));
    rope.setPins([
      { node: 0, x: L.poleL.x, y: L.ropeY },
      { node: nBuy, x: duel.cats.buy.x, y: L.ropeY + 4 },
      { node: nSell, x: duel.cats.sell.x, y: L.ropeY + 4 },
      { node: 32, x: L.poleR.x, y: L.ropeY }
    ]);
    rope.setMarker(duel.pressure);
    rope.update(dt * timeScale, 0, 0);

    arena.frame(dt * timeScale, { t: t, duel: duel, rope: rope, layout: L });

    // chart + HUD at ~8Hz (never layout-thrash per frame)
    chartAcc += dt; hudAcc += dt;
    if (chartAcc >= 0.25) { chartAcc = 0; window.drawChart($("chart-canvas"), feed.candles(), st); }
    if (hudAcc >= 0.125) { hudAcc = 0; setPlates(); setHud(st); }
  }

  /* ── boot ── */
  function boot() {
    var bar = $("boot-bar"), line = $("boot-line");
    var steps = [["ENGAGING FEED…", 0.5], ["STRINGING THE ROPE…", 0.8], ["RAISING THE ARENA…", 1.0]];
    var i = 0;
    function step() {
      if (i >= steps.length) {
        $("boot").classList.add("done");
        setTimeout(function () { $("boot").style.display = "none"; }, 600);
        return;
      }
      line.textContent = steps[i][0];
      bar.style.width = steps[i][1] * 100 + "%";
      i++;
      setTimeout(step, 420);
    }
    step();
    feed.start();
    requestAnimationFrame(function (n) { last = n; requestAnimationFrame(frame); });
  }

  /* ── interaction: cheer ── */
  document.addEventListener("pointerdown", function (e) {
    audio();
    arena.burst(e.clientX, e.clientY, "#E8C568", 8, 160);
  });

  document.addEventListener("visibilitychange", function () {
    paused = document.hidden;
    if (!paused) last = performance.now();
  });
  window.addEventListener("resize", function () { arena.resize(); duel.layout(arena.W, arena.H); });

  /* ── probe surface ── */
  window.__duel = {
    state: function () {
      var st = feed.state();
      return {
        price: st.price, chg24: st.chg24, pressure: st.pressure, provider: st.provider,
        hp: { buy: duel.cats.buy.hp, sell: duel.cats.sell.hp },
        rounds: { buy: duel.rounds.buy, sell: duel.rounds.sell },
        states: { buy: duel.cats.buy.state, sell: duel.cats.sell.state },
        contacts: duel.contacts, attacks: duel.attacks, ropeTension: rope.tension, marker: rope.marker, time: t,
        banner: !$("banner").hidden
      };
    },
    reset: function () { duel.reset(); hideBanner(); },
    kick: function (side) { duel._startMove(side, "LUNGE"); },
    forceKo: function (winner) { duel._ko(winner === "buy" ? "sell" : "buy", winner); },
    exchange: function (side, move) {
      var def = side === "buy" ? "sell" : "buy";
      duel.pairGap = duel.baseGap * 0.8; // put them in measure at contact range
      duel.cats[def].state = "guard"; duel.cats[def].stateT = 0; duel.cats[def].stateDur = 1.2;
      return duel._startMove(side, move || "LUNGE");
    },
    pressure: function (p) { duel.forced = p; duel.pressure = p; duel.pS = p; },
    hold: function (on) {
      duel.nextBeat = on ? 1e9 : duel.time + 0.5;
      if (on) {
        duel.roundOver = false; hideBanner();
        duel.cats.buy.state = "idle"; duel.cats.buy.stateT = 0; duel.cats.buy.move = null;
        duel.cats.sell.state = "idle"; duel.cats.sell.stateT = 0; duel.cats.sell.move = null;
      }
    },
    positions: function () {
      var L = arena.layout();
      return { buy: duel.cats.buy.x, sell: duel.cats.sell.x, ropeY: L.ropeY, W: arena.W, H: arena.H };
    },
    sim: function (p) { duel.pressure = p; duel.pS = p; },
    feed: feed, duel: duel, arena: arena,
    stats: function () {
      return { tape: tapeBuf.length, particles: arena.particles.length, W: arena.W, H: arena.H };
    }
  };

  boot();
})();
