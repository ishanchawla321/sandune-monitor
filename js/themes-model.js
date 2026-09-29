// Themes: link bookkeeping and roll-up stats. Pure functions, no DOM.
// An investment belongs to at most one theme. investment.theme_id and theme.linked_investment_ids
// are kept in sync in both directions: every change goes through setTheme(), and sync() repairs
// anything loaded from storage.
(function (root) {
  "use strict";

  const Metrics = root.Metrics;

  function sync(state) {
    const themes = state.themes || (state.themes = []);
    const invById = new Map(state.investments.map(i => [i.id, i]));
    const themeIds = new Set(themes.map(t => t.id));
    // A theme that lists an investment with no theme of its own claims it.
    themes.forEach(t => (t.linked_investment_ids || []).forEach(id => {
      const inv = invById.get(id);
      if (inv && !inv.theme_id) inv.theme_id = t.id;
    }));
    // theme_id pointing at a missing theme is cleared.
    state.investments.forEach(i => { if (i.theme_id && !themeIds.has(i.theme_id)) i.theme_id = null; });
    // Rebuild each list from theme_id, keeping the existing order first.
    themes.forEach(t => {
      const keep = (t.linked_investment_ids || []).filter(id => invById.has(id) && invById.get(id).theme_id === t.id);
      const extra = state.investments.filter(i => i.theme_id === t.id && !keep.includes(i.id)).map(i => i.id);
      t.linked_investment_ids = keep.concat(extra);
    });
  }

  // Update both sides together: drop the investment from every theme's list, then add it to the new one.
  // (Changing only theme_id would let sync() re-claim an unlinked investment from the old list.)
  function setTheme(state, investmentId, themeId) {
    const inv = state.investments.find(i => i.id === investmentId);
    if (!inv) return;
    (state.themes || []).forEach(t => {
      t.linked_investment_ids = (t.linked_investment_ids || []).filter(id => id !== investmentId);
      if (t.id === themeId) t.linked_investment_ids.push(investmentId);
    });
    inv.theme_id = themeId || null;
    sync(state);
  }

  function linked(state, theme) {
    return (theme.linked_investment_ids || []).map(id => state.investments.find(i => i.id === id)).filter(Boolean);
  }

  // Linked count, total check size, check-weighted liquidity score, and at-risk/broken assumption counts:
  // flagged = the theme's own, invFlagged = summed across its linked investments.
  function stats(state, theme) {
    const invs = linked(state, theme);
    const check = invs.reduce((s, i) => s + (Number(i.check_size) || 0), 0);
    const weighted = invs.reduce((s, i) => s + Metrics.liquidityScore(i) * (Number(i.check_size) || 0), 0);
    const bad = list => (list || []).filter(a => a.status === "at_risk" || a.status === "broken").length;
    const invFlagged = invs.reduce((s, i) => s + bad(i.assumptions), 0);
    return { count: invs.length, check, blended: check ? weighted / check : null, flagged: bad(theme.assumptions), invFlagged };
  }

  root.ThemesModel = { sync, setTheme, linked, stats };
})(window);
