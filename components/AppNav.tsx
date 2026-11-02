"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { APP_NAME, SECTIONS } from "@/lib/site";
import { AccountIcon, KnightIcon, OpeningsIcon, VisionIcon } from "@/components/icons";

const ICONS = { "/vision": VisionIcon, "/openings": OpeningsIcon, "/account": AccountIcon } as const;

/**
 * The app's one navigation. On a phone the "Sections" nav is a frosted tab
 * bar fixed to the bottom and the rest of this header is hidden; from 768px
 * it is a slim bar at the top with the brand and the user menu.
 */
export default function AppNav({ user }: { user?: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <header className="appnav">
      <Link href="/" className="brand"><KnightIcon />{APP_NAME}</Link>
      <nav className="tabs" aria-label="Sections">
        {SECTIONS.map((s) => {
          const current = pathname === s.href || pathname.startsWith(s.href + "/");
          const Icon = ICONS[s.href];
          return (
            <Link key={s.href} href={s.href} aria-current={current ? "page" : undefined}>
              <Icon />
              <span>{s.title}</span>
            </Link>
          );
        })}
      </nav>
      {user && <div className="user">{user}</div>}
    </header>
  );
}
