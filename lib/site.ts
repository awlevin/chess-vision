// The product name lives in one place so a rename is a one-line change.
export const APP_NAME = "Chess Companion";
export const APP_TAGLINE =
  "Board-vision drills, opening analysis of your own games, and practice on the lines you actually reach.";

export const SECTIONS = [
  { href: "/vision", title: "Vision", blurb: "Timed drills to find and name squares, and follow pieces around the board." },
  { href: "/openings", title: "Openings", blurb: "See how your openings score in your Chess.com games, then drill the moves you get wrong." },
  { href: "/account", title: "Account", blurb: "Link your Chess.com username and import your games." },
] as const;
