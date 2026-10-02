// Live prices. In Live mode, quotes from /api/quote overlay the seed prices of public equities and ETFs
// (never stored); tickers without a quote are tagged "cached, as of <seed date>". Seed mode shows the
// seed book exactly as hand-checked. Holdings whose price was edited by hand keep the edited price.
// Market caps for theme company lists come from /api/profile whenever the page is hosted, in either price mode
// (they are not part of the book); they are fetched when a theme card needs them and the card shows "—" until
// they arrive or when a symbol has none.
(function (root) {
  "use strict";

  const KEY = "sandune-monitor.prices";
  const ui = { mode: "live", quotes: {}, profiles: {}, pending: new Set(), status: "idle", fetchedAt: null, listeners: [] };
  let seedDate = "";

  try { ui.mode = root.localStorage.getItem(KEY) === "seed" ? "seed" : "live"; } catch (e) { /* default live */ }

  const isQuoted = h => (h.asset_class === "public_equity" && h.security_type !== "basket") || h.security_type === "etf";

  function fmtTime(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return "";
    const p = n => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  function overlay(h) {
    if (ui.mode !== "live" || !isQuoted(h) || h.mark_source === "Manual edit") return null;
    const q = ui.quotes[String(h.ticker_or_id || "").toUpperCase()];
    if (q) return { price_or_mark: q.price, mark_source: "Live · Finnhub", mark_date: fmtTime(q.time) };
    return { mark_source: "Cached, as of " + seedDate };
  }

  function tickers(state) {
    const t = state.holdings.filter(isQuoted).map(h => String(h.ticker_or_id || "").toUpperCase());
    return Array.from(new Set(t.filter(Boolean)));
  }
  function companyTickers(state) {
    const t = [];
    (state.themes || []).forEach(th => (th.watch_public || []).forEach(x => t.push(String(x.ticker || "").toUpperCase())));
    return Array.from(new Set(t.filter(Boolean)));
  }

  function notify() { ui.listeners.forEach(fn => fn()); }

  // Fetch market caps for any of these tickers not fetched yet. A ticker that returns nothing is kept as null
  // so it is not asked for again this session; the card shows "—" for it.
  async function ensureProfiles(list) {
    if (!root.Api.available) return;
    const want = Array.from(new Set((list || []).map(t => String(t || "").toUpperCase()).filter(Boolean)))
      .filter(t => !(t in ui.profiles) && !ui.pending.has(t));
    if (!want.length) return;
    want.forEach(t => ui.pending.add(t));
    const prof = await root.Api.profile(want);
    want.forEach(t => { ui.pending.delete(t); ui.profiles[t] = prof && prof.profiles && prof.profiles[t] ? prof.profiles[t] : null; });
    if (prof && prof.profiles) notify();
  }

  async function refresh(state) {
    ensureProfiles(companyTickers(state));
    if (ui.mode !== "live" || ui.status === "loading") return;
    ui.status = "loading";
    const res = await root.Api.quote(tickers(state));
    if (res && res.ok && res.quotes && Object.keys(res.quotes).length) {
      ui.quotes = res.quotes;
      ui.status = "live";
      ui.fetchedAt = new Date().toISOString();
    } else {
      ui.status = "cached";
    }
    notify();
  }

  function setMode(mode, state) {
    ui.mode = mode === "seed" ? "seed" : "live";
    try { root.localStorage.setItem(KEY, ui.mode); } catch (e) { /* ignore */ }
    notify();
    if (ui.mode === "live" && ui.status !== "live") refresh(state);
  }

  function init(state) {
    seedDate = state.as_of;
    root.Metrics.setPriceOverlay(overlay);
    refresh(state);
  }

  // Live market cap for a theme company ticker, or null (the card then shows "—").
  function marketCap(ticker) {
    const p = ui.profiles[String(ticker || "").toUpperCase()];
    return p && p.market_cap > 0 ? p.market_cap : null;
  }

  // The seed date as "9/28" for the header toggle.
  function seedShort() { const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(seedDate || ""); return m ? `${+m[1]}/${+m[2]}` : seedDate; }
  function clock(iso) { const d = new Date(iso); return isNaN(d) ? "" : d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); }

  // Price source, shown once in the header next to the Live | Seed toggle: "Finnhub 3:15 PM" or "Cached 9/28".
  function statusText() {
    if (ui.mode === "seed" || ui.status === "loading" || ui.status === "idle") return "";
    if (ui.status === "live") return `· Finnhub ${clock(ui.fetchedAt)}`;
    return `· Cached ${seedShort()}`;
  }

  root.Prices = {
    init, refresh, setMode, marketCap, ensureProfiles, statusText, seedShort,
    mode: () => ui.mode,
    onUpdate: fn => ui.listeners.push(fn)
  };
})(window);
