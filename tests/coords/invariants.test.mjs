import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import * as coords from '../../src/coords/index.mjs';
import { TOTAL_WINDOWS } from '../../src/coords/window-id.mjs';
import { LOGICAL_ROWS, LOGICAL_COLS } from '../../src/coords/logical.mjs';
import { LEGACY_TOTAL, FOUNDERS_BASE } from '../../src/coords/legacy.mjs';

test('index re-exports the public API', () => {
  const expected = [
    'TOTAL_WINDOWS', 'isValidWindowId', 'assertWindowId',
    'toLogical', 'fromLogical', 'isValidLogical', 'tileOf', 'zoneOf',
    'toArchitectural', 'GEOMETRY_VERSIONS', 'DEFAULT_GEOMETRY_VERSION',
    'toAddress', 'fromAddress', 'canonicalPath', 'parseCanonicalPath', 'toPrettyPath', 'fromPrettyPath',
    'legacyToWindowId', 'windowIdToLegacy', 'isValidLegacyId', 'FOUNDERS_BASE',
  ];
  for (const name of expected) assert.ok(name in coords, `missing export: ${name}`);
});

test('exactly 1,000,000 IDs and the founders band fits inside', () => {
  assert.equal(TOTAL_WINDOWS, 1_000_000);
  assert.equal(LOGICAL_ROWS * LOGICAL_COLS, 1_000_000);
  assert.ok(FOUNDERS_BASE + LEGACY_TOTAL <= TOTAL_WINDOWS);
});

test('determinism: fixed vector is stable (no Date/random)', () => {
  const vec = (id) => JSON.stringify([
    coords.toLogical(id),
    coords.toArchitectural(id),
    coords.toAddress(id),
    coords.windowIdToLegacy(id),
    coords.canonicalPath(id),
  ]);
  for (const id of [0, 599, 12_345, 999_999]) {
    assert.equal(vec(id), vec(id));
  }
});

test('ISOLATION: coords source imports no production code or infra', () => {
  const dir = fileURLToPath(new URL('../../src/coords/', import.meta.url));
  const files = readdirSync(dir).filter((f) => f.endsWith('.mjs'));
  assert.ok(files.length >= 6, 'expected the coords module files');
  // Check the actual dependency graph (import/require specifiers), not comments/prose.
  const specifiers = (src) => [
    ...src.matchAll(/(?:import[^'"]*?from\s*|import\s*|require\s*\(\s*)['"]([^'"]+)['"]/g),
  ].map((m) => m[1]);
  for (const f of files) {
    const src = readFileSync(join(dir, f), 'utf8');
    for (const spec of specifiers(src)) {
      assert.ok(!/(?:^|\/)(?:lib|pages)\//.test(spec), `${f} imports production code: ${spec}`);
      assert.ok(!/upstash|stripe|ioredis|redis/i.test(spec), `${f} imports infra: ${spec}`);
      assert.ok(spec.startsWith('.') || spec.startsWith('node:'), `${f} unexpected import: ${spec}`);
    }
  }
});
