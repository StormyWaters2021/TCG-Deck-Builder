import "./styles.css";
import React, { useEffect, useState } from "react";
import DeckBuilder from "./DeckBuilder";

const fetchGames = async () => {
  const gamesManifest = await fetch(`${import.meta.env.BASE_URL}games/manifest.json`).then(res => res.json());
  return gamesManifest.games;
};

function App() {
  const [games, setGames] = useState([]);
  const [selectedGame, setSelectedGame] = useState("");
  const [pendingGame, setPendingGame] = useState(""); // Used for <select> value
  const [gameData, setGameData] = useState({ settings: null, cards: [] });
  const [deck, setDeck] = useState({});

  // On mount, check if URL has game/deck params and auto-select game if needed
  useEffect(() => {
    fetchGames().then(setGames);
  }, []);

  // Try to parse ?game=...&deck=... on mount
  useEffect(() => {
    let params = new URLSearchParams(window.location.search);
    let urlGame = params.get("game");
    if (urlGame && (!selectedGame || selectedGame !== urlGame)) {
      setSelectedGame(urlGame);
      setPendingGame(urlGame);
    }
    // eslint-disable-next-line
  }, []);

  useEffect(() => {
    setPendingGame(selectedGame);
    if (!selectedGame) return;
    Promise.all([
      fetch(`${import.meta.env.BASE_URL}games/${selectedGame}/settings.json`).then((r) => r.json()),
      fetch(`${import.meta.env.BASE_URL}games/${selectedGame}/cards.json`).then((r) => r.json())
    ]).then(([settings, cards]) => setGameData({ settings, cards }));
  }, [selectedGame]);

  const handleGameChange = (e) => {
    const newGame = e.target.value;
    if (selectedGame && Object.keys(deck).length > 0 && newGame !== selectedGame) {
      if (window.confirm("Switching games will erase your current deck. Continue?")) {
        setDeck({});
        setSelectedGame(newGame);
        setPendingGame(newGame);
      } else {
        // Revert <select> value to previous game
        setPendingGame(selectedGame);
      }
    } else {
      setSelectedGame(newGame);
      setPendingGame(newGame);
    }
  };

  return (
    <div>
      <header>
        <h1>Trading Card Game Deck Builder</h1>
        <select value={pendingGame} onChange={handleGameChange}>
          <option value="">Select a Game...</option>
          {games.map(game => (
            <option key={game} value={game}>{game}</option>
          ))}
        </select>
      </header>
      {selectedGame && gameData.settings && (
        <DeckBuilder
          game={selectedGame}
          settings={gameData.settings}
          cards={gameData.cards}
          deck={deck}
          setDeck={setDeck}
          setGame={setSelectedGame}
        />
      )}
    </div>
  );
}

export default App;