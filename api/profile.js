// GET /api/profile?symbols=BWAY,STIM -> { ok, profiles: { BWAY: { market_cap, name } }, source }
// Calls Finnhub /stock/profile2 per symbol. Symbols that fail are left out; the front end shows "—" for them.
"use strict";

const { send, fetchWithTimeout } = require("./_lib.js");

const MAX_SYMBOLS = 25;

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return send(res, 405, { ok: false, message: "Use GET." });
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return send(res, 503, { ok: false, message: "Company profiles are not configured." });

  // TEMPORARY diagnostic: ?diag=1&symbol=JNJ calls Finnhub for one symbol and returns only each endpoint's
  // HTTP status and the first 200 characters of its body. Never the key.
  const q = new URL(req.url, "http://x").searchParams;
  if (q.get("diag") === "1") {
    const sym = String(q.get("symbol") || "JNJ").toUpperCase().replace(/[^A-Z0-9.\-]/g, "").slice(0, 10) || "JNJ";
    const probe = async url => {
      try {
        const r = await fetchWithTimeout(url + "&token=" + encodeURIComponent(key), {}, 4000);
        const text = await r.text();
        return { status: r.status, body: text.slice(0, 200) };
      } catch (e) { return { status: null, body: String(e && e.name) }; }
    };
    const out = {};
    out.profile2 = await probe("https://finnhub.io/api/v1/stock/profile2?symbol=" + encodeURIComponent(sym));
    out.metric = await probe("https://finnhub.io/api/v1/stock/metric?metric=all&symbol=" + encodeURIComponent(sym));
    return send(res, 200, { ok: true, diag: true, symbol: sym, vercel_env: process.env.VERCEL_ENV || null, results: out });
  }

  const raw = String((req.query && req.query.symbols) || new URL(req.url, "http://x").searchParams.get("symbols") || "");
  const symbols = Array.from(new Set(raw.split(",").map(s => s.trim().toUpperCase()).filter(s => /^[A-Z][A-Z0-9.\-]{0,9}$/.test(s))))
    .slice(0, MAX_SYMBOLS);
  if (!symbols.length) return send(res, 400, { ok: false, message: "No valid symbols." });

  const results = await Promise.all(symbols.map(async sym => {
    try {
      const r = await fetchWithTimeout(`https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(sym)}&token=${encodeURIComponent(key)}`, {}, 3000);
      if (!r.ok) return null;
      const p = await r.json();
      // marketCapitalization is in millions of the listing currency; unknown symbols come back as {}.
      if (!p || !(p.marketCapitalization > 0)) return null;
      return [sym, { market_cap: p.marketCapitalization * 1e6, name: typeof p.name === "string" ? p.name : null }];
    } catch (e) {
      return null;
    }
  }));

  const profiles = Object.fromEntries(results.filter(Boolean));
  if (!Object.keys(profiles).length) return send(res, 502, { ok: false, message: "No profiles available." });
  return send(res, 200, { ok: true, source: "finnhub", profiles },
              { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" });
};
