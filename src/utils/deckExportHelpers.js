// Helper to group cards in the deck by a property
function groupDeck(deck, cards, groupBy) {
  const grouped = {};
  Object.entries(deck).forEach(([cardId, qty]) => {
    const card = cards.find(c => c.id === cardId);
    const group = card?.[groupBy] || "Other";
    if (!grouped[group]) grouped[group] = [];
    grouped[group].push({ card, qty });
  });
  return grouped;
}

// Main export helper that matches display order
export function getSortedExportListWithDisplayOrder(deck, cards, settings) {
  const groupBy = settings.groupOptions?.[0] || "Type";
  const FALLBACK_GROUP_ORDER = ["Creatures", "Spells", "Lands", "Other"];
  const groupOrder = Array.isArray(settings.groupOrder) ? settings.groupOrder : FALLBACK_GROUP_ORDER;
  const groupSorts = settings.groupSort || {};

  function getSortedGroupNames(groupedObj) {
    const groupNames = Object.keys(groupedObj);
    const inOrder = groupOrder.filter(name => groupNames.includes(name));
    const remaining = groupNames.filter(name => !groupOrder.includes(name)).sort();
    return [...inOrder, ...remaining];
  }

  function sortGroup(cardsInGroup, groupSortConfig) {
    if (!groupSortConfig || typeof groupSortConfig !== "object") {
      return [...cardsInGroup].sort((a, b) => a.card.name.localeCompare(b.card.name));
    }
    const sortProps = groupSortConfig.by || ["name"];
    const customOrders = groupSortConfig.order || {};

    return [...cardsInGroup].sort((a, b) => {
      for (const prop of sortProps) {
        const av = a.card?.[prop] ?? "";
        const bv = b.card?.[prop] ?? "";

        if (customOrders[prop]) {
          const order = customOrders[prop];
          const ai = order.indexOf(av);
          const bi = order.indexOf(bv);

          if (ai !== -1 && bi !== -1 && ai !== bi) return ai - bi;
          if (ai !== -1 && bi === -1) return -1;
          if (bi !== -1 && ai === -1) return 1;
        }

        const an = parseFloat(av);
        const bn = parseFloat(bv);
        const isNumeric = !isNaN(an) && !isNaN(bn);

        if (isNumeric) {
          if (an !== bn) return an - bn;
        } else {
          const result = String(av).localeCompare(String(bv));
          if (result !== 0) return result;
        }
      }
      return 0;
    });
  }

  const grouped = groupDeck(deck, cards, groupBy);
  const sortedGroups = getSortedGroupNames(grouped);

  const exportList = [];
  for (const group of sortedGroups) {
    const groupSortConfig = groupSorts[group];
    const sorted = sortGroup(grouped[group], groupSortConfig);
    for (const { card, qty } of sorted) {
      exportList.push({ card, qty, group });
    }
  }
  return exportList;
}