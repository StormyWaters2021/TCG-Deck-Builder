import { CURRENT_DECK_SCHEMA_VERSION } from "./deckSchema";
import { parseSavedDeckRecord } from "./deckParser";

/**
 * Produces the exact object written to local storage for the current schema.
 * Parsing first ensures that callers may safely pass either schema 0 or the
 * current schema without duplicating compatibility logic.
 */
export function serializeSavedDeckRecord(record) {
  const parsed = parseSavedDeckRecord(record);

  return {
    ...parsed,
    schemaVersion: CURRENT_DECK_SCHEMA_VERSION,
  };
}
