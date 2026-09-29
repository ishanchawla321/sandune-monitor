// Portfolio tab: tiles, charts and the editable holdings table.
(function (root) {
  "use strict";

  const Fmt = root.Fmt, Metrics = root.Metrics;
  const L = Fmt.LABELS;
  const CLASS_ORDER = Object.keys(L.asset_class);
  const BUCKETS = ["liquid_now", "1_3y", "3y_plus"];
  const LIQUID_CLASSES = ["public_equity", "credit", "cash"];

  const ACCENT = "#1f3a5f", MUTED = "#a3adb8", GRID = "#e6e8ec", INK = "#1a2230", INK2 = "#5b6470";

  // ---- Column definitions. `scale` converts the typed value to stored dollars ($K fields = 1000). ----
  const COLS = [
    { key: "name", label: "Name", edit: "text", cls: "col-name" },
    { key: "asset_class", label: "Asset class", wrap: true, edit: "select", options: CLASS_ORDER, show: h => L.asset_class[h.asset_class] || h.asset_class },
    { key: "ticker_or_id", label: "Ticker/ID", edit: "text" },
    { key: "security_type", label: "Security type", edit: "select", options: Object.keys(L.security_type),
      show: h => L.security_type[h.security_type] || h.security_type },
    { key: "sector", label: "Sector", wrap: true, edit: "text" },
    // Unit price for priced securities only; funds, directs, real estate and cash carry their mark in Market value.
    { key: "price_or_mark", label: "Price", num: true, edit: "number", editable: h => Metrics.isPriced(h),
      show: h => (Metrics.isPriced(h) ? Fmt.number(h.price_or_mark, 2) : "") },
    { key: "quantity", label: "Quantity", num: true, edit: "number", editable: h => Metrics.isPriced(h),
      show: h => (Metrics.isPriced(h) ? Fmt.number(h.quantity, 0) : "") },
    // Computed for priced securities; for everything else it is the mark (or balance) and edits write price_or_mark.
    { key: "market_value", label: "Market value", num: true, k: true, edit: "number", field: "price_or_mark",
      scale: () => 1000, editable: h => !Metrics.isPriced(h) },
    { key: "cost", label: "Cost", num: true, k: true, edit: "number", scale: () => 1000, nullable: true },
    { key: "pnl", label: "Unrealized P&L", num: true, k: true },
    { key: "commitment", label: "Commitment", num: true, k: true, edit: "number", scale: () => 1000, nullable: true },
    { key: "unfunded", label: "Unfunded", num: true, k: true, edit: "number", scale: () => 1000 },
    { key: "pct_nav", label: "% NAV", num: true, show: h => Fmt.pct(h.pct_nav) },
    { key: "liquidity_bucket", label: "Liquidity", edit: "select", options: BUCKETS, show: h => L.liquidity_bucket[h.liquidity_bucket] || h.liquidity_bucket },
    { key: "liquidity_date", label: "Liquidity date", edit: "date" },
    { key: "mark_source", label: "Mark source", edit: "text" },
    { key: "mark_date", label: "Mark date", edit: "date" }
  ];

  // Default (compact) column set; "All columns" shows every column in COLS order.
  const COMPACT = ["name", "asset_class", "sector", "price_or_mark", "quantity", "market_value", "pct_nav", "pnl", "unfunded", "liquidity_bucket"];
  const visibleCols = all => (all ? COLS : COMPACT.map(k => COLS.find(c => c.key === k)));

  const ui = { sort: { key: null, dir: 1 }, dpOpen: false, charts: {}, bound: false, addClass: "public_equity", allCols: false };
  let ctx = null; // { state, onChange }

  const today = () => Fmt.today();
  const scaleOf = (col, h) => (col.scale ? col.scale(h) : 1);

  function rowsWithDerived(m) {
    return m.holdings.map(h => Object.assign({}, h, {
      pnl: h.cost === null || h.cost === undefined || h.cost === "" ? null : h.market_value - h.cost,
      pct_nav: m.nav ? h.market_value / m.nav : null
    }));
  }

  function cellText(col, h) {
    if (col.show) return col.show(h);
    if (col.k) return Fmt.thousands(h[col.key]);
    return h[col.key] === null || h[col.key] === undefined ? "" : String(h[col.key]);
  }

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

  // ---------------- Holdings table ----------------
  function renderTable(m) {
    const rows = rowsWithDerived(m);
    const cols = visibleCols(ui.allCols);
    const sortCol = COLS.find(c => c.key === ui.sort.key);
    const sortVal = h => {
      if (!sortCol.num) return String(cellText(sortCol, h)).toLowerCase();
      const v = h[sortCol.key];
      return v === null || v === undefined || v === "" ? -Infinity : Number(v);
    };

    const head = cols.map(c => {
      const active = ui.sort.key === c.key;
      const aria = active ? (ui.sort.dir > 0 ? "ascending" : "descending") : "none";
      const mark = active ? (ui.sort.dir > 0 ? " ▲" : " ▼") : "";
      return `<th class="${c.num ? "num " : ""}${c.cls || ""}" aria-sort="${aria}">
        <button type="button" class="sort" data-sort="${c.key}">${Fmt.esc(c.label)}${c.k ? " ($K)" : ""}${mark}</button></th>`;
    }).join("") + `<th class="col-act"><span class="sr-only">Actions</span></th>`;

    const sumK = (list, key) => list.reduce((s, h) => s + (Number(h[key]) || 0), 0);
    const totalRow = (label, list, cls) => {
      const mv = sumK(list, "market_value");
      const withCost = list.filter(h => h.pnl !== null);
      const hasCommitments = list.some(h => (h.commitment !== null && h.commitment !== undefined) || Number(h.unfunded) > 0);
      return `<tr class="${cls}">` + cols.map(c => {
        let v = "";
        if (c.key === "name") v = Fmt.esc(label);
        else if (c.key === "market_value") v = Fmt.thousands(mv);
        else if (c.key === "cost") v = Fmt.thousands(sumK(list, "cost"));
        else if (c.key === "pnl") v = withCost.length ? Fmt.thousands(sumK(withCost, "pnl")) : "";
        else if (c.key === "commitment" && hasCommitments) v = Fmt.thousands(sumK(list, "commitment"));
        else if (c.key === "unfunded" && hasCommitments) v = Fmt.thousands(sumK(list, "unfunded"));
        else if (c.key === "pct_nav") v = Fmt.pct(m.nav ? mv / m.nav : null);
        return `<td class="${c.num ? "num " : ""}${c.cls || ""}">${v}</td>`;
      }).join("") + `<td class="col-act"></td></tr>`;
    };

    let body = "";
    const known = CLASS_ORDER.concat(rows.map(h => h.asset_class).filter(k => !CLASS_ORDER.includes(k)));
    Array.from(new Set(known)).forEach(cls => {
      let group = rows.filter(h => h.asset_class === cls);
      if (!group.length) return;
      if (sortCol) group = group.slice().sort((a, b) => (sortVal(a) > sortVal(b) ? 1 : sortVal(a) < sortVal(b) ? -1 : 0) * ui.sort.dir);
      body += group.map(h => `<tr data-id="${Fmt.esc(h.id)}">` + cols.map(c => {
        const editable = c.edit && (!c.editable || c.editable(h));
        const attrs = editable ? ` data-edit="${c.key}" tabindex="0" title="Click to edit${c.scale && c.scale(h) === 1000 ? " ($K)" : ""}"` : "";
        return `<td class="${c.num ? "num " : ""}${c.cls || ""}${c.wrap ? " wrap-sm" : ""}${editable ? " editable" : ""}"${attrs}>${Fmt.esc(cellText(c, h))}</td>`;
      }).join("") + `<td class="col-act"><button type="button" class="link danger" data-delete="${Fmt.esc(h.id)}" aria-label="Delete ${Fmt.esc(h.name)}">Delete</button></td></tr>`).join("");
      body += totalRow((L.asset_class[cls] || cls) + " subtotal", group, "subtotal");
    });
    body += totalRow("Total (NAV)", rows, "grandtotal");

    const addRow = `<tr class="addrow"><td colspan="${cols.length + 1}"><div class="addrow-inner">
        <label for="pf-add-class">Add holding to</label>
        <select id="pf-add-class">${CLASS_ORDER.map(k => `<option value="${k}"${k === ui.addClass ? " selected" : ""}>${L.asset_class[k]}</option>`).join("")}</select>
        <button type="button" class="btn" id="pf-add">Add holding</button></div></td></tr>`;

    document.getElementById("pf-table").innerHTML = `<thead><tr>${head}</tr></thead><tbody>${body}</tbody><tfoot>${addRow}</tfoot>`;
  }

  // ---------------- Editing ----------------
  function parseNumber(text) {
    const t = String(text).trim().replace(/[$,\s]/g, "");
    if (t === "") return "";
    const neg = /^\(.*\)$/.test(t);
    const n = Number(t.replace(/[()]/g, ""));
    return isFinite(n) ? (neg ? -n : n) : NaN;
  }

  function startEdit(td) {
    const id = td.parentElement.dataset.id, key = td.dataset.edit;
    // Committing a previous edit re-renders the table, so the clicked cell may be stale: find its replacement.
    if (!td.isConnected) {
      td = Array.from(document.querySelectorAll("#pf-table tr[data-id]")).filter(tr => tr.dataset.id === id)
        .map(tr => tr.querySelector(`td[data-edit="${key}"]`))[0];
      if (!td) return;
    }
    if (td.querySelector("input, select")) return;
    const h = ctx.state.holdings.find(x => x.id === id);
    const col = COLS.find(c => c.key === key);
    if (!h || !col) return;
    const field = col.field || col.key;

    let input;
    if (col.edit === "select") {
      input = document.createElement("select");
      const options = col.options.includes(h[field]) || !h[field] ? col.options : col.options.concat(h[field]);
      options.forEach(o => {
        const opt = document.createElement("option");
        opt.value = o;
        opt.textContent = (L[key] && L[key][o]) || o;
        if (h[field] === o) opt.selected = true;
        input.appendChild(opt);
      });
    } else {
      input = document.createElement("input");
      input.type = col.edit === "date" ? "date" : "text";
      if (col.edit === "number") {
        input.inputMode = "decimal";
        const v = h[field];
        input.value = v === null || v === undefined ? "" : String(+(v / scaleOf(col, h)).toFixed(6));
      } else {
        input.value = h[field] === null || h[field] === undefined ? "" : h[field];
      }
    }
    input.className = "cell-input";
    input.setAttribute("aria-label", col.label);

    let done = false;
    const finish = commit => {
      if (done) return;
      done = true;
      if (commit) applyEdit(h, col, input.value);
      else ctx.onChange(false);
    };
    input.addEventListener("keydown", e => {
      if (e.key === "Enter") { e.preventDefault(); finish(true); }
      if (e.key === "Escape") { e.preventDefault(); finish(false); }
    });
    input.addEventListener("blur", () => finish(true));
    if (col.edit === "select") input.addEventListener("change", () => finish(true));

    td.textContent = "";
    td.appendChild(input);
    input.focus();
    if (input.select) input.select();
  }

  function applyEdit(h, col, raw) {
    let value = raw;
    if (col.edit === "number") {
      const n = parseNumber(raw);
      if (n === "") value = col.nullable ? null : 0;
      else if (isNaN(n)) return ctx.onChange(false); // not a number: keep the old value
      else value = n * scaleOf(col, h);
    } else if (col.edit === "text" || col.edit === "date") {
      value = String(raw).trim() || (col.key === "name" ? h.name : null);
    }
    const field = col.field || col.key;
    if (h[field] === value) return ctx.onChange(false);
    h[field] = value;
    if (field === "price_or_mark") { h.mark_source = "Manual edit"; h.mark_date = today(); }
    ctx.onChange(true);
  }

  function addHolding(cls) {
    const liquid = LIQUID_CLASSES.includes(cls);
    ctx.state.holdings.push({
      id: "h-" + Date.now().toString(36), asset_class: cls, name: "New holding", ticker_or_id: "",
      security_type: { public_equity: "common_stock", credit: "bond", private_credit: "first_lien_loan", private_fund: "lp_interest",
                       direct: "common_equity", real_estate: "jv_equity", cash: "cash" }[cls] || "",
      sector: cls === "cash" ? "Cash" : "", price_or_mark: 0, quantity: 0, market_value: null, cost: null,
      commitment: null, unfunded: 0, call_schedule: null,
      liquidity_bucket: liquid ? "liquid_now" : "3y_plus", liquidity_date: liquid ? today() : null,
      mark_source: "Manual entry", mark_date: today()
    });
    ctx.onChange(true);
  }

  function downloadCsv() {
    const m = Metrics.summary(ctx.state.holdings, ctx.state.settings, ctx.state.as_of);
    const rows = rowsWithDerived(m);
    const keys = COLS.map(c => c.key);
    const q = v => {
      const s = v === null || v === undefined ? "" : String(v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const lines = [
      q("Sample data. All holdings, ideas and figures are illustrative. Amounts in USD."),
      COLS.map(c => q(c.label)).join(","),
      ...rows.map(h => keys.map(k => {
        const v = h[k];
        return q(typeof v === "number" ? +v.toFixed(k === "pct_nav" ? 6 : 2) : v);
      }).join(","))
    ];
    const blob = new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `sandune-holdings-sample-${ctx.state.as_of}.csv`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }

  function bind() {
    if (ui.bound) return;
    ui.bound = true;
    const panel = document.getElementById("tab-portfolio");
    panel.addEventListener("click", e => {
      const t = e.target;
      if (t.closest("#pf-dp-tile")) { ui.dpOpen = !ui.dpOpen; return ctx.onChange(false); }
      const sortBtn = t.closest("[data-sort]");
      if (sortBtn) {
        const key = sortBtn.dataset.sort;
        ui.sort = ui.sort.key === key ? { key, dir: -ui.sort.dir } : { key, dir: 1 };
        return ctx.onChange(false);
      }
      const del = t.closest("[data-delete]");
      if (del) {
        const h = ctx.state.holdings.find(x => x.id === del.dataset.delete);
        if (h && root.confirm(`Delete "${h.name}"?`)) {
          ctx.state.holdings = ctx.state.holdings.filter(x => x !== h);
          ctx.onChange(true);
        }
        return;
      }
      if (t.closest("#pf-add")) return addHolding(document.getElementById("pf-add-class").value);
      if (t.closest("#pf-csv")) return downloadCsv();
      if (t.closest("#pf-cols")) { ui.allCols = !ui.allCols; return ctx.onChange(false); }
      const td = t.closest("td[data-edit]");
      if (td) startEdit(td);
    });
    panel.addEventListener("keydown", e => {
      const td = e.target.closest && e.target.closest("td[data-edit]");
      if (td && e.target === td && e.key === "Enter") { e.preventDefault(); startEdit(td); }
    });
    panel.addEventListener("change", e => {
      if (e.target.id === "pf-add-class") ui.addClass = e.target.value;
    });
  }

  function render(state, onChange) {
    ctx = { state, onChange };
    bind();
    const m = Metrics.summary(state.holdings, state.settings, state.as_of);
    document.getElementById("pf-asof").textContent =
      `As of ${state.as_of}. Public prices are Yahoo Finance closes; bond and T-bill prices are sample prices; private marks are the latest GP or sponsor statements.`;
    renderTiles(m, state.settings);
    renderCharts(m);
    const tog = document.getElementById("pf-cols");
    tog.setAttribute("aria-pressed", String(ui.allCols));
    tog.textContent = ui.allCols ? "Compact view" : "All columns";
    renderTable(m);
    return m;
  }

  // Columns and cell text are shared with the Pro Forma holdings table.
  root.Portfolio = { render, COLS, COMPACT, visibleCols, cellText, rowsWithDerived };
})(window);
