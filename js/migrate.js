// Migrates investments and themes saved under older shapes to the current fields, keeping every piece of text:
//   assumptions[] (text + intact/at-risk/broken status) -> key_notes[] (plain strings)
//   triggers[]                                          -> change_my_mind[]
//   doc_flags[]                                         -> diligence_documents[] ({ id, text, done: null })
//   signals[].assumption_id                             -> dropped (signals are dated notes)
// Runs on every load (Store) and on anything new (intake), so it is safe to call twice.
// Pure functions, no DOM. Works in the browser (window.Migrate) and in Node.
(function (root) {
  "use strict";

  const text = x => (typeof x === "string" ? x : x && typeof x.text === "string" ? x.text : "").trim();
  const strings = list => (Array.isArray(list) ? list.map(text).filter(Boolean) : []);
  let seq = 0;
  const newId = prefix => `${prefix}-${Date.now().toString(36)}${(seq++).toString(36)}`;

  // Diligence items: { id, text, done: null | "YYYY-MM-DD" }. Strings become open items.
  function items(list, prefix) {
    if (!Array.isArray(list)) return [];
    return list.map(x => {
      if (x && typeof x === "object" && typeof x.text === "string") {
        return { id: x.id || newId(prefix), text: x.text.trim(), done: x.done || null };
      }
      const t = text(x);
      return t ? { id: newId(prefix), text: t, done: null } : null;
    }).filter(x => x && x.text);
  }

  function lists(o, prefix) {
    o.key_notes = strings(o.key_notes).concat(strings(o.assumptions));
    o.change_my_mind = strings(o.change_my_mind).concat(strings(o.triggers));
    o.contacts = strings(o.contacts);
    o.signals = (Array.isArray(o.signals) ? o.signals : []).map(s => {
      const c = Object.assign({}, s);
      delete c.assumption_id;
      return c;
    });
    o.decision_log = Array.isArray(o.decision_log) ? o.decision_log : [];
    delete o.assumptions;
    delete o.triggers;
  }

  function investment(i) {
    lists(i, i.id + "-d");
    i.diligence_documents = items(i.diligence_documents, i.id + "-dd").concat(items(i.doc_flags, i.id + "-dd"));
    i.diligence_other = items(i.diligence_other, i.id + "-do");
    delete i.doc_flags;
    i.tickers = strings(i.tickers);
    return i;
  }

  function theme(t) {
    lists(t, t.id + "-n");
    t.value_chain = Array.isArray(t.value_chain) ? t.value_chain.filter(v => v && (v.segment || v.who_captures_value)) : [];
    t.watch_public = strings(t.watch_public);
    t.watch_private = strings(t.watch_private);
    t.linked_investment_ids = Array.isArray(t.linked_investment_ids) ? t.linked_investment_ids : [];
    return t;
  }

  function state(s) {
    (s.investments || []).forEach(investment);
    (s.themes || []).forEach(theme);
    return s;
  }

  const Migrate = { state, investment, theme, items };
  if (typeof module !== "undefined" && module.exports) module.exports = Migrate;
  else root.Migrate = Migrate;
})(typeof window !== "undefined" ? window : this);
