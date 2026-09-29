// Portfolio metrics. Pure functions over holdings and settings; no DOM access.
// Works in the browser (window.Metrics) and in Node (module.exports) for checks.
(function (root) {
  "use strict";

  const ILLIQUID_BUCKETS = ["1_3y", "3y_plus"];

  // public equity and ETFs = price x shares; bonds and T-bills = price x face / 100;
  // funds, privates and cash = mark / balance.
  function marketValue(h) {
    if (h.security_type === "bond" || h.security_type === "t_bill") return h.price_or_mark * h.quantity / 100;
    if (h.asset_class === "public_equity" || h.security_type === "etf") return h.price_or_mark * h.quantity;
    return h.price_or_mark;
  }

  function withValues(holdings) {
    return holdings.map(h => Object.assign({}, h, { market_value: marketValue(h) }));
  }

  const sum = (arr, f) => arr.reduce((s, x) => s + f(x), 0);

  function nav(hs) { return sum(hs, h => h.market_value); }
  function cashAndBills(hs) { return sum(hs.filter(h => h.asset_class === "cash"), h => h.market_value); }
  function unfundedTotal(hs) { return sum(hs, h => h.unfunded || 0); }

  function byAssetClass(hs) {
    const out = {};
    hs.forEach(h => { out[h.asset_class] = (out[h.asset_class] || 0) + h.market_value; });
    return out;
  }

  function haircutFor(h, haircuts) {
    if (h.security_type in haircuts) return haircuts[h.security_type];
    if (h.asset_class in haircuts) return haircuts[h.asset_class];
    return 0;
  }

  // Dry powder = cash + sum(liquid value x haircut) - unfunded - reserve.
  // "cash" is the cash balance itself; T-bills sit in the liquid sum at their haircut (100% by default).
  function dryPowder(hs, settings) {
    const cash = sum(hs.filter(h => h.security_type === "cash"), h => h.market_value);
    const liquid = hs.filter(h => h.liquidity_bucket === "liquid_now" && h.security_type !== "cash");
    const groups = {};
    liquid.forEach(h => {
      const key = h.security_type in settings.haircuts ? h.security_type : h.asset_class;
      const g = groups[key] || (groups[key] = { key, value: 0, haircut: haircutFor(h, settings.haircuts), count: 0 });
      g.value += h.market_value;
      g.count += 1;
    });
    const lines = Object.values(groups).map(g => Object.assign(g, { counted: g.value * g.haircut }));
    const liquidCounted = sum(lines, l => l.counted);
    const unfunded = unfundedTotal(hs);
    return { cash, lines, liquidCounted, unfunded, reserve: settings.reserve,
             total: cash + liquidCounted - unfunded - settings.reserve };
  }

  function illiquid(hs) {
    const n = nav(hs);
    const value = sum(hs.filter(h => ILLIQUID_BUCKETS.includes(h.liquidity_bucket)), h => h.market_value);
    const unfunded = unfundedTotal(hs);
    return { value, unfunded, pct: value / n, pct_incl_unfunded: (value + unfunded) / n };
  }

  // Cash and T-bills are excluded from single-position concentration.
  function largestPosition(hs) {
    const n = nav(hs);
    const top = hs.filter(h => h.asset_class !== "cash")
                  .reduce((a, b) => (b.market_value > a.market_value ? b : a));
    return { holding: top, value: top.market_value, pct: top.market_value / n };
  }

  function largestSector(hs, settings) {
    const n = nav(hs);
    const bySector = {};
    hs.filter(h => !settings.sector_exclude.includes(h.sector))
      .forEach(h => { bySector[h.sector] = (bySector[h.sector] || 0) + h.market_value; });
    const [sector, value] = Object.entries(bySector).reduce((a, b) => (b[1] > a[1] ? b : a));
    return { sector, value, pct: value / n, bySector };
  }

  // Capital calls in year t = sum(unfunded x call_schedule[t]); null schedule = straight-line.
  function scheduleFor(h, years) {
    return h.call_schedule || Array.from({ length: years }, () => 1 / years);
  }

  function capitalCalls(hs, years) {
    const calls = Array(years).fill(0);
    hs.filter(h => h.unfunded > 0).forEach(h => {
      const s = scheduleFor(h, years);
      for (let t = 0; t < years; t++) calls[t] += h.unfunded * (s[t] || 0);
    });
    return calls;
  }

  function addYears(iso, n) {
    const d = new Date(iso + "T00:00:00Z");
    d.setUTCFullYear(d.getUTCFullYear() + n);
    return d.toISOString().slice(0, 10);
  }

  // Ladder year t = cash + value with liquidity_date <= (as_of + t years) - cumulative calls through t.
  function ladder(hs, asOf, years) {
    const cash = cashAndBills(hs);
    const calls = capitalCalls(hs, years);
    const out = [];
    let cum = 0;
    for (let t = 1; t <= years; t++) {
      const end = addYears(asOf, t);
      const available = sum(hs.filter(h => h.asset_class !== "cash" && h.liquidity_date && h.liquidity_date <= end),
                            h => h.market_value);
      cum += calls[t - 1];
      out.push({ year: t, through: end, cash, available, cumulative_calls: cum, net: cash + available - cum });
    }
    return out;
  }

  // Liquidity score = 40 x (1 - min(m50,60)/60) + 40 x (1 - min(hold,60)/60) + 20 if interim cash. Public = 100.
  function liquidityScore(idea) {
    if (idea.asset_class === "public_equity" || idea.type === "public") return 100;
    const m50 = Math.min(idea.months_to_50pct_back, 60);
    const hold = Math.min(idea.hold_months, 60);
    return 40 * (1 - m50 / 60) + 40 * (1 - hold / 60) + (idea.interim_cash ? 20 : 0);
  }

  function summary(holdings, settings, asOf) {
    const hs = withValues(holdings);
    const years = settings.call_horizon_years;
    return {
      holdings: hs,
      nav: nav(hs),
      cash_and_bills: cashAndBills(hs),
      unfunded: unfundedTotal(hs),
      by_asset_class: byAssetClass(hs),
      dry_powder: dryPowder(hs, settings),
      illiquid: illiquid(hs),
      largest_position: largestPosition(hs),
      largest_sector: largestSector(hs, settings),
      capital_calls: capitalCalls(hs, years),
      ladder: ladder(hs, asOf, years)
    };
  }

  const Metrics = { marketValue, withValues, nav, cashAndBills, unfundedTotal, byAssetClass, haircutFor,
                    dryPowder, illiquid, largestPosition, largestSector, capitalCalls, ladder,
                    liquidityScore, summary };
  if (typeof module !== "undefined" && module.exports) module.exports = Metrics;
  else root.Metrics = Metrics;
})(typeof window !== "undefined" ? window : this);
