import React, { useRef, useEffect, useMemo, useState } from "react";

// Build the ordered list of faces we can show for this card.
// - front (card.image)
// - alternates (card.alternates[].image) using alt.type as key if possible
// - back (card.backimage)
// - unfold (card.unfoldimage)
function buildFaces(card) {
  if (!card) return [];

  const faces = [];

  if (card.image) faces.push({ key: "front", img: card.image });

  if (Array.isArray(card.alternates)) {
    card.alternates.forEach((alt, idx) => {
      const img = alt?.image;
      if (!img) return;
      const key =
        (typeof alt?.type === "string" && alt.type.trim()) ? alt.type.trim() : `alt_${idx}`;
      faces.push({ key, img });
    });
  }

  if (card.backimage) faces.push({ key: "back", img: card.backimage });
  if (card.unfoldimage) faces.push({ key: "unfold", img: card.unfoldimage });

  // De-dupe by key then by image (avoids duplicates if data repeats)
  const seenKeys = new Set();
  const seenImgs = new Set();
  return faces.filter(f => {
    if (!f?.img) return false;
    if (seenKeys.has(f.key)) return false;
    if (seenImgs.has(f.img)) return false;
    seenKeys.add(f.key);
    seenImgs.add(f.img);
    return true;
  });
}

// Resolve a URL for a given face key
function getCardImageUrlForFace(card, game, faceKey) {
  if (!card) return null;
  const faces = buildFaces(card);
  const face = faces.find(f => f.key === faceKey) || faces[0];
  const img = face?.img || null;
  if (!img) return null;
  return `https://tcgbuilder.net/images/${game}/${img}`;
}

// Find the next available face based on current faces list
function nextFaceKey(faces, currentKey) {
  if (!faces || faces.length <= 1) return currentKey;
  const idx = faces.findIndex(f => f.key === currentKey);
  const start = idx >= 0 ? idx : 0;
  return faces[(start + 1) % faces.length].key;
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

  // Track fallback-per-face so one failing face doesn't affect others
  const [usedMissing, setUsedMissing] = useState({});

  // Current face key (front/back/unfold/alt...)
  const [faceKey, setFaceKey] = useState("front");

  const canvasRef = useRef();

  const faces = useMemo(() => buildFaces(card), [card]);
  const canFlip = faces.length > 1;

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
    setUsedMissing({});
    // Start at front if present; else first available face
    const start = faces.find(f => f.key === "front")?.key || faces[0]?.key || "front";
    setFaceKey(start);
  }, [card, game]); // intentional: reset only when selection changes

  const missingUrl = `${BASE}games/${game}/art/missing_card.jpg`;
  const currentUsedMissing = !!usedMissing[faceKey];

  const imageUrl = !currentUsedMissing
    ? getCardImageUrlForFace(card, game, faceKey)
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

  const handleFlip = () => {
    if (!card) return;
    const next = nextFaceKey(faces, faceKey);
    setFaceKey(next);
    setImageError(false);
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
          {quantity !== null && <span className="card-qty-badge">×{quantity}</span>}
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

        {canFlip && (
          <div style={{ textAlign: "center", marginTop: "4px" }}>
            <button onClick={handleFlip} className="card-modify-btn">
              Flip Card
            </button>
          </div>
        )}

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
            // First failure -> use missing image for this face. If missing also fails -> canvas.
            if (!currentUsedMissing) {
              setUsedMissing((prev) => ({ ...prev, [faceKey]: true }));
              setImageError(false);
            } else {
              setImageError(true);
            }
          }}
          title="Click to enlarge"
        />

        {quantity !== null && <span className="card-qty-badge">×{quantity}</span>}

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

      {canFlip && (
        <div style={{ textAlign: "center", marginTop: "4px" }}>
          <button onClick={handleFlip} className="card-modify-btn">
            Flip Card
          </button>
        </div>
      )}

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