import type { Metadata } from "next";
import { Suspense } from "react";
import Explorer from "@/components/openings/Explorer";

export const metadata: Metadata = { title: "Opening explorer" };

// The explorer reads its line from the URL, so it renders on the client.
export default function ExplorerPage() {
  return (
    <Suspense>
      <Explorer />
    </Suspense>
  );
}
