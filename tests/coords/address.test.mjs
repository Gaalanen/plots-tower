import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_ADDRESS_VERSION, ADDRESS_VERSIONS, isAddressVersion,
  toAddress, fromAddress, canonicalPath, parseCanonicalPath, toPrettyPath, fromPrettyPath,
} from '../../src/coords/address.mjs';

test('version registry', () => {
  assert.equal(DEFAULT_ADDRESS_VERSION, 'a1');
  assert.ok(isAddressVersion('a1'));
  assert.ok(!isAddressVersion('zz'));
  assert.throws(() => toAddress(0, 'zz'), RangeError);
});

test('address round-trip within each version (object and string)', () => {
  for (const id of [0, 1, 999, 1000, 42_042, 999_999]) {
    for (const v of ADDRESS_VERSIONS) {
      const a = toAddress(id, v);
      assert.equal(fromAddress(a, v), id, `object round-trip ${v} id=${id}`);
      assert.equal(fromAddress(a.full, v), id, `string round-trip ${v} id=${id}`);
    }
  }
});

test('addressVersion is INDEPENDENT of WindowID identity', () => {
  for (const id of [7, 12_345, 987_654]) {
    const a1 = toAddress(id, 'a1');
    const a2 = toAddress(id, 'a2');
    assert.notEqual(a1.full, a2.full);            // wording differs across versions
    assert.equal(fromAddress(a1.full, 'a1'), id); // ...but both resolve back to the same id
    assert.equal(fromAddress(a2.full, 'a2'), id);
  }
});

test('canonical + pretty paths', () => {
  assert.equal(canonicalPath(42), '/w/42');
  assert.equal(parseCanonicalPath('/w/42'), 42);
  for (const id of [0, 500, 999_999]) {
    assert.equal(parseCanonicalPath(canonicalPath(id)), id);
    assert.equal(fromPrettyPath(toPrettyPath(id)), id);
  }
});

test('invalid addresses / paths → null', () => {
  assert.equal(fromAddress('nonsense'), null);
  assert.equal(fromAddress(null), null);
  assert.equal(fromAddress({ floor: 'x', unit: 1 }), null);
  assert.equal(parseCanonicalPath('/w/-1'), null);
  assert.equal(parseCanonicalPath('/w/abc'), null);
  assert.equal(parseCanonicalPath('/w/1000000'), null);
  assert.equal(parseCanonicalPath('nope'), null);
  assert.equal(fromPrettyPath('/x/y'), null);
});
