"use client";

import dynamic from "next/dynamic";
import { installStorage } from "@/lib/storage-client";

// window.storage must exist before the drill mounts; installing at module
// scope guarantees it runs before any effect inside the component.
installStorage();

// The drill picks squares with Math.random, so it must not be server-rendered
// — the hydration pass would disagree with the server HTML.
const ChessVision = dynamic(() => import("./ChessVision"), { ssr: false });

// The display serif and UI sans. globals.css @imports these too, but the
// bundled stylesheet puts design-tokens.css first, so that @import is not at
// the top of the file and browsers drop it. React hoists and dedupes this
// link; remove it once the shell loads the fonts (e.g. with next/font).
const FONTS =
  "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500;1,600&family=Inter:wght@400;500;600;700&display=swap";

export default function VisionClient() {
  return (
    <>
      <link rel="stylesheet" href={FONTS} precedence="default" />
      <ChessVision />
    </>
  );
}
