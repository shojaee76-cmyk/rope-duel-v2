/* ROPE DUEL - procedural 2D cat art. Two duelists, painted in passes.
   Origin = paw-on-rope contact. Faces +x by default; mirrored for the SELL cat. */
(function () {
  "use strict";

  var PAL = {
    buy: {
      fur: "#E7A95E", furDark: "#C07C36", furLight: "#F6D9A8", belly: "#F3D9AF",
      outline: "#5A3A16", eye: "#2C1A0A", eyeRing: "#E8C05A",
      cloth: "#1E6B45", clothDark: "#124429", clothLight: "#2F8A5B",
      trim: "#E8C05A", trimDark: "#A9822C", plume: "#2F8A5B", metal: "#E8C05A"
    },
    sell: {
      fur: "#7A8290", furDark: "#4C525C", furLight: "#AEB5BF", belly: "#C6CCD4",
      outline: "#252A31", eye: "#F0D24A", eyeRing: "#C0392B",
      cloth: "#8E2B26", clothDark: "#5A1713", clothLight: "#B5453C",
      trim: "#E0B24C", trimDark: "#9A7320", plume: "#C0392B", metal: "#C9CDD4"
    }
  };

  function lerp(a, b, t) { return a + (b - a) * t; }

  function limb(ctx, x1, y1, x2, y2, w, col, outline) {
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    if (outline) { ctx.strokeStyle = outline; ctx.lineWidth = w + 3.2; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
    ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }

  function ellipse(ctx, x, y, rx, ry, rot, fill, stroke, lw) {
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot || 0, 0, Math.PI * 2);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 2; ctx.stroke(); }
  }

  function grad(ctx, x0, y0, x1, y1, stops) {
    var g = ctx.createLinearGradient(x0, y0, x1, y1);
    for (var i = 0; i < stops.length; i++) g.addColorStop(stops[i][0], stops[i][1]);
    return g;
  }

  /* ── draw one cat ─────────────────────────────────────── */
  function drawCat(ctx, id, pose) {
    var P = PAL[id] || PAL.buy;
    var p = pose || {};
    var lean = p.lean || 0;
    var crouch = p.crouch || 0;
    var bob = p.bob || 0;
    var headTilt = p.headTilt || 0;
    var tail = p.tail || 0;
    var eye = p.eye == null ? 1 : p.eye;
    var armA = p.armAngle != null ? p.armAngle : -0.35;
    var bladeA = p.bladeAngle != null ? p.bladeAngle : -1.0;
    var guard = !!p.guard;
    var hitFlash = p.hitFlash || 0;
    var sx = p.squashX == null ? 1 : p.squashX;
    var sy = p.squashY == null ? 1 : p.squashY;

    var hipY = -66 - crouch * 20 + bob;
    var shoulderY = -150 - crouch * 8 + bob;

    ctx.save();
    ctx.scale(sx, sy);
    if (p.fall) ctx.rotate(p.fall);   // KO: topple backward around the paws
    if (p.lungeX) ctx.translate(p.lungeX, 0);

    /* ── TAIL (behind) ── */
    ctx.save();
    var tbx = -30, tby = hipY + 6;
    ctx.strokeStyle = P.outline; ctx.lineWidth = 15; ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(tbx, tby);
    ctx.bezierCurveTo(tbx - 34, tby + 8 + tail * 10, tbx - 52, tby - 34 + tail * 24, tbx - 30, tby - 66 + tail * 20);
    ctx.stroke();
    ctx.strokeStyle = P.furDark; ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.moveTo(tbx, tby);
    ctx.bezierCurveTo(tbx - 34, tby + 8 + tail * 10, tbx - 52, tby - 34 + tail * 24, tbx - 30, tby - 66 + tail * 20);
    ctx.stroke();
    // tail tip light
    ellipse(ctx, tbx - 30, tby - 66 + tail * 20, 7, 7, 0, P.furLight);
    ctx.restore();

    /* ── BACK LEG ── */
    limb(ctx, -12, hipY + 8, -20, -14, 15, P.furDark, P.outline);
    ellipse(ctx, -20, -10, 10, 7, -0.1, P.furDark, P.outline, 2.4); // back paw

    /* ── TORSO + HEAD + ARMS (rotated by lean around hips) ── */
    ctx.save();
    ctx.translate(0, hipY);
    ctx.rotate(lean);
    ctx.translate(0, -hipY);

    // torso
    var tcy = (hipY + shoulderY) / 2;
    var torsoG = grad(ctx, -40, shoulderY, 40, hipY, [[0, P.furLight], [0.5, P.fur], [1, P.furDark]]);
    ellipse(ctx, 2, tcy, 35, (hipY - shoulderY) / 2 + 12, 0.06, torsoG, P.outline, 2.6);
    // belly patch
    ellipse(ctx, 14, tcy + 16, 20, 26, 0.05, P.belly);

    // ── COSTUME over torso ──
    // tunic / robe body
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(-24, shoulderY + 20);
    ctx.quadraticCurveTo(-30, tcy, -26, hipY + 26);
    ctx.lineTo(24, hipY + 26);
    ctx.quadraticCurveTo(30, tcy, 24, shoulderY + 20);
    ctx.quadraticCurveTo(0, shoulderY + 8, -24, shoulderY + 20);
    ctx.closePath();
    var cg = grad(ctx, -26, shoulderY, 26, hipY, [[0, P.clothLight], [0.55, P.cloth], [1, P.clothDark]]);
    ctx.fillStyle = cg; ctx.fill();
    ctx.strokeStyle = P.outline; ctx.lineWidth = 2.2; ctx.stroke();
    // center placket
    ctx.strokeStyle = P.trim; ctx.lineWidth = 2.4; ctx.beginPath();
    ctx.moveTo(2, shoulderY + 16); ctx.lineTo(2, hipY + 24); ctx.stroke();
    // belt
    ctx.fillStyle = P.trimDark;
    ctx.fillRect(-24, tcy + 6, 50, 7);
    ctx.fillStyle = P.trim; ctx.fillRect(4, tcy + 5, 8, 9);
    ctx.restore();

    // ── SWORD ARM (behind blade) ──
    var shx = 24, shy = shoulderY + 22;
    var eLen = 34, fLen = 30;
    var ex = shx + Math.cos(armA) * eLen, ey = shy + Math.sin(armA) * eLen;
    var bend = guard ? -0.7 : -0.55;
    var hx = ex + Math.cos(armA + bend) * fLen, hy = ey + Math.sin(armA + bend) * fLen;
    // upper arm sleeve
    limb(ctx, shx, shy, ex, ey, 12, P.clothLight, P.outline);
    limb(ctx, ex, ey, hx, hy, 10, P.cloth, P.outline);
    // hand
    ellipse(ctx, hx, hy, 7, 7, 0, P.furLight, P.outline, 2);

    // ── BLADE ──
    var bl = 104;
    var bx = hx + Math.cos(bladeA) * bl, by = hy + Math.sin(bladeA) * bl;
    // guard (cross)
    var gx = hx + Math.cos(bladeA) * 10, gy = hy + Math.sin(bladeA) * 10;
    ctx.save();
    ctx.translate(gx, gy); ctx.rotate(bladeA);
    // hilt
    ctx.fillStyle = P.trim; ctx.fillRect(-8, -4, 16, 8);
    // crossguard
    ctx.fillStyle = P.trim; ctx.fillRect(6, -9, 5, 18);
    // blade
    var bladeG = grad(ctx, 0, -4, 0, 4, [[0, "#F4F6FA"], [0.5, "#C7CDD6"], [1, "#8A93A0"]]);
    ctx.fillStyle = bladeG;
    ctx.beginPath();
    ctx.moveTo(11, -4.5); ctx.lineTo(bl - 14, -3); ctx.lineTo(bl, 0); ctx.lineTo(bl - 14, 3); ctx.lineTo(11, 4.5);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "#5C636E"; ctx.lineWidth = 1.2; ctx.stroke();
    // fuller highlight
    ctx.strokeStyle = "rgba(255,255,255,.7)"; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(14, -1); ctx.lineTo(bl - 18, -0.5); ctx.stroke();
    ctx.restore();

    // ── FRONT LEG gripping rope ──
    limb(ctx, 10, hipY + 8, 20, -14, 15, P.fur, P.outline);
    ellipse(ctx, 22, -10, 11, 8, 0.08, P.furLight, P.outline, 2.4); // front paw

    // ── HEAD ──
    var headX = 20, headY = shoulderY - 20;
    ctx.save();
    ctx.translate(headX, headY);
    ctx.rotate(headTilt);

    // ears
    function ear(dx, sgn) {
      ctx.beginPath();
      ctx.moveTo(dx, -30);
      ctx.lineTo(dx + sgn * 20, -52);
      ctx.lineTo(dx + sgn * 26, -22);
      ctx.closePath();
      ctx.fillStyle = P.fur; ctx.fill();
      ctx.strokeStyle = P.outline; ctx.lineWidth = 2.4; ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(dx + sgn * 5, -30);
      ctx.lineTo(dx + sgn * 18, -46);
      ctx.lineTo(dx + sgn * 20, -27);
      ctx.closePath();
      ctx.fillStyle = "#D98C86"; ctx.fill();
    }
    ear(-12, -1); ear(16, 1);

    // skull
    var hg = grad(ctx, -30, -40, 30, 20, [[0, P.furLight], [0.5, P.fur], [1, P.furDark]]);
    ellipse(ctx, 2, -8, 30, 27, 0, hg, P.outline, 2.6);
    // muzzle pads
    ellipse(ctx, 18, 6, 14, 11, 0, P.belly);
    ellipse(ctx, 8, 10, 8, 8, 0, P.belly);
    // nose
    ctx.beginPath(); ctx.moveTo(26, 2); ctx.lineTo(31, 2); ctx.lineTo(28.5, 7); ctx.closePath();
    ctx.fillStyle = "#C86A72"; ctx.fill();
    // mouth
    ctx.strokeStyle = P.outline; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(28.5, 7); ctx.lineTo(28.5, 11); ctx.moveTo(28.5, 11); ctx.quadraticCurveTo(24, 14, 20, 12); ctx.moveTo(28.5, 11); ctx.quadraticCurveTo(33, 14, 36, 11); ctx.stroke();
    // whiskers
    ctx.strokeStyle = "rgba(255,255,255,.5)"; ctx.lineWidth = 1;
    for (var w = 0; w < 3; w++) {
      var wy = 3 + w * 4;
      ctx.beginPath(); ctx.moveTo(24, wy); ctx.lineTo(-6, wy - 4 + w * 3); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(30, wy); ctx.lineTo(52, wy - 6 + w * 4); ctx.stroke();
    }
    // eyes
    function eyeAt(ex2, ey2, wide) {
      ellipse(ctx, ex2, ey2, 7.5, 9 * Math.max(0.12, eye), 0, "#FFFFFF", P.outline, 1.6);
      if (eye > 0.25) {
        ellipse(ctx, ex2 + 1.5, ey2 + 0.5, 4.6, 6.5 * eye, 0, P.eye);
        ellipse(ctx, ex2 + 3, ey2 - 2.5, 1.8, 2.2, 0, "rgba(255,255,255,.9)");
      }
    }
    eyeAt(-6, -8); eyeAt(14, -8);
    if (p.angry) {
      ctx.strokeStyle = P.outline; ctx.lineWidth = 2.8; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(-14, -19); ctx.lineTo(-1, -14); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(21, -19); ctx.lineTo(8, -14); ctx.stroke();
      // gritted mouth
      ctx.fillStyle = "#5A2A2A";
      ctx.beginPath(); ctx.ellipse(28, 13, 4.5, 2.6, 0.1, 0, Math.PI * 2); ctx.fill();
    }

    // ── HEADGEAR ──
    if (id === "buy") {
      // turban
      ctx.beginPath();
      ctx.ellipse(2, -30, 33, 20, 0, Math.PI, 0);
      ctx.fillStyle = P.cloth; ctx.fill();
      ctx.strokeStyle = P.outline; ctx.lineWidth = 2.2; ctx.stroke();
      // wrap bands
      ctx.strokeStyle = P.clothLight; ctx.lineWidth = 3;
      for (var b = 0; b < 3; b++) { ctx.beginPath(); ctx.ellipse(2, -32 + b * 4, 31 - b, 15 - b, 0, Math.PI * 0.05, Math.PI * 0.95); ctx.stroke(); }
      // gold band + gem
      ctx.fillStyle = P.trim; ctx.fillRect(-26, -34, 56, 5);
      ellipse(ctx, 24, -31, 5, 5, 0, "#3FD98A", P.trimDark, 1.6);
    } else {
      // morion helmet with comb + plume
      ctx.beginPath();
      ctx.ellipse(2, -26, 34, 20, 0, Math.PI, 0);
      ctx.fillStyle = "#3A3F49"; ctx.fill();
      ctx.strokeStyle = P.outline; ctx.lineWidth = 2.4; ctx.stroke();
      // comb ridge
      ctx.beginPath(); ctx.moveTo(-6, -44); ctx.quadraticCurveTo(2, -56, 12, -44); ctx.lineTo(8, -40); ctx.quadraticCurveTo(2, -48, -2, -40); ctx.closePath();
      ctx.fillStyle = "#4A505B"; ctx.fill(); ctx.strokeStyle = P.outline; ctx.lineWidth = 1.8; ctx.stroke();
      // brim
      ctx.fillStyle = P.trim; ctx.fillRect(-30, -30, 64, 5);
      // plume
      ctx.beginPath(); ctx.moveTo(-2, -48); ctx.quadraticCurveTo(-18, -66, -30, -52); ctx.quadraticCurveTo(-14, -56, -4, -44); ctx.closePath();
      ctx.fillStyle = P.plume; ctx.fill(); ctx.strokeStyle = P.outline; ctx.lineWidth = 1.6; ctx.stroke();
    }
    ctx.restore(); // head

    ctx.restore(); // torso rotation

    // ── rim light (moonlit edge) ──
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = "rgba(240,210,150,.55)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(headX + 2, headY - 8, 30, Math.PI * 1.05, Math.PI * 1.5); ctx.stroke();
    ctx.restore();

    // ── hit flash ──
    if (hitFlash > 0.01) {
      ctx.save();
      ctx.globalAlpha = Math.min(0.6, hitFlash);
      ctx.globalCompositeOperation = "screen";
      ellipse(ctx, 2, (hipY + shoulderY) / 2, 46, 96, 0, "#ffffff");
      ctx.restore();
    }

    ctx.restore(); // squash
  }

  function bladePoint(pose) {
    var p = pose || {};
    var armA = p.armAngle != null ? p.armAngle : -0.35;
    var bladeA = p.bladeAngle != null ? p.bladeAngle : -1.0;
    var guard = !!p.guard;
    var crouch = p.crouch || 0, bob = p.bob || 0;
    var shoulderY = -150 - crouch * 8 + bob;
    var shx = 24, shy = shoulderY + 22, eLen = 34, fLen = 30;
    var ex = shx + Math.cos(armA) * eLen, ey = shy + Math.sin(armA) * eLen;
    var bend = guard ? -0.7 : -0.55;
    var hx = ex + Math.cos(armA + bend) * fLen, hy = ey + Math.sin(armA + bend) * fLen;
    return { hx: hx, hy: hy, tx: hx + Math.cos(bladeA) * 104, ty: hy + Math.sin(bladeA) * 104 };
  }

  window.CatArt = { drawCat: drawCat, PAL: PAL, bladePoint: bladePoint };
})();
