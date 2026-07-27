import DeckRepository from "./DeckRepository";
import { parseSavedDeckRecord } from "../deckParser";
import { serializeSavedDeckRecord } from "../deckSerializer";
import { parseSavedDeckFolderRecord } from "../folders/folderParser";
import { CURRENT_FOLDER_SCHEMA_VERSION } from "../folders/folderSchema";

const deckStorageKey = (game) => `${game}-decks`;
const folderStorageKey = (game) => `${game}-deck-folders`;

function safeParseArray(raw, fallback = []) {
  try {
    const parsed = JSON.parse(raw || "null");
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function safeParseObject(raw, fallback = {}) {
  try {
    const parsed = JSON.parse(raw || "null");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : fallback;
  } catch {
    return fallback;
  }
}

function normalizeFolderState(state) {
  const folders = Array.isArray(state?.folders)
    ? state.folders
        .filter((folder) => folder && typeof folder === "object")
        .map((folder, index) => ({
          id:
            typeof folder.id === "string" && folder.id.trim()
              ? folder.id
              : `folder-${index}`,
          name:
            typeof folder.name === "string" && folder.name.trim()
              ? folder.name.trim()
              : `Folder ${index + 1}`,
        }))
    : [];

  const validFolderIds = new Set(folders.map((folder) => folder.id));
  const collapsed = {};
  const assignments = {};
  const unresolvedAssignments = {};

  Object.entries(state?.collapsed || {}).forEach(([folderId, value]) => {
    if (validFolderIds.has(folderId)) collapsed[folderId] = !!value;
  });

  Object.entries(state?.assignments || {}).forEach(([deckId, folderId]) => {
    if (validFolderIds.has(folderId)) assignments[deckId] = folderId;
  });

  Object.entries(state?.unresolvedAssignments || {}).forEach(
    ([deckName, folderId]) => {
      if (validFolderIds.has(folderId)) {
        unresolvedAssignments[deckName] = folderId;
      }
    },
  );

  return {
    schemaVersion: CURRENT_FOLDER_SCHEMA_VERSION,
    folders,
    collapsed,
    assignments,
    unresolvedAssignments,
  };
}

export default class LocalDeckRepository extends DeckRepository {
  async loadLibrary(game) {
    const decks = this.#loadAndMigrateDecks(game);
    const folderState = this.#loadAndMigrateFolderState(game, decks);
    return { decks, folderState };
  }

  async saveLibrary(game, library) {
    const serializedDecks = (Array.isArray(library?.decks) ? library.decks : []).map(
      serializeSavedDeckRecord,
    );
    const normalizedFolderState = normalizeFolderState(library?.folderState);

    localStorage.setItem(deckStorageKey(game), JSON.stringify(serializedDecks));
    localStorage.setItem(
      folderStorageKey(game),
      JSON.stringify(normalizedFolderState),
    );

    return {
      decks: serializedDecks,
      folderState: normalizedFolderState,
    };
  }

  #saveDecksForMigration(game, decks) {
    const serializedDecks = (Array.isArray(decks) ? decks : []).map(
      serializeSavedDeckRecord,
    );
    localStorage.setItem(deckStorageKey(game), JSON.stringify(serializedDecks));
    return serializedDecks;
  }

  #saveFolderStateForMigration(game, state) {
    const normalized = normalizeFolderState(state);
    localStorage.setItem(folderStorageKey(game), JSON.stringify(normalized));
    return normalized;
  }

  #loadAndMigrateDecks(game) {
    const storedDecks = safeParseArray(
      localStorage.getItem(deckStorageKey(game)),
      [],
    );

    const parsedDecks = [];
    let migratedAnyDeck = false;
    let encounteredError = false;

    storedDecks.forEach((record, index) => {
      try {
        const parsedRecord = parseSavedDeckRecord(record);
        parsedDecks.push(parsedRecord);

        if (
          record?.schemaVersion !== parsedRecord.schemaVersion ||
          record?.id !== parsedRecord.id
        ) {
          migratedAnyDeck = true;
        }
      } catch (error) {
        encounteredError = true;
        console.error(
          `Could not load saved deck at index ${index} for game "${game}".`,
          error,
          record,
        );
      }
    });

    if (migratedAnyDeck && !encounteredError) {
      this.#saveDecksForMigration(game, parsedDecks);
    }

    return parsedDecks;
  }

  #loadAndMigrateFolderState(game, decks) {
    const raw = safeParseObject(
      localStorage.getItem(folderStorageKey(game)),
      {},
    );

    try {
      const parsed = parseSavedDeckFolderRecord(raw, decks);
      const normalized = normalizeFolderState(parsed);

      if (JSON.stringify(raw) !== JSON.stringify(normalized)) {
        this.#saveFolderStateForMigration(game, normalized);
      }

      return normalized;
    } catch (error) {
      console.error(
        `Could not load saved deck folders for game "${game}".`,
        error,
        raw,
      );
      return normalizeFolderState({});
    }
  }
}
