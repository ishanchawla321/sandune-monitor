// Live prices. In Live mode, quotes from /api/quote overlay the seed prices of public equities and ETFs
// (never stored); tickers without a quote are tagged "cached, as of <seed date>". Seed mode shows the
// seed book exactly as hand-checked. Holdings whose price was edited by hand keep the edited price.
(function (root) {
  "use strict";

  const KEY = "sandune-monitor.prices";
  const ui = { mode: "live", quotes: {}, status: "idle", fetchedAt: null, listeners: [] };
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
    state.ideas.forEach(i => (i.tickers || []).forEach(x => t.push(String(x).toUpperCase())));
    return Array.from(new Set(t.filter(Boolean)));
  }

  function notify() { ui.listeners.forEach(fn => fn()); }

  async function refresh(state) {
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
    if (ui.mode === "live") refresh(state);
  }

  // Quote for an idea ticker (signals), or null.
  function quote(ticker) {
    if (ui.mode !== "live") return null;
    const q = ui.quotes[String(ticker || "").toUpperCase()];
    return q ? { price: q.price, when: fmtTime(q.time) } : null;
  }

  function statusText() {
    if (ui.mode === "seed") return `Seed prices, ${seedDate}`;
    if (ui.status === "live") return `Live · Finnhub, ${fmtTime(ui.fetchedAt)}`;
    if (ui.status === "loading") return "Fetching live prices…";
    return `Cached, as of ${seedDate}`;
  }

  root.Prices = {
    init, refresh, setMode, quote, statusText,
    mode: () => ui.mode,
    onUpdate: fn => ui.listeners.push(fn)
  };
})(window);
