// "New investment from document": upload a PDF or paste text, extract fields with /api/extract,
// review every field, then save as a new investment. Files are read in the browser and sent once; never stored.
(function (root) {
  "use strict";

  const Fmt = root.Fmt, L = Fmt.LABELS, esc = Fmt.esc;
  const MAX_PDF_BYTES = 3 * 1024 * 1024;
  const TOO_BIG = "Over 3 MB. Paste the text instead.";
  const UPLOAD_TIMEOUT = 60000, SAMPLE_TIMEOUT = 20000;

  const pick = (labels, keys) => Object.fromEntries((keys || Object.keys(labels)).map(k => [k, labels[k]]));
  const FIELDS = [
    { key: "name", label: "Name", kind: "text" },
    { key: "type", label: "Type", kind: "enum", options: L.type },
    { key: "asset_class", label: "Asset class", kind: "enum", options: pick(L.asset_class, Object.keys(L.asset_class).filter(k => k !== "cash")) },
    { key: "security_type", label: "Security type", kind: "enum", options: pick(L.security_type, Object.keys(L.security_type).filter(k => k !== "cash" && k !== "t_bill")) },
    { key: "sector", label: "Sector", kind: "text" },
    { key: "thesis", label: "Thesis", kind: "longtext" },
    { key: "check_size", label: "Check size or minimum", kind: "money" },
    { key: "funded_pct", label: "Funded %", kind: "pct" },
    { key: "hold_months", label: "Hold (months)", kind: "int" },
    { key: "months_to_50pct_back", label: "Months to 50% back", kind: "int" },
    { key: "interim_cash", label: "Interim cash", kind: "bool" },
    { key: "target_return", label: "Target return", kind: "text" },
    { key: "entry_costs", label: "Entry costs", kind: "longtext" },
    { key: "terms_notes", label: "Structure and terms", kind: "longtext" },
    { key: "key_notes", label: "Key notes", kind: "list" },
    { key: "change_my_mind", label: "What would change my mind", kind: "list" },
    { key: "diligence_documents", label: "Document asks and checks", kind: "flags" },
    { key: "diligence_other", label: "Other diligence", kind: "list" },
    { key: "contacts", label: "Contacts (roles only)", kind: "list" },
    { key: "next_step", label: "Next step", kind: "text" }
  ];

  const ui = { tab: "pdf", phase: "idle", message: "", result: null, review: {}, editing: null, bound: false, fileName: "" };
  let ctx = null; // { state, onSaved }

  const isNull = v => v === null || v === undefined || v === "" || (Array.isArray(v) && !v.length);

  // Normalise an API (or cached) response: unknown enum values and bad types become null.
  function normalise(res) {
    const fields = {};
    FIELDS.filter(f => f.kind !== "flags").forEach(f => {
      const raw = (res.fields || {})[f.key] || {};
      let v = raw.value;
      if (f.kind === "enum" && !(v in f.options)) v = null;
      if (["money", "pct", "int"].includes(f.kind) && (typeof v !== "number" || !isFinite(v))) v = null;
      if (f.kind === "pct" && v !== null && v > 1) v = v / 100;
      if (f.kind === "bool" && typeof v !== "boolean") v = null;
      if (f.kind === "list") v = Array.isArray(v) ? v.map(String).map(s => s.trim()).filter(Boolean) : null;
      if ((f.kind === "text" || f.kind === "longtext") && typeof v !== "string") v = null;
      fields[f.key] = { value: isNull(v) ? null : v, page: Number.isInteger(raw.page) ? raw.page : null,
                        confidence: ["high", "medium", "low"].includes(raw.confidence) ? raw.confidence : "low" };
    });
    const flags = (res.diligence_documents || res.doc_flags || []).filter(f => f && f.text).map(f => ({ text: String(f.text), page: Number.isInteger(f.page) ? f.page : null }));
    const pages = Array.from(new Set(flags.map(f => f.page).filter(p => p !== null)));
    fields.diligence_documents = { value: flags.length ? flags : null, page: pages.length ? pages.join(", ") : null,
                                   confidence: flags.length ? "high" : "low" };
    return { fields, source: res.source === "live" ? "live" : "cached" };
  }

  // ---------------- Rendering ----------------
  function display(f, v) {
    if (isNull(v)) return `<span class="muted">Not found in the document</span>`;
    switch (f.kind) {
      case "enum": return esc(f.options[v] || v);
      case "money": return "$" + esc(Fmt.number(v, 0));
      case "pct": return esc(Fmt.pct(v, 0));
      case "bool": return v ? "Yes" : "No";
      case "list": return `<ul class="rv-list">${v.map(x => `<li>${esc(x)}</li>`).join("")}</ul>`;
      case "flags": return `<ul class="rv-list">${v.map(x => `<li>${esc(x.text)}${x.page ? ` <span class="muted">(p. ${x.page})</span>` : ""}</li>`).join("")}</ul>`;
      default: return esc(v);
    }
  }

  function editor(f, v) {
    const id = "rv-edit-" + f.key;
    switch (f.kind) {
      case "enum": return `<select id="${id}">${Object.keys(f.options).map(k => `<option value="${esc(k)}"${k === v ? " selected" : ""}>${esc(f.options[k])}</option>`).join("")}</select>`;
      case "bool": return `<select id="${id}"><option value="true"${v === true ? " selected" : ""}>Yes</option><option value="false"${v === false ? " selected" : ""}>No</option></select>`;
      case "money": return `<input id="${id}" inputmode="decimal" value="${isNull(v) ? "" : esc(v / 1000)}" aria-label="${esc(f.label)} in $K"> <span class="muted">$K</span>`;
      case "pct": return `<input id="${id}" inputmode="decimal" value="${isNull(v) ? "" : esc(+(v * 100).toFixed(2))}" aria-label="${esc(f.label)}"> <span class="muted">%</span>`;
      case "int": return `<input id="${id}" inputmode="numeric" value="${isNull(v) ? "" : esc(v)}" aria-label="${esc(f.label)}">`;
      case "list": return `<textarea id="${id}" rows="4" aria-label="${esc(f.label)}, one per line">${esc((v || []).join("\n"))}</textarea><div class="muted">One per line.</div>`;
      case "flags": return `<textarea id="${id}" rows="3" aria-label="Document asks and checks, one per line">${esc((v || []).map(x => x.text + (x.page ? ` (p. ${x.page})` : "")).join("\n"))}</textarea><div class="muted">One per line.</div>`;
      case "longtext": return `<textarea id="${id}" rows="3" aria-label="${esc(f.label)}">${esc(v || "")}</textarea>`;
      default: return `<input id="${id}" value="${esc(v || "")}" aria-label="${esc(f.label)}">`;
    }
  }

  function readEditor(f) {
    const el = document.getElementById("rv-edit-" + f.key);
    const raw = el.value.trim();
    if (f.kind === "enum") return raw;
    if (f.kind === "bool") return raw === "true";
    if (f.kind === "list") return raw.split("\n").map(s => s.trim()).filter(Boolean);
    if (f.kind === "flags") return raw.split("\n").map(s => s.trim()).filter(Boolean).map(t => ({ text: t, page: null }));
    if (["money", "pct", "int"].includes(f.kind)) {
      if (raw === "") return null;
      const n = Number(raw.replace(/[$,%\s]/g, ""));
      if (!isFinite(n)) return undefined;
      return f.kind === "money" ? n * 1000 : f.kind === "pct" ? n / 100 : Math.round(n);
    }
    return raw || null;
  }

  function pending() {
    return FIELDS.filter(f => !isNull(ui.result.fields[f.key].value) && !["accepted", "edited"].includes(ui.review[f.key]));
  }

  function renderReview() {
    const r = ui.result;
    const left = pending();
    const total = FIELDS.filter(f => !isNull(r.fields[f.key].value)).length;
    const rows = FIELDS.map(f => {
      const fld = r.fields[f.key];
      const st = ui.review[f.key];
      const attn = isNull(fld.value) || fld.confidence === "low";
      const editing = ui.editing === f.key;
      const actions = editing
        ? `<button type="button" class="btn btn-primary" data-rv-save="${f.key}">Save</button> <button type="button" class="btn" data-rv-cancel>Cancel</button>`
        : st === "accepted" || st === "edited"
          ? `<span class="rv-done">${st === "accepted" ? "Accepted" : "Edited"}</span> <button type="button" class="link" data-rv-undo="${f.key}">Undo</button>`
          : `${isNull(fld.value) ? "" : `<button type="button" class="btn" data-rv-accept="${f.key}">Accept</button> `}<button type="button" class="btn" data-rv-edit="${f.key}">Edit</button>`;
      return `<tr class="${attn && st !== "edited" ? "attn" : ""}${st ? " rv-" + st : ""}">
        <th scope="row" class="col-name">${esc(f.label)}</th>
        <td class="rv-value">${editing ? editor(f, fld.value) : display(f, fld.value)}</td>
        <td class="num">${fld.page === null ? "" : esc(fld.page)}</td>
        <td>${isNull(fld.value) && st !== "edited" ? `<span class="pill pill-null">None</span>` : `<span class="pill conf-${fld.confidence}">${esc(fld.confidence[0].toUpperCase() + fld.confidence.slice(1))}</span>`}</td>
        <td class="rv-actions">${actions}</td></tr>`;
    }).join("");
    return `<div class="rv-head">
        <div><b>Review extracted fields</b>${r.source === "cached" ? ` <span class="tag tag-cached">Cached example</span>` : ""}
          <div class="note">${ui.fileName ? esc(ui.fileName) + ". " : ""}Accept or edit every field that has a value. Highlighted rows are low confidence or not found.</div></div>
        <div class="rv-save"><span class="muted">${total - left.length} of ${total} reviewed</span>
          <button type="button" class="btn btn-primary" data-rv-commit${left.length || ui.editing ? " disabled" : ""}>Save as investment</button>
          <button type="button" class="btn" data-rv-discard>Discard</button></div>
      </div>
      <div class="table-wrap"><table class="grid review"><thead><tr><th class="col-name">Field</th><th>Value</th><th class="num">Page</th><th>Confidence</th><th>Review</th></tr></thead>
      <tbody>${rows}</tbody></table></div>`;
  }

  function render() {
    const box = document.getElementById("id-intake");
    if (!box) return;
    let body;
    if (ui.phase === "reading") {
      body = `<p class="reading" role="status">Reading document…</p>`;
    } else if (ui.phase === "review") {
      body = renderReview();
    } else {
      const localNote = root.Api.available ? "" : `<p class="note">Opened from disk: reading documents needs the hosted site. The sample still works, using a cached example.</p>`;
      body = `
        <div class="intake-tabs" role="tablist" aria-label="Document input">
          <button type="button" role="tab" data-intake-tab="pdf" aria-selected="${ui.tab === "pdf"}">Upload PDF</button>
          <button type="button" role="tab" data-intake-tab="text" aria-selected="${ui.tab === "text"}">Paste text</button>
        </div>
        ${ui.tab === "pdf"
          ? `<div class="dropzone" id="id-dropzone" tabindex="0" role="button" aria-label="Drop a PDF here or press Enter to choose a file">
               <b>Drop a PDF here</b> or click to choose a file. Max 3 MB.
               <input type="file" id="id-file" accept="application/pdf,.pdf" hidden></div>`
          : `<textarea id="id-paste" rows="6" placeholder="Paste the offering memo or term sheet text" aria-label="Document text"></textarea>
             <div class="add-line"><button type="button" class="btn btn-primary" data-intake-extract>Extract fields</button></div>`}
        <div class="intake-foot">
          <button type="button" class="btn" data-intake-sample>Try it with a sample</button>
          <a href="samples/sample-om.html" target="_blank" rel="noopener">View the sample memo</a>
          <span class="muted">Files are sent once for reading and never stored.</span>
        </div>
        ${ui.message ? `<p class="intake-msg" role="status">${esc(ui.message)}</p>` : ""}
        ${localNote}`;
    }
    box.innerHTML = `<details class="intake"${ui.phase !== "idle" || ui.open ? " open" : ""}>
        <summary>New investment from document</summary><div class="intake-body">${body}</div></details>`;
  }

  // ---------------- Actions ----------------
  function startReview(res, fileName) {
    ui.result = normalise(res);
    ui.review = {};
    ui.editing = null;
    ui.fileName = fileName || "";
    ui.phase = "review";
    ui.message = "";
    render();
  }

  function fail(message) {
    ui.phase = "idle";
    ui.open = true;
    ui.message = message;
    render();
  }

  async function extract(payload, fileName) {
    if (!root.Api.available) return fail("Reading documents needs the hosted site. On this local copy, try the sample.");
    ui.phase = "reading";
    render();
    const res = await root.Api.extract(payload, UPLOAD_TIMEOUT);
    if (res && res.ok) return startReview(res, fileName);
    fail((res && res.message) || "The document couldn't be read right now. Try again, or paste the text.");
  }

  function readPdf(file) {
    if (!file) return;
    if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") return fail("Choose a PDF, or paste the text instead.");
    if (file.size > MAX_PDF_BYTES) { ui.tab = "text"; return fail(TOO_BIG); }
    const reader = new FileReader();
    reader.onload = () => extract({ pdf_base64: String(reader.result).split(",")[1] || "" }, file.name);
    reader.onerror = () => fail("That file couldn't be opened. Paste the text instead.");
    reader.readAsDataURL(file);
  }

  async function fetchWithTimeout(url, ms) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    try { return await fetch(url, { signal: ctrl.signal }); } finally { clearTimeout(timer); }
  }

  // The sample memo's text, with "[Page N]" markers so the extractor can cite pages.
  async function sampleText() {
    const res = await fetchWithTimeout("samples/sample-om.html", 5000);
    const doc = new DOMParser().parseFromString(await res.text(), "text/html");
    return Array.from(doc.querySelectorAll("[data-page]"))
      .map(p => `[Page ${p.dataset.page}]\n${p.textContent.replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim()}`).join("\n\n");
  }

  async function cachedSample() {
    if (root.Api.available) {
      try {
        const res = await fetchWithTimeout("samples/sample-om-extracted.json", 5000);
        if (res.ok) return await res.json();
      } catch (e) { /* fall through to the bundled copy */ }
    }
    return root.SAMPLE_OM_EXTRACTED;
  }

  async function runSample() {
    ui.phase = "reading";
    render();
    const deadline = Date.now() + SAMPLE_TIMEOUT;
    let res = null;
    if (root.Api.available) {
      try {
        const text = await sampleText();
        res = await root.Api.extract({ text }, Math.max(1000, deadline - Date.now()));
      } catch (e) { res = null; }
    }
    if (res && res.ok) return startReview(res, "Sample offering memo (fictional)");
    const cached = await cachedSample();
    if (cached) return startReview(Object.assign({}, cached, { source: "cached" }), "Sample offering memo (fictional)");
    fail("The sample couldn't be loaded.");
  }

  function saveInvestment() {
    const v = k => ui.result.fields[k].value;
    const today = Fmt.today();
    const id = "i-doc-" + Date.now().toString(36);
    const assetClass = v("asset_class") || "direct";
    const type = v("type") || "private_equity";
    const isPublic = assetClass === "public_equity" || type === "public";
    const check = v("check_size");
    const funded = v("funded_pct") === null ? 1 : v("funded_pct");
    const inv = {
      id, asset_class: assetClass, name: v("name") || "Untitled investment", ticker_or_id: "",
      security_type: v("security_type") || "", sector: v("sector") || "",
      price_or_mark: null, quantity: null, market_value: null, cost: null,
      commitment: isPublic || check === null ? null : check,
      unfunded: check === null ? 0 : check * (1 - funded), call_schedule: null,
      liquidity_bucket: isPublic ? "liquid_now" : "3y_plus", liquidity_date: null, mark_source: null, mark_date: null,
      status: "watching", type, theme_id: null,
      thesis: v("thesis") || "",
      key_notes: v("key_notes") || [], change_my_mind: v("change_my_mind") || [], contacts: v("contacts") || [],
      diligence_documents: (v("diligence_documents") || []).map((f, n) => ({ id: `${id}-dd${n + 1}`, text: f.text + (f.page ? ` (p. ${f.page})` : ""), done: null })),
      diligence_other: (v("diligence_other") || []).map((text, n) => ({ id: `${id}-do${n + 1}`, text, done: null })),
      check_size: check, funded_pct: funded, hold_months: v("hold_months"), months_to_50pct_back: v("months_to_50pct_back"),
      interim_cash: v("interim_cash") === true,
      target_return: v("target_return") || "", entry_costs: v("entry_costs") || "", terms_notes: v("terms_notes") || "",
      next_step: v("next_step") || "", next_step_date: null,
      tickers: [], signals: [],
      decision_log: [{ date: today, from: null, to: "watching", reason: "Created from document, fields reviewed" }]
    };
    root.Migrate.investment(inv);
    ui.phase = "idle";
    ui.open = false;
    ui.result = null;
    ui.message = "";
    ctx.onSaved(inv);
  }

  function bind() {
    if (ui.bound) return;
    ui.bound = true;
    const panel = document.getElementById("tab-ideas");
    panel.addEventListener("click", e => {
      const t = e.target;
      if (!t.closest("#id-intake")) return;
      const tab = t.closest("[data-intake-tab]");
      if (tab) { ui.tab = tab.dataset.intakeTab; ui.message = ""; ui.open = true; return render(); }
      if (t.closest("#id-dropzone") && !t.matches("input")) return document.getElementById("id-file").click();
      if (t.closest("[data-intake-extract]")) {
        const text = document.getElementById("id-paste").value.trim();
        if (!text) return document.getElementById("id-paste").focus();
        return extract({ text }, "Pasted text");
      }
      if (t.closest("[data-intake-sample]")) return runSample();
      const f = k => FIELDS.find(x => x.key === k);
      const acc = t.closest("[data-rv-accept]");
      if (acc) { ui.review[acc.dataset.rvAccept] = "accepted"; return render(); }
      const ed = t.closest("[data-rv-edit]");
      if (ed) { ui.editing = ed.dataset.rvEdit; render(); const el = document.getElementById("rv-edit-" + ui.editing); if (el) el.focus(); return; }
      const sv = t.closest("[data-rv-save]");
      if (sv) {
        const fd = f(sv.dataset.rvSave);
        const val = readEditor(fd);
        if (val === undefined) return document.getElementById("rv-edit-" + fd.key).focus();
        ui.result.fields[fd.key].value = isNull(val) ? null : val;
        ui.review[fd.key] = isNull(val) ? undefined : "edited";
        ui.editing = null;
        return render();
      }
      if (t.closest("[data-rv-cancel]")) { ui.editing = null; return render(); }
      const undo = t.closest("[data-rv-undo]");
      if (undo) { delete ui.review[undo.dataset.rvUndo]; return render(); }
      if (t.closest("[data-rv-commit]")) { if (!pending().length && !ui.editing) saveInvestment(); return; }
      if (t.closest("[data-rv-discard]")) { ui.phase = "idle"; ui.result = null; ui.open = true; return render(); }
    });
    panel.addEventListener("change", e => {
      if (e.target.id === "id-file") readPdf(e.target.files[0]);
    });
    panel.addEventListener("keydown", e => {
      if (e.target.id === "id-dropzone" && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); document.getElementById("id-file").click(); }
    });
    panel.addEventListener("toggle", e => {
      if (e.target.matches && e.target.matches("details.intake")) ui.open = e.target.open;
    }, true);
    ["dragover", "dragenter"].forEach(type => panel.addEventListener(type, e => {
      const z = e.target.closest && e.target.closest("#id-dropzone");
      if (z) { e.preventDefault(); z.classList.add("over"); }
    }));
    panel.addEventListener("dragleave", e => {
      const z = e.target.closest && e.target.closest("#id-dropzone");
      if (z) z.classList.remove("over");
    });
    panel.addEventListener("drop", e => {
      const z = e.target.closest && e.target.closest("#id-dropzone");
      if (!z) return;
      e.preventDefault();
      z.classList.remove("over");
      readPdf(e.dataTransfer.files[0]);
    });
  }

  function renderIntake(state, onSaved) {
    ctx = { state, onSaved };
    bind();
    render();
  }

  root.Intake = { render: renderIntake };
})(window);
