// Themes: link bookkeeping. Pure functions, no DOM.
// An investment belongs to at most one theme. investment.theme_id and theme.linked_investment_ids
// are kept in sync in both directions: every change goes through setTheme(), and sync() repairs
// anything loaded from storage.
(function (root) {
  "use strict";

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

  root.ThemesModel = { sync, setTheme, linked };
})(window);
