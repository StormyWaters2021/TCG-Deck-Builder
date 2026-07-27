import { useCallback, useEffect, useMemo, useState } from "react";
import { createDeckLoadNormalizer } from "./deckLoadRepair";

export function getSectionForCard(card, octgnSections, defaultSection) {
  if (!card) return defaultSection || "Main";

  for (const section of octgnSections || []) {
    if (!section.criteria) continue;

    const matches = Object.entries(section.criteria).some(([prop, values]) =>
      Array.isArray(values) && values.includes(card[prop])
    );

    if (matches) return section.name;
  }

  return defaultSection || "Main";
}

export function useOctgnSections(gameName, enabled = true) {
  const [sections, setSections] = useState(null);
  const [defaultSection, setDefaultSection] = useState(null);

  useEffect(() => {
    if (!enabled || !gameName) {
      setSections(null);
      setDefaultSection(null);
      return undefined;
    }

    let cancelled = false;

    async function fetchSections() {
      try {
        let baseUrl = import.meta.env.BASE_URL || "";
        if (baseUrl.endsWith("/")) baseUrl = baseUrl.slice(0, -1);

        const response = await fetch(`${baseUrl}/games/${gameName}/octgn.json`);
        if (!response.ok) {
          throw new Error(`Unable to load OCTGN sections (${response.status})`);
        }

        const json = await response.json();
        if (!cancelled) {
          setSections(json.sections || []);
          setDefaultSection(json.defaultSection || "Main");
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to load OCTGN section settings:", error);
          setSections([]);
          setDefaultSection("Main");
        }
      }
    }

    fetchSections();

    return () => {
      cancelled = true;
    };
  }, [gameName, enabled]);

  return [sections, defaultSection];
}

export default function useDeckBuilderActions({
  cards,
  allCards,
  deck,
  setDeck,
  settings,
}) {
  const [octgnSections, octgnDefaultSection] = useOctgnSections(
    settings?.gameName,
    true
  );

  const normalizationCards = allCards?.length ? allCards : cards;

  const normalizeLoadedDeck = useMemo(
    () =>
      createDeckLoadNormalizer({
        cards: normalizationCards,
        fallbackGroup: settings?.fallbackGroup,
        octgnSections,
        octgnDefaultSection,
        getSectionForCard,
      }),
    [
      normalizationCards,
      settings?.fallbackGroup,
      octgnSections,
      octgnDefaultSection,
    ]
  );

  // Repair any externally loaded deck before either desktop or mobile edits it.
  useEffect(() => {
    if (!deck || typeof deck !== "object" || Object.keys(deck).length === 0) return;
    if (!cards?.length) return;

    const repairedDeck = normalizeLoadedDeck(deck);
    if (repairedDeck !== deck) setDeck(repairedDeck);
  }, [deck, cards, normalizeLoadedDeck, setDeck]);

  const setDeckFromLoad = useCallback(
    (nextDeckOrUpdater) => {
      // Functional updaters are normal in-app edits and must not be treated as loads.
      if (typeof nextDeckOrUpdater === "function") {
        setDeck(nextDeckOrUpdater);
        return;
      }

      setDeck(normalizeLoadedDeck(nextDeckOrUpdater));
    },
    [normalizeLoadedDeck, setDeck]
  );

  const resolveGroupForCard = useCallback(
    (cardId, requestedGroup) => {
      if (requestedGroup) return requestedGroup;

      if (Array.isArray(octgnSections)) {
        const card = cards?.find((candidate) => candidate.id === cardId);
        const matchedSection = getSectionForCard(
          card,
          octgnSections,
          octgnDefaultSection
        );
        if (matchedSection) return matchedSection;
      }

      if (octgnDefaultSection) return octgnDefaultSection;
      if (settings?.fallbackGroup) return settings.fallbackGroup;

      console.warn(
        "Card added with no group! Please set fallbackGroup in settings.json.",
        { cardId }
      );
      return "Other";
    },
    [cards, octgnSections, octgnDefaultSection, settings?.fallbackGroup]
  );

  const addCard = useCallback(
    (cardId, qty = 1, groupName) => {
      if (!cardId || qty <= 0) return;

      setDeck((previousDeck) => {
        const previousEntry = previousDeck[cardId] || {
          count: 0,
          group: {},
          tags: [],
        };
        const groups = { ...previousEntry.group };
        const actualGroup = resolveGroupForCard(cardId, groupName);

        groups[actualGroup] = (groups[actualGroup] || 0) + qty;
        const count = Object.values(groups).reduce((sum, value) => sum + value, 0);

        return {
          ...previousDeck,
          [cardId]: {
            ...previousEntry,
            count,
            group: groups,
          },
        };
      });
    },
    [resolveGroupForCard, setDeck]
  );

  const removeCard = useCallback(
    (cardId, qty = 1, groupName) => {
      if (!cardId || qty <= 0) return;

      setDeck((previousDeck) => {
        const previousEntry = previousDeck[cardId];
        if (!previousEntry) return previousDeck;

        const groups = { ...previousEntry.group };

        if (groupName) {
          const available = groups[groupName] || 0;
          const remaining = Math.max(available - qty, 0);
          if (remaining > 0) groups[groupName] = remaining;
          else delete groups[groupName];
        } else {
          // Preserve existing behavior when no group is supplied.
          for (const key of Object.keys(groups)) {
            const remaining = Math.max((groups[key] || 0) - qty, 0);
            if (remaining > 0) groups[key] = remaining;
            else delete groups[key];
          }
        }

        const count = Object.values(groups).reduce((sum, value) => sum + value, 0);
        if (count === 0) {
          const { [cardId]: removed, ...rest } = previousDeck;
          return rest;
        }

        return {
          ...previousDeck,
          [cardId]: {
            ...previousEntry,
            count,
            group: groups,
          },
        };
      });
    },
    [setDeck]
  );

  const moveCard = useCallback(
    (cardId, qty = 1, fromGroup, toGroup) => {
      if (!cardId || qty <= 0 || !fromGroup || !toGroup || fromGroup === toGroup) {
        return;
      }

      setDeck((previousDeck) => {
        const previousEntry = previousDeck[cardId];
        if (!previousEntry) return previousDeck;

        const groups = { ...previousEntry.group };
        const available = groups[fromGroup] || 0;
        const quantityToMove = Math.min(qty, available);
        if (quantityToMove <= 0) return previousDeck;

        const sourceRemaining = available - quantityToMove;
        if (sourceRemaining > 0) groups[fromGroup] = sourceRemaining;
        else delete groups[fromGroup];

        groups[toGroup] = (groups[toGroup] || 0) + quantityToMove;

        // Moving never changes the total, but recomputing keeps the invariant explicit.
        const count = Object.values(groups).reduce((sum, value) => sum + value, 0);

        return {
          ...previousDeck,
          [cardId]: {
            ...previousEntry,
            count,
            group: groups,
          },
        };
      });
    },
    [setDeck]
  );

  return {
    octgnSections,
    octgnDefaultSection,
    normalizeLoadedDeck,
    setDeckFromLoad,
    addCard,
    removeCard,
    moveCard,
  };
}
