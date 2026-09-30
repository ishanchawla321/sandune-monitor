// GET /api/quote?symbols=AAPL,JPM,... -> { ok, quotes: { AAPL: { price, time } }, source }
// Calls Finnhub /quote per symbol. Symbols that fail are left out; the front end keeps seed prices for them.
"use strict";

const { send, fetchWithTimeout } = require("./_lib.js");

const MAX_SYMBOLS = 25;

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return send(res, 405, { ok: false, message: "Use GET." });
  const key = process.env.FINNHUB_API_KEY;

  // TEMPORARY diagnostic: ?diag=1 reports whether the key is configured, never the key itself. Remove once verified.
  const diag = String((req.query && req.query.diag) || new URL(req.url, "http://x").searchParams.get("diag") || "");
  if (diag === "1") {
    return send(res, 200, { has_key: !!key, key_length: key ? String(key).length : 0, vercel_env: process.env.VERCEL_ENV || null },
                { "Cache-Control": "no-store" });
  }

  if (!key) return send(res, 503, { ok: false, message: "Live prices are not configured." });

  const raw = String((req.query && req.query.symbols) || new URL(req.url, "http://x").searchParams.get("symbols") || "");
  const symbols = Array.from(new Set(raw.split(",").map(s => s.trim().toUpperCase()).filter(s => /^[A-Z][A-Z0-9.\-]{0,9}$/.test(s))))
    .slice(0, MAX_SYMBOLS);
  if (!symbols.length) return send(res, 400, { ok: false, message: "No valid symbols." });

  const results = await Promise.all(symbols.map(async sym => {
    try {
      const r = await fetchWithTimeout(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(sym)}&token=${encodeURIComponent(key)}`, {}, 2500);
      if (!r.ok) return null;
      const q = await r.json();
      // Finnhub returns c = 0 and t = 0 for unknown symbols.
      if (!q || !(q.c > 0) || !(q.t > 0)) return null;
      return [sym, { price: q.c, time: new Date(q.t * 1000).toISOString() }];
    } catch (e) {
      return null;
    }
  }));

  const quotes = Object.fromEntries(results.filter(Boolean));
  if (!Object.keys(quotes).length) return send(res, 502, { ok: false, message: "No quotes available." });
  return send(res, 200, { ok: true, source: "finnhub", quotes },
              { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600" });
};
