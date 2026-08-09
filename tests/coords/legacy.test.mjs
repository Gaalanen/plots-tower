import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LEGACY_COLS, LEGACY_ROWS, LEGACY_TOTAL, FOUNDERS_BASE,
  isValidLegacyId, parseLegacyId, legacyToWindowId, windowIdToLegacy,
  isFoundersWindowId, legacyFloorOf, legacyUnitOf,
} from '../../src/coords/legacy.mjs';
import { isValidWindowId, TOTAL_WINDOWS } from '../../src/coords/window-id.mjs';

test('legacy constants match current live grid', () => {
  assert.equal(LEGACY_COLS, 20);
  assert.equal(LEGACY_ROWS, 30);
  assert.equal(LEGACY_TOTAL, 600);
});

test('isValidLegacyId', () => {
  for (const s of ['0-0', '29-19', '12-9']) assert.ok(isValidLegacyId(s), `valid: ${s}`);
  for (const s of ['30-0', '0-20', '-1-0', '1', 'a-b', '12-9-1', '', ' 1-1', null, 5, {}]) {
    assert.ok(!isValidLegacyId(s), `invalid: ${String(s)}`);
  }
});

test('parseLegacyId', () => {
  assert.deepEqual(parseLegacyId('12-9'), { r: 12, c: 9 });
  assert.throws(() => parseLegacyId('30-0'), TypeError);
  assert.throws(() => parseLegacyId('x'), TypeError);
});

test('all 600 legacy ids → distinct reserved WindowIDs, reversible, no collisions', () => {
  const seen = new Set();
  for (let r = 0; r < LEGACY_ROWS; r++) {
    for (let c = 0; c < LEGACY_COLS; c++) {
      const s = `${r}-${c}`;
      const id = legacyToWindowId(s);
      assert.ok(isValidWindowId(id), `valid windowId for ${s}`);
      assert.ok(isFoundersWindowId(id), `in founders band: ${s} → ${id}`);
      assert.ok(!seen.has(id), `collision at ${s} → ${id}`);
      seen.add(id);
      assert.equal(windowIdToLegacy(id), s, `reverse for ${s}`);
    }
  }
  assert.equal(seen.size, LEGACY_TOTAL);
});

test('windowIdToLegacy returns null outside the founders band', () => {
  const justAbove = FOUNDERS_BASE + LEGACY_TOTAL;
  if (isValidWindowId(justAbove)) assert.equal(windowIdToLegacy(justAbove), null);
  if (FOUNDERS_BASE > 0) assert.equal(windowIdToLegacy(FOUNDERS_BASE - 1), null);
  assert.equal(windowIdToLegacy(-1), null);
  assert.equal(windowIdToLegacy(1.5), null);
});

test('reference production math mirrors (floor = 30 - r, unit = c + 1)', () => {
  assert.equal(legacyFloorOf(12), 18);
  assert.equal(legacyUnitOf(9), 10);
  assert.equal(legacyFloorOf(0), 30);
  assert.equal(legacyUnitOf(0), 1);
});

test('FOUNDERS_BASE is a valid pre-launch placeholder band', () => {
  assert.ok(Number.isInteger(FOUNDERS_BASE));
  assert.ok(FOUNDERS_BASE >= 0);
  assert.ok(FOUNDERS_BASE + LEGACY_TOTAL <= TOTAL_WINDOWS);
});
