import React from "react";

export async function finalizeSavedDeckFlow({
  nextDecks,
  savedName,
  shareCode,
  editToken,
  oldName = null,
  localOnlyMessage = "Deck saved.",
  persistSavedDecks,
  updateSavedDeckFolderState,
  renameSavedDeckAssignment,
  setActiveSavedDeckName,
  sessionShareInfo,
  setSessionShareInfo,
  updateSharedDeck,
  deck,
  game,
  openMessageModal,
}) {
  persistSavedDecks(nextDecks);

  if (oldName && oldName !== savedName) {
    updateSavedDeckFolderState((current) =>
      renameSavedDeckAssignment(current, oldName, savedName),
    );
  }

  setActiveSavedDeckName(savedName);

  if (sessionShareInfo?.shareCode && sessionShareInfo?.editToken) {
    setSessionShareInfo(null);
  }

  if (shareCode && editToken) {
    const result = await updateSharedDeck({
      code: shareCode,
      deck,
      game,
      name: savedName,
      editToken,
    });

    if (result.success) {
      openMessageModal("Save Complete", "Deck saved and shared deck updated.");
    } else {
      openMessageModal(
        "Partial Save",
        "Deck saved locally, but the shared deck could not be updated.\n\n" +
          (result.error || "Unknown error"),
      );
    }
    return;
  }

  openMessageModal("Save Complete", localOnlyMessage);
}

export function showLinkResultFlow({
  result,
  successMessage = "Shareable link copied to clipboard!",
  setLinkMessage,
}) {
  if (result.success) {
    setLinkMessage(successMessage);
    setTimeout(() => setLinkMessage(""), 2500);
  } else if (result.url) {
    setLinkMessage(
      <>
        <div>Couldn't copy to clipboard.</div>
        <div>
          <strong>Tap and hold or long-press to copy:</strong>
        </div>
        <input
          type="text"
          readOnly
          value={result.url}
          style={{
            width: "100%",
            fontSize: "0.85em",
            marginTop: "0.5em",
            padding: "0.25em",
            border: "1px solid #ccc",
            borderRadius: "4px",
          }}
          onFocus={(e) => e.target.select()}
        />
      </>,
    );
  } else {
    setLinkMessage("Error: " + result.error);
    setTimeout(() => setLinkMessage(""), 4000);
  }
}