import type { Metadata, Viewport } from "next";
import { ClerkProvider, UserButton } from "@clerk/nextjs";
import { CLOUD } from "@/lib/cloud";
import { APP_NAME, APP_TAGLINE } from "@/lib/site";
import AppNav from "@/components/AppNav";
import AppProviders from "@/components/AppProviders";
import "./globals.css";

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
    <html lang="en">
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
