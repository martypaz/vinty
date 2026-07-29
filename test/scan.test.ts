import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { VintedClient } from "../src/vintedClient.js";
import { runScan, main } from "../src/scan.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sampleResponse = readFileSync(
  path.join(__dirname, "fixtures/sample-search-response.json"),
  "utf-8"
);

function jsonResponse(body: string, init: ResponseInit = {}): Response {
  return new Response(body, { status: 200, ...init });
}

describe("runScan", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("maps, filters, and dedupes candidates from the Vinted search API (AC-2)", async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = input.toString();
      if (url.endsWith("/") && !url.includes("/api/")) {
        return jsonResponse("<html></html>");
      }
      return jsonResponse(sampleResponse);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await runScan(new VintedClient("https://fake.vinted.test"));

    const ids = result.candidates.map((c) => c.id).sort();
    expect(ids).toEqual([1001, 1006, 1007]);

    const withMultiplePhotos = result.candidates.find((c) => c.id === 1001);
    expect(withMultiplePhotos?.photos).toEqual([
      "https://images1.vinted.net/1001-a.jpeg",
      "https://images1.vinted.net/1001-b.jpeg",
    ]);
    expect(withMultiplePhotos?.sellerCountry).toBe("GB");
    expect(withMultiplePhotos?.price).toEqual({ amount: 20, currency: "GBP" });

    // AC-2: falls back to the single `photo` field when `photos` is absent.
    const singlePhotoFallback = result.candidates.find((c) => c.id === 1006);
    expect(singlePhotoFallback?.photos).toEqual([
      "https://images1.vinted.net/1006-single.jpeg",
    ]);

    expect(result.totalReported).toBeGreaterThan(0);
    expect(result.breakdown).toContain("Barbour");
    expect(result.breakdown).toContain("The North Face");
  });

  it("excludes items over the price ceiling, wrong condition, wrong brand, and non-men's listings", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(sampleResponse));
    vi.stubGlobal("fetch", fetchMock);

    const result = await runScan(new VintedClient("https://fake.vinted.test"));
    const ids = result.candidates.map((c) => c.id);

    expect(ids).not.toContain(1002); // over price ceiling
    expect(ids).not.toContain(1003); // condition below "Very good"
    expect(ids).not.toContain(1004); // wrong brand
    expect(ids).not.toContain(1005); // women's listing
    expect(ids).not.toContain(1008); // boys' listing
    expect(ids).not.toContain(1009); // dog listing
    expect(ids).not.toContain(1010); // "child's" possessive form
    expect(ids).not.toContain(1011); // age-only signal, no explicit keyword
    expect(ids).not.toContain(1012); // adult-looking title, kids' sizing in years
  });
});

describe("error handling (AC-4)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("throws a VintedRequestError when the search request fails", async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = input.toString();
      if (url.endsWith("/") && !url.includes("/api/")) {
        return jsonResponse("<html></html>");
      }
      return new Response("Internal error", { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(runScan(new VintedClient("https://fake.vinted.test"))).rejects.toThrow(
      /HTTP 500/
    );
  });

  it("throws when Vinted returns an unexpected response shape", async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = input.toString();
      if (url.endsWith("/") && !url.includes("/api/")) {
        return jsonResponse("<html></html>");
      }
      return jsonResponse(JSON.stringify({ unexpected: true }));
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(runScan(new VintedClient("https://fake.vinted.test"))).rejects.toThrow(
      /unexpected response shape/
    );
  });

  it("main() prints a clean error to stderr and sets a non-zero exit code, without throwing", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("network down");
    });
    vi.stubGlobal("fetch", fetchMock);

    const stderrWrite = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const originalExitCode = process.exitCode;
    process.exitCode = undefined;

    await expect(main()).resolves.toBeUndefined();

    expect(process.exitCode).toBe(1);
    expect(stderrWrite).toHaveBeenCalledWith(expect.stringMatching(/^Error: /));

    process.exitCode = originalExitCode;
  });
});
