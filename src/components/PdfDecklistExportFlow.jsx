import React, { forwardRef, useImperativeHandle, useState } from "react";
import { exportPdfDecklistWithModal } from "../utils/pdfDecklistExport/exportPdfDecklist";

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

function downloadBlob(blob, filename) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const PdfDecklistExportFlow = forwardRef(function PdfDecklistExportFlow(
  { deck, cards, settings, game, deckName, hideTriggerButton = true, onBeforeOpen },
  ref,
) {
  const [open, setOpen] = useState(false);
  const [cfg, setCfg] = useState(null);
  const [loadingCfg, setLoadingCfg] = useState(false);
  const [values, setValues] = useState({});
  const [exporting, setExporting] = useState(false);

  useImperativeHandle(ref, () => ({
    open: async () => {
      try {
        onBeforeOpen?.();
        setExporting(false);
        setValues({});
        setCfg(null);
        setOpen(true);

        setLoadingCfg(true);
        const baseUrl = normBaseUrl();
        const url = `${baseUrl}/games/${settings.gameName}/pdfDecklistExport.json`;
        const json = await fetchJson(url);
        setCfg(json);

        const init = {};
        for (const f of json?.modal?.fields || []) init[f.key] = "";
        setValues(init);
      } catch {
        alert("PDF decklist config could not be loaded.");
        setOpen(false);
      } finally {
        setLoadingCfg(false);
      }
    },
    close: () => setOpen(false),
  }));

  async function onExport() {
    if (!cfg) return;

    for (const f of cfg.modal?.fields || []) {
      if (f.required && !String(values[f.key] || "").trim()) {
        alert(`"${f.label}" is required.`);
        return;
      }
    }

    setExporting(true);
    try {
      const { blob, warnings } = await exportPdfDecklistWithModal({
        deck,
        cards,
        settings,
        game,
        deckName,
        modalValues: values,
      });

      downloadBlob(blob, `${deckName || "deck"}-decklist.pdf`);

      if (warnings && warnings.length > 0) {
        const uniq = Array.from(new Set(warnings));
        alert("PDF export warnings:\n\n" + uniq.join("\n"));
      }

      setOpen(false);
    } catch {
      alert("Decklist PDF export failed.");
    } finally {
      setExporting(false);
    }
  }

  if (!open) return null;

  const title = cfg?.modal?.title || "Decklist PDF";

  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ maxWidth: 520 }}>
        <h3>{title}</h3>

        {loadingCfg ? (
          <div>Loading…</div>
        ) : !cfg ? (
          <div>Config not found.</div>
        ) : (
          <>
            <div style={{ display: "grid", gap: "0.6em", marginBottom: "1em" }}>
              {(cfg.modal?.fields || []).map((f) => (
                <label key={f.key} style={{ display: "grid", gap: "0.25em" }}>
                  <span>
                    {f.label}
                    {f.required ? " *" : ""}
                  </span>
                  <input
                    type="text"
                    value={values[f.key] || ""}
                    onChange={(e) =>
                      setValues((prev) => ({ ...prev, [f.key]: e.target.value }))
                    }
                    style={{
                      padding: "0.4em 0.5em",
                      borderRadius: 6,
                      border: "1px solid #ccc",
                    }}
                  />
                </label>
              ))}
            </div>

            <div style={{ display: "flex", gap: "0.5em", justifyContent: "flex-end" }}>
              <button className="main-button" onClick={() => setOpen(false)} disabled={exporting}>
                Cancel
              </button>
              <button className="main-button" onClick={onExport} disabled={exporting}>
                {exporting ? "Exporting…" : "Export"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
});

export default PdfDecklistExportFlow;