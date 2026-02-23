import React, {
  useMemo,
  useState,
  forwardRef,
  useImperativeHandle,
} from "react";

const DECK_SUBMIT_API =
  (import.meta.env.VITE_DECK_SUBMIT_API || "http://localhost:8787").replace(
    /\/+$/,
    "",
  );

// -----------------------------
// helpers
// -----------------------------
function getCardFieldCI(card, names) {
  if (!card || typeof card !== "object") return undefined;
  const entries = Object.entries(card);
  for (const target of names) {
    const found = entries.find(
      ([k]) => k.toLowerCase() === String(target).toLowerCase(),
    );
    if (found) return found[1];
  }
  return undefined;
}

function inferLevel(card) {
  const raw = getCardFieldCI(card, [
    "Card Level",
    "card level",
    "CardLevel",
    "cardlevel",
    "level",
    "Level",
    "personalityLevel",
    "lvl",
  ]);

  const s = String(raw ?? "").trim();
  return /^[1-5]$/.test(s) ? s : "";
}

function inferSlotType(card, groupName) {
  const g = String(groupName || "").toLowerCase();
  if (!g.includes("starting")) return "";

  const type = String(getCardFieldCI(card, ["type"]) ?? "").toLowerCase();
  const name = String(card?.name ?? "").toLowerCase();
  const level = inferLevel(card);

  if (type.includes("mastery") || name.includes("mastery")) return "mastery";
  if (type.includes("sensei") || name.includes("sensei")) return "sensei";
  if (level) return `level${level}`;

  return "";
}

/**
 * Build flattened rows for submission.
 * IMPORTANT: This emits the backend-friendly card fields:
 *   - id
 *   - name
 *   - Type
 *   - Card Level
 *   - Style
 *   - Designer
 * and also includes group / qty data.
 */
export function buildFlattenedDeckRows(deckObj, cardsArr) {
  const cardsById = new Map((cardsArr || []).map((c) => [String(c.id), c]));
  const rows = [];

  for (const [guidRaw, entry] of Object.entries(deckObj || {})) {
    const guid = String(guidRaw);
    const totalCount = Number(entry?.count || 0);
    if (!Number.isFinite(totalCount) || totalCount <= 0) continue;

    const groupMap =
      entry?.group &&
      typeof entry.group === "object" &&
      !Array.isArray(entry.group)
        ? entry.group
        : {};

    const card = cardsById.get(guid);

    // Pull card metadata (worker expects these keys)
    const cardName = String(card?.name || guid).trim();
    const cardType = String(getCardFieldCI(card, ["Type", "type"]) ?? "").trim();
    const cardLevel = String(
      getCardFieldCI(card, [
        "Card Level",
        "card level",
        "CardLevel",
        "cardlevel",
        "Level",
        "level",
        "personalityLevel",
        "lvl",
      ]) ?? "",
    ).trim();
    const cardDesigner = String(
      getCardFieldCI(card, ["Designer", "designer"]) ?? "",
    ).trim();
    const cardStyle = String(getCardFieldCI(card, ["Style", "style"]) ?? "").trim();

    const groupEntries = Object.entries(groupMap).filter(
      ([, qty]) => Number(qty) > 0,
    );

    // fallback if no group map
    if (!groupEntries.length) {
      rows.push({
        id: guid,
        name: cardName,
        Type: cardType,
        "Card Level": cardLevel,
        Style: cardStyle,
        Designer: cardDesigner,

        qty: totalCount,
        groupName: "Life Deck",
        cardGroup: "Life Deck", // explicit backend-friendly group field
        slotType: inferSlotType(card, "Life Deck"),
        level: inferLevel(card),
      });
      continue;
    }

    // split across groups if needed
    for (const [groupName, qtyRaw] of groupEntries) {
      const qty = Number(qtyRaw || 0);
      if (!qty) continue;

      rows.push({
        id: guid,
        name: cardName,
        Type: cardType,
        "Card Level": cardLevel,
        Style: cardStyle,
        Designer: cardDesigner,

        qty,
        groupName,
        cardGroup: groupName,
        slotType: inferSlotType(card, groupName),
        level: inferLevel(card),
      });
    }
  }

  return rows;
}

function submitCredsKey(gameName, eventCode, username) {
  return `deckSubmitCreds:${String(gameName || "").trim()}:${String(
    eventCode || "",
  )
    .trim()
    .toUpperCase()}:${String(username || "").trim()}`;
}

// -----------------------------
// component
// -----------------------------
const DeckSubmissionFlow = forwardRef(function DeckSubmissionFlow(
  {
    deck,
    cards,
    game,
    deckName,
    buttonClass,
    deckNameInputClass,
    onBeforeOpen, // optional: e.g. () => setExportMenuOpen(false)
    hideTriggerButton = false,
  },
  ref,
) {
  const [submitModalOpen, setSubmitModalOpen] = useState(false);
  const [submitBusy, setSubmitBusy] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitNeedsEditCode, setSubmitNeedsEditCode] = useState(false);

  const [submitSuccessModal, setSubmitSuccessModal] = useState(null);
  // { mode, version, editCode, shareUrl, warning }

  const [submitForm, setSubmitForm] = useState(() => ({
    username: localStorage.getItem("deckSubmit:lastUsername") || "",
    eventCode: (
      localStorage.getItem("deckSubmit:lastEventCode") || ""
    ).toUpperCase(),
    format: "",
    editCode: "",
  }));

  const deckHasCards = useMemo(
    () => !!deck && Object.keys(deck).length > 0,
    [deck],
  );

  function openSubmitModal() {
    if (typeof onBeforeOpen === "function") onBeforeOpen();

    if (!deckHasCards) {
      alert("Deck is empty.");
      return;
    }

    setSubmitError("");
    setSubmitNeedsEditCode(false);
    setSubmitForm((prev) => ({
      username:
        prev.username || localStorage.getItem("deckSubmit:lastUsername") || "",
      eventCode: (
        prev.eventCode || localStorage.getItem("deckSubmit:lastEventCode") || ""
      ).toUpperCase(),
      format: prev.format || "",
      editCode: "",
    }));
    setSubmitModalOpen(true);
  }

  useImperativeHandle(ref, () => ({
    open: openSubmitModal,
  }));

  function closeSubmitModal() {
    if (submitBusy) return;
    setSubmitModalOpen(false);
    setSubmitError("");
    setSubmitNeedsEditCode(false);
    setSubmitForm((prev) => ({ ...prev, editCode: "" }));
  }

  function updateSubmitForm(field, value) {
    setSubmitForm((prev) => ({
      ...prev,
      [field]: field === "eventCode" ? String(value).toUpperCase() : value,
    }));
  }

  async function submitDeckModalConfirm() {
    if (submitBusy) return;

    const username = String(submitForm.username || "").trim();
    const eventCode = String(submitForm.eventCode || "").trim().toUpperCase();
    const formatValue = String(submitForm.format || "").trim();
    const editCode = String(submitForm.editCode || "").trim();

    if (!username) {
      setSubmitError("Please enter a username.");
      return;
    }
    if (!eventCode) {
      setSubmitError("Please enter an event code.");
      return;
    }

    const flatRows = buildFlattenedDeckRows(deck, cards);
    if (!flatRows.length) {
      setSubmitError("Could not build submission payload from deck.");
      return;
    }

    const payload = {
      eventCode,
      username,
      deckName: (deckName || "Untitled Deck").trim(),
      game,
      format: formatValue,
      deck: flatRows,
      deckObj: deck,
    };

    // auto-use saved edit code for same game/user/event
    const credsKey = submitCredsKey(game, eventCode, username);
    const savedCredsRaw = localStorage.getItem(credsKey);
    if (savedCredsRaw && !editCode) {
      try {
        const saved = JSON.parse(savedCredsRaw);
        if (saved?.editCode) payload.editCode = saved.editCode;
      } catch {
        // ignore malformed local storage
      }
    }

    // manual edit code overrides stored code
    if (editCode) {
      payload.editCode = editCode;
    }

    async function postSubmit(payloadToSend) {
      const resp = await fetch(`${DECK_SUBMIT_API}/api/deck/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadToSend),
      });

      const data = await resp.json().catch(() => ({}));
      return { resp, data };
    }

    setSubmitBusy(true);
    setSubmitError("");

    try {
      const { resp, data } = await postSubmit(payload);

	if (!resp.ok) {
	  // Case 1: Existing submission found, no edit code provided
	  if (data?.requiresEditCode) {
		setSubmitNeedsEditCode(true);
		setSubmitError(
		  "Submission found for that username. Enter your Edit Code to update. If this is not you, close this and use a different username.",
		);
		setSubmitBusy(false);
		return;
	  }

	  // Case 2: Invalid edit code (including stale localStorage code)
	  const invalidEditCode =
		resp.status === 403 ||
		String(data?.error || "").toLowerCase().includes("invalid edit code");

	  if (invalidEditCode) {
		// Optional: clear stale stored credentials so we stop auto-sending a bad code
		try {
		  localStorage.removeItem(credsKey);
		} catch {
		  // ignore
		}

		setSubmitNeedsEditCode(true);
		setSubmitForm((prev) => ({ ...prev, editCode: "" }));
		setSubmitError(
		  "That edit code is invalid or outdated. Please enter your current 6-digit Edit Code to update this deck.",
		);
		setSubmitBusy(false);
		return;
	  }

	  throw new Error(data?.details || data?.error || `HTTP ${resp.status}`);
	}

	if (!data?.ok) {
	  throw new Error(data?.details || data?.error || "Unknown submit error");
	}

      // persist convenience values
      localStorage.setItem("deckSubmit:lastUsername", username);
      localStorage.setItem("deckSubmit:lastEventCode", eventCode);

      const editCodeToStore = data.editCode || payload.editCode || "";
      if (data.submissionId && editCodeToStore) {
        localStorage.setItem(
          credsKey,
          JSON.stringify({
            submissionId: data.submissionId,
            editCode: editCodeToStore,
            username,
            eventCode,
            game,
            updatedAt: new Date().toISOString(),
          }),
        );
      }

      setSubmitModalOpen(false);
      setSubmitNeedsEditCode(false);
      setSubmitForm((prev) => ({ ...prev, editCode: "" }));

      setSubmitSuccessModal({
        mode: data.mode,
        version: data.version,
        editCode: data.editCode || "",
        shareUrl: data.shareUrl || "",
        warning: data.warning || "",
      });
    } catch (err) {
      setSubmitError(`Deck submission failed: ${err.message || err}`);
    } finally {
      setSubmitBusy(false);
    }
  }

  return (
    <>
      {/* Optional trigger button (can be hidden when controlled by parent) */}
      {!hideTriggerButton && (
        <button className={buttonClass} onClick={openSubmitModal}>
          Submit Deck
        </button>
      )}

      {/* Submit modal */}
      {submitModalOpen && (
        <div className="modal-backdrop">
          <div className="modal" style={{ width: "min(92vw, 420px)" }}>
            <h3 style={{ marginTop: 0 }}>Submit Deck</h3>

            <div style={{ display: "grid", gap: "0.6em" }}>
              <label style={{ display: "grid", gap: "0.25em" }}>
                <span>Username</span>
                <input
                  type="text"
                  value={submitForm.username}
                  onChange={(e) => updateSubmitForm("username", e.target.value)}
                  disabled={submitBusy}
                  className={deckNameInputClass}
                  style={{ width: "100%" }}
                />
              </label>

              <label style={{ display: "grid", gap: "0.25em" }}>
                <span>Event Code</span>
                <input
                  type="text"
                  value={submitForm.eventCode}
                  onChange={(e) => updateSubmitForm("eventCode", e.target.value)}
                  disabled={submitBusy}
                  className={deckNameInputClass}
                  style={{ width: "100%" }}
                  placeholder="T123"
                />
              </label>

              <label style={{ display: "grid", gap: "0.25em" }}>
                <span>Format (optional)</span>
                <input
                  type="text"
                  value={submitForm.format}
                  onChange={(e) => updateSubmitForm("format", e.target.value)}
                  disabled={submitBusy}
                  className={deckNameInputClass}
                  style={{ width: "100%" }}
                />
              </label>

              {submitNeedsEditCode && (
                <label style={{ display: "grid", gap: "0.25em" }}>
                  <span>Edit Code</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={submitForm.editCode}
                    onChange={(e) =>
                      updateSubmitForm(
                        "editCode",
                        String(e.target.value).replace(/\D/g, "").slice(0, 6),
                      )
                    }
                    disabled={submitBusy}
                    className={deckNameInputClass}
                    style={{ width: "100%" }}
                    placeholder="6-digit code"
                  />
                </label>
              )}

              {submitError ? (
                <div
                  style={{
                    color: "#ffb3b3",
                    background: "rgba(120,0,0,0.25)",
                    border: "1px solid rgba(255,120,120,0.35)",
                    borderRadius: 6,
                    padding: "0.5em",
                    fontSize: "0.92em",
                  }}
                >
                  {submitError}
                </div>
              ) : null}

              <div
                style={{ display: "flex", gap: "0.5em", marginTop: "0.25em" }}
              >
                <button
                  className={buttonClass}
                  onClick={submitDeckModalConfirm}
                  disabled={submitBusy}
                  style={{ flex: 1 }}
                >
                  {submitBusy
                    ? "Submitting..."
                    : submitNeedsEditCode
                      ? "Update Deck"
                      : "Submit Deck"}
                </button>

                <button
                  className={buttonClass}
                  onClick={closeSubmitModal}
                  disabled={submitBusy}
                  style={{ flex: 1 }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Success modal */}
      {submitSuccessModal && (
        <div className="modal-backdrop">
          <div className="modal" style={{ width: "min(92vw, 520px)" }}>
            <h3 style={{ marginTop: 0 }}>
              {submitSuccessModal.mode === "updated"
                ? "Deck Updated"
                : "Deck Successfully Submitted"}
            </h3>

            <div style={{ display: "grid", gap: "0.65em" }}>
              <div>
                {submitSuccessModal.mode === "updated" ? (
                  <>
                    Your deck was updated successfully for this event.
                    <br />
                    <strong>Version:</strong> {submitSuccessModal.version}
                  </>
                ) : (
                  <>
                    Deck successfully submitted.
                    <br />
                    Please remember your username and the following edit code.
                    You will need this code if you want to change your submitted
                    deck for this event.
                  </>
                )}
              </div>

              {submitSuccessModal.editCode ? (
                <div
                  style={{
                    border: "1px solid rgba(255,255,255,0.2)",
                    borderRadius: 8,
                    padding: "0.75em",
                    background: "rgba(255,255,255,0.04)",
                  }}
                >
                  <div
                    style={{
                      fontSize: "0.9em",
                      opacity: 0.9,
                      marginBottom: "0.25em",
                    }}
                  >
                    Edit Code
                  </div>
                  <div
                    style={{
                      fontSize: "1.35em",
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                      fontFamily: "monospace",
                    }}
                  >
                    {submitSuccessModal.editCode}
                  </div>
                </div>
              ) : null}

              {/* Only show version line here for new submissions; updated already shows it above */}
              {submitSuccessModal.mode !== "updated" ? (
                <div style={{ fontSize: "0.92em", opacity: 0.9 }}>
                  <strong>Version:</strong> {submitSuccessModal.version}
                </div>
              ) : null}

              {submitSuccessModal.shareUrl ? (
                <div>
                  <a
                    href={submitSuccessModal.shareUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open Share Link
                  </a>
                </div>
              ) : null}

              {submitSuccessModal.warning ? (
                <div style={{ color: "#f0b35a" }}>
                  {submitSuccessModal.warning}
                </div>
              ) : null}

              <div
                style={{ display: "flex", gap: "0.5em", marginTop: "0.25em" }}
              >
                {submitSuccessModal.editCode ? (
                  <button
                    className={buttonClass}
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(
                          String(submitSuccessModal.editCode),
                        );
                        alert("Edit code copied.");
                      } catch {
                        alert(
                          `Copy failed. Your edit code is: ${submitSuccessModal.editCode}`,
                        );
                      }
                    }}
                    style={{ flex: 1 }}
                  >
                    Copy Edit Code
                  </button>
                ) : null}

                <button
                  className={buttonClass}
                  onClick={() => setSubmitSuccessModal(null)}
                  style={{ flex: 1 }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
});

export default DeckSubmissionFlow;