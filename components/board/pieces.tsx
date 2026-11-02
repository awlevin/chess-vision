// Chess piece artwork, drawn for this project (no third-party assets): flat
// silhouettes on a 45×45 grid with a shared plinth. Same licence as the app.
import type { PieceCode } from "./types";

const PLINTH = "M11 38.5h23a1.5 1.5 0 0 0 1.5-1.5v-1a1.5 1.5 0 0 0-1.5-1.5H11A1.5 1.5 0 0 0 9.5 36v1a1.5 1.5 0 0 0 1.5 1.5z";

type Shape = { body: string[]; details?: string[]; dots?: [number, number, number][] };

const SHAPES: Record<string, Shape> = {
  P: {
    body: [
      "M17.6 21.5c0 5-3 9.2-4.6 13h19c-1.6-3.8-4.6-8-4.6-13z",
      "M15.8 21.2a6.7 1.9 0 1 0 13.4 0a6.7 1.9 0 1 0-13.4 0z",
      "M17.3 14.2a5.2 5.2 0 1 0 10.4 0a5.2 5.2 0 1 0-10.4 0z",
    ],
  },
  R: {
    body: [
      "M15.2 34.5l1.2-15.5h12.2l1.2 15.5z",
      "M13.4 19.4v-3.2h18.2v3.2z",
      "M13.4 16.2V9h4.1v3h3v-3h4v3h3v-3h4.1v7.2z",
    ],
    details: ["M15.6 30.4h13.8"],
  },
  B: {
    body: [
      "M22.5 9.3c-5.6 4.3-7.6 9.3-7.1 14 .4 3.6 3.4 5 3.4 7l-2.4 4.2h12.2l-2.4-4.2c0-2 3-3.4 3.4-7 .5-4.7-1.5-9.7-7.1-14z",
      "M17.5 30.6a5 1.5 0 1 0 10 0a5 1.5 0 1 0-10 0z",
    ],
    details: ["M25 15.6l-4.4 6"],
    dots: [[22.5, 7.2, 2.3]],
  },
  N: {
    body: [
      "M13.6 34.5c0-5.4 2.7-8 5.4-10.6-1.6-.7-3.6-.3-5.9 1.4-1.8 1.3-4-.1-3.4-2.3.8-3 3.7-6.5 6.2-8.8l.3-3.8 2.4 2.3 1.7-3.8 2.2 3.5c6.2 1 9.6 6.6 9.6 13.6v8.5z",
    ],
    details: ["M24.6 14.6c3.4 2.4 5 6.4 5 11.4"],
  },
  Q: {
    body: [
      "M14.6 34.5l1-10.6-4.1-9.9 6.5 7-.9-10 3.9 9 1.5-10.5 1.5 10.5 3.9-9-.9 10 6.5-7-4.1 9.9 1 10.6z",
      "M15.6 24a6.9 1.7 0 1 0 13.8 0a6.9 1.7 0 1 0-13.8 0z",
    ],
    details: ["M15.4 29.6h14.2"],
    dots: [[11.5, 13.6, 1.9], [17, 10.6, 1.9], [22.5, 9, 2], [28, 10.6, 1.9], [33.5, 13.6, 1.9]],
  },
  K: {
    body: [
      "M14.6 34.5l1-9.4c-3.6-4-3.2-9 .9-9.6 2.6-.3 5 2 6 4.5 1-2.5 3.4-4.8 6-4.5 4.1.6 4.5 5.6.9 9.6l1 9.4z",
      "M15.4 25.4a7.1 1.7 0 1 0 14.2 0a7.1 1.7 0 1 0-14.2 0z",
      "M21.2 5.6h2.6v2.6h2.6v2.6h-2.6v5h-2.6v-5h-2.6V8.2h2.6z",
    ],
    details: ["M15.4 30.2h14.2"],
  },
};

const COLORS = {
  w: { fill: "#FBF6EA", stroke: "#231C15", detail: "#231C15" },
  b: { fill: "#2B241D", stroke: "#0E0B08", detail: "#E9DFCB" },
};

export function PieceSvg({ piece, className }: { piece: PieceCode; className?: string }) {
  const shape = SHAPES[piece[1]];
  const c = COLORS[piece[0] as "w" | "b"];
  return (
    <svg viewBox="0 0 45 45" className={className} aria-hidden="true" focusable="false">
      <g fill={c.fill} stroke={c.stroke} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round">
        {shape.body.map((d, i) => <path key={i} d={d} />)}
        {shape.dots?.map(([cx, cy, r], i) => <circle key={`d${i}`} cx={cx} cy={cy} r={r} />)}
        <path d={PLINTH} />
      </g>
      {shape.details && (
        <g fill="none" stroke={c.detail} strokeWidth={1.3} strokeLinecap="round">
          {shape.details.map((d, i) => <path key={i} d={d} />)}
        </g>
      )}
      {piece[1] === "N" && <circle cx={17.6} cy={17.2} r={1.15} fill={c.detail} />}
    </svg>
  );
}
