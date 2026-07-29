import { readFileSync } from "node:fs";

import type {
  CandidateItem,
  EbayPriceEstimate,
  EnrichedCandidateItem,
  SoldCompsResponse,
} from "./types.js";

const SOLDCOMPS_BASE_URL = process.env.SOLDCOMPS_BASE_URL ?? "https://api.sold-comps.com";
const EBAY_SITE = "ebay.co.uk";
const DAYS_TO_SCRAPE = 90;
const MIN_COMPARABLE_COUNT = 3;
export const LOOKUP_CAP = 20;

export class SoldCompsConfigError extends Error {}
export class SoldCompsRequestError extends Error {}

function buildSearchKeyword(candidate: CandidateItem): string {
  const category = /coat/i.test(candidate.title) ? "coat" : "jacket";
  return `${candidate.brand} ${category}`;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function isValidSoldCompsResponse(data: unknown): data is SoldCompsResponse {
  if (!data || typeof data !== "object") return false;
  return Array.isArray((data as Record<string, unknown>).items);
}

async function fetchSoldComps(apiKey: string, keyword: string): Promise<SoldCompsResponse> {
  const url = new URL(`${SOLDCOMPS_BASE_URL}/v1/scrape`);
  url.searchParams.set("keyword", keyword);
  url.searchParams.set("ebaySite", EBAY_SITE);
  url.searchParams.set("daysToScrape", String(DAYS_TO_SCRAPE));

  let response: Response;
  try {
    response = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
  } catch (err) {
    throw new SoldCompsRequestError(`Could not reach SoldComps: ${(err as Error).message}`);
  }
  if (!response.ok) {
    throw new SoldCompsRequestError(
      `SoldComps returned HTTP ${response.status} for keyword "${keyword}"`
    );
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new SoldCompsRequestError("SoldComps returned a response that was not valid JSON");
  }
  if (!isValidSoldCompsResponse(data)) {
    throw new SoldCompsRequestError("SoldComps returned an unexpected response shape");
  }
  return data;
}

function estimateFromComps(response: SoldCompsResponse): EbayPriceEstimate {
  const prices = response.items
    .map((item) => Number(item.soldPrice))
    .filter((price) => Number.isFinite(price));
  const comparableCount = prices.length;

  if (comparableCount < MIN_COMPARABLE_COUNT) {
    return {
      available: false,
      medianPrice: null,
      currency: null,
      comparableCount,
      reason: "insufficient_comps",
    };
  }

  const currency = response.items.find((item) => item.soldCurrency)?.soldCurrency ?? null;
  return {
    available: true,
    medianPrice: median(prices),
    currency,
    comparableCount,
    reason: null,
  };
}

function cappedEstimate(): EbayPriceEstimate {
  return { available: false, medianPrice: null, currency: null, comparableCount: 0, reason: "capped" };
}

export async function enrichCandidates(
  candidates: CandidateItem[],
  apiKey: string | undefined = process.env.SOLDCOMPS_API_KEY
): Promise<EnrichedCandidateItem[]> {
  if (!apiKey) {
    throw new SoldCompsConfigError("SOLDCOMPS_API_KEY environment variable is not set");
  }

  const enriched: EnrichedCandidateItem[] = [];
  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    if (i >= LOOKUP_CAP) {
      enriched.push({ ...candidate, ebayPriceEstimate: cappedEstimate() });
      continue;
    }

    const keyword = buildSearchKeyword(candidate);
    let response: SoldCompsResponse;
    try {
      response = await fetchSoldComps(apiKey, keyword);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown SoldComps error";
      throw new SoldCompsRequestError(
        `Failed while looking up candidate ${candidate.id} ("${candidate.title}"): ${message}`
      );
    }
    enriched.push({ ...candidate, ebayPriceEstimate: estimateFromComps(response) });
  }
  return enriched;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

function parseCandidates(raw: string): CandidateItem[] {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("Input is not valid JSON");
  }
  if (!Array.isArray(data)) {
    throw new Error("Input JSON must be an array of candidate items");
  }
  return data as CandidateItem[];
}

export async function main(): Promise<void> {
  try {
    const filePath = process.argv[2];
    const raw = filePath ? readFileSync(filePath, "utf-8") : await readStdin();
    const candidates = parseCandidates(raw);
    const enriched = await enrichCandidates(candidates);
    process.stdout.write(`${JSON.stringify(enriched, null, 2)}\n`);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown error while looking up eBay prices";
    process.stderr.write(`Error: ${message}\n`);
    process.exitCode = 1;
  }
}
