# Sandune Monitor: project brief

## Status (as of Tue 2026-09-29)
- Done: Stages 1-5, 6a (themes/investments), 6b visual pass, visual cleanup (background, close buttons, type scale).
- Hand-checked Pro Forma cases A-D (Seed mode): dry powder 17.75 / 17.65 / 18.95 / 17.75; illiquid incl. unfunded 52.89 / 52.89 / 50.88 / 52.89%.
- Next: review visual pass screenshots; phone test on the live URL; add ANTHROPIC_API_KEY in Vercel by Thursday 2026-10-01 midday, test live extraction, replace samples/sample-om-extracted.json with a real response; final incognito/phone checks; submission paragraph and walkthrough script.
- Open decisions: default table columns (revisit), model stays claude-sonnet-5, extract timeout 60s.

## What this is
A family office portfolio and pipeline monitor. Three tabs: Portfolio, Ideas, Pro Forma. Public demo for a job case study, due Fri Oct 2, 2026 10:00am ET. Every holding and figure is SAMPLE DATA and must be labeled as such on every tab.

## Hard rules
- Plain HTML, CSS and JavaScript. No framework, no build step, no npm packages in the front end. Chart.js saved as a local file in /vendor, not loaded from a CDN.
- Seed data lives in data/seed.js as a JS object, not JSON, so index.html also works when opened directly from disk.
- Hosted on Vercel. Server functions go in /api. API keys come from environment variables only. A key must never appear in front-end code or in git.
- Every live call has a timeout of about 3s and falls back to cached data, tagged "cached, as of [date]". Nothing may show an error to the viewer.
- Edits persist in localStorage under a versioned key. A new visitor always starts from the seed. Include a "Reset to sample data" button.
- Design: Calm, soft investor tool (reference: Stripe dashboard, Linear). Design tokens in css :root: navy accent #1f3a5f, ink #1a2230, muted #5b6470, page background #e3e9f2 (cool blue-gray), card #ffffff with a 1px #d6dde8 border plus the shadow, subtle fill #f6f7f9 inside cards (table header rows, subtotal/group rows, tags), line #e6e8ec, tints: accent #eef2f8, ok #e8f5ee / #1e7a4c, warn #fdf4e3 / #9a6700, breach #fdecec / #b42318. Radius 12px cards, 8px inputs, 999px pills. Card shadow 0 1px 2px rgba(16,24,40,.06), 0 1px 3px rgba(16,24,40,.08). Spacing scale 4/8/12/16/24/32. Transitions 150ms ease on hover, focus and value changes only. No gradients, no emoji, no bouncy animation. Tabular numbers everywhere.
- Type scale (CSS tokens --fs-*; every element uses one): section heading 16px/600; card title 18px/600; stat label 12px uppercase, letter-spacing .04em, muted; stat value 16px/600 tabular; body 14px; small/help text 12px muted. Only the Portfolio summary tiles use large 28px values (--fs-hero); no other large numbers anywhere.
- Stat rows (card headers, theme tiles) are a CSS grid of equal-width columns (.stat-row .stat): label on top, value underneath, all top-aligned. No subtitles under values; qualifiers go in the label, e.g. "Blended liquidity (check-weighted)".
- Detail cards (investment, theme): title line = name, status as a pill-shaped select, and an × close button (32px, aria-label "Close") at the far right. ×, Esc, or clicking the opening row again closes the card and scrolls back to that row. Theme tiles share one fixed layout (title + status pill, 2-line thesis, 3-column stat grid, at-risk counts as small amber pills) so every tile has the same height.
- Layout: must work at 375px phone width and fit a 1366px laptop; wide tables scroll inside their own container with the name column pinned. The page itself never scrolls sideways.
- Never store or bundle source PDFs. Deal names are shown generically.
- Build one stage at a time. Stop after each stage and summarize what changed.

## Data model
Holding: id, asset_class (public_equity, credit, private_fund, direct, real_estate, cash), name, ticker_or_id, security_type, sector, price_or_mark, quantity, market_value, cost, commitment, unfunded, call_schedule, liquidity_bucket (liquid_now, 1_3y, 3y_plus), liquidity_date, mark_source, mark_date.
Market value: public equity = price x shares; bonds = price x face / 100; funds and privates = mark; cash = balance.
Investment (formerly "Idea"; the array is investments[]): all Holding fields plus status (watching, researching, IC, invested, passed), type (public, private_equity, private_credit, venture), theme_id (optional), thesis, assumptions[] (text, status intact/at_risk/broken), triggers[], contacts[], check_size, funded_pct, hold_months, months_to_50pct_back, interim_cash (bool), target_return, next_step, next_step_date, tickers[], signals[], decision_log[], doc_flags[].
Theme (themes[]): id, name, status (exploring, active, retired), thesis, why_now, value_chain[] ({segment, who_captures_value}), assumptions[], triggers[], contacts[], watch_public[] (tickers), watch_private[] (names), signals[], linked_investment_ids[], decision_log[]. No check size or target return. An investment belongs to at most one theme; investment.theme_id and theme.linked_investment_ids are kept in sync both ways (js/themes-model.js).

## Formulas ($M; limits, reserve and haircuts are user-set)
- NAV = sum of market value including cash
- Dry powder = cash + sum(liquid value x haircut) - unfunded - reserve. Haircuts: T-bills 100%, equity 80%, HY 90%
- Illiquid % = value in 1_3y and 3y_plus / NAV; also shown with unfunded added to the numerator
- Capital calls year t = sum(unfunded x call_schedule[t]), straight-line by default
- Ladder year t = cash + value with liquidity_date <= t - cumulative calls through t
- Concentration = largest position / NAV; largest sector / NAV
- Liquidity score = 40 x (1 - min(months_to_50pct_back,60)/60) + 40 x (1 - min(hold_months,60)/60) + 20 if interim_cash. Public = 100
- Pro forma: add each selected idea at funded amount, subtract same amount from funding source (cash or a chosen liquid holding), add commitment minus funded to unfunded. Show every metric as new minus current. Flag limit breaches, and show pre-existing breaches separately.

## Default limits
Reserve $2.0M. Illiquid incl. unfunded 50%. Single position 5%. Largest sector 25%. Dry powder floor $5M.

## Stages
1 data + seed, 2 Portfolio, 3 Ideas, 4 Pro Forma, 5 live prices + document extraction, 6 polish and mobile.

## Decisions
Settled choices. Do not change these without the owner's say-so.
- Model: keep `claude-sonnet-5` (set in api/_lib.js). Do not switch to `claude-sonnet-5-5` or any other model. To be revisited when the Anthropic key is added.
- Never edit files through PowerShell. Use the file edit tools and save as UTF-8 without BOM. (A PowerShell edit corrupted js/prices.js: it added a BOM and mangled "·" into "Â·".)
- /api/extract timeout: keep `maxDuration: 60` in vercel.json. This is our choice, not a plan limit: Vercel Hobby functions can run up to 300 seconds. vercel.json is strict JSON and can't hold comments, so the reasoning lives here.
