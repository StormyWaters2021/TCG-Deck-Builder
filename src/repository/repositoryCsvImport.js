// Header-based CSV importer: data-only, no evaluation or dynamic database fields.
export const CSV_FIELDS = ["deck_url", "name", "player_name", "place", "season", "event_name", "format", "event_date"];

export const CSV_TITLES = {
  deck_url: "Deck Link", name: "Deck Name", player_name: "Player Name", place: "Placement",
  season: "Season", event_name: "Event", format: "Format", event_date: "Event Date"
};

const DEFAULT_ALIASES = {
  deck_url: ["Deck URL", "Deck Link", "URL", "Link", "Deck Share Link"],
  name: ["Deck Name", "Deck", "Title"],
  player_name: ["Player", "Player Name", "Username", "Name"],
  place: ["Place", "Placement", "Rank", "Position"],
  season: ["Season", "Season Name"],
  event_name: ["Event", "Event Name", "Tournament"],
  format: ["Format", "Deck Format"],
  event_date: ["Date", "Event Date"]
};

const normalize = text => String(text ?? "").trim().replace(/[\s_\-./]+/g, "").toLowerCase();

export function parseCsv(text) {
  if (typeof text !== "string" || text.length > 350000) throw new Error("CSV exceeds 350 KB.");
  const rows = [];
  let row = [], cell = "", quoted = false, closedQuote = false;
  const input = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (quoted) {
      if (c === '"' && input[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') { quoted = false; closedQuote = true; }
      else cell += c;
    } else if (c === ',' || c === '\r' || c === '\n') {
      row.push(cell); cell = ""; closedQuote = false;
      if (c !== ',') {
        if (row.some(value => value.trim())) rows.push(row);
        row = [];
        if (c === '\r' && input[i + 1] === '\n') i++;
      }
    } else if (c === '"' && !cell && !closedQuote) {
      quoted = true;
    } else {
      if (closedQuote && c !== ' ' && c !== '\t') throw new Error(`Invalid CSV quotation at character ${i + 1}.`);
      if (c === '"') throw new Error(`Unexpected quotation at character ${i + 1}.`);
      cell += c;
    }
  }
  if (quoted) throw new Error("CSV has an unterminated quoted field.");
  if (cell !== "" || row.length) {
    row.push(cell);
    if (row.some(value => value.trim())) rows.push(row);
  }
  if (rows.length < 2) throw new Error("CSV must contain a header row and at least one deck.");
  const [headers, ...records] = rows;
  if (headers.length > 40) throw new Error("CSV may contain at most 40 columns.");
  if (records.length > 50) throw new Error("CSV may contain at most 50 decks per import. No decks were imported.");
  if (records.some(row => row.length !== headers.length)) throw new Error("CSV rows have different column counts. Check quoting and commas.");
  if (headers.some(header => !header.trim())) throw new Error("CSV has an empty column header.");
  if (headers.length !== new Set(headers.map(normalize)).size) throw new Error("CSV has duplicate column headers.");
  return { headers: headers.map(h => h.trim()), rows: records };
}

export function exactMapCsvHeaders(headers) {
  const assigned = new Set();
  return headers.map(header => {
    const field = CSV_FIELDS.find(key => header === key || header === CSV_TITLES[key]) || "";
    if (!field || assigned.has(field)) return "";
    assigned.add(field);
    return field;
  });
}

export function autoMapCsvHeaders(headers, configAliases = {}) {
  const lookup = new Map();
  for (const field of CSV_FIELDS) {
    const custom = Array.isArray(configAliases?.[field]) ? configAliases[field] : [];
    for (const alias of [field, ...DEFAULT_ALIASES[field], ...custom]) {
      const key = normalize(alias);
      if (key && !lookup.has(key)) lookup.set(key, field);
    }
  }
  const exact = exactMapCsvHeaders(headers);
  const assigned = new Set(exact.filter(Boolean));
  return headers.map((header, index) => {
    if (exact[index]) return exact[index];
    const field = lookup.get(normalize(header)) || "";
    if (!field || assigned.has(field)) return "";
    assigned.add(field);
    return field;
  });
}

export function csvObjects(parsed, mapping) {
  if (!parsed || !Array.isArray(mapping) || mapping.length !== parsed.headers.length) throw new Error("CSV column mapping is incomplete.");
  const selected = mapping.filter(Boolean);
  if (selected.some(field => !CSV_FIELDS.includes(field))) throw new Error("CSV contains an unsupported column assignment.");
  if (new Set(selected).size !== selected.length) throw new Error("The same field is assigned to multiple CSV columns.");
  if (!selected.includes("deck_url")) throw new Error("Assign a CSV column to Deck Link.");
  return parsed.rows.map((row, index) => {
    const data = {};
    mapping.forEach((field, column) => { if (field) data[field] = row[column].trim(); });
    if (!data.deck_url) throw new Error(`Row ${index + 2}: Deck Link is missing.`);
    for (const [key, value] of Object.entries(data)) {
      const limit = key === "deck_url" ? 2000 : key === "event_name" ? 200 : 150;
      if (value.length > limit || /[\x00-\x1f]/.test(value)) throw new Error(`Row ${index + 2}: invalid ${key} value.`);
      if (!["deck_url", "place", "event_date"].includes(key) && /^[\s]*[=+@-]/.test(value)) throw new Error(`Row ${index + 2}: ${key} starts with a spreadsheet formula character.`);
    }
    return data;
  });
}
