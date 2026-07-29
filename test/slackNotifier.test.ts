import { describe, expect, it, vi } from "vitest";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { notifyCandidates, SlackConfigError, main, DEFAULT_CHANNEL } from "../src/slackNotifier.js";
import type { EvaluatedCandidateItem } from "../src/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function makeEvaluatedCandidate(
  overrides: Partial<EvaluatedCandidateItem> = {}
): EvaluatedCandidateItem {
  return {
    id: 1,
    title: "Barbour Puffer coat",
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
    profitEvaluation: {
      eligible: true,
      vintedCostBasis: 17,
      postageCost: 11,
      ebayFees: 0,
      netProfit: 47,
      marginPercent: 62.67,
      meetsThreshold: true,
      ...overrides.profitEvaluation,
    },
    ...overrides,
  };
}

function slackJson(body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status: 200 });
}

describe("notifyCandidates", () => {
  it("posts a message with the documented fields for a qualifying candidate (AC-2, AC-4)", async () => {
    const fetchMock = vi.fn(async () => slackJson({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const candidate = makeEvaluatedCandidate();
    const [result] = await notifyCandidates([candidate], "xoxb-test-token");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://slack.com/api/chat.postMessage");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.channel).toBe(DEFAULT_CHANNEL);
    expect(body.text).toContain("Barbour Puffer coat");
    expect(body.text).toContain("£15.00");
    expect(body.text).toContain("£75.00");
    expect(body.text).toContain("£47.00");
    const sectionText = body.blocks[0].text.text;
    expect(sectionText).toContain(candidate.url);
    expect(sectionText).toContain("Brand: Barbour");
    expect(sectionText).toContain("Condition: Very good");
    expect(sectionText).toContain("Size: M");
    expect(body.blocks[1]).toEqual({
      type: "image",
      image_url: candidate.photos[0],
      alt_text: candidate.title,
    });

    expect(result.notification).toEqual({ attempted: true, success: true, error: null });
  });

  it("does not call Slack for a candidate that doesn't meet the threshold (AC-3)", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const candidate = makeEvaluatedCandidate({
      profitEvaluation: {
        eligible: true,
        vintedCostBasis: 17,
        postageCost: 11,
        ebayFees: 0,
        netProfit: 2,
        marginPercent: 5,
        meetsThreshold: false,
      },
    });
    const [result] = await notifyCandidates([candidate], "xoxb-test-token");

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.notification).toEqual({ attempted: false, success: null, error: null });
  });

  it("does not crash on a malformed candidate missing profitEvaluation", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const malformed = { ...makeEvaluatedCandidate() } as Record<string, unknown>;
    delete malformed.profitEvaluation;

    const [result] = await notifyCandidates(
      [malformed as unknown as EvaluatedCandidateItem],
      "xoxb-test-token"
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.notification).toEqual({ attempted: false, success: null, error: null });
  });

  it("continues to later candidates after one Slack post fails (AC-5)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(slackJson({ ok: false, error: "channel_not_found" }))
      .mockResolvedValueOnce(slackJson({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const candidates = [
      makeEvaluatedCandidate({ id: 1 }),
      makeEvaluatedCandidate({ id: 2 }),
    ];
    const results = await notifyCandidates(candidates, "xoxb-test-token");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(results[0].notification).toEqual({
      attempted: true,
      success: false,
      error: "channel_not_found",
    });
    expect(results[1].notification).toEqual({ attempted: true, success: true, error: null });
  });

  it("throws SlackConfigError and makes no API calls when no token is provided (AC-6)", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(notifyCandidates([makeEvaluatedCandidate()], "")).rejects.toThrow(
      SlackConfigError
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("main() CLI", () => {
  it("prints a clean error and non-zero exit code for invalid JSON input (AC-7)", async () => {
    process.env.SLACK_BOT_TOKEN = "xoxb-test-token";
    const originalArgv = process.argv;
    process.argv = [...originalArgv.slice(0, 2), path.join(__dirname, "slackNotifier.test.ts")];
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

  it("prints a clean error when SLACK_BOT_TOKEN is unset, before any API calls (AC-6)", async () => {
    const originalToken = process.env.SLACK_BOT_TOKEN;
    delete process.env.SLACK_BOT_TOKEN;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const originalArgv = process.argv;
    process.argv = [
      ...originalArgv.slice(0, 2),
      path.join(__dirname, "fixtures/enriched-candidates.json"),
    ];
    const stderrWrite = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const originalExitCode = process.exitCode;
    process.exitCode = undefined;

    await expect(main()).resolves.toBeUndefined();

    expect(process.exitCode).toBe(1);
    expect(stderrWrite).toHaveBeenCalledWith(expect.stringMatching(/SLACK_BOT_TOKEN/));
    expect(fetchMock).not.toHaveBeenCalled();

    process.argv = originalArgv;
    process.exitCode = originalExitCode;
    stderrWrite.mockRestore();
    if (originalToken !== undefined) process.env.SLACK_BOT_TOKEN = originalToken;
  });
});
