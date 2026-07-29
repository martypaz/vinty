import type { VintedSearchResponse } from "./types.js";

const DEFAULT_BASE_URL = "https://www.vinted.co.uk";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export class VintedRequestError extends Error {}

interface SearchPageParams {
  searchText: string;
  priceTo: number;
  page: number;
  perPage: number;
}

function isValidSearchResponse(data: unknown): data is VintedSearchResponse {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  if (!Array.isArray(d.items)) return false;
  if (!d.pagination || typeof d.pagination !== "object") return false;
  const p = d.pagination as Record<string, unknown>;
  return typeof p.total_entries === "number";
}

/**
 * Vinted has no official public API for browsing listings. This client talks
 * to the same unauthenticated endpoint the vinted.co.uk web app itself uses,
 * which requires an anonymous session cookie (obtained by loading the
 * homepage) but never account credentials or login (see MAR-5 AC-5).
 */
export class VintedClient {
  private cookies = new Map<string, string>();
  private sessionReady = false;
  private readonly baseUrl: string;

  constructor(baseUrl: string = process.env.VINTED_BASE_URL ?? DEFAULT_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  private applySetCookies(headers: Headers): void {
    const setCookie =
      typeof headers.getSetCookie === "function" ? headers.getSetCookie() : [];
    for (const raw of setCookie) {
      const pair = raw.split(";", 1)[0] ?? "";
      const eq = pair.indexOf("=");
      if (eq === -1) continue;
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      if (name) this.cookies.set(name, value);
    }
  }

  private cookieHeader(): string {
    return Array.from(this.cookies.entries())
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
  }

  private async ensureSession(): Promise<void> {
    if (this.sessionReady) return;
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/`, {
        headers: { "User-Agent": USER_AGENT },
      });
    } catch (err) {
      throw new VintedRequestError(
        `Could not reach Vinted to start a session: ${(err as Error).message}`
      );
    }
    if (!response.ok) {
      throw new VintedRequestError(
        `Vinted returned HTTP ${response.status} while starting a session`
      );
    }
    this.applySetCookies(response.headers);
    this.sessionReady = true;
  }

  async searchPage(params: SearchPageParams): Promise<VintedSearchResponse> {
    await this.ensureSession();

    const url = new URL(`${this.baseUrl}/api/v2/catalog/items`);
    url.searchParams.set("search_text", params.searchText);
    url.searchParams.set("price_to", String(params.priceTo));
    url.searchParams.set("order", "newest_first");
    url.searchParams.set("per_page", String(params.perPage));
    url.searchParams.set("page", String(params.page));

    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "application/json",
          Cookie: this.cookieHeader(),
        },
      });
    } catch (err) {
      throw new VintedRequestError(`Could not reach Vinted: ${(err as Error).message}`);
    }
    if (!response.ok) {
      throw new VintedRequestError(
        `Vinted returned HTTP ${response.status} for search "${params.searchText}"`
      );
    }
    this.applySetCookies(response.headers);

    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new VintedRequestError("Vinted returned a response that was not valid JSON");
    }
    if (!isValidSearchResponse(data)) {
      throw new VintedRequestError("Vinted returned an unexpected response shape");
    }
    return data;
  }
}
