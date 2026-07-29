import { VintedClient, VintedRequestError } from "./vintedClient.js";
import type { CandidateItem, VintedRawItem } from "./types.js";

export { VintedRequestError };

// Fixed pilot search scope for this issue (MAR-5 AC-1, NG-7 forbids making
// this configurable here).
const BRANDS = ["Barbour", "The North Face"];
const PRICE_TO_GBP = 25;
const PER_PAGE = 20;
const PAGE_BUDGET = 5; // AC-3: up to the first 100 matching results (5 pages of 20)

// AC-1 asks for condition "New with tags", "Like new", or "Very good" or
// better. Vinted's actual API status values are "New with tags",
// "New without tags", "Very good", "Good", "Satisfactory" — there is no
// literal "Like new" status, so it is mapped to the closest equivalent,
// "New without tags".
const ALLOWED_STATUSES = new Set(["New with tags", "New without tags", "Very good"]);

const CATEGORY_REGEX = /\b(coats?|jackets?)\b/i;

// Vinted's search API has no reliable men's/women's category filter exposed
// publicly, so "men's" scoping is approximated by excluding titles that
// signal women's/kids' listings.
const EXCLUDE_REGEX =
  /\b(women'?s?|woman|ladies|lady|girls?|boys?|kids?|child(?:'?s)?|childrens?|junior|youth|babies|baby|dogs?|puppy|puppies|pets?)\b|\bage\s*\d/i;

// Vinted expresses children's sizing in years (e.g. "8 years / 128 cm",
// "13-15yrs"), which is a stronger and more literal signal than title
// keywords for excluding non-adult sizing.
const KIDS_SIZE_REGEX = /\d+\s*(-\s*\d+\s*)?(years?|yrs?)\b/i;

// vinted.co.uk is the UK-specific marketplace and the search API does not
// expose a per-item seller country field, so this is a fixed assumption
// rather than per-item data.
const SELLER_COUNTRY = "GB";

interface QueryState {
  brand: string;
  searchText: string;
  page: number;
  exhausted: boolean;
  totalEntries?: number;
}

function passesFilters(raw: VintedRawItem): boolean {
  if (!ALLOWED_STATUSES.has(raw.status)) return false;
  if (Number(raw.price.amount) > PRICE_TO_GBP) return false;
  if (!CATEGORY_REGEX.test(raw.title)) return false;
  if (EXCLUDE_REGEX.test(raw.title)) return false;
  if (KIDS_SIZE_REGEX.test(raw.size_title)) return false;
  const brandLower = raw.brand_title.toLowerCase();
  return BRANDS.some((brand) => brand.toLowerCase() === brandLower);
}

function mapItem(raw: VintedRawItem): CandidateItem {
  const photos =
    raw.photos && raw.photos.length > 0
      ? raw.photos.map((photo) => photo.url)
      : raw.photo
        ? [raw.photo.url]
        : [];

  return {
    id: raw.id,
    title: raw.title,
    brand: raw.brand_title,
    condition: raw.status,
    price: { amount: Number(raw.price.amount), currency: raw.price.currency_code },
    size: raw.size_title,
    sellerCountry: SELLER_COUNTRY,
    url: raw.url,
    photos,
  };
}

export interface ScanResult {
  candidates: CandidateItem[];
  totalReported: number;
  breakdown: string;
}

export async function runScan(client: VintedClient = new VintedClient()): Promise<ScanResult> {
  const queries: QueryState[] = BRANDS.map((brand) => ({
    brand,
    searchText: `${brand} coat jacket`,
    page: 1,
    exhausted: false,
  }));

  const rawById = new Map<number, VintedRawItem>();
  let fetchesUsed = 0;
  let turn = 0;

  while (fetchesUsed < PAGE_BUDGET && queries.some((query) => !query.exhausted)) {
    const query = queries[turn % queries.length];
    turn++;
    if (query.exhausted) continue;

    const response = await client.searchPage({
      searchText: query.searchText,
      priceTo: PRICE_TO_GBP,
      page: query.page,
      perPage: PER_PAGE,
    });
    fetchesUsed++;

    if (query.totalEntries === undefined) {
      query.totalEntries = response.pagination.total_entries;
    }
    for (const item of response.items) {
      rawById.set(item.id, item);
    }
    if (response.items.length < PER_PAGE) {
      query.exhausted = true;
    } else {
      query.page++;
    }
  }

  const candidates = Array.from(rawById.values()).filter(passesFilters).map(mapItem);
  const totalReported = queries.reduce((sum, query) => sum + (query.totalEntries ?? 0), 0);
  const breakdown = queries.map((query) => `${query.brand}: ${query.totalEntries ?? 0}`).join(", ");

  return { candidates, totalReported, breakdown };
}

export async function main(): Promise<void> {
  try {
    const { candidates, totalReported, breakdown } = await runScan();
    process.stdout.write(`${JSON.stringify(candidates, null, 2)}\n`);
    process.stderr.write(
      `Vinted reports ${totalReported} total matching results across the configured searches (${breakdown}). ` +
        `${candidates.length} passed the condition/price/category filters.\n`
    );
  } catch (err) {
    const message =
      err instanceof VintedRequestError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Unknown error while scanning Vinted";
    process.stderr.write(`Error: ${message}\n`);
    process.exitCode = 1;
  }
}
