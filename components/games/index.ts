// Drop-in UI for features built on the player's imported games.
//
//   <GamesGate linkMessage="…">…feature…</GamesGate>   empty states until there are games
//   <LinkAccountPrompt />                                knight + one line + "Link Chess.com"
//   <SyncStatus />                                       one-line sync status with a refresh button
//   <SyncProgress sync={…} />                            the knight hopping along an import's progress
//   <RefreshButton onClick syncing />                    round refresh icon button that spins
//   <CountUp value={n} />                                a number that counts up to n
export { GamesGate, type GamesGateProps } from "./GamesGate";
export { LinkAccountPrompt, type LinkAccountPromptProps } from "./LinkAccountPrompt";
export { SyncStatus, SyncProgress } from "./SyncStatus";
export { RefreshButton, type RefreshButtonProps } from "./RefreshButton";
export { CountUp, type CountUpProps } from "./CountUp";
export { formatRelative, formatDate, formatMonth, formatCount, syncLabel, useNow } from "./format";
