import Link from "next/link";
import styles from "./games.module.css";

export interface LinkAccountPromptProps {
  /** Heading text. */
  title?: string;
  /** Body text explaining what linking unlocks here. */
  children?: React.ReactNode;
  /** Heading level, so the prompt fits the page outline. Defaults to 2. */
  headingLevel?: 2 | 3;
  className?: string;
}

/**
 * Empty-state card for features that need the player's own games: "Link your
 * Chess.com account to see this", with a link to /account.
 */
export function LinkAccountPrompt({
  title = "Link your Chess.com account",
  children = "This uses your own games. Link your Chess.com username to import them. It takes a few seconds and needs no password.",
  headingLevel = 2,
  className,
}: LinkAccountPromptProps) {
  const H = `h${headingLevel}` as const;
  return (
    <section className={[styles.panel, className].filter(Boolean).join(" ")}>
      <H>{title}</H>
      <p>{children}</p>
      <Link href="/account" className={styles.button}>Link Chess.com account</Link>
    </section>
  );
}
