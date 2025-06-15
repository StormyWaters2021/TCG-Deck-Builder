import React, { useState } from "react";
import CardListPanel from "./panels/CardListPanel";
import DeckPanel from "./panels/DeckPanel";
import DeckControls from "./panels/DeckControls";

function DeckBuilder({ game, settings, cards }) {
  const [deck, setDeck] = useState({});
  const [selectedCard, setSelectedCard] = useState(null);

  const addCard = (cardId, qty) => {
    setDeck(prev => ({
      ...prev,
      [cardId]: (prev[cardId] || 0) + qty
    }));
  };
  const removeCard = (cardId, qty) => {
    setDeck(prev => {
      const newDeck = { ...prev };
      newDeck[cardId] = Math.max(0, (newDeck[cardId] || 0) - qty);
      if (newDeck[cardId] === 0) delete newDeck[cardId];
      return newDeck;
    });
  };

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
        selectedCard={selectedCard}
        setSelectedCard={setSelectedCard}
      />
      <DeckControls
        deck={deck}
        cards={cards}
        settings={settings}
        game={game}
        setDeck={setDeck}
      />
    </div>
  );
}

export default DeckBuilder;