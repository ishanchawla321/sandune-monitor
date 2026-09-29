// App shell: state, tabs, reset. Each tab module renders from the shared state.
(function (root) {
  "use strict";

  let state = root.Store.load();
  const TABS = ["portfolio", "ideas", "proforma"];

  let active = "portfolio";

  // Only the visible tab renders; switching tabs re-renders from the shared state.
  function render() {
    if (active === "portfolio") root.Portfolio.render(state, onChange);
    if (active === "ideas") root.Ideas.render(state, onChange);
  }

  // persist = true for data edits; false for view-only changes (sort, expand, cancelled edit).
  function onChange(persist) {
    if (persist) root.Store.save(state);
    render();
  }

  function showTab(name) {
    TABS.forEach(t => {
      const tab = document.getElementById("tabbtn-" + t);
      const panel = document.getElementById("tab-" + t);
      const on = t === name;
      tab.setAttribute("aria-selected", on);
      tab.tabIndex = on ? 0 : -1;
      panel.hidden = !on;
    });
    try { root.localStorage.setItem("sandune-monitor.tab", name); } catch (e) { /* ignore */ }
    active = name;
    render();
  }

  document.querySelector(".tabs").addEventListener("click", e => {
    const btn = e.target.closest("[role=tab]");
    if (btn) showTab(btn.id.replace("tabbtn-", ""));
  });
  document.querySelector(".tabs").addEventListener("keydown", e => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const current = TABS.findIndex(t => document.getElementById("tabbtn-" + t).getAttribute("aria-selected") === "true");
    const next = TABS[(current + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length];
    showTab(next);
    document.getElementById("tabbtn-" + next).focus();
  });

  document.getElementById("reset").addEventListener("click", () => {
    if (!root.confirm("Discard all edits and reload the sample data?")) return;
    state = root.Store.reset();
    render();
  });

  let start = "portfolio";
  try { start = root.localStorage.getItem("sandune-monitor.tab") || start; } catch (e) { /* ignore */ }
  showTab(TABS.includes(start) ? start : "portfolio");
})(window);
