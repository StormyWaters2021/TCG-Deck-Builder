import React, {
  forwardRef,
  useImperativeHandle,
  useMemo,
  useState,
} from "react";
import AppModal from "./AppModal";
import { exportDeckPDF } from "../utils/deckPrintPDF";

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
    onBeforeOpen,
    onGeneratingChange,
  },
  ref,
) {
  const [open, setOpen] = useState(false);
  const [selections, setSelections] = useState({});

  const cardMap = useMemo(() => {
    return new Map(
      (cards || [])
        .filter((card) => card?.id)
        .map((card) => [card.id, card]),
    );
  }, [cards]);

  const rows = useMemo(() => {
    return Object.entries(deck || {})
      .map(([cardId, entry]) => {
        const card = cardMap.get(cardId);

        if (!card) return null;

        return {
          cardId,
          card,
          deckQuantity: Number(entry?.count) || 0,
        };
      })
      .filter(Boolean)
      .sort((a, b) =>
        getCardDisplayName(a.card).localeCompare(
          getCardDisplayName(b.card),
        ),
      );
  }, [deck, cardMap]);

  function buildInitialSelections() {
    const next = {};

    for (const { cardId, deckQuantity } of rows) {
      next[cardId] = {
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

    for (const { cardId, deckQuantity } of rows) {
      next[cardId] = {
        checked: true,
        quantity: deckQuantity,
      };
    }

    setSelections(next);
  }

  function setNone() {
    setSelections((current) => {
      const next = {};

      for (const { cardId } of rows) {
        next[cardId] = {
          checked: false,
          quantity: current[cardId]?.quantity ?? 0,
        };
      }

      return next;
    });
  }

  function setChecked(cardId, checked) {
    setSelections((current) => ({
      ...current,
      [cardId]: {
        checked,
        quantity: current[cardId]?.quantity ?? 0,
      },
    }));
  }

  function setQuantity(cardId, rawValue) {
    const parsed = Number.parseInt(rawValue, 10);
    const quantity = Number.isFinite(parsed)
      ? Math.max(0, parsed)
      : 0;

    setSelections((current) => ({
      ...current,
      [cardId]: {
        checked: quantity > 0,
        quantity,
      },
    }));
  }

  async function handleExport() {
    const temporaryDeck = {};

    for (const [cardId, selection] of Object.entries(selections)) {
      if (!selection?.checked) continue;

      const quantity = Math.max(
        0,
        Number.parseInt(selection.quantity, 10) || 0,
      );

      if (quantity === 0) continue;

      const originalEntry = deck[cardId];

      if (!originalEntry) continue;

      temporaryDeck[cardId] = {
        ...originalEntry,
        count: quantity,
      };
    }

    if (Object.keys(temporaryDeck).length === 0) {
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
        {rows.map(({ cardId, card, deckQuantity }) => {
          const selection = selections[cardId] || {
            checked: false,
            quantity: deckQuantity,
          };

          return (
            <div
              key={cardId}
              style={{
                display: "grid",
                gridTemplateColumns: "auto minmax(0, 1fr) 90px",
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
                  setChecked(cardId, event.target.checked)
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
                  setQuantity(cardId, event.target.value)
                }
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                }}
                aria-label={`Proxy quantity for ${getCardDisplayName(card)}`}
              />
            </div>
          );
        })}
      </div>
    </AppModal>
  );
});

export default ProxyPdfExportFlow;