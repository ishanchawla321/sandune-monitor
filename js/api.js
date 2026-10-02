// Calls to the /api functions. Every call has a timeout and resolves to null on any failure,
// so callers fall back quietly. Opened from disk (file://) there is no API, so calls are skipped.
(function (root) {
  "use strict";

  const available = /^https?:$/.test(root.location.protocol);

  async function call(path, options, timeoutMs) {
    if (!available) return null;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(path, Object.assign({}, options, { signal: ctrl.signal }));
      const body = await res.json().catch(() => null);
      if (!body) return null;
      body.httpStatus = res.status;
      return body;
    } catch (e) {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  const post = (path, data, timeoutMs) =>
    call(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }, timeoutMs);

  root.Api = {
    available,
    quote: symbols => call("api/quote?symbols=" + encodeURIComponent(symbols.join(",")), {}, 3000),
    // Market caps: one request per five symbols so a slow symbol cannot time out the whole list; the merged
    // result is { ok, profiles } or null when nothing came back.
    profile: async symbols => {
      const chunks = [];
      for (let i = 0; i < symbols.length; i += 5) chunks.push(symbols.slice(i, i + 5));
      const parts = await Promise.all(chunks.map(c => call("api/profile?symbols=" + encodeURIComponent(c.join(",")), {}, 3000)));
      const profiles = Object.assign({}, ...parts.filter(p => p && p.ok && p.profiles).map(p => p.profiles));
      return Object.keys(profiles).length ? { ok: true, profiles } : null;
    },
    extract: (data, timeoutMs) => post("api/extract", data, timeoutMs)
  };
})(window);
