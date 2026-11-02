import type { Page, Route } from "@playwright/test";
import fixture from "../fixtures/chesscom-testplayer.json" with { type: "json" };

// A fake api.chess.com that serves the fixture player (built from real games,
// with the username anonymised to "testplayer"). Every other username 404s,
// the way the real API does. `requests` records each path that was fetched.
export type MonthMap = Record<string, unknown[]>; // "2026/10" → games

export interface MockChessCom {
  requests: string[];
  /** Replace the games served for a month (e.g. to simulate new games arriving). */
  setMonth(month: string, games: unknown[]): void;
  /** Make the API fail with this status for every request (null to recover). */
  failWith(status: number | null): void;
}

export const FIXTURE_USER = fixture.username;
export const FIXTURE_MONTHS = fixture.months as MonthMap;
export const FIXTURE_GAME_COUNT = Object.values(FIXTURE_MONTHS).reduce((n, g) => n + g.length, 0);

export async function mockChessCom(page: Page, months: MonthMap = FIXTURE_MONTHS): Promise<MockChessCom> {
  const data: MonthMap = structuredClone(months);
  const requests: string[] = [];
  let failure: number | null = null;
  const json = (route: Route, status: number, body: unknown) =>
    route.fulfill({
      status,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify(body),
    });

  await page.context().route("https://api.chess.com/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^\/pub\/player\//, "");
    requests.push(url.pathname);
    if (failure) return json(route, failure, { message: "Service unavailable" });
    const [user, ...rest] = path.split("/");
    if (user.toLowerCase() !== FIXTURE_USER) {
      return json(route, 404, { code: 0, message: `User "${user}" not found.` });
    }
    const tail = rest.join("/");
    if (tail === "") {
      return json(route, 200, {
        "@id": `https://api.chess.com/pub/player/${FIXTURE_USER}`,
        url: `https://www.chess.com/member/${FIXTURE_USER}`,
        username: FIXTURE_USER,
        player_id: 1,
        status: "premium",
        joined: 1511139116,
        last_online: 1793636716,
      });
    }
    if (tail === "games/archives") {
      return json(route, 200, {
        archives: Object.keys(data).sort().map((m) => `https://api.chess.com/pub/player/${FIXTURE_USER}/games/${m}`),
      });
    }
    const m = tail.match(/^games\/(\d{4}\/\d{2})$/);
    if (m && data[m[1]]) return json(route, 200, { games: data[m[1]] });
    return json(route, 404, { code: 0, message: "Not found" });
  });

  return {
    requests,
    setMonth(month, games) { data[month] = games; },
    failWith(status) { failure = status; },
  };
}
