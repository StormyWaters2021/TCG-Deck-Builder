// src/utils/cardsLoader.js
function normalizeSetKey(s) {
    // Accept: "promo", "promo.json", "games/foo/sets/promo.json"
    const str = String(s ?? "").trim();
    const base = str.split("/").pop() || str; // filename
    return base.toLowerCase().endsWith(".json") ?
        base.toLowerCase() :
        `${base.toLowerCase()}.json`;
}

export async function loadCardsForGame(game, onProgress, options = {}) {
    const DATA_BASE =
        "https://raw.githubusercontent.com/StormyWaters2021/TCG-Builder-Data/main";

    const indexRes = await fetch(
        `${DATA_BASE}/games/${game}/setsIndex.json`, {
            cache: "no-store",
        }
    );

    if (!indexRes.ok) {
        throw new Error(
            `[${game}] Failed to load remote sets index: ${indexRes.status}`
        );
    }

    const allFiles = await indexRes.json();

    if (!allFiles.length) {
        throw new Error(
            `[${game}] No set files indexed in the remote data repository.`
        );
    }

    // New name: hiddenSets (game-local filenames)
    const hiddenKeys = new Set((options.hiddenSets || []).map(normalizeSetKey));

    const files = allFiles.filter((relPath) => {
        const fileKey = normalizeSetKey(relPath);
        return !hiddenKeys.has(fileKey);
    });

    if (!files.length) {
        throw new Error(`[${game}] All set files were hidden by settings.`);
    }

    const reqInit = {
        cache: "no-store"
    };
    const total = files.length;
    let done = 0;

    const tick = (relPath) => {
        if (typeof onProgress === "function") onProgress(++done, total, relPath);
    };

    const tasks = files.map(async (relPath) => {
        const url = `${DATA_BASE}/games/${game}/sets/${relPath}`;
        try {
            const res = await fetch(url, reqInit);
            if (!res.ok) {
                tick(relPath);
                return [];
            }
            const json = await res.json();
            tick(relPath);

            if (Array.isArray(json)) return json;
            if (json && Array.isArray(json.cards)) return json.cards;
            return [];
        } catch {
            tick(relPath);
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
    for (const c of collected)
        if (c?.id && !byId.has(c.id)) byId.set(c.id, c);
    return Array.from(byId.values());
}