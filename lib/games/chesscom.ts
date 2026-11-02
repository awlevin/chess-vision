// A small client for the Chess.com published-data API
// (https://www.chess.com/news/view/published-data-api). The API sends
// `access-control-allow-origin: *`, so the browser calls it directly.
//
// Chess.com asks clients to make requests one at a time; the sync loop in
// store.ts awaits each call before starting the next. This module only adds
// retries with backoff for rate limits (429) and transient failures.
import type { ChessComGame } from "./normalize";

const API = "https://api.chess.com/pub/player";

/** Delays before each retry, in ms. Jittered by ±25%. */
const RETRY_DELAYS = [600, 1500, 4000];
/** Never wait longer than this for a Retry-After header. */
const MAX_RETRY_AFTER_MS = 30_000;

export type ChessComErrorKind =
  | "not-found"
  | "rate-limited"
  | "server"
  | "network"
  | "bad-response";

export class ChessComError extends Error {
  constructor(message: string, readonly kind: ChessComErrorKind, readonly status?: number) {
    super(message);
    this.name = "ChessComError";
  }
}

export interface ChessComProfile {
  username: string;
  /** Profile page; its last segment keeps the player's own capitalisation. */
  url?: string;
  /** The player's real name, when they have set one. */
  name?: string;
  avatar?: string;
}

interface RequestOptions {
  signal?: AbortSignal;
}

function abortError(): DOMException {
  return new DOMException("The sync was cancelled.", "AbortError");
}

export function isAbortError(e: unknown): boolean {
  return e instanceof DOMException && e.name === "AbortError";
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    const t = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(abortError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function retryAfterMs(res: Response): number | null {
  // Not CORS-exposed by Chess.com today, but honour it if it ever is.
  const h = res.headers.get("retry-after");
  if (!h) return null;
  const secs = Number(h);
  if (Number.isFinite(secs)) return Math.min(secs * 1000, MAX_RETRY_AFTER_MS);
  const at = Date.parse(h);
  return Number.isFinite(at) ? Math.min(Math.max(at - Date.now(), 0), MAX_RETRY_AFTER_MS) : null;
}

async function getJson<T>(url: string, { signal }: RequestOptions = {}): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    let error: ChessComError;
    let wait: number | null = null;
    try {
      // "no-cache" revalidates with Chess.com (cheap 304s via ETag) so the
      // current month is never served stale from the browser's HTTP cache.
      const res = await fetch(url, { signal, cache: "no-cache" });
      if (res.ok) {
        try {
          return (await res.json()) as T;
        } catch {
          throw new ChessComError("Chess.com sent a response we couldn't read.", "bad-response", res.status);
        }
      }
      if (res.status === 404 || res.status === 410) {
        throw new ChessComError("Not found on Chess.com.", "not-found", res.status);
      }
      if (res.status === 429) {
        error = new ChessComError(
          "Chess.com is limiting requests right now. Try again in a few minutes.",
          "rate-limited",
          429,
        );
        wait = retryAfterMs(res);
      } else if (res.status >= 500) {
        error = new ChessComError(
          `Chess.com is having trouble (error ${res.status}). Try again in a few minutes.`,
          "server",
          res.status,
        );
      } else {
        throw new ChessComError(`Chess.com returned an unexpected error (${res.status}).`, "bad-response", res.status);
      }
    } catch (e) {
      if (signal?.aborted) throw abortError();
      if (e instanceof ChessComError) throw e;
      // fetch() rejects with a TypeError when the network is down or the
      // request is blocked.
      error = new ChessComError("Couldn't reach Chess.com. Check your connection and try again.", "network");
    }
    if (attempt >= RETRY_DELAYS.length) throw error;
    const base = wait ?? RETRY_DELAYS[attempt] * (error.kind === "rate-limited" ? 2 : 1);
    await sleep(base * (0.75 + Math.random() * 0.5), signal);
  }
}

/** Chess.com usernames: 3–25 letters, digits, "_" or "-". */
const USERNAME_RE = /^[a-z0-9_-]{3,25}$/i;

/**
 * Cleans what a person types ("@Hikaru ", or a profile URL) into the
 * lower-cased username the API expects. Throws a readable Error if it can't.
 */
export function parseUsername(input: string): string {
  let s = input.trim();
  const fromUrl = s.match(/chess\.com\/(?:member|players?)\/([^/?#\s]+)/i);
  if (fromUrl) s = fromUrl[1];
  s = s.replace(/^@/, "");
  if (!s) throw new Error("Enter your Chess.com username.");
  if (!USERNAME_RE.test(s)) {
    throw new Error(`“${s}” isn't a valid Chess.com username. Usernames use letters, numbers, “_” and “-”.`);
  }
  return s.toLowerCase();
}

export async function fetchProfile(username: string, opts?: RequestOptions): Promise<ChessComProfile> {
  try {
    return await getJson<ChessComProfile>(`${API}/${encodeURIComponent(username)}`, opts);
  } catch (e) {
    if (e instanceof ChessComError && e.kind === "not-found") {
      throw new ChessComError(
        `No Chess.com player named “${username}” was found. Check the spelling and try again.`,
        "not-found",
        e.status,
      );
    }
    throw e;
  }
}

/** Months with games, as "yyyy/mm", oldest first. */
export async function fetchArchives(username: string, opts?: RequestOptions): Promise<string[]> {
  const body = await getJson<{ archives?: unknown }>(
    `${API}/${encodeURIComponent(username)}/games/archives`,
    opts,
  );
  if (!Array.isArray(body.archives)) {
    throw new ChessComError("Chess.com sent a game list we couldn't read.", "bad-response");
  }
  const months = new Set<string>();
  for (const url of body.archives) {
    const m = typeof url === "string" ? url.match(/(\d{4})\/(\d{2})\/?$/) : null;
    if (m) months.add(`${m[1]}/${m[2]}`);
  }
  return [...months].sort();
}

export async function fetchMonth(username: string, month: string, opts?: RequestOptions): Promise<ChessComGame[]> {
  try {
    const body = await getJson<{ games?: unknown }>(
      `${API}/${encodeURIComponent(username)}/games/${month}`,
      opts,
    );
    if (!Array.isArray(body.games)) {
      throw new ChessComError(`Chess.com sent games for ${month} that we couldn't read.`, "bad-response");
    }
    return body.games as ChessComGame[];
  } catch (e) {
    // A month the archive list named but that has since gone away holds no games.
    if (e instanceof ChessComError && e.kind === "not-found") return [];
    throw e;
  }
}
