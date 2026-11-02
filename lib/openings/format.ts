// Move-list and number formatting shared by the openings views.

/** "3.Nf3" for White's ply 4 (0-based), "3...Nc6" for Black's. */
export function moveLabel(san: string, ply: number): string {
  const n = Math.floor(ply / 2) + 1;
  return ply % 2 === 0 ? `${n}.${san}` : `${n}...${san}`;
}

/** "1.e4 e5 2.Nf3 Nc6", optionally starting part-way through a game. */
export function formatLine(sans: string[], startPly = 0): string {
  const parts: string[] = [];
  sans.forEach((san, i) => {
    const ply = startPly + i;
    if (ply % 2 === 0) parts.push(`${ply / 2 + 1}.${san}`);
    else parts.push(i === 0 ? `${Math.floor(ply / 2) + 1}...${san}` : san);
  });
  return parts.join(" ");
}

export const pct = (x: number) => `${Math.round(x * 100)}%`;

export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

/** "the Scandinavian Defense" reads better than "Scandinavian Defense" mid-sentence. */
export function withArticle(name: string): string {
  // "Petrov's Defense" names a person and takes no article; "the King's Pawn Game" does.
  if (/^the /i.test(name) || (/^[A-Z][a-z]+'s /.test(name) && !/^(King|Queen|Bishop)'s /.test(name))) return name;
  return `the ${name}`;
}

export function shortDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
