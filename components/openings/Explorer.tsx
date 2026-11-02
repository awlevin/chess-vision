"use client";

// Explorer: your games as a move tree. The current line lives in the URL
// (?color=white&moves=e2e4-d7d5) so any position can be linked to.
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Chessboard, type BoardArrow, type BoardMove } from "@/components/board";
import type { Color } from "@/lib/games";
import { fenFromKey } from "@/lib/chess/fast";
import type { Book, BookEntry } from "@/lib/openings/book";
import { formatLine, moveLabel, pct, plural, shortDate } from "@/lib/openings/format";
import { score } from "@/lib/openings/stats";
import { buildTree, EXPLORER_DEPTH, pathTo, walk, type TreeNode } from "@/lib/openings/tree";
import { useOpenings } from "./OpeningsProvider";
import { ColorToggle, FiltersBar, ResultBar, Score, styles as s } from "./ui";

const RESULT_TEXT = { win: "Won", draw: "Drew", loss: "Lost" } as const;

export default function Explorer() {
  const { games, book } = useOpenings();
  const params = useSearchParams();
  const color: Color = params.get("color") === "black" ? "black" : "white";
  const movesParam = params.get("moves") ?? "";
  const tree = useMemo(() => buildTree(games, color), [games, color]);
  const node = useMemo(() => walk(tree, movesParam.split("-").filter(Boolean)), [tree, movesParam]);
  const path = useMemo(() => pathTo(node), [node]);
  const [notice, setNotice] = useState<{ key: string; text: string } | null>(null);

  const line = path.map((n) => n.uci!);
  const go = (ucis: string[], c: Color = color) => {
    const q = new URLSearchParams({ color: c });
    if (ucis.length) q.set("moves", ucis.join("-"));
    window.history.replaceState(null, "", `?${q.toString()}`);
  };
  const back = () => go(line.slice(0, -1));
  const forward = () => node.children[0] && go([...line, node.children[0].uci!]);

  // ← and → step through the line, unless focus is in a control or on the board.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.altKey || e.ctrlKey || e.metaKey || t?.closest("input, select, textarea, [data-square]")) return;
      if (e.key === "ArrowLeft") back();
      else if (e.key === "ArrowRight") forward();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  let opening: BookEntry | null = null;
  for (let i = path.length - 1; i >= 0 && !opening; i--) opening = book?.named.get(path[i].key) ?? null;
  const inBook = node.ply === 0 || !!book?.theory.has(node.key);
  const sans = path.map((n) => n.san!);

  const onMove = (m: BoardMove) => {
    const child = node.children.find((c) => c.uci === m.uci);
    if (child) {
      setNotice(null);
      go([...line, m.uci]);
    } else {
      setNotice({
        key: node.key,
        text: node.ply >= EXPLORER_DEPTH
          ? `The explorer stops after move ${EXPLORER_DEPTH / 2}.`
          : `None of these games has ${moveLabel(m.san, node.ply)} here.`,
      });
    }
  };

  const arrows: BoardArrow[] = node.children.slice(0, 4).map((c) => ({
    from: c.uci!.slice(0, 2),
    to: c.uci!.slice(2, 4),
    tone: "info",
    weight: node.stats.n ? c.stats.n / node.stats.n : 0,
  }));

  return (
    <>
      <FiltersBar extra={<ColorToggle value={color} onChange={(c) => go([], c)} />} />
      {tree.stats.n === 0 ? (
        <section className={s.empty}>
          <h2>{`No games as ${color === "white" ? "White" : "Black"}`}</h2>
          <p>Try a wider time window or another time control.</p>
        </section>
      ) : (
        <div className={s.explorer}>
          <div className={s.boardCol}>
            <div className={s.nameplate} aria-live="polite" data-testid="opening-name">
              {opening ? (
                <>
                  <span className={s.eco}>{opening.eco}</span>
                  <span className={s.name}>{opening.name}</span>
                </>
              ) : (
                <span className={s.name}>{node.ply === 0 ? "Starting position" : "Unnamed position"}</span>
              )}
              <div className={s.sub}>
                {plural(node.stats.n, "game")} · you score {pct(score(node.stats))}
                {!inBook && <span className={s.bookTag}>out of book</span>}
              </div>
            </div>
            <Chessboard
              fen={fenFromKey(node.key, node.ply)}
              orientation={color}
              interactive
              onMove={onMove}
              lastMove={node.uci ? { from: node.uci.slice(0, 2), to: node.uci.slice(2, 4) } : null}
              arrows={arrows}
              label="Explorer board"
            />
            <div className={s.navRow}>
              <button type="button" className={s.btn} onClick={() => go([])} disabled={node.ply === 0} aria-label="Back to start">⏮</button>
              <button type="button" className={s.btn} onClick={back} disabled={node.ply === 0} aria-label="Back one move">◀ Back</button>
              <button type="button" className={s.btn} onClick={forward} disabled={!node.children.length} aria-label="Forward along the most played move">Forward ▶</button>
            </div>
            {notice && notice.key === node.key && <p className={s.notice} role="status">{notice.text}</p>}
          </div>

          <div>
            <nav className={s.crumbs} aria-label="Current line">
              <button type="button" className={s.crumb} aria-current={node.ply === 0 ? "step" : undefined} onClick={() => go([])}>Start</button>
              {path.map((n, i) => (
                <button key={i} type="button" className={s.crumb} aria-current={n === node ? "step" : undefined} onClick={() => go(line.slice(0, i + 1))}>
                  {i % 2 === 0 ? `${i / 2 + 1}.${n.san}` : n.san}
                </button>
              ))}
            </nav>

            <section className={s.panel} aria-labelledby="next-moves">
              <h2 id="next-moves">{node.ply % 2 === 0 ? "White plays" : "Black plays"}</h2>
              <p className={s.sectionLede}>
                {(node.ply % 2 === 0) === (color === "white") ? "Your moves from here." : "What your opponents played here."} Tap a move to follow it.
              </p>
              {node.children.length === 0 ? (
                <p className={s.muted}>
                  {node.ply >= EXPLORER_DEPTH ? `The explorer stops after move ${EXPLORER_DEPTH / 2}.` : "No more moves: every game here ended."}
                </p>
              ) : (
                <MovesTable node={node} book={book} onPick={(uci) => { setNotice(null); go([...line, uci]); }} />
              )}
            </section>

            <section className={s.panel} aria-labelledby="recent-games">
              <h2 id="recent-games">Recent games here</h2>
              <p className={s.sectionLede}>{sans.length ? formatLine(sans) : "All your games as " + (color === "white" ? "White" : "Black")}</p>
              <ul className={s.gameList}>
                {node.games.slice(0, 6).map((g) => (
                  <li key={g.game.id}>
                    <span className={`${s.res} ${g.points === 1 ? s.scoreGood : g.points === 0 ? s.scoreBad : ""}`}>{RESULT_TEXT[g.game.outcome]}</span>
                    <span>
                      vs {g.game.opponent.username} ({g.game.opponent.rating})
                    </span>
                    <span className={s.muted}>
                      {g.game.timeClass} · {shortDate(g.game.endTime)}
                    </span>
                    <a href={g.game.url} target="_blank" rel="noreferrer">View<span className={s.srOnly}> game on Chess.com</span></a>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      )}
    </>
  );
}

function MovesTable({ node, book, onPick }: { node: TreeNode; book: Book | null; onPick: (uci: string) => void }) {
  const base = score(node.stats);
  return (
    <div className={s.tableWrap}>
      <table className={s.table} aria-label="Next moves">
        <thead>
          <tr>
            <th scope="col">Move</th>
            <th scope="col" className={s.num}>Games</th>
            <th scope="col">Results</th>
            <th scope="col" className={s.num}>Score</th>
          </tr>
        </thead>
        <tbody>
          {node.children.map((c) => {
            const named = book?.named.get(c.key);
            const theory = book?.theory.has(c.key);
            return (
              <tr key={c.uci} data-move={c.san} data-uci={c.uci}>
                <td>
                  <button type="button" className={s.moveBtn} onClick={() => onPick(c.uci!)}>
                    {moveLabel(c.san!, node.ply)}
                  </button>
                  {named ? <span className={s.moveName}>{named.name}</span> : !theory && <span className={s.moveName}>out of book</span>}
                </td>
                <td className={s.num}>
                  {c.stats.n}
                  <span className={s.wdl} style={{ display: "block" }}>{pct(c.stats.n / node.stats.n)}</span>
                </td>
                <td className={s.barCell}><ResultBar stats={c.stats} /></td>
                <td className={s.num}><Score stats={c.stats} baseline={base} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
