async function getCurrentGameOctgnGuid(game) {
  let baseUrl = import.meta.env.BASE_URL || "";
  if (baseUrl.endsWith("/")) baseUrl = baseUrl.slice(0, -1);

  const url = `${baseUrl}/games/${game}/octgn.json`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error("OCTGN config not found");

  const json = await resp.json();
  return json?.gameId || json?.guid || json?.gameGuid || null;
}

export function startDeckImportFlow({
  deck,
  cards,
  game,
  setDeck,
  setOctgnOverrides,
  setActiveSavedDeckName,
  setSessionShareInfo,
  setOpenVersionsMenu,
  openMessageModal,
  openChoiceModal,
}) {
  const startImport = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json,.o8d,application/xml,text/xml";

    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;

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
            openMessageModal(
              "Wrong Game",
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
          setOpenVersionsMenu(null);
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
          const deckRoot = xmlDoc.documentElement;
          const deckGameId =
            deckRoot?.getAttribute("game") ||
            deckRoot?.getAttribute("gameId") ||
            deckRoot?.getAttribute("id") ||
            null;
          try {
            const currentGameGuid = await getCurrentGameOctgnGuid(game);

            if (
              deckGameId &&
              currentGameGuid &&
              deckGameId.toLowerCase() !== currentGameGuid.toLowerCase()
            ) {
              openMessageModal(
                "Wrong Game",
                "This OCTGN deck is for a different game. Switch to the correct game before importing.",
              );
              return;
            }
          } catch {
            // If local OCTGN config can't be read, skip explicit game validation
          }
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

                if (!groupCounts[foundCard.id]) {
                  groupCounts[foundCard.id] = {};
                }
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
              wrappedDeck[id] = {
                count: totalCount,
                group: groupCounts[id],
              };
            });

            setDeck(wrappedDeck);
            setOctgnOverrides(importedOverrides);
            setActiveSavedDeckName(null);
            setSessionShareInfo(null);
            setOpenVersionsMenu(null);

            if (notFound.length > 0) {
              openMessageModal(
                "Import Warning",
                "Some cards could not be matched and were not imported:\n" +
                  notFound.join("\n"),
              );
            }
          } else {
            openMessageModal(
              "Import Failed",
              "No cards could be loaded from this deck file.",
            );
          }
          return;
        } catch (e) {
          openMessageModal("Import Failed", "Failed to parse OCTGN deck file.");
          return;
        }
      }

      openMessageModal("Import Failed", "Invalid or unsupported deck file.");
    };

    input.click();
  };

  if (Object.keys(deck).length === 0) {
    startImport();
    return;
  }

  openChoiceModal({
    title: "Import Deck",
    message:
      "All current progress will be lost! Importing a deck will overwrite your current deck.",
    actions: [
      {
        label: "Cancel",
        onClick: () => {},
      },
      {
        label: "Import Deck",
        primary: true,
        onClick: startImport,
      },
    ],
  });
}
