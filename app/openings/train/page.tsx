import type { Metadata } from "next";
import { Suspense } from "react";
import Trainer from "@/components/openings/Trainer";

export const metadata: Metadata = { title: "Opening trainer" };

export default function TrainPage() {
  return (
    <Suspense>
      <Trainer />
    </Suspense>
  );
}
