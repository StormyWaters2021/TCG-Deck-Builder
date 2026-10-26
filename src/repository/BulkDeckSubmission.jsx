import { fetchGameConfig } from "../utils/gameConfigLoader";
import React, { useEffect, useMemo, useState } from "react";
import { repositoryRequest, repositoryWrite } from "./repositoryApi";

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
  const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
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

export default function BulkDeckSubmission({ game, cards, events = [], repositoryConfig = {}, onClose, onPublished }) {
  const [step, setStep] = useState(1);
  const [season, setSeason] = useState("");
  const [eventName, setEventName] = useState("");
  const [previewCards, setPreviewCards] = useState({});
  const [eventDate, setEventDate] = useState("");
  const [links, setLinks] = useState("");
  const [files, setFiles] = useState([]);
  const [decks, setDecks] = useState([]);
  const [errors, setErrors] = useState([]);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const useSeasons = repositoryConfig.features?.seasons === true;
  const seasons = [...new Set(events.map(e=>e.season).filter(Boolean))];
  const availableEvents = [...new Set(events.filter(e=>(!useSeasons || e.season===season) && e.event_name).map(e=>e.event_name))];
  const cardMap = useMemo(()=>new Map(cards.map(c=>[String(c.id),c])),[cards]);
  const numLinks = useMemo(() => splitLinks(links).length, [links]);
  useEffect(() => { const onKey = event => { if (event.key === "Escape" && !busy) onClose(); }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, [busy, onClose]);
  const edit = (index, key, value) => setDecks(prev => prev.map((item, i) => i === index ? { ...item, [key]: value } : item));
  const process = async () => {
    if((useSeasons && (!season.trim()||season==="__new"))||!eventName.trim()||eventName==="__new"){setErrors(["Select or enter a Season and Event before processing."]);return;}
    setBusy(true); setErrors([]);
    const next = []; const failures = [];
    for (const link of splitLinks(links)) {
      try {
        const data = await repositoryWrite("/imports/preview-link", { game, url: link });
        if (!data?.deck_json || !data?.name) throw new Error("The link returned no deck data");
        next.push({ name: data.name, deck_json: data.deck_json, source_type: "link", source_url: link, player_name: "", place: "" });
      } catch (error) { failures.push(`${link}: ${error.message}`); }
    }
    for (const file of files) {
      try { next.push({ ...(await parseOctgn(file, game, cards)), player_name: "", place: "" }); }
      catch (error) { failures.push(error.message); }
    }
    setDecks(next); setErrors(failures); setPreviewCards({}); setExpanded(next.length ? 0 : null); setStep(2); setBusy(false);
  };
  const publish = async () => {
    const invalid = decks.find(d => !d.name.trim() || (d.place !== "" && (!/^[1-9]\d*$/.test(d.place) || !Number.isSafeInteger(Number(d.place)))));
    if (invalid) { setErrors(["Each deck needs a name, and Place must be a positive whole number if provided."]); return; }
    if (errors.length) return;
    setBusy(true);
    try {
      await repositoryWrite("/decks/bulk", { game, season: season.trim(), event_name: eventName.trim(), event_date: eventDate, decks: decks.map(({ name, player_name, place, deck_json, source_type, source_url }) => ({ ...(repositoryConfig.styleDetection ? { style: inferStyle(deck_json,cardMap,repositoryConfig.styleDetection) } : {}), name: name.trim(), player_name: player_name.trim(), place: place === "" ? null : Number(place), deck_json, source_type, ...(source_url ? { source_url } : {}) })) });
      onPublished(); onClose();
    } catch (error) { setErrors([error.message]); }
    finally { setBusy(false); }
  };
  return <div className="repository-submit-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section className="repository-submit-modal" role="dialog" aria-modal="true" aria-labelledby="repository-submit-title">
      <header className="repository-submit-header"><div><h2 id="repository-submit-title">Bulk Submit Decks</h2><small>Step {step} of 2 · {step === 1 ? "Event and sources" : "Review imported decks"}</small></div><button type="button" aria-label="Close" onClick={onClose} disabled={busy}>×</button></header>
      {step === 1 ? <div className="repository-submit-content">
        <h3>Event Information</h3>
        {useSeasons && <><label>Season<select value={seasons.includes(season)?season:season?"__new":""} onChange={e=>{setSeason(e.target.value==="__new"?"__new":e.target.value);setEventName("");}}><option value="">Select season</option>{seasons.map(x=><option key={x} value={x}>{x}</option>)}<option value="__new">+ New Season</option></select></label>
        {season && !seasons.includes(season) && <label>New Season<input value={season==="__new"?"":season} onChange={e=>setSeason(e.target.value||"__new")} placeholder="Season name"/></label>}
        </>}
        <label>Event<select value={availableEvents.includes(eventName)?eventName:eventName?"__new":""} onChange={e=>setEventName(e.target.value==="__new"?"__new":e.target.value)}><option value="">Select event</option>{availableEvents.map(x=><option key={x} value={x}>{x}</option>)}<option value="__new">+ New Event</option></select></label>
        {eventName && !availableEvents.includes(eventName) && <label>New Event<input value={eventName==="__new"?"":eventName} onChange={e=>setEventName(e.target.value||"__new")} placeholder="Event name" /></label> }
        <label>Event Date<input type="date" value={eventDate} onChange={e => setEventDate(e.target.value)} /></label>
        <h3>Deck Links</h3><label>One deck link per line<textarea rows="6" value={links} onChange={e => setLinks(e.target.value)} placeholder={"https://…\nhttps://…"}/></label><small>{numLinks} links entered</small>
        <h3>OCTGN Deck Files</h3><label className="repository-submit-file">Choose multiple .o8d files<input type="file" accept=".o8d" multiple onChange={e => setFiles([...e.target.files])} /></label><small>{files.length ? files.map(f => f.name).join(", ") : "No files selected"}</small>
        <p>You can provide both links and OCTGN files in the same batch.</p>
      </div> : <div className="repository-submit-content">
        <p><strong>{decks.length} deck(s) processed</strong> for {eventName || "Unnamed event"}{eventDate ? ` · ${eventDate}` : ""}</p>
        {decks.map((deck, index) => <section className="repository-submit-deck" key={index}><button className="repository-submit-deck-toggle" type="button" onClick={() => setExpanded(expanded === index ? null : index)}>{expanded === index ? "▾" : "▸"} {deck.name} <small>{deck.source_type === "octgn" ? "OCTGN" : "Link"}</small></button>{expanded === index && <div className="repository-submit-fields"><label>Deck Name<input value={deck.name} onChange={e => edit(index,"name",e.target.value)} /></label><label>Player Name<input value={deck.player_name} onChange={e => edit(index,"player_name",e.target.value)} /></label><label>Place (number only)<input type="number" min="1" step="1" value={deck.place} onChange={e => edit(index,"place",e.target.value)} /></label></div>}
          <button type="button" className="repository-card-preview-toggle" onClick={()=>setPreviewCards(prev=>({...prev,[index]:!prev[index]}))}>{previewCards[index]?"▾ Hide Cards":"▸ View Cards"} ({Object.keys(deck.deck_json?.deck||{}).length})</button>
          {previewCards[index] && <div className="repository-compact-cards">{Object.entries(deck.deck_json?.deck||{}).map(([id,entry])=><div key={id}><strong>{typeof entry==='number'?entry:entry?.count||0}×</strong> {cardMap.get(String(id))?.name||id}</div>)}</div>}
          </section>)}
        {!decks.length && <p>No valid decks were processed. Go back and correct the sources.</p>}
      </div>}
      {!!errors.length && <div className="repository-submit-errors" role="alert"><strong>{errors.length} import or validation issue(s)</strong><ul>{errors.map((message, i) => <li key={i}>{message}</li>)}</ul></div>}
      <footer className="repository-submit-footer"><button type="button" disabled={busy} onClick={step === 1 ? onClose : () => { setStep(1); setErrors([]); }}> {step === 1 ? "Cancel" : "Back"} </button>{step === 1 ? <button type="button" disabled={busy || (!numLinks && !files.length)} onClick={process}>{busy ? "Processing…" : "Process Decks"}</button> : <button type="button" disabled={busy || !decks.length || !!errors.length} onClick={publish}>{busy ? "Publishing…" : `Publish ${decks.length} Deck${decks.length === 1 ? "" : "s"}`}</button>}</footer>
    </section>
  </div>;
}
