// Cloud mode (Clerk sign-in + Neon-backed stats) switches on when the Clerk
// publishable key is set at build time. Without it the app runs signed-out
// and keeps stats in this browser's localStorage.
export const CLOUD = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
