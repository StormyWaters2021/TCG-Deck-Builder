export function createDeckLoadNormalizer({
  cards,
  fallbackGroup,
  octgnSections,
  octgnDefaultSection,
  getSectionForCard,
}) {
  const cardMap = new Map((cards || []).map((card) => [card.id, card]));

  const pickAutoGroupForCard = (cardId) => {
    let actualGroup = null;

    if (octgnSections && Array.isArray(octgnSections)) {
      const card = cardMap.get(cardId);
      actualGroup = getSectionForCard?.(card, octgnSections, octgnDefaultSection);
    }

    if (!actualGroup && octgnDefaultSection) actualGroup = octgnDefaultSection;
    if (!actualGroup && fallbackGroup) actualGroup = fallbackGroup;

    if (!actualGroup) {
      console.warn(
        "Loaded card with no group and no fallbackGroup; assigning to 'Other'.",
        { cardId }
      );
      actualGroup = "Other";
    }

    return actualGroup;
  };

  return function normalizeLoadedDeck(loadedDeck) {
    if (!loadedDeck || typeof loadedDeck !== "object") return loadedDeck;

    let changed = false;
    const normalized = { ...loadedDeck };

    for (const [cardId, entry] of Object.entries(loadedDeck)) {
      if (!entry || typeof entry !== "object") continue;

      const count = Number.isFinite(+entry.count) ? Math.max(0, +entry.count) : 0;
      if (count <= 0) continue;

      // Case 1: string group -> convert directly to object form
      if (typeof entry.group === "string") {
        const groupName = entry.group.trim();
        if (groupName) {
          normalized[cardId] = {
            ...entry,
            count,
            group: { [groupName]: count },
          };
          changed = true;
          continue;
        }
      }

      // Case 2: valid object group data -> preserve exactly as-is
      if (entry.group && typeof entry.group === "object" && !Array.isArray(entry.group)) {
        const cleanedGroup = {};
        let total = 0;
        let hasInvalidValue = false;

        for (const [groupName, groupCount] of Object.entries(entry.group)) {
          const n = Number(groupCount);
          if (!Number.isFinite(n) || n <= 0) {
            hasInvalidValue = true;
            break;
          }
          cleanedGroup[groupName] = n;
          total += n;
        }

        if (!hasInvalidValue && Object.keys(cleanedGroup).length > 0 && total === count) {
          continue;
        }
      }

      // Case 3: missing / empty / malformed / partial group data -> repair this card only
      const autoGroup = pickAutoGroupForCard(cardId);
      normalized[cardId] = {
        ...entry,
        count,
        group: { [autoGroup]: count },
      };
      changed = true;
    }

    return changed ? normalized : loadedDeck;
  };
}