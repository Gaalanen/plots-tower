// Lumora Tower — coords module public entry point.
//
// Isolated foundation for the immutable WindowID / logical coordinate /
// architectural mapping / public address / legacy mapping layers.
// Nothing in production imports this yet (P1 is additive and inert).
// See LUMORA_ARCHITECTURE.md §2, §8, §15.

export * from './window-id.mjs';
export * from './logical.mjs';
export * from './geometry.mjs';
export * from './address.mjs';
export * from './legacy.mjs';
