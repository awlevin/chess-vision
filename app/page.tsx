import Hub from "@/components/hub/Hub";
import { UserButton } from "@clerk/nextjs";
import { CLOUD } from "@/lib/cloud";

export default function Home() {
  return (
    <main className="page focus">
      <Hub user={CLOUD ? <UserButton /> : undefined} />
    </main>
  );
}
