import type { Metadata } from "next";
import { Suspense } from "react";
import LeaksPage from "@/components/openings/Leaks";

export const metadata: Metadata = { title: "Opening leaks" };

export default function Page() {
  return (
    <Suspense>
      <LeaksPage />
    </Suspense>
  );
}
