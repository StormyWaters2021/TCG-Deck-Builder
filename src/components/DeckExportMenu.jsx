import React, { useEffect, useRef, useState } from "react";
import { getDeckExportModules } from "../utils/exportModules";

// Shared dropdown: the same game configuration and styling for Builder and Repository.
export default function DeckExportMenu({ settings, actions, buttonClass = "main-button", children }) {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(null);
  const root = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = event => { if (!root.current?.contains(event.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  return <div ref={root} style={{ position: "relative", width: "120px" }}>
    <button type="button" className={buttonClass} onClick={() => setOpen(value => !value)}>Export ▼</button>
    {open && <div className="dropdown-menu" onMouseLeave={() => setOpen(false)}>
      {getDeckExportModules(settings).filter(module => typeof actions[module.id] === "function").map(module =>
        <button type="button" key={module.id}
          className={hover === module.id ? "dropdown-button dropdown-button-hover" : "dropdown-button"}
          onMouseEnter={() => setHover(module.id)} onMouseLeave={() => setHover(null)}
          onClick={() => { setHover(null); setOpen(false); actions[module.id](); }}>
          {module.label}
        </button>)}
    </div>}
    {children}
  </div>;
}
