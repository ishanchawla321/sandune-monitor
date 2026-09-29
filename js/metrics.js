// Portfolio metrics. Pure functions over holdings and settings; no DOM access.
// Works in the browser (window.Metrics) and in Node (module.exports) for checks.
(function (root) {
  "use strict";

  const ILLIQUID_BUCKETS = ["1_3y", "3y_plus"];
  // Always illiquid and never in dry powder, whatever liquidity bucket a holding is given.
  const ALWAYS_ILLIQUID = ["private_credit"];
  const isIlliquid = h => ALWAYS_ILLIQUID.includes(h.asset_class) || ILLIQUID_BUCKETS.includes(h.liquidity_bucket);

  // Priced holdings carry a unit price and a quantity; everything else carries a mark (or balance) in dollars.
  // A public equity "basket" (e.g. a pro forma theme position) is carried at a mark.
  function isPriced(h) {
    return h.security_type === "bond" || h.security_type === "t_bill" || h.security_type === "etf" ||
           (h.asset_class === "public_equity" && h.security_type !== "basket");
  }

  // Optional price overlay (live quotes). It returns fields to override on a holding, or null.
  // Stored holdings are never changed by it, so switching the overlay off restores seed prices exactly.
  let overlay = null;
  function setPriceOverlay(fn) { overlay = fn || null; }
  function effective(h) {
    const o = overlay && overlay(h);
    return o ? Object.assign({}, h, o) : h;
  }

  // public equity and ETFs = price x shares; bonds and T-bills = price x face / 100;
  // funds, privates, real estate and cash = mark / balance.
  function marketValue(holding) {
    const h = effective(holding);
    const p = Number(h.price_or_mark) || 0;
    const q = Number(h.quantity) || 0;
    if (h.security_type === "bond" || h.security_type === "t_bill") return p * q / 100;
    if (isPriced(h)) return p * q;
    return p;
  }

  function withValues(holdings) {
    return holdings.map(h => Object.assign({}, effective(h), { market_value: marketValue(h) }));
  }

  const sum = (arr, f) => arr.reduce((s, x) => s + f(x), 0);
  const ratio = (a, b) => (b ? a / b : null);

  function nav(hs) { return sum(hs, h => h.market_value); }
  function cashBalance(hs) { return sum(hs.filter(h => h.security_type === "cash"), h => h.market_value); }
  function cashAndBills(hs) { return sum(hs.filter(h => h.asset_class === "cash"), h => h.market_value); }
  function unfundedTotal(hs) { return sum(hs, h => Number(h.unfunded) || 0); }

  function byAssetClass(hs) {
    const out = {};
    hs.forEach(h => { out[h.asset_class] = (out[h.asset_class] || 0) + h.market_value; });
    return out;
  }

  // Sector exposure excludes cash and T-bills.
  function bySector(hs) {
    const out = {};
    hs.filter(h => h.asset_class !== "cash").forEach(h => { const k = h.sector || "Unassigned"; out[k] = (out[k] || 0) + h.market_value; });
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
    const cash = cashBalance(hs);
    const liquid = hs.filter(h => h.liquidity_bucket === "liquid_now" && h.security_type !== "cash" && !isIlliquid(h));
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
    const value = sum(hs.filter(isIlliquid), h => h.market_value);
    const unfunded = unfundedTotal(hs);
    return { value, unfunded, pct: ratio(value, n), pct_incl_unfunded: ratio(value + unfunded, n) };
  }

  // Cash and T-bills are excluded from single-position concentration.
  function largestPosition(hs) {
    const candidates = hs.filter(h => h.asset_class !== "cash");
    if (!candidates.length) return null;
    const top = candidates.reduce((a, b) => (b.market_value > a.market_value ? b : a));
    return { holding: top, value: top.market_value, pct: ratio(top.market_value, nav(hs)) };
  }

  function largestSector(hs, settings) {
    const entries = Object.entries(bySector(hs.filter(h => !settings.sector_exclude.includes(h.sector))));
    if (!entries.length) return null;
    const [sector, value] = entries.reduce((a, b) => (b[1] > a[1] ? b : a));
    return { sector, value, pct: ratio(value, nav(hs)) };
  }

  // Capital calls in year t = sum(unfunded x call_schedule[t]).
  // A null schedule is straight-line over `horizon` years; years past the schedule call nothing.
  function scheduleFor(h, horizon) {
    return h.call_schedule || Array.from({ length: horizon }, () => 1 / horizon);
  }

  function capitalCalls(hs, years, horizon) {
    const calls = Array(years).fill(0);
    hs.filter(h => Number(h.unfunded) > 0).forEach(h => {
      const s = scheduleFor(h, horizon);
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
  // Point t = 0 is "now": cash plus holdings liquid today, before any calls.
  function ladder(hs, asOf, years, horizon) {
    const cash = cashAndBills(hs);
    const calls = [0].concat(capitalCalls(hs, years, horizon));
    const out = [];
    let cum = 0;
    for (let t = 0; t <= years; t++) {
      const end = addYears(asOf, t);
      const available = sum(hs.filter(h => h.asset_class !== "cash" && h.liquidity_date && h.liquidity_date <= end),
                            h => h.market_value);
      cum += calls[t];
      out.push({ year: t, through: end, calls: calls[t], cash, available, cumulative_calls: cum,
                 net: cash + available - cum });
    }
    return out;
  }

  // Liquidity score = 40 x (1 - min(m50,60)/60) + 40 x (1 - min(hold,60)/60) + 20 if interim cash. Public = 100.
  // A missing month count scores as 60 (no credit), so an incomplete investment never looks more liquid than it is.
  function liquidityScoreParts(inv) {
    if (inv.asset_class === "public_equity" || inv.type === "public") return { isPublic: true, parts: [], total: 100 };
    const months = v => (v === null || v === undefined || v === "" || !isFinite(v) ? 60 : Math.max(0, Math.min(Number(v), 60)));
    const parts = [40 * (1 - months(inv.months_to_50pct_back) / 60), 40 * (1 - months(inv.hold_months) / 60),
                   inv.interim_cash ? 20 : 0];
    return { isPublic: false, parts, total: parts[0] + parts[1] + parts[2] };
  }

  function liquidityScore(inv) { return liquidityScoreParts(inv).total; }

  function summary(holdings, settings, asOf) {
    const hs = withValues(holdings);
    return {
      holdings: hs,
      nav: nav(hs),
      cash_balance: cashBalance(hs),
      cash_and_bills: cashAndBills(hs),
      unfunded: unfundedTotal(hs),
      by_asset_class: byAssetClass(hs),
      by_sector: bySector(hs),
      dry_powder: dryPowder(hs, settings),
      illiquid: illiquid(hs),
      largest_position: largestPosition(hs),
      largest_sector: largestSector(hs, settings),
      ladder: ladder(hs, asOf, settings.ladder_years || 5, settings.call_horizon_years)
    };
  }

  const Metrics = { isPriced, setPriceOverlay, effective, marketValue, withValues, nav, cashBalance, cashAndBills, unfundedTotal,
                    byAssetClass, bySector, haircutFor, dryPowder, illiquid, largestPosition, largestSector,
                    capitalCalls, ladder, liquidityScoreParts, liquidityScore, summary };
  if (typeof module !== "undefined" && module.exports) module.exports = Metrics;
  else root.Metrics = Metrics;
})(typeof window !== "undefined" ? window : this);
