import React, {
  forwardRef,
  useImperativeHandle,
  useMemo,
  useState,
} from "react";
import AppModal from "./AppModal";
import { exportDeckPDF } from "../utils/deckPrintPDF";
import { getGroupedExportSections } from "../utils/deckExportHelpers";

function getCardDisplayName(card) {
  if (!card) return "Unknown card";

  const subtitle = card.Subtitle || card.subtitle;

  return subtitle && String(subtitle).trim()
    ? `${card.name} - ${subtitle}`
    : card.name;
}

const ProxyPdfExportFlow = forwardRef(function ProxyPdfExportFlow(
  {
    deck,
    cards,
    settings,
    deckName,
    game,
    octgnSections,
    octgnDefaultSection,
    panelIgnoreSections,
    onBeforeOpen,
    onGeneratingChange,
  },
  ref,
) {
  const [open, setOpen] = useState(false);
  const [selections, setSelections] = useState({});

  const groupedRows = useMemo(() => {
    return getGroupedExportSections(
      deck,
      cards,
      settings,
      {
        octgnSections,
        octgnDefaultSection,
        panelIgnoreSections,
      },
    ).map((group) => ({
      name: group.name,
      rows: group.entries.map((entry) => ({
        rowId: `${group.name}\u0000${entry.cardId}`,
        groupName: group.name,
        cardId: entry.cardId,
        card: entry.card,
        deckQuantity: entry.qty,
      })),
    }));
  }, [
    deck,
    cards,
    settings,
    octgnSections,
    octgnDefaultSection,
    panelIgnoreSections,
  ]);

  const rows = useMemo(
    () => groupedRows.flatMap((group) => group.rows),
    [groupedRows],
  );

  function buildInitialSelections() {
    const next = {};

    for (const { rowId, deckQuantity } of rows) {
      next[rowId] = {
        checked: deckQuantity > 0,
        quantity: deckQuantity,
      };
    }

    return next;
  }

  function openModal() {
    onBeforeOpen?.();
    setSelections(buildInitialSelections());
    setOpen(true);
  }

  function closeModal() {
    setOpen(false);
  }

  useImperativeHandle(ref, () => ({
    open: openModal,
    close: closeModal,
  }));

  function setAll() {
    const next = {};

    for (const { rowId, deckQuantity } of rows) {
      next[rowId] = {
        checked: true,
        quantity: deckQuantity,
      };
    }

    setSelections(next);
  }

  function setNone() {
    setSelections((current) => {
      const next = {};

      for (const { rowId } of rows) {
        next[rowId] = {
          checked: false,
          quantity: current[rowId]?.quantity ?? 0,
        };
      }

      return next;
    });
  }

  function setChecked(rowId, checked) {
    setSelections((current) => ({
      ...current,
      [rowId]: {
        checked,
        quantity: current[rowId]?.quantity ?? 0,
      },
    }));
  }

  function setQuantity(rowId, rawValue) {
    const parsed = Number.parseInt(rawValue, 10);
    const quantity = Number.isFinite(parsed)
      ? Math.max(0, parsed)
      : 0;

    setSelections((current) => ({
      ...current,
      [rowId]: {
        checked: quantity > 0,
        quantity,
      },
    }));
  }

  async function handleExport() {
    const temporaryDeck = {};
    const orderedEntries = [];

    for (const row of rows) {
      const selection = selections[row.rowId];

      if (!selection?.checked) continue;

      const quantity = Math.max(
        0,
        Number.parseInt(selection.quantity, 10) || 0,
      );

      if (quantity === 0) continue;

      const originalEntry = deck[row.cardId];

      if (!originalEntry) continue;

      if (!temporaryDeck[row.cardId]) {
        temporaryDeck[row.cardId] = {
          ...originalEntry,
          count: 0,
          group: {},
        };
      }

      temporaryDeck[row.cardId].count += quantity;
      temporaryDeck[row.cardId].group[row.groupName] = quantity;

      orderedEntries.push({
        cardId: row.cardId,
        groupName: row.groupName,
        quantity,
      });
    }

    if (orderedEntries.length === 0) {
      window.alert("Select at least one card before exporting.");
      return;
    }

    setOpen(false);
    onGeneratingChange?.(true);

    try {
      await exportDeckPDF(
        temporaryDeck,
        cards,
        settings,
        deckName,
        game,
        orderedEntries,
      );
    } finally {
      onGeneratingChange?.(false);
    }
  }

  return (
    <AppModal
      open={open}
      title="Proxy PDF Cards"
      message="Choose which card images to include and adjust their proxy quantities. These changes will not modify the deck."
      onClose={closeModal}
      modalClassName="proxy-pdf-modal"
      actions={[
        {
          label: "Cancel",
          onClick: closeModal,
        },
        {
          label: "Export PDF",
          primary: true,
          onClick: handleExport,
        },
      ]}
    >
      <div
        style={{
          display: "flex",
          gap: "0.5rem",
          marginBottom: "0.75rem",
        }}
      >
        <button
          type="button"
          className="main-button"
          onClick={setAll}
        >
          All
        </button>

        <button
          type="button"
          className="main-button"
          onClick={setNone}
        >
          None
        </button>
      </div>

      <div
        style={{
          maxHeight: "55vh",
          overflowY: "auto",
          border: "1px solid var(--main-button-border)",
          borderRadius: "4px",
        }}
      >
        {groupedRows.map((group) => (
          <React.Fragment key={group.name}>
            <div
              style={{
                padding: "0.65rem",
                fontWeight: "bold",
                background:
                  "var(--panel-header-background, rgba(0,0,0,0.08))",
                borderBottom:
                  "1px solid var(--main-button-border)",
              }}
            >
              {group.name}
            </div>

            {group.rows.map(
              ({ rowId, card, deckQuantity }) => {
                const selection = selections[rowId] || {
                  checked: false,
                  quantity: deckQuantity,
                };

                return (
                  <div
                    key={rowId}
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "auto minmax(0, 1fr) 90px",
                      alignItems: "center",
                      gap: "0.75rem",
                      padding: "0.6rem",
                      borderBottom:
                        "1px solid var(--main-button-border)",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selection.checked}
                      onChange={(event) =>
                        setChecked(rowId, event.target.checked)
                      }
                      aria-label={`Include ${getCardDisplayName(card)}`}
                    />

                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: "bold",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                        title={getCardDisplayName(card)}
                      >
                        {getCardDisplayName(card)}
                      </div>

                      <div
                        style={{
                          fontSize: "0.8em",
                          opacity: 0.75,
                        }}
                      >
                        Deck quantity: {deckQuantity}
                      </div>
                    </div>

                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={selection.quantity}
                      onChange={(event) =>
                        setQuantity(rowId, event.target.value)
                      }
                      style={{
                        width: "100%",
                        boxSizing: "border-box",
                      }}
                      aria-label={`Proxy quantity for ${getCardDisplayName(card)}`}
                    />
                  </div>
                );
              },
            )}
          </React.Fragment>
        ))}
      </div>
    </AppModal>
  );
});

export default ProxyPdfExportFlow;