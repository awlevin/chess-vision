import type { Metadata } from "next";
import { Suspense } from "react";
import Repertoire from "@/components/openings/Repertoire";

export const metadata: Metadata = { title: "Your repertoire" };

export default function Page() {
  return (
    <Suspense>
      <Repertoire />
    </Suspense>
  );
}
