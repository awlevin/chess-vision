"use client";

import dynamic from "next/dynamic";
import { installStorage } from "@/lib/storage-client";

// window.storage must exist before the drill mounts; installing at module
// scope guarantees it runs before any effect inside the component.
installStorage();

// The drill picks squares with Math.random, so it must not be server-rendered
// — the hydration pass would disagree with the server HTML.
const ChessVision = dynamic(() => import("./ChessVision"), { ssr: false });

export default function VisionClient() {
  return <ChessVision />;
}
