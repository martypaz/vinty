import { readFileSync } from "node:fs";

import type { EvaluatedCandidateItem, NotifiedCandidateItem, SlackNotificationResult } from "./types.js";

export const DEFAULT_CHANNEL = "#approvals";

export class SlackConfigError extends Error {}

interface SlackPostResult {
  ok: boolean;
  error?: string;
}

function formatMoney(amount: number): string {
  return `£${amount.toFixed(2)}`;
}

function buildMessage(candidate: EvaluatedCandidateItem): { text: string; blocks: Record<string, unknown>[] } {
  const { title, brand, condition, size, price, url, ebayPriceEstimate, profitEvaluation, photos } = candidate;
  const medianPrice = ebayPriceEstimate.medianPrice as number;
  const netProfit = profitEvaluation.netProfit as number;
  const marginPercent = profitEvaluation.marginPercent as number;

  const text =
    `${title} — ${formatMoney(price.amount)} on Vinted, est. eBay ${formatMoney(medianPrice)}, ` +
    `profit ${formatMoney(netProfit)} (${marginPercent.toFixed(2)}% margin)`;

  const blocks: Record<string, unknown>[] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text:
          `*<${url}|${title}>*\n` +
          `Brand: ${brand} | Condition: ${condition} | Size: ${size}\n` +
          `Vinted price: ${formatMoney(price.amount)}\n` +
          `eBay median sold price: ${formatMoney(medianPrice)}\n` +
          `Net profit: ${formatMoney(netProfit)} (${marginPercent.toFixed(2)}% margin)`,
      },
    },
  ];

  if (photos.length > 0) {
    blocks.push({ type: "image", image_url: photos[0], alt_text: title });
  }

  return { text, blocks };
}

async function postSlackMessage(
  token: string,
  channel: string,
  candidate: EvaluatedCandidateItem
): Promise<SlackPostResult> {
  const { text, blocks } = buildMessage(candidate);

  let response: Response;
  try {
    response = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({ channel, text, blocks }),
    });
  } catch (err) {
    return { ok: false, error: `Could not reach Slack: ${(err as Error).message}` };
  }

  if (!response.ok) {
    return { ok: false, error: `Slack returned HTTP ${response.status}` };
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    return { ok: false, error: "Slack returned a response that was not valid JSON" };
  }

  if (!data || typeof data !== "object") {
    return { ok: false, error: "Slack returned an unexpected response shape" };
  }
  const parsed = data as { ok?: boolean; error?: string };
  if (!parsed.ok) {
    return { ok: false, error: parsed.error ?? "Unknown Slack error" };
  }
  return { ok: true };
}

export async function notifyCandidates(
  candidates: EvaluatedCandidateItem[],
  token: string | undefined = process.env.SLACK_BOT_TOKEN,
  channel: string = process.env.SLACK_CHANNEL ?? DEFAULT_CHANNEL
): Promise<NotifiedCandidateItem[]> {
  if (!token) {
    throw new SlackConfigError("SLACK_BOT_TOKEN environment variable is not set");
  }

  const results: NotifiedCandidateItem[] = [];
  for (const candidate of candidates) {
    if (!candidate.profitEvaluation.meetsThreshold) {
      const notification: SlackNotificationResult = { attempted: false, success: null, error: null };
      results.push({ ...candidate, notification });
      continue;
    }

    const result = await postSlackMessage(token, channel, candidate);
    const notification: SlackNotificationResult = {
      attempted: true,
      success: result.ok,
      error: result.ok ? null : (result.error ?? "Unknown Slack error"),
    };
    results.push({ ...candidate, notification });
  }
  return results;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

function parseCandidates(raw: string): EvaluatedCandidateItem[] {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("Input is not valid JSON");
  }
  if (!Array.isArray(data)) {
    throw new Error("Input JSON must be an array of candidate items");
  }
  return data as EvaluatedCandidateItem[];
}

export async function main(): Promise<void> {
  try {
    const filePath = process.argv[2];
    const raw = filePath ? readFileSync(filePath, "utf-8") : await readStdin();
    const candidates = parseCandidates(raw);
    const notified = await notifyCandidates(candidates);

    process.stdout.write(`${JSON.stringify(notified, null, 2)}\n`);

    const channel = process.env.SLACK_CHANNEL ?? DEFAULT_CHANNEL;
    const attempted = notified.filter((c) => c.notification.attempted);
    const succeeded = attempted.filter((c) => c.notification.success);
    const failedCount = attempted.length - succeeded.length;
    process.stderr.write(
      `Posted ${succeeded.length} of ${attempted.length} profitable candidates to ${channel} (${failedCount} failed).\n`
    );
    if (failedCount > 0) {
      process.exitCode = 1;
    }
  } catch (err) {
    const message =
      err instanceof SlackConfigError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Unknown error while notifying Slack";
    process.stderr.write(`Error: ${message}\n`);
    process.exitCode = 1;
  }
}
