export function groupName(value) {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.map(groupName).filter(Boolean).join(", ");
  if (value && typeof value === "object") {
    const named = value.name ?? value.group ?? value.section ?? value.label ?? value.value;
    if (named != null) return groupName(named);
    const keys = Object.keys(value);
    if (keys.length === 1) return keys[0];
    return "";
  }
  return value == null ? "" : String(value);
}

export function orderDeckGroups(groups, positions = {}) {
  const present = [...groups];
  const anchored = present.filter(g => Number.isInteger(positions[g.name]) && positions[g.name] !== 0);
  const loose = present.filter(g => !anchored.includes(g)).sort((a,b) => a.name.localeCompare(b.name));
  const result = Array(present.length).fill(null).map(() => []);
  // Multiple groups in one slot share a position and are ordered alphabetically.
  const assignments = new Map();
  for (const group of anchored) {
    const position = positions[group.name];
    const index = position > 0 ? Math.min(position - 1, present.length - 1) : Math.max(0, present.length + position);
    if (!assignments.has(index)) assignments.set(index, []);
    assignments.get(index).push(group);
  }
  for (const [index, groupsAtSlot] of assignments) result[index].push(...groupsAtSlot.sort((a,b) => a.name.localeCompare(b.name)));
  let cursor = 0;
  for (const slot of result) if (!slot.length && cursor < loose.length) slot.push(loose[cursor++]);
  // If multiple anchors occupied one slot, add any displaced groups after the final slot.
  return result.flat().concat(loose.slice(cursor));
}

export function resolveOctgnSection(card, imported, octgn) {
  const names = (octgn?.sections || []).map(section => section.name);
  const saved = groupName(imported);
  if (saved && names.includes(saved)) return saved;
  for (const section of octgn?.sections || []) {
    const criteria = section.criteria || {};
    const matches = Object.entries(criteria).every(([field, expected]) => {
      const actual = card?.[field];
      const values = Array.isArray(actual) ? actual.map(groupName) : [groupName(actual)];
      return (Array.isArray(expected) ? expected : [expected]).some(v => values.includes(groupName(v)));
    });
    if (Object.keys(criteria).length && matches) return section.name;
  }
  return saved || groupName(octgn?.defaultSection) || "Other";
}

// Split a single ordered stream of sections into columns. Break after a group if
// the ideal break would leave only 1-4 card lines; otherwise repeat a continued heading.
export function flowDeckColumns(groups, columns, sizes, headingHeight, gapHeight) {
  const all = groups.flatMap(g => g.items.map((item, i) => ({ group: g.name, item, first: i === 0, total: g.total })));
  if (columns <= 1 || !all.length) return [all];
  const heightAt = (entry, continued) => (sizes[`${entry.group}:${entry.item.id}`] || 24) + (entry.first || continued ? headingHeight : 0) + gapHeight;
  const total = all.reduce((sum, entry) => sum + heightAt(entry, false), 0);
  const target = total / columns;
  const result = [];
  let start = 0;
  for (let col = 0; col < columns - 1 && start < all.length; col++) {
    let best = start + 1, bestDiff = Infinity, current = 0;
    for (let end = start + 1; end < all.length - (columns - col - 1) + 1; end++) {
      const entry = all[end - 1];
      current += heightAt(entry, end === start && !entry.first);
      const next = all[end];
      if (!next) break;
      let adjustedEnd = end;
      if (next.group === entry.group) {
        let remaining = 0;
        for (let j = end; j < all.length && all[j].group === entry.group; j++) remaining++;
        if (remaining < 5) adjustedEnd = end + remaining;
      }
      if (adjustedEnd >= all.length || adjustedEnd <= start) continue;
      const extra = all.slice(end, adjustedEnd).reduce((sum, e) => sum + heightAt(e, false), 0);
      const projected = current + extra;
      const diff = Math.abs(projected - target);
      if (diff < bestDiff) { bestDiff = diff; best = adjustedEnd; }
      if (current > target * 1.8 && bestDiff < Infinity) break;
    }
    result.push(all.slice(start, best));
    start = best;
  }
  result.push(all.slice(start));
  return result;
}

// Allocate each card to at most one fixed header/footer group before building
// the ordinary groups. A rule matches the original card data, not the current
// "Group by" dropdown, so changing that dropdown never moves pinned cards.
function matchesPinnedEntry(entry, match) {
  if (!match || typeof match !== "object" || Array.isArray(match)) return false;
  const conditions = Object.entries(match);
  if (!conditions.length) return false;
  return conditions.every(([field, expected]) => {
    const actual = field === "OCTGN" ? entry.octgnSection : entry.card?.[field];
    const values = Array.isArray(actual) ? actual : [actual];
    const allowed = Array.isArray(expected) ? expected : [expected];
    return values.some(value => value != null && allowed.some(choice =>
      typeof choice === "string" && String(value).trim().toLowerCase() === choice.trim().toLowerCase()
    ));
  });
}

export function partitionPinnedDeckEntries(entries, pinnedSections) {
  let remaining = [...entries];
  const header = [];
  const footer = [];
  function allocate(definitions, destination) {
    if (!Array.isArray(definitions)) return;
    for (const block of definitions) {
      if (!block || typeof block.name !== "string" || !block.name.trim()) continue;
      const definitions = Array.isArray(block.groups) && block.groups.length
        ? block.groups : [{ name: block.name, match: block.match }];
      const groups = [];
      for (const group of definitions) {
        if (!group || typeof group.name !== "string" || !group.name.trim()) continue;
        const matched = [];
        const unmatched = [];
        for (const entry of remaining) {
          (matchesPinnedEntry(entry, group.match) ? matched : unmatched).push(entry);
        }
        if (matched.length) groups.push({ name: group.name, items: matched, sort: group.sort });
        remaining = unmatched;
      }
      if (groups.length) destination.push({
        name: block.name,
        groups,
        maxColumns: [1, 2, 3].includes(block.maxColumns) ? block.maxColumns : null
      });
    }
  }
  allocate(pinnedSections?.header, header);
  allocate(pinnedSections?.footer, footer);
  return { header, footer, remaining };
}

// Represent all cards as one ordered stream. Pinned blocks are kept together
// at the beginning/end of the stream, independently of the grouping dropdown.
export function makeDeckDisplayEntries(mainGroups, headerBlocks = [], footerBlocks = []) {
  const pinnedEntries = (blocks, zone) => blocks.flatMap((block, bi) => {
    const blockTotal = block.groups.reduce((sum, group) => sum + group.items.reduce((n, item) => n + item.qty, 0), 0);
    return block.groups.flatMap((group, gi) => group.items.map((item, i) => ({
      zone,
      group: block.name,
      groupKey: `${zone}:${bi}`,
      entryKey: `${zone}:${bi}:${gi}:${item.id}`,
      item,
      first: gi === 0 && i === 0,
      total: blockTotal,
      blockName: block.name,
      blockTotal
    })));
  });
  const header = pinnedEntries(headerBlocks, "header");
  const mainTotal = mainGroups.reduce((sum, group) => sum + group.items.reduce((n, item) => n + item.qty, 0), 0);
  const main = mainGroups.flatMap((group, gi) => group.items.map((item, i) => ({
    zone: "main",
    group: group.name,
    groupKey: `main:${gi}`,
    entryKey: `main:${gi}:${item.id}`,
    item,
    first: i === 0,
    total: mainTotal === 0 ? 0 : group.total ?? group.items.reduce((sum, card) => sum + card.qty, 0),
    mainStart: gi === 0 && i === 0 && (header.length > 0 || footerBlocks.length > 0),
    mainTotal
  })));
  const footer = pinnedEntries(footerBlocks, "footer");
  return { header, main, footer, all: [...header, ...main, ...footer] };
}

// Balance the unpinned card lines while reserving height for the fixed blocks
// in the first and last columns. This keeps their order without using a
// separate full-width panel or splitting a pinned block across columns.
export function flowDeckColumnsWithPinned(stream, columnCount, sizes = {}, headingHeight = 27, gapHeight = 2) {
  const { header, main, footer } = stream;
  if (columnCount <= 1) return [[...header, ...main, ...footer]];
  const columns = Math.max(1, Math.min(3, columnCount));
  const itemHeight = entry => (sizes[entry.entryKey] || 24) + gapHeight;
  const headingCost = entry => (entry.first ? headingHeight : 0) +
    (entry.blockStart ? headingHeight + 4 : 0) + (entry.mainStart ? headingHeight + 4 : 0);
  const fixedHeight = entries => entries.reduce((sum, entry) => sum + itemHeight(entry) + headingCost(entry), 0);
  const headerHeight = fixedHeight(header);
  const footerHeight = fixedHeight(footer);
  const prefix = [0];
  for (const row of main) prefix.push(prefix[prefix.length - 1] + itemHeight(row) + headingCost(row));
  const n = main.length;
  const totalHeight = headerHeight + footerHeight + prefix[n];
  const target = totalHeight / columns;
  const segmentHeight = (start, end) => prefix[end] - prefix[start] +
    (start < end && !main[start].first ? headingHeight : 0);
  const legalBreak = pos => {
    if (pos === 0 || pos === n || main[pos - 1].groupKey !== main[pos].groupKey) return true;
    let remaining = 0;
    for (let i = pos; i < n && main[i].groupKey === main[pos].groupKey; i++) remaining++;
    return remaining >= 5;
  };
  // Dynamic programming avoids a very long first/last column when a pinned
  // block takes up substantial height. No cards are reordered or duplicated.
  const cost = Array.from({ length: columns + 1 }, () => Array(n + 1).fill(Infinity));
  const back = Array.from({ length: columns + 1 }, () => Array(n + 1).fill(-1));
  cost[0][0] = 0;
  for (let c = 0; c < columns; c++) {
    for (let start = 0; start <= n; start++) {
      if (!Number.isFinite(cost[c][start])) continue;
      for (let end = start; end <= n; end++) {
        if (c === columns - 1 && end !== n) continue;
        if (c < columns - 1 && !legalBreak(end)) continue;
        const height = segmentHeight(start, end) + (c === 0 ? headerHeight : 0) +
          (c === columns - 1 ? footerHeight : 0);
        const emptyPenalty = start === end && !(c === 0 && header.length || c === columns - 1 && footer.length) ? target * target : 0;
        const nextCost = cost[c][start] + (height - target) ** 2 + emptyPenalty;
        if (nextCost < cost[c + 1][end]) { cost[c + 1][end] = nextCost; back[c + 1][end] = start; }
      }
    }
  }
  if (!Number.isFinite(cost[columns][n])) {
    return [[...header, ...main, ...footer], ...Array.from({ length: columns - 1 }, () => [])];
  }
  const bounds = Array(columns + 1).fill(0);
  bounds[columns] = n;
  for (let c = columns; c > 0; c--) bounds[c - 1] = back[c][bounds[c]];
  return Array.from({ length: columns }, (_, c) => [
    ...(c === 0 ? header : []),
    ...main.slice(bounds[c], bounds[c + 1]),
    ...(c === columns - 1 ? footer : [])
  ]);
}
