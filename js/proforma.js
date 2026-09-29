// Pro Forma tab: pick investments, see the book before and after, with limit flags.
(function (root) {
  "use strict";

  const Fmt = root.Fmt, Metrics = root.Metrics, Model = root.ProFormaModel;
  const L = Fmt.LABELS, esc = Fmt.esc;
  const CLASS_ORDER = Object.keys(L.asset_class);
  const ACCENT = "#1f3a5f", MUTED = "#a3adb8", GRID = "#e5e7eb", INK = "#1a1a1a", INK2 = "#5b6470";
  const Y_AXIS_WIDTH = 64;

  const ui = { bound: false, charts: {} };
  let ctx = null; // { state, onChange }

  function pfState() {
    if (!ctx.state.proforma) ctx.state.proforma = { selections: {} };
    return ctx.state.proforma;
  }
  function selection(inv) {
    return Object.assign(Model.defaultSelection(inv), pfState().selections[inv.id] || {});
  }
  function save() { root.Store.save(ctx.state); }

  // ---------------- Selector ----------------
  function renderThemePicker() {
    const themes = (ctx.state.themes || []).filter(t => (t.linked_investment_ids || []).length);
    document.getElementById("pf2-theme-pick").innerHTML = `<option value="">Add theme…</option>` +
      themes.map(t => `<option value="${esc(t.id)}">${esc(t.name)} (${t.linked_investment_ids.length} investments)</option>`).join("");
  }

  // Ticks every investment linked to the theme at its default size; each can then be edited or unticked.
  function addTheme(themeId) {
    const theme = (ctx.state.themes || []).find(t => t.id === themeId);
    if (!theme) return;
    root.ThemesModel.linked(ctx.state, theme).forEach(inv => {
      pfState().selections[inv.id] = Object.assign(Model.defaultSelection(inv), { include: true, via_theme: theme.id });
    });
    save();
    renderSelector();
    renderThemePicker();
    renderOutputs();
  }

  function renderSelector() {
    const sources = Model.fundingSources(ctx.state.holdings);
    const themeName = id => ((ctx.state.themes || []).find(t => t.id === id) || {}).name;
    const rows = ctx.state.investments.map(i => {
      const s = selection(i);
      const funded = (Number(s.check) || 0) * (Number(s.funded_pct) || 0);
      const fee = (Number(s.check) || 0) * (Number(s.fee_pct) || 0);
      const srcOpts = [`<option value="cash"${s.source === "cash" ? " selected" : ""}>Cash</option>`].concat(sources.map(h =>
        `<option value="${esc(h.id)}"${s.source === h.id ? " selected" : ""}>${esc(h.name)} ($${Fmt.thousands(Metrics.marketValue(h))}K)</option>`)).join("");
      const tag = s.include && s.via_theme && themeName(s.via_theme) ? ` <span class="tag">${esc(themeName(s.via_theme))}</span>` : "";
      return `<tr data-sel="${esc(i.id)}" class="${s.include ? "sel-on" : ""}">
        <td class="col-name"><label class="sel-inc"><input type="checkbox" data-sel-field="include"${s.include ? " checked" : ""}> ${esc(i.name)}</label>${tag}</td>
        <td>${esc(L.type[i.type] || i.type)}</td>
        <td class="num"><input class="num-input" inputmode="decimal" data-sel-field="check" value="${esc(+(Number(s.check) / 1000).toFixed(3))}" aria-label="Check size in $K for ${esc(i.name)}"></td>
        <td class="num"><input class="num-input" inputmode="decimal" data-sel-field="funded_pct" value="${esc(+(Number(s.funded_pct) * 100).toFixed(2))}" aria-label="Funded percent for ${esc(i.name)}"></td>
        <td class="num"><input class="num-input" inputmode="decimal" data-sel-field="fee_pct" value="${esc(+(Number(s.fee_pct) * 100).toFixed(2))}" aria-label="Upfront fee percent for ${esc(i.name)}"></td>
        <td><select data-sel-field="source" aria-label="Funding source for ${esc(i.name)}">${srcOpts}</select></td>
        <td class="num" data-out="funded">${Fmt.thousands(funded)}</td>
        <td class="num" data-out="unfunded">${Fmt.thousands((Number(s.check) || 0) - funded)}</td>
        <td class="num" data-out="fee">${Fmt.thousands(fee)}</td></tr>`;
    }).join("");
    document.getElementById("pf2-selector").innerHTML = `<thead><tr>
        <th class="col-name">Include investment</th><th>Type</th><th class="num">Check ($K)</th><th class="num">Funded %</th>
        <th class="num">Upfront fee %</th><th>Funding source</th><th class="num">Funded ($K)</th><th class="num">Unfunded ($K)</th><th class="num">Fee ($K)</th>
      </tr></thead><tbody>${rows}</tbody>`;
  }

  function onSelectorChange(el) {
    const tr = el.closest("tr[data-sel]");
    const inv = ctx.state.investments.find(i => i.id === tr.dataset.sel);
    const s = selection(inv);
    const f = el.dataset.selField;
    if (f === "include") { s.include = el.checked; if (!s.include) delete s.via_theme; }
    else if (f === "source") s.source = el.value;
    else {
      const n = Number(String(el.value).replace(/[$,%\s]/g, ""));
      if (el.value.trim() === "" || !isFinite(n) || n < 0) {
        el.value = f === "check" ? +(s.check / 1000).toFixed(3) : +(s[f] * 100).toFixed(2);
        return;
      }
      if (f === "check") s.check = n * 1000;
      if (f === "funded_pct") s.funded_pct = Math.min(n, 100) / 100;
      if (f === "fee_pct") s.fee_pct = n / 100;
    }
    pfState().selections[inv.id] = s;
    save();
    if (f === "include") renderSelector(); // refresh the theme tag
    else tr.classList.toggle("sel-on", !!s.include);
    const funded = (Number(s.check) || 0) * s.funded_pct;
    tr.querySelector('[data-out="funded"]').textContent = Fmt.thousands(funded);
    tr.querySelector('[data-out="unfunded"]').textContent = Fmt.thousands((Number(s.check) || 0) - funded);
    tr.querySelector('[data-out="fee"]').textContent = Fmt.thousands((Number(s.check) || 0) * s.fee_pct);
    renderOutputs();
  }

  // ---------------- Flags ----------------
  function flagChecks(before, after, s) {
    const lim = s.limits;
    return {
      dry_powder: { breach: m => m.dry_powder.total < lim.dry_powder_floor, limit: "Floor " + Fmt.millions(lim.dry_powder_floor, 1) },
      illiquid_incl: { breach: m => m.illiquid.pct_incl_unfunded > lim.illiquid_incl_unfunded_pct, limit: "Max " + Fmt.pct(lim.illiquid_incl_unfunded_pct, 0) },
      largest_position: { breach: m => !!m.largest_position && m.largest_position.pct > lim.single_position_pct, limit: "Max " + Fmt.pct(lim.single_position_pct, 1) },
      largest_sector: { breach: m => !!m.largest_sector && m.largest_sector.pct > lim.largest_sector_pct, limit: "Max " + Fmt.pct(lim.largest_sector_pct, 0) }
    };
  }
  // ok | caused (breach caused by this trade) | pre (breach before trade)
  function flagState(check, before, after) {
    const b = check.breach(before), a = check.breach(after);
    return { before: b, after: a, state: a ? (b ? "pre" : "caused") : "ok" };
  }
  const FLAG_TEXT = { ok: "OK", caused: "Breach caused by this trade", pre: "Breach before trade" };
  const flagHtml = f => `<span class="flag flag-${f.state}">${FLAG_TEXT[f.state]}</span>`;

  // ---------------- Outputs ----------------
  const dM = v => (Math.abs(v) < 500 ? "0.00" : (v > 0 ? "+" : "") + Fmt.millions(v, 2));
  const dPP = v => (Math.abs(v) < 0.00005 ? "0.00 pp" : (v > 0 ? "+" : "(") + Math.abs(v * 100).toFixed(2) + (v > 0 ? " pp" : ") pp"));

  function renderOutputs() {
    const st = ctx.state, s = st.settings;
    const pf = Model.apply(st, pfState().selections);
    const before = Metrics.summary(st.holdings, s, st.as_of);
    const after = Metrics.summary(pf.holdings, s, st.as_of);
    const checks = flagChecks(before, after, s);
    const flags = {};
    Object.keys(checks).forEach(k => { flags[k] = flagState(checks[k], before, after); });

    // Trades summary and warnings
    const tradeText = pf.trades.length
      ? pf.trades.map(t => `<li><b>${esc(t.name)}</b>: check $${Fmt.thousands(t.check)}K, funded $${Fmt.thousands(t.funded)}K` +
          (t.unfunded > 0 ? `, unfunded $${Fmt.thousands(t.unfunded)}K called in year 1` : "") +
          `; from ${t.from_holding > 0 ? `${esc(t.source_name)} $${Fmt.thousands(t.from_holding)}K` : ""}${t.from_holding > 0 && t.from_cash > 0.5 ? " + " : ""}${t.from_cash > 0.5 || t.from_holding <= 0 ? `cash $${Fmt.thousands(t.from_cash)}K` : ""}` +
          (t.fee > 0 ? `; fee $${Fmt.thousands(t.fee)}K paid from cash` : "") + `</li>`).join("")
      : `<li class="muted">No investments selected. Tick one above, or add a theme, to see its effect.</li>`;
    document.getElementById("pf2-trades").innerHTML = `<ul class="trades">${tradeText}</ul>` +
      (pf.warnings.length ? `<div class="warn" role="alert">${pf.warnings.map(w => `<p>${esc(w)}</p>`).join("")}</div>` : "");

    // Before / After / Change table
    const row = (label, b, a, chg, flag, limit, cls) =>
      `<tr class="${cls || ""}"><td class="col-name">${label}</td><td class="num">${b}</td><td class="num">${a}</td><td class="num">${chg}</td>` +
      `<td>${limit || ""}</td><td>${flag ? flagHtml(flag) : ""}</td></tr>`;
    const money = (label, key, flag, limit) => row(label, Fmt.millions(key(before), 2), Fmt.millions(key(after), 2), dM(key(after) - key(before)), flag, limit);
    const pct = (label, key, flag, limit) => row(label, Fmt.pct(key(before), 2), Fmt.pct(key(after), 2), dPP(key(after) - key(before)), flag, limit);
    const named = (x, nameKey) => (x ? `${esc(x[nameKey])}<br><span class="muted">${Fmt.pct(x.pct, 2)}</span>` : "n/a");
    const lpName = x => (x ? { name: x.holding.name, pct: x.pct } : null);

    let html = `<thead><tr><th class="col-name">Metric</th><th class="num">Before</th><th class="num">After</th><th class="num">Change</th><th>Limit</th><th>Flag</th></tr></thead><tbody>`;
    html += money("NAV", m => m.nav);
    html += money("Cash and T-bills", m => m.cash_and_bills);
    html += money("Unfunded", m => m.unfunded);
    html += money("Dry powder", m => m.dry_powder.total, flags.dry_powder, checks.dry_powder.limit);
    html += `<tr class="note-row"><td colspan="6">Funding from a liquid position instead of cash reduces dry powder by the haircut-adjusted amount, not the full amount.</td></tr>`;
    html += pct("Illiquid %", m => m.illiquid.pct);
    html += pct("Illiquid % incl. unfunded", m => m.illiquid.pct_incl_unfunded, flags.illiquid_incl, checks.illiquid_incl.limit);
    html += row("Largest position", named(lpName(before.largest_position), "name"), named(lpName(after.largest_position), "name"),
                dPP((after.largest_position ? after.largest_position.pct : 0) - (before.largest_position ? before.largest_position.pct : 0)),
                flags.largest_position, checks.largest_position.limit);
    html += row("Largest sector ex-cash", named(before.largest_sector, "sector"), named(after.largest_sector, "sector"),
                dPP((after.largest_sector ? after.largest_sector.pct : 0) - (before.largest_sector ? before.largest_sector.pct : 0)),
                flags.largest_sector, checks.largest_sector.limit);
    html += `<tr class="group-row"><td class="col-name" colspan="6">Asset-class mix, % of NAV</td></tr>`;
    CLASS_ORDER.forEach(k => {
      const b = before.nav ? (before.by_asset_class[k] || 0) / before.nav : 0;
      const a = after.nav ? (after.by_asset_class[k] || 0) / after.nav : 0;
      html += row(esc(L.asset_class[k]), Fmt.pct(b, 2), Fmt.pct(a, 2), dPP(a - b));
    });
    document.getElementById("pf2-table").innerHTML = html + "</tbody>";

    // Breaches that already existed before the trade, listed separately.
    const labels = { dry_powder: "Dry powder below floor", illiquid_incl: "Illiquid % incl. unfunded above limit",
                     largest_position: "Largest position above single-position limit", largest_sector: "Largest sector above limit" };
    const pre = Object.keys(flags).filter(k => flags[k].before);
    document.getElementById("pf2-pre").innerHTML = `<h3>Breaches before trade</h3>` + (pre.length
      ? `<ul>${pre.map(k => `<li><span class="flag flag-pre">Breach before trade</span> ${esc(labels[k])}${flags[k].after ? "" : " (resolved by this trade)"}</li>`).join("")}</ul>`
      : `<p class="muted">None. The current book is within every limit.</p>`);

    renderCharts(before, after);
    renderHoldings(after, pf);
  }

  // ---------------- Charts ----------------
  function renderCharts(before, after) {
    if (!root.Chart) return;
    const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const labels = after.ladder.map(l => (l.year === 0 ? "Now" : `Y${l.year} ${MON[+l.through.slice(5, 7) - 1]} '${l.through.slice(2, 4)}`));
    const baseOpts = showX => ({
      animation: false, responsive: true, maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      layout: { padding: { right: 8 } },
      plugins: { legend: { display: false }, tooltip: { animation: false, filter: c => c.parsed.y !== null,
        callbacks: { label: c => `${c.dataset.label}: $${c.parsed.y.toFixed(2)}M` } } },
      scales: {
        x: { offset: true, grid: { display: false }, border: { color: GRID }, ticks: { display: showX, color: INK } },
        y: { beginAtZero: true, grid: { color: GRID }, border: { display: false }, afterFit: sc => { sc.width = Y_AXIS_WIDTH; },
             ticks: { color: INK2, maxTicksLimit: showX ? 4 : 6, callback: v => "$" + v.toFixed(showX ? 1 : 0) + "M" } }
      }
    });
    const ladderData = { labels, datasets: [
      { label: "Before", data: before.ladder.map(l => l.net / 1e6), borderColor: MUTED, backgroundColor: MUTED, borderWidth: 2, pointRadius: 3 },
      { label: "After", data: after.ladder.map(l => l.net / 1e6), borderColor: ACCENT, backgroundColor: ACCENT, borderWidth: 2, pointRadius: 4 }
    ] };
    const callsData = { labels, datasets: [
      { label: "After-trade capital calls", data: after.ladder.map(l => (l.year === 0 ? null : l.calls / 1e6)),
        backgroundColor: MUTED, borderRadius: 4, borderSkipped: "start", maxBarThickness: 28 }
    ] };
    if (ui.charts.ladder) {
      ui.charts.ladder.data = ladderData; ui.charts.ladder.update("none");
      ui.charts.calls.data = callsData; ui.charts.calls.update("none");
      return;
    }
    const lo = baseOpts(false);
    lo.plugins.legend = { display: true, position: "top", align: "start", labels: { color: INK, boxWidth: 12, boxHeight: 12 } };
    ui.charts.ladder = new root.Chart(document.getElementById("pf2-chart-ladder"), { type: "line", data: ladderData, options: lo });
    ui.charts.calls = new root.Chart(document.getElementById("pf2-chart-calls"), { type: "bar", data: callsData, options: baseOpts(true) });
  }

  // ---------------- Pro forma holdings ----------------
  function renderHoldings(after, pf) {
    const P = root.Portfolio;
    const cols = P.COLS;
    const rows = P.rowsWithDerived(after);
    const sold = {};
    pf.trades.forEach(t => { if (t.from_holding > 0) sold[t.source] = (sold[t.source] || 0) + t.from_holding; });
    const sumK = (list, key) => list.reduce((s, h) => s + (Number(h[key]) || 0), 0);

    const head = cols.map(c => `<th class="${c.num ? "num " : ""}${c.cls || ""}">${esc(c.label)}${c.k ? " ($K)" : ""}</th>`).join("");
    const cell = (c, h) => {
      let t = esc(P.cellText(c, h));
      if (c.key === "name" && h.pf) t = `<span class="badge badge-pf">PF</span> ` + t;
      if (c.key === "name" && sold[h.id]) t += ` <span class="badge badge-sold">Sold $${Fmt.thousands(sold[h.id])}K</span>`;
      return `<td class="${c.num ? "num " : ""}${c.cls || ""}">${t}</td>`;
    };
    const total = (label, list, cls) => {
      const hasCommit = list.some(h => (h.commitment !== null && h.commitment !== undefined) || Number(h.unfunded) > 0);
      const withCost = list.filter(h => h.pnl !== null);
      const mv = sumK(list, "market_value");
      return `<tr class="${cls}">` + cols.map(c => {
        let v = "";
        if (c.key === "name") v = esc(label);
        else if (c.key === "market_value") v = Fmt.thousands(mv);
        else if (c.key === "cost") v = Fmt.thousands(sumK(list, "cost"));
        else if (c.key === "pnl") v = withCost.length ? Fmt.thousands(sumK(withCost, "pnl")) : "";
        else if ((c.key === "commitment" || c.key === "unfunded") && hasCommit) v = Fmt.thousands(sumK(list, c.key));
        else if (c.key === "pct_nav") v = Fmt.pct(after.nav ? mv / after.nav : null);
        return `<td class="${c.num ? "num " : ""}${c.cls || ""}">${v}</td>`;
      }).join("") + "</tr>";
    };
    let body = "";
    CLASS_ORDER.forEach(k => {
      const g = rows.filter(h => h.asset_class === k);
      if (!g.length) return;
      body += g.map(h => `<tr class="${h.pf ? "pf-new" : sold[h.id] ? "pf-funded" : ""}">${cols.map(c => cell(c, h)).join("")}</tr>`).join("");
      body += total(L.asset_class[k] + " subtotal", g, "subtotal");
    });
    body += total("Total (NAV)", rows, "grandtotal");
    document.getElementById("pf2-holdings").innerHTML = `<thead><tr>${head}</tr></thead><tbody>${body}</tbody>`;
  }

  // ---------------- Limits panel (shared settings) ----------------
  const SETTINGS = [
    { path: "reserve", label: "Reserve ($K)", kind: "k" },
    { path: "limits.dry_powder_floor", label: "Dry powder floor ($K)", kind: "k" },
    { path: "limits.illiquid_incl_unfunded_pct", label: "Illiquid incl. unfunded max (%)", kind: "pct" },
    { path: "limits.single_position_pct", label: "Single position max (%)", kind: "pct" },
    { path: "limits.largest_sector_pct", label: "Largest sector max (%)", kind: "pct" },
    { path: "haircuts.t_bill", label: "Haircut: T-bills (% counted)", kind: "pct" },
    { path: "haircuts.public_equity", label: "Haircut: public equity (% counted)", kind: "pct" },
    { path: "haircuts.credit", label: "Haircut: liquid credit / HY (% counted)", kind: "pct" }
  ];
  const getPath = (o, p) => p.split(".").reduce((x, k) => (x ? x[k] : undefined), o);
  const setPath = (o, p, v) => { const ks = p.split("."); ks.slice(0, -1).reduce((x, k) => x[k], o)[ks[ks.length - 1]] = v; };
  const toInput = (kind, v) => (kind === "k" ? +(v / 1000).toFixed(3) : +(v * 100).toFixed(3));

  function renderLimits() {
    const s = ctx.state.settings;
    document.getElementById("pf2-limits").innerHTML = SETTINGS.map(x =>
      `<label class="fld"><span>${esc(x.label)}</span><input inputmode="decimal" data-setting="${x.path}" data-kind="${x.kind}" value="${esc(toInput(x.kind, getPath(s, x.path)))}"></label>`).join("");
  }

  function onSettingChange(el) {
    const s = ctx.state.settings;
    const n = Number(String(el.value).replace(/[$,%\s]/g, ""));
    if (el.value.trim() === "" || !isFinite(n) || n < 0) { el.value = toInput(el.dataset.kind, getPath(s, el.dataset.setting)); return; }
    setPath(s, el.dataset.setting, el.dataset.kind === "k" ? n * 1000 : n / 100);
    save();
    renderOutputs();
  }

  function bind() {
    if (ui.bound) return;
    ui.bound = true;
    const panel = document.getElementById("tab-proforma");
    panel.addEventListener("change", e => {
      if (e.target.id === "pf2-theme-pick") { const v = e.target.value; e.target.value = ""; return v ? addTheme(v) : undefined; }
      if (e.target.matches("[data-sel-field]")) return onSelectorChange(e.target);
      if (e.target.matches("[data-setting]")) return onSettingChange(e.target);
    });
    panel.addEventListener("keydown", e => {
      if (e.key === "Enter" && e.target.matches && e.target.matches("input[data-sel-field], input[data-setting]") && e.target.type !== "checkbox") {
        e.preventDefault();
        e.target.blur();
      }
    });
  }

  function render(state, onChange) {
    ctx = { state, onChange };
    bind();
    renderThemePicker();
    renderSelector();
    renderLimits();
    renderOutputs();
  }

  root.ProForma = { render };
})(window);
