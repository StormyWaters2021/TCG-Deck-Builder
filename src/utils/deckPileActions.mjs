export function getSectionForCard(card, sections, defaultSection) {
  if (!card) return defaultSection;
  for (const section of sections || []) {
    if (!section.criteria) continue;
    const matches = Object.entries(section.criteria).some(([prop, values]) => {
      const actual = card[prop];
      return Array.isArray(values)
        ? (Array.isArray(actual) ? actual.some(value => values.includes(value)) : values.includes(actual))
        : actual === values;
    });
    if (matches) return section.name;
  }
  return defaultSection;
}

export function isValidPile(sections, name) {
  return typeof name === "string" && sections?.some(section => section.name === name) === true;
}

export function resolveAddPile({ card, sections, defaultSection, requestedGroup, status }) {
  if (status !== "ready") return { error: status === "error" ? "Unable to load deck piles. Reload the game and try again." : "Deck piles are still loading. Try again shortly." };
  if (!card) return { error: "Card not found in this game's catalog." };
  const group = requestedGroup ?? getSectionForCard(card, sections, defaultSection);
  if (!isValidPile(sections, group)) return { error: `Invalid deck pile: ${group || "(no default configured)"}. Check octgn.json.` };
  return { group };
}

export function addToPile(deck, cardId, qty, group) {
  const previous = deck[cardId] || { count: 0, group: {}, tags: [] };
  const groups = { ...previous.group };
  const assigned = Object.values(groups).reduce((sum, value) => sum + Number(value), 0);
  const remainder = Math.max(0, Number(previous.count) - assigned);
  if (remainder) groups.Ungrouped = Number(groups.Ungrouped || 0) + remainder;
  groups[group] = Number(groups[group] || 0) + qty;
  return { ...deck, [cardId]: { ...previous, group: groups, count: Object.values(groups).reduce((sum, value) => sum + Number(value), 0) } };
}

export function swapPrinting(deck, oldId, newId, qty, groupName) {
  const source = deck[oldId];
  if (!source || oldId === newId) return deck;
  const allocations = { ...source.group };
  const assigned = Object.values(allocations).reduce((sum, value) => sum + Number(value), 0);
  const remainder = Math.max(0, Number(source.count) - assigned);
  if (remainder) allocations.Ungrouped = Number(allocations.Ungrouped || 0) + remainder;
  const names = groupName ? [groupName] : Object.keys(allocations);
  let result = deck;
  let remaining = qty;
  for (const name of names) {
    const moved = Math.min(remaining, Number(allocations[name] || 0));
    if (moved <= 0) continue;
    allocations[name] -= moved;
    if (!allocations[name]) delete allocations[name];
    result = addToPile(result, newId, moved, name);
    remaining -= moved;
  }
  if (result === deck) return deck;
  const count = Object.values(allocations).reduce((sum, value) => sum + Number(value), 0);
  if (count) result[oldId] = { ...source, count, group: allocations };
  else delete result[oldId];
  return result;
}
