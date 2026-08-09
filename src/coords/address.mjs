// Lumora Tower — public address (VERSIONED, presentation only).
//
// The public Lumora address is a human-facing presentation of a window. It is
// versioned (addressVersion) and may be renamed/localized/reformatted over time.
// It ALWAYS resolves back to the immutable WindowID and is NEVER a key.
// See LUMORA_ARCHITECTURE.md §2.3, §15.4.
//
// Canonical machine link: /w/{WindowID} (never changes).

import { assertWindowId, isValidWindowId } from './window-id.mjs';
import { toLogical, fromLogical, LOGICAL_ROWS, LOGICAL_COLS, zoneOf } from './logical.mjs';

export const DEFAULT_ADDRESS_VERSION = 'a1';
export const ADDRESS_VERSIONS = ['a1', 'a2']; // a2 is a provisional alternate to prove version-independence

export function isAddressVersion(v) {
  return ADDRESS_VERSIONS.includes(v);
}

// floor/unit are the same underlying coordinates in every version; only wording differs.
function coordsOf(windowId) {
  const { row, col } = toLogical(windowId);
  return { zone: zoneOf(windowId), floor: LOGICAL_ROWS - row, unit: col + 1 };
}
function toWindowId({ floor, unit }) {
  const f = Number(floor), u = Number(unit);
  if (!Number.isInteger(f) || !Number.isInteger(u)) return null;
  const row = LOGICAL_ROWS - f;
  const col = u - 1;
  if (row < 0 || row >= LOGICAL_ROWS || col < 0 || col >= LOGICAL_COLS) return null;
  const id = fromLogical({ row, col });
  return isValidWindowId(id) ? id : null;
}

const ADDR = {
  a1: {
    to(windowId) {
      const { zone, floor, unit } = coordsOf(windowId);
      return { zone, floor, unit, full: `Zone ${zone} · Floor ${floor} · Unit ${unit}`, addressVersion: 'a1' };
    },
    parse(str) {
      const m = /Floor\s+(\d+)\s*·\s*Unit\s+(\d+)/i.exec(str);
      return m ? { floor: +m[1], unit: +m[2] } : null;
    },
  },
  a2: {
    to(windowId) {
      const { zone, floor, unit } = coordsOf(windowId);
      return { zone, floor, unit, full: `Lumora ${zone}-${floor}-${unit}`, addressVersion: 'a2' };
    },
    parse(str) {
      const m = /Lumora\s+\d+-(\d+)-(\d+)/i.exec(str);
      return m ? { floor: +m[1], unit: +m[2] } : null;
    },
  },
};

/** WindowID → public address object for a given version. */
export function toAddress(windowId, addressVersion = DEFAULT_ADDRESS_VERSION) {
  assertWindowId(windowId);
  if (!isAddressVersion(addressVersion)) {
    throw new RangeError(`Unknown addressVersion: ${JSON.stringify(addressVersion)}`);
  }
  return ADDR[addressVersion].to(windowId);
}

/** Public address (object with {floor,unit}, or a full string) → WindowID, or null. */
export function fromAddress(partsOrString, addressVersion = DEFAULT_ADDRESS_VERSION) {
  if (!isAddressVersion(addressVersion)) return null;
  let parts = partsOrString;
  if (typeof partsOrString === 'string') parts = ADDR[addressVersion].parse(partsOrString);
  if (!parts || typeof parts !== 'object') return null;
  return toWindowId(parts);
}

/** Canonical, version-independent machine link. */
export function canonicalPath(windowId) {
  assertWindowId(windowId);
  return `/w/${windowId}`;
}

/** Parse a canonical /w/{id} path → WindowID, or null. */
export function parseCanonicalPath(path) {
  if (typeof path !== 'string') return null;
  const m = /^\/w\/(\d+)$/.exec(path.trim());
  if (!m) return null;
  const id = Number(m[1]);
  return isValidWindowId(id) ? id : null;
}

/** Pretty, shareable URL for a given address version. */
export function toPrettyPath(windowId, addressVersion = DEFAULT_ADDRESS_VERSION) {
  const a = toAddress(windowId, addressVersion);
  return `/tower/z${a.zone}/f${a.floor}/u${a.unit}`;
}

/** Parse a pretty /tower/z../f../u.. path → WindowID, or null. */
export function fromPrettyPath(path) {
  if (typeof path !== 'string') return null;
  const m = /^\/tower\/z(\d+)\/f(\d+)\/u(\d+)$/.exec(path.trim());
  if (!m) return null;
  return toWindowId({ floor: +m[2], unit: +m[3] });
}
