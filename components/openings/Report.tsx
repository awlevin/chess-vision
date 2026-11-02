"use client";

// Report: your named openings per colour, the leaks worth fixing, and
// where you leave known theory.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { Color } from "@/lib/games";
import { fenFromKey } from "@/lib/chess/fast";
import { bookMoves, type Book } from "@/lib/openings/book";
import { formatLine, moveLabel, pct, plural } from "@/lib/openings/format";
import { explorerHref, trainerHref } from "@/lib/openings/links";
import { buildReport, MIN_OPENING_GAMES, MIN_POSITION_GAMES, type ColorReport, type Leak, type OpeningRow, type TheoryExit } from "@/lib/openings/report";
import { score } from "@/lib/openings/stats";
import { EngineNote, EngineToggle, useEngineSetting } from "./EngineNote";
import { useOpenings } from "./OpeningsProvider";
import { ColorToggle, FiltersBar, ResultBar, ResultDots, Score, Trend, styles as s } from "./ui";
import { useRepertoireStore } from "./useRepertoireStore";

const FAMILY_LIMIT = 10;
const cap = (c: Color) => (c === "white" ? "White" : "Black");

export default function Report() {
  const { games, book } = useOpenings();
  const [color, setColor] = useState<Color>("white");
  const report = useMemo(() => (book ? buildReport(games, book) : null), [games, book]);
  if (!report || !book) return null;
  const r = report[color];

  return (
    <>
      <FiltersBar extra={<ColorToggle value={color} onChange={setColor} />} />
      {r.stats.n === 0 ? (
        <section className={s.empty}>
          <h2>{`No games as ${cap(color)}`}</h2>
          <p>Try a wider time window or another time control.</p>
        </section>
      ) : (
        <ColorSection r={r} book={book} />
      )}
    </>
  );
}

function ColorSection({ r, book }: { r: ColorReport; book: Book }) {
  const baseline = score(r.stats);
  const { color, theory } = r;
  const decided = theory.youLeft + theory.opponentLeft;
  return (
    <>
      <div className={s.tiles}>
        <div className={s.tile}>
          <div className={s.tileLabel}>Games as {cap(color)}</div>
          <div className={s.tileValue}>{r.stats.n.toLocaleString("en-US")}</div>
          <div className={s.tileNote}>{`+${r.stats.w} =${r.stats.d} −${r.stats.l}`}</div>
        </div>
        <div className={s.tile}>
          <div className={s.tileLabel}>Your score</div>
          <div className={s.tileValue}>{pct(baseline)}</div>
          <div className={s.tileNote}>wins plus half your draws</div>
        </div>
        <div className={s.tile}>
          <div className={s.tileLabel}>You leave book first</div>
          <div className={s.tileValue}>{decided ? pct(theory.youLeft / decided) : "–"}</div>
          <div className={s.tileNote}>{theory.avgExitMove ? `on average at move ${theory.avgExitMove.toFixed(1)}` : "of games where someone does"}</div>
        </div>
      </div>

      <section className={s.section} aria-labelledby="leaks-h">
        <h2 id="leaks-h" className={s.sectionTitle}>Leaks to fix</h2>
        <p className={s.sectionLede}>
          Openings that score well below your {pct(baseline)} average as {cap(color)} (at least {MIN_OPENING_GAMES} games), and
          positions where your usual move scores clearly worse than another move you&apos;ve tried (at least {MIN_POSITION_GAMES} games).
        </p>
        {r.leaks.length === 0 ? (
          <p className={s.muted}>No clear leaks with these filters. Nice.</p>
        ) : (
          <>
            <ul className={s.leaks}>
              {r.leaks.map((l) => <LeakCard key={l.id} leak={l} />)}
            </ul>
            <p className={s.sectionLede} style={{ marginTop: 12 }}>
              <Link className={s.linkish} href={trainerHref(color, "leaks")}>Drill the positions where you go wrong most →</Link>
            </p>
          </>
        )}
      </section>

      <section className={s.section} aria-labelledby="openings-h">
        <h2 id="openings-h" className={s.sectionTitle}>Your openings</h2>
        <p className={s.sectionLede}>Named by the deepest book position each game reached. Expand a family to see its variations.</p>
        <OpeningsTable rows={r.families} baseline={baseline} color={color} />
      </section>

      <section className={s.section} aria-labelledby="theory-h">
        <div className={s.sectionHead}>
          <h2 id="theory-h" className={s.sectionTitle}>Where you leave theory</h2>
          <EngineToggle />
        </div>
        <p className={s.sectionLede}>
          The first move of yours that isn&apos;t on a named line in the opening book, most common first.
          You left book first in {plural(theory.youLeft, "game")}, your opponent in {plural(theory.opponentLeft, "game")}
          {theory.bookEnded ? `, and the book simply ran out in ${plural(theory.bookEnded, "game")}` : ""}.
        </p>
        {r.exits.length === 0 ? (
          <p className={s.muted}>You never left book before your opponent here.</p>
        ) : (
          <ul className={s.exits}>
            {r.exits.map((e) => <ExitCard key={`${e.key}|${e.uci}`} exit={e} book={book} color={color} />)}
          </ul>
        )}
      </section>
    </>
  );
}

function LeakCard({ leak }: { leak: Leak }) {
  const router = useRouter();
  const { adopt } = useRepertoireStore(leak.color);
  const [engineOn] = useEngineSetting();
  const better = leak.better;
  const drill = (move: { uci: string; san: string }) => {
    adopt(leak.positionKey!, move);
    router.push(trainerHref(leak.color));
  };
  return (
    <li className={`${s.leak} ${leak.kind === "move" ? s.leakMove : ""}`} data-leak={leak.kind}>
      <div className={s.leakKind}>{leak.kind === "move" ? "Move choice" : "Opening"}</div>
      <p className={s.leakTitle}>{leak.title}</p>
      <p className={s.leakDetail}>{leak.detail}</p>
      {engineOn && leak.positionKey && leak.played && (
        <EngineNote
          fen={fenFromKey(leak.positionKey, leak.line.length)}
          ply={leak.line.length}
          color={leak.color}
          playedUci={leak.played.uci}
          playedSan={leak.played.san}
          onAdopt={drill}
        />
      )}
      <div className={s.actions}>
        <Link className={`${s.btn} ${s.small}`} href={explorerHref(leak.color, leak.line)}>Explore</Link>
        {better && leak.positionKey && (
          <button
            type="button"
            className={`${s.btn} ${s.small} ${s.primary}`}
            onClick={() => drill(better)}
          >
            {`Drill ${moveLabel(better.san, leak.line.length)} instead`}
          </button>
        )}
      </div>
    </li>
  );
}

function OpeningsTable({ rows, baseline, color }: { rows: OpeningRow[]; baseline: number; color: Color }) {
  const [showAll, setShowAll] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const shown = showAll ? rows : rows.slice(0, FAMILY_LIMIT);
  const toggle = (name: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  return (
    <div className={s.panel}>
      <div className={s.tableWrap}>
        <table className={s.table} aria-label={`Openings as ${cap(color)}`}>
          <thead>
            <tr>
              <th scope="col">Opening</th>
              <th scope="col" className={s.num}>Games</th>
              <th scope="col">Results</th>
              <th scope="col" className={s.num}>Score</th>
              <th scope="col" className={s.wide}>Last 10</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((f) => (
              <FamilyRows key={f.name} row={f} baseline={baseline} color={color} open={open.has(f.name)} onToggle={() => toggle(f.name)} />
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > FAMILY_LIMIT && (
        <button type="button" className={s.linkish} style={{ marginTop: 10 }} onClick={() => setShowAll((v) => !v)}>
          {showAll ? "Show fewer" : `Show all ${rows.length} openings`}
        </button>
      )}
    </div>
  );
}

function FamilyRows({ row, baseline, color, open, onToggle }: { row: OpeningRow; baseline: number; color: Color; open: boolean; onToggle: () => void }) {
  const hasVars = row.variations.length > 0;
  return (
    <>
      <tr data-opening={row.name}>
        <td>
          {hasVars && (
            <button type="button" className={s.expand} aria-expanded={open} aria-label={`${open ? "Hide" : "Show"} variations of ${row.name}`} onClick={onToggle}>
              {open ? "−" : "+"}
            </button>
          )}
          <Link href={explorerHref(color, row.line)} className={s.openingName} style={{ color: "inherit" }}>{row.name}</Link>
          <span className={s.openingLine}>{row.eco} · {formatLine(row.line)}</span>
        </td>
        <td className={s.num}>{row.stats.n}</td>
        <td className={s.barCell}><ResultBar stats={row.stats} /></td>
        <td className={s.num}><Score stats={row.stats} baseline={baseline} /></td>
        <td className={s.wide} style={{ whiteSpace: "nowrap" }}>
          <ResultDots results={row.recent} /> <Trend trend={row.trend} />
        </td>
      </tr>
      {open &&
        row.variations.map((v) => (
          <tr key={v.name} className={s.rowSub} data-opening={v.name}>
            <td>
              <Link href={explorerHref(color, v.line)} style={{ color: "inherit" }}>{v.variation}</Link>
              <span className={s.openingLine}>{v.eco} · {formatLine(v.line)}</span>
            </td>
            <td className={s.num}>{v.stats.n}</td>
            <td className={s.barCell}><ResultBar stats={v.stats} /></td>
            <td className={s.num}><Score stats={v.stats} baseline={baseline} /></td>
            <td className={s.wide} style={{ whiteSpace: "nowrap" }}><ResultDots results={v.recent} /></td>
          </tr>
        ))}
    </>
  );
}

function ExitCard({ exit, book, color }: { exit: TheoryExit; book: Book; color: Color }) {
  const router = useRouter();
  const { adopt } = useRepertoireStore(color);
  const [engineOn] = useEngineSetting();
  const fen = fenFromKey(exit.key, exit.ply);
  const options = useMemo(() => bookMoves(book, fen), [book, fen]);
  const where = exit.line.length ? formatLine(exit.line) : "the start";
  return (
    <li className={s.exit}>
      <div className={s.exitLine}>
        {exit.line.length ? `${formatLine(exit.line)} ` : ""}
        <b>{moveLabel(exit.san, exit.ply)}</b>
      </div>
      <div className={s.exitMeta}>
        {plural(exit.stats.n, "game")}, you score {pct(score(exit.stats))}
        {exit.opening ? ` · from ${exit.opening.name}` : ""}
        <br />
        {options.length
          ? `Book moves after ${where}: ${options.slice(0, 6).map((m) => moveLabel(m, exit.ply)).join(", ")}${options.length > 6 ? ", …" : ""}`
          : "No named book move continues from here."}
      </div>
      {engineOn && (
        <EngineNote
          fen={fen}
          ply={exit.ply}
          color={color}
          playedUci={exit.uci}
          playedSan={exit.san}
          onAdopt={(m) => {
            adopt(exit.key, m);
            router.push(trainerHref(color));
          }}
        />
      )}
      <div className={s.actions} style={{ marginTop: 8 }}>
        <Link className={`${s.btn} ${s.small}`} href={explorerHref(color, exit.line)}>Explore</Link>
      </div>
    </li>
  );
}
