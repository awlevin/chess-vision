import type { Color } from "@/lib/games";
import { FastPosition, toUci } from "@/lib/chess/fast";

/** UCI moves for a SAN line from the start, stopping at the first that doesn't parse. */
export function sansToUcis(sans: string[]): string[] {
  const pos = FastPosition.start();
  const out: string[] = [];
  for (const san of sans) {
    const m = pos.play(san);
    if (!m) break;
    out.push(toUci(m));
  }
  return out;
}

export const homeHref = (color: Color) => `/openings?color=${color}`;

/** The explorer, opened at a line. Moves are UCI joined by "-" (e.g. "e2e4-d7d5"). */
export function explorerHref(color: Color, sans: string[] = []): string {
  const moves = sansToUcis(sans).join("-");
  return `/openings/explorer?color=${color}${moves ? `&moves=${moves}` : ""}`;
}

export interface TrainerLink {
  /** "leaks" drills the worst positions; omitted, the due ones. */
  mode?: "leaks";
  /** Drill only this line (SAN from the start) and what follows it. */
  line?: string[];
  /** Start straight away. */
  go?: boolean;
}

export function trainerHref(color: Color, opts: TrainerLink = {}): string {
  const q = new URLSearchParams({ color });
  if (opts.mode) q.set("mode", opts.mode);
  if (opts.line?.length) q.set("line", opts.line.join(" "));
  if (opts.go) q.set("go", "1");
  return `/openings/train?${q.toString()}`;
}

export const leaksHref = (color: Color) => `/openings/leaks?color=${color}`;
export const repertoireHref = (color: Color) => `/openings/repertoire?color=${color}`;
