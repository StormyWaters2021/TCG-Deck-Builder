import React, { useState, useEffect, useRef } from "react";
import CardPreview from "../components/CardPreview";
import DeckSubmissionFlow from "../components/DeckSubmissionFlow";
import { exportDeckO8c } from "../utils/deckImagePackExport";
import ImageExportFlow from "../components/ImageExportFlow";
import { buildCardPreviewProperties } from "../utils/cardPreviewExtra";
import { startDeckImportFlow } from "../utils/deckImportFlow";
import ImagePackExportControl from "../components/ImagePackExportControl";
import {
  exportDeckOCTGN,
  buildDragonDiceTTSString,
  createSharedDeck,
  updateSharedDeck,
} from "../utils/deckExportHelpers";
import ProxyPdfExportFlow from "../components/ProxyPdfExportFlow";
import PdfDecklistExportFlow from "../components/PdfDecklistExportFlow";
import AppModal from "../components/AppModal";
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
  reorderSavedDeckFolders,
  saveSavedDeckFolderState,
  saveSavedDecks,
  toggleSavedDeckFolder,
  buildSavedDeckRecord,
  getSavedDeckByName,
  generateEditToken,
} from "../utils/savedDeckFolders";
import {
  closeModal,
  openMessageModal,
  openInputModal,
  openChoiceModal,
} from "../utils/appModalHelpers";
import SavedDeckLibrary from "../components/SavedDeckLibrary";
import {
  finalizeSavedDeckFlow,
  showLinkResultFlow,
} from "../utils/deckSharingFlow.jsx";

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
  octgnOverrides: octgnOverridesProp,
  setOctgnOverrides: setOctgnOverridesProp,
}) {
  const [deckName, setDeckName] = useState("");
  const [savedDecks, setSavedDecks] = useState(() => loadSavedDecks(game));
  const [savedDeckFolderState, setSavedDeckFolderState] = useState(() =>
    loadSavedDeckFolderState(game),
  );
  const [modalState, setModalState] = useState({
    open: false,
    title: "",
    message: "",
    inputValue: "",
    inputPlaceholder: "",
    showInput: false,
    actions: [],
  });
  const [openVersionsMenu, setOpenVersionsMenu] = useState(null);

  const [activeSavedDeckName, setActiveSavedDeckName] = useState(null);
  const [sessionShareInfo, setSessionShareInfo] = useState(null);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const exportMenuRef = useRef(null);

  const [linkMessage, setLinkMessage] = useState("");
  const [selectedDeckIdx, setSelectedDeckIdx] = useState(null);
  const [dropdownHover, setDropdownHover] = useState(null);
  const [versionsDropdownHover, setVersionsDropdownHover] = useState(null);
  const [currentGroupBy, setCurrentGroupBy] = useState(
    groupBy || (settings.groupOptions && settings.groupOptions[0]) || "Type",
  );

  const [savedDeckDrag, setSavedDeckDrag] = useState(null);
  const [savedDeckFolderDropIndicator, setSavedDeckFolderDropIndicator] =
    useState(null);

const pdfDecklistRef = useRef(null);
const proxyPdfRef = useRef(null);
const [generatingPDF, setGeneratingPDF] = useState(false);
const deckSubmissionRef = useRef(null);
const imageExportRef = useRef(null);

  useEffect(() => {
    if (openVersionsMenu == null) return;

    function handleClickAway() {
      setOpenVersionsMenu(null);
    }

    window.addEventListener("click", handleClickAway);
    return () => window.removeEventListener("click", handleClickAway);
  }, [openVersionsMenu]);

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
      openChoiceModal(setModalState, {
        title: "Load Shared Deck",
        message:
          "You are about to load a shared deck. This will overwrite your current progress.",
        actions: [
          {
            label: "Cancel",
            onClick: () => {
              params.delete("deck");
              window.history.replaceState(
                {},
                "",
                window.location.pathname +
                  (params.toString() ? "?" + params.toString() : ""),
              );
            },
          },
          {
            label: "Load Shared Deck",
            primary: true,
            onClick: async () => {
              try {
                const r = await fetch(`${WORKER_API}/deck/${code}`);
                if (!r.ok) throw new Error("Deck not found");
                const deckObj = await r.json();

                const nextDeck =
                  deckObj?.versions?.current || deckObj?.deck || deckObj;
                const nextName =
                  typeof deckObj?.name === "string" ? deckObj.name : "";

                setDeck(nextDeck);
                setDeckName(nextName);
                setActiveSavedDeckName(null);
                setSessionShareInfo(null);
                setOpenVersionsMenu(null);

                params.delete("deck");
                window.history.replaceState(
                  {},
                  "",
                  window.location.pathname +
                    (params.toString() ? "?" + params.toString() : ""),
                );
              } catch {
                openMessageModal(
                  setModalState,
                  "Shared Deck",
                  "This deck code could not be loaded.",
                );
              }
            },
          },
        ],
      });
      return;
    }

    (async () => {
      try {
        const r = await fetch(`${WORKER_API}/deck/${code}`);
        if (!r.ok) throw new Error("Deck not found");
        const deckObj = await r.json();

        const nextDeck = deckObj?.versions?.current || deckObj?.deck || deckObj;
        const nextName = typeof deckObj?.name === "string" ? deckObj.name : "";

        setDeck(nextDeck);
        setDeckName(nextName);
        setActiveSavedDeckName(null);
        setSessionShareInfo(null);
        setOpenVersionsMenu(null);

        params.delete("deck");
        window.history.replaceState(
          {},
          "",
          window.location.pathname +
            (params.toString() ? "?" + params.toString() : ""),
        );
      } catch {
        openMessageModal(
          setModalState,
          "Shared Deck",
          "This deck code could not be loaded.",
        );
      }
    })();
    // eslint-disable-next-line
  }, [game, cards]);

  useEffect(() => {
    setSavedDecks(loadSavedDecks(game));
    setSavedDeckFolderState(loadSavedDeckFolderState(game));
    setActiveSavedDeckName(null);
    setSessionShareInfo(null);
    setOpenVersionsMenu(null);
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
    const nextState =
      typeof updater === "function" ? updater(savedDeckFolderState) : updater;
    persistSavedDeckFolderState(nextState);
  }

  function upsertCurrentDeckAsSaved({
    name,
    deckValue = deck,
    shareCode,
    editToken,
    sourceName = activeSavedDeckName,
  }) {
    const currentIndex =
      sourceName != null
        ? savedDecks.findIndex((d) => d.name === sourceName)
        : -1;
    const targetIndex = savedDecks.findIndex((d) => d.name === name);
    const record = buildSavedDeckRecord(name, deckValue, {
      shareCode,
      editToken,
    });

    if (currentIndex !== -1) {
      if (targetIndex !== -1 && targetIndex !== currentIndex) {
        openMessageModal(
          setModalState,
          "Name Already Exists",
          `A saved deck named "${name}" already exists. Please choose a different name.`,
        );
        return false;
      }

      const oldName = savedDecks[currentIndex]?.name;
      const nextDecks = savedDecks.map((d, i) =>
        i === currentIndex ? record : d,
      );
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
        openMessageModal(
          setModalState,
          "Name Already Exists",
          `A saved deck named "${name}" already exists. Please choose a different name.`,
        );
        return false;
      }

      const nextDecks = savedDecks.map((d, i) =>
        i === targetIndex ? record : d,
      );
      persistSavedDecks(nextDecks);
      setActiveSavedDeckName(name);
      return true;
    }

    const nextDecks = [...savedDecks, record];
    persistSavedDecks(nextDecks);
    setActiveSavedDeckName(name);
    return true;
  }

  async function createFirstSharedDeck({
    saveLocallyFirst,
    nameOverride,
    sourceNameOverride,
  }) {
    let name = (nameOverride || deckName || "").trim();
    if (!name) {
      openInputModal(setModalState, {
        title: "Deck Name",
        message: "Enter a name for this deck.",
        inputPlaceholder: "Deck name",
        confirmLabel: "Continue",
        onConfirm: async (enteredName) => {
          await createFirstSharedDeck({
            saveLocallyFirst,
            nameOverride: enteredName,
            sourceNameOverride,
          });
        },
      });
      return;
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
      showLinkResultFlow({
        result,
        setLinkMessage,
      });
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
        showLinkResultFlow({
          result,
          successMessage:
            "Shareable link copied to clipboard! The deck was shared, but it was not saved locally because that name already exists.",
          setLinkMessage,
        });
        return;
      }

      setSessionShareInfo(null);
      showLinkResultFlow({
        result,
        setLinkMessage,
      });
      return;
    }

    setSessionShareInfo({
      shareCode: result.code,
      editToken,
      name,
    });
    showLinkResultFlow({
      result,
      successMessage:
        "Shareable link copied to clipboard! Save this deck before leaving if you want to update this link later.",
      setLinkMessage,
    });
  }

  async function handleShareLinkWithName(name) {
    const savedRecord =
      activeSavedDeckName != null
        ? getSavedDeckByName(savedDecks, activeSavedDeckName)
        : null;

    const ownedShare =
      (savedRecord?.shareCode && savedRecord?.editToken
        ? {
            shareCode: savedRecord.shareCode,
            editToken: savedRecord.editToken,
            name: savedRecord.name,
          }
        : null) || sessionShareInfo;

    if (ownedShare?.shareCode && ownedShare?.editToken) {
      openChoiceModal(setModalState, {
        title: "Shared Deck",
        message: `This deck has already been shared as "${ownedShare.name || name}".\n\nChoose whether to update the existing shared deck or create a new one.`,
        actions: [
          {
            label: "Cancel",
            onClick: () => {},
          },
          {
            label: "Save New Deck",
            onClick: async () => {
              openInputModal(setModalState, {
                title: "New Deck Name",
                message: "Enter a name for the new shared deck.",
                initialValue: `${name} (copy)`,
                inputPlaceholder: "Deck name",
                confirmLabel: "Continue",
                onConfirm: async (newName) => {
                  if (savedRecord) {
                    openChoiceModal(setModalState, {
                      title: "Save New Deck",
                      message: `Do you want to save "${newName}" locally as a separate deck before sharing?`,
                      actions: [
                        {
                          label: "Cancel",
                          onClick: () => {},
                        },
                        {
                          label: "Share Without Saving Locally",
                          onClick: async () => {
                            await createFirstSharedDeck({
                              saveLocallyFirst: false,
                              nameOverride: newName,
                              sourceNameOverride: null,
                            });
                          },
                        },
                        {
                          label: "Save Locally and Share",
                          primary: true,
                          onClick: async () => {
                            await createFirstSharedDeck({
                              saveLocallyFirst: true,
                              nameOverride: newName,
                              sourceNameOverride: null,
                            });
                          },
                        },
                      ],
                    });
                    return;
                  }

                  await createFirstSharedDeck({
                    saveLocallyFirst: false,
                    nameOverride: newName,
                    sourceNameOverride: null,
                  });
                },
              });
            },
          },
          {
            label: "Update Deck",
            primary: true,
            onClick: async () => {
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
                  showLinkResultFlow({
                    result,
                    successMessage:
                      "Shared deck updated and link copied to clipboard! The shared deck was updated, but it was not saved locally because that name already exists.",
                    setLinkMessage,
                  });
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

              showLinkResultFlow({
                result,
                successMessage:
                  "Shared deck updated and link copied to clipboard!",
                setLinkMessage,
              });
            },
          },
        ],
      });
      return;
    }

    if (!savedRecord) {
      openChoiceModal(setModalState, {
        title: "Share Unsaved Deck",
        message:
          "This deck has not been saved locally yet.\n\nYou can share it now, but saving it will let you update this same link later.",
        actions: [
          {
            label: "Cancel",
            onClick: () => {},
          },
          {
            label: "Share Without Saving",
            onClick: async () => {
              await createFirstSharedDeck({
                saveLocallyFirst: false,
                nameOverride: name,
              });
            },
          },
          {
            label: "Save and Share",
            primary: true,
            onClick: async () => {
              await createFirstSharedDeck({
                saveLocallyFirst: true,
                nameOverride: name,
              });
            },
          },
        ],
      });
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
        showLinkResultFlow({
          result,
          successMessage:
            "Shareable link copied to clipboard! The deck was shared, but it was not saved locally because that name already exists.",
          setLinkMessage,
        });
        return;
      }

      setSessionShareInfo(null);
    }

    showLinkResultFlow({
      result,
      setLinkMessage,
    });
  }

  async function handleShareLink() {
    let name = (deckName || "").trim();
    if (!name) {
      openInputModal(setModalState, {
        title: "Deck Name",
        message: "Enter a name for this deck.",
        inputPlaceholder: "Deck name",
        confirmLabel: "Continue",
        onConfirm: async (enteredName) => {
          setDeckName(enteredName);
          await handleShareLinkWithName(enteredName);
        },
      });
      return;
    }

    await handleShareLinkWithName(name);
  }

  async function saveDeckWithName(name) {
    const currentSavedRecord =
      activeSavedDeckName != null
        ? getSavedDeckByName(savedDecks, activeSavedDeckName)
        : null;

    const sessionCode = sessionShareInfo?.shareCode;
    const sessionToken = sessionShareInfo?.editToken;

    const currentIndex =
      activeSavedDeckName != null
        ? savedDecks.findIndex((d) => d.name === activeSavedDeckName)
        : -1;

    const targetIndex = savedDecks.findIndex((d) => d.name === name);

    if (currentIndex !== -1) {
      if (targetIndex !== -1 && targetIndex !== currentIndex) {
        openMessageModal(
          setModalState,
          "Name Already Exists",
          `A deck named "${name}" already exists. Please choose a different name.`,
        );
        return;
      }

      const oldName = savedDecks[currentIndex]?.name;
      const shareCode = currentSavedRecord?.shareCode || sessionCode;
      const editToken = currentSavedRecord?.editToken || sessionToken;

      const updatedRecord = buildSavedDeckRecord(name, deck, {
        shareCode,
        editToken,
      });

      const nextDecks = savedDecks.map((d, i) =>
        i === currentIndex ? updatedRecord : d,
      );

      setDeckName(name);

      await finalizeSavedDeckFlow({
        nextDecks,
        savedName: name,
        shareCode,
        editToken,
        oldName,
        localOnlyMessage: "Deck saved.",
        persistSavedDecks,
        updateSavedDeckFolderState,
        renameSavedDeckAssignment,
        setActiveSavedDeckName,
        sessionShareInfo,
        setSessionShareInfo,
        updateSharedDeck,
        deck,
        game,
        openMessageModal: (title, message) =>
          openMessageModal(setModalState, title, message),
      });
      return;
    }

    if (targetIndex !== -1) {
      openChoiceModal(setModalState, {
        title: "Deck Name Already Exists",
        message: `A deck named "${name}" already exists.\n\nChoose whether to overwrite it or save this deck under a new name.`,
        actions: [
          {
            label: "Cancel",
            onClick: () => {},
          },
          {
            label: "Save with New Name",
            onClick: () => {
              openInputModal(setModalState, {
                title: "New Deck Name",
                message: "Enter a new deck name.",
                initialValue: `${name} (copy)`,
                inputPlaceholder: "Deck name",
                confirmLabel: "Save",
                onConfirm: async (newName) => {
                  if (savedDecks.some((d) => d.name === newName)) {
                    openMessageModal(
                      setModalState,
                      "Name Already Exists",
                      "A deck with that name already exists. Please choose another name.",
                    );
                    return;
                  }

                  const shareCode = sessionCode;
                  const editToken = sessionToken;

                  const nextDecks = [
                    ...savedDecks,
                    buildSavedDeckRecord(newName, deck, {
                      shareCode,
                      editToken,
                    }),
                  ];

                  setDeckName(newName);

                  await finalizeSavedDeckFlow({
                    nextDecks,
                    savedName: newName,
                    shareCode,
                    editToken,
                    localOnlyMessage: "Deck saved with new name.",
                    persistSavedDecks,
                    updateSavedDeckFolderState,
                    renameSavedDeckAssignment,
                    setActiveSavedDeckName,
                    sessionShareInfo,
                    setSessionShareInfo,
                    updateSharedDeck,
                    deck,
                    game,
                    openMessageModal: (title, message) =>
                      openMessageModal(setModalState, title, message),
                  });
                },
              });
            },
          },
          {
            label: "Overwrite Existing Deck",
            primary: true,
            onClick: async () => {
              const existingRecord = savedDecks[targetIndex];
              const shareCode = existingRecord?.shareCode || sessionCode;
              const editToken = existingRecord?.editToken || sessionToken;

              const updatedRecord = buildSavedDeckRecord(name, deck, {
                shareCode,
                editToken,
              });

              const nextDecks = savedDecks.map((d, i) =>
                i === targetIndex ? updatedRecord : d,
              );

              setDeckName(name);

              await finalizeSavedDeckFlow({
                nextDecks,
                savedName: name,
                shareCode,
                editToken,
                localOnlyMessage: "Deck overwritten.",
                persistSavedDecks,
                updateSavedDeckFolderState,
                renameSavedDeckAssignment,
                setActiveSavedDeckName,
                sessionShareInfo,
                setSessionShareInfo,
                updateSharedDeck,
                deck,
                game,
                openMessageModal: (title, message) =>
                  openMessageModal(setModalState, title, message),
              });
            },
          },
        ],
      });
      return;
    }
    const shareCode = currentSavedRecord?.shareCode || sessionCode;
    const editToken = currentSavedRecord?.editToken || sessionToken;

    const nextDecks = [
      ...savedDecks,
      buildSavedDeckRecord(name, deck, {
        shareCode,
        editToken,
      }),
    ];

    setDeckName(name);

    await finalizeSavedDeckFlow({
      nextDecks,
      savedName: name,
      shareCode,
      editToken,
      localOnlyMessage: "Deck saved.",
      persistSavedDecks,
      updateSavedDeckFolderState,
      renameSavedDeckAssignment,
      setActiveSavedDeckName,
      sessionShareInfo,
      setSessionShareInfo,
      updateSharedDeck,
      deck,
      game,
      openMessageModal: (title, message) =>
        openMessageModal(setModalState, title, message),
    });
  }

  async function saveDeck() {
    if (!deckName) {
      openInputModal(setModalState, {
        title: "Deck Name",
        message: "Enter a name for this deck.",
        inputPlaceholder: "Deck name",
        confirmLabel: "Save",
        onConfirm: async (enteredName) => {
          setDeckName(enteredName);
          await saveDeckWithName(enteredName);
        },
      });
      return;
    }

    await saveDeckWithName(deckName);
  }

  async function loadSavedDeckVersion(savedDeck, versionKey) {
    if (!savedDeck?.shareCode) {
      openMessageModal(
        setModalState,
        "Versions",
        "This deck does not have a shared version history yet.",
      );
      return;
    }

    try {
      const resp = await fetch(
        `${WORKER_API}/deck/${encodeURIComponent(savedDeck.shareCode)}`,
      );

      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Server returned ${resp.status}: ${text}`);
      }

      const deckObj = await resp.json();

      // Legacy shared decks do not have versions.
      if (!deckObj?.versions) {
        if (versionKey !== "current") {
          openMessageModal(
            setModalState,
            "Versions",
            "This shared deck is a legacy deck and does not have Previous or Original versions.",
          );
          return;
        }

        const nextDeck = deckObj?.deck || deckObj;
        setDeck(nextDeck);
        setDeckName(savedDeck.name || deckObj?.name || "");
        setActiveSavedDeckName(savedDeck.name);
        setSessionShareInfo(null);
        setOpenVersionsMenu(null);
        return;
      }

      const selectedVersion = deckObj.versions?.[versionKey];

      if (!selectedVersion) {
        openMessageModal(
          setModalState,
          "Versions",
          `The ${versionKey} version is not available for this deck.`,
        );
        return;
      }

      setDeck(selectedVersion);
      setDeckName(savedDeck.name || deckObj?.name || "");
      setActiveSavedDeckName(savedDeck.name);
      setSessionShareInfo(null);
      setOpenVersionsMenu(null);
    } catch (e) {
      openMessageModal(
        setModalState,
        "Versions",
        `Could not load deck version.\n\n${e.message || "Unknown error"}`,
      );
    }
  }

  function loadDeck(idx) {
    const doLoad = () => {
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
      setOpenVersionsMenu(null);
    };

    if (Object.keys(deck).length === 0) {
      doLoad();
      return;
    }

    openChoiceModal(setModalState, {
      title: "Load Saved Deck",
      message: "All current progress will be lost.",
      actions: [
        {
          label: "Cancel",
          onClick: () => {},
        },
        {
          label: "Load Deck",
          primary: true,
          onClick: doLoad,
        },
      ],
    });
  }

  function deleteDeck(idx) {
    openChoiceModal(setModalState, {
      title: "Delete Deck",
      message: `Are you sure you want to delete ${savedDecks[idx].name}?`,
      actions: [
        {
          label: "Cancel",
          onClick: () => {},
        },
        {
          label: "Delete",
          primary: true,
          onClick: () => {
            const deckToDelete = savedDecks[idx];
            const newDecks = savedDecks.filter((_, i) => i !== idx);
            persistSavedDecks(newDecks);
            if (deckToDelete?.name) {
              updateSavedDeckFolderState((current) =>
                removeSavedDeckAssignment(current, deckToDelete.name),
              );
            }
          },
        },
      ],
    });
  }

  function promptCreateSavedDeckFolder() {
    openInputModal(setModalState, {
      title: "Create Folder",
      message: "Enter a folder name.",
      inputPlaceholder: "Folder name",
      confirmLabel: "Create",
      onConfirm: (folderName) => {
        const folder = createSavedDeckFolder(folderName);
        if (!folder) return;

        if (
          savedDeckFolderState.folders.some((item) => item.name === folder.name)
        ) {
          openMessageModal(
            setModalState,
            "Folder Already Exists",
            "A saved deck folder with that name already exists.",
          );
          return;
        }

        updateSavedDeckFolderState((current) =>
          addSavedDeckFolder(current, folder),
        );
      },
    });
  }

  function handleDeleteSavedDeckFolder(folderId, folderName) {
    openChoiceModal(setModalState, {
      title: "Delete Folder",
      message: `Delete folder "${folderName}"?\n\nDecks inside it will become unfoldered.`,
      actions: [
        {
          label: "Cancel",
          onClick: () => {},
        },
        {
          label: "Delete Folder",
          primary: true,
          onClick: () => {
            updateSavedDeckFolderState((current) =>
              deleteSavedDeckFolder(current, folderId),
            );
          },
        },
      ],
    });
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

  function handleToggleSavedDeckFolder(folderId) {
    updateSavedDeckFolderState((current) =>
      toggleSavedDeckFolder(current, folderId),
    );
  }

  function handleSavedDeckFolderDrop(targetFolderId) {
    if (savedDeckDrag?.type === "folder") {
      const draggedFolderId = savedDeckDrag.folderId;
      const indicator = savedDeckFolderDropIndicator;
      const position =
        indicator?.folderId === targetFolderId ? indicator.position : "above";

      if (!draggedFolderId || draggedFolderId === targetFolderId) {
        setSavedDeckDrag(null);
        setSavedDeckFolderDropIndicator(null);
        return;
      }

      updateSavedDeckFolderState((current) =>
        reorderSavedDeckFolders(
          current,
          draggedFolderId,
          targetFolderId,
          position,
        ),
      );

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

async function handleDragonDiceTTSExport() {
  const ttsString = buildDragonDiceTTSString(deck, cards);

  if (!ttsString) {
    openMessageModal(
      setModalState,
      "Tabletop Simulator Export",
      "No valid cards found to export.",
    );
    return;
  }

  let copied = false;

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(ttsString);
      copied = true;
    }
  } catch (e) {
    console.warn("Could not copy TTS export to clipboard:", e);
  }

  openMessageModal(
    setModalState,
    copied
      ? "Tabletop Simulator Export Copied"
      : "Tabletop Simulator Export",
    copied
      ? `Copied to clipboard:\n\n${ttsString}`
      : `Could not automatically copy to clipboard. You can manually copy this:\n\n${ttsString}`,
  );
}


  async function exportDeck(format) {
    setExportMenuOpen(false);
    const flatDeck = {};
    Object.entries(deck).forEach(([cardId, entry]) => {
      flatDeck[cardId] = entry.count || 0;
    });

    if (format === "OCTGN") {
      await exportDeckOCTGN(
        deck,
        cards,
        settings,
        deckName,
        octgnOverrides,
        currentGroupBy,
      );
    } else if (format === "DRAGON_DICE_TTS") {
      await handleDragonDiceTTSExport();
    } else if (format === "LINK") {
      await handleShareLink();
    }
  }

  function clearDeck() {
    if (Object.keys(deck).length === 0) return;

    openChoiceModal(setModalState, {
      title: "Clear Deck",
      message:
        "Are you sure you want to clear the current deck? This cannot be undone.",
      actions: [
        {
          label: "Cancel",
          onClick: () => {},
        },
        {
          label: "Clear Deck",
          primary: true,
          onClick: () => {
            setDeck({});
            setOctgnOverrides({});
            setActiveSavedDeckName(null);
            setSessionShareInfo(null);
            setOpenVersionsMenu(null);
          },
        },
      ],
    });
  }

  function importDeck() {
    startDeckImportFlow({
      deck,
      cards,
      game,
      setDeck,
      setOctgnOverrides,
      setActiveSavedDeckName,
      setSessionShareInfo,
      setOpenVersionsMenu,
      openMessageModal: (title, message) =>
        openMessageModal(setModalState, title, message),
      openChoiceModal: (config) => openChoiceModal(setModalState, config),
    });
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
    <>
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
					dropdownHover === 2
					  ? `${dropdownButtonClass} ${dropdownButtonHoverClass}`
					  : dropdownButtonClass
				  }
				  onMouseEnter={() => setDropdownHover(2)}
				  onMouseLeave={() => setDropdownHover(null)}
				  onClick={() => imageExportRef.current?.open()}
				>
				  As Image
				</button>
                <button
                  className={
                    dropdownHover === 4
                      ? `${dropdownButtonClass} ${dropdownButtonHoverClass}`
                      : dropdownButtonClass
                  }
                  onMouseEnter={() => setDropdownHover(4)}
                  onMouseLeave={() => setDropdownHover(null)}
                  onClick={() => proxyPdfRef.current?.open()}
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
                  Share Link
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
				{settings.dragonDiceTTSExport && (
                  <button
                    className={
                      dropdownHover === 9
                        ? `${dropdownButtonClass} ${dropdownButtonHoverClass}`
                        : dropdownButtonClass
                    }
                    onMouseEnter={() => setDropdownHover(9)}
                    onMouseLeave={() => setDropdownHover(null)}
                    onClick={() => exportDeck("DRAGON_DICE_TTS")}
                  >
                    Tabletop Simulator
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
            {linkMessage && (
              <div className={linkMessageClass}>{linkMessage}</div>
            )}

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

          <ImagePackExportControl
            settings={settings}
            cards={cards}
            allCards={allCards}
            exportDeckO8c={exportDeckO8c}
            game={game}
            buttonClass={buttonClass}
          />
        </div>

        <div style={{ width: "220px", marginBottom: "1em" }}>
		<CardPreview
		  card={selectedCardObj}
		  game={game}
		  extraData={buildCardPreviewProperties(selectedCardObj, settings)}
		  disableFlipCardButton={!!settings?.disableFlipCardButton}
		  useGridImageForPreview={!!settings?.useGridImageForPreview}
		/>
        </div>
        <SavedDeckLibrary
          savedDeckFolderView={{
            ...savedDeckFolderView,
            allDecks: savedDecks,
          }}
          savedDeckDrag={savedDeckDrag}
          savedDeckFolderDropIndicator={savedDeckFolderDropIndicator}
          selectedDeckIdx={selectedDeckIdx}
          openVersionsMenu={openVersionsMenu}
          versionsDropdownHover={versionsDropdownHover}
          setSelectedDeckIdx={setSelectedDeckIdx}
          setOpenVersionsMenu={setOpenVersionsMenu}
          setVersionsDropdownHover={setVersionsDropdownHover}
          setSavedDeckFolderDropIndicator={setSavedDeckFolderDropIndicator}
          handleSavedDeckFolderDrop={handleSavedDeckFolderDrop}
          handleSavedDeckRootDrop={handleSavedDeckRootDrop}
          handleSavedDeckFolderDragStart={handleSavedDeckFolderDragStart}
          handleSavedDeckFolderDragOver={handleSavedDeckFolderDragOver}
          handleSavedDeckDragStart={handleSavedDeckDragStart}
          handleSavedDeckDragEnd={handleSavedDeckDragEnd}
          handleToggleSavedDeckFolder={handleToggleSavedDeckFolder}
          handleDeleteSavedDeckFolder={handleDeleteSavedDeckFolder}
          loadDeck={loadDeck}
          deleteDeck={deleteDeck}
          loadSavedDeckVersion={loadSavedDeckVersion}
          promptCreateSavedDeckFolder={promptCreateSavedDeckFolder}
          buttonClass={buttonClass}
          dropdownButtonClass={dropdownButtonClass}
          dropdownButtonHoverClass={dropdownButtonHoverClass}
          listSelectedClass={listSelectedClass}
        />
		<ImageExportFlow
		  ref={imageExportRef}
		  deck={deck}
		  cards={cards}
		  settings={settings}
		  deckName={deckName}
		  game={game}
		  onBeforeOpen={() => {
			setDropdownHover(null);
			setExportMenuOpen(false);
		  }}
		/>
		<ProxyPdfExportFlow
		  ref={proxyPdfRef}
		  deck={deck}
		  cards={cards}
		  settings={settings}
		  deckName={deckName}
		  game={game}
		  onGeneratingChange={setGeneratingPDF}
		  onBeforeOpen={() => {
			setDropdownHover(null);
			setExportMenuOpen(false);
		  }}
		/>
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
      <AppModal
        open={modalState.open}
        title={modalState.title}
        message={modalState.message}
        inputValue={modalState.inputValue}
        inputPlaceholder={modalState.inputPlaceholder}
        autoFocusInput={modalState.showInput}
        onInputChange={
          modalState.showInput
            ? (value) =>
                setModalState((prev) => ({
                  ...prev,
                  inputValue: value,
                }))
            : undefined
        }
        actions={modalState.actions}
        onClose={() => closeModal(setModalState)}
      />
    </>
  );
}

export default DeckControls;