// Pro Forma tab: pick investments, see the book before and after, with limit flags.
(function (root) {
  "use strict";

  const Fmt = root.Fmt, Metrics = root.Metrics, Model = root.ProFormaModel;
  const L = Fmt.LABELS, esc = Fmt.esc;
  const CLASS_ORDER = Object.keys(L.asset_class);
  const ACCENT = "#1f3a5f", MUTED = "#a3adb8", GRID = "#e6e8ec", INK = "#1a2230", INK2 = "#5b6470";
  const Y_AXIS_WIDTH = 64;

  const ui = { bound: false, charts: {}, funded_note: null };
  let ctx = null; // { state, onChange }

  function pfState() {
    if (!ctx.state.proforma) ctx.state.proforma = { selections: {} };
    return ctx.state.proforma;
  }
  function selection(inv) {
    return Object.assign(Model.defaultSelection(inv), pfState().selections[inv.id] || {});
  }
  function save() { root.Store.save(ctx.state); }

  // ---------------- Checklist of prospective investments ----------------
  function renderSelector() {
    const sources = Model.fundingSources(ctx.state.holdings);
    const list = Model.prospective(ctx.state);
    const rows = list.map(i => {
      const s = selection(i);
      const srcOpts = [`<option value="cash"${s.source === "cash" ? " selected" : ""}>Cash</option>`].concat(sources.map(h =>
        `<option value="${esc(h.id)}"${s.source === h.id ? " selected" : ""}>${esc(h.name)} ($${Fmt.thousands(Metrics.marketValue(h))}K)</option>`)).join("");
      return `<tr data-sel="${esc(i.id)}" class="${s.include ? "sel-on" : ""}">
        <td class="col-name"><span class="sel-row"><input type="checkbox" data-sel-field="include"${s.include ? " checked" : ""} aria-label="Model ${esc(i.name)}"> <button type="button" class="link name-link" data-open-investment="${esc(i.id)}" title="Open the investment one-pager">${esc(i.name)}</button></span></td>
        <td class="wrap-sm">${esc(L.type[i.type] || i.type)}</td>
        <td>${esc(L.status[i.status] || i.status)}</td>
        <td class="num"><input class="num-input" inputmode="decimal" data-sel-field="check" value="${esc(+(Number(s.check) / 1000).toFixed(3))}" aria-label="Position size in $K for ${esc(i.name)}"></td>
        <td class="num"><input class="num-input" inputmode="decimal" data-sel-field="funded_pct" value="${esc(+(Number(s.funded_pct) * 100).toFixed(2))}" aria-label="Funded percent for ${esc(i.name)}"></td>
        <td class="num"><input class="num-input" inputmode="decimal" data-sel-field="fee_pct" value="${esc(+(Number(s.fee_pct) * 100).toFixed(2))}" aria-label="Upfront fee percent for ${esc(i.name)}"></td>
        <td><select data-sel-field="source" aria-label="Funding source for ${esc(i.name)}">${srcOpts}</select></td></tr>`;
    }).join("");
    const empty = list.length ? "" : `<tr><td class="col-name muted" colspan="7">No prospective investments. Investments with status Watching, Researching or Late stage appear here.</td></tr>`;
    // Investments funded while ticked are no longer prospective: drop their selection and say so once.
    const gone = Object.keys(pfState().selections).filter(id => pfState().selections[id].include && !list.some(i => i.id === id))
      .map(id => ctx.state.investments.find(i => i.id === id)).filter(i => i && i.status === "invested");
    if (gone.length) {
      ui.funded_note = gone.map(i => i.name);
      gone.forEach(i => { delete pfState().selections[i.id]; });
      save();
    }
    const note = ui.funded_note && ui.funded_note.length ? `<tr class="note-row"><td colspan="7">${esc(ui.funded_note.join(", "))} ${ui.funded_note.length === 1 ? "is" : "are"} now in Portfolio &gt; Current and no longer modelled here.</td></tr>` : "";
    document.getElementById("pf2-selector").innerHTML = `<thead><tr>
        <th class="col-name">Investment</th><th>Type</th><th>Status</th><th class="num">Position size ($K)</th><th class="num">Funded %</th>
        <th class="num">Upfront fee %</th><th>Funding source</th>
      </tr></thead><tbody>${note}${rows}${empty}</tbody>`;
    document.getElementById("pf2-sel-count").textContent = `${list.filter(i => selection(i).include).length} of ${list.length} selected`;
  }

  function onSelectorChange(el) {
    const tr = el.closest("tr[data-sel]");
    const inv = ctx.state.investments.find(i => i.id === tr.dataset.sel);
    const s = selection(inv);
    const f = el.dataset.selField;
    if (f === "include") s.include = el.checked;
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
    tr.classList.toggle("sel-on", !!s.include);
    const list = Model.prospective(ctx.state);
    document.getElementById("pf2-sel-count").textContent = `${list.filter(i => selection(i).include).length} of ${list.length} selected`;
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
  const FLAG_TEXT = { ok: "OK", caused: "Breach from trade", pre: "Breach before trade" };
  const flagHtml = f => `<span class="flag flag-${f.state}">${FLAG_TEXT[f.state]}</span>`;

  // ---------------- Outputs ----------------
  // Changes are signed ($M or percentage points). dir: +1 higher is better, -1 lower is better, 0 neither.
  const MINUS = "−";
  const EPS = { m: 500, pp: 0.00005 };
  const signed = (v, s) => (v > 0 ? "+" : MINUS) + s;
  const dM = v => (Math.abs(v) < EPS.m ? "0.00" : signed(v, Math.abs(v / 1e6).toFixed(2)));
  const dPP = v => (Math.abs(v) < EPS.pp ? "0.00 pp" : signed(v, Math.abs(v * 100).toFixed(2) + " pp"));
  const chgClass = (v, dir, eps) => (Math.abs(v) < eps ? "chg-flat" : dir === 0 ? "chg-neutral" : v * dir > 0 ? "chg-good" : "chg-bad");

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
      ? pf.trades.map(t => `<li><b>${esc(t.name)}</b>: position $${Fmt.thousands(t.check)}K, funded $${Fmt.thousands(t.funded)}K` +
          (t.unfunded > 0 ? `, unfunded $${Fmt.thousands(t.unfunded)}K called in year 1` : "") +
          `; from ${t.from_holding > 0 ? `${esc(t.source_name)} $${Fmt.thousands(t.from_holding)}K` : ""}${t.from_holding > 0 && t.from_cash > 0.5 ? " + " : ""}${t.from_cash > 0.5 || t.from_holding <= 0 ? `cash $${Fmt.thousands(t.from_cash)}K` : ""}` +
          (t.fee > 0 ? `; fee $${Fmt.thousands(t.fee)}K paid from cash` : "") + `</li>`).join("")
      : `<li class="muted">Nothing selected. Tick a prospective investment above to see its effect on the book.</li>`;
    document.getElementById("pf2-trades").innerHTML = `<ul class="trades">${tradeText}</ul>` +
      (pf.warnings.length ? `<div class="warn" role="alert">${pf.warnings.map(w => `<p>${esc(w)}</p>`).join("")}</div>` : "");

    // Current / Pro Forma / Change table with a Threshold group (Limit, Flag).
    const row = (label, b, a, chg, chgCls, flag, limit) =>
      `<tr class="${flag && flag.state !== "ok" ? "row-" + flag.state : ""}"><td class="col-name">${label}</td><td class="num" data-label="Current">${b}</td>` +
      `<td class="num pfc" data-label="Pro forma">${a}</td><td class="num ${chgCls}" data-label="Change">${chg}</td>` +
      `<td class="lim" data-label="Limit">${limit || ""}</td><td class="flagcell">${flag ? flagHtml(flag) : ""}</td></tr>`;
    const money = (label, key, dir, flag, limit) => {
      const d = key(after) - key(before);
      return row(label, Fmt.millions(key(before), 2), Fmt.millions(key(after), 2), dM(d), chgClass(d, dir, EPS.m), flag, limit);
    };
    const pct = (label, key, dir, flag, limit) => {
      const d = key(after) - key(before);
      return row(label, Fmt.pct(key(before), 2), Fmt.pct(key(after), 2), dPP(d), chgClass(d, dir, EPS.pp), flag, limit);
    };
    const named = (x, nameKey) => (x ? `${esc(x[nameKey])}<span class="sub-num">${Fmt.pct(x.pct, 2)}</span>` : "n/a");
    const lpName = x => (x ? { name: x.holding.name, pct: x.pct } : null);
    const pctOf = x => (x ? x.pct : 0);
    const group = label => `<tr class="group-row"><td class="col-name" colspan="6">${esc(label)}</td></tr>`;

    let html = `<thead>
        <tr><th class="col-name" rowspan="2">Metric</th><th class="num" rowspan="2">Current</th><th class="num pfc" rowspan="2">Pro Forma</th>
          <th class="num" rowspan="2">Change</th><th class="th-group" colspan="2">Threshold</th></tr>
        <tr><th class="lim">Limit</th><th>Flag</th></tr></thead><tbody>`;
    html += group("Liquidity");
    html += money("NAV", m => m.nav, 1);
    html += money("Cash and T-bills", m => m.cash_and_bills, 1);
    html += money("Unfunded", m => m.unfunded, -1);
    html += money("Dry powder", m => m.dry_powder.total, 1, flags.dry_powder, checks.dry_powder.limit);
    html += `<tr class="note-row"><td colspan="6">Funding from a liquid position instead of cash reduces dry powder by the haircut-adjusted amount, not the full amount.</td></tr>`;
    html += pct("Illiquid %", m => m.illiquid.pct, -1);
    html += pct("Illiquid % incl. unfunded", m => m.illiquid.pct_incl_unfunded, -1, flags.illiquid_incl, checks.illiquid_incl.limit);
    html += group("Concentration");
    const dPos = pctOf(after.largest_position) - pctOf(before.largest_position);
    html += row("Largest position", named(lpName(before.largest_position), "name"), named(lpName(after.largest_position), "name"),
                dPP(dPos), chgClass(dPos, -1, EPS.pp), flags.largest_position, checks.largest_position.limit);
    const dSec = pctOf(after.largest_sector) - pctOf(before.largest_sector);
    html += row("Largest sector ex-cash", named(before.largest_sector, "sector"), named(after.largest_sector, "sector"),
                dPP(dSec), chgClass(dSec, -1, EPS.pp), flags.largest_sector, checks.largest_sector.limit);
    html += group("Asset mix, % of NAV");
    CLASS_ORDER.forEach(k => {
      const b = before.nav ? (before.by_asset_class[k] || 0) / before.nav : 0;
      const a = after.nav ? (after.by_asset_class[k] || 0) / after.nav : 0;
      html += row(esc(L.asset_class[k]), Fmt.pct(b, 2), Fmt.pct(a, 2), dPP(a - b), chgClass(a - b, 0, EPS.pp));
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

  // ---------------- Pro forma holdings (same cards as Portfolio > Current, read-only) ----------------
  const sold = {};
  const holdings = root.Holdings.create({ prefix: "pf2", editable: false,
    badge: r => (r.pf ? `<span class="badge badge-pf">PF</span> ` : ""),
    suffix: r => (sold[r.id] ? ` <span class="badge badge-sold">Sold $${Fmt.thousands(sold[r.id])}K</span>` : ""),
    rowClass: r => (sold[r.id] ? "pf-funded" : "") });
  function renderHoldings(after, pf) {
    Object.keys(sold).forEach(k => delete sold[k]);
    pf.trades.forEach(t => { if (t.from_holding > 0) sold[t.source] = (sold[t.source] || 0) + t.from_holding; });
    holdings.render(document.getElementById("pf2-holdings"), ctx.state, after.holdings, after.nav, () => renderOutputs());
  }

  // ---------------- Limits panel (shared settings) ----------------
  const LIMITS = [
    { path: "reserve", label: "Reserve", kind: "k" },
    { path: "limits.dry_powder_floor", label: "Dry powder floor", kind: "k" },
    { path: "limits.illiquid_incl_unfunded_pct", label: "Illiquid incl. unfunded, max", kind: "pct" },
    { path: "limits.single_position_pct", label: "Single position, max", kind: "pct" },
    { path: "limits.largest_sector_pct", label: "Largest sector, max", kind: "pct" }
  ];
  const HAIRCUTS = [
    { path: "haircuts.t_bill", label: "T-bills", kind: "pct" },
    { path: "haircuts.public_equity", label: "Public equity", kind: "pct" },
    { path: "haircuts.credit", label: "Liquid credit (HY)", kind: "pct" }
  ];
  const getPath = (o, p) => p.split(".").reduce((x, k) => (x ? x[k] : undefined), o);
  const setPath = (o, p, v) => { const ks = p.split("."); ks.slice(0, -1).reduce((x, k) => x[k], o)[ks[ks.length - 1]] = v; };
  const toInput = (kind, v) => (kind === "k" ? +(v / 1000).toFixed(3) : +(v * 100).toFixed(3));

  function renderLimits() {
    const s = ctx.state.settings;
    const rows = list => list.map(x => `<tr><td class="col-name">${esc(x.label)}</td><td class="num">
        <span class="unit-input"><input inputmode="decimal" data-setting="${x.path}" data-kind="${x.kind}" value="${esc(toInput(x.kind, getPath(s, x.path)))}" aria-label="${esc(x.label)}"><span class="unit">${x.kind === "k" ? "$K" : "%"}</span></span></td></tr>`).join("");
    document.getElementById("pf2-limits").innerHTML = `
      <div class="table-wrap"><table class="grid limits"><thead><tr><th class="col-name">Limits</th><th class="num">Threshold</th></tr></thead>
        <tbody>${rows(LIMITS)}</tbody></table></div>
      <div class="table-wrap"><table class="grid limits"><thead><tr><th class="col-name">Haircuts</th><th class="num">% counted</th></tr></thead>
        <tbody>${rows(HAIRCUTS)}</tbody></table></div>`;
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
    panel.addEventListener("click", e => {
      const oi = e.target.closest("[data-open-investment]");
      if (oi) return root.App.openInvestment(oi.dataset.openInvestment);
    });
    panel.addEventListener("change", e => {
      if (e.target.matches("[data-sel-field]")) { ui.funded_note = null; return onSelectorChange(e.target); }
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
    renderSelector();
    renderLimits();
    renderOutputs();
  }

  root.ProForma = { render };
})(window);
