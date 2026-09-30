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
let Positions = null;
try { Positions = require(path.join(repo, "js/positions.js")); } catch (e) { /* not built yet */ }

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
// A-C tick investments in the selector; D adds the "AI and automation" theme through the Add theme
// dropdown (ProFormaModel.themeSelections, the same function the tab calls): Legal AI $1.0M at 100%
// funded and the RPA loan $1.0M at 65% funded, both from cash.
const sel = (ids, source) => Object.fromEntries(ids.map(id => [id, { include: true, source: source || "cash" }]));
const CASES = {
  "A: car wash + RPA loan from cash": { sel: sel(["i-carwash", "i-rpa"]), dp: 17.75, il: 52.89, sector: "Technology", sectorPct: 20.38 },
  "B: car wash + RPA loan + BWAY + STIM from cash": { sel: sel(["i-carwash", "i-rpa", "i-bway", "i-stim"]), dp: 17.65, il: 52.89, sector: "Technology", sectorPct: 20.38 },
  "C: car wash funded by selling Apple": { sel: sel(["i-carwash"], "h-aapl"), dp: 18.95, il: 50.88, sector: "Technology", sectorPct: 17.07 },
  "D: AI and automation theme added via Add theme": { sel: PFM.themeSelections(state, "t-ai"), dp: 17.75, il: 52.89, sector: "Technology", sectorPct: 22.39 }
};
const dSel = CASES["D: AI and automation theme added via Add theme"].sel;
check("Case D: theme adds two investments", Object.keys(dSel).length, 2, 0);
check("Case D: Legal AI funded %", (dSel["i-legalai"] || {}).funded_pct, 1, 0);
check("Case D: RPA loan funded %", (dSel["i-rpa"] || {}).funded_pct, 0.65, 0);
check("Case D: both from cash", Object.values(dSel).every(s => s.source === "cash") ? 1 : 0, 1, 0);
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
