// Pulls the main-line SAN moves out of a PGN without a full parser: drops
// headers, {comments} (e.g. Chess.com's [%clk] annotations), ; comments,
// (variations), NAGs, move numbers and the result.

const RESULT = /^(1-0|0-1|1\/2-1\/2|\*)$/;
const MOVE_NUMBER = /^\d+\.+$/;

export function pgnMoves(pgn: string, max = Infinity): string[] {
  let body = pgn.replace(/^\s*\[[^\]\n]*\]\s*$/gm, "").replace(/\{[^}]*\}/g, " ").replace(/;[^\n]*/g, " ");
  // Strip variations, innermost first, so nested ones go too.
  while (body.includes("(")) {
    const next = body.replace(/\([^()]*\)/g, " ");
    if (next === body) break;
    body = next;
  }
  const out: string[] = [];
  for (const raw of body.split(/\s+/)) {
    if (out.length >= max) break;
    // "1.e4" (no space) and "12...Nf6" both occur in the wild.
    const tok = raw.replace(/^\d+\.+/, "");
    if (!tok || MOVE_NUMBER.test(raw) || RESULT.test(tok) || tok.startsWith("$")) continue;
    out.push(tok);
  }
  return out;
}
