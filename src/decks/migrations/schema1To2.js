import { DECK_ID_SCHEMA_VERSION } from "../deckSchema";

function generateDeckId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  const randomPart = Math.random().toString(36).slice(2);
  const secondRandomPart = Math.random().toString(36).slice(2);
  return `deck-${Date.now().toString(36)}-${randomPart}-${secondRandomPart}`;
}

/**
 * Adds a permanent ID to a schema version 1 saved deck.
 *
 * Existing fields are preserved exactly. The generated ID is persisted by
 * loadSavedDecks after a successful migration, so it remains stable across
 * future loads and deck renames.
 */
export function migrateSchema1To2(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    throw new TypeError("Saved deck record must be an object.");
  }

  return {
    ...record,
    id:
      typeof record.id === "string" && record.id.trim()
        ? record.id.trim()
        : generateDeckId(),
    schemaVersion: DECK_ID_SCHEMA_VERSION,
  };
}
