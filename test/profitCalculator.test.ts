import { describe, expect, it, vi } from "vitest";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { evaluateCandidate, main } from "../src/profitCalculator.js";
import type { EnrichedCandidateItem } from "../src/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function makeEnrichedCandidate(
  overrides: Partial<EnrichedCandidateItem> = {}
): EnrichedCandidateItem {
  return {
    id: 1,
    title: "Barbour coat",
    brand: "Barbour",
    condition: "Very good",
    price: { amount: 15, currency: "GBP" },
    size: "M",
    sellerCountry: "GB",
    url: "https://www.vinted.co.uk/items/1",
    photos: ["https://images1.vinted.net/1.jpeg"],
    ebayPriceEstimate: {
      available: true,
      medianPrice: 75,
      medianShippingPrice: 11,
      currency: "GBP",
      comparableCount: 4,
      reason: null,
    },
    ...overrides,
  };
}

describe("evaluateCandidate", () => {
  it("computes the documented formula for a hand-verified example (AC-3, AC-4)", () => {
    // itemPrice 15 -> vintedCostBasis = 15 + (15*0.08 + 0.80) = 17
    // netProfit = 75 - 17 - 11 - 0 = 47
    // marginPercent = 47 / 75 * 100 = 62.666... -> 62.67
    const result = evaluateCandidate(makeEnrichedCandidate());

    expect(result).toEqual({
      eligible: true,
      vintedCostBasis: 17,
      postageCost: 11,
      ebayFees: 0,
      netProfit: 47,
      marginPercent: 62.67,
      meetsThreshold: true,
    });
  });

  it("flags meetsThreshold false when profit or margin falls short, while still eligible", () => {
    // itemPrice 15 -> vintedCostBasis 17; medianPrice 20, shipping 3
    // netProfit = 20 - 17 - 3 - 0 = 0 -> below both thresholds
    const result = evaluateCandidate(
      makeEnrichedCandidate({
        ebayPriceEstimate: {
          available: true,
          medianPrice: 20,
          medianShippingPrice: 3,
          currency: "GBP",
          comparableCount: 5,
          reason: null,
        },
      })
    );

    expect(result.eligible).toBe(true);
    expect(result.netProfit).toBe(0);
    expect(result.meetsThreshold).toBe(false);
  });

  it("returns an all-null ineligible evaluation when price data is unavailable (AC-5)", () => {
    const result = evaluateCandidate(
      makeEnrichedCandidate({
        ebayPriceEstimate: {
          available: false,
          medianPrice: null,
          medianShippingPrice: null,
          currency: null,
          comparableCount: 1,
          reason: "insufficient_comps",
        },
      })
    );

    expect(result).toEqual({
      eligible: false,
      vintedCostBasis: null,
      postageCost: null,
      ebayFees: null,
      netProfit: null,
      marginPercent: null,
      meetsThreshold: false,
    });
  });

  it("treats a non-GBP Vinted price as ineligible (AC-5)", () => {
    const result = evaluateCandidate(
      makeEnrichedCandidate({ price: { amount: 15, currency: "EUR" } })
    );
    expect(result.eligible).toBe(false);
  });

  it("treats a non-GBP eBay estimate currency as ineligible (AC-5)", () => {
    const result = evaluateCandidate(
      makeEnrichedCandidate({
        ebayPriceEstimate: {
          available: true,
          medianPrice: 75,
          medianShippingPrice: 11,
          currency: "USD",
          comparableCount: 4,
          reason: null,
        },
      })
    );
    expect(result.eligible).toBe(false);
  });
});

describe("main() CLI", () => {
  it("reads enriched candidates from a file argument and prints profitEvaluation for each (AC-1)", async () => {
    const originalArgv = process.argv;
    process.argv = [
      ...originalArgv.slice(0, 2),
      path.join(__dirname, "fixtures/enriched-candidates.json"),
    ];
    const stdoutWrite = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await main();

    const printed = stdoutWrite.mock.calls[0][0] as string;
    const parsed = JSON.parse(printed);
    expect(parsed[0].profitEvaluation).toEqual({
      eligible: true,
      vintedCostBasis: 17,
      postageCost: 11,
      ebayFees: 0,
      netProfit: 47,
      marginPercent: 62.67,
      meetsThreshold: true,
    });

    process.argv = originalArgv;
    stdoutWrite.mockRestore();
  });

  it("prints a clean error and non-zero exit code for invalid JSON input (AC-6)", async () => {
    const originalArgv = process.argv;
    // Point argv at a real file that exists but isn't a JSON array.
    process.argv = [
      ...originalArgv.slice(0, 2),
      path.join(__dirname, "profitCalculator.test.ts"),
    ];
    const stderrWrite = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const originalExitCode = process.exitCode;
    process.exitCode = undefined;

    await expect(main()).resolves.toBeUndefined();

    expect(process.exitCode).toBe(1);
    expect(stderrWrite).toHaveBeenCalledWith(expect.stringMatching(/not valid JSON/));

    process.argv = originalArgv;
    process.exitCode = originalExitCode;
    stderrWrite.mockRestore();
  });
});
