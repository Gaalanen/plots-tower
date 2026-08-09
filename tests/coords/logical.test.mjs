import test from 'node:test';
import assert from 'node:assert/strict';
import { TOTAL_WINDOWS } from '../../src/coords/window-id.mjs';
import {
  LOGICAL_COLS, LOGICAL_ROWS, TILE_SIZE, TILE_COUNT,
  toLogical, fromLogical, isValidLogical, assertLogical, tileOf, windowIdsInTile, zoneOf,
} from '../../src/coords/logical.mjs';

test('logical grid covers exactly 1,000,000', () => {
  assert.equal(LOGICAL_ROWS * LOGICAL_COLS, TOTAL_WINDOWS);
});

test('boundary mappings', () => {
  assert.deepEqual(toLogical(0), { row: 0, col: 0 });
  assert.deepEqual(toLogical(999_999), { row: 999, col: 999 });
  assert.equal(fromLogical({ row: 0, col: 0 }), 0);
  assert.equal(fromLogical({ row: 999, col: 999 }), 999_999);
});

test('FULL 1,000,000-ID bijection round-trip', () => {
  const t0 = performance.now();
  let checked = 0;
  for (let id = 0; id < TOTAL_WINDOWS; id++) {
    const { row, col } = toLogical(id);
    if (fromLogical({ row, col }) !== id) assert.fail(`bijection broke at id=${id}`);
    checked++;
  }
  const ms = performance.now() - t0;
  assert.equal(checked, TOTAL_WINDOWS);
  console.log(`\n[P1] full 1,000,000-ID bijection round-trip: ${ms.toFixed(1)} ms (${checked} ids)`);
});

test('invalid logical handling', () => {
  assert.ok(!isValidLogical({ row: -1, col: 0 }));
  assert.ok(!isValidLogical({ row: 0, col: LOGICAL_COLS }));
  assert.ok(!isValidLogical({ row: 1.5, col: 0 }));
  assert.ok(!isValidLogical(null));
  assert.throws(() => assertLogical({ row: LOGICAL_ROWS, col: 0 }), RangeError);
  assert.throws(() => toLogical(-1), RangeError);
  assert.throws(() => fromLogical({ row: 0, col: LOGICAL_COLS }), RangeError);
});

test('tileOf and windowIdsInTile', () => {
  assert.deepEqual(tileOf(0), { tileRow: 0, tileCol: 0, tileId: 0 });
  assert.equal(tileOf(999_999).tileId, TILE_COUNT - 1);
  let n = 0;
  for (const id of windowIdsInTile(0)) { assert.ok(id >= 0 && id < TOTAL_WINDOWS); n++; }
  assert.equal(n, TILE_SIZE * TILE_SIZE); // 2500
  assert.throws(() => [...windowIdsInTile(TILE_COUNT)], RangeError);
  assert.throws(() => [...windowIdsInTile(-1)], RangeError);
});

test('tiles partition the whole ID space', () => {
  assert.equal(TILE_COUNT * TILE_SIZE * TILE_SIZE, TOTAL_WINDOWS);
});

test('zoneOf range', () => {
  assert.equal(zoneOf(0), 0);
  assert.equal(zoneOf(999_999), 9);
});
