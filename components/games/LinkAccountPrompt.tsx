import Link from "next/link";
import { KnightIcon } from "@/components/icons";
import styles from "./games.module.css";

export interface LinkAccountPromptProps {
  /** Heading text. */
  title?: string;
  /** One short line saying what linking unlocks here. */
  children?: React.ReactNode;
  /** Heading level, so the prompt fits the page outline. Defaults to 2. */
  headingLevel?: 2 | 3;
  className?: string;
}

/**
 * Empty state for features that need the player's own games: the knight,
 * one line, and a single button to /account.
 */
export function LinkAccountPrompt({
  title = "Bring your games",
  children = "Link your Chess.com username. No password needed.",
  headingLevel = 2,
  className,
}: LinkAccountPromptProps) {
  const H = `h${headingLevel}` as const;
  return (
    <section className={[styles.card, styles.prompt, className].filter(Boolean).join(" ")}>
      <KnightIcon className={`${styles.knight} ${styles.sitting}`} />
      <div className={styles.promptText}>
        <H className={styles.title}>{title}</H>
        <p className={styles.line}>{children}</p>
      </div>
      <Link href="/account" className={styles.button}>Link Chess.com account</Link>
    </section>
  );
}
