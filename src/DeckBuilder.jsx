import React, { useState } from "react";
import CardListPanel from "./panels/CardListPanel";
import DeckPanel from "./panels/DeckPanel";
import DeckControls from "./panels/DeckControls";

function DeckBuilder({
  game,
  settings,
  cards,
  deck,
  setDeck,
  setGame,
  groupBy,
  setGroupBy,
  octgnOverrides,
  setOctgnOverrides,
}) {
  const [selectedCard, setSelectedCard] = useState(null);

  const addCard = (cardId, qty, groupName) => {
    setDeck(prev => {
      const prevEntry = prev[cardId] || { count: 0, group: {}, tags: [] };
      const newCount = prevEntry.count + qty;
      const newGroup = { ...prevEntry.group };

      if (groupName) {
        newGroup[groupName] = (newGroup[groupName] || 0) + qty;
      }

      return {
        ...prev,
        [cardId]: {
          count: newCount,
          group: newGroup
        }
      };
    });
  };

  const removeCard = (cardId, qty, groupName) => {
    setDeck(prev => {
      const prevEntry = prev[cardId];
      if (!prevEntry) return prev;

      const newCount = Math.max(prevEntry.count - qty, 0);
      const newGroup = { ...prevEntry.group };

      if (groupName) {
        newGroup[groupName] = Math.max((newGroup[groupName] || 0) - qty, 0);
        if (newGroup[groupName] === 0) {
          delete newGroup[groupName];
        }
      }

      if (newCount === 0) {
        const { [cardId]: _, ...rest } = prev;
        return rest;
      }

      return {
        ...prev,
        [cardId]: {
          count: newCount,
          group: newGroup
        }
      };
    });
  };

  // Find the selected card object from cards array
  const selectedCardObj = cards.find(c => c.id === selectedCard);

  return (
    <div className="deck-builder-layout">
      <CardListPanel
        cards={cards}
        settings={settings}
        onCardSelect={setSelectedCard}
        selectedCard={selectedCard}
        onAddCard={addCard}
        deck={deck}
      />
      <DeckPanel
        cards={cards}
        deck={deck}
        settings={settings}
        onRemoveCard={removeCard}
        onAddCard={addCard}
        selectedCard={selectedCard}
        setSelectedCard={setSelectedCard}
        groupByProp={groupBy}
        setGroupByProp={setGroupBy}
        octgnOverridesProp={octgnOverrides}
        setOctgnOverridesProp={setOctgnOverrides}
      />
      <DeckControls
        deck={deck}
        cards={cards}
        settings={settings}
        game={game}
        setDeck={setDeck}
        selectedCard={selectedCard}
        setGame={setGame}
        groupBy={groupBy}
        setGroupBy={setGroupBy}
        octgnOverrides={octgnOverrides}
        setOctgnOverrides={setOctgnOverrides}
      />
    </div>
  );
}

export default DeckBuilder;
