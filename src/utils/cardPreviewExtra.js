// src/utils/cardPreviewExtra.js
function getByPath(obj, path) {
  if (!obj || !path) return undefined;
  return path.split(".").reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), obj);
}

/**
 * Build an array of { label, value } from the game's settings.
 * Expected settings shape:
 * {
 *   cardPreview: {
 *     properties: ["Set", "Rarity", "Type"],
 *     hideEmpty: true
 *   }
 * }
 */
export function buildCardPreviewProperties(card, settings) {
  const cfg = settings?.cardPreview;
  const props = cfg?.properties;
  if (!Array.isArray(props) || !props.length) return null;

  const hideEmpty = cfg.hideEmpty !== false; // default true
  const lines = [];

  for (const propName of props) {
    const raw = getByPath(card, propName);
    const value = raw == null ? "" : String(raw);
    if (hideEmpty && !value.trim()) continue;
    lines.push({ label: propName, value });
  }

  return lines.length ? lines : null;
}
