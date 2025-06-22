import React, { useState, useEffect, useRef } from "react";
import CardPreview from "../components/CardPreview";

// --- Group deck helper (matches DeckPanel) ---
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

// Helper to get sorted group names (matches DeckPanel)
function getSortedGroupNames(groupedObj, groupOrder) {
  const groupNames = Object.keys(groupedObj);
  const inOrder = groupOrder.filter(name => groupNames.includes(name));
  const remaining = groupNames.filter(name => !groupOrder.includes(name)).sort();
  return [...inOrder, ...remaining];
}

// Helper to flatten sorted/grouped deck for export
function getSortedExportList(deck, cards, settings) {
  const groupBy = settings.groupOptions?.[0] || "Type";
  const FALLBACK_GROUP_ORDER = ["Creatures", "Spells", "Lands", "Other"];
  const groupOrder = Array.isArray(settings.groupOrder) ? settings.groupOrder : FALLBACK_GROUP_ORDER;
  const grouped = groupDeck(deck, cards, groupBy);
  const sortedGroups = getSortedGroupNames(grouped, groupOrder);
  const exportList = [];
  for (const group of sortedGroups) {
    for (const { card, qty } of grouped[group]) {
      exportList.push({ card, qty, group });
    }
  }
  return exportList;
}

// Helper to load an image and return a promise
function loadImage(url) {
  return new Promise((resolve, reject) => {
    if (!url) return reject(new Error("No image URL"));
    const img = new window.Image();
    // Only set crossOrigin if needed (e.g. external domains with CORS headers)
	img.crossOrigin = "anonymous"; // <-- try commenting this out!
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
}

// Use CardPreview logic for card images
export function getCardImageUrl(card, game) {
  if (!card || !card.image) return null;
  // Point directly to R2-served path
  return `https://tcgbuilder.net/images/${game}/${card.image}`;
}

// --- Encode: group indexes by quantity for ultra-short links ---
function encodeDeck(deck, cards, settings) {
  const exportList = getSortedExportList(deck, cards, settings);
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

// --- Export deck as image, compact grid, DeckPanel sort/group logic ---
async function exportDeckImageCompact(deck, cards, settings, deckName, game) {
  // --- Layout constants (matches DeckPanel/grid) ---
  const cardWidth = 180;
  const cardHeight = 252;
  const gridCols = 5;
  const paddingX = 18;
  const paddingY = 20;
  const labelHeight = 46;
  const verticalOffsetFactor = 0.10; // 10% overlap for stacks
  const rowShiftFactor = 0.5; // 50% row overlap
  const dpr = 2; // high-DPI export

  // --- Sorted/grouped export list ---
  const exportList = getSortedExportList(deck, cards, settings);

  // Warn on missing cards
  const missing = exportList.filter(({ card }) => !card).map(({ group }, i) => `Card ${i} in group ${group}`);
  if (missing.length === exportList.length) {
    alert("No cards in the deck could be found in the card list. Cannot export image.");
    return;
  }
  if (missing.length > 0) {
    alert("Warning: Some cards could not be found and will not be included in the export:\n" + missing.join("\n"));
  }
  const filteredExportList = exportList.filter(({ card }) => card);

  // Preload images
  const cardImageCache = {};
  await Promise.all(
    filteredExportList.map(async ({ card }) => {
      if (!cardImageCache[card.id]) {
        const url = getCardImageUrl(card, game);
        cardImageCache[card.id] = await loadImage(url);
      }
    })
  );

  // --- Build rows with stacking ---
  const rows = [];
  let cursor = 0;
  while (cursor < filteredExportList.length) {
    rows.push(filteredExportList.slice(cursor, cursor + gridCols));
    cursor += gridCols;
  }

  // Precompute y start for each row (each row covers half the lowest stack from the previous row)
  const yStarts = [];
  let y = labelHeight + paddingY;
  for (let i = 0; i < rows.length; ++i) {
    yStarts.push(y);
    // Find the lowest bottom for this row
    let lowest = 0;
    for (let c = 0; c < rows[i].length; ++c) {
      const { card, qty } = rows[i][c];
      const isHorizontal = card.Orientation === "Horizontal";
      const w = isHorizontal ? cardHeight : cardWidth;
      const h = isHorizontal ? cardWidth : cardHeight;
      const verticalCardOffset = Math.round(h * verticalOffsetFactor);
      const bottom = y + (qty - 1) * verticalCardOffset + h;
      if (bottom > lowest) lowest = bottom;
    }
    // Next row starts halfway down the lowest stack of that row (using "vertical" cardHeight as in DeckPanel)
    y = Math.round(lowest - cardHeight * rowShiftFactor);
  }

  // --- Compute canvas size (max row width, total height) ---
  let maxRowWidth = 0;
  for (const row of rows) {
    let rowWidth = paddingX;
    for (const { card } of row) {
      const isHorizontal = card.Orientation === "Horizontal";
      rowWidth += (isHorizontal ? cardHeight : cardWidth) + paddingX;
    }
    if (rowWidth > maxRowWidth) maxRowWidth = rowWidth;
  }
  let lastRow = rows.length - 1;
  let lastRowLowest = 0;
  if (lastRow >= 0) {
    const yRow = yStarts[lastRow];
    for (let c = 0; c < rows[lastRow].length; ++c) {
      const { card, qty } = rows[lastRow][c];
      const isHorizontal = card.Orientation === "Horizontal";
      const h = isHorizontal ? cardWidth : cardHeight;
      const verticalCardOffset = Math.round(h * verticalOffsetFactor);
      const bottom = yRow + (qty - 1) * verticalCardOffset + h;
      if (bottom > lastRowLowest) lastRowLowest = bottom;
    }
  }
  const width = maxRowWidth;
  const height = Math.round(lastRowLowest + cardHeight * rowShiftFactor + paddingY);

  // --- Create and draw on high-DPI canvas ---
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

  // Draw all cards, row by row, stacking as requested
  for (let rowIdx = 0; rowIdx < rows.length; ++rowIdx) {
    const row = rows[rowIdx];
    const yRow = yStarts[rowIdx];
    let x = paddingX;
    for (let colIdx = 0; colIdx < row.length; ++colIdx) {
      const { card, qty } = row[colIdx];
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

  // Export as regular-DPI PNG
  canvas.toBlob(blob => {
    if (!blob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${deckName || "deck"}-compact.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }, "image/png");
}

// --- Export deck as image card grid (classic, ordered, with badges, now same sorting) ---
async function exportDeckImage(deck, cards, settings, deckName, game) {
  const cardWidth = 150;
  const cardHeight = 210;
  const gridCols = 5;
  const paddingX = 16;
  const paddingY = 18;
  const labelHeight = 40;

  // --- Sorted/grouped export list ---
  const exportList = getSortedExportList(deck, cards, settings);

  // Warn on missing cards
  const missing = exportList.filter(({ card }) => !card).map(({ group }, i) => `Card ${i} in group ${group}`);
  if (missing.length === exportList.length) {
    alert("No cards in the deck could be found in the card list. Cannot export image.");
    return;
  }
  if (missing.length > 0) {
    alert("Warning: Some cards could not be found and will not be included in the export:\n" + missing.join("\n"));
  }
  const filteredExportList = exportList.filter(({ card }) => card);

  // Preload images and get per-card w/h
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

  // Compute per-row height/width (since cards can be horizontal)
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

  // Per-row max height for layout
  const rowHeights = rows.map(row =>
    Math.max(...row.map(card => card.height))
  );
  const rowWidths = rows.map(row =>
    row.reduce((sum, card) => sum + card.width + paddingX, paddingX)
  );

  // Canvas size
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

  // Draw cards
  let y = labelHeight + paddingY;
  for (let rowIdx = 0; rowIdx < rows.length; ++rowIdx) {
    const row = rows[rowIdx];
    let x = paddingX;
    for (let colIdx = 0; colIdx < row.length; ++colIdx) {
      const { qty, img, width: w, height: h } = row[colIdx];
      ctx.drawImage(img, x, y, w, h);

      // Quantity badge
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


// --- OCTGN Export (async, fetches octgn.json, robust path) ---
async function exportDeckOCTGN(deck, cards, settings, deckName) {
  // Determine the base path (handles dev/prod, base URL, and gameName with spaces)
  let base = "/";
  if (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.BASE_URL) {
    base = import.meta.env.BASE_URL;
    if (!base.endsWith("/")) base += "/";
  }
  // Prefer settings.gameName if present, fallback to settings.game
  const gameName = settings.gameName || settings.game || "";
  // Encode each segment for spaces and special chars
  const gameSegment = encodeURIComponent(gameName);
  // Try both encoded and unencoded for compatibility
  let octgnJsonUrl = `${base}games/${gameSegment}/octgn.json`;

  // Fallback: if fetch 404s, try using unencoded gameName (for older dev setups)
  let octgnSettings;
  try {
    let resp = await fetch(octgnJsonUrl);
    if (!resp.ok) {
      // Try with raw gameName (unencoded, may work in dev)
      octgnJsonUrl = `${base}games/${gameName}/octgn.json`;
      resp = await fetch(octgnJsonUrl);
    }
    octgnSettings = await resp.json();
  } catch (e) {
    alert("OCTGN export settings not found or invalid.\nTried: " + octgnJsonUrl);
    return;
  }

  const cardEntries = Object.entries(deck)
    .filter(([, qty]) => qty > 0)
    .map(([cardId, qty]) => {
      const card = cards.find(c => c.id === cardId);
      return { card, qty };
    });

  // Set up section map
  const sectionMap = {};
  for (const section of octgnSettings.sections) {
    sectionMap[section.name] = [];
  }
  // Ensure the default section exists
  if (octgnSettings.defaultSection && !(octgnSettings.defaultSection in sectionMap)) {
    sectionMap[octgnSettings.defaultSection] = [];
  }

  for (const {card, qty} of cardEntries) {
    let placed = false;
    for (const section of octgnSettings.sections) {
      let match = false;
      if (section.criteria) {
        for (const [prop, values] of Object.entries(section.criteria)) {
          // Support array or string card properties
          const cardPropVal = card[prop];
          if (Array.isArray(cardPropVal)) {
            if (cardPropVal.some(val => values.includes(val))) {
              match = true;
              break;
            }
          } else {
            if (values.includes(cardPropVal)) {
              match = true;
              break;
            }
          }
        }
      }
      if (match) {
        sectionMap[section.name].push({ card, qty });
        placed = true;
        break;
      }
    }
    // If not placed by criteria, add to default section
    if (!placed && octgnSettings.defaultSection && sectionMap[octgnSettings.defaultSection]) {
      sectionMap[octgnSettings.defaultSection].push({ card, qty });
    }
  }

  let sectionsXml = "";
  // Output all sections, including default if it has cards
  for (const sectionName in sectionMap) {
    // Find section details for this name, fallback to empty object for default section if not in sections list
    const section = octgnSettings.sections.find(s => s.name === sectionName) || { name: sectionName, shared: false };
    const cardsXml = sectionMap[sectionName].map(({ card, qty }) =>
      `    <card qty="${qty}" id="${card.id}">${card.name}</card>`
    ).join("\n");
    // If no cards, use self-closing section tag
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

  // Download file
  const blob = new Blob([xml], { type: "application/xml" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${deckName || "deck"}.o8d`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}


function DeckControls({ deck, cards, settings, game, setDeck, selectedCard, setGame }) {
  const [deckName, setDeckName] = useState("");
  const [savedDecks, setSavedDecks] = useState(() =>
    JSON.parse(localStorage.getItem(`${game}-decks`) || "[]")
  );
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const exportMenuRef = useRef(null);
  const [linkMessage, setLinkMessage] = useState("");

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

  const [selectedDeckIdx, setSelectedDeckIdx] = useState(null);

  function saveDeck() {
  if (!deckName) {
    alert("Please enter a deck name.");
    return;
  }
  // Check if the name already exists
  const existingIdx = savedDecks.findIndex(d => d.name === deckName);
  if (existingIdx !== -1) {
    const choice = window.confirm(
      `A deck named "${deckName}" already exists. Click OK to overwrite, or Cancel to rename.`
    );
    if (choice) {
      // Overwrite
      const newDecks = savedDecks.map((d, i) =>
        i === existingIdx ? { name: deckName, deck } : d
      );
      setSavedDecks(newDecks);
      localStorage.setItem(`${game}-decks`, JSON.stringify(newDecks));
      alert("Deck overwritten.");
    } else {
      // Rename
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
    // Save as new
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
      // Use sorted export list
      const exportList = getSortedExportList(deck, cards, settings);
      let txt = `Deck: ${deckName}\n`;
      for (const { card, qty } of exportList) {
        txt += `${card ? card.name : "Unknown"} x${qty}\n`;
      }
      downloadFile(txt, `${deckName || "deck"}.txt`, "text/plain");
    } else if (format === "JSON") {
      // Use sorted export list
      const exportList = getSortedExportList(deck, cards, settings);
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
      exportDeckOCTGN(deck, cards, settings, deckName);
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
          // Use the attribute for name if present, fallback to textContent
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

  // All color and border-related styles are handled via CSS classes and variables.
  // Please define variables like --main-button-bg, --main-button-color, etc. in styles.css.
  // Example (in styles.css):
  // :root {
  //   --main-button-bg: #2980B9;
  //   --main-button-color: #fff;
  //   --main-button-border: #265dd8;
  //   --dropdown-bg: #fff;
  //   --dropdown-border: #ccc;
  //   --dropdown-hover-bg: #e6f0ff;
  //   --dropdown-hover-color: #111;
  //   --link-message-bg: #fffbe6;
  //   --link-message-color: #222;
  //   --link-message-border: #e6d200;
  //   --list-selected-bg: #eef;
  // }

  const buttonClass = "main-button";
  const dropdownButtonClass = "dropdown-button";
  const dropdownButtonHoverClass = "dropdown-button-hover";
  const deckNameInputClass = "deck-name-input";
  const deckControlsGridClass = "deck-controls-grid";
  const linkMessageClass = "link-message";
  const listSelectedClass = "selected-list-item";

  const selectedCardObj = cards.find(c => c.id === selectedCard);

  const [dropdownHover, setDropdownHover] = useState(null);

  return (
    <section className="deck-controls flex-col-center">
      {/* Button Grid */}
      <div
        className={deckControlsGridClass}
      >
        <input
          type="text"
          placeholder="Deck name"
          value={deckName}
          onChange={e => setDeckName(e.target.value)}
          className={deckNameInputClass}
        />
        <button className={buttonClass} onClick={saveDeck}>Save</button>
        {/* Export Dropdown */}
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
                  dropdownHover === 1
                    ? `${dropdownButtonClass} ${dropdownButtonHoverClass}`
                    : dropdownButtonClass
                }
                onMouseEnter={() => setDropdownHover(1)}
                onMouseLeave={() => setDropdownHover(null)}
                onClick={() => exportDeck("JSON")}
              >
                JSON
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