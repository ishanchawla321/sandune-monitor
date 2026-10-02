// Status moves on an investment that have side effects beyond the status itself: Pass, and Move back to
// prospective (from Passed, or from Completed where the funding is reversed). Pure functions, no DOM.
// The decision log line is written here so both the card buttons and the status pill produce the same record.
(function (root) {
  "use strict";

  const Invest = root.InvestModel || (typeof require !== "undefined" ? require("./invest-model.js") : null);
  const PROSPECTIVE = ["watching", "researching", "IC"];

  function log(inv, from, to, reason, date) {
    inv.decision_log = inv.decision_log || [];
    inv.decision_log.push({ date, from, to, reason });
  }

  // The prospective status the investment held before it was passed or funded; "IC" if nothing is recorded.
  function priorStatus(inv) {
    const entries = (inv.decision_log || []).slice().reverse();
    const last = entries.find(d => d.to === inv.status && PROSPECTIVE.includes(d.from));
    if (last) return last.from;
    const anyProspective = entries.find(d => PROSPECTIVE.includes(d.to));
    return anyProspective ? anyProspective.to : "IC";
  }

  function pass(inv, reason, date) {
    if (inv.status === "passed") return false;
    log(inv, inv.status, "passed", reason, date);
    inv.status = "passed";
    return true;
  }

  // From Passed: back to the prior prospective status with a reason. From Completed: the funding is reversed
  // first (holding, blotter entries and cash restored), then back to the prior prospective status.
  function moveBack(state, inv, reason, date) {
    if (PROSPECTIVE.includes(inv.status)) return false;
    const to = priorStatus(inv);
    let line = reason;
    if (inv.status === "invested" && inv.funding) {
      Invest.reverse(state, inv);
      line = (reason ? reason + " " : "") + "Funding reversed.";
    }
    log(inv, inv.status, to, line, date);
    inv.status = to;
    return true;
  }

  const StatusModel = { PROSPECTIVE, priorStatus, pass, moveBack };
  if (typeof module !== "undefined" && module.exports) module.exports = StatusModel;
  else root.StatusModel = StatusModel;
})(typeof window !== "undefined" ? window : this);
