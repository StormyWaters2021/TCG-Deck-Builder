import { PDFDocument, StandardFonts } from "pdf-lib";

function normBaseUrl() {
  let baseUrl = import.meta.env.BASE_URL || "";
  if (baseUrl.endsWith("/")) baseUrl = baseUrl.slice(0, -1);
  return baseUrl;
}

async function fetchJson(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to fetch JSON: ${url}`);
  return await resp.json();
}

async function fetchArrayBuffer(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to fetch PDF: ${url}`);
  return await resp.arrayBuffer();
}

function getProp(card, prop) {
  return card ? card[prop] : undefined;
}

function evalCond(card, cond) {
  const { prop, op, value } = cond;
  const v = getProp(card, prop);

  switch (op) {
    case "exists":
      return v !== undefined && v !== null && v !== "";
    case "eq":
      return v === value;
    case "neq":
      return v !== value;
    case "contains":
      return typeof v === "string" && typeof value === "string"
        ? v.includes(value)
        : false;
    case "in":
      return Array.isArray(value) ? value.includes(v) : false;
    case "lt":
      return Number(v) < Number(value);
    case "lte":
      return Number(v) <= Number(value);
    case "gt":
      return Number(v) > Number(value);
    case "gte":
      return Number(v) >= Number(value);
    default:
      return false;
  }
}

function applySort(entries, sort = []) {
  if (!sort || sort.length === 0) return entries;

  const arr = [...entries];
  arr.sort((a, b) => {
    for (const s of sort) {
      const dir = (s.dir || "asc").toLowerCase() === "desc" ? -1 : 1;
      const prop = s.prop;

      const av =
        prop === "name"
          ? a.card.name
          : prop === "count"
            ? a.count
            : getProp(a.card, prop);
      const bv =
        prop === "name"
          ? b.card.name
          : prop === "count"
            ? b.count
            : getProp(b.card, prop);

      const an = Number(av);
      const bn = Number(bv);
      const bothNum = !Number.isNaN(an) && !Number.isNaN(bn);

      if (bothNum) {
        if (an < bn) return -1 * dir;
        if (an > bn) return 1 * dir;
      } else {
        const as = (av ?? "").toString();
        const bs = (bv ?? "").toString();
        const cmp = as.localeCompare(bs, undefined, { sensitivity: "base" });
        if (cmp !== 0) return cmp * dir;
      }
    }
    return 0;
  });

  return arr;
}

function buildDeckEntries(deck, cards) {
  const byId = new Map(cards.map((c) => [c.id, c]));
  const out = [];

  for (const [cardId, entry] of Object.entries(deck || {})) {
    const card = byId.get(cardId);
    if (!card) continue;

    const count =
      typeof entry === "number" ? entry : Number(entry?.count || 0);
    if (count <= 0) continue;

    const groupMap =
      entry &&
      typeof entry === "object" &&
      entry.group &&
      typeof entry.group === "object"
        ? entry.group
        : null;

    if (groupMap && Object.keys(groupMap).length > 0) {
      let sum = 0;
      for (const v of Object.values(groupMap)) sum += Number(v) || 0;

      if (sum > 0) {
        for (const [groupName, gc] of Object.entries(groupMap)) {
          const gCount = Number(gc) || 0;
          if (gCount <= 0) continue;
          out.push({ card, count: gCount, groupName });
        }
        continue;
      }
    }

    out.push({ card, count, groupName: "Ungrouped" });
  }

  return out;
}

function resolveQuery(queryDef, entries) {
  const fromGroups = queryDef.fromGroups || null;
  let subset = entries;

  if (Array.isArray(fromGroups) && fromGroups.length > 0) {
    const allowed = new Set(fromGroups);
    subset = subset.filter((e) => allowed.has(e.groupName));
  }

  if (queryDef.where) {
    const where = queryDef.where;
    subset = subset.filter((e) => where.every((cond) => evalCond(e.card, cond)));
  }

  subset = applySort(subset, queryDef.sort);

  const take = Number(queryDef.take || 0);
  if (take > 0) subset = subset.slice(0, take);

  return subset;
}

function formatTemplate(fmt, ctx) {
  return (fmt || "")
    .replaceAll("{name}", ctx.name ?? "")
    .replaceAll("{count}", ctx.count != null ? String(ctx.count) : "")
    .replaceAll("{group}", ctx.group ?? "");
}

function safeGetTextField(form, fieldName, warnings) {
  try {
    return form.getTextField(fieldName);
  } catch {
    warnings.push(`PDF field not found: "${fieldName}"`);
    return null;
  }
}

function setTextField(form, fieldName, value, fontSize, warnings) {
  const tf = safeGetTextField(form, fieldName, warnings);
  if (!tf) return;
  if (typeof fontSize === "number" && fontSize > 0) tf.setFontSize(fontSize);
  tf.setText(value ?? "");
}

function buildSlotPlan(columns) {
  const plan = [];
  for (let ci = 0; ci < columns.length; ci++) {
    const col = columns[ci];
    const rows = Number(col.rows || 0);
    for (let r = 1; r <= rows; r++) {
      plan.push({
        colIndex: ci,
        rowIndex: r,
        countField: (col.countField || "").replace("{n}", String(r)),
        titleField: (col.titleField || "").replace("{n}", String(r)),
      });
    }
  }
  return plan;
}

function getColumnLastSlotIndex(slotPlan, colIndex) {
  let last = -1;
  for (let i = 0; i < slotPlan.length; i++) {
    if (slotPlan[i].colIndex === colIndex) last = i;
  }
  return last;
}

function planRowPages(mapping, sourceEntries) {
  const { columns, render } = mapping;
  const slotPlan = buildSlotPlan(columns);

  const lastSlotIdxByCol = new Map();
  for (let ci = 0; ci < columns.length; ci++) {
    lastSlotIdxByCol.set(ci, getColumnLastSlotIndex(slotPlan, ci));
  }

  const headerFmt = render.header || "{group}";
  const headerContFmt = render.headerCont || "{group} (cont)";
  const itemCountFmt = render.itemCount || "{count}";
  const itemTitleFmt = render.itemTitle || "{name}";
  const avoidHeaderAtColumnLastLine = !!render.avoidHeaderAtColumnLastLine;
  const blankBetween = !!render.blankLineBetweenGroups;

  const groupBy = render.groupBy || "Type";
  const groups = new Map();

  for (const e of sourceEntries) {
    const g = (getProp(e.card, groupBy) ?? "Other").toString();
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(e);
  }

  let groupNames = Array.from(groups.keys());
  if ((render.sortGroups || "alpha") === "alpha") {
    groupNames.sort((a, b) => a.localeCompare(b));
  }

  if ((render.sortItems || "alpha") === "alpha") {
    for (const g of groupNames) {
      groups.get(g).sort((a, b) =>
        (a.card.name || "").localeCompare(b.card.name || "", undefined, {
          sensitivity: "base",
        }),
      );
    }
  }

  const pages = [];
  let cells = Array.from({ length: slotPlan.length }, () => ({
    count: "",
    title: "",
    kind: "blank",
  }));
  let slotIdx = 0;

  function pushPageIfNeeded() {
    pages.push(cells);
    cells = Array.from({ length: slotPlan.length }, () => ({
      count: "",
      title: "",
      kind: "blank",
    }));
    slotIdx = 0;
  }

  function ensureSpace() {
    if (slotIdx >= slotPlan.length) pushPageIfNeeded();
  }

  function currentCol() {
    return slotPlan[slotIdx]?.colIndex ?? 0;
  }

  function atLastLineOfColumn() {
    const last = lastSlotIdxByCol.get(currentCol());
    return slotIdx === last;
  }

  function advance() {
    slotIdx += 1;
    if (slotIdx >= slotPlan.length) pushPageIfNeeded();
  }

  function writeCell(countText, titleText, kind) {
    ensureSpace();
    cells[slotIdx] = {
      count: countText ?? "",
      title: titleText ?? "",
      kind: kind || "blank",
    };
    advance();
  }

  function ensureHeaderPlacement() {
    if (!avoidHeaderAtColumnLastLine) return;
    if (atLastLineOfColumn()) advance();
  }

  function isStartOfColumn() {
    return slotPlan[slotIdx]?.rowIndex === 1;
  }

  for (let gi = 0; gi < groupNames.length; gi++) {
    const g = groupNames[gi];
    const items = groups.get(g) || [];

    ensureHeaderPlacement();
    writeCell("", formatTemplate(headerFmt, { group: g }), "header");

    for (let ii = 0; ii < items.length; ii++) {
      const e = items[ii];

      if (ii > 0 && isStartOfColumn()) {
        ensureHeaderPlacement();
        writeCell("", formatTemplate(headerContFmt, { group: g }), "header");
      }

      writeCell(
        formatTemplate(itemCountFmt, { count: e.count }),
        formatTemplate(itemTitleFmt, { name: e.card?.name ?? "" }),
        "item",
      );
    }

    if (blankBetween && gi < groupNames.length - 1) {
      writeCell("", "", "blank");
    }
  }

  const hasAny = cells.some((c) => c.count || c.title);
  if (hasAny) pages.push(cells);

  return pages;
}

function applyRowPageToForm(form, mapping, pageCells, fontSizes, warnings) {
  const slotPlan = buildSlotPlan(mapping.columns || []);
  const countSize = fontSizes?.rowCount ?? 9;
  const titleSize = fontSizes?.rowTitle ?? 9;
  const headerSize = fontSizes?.rowHeader ?? 9;

  for (let i = 0; i < slotPlan.length && i < pageCells.length; i++) {
    const slot = slotPlan[i];
    const cell = pageCells[i] || { count: "", title: "", kind: "blank" };

    const sizeForTitle = cell.kind === "header" ? headerSize : titleSize;

    setTextField(form, slot.countField, cell.count, countSize, warnings);
    setTextField(form, slot.titleField, cell.title, sizeForTitle, warnings);
  }
}

function computeColumnTotalsForPage(mapping, pageCells) {
  const slotPlan = buildSlotPlan(mapping.columns || []);
  const totals = new Map(); // colIndex -> sum

  for (let i = 0; i < slotPlan.length && i < pageCells.length; i++) {
    const slot = slotPlan[i];
    const cell = pageCells[i];
    if (!cell || cell.kind !== "item") continue;

    const n = parseInt(String(cell.count || "").trim(), 10);
    if (!Number.isFinite(n)) continue;

    totals.set(slot.colIndex, (totals.get(slot.colIndex) || 0) + n);
  }

  return totals;
}

function applyComputedTotals(form, cfg, mapping, pageCells, fontSizes, warnings) {
  const spec = cfg.computedTotals;
  if (!spec || !Array.isArray(spec.columns) || spec.columns.length === 0) return;

  const totals = computeColumnTotalsForPage(mapping, pageCells);
  const fs = Number(spec.fontSize) > 0 ? Number(spec.fontSize) : (fontSizes?.special ?? 10);

  for (const c of spec.columns) {
    const colIndex = Number(c.colIndex);
    const countField = c.countField;
    if (!countField) continue;

    const value = totals.get(colIndex) || 0;
    setTextField(form, countField, String(value), fs, warnings);
  }
}

export async function exportPdfDecklistWithModal({
  deck,
  cards,
  settings,
  game,
  deckName,
  modalValues,
}) {
  const warnings = [];
  const baseUrl = normBaseUrl();

  const configUrl = `${baseUrl}/games/${settings.gameName}/pdfDecklistExport.json`;
  const cfg = await fetchJson(configUrl);

  const templateUrl = `${baseUrl}/games/${settings.gameName}/${cfg.templatePdf}`;
  const templateBytes = await fetchArrayBuffer(templateUrl);

  const entries = buildDeckEntries(deck, cards);

  const queryResults = {};
  if (cfg.queries) {
    for (const [name, q] of Object.entries(cfg.queries)) {
      queryResults[name] = resolveQuery(q, entries);
    }
  }

  const fontSizes = {
    modal: cfg.appearance?.modalFontSize ?? 10,
    special: cfg.appearance?.specialFontSize ?? 10,
    rowHeader: cfg.appearance?.rowHeaderFontSize ?? 9,
    rowTitle: cfg.appearance?.rowTitleFontSize ?? 9,
    rowCount: cfg.appearance?.rowCountFontSize ?? 9,
  };

  const rowMappings = (cfg.mappings || []).filter((m) => m.op === "fillRowSlots");
  let maxPagesNeeded = 1;
  const plannedRowPagesByMapping = new Map();

  for (const m of rowMappings) {
    const src = queryResults[m.sourceQuery] || [];
    const pages = planRowPages(m, src);
    plannedRowPagesByMapping.set(m, pages);
    maxPagesNeeded = Math.max(maxPagesNeeded, pages.length);
  }

  const pageDocs = [];

  for (let pageIndex = 0; pageIndex < maxPagesNeeded; pageIndex++) {
    const doc = await PDFDocument.load(templateBytes);
    const form = doc.getForm();

    const font = await doc.embedFont(StandardFonts.Helvetica);

    if (cfg.modal?.fields) {
      for (const f of cfg.modal.fields) {
        const v = modalValues?.[f.key];
        if (v == null || String(v).trim() === "") continue;
        setTextField(form, f.pdfField, String(v), fontSizes.modal, warnings);
      }
    }

    for (const m of cfg.mappings || []) {
      if (m.op === "setFieldFromCard") {
        const list = queryResults[m.query] || [];
        const e = list[0];
        if (!e) {
          warnings.push(`Missing: ${m.query} (needed for "${m.field}")`);
          continue;
        }
        setTextField(
          form,
          m.field,
          formatTemplate(m.format, { name: e.card?.name ?? "" }),
          fontSizes.special,
          warnings,
        );
      } else if (m.op === "setFieldFromCardIndex") {
        const list = queryResults[m.query] || [];
        const idx = Number(m.index || 0);
        const e = list[idx];
        if (!e) {
          warnings.push(`Missing: ${m.query}[${idx}] (needed for "${m.field}")`);
          continue;
        }
        setTextField(
          form,
          m.field,
          formatTemplate(m.format, { name: e.card?.name ?? "" }),
          fontSizes.special,
          warnings,
        );
      } else if (m.op === "fillRowSlots") {
		  const pages = plannedRowPagesByMapping.get(m) || [];
		  const pageCells = pages[pageIndex];
		  if (!pageCells) continue;

		  applyRowPageToForm(form, m, pageCells, fontSizes, warnings);
		  applyComputedTotals(form, cfg, m, pageCells, fontSizes, warnings);
		}
    }

    form.updateFieldAppearances(font);

    if (cfg.flatten) {
      try {
        form.flatten();
      } catch {
        warnings.push("Warning: flatten failed; output may appear unfilled in some viewers.");
      }
    }

    pageDocs.push(doc);
  }

  const out = await PDFDocument.create();
  for (const d of pageDocs) {
    const copiedPages = await out.copyPages(d, d.getPageIndices());
    for (const p of copiedPages) out.addPage(p);
  }

  const bytes = await out.save();
  return { blob: new Blob([bytes], { type: "application/pdf" }), warnings };
}