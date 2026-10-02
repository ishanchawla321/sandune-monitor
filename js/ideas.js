// Opportunities section: Themes tab (bars + card) and Ideas tab (prospective, completed and passed investments + card).
// Cards open in read mode. Each section has a pencil that switches only that section to inputs with Save / Cancel.
// One section framework serves both card kinds; each kind lists its own sections.
(function (root) {
  "use strict";

  const Fmt = root.Fmt, Metrics = root.Metrics, TM = root.ThemesModel, SM = root.StatusModel;
  const L = Fmt.LABELS;
  const esc = Fmt.esc;
  const STATUSES = Object.keys(L.status);
  const THEME_STATUSES = Object.keys(L.theme_status);
  const TYPES = Object.keys(L.type);
  const CLASSES = Object.keys(L.asset_class);
  const PROSPECTIVE = SM.PROSPECTIVE;
  const isProspective = i => PROSPECTIVE.includes(i.status);
  const PENCIL = `<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M11.3 1.7a1 1 0 0 1 1.4 0l1.6 1.6a1 1 0 0 1 0 1.4L5.5 13.5 1.8 14.2l.7-3.7 8.8-8.8zM3.6 11l-.3 1.7 1.7-.3 7.9-7.9-1.4-1.4L3.6 11z" fill="currentColor"/></svg>`;

  const themeName = id => { const t = (ctx.state.themes || []).find(x => x.id === id); return t ? t.name : ""; };
  const fundedFrom = i => (i.funding ? (i.funding.source === "cash" ? "cash" : i.funding.source_name) : "");

  const SCORE_HELP = "Liquidity score = 40 x (1 - months to 50% back / 60) + 40 x (1 - hold months / 60) + 20 if interim cash. Public = 100.";
  const COLS = [
    { key: "name", label: "Name", cls: "col-name" },
    { key: "type", label: "Type", wrapSm: true, show: i => L.type[i.type] || i.type },
    { key: "status", label: "Status", show: i => L.status[i.status] || i.status },
    { key: "check_size", label: "Position Size", unit: "$K", num: true, show: i => Fmt.thousands(i.check_size) },
    { key: "target_return", label: "Target Return", wrap: true },
    { key: "hold_months", label: "Hold", num: true, show: i => (blank(i.hold_months) ? "" : i.hold_months + " mo") },
    { key: "score", label: "Liquidity Score", num: true, help: SCORE_HELP, value: i => Metrics.liquidityScore(i), show: i => Metrics.liquidityScore(i).toFixed(0) },
    { key: "funded_date", label: "Funded", value: i => (i.funding ? i.funding.date : "") },
    { key: "funded_amount", label: "Amount", unit: "$K", num: true, value: i => (i.funding ? i.funding.amount : null), show: i => (i.funding ? Fmt.thousands(i.funding.amount) : "") },
    { key: "funding_source", label: "Source", value: i => fundedFrom(i), show: i => (i.funding ? (i.funding.source === "cash" ? "Cash" : i.funding.source_name) : ""), wrapSm: true }
  ];
  const PROSPECTIVE_COLS = ["name", "type", "status", "check_size", "target_return", "hold_months", "score"];
  const COMPLETED = ["name", "type", "funded_date", "funded_amount", "funding_source"];

  // sel: { kind: "theme" | "investment", id }. editing: the section key in edit mode, or null.
  const ui = { sort: { key: null, dir: 1 }, status: new Set(), type: new Set(), sel: null, editing: null,
               pending: null, bound: false, notice: null };
  let ctx = null; // { state, onChange }

  const today = () => Fmt.today();
  const listFor = kind => (kind === "theme" ? ctx.state.themes || [] : ctx.state.investments);
  const current = () => (ui.sel ? listFor(ui.sel.kind).find(x => x.id === ui.sel.id) || null : null);
  const isTheme = () => !!ui.sel && ui.sel.kind === "theme";
  const blank = v => v === null || v === undefined || v === "";
  const colValue = (c, i) => (c.value ? c.value(i) : i[c.key]);
  const colText = (c, i) => (c.show ? c.show(i) : blank(colValue(c, i)) ? "" : String(colValue(c, i)));
  const r1 = n => String(Math.round(n * 10) / 10);
  const statusLabel = s => L.status[s] || L.theme_status[s] || s;
  const k = v => (blank(v) ? "" : "$" + Fmt.thousands(v) + "K");

  function scoreBuild(i) {
    const s = Metrics.liquidityScoreParts(i);
    return s.isPublic ? "public = 100" : `${s.parts.map(r1).join(" + ")}`;
  }

  const stat = (label, value, tip) => `<div class="stat"${tip ? ` title="${esc(tip)}"` : ""}><span class="stat-label">${label}</span><span class="stat-value">${value}</span></div>`;
  const THEME_STATUS_CLASS = { active: "is-ok", exploring: "is-accent", retired: "is-muted" };
  const closeBtn = `<button type="button" class="close-btn" data-close aria-label="Close">×</button>`;
  const opt = (value, label, cur) => `<option value="${esc(value)}"${value === cur ? " selected" : ""}>${esc(label)}</option>`;

  function save() { root.Store.save(ctx.state); }
  function commit() { save(); ctx.onChange(false); }

  // ---------------- Themes list ----------------
  function renderThemeList() {
    const themes = ctx.state.themes || [];
    document.getElementById("th-grid").innerHTML = themes.length ? themes.map(t => {
      const on = ui.sel && ui.sel.kind === "theme" && ui.sel.id === t.id;
      return `<button type="button" class="theme-bar${on ? " selected" : ""}" data-theme="${esc(t.id)}" aria-pressed="${on}">
        <span class="tb-name">${esc(t.name)}</span><span class="status-pill ${THEME_STATUS_CLASS[t.status] || "is-muted"}">${esc(L.theme_status[t.status] || t.status)}</span></button>`;
    }).join("") : `<p class="muted">No themes yet.</p>`;
  }

  // ---------------- Investment filters and tables ----------------
  function renderFilters() {
    const chips = (group, keys, set, labels) => keys.map(kk =>
      `<button type="button" class="chip chip-sm" data-chip="${group}" data-value="${esc(kk)}" aria-pressed="${set.has(kk)}">${esc(labels[kk])}</button>`).join("");
    const any = ui.status.size || ui.type.size;
    document.getElementById("id-filters").innerHTML = `
      <fieldset class="filter-box"><legend>Status</legend>${chips("status", PROSPECTIVE, ui.status, L.status)}</fieldset>
      <fieldset class="filter-box"><legend>Type</legend>${chips("type", TYPES, ui.type, L.type)}</fieldset>
      ${any ? `<button type="button" class="link filter-clear" data-chip-clear>Clear Filters</button>` : ""}`;
  }

  const headCell = (c, sortable) => {
    const active = sortable && ui.sort.key === c.key;
    const aria = active ? (ui.sort.dir > 0 ? "ascending" : "descending") : "none";
    const label = esc(c.label) + (c.unit ? ` <span class="unit-hint">(${c.unit})</span>` : "") + (active ? (ui.sort.dir > 0 ? " ▲" : " ▼") : "");
    return `<th class="${c.num ? "num " : ""}${c.cls || ""}" aria-sort="${aria}"${c.help ? ` title="${esc(c.help)}"` : ""}>${sortable ? `<button type="button" class="sort" data-sort="${c.key}">${label}</button>` : label}</th>`;
  };
  const rowHtml = (i, cols, selId) => `<tr class="idea-row${i.id === selId ? " selected" : ""}" data-inv="${esc(i.id)}" tabindex="0" aria-selected="${i.id === selId}">` +
    cols.map(c => `<td class="${c.num ? "num " : ""}${c.cls || ""}${c.wrap ? " wrap" : ""}${c.wrapSm ? " wrap-sm" : ""}">${c.html ? c.html(i) : esc(colText(c, i))}</td>`).join("") + "</tr>";

  function renderTables() {
    const selId = ui.sel && ui.sel.kind === "investment" ? ui.sel.id : null;
    const all = ctx.state.investments;

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
    const cols = PROSPECTIVE_COLS.map(kk => COLS.find(c => c.key === kk));
    const empty = rows.length ? "" : `<tr><td class="col-name muted" colspan="${cols.length}">${prospective.length ? "No investments match these filters." : "No prospective investments yet."}</td></tr>`;
    document.getElementById("id-table").innerHTML = `<thead><tr>${cols.map(c => headCell(c, true)).join("")}</tr></thead><tbody>${rows.map(i => rowHtml(i, cols, selId)).join("")}${empty}</tbody>`;

    const done = all.filter(i => i.status === "invested");
    const dcols = COMPLETED.map(kk => COLS.find(c => c.key === kk));
    document.getElementById("id-completed").innerHTML = done.length
      ? `<div class="table-wrap"><table class="grid ideas"><thead><tr>${dcols.map(c => headCell(c, false)).join("")}</tr></thead><tbody>${done.map(i => rowHtml(i, dcols, selId)).join("")}</tbody></table></div>`
      : `<p class="placeholder">No completed investments yet.</p>`;

    const passed = all.filter(i => i.status === "passed");
    const lastPass = i => (i.decision_log || []).filter(d => d.to === "passed").sort((a, b) => (a.date < b.date ? 1 : -1))[0] || {};
    document.getElementById("id-passed-list").innerHTML = passed.length
      ? `<div class="table-wrap"><table class="grid ideas"><thead><tr><th class="col-name">Name</th><th>Date</th><th>Reason</th></tr></thead><tbody>${passed.map(i => {
          const d = lastPass(i);
          return `<tr class="idea-row${i.id === selId ? " selected" : ""}" data-inv="${esc(i.id)}" tabindex="0" aria-selected="${i.id === selId}"><td class="col-name">${esc(i.name)}</td><td>${esc(d.date || "")}</td><td class="wrap">${esc(d.reason || "")}</td></tr>`;
        }).join("")}</tbody></table></div>`
      : `<p class="muted">None passed yet.</p>`;
  }

  // ---------------- Section framework ----------------
  // A card section shows its content in read mode, or its inputs with Save / Cancel when it is the one being edited.
  function section(key, title, o) {
    const editing = ui.editing === key;
    const editBtn = o.editable === false || editing || !o.body ? "" :
      `<button type="button" class="edit-link" data-edit-sec="${key}" aria-label="${esc("Edit " + title)}">${PENCIL}<span>Edit</span></button>`;
    let content;
    if (editing) {
      content = `<div class="sec-edit">${o.edit}<div class="sec-actions"><button type="button" class="btn btn-primary" data-save-sec="${key}">Save</button><button type="button" class="btn" data-cancel-sec>Cancel</button></div></div>`;
    } else if (o.body) {
      content = o.body;
    } else {
      content = `<button type="button" class="empty-line" data-edit-sec="${key}">${esc(o.empty || "Add")}</button>`;
    }
    return `<section class="card-sec${o.cls ? " " + o.cls : ""}" data-sec="${key}"><div class="sec-head"><h3>${esc(title)}</h3>${editBtn}</div>${content}</section>`;
  }
  const bullets = list => ((list || []).length ? `<ul class="bullets">${list.map(t => `<li>${esc(t)}</li>`).join("")}</ul>` : "");
  const lines = (field, list, rows, placeholder) => `<textarea data-f="${field}" data-kind="lines" rows="${Math.min(14, Math.max(rows || 3, (list || []).length + 1))}" placeholder="${esc(placeholder || "One per line")}" aria-label="${esc(placeholder || field)}">${esc((list || []).join("\n"))}</textarea>`;
  const fld = (label, inner) => `<label class="fld"><span>${esc(label)}</span>${inner}</label>`;
  const input = (field, kind, value, extra) => `<input type="${kind === "date" ? "date" : "text"}"${["k", "pct", "int", "num"].includes(kind) ? ' inputmode="decimal"' : ""} data-f="${field}" data-kind="${kind}" value="${esc(blank(value) ? "" : value)}"${extra || ""}>`;
  const textarea = (field, value, rows) => `<textarea data-f="${field}" data-kind="text" rows="${rows || 3}">${esc(value || "")}</textarea>`;
  const selectEl = (field, options, labels, cur) => `<select data-f="${field}" data-kind="select">${options.map(v => opt(v, labels ? labels[v] || v : v, cur)).join("")}</select>`;
  const para = t => (blank(t) ? "" : `<p class="reading">${esc(t)}</p>`);

  // Read every [data-f] input inside a section into { field: value }. Returns undefined on a bad number.
  function readSection(el) {
    const out = {};
    let bad = false;
    el.querySelectorAll("[data-f]").forEach(x => {
      const kind = x.dataset.kind, raw = String(x.value);
      let v;
      if (kind === "bool") v = raw === "true";
      else if (kind === "lines") v = raw.split("\n").map(s => s.replace(/^[\s•\-*]+/, "").trim()).filter(Boolean);
      else if (kind === "text" || kind === "date" || kind === "select") v = raw.trim();
      else {
        const t = raw.trim().replace(/[$,%\s]/g, "");
        if (t === "") v = null;
        else {
          const n = Number(t);
          if (!isFinite(n)) { bad = true; x.classList.add("is-bad"); x.focus(); return; }
          v = kind === "k" ? n * 1000 : kind === "pct" ? n / 100 : kind === "int" ? Math.round(n) : n;
        }
      }
      out[x.dataset.f] = v;
    });
    return bad ? undefined : out;
  }

  // ---------------- Shared card pieces ----------------
  function statusSelect(i, statuses, labels) {
    const p = ui.pending && ui.pending.id === i.id ? ui.pending : null;
    const shown = p ? p.to : i.status;
    const tone = { watching: "is-muted", researching: "is-accent", IC: "is-warn", invested: "is-ok", passed: "is-muted",
                   exploring: "is-accent", active: "is-ok", retired: "is-muted" }[shown] || "is-muted";
    return `<label class="sr-only" for="id-status">Status</label><select id="id-status" class="status-select ${tone}" data-status-select>${statuses.map(s => opt(s, labels[s], shown)).join("")}</select>`;
  }

  // The status-change block for an investment: reason line, plus the funding form when moving to Invested
  // or the reversal note when leaving it.
  function pendingBlock(i) {
    const p = ui.pending && ui.pending.id === i.id ? ui.pending : null;
    if (!p) return "";
    const toFunded = p.to === "invested" && p.from !== "invested";
    let fund = "";
    if (toFunded) {
      const f = p.fund;
      const sources = root.ProFormaModel.fundingSources(ctx.state.holdings);
      fund = `<div class="fund-form" role="group" aria-label="Funding">
          <label class="fld"><span>Funding date</span><input type="date" id="id-fund-date" value="${esc(f.date)}"></label>
          <label class="fld"><span>Funded amount ($K)</span><input type="text" inputmode="decimal" id="id-fund-amount" value="${esc(f.amount)}"></label>
          <label class="fld"><span>Funding source</span><select id="id-fund-source"><option value="cash"${f.source === "cash" ? " selected" : ""}>Cash</option>
            ${sources.map(h => `<option value="${esc(h.id)}"${f.source === h.id ? " selected" : ""}>${esc(h.name)} (${esc(k(Metrics.marketValue(h)))})</option>`).join("")}</select></label>
        </div>`;
    }
    const title = toFunded ? "Mark as Funded" : p.to === "passed" ? "Pass" : PROSPECTIVE.includes(p.to) && !isProspective(i) ? "Move Back to Prospective" : `Move to ${esc(statusLabel(p.to))}`;
    return `<div class="reason" role="group" aria-label="Status change">
        <h3>${title}</h3>
        ${fund}
        <label class="fld fld-reason"><span>Reason</span><div class="add-line"><input type="text" id="id-reason" value="${esc(p.reason || "")}" placeholder="One line for the decision log">
        <button type="button" class="btn btn-primary" data-status-save>${toFunded ? "Save and Fund" : "Save"}</button>
        <button type="button" class="btn" data-status-cancel>Cancel</button></div></label>
        ${p.error ? `<p class="breach" role="alert">${esc(p.error)}</p>` : ""}</div>`;
  }

  function logSection(i) {
    const log = (i.decision_log || []).map((d, n) => ({ d, n }))
      .sort((a, b) => (a.d.date < b.d.date ? 1 : a.d.date > b.d.date ? -1 : b.n - a.n))
      .map(({ d }) => `<tr><td>${esc(d.date)}</td><td>${esc(d.from ? statusLabel(d.from) : "(new)")}</td>
        <td>${esc(statusLabel(d.to))}</td><td class="wrap">${esc(d.reason)}</td></tr>`).join("");
    return `<details class="card-sec log"><summary><h3>Decision Log</h3></summary>
        <div class="table-wrap"><table class="grid log"><thead><tr><th>Date</th><th>From</th><th>To</th><th>Reason</th></tr></thead>
        <tbody>${log || `<tr><td colspan="4" class="muted">No entries yet.</td></tr>`}</tbody></table></div></details>`;
  }

  // ---------------- Investment card ----------------
  function investmentCard(i) {
    const p = ui.pending && ui.pending.id === i.id ? ui.pending : null;
    const editingProfile = ui.editing === "profile";
    const chip = (t, cls, attrs) => (blank(t) ? "" : `<${attrs ? "button type=\"button\"" : "span"} class="chip-static${cls ? " " + cls : ""}"${attrs || ""}>${esc(t)}</${attrs ? "button" : "span"}>`);
    const chips = editingProfile
      ? `<div class="chip-edit">
          ${fld("Type", selectEl("type", TYPES, L.type, i.type))}
          ${fld("Asset class", selectEl("asset_class", CLASSES, L.asset_class, i.asset_class))}
          ${fld("Security type", selectEl("security_type", Object.keys(L.security_type), L.security_type, i.security_type))}
          ${fld("Sector", input("sector", "text", i.sector))}
          ${fld("Theme", `<select data-f="theme_id" data-kind="select"><option value="">None</option>${(ctx.state.themes || []).map(t => opt(t.id, t.name, i.theme_id || "")).join("")}</select>`)}
        </div><div class="sec-actions"><button type="button" class="btn btn-primary" data-save-sec="profile">Save</button><button type="button" class="btn" data-cancel-sec>Cancel</button></div>`
      : `<div class="chips">${[L.type[i.type] || i.type, L.asset_class[i.asset_class] || i.asset_class, L.security_type[i.security_type] || i.security_type, i.sector].filter((t, n, arr) => t && arr.findIndex(x => String(x).toLowerCase() === String(t).toLowerCase()) === n).map(t => chip(t)).join("")}${i.theme_id ? chip(themeName(i.theme_id), "chip-link", ` data-open-theme="${esc(i.theme_id)}"`) : ""}
          <button type="button" class="edit-link" data-edit-sec="profile" aria-label="Edit name, type, asset class, security type, sector and theme">${PENCIL}<span>Edit</span></button></div>`;
    const title = editingProfile
      ? `<label class="sr-only" for="id-card-name">Investment name</label><input type="text" id="id-card-name" class="title-input" data-f="name" data-kind="text" value="${esc(i.name)}">`
      : `<h2 class="card-title" id="id-card-name">${esc(i.name)}</h2>`;

    const statsBody = `<div class="stat-row cols-4 key-stats">
        ${stat("Potential position size", esc(k(i.check_size)) || "—")}
        <div class="stat stat-wide"><span class="stat-label">Target return</span><span class="stat-value">${esc(i.target_return || "—")}</span></div>
        ${stat("Hold", blank(i.hold_months) ? "—" : esc(i.hold_months + " mo"))}
        ${stat("Liquidity score", esc(Metrics.liquidityScore(i).toFixed(0)), `${SCORE_HELP} This one: ${scoreBuild(i)}`)}
      </div>`;
    const statsEdit = `<div class="terms">
        ${fld("Potential position size ($K)", input("check_size", "k", blank(i.check_size) ? "" : +(i.check_size / 1000).toFixed(3)))}
        ${fld("Funded at close (%)", input("funded_pct", "pct", blank(i.funded_pct) ? "" : +(i.funded_pct * 100).toFixed(2)))}
        ${fld("Target return", input("target_return", "text", i.target_return))}
        ${fld("Hold (months)", input("hold_months", "int", i.hold_months))}
        ${fld("Months to 50% back", input("months_to_50pct_back", "int", i.months_to_50pct_back))}
        ${fld("Interim cash", selectEl("interim_cash", ["true", "false"], { true: "Yes", false: "No" }, String(!!i.interim_cash)).replace('data-kind="select"', 'data-kind="bool"'))}
        ${fld("Next step", input("next_step", "text", i.next_step))}
        ${fld("Next step date", input("next_step_date", "date", i.next_step_date))}
      </div>`;

    let actions;
    if (i.status === "invested") {
      actions = `<button type="button" class="btn" data-move-back>Move Back to Prospective</button>` +
        (i.funding ? `<span class="muted">Funded ${esc(i.funding.date)} · ${esc(k(i.funding.amount))} from ${esc(fundedFrom(i))}</span> <button type="button" class="link" data-view-holding="${esc(i.funding.holding_id)}">View in Portfolio</button>` : "");
    } else if (i.status === "passed") {
      actions = `<button type="button" class="btn" data-move-back>Move Back to Prospective</button>`;
    } else {
      actions = `<button type="button" class="btn" data-pass>Pass</button><button type="button" class="btn btn-primary" data-mark-funded>Mark as Funded</button>`;
    }

    return `
    <article class="idea-card" aria-labelledby="id-card-name">
      <header class="card-head" data-sec="profile">
        <div class="title-line">${title}${statusSelect(i, STATUSES, L.status)}${closeBtn}</div>
        ${chips}
        ${p && p.at !== "actions" ? pendingBlock(i) : ""}
      </header>
      ${section("stats", "Key Figures", { body: statsBody, edit: statsEdit, cls: "sec-stats" })}
      ${section("company_overview", "Company Overview", { body: para(i.company_overview), edit: textarea("company_overview", i.company_overview, 2), empty: "Add a company overview" })}
      ${section("key_notes", "Notes", { body: bullets(i.key_notes), edit: lines("key_notes", i.key_notes, 3, "One note per line"), empty: "Add notes" })}
      ${section("thesis", "Thesis", { body: para(i.thesis), edit: textarea("thesis", i.thesis, 3), empty: "Add a thesis" })}
      ${section("diligence", "Diligence To Do", { body: bullets(i.diligence), edit: lines("diligence", i.diligence, 4, "One item per line"), empty: "Add diligence to do" })}
      ${section("terms", "Terms and Fee Detail", { body: para(i.terms), edit: textarea("terms", i.terms, 4), empty: "Add terms and fee detail" })}
      ${section("contacts", "Contacts", { body: bullets(i.contacts), edit: lines("contacts", i.contacts, 2, "Roles only, one per line"), empty: "Add contacts (roles only)" })}
      ${logSection(i)}
      <section class="card-sec card-actions-row" data-sec="actions">${p && p.at === "actions" ? pendingBlock(i) : ""}<div class="actions">${actions}</div></section>
    </article>`;
  }

  // ---------------- Theme card ----------------
  function themeCard(t) {
    const editingProfile = ui.editing === "profile";
    const title = editingProfile
      ? `<label class="sr-only" for="id-card-name">Theme name</label><input type="text" id="id-card-name" class="title-input" data-f="name" data-kind="text" value="${esc(t.name)}">`
      : `<h2 class="card-title" id="id-card-name">${esc(t.name)}</h2>`;

    const vcBody = (t.value_chain || []).length
      ? `<div class="table-wrap"><table class="grid vc"><thead><tr><th class="col-name">Segment</th><th>Description</th><th>Representative Companies</th></tr></thead><tbody>${t.value_chain.map(v =>
          `<tr><td class="col-name">${esc(v.segment)}</td><td class="wrap">${esc(v.description)}</td><td class="wrap">${esc(v.companies || "—")}</td></tr>`).join("")}</tbody></table></div>` : "";
    const vcEdit = lines("value_chain", (t.value_chain || []).map(v => `${v.segment} | ${v.description} | ${v.companies || ""}`), 4, "Segment | Description | Representative companies");

    const pub = t.watch_public || [], priv = t.watch_private || [];
    if (root.Prices) root.Prices.ensureProfiles(pub.map(c => c.ticker));
    const liveCap = c => (root.Prices ? root.Prices.marketCap(c.ticker) : null);
    const capCell = c => { const live = liveCap(c); return `<td class="num" title="${live ? "Live, Finnhub" : blank(c.market_cap) ? "" : "Approximate, stored"}">${esc(Fmt.marketCap(live || c.market_cap))}</td>`; };
    const companyBody = pub.length || priv.length ? `<div class="company-lists">
        <div class="table-wrap"><table class="grid mini"><thead><tr><th class="col-name">Public</th><th>Ticker</th><th class="num" title="Live from Finnhub when it answers; otherwise an approximate stored value">Market Cap</th></tr></thead>
          <tbody>${pub.length ? pub.map(c => `<tr><td class="col-name">${esc(c.company)}</td><td>${esc(c.ticker)}</td>${capCell(c)}</tr>`).join("") : `<tr><td class="col-name muted" colspan="3">None listed.</td></tr>`}</tbody></table></div>
        <div class="table-wrap"><table class="grid mini"><thead><tr><th class="col-name">Private</th><th>Ownership</th></tr></thead>
          <tbody>${priv.length ? priv.map(c => `<tr><td class="col-name">${esc(c.company)}</td><td>${esc(c.ownership || "—")}</td></tr>`).join("") : `<tr><td class="col-name muted" colspan="2">None listed.</td></tr>`}</tbody></table></div>
      </div>` : "";
    const companyEdit = `<label class="fld"><span>Public companies</span>${lines("watch_public", pub.map(c => `${c.company} | ${c.ticker}${blank(c.market_cap) ? "" : " | " + Math.round(c.market_cap / 1e6)}`), 3, "Company | Ticker | Approximate market cap ($M)")}</label>
      <label class="fld"><span>Private companies</span>${lines("watch_private", priv.map(c => `${c.company} | ${c.ownership || ""}`), 3, "Company | Ownership")}</label>`;

    const linked = TM.linked(ctx.state, t);
    const linkedBody = linked.length ? `<div class="table-wrap"><table class="grid mini"><thead><tr><th class="col-name">Investment</th><th>Status</th><th class="num">Position Size <span class="unit-hint">($K)</span></th><th class="num" title="${esc(SCORE_HELP)}">Liquidity Score</th></tr></thead>
        <tbody>${linked.map(i => `<tr class="idea-row" data-open-inv="${esc(i.id)}" tabindex="0">
          <td class="col-name">${esc(i.name)}</td><td>${esc(L.status[i.status] || i.status)}</td><td class="num">${esc(Fmt.thousands(i.check_size))}</td>
          <td class="num">${esc(Metrics.liquidityScore(i).toFixed(0))}</td></tr>`).join("")}</tbody></table></div>` : "";
    const linkedEdit = `<div class="picks" role="group" aria-label="Linked investments">${ctx.state.investments.map(i => {
        const other = i.theme_id && i.theme_id !== t.id ? themeName(i.theme_id) : "";
        return `<label class="pick"><input type="checkbox" data-link-inv="${esc(i.id)}"${i.theme_id === t.id ? " checked" : ""}> ${esc(i.name)}${other ? ` <span class="muted">(now in ${esc(other)})</span>` : ""}</label>`;
      }).join("")}</div>`;

    return `
    <article class="idea-card" aria-labelledby="id-card-name">
      <header class="card-head">
        <div class="title-line">${title}${statusSelect(t, THEME_STATUSES, L.theme_status)}${closeBtn}</div>
      </header>
      ${section("profile", "Description", { body: para(t.description), edit: `${fld("Theme name", input("name", "text", t.name))}${fld("Description", textarea("description", t.description, 2))}`, empty: "Add a description" })}
      ${section("key_notes", "Notes", { body: bullets(t.key_notes), edit: lines("key_notes", t.key_notes, 3, "One note per line"), empty: "Add notes" })}
      ${section("thesis", "Thesis", { body: para(t.thesis), edit: textarea("thesis", t.thesis, 3), empty: "Add a thesis" })}
      ${section("value_chain", "Value Chain and Key Players", { body: vcBody, edit: vcEdit, empty: "Add the value chain" })}
      ${section("companies", "Company List", { body: companyBody, edit: companyEdit, empty: "Add public or private companies" })}
      ${section("industry_context", "Industry Context", { body: para(t.industry_context), edit: textarea("industry_context", t.industry_context, 3), empty: "Add industry context" })}
      ${section("linked", "Linked Investments", { body: linkedBody, edit: linkedEdit, empty: "Link investments" })}
    </article>`;
  }

  function noticeHtml() {
    const n = ui.notice;
    if (!n) return "";
    return `<div class="notice" role="status"><span>${esc(n.text)}</span>${n.holding_id ? ` <button type="button" class="link" data-view-holding="${esc(n.holding_id)}">View in Portfolio</button>` : ""}<button type="button" class="close-btn close-sm" data-notice-close aria-label="Dismiss">×</button></div>`;
  }

  // The investment pane sits directly under the list its row is in (prospective, completed or passed).
  function renderCard() {
    const cur = current();
    document.getElementById("th-card").innerHTML = cur && isTheme() ? themeCard(cur) : "";
    const slots = { prospective: "id-card", completed: "id-card-completed", passed: "id-card-passed" };
    const where = cur && !isTheme() ? (cur.status === "invested" ? "completed" : cur.status === "passed" ? "passed" : "prospective") : null;
    Object.entries(slots).forEach(([kk, id]) => {
      const el = document.getElementById(id);
      el.innerHTML = kk === where ? noticeHtml() + investmentCard(cur) : "";
    });
  }

  function renderAll() {
    renderThemeList();
    renderFilters();
    renderTables();
    renderCard();
  }

  // ---------------- Saving a section ----------------
  const split3 = line => line.split("|").map(x => x.trim());
  function saveSection(key) {
    const i = current();
    if (!i) return;
    const el = document.querySelector(`#sec-opportunities [data-sec="${key}"]`);
    if (!el) return;
    const v = readSection(el);
    if (v === undefined) return;
    if (key === "profile") {
      if (v.name) i.name = v.name;
      if (isTheme()) { if ("description" in v) i.description = v.description; }
      else {
        ["type", "asset_class", "security_type", "sector"].forEach(f => { if (f in v) i[f] = v[f] || (f === "sector" ? "" : i[f]); });
        if ("theme_id" in v) TM.setTheme(ctx.state, i.id, v.theme_id || null);
      }
    } else if (key === "value_chain") {
      i.value_chain = (v.value_chain || []).map(line => { const p = split3(line); return { segment: p[0] || "", description: p[1] || "", companies: p[2] || "" }; }).filter(x => x.segment || x.description);
    } else if (key === "companies") {
      i.watch_public = (v.watch_public || []).map(line => {
        const p = split3(line);
        const mc = Number(String(p[2] || "").replace(/[$,\s]/g, ""));
        return { company: p[0] || (p[1] || "").toUpperCase(), ticker: (p[1] || "").toUpperCase(), market_cap: isFinite(mc) && mc > 0 ? mc * 1e6 : null };
      }).filter(x => x.company || x.ticker);
      i.watch_private = (v.watch_private || []).map(line => { const p = split3(line); return { company: p[0] || "", ownership: p[1] || "—" }; }).filter(x => x.company);
    } else if (key === "linked") {
      // Checkbox changes are applied as they happen; Save just closes the section.
    } else {
      Object.assign(i, v);
    }
    ui.editing = null;
    commit();
  }

  function startEdit(key) {
    ui.editing = key;
    renderCard();
    const el = document.querySelector(`#sec-opportunities [data-sec="${key}"] textarea, #sec-opportunities [data-sec="${key}"] input:not([type=checkbox]), #sec-opportunities [data-sec="${key}"] select`);
    if (el) el.focus();
  }

  // ---------------- Status changes, funding, pass, move back ----------------
  function openPending(i, to, at) {
    if (to === i.status) { ui.pending = null; return renderCard(); }
    const toFunded = to === "invested" && i.status !== "invested";
    ui.pending = { id: i.id, from: i.status, to, reason: toFunded ? "Marked as funded" : "", at: at || "head",
                   fund: { date: today(), amount: +(root.InvestModel.defaultAmount(i) / 1000).toFixed(3), source: "cash" } };
    ui.editing = null;
    renderCard();
    const first = document.getElementById(toFunded ? "id-fund-date" : "id-reason");
    if (first) { first.focus({ preventScroll: true }); first.scrollIntoView({ block: "nearest" }); }
  }

  function saveStatus() {
    const i = current(), p = ui.pending;
    if (!i || !p) return;
    const reason = (document.getElementById("id-reason").value || "").trim();
    if (!reason) {
      p.error = "Enter a one-line reason for the decision log.";
      renderCard();
      document.getElementById("id-reason").focus();
      return;
    }
    let line = reason;
    if (p.to === "invested" && p.from !== "invested") {
      const n = Number(String(p.fund.amount).replace(/[$,\s]/g, ""));
      const f = { date: p.fund.date, amount: isFinite(n) ? n * 1000 : 0, source: p.fund.source };
      const err = root.InvestModel.validate(ctx.state, i, f);
      if (err) { p.error = err; renderCard(); return; }
      root.InvestModel.execute(ctx.state, i, f);
      line += " " + root.InvestModel.describe(i.funding);
      ui.notice = { text: `${i.name} funded: ${k(i.funding.amount)} from ${fundedFrom(i)}.`, holding_id: i.funding.holding_id };
    } else if (p.from === "invested" && p.to !== "invested" && i.funding) {
      if (!root.confirm(`Reverse the funding of ${i.name}? ${root.InvestModel.describe(i.funding)} The holding and its blotter entries are removed and the funding source is restored.`)) return;
      line += " Funding reversed.";
      root.InvestModel.reverse(ctx.state, i);
      ui.notice = { text: `${i.name} moved back to ${statusLabel(p.to)}; its funding was reversed and the book restored.` };
    }
    i.decision_log = i.decision_log || [];
    i.decision_log.push({ date: today(), from: p.from, to: p.to, reason: line });
    i.status = p.to;
    ui.pending = null;
    commit();
  }

  // Completed -> prospective: confirm, reverse the funding exactly as the status pill does, no reason asked.
  function moveBackFromCompleted(i) {
    const to = SM.priorStatus(i);
    if (!root.confirm(`Move ${i.name} back to ${statusLabel(to)}? ${i.funding ? root.InvestModel.describe(i.funding) + " The holding and its blotter entries are removed and the funding source is restored." : ""}`)) return;
    SM.moveBack(ctx.state, i, "Moved back to prospective.", today());
    ui.pending = null;
    ui.notice = { text: `${i.name} moved back to ${statusLabel(i.status)}; its funding was reversed and the book restored.` };
    commit();
  }

  // Opening a row or bar that is already open closes it (toggle).
  function select(kind, id, toggle) {
    const same = ui.sel && ui.sel.kind === kind && ui.sel.id === id;
    if (same && toggle) return closeCard();
    if (!same) { ui.pending = null; ui.editing = null; ui.notice = null; }
    ui.sel = { kind, id };
    const panelId = kind === "theme" ? "tab-themes" : "tab-ideas";
    if (document.getElementById(panelId).hidden && root.App) root.App.showTab(kind === "theme" ? "opportunities/themes" : "opportunities/ideas");
    else ctx.onChange(false);
  }

  // Close the open card (×, Esc, or re-clicking its row). Focus returns to the row or bar without scrolling.
  function closeCard() {
    if (!ui.sel) return;
    const { kind, id } = ui.sel;
    ui.sel = null;
    ui.pending = null;
    ui.editing = null;
    ui.notice = null;
    ctx.onChange(false);
    const sel = kind === "theme" ? `[data-theme="${CSS.escape(id)}"]` : `tr[data-inv="${CSS.escape(id)}"]`;
    const opener = document.querySelector("#sec-opportunities " + sel);
    if (opener) opener.focus({ preventScroll: true });
  }

  function bind() {
    if (ui.bound) return;
    ui.bound = true;
    const panel = document.getElementById("sec-opportunities");
    const visible = () => !!panel.querySelector("section[role=tabpanel]:not([hidden])");

    panel.addEventListener("click", e => {
      const t = e.target;
      if (t.closest("#id-intake")) return; // the intake module handles its own clicks
      const view = t.closest("[data-view-holding]");
      if (view) return root.App.viewHolding(view.dataset.viewHolding);
      if (t.closest("[data-notice-close]")) { ui.notice = null; return renderCard(); }
      const chip = t.closest("[data-chip]");
      if (chip) {
        const set = ui[chip.dataset.chip];
        set.has(chip.dataset.value) ? set.delete(chip.dataset.value) : set.add(chip.dataset.value);
        return ctx.onChange(false);
      }
      if (t.closest("[data-chip-clear]")) { ui.status.clear(); ui.type.clear(); return ctx.onChange(false); }
      const sortBtn = t.closest("[data-sort]");
      if (sortBtn) {
        const key = sortBtn.dataset.sort;
        ui.sort = ui.sort.key === key ? { key, dir: -ui.sort.dir } : { key, dir: 1 };
        return ctx.onChange(false);
      }
      if (t.closest("[data-close]")) return closeCard();
      const bar = t.closest("[data-theme]");
      if (bar) return select("theme", bar.dataset.theme, true);
      const row = t.closest("tr[data-inv]");
      if (row) return select("investment", row.dataset.inv, true);
      const open = t.closest("tr[data-open-inv]");
      if (open) return select("investment", open.dataset.openInv);
      const openTheme = t.closest("[data-open-theme]");
      if (openTheme) return select("theme", openTheme.dataset.openTheme);

      const i = current();
      if (!i) return;
      const ed = t.closest("[data-edit-sec]");
      if (ed) return startEdit(ed.dataset.editSec);
      const sv = t.closest("[data-save-sec]");
      if (sv) return saveSection(sv.dataset.saveSec);
      if (t.closest("[data-cancel-sec]")) { ui.editing = null; return renderCard(); }
      if (t.closest("[data-mark-funded]")) return openPending(i, "invested", "actions");
      if (t.closest("[data-pass]")) return openPending(i, "passed", "actions");
      if (t.closest("[data-move-back]")) return i.status === "invested" ? moveBackFromCompleted(i) : openPending(i, SM.priorStatus(i), "actions");
      if (t.closest("[data-status-save]")) return saveStatus();
      if (t.closest("[data-status-cancel]")) { ui.pending = null; return renderCard(); }
    });

    panel.addEventListener("change", e => {
      const el = e.target;
      if (el.closest("#id-intake")) return;
      const i = current();
      if (!i) return;
      if (el.matches("[data-status-select]")) {
        if (isTheme()) { i.status = el.value; return commit(); } // themes keep no decision log
        return openPending(i, el.value, "head");
      }
      if (el.matches("[data-link-inv]")) { TM.setTheme(ctx.state, el.dataset.linkInv, el.checked ? i.id : null); save(); renderThemeList(); renderTables(); return; }
      if (ui.pending) {
        if (el.id === "id-fund-source") ui.pending.fund.source = el.value;
        if (el.id === "id-fund-date") ui.pending.fund.date = el.value;
      }
    });

    panel.addEventListener("input", e => {
      if (!ui.pending) return;
      if (e.target.id === "id-reason") ui.pending.reason = e.target.value;
      if (e.target.id === "id-fund-date") ui.pending.fund.date = e.target.value;
      if (e.target.id === "id-fund-amount") ui.pending.fund.amount = e.target.value;
    });

    panel.addEventListener("keydown", e => {
      const el = e.target;
      if (!el.matches || el.closest("#id-intake")) return;
      if (e.key === "Enter" && el.matches("tr[data-inv]")) { e.preventDefault(); return select("investment", el.dataset.inv, true); }
      if (e.key === "Enter" && el.matches("tr[data-open-inv]")) { e.preventDefault(); return select("investment", el.dataset.openInv); }
      if (e.key !== "Enter") return;
      if (el.id === "id-reason") { e.preventDefault(); if (ui.pending) ui.pending.reason = el.value; return saveStatus(); }
      if (el.id === "id-fund-amount") { e.preventDefault(); return document.getElementById("id-reason").focus(); }
      // Enter in a single-line section input saves that section; textareas keep Enter for new lines.
      if (el.matches("input[data-f]") && ui.editing) { e.preventDefault(); return saveSection(ui.editing); }
    });

    // Esc cancels a section edit, then a pending status change, then closes the card.
    document.addEventListener("keydown", e => {
      if (e.key !== "Escape" || !ui.sel || !visible()) return;
      if (e.target.closest && e.target.closest("#id-intake")) return;
      e.preventDefault();
      if (ui.editing) { ui.editing = null; return renderCard(); }
      if (ui.pending) { ui.pending = null; return renderCard(); }
      closeCard();
    });
  }

  function render(state, onChange) {
    if (ctx && ctx.state !== state) { ui.pending = null; ui.editing = null; ui.notice = null; } // state replaced (reset)
    ctx = { state, onChange };
    bind();
    if (ui.sel && !current()) { ui.sel = null; ui.pending = null; ui.editing = null; }
    root.Intake.render(state, inv => {
      ctx.state.investments.push(inv);
      save();
      select("investment", inv.id);
    });
    renderAll();
  }

  // Open an investment's card from elsewhere in the app (holdings rows, the Pro Forma checklist).
  function open(id) { select("investment", id); }

  root.Ideas = { render, open };
})(window);
