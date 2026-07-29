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
- `medianPrice` does not include shipping cost.

If `SOLDCOMPS_API_KEY` is unset, or a SoldComps request fails, the command
prints a clean one-line error to stderr and exits non-zero without
processing further candidates.
