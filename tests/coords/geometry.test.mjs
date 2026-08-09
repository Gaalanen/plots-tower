import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_GEOMETRY_VERSION, GEOMETRY_VERSIONS, isGeometryVersion, toArchitectural,
} from '../../src/coords/geometry.mjs';
import { isValidWindowId } from '../../src/coords/window-id.mjs';
import { toLogical } from '../../src/coords/logical.mjs';

test('version registry', () => {
  assert.equal(DEFAULT_GEOMETRY_VERSION, 'g1');
  assert.ok(isGeometryVersion('g1'));
  assert.ok(!isGeometryVersion('nope'));
  assert.throws(() => toArchitectural(0, 'nope'), RangeError);
});

test('toArchitectural returns a well-formed location', () => {
  const loc = toArchitectural(123_456);
  for (const k of ['surfaceId', 'u', 'v', 'archZone', 'tier', 'sizeClass', 'geometryVersion']) {
    assert.ok(k in loc, `missing field: ${k}`);
  }
  assert.ok(loc.u >= 0 && loc.u <= 1);
  assert.ok(loc.v >= 0 && loc.v <= 1);
  assert.equal(loc.geometryVersion, 'g1');
});

test('geometryVersion is INDEPENDENT of WindowID identity', () => {
  for (const id of [0, 1, 42, 500_000, 999_999]) {
    const before = toLogical(id);
    const g1 = toArchitectural(id, 'g1');
    const g2 = toArchitectural(id, 'g2');
    // identity is untouched by any geometry call
    assert.deepEqual(toLogical(id), before);
    assert.ok(isValidWindowId(id));
    // different versions may place the SAME window differently...
    assert.notDeepEqual({ u: g1.u, v: g1.v }, { u: g2.u, v: g2.v });
    // ...but neither call changes the WindowID's logical identity
    assert.deepEqual(toLogical(id), before);
  }
});

test('stability / purity', () => {
  assert.deepEqual(toArchitectural(777), toArchitectural(777));
  assert.deepEqual(toArchitectural(777, 'g2'), toArchitectural(777, 'g2'));
  assert.ok(GEOMETRY_VERSIONS.includes('g1'));
});
