import React, { useState, useEffect, useMemo } from "react";
import CardListPanel from "./panels/CardListPanel";
import DeckPanel from "./panels/DeckPanel";
import DeckControls from "./panels/DeckControls";
import { createDeckLoadNormalizer } from "./utils/deckLoadRepair";

// Helper to get the correct OCTGN section for a card
function getSectionForCard(card, octgnSections, defaultSection) {
  if (!card) return defaultSection || "Main";
  for (const section of octgnSections || []) {
    if (!section.criteria) continue;
    if (
      Object.entries(section.criteria).some(([prop, values]) =>
        Array.isArray(values) && values.includes(card[prop])
      )
    ) {
      return section.name;
    }
  }
  return defaultSection || "Main";
}

function useOctgnSections(gameName, enabled) {
  const [sections, setSections] = useState(null);
  const [defaultSection, setDefaultSection] = useState(null);

  useEffect(() => {
    if (!enabled) {
      setSections(null);
      setDefaultSection(null);
      return;
    }
    let cancelled = false;
    async function fetchSections() {
      let baseUrl = import.meta.env.BASE_URL || "";
      if (baseUrl.endsWith("/")) baseUrl = baseUrl.slice(0, -1);
      const resp = await fetch(`${baseUrl}/games/${gameName}/octgn.json`);
      const json = await resp.json();
      if (!cancelled) {
        setSections(json.sections || []);
        setDefaultSection(json.defaultSection || "Main");
      }
    }
    fetchSections();
    return () => { cancelled = true; };
  }, [gameName, enabled]);

  return [sections, defaultSection];
}

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
}) {
  const [selectedCard, setSelectedCard] = useState(null);

 const [octgnSections, octgnDefaultSection] = useOctgnSections(
   settings?.gameName,
   true
 );


const normalizeLoadedDeck = useMemo(
  () =>
    createDeckLoadNormalizer({
      cards: allCards && allCards.length ? allCards : cards,
      fallbackGroup: settings?.fallbackGroup,
      octgnSections,
      octgnDefaultSection,
      getSectionForCard,
    }),
  [allCards, cards, settings?.fallbackGroup, octgnSections, octgnDefaultSection]
);

// Catch any deck loads that bypass DeckControls and hit app state directly
// (for example: raw URL deck parsing / shared deck link loads).
useEffect(() => {
  if (!deck || typeof deck !== "object" || Object.keys(deck).length === 0) return;
  if (!cards || cards.length === 0) return;

  const repairedDeck = normalizeLoadedDeck(deck);
  if (repairedDeck !== deck) {
    setDeck(repairedDeck);
  }
}, [deck, cards, normalizeLoadedDeck, setDeck]);

// Wrap setDeck so any external "load" flows get normalized automatically.
const setDeckFromLoad = (nextDeckOrUpdater) => {
  // Preserve functional updates used during normal in-app editing.
  if (typeof nextDeckOrUpdater === "function") {
    setDeck(nextDeckOrUpdater);
    return;
  }
  setDeck(normalizeLoadedDeck(nextDeckOrUpdater));
};

const addCard = (cardId, qty = 1, groupName) => {
  setDeck(prev => {
    const prevEntry = prev[cardId] || { count: 0, group: {}, tags: [] };
    const newGroup = { ...prevEntry.group };
    let actualGroup = groupName;

    // 1. Use provided groupName if present
    if (!actualGroup) {
      // 2. Use OCTGN group by criteria if available
      if (octgnSections && Array.isArray(octgnSections)) {
        const card = cards.find(c => c.id === cardId);
        actualGroup = getSectionForCard(card, octgnSections, octgnDefaultSection);
      }

      // 3. Use OCTGN defaultSection if group not set yet
      if (!actualGroup && octgnDefaultSection) {
        actualGroup = octgnDefaultSection;
      }

      // 4. Use settings fallbackGroup if above fail
      if (!actualGroup && settings?.fallbackGroup) {
        actualGroup = settings.fallbackGroup;
      }
    }

    // 5. If STILL not set, warn and use 'Other'
    if (!actualGroup) {
      console.warn("Card added with no group! Please set fallbackGroup in settings.json.", { cardId });
      actualGroup = "Other";
    }

    newGroup[actualGroup] = (newGroup[actualGroup] || 0) + qty;

    const newCount = Object.values(newGroup).reduce((a, b) => a + b, 0);
    return {
      ...prev,
      [cardId]: {
        ...prevEntry,
        count: newCount,
        group: newGroup,
      },
    };
  });
};



const removeCard = (cardId, qty = 1, groupName) => {
  setDeck(prev => {
    const prevEntry = prev[cardId];
    if (!prevEntry) return prev;
    const newGroup = { ...prevEntry.group };
    if (groupName) {
      newGroup[groupName] = Math.max((newGroup[groupName] || 0) - qty, 0);
      if (newGroup[groupName] === 0) delete newGroup[groupName];
    } else {
      // Remove from all groups if none specified
      for (const key in newGroup) {
        newGroup[key] = Math.max((newGroup[key] || 0) - qty, 0);
        if (newGroup[key] === 0) delete newGroup[key];
      }
    }
    // Recompute total count
    const newCount = Object.values(newGroup).reduce((a, b) => a + b, 0);
    if (newCount === 0) {
      const { [cardId]: _, ...rest } = prev;
      return rest;
    }
    return {
      ...prev,
      [cardId]: {
        ...prevEntry,
        count: newCount,
        group: newGroup,
      },
    };
  });
};

const moveCard = (cardId, qty = 1, fromGroup, toGroup) => {
  setDeck(prev => {
    const prevEntry = prev[cardId];
    if (!prevEntry) return prev;
    const newGroup = { ...prevEntry.group };

    // Remove from source
    newGroup[fromGroup] = Math.max((newGroup[fromGroup] || 0) - qty, 0);
    if (newGroup[fromGroup] === 0) delete newGroup[fromGroup];

    // Add to destination
    newGroup[toGroup] = (newGroup[toGroup] || 0) + qty;

    // Recompute total
    const newCount = Object.values(newGroup).reduce((a, b) => a + b, 0);

    if (newCount === 0) {
      const { [cardId]: _, ...rest } = prev;
      return rest;
    }
    return {
      ...prev,
      [cardId]: {
        ...prevEntry,
        count: newCount,
        group: newGroup,
      },
    };
  });
};

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
      />
    </div>
  );
}

export default DeckBuilder;
