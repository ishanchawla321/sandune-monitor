// Number and text formatting shared by all tabs.
(function (root) {
  "use strict";

  const blank = v => v === null || v === undefined || v === "" || !isFinite(v);
  const grouped = (v, dp) => Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
  const signed = (v, s) => (v < 0 ? "(" + s + ")" : s);

  const Fmt = {
    // $M to one decimal by default, for tiles: $49.7M
    millions(v, dp) { return blank(v) ? "n/a" : signed(v, "$" + grouped(v / 1e6, dp === undefined ? 1 : dp) + "M"); },
    // $ thousands, no decimals, for the table: 2,450 / (1,234)
    thousands(v) { return blank(v) ? "" : signed(Math.round(v / 1000), grouped(Math.round(v / 1000), 0)); },
    // whole dollars: $19,749,461 / ($4,500,000)
    dollars(v) { return blank(v) ? "" : signed(v, "$" + grouped(Math.round(v), 0)); },
    number(v, dp) { return blank(v) ? "" : signed(v, grouped(v, dp || 0)); },
    pct(v, dp) { return blank(v) ? "n/a" : signed(v, grouped(v * 100, dp === undefined ? 1 : dp) + "%"); },
    // Market cap: $230M, $1.2B, $15.5B
    marketCap(v) {
      if (blank(v) || v <= 0) return "—";
      if (v >= 1e12) return "$" + grouped(v / 1e12, 1) + "T";
      if (v >= 1e9) return "$" + grouped(v / 1e9, 1) + "B";
      return "$" + grouped(v / 1e6, 0) + "M";
    },
    // Today's date in the viewer's time zone, as YYYY-MM-DD.
    today() {
      const d = new Date();
      return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    },
    esc(t) {
      return String(t === null || t === undefined ? "" : t)
        .replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    }
  };

  Fmt.LABELS = {
    // Key order is the display order in charts, the holdings table and asset-class dropdowns.
    asset_class: { public_equity: "Public equity", credit: "Liquid credit", private_credit: "Private credit",
                   private_fund: "Private funds", direct: "Directs / co-invests", real_estate: "Real estate",
                   cash: "Cash and T-bills" },
    liquidity_bucket: { liquid_now: "Liquid now", "1_3y": "1-3 years", "3y_plus": "3+ years" },
    security_type: { common_stock: "Common stock", etf: "ETF", bond: "Bond", t_bill: "T-bill", lp_interest: "LP interest",
                     common_equity: "Common equity", preferred_equity: "Preferred equity", jv_equity: "JV equity",
                     first_lien_loan: "First-lien loan", basket: "Basket", cash: "Cash" },
    status: { watching: "Watching", researching: "Researching", IC: "Late stage", invested: "Invested", passed: "Passed" },
    type: { public: "Public", private_equity: "Private equity", private_credit: "Private credit",
            venture: "Venture (late-stage)" },
    theme_status: { exploring: "Exploring", active: "Active", retired: "Retired" },
    haircut_group: { public_equity: "Public equity", credit: "Liquid credit", t_bill: "T-bills" }
  };

  root.Fmt = Fmt;
})(window);
