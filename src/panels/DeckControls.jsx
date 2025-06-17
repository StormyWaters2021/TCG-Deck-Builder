import React, { useState, useEffect } from "react";

function DeckControls({ deck, cards, settings, game, setDeck }) {
  const [deckName, setDeckName] = useState("");
  const [savedDecks, setSavedDecks] = useState(() =>
    JSON.parse(localStorage.getItem(`${game}-decks`) || "[]")
  );

  useEffect(() => {
    setSavedDecks(JSON.parse(localStorage.getItem(`${game}-decks`) || "[]"));
  }, [game]);

  const [selectedDeckIdx, setSelectedDeckIdx] = useState(null);

  function saveDeck() {
    if (!deckName) {
      alert("Please enter a deck name.");
      return;
    }
    const newDecks = [...savedDecks, { name: deckName, deck }];
    setSavedDecks(newDecks);
    localStorage.setItem(`${game}-decks`, JSON.stringify(newDecks));
  }
  function loadDeck(idx) {
    if (!window.confirm(`All current progress will be lost! Do you want to load ${savedDecks[idx].name}?`)) return;
    setDeck(savedDecks[idx].deck);
  }
  function deleteDeck(idx) {
    if (!window.confirm(`Are you sure you want to delete ${savedDecks[idx].name}?`)) return;
    const newDecks = savedDecks.filter((_, i) => i !== idx);
    setSavedDecks(newDecks);
    localStorage.setItem(`${game}-decks`, JSON.stringify(newDecks));
  }
  function exportDeck(format) {
    if (format === "TXT") {
      let txt = `Deck: ${deckName}\n`;
      for (const [cardId, qty] of Object.entries(deck)) {
        const card = cards.find(c => c.id === cardId);
        txt += `${card ? card.name : cardId} x${qty}\n`;
      }
      downloadFile(txt, `${deckName || "deck"}.txt`, "text/plain");
    } else if (format === "JSON") {
      const deckObj = {
        name: deckName,
        game,
        deck: Object.entries(deck).map(([cardId, qty]) => {
          const card = cards.find(c => c.id === cardId);
          return { ...card, qty };
        })
      };
      downloadFile(JSON.stringify(deckObj, null, 2), `${deckName || "deck"}.json`, "application/json");
    } else if (format === "Image") {
      exportDeckImage(deck, cards, settings, deckName);
    }
  }
  function importDeck() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.onchange = async e => {
      const file = e.target.files[0];
      if (!file) return;
      const text = await file.text();
      try {
        const deckObj = JSON.parse(text);
        if (!deckObj.game || !deckObj.deck) throw new Error("Invalid deck file.");
        if (deckObj.game !== game) {
          alert(`Deck is for game "${deckObj.game}". Switch to that game to import.`);
          return;
        }
        if (!window.confirm("All current progress will be lost! Import deck?")) return;
        const newDeck = {};
        for (const card of deckObj.deck) {
          newDeck[card.id] = card.qty;
        }
        setDeck(newDeck);
      } catch (e) {
        alert("Invalid or corrupted deck file.");
      }
    };
    input.click();
  }

  function downloadFile(data, filename, type) {
    const blob = new Blob([data], { type });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function exportDeckImage(deck, cards, settings, deckName) {
    // Basic collage, no dependencies
    const canvas = document.createElement("canvas");
    const size = 120, pad = 5;
    const cardIds = Object.keys(deck);
    const cols = 5, rows = Math.ceil(cardIds.length / cols);
    canvas.width = cols * (size + pad) + pad;
    canvas.height = rows * (size + pad) + 60;
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.font = "18px sans-serif";
    ctx.fillStyle = "#222";
    ctx.fillText(deckName || "Deck", 10, 25);

    let loaded = 0;
    cardIds.forEach((cardId, i) => {
      const card = cards.find(c => c.id === cardId);
      const img = new window.Image();
      img.src = `${import.meta.env.BASE_URL}games/${settings.gameName}/images/${card?.image}`;
      img.onload = () => {
        const x = pad + (i % cols) * (size + pad);
        const y = pad + 40 + Math.floor(i / cols) * (size + pad);
        ctx.drawImage(img, x, y, size, size);
        ctx.font = "14px sans-serif";
        ctx.fillStyle = "#222";
        ctx.fillText("x" + deck[cardId], x + 5, y + size - 5);
        loaded++;
        if (loaded === cardIds.length) trigger();
      };
    });
    function trigger() {
      canvas.toBlob(blob => {
        downloadFile(blob, `${deckName || "deck"}.png`, "image/png");
      }, "image/png");
    }
    // If no images, just trigger
    if (!cardIds.length) trigger();
  }

  return (
    <section className="deck-controls">
      <input
        type="text"
        placeholder="Deck name"
        value={deckName}
        onChange={e => setDeckName(e.target.value)}
      />
      <button onClick={saveDeck}>Save</button>
      <button onClick={() => exportDeck("TXT")}>Export TXT</button>
      <button onClick={() => exportDeck("Image")}>Export Image</button>
      <button onClick={() => exportDeck("JSON")}>Export JSON</button>
      <button onClick={importDeck}>Import</button>
      <div>
        <h3>Saved Decks</h3>
        <ul>
          {savedDecks.map((d, i) => (
            <li
              key={i}
              className={selectedDeckIdx === i ? "selected" : ""}
              onClick={() => setSelectedDeckIdx(i)}
            >
              <span>{d.name}</span>
              <button onClick={e => { e.stopPropagation(); loadDeck(i); }}>Load</button>
              <button onClick={e => { e.stopPropagation(); deleteDeck(i); }}>Delete</button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export default DeckControls;