import React, { useState } from "react";

function getFilters(cards) {
  // Collect all properties except id, name, image for filtering
  const props = {};
  cards.forEach(card => {
    Object.entries(card).forEach(([k, v]) => {
      if (!["id", "name", "image"].includes(k)) {
        if (!props[k]) props[k] = new Set();
        props[k].add(v);
      }
    });
  });
  return Object.fromEntries(Object.entries(props).map(([k, v]) => [k, Array.from(v)]));
}

function CardListPanel({ cards, settings, onCardSelect, selectedCard, onAddCard, deck }) {
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({});

  const filterProps = getFilters(cards);

  const filtered = cards.filter(card => {
    if (search && !card.name.toLowerCase().includes(search.toLowerCase())) return false;
    for (const [prop, value] of Object.entries(filters)) {
      if (value && card[prop] !== value) return false;
    }
    return true;
  });

  return (
    <aside className="card-list-panel">
      <input
        type="text"
        placeholder="Search cards..."
        value={search}
        onChange={e => setSearch(e.target.value)}
      />
      {/* Filters */}
      <div>
        {Object.keys(filterProps).map(prop => (
          <select
            key={prop}
            value={filters[prop] || ""}
            onChange={e => setFilters(f => ({ ...f, [prop]: e.target.value || undefined }))}
          >
            <option value="">All {prop}</option>
            {filterProps[prop].map(val => (
              <option value={val} key={val}>{val}</option>
            ))}
          </select>
        ))}
      </div>
      <ul>
        {filtered.map(card => (
          <li
            key={card.id}
            className={selectedCard === card.id ? "selected" : ""}
            onClick={() => onCardSelect(card.id)}
            style={deck[card.id] ? {fontWeight: "bold"} : {}}
          >
            <span>{card.name}</span>
            <button onClick={e => {
              e.stopPropagation();
              onAddCard(card.id, 1);
            }}>Add 1</button>
            <button onClick={e => {
              e.stopPropagation();
              onAddCard(card.id, settings.addNValue);
            }}>Add {settings.addNValue}</button>
          </li>
        ))}
      </ul>
      {selectedCard && (
        <div>
          <img
            className="card-preview"
            src={`/games/${settings.gameName}/images/${
              cards.find(c => c.id === selectedCard)?.image
            }`}
            alt={cards.find(c => c.id === selectedCard)?.name}
            onError={e => { e.target.style.display = 'none'; }}
          />
        </div>
      )}
    </aside>
  );
}

export default CardListPanel;