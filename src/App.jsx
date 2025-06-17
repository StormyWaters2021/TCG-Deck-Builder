import React, { useEffect, useState } from "react";
import DeckBuilder from "./DeckBuilder";

const fetchGames = async () => {
  const gamesManifest = await fetch(`${import.meta.env.BASE_URL}games/manifest.json`).then(res => res.json());
  return gamesManifest.games;
};

function App() {
  const [games, setGames] = useState([]);
  const [selectedGame, setSelectedGame] = useState("");
  const [gameData, setGameData] = useState({ settings: null, cards: [] });

  useEffect(() => {
    fetchGames().then(setGames);
  }, []);

  useEffect(() => {
    if (!selectedGame) return;
    Promise.all([
      fetch(`${import.meta.env.BASE_URL}games/${selectedGame}/settings.json`).then((r) => r.json()),
      fetch(`${import.meta.env.BASE_URL}games/${selectedGame}/cards.json`).then((r) => r.json())
    ]).then(([settings, cards]) => setGameData({ settings, cards }));
  }, [selectedGame]);

  return (
    <div>
      <header>
        <h1>Trading Card Game Deck Builder</h1>
        <select value={selectedGame} onChange={e => setSelectedGame(e.target.value)}>
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
        />
      )}
    </div>
  );
}

export default App;