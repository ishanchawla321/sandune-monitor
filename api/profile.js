// GET /api/profile?symbols=BWAY,STIM -> { ok, profiles: { BWAY: { market_cap, source } }, source }
// Market cap in dollars from Finnhub endpoints on the free tier, per symbol, first one that answers:
//   1. /stock/metric?metric=all  -> metric.marketCapitalization (millions)
//   2. /stock/profile2            -> marketCapitalization (millions)
//   3. /quote price x /stock/profile2 shareOutstanding (millions of shares)
// Symbols that fail everywhere are left out; the front end shows its stored approximate value for them.
"use strict";

const { send, fetchWithTimeout } = require("./_lib.js");

const MAX_SYMBOLS = 25;
const BASE = "https://finnhub.io/api/v1";

async function getJson(url, key, ms) {
  try {
    const r = await fetchWithTimeout(`${url}&token=${encodeURIComponent(key)}`, {}, ms);
    if (!r.ok) return null;
    return await r.json();
  } catch (e) {
    return null;
  }
}

async function marketCap(sym, key) {
  const s = encodeURIComponent(sym);
  const metric = await getJson(`${BASE}/stock/metric?metric=all&symbol=${s}`, key, 3000);
  const m = metric && metric.metric;
  if (m && m.marketCapitalization > 0) return { market_cap: m.marketCapitalization * 1e6, source: "finnhub-metric" };
  const profile = await getJson(`${BASE}/stock/profile2?symbol=${s}`, key, 3000);
  if (profile && profile.marketCapitalization > 0) return { market_cap: profile.marketCapitalization * 1e6, source: "finnhub-profile2" };
  if (profile && profile.shareOutstanding > 0) {
    const q = await getJson(`${BASE}/quote?symbol=${s}`, key, 3000);
    if (q && q.c > 0) return { market_cap: q.c * profile.shareOutstanding * 1e6, source: "finnhub-quote-x-shares" };
  }
  return null;
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return send(res, 405, { ok: false, message: "Use GET." });
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return send(res, 503, { ok: false, message: "Company profiles are not configured." });

  const q = new URL(req.url, "http://x").searchParams;
  const raw = String((req.query && req.query.symbols) || q.get("symbols") || "");
  const symbols = Array.from(new Set(raw.split(",").map(s => s.trim().toUpperCase()).filter(s => /^[A-Z][A-Z0-9.\-]{0,9}$/.test(s))))
    .slice(0, MAX_SYMBOLS);
  if (!symbols.length) return send(res, 400, { ok: false, message: "No valid symbols." });

  const results = await Promise.all(symbols.map(async sym => {
    const cap = await marketCap(sym, key);
    return cap ? [sym, cap] : null;
  }));

  const profiles = Object.fromEntries(results.filter(Boolean));
  if (!Object.keys(profiles).length) return send(res, 502, { ok: false, message: "No profiles available." });
  return send(res, 200, { ok: true, source: "finnhub", profiles },
              { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" });
};
