"use client";

import { useSyncExternalStore } from "react";
import type { SyncState } from "@/lib/games";

const TICK_MS = 30_000;
const subscribeClock = (cb: () => void) => {
  const t = window.setInterval(cb, TICK_MS);
  return () => window.clearInterval(t);
};
// Rounded so repeated reads within a tick return the same snapshot.
const readClock = () => Math.floor(Date.now() / TICK_MS) * TICK_MS;

/** The current time in ms, updated every 30 s; 0 during server render. */
export function useNow(): number {
  return useSyncExternalStore(subscribeClock, readClock, () => 0);
}

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["minute", 60_000],
  ["hour", 3_600_000],
  ["day", 86_400_000],
];

/** "just now", "5 minutes ago", "yesterday", or a date for anything older than a week. */
export function formatRelative(at: number, now: number): string {
  const diff = Math.max(0, (now || Date.now()) - at);
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return rtf.format(-Math.round(diff / STEPS[0][1]), "minute");
  if (diff < 86_400_000) return rtf.format(-Math.round(diff / STEPS[1][1]), "hour");
  if (diff < 7 * 86_400_000) return rtf.format(-Math.round(diff / STEPS[2][1]), "day");
  return formatDate(at);
}

export function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function formatCount(n: number, noun: string): string {
  return `${n.toLocaleString()} ${noun}${n === 1 ? "" : "s"}`;
}

/** "Checking Chess.com…" or "Importing month 3 of 24" (the month being fetched). */
export function syncLabel(sync: Extract<SyncState, { status: "syncing" }>): string {
  return sync.total === 0
    ? "Checking Chess.com…"
    : `Importing month ${Math.min(sync.done + 1, sync.total)} of ${sync.total}`;
}

/** "Mar 2021". */
export function formatMonth(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { year: "numeric", month: "short" });
}
