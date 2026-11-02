import { defineConfig, devices } from "@playwright/test";

// End-to-end tests run the real app (local mode: no Clerk, browser storage)
// in a real browser. Chess.com is mocked at the network layer from
// tests/fixtures, except in tests tagged @live.
const PORT = Number(process.env.E2E_PORT ?? 3123);

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    // A production build, so tests see what users see (and dev-only
    // overlays can't hide bugs).
    command: `npm run build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    timeout: 240_000,
    reuseExistingServer: !process.env.CI,
    env: { NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "" },
  },
});
