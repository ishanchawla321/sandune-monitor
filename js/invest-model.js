// Marking an investment Invested: creates (or reuses) its holding in the book, posts the buy or capital
// call and the funding sale to the blotter, and records what was done so it can be reversed exactly.
// Pure functions, no DOM. Works in the browser (window.InvestModel) and in Node.
(function (root) {
  "use strict";

  const Metrics = root.Metrics || (typeof require !== "undefined" ? require("./metrics.js") : null);
  const Positions = root.Positions || (typeof require !== "undefined" ? require("./positions.js") : null);
  const PFM = root.ProFormaModel || (typeof require !== "undefined" ? require("./proforma-model.js") : null);

  const num = (v, d) => (v === null || v === undefined || v === "" || !isFinite(v) ? d : Number(v));
  const r2 = v => Math.round(v * 100) / 100;
  const isPublic = inv => inv.asset_class === "public_equity" || inv.type === "public";

  // Default funded amount for the form: check size x funded %.
  function defaultAmount(inv) {
    return num(inv.check_size, 0) * num(inv.funded_pct, 1);
  }

  // The holding an investment becomes. Public investments enter liquid today; everything else is 3y_plus
  // until date + hold months. A priced security with a unit price is bought at that price; anything else
  // is carried at the funded amount. Quantity, cost and unfunded are filled in by the blotter posting.
  function newHolding(inv, date, amount) {
    const pub = isPublic(inv);
    const check = num(inv.check_size, amount);
    const commitment = pub ? null : Math.max(check, amount);
    const h = {
      id: "h-" + inv.id, from_investment: inv.id,
      asset_class: inv.asset_class, name: inv.name, ticker_or_id: inv.ticker_or_id, security_type: inv.security_type,
      sector: inv.sector, price_or_mark: amount, quantity: 0, market_value: null, cost: 0,
      commitment, unfunded: commitment === null ? 0 : commitment, // the posting draws the funded amount down
      call_schedule: commitment !== null && commitment > amount ? (inv.call_schedule || [1, 0, 0]) : null,
      liquidity_bucket: pub ? "liquid_now" : "3y_plus",
      liquidity_date: pub ? date : PFM.addMonths(date, num(inv.hold_months, 60)),
      mark_source: "Funded at cost", mark_date: date
    };
    if (Metrics.isPriced(h) && num(inv.price_or_mark, 0) > 0) h.price_or_mark = inv.price_or_mark;
    else if (Metrics.isPriced(h)) h.security_type = "basket"; // no unit price: carried at the funded amount
    return h;
  }

  // Buy or capital call for the new holding, in blotter form.
  function fundingEntry(h, inv, date, amount) {
    const call = h.commitment !== null && h.commitment > amount;
    const t = { date, holding_id: h.id, type: call ? "capital_call" : "buy", quantity: null, price: null, amount: r2(amount),
                note: `${call ? "First capital call" : "Purchase"}: marked as funded in Opportunities > Ideas` };
    if (Metrics.isPriced(h) && h.security_type !== "basket") {
      const unit = h.security_type === "bond" || h.security_type === "t_bill" ? h.price_or_mark / 100 : h.price_or_mark;
      t.quantity = amount / unit; t.price = h.price_or_mark;
    }
    return t;
  }

  // Sale of `amount` from a liquid holding to fund the purchase. Priced holdings sell units at the displayed price.
  function saleEntry(src, date, amount, inv) {
    const eff = Metrics.effective(src);
    const t = { date, holding_id: src.id, type: "sell", quantity: null, price: null, amount: r2(amount), note: `Sold to fund ${inv.name}` };
    if (Metrics.isPriced(src)) {
      const unit = src.security_type === "bond" || src.security_type === "t_bill" ? eff.price_or_mark / 100 : eff.price_or_mark;
      t.quantity = amount / unit; t.price = eff.price_or_mark;
    }
    return t;
  }

  // Validate the form. Returns an error string or null.
  function validate(state, inv, f) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.date || "")) return "Enter a funding date.";
    if (!(num(f.amount, 0) > 0)) return "Enter a funded amount above zero.";
    if (f.source && f.source !== "cash") {
      const src = state.holdings.find(h => h.id === f.source);
      if (!src || !PFM.fundingSources([src]).length) return "That funding holding is not available.";
      const avail = Metrics.marketValue(src);
      if (num(f.amount, 0) > avail + 0.005) return `${src.name} has only ${"$" + Math.round(avail).toLocaleString("en-US")} available.`;
    }
    return null;
  }

  // Execute the funding. f: { date, amount, source }. Returns the funding record stored on the investment.
  function execute(state, inv, f) {
    const err = validate(state, inv, f);
    if (err) throw new Error(err);
    const amount = num(f.amount, 0), date = f.date, source = f.source || "cash";
    let h = inv.holding_id && state.holdings.find(x => x.id === inv.holding_id);
    let created = false;
    if (!h) { h = newHolding(inv, date, amount); state.holdings.push(h); created = true; }
    const ids = [];
    const buy = Positions.post(state, fundingEntry(h, inv, date, amount));
    ids.push(buy.id);
    let sourceName = "cash";
    if (source !== "cash") {
      const src = state.holdings.find(x => x.id === source);
      const sale = Positions.post(state, saleEntry(src, date, amount, inv));
      if (!Metrics.isPriced(src)) src.price_or_mark = r2(num(src.price_or_mark, 0) - amount); // marked holding: the mark falls too
      ids.push(sale.id);
      sourceName = src.name;
    }
    inv.holding_id = h.id;
    inv.funding = { date, amount: r2(amount), source, source_name: sourceName, holding_id: h.id, created, tx_ids: ids };
    return inv.funding;
  }

  // Reverse a funding: unpost its blotter entries, restore a sold mark, and drop the holding it created
  // (unless later blotter entries were added to it). Returns true if anything was reversed.
  function reverse(state, inv) {
    const f = inv.funding;
    if (!f) return false;
    f.tx_ids.slice().reverse().forEach(id => {
      const t = (state.transactions || []).find(x => x.id === id);
      if (t && t.type === "sell") {
        const src = state.holdings.find(x => x.id === t.holding_id);
        if (src && !Metrics.isPriced(src)) src.price_or_mark = r2(num(src.price_or_mark, 0) + Positions.amountOf(t, src));
      }
      Positions.unpost(state, id);
    });
    const h = state.holdings.find(x => x.id === f.holding_id);
    if (h && f.created && !(state.transactions || []).some(t => t.holding_id === h.id)) {
      state.holdings = state.holdings.filter(x => x !== h);
    }
    delete inv.funding;
    delete inv.holding_id;
    return true;
  }

  // One line for the decision log.
  function describe(f) {
    return `Funded $${Math.round(f.amount / 1000).toLocaleString("en-US")}K from ${f.source === "cash" ? "cash" : f.source_name} on ${f.date}.`;
  }

  const InvestModel = { defaultAmount, newHolding, validate, execute, reverse, describe };
  if (typeof module !== "undefined" && module.exports) module.exports = InvestModel;
  else root.InvestModel = InvestModel;
})(typeof window !== "undefined" ? window : this);
