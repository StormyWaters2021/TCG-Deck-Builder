import React, { useMemo, useState, useEffect, useRef } from "react";
import CardPreview from "../components/CardPreview";
import { buildCardPreviewProperties } from "../utils/cardPreviewExtra";
import { matchesExclude } from "../utils/matchesExclude";

function cardNameWithSubtitle(card) {
  if (!card) return "";
  const subtitle = card.Subtitle || card.subtitle;
  if (subtitle && subtitle.trim()) {
    return `${card.name} - ${subtitle}`;
  }
  return card.name;
}

function getAlternatePrintings(card, allCards) {
  if (!card) return [];
  const subtitle = card.Subtitle || card.subtitle || "";
  return allCards.filter(
    c =>
      c.id !== card.id &&
      c.name === card.name &&
      ((c.Subtitle || c.subtitle || "") === subtitle)
  );
}

function sumPropertyOfCardsWhereContains(deckList, filterProp, contains, sumProp) {
  let total = 0, cardsWithProp = 0;
  for (const { card, qty } of deckList) {
    if (
      typeof card[filterProp] === "string" &&
      card[filterProp].toLowerCase().includes(contains.toLowerCase())
    ) {
      const num = typeof card[sumProp] === "number" ? card[sumProp] : parseFloat(card[sumProp]);
      if (!isNaN(num)) {
        total += num * qty;
        cardsWithProp += qty;
      }
    }
  }
  return { total, cardsWithProp };
}

function sortGroup(cards, groupSortConfig) {
  if (!groupSortConfig || typeof groupSortConfig !== "object") {
    return [...cards].sort((a, b) =>
      cardNameWithSubtitle(a.card).localeCompare(cardNameWithSubtitle(b.card))
    );
  }
  const sortProps = groupSortConfig.by || ["name"];
  const customOrders = groupSortConfig.order || {};
  return [...cards].sort((a, b) => {
    for (const prop of sortProps) {
      const av = String(a.card?.[prop] ?? "");
      const bv = String(b.card?.[prop] ?? "");
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
      if (!isNaN(an) && !isNaN(bn)) {
        if (an !== bn) return an - bn;
      } else {
        const result = String(av).localeCompare(String(bv));
        if (result !== 0) return result;
      }
    }
    return 0;
  });
}

// Group deck by property for normal (non-OCTGN) grouping
function groupDeck(deck, cards, groupBy) {
  const grouped = {};
  Object.entries(deck).forEach(([cardId, entry]) => {
    const card = cards.find(c => c.id === cardId);
    if (!card) return;
    const groupName =
      (typeof entry.group === "string" && entry.group)
        ? entry.group
        : (card[groupBy] || "Other");
    if (!grouped[groupName]) grouped[groupName] = {};
    if (!grouped[groupName][cardId]) {
      grouped[groupName][cardId] = { card, qty: 0, tags: entry.tags };
    }
    grouped[groupName][cardId].qty += entry.count || 0;
  });
  Object.keys(grouped).forEach(group => {
    grouped[group] = Object.values(grouped[group]);
  });
  return grouped;
}

// Helper: match a card to a section (octgn criteria)
function cardMatchesSection(card, section) {
  if (!section.criteria) return false;
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

// --- OCTGN grouping logic START ---
function groupDeckByOctgn(
  deck,
  cards,
  sections,
  defaultSection,
  userOverrides
) {
  const groups = {};
  sections.forEach((s) => (groups[s.name] = {}));
  groups[defaultSection] = groups[defaultSection] || {};

  Object.entries(deck).forEach(([cardId, entry]) => {
    const card = cards.find((c) => c.id === cardId);
    if (!card) return;

    // If the saved entry has group allocations, preserve every allocation
    // exactly, including group names that no longer exist in the current OCTGN
    // configuration. Those groups are rendered as visible missing groups below.
    const manualEntries =
      entry.group && typeof entry.group === "object" && !Array.isArray(entry.group)
        ? Object.entries(entry.group).filter(([, qty]) => Number(qty) > 0)
        : [];

    if (manualEntries.length > 0) {
      let assigned = 0;
      manualEntries.forEach(([sectName, rawQty]) => {
        const qty = Number(rawQty);
        groups[sectName] = groups[sectName] || {};
        if (!groups[sectName][cardId]) {
          groups[sectName][cardId] = { card, qty: 0, tags: entry.tags };
        }
        groups[sectName][cardId].qty += qty;
        assigned += qty;
      });

      // This is only a final display safety net. The load normalizer should have
      // already guaranteed that assigned === entry.count before editable state.
      const totalCount = Number(entry.count) || assigned;
      const remainder = totalCount - assigned;
      if (remainder > 0) {
        groups[defaultSection] = groups[defaultSection] || {};
        if (!groups[defaultSection][cardId]) {
          groups[defaultSection][cardId] = { card, qty: 0, tags: entry.tags };
        }
        groups[defaultSection][cardId].qty += remainder;
      }
    } else {
      // Otherwise, assign based on first matching criteria
      const dragSect =
        userOverrides && userOverrides[cardId] ? userOverrides[cardId] : null;
      const critSect = sections.find((s) => cardMatchesSection(card, s))?.name;
      const finalSect = dragSect || critSect || defaultSection;
      groups[finalSect] = groups[finalSect] || {};
      if (!groups[finalSect][cardId]) {
        groups[finalSect][cardId] = { card, qty: 0, tags: entry.tags };
      }
      groups[finalSect][cardId].qty += entry.count;
    }
  });

  Object.keys(groups).forEach(group => {
    groups[group] = Object.values(groups[group]);
  });
  return groups;
}
// --- OCTGN grouping logic END ---

// DeckStatsBanner & DeckStats as previously written — unchanged
function DeckStatsBanner({ deck, cards, statsConfig, settings }) {
  const processedDeck = {};
  Object.entries(deck).forEach(([cardId, entry]) => {
    const card = cards.find(c => c.id === cardId);
    if (!card) return;
    const fullName = cardNameWithSubtitle(card);
    if (!processedDeck[fullName]) {
      processedDeck[fullName] = { qty: 0, card };
    }
    processedDeck[fullName].qty += entry.count;
  });
  const deckList = useMemo(
    () =>
      Object.values(processedDeck)
        .map(({ card, qty }) => ({ card, qty }))
        .filter(({ card }) => !!card),
    [deck, cards]
  );

  function sumQty(filterFn) {
    return deckList.filter(({ card }) => filterFn(card)).reduce((sum, { qty }) => sum + qty, 0);
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
      .filter(
        ({ card }) =>
          typeof card[prop] === "string" &&
          card[prop].toLowerCase().includes(str.toLowerCase())
      )
      .reduce((sum, { qty }) => sum + qty, 0);
  }
  function sumPropertyWhereContains(prop, contains) {
    let total = 0, cardsWithProp = 0;
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
  
function cardMatchesProperties(card, match) {
  if (!card || !match || typeof match !== "object") return false;

  return Object.entries(match).every(([prop, expected]) => {
    const actual = card[prop];

    // Allow arrays in config:
    // "Type": ["Item", "Equipment"]
    if (Array.isArray(expected)) {
      return expected.includes(actual);
    }

    return actual === expected;
  });
}

function cardMatchesExclude(card, exclude) {
  if (!exclude || typeof exclude !== "object") return false;

  return Object.entries(exclude).some(([prop, expected]) => {
    const actual = card[prop];

    // Allow arrays in config:
    // "Species": ["Dragonkin", "Undead"]
    if (Array.isArray(expected)) {
      return expected.includes(actual);
    }

    return actual === expected;
  });
}

function pointCostByRules(rules) {
  let grandTotal = 0;

  for (const rule of rules || []) {
    if (!rule || !rule.match) continue;

    const matchingQty = deckList.reduce((sum, { card, qty }) => {
      if (!cardMatchesProperties(card, rule.match)) return sum;
      if (cardMatchesExclude(card, rule.exclude)) return sum;

      return sum + qty;
    }, 0);

    if (matchingQty <= 0) continue;

    const pointsEach = Number(rule.points || 0);

    if (rule.bundle && Number(rule.bundle.qty) > 0) {
      const bundleQty = Number(rule.bundle.qty);
      const bundlePoints = Number(rule.bundle.points || 0);

      const bundles = Math.floor(matchingQty / bundleQty);
      const remainder = matchingQty % bundleQty;

      grandTotal += bundles * bundlePoints;
      grandTotal += remainder * pointsEach;
    } else {
      grandTotal += matchingQty * pointsEach;
    }
  }

  return grandTotal;
}

  
  function sumPropertyByRegex(prop, regexStr) {
    let total = 0, cardsWithProp = 0;
    let regex;
    try {
      regex = new RegExp(regexStr, "i");
    } catch (e) {
      return { total: 0, cardsWithProp: 0 };
    }
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
  function countType(prop, value) {
    return sumQty(card => card && card[prop] === value);
  }
  const stats = [];
  for (const item of statsConfig) {
	if (item.type === "totalCount") {
	  const minMaxExclude = settings?.deckValidation?.minMaxExclude;

	  // Same exclusion behavior as the bottom counter:
	  const excludedByDeckRules = (card, section) => {
		try {
		  if (typeof matchesExclude === "function" && matchesExclude(card, minMaxExclude, section)) return true;
		} catch (e) { /* noop */ }

		// Fallback for legacy array form (keeps old behavior working)
		if (!minMaxExclude || !Array.isArray(minMaxExclude)) return false;
		return minMaxExclude.some(rule => {
		  if (!rule) return false;
		  if (rule.group && section && section === rule.group) return true;
		  if (rule.property && Object.prototype.hasOwnProperty.call(card || {}, rule.property)) {
			return card[rule.property] === rule.value;
		  }
		  if (rule.properties && typeof rule.properties === "object") {
			return Object.entries(rule.properties).every(([k, v]) => (card && card[k] === v));
		  }
		  return false;
		});
	  };

	  const totalCards = Object.entries(deck).reduce((sum, [cardId, entry]) => {
		const card = cards.find(c => c.id === cardId);
		if (!card) return sum;

		// If group is a string (normal grouping), treat it as the section/group name.
		if (typeof entry.group === "string") {
		  return excludedByDeckRules(card, entry.group) ? sum : sum + (entry.count || 0);
		}

		// If group is an object (split across sections), apply exclusion per-section.
		if (entry.group && typeof entry.group === "object") {
		  let assigned = 0;
		  let kept = 0;

		  for (const [sectionName, qty] of Object.entries(entry.group)) {
			assigned += qty || 0;
			if (!excludedByDeckRules(card, sectionName)) kept += qty || 0;
		  }

		  const totalCount = entry.count || assigned;
		  const remainder = totalCount - assigned;
		  if (remainder > 0 && !excludedByDeckRules(card, undefined)) kept += remainder;

		  return sum + kept;
		}

		// No group info
		return excludedByDeckRules(card, undefined) ? sum : sum + (entry.count || 0);
	  }, 0);

	  stats.push(
		<span key="totalCount" className="deck-stat">
		  {item.label || "Cards"}: <b>{totalCards}</b>
		</span>
	  );
	}
	
	else if (item.type === "pointCostByRules") {
  const total = pointCostByRules(item.rules);

  stats.push(
    <span
      key={`pointCostByRules:${item.label || "points"}`}
      className="deck-stat"
    >
      {item.label || "Points"}: <b>{total}</b>
    </span>
  );
}
    else if (item.type === "sumPropertyOfCardsWhereContains") {
      const { total, cardsWithProp } = sumPropertyOfCardsWhereContains(deckList, item.filterProp, item.contains, item.sumProp);
      stats.push(
        <span
          key={`sumPropertyOfCardsWhereContains:${item.filterProp}:${item.contains}:${item.sumProp}`}
          className="deck-stat"
        >
          {item.label ||
            `Sum of ${item.sumProp} for cards with ${item.filterProp} containing "${item.contains}"`}:{" "}
          <b>{total}</b>
          {` (${cardsWithProp} card${cardsWithProp !== 1 ? "s" : ""})`}
        </span>
      );
    }
    else if (item.type === "countType") {
      const count = countType(item.prop, item.value);
      stats.push(
        <span
          key={`countType:${item.prop}:${item.value}`}
          className="deck-stat"
        >
          {item.label || `${item.value} cards`}: <b>{count}</b>
        </span>
      );
    }
    else if (item.type === "countContains") {
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
    }
    else if (item.type === "sumPropertyWhereContains") {
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
    }
    else if (item.type === "sumPropertyByRegex") {
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
  return <div className="deck-stats-banner">{stats}</div>;
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
        if (!cancelled) setStatsConfig(json);
      } catch {
        if (!cancelled) setStatsConfig([{ type: "totalCount", label: "Total Cards" }]);
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
    <DeckStatsBanner
      deck={deck}
      cards={cards}
      statsConfig={statsConfig}
      settings={settings}
    />
  );
}

// DeckPanel main component
function DeckPanel({
  cards,
  deck,
  settings,
  onRemoveCard,
  onAddCard,
  moveCard,
  selectedCard,
  setSelectedCard,
  groupByProp,
  setGroupByProp,
  octgnOverridesProp,
  setOctgnOverridesProp,
  octgnSections,
  octgnDefaultSection,
  panelIgnoreSections = [],
  enableTouchDrag = false,
}) {
  const [internalGroupBy, setInternalGroupBy] = useState(settings.groupOptions[0]);
  const groupBy = groupByProp !== undefined ? groupByProp : internalGroupBy;
  const setGroupBy = setGroupByProp !== undefined ? setGroupByProp : setInternalGroupBy;
  const [displayMode, setDisplayMode] = useState("list");
  const [moveMode, setMoveMode] = useState("one");  // “one” or “all"
  const [touchDrag, setTouchDrag] = useState(null);
  const touchDragRef = useRef(null);
  const touchHoldTimerRef = useRef(null);
  const touchStartRef = useRef(null);

  const [internalOctgnOverrides, setInternalOctgnOverrides] = useState({});
  const octgnOverrides = octgnOverridesProp !== undefined ? octgnOverridesProp : internalOctgnOverrides;
  const setOctgnOverrides = setOctgnOverridesProp !== undefined ? setOctgnOverridesProp : setInternalOctgnOverrides;

 // NEW: smart remove handler
  function handleRemove(cardId, displayGroup) {
    // only do this special check when NOT in OCTGN view
    if (groupBy !== "OCTGN") {
      const entry = deck[cardId];
      if (entry?.group && typeof entry.group === "object") {
        // figure out which real sections have copies
        const realGroups = Object.entries(entry.group)
          .filter(([_, qty]) => qty > 0)
          .map(([g]) => g);

        // if split across more than one
        if (realGroups.length > 1) {
          window.alert("Please switch to OCTGN view to remove cards.");
          return;
        }

        // if exactly one real section, remove there
        if (realGroups.length === 1) {
          onRemoveCard(cardId, 1, realGroups[0]);
          return;
        }
      }
    }

    // fallback: remove from whatever the UI was showing
    onRemoveCard(cardId, 1, displayGroup);
  }


  const availableGroupOptions = useMemo(() => {
    let opts = [...settings.groupOptions];
    if (settings.octgnExport && !opts.includes("OCTGN")) {
      opts.push("OCTGN");
    }
    return opts;
  }, [settings.groupOptions, settings.octgnExport]);

  const filteredSections = useMemo(() => {
    if (groupBy === "OCTGN" && octgnSections) {
      const kept = octgnSections.filter(s => !panelIgnoreSections.includes(s.name));
      if (octgnDefaultSection && !kept.some(s => s.name === octgnDefaultSection)) {
        kept.push({ name: octgnDefaultSection, criteria: {} });
      }
      return kept;
    }
    return null;
  }, [groupBy, octgnSections, panelIgnoreSections, octgnDefaultSection]);

  const grouped = useMemo(() => {
    if (groupBy === "OCTGN" && filteredSections) {
      return groupDeckByOctgn(
        deck,
        cards,
        filteredSections,
        octgnDefaultSection,
        octgnOverrides
      );
    }
    return groupDeck(deck, cards, groupBy);
  }, [
    groupBy,
    deck,
    cards,
    filteredSections,
    octgnDefaultSection,
    octgnOverrides
  ]);

  const FALLBACK_GROUP_ORDER = ["Creatures", "Spells", "Lands", "Other"];
  const groupOrder =
    settings.groupOrder && Array.isArray(settings.groupOrder)
      ? settings.groupOrder
      : FALLBACK_GROUP_ORDER;

  const groupSorts = settings.groupSort || {};

  function getSortedGroupNames(groupedObj) {
    if (groupBy === "OCTGN") {
      const configuredNames = (filteredSections || []).map(s => s.name);
      if (octgnDefaultSection && !configuredNames.includes(octgnDefaultSection)) {
        configuredNames.push(octgnDefaultSection);
      }

      const additionalNames = Object.keys(groupedObj)
        .filter(name => !configuredNames.includes(name))
        .sort((a, b) => a.localeCompare(b));

      return [...configuredNames, ...additionalNames];
    }
    const groupNames = Object.keys(groupedObj);
    const inOrder = groupOrder.filter(name => groupNames.includes(name));
    const remaining = groupNames
      .filter(name => !groupOrder.includes(name))
      .sort();
    return [...inOrder, ...remaining];
  }

  function isKnownOctgnGroup(groupName) {
    return (
      groupName === octgnDefaultSection ||
      (octgnSections || []).some(section => section.name === groupName)
    );
  }

  function getGroupDisplayName(groupName) {
    if (groupBy !== "OCTGN" || isKnownOctgnGroup(groupName)) return groupName;
    return `⚠ Missing Group: ${groupName}`;
  }

  // --- Shared group-moving action used by desktop drag/drop and mobile touch drag. ---
  function moveBetweenGroups(cardId, fromSection, toSection) {
    if (
      groupBy !== "OCTGN" ||
      !cardId ||
      !fromSection ||
      !toSection ||
      fromSection === toSection
    ) {
      return;
    }

    if (moveMode === "one") {
      moveCard(cardId, 1, fromSection, toSection);
      return;
    }

    const entry = deck[cardId] || {};
    const bucketCount = entry.group?.[fromSection] ?? entry.count ?? 0;
    if (bucketCount > 0) {
      moveCard(cardId, bucketCount, fromSection, toSection);
    }
  }

  function handleDragStart(e, cardId, fromSection) {
    e.dataTransfer.setData("cardId", cardId);
    e.dataTransfer.setData("fromSection", fromSection);
  }

  function handleDrop(e, toSection) {
    e.preventDefault();
    moveBetweenGroups(
      e.dataTransfer.getData("cardId"),
      e.dataTransfer.getData("fromSection"),
      toSection
    );
  }

  function handleDragOver(e) {
    e.preventDefault();
  }

  function clearTouchHoldTimer() {
    if (touchHoldTimerRef.current) {
      window.clearTimeout(touchHoldTimerRef.current);
      touchHoldTimerRef.current = null;
    }
  }

  function resetTouchDrag() {
    clearTouchHoldTimer();
    touchStartRef.current = null;
    touchDragRef.current = null;
    setTouchDrag(null);
  }

  function findTouchDropSection(clientX, clientY) {
    const element = document.elementFromPoint(clientX, clientY);
    return element?.closest?.("[data-deck-drop-section]")?.dataset
      ?.deckDropSection || null;
  }

  function handleTouchDragPointerDown(e, card, fromSection) {
    if (!enableTouchDrag || groupBy !== "OCTGN") return;

    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    touchStartRef.current = {
      pointerId: e.pointerId,
      cardId: card.id,
      fromSection,
      label: cardNameWithSubtitle(card),
      startX: e.clientX,
      startY: e.clientY,
    };

    clearTouchHoldTimer();
    touchHoldTimerRef.current = window.setTimeout(() => {
      const start = touchStartRef.current;
      if (!start || start.pointerId !== e.pointerId) return;

      const nextDrag = {
        active: true,
        cardId: start.cardId,
        fromSection: start.fromSection,
        label: start.label,
        x: start.startX,
        y: start.startY,
        targetSection: start.fromSection,
      };
      touchDragRef.current = nextDrag;
      setTouchDrag(nextDrag);
      navigator.vibrate?.(20);
    }, 225);
  }

  function handleTouchDragPointerMove(e) {
    const start = touchStartRef.current;
    if (!start || start.pointerId !== e.pointerId) return;

    const activeDrag = touchDragRef.current;
    if (!activeDrag) {
      const distance = Math.hypot(
        e.clientX - start.startX,
        e.clientY - start.startY
      );
      if (distance > 10) resetTouchDrag();
      return;
    }

    e.preventDefault();
    const targetSection = findTouchDropSection(e.clientX, e.clientY);
    const nextDrag = {
      ...activeDrag,
      x: e.clientX,
      y: e.clientY,
      targetSection,
    };
    touchDragRef.current = nextDrag;
    setTouchDrag(nextDrag);

    const scrollRegion = document.querySelector(".mobile-content");
    if (scrollRegion) {
      const bounds = scrollRegion.getBoundingClientRect();
      const edgeSize = 54;
      if (e.clientY < bounds.top + edgeSize) scrollRegion.scrollBy(0, -12);
      if (e.clientY > bounds.bottom - edgeSize) scrollRegion.scrollBy(0, 12);
    }
  }

  function handleTouchDragPointerUp(e) {
    const start = touchStartRef.current;
    if (!start || start.pointerId !== e.pointerId) return;

    const activeDrag = touchDragRef.current;
    if (activeDrag?.active) {
      e.preventDefault();
      const toSection =
        findTouchDropSection(e.clientX, e.clientY) ||
        activeDrag.targetSection;
      moveBetweenGroups(start.cardId, start.fromSection, toSection);
    }
    resetTouchDrag();
  }

  useEffect(() => () => clearTouchHoldTimer(), []);

  // Validation, etc (unchanged)
  const processedDeckByName = {};
  Object.entries(deck).forEach(([cardId, entry]) => {
    const card = cards.find(c => c.id === cardId);
    if (!card) return;
    const count = entry.count || 0;
    const useNameSub = !!settings.deckValidation?.countByNameAndSubtitle;
	const name = useNameSub ? cardNameWithSubtitle(card) : card.name;
    if (!processedDeckByName[name]) {
      processedDeckByName[name] = { qty: 0, cardIds: [], card };
    }
    processedDeckByName[name].qty += count;
    processedDeckByName[name].cardIds.push(cardId);
  });

  const minMaxExclude = settings.deckValidation?.minMaxExclude;
  // Fallback wrapper: try the shared util first; if it returns false,
  // evaluate simple property/group rules locally so we always match.
  const excludedByDeckRules = (card, section) => {
    try {
      if (typeof matchesExclude === "function" && matchesExclude(card, minMaxExclude, section)) return true;
    } catch (e) { /* noop */ }
    if (!minMaxExclude || !Array.isArray(minMaxExclude)) return false;
    return minMaxExclude.some(rule => {
      if (!rule) return false;
      // Group/section rule
      if (rule.group && section && section === rule.group) return true;
      // Single property rule
      if (rule.property && Object.prototype.hasOwnProperty.call(card || {}, rule.property)) {
        return card[rule.property] === rule.value;
      }
      // Multi-property AND rule
      if (rule.properties && typeof rule.properties === "object") {
        return Object.entries(rule.properties).every(([k, v]) => (card && card[k] === v));
      }
      return false;
    });
  };
const errors = [];

const totalCards =
  groupBy === "OCTGN"
    ? Object.entries(grouped).reduce((sum, [sectionName, arr]) => {
        const sectionTotal = arr.reduce((s, { card, qty }) => {
          return excludedByDeckRules(card, sectionName) ? s : s + qty;
        }, 0);
        return sum + sectionTotal;
      }, 0)
    : Object.entries(deck).reduce((sum, [cardId, e]) => {
        const card = cards.find(c => c.id === cardId);
        if (!card) return sum;

        const count = e.count || 0;

        // If this deck entry is assigned to a single group, use it.
        if (typeof e.group === "string") {
          return excludedByDeckRules(card, e.group) ? sum : sum + count;
        }

        // If this deck entry is split across multiple groups, apply exclude per group bucket.
        if (e.group && typeof e.group === "object") {
          let assigned = 0;
          let kept = 0;

          for (const [groupName, qty] of Object.entries(e.group)) {
            assigned += qty || 0;
            if (!excludedByDeckRules(card, groupName)) kept += qty || 0;
          }

          // If entry.count is larger than the sum of buckets, treat the remainder as “ungrouped”.
          const remainder = count - assigned;
          if (remainder > 0 && !excludedByDeckRules(card, undefined)) kept += remainder;

          return sum + kept;
        }

        // No group info
        return excludedByDeckRules(card, undefined) ? sum : sum + count;
      }, 0);

  if (totalCards < settings.deckValidation.minCards)
    errors.push("Not enough cards in deck!");
  if (totalCards > settings.deckValidation.maxCards)
    errors.push("Too many cards in deck!");

  for (const name in processedDeckByName) {
    const { qty, card } = processedDeckByName[name];
    // If globally excluded, skip from copy-limit enforcement too
    if (excludedByDeckRules(card, undefined)) continue;
   if (qty > settings.deckValidation.maxCopiesPerCard) {
      errors.push(
        `Too many copies of ${name} (max ${settings.deckValidation.maxCopiesPerCard})`
      );
    }
    if (settings.deckValidation.usePerCardLimit && !isNaN(Number(card.Limit)) && qty > Number(card.Limit))
    {
      errors.push(`${name} is Limit: ${card.Limit}.`);
    }
  }

  for (const rule of settings.deckValidation.propertyLimits || []) {
    let matchesCard;
    if (rule.properties && typeof rule.properties === "object") {
      matchesCard = (card) =>
        Object.entries(rule.properties).every(([prop, val]) => {
          const cv = card && card[prop];
          return Array.isArray(val) ? val.includes(cv) : cv === val;
        });
    } else if (rule.property) {
      matchesCard = (card) => {
        const cv = card && card[rule.property];
        const val = rule.value;
        return Array.isArray(val) ? val.includes(cv) : cv === val;
      };
    } else {
      continue;
    }
    const count = Object.entries(deck).reduce((sum, [cardId, entry]) => {
  const card = cards.find((c) => c.id === cardId);

  if (!card || !matchesCard(card)) {
    return sum;
  }

  const totalCount = Number(entry.count) || 0;

  if (typeof entry.group === "string") {
    return matchesExclude(card, rule.exclude, entry.group)
      ? sum
      : sum + totalCount;
  }

  if (entry.group && typeof entry.group === "object") {
    let includedCount = 0;
    let groupedCount = 0;

    for (const [groupName, groupQuantity] of Object.entries(entry.group)) {
      const quantity = Number(groupQuantity) || 0;
      groupedCount += quantity;

      if (!matchesExclude(card, rule.exclude, groupName)) {
        includedCount += quantity;
      }
    }

    const ungroupedCount = Math.max(0, totalCount - groupedCount);

    if (
      ungroupedCount > 0 &&
      !matchesExclude(card, rule.exclude, null)
    ) {
      includedCount += ungroupedCount;
    }

    return sum + includedCount;
  }

  return matchesExclude(card, rule.exclude, null)
    ? sum
    : sum + totalCount;
}, 0);

    let propDesc = "";
    if (rule.property && "value" in rule) {
      if (rule.showPropertyNameInError === false) {
        propDesc = `${rule.value}`;
      } else {
        propDesc = `${rule.property} ${rule.value}`;
      }
    } else if (rule.properties) {
      propDesc = Object.entries(rule.properties)
        .map(([k, v]) =>
          (rule.showPropertyNameInError === false ? v : `${k} ${v}`)
        )
        .join(" and ");
    }
    propDesc = propDesc.trim();

    let errorStr = "";
    let ruleViolated = false;
    if (
      typeof rule.min === "number" &&
      typeof rule.max === "number" &&
      rule.min === rule.max
    ) {
      ruleViolated = count !== rule.min;
      if (ruleViolated) {
        if (rule.errorMessage) {
          errorStr = rule.errorMessage
            .replace(/\{count\}/g, count)
            .replace(/\{min\}/g, rule.min)
            .replace(/\{max\}/g, rule.max)
            .replace(/\{desc\}/g, propDesc);
        } else {
          errorStr = `${count} ${propDesc} cards in deck, must be exactly ${rule.min}`;
        }
      }
    } else if (
      typeof rule.min === "number" &&
      typeof rule.max === "number" &&
      rule.min !== rule.max
    ) {
      ruleViolated = count < rule.min || count > rule.max;
      if (ruleViolated) {
        if (rule.errorMessage) {
          errorStr = rule.errorMessage
            .replace(/\{count\}/g, count)
            .replace(/\{min\}/g, rule.min)
            .replace(/\{max\}/g, rule.max)
            .replace(/\{desc\}/g, propDesc);
        } else {
          errorStr = `${count} ${propDesc} cards in deck, must be between ${rule.min} and ${rule.max}`;
        }
      }
    } else {
      if (typeof rule.min === "number" && count < rule.min) {
        ruleViolated = true;
        if (rule.errorMessage) {
          errorStr = rule.errorMessage
            .replace(/\{count\}/g, count)
            .replace(/\{min\}/g, rule.min)
            .replace(/\{max\}/g, rule.max)
            .replace(/\{desc\}/g, propDesc);
        } else {
          errorStr = `${count} ${propDesc} cards in deck, must be at least ${rule.min}`;
        }
      }
      if (typeof rule.max === "number" && count > rule.max) {
        ruleViolated = true;
        if (rule.errorMessage) {
          errorStr = rule.errorMessage
            .replace(/\{count\}/g, count)
            .replace(/\{min\}/g, rule.min)
            .replace(/\{max\}/g, rule.max)
            .replace(/\{desc\}/g, propDesc);
        } else {
          errorStr = `${count} ${propDesc} cards in deck, must be no more than ${rule.max}`;
        }
      }
    }
	if (ruleViolated && errorStr) errors.push(errorStr);
  }
  
  // --- Group limits ---
  // Supports:
  // 1. Min/max total cards assigned to a group.
  // 2. Min/max cards matching a property within a group.
  // Multiple rules may target the same group.
  for (const rule of settings.deckValidation.groupLimits || []) {
    const configuredGroups = Array.isArray(rule.group)
      ? rule.group
      : [rule.group];

    const targetGroups = configuredGroups.filter(
      (groupName) =>
        typeof groupName === "string" && groupName.trim() !== ""
    );

    if (targetGroups.length === 0) {
      continue;
    }

    const matchesGroupLimitCard = (card) => {
      // No property filter means count every card in the target group.
      if (
        !rule.property &&
        (!rule.properties ||
          typeof rule.properties !== "object" ||
          Array.isArray(rule.properties))
      ) {
        return true;
      }

      // Match multiple required properties.
      if (
        rule.properties &&
        typeof rule.properties === "object" &&
        !Array.isArray(rule.properties)
      ) {
        return Object.entries(rule.properties).every(
          ([propertyName, expectedValue]) => {
            const actualValue = card?.[propertyName];

            return Array.isArray(expectedValue)
              ? expectedValue.includes(actualValue)
              : actualValue === expectedValue;
          }
        );
      }

      // Match one property and value.
      if (rule.property) {
        const actualValue = card?.[rule.property];
        const expectedValue = rule.value;

        return Array.isArray(expectedValue)
          ? expectedValue.includes(actualValue)
          : actualValue === expectedValue;
      }

      return true;
    };

    const count = Object.entries(deck).reduce(
      (total, [cardId, entry]) => {
        const card = cards.find((candidate) => candidate.id === cardId);

        if (!card || !matchesGroupLimitCard(card)) {
          return total;
        }

        const entryCount = Number(entry.count) || 0;

        // Legacy/simple format: the whole entry belongs to one group.
        if (typeof entry.group === "string") {
          return targetGroups.includes(entry.group)
            ? total + entryCount
            : total;
        }

        // Current split-group format:
        // {
        //   count: 3,
        //   group: {
        //     Main: 2,
        //     Sideboard: 1
        //   }
        // }
        if (entry.group && typeof entry.group === "object") {
          const matchingQuantity = Object.entries(entry.group).reduce(
            (groupTotal, [groupName, quantityValue]) => {
              if (!targetGroups.includes(groupName)) {
                return groupTotal;
              }

              return groupTotal + (Number(quantityValue) || 0);
            },
            0
          );

          return total + matchingQuantity;
        }

        return total;
      },
      0
    );

    let description = targetGroups.join(" or ");

    if (rule.property && Object.prototype.hasOwnProperty.call(rule, "value")) {
      const displayedValue = Array.isArray(rule.value)
        ? rule.value.join(" or ")
        : rule.value;

      description +=
        rule.showPropertyNameInError === false
          ? ` ${displayedValue}`
          : ` ${rule.property} ${displayedValue}`;
    } else if (
      rule.properties &&
      typeof rule.properties === "object" &&
      !Array.isArray(rule.properties)
    ) {
      const propertyDescription = Object.entries(rule.properties)
        .map(([propertyName, expectedValue]) => {
          const displayedValue = Array.isArray(expectedValue)
            ? expectedValue.join(" or ")
            : expectedValue;

          return rule.showPropertyNameInError === false
            ? displayedValue
            : `${propertyName} ${displayedValue}`;
        })
        .join(" and ");

      if (propertyDescription) {
        description += ` ${propertyDescription}`;
      }
    }

    const formatGroupLimitMessage = (defaultMessage) => {
      const template = rule.errorMessage || defaultMessage;

      return template
        .replace(/\{count\}/g, String(count))
        .replace(/\{min\}/g, String(rule.min ?? ""))
        .replace(/\{max\}/g, String(rule.max ?? ""))
        .replace(/\{group\}/g, targetGroups.join(" or "))
        .replace(/\{desc\}/g, description);
    };

    const hasMin = typeof rule.min === "number";
    const hasMax = typeof rule.max === "number";

    if (hasMin && hasMax && rule.min === rule.max) {
      if (count !== rule.min) {
        errors.push(
          formatGroupLimitMessage(
            `${description} must contain exactly {min} cards: currently {count}`
          )
        );
      }
    } else if (hasMin && hasMax) {
      if (count < rule.min || count > rule.max) {
        errors.push(
          formatGroupLimitMessage(
            `${description} must contain between {min} and {max} cards: currently {count}`
          )
        );
      }
    } else if (hasMin && count < rule.min) {
      errors.push(
        formatGroupLimitMessage(
          `${description} must contain at least {min} cards: currently {count}`
        )
      );
    } else if (hasMax && count > rule.max) {
      errors.push(
        formatGroupLimitMessage(
          `${description} may contain no more than {max} cards: currently {count}`
        )
      );
    }
  }

  const normalize = (name) => name.toLowerCase().replace(/[\W_]+/g, "").trim();

  const deckCardsByNormalizedName = {};
  Object.entries(deck).forEach(([cardId, entry]) => {
    const card = cards.find(c => c.id === cardId);
    if (!card) return;
    const count = entry.count || 0;
    const normName = normalize(card.name);
    if (!deckCardsByNormalizedName[normName]) {
      deckCardsByNormalizedName[normName] = { card, qty: count };
    } else {
      deckCardsByNormalizedName[normName].qty += count;
    }
  });

  const bannedNamesInDeck = (settings.deckValidation.banList || [])
    .map(normalize)
    .filter(name => deckCardsByNormalizedName[name]);

  if (bannedNamesInDeck.length) {
    const actualNames = bannedNamesInDeck.map(name => deckCardsByNormalizedName[name].card.name);
    errors.push("Banned cards in deck: " + actualNames.join(", "));
  }

  // --- Faction limit check ---
  const factionLimit = settings.deckValidation?.factionLimit;
  if (factionLimit && factionLimit.property) {
    const factions = new Set();
    Object.entries(deck).forEach(([cardId, entry]) => {
      const card = cards.find(c => c.id === cardId);
      if (!card) return;
      const val = card[factionLimit.property];
      if (
        val !== undefined &&
        val !== null &&
        String(val).trim() !== "" &&
        (!factionLimit.ignore || !factionLimit.ignore.includes(val))
      ) {
        factions.add(val);
      }
    });

    if (factions.size > 1) {
      const factionList = Array.from(factions).join(", ");
      const msg = factionLimit.errorMessage
        ? factionLimit.errorMessage.replace("{factions}", factionList)
        : `Deck may only contain one faction (excluding ${factionLimit.ignore?.join(", ")}): found ${factionList}`;
      errors.push(msg);
    }
  }

  // Swap logic for alternate printings
  function handleSwap(card, qty) {
    const subtitle = card.Subtitle || card.subtitle || "";
    const group = cards.filter(
      c =>
        c.name === card.name &&
        ((c.Subtitle || c.subtitle || "") === subtitle)
    );
    if (group.length <= 1) return;
    const idx = group.findIndex(c => c.id === card.id);
    const next = group[(idx + 1) % group.length];
    onRemoveCard(card.id, qty);
    onAddCard(next.id, qty);
    setSelectedCard(next.id);
  }

  // --- Render ---
  return (
    <aside className="deck-panel">
      <div style={{ display: "flex", alignItems: "center", gap: "1em" }}>
        <div>
          <label>Group by: </label>
          <select value={groupBy} onChange={e => setGroupBy(e.target.value)}>
            {availableGroupOptions.map(opt => (
              <option value={opt} key={opt}>{opt}</option>
            ))}
          </select>
        </div>
        <div>
          <label>Display: </label>
          <select value={displayMode} onChange={e => setDisplayMode(e.target.value)}>
            <option value="list">List</option>
            <option value="grid">Grid</option>
          </select>
        </div>
        <div>
          <label>Move: </label>
          <select value={moveMode} onChange={e => setMoveMode(e.target.value)}>
            <option value="one">Move One</option>
            <option value="all">Move All</option>
          </select>
        </div>
      </div>

      <DeckStats deck={deck} cards={cards} settings={settings} />

      {groupBy === "OCTGN" && filteredSections ? (
        getSortedGroupNames(grouped).map((sectionName) => {
          const sectionCards = grouped[sectionName] || [];
          const sortProps = groupSorts[sectionName];
          const sortedSectionCards = sortGroup(sectionCards, sortProps);
          return (
            <div
              key={sectionName}
              className={`deck-group${touchDrag?.targetSection === sectionName ? " touch-drop-target" : ""}`}
              data-deck-drop-section={sectionName}
              onDrop={e => handleDrop(e, sectionName)}
              onDragOver={handleDragOver}
            >
              <div className="deck-group-header">
                {getGroupDisplayName(sectionName)} <span className="deck-group-count">({sectionCards.reduce((a, b) => a + b.qty, 0)})</span>
              </div>
              {displayMode === "grid" ? (
                <div className="deck-group-grid">
                  {sortedSectionCards.map(({ card, qty }) => {
                    const altCount = getAlternatePrintings(card, cards).length;
                    return (
                      <div
                        key={card.id}
                        className="deck-card-grid-cell"
                        draggable
                        onDragStart={e => handleDragStart(e, card.id, sectionName)}
                      >
                        {enableTouchDrag && groupBy === "OCTGN" && (
                          <button
                            type="button"
                            className="mobile-card-drag-handle mobile-card-drag-handle-grid"
                            aria-label={`Move ${cardNameWithSubtitle(card)} from ${sectionName}`}
                            title="Press and hold, then drag to another group"
                            onClick={e => e.stopPropagation()}
                            onContextMenu={e => e.preventDefault()}
                            onPointerDown={e => handleTouchDragPointerDown(e, card, sectionName)}
                            onPointerMove={handleTouchDragPointerMove}
                            onPointerUp={handleTouchDragPointerUp}
                            onPointerCancel={resetTouchDrag}
                          >
                            <span aria-hidden="true">⠿</span>
                          </button>
                        )}
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
							extraData={buildCardPreviewProperties(card, settings)}
                            onAdd={e => {
                              e.stopPropagation();
                              if (groupBy === "OCTGN") {
   onAddCard(card.id, 1, sectionName)
 } else {
   // let the default "Type" (or whatever) grouping take over
   onAddCard(card.id, 1)
 }
                            }}
                            onRemove={e => {
                              e.stopPropagation();
                              handleRemove(card.id, sectionName);
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
              ) : (
                <ul className="deck-group-list">
                  {sortedSectionCards.map(({ card, qty }) => {
                    const altCount = getAlternatePrintings(card, cards).length;
                    return (
                      <li
                        key={card.id}
                        className={`deck-group-list-item${selectedCard === card.id ? " selected" : ""}${touchDrag?.cardId === card.id && touchDrag?.fromSection === sectionName ? " touch-drag-source" : ""}`}
                        onClick={() => setSelectedCard(card.id)}
                        draggable
                        onDragStart={e => handleDragStart(e, card.id, sectionName)}
                      >
                        {enableTouchDrag && groupBy === "OCTGN" && (
                          <button
                            type="button"
                            className="mobile-card-drag-handle"
                            aria-label={`Move ${cardNameWithSubtitle(card)} from ${sectionName}`}
                            title="Press and hold, then drag to another group"
                            onClick={e => e.stopPropagation()}
                            onContextMenu={e => e.preventDefault()}
                            onPointerDown={e => handleTouchDragPointerDown(e, card, sectionName)}
                            onPointerMove={handleTouchDragPointerMove}
                            onPointerUp={handleTouchDragPointerUp}
                            onPointerCancel={resetTouchDrag}
                          >
                            <span aria-hidden="true">⠿</span>
                          </button>
                        )}
                        <span className="deck-card-list-label">{cardNameWithSubtitle(card)} x{qty}</span>
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
                                handleRemove(card.id, sectionName);
                              }}
                            >
                              -1
                            </button>
                            <button
                              className="deck-modify-btn"
                              onClick={e => {
                                e.stopPropagation();
                                if (groupBy === "OCTGN") {
   onAddCard(card.id, 1, sectionName)
 } else {
   // let the default "Type" (or whatever) grouping take over
   onAddCard(card.id, 1)
 }
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
        getSortedGroupNames(grouped).map(group => {
          const sortProps = groupSorts[group];
          const sortedCards = sortGroup(grouped[group], sortProps);
          return (
            <div key={group}>
              <strong>
                {getGroupDisplayName(group)} ({sortedCards.reduce((a, b) => a + b.qty, 0)})
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
                      <span>
                        {cardNameWithSubtitle(card)} x{qty}
                      </span>
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
                            onClick={e => { e.stopPropagation();  handleRemove(card.id, group); }}
                          >
                            -1
                          </button>
                          <button 
						  className="deck-modify-btn"
						  onClick={e => {
  e.stopPropagation();
  if (groupBy === "OCTGN") {
    onAddCard(card.id, 1, group);
  } else {
    onAddCard(card.id, 1);
  }
}}>
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
                {getGroupDisplayName(group)} ({sortedCards.reduce((a, b) => a + b.qty, 0)})
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
                        onClick={() => setSelectedCard(card.id)}
                      >
                        <CardPreview
                          card={card}
                          game={settings.gameName}
                          showName={false}
                          quantity={qty}
                          showButtons={true}
						  extraData={buildCardPreviewProperties(card, settings)}
                          onAdd={e => {
                            e.stopPropagation();
                            onAddCard(card.id, 1, group);
                          }}
                          onRemove={e => {
                            e.stopPropagation();
                            handleRemove(card.id, group);
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
                        <div
                          style={{
                            textAlign: "center",
                            marginTop: "2px",
                            fontSize: "0.82em",
                            fontWeight: "bold",
                          }}
                        >
                          {cardNameWithSubtitle(card)}
                        </div>
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

      {touchDrag?.active && (
        <div
          className="mobile-card-drag-ghost"
          style={{ left: touchDrag.x, top: touchDrag.y }}
          aria-hidden="true"
        >
          <span className="mobile-card-drag-ghost-icon">⠿</span>
          <span>{touchDrag.label}</span>
        </div>
      )}
    </aside>
  );
}

export default DeckPanel;
