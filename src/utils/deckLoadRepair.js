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
    if (!loadedDeck || typeof loadedDeck !== "object" || Array.isArray(loadedDeck)) {
      return loadedDeck;
    }

    let changed = false;
    const normalized = { ...loadedDeck };

    for (const [cardId, originalEntry] of Object.entries(loadedDeck)) {
      let entry = originalEntry;

      // Legacy deck format: { cardId: quantity }
      if (typeof entry === "number" || typeof entry === "string") {
        entry = {
          count: Number(entry) || 0,
          group: {},
          tags: [],
        };
        changed = true;
      }

      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        continue;
      }

      let count = Number.isFinite(+entry.count) ? Math.max(0, +entry.count) : 0;

      // A legacy string group represents every copy of the card.
      if (typeof entry.group === "string") {
        const groupName = entry.group.trim();
        if (groupName && count > 0) {
          normalized[cardId] = {
            ...entry,
            count,
            group: { [groupName]: count },
          };
          changed = true;
          continue;
        }
      }

      const cleanedGroup = {};
      let groupTotal = 0;
      let groupIsStructurallyValid = true;

      if (entry.group && typeof entry.group === "object" && !Array.isArray(entry.group)) {
        for (const [rawGroupName, rawGroupCount] of Object.entries(entry.group)) {
          const groupName = String(rawGroupName).trim();
          const groupCount = Number(rawGroupCount);

          if (!groupName || !Number.isFinite(groupCount) || groupCount <= 0) {
            groupIsStructurallyValid = false;
            break;
          }

          cleanedGroup[groupName] = groupCount;
          groupTotal += groupCount;
        }
      } else {
        groupIsStructurallyValid = false;
      }

      const hasGroups = Object.keys(cleanedGroup).length > 0;

      // If count is missing but the saved group allocation is complete, preserve
      // the allocation and rebuild count from it instead of discarding the groups.
      if (count <= 0 && groupIsStructurallyValid && hasGroups && groupTotal > 0) {
        normalized[cardId] = {
          ...entry,
          count: groupTotal,
          group: cleanedGroup,
        };
        changed = true;
        continue;
      }

      if (count <= 0) continue;

      // Preserve all structurally valid group names, including names that are no
      // longer present in the current OCTGN configuration. Normalize quantities
      // to numbers when necessary.
      if (groupIsStructurallyValid && hasGroups && groupTotal === count) {
        const groupNeedsCleaning = Object.entries(entry.group).some(
          ([groupName, groupCount]) =>
            groupName !== groupName.trim() ||
            typeof groupCount !== "number" ||
            Number(groupCount) !== cleanedGroup[groupName.trim()]
        );
        const countNeedsCleaning = typeof entry.count !== "number" || entry.count !== count;

        if (groupNeedsCleaning || countNeedsCleaning || entry !== originalEntry) {
          normalized[cardId] = {
            ...entry,
            count,
            group: cleanedGroup,
          };
          changed = true;
        }
        continue;
      }

      // Missing, empty, malformed, partial, or desynchronized group data must be
      // repaired before the deck becomes editable. Assign every copy together so
      // the group quantities always account for the full count.
      const autoGroup = pickAutoGroupForCard(cardId);
      normalized[cardId] = {
        ...entry,
        count,
        group: { [autoGroup]: count },
        tags: Array.isArray(entry.tags) ? entry.tags : [],
      };
      changed = true;
    }

    return changed ? normalized : loadedDeck;
  };
}
