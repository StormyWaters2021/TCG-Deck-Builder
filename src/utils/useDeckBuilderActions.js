import { fetchGameConfig } from "./gameConfigLoader";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createDeckLoadNormalizer } from "./deckLoadRepair";

import { getSectionForCard, isValidPile, resolveAddPile, addToPile, swapPrinting } from "./deckPileActions.mjs";
export { getSectionForCard };
const reportError = (message) => window.alert(message);

export function useOctgnSections(gameName, enabled = true, allowNoOctgn = false, fallbackGroup = "Main") {
  const [config, setConfig] = useState(null);
  useEffect(() => {
    if (!enabled || !gameName) return;
    let cancelled = false;
    setConfig(null);
    async function fetchSections() {
      try {
        const response = await fetchGameConfig(gameName, "octgn.json", { optional: allowNoOctgn });
        if (allowNoOctgn && response.status === 404) {
          if (!cancelled) setConfig({ gameName, sections: [{ name: fallbackGroup }], defaultSection: fallbackGroup, status: "ready", hasOctgnConfig: false });
          return;
        }
        if (!response.ok) throw new Error(`Unable to load OCTGN sections (${response.status})`);
        const json = await response.json();
        if (!Array.isArray(json.sections) || !json.sections.length || json.sections.some(section => typeof section?.name !== "string" || !section.name.trim())) {
          throw new Error("No valid OCTGN sections configured");
        }
        if (!cancelled) setConfig({ gameName, sections: json.sections, defaultSection: json.defaultSection || null, status: "ready", hasOctgnConfig: true });
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to load OCTGN section settings:", error);
          setConfig({ gameName, status: "error" });
        }
      }
    }
    fetchSections();
    return () => { cancelled = true; };
  }, [gameName, enabled, allowNoOctgn, fallbackGroup]);
  if (!enabled || !gameName || config?.gameName !== gameName) return [null, null, "loading", false];
  return [config.sections ?? null, config.defaultSection ?? null, config.status, config.hasOctgnConfig === true];
}

export default function useDeckBuilderActions({
  cards,
  allCards,
  deck,
  setDeck,
  settings,
}) {
  const [octgnSections, octgnDefaultSection, pileStatus, hasOctgnConfig] = useOctgnSections(
    settings?.gameName,
    true,
    settings?.octgnExport === false,
    settings?.fallbackGroup || "Main"
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

    setDeck(previous => normalizeLoadedDeck(previous));
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

  const additionalAddPile = typeof settings?.additionalAddPile === "string" ? settings.additionalAddPile.trim() : "";
  const additionalPileError = additionalAddPile && pileStatus === "ready" && (!hasOctgnConfig || !isValidPile(octgnSections, additionalAddPile))
    ? `Invalid additional pile "${additionalAddPile}" in settings.json. Check octgn.json.` : "";
  const defaultPileError = pileStatus === "ready" && !isValidPile(octgnSections, octgnDefaultSection) ? `Invalid default pile "${octgnDefaultSection || "(missing)"}" in octgn.json. Unmatched cards cannot be added.` : "";
  const pileError = pileStatus === "error" ? "Unable to load deck piles. Reload the game to try again." : [additionalPileError, defaultPileError].filter(Boolean).join(" ");


  const addCard = useCallback((cardId, qty = 1, groupName) => {
    if (!cardId || !Number.isSafeInteger(qty) || qty <= 0) {
      reportError("Invalid card or quantity. No cards were added.");
      return false;
    }
    const card = normalizationCards?.find(candidate => candidate.id === cardId);
    const { group, error } = resolveAddPile({ card, sections: octgnSections, defaultSection: octgnDefaultSection, requestedGroup: groupName, status: pileStatus });
    if (error) {
      reportError(error);
      return false;
    }
    setDeck(previous => addToPile(normalizeLoadedDeck(previous), cardId, qty, group));
    return true;
  }, [normalizationCards, octgnSections, octgnDefaultSection, pileStatus, normalizeLoadedDeck, setDeck]);

  const swapCard = useCallback((oldId, newId, qty, groupName) => {
    if (!Number.isSafeInteger(qty) || qty <= 0 || !normalizationCards?.some(card => card.id === newId)) {
      reportError("Unable to swap this printing. No cards were changed.");
      return false;
    }
    setDeck(previous => swapPrinting(normalizeLoadedDeck(previous), oldId, newId, qty, groupName));
    return true;
  }, [normalizationCards, normalizeLoadedDeck, setDeck]);

  const removeCard = useCallback(
    (cardId, qty = 1, groupName) => {
      if (!cardId || !Number.isSafeInteger(qty) || qty <= 0) return;

      setDeck((previousDeck) => {
        previousDeck = normalizeLoadedDeck(previousDeck);
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
    [setDeck, normalizeLoadedDeck]
  );

  const moveCard = useCallback(
    (cardId, qty = 1, fromGroup, toGroup) => {
      if (!cardId || qty <= 0 || !fromGroup || !toGroup || fromGroup === toGroup) {
        return;
      }

      if (pileStatus !== "ready" || !isValidPile(octgnSections, toGroup)) {
        reportError(`Cannot move cards to "${toGroup}": destination pile is not available.`);
        return;
      }
      setDeck((previousDeck) => {
        previousDeck = normalizeLoadedDeck(previousDeck);
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
    [setDeck, pileStatus, octgnSections, normalizeLoadedDeck]
  );

  return {
    octgnSections,
    octgnDefaultSection,
    pileStatus,
    pileError,
    additionalAddPile,
    additionalPileValid: pileStatus === "ready" && hasOctgnConfig && isValidPile(octgnSections, additionalAddPile),
    swapCard,
    normalizeLoadedDeck,
    setDeckFromLoad,
    addCard,
    removeCard,
    moveCard,
  };
}
