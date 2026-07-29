import { describe, expect, it, vi } from "vitest";
import { fileURLToPath } from "node:url";
import path from "node:path";
import Database from "better-sqlite3";

import { notifyCandidates, SlackConfigError, main, DEFAULT_CHANNEL } from "../src/slackNotifier.js";
import { initSchema } from "../src/db.js";
import type { EvaluatedCandidateItem } from "../src/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function makeTestDb(): Database.Database {
  const db = new Database(":memory:");
  initSchema(db);
  return db;
}

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
    const db = makeTestDb();

    const candidate = makeEvaluatedCandidate();
    const [result] = await notifyCandidates([candidate], db, "xoxb-test-token");

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
    const db = makeTestDb();

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
    const [result] = await notifyCandidates([candidate], db, "xoxb-test-token");

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.notification).toEqual({ attempted: false, success: null, error: null });
  });

  it("does not write a non-qualifying candidate to the database (MAR-9 AC-6)", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const db = makeTestDb();

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
    await notifyCandidates([candidate], db, "xoxb-test-token");

    const row = db.prepare("SELECT * FROM listings WHERE vinted_id = ?").get(candidate.id);
    expect(row).toBeUndefined();
  });

  it("does not crash on a malformed candidate missing profitEvaluation", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const db = makeTestDb();

    const malformed = { ...makeEvaluatedCandidate() } as Record<string, unknown>;
    delete malformed.profitEvaluation;

    const [result] = await notifyCandidates(
      [malformed as unknown as EvaluatedCandidateItem],
      db,
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
    const db = makeTestDb();

    const candidates = [
      makeEvaluatedCandidate({ id: 1 }),
      makeEvaluatedCandidate({ id: 2 }),
    ];
    const results = await notifyCandidates(candidates, db, "xoxb-test-token");

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
    const db = makeTestDb();

    await expect(notifyCandidates([makeEvaluatedCandidate()], db, "")).rejects.toThrow(
      SlackConfigError
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("creates a new row with the documented fields for a qualifying candidate (MAR-9 AC-1, AC-2)", async () => {
    const fetchMock = vi.fn(async () => slackJson({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const db = makeTestDb();

    const candidate = makeEvaluatedCandidate();
    await notifyCandidates([candidate], db, "xoxb-test-token");

    const row = db
      .prepare("SELECT * FROM listings WHERE vinted_id = ?")
      .get(candidate.id) as Record<string, unknown>;

    expect(row).toBeDefined();
    expect(row.title).toBe(candidate.title);
    expect(row.brand).toBe(candidate.brand);
    expect(row.condition).toBe(candidate.condition);
    expect(row.vinted_price_amount).toBe(candidate.price.amount);
    expect(row.vinted_price_currency).toBe(candidate.price.currency);
    expect(row.size).toBe(candidate.size);
    expect(row.vinted_url).toBe(candidate.url);
    expect(JSON.parse(row.photos as string)).toEqual(candidate.photos);
    expect(row.ebay_median_price).toBe(candidate.ebayPriceEstimate.medianPrice);
    expect(row.ebay_median_shipping_price).toBe(candidate.ebayPriceEstimate.medianShippingPrice);
    expect(row.ebay_comparable_count).toBe(candidate.ebayPriceEstimate.comparableCount);
    expect(row.vinted_cost_basis).toBe(candidate.profitEvaluation.vintedCostBasis);
    expect(row.postage_cost).toBe(candidate.profitEvaluation.postageCost);
    expect(row.ebay_fees).toBe(candidate.profitEvaluation.ebayFees);
    expect(row.net_profit).toBe(candidate.profitEvaluation.netProfit);
    expect(row.margin_percent).toBe(candidate.profitEvaluation.marginPercent);
    expect(row.status).toBe("new");
    expect(row.created_at).toBeTruthy();
    expect(row.updated_at).toBeTruthy();
  });

  it("upserts by Vinted item id without creating a duplicate row (MAR-9 AC-2)", async () => {
    const fetchMock = vi.fn(async () => slackJson({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const db = makeTestDb();

    const candidate = makeEvaluatedCandidate();
    await notifyCandidates([candidate], db, "xoxb-test-token");

    const updatedCandidate = makeEvaluatedCandidate({
      title: "Updated title after rescan",
      ebayPriceEstimate: {
        ...candidate.ebayPriceEstimate,
        medianPrice: 999,
      },
    });
    await notifyCandidates([updatedCandidate], db, "xoxb-test-token");

    const rows = db.prepare("SELECT * FROM listings WHERE vinted_id = ?").all(candidate.id);
    expect(rows).toHaveLength(1);
    const row = rows[0] as Record<string, unknown>;
    expect(row.title).toBe("Updated title after rescan");
    expect(row.ebay_median_price).toBe(999);
  });

  it("does not overwrite a status that has already progressed past 'new' (MAR-9 AC-2)", async () => {
    const fetchMock = vi.fn(async () => slackJson({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const db = makeTestDb();

    const candidate = makeEvaluatedCandidate();
    await notifyCandidates([candidate], db, "xoxb-test-token");
    db.prepare("UPDATE listings SET status = 'ordered' WHERE vinted_id = ?").run(candidate.id);

    await notifyCandidates([candidate], db, "xoxb-test-token");

    const row = db
      .prepare("SELECT status FROM listings WHERE vinted_id = ?")
      .get(candidate.id) as { status: string };
    expect(row.status).toBe("ordered");
  });

  it("treats a DB upsert failure the same as a Slack failure and continues the batch (MAR-9 AC-3, AC-4, AC-5)", async () => {
    const fetchMock = vi.fn(async () => slackJson({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const db = makeTestDb();
    db.close(); // every upsert attempt will now throw

    const candidates = [makeEvaluatedCandidate({ id: 1 }), makeEvaluatedCandidate({ id: 2 })];
    const results = await notifyCandidates(candidates, db, "xoxb-test-token");

    expect(fetchMock).toHaveBeenCalledTimes(2); // both Slack posts still attempted
    for (const result of results) {
      expect(result.notification.attempted).toBe(true);
      expect(result.notification.success).toBe(false);
      expect(result.notification.error).toBeTruthy();
    }
  });
});

describe("main() CLI", () => {
  it("prints a clean error and non-zero exit code for invalid JSON input (AC-7)", async () => {
    process.env.SLACK_BOT_TOKEN = "xoxb-test-token";
    process.env.VINTY_DB_PATH = ":memory:";
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
    delete process.env.VINTY_DB_PATH;
  });

  it("prints a clean error when SLACK_BOT_TOKEN is unset, before any API calls (AC-6)", async () => {
    const originalToken = process.env.SLACK_BOT_TOKEN;
    delete process.env.SLACK_BOT_TOKEN;
    process.env.VINTY_DB_PATH = ":memory:";
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
    delete process.env.VINTY_DB_PATH;
    if (originalToken !== undefined) process.env.SLACK_BOT_TOKEN = originalToken;
  });
});
