import DeckRepository from "./DeckRepository";
import { parseSavedDeckRecord } from "../deckParser";
import { serializeSavedDeckRecord } from "../deckSerializer";
import { parseSavedDeckFolderRecord } from "../folders/folderParser";

const ACCOUNT_API = (
  import.meta.env.VITE_ACCOUNT_API || "http://localhost:8787"
).replace(/\/$/, "");

function emptyFolderState() {
  return {
    schemaVersion: 1,
    folders: [],
    collapsed: {},
    assignments: {},
    unresolvedAssignments: {},
  };
}

async function readJsonResponse(response) {
  const result = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(
      result?.error || `Cloud deck request failed (${response.status})`,
    );
    error.status = response.status;
    error.code = result?.error;
    throw error;
  }

  return result;
}

export default class CloudDeckRepository extends DeckRepository {
  #saveQueues = new Map();

  async loadLibrary(game) {
    const response = await fetch(
      `${ACCOUNT_API}/api/decks/library?game=${encodeURIComponent(game)}`,
      {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: { Accept: "application/json" },
      },
    );

    const result = await readJsonResponse(response);
    const rawLibrary = result?.library || {};
    const rawDecks = Array.isArray(rawLibrary.decks) ? rawLibrary.decks : [];
    const decks = rawDecks.map(parseSavedDeckRecord);
    const folderState = parseSavedDeckFolderRecord(
      rawLibrary.folderState || emptyFolderState(),
      decks,
    );

    return {
      decks,
      folderState,
      revision: Number.isInteger(result?.revision) ? result.revision : 0,
      updatedAt: result?.updatedAt || null,
    };
  }

  async saveLibrary(game, library) {
    const decks = (Array.isArray(library?.decks) ? library.decks : []).map(
      serializeSavedDeckRecord,
    );
    const folderState = parseSavedDeckFolderRecord(
      library?.folderState || emptyFolderState(),
      decks,
    );
    const snapshot = { decks, folderState };

    const previousSave = this.#saveQueues.get(game) || Promise.resolve();
    const nextSave = previousSave
      .catch(() => undefined)
      .then(async () => {
        const response = await fetch(
          `${ACCOUNT_API}/api/decks/library?game=${encodeURIComponent(game)}`,
          {
            method: "PUT",
            credentials: "include",
            cache: "no-store",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ library: snapshot }),
          },
        );

        const result = await readJsonResponse(response);

        return {
          ...snapshot,
          revision: Number.isInteger(result?.revision) ? result.revision : 0,
          updatedAt: result?.updatedAt || null,
        };
      });

    this.#saveQueues.set(game, nextSave);

    try {
      return await nextSave;
    } finally {
      if (this.#saveQueues.get(game) === nextSave) {
        this.#saveQueues.delete(game);
      }
    }
  }
}
