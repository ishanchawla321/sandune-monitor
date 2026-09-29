// Pro forma model: applies selected ideas to the book and returns the after-trade holdings.
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

  function defaultSelection(idea) {
    return { include: false, check: idea.check_size, funded_pct: idea.funded_pct === null || idea.funded_pct === undefined ? 1 : idea.funded_pct,
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

  // New book row for an idea. Public ideas enter liquid today; everything else is 3y_plus until today + hold.
  function ideaRow(idea, t, asOf) {
    const isPublic = idea.asset_class === "public_equity" || idea.type === "public";
    const isTheme = idea.type === "theme";
    const tickers = (idea.tickers || []).join("/");
    return {
      id: "pf-" + idea.id, pf: true, idea_id: idea.id,
      asset_class: idea.asset_class,
      name: isTheme && tickers ? `${idea.name.split("/")[0].trim()} basket (${tickers})` : idea.name,
      ticker_or_id: idea.ticker_or_id,
      security_type: isTheme ? "basket" : idea.security_type,
      sector: idea.sector,
      price_or_mark: t.funded, quantity: null, market_value: null, cost: t.funded,
      commitment: isPublic ? null : t.check,
      unfunded: t.unfunded,
      // Unfunded is called in year 1 unless the idea carries its own schedule.
      call_schedule: t.unfunded > 0 ? (idea.call_schedule || [1, 0, 0]) : null,
      liquidity_bucket: isPublic ? "liquid_now" : "3y_plus",
      liquidity_date: isPublic ? asOf : addMonths(asOf, num(idea.hold_months, 60)),
      mark_source: "Pro forma", mark_date: asOf
    };
  }

  // selections: { [ideaId]: { include, check, funded_pct, fee_pct, source } }
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

    state.ideas.forEach(idea => {
      const sel = Object.assign(defaultSelection(idea), (selections || {})[idea.id] || {});
      if (!sel.include) return;
      const check = Math.max(0, num(sel.check, 0));
      const fundedPct = Math.min(1, Math.max(0, num(sel.funded_pct, 1)));
      const feePct = Math.max(0, num(sel.fee_pct, 0));
      const funded = check * fundedPct;
      const fee = check * feePct;
      const t = { idea_id: idea.id, name: idea.name, check, funded_pct: fundedPct, funded, unfunded: check - funded,
                  fee_pct: feePct, fee, source: sel.source || "cash", from_holding: 0, from_cash: 0, source_name: "Cash" };

      let remaining = funded;
      if (t.source !== "cash") {
        const src = holdings.find(h => h.id === t.source);
        const ok = src && fundingSources([src]).length;
        if (!ok) {
          warnings.push(`${idea.name}: funding holding not available; funded from cash instead.`);
        } else {
          t.source_name = src.name;
          const avail = Metrics.marketValue(src);
          const take = Math.min(remaining, avail);
          if (take > 0) sell(src, take);
          t.from_holding = take;
          remaining -= take;
          if (remaining > 0.005) {
            warnings.push(`${idea.name}: ${src.name} has only $${Math.round(take / 1000).toLocaleString("en-US")}K available, so the sale is capped there; the remaining $${Math.round(remaining / 1000).toLocaleString("en-US")}K comes from cash.`);
          }
        }
      }
      t.from_cash = remaining;
      cash.price_or_mark -= remaining + fee; // fees are paid in cash and not capitalised, so NAV falls by the fee

      const row = ideaRow(idea, t, asOf);
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
