import BulkDeckSubmission from "./BulkDeckSubmission";
import DeckExportMenu from "../components/DeckExportMenu";
import ImageExportFlow from "../components/ImageExportFlow";
import ProxyPdfExportFlow from "../components/ProxyPdfExportFlow";
import PdfDecklistExportFlow from "../components/PdfDecklistExportFlow";
import { buildDeckTextExport } from "../utils/deckTextExport";
import { exportDeckOCTGN, buildDragonDiceTTSString } from "../utils/deckExportHelpers";
import React, { useEffect, useMemo, useRef, useState } from "react";
import CardPreview from "../components/CardPreview";
import { loadCardsForGame } from "../utils/cardsLoader";
import { repositoryRequest, repositoryWrite } from "./repositoryApi";
import "./repository.css";
import { orderDeckGroups, resolveOctgnSection, flowDeckColumns } from "./deckDisplayLayout";

const PAGE_SIZE = 20;
function cardEntries(deck) {
  const payload = deck?.deck ?? deck?.cards ?? {};
  if (Array.isArray(payload)) return payload.map(x => [String(x.id ?? x.cardId), Number(x.qty ?? x.count ?? 1)]);
  return Object.entries(payload).map(([id, value]) => [id, Number(typeof value === "number" ? value : (value?.count ?? value?.qty ?? 0))]).filter(([, qty]) => qty > 0);
}
function RepositoryTextColumns({ sections, maxColumns, preview, setPreview, openPreview, previewPosition, game }) {
  const containerRef = useRef(null);
  const measureRef = useRef(null);
  const [width, setWidth] = useState(0);
  const [sizes, setSizes] = useState({});
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    if (typeof ResizeObserver === "undefined") { setWidth(node.clientWidth); return; }
    const observer = new ResizeObserver(() => setWidth(node.clientWidth));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const count = Math.max(1, Math.min(maxColumns, width < 580 ? 1 : width < 850 ? 2 : 3));
  useEffect(() => {
    const node = measureRef.current;
    if (!node || !width) return;
    const update = () => {
      const next = {};
      node.querySelectorAll("[data-entry-key]").forEach(row => { next[row.dataset.entryKey] = row.getBoundingClientRect().height; });
      setSizes(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    };
    update();
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(update);
      observer.observe(node);
      return () => observer.disconnect();
    }
  }, [width, count, sections]);
  const groups = sections.map(section => ({ ...section, total: section.items.reduce((sum, item) => sum + item.qty, 0) }));
  const columns = flowDeckColumns(groups, count, sizes, 30, 2);
  const name = item => `${item.card?.name ?? item.id}${item.card?.Subtitle || item.card?.subtitle ? ` — ${item.card.Subtitle ?? item.card.subtitle}` : ""}`;
  return <div className="repository-deck-flow" ref={containerRef} style={{ "--repository-flow-columns": count }}>
    <div className="repository-flow-measure" ref={measureRef} aria-hidden="true">{groups.map(group => <div key={group.name}>{group.items.map(item => <div className="repository-card-entry" data-entry-key={`${group.name}:${item.id}`} key={item.id}><div className="repository-card-name"><span className="repository-card-quantity">{item.qty}×</span><span className="repository-card-label">{name(item)}</span></div></div>)}</div>)}</div>
    <div className="repository-flow-columns">{columns.map((column, index) => <div className="repository-flow-column" key={index}>{column.map((entry, i) => {
      const { id, qty, card } = entry.item;
      return <React.Fragment key={`${entry.group}:${id}`}>
        {(entry.first || i === 0 || entry.group !== column[i - 1].group) && <h3 className="repository-card-section-title">{entry.group}{entry.first ? ` (${entry.total})` : " (continued)"}</h3>}
        <div className="repository-card-entry" onMouseEnter={e => openPreview(id, e.currentTarget)} onMouseLeave={() => setPreview(null)}>
          <button type="button" className="repository-card-name" onClick={e => preview === id ? setPreview(null) : openPreview(id, e.currentTarget)} onFocus={e => { if (preview !== id) openPreview(id, e.currentTarget); }}><span className="repository-card-quantity">{qty}×</span><span className="repository-card-label">{name(entry.item)}</span></button>
          {preview === id && card && <div className="repository-card-hover" style={previewPosition}><button type="button" className="repository-preview-close" aria-label="Close card preview" onClick={() => setPreview(null)}>×</button><CardPreview card={card} game={game} showName={true}/></div>}
        </div>
      </React.Fragment>;
    })}</div>)}</div>
  </div>;
}

function RepositoryPanel({ record, cards, settings, columnConfig, onLoadInBuilder, canSubmit, role, events, repositoryConfig, onChanged }) {
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [editError, setEditError] = useState("");
  const [saving, setSaving] = useState(false);
  const [cardEditText,setCardEditText] = useState("");
  const [mode, setMode] = useState("text");
  const [octgnConfig, setOctgnConfig] = useState(null);
  useEffect(() => {
    let active = true;
    setOctgnConfig(null);
    const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
    fetch(`${base}/games/${encodeURIComponent(record.game)}/octgn.json`).then(r => r.ok && (r.headers.get("content-type") || "").includes("json") ? r.json() : null).then(config => { if (active) setOctgnConfig(config); }).catch(() => {});
    return () => { active = false; };
  }, [record.game]);
  const groupOptions = useMemo(() => {
    const options = [...(settings?.groupOptions || ["Type"])];
    if (!options.includes("Type")) options.unshift("Type");
    if (settings?.octgnExport && !options.includes("OCTGN")) options.push("OCTGN");
    return options;
  }, [settings]);
  const [groupBy, setGroupBy] = useState("Type");
  const [preview, setPreview] = useState(null);
  const [previewPosition,setPreviewPosition] = useState({left:0,top:0});
  const openPreview = (id,element) => {
    const rect=element.getBoundingClientRect();
    const width=Math.min(260,window.innerWidth-24);
    const height=Math.min(430,window.innerHeight-24);
    const left=rect.right+12+width<=window.innerWidth-12 ? rect.right+12 : Math.max(12,rect.left-width-12);
    const top=Math.max(12,Math.min(rect.top,window.innerHeight-height-12));
    setPreviewPosition({left,top});setPreview(id);
  };
  const imageRef = useRef(null);
  const proxyRef = useRef(null);
  const pdfRef = useRef(null);
  const repoDeck = useMemo(() => {
    const raw = record.deck_json?.deck ?? record.deck_json?.cards ?? record.deck_json ?? {};
    const groupById = {};
    Object.entries(record.deck_json?.groups || {}).forEach(([group, list]) => {
      if (Array.isArray(list)) list.forEach(entry => { groupById[String(entry.id)] = group; });
    });
    return Object.fromEntries(Object.entries(raw).map(([id, value]) => {
      const count = Number(typeof value === "number" ? value : (value?.count ?? value?.qty ?? 0));
      const existing = value && typeof value === "object" && !Array.isArray(value) ? value.group : null;
      const group = existing && typeof existing === "object" && !Array.isArray(existing) ? existing :
        groupById[id] ? { [groupById[id]]: count } : { "Life Deck": count };
      return [id, { count, group }];
    }));
  }, [record.deck_json]);
  const deckName = record.name || "Repository Deck";
  const actions = {
    decklistImage: () => imageRef.current?.open(),
    proxyPdf: () => proxyRef.current?.open(),
    decklistPdf: () => pdfRef.current?.open(),
    deckText: () => {
      const text = buildDeckTextExport({ deck: repoDeck, cards, settings, octgnOverrides: {} });
      if (!text.trim()) return window.alert("No valid cards found to export.");
      const blob = new Blob([text], {type: "text/plain;charset=utf-8"});
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url; link.download = `${deckName.replace(/[\\/:*?"<>|]/g, "").trim() || "deck"}.txt`;
      link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
    shareLink: () => navigator.clipboard?.writeText(`${window.location.origin}${window.location.pathname}?page=repository&game=${encodeURIComponent(record.game)}&code=${encodeURIComponent(record.share_code)}`),
    octgn: () => exportDeckOCTGN(repoDeck, cards, settings, deckName, {}, settings.groupOptions?.[0] || "Type", (title, message) => window.alert(`${title}\n${message}`)),
    tabletopSimulator: async () => {
      const value = buildDragonDiceTTSString(repoDeck, cards);
      if (!value) return window.alert("No valid cards found to export.");
      try { await navigator.clipboard.writeText(value); window.alert("Tabletop Simulator export copied to clipboard."); }
      catch { window.prompt("Copy Tabletop Simulator export:", value); }
    },
  };
  const byId = useMemo(() => new Map(cards.map(card => [String(card.id), card])), [cards]);
  const entries = cardEntries(record.deck_json).map(([id, qty]) => ({ id, qty, card: byId.get(String(id)) }));
  const sections = useMemo(() => {
    const grouped = new Map();
    for (const { id, qty, card } of entries) {
      const storedGroup = repoDeck[String(id)]?.group;
      // Imported OCTGN sections are only relevant when explicitly grouping by OCTGN.
      // Property grouping must come from the resolved card, otherwise changing
      // the dropdown appears to do nothing.
      const value = groupBy === "OCTGN"
        ? resolveOctgnSection(card, storedGroup, octgnConfig)
        : (card?.[groupBy] || "Other");
      const group = Array.isArray(value) ? value.join(", ") : String(value);
      if (!grouped.has(group)) grouped.set(group, []);
      grouped.get(group).push({id,qty,card});
    }
    const names = [...grouped.keys()].sort((a, b) => a.localeCompare(b));
    function compareEntries(a,b,config) {
      const fields = config?.by || ["name"];
      for (const field of fields) {
        const av = String(a.card?.[field] ?? "");
        const bv = String(b.card?.[field] ?? "");
        const custom = config?.order?.[field];
        if (Array.isArray(custom)) {
          const ai = custom.indexOf(av), bi = custom.indexOf(bv);
          if (ai !== -1 && bi !== -1 && ai !== bi) return ai-bi;
          if (ai !== -1) return -1;
          if (bi !== -1) return 1;
        }
        const an = parseFloat(av), bn = parseFloat(bv);
        const result = !Number.isNaN(an) && !Number.isNaN(bn) ? an-bn : av.localeCompare(bv);
        if (result) return result;
      }
      return 0;
    }
    const groups = names.map(name => ({name, items: [...grouped.get(name)].sort((a,b) => compareEntries(a,b,settings?.groupSort?.[name]))}));
    return orderDeckGroups(groups, repositoryConfig?.layout?.groupPositions?.[groupBy] || {});
  }, [entries, groupBy, repoDeck, settings, octgnConfig, repositoryConfig]);
  const singleColumnGroups = columnConfig?.singleColumnGroups || [];
  const maxColumns = columnConfig?.maxColumns || 3;
  return <div className="repository-panel">
    <div className="repository-panel-controls"><label>Group by: <select value={groupBy} onChange={e=>setGroupBy(e.target.value)}>{groupOptions.map(option=><option key={option} value={option}>{option}</option>)}</select></label><div className="repository-view-toggle" role="group" aria-label="Deck display"><button type="button" className={mode === "text" ? "repository-selected" : ""} onClick={() => setMode("text")}>Text</button><button type="button" className={mode === "grid" ? "repository-selected" : ""} onClick={() => setMode("grid")}>Grid</button></div></div>
    {mode === "text" ? <RepositoryTextColumns sections={sections} maxColumns={maxColumns} preview={preview} setPreview={setPreview} openPreview={openPreview} previewPosition={previewPosition} game={record.game} /> : sections.map(section=><div className="repository-card-section" key={section.name}>
      <h3 className="repository-card-section-title">{section.name} ({section.items.reduce((sum, item)=>sum+item.qty,0)})</h3>
      <div className="repository-cards-grid">{section.items.map(({id,qty,card}) => <div className="repository-card-entry" key={id} onMouseEnter={e => {openPreview(id,e.currentTarget);}} onMouseLeave={() => setPreview(null)}>
        {card ? <CardPreview card={card} game={record.game} showName={false} quantity={qty} /> : <span>{qty}× {id}</span>}
      </div>)}</div>
    </div>)}
    {!entries.length && <p>No cards in this record.</p>}
    <div className="repository-actionbar">{!cards.length && <small>Card catalog is still loading; exports may be incomplete.</small>}<DeckExportMenu settings={settings} actions={actions} /><button type="button" onClick={() => onLoadInBuilder?.(repoDeck)}>Load in Deck Builder</button>
    {role && <div className="repository-admin-actions"><button type="button" onClick={()=>{setEditForm({name:record.name,player_name:record.player_name||"",season:record.metadata_json?.season||"",event_name:record.event_name||"",event_date:record.event_date||"",place:record.metadata_json?.place??"",style:record.metadata_json?.style||"",deck_json:structuredClone(record.deck_json)});setCardEditText(Object.entries(record.deck_json?.deck||{}).map(([id,value])=>`${id},${typeof value==="number"?value:value?.count||0}`).join("\n"));setEditError("");setEditing(true);}}>Edit</button>{role === "admin" && <button type="button" onClick={async()=>{if(!window.confirm(`Hide ${record.name} from the repository? This can be recovered from D1.`))return;try{await repositoryWrite("/decks/delete",{game:record.game,share_code:record.share_code});onChanged();}catch(error){window.alert(error.message);}}}>Delete</button>}</div>}</div>
    {editing && editForm && <div className="repository-edit-backdrop"><form className="repository-edit-modal" onSubmit={async e=>{e.preventDefault();setSaving(true);setEditError("");try{const revised={};if(role === "admin") for(const line of cardEditText.split(/\r?\n/)){if(!line.trim())continue;const comma=line.lastIndexOf(",");if(comma<1)throw new Error("Each card line must be GUID,quantity");const id=line.slice(0,comma).trim(),qty=Number(line.slice(comma+1).trim());if(!Number.isSafeInteger(qty)||qty<1||qty>99||revised[id])throw new Error("Invalid or duplicated card quantity: "+line);revised[id]=qty;}
      const previous=editForm.deck_json?.deck||{};const deck=Object.fromEntries(Object.entries(revised).map(([id,count])=>{const prior=previous[id];const priorCount=typeof prior==="number"?prior:prior?.count;return [id,priorCount===count?prior:{count,group:{"Life Deck":count}}];}));
      const data={...editForm,game:record.game,share_code:record.share_code,place:editForm.place===""?null:Number(editForm.place)};if(role === "admin")data.deck_json={...editForm.deck_json,deck};else delete data.deck_json;await repositoryWrite("/decks/update",data);setEditing(false);onChanged();}catch(error){setEditError(error.message);}finally{setSaving(false);}}}>
      <h3>Edit Deck</h3>{["name","player_name",...(repositoryConfig?.features?.seasons ? ["season"] : []),"event_name","event_date","place",...(repositoryConfig?.styleDetection ? ["style"] : [])].map(key=><label key={key}>{({name:"Deck Name",player_name:"Player Name",season:"Season",event_name:"Event",event_date:"Date",place:"Place",style:"Style"})[key]}<input type={key==="event_date"?"date":key==="place"?"number":"text"} min={key==="place"?1:undefined} value={editForm[key]} onChange={e=>setEditForm(v=>({...v,[key]:e.target.value}))}/></label>)}
      {role === "admin" && <label>Cards (one per line: GUID,quantity)<textarea rows="7" value={cardEditText} onChange={e=>setCardEditText(e.target.value)}/></label>}
      {editError && <p role="alert" className="repository-error">{editError}</p>}<div className="repository-edit-buttons"><button disabled={saving} type="button" onClick={()=>setEditing(false)}>Cancel</button><button disabled={saving} type="submit">Save Changes</button></div>
    </form></div>}
    <ImageExportFlow ref={imageRef} deck={repoDeck} cards={cards} settings={settings} deckName={deckName} game={record.game} octgnSections={null} octgnDefaultSection={null} panelIgnoreSections={[]} />
    <ProxyPdfExportFlow ref={proxyRef} deck={repoDeck} cards={cards} settings={settings} deckName={deckName} game={record.game} octgnSections={null} octgnDefaultSection={null} panelIgnoreSections={[]} />
    <PdfDecklistExportFlow ref={pdfRef} deck={repoDeck} cards={cards} settings={settings} deckName={deckName} game={record.game} hideTriggerButton />
  </div>;
}
export default function RepositoryPage({ game, activeCardsGame, activeCards, settings, isMobileLayout = false, onBack, onLoadInBuilder, currentUser }) {
  const initialParams = new URLSearchParams(window.location.search);
  const [canSubmit, setCanSubmit] = useState(false);
  const [role, setRole] = useState(null);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [events, setEvents] = useState([]);
  useEffect(() => {
    let active = true; setCanSubmit(false); setRole(null);
    if (currentUser) repositoryRequest("/permissions",{game}).then(result => { if (active) {setCanSubmit(result.canSubmit === true);setRole(result.role||null);} }).catch(() => {});
    return () => { active = false; };
  }, [currentUser,game]);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({});
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState({ decks: [], total: 0 });
  const [expanded, setExpanded] = useState(!initialParams.get("game") || initialParams.get("game") === game ? initialParams.get("code") || null : null);
  const [detail, setDetail] = useState(null);
  const [cards, setCards] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [config, setConfig] = useState([]);
  const [repositoryConfig, setRepositoryConfig] = useState({});
  const [columnConfig, setColumnConfig] = useState({ maxColumns: 3, singleColumnGroups: [] });
  const [configError, setConfigError] = useState("");
  useEffect(() => {
    let active = true;
    setConfig([]);
    setRepositoryConfig({});
    setColumnConfig({ maxColumns: 3, singleColumnGroups: [] });
    setConfigError("");
    setFilters({});
    setPage(1);
    if (!game) return () => { active = false; };
    const base = import.meta.env.BASE_URL || "/";
    const url = `${base.replace(/\/$/, "")}/games/${encodeURIComponent(game)}/repository.json`;
    fetch(url, { cache: "no-cache" })
      .then(async response => {
        if (response.status === 404) return null;
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        // Vite and some static hosts return index.html for unknown paths.
        const contentType = response.headers.get("content-type") || "";
        if (!contentType.toLowerCase().includes("json")) {
          throw new Error("Expected JSON, but server returned another content type (check that repository.json exists).");
        }
        return response.json();
      })
      .then(value => {
        if (!active || value === null) return;
        if (!value || !Array.isArray(value.filters)) throw new Error("repository.json must contain a filters array.");
        const ids = new Set();
        const validated = value.filters.map(field => {
          if (!field || typeof field.id !== "string" || !/^[a-zA-Z0-9_-]+$/.test(field.id) ||
              typeof field.label !== "string" || field.type !== "select" || !Array.isArray(field.options) || ids.has(field.id)) {
            throw new Error("Invalid repository filter: each filter needs a unique id, label, type 'select', and options array.");
          }
          if (!field.options.every(option => typeof option === "string" ||
              (option && typeof option.value === "string" && typeof option.label === "string"))) {
            throw new Error(`Invalid options for repository filter '${field.id}'.`);
          }
          ids.add(field.id);
          return field;
        });
        const columns = value.layout?.columns;
        if (columns !== undefined && (typeof columns !== "object" || columns === null || Array.isArray(columns) ||
            (columns.maxColumns !== undefined && ![1, 2, 3].includes(columns.maxColumns)) ||
            (columns.singleColumnGroups !== undefined && (!Array.isArray(columns.singleColumnGroups) || !columns.singleColumnGroups.every(name => typeof name === "string"))))) {
          throw new Error("Invalid repository layout.columns: maxColumns must be 1, 2, or 3 and singleColumnGroups must be an array of group names.");
        }
        setColumnConfig({ maxColumns: columns?.maxColumns ?? 3, singleColumnGroups: columns?.singleColumnGroups ?? [] });
        setConfig(validated);
        setRepositoryConfig(value);
      })
      .catch(err => { if (active) setConfigError(`Repository configuration: ${err.message}`); });
    return () => { active = false; };
  }, [game]);
  useEffect(()=>{let active=true;if(!game){setEvents([]);return;}repositoryRequest("/events",{game}).then(result=>{if(active)setEvents(result.events||[]);}).catch(()=>{if(active)setEvents([]);});return()=>{active=false;};},[game,refresh]);
  useEffect(() => { let active = true; if (!game) { setResult({decks: [], total: 0}); return; } setLoading(true); setError(""); const params = {game, q: search, sort, page, limit: PAGE_SIZE}; Object.entries(filters).forEach(([k,v]) => {if(v) params[["placement","season","event"].includes(k)?k:`field.${k}`] = v;}); repositoryRequest("/decks", params).then(data => {if(active)setResult(data);}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);}); return ()=>{active=false;}; }, [game, search, sort, page, filters, refresh]);
  useEffect(() => {let active = true; if (!expanded) {setDetail(null);return;} repositoryRequest(`/decks/${encodeURIComponent(expanded)}`).then(d=>{if(active)setDetail(d);}).catch(e=>{if(active)setError(e.message);}); return ()=>{active=false;};},[expanded]);
  const cardsGame = detail?.game || game;
  useEffect(()=>{let active=true;if(!expanded || !cardsGame)return; if(cardsGame === activeCardsGame && activeCards?.length) {setCards(activeCards);return;} setCards([]);loadCardsForGame(cardsGame).then(c=>{if(active)setCards(c);}).catch(()=>{});return ()=>{active=false;};},[expanded,cardsGame,activeCardsGame,activeCards]);
  // The API results are authoritative. An expanded deck must not be injected into
  // a filtered result set simply because it was previously selected.
  const show = result.decks;
  const clearSelection = () => {
    setExpanded(null);
    setDetail(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("code");
    window.history.replaceState({}, "", url);
  };
  return <main className={`repository-page ${isMobileLayout ? "repository-page--mobile" : "repository-page--desktop"}`}><div className="repository-page-heading"><div><h2>Deck DB</h2></div><div className="repository-page-actions">{canSubmit && <><button type="button" onClick={() => setSubmitOpen(true)}>Submit Deck</button></>}<button type="button" onClick={onBack}>Back to Builder</button></div></div>
    <div className="repository-search-row">
      <label className="repository-search-field">Search<input value={search} onChange={e=>{setSearch(e.target.value);setPage(1);clearSelection();}} placeholder="Deck, player, event…" /></label>
      <label className="repository-sort-field">Filter By<select value={sort} onChange={e=>{setSort(e.target.value);setPage(1);clearSelection();}}><option value="newest">Newest event first</option><option value="oldest">Oldest event first</option><option value="name">Deck name</option></select></label>
    </div>
    <div className="repository-filters">
    {config.filter(f=>f.id==="style" && f.filterable !== false).map(f=><label key={f.id}>{f.label}<select value={filters[f.id]||""} onChange={e=>{setFilters(prev=>({...prev,[f.id]:e.target.value}));setPage(1);clearSelection();}}><option value="">All</option>{(f.options||[]).map(o=><option key={typeof o === "string" ? o:o.value} value={typeof o === "string" ? o:o.value}>{typeof o === "string" ? o:o.label}</option>)}</select></label>)}
    {repositoryConfig.features?.seasons === true && <label>Season<select value={filters.season||""} onChange={e=>{setFilters(prev=>({...prev,season:e.target.value,event:""}));setPage(1);clearSelection();}}><option value="">All Seasons</option>{[...new Set(events.map(e=>e.season).filter(Boolean))].map(v=><option key={v}>{v}</option>)}</select></label>}
    <label>Event<select value={filters.event||""} onChange={e=>{setFilters(prev=>({...prev,event:e.target.value}));setPage(1);clearSelection();}}><option value="">All Events</option>{[...new Set(events.filter(e=>!filters.season||e.season===filters.season).map(e=>e.event_name).filter(Boolean))].map(v=><option key={v}>{v}</option>)}</select></label>
    <label>Placement<select value={filters.placement||""} onChange={e=>{setFilters(prev=>({...prev,placement:e.target.value}));setPage(1);clearSelection();}}><option value="">All Placements</option>{[1,4,8,16].map(n=><option key={n} value={n===1?"Winner":`Top ${n}`}>{n===1?"Winner":`Top ${n}`}</option>)}</select></label>
    {config.filter(f=>!["placement","style","season","event"].includes(f.id) && f.filterable !== false).map(f=><label key={f.id}>{f.label}<select value={filters[f.id]||""} onChange={e=>{setFilters(prev=>({...prev,[f.id]:e.target.value}));setPage(1);clearSelection();}}><option value="">All</option>{(f.options||[]).map(o=><option key={typeof o === "string" ? o:o.value} value={typeof o === "string" ? o:o.value}>{typeof o === "string" ? o:o.label}</option>)}</select></label>)}
    </div>
    {configError && <p role="alert" className="repository-error">{configError}</p>}
    {error && <p role="alert" className="repository-error">{error}</p>}
    {loading && <p>Loading repository…</p>}
    {game && !loading && !error && <p>{result.total} decks found</p>}
    <div className="repository-results">{show.map(d=><section className="repository-entry" key={d.share_code}><button type="button" className="repository-entry-toggle" aria-expanded={expanded === d.share_code} onClick={()=>{const code=expanded === d.share_code?null:d.share_code;setExpanded(code);const url=new URL(window.location);if(code)url.searchParams.set("code",code);else url.searchParams.delete("code");window.history.replaceState({},"",url);}}><span className="repository-entry-info"><strong>{d.name}</strong>{[d.player_name, d.event_name, d.metadata_json?.place ?? d.metadata_json?.placement].filter(v=>v !== null && v !== undefined && String(v).trim() !== "").length > 0 && <small>{[d.player_name, d.event_name, d.metadata_json?.place ?? d.metadata_json?.placement].filter(v=>v !== null && v !== undefined && String(v).trim() !== "").join(" · ")}</small>}</span><span className="repository-entry-chevron" aria-hidden="true">{expanded === d.share_code?"▲":"▼"}</span></button>{expanded === d.share_code && (detail?.share_code === d.share_code ? <RepositoryPanel record={detail} cards={cards} settings={settings} columnConfig={columnConfig} onLoadInBuilder={onLoadInBuilder} canSubmit={canSubmit} role={role} events={events} repositoryConfig={repositoryConfig} onChanged={()=>{clearSelection();setRefresh(n=>n+1);}} />:<div className="repository-panel">Loading deck…</div>)}</section>)}</div>
    {submitOpen && <BulkDeckSubmission game={game} cards={activeCardsGame === game ? activeCards : cards} events={events} repositoryConfig={repositoryConfig} onClose={() => setSubmitOpen(false)} onPublished={() => { setPage(1); setRefresh(value => value + 1); }} />}
    {result.total > PAGE_SIZE && <nav className="repository-pagination"><button disabled={page===1} onClick={()=>{setPage(p=>p-1);clearSelection();}}>Previous</button><span>Page {page} of {Math.ceil(result.total/PAGE_SIZE)}</span><button disabled={page*PAGE_SIZE>=result.total} onClick={()=>{setPage(p=>p+1);clearSelection();}}>Next</button></nav>}
  </main>;
}
