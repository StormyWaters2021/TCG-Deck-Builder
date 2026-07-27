import {
  CURRENT_FOLDER_SCHEMA_VERSION,
  LEGACY_FOLDER_SCHEMA_VERSION,
} from "./folderSchema";
import { migrateFolderSchema0To1 } from "./migrations/schema0To1";

function retryUnresolvedAssignments(record, savedDecks) {
  const unresolved = record?.unresolvedAssignments || {};
  if (!Object.keys(unresolved).length) return record;

  const assignments = { ...(record.assignments || {}) };
  const unresolvedAssignments = {};

  Object.entries(unresolved).forEach(([deckName, folderId]) => {
    const matches = savedDecks.filter((deck) => deck?.name === deckName);
    if (matches.length === 1 && matches[0]?.id) {
      assignments[matches[0].id] = folderId;
    } else {
      unresolvedAssignments[deckName] = folderId;
    }
  });

  return { ...record, assignments, unresolvedAssignments };
}

export function parseSavedDeckFolderRecord(record, savedDecks) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    record = {};
  }

  let current = record;
  let version = current.schemaVersion ?? LEGACY_FOLDER_SCHEMA_VERSION;

  if (!Number.isInteger(version) || version < 0) {
    throw new Error(`Invalid saved deck folder schema version: ${version}`);
  }

  if (version > CURRENT_FOLDER_SCHEMA_VERSION) {
    throw new Error(
      `Saved deck folder schema version ${version} is newer than supported version ${CURRENT_FOLDER_SCHEMA_VERSION}.`,
    );
  }

  while (version < CURRENT_FOLDER_SCHEMA_VERSION) {
    switch (version) {
      case 0:
        current = migrateFolderSchema0To1(current, savedDecks);
        version = 1;
        break;
      default:
        throw new Error(`Unsupported saved deck folder schema version: ${version}`);
    }
  }

  return retryUnresolvedAssignments(current, savedDecks);
}
