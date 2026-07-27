// deckExportHelpers.js
const WORKER_API = "https://tcgbuilder.net/api";
// === Grouping and Sorting Helpers ===

// Helper to group cards in the deck by a property
export function groupDeck(deck, cards, groupBy) {
  const grouped = {};
  Object.entries(deck).forEach(([cardId, qty]) => {
    const card = cards.find(c => c.id === cardId);
    if (!card) return;
    const group = card?.[groupBy] || "Other";
    if (!grouped[group]) grouped[group] = [];
    grouped[group].push({ card, qty });
  });
  return grouped;
}

export function getSortedExportListWithDisplayOrder(
  deck,
  cards,
  settings,
  octgnOptions = {},
) {
  return getGroupedExportSections(
    deck,
    cards,
    settings,
    octgnOptions,
  ).flatMap((group) => group.entries);
}

// Helper to display name with subtitle (handles Subtitle and subtitle)
export function cardNameWithSubtitle(card, includeSubtitle) {
  if (!card) return "";
  if (!includeSubtitle) return card.name;
  const subtitle = card.Subtitle || card.subtitle;
  if (subtitle && subtitle.trim()) {
    return `${card.name} - ${subtitle}`;
  }
  return card.name;
}

// Helper to sort a group (DeckPanel logic, also used in export)
export function sortGroup(cards, groupSortConfig, includeSubtitle) {
  if (!groupSortConfig || typeof groupSortConfig !== "object") {
    return [...cards].sort((a, b) =>
      cardNameWithSubtitle(a.card, includeSubtitle).localeCompare(cardNameWithSubtitle(b.card, includeSubtitle))
    );
  }
  const sortProps = groupSortConfig.by || ["name"];
  const customOrders = groupSortConfig.order || {};
  return [...cards].sort((a, b) => {
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
      if (!isNaN(an) && !isNaN(bn)) {
        if (an !== bn) return an - bn;
      } else {
        const result = String(av).localeCompare(String(bv));
        if (result !== 0) return result;
      }
    }
    return 0;
  });
}

function cardMatchesExportSection(card, section) {
  if (!section?.criteria) return false;

  return Object.entries(section.criteria).some(([property, allowedValues]) => {
    const cardValue = card?.[property];

    if (Array.isArray(allowedValues)) {
      if (Array.isArray(cardValue)) {
        return cardValue.some((value) => allowedValues.includes(value));
      }

      return allowedValues.includes(cardValue);
    }

    return cardValue === allowedValues;
  });
}

function getEntryCount(entry) {
  if (entry && typeof entry === "object") {
    return Number(entry.count ?? entry.qty ?? entry.quantity ?? 0) || 0;
  }

  return Number(entry) || 0;
}


export function getGroupedExportSections(
  deck,
  cards,
  settings,
  {
    octgnSections = null,
    octgnDefaultSection = null,
  } = {},
) {
  const cardMap = new Map(
    (cards || [])
      .filter((card) => card?.id)
      .map((card) => [card.id, card]),
  );

  const includeSubtitle = settings?.includeSubtitle !== false;
  const groupSorts = settings?.groupSort || {};

  if (Array.isArray(octgnSections) && octgnSections.length > 0) {
    // Export all configured OCTGN sections in the order in octgn.json.
    // Empty sections are removed from the returned result below.
    const configuredNames = octgnSections.map((section) => section.name);

    if (
      octgnDefaultSection &&
      !configuredNames.includes(octgnDefaultSection)
    ) {
      configuredNames.push(octgnDefaultSection);
    }

    const grouped = {};

    for (const groupName of configuredNames) {
      grouped[groupName] = [];
    }

    for (const [cardId, entry] of Object.entries(deck || {})) {
      const card = cardMap.get(cardId);
      if (!card) continue;

      const totalCount = getEntryCount(entry);
      if (totalCount <= 0) continue;

      const manualGroups =
        entry?.group &&
        typeof entry.group === "object" &&
        !Array.isArray(entry.group)
          ? Object.entries(entry.group).filter(
              ([, quantity]) => Number(quantity) > 0,
            )
          : [];

      if (manualGroups.length > 0) {
        let assignedCount = 0;

        for (const [groupName, rawQuantity] of manualGroups) {
          const quantity = Number(rawQuantity) || 0;
          if (quantity <= 0) continue;

          if (!grouped[groupName]) {
            grouped[groupName] = [];
          }

          grouped[groupName].push({
            cardId,
            card,
            qty: quantity,
            group: groupName,
          });

          assignedCount += quantity;
        }

        const remainder = Math.max(0, totalCount - assignedCount);

        if (remainder > 0) {
          const remainderGroup =
            octgnDefaultSection || configuredNames[0] || "Ungrouped";

          if (!grouped[remainderGroup]) {
            grouped[remainderGroup] = [];
          }

          grouped[remainderGroup].push({
            cardId,
            card,
            qty: remainder,
            group: remainderGroup,
          });
        }

        continue;
      }

      const matchedSection = octgnSections.find((section) =>
        cardMatchesExportSection(card, section),
      );

      const groupName =
        matchedSection?.name ||
        octgnDefaultSection ||
        configuredNames[0] ||
        "Ungrouped";

      if (!grouped[groupName]) {
        grouped[groupName] = [];
      }

      grouped[groupName].push({
        cardId,
        card,
        qty: totalCount,
        group: groupName,
      });
    }

    const additionalNames = Object.keys(grouped)
      .filter((name) => !configuredNames.includes(name))
      .sort((a, b) => a.localeCompare(b));

    return [...configuredNames, ...additionalNames]
      .map((groupName) => ({
        name: groupName,
        entries: sortGroup(
          grouped[groupName] || [],
          groupSorts[groupName],
          includeSubtitle,
        ),
      }))
      .filter((group) => group.entries.length > 0);
  }

  const groupBy = settings?.groupOptions?.[0] || "Type";
  const configuredGroupOrder = Array.isArray(settings?.groupOrder)
    ? settings.groupOrder
    : [];

  const grouped = {};

  for (const [cardId, entry] of Object.entries(deck || {})) {
    const card = cardMap.get(cardId);
    if (!card) continue;

    const quantity = getEntryCount(entry);
    if (quantity <= 0) continue;

    const groupName =
      typeof entry?.group === "string" && entry.group
        ? entry.group
        : card?.[groupBy] || "Other";

    if (!grouped[groupName]) {
      grouped[groupName] = [];
    }

    grouped[groupName].push({
      cardId,
      card,
      qty: quantity,
      group: groupName,
    });
  }

  const existingNames = Object.keys(grouped);
  const orderedNames = configuredGroupOrder.filter((name) =>
    existingNames.includes(name),
  );

  const additionalNames = existingNames
    .filter((name) => !configuredGroupOrder.includes(name))
    .sort((a, b) => a.localeCompare(b));

  return [...orderedNames, ...additionalNames]
    .map((groupName) => ({
      name: groupName,
      entries: sortGroup(
        grouped[groupName],
        groupSorts[groupName],
        includeSubtitle,
      ),
    }))
    .filter((group) => group.entries.length > 0);
}

// === Utility for exportDeckImage* ===

export function getCardImageUrl(card, game) {
  if (!card || !card.image) return null;
  return `https://tcgbuilder.net/images/${game}/${card.image}`;
}

// --- Helper to load an image and return a promise
export function loadImage(url) {
  return new Promise((resolve, reject) => {
    if (!url) return reject(new Error("No image URL"));
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
}

// === EXPORT FUNCTIONS ===

// Export deck as image (compact grid)
export async function exportDeckImageCompact(
  deck,
  cards,
  settings,
  deckName,
  game,
  octgnOptions = {},
) {
  const cardWidth = 180;
  const cardHeight = 252;
  const paddingX = 18;
  const paddingY = 20;
  const labelHeight = 46;
  const groupLabelHeight = 34;
  const groupSpacing = 18;
  const dpr = 2;

  const gridCols = settings.compactExportCols || 5;
  const headingRow = settings.compactExportHeadingRow || false;
  const verticalOffsetFactor = settings.compactVerticalOffsetFactor ?? 0.10;
  const horizontalStackVerticalOffsetFactor =
    settings.compactHorizontalStackVerticalOffsetFactor ?? verticalOffsetFactor;
  const rowShiftFactor = settings.compactRowShiftFactor ?? 0.5;
  const stackProp = settings.compactHorizontalStackProperty;
  const stackQuantities = settings.compactHorizontalStackQuantity || {};

  const groupedSections = getGroupedExportSections(
    deck,
    cards,
    settings,
    octgnOptions,
  );

  const exportList = groupedSections.flatMap((group) => group.entries);

  if (exportList.length === 0) {
    alert("No cards in the deck could be found in the card list. Cannot export image.");
    return;
  }

  const cardImageCache = {};
  await Promise.all(
    exportList.map(async ({ card }) => {
      if (!cardImageCache[card.id]) {
        const url = getCardImageUrl(card, game);
        cardImageCache[card.id] = await loadImage(url);
      }
    }),
  );

  // Build compact output independently for each export group so cards from
  // different OCTGN sections can never share a row or horizontal stack.
  const outputByGroup = new Map(
    groupedSections.map((section) => [section.name, []]),
  );

  if (stackProp) {
    const horizontalGroups = new Map();

    for (const entry of exportList) {
      const { card, qty, group } = entry;

      if (card.Orientation !== "Horizontal") {
        outputByGroup.get(group).push({
          horizontalStack: false,
          ...entry,
        });
        continue;
      }

      const propVal = card[stackProp] || "";
      const stackKey = `${group}\u0000${propVal}`;

      if (!horizontalGroups.has(stackKey)) {
        horizontalGroups.set(stackKey, {
          group,
          propVal,
          cards: [],
        });
      }

      const horizontalGroup = horizontalGroups.get(stackKey);
      for (let index = 0; index < qty; index += 1) {
        horizontalGroup.cards.push(card);
      }
    }

    for (const { group, propVal, cards: cardArray } of horizontalGroups.values()) {
      const configuredStackQuantity = Number(stackQuantities[propVal]);
      const stackQuantity =
        Number.isFinite(configuredStackQuantity) && configuredStackQuantity > 0
          ? configuredStackQuantity
          : 1;

      let index = 0;
      while (index < cardArray.length) {
        const stack = cardArray.slice(index, index + stackQuantity);
        index += stack.length;

        outputByGroup.get(group).push({
          horizontalStack: true,
          group,
          stackPropValue: propVal,
          cards: stack,
          stackQty: stack.length,
        });
      }
    }
  } else {
    for (const entry of exportList) {
      outputByGroup.get(entry.group).push({
        horizontalStack: false,
        ...entry,
      });
    }
  }

  const normalRowWidth =
    gridCols * cardWidth + (gridCols + 1) * paddingX;

  const rowBlocks = [];

  for (const section of groupedSections) {
    const items = outputByGroup.get(section.name) || [];
    if (items.length === 0) continue;

    const sectionRows = [];
    let currentRow = [];
    let currentWidth = paddingX;

    for (const item of items) {
      const itemWidth = item.horizontalStack
        ? cardHeight
        : item.card.Orientation === "Horizontal"
          ? cardHeight
          : cardWidth;

      const shouldWrapHorizontal =
        item.horizontalStack &&
        currentWidth + itemWidth > normalRowWidth &&
        currentRow.length > 0;

      const shouldWrapNormal =
        !item.horizontalStack && currentRow.length >= gridCols;

      if (shouldWrapHorizontal || shouldWrapNormal) {
        sectionRows.push(currentRow);
        currentRow = [];
        currentWidth = paddingX;
      }

      currentRow.push(item);
      currentWidth += itemWidth + paddingX;
    }

    if (currentRow.length > 0) {
      sectionRows.push(currentRow);
    }

    rowBlocks.push({
      name: section.name,
      rows: sectionRows,
    });
  }

  const rows = [];
  const yStarts = [];
  const groupLabelPositions = [];
  let y = labelHeight + paddingY;

  for (const block of rowBlocks) {
    groupLabelPositions.push({
      name: block.name,
      y: y + groupLabelHeight / 2,
    });
    y += groupLabelHeight;

    for (let localRowIndex = 0; localRowIndex < block.rows.length; localRowIndex += 1) {
      const row = block.rows[localRowIndex];
      const globalRowIndex = rows.length;
      rows.push(row);
      yStarts.push(y);

      let lowest = y;

      for (const item of row) {
        let itemHeight;
        let stackQuantity;
        let offsetFactor;

        if (item.horizontalStack) {
          itemHeight = cardWidth;
          stackQuantity = item.stackQty;
          offsetFactor = horizontalStackVerticalOffsetFactor;
        } else {
          itemHeight =
            item.card.Orientation === "Horizontal"
              ? cardWidth
              : cardHeight;
          stackQuantity = item.qty;
          offsetFactor = verticalOffsetFactor;
        }

        const verticalCardOffset = Math.round(itemHeight * offsetFactor);
        const bottom =
          y + (stackQuantity - 1) * verticalCardOffset + itemHeight;

        if (bottom > lowest) lowest = bottom;
      }

      const isLastRowInGroup =
        localRowIndex === block.rows.length - 1;

      if (isLastRowInGroup) {
        y = lowest + groupSpacing;
      } else if (globalRowIndex === 0 && headingRow) {
        y = lowest + paddingY;
      } else {
        y = Math.round(lowest - cardHeight * rowShiftFactor);
      }
    }
  }

  let maxRowWidth = 0;
  for (const row of rows) {
    let rowWidth = paddingX;

    for (const item of row) {
      const itemWidth = item.horizontalStack
        ? cardHeight
        : item.card.Orientation === "Horizontal"
          ? cardHeight
          : cardWidth;

      rowWidth += itemWidth + paddingX;
    }

    if (rowWidth > maxRowWidth) maxRowWidth = rowWidth;
  }

  const width = Math.max(400, maxRowWidth);
  const height = Math.max(
    labelHeight + paddingY,
    Math.round(y + paddingY),
  );

  const canvas = document.createElement("canvas");
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);

  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);

  ctx.font = "bold 32px sans-serif";
  ctx.fillStyle = "#222";
  ctx.textAlign = "left";
  ctx.fillText(deckName || "Deck", paddingX, Math.round(labelHeight * 0.75));

  ctx.save();
  ctx.font = "bold 22px sans-serif";
  ctx.fillStyle = "#222";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";

  for (const label of groupLabelPositions) {
    ctx.fillText(label.name, paddingX, label.y);
  }

  ctx.restore();

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    const yRow = yStarts[rowIndex];
    let x = paddingX;

    for (const item of row) {
      if (item.horizontalStack) {
        const width = cardHeight;
        const height = cardWidth;
        const verticalCardOffset = Math.round(
          height * horizontalStackVerticalOffsetFactor,
        );

        for (let stackIndex = 0; stackIndex < item.stackQty; stackIndex += 1) {
          const card = item.cards[stackIndex];
          const image = cardImageCache[card.id];
          const cardY = yRow + stackIndex * verticalCardOffset;
          ctx.drawImage(image, x, cardY, width, height);
        }

        x += width + paddingX;
        continue;
      }

      const { card, qty } = item;
      const isHorizontal = card.Orientation === "Horizontal";
      const width = isHorizontal ? cardHeight : cardWidth;
      const height = isHorizontal ? cardWidth : cardHeight;
      const verticalCardOffset = Math.round(height * verticalOffsetFactor);
      const image = cardImageCache[card.id];

      for (let copyIndex = 0; copyIndex < qty; copyIndex += 1) {
        const cardY = yRow + copyIndex * verticalCardOffset;
        ctx.drawImage(image, x, cardY, width, height);
      }

      x += width + paddingX;
    }
  }

  canvas.toBlob((blob) => {
    if (!blob) return;

    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(blob);
    anchor.download = `${deckName || "deck"}.png`;
    anchor.click();

    setTimeout(() => URL.revokeObjectURL(anchor.href), 4000);
  }, "image/png");
}

// Export deck as image (regular grid)
export async function exportDeckImage(
  deck,
  cards,
  settings,
  deckName,
  game,
  octgnOptions = {},
) {
  const cardWidth = 150;
  const cardHeight = 210;
  const gridCols = 5;
  const paddingX = 16;
  const paddingY = 18;
  const deckTitleHeight = 46;
  const groupTitleHeight = 34;
  const groupBottomSpacing = 18;

  const groupedSections = getGroupedExportSections(
    deck,
    cards,
    settings,
    octgnOptions,
  );

  if (groupedSections.length === 0) {
    alert("No cards in the deck could be found in the card list. Cannot export image.");
    return;
  }

  const imageCache = new Map();

  await Promise.all(
    groupedSections.flatMap((group) =>
      group.entries.map(async ({ card }) => {
        if (!imageCache.has(card.id)) {
          imageCache.set(
            card.id,
            await loadImage(getCardImageUrl(card, game)),
          );
        }
      }),
    ),
  );

  const blocks = groupedSections.map((group) => {
    const preparedEntries = group.entries.map((entry) => {
      const isHorizontal = entry.card.Orientation === "Horizontal";

      return {
        ...entry,
        img: imageCache.get(entry.card.id),
        width: isHorizontal ? cardHeight : cardWidth,
        height: isHorizontal ? cardWidth : cardHeight,
      };
    });

    const rows = [];
    for (let index = 0; index < preparedEntries.length; index += gridCols) {
      rows.push(preparedEntries.slice(index, index + gridCols));
    }

    const rowHeights = rows.map((row) =>
      Math.max(...row.map((entry) => entry.height)),
    );

    const rowWidths = rows.map((row) =>
      row.reduce(
        (total, entry) => total + entry.width + paddingX,
        paddingX,
      ),
    );

    return {
      name: group.name,
      rows,
      rowHeights,
      width: Math.max(...rowWidths, 0),
      height:
        groupTitleHeight +
        rowHeights.reduce(
          (total, rowHeight) => total + rowHeight + paddingY,
          0,
        ) +
        groupBottomSpacing,
    };
  });

  const width = Math.max(
    400,
    ...blocks.map((block) => block.width),
  );

  const height =
    deckTitleHeight +
    paddingY +
    blocks.reduce((total, block) => total + block.height, 0) +
    paddingY;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);

  ctx.font = "bold 28px sans-serif";
  ctx.fillStyle = "#222";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(deckName || "Deck", paddingX, 32);

  let y = deckTitleHeight + paddingY;

  for (const block of blocks) {
    ctx.font = "bold 22px sans-serif";
    ctx.fillStyle = "#222";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(block.name, paddingX, y + groupTitleHeight / 2);

    y += groupTitleHeight;

    for (let rowIndex = 0; rowIndex < block.rows.length; rowIndex += 1) {
      const row = block.rows[rowIndex];
      let x = paddingX;

      for (const entry of row) {
        const {
          qty,
          img,
          width: entryWidth,
          height: entryHeight,
        } = entry;

        ctx.drawImage(
          img,
          x,
          y,
          entryWidth,
          entryHeight,
        );

        const badgeX = x + 8;
        const badgeY = y + entryHeight - 8;

        ctx.save();
        ctx.font = "bold 28px sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "bottom";
        ctx.fillStyle = "rgba(0,0,0,0.7)";
        ctx.fillRect(badgeX - 2, badgeY - 32, 44, 32);
        ctx.fillStyle = "#fff";
        ctx.fillText(`×${qty}`, badgeX, badgeY - 4);
        ctx.restore();

        x += entryWidth + paddingX;
      }

      y += block.rowHeights[rowIndex] + paddingY;
    }

    y += groupBottomSpacing;
  }

  canvas.toBlob((blob) => {
    if (!blob) return;

    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(blob);
    anchor.download = `${deckName || "deck"}.png`;
    anchor.click();

    setTimeout(() => URL.revokeObjectURL(anchor.href), 4000);
  }, "image/png");
}

// Export deck as TTS string for Dragon Dice ONLY
export function buildDragonDiceTTSString(deck, cards) {
  if (!deck || Object.keys(deck).length === 0) {
    return "";
  }

  const cardById = new Map((cards || []).map((card) => [card.id, card]));
  const parts = [];

  for (const [cardId, entry] of Object.entries(deck)) {
    const qty =
      entry && typeof entry === "object"
        ? Number(entry.count || 0)
        : Number(entry || 0);

    if (!qty || qty <= 0) continue;

    const card = cardById.get(cardId);

    if (!card) {
      console.warn("TTS export skipped missing card:", cardId);
      continue;
    }

    const cardName = (card["sfr-name"] || "Unnamed Card");

    parts.push(`${cardName}:${qty}`);
  }

  if (!parts.length) {
    return "";
  }

  return `${parts.join(",")},`;
}

// Export deck as OCTGN XML
export async function exportDeckOCTGN(
  deck,
  cards,
  settings,
  deckName,
  octgnOverrides,
  currentGroupBy,
  onExportError,
) {
  let base = "/";
  if (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.BASE_URL) {
    base = import.meta.env.BASE_URL;
    if (!base.endsWith("/")) base += "/";
  }
  const gameName = settings.gameName || settings.game || "";
  const gameSegment = encodeURIComponent(gameName);
  let octgnJsonUrl = `${base}games/${gameSegment}/octgn.json`;
  let octgnSettings;
  try {
    let resp = await fetch(octgnJsonUrl);
    if (!resp.ok) {
      octgnJsonUrl = `${base}games/${gameName}/octgn.json`;
      resp = await fetch(octgnJsonUrl);
    }
    octgnSettings = await resp.json();
  } catch (e) {
    const message =
      "OCTGN export settings were not found or are invalid.\n\n" +
      "Tried: " + octgnJsonUrl;

    if (typeof onExportError === "function") {
      onExportError("OCTGN Export", message);
    } else {
      alert(message);
    }
    return;
  }

  // Helper: match ANY criteria (OR)
  function cardMatchesSection(card, section) {
    if (!section.criteria) return false;
    return Object.entries(section.criteria).some(([prop, values]) => {
      const cardVal = card[prop];
      if (Array.isArray(values)) {
        if (Array.isArray(cardVal)) {
          return cardVal.some(v => values.includes(v));
        }
        return values.includes(cardVal);
      }
      return cardVal === values;
    });
  }

  // Build an array for each section name
  const sectionMap = {};
  for (const section of octgnSettings.sections) {
    sectionMap[section.name] = [];
  }
  if (octgnSettings.defaultSection && !(octgnSettings.defaultSection in sectionMap)) {
    sectionMap[octgnSettings.defaultSection] = [];
  }

  // A stored group name must map to a real OCTGN section. Unknown groups are
  // intentionally preserved by the editor, but OCTGN cannot represent them
  // safely, so stop the export and tell the user exactly what must be fixed.
  const missingGroups = new Map();

  for (const [cardId, entry] of Object.entries(deck)) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    if (!entry.group || typeof entry.group !== "object" || Array.isArray(entry.group)) continue;

    const card = cards.find(candidate => candidate.id === cardId);
    const cardName = card?.name || cardId;

    for (const [groupName, rawQty] of Object.entries(entry.group)) {
      const qty = Number(rawQty);
      if (!Number.isFinite(qty) || qty <= 0 || groupName in sectionMap) continue;

      if (!missingGroups.has(groupName)) {
        missingGroups.set(groupName, { total: 0, cards: [] });
      }

      const missingGroup = missingGroups.get(groupName);
      missingGroup.total += qty;
      missingGroup.cards.push({ name: cardName, qty });
    }
  }

  if (missingGroups.size > 0) {
    const details = Array.from(missingGroups.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([groupName, groupInfo]) => {
        const cardLines = groupInfo.cards
          .sort((a, b) => a.name.localeCompare(b.name))
          .map(({ name, qty }) => `    • ${name} ×${qty}`)
          .join("\n");

        return `${groupName} (${groupInfo.total} ${groupInfo.total === 1 ? "card" : "cards"})\n${cardLines}`;
      })
      .join("\n\n");

    const message =
      "This deck contains groups that are not defined in the current OCTGN configuration.\n\n" +
      details +
      "\n\nMove these cards into valid OCTGN groups, then export again.";

    if (typeof onExportError === "function") {
      onExportError("OCTGN Export Cannot Continue", message);
    } else {
      alert(message);
    }
    return;
  }

  // Walk every deck entry
  for (const [cardId, entry] of Object.entries(deck)) {
    const total = entry.count;
    if (!total || total <= 0) continue;
    const card = cards.find(c => c.id === cardId);
    if (!card) continue;

    if (entry.group && typeof entry.group === "object" && Object.keys(entry.group).length > 0) {
      let unassignedQty = 0;
      for (const [sectName, sectQty] of Object.entries(entry.group)) {
        if (sectQty > 0 && sectName in sectionMap) {
          sectionMap[sectName].push({ card, qty: sectQty });
        } else if (sectQty > 0) {
          unassignedQty += sectQty;
        }
      }
      if (unassignedQty > 0 && octgnSettings.defaultSection in sectionMap) {
        sectionMap[octgnSettings.defaultSection].push({ card, qty: unassignedQty });
      }
    } else {
      let placed = false;
      const override = octgnOverrides && octgnOverrides[cardId];
      if (
        currentGroupBy === "OCTGN" &&
        override &&
        override !== "Ungrouped" &&
        override in sectionMap
      ) {
        sectionMap[override].push({ card, qty: total });
        placed = true;
      }
      if (!placed) {
        for (const sect of octgnSettings.sections) {
          if (cardMatchesSection(card, sect)) {
            sectionMap[sect.name].push({ card, qty: total });
            placed = true;
            break;
          }
        }
      }
      if (!placed && octgnSettings.defaultSection in sectionMap) {
        sectionMap[octgnSettings.defaultSection].push({ card, qty: total });
      }
    }
  }

  // Build the XML
  let sectionsXml = "";
  for (const sectionName in sectionMap) {
    const sectionDef = octgnSettings.sections.find(s => s.name === sectionName) || { shared: false };
    const cardsXml = sectionMap[sectionName]
      .map(({ card, qty }) => `    <card qty="${qty}" id="${card.id}">${card.name}</card>`)
      .join("\n");
    if (cardsXml) {
      sectionsXml +=
        `  <section name="${sectionName}" shared="${sectionDef.shared ? "True" : "False"}">\n` +
        `${cardsXml}\n` +
        `  </section>\n`;
    } else {
      sectionsXml +=
        `  <section name="${sectionName}" shared="${sectionDef.shared ? "True" : "False"}" />\n`;
    }
  }

  const xml =
    `<?xml version="1.0" encoding="utf-8" standalone="yes"?>\n` +
    `<deck game="${octgnSettings.gameGuid}">\n` +
    `${sectionsXml}` +
    `  <notes><![CDATA[]]></notes>\n` +
    `</deck>\n`;

  const blob = new Blob([xml], { type: "application/xml" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${deckName || "deck"}.o8d`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}


function buildSharedDeckUrl(game, code) {
  return (
    window.location.origin +
    window.location.pathname +
    `?game=${encodeURIComponent(game)}&deck=${encodeURIComponent(code)}`
  );
}

async function copyTextToClipboard(text) {
  let success = false;
  try {
    await navigator.clipboard.writeText(text);
    success = true;
  } catch (clipErr) {
    console.warn("Clipboard API failed, trying fallback:", clipErr);
    let fallbackSuccess = false;
    let input;
    try {
      input = document.createElement("input");
      input.value = text;
      document.body.appendChild(input);
      input.select();
      fallbackSuccess = document.execCommand("copy");
      if (!fallbackSuccess) {
        console.warn("execCommand('copy') returned false");
      }
    } catch (fallbackErr) {
      console.error("Clipboard fallback threw:", fallbackErr);
      fallbackSuccess = false;
    } finally {
      if (input && input.parentNode) {
        input.parentNode.removeChild(input);
      }
    }
    success = fallbackSuccess;
  }
  return success;
}

async function parseJsonResponse(resp) {
  const raw = await resp.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    console.error("Invalid JSON in response:", raw);
    throw new Error("Invalid server response (not JSON)");
  }
  return data;
}

export async function createSharedDeck({ deck, game, name, editToken }) {
  try {
    const resp = await fetch(`${WORKER_API}/deck`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        game,
        deck,
        editToken,
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.error("API error:", resp.status, text);
      throw new Error(`Server returned ${resp.status}: ${text}`);
    }

    const data = await parseJsonResponse(resp);
    const code = data?.code;
    if (!code || typeof code !== "string") {
      console.error("Deck code missing from response:", data);
      throw new Error("Invalid response: missing deck code");
    }

    const url = buildSharedDeckUrl(game, code);
    const success = await copyTextToClipboard(url);
    return { success, url, code };
  } catch (e) {
    console.error("Deck sharing failed:", e);
    return { success: false, error: e.message || "Unknown error" };
  }
}

export async function updateSharedDeck({ code, deck, game, name, editToken }) {
  try {
    const resp = await fetch(`${WORKER_API}/deck/${encodeURIComponent(code)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        game,
        deck,
        editToken,
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.error("API error:", resp.status, text);
      throw new Error(`Server returned ${resp.status}: ${text}`);
    }

    await parseJsonResponse(resp);
    const url = buildSharedDeckUrl(game, code);
    const success = await copyTextToClipboard(url);
    return { success, url, code };
  } catch (e) {
    console.error("Deck update failed:", e);
    return { success: false, error: e.message || "Unknown error" };
  }
}