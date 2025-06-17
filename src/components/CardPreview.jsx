import React, { useState, useEffect } from "react";

function CardPreview({ card, game }) {
  const [imageError, setImageError] = useState(false);
  const [enlarged, setEnlarged] = useState(false);

  // Reset image error and enlarged state when the card or game changes
  useEffect(() => {
    setImageError(false);
    setEnlarged(false);
  }, [card, game]);

  const imageUrl = card && card.image
    ? `${import.meta.env.BASE_URL}games/${game}/images/${card.image}`
    : null;

  return (
    <div className="card-preview" style={{ padding: "1em", textAlign: "center" }}>
      {!card ? (
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
      ) : !imageUrl || imageError ? (
        <div
          className="no-image"
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
          No Image Found
        </div>
      ) : (
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
      )}
      <div style={{ textAlign: "center", marginTop: "0.5em" }}>
        <strong>{card ? card.name : ""}</strong>
      </div>
    </div>
  );
}

export default CardPreview;