import React, { useState, useEffect, useRef } from "react";
import CardPreview from "../components/CardPreview"; // Adjust path as needed

function DeckControls({ deck, cards, settings, game, setDeck, selectedCard }) {
  const [deckName, setDeckName] = useState("");
  const [savedDecks, setSavedDecks] = useState(() =>
    JSON.parse(localStorage.getItem(`${game}-decks`) || "[]")
  );
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const exportMenuRef = useRef(null);

  useEffect(() => {
    setSavedDecks(JSON.parse(localStorage.getItem(`${game}-decks`) || "[]"));
  }, [game]);

  // Close export dropdown if clicking outside
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
    setExportMenuOpen(false);
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

  function clearDeck() {
    if (Object.keys(deck).length > 0) {
      if (window.confirm("Are you sure you want to clear the current deck? This cannot be undone.")) {
        setDeck({});
      }
    }
  }

  function downloadFile(data, filename, type) {
    // If the data is a Blob, use as is
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

  // ----------- ENHANCED EXPORT TO IMAGE FUNCTION -----------
  function exportDeckImage(deck, cards, settings, deckName) {
    // Order deck entries for consistency
    const deckEntries = Object.entries(deck)
      .filter(([, qty]) => qty > 0)
      .map(([cardId, qty]) => {
        const card = cards.find(c => c.id === cardId);
        return { card, qty };
      })
      .filter(({ card }) => card);

    if (deckEntries.length === 0) {
      alert("Your deck is empty!");
      return;
    }

    // Load all images and get their aspect ratios
    Promise.all(deckEntries.map(({ card }) => {
      const imageUrl = card && card.image
        ? `${import.meta.env.BASE_URL}games/${settings.gameName}/images/${card.image}`
        : null;
      return new Promise((resolve) => {
        if (!imageUrl) {
          resolve({ img: null, aspect: 1 });
          return;
        }
        const img = new window.Image();
        img.onload = () => resolve({ img, aspect: img.width / img.height });
        img.onerror = () => resolve({ img: null, aspect: 1 });
        img.src = imageUrl;
      });
    })).then(images => {
      // Settings
      const cardWidth = 140; // px
      const cardPadding = 18; // px between cards
      const quantityFont = "bold 32px sans-serif";
      const quantityColor = "yellow";
      const quantityStroke = "black";
      const quantityOffset = 10; // px from top-left
      const maxPerRow = 5;

      // Determine each card's height to preserve aspect ratio
      const cardHeights = images.map(({ aspect }) => cardWidth / (aspect || 1));
      const maxCardHeight = Math.max(...cardHeights);

      // Layout
      const count = deckEntries.length;
      const rows = Math.ceil(count / maxPerRow);
      const cols = Math.min(count, maxPerRow);

      const canvasWidth = cols * cardWidth + (cols + 1) * cardPadding;
      const canvasHeight = rows * maxCardHeight + (rows + 1) * cardPadding + 60;

      // Create and set up canvas
      const canvas = document.createElement("canvas");
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
      const ctx = canvas.getContext("2d");

      // Background
      ctx.fillStyle = "#222";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Deck name/title
      ctx.font = "bold 28px sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillStyle = "#fff";
      ctx.fillText(deckName || "Deck", cardPadding, cardPadding);

      // Draw each card and quantity
      for (let i = 0; i < deckEntries.length; ++i) {
        const { card, qty } = deckEntries[i];
        const { img, aspect } = images[i];
        const row = Math.floor(i / maxPerRow);
        const col = i % maxPerRow;
        // Each card gets same width, height based on its aspect ratio
        const thisCardHeight = cardWidth / (aspect || 1);
        // Center in cell if some cards are taller
        const yOffset = (maxCardHeight - thisCardHeight) / 2;

        const x = cardPadding + col * (cardWidth + cardPadding);
        const y = cardPadding + 40 + row * (maxCardHeight + cardPadding) + yOffset;

        // Draw card image or placeholder
        if (img) {
          ctx.drawImage(img, x, y, cardWidth, thisCardHeight);
        } else {
          ctx.fillStyle = "#555";
          ctx.fillRect(x, y, cardWidth, thisCardHeight);
          ctx.fillStyle = "#eee";
          ctx.font = "italic 18px sans-serif";
          ctx.fillText(card?.name || "Unknown", x + 8, y + 30);
        }

        // Draw quantity badge
        ctx.font = quantityFont;
        ctx.textBaseline = "top";
        ctx.lineWidth = 5;
        ctx.strokeStyle = quantityStroke;
        ctx.strokeText(`×${qty}`, x + quantityOffset, y + quantityOffset);
        ctx.fillStyle = quantityColor;
        ctx.fillText(`×${qty}`, x + quantityOffset, y + quantityOffset);
      }

      // Export as image
      canvas.toBlob(blob => {
        downloadFile(blob, `${deckName || "deck"}.png`, "image/png");
      }, "image/png");
    });
  }
  // ----------- END ENHANCED EXPORT TO IMAGE FUNCTION -----------

  // Button style for uniform size
  const buttonStyle = {
    width: "120px",
    height: "2.2em",
    fontSize: "1em",
    margin: 0,
    padding: 0,
    boxSizing: "border-box",
    cursor: "pointer"
  };

  // Find the selected card object from cards array
  const selectedCardObj = cards.find(c => c.id === selectedCard);

  return (
    <section className="deck-controls" style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      {/* Button Grid */}
      <div
        className="deck-controls-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
          gap: "0.7em",
          marginBottom: "1.5em",
          width: "100%",
          maxWidth: 500,
          justifyItems: "center"
        }}
      >
        <input
          type="text"
          placeholder="Deck name"
          value={deckName}
          onChange={e => setDeckName(e.target.value)}
          style={{
            ...buttonStyle,
            width: "100%", // input stretches across grid
            gridColumn: "1/-1",
            marginBottom: "0.25em"
          }}
        />
        <button style={buttonStyle} onClick={saveDeck}>Save</button>
        {/* Export Dropdown */}
        <div style={{ position: "relative", width: "120px" }} ref={exportMenuRef}>
          <button
            style={buttonStyle}
            onClick={() => setExportMenuOpen(open => !open)}
          >
            Export ▼
          </button>
          {exportMenuOpen && (
            <div
              style={{
                position: "absolute",
                top: "100%",
                left: 0,
                zIndex: 10,
                background: "#fff",
                border: "1px solid #ccc",
                boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                minWidth: "120px",
                width: "120px",
              }}
              onMouseLeave={() => setExportMenuOpen(false)}
            >
              <button
                style={{
                  ...buttonStyle,
                  width: "100%",
                  height: "2.2em",
                  border: "none",
                  background: "none",
                  textAlign: "left",
                  paddingLeft: "1em",
                  cursor: "pointer",
                }}
                onClick={() => exportDeck("TXT")}
              >
                TXT
              </button>
              <button
                style={{
                  ...buttonStyle,
                  width: "100%",
                  height: "2.2em",
                  border: "none",
                  background: "none",
                  textAlign: "left",
                  paddingLeft: "1em",
                  cursor: "pointer",
                }}
                onClick={() => exportDeck("JSON")}
              >
                JSON
              </button>
              <button
                style={{
                  ...buttonStyle,
                  width: "100%",
                  height: "2.2em",
                  border: "none",
                  background: "none",
                  textAlign: "left",
                  paddingLeft: "1em",
                  cursor: "pointer",
                }}
                onClick={() => exportDeck("Image")}
              >
                Image
              </button>
            </div>
          )}
        </div>
        {/* Clear button before Import */}
        <button style={buttonStyle} onClick={clearDeck}>Clear</button>
        <button style={buttonStyle} onClick={importDeck}>Import</button>
      </div>
      {/* Card Preview BELOW the buttons */}
      <div style={{ width: "220px", marginBottom: "1em" }}>
        <CardPreview card={selectedCardObj} game={game} />
      </div>
      {/* Saved Decks List */}
      <div style={{ width: "100%", maxWidth: 500 }}>
        <h3>Saved Decks</h3>
        <ul style={{ listStyle: "none", padding: 0 }}>
          {savedDecks.map((d, i) => (
            <li
              key={i}
              className={selectedDeckIdx === i ? "selected" : ""}
              onClick={() => setSelectedDeckIdx(i)}
              style={{
                display: "flex",
                alignItems: "center",
                background: selectedDeckIdx === i ? "#eef" : undefined,
                padding: "0.25em 0.5em",
                borderRadius: "4px",
                marginBottom: "0.3em",
                cursor: "pointer"
              }}
            >
              <span style={{ flex: 1 }}>{d.name}</span>
              <button style={{ ...buttonStyle, width: "60px", height: "1.8em", fontSize: "0.9em", marginRight: "0.3em" }} onClick={e => { e.stopPropagation(); loadDeck(i); }}>Load</button>
              <button style={{ ...buttonStyle, width: "60px", height: "1.8em", fontSize: "0.9em" }} onClick={e => { e.stopPropagation(); deleteDeck(i); }}>Delete</button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export default DeckControls;