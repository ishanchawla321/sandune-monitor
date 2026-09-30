// Holdings by asset class: one card per class, each with its own columns, subtotal row, inline edit,
// sort, "All columns" toggle (cards with more than ten columns), CSV export and an add-holding row,
// then a total card that reconciles to NAV. Rows combine the book (Metrics) with the blotter (Positions).
// Holdings.create() returns an instance with its own view state, so Portfolio and Pro Forma each get one.
(function (root) {
  "use strict";

  const Fmt = root.Fmt, Metrics = root.Metrics, P = root.Positions;
  const L = Fmt.LABELS, esc = Fmt.esc;
  const blank = v => v === null || v === undefined || v === "" || (typeof v === "number" && !isFinite(v));
  const div = (a, b) => (b ? a / b : null);
  const num = v => (blank(v) ? 0 : Number(v));
  const perHundred = h => h.security_type === "bond" || h.security_type === "t_bill";
  const BUCKETS = ["liquid_now", "1_3y", "3y_plus"];
  const MAX_COMPACT = 10;

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
    k: v => Fmt.thousands(v), n0: v => Fmt.number(v, 0), n2: v => Fmt.number(v, 2), n3: v => Fmt.number(v, 3),
    pct1: v => (blank(v) ? "" : Fmt.pct(v, 1)), pct2: v => (blank(v) ? "" : Fmt.pct(v, 2)), pct3: v => (blank(v) ? "" : Fmt.pct(v, 3)),
    x: v => (blank(v) ? "" : Fmt.number(v, 2) + "x"), text: v => (blank(v) ? "" : String(v)), int: v => (blank(v) ? "" : String(v))
  };
  const sum = (rows, key) => rows.reduce((s, r) => s + (blank(r[key]) ? 0 : Number(r[key])), 0);
  const col = (key, label, o) => Object.assign({ key, label, fmt: "text", value: r => r[key], compact: true }, o || {});
  const NAME = col("name", "Name", { cls: "col-name", edit: "text", field: "name", total: "label" });
  const PCT_NAV = col("pct_nav", "% NAV", { num: true, fmt: "pct1", total: "pct_nav" });
  const TICKER = col("ticker", "Ticker", { edit: "text", field: "ticker_or_id", nullable: true });
  const MARK_DATE = col("mark_date", "Mark date", { edit: "date", field: "mark_date", nullable: true, compact: false });
  const MARK_SOURCE = col("mark_source", "Mark source", { edit: "text", field: "mark_source", nullable: true, compact: false, wrap: true });
  const LIQ = col("liquidity", "Liquidity", { value: r => r.h.liquidity_bucket, show: r => L.liquidity_bucket[r.h.liquidity_bucket] || r.h.liquidity_bucket || "",
                    edit: "select", field: "liquidity_bucket", options: BUCKETS, labels: L.liquidity_bucket, compact: false });
  const LIQ_DATE = col("liquidity_date", "Liquidity date", { edit: "date", field: "liquidity_date", nullable: true, compact: false });
  // Book fields that the blotter drives are editable only while the holding has no lots (or calls) yet.
  const noLots = r => !r.has_lots;
  const money = (key, label, o) => col(key, label, Object.assign({ num: true, fmt: "k", unit: "$K", total: "sum" }, o || {}));

  const PRICE = (label, dp) => col("price", label, { num: true, fmt: dp === 3 ? "n3" : "n2", edit: "number", field: "price_or_mark" });
  const SHARES = col("qty", "Shares", { num: true, fmt: "n0", edit: "number", field: "quantity", editable: noLots, derivedNote: "From the blotter" });
  const AVG_COST = col("avg_cost", "Avg cost", { num: true, fmt: "n2", edit: "number", field: "cost", scale: r => r.qty || 1, editable: noLots, derivedNote: "Weighted average from the blotter" });
  const MV = money("mv", "Market value", { edit: "number", field: "price_or_mark", scale: () => 1000, editable: r => !Metrics.isPriced(r.h) });
  const PNL = money("pnl", "Unrealized P&L");
  const PNL_PCT = col("pnl_pct", "P&L %", { num: true, fmt: "pct1", total: rows => div(sum(rows, "pnl"), sum(rows.filter(r => r.pnl !== null), "cost")) });
  const REALIZED = money("realized", "Realized P&L", { compact: false });

  // ---------------- Card definitions ----------------
  const CARDS = [
    { key: "public_equity", title: "Public equity", match: h => h.asset_class === "public_equity",
      note: "Shares, average cost and dividends come from the blotter. Price is per share; market value is price x shares. Dollar columns in $ thousands.",
      newHolding: { asset_class: "public_equity", security_type: "common_stock", liquid: true },
      cols: [NAME, TICKER, SHARES, AVG_COST, PRICE("Last price"), MV, PNL, PNL_PCT,
             money("div_ltm", "Dividends (LTM)"), col("div_yield", "Dividend yield", { num: true, fmt: "pct2", total: rows => div(sum(rows, "div_ltm"), sum(rows, "mv")) }),
             col("total_return", "Total return %", { num: true, fmt: "pct1", help: "(Unrealized P&L + realized P&L + income since inception) / total cost of all lots bought",
                  total: rows => div(sum(rows, "pnl") + sum(rows, "realized") + sum(rows, "income_itd"), sum(rows, "invested_total")) }),
             REALIZED, PCT_NAV, MARK_SOURCE, MARK_DATE] },
    { key: "credit_etf", title: "Liquid credit: ETFs", match: h => h.asset_class === "credit" && h.security_type !== "bond",
      note: "Shares and average cost come from the blotter; distributions are the trailing 12 months. Dollar columns in $ thousands.",
      newHolding: { asset_class: "credit", security_type: "etf", liquid: true },
      cols: [NAME, TICKER, SHARES, AVG_COST, PRICE("Last price"), MV, money("div_ltm", "Distributions (LTM)"), PNL, PNL_PCT, REALIZED, PCT_NAV, MARK_SOURCE, MARK_DATE] },
    { key: "credit_bond", title: "Liquid credit: bonds", match: h => h.asset_class === "credit" && h.security_type === "bond",
      note: "Prices per 100 of face. Market value and NAV use the clean price; accrued interest (30/360 since the last coupon) is shown separately and is not in NAV. YTM is solved from the clean price. Dollar columns in $ thousands.",
      newHolding: { asset_class: "credit", security_type: "bond", liquid: true, extra: { coupon: 0.05, coupon_freq: 2 } },
      cols: [NAME, col("coupon", "Coupon", { num: true, fmt: "pct3", edit: "number", field: "coupon", scale: () => 0.01 }),
             col("maturity", "Maturity", { edit: "date", field: "maturity", nullable: true }),
             money("qty", "Face", { edit: "number", field: "quantity", scale: () => 1000, editable: noLots, derivedNote: "From the blotter" }),
             col("avg_cost", "Avg price", { num: true, fmt: "n2", compact: false, edit: "number", field: "cost", scale: r => (r.qty ? r.qty / 100 : 1), editable: noLots, derivedNote: "Weighted average from the blotter" }),
             PRICE("Clean price"), money("mv", "Market value (clean)", { cls: "col-w" }),
             money("accrued", "Accrued interest", { help: "not in NAV", cls: "col-w" }), money("coupons_ltm", "Coupons (LTM)"),
             col("ytm", "YTM", { num: true, fmt: "pct2", total: rows => div(rows.reduce((s, r) => s + (blank(r.ytm) ? 0 : r.ytm * r.mv), 0), sum(rows.filter(r => !blank(r.ytm)), "mv")) }),
             col("next_coupon", "Next coupon", { compact: false }), PNL, PCT_NAV, MARK_SOURCE, MARK_DATE] },
    { key: "private_fund", title: "Private funds", match: h => h.asset_class === "private_fund",
      note: "Paid-in, unfunded and distributions come from the blotter's capital calls and distributions. DPI = distributions / paid-in, RVPI = NAV / paid-in, TVPI = (NAV + distributions) / paid-in. Next call follows the fund's call schedule (straight-line over 3 years when none is set). Dollar columns in $ thousands.",
      newHolding: { asset_class: "private_fund", security_type: "lp_interest", liquid: false, extra: { commitment: 0, vintage: null } },
      cols: [NAME, col("vintage", "Vintage", { num: true, fmt: "int", edit: "number", field: "vintage", nullable: true }),
             money("commitment", "Commitment", { edit: "number", field: "commitment", scale: () => 1000, nullable: true, after: (h, r) => { h.unfunded = Math.max(0, num(h.commitment) - num(h.cost)); } }),
             money("paid_in", "Paid-in", { edit: "number", field: "cost", scale: () => 1000, editable: r => !r.has_calls, derivedNote: "Sum of capital calls in the blotter", after: (h, r) => { if (!blank(h.commitment)) h.unfunded = Math.max(0, num(h.commitment) - num(h.cost)); } }),
             money("unfunded", "Unfunded", { edit: "number", field: "unfunded", scale: () => 1000, editable: r => !r.has_calls, derivedNote: "Commitment less capital calls in the blotter" }),
             money("distributions", "Distributions"), money("mv", "NAV", { edit: "number", field: "price_or_mark", scale: () => 1000 }),
             col("dpi", "DPI", { num: true, fmt: "x", compact: false, total: rows => div(sum(rows, "distributions"), sum(rows, "paid_in")) }),
             col("rvpi", "RVPI", { num: true, fmt: "x", compact: false, total: rows => div(sum(rows, "mv"), sum(rows, "paid_in")) }),
             col("tvpi", "TVPI", { num: true, fmt: "x", total: rows => div(sum(rows, "mv") + sum(rows, "distributions"), sum(rows, "paid_in")) }),
             col("next_call", "Next call", { num: true, value: r => (r.next_call ? r.next_call.amount : null), show: r => (r.next_call ? `Y${r.next_call.year} · ${Fmt.thousands(r.next_call.amount)}` : "—"), unit: "$K",
                  total: rows => rows.reduce((s, r) => s + (r.next_call && r.next_call.year === 1 ? r.next_call.amount : 0), 0), totalFmt: "k" }),
             PCT_NAV, LIQ, LIQ_DATE, MARK_SOURCE, MARK_DATE] },
    { key: "direct", title: "Directs, co-invests and private credit", match: h => h.asset_class === "direct" || h.asset_class === "private_credit",
      note: "Invested is the blotter's funding to date; income received is dividends, interest and distributions since inception. MOIC = (mark + income) / invested. Dollar columns in $ thousands.",
      newHolding: { asset_class: "direct", security_type: "common_equity", liquid: false },
      cols: [NAME, col("security_type", "Security type", { value: r => r.h.security_type, show: r => L.security_type[r.h.security_type] || r.h.security_type || "", edit: "select", field: "security_type", options: Object.keys(L.security_type), labels: L.security_type, wrap: true }),
             money("invested", "Invested", { edit: "number", field: "cost", scale: () => 1000, editable: noLots, derivedNote: "Sum of fundings in the blotter" }),
             money("mv", "Current mark", { edit: "number", field: "price_or_mark", scale: () => 1000 }), money("income_itd", "Income received"),
             col("moic", "MOIC", { num: true, fmt: "x", total: rows => div(sum(rows, "mv") + sum(rows, "income_itd"), sum(rows, "invested")) }),
             col("mark_date", "Mark date", { edit: "date", field: "mark_date", nullable: true }),
             col("liquidity_date", "Expected liquidity", { edit: "date", field: "liquidity_date", nullable: true }),
             PCT_NAV, LIQ, MARK_SOURCE] },
    { key: "real_estate", title: "Real estate", match: h => h.asset_class === "real_estate",
      note: "Invested is the blotter's funding to date; distributions are since inception. MOIC = (mark + distributions) / invested. Dollar columns in $ thousands.",
      newHolding: { asset_class: "real_estate", security_type: "jv_equity", liquid: false },
      cols: [NAME, money("invested", "Invested", { edit: "number", field: "cost", scale: () => 1000, editable: noLots, derivedNote: "Sum of fundings in the blotter" }),
             money("mv", "Current mark", { edit: "number", field: "price_or_mark", scale: () => 1000 }), money("income_itd", "Distributions"),
             col("moic", "MOIC", { num: true, fmt: "x", total: rows => div(sum(rows, "mv") + sum(rows, "income_itd"), sum(rows, "invested")) }),
             col("mark_date", "Mark date", { edit: "date", field: "mark_date", nullable: true }), PCT_NAV, LIQ, LIQ_DATE, MARK_SOURCE] },
    { key: "cash", title: "Cash and T-bills", match: h => h.asset_class === "cash",
      note: "T-bill face and price per 100 come from the blotter; their yield is the bond-equivalent yield to maturity from the price. The operating cash balance moves with every blotter entry. Dollar columns in $ thousands.",
      newHolding: { asset_class: "cash", security_type: "t_bill", liquid: true },
      cols: [NAME, money("face_or_balance", "Face or balance", { edit: "number", field: r => (r.h.security_type === "t_bill" ? "quantity" : "price_or_mark"), scale: () => 1000, editable: r => r.h.security_type !== "t_bill" || !r.has_lots, derivedNote: "From the blotter", total: null }),
             col("price", "Price", { num: true, fmt: "n2", edit: "number", field: "price_or_mark", editable: r => Metrics.isPriced(r.h) }),
             MV, col("yield", "Yield", { num: true, fmt: "pct2", edit: "number", field: "yield", scale: () => 0.01, editable: r => r.h.security_type !== "t_bill", nullable: true,
                      total: rows => div(rows.reduce((s, r) => s + (blank(r.yield) ? 0 : r.yield * r.mv), 0), sum(rows.filter(r => !blank(r.yield)), "mv")) }),
             col("maturity", "Maturity", { edit: "date", field: "maturity", nullable: true }), PCT_NAV, MARK_SOURCE, MARK_DATE] }
  ];
  const cardFor = h => CARDS.find(c => c.match(h)) || CARDS[CARDS.length - 1];

  // ---------------- Instance ----------------
  function create(opts) {
    const o = Object.assign({ prefix: "hc", editable: true, badge: null, suffix: null, rowClass: null }, opts || {});
    const ui = { sort: {}, allCols: {}, bound: false };
    let ctx = null; // { state, onChange, holdings (with values), nav, positions, container }

    const hasToggle = c => c.cols.length > MAX_COMPACT;
    const compactCols = c => c.cols.filter(x => x.compact);
    const colsFor = c => (ui.allCols[c.key] || !hasToggle(c) ? c.cols : compactCols(c));

    const show = (c, r) => {
      if (c.show) return c.show(r);
      const v = c.value(r);
      return blank(v) ? "" : (F[c.fmt] || F.text)(v);
    };
    const canEdit = (c, r) => o.editable && !!c.edit && !r.pf && (!c.editable || c.editable(r));
    const scaleOf = (c, r) => (c.scale ? c.scale(r) : 1);
    const fieldOf = (c, r) => (typeof c.field === "function" ? c.field(r) : c.field || c.key);

    function rowsFor(card) {
      return ctx.rows.filter(r => card.match(r.h));
    }

    function totalCell(c, rows, label) {
      if (c.total === "label") return esc(label);
      if (c.total === null || c.total === undefined) return "";
      if (c.total === "sum") return (F[c.fmt] || F.k)(sum(rows, c.key));
      if (c.total === "pct_nav") return Fmt.pct(div(sum(rows, "mv"), ctx.nav), 1);
      const v = c.total(rows);
      return blank(v) ? "" : (F[c.totalFmt || c.fmt] || F.text)(v);
    }

    function tableHtml(card) {
      const cols = colsFor(card);
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
        const label = esc(c.label) + (c.unit ? ` <span class="unit-hint">(${c.unit})</span>` : "") + (c.help && c.help.length <= 12 ? ` <span class="unit-hint">(${esc(c.help)})</span>` : "");
        return `<th class="${c.num ? "num " : ""}${c.cls || ""}" aria-sort="${aria}"${c.help && c.help.length > 12 ? ` title="${esc(c.help)}"` : ""}><button type="button" class="sort" data-hsort="${card.key}:${c.key}">${label}${active ? (s.dir > 0 ? " ▲" : " ▼") : ""}</button></th>`;
      }).join("") + (o.editable ? `<th class="col-act"><span class="sr-only">Actions</span></th>` : "");
      const body = rows.map(r => `<tr data-id="${esc(r.id)}" class="${r.pf ? "pf-new" : ""}${o.rowClass ? " " + o.rowClass(r) : ""}">` + cols.map(c => {
        const editable = canEdit(c, r);
        const derived = c.derivedNote && c.editable && !c.editable(r);
        const title = editable ? `Click to edit${c.unit === "$K" ? " ($K)" : ""}` : derived ? c.derivedNote : "";
        let text = esc(show(c, r));
        if (c.key === "name" && o.badge) text = o.badge(r) + text;
        if (c.key === "name" && o.suffix) text += o.suffix(r);
        return `<td class="${c.num ? "num " : ""}${c.cls || ""}${c.wrap ? " wrap-sm" : ""}${editable ? " editable" : ""}${derived ? " derived" : ""}"${editable ? ` data-edit="${c.key}" data-card="${card.key}" tabindex="0"` : ""}${title ? ` title="${esc(title)}"` : ""}>${text}</td>`;
      }).join("") + (o.editable ? `<td class="col-act"><button type="button" class="link danger" data-hdel="${esc(r.id)}" aria-label="Delete ${esc(r.name)}">Delete</button></td>` : "") + "</tr>").join("");
      const total = `<tr class="subtotal">` + cols.map(c => `<td class="${c.num ? "num " : ""}${c.cls || ""}">${totalCell(c, rows, card.title + " subtotal")}</td>`).join("") + (o.editable ? `<td class="col-act"></td>` : "") + "</tr>";
      const empty = rows.length ? "" : `<tr><td class="col-name muted" colspan="${cols.length + (o.editable ? 1 : 0)}">No holdings in this class.</td></tr>`;
      const add = o.editable ? `<tfoot><tr class="addrow"><td colspan="${cols.length + 1}"><div class="addrow-inner"><button type="button" class="btn" data-hadd="${card.key}">Add holding</button></div></td></tr></tfoot>` : "";
      return `<thead><tr>${head}</tr></thead><tbody>${empty}${body}${rows.length ? total : ""}</tbody>${add}`;
    }

    function cardHtml(card) {
      const rows = rowsFor(card);
      if (!rows.length && !o.editable) return "";
      const mv = sum(rows, "mv");
      const id = `${o.prefix}-${card.key}`;
      const toggle = hasToggle(card) ? `<button type="button" class="btn btn-toggle" data-hcols="${card.key}" aria-pressed="${!!ui.allCols[card.key]}">${ui.allCols[card.key] ? "Compact view" : "All columns"}</button>` : "";
      return `<section class="card hc" data-card="${card.key}" aria-labelledby="${id}-h">
        <div class="card-header">
          <h2 id="${id}-h">${esc(card.title)} <span class="h-count muted">${rows.length} ${rows.length === 1 ? "holding" : "holdings"} · ${Fmt.millions(mv)} · ${Fmt.pct(div(mv, ctx.nav), 1)} of NAV</span></h2>
          <div class="card-actions">${toggle}<button type="button" class="btn" data-hcsv="${card.key}">Download CSV</button></div>
        </div>
        <p class="note">${o.editable ? "Click a cell to edit. " : ""}${esc(card.note)}</p>
        <div class="table-wrap"><table class="grid hold" data-table="${card.key}">${tableHtml(card)}</table></div>
      </section>`;
    }

    function totalHtml() {
      const lines = CARDS.map(c => ({ c, rows: rowsFor(c) })).filter(x => x.rows.length);
      const total = sum(ctx.rows, "mv");
      const ok = Math.abs(total - ctx.nav) < 0.5;
      return `<section class="card hc-total" aria-labelledby="${o.prefix}-total-h">
        <div class="card-header"><h2 id="${o.prefix}-total-h">Total</h2></div>
        <div class="table-wrap"><table class="grid hold-total"><thead><tr><th class="col-name">Asset class</th><th class="num">Holdings</th><th class="num">Market value <span class="unit-hint">($K)</span></th><th class="num">% NAV</th></tr></thead>
          <tbody>${lines.map(x => `<tr><td class="col-name">${esc(x.c.title)}</td><td class="num">${x.rows.length}</td><td class="num">${Fmt.thousands(sum(x.rows, "mv"))}</td><td class="num">${Fmt.pct(div(sum(x.rows, "mv"), ctx.nav), 1)}</td></tr>`).join("")}
          <tr class="grandtotal"><td class="col-name">Total (NAV)</td><td class="num">${ctx.rows.length}</td><td class="num">${Fmt.thousands(total)}</td><td class="num">${Fmt.pct(div(total, ctx.nav), 1)}</td></tr></tbody></table></div>
        <p class="note">${ok ? `The asset-class subtotals add to NAV, ${esc(Fmt.dollars(ctx.nav))}.` : `Subtotals ${esc(Fmt.dollars(total))} differ from NAV ${esc(Fmt.dollars(ctx.nav))}.`}</p>
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

    function addHolding(card) {
      const d = card.newHolding;
      ctx.state.holdings.push(Object.assign({
        id: "h-" + Date.now().toString(36), asset_class: d.asset_class, name: "New holding", ticker_or_id: "",
        security_type: d.security_type, sector: d.asset_class === "cash" ? "Cash" : "", price_or_mark: 0, quantity: 0,
        market_value: null, cost: null, commitment: null, unfunded: 0, call_schedule: null,
        liquidity_bucket: d.liquid ? "liquid_now" : "3y_plus", liquidity_date: d.liquid ? Fmt.today() : null,
        mark_source: "Manual entry", mark_date: Fmt.today()
      }, d.extra || {}));
      ctx.onChange(true);
    }

    function downloadCsv(card) {
      const rows = rowsFor(card);
      const q = v => { const s = blank(v) ? "" : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
      const cols = card.cols;
      const lines = [q("Sample data. All holdings, ideas and figures are illustrative. Amounts in USD."),
        cols.map(c => q(c.label)).join(","),
        ...rows.map(r => cols.map(c => { const v = c.value(r); return q(typeof v === "number" ? +v.toFixed(6) : typeof v === "object" && v ? show(c, r) : v); }).join(","))];
      const blob = new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `sandune-${card.key}-sample-${ctx.state.as_of}.csv`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
    }

    function bind(container) {
      if (ui.bound) return;
      ui.bound = true;
      container.addEventListener("click", e => {
        const t = e.target;
        const s = t.closest("[data-hsort]");
        if (s) {
          const [cardKey, key] = s.dataset.hsort.split(":");
          const cur = ui.sort[cardKey];
          ui.sort[cardKey] = cur && cur.key === key ? { key, dir: -cur.dir } : { key, dir: 1 };
          return ctx.onChange(false);
        }
        const tog = t.closest("[data-hcols]");
        if (tog) { ui.allCols[tog.dataset.hcols] = !ui.allCols[tog.dataset.hcols]; return ctx.onChange(false); }
        const csv = t.closest("[data-hcsv]");
        if (csv) return downloadCsv(CARDS.find(c => c.key === csv.dataset.hcsv));
        const add = t.closest("[data-hadd]");
        if (add) return addHolding(CARDS.find(c => c.key === add.dataset.hadd));
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
      container.innerHTML = CARDS.map(cardHtml).join("") + totalHtml();
    }

    return { render, CARDS };
  }

  root.Holdings = { create, CARDS, derive };
})(window);
