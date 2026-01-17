import React from "react";
import "./mobile.css";

export default function MobileBottomNav({ active, onChange }) {
  const mkBtn = (key, label) => (
    <button
      type="button"
      className={`mobile-nav-btn ${active === key ? "active" : ""}`}
      onClick={() => onChange(key)}
      aria-pressed={active === key}
    >
      {label}
    </button>
  );

  return (
    <nav className="mobile-bottom-nav" aria-label="Mobile panel selector">
      {mkBtn("cards", "Card List")}
      {mkBtn("deck", "Deck List")}
      {mkBtn("controls", "Save/Load/Share")}
    </nav>
  );
}
