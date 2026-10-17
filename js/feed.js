/* ROPE DUEL - live BTC·USDT order-flow feed.
   Binance WS → Bybit WS → Gate WS → SIM tape (labeled). Zero deps. */
(function () {
  "use strict";

  var BINANCE_WS = ["wss://stream.binance.com:9443/stream", "wss://data-stream.binance.vision/stream"];
  var BYBIT_WS = "wss://stream.bybit.com/v5/public/spot";
  var GATE_WS = "wss://api.gateio.ws/ws/v4/";
  var WINDOW_MS = 30000;          // order-flow window
  var CANDLE_N = 150;             // 1s candles kept
  var STALE_MS = 8000;
  var CONNECT_TIMEOUT = 8000;
  var WHALE_USD = 50000;

  function BtcFeed(opts) {
    opts = opts || {};
    this.demo = !!opts.demo;
    this.onChange = opts.onChange || function () {};
    this.onStatus = opts.onStatus || function () {};
    this.onTape = opts.onTape || function () {};
    this.onWhale = opts.onWhale || function () {};

    this.ws = null;
    this.provider = null;          // 'BINANCE' | 'BYBIT' | 'GATE' | 'SIM'
    this.tries = 0;
    this.stopped = false;
    this.lastData = 0;
    this.pingTimer = 0;
    this.reconnectTimer = 0;
    this.connectWatch = 0;
    this.pingSecs = 0;

    this.price = 0;
    this.price24h = 0;
    this.trades = [];              // {t, side:'B'|'S', q, p}
    this._candles = [];             // {t,o,h,l,c,v}
    this.demoClock = 0;
    this.demoPrice = 68000 + Math.random() * 6000;
  }

  BtcFeed.prototype = {
    start: function () {
      this.stopped = false;
      if (this.demo) { this._simStatus("SIM"); this._startDemo(); return; }
      this._tryNext();
    },
    stop: function () {
      this.stopped = true;
      this._clearTimers();
      if (this.ws) { try { this.ws.close(); } catch (e) {} this.ws = null; }
    },
    candles: function () { return this._candles; },
    state: function () {
      var pressure = this._pressure();
      var trend = this._trend();
      return {
        price: this.price, chg24: this.price24h ? (this.price - this.price24h) / this.price24h * 100 : 0,
        pressure: pressure, trend: trend, provider: this.provider, live: this.provider && this.provider !== "SIM"
      };
    },
    _pressure: function () {
      var now = Date.now(), b = 0, s = 0;
      for (var i = this.trades.length - 1; i >= 0; i--) {
        var tr = this.trades[i];
        if (now - tr.t > WINDOW_MS) { this.trades.splice(0, i + 1); break; }
        if (tr.side === "B") b += tr.q; else s += tr.q;
      }
      var tot = b + s;
      return tot > 0 ? (b - s) / tot : 0;
    },
    _trend: function () {
      if (this._candles.length < 10) return 0;
      var a = this._candles[Math.max(0, this._candles.length - 31)].c;
      var b2 = this._candles[this._candles.length - 1].c;
      return a ? (b2 - a) / a : 0;
    },

    /* ── provider rotation ── */
    _tryNext: function () {
      if (this.stopped) return;
      var order = ["binance", "bybit", "gate", "binance", "bybit"];
      var kind = order[this.tries % order.length];
      this.tries++;
      if (this.tries > 12) { this._startDemo(); return; }
      var self = this;
      var url = kind === "binance" ? BINANCE_WS[this.tries % BINANCE_WS.length]
        : kind === "bybit" ? BYBIT_WS : GATE_WS;
      var ws;
      try { ws = new WebSocket(url); } catch (e) { return this._rotate(400); }
      this.ws = ws;
      this._provider = kind.toUpperCase();
      ws.onopen = function () {
        self._armWatchdog(kind);
        if (kind === "binance") {
          ws.send(JSON.stringify({ method: "SUBSCRIBE", params: ["btcusdt@trade", "btcusdt@ticker"], id: 1 }));
        } else if (kind === "bybit") {
          ws.send(JSON.stringify({ op: "subscribe", args: ["publicTrade.BTCUSDT", "tickers.BTCUSDT"] }));
        } else {
          ws.send(JSON.stringify({ time: Date.now(), channel: "spot.trades", event: "subscribe", payload: ["BTC_USDT"] }));
          ws.send(JSON.stringify({ time: Date.now(), channel: "spot.tickers", event: "subscribe", payload: ["BTC_USDT"] }));
        }
      };
      ws.onmessage = function (ev) { self._frame(ev.data, kind); };
      ws.onerror = function () {};
      ws.onclose = function () { if (!self.stopped) self._rotate(300); };
    },
    _armWatchdog: function (kind) {
      var self = this, ws = this.ws;
      clearTimeout(this.connectWatch);
      this.connectWatch = setTimeout(function () {
        if (self.ws === ws && self.lastData < Date.now() - CONNECT_TIMEOUT) { try { ws.close(); } catch (e) {} }
      }, CONNECT_TIMEOUT + 1200);
      clearInterval(this.pingTimer);
      var every = kind === "bybit" ? 20 : 30;
      this.pingSecs = 0;
      this.pingTimer = setInterval(function () {
        self.pingSecs += 5;
        if (self.pingSecs % every === 0 && ws.readyState === 1) {
          if (kind === "bybit") ws.send(JSON.stringify({ op: "ping" }));
          else if (kind === "binance") ws.send(JSON.stringify({ method: "LIST_SUBSCRIPTIONS", id: 9 }));
          else ws.send(JSON.stringify({ time: Date.now(), channel: "spot.ping" }));
        }
        if (self.lastData && Date.now() - self.lastData > STALE_MS && self.ws === ws) {
          try { ws.close(); } catch (e) {}
        }
      }, 5000);
    },
    _rotate: function (ms) {
      this._clearTimers();
      var self = this;
      this.reconnectTimer = setTimeout(function () { self._tryNext(); }, ms);
    },
    _clearTimers: function () {
      clearTimeout(this.connectWatch); clearTimeout(this.reconnectTimer); clearInterval(this.pingTimer);
    },

    /* ── frame parsing ── */
    _frame: function (raw, kind) {
      var msg;
      try { msg = JSON.parse(raw); } catch (e) { return; }
      var trade = null, tick = null;
      if (kind === "binance") {
        if (!msg.data) return;
        var d = msg.data;
        if (d.e === "trade") trade = { side: d.m ? "S" : "B", p: +d.p, q: +d.q };
        else if (d.e === "24hrTicker") tick = { p: +d.c, o: +d.o };
      } else if (kind === "bybit") {
        if (msg.topic && msg.topic.indexOf("publicTrade") === 0) {
          for (var i = 0; i < msg.data.length; i++) {
            var t = msg.data[i];
            this._trade({ side: t.S === "Buy" ? "B" : "S", p: +t.p, q: +t.v });
          }
          return;
        }
        if (msg.topic && msg.topic.indexOf("tickers") === 0) tick = { p: +msg.data.lastPrice, o: +msg.data.prevPrice24h };
      } else if (kind === "gate") {
        if (msg.channel === "spot.trades") { var td = msg.data; trade = { side: td.side === "buy" ? "B" : "S", p: +td.price, q: +td.amount }; }
        else if (msg.channel === "spot.tickers") tick = { p: +msg.data.last, o: +msg.data.change_percentage };
      }
      if (trade) this._trade(trade);
      if (tick) {
        if (!this.price24h && tick.o) this.price24h = tick.o;
        this._price(+tick.p);
      }
    },
    _trade: function (t) {
      if (!t.p || !t.q) return;
      this.lastData = Date.now();
      var usd = t.p * t.q;
      this.trades.push({ t: this.lastData, side: t.side, q: t.q, p: t.p });
      if (this.trades.length > 2400) this.trades.splice(0, 400);
      if (usd >= WHALE_USD && this.onWhale) this.onWhale({ side: t.side, usd: usd, p: t.p, q: t.q });
      this.onTape({ side: t.side, p: t.p, q: t.q, usd: usd });
      this._price(t.p, true);
    },
    _price: function (p, fromTrade) {
      if (!p || p <= 0) return;
      var first = !this.price;
      this.price = p;
      this.lastData = Date.now();
      if (this.provider !== this._provider && this._provider) {
        this.provider = this._provider;
        this._seedCandles();
        this.onStatus({ provider: this.provider, live: true });
      }
      this._foldCandle(p, fromTrade);
      if (first || Date.now() - (this._lastEmit || 0) > 250) {
        this._lastEmit = Date.now();
        this.onChange(this.state());
      }
    },
    _seedCandles: function () {
      var now = Math.floor(Date.now() / 1000);
      this._candles = [];
      var p = this.price;
      for (var i = CANDLE_N; i >= 0; i--) {
        var c = { t: now - i, o: p, h: p, l: p, c: p, v: 0 };
        this._candles.push(c);
      }
    },
    _foldCandle: function (p, trade) {
      var now = Math.floor(Date.now() / 1000);
      if (!this._candles.length) { this._seedCandles(); }
      var last = this._candles[this._candles.length - 1];
      if (now > last.t) {
        this._candles.push({ t: now, o: last.c, h: Math.max(last.c, p), l: Math.min(last.c, p), c: p, v: 0 });
        if (this._candles.length > CANDLE_N) this._candles.shift();
      } else {
        last.c = p;
        last.h = Math.max(last.h, p); last.l = Math.min(last.l, p);
      }
    },

    /* ── simulation tape (offline fallback) ── */
    _startDemo: function () {
      if (this.demoClock) return;
      this.provider = "SIM";
      this._provider = "SIM";
      this.price24h = this.demoPrice;
      this.onStatus({ provider: "SIM", live: false });
      this._seedCandles();
      var self = this;
      this.demoClock = setInterval(function () { self._simTick(); }, 250);
    },
    _simStatus: function () { this.onStatus({ provider: "SIM", live: false }); },
    _simTick: function () {
      var drift = (Math.random() - 0.5) * 2;
      var swing = Math.sin(Date.now() / 9000) * 0.8;
      this.demoPrice = Math.max(1000, this.demoPrice * (1 + (drift * 0.00006 + swing * 0.00004)));
      var side = drift + swing > 0 ? "B" : "S";
      var q = Math.pow(Math.random(), 3) * 0.6 + 0.004;
      this._trade({ side: side, p: this.demoPrice, q: q });
    }
  };

  window.BtcFeed = BtcFeed;
})();
