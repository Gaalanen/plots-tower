// Lumora Tower — immutable WindowID identity.
//
// A WindowID is the permanent, opaque integer identity of a claimable window.
// It is independent of visual geometry (geometryVersion) and of the public
// address (addressVersion). See LUMORA_ARCHITECTURE.md §1, §2, §15.
//
// Invariants: exactly 1,000,000 IDs, numbered 0..999,999; immutable after launch.

export const TOTAL_WINDOWS = 1_000_000;
export const MIN_WINDOW_ID = 0;
export const MAX_WINDOW_ID = TOTAL_WINDOWS - 1; // 999_999

/** True iff `id` is a valid WindowID (integer in [0, 999_999]). */
export function isValidWindowId(id) {
  return Number.isInteger(id) && id >= MIN_WINDOW_ID && id <= MAX_WINDOW_ID;
}

/** Throws TypeError for non-integers, RangeError for out-of-range. No-op if valid. */
export function assertWindowId(id) {
  if (!Number.isInteger(id)) {
    throw new TypeError(`WindowID must be an integer, received: ${stringify(id)}`);
  }
  if (id < MIN_WINDOW_ID || id > MAX_WINDOW_ID) {
    throw new RangeError(`WindowID out of range [${MIN_WINDOW_ID}..${MAX_WINDOW_ID}]: ${id}`);
  }
}

function stringify(v) {
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'number') return String(v);
  return Object.prototype.toString.call(v);
}
