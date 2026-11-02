// Drop-in UI for features built on the player's imported games.
//
//   <GamesGate linkMessage="…">…feature…</GamesGate>   empty states until there are games
//   <LinkAccountPrompt />                                "Link your Chess.com account" card
//   <SyncStatus />                                       one-line sync status with Refresh/Retry
//   <SyncProgress sync={…} />                            labelled progress bar for a running import
export { GamesGate, type GamesGateProps } from "./GamesGate";
export { LinkAccountPrompt, type LinkAccountPromptProps } from "./LinkAccountPrompt";
export { SyncStatus, SyncProgress } from "./SyncStatus";
export { formatRelative, formatDate, formatCount, useNow } from "./format";
