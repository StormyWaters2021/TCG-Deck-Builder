import React, { useRef, useEffect, useState } from "react";

// Helper: build the correct image URL for a card & game, respecting BASE_URL and slashes.
export function getCardImageUrl(card, game) {
  if (!card || !card.image) return null;
  // Point directly to R2-served path
  return `https://tcgbuilder.net/images/${game}/${card.image}`;
}


// Helper to draw wrapped text in a canvas context
function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight, font) {
  ctx.font = font;
  const words = text ? text.split(' ') : [];
  let line = '';
  let yy = y;
  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + ' ';
    const metrics = ctx.measureText(testLine);
    const testWidth = metrics.width;
    if (testWidth > maxWidth && n > 0) {
      ctx.fillText(line, x, yy);
      line = words[n] + ' ';
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
  showButtons = false
}) {
  const [imageError, setImageError] = useState(false);
  const [enlarged, setEnlarged] = useState(false);
  const canvasRef = useRef();

  useEffect(() => {
    setImageError(false);
    setEnlarged(false);
  }, [card, game]);

  const imageUrl = getCardImageUrl(card, game);

  useEffect(() => {
    if (!card) return;
    if (!imageUrl || imageError) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      drawCardFallback(ctx, card, canvas.width, canvas.height, showName);
    }
  }, [card, imageUrl, imageError, showName]);

  const width = 200, height = 300;

  if (!card) {
    return (
      <div
        className="card-preview"
        style={{
          padding: 0,
          margin: 0,
          textAlign: "center",
          ...(style || {})
        }}
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
            margin: 0
          }}
        >
          No card selected.
        </div>
      </div>
    );
  }

  // Fallback canvas
  if (!imageUrl || imageError) {
    return (
      <div className="card-preview" style={{ padding: 0, margin: 0, textAlign: "center", position: "relative", ...(style || {}) }}>
        <div style={{ position: "relative", display: "inline-block", width: "100%", height: "100%" }}>
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
              margin: 0
            }}
          />
          {quantity !== null && (
            <span className="card-qty-badge">
              ×{quantity}
            </span>
          )}
          {showButtons && (
            <div
              className="card-qty-btns"
            >
              <button className="card-modify-btn" onClick={onRemove}>-1</button>
              <button className="card-modify-btn" onClick={onAdd}>+1</button>
            </div>
          )}
        </div>
        {showName && (
          <div style={{ textAlign: "center", margin: 0 }}>
            <strong>{card ? card.name : ""}</strong>
          </div>
        )}
      </div>
    );
  }

  // Normal image
  return (
    <div className="card-preview" style={{ padding: 0, margin: 0, textAlign: "center", position: "relative", ...(style || {}) }}>
      <div style={{ position: "relative", display: "inline-block", width: "100%", height: "100%" }}>
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
            cursor: "pointer"
          }}
          onClick={() => setEnlarged(true)}
          onError={() => setImageError(true)}
          title="Click to enlarge"
        />
        {quantity !== null && (
          <span className="card-qty-badge">
            ×{quantity}
          </span>
        )}
        {showButtons && (
          <div className="card-qty-btns">
            <button className="card-modify-btn" onClick={onRemove}>-1</button>
            <button className="card-modify-btn" onClick={onAdd}>+1</button>
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
            zIndex: 1000
          }}
          onClick={() => setEnlarged(false)}
        >
          <div
            className="card-modal-content"
            style={{
              position: "relative",
              background: "none",
              border: "none",
              outline: "none"
            }}
            onClick={e => e.stopPropagation()}
          >
            <img
              src={imageUrl}
              alt={card.name}
              style={{
                maxWidth: "90vw",
                maxHeight: "90vh",
                boxShadow: "0 0 24px #000"
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
          </div>
        </div>
      )}
      {showName && (
        <div style={{ textAlign: "center", margin: 0 }}>
          <strong>{card ? card.name : ""}</strong>
        </div>
      )}
    </div>
  );
}

export default CardPreview;