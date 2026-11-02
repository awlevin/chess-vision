import { OpeningsProvider } from "@/components/openings/OpeningsProvider";
import { OpeningsGate, OpeningsTabs } from "@/components/openings/ui";

// Shared by the report, explorer and trainer, so switching between them
// keeps the parsed games, the opening book and the filters.
export default function OpeningsLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="page">
      <h1>Openings</h1>
      <p className="lede">How your openings score in your own games, where you go wrong, and practice on the lines you actually reach.</p>
      <OpeningsTabs />
      <OpeningsProvider>
        <OpeningsGate>{children}</OpeningsGate>
      </OpeningsProvider>
    </main>
  );
}
