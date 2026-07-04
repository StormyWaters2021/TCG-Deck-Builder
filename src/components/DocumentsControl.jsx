import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

function DocumentsControl({
  settings,
  game,
  buttonClass = "main-button",
  dropdownButtonClass = "dropdown-button",
  dropdownButtonHoverClass = "dropdown-button-hover",
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [dropdownHover, setDropdownHover] = useState(null);
  const [menuPosition, setMenuPosition] = useState({
    top: 0,
    left: 0,
  });

  const controlRef = useRef(null);
  const buttonRef = useRef(null);
  const dropdownRef = useRef(null);

  const documentsConfig = settings?.documents;
  const documents = Array.isArray(documentsConfig?.items)
    ? documentsConfig.items
    : [];

  const enabled =
    documentsConfig?.enabled === true &&
    documents.length > 0;

  function updateMenuPosition() {
    if (!buttonRef.current) return;

    const rect = buttonRef.current.getBoundingClientRect();

    setMenuPosition({
      top: rect.bottom + 2,
      left: rect.left,
    });
  }

  useEffect(() => {
    if (!menuOpen) return;

    updateMenuPosition();

    function handleClickOutside(event) {
      const clickedControl =
        controlRef.current?.contains(event.target);

      const clickedDropdown =
        dropdownRef.current?.contains(event.target);

      if (!clickedControl && !clickedDropdown) {
        setMenuOpen(false);
        setDropdownHover(null);
      }
    }

    function handlePositionChange() {
      updateMenuPosition();
    }

    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("resize", handlePositionChange);
    window.addEventListener("scroll", handlePositionChange, true);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("resize", handlePositionChange);
      window.removeEventListener("scroll", handlePositionChange, true);
    };
  }, [menuOpen]);

  if (!enabled) {
    return null;
  }

  function openDocument(file) {
    const trimmedFile = String(file || "")
      .trim()
      .replace(/^\/+/, "");

    if (!trimmedFile) return;

    const baseUrl = (import.meta.env.BASE_URL || "").replace(/\/$/, "");

    const encodedFile = trimmedFile
      .split("/")
      .map((part) => encodeURIComponent(part))
      .join("/");

    const url =
      `${baseUrl}/games/${encodeURIComponent(game)}/docs/${encodedFile}`;

    window.open(url, "_blank", "noopener,noreferrer");

    setMenuOpen(false);
    setDropdownHover(null);
  }

  return (
    <>
      <div ref={controlRef}>
        <button
          ref={buttonRef}
          className={buttonClass}
          type="button"
          onClick={() => {
            if (!menuOpen) {
              updateMenuPosition();
            }

            setMenuOpen((open) => !open);
          }}
        >
          {documentsConfig.label || "Documents"} ▼
        </button>
      </div>

      {menuOpen &&
        createPortal(
          <div
            ref={dropdownRef}
            className="dropdown-menu documents-dropdown-menu"
            style={{
              top: `${menuPosition.top}px`,
              left: `${menuPosition.left}px`,
            }}
          >
            {documents.map((document, index) => {
              const name =
                document?.name ||
                document?.file ||
                "Document";

              const file = document?.file;

              if (!file) return null;

              return (
                <button
                  key={`${file}-${index}`}
                  type="button"
                  className={
                    dropdownHover === index
                      ? `${dropdownButtonClass} ${dropdownButtonHoverClass}`
                      : dropdownButtonClass
                  }
                  onMouseEnter={() => setDropdownHover(index)}
                  onMouseLeave={() => setDropdownHover(null)}
                  onClick={() => openDocument(file)}
                >
                  {name}
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
}

export default DocumentsControl;