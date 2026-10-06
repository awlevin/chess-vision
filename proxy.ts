import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { CLOUD } from "@/lib/cloud";

// In cloud mode every route requires a signed-in user; unauthenticated
// visitors are redirected to Clerk's hosted sign-in. In local mode there is
// nothing to protect.
export default CLOUD
  ? clerkMiddleware(async (auth) => {
      await auth.protect();
    })
  : () => NextResponse.next();

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
