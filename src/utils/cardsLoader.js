// src/utils/cardsLoader.js
export async function loadCardsForGame(game, onProgress) {
  const setsIndex = (await import("../generated/setsIndex.json")).default ?? {};
  const base = import.meta.env.BASE_URL ?? "/";
  const files = setsIndex[game] || [];

  if (!files.length) {
    throw new Error(
      `[${game}] No set files indexed. Expected public/games/${game}/sets/*.json and setsIndex.json to include them.`
    );
  }

  const isDev = !!(import.meta?.env?.DEV);
  const reqInit = isDev ? { cache: "no-store" } : {}; // cache in prod
  const total = files.length;
  let done = 0;

  const tasks = files.map(async (relPath) => {
    const url = `${base}${relPath}`;
    try {
      const res = await fetch(url, reqInit);
      if (!res.ok) return [];
      const json = await res.json();
      if (typeof onProgress === "function") onProgress(++done, total, relPath);

      if (Array.isArray(json)) return json;
      if (json && Array.isArray(json.cards)) return json.cards;
      return [];
    } catch {
      if (typeof onProgress === "function") onProgress(++done, total, relPath);
      return [];
    }
  });

  const arrays = await Promise.all(tasks);
  const collected = arrays.flat();

  if (!collected.length) {
    throw new Error(
      `[${game}] Set files were found but produced 0 cards. Check JSON content and shapes.`
    );
  }

  const byId = new Map();
  for (const c of collected) if (c?.id && !byId.has(c.id)) byId.set(c.id, c);
  return Array.from(byId.values());
}
