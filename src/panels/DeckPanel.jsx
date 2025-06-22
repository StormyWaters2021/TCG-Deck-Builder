import React, { useMemo, useState, useEffect, useRef } from "react";
import CardPreview from "../components/CardPreview";

// --- DeckStatsBanner (inlined) ---
function DeckStatsBanner({ deck, cards, statsConfig }) {
  // Flatten deck into [{card, qty}]
  const deckList = useMemo(
    () =>
      Object.entries(deck)
        .map(([id, qty]) => ({
          card: cards.find(c => c.id === id),
          qty,
        }))
        .filter(({ card }) => !!card),
    [deck, cards]
  );

  function sumQty(filterFn) {
    return deckList
      .filter(({ card }) => filterFn(card))
      .reduce((sum, { qty }) => sum + qty, 0);
  }
  function totalProperty(prop) {
    let total = 0,
      cardsWithProp = 0;
    for (const { card, qty } of deckList) {
      let val = card[prop];
      if (typeof val === "number" && !isNaN(val)) {
        total += val * qty;
        cardsWithProp += qty;
      } else if (
        typeof val === "string" &&
        val.trim() !== "" &&
        !isNaN(Number(val))
      ) {
        total += Number(val) * qty;
        cardsWithProp += qty;
      }
    }
    return { total, cardsWithProp };
  }
  function countContains(prop, str) {
    return deckList
      .filter(
        ({ card }) =>
          typeof card[prop] === "string" &&
          card[prop].toLowerCase().includes(str.toLowerCase())
      )
      .reduce((sum, { qty }) => sum + qty, 0);
  }
  // Sum up all numeric values in a property where the property contains a substring
  function sumPropertyWhereContains(prop, contains) {
    let total = 0,
      cardsWithProp = 0;
    for (const { card, qty } of deckList) {
      let val = card[prop];
      if (
        typeof val === "string" &&
        val.toLowerCase().includes(contains.toLowerCase())
      ) {
        const matches = val.match(/([0-9]+(?:\.[0-9]+)?)/g);
        if (matches) {
          for (const m of matches) {
            if (m.trim() !== "") {
              total += parseFloat(m) * qty;
              cardsWithProp += qty;
            }
          }
        }
      }
    }
    return { total, cardsWithProp };
  }
  // Sum up a specific number captured via regex pattern
  function sumPropertyByRegex(prop, regexStr) {
    let total = 0,
      cardsWithProp = 0;
    const regex = new RegExp(regexStr, "i");
    for (const { card, qty } of deckList) {
      let val = card[prop];
      if (typeof val === "string") {
        const match = val.match(regex);
        if (match && match[1] && !isNaN(match[1])) {
          total += parseFloat(match[1]) * qty;
          cardsWithProp += qty;
        }
      }
    }
    return { total, cardsWithProp };
  }

  const stats = [];
  for (const item of statsConfig) {
    if (item.type === "totalCount") {
      const totalCards = deckList.reduce((sum, { qty }) => sum + qty, 0);
      stats.push(
        <span key="totalCount" className="deck-stat">
          {item.label || "Total"}: <b>{totalCards}</b>
        </span>
      );
    } else if (item.type === "sumProperty") {
      const { total, cardsWithProp } = totalProperty(item.prop);
      stats.push(
        <span key={item.prop} className="deck-stat">
          {item.label || `Total ${item.prop}`}: <b>{total}</b>
          {` (${cardsWithProp} card${cardsWithProp !== 1 ? "s" : ""})`}
        </span>
      );
    } else if (item.type === "countType") {
      const count = sumQty(card => card && card[item.prop] === item.value);
      stats.push(
        <span
          key={`countType:${item.prop}:${item.value}`}
          className="deck-stat"
        >
          {item.label || `${item.value} cards`}: <b>{count}</b>
        </span>
      );
    } else if (item.type === "countContains") {
      const count = countContains(item.prop, item.contains);
      stats.push(
        <span
          key={`countContains:${item.prop}:${item.contains}`}
          className="deck-stat"
        >
          {item.label ||
            `Cards with "${item.contains}" in ${item.prop}`}:{" "}
          <b>{count}</b>
        </span>
      );
    } else if (item.type === "sumPropertyWhereContains") {
      const { total, cardsWithProp } = sumPropertyWhereContains(
        item.prop,
        item.contains
      );
      stats.push(
        <span
          key={`sumPropertyWhereContains:${item.prop}:${item.contains}`}
          className="deck-stat"
        >
          {item.label ||
            `Sum of ${item.prop} containing "${item.contains}"`}:{" "}
          <b>{total}</b>
          {` (${cardsWithProp} card${cardsWithProp !== 1 ? "s" : ""})`}
        </span>
      );
    } else if (item.type === "sumPropertyByRegex") {
      const { total, cardsWithProp } = sumPropertyByRegex(
        item.prop,
        item.regex
      );
      stats.push(
        <span
          key={`sumPropertyByRegex:${item.prop}:${item.regex}`}
          className="deck-stat"
        >
          {item.label ||
            `Sum by regex "${item.regex}" in ${item.prop}`}: <b>{total}</b>
          {` (${cardsWithProp} card${cardsWithProp !== 1 ? "s" : ""})`}
        </span>
      );
    }
  }

  return (
    <div
      className="deck-stats-banner"
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: "1.2em",
        fontSize: "0.95em",
        color: "#333",
        background: "#f7f7f7",
        borderRadius: "6px",
        padding: "2px 10px",
        margin: "8px 0 10px 0",
        minHeight: "26px",
      }}
    >
      {stats}
    </div>
  );
}

// --- DeckStats (inlined, handles fetch) ---
function DeckStats({ deck, cards, settings }) {
  const [statsConfig, setStatsConfig] = useState(null);
  const statsConfigRef = useRef(settings.gameName);

  useEffect(() => {
    let cancelled = false;
    let baseUrl = import.meta.env.BASE_URL || "";
    if (baseUrl.endsWith("/")) baseUrl = baseUrl.slice(0, -1);
    async function fetchStatsConfig() {
      try {
        const url = `${baseUrl}/games/${settings.gameName}/deckStats.json`;
        const resp = await fetch(url);
        if (!resp.ok) throw new Error("Stats config not found");
        const json = await resp.json();
        if (!cancelled) {
          setStatsConfig(json);
        }
      } catch {
        if (!cancelled) {
          setStatsConfig([
            { type: "totalCount", label: "Total Cards" },
          ]);
        }
      }
    }
    if (!statsConfig || statsConfigRef.current !== settings.gameName) {
      statsConfigRef.current = settings.gameName;
      fetchStatsConfig();
    }
    return () => {
      cancelled = true;
    };
  }, [settings.gameName, statsConfig]);

  if (!statsConfig) return null;

  return (
    <DeckStatsBanner deck={deck} cards={cards} statsConfig={statsConfig} />
  );
}

// --- Group deck helper ---
function groupDeck(deck, cards, groupBy) {
  const grouped = {};
  Object.entries(deck).forEach(([cardId, qty]) => {
    const card = cards.find(c => c.id === cardId);
    const group = card?.[groupBy] || "Other";
    if (!grouped[group]) grouped[group] = [];
    grouped[group].push({ card, qty });
  });
  return grouped;
}

// Helper: Find all alternate printings (by name) for a card
function getAlternatePrintings(card, allCards) {
  if (!card) return [];
  return allCards.filter(c => c.name === card.name && c.id !== card.id);
}

// Sorts an array of {card, qty} by the given sortProps array (property names).
// If sortProps is empty/undefined, sorts alphabetically by card name.
function sortGroup(cards, sortProps) {
  if (!sortProps || sortProps.length === 0) sortProps = ["name"];
  return [...cards].sort((a, b) => {
    for (const prop of sortProps) {
      let av = a.card?.[prop] ?? "";
      let bv = b.card?.[prop] ?? "";
      // Try numeric comparison first
      if (!isNaN(av) && !isNaN(bv) && av !== "" && bv !== "") {
        av = Number(av);
        bv = Number(bv);
        if (av !== bv) return av - bv;
      } else {
        av = String(av);
        bv = String(bv);
        if (av < bv) return -1;
        if (av > bv) return 1;
      }
    }
    return 0;
  });
}

function DeckPanel({
  cards,
  deck,
  settings,
  onRemoveCard,
  onAddCard,
  selectedCard,
  setSelectedCard,
}) {
  const [groupBy, setGroupBy] = useState(settings.groupOptions[0]);
  const [displayMode, setDisplayMode] = useState("list");

  const grouped = useMemo(
    () => groupDeck(deck, cards, groupBy),
    [deck, cards, groupBy]
  );

  const FALLBACK_GROUP_ORDER = ["Creatures", "Spells", "Lands", "Other"];
  const groupOrder =
    settings.groupOrder && Array.isArray(settings.groupOrder)
      ? settings.groupOrder
      : FALLBACK_GROUP_ORDER;

  const groupSorts = settings.groupSort || {};

  function getSortedGroupNames(groupedObj) {
    const groupNames = Object.keys(groupedObj);
    const inOrder = groupOrder.filter(name => groupNames.includes(name));
    const remaining = groupNames
      .filter(name => !groupOrder.includes(name))
      .sort();
    return [...inOrder, ...remaining];
  }

  const totalCards = Object.values(deck).reduce((a, b) => a + b, 0);
  const errors = [];

  if (totalCards < settings.deckValidation.minCards)
    errors.push("Too few cards in deck!");
  if (totalCards > settings.deckValidation.maxCards)
    errors.push("Too many cards in deck!");

  for (const [cardId, qty] of Object.entries(deck)) {
    if (qty > settings.maxCopiesPerCard) {
      const card = cards.find(c => c.id === cardId);
      errors.push(
        `Too many copies of ${
          card ? card.name : cardId
        } (max ${settings.maxCopiesPerCard})`
      );
    }
  }

  if (settings.deckValidation.usePerCardLimit) {
    for (const [cardId, qty] of Object.entries(deck)) {
      const card = cards.find(c => c.id === cardId);
      if (card && typeof card.Limit === "number" && qty > card.Limit) {
        errors.push(
          `Too many copies of ${card.name}: limit is ${card.Limit}`
        );
      }
    }
  }

  for (const rule of settings.deckValidation.propertyLimits || []) {
    if (!rule || !rule.property) continue;
    const { property, value } = rule;
    const count = Object.entries(deck).reduce((sum, [id, qty]) => {
      const card = cards.find(c => c.id === id);
      return card && card[property] === value ? sum + qty : sum;
    }, 0);
    if (typeof rule.max === "number" && count > rule.max)
      errors.push(`Too many cards of ${property}: ${value}`);
    if (typeof rule.min === "number" && count < rule.min)
      errors.push(`Too few cards of ${property}: ${value}`);
  }
  const banned = (settings.deckValidation.banList || []).filter(id => deck[id]);
  if (banned.length)
    errors.push("Banned cards in deck: " + banned.join(", "));

  function handleSwap(card, qty) {
    const alternates = cards.filter(c => c.name === card.name);
    const idx = alternates.findIndex(c => c.id === card.id);
    const next = alternates[(idx + 1) % alternates.length];
    onRemoveCard(card.id, qty);
    onAddCard(next.id, qty);
    setSelectedCard(next.id);
  }

  return (
    <aside className="deck-panel">
      <div style={{ display: "flex", alignItems: "center", gap: "1em" }}>
        <div>
          <label>Group by: </label>
          <select value={groupBy} onChange={e => setGroupBy(e.target.value)}>
            {settings.groupOptions.map(opt => (
              <option value={opt} key={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label>Display: </label>
          <select
            value={displayMode}
            onChange={e => setDisplayMode(e.target.value)}
          >
            <option value="list">List</option>
            <option value="grid">Grid</option>
          </select>
        </div>
      </div>

      {/* --- Deck Stats Banner --- */}
      <DeckStats deck={deck} cards={cards} settings={settings} />

      {displayMode === "list" ? (
        getSortedGroupNames(grouped).map(group => {
          const sortProps = groupSorts[group];
          const sortedCards = sortGroup(grouped[group], sortProps);
          return (
            <div key={group}>
              <strong>
                {group} ({sortedCards.reduce((a, b) => a + b.qty, 0)})
              </strong>
              <ul>
                {sortedCards.map(({ card, qty }) => {
                  const altCount = getAlternatePrintings(card, cards).length;
                  return (
                    <li
                      key={card.id}
                      className={selectedCard === card.id ? "selected" : ""}
                      onClick={() => setSelectedCard(card.id)}
                      style={{ position: "relative" }}
                    >
                      {card.name} x{qty}
                      {altCount > 0 && (
                        <button
                          title="Swap to other printing"
                          className="deck-swap-btn"
                          onClick={e => {
                            e.stopPropagation();
                            handleSwap(card, qty);
                          }}
                        >
                          ⇆
                        </button>
                      )}
                      {selectedCard === card.id && (
                        <>
                          <button
                            className="deck-modify-btn"
                            onClick={e => {
                              e.stopPropagation();
                              onRemoveCard(card.id, 1);
                            }}
                          >
                            -1
                          </button>
                          <button
                            className="deck-modify-btn"
                            onClick={e => {
                              e.stopPropagation();
                              onAddCard(card.id, 1);
                            }}
                          >
                            +1
                          </button>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })
      ) : (
        getSortedGroupNames(grouped).map(group => {
          const sortProps = groupSorts[group];
          const sortedCards = sortGroup(grouped[group], sortProps);
          return (
            <div key={group} style={{ marginBottom: "0.25em" }}>
              <strong>
                {group} ({sortedCards.reduce((a, b) => a + b.qty, 0)})
              </strong>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(86px, 1fr))",
                  gap: "2px",
                  marginTop: "0.1em",
                }}
              >
                {sortedCards.map(({ card, qty }) => {
                  const altCount = getAlternatePrintings(card, cards).length;
                  return (
                    <div
                      key={card.id}
                      style={{
                        background: "var(--main-button-color)",
                        minWidth: 0,
                        padding: 0,
                        margin: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <div
                        style={{
                          position: "relative",
                          width: "86px",
                          height: "120px",
                        }}
                      >
                        <CardPreview
                          card={card}
                          game={settings.gameName}
                          showName={false}
                          quantity={qty}
                          showButtons={true}
                          onAdd={e => {
                            e.stopPropagation();
                            onAddCard(card.id, 1);
                          }}
                          onRemove={e => {
                            e.stopPropagation();
                            onRemoveCard(card.id, 1);
                          }}
                          style={{
                            width: "86px",
                            height: "auto",
                            display: "block",
                            margin: 0,
                            maxWidth: "100%",
                            minWidth: "86px",
                            padding: 0,
                          }}
                        />
                        {altCount > 0 && (
                          <button
                            title="Swap to other printing"
                            className="deck-swap-btn"
                            style={{
                              position: "absolute",
                              top: 2,
                              left: 2,
                              zIndex: 5,
                            }}
                            onClick={e => {
                              e.stopPropagation();
                              handleSwap(card, qty);
                            }}
                          >
                            ⇆
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })
      )}

      <div>
        <strong>Total cards: {totalCards}</strong>
      </div>
      {errors.length > 0 && (
        <div className="deck-errors">
          {errors.map(e => (
            <div key={e}>{e}</div>
          ))}
        </div>
      )}
    </aside>
  );
}

export default DeckPanel;