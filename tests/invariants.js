// Invariant checks for the seed book, run with: node tests/invariants.js
// These numbers were hand-checked in Seed price mode and must hold after every change.
// Never adjust the expected values to match the code.
"use strict";
const vm = require("vm"), fs = require("fs"), path = require("path");

const repo = path.join(__dirname, "..");
const ctx = { window: {}, console };
ctx.window.window = ctx.window;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(repo, "data/seed.js"), "utf8"), ctx, { filename: "data/seed.js" });
const Metrics = require(path.join(repo, "js/metrics.js"));
const PFM = require(path.join(repo, "js/proforma-model.js"));
const Positions = require(path.join(repo, "js/positions.js"));
const Invest = require(path.join(repo, "js/invest-model.js"));

const state = JSON.parse(JSON.stringify(ctx.window.SEED));
let failures = 0;
const check = (label, actual, expected, tol) => {
  const ok = Math.abs(actual - expected) <= (tol === undefined ? 0.5 : tol);
  console.log(`${ok ? "ok  " : "FAIL"} ${label}: ${actual}${ok ? "" : " (expected " + expected + ")"}`);
  if (!ok) failures++;
};
const r2 = v => Math.round(v * 100) / 100;

// ---- Current book ----
const m = Metrics.summary(state.holdings, state.settings, state.as_of);
check("Current NAV", Math.round(m.nav), 49748585, 0);
check("Dry powder", Math.round(m.dry_powder.total), 19749461, 0);

// ---- Pro Forma cases A-D (Seed mode). Expected $M / % to two decimals. ----
// Each case ticks investments in the Pro Forma checklist at their default check size and funded %
// (Legal AI $1.0M at 100%, RPA loan $1.0M at 65%, car wash $1.0M at 100%, BWAY and STIM $250K at 100%).
const sel = (ids, source) => Object.fromEntries(ids.map(id => [id, { include: true, source: source || "cash" }]));
const CASES = {
  "A: car wash + RPA loan from cash": { sel: sel(["i-carwash", "i-rpa"]), dp: 17.75, il: 52.89, sector: "Technology", sectorPct: 20.38 },
  "B: car wash + RPA loan + BWAY + STIM from cash": { sel: sel(["i-carwash", "i-rpa", "i-bway", "i-stim"]), dp: 17.65, il: 52.89, sector: "Technology", sectorPct: 20.38 },
  "C: car wash funded by selling Apple": { sel: sel(["i-carwash"], "h-aapl"), dp: 18.95, il: 50.88, sector: "Technology", sectorPct: 17.07 },
  "D: Legal AI + RPA loan ticked, from cash": { sel: sel(["i-legalai", "i-rpa"]), dp: 17.75, il: 52.89, sector: "Technology", sectorPct: 22.39 }
};
check("Case D: Legal AI default funded %", PFM.defaultSelection(state.investments.find(i => i.id === "i-legalai")).funded_pct, 1, 0);
check("Case D: RPA loan default funded %", PFM.defaultSelection(state.investments.find(i => i.id === "i-rpa")).funded_pct, 0.65, 0);
Object.entries(CASES).forEach(([name, c]) => {
  const pf = PFM.apply(state, c.sel);
  const a = Metrics.summary(pf.holdings, state.settings, state.as_of);
  check(`Case ${name}: dry powder $M`, r2(a.dry_powder.total / 1e6), c.dp, 0);
  check(`Case ${name}: illiquid incl. unfunded %`, r2(a.illiquid.pct_incl_unfunded * 100), c.il, 0);
  const ls = a.largest_sector || { sector: "(none)", pct: 0 };
  const sectorOk = ls.sector === c.sector;
  console.log(`${sectorOk ? "ok  " : "FAIL"} Case ${name}: largest sector: ${ls.sector}${sectorOk ? "" : " (expected " + c.sector + ")"}`);
  if (!sectorOk) failures++;
  check(`Case ${name}: largest sector %`, r2(ls.pct * 100), c.sectorPct, 0);
});

// ---- Marking an idea Invested posts to the book; reversing restores it exactly ----
{
  const s2 = JSON.parse(JSON.stringify(state));
  const carwash = s2.investments.find(i => i.id === "i-carwash");
  const cashOf = st => st.holdings.find(h => h.id === "h-cash").price_or_mark;
  const cash0 = cashOf(s2), nHold = s2.holdings.length, nTx = s2.transactions.length;
  Invest.execute(s2, carwash, { date: s2.as_of, amount: 1000000, source: "cash" });
  const cur = Metrics.summary(s2.holdings, s2.settings, s2.as_of);
  check("Invested car wash: cash down $1.0M", cash0 - cashOf(s2), 1000000, 0.005);
  check("Invested car wash: NAV unchanged", Math.round(cur.nav), 49748585, 0);
  const h = cur.holdings.find(x => x.id === carwash.holding_id);
  const inDirects = h && h.asset_class === "direct" ? 1 : 0;
  check("Invested car wash: holding appears in Directs / co-invests", inDirects, 1, 0);
  check("Invested car wash: holding carried at $1.0M", h ? Math.round(h.market_value) : 0, 1000000, 0);
  check("Invested car wash: one blotter entry posted", s2.transactions.length - nTx, 1, 0);
  // Current now matches Case A's car wash leg (car wash alone, from cash, in Pro Forma on the seed book).
  const legA = Metrics.summary(PFM.apply(state, sel(["i-carwash"])).holdings, state.settings, state.as_of);
  check("Invested car wash: dry powder matches Case A car wash leg", Math.round(cur.dry_powder.total), Math.round(legA.dry_powder.total), 0);
  check("Invested car wash: illiquid incl. unfunded matches Case A car wash leg", r2(cur.illiquid.pct_incl_unfunded * 100), r2(legA.illiquid.pct_incl_unfunded * 100), 0);
  check("Invested car wash: no holding out of line with the blotter", Positions.reconcile(s2.holdings, s2.transactions, s2.as_of).length, 0, 0);
  Invest.reverse(s2, carwash);
  const back = Metrics.summary(s2.holdings, s2.settings, s2.as_of);
  check("Reversed: NAV", Math.round(back.nav), 49748585, 0);
  check("Reversed: dry powder", Math.round(back.dry_powder.total), 19749461, 0);
  check("Reversed: cash balance", cashOf(s2), cash0, 0.005);
  check("Reversed: holdings count", s2.holdings.length, nHold, 0);
  check("Reversed: blotter count", s2.transactions.length, nTx, 0);
  check("Reversed: funding record cleared", carwash.funding ? 1 : 0, 0, 0);
}

// ---- Funding any prospective investment matches Pro Forma with only that investment ticked (Seed mode) ----
// For every prospective investment and two funding sources: mark it funded at its default amount and compare
// Portfolio > Current with Pro Forma on the seed book, then reverse and confirm the seed figures.
{
  const cashOf = st => st.holdings.find(h => h.id === "h-cash").price_or_mark;
  const summarize = (hs, st) => Metrics.summary(hs, st.settings, st.as_of);
  const same = (label, a, b, tol) => check(label, a, b, tol === undefined ? 0.5 : tol);
  const prospective = PFM.prospective(state);
  check("Prospective investments to fund", prospective.length, 5, 0);
  prospective.forEach(inv => ["cash", "h-aapl"].forEach(source => {
    const tag = `${inv.name} from ${source === "cash" ? "cash" : "Apple"}`;
    const s2 = JSON.parse(JSON.stringify(state));
    const i2 = s2.investments.find(x => x.id === inv.id);
    Invest.execute(s2, i2, { date: s2.as_of, amount: Invest.defaultAmount(i2), source });
    const cur = summarize(s2.holdings, s2);
    const pfHoldings = PFM.apply(state, { [inv.id]: { include: true, source } }).holdings;
    const pf = summarize(pfHoldings, state);
    same(`Fund ${tag}: cash`, cashOf(s2), pfHoldings.find(h => h.security_type === "cash").price_or_mark);
    same(`Fund ${tag}: unfunded`, cur.unfunded, pf.unfunded);
    same(`Fund ${tag}: dry powder`, cur.dry_powder.total, pf.dry_powder.total);
    same(`Fund ${tag}: illiquid %`, cur.illiquid.pct, pf.illiquid.pct, 1e-9);
    same(`Fund ${tag}: illiquid % incl. unfunded`, cur.illiquid.pct_incl_unfunded, pf.illiquid.pct_incl_unfunded, 1e-9);
    const lpOk = cur.largest_position.holding.name === pf.largest_position.holding.name ? 1 : 0;
    check(`Fund ${tag}: largest position name (${cur.largest_position.holding.name})`, lpOk, 1, 0);
    same(`Fund ${tag}: largest position %`, cur.largest_position.pct, pf.largest_position.pct, 1e-9);
    check(`Fund ${tag}: largest sector name (${cur.largest_sector.sector})`, cur.largest_sector.sector === pf.largest_sector.sector ? 1 : 0, 1, 0);
    same(`Fund ${tag}: largest sector %`, cur.largest_sector.pct, pf.largest_sector.pct, 1e-9);
    same(`Fund ${tag}: year-1 capital calls`, cur.ladder[1].calls, pf.ladder[1].calls);
    Invest.reverse(s2, i2);
    const back = summarize(s2.holdings, s2);
    check(`Reverse ${tag}: NAV`, Math.round(back.nav), 49748585, 0);
    check(`Reverse ${tag}: dry powder`, Math.round(back.dry_powder.total), 19749461, 0);
  }));
}

// ---- Migration is idempotent ----
{
  const Migrate = require(path.join(repo, "js/migrate.js"));
  const once = Migrate.state(JSON.parse(JSON.stringify(ctx.window.SEED)));
  const twice = Migrate.state(JSON.parse(JSON.stringify(once)));
  check("Migration twice equals once", JSON.stringify(twice) === JSON.stringify(once) ? 1 : 0, 1, 0);
  const legacy = { investments: [{ id: "x", assumptions: [{ text: "A", status: "intact" }], triggers: ["B"], doc_flags: ["C"], signals: [] }], themes: [{ id: "t", assumptions: [{ text: "D" }], triggers: ["E"] }] };
  const l1 = Migrate.state(JSON.parse(JSON.stringify(legacy)));
  const l2 = Migrate.state(JSON.parse(JSON.stringify(l1)));
  check("Legacy migration keeps text", l1.investments[0].key_notes[0] === "A" && l1.investments[0].change_my_mind[0] === "B" && l1.investments[0].diligence_documents[0].text === "C" && l1.themes[0].key_notes[0] === "D" ? 1 : 0, 1, 0);
  check("Legacy migration twice equals once", JSON.stringify(l2) === JSON.stringify(l1) ? 1 : 0, 1, 0);
}

// ---- Blotter reconciles to the book ----
if (Positions && Array.isArray(state.transactions)) {
  const pos = Positions.compute(state.holdings, state.transactions, state.as_of);
  state.holdings.forEach(h => {
    const p = pos[h.id];
    if (!p || !p.n_tx) { console.log(`FAIL ${h.id}: no transactions`); failures++; return; }
    if (Metrics.isPriced(h)) check(`${h.id} quantity from blotter`, p.quantity, Number(h.quantity), 1e-6);
    if (h.security_type !== "cash") check(`${h.id} cost basis from blotter`, p.cost_basis, Number(h.cost), 0.005);
    if (h.commitment) check(`${h.id} unfunded from blotter`, h.commitment - p.paid_in, Number(h.unfunded), 0.005);
  });
  const rec = Positions.reconcile(state.holdings, state.transactions, state.as_of);
  check("Holdings out of line with the blotter", rec.length, 0, 0);
} else {
  console.log("skip blotter reconciliation (positions engine or transactions not present)");
}

console.log(failures ? `\n${failures} FAILURE(S)` : "\nAll invariants hold.");
process.exit(failures ? 1 : 0);
