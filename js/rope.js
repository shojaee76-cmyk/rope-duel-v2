/* ROPE DUEL - verlet rope. Pinned at poles + both cats' paws; sags under gravity. */
(function () {
  "use strict";

  function Rope(segments) {
    this.N = segments || 30;
    this.pts = [];
    this.prev = [];
    for (var i = 0; i <= this.N; i++) { this.pts.push({ x: 0, y: 0 }); this.prev.push({ x: 0, y: 0 }); }
    this.pins = {};
    this.tension = 0;
    this.marker = 0.5;
    this.targetMarker = 0.5;
    this.wobble = 0;
  }

  Rope.prototype = {
    setPins: function (pins) {
      this.pins = {};
      for (var i = 0; i < pins.length; i++) {
        var n = pins[i].node;
        this.pins[n] = { x: pins[i].x, y: pins[i].y };
      }
    },
    pinNodes: function () { return Object.keys(this.pins).map(Number); },
    setMarker: function (pressure) {
      this.targetMarker = Math.max(-0.5, Math.min(0.5, pressure)) * 0.44 + 0.5;
    },
    update: function (dt, impulseX, impulseY) {
      var pts = this.pts, prev = this.prev, N = this.N, i;
      for (i = 0; i <= N; i++) {
        if (this.pins[i]) { pts[i].x = this.pins[i].x; pts[i].y = this.pins[i].y; prev[i].x = pts[i].x; prev[i].y = pts[i].y; }
      }
      for (i = 1; i < N; i++) {
        if (this.pins[i]) continue;
        var nx = pts[i].x, ny = pts[i].y;
        var vx = (nx - prev[i].x) * 0.97;
        var vy = (ny - prev[i].y) * 0.97;
        pts[i].x = nx + vx + (impulseX || 0);
        pts[i].y = ny + vy + (impulseY || 0) + 90 * dt;
        prev[i].x = nx; prev[i].y = ny;
      }
      // span between the outermost pins (rest length derives from it)
      var keys = this.pinNodes().sort(function (a, b) { return a - b; });
      var a0 = keys[0], an = keys[keys.length - 1];
      var ax = pts[a0].x, ay = pts[a0].y, bx = pts[an].x, by = pts[an].y;
      var span = Math.hypot(bx - ax, by - ay) || 1;
      for (var iter = 0; iter < 3; iter++) {
        var rest = span / (an - a0);
        for (i = 0; i < N; i++) {
          if (this.pins[i] && this.pins[i + 1]) continue;
          var dx = pts[i + 1].x - pts[i].x, dy = pts[i + 1].y - pts[i].y;
          var d = Math.hypot(dx, dy) || 0.001;
          var diff = (d - rest) / d * 0.4;
          if (!this.pins[i]) { pts[i].x += dx * diff; pts[i].y += dy * diff; }
          if (!this.pins[i + 1]) { pts[i + 1].x -= dx * diff; pts[i + 1].y -= dy * diff; }
        }
      }
      for (i = 0; i <= N; i++) { if (this.pins[i]) { pts[i].x = this.pins[i].x; pts[i].y = this.pins[i].y; } }

      var sum = 0, count = 0;
      for (i = a0; i <= an; i++) {
        var px = pts[i].x, py = pts[i].y;
        var t = ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / (span * span);
        var cx = ax + (bx - ax) * t, cy = ay + (by - ay) * t;
        sum += Math.hypot(px - cx, py - cy); count++;
      }
      var tension = 1 - (sum / (count || 1)) / (span * 0.5 + 30);
      this.tension += (Math.max(0, Math.min(1, tension)) - this.tension) * Math.min(1, dt * 4);
      this.marker += (this.targetMarker - this.marker) * Math.min(1, dt * 1.6);
      this.wobble = Math.max(0, this.wobble - dt * 1.4);
    },
    impulse: function (amt, fromBuy) {
      var keys = this.pinNodes().sort(function (a, b) { return a - b; });
      var k = fromBuy ? -1 : 1;
      for (var i = keys[1]; i <= keys[2]; i++) {
        if (this.pins[i]) continue;
        this.pts[i].y += k * 22 * amt;
        this.pts[i].x += k * 12 * amt;
      }
      this.wobble = 1;
    },
    markerPoint: function () {
      var keys = this.pinNodes().sort(function (a, b) { return a - b; });
      var k1 = keys[1], k2 = keys[2];
      var m = this.marker * (k2 - k1) + k1;
      var i = Math.min(k2 - 1, Math.floor(m));
      var f = m - i;
      return {
        x: this.pts[i].x + (this.pts[i + 1].x - this.pts[i].x) * f,
        y: this.pts[i].y + (this.pts[i + 1].y - this.pts[i].y) * f
      };
    },
    drawTo: function (ctx, opts) {
      opts = opts || {};
      var pts = this.pts, i, p;
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.strokeStyle = "rgba(0,0,0,.48)"; ctx.lineWidth = 15; ctx.globalAlpha = 0.55;
      ctx.beginPath();
      for (i = 0; i <= this.N; i++) { p = pts[i]; if (i === 0) ctx.moveTo(p.x, p.y + 3); else ctx.lineTo(p.x, p.y + 3); }
      ctx.stroke(); ctx.globalAlpha = 1;
      ctx.strokeStyle = "#9C7836"; ctx.lineWidth = 11;
      ctx.beginPath();
      for (i = 0; i <= this.N; i++) { p = pts[i]; if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); }
      ctx.stroke();
      ctx.strokeStyle = "#E3C078"; ctx.lineWidth = 4; ctx.globalAlpha = 0.55;
      ctx.beginPath();
      for (i = 0; i <= this.N; i += 2) { p = pts[i]; if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); }
      ctx.stroke(); ctx.globalAlpha = 1;
      ctx.strokeStyle = "#6B4E22"; ctx.lineWidth = 2; ctx.globalAlpha = 0.75;
      for (i = 4; i < this.N; i += 6) {
        var a = pts[i - 1], b = pts[i + 1];
        ctx.beginPath(); ctx.moveTo(a.x, a.y - 3); ctx.lineTo(b.x, b.y + 3); ctx.stroke();
      }
      ctx.globalAlpha = 1;

      if (!opts.noMarker) {
        var mp = this.markerPoint();
        var grd = ctx.createRadialGradient(mp.x, mp.y, 0, mp.x, mp.y, 26);
        grd.addColorStop(0, "rgba(255,255,255,.95)");
        grd.addColorStop(0.25, "rgba(240,180,41,.85)");
        grd.addColorStop(1, "rgba(240,180,41,0)");
        ctx.fillStyle = grd;
        ctx.beginPath(); ctx.arc(mp.x, mp.y, 26, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#F0B429";
        ctx.beginPath(); ctx.arc(mp.x, mp.y, 5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "rgba(240,180,41,.8)"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(mp.x, mp.y, 10 + Math.sin(Date.now() / 300) * 3, 0, Math.PI * 2); ctx.stroke();
      }
    }
  };

  window.Rope = Rope;
})();
