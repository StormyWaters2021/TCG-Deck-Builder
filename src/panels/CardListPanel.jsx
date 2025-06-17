import React, { useState } from "react";

function getFilters(cards, filterOptions) {
  const props = {};
  filterOptions.forEach((k) => {
    props[k] = new Set();
  });
  cards.forEach(card => {
    filterOptions.forEach((k) => {
      if (card[k] !== undefined) {
        props[k].add(card[k]);
      }
    });
  });
  return Object.fromEntries(Object.entries(props).map(([k, v]) => [k, Array.from(v)]));
}

function CardListPanel({ cards, settings, onCardSelect, selectedCard, onAddCard, deck }) {
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({});

  // Use filterOptions from settings
  const filterProps = getFilters(cards, settings.filterOptions || []);

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
      <div style={{maxHeight: "340px", overflowY: "auto"}}>
        <ul style={{margin: 0, padding: 0, listStyle: "none"}}>
          {filtered.map(card => (
            <li
              key={card.id}
              className={selectedCard === card.id ? "selected" : ""}
              onClick={() => onCardSelect(card.id)}
              style={{
                fontWeight: deck[card.id] ? "bold" : "normal",
                cursor: "pointer",
                margin: "0.5em 0",
                padding: "0.25em"
              }}
            >
              <span>{card.name}</span>
              {selectedCard === card.id && (
                <>
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      onAddCard(card.id, 1);
                    }}
                  >+1</button>
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      onAddCard(card.id, settings.addNValue);
                    }}
                  >+{settings.addNValue}</button>
                </>
              )}
            </li>
          ))}
        </ul>
      </div>
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