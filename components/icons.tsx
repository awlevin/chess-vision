// Inline line icons for the shell, drawn on a 24px grid with a 1.6 stroke.
// They take currentColor, so CSS sets their colour.

type IconProps = React.SVGProps<SVGSVGElement>;

const line = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

/** Vision: an eye over a square. */
export function VisionIcon(props: IconProps) {
  return (
    <svg {...line} {...props}>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <rect x="9.25" y="9.25" width="5.5" height="5.5" rx="1" />
    </svg>
  );
}

/** Openings: a line of moves that branches. */
export function OpeningsIcon(props: IconProps) {
  return (
    <svg {...line} {...props}>
      <circle cx="6" cy="5" r="2" />
      <circle cx="6" cy="19" r="2" />
      <circle cx="18" cy="7.5" r="2" />
      <path d="M6 7v10M18 9.5c0 4.5-7.5 3.5-10.6 8" />
    </svg>
  );
}

/** Account: a person. */
export function AccountIcon(props: IconProps) {
  return (
    <svg {...line} {...props}>
      <circle cx="12" cy="8.5" r="3.75" />
      <path d="M4.5 20c1.4-3.6 4.2-5.5 7.5-5.5s6.1 1.9 7.5 5.5" />
    </svg>
  );
}

export function RefreshIcon(props: IconProps) {
  return (
    <svg {...line} {...props}>
      <path d="M20 12a8 8 0 1 1-2.34-5.66" />
      <path d="M20 4.5v4.25h-4.25" />
    </svg>
  );
}

export function MoreIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <circle cx="5.5" cy="12" r="1.75" />
      <circle cx="12" cy="12" r="1.75" />
      <circle cx="18.5" cy="12" r="1.75" />
    </svg>
  );
}

export function ArrowIcon(props: IconProps) {
  return (
    <svg {...line} {...props}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export function ExternalIcon(props: IconProps) {
  return (
    <svg {...line} {...props}>
      <path d="M14 5h5v5M19 5l-8 8M17 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h4" />
    </svg>
  );
}

/**
 * The knight: the app's mark, and its loading and empty-state character.
 * A filled silhouette facing left, on a 32px grid.
 */
export function KnightIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 32 32" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M9.6 25c.9-3.4 3.6-5.9 3.7-9.4l-2.5 1.1c-1.6.7-3.5.4-4.5-.9-.8-1-.6-2.3.3-3.2l6.4-5.9.9-3.5 2.4 2.3c4.7.9 7.6 5.2 7.6 10.8 0 3.3-.5 6.1-1.2 8.7H9.6Z" />
      <path d="M8 26.5h16a1.5 1.5 0 0 1 1.5 1.5v1.5h-19V28A1.5 1.5 0 0 1 8 26.5Z" />
      <circle cx="12.6" cy="10.4" r="1" fill="var(--bg, #13100D)" />
    </svg>
  );
}
