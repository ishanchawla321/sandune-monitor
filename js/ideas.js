// Opportunities section: Themes tab (grid + card) and Ideas tab (filterable investments table + card).
// One card component serves both kinds: assumptions, lists, signals, status-with-reason and the
// decision log work the same way; each kind adds its own sections.
(function (root) {
  "use strict";

  const Fmt = root.Fmt, Metrics = root.Metrics, TM = root.ThemesModel;
  const L = Fmt.LABELS;
  const esc = Fmt.esc;
  const STATUSES = Object.keys(L.status);
  const THEME_STATUSES = Object.keys(L.theme_status);
  const TYPES = Object.keys(L.type);
  const CYCLE = { intact: "at_risk", at_risk: "broken", broken: "intact" };
  const CLASSES = Object.keys(L.asset_class);
  const PROSPECTIVE = ["watching", "researching", "IC"];
  const isProspective = i => PROSPECTIVE.includes(i.status);

  const themeName = id => { const t = (ctx.state.themes || []).find(x => x.id === id); return t ? t.name : ""; };

  const COLS = [
    { key: "name", label: "Name", cls: "col-name" },
    { key: "theme", label: "Theme", wrapSm: true, value: i => themeName(i.theme_id) },
    { key: "type", label: "Type", wrapSm: true, show: i => L.type[i.type] || i.type },
    { key: "status", label: "Status", show: i => L.status[i.status] || i.status },
    { key: "score", label: "Liquidity score", num: true, value: i => Metrics.liquidityScore(i), show: i => Metrics.liquidityScore(i).toFixed(0) },
    { key: "check_size", label: "Check size ($K)", num: true, show: i => Fmt.thousands(i.check_size) },
    { key: "funded_pct", label: "Funded %", num: true, show: i => Fmt.pct(i.funded_pct, 0) },
    { key: "hold_months", label: "Hold (mo)", num: true, show: i => (i.hold_months ?? "") + "" },
    { key: "target_return", label: "Target return", wrap: true },
    { key: "next_step", label: "Next step", wrap: true },
    { key: "next_step_date", label: "Next step date" },
    { key: "contact", label: "Contact", value: i => (i.contacts || []).join("; ") },
    { key: "asset_class", label: "Asset class", show: i => L.asset_class[i.asset_class] || i.asset_class },
    { key: "security_type", label: "Security type", show: i => L.security_type[i.security_type] || i.security_type },
    { key: "sector", label: "Sector" },
    { key: "price_or_mark", label: "Price", num: true, show: i => Fmt.number(i.price_or_mark, 2) },
    { key: "quantity", label: "Quantity", num: true, show: i => Fmt.number(i.quantity, 0) },
    // Funding, set when an investment is marked Invested
    { key: "funded_date", label: "Funded on", value: i => (i.funding ? i.funding.date : "") },
    { key: "funded_amount", label: "Funded ($K)", num: true, value: i => (i.funding ? i.funding.amount : null), show: i => (i.funding ? Fmt.thousands(i.funding.amount) : "") },
    { key: "funding_source", label: "Funded from", value: i => (i.funding ? (i.funding.source === "cash" ? "Cash" : i.funding.source_name) : ""), wrapSm: true }
  ];
  const COMPLETED = ["name", "theme", "type", "funded_date", "funded_amount", "funding_source", "hold_months", "target_return"];

  // Default (compact) pipeline columns; "All columns" shows everything.
  const COMPACT = ["name", "theme", "type", "status", "score", "check_size", "funded_pct", "hold_months", "next_step"];

  // sel: { kind: "theme" | "investment", id }
  const ui = { sort: { key: null, dir: 1 }, status: new Set(), type: new Set(), sel: null,
               pending: null, bound: false, assessing: null, allCols: false };
  let ctx = null; // { state, onChange }

  const today = () => Fmt.today();
  const newId = p => p + "-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const listFor = kind => (kind === "theme" ? ctx.state.themes || [] : ctx.state.investments);
  const current = () => (ui.sel ? listFor(ui.sel.kind).find(x => x.id === ui.sel.id) || null : null);
  const isTheme = () => !!ui.sel && ui.sel.kind === "theme";
  const blank = v => v === null || v === undefined || v === "";
  const colValue = (c, i) => (c.value ? c.value(i) : i[c.key]);
  const colText = (c, i) => (c.show ? c.show(i) : blank(colValue(c, i)) ? "" : String(colValue(c, i)));
  const r1 = n => String(Math.round(n * 10) / 10);
  const statusLabel = s => L.status[s] || L.theme_status[s] || s;

  // The score's build goes in its label, e.g. "(24 + 8 + 20)", so the value line holds only the number.
  function scoreBuild(i) {
    const s = Metrics.liquidityScoreParts(i);
    return s.isPublic ? "(public)" : `(${s.parts.map(r1).join(" + ")})`;
  }

  const stat = (label, value, attrs) => `<div class="stat"${attrs || ""}><span class="stat-label">${label}</span><span class="stat-value">${value}</span></div>`;
  const riskPill = (label, n) => `<span class="status-pill ${n ? "is-warn" : "is-muted"}">${esc(label)} ${n}</span>`;
  const THEME_STATUS_CLASS = { active: "is-ok", exploring: "is-accent", retired: "is-muted" };
  const closeBtn = `<button type="button" class="close-btn" data-close aria-label="Close">×</button>`;

  function save() { root.Store.save(ctx.state); }

  // ---------------- Themes grid ----------------
  function renderThemeGrid() {
    const themes = ctx.state.themes || [];
    document.getElementById("th-grid").innerHTML = themes.length ? themes.map(t => {
      const s = TM.stats(ctx.state, t);
      const on = ui.sel && ui.sel.kind === "theme" && ui.sel.id === t.id;
      return `<button type="button" class="theme-tile${on ? " selected" : ""}" data-theme="${esc(t.id)}" aria-pressed="${on}">
        <span class="tt-head"><span class="tt-name" title="${esc(t.name)}">${esc(t.name)}</span><span class="status-pill ${THEME_STATUS_CLASS[t.status] || "is-muted"}">${esc(L.theme_status[t.status] || t.status)}</span></span>
        <span class="tt-thesis">${esc(t.thesis || "")}</span>
        <span class="stat-row cols-3">
          <span class="stat"><span class="stat-label">Investments</span><span class="stat-value">${s.count}</span></span>
          <span class="stat"><span class="stat-label">Total check</span><span class="stat-value">$${esc(Fmt.thousands(s.check))}K</span></span>
          <span class="stat"><span class="stat-label">Blended liquidity</span><span class="stat-value">${s.blended === null ? "n/a" : esc(s.blended.toFixed(0))}</span></span>
        </span>
        <span class="tt-risk"><span class="stat-label">At risk / broken</span>${riskPill("Theme", s.flagged)}${riskPill("Investments", s.invFlagged)}</span></button>`;
    }).join("") : `<p class="muted">No themes yet.</p>`;
  }

  // ---------------- Investment filters and table ----------------
  function renderFilters() {
    const chips = (group, keys, set, labels) => keys.map(k => {
      const n = ctx.state.investments.filter(i => i[group] === k).length;
      return `<button type="button" class="chip" data-chip="${group}" data-value="${esc(k)}" aria-pressed="${set.has(k)}">${esc(labels[k])} <span class="chip-n">${n}</span></button>`;
    }).join("");
    const any = ui.status.size || ui.type.size;
    document.getElementById("id-filters").innerHTML = `
      <div class="chip-row" role="group" aria-label="Filter by status"><span class="chip-label">Status</span>${chips("status", PROSPECTIVE, ui.status, L.status)}</div>
      <div class="chip-row" role="group" aria-label="Filter by type"><span class="chip-label">Type</span>${chips("type", TYPES, ui.type, L.type)}
        ${any ? `<button type="button" class="link" data-chip-clear>Clear filters</button>` : ""}</div>`;
  }

  const headCell = (c, sortable) => {
    const active = sortable && ui.sort.key === c.key;
    const aria = active ? (ui.sort.dir > 0 ? "ascending" : "descending") : "none";
    const label = esc(c.label) + (active ? (ui.sort.dir > 0 ? " ▲" : " ▼") : "");
    return `<th class="${c.num ? "num " : ""}${c.cls || ""}" aria-sort="${aria}">${sortable ? `<button type="button" class="sort" data-sort="${c.key}">${label}</button>` : label}</th>`;
  };
  const rowHtml = (i, cols, selId) => `<tr class="idea-row${i.id === selId ? " selected" : ""}" data-inv="${esc(i.id)}" tabindex="0" aria-selected="${i.id === selId}">` +
    cols.map(c => `<td class="${c.num ? "num " : ""}${c.cls || ""}${c.wrap ? " wrap" : ""}${c.wrapSm ? " wrap-sm" : ""}">${esc(colText(c, i))}</td>`).join("") + "</tr>";
  const count = (id, n, noun) => { document.getElementById(id).textContent = `${n} ${n === 1 ? noun : noun + "s"}`; };

  function renderTables() {
    const selId = ui.sel && ui.sel.kind === "investment" ? ui.sel.id : null;
    const all = ctx.state.investments;

    // Prospective: Watching, Researching, IC. Filters and sorting apply here.
    const prospective = all.filter(isProspective);
    let rows = prospective.filter(i => (!ui.status.size || ui.status.has(i.status)) && (!ui.type.size || ui.type.has(i.type)));
    const sc = COLS.find(c => c.key === ui.sort.key);
    if (sc) {
      const v = i => {
        const x = colValue(sc, i);
        if (sc.num) return blank(x) ? -Infinity : Number(x);
        return String(colText(sc, i)).toLowerCase();
      };
      rows = rows.slice().sort((a, b) => (v(a) > v(b) ? 1 : v(a) < v(b) ? -1 : 0) * ui.sort.dir);
    }
    const cols = ui.allCols ? COLS.filter(c => !["funded_date", "funded_amount", "funding_source"].includes(c.key)) : COMPACT.map(k => COLS.find(c => c.key === k));
    const empty = rows.length ? "" : `<tr><td class="col-name muted" colspan="${cols.length}">${prospective.length ? "No prospective investments match these filters." : "No prospective investments yet."}</td></tr>`;
    document.getElementById("id-table").innerHTML = `<thead><tr>${cols.map(c => headCell(c, true)).join("")}</tr></thead><tbody>${rows.map(i => rowHtml(i, cols, selId)).join("")}${empty}</tbody>`;
    count("id-prospective-count", prospective.length, "investment");
    const tog = document.getElementById("id-cols");
    tog.setAttribute("aria-pressed", String(ui.allCols));
    tog.textContent = ui.allCols ? "Compact view" : "All columns";

    // Completed: Invested.
    const done = all.filter(i => i.status === "invested");
    const dcols = COMPLETED.map(k => COLS.find(c => c.key === k));
    document.getElementById("id-completed").innerHTML = done.length
      ? `<div class="table-wrap"><table class="grid ideas"><thead><tr>${dcols.map(c => headCell(c, false)).join("")}</tr></thead><tbody>${done.map(i => rowHtml(i, dcols, selId)).join("")}</tbody></table></div>`
      : `<p class="placeholder">Investments move here when marked Invested.</p>`;
    count("id-completed-count", done.length, "investment");

    // Passed: collapsed list with the date and reason from the decision log.
    const passed = all.filter(i => i.status === "passed");
    const lastPass = i => (i.decision_log || []).filter(d => d.to === "passed").sort((a, b) => (a.date < b.date ? 1 : -1))[0] || {};
    document.getElementById("id-passed-list").innerHTML = passed.length
      ? `<div class="table-wrap"><table class="grid ideas"><thead><tr><th class="col-name">Name</th><th>Type</th><th>Passed on</th><th>Reason</th></tr></thead><tbody>${passed.map(i => {
          const d = lastPass(i);
          return `<tr class="idea-row${i.id === selId ? " selected" : ""}" data-inv="${esc(i.id)}" tabindex="0" aria-selected="${i.id === selId}"><td class="col-name">${esc(i.name)}</td><td>${esc(L.type[i.type] || i.type)}</td><td>${esc(d.date || "")}</td><td class="wrap">${esc(d.reason || "")}</td></tr>`;
        }).join("")}</tbody></table></div>`
      : `<p class="muted">None passed yet.</p>`;
    count("id-passed-count", passed.length, "investment");
  }

  // ---------------- Card pieces (shared) ----------------
  const opt = (value, label, cur) => `<option value="${esc(value)}"${value === cur ? " selected" : ""}>${esc(label)}</option>`;
  const field = (i, key, kind, label, extra) => {
    let v = i[key];
    if (kind === "k") v = blank(v) ? "" : +(v / 1000).toFixed(3);
    if (kind === "pct") v = blank(v) ? "" : +(v * 100).toFixed(2);
    const type = kind === "date" ? "date" : "text";
    const mode = kind === "text" || kind === "date" ? "" : ` inputmode="decimal"`;
    return `<label class="fld"><span>${esc(label)}</span><input type="${type}"${mode} data-field="${key}" data-kind="${kind}" value="${esc(blank(v) ? "" : v)}"${extra || ""}></label>`;
  };

  function editableList(i, key, placeholder, opts) {
    const items = i[key] || [];
    const rowsHtml = items.map((t, n) => `<li>
        ${opts && opts.label ? `<span class="doc-label">${esc(opts.label)}</span>` : ""}
        ${opts && opts.readOnly ? `<span class="list-text">${esc(t)}</span>` :
          `<input type="text" class="list-input" data-list="${key}" data-index="${n}" value="${esc(t)}" aria-label="${esc(placeholder)} ${n + 1}">`}
        <button type="button" class="link danger" data-list-del="${key}" data-index="${n}">Delete</button></li>`).join("");
    return `<ul class="edit-list">${rowsHtml || `<li class="muted">None yet.</li>`}</ul>
      <div class="add-line"><input type="text" data-list-new="${key}" placeholder="${esc(placeholder)}" aria-label="New ${esc(placeholder)}">
      <button type="button" class="btn" data-list-add="${key}">Add</button></div>`;
  }

  function statusHeader(i, statuses, labels) {
    const p = ui.pending && ui.pending.id === i.id ? ui.pending : null;
    const shown = p ? p.to : i.status;
    const tone = { watching: "is-muted", researching: "is-accent", IC: "is-warn", invested: "is-ok", passed: "is-muted",
                   exploring: "is-accent", active: "is-ok", retired: "is-muted" }[shown] || "is-muted";
    const select = `<label class="sr-only" for="id-status">Status</label><select id="id-status" class="status-select ${tone}" data-status-select>${statuses.map(s => opt(s, labels[s], shown)).join("")}</select>`;
    let fund = "";
    if (p && p.to === "invested" && p.from !== "invested") {
      const f = p.fund;
      const sources = root.ProFormaModel.fundingSources(ctx.state.holdings);
      fund = `<div class="fund-form" role="group" aria-label="Funding">
          <label class="fld"><span>Funding date</span><input type="date" id="id-fund-date" value="${esc(f.date)}"></label>
          <label class="fld"><span>Funded amount ($K)</span><input type="text" inputmode="decimal" id="id-fund-amount" value="${esc(f.amount)}"></label>
          <label class="fld"><span>Funding source</span><select id="id-fund-source"><option value="cash"${f.source === "cash" ? " selected" : ""}>Cash</option>
            ${sources.map(h => `<option value="${esc(h.id)}"${f.source === h.id ? " selected" : ""}>${esc(h.name)} ($${Fmt.thousands(Metrics.marketValue(h))}K)</option>`).join("")}</select></label>
        </div>
        <p class="note">Saving posts the buy or capital call to the blotter, creates the holding in Portfolio &gt; Current and reduces the funding source.</p>`;
    } else if (p && p.from === "invested" && p.to !== "invested" && i.funding) {
      fund = `<p class="note">Saving reverses the funding: ${esc(root.InvestModel.describe(i.funding))} The holding and blotter entries are removed and cash is restored. You will be asked to confirm.</p>`;
    }
    const reason = p ? `<div class="reason" role="group" aria-label="Reason for status change">
        <label for="id-reason">Reason for moving from ${esc(statusLabel(p.from))} to ${esc(statusLabel(p.to))} (required)</label>
        ${fund}
        <div class="add-line"><input type="text" id="id-reason" value="${esc(p.reason || "")}" placeholder="One line">
        <button type="button" class="btn btn-primary" data-status-save>Save status</button>
        <button type="button" class="btn" data-status-cancel>Cancel</button></div>
        ${p.error ? `<p class="breach" role="alert">${esc(p.error)}</p>` : ""}</div>` : "";
    return { select, reason };
  }

  function assumptionsSection(i) {
    const rows = (i.assumptions || []).map(a => `<li class="assume">
        <button type="button" class="pill pill-${a.status}" data-assume-cycle="${esc(a.id)}" title="Click to change: intact, at risk, broken">${esc(L.assumption[a.status])}</button>
        <input type="text" class="list-input" data-assume-text="${esc(a.id)}" value="${esc(a.text)}" aria-label="Assumption text">
        <span class="muted nowrap">Changed ${esc(a.changed || "")}</span>
        <button type="button" class="link danger" data-assume-del="${esc(a.id)}">Delete</button></li>`).join("");
    return `<section class="card-sec"><h3>Assumptions</h3>
        <p class="note">Click a status to cycle intact, at risk, broken.</p>
        <ul class="edit-list">${rows || `<li class="muted">None yet.</li>`}</ul>
        <div class="add-line"><input type="text" id="id-new-assume" placeholder="New assumption" aria-label="New assumption">
          <button type="button" class="btn" data-assume-add>Add</button></div></section>`;
  }

  function signalsSection(i) {
    const assumeName = id => { const a = (i.assumptions || []).find(x => x.id === id); return a ? a.text : null; };
    const items = (i.signals || []).map((s, n) => ({ s, n }))
      .sort((a, b) => (a.s.date < b.s.date ? 1 : a.s.date > b.s.date ? -1 : b.n - a.n))
      .map(({ s }) => {
        if (s.kind === "price") {
          const live = root.Prices && root.Prices.quote(s.ticker);
          const px = live ? live.price : s.price;
          return `<li><span class="sig-date">${esc(live ? live.when.slice(0, 10) : s.date)}</span><span class="sig-body"><b>${esc(s.ticker)}</b> ${esc(Fmt.number(px, px < 10 ? 3 : 2))}
            <span class="tag">${live ? `Live · Finnhub, ${esc(live.when)}` : `Cached, as of ${esc(s.date)}`}</span>${live ? ` <span class="muted">Seed ${esc(Fmt.number(s.price, s.price < 10 ? 3 : 2))} on ${esc(s.date)}.</span>` : ""}</span></li>`;
        }
        const busy = ui.assessing === s.id;
        const check = root.Api.available
          ? `<button type="button" class="link" data-assess="${esc(s.id)}"${busy ? " disabled" : ""}>${busy ? "Checking…" : "Check thesis"}</button>`
          : `<button type="button" class="link" disabled title="Available on the hosted site; needs the /api functions.">Check thesis</button>`;
        return `<li><span class="sig-date">${esc(s.date)}</span><span class="sig-body">${esc(s.text)}
            <span class="tag">${s.assumption_id ? (assumeName(s.assumption_id) ? "Assumption: " + esc(assumeName(s.assumption_id)) : "Tagged assumption was deleted") : "Untagged"}</span>
            ${s.ai ? `<span class="ai-read"><span class="tag tag-ai">AI read</span> ${esc(s.ai.line)} <span class="muted">(${esc(s.ai.date)})</span></span>` : ""}</span>
            <span class="sig-actions">${check} <button type="button" class="link danger" data-note-del="${esc(s.id)}">Delete</button></span></li>`;
      }).join("");
    return `<section class="card-sec"><h3>Signals</h3>
        <ul class="signals">${items || `<li class="muted">No signals yet.</li>`}</ul>
        <div class="note-form" role="group" aria-label="Add note">
          <label class="fld"><span>Date</span><input type="date" id="id-note-date" value="${esc(today())}"></label>
          <label class="fld grow"><span>Note</span><input type="text" id="id-note-text" placeholder="What happened"></label>
          <label class="fld"><span>Assumption</span><select id="id-note-assume"><option value="">None</option>
            ${(i.assumptions || []).map(a => `<option value="${esc(a.id)}">${esc(a.text.length > 50 ? a.text.slice(0, 50) + "…" : a.text)}</option>`).join("")}</select></label>
          <button type="button" class="btn" data-note-add>Add note</button>
        </div></section>`;
  }

  function logSection(i) {
    const log = (i.decision_log || []).map((d, n) => ({ d, n }))
      .sort((a, b) => (a.d.date < b.d.date ? 1 : a.d.date > b.d.date ? -1 : b.n - a.n))
      .map(({ d }) => `<tr><td>${esc(d.date)}</td><td>${esc(d.from ? statusLabel(d.from) : "(new)")}</td>
        <td>${esc(statusLabel(d.to))}</td><td class="wrap">${esc(d.reason)}</td></tr>`).join("");
    return `<section class="card-sec"><h3>Decision log</h3>
        <div class="table-wrap"><table class="grid log"><thead><tr><th>Date</th><th>From</th><th>To</th><th>Reason</th></tr></thead>
        <tbody>${log || `<tr><td colspan="4" class="muted">No entries yet.</td></tr>`}</tbody></table></div></section>`;
  }

  // ---------------- Theme card ----------------
  function themeCard(t) {
    const s = TM.stats(ctx.state, t);
    const { select, reason } = statusHeader(t, THEME_STATUSES, L.theme_status);
    const vc = (t.value_chain || []).map((v, n) => `<li class="vc-row">
        <input type="text" class="list-input" data-vc="${n}" data-vc-key="segment" value="${esc(v.segment)}" aria-label="Value chain segment ${n + 1}">
        <input type="text" class="list-input" data-vc="${n}" data-vc-key="who_captures_value" value="${esc(v.who_captures_value)}" placeholder="Who captures value" aria-label="Who captures value, segment ${n + 1}">
        <button type="button" class="link danger" data-vc-del="${n}">Delete</button></li>`).join("");
    const linked = TM.linked(ctx.state, t);
    const mini = linked.map(i => `<tr class="idea-row" data-open-inv="${esc(i.id)}" tabindex="0">
        <td class="col-name">${esc(i.name)}</td><td class="num">${esc(Fmt.thousands(i.check_size))}</td>
        <td>${esc(L.status[i.status] || i.status)}</td><td class="num">${esc(Metrics.liquidityScore(i).toFixed(0))}</td></tr>`).join("");
    const picks = ctx.state.investments.map(i => {
      const other = i.theme_id && i.theme_id !== t.id ? themeName(i.theme_id) : "";
      return `<label class="pick"><input type="checkbox" data-link-inv="${esc(i.id)}"${i.theme_id === t.id ? " checked" : ""}> ${esc(i.name)}${other ? ` <span class="muted">(now in ${esc(other)})</span>` : ""}</label>`;
    }).join("");

    return `
    <article class="idea-card" aria-labelledby="id-card-name">
      <header class="card-head">
        <div class="title-line">
          <label class="sr-only" for="id-card-name">Theme name</label>
          <input type="text" id="id-card-name" class="title-input" data-field="name" data-kind="text" value="${esc(t.name)}">
          ${select}
          ${closeBtn}
        </div>
        ${reason}
        <div class="stat-row cols-4">
          ${stat("Linked investments", s.count)}
          ${stat("Total check ($K)", esc(Fmt.thousands(s.check)))}
          ${stat("Blended liquidity (check-weighted)", s.blended === null ? "n/a" : esc(s.blended.toFixed(0)))}
          ${stat("At risk / broken", riskPill("Theme", s.flagged) + riskPill("Investments", s.invFlagged))}
        </div>
      </header>

      <section class="card-sec"><h3>Thesis</h3>
        <textarea data-field="thesis" data-kind="text" rows="3" aria-label="Thesis">${esc(t.thesis || "")}</textarea></section>
      <section class="card-sec"><h3>Why now</h3>
        <textarea data-field="why_now" data-kind="text" rows="2" aria-label="Why now">${esc(t.why_now || "")}</textarea></section>

      <section class="card-sec"><h3>Value chain</h3>
        <ul class="edit-list">${vc || `<li class="muted">None yet.</li>`}</ul>
        <div class="add-line"><input type="text" id="id-vc-seg" placeholder="Segment" aria-label="New segment">
          <input type="text" id="id-vc-who" placeholder="Who captures value" aria-label="Who captures value">
          <button type="button" class="btn" data-vc-add>Add</button></div></section>

      ${assumptionsSection(t)}
      <section class="card-sec"><h3>What would change my mind</h3>${editableList(t, "triggers", "Trigger")}</section>

      <section class="card-sec"><h3>Linked investments</h3>
        ${linked.length ? `<div class="table-wrap"><table class="grid mini"><thead><tr><th class="col-name">Investment</th><th class="num">Check ($K)</th><th>Status</th><th class="num">Liquidity score</th></tr></thead>
          <tbody>${mini}</tbody></table></div>` : `<p class="muted">No investments linked yet.</p>`}
        <p class="note">Pick investments for this theme. An investment belongs to one theme; ticking it here moves it.</p>
        <div class="picks" role="group" aria-label="Linked investments">${picks}</div></section>

      <section class="card-sec"><h3>Watch list: public</h3>${editableList(t, "watch_public", "Ticker")}</section>
      <section class="card-sec"><h3>Watch list: private</h3>${editableList(t, "watch_private", "Company or asset")}</section>
      <section class="card-sec"><h3>Contacts</h3><p class="note">Roles only, no names.</p>${editableList(t, "contacts", "Contact role")}</section>
      ${signalsSection(t)}
      ${logSection(t)}
    </article>`;
  }

  // ---------------- Investment card ----------------
  function investmentCard(i) {
    const { select, reason } = statusHeader(i, STATUSES, L.status);
    const funded = (Number(i.check_size) || 0) * (Number(i.funded_pct) || 0);
    return `
    <article class="idea-card" aria-labelledby="id-card-name">
      <header class="card-head">
        <div class="title-line">
          <label class="sr-only" for="id-card-name">Investment name</label>
          <input type="text" id="id-card-name" class="title-input" data-field="name" data-kind="text" value="${esc(i.name)}">
          ${select}
          ${closeBtn}
        </div>
        ${reason}
        <div class="stat-row cols-4">
          ${stat('<label for="id-type">Type</label>', `<select id="id-type" data-field="type" data-kind="text">${TYPES.map(t => opt(t, L.type[t], i.type)).join("")}</select>`)}
          ${stat('<label for="id-theme">Theme</label>', `<select id="id-theme" data-theme-select><option value="">None</option>${(ctx.state.themes || []).map(t => opt(t.id, t.name, i.theme_id || "")).join("")}</select>`)}
          ${stat("Check size ($K)", `<span id="id-check">${esc(Fmt.thousands(i.check_size))}</span>`)}
          ${stat(`Liquidity score <span id="id-score-build">${esc(scoreBuild(i))}</span>`, `<span id="id-score">${esc(Metrics.liquidityScore(i).toFixed(0))}</span>`)}
        </div>
        <div class="head-fields">
          ${field(i, "next_step", "text", "Next step", ' class="wide"')}
          ${field(i, "next_step_date", "date", "Next step date")}
        </div>
        ${i.funding ? `<p class="note funded-line">${esc(root.InvestModel.describe(i.funding))} The holding sits in Portfolio &gt; Current${i.funding.created ? "" : " (existing holding)"}.</p>` : ""}
      </header>

      <section class="card-sec"><h3>Thesis</h3>
        <textarea data-field="thesis" data-kind="text" rows="3" aria-label="Thesis">${esc(i.thesis || "")}</textarea></section>
      ${assumptionsSection(i)}
      <section class="card-sec"><h3>What would change my mind</h3>${editableList(i, "triggers", "Trigger")}</section>

      <section class="card-sec"><h3>Terms</h3>
        <div class="terms">
          ${field(i, "check_size", "k", "Check size ($K)")}
          ${field(i, "funded_pct", "pct", "Funded %")}
          <div class="fld"><span>Funded / unfunded ($K)</span><b>${esc(Fmt.thousands(funded))} / ${esc(Fmt.thousands((Number(i.check_size) || 0) - funded))}</b></div>
          ${field(i, "hold_months", "int", "Hold (months)")}
          ${field(i, "months_to_50pct_back", "int", "Months to 50% back")}
          <label class="fld"><span>Interim cash</span><select data-field="interim_cash" data-kind="bool">${opt("true", "Yes", String(!!i.interim_cash))}${opt("false", "No", String(!!i.interim_cash))}</select></label>
          ${field(i, "target_return", "text", "Target return", ' class="wide"')}
          ${field(i, "entry_costs", "text", "Entry costs", ' class="wide"')}
        </div>
        <label class="fld block"><span>Structure and terms</span><textarea data-field="terms_notes" data-kind="text" rows="2">${esc(i.terms_notes || "")}</textarea></label>
        <div class="terms">
          <label class="fld"><span>Asset class</span><select data-field="asset_class" data-kind="text">${CLASSES.map(c => opt(c, L.asset_class[c], i.asset_class)).join("")}</select></label>
          <label class="fld"><span>Security type</span><select data-field="security_type" data-kind="text">${Object.keys(L.security_type).map(s => opt(s, L.security_type[s], i.security_type)).join("")}</select></label>
          ${field(i, "sector", "text", "Sector")}
          ${field(i, "price_or_mark", "num", "Price")}
          ${field(i, "quantity", "num", "Quantity")}
        </div></section>

      <section class="card-sec"><h3>Contacts</h3><p class="note">Roles only, no names.</p>${editableList(i, "contacts", "Contact role")}</section>
      ${signalsSection(i)}
      <section class="card-sec"><h3>Source-document flags</h3>${editableList(i, "doc_flags", "Document flag", { label: "Doc check", readOnly: true })}</section>
      ${logSection(i)}
    </article>`;
  }

  function renderCard() {
    const cur = current();
    const thBox = document.getElementById("th-card"), invBox = document.getElementById("id-card");
    thBox.innerHTML = cur && isTheme() ? themeCard(cur) : "";
    invBox.innerHTML = cur && !isTheme() ? investmentCard(cur)
      : `<p class="placeholder">Select an investment in the table to open its card.</p>`;
  }

  function renderAll() {
    renderThemeGrid();
    renderFilters();
    renderTables();
    renderCard();
  }

  // ---------------- Edits ----------------
  function parseField(kind, raw) {
    const t = String(raw).trim();
    if (kind === "text" || kind === "date") return t || null;
    if (kind === "bool") return t === "true";
    if (t === "") return null;
    const n = Number(t.replace(/[$,%\s]/g, ""));
    if (!isFinite(n)) return undefined;
    if (kind === "k") return n * 1000;
    if (kind === "pct") return n / 100;
    if (kind === "int") return Math.round(n);
    return n;
  }

  // Field edits save and refresh the lists without rebuilding the card, so focus stays put.
  function onFieldChange(el) {
    const i = current();
    if (!i) return;
    const v = parseField(el.dataset.kind, el.value);
    if (v === undefined) { el.value = blank(i[el.dataset.field]) ? "" : i[el.dataset.field]; return; }
    if (el.dataset.field === "name" && !v) { el.value = i.name; return; }
    i[el.dataset.field] = v;
    save();
    renderThemeGrid();
    renderFilters();
    renderTables();
    const score = document.getElementById("id-score");
    if (score && !isTheme()) {
      score.textContent = Metrics.liquidityScore(i).toFixed(0);
      document.getElementById("id-score-build").textContent = scoreBuild(i);
    }
    if (!isTheme() && ["check_size", "funded_pct", "asset_class", "type"].includes(el.dataset.field)) renderCard();
  }

  function commit() { save(); ctx.onChange(false); }

  function saveStatus() {
    const i = current(), p = ui.pending;
    if (!i || !p) return;
    const reason = (document.getElementById("id-reason").value || "").trim();
    if (!reason) {
      p.error = "Enter a one-line reason to save the status change.";
      renderCard();
      document.getElementById("id-reason").focus();
      return;
    }
    let line = reason;
    if (!isTheme() && p.to === "invested" && p.from !== "invested") {
      const n = Number(String(p.fund.amount).replace(/[$,\s]/g, ""));
      const f = { date: p.fund.date, amount: isFinite(n) ? n * 1000 : 0, source: p.fund.source };
      const err = root.InvestModel.validate(ctx.state, i, f);
      if (err) { p.error = err; renderCard(); return; }
      root.InvestModel.execute(ctx.state, i, f);
      line += " " + root.InvestModel.describe(i.funding);
    } else if (!isTheme() && p.from === "invested" && p.to !== "invested" && i.funding) {
      if (!root.confirm(`Reverse the funding of ${i.name}? ${root.InvestModel.describe(i.funding)} The holding and its blotter entries are removed and the funding source is restored.`)) return;
      line += " Funding reversed.";
      root.InvestModel.reverse(ctx.state, i);
    }
    i.decision_log = i.decision_log || [];
    i.decision_log.push({ date: today(), from: p.from, to: p.to, reason: line });
    i.status = p.to;
    ui.pending = null;
    commit();
  }

  // Opening a row or tile that is already open closes it (toggle).
  function select(kind, id, toggle) {
    const same = ui.sel && ui.sel.kind === kind && ui.sel.id === id;
    if (same && toggle) return closeCard();
    if (!same) ui.pending = null;
    ui.sel = { kind, id };
    const panelId = kind === "theme" ? "tab-themes" : "tab-ideas";
    if (document.getElementById(panelId).hidden && root.App) root.App.showTab(kind === "theme" ? "opportunities/themes" : "opportunities/ideas");
    else ctx.onChange(false);
    const box = document.getElementById(kind === "theme" ? "th-card" : "id-card");
    if (box && box.scrollIntoView) box.scrollIntoView({ block: "start" });
  }

  // Close the open card (×, Esc, or re-clicking its row) and return to the row or tile that opened it.
  // Any field being typed in is blurred first so its edit is saved.
  function closeCard() {
    if (!ui.sel) return;
    const { kind, id } = ui.sel;
    const active = document.activeElement;
    if (active && active.closest && active.closest(".idea-card")) {
      // Commit whatever is being typed before the card goes away (change handlers are no-ops if nothing changed).
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName)) active.dispatchEvent(new Event("change", { bubbles: true }));
      if (active.blur) active.blur();
    }
    ui.sel = null;
    ui.pending = null;
    ctx.onChange(false);
    const sel = kind === "theme" ? `[data-theme="${CSS.escape(id)}"]` : `tr[data-inv="${CSS.escape(id)}"]`;
    const opener = document.querySelector("#sec-opportunities " + sel);
    if (opener) {
      opener.scrollIntoView({ block: "center" });
      opener.focus({ preventScroll: true });
    }
  }

  function bind() {
    if (ui.bound) return;
    ui.bound = true;
    const panel = document.getElementById("sec-opportunities");
    const visible = () => !!panel.querySelector("section[role=tabpanel]:not([hidden])");

    panel.addEventListener("click", e => {
      const t = e.target;
      if (t.closest("#id-intake")) return; // the intake module handles its own clicks
      const chip = t.closest("[data-chip]");
      if (chip) {
        const set = ui[chip.dataset.chip];
        set.has(chip.dataset.value) ? set.delete(chip.dataset.value) : set.add(chip.dataset.value);
        return ctx.onChange(false);
      }
      if (t.closest("[data-chip-clear]")) { ui.status.clear(); ui.type.clear(); return ctx.onChange(false); }
      if (t.closest("#id-cols")) { ui.allCols = !ui.allCols; return ctx.onChange(false); }
      const sortBtn = t.closest("[data-sort]");
      if (sortBtn) {
        const key = sortBtn.dataset.sort;
        ui.sort = ui.sort.key === key ? { key, dir: -ui.sort.dir } : { key, dir: 1 };
        return ctx.onChange(false);
      }
      if (t.closest("[data-close]")) return closeCard();
      const tile = t.closest("[data-theme]");
      if (tile) return select("theme", tile.dataset.theme, true);
      const row = t.closest("tr[data-inv]");
      if (row) return select("investment", row.dataset.inv, true);
      const open = t.closest("tr[data-open-inv]");
      if (open) return select("investment", open.dataset.openInv);

      const i = current();
      if (!i) return;
      if (t.closest("[data-status-save]")) return saveStatus();
      if (t.closest("[data-status-cancel]")) { ui.pending = null; return ctx.onChange(false); }

      const cyc = t.closest("[data-assume-cycle]");
      if (cyc) {
        const a = i.assumptions.find(x => x.id === cyc.dataset.assumeCycle);
        if (a) { a.status = CYCLE[a.status] || "intact"; a.changed = today(); commit(); }
        return;
      }
      const adel = t.closest("[data-assume-del]");
      if (adel) {
        const a = i.assumptions.find(x => x.id === adel.dataset.assumeDel);
        if (a && root.confirm(`Delete assumption "${a.text}"?`)) {
          i.assumptions = i.assumptions.filter(x => x !== a);
          commit();
        }
        return;
      }
      if (t.closest("[data-assume-add]")) {
        const inp = document.getElementById("id-new-assume");
        const text = inp.value.trim();
        if (!text) return inp.focus();
        i.assumptions = i.assumptions || [];
        i.assumptions.push({ id: newId(i.id + "-a"), text, status: "intact", changed: today() });
        return commit();
      }

      const ldel = t.closest("[data-list-del]");
      if (ldel) {
        i[ldel.dataset.listDel].splice(Number(ldel.dataset.index), 1);
        return commit();
      }
      const ladd = t.closest("[data-list-add]");
      if (ladd) {
        const key = ladd.dataset.listAdd;
        const inp = panel.querySelector(`[data-list-new="${key}"]`);
        let text = inp.value.trim();
        if (!text) return inp.focus();
        if (key === "watch_public") text = text.toUpperCase();
        i[key] = i[key] || [];
        i[key].push(text);
        return commit();
      }

      if (t.closest("[data-vc-add]")) {
        const seg = document.getElementById("id-vc-seg").value.trim();
        if (!seg) return document.getElementById("id-vc-seg").focus();
        i.value_chain = i.value_chain || [];
        i.value_chain.push({ segment: seg, who_captures_value: document.getElementById("id-vc-who").value.trim() });
        return commit();
      }
      const vdel = t.closest("[data-vc-del]");
      if (vdel) { i.value_chain.splice(Number(vdel.dataset.vcDel), 1); return commit(); }

      if (t.closest("[data-note-add]")) {
        const text = document.getElementById("id-note-text").value.trim();
        if (!text) return document.getElementById("id-note-text").focus();
        i.signals = i.signals || [];
        i.signals.push({ id: newId(i.id + "-s"), kind: "note", date: document.getElementById("id-note-date").value || today(),
                         text, assumption_id: document.getElementById("id-note-assume").value || null });
        return commit();
      }
      const ndel = t.closest("[data-note-del]");
      if (ndel) {
        i.signals = i.signals.filter(s => s.id !== ndel.dataset.noteDel);
        return commit();
      }
      const chk = t.closest("[data-assess]");
      if (chk && !ui.assessing) return checkThesis(i, chk.dataset.assess);
    });

    panel.addEventListener("change", e => {
      const el = e.target;
      if (el.closest("#id-intake")) return;
      const i = current();
      if (!i) return;
      if (el.matches("[data-status-select]")) {
        ui.pending = el.value === i.status ? null : { id: i.id, from: i.status, to: el.value, reason: "",
          fund: { date: today(), amount: +(root.InvestModel.defaultAmount(i) / 1000).toFixed(3), source: "cash" } };
        ctx.onChange(false);
        const r = document.getElementById("id-reason");
        if (r) r.focus();
        return;
      }
      if (el.matches("[data-theme-select]")) { TM.setTheme(ctx.state, i.id, el.value || null); return commit(); }
      if (el.matches("[data-link-inv]")) { TM.setTheme(ctx.state, el.dataset.linkInv, el.checked ? i.id : null); return commit(); }
      if (el.matches("[data-field]")) return onFieldChange(el);
      if (el.matches("[data-vc]")) {
        const row = i.value_chain[Number(el.dataset.vc)];
        if (row) { row[el.dataset.vcKey] = el.value.trim(); save(); }
        return;
      }
      if (el.matches("[data-assume-text]")) {
        const a = i.assumptions.find(x => x.id === el.dataset.assumeText);
        const text = el.value.trim();
        if (a && text && text !== a.text) { a.text = text; a.changed = today(); save(); renderThemeGrid(); }
        else if (a) el.value = a.text;
        return;
      }
      if (el.matches("[data-list]")) {
        let text = el.value.trim();
        if (el.dataset.list === "watch_public") text = text.toUpperCase();
        if (text) { i[el.dataset.list][Number(el.dataset.index)] = text; el.value = text; save(); }
        else el.value = i[el.dataset.list][Number(el.dataset.index)];
      }
    });

    panel.addEventListener("keydown", e => {
      const el = e.target;
      if (!el.matches || el.closest("#id-intake")) return;
      if (e.key === "Enter" && el.matches("tr[data-inv]")) { e.preventDefault(); return select("investment", el.dataset.inv, true); }
      if (e.key === "Enter" && el.matches("tr[data-open-inv]")) { e.preventDefault(); return select("investment", el.dataset.openInv); }
      if (e.key !== "Enter") return;
      if (el.id === "id-reason") { e.preventDefault(); if (ui.pending) ui.pending.reason = el.value; return saveStatus(); }
      if (el.id === "id-fund-amount") { e.preventDefault(); return document.getElementById("id-reason").focus(); }
      if (el.id === "id-new-assume") { e.preventDefault(); return panel.querySelector("[data-assume-add]").click(); }
      if (el.id === "id-note-text") { e.preventDefault(); return panel.querySelector("[data-note-add]").click(); }
      if (el.id === "id-vc-seg" || el.id === "id-vc-who") { e.preventDefault(); return panel.querySelector("[data-vc-add]").click(); }
      if (el.matches("[data-list-new]")) { e.preventDefault(); return panel.querySelector(`[data-list-add="${el.dataset.listNew}"]`).click(); }
      if (el.matches("input[data-field], input[data-list], input[data-assume-text], input[data-vc]")) { e.preventDefault(); el.blur(); }
    });

    // Esc closes the open card while the Ideas tab is showing (the document intake handles its own keys).
    document.addEventListener("keydown", e => {
      if (e.key !== "Escape" || !ui.sel || !visible()) return;
      if (e.target.closest && e.target.closest("#id-intake")) return;
      e.preventDefault();
      closeCard();
    });

    panel.addEventListener("input", e => {
      if (!ui.pending) return;
      if (e.target.id === "id-reason") ui.pending.reason = e.target.value;
      if (e.target.id === "id-fund-date") ui.pending.fund.date = e.target.value;
      if (e.target.id === "id-fund-amount") ui.pending.fund.amount = e.target.value;
    });
    panel.addEventListener("change", e => {
      if (!ui.pending) return;
      if (e.target.id === "id-fund-source") ui.pending.fund.source = e.target.value;
      if (e.target.id === "id-fund-date") ui.pending.fund.date = e.target.value;
    });
  }

  // "Does this change the thesis?" One short AI read stored under the note. Fails silently.
  async function checkThesis(i, signalId) {
    const s = (i.signals || []).find(x => x.id === signalId);
    if (!s) return;
    ui.assessing = s.id;
    renderCard();
    const res = await root.Api.assess({
      thesis: i.thesis || "",
      assumptions: (i.assumptions || []).map(a => ({ id: a.id, text: a.text })),
      note: s.text
    });
    ui.assessing = null;
    if (res && res.ok && res.line) {
      s.ai = { line: res.line, effect: res.effect, assumption_id: res.assumption_id, date: today() };
      save();
    }
    ctx.onChange(false);
  }

  function render(state, onChange, view) {
    if (ctx && ctx.state !== state) ui.pending = null; // state replaced (reset): drop any unsaved status change
    ctx = { state, onChange };
    bind();
    if (ui.sel && !current()) { ui.sel = null; ui.pending = null; }
    root.Intake.render(state, inv => {
      ctx.state.investments.push(inv);
      save();
      select("investment", inv.id);
    });
    renderAll();
  }

  root.Ideas = { render };
})(window);
