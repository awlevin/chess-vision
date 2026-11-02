import type { Metadata } from "next";
import Report from "@/components/openings/Report";

export const metadata: Metadata = { title: "Openings" };

export default function OpeningsPage() {
  return <Report />;
}
