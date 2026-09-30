// App shell: state, navigation, reset. Each tab module renders from the shared state.
// Navigation is two-level: a section (Opportunities, Portfolio) and a tab inside it.
// A tab is addressed as "section/tab", e.g. "portfolio/current".
(function (root) {
  "use strict";

  let state = root.Store.load();
  const SECTIONS = {
    opportunities: ["opportunities/themes", "opportunities/ideas"],
    portfolio: ["portfolio/current", "portfolio/proforma"]
  };
  const TABS = SECTIONS.opportunities.concat(SECTIONS.portfolio);
  const PANEL = { "opportunities/themes": "tab-themes", "opportunities/ideas": "tab-ideas",
                  "portfolio/current": "tab-portfolio", "portfolio/proforma": "tab-proforma" };
  const TAB_KEY = "sandune-monitor.tab.v2";
  // Tab names saved by the previous single-level navigation.
  const LEGACY = { portfolio: "portfolio/current", ideas: "opportunities/ideas", proforma: "portfolio/proforma" };

  let active = "opportunities/themes";
  const sectionOf = tab => tab.split("/")[0];

  // Only the visible tab renders; switching tabs re-renders from the shared state.
  function render() {
    root.ThemesModel.sync(state);
    if (active === "portfolio/current") root.Portfolio.render(state, onChange);
    if (sectionOf(active) === "opportunities") root.Ideas.render(state, onChange, active.split("/")[1]);
    if (active === "portfolio/proforma") root.ProForma.render(state, onChange);
  }

  // persist = true for data edits; false for view-only changes (sort, expand, cancelled edit).
  function onChange(persist) {
    if (persist) root.Store.save(state);
    render();
  }

  function paintNav(tab) {
    const section = sectionOf(tab);
    document.querySelectorAll(".nav-top [role=tab]").forEach(b => {
      const on = b.dataset.section === section;
      b.setAttribute("aria-selected", on);
      b.tabIndex = on ? 0 : -1;
    });
    document.querySelectorAll(".nav-sub").forEach(nav => { nav.hidden = nav.dataset.section !== section; });
    TABS.forEach(t => {
      const btn = document.querySelector(`[data-tab="${t}"]`);
      const on = t === tab;
      btn.setAttribute("aria-selected", on);
      btn.tabIndex = on ? 0 : -1;
      document.getElementById(PANEL[t]).hidden = !on;
    });
  }

  function showTab(name) {
    if (!TABS.includes(name)) name = TABS[0];
    paintNav(name);
    try { root.localStorage.setItem(TAB_KEY, name); } catch (e) { /* ignore */ }
    active = name;
    render();
  }

  // Each section remembers which of its tabs was open last.
  const lastInSection = {};
  function showSection(section) {
    showTab(lastInSection[section] || SECTIONS[section][0]);
  }

  document.querySelector(".app-header").addEventListener("click", e => {
    const top = e.target.closest(".nav-top [role=tab]");
    if (top) { lastInSection[sectionOf(active)] = active; return showSection(top.dataset.section); }
    const sub = e.target.closest(".nav-sub [role=tab]");
    if (sub) showTab(sub.dataset.tab);
  });
  document.querySelector(".app-header").addEventListener("keydown", e => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const list = e.target.closest(".nav-top") ? Object.keys(SECTIONS) : e.target.closest(".nav-sub") ? SECTIONS[sectionOf(active)] : null;
    if (!list) return;
    const cur = e.target.closest(".nav-top") ? sectionOf(active) : active;
    const next = list[(list.indexOf(cur) + (e.key === "ArrowRight" ? 1 : list.length - 1)) % list.length];
    if (e.target.closest(".nav-top")) { lastInSection[sectionOf(active)] = active; showSection(next); document.getElementById("secbtn-" + next).focus(); }
    else { showTab(next); document.querySelector(`[data-tab="${next}"]`).focus(); }
  });

  document.getElementById("reset").addEventListener("click", () => {
    if (!root.confirm("Discard all edits and reload the sample data?")) return;
    state = root.Store.reset();
    render();
  });

  // Price source toggle. Quotes arrive asynchronously; if the viewer is typing in a field,
  // the re-render waits until they leave it so their edit isn't wiped.
  function paintPriceToggle() {
    document.querySelectorAll("[data-price-mode]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.priceMode === root.Prices.mode())));
    document.getElementById("price-status").textContent = root.Prices.statusText();
  }
  function renderWhenIdle() {
    const el = document.activeElement;
    if (el && el.closest && el.closest("main") && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) {
      el.addEventListener("blur", () => setTimeout(render, 0), { once: true });
    } else {
      render();
    }
  }
  root.Prices.onUpdate(() => { paintPriceToggle(); renderWhenIdle(); });
  document.querySelector(".price-toggle").addEventListener("click", e => {
    const b = e.target.closest("[data-price-mode]");
    if (b) root.Prices.setMode(b.dataset.priceMode, state);
  });
  root.Prices.init(state);
  paintPriceToggle();

  root.App = { showTab, active: () => active };

  let start = TABS[0];
  try {
    const saved = root.localStorage.getItem(TAB_KEY) || LEGACY[root.localStorage.getItem("sandune-monitor.tab")];
    if (saved) start = saved;
  } catch (e) { /* ignore */ }
  showTab(start);
})(window);
