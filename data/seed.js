// Sandune Monitor seed book. SAMPLE DATA: every holding, idea and figure is illustrative.
// Plain JS (not JSON) so index.html works when opened directly from disk.
// All amounts are in US dollars; the UI displays them in $M.
// market_value is left null here and derived on load by Metrics.marketValue():
//   public equity = price x shares; bonds and T-bills = price x face / 100;
//   funds and privates = mark; cash = balance.
// Public equity prices: Yahoo Finance regular-market close, 2026-09-28.

window.SEED = {
  version: 3,
  as_of: "2026-09-28",
  sample_data: true,

  settings: {
    reserve: 2000000,
    // Applied to liquid_now holdings in the dry powder calc. Keyed by security_type first, then asset_class.
    haircuts: { t_bill: 1.0, public_equity: 0.8, credit: 0.9 },
    limits: {
      illiquid_incl_unfunded_pct: 0.50,
      single_position_pct: 0.05,
      largest_sector_pct: 0.25,
      dry_powder_floor: 5000000
    },
    call_horizon_years: 3,   // straight-line default spreads unfunded over this many years
    ladder_years: 5,
    // Sectors ignored by the largest-sector limit (not a single-sector exposure). Cash and T-bills are always excluded.
    sector_exclude: ["Multi-sector (ETF/funds)"]
  },

  holdings: [
    // ---- Public equity (~$15M) ----
    { id: "h-aapl", asset_class: "public_equity", name: "Apple Inc.", ticker_or_id: "AAPL", security_type: "common_stock",
      sector: "Technology", price_or_mark: 338.40, quantity: 6500, market_value: null, cost: 1450000,
      commitment: null, unfunded: 0, call_schedule: null, liquidity_bucket: "liquid_now", liquidity_date: "2026-09-28",
      mark_source: "Yahoo Finance close", mark_date: "2026-09-28" },
    { id: "h-jpm", asset_class: "public_equity", name: "JPMorgan Chase & Co.", ticker_or_id: "JPM", security_type: "common_stock",
      sector: "Financials", price_or_mark: 336.59, quantity: 6000, market_value: null, cost: 1320000,
      commitment: null, unfunded: 0, call_schedule: null, liquidity_bucket: "liquid_now", liquidity_date: "2026-09-28",
      mark_source: "Yahoo Finance close", mark_date: "2026-09-28" },
    { id: "h-unh", asset_class: "public_equity", name: "UnitedHealth Group", ticker_or_id: "UNH", security_type: "common_stock",
      sector: "Health Care", price_or_mark: 377.83, quantity: 5000, market_value: null, cost: 2350000,
      commitment: null, unfunded: 0, call_schedule: null, liquidity_bucket: "liquid_now", liquidity_date: "2026-09-28",
      mark_source: "Yahoo Finance close", mark_date: "2026-09-28" },
    { id: "h-xom", asset_class: "public_equity", name: "Exxon Mobil", ticker_or_id: "XOM", security_type: "common_stock",
      sector: "Energy", price_or_mark: 162.52, quantity: 12500, market_value: null, cost: 1480000,
      commitment: null, unfunded: 0, call_schedule: null, liquidity_bucket: "liquid_now", liquidity_date: "2026-09-28",
      mark_source: "Yahoo Finance close", mark_date: "2026-09-28" },
    { id: "h-pg", asset_class: "public_equity", name: "Procter & Gamble", ticker_or_id: "PG", security_type: "common_stock",
      sector: "Consumer Staples", price_or_mark: 149.03, quantity: 13000, market_value: null, cost: 2010000,
      commitment: null, unfunded: 0, call_schedule: null, liquidity_bucket: "liquid_now", liquidity_date: "2026-09-28",
      mark_source: "Yahoo Finance close", mark_date: "2026-09-28" },
    { id: "h-cat", asset_class: "public_equity", name: "Caterpillar Inc.", ticker_or_id: "CAT", security_type: "common_stock",
      sector: "Industrials", price_or_mark: 819.95, quantity: 3000, market_value: null, cost: 1150000,
      commitment: null, unfunded: 0, call_schedule: null, liquidity_bucket: "liquid_now", liquidity_date: "2026-09-28",
      mark_source: "Yahoo Finance close", mark_date: "2026-09-28" },
    { id: "h-nee", asset_class: "public_equity", name: "NextEra Energy", ticker_or_id: "NEE", security_type: "common_stock",
      sector: "Utilities", price_or_mark: 75.49, quantity: 32000, market_value: null, cost: 2240000,
      commitment: null, unfunded: 0, call_schedule: null, liquidity_bucket: "liquid_now", liquidity_date: "2026-09-28",
      mark_source: "Yahoo Finance close", mark_date: "2026-09-28" },

    // ---- Liquid credit (~$7M). Bond quantity = face; price per 100 of face. Bond prices are sample prices. ----
    { id: "h-hyg", asset_class: "credit", name: "iShares iBoxx $ High Yield Corp Bond ETF", ticker_or_id: "HYG", security_type: "etf",
      sector: "Multi-sector (ETF/funds)", price_or_mark: 77.54, quantity: 30000, market_value: null, cost: 2370000,
      commitment: null, unfunded: 0, call_schedule: null, liquidity_bucket: "liquid_now", liquidity_date: "2026-09-28",
      mark_source: "Yahoo Finance close", mark_date: "2026-09-28" },
    { id: "h-hyb-a", asset_class: "credit", name: "HY bond A (industrials)", ticker_or_id: "HYB-A", security_type: "bond",
      sector: "Industrials", price_or_mark: 101.25, quantity: 1550000, market_value: null, cost: 1530000,
      commitment: null, unfunded: 0, call_schedule: null, liquidity_bucket: "liquid_now", liquidity_date: "2026-09-28",
      mark_source: "Sample price", mark_date: "2026-09-28" },
    { id: "h-hyb-b", asset_class: "credit", name: "HY bond B (telecom)", ticker_or_id: "HYB-B", security_type: "bond",
      sector: "Communication Services", price_or_mark: 96.75, quantity: 1600000, market_value: null, cost: 1480000,
      commitment: null, unfunded: 0, call_schedule: null, liquidity_bucket: "liquid_now", liquidity_date: "2026-09-28",
      mark_source: "Sample price", mark_date: "2026-09-28" },
    { id: "h-hyb-c", asset_class: "credit", name: "HY bond C (chemicals)", ticker_or_id: "HYB-C", security_type: "bond",
      sector: "Materials", price_or_mark: 99.50, quantity: 1550000, market_value: null, cost: 1520000,
      commitment: null, unfunded: 0, call_schedule: null, liquidity_bucket: "liquid_now", liquidity_date: "2026-09-28",
      mark_source: "Sample price", mark_date: "2026-09-28" },

    // ---- Private funds (~$10M NAV, $4.5M unfunded). cost = paid-in = commitment - unfunded. call_schedule = share of current unfunded called in years 1..3; null = straight-line. ----
    { id: "h-fund-a", asset_class: "private_fund", name: "Buyout Fund A (2021 vintage)", ticker_or_id: "PF-A", security_type: "lp_interest",
      sector: "Multi-sector (ETF/funds)", price_or_mark: 2450000, quantity: null, market_value: null, cost: 2250000,
      commitment: 3000000, unfunded: 750000, call_schedule: [0.5, 0.5, 0], liquidity_bucket: "3y_plus", liquidity_date: "2030-06-30",
      mark_source: "GP statement Q2 2026", mark_date: "2026-06-30" },
    { id: "h-fund-b", asset_class: "private_fund", name: "Growth Equity Fund B (2023 vintage)", ticker_or_id: "PF-B", security_type: "lp_interest",
      sector: "Technology", price_or_mark: 2470000, quantity: null, market_value: null, cost: 2250000,
      commitment: 4000000, unfunded: 1750000, call_schedule: null, liquidity_bucket: "3y_plus", liquidity_date: "2032-12-31",
      mark_source: "GP statement Q2 2026", mark_date: "2026-06-30" },
    { id: "h-fund-c", asset_class: "private_fund", name: "Private Credit Fund C (2022 vintage)", ticker_or_id: "PF-C", security_type: "lp_interest",
      sector: "Multi-sector (ETF/funds)", price_or_mark: 2450000, quantity: null, market_value: null, cost: 2500000,
      commitment: 3000000, unfunded: 500000, call_schedule: [1, 0, 0], liquidity_bucket: "1_3y", liquidity_date: "2028-06-30",
      mark_source: "GP statement Q2 2026", mark_date: "2026-06-30" },
    { id: "h-fund-d", asset_class: "private_fund", name: "Venture Fund D (2024 vintage)", ticker_or_id: "PF-D", security_type: "lp_interest",
      sector: "Technology", price_or_mark: 2440000, quantity: null, market_value: null, cost: 2000000,
      commitment: 3500000, unfunded: 1500000, call_schedule: [0.4, 0.35, 0.25], liquidity_bucket: "3y_plus", liquidity_date: "2034-12-31",
      mark_source: "GP statement Q2 2026", mark_date: "2026-06-30" },

    // ---- Directs / co-invests (~$6M). Names are generic. ----
    { id: "h-dir-a", asset_class: "direct", name: "Software co-invest A", ticker_or_id: "CO-A", security_type: "common_equity",
      sector: "Technology", price_or_mark: 2380000, quantity: null, market_value: null, cost: 1700000,
      commitment: null, unfunded: 0, call_schedule: null, liquidity_bucket: "3y_plus", liquidity_date: "2030-06-30",
      mark_source: "Sponsor mark Q2 2026", mark_date: "2026-06-30" },
    { id: "h-dir-b", asset_class: "direct", name: "Healthcare services co-invest B", ticker_or_id: "CO-B", security_type: "preferred_equity",
      sector: "Health Care", price_or_mark: 1900000, quantity: null, market_value: null, cost: 1750000,
      commitment: null, unfunded: 0, call_schedule: null, liquidity_bucket: "1_3y", liquidity_date: "2028-09-30",
      mark_source: "Sponsor mark Q2 2026", mark_date: "2026-06-30" },
    { id: "h-dir-c", asset_class: "direct", name: "Consumer brand co-invest C", ticker_or_id: "CO-C", security_type: "common_equity",
      sector: "Consumer Discretionary", price_or_mark: 1720000, quantity: null, market_value: null, cost: 1800000,
      commitment: null, unfunded: 0, call_schedule: null, liquidity_bucket: "3y_plus", liquidity_date: "2031-03-31",
      mark_source: "Sponsor mark Q2 2026", mark_date: "2026-06-30" },

    // ---- Real estate (~$4M) ----
    { id: "h-re-mf", asset_class: "real_estate", name: "Sunbelt multifamily JV", ticker_or_id: "RE-1", security_type: "jv_equity",
      sector: "Real Estate", price_or_mark: 2300000, quantity: null, market_value: null, cost: 2000000,
      commitment: null, unfunded: 0, call_schedule: null, liquidity_bucket: "3y_plus", liquidity_date: "2030-12-31",
      mark_source: "Appraisal Q2 2026", mark_date: "2026-06-30" },
    { id: "h-re-ind", asset_class: "real_estate", name: "Industrial logistics fund", ticker_or_id: "RE-2", security_type: "lp_interest",
      sector: "Real Estate", price_or_mark: 1700000, quantity: null, market_value: null, cost: 1600000,
      commitment: null, unfunded: 0, call_schedule: null, liquidity_bucket: "1_3y", liquidity_date: "2028-12-31",
      mark_source: "GP statement Q2 2026", mark_date: "2026-06-30" },

    // ---- Cash and T-bills (~$8M) ----
    { id: "h-cash", asset_class: "cash", name: "Operating cash", ticker_or_id: "USD", security_type: "cash",
      sector: "Cash", price_or_mark: 2500000, quantity: null, market_value: null, cost: 2500000,
      commitment: null, unfunded: 0, call_schedule: null, liquidity_bucket: "liquid_now", liquidity_date: "2026-09-28",
      mark_source: "Custodian", mark_date: "2026-09-28" },
    { id: "h-tbill", asset_class: "cash", name: "US Treasury bills, Dec 2026", ticker_or_id: "UST-B 12/26", security_type: "t_bill",
      sector: "Cash", price_or_mark: 99.10, quantity: 5550000, market_value: null, cost: 5480000,
      commitment: null, unfunded: 0, call_schedule: null, liquidity_bucket: "liquid_now", liquidity_date: "2026-09-28",
      mark_source: "Sample price", mark_date: "2026-09-28" }
  ],

  // Ideas carry every Holding field plus pipeline fields. Amounts in dollars.
  ideas: [
    { id: "i-tms", asset_class: "public_equity", name: "TMS / interventional psychiatry", ticker_or_id: "BWAY, STIM",
      security_type: "common_stock", sector: "Health Care", price_or_mark: null, quantity: null, market_value: null, cost: null,
      commitment: null, unfunded: 0, call_schedule: null, liquidity_bucket: "liquid_now", liquidity_date: null,
      mark_source: "Yahoo Finance close", mark_date: "2026-09-28",
      status: "researching", type: "theme",
      thesis: "Reimbursement for transcranial magnetic stimulation is broadening and accelerated protocols shorten treatment courses, which should lift device utilization.",
      assumptions: [
        { text: "Payer coverage for TMS keeps expanding", status: "intact" },
        { text: "Accelerated protocols gain clinical adoption", status: "intact" },
        { text: "Small-cap balance sheets can fund growth without heavy dilution", status: "at_risk" }
      ],
      triggers: ["New CMS or major payer coverage decision", "Quarterly device placements"],
      contacts: ["Sell-side analyst (medtech)", "Clinic operator (industry contact)"],
      check_size: 500000, funded_pct: 1.0, hold_months: null, months_to_50pct_back: null, interim_cash: false,
      target_return: "Theme basket, no fixed target",
      next_step: "Size split between BWAY and STIM", next_step_date: "2026-10-09",
      tickers: ["BWAY", "STIM"],
      signals: [
        { ticker: "BWAY", price: 13.25, date: "2026-09-28", source: "Yahoo Finance close" },
        { ticker: "STIM", price: 2.555, date: "2026-09-28", source: "Yahoo Finance close" }
      ],
      decision_log: [{ date: "2026-09-15", note: "Added to pipeline" }],
      doc_flags: [] },

    { id: "i-carwash", asset_class: "direct", name: "Car wash SPV (Anchorage)", ticker_or_id: "SPV-CW",
      security_type: "preferred_equity", sector: "Consumer Discretionary", price_or_mark: null, quantity: null, market_value: null, cost: null,
      commitment: 1000000, unfunded: 0, call_schedule: null, liquidity_bucket: "3y_plus", liquidity_date: null,
      mark_source: null, mark_date: null,
      status: "IC", type: "private_equity",
      thesis: "Preferred equity in a car wash roll-up SPV: 1.0x liquidation preference plus an 8% cumulative dividend, with upside participation.",
      assumptions: [
        { text: "Membership revenue holds through a consumer slowdown", status: "intact" },
        { text: "Exit within 36 months", status: "at_risk" }
      ],
      triggers: ["Sponsor refinancing", "Same-store membership trends"],
      contacts: ["Sponsor deal lead"],
      check_size: 1000000, funded_pct: 1.0, hold_months: 36, months_to_50pct_back: 36, interim_cash: false,
      target_return: "3.0x gross; 1.0x pref + 8% cumulative dividend",
      next_step: "IC vote", next_step_date: "2026-10-06",
      tickers: [], signals: [],
      decision_log: [{ date: "2026-09-10", note: "Moved to IC" }],
      doc_flags: [] },

    { id: "i-rpa", asset_class: "credit", name: "RPA services first-lien loan", ticker_or_id: "LN-RPA",
      security_type: "first_lien_loan", sector: "Technology", price_or_mark: null, quantity: null, market_value: null, cost: null,
      commitment: 1000000, unfunded: 350000, call_schedule: null, liquidity_bucket: "3y_plus", liquidity_date: null,
      mark_source: null, mark_date: null,
      status: "researching", type: "private_credit",
      thesis: "First-lien term loan to a robotic process automation services company. SOFR + 825 bps with a 4.00% SOFR floor; 65% funded at close, remainder delayed-draw.",
      assumptions: [
        { text: "Recurring revenue covers debt service with room to spare", status: "intact" },
        { text: "Amortization returns about half of principal by month 24", status: "intact" }
      ],
      triggers: ["Covenant compliance certificate", "Customer concentration change"],
      contacts: ["Lender syndicate lead"],
      check_size: 1000000, funded_pct: 0.65, hold_months: 48, months_to_50pct_back: 24, interim_cash: true,
      target_return: "SOFR + 825, 4.00% floor",
      next_step: "Review credit agreement", next_step_date: "2026-10-14",
      tickers: [], signals: [],
      decision_log: [{ date: "2026-09-20", note: "Term sheet received" }],
      doc_flags: [] },

    { id: "i-legalai", asset_class: "direct", name: "Legal AI late-stage equity", ticker_or_id: "PE-LAI",
      security_type: "preferred_equity", sector: "Technology", price_or_mark: 37.00, quantity: 27027, market_value: null, cost: null,
      commitment: 1000000, unfunded: 0, call_schedule: null, liquidity_bucket: "3y_plus", liquidity_date: null,
      mark_source: "Round price", mark_date: null,
      status: "watching", type: "private_equity",
      thesis: "Late-stage round in a legal AI software company at $37 per share.",
      assumptions: [
        { text: "Enterprise law firm adoption keeps compounding", status: "intact" },
        { text: "IPO or strategic exit window within 36 months", status: "at_risk" }
      ],
      triggers: ["Next priced round", "IPO filing"],
      contacts: ["Placement agent"],
      check_size: 1000000, funded_pct: 1.0, hold_months: 36, months_to_50pct_back: 36, interim_cash: false,
      target_return: "Not yet set",
      next_step: "Request data room access", next_step_date: "2026-10-16",
      tickers: [], signals: [],
      decision_log: [{ date: "2026-09-22", note: "Allocation offered" }],
      doc_flags: [] }
  ]
};
