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
 *   dpi              - target print DPI for images (default 300).
 *   jpegQuality      - JPEG quality 0..1 (default 0.72).
 *
 * @param {Object} deck - Deck object keyed by card id, e.g. { [id]: { count, ... } }
 * @param {Array} cards - Array of card objects (card database)
 * @param {Object} settings - Game settings, must include a `print` block
 * @param {string} deckName - Name of the deck for filename/title
 * @param {string} game - Game identifier (used for image URLs)
 */
export async function exportDeckPDF(
  deck,
  cards,
  settings,
  deckName = "deck",
  game = "",
  orderedEntries = null,
) {
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
    bleedMm = 0,
    dpi: printDpi,
    jpegQuality: printJpegQuality
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

  // ---- TILE + PAGE LAYOUT ----

  // Printed tile size (includes bleed)
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
      `Paper size: ${paperSize} (${paperWidthMm.toFixed(
        1
      )}mm × ${paperHeightMm.toFixed(1)}mm)`,
      `Grid required: ${gridWidthMm.toFixed(
        1
      )}mm × ${gridHeightMm.toFixed(1)}mm`,
      "",
      "Please reduce cardsPerRow/cardsPerColumn, margins, gaps, card size,",
      "or choose a larger paper size/orientation."
    ];
    alert(msgLines.join("\n"));
    return;
  }

  // ---- BUILD THE DECK COPY LIST ----

  const cardMap = new Map();
  for (const card of cards || []) {
    if (card && card.id) {
      cardMap.set(card.id, card);
    }
  }

  const copies = [];

  if (Array.isArray(orderedEntries) && orderedEntries.length > 0) {
    for (const orderedEntry of orderedEntries) {
      const card = cardMap.get(orderedEntry.cardId);

      if (!card) {
        console.warn(
          `Card id "${orderedEntry.cardId}" not found in card database; skipping in PDF export.`,
        );
        continue;
      }

      const quantity =
        Number(
          orderedEntry.quantity ??
            orderedEntry.qty ??
            orderedEntry.count ??
            0,
        ) || 0;

      for (let index = 0; index < quantity; index += 1) {
        copies.push(card);
      }
    }
  } else {
    for (const [cardId, entry] of Object.entries(deck || {})) {
      const card = cardMap.get(cardId);

      if (!card) {
        console.warn(
          `Card id "${cardId}" not found in card database; skipping in PDF export.`,
        );
        continue;
      }

      const count =
        Number(
          entry?.count ??
            entry?.qty ??
            entry?.quantity ??
            1,
        ) || 0;

      for (let index = 0; index < count; index += 1) {
        copies.push(card);
      }
    }
  }

  if (copies.length === 0) {
    alert("Deck is empty or no cards could be found for PDF export.");
    return;
  }

  const slotsPerPage = cardsPerRow * cardsPerColumn;

  // ---- IMAGE PROCESSING / COMPRESSION CONFIG ----

  const MM_PER_INCH = 25.4;
  const TARGET_DPI = printDpi || 300; // you can lower this to ~200 if you want smaller files
  const JPEG_QUALITY = printJpegQuality != null ? printJpegQuality : 0.72;

  // Pixel size for the printed tile at TARGET_DPI
  const targetPxWidth = Math.max(
    1,
    Math.round((tileWidthMm / MM_PER_INCH) * TARGET_DPI)
  );
  const targetPxHeight = Math.max(
    1,
    Math.round((tileHeightMm / MM_PER_INCH) * TARGET_DPI)
  );

  // Cache processed (compressed+scaled) JPEG dataURLs by card id
  const processedImageCache = new Map();

  async function getProcessedCardImage(card) {
    if (!card || !card.id) return null;
    if (processedImageCache.has(card.id)) {
      return processedImageCache.get(card.id);
    }

    try {
      const url = getCardImageUrl(card, game);
      const img = await loadImage(url);

      // ---------------------------------------
      // STEP 1: Rotate EXACTLY like your original code
      // ---------------------------------------

      // baseCanvas = "correctly oriented" version of the card
      const baseCanvas = document.createElement("canvas");
      const baseCtx = baseCanvas.getContext("2d");

      if (img.width > img.height) {
        // Horizontal: swap dimensions and rotate -90 degrees
        baseCanvas.width = img.height;
        baseCanvas.height = img.width;

        baseCtx.translate(baseCanvas.width / 2, baseCanvas.height / 2);
        baseCtx.rotate(-Math.PI / 2); // same as your original exportDeckPDF
        baseCtx.drawImage(img, -img.width / 2, -img.height / 2);
      } else {
        // Vertical (or square): no rotation, just draw as-is
        baseCanvas.width = img.width;
        baseCanvas.height = img.height;
        baseCtx.drawImage(img, 0, 0);
      }

      // ---------------------------------------
      // STEP 2: Scale into a fixed-size tile canvas for compression
      // ---------------------------------------

      const canvas = document.createElement("canvas");
      canvas.width = targetPxWidth;
      canvas.height = targetPxHeight;
      const ctx = canvas.getContext("2d");

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const baseW = baseCanvas.width;
      const baseH = baseCanvas.height;

      // Preserve aspect ratio while fitting into tile
      const scale = Math.min(
        canvas.width / baseW,
        canvas.height / baseH
      );

      const drawW = baseW * scale;
      const drawH = baseH * scale;

      // Center inside the tile
      const dx = (canvas.width - drawW) / 2;
      const dy = (canvas.height - drawH) / 2;

      ctx.drawImage(baseCanvas, dx, dy, drawW, drawH);

      // JPEG compress for smaller file size
      const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);

      processedImageCache.set(card.id, dataUrl);
      return dataUrl;
    } catch (err) {
      console.error("Failed to load/prepare image for card", card, err);
      processedImageCache.set(card.id, null);
      return null;
    }
  }

  // ---- CREATE PDF (WITH COMPRESSION) ----

  const doc = new jsPDF({
    unit: "mm",
    format: pdfFormat,
    orientation: "portrait",
    // jsPDF will apply internal stream compression where possible
    compress: true
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

    const imageSource = await getProcessedCardImage(card);
    if (!imageSource) {
      continue;
    }

    const xMm =
      sideMarginMm + colIndex * (tileWidthMm + horizontalGapMm);
    const yMm =
      topMarginMm + rowIndex * (tileHeightMm + verticalGapMm);

    try {
      // imageSource is always a JPEG dataURL now
      doc.addImage(
        imageSource,
        "JPEG",
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
      `Images are scaled to ~${TARGET_DPI} DPI and compressed as JPEG.\n` +
      "When printing, select the correct paper size (" +
      paperSize +
      ") and choose 'Actual Size' or 100% scale to preserve card dimensions."
  );
}