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
export async function exportDeckImageCompact(deck, cards, settings, deckName, game) {
  const cardWidth = 180;
  const cardHeight = 252;
  const paddingX = 18;
  const paddingY = 20;
  const labelHeight = 46;
  const dpr = 2;

  const gridCols = settings.compactExportCols || 5;
  const headingRow = settings.compactExportHeadingRow || false;
  const verticalOffsetFactor = settings.compactVerticalOffsetFactor ?? 0.10;
  const horizontalStackVerticalOffsetFactor =
    settings.compactHorizontalStackVerticalOffsetFactor ?? verticalOffsetFactor;
  const rowShiftFactor = settings.compactRowShiftFactor ?? 0.5;
  const stackProp = settings.compactHorizontalStackProperty;
  const stackQuantities = settings.compactHorizontalStackQuantity || {};

  const exportList = getSortedExportListWithDisplayOrder(deck, cards, settings);

  const missing = exportList.filter(({ card }) => !card).map(({ group }, i) => `Card ${i} in group ${group}`);
  if (missing.length === exportList.length) {
    alert("No cards in the deck could be found in the card list. Cannot export image.");
    return;
  }
  if (missing.length > 0) {
    alert("Warning: Some cards could not be found and will not be included in the export:\n" + missing.join("\n"));
  }
  const filteredExportList = exportList.filter(({ card }) => card);

  const cardImageCache = {};
  await Promise.all(
    filteredExportList.map(async ({ card }) => {
      if (!cardImageCache[card.id]) {
        const url = getCardImageUrl(card, game);
        cardImageCache[card.id] = await loadImage(url);
      }
    })
  );

  // Build outputList with horizontal stacking by property/value
  let outputList = [];
  if (stackProp) {
    const nonHoriz = [];
    const horizGroups = {};
    for (const entry of filteredExportList) {
      const { card, qty } = entry;
      if (card.Orientation === "Horizontal") {
        const propVal = card[stackProp] || "";
        if (!horizGroups[propVal]) horizGroups[propVal] = [];
        for (let i = 0; i < qty; ++i) {
          horizGroups[propVal].push(card);
        }
      } else {
        nonHoriz.push(entry);
      }
    }
    for (const entry of nonHoriz) {
      outputList.push({
        horizontalStack: false,
        ...entry
      });
    }
    for (const [propVal, cardArr] of Object.entries(horizGroups)) {
      const stackQty = stackQuantities[propVal] || 1;
      let i = 0;
      while (i < cardArr.length) {
        const stack = [];
        for (let s = 0; s < stackQty && i < cardArr.length; ++s, ++i) {
          stack.push(cardArr[i]);
        }
        outputList.push({
          horizontalStack: true,
          stackPropValue: propVal,
          cards: stack,
          stackQty: stack.length
        });
      }
    }
  } else {
    for (const entry of filteredExportList) {
      outputList.push({
        horizontalStack: false,
        ...entry
      });
    }
  }

  // Calculate the normal row width for vertical cards
  const normalRowWidth = gridCols * cardWidth + (gridCols + 1) * paddingX;

  // Build rows, starting new row for horizontal stacks if needed
  const rows = [];
  let currentRow = [];
  let currentWidth = paddingX;

  for (const item of outputList) {
    let w;
    if (item.horizontalStack) {
      w = cardHeight;
    } else {
      const c = item.card;
      w = c.Orientation === "Horizontal" ? cardHeight : cardWidth;
    }
    if (
      item.horizontalStack &&
      currentWidth + w > normalRowWidth &&
      currentRow.length > 0
    ) {
      rows.push(currentRow);
      currentRow = [];
      currentWidth = paddingX;
    } else if (!item.horizontalStack && currentRow.length >= gridCols) {
      rows.push(currentRow);
      currentRow = [];
      currentWidth = paddingX;
    }
    currentRow.push(item);
    currentWidth += w + paddingX;
  }
  if (currentRow.length > 0) {
    rows.push(currentRow);
  }

  // Calculate Y start positions for each row
  const yStarts = [];
  let y = labelHeight + paddingY;
  for (let i = 0; i < rows.length; ++i) {
    yStarts.push(y);
    let lowest = 0;
    for (let c = 0; c < rows[i].length; ++c) {
      const item = rows[i][c];
      let h, stackQty, offsetF;
      if (item.horizontalStack) {
        h = cardWidth;
        stackQty = item.stackQty;
        offsetF = horizontalStackVerticalOffsetFactor;
      } else {
        const cc = item.card;
        h = cc.Orientation === "Horizontal" ? cardWidth : cardHeight;
        stackQty = item.qty;
        offsetF = verticalOffsetFactor;
      }
      const verticalCardOffset = Math.round(h * offsetF);
      const bottom = y + (stackQty - 1) * verticalCardOffset + h;
      if (bottom > lowest) lowest = bottom;
    }
    if (i === 0 && headingRow) {
      y += lowest + paddingY;
    } else {
      y = Math.round(lowest - cardHeight * rowShiftFactor);
    }
  }

  // Compute max row width for canvas width
  let maxRowWidth = 0;
  for (const row of rows) {
    let rowWidth = paddingX;
    for (const item of row) {
      let w;
      if (item.horizontalStack) {
        w = cardHeight;
      } else {
        const c = item.card;
        w = c.Orientation === "Horizontal" ? cardHeight : cardWidth;
      }
      rowWidth += w + paddingX;
    }
    if (rowWidth > maxRowWidth) maxRowWidth = rowWidth;
  }

  // Compute bottom of last row to calculate canvas height
  let lastRow = rows.length - 1;
  let lastRowLowest = 0;
  if (lastRow >= 0) {
    const yRow = yStarts[lastRow];
    for (let c = 0; c < rows[lastRow].length; ++c) {
      const item = rows[lastRow][c];
      let h, stackQty, offsetF;
      if (item.horizontalStack) {
        h = cardWidth;
        stackQty = item.stackQty;
        offsetF = horizontalStackVerticalOffsetFactor;
      } else {
        const cc = item.card;
        h = cc.Orientation === "Horizontal" ? cardWidth : cardHeight;
        stackQty = item.qty;
        offsetF = verticalOffsetFactor;
      }
      const verticalCardOffset = Math.round(h * offsetF);
      const bottom = yRow + (stackQty - 1) * verticalCardOffset + h;
      if (bottom > lastRowLowest) lastRowLowest = bottom;
    }
  }

  const width = maxRowWidth;
  const height = Math.round(lastRowLowest + cardHeight * rowShiftFactor + paddingY);

  // Create canvas and scale for device pixel ratio
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

  // Draw cards
  for (let rowIdx = 0; rowIdx < rows.length; ++rowIdx) {
    const row = rows[rowIdx];
    const yRow = yStarts[rowIdx];
    let x = paddingX;
    for (let colIdx = 0; colIdx < row.length; ++colIdx) {
      const item = row[colIdx];
      if (item.horizontalStack) {
        const w = cardHeight, h = cardWidth;
        const stackQty = item.stackQty;
        const stackCards = item.cards;
        const verticalCardOffset = Math.round(h * horizontalStackVerticalOffsetFactor);
        for (let q = 0; q < stackQty; ++q) {
          const y = yRow + q * verticalCardOffset;
          const card = stackCards[q];
          if (card) {
            const img = cardImageCache[card.id];
            ctx.drawImage(img, x, y, w, h);
          }
        }
        x += w + paddingX;
      } else {
        const { card, qty } = item;
        const isHorizontal = card.Orientation === "Horizontal";
        const w = isHorizontal ? cardHeight : cardWidth;
        const h = isHorizontal ? cardWidth : cardHeight;
        const verticalCardOffset = Math.round(h * verticalOffsetFactor);
        const img = cardImageCache[card.id];
        for (let q = 0; q < qty; ++q) {
          const y = yRow + q * verticalCardOffset;
          ctx.drawImage(img, x, y, w, h);
        }
        x += w + paddingX;
      }
    }
  }

  canvas.toBlob(blob => {
    if (!blob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${deckName || "deck"}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }, "image/png");
}

// Export deck as image (regular grid)
export async function exportDeckImage(deck, cards, settings, deckName, game) {
  const cardWidth = 150;
  const cardHeight = 210;
  const gridCols = 5;
  const paddingX = 16;
  const paddingY = 18;
  const labelHeight = 40;

  const exportList = getSortedExportListWithDisplayOrder(deck, cards, settings);

  const missing = exportList.filter(({ card }) => !card).map(({ group }, i) => `Card ${i} in group ${group}`);
  if (missing.length === exportList.length) {
    alert("No cards in the deck could be found in the card list. Cannot export image.");
    return;
  }
  if (missing.length > 0) {
    alert("Warning: Some cards could not be found and will not be included in the export:\n" + missing.join("\n"));
  }
  const filteredExportList = exportList.filter(({ card }) => card);

  const cardImages = await Promise.all(
    filteredExportList.map(({ card }) => loadImage(getCardImageUrl(card, game)))
  );
  const cardDims = filteredExportList.map(({ card }) => {
    const isHorizontal = card.Orientation === "Horizontal";
    return {
      width: isHorizontal ? cardHeight : cardWidth,
      height: isHorizontal ? cardWidth : cardHeight
    };
  });

  const rows = [];
  let cursor = 0;
  while (cursor < filteredExportList.length) {
    const row = filteredExportList.slice(cursor, cursor + gridCols).map((entry, i) => ({
      ...entry,
      width: cardDims[cursor + i].width,
      height: cardDims[cursor + i].height,
      img: cardImages[cursor + i]
    }));
    rows.push(row);
    cursor += gridCols;
  }

  const rowHeights = rows.map(row =>
    Math.max(...row.map(card => card.height))
  );
  const rowWidths = rows.map(row =>
    row.reduce((sum, card) => sum + card.width + paddingX, paddingX)
  );

  const width = Math.max(...rowWidths);
  const height = labelHeight + rowHeights.reduce((sum, h) => sum + h + paddingY, 0) + paddingY;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);

  ctx.font = "bold 28px sans-serif";
  ctx.fillStyle = "#222";
  ctx.textAlign = "left";
  ctx.fillText(deckName || "Deck", paddingX, 32);

  let y = labelHeight + paddingY;
  for (let rowIdx = 0; rowIdx < rows.length; ++rowIdx) {
    const row = rows[rowIdx];
    let x = paddingX;
    for (let colIdx = 0; colIdx < row.length; ++colIdx) {
      const { qty, img, width: w, height: h } = row[colIdx];
      ctx.drawImage(img, x, y, w, h);

      const badgeX = x + 8;
      const badgeY = y + h - 8;
      ctx.save();
      ctx.font = "bold 28px sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "bottom";
      ctx.fillStyle = "rgba(0,0,0,0.7)";
      ctx.fillRect(badgeX - 2, badgeY - 32, 44, 32);
      ctx.fillStyle = "#fff";
      ctx.fillText(`×${qty}`, badgeX, badgeY - 4);
      ctx.restore();

      x += w + paddingX;
    }
    y += rowHeights[rowIdx] + paddingY;
  }

  canvas.toBlob(blob => {
    if (!blob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${deckName || "deck"}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
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