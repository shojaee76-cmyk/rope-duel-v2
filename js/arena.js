/* ROPE DUEL - arena renderer: night floor, poles, rope, cats, particles, chart. */
(function () {
  "use strict";

  function Arena(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext("2d");
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.W = 0; this.H = 0;
    this.particles = [];
    this.shake = 0;
    this.moonPulse = 0;
    this.flash = 0;
    this._lastBlade = { buy: null, sell: null };
    this.frameEma = 0.016;
    this.lowFx = false;
    this.stars = [];
    for (var i = 0; i < 90; i++) this.stars.push({ x: Math.random(), y: Math.random() * 0.55, r: Math.random() * 1.4 + 0.4, tw: Math.random() * 6 });
    this.resize();
  }

  Arena.prototype.resize = function () {
    var w = window.innerWidth, h = window.innerHeight;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.cv.width = Math.floor(w * this.dpr);
    this.cv.height = Math.floor(h * this.dpr);
    this.cv.style.width = w + "px";
    this.cv.style.height = h + "px";
    this.W = w; this.H = h;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  };

  Arena.prototype.layout = function () {
    var W = this.W, H = this.H;
    return {
      poleL: { x: W * 0.055, y: H * 0.585 },
      poleR: { x: W * 0.945, y: H * 0.585 },
      ropeY: H * 0.585
    };
  };

  /* ── particles ── */
  Arena.prototype.burst = function (x, y, color, n, spd) {
    n = n || 14;
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2;
      var v = (spd || 240) * (0.4 + Math.random() * 0.9);
      this.particles.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, life: 1, r: 1.5 + Math.random() * 2.5, col: color });
    }
  };
  Arena.prototype.ring = function (x, y, color) {
    this.particles.push({ ring: true, x: x, y: y, life: 1, r: 10, col: color });
  };

  Arena.prototype._tickParticles = function (dt) {
    for (var i = this.particles.length - 1; i >= 0; i--) {
      var p = this.particles[i];
      p.life -= dt * (p.ring ? 2.2 : 1.8);
      if (!p.ring) {
        p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 500 * dt;
        p.vx *= 0.98;
      } else { p.r += 260 * dt; }
      if (p.life <= 0) this.particles.splice(i, 1);
    }
    if (this.particles.length > 220) this.particles.splice(0, this.particles.length - 220);
  };

  /* ── background ── */
  Arena.prototype._sky = function (ctx, t) {
    var W = this.W, H = this.H;
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#07080B");
    g.addColorStop(0.45, "#0B0D12");
    g.addColorStop(0.75, "#11141B");
    g.addColorStop(1, "#07080B");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    // stars
    for (var i = 0; i < this.stars.length; i++) {
      var s = this.stars[i];
      var tw = 0.4 + 0.6 * Math.abs(Math.sin(t * 0.9 + s.tw));
      ctx.globalAlpha = 0.5 * tw;
      ctx.fillStyle = "#DCE4F0";
      ctx.fillRect(s.x * W, s.y * H, s.r, s.r);
    }
    ctx.globalAlpha = 1;

    // moon (pulses on whale trades) - lit sphere with terminator + craters + halo
    var mx = W * 0.82, my = H * 0.16, mr = Math.min(46, W * 0.05);
    var pulse = 1 + this.moonPulse * 0.5;
    var mg = ctx.createRadialGradient(mx, my, mr * 0.4, mx, my, mr * 5.2 * pulse);
    mg.addColorStop(0, "rgba(240,190,80," + (0.18 + this.moonPulse * 0.45) + ")");
    mg.addColorStop(0.45, "rgba(240,170,60," + (0.06 + this.moonPulse * 0.2) + ")");
    mg.addColorStop(1, "rgba(240,180,41,0)");
    ctx.fillStyle = mg;
    ctx.beginPath(); ctx.arc(mx, my, mr * 5.2 * pulse, 0, Math.PI * 2); ctx.fill();
    // halo rings
    ctx.strokeStyle = "rgba(240,200,110,.12)"; ctx.lineWidth = 1;
    for (var hr = 1; hr <= 2; hr++) { ctx.beginPath(); ctx.arc(mx, my, mr * (1.5 + hr * 0.55), 0, Math.PI * 2); ctx.stroke(); }
    // sphere
    var sg = ctx.createRadialGradient(mx - mr * 0.35, my - mr * 0.4, mr * 0.1, mx, my, mr);
    sg.addColorStop(0, "#FBEBB4"); sg.addColorStop(0.55, "#E8C568"); sg.addColorStop(1, "#B98F35");
    ctx.fillStyle = sg;
    ctx.beginPath(); ctx.arc(mx, my, mr, 0, Math.PI * 2); ctx.fill();
    // craters
    var craters = [[-0.32, -0.18, 0.2], [0.26, 0.28, 0.15], [0.1, -0.42, 0.1], [-0.1, 0.42, 0.11]];
    for (var ci = 0; ci < craters.length; ci++) {
      var cr = craters[ci];
      ctx.fillStyle = "rgba(130,95,30,.28)";
      ctx.beginPath(); ctx.arc(mx + cr[0] * mr, my + cr[1] * mr, cr[2] * mr, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(255,240,190,.18)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(mx + cr[0] * mr, my + cr[1] * mr, cr[2] * mr, Math.PI * 0.9, Math.PI * 1.9); ctx.stroke();
    }
    // terminator shadow (light from upper-left)
    var tg = ctx.createRadialGradient(mx - mr * 0.5, my - mr * 0.55, mr * 0.2, mx, my, mr * 1.05);
    tg.addColorStop(0, "rgba(0,0,0,0)"); tg.addColorStop(0.7, "rgba(0,0,0,0)"); tg.addColorStop(1, "rgba(30,20,0,.28)");
    ctx.fillStyle = tg;
    ctx.beginPath(); ctx.arc(mx, my, mr, 0, Math.PI * 2); ctx.fill();
    this.moonPulse = Math.max(0, this.moonPulse - 0.012);

    // city skyline
    ctx.fillStyle = "#0C0F15";
    var baseY = H * 0.46;
    for (var b = 0; b < 16; b++) {
      var bw = W / 16;
      var bh = (30 + (b * 7919 % 90)) * (H / 700);
      ctx.fillRect(b * bw, baseY - bh, bw - 3, bh);
      // lit windows
      ctx.fillStyle = "rgba(240,180,41,.10)";
      for (var wy = 0; wy < 3; wy++) {
        if ((b * 13 + wy * 7) % 5 < 2) ctx.fillRect(b * bw + bw * 0.3, baseY - bh + 8 + wy * 10, 3, 4);
      }
      ctx.fillStyle = "#0C0F15";
    }
  };

  Arena.prototype._floor = function (ctx, t) {
    var W = this.W, H = this.H;
    var y = H * 0.585;
    var g = ctx.createLinearGradient(0, y - 30, 0, H);
    g.addColorStop(0, "rgba(20,24,32,.9)");
    g.addColorStop(0.12, "rgba(14,17,23,.95)");
    g.addColorStop(1, "#050608");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, y - 24);
    ctx.lineTo(W, y - 24);
    ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath();
    ctx.fill();
    // perspective floor lines
    ctx.strokeStyle = "rgba(236,238,242,.05)"; ctx.lineWidth = 1;
    for (var i = 1; i < 7; i++) {
      var yy = y + Math.pow(i / 7, 2.2) * (H - y);
      ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(W, yy); ctx.stroke();
    }
    var cx = W / 2;
    for (i = -6; i <= 6; i++) {
      ctx.beginPath(); ctx.moveTo(cx + i * 40, y - 24); ctx.lineTo(cx + i * 260, H); ctx.stroke();
    }
  };

  Arena.prototype._stands = function (ctx, t) {
    var W = this.W, H = this.H, base = H * 0.54;
    // tiered arena silhouettes behind the rope, lit by tiny order-book windows
    ctx.fillStyle = "#090B10";
    for (var tier = 0; tier < 3; tier++) {
      var y = base - tier * 30, left = W * 0.08 + tier * 18, right = W * 0.92 - tier * 18;
      ctx.fillRect(left, y, right - left, 26);
      ctx.strokeStyle = "rgba(236,238,242,.07)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke();
      for (var j = 0; j < 14; j++) {
        var wx = left + 18 + j * ((right - left - 36) / 14);
        var pulse = 0.35 + 0.35 * Math.abs(Math.sin(t * 0.7 + j * 1.7 + tier));
        ctx.fillStyle = "rgba(240,180,41," + pulse * 0.22 + ")";
        ctx.fillRect(wx, y + 8 + (j % 2) * 5, 3, 3);
      }
    }
    // arched openings
    ctx.strokeStyle = "rgba(236,238,242,.06)"; ctx.lineWidth = 2;
    for (var a = 0; a < 9; a++) {
      var ax = W * 0.16 + a * W * 0.085;
      ctx.beginPath(); ctx.arc(ax, base - 8, 20, Math.PI, Math.PI * 2); ctx.stroke();
    }
  };

  Arena.prototype._fog = function (ctx, t) {
    var W = this.W, H = this.H;
    var drift = Math.sin(t * 0.12) * W * 0.04;
    var g = ctx.createLinearGradient(0, H * 0.39, 0, H * 0.58);
    g.addColorStop(0, "rgba(120,135,160,0)");
    g.addColorStop(0.5, "rgba(120,135,160,.055)");
    g.addColorStop(1, "rgba(120,135,160,0)");
    ctx.fillStyle = g;
    ctx.fillRect(-W * 0.15 + drift, H * 0.38, W * 1.3, H * 0.2);
    ctx.globalAlpha = 0.45;
    ctx.fillRect(-W * 0.2 - drift * 0.7, H * 0.5, W * 1.4, H * 0.1);
    ctx.globalAlpha = 1;
  };

  Arena.prototype._lanterns = function (ctx, t) {
    var W = this.W, H = this.H;
    var xs = [W * 0.28, W * 0.5, W * 0.72];
    for (var i = 0; i < xs.length; i++) {
      var x = xs[i] + Math.sin(t * 0.8 + i * 1.8) * 5;
      var y = H * 0.23 + Math.sin(t * 0.9 + i) * 3;
      var halo = ctx.createRadialGradient(x, y + 10, 0, x, y + 10, 60);
      halo.addColorStop(0, "rgba(240,180,41,.18)"); halo.addColorStop(1, "rgba(240,180,41,0)");
      ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(x, y + 10, 60, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(236,238,242,.18)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, y - 48); ctx.lineTo(x, y - 4); ctx.stroke();
      ctx.fillStyle = "#8A6A33"; ctx.fillRect(x - 10, y - 4, 20, 26);
      ctx.fillStyle = "#F0B429"; ctx.fillRect(x - 6, y + 1, 12, 15);
      ctx.fillStyle = "rgba(255,235,150,.65)"; ctx.fillRect(x - 3, y + 3, 6, 10);
      ctx.strokeStyle = "#4A3817"; ctx.lineWidth = 2; ctx.strokeRect(x - 10, y - 4, 20, 26);
    }
  };

  Arena.prototype._pole = function (ctx, p, side) {
    // bronze pole + finial + base
    var pw = 14, ph = this.H * 0.34;
    var x = p.x, yTop = p.y - ph * 0.62;
    var g = ctx.createLinearGradient(x - pw / 2, 0, x + pw / 2, 0);
    g.addColorStop(0, "#6B5225"); g.addColorStop(0.5, "#B08A3E"); g.addColorStop(1, "#4A3817");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x - pw / 2, yTop, pw, this.H - yTop + 30, 4) : ctx.rect(x - pw / 2, yTop, pw, this.H - yTop + 30);
    ctx.fill();
    // finial
    ctx.fillStyle = "#D9B25C";
    ctx.beginPath(); ctx.arc(x, yTop - 10, 8, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x - 7, yTop - 2); ctx.lineTo(x + 7, yTop - 2); ctx.lineTo(x, yTop - 16); ctx.closePath(); ctx.fill();
    // base
    ctx.fillStyle = "#2A2113";
    ctx.fillRect(x - 22, this.H - 46, 44, 30);
    ctx.fillStyle = "rgba(240,180,41,.14)";
    ctx.fillRect(x - 22, this.H - 46, 44, 3);
    // side pennant
    var pc = side === "buy" ? "#35D07F" : "#EF5350";
    ctx.fillStyle = pc;
    ctx.beginPath();
    ctx.moveTo(x + (side === "buy" ? pw / 2 : -pw / 2), yTop + 6);
    ctx.lineTo(x + (side === "buy" ? pw / 2 + 42 : -pw / 2 - 42), yTop + 16);
    ctx.lineTo(x + (side === "buy" ? pw / 2 : -pw / 2), yTop + 34);
    ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.moveTo(x + (side === "buy" ? pw / 2 : -pw / 2), yTop + 6);
    ctx.lineTo(x + (side === "buy" ? pw / 2 + 42 : -pw / 2 - 42), yTop + 16);
    ctx.lineTo(x + (side === "buy" ? pw / 2 : -pw / 2), yTop + 34);
    ctx.closePath();
    ctx.globalAlpha = 0.25; ctx.strokeStyle = pc; ctx.lineWidth = 3; ctx.stroke();
    ctx.globalAlpha = 1;
  };

  Arena.prototype._trails = function (ctx, duel, poses, y, S) {
    var sides = ["buy", "sell"];
    for (var i = 0; i < sides.length; i++) {
      var side = sides[i], c = duel.cats[side], facing = side === "buy" ? 1 : -1;
      var bp = window.CatArt.bladePoint(poses[side]);
      var wx = c.x + facing * S * bp.tx, wy = y + S * bp.ty;
      var prev = this._lastBlade[side];
      if (c.state === "swing" && prev) {
        var dx = wx - prev.x, dy = wy - prev.y;
        if (Math.hypot(dx, dy) < 220) {
          ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.lineCap = "round";
          ctx.strokeStyle = side === "buy" ? "rgba(80,255,170,.35)" : "rgba(255,110,120,.35)";
          ctx.lineWidth = 10; ctx.beginPath(); ctx.moveTo(prev.x, prev.y); ctx.lineTo(wx, wy); ctx.stroke();
          ctx.strokeStyle = "rgba(255,255,255,.62)"; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(prev.x, prev.y); ctx.lineTo(wx, wy); ctx.stroke();
          ctx.restore();
        }
      }
      this._lastBlade[side] = (c.state === "swing" || c.state === "recover") ? { x: wx, y: wy } : null;
    }
  };

  Arena.prototype._reflections = function (ctx, duel, poses, y, S) {
    if (this.W < 700 || this.lowFx) return;
    ctx.save();
    ctx.globalAlpha = 0.095;
    ctx.beginPath(); ctx.rect(0, y + 8, this.W, this.H - y - 8); ctx.clip();
    var sides = ["buy", "sell"];
    for (var i = 0; i < sides.length; i++) {
      var side = sides[i], c = duel.cats[side], facing = side === "buy" ? 1 : -1;
      ctx.save(); ctx.translate(c.x, y + 8); ctx.scale(facing * S, -S * 0.72);
      window.CatArt.drawCat(ctx, side, poses[side]);
      ctx.restore();
    }
    ctx.restore();
  };
  Arena.prototype.drawCat = function (ctx, side, x, y, pose, duel) {
    var facing = side === "buy" ? 1 : -1;
    ctx.save();
    ctx.translate(x, y);
    // contact shadow
    ctx.save();
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = "#000";
    ctx.beginPath(); ctx.ellipse(0, 8, 52, 10, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    var S = Math.max(0.95, Math.min(1.45, this.W / 1150));
    ctx.scale(facing * S, S);
    window.CatArt.drawCat(ctx, side, pose);
    ctx.restore();
  };

  /* ── main frame ── */
  Arena.prototype.frame = function (dt, scene) {
    var ctx = this.ctx, W = this.W, H = this.H, t = scene.t;
    this.frameEma += (dt - this.frameEma) * 0.06;
    if (this.frameEma > 0.022) this.lowFx = true;
    else if (this.frameEma < 0.015) this.lowFx = false;
    this.shake = Math.max(0, this.shake - dt * 3.2);
    this.flash = Math.max(0, this.flash - dt * 2.4);
    this._tickParticles(dt);

    ctx.save();
    if (this.shake > 0.01) {
      var s = this.shake * 9;
      ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
    }

    this._sky(ctx, t);
    this._stands(ctx, t);
    this._floor(ctx, t);
    this._fog(ctx, t);
    this._lanterns(ctx, t);

    // poles
    this._pole(ctx, scene.layout.poleL, "buy");
    this._pole(ctx, scene.layout.poleR, "sell");

    // rope
    scene.rope.drawTo(ctx, {});

    // poses computed once per frame (shared by trails, reflections, draw)
    var poses = { buy: scene.duel.pose("buy", t), sell: scene.duel.pose("sell", t) };
    var S = Math.max(0.95, Math.min(1.45, this.W / 1150));
    var pawY = scene.layout.ropeY + 6;
    this._trails(ctx, scene.duel, poses, pawY, S);
    this._reflections(ctx, scene.duel, poses, pawY, S);

    // cats: SELL first (right), then BUY so buy's sword overlaps in the middle
    this.drawCat(ctx, "sell", scene.duel.cats.sell.x, pawY, poses.sell, scene.duel);
    this.drawCat(ctx, "buy", scene.duel.cats.buy.x, pawY, poses.buy, scene.duel);

    // particles
    for (var i = 0; i < this.particles.length; i++) {
      var p = this.particles[i];
      if (p.ring) {
        ctx.globalAlpha = Math.max(0, p.life) * 0.5;
        ctx.strokeStyle = p.col; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.stroke();
      } else {
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.col;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    // lock highlight
    if (scene.duel.lock) {
      var mx = (scene.duel.cats.buy.x + scene.duel.cats.sell.x) / 2;
      var my = scene.layout.ropeY - 110;
      ctx.strokeStyle = "rgba(240,180,41,.9)"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(mx, my, 30 + Math.sin(t * 30) * 4, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = "rgba(240,180,41,.14)";
      ctx.beginPath(); ctx.arc(mx, my, 40, 0, Math.PI * 2); ctx.fill();
    }

    ctx.restore();

    // impact flash
    if (this.flash > 0.01) {
      ctx.fillStyle = "rgba(255,240,200," + this.flash * 0.18 + ")";
      ctx.fillRect(0, 0, W, H);
    }
  };

  /* ── candlestick chart ── */
  function drawChart(cv, candles, state) {
    var ctx = cv.getContext("2d");
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var w = cv.clientWidth, h = cv.clientHeight;
    if (w < 10 || h < 10) return;
    if (cv.width !== Math.floor(w * dpr) || cv.height !== Math.floor(h * dpr)) {
      cv.width = Math.floor(w * dpr); cv.height = Math.floor(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (!candles || candles.length < 2) return;
    var n = Math.min(70, candles.length);
    var cs = candles.slice(-n);
    var lo = Infinity, hi = -Infinity;
    for (var i = 0; i < cs.length; i++) { lo = Math.min(lo, cs[i].l); hi = Math.max(hi, cs[i].h); }
    if (hi - lo < 1) hi = lo + 1;
    var pad = 4;
    var range = hi - lo;
    lo -= range * 0.08; hi += range * 0.08;
    var y = function (p) { return pad + (1 - (p - lo) / (hi - lo)) * (h - pad * 2); };
    var cw = (w - 8) / cs.length;
    // baseline
    ctx.strokeStyle = "rgba(236,238,242,.08)";
    ctx.beginPath(); ctx.moveTo(0, y(cs[0].c)); ctx.lineTo(w, y(cs[0].c)); ctx.stroke();
    for (i = 0; i < cs.length; i++) {
      var c = cs[i];
      var up = c.c >= c.o;
      var col = up ? "#35D07F" : "#EF5350";
      var x = 4 + i * cw;
      ctx.strokeStyle = col; ctx.fillStyle = col;
      ctx.globalAlpha = 0.9;
      // wick
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x + cw / 2, y(c.h)); ctx.lineTo(x + cw / 2, y(c.l)); ctx.stroke();
      // body
      var bw = Math.max(1, cw * 0.66);
      ctx.fillRect(x + (cw - bw) / 2, y(Math.max(c.o, c.c)), bw, Math.max(1.2, Math.abs(y(c.o) - y(c.c))));
      ctx.globalAlpha = 1;
    }
    // last price line
    var last = cs[cs.length - 1];
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = "rgba(240,180,41,.7)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, y(last.c)); ctx.lineTo(w, y(last.c)); ctx.stroke();
    ctx.setLineDash([]);
  }

  window.Arena = Arena;
  window.drawChart = drawChart;
})();
