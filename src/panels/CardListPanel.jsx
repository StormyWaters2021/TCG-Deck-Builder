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

// Helper: Parse search string into criteria for advanced searching
function parseSearchString(search, searchPrefixes) {
  // Build a regex that matches all configured prefixes
  const prefixPattern = Object.keys(searchPrefixes)
    .map(prefix => prefix.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')) // Escape regex chars
    .join('|');
  // Match: prefix:"multi word", prefix:(multi word), prefix:word, or bareword (for name)
  const regex = new RegExp(
    `(?:\\s*(${prefixPattern})\\s*(?:"([^"]+)"|\\(([^)]+)\\)|([^\\s]+)))|([^\\s]+)`,
    "gi"
  );
  const criteria = [];
  let match;
  while ((match = regex.exec(search)) !== null) {
    if (match[1]) {
      // Prefixed
      let value = match[2] || match[3] || match[4] || "";
      criteria.push({ property: searchPrefixes[match[1]], value: value.trim() });
    } else if (match[5]) {
      // Unprefixed, search name by default
      criteria.push({ property: "name", value: match[5].trim() });
    }
  }
  return criteria;
}

function CardListPanel({ cards, settings, onCardSelect, selectedCard, onAddCard, deck }) {
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({});

  // Use filterOptions from settings
  const filterProps = getFilters(cards, settings.filterOptions || []);
  const searchPrefixes = settings.searchPrefixes || {};

  // Enhanced filtering logic for advanced search
  const filtered = cards.filter(card => {
    if (search.trim().length > 0) {
      const criteria = parseSearchString(search.trim(), searchPrefixes);
      // All criteria must match (logical AND)
      for (const { property, value } of criteria) {
        if (!card[property] || !card[property].toString().toLowerCase().includes(value.toLowerCase())) {
          return false;
        }
      }
    }
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
        title={`Search by name by default. Use prefixes like ${Object.keys(searchPrefixes).map(p=>`${p}"..."`).join(', ')}. Multiple criteria allowed.`}
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
