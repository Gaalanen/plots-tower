import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TOTAL_WINDOWS, MIN_WINDOW_ID, MAX_WINDOW_ID, isValidWindowId, assertWindowId,
} from '../../src/coords/window-id.mjs';

test('constants: exactly 1,000,000 IDs numbered 0..999,999', () => {
  assert.equal(TOTAL_WINDOWS, 1_000_000);
  assert.equal(MIN_WINDOW_ID, 0);
  assert.equal(MAX_WINDOW_ID, 999_999);
});

test('isValidWindowId — bounds', () => {
  for (const v of [0, 999_999, 500_000, 1]) assert.ok(isValidWindowId(v), `expected valid: ${v}`);
  for (const v of [-1, 1_000_000, 1.5, NaN, Infinity, -Infinity, '5', null, undefined, {}, []]) {
    assert.ok(!isValidWindowId(v), `expected invalid: ${String(v)}`);
  }
});

test('assertWindowId — invalid handling (TypeError vs RangeError)', () => {
  assert.throws(() => assertWindowId(-1), RangeError);
  assert.throws(() => assertWindowId(1_000_000), RangeError);
  assert.throws(() => assertWindowId(1.5), TypeError);
  assert.throws(() => assertWindowId('x'), TypeError);
  assert.throws(() => assertWindowId(NaN), TypeError);
  assert.throws(() => assertWindowId(null), TypeError);
  assert.doesNotThrow(() => assertWindowId(0));
  assert.doesNotThrow(() => assertWindowId(999_999));
});
