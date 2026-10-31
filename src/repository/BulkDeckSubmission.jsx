import { fetchGameConfig } from "../utils/gameConfigLoader";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { repositoryRequest, repositoryWrite } from "./repositoryApi";
import { CSV_FIELDS, CSV_TITLES, parseCsv, exactMapCsvHeaders, autoMapCsvHeaders, csvObjects } from "./repositoryCsvImport";

// Game-specific detection is declarative; games without a styleDetection rule have no style.
export function inferStyle(deckJson, byId, rule) {
  if (!rule || rule.method !== "cardMatch" || !Array.isArray(rule.values)) return "";
  const entries = Object.keys(deckJson?.deck || {});
  const matching = entries.map(id => byId.get(String(id))).find(card => {
    if (!card) return false;
    const raw = String(card[rule.matchProperty] ?? "");
    return rule.matchContains ? raw.toLowerCase().includes(String(rule.matchContains).toLowerCase()) : Boolean(raw);
  });
  if (!matching) return rule.default || "";
  const text = String((rule.valueProperties || []).map(key => matching[key] ?? "").join(" "));
  const found = rule.values.find(value => text.toLowerCase().split(/[^a-z0-9]+/).includes(String(value).toLowerCase()));
  return found || rule.default || "";
}
const splitLinks = value => value.split(/\r?\n/).map(x => x.trim()).filter(Boolean);

async function parseOctgn(file, game, cards) {
  if (!/\.o8d$/i.test(file.name)) throw new Error(`${file.name}: only .o8d files are supported`);
  const document = new DOMParser().parseFromString(await file.text(), "application/xml");
  if (document.querySelector("parsererror") || document.documentElement?.tagName.toLowerCase() !== "deck") throw new Error(`${file.name}: invalid OCTGN XML`);
  const configResponse = await fetchGameConfig(game, "octgn.json");
  if (!configResponse.ok) throw new Error(`${file.name}: cannot verify the OCTGN game`);
  const config = await configResponse.json();
  const expected = config.gameId || config.guid || config.gameGuid;
  const actual = document.documentElement.getAttribute("game") || document.documentElement.getAttribute("gameId") || document.documentElement.getAttribute("id");
  if (!expected || !actual || expected.toLowerCase() !== actual.toLowerCase()) throw new Error(`${file.name}: OCTGN game does not match ${game}`);
  const byId = new Map(cards.map(card => [String(card.id).toLowerCase(), card]));
  const byName = new Map();
  cards.forEach(card => { const key = String(card.name || "").trim().toLowerCase(); if (key && !byName.has(key)) byName.set(key, card); });
  const counts = {};
  const groups = {};
  const missing = [];
  const sectionNodes = [...document.getElementsByTagName("section")];
  for (const section of sectionNodes.length ? sectionNodes : [document.documentElement]) {
    const sectionName = section.getAttribute("name") || "Other";
    for (const node of section.getElementsByTagName("card")) {
      const rawId = node.getAttribute("id") || "";
      const rawName = (node.getAttribute("name") || node.textContent || "").trim();
      const quantity = Number(node.getAttribute("qty") || 1);
      if (!Number.isSafeInteger(quantity) || quantity <= 0) throw new Error(`${file.name}: invalid quantity for ${rawName || rawId}`);
      const card = byId.get(rawId.toLowerCase()) || byName.get(rawName.toLowerCase());
      if (!card) { missing.push(rawName || rawId || "Unknown card"); continue; }
      counts[card.id] = (counts[card.id] || 0) + quantity;
      if (!groups[sectionName]) groups[sectionName] = [];
      groups[sectionName].push({ id: card.id, qty: quantity });
    }
  }
  if (missing.length) throw new Error(`${file.name}: unmatched cards: ${missing.slice(0, 8).join(", ")}${missing.length > 8 ? "…" : ""}`);
  if (!Object.keys(counts).length) throw new Error(`${file.name}: no cards found`);
  return { name: file.name.replace(/\.o8d$/i, ""), deck_json: { deck: counts, groups }, source_type: "octgn" };
}


const equal = (a, b) => String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();
const csvFieldNotes = { deck_url: " (required)", place: " (positive number)", event_date: " (YYYY-MM-DD)" };
const validDate = value => {
  if (!/^(?:19|20)\d{2}-\d{2}-\d{2}$/.test(value || "")) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

export default function BulkDeckSubmission({ game, cards, events = [], seasons = [], repositoryConfig = {}, onClose, onPublished, onCatalogChanged }) {
  const [step, setStep] = useState(1);
  const [seasonId, setSeasonId] = useState("");
  const [eventId, setEventId] = useState("");
  const [catalog, setCatalog] = useState({ seasons, events });
  const [dialog, setDialog] = useState(null);
  const [dialogError, setDialogError] = useState("");
  const [links, setLinks] = useState("");
  const [files, setFiles] = useState([]);
  const [csv, setCsv] = useState(null);
  const [csvMapping, setCsvMapping] = useState([]);
  const [csvFileName, setCsvFileName] = useState("");
  const [decks, setDecks] = useState([]);
  const [errors, setErrors] = useState([]);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [previewCards, setPreviewCards] = useState({});
  const csvInput = useRef(null);
  const useSeasons = repositoryConfig.features?.seasons === true;
  const useFormats = repositoryConfig.features?.formats === true;
  const cardMap = useMemo(() => new Map(cards.map(card => [String(card.id), card])), [cards]);
  const numLinks = useMemo(() => splitLinks(links).length, [links]);
  const selectedSeason = catalog.seasons.find(s => String(s.id) === seasonId);
  const selectedEvent = catalog.events.find(e => String(e.event_id) === eventId);
  const availableEvents = catalog.events.filter(e => !useSeasons || (seasonId && String(e.season_id) === seasonId));

  const loadCatalog = async () => {
    const updated = await repositoryRequest("/events", { game });
    setCatalog({ seasons: updated.seasons || [], events: updated.events || [] });
    onCatalogChanged?.();
    return updated;
  };
  useEffect(() => {
    let active = true;
    repositoryRequest("/events", { game }).then(updated => {
      if (active) setCatalog({ seasons: updated.seasons || [], events: updated.events || [] });
    }).catch(error => { if (active) setErrors([`Cannot load season/event catalog: ${error.message}`]); });
    return () => { active = false; };
  }, [game]);
  useEffect(() => {
    const onKey = event => {
      if (event.key !== "Escape" || busy) return;
      if (dialog) setDialog(null);
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose, dialog]);
  const editDeck = (index, key, value) => setDecks(prev => prev.map((item, i) => i === index ? { ...item, [key]: value } : item));
  const newSeason = () => { setDialogError(""); setDialog({ kind: "season", id: null, name: "", start_date: "" }); };
  const editSeason = () => { setDialogError(""); if (selectedSeason) setDialog({ kind: "season", id: selectedSeason.id, name: selectedSeason.name, start_date: selectedSeason.start_date || "" }); };
  const newEvent = () => {
    if (useSeasons && !selectedSeason) { setErrors(["Select a season before creating an event."]); return; }
    setErrors([]); setDialogError("");
    setDialog({ kind: "event", id: null, season_id: selectedSeason?.id ?? null, name: "", format: "", event_date: "" });
  };
  const editEvent = () => { setDialogError(""); if (selectedEvent) setDialog({ kind: "event", id: selectedEvent.event_id, season_id: selectedEvent.season_id, name: selectedEvent.event_name, format: selectedEvent.format || "", event_date: selectedEvent.event_date || "" }); };
  const saveDialog = async e => {
    e.preventDefault();
    if (!dialog) return;
    if (!dialog.name.trim()) { setDialogError("Name is required."); return; }
    const date = dialog.kind === "season" ? dialog.start_date : dialog.event_date;
    if (!validDate(date)) { setDialogError("Enter a valid date."); return; }
    setBusy(true); setDialogError(""); setErrors([]);
    try {
      const path = dialog.kind === "season" ? "/seasons" : "/events";
      const payload = { ...dialog, game, name: dialog.name.trim(), format: dialog.format?.trim() || "" };
      const response = await repositoryWrite(`${path}/${dialog.id ? "update" : "create"}`, payload);
      const updated = await loadCatalog();
      if (dialog.kind === "season") {
        setSeasonId(String(response.id));
        if (!dialog.id) setEventId("");
      } else {
        const current = updated.events?.find(event => event.event_id === response.id);
        if (current && useSeasons) setSeasonId(String(current.season_id));
        setEventId(String(response.id));
      }
      setDialog(null);
    } catch (error) { setDialogError(error.message); }
    finally { setBusy(false); }
  };
  const handleCsv = async file => {
    setErrors([]); setCsv(null); setCsvMapping([]); setCsvFileName("");
    if (!file) return;
    try {
      if (!/\.csv$/i.test(file.name)) throw new Error("Select a .csv file.");
      if (file.size > 350000) throw new Error("CSV exceeds 350 KB.");
      const parsed = parseCsv(await file.text());
      const exactMapping = exactMapCsvHeaders(parsed.headers);
      const allExact = exactMapping.every(Boolean);
      const mapping = allExact ? exactMapping : autoMapCsvHeaders(parsed.headers, repositoryConfig.csvImport?.columnAliases);
      setCsv(parsed);
      setCsvMapping(mapping);
      setCsvFileName(file.name);
    } catch (error) { setErrors([error.message]); }
  };
  const csvNeedsMapping = Boolean(csv && exactMapCsvHeaders(csv.headers).some(field => !field));
  const resolveEvent = (row, lineNumber) => {
    const seasonName = row.season !== undefined ? row.season : selectedSeason?.name || "";
    if ((useSeasons || Boolean(row.season?.trim())) && !catalog.seasons.some(s => equal(s.name, seasonName))) {
      throw new Error(`Season ${seasonName || "(blank)"} not found. Please add this season and import again.`);
    }
    if (row.event_name === undefined && row.format === undefined && selectedEvent && (!useSeasons || equal(selectedEvent.season, seasonName))) {
      if (!validDate(selectedEvent.event_date)) throw new Error(`Event ${selectedEvent.event_name} has no valid date. Edit the event and import again.`);
      if (row.event_date && row.event_date !== selectedEvent.event_date) throw new Error(`Row ${lineNumber}: Event ${selectedEvent.event_name} date differs from the saved event date. Edit the event and import again.`);
      return selectedEvent;
    }
    const eventName = row.event_name !== undefined ? row.event_name : selectedEvent?.event_name || "";
    let possible = catalog.events.filter(e => equal(e.event_name, eventName) && (!useSeasons && row.season === undefined || equal(e.season, seasonName)));
    if (row.format !== undefined) possible = possible.filter(e => equal(e.format, row.format));
    if (possible.length === 0) throw new Error(`Event ${eventName || "(blank)"} not found. Please add this event and import again.`);
    if (possible.length > 1) throw new Error(`Row ${lineNumber}: Event ${eventName} is ambiguous. Supply a Format column to identify the correct event.`);
    const result = possible[0];
    if (!validDate(result.event_date)) throw new Error(`Event ${result.event_name} has no valid date. Edit the event and import again.`);
    if (row.event_date && row.event_date !== result.event_date) throw new Error(`Row ${lineNumber}: Event ${result.event_name} date differs from the saved event date. Edit the event and import again.`);
    return result;
  };
  const process = async (importCsv = csv, importMapping = csvMapping) => {
    setErrors([]);
    if (useSeasons && !selectedSeason && !importCsv) { setErrors(["Select a season before processing decks."]); return; }
    if (!importCsv && !selectedEvent) { setErrors(["Select an existing event before processing decks."]); return; }
    let csvRows = [];
    try {
      if (importCsv) csvRows = csvObjects(importCsv, importMapping);
      if (csvRows.length + numLinks + files.length > 50) throw new Error("Maximum 50 decks per import. No decks were imported.");
    } catch (error) { setErrors([error.message]); return; }
    setBusy(true);
    const next = [], failures = [];
    const sources = [
      ...splitLinks(links).map(url => ({ deck_url: url, line: "Deck Links", defaultOnly: true })),
      ...csvRows.map((row, i) => ({ ...row, line: i + 2 }))
    ];
    // Process all CSV rows and deck sources without publishing anything yet.
    // A failure in any row disables the final import for the entire batch.
    for (let offset = 0; offset < sources.length; offset += 5) {
      const batch = sources.slice(offset, offset + 5);
      const results = await Promise.all(batch.map(async source => {
        try {
          const event = resolveEvent(source.defaultOnly ? {} : source, source.line);
          const data = await repositoryWrite("/imports/preview-link", { game, url: source.deck_url });
          if (!data?.deck_json || !data?.name) throw new Error("The link returned no deck data");
          if (source.place && (!/^[1-9]\d*$/.test(source.place) || !Number.isSafeInteger(Number(source.place)))) throw new Error("Placement must be a positive whole number");
          return { name: source.name || data.name, player_name: source.player_name || "", place: source.place || "", deck_json: data.deck_json, source_type: "link", source_url: source.deck_url, event_id: event.event_id, event_name: event.event_name, season: event.season, format: event.format, event_date: event.event_date };
        } catch (error) { failures.push(`${source.line === "Deck Links" ? source.deck_url : `CSV row ${source.line}`}: ${error.message}`); return null; }
      }));
      next.push(...results.filter(Boolean));
    }
    for (const file of files) {
      try {
        const event = resolveEvent({}, file.name);
        next.push({ ...(await parseOctgn(file, game, cards)), player_name: "", place: "", event_id: event.event_id, event_name: event.event_name, season: event.season, format: event.format, event_date: event.event_date });
      } catch (error) { failures.push(error.message); }
    }
    setBusy(false);
    if (failures.length) { setErrors(failures); setDecks([]); return; }
    setDecks(next); setPreviewCards({}); setExpanded(next.length ? 0 : null); setStep(2);
  };
  const publish = async () => {
    const invalid = decks.find(d => !d.name.trim() || /^[\s]*[=+@-]/.test(d.name) || /^[\s]*[=+@-]/.test(d.player_name) || (d.place !== "" && (!/^[1-9]\d*$/.test(d.place) || !Number.isSafeInteger(Number(d.place)))));
    if (invalid) { setErrors(["Deck names and player names cannot be spreadsheet formulas; placement must be a positive whole number."]); return; }
    if (errors.length) return;
    setBusy(true);
    try {
      await repositoryWrite("/decks/bulk", {
        game, decks: decks.map(d => ({
          name: d.name.trim(), player_name: d.player_name.trim(), place: d.place === "" ? null : Number(d.place),
          deck_json: d.deck_json, source_type: d.source_type, event_id: d.event_id,
          event_name: d.event_name, season: d.season, format: d.format,
          ...(repositoryConfig.styleDetection ? { style: inferStyle(d.deck_json, cardMap, repositoryConfig.styleDetection) } : {})
        }))
      });
      onPublished(); onClose();
    } catch (error) { setErrors([error.message]); }
    finally { setBusy(false); }
  };
  return <div className="repository-submit-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !busy && !dialog) onClose(); }}>
    <section className="repository-submit-modal" role="dialog" aria-modal="true" aria-labelledby="repository-submit-title">
      <header className="repository-submit-header"><div><h2 id="repository-submit-title">Bulk Submit Decks</h2><small>Step {step} of 2 · {step === 1 ? "Event and sources" : "Review imported decks"}</small></div><button type="button" aria-label="Close" disabled={busy} onClick={onClose}>×</button></header>
      {step === 1 ? <div className="repository-submit-content">
        <h3>Event Information</h3>
        <div className={`repository-submit-catalog-row${useSeasons ? "" : " repository-submit-catalog-row--event-only"}`}>
          {useSeasons && <div className="repository-submit-catalog-field"><label>Season<select value={seasonId} onChange={e => { if (e.target.value === "__new") { newSeason(); return; } setSeasonId(e.target.value); setEventId(""); setErrors([]); }}><option value="">Select season</option>{catalog.seasons.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}<option value="__new">+ New Season</option></select></label><button type="button" className="repository-catalog-edit" title="Edit season" aria-label="Edit selected season" disabled={!selectedSeason || busy} onClick={editSeason}>✎</button></div>}
          <div className="repository-submit-catalog-field"><label>Event<select value={eventId} onChange={e => { if (e.target.value === "__new") { newEvent(); return; } setEventId(e.target.value); setErrors([]); }}><option value="">Select event</option>{availableEvents.map(e => <option key={e.event_id} value={e.event_id}>{e.event_name}{e.format ? ` — ${e.format}` : ""}</option>)}<option value="__new">+ New Event</option></select></label><button type="button" className="repository-catalog-edit" title="Edit event" aria-label="Edit selected event" disabled={!selectedEvent || busy} onClick={editEvent}>✎</button></div>
        </div>
        {selectedEvent && <p className="repository-event-summary">{selectedEvent.event_date}{selectedEvent.format ? ` · ${selectedEvent.format}` : ""}{selectedEvent.season && !useSeasons ? ` · ${selectedEvent.season}` : ""}</p>}
        <h3>Deck Links</h3><label>One deck link per line<textarea rows="3" value={links} onChange={e => setLinks(e.target.value)} placeholder={"https://…\nhttps://…"}/></label><small>{numLinks} links entered</small>
        <h3>OCTGN Deck Files</h3><label className="repository-submit-file">Choose multiple .o8d files<input type="file" accept=".o8d" multiple onChange={e => setFiles([...e.target.files])} /></label>{files.length > 0 && <small>{files.map(f => f.name).join(", ")}</small>}
        <div className="repository-csv-actions">
          <button type="button" className="repository-csv-upload-button" onClick={() => csvInput.current?.click()} disabled={busy}>Bulk Upload CSV</button>
          <span className="repository-csv-help">
            <button type="button" className="repository-csv-help-trigger" aria-label="CSV upload help" aria-describedby="repository-csv-help-text">
              <svg width="20" height="20" viewBox="0 0 22 22" aria-hidden="true"><circle cx="11" cy="11" r="10" fill="none" stroke="currentColor" strokeWidth="2"/><text x="11" y="15" textAnchor="middle" fontSize="13" fontWeight="bold" fill="currentColor" fontFamily="sans-serif" dominantBaseline="middle">?</text></svg>
            </button>
            <span className="repository-csv-help-tip" id="repository-csv-help-text" role="tooltip">
              <span className="repository-csv-help-heading">Upload up to 50 decks in CSV format.</span>
              <ul>{CSV_FIELDS.map(field => <li key={field}>{CSV_TITLES[field]}{csvFieldNotes[field] || ""}</li>)}</ul>
            </span>
          </span>
          <input ref={csvInput} type="file" accept=".csv,text/csv" className="repository-csv-hidden" aria-label="Select CSV file" onChange={e => { handleCsv(e.target.files?.[0]); e.target.value = ""; }} />
        </div>
        {csv && !csvNeedsMapping && <div className="repository-csv-mapper" role="status">
          <strong>CSV Validated</strong> · {csvFileName} · {csv.rows.length} row(s)
          <button type="button" onClick={() => { setCsv(null); setCsvFileName(""); setCsvMapping([]); }}>Remove CSV</button>
        </div>}
        {csvNeedsMapping && <div className="repository-csv-mapper">
          <strong>{csvFileName}</strong> · {csv.rows.length} row(s)
          <p>Some CSV headers do not match exactly. Confirm the suggested assignments for every column before processing.</p>
          <div className="repository-csv-mapping-grid">{csv.headers.map((header, i) =>
            <label key={`${header}-${i}`}>{header}
              <select value={csvMapping[i] || ""} onChange={e => setCsvMapping(prev => prev.map((value, n) => n === i ? e.target.value : value))}>
                <option value="">Ignore</option>
                {CSV_FIELDS.map(field => <option key={field} value={field}>{CSV_TITLES[field]}</option>)}
              </select>
            </label>
          )}</div>
          <button type="button" onClick={() => { setCsv(null); setCsvFileName(""); setCsvMapping([]); }}>Remove CSV</button>
        </div>}

      </div> : <div className="repository-submit-content">
        <p><strong>{decks.length} deck(s) ready</strong> · All events validated · Nothing has been published yet.</p>
        {decks.map((deck, index) => <section className="repository-submit-deck" key={index}><button className="repository-submit-deck-toggle" type="button" onClick={() => setExpanded(expanded === index ? null : index)}>{expanded === index ? "▾" : "▸"} {deck.name} <small>{deck.event_name} · {deck.event_date} · {deck.source_type === "octgn" ? "OCTGN" : "Link"}</small></button>{expanded === index && <div className="repository-submit-fields"><label>Deck Name<input value={deck.name} onChange={e => editDeck(index, "name", e.target.value)} /></label><label>Player Name<input value={deck.player_name} onChange={e => editDeck(index, "player_name", e.target.value)} /></label><label>Place (number only)<input type="number" min="1" step="1" value={deck.place} onChange={e => editDeck(index, "place", e.target.value)} /></label></div>}
          <button type="button" className="repository-card-preview-toggle" onClick={() => setPreviewCards(prev => ({ ...prev, [index]: !prev[index] }))}>{previewCards[index] ? "▾ Hide Cards" : "▸ View Cards"} ({Object.keys(deck.deck_json?.deck || {}).length})</button>
          {previewCards[index] && <div className="repository-compact-cards">{Object.entries(deck.deck_json?.deck || {}).map(([id, entry]) => <div key={id}><strong>{typeof entry === "number" ? entry : entry?.count || 0}×</strong> {cardMap.get(String(id))?.name || id}</div>)}</div>}
        </section>)}
      </div>}
      {!!errors.length && <div className="repository-submit-errors" role="alert"><strong>{errors.length} issue(s) · No decks have been imported</strong><ul>{errors.map((message, i) => <li key={i}>{message}</li>)}</ul></div>}
      <footer className="repository-submit-footer"><button type="button" disabled={busy} onClick={step === 1 ? onClose : () => { setStep(1); setErrors([]); }}>{step === 1 ? "Cancel" : "Back"}</button>{step === 1 ? <button type="button" disabled={busy || (!numLinks && !files.length && !csv)} onClick={() => process()}>{busy ? "Processing…" : "Process Decks"}</button> : <button type="button" disabled={busy || !decks.length || !!errors.length} onClick={publish}>{busy ? "Publishing…" : `Publish All ${decks.length} Deck${decks.length === 1 ? "" : "s"}`}</button>}</footer>
    </section>
    {dialog && <div className="repository-catalog-backdrop" onMouseDown={e => { if (e.target === e.currentTarget && !busy) setDialog(null); }}><form className="repository-catalog-modal" role="dialog" aria-modal="true" aria-labelledby="repository-catalog-title" onSubmit={saveDialog}>
      <h3 id="repository-catalog-title">{dialog.id ? "Edit" : "New"} {dialog.kind === "season" ? "Season" : "Event"}</h3>
      <label>{dialog.kind === "season" ? "Season Name" : "Event Name"}<input autoFocus required maxLength={dialog.kind === "season" ? 150 : 200} value={dialog.name} onChange={e => setDialog(prev => ({ ...prev, name: e.target.value }))} /></label>
      {dialog.kind === "season" ? <label>Start Date<input required type="date" value={dialog.start_date} onChange={e => setDialog(prev => ({ ...prev, start_date: e.target.value }))} /></label> : <>
        {useSeasons && <label>Season<select required value={dialog.season_id || ""} onChange={e => setDialog(prev => ({ ...prev, season_id: Number(e.target.value) }))}><option value="">Select season</option>{catalog.seasons.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>}
        <label>Format<input type="text" maxLength={150} value={dialog.format} onChange={e => setDialog(prev => ({ ...prev, format: e.target.value }))} placeholder="e.g. Standard (optional)" /></label>
        <label>Event Date<input type="date" required value={dialog.event_date} onChange={e => setDialog(prev => ({ ...prev, event_date: e.target.value }))} /></label>
      </>}
      {dialogError && <p role="alert" className="repository-error">{dialogError}</p>}
      <div className="repository-catalog-actions"><button type="button" disabled={busy} onClick={() => { setDialog(null); setErrors([]); }}>Cancel</button><button type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</button></div>
    </form></div>}
  </div>;
}
