"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { APP_NAME, SECTIONS } from "@/lib/site";

export default function AppNav({ user }: { user?: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <header className="appnav">
      <Link href="/" className="brand"><span>♞</span> <span className="full">{APP_NAME}</span></Link>
      <nav className="links" aria-label="Sections">
        {SECTIONS.map((s) => {
          const current = pathname === s.href || pathname.startsWith(s.href + "/");
          return (
            <Link key={s.href} href={s.href} aria-current={current ? "page" : undefined}>{s.title}</Link>
          );
        })}
      </nav>
      {user && <div className="user">{user}</div>}
    </header>
  );
}
