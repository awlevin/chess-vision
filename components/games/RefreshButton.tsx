"use client";

import { RefreshIcon } from "@/components/icons";
import styles from "./games.module.css";

export interface RefreshButtonProps {
  onClick: () => void;
  /** Spins the icon and disables the button while a sync runs. */
  syncing?: boolean;
  /** Accessible name. Defaults to "Refresh". */
  label?: string;
  /** "sm" (32px, for inline status lines) or "md" (44px). Defaults to "md". */
  size?: "sm" | "md";
  className?: string;
}

/** A round icon button that spins while syncing. */
export function RefreshButton({ onClick, syncing = false, label = "Refresh", size = "md", className }: RefreshButtonProps) {
  return (
    <button
      type="button"
      className={[styles.iconButton, size === "sm" && styles.sm, syncing && styles.spinning, className].filter(Boolean).join(" ")}
      onClick={onClick}
      disabled={syncing}
      aria-label={label}
      title={label}
    >
      <RefreshIcon />
    </button>
  );
}
