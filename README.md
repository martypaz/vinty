# vinty

Vinted → eBay arbitrage tooling.

## Vinted scanner (MAR-5)

A one-off CLI command that searches vinted.co.uk for men's coats & jackets
from Barbour or The North Face, condition "New with tags", "New without
tags" (Vinted's closest equivalent to "Like new"), or "Very good", priced at
£25 or less, and prints matching candidates as JSON.

```sh
npm install
npm run scan
```

Prints a JSON array of candidates to stdout, and a one-line summary to
stderr reporting how many total matching results Vinted reported (which may
exceed the ~100 items actually fetched and filtered).

No Vinted account, login, or authenticated session is used — only the same
anonymous session the public website itself uses.

### Testing against a broken endpoint

Set `VINTED_BASE_URL` to point the client at a different (or unreachable)
host, e.g. to confirm the error path manually:

```sh
VINTED_BASE_URL=http://localhost:1 npm run scan
```

This should print a clean one-line error to stderr and exit non-zero,
without a raw stack trace.

### Known limitations (see MAR-5 for full scope)

- Seller country is fixed to `"GB"` for every candidate: vinted.co.uk is the
  UK marketplace, and the search API used here does not expose a per-item
  seller country field.
- "Men's" category scoping is approximated with a title keyword filter
  (excluding titles that mention women's/kids' sizing) rather than a
  verified server-side category ID, since Vinted's public search endpoint
  does not expose a working category/brand ID lookup.

## eBay sold-comps price lookup (MAR-6)

Reads a JSON array of candidates in the shape the scanner produces, and
enriches each one with an `ebayPriceEstimate` (median sold price from real
eBay UK sold listings, via the [SoldComps](https://sold-comps.com) API).

```sh
export SOLDCOMPS_API_KEY=sc_your_key_here   # get one at sold-comps.com
npm run scan | npm run price-lookup
# or:
npm run scan > candidates.json
npm run price-lookup candidates.json
```

Each candidate gets an `ebayPriceEstimate` field:

```json
{
  "available": true,
  "medianPrice": 59.05,
  "medianShippingPrice": 8.5,
  "currency": "GBP",
  "comparableCount": 200,
  "reason": null
}
```

- `available` is `true` only when at least 3 matching sold comps were found.
- `reason` is `"insufficient_comps"` (fewer than 3 comps found) or `"capped"`
  (beyond the first 20 candidates in the input — no API call made) when
  `available` is `false`.
- Only the first 20 candidates in the input are looked up per run, to
  conserve SoldComps' request quota (the free tier is 100 requests/month).
- `medianPrice` does not include shipping cost; `medianShippingPrice` is the
  median real shipping price paid across the same comps.

If `SOLDCOMPS_API_KEY` is unset, or a SoldComps request fails, the command
prints a clean one-line error to stderr and exits non-zero without
processing further candidates.

## Profit calculator (MAR-7)

Reads price-lookup's output and adds a `profitEvaluation` field per
candidate: is it actually worth buying, after Vinted's Buyer Protection fee,
real postage, and eBay fees?

```sh
npm run scan | npm run price-lookup | npm run evaluate
# or:
npm run price-lookup candidates.json > enriched.json
npm run evaluate enriched.json
```

```json
{
  "eligible": true,
  "vintedCostBasis": 23.48,
  "postageCost": 3.38,
  "ebayFees": 0,
  "netProfit": 31.84,
  "marginPercent": 54.25,
  "meetsThreshold": true
}
```

- `vintedCostBasis` = item price + Vinted's Buyer Protection fee, estimated
  at 8% + £0.80 (the conservative high end of Vinted's own published
  3–8% + £0.30–£0.80 range — it doesn't publish an exact formula).
- `postageCost` = the same median shipping price from `ebayPriceEstimate`.
- `ebayFees` is always `0`: this assumes you're selling as a UK **private**
  seller, who pays no final value fee, per-order fee, or regulatory fee
  (business/registered sellers are out of scope — see MAR-7).
- `meetsThreshold` is `true` only when net profit is at least £8 **and**
  margin (profit ÷ eBay sale price) is at least 20%.
- `eligible` is `false` (all other fields `null`) when there's no eBay price
  data yet, or either currency isn't `"GBP"`.

This command only reads already-fetched data — no new network calls.

## Slack #approvals notification (MAR-8)

Reads the evaluate command's output and posts a Slack message for every
candidate that meets the profit/margin threshold, so you can decide whether
to go buy it on Vinted.

```sh
export SLACK_BOT_TOKEN=xoxb-your-token   # bot needs chat:write and to be
                                          # invited into #approvals
npm run scan | npm run price-lookup | npm run evaluate | npm run notify
# or:
npm run evaluate enriched.json > evaluated.json
npm run notify evaluated.json
```

Each candidate gets a `notification` field:

```json
{ "attempted": true, "success": true, "error": null }
```

- Only candidates with `profitEvaluation.meetsThreshold: true` get posted;
  others get `{ attempted: false, success: null, error: null }` — no Slack
  call made for them.
- The Slack message includes title (linked to the Vinted listing), brand,
  condition, size, Vinted price, eBay median sold price, net profit, margin,
  and the first photo.
- Posts to `#approvals` by default; override with `SLACK_CHANNEL`.
- If one post fails, the rest of the batch is still attempted — a one-line
  stderr summary reports how many succeeded/failed, and the command exits
  non-zero if anything failed.
- **This is a one-way notification only** — there are no approve/reject
  buttons in the message. For now, "approving" means going and buying the
  item on Vinted yourself after seeing the ping; interactive
  approve/reject-and-buy is a future issue, designed together with purchase
  automation (it needs a public webhook endpoint to receive Slack's button
  clicks, which this command doesn't have).
- No deduplication: re-running the same input re-posts the same candidates.

If `SLACK_BOT_TOKEN` is unset, or the input isn't valid JSON, the command
prints a clean one-line error to stderr and exits non-zero before any API
calls.

## Persistence (MAR-9)

`notify` now also saves every candidate it Slacks into a local SQLite
database (`data/vinty.sqlite3`, auto-created, gitignored), keyed by Vinted
item id:

- New items are inserted with `status = 'new'`.
- Re-processing the same item updates its data fields but never overwrites
  a status you've already progressed past `'new'` — a re-scan won't reset
  something you've marked as ordered back to "new".
- The database write is attempted independently of the Slack post. A
  candidate's `notification.success` is now `true` only when **both** the
  Slack post and the database save succeeded; the `error` field reports
  whichever failed (Slack takes precedence if both did).
- Override the database path with `VINTY_DB_PATH` (mainly useful for tests
  — set it to `:memory:` for a throwaway in-memory database).

This is the foundation for a future backend API + React UI to manage
listings across "new", "ordered/pending delivery", and "eBay listings"
stages — not built yet.

## Automated checks & auto-merge

Every push and PR runs `.github/workflows/ci.yml` (typecheck + test) via
GitHub Actions. `main` requires this check to pass before anything merges.
Finn-loop's reviewer (`finn-review`) auto-merges a PR only when its review
is clean (no must-fix findings), the PR carries no pre-existing
`needs-human-review` label, and this required check has actually passed —
`finn-build` itself never merges its own work.
