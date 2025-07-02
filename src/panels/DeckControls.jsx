import React, { useState, useEffect, useRef } from "react";
import CardPreview from "../components/CardPreview";
import { getSortedExportListWithDisplayOrder } from "../utils/deckExportHelpers";

// Helper to display name with subtitle (handles Subtitle and subtitle)
function cardNameWithSubtitle(card, includeSubtitle) {
  if (!card) return "";
  if (!includeSubtitle) return card.name;
  const subtitle = card.Subtitle || card.subtitle;
  if (subtitle && subtitle.trim()) {
    return `${card.name} - ${subtitle}`;
  }
  return card.name;
}

// Helper: alternate printings (must match name and subtitle)
function getAlternatePrintings(card, allCards) {
  if (!card) return [];
  const subtitle = card.Subtitle || card.subtitle || "";
  return allCards.filter(
    c =>
      c.id !== card.id &&
      c.name === card.name &&
      ((c.Subtitle || c.subtitle || "") === subtitle)
  );
}

// Sort cards within a group (DeckPanel logic)
function sortGroup(cards, groupSortConfig, includeSubtitle) {
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

// Group deck by property
function groupDeck(deck, cards, groupBy) {
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

// --- OCTGN grouping logic START ---

// Helper: match a card to a section (octgn criteria)
function cardMatchesSection(card, section) {
  if (!section.criteria) return false;
  return Object.entries(section.criteria).some(([prop, values]) => {
    const cardVal = card[prop];
    if (Array.isArray(values)) {
      if (Array.isArray(cardVal)) {
        return cardVal.some((v) => values.includes(v));
      }
      return values.includes(cardVal);
    }
    return cardVal === values;
  });
}

// Helper: group deck by OCTGN (with drag overrides)
function groupDeckByOctgn(deck, cards, sections, userOverrides) {
  const groups = {};
  sections.forEach((section) => (groups[section.name] = []));
  groups["Ungrouped"] = [];
  Object.entries(deck).forEach(([cardId, qty]) => {
    const card = cards.find((c) => c.id === cardId);
    let group = "Ungrouped";
    if (userOverrides && userOverrides[cardId]) {
      group = userOverrides[cardId];
    } else {
      const match = sections.find((section) => cardMatchesSection(card, section));
      if (match) group = match.name;
    }
    if (!groups[group]) groups[group] = [];
    groups[group].push({ card, qty });
  });
  return groups;
}

// --- OCTGN grouping logic END ---

// --- Helper to encode deck for link sharing ---
function encodeDeck(deck, cards, settings) {
  const exportList = getSortedExportListWithDisplayOrder(deck, cards, settings);
  const uuidToIndex = {};
  cards.forEach(card => uuidToIndex[card.id] = card.index);
  const groups = {};
  for (const { card, qty } of exportList) {
    if (!groups[qty]) groups[qty] = [];
    groups[qty].push(uuidToIndex[card.id]);
  }
  return Object.entries(groups)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([qty, idxs]) => `${qty}:${idxs.sort().join(",")}`)
    .join(";");
}

function decodeDeck(str, cards) {
  const indexToUuid = {};
  cards.forEach(card => indexToUuid[card.index] = card.id);
  const obj = {};
  if (!str) return obj;
  str.split(";").forEach(group => {
    if (!group) return;
    const [qty, idxs] = group.split(":");
    if (!qty || !idxs) return;
    idxs.split(",").forEach(idx => {
      const uuid = indexToUuid[idx];
      if (uuid) obj[uuid] = parseInt(qty, 10);
    });
  });
  return obj;
}

// --- Helper to load an image and return a promise
function loadImage(url) {
  return new Promise((resolve, reject) => {
    if (!url) return reject(new Error("No image URL"));
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
}

export function getCardImageUrl(card, game) {
  if (!card || !card.image) return null;
  return `https://tcgbuilder.net/images/${game}/${card.image}`;
}

// --- Export deck as image (compact grid) ---
async function exportDeckImageCompact(deck, cards, settings, deckName, game) {
  const cardWidth = 180;
  const cardHeight = 252;
  const paddingX = 18;
  const paddingY = 20;
  const labelHeight = 46;
  const dpr = 2;

  // Configurable settings with fallbacks:
  const gridCols = settings.compactExportCols || 5;
  const headingRow = settings.compactExportHeadingRow || false;
  const verticalOffsetFactor = settings.compactVerticalOffsetFactor ?? 0.10;
  // New: allow a different vertical offset for horizontal stacks
  const horizontalStackVerticalOffsetFactor =
    settings.compactHorizontalStackVerticalOffsetFactor ?? verticalOffsetFactor;
  const rowShiftFactor = settings.compactRowShiftFactor ?? 0.5;

  // --- Begin: Horizontal card stacking by property/quantity ---
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

  // --- Build outputList with horizontal stacking by property/value ---
  let outputList = [];
  if (stackProp) {
    // Separate horizontal and non-horizontal entries
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
    // Add non-horizontal cards first
    for (const entry of nonHoriz) {
      outputList.push({
        horizontalStack: false,
        ...entry
      });
    }
    // Then add horizontal stacks so they appear at the bottom
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
    // Original logic: every entry as-is
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
    // If this is a horizontal stack and it would overflow normal row width, start new row
    if (
      item.horizontalStack &&
      currentWidth + w > normalRowWidth &&
      currentRow.length > 0
    ) {
      rows.push(currentRow);
      currentRow = [];
      currentWidth = paddingX;
    }
    // Otherwise, if current row is full (for gridCols), start new row
    else if (!item.horizontalStack && currentRow.length >= gridCols) {
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

  // Background
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);

  // Deck name label
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
        // Draw each card in stack, offset
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

  // Export image blob
  canvas.toBlob(blob => {
    if (!blob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${deckName || "deck"}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }, "image/png");
}

async function exportDeckImage(deck, cards, settings, deckName, game) {
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

async function exportDeckOCTGN(deck, cards, settings, deckName, octgnOverrides, currentGroupBy) {
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
    alert("OCTGN export settings not found or invalid.\nTried: " + octgnJsonUrl);
    return;
  }

  // Helper: match ANY criteria (OR)
  function cardMatchesSection(card, section) {
    if (!section.criteria) return false;
    return Object.entries(section.criteria).some(([prop, values]) => {
      const cardVal = card[prop];
      if (Array.isArray(values)) {
        if (Array.isArray(cardVal)) {
          return cardVal.some((v) => values.includes(v));
        }
        return values.includes(cardVal);
      }
      return cardVal === values;
    });
  }

  // Gather valid section names
  const validSectionNames = new Set(octgnSettings.sections.map(s => s.name));
  const sectionMap = {};
  for (const section of octgnSettings.sections) {
    sectionMap[section.name] = [];
  }
  if (octgnSettings.defaultSection && !(octgnSettings.defaultSection in sectionMap)) {
    sectionMap[octgnSettings.defaultSection] = [];
  }

  // Main assignment logic
  for (const [cardId, qty] of Object.entries(deck)) {
    if (!qty || qty <= 0) continue;
    const card = cards.find(c => c.id === cardId);
    let placed = false;

    // 1. User grouping if available and valid
    if (
      currentGroupBy === "OCTGN" &&
      octgnOverrides &&
      octgnOverrides[cardId] &&
      octgnOverrides[cardId] !== "Ungrouped" &&
      validSectionNames.has(octgnOverrides[cardId])
    ) {
      const sectionName = octgnOverrides[cardId];
      sectionMap[sectionName].push({ card, qty });
      placed = true;
    }

    // 2. Criteria-based fallback
    if (!placed) {
      for (const section of octgnSettings.sections) {
        if (cardMatchesSection(card, section)) {
          sectionMap[section.name].push({ card, qty });
          placed = true;
          break;
        }
      }
      // 3. Default section fallback
      if (!placed && octgnSettings.defaultSection && sectionMap[octgnSettings.defaultSection]) {
        sectionMap[octgnSettings.defaultSection].push({ card, qty });
      }
    }
  }

  let sectionsXml = "";
  for (const sectionName in sectionMap) {
    const section = octgnSettings.sections.find(s => s.name === sectionName) || { name: sectionName, shared: false };
    const cardsXml = sectionMap[sectionName].map(({ card, qty }) =>
      `    <card qty="${qty}" id="${card.id}">${card.name}</card>`
    ).join("\n");
    if (sectionMap[sectionName].length === 0) {
      sectionsXml += `  <section name="${sectionName}" shared="${section.shared ? "True" : "False"}" />\n`;
    } else {
      sectionsXml += `  <section name="${sectionName}" shared="${section.shared ? "True" : "False"}">\n${cardsXml}\n  </section>\n`;
    }
  }

  const xml = `<?xml version="1.0" encoding="utf-8" standalone="yes"?>
<deck game="${octgnSettings.gameGuid}">
${sectionsXml}  <notes><![CDATA[]]></notes>
</deck>
`;

  const blob = new Blob([xml], { type: "application/xml" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${deckName || "deck"}.o8d`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function DeckControls({
  deck,
  cards,
  settings,
  game,
  setDeck,
  selectedCard,
  setGame,
  groupBy,
  octgnOverrides
}) {
  const [deckName, setDeckName] = useState("");
  const [savedDecks, setSavedDecks] = useState(() =>
    JSON.parse(localStorage.getItem(`${game}-decks`) || "[]")
  );
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const exportMenuRef = useRef(null);
  const [linkMessage, setLinkMessage] = useState("");
  const [selectedDeckIdx, setSelectedDeckIdx] = useState(null);
  const [dropdownHover, setDropdownHover] = useState(null);
  // --- NEW: track current groupBy for export ---
  const [currentGroupBy, setCurrentGroupBy] = useState(groupBy || (settings.groupOptions && settings.groupOptions[0]) || "Type");
  useEffect(() => {
    if (groupBy) setCurrentGroupBy(groupBy);
  }, [groupBy]);

  // --- OCTGN sections for grouping if needed ---
  const [octgnSections, setOctgnSections] = useState(null);
  const [panelIgnoreSections, setPanelIgnoreSections] = useState([]);
  useEffect(() => {
    if (currentGroupBy !== "OCTGN" || !settings.octgnExport) {
      setOctgnSections(null);
      setPanelIgnoreSections([]);
      return;
    }
    let cancelled = false;
    async function fetchSections() {
      try {
        let baseUrl = import.meta.env.BASE_URL || "";
        if (baseUrl.endsWith("/")) baseUrl = baseUrl.slice(0, -1);
        const url = `${baseUrl}/games/${settings.gameName}/octgn.json`;
        const resp = await fetch(url);
        if (!resp.ok) throw new Error("OCTGN config not found");
        const json = await resp.json();
        if (!cancelled) {
          setOctgnSections(json.sections || []);
          setPanelIgnoreSections(json.panelIgnoreSections || []);
        }
      } catch {
        if (!cancelled) {
          setOctgnSections([]);
          setPanelIgnoreSections([]);
        }
      }
    }
    fetchSections();
    return () => {
      cancelled = true;
    };
  }, [settings.gameName, settings.octgnExport, currentGroupBy]);

  useEffect(() => {
    let params = new URLSearchParams(window.location.search);
    let urlGame = params.get("game");
    let deckStr = params.get("deck");
    if (!deckStr && window.location.hash.includes("deck=")) {
      deckStr = window.location.hash.split("deck=")[1]?.split("&")[0];
    }
    if (urlGame && typeof setGame === "function" && urlGame !== game) {
      setGame(urlGame);
      return;
    }
    if (deckStr) {
      const loadedDeck = decodeDeck(deckStr, cards);
      if (loadedDeck && typeof loadedDeck === "object") {
        if (Object.keys(deck).length > 0) {
          if (!window.confirm("You are about to load a shared deck. This will overwrite your current progress. Continue?")) {
            params.delete("deck");
            window.history.replaceState({}, "", window.location.pathname + (params.toString() ? "?" + params.toString() : ""));
            return;
          }
        }
        setDeck(loadedDeck);
        setDeckName("");
        params.delete("deck");
        window.history.replaceState({}, "", window.location.pathname + (params.toString() ? "?" + params.toString() : ""));
      }
    }
    // eslint-disable-next-line
  }, [game, cards]);

  useEffect(() => {
    setSavedDecks(JSON.parse(localStorage.getItem(`${game}-decks`) || "[]"));
  }, [game]);

  useEffect(() => {
    function handleClick(event) {
      if (
        exportMenuRef.current &&
        !exportMenuRef.current.contains(event.target)
      ) {
        setExportMenuOpen(false);
      }
    }
    if (exportMenuOpen) {
      document.addEventListener("mousedown", handleClick);
    }
    return () => document.removeEventListener("mousedown", handleClick);
  }, [exportMenuOpen]);

  function saveDeck() {
    if (!deckName) {
      alert("Please enter a deck name.");
      return;
    }
    const existingIdx = savedDecks.findIndex(d => d.name === deckName);
    if (existingIdx !== -1) {
      const choice = window.confirm(
        `A deck named "${deckName}" already exists. Click OK to overwrite, or Cancel to rename.`
      );
      if (choice) {
        const newDecks = savedDecks.map((d, i) =>
          i === existingIdx ? { name: deckName, deck } : d
        );
        setSavedDecks(newDecks);
        localStorage.setItem(`${game}-decks`, JSON.stringify(newDecks));
        alert("Deck overwritten.");
      } else {
        let newName = prompt("Enter a new deck name:", `${deckName} (copy)`);
        if (!newName) return;
        if (savedDecks.some(d => d.name === newName)) {
          alert("A deck with that name already exists. Please choose another name.");
          return;
        }
        const newDecks = [...savedDecks, { name: newName, deck }];
        setDeckName(newName);
        setSavedDecks(newDecks);
        localStorage.setItem(`${game}-decks`, JSON.stringify(newDecks));
        alert("Deck saved with new name.");
      }
    } else {
      const newDecks = [...savedDecks, { name: deckName, deck }];
      setSavedDecks(newDecks);
      localStorage.setItem(`${game}-decks`, JSON.stringify(newDecks));
      alert("Deck saved.");
    }
  }
  function loadDeck(idx) {
    if (!window.confirm(`All current progress will be lost! Do you want to load ${savedDecks[idx].name}?`)) return;
    setDeck(savedDecks[idx].deck);
    setDeckName(savedDecks[idx].name);
  }
  function deleteDeck(idx) {
    if (!window.confirm(`Are you sure you want to delete ${savedDecks[idx].name}?`)) return;
    const newDecks = savedDecks.filter((_, i) => i !== idx);
    setSavedDecks(newDecks);
    localStorage.setItem(`${game}-decks`, JSON.stringify(newDecks));
  }

  async function exportDeck(format) {
    setExportMenuOpen(false);
    if (format === "TXT") {
      // --- Use DeckPanel grouping/sorting logic ---
      const includeSubtitle = !!settings.includeSubtitleInTextExport;
      const groupSorts = settings.groupSort || {};
      // Use the groupBy passed in as prop or internal state
      const groupBySetting = currentGroupBy || (settings.groupOptions && settings.groupOptions[0]) || "Type";
      // For OCTGN, load sections from state (already fetched in effect above)
      const usingOctgn = groupBySetting === "OCTGN" && settings.octgnExport;
      // Build grouped object
      let grouped, groupOrderArr, filteredSections;
      if (usingOctgn && octgnSections) {
        // Exclude ignored sections
        filteredSections = panelIgnoreSections && panelIgnoreSections.length > 0
          ? octgnSections.filter(section => !panelIgnoreSections.includes(section.name))
          : octgnSections;
        grouped = groupDeckByOctgn(deck, cards, filteredSections, octgnOverrides);
        groupOrderArr = [...filteredSections.map(s => s.name), "Ungrouped"];
      } else {
        grouped = groupDeck(deck, cards, groupBySetting);
        const FALLBACK_GROUP_ORDER = ["Creatures", "Spells", "Lands", "Other"];
        const groupOrder = Array.isArray(settings.groupOrder) ? settings.groupOrder : FALLBACK_GROUP_ORDER;
        const groupNames = Object.keys(grouped);
        const inOrder = groupOrder.filter(name => groupNames.includes(name));
        const remaining = groupNames.filter(name => !groupOrder.includes(name)).sort();
        groupOrderArr = [...inOrder, ...remaining];
      }

      // Build output
      let txt = `Deck: ${deckName}`;
groupOrderArr.forEach((group, groupIdx) => {
  const groupCards = grouped[group] || [];
  // Skip empty "Ungrouped" section for OCTGN export
  if (
    usingOctgn &&
    group === "Ungrouped" &&
    (!groupCards || groupCards.length === 0)
  ) {
    return; // skip this group
  }
  // Use DeckPanel sorting logic
  const groupSortConfig = groupSorts[group];
  const sorted = sortGroup(groupCards, groupSortConfig, includeSubtitle);
  const groupTotal = sorted.reduce((sum, { qty }) => sum + qty, 0);
  txt += `\n${group} (${groupTotal})`;
  sorted.forEach(({ card, qty }) => {
    let cardLine = cardNameWithSubtitle(card, includeSubtitle);
    txt += `\n${cardLine} x${qty}`;
  });
  if (groupIdx < groupOrderArr.length - 1) {
    txt += `\n`;
  }
});

      downloadFile(txt, `${deckName || "deck"}.txt`, "text/plain");
    } else if (format === "JSON") {
      const exportList = getSortedExportListWithDisplayOrder(deck, cards, settings);
      const deckObj = {
        name: deckName,
        game,
        deck: exportList.map(({ card, qty }) => {
          if (!card) return null;
          return { ...card, qty };
        }).filter(Boolean)
      };
      downloadFile(JSON.stringify(deckObj, null, 2), `${deckName || "deck"}.json`, "application/json");
    } else if (format === "Image") {
      await exportDeckImage(deck, cards, settings, deckName, game);
    } else if (format === "ImageCompact") {
      await exportDeckImageCompact(deck, cards, settings, deckName, game);
    } else if (format === "OCTGN") {
      await exportDeckOCTGN(deck, cards, settings, deckName, octgnOverrides, currentGroupBy);
    } else if (format === "LINK") {
      const encoded = encodeDeck(deck, cards, settings);
      let url = window.location.origin + window.location.pathname;
      url += `?game=${encodeURIComponent(game)}&deck=${encoded}`;
      navigator.clipboard.writeText(url).then(() => {
        setLinkMessage("Shareable link copied to clipboard!");
        setTimeout(() => setLinkMessage(""), 2000);
      });
    }
  }

  function clearDeck() {
    if (Object.keys(deck).length > 0) {
      if (window.confirm("Are you sure you want to clear the current deck? This cannot be undone.")) {
        setDeck({});
      }
    }
  }

  function importDeck() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json,.o8d,application/xml,text/xml";
    input.onchange = async e => {
      const file = e.target.files[0];
      if (!file) return;

      if (!window.confirm("All current progress will be lost! Importing a deck will overwrite your current deck. Continue?")) {
        return;
      }

      const text = await file.text();
      let importedDeck = {};
      let notFound = [];

      try {
        if (file.name.toLowerCase().endsWith(".json")) {
          const deckObj = JSON.parse(text);
          if (!deckObj.deck) throw new Error("Invalid deck file.");
          if (deckObj.game && deckObj.game !== game) {
            alert(`Deck is for game "${deckObj.game}". Switch to that game to import.`);
            return;
          }
          for (const card of deckObj.deck) {
            importedDeck[card.id] = card.qty;
          }
          setDeck(importedDeck);
          return;
        }
      } catch (e) {}

      if (file.name.toLowerCase().endsWith(".o8d") || text.startsWith('<?xml')) {
        try {
          const parser = new DOMParser();
          const xmlDoc = parser.parseFromString(text, "application/xml");
          const cardNodes = Array.from(xmlDoc.getElementsByTagName("card"));
          importedDeck = {};
          notFound = [];

          for (const node of cardNodes) {
            const id = node.getAttribute("id");
            const qty = parseInt(node.getAttribute("qty"), 10) || 1;
            const name = node.getAttribute("name") || node.textContent.trim();

            let foundCard = id ? cards.find(c => c.id === id) : null;
            if (!foundCard && name) {
              foundCard = cards.find(c => c.name === name);
            }
            if (foundCard) {
              importedDeck[foundCard.id] = (importedDeck[foundCard.id] || 0) + qty;
            } else if (name) {
              notFound.push(name);
            }
          }

          if (Object.keys(importedDeck).length > 0) {
            setDeck(importedDeck);
            if (notFound.length > 0) {
              alert("Some cards could not be matched and were not imported:\n" + notFound.join("\n"));
            }
          } else {
            alert("No cards could be loaded from this deck file.");
          }
          return;
        } catch (e) {
          alert("Failed to parse OCTGN deck file.");
          return;
        }
      }

      alert("Invalid or unsupported deck file.");
    };
    input.click();
  }

  function downloadFile(data, filename, type) {
    let blob;
    if (data instanceof Blob) {
      blob = data;
    } else {
      blob = new Blob([data], { type });
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  const buttonClass = "main-button";
  const dropdownButtonClass = "dropdown-button";
  const dropdownButtonHoverClass = "dropdown-button-hover";
  const deckNameInputClass = "deck-name-input";
  const deckControlsGridClass = "deck-controls-grid";
  const linkMessageClass = "link-message";
  const listSelectedClass = "selected-list-item";

  const selectedCardObj = cards.find(c => c.id === selectedCard);

  return (
    <section className="deck-controls flex-col-center">
      <div className={deckControlsGridClass}>
        <input
          type="text"
          placeholder="Deck name"
          value={deckName}
          onChange={e => setDeckName(e.target.value)}
          className={deckNameInputClass}
        />
        <button className={buttonClass} onClick={saveDeck}>Save</button>
        <div style={{ position: "relative", width: "120px" }} ref={exportMenuRef}>
          <button
            className={buttonClass}
            onClick={() => setExportMenuOpen(open => !open)}
          >
            Export ▼
          </button>
          {exportMenuOpen && (
            <div
              className="dropdown-menu"
              onMouseLeave={() => setExportMenuOpen(false)}
            >
              <button
                className={
                  dropdownHover === 0
                    ? `${dropdownButtonClass} ${dropdownButtonHoverClass}`
                    : dropdownButtonClass
                }
                onMouseEnter={() => setDropdownHover(0)}
                onMouseLeave={() => setDropdownHover(null)}
                onClick={() => exportDeck("TXT")}
              >
                TXT
              </button>
              <button
                className={
                  dropdownHover === 2
                    ? `${dropdownButtonClass} ${dropdownButtonHoverClass}`
                    : dropdownButtonClass
                }
                onMouseEnter={() => setDropdownHover(2)}
                onMouseLeave={() => setDropdownHover(null)}
                onClick={() => exportDeck("Image")}
              >
                Card Images
              </button>
              <button
                className={
                  dropdownHover === 3
                    ? `${dropdownButtonClass} ${dropdownButtonHoverClass}`
                    : dropdownButtonClass
                }
                onMouseEnter={() => setDropdownHover(3)}
                onMouseLeave={() => setDropdownHover(null)}
                onClick={() => exportDeck("ImageCompact")}
              >
                Image Stack
              </button>
              <button
                className={
                  dropdownHover === 4
                    ? `${dropdownButtonClass} ${dropdownButtonHoverClass}`
                    : dropdownButtonClass
                }
                onMouseEnter={() => setDropdownHover(4)}
                onMouseLeave={() => setDropdownHover(null)}
                onClick={() => exportDeck("LINK")}
              >
                Link
              </button>
              {settings.octgnExport && (
                <button
                  className={
                    dropdownHover === 5
                      ? `${dropdownButtonClass} ${dropdownButtonHoverClass}`
                      : dropdownButtonClass
                  }
                  onMouseEnter={() => setDropdownHover(5)}
                  onMouseLeave={() => setDropdownHover(null)}
                  onClick={() => exportDeck("OCTGN")}
                >
                  OCTGN
                </button>
              )}
            </div>
          )}
          {linkMessage && (
            <div className={linkMessageClass}>
              {linkMessage}
            </div>
          )}
        </div>
        <button className={buttonClass} onClick={clearDeck}>Clear</button>
        <button className={buttonClass} onClick={importDeck}>Import</button>
      </div>
      <div style={{ width: "220px", marginBottom: "1em" }}>
        <CardPreview card={selectedCardObj} game={game} />
      </div>
      <div style={{ width: "100%", maxWidth: 500 }}>
        <h3>Saved Decks</h3>
        <ul style={{ listStyle: "none", padding: 0 }}>
          {savedDecks.map((d, i) => (
            <li
              key={i}
              className={selectedDeckIdx === i ? listSelectedClass : ""}
              onClick={() => setSelectedDeckIdx(i)}
              style={{
                display: "flex",
                alignItems: "center",
                padding: "0.25em 0.5em",
                borderRadius: "4px",
                marginBottom: "0.3em",
                cursor: "pointer"
              }}
            >
              <span style={{ flex: 1 }}>{d.name}</span>
              <button className={buttonClass} style={{ width: "60px", height: "1.8em", fontSize: "0.9em", marginRight: "0.3em" }} onClick={e => { e.stopPropagation(); loadDeck(i); }}>Load</button>
              <button className={buttonClass} style={{ width: "60px", height: "1.8em", fontSize: "0.9em" }} onClick={e => { e.stopPropagation(); deleteDeck(i); }}>Delete</button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export default DeckControls;