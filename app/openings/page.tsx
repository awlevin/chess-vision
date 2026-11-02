import type { Metadata } from "next";
import { Suspense } from "react";
import Home from "@/components/openings/Home";

export const metadata: Metadata = { title: "Openings" };

// The screens read the colour from the URL, so they render on the client.
export default function OpeningsPage() {
  return (
    <Suspense>
      <Home />
    </Suspense>
  );
}
