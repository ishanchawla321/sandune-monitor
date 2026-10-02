// Migrates investments and themes saved under older shapes to the current fields, keeping the text that
// moves to a new section. Runs on every load (Store) and on anything new (intake); safe to run twice.
//
// History of shapes, oldest first:
//   assumptions[] (text + status)        -> key_notes[]
//   triggers[] / change_my_mind[]        -> dropped (section removed)
//   doc_flags[] / diligence_documents[] / diligence_other[]  -> diligence[] (strings; done items keep their date)
//   terms_notes + entry_costs            -> terms (one text block)
//   signals[], tickers[]                 -> dropped (section removed)
//   theme.why_now                        -> theme.industry_context
//   theme.value_chain[].who_captures_value -> .description, plus .companies
//   theme.watch_public[] (tickers)       -> [{ company, ticker, market_cap }]
//   theme.watch_private[] (names)        -> [{ company, ownership }]
//   theme.contacts[]                     -> folded into key_notes as one "Contacts (roles): ..." bullet
//   theme.signals, decision_log          -> dropped (sections removed)
// Pure functions, no DOM. Works in the browser (window.Migrate) and in Node.
(function (root) {
  "use strict";

  const text = x => (typeof x === "string" ? x : x && typeof x.text === "string" ? x.text : "").trim();
  const strings = list => (Array.isArray(list) ? list.map(text).filter(Boolean) : []);
  const str = v => (typeof v === "string" ? v.trim() : "");

  // Diligence items from any older shape become plain lines; a done item keeps its date in the text.
  function diligenceLines(list) {
    if (!Array.isArray(list)) return [];
    return list.map(x => {
      if (x && typeof x === "object" && typeof x.text === "string") return x.text.trim() + (x.done ? ` (done ${x.done})` : "");
      return text(x);
    }).filter(Boolean);
  }

  function investment(i) {
    i.key_notes = strings(i.key_notes).concat(strings(i.assumptions));
    delete i.assumptions;
    delete i.triggers;
    delete i.change_my_mind;
    delete i.signals;
    delete i.tickers;
    i.diligence = strings(i.diligence).concat(diligenceLines(i.doc_flags), diligenceLines(i.diligence_documents), diligenceLines(i.diligence_other));
    delete i.doc_flags; delete i.diligence_documents; delete i.diligence_other;
    if (typeof i.terms !== "string") {
      const parts = [str(i.terms_notes), str(i.entry_costs) ? "Entry costs: " + str(i.entry_costs) : ""].filter(Boolean);
      i.terms = parts.join("\n");
    }
    delete i.terms_notes; delete i.entry_costs;
    if (typeof i.company_overview !== "string") i.company_overview = "";
    i.contacts = strings(i.contacts);
    i.decision_log = Array.isArray(i.decision_log) ? i.decision_log : [];
    return i;
  }

  function theme(t) {
    t.key_notes = strings(t.key_notes).concat(strings(t.assumptions));
    delete t.assumptions;
    delete t.triggers;
    delete t.change_my_mind;
    if (typeof t.description !== "string") t.description = "";
    if (typeof t.industry_context !== "string") t.industry_context = str(t.why_now);
    delete t.why_now;
    t.value_chain = (Array.isArray(t.value_chain) ? t.value_chain : []).map(v => ({
      segment: str(v.segment),
      description: typeof v.description === "string" ? v.description.trim() : str(v.who_captures_value),
      companies: str(v.companies)
    })).filter(v => v.segment || v.description);
    t.watch_public = (Array.isArray(t.watch_public) ? t.watch_public : []).map(x => (typeof x === "string"
      ? { company: x.trim().toUpperCase(), ticker: x.trim().toUpperCase(), market_cap: null }
      : { company: str(x.company) || str(x.ticker).toUpperCase(), ticker: str(x.ticker).toUpperCase(), market_cap: isFinite(x.market_cap) && x.market_cap !== null ? Number(x.market_cap) : null }))
      .filter(x => x.ticker || x.company);
    t.watch_private = (Array.isArray(t.watch_private) ? t.watch_private : []).map(x => (typeof x === "string"
      ? { company: x.trim(), ownership: "—" }
      : { company: str(x.company), ownership: str(x.ownership) || "—" })).filter(x => x.company);
    const contacts = strings(t.contacts);
    if (contacts.length) t.key_notes.push("Contacts (roles): " + contacts.join("; "));
    delete t.contacts;
    delete t.signals;
    delete t.decision_log;
    t.linked_investment_ids = Array.isArray(t.linked_investment_ids) ? t.linked_investment_ids : [];
    return t;
  }

  function state(s) {
    (s.investments || []).forEach(investment);
    (s.themes || []).forEach(theme);
    return s;
  }

  const Migrate = { state, investment, theme };
  if (typeof module !== "undefined" && module.exports) module.exports = Migrate;
  else root.Migrate = Migrate;
})(typeof window !== "undefined" ? window : this);
