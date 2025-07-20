import React, { useState, useEffect, useRef } from "react";
import CardPreview from "../components/CardPreview";
import { exportDeckO8c } from "../utils/deckImagePackExport";
import {
  getSortedExportListWithDisplayOrder,
  exportDeckImage,
  exportDeckImageCompact,
  exportDeckOCTGN,
  shareDeck,
  sortGroup,
  cardNameWithSubtitle,
  groupDeck,
} from "../utils/deckExportHelpers";

const WORKER_API = "https://tcgbuilder.net/api";

function DeckControls({
  deck,
  cards,
  settings,
  game,
  setDeck,
  selectedCard,
  setGame,
  groupBy,
  setGroupBy,
  octgnOverrides: octgnOverridesProp,
  setOctgnOverrides: setOctgnOverridesProp
}) {
  console.log("DeckControls settings:", settings);
  const [deckName, setDeckName] = useState("");
  const [savedDecks, setSavedDecks] = useState(() =>
    JSON.parse(localStorage.getItem(`${game}-decks`) || "[]")
  );
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const exportMenuRef = useRef(null);
  const [linkMessage, setLinkMessage] = useState("");
  const [selectedDeckIdx, setSelectedDeckIdx] = useState(null);
  const [dropdownHover, setDropdownHover] = useState(null);
  const [currentGroupBy, setCurrentGroupBy] = useState(groupBy || (settings.groupOptions && settings.groupOptions[0]) || "Type");

  useEffect(() => {
    if (groupBy) setCurrentGroupBy(groupBy);
  }, [groupBy]);

  // --- OCTGN sections for grouping if needed ---
  const [octgnSections, setOctgnSections] = useState(null);
  const [panelIgnoreSections, setPanelIgnoreSections] = useState([]);
  useEffect(() => {
    if (currentGroupBy !== "OCTGN" || !settings.octgnExport) {
      setOctgnSections(null);
      setPanelIgnoreSections([]);
      return;
    }
    let cancelled = false;
    async function fetchSections() {
      try {
        let baseUrl = import.meta.env.BASE_URL || "";
        if (baseUrl.endsWith("/")) baseUrl = baseUrl.slice(0, -1);
        const url = `${baseUrl}/games/${settings.gameName}/octgn.json`;
        const resp = await fetch(url);
        if (!resp.ok) throw new Error("OCTGN config not found");
        const json = await resp.json();
        if (!cancelled) {
          setOctgnSections(json.sections || []);
          setPanelIgnoreSections(json.panelIgnoreSections || []);
        }
      } catch {
        if (!cancelled) {
          setOctgnSections([]);
          setPanelIgnoreSections([]);
        }
      }
    }
    fetchSections();
    return () => {
      cancelled = true;
    };
  }, [settings.gameName, settings.octgnExport, currentGroupBy]);

  // --- OCTGN overrides state ---
  const [internalOctgnOverrides, setInternalOctgnOverrides] = useState({});
  const octgnOverrides = octgnOverridesProp !== undefined ? octgnOverridesProp : internalOctgnOverrides;
  const setOctgnOverrides = setOctgnOverridesProp !== undefined ? setOctgnOverridesProp : setInternalOctgnOverrides;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("deck");
    const gameName = params.get("game");

    if (!code) return;

    if (gameName && typeof setGame === "function" && gameName !== game) {
      setGame(gameName);
      return;
    }
    if (!cards || cards.length === 0) return;
    if (Object.keys(deck).length > 0) return;
    if (Object.keys(deck).length > 0) {
      if (!window.confirm("You are about to load a shared deck. This will overwrite your current progress. Continue?")) {
        params.delete("deck");
        window.history.replaceState({}, "", window.location.pathname + (params.toString() ? "?" + params.toString() : ""));
        return;
      }
    }
    fetch(`${WORKER_API}/deck/${code}`)
      .then(r => {
        if (!r.ok) throw new Error("Deck not found");
        return r.json();
      })
      .then(deckObj => {
        setDeck(deckObj);
        setDeckName("");
        params.delete("deck");
        window.history.replaceState({}, "", window.location.pathname + (params.toString() ? "?" + params.toString() : ""));
      })
      .catch(() => alert("This deck code could not be loaded."));
    // eslint-disable-next-line
  }, [game, cards]);

  useEffect(() => {
    setSavedDecks(JSON.parse(localStorage.getItem(`${game}-decks`) || "[]"));
  }, [game]);

  useEffect(() => {
    function handleClick(event) {
      if (
        exportMenuRef.current &&
        !exportMenuRef.current.contains(event.target)
      ) {
        setExportMenuOpen(false);
      }
    }
    if (exportMenuOpen) {
      document.addEventListener("mousedown", handleClick);
    }
    return () => document.removeEventListener("mousedown", handleClick);
  }, [exportMenuOpen]);

  function saveDeck() {
    if (!deckName) {
      alert("Please enter a deck name.");
      return;
    }
    const existingIdx = savedDecks.findIndex(d => d.name === deckName);
    if (existingIdx !== -1) {
      const choice = window.confirm(
        `A deck named "${deckName}" already exists. Click OK to overwrite, or Cancel to rename.`
      );
      if (choice) {
        const newDecks = savedDecks.map((d, i) =>
          i === existingIdx ? { name: deckName, deck } : d
        );
        setSavedDecks(newDecks);
        localStorage.setItem(`${game}-decks`, JSON.stringify(newDecks));
        alert("Deck overwritten.");
      } else {
        let newName = prompt("Enter a new deck name:", `${deckName} (copy)`);
        if (!newName) return;
        if (savedDecks.some(d => d.name === newName)) {
          alert("A deck with that name already exists. Please choose another name.");
          return;
        }
        const newDecks = [...savedDecks, { name: newName, deck }];
        setDeckName(newName);
        setSavedDecks(newDecks);
        localStorage.setItem(`${game}-decks`, JSON.stringify(newDecks));
        alert("Deck saved with new name.");
      }
    } else {
      const newDecks = [...savedDecks, { name: deckName, deck }];
      setSavedDecks(newDecks);
      localStorage.setItem(`${game}-decks`, JSON.stringify(newDecks));
      alert("Deck saved.");
    }
  }

  function loadDeck(idx) {
    if (!window.confirm("All current progress will be lost!")) return;

    const raw = savedDecks[idx].deck;
    const fixed = {};

    Object.entries(raw).forEach(([cardId, value]) => {
      if (value && typeof value === "object" && "count" in value) {
        fixed[cardId] = value;
      } else {
        fixed[cardId] = {
          count: Number(value) || 0,
          group: {},
          tags: []
        };
      }
    });

    setDeck(fixed);
    setDeckName(savedDecks[idx].name);
  }

  function deleteDeck(idx) {
    if (!window.confirm(`Are you sure you want to delete ${savedDecks[idx].name}?`)) return;
    const newDecks = savedDecks.filter((_, i) => i !== idx);
    setSavedDecks(newDecks);
    localStorage.setItem(`${game}-decks`, JSON.stringify(newDecks));
  }

  async function exportDeck(format) {
    setExportMenuOpen(false);
    const flatDeck = {};
    Object.entries(deck).forEach(([cardId, entry]) => {
      flatDeck[cardId] = entry.count || 0;
    });
    if (format === "TXT") {
      const includeSubtitle = !!settings.includeSubtitleInTextExport;
      const groupSorts = settings.groupSort || {};
      const groupBySetting = currentGroupBy || (settings.groupOptions && settings.groupOptions[0]) || "Type";
      const usingOctgn = groupBySetting === "OCTGN" && settings.octgnExport;

      let grouped, groupOrderArr, filteredSections;
      if (usingOctgn && octgnSections) {
        filteredSections = panelIgnoreSections && panelIgnoreSections.length > 0
          ? octgnSections.filter(section => !panelIgnoreSections.includes(section.name))
          : octgnSections;
        grouped = groupDeck(flatDeck, cards, groupBySetting);
        groupOrderArr = [...filteredSections.map(s => s.name), "Ungrouped"];
      } else {
        grouped = groupDeck(flatDeck, cards, groupBySetting);
        const FALLBACK_GROUP_ORDER = ["Creatures", "Spells", "Lands", "Other"];
        const groupOrder = Array.isArray(settings.groupOrder) ? settings.groupOrder : FALLBACK_GROUP_ORDER;
        const groupNames = Object.keys(grouped);
        const inOrder = groupOrder.filter(name => groupNames.includes(name));
        const remaining = groupNames.filter(name => !groupOrder.includes(name)).sort();
        groupOrderArr = [...inOrder, ...remaining];
      }

      let txt = `Deck: ${deckName}`;
      groupOrderArr.forEach((group, groupIdx) => {
        const groupCards = grouped[group] || [];
        if (
          usingOctgn &&
          group === "Ungrouped" &&
          (!groupCards || groupCards.length === 0)
        ) {
          return;
        }
        const groupSortConfig = groupSorts[group];
        const sorted = sortGroup(groupCards, groupSortConfig, includeSubtitle);
        const groupTotal = sorted.reduce((sum, { qty }) => sum + qty, 0);
        txt += `\n${group} (${groupTotal})`;
        sorted.forEach(({ card, qty }) => {
          let cardLine = cardNameWithSubtitle(card, includeSubtitle);
          txt += `\n${cardLine} x${qty}`;
        });
        if (groupIdx < groupOrderArr.length - 1) {
          txt += `\n`;
        }
      });

      downloadFile(txt, `${deckName || "deck"}.txt`, "text/plain");
    } else if (format === "JSON") {
      const exportList = getSortedExportListWithDisplayOrder(deck, cards, settings);
      const deckObj = {
        name: deckName,
        game,
        deck: exportList.map(({ card, qty }) => {
          if (!card) return null;
          return { ...card, qty };
        }).filter(Boolean)
      };
      downloadFile(JSON.stringify(deckObj, null, 2), `${deckName || "deck"}.json`, "application/json");
    } else if (format === "Image") {
      await exportDeckImage(flatDeck, cards, settings, deckName, game);
    } else if (format === "ImageCompact") {
      await exportDeckImageCompact(flatDeck, cards, settings, deckName, game);
    } else if (format === "OCTGN") {
      await exportDeckOCTGN(deck, cards, settings, deckName, octgnOverrides, currentGroupBy);
    } else if (format === "LINK") {
      shareDeck(deck, setLinkMessage, game);
    }
  }

  function clearDeck() {
    if (Object.keys(deck).length > 0) {
      if (window.confirm("Are you sure you want to clear the current deck? This cannot be undone.")) {
        setDeck({});
        setOctgnOverrides({});
      }
    }
  }

  function importDeck() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json,.o8d,application/xml,text/xml";
    input.onchange = async e => {
      const file = e.target.files[0];
      if (!file) return;

      if (!window.confirm("All current progress will be lost! Importing a deck will overwrite your current deck. Continue?")) {
        return;
      }

      const text = await file.text();
      let importedDeck = {};
      let importedOverrides = {};
      let groupCounts = {};
      let notFound = [];

      try {
        if (file.name.toLowerCase().endsWith(".json")) {
          const deckObj = JSON.parse(text);
          if (!deckObj.deck) throw new Error("Invalid deck file.");
          if (deckObj.game && deckObj.game !== game) {
            alert(`Deck is for game "${deckObj.game}". Switch to that game to import.`);
            return;
          }
          for (const card of deckObj.deck) {
            importedDeck[card.id] = card.qty;
          }
          const wrappedDeck = {};
          Object.entries(importedDeck).forEach(([id, count]) => {
            wrappedDeck[id] = { count };
          });
          setDeck(wrappedDeck);
          setOctgnOverrides({});
          return;
        }
      } catch (e) {}

      if (file.name.toLowerCase().endsWith(".o8d") || text.startsWith('<?xml')) {
        try {
          const parser = new DOMParser();
          const xmlDoc = parser.parseFromString(text, "application/xml");
          importedDeck = {};
          importedOverrides = {};
          notFound = [];

          const sectionNodes = Array.from(xmlDoc.getElementsByTagName("section"));
          for (const sectionNode of sectionNodes) {
            const sectionName = sectionNode.getAttribute("name");
            const cardNodes = Array.from(sectionNode.getElementsByTagName("card"));
            for (const cardNode of cardNodes) {
              const id = cardNode.getAttribute("id");
              const qty = parseInt(cardNode.getAttribute("qty"), 10) || 1;
              const name = cardNode.getAttribute("name") || cardNode.textContent.trim();

              let foundCard = id ? cards.find(c => c.id === id) : null;
              if (!foundCard && name) {
                foundCard = cards.find(c => c.name === name);
              }
              if (foundCard) {
                importedDeck[foundCard.id] = (importedDeck[foundCard.id] || 0) + qty;

                if (!groupCounts[foundCard.id]) groupCounts[foundCard.id] = {};
                groupCounts[foundCard.id][sectionName || "Ungrouped"] =
                  (groupCounts[foundCard.id][sectionName || "Ungrouped"] || 0) + qty;
              } else if (name) {
                notFound.push(name);
              }
            }
          }

          if (sectionNodes.length === 0) {
            const cardNodes = Array.from(xmlDoc.getElementsByTagName("card"));
            for (const node of cardNodes) {
              const id = node.getAttribute("id");
              const qty = parseInt(node.getAttribute("qty"), 10) || 1;
              const name = node.getAttribute("name") || node.textContent.trim();

              let foundCard = id ? cards.find(c => c.id === id) : null;
              if (!foundCard && name) {
                foundCard = cards.find(c => c.name === name);
              }
              if (foundCard) {
                importedDeck[foundCard.id] = (importedDeck[foundCard.id] || 0) + qty;
              } else if (name) {
                notFound.push(name);
              }
            }
          }

          if (Object.keys(importedDeck).length > 0) {
            const wrappedDeck = {};
            Object.entries(importedDeck).forEach(([id, totalCount]) => {
              wrappedDeck[id] = { count: totalCount, group: groupCounts[id] };
            });
            setDeck(wrappedDeck);
            setOctgnOverrides(importedOverrides);
            if (notFound.length > 0) {
              alert("Some cards could not be matched and were not imported:\n" + notFound.join("\n"));
            }
          } else {
            alert("No cards could be loaded from this deck file.");
          }
          return;
        } catch (e) {
          alert("Failed to parse OCTGN deck file.");
          return;
        }
      }

      alert("Invalid or unsupported deck file.");
    };
    input.click();
  }

  function downloadFile(data, filename, type) {
    let blob;
    if (data instanceof Blob) {
      blob = data;
    } else {
      blob = new Blob([data], { type });
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  const buttonClass = "main-button";
  const dropdownButtonClass = "dropdown-button";
  const dropdownButtonHoverClass = "dropdown-button-hover";
  const deckNameInputClass = "deck-name-input";
  const deckControlsGridClass = "deck-controls-grid";
  const linkMessageClass = "link-message";
  const listSelectedClass = "selected-list-item";

  const selectedCardObj = cards.find(c => c.id === selectedCard);

  return (
    <section className="deck-controls flex-col-center">
      <div className={deckControlsGridClass}>
        <input
          type="text"
          placeholder="Deck name"
          value={deckName}
          onChange={e => setDeckName(e.target.value)}
          className={deckNameInputClass}
        />
        <button className={buttonClass} onClick={saveDeck}>Save</button>
        <div style={{ position: "relative", width: "120px" }} ref={exportMenuRef}>
          <button
            className={buttonClass}
            onClick={() => setExportMenuOpen(open => !open)}
          >
            Export ▼
          </button>
          {exportMenuOpen && (
            <div
              className="dropdown-menu"
              onMouseLeave={() => setExportMenuOpen(false)}
            >
              <button
                className={
                  dropdownHover === 0
                    ? `${dropdownButtonClass} ${dropdownButtonHoverClass}`
                    : dropdownButtonClass
                }
                onMouseEnter={() => setDropdownHover(0)}
                onMouseLeave={() => setDropdownHover(null)}
                onClick={() => exportDeck("TXT")}
              >
                TXT
              </button>
              <button
                className={
                  dropdownHover === 2
                    ? `${dropdownButtonClass} ${dropdownButtonHoverClass}`
                    : dropdownButtonClass
                }
                onMouseEnter={() => setDropdownHover(2)}
                onMouseLeave={() => setDropdownHover(null)}
                onClick={() => exportDeck("Image")}
              >
                Card Images
              </button>
              <button
                className={
                  dropdownHover === 3
                    ? `${dropdownButtonClass} ${dropdownButtonHoverClass}`
                    : dropdownButtonClass
                }
                onMouseEnter={() => setDropdownHover(3)}
                onMouseLeave={() => setDropdownHover(null)}
                onClick={() => exportDeck("ImageCompact")}
              >
                Image Stack
              </button>
              <button
                className={
                  dropdownHover === 4
                    ? `${dropdownButtonClass} ${dropdownButtonHoverClass}`
                    : dropdownButtonClass
                }
                onMouseEnter={() => setDropdownHover(4)}
                onMouseLeave={() => setDropdownHover(null)}
                onClick={() => exportDeck("LINK")}
              >
                Link
              </button>
              {settings.octgnExport && (
                <button
                  className={
                    dropdownHover === 5
                      ? `${dropdownButtonClass} ${dropdownButtonHoverClass}`
                      : dropdownButtonClass
                  }
                  onMouseEnter={() => setDropdownHover(5)}
                  onMouseLeave={() => setDropdownHover(null)}
                  onClick={() => exportDeck("OCTGN")}
                >
                  OCTGN
                </button>
              )}
            </div>
          )}
          {linkMessage && (
            <div className={linkMessageClass}>
              {linkMessage}
            </div>
          )}
        </div>
        <button className={buttonClass} onClick={clearDeck}>Clear</button>
        <button className={buttonClass} onClick={importDeck}>Import</button>
		{settings.showImagePackExport && (
		<button
			className={buttonClass}
			onClick={() => exportDeckO8c(cards, settings, game)}
		  >
			Fetch OCTGN Image Pack
		  </button>
		)}

      </div>
      <div style={{ width: "220px", marginBottom: "1em" }}>
        <CardPreview card={selectedCardObj} game={game} />
      </div>
      <div style={{ width: "100%", maxWidth: 500 }}>
        <h3>Saved Decks</h3>
        <ul style={{ listStyle: "none", padding: 0 }}>
          {savedDecks.map((d, i) => (
            <li
              key={i}
              className={selectedDeckIdx === i ? listSelectedClass : ""}
              onClick={() => setSelectedDeckIdx(i)}
              style={{
                display: "flex",
                alignItems: "center",
                padding: "0.25em 0.5em",
                borderRadius: "4px",
                marginBottom: "0.3em",
                cursor: "pointer"
              }}
            >
              <span style={{ flex: 1 }}>{d.name}</span>
              <button className={buttonClass} style={{ width: "60px", height: "1.8em", fontSize: "0.9em", marginRight: "0.3em" }} onClick={e => { e.stopPropagation(); loadDeck(i); }}>Load</button>
              <button className={buttonClass} style={{ width: "60px", height: "1.8em", fontSize: "0.9em" }} onClick={e => { e.stopPropagation(); deleteDeck(i); }}>Delete</button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export default DeckControls;
