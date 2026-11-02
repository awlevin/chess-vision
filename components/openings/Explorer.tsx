"use client";

// Explorer: your games as a move tree. The board comes first; under it the
// line so far, the opening's name, and the next moves as big rows. The line
// lives in the URL (?color=white&moves=e2e4-d7d5) so any position can be
// linked to. Swipe the board or use ← → to step through it.
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Chessboard, type BoardArrow, type BoardMove } from "@/components/board";
import type { Color } from "@/lib/games";
import { fenFromKey } from "@/lib/chess/fast";
import { playSound, soundForSan } from "@/lib/delight";
import type { Book, BookEntry } from "@/lib/openings/book";
import { moveLabel, plural, shortDate } from "@/lib/openings/format";
import { score } from "@/lib/openings/stats";
import { buildTree, EXPLORER_DEPTH, pathTo, walk, type TreeNode } from "@/lib/openings/tree";
import { useOpenings } from "./OpeningsProvider";
import { cap, ColorToggle, Empty, FilterChip, MoveText, ResultBar, scoreHue, SectionBar, styles as s } from "./ui";

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
  const back = () => {
    if (node.ply > 0) go(line.slice(0, -1));
  };
  const forward = () => {
    const next = node.children[0];
    if (!next) return;
    playSound(soundForSan(next.san!));
    go([...line, next.uci!]);
  };
  const pick = (child: TreeNode) => {
    setNotice(null);
    playSound(soundForSan(child.san!));
    go([...line, child.uci!]);
  };

  // ← and → step through the line, unless focus is in a control or on the board.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.altKey || e.ctrlKey || e.metaKey || t?.closest("input, select, textarea, dialog, [data-square]")) return;
      if (e.key === "ArrowLeft") back();
      else if (e.key === "ArrowRight") forward();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Keep the newest move in view in the breadcrumb.
  const crumbsRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = crumbsRef.current;
    if (el) el.scrollTo({ left: el.scrollWidth, behavior: "smooth" });
  }, [node]);

  let opening: BookEntry | null = null;
  for (let i = path.length - 1; i >= 0 && !opening; i--) opening = book?.named.get(path[i].key) ?? null;
  const inBook = node.ply === 0 || !!book?.theory.has(node.key);
  const yourMove = (node.ply % 2 === 0) === (color === "white");
  // You usually leave book here: it's your move, you're still in book, and your most played move isn't.
  const leaveHere = yourMove && inBook && !!node.children[0] && !!book && !book.theory.has(node.children[0].key);

  const onMove = (m: BoardMove) => {
    const child = node.children.find((c) => c.uci === m.uci);
    if (child) return pick(child);
    setNotice({
      key: node.key,
      text: node.ply >= EXPLORER_DEPTH ? `The explorer stops after move ${EXPLORER_DEPTH / 2}.` : `None of your games has ${moveLabel(m.san, node.ply)} here.`,
    });
  };

  const arrows: BoardArrow[] = node.children.slice(0, 3).map((c) => ({
    from: c.uci!.slice(0, 2),
    to: c.uci!.slice(2, 4),
    tone: "info",
    weight: node.stats.n ? c.stats.n / node.stats.n : 0,
  }));

  return (
    <>
      <SectionBar />
      <div className={s.controls}>
        <ColorToggle value={color} onChange={(c) => go([], c)} />
        <FilterChip />
      </div>
      {tree.stats.n === 0 ? (
        <Empty title={`No games as ${cap(color)}`}>Try wider filters.</Empty>
      ) : (
        <>
          <div className={s.boardWrap}>
            <Chessboard
              fen={fenFromKey(node.key, node.ply)}
              orientation={color}
              interactive
              onMove={onMove}
              onSwipe={(d) => (d === "left" ? forward() : back())}
              lastMove={node.uci ? { from: node.uci.slice(0, 2), to: node.uci.slice(2, 4) } : null}
              arrows={arrows}
              label="Explorer board"
            />
          </div>

          <div className={s.crumbRow}>
            <button type="button" className={s.iconBtn} onClick={back} disabled={node.ply === 0} aria-label="Back one move">
              <svg viewBox="0 0 8 14" width="8" height="14" aria-hidden="true"><path d="M7 1L1 7l6 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
            <nav ref={crumbsRef} className={s.crumbs} aria-label="Current line">
              <button type="button" className={s.crumb} aria-current={node.ply === 0 ? "step" : undefined} onClick={() => go([])}>Start</button>
              {path.map((n, i) => (
                <button key={i} type="button" className={s.crumb} aria-current={n === node ? "step" : undefined} onClick={() => go(line.slice(0, i + 1))}>
                  <MoveText san={n.san!} ply={i} number={i % 2 === 0} />
                </button>
              ))}
            </nav>
            <button type="button" className={s.iconBtn} onClick={forward} disabled={!node.children.length} aria-label="Forward along the most played move">
              <svg viewBox="0 0 8 14" width="8" height="14" aria-hidden="true"><path d="M1 1l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          </div>
          {notice && notice.key === node.key && <p className={s.notice} role="status">{notice.text}</p>}

          <header className={s.nameplate} aria-live="polite" data-testid="opening-name">
            <h1 className={s.title}>{opening ? opening.name : node.ply === 0 ? "Starting position" : "Off the map"}</h1>
            <p className={s.meta}>
              <span>{plural(node.stats.n, "game")}</span>
              <span>you score {Math.round(score(node.stats) * 100)}%</span>
              {!inBook && <span className={s.tag}>Out of book</span>}
              {leaveHere && <span className={s.tagBrass}>You usually leave book here</span>}
            </p>
          </header>

          <section aria-labelledby="next-h" className={s.section}>
            <h2 id="next-h" className={s.caption}>{yourMove ? "You play" : "They reply"}</h2>
            {node.children.length === 0 ? (
              <p className={s.ink2}>{node.ply >= EXPLORER_DEPTH ? `The explorer stops after move ${EXPLORER_DEPTH / 2}.` : "Every game ended here."}</p>
            ) : (
              <NextMoves node={node} book={book} onPick={pick} />
            )}
          </section>

          <details className={s.details}>
            <summary>
              Recent games here <span className={s.ink3}>{Math.min(node.games.length, 8)}</span>
            </summary>
            <ul className={s.games}>
              {node.games.slice(0, 8).map((g) => (
                <li key={g.game.id}>
                  <span className={s.res} style={{ "--hue": g.points === 1 ? "var(--win)" : g.points === 0 ? "var(--loss)" : "var(--draw)" } as CSSProperties}>
                    {RESULT_TEXT[g.game.outcome]}
                  </span>
                  <span className={s.gameWho}>
                    {g.game.opponent.username} <span className={s.ink3}>{g.game.opponent.rating}</span>
                  </span>
                  <span className={s.ink3}>{shortDate(g.game.endTime).replace(/, \d{4}$/, "")}</span>
                  <a href={g.game.url} target="_blank" rel="noreferrer" className={s.inlineLink}>
                    View<span className={s.srOnly}> game on Chess.com</span>
                  </a>
                </li>
              ))}
            </ul>
          </details>
        </>
      )}
    </>
  );
}

function NextMoves({ node, book, onPick }: { node: TreeNode; book: Book | null; onPick: (c: TreeNode) => void }) {
  return (
    <div className={s.moves} data-testid="next-moves">
      {node.children.map((c, i) => {
        const named = book?.named.get(c.key);
        const theory = book?.theory.has(c.key);
        const pct = Math.round(score(c.stats) * 100);
        return (
          <button
            key={c.uci}
            type="button"
            className={s.moveRow}
            style={{ "--i": i } as CSSProperties}
            data-move={c.san}
            data-uci={c.uci}
            data-games={c.stats.n}
            data-score={pct}
            aria-label={`${moveLabel(c.san!, node.ply)}, ${plural(c.stats.n, "game")}, ${pct}%`}
            onClick={() => onPick(c)}
          >
            <span className={s.moveSan}><MoveText san={c.san!} ply={node.ply} /></span>
            <span className={s.moveNote}>{named ? named.variation ?? named.family : theory ? "" : "Out of book"}</span>
            <span className={s.moveGames}>{c.stats.n}</span>
            <ResultBar stats={c.stats} />
            <span className={s.movePct} style={{ "--hue": scoreHue(score(c.stats)) } as CSSProperties}>{pct}%</span>
          </button>
        );
      })}
    </div>
  );
}
