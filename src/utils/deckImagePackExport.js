// deckImagePackExport.js

import JSZip from "jszip";
import { getCardImageUrl } from "./deckExportHelpers";

// Fetch octgn.json for the selected game, to get the game GUID.
async function fetchGameGuid(settings) {
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
    alert("OCTGN settings not found or invalid.\nTried: " + octgnJsonUrl);
    throw e;
  }
  if (!octgnSettings.gameGuid) {
    alert("OCTGN settings missing gameGuid!");
    throw new Error("Missing gameGuid in octgn.json");
  }
  return octgnSettings.gameGuid;
}

// Download a blob with a given filename
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/**
 * Export all card images in the game package as an OCTGN .o8c image pack.
 * @param {Array} cards - Array of card objects for the game (all cards, not just deck)
 * @param {Object} settings - Settings, must include gameName or game
 * @param {string} game - Game name string (for image URLs)
 * @param {string} [filenameOverride] - Optional: override output filename
 */
export async function exportDeckO8c(cards, settings, game, filenameOverride) {
  if (!cards || !cards.length) {
    alert("No cards found for this game.");
    return;
  }

  let gameGuid;
  try {
    gameGuid = await fetchGameGuid(settings);
  } catch (e) {
    return; // already alerted
  }

  const zip = new JSZip();
  const missingImages = [];
  let added = 0;

  // We want unique images only, but some games have dupes.
  // We'll use set_id and image filename as the unique key.
  // Optionally, you could use GUID+set_id for extra safety.
  const seen = new Set();

  await Promise.all(cards.map(async card => {
  console.log("Trying card:", card.name, "set_id:", card.set_id, "image:", card.image);

  if (!card.set_id || !card.image) {
    console.log("Skipping (missing set_id or image):", card && card.name);
    return;
  }

    const key = `${card.set_id}|||${card.image}`;
    if (seen.has(key)) return;
    seen.add(key);

    const imageUrl = getCardImageUrl(card, game);
    if (!imageUrl) {
      missingImages.push(`No image URL for ${card.name} (${card.id})`);
      return;
    }

    try {
      const resp = await fetch(imageUrl, { mode: "cors" });
      if (!resp.ok) throw new Error("Could not fetch image");
      const imgBlob = await resp.blob();

      // Use the card.image name exactly as in CardPreview
      const imagePath = `${gameGuid}/Sets/${card.set_id}/Cards/${card.image}`;
      zip.file(imagePath, imgBlob);
      added++;
    } catch (e) {
      missingImages.push(`${card.name} (${card.id})`);
    }
  }));

  if (!added) {
    alert("No images could be fetched for this game.");
    return;
  }

  const gameBase = (settings.gameName || settings.game || "images").replace(/[^a-zA-Z0-9-_]+/g, "_");
const o8cFilename = `${gameBase}_image_pack.o8c`;

  const blob = await zip.generateAsync({ type: "blob" });
  downloadBlob(blob, o8cFilename);

  if (missingImages.length) {
    alert(
      `Exported ${added} images, but the following cards were missing images and were not included:\n\n` +
      missingImages.join("\n")
    );
  }
}
