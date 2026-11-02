"use client";

import { useAuth } from "@clerk/nextjs";
import { CLOUD } from "@/lib/cloud";
import { installStorage } from "@/lib/storage-client";
import { GamesProvider } from "@/lib/games";

// window.storage must exist before any page's effects read it. Installing at
// module scope runs before the first render of anything below this provider.
installStorage();

/** App-wide client state, rendered once by the root layout. */
export default function AppProviders({ children }: { children: React.ReactNode }) {
  return CLOUD ? (
    <CloudGamesProvider>{children}</CloudGamesProvider>
  ) : (
    <GamesProvider scope="local">{children}</GamesProvider>
  );
}

/** In cloud mode the linked account belongs to the signed-in Clerk user; reload it if they switch. */
function CloudGamesProvider({ children }: { children: React.ReactNode }) {
  const { isLoaded, userId } = useAuth();
  return <GamesProvider scope={isLoaded ? userId ?? null : undefined}>{children}</GamesProvider>;
}
