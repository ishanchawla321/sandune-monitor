// Holdings by asset class: one card per class with its own columns, inline edit and sort, then a Total card
// that reconciles to NAV. Rows combine the book (Metrics) with the blotter (Positions). Formulas live in
// column-header tooltips. Holdings.create() returns an instance with its own view state, so Portfolio and
// Pro Forma each get one.
(function (root) {
  "use strict";

  const Fmt = root.Fmt, Metrics = root.Metrics, P = root.Positions;
  const L = Fmt.LABELS, esc = Fmt.esc;
  const blank = v => v === null || v === undefined || v === "" || (typeof v === "number" && !isFinite(v));
  const div = (a, b) => (b ? a / b : null);
  const num = v => (blank(v) ? 0 : Number(v));
  const perHundred = h => h.security_type === "bond" || h.security_type === "t_bill";

  // ---------------- Derived row ----------------
  function derive(h, p, nav, asOf) {
    const qty = num(h.quantity), cost = blank(h.cost) ? null : Number(h.cost), mv = num(h.market_value);
    const r = { h, p, id: h.id, name: h.name, ticker: h.ticker_or_id, qty, cost, mv, pct_nav: div(mv, nav), pf: !!h.pf,
                has_lots: p.lots.length > 0, has_calls: p.calls_itd > 0, has_tx: p.n_tx > 0 };
    r.avg_cost = r.has_lots ? p.avg_cost : (qty && cost !== null ? (perHundred(h) ? cost / qty * 100 : cost / qty) : null);
    r.price = Metrics.isPriced(h) ? Number(h.price_or_mark) : null;
    r.pnl = cost === null ? null : mv - cost;
    r.pnl_pct = cost ? r.pnl / cost : null;
    r.realized = p.realized_pnl;
    r.income_itd = p.income_itd;
    r.income_ltm = p.income_ltm;
    r.div_ltm = p.by_type.dividend.ltm + p.by_type.distribution.ltm;
    r.div_yield = div(r.div_ltm, mv);
    // (unrealized P&L + realized P&L + income since inception) / total cost of every lot bought
    r.invested_total = r.has_lots || r.has_calls ? p.invested : cost;
    r.total_return = r.invested_total && r.pnl !== null ? (r.pnl + p.realized_pnl + p.income_itd) / r.invested_total : null;
    // Bonds
    r.coupon = blank(h.coupon) ? null : Number(h.coupon);
    r.maturity = h.maturity || null;
    r.accrued = h.security_type === "bond" ? P.accrued(h, asOf, qty) : null;
    r.coupons_ltm = p.by_type.coupon.ltm;
    r.ytm = h.security_type === "bond" ? P.ytm(h, r.price, asOf) : null;
    const cd = h.security_type === "bond" ? P.couponDates(h, asOf) : null;
    r.next_coupon = cd ? cd.next : null;
    // Funds
    r.vintage = blank(h.vintage) ? null : Number(h.vintage);
    r.commitment = blank(h.commitment) ? null : Number(h.commitment);
    r.paid_in = cost;
    r.unfunded = num(h.unfunded);
    r.distributions = p.by_type.distribution.itd;
    r.dpi = div(r.distributions, r.paid_in); r.rvpi = div(mv, r.paid_in); r.tvpi = div(mv + r.distributions, r.paid_in);
    r.next_call = null;
    if (r.unfunded > 0) {
      const s = h.call_schedule || [1 / 3, 1 / 3, 1 / 3];
      const t = s.findIndex(x => x > 0);
      if (t >= 0) r.next_call = { year: t + 1, amount: r.unfunded * s[t] };
    }
    // Directs and real estate
    r.invested = cost; r.moic = cost ? (mv + p.income_itd) / cost : null;
    r.mark_date = h.mark_date || null; r.mark_source = h.mark_source || null;
    r.liquidity_date = h.liquidity_date || null;
    // Cash and T-bills
    r.face_or_balance = h.security_type === "t_bill" ? qty : mv;
    r.yield = h.security_type === "t_bill" ? P.billYield(h, r.price, asOf) : (blank(h.yield) ? null : Number(h.yield));
    return r;
  }

  // ---------------- Column helpers ----------------
  const F = {
    k: v => Fmt.thousands(v), n0: v => Fmt.number(v, 0), n2: v => Fmt.number(v, 2),
    pct1: v => (blank(v) ? "" : Fmt.pct(v, 1)), pct2: v => (blank(v) ? "" : Fmt.pct(v, 2)), pct3: v => (blank(v) ? "" : Fmt.pct(v, 3)),
    x: v => (blank(v) ? "" : Fmt.number(v, 2) + "x"), text: v => (blank(v) ? "" : String(v)), int: v => (blank(v) ? "" : String(v))
  };
  const sum = (rows, key) => rows.reduce((s, r) => s + (blank(r[key]) ? 0 : Number(r[key])), 0);
  // col(key, label, { num, fmt, unit, qual, help, edit, field, scale, editable, derivedNote, cls, wrap, options, labels, nullable, after })
  // unit and qual print once in the header, e.g. "Dividends (LTM, $K)"; help is the header tooltip (formula or method).
  const col = (key, label, o) => Object.assign({ key, label, fmt: "text", value: r => r[key] }, o || {});
  const NAME = col("name", "Name", { cls: "col-name", edit: "text", field: "name" });
  const PCT_NAV = col("pct_nav", "% NAV", { num: true, fmt: "pct1" });
  const TICKER = col("ticker", "Ticker", { edit: "text", field: "ticker_or_id", nullable: true });
  // Book fields that the blotter drives are editable only while the holding has no lots (or calls) yet.
  const noLots = r => !r.has_lots;
  const money = (key, label, o) => col(key, label, Object.assign({ num: true, fmt: "k", unit: "$K" }, o || {}));
  const date = (key, label, field) => col(key, label, { edit: "date", field, nullable: true });

  const PRICE = col("price", "Price", { num: true, fmt: "n2", edit: "number", field: "price_or_mark" });
  const SHARES = col("qty", "Shares", { num: true, fmt: "n0", edit: "number", field: "quantity", editable: noLots, derivedNote: "From the blotter" });
  const AVG_COST = col("avg_cost", "Avg Cost", { num: true, fmt: "n2", edit: "number", field: "cost", scale: r => r.qty || 1, editable: noLots, derivedNote: "Weighted average from the blotter" });
  const MV = money("mv", "Market Value", { edit: "number", field: "price_or_mark", scale: () => 1000, editable: r => !Metrics.isPriced(r.h) });
  const PNL = money("pnl", "Unrealized P&L");
  const INVESTED = money("invested", "Invested", { edit: "number", field: "cost", scale: () => 1000, editable: noLots, derivedNote: "Sum of fundings in the blotter" });
  const MARK = money("mv", "Mark", { edit: "number", field: "price_or_mark", scale: () => 1000 });
  const MOIC = col("moic", "MOIC", { num: true, fmt: "x", help: "MOIC = (mark + income received since inception) / invested" });

  // ---------------- Card definitions ----------------
  const CARDS = [
    { key: "public_equity", title: "Public Equity", match: h => h.asset_class === "public_equity",
      cols: [NAME, TICKER, SHARES, AVG_COST, PRICE, MV, PNL,
             money("div_ltm", "Dividends", { qual: "LTM" }),
             col("div_yield", "Dividend Yield", { num: true, fmt: "pct2", help: "Dividends received in the last 12 months / market value" }),
             col("total_return", "Total Return %", { num: true, fmt: "pct1",
                  help: "Total return = (unrealized P&L + realized P&L + income since inception) / total cost of all lots bought" }),
             PCT_NAV] },
    { key: "credit_etf", title: "Liquid Credit, ETFs", match: h => h.asset_class === "credit" && h.security_type !== "bond",
      cols: [NAME, TICKER, SHARES, AVG_COST, PRICE, MV, PNL, money("div_ltm", "Distributions", { qual: "LTM" }), PCT_NAV] },
    { key: "credit_bond", title: "Liquid Credit, Bonds", match: h => h.asset_class === "credit" && h.security_type === "bond",
      cols: [NAME, col("coupon", "Coupon", { num: true, fmt: "pct3", edit: "number", field: "coupon", scale: () => 0.01 }),
             date("maturity", "Maturity", "maturity"),
             money("qty", "Face", { edit: "number", field: "quantity", scale: () => 1000, editable: noLots, derivedNote: "From the blotter" }),
             col("price", "Price", { num: true, fmt: "n2", edit: "number", field: "price_or_mark", help: "Clean price per 100 of face" }),
             money("mv", "Market Value", { help: "Clean price x face / 100" }),
             money("accrued", "Accrued", { help: "Accrued interest, 30/360 since the last coupon date; not in NAV" }),
             col("ytm", "YTM", { num: true, fmt: "pct2", help: "Yield to maturity solved from the clean price" }),
             PCT_NAV] },
    { key: "private_fund", title: "Private Funds", match: h => h.asset_class === "private_fund",
      cols: [NAME, col("vintage", "Vintage", { num: true, fmt: "int", edit: "number", field: "vintage", nullable: true }),
             money("commitment", "Commitment", { edit: "number", field: "commitment", scale: () => 1000, nullable: true, after: (h, r) => { h.unfunded = Math.max(0, num(h.commitment) - num(h.cost)); } }),
             money("paid_in", "Paid-In", { edit: "number", field: "cost", scale: () => 1000, editable: r => !r.has_calls, derivedNote: "Sum of capital calls in the blotter", after: (h, r) => { if (!blank(h.commitment)) h.unfunded = Math.max(0, num(h.commitment) - num(h.cost)); } }),
             money("unfunded", "Unfunded", { edit: "number", field: "unfunded", scale: () => 1000, editable: r => !r.has_calls, derivedNote: "Commitment less capital calls in the blotter" }),
             money("distributions", "Distributions"),
             money("mv", "NAV", { edit: "number", field: "price_or_mark", scale: () => 1000 }),
             col("tvpi", "TVPI", { num: true, fmt: "x", help: "TVPI = (NAV + distributions) / paid-in" }),
             PCT_NAV] },
    { key: "direct", title: "Directs, Co-Invests and Private Credit", match: h => h.asset_class === "direct" || h.asset_class === "private_credit",
      cols: [NAME, col("security_type", "Security", { value: r => r.h.security_type, show: r => L.security_type[r.h.security_type] || r.h.security_type || "", edit: "select", field: "security_type", options: Object.keys(L.security_type), labels: L.security_type, wrap: true }),
             INVESTED, MARK, money("income_itd", "Income", { help: "Dividends, interest and distributions received since inception" }), MOIC,
             date("liquidity_date", "Expected Liquidity", "liquidity_date"), PCT_NAV] },
    { key: "real_estate", title: "Real Estate", match: h => h.asset_class === "real_estate",
      cols: [NAME, INVESTED, MARK, money("income_itd", "Distributions"), MOIC, PCT_NAV] },
    { key: "cash", title: "Cash and T-Bills", match: h => h.asset_class === "cash",
      cols: [NAME, money("face_or_balance", "Balance / Face", { edit: "number", field: r => (r.h.security_type === "t_bill" ? "quantity" : "price_or_mark"), scale: () => 1000, editable: r => r.h.security_type !== "t_bill" || !r.has_lots, derivedNote: "From the blotter" }),
             col("yield", "Yield", { num: true, fmt: "pct2", edit: "number", field: "yield", scale: () => 0.01, editable: r => r.h.security_type !== "t_bill", nullable: true,
                  help: "T-bills: bond-equivalent yield to maturity from the price. Cash: stated rate" }),
             date("maturity", "Maturity", "maturity"), PCT_NAV] }
  ];
  const cardFor = h => CARDS.find(c => c.match(h)) || CARDS[CARDS.length - 1];

  // ---------------- Instance ----------------
  function create(opts) {
    const o = Object.assign({ prefix: "hc", editable: true, badge: null, suffix: null, rowClass: null }, opts || {});
    const ui = { sort: {}, bound: false };
    let ctx = null; // { state, onChange, nav, container, rows }

    const show = (c, r) => {
      if (c.show) return c.show(r);
      const v = c.value(r);
      return blank(v) ? "" : (F[c.fmt] || F.text)(v);
    };
    const canEdit = (c, r) => o.editable && !!c.edit && !r.pf && (!c.editable || c.editable(r));
    const scaleOf = (c, r) => (c.scale ? c.scale(r) : 1);
    const fieldOf = (c, r) => (typeof c.field === "function" ? c.field(r) : c.field || c.key);
    const rowsFor = card => ctx.rows.filter(r => card.match(r.h));
    const headLabel = c => esc(c.label) + (c.qual || c.unit ? ` <span class="unit-hint">(${[c.qual, c.unit].filter(Boolean).join(", ")})</span>` : "");

    function tableHtml(card) {
      const cols = card.cols;
      let rows = rowsFor(card);
      const s = ui.sort[card.key];
      const sc = s && cols.find(c => c.key === s.key);
      if (sc) {
        const v = r => { const x = sc.value(r); return sc.num ? (blank(x) ? -Infinity : Number(x)) : String(show(sc, r)).toLowerCase(); };
        rows = rows.slice().sort((a, b) => (v(a) > v(b) ? 1 : v(a) < v(b) ? -1 : 0) * s.dir);
      }
      const head = cols.map(c => {
        const active = s && s.key === c.key;
        const aria = active ? (s.dir > 0 ? "ascending" : "descending") : "none";
        return `<th class="${c.num ? "num " : ""}${c.cls || ""}" aria-sort="${aria}"${c.help ? ` title="${esc(c.help)}"` : ""}><button type="button" class="sort" data-hsort="${card.key}:${c.key}">${headLabel(c)}${active ? (s.dir > 0 ? " ▲" : " ▼") : ""}</button></th>`;
      }).join("") + (o.editable ? `<th class="col-act"><span class="sr-only">Actions</span></th>` : "");
      const body = rows.map(r => `<tr data-id="${esc(r.id)}" class="${r.pf ? "pf-new" : ""}${o.rowClass ? " " + o.rowClass(r) : ""}">` + cols.map(c => {
        const editable = canEdit(c, r);
        const derived = c.derivedNote && c.editable && !c.editable(r);
        let text = esc(show(c, r));
        if (c.key === "name" && r.h.from_investment) text = `<button type="button" class="link name-link" data-open-investment="${esc(r.h.from_investment)}">${text}</button>`;
        if (c.key === "name" && o.badge) text = o.badge(r) + text;
        if (c.key === "name" && o.suffix) text += o.suffix(r);
        return `<td class="${c.num ? "num " : ""}${c.cls || ""}${c.wrap ? " wrap-sm" : ""}${editable ? " editable" : ""}${derived ? " derived" : ""}"${editable ? ` data-edit="${c.key}" data-card="${card.key}" tabindex="0"` : ""}${derived ? ` title="${esc(c.derivedNote)}"` : ""}>${text}</td>`;
      }).join("") + (o.editable ? `<td class="col-act"><button type="button" class="link danger row-del" data-hdel="${esc(r.id)}" aria-label="Delete ${esc(r.name)}">Delete</button></td>` : "") + "</tr>").join("");
      return `<thead><tr>${head}</tr></thead><tbody>${body}</tbody>`;
    }

    function cardHtml(card) {
      const rows = rowsFor(card);
      if (!rows.length) return "";
      const mv = sum(rows, "mv");
      const id = `${o.prefix}-${card.key}`;
      return `<section class="card hc" data-card="${card.key}" aria-labelledby="${id}-h">
        <div class="card-header">
          <h2 id="${id}-h">${esc(card.title)}</h2>
          <div class="hc-sub"><span class="hc-mv">$${Fmt.thousands(mv)}K</span><span class="hc-pct">${Fmt.pct(div(mv, ctx.nav), 1)} of NAV</span></div>
        </div>
        <div class="table-wrap"><table class="grid hold" data-table="${card.key}">${tableHtml(card)}</table></div>
      </section>`;
    }

    function totalHtml() {
      const lines = CARDS.map(c => ({ c, rows: rowsFor(c) })).filter(x => x.rows.length);
      const total = sum(ctx.rows, "mv");
      return `<section class="card hc-total" aria-labelledby="${o.prefix}-total-h">
        <div class="card-header"><h2 id="${o.prefix}-total-h">Total</h2></div>
        <div class="table-wrap"><table class="grid hold-total"><thead><tr><th class="col-name">Asset Class</th><th class="num">Market Value <span class="unit-hint">($K)</span></th><th class="num">% NAV</th></tr></thead>
          <tbody>${lines.map(x => `<tr><td class="col-name">${esc(x.c.title)}</td><td class="num">${Fmt.thousands(sum(x.rows, "mv"))}</td><td class="num">${Fmt.pct(div(sum(x.rows, "mv"), ctx.nav), 1)}</td></tr>`).join("")}
          <tr class="grandtotal"><td class="col-name">NAV</td><td class="num">${Fmt.thousands(total)}</td><td class="num">${Fmt.pct(div(total, ctx.nav), 1)}</td></tr></tbody></table></div>
      </section>`;
    }

    // ---------------- Editing ----------------
    function parseNumber(text) {
      const t = String(text).trim().replace(/[$,\s%]/g, "");
      if (t === "") return "";
      const neg = /^\(.*\)$/.test(t);
      const n = Number(t.replace(/[()]/g, ""));
      return isFinite(n) ? (neg ? -n : n) : NaN;
    }

    function startEdit(td) {
      const id = td.parentElement.dataset.id, key = td.dataset.edit, cardKey = td.dataset.card;
      if (!td.isConnected) {
        td = Array.from(ctx.container.querySelectorAll(`table[data-table="${cardKey}"] tr[data-id]`)).filter(tr => tr.dataset.id === id)
          .map(tr => tr.querySelector(`td[data-edit="${key}"]`))[0];
        if (!td) return;
      }
      if (td.querySelector("input, select")) return;
      const h = ctx.state.holdings.find(x => x.id === id);
      const card = CARDS.find(c => c.key === cardKey);
      const c = card && card.cols.find(x => x.key === key);
      const r = ctx.rows.find(x => x.id === id);
      if (!h || !c || !r) return;
      const field = fieldOf(c, r);
      let input;
      if (c.edit === "select") {
        input = document.createElement("select");
        const options = c.options.includes(h[field]) || !h[field] ? c.options : c.options.concat(h[field]);
        options.forEach(v => {
          const opt = document.createElement("option");
          opt.value = v; opt.textContent = (c.labels && c.labels[v]) || v;
          if (h[field] === v) opt.selected = true;
          input.appendChild(opt);
        });
      } else {
        input = document.createElement("input");
        input.type = c.edit === "date" ? "date" : "text";
        if (c.edit === "number") {
          input.inputMode = "decimal";
          const v = h[field];
          input.value = blank(v) ? "" : String(+(v / scaleOf(c, r)).toFixed(6));
        } else {
          input.value = blank(h[field]) ? "" : h[field];
        }
      }
      input.className = "cell-input";
      input.setAttribute("aria-label", c.label);
      let done = false;
      const finish = commit => {
        if (done) return;
        done = true;
        if (commit) applyEdit(h, c, r, input.value);
        else ctx.onChange(false);
      };
      input.addEventListener("keydown", e => {
        if (e.key === "Enter") { e.preventDefault(); finish(true); }
        if (e.key === "Escape") { e.preventDefault(); finish(false); }
      });
      input.addEventListener("blur", () => finish(true));
      if (c.edit === "select") input.addEventListener("change", () => finish(true));
      td.textContent = "";
      td.appendChild(input);
      input.focus();
      if (input.select) input.select();
    }

    function applyEdit(h, c, r, raw) {
      const field = fieldOf(c, r);
      let value = raw;
      if (c.edit === "number") {
        const n = parseNumber(raw);
        if (n === "") value = c.nullable ? null : 0;
        else if (isNaN(n)) return ctx.onChange(false);
        else value = n * scaleOf(c, r);
        if (typeof value === "number") value = Math.round(value * 1e6) / 1e6;
      } else if (c.edit === "text" || c.edit === "date") {
        value = String(raw).trim() || (c.key === "name" ? h.name : null);
      }
      if (h[field] === value) return ctx.onChange(false);
      h[field] = value;
      if (field === "price_or_mark") { h.mark_source = "Manual edit"; h.mark_date = Fmt.today(); }
      if (c.after) c.after(h, r);
      ctx.onChange(true);
    }

    // One CSV for every holding, in dollars, with the fields behind every card.
    function downloadCsv() {
      const q = v => { const s = blank(v) ? "" : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
      const n = v => (blank(v) ? "" : +Number(v).toFixed(6));
      const cols = [
        ["Asset class", r => cardFor(r.h).title], ["Name", r => r.name], ["Ticker", r => r.ticker],
        ["Security type", r => L.security_type[r.h.security_type] || r.h.security_type], ["Sector", r => r.h.sector],
        ["Quantity or face", r => n(r.qty)], ["Avg cost", r => n(r.avg_cost)], ["Price or mark", r => n(r.price)],
        ["Market value", r => n(r.mv)], ["Cost", r => n(r.cost)], ["Unrealized P&L", r => n(r.pnl)], ["Realized P&L", r => n(r.realized)],
        ["Income since inception", r => n(r.income_itd)], ["Income LTM", r => n(r.income_ltm)],
        ["Commitment", r => n(r.commitment)], ["Paid-in", r => n(r.paid_in)], ["Unfunded", r => n(r.unfunded)], ["Distributions", r => n(r.distributions)],
        ["Coupon", r => n(r.coupon)], ["Maturity", r => r.maturity], ["Yield or YTM", r => n(blank(r.ytm) ? r.yield : r.ytm)],
        ["Liquidity", r => L.liquidity_bucket[r.h.liquidity_bucket] || r.h.liquidity_bucket], ["Expected liquidity", r => r.liquidity_date],
        ["% NAV", r => n(r.pct_nav)]
      ];
      const lines = [q("Sample data. All holdings, investments and figures are illustrative. Amounts in USD."),
        cols.map(c => q(c[0])).join(","),
        ...ctx.rows.map(r => cols.map(c => q(c[1](r))).join(","))];
      const blob = new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `sandune-holdings-sample-${ctx.state.as_of}.csv`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
    }

    function bind(container) {
      if (ui.bound) return;
      ui.bound = true;
      container.addEventListener("click", e => {
        const t = e.target;
        const oi = t.closest("[data-open-investment]");
        if (oi) return root.App.openInvestment(oi.dataset.openInvestment);
        const s = t.closest("[data-hsort]");
        if (s) {
          const [cardKey, key] = s.dataset.hsort.split(":");
          const cur = ui.sort[cardKey];
          ui.sort[cardKey] = cur && cur.key === key ? { key, dir: -cur.dir } : { key, dir: 1 };
          return ctx.onChange(false);
        }
        if (t.closest("[data-hcsv]")) return downloadCsv();
        const del = t.closest("[data-hdel]");
        if (del) {
          const h = ctx.state.holdings.find(x => x.id === del.dataset.hdel);
          const n = (ctx.state.transactions || []).filter(x => x.holding_id === h.id).length;
          if (h && root.confirm(`Delete "${h.name}"?${n ? ` Its ${n} blotter ${n === 1 ? "entry" : "entries"} will be removed too.` : ""}`)) {
            ctx.state.holdings = ctx.state.holdings.filter(x => x !== h);
            if (n) ctx.state.transactions = ctx.state.transactions.filter(x => x.holding_id !== h.id);
            ctx.onChange(true);
          }
          return;
        }
        const td = t.closest("td[data-edit]");
        if (td) startEdit(td);
      });
      container.addEventListener("keydown", e => {
        const td = e.target.closest && e.target.closest("td[data-edit]");
        if (td && e.target === td && e.key === "Enter") { e.preventDefault(); startEdit(td); }
      });
    }

    // holdings: the valued holdings from Metrics.summary; state: for editing and the blotter.
    function render(container, state, holdings, nav, onChange) {
      const positions = P.compute(holdings, state.transactions || [], state.as_of);
      ctx = { state, onChange, nav, container, rows: holdings.map(h => derive(h, positions[h.id], nav, state.as_of)) };
      bind(container);
      const toolbar = o.editable ? `<div class="hc-toolbar"><h2>Holdings</h2><button type="button" class="btn" data-hcsv>Export CSV</button></div>` : "";
      container.innerHTML = toolbar + CARDS.map(cardHtml).join("") + totalHtml();
    }

    return { render, CARDS };
  }

  root.Holdings = { create, CARDS, derive };
})(window);
