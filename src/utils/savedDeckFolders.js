import { serializeSavedDeckRecord } from "../decks/deckSerializer";

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
  if (position === "below") insertIndex += 1;
  folders.splice(insertIndex, 0, moved);
  return { ...state, folders };
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
    ...state,
    folders: [folder, ...(state?.folders || [])],
    collapsed: { ...(state?.collapsed || {}), [folder.id]: false },
    assignments: { ...(state?.assignments || {}) },
    unresolvedAssignments: { ...(state?.unresolvedAssignments || {}) },
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
  const folders = (state?.folders || []).filter(
    (folder) => folder.id !== folderId,
  );
  const collapsed = { ...(state?.collapsed || {}) };
  delete collapsed[folderId];

  const assignments = {};
  Object.entries(state?.assignments || {}).forEach(([deckId, assignedFolderId]) => {
    if (assignedFolderId !== folderId) assignments[deckId] = assignedFolderId;
  });

  const unresolvedAssignments = {};
  Object.entries(state?.unresolvedAssignments || {}).forEach(
    ([deckName, assignedFolderId]) => {
      if (assignedFolderId !== folderId) {
        unresolvedAssignments[deckName] = assignedFolderId;
      }
    },
  );

  return { ...state, folders, collapsed, assignments, unresolvedAssignments };
}

export function assignSavedDeckToFolder(state, deckId, folderId) {
  const assignments = { ...(state?.assignments || {}) };
  if (!folderId) delete assignments[deckId];
  else assignments[deckId] = folderId;
  return { ...(state || {}), assignments };
}

export function getSavedDeckIndexById(savedDecks, id) {
  return savedDecks.findIndex((deck) => deck.id === id);
}

export function getSavedDeckById(savedDecks, id) {
  const index = getSavedDeckIndexById(savedDecks, id);
  return index >= 0 ? savedDecks[index] : null;
}

export function getSavedDeckIndexByName(savedDecks, name) {
  return savedDecks.findIndex((deck) => deck.name === name);
}

export function getSavedDeckByName(savedDecks, name) {
  const index = getSavedDeckIndexByName(savedDecks, name);
  return index >= 0 ? savedDecks[index] : null;
}

export function buildSavedDeckRecord(name, deckValue, extras = {}) {
  const record = { name, deck: deckValue };
  if (extras.id) record.id = extras.id;
  if (extras.shareCode) record.shareCode = extras.shareCode;
  if (extras.editToken) record.editToken = extras.editToken;
  return serializeSavedDeckRecord(record);
}

export function removeSavedDeckAssignment(state, deckId) {
  const assignments = { ...(state?.assignments || {}) };
  delete assignments[deckId];
  return { ...(state || {}), assignments };
}

export function buildSavedDeckFolderView(savedDecks, folderState) {
  const folders = (folderState?.folders || []).map((folder) => ({
    ...folder,
    collapsed: !!folderState?.collapsed?.[folder.id],
    decks: savedDecks.filter(
      (deck) => folderState?.assignments?.[deck.id] === folder.id,
    ),
  }));

  const unfolderedDecks = savedDecks.filter(
    (deck) => !folderState?.assignments?.[deck.id],
  );

  return { folders, unfolderedDecks };
}
