export class SlackConfigError extends Error {}
export class SlackApiError extends Error {}

const SLACK_API_BASE = "https://slack.com/api";
// Slack's chat.delete is Tier 3 (~1 req/sec sustained); pace deletes close
// to that limit so we rarely hit a 429, and retry (honoring Retry-After)
// on the rare occasions we do — verified against a real 56-message batch,
// which produced 2 real 429s at a 350ms delay before this was added.
const DEFAULT_DELETE_DELAY_MS = 1100;
const MAX_RATE_LIMIT_RETRIES = 3;

interface SlackHistoryMessage {
  ts: string;
  bot_id?: string;
}

interface SlackApiResult {
  ok: boolean;
  error?: string;
  [key: string]: unknown;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRateLimitRetry(url: string | URL, init?: RequestInit): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, init);
    if (res.status !== 429 || attempt >= MAX_RATE_LIMIT_RETRIES) {
      return res;
    }
    const retryAfterSeconds = Number(res.headers.get("Retry-After"));
    await sleep((Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0 ? retryAfterSeconds : 1) * 1000);
  }
}

async function parseSlackResponse(res: Response): Promise<SlackApiResult> {
  if (!res.ok) {
    throw new SlackApiError(`Slack returned HTTP ${res.status}`);
  }
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new SlackApiError("Slack returned a response that was not valid JSON");
  }
  if (!data || typeof data !== "object") {
    throw new SlackApiError("Slack returned an unexpected response shape");
  }
  return data as SlackApiResult;
}

async function slackGet(
  token: string,
  method: string,
  params: Record<string, string>
): Promise<SlackApiResult> {
  const url = new URL(`${SLACK_API_BASE}/${method}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  const res = await fetchWithRateLimitRetry(url, { headers: { Authorization: `Bearer ${token}` } });
  return parseSlackResponse(res);
}

async function slackPost(
  token: string,
  method: string,
  body: Record<string, unknown>
): Promise<SlackApiResult> {
  const res = await fetchWithRateLimitRetry(`${SLACK_API_BASE}/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body),
  });
  return parseSlackResponse(res);
}

export interface ClearApprovalsResult {
  deletedCount: number;
  failedCount: number;
  errors: string[];
}

export async function clearApprovalsPosts(
  token: string | undefined = process.env.SLACK_BOT_TOKEN,
  channelId: string | undefined = process.env.SLACK_APPROVALS_CHANNEL_ID,
  deleteDelayMs: number = DEFAULT_DELETE_DELAY_MS
): Promise<ClearApprovalsResult> {
  if (!token) {
    throw new SlackConfigError("SLACK_BOT_TOKEN environment variable is not set");
  }
  if (!channelId) {
    throw new SlackConfigError("SLACK_APPROVALS_CHANNEL_ID environment variable is not set");
  }

  const authResult = await slackGet(token, "auth.test", {});
  if (!authResult.ok) {
    throw new SlackApiError(authResult.error ?? "Unknown Slack error from auth.test");
  }
  const botId = authResult.bot_id as string | undefined;
  if (!botId) {
    throw new SlackApiError("Could not determine this bot's own bot_id from auth.test");
  }

  const botMessages: SlackHistoryMessage[] = [];
  let cursor: string | undefined;
  do {
    const historyResult = await slackGet(token, "conversations.history", {
      channel: channelId,
      limit: "200",
      ...(cursor ? { cursor } : {}),
    });
    if (!historyResult.ok) {
      throw new SlackApiError(historyResult.error ?? "Unknown Slack error from conversations.history");
    }
    const messages = (historyResult.messages ?? []) as SlackHistoryMessage[];
    for (const message of messages) {
      if (message.bot_id === botId) {
        botMessages.push(message);
      }
    }
    const responseMetadata = historyResult.response_metadata as { next_cursor?: string } | undefined;
    cursor = responseMetadata?.next_cursor || undefined;
  } while (cursor);

  let deletedCount = 0;
  const errors: string[] = [];
  for (const message of botMessages) {
    try {
      const deleteResult = await slackPost(token, "chat.delete", { channel: channelId, ts: message.ts });
      if (deleteResult.ok) {
        deletedCount++;
      } else {
        errors.push(deleteResult.error ?? "Unknown error deleting message");
      }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : "Unknown error deleting message");
    }
    await sleep(deleteDelayMs);
  }

  return { deletedCount, failedCount: errors.length, errors };
}
