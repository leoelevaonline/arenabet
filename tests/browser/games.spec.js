import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const now = new Date().toISOString();
    localStorage.setItem('arenabet.local.database.v1', JSON.stringify({
      users: [{
        id: 'demo-user',
        full_name: 'Visitante',
        email: 'demo@arenabet.local',
        cpf: '52998224725',
        phone: '11999999999',
        birth_date: '1990-01-01',
        password_hash: 'x',
        role: 'user',
        balance: 1000,
        created_date: now,
        updated_date: now,
      }],
      entities: {
        HouseConfig: [{
          id: 'house-config',
          label: 'Principal',
          rake_percent: 10,
          house_edge_percent: 15,
          min_bet: 10,
          max_bet: 1000,
          house_balance: 0,
          created_date: now,
          updated_date: now,
        }],
        Match: [],
        Transaction: [],
        User: [],
      },
    }));
    sessionStorage.setItem('arenabet.session.v1', JSON.stringify({ userId: 'demo-user' }));
  });
});

const games = {
  sinuca: { start: 'Iniciar partida', width: 1120, height: 620, x: 274, y: 310 },
  futebol: { start: 'Entrar na mesa', width: 1000, height: 620, x: 214, y: 310 },
  bocha: { start: 'Armar partida', width: 1100, height: 560, x: 685, y: 273 },
};
const database = page => page.evaluate(() => JSON.parse(localStorage.getItem('arenabet.local.database.v1')));

async function screenPoint(page, game, x, y) {
  const box = await page.locator('canvas').first().boundingBox();
  return box.height > box.width
    ? { x: box.x + y / game.height * box.width, y: box.y + (1 - x / game.width) * box.height }
    : { x: box.x + x / game.width * box.width, y: box.y + y / game.height * box.height };
}

async function drag(page, game, x, y, dx, dy) {
  const start = await screenPoint(page, game, x, y);
  const end = await screenPoint(page, game, x + dx, y + dy);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 12 });
  await page.mouse.up();
}

for (const mobile of [false, true]) {
  for (const [name, game] of Object.entries(games)) {
    test(`${name}: ${mobile ? 'portrait' : 'desktop'} gesture, cancellation and abandonment`, async ({ page }, testInfo) => {
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 });
      await page.goto(`/${name}`);
      await page.getByRole('button', { name: game.start }).click();
      const canvas = page.locator('canvas').first();
      await canvas.scrollIntoViewIfNeeded();
      const point = await screenPoint(page, game, game.x, game.y);
      await page.mouse.move(point.x, point.y);
      await page.mouse.down();
      await page.mouse.move(point.x + 15, point.y + 30, { steps: 4 });
      const aimed = await canvas.evaluate(c => c.toDataURL());
      await canvas.dispatchEvent('pointermove', { pointerId: 999, clientX: point.x + 100, clientY: point.y + 100 });
      expect(await canvas.evaluate(c => c.toDataURL())).toBe(aimed);
      await canvas.dispatchEvent('pointercancel', { pointerId: 1 });
      await page.mouse.up();
      if (name !== 'bocha') await expect(page.getByText('0%', { exact: true }).filter({ visible: true }).first()).toBeVisible();
      await drag(page, game, game.x, game.y, name === 'bocha' ? 100 : -150, 0);
      if (name === 'futebol') await expect(page.getByText('1/6 chutes').filter({ visible: true }).first()).toBeVisible();
      if (name === 'bocha') await expect(page.getByText('Bolim fixado.', { exact: false })).toBeVisible();
      if (name === 'sinuca') await expect(page.getByRole('note')).not.toContainText('Quebra inicial:');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath('table.png'), fullPage: true });
      await page.getByRole('link', { name: 'Lobby', exact: true }).first().click();
      await expect.poll(async () => (await database(page)).entities.Match[0].status).toBe('abandoned');
      expect((await database(page)).users[0].balance).toBe(950);
      expect(errors).toEqual([]);
    });
  }
}

// Set up a deterministic endgame in an isolated browser context. The shot,
// pocket collision, outcome mapping and wallet settlement still run normally.
for (const early of [false, true, 'break']) {
  test(`pool eight-ball settlement: ${early === 'break' ? 'respot on break' : early ? 'premature loss' : 'legal victory'}`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/sinuca');
    await page.getByRole('button', { name: games.sinuca.start }).click();
    await page.locator('canvas').evaluate((canvas, early) => {
      let fiber = canvas[Object.keys(canvas).find(key => key.startsWith('__reactFiber'))];
      let world;
      while (fiber && !world) {
        let hook = fiber.memoizedState;
        while (hook) {
          if (hook.memoizedState?.current?.balls) { world = hook.memoizedState.current; break; }
          hook = hook.next;
        }
        fiber = fiber.return;
      }
      if (!world) throw new Error('Pool world not found');
      world.breakOpen = early === 'break';
      world.groups = early === 'break' ? { player: null, ai: null } : { player: 'solid', ai: 'stripe' };
      for (const ball of world.balls) {
        ball.pocketed = !['cue', 'ball-8'].includes(ball.id);
        ball.vx = 0; ball.vy = 0;
        if (ball.id === 'cue') { ball.x = 560; ball.y = 230; }
        if (ball.id === 'ball-8') { ball.x = 560; ball.y = 145; }
        if (early && ball.id === 'ball-1') { ball.pocketed = false; ball.x = 900; ball.y = 400; }
      }
    }, early);
    await drag(page, games.sinuca, 560, 230, 0, 95);
    if (early === 'break') {
      await expect(page.getByRole('note')).toContainText('recolocada', { timeout: 15000 });
      expect((await database(page)).entities.Match[0].status).toBe('playing');
      expect((await database(page)).users[0].balance).toBe(950);
      return;
    }
    await expect.poll(async () => (await database(page)).entities.Match[0].status, { timeout: 15000 }).toBe(early ? 'lost' : 'won');
    expect((await database(page)).users[0].balance).toBe(early ? 950 : 1040);
  });
}

test('simultaneous bets and duplicate payout do not duplicate credits', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const wallet = await import('/src/lib/wallet.js');
    const bets = await Promise.allSettled([wallet.placeBet(50, 'sinuca'), wallet.placeBet(50, 'sinuca')]);
    const match = bets.find(bet => bet.status === 'fulfilled').value;
    await Promise.all([wallet.settleMatch(match, 'won', 90, 10), wallet.settleMatch(match, 'won', 90, 10)]);
    return { accepted: bets.filter(bet => bet.status === 'fulfilled').length, balance: await wallet.getBalance() };
  });
  expect(result).toEqual({ accepted: 1, balance: 1040 });
  expect((await database(page)).entities.Transaction.filter(t => t.type === 'win')).toHaveLength(1);
});
