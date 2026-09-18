import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveHand, deal, cardRank } from '../src/lib/truco.js';
import { requestGameFrame, cancelGameFrame } from '../src/lib/gameFrame.js';
import { tablePoint } from '../src/lib/canvasTable.js';

test('portrait and landscape gestures address the same table coordinates', () => {
  assert.deepEqual(tablePoint({left:10,top:20,width:1120,height:620},284,330,1120,620), {x:274,y:310});
  const portrait = tablePoint({left:10,top:20,width:310,height:560},165,443,1120,620);
  assert.ok(Math.abs(portrait.x-274)<0.0001);
  assert.equal(portrait.y,310);
});

test('Truco resolves ties as soon as the hand is decided', () => {
  const hand = (...winners) => resolveHand(winners.map(winner => ({ winner })));
  assert.equal(hand('player'), null);
  assert.equal(hand('player', 'ai'), null);
  assert.deepEqual(hand('tie', 'player'), { winner: 'player' });
  assert.deepEqual(hand('ai', 'tie'), { winner: 'ai' });
  assert.deepEqual(hand('ai', 'player', 'tie'), { winner: 'ai' });
  assert.deepEqual(hand('tie', 'tie', 'tie'), { winner: 'player' });
});

test('Truco deals unique cards and wraps manilhas from 3 to 4', () => {
  const cards = deal();
  const all = [cards.vira, ...cards.player, ...cards.ai];
  assert.equal(new Set(all.map(c => `${c.value}-${c.suit}`)).size, 7);
  assert.ok(cardRank({ value: '4', suit: 'paus' }, { value: '3' }) > cardRank({ value: '4', suit: 'copas' }, { value: '3' }));
  assert.ok(cardRank({ value: '4', suit: 'ouros' }, { value: '3' }) > cardRank({ value: '3', suit: 'paus' }, { value: '3' }));
});

test('frame fallback advances exactly once and cancellation prevents late callbacks', () => {
  const original = globalThis.window;
  let frame, timer, calls = 0;
  globalThis.window = {
    requestAnimationFrame: cb => { frame = cb; return 1; },
    cancelAnimationFrame: () => {},
    setTimeout: cb => { timer = cb; return 2; },
    clearTimeout: () => {},
  };
  try {
    requestGameFrame(() => calls++);
    timer(); frame(); timer();
    assert.equal(calls, 1);
    const handle = requestGameFrame(() => calls++);
    cancelGameFrame(handle); frame(); timer();
    assert.equal(calls, 1);
    requestGameFrame(() => calls++);
    frame(); timer();
    assert.equal(calls, 2);
  } finally {
    globalThis.window = original;
  }
});
