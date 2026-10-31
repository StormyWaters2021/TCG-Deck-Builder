// Game-specific JSON loader; existing public links and assets remain unchanged.
// Default to remote game data, retaining the existing website files as fallbacks.
const DATA_ROOT = "https://raw.githubusercontent.com/StormyWaters2021/TCG-Builder-Data/main";
const REMOTE_PREF_KEY = "tcgbuilder-game-config-source";
const REMOTE_BASE_KEY = "tcgbuilder-game-config-base-url";

function remoteDataRoot() {
  try {
    const override = typeof localStorage !== "undefined" ? localStorage.getItem(REMOTE_BASE_KEY) : null;
    // Testing can target an exact commit on the data feature branch; avoid arbitrary hosts.
    if (override && /^https:\/\/raw\.githubusercontent\.com\/StormyWaters2021\/TCG-Builder-Data\/[0-9a-f]{40,64}\/?$/i.test(override)) {
      return override.replace(/\/$/, "");
    }
  } catch { /* Use the normal repository URL. */ }
  return DATA_ROOT;
}

function gameFileUrl(game, filename) {
  const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
  return game === null
    ? `${base}/games/manifest.json`
    : `${base}/games/${encodeURIComponent(game)}/${filename}`;
}

function prefersRemote() {
  try {
    return typeof localStorage === "undefined" || localStorage.getItem(REMOTE_PREF_KEY) !== "local";
  } catch {
    return true; // Use remote-first if browser storage is unavailable.
  }
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// Lightweight structural guards detect wrong-document, incomplete, or mismatched
// remote payloads before the existing application code sees them.
function validConfig(game, filename, value) {
  if (filename === "manifest.json") {
    return isRecord(value) && Array.isArray(value.games) &&
      value.games.every(id => typeof id === "string" && /^[a-z0-9_-]+$/i.test(id));
  }
  if (filename === "settings.json") {
    return isRecord(value) && value.gameName === game;
  }
  if (filename === "deckValidation.json") return isRecord(value);
  if (filename === "octgn.json") {
    return isRecord(value) && [value.gameId, value.guid, value.gameGuid].some(x => typeof x === "string" && x.length > 0) &&
      (value.sections === undefined || Array.isArray(value.sections));
  }
  if (filename === "deckStats.json") return Array.isArray(value);
  if (filename === "repository.json") return isRecord(value) && Array.isArray(value.filters);
  if (filename === "pdfDecklistExport.json") return isRecord(value) && typeof value.templatePdf === "string" && value.templatePdf.length > 0;
  return false;
}

function isMissing(error) { return error?.missing === true; }

async function loadResponse(url, game, filename) {
  const response = await fetch(url, { cache: "no-cache" });
  // Static-site SPA fallbacks can return HTML with HTTP 200 for unknown paths.
  if (response.status === 404 || response.status === 410) {
    const error = new Error(`Missing: ${url}`);
    error.missing = true;
    throw error;
  }
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
  const type = (response.headers.get("content-type") || "").toLowerCase();
  if (type.includes("text/html")) {
    const error = new Error(`Missing JSON (HTML fallback): ${url}`);
    error.missing = true;
    throw error;
  }
  // GitHub raw content can be served as text/plain; validate JSON by parsing it.
  let data;
  try { data = await response.json(); }
  catch {
    const error = new Error(`Invalid JSON: ${url}`);
    error.invalid = true;
    throw error;
  }
  if (!validConfig(game, filename, data)) {
    const error = new Error(`Invalid ${filename} structure: ${url}`);
    error.invalid = true;
    throw error;
  }
  // Return a normal JSON Response to preserve existing callers' .ok/.headers/.json().
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

async function fetchConfig(game, filename, optional = false) {
  const local = gameFileUrl(game, filename);
  const dataRoot = remoteDataRoot();
  const remote = game === null
    ? `${dataRoot}/games/manifest.json`
    : `${dataRoot}/games/${encodeURIComponent(game)}/${filename}`;
  const sources = prefersRemote() ? [remote, local] : [local, remote];
  const failures = [];
  for (const url of sources) {
    try { return await loadResponse(url, game, filename); }
    catch (error) { failures.push(error); }
  }
  // Preserve optional Deck DB config behavior for games without repository.json.
  if (optional && failures.some(isMissing) && failures.every(e => e.missing || !e.invalid)) {
    return new Response(null, { status: 404 });
  }
  throw new Error(`Unable to load ${game === null ? "games/manifest.json" : `${game}/${filename}`} from both sources: ${failures.map(e => e.message).join("; ")}`);
}

export function fetchGameConfig(game, filename, { optional = false } = {}) {
  if (typeof game !== "string" || !/^[a-z0-9_-]+$/i.test(game) ||
      typeof filename !== "string" || !/^(settings|deckValidation|octgn|deckStats|repository|pdfDecklistExport)\.json$/.test(filename)) {
    return Promise.reject(new Error("Invalid game configuration path"));
  }
  return fetchConfig(game, filename, optional);
}

export function fetchGameManifest() {
  return fetchConfig(null, "manifest.json");
}
