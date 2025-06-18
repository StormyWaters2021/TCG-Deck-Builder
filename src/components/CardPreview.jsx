import React, { useRef, useEffect, useState } from "react";

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

function drawCardFallback(ctx, card, width, height) {
  // Blank card background
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "#bbb";
  ctx.strokeRect(0, 0, width, height);

  // Card name at the top
  ctx.font = "bold 15px sans-serif";
  ctx.fillStyle = "#222";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(card?.name || "Unknown", width / 2, 6);

  // Card text below name, wrapped
  ctx.font = "12px sans-serif";
  ctx.fillStyle = "#333";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  drawWrappedText(
    ctx,
    card?.text || "",
    8,
    30,
    width - 16,
    15,
    "12px sans-serif"
  );
}

function CardPreview({ card, game }) {
  const [imageError, setImageError] = useState(false);
  const [enlarged, setEnlarged] = useState(false);
  const canvasRef = useRef();

  // Reset image error and enlarged state when the card or game changes
  useEffect(() => {
    setImageError(false);
    setEnlarged(false);
  }, [card, game]);

  const imageUrl = card && card.image
    ? `${import.meta.env.BASE_URL}games/${game}/images/${card.image}`
    : null;

  // Draw fallback card when no image or image fails to load
  useEffect(() => {
    if (!card) return;
    if (!imageUrl || imageError) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      drawCardFallback(ctx, card, canvas.width, canvas.height);
    }
  }, [card, imageUrl, imageError]);

  // Set default size for preview
  const width = 200, height = 300;

  if (!card) {
    return (
      <div
        className="card-preview"
        style={{
          padding: "1em",
          textAlign: "center"
        }}
      >
        <div
          className="no-card"
          style={{
            width: "200px",
            height: "300px",
            border: "1px solid #ccc",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#f8f8f8",
            color: "#999",
            margin: "auto",
            marginBottom: "1em"
          }}
        >
          No card selected.
        </div>
      </div>
    );
  }

  if (!imageUrl || imageError) {
    // Render fallback canvas
    return (
      <div className="card-preview" style={{ padding: "1em", textAlign: "center" }}>
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          style={{
            width: width,
            height: height,
            border: "1px solid #ccc",
            background: "#fff",
            display: "block",
            margin: "auto",
            marginBottom: "1em"
          }}
        />
        <div style={{ textAlign: "center", marginTop: "0.5em" }}>
          <strong>{card ? card.name : ""}</strong>
        </div>
      </div>
    );
  }

  return (
    <div className="card-preview" style={{ padding: "1em", textAlign: "center" }}>
      <>
        <img
          src={imageUrl}
          alt={card.name}
          style={{
            maxWidth: "100%",
            maxHeight: "300px",
            margin: "auto",
            display: "block",
            marginBottom: "1em",
            cursor: "pointer"
          }}
          onClick={() => setEnlarged(true)}
          onError={() => setImageError(true)}
          title="Click to enlarge"
        />
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
                style={{
                  position: "absolute",
                  top: 8,
                  right: 8,
                  background: "rgba(0,0,0,0.7)",
                  color: "#fff",
                  border: "none",
                  borderRadius: "50%",
                  width: 32,
                  height: 32,
                  fontSize: 20,
                  cursor: "pointer"
                }}
                onClick={() => setEnlarged(false)}
                aria-label="Close preview"
                title="Close"
              >
                ×
              </button>
            </div>
          </div>
        )}
      </>
      <div style={{ textAlign: "center", marginTop: "0.5em" }}>
        <strong>{card ? card.name : ""}</strong>
      </div>
    </div>
  );
}

export default CardPreview;