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
