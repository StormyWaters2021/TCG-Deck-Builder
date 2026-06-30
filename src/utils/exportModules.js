const DEFAULT_DECK_EXPORT_MODULES = {
  decklistImage: {
    label: "As Image",
  },
  proxyPdf: {
    label: "Proxy PDF",
  },
  shareLink: {
    label: "Share Link",
  },
  deckSubmit: {
    label: "Submit Deck",
  },
  octgn: {
    label: "OCTGN",
  },
  tabletopSimulator: {
    label: "Tabletop Simulator",
  },
  decklistPdf: {
    label: "Decklist PDF",
  },
  deckText: {
	label: "Text",
  },
};

const LEGACY_DEFAULT_MENU = [
  "decklistImage",
  "proxyPdf",
  "shareLink",
];

function normalizeDeckExportModule(id, config = {}) {
  const defaults = DEFAULT_DECK_EXPORT_MODULES[id];

  if (!defaults) return null;

  return {
    id,
    label: config.label || defaults.label,
    enabled: config.enabled !== false,
    ...config,
  };
}

function getLegacyDeckExportModules(settings = {}) {
  const menu = [...LEGACY_DEFAULT_MENU];

  if (settings.deckSubmit) {
    menu.push("deckSubmit");
  }

  if (settings.octgnExport) {
    menu.push("octgn");
  }

  if (settings.dragonDiceTTSExport) {
    menu.push("tabletopSimulator");
  }

  if (settings.pdfDecklistExport) {
    menu.push("decklistPdf");
  }

  return menu
    .map((id) => normalizeDeckExportModule(id))
    .filter(Boolean);
}

export function getDeckExportModules(settings = {}) {
  const deckExports = settings.deckExports;

  if (!deckExports || typeof deckExports !== "object") {
    return getLegacyDeckExportModules(settings);
  }

  const modules =
    deckExports.modules && typeof deckExports.modules === "object"
      ? deckExports.modules
      : {};

  const menu = Array.isArray(deckExports.menu)
    ? deckExports.menu
    : Object.keys(modules);

  return menu
    .map((id) => normalizeDeckExportModule(id, modules[id]))
    .filter((module) => module && module.enabled);
}

export function isDeckExportModuleEnabled(settings = {}, moduleId) {
  return getDeckExportModules(settings).some(
    (module) => module.id === moduleId,
  );
}