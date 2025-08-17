// src/utils/cardsLoader.js
export async function loadCardsForGame(game) {
  const setsIndex = (await import("../generated/setsIndex.json")).default ?? {};
  const base = import.meta.env.BASE_URL ?? "/";
  const entries = setsIndex[game] || [];

  if (!entries.length) {
    throw new Error(
      `[${game}] No set files indexed. Expected public/games/${game}/sets/*.json and setsIndex.json to include them.`
    );
  }

  const collected = [];
  for (const relPath of entries) {
    try {
      const res = await fetch(`${base}${relPath}`, { cache: "no-store" });
      if (!res.ok) {
        console.warn(`Failed to load set file: ${relPath} (${res.status})`);
        continue;
      }
      const json = await res.json();
      if (Array.isArray(json)) collected.push(...json);
      else if (json && Array.isArray(json.cards)) collected.push(...json.cards);
      else console.warn(`Unexpected JSON shape in ${relPath}; expected array or { cards: [] }`);
    } catch (e) {
      console.warn(`Error loading ${relPath}:`, e);
    }
  }

  if (!collected.length) {
    throw new Error(
      `[${game}] Set files were found but produced 0 cards. Check JSON content and shapes.`
    );
  }

  // De-dup by id (first wins)
  const byId = new Map();
  for (const c of collected) if (c?.id && !byId.has(c.id)) byId.set(c.id, c);
  return Array.from(byId.values());
}
