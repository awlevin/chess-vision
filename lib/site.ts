// The product name lives in one place so a rename is a one-line change.
export const APP_NAME = "Chess Companion";
export const APP_TAGLINE =
  "Board-vision drills, opening analysis of your own games, and practice on the lines you actually reach.";

/** The three sections, in tab-bar order. `blurb` is the hub's one-line description. */
export const SECTIONS = [
  { href: "/vision", title: "Vision", blurb: "Find and name squares, fast." },
  { href: "/openings", title: "Openings", blurb: "Where your openings win, and where they leak." },
  { href: "/account", title: "Account", blurb: "Your Chess.com games." },
] as const;
