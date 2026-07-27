import {
  CURRENT_DECK_SCHEMA_VERSION,
  DECK_ID_SCHEMA_VERSION,
  INITIAL_DECK_SCHEMA_VERSION,
  LEGACY_DECK_SCHEMA_VERSION,
} from "./deckSchema";
import { migrateSchema0To1 } from "./migrations/schema0To1";
import { migrateSchema1To2 } from "./migrations/schema1To2";

function getSchemaVersion(record) {
  return record?.schemaVersion ?? LEGACY_DECK_SCHEMA_VERSION;
}

function validateCurrentSavedDeck(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    throw new TypeError("Saved deck record must be an object.");
  }

  if (record.schemaVersion !== CURRENT_DECK_SCHEMA_VERSION) {
    throw new Error(
      `Expected deck schema version ${CURRENT_DECK_SCHEMA_VERSION}, received ${record.schemaVersion}.`,
    );
  }

  if (typeof record.id !== "string" || !record.id.trim()) {
    throw new TypeError("Saved deck record is missing a valid ID.");
  }

  if (typeof record.name !== "string") {
    throw new TypeError("Saved deck record is missing a valid name.");
  }

  if (!record.deck || typeof record.deck !== "object" || Array.isArray(record.deck)) {
    throw new TypeError("Saved deck record is missing a valid deck payload.");
  }

  return record;
}

/**
 * Parses any supported saved-deck record and walks it forward through each
 * schema migration until it reaches the current schema version.
 *
 * This function does not write to storage or mutate the supplied object.
 */
export function parseSavedDeckRecord(rawRecord) {
  let record = rawRecord;
  let version = getSchemaVersion(record);

  if (!Number.isInteger(version) || version < 0) {
    throw new Error(`Invalid deck schema version: ${String(version)}`);
  }

  if (version > CURRENT_DECK_SCHEMA_VERSION) {
    throw new Error(
      `Deck schema version ${version} is newer than this site supports (${CURRENT_DECK_SCHEMA_VERSION}).`,
    );
  }

  while (version < CURRENT_DECK_SCHEMA_VERSION) {
    switch (version) {
      case LEGACY_DECK_SCHEMA_VERSION:
        record = migrateSchema0To1(record);
        version = INITIAL_DECK_SCHEMA_VERSION;
        break;

      case INITIAL_DECK_SCHEMA_VERSION:
        record = migrateSchema1To2(record);
        version = DECK_ID_SCHEMA_VERSION;
        break;

      default:
        throw new Error(`No migration exists for deck schema version ${version}.`);
    }
  }

  return validateCurrentSavedDeck(record);
}
