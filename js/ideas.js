// Ideas tab: filterable pipeline table and an editable idea card.
(function (root) {
  "use strict";

  const Fmt = root.Fmt, Metrics = root.Metrics;
  const L = Fmt.LABELS;
  const esc = Fmt.esc;
  const STATUSES = Object.keys(L.status);
  const TYPES = Object.keys(L.type);
  const CYCLE = { intact: "at_risk", at_risk: "broken", broken: "intact" };
  const CLASSES = Object.keys(L.asset_class);

  const COLS = [
    { key: "name", label: "Name", cls: "col-name" },
    { key: "type", label: "Type", show: i => L.type[i.type] || i.type },
    { key: "status", label: "Status", show: i => L.status[i.status] || i.status },
    { key: "score", label: "Liquidity score", num: true, value: i => Metrics.liquidityScore(i), show: i => Metrics.liquidityScore(i).toFixed(0) },
    { key: "check_size", label: "Check size ($K)", num: true, show: i => Fmt.thousands(i.check_size) },
    { key: "funded_pct", label: "Funded %", num: true, show: i => Fmt.pct(i.funded_pct, 0) },
    { key: "hold_months", label: "Hold (months)", num: true, show: i => (i.hold_months ?? "") + "" },
    { key: "target_return", label: "Target return" },
    { key: "next_step", label: "Next step" },
    { key: "next_step_date", label: "Next step date" },
    { key: "contact", label: "Contact", value: i => (i.contacts || []).join("; ") },
    { key: "asset_class", label: "Asset class", show: i => L.asset_class[i.asset_class] || i.asset_class },
    { key: "security_type", label: "Security type", show: i => L.security_type[i.security_type] || i.security_type },
    { key: "sector", label: "Sector" },
    { key: "price_or_mark", label: "Price", num: true, show: i => Fmt.number(i.price_or_mark, 2) },
    { key: "quantity", label: "Quantity", num: true, show: i => Fmt.number(i.quantity, 0) }
  ];

  const ui = { sort: { key: null, dir: 1 }, status: new Set(), type: new Set(), selected: null,
               pending: null, bound: false };
  let ctx = null; // { state, onChange }

  const today = () => Fmt.today();
  const newId = p => p + "-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const idea = () => ctx.state.ideas.find(i => i.id === ui.selected) || null;
  const blank = v => v === null || v === undefined || v === "";
  const colValue = (c, i) => (c.value ? c.value(i) : i[c.key]);
  const colText = (c, i) => (c.show ? c.show(i) : blank(colValue(c, i)) ? "" : String(colValue(c, i)));
  const r1 = n => String(Math.round(n * 10) / 10);

  function scoreBuild(i) {
    const s = Metrics.liquidityScoreParts(i);
    return s.isPublic ? "Public = 100" : `${s.parts.map(r1).join(" + ")} = ${r1(s.total)}`;
  }

  function save() { root.Store.save(ctx.state); }

  // ---------------- Filters and table ----------------
  function renderFilters() {
    const chips = (group, keys, set, labels) => keys.map(k => {
      const n = ctx.state.ideas.filter(i => i[group] === k).length;
      return `<button type="button" class="chip" data-chip="${group}" data-value="${esc(k)}" aria-pressed="${set.has(k)}">${esc(labels[k])} <span class="chip-n">${n}</span></button>`;
    }).join("");
    const any = ui.status.size || ui.type.size;
    document.getElementById("id-filters").innerHTML = `
      <div class="chip-row" role="group" aria-label="Filter by status"><span class="chip-label">Status</span>${chips("status", STATUSES, ui.status, L.status)}</div>
      <div class="chip-row" role="group" aria-label="Filter by type"><span class="chip-label">Type</span>${chips("type", TYPES, ui.type, L.type)}
        ${any ? `<button type="button" class="link" data-chip-clear>Clear filters</button>` : ""}</div>`;
  }

  function renderTable() {
    let rows = ctx.state.ideas.filter(i => (!ui.status.size || ui.status.has(i.status)) && (!ui.type.size || ui.type.has(i.type)));
    const sc = COLS.find(c => c.key === ui.sort.key);
    if (sc) {
      const v = i => {
        const x = colValue(sc, i);
        if (sc.num) return blank(x) ? -Infinity : Number(x);
        return String(colText(sc, i)).toLowerCase();
      };
      rows = rows.slice().sort((a, b) => (v(a) > v(b) ? 1 : v(a) < v(b) ? -1 : 0) * ui.sort.dir);
    }
    const head = COLS.map(c => {
      const active = ui.sort.key === c.key;
      const aria = active ? (ui.sort.dir > 0 ? "ascending" : "descending") : "none";
      return `<th class="${c.num ? "num " : ""}${c.cls || ""}" aria-sort="${aria}"><button type="button" class="sort" data-sort="${c.key}">${esc(c.label)}${active ? (ui.sort.dir > 0 ? " ▲" : " ▼") : ""}</button></th>`;
    }).join("");
    const body = rows.map(i => `<tr class="idea-row${i.id === ui.selected ? " selected" : ""}" data-idea="${esc(i.id)}" tabindex="0" aria-selected="${i.id === ui.selected}">` +
      COLS.map(c => `<td class="${c.num ? "num " : ""}${c.cls || ""}">${esc(colText(c, i))}</td>`).join("") + "</tr>").join("");
    const empty = rows.length ? "" : `<tr><td class="col-name" colspan="${COLS.length}">No ideas match these filters.</td></tr>`;
    document.getElementById("id-table").innerHTML = `<thead><tr>${head}</tr></thead><tbody>${body}${empty}</tbody>`;
  }

  // ---------------- Card ----------------
  const opt = (value, label, current) => `<option value="${esc(value)}"${value === current ? " selected" : ""}>${esc(label)}</option>`;
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

  function renderCard() {
    const box = document.getElementById("id-card");
    const i = idea();
    if (!i) {
      box.innerHTML = `<p class="placeholder">Select an idea in the table to open its card.</p>`;
      return;
    }
    const p = ui.pending && ui.pending.id === i.id ? ui.pending : null;
    const shownStatus = p ? p.to : i.status;
    const funded = (Number(i.check_size) || 0) * (Number(i.funded_pct) || 0);
    const assumeName = id => { const a = (i.assumptions || []).find(x => x.id === id); return a ? a.text : null; };

    const assumptions = (i.assumptions || []).map(a => `<li class="assume">
        <button type="button" class="pill pill-${a.status}" data-assume-cycle="${esc(a.id)}" title="Click to change: intact, at risk, broken">${esc(L.assumption[a.status])}</button>
        <input type="text" class="list-input" data-assume-text="${esc(a.id)}" value="${esc(a.text)}" aria-label="Assumption text">
        <span class="muted nowrap">Changed ${esc(a.changed || "")}</span>
        <button type="button" class="link danger" data-assume-del="${esc(a.id)}">Delete</button></li>`).join("");

    const signals = (i.signals || []).map((s, n) => ({ s, n }))
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

    const log = (i.decision_log || []).map((d, n) => ({ d, n }))
      .sort((a, b) => (a.d.date < b.d.date ? 1 : a.d.date > b.d.date ? -1 : b.n - a.n))
      .map(({ d }) => `<tr><td>${esc(d.date)}</td><td>${esc(d.from ? L.status[d.from] || d.from : "(new)")}</td>
        <td>${esc(L.status[d.to] || d.to)}</td><td class="wrap">${esc(d.reason)}</td></tr>`).join("");

    box.innerHTML = `
    <article class="idea-card" aria-labelledby="id-card-name">
      <header class="card-head">
        <div class="card-title">
          <label class="sr-only" for="id-card-name">Idea name</label>
          <input type="text" id="id-card-name" class="title-input" data-field="name" data-kind="text" value="${esc(i.name)}">
          <div class="head-fields">
            <label class="fld"><span>Type</span><select data-field="type" data-kind="text">${TYPES.map(t => opt(t, L.type[t], i.type)).join("")}</select></label>
            <label class="fld"><span>Status</span><select data-status-select>${STATUSES.map(s => opt(s, L.status[s], shownStatus)).join("")}</select></label>
            <div class="fld score"><span>Liquidity score</span><b id="id-score">${esc(Metrics.liquidityScore(i).toFixed(0))}</b> <span class="muted" id="id-score-build">${esc(scoreBuild(i))}</span></div>
          </div>
          ${p ? `<div class="reason" role="group" aria-label="Reason for status change">
            <label for="id-reason">Reason for moving from ${esc(L.status[p.from])} to ${esc(L.status[p.to])} (required)</label>
            <div class="add-line"><input type="text" id="id-reason" value="${esc(p.reason || "")}" placeholder="One line">
            <button type="button" class="btn btn-primary" data-status-save>Save status</button>
            <button type="button" class="btn" data-status-cancel>Cancel</button></div>
            ${p.error ? `<p class="breach" role="alert">${esc(p.error)}</p>` : ""}</div>` : ""}
          <div class="head-fields">
            ${field(i, "next_step", "text", "Next step", ' class="wide"')}
            ${field(i, "next_step_date", "date", "Next step date")}
          </div>
        </div>
      </header>

      <section class="card-sec"><h3>Thesis</h3>
        <textarea data-field="thesis" data-kind="text" rows="3" aria-label="Thesis">${esc(i.thesis || "")}</textarea></section>

      <section class="card-sec"><h3>Assumptions</h3>
        <p class="note">Click a status to cycle intact, at risk, broken.</p>
        <ul class="edit-list">${assumptions || `<li class="muted">None yet.</li>`}</ul>
        <div class="add-line"><input type="text" id="id-new-assume" placeholder="New assumption" aria-label="New assumption">
          <button type="button" class="btn" data-assume-add>Add</button></div></section>

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

      <section class="card-sec"><h3>Signals</h3>
        <ul class="signals">${signals || `<li class="muted">No signals yet.</li>`}</ul>
        <div class="note-form" role="group" aria-label="Add note">
          <label class="fld"><span>Date</span><input type="date" id="id-note-date" value="${esc(today())}"></label>
          <label class="fld grow"><span>Note</span><input type="text" id="id-note-text" placeholder="What happened"></label>
          <label class="fld"><span>Assumption</span><select id="id-note-assume"><option value="">None</option>
            ${(i.assumptions || []).map(a => `<option value="${esc(a.id)}">${esc(a.text.length > 50 ? a.text.slice(0, 50) + "…" : a.text)}</option>`).join("")}</select></label>
          <button type="button" class="btn" data-note-add>Add note</button>
        </div></section>

      <section class="card-sec"><h3>Source-document flags</h3>${editableList(i, "doc_flags", "Document flag", { label: "Doc check", readOnly: true })}</section>

      <section class="card-sec"><h3>Decision log</h3>
        <div class="table-wrap"><table class="grid log"><thead><tr><th>Date</th><th>From</th><th>To</th><th>Reason</th></tr></thead>
        <tbody>${log || `<tr><td colspan="4" class="muted">No entries yet.</td></tr>`}</tbody></table></div></section>
    </article>`;
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

  // Field edits save and refresh the table and score without rebuilding the card, so focus stays put.
  function onFieldChange(el) {
    const i = idea();
    if (!i) return;
    const v = parseField(el.dataset.kind, el.value);
    if (v === undefined) { el.value = blank(i[el.dataset.field]) ? "" : i[el.dataset.field]; return; }
    if (el.dataset.field === "name" && !v) { el.value = i.name; return; }
    i[el.dataset.field] = v;
    save();
    renderFilters();
    renderTable();
    const score = document.getElementById("id-score");
    if (score) {
      score.textContent = Metrics.liquidityScore(i).toFixed(0);
      document.getElementById("id-score-build").textContent = scoreBuild(i);
    }
    if (["check_size", "funded_pct", "asset_class", "type"].includes(el.dataset.field)) renderCard();
  }

  function commit() { save(); ctx.onChange(false); }

  function saveStatus() {
    const i = idea(), p = ui.pending;
    if (!i || !p) return;
    const reason = (document.getElementById("id-reason").value || "").trim();
    if (!reason) {
      p.error = "Enter a one-line reason to save the status change.";
      renderCard();
      document.getElementById("id-reason").focus();
      return;
    }
    i.decision_log = i.decision_log || [];
    i.decision_log.push({ date: today(), from: p.from, to: p.to, reason });
    i.status = p.to;
    ui.pending = null;
    commit();
  }

  function bind() {
    if (ui.bound) return;
    ui.bound = true;
    const panel = document.getElementById("tab-ideas");

    panel.addEventListener("click", e => {
      const t = e.target;
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
      const row = t.closest("tr[data-idea]");
      if (row) return selectIdea(row.dataset.idea);

      const i = idea();
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
        const key = ldel.dataset.listDel;
        i[key].splice(Number(ldel.dataset.index), 1);
        return commit();
      }
      const ladd = t.closest("[data-list-add]");
      if (ladd) {
        const key = ladd.dataset.listAdd;
        const inp = panel.querySelector(`[data-list-new="${key}"]`);
        const text = inp.value.trim();
        if (!text) return inp.focus();
        i[key] = i[key] || [];
        i[key].push(text);
        return commit();
      }

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
      const i = idea();
      if (!i) return;
      if (el.matches("[data-status-select]")) {
        ui.pending = el.value === i.status ? null : { id: i.id, from: i.status, to: el.value, reason: "" };
        ctx.onChange(false);
        const r = document.getElementById("id-reason");
        if (r) r.focus();
        return;
      }
      if (el.matches("[data-field]")) return onFieldChange(el);
      if (el.matches("[data-assume-text]")) {
        const a = i.assumptions.find(x => x.id === el.dataset.assumeText);
        const text = el.value.trim();
        if (a && text && text !== a.text) { a.text = text; a.changed = today(); save(); }
        else if (a) el.value = a.text;
        return;
      }
      if (el.matches("[data-list]")) {
        const text = el.value.trim();
        if (text) { i[el.dataset.list][Number(el.dataset.index)] = text; save(); }
        else el.value = i[el.dataset.list][Number(el.dataset.index)];
      }
    });

    panel.addEventListener("keydown", e => {
      const el = e.target;
      if (e.key === "Enter" && el.matches && el.matches("tr[data-idea]")) { e.preventDefault(); return selectIdea(el.dataset.idea); }
      if (e.key !== "Enter" || !el.matches) return;
      if (el.id === "id-reason") { e.preventDefault(); if (ui.pending) ui.pending.reason = el.value; return saveStatus(); }
      if (el.id === "id-new-assume") { e.preventDefault(); return panel.querySelector("[data-assume-add]").click(); }
      if (el.id === "id-note-text") { e.preventDefault(); return panel.querySelector("[data-note-add]").click(); }
      if (el.matches("[data-list-new]")) { e.preventDefault(); return panel.querySelector(`[data-list-add="${el.dataset.listNew}"]`).click(); }
      if (el.matches("input[data-field], input[data-list], input[data-assume-text]")) { e.preventDefault(); el.blur(); }
    });

    panel.addEventListener("input", e => {
      if (e.target.id === "id-reason" && ui.pending) ui.pending.reason = e.target.value;
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
    if (ctx.state.ideas.includes(i)) ctx.onChange(false);
  }

  function selectIdea(id) {
    if (ui.selected !== id) ui.pending = null;
    ui.selected = id;
    ctx.onChange(false);
    const card = document.getElementById("id-card");
    if (card && card.scrollIntoView) card.scrollIntoView({ block: "start" });
  }

  function render(state, onChange) {
    if (ctx && ctx.state !== state) ui.pending = null; // state replaced (reset): drop any unsaved status change
    ctx = { state, onChange };
    bind();
    if (ui.selected && !state.ideas.some(i => i.id === ui.selected)) { ui.selected = null; ui.pending = null; }
    root.Intake.render(state, newIdea => {
      ctx.state.ideas.push(newIdea);
      save();
      selectIdea(newIdea.id);
    });
    renderFilters();
    renderTable();
    renderCard();
  }

  root.Ideas = { render };
})(window);
