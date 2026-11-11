import { expect, test, type Locator, type Page } from '@playwright/test';

// Guards the map picker on "Post a trip". It broke once with no error visible
// to anyone: the map library and its worker script were different versions, so
// the page showed only a beige background and a pin. Unit tests and a passing
// build can't see that - only looking at what actually gets drawn can.
//
// The backend is faked (no real login, no real database, no analytics), but
// the map libraries and the real MapTiler tile service are NOT: those are the
// parts that can break, so they stay live.

const ADDRESS = '6823 Saint Francis Court, Irving, TX 75039';

// How many distinct colors (5 bits per channel) the map area contains.
// Measured on this map size: a working street map ~630, the broken state
// (flat background + pin + attribution text) ~63. The threshold sits well
// between the two. If it ever fails on a map that visibly works, measure
// again before lowering it.
const MIN_DISTINCT_COLORS = 250;

function base64url(value: object): string {
  return btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fakeSession() {
  const now = Math.floor(Date.now() / 1000);
  const user = {
    id: '00000000-0000-4000-8000-000000000001',
    aud: 'authenticated',
    role: 'authenticated',
    email: 'e2e@example.com',
    app_metadata: {},
    user_metadata: {},
    created_at: '2026-01-01T00:00:00Z',
  };
  // Not a real token - nothing validates it, because every backend call is
  // intercepted below. Expiry is far enough out that no refresh is attempted.
  const accessToken = [
    base64url({ alg: 'HS256', typ: 'JWT' }),
    base64url({ sub: user.id, role: 'authenticated', exp: now + 3600 }),
    'e2e-signature',
  ].join('.');
  return {
    access_token: accessToken,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: now + 3600,
    refresh_token: 'e2e-refresh-token',
    user,
  };
}

async function fakeBackend(page: Page) {
  const session = fakeSession();

  // Make the app think this user is already signed in, whatever Supabase
  // project the build points at (the storage key includes the project name).
  await page.addInitScript((stored) => {
    const getItem = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key: string) {
      return /^sb-.+-auth-token$/.test(key) ? stored : getItem.call(this, key);
    };
  }, JSON.stringify(session));

  const json = (body: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

  // Playwright tries the most recently added route first, so the catch-alls
  // go first and the specific ones after.
  await page.route('**/auth/v1/**', (route) => route.fulfill(json({})));
  await page.route('**/rest/v1/**', (route) => route.fulfill(json([])));
  await page.route('**/functions/v1/**', (route) => route.fulfill(json({})));
  await page.route('**/auth/v1/user*', (route) => route.fulfill(json(session.user)));
  await page.route('**/rest/v1/users*', (route) => route.fulfill(json({ home_region_id: 'dfw' })));
  await page.route('**/rest/v1/rpc/increment_feedback_prompt_count', (route) => route.fulfill(json(1)));

  // Address search: one fixed result, so the test doesn't depend on (or spend)
  // the LocationIQ quota.
  await page.route('https://us1.locationiq.com/**', (route) =>
    route.fulfill(json([{ lat: '32.8662', lon: '-96.9526', display_name: ADDRESS }])),
  );

  // Never send analytics from a test run.
  await page.route(/posthog\.com/, (route) => route.abort());
}

// Distinct colors (5 bits per channel) in a screenshot of the map. Counted
// inside the page so no image library is needed.
async function colorCount(page: Page, map: Locator): Promise<number> {
  const png = (await map.screenshot()).toString('base64');
  return page.evaluate(async (data) => {
    const img = new Image();
    img.src = `data:image/png;base64,${data}`;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const px = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const seen = new Set<number>();
    for (let i = 0; i < px.length; i += 4) {
      seen.add(((px[i] >> 3) << 10) | ((px[i + 1] >> 3) << 5) | (px[i + 2] >> 3));
    }
    return seen.size;
  }, png);
}

async function expectMapDrawn(page: Page, map: Locator, when: string) {
  await expect
    .poll(() => colorCount(page, map), {
      message: `map is blank ${when} (only background and pin, no tiles)`,
      timeout: 25_000,
      intervals: [500, 1000, 1000, 2000],
    })
    .toBeGreaterThan(MIN_DISTINCT_COLORS);
}

test('map draws real tiles, before and after an address search', async ({ page }, testInfo) => {
  const problems: string[] = [];
  page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text()}`));
  page.on('pageerror', (e) => problems.push(`pageerror: ${e}`));
  page.on('requestfailed', (r) => problems.push(`request failed: ${r.url().split('?')[0]} (${r.failure()?.errorText})`));

  // A tile request that is refused (bad/expired key, quota used up, blocked
  // origin) leaves a blank map just the same, so watch for that too.
  const refusedTiles: string[] = [];
  page.on('response', (r) => {
    if (r.url().includes('api.maptiler.com') && r.status() >= 400) refusedTiles.push(`${r.status()} ${r.url().split('?')[0]}`);
  });

  try {
    await fakeBackend(page);
    await page.goto('/');

    await expect(page.getByText('Post a trip').first()).toBeVisible();
    const map = page.locator('.maplibregl-map').first();
    await expect(map).toBeVisible();

    await expectMapDrawn(page, map, 'on first load');

    const search = page.getByPlaceholder('Search an address').first();
    await search.fill(ADDRESS);
    await search.press('Enter');
    await expect(page.locator('.maplibregl-marker').first()).toBeVisible();
    await expectMapDrawn(page, map, 'after searching an address');

    expect(refusedTiles, 'MapTiler refused some requests').toEqual([]);
    expect(problems.filter((p) => /maplibre|not iterable|worker/i.test(p)), 'map errors in the console').toEqual([]);
  } finally {
    // What the browser reported, so a CI failure can be diagnosed without
    // re-running it locally.
    await testInfo.attach('browser-problems', {
      body: [...problems, ...refusedTiles.map((t) => `maptiler refused: ${t}`)].join('\n') || '(none)',
      contentType: 'text/plain',
    });
  }
});
