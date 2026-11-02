import Link from "next/link";
import { APP_NAME, APP_TAGLINE, SECTIONS } from "@/lib/site";

export default function Home() {
  return (
    <main className="page">
      <h1>{APP_NAME}</h1>
      <p className="lede">{APP_TAGLINE}</p>
      <div className="hubgrid">
        {SECTIONS.map((s) => (
          <Link key={s.href} href={s.href} className="hubcard">
            <h2>{s.title}</h2>
            <p>{s.blurb}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}
