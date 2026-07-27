import { CURRENT_FOLDER_SCHEMA_VERSION } from "../folderSchema";

function getUniqueDeckByName(savedDecks, name) {
  const matches = savedDecks.filter((deck) => deck?.name === name);
  return matches.length === 1 ? matches[0] : null;
}

/**
 * Converts legacy name-keyed folder assignments to permanent deck-ID keys.
 * Assignments that cannot be resolved unambiguously are preserved separately
 * instead of being discarded.
 */
export function migrateFolderSchema0To1(record, savedDecks) {
  const rawAssignments = record?.assignments || {};
  const assignments = {};
  const unresolvedAssignments = {};

  Object.entries(rawAssignments).forEach(([legacyDeckName, folderId]) => {
    const deck = getUniqueDeckByName(savedDecks, legacyDeckName);
    if (deck?.id) {
      assignments[deck.id] = folderId;
    } else {
      unresolvedAssignments[legacyDeckName] = folderId;
      console.warn(
        `Could not migrate folder assignment for saved deck name "${legacyDeckName}" because it did not match exactly one saved deck.`,
      );
    }
  });

  return {
    ...record,
    schemaVersion: CURRENT_FOLDER_SCHEMA_VERSION,
    assignments,
    unresolvedAssignments,
  };
}
