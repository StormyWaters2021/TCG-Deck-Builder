import React, { useRef, useEffect, useState } from "react";

// Resolve a URL for a given side
function getCardImageUrlForSide(card, game, side) {
  if (!card) return null;
  let img = null;
  if (side === "front") img = card.image;
  else if (side === "back") img = card.backimage;
  else if (side === "unfold") img = card.unfoldimage;
  if (!img) return null;
  return `https://tcgbuilder.net/images/${game}/${img}`;
}

const ORDER = ["front", "back", "unfold"];

function hasPropForSide(card, side) {
  if (!card) return false;
  if (side === "front") return !!card.image;
  if (side === "back") return !!card.backimage;
  if (side === "unfold") return !!card.unfoldimage;
  return false;
}

// Find the next available side based on the order, skipping absent properties
function nextAvailableSide(card, current) {
  const idx = ORDER.indexOf(current);
  for (let step = 1; step <= ORDER.length; step++) {
    const candidate = ORDER[(idx + step) % ORDER.length];
    if (hasPropForSide(card, candidate)) return candidate;
  }
  return current; // fallback if nothing else available
}

// Canvas helpers for text fallback
function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight, font) {
  ctx.font = font;
  const words = text ? text.split(" ") : [];
  let line = "";
  let yy = y;
  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + " ";
    const testWidth = ctx.measureText(testLine).width;
    if (testWidth > maxWidth && n > 0) {
      ctx.fillText(line, x, yy);
      line = words[n] + " ";
      yy += lineHeight;
    } else {
      line = testLine;
    }
  }
  if (line) ctx.fillText(line, x, yy);
  return yy + lineHeight;
}

function drawCardFallback(ctx, card, width, height, showName = true) {
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "#bbb";
  ctx.strokeRect(0, 0, width, height);

  if (showName) {
    ctx.font = "bold 15px sans-serif";
    ctx.fillStyle = "#222";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(card?.name || "Unknown", width / 2, 6);
  }

  ctx.font = "12px sans-serif";
  ctx.fillStyle = "#333";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  drawWrappedText(
    ctx,
    card?.text || "",
    8,
    showName ? 30 : 10,
    width - 16,
    15,
    "12px sans-serif"
  );
}

function CardPreview({
  card,
  game,
  style,
  showName = true,
  quantity = null,
  onAdd,
  onRemove,
  showButtons = false,
  // array of { label, value } to render under the image
  extraData = null,
}) {
  const [imageError, setImageError] = useState(false);
  const [enlarged, setEnlarged] = useState(false);

  // Track fallback-per-side so one failing side doesn't affect others
  const [usedMissing, setUsedMissing] = useState({
    front: false,
    back: false,
    unfold: false,
  });

  // Current side (front/back/unfold)
  const [side, setSide] = useState("front");

  const canvasRef = useRef();

  // Vite base (handles dev/preview/subpath)
  const BASE =
    (typeof import.meta !== "undefined" &&
      import.meta.env &&
      import.meta.env.BASE_URL) ||
    "/";

  // Reset on card/game change
  useEffect(() => {
    setImageError(false);
    setEnlarged(false);
    setUsedMissing({ front: false, back: false, unfold: false });
    // Start at front if available; else move to first available side
    setSide(hasPropForSide(card, "front") ? "front" : nextAvailableSide(card, "front"));
  }, [card, game]);

  const missingUrl = `${BASE}games/${game}/art/missing_card.jpg`;
  const currentUsedMissing = usedMissing[side];

  const imageUrl = !currentUsedMissing
    ? getCardImageUrlForSide(card, game, side)
    : missingUrl;

  // Draw canvas fallback if we can't load an image at all
  useEffect(() => {
    if (!card) return;
    if (!imageUrl || imageError) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      drawCardFallback(ctx, card, canvas.width, canvas.height, showName);
    }
  }, [card, imageUrl, imageError, showName]);

  const width = 200;
  const height = 300;

  const canFlip =
    hasPropForSide(card, "back") || hasPropForSide(card, "unfold");

  const handleFlip = () => {
    if (!card) return;
    const next = nextAvailableSide(card, side);
    setSide(next);
  };

  // No card selected
  if (!card) {
    return (
      <div
        className="card-preview"
        style={{ padding: 0, margin: 0, textAlign: "center", ...(style || {}) }}
      >
        <div
          className="no-card"
          style={{
            width: "200px",
            height: "300px",
            border: "1px solid var(--dropdown-border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--dropdown-bg)",
            color: "#999",
            margin: 0,
          }}
        >
          No card selected.
        </div>
      </div>
    );
  }

  // Canvas fallback path
  if (!imageUrl || imageError) {
    return (
      <div
        className="card-preview"
        style={{
          padding: 0,
          margin: 0,
          textAlign: "center",
          position: "relative",
          ...(style || {}),
        }}
      >
        <div
          style={{
            position: "relative",
            display: "inline-block",
            width: "100%",
            height: "100%",
          }}
        >
          <canvas
            ref={canvasRef}
            width={width}
            height={height}
            style={{
              width: "100%",
              height: "auto",
              border: "1px solid var(--dropdown-border)",
              background: "var(--dropdown-bg)",
              display: "block",
              margin: 0,
            }}
          />
          {quantity !== null && (
            <span className="card-qty-badge">×{quantity}</span>
          )}
          {showButtons && (
            <div className="card-qty-btns">
              <button className="card-modify-btn" onClick={onRemove}>
                -1
              </button>
              <button className="card-modify-btn" onClick={onAdd}>
                +1
              </button>
            </div>
          )}
        </div>

        {showName && (
          <div style={{ textAlign: "center", margin: 0 }}>
            <strong>{card ? card.name : ""}</strong>
          </div>
        )}

        {/* Flip button (only if there is at least one alternative side) */}
        {canFlip && (
          <div style={{ textAlign: "center", marginTop: "4px" }}>
            <button onClick={handleFlip} className="card-modify-btn">
              Flip Card
            </button>
          </div>
        )}

        {/* Extra data */}
        {Array.isArray(extraData) && extraData.length > 0 && (
          <div
            className="card-extra-data"
            style={{
              textAlign: "center",
              marginTop: "6px",
              fontSize: "0.9em",
              color: "#555",
            }}
          >
            {extraData.map(({ label, value }, idx) => (
              <div key={idx}>
                <strong>{label}</strong>: {value}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Normal image path
  return (
    <div
      className="card-preview"
      style={{
        padding: 0,
        margin: 0,
        textAlign: "center",
        position: "relative",
        ...(style || {}),
      }}
    >
      <div
        style={{
          position: "relative",
          display: "inline-block",
          width: "100%",
          height: "100%",
        }}
      >
        <img
          src={imageUrl}
          alt={card.name}
          style={{
            maxWidth: "100%",
            maxHeight: "300px",
            width: "100%",
            height: "auto",
            display: "block",
            margin: 0,
            cursor: "pointer",
          }}
          onClick={() => setEnlarged(true)}
          onError={() => {
            // First failure -> use missing image for this side. If missing also fails -> canvas.
            if (!currentUsedMissing) {
              setUsedMissing((prev) => ({ ...prev, [side]: true }));
              setImageError(false);
            } else {
              setImageError(true);
            }
          }}
          title="Click to enlarge"
        />

        {quantity !== null && (
          <span className="card-qty-badge">×{quantity}</span>
        )}

        {showButtons && (
          <div className="card-qty-btns">
            <button className="card-modify-btn" onClick={onRemove}>
              -1
            </button>
            <button className="card-modify-btn" onClick={onAdd}>
              +1
            </button>
          </div>
        )}
      </div>

      {enlarged && (
        <div
          className="card-modal-backdrop"
          style={{
            position: "fixed",
            left: 0,
            top: 0,
            width: "100vw",
            height: "100vh",
            background: "rgba(0,0,0,0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => setEnlarged(false)}
        >
          <div
            className="card-modal-content"
            style={{
              position: "relative",
              background: "none",
              border: "none",
              outline: "none",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={imageUrl}
              alt={card.name}
              style={{
                maxWidth: "90vw",
                maxHeight: "90vh",
                boxShadow: "0 0 24px #000",
              }}
            />

            <button
              className="card-modal-close-btn"
              onClick={() => setEnlarged(false)}
              aria-label="Close preview"
              title="Close"
            >
              ×
            </button>

            {/* Flip button inside modal (only if alternatives exist) */}
            {canFlip && (
              <button
                onClick={handleFlip}
                className="card-modify-btn"
                style={{ position: "absolute", top: "8px", left: "8px" }}
              >
                Flip Card
              </button>
            )}
          </div>
        </div>
      )}

      {showName && (
        <div style={{ textAlign: "center", margin: 0 }}>
          <strong>{card ? card.name : ""}</strong>
        </div>
      )}

      {/* Flip button below preview (only if alternatives exist) */}
      {canFlip && (
        <div style={{ textAlign: "center", marginTop: "4px" }}>
          <button onClick={handleFlip} className="card-modify-btn">
            Flip Card
          </button>
        </div>
      )}

      {/* Extra data below everything */}
      {Array.isArray(extraData) && extraData.length > 0 && (
        <div
          className="card-extra-data"
          style={{
            textAlign: "center",
            marginTop: "6px",
            fontSize: "0.9em",
            color: "#555",
          }}
        >
          {extraData.map(({ label, value }, idx) => (
            <div key={idx}>
              <strong>{label}</strong>: {value}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default CardPreview;
