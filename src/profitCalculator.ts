import { readFileSync } from "node:fs";

import type { EnrichedCandidateItem, EvaluatedCandidateItem, ProfitEvaluation } from "./types.js";

// Vinted's Buyer Protection fee formula is undisclosed; its own pricelist
// page only states a range (3-8% + £0.30-£0.80). This uses the conservative
// high end so profit estimates are never optimistic.
const VINTED_FEE_PERCENT = 0.08;
const VINTED_FEE_FIXED = 0.8;

// UK private sellers pay no final value fee, per-order fee, or regulatory
// operating fee on eBay sales (since Oct 2024). Business-seller fees are
// out of scope for this issue.
const EBAY_FEES = 0;

const MIN_PROFIT = 8;
const MIN_MARGIN_PERCENT = 20;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function ineligible(): ProfitEvaluation {
  return {
    eligible: false,
    vintedCostBasis: null,
    postageCost: null,
    ebayFees: null,
    netProfit: null,
    marginPercent: null,
    meetsThreshold: false,
  };
}

export function evaluateCandidate(candidate: EnrichedCandidateItem): ProfitEvaluation {
  const estimate = candidate.ebayPriceEstimate;

  if (!estimate?.available || estimate.medianPrice === null || estimate.medianShippingPrice === null) {
    return ineligible();
  }
  if (candidate.price.currency !== "GBP" || estimate.currency !== "GBP") {
    return ineligible();
  }

  const itemPrice = candidate.price.amount;
  const vintedCostBasis = round2(itemPrice + (itemPrice * VINTED_FEE_PERCENT + VINTED_FEE_FIXED));
  const postageCost = estimate.medianShippingPrice;
  const netProfit = round2(estimate.medianPrice - vintedCostBasis - postageCost - EBAY_FEES);
  const marginPercent = round2((netProfit / estimate.medianPrice) * 100);
  const meetsThreshold = netProfit >= MIN_PROFIT && marginPercent >= MIN_MARGIN_PERCENT;

  return {
    eligible: true,
    vintedCostBasis,
    postageCost,
    ebayFees: EBAY_FEES,
    netProfit,
    marginPercent,
    meetsThreshold,
  };
}

export function evaluateCandidates(candidates: EnrichedCandidateItem[]): EvaluatedCandidateItem[] {
  return candidates.map((candidate) => ({
    ...candidate,
    profitEvaluation: evaluateCandidate(candidate),
  }));
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

function parseCandidates(raw: string): EnrichedCandidateItem[] {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("Input is not valid JSON");
  }
  if (!Array.isArray(data)) {
    throw new Error("Input JSON must be an array of candidate items");
  }
  return data as EnrichedCandidateItem[];
}

export async function main(): Promise<void> {
  try {
    const filePath = process.argv[2];
    const raw = filePath ? readFileSync(filePath, "utf-8") : await readStdin();
    const candidates = parseCandidates(raw);
    const evaluated = evaluateCandidates(candidates);
    process.stdout.write(`${JSON.stringify(evaluated, null, 2)}\n`);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown error while evaluating candidates";
    process.stderr.write(`Error: ${message}\n`);
    process.exitCode = 1;
  }
}
