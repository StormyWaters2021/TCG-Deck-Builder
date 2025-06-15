import React, { useEffect, useState } from "react";
import DeckBuilder from "./DeckBuilder";

const fetchGames = async () => {
  const res = await fetch("/games/manifest.json");
  const data = await res.json();
  return data.games;
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
      fetch(`/games/${selectedGame}/settings.json`).then((r) => r.json()),
      fetch(`/games/${selectedGame}/cards.json`).then((r) => r.json())
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