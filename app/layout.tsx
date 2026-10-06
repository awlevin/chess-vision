import type { Metadata, Viewport } from "next";
import { ClerkProvider, UserButton } from "@clerk/nextjs";
import { CLOUD } from "@/lib/cloud";
import "./globals.css";

const TITLE = "Chess Vision";
const DESCRIPTION =
  "Timed board-vision drills: find and name every square, with adaptive repetition on the ones you miss.";

export const metadata: Metadata = {
  title: TITLE,
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
        {CLOUD && (
          // All routes are protected in cloud mode, so a user is always
          // signed in here.
          <div
            style={{
              position: "fixed",
              top: "calc(env(safe-area-inset-top, 0px) + 16px)",
              right: 16,
              zIndex: 100,
            }}
          >
            <UserButton />
          </div>
        )}
        {children}
      </body>
    </html>
  );
  return CLOUD ? <ClerkProvider>{body}</ClerkProvider> : body;
}
