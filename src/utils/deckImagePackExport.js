// deckImagePackExport.js

import JSZip from "jszip";
import { getCardImageUrl } from "./deckExportHelpers";

// Helper for concurrency
async function mapWithConcurrency(items, fn, maxConcurrent = 8) {
  const results = [];
  let i = 0;

  async function worker() {
    while (i < items.length) {
      const current = i++;
      results[current] = await fn(items[current], current);
    }
  }
  await Promise.all(Array.from({ length: maxConcurrent }, worker));
  return results;
}

// Fetch octgn.json for the selected game, to get the game GUID.
async function fetchGameGuid(settings) {
  let base = "/";
  if (
    typeof import.meta !== "undefined" &&
    import.meta.env &&
    import.meta.env.BASE_URL
  ) {
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

function buildImageWorkItems(cards) {
  // Flatten cards into image entries:
  // - base image: card.image
  // - alternate images: card.alternates[].image
  const items = [];

  for (const card of cards || []) {
    if (!card) continue;

    if (card.set_id && card.image) {
      items.push({
        set_id: card.set_id,
        image: card.image,
        name: card.name,
        id: card.id,
      });
    }

    if (Array.isArray(card.alternates) && card.set_id) {
      for (const alt of card.alternates) {
        const altImage = alt?.image;
        if (!altImage) continue;

        // Include alt "type" only for nicer missing-image messages
        const suffix = alt?.type ? ` (${alt.type})` : "";
        items.push({
          set_id: card.set_id,
          image: altImage,
          name: `${card.name || "(Unnamed)"}${suffix}`,
          id: card.id,
        });
      }
    }
  }

  return items;
}

/**
 * Export all card images in the game package as an OCTGN .o8c image pack.
 * Includes alternates: card.alternates[].image (if present).
 *
 * @param {Array} cards - Array of card objects for the game (all cards, not just deck)
 * @param {Object} settings - Settings, must include gameName or game
 * @param {string} game - Game name string (for image URLs)
 * @param {string} [filenameOverride] - Optional: override output filename
 * @param {function} [onProgress] - Optional: (completed, total) => void progress callback
 * @param {object} [cancelRef] - Optional: React ref with .current boolean to cancel
 */
export async function exportDeckO8c(
  cards,
  settings,
  game,
  filenameOverride,
  onProgress,
  cancelRef
) {
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

  // Build the list of images to fetch (base + alternates)
  const workItems = buildImageWorkItems(cards);

  if (!workItems.length) {
    alert("No card images found for this game.");
    return;
  }

  const zip = new JSZip();
  const missingImages = [];
  let added = 0;

  // Unique images only; use set_id and image filename as the unique key.
  const seen = new Set();

  let count = 0;
  const total = workItems.length;

  await mapWithConcurrency(
    workItems,
    async (item) => {
      // -- Early cancel check --
      if (cancelRef && cancelRef.current) return;

      if (!item.set_id || !item.image) {
        count++;
        if (onProgress) onProgress(count, total);
        return;
      }

      const key = `${item.set_id}|||${item.image}`;
      if (seen.has(key)) {
        count++;
        if (onProgress) onProgress(count, total);
        return;
      }
      seen.add(key);

      // getCardImageUrl expects a "card-like" object with .image
      const cardLike = { image: item.image };
      const imageUrl = getCardImageUrl(cardLike, game);

      if (!imageUrl) {
        missingImages.push(`No image URL for ${item.name} (${item.id || "no-id"})`);
        count++;
        if (onProgress) onProgress(count, total);
        return;
      }

      try {
        const resp = await fetch(imageUrl, { mode: "cors" });
        if (!resp.ok) throw new Error("Could not fetch image");
        const imgBlob = await resp.blob();

        // Use the image filename exactly as stored (base or alternate)
        const imagePath = `${gameGuid}/Sets/${item.set_id}/Cards/${item.image}`;
        zip.file(imagePath, imgBlob);
        added++;
      } catch (e) {
        missingImages.push(`${item.name} (${item.id || "no-id"})`);
      }

      count++;
      if (onProgress) onProgress(count, total);
    },
    8
  );

  if (cancelRef && cancelRef.current) {
    // Cancelled by user; don't trigger download or alert
    return;
  }

  if (!added) {
    alert("No images could be fetched for this game.");
    return;
  }

  const gameBase = (settings.gameName || settings.game || "images").replace(
    /[^a-zA-Z0-9-_]+/g,
    "_"
  );
  const o8cFilename = filenameOverride || `${gameBase}_image_pack.o8c`;

  const blob = await zip.generateAsync({ type: "blob" });
  downloadBlob(blob, o8cFilename);

  if (missingImages.length) {
    alert(
      `Exported ${added} images, but the following were missing and were not included:\n\n` +
        missingImages.join("\n")
    );
  }
}