import React, { useEffect, useMemo, useState } from "react";
import "./mobile.css";

const ORDER = ["front", "back", "unfold"];

function hasSide(card, side) {
  if (!card) return false;
  if (side === "front") return !!card.image;
  if (side === "back") return !!card.backimage;
  if (side === "unfold") return !!card.unfoldimage;
  return false;
}

function nextSide(card, current) {
  if (!card) return current;
  const currentIdx = ORDER.indexOf(current);
  for (let i = 1; i <= ORDER.length; i++) {
    const candidate = ORDER[(currentIdx + i) % ORDER.length];
    if (hasSide(card, candidate)) return candidate;
  }
  return current;
}

function getImageUrl(card, game, side, baseUrl) {
  if (!card) return null;
  let img = null;
  if (side === "front") img = card.image;
  else if (side === "back") img = card.backimage;
  else if (side === "unfold") img = card.unfoldimage;

  if (img) {
    return `https://tcgbuilder.net/images/${game}/${img}`;
  }
  return `${baseUrl}games/${game}/art/missing_card.jpg`;
}

export default function MobileStickyPreview({ card, game }) {
  const [side, setSide] = useState("front");
  const [baseUrl, setBaseUrl] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    setSide("front");
    setIsFullscreen(false);
  }, [card]);

  useEffect(() => {
    let url = import.meta.env.BASE_URL || "/";
    if (!url.endsWith("/")) url += "/";
    setBaseUrl(url);
  }, []);

  const imageUrl = useMemo(
    () => getImageUrl(card, game, side, baseUrl),
    [card, game, side, baseUrl]
  );

  const hasMultipleSides = useMemo(() => {
    if (!card) return false;
    let count = 0;
    for (const s of ORDER) {
      if (hasSide(card, s)) count++;
    }
    return count > 1;
  }, [card]);

  return (
    <>
      <div className="mobile-sticky-preview">
        <div className="mobile-sticky-preview-inner">
          {card ? (
            <div className="mobile-preview-image-wrapper">
              {/* Tap image to open fullscreen */}
              <button
                type="button"
                className="mobile-preview-image-button"
                onClick={() => setIsFullscreen(true)}
              >
                <img src={imageUrl} alt="" className="mobile-preview-image" />
              </button>

              {/* Flip overlay (centered against SAME wrapper as image) */}
              {hasMultipleSides && (
                <button
                  type="button"
                  className="mobile-preview-flip-overlay"
                  onClick={() => setSide((s) => nextSide(card, s))}
                >
                  Flip
                </button>
              )}
            </div>
          ) : (
            <div className="mobile-preview-empty">Tap a card</div>
          )}
        </div>
      </div>

      {/* Fullscreen overlay */}
      {isFullscreen && imageUrl && (
        <button
          type="button"
          className="mobile-preview-fullscreen-backdrop"
          onClick={() => setIsFullscreen(false)}
        >
          <img
            src={imageUrl}
            alt=""
            className="mobile-preview-fullscreen-image"
          />
        </button>
      )}
    </>
  );
}
