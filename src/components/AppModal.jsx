import React, { useEffect, useRef } from "react";

function AppModal({
  open,
  title,
  message,
  inputValue = "",
  inputPlaceholder = "",
  autoFocusInput = false,
  onInputChange,
  actions = [],
  onClose,
  children,
  modalClassName = "",
}) {
  const inputRef = useRef(null);

  useEffect(() => {
  if (!open) return;

  if (autoFocusInput && inputRef.current) {
    inputRef.current.focus();
    inputRef.current.select?.();
  }

  function handleKeyDown(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose?.();
    }
  }

  window.addEventListener("keydown", handleKeyDown);
  return () => window.removeEventListener("keydown", handleKeyDown);
}, [open, autoFocusInput, onClose]);

  if (!open) return null;

  const hasInput = typeof onInputChange === "function";

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          onClose?.();
        }
      }}
    >
      <div
        className={`modal ${modalClassName}`.trim()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {title ? <h3 style={{ marginTop: 0 }}>{title}</h3> : null}

        {message ? (
          <div
            style={{
              marginBottom: hasInput || actions.length ? "1em" : 0,
              whiteSpace: typeof message === "string" ? "pre-wrap" : "normal",
            }}
          >
            {message}
          </div>
        ) : null}

        {hasInput && (
          <input
            ref={inputRef}
            type="text"
            className="deck-name-input"
            value={inputValue}
            placeholder={inputPlaceholder}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                onClose?.();
                return;
              }

              if (e.key === "Enter") {
                const primaryAction =
                  actions.find((a) => a.primary) || actions[actions.length - 1];
                primaryAction?.onClick?.(inputValue);
              }
            }}
            style={{
              width: "100%",
              marginBottom: "1em",
              boxSizing: "border-box",
            }}
          />
        )}

        {children}

        {actions.length > 0 && (
          <div
            style={{
              display: "flex",
              gap: "0.5em",
              justifyContent: "flex-end",
              flexWrap: "wrap",
              marginTop: "0.5rem",
            }}
          >
            {actions.map((action, idx) => (
              <button
                key={`${action.label}-${idx}`}
                className="main-button"
                type="button"
                onClick={() => action.onClick?.(inputValue)}
              >
                {action.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default AppModal;