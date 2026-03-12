import React, { useState, useEffect, useRef } from "react";
import CardPreview from "../components/CardPreview";
import DeckSubmissionFlow, { buildFlattenedDeckRows } from "../components/DeckSubmissionFlow";
import { exportDeckO8c } from "../utils/deckImagePackExport";
import { buildCardPreviewProperties } from "../utils/cardPreviewExtra";
import {
  getSortedExportListWithDisplayOrder,
  exportDeckImage,
  exportDeckImageCompact,
  exportDeckOCTGN,
  createSharedDeck,
  updateSharedDeck,
  sortGroup,
  cardNameWithSubtitle,
  groupDeck,
} from "../utils/deckExportHelpers";
import { exportDeckPDF } from "../utils/deckPrintPDF";
import PdfDecklistExportFlow from "../components/PdfDecklistExportFlow";
import {
  addSavedDeckFolder,
  assignSavedDeckToFolder,
  buildSavedDeckFolderView,
  createSavedDeckFolder,
  deleteSavedDeckFolder,
  loadSavedDeckFolderState,
  loadSavedDecks,
  removeSavedDeckAssignment,
  renameSavedDeckAssignment,
  saveSavedDeckFolderState,
  saveSavedDecks,
  toggleSavedDeckFolder,
} from "../utils/savedDeckFolders";

const WORKER_API = "https://tcgbuilder.net/api";

function DeckControls({
  deck,
  cards,
  allCards,
  settings,
  game,
  setDeck,
  selectedCard,
  setGame,
  groupBy,
  setGroupBy,
  octgnOverrides: octgnOverridesProp,
  setOctgnOverrides: setOctgnOverridesProp,
}) {
  const [deckName, setDeckName] = useState("");
  const [savedDecks, setSavedDecks] = useState(() => loadSavedDecks(game));
  const [savedDeckFolderState, setSavedDeckFolderState] = useState(() =>
    loadSavedDeckFolderState(game),
  );
  const [activeSavedDeckName, setActiveSavedDeckName] = useState(null);
  const [sessionShareInfo, setSessionShareInfo] = useState(null);  
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const exportMenuRef = useRef(null);
  const [linkMessage, setLinkMessage] = useState("");
  const [selectedDeckIdx, setSelectedDeckIdx] = useState(null);
  const [dropdownHover, setDropdownHover] = useState(null);
  const [currentGroupBy, setCurrentGroupBy] = useState(
    groupBy || (settings.groupOptions && settings.groupOptions[0]) || "Type",
  );
  const [imagePackProgress, setImagePackProgress] = useState(null);
  const [showSetSelector, setShowSetSelector] = useState(false);
  const [selectedSetNames, setSelectedSetNames] = useState(new Set());
  const [savedDeckDrag, setSavedDeckDrag] = useState(null);
  const [savedDeckFolderDropIndicator, setSavedDeckFolderDropIndicator] = useState(null);
  
  const pdfDecklistRef = useRef(null);
  const cancelExport = useRef(false);
  const [generatingPDF, setGeneratingPDF] = useState(false);
  const deckSubmissionRef = useRef(null);
  const imagePackCards = (allCards && allCards.length) ? allCards : cards;
  const setsByName = React.useMemo(() => {
  const map = new Map();
  for (const card of imagePackCards) {
    if (!card.set_id || !card.Set) continue;
    if (!map.has(card.Set)) map.set(card.Set, new Set());
    map.get(card.Set).add(card.set_id);
  }
  return map;
}, [imagePackCards]);

  const setNames = React.useMemo(
    () => Array.from(setsByName.keys()).sort(),
    [setsByName],
  );

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
  const octgnOverrides =
    octgnOverridesProp !== undefined
      ? octgnOverridesProp
      : internalOctgnOverrides;
  const setOctgnOverrides =
    setOctgnOverridesProp !== undefined
      ? setOctgnOverridesProp
      : setInternalOctgnOverrides;

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
	if (Object.keys(deck).length > 0) {
	  if (
		!window.confirm(
		  "You are about to load a shared deck. This will overwrite your current progress. Continue?",
		)
	  ) {
		params.delete("deck");
		window.history.replaceState(
		  {},
		  "",
		  window.location.pathname +
			(params.toString() ? "?" + params.toString() : ""),
		);
		return;
	  }
	}
    fetch(`${WORKER_API}/deck/${code}`)
      .then((r) => {
        if (!r.ok) throw new Error("Deck not found");
        return r.json();
      })
      .then((deckObj) => {
        const nextDeck =
          deckObj?.versions?.current ||
          deckObj?.deck ||
          deckObj;
        const nextName =
          typeof deckObj?.name === "string" ? deckObj.name : "";
        setDeck(nextDeck);
        setDeckName(nextName);
        setActiveSavedDeckName(null);
        setSessionShareInfo(null);
        params.delete("deck");
        window.history.replaceState(
          {},
          "",
          window.location.pathname +
            (params.toString() ? "?" + params.toString() : ""),
        );
      })
      .catch(() => alert("This deck code could not be loaded."));
    // eslint-disable-next-line
  }, [game, cards]);

  useEffect(() => {
    setSavedDecks(loadSavedDecks(game));
    setSavedDeckFolderState(loadSavedDeckFolderState(game));
    setActiveSavedDeckName(null);
    setSessionShareInfo(null);
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

  const savedDeckFolderView = React.useMemo(
    () => buildSavedDeckFolderView(savedDecks, savedDeckFolderState),
    [savedDecks, savedDeckFolderState],
  );

  function persistSavedDecks(nextDecks) {
    setSavedDecks(nextDecks);
    saveSavedDecks(game, nextDecks);
  }

  function persistSavedDeckFolderState(nextState) {
    setSavedDeckFolderState(nextState);
    saveSavedDeckFolderState(game, nextState);
  }

  function updateSavedDeckFolderState(updater) {
    const nextState = typeof updater === "function" ? updater(savedDeckFolderState) : updater;
    persistSavedDeckFolderState(nextState);
  }


  function generateEditToken() {
    if (window.crypto?.randomUUID) {
      return `${window.crypto.randomUUID()}-${window.crypto.randomUUID()}`;
    }
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  }

  function getSavedDeckIndexByName(name) {
    return savedDecks.findIndex((d) => d.name === name);
  }

  function getSavedDeckByName(name) {
    const idx = getSavedDeckIndexByName(name);
    return idx >= 0 ? savedDecks[idx] : null;
  }

  function buildSavedDeckRecord(name, deckValue, extras = {}) {
    const record = {
      name,
      deck: deckValue,
    };
    if (extras.shareCode) record.shareCode = extras.shareCode;
    if (extras.editToken) record.editToken = extras.editToken;
    return record;
  }

  function upsertCurrentDeckAsSaved({
    name,
    deckValue = deck,
    shareCode,
    editToken,
    sourceName = activeSavedDeckName,
  }) {
    const currentIndex =
      sourceName != null ? savedDecks.findIndex((d) => d.name === sourceName) : -1;
    const targetIndex = savedDecks.findIndex((d) => d.name === name);
    const record = buildSavedDeckRecord(name, deckValue, { shareCode, editToken });

	if (currentIndex !== -1) {
	  if (targetIndex !== -1 && targetIndex !== currentIndex) {
		alert(`A saved deck named "${name}" already exists. Please choose a different name.`);
		return false;
	  }

	  const oldName = savedDecks[currentIndex]?.name;
	  const nextDecks = savedDecks.map((d, i) => (i === currentIndex ? record : d));
	  persistSavedDecks(nextDecks);

	  if (oldName && oldName !== name) {
		updateSavedDeckFolderState((current) =>
		  renameSavedDeckAssignment(current, oldName, name),
		);
	  }

	  setActiveSavedDeckName(name);
	  return true;
	}

	if (targetIndex !== -1) {
	  if (currentIndex === -1 || targetIndex !== currentIndex) {
		alert(`A saved deck named "${name}" already exists. Please choose a different name.`);
		return false;
	  }

	  const nextDecks = savedDecks.map((d, i) => (i === targetIndex ? record : d));
	  persistSavedDecks(nextDecks);
	  setActiveSavedDeckName(name);
	  return true;
	}

	const nextDecks = [...savedDecks, record];
	persistSavedDecks(nextDecks);
	setActiveSavedDeckName(name);
	return true;
  }

  function showLinkResult(result, successMessage = "Shareable link copied to clipboard!") {
    if (result.success) {
      setLinkMessage(successMessage);
      setTimeout(() => setLinkMessage(""), 2500);
    } else if (result.url) {
      setLinkMessage(
        <>
          <div>Couldn't copy to clipboard.</div>
          <div>
            <strong>Tap and hold or long-press to copy:</strong>
          </div>
          <input
            type="text"
            readOnly
            value={result.url}
            style={{
              width: "100%",
              fontSize: "0.85em",
              marginTop: "0.5em",
              padding: "0.25em",
              border: "1px solid #ccc",
              borderRadius: "4px",
            }}
            onFocus={(e) => e.target.select()}
          />
        </>,
      );
    } else {
      setLinkMessage("Error: " + result.error);
      setTimeout(() => setLinkMessage(""), 4000);
    }
  }

  async function createFirstSharedDeck({
  saveLocallyFirst,
  nameOverride,
  sourceNameOverride,
}) {
	let name = (nameOverride || deckName || "").trim();
	if (!name) {
	  name = window.prompt("Enter a deck name:");
	  if (!name) return;
	}
	setDeckName(name);

    const editToken = generateEditToken();
    const result = await createSharedDeck({
      deck,
      game,
      name,
      editToken,
    });

    if (!result.code) {
      showLinkResult(result);
      return;
    }

	if (saveLocallyFirst) {
	  const saved = upsertCurrentDeckAsSaved({
		name,
		shareCode: result.code,
		editToken,
		sourceName: sourceNameOverride,
	  });

	  if (!saved) {
		setSessionShareInfo({
		  shareCode: result.code,
		  editToken,
		  name,
		});
		showLinkResult(
		  result,
		  "Shareable link copied to clipboard! The deck was shared, but it was not saved locally because that name already exists.",
		);
		return;
	  }

	  setSessionShareInfo(null);
	  showLinkResult(result);
	  return;
	}

    setSessionShareInfo({
      shareCode: result.code,
      editToken,
      name,
    });
    showLinkResult(
      result,
      "Shareable link copied to clipboard! Save this deck before leaving if you want to update this link later.",
    );
  }

  async function handleShareLink() {
    let name = (deckName || "").trim();
    if (!name) {
      name = window.prompt("Enter a deck name:");
      if (!name) return;
      setDeckName(name);
    }

    const savedRecord =
		activeSavedDeckName != null ? getSavedDeckByName(activeSavedDeckName) : null;
    const ownedShare =
      (savedRecord?.shareCode && savedRecord?.editToken
        ? {
            shareCode: savedRecord.shareCode,
            editToken: savedRecord.editToken,
            name: savedRecord.name,
          }
        : null) || sessionShareInfo;

    if (ownedShare?.shareCode && ownedShare?.editToken) {
      const updateExisting = window.confirm(
        `Update the existing shared deck "${ownedShare.name || name}"?\n\nClick OK to update the existing link.\nClick Cancel to save as a new shared deck.`,
      );

      if (updateExisting) {
        const result = await updateSharedDeck({
          code: ownedShare.shareCode,
          deck,
          game,
          name,
          editToken: ownedShare.editToken,
        });

	if (result.code && savedRecord) {
	  const saved = upsertCurrentDeckAsSaved({
		name,
		shareCode: result.code,
		editToken: ownedShare.editToken,
	  });

	  if (!saved) {
		setSessionShareInfo({
		  shareCode: result.code,
		  editToken: ownedShare.editToken,
		  name,
		});
		showLinkResult(
		  result,
		  "Shared deck updated and link copied to clipboard! The shared deck was updated, but it was not saved locally because that name already exists.",
		);
		return;
	  }

	  setSessionShareInfo(null);
	} else if (result.code) {
	  setSessionShareInfo({
		shareCode: result.code,
		editToken: ownedShare.editToken,
		name,
	  });
	}

	showLinkResult(result, "Shared deck updated and link copied to clipboard!");
	return;
      }

		const newName = window.prompt("Enter a name for the new shared deck:", `${name} (copy)`);
		if (!newName) return;

		const saveNewLocally = !!savedRecord
		  ? window.confirm(
			  `Save "${newName}" locally as a separate deck before sharing?\n\nClick OK to save locally first.\nClick Cancel to share without saving locally.`,
			)
		  : false;

		await createFirstSharedDeck({
		  saveLocallyFirst: saveNewLocally,
		  nameOverride: newName,
		  sourceNameOverride: null,
		});
		return;
    }

    if (!savedRecord) {
      const choice = window.prompt(
        'This deck has not been saved locally yet.\nType "save" to Save and Share, or type "share" to Share Without Saving.',
        "save",
      );
      if (choice === null) return;

      const normalizedChoice = String(choice).trim().toLowerCase();
      if (normalizedChoice === "save") {
        await createFirstSharedDeck({ saveLocallyFirst: true });
        return;
      }
      if (normalizedChoice === "share") {
        await createFirstSharedDeck({ saveLocallyFirst: false });
        return;
      }

      alert('Please type either "save" or "share".');
      return;
    }

    const editToken = generateEditToken();
    const result = await createSharedDeck({
      deck,
      game,
      name,
      editToken,
    });

	if (result.code) {
	  const saved = upsertCurrentDeckAsSaved({
		name,
		shareCode: result.code,
		editToken,
	  });

	  if (!saved) {
		setSessionShareInfo({
		  shareCode: result.code,
		  editToken,
		  name,
		});
		showLinkResult(
		  result,
		  "Shareable link copied to clipboard! The deck was shared, but it was not saved locally because that name already exists.",
		);
		return;
	  }

	  setSessionShareInfo(null);
	}
	showLinkResult(result);
  }


  function saveDeck() {
    if (!deckName) {
      alert("Please enter a deck name.");
      return;
    }
	
    const currentSavedRecord =
      activeSavedDeckName != null ? getSavedDeckByName(activeSavedDeckName) : null;
    const sessionCode = sessionShareInfo?.shareCode;
    const sessionToken = sessionShareInfo?.editToken;
    const existingIdx = savedDecks.findIndex((d) => d.name === deckName);
    if (existingIdx !== -1) {
      const choice = window.confirm(
        `A deck named "${deckName}" already exists. Click OK to overwrite, or Cancel to rename.`,
      );
      if (choice) {
        const newDecks = savedDecks.map((d, i) =>
          i === existingIdx
            ? buildSavedDeckRecord(deckName, deck, {
                shareCode: d?.shareCode || currentSavedRecord?.shareCode || sessionCode,
                editToken: d?.editToken || currentSavedRecord?.editToken || sessionToken,
              })
            : d,
        );
        persistSavedDecks(newDecks);
        setActiveSavedDeckName(deckName);
        if (sessionCode && sessionToken) {
          setSessionShareInfo(null);
        }
        alert("Deck overwritten.");
      } else {
        let newName = prompt("Enter a new deck name:", `${deckName} (copy)`);
        if (!newName) return;
        if (savedDecks.some((d) => d.name === newName)) {
          alert(
            "A deck with that name already exists. Please choose another name.",
          );
          return;
        }
        const newDecks = [
          ...savedDecks,
          buildSavedDeckRecord(newName, deck, {
            shareCode: sessionCode,
            editToken: sessionToken,
          }),
        ];
        setDeckName(newName);
        persistSavedDecks(newDecks);
        setActiveSavedDeckName(newName);
        if (sessionCode && sessionToken) {
          setSessionShareInfo(null);
        }
        alert("Deck saved with new name.");
      }
    } else {
      const newDecks = [
        ...savedDecks,
        buildSavedDeckRecord(deckName, deck, {
          shareCode: currentSavedRecord?.shareCode || sessionCode,
          editToken: currentSavedRecord?.editToken || sessionToken,
        }),
      ];
      persistSavedDecks(newDecks);
      setActiveSavedDeckName(deckName);
      if (sessionCode && sessionToken) {
        setSessionShareInfo(null);
      }
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
          tags: [],
        };
      }
    });

    setDeck(fixed);
    setDeckName(savedDecks[idx].name);
    setActiveSavedDeckName(savedDecks[idx].name);
    setSessionShareInfo(null);
  }

  function deleteDeck(idx) {
    if (
      !window.confirm(
        `Are you sure you want to delete ${savedDecks[idx].name}?`,
      )
    )
      return;
	const deckToDelete = savedDecks[idx];
    const newDecks = savedDecks.filter((_, i) => i !== idx);
    persistSavedDecks(newDecks);
    if (deckToDelete?.name) {
      updateSavedDeckFolderState((current) =>
        removeSavedDeckAssignment(current, deckToDelete.name),
      );
    }
  }



  function promptCreateSavedDeckFolder() {
    const folderName = window.prompt("Enter a folder name:");
    const folder = createSavedDeckFolder(folderName);
    if (!folder) return;

    if (savedDeckFolderState.folders.some((item) => item.name === folder.name)) {
      alert("A saved deck folder with that name already exists.");
      return;
    }

    updateSavedDeckFolderState((current) => addSavedDeckFolder(current, folder));
  }

  function handleToggleSavedDeckFolder(folderId) {
    updateSavedDeckFolderState((current) =>
      toggleSavedDeckFolder(current, folderId),
    );
  }

  function handleDeleteSavedDeckFolder(folderId, folderName) {
    if (
      !window.confirm(
        `Delete folder "${folderName}"? Decks inside it will become unfoldered.`,
      )
    ) {
      return;
    }

    updateSavedDeckFolderState((current) =>
      deleteSavedDeckFolder(current, folderId),
    );
  }

  function handleSavedDeckDragStart(e, deckName) {
  e.stopPropagation();
  setSavedDeckDrag({ type: "deck", deckName });
  }

  function handleSavedDeckDragEnd() {
    setSavedDeckDrag(null);
	setSavedDeckFolderDropIndicator(null);
  }

  function moveSavedDeckToFolder(targetFolderId = null) {
    if (!savedDeckDrag || savedDeckDrag.type !== "deck") return;
    updateSavedDeckFolderState((current) =>
      assignSavedDeckToFolder(current, savedDeckDrag.deckName, targetFolderId),
    );
    setSavedDeckDrag(null);
  }

  function handleSavedDeckFolderDrop(targetFolderId) {
  if (savedDeckDrag?.type === "folder") {
    if (savedDeckDrag.folderId === targetFolderId) {
      setSavedDeckDrag(null);
	  setSavedDeckFolderDropIndicator(null);
      return;
    }

      const draggedFolderId = savedDeckDrag.folderId;
      const indicator = savedDeckFolderDropIndicator;

      if (!draggedFolderId || draggedFolderId === targetFolderId) {
        setSavedDeckDrag(null);
        setSavedDeckFolderDropIndicator(null);
        return;
      }

      updateSavedDeckFolderState((current) => {
        const folders = [...(current?.folders || [])];
        const fromIndex = folders.findIndex(
          (folder) => folder.id === draggedFolderId,
        );
        const targetIndex = folders.findIndex(
          (folder) => folder.id === targetFolderId,
        );

        if (fromIndex === -1 || targetIndex === -1) return current;

        const [moved] = folders.splice(fromIndex, 1);

        let insertIndex = folders.findIndex(
          (folder) => folder.id === targetFolderId,
        );
        if (insertIndex === -1) return current;

        if (
          indicator?.folderId === targetFolderId &&
          indicator.position === "below"
        ) {
          insertIndex += 1;
        }

        folders.splice(insertIndex, 0, moved);
        return { ...current, folders };
      });
    
    setSavedDeckDrag(null);
	setSavedDeckFolderDropIndicator(null);
    return;
    }

    if (savedDeckDrag?.type === "deck") {
      setSavedDeckFolderDropIndicator(null);
  }

  moveSavedDeckToFolder(targetFolderId);
}

  function handleSavedDeckRootDrop() {
    if (!savedDeckDrag || savedDeckDrag.type !== "deck") return;
	setSavedDeckFolderDropIndicator(null);
    moveSavedDeckToFolder(null);
 }
 
  function handleSavedDeckFolderDragOver(e, folderId) {
    if (savedDeckDrag?.type !== "folder") return;

    e.preventDefault();
    e.stopPropagation();

    const rect = e.currentTarget.getBoundingClientRect();
    const midpoint = rect.top + rect.height / 2;
    const position = e.clientY < midpoint ? "above" : "below";

    setSavedDeckFolderDropIndicator({ folderId, position });
  }
 

  function handleSavedDeckFolderDragStart(folderId) {
    setSavedDeckDrag({ type: "folder", folderId });
  }

function renderSavedDeckItem(d, options = {}) {
  const { dropTargetFolderId, allowUnfolderDrop = false } = options;
  const idx = savedDecks.findIndex((saved) => saved.name === d.name);
  if (idx === -1) return null;

  return (
    <li
      key={d.name}
      draggable
      className={selectedDeckIdx === idx ? listSelectedClass : ""}
      onClick={() => setSelectedDeckIdx(idx)}
      onMouseDown={(e) => e.stopPropagation()}
      onDragStart={(e) => handleSavedDeckDragStart(e, d.name)}
      onDragEnd={handleSavedDeckDragEnd}
      onDragEnter={(e) => e.stopPropagation()}
      onDragOver={(e) => {
        if (!savedDeckDrag) return;

        if (savedDeckDrag.type === "folder" && allowUnfolderDrop) {
          return;
        }

        e.preventDefault();
        e.stopPropagation();
      }}
      onDrop={(e) => {
        if (!savedDeckDrag) return;

        if (savedDeckDrag.type === "folder") {
          if (allowUnfolderDrop) {
            return;
          }

          if (dropTargetFolderId) {
            e.preventDefault();
            e.stopPropagation();
            handleSavedDeckFolderDrop(dropTargetFolderId);
          }
          return;
        }

        e.preventDefault();
        e.stopPropagation();

        if (allowUnfolderDrop) {
          handleSavedDeckRootDrop();
        } else if (dropTargetFolderId) {
          handleSavedDeckFolderDrop(dropTargetFolderId);
        }
      }}
      style={{
        display: "flex",
        alignItems: "center",
        padding: "0.25em 0.5em",
        borderRadius: "4px",
        marginBottom: "0.3em",
        cursor: "pointer",
      }}
    >
      <span style={{ flex: 1 }}>{d.name}</span>
      <button
        className={buttonClass}
        style={{
          width: "60px",
          height: "1.8em",
          fontSize: "0.9em",
          marginRight: "0.3em",
        }}
        onClick={(e) => {
          e.stopPropagation();
          loadDeck(idx);
        }}
      >
        Load
      </button>
      <button
        className={buttonClass}
        style={{ width: "60px", height: "1.8em", fontSize: "0.9em" }}
        onClick={(e) => {
          e.stopPropagation();
          deleteDeck(idx);
        }}
      >
        Delete
      </button>
    </li>
  );
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
      const groupBySetting =
        currentGroupBy ||
        (settings.groupOptions && settings.groupOptions[0]) ||
        "Type";
      const usingOctgn = groupBySetting === "OCTGN" && settings.octgnExport;

      let grouped, groupOrderArr, filteredSections;
      if (usingOctgn && octgnSections) {
        filteredSections =
          panelIgnoreSections && panelIgnoreSections.length > 0
            ? octgnSections.filter(
                (section) => !panelIgnoreSections.includes(section.name),
              )
            : octgnSections;
        grouped = groupDeck(flatDeck, cards, groupBySetting);
        groupOrderArr = [...filteredSections.map((s) => s.name), "Ungrouped"];
      } else {
        grouped = groupDeck(flatDeck, cards, groupBySetting);
        const FALLBACK_GROUP_ORDER = ["Creatures", "Spells", "Lands", "Other"];
        const groupOrder = Array.isArray(settings.groupOrder)
          ? settings.groupOrder
          : FALLBACK_GROUP_ORDER;
        const groupNames = Object.keys(grouped);
        const inOrder = groupOrder.filter((name) => groupNames.includes(name));
        const remaining = groupNames
          .filter((name) => !groupOrder.includes(name))
          .sort();
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
		  const exportList = getSortedExportListWithDisplayOrder(
			deck,
			cards,
			settings,
		  );

		  const submissionRows = buildFlattenedDeckRows(deck, cards);

		  const deckObj = {
			name: deckName,
			game,

			// Legacy/simple export list (kept for compatibility)
			deck: exportList
			  .map(({ card, qty }) => {
				if (!card) return null;
				return { ...card, qty };
			  })
			  .filter(Boolean),

			// Raw deck builder state (preserves multi-group splits)
			deckRaw: deck,

			// Flattened rows used by deck submission / admin workflows
			submissionRows,
		  };

		  downloadFile(
			JSON.stringify(deckObj, null, 2),
			`${deckName || "deck"}.json`,
			"application/json",
		  );
    } else if (format === "Image") {
      await exportDeckImage(flatDeck, cards, settings, deckName, game);
    } else if (format === "ImageCompact") {
      await exportDeckImageCompact(flatDeck, cards, settings, deckName, game);
    } else if (format === "PDF") {
      setGeneratingPDF(true);
      try {
        await exportDeckPDF(deck, cards, settings, deckName, game);
      } finally {
        setGeneratingPDF(false);
      }
    } else if (format === "OCTGN") {
      await exportDeckOCTGN(
        deck,
        cards,
        settings,
        deckName,
        octgnOverrides,
        currentGroupBy,
      );
    } else if (format === "LINK") {
		await handleShareLink();
  }
}

  function clearDeck() {
    if (Object.keys(deck).length > 0) {
      if (
        window.confirm(
          "Are you sure you want to clear the current deck? This cannot be undone.",
        )
      ) {
        setDeck({});
        setOctgnOverrides({});
        setActiveSavedDeckName(null);
        setSessionShareInfo(null);
      }
    }
  }

  function importDeck() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json,.o8d,application/xml,text/xml";
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      if (
        !window.confirm(
          "All current progress will be lost! Importing a deck will overwrite your current deck. Continue?",
        )
      ) {
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
            alert(
              `Deck is for game "${deckObj.game}". Switch to that game to import.`,
            );
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
          setActiveSavedDeckName(null);
          setSessionShareInfo(null);
          return;
        }
      } catch (e) {}

      if (
        file.name.toLowerCase().endsWith(".o8d") ||
        text.startsWith("<?xml")
      ) {
        try {
          const parser = new DOMParser();
          const xmlDoc = parser.parseFromString(text, "application/xml");
          importedDeck = {};
          importedOverrides = {};
          notFound = [];

          const sectionNodes = Array.from(
            xmlDoc.getElementsByTagName("section"),
          );
          for (const sectionNode of sectionNodes) {
            const sectionName = sectionNode.getAttribute("name");
            const cardNodes = Array.from(
              sectionNode.getElementsByTagName("card"),
            );
            for (const cardNode of cardNodes) {
              const id = cardNode.getAttribute("id");
              const qty = parseInt(cardNode.getAttribute("qty"), 10) || 1;
              const name =
                cardNode.getAttribute("name") || cardNode.textContent.trim();

              let foundCard = id ? cards.find((c) => c.id === id) : null;
              if (!foundCard && name) {
                foundCard = cards.find((c) => c.name === name);
              }
              if (foundCard) {
                importedDeck[foundCard.id] =
                  (importedDeck[foundCard.id] || 0) + qty;

                if (!groupCounts[foundCard.id]) groupCounts[foundCard.id] = {};
                groupCounts[foundCard.id][sectionName || "Ungrouped"] =
                  (groupCounts[foundCard.id][sectionName || "Ungrouped"] || 0) +
                  qty;
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

              let foundCard = id ? cards.find((c) => c.id === id) : null;
              if (!foundCard && name) {
                foundCard = cards.find((c) => c.name === name);
              }
              if (foundCard) {
                importedDeck[foundCard.id] =
                  (importedDeck[foundCard.id] || 0) + qty;
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
            setActiveSavedDeckName(null);
            setSessionShareInfo(null);
            if (notFound.length > 0) {
              alert(
                "Some cards could not be matched and were not imported:\n" +
                  notFound.join("\n"),
              );
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

  const selectedCardObj = cards.find((c) => c.id === selectedCard);

  return (
    <section className="deck-controls flex-col-center">
      <div className={deckControlsGridClass}>
        <input
          type="text"
          placeholder="Deck name"
          value={deckName}
          onChange={(e) => setDeckName(e.target.value)}
          className={deckNameInputClass}
        />
        <button className={buttonClass} onClick={saveDeck}>
          Save
        </button>
        <div
          style={{ position: "relative", width: "120px" }}
          ref={exportMenuRef}
        >
          <button
            className={buttonClass}
            onClick={() => setExportMenuOpen((open) => !open)}
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
                onClick={() => exportDeck("PDF")}
              >
                Proxy PDF
              </button>
              <button
                className={
                  dropdownHover === 5
                    ? `${dropdownButtonClass} ${dropdownButtonHoverClass}`
                    : dropdownButtonClass
                }
                onMouseEnter={() => setDropdownHover(5)}
                onMouseLeave={() => setDropdownHover(null)}
                onClick={() => exportDeck("LINK")}
              >
                Link
              </button>
			{settings.deckSubmit && (
			  <button
				className={
				  dropdownHover === 7
					? `${dropdownButtonClass} ${dropdownButtonHoverClass}`
					: dropdownButtonClass
				}
				onMouseEnter={() => setDropdownHover(7)}
				onMouseLeave={() => setDropdownHover(null)}
				onClick={() => deckSubmissionRef.current?.open()}
			  >
				Submit Deck
			  </button>
			)}
              {settings.octgnExport && (
                <button
                  className={
                    dropdownHover === 6
                      ? `${dropdownButtonClass} ${dropdownButtonHoverClass}`
                      : dropdownButtonClass
                  }
                  onMouseEnter={() => setDropdownHover(6)}
                  onMouseLeave={() => setDropdownHover(null)}
                  onClick={() => exportDeck("OCTGN")}
                >
                  OCTGN
                </button>
              )}
			  {settings.pdfDecklistExport && (
				  <button
					className={
					  dropdownHover === 8
						? `${dropdownButtonClass} ${dropdownButtonHoverClass}`
						: dropdownButtonClass
					}
					onMouseEnter={() => setDropdownHover(8)}
					onMouseLeave={() => setDropdownHover(null)}
					onClick={() => pdfDecklistRef.current?.open()}
				  >
					Decklist PDF
				  </button>
				)}
            </div>
          )}
          {linkMessage && <div className={linkMessageClass}>{linkMessage}</div>}

          {generatingPDF && (
            <div className={linkMessageClass}>
              PDF Generating, Please Wait...
            </div>
          )}
        </div>
        <button className={buttonClass} onClick={clearDeck}>
          Clear
        </button>
        <button className={buttonClass} onClick={importDeck}>
          Import
        </button>

        {showSetSelector && (
          <div className="modal-backdrop">
            <div className="modal">
              <h3>Select Sets for Image Pack</h3>

              <div
                style={{
                  maxHeight: 240,
                  overflowY: "auto",
                  marginBottom: "1em",
                }}
              >
                {setNames.map((name) => (
                  <label key={name} style={{ display: "block" }}>
                    <input
                      type="checkbox"
                      checked={selectedSetNames.has(name)}
                      onChange={() => {
                        setSelectedSetNames((prev) => {
                          const next = new Set(prev);
                          next.has(name) ? next.delete(name) : next.add(name);
                          return next;
                        });
                      }}
                    />{" "}
                    {name}
                  </label>
                ))}
              </div>

              <div style={{ display: "flex", gap: "0.5em" }}>
                <button
                  className={buttonClass}
                  onClick={() => setSelectedSetNames(new Set(setNames))}
                >
                  All
                </button>

                <button
                  className={buttonClass}
                  onClick={async () => {
                    // Close the modal
                    setShowSetSelector(false);

                    // ---- GUARD: must select at least one set ----
                    if (selectedSetNames.size === 0) {
                      alert("Please select at least one set.");
                      setShowSetSelector(true);
                      return;
                    }

                    // ---- Build allowed set_id list from selected set names ----
                    const allowedSetIds = new Set();
                    for (const setName of selectedSetNames) {
                      const ids = setsByName.get(setName);
                      if (!ids) continue;
                      for (const id of ids) {
                        allowedSetIds.add(id);
                      }
                    }

                    // ---- Filter cards to only selected sets ----
                    const filteredCards = imagePackCards.filter((card) =>
					  allowedSetIds.has(card.set_id),
					);

                    // ---- Safety check ----
                    if (filteredCards.length === 0) {
                      alert("No cards found for the selected sets.");
                      setShowSetSelector(true);
                      return;
                    }

                    // ---- Start export ----
                    cancelExport.current = false;
                    setImagePackProgress({
                      current: 0,
                      total: filteredCards.length,
                    });

                    try {
                      await exportDeckO8c(
                        filteredCards,
                        settings,
                        game,
                        undefined,
                        (current, total) => {
                          setImagePackProgress({ current, total });
                        },
                        cancelExport,
                      );
                    } finally {
                      setImagePackProgress(null);
                      cancelExport.current = false;
                    }
                  }}
                >
                  Export
                </button>

                <button
                  className={buttonClass}
                  onClick={() => {
                    setSelectedSetNames(new Set());
                    setShowSetSelector(false);
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {settings.imagePackExport &&
          (imagePackProgress === null ? (
            <button
		  className={buttonClass}
		  style={{ fontSize: "12px" }}
		  onClick={() => {
			setSelectedSetNames(new Set(setNames));
			setShowSetSelector(true);
		  }}
		>
		  OCTGN Image Pack
		</button>
          ) : (
            <button
              className={buttonClass}
              type="button"
              style={{
                position: "relative",
                padding: undefined, // Let your class control padding
                minHeight: undefined, // Let your class control height
                overflow: "hidden",
                cursor: "pointer",
              }}
              title="Click to cancel"
              onClick={() => {
                cancelExport.current = true;
                setImagePackProgress(null);
              }}
            >
              <span
                style={{
                  zIndex: 2,
                  position: "relative",
                  display: "block",
                  width: "100%",
                  fontSize: 13,
                  color: "inherit",
                  fontFamily: "inherit",
                  textAlign: "center",
                  userSelect: "none",
                }}
              >
                {imagePackProgress.current} / {imagePackProgress.total}
                <br />
                <span style={{ color: "#b00", fontWeight: 600 }}>
                  (Click to Cancel)
                </span>
              </span>
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  width: `${(imagePackProgress.current / Math.max(1, imagePackProgress.total)) * 100}%`,
                  height: "100%",
                  background:
                    "linear-gradient(90deg, #42b0ff 0%, #1357c4 100%)",
                  opacity: 0.55,
                  borderRight: "2px solid #3887fa",
                  boxShadow: "0 0 5px #3182ceaa",
                  transition: "width 0.2s",
                }}
              />
            </button>
          ))}
      </div>
      <div style={{ width: "220px", marginBottom: "1em" }}>
        <CardPreview
          card={selectedCardObj}
          game={game}
          extraData={buildCardPreviewProperties(selectedCardObj, settings)}
        />
      </div>
      <div style={{ width: "100%", maxWidth: 500 }}>
               <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "0.5em",
            marginBottom: "0.5em",
          }}
        >
          <h3 style={{ margin: 0 }}>Saved Decks</h3>
          <button
            className={buttonClass}
            type="button"
            onClick={promptCreateSavedDeckFolder}
            title="Create folder"
            aria-label="Create saved deck folder"
            style={{
              width: "32px",
              height: "32px",
              padding: 0,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "1rem",
            }}
          >
            📁
          </button>
        </div>

        {savedDeckFolderView.folders.map((folder) => (
        <div
		  key={folder.id}
		  onDragOver={(e) => e.preventDefault()}
		  onDrop={(e) => {
			e.preventDefault();
			handleSavedDeckFolderDrop(folder.id);
          }}
          onDragLeave={(e) => {
            if (savedDeckDrag?.type !== "folder") return;
            if (!e.currentTarget.contains(e.relatedTarget)) {
              setSavedDeckFolderDropIndicator(null);
            }
		  }}
		  style={{
			border: "1px solid rgba(255, 255, 255, 0.12)",
			borderRadius: "8px",
			marginBottom: "0.6em",
			overflow: "hidden",
		  }}
		>
            <div
              draggable
              onDragStart={() => handleSavedDeckFolderDragStart(folder.id)}
              onDragEnd={handleSavedDeckDragEnd}
              onDragOver={(e) => handleSavedDeckFolderDragOver(e, folder.id)}
			  style={{
				display: "flex",
				alignItems: "center",
				gap: "0.4em",
				padding: "0.45em 0.55em",
				background: "rgba(255, 255, 255, 0.04)",
				cursor: "grab",
                borderTop:
                  savedDeckFolderDropIndicator?.folderId === folder.id &&
                  savedDeckFolderDropIndicator?.position === "above"
                    ? "2px solid rgba(120, 190, 255, 0.95)"
                    : "2px solid transparent",
                borderBottom:
                  savedDeckFolderDropIndicator?.folderId === folder.id &&
                  savedDeckFolderDropIndicator?.position === "below"
                    ? "2px solid rgba(120, 190, 255, 0.95)"
                    : "2px solid transparent",				
			  }}
			>
              
              <button
                type="button"
                onClick={() => handleToggleSavedDeckFolder(folder.id)}
                style={{
                  background: "none",
                  border: "none",
                  color: "inherit",
                  cursor: "pointer",
                  padding: 0,
                  fontSize: "0.95em",
                }}
				 title={folder.collapsed ? "Expand folder" : "Collapse folder"}
                 aria-label={folder.collapsed ? "Expand folder" : "Collapse folder"}
              >
                {folder.collapsed ? "▶" : "▼"}
              </button>
			   <span style={{ fontSize: "0.95em" }}>📁</span>
               <strong style={{ flex: 1, minWidth: 0 }}>{folder.name}</strong>
              <button
                className={buttonClass}
                type="button"
                onClick={() => handleDeleteSavedDeckFolder(folder.id, folder.name)}
                style={{ width: "60px", height: "1.8em", fontSize: "0.85em" }}
              >
                Delete
              </button>
                       </div>

            {!folder.collapsed && (
              <div style={{ padding: "0.45em 0.4em 0.15em" }}>
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {folder.decks.map((d) =>
				  renderSavedDeckItem(d, { dropTargetFolderId: folder.id })
				)}
                </ul>
                {folder.decks.length === 0 && (
                  <div
                    style={{
                      padding: "0.2em 0.35em 0.45em",
                      fontSize: "0.9em",
                      opacity: 0.7,
                    }}
                  >
                    Drag saved decks here
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            handleSavedDeckRootDrop();
          }}
          style={{
            borderRadius: "8px",
            padding: savedDeckFolderView.unfolderedDecks.length ? 0 : "0.55em",
            border:
              savedDeckFolderView.folders.length > 0
                ? "1px dashed rgba(255, 255, 255, 0.18)"
                : "none",
          }}
        >
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {savedDeckFolderView.unfolderedDecks.map((d) =>
			  renderSavedDeckItem(d, { allowUnfolderDrop: true })
			)}
          </ul>
          {savedDeckFolderView.folders.length > 0 &&
            savedDeckFolderView.unfolderedDecks.length === 0 && (
              <div style={{ fontSize: "0.9em", opacity: 0.7 }}>
                Drag a deck here to remove it from its folder
              </div>
            )}
        </div>
      </div>
	  <DeckSubmissionFlow
		  ref={deckSubmissionRef}
		  deck={deck}
		  cards={cards}
		  game={game}
		  deckName={deckName}
		  buttonClass={buttonClass}
		  deckNameInputClass={deckNameInputClass}
		  hideTriggerButton={true}
		  onBeforeOpen={() => {
			setDropdownHover(null);
			setExportMenuOpen(false);
		  }}
		/>
		<PdfDecklistExportFlow
		  ref={pdfDecklistRef}
		  deck={deck}
		  cards={cards}
		  settings={settings}
		  game={game}
		  deckName={deckName}
		  hideTriggerButton={true}
		  onBeforeOpen={() => {
			setDropdownHover(null);
			setExportMenuOpen(false);
		  }}
		/>
    </section>
  );
}

export default DeckControls;
