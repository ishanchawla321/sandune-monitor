// Pro forma model: applies selected investments to the book and returns the after-trade holdings.
// Pure functions, no DOM. Works in the browser (window.ProFormaModel) and in Node.
(function (root) {
  "use strict";

  const Metrics = root.Metrics || (typeof require !== "undefined" ? require("./metrics.js") : null);

  const clone = x => JSON.parse(JSON.stringify(x));
  const num = (v, d) => (v === null || v === undefined || v === "" || !isFinite(v) ? d : Number(v));

  function addMonths(iso, n) {
    const d = new Date(iso + "T00:00:00Z");
    d.setUTCMonth(d.getUTCMonth() + n);
    return d.toISOString().slice(0, 10);
  }

  // Liquid holdings that can fund a trade: liquid now, not cash itself, never private credit.
  function fundingSources(holdings) {
    return holdings.filter(h => h.liquidity_bucket === "liquid_now" && h.security_type !== "cash" &&
                                h.asset_class !== "private_credit" && Metrics.marketValue(h) > 0);
  }

  function defaultSelection(inv) {
    return { include: false, check: inv.check_size, funded_pct: inv.funded_pct === null || inv.funded_pct === undefined ? 1 : inv.funded_pct,
             fee_pct: 0, source: "cash" };
  }

  // Sell `amount` of holding h at its current value. Priced holdings reduce quantity at the current price;
  // marked holdings reduce the mark. Cost falls pro rata.
  function sell(h, amount) {
    const mv = Metrics.marketValue(h);
    const frac = mv ? amount / mv : 0;
    if (Metrics.isPriced(h)) {
      const unit = h.security_type === "bond" || h.security_type === "t_bill" ? h.price_or_mark / 100 : h.price_or_mark;
      h.quantity = h.quantity - amount / unit;
    } else {
      h.price_or_mark = h.price_or_mark - amount;
    }
    if (h.cost !== null && h.cost !== undefined) h.cost = h.cost * (1 - frac);
  }

  // New book row for an investment. Public investments enter liquid today; everything else is 3y_plus
  // until today + hold. A priced security with a unit price (e.g. BWAY) is bought at the displayed price,
  // so quantity = funded / price; anything else is carried at the funded amount.
  function investmentRow(inv, t, asOf) {
    const isPublic = inv.asset_class === "public_equity" || inv.type === "public";
    const row = {
      id: "pf-" + inv.id, pf: true, investment_id: inv.id,
      asset_class: inv.asset_class, name: inv.name, ticker_or_id: inv.ticker_or_id,
      security_type: inv.security_type, sector: inv.sector,
      price_or_mark: t.funded, quantity: null, market_value: null, cost: t.funded,
      commitment: isPublic ? null : t.check,
      unfunded: t.unfunded,
      // Unfunded is called in year 1 unless the investment carries its own schedule.
      call_schedule: t.unfunded > 0 ? (inv.call_schedule || [1, 0, 0]) : null,
      liquidity_bucket: isPublic ? "liquid_now" : "3y_plus",
      liquidity_date: isPublic ? asOf : addMonths(asOf, num(inv.hold_months, 60)),
      mark_source: "Pro forma", mark_date: asOf
    };
    if (Metrics.isPriced(row) && num(inv.price_or_mark, 0) > 0) {
      const priced = Metrics.effective(Object.assign({}, row, { price_or_mark: inv.price_or_mark, quantity: 1 }));
      const unit = priced.security_type === "bond" || priced.security_type === "t_bill" ? priced.price_or_mark / 100 : priced.price_or_mark;
      return Object.assign(priced, { quantity: t.funded / unit, mark_source: "Pro forma", mark_date: asOf });
    }
    if (Metrics.isPriced(row)) row.security_type = "basket"; // no unit price: carry at the funded amount
    return row;
  }

  // selections: { [investmentId]: { include, check, funded_pct, fee_pct, source, via_theme } }
  // Returns { holdings, trades, warnings }. "Today" is the book's as-of date so ladder years line up.
  function apply(state, selections) {
    const asOf = state.as_of;
    // Live prices (if any) are baked into the working copy so sales happen at the displayed price.
    const holdings = clone(state.holdings).map(h => Metrics.effective(h));
    const trades = [], warnings = [];
    let cash = holdings.find(h => h.security_type === "cash");
    if (!cash) {
      cash = { id: "pf-cash", asset_class: "cash", name: "Operating cash", ticker_or_id: "USD", security_type: "cash",
               sector: "Cash", price_or_mark: 0, quantity: null, market_value: null, cost: 0, commitment: null, unfunded: 0,
               call_schedule: null, liquidity_bucket: "liquid_now", liquidity_date: asOf, mark_source: "Pro forma", mark_date: asOf };
      holdings.push(cash);
    }

    state.investments.forEach(inv => {
      const sel = Object.assign(defaultSelection(inv), (selections || {})[inv.id] || {});
      if (!sel.include) return;
      const check = Math.max(0, num(sel.check, 0));
      const fundedPct = Math.min(1, Math.max(0, num(sel.funded_pct, 1)));
      const feePct = Math.max(0, num(sel.fee_pct, 0));
      const funded = check * fundedPct;
      const fee = check * feePct;
      const t = { investment_id: inv.id, name: inv.name, check, funded_pct: fundedPct, funded, unfunded: check - funded,
                  fee_pct: feePct, fee, source: sel.source || "cash", from_holding: 0, from_cash: 0, source_name: "Cash" };

      let remaining = funded;
      if (t.source !== "cash") {
        const src = holdings.find(h => h.id === t.source);
        const ok = src && fundingSources([src]).length;
        if (!ok) {
          warnings.push(`${inv.name}: funding holding not available; funded from cash instead.`);
        } else {
          t.source_name = src.name;
          const avail = Metrics.marketValue(src);
          const take = Math.min(remaining, avail);
          if (take > 0) sell(src, take);
          t.from_holding = take;
          remaining -= take;
          if (remaining > 0.005) {
            warnings.push(`${inv.name}: ${src.name} has only $${Math.round(take / 1000).toLocaleString("en-US")}K available, so the sale is capped there; the remaining $${Math.round(remaining / 1000).toLocaleString("en-US")}K comes from cash.`);
          }
        }
      }
      t.from_cash = remaining;
      cash.price_or_mark -= remaining + fee; // fees are paid in cash and not capitalised, so NAV falls by the fee

      const row = investmentRow(inv, t, asOf);
      t.row_id = row.id;
      holdings.push(row);
      trades.push(t);
    });

    if (cash.price_or_mark < -0.005) {
      warnings.push(`Operating cash goes negative ($${Math.round(cash.price_or_mark / 1000).toLocaleString("en-US")}K). Fund part of the trade from a liquid holding.`);
    }
    return { holdings, trades, warnings };
  }

  const ProFormaModel = { apply, fundingSources, defaultSelection, addMonths };
  if (typeof module !== "undefined" && module.exports) module.exports = ProFormaModel;
  else root.ProFormaModel = ProFormaModel;
})(typeof window !== "undefined" ? window : this);
