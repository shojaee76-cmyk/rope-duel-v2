/* ROPE DUEL - fight director. Market pressure picks the attacker; the reply matches the attack. */
(function () {
  "use strict";

  var MOVES = {
    LUNGE:  { dur: 0.86, wind: 0.34, strike: 0.28, rec: 0.24, reach: 1.00, dmg: 14, travel: 0.55 },
    SLASH:  { dur: 0.72, wind: 0.22, strike: 0.26, rec: 0.24, reach: 0.92, dmg: 11, travel: 0.30 },
    THRUST: { dur: 0.58, wind: 0.18, strike: 0.18, rec: 0.22, reach: 1.06, dmg: 9,  travel: 0.42 },
    FEINT:  { dur: 0.80, wind: 0.26, strike: 0.18, rec: 0.36, reach: 0.60, dmg: 0,  travel: 0.34 },
    SPIN:   { dur: 0.96, wind: 0.30, strike: 0.34, rec: 0.32, reach: 0.95, dmg: 13, travel: 0.24 }
  };
  var OFFENSE = ["LUNGE", "SLASH", "THRUST", "FEINT", "SPIN"];
  var REACTION = {
    LUNGE: "PARRY_HOP", SLASH: "PARRY_BEAT", THRUST: "PARRY_BEAT",
    FEINT: "PARRY_BEAT", SPIN: "PARRY_HOP"
  };
  var REPLY_ODDS = { LUNGE: 0.58, SLASH: 0.5, THRUST: 0.62, FEINT: 0.78, SPIN: 0.44 };
  var HP_MAX = 100;

  var smooth = function (t) { return t * t * (3 - 2 * t); };
  var easeOut = function (t) { return 1 - Math.pow(1 - t, 3); };

  function Duel(opts) {
    opts = opts || {};
    this.onEvent = opts.onEvent || function () {};
    this.onState = opts.onState || function () {};
    this.baseGap = 250;
    this.stageW = 1000;
    this.stageH = 700;
    this.time = 0;
    this.pressure = 0;      // raw, from feed
    this.pS = 0;            // smoothed
    this.forced = null;     // probe override
    this.neutralSide = "sell";
    this.trend = 0;
    this.lane = 0;
    this.rounds = { buy: 0, sell: 0 };
    this.roundOver = false;
    this.roundEndsAt = 0;
    this.lock = null;
    this.nextBeat = 0.6;
    this.cats = {
      buy: this._cat("buy"),
      sell: this._cat("sell")
    };
    this.pairGap = this.baseGap;
    this.phase = "circle";
    this.phaseT = 0;
    this.bar = 1.9;
    this.contacts = { hit: 0, block: 0, lock: 0, whiff: 0 };
    this.attacks = { buy: 0, sell: 0 };
  }

  Duel.prototype._cat = function (side) {
    return {
      side: side, x: 0, hp: HP_MAX, state: "idle", stateT: 0, stateDur: 0.6,
      move: null, moveT: 0, act: "idle", hitFlash: 0, blink: 1, blinkAt: 2 + Math.random() * 3,
      tailPhase: Math.random() * 6, rounds: 0, bladeDrop: 0, fall: 0, win: 0
    };
  };

  Duel.prototype.layout = function (w, h) {
    this.stageW = w; this.stageH = h;
    this.baseGap = Math.min(300, Math.max(170, w * 0.26));
  };

  Duel.prototype.setMarket = function (s) {
    if (this.forced != null) { this.pressure = this.forced; this.trend = this.forced * 0.0004; return; }
    this.pressure = s.pressure || 0;
    this.trend = s.trend || 0;
  };

  Duel.prototype.reset = function () {
    this.cats.buy = this._cat("buy");
    this.cats.sell = this._cat("sell");
    this.roundOver = false;
    this.lock = null;
    this.nextBeat = this.time + 0.5;
    this.phase = "circle"; this.phaseT = 0;
    this.contacts = { hit: 0, block: 0, lock: 0, whiff: 0 };
    this.attacks = { buy: 0, sell: 0 };
  };

  Duel.prototype._busy = function (c) {
    return c.state === "windup" || c.state === "swing" || c.state === "recover" ||
      c.state === "hit" || c.state === "ko" || c.state === "win" || c.state === "guard" || c.state === "hop";
  };

  Duel.prototype._startMove = function (side, move) {
    var c = this.cats[side], spec = MOVES[move];
    if (!spec) return false;
    if (this.roundOver) return false;
    if (c.state === "hit" || c.state === "ko" || c.state === "win") return false;
    if (this.lock) return false;
    c.state = "windup"; c.stateT = 0; c.stateDur = spec.dur;
    c.move = move; c.moveT = 0;
    this.attacks[side]++;
    this.onEvent({ type: "attack", side: side, move: move });
    // defender reply: matches the attack
    var foeSide = side === "buy" ? "sell" : "buy";
    var foe = this.cats[foeSide];
    var odds = REPLY_ODDS[move] || 0.5;
    var canReply = foe.state === "idle" || foe.state === "recover"; // a fighter cancels recovery into a guard
    if (canReply && Math.random() < odds) {
      foe.state = move === "SPIN" || move === "LUNGE" ? "hop" : "guard";
      foe.stateT = 0; foe.stateDur = move === "SPIN" ? 0.62 : 0.55;
      this.onEvent({ type: "reply", side: foeSide, move: REACTION[move] });
    }
    return true;
  };

  Duel.prototype._resolve = function (attackerSide) {
    var a = this.cats[attackerSide];
    var d = this.cats[attackerSide === "buy" ? "sell" : "buy"];
    var spec = MOVES[a.move];
    if (!spec) return;
    var facing = attackerSide === "buy" ? 1 : -1;
    var gap = Math.abs(d.x - a.x);
    var reach = this.baseGap * spec.reach;
    var guarding = d.state === "guard";
    var hopping = d.state === "hop";
    var out;

    if (guarding) {
      // a real guard in the way wins over a body contact
      if (gap <= reach) {
        if (Math.random() < 0.28) { out = "lock"; }
        else out = "block";
      } else out = "whiff";
    } else if (hopping) {
      out = "whiff";
    } else if (gap <= reach) {
      out = "hit";
    } else {
      out = "whiff";
    }

    this.contacts[out]++;
    if (out === "hit") {
      d.hp = Math.max(0, d.hp - spec.dmg);
      d.state = "hit"; d.stateT = 0; d.stateDur = 0.42;
      d.hitFlash = 1;
      this.onEvent({ type: "hit", side: attackerSide, foe: d.side, dmg: spec.dmg, hp: d.hp });
      if (d.hp <= 0) this._ko(d.side, attackerSide);
    } else if (out === "block") {
      this.onEvent({ type: "block", side: attackerSide, foe: d.side });
    } else if (out === "lock") {
      this.lock = { t: 0, dur: 0.46 + Math.random() * 0.12, a: attackerSide, d: d.side };
      a.state = "recover"; a.stateT = 0; a.stateDur = 0.5;
      d.state = "guard"; d.stateT = 0; d.stateDur = 0.55;
      this.onEvent({ type: "lock", side: attackerSide, foe: d.side });
    } else {
      this.onEvent({ type: "whiff", side: attackerSide, foe: d.side });
    }
  };

  Duel.prototype._ko = function (loserSide, winnerSide) {
    var l = this.cats[loserSide], w = this.cats[winnerSide];
    l.state = "ko"; l.stateT = 0; l.stateDur = 3.2;
    w.state = "win"; w.stateT = 0; w.stateDur = 3.2;
    this.roundOver = true;
    this.roundEndsAt = this.time + 3.0;
    this.rounds[winnerSide]++;
    this.onEvent({ type: "ko", winner: winnerSide, loser: loserSide });
  };

  Duel.prototype.update = function (dt, market) {
    this.time += dt;
    if (market) this.setMarket(market);
    var k = Math.min(1, dt * 1.2);
    this.pS += (this.pressure - this.pS) * k;
    this.lane += (this.trend * 900 - this.lane) * Math.min(1, dt * 0.8);

    // pair locomotion: circle -> engage -> break shares of one bar
    this.phaseT += dt;
    if (this.phaseT > this.bar) {
      this.phaseT = 0;
      this.phase = this.phase === "circle" ? "engage" : this.phase === "engage" ? "break" : "circle";
    }
    var share = this.phase === "circle" ? 0.55 : this.phase === "engage" ? 0.30 : 0.15;
    var targetGap = this.baseGap * (this.phase === "engage" ? 0.72 : this.phase === "circle" ? 1.0 : 1.12);
    var rate = targetGap < this.pairGap ? 2.6 : 1.7;
    var remain = targetGap - this.pairGap;
    this.pairGap += Math.sign(remain) * Math.min(Math.abs(remain), Math.abs(remain) * Math.min(1, rate * dt) + 2 * dt);
    this.bar = 1.7 + Math.abs(this.pS) * 0.5;

    // positions
    var cx = this.stageW / 2 + this.lane;
    this.cats.buy.x = cx - this.pairGap / 2;
    this.cats.sell.x = cx + this.pairGap / 2;

    // beat clock: schedule, never queue
    if (!this.roundOver && !this.lock && this.time >= this.nextBeat) {
      var attacker = this.pS > 0.06 ? "buy" : this.pS < -0.06 ? "sell" : (this.neutralSide = this.neutralSide === "buy" ? "sell" : "buy");
      var side = attacker;
      var c = this.cats[side];
      var foe = this.cats[side === "buy" ? "sell" : "buy"];
      var canAct = !this._busy(c) && foe.state !== "hit" && foe.state !== "ko";
      if (canAct) {
        var move = OFFENSE[Math.floor(Math.random() * OFFENSE.length)];
        this._startMove(side, move);
        this.nextBeat = this.time + 0.62 + Math.random() * 0.42;
      } else {
        this.nextBeat = this.time + 0.16; // skip, never save
      }
    }

    // blade lock clock
    if (this.lock) {
      this.lock.t += dt;
      if (this.lock.t >= this.lock.dur) { this.lock = null; this.onEvent({ type: "unlock" }); }
    }

    // per-cat state machines
    var self = this;
    ["buy", "sell"].forEach(function (side) { self._tickCat(self.cats[side], dt); });

    if (this.roundOver && this.time >= this.roundEndsAt) {
      this.roundOver = false;
      var b = this.rounds.buy, s = this.rounds.sell;
      this.cats.buy = this._cat("buy"); this.cats.sell = this._cat("sell");
      this.cats.buy.rounds = b; this.cats.sell.rounds = s;
      this.lock = null; this.nextBeat = this.time + 0.5;
      this.onEvent({ type: "round", winner: null });
    }
  };

  Duel.prototype._tickCat = function (c, dt) {
    c.stateT += dt;
    c.tailPhase += dt * (1.6 + (c.state === "idle" ? 0.8 : 0));
    c.blinkAt -= dt;
    if (c.blinkAt <= 0) { c.blink = 0; if (c.blinkAt < -0.12) { c.blink = 1; c.blinkAt = 2.2 + Math.random() * 3.4; } }
    c.hitFlash = Math.max(0, c.hitFlash - dt * 2.6);

    if (c.state === "windup" && c.stateT >= MOVES[c.move].wind) { c.state = "swing"; c.stateT = 0; }
    else if (c.state === "swing" && c.stateT >= MOVES[c.move].strike) {
      c.state = "recover"; c.stateT = 0;
      this._resolve(c.side);
    } else if (c.state === "recover" && c.stateT >= MOVES[c.move].rec) { c.state = "idle"; c.stateT = 0; c.move = null; }
    else if (c.state === "hit" && c.stateT >= c.stateDur) { c.state = "idle"; c.stateT = 0; }
    else if (c.state === "guard" && c.stateT >= c.stateDur) { c.state = "idle"; c.stateT = 0; }
    else if (c.state === "hop" && c.stateT >= c.stateDur) { c.state = "idle"; c.stateT = 0; }
    else if (c.state === "ko" && c.stateT >= c.stateDur) { c.state = "ko"; c.stateT = c.stateDur; }
    else if (c.state === "win" && c.stateT >= c.stateDur) { c.state = "win"; c.stateT = c.stateDur; }
  };

  Duel.prototype.pose = function (side, t) {
    var c = this.cats[side];
    var idle = {
      lean: 0.02 + Math.sin(t * 1.7 + (side === "buy" ? 0 : 2)) * 0.012,
      crouch: 0.06, bob: Math.sin(t * 2.1 + (side === "buy" ? 0 : 1.4)) * 1.6,
      headTilt: Math.sin(t * 1.3) * 0.02, tail: Math.sin(c.tailPhase), eye: c.blink,
      armAngle: -0.35, bladeAngle: -1.0, guard: false, hitFlash: c.hitFlash,
      squashX: 1, squashY: 1, fall: 0
    };
    var st = c.state, p = Object.assign({}, idle);

    if (st === "windup") {
      var f = smooth(Math.min(1, c.stateT / MOVES[c.move].wind));
      p.lean = 0.02 - 0.12 * f;
      p.crouch = 0.06 + 0.22 * f;
      p.armAngle = -0.35 - 1.05 * f;
      p.bladeAngle = -1.0 - 1.3 * f;
      p.bob -= 3 * f;
      p.headTilt = -0.05 * f;
      p.squashY = 1 - 0.05 * f;
    } else if (st === "swing") {
      var g = smooth(Math.min(1, c.stateT / MOVES[c.move].strike));
      var thrust = c.move === "THRUST";
      p.lean = -0.10 + (thrust ? 0.20 : 0.34) * g;
      p.crouch = 0.28 - 0.20 * g;
      p.armAngle = -1.4 + (thrust ? 1.55 : 1.8) * g;
      p.bladeAngle = -2.3 + (thrust ? 2.45 : 2.9) * g;
      p.bob += 4 * g;
      p.headTilt = 0.06 * g;
      p.squashX = 1 + 0.06 * g;
      p.squashY = 0.95 + 0.06 * g;
    } else if (st === "recover") {
      var h = easeOut(Math.min(1, c.stateT / MOVES[c.move].rec));
      p.lean = 0.24 * (1 - h) + 0.02;
      p.crouch = 0.08 * (1 - h) + 0.06;
      p.armAngle = 0.15 * (1 - h) + -0.35 * h;
      p.bladeAngle = 0.6 * (1 - h) + -1.0 * h;
    } else if (st === "guard") {
      p.lean = -0.06; p.crouch = 0.26;
      p.armAngle = -0.9; p.bladeAngle = -1.55; p.guard = true;
      p.headTilt = -0.03;
      p.bob -= 2;
    } else if (st === "hop") {
      var j = smooth(Math.min(1, c.stateT / 0.2)) * (1 - smooth(Math.max(0, (c.stateT - 0.2) / 0.42)));
      p.lean = -0.14 * j; p.crouch = 0.2 + 0.1 * j;
      p.armAngle = -0.85; p.bladeAngle = -1.5; p.guard = true;
      p.bob -= 12 * j;
    } else if (st === "hit") {
      var q = easeOut(Math.min(1, c.stateT / 0.28));
      p.lean = -0.26 * q; p.crouch = 0.18 + 0.1 * q;
      p.headTilt = -0.18 * q; p.armAngle = -0.1; p.bladeAngle = -0.15;
      p.bob -= 4 * q; p.squashX = 1 + 0.08 * q; p.squashY = 1 - 0.08 * q;
    } else if (st === "ko") {
      var k2 = easeOut(Math.min(1, c.stateT / 0.6));
      p.fall = -1.15 * k2;
      p.lean = -0.3; p.crouch = 0.5; p.eye = 0.15;
      p.armAngle = 0.35; p.bladeAngle = 0.95;
      p.bob = 10 * k2;
    } else if (st === "win") {
      p.lean = -0.06; p.crouch = 0.02;
      p.armAngle = -1.0; p.bladeAngle = -1.95;
      p.bob = Math.sin(t * 3) * 3;
      p.headTilt = -0.08;
    }
    // body commitment + expression
    if (st === "windup") p.lungeX = -7 * smooth(Math.min(1, c.stateT / MOVES[c.move].wind));
    else if (st === "swing") p.lungeX = 26 * (MOVES[c.move].travel || 0.4) * smooth(Math.min(1, c.stateT / MOVES[c.move].strike));
    else if (st === "guard") p.lungeX = -4;
    else if (st === "hop") p.lungeX = -14;
    else if (st === "hit") p.lungeX = -12 * easeOut(Math.min(1, c.stateT / 0.28));
    else if (st === "ko") p.lungeX = -16 * easeOut(Math.min(1, c.stateT / 0.6));
    else p.lungeX = 0;
    p.angry = st === "windup" || st === "swing" || st === "recover" || st === "guard" || st === "hop" || c.hp < 50;
    return p;
  };

  window.Duel = Duel;
  window.DUEL_MOVES = MOVES;
})();
