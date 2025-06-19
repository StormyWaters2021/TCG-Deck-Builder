import React, { useMemo, useState } from "react";
import CardPreview from "../components/CardPreview";

// --- Group deck helper ---
function groupDeck(deck, cards, groupBy) {
  const grouped = {};
  Object.entries(deck).forEach(([cardId, qty]) => {
    const card = cards.find(c => c.id === cardId);
    const group = card?.[groupBy] || "Other";
    if (!grouped[group]) grouped[group] = [];
    grouped[group].push({ card, qty });
  });
  return grouped;
}

// Helper: Find all alternate printings (by name) for a card
function getAlternatePrintings(card, allCards) {
  if (!card) return [];
  return allCards.filter(c => c.name === card.name && c.id !== card.id);
}

function DeckPanel({
  cards,
  deck,
  settings,
  onRemoveCard,
  onAddCard,
  selectedCard,
  setSelectedCard
}) {
  const [groupBy, setGroupBy] = useState(settings.groupOptions[0]);
  const [displayMode, setDisplayMode] = useState("list");
  const grouped = useMemo(
    () => groupDeck(deck, cards, groupBy),
    [deck, cards, groupBy]
  );

  // Fallback order if not present in settings
  const FALLBACK_GROUP_ORDER = ["Creatures", "Spells", "Lands", "Other"];
  // Use settings.groupOrder if defined, otherwise fallback
  const groupOrder =
    settings.groupOrder && Array.isArray(settings.groupOrder)
      ? settings.groupOrder
      : FALLBACK_GROUP_ORDER;

  function getSortedGroupNames(groupedObj) {
    const groupNames = Object.keys(groupedObj);
    const inOrder = groupOrder.filter(name => groupNames.includes(name));
    const remaining = groupNames.filter(name => !groupOrder.includes(name)).sort();
    return [...inOrder, ...remaining];
  }

  const totalCards = Object.values(deck).reduce((a, b) => a + b, 0);
  const errors = [];

  if (totalCards < settings.deckValidation.minCards)
    errors.push("Too few cards in deck!");
  if (totalCards > settings.deckValidation.maxCards)
    errors.push("Too many cards in deck!");

  for (const [cardId, qty] of Object.entries(deck)) {
    if (qty > settings.maxCopiesPerCard) {
      const card = cards.find(c => c.id === cardId);
      errors.push(
        `Too many copies of ${card ? card.name : cardId} (max ${settings.maxCopiesPerCard})`
      );
    }
  }

  if (settings.deckValidation.usePerCardLimit) {
    for (const [cardId, qty] of Object.entries(deck)) {
      const card = cards.find(c => c.id === cardId);
      if (card && typeof card.Limit === "number" && qty > card.Limit) {
        errors.push(
          `Too many copies of ${card.name}: limit is ${card.Limit}`
        );
      }
    }
  }

  for (const rule of settings.deckValidation.propertyLimits || []) {
    if (!rule || !rule.property) continue;
    const { property, value } = rule;
    const count = Object.entries(deck).reduce((sum, [id, qty]) => {
      const card = cards.find(c => c.id === id);
      return card && card[property] === value ? sum + qty : sum;
    }, 0);
    if (typeof rule.max === "number" && count > rule.max)
      errors.push(`Too many cards of ${property}: ${value}`);
    if (typeof rule.min === "number" && count < rule.min)
      errors.push(`Too few cards of ${property}: ${value}`);
  }
  const banned = settings.deckValidation.banList.filter(id => deck[id]);
  if (banned.length)
    errors.push("Banned cards in deck: " + banned.join(", "));

  // Swap logic for alternate printings
  function handleSwap(card, qty) {
    const alternates = cards.filter(c => c.name === card.name);
    const idx = alternates.findIndex(c => c.id === card.id);
    const next = alternates[(idx + 1) % alternates.length];
    onRemoveCard(card.id, qty);
    onAddCard(next.id, qty);
    setSelectedCard(next.id);
  }

  return (
    <aside className="deck-panel">
      <div style={{ display: "flex", alignItems: "center", gap: "1em" }}>
        <div>
          <label>Group by: </label>
          <select value={groupBy} onChange={e => setGroupBy(e.target.value)}>
            {settings.groupOptions.map(opt => (
              <option value={opt} key={opt}>{opt}</option>
            ))}
          </select>
        </div>
        <div>
          <label>Display: </label>
          <select value={displayMode} onChange={e => setDisplayMode(e.target.value)}>
            <option value="list">List</option>
            <option value="grid">Grid</option>
          </select>
        </div>
      </div>

      {displayMode === "list" ? (
        getSortedGroupNames(grouped).map(group => (
          <div key={group}>
            <strong>
              {group} ({grouped[group].reduce((a, b) => a + b.qty, 0)})
            </strong>
            <ul>
              {grouped[group].map(({ card, qty }) => {
                const altCount = getAlternatePrintings(card, cards).length;
                return (
                  <li
                    key={card.id}
                    className={selectedCard === card.id ? "selected" : ""}
                    onClick={() => setSelectedCard(card.id)}
                    style={{ position: "relative" }}
                  >
                    {card.name} x{qty}
                    {altCount > 0 && (
                      <button
                        title="Swap to other printing"
                        style={{
                          position: "absolute",
                          right: 2,
                          top: 2,
                          background: "rgba(255,255,255,0.85)",
                          border: "1px solid #aaa",
                          borderRadius: "50%",
                          fontSize: "1em",
                          padding: "0 4px",
                          cursor: "pointer",
                          zIndex: 5,
                        }}
                        onClick={e => {
                          e.stopPropagation();
                          handleSwap(card, qty);
                        }}
                      >⇆</button>
                    )}
                    {selectedCard === card.id && (
                      <>
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            onRemoveCard(card.id, 1);
                          }}
                        >
                          -1
                        </button>
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            onAddCard(card.id, 1);
                          }}
                        >
                          +1
                        </button>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))
      ) : (
        getSortedGroupNames(grouped).map(group => (
          <div key={group} style={{ marginBottom: "0.25em" }}>
            <strong>
              {group} ({grouped[group].reduce((a, b) => a + b.qty, 0)})
            </strong>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(86px, 1fr))",
                gap: "2px",
                marginTop: "0.1em"
              }}
            >
              {grouped[group].map(({ card, qty }) => {
                const altCount = getAlternatePrintings(card, cards).length;
                return (
                  <div
                    key={card.id}
                    style={{
                      background: "#fff",
                      minWidth: 0,
                      padding: 0,
                      margin: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center"
                    }}
                  >
                    <div style={{ position: "relative", width: "86px", height: "120px" }}>
                      <CardPreview
                        card={card}
                        game={settings.gameName}
                        showName={false}
                        quantity={qty}
                        showButtons={true}
                        onAdd={e => {
                          e.stopPropagation();
                          onAddCard(card.id, 1);
                        }}
                        onRemove={e => {
                          e.stopPropagation();
                          onRemoveCard(card.id, 1);
                        }}
                        style={{
                          width: "86px",
                          height: "auto",
                          display: "block",
                          margin: 0,
                          maxWidth: "100%",
                          minWidth: "86px",
                          padding: 0
                        }}
                      />
                      {altCount > 0 && (
                        <button
                          title="Swap to other printing"
                          style={{
                            position: "absolute",
                            top: 2,
                            left: 2,
                            background: "rgba(255,255,255,0.85)",
                            border: "1px solid #aaa",
                            borderRadius: "50%",
                            fontSize: "1em",
                            padding: "0 4px",
                            cursor: "pointer",
                            zIndex: 5,
                          }}
                          onClick={e => {
                            e.stopPropagation();
                            handleSwap(card, qty);
                          }}
                        >⇆</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}

      <div>
        <strong>Total cards: {totalCards}</strong>
      </div>
      {errors.length > 0 && (
        <div className="deck-errors">
          {errors.map(e => <div key={e}>{e}</div>)}
        </div>
      )}
    </aside>
  );
}

export default DeckPanel;