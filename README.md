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
