import React, { useMemo, useState, useEffect, useRef } from "react";
import CardPreview from "../components/CardPreview";

// --- DeckStatsBanner (fully included) ---
function DeckStatsBanner({ deck, cards, statsConfig }) {
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
    let total = 0, cardsWithProp = 0;
    for (const { card, qty } of deckList) {
      const val = card[prop];
      const num = typeof val === "number" ? val : parseFloat(val);
      if (!isNaN(num)) {
        total += num * qty;
        cardsWithProp += qty;
      }
    }
    return { total, cardsWithProp };
  }

  function countContains(prop, str) {
    return deckList
      .filter(({ card }) =>
        typeof card[prop] === "string" &&
        card[prop].toLowerCase().includes(str.toLowerCase())
      )
      .reduce((sum, { qty }) => sum + qty, 0);
  }

  function sumPropertyWhereContains(prop, contains) {
    let total = 0, cardsWithProp = 0;
    for (const { card, qty } of deckList) {
      const val = card[prop];
      if (typeof val === "string" && val.toLowerCase().includes(contains.toLowerCase())) {
        const matches = val.match(/([0-9]+(?:\.[0-9]+)?)/g);
        if (matches) {
          for (const m of matches) {
            const num = parseFloat(m);
            if (!isNaN(num)) {
              total += num * qty;
              cardsWithProp += qty;
            }
          }
        }
      }
    }
    return { total, cardsWithProp };
  }

  function sumPropertyByRegex(prop, regexStr) {
    let total = 0, cardsWithProp = 0;
    const regex = new RegExp(regexStr, "i");
    for (const { card, qty } of deckList) {
      const val = card[prop];
      const match = typeof val === "string" && val.match(regex);
      if (match && match[1] && !isNaN(match[1])) {
        total += parseFloat(match[1]) * qty;
        cardsWithProp += qty;
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
        <span key={`countType:${item.prop}:${item.value}`} className="deck-stat">
          {item.label || `${item.value} cards`}: <b>{count}</b>
        </span>
      );
    } else if (item.type === "countContains") {
      const count = countContains(item.prop, item.contains);
      stats.push(
        <span key={`countContains:${item.prop}:${item.contains}`} className="deck-stat">
          {item.label || `Cards with "${item.contains}" in ${item.prop}`}: <b>{count}</b>
        </span>
      );
    } else if (item.type === "sumPropertyWhereContains") {
      const { total, cardsWithProp } = sumPropertyWhereContains(item.prop, item.contains);
      stats.push(
        <span key={`sumPropertyWhereContains:${item.prop}:${item.contains}`} className="deck-stat">
          {item.label || `Sum of ${item.prop} containing "${item.contains}"`}: <b>{total}</b>
          {` (${cardsWithProp} card${cardsWithProp !== 1 ? "s" : ""})`}
        </span>
      );
    } else if (item.type === "sumPropertyByRegex") {
      const { total, cardsWithProp } = sumPropertyByRegex(item.prop, item.regex);
      stats.push(
        <span key={`sumPropertyByRegex:${item.prop}:${item.regex}`} className="deck-stat">
          {item.label || `Sum by regex "${item.regex}" in ${item.prop}`}: <b>{total}</b>
          {` (${cardsWithProp} card${cardsWithProp !== 1 ? "s" : ""})`}
        </span>
      );
    }
  }

  return <div className="deck-stats-banner">{stats}</div>;
}

// --- sortGroup helper (fully included) ---
function sortGroup(cards, groupSortConfig) {
  if (!groupSortConfig || typeof groupSortConfig !== "object") {
    return [...cards].sort((a, b) => a.card.name.localeCompare(b.card.name));
  }

  const sortProps = groupSortConfig.by || ["name"];
  const customOrders = groupSortConfig.order || {};

  return [...cards].sort((a, b) => {
    for (const prop of sortProps) {
      const av = a.card?.[prop] ?? "";
      const bv = b.card?.[prop] ?? "";

      if (customOrders[prop]) {
        const order = customOrders[prop];
        const ai = order.indexOf(av);
        const bi = order.indexOf(bv);

        if (ai !== -1 && bi !== -1 && ai !== bi) return ai - bi;
        if (ai !== -1 && bi === -1) return -1;
        if (bi !== -1 && ai === -1) return 1;
      }

      const an = parseFloat(av);
      const bn = parseFloat(bv);
      const isNumeric = !isNaN(an) && !isNaN(bn);

      if (isNumeric) {
        if (an !== bn) return an - bn;
      } else {
        const result = String(av).localeCompare(String(bv));
        if (result !== 0) return result;
      }
    }
    return 0;
  });
}

// --- Helper: match a card to a section (octgn criteria) ---
function cardMatchesSection(card, section) {
  if (!section || !section.criteria) return false;
  return Object.entries(section.criteria).some(([prop, values]) => {
    const cardVal = card[prop];
    if (Array.isArray(values)) {
      if (Array.isArray(cardVal)) {
        return cardVal.some((v) => values.includes(v));
      }
      return values.includes(cardVal);
    }
    return cardVal === values;
  });
}

// --- Helper: group deck by OCTGN (with drag overrides) ---
function groupDeckByOctgn(deck, cards, sections, userOverrides) {
  const groups = {};
  sections.forEach((section) => (groups[section.name] = []));
  groups["Ungrouped"] = [];
  Object.entries(deck).forEach(([cardId, qty]) => {
    const card = cards.find((c) => c.id === cardId);
    let group = "Ungrouped";
    if (userOverrides && userOverrides[cardId]) {
      group = userOverrides[cardId];
    } else {
      const match = sections.find((section) => cardMatchesSection(card, section));
      if (match) group = match.name;
    }
    if (!groups[group]) groups[group] = [];
    groups[group].push({ card, qty });
  });
  return groups;
}

// --- useOctgnSections hook (fully included) ---
function useOctgnSections(gameName, enabled) {
  const [sections, setSections] = useState(null);
  const [panelIgnoreSections, setPanelIgnoreSections] = useState([]);
  useEffect(() => {
    if (!enabled) {
      setSections(null);
      setPanelIgnoreSections([]);
      return;
    }
    let cancelled = false;
    async function fetchSections() {
      try {
        let baseUrl = import.meta.env.BASE_URL || "";
        if (baseUrl.endsWith("/")) baseUrl = baseUrl.slice(0, -1);
        const url = `${baseUrl}/games/${gameName}/octgn.json`;
        const resp = await fetch(url);
        if (!resp.ok) throw new Error("OCTGN config not found");
        const json = await resp.json();
        if (!cancelled) {
          setSections(json.sections || []);
          setPanelIgnoreSections(json.panelIgnoreSections || []);
        }
      } catch {
        if (!cancelled) {
          setSections([]);
          setPanelIgnoreSections([]);
        }
      }
    }
    fetchSections();
    return () => {
      cancelled = true;
    };
  }, [gameName, enabled]);
  return [sections, panelIgnoreSections];
}

// --- Helper functions (fully included) ---
function groupDeck(deck, cards, groupBy) {
  const grouped = {};
  Object.entries(deck).forEach(([cardId, qty]) => {
    const card = cards.find((c) => c.id === cardId);
    const group = card?.[groupBy] || "Other";
    if (!grouped[group]) grouped[group] = [];
    grouped[group].push({ card, qty });
  });
  return grouped;
}

function getAlternatePrintings(card, allCards) {
  if (!card) return [];
  return allCards.filter((c) => c.name === card.name && c.id !== card.id);
}

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
          setStatsConfig([{ type: "totalCount", label: "Total Cards" }]);
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

// --- DeckPanel component (fully included) ---
function DeckPanel({
  cards,
  deck,
  settings,
  onRemoveCard,
  onAddCard,
  selectedCard,
  setSelectedCard,
  groupByProp,
  setGroupByProp,
  octgnOverridesProp,
  setOctgnOverridesProp,
}) {
  // Provide a default groupBy state if not controlled from parent
  const [internalGroupBy, setInternalGroupBy] = useState(settings.groupOptions[0]);
  const groupBy = groupByProp !== undefined ? groupByProp : internalGroupBy;
  const setGroupBy = setGroupByProp !== undefined ? setGroupByProp : setInternalGroupBy;

  // --- Manage octgnOverrides state and setter at this level ---
  const [octgnOverrides, setOctgnOverrides] = useState({});
  // Provide prop override if supplied (for full control from a higher parent)
  const effectiveOctgnOverrides = octgnOverridesProp !== undefined ? octgnOverridesProp : octgnOverrides;
  const effectiveSetOctgnOverrides = setOctgnOverridesProp !== undefined ? setOctgnOverridesProp : setOctgnOverrides;

  const [octgnSections, panelIgnoreSections] = useOctgnSections(settings.gameName, settings.octgnExport);

  const [displayMode, setDisplayMode] = useState("list");

  const availableGroupOptions = useMemo(() => {
    let opts = [...settings.groupOptions];
    if (settings.octgnExport && !opts.includes("OCTGN")) {
      opts.push("OCTGN");
    }
    return opts;
  }, [settings.groupOptions, settings.octgnExport]);

  const filteredSections = useMemo(() => {
    if (groupBy === "OCTGN" && octgnSections) {
      if (panelIgnoreSections && panelIgnoreSections.length > 0) {
        return octgnSections.filter(section => !panelIgnoreSections.includes(section.name));
      }
      return octgnSections;
    }
    return null;
  }, [groupBy, octgnSections, panelIgnoreSections]);

  const grouped = useMemo(() => {
    if (groupBy === "OCTGN" && filteredSections) {
      return groupDeckByOctgn(deck, cards, filteredSections, effectiveOctgnOverrides);
    }
    return groupDeck(deck, cards, groupBy);
  }, [groupBy, deck, cards, filteredSections, effectiveOctgnOverrides]);

  const FALLBACK_GROUP_ORDER = ["Creatures", "Spells", "Lands", "Other"];
  const groupOrder =
    settings.groupOrder && Array.isArray(settings.groupOrder)
      ? settings.groupOrder
      : FALLBACK_GROUP_ORDER;

  const groupSorts = settings.groupSort || {};

  function getSortedGroupNames(groupedObj) {
    if (groupBy === "OCTGN" && filteredSections) {
      return [...filteredSections.map((s) => s.name), "Ungrouped"];
    }
    const groupNames = Object.keys(groupedObj);
    const inOrder = groupOrder.filter((name) => groupNames.includes(name));
    const remaining = groupNames.filter((name) => !groupOrder.includes(name)).sort();
    return [...inOrder, ...remaining];
  }

  function handleDragStart(e, cardId) {
    e.dataTransfer.setData("cardId", cardId);
  }
  function handleDrop(e, sectionName) {
    e.preventDefault();
    const cardId = e.dataTransfer.getData("cardId");
    if (!cardId) return;
    effectiveSetOctgnOverrides((prev) => ({ ...prev, [cardId]: sectionName }));
  }
  function handleDragOver(e) {
    e.preventDefault();
  }

  const totalCards = Object.values(deck).reduce((a, b) => a + b, 0);
  const errors = [];

  if (totalCards < settings.deckValidation.minCards)
    errors.push("Too few cards in deck!");
  if (totalCards > settings.deckValidation.maxCards)
    errors.push("Too many cards in deck!");

  for (const [cardId, qty] of Object.entries(deck)) {
    if (qty > settings.maxCopiesPerCard) {
      const card = cards.find((c) => c.id === cardId);
      errors.push(
        `Too many copies of ${
          card ? card.name : cardId
        } (max ${settings.maxCopiesPerCard})`
      );
    }
  }

  if (settings.deckValidation.usePerCardLimit) {
    for (const [cardId, qty] of Object.entries(deck)) {
      const card = cards.find((c) => c.id === cardId);
      if (card && typeof card.Limit === "number" && qty > card.Limit) {
        errors.push(`Too many copies of ${card.name}: limit is ${card.Limit}`);
      }
    }
  }

  for (const rule of settings.deckValidation.propertyLimits || []) {
    if (!rule || !rule.property) continue;
    const { property, value } = rule;
    const count = Object.entries(deck).reduce((sum, [id, qty]) => {
      const card = cards.find((c) => c.id === id);
      return card && card[property] === value ? sum + qty : sum;
    }, 0);
    if (typeof rule.max === "number" && count > rule.max)
      errors.push(`Too many cards of ${property}: ${value}`);
    if (typeof rule.min === "number" && count < rule.min)
      errors.push(`Too few cards of ${property}: ${value}`);
  }
  const banned = (settings.deckValidation.banList || []).filter((id) => deck[id]);
  if (banned.length)
    errors.push("Banned cards in deck: " + banned.join(", "));

  function handleSwap(card, qty) {
    const alternates = cards.filter((c) => c.name === card.name);
    const idx = alternates.findIndex((c) => c.id === card.id);
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
          <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)}>
            {availableGroupOptions.map((opt) => (
              <option value={opt} key={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label>Display: </label>
          <select value={displayMode} onChange={(e) => setDisplayMode(e.target.value)}>
            <option value="list">List</option>
            <option value="grid">Grid</option>
          </select>
        </div>
      </div>

      <DeckStats deck={deck} cards={cards} settings={settings} />

      {groupBy === "OCTGN" && filteredSections ? (
        getSortedGroupNames(grouped).map((sectionName) => {
          const sectionCards = grouped[sectionName] || [];
          return (
            <div
              key={sectionName}
              className="deck-group"
              onDrop={(e) => handleDrop(e, sectionName)}
              onDragOver={handleDragOver}
            >
              <div className="deck-group-header">
                {sectionName} <span className="deck-group-count">({sectionCards.reduce((a, b) => a + b.qty, 0)})</span>
              </div>
              {displayMode === "grid" ? (
                <div className="deck-group-grid">
                  {sectionCards.map(({ card, qty }) => {
                    const altCount = getAlternatePrintings(card, cards).length;
                    return (
                      <div
                        key={card.id}
                        className="deck-card-grid-cell"
                        draggable
                        onDragStart={(e) => handleDragStart(e, card.id)}
                      >
                        <div
                          className="deck-card-grid-preview"
                          onClick={() => setSelectedCard(card.id)}
                        >
                          <CardPreview
                            card={card}
                            game={settings.gameName}
                            showName={false}
                            quantity={qty}
                            showButtons={true}
                            onAdd={(e) => {
                              e.stopPropagation();
                              onAddCard(card.id, 1);
                            }}
                            onRemove={(e) => {
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
                              onClick={(e) => {
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
              ) : (
                <ul className="deck-group-list">
                  {sectionCards.map(({ card, qty }) => {
                    const altCount = getAlternatePrintings(card, cards).length;
                    return (
                      <li
                        key={card.id}
                        className={`deck-group-list-item${selectedCard === card.id ? " selected" : ""}`}
                        onClick={() => setSelectedCard(card.id)}
                        draggable
                        onDragStart={(e) => handleDragStart(e, card.id)}
                      >
                        {card.name} x{qty}
                        {altCount > 0 && (
                          <button
                            title="Swap to other printing"
                            className="deck-swap-btn"
                            onClick={(e) => {
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
                              onClick={(e) => {
                                e.stopPropagation();
                                onRemoveCard(card.id, 1);
                              }}
                            >
                              -1
                            </button>
                            <button
                              className="deck-modify-btn"
                              onClick={(e) => {
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
              )}
            </div>
          );
        })
      ) : displayMode === "list" ? (
        getSortedGroupNames(grouped).map((group) => {
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
                          onClick={(e) => {
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
                            onClick={(e) => {
                              e.stopPropagation();
                              onRemoveCard(card.id, 1);
                            }}
                          >
                            -1
                          </button>
                          <button
                            className="deck-modify-btn"
                            onClick={(e) => {
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
        getSortedGroupNames(grouped).map((group) => {
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
                          onAdd={(e) => {
                            e.stopPropagation();
                            onAddCard(card.id, 1);
                          }}
                          onRemove={(e) => {
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
                            onClick={(e) => {
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
          {errors.map((e) => (
            <div key={e}>{e}</div>
          ))}
        </div>
      )}
    </aside>
  );
}

export default DeckPanel;