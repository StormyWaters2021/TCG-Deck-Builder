// src/utils/deckPrintPDF.js

import jsPDF from "jspdf";
import { getCardImageUrl, loadImage } from "./deckExportHelpers";

/**
 * Export the current deck as a print-ready PDF using mm units.
 *
 * Required settings.print fields:
 *   cardWidthMm      - trimmed card width (mm)
 *   cardHeightMm     - trimmed card height (mm)
 *   horizontalGapMm  - gap between card tiles horizontally (mm)
 *   verticalGapMm    - gap between card tiles vertically (mm)
 *   sideMarginMm     - left/right margin (mm)
 *   topMarginMm      - top margin (mm)
 *   bottomMarginMm   - bottom margin (mm)
 *   cardsPerRow      - number of cards per row
 *   cardsPerColumn   - number of cards per column
 *   paperSize        - "Letter" | "A4" (can extend as needed)
 *
 * Optional:
 *   bleedMm          - extra printed area per side (mm). Defaults to 0.
 *
 * @param {Object} deck - Deck object keyed by card id, e.g. { [id]: { count, ... } }
 * @param {Array} cards - Array of card objects (card database)
 * @param {Object} settings - Game settings, must include a `print` block
 * @param {string} deckName - Name of the deck for filename/title
 * @param {string} game - Game identifier (used for image URLs)
 */
export async function exportDeckPDF(deck, cards, settings, deckName = "deck", game = "") {
  if (!settings || !settings.print) {
    alert("Print settings are not configured for this game.");
    return;
  }

  const print = settings.print;

  const {
    cardWidthMm,
    cardHeightMm,
    horizontalGapMm,
    verticalGapMm,
    sideMarginMm,
    topMarginMm,
    bottomMarginMm,
    cardsPerRow,
    cardsPerColumn,
    paperSize,
    bleedMm = 0
  } = print;

  const missing = [];
  if (cardWidthMm == null) missing.push("cardWidthMm");
  if (cardHeightMm == null) missing.push("cardHeightMm");
  if (horizontalGapMm == null) missing.push("horizontalGapMm");
  if (verticalGapMm == null) missing.push("verticalGapMm");
  if (sideMarginMm == null) missing.push("sideMarginMm");
  if (topMarginMm == null) missing.push("topMarginMm");
  if (bottomMarginMm == null) missing.push("bottomMarginMm");
  if (cardsPerRow == null) missing.push("cardsPerRow");
  if (cardsPerColumn == null) missing.push("cardsPerColumn");
  if (!paperSize) missing.push("paperSize");

  if (missing.length > 0) {
    alert(
      "Print settings are missing required fields:\n" +
        missing.join(", ")
    );
    return;
  }

  const tileWidthMm = cardWidthMm + 2 * bleedMm;
  const tileHeightMm = cardHeightMm + 2 * bleedMm;

  let pdfFormat = "letter";
  let paperWidthMm;
  let paperHeightMm;

  switch (paperSize) {
    case "Letter":
    case "letter":
      pdfFormat = "letter";
      paperWidthMm = 215.9; // 8.5 in
      paperHeightMm = 279.4; // 11 in
      break;
    case "A4":
    case "a4":
      pdfFormat = "a4";
      paperWidthMm = 210;
      paperHeightMm = 297;
      break;
    default:
      pdfFormat = "letter";
      paperWidthMm = 215.9;
      paperHeightMm = 279.4;
      console.warn(
        `Unknown paperSize "${paperSize}", falling back to Letter.`
      );
      break;
  }

  const gridWidthMm =
    sideMarginMm +
    cardsPerRow * tileWidthMm +
    (cardsPerRow - 1) * horizontalGapMm +
    sideMarginMm;

  const gridHeightMm =
    topMarginMm +
    cardsPerColumn * tileHeightMm +
    (cardsPerColumn - 1) * verticalGapMm +
    bottomMarginMm;

  if (gridWidthMm > paperWidthMm || gridHeightMm > paperHeightMm) {
    const msgLines = [
      "Print layout does not fit on the selected paper size.",
      "",
      `Paper size: ${paperSize} (${paperWidthMm.toFixed(1)}mm × ${paperHeightMm.toFixed(1)}mm)`,
      `Grid required: ${gridWidthMm.toFixed(1)}mm × ${gridHeightMm.toFixed(1)}mm`,
      "",
      "Please reduce cardsPerRow/cardsPerColumn, margins, gaps, card size,",
      "or choose a larger paper size/orientation."
    ];
    alert(msgLines.join("\n"));
    return;
  }

  const cardMap = new Map();
  for (const card of cards || []) {
    if (card && card.id) {
      cardMap.set(card.id, card);
    }
  }

  const copies = [];
  for (const [cardId, entry] of Object.entries(deck || {})) {
    const card = cardMap.get(cardId);
    if (!card) {
      console.warn(`Card id "${cardId}" not found in card database; skipping in PDF export.`);
      continue;
    }
    const count =
      entry && (entry.count ?? entry.qty ?? entry.quantity ?? 1);
    for (let i = 0; i < count; i++) {
      copies.push(card);
    }
  }

  if (copies.length === 0) {
    alert("Deck is empty or no cards could be found for PDF export.");
    return;
  }

  const slotsPerPage = cardsPerRow * cardsPerColumn;

  const imageCache = new Map();

  async function getCardImage(card) {
    if (!card || !card.id) return null;
    if (imageCache.has(card.id)) {
      return imageCache.get(card.id);
    }
    try {
      const url = getCardImageUrl(card, game);
      const img = await loadImage(url);
      imageCache.set(card.id, img);
      return img;
    } catch (err) {
      console.error("Failed to load image for card", card, err);
      return null;
    }
  }

  const doc = new jsPDF({
    unit: "mm",
    format: pdfFormat,
    orientation: "portrait"
  });

  let currentPageIndex = 0;

  for (let i = 0; i < copies.length; i++) {
    const card = copies[i];

    const pageIndex = Math.floor(i / slotsPerPage);
    const slotIndexOnPage = i % slotsPerPage;
    const rowIndex = Math.floor(slotIndexOnPage / cardsPerRow);
    const colIndex = slotIndexOnPage % cardsPerRow;

    if (pageIndex !== currentPageIndex) {
      doc.addPage();
      currentPageIndex = pageIndex;
    }

    const img = await getCardImage(card);
if (!img) {
  continue;
}

const xMm =
  sideMarginMm + colIndex * (tileWidthMm + horizontalGapMm);
const yMm =
  topMarginMm + rowIndex * (tileHeightMm + verticalGapMm);

// Decide what image to actually pass to jsPDF.
// Default: use the original image, unmodified.
let imageSource = img;
let imageFormat = "JPEG";

try {
  // If the image is wider than it is tall, treat it as horizontal
  // and rotate it to vertical using an offscreen canvas.
  if (img.width > img.height) {
    const canvas = document.createElement("canvas");
    // When rotating 90°, the canvas dimensions are swapped
    canvas.width = img.height;
    canvas.height = img.width;
    const ctx = canvas.getContext("2d");

    // Move origin to center, rotate, then draw
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(-Math.PI / 2); // 90 degrees counter-clockwise
    ctx.drawImage(img, -img.width / 2, -img.height / 2);

    // Use the rotated image as a JPEG data URL
    imageSource = canvas.toDataURL("image/jpeg", 0.92);
    imageFormat = "JPEG";
  }

  // Now add the (possibly rotated) image into the fixed tile box
  doc.addImage(
    imageSource,
    imageFormat,
    xMm,
    yMm,
    tileWidthMm,
    tileHeightMm
  );
} catch (e) {
  console.warn(
    "addImage failed for card, trying PNG fallback",
    card,
    e
  );
  try {
    doc.addImage(
      imageSource,
      "PNG",
      xMm,
      yMm,
      tileWidthMm,
      tileHeightMm
    );
  } catch (e2) {
    console.error(
      "Failed to add image for card to PDF, leaving slot blank",
      card,
      e2
    );
  }
}

  }

  const safeDeckName =
    (deckName || "deck")
      .toString()
      .trim()
      .replace(/[\\/:*?"<>|]+/g, "_") || "deck";

  const filename = `${safeDeckName}-print.pdf`;

  doc.save(filename);

  alert(
    "PDF generated.\n\n" +
      "When printing, select the correct paper size (" +
      paperSize +
      ") and choose 'Actual Size' or 100% scale to preserve card dimensions."
  );
}
