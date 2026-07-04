import React, { useMemo, useRef, useState } from "react";
import AppModal from "./AppModal";

function ImagePackExportControl({
  settings,
  cards,
  allCards,
  exportDeckO8c,
  game,
  buttonClass,
}) {
  if (!settings.imagePackExport) return null;

  const [imagePackProgress, setImagePackProgress] = useState(null);
  const [showSetSelector, setShowSetSelector] = useState(false);
  const [selectedSetNames, setSelectedSetNames] = useState(new Set());
  const [setSelectorError, setSetSelectorError] = useState("");
  const cancelExport = useRef(false);

  const imagePackCards = allCards && allCards.length ? allCards : cards;

  const setsByName = useMemo(() => {
    const map = new Map();
    for (const card of imagePackCards) {
      if (!card.set_id || !card.Set) continue;
      if (!map.has(card.Set)) map.set(card.Set, new Set());
      map.get(card.Set).add(card.set_id);
    }
    return map;
  }, [imagePackCards]);

  const setNames = useMemo(
    () => Array.from(setsByName.keys()).sort(),
    [setsByName],
  );

  async function handleExport() {
    if (selectedSetNames.size === 0) {
      setSetSelectorError("Please select at least one set.");
      return;
    }

    const allowedSetIds = new Set();
    for (const setName of selectedSetNames) {
      const ids = setsByName.get(setName);
      if (!ids) continue;
      for (const id of ids) {
        allowedSetIds.add(id);
      }
    }

    const filteredCards = imagePackCards.filter((card) =>
      allowedSetIds.has(card.set_id),
    );

    if (filteredCards.length === 0) {
      setSetSelectorError("No cards found for the selected sets.");
      return;
    }

    setShowSetSelector(false);
    cancelExport.current = false;
    setImagePackProgress({
      current: 0,
      total: filteredCards.length,
    });

    try {
      await exportDeckO8c(
        filteredCards,
        settings,
        game,
        undefined,
        (current, total) => {
          setImagePackProgress({ current, total });
        },
        cancelExport,
      );
    } finally {
      setImagePackProgress(null);
      cancelExport.current = false;
      setSetSelectorError("");
    }
  }

  function closeSelector() {
    setSetSelectorError("");
    setShowSetSelector(false);
  }

  return (
    <>
      <AppModal
        open={showSetSelector}
        title="Select Sets for Image Pack"
        message={null}
        onClose={closeSelector}
        actions={[
          {
            label: "All",
            onClick: () => {
              setSelectedSetNames(new Set(setNames));
              setSetSelectorError("");
            },
          },
          {
            label: "None",
            onClick: () => {
              setSelectedSetNames(new Set());
              setSetSelectorError("");
            },
          },
          {
            label: "Export",
            primary: true,
            onClick: handleExport,
          },
          {
            label: "Cancel",
            onClick: closeSelector,
          },
        ]}
      >
        <div
          style={{
            maxHeight: 240,
            overflowY: "auto",
            marginBottom: "1em",
          }}
        >
          {setNames.map((name) => (
            <label key={name} style={{ display: "block", marginBottom: "0.35em" }}>
              <input
                type="checkbox"
                checked={selectedSetNames.has(name)}
                onChange={() => {
                  setSelectedSetNames((prev) => {
                    const next = new Set(prev);
                    next.has(name) ? next.delete(name) : next.add(name);
                    return next;
                  });
                  setSetSelectorError("");
                }}
              />{" "}
              {name}
            </label>
          ))}
        </div>

        {!!setSelectorError && (
          <div
            style={{
              marginBottom: "0.75em",
              padding: "0.6em 0.75em",
              borderRadius: "6px",
              background: "rgba(180, 40, 40, 0.18)",
              border: "1px solid rgba(255, 120, 120, 0.35)",
              color: "#ffd7d7",
              fontSize: "0.95em",
            }}
          >
            {setSelectorError}
          </div>
        )}
      </AppModal>

      {imagePackProgress === null ? (
		<button
		  className={buttonClass}
		  type="button"
		  onClick={() => {
			if (selectedSetNames.size === 0) {
			  setSelectedSetNames(new Set(setNames));
			}
			setSetSelectorError("");
			setShowSetSelector(true);
		  }}
		>
		  Image Pack
		</button>
      ) : (
        <button
          className={buttonClass}
          type="button"
          style={{
            position: "relative",
            padding: undefined,
            minHeight: undefined,
            overflow: "hidden",
            cursor: "pointer",
          }}
          title="Click to cancel"
          onClick={() => {
            cancelExport.current = true;
            setImagePackProgress(null);
          }}
        >
          <span
            style={{
              zIndex: 2,
              position: "relative",
              display: "block",
              width: "100%",
              fontSize: 13,
              color: "inherit",
              fontFamily: "inherit",
              textAlign: "center",
              userSelect: "none",
            }}
          >
            {imagePackProgress.current} / {imagePackProgress.total}
            <br />
            <span style={{ color: "#b00", fontWeight: 600 }}>
              (Click to Cancel)
            </span>
          </span>
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: `${(imagePackProgress.current / Math.max(1, imagePackProgress.total)) * 100}%`,
              height: "100%",
              background: "linear-gradient(90deg, #42b0ff 0%, #1357c4 100%)",
              opacity: 0.55,
              borderRight: "2px solid #3887fa",
              boxShadow: "0 0 5px #3182ceaa",
              transition: "width 0.2s",
            }}
          />
        </button>
      )}
    </>
  );
}

export default ImagePackExportControl;