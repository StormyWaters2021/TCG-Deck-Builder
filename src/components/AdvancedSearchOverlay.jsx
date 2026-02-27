import React, { useEffect, useMemo, useRef, useState } from "react";

function ensureState(searchPrefixes, state) {
  const prefixes = Object.keys(searchPrefixes || {});
  const next = { groups: {} };
  const prevGroups = state?.groups && typeof state.groups === "object" ? state.groups : {};

  for (const p of prefixes) {
    const prev = prevGroups[p] || {};
    next.groups[p] = {
      mode: prev.mode === "OR" ? "OR" : "AND",
      terms: Array.isArray(prev.terms) ? prev.terms : [],
    };
  }
  return next;
}

function uid() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function escapeForQuotes(s) {
  return String(s ?? "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function termToToken(prefix, term) {
  const token = `${prefix}:"${escapeForQuotes(term.text)}"`;
  return term.not ? `-${token}` : token;
}

function buildGroupExpr(prefix, group) {
  const terms = group?.terms || [];
  if (terms.length === 0) return "";

  const tokens = terms.map(t => termToToken(prefix, t));
  const mode = group?.mode || "AND";

  if (tokens.length === 1) return `(${tokens[0]})`;
  if (mode === "OR") return `(${tokens.join(" // ")})`;
  return `(${tokens.join(" ")})`;
}

function buildFullSearch(searchPrefixes, state) {
  const prefixes = Object.keys(searchPrefixes || {});
  const parts = [];
  for (const p of prefixes) {
    const expr = buildGroupExpr(p, state?.groups?.[p]);
    if (expr) parts.push(expr);
  }
  return parts.join(" ").trim();
}

export default function AdvancedSearchOverlay({
  open,
  searchPrefixes,
  rememberedState,
  onRememberedStateChange,
  onCancel,
  onSubmit,
}) {
  const prefixes = useMemo(() => Object.entries(searchPrefixes || {}), [searchPrefixes]);
  const normalizedState = useMemo(
    () => ensureState(searchPrefixes, rememberedState),
    [searchPrefixes, rememberedState]
  );

  const [draft, setDraft] = useState(normalizedState);
  const [inputs, setInputs] = useState({});
  const inputRefs = useRef([]);

  useEffect(() => {
    if (!open) return;
    setDraft(normalizedState);
    setInputs(prev => {
      const next = { ...prev };
      for (const [p] of prefixes) if (next[p] === undefined) next[p] = "";
      return next;
    });
    requestAnimationFrame(() => inputRefs.current[0]?.focus());
  }, [open, normalizedState, prefixes]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel?.();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onCancel]);

  function toggleMode(prefix) {
    setDraft(d => {
      const g = d.groups[prefix];
      return {
        ...d,
        groups: { ...d.groups, [prefix]: { ...g, mode: g.mode === "AND" ? "OR" : "AND" } },
      };
    });
  }

  function addTerm(prefix, raw) {
    const text = String(raw ?? "").trim();
    if (!text) return false;

    setDraft(d => {
      const g = d.groups[prefix];
      const term = { id: uid(), text, not: false };
      return { ...d, groups: { ...d.groups, [prefix]: { ...g, terms: [...g.terms, term] } } };
    });

    setInputs(m => ({ ...m, [prefix]: "" }));
    return true;
  }

  function toggleNot(prefix, id) {
    setDraft(d => {
      const g = d.groups[prefix];
      return {
        ...d,
        groups: {
          ...d.groups,
          [prefix]: { ...g, terms: g.terms.map(t => (t.id === id ? { ...t, not: !t.not } : t)) },
        },
      };
    });
  }

  function removeTerm(prefix, id) {
    setDraft(d => {
      const g = d.groups[prefix];
      return {
        ...d,
        groups: { ...d.groups, [prefix]: { ...g, terms: g.terms.filter(t => t.id !== id) } },
      };
    });
  }

  function clearAll() {
    const cleared = ensureState(searchPrefixes, null);
    setDraft(cleared);
    setInputs(() => Object.fromEntries(prefixes.map(([p]) => [p, ""])));
    onRememberedStateChange?.(cleared);
    requestAnimationFrame(() => inputRefs.current[0]?.focus());
  }

  function submitFromDraft() {
    onRememberedStateChange?.(draft);
    const query = buildFullSearch(searchPrefixes, draft);
    onSubmit?.(query);
  }

  function handleInputKeyDown(e, prefix, idx) {
    if (e.key !== "Enter") return;
    e.preventDefault();

    const val = inputs[prefix] ?? "";
    const didAdd = addTerm(prefix, val);

    if (didAdd) return;

    if (idx < prefixes.length - 1) inputRefs.current[idx + 1]?.focus();
    else submitFromDraft();
  }

  if (!open) return null;

  // Compact button style using your theme vars (no fixed width)
	const btn = {
	  background: "var(--main-button-bg)",
	  color: "var(--main-button-color)",
	  border: "1px solid var(--main-button-border)",
	  borderRadius: 6,
	  fontFamily: "inherit",
	  fontWeight: 500,
	  cursor: "pointer",
	  lineHeight: 1,
	  padding: "6px 10px",
	  height: 30,
	  display: "inline-flex",
	  alignItems: "center",
	  justifyContent: "center",
	  boxSizing: "border-box",
	};

	const btnSmall = {
	  ...btn,
	  height: 26,
	  padding: "5px 8px",
	  fontWeight: 500,
	  fontSize: "0.9em",
	  borderRadius: 6,
	};

const chipBtn = {
  ...btnSmall,
  height: 28,
  padding: "6px 6px 6px 10px",
  margin: 0,
  borderTopRightRadius: 0,
  borderBottomRightRadius: 0,
};

const chipRemove = {
  ...btnSmall,
  height: 28,
  minWidth: 28,
  padding: 1,
  margin: 0,
  borderTopLeftRadius: 0,
  borderBottomLeftRadius: 0,
  borderLeft: "0",
};

  return (
    <div
      role="dialog"
      aria-modal="true"
      onMouseDown={e => {
        if (e.target === e.currentTarget) onCancel?.(); // backdrop click = cancel
      }}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 2000,
        background: "rgba(0,0,0,0.82)",
        display: "flex",
      }}
    >
      <div
        onMouseDown={e => e.stopPropagation()}
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          background: "var(--input-bg)",
          color: "var(--input-color)",
          boxSizing: "border-box",
          padding: 10, // no extra border around the whole overlay
        }}
      >
        {/* Header (no border) */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
          <div>
            <div style={{ fontWeight: "bold", fontSize: "1.05em" }}>Advanced Search</div>
            <div style={{ marginTop: 6, fontSize: "0.92em" }}>
              Enter your search terms below. Click a search terms to swap it to find cards
              that do NOT contain that term.
            </div>
          </div>

          <button type="button" onClick={clearAll} style={btn}>
            Clear
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: "auto", paddingTop: 10 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {prefixes.map(([prefix, label], idx) => {
              const group = draft.groups[prefix];
              const inputVal = inputs[prefix] ?? "";

              return (
                <div
                  key={prefix}
                  style={{
                    border: "1px solid var(--input-border)",
                    borderRadius: 8,
                    padding: 10,
                  }}
                >
                  {/* Top row: mode + label */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <button type="button" onClick={() => toggleMode(prefix)} style={btnSmall}>
                      {group.mode}
                    </button>
                    <div style={{ fontWeight: "bold" }}>{label}</div>
                  </div>

                  {/* Input row: input expands, add button at far right */}
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input
                      ref={el => (inputRefs.current[idx] = el)}
                      type="text"
                      value={inputVal}
                      onChange={e => setInputs(m => ({ ...m, [prefix]: e.target.value }))}
                      onKeyDown={e => handleInputKeyDown(e, prefix, idx)}
                      placeholder={`Add ${label}...`}
                      style={{
                        flex: 1,
                        width: "100%",
                        boxSizing: "border-box",
                      }}
                    />
                    <button
                      type="button"
                      aria-label={`Add ${label} term`}
                      style={btnSmall}
                      onClick={() => {
                        const didAdd = addTerm(prefix, inputVal);
                        if (!didAdd) return;
                        requestAnimationFrame(() => inputRefs.current[idx]?.focus());
                      }}
                    >
                      +
                    </button>
                  </div>

                  {/* Chips BELOW the input */}
                  <div style={{ marginTop: 10 }}>
                    {group.terms.length === 0 ? (
                      <div style={{ opacity: 0.7, fontStyle: "italic" }}>No terms</div>
                    ) : (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                        {group.terms.map(t => (
                          <div
                            key={t.id}
                            style={{ display: "inline-flex", gap: 0, alignItems: "center" }}
                          >
                            <button
                              type="button"
                              style={{
                                ...chipBtn,
                                filter: t.not ? "brightness(0.92)" : undefined,
                              }}
                              onClick={() => toggleNot(prefix, t.id)}
                              title="Click to toggle NOT"
                            >
                              {t.not ? `NOT: ${t.text}` : t.text}
                            </button>
                            <button
                              type="button"
                              aria-label="Remove term"
                              style={chipRemove}
                              onClick={() => removeTerm(prefix, t.id)}
                              title="Remove"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer (no border) */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 10 }}>
          <button type="button" onClick={onCancel} style={btn}>
            Cancel
          </button>
          <button type="button" onClick={submitFromDraft} style={btn}>
            Submit
          </button>
        </div>
      </div>
    </div>
  );
}