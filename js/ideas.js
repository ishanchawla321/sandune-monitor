// Opportunities section: Themes tab (grid + card) and Ideas tab (prospective, completed and passed investments + card).
// Cards open in read mode. Each section has a pencil that switches only that section to inputs with Save / Cancel.
// One section framework serves both card kinds; each kind lists its own sections.
(function (root) {
  "use strict";

  const Fmt = root.Fmt, Metrics = root.Metrics, TM = root.ThemesModel;
  const L = Fmt.LABELS;
  const esc = Fmt.esc;
  const STATUSES = Object.keys(L.status);
  const THEME_STATUSES = Object.keys(L.theme_status);
  const TYPES = Object.keys(L.type);
  const CLASSES = Object.keys(L.asset_class);
  const PROSPECTIVE = ["watching", "researching", "IC"];
  const isProspective = i => PROSPECTIVE.includes(i.status);
  const openDiligence = i => TM.openDiligence(i);
  const PENCIL = `<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M11.3 1.7a1 1 0 0 1 1.4 0l1.6 1.6a1 1 0 0 1 0 1.4L5.5 13.5 1.8 14.2l.7-3.7 8.8-8.8zM3.6 11l-.3 1.7 1.7-.3 7.9-7.9-1.4-1.4L3.6 11z" fill="currentColor"/></svg>`;

  const themeName = id => { const t = (ctx.state.themes || []).find(x => x.id === id); return t ? t.name : ""; };
  const fundedFrom = i => (i.funding ? (i.funding.source === "cash" ? "cash" : i.funding.source_name) : "");

  const COLS = [
    { key: "name", label: "Name", cls: "col-name" },
    { key: "theme", label: "Theme", wrapSm: true, value: i => themeName(i.theme_id) },
    { key: "type", label: "Type", wrapSm: true, show: i => L.type[i.type] || i.type },
    { key: "status", label: "Status", show: i => L.status[i.status] || i.status },
    { key: "diligence", label: "Open diligence", num: true, value: i => openDiligence(i), show: i => String(openDiligence(i)) },
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
    { key: "funded_date", label: "Funded on", value: i => (i.funding ? i.funding.date : "") },
    { key: "funded_amount", label: "Funded ($K)", num: true, value: i => (i.funding ? i.funding.amount : null), show: i => (i.funding ? Fmt.thousands(i.funding.amount) : "") },
    { key: "funding_source", label: "Funded from", value: i => fundedFrom(i), show: i => (i.funding ? (i.funding.source === "cash" ? "Cash" : i.funding.source_name) : ""), wrapSm: true },
    { key: "holding", label: "Holding", value: i => (i.funding ? "View in Portfolio" : ""),
      html: i => (i.funding ? `<button type="button" class="link" data-view-holding="${esc(i.funding.holding_id)}">View in Portfolio</button>` : "") }
  ];
  const COMPACT = ["name", "theme", "type", "status", "diligence", "score", "check_size", "funded_pct", "hold_months", "next_step"];
  const ALL = COLS.filter(c => !["funded_date", "funded_amount", "funding_source", "holding"].includes(c.key));
  const COMPLETED = ["name", "theme", "type", "funded_date", "funded_amount", "funding_source", "hold_months", "target_return", "holding"];

  // sel: { kind: "theme" | "investment", id }. editing: the section key in edit mode, or null.
  const ui = { sort: { key: null, dir: 1 }, status: new Set(), type: new Set(), sel: null, editing: null,
               pending: null, bound: false, assessing: null, allCols: false, notice: null };
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
  const k = v => (blank(v) ? "" : "$" + Fmt.thousands(v) + "K");

  function scoreBuild(i) {
    const s = Metrics.liquidityScoreParts(i);
    return s.isPublic ? "(public)" : `(${s.parts.map(r1).join(" + ")})`;
  }

  const stat = (label, value) => `<div class="stat"><span class="stat-label">${label}</span><span class="stat-value">${value}</span></div>`;
  const THEME_STATUS_CLASS = { active: "is-ok", exploring: "is-accent", retired: "is-muted" };
  const closeBtn = `<button type="button" class="close-btn" data-close aria-label="Close">×</button>`;
  const opt = (value, label, cur) => `<option value="${esc(value)}"${value === cur ? " selected" : ""}>${esc(label)}</option>`;

  function save() { root.Store.save(ctx.state); }
  function commit() { save(); ctx.onChange(false); }

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
          <span class="stat"><span class="stat-label">Total check</span><span class="stat-value">${esc(k(s.check))}</span></span>
          <span class="stat"><span class="stat-label">Blended liquidity</span><span class="stat-value">${s.blended === null ? "n/a" : esc(s.blended.toFixed(0))}</span></span>
        </span>
        <span class="tt-meta"><span><span class="stat-label">Last signal</span> ${esc(s.lastSignal || "none")}</span><span><span class="stat-label">Next step</span> ${esc(s.nextStep || "none")}</span></span></button>`;
    }).join("") : `<p class="muted">No themes yet.</p>`;
  }

  // ---------------- Investment filters and tables ----------------
  function renderFilters() {
    const chips = (group, keys, set, labels) => keys.map(kk => {
      const n = ctx.state.investments.filter(i => i[group] === kk && (group === "status" || isProspective(i))).length;
      return `<button type="button" class="chip" data-chip="${group}" data-value="${esc(kk)}" aria-pressed="${set.has(kk)}">${esc(labels[kk])} <span class="chip-n">${n}</span></button>`;
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
    cols.map(c => `<td class="${c.num ? "num " : ""}${c.cls || ""}${c.wrap ? " wrap" : ""}${c.wrapSm ? " wrap-sm" : ""}">${c.html ? c.html(i) : esc(colText(c, i))}</td>`).join("") + "</tr>";
  const count = (id, n, noun) => { document.getElementById(id).textContent = `${n} ${n === 1 ? noun : noun + "s"}`; };

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
    const cols = ui.allCols ? ALL : COMPACT.map(kk => COLS.find(c => c.key === kk));
    const empty = rows.length ? "" : `<tr><td class="col-name muted" colspan="${cols.length}">${prospective.length ? "No prospective investments match these filters." : "No prospective investments yet."}</td></tr>`;
    document.getElementById("id-table").innerHTML = `<thead><tr>${cols.map(c => headCell(c, true)).join("")}</tr></thead><tbody>${rows.map(i => rowHtml(i, cols, selId)).join("")}${empty}</tbody>`;
    count("id-prospective-count", prospective.length, "investment");
    const tog = document.getElementById("id-cols");
    tog.setAttribute("aria-pressed", String(ui.allCols));
    tog.textContent = ui.allCols ? "Compact view" : "All columns";

    const done = all.filter(i => i.status === "invested");
    const dcols = COMPLETED.map(kk => COLS.find(c => c.key === kk));
    document.getElementById("id-completed").innerHTML = done.length
      ? `<div class="table-wrap"><table class="grid ideas"><thead><tr>${dcols.map(c => headCell(c, false)).join("")}</tr></thead><tbody>${done.map(i => rowHtml(i, dcols, selId)).join("")}</tbody></table></div>`
      : `<p class="placeholder">Investments move here when marked Invested.</p>`;
    count("id-completed-count", done.length, "investment");

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

  // ---------------- Section framework ----------------
  // A card section shows its content in read mode, or its inputs with Save / Cancel when it is the one being edited.
  function section(key, title, o) {
    const editing = ui.editing === key;
    const cnt = o.count !== undefined ? ` <span class="sec-count">(${esc(String(o.count))})</span>` : "";
    const editBtn = o.editable === false || editing ? "" :
      `<button type="button" class="edit-link" data-edit-sec="${key}" aria-label="${esc(o.editLabel || "Edit " + title)}">${PENCIL}<span>${esc(o.editText || "Edit")}</span></button>`;
    let content;
    if (editing) {
      content = `<div class="sec-edit">${o.edit}<div class="sec-actions"><button type="button" class="btn btn-primary" data-save-sec="${key}">${esc(o.saveLabel || "Save")}</button><button type="button" class="btn" data-cancel-sec>Cancel</button></div></div>`;
    } else if (o.body) {
      content = o.body;
    } else {
      content = `<button type="button" class="empty-line" data-edit-sec="${key}">${esc(o.empty || "Add")}</button>`;
    }
    return `<section class="card-sec${o.cls ? " " + o.cls : ""}" data-sec="${key}"><div class="sec-head"><h3>${esc(title)}${cnt}</h3>${editBtn}</div>${content}</section>`;
  }
  const bullets = list => ((list || []).length ? `<ul class="bullets">${list.map(t => `<li>${esc(t)}</li>`).join("")}</ul>` : "");
  const lines = (field, list, rows, placeholder) => `<textarea data-f="${field}" data-kind="lines" rows="${rows || Math.max(3, (list || []).length + 1)}" placeholder="${esc(placeholder || "One per line")}" aria-label="${esc(placeholder || field)}">${esc((list || []).join("\n"))}</textarea><p class="note">One item per line. Enter starts a new bullet; pasted lines become bullets.</p>`;
  const fld = (label, inner) => `<label class="fld"><span>${esc(label)}</span>${inner}</label>`;
  const input = (field, kind, value, extra) => `<input type="${kind === "date" ? "date" : "text"}"${["k", "pct", "int", "num"].includes(kind) ? ' inputmode="decimal"' : ""} data-f="${field}" data-kind="${kind}" value="${esc(blank(value) ? "" : value)}"${extra || ""}>`;
  const textarea = (field, value, rows) => `<textarea data-f="${field}" data-kind="text" rows="${rows || 3}">${esc(value || "")}</textarea>`;
  const selectEl = (field, options, labels, cur, extra) => `<select data-f="${field}" data-kind="select"${extra || ""}>${options.map(v => opt(v, labels ? labels[v] || v : v, cur)).join("")}</select>`;
  const para = t => (blank(t) ? "" : `<p class="reading">${esc(t)}</p>`);

  // Read every [data-f] input inside a section into { field: value }. Returns undefined on a bad number.
  function readSection(el) {
    const out = {};
    let bad = false;
    el.querySelectorAll("[data-f]").forEach(x => {
      const kind = x.dataset.kind, raw = x.type === "checkbox" ? x.checked : String(x.value);
      let v;
      if (kind === "bool") v = raw === "true" || raw === true;
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

  // Merge edited open lines into a diligence list, keeping ids of unchanged items and every done item.
  function mergeItems(existing, openLines, prefix) {
    const done = (existing || []).filter(d => d.done);
    const open = (existing || []).filter(d => !d.done);
    const used = new Set();
    const next = openLines.map(text => {
      const hit = open.find(d => d.text === text && !used.has(d.id));
      if (hit) { used.add(hit.id); return hit; }
      return { id: newId(prefix), text, done: null };
    });
    return next.concat(done);
  }

  // ---------------- Shared card pieces ----------------
  function statusHeader(i, statuses, labels) {
    const p = ui.pending && ui.pending.id === i.id ? ui.pending : null;
    const shown = p ? p.to : i.status;
    const tone = { watching: "is-muted", researching: "is-accent", IC: "is-warn", invested: "is-ok", passed: "is-muted",
                   exploring: "is-accent", active: "is-ok", retired: "is-muted" }[shown] || "is-muted";
    return `<label class="sr-only" for="id-status">Status</label><select id="id-status" class="status-select ${tone}" data-status-select>${statuses.map(s => opt(s, labels[s], shown)).join("")}</select>`;
  }

  // The status-change block: reason line, plus the funding form when moving to Invested or the reversal note when leaving it.
  function pendingBlock(i) {
    const p = ui.pending && ui.pending.id === i.id ? ui.pending : null;
    if (!p) return "";
    let fund = "";
    if (!isTheme() && p.to === "invested" && p.from !== "invested") {
      const f = p.fund;
      const sources = root.ProFormaModel.fundingSources(ctx.state.holdings);
      const open = openDiligence(i);
      fund = `<div class="fund-form" role="group" aria-label="Funding">
          <label class="fld"><span>Funding date</span><input type="date" id="id-fund-date" value="${esc(f.date)}"></label>
          <label class="fld"><span>Funded amount ($K)</span><input type="text" inputmode="decimal" id="id-fund-amount" value="${esc(f.amount)}"></label>
          <label class="fld"><span>Funding source</span><select id="id-fund-source"><option value="cash"${f.source === "cash" ? " selected" : ""}>Cash</option>
            ${sources.map(h => `<option value="${esc(h.id)}"${f.source === h.id ? " selected" : ""}>${esc(h.name)} (${esc(k(Metrics.marketValue(h)))})</option>`).join("")}</select></label>
        </div>
        ${open ? `<p class="note">${open} diligence ${open === 1 ? "item" : "items"} still open.</p>` : ""}
        <p class="note">Saving posts the buy or capital call to the blotter, creates the holding in Portfolio &gt; Current and reduces the funding source.</p>`;
    } else if (!isTheme() && p.from === "invested" && p.to !== "invested" && i.funding) {
      fund = `<p class="note">Saving reverses the funding: ${esc(root.InvestModel.describe(i.funding))} The holding and blotter entries are removed and cash is restored. You will be asked to confirm.</p>`;
    }
    return `<div class="reason" role="group" aria-label="Status change">
        <label for="id-reason">${p.to === "invested" && p.from !== "invested" ? "Mark as funded" : `Move from ${esc(statusLabel(p.from))} to ${esc(statusLabel(p.to))}`}: reason for the decision log (required)</label>
        ${fund}
        <div class="add-line"><input type="text" id="id-reason" value="${esc(p.reason || "")}" placeholder="One line">
        <button type="button" class="btn btn-primary" data-status-save>${p.to === "invested" && p.from !== "invested" ? "Save and fund" : "Save status"}</button>
        <button type="button" class="btn" data-status-cancel>Cancel</button></div>
        ${p.error ? `<p class="breach" role="alert">${esc(p.error)}</p>` : ""}</div>`;
  }

  function priceLine(ticker, seedPrice, seedDate) {
    const live = root.Prices && root.Prices.quote(ticker);
    const px = live ? live.price : seedPrice;
    if (blank(px)) return "";
    return `<li class="price-line"><span class="sig-date">${esc(live ? live.when.slice(0, 10) : seedDate || ctx.state.as_of)}</span><span class="sig-body"><b>${esc(ticker)}</b> ${esc(Fmt.number(px, px < 10 ? 3 : 2))}
      <span class="tag">${live ? `Live · Finnhub, ${esc(live.when)}` : `Cached, as of ${esc(seedDate || ctx.state.as_of)}`}</span>${live && !blank(seedPrice) ? ` <span class="muted">Seed ${esc(Fmt.number(seedPrice, seedPrice < 10 ? 3 : 2))}.</span>` : ""}</span></li>`;
  }

  function signalsSection(i, priceLines) {
    const notes = (i.signals || []).filter(s => s.kind !== "price").map((s, n) => ({ s, n }))
      .sort((a, b) => (a.s.date < b.s.date ? 1 : a.s.date > b.s.date ? -1 : b.n - a.n))
      .map(({ s }) => {
        const busy = ui.assessing === s.id;
        const check = root.Api.available
          ? `<button type="button" class="link" data-assess="${esc(s.id)}"${busy ? " disabled" : ""}>${busy ? "Checking…" : "Check thesis"}</button>`
          : `<button type="button" class="link" disabled title="Available on the hosted site; needs the /api functions.">Check thesis</button>`;
        return `<li><span class="sig-date">${esc(s.date)}</span><span class="sig-body">${esc(s.text)}
            ${s.ai ? `<span class="ai-read"><span class="tag tag-ai">AI read</span> ${esc(s.ai.line)} <span class="muted">(${esc(s.ai.date)})</span></span>` : ""}</span>
            <span class="sig-actions">${check} <button type="button" class="link danger" data-note-del="${esc(s.id)}">Delete</button></span></li>`;
      }).join("");
    const body = priceLines || notes ? `<ul class="signals">${priceLines}${notes}</ul>` : "";
    const edit = `<div class="note-form" role="group" aria-label="Add note">
        ${fld("Date", input("date", "date", today()))}
        <label class="fld grow"><span>Note</span>${input("text", "text", "", ' placeholder="What happened"')}</label></div>`;
    return section("signals", "Signals", { body: body || (priceLines ? `<ul class="signals">${priceLines}</ul>` : ""), edit, saveLabel: "Add note", editText: "Add note", editLabel: "Add a signal note",
                                            empty: "Add a dated note", count: (i.signals || []).filter(s => s.kind !== "price").length || undefined });
  }

  function logSection(i) {
    const log = (i.decision_log || []).map((d, n) => ({ d, n }))
      .sort((a, b) => (a.d.date < b.d.date ? 1 : a.d.date > b.d.date ? -1 : b.n - a.n))
      .map(({ d }) => `<tr><td>${esc(d.date)}</td><td>${esc(d.from ? statusLabel(d.from) : "(new)")}</td>
        <td>${esc(statusLabel(d.to))}</td><td class="wrap">${esc(d.reason)}</td></tr>`).join("");
    return `<details class="card-sec log"><summary><h3>Decision log <span class="sec-count">(${(i.decision_log || []).length})</span></h3></summary>
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
      : `<div class="chips">${chip(L.type[i.type] || i.type)}${chip(L.asset_class[i.asset_class] || i.asset_class)}${chip(L.security_type[i.security_type] || i.security_type)}${chip(i.sector)}${i.theme_id ? chip(themeName(i.theme_id), "chip-link", ` data-open-theme="${esc(i.theme_id)}" title="Open theme"`) : ""}
          <button type="button" class="edit-link" data-edit-sec="profile" aria-label="Edit name, type, asset class, security type, sector and theme">${PENCIL}<span>Edit</span></button></div>`;
    const title = editingProfile
      ? `<label class="sr-only" for="id-card-name">Investment name</label><input type="text" id="id-card-name" class="title-input" data-f="name" data-kind="text" value="${esc(i.name)}">`
      : `<h2 class="card-title" id="id-card-name">${esc(i.name)}</h2>`;
    const funded = (Number(i.check_size) || 0) * (Number(i.funded_pct) || 0);
    const check = Number(i.check_size) || 0;

    // Key stats
    const statsBody = `<div class="stat-row cols-6 key-stats">
        ${stat("Check size", esc(k(i.check_size)) || "—")}
        ${stat("Funded at close", blank(i.funded_pct) ? "—" : esc(Fmt.pct(i.funded_pct, 0)))}
        ${stat("Target return", esc(i.target_return || "—"))}
        ${stat("Hold", blank(i.hold_months) ? "—" : esc(i.hold_months + " mo"))}
        ${stat(`Liquidity score <span class="stat-hint">${esc(scoreBuild(i))}</span>`, esc(Metrics.liquidityScore(i).toFixed(0)))}
        ${stat("Next step", `${esc(i.next_step || "—")}${i.next_step_date ? ` <span class="stat-date">${esc(i.next_step_date)}</span>` : ""}`)}
      </div>`;
    const statsEdit = `<div class="terms">
        ${fld("Check size ($K)", input("check_size", "k", blank(i.check_size) ? "" : +(i.check_size / 1000).toFixed(3)))}
        ${fld("Funded at close (%)", input("funded_pct", "pct", blank(i.funded_pct) ? "" : +(i.funded_pct * 100).toFixed(2)))}
        ${fld("Target return", input("target_return", "text", i.target_return))}
        ${fld("Hold (months)", input("hold_months", "int", i.hold_months))}
        ${fld("Months to 50% back", input("months_to_50pct_back", "int", i.months_to_50pct_back))}
        ${fld("Interim cash", selectEl("interim_cash", ["true", "false"], { true: "Yes", false: "No" }, String(!!i.interim_cash)).replace('data-kind="select"', 'data-kind="bool"'))}
        ${fld("Next step", input("next_step", "text", i.next_step))}
        ${fld("Next step date", input("next_step_date", "date", i.next_step_date))}
      </div><p class="note">Liquidity score ${esc(Metrics.liquidityScore(i).toFixed(0))} ${esc(scoreBuild(i))} = 40 x (1 - months to 50% back / 60) + 40 x (1 - hold / 60) + 20 if interim cash. Public = 100.</p>`;

    // Diligence
    const dil = (list, listKey, label) => {
      const open = (list || []).filter(d => !d.done), done = (list || []).filter(d => d.done);
      const li = d => `<li class="dil${d.done ? " done" : ""}"><label><input type="checkbox" data-dil="${listKey}:${esc(d.id)}"${d.done ? " checked" : ""}> <span class="dil-text">${esc(d.text)}</span>${d.done ? ` <span class="dil-date">done ${esc(d.done)}</span>` : ""}</label></li>`;
      return `<div class="dil-list"><h4>${esc(label)} <span class="sec-count">(${open.length} open)</span></h4>${open.length || done.length ? `<ul class="dil-items">${open.map(li).join("")}${done.map(li).join("")}</ul>` : `<p class="muted">None.</p>`}</div>`;
    };
    const nOpen = openDiligence(i);
    const dilBody = (i.diligence_documents || []).length || (i.diligence_other || []).length
      ? dil(i.diligence_documents, "diligence_documents", "Document asks and checks") + dil(i.diligence_other, "diligence_other", "Other diligence") : "";
    const dilEdit = `<div class="dil-edit">
        <label class="fld"><span>Document asks and checks (open items)</span>${lines("diligence_documents", (i.diligence_documents || []).filter(d => !d.done).map(d => d.text), 4, "Documents to request, numbers that don't tie")}</label>
        <label class="fld"><span>Other diligence (open items)</span>${lines("diligence_other", (i.diligence_other || []).filter(d => !d.done).map(d => d.text), 3, "Calls, analysis, work still to do")}</label>
        <p class="note">Done items stay as they are.</p></div>`;

    // Terms and fees
    const pub = i.asset_class === "public_equity" || i.type === "public";
    const fundingLine = check ? `${esc(k(check))} check, ${esc(Fmt.pct(i.funded_pct, 0))} funded at close (${esc(k(funded))} funded / ${esc(k(check - funded))} unfunded)` : "—";
    const dlRow = (t, v) => (blank(v) ? "" : `<div class="dl-row"><dt>${esc(t)}</dt><dd>${v}</dd></div>`);
    const termsBody = `<dl class="dl">
        ${dlRow("Structure and terms", esc(i.terms_notes))}
        ${dlRow("Entry costs", esc(i.entry_costs))}
        ${dlRow("Funding", fundingLine)}
        ${!pub && !blank(i.commitment) ? dlRow("Commitment", esc(k(i.commitment))) : ""}
        ${!blank(i.price_or_mark) ? dlRow(pub ? "Price" : "Price per unit", esc(Fmt.number(i.price_or_mark, 2)) + (blank(i.quantity) ? "" : ` · ${esc(Fmt.number(i.quantity, 0))} ${pub ? "shares" : "units"}`)) : ""}
      </dl>`;
    const termsEdit = `${fld("Structure and terms", textarea("terms_notes", i.terms_notes, 2))}
        ${fld("Entry costs", textarea("entry_costs", i.entry_costs, 2))}
        <div class="terms">${fld("Price", input("price_or_mark", "num", i.price_or_mark))}${fld("Quantity", input("quantity", "num", i.quantity))}${!pub ? fld("Commitment ($K)", input("commitment", "k", blank(i.commitment) ? "" : +(i.commitment / 1000).toFixed(3))) : ""}</div>`;
    let action = "";
    if (i.status === "invested" && i.funding) {
      action = `<div class="primary-action funded"><span>Funded ${esc(i.funding.date)} · ${esc(k(i.funding.amount))} from ${esc(fundedFrom(i))}</span>
        <button type="button" class="link" data-view-holding="${esc(i.funding.holding_id)}">View in Portfolio</button></div>`;
    } else if (isProspective(i)) {
      action = p && p.at === "terms" ? pendingBlock(i) : `<div class="primary-action"><button type="button" class="btn btn-primary" data-mark-funded>Mark as funded</button></div>`;
    }

    // Signals: live price line for public tickers
    const tickers = Array.from(new Set((i.tickers || []).concat(pub && i.ticker_or_id ? [i.ticker_or_id] : []).map(t => String(t).toUpperCase())));
    const priceLines = tickers.map(t => priceLine(t, t === String(i.ticker_or_id || "").toUpperCase() ? i.price_or_mark : null, i.mark_date)).join("");

    return `
    <article class="idea-card" aria-labelledby="id-card-name">
      <header class="card-head" data-sec="profile">
        <div class="title-line">${title}${statusHeader(i, STATUSES, L.status)}${closeBtn}</div>
        ${chips}
        ${p && p.at !== "terms" ? pendingBlock(i) : ""}
      </header>
      ${section("stats", "Key figures", { body: statsBody, edit: statsEdit, cls: "sec-stats" })}
      ${section("thesis", "Thesis", { body: para(i.thesis), edit: textarea("thesis", i.thesis, 3), empty: "Add a thesis" })}
      ${section("key_notes", "Key notes", { body: bullets(i.key_notes), edit: lines("key_notes", i.key_notes), empty: "Add key notes" })}
      ${section("change_my_mind", "What would change my mind", { body: bullets(i.change_my_mind), edit: lines("change_my_mind", i.change_my_mind), empty: "Add what would change my mind" })}
      ${section("diligence", "Diligence to do", { body: dilBody, edit: dilEdit, empty: "Add diligence items", count: `${nOpen} open`, cls: "sec-diligence" })}
      ${section("terms", "Terms and fees", { body: termsBody + action, edit: termsEdit + action, empty: "Add terms" })}
      ${section("contacts", "Contacts", { body: bullets(i.contacts), edit: lines("contacts", i.contacts, 2, "Roles only, no names"), empty: "Add contacts (roles only)" })}
      ${signalsSection(i, priceLines)}
      ${logSection(i)}
    </article>`;
  }

  // ---------------- Theme card ----------------
  function themeCard(t) {
    const s = TM.stats(ctx.state, t);
    const editingProfile = ui.editing === "profile";
    const title = editingProfile
      ? `<label class="sr-only" for="id-card-name">Theme name</label><input type="text" id="id-card-name" class="title-input" data-f="name" data-kind="text" value="${esc(t.name)}">`
      : `<h2 class="card-title" id="id-card-name">${esc(t.name)}</h2>`;
    const descriptor = editingProfile
      ? `<div class="sec-actions"><button type="button" class="btn btn-primary" data-save-sec="profile">Save</button><button type="button" class="btn" data-cancel-sec>Cancel</button></div>`
      : `<div class="chips"><span class="chip-static">${esc(L.theme_status[t.status] || t.status)}</span><span class="chip-static">${s.count} linked ${s.count === 1 ? "investment" : "investments"}</span><span class="chip-static">${esc(k(s.check))} total check</span>${s.openDiligence ? `<span class="chip-static">${s.openDiligence} diligence open</span>` : ""}
          <button type="button" class="edit-link" data-edit-sec="profile" aria-label="Edit theme name">${PENCIL}<span>Edit</span></button></div>`;

    const vcBody = (t.value_chain || []).length
      ? `<div class="table-wrap"><table class="grid vc"><thead><tr><th class="col-name">Segment</th><th>Who captures the value</th></tr></thead><tbody>${t.value_chain.map(v => `<tr><td class="col-name">${esc(v.segment)}</td><td class="wrap">${esc(v.who_captures_value)}</td></tr>`).join("")}</tbody></table></div>` : "";
    const vcEdit = lines("value_chain", (t.value_chain || []).map(v => `${v.segment} | ${v.who_captures_value}`), 4, "Segment | who captures the value");

    const pub = (t.watch_public || []).map(tk => {
      const sig = (t.signals || []).filter(x => x.kind === "price" && x.ticker === tk).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
      return priceLine(tk, sig ? sig.price : null, sig ? sig.date : null) || `<li class="price-line"><span class="sig-date"></span><span class="sig-body"><b>${esc(tk)}</b> <span class="muted">no price yet</span></span></li>`;
    }).join("");
    const watchBody = pub || (t.watch_private || []).length
      ? `${pub ? `<h4>Public</h4><ul class="signals">${pub}</ul>` : ""}${(t.watch_private || []).length ? `<h4>Private</h4>${bullets(t.watch_private)}` : ""}` : "";
    const watchEdit = `<label class="fld"><span>Public tickers</span>${lines("watch_public", t.watch_public, 2, "Ticker")}</label><label class="fld"><span>Private names</span>${lines("watch_private", t.watch_private, 2, "Company or asset")}</label>`;

    const linked = TM.linked(ctx.state, t);
    const linkedBody = linked.length ? `<div class="table-wrap"><table class="grid mini"><thead><tr><th class="col-name">Investment</th><th>Status</th><th class="num">Check ($K)</th><th class="num">Liquidity score</th><th class="num">Open diligence</th></tr></thead>
        <tbody>${linked.map(i => `<tr class="idea-row" data-open-inv="${esc(i.id)}" tabindex="0">
          <td class="col-name">${esc(i.name)}</td><td>${esc(L.status[i.status] || i.status)}</td><td class="num">${esc(Fmt.thousands(i.check_size))}</td>
          <td class="num">${esc(Metrics.liquidityScore(i).toFixed(0))}</td><td class="num">${openDiligence(i)}</td></tr>`).join("")}</tbody></table></div>` : "";
    const linkedEdit = `<p class="note">An investment belongs to one theme; ticking it here moves it.</p><div class="picks" role="group" aria-label="Linked investments">${ctx.state.investments.map(i => {
        const other = i.theme_id && i.theme_id !== t.id ? themeName(i.theme_id) : "";
        return `<label class="pick"><input type="checkbox" data-link-inv="${esc(i.id)}"${i.theme_id === t.id ? " checked" : ""}> ${esc(i.name)}${other ? ` <span class="muted">(now in ${esc(other)})</span>` : ""}</label>`;
      }).join("")}</div>`;

    return `
    <article class="idea-card" aria-labelledby="id-card-name">
      <header class="card-head" data-sec="profile">
        <div class="title-line">${title}${statusHeader(t, THEME_STATUSES, L.theme_status)}${closeBtn}</div>
        ${descriptor}
        ${pendingBlock(t)}
      </header>
      ${section("thesis", "Thesis", { body: para(t.thesis), edit: textarea("thesis", t.thesis, 3), empty: "Add a thesis" })}
      ${section("why_now", "Why now", { body: para(t.why_now), edit: textarea("why_now", t.why_now, 2), empty: "Add why now" })}
      ${section("value_chain", "Where the value lands", { body: vcBody, edit: vcEdit, empty: "Add the value chain" })}
      ${section("key_notes", "Key notes", { body: bullets(t.key_notes), edit: lines("key_notes", t.key_notes), empty: "Add key notes" })}
      ${section("change_my_mind", "What would change my mind", { body: bullets(t.change_my_mind), edit: lines("change_my_mind", t.change_my_mind), empty: "Add what would change my mind" })}
      ${section("watchlist", "Watchlist", { body: watchBody, edit: watchEdit, empty: "Add tickers or private names to watch" })}
      ${section("linked", "Linked investments", { body: linkedBody, edit: linkedEdit, empty: "Link investments", count: linked.length, saveLabel: "Done", editText: "Change" })}
      ${section("contacts", "Contacts", { body: bullets(t.contacts), edit: lines("contacts", t.contacts, 2, "Roles only, no names"), empty: "Add contacts (roles only)" })}
      ${signalsSection(t, "")}
      ${logSection(t)}
    </article>`;
  }

  function noticeHtml() {
    const n = ui.notice;
    if (!n) return "";
    return `<div class="notice" role="status"><span>${esc(n.text)}</span>${n.holding_id ? ` <button type="button" class="link" data-view-holding="${esc(n.holding_id)}">View in Portfolio</button>` : ""}<button type="button" class="close-btn close-sm" data-notice-close aria-label="Dismiss">×</button></div>`;
  }

  function renderCard() {
    const cur = current();
    const thBox = document.getElementById("th-card"), invBox = document.getElementById("id-card");
    thBox.innerHTML = cur && isTheme() ? themeCard(cur) : "";
    invBox.innerHTML = noticeHtml() + (cur && !isTheme() ? investmentCard(cur)
      : `<p class="placeholder">Select an investment in a table above to open its one-pager.</p>`);
  }

  function renderAll() {
    renderThemeGrid();
    renderFilters();
    renderTables();
    renderCard();
  }

  // ---------------- Saving a section ----------------
  function saveSection(key) {
    const i = current();
    if (!i) return;
    const el = document.querySelector(`#sec-opportunities [data-sec="${key}"]`);
    if (!el) return;
    const v = readSection(el);
    if (v === undefined) return;
    if (key === "profile") {
      if (v.name) i.name = v.name;
      if (!isTheme()) {
        ["type", "asset_class", "security_type", "sector"].forEach(f => { if (f in v) i[f] = v[f] || (f === "sector" ? "" : i[f]); });
        if ("theme_id" in v) TM.setTheme(ctx.state, i.id, v.theme_id || null);
      }
    } else if (key === "stats") {
      Object.assign(i, v);
    } else if (key === "diligence") {
      i.diligence_documents = mergeItems(i.diligence_documents, v.diligence_documents || [], i.id + "-dd");
      i.diligence_other = mergeItems(i.diligence_other, v.diligence_other || [], i.id + "-do");
    } else if (key === "value_chain") {
      i.value_chain = (v.value_chain || []).map(line => {
        const parts = line.split("|");
        return { segment: parts[0].trim(), who_captures_value: parts.slice(1).join("|").trim() };
      }).filter(x => x.segment);
    } else if (key === "watchlist") {
      i.watch_public = (v.watch_public || []).map(x => x.toUpperCase());
      i.watch_private = v.watch_private || [];
    } else if (key === "linked") {
      // Checkbox changes are applied as they happen; Done just closes the section.
    } else if (key === "signals") {
      const text = (v.text || "").trim();
      if (!text) { el.querySelector('[data-f="text"]').focus(); return; }
      i.signals = i.signals || [];
      i.signals.push({ id: newId(i.id + "-s"), kind: "note", date: v.date || today(), text });
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

  // ---------------- Status changes and funding ----------------
  function openPending(i, to, at) {
    if (to === i.status) { ui.pending = null; return renderCard(); }
    ui.pending = { id: i.id, from: i.status, to, reason: to === "invested" && i.status !== "invested" ? "Marked as funded" : "", at: at || "head",
                   fund: { date: today(), amount: +(root.InvestModel.defaultAmount(i) / 1000).toFixed(3), source: "cash" } };
    ui.editing = null;
    renderCard();
    const first = document.getElementById(to === "invested" && i.status !== "invested" ? "id-fund-date" : "id-reason");
    if (first) { first.focus(); first.scrollIntoView({ block: "nearest" }); }
  }

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
      ui.notice = { text: `${i.name} funded: ${k(i.funding.amount)} from ${fundedFrom(i)}.`, holding_id: i.funding.holding_id };
    } else if (!isTheme() && p.from === "invested" && p.to !== "invested" && i.funding) {
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

  // Opening a row or tile that is already open closes it (toggle).
  function select(kind, id, toggle) {
    const same = ui.sel && ui.sel.kind === kind && ui.sel.id === id;
    if (same && toggle) return closeCard();
    if (!same) { ui.pending = null; ui.editing = null; ui.notice = null; }
    ui.sel = { kind, id };
    const panelId = kind === "theme" ? "tab-themes" : "tab-ideas";
    if (document.getElementById(panelId).hidden && root.App) root.App.showTab(kind === "theme" ? "opportunities/themes" : "opportunities/ideas");
    else ctx.onChange(false);
    const box = document.getElementById(kind === "theme" ? "th-card" : "id-card");
    if (box && box.scrollIntoView) box.scrollIntoView({ block: "start" });
  }

  // Close the open card (×, Esc, or re-clicking its row) and return to the row or tile that opened it.
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
      const openTheme = t.closest("[data-open-theme]");
      if (openTheme) return select("theme", openTheme.dataset.openTheme);

      const i = current();
      if (!i) return;
      const ed = t.closest("[data-edit-sec]");
      if (ed) return startEdit(ed.dataset.editSec);
      const sv = t.closest("[data-save-sec]");
      if (sv) return saveSection(sv.dataset.saveSec);
      if (t.closest("[data-cancel-sec]")) { ui.editing = null; return renderCard(); }
      if (t.closest("[data-mark-funded]")) return openPending(i, "invested", "terms");
      if (t.closest("[data-status-save]")) return saveStatus();
      if (t.closest("[data-status-cancel]")) { ui.pending = null; return renderCard(); }
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
      if (el.matches("[data-status-select]")) return openPending(i, el.value, "head");
      if (el.matches("[data-dil]")) {
        const [listKey, id] = el.dataset.dil.split(":");
        const d = (i[listKey] || []).find(x => x.id === id);
        if (d) { d.done = el.checked ? today() : null; commit(); }
        return;
      }
      if (el.matches("[data-link-inv]")) { TM.setTheme(ctx.state, el.dataset.linkInv, el.checked ? i.id : null); save(); renderThemeGrid(); renderTables(); return; }
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

  // "Does this change the thesis?" One short AI read stored under the note. Fails silently.
  async function checkThesis(i, signalId) {
    const s = (i.signals || []).find(x => x.id === signalId);
    if (!s) return;
    ui.assessing = s.id;
    renderCard();
    const res = await root.Api.assess({ thesis: i.thesis || "", key_notes: i.key_notes || [], change_my_mind: i.change_my_mind || [], note: s.text });
    ui.assessing = null;
    if (res && res.ok && res.line) {
      s.ai = { line: res.line, effect: res.effect, date: today() };
      save();
    }
    ctx.onChange(false);
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
