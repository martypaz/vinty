import { describe, expect, it, vi } from "vitest";

import { clearApprovalsPosts, SlackApiError, SlackConfigError } from "../src/slackTools.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("clearApprovalsPosts", () => {
  it("pages through history and deletes only this bot's own messages (AC-2)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ ok: true, bot_id: "B123" })) // auth.test
      .mockResolvedValueOnce(
        jsonResponse({
          ok: true,
          messages: [
            { ts: "1.1", bot_id: "B123" },
            { ts: "1.2", user: "U1" },
            { ts: "1.3", bot_id: "BOTHER" },
          ],
          response_metadata: { next_cursor: "cursor1" },
        })
      ) // history page 1
      .mockResolvedValueOnce(
        jsonResponse({
          ok: true,
          messages: [{ ts: "2.1", bot_id: "B123" }],
          response_metadata: { next_cursor: "" },
        })
      ) // history page 2
      .mockResolvedValueOnce(jsonResponse({ ok: true })) // chat.delete 1.1
      .mockResolvedValueOnce(jsonResponse({ ok: true })); // chat.delete 2.1
    vi.stubGlobal("fetch", fetchMock);

    const result = await clearApprovalsPosts("xoxb-test", "C123", 0);

    expect(result).toEqual({ deletedCount: 2, failedCount: 0, errors: [] });
    expect(fetchMock).toHaveBeenCalledTimes(5);

    const deleteCalls = fetchMock.mock.calls.slice(3);
    const deletedTs = deleteCalls.map(([, init]) => JSON.parse((init as RequestInit).body as string).ts);
    expect(deletedTs).toEqual(["1.1", "2.1"]);

    vi.unstubAllGlobals();
  });

  it("reports a partial delete failure without stopping the batch (AC-5)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ ok: true, bot_id: "B123" }))
      .mockResolvedValueOnce(
        jsonResponse({
          ok: true,
          messages: [
            { ts: "1.1", bot_id: "B123" },
            { ts: "1.2", bot_id: "B123" },
          ],
          response_metadata: {},
        })
      )
      .mockResolvedValueOnce(jsonResponse({ ok: true }))
      .mockResolvedValueOnce(jsonResponse({ ok: false, error: "cant_delete_message" }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await clearApprovalsPosts("xoxb-test", "C123", 0);

    expect(result).toEqual({ deletedCount: 1, failedCount: 1, errors: ["cant_delete_message"] });

    vi.unstubAllGlobals();
  });

  it("returns zero counts and makes no delete calls when there are no matching bot messages (AC-7)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ ok: true, bot_id: "B123" }))
      .mockResolvedValueOnce(
        jsonResponse({ ok: true, messages: [{ ts: "1.1", user: "U1" }], response_metadata: {} })
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await clearApprovalsPosts("xoxb-test", "C123", 0);

    expect(result).toEqual({ deletedCount: 0, failedCount: 0, errors: [] });
    expect(fetchMock).toHaveBeenCalledTimes(2); // auth.test + one history page, no deletes

    vi.unstubAllGlobals();
  });

  it("retries a rate-limited chat.delete call, honoring Retry-After, and still succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ ok: true, bot_id: "B123" }))
      .mockResolvedValueOnce(
        jsonResponse({ ok: true, messages: [{ ts: "1.1", bot_id: "B123" }], response_metadata: {} })
      )
      .mockResolvedValueOnce(new Response(null, { status: 429, headers: { "Retry-After": "1" } }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await clearApprovalsPosts("xoxb-test", "C123", 0);

    expect(result).toEqual({ deletedCount: 1, failedCount: 0, errors: [] });
    expect(fetchMock).toHaveBeenCalledTimes(4);

    vi.unstubAllGlobals();
  });

  it("throws SlackApiError when auth.test fails, e.g. a missing scope (AC-6)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ ok: false, error: "missing_scope" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(clearApprovalsPosts("xoxb-test", "C123", 0)).rejects.toThrow(SlackApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1); // stops before history/delete calls

    vi.unstubAllGlobals();
  });

  it("throws SlackApiError when conversations.history fails, e.g. an invalid channel (AC-6)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ ok: true, bot_id: "B123" }))
      .mockResolvedValueOnce(jsonResponse({ ok: false, error: "channel_not_found" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(clearApprovalsPosts("xoxb-test", "C-invalid", 0)).rejects.toThrow(SlackApiError);

    vi.unstubAllGlobals();
  });

  it("throws SlackConfigError and makes no API calls when no token is provided", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(clearApprovalsPosts("", "C123", 0)).rejects.toThrow(SlackConfigError);
    expect(fetchMock).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it("throws SlackConfigError and makes no API calls when no channel id is provided", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(clearApprovalsPosts("xoxb-test", "", 0)).rejects.toThrow(SlackConfigError);
    expect(fetchMock).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });
});
