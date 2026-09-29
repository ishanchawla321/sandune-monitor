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
    extract: (data, timeoutMs) => post("api/extract", data, timeoutMs),
    assess: data => post("api/assess", data, 10000)
  };
})(window);
