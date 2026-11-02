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

/** The explorer, opened at a line. Moves are UCI joined by "-" (e.g. "e2e4-d7d5"). */
export function explorerHref(color: Color, sans: string[] = []): string {
  const moves = sansToUcis(sans).join("-");
  return `/openings/explorer?color=${color}${moves ? `&moves=${moves}` : ""}`;
}

export const trainerHref = (color: Color, mode?: "leaks") => `/openings/train?color=${color}${mode ? `&mode=${mode}` : ""}`;
