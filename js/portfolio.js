// Portfolio > Current: tiles, charts, holdings by asset class (js/holdings.js) and the blotter (js/blotter.js).
(function (root) {
  "use strict";

  const Fmt = root.Fmt, Metrics = root.Metrics;
  const L = Fmt.LABELS;
  const CLASS_ORDER = Object.keys(L.asset_class);

  const ACCENT = "#1f3a5f", MUTED = "#a3adb8", GRID = "#e6e8ec", INK = "#1a2230", INK2 = "#5b6470";

  const ui = { dpOpen: false, charts: {}, bound: false };
  const holdings = root.Holdings.create({ prefix: "pf", editable: true });
  let ctx = null; // { state, onChange }

  // ---------------- Tiles ----------------
  function renderTiles(m, s) {
    const dp = m.dry_powder, il = m.illiquid;
    const y1 = m.ladder.find(l => l.year === 1);
    const calls12 = y1 ? y1.calls : 0;
    const dpBreach = dp.total < s.limits.dry_powder_floor;
    const ilBreach = il.pct_incl_unfunded > s.limits.illiquid_incl_unfunded_pct;
    const status = (breach, text) => `<span class="status-pill ${breach ? "is-breach" : "is-ok"}">${breach ? "Breach" : "Within limit"}</span> <span class="tile-sub-text">${text}</span>`;

    document.getElementById("pf-tiles").innerHTML = `
      <div class="tile"><div class="tile-label">NAV</div><div class="tile-value">${Fmt.millions(m.nav)}</div>
        <div class="tile-sub">Incl. cash and T-bills</div></div>
      <div class="tile"><div class="tile-label">Cash</div><div class="tile-value">${Fmt.millions(m.cash_and_bills)}</div>
        <div class="tile-sub">Cash ${Fmt.millions(m.cash_balance)} + T-bills ${Fmt.millions(m.cash_and_bills - m.cash_balance)}</div></div>
      <div class="tile"><div class="tile-label">Unfunded</div><div class="tile-value">${Fmt.millions(m.unfunded)}</div>
        <div class="tile-sub">Calls next 12 mo ${Fmt.millions(calls12)}</div></div>
      <button type="button" class="tile tile-button" id="pf-dp-tile" aria-expanded="${ui.dpOpen}" aria-controls="pf-dp-build">
        <div class="tile-label">Dry powder <span class="tile-hint">${ui.dpOpen ? "Hide build" : "Show build"}</span></div>
        <div class="tile-value">${Fmt.millions(dp.total)}</div>
        <div class="tile-sub">${status(dpBreach, "floor " + Fmt.millions(s.limits.dry_powder_floor))}</div></button>
      <div class="tile"><div class="tile-label">Illiquid</div>
        <div class="tile-value">${Fmt.pct(il.pct)} <span class="tile-value-2">${Fmt.pct(il.pct_incl_unfunded)} incl. unfunded</span></div>
        <div class="tile-sub">${status(ilBreach, "limit " + Fmt.pct(s.limits.illiquid_incl_unfunded_pct, 0) + " incl. unfunded")}</div></div>`;

    const build = document.getElementById("pf-dp-build");
    build.hidden = !ui.dpOpen;
    if (ui.dpOpen) {
      const line = (label, value, haircut, counted, cls) =>
        `<tr class="${cls || ""}"><td>${label}</td><td class="num">${value}</td><td class="num">${haircut}</td><td class="num">${counted}</td></tr>`;
      build.innerHTML = `<div class="card-header"><h2>Dry powder build</h2></div><div class="table-wrap"><table class="grid build">
        <thead><tr><th>Step</th><th class="num">Value</th><th class="num">Haircut</th><th class="num">Counted</th></tr></thead>
        <tbody>
        ${line("Cash balance", Fmt.dollars(dp.cash), "", Fmt.dollars(dp.cash))}
        ${dp.lines.map(l => line("+ " + (L.haircut_group[l.key] || l.key) + ` (${l.count})`, Fmt.dollars(l.value),
                                  Fmt.pct(l.haircut, 0), Fmt.dollars(l.counted))).join("")}
        ${line("Liquid resources", "", "", Fmt.dollars(dp.cash + dp.liquidCounted), "sub")}
        ${line("− Unfunded commitments", "", "", Fmt.dollars(-dp.unfunded))}
        ${line("− Reserve", "", "", Fmt.dollars(-dp.reserve))}
        ${line("Dry powder", "", "", Fmt.dollars(dp.total), "total")}
        </tbody></table></div>`;
    }
  }

  // ---------------- Charts ----------------
  function baseOptions() {
    return {
      animation: false, responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { animation: false } },
      font: { family: "inherit" }
    };
  }

  function hbar(canvasId, labels, values, m) {
    const data = { labels, datasets: [{ data: values.map(v => v * 100), backgroundColor: ACCENT,
      borderRadius: 4, borderSkipped: "start", barThickness: 12 }] };
    let chart = ui.charts[canvasId];
    const box = document.getElementById(canvasId).parentElement;
    box.style.height = (labels.length * 24 + 40) + "px";
    if (chart) { chart.data = data; chart.update("none"); return; }
    const opts = baseOptions();
    opts.indexAxis = "y";
    opts.plugins.tooltip.callbacks = {
      label: c => `${c.parsed.x.toFixed(1)}% of NAV · ${Fmt.millions(c.parsed.x / 100 * m.nav)}`
    };
    opts.scales = {
      x: { beginAtZero: true, grid: { color: GRID }, border: { display: false },
           ticks: { color: INK2, callback: v => v + "%" } },
      y: { grid: { display: false }, ticks: { color: INK, autoSkip: false } }
    };
    ui.charts[canvasId] = new root.Chart(document.getElementById(canvasId), { type: "bar", data, options: opts });
  }

  function renderCharts(m) {
    if (!root.Chart) return; // chart library missing: tiles and table still work
    const classes = CLASS_ORDER; // every class gets a row, including ones with no holdings yet
    hbar("pf-chart-class", classes.map(k => L.asset_class[k]), classes.map(k => (m.nav ? (m.by_asset_class[k] || 0) / m.nav : 0)), m);

    const sectors = Object.entries(m.by_sector).sort((a, b) => b[1] - a[1]);
    hbar("pf-chart-sector", sectors.map(s => s[0]), sectors.map(s => m.nav ? s[1] / m.nav : 0), m);

    const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const labels = m.ladder.map(l => (l.year === 0 ? "Now" : `Y${l.year} ${MON[+l.through.slice(5, 7) - 1]} '${l.through.slice(2, 4)}`));
    // Two stacked charts on the same year categories. Both reserve the same y-axis width and
    // offset the x-axis, so each year lines up vertically between the line and the bars.
    stackedChart("ladder", "pf-chart-ladder", "line", labels, {
      label: "Liquidity ladder", data: m.ladder.map(l => l.net / 1e6), borderColor: ACCENT, backgroundColor: ACCENT,
      borderWidth: 2, pointRadius: 4, pointHoverRadius: 6
    }, false, 0);
    stackedChart("calls", "pf-chart-calls", "bar", labels, {
      label: "Projected capital calls", data: m.ladder.map(l => (l.year === 0 ? null : l.calls / 1e6)),
      backgroundColor: MUTED, borderRadius: 4, borderSkipped: "start", maxBarThickness: 28
    }, true, 1);
  }

  const Y_AXIS_WIDTH = 64;

  function stackedChart(key, canvasId, type, labels, dataset, showX, dp) {
    const data = { labels, datasets: [dataset] };
    const chart = ui.charts[key];
    if (chart) { chart.data = data; chart.update("none"); return; }
    const opts = baseOptions();
    opts.interaction = { mode: "index", intersect: false };
    opts.plugins.tooltip.filter = c => c.parsed.y !== null;
    opts.plugins.tooltip.callbacks = { label: c => `${c.dataset.label}: $${c.parsed.y.toFixed(2)}M` };
    opts.layout = { padding: { right: 8 } };
    opts.scales = {
      x: { offset: true, grid: { display: false }, border: { color: GRID },
           ticks: { display: showX, color: INK } },
      y: { beginAtZero: true, grid: { color: GRID }, border: { display: false },
           afterFit: scale => { scale.width = Y_AXIS_WIDTH; },
           ticks: { color: INK2, maxTicksLimit: showX ? 4 : 6, callback: v => "$" + v.toFixed(dp) + "M" } }
    };
    ui.charts[key] = new root.Chart(document.getElementById(canvasId), { type, data, options: opts });
  }

  function bind() {
    if (ui.bound) return;
    ui.bound = true;
    document.getElementById("pf-tiles").addEventListener("click", e => {
      if (e.target.closest("#pf-dp-tile")) { ui.dpOpen = !ui.dpOpen; ctx.onChange(false); }
    });
  }

  function render(state, onChange) {
    ctx = { state, onChange };
    bind();
    const m = Metrics.summary(state.holdings, state.settings, state.as_of);
    document.getElementById("pf-asof").textContent =
      `As of ${state.as_of}. Public prices are Yahoo Finance closes; bond and T-bill prices are sample prices; private marks are the latest GP or sponsor statements. Positions, cost and income come from the blotter below.`;
    renderTiles(m, state.settings);
    renderCharts(m);
    holdings.render(document.getElementById("pf-holdings"), state, m.holdings, m.nav, onChange);
    root.Blotter.render(state, onChange);
    return m;
  }

  // Scroll a holding row into view and mark it for a few seconds (used by "View in Portfolio").
  function highlight(id) {
    const row = document.querySelector(`#pf-holdings tr[data-id="${CSS.escape(id)}"]`);
    if (!row) return;
    document.querySelectorAll("#pf-holdings tr.is-highlight").forEach(r => r.classList.remove("is-highlight"));
    row.classList.add("is-highlight");
    row.scrollIntoView({ block: "center" });
    setTimeout(() => row.classList.remove("is-highlight"), 4000);
  }

  root.Portfolio = { render, highlight };
})(window);
