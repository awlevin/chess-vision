import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, IBM_Plex_Mono, Inter } from "next/font/google";
import { ClerkProvider, UserButton } from "@clerk/nextjs";
import { CLOUD } from "@/lib/cloud";
import { APP_NAME, APP_TAGLINE } from "@/lib/site";
import AppNav from "@/components/AppNav";
import AppProviders from "@/components/AppProviders";
import "./design-tokens.css";
import "./globals.css";

// Self-hosted by next/font and exposed as CSS variables, which
// design-tokens.css (--font-display, --font-ui) and globals.css (--mono) use.
const display = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-cormorant",
  display: "swap",
});
const ui = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-inter", display: "swap" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["500", "600"], variable: "--font-plex-mono", display: "swap" });

const TITLE = APP_NAME;
const DESCRIPTION = APP_TAGLINE;

export const metadata: Metadata = {
  title: { default: TITLE, template: `%s · ${TITLE}` },
  description: DESCRIPTION,
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: TITLE,
  },
  openGraph: { type: "website", siteName: TITLE, title: TITLE, description: DESCRIPTION, url: "/" },
  twitter: { card: "summary", title: TITLE, description: DESCRIPTION },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#15120F",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const body = (
    <html lang="en" className={`${display.variable} ${ui.variable} ${mono.variable}`}>
      <body>
        {/* All routes are protected in cloud mode, so a user is always signed in here. */}
        <AppProviders>
          <AppNav user={CLOUD ? <UserButton /> : undefined} />
          {children}
        </AppProviders>
      </body>
    </html>
  );
  return CLOUD ? <ClerkProvider>{body}</ClerkProvider> : body;
}
