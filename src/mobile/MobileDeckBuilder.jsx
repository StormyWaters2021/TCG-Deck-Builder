import React, { useEffect, useRef, useState } from "react";
import CardListPanel from "../panels/CardListPanel";
import DeckPanel from "../panels/DeckPanel";
import DeckControls from "../panels/DeckControls";
import CardPreview, { getMobilePreviewImageUrl } from "../components/CardPreview";
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
  const [previewCard, setPreviewCard] = useState(null);
  const [previewGroup, setPreviewGroup] = useState(null);
  const contentRef = useRef(null);
  const deckActionsRef = useRef(null);

  useEffect(() => {
    if (!previewCard || (activeView !== "cards" && activeView !== "deck")) return;
    const view = contentRef.current?.querySelector(".mobile-view.active");
    if (!view) return;
    const entries = Array.from(view.querySelectorAll("[data-mobile-card-id]"));
    const index = entries.findIndex(el => el.dataset.mobileCardId === previewCard &&
      (activeView !== "deck" || el.dataset.mobileGroup === previewGroup));
    if (index < 0) return;
    const images = [index - 1, index + 1]
      .filter(i => i >= 0 && i < entries.length)
      .map(i => cards?.find(card => String(card.id) === entries[i].dataset.mobileCardId))
      .filter(Boolean)
      .map(card => ({
        optimized: getMobilePreviewImageUrl(card, game, settings.useGridImageForPreview),
        original: getMobilePreviewImageUrl(card, game, settings.useGridImageForPreview, "front", false),
      }))
      .filter(({ optimized }) => Boolean(optimized))
      .map(({ optimized, original }) => {
        const img = new Image();
        img.onerror = () => { img.onerror = null; img.src = original; };
        img.src = optimized;
        return img;
      });
    return () => { images.forEach(img => { img.onerror = null; }); };
  }, [previewCard, previewGroup, activeView, cards, game, settings.useGridImageForPreview]);

  function selectPreviewCard(cardId, group = null) {
    const selectedGroup = activeView === "deck" ? group : null;
    setSelectedCard(cardId);
    setPreviewCard(current => current === cardId && previewGroup === selectedGroup ? null : cardId);
    setPreviewGroup(selectedGroup);
  }

  function movePreview(direction) {
    const view = contentRef.current?.querySelector('.mobile-view.active');
    if (!view) return;
    // Use the rendered rows, preserving the active search/filter and deck sorting.
    const entries = Array.from(view.querySelectorAll('[data-mobile-card-id]'));
    const currentIndex = entries.findIndex(el => el.dataset.mobileCardId === previewCard &&
      (activeView !== "deck" || el.dataset.mobileGroup === previewGroup));
    const nextIndex = currentIndex < 0
      ? (direction > 0 ? 0 : entries.length - 1)
      : Math.max(0, Math.min(entries.length - 1, currentIndex + direction));
    const next = entries[nextIndex];
    if (!next) return;
    const cardId = next.dataset.mobileCardId;
    setSelectedCard(cardId);
    setPreviewGroup(activeView === "deck" ? next.dataset.mobileGroup : null);
    setPreviewCard(cardId);
    next.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  function modifyPreviewCard(action) {
    if (!previewCard || !selectedCardObj) return;
    if (activeView === "cards") {
      addCard(previewCard, action === "many" ? settings.addNValue : 1);
      return;
    }
    if (activeView !== "deck") return;
    if (action === "remove") {
      deckActionsRef.current?.remove(previewCard, previewGroup ?? undefined);
    } else {
      deckActionsRef.current?.add(previewCard, previewGroup ?? undefined);
    }
  }

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
    <div
      className="mobile-content"
      ref={contentRef}
      role="region"
      aria-label="Mobile content"
    >
      {/* CARD LIST PANEL */}
      <section
        className={`mobile-view mobile-cards-view ${activeView === "cards" ? "active" : ""}`}
        hidden={activeView !== "cards"}
      >
        <CardListPanel
          cards={cards}
          settings={settings}
          onCardSelect={selectPreviewCard}
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
          setSelectedCard={selectPreviewCard}
          groupByProp={groupBy}
          setGroupByProp={setGroupBy}
          octgnSections={octgnSections}
          octgnDefaultSection={octgnDefaultSection}
          octgnOverridesProp={octgnOverrides}
          setOctgnOverridesProp={setOctgnOverrides}
          enableTouchDrag={true}
          mobileActionsRef={deckActionsRef}
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

    {(activeView === "cards" || activeView === "deck") && previewCard && selectedCardObj && (
      <div
        className="mobile-card-popup"
        role="dialog"
        aria-label={`${selectedCardObj.name} preview`}
        onClick={() => setPreviewCard(null)}
      >
        <div className="mobile-card-popup-content" onClick={e => e.stopPropagation()}>
          <CardPreview
            card={selectedCardObj}
            game={game}
            showName={false}
            mobileOptimized={true}
            disableFlipCardButton={settings.disableFlipCardButton}
            useGridImageForPreview={settings.useGridImageForPreview}
            onImageClick={() => setPreviewCard(null)}
          />
        </div>
        <div className="mobile-card-popup-nav" onClick={e => e.stopPropagation()}>
          {activeView === "cards" ? (
            <>
              <button type="button" className="main-button" onClick={() => modifyPreviewCard("add")}>+1</button>
              <button type="button" className="main-button" onClick={() => modifyPreviewCard("many")}>+{settings.addNValue}</button>
            </>
          ) : (
            <>
              <button type="button" className="main-button" onClick={() => modifyPreviewCard("add")}>+1</button>
              <button type="button" className="main-button" onClick={() => modifyPreviewCard("remove")}>−1</button>
            </>
          )}
          <button type="button" className="main-button mobile-preview-arrow mobile-preview-arrow-up" aria-label="Previous card" onClick={() => movePreview(-1)} />
          <button type="button" className="main-button mobile-preview-arrow mobile-preview-arrow-down" aria-label="Next card" onClick={() => movePreview(1)} />
        </div>
      </div>
    )}

    <MobileBottomNav
      active={activeView}
      onChange={view => { setPreviewCard(null); setActiveView(view); }}
    />
  </div>
);

}

