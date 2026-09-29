# Sandune Monitor: project brief

## What this is
A family office portfolio and pipeline monitor. Three tabs: Portfolio, Ideas, Pro Forma. Public demo for a job case study, due Fri Oct 2, 2026 10:00am ET. Every holding and figure is SAMPLE DATA and must be labeled as such on every tab.

## Hard rules
- Plain HTML, CSS and JavaScript. No framework, no build step, no npm packages in the front end. Chart.js saved as a local file in /vendor, not loaded from a CDN.
- Seed data lives in data/seed.js as a JS object, not JSON, so index.html also works when opened directly from disk.
- Hosted on Vercel. Server functions go in /api. API keys come from environment variables only. A key must never appear in front-end code or in git.
- Every live call has a timeout of about 3s and falls back to cached data, tagged "cached, as of [date]". Nothing may show an error to the viewer.
- Edits persist in localStorage under a versioned key. A new visitor always starts from the seed. Include a "Reset to sample data" button.
- Design: dense internal investor tool. White background, one accent color, tabular numbers, right-aligned figures, no gradients, no emoji, no animations. Must work at 375px phone width; wide tables scroll inside their own container with the name column pinned.
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
