// Number and text formatting shared by all tabs.
(function (root) {
  "use strict";

  const blank = v => v === null || v === undefined || v === "" || !isFinite(v);
  const grouped = (v, dp) => Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
  const signed = (v, s) => (v < 0 ? "(" + s + ")" : s);

  const Fmt = {
    // $M to one decimal, for tiles: $49.7M
    millions(v) { return blank(v) ? "n/a" : signed(v, "$" + grouped(v / 1e6, 1) + "M"); },
    // $ thousands, no decimals, for the table: 2,450 / (1,234)
    thousands(v) { return blank(v) ? "" : signed(Math.round(v / 1000), grouped(Math.round(v / 1000), 0)); },
    // whole dollars: $19,749,461 / ($4,500,000)
    dollars(v) { return blank(v) ? "" : signed(v, "$" + grouped(Math.round(v), 0)); },
    number(v, dp) { return blank(v) ? "" : signed(v, grouped(v, dp || 0)); },
    pct(v, dp) { return blank(v) ? "n/a" : signed(v, grouped(v * 100, dp === undefined ? 1 : dp) + "%"); },
    esc(t) {
      return String(t === null || t === undefined ? "" : t)
        .replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    }
  };

  Fmt.LABELS = {
    asset_class: { public_equity: "Public equity", credit: "Liquid credit", private_fund: "Private funds",
                   direct: "Directs / co-invests", real_estate: "Real estate", cash: "Cash and T-bills" },
    liquidity_bucket: { liquid_now: "Liquid now", "1_3y": "1-3 years", "3y_plus": "3+ years" },
    security_type: { common_stock: "Common stock", etf: "ETF", bond: "Bond", t_bill: "T-bill", lp_interest: "LP interest",
                     common_equity: "Common equity", preferred_equity: "Preferred equity", jv_equity: "JV equity",
                     first_lien_loan: "First-lien loan", cash: "Cash" },
    haircut_group: { public_equity: "Public equity", credit: "Liquid credit", t_bill: "T-bills" }
  };

  root.Fmt = Fmt;
})(window);
