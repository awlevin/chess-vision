import { OpeningsProvider } from "@/components/openings/OpeningsProvider";
import { OpeningsGate } from "@/components/openings/ui";
import s from "@/components/openings/openings.module.css";

// Shared by every openings screen, so moving between them keeps the parsed
// games, the opening book and the filters. Each screen brings its own small
// section bar; there is no page header.
export default function OpeningsLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className={s.page}>
      <OpeningsProvider>
        <OpeningsGate>{children}</OpeningsGate>
      </OpeningsProvider>
    </main>
  );
}
