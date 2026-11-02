"use client";

// Loads everything the openings pages share, once for the whole section:
// the linked player's games (parsed in slices so a big import never blocks
// the page), the opening book, and the report/explorer filters.
import { createContext, useContext, useDeferredValue, useEffect, useMemo, useState, type ReactNode } from "react";
import { useGames, type Game, type LinkedAccount } from "@/lib/games";
import { loadBook, type Book } from "@/lib/openings/book";
import { parseGames, type ParsedGame } from "@/lib/openings/parse";
import { applyFilters, DEFAULT_FILTERS, isFilters, type Filters } from "@/lib/openings/stats";
import { STORAGE_KEYS, usePersistent } from "@/lib/openings/persist";

export type OpeningsStatus = "loading" | "no-account" | "importing" | "no-games" | "analysing" | "ready";

export interface OpeningsData {
  status: OpeningsStatus;
  account: LinkedAccount | null;
  /** While analysing: games read so far, of total. */
  progress: { done: number; total: number };
  book: Book | null;
  /** Every standard game, oldest first. */
  all: ParsedGame[];
  /** The games that pass the filters. */
  games: ParsedGame[];
  filters: Filters;
  setFilters: (f: Filters) => void;
}

const Ctx = createContext<OpeningsData | null>(null);

export function useOpenings(): OpeningsData {
  const v = useContext(Ctx);
  if (!v) throw new Error("useOpenings must be used inside <OpeningsProvider>");
  return v;
}

const NO_GAMES: ParsedGame[] = [];

export function OpeningsProvider({ children }: { children: ReactNode }) {
  const { account, ready, games, sync } = useGames();
  const [book, setBook] = useState<Book | null>(null);
  const [parsed, setParsed] = useState<{ source: Game[]; games: ParsedGame[] } | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [filters, setFilters] = usePersistent(STORAGE_KEYS.filters, DEFAULT_FILTERS, isFilters);

  useEffect(() => {
    let live = true;
    loadBook().then((b) => live && setBook(b));
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    const signal = { cancelled: false };
    parseGames(games, (done) => setProgress({ done, total: games.length }), signal).then((p) => {
      if (!signal.cancelled) setParsed({ source: games, games: p });
    });
    return () => {
      signal.cancelled = true;
    };
  }, [games]);

  const all = parsed && parsed.source === games ? parsed.games : NO_GAMES;
  // Filtering re-runs the report; let the controls update first.
  const deferredFilters = useDeferredValue(filters);
  const filtered = useMemo(() => applyFilters(all, deferredFilters), [all, deferredFilters]);

  let status: OpeningsStatus;
  if (!ready) status = "loading";
  else if (games.length === 0) status = account ? (sync.status === "syncing" ? "importing" : "no-games") : "no-account";
  else if (!book || !parsed || parsed.source !== games) status = "analysing";
  else if (all.length === 0) status = "no-games";
  else status = "ready";

  const value = useMemo<OpeningsData>(
    () => ({ status, account, progress, book, all, games: filtered, filters, setFilters }),
    [status, account, progress, book, all, filtered, filters, setFilters],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
