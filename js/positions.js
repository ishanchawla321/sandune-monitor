// Positions engine: derives each holding's position from the transaction blotter, and posts new blotter
// entries to the book. Pure functions, no DOM. Works in the browser (window.Positions) and in Node.
//
// A transaction: { id, date, holding_id, type, quantity, price, amount, note }
//   type: buy, sell, dividend, coupon, interest, capital_call, distribution, fee
//   quantity is shares, or face for bonds and T-bills; price is per share, or per 100 of face.
//   amount is dollars; when null it is quantity x price (x 1/100 for bonds and T-bills).
//
// The book (holdings[].quantity, cost, unfunded, and the cash balance) is what Metrics reads. The seed
// blotter reconciles to the seed book exactly. post() and unpost() keep them reconciled afterwards by
// applying the change each entry makes; income already in the book is never added to cash twice.
(function (root) {
  "use strict";

  const Metrics = root.Metrics || (typeof require !== "undefined" ? require("./metrics.js") : null);

  const TYPES = ["buy", "sell", "dividend", "coupon", "interest", "capital_call", "distribution", "fee"];
  const LABELS = { buy: "Buy", sell: "Sell", dividend: "Dividend", coupon: "Coupon", interest: "Interest",
                   capital_call: "Capital call", distribution: "Distribution", fee: "Fee" };
  const INCOME = ["dividend", "coupon", "interest", "distribution"];
  const OUTFLOW = ["buy", "capital_call", "fee"];

  const num = v => (v === null || v === undefined || v === "" || !isFinite(v) ? 0 : Number(v));
  const r2 = v => Math.round(v * 100) / 100;
  const perHundred = h => h.security_type === "bond" || h.security_type === "t_bill";
  const isUnit = h => Metrics.isPriced(h);

  function amountOf(t, h) {
    if (t.amount !== null && t.amount !== undefined && t.amount !== "" && isFinite(t.amount)) return Number(t.amount);
    const q = num(t.quantity), p = num(t.price);
    return h && perHundred(h) ? q * p / 100 : q * p;
  }
  // Signed effect on the cash balance: buys, calls and fees pay out; sales and income come in.
  function cashEffect(t, h) { const a = amountOf(t, h); return OUTFLOW.includes(t.type) ? -a : a; }

  function addYears(iso, n) {
    const d = new Date(iso + "T00:00:00Z");
    d.setUTCFullYear(d.getUTCFullYear() + n);
    return d.toISOString().slice(0, 10);
  }
  function addMonths(iso, n) {
    const [y, m, day] = iso.split("-").map(Number);
    const total = y * 12 + (m - 1) + n;
    const ny = Math.floor(total / 12), nm = total - ny * 12 + 1;
    const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
    return `${ny}-${String(nm).padStart(2, "0")}-${String(Math.min(day, last)).padStart(2, "0")}`;
  }

  function empty(h) {
    const by = {};
    INCOME.forEach(k => { by[k] = { itd: 0, ltm: 0 }; });
    return { holding_id: h.id, n_tx: 0, quantity: 0, cost_basis: 0, avg_cost: null, realized_pnl: 0, proceeds: 0,
             invested: 0, paid_in: 0, calls_itd: 0, income_itd: 0, income_ltm: 0, by_type: by, fees_itd: 0, fees_ltm: 0,
             first_date: null, last_date: null, last_income_date: null, lots: [] };
  }

  const order = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0);

  // Positions keyed by holding id. Sells use the weighted average cost of the units held at the time;
  // a sell with no lots on the blotter falls back to the book's average cost.
  function compute(holdings, transactions, asOf) {
    const byId = new Map(holdings.map(h => [h.id, h]));
    const pos = {};
    holdings.forEach(h => { pos[h.id] = empty(h); });
    const ltmStart = addYears(asOf, -1);
    (transactions || []).slice().sort(order).forEach(t => {
      const h = byId.get(t.holding_id);
      if (!h || !TYPES.includes(t.type)) return;
      const p = pos[h.id], a = amountOf(t, h), q = num(t.quantity);
      const ltm = t.date > ltmStart && t.date <= asOf;
      p.n_tx += 1;
      p.first_date = p.first_date || t.date;
      p.last_date = t.date;
      if (t.type === "buy") {
        if (isUnit(h)) p.quantity += q; else p.paid_in += a;
        p.cost_basis += a;
        p.invested += a;
        p.lots.push({ id: t.id, date: t.date, quantity: q, price: t.price, amount: a });
      } else if (t.type === "sell") {
        let basis;
        if (isUnit(h)) {
          const avg = p.quantity > 0 ? p.cost_basis / p.quantity : (num(h.quantity) ? num(h.cost) / num(h.quantity) : 0);
          basis = q * avg;
          p.quantity -= q;
        } else {
          basis = Math.min(a, p.cost_basis);
        }
        p.cost_basis -= basis;
        p.realized_pnl += a - basis;
        p.proceeds += a;
      } else if (t.type === "capital_call") {
        p.cost_basis += a; p.paid_in += a; p.calls_itd += a; p.invested += a;
      } else if (t.type === "fee") {
        p.fees_itd += a;
        if (ltm) p.fees_ltm += a;
      } else {
        p.income_itd += a;
        p.by_type[t.type].itd += a;
        if (ltm) { p.income_ltm += a; p.by_type[t.type].ltm += a; }
        p.last_income_date = t.date;
      }
    });
    Object.values(pos).forEach(p => {
      const h = byId.get(p.holding_id);
      p.avg_cost = isUnit(h) && p.quantity > 0 ? (perHundred(h) ? p.cost_basis / p.quantity * 100 : p.cost_basis / p.quantity) : null;
    });
    return pos;
  }

  // Holdings whose book values differ from what the blotter derives. Holdings with no entries are skipped
  // (a holding added by hand has a book position but no history yet).
  function reconcile(holdings, transactions, asOf) {
    const pos = compute(holdings, transactions, asOf);
    const out = [];
    holdings.forEach(h => {
      const p = pos[h.id];
      if (!p || !p.n_tx || h.security_type === "cash") return;
      const diff = (field, book, blotter, tol) => { if (Math.abs(book - blotter) > tol) out.push({ id: h.id, field, book, blotter }); };
      if (isUnit(h)) diff("quantity", num(h.quantity), p.quantity, 1e-6);
      if (p.lots.length || p.calls_itd) diff("cost", num(h.cost), p.cost_basis, 0.5);
      if (h.commitment !== null && h.commitment !== undefined && p.calls_itd) diff("unfunded", num(h.unfunded), num(h.commitment) - p.paid_in, 0.5);
    });
    return out;
  }

  // ---- Posting to the book ----
  function bookDelta(state, h, before, after) {
    if (isUnit(h)) h.quantity = num(h.quantity) + (after.quantity - before.quantity);
    if (h.security_type !== "cash") h.cost = r2(num(h.cost) + (after.cost_basis - before.cost_basis));
    if (h.commitment !== null && h.commitment !== undefined) h.unfunded = r2(Math.max(0, num(h.unfunded) - (after.paid_in - before.paid_in)));
  }
  function moveCash(state, delta) {
    const cash = state.holdings.find(x => x.security_type === "cash");
    if (!cash) return;
    cash.price_or_mark = r2(num(cash.price_or_mark) + delta);
    cash.cost = cash.price_or_mark;
  }

  // Append a transaction and apply its effect to the holding and to cash. Returns the stored entry.
  function post(state, tx) {
    const h = state.holdings.find(x => x.id === tx.holding_id);
    if (!h) return null;
    state.transactions = state.transactions || [];
    const entry = Object.assign({ id: "tx-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) }, tx);
    entry.amount = r2(amountOf(entry, h));
    const before = compute([h], state.transactions, state.as_of)[h.id];
    state.transactions.push(entry);
    const after = compute([h], state.transactions, state.as_of)[h.id];
    bookDelta(state, h, before, after);
    moveCash(state, cashEffect(entry, h));
    return entry;
  }

  // Remove a transaction and reverse its effect.
  function unpost(state, id) {
    const i = (state.transactions || []).findIndex(t => t.id === id);
    if (i < 0) return null;
    const entry = state.transactions[i];
    const h = state.holdings.find(x => x.id === entry.holding_id);
    if (!h) { state.transactions.splice(i, 1); return entry; }
    const before = compute([h], state.transactions, state.as_of)[h.id];
    state.transactions.splice(i, 1);
    const after = compute([h], state.transactions, state.as_of)[h.id];
    bookDelta(state, h, before, after);
    moveCash(state, -cashEffect(entry, h));
    return entry;
  }

  // ---- Bond math (30/360, semiannual by default). Prices per 100 of face. ----
  function days360(a, b) {
    const [y1, m1, d1r] = a.split("-").map(Number), [y2, m2, d2r] = b.split("-").map(Number);
    const d1 = Math.min(d1r, 30), d2 = d1 === 30 ? Math.min(d2r, 30) : d2r;
    return (y2 - y1) * 360 + (m2 - m1) * 30 + (d2 - d1);
  }
  function couponDates(h, asOf) {
    if (!h.maturity) return null;
    const freq = Number(h.coupon_freq) || 2, step = 12 / freq;
    let next = h.maturity, last = addMonths(next, -step);
    while (last > asOf) { next = last; last = addMonths(last, -step); }
    return { last, next, freq, step };
  }
  // Accrued interest in dollars on `face` since the last coupon date.
  function accrued(h, asOf, face) {
    const c = couponDates(h, asOf);
    if (!c || !h.coupon) return 0;
    return face * Number(h.coupon) * days360(c.last, asOf) / 360;
  }
  // Yield to maturity (annual, compounded per coupon period) from the clean price, street convention.
  function ytm(h, cleanPrice, asOf) {
    const c = couponDates(h, asOf);
    if (!c || !h.coupon || !(cleanPrice > 0) || h.maturity <= asOf) return null;
    const cpn = 100 * Number(h.coupon) / c.freq;
    const dirty = cleanPrice + accrued(h, asOf, 100);
    const w = days360(asOf, c.next) / (360 / c.freq);
    const flows = [];
    for (let d = c.next, k = 0; d <= h.maturity && k < 400; d = addMonths(d, c.step), k++) flows.push(cpn + (d === h.maturity ? 100 : 0));
    const pv = y => flows.reduce((s, cf, k) => s + cf / Math.pow(1 + y / c.freq, w + k), 0);
    let lo = -0.5, hi = 2;
    for (let i = 0; i < 100; i++) { const mid = (lo + hi) / 2; if (pv(mid) > dirty) lo = mid; else hi = mid; }
    return (lo + hi) / 2;
  }
  // T-bill bond-equivalent yield from price per 100 and maturity.
  function billYield(h, price, asOf) {
    if (!h.maturity || !(price > 0) || h.maturity <= asOf) return null;
    const days = (new Date(h.maturity + "T00:00:00Z") - new Date(asOf + "T00:00:00Z")) / 864e5;
    return days > 0 ? (100 - price) / price * 365 / days : null;
  }

  const Positions = { TYPES, LABELS, INCOME, OUTFLOW, amountOf, cashEffect, compute, reconcile, post, unpost,
                      couponDates, accrued, ytm, billYield, days360, addMonths, addYears };
  if (typeof module !== "undefined" && module.exports) module.exports = Positions;
  else root.Positions = Positions;
})(typeof window !== "undefined" ? window : this);
