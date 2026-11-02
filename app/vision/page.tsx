import type { Metadata } from "next";
import VisionClient from "@/components/VisionClient";

export const metadata: Metadata = { title: "Vision" };

export default function VisionPage() {
  return <VisionClient />;
}
