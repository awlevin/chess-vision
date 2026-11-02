import type { Metadata } from "next";
import AccountPanel from "@/components/account/AccountPanel";

export const metadata: Metadata = { title: "Account" };

export default function AccountPage() {
  return (
    <main className="page">
      <h1>Account</h1>
      <p className="lede">
        Link your Chess.com account to import your games. Openings and other features then work from the games you
        actually play.
      </p>
      <AccountPanel />
    </main>
  );
}
