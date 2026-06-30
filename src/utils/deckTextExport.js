function getCardName(card, config) {
  const nameProperty = config?.defaults?.nameProperty || "Card Name";
  return card?.[nameProperty] || card?.name || card?.Name || card?.id || "";
}

function getCardType(card, config) {
  const typeProperty = config?.defaults?.typeProperty || "Type";
  return card?.[typeProperty] || "";
}

function formatHeader(value, config) {
  const style = config?.headerStyle || "boldAsterisks";

  if (!value) return "";

  if (style === "boldAsterisks") {
    return `**${value}**`;
  }

  return String(value);
}

function compareValues(a, b, sortRule) {
  const direction = sortRule?.direction === "desc" ? -1 : 1;

  let left = a;
  let right = b;

  if (sortRule?.numeric) {
    left = Number(left);
    right = Number(right);

    const leftValid = Number.isFinite(left);
    const rightValid = Number.isFinite(right);

    if (!leftValid && !rightValid) return 0;
    if (!leftValid) return 1;
    if (!rightValid) return -1;

    return (left - right) * direction;
  }

  return (
    String(left || "").localeCompare(String(right || ""), undefined, {
      numeric: true,
      sensitivity: "base",
    }) * direction
  );
}

function sortCards(cards, sortRules, config) {
  const fallbackSort = config?.defaults?.defaultTypeSort || [
    {
      property: config?.defaults?.nameProperty || "Card Name",
      direction: "asc",
    },
  ];

  const rules =
    Array.isArray(sortRules) && sortRules.length > 0 ? sortRules : fallbackSort;

  return [...cards].sort((a, b) => {
    for (const rule of rules) {
      const result = compareValues(
        a.card?.[rule.property],
        b.card?.[rule.property],
        rule,
      );

      if (result !== 0) return result;
    }

    return getCardName(a.card, config).localeCompare(
      getCardName(b.card, config),
      undefined,
      {
        numeric: true,
        sensitivity: "base",
      },
    );
  });
}

function getDeckCardEntries(deck, cards) {
  const cardById = new Map(cards.map((card) => [card.id, card]));

  return Object.entries(deck)
    .map(([cardId, entry]) => {
      const card = cardById.get(cardId);
      const count = Number(entry?.count || 0);

      if (!card || count <= 0) return null;

      return {
        cardId,
        card,
        entry,
        count,
      };
    })
    .filter(Boolean);
}

function getEntrySection(entry, card, octgnOverrides) {
  const overrideSection = octgnOverrides?.[card.id];

  if (overrideSection) {
    return overrideSection;
  }

  if (entry?.group && typeof entry.group === "object") {
    const sectionNames = Object.keys(entry.group).filter(
      (sectionName) => Number(entry.group[sectionName] || 0) > 0,
    );

    if (sectionNames.length === 1) {
      return sectionNames[0];
    }
  }

  return "Deck";
}

function expandEntriesBySection(entries, octgnOverrides) {
  const expanded = [];

  entries.forEach((item) => {
    const group = item.entry?.group;

    if (group && typeof group === "object" && Object.keys(group).length > 0) {
      Object.entries(group).forEach(([section, qty]) => {
        const count = Number(qty || 0);

        if (count > 0) {
          expanded.push({
            ...item,
            section,
            count,
          });
        }
      });

      return;
    }

    expanded.push({
      ...item,
      section: getEntrySection(item.entry, item.card, octgnOverrides),
    });
  });

  return expanded;
}

function formatCardLine(item, config) {
  const name = getCardName(item.card, config);
  return `${item.count} ${name}`;
}

function buildTypeGroups(items, typeOrder, config) {
  const explicitTypeOrder = Array.isArray(typeOrder) ? typeOrder : [];
  const groups = new Map();

  items.forEach((item) => {
    const type = getCardType(item.card, config);
    if (!groups.has(type)) groups.set(type, []);
    groups.get(type).push(item);
  });

  const orderedGroups = [];

  explicitTypeOrder.forEach((typeConfig) => {
  const displayType = typeConfig.type;
  const matchTypes = Array.isArray(typeConfig.matchTypes)
    ? typeConfig.matchTypes
    : [displayType];

  const typeItems = [];

  matchTypes.forEach((type) => {
    const items = groups.get(type) || [];
    typeItems.push(...items);
    groups.delete(type);
  });

  if (typeItems.length === 0) return;

  orderedGroups.push({
    type: displayType,
    items: sortCards(typeItems, typeConfig.sortBy, config),
  });
});

  const remainingTypes = [...groups.keys()].sort((a, b) =>
    String(a || "").localeCompare(String(b || ""), undefined, {
      numeric: true,
      sensitivity: "base",
    }),
  );

  remainingTypes.forEach((type) => {
    orderedGroups.push({
      type,
      items: sortCards(groups.get(type) || [], null, config),
    });
  });

  return orderedGroups;
}

function buildSimpleGroupedText(items, config) {
  const groups = new Map();

  items.forEach((item) => {
    const type = getCardType(item.card, config) || "Other";

    if (!groups.has(type)) {
      groups.set(type, []);
    }

    groups.get(type).push(item);
  });

  const typeNames = [...groups.keys()].sort((a, b) =>
    String(a || "").localeCompare(String(b || ""), undefined, {
      numeric: true,
      sensitivity: "base",
    }),
  );

  const lines = [];

  typeNames.forEach((type) => {
    const sortedItems = sortCards(groups.get(type) || [], null, config);

    lines.push(formatHeader(type, config));

    sortedItems.forEach((item) => {
      lines.push(formatCardLine(item, config));
    });

    lines.push("");
  });

  while (lines[lines.length - 1] === "") {
    lines.pop();
  }

  return lines.join("\n");
}

function buildSectionText(sectionConfig, allItems, config) {
  const sectionName = sectionConfig.section;
  const sectionItems = allItems.filter((item) => item.section === sectionName);

  if (sectionItems.length === 0) return "";

  const showSectionHeader = sectionConfig.showSectionHeader !== false;
  const showTypeHeaders = sectionConfig.showTypeHeaders !== false;

  const lines = [];

  if (showSectionHeader) {
    lines.push(formatHeader(sectionName, config));
  }

  const typeGroups = buildTypeGroups(
    sectionItems,
    sectionConfig.typeOrder,
    config,
  );

  typeGroups.forEach((group) => {
    if (showTypeHeaders) {
      lines.push(formatHeader(group.type || "Other", config));
    }

    group.items.forEach((item) => {
      lines.push(formatCardLine(item, config));
    });

    lines.push("");
  });

  while (lines[lines.length - 1] === "") {
    lines.pop();
  }

  return lines.join("\n");
}

export function buildDeckTextExport({
  deck,
  cards,
  settings,
  octgnOverrides = {},
}) {
  const config = settings?.deckTextExport || {};
  const layout = Array.isArray(config.layout) ? config.layout : [];

  const entries = getDeckCardEntries(deck, cards);

  if (entries.length === 0) {
    return "";
  }

  const grouping = config.grouping || "Deck";

  if (grouping === "Type") {
    return buildSimpleGroupedText(entries, config).trim();
  }

  const expandedItems =
    grouping === "OCTGN"
      ? expandEntriesBySection(entries, octgnOverrides)
      : entries.map((item) => ({
          ...item,
          section: "Deck",
        }));

  const blocks = [];

  layout.forEach((area) => {
    const areaSections = Array.isArray(area.sections) ? area.sections : [];

    const areaText = areaSections
      .map((sectionConfig) =>
        buildSectionText(sectionConfig, expandedItems, config),
      )
      .filter(Boolean)
      .join("\n\n");

    if (!areaText) return;

    if (area.showHeader === true && area.name) {
      blocks.push(`${formatHeader(area.name, config)}\n${areaText}`);
    } else {
      blocks.push(areaText);
    }
  });

  return blocks.join("\n\n").trim();
}