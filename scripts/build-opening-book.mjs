// Regenerates lib/openings/book-data.json from the Lichess chess-openings
// dataset (https://github.com/lichess-org/chess-openings, CC0).
//
//   node scripts/build-opening-book.mjs            # download the TSVs
//   node scripts/build-opening-book.mjs ./tsv-dir  # or read a local copy
//
// Output: [eco, name, "e4 d5 exd5 Qxd5"][] — SAN with move numbers removed.
// Positions are computed in the browser (lib/openings/book.ts), which keeps
// the file small and lets transpositions match by position.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SOURCE = "https://raw.githubusercontent.com/lichess-org/chess-openings/master/";
const OUT = fileURLToPath(new URL("../lib/openings/book-data.json", import.meta.url));
const dir = process.argv[2];

const rows = [];
for (const f of ["a", "b", "c", "d", "e"]) {
  const text = dir ? readFileSync(`${dir}/${f}.tsv`, "utf8") : await (await fetch(`${SOURCE}${f}.tsv`)).text();
  const lines = text.trim().split("\n");
  if (lines[0] !== "eco\tname\tpgn") throw new Error(`${f}.tsv: unexpected header ${lines[0]}`);
  for (const line of lines.slice(1)) {
    const [eco, name, pgn] = line.split("\t");
    const sans = pgn.replace(/\d+\.(\.\.)?/g, " ").trim().split(/\s+/).join(" ");
    rows.push([eco, name, sans]);
  }
}
writeFileSync(OUT, JSON.stringify(rows).replace(/\],\[/g, "],\n[") + "\n");
console.log(`wrote ${rows.length} openings to ${OUT}`);
