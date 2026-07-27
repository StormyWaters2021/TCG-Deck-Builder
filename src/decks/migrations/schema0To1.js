import { INITIAL_DECK_SCHEMA_VERSION } from "../deckSchema";

/**
 * Converts the pre-versioning saved-deck record into schema version 1.
 *
 * Schema 0 records have no schemaVersion property and use this shape:
 * {
 *   name,
 *   deck,
 *   shareCode?,
 *   editToken?
 * }
 *
 * This migration is deliberately non-destructive. It preserves the existing
 * deck payload and sharing metadata exactly as stored.
 */
export function migrateSchema0To1(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    throw new TypeError("Saved deck record must be an object.");
  }

  return {
    ...record,
    schemaVersion: INITIAL_DECK_SCHEMA_VERSION,
  };
}
