import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  enrichCandidates,
  LOOKUP_CAP,
  SoldCompsConfigError,
  SoldCompsRequestError,
} from "../src/priceLookup.js";
import { main } from "../src/priceLookup.js";
import type { CandidateItem } from "../src/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadFixture(name: string): string {
  return readFileSync(path.join(__dirname, "fixtures", name), "utf-8");
}

function jsonResponse(body: string): Response {
  return new Response(body, { status: 200 });
}

function makeCandidate(overrides: Partial<CandidateItem> = {}): CandidateItem {
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
    ...overrides,
  };
}

describe("enrichCandidates", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("computes a median price estimate when at least 3 comps are found (AC-3)", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(loadFixture("soldcomps-response.json")));
    vi.stubGlobal("fetch", fetchMock);

    const [result] = await enrichCandidates([makeCandidate()], "sc_test_key");

    expect(result.ebayPriceEstimate).toEqual({
      available: true,
      medianPrice: 75,
      medianShippingPrice: 11,
      currency: "GBP",
      comparableCount: 4,
      reason: null,
    });
  });

  it("flags insufficient_comps when fewer than 3 comps are found (AC-3)", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(loadFixture("soldcomps-response-thin.json")));
    vi.stubGlobal("fetch", fetchMock);

    const [result] = await enrichCandidates([makeCandidate()], "sc_test_key");

    expect(result.ebayPriceEstimate).toEqual({
      available: false,
      medianPrice: null,
      medianShippingPrice: null,
      currency: null,
      comparableCount: 2,
      reason: "insufficient_comps",
    });
  });

  it("flags insufficient_comps when zero comps are found", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(JSON.stringify({ keyword: "x", totalItems: 0, items: [] }))
    );
    vi.stubGlobal("fetch", fetchMock);

    const [result] = await enrichCandidates([makeCandidate()], "sc_test_key");

    expect(result.ebayPriceEstimate.available).toBe(false);
    expect(result.ebayPriceEstimate.comparableCount).toBe(0);
    expect(result.ebayPriceEstimate.reason).toBe("insufficient_comps");
  });

  it("caps lookups at the first 20 candidates and skips the API call for the rest (AC-4)", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(loadFixture("soldcomps-response.json")));
    vi.stubGlobal("fetch", fetchMock);

    const candidates = Array.from({ length: LOOKUP_CAP + 5 }, (_, i) =>
      makeCandidate({ id: i, url: `https://www.vinted.co.uk/items/${i}` })
    );

    const results = await enrichCandidates(candidates, "sc_test_key");

    expect(fetchMock).toHaveBeenCalledTimes(LOOKUP_CAP);
    expect(results.slice(0, LOOKUP_CAP).every((r) => r.ebayPriceEstimate.reason !== "capped")).toBe(
      true
    );
    const cappedOnes = results.slice(LOOKUP_CAP);
    expect(cappedOnes.every((r) => r.ebayPriceEstimate.reason === "capped")).toBe(true);
    expect(cappedOnes.every((r) => r.ebayPriceEstimate.available === false)).toBe(true);
  });

  it("throws SoldCompsConfigError and makes no API calls when no key is provided (AC-5)", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    // Pass an explicit empty string rather than relying on the default
    // parameter's process.env fallback, since a real SOLDCOMPS_API_KEY may
    // be set in the ambient dev environment running these tests.
    await expect(enrichCandidates([makeCandidate()], "")).rejects.toThrow(SoldCompsConfigError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails fast on a request error without processing later candidates (AC-6)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(loadFixture("soldcomps-response.json")))
      .mockResolvedValueOnce(new Response("Internal error", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    const candidates = [
      makeCandidate({ id: 1 }),
      makeCandidate({ id: 2 }),
      makeCandidate({ id: 3 }),
    ];

    await expect(enrichCandidates(candidates, "sc_test_key")).rejects.toThrow(
      SoldCompsRequestError
    );
    expect(fetchMock).toHaveBeenCalledTimes(2); // stops after the 2nd (failing) candidate
  });
});

describe("main() CLI", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("prints a clean error and sets a non-zero exit code when SOLDCOMPS_API_KEY is unset (AC-5)", async () => {
    const originalKey = process.env.SOLDCOMPS_API_KEY;
    delete process.env.SOLDCOMPS_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const originalArgv = process.argv;
    process.argv = [...originalArgv.slice(0, 2), path.join(__dirname, "fixtures/candidates.json")];
    const stderrWrite = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const originalExitCode = process.exitCode;
    process.exitCode = undefined;

    await expect(main()).resolves.toBeUndefined();

    expect(process.exitCode).toBe(1);
    expect(stderrWrite).toHaveBeenCalledWith(expect.stringMatching(/SOLDCOMPS_API_KEY/));
    expect(fetchMock).not.toHaveBeenCalled();

    process.argv = originalArgv;
    process.exitCode = originalExitCode;
    if (originalKey !== undefined) process.env.SOLDCOMPS_API_KEY = originalKey;
  });

  it("reads candidates from a file argument and prints enriched JSON to stdout", async () => {
    process.env.SOLDCOMPS_API_KEY = "sc_test_key";
    const fetchMock = vi.fn(async () => jsonResponse(loadFixture("soldcomps-response.json")));
    vi.stubGlobal("fetch", fetchMock);

    const originalArgv = process.argv;
    process.argv = [...originalArgv.slice(0, 2), path.join(__dirname, "fixtures/candidates.json")];
    const stdoutWrite = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await main();

    const printed = stdoutWrite.mock.calls[0][0] as string;
    const parsed = JSON.parse(printed);
    expect(parsed[0].ebayPriceEstimate.available).toBe(true);
    expect(parsed[0].ebayPriceEstimate.medianPrice).toBe(75);

    process.argv = originalArgv;
  });
});
