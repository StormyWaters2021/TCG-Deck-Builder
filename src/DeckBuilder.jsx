import React, { useState } from "react";
import CardListPanel from "./panels/CardListPanel";
import DeckPanel from "./panels/DeckPanel";
import DeckControls from "./panels/DeckControls";
import useDeckBuilderActions from "./utils/useDeckBuilderActions";

function DeckBuilder({
  game,
  settings,
  cards,
  allCards,
  deck,
  setDeck,
  setGame,
  groupBy,
  setGroupBy,
  octgnOverrides,
  setOctgnOverrides,
  currentUser,
  accountLoading,
}) {
  const [selectedCard, setSelectedCard] = useState(null);

  const {
    octgnSections,
    octgnDefaultSection,
    setDeckFromLoad,
    addCard,
    removeCard,
    moveCard,
  } = useDeckBuilderActions({
    cards,
    allCards,
    deck,
    setDeck,
    settings,
  });

  // Pass moveCard, addCard, removeCard to DeckPanel for drag/drop support
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
        moveCard={moveCard}
        selectedCard={selectedCard}
        setSelectedCard={setSelectedCard}
        groupByProp={groupBy}
        setGroupByProp={setGroupBy}
        octgnSections={octgnSections}
        octgnDefaultSection={octgnDefaultSection}
        octgnOverridesProp={octgnOverrides}
        setOctgnOverridesProp={setOctgnOverrides}
      />
      <DeckControls
        deck={deck}
        cards={cards}
		allCards={allCards}
        settings={settings}
        game={game}
        setDeck={setDeckFromLoad}
        selectedCard={selectedCard}
        setGame={setGame}
        groupBy={groupBy}
        setGroupBy={setGroupBy}
        octgnOverrides={octgnOverrides}
        setOctgnOverrides={setOctgnOverrides}
        currentUser={currentUser}
        accountLoading={accountLoading}
      />
    </div>
  );
}

export default DeckBuilder;
