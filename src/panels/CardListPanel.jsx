import React, { useState, useEffect, useRef } from "react";

// --- Tooltip helper component with inherited colors ---
function InfoTooltip({ text }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e) {
      if (e.key === "Escape") setOpen(false);
    }
    function onClick(e) {
      setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  return (
    <span style={{ position: "relative", display: "inline-block", marginLeft: 8 }}>
      <span
        tabIndex={0}
        aria-label="Search Help"
        style={{
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 22,
          height: 22,
          borderRadius: "50%",
          background: "transparent",
          border: "none",
          outline: open ? "2px solid currentColor" : "none",
        }}
        className="info-icon"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={e => {
          e.stopPropagation();
          setOpen(o => !o);
        }}
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 22 22"
          aria-hidden="true"
        >
          <circle
            cx="11"
            cy="11"
            r="10"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          />
          <text
            x="11"
            y="15"
            textAnchor="middle"
            fontSize="13"
            fontWeight="bold"
            fill="currentColor"
            fontFamily="sans-serif"
            dominantBaseline="middle"
          >?</text>
        </svg>
      </span>
      {open && (
        <span
          className="info-tooltip"
          style={{
            position: "absolute",
            left: "50%",
            top: "2.2em",
            transform: "translateX(-50%)",
            background: "var(--panel-bg, #fff)",
            color: "var(--panel-fg, #222)",
            border: "1px solid var(--panel-border, #bbb)",
            padding: "0.6em 1em",
            borderRadius: 6,
            whiteSpace: "pre-line",
            zIndex: 100,
            fontSize: "0.96em",
            minWidth: 200,
            maxWidth: 350,
            boxShadow: "0 2px 16px rgba(0,0,0,0.10)",
            marginTop: 2,
          }}
        >
          {text}
        </span>
      )}
    </span>
  );
}

// --- Load help text from a local file (public/search-help.txt) ---
function useSearchHelpText(url = "/search-help.txt") {
  const [helpText, setHelpText] = useState("");
  useEffect(() => {
    fetch(url)
      .then(res => res.text())
      .then(setHelpText)
      .catch(() => setHelpText(""));
  }, [url]);
  return helpText;
}

// Helper: Gather all possible filter options for dropdowns
function getFilters(cards, filterOptions, delimiter = null, filterValueOrder = {}) {
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

  return Object.fromEntries(
    Object.entries(props).map(([k, v]) => {
      const customOrder = filterValueOrder[k];
      const allValues = Array.from(v);

      let sorted;
      if (Array.isArray(customOrder)) {
        const seen = new Set();
        const ordered = customOrder.filter(val => {
          if (allValues.includes(val)) {
            seen.add(val);
            return true;
          }
          return false;
        });
        const remainder = allValues
          .filter(val => !seen.has(val))
          .sort((a, b) => String(a).localeCompare(String(b), undefined, {
            numeric: true,
            sensitivity: "base"
          }));
        sorted = [...ordered, ...remainder];
      } else {
        sorted = allValues.sort((a, b) =>
          String(a).localeCompare(String(b), undefined, {
            numeric: true,
            sensitivity: "base"
          })
        );
      }

      return [k, [null, ...sorted]];
    })
  );
}


// --- Search Parser and Evaluator with Parentheses, OR, AND, NOT, and Prefixes ---

// Tokenize the input search string
function tokenize(input) {
  const tokens = [];
  const regex = /\s*(\/\/|-[a-zA-Z0-9_]+:"[^"]*"|-[a-zA-Z0-9_]+:\([^)]+\)|-[a-zA-Z0-9_]+:[^\s()"]+|-"[^"]*"|-\([^)]+\)|-[^\s()"]+|[a-zA-Z0-9_]+:"[^"]*"|[a-zA-Z0-9_]+:\([^)]+\)|[a-zA-Z0-9_]+:[^\s()"]+|"[^"]*"|\([^)]+\)|[()]|[^\s()"]+)\s*/g;
  let match;
  while ((match = regex.exec(input)) !== null) {
    tokens.push(match[1]);
  }
  return tokens;
}

// Parse tokens into an expression tree
function parse(tokens) {
  let pos = 0;

  function parseExpression() {
    let node = parseAnd();
    while (tokens[pos] === '//') {
      pos++;
      node = { type: 'OR', left: node, right: parseAnd() };
    }
    return node;
  }

  function parseAnd() {
    let node = parseTerm();
    // AND is implicit: continue if next token is a term, opening paren, or NOT
    while (
      pos < tokens.length &&
      tokens[pos] !== ')' &&
      tokens[pos] !== '//'
    ) {
      const right = parseTerm();
      node = { type: 'AND', left: node, right };
    }
    return node;
  }

  function parseTerm() {
    let token = tokens[pos];

    if (token === '(') {
      pos++;
      let node = parseExpression();
      if (tokens[pos] !== ')') throw new Error('Mismatched parentheses');
      pos++;
      return node;
    } else if (token && token.startsWith('-') && token.length > 1 && !token.startsWith('"')) {
      pos++;
      // Negation: always wrap subtoken as a node (TERM)
      let subtoken = token.slice(1);
      return { type: 'NOT', term: { type: 'TERM', term: subtoken } };
    } else if (token) {
      pos++;
      return { type: 'TERM', term: token };
    }
    throw new Error('Unexpected end of search');
  }

  const expr = parseExpression();
  if (pos < tokens.length) throw new Error('Unexpected input at end');
  return expr;
}

// Evaluate the expression tree for a card
function evaluate(node, card, searchPrefixes) {
  switch (node.type) {
    case 'TERM': {
      let property = 'name';
      let value = node.term;

      // Handle prefix (case-insensitive), including quoted or parenthesized values.
      let prefixMatch = value.match(/^([^\s:]+):([\s\S]+)$/);
      if (prefixMatch) {
        // Support trailing colon or not (normalize)
        const prefix = prefixMatch[1].replace(/:$/, '').toLowerCase();
        value = prefixMatch[2].trim();

        // Remove outer quotes or parentheses if present
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith('(') && value.endsWith(')'))
        ) {
          value = value.slice(1, -1);
        }

        // Map prefix to property name, case-insensitive
        const lowerPrefixes = Object.fromEntries(
          Object.entries(searchPrefixes).map(([k, v]) => [k.toLowerCase(), v])
        );
        property = lowerPrefixes[prefix] ? lowerPrefixes[prefix] : prefix;

        // Find the actual property in the card, case-insensitive
        const realProperty = Object.keys(card).find(
          k => k.toLowerCase() === property.toLowerCase()
        );
        if (realProperty) property = realProperty;
      } else {
        // Handle quoted term (for plain name search)
        if (value.startsWith('"') && value.endsWith('"')) {
          value = value.slice(1, -1);
        }

        // Find actual 'name' property in card, case-insensitive
        const realProperty = Object.keys(card).find(
          k => k.toLowerCase() === property.toLowerCase()
        );
        if (realProperty) property = realProperty;
      }

      // Handle (none)
      const valLower = value.trim().toLowerCase();

if (valLower === 'none' || valLower === '(none)') {
  return (
    card[property] === undefined ||
    card[property] === null ||
    (typeof card[property] === 'string' && card[property].trim() === '')
  );
} else if (valLower === 'any') {
  return (
    card[property] !== undefined &&
    card[property] !== null &&
    (typeof card[property] !== 'string' || card[property].trim() !== '')
  );
}


      // DEFAULT SEARCH: if no prefix, search BOTH name and subtitle fields
      let valuesToSearch = [];

      // If user did NOT specify a prefix (plain search), search name and subtitle fields
      if (
        property.toLowerCase() === "name" &&
        !node.term.match(/^([^\s:]+):/)
      ) {
        const subtitle = card.Subtitle ?? card.subtitle ?? "";
        valuesToSearch = [
          card.name ?? "",
          subtitle
        ];
      } else {
        let cardVal = card[property];
        if (Array.isArray(cardVal)) {
          cardVal = cardVal.join(" ");
        }
        if (typeof cardVal !== "string") {
          cardVal = cardVal?.toString() ?? "";
        }
        valuesToSearch = [cardVal];
      }

      // Number comparison support: only test first value (which is always the name field in plain search)
      const comparisonMatch = value.match(/^([<>]=?|=)(\d+(\.\d+)?)$/);
      if (comparisonMatch) {
        const [, operator, numStr] = comparisonMatch;
        const num = parseFloat(numStr);

        const valToTest = valuesToSearch[0] ?? "";
        const cardNum = parseFloat(valToTest);
        if (isNaN(cardNum)) return false;
        switch (operator) {
          case '=': return cardNum === num;
          case '<': return cardNum < num;
          case '>': return cardNum > num;
          case '<=': return cardNum <= num;
          case '>=': return cardNum >= num;
          default: return false;
        }
      }

      // Regular text search: match if ANY value contains the query
      return valuesToSearch.some(val =>
  String(val ?? '').toLowerCase().includes(value.toLowerCase())
);
    }
    case 'NOT':
      return !evaluate(node.term, card, searchPrefixes);
    case 'AND':
      return (
        evaluate(node.left, card, searchPrefixes) &&
        evaluate(node.right, card, searchPrefixes)
      );
    case 'OR':
      return (
        evaluate(node.left, card, searchPrefixes) ||
        evaluate(node.right, card, searchPrefixes)
      );
    default:
      return true;
  }
}

// Use the parser/evaluator for search
function filterCards(cards, search, searchPrefixes) {
  if (!search.trim()) return cards;

  let tokens, expr;
  try {
    tokens = tokenize(search.trim());
    expr = parse(tokens);
  } catch (e) {
    // If parse error, return no cards (safe fail)
    return [];
  }

  return cards.filter(card => evaluate(expr, card, searchPrefixes));
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
  const searchInputRef = useRef(null);
  const listRef = useRef(null);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({});
  
  function handleSearchKeyDown(e) {
  // Only add on Enter if the LIST has focus (not the input)
  if (e.key === "Enter") {
    if (e.currentTarget !== listRef.current) {
      // We're in the search input (or elsewhere) → ignore Enter
      return;
    }
    e.preventDefault();
    if (selectedCard) {
      onAddCard(selectedCard, e.shiftKey ? settings.addNValue : 1);
    }
    return;
  }

  // Arrow navigation (works from input and list)
  if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
  e.preventDefault();

  const cardsList = uniqueCards || [];
  if (cardsList.length === 0) return;

  const idx = cardsList.findIndex(c => c.id === selectedCard);
  const nextIdx =
    idx === -1
      ? (e.key === "ArrowDown" ? 0 : cardsList.length - 1)
      : (e.key === "ArrowDown"
          ? Math.min(idx + 1, cardsList.length - 1)
          : Math.max(idx - 1, 0));

  const next = cardsList[nextIdx];
  if (!next) return;

  onCardSelect(next.id);

  requestAnimationFrame(() => {
    const container = listRef.current;
    if (!container) return;
    const el = container.querySelector("li.selected");
    el?.scrollIntoView({ block: "nearest" });
  });
}

  const filterDelimiter = settings.filterDelimiter || null;
  const filterProps = getFilters(
  cards,
  settings.filterOptions || [],
  filterDelimiter,
  settings.filterValueOrder || {}
);
  const searchPrefixes = settings.searchPrefixes || {};

  // Pull help text file
  const helpTextFile = useSearchHelpText("/search-help.txt");

  // Build the dynamic prefix section from settings
  const prefixEntries = Object.entries(searchPrefixes);
  const prefixesSection =
    prefixEntries.length > 0
      ? "Use prefixes for advanced search:\n\n prefix:\"search term\" to search any of the following card information:\n\n" +
        prefixEntries
          .map(([p, field]) => `${p}: ${field}`)
          .join("\n") +
        "\n\n"
      : "";

  // Combine: prefixes first, then help file text
  const fullHelpText = prefixesSection + helpTextFile;

  // Use advanced parser/evaluator for text search, preserve dropdown logic
  const filtered = filterCards(cards, search, searchPrefixes).filter(card => {
    // Dropdown filters
    for (const [prop, value] of Object.entries(filters)) {
      if (value === undefined) continue;

      const rawVal = card[prop];

      const filterVal = String(value).trim().toLowerCase();

if (filterVal === "(none)") {
  if (
    rawVal !== undefined &&
    rawVal !== null &&
    !(typeof rawVal === "string" && rawVal.trim() === "")
  ) {
    return false;
  }
} else if (filterVal === "any") {
  if (
    rawVal === undefined ||
    rawVal === null ||
    (typeof rawVal === "string" && rawVal.trim() === "")
  ) {
    return false;
  }
} else {
  const values = (typeof rawVal === "string" && filterDelimiter)
    ? rawVal.split(filterDelimiter).map(v => v.trim())
    : [typeof rawVal === "string" ? rawVal.trim() : rawVal];

  if (!values.some(v => String(v).trim() === value)) {
    return false;
  }
}

    }

    return true;
  });

  const uniqueCards = getUniqueCardsByName(filtered);

  function handleClearFilters() {
    setSearch("");
    setFilters({});
  }

  return (
    <aside className="card-list-panel">
      <div style={{ marginBottom: "0.5em", fontSize: "0.95em" }}>
        <strong>Card Search</strong>
        <InfoTooltip text={fullHelpText} />
      </div>
      <div
  style={{
    position: "relative",
    width: "100%",
  }}
>
  <input
    ref={searchInputRef}
    type="text"
    placeholder="Search cards..."
    value={search}
    onChange={e => setSearch(e.target.value)}
	onKeyDown={handleSearchKeyDown}
    title={
      prefixEntries.length > 0
        ? `Search by name by default. Use prefixes like ${prefixEntries.map(([p]) => `${p}:"..."`).join(', ')}. Use ${prefixEntries.map(([p]) => `${p}:"none"`).join(', ')} for blank/missing or ${prefixEntries.map(([p]) => `${p}:"any"`).join(', ')} for all cards with that property. Boolean operators: () for grouping, // for OR, -term for NOT, and spaces for AND.`
        : "Search by name. Boolean operators: () for grouping, // for OR, -term for NOT, and spaces for AND."
    }
    style={{
      width: "100%",
      boxSizing: "border-box",
      paddingRight: search ? 36 : undefined,
      height: 32,              // set a consistent input height
      fontSize: "1em",
      verticalAlign: "middle", // help with centering
      margin: 0,
    }}
  />
  {search && (
    <button
      type="button"
      aria-label="Clear search"
      onClick={() => {
		setSearch("");
		searchInputRef.current?.focus();
			}}
            style={{
        position: "absolute",
        right: 4,
        top: "50%",
        transform: "translateY(-50%)",
        border: "none",
        background: "none",
        padding: 0,
        cursor: "pointer",
        width: 24,
        height: 24,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}

      tabIndex={0}
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 20 20"
        aria-hidden="true"
        style={{
          display: "block",
        }}
      >
        <circle cx="10" cy="10" r="9" fill="#b7950b" />
        <line x1="6" y1="6" x2="14" y2="14" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
        <line x1="14" y1="6" x2="6" y2="14" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </button>
  )}
</div>

      <button
        type="button"
        onClick={handleClearFilters}
        style={{ margin: "0.5em 0", padding: "0.25em 1em" }}
      >
        Clear Filters
      </button>
      <div>
        {(settings.filterOptions || []).map(prop => (
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
            <option value="">{prop}</option>
            <option value="(none)">(none)</option>
			<option value="any">(any)</option>
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
      <div style={{ margin: "0.5em 0", fontWeight: "bold" }}>
        Total cards: {uniqueCards.length}
      </div>
      <div
  ref={listRef}
  style={{ maxHeight: "calc(100vh - 400px)", overflowY: "auto" }}
  tabIndex={0}
  onKeyDown={handleSearchKeyDown}
>
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
  <div>
    {card.name}
    {card.Subtitle ? ` - ${card.Subtitle}` : ""}
  </div>
  {selectedCard === card.id && (
    <div style={{ marginTop: 6, display: "flex", gap: 8 }}>
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
    </div>
  )}
</li>

          ))}
        </ul>
      </div>
    </aside>
  );
}

export default CardListPanel;