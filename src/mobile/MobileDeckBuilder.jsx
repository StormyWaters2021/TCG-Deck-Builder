import React, { useEffect, useState } from "react";
import CardListPanel from "../panels/CardListPanel";
import DeckPanel from "../panels/DeckPanel";
import DeckControls from "../panels/DeckControls";
import MobileStickyPreview from "./MobileStickyPreview";
import MobileBottomNav from "./MobileBottomNav";
import useDeckBuilderActions from "../utils/useDeckBuilderActions";
import "./mobile.css";

export default function MobileDeckBuilder({
  game,
  cards,
  allCards,
  settings,
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
  // Prevent the body from scrolling while mobile layout is active
  useEffect(() => {
    document.body.classList.add("mobile-scroll-lock");
    return () => document.body.classList.remove("mobile-scroll-lock");
  }, []);

  const [activeView, setActiveView] = useState("cards");

  // Selected card is stored as an ID (like desktop)
  const [selectedCard, setSelectedCard] = useState(null);
  const selectedCardObj =
    cards?.find((c) => c.id === selectedCard) || null;

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

  return (
  <div className="mobile-shell">
    <MobileStickyPreview
      card={selectedCardObj}
      game={game}
    />

    <div
      className="mobile-content"
      role="region"
      aria-label="Mobile content"
    >
      {/* CARD LIST PANEL */}
      <section
        className={`mobile-view ${activeView === "cards" ? "active" : ""}`}
        hidden={activeView !== "cards"}
      >
        <CardListPanel
          cards={cards}
          settings={settings}
          onCardSelect={(cardId) => {
            setSelectedCard(cardId);
            setActiveView("cards");
          }}
          selectedCard={selectedCard}
          onAddCard={addCard}
          deck={deck}
        />
      </section>

      {/* DECK PANEL */}
      <section
        className={`mobile-view ${activeView === "deck" ? "active" : ""}`}
        hidden={activeView !== "deck"}
      >
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
          enableTouchDrag={true}
        />
      </section>

      {/* SAVE / LOAD / SHARE PANEL */}
      <section
        className={`mobile-view ${activeView === "controls" ? "active" : ""}`}
        hidden={activeView !== "controls"}
      >
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
      </section>
    </div>

    <MobileBottomNav
      active={activeView}
      onChange={setActiveView}
    />
  </div>
);

}

