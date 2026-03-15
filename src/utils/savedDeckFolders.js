const deckStorageKey = (game) => `${game}-decks`;
const folderStorageKey = (game) => `${game}-deck-folders`;

export function generateEditToken() {
  if (window.crypto?.randomUUID) {
    return `${window.crypto.randomUUID()}-${window.crypto.randomUUID()}`;
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

export function reorderSavedDeckFolders(
  state,
  draggedFolderId,
  targetFolderId,
  position = "above",
) {
  const folders = [...(state?.folders || [])];

  const fromIndex = folders.findIndex((folder) => folder.id === draggedFolderId);
  const targetIndex = folders.findIndex((folder) => folder.id === targetFolderId);

  if (
    fromIndex === -1 ||
    targetIndex === -1 ||
    !draggedFolderId ||
    draggedFolderId === targetFolderId
  ) {
    return state;
  }

  const [moved] = folders.splice(fromIndex, 1);

  let insertIndex = folders.findIndex((folder) => folder.id === targetFolderId);
  if (insertIndex === -1) return state;

  if (position === "below") {
    insertIndex += 1;
  }

  folders.splice(insertIndex, 0, moved);
  return { ...state, folders };
}

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

  const rawCollapsed = state?.collapsed || {};
  Object.keys(rawCollapsed).forEach((folderId) => {
    if (validFolderIds.has(folderId)) {
      collapsed[folderId] = !!rawCollapsed[folderId];
    }
  });

  const rawAssignments = state?.assignments || {};
  Object.keys(rawAssignments).forEach((deckName) => {
    const folderId = rawAssignments[deckName];
    if (validFolderIds.has(folderId)) {
      assignments[deckName] = folderId;
    }
  });

  return { folders, collapsed, assignments };
}

export function loadSavedDecks(game) {
  return safeParseArray(localStorage.getItem(deckStorageKey(game)), []);
}

export function saveSavedDecks(game, decks) {
  localStorage.setItem(deckStorageKey(game), JSON.stringify(decks));
}

export function loadSavedDeckFolderState(game) {
  const raw = safeParseObject(localStorage.getItem(folderStorageKey(game)), {});
  return normalizeFolderState(raw);
}

export function saveSavedDeckFolderState(game, state) {
  localStorage.setItem(
    folderStorageKey(game),
    JSON.stringify(normalizeFolderState(state)),
  );
}

export function createSavedDeckFolder(name) {
  const trimmed = String(name || "").trim();
  if (!trimmed) return null;
  return {
    id: `folder-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name: trimmed,
  };
}

export function addSavedDeckFolder(state, folder) {
  if (!folder) return state;
  return {
    folders: [folder, ...(state?.folders || [])],
    collapsed: { ...(state?.collapsed || {}), [folder.id]: false },
    assignments: { ...(state?.assignments || {}) },
  };
}

export function toggleSavedDeckFolder(state, folderId) {
  return {
    ...(state || {}),
    collapsed: {
      ...(state?.collapsed || {}),
      [folderId]: !(state?.collapsed || {})[folderId],
    },
  };
}

export function deleteSavedDeckFolder(state, folderId) {
  const folders = (state?.folders || []).filter((folder) => folder.id !== folderId);
  const collapsed = { ...(state?.collapsed || {}) };
  delete collapsed[folderId];

  const assignments = {};
  Object.entries(state?.assignments || {}).forEach(([deckName, assignedFolderId]) => {
    if (assignedFolderId !== folderId) assignments[deckName] = assignedFolderId;
  });

  return { folders, collapsed, assignments };
}

export function assignSavedDeckToFolder(state, deckName, folderId) {
  const assignments = { ...(state?.assignments || {}) };
  if (!folderId) {
    delete assignments[deckName];
  } else {
    assignments[deckName] = folderId;
  }
  return { ...(state || {}), assignments };
}

export function getSavedDeckIndexByName(savedDecks, name) {
  return savedDecks.findIndex((d) => d.name === name);
}

export function getSavedDeckByName(savedDecks, name) {
  const idx = getSavedDeckIndexByName(savedDecks, name);
  return idx >= 0 ? savedDecks[idx] : null;
}

export function buildSavedDeckRecord(name, deckValue, extras = {}) {
  const record = {
    name,
    deck: deckValue,
  };
  if (extras.shareCode) record.shareCode = extras.shareCode;
  if (extras.editToken) record.editToken = extras.editToken;
  return record;
}

export function removeSavedDeckAssignment(state, deckName) {
  const assignments = { ...(state?.assignments || {}) };
  delete assignments[deckName];
  return { ...(state || {}), assignments };
}

export function renameSavedDeckAssignment(state, oldDeckName, newDeckName) {
  if (!oldDeckName || !newDeckName || oldDeckName === newDeckName) return state;
  const assignments = { ...(state?.assignments || {}) };
  if (assignments[oldDeckName]) {
    assignments[newDeckName] = assignments[oldDeckName];
    delete assignments[oldDeckName];
  }
  return { ...(state || {}), assignments };
}

export function buildSavedDeckFolderView(savedDecks, folderState) {
  const folders = (folderState?.folders || []).map((folder) => ({
    ...folder,
    collapsed: !!folderState?.collapsed?.[folder.id],
    decks: savedDecks.filter((deck) => folderState?.assignments?.[deck.name] === folder.id),
  }));

  const unfolderedDecks = savedDecks.filter(
    (deck) => !folderState?.assignments?.[deck.name],
  );

  return { folders, unfolderedDecks };
}