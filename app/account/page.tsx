import type { Metadata } from "next";
import AccountPanel from "@/components/account/AccountPanel";
import { UserButton } from "@clerk/nextjs";
import { CLOUD } from "@/lib/cloud";

export const metadata: Metadata = { title: "Account" };

export default function AccountPage() {
  return (
    <main className="page focus">
      <h1 className="sr-only">Account</h1>
      <AccountPanel user={CLOUD ? <UserButton /> : undefined} />
    </main>
  );
}
