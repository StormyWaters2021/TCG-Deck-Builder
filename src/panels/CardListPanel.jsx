import React, { useState } from "react";

// Helper: Gather all possible filter options for dropdowns
function getFilters(cards, filterOptions, delimiter = null) {
  const props = {};
  filterOptions.forEach((k) => {
    props[k] = new Set();
  });

  cards.forEach(card => {
    filterOptions.forEach((k) => {
      if (card[k] !== undefined && card[k] !== null) {
        const rawVal = card[k];
        const values = (typeof rawVal === "string" && delimiter)
          ? rawVal.split(delimiter).map(v => v.trim()).filter(v => v !== "")
          : [typeof rawVal === "string" ? rawVal.trim() : rawVal];

        values.forEach(val => {
          if (val !== "" && !(typeof val === "string" && val.match(/^\s*$/))) {
            props[k].add(val);
          }
        });
      }
    });
  });

  // Always add an entry for "(none)" to the top of each filter
  return Object.fromEntries(
    Object.entries(props).map(([k, v]) => [
      k,
      [null, ...Array.from(v).sort((a, b) =>
        String(a).localeCompare(String(b), undefined, {
          numeric: true,
          sensitivity: "base"
        })
      )],
    ])
  );
}

// Helper: Parse search string into criteria for advanced searching
function parseSearchString(search, searchPrefixes) {
  const prefixPattern = Object.keys(searchPrefixes)
    .map(prefix => prefix.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&'))
    .join('|');
  const regex = new RegExp(
    `(?:\\s*(${prefixPattern})\\s*(?:"([^"]+)"|\\(([^)]+)\\)|([^\\s]+)))|([^\\s]+)`,
    "gi"
  );
  const criteria = [];
  let match;
  while ((match = regex.exec(search)) !== null) {
    if (match[1]) {
      let value = match[2] || match[3] || match[4] || "";
      if (typeof value === "string" && value.trim().toLowerCase() === "none") {
        criteria.push({ property: searchPrefixes[match[1]], value: "__BLANK_OR_MISSING__" });
      } else if (typeof value === "string" && value.trim().toLowerCase() === "(none)") {
        criteria.push({ property: searchPrefixes[match[1]], value: "__BLANK_OR_MISSING__" });
      } else {
        criteria.push({ property: searchPrefixes[match[1]], value: value.trim() });
      }
    } else if (match[5]) {
      criteria.push({ property: "name", value: match[5].trim() });
    }
  }
  return criteria;
}

// Helper: Get only one card per unique (name, Subtitle) pair
function getUniqueCardsByName(cards) {
  const map = new Map();
  for (const card of cards) {
    const key = `${card.name}|||${card.Subtitle ?? ""}`;
    if (!map.has(key)) {
      map.set(key, card);
    }
  }
  return Array.from(map.values());
}

function CardListPanel({ cards, settings, onCardSelect, selectedCard, onAddCard, deck }) {
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({});

  const filterDelimiter = settings.filterDelimiter || null;
  const filterProps = getFilters(cards, settings.filterOptions || [], filterDelimiter);
  const searchPrefixes = settings.searchPrefixes || {};

  const filtered = cards.filter(card => {
    // Advanced search
    if (search.trim().length > 0) {
      const criteria = parseSearchString(search.trim(), searchPrefixes);
      for (const { property, value } of criteria) {
        if (value === "__BLANK_OR_MISSING__") {
          if (
            card[property] !== undefined &&
            card[property] !== null &&
            !(typeof card[property] === "string" && card[property].trim() === "")
          ) {
            return false;
          }
        } else {
          if (!card[property] || !card[property].toString().toLowerCase().includes(value.toLowerCase())) {
            return false;
          }
        }
      }
    }

    // Dropdown filters
    for (const [prop, value] of Object.entries(filters)) {
      if (value === undefined) continue;

      const rawVal = card[prop];

      if (value === "(none)") {
        if (
          rawVal !== undefined &&
          rawVal !== null &&
          !(typeof rawVal === "string" && rawVal.trim() === "")
        ) {
          return false;
        }
      } else {
        // If delimiter is enabled, check if any value matches
        const values = (typeof rawVal === "string" && filterDelimiter)
          ? rawVal.split(filterDelimiter).map(v => v.trim())
          : [typeof rawVal === "string" ? rawVal.trim() : rawVal];

        const stringifiedValue = String(value).trim();
        if (!values.some(v => String(v).trim() === stringifiedValue)) {
          return false;
        }
      }
    }

    return true;
  });

  const uniqueCards = getUniqueCardsByName(filtered);

  const prefixEntries = Object.entries(searchPrefixes);
  const hasPrefixes = prefixEntries.length > 0;

  function handleClearFilters() {
    setSearch("");
    setFilters({});
  }

  return (
    <aside className="card-list-panel">
      {hasPrefixes && (
        <div style={{ marginBottom: "0.5em", fontSize: "0.95em" }}>
          <strong>Search prefixes:</strong>{" "}
          {prefixEntries.map(([prefix, property], idx) => (
            <span key={prefix} style={{ marginRight: "1em" }}>
              <code>{prefix}"..."</code> <span className="search-prefix-property">({property})</span>
            </span>
          ))}
          <div style={{ marginTop: "0.25em", fontSize: "0.92em" }}>
            Also supports{" "}
            {prefixEntries.map(([p], idx) =>
              <code key={p}>
                {p}"none"{idx < prefixEntries.length - 1 ? ", " : ""}
              </code>
            )}
            or <code>(none)</code> as the value.
          </div>
        </div>
      )}
      <input
        type="text"
        placeholder="Search cards..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        title={
          hasPrefixes
            ? `Search by name by default. Use prefixes like ${prefixEntries.map(([p]) => `${p}"..."`).join(', ')}. Use ${prefixEntries.map(([p]) => `${p}"none"`).join(', ')} for blank/missing.`
            : "Search by name."
        }
      />
      <button
        type="button"
        onClick={handleClearFilters}
        style={{ margin: "0.5em 0", padding: "0.25em 1em" }}
      >
        Clear Filters
      </button>
      <div>
        {Object.keys(filterProps).map(prop => (
          <select
            key={prop}
            value={
              filters[prop] === undefined
                ? ""
                : filters[prop] === null
                ? "(none)"
                : filters[prop]
            }
            onChange={e =>
              setFilters(f => {
                const v = e.target.value;
                return {
                  ...f,
                  [prop]:
                    v === ""
                      ? undefined
                      : v === "(none)"
                      ? "(none)"
                      : v,
                };
              })
            }
          >
            <option value="">All {prop}</option>
            <option value="(none)">(none)</option>
            {filterProps[prop]
              .filter(val => val !== null)
              .map(val => (
                <option value={val} key={val}>
                  {val}
                </option>
              ))}
          </select>
        ))}
      </div>
      <div style={{ maxHeight: "340px", overflowY: "auto" }}>
        <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
          {uniqueCards.map(card => (
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
              <span>
                {card.name}
                {card.Subtitle ? ` - ${card.Subtitle}` : ""}
              </span>
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
    </aside>
  );
}

export default CardListPanel;
