import {
  buildSavedDeckRecord,
  createSavedDeckFolder,
  removeSavedDeckAssignment,
} from "./savedDeckFolders";

export function getLocalImportTrackingKey(game, currentUser) {
  const accountLabel = String(currentUser?.displayName || currentUser?.name || "account")
    .trim()
    .toLowerCase();
  return `tcgbuilder-local-import-considered:${game}:${accountLabel}`;
}

export function readConsideredLocalDeckIds(game, currentUser) {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(getLocalImportTrackingKey(game, currentUser)) || "[]",
    );
    return new Set(Array.isArray(parsed) ? parsed.filter(Boolean) : []);
  } catch {
    return new Set();
  }
}

export function rememberConsideredLocalDeckIds(game, currentUser, deckIds) {
  const considered = readConsideredLocalDeckIds(game, currentUser);
  deckIds.filter(Boolean).forEach((id) => considered.add(id));
  localStorage.setItem(
    getLocalImportTrackingKey(game, currentUser),
    JSON.stringify([...considered]),
  );
}

export function getUnconsideredLocalDecks(localDecks, game, currentUser) {
  const considered = readConsideredLocalDeckIds(game, currentUser);
  return (Array.isArray(localDecks) ? localDecks : []).filter(
    (deck) => deck?.id && !considered.has(deck.id),
  );
}

function makeUniqueDeckName(baseName, existingNames) {
  const base = String(baseName || "Imported Deck").trim() || "Imported Deck";
  if (!existingNames.has(base)) return base;

  let copyNumber = 1;
  while (true) {
    const suffix = copyNumber === 1 ? " (Copy)" : ` (Copy ${copyNumber})`;
    const candidate = `${base}${suffix}`;
    if (!existingNames.has(candidate)) return candidate;
    copyNumber += 1;
  }
}

function ensureImportedFolder({
  localFolderId,
  localFolderState,
  cloudFolderState,
  folderIdMap,
}) {
  if (!localFolderId) return null;
  if (folderIdMap.has(localFolderId)) return folderIdMap.get(localFolderId);

  const localFolder = (localFolderState?.folders || []).find(
    (folder) => folder.id === localFolderId,
  );
  if (!localFolder) {
    folderIdMap.set(localFolderId, null);
    return null;
  }

  const sameId = (cloudFolderState.folders || []).find(
    (folder) => folder.id === localFolder.id,
  );
  if (sameId && sameId.name === localFolder.name) {
    folderIdMap.set(localFolderId, sameId.id);
    return sameId.id;
  }

  const sameName = (cloudFolderState.folders || []).find(
    (folder) => folder.name === localFolder.name,
  );
  if (sameName) {
    folderIdMap.set(localFolderId, sameName.id);
    return sameName.id;
  }

  const importedFolder = sameId
    ? createSavedDeckFolder(localFolder.name)
    : { ...localFolder };

  cloudFolderState.folders.push(importedFolder);
  cloudFolderState.collapsed[importedFolder.id] = !!localFolderState?.collapsed?.[
    localFolder.id
  ];
  folderIdMap.set(localFolderId, importedFolder.id);
  return importedFolder.id;
}

export function mergeLocalDeckImports({
  cloudLibrary,
  localLibrary,
  decisions,
}) {
  const cloudDecks = [...(cloudLibrary?.decks || [])];
  const cloudFolderState = {
    schemaVersion: 1,
    folders: [...(cloudLibrary?.folderState?.folders || [])],
    collapsed: { ...(cloudLibrary?.folderState?.collapsed || {}) },
    assignments: { ...(cloudLibrary?.folderState?.assignments || {}) },
    unresolvedAssignments: {
      ...(cloudLibrary?.folderState?.unresolvedAssignments || {}),
    },
  };
  const localFolderState = localLibrary?.folderState || {};
  const existingNames = new Set(cloudDecks.map((deck) => deck.name));
  const folderIdMap = new Map();
  const imported = [];
  const consideredIds = [];

  for (const localDeck of localLibrary?.decks || []) {
    const decision = decisions.get(localDeck.id);
    if (!decision) continue;

    consideredIds.push(localDeck.id);
    if (decision === "skip") continue;

    const cloudIndex = cloudDecks.findIndex((deck) => deck.id === localDeck.id);
    let importedDeck;

    if (decision === "copy") {
      const uniqueName = makeUniqueDeckName(localDeck.name, existingNames);
      importedDeck = buildSavedDeckRecord(uniqueName, localDeck.deck);
      cloudDecks.push(importedDeck);
      existingNames.add(importedDeck.name);
    } else if (decision === "overwrite" && cloudIndex !== -1) {
      importedDeck = { ...localDeck };
      existingNames.delete(cloudDecks[cloudIndex]?.name);
      cloudDecks[cloudIndex] = importedDeck;
      existingNames.add(importedDeck.name);
    } else {
      importedDeck = { ...localDeck };
      cloudDecks.push(importedDeck);
      existingNames.add(importedDeck.name);
    }

    const localFolderId = localFolderState?.assignments?.[localDeck.id] || null;
    if (localFolderId) {
      const cloudFolderId = ensureImportedFolder({
        localFolderId,
        localFolderState,
        cloudFolderState,
        folderIdMap,
      });
      if (cloudFolderId) {
        cloudFolderState.assignments[importedDeck.id] = cloudFolderId;
      }
    } else {
      delete cloudFolderState.assignments[importedDeck.id];
    }

    imported.push({
      localId: localDeck.id,
      cloudId: importedDeck.id,
      localName: localDeck.name,
      cloudName: importedDeck.name,
      decision,
    });
  }

  return {
    library: { decks: cloudDecks, folderState: cloudFolderState },
    imported,
    consideredIds,
  };
}

export function removeImportedDecksFromLocalLibrary(localLibrary, localDeckIds) {
  const ids = new Set(localDeckIds);
  const decks = (localLibrary?.decks || []).filter((deck) => !ids.has(deck.id));
  let folderState = localLibrary?.folderState || {
    schemaVersion: 1,
    folders: [],
    collapsed: {},
    assignments: {},
    unresolvedAssignments: {},
  };

  ids.forEach((deckId) => {
    folderState = removeSavedDeckAssignment(folderState, deckId);
  });

  return { decks, folderState };
}
