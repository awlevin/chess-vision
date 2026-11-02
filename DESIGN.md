# Design language: "The Study"

The app should feel like a quiet, crafted chess room: dark walnut, brass fittings,
good paper, a beautiful board on the table. It should feel like a coach sitting
across from you, not a dashboard. **Mobile is the primary interface**: design at
390×844 first, then let desktop be the same column, centred.

The tokens live in `app/design-tokens.css`. Use them; don't invent colours, radii,
shadows or easings.

## Influences (taken as ideas, not copied)
- **Editorial, type-first layouts**: oversized serif numerals and headlines with
  deliberate line breaks do the work that boxes and labels used to do.
- **Real-wood tactility, held back**: the board is the one crafted object. It gets
  a frame, depth and a faint grain. The UI around it stays flat and quiet.
- **Game-like momentum** (streaks, celebrations, a ring that fills) in the spirit
  of the best learning apps, but in brass and warm restraint, never cartoonish.

## Rules
1. **No bordered boxes, and never a coloured left (or any single-side) border accent.**
   Separate things with space first, a tonal surface second (`--surface-1` on
   `--bg`), and a `--hairline` divider third. Outline borders appear only on inputs,
   and only on focus.
2. **One radius** (`--r`) for cards and sheets, `--r-sm` for things inside them, and
   pills for buttons and chips. No other radii.
3. **One accent.** Brass marks the primary action and "you". Outcome hues (sage,
   stone, clay) appear only where the subject is a result, and never as
   decoration.
4. **Type does the hierarchy.** Big numbers use the display serif with tabular
   lining figures. A screen has one display-sized element at most. Labels are
   sentence case; small caps and eyebrow labels sparingly, if at all. Cut prose:
   one short sentence beats a paragraph, and an info button beats a sentence.
5. **The board is the hero.** It is full width within the gutter on a phone and
   the first thing on any screen that has one. Nothing competes with it above
   the fold.
6. **One job per screen.** There is one primary button, and it is within thumb
   reach. Secondary actions are text buttons or sit behind a "⋯" or a sheet.
   Filters live in a bottom sheet behind a single chip.
7. **No tables on phones.** Use rows with a strong left element (the move or name)
   and a right-aligned result (a score pill or a slim bar).
8. **Moves are typeset**: figurine notation where it helps (♘f3), in tabular,
   unbroken spans (`white-space: nowrap`), with move numbers in `--ink-3`.
9. **Motion has meaning**: things enter with `--ease-out`, pieces and rewards
   spring (`--ease-spring`), lists stagger by `--stagger`, and nothing loops except
   loading indicators. Everything collapses to instant under reduced motion.
10. **Delight is earned.** Celebrate real progress (a correct move, a session
    done, a streak), then get out of the way. Sound is soft and mutable, and
    haptics are short.

## Signature elements
- **The score pill**: a rounded pill with the % in tabular figures, tinted on a
  scale from clay through stone to sage, with the games count beside it in `--ink-3`.
- **The knight**: our loading and empty-state character. It hops in an L while
  importing, and sits patiently on an empty state.
- **The brass ring**: progress toward today's review. It fills with a spring and
  glows when complete.
- **The glow**: a correct move makes the destination square pulse brass once. A
  wrong move gives the board a 2px shake and a clay flash.
- **Bottom tab bar** on phones: frosted `--glass`, three items with line icons,
  and the active item in brass with a small dot.
