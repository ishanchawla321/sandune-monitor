// Investment blotter (Portfolio > Investment blotter): the transaction list behind the book, plus an entry form.
// New entries post to the holding and to operating cash through Positions.post() and persist like other edits.
(function (root) {
  "use strict";

  const Fmt = root.Fmt, P = root.Positions, Metrics = root.Metrics;
  const L = Fmt.LABELS, esc = Fmt.esc;
  const PAGE = 25;

  const COLS = [
    { key: "date", label: "Date" },
    { key: "holding", label: "Holding", cls: "col-name" },
    { key: "type", label: "Type" },
    { key: "quantity", label: "Quantity", num: true },
    { key: "price", label: "Price", num: true },
    { key: "amount", label: "Amount ($)", num: true },
    { key: "cash", label: "Cash effect ($)", num: true },
    { key: "note", label: "Note", wrap: true }
  ];

  // Which holdings a transaction type makes sense for. Anything else falls back to every non-cash holding.
  const FITS = {
    buy: h => h.security_type !== "cash",
    sell: h => h.security_type !== "cash",
    dividend: h => h.asset_class === "public_equity" || h.security_type === "etf" || h.asset_class === "direct",
    coupon: h => h.security_type === "bond",
    interest: h => h.security_type === "cash" || h.asset_class === "private_credit" || h.security_type === "first_lien_loan" || h.security_type === "t_bill",
    capital_call: h => h.commitment !== null && h.commitment !== undefined && h.asset_class !== "private_credit" && h.security_type !== "first_lien_loan",
    loan_draw: h => h.asset_class === "private_credit" || h.security_type === "first_lien_loan",
    distribution: h => h.asset_class === "private_fund" || h.asset_class === "real_estate" || h.security_type === "etf" || h.asset_class === "direct",
    fee: () => true
  };

  const ui = { sort: { key: "date", dir: -1 }, types: new Set(), holding: "", limit: PAGE, bound: false,
               form: { type: "buy", holding_id: "", date: "", quantity: "", price: "", amount: "", note: "", error: "" } };
  let ctx = null;

  const holdingName = id => { const h = ctx.state.holdings.find(x => x.id === id); return h ? h.name : "(deleted holding)"; };
  const holdingOf = id => ctx.state.holdings.find(x => x.id === id);
  const perHundred = h => !!h && (h.security_type === "bond" || h.security_type === "t_bill");
  const unitType = h => !!h && Metrics.isPriced(h);

  function rows() {
    const pos = P.compute(ctx.state.holdings, ctx.state.transactions || [], ctx.state.as_of);
    const txs = (ctx.state.transactions || []).map(t => {
      const h = holdingOf(t.holding_id);
      const sale = t.type === "sell" && pos[t.holding_id] ? pos[t.holding_id].sales[t.id] : null;
      return Object.assign({}, t, { holding: holdingName(t.holding_id), amount: P.amountOf(t, h), cash: P.cashEffect(t, h), sale });
    });
    let list = txs.filter(t => (!ui.types.size || ui.types.has(t.type)) && (!ui.holding || t.holding_id === ui.holding));
    const k = ui.sort.key;
    const v = t => (["quantity", "price", "amount", "cash"].includes(k) ? (t[k] === null || t[k] === undefined ? -Infinity : Number(t[k]))
                    : k === "type" ? P.LABELS[t.type] || t.type : String(t[k] || "").toLowerCase());
    list.sort((a, b) => {
      const x = v(a), y = v(b);
      const c = x > y ? 1 : x < y ? -1 : (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
      return c * ui.sort.dir;
    });
    return { all: txs, list };
  }

  // ---------------- Entry form ----------------
  function candidates(type) {
    const fit = ctx.state.holdings.filter(FITS[type] || (() => true));
    return fit.length ? fit : ctx.state.holdings.filter(h => h.security_type !== "cash");
  }

  function renderForm() {
    const f = ui.form;
    if (!f.date) f.date = Fmt.today();
    const list = candidates(f.type);
    if (!list.some(h => h.id === f.holding_id)) f.holding_id = list.length ? list[0].id : "";
    const h = holdingOf(f.holding_id);
    const units = f.type === "buy" || f.type === "sell";
    const qLabel = perHundred(h) ? "Face ($)" : "Shares";
    const pLabel = perHundred(h) ? "Price (per 100)" : "Price ($)";
    const q = Number(String(f.quantity).replace(/[$,\s]/g, "")), p = Number(String(f.price).replace(/[$,\s]/g, ""));
    const computed = units && isFinite(q) && isFinite(p) && q > 0 && p > 0 ? (perHundred(h) ? q * p / 100 : q * p) : null;
    const opt = (v, label, cur) => `<option value="${esc(v)}"${v === cur ? " selected" : ""}>${esc(label)}</option>`;
    const help = {
      buy: units && h && !unitType(h) ? "Funds, directs and real estate have no unit price: enter the amount invested." : "Quantity and price; the amount is computed. Cash falls by the amount.",
      sell: "Quantity and price at which units were sold. Realized P&L uses the weighted average cost.",
      dividend: "Cash dividend received. Adds to income and to operating cash.",
      coupon: "Coupon received on a bond. Adds to income and to operating cash.",
      interest: "Interest received. Adds to income and to operating cash.",
      capital_call: "Amount called by the fund. Raises paid-in, lowers unfunded and operating cash.",
      loan_draw: "Amount drawn on a private-credit loan (initial or delayed draw). Raises the amount invested, lowers unfunded and operating cash.",
      distribution: "Cash distributed by a fund, ETF, co-invest or property. Adds to income and to operating cash.",
      fee: "Fee paid from operating cash. Does not change the position."
    }[f.type];
    const amountOnly = !units || (h && !unitType(h));
    document.getElementById("bl-form").innerHTML = `
      <form class="bl-form" id="bl-entry" autocomplete="off" aria-label="New blotter entry">
        <label class="fld"><span>Type</span><select data-bl="type">${P.TYPES.map(t => opt(t, P.LABELS[t], f.type)).join("")}</select></label>
        <label class="fld fld-holding"><span>Holding</span><select data-bl="holding_id">${list.map(x => opt(x.id, x.name, f.holding_id)).join("")}</select></label>
        <label class="fld"><span>Date</span><input type="date" data-bl="date" value="${esc(f.date)}" required></label>
        ${amountOnly ? `<label class="fld"><span>Amount ($)</span><input type="text" inputmode="decimal" data-bl="amount" value="${esc(f.amount)}" placeholder="0"></label>`
          : `<label class="fld"><span>${qLabel}</span><input type="text" inputmode="decimal" data-bl="quantity" value="${esc(f.quantity)}" placeholder="0"></label>
             <label class="fld"><span>${pLabel}</span><input type="text" inputmode="decimal" data-bl="price" value="${esc(f.price)}" placeholder="0.00"></label>
             <div class="fld"><span>Amount ($)</span><b class="bl-computed">${computed === null ? "—" : esc(Fmt.dollars(computed))}</b></div>`}
        <label class="fld fld-note"><span>Note</span><input type="text" data-bl="note" value="${esc(f.note)}" placeholder="Optional"></label>
        <div class="fld fld-submit"><span>&nbsp;</span><button type="submit" class="btn btn-primary">Add entry</button></div>
      </form>
      <p class="note bl-help">${esc(help)}</p>
      ${f.error ? `<p class="bl-error" role="alert">${esc(f.error)}</p>` : ""}`;
  }

  function submit() {
    const f = ui.form;
    const h = holdingOf(f.holding_id);
    const n = s => { const t = String(s).trim().replace(/[$,\s]/g, ""); return t === "" ? null : Number(t); };
    const units = (f.type === "buy" || f.type === "sell") && unitType(h);
    const tx = { date: f.date, holding_id: f.holding_id, type: f.type, quantity: null, price: null, amount: null, note: String(f.note || "").trim() };
    if (!h) f.error = "Pick a holding.";
    else if (!/^\d{4}-\d{2}-\d{2}$/.test(f.date)) f.error = "Enter a date.";
    else if (units) {
      tx.quantity = n(f.quantity); tx.price = n(f.price);
      if (!(tx.quantity > 0) || !(tx.price > 0)) f.error = `Enter a ${perHundred(h) ? "face amount" : "share count"} and a price above zero.`;
      else if (f.type === "sell" && tx.quantity > Number(h.quantity) + 1e-9) f.error = `Only ${Fmt.number(h.quantity, 0)} held; a sale can't exceed that.`;
    } else {
      tx.amount = n(f.amount);
      if (!(tx.amount > 0)) f.error = "Enter an amount above zero.";
    }
    if (f.error) return renderForm();
    P.post(ctx.state, tx);
    ui.form = { type: f.type, holding_id: f.holding_id, date: f.date, quantity: "", price: "", amount: "", note: "", error: "" };
    ui.sort = { key: "date", dir: -1 };
    ctx.onChange(true);
  }

  // ---------------- List ----------------
  function renderFilters(all) {
    const chips = P.TYPES.map(t => {
      const n = all.filter(x => x.type === t).length;
      return `<button type="button" class="chip" data-bl-type="${t}" aria-pressed="${ui.types.has(t)}">${esc(P.LABELS[t])} <span class="chip-n">${n}</span></button>`;
    }).join("");
    const hs = ctx.state.holdings.map(h => `<option value="${esc(h.id)}"${ui.holding === h.id ? " selected" : ""}>${esc(h.name)}</option>`).join("");
    document.getElementById("bl-filters").innerHTML = `
      <div class="chip-row" role="group" aria-label="Filter by type"><span class="chip-label">Type</span>${chips}</div>
      <div class="chip-row"><label class="chip-label" for="bl-holding">Holding</label><select id="bl-holding" class="bl-select"><option value="">All holdings</option>${hs}</select>
        ${ui.types.size || ui.holding ? `<button type="button" class="link" data-bl-clear>Clear filters</button>` : ""}</div>`;
  }

  function renderTable(list) {
    const head = COLS.map(c => {
      const active = ui.sort.key === c.key;
      const aria = active ? (ui.sort.dir > 0 ? "ascending" : "descending") : "none";
      return `<th class="${c.num ? "num " : ""}${c.cls || ""}" aria-sort="${aria}"><button type="button" class="sort" data-bl-sort="${c.key}">${esc(c.label)}${active ? (ui.sort.dir > 0 ? " ▲" : " ▼") : ""}</button></th>`;
    }).join("") + `<th class="col-act"><span class="sr-only">Actions</span></th>`;
    const shown = list.slice(0, ui.limit);
    const cell = (c, t) => {
      const h = holdingOf(t.holding_id);
      if (c.key === "type") return `<span class="tag tag-${esc(t.type)}">${esc(P.LABELS[t.type] || t.type)}</span>`;
      if (c.key === "quantity") return t.quantity === null || t.quantity === undefined ? "" : esc(Fmt.number(t.quantity, 0));
      if (c.key === "price") return t.price === null || t.price === undefined ? "" : esc(Fmt.number(t.price, perHundred(h) ? 3 : 2));
      if (c.key === "amount") return esc(Fmt.dollars(t.amount));
      if (c.key === "cash") return `<span class="${t.cash < 0 ? "chg-bad" : "chg-good"}">${esc((t.cash < 0 ? "−" : "+") + Fmt.dollars(Math.abs(t.cash)))}</span>`;
      if (c.key === "note" && t.sale) {
        const r = t.sale.realized;
        const detail = `${t.sale.avg_cost === null ? "" : "Avg cost " + Fmt.number(t.sale.avg_cost, 2) + " · "}realized ${r < 0 ? "−" : "+"}$${Fmt.thousands(Math.abs(r))}K`;
        return `${esc(t.note || "")}${t.note ? "<br>" : ""}<span class="sale-detail">${esc(detail)}</span>`;
      }
      return esc(t[c.key] === null || t[c.key] === undefined ? "" : String(t[c.key]));
    };
    const body = shown.map(t => `<tr>` + COLS.map(c => `<td class="${c.num ? "num " : ""}${c.cls || ""}${c.wrap ? " wrap" : ""}">${cell(c, t)}</td>`).join("") +
      `<td class="col-act"><button type="button" class="link danger" data-bl-del="${esc(t.id)}" aria-label="Delete entry ${esc(t.date)} ${esc(t.holding)}">Delete</button></td></tr>`).join("");
    const empty = list.length ? "" : `<tr><td colspan="${COLS.length + 1}" class="col-name muted">No entries match these filters.</td></tr>`;
    const more = list.length > ui.limit ? `<tfoot><tr class="addrow"><td colspan="${COLS.length + 1}"><div class="addrow-inner">
        <span class="muted">Showing ${shown.length} of ${list.length}.</span>
        <button type="button" class="btn" data-bl-more>Show all</button></div></td></tr></tfoot>` : "";
    document.getElementById("bl-table").innerHTML = `<thead><tr>${head}</tr></thead><tbody>${body}${empty}</tbody>${more}`;
    document.getElementById("bl-count").textContent = `${list.length} ${list.length === 1 ? "entry" : "entries"}`;
  }

  function downloadCsv(list) {
    const q = v => { const s = v === null || v === undefined ? "" : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const lines = [q("Sample data. All holdings, ideas and figures are illustrative. Amounts in USD."),
      ["Date", "Holding", "Holding ID", "Type", "Quantity", "Price", "Amount", "Cash effect", "Note"].map(q).join(",")]
      .concat(list.map(t => [t.date, t.holding, t.holding_id, P.LABELS[t.type] || t.type, t.quantity, t.price, +t.amount.toFixed(2), +t.cash.toFixed(2),
        t.sale ? `${t.note ? t.note + ". " : ""}Avg cost ${t.sale.avg_cost === null ? "n/a" : t.sale.avg_cost.toFixed(2)}, realized ${t.sale.realized.toFixed(2)}` : t.note].map(q).join(",")));
    const blob = new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `sandune-blotter-sample-${ctx.state.as_of}.csv`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }

  function bind() {
    if (ui.bound) return;
    ui.bound = true;
    const panel = document.getElementById("pf-blotter");
    panel.addEventListener("submit", e => { if (e.target.id === "bl-entry") { e.preventDefault(); submit(); } });
    panel.addEventListener("input", e => {
      const el = e.target.closest("[data-bl]");
      if (!el) return;
      ui.form[el.dataset.bl] = el.value;
      ui.form.error = "";
      if (el.dataset.bl === "quantity" || el.dataset.bl === "price") {
        const b = panel.querySelector(".bl-computed");
        const h = holdingOf(ui.form.holding_id);
        const n = s => Number(String(s).replace(/[$,\s]/g, ""));
        const qn = n(ui.form.quantity), pn = n(ui.form.price);
        if (b) b.textContent = qn > 0 && pn > 0 ? Fmt.dollars(perHundred(h) ? qn * pn / 100 : qn * pn) : "—";
      }
    });
    panel.addEventListener("change", e => {
      const el = e.target.closest("[data-bl]");
      if (el && (el.dataset.bl === "type" || el.dataset.bl === "holding_id")) { ui.form[el.dataset.bl] = el.value; ui.form.error = ""; return renderForm(); }
      if (e.target.id === "bl-holding") { ui.holding = e.target.value; ui.limit = PAGE; return ctx.onChange(false); }
    });
    panel.addEventListener("click", e => {
      const t = e.target;
      const chip = t.closest("[data-bl-type]");
      if (chip) { const k = chip.dataset.blType; ui.types.has(k) ? ui.types.delete(k) : ui.types.add(k); ui.limit = PAGE; return ctx.onChange(false); }
      if (t.closest("[data-bl-clear]")) { ui.types.clear(); ui.holding = ""; ui.limit = PAGE; return ctx.onChange(false); }
      const s = t.closest("[data-bl-sort]");
      if (s) { const k = s.dataset.blSort; ui.sort = ui.sort.key === k ? { key: k, dir: -ui.sort.dir } : { key: k, dir: k === "date" ? -1 : 1 }; return ctx.onChange(false); }
      if (t.closest("[data-bl-more]")) { ui.limit = Infinity; return ctx.onChange(false); }
      if (t.closest("#bl-csv")) return downloadCsv(rows().list);
      const del = t.closest("[data-bl-del]");
      if (del) {
        const tx = (ctx.state.transactions || []).find(x => x.id === del.dataset.blDel);
        if (tx && root.confirm(`Delete this ${(P.LABELS[tx.type] || tx.type).toLowerCase()} of ${Fmt.dollars(P.amountOf(tx, holdingOf(tx.holding_id)))} on ${tx.date}? The holding and cash are adjusted back.`)) {
          P.unpost(ctx.state, tx.id);
          ctx.onChange(true);
        }
      }
    });
  }

  function render(state, onChange) {
    ctx = { state, onChange };
    bind();
    const { all, list } = rows();
    renderForm();
    renderFilters(all);
    renderTable(list);
  }

  root.Blotter = { render };
})(window);
