// Lumora Tower — architectural mapping (VERSIONED).
//
// Maps a WindowID to an architectural location on the tower. This is the ONLY
// layer that knows what the building looks like. It is a pure function of
// (windowId, geometryVersion) and NEVER derives or mutates a WindowID.
//
// Future redesigns (setbacks, crown, varying widths, multiple facades) add a NEW
// geometryVersion and NEVER change any WindowID. See LUMORA_ARCHITECTURE.md §2, §15.1.
//
// NOTE: the mappings below are PROVISIONAL. Render coordinates (world/screen) are
// the renderer's responsibility (P5), not this module.

import { assertWindowId } from './window-id.mjs';
import { toLogical, LOGICAL_ROWS, LOGICAL_COLS, zoneOf } from './logical.mjs';

export const DEFAULT_GEOMETRY_VERSION = 'g1';
export const GEOMETRY_VERSIONS = ['g1', 'g2']; // g2 is a provisional alternate used to prove version-independence

export function isGeometryVersion(v) {
  return GEOMETRY_VERSIONS.includes(v);
}

const MAPPERS = {
  // g1 — provisional single-surface facade: u = left→right, v = top→bottom.
  g1(windowId) {
    const { row, col } = toLogical(windowId);
    return {
      surfaceId: 'main',
      u: col / (LOGICAL_COLS - 1),
      v: row / (LOGICAL_ROWS - 1),
      archZone: `z${zoneOf(windowId)}`,
      tier: zoneOf(windowId),
      sizeClass: 'standard',
    };
  },
  // g2 — provisional mirrored facade (demonstrator): same WindowIDs, different placement.
  g2(windowId) {
    const { row, col } = toLogical(windowId);
    return {
      surfaceId: 'main',
      u: 1 - col / (LOGICAL_COLS - 1),
      v: row / (LOGICAL_ROWS - 1),
      archZone: `z${zoneOf(windowId)}`,
      tier: zoneOf(windowId),
      sizeClass: 'standard',
    };
  },
};

/**
 * WindowID → architectural location for a given geometryVersion.
 * Pure; depends only on (windowId, geometryVersion). Never changes the WindowID.
 */
export function toArchitectural(windowId, geometryVersion = DEFAULT_GEOMETRY_VERSION) {
  assertWindowId(windowId);
  if (!isGeometryVersion(geometryVersion)) {
    throw new RangeError(`Unknown geometryVersion: ${JSON.stringify(geometryVersion)}`);
  }
  return { ...MAPPERS[geometryVersion](windowId), geometryVersion };
}
