// Lumora Tower — logical coordinates.
//
// Logical coordinates are an ABSTRACT, launch-fixed decomposition of the WindowID
// space, used by the data layer (tiling, availability queries, pricing zones).
// They are deliberately DECOUPLED from the building's visual geometry: the
// 1000×1000 here is a data enumeration, NOT the facade. See LUMORA_ARCHITECTURE.md §2.2.
//
// Invariant: WindowID ⇄ logical is a deterministic bijection, fixed at launch.

import { TOTAL_WINDOWS, assertWindowId } from './window-id.mjs';

export const LOGICAL_COLS = 1000; // launch-fixed data grid width  (NOT a physical facade width)
export const LOGICAL_ROWS = 1000; // launch-fixed data grid height (NOT a physical floor count)

// Fixed tiling used by future region/availability queries (slippy-map style).
export const TILE_SIZE = 50;
export const TILE_COLS = LOGICAL_COLS / TILE_SIZE; // 20
export const TILE_ROWS = LOGICAL_ROWS / TILE_SIZE; // 20
export const TILE_COUNT = TILE_COLS * TILE_ROWS;   // 400

// Derived logical height-bands (for future pricing/LOD aggregates). Not part of identity.
export const LOGICAL_ZONES = 10;
const ZONE_ROWS = LOGICAL_ROWS / LOGICAL_ZONES; // 100

/** WindowID → { row, col }. */
export function toLogical(windowId) {
  assertWindowId(windowId);
  return { row: Math.floor(windowId / LOGICAL_COLS), col: windowId % LOGICAL_COLS };
}

/** True iff `coord` is a valid logical coordinate. */
export function isValidLogical(coord) {
  return !!coord
    && Number.isInteger(coord.row) && Number.isInteger(coord.col)
    && coord.row >= 0 && coord.row < LOGICAL_ROWS
    && coord.col >= 0 && coord.col < LOGICAL_COLS;
}

/** Throws RangeError if `coord` is not a valid logical coordinate. */
export function assertLogical(coord) {
  if (!isValidLogical(coord)) {
    throw new RangeError(`Invalid logical coordinate: ${JSON.stringify(coord)}`);
  }
}

/** { row, col } → WindowID (inverse of toLogical). */
export function fromLogical(coord) {
  assertLogical(coord);
  return coord.row * LOGICAL_COLS + coord.col;
}

/** WindowID → { tileRow, tileCol, tileId }. */
export function tileOf(windowId) {
  const { row, col } = toLogical(windowId);
  const tileRow = Math.floor(row / TILE_SIZE);
  const tileCol = Math.floor(col / TILE_SIZE);
  return { tileRow, tileCol, tileId: tileRow * TILE_COLS + tileCol };
}

/** Yields every WindowID contained in the given tile (TILE_SIZE × TILE_SIZE of them). */
export function* windowIdsInTile(tileId) {
  if (!Number.isInteger(tileId) || tileId < 0 || tileId >= TILE_COUNT) {
    throw new RangeError(`Invalid tileId [0..${TILE_COUNT - 1}]: ${tileId}`);
  }
  const tileRow = Math.floor(tileId / TILE_COLS);
  const tileCol = tileId % TILE_COLS;
  const r0 = tileRow * TILE_SIZE;
  const c0 = tileCol * TILE_SIZE;
  for (let r = r0; r < r0 + TILE_SIZE; r++) {
    for (let c = c0; c < c0 + TILE_SIZE; c++) {
      yield r * LOGICAL_COLS + c;
    }
  }
}

/** WindowID → derived logical height-band index (0..LOGICAL_ZONES-1). */
export function zoneOf(windowId) {
  const { row } = toLogical(windowId);
  return Math.floor(row / ZONE_ROWS);
}

// Guard: the logical grid must enumerate exactly the WindowID space.
if (LOGICAL_ROWS * LOGICAL_COLS !== TOTAL_WINDOWS) {
  throw new Error('logical grid does not match TOTAL_WINDOWS');
}
