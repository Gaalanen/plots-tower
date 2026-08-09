// Lumora Tower — legacy `${r}-${c}` (600) ⇄ reserved WindowID mapping.
//
// This module DEFINES how the current 600-window prototype IDs would map into the
// new WindowID space. It is a PURE mapping only:
//   • it performs NO migration,
//   • it reads/writes NO Redis, Stripe, or production data,
//   • nothing in production imports it,
//   • the current live system keeps using `${r}-${c}` and `plots:*` unchanged.
// See LUMORA_ARCHITECTURE.md §8.

import { isValidWindowId } from './window-id.mjs';

export const LEGACY_COLS = 20; // current live grid: 20 units per floor
export const LEGACY_ROWS = 30; // 30 floors
export const LEGACY_TOTAL = LEGACY_COLS * LEGACY_ROWS; // 600

// ┌───────────────────────────────────────────────────────────────────────────┐
// │ PRE-LAUNCH PLACEHOLDER — MUST BE RATIFIED BEFORE PRODUCTION MIGRATION.       │
// │                                                                             │
// │ FOUNDERS_BASE is the reserved WindowID offset for the legacy 600 windows.    │
// │ `0` is a TEMPORARY pre-launch value for tests only. It is NOT persisted      │
// │ anywhere, NOT exposed through any production API, and NO production window    │
// │ is migrated. Changing it before migration affects ONLY this module's legacy  │
// │ mapping — it must not (and does not) touch any other WindowID logic.         │
// └───────────────────────────────────────────────────────────────────────────┘
export const FOUNDERS_BASE = 0;

const LEGACY_RE = /^(\d{1,2})-(\d{1,2})$/;

/** True iff `str` is a valid legacy id "r-c" with r∈0..29, c∈0..19. */
export function isValidLegacyId(str) {
  if (typeof str !== 'string') return false;
  const m = LEGACY_RE.exec(str);
  if (!m) return false;
  const r = Number(m[1]);
  const c = Number(m[2]);
  return r >= 0 && r < LEGACY_ROWS && c >= 0 && c < LEGACY_COLS;
}

/** "r-c" → { r, c }. Throws TypeError on malformed input. */
export function parseLegacyId(str) {
  if (!isValidLegacyId(str)) {
    throw new TypeError(
      `Invalid legacy id (expected "r-c", r∈0..${LEGACY_ROWS - 1}, c∈0..${LEGACY_COLS - 1}): ${JSON.stringify(str)}`,
    );
  }
  const m = LEGACY_RE.exec(str);
  return { r: Number(m[1]), c: Number(m[2]) };
}

/** Legacy "r-c" → reserved WindowID (FOUNDERS_BASE + r*LEGACY_COLS + c). */
export function legacyToWindowId(str) {
  const { r, c } = parseLegacyId(str);
  return FOUNDERS_BASE + r * LEGACY_COLS + c;
}

/** True iff `windowId` falls inside the reserved founders band. */
export function isFoundersWindowId(windowId) {
  return isValidWindowId(windowId)
    && windowId >= FOUNDERS_BASE
    && windowId < FOUNDERS_BASE + LEGACY_TOTAL;
}

/** Reserved WindowID → legacy "r-c", or null if outside the founders band. */
export function windowIdToLegacy(windowId) {
  if (!isFoundersWindowId(windowId)) return null;
  const offset = windowId - FOUNDERS_BASE;
  const r = Math.floor(offset / LEGACY_COLS);
  const c = offset % LEGACY_COLS;
  return `${r}-${c}`;
}

// Read-only mirrors of the current production address math (reference only;
// production keeps computing these itself). floor = 30 - r, unit = c + 1.
export function legacyFloorOf(r) { return LEGACY_ROWS - r; }
export function legacyUnitOf(c) { return c + 1; }
