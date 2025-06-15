import React, { useMemo, useState } from "react";

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

function DeckPanel({ cards, deck, settings, onRemoveCard, selectedCard, setSelectedCard }) {
  const [groupBy, setGroupBy] = useState(settings.groupOptions[0]);
  const grouped = useMemo(
    () => groupDeck(deck, cards, groupBy),
    [deck, cards, groupBy]
  );

  // Validation
  const totalCards = Object.values(deck).reduce((a, b) => a + b, 0);
  const errors = [];
  if (totalCards < settings.deckValidation.minCards)
    errors.push("Too few cards in deck!");
  if (totalCards > settings.deckValidation.maxCards)
    errors.push("Too many cards in deck!");
  for (const { property, value, max } of settings.deckValidation.propertyLimits) {
    const count = Object.entries(deck).reduce((sum, [id, qty]) => {
      const card = cards.find(c => c.id === id);
      return card?.[property] === value ? sum + qty : sum;
    }, 0);
    if (count > max)
      errors.push(`Too many cards of ${property}: ${value}`);
  }
  const banned = settings.deckValidation.banList.filter(id => deck[id]);
  if (banned.length)
    errors.push("Banned cards in deck: " + banned.join(", "));

  return (
    <aside className="deck-panel">
      <div>
        <label>Group by: </label>
        <select value={groupBy} onChange={e => setGroupBy(e.target.value)}>
          {settings.groupOptions.map(opt => (
            <option value={opt} key={opt}>{opt}</option>
          ))}
        </select>
      </div>
      {Object.entries(grouped).map(([group, cards]) => (
        <div key={group}>
          <strong>
            {group} ({cards.reduce((a, b) => a + b.qty, 0)})
          </strong>
          <ul>
            {cards.map(({ card, qty }) => (
              <li
                key={card.id}
                className={selectedCard === card.id ? "selected" : ""}
                onClick={() => setSelectedCard(card.id)}
              >
                {card.name} x{qty}
                {selectedCard === card.id && (
                  <>
                    <button onClick={e => {
                      e.stopPropagation();
                      onRemoveCard(card.id, 1);
                    }}>Remove 1</button>
                    <button onClick={e => {
                      e.stopPropagation();
                      onRemoveCard(card.id, qty);
                    }}>Remove All</button>
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
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