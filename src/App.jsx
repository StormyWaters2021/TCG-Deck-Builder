import "./styles.css";
import React, { useEffect, useState } from "react";
import DeckBuilder from "./DeckBuilder";

const fetchGames = async () => {
  const gamesManifest = await fetch(
    `${import.meta.env.BASE_URL}games/manifest.json`
  ).then((res) => res.json());
  return gamesManifest.games;
};

// Parses the deck string from URL into deck object your app can use
function parseDeckString(deckStr) {
  const deck = {};
  if (!deckStr) return deck;

  const entries = deckStr.split(";");

  entries.forEach((entry) => {
    const [idPart, rest] = entry.split(":");
    if (!idPart) return;

    let count = 0;
    let tags = [];

    if (rest) {
      const parts = rest.split(",");
      count = parseInt(parts[0], 10) || 0;
      tags = parts.slice(1);
    }

    deck[idPart] = { count, tags };
  });

  return deck;
}

function App() {
  const [games, setGames] = useState([]);
  const [selectedGame, setSelectedGame] = useState("");
  const [gameData, setGameData] = useState({ settings: null, cards: [] });
  const [deck, setDeck] = useState({});

  // For light/dark mode toggle, initialize from localStorage or default false (dark)
  const [isLightMode, setIsLightMode] = useState(() => {
    const saved = localStorage.getItem("lightMode");
    return saved === "true";
  });

  // --- SHARED STATE for grouping and overrides ---
  const [groupBy, setGroupBy] = useState("OCTGN");
  const [octgnOverrides, setOctgnOverrides] = useState({});

  // Apply mode class and persist choice
  useEffect(() => {
    if (isLightMode) {
      document.body.classList.add("light-mode");
    } else {
      document.body.classList.remove("light-mode");
    }
    localStorage.setItem("lightMode", isLightMode);
  }, [isLightMode]);

  // Load games manifest once
  useEffect(() => {
    fetchGames().then(setGames);
  }, []);

  // Parse URL params on mount for initial selected game only
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlGame = params.get("game");
    if (urlGame) {
      setSelectedGame(urlGame);
    }
  }, []);

  // When selectedGame changes, fetch game data
  useEffect(() => {
    if (!selectedGame) return;

    setGameData({ settings: null, cards: [] }); // Reset to show loading

    Promise.all([
      fetch(
        `${import.meta.env.BASE_URL}games/${selectedGame}/settings.json`
      ).then((r) => r.json()),
      fetch(`${import.meta.env.BASE_URL}games/${selectedGame}/cards.json`).then(
        (r) => r.json()
      ),
    ]).then(([settings, cards]) => setGameData({ settings, cards }));

    setDeck({}); // Clear deck on game change to avoid conflicts
    setGroupBy("OCTGN");
    setOctgnOverrides({});
  }, [selectedGame]);

  // When cards load, parse deck from URL (only once)
  useEffect(() => {
    if (!selectedGame) return;
    if (!gameData.cards || gameData.cards.length === 0) return;

    const params = new URLSearchParams(window.location.search);
    const urlDeck = params.get("deck");

    if (urlDeck) {
      setDeck(parseDeckString(urlDeck));
    }
  }, [gameData.cards, selectedGame]);

  const handleGameClick = (game) => {
    if (Object.keys(deck).length > 0 && game !== selectedGame) {
      if (!window.confirm("Switching games will erase your current deck. Continue?")) return;
      setDeck({});
    }
    setSelectedGame(game);
  };

  const handleBackToSelect = () => {
    if (Object.keys(deck).length > 0) {
      const confirmed = window.confirm("All current progress will be lost! Continue?");
      if (!confirmed) return;
    }
    setDeck({});
    setSelectedGame("");
    setGameData({ settings: null, cards: [] });
    setGroupBy("OCTGN");
    setOctgnOverrides({});

    // Clear the URL params to avoid reloading game from URL on next render
    const url = new URL(window.location);
    url.searchParams.delete("game");
    url.searchParams.delete("deck");
    window.history.replaceState({}, "", url.toString());
  };

  return (
    <div className="app-container">
      <header
        className="app-header"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "1rem",
          position: "relative",
        }}
      >
        {/* Left side: Back button or empty */}
        <div style={{ width: 120 }}>
          {selectedGame && (
            <button className="back-button" onClick={handleBackToSelect}>
              Back
            </button>
          )}
        </div>

        {/* Center: Title */}
        <h1
          style={{
            margin: 0,
            position: "absolute",
            left: "50%",
            transform: "translateX(-50%)",
            whiteSpace: "nowrap",
          }}
        >
          TCGBuilder.net
        </h1>

        {/* Right side: Light/dark toggle */}
        <div style={{ width: 120, textAlign: "right" }}>
          <button
            onClick={() => setIsLightMode((prev) => !prev)}
            aria-label={isLightMode ? "Switch to dark mode" : "Switch to light mode"}
            style={{
              cursor: "pointer",
              background: "transparent",
              border: "none",
              fontSize: "1.5rem",
              color: "inherit",
              userSelect: "none",
            }}
            type="button"
            title={isLightMode ? "Switch to dark mode" : "Switch to light mode"}
          >
            {isLightMode ? "☀️" : "🌙"}
          </button>
        </div>
      </header>

      {!selectedGame && (
        <div className="game-grid">
          {games.map((game) => (
            <div
              key={game}
              className="game-card"
              onClick={() => handleGameClick(game)}
            >
              <img
                src={`${import.meta.env.BASE_URL}games/${game}/logo.jpg`}
                alt={game}
                className="game-logo"
              />
            </div>
          ))}
        </div>
      )}

      {selectedGame && (!gameData.cards || gameData.cards.length === 0) && (
        <div className="loading-container">Loading game data...</div>
      )}

      {selectedGame && gameData.settings && gameData.cards.length > 0 && (
        <DeckBuilder
          game={selectedGame}
          settings={gameData.settings}
          cards={gameData.cards}
          deck={deck}
          setDeck={setDeck}
          setGame={setSelectedGame}
          // --- Pass groupBy and octgnOverrides and their setters ---
          groupBy={groupBy}
          setGroupBy={setGroupBy}
          octgnOverrides={octgnOverrides}
          setOctgnOverrides={setOctgnOverrides}
        />
      )}
    </div>
  );
}

export default App;