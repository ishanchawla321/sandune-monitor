// Shared helpers for the /api functions. Files starting with "_" are not deployed as routes.
// Plain Node (built-in fetch), no npm packages. Keys come only from process.env.
"use strict";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-5";

function send(res, status, body, headers) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  Object.entries(headers || {}).forEach(([k, v]) => res.setHeader(k, v));
  res.end(JSON.stringify(body));
}

function clientIp(req) {
  const fwd = (req.headers && (req.headers["x-forwarded-for"] || req.headers["x-real-ip"])) || "";
  return String(fwd).split(",")[0].trim() || (req.socket && req.socket.remoteAddress) || "unknown";
}

// Best-effort limiter: counts live in this function instance's memory, so a cold start
// or a second instance resets them. Good enough to stop casual abuse of a public demo.
const buckets = new Map();
function rateLimited(name, ip, limit, windowMs) {
  const key = name + ":" + ip;
  const now = Date.now();
  const hits = (buckets.get(key) || []).filter(t => now - t < windowMs);
  if (hits.length >= limit) { buckets.set(key, hits); return true; }
  hits.push(now);
  buckets.set(key, hits);
  if (buckets.size > 5000) buckets.clear(); // keep memory bounded
  return false;
}

async function fetchWithTimeout(url, options, ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, Object.assign({}, options, { signal: ctrl.signal }));
  } finally {
    clearTimeout(timer);
  }
}

class UpstreamError extends Error {
  constructor(message, status) { super(message); this.status = status || 502; }
}

// One Messages API call with a JSON-schema response format. Returns the parsed JSON object.
async function claudeJson({ system, content, schema, maxTokens, timeoutMs }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new UpstreamError("not_configured", 503);
  const res = await fetchWithTimeout(ANTHROPIC_URL, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      thinking: { type: "disabled" }, // extraction and one-line reads don't need it; keeps latency down
      system,
      messages: [{ role: "user", content }],
      output_config: { format: { type: "json_schema", schema } }
    })
  }, timeoutMs);
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("anthropic_error", res.status, detail.slice(0, 500));
    throw new UpstreamError(res.status === 429 || res.status === 529 ? "busy" : "upstream", res.status === 429 ? 429 : 502);
  }
  const msg = await res.json();
  if (msg.stop_reason === "refusal") throw new UpstreamError("refusal", 422);
  if (msg.stop_reason === "max_tokens") throw new UpstreamError("truncated", 502);
  const text = (msg.content || []).filter(b => b.type === "text").map(b => b.text).join("");
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new UpstreamError("bad_json", 502);
  }
}

module.exports = { send, clientIp, rateLimited, fetchWithTimeout, claudeJson, UpstreamError, MODEL };
