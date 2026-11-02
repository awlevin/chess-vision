// Optional engine evaluations from the Lichess cloud-eval API: free, no
// server of ours, CORS-enabled, and it covers common opening positions well.
//
// Lichess asks for one request at a time and a full minute's pause after a
// 429, so requests go through a single queue. Results (including "no eval
// for this position") are cached in this browser's localStorage. Anything
// that goes wrong resolves to null and the UI simply shows no evaluation.
import { Chess } from "chess.js";

export interface EvalLine {
  uci: string;
  /** Centipawns from White's side; absent when there is a forced mate. */
  cp?: number;
  /** Moves to mate (negative: Black mates). */
  mate?: number;
}

export interface CloudEval {
  depth: number;
  pvs: EvalLine[];
}

const ENDPOINT = "https://lichess.org/api/cloud-eval";
const CACHE_KEY = "op-eval-cache-v1";
const CACHE_MAX = 400;
const SPACING_MS = 300;
const BACKOFF_MS = 60_000;

type Cached = Record<string, CloudEval | null>;
let cache: Cached | null = null;
const inflight = new Map<string, Promise<CloudEval | null>>();
let queue: Promise<unknown> = Promise.resolve();
let pausedUntil = 0;

function readCache(): Cached {
  if (cache) return cache;
  try {
    cache = JSON.parse(window.localStorage.getItem(CACHE_KEY) ?? "{}") as Cached;
  } catch {
    cache = {};
  }
  return cache;
}

function writeCache(fen: string, value: CloudEval | null) {
  const c = readCache();
  c[fen] = value;
  const keys = Object.keys(c);
  if (keys.length > CACHE_MAX) for (const k of keys.slice(0, keys.length - CACHE_MAX)) delete c[k];
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(c));
  } catch {
    // Storage full or blocked: the in-memory copy still helps this visit.
  }
}

/** Position part of a FEN (cloud-eval ignores the move counters). */
const cacheKey = (fen: string) => fen.split(" ").slice(0, 4).join(" ");

export function cloudEval(fen: string, multiPv = 5): Promise<CloudEval | null> {
  const key = cacheKey(fen);
  const cached = readCache();
  if (key in cached) return Promise.resolve(cached[key]);
  const running = inflight.get(key);
  if (running) return running;

  const job = queue.then(async (): Promise<CloudEval | null> => {
    if (Date.now() < pausedUntil) return null;
    try {
      const res = await fetch(`${ENDPOINT}?fen=${encodeURIComponent(fen)}&multiPv=${multiPv}`);
      if (res.status === 429) {
        pausedUntil = Date.now() + BACKOFF_MS;
        return null;
      }
      if (res.status === 404) {
        writeCache(key, null); // Lichess has no evaluation for this position.
        return null;
      }
      if (!res.ok) return null;
      const body = (await res.json()) as { depth: number; pvs: { moves: string; cp?: number; mate?: number }[] };
      const value: CloudEval = {
        depth: body.depth,
        pvs: body.pvs.map((p) => ({ uci: p.moves.split(" ")[0], cp: p.cp, mate: p.mate })),
      };
      writeCache(key, value);
      return value;
    } catch {
      return null;
    } finally {
      await new Promise((r) => setTimeout(r, SPACING_MS));
    }
  });
  queue = job.catch(() => null);
  inflight.set(key, job);
  job.finally(() => inflight.delete(key));
  return job;
}

/** A score in pawns from one side's point of view, for comparing moves. Mates count as ±100. */
export function povScore(line: EvalLine, side: "white" | "black"): number {
  const white = line.mate !== undefined ? Math.sign(line.mate) * 100 : (line.cp ?? 0) / 100;
  return side === "white" ? white : -white;
}

/** "+0.6", "−1.2", "#3" (always from White's side, as engines show it). */
export function formatEval(line: EvalLine): string {
  if (line.mate !== undefined) return `#${line.mate}`;
  const p = (line.cp ?? 0) / 100;
  return `${p > 0 ? "+" : p < 0 ? "−" : ""}${Math.abs(p).toFixed(1)}`;
}

export function uciToSan(fen: string, uci: string): string | null {
  try {
    return new Chess(fen).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san;
  } catch {
    return null;
  }
}
