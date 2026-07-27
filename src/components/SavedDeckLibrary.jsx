import React from "react";

function SavedDeckLibrary({
  savedDeckFolderView,
  savedDeckDrag,
  savedDeckFolderDropIndicator,
  selectedDeckIdx,
  openVersionsMenu,
  versionsDropdownHover,
  setSelectedDeckIdx,
  setOpenVersionsMenu,
  setVersionsDropdownHover,
  setSavedDeckFolderDropIndicator,
  handleSavedDeckFolderDrop,
  handleSavedDeckRootDrop,
  handleSavedDeckFolderDragStart,
  handleSavedDeckFolderDragOver,
  handleSavedDeckDragStart,
  handleSavedDeckDragEnd,
  handleToggleSavedDeckFolder,
  handleDeleteSavedDeckFolder,
  loadDeck,
  deleteDeck,
  loadSavedDeckVersion,
  promptCreateSavedDeckFolder,
  buttonClass,
  dropdownButtonClass,
  dropdownButtonHoverClass,
  listSelectedClass,
}) {
  function renderSavedDeckItem(d, options = {}) {
    const { dropTargetFolderId, allowUnfolderDrop = false } = options;
    const idx = savedDeckFolderView.allDecks.findIndex(
      (saved) => saved.id === d.id,
    );
    if (idx === -1) return null;

    return (
      <li
        key={d.id}
        draggable
        className={selectedDeckIdx === idx ? listSelectedClass : ""}
        onClick={() => setSelectedDeckIdx(idx)}
        onMouseDown={(e) => e.stopPropagation()}
        onDragStart={(e) => handleSavedDeckDragStart(e, d.id)}
        onDragEnd={handleSavedDeckDragEnd}
        onDragEnter={(e) => e.stopPropagation()}
        onDragOver={(e) => {
          if (!savedDeckDrag) return;

          if (savedDeckDrag.type === "folder" && allowUnfolderDrop) {
            return;
          }

          e.preventDefault();
          e.stopPropagation();
        }}
        onDrop={(e) => {
          if (!savedDeckDrag) return;

          if (savedDeckDrag.type === "folder") {
            if (allowUnfolderDrop) {
              return;
            }

            if (dropTargetFolderId) {
              e.preventDefault();
              e.stopPropagation();
              handleSavedDeckFolderDrop(dropTargetFolderId);
            }
            return;
          }

          e.preventDefault();
          e.stopPropagation();

          if (allowUnfolderDrop) {
            handleSavedDeckRootDrop();
          } else if (dropTargetFolderId) {
            handleSavedDeckFolderDrop(dropTargetFolderId);
          }
        }}
        style={{
          display: "flex",
          alignItems: "center",
          padding: "0.25em 0.5em",
          borderRadius: "4px",
          marginBottom: "0.3em",
          cursor: "pointer",
        }}
      >
        <span style={{ flex: 1 }}>{d.name}</span>
        <button
          className={buttonClass}
          style={{
            width: "60px",
            height: "1.8em",
            fontSize: "0.9em",
            marginRight: "0.3em",
          }}
          onClick={(e) => {
            e.stopPropagation();
            loadDeck(idx);
          }}
        >
          Load
        </button>
        {d.shareCode ? (
          <div
            style={{
              position: "relative",
              width: "72px",
              marginRight: "0.3em",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className={buttonClass}
              type="button"
              style={{ width: "72px", height: "1.8em", fontSize: "0.9em" }}
              onClick={(e) => {
                e.stopPropagation();
                setOpenVersionsMenu((prev) => (prev === d.id ? null : d.id));
              }}
            >
              Versions
            </button>

            {openVersionsMenu === d.id && (
              <div
                className="dropdown-menu"
                onMouseLeave={() => {
                  setOpenVersionsMenu(null);
                  setVersionsDropdownHover(null);
                }}
              >
                <button
                  className={
                    versionsDropdownHover === 0
                      ? `${dropdownButtonClass} ${dropdownButtonHoverClass}`
                      : dropdownButtonClass
                  }
                  onMouseEnter={() => setVersionsDropdownHover(0)}
                  onMouseLeave={() => setVersionsDropdownHover(null)}
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenVersionsMenu(null);
                    loadSavedDeckVersion(d, "current");
                  }}
                >
                  Current
                </button>

                <button
                  className={
                    versionsDropdownHover === 1
                      ? `${dropdownButtonClass} ${dropdownButtonHoverClass}`
                      : dropdownButtonClass
                  }
                  onMouseEnter={() => setVersionsDropdownHover(1)}
                  onMouseLeave={() => setVersionsDropdownHover(null)}
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenVersionsMenu(null);
                    loadSavedDeckVersion(d, "previous");
                  }}
                >
                  Previous
                </button>

                <button
                  className={
                    versionsDropdownHover === 2
                      ? `${dropdownButtonClass} ${dropdownButtonHoverClass}`
                      : dropdownButtonClass
                  }
                  onMouseEnter={() => setVersionsDropdownHover(2)}
                  onMouseLeave={() => setVersionsDropdownHover(null)}
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenVersionsMenu(null);
                    loadSavedDeckVersion(d, "original");
                  }}
                >
                  Original
                </button>
              </div>
            )}
          </div>
        ) : null}
        <button
          className={buttonClass}
          style={{ width: "60px", height: "1.8em", fontSize: "0.9em" }}
          onClick={(e) => {
            e.stopPropagation();
            deleteDeck(idx);
          }}
        >
          Delete
        </button>
      </li>
    );
  }

  return (
    <div style={{ width: "100%", maxWidth: 500 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.5em",
          marginBottom: "0.5em",
        }}
      >
        <h3 style={{ margin: 0 }}>Saved Decks</h3>
        <button
          className={buttonClass}
          type="button"
          onClick={promptCreateSavedDeckFolder}
          title="Create folder"
          aria-label="Create saved deck folder"
          style={{
            width: "32px",
            height: "32px",
            padding: 0,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "1rem",
          }}
        >
          📁
        </button>
      </div>

      {savedDeckFolderView.folders.map((folder) => (
        <div
          key={folder.id}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            handleSavedDeckFolderDrop(folder.id);
          }}
          onDragLeave={(e) => {
            if (savedDeckDrag?.type !== "folder") return;
            if (!e.currentTarget.contains(e.relatedTarget)) {
              setSavedDeckFolderDropIndicator(null);
            }
          }}
          style={{
            border: "1px solid rgba(255, 255, 255, 0.12)",
            borderRadius: "8px",
            marginBottom: "0.6em",
            overflow: "visible",
          }}
        >
          <div
            draggable
            onDragStart={() => handleSavedDeckFolderDragStart(folder.id)}
            onDragEnd={handleSavedDeckDragEnd}
            onDragOver={(e) => handleSavedDeckFolderDragOver(e, folder.id)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.4em",
              padding: "0.45em 0.55em",
              background: "rgba(255, 255, 255, 0.04)",
              cursor: "grab",
              borderTop:
                savedDeckFolderDropIndicator?.folderId === folder.id &&
                savedDeckFolderDropIndicator?.position === "above"
                  ? "2px solid rgba(120, 190, 255, 0.95)"
                  : "2px solid transparent",
              borderBottom:
                savedDeckFolderDropIndicator?.folderId === folder.id &&
                savedDeckFolderDropIndicator?.position === "below"
                  ? "2px solid rgba(120, 190, 255, 0.95)"
                  : "2px solid transparent",
            }}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleToggleSavedDeckFolder(folder.id);
              }}
              onMouseDown={(e) => e.stopPropagation()}
              style={{
                background: "none",
                border: "none",
                color: "inherit",
                cursor: "pointer",
                padding: 0,
                fontSize: "0.95em",
              }}
              title={folder.collapsed ? "Expand folder" : "Collapse folder"}
              aria-label={folder.collapsed ? "Expand folder" : "Collapse folder"}
            >
              {folder.collapsed ? "▶" : "▼"}
            </button>
            <span style={{ fontSize: "0.95em" }}>📁</span>
            <strong style={{ flex: 1, minWidth: 0 }}>{folder.name}</strong>
            <button
              className={buttonClass}
              type="button"
              onClick={() => handleDeleteSavedDeckFolder(folder.id, folder.name)}
              style={{ width: "60px", height: "1.8em", fontSize: "0.85em" }}
            >
              Delete
            </button>
          </div>

          {!folder.collapsed && (
            <div style={{ padding: "0.45em 0.4em 0.15em" }}>
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {folder.decks.map((d) =>
                  renderSavedDeckItem(d, { dropTargetFolderId: folder.id }),
                )}
              </ul>
              {folder.decks.length === 0 && (
                <div
                  style={{
                    padding: "0.2em 0.35em 0.45em",
                    fontSize: "0.9em",
                    opacity: 0.7,
                  }}
                >
                  Drag saved decks here
                </div>
              )}
            </div>
          )}
        </div>
      ))}

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          handleSavedDeckRootDrop();
        }}
        style={{
          borderRadius: "8px",
          padding: savedDeckFolderView.unfolderedDecks.length ? 0 : "0.55em",
          border:
            savedDeckFolderView.folders.length > 0
              ? "1px dashed rgba(255, 255, 255, 0.18)"
              : "none",
        }}
      >
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {savedDeckFolderView.unfolderedDecks.map((d) =>
            renderSavedDeckItem(d, { allowUnfolderDrop: true }),
          )}
        </ul>
        {savedDeckFolderView.folders.length > 0 &&
          savedDeckFolderView.unfolderedDecks.length === 0 && (
            <div style={{ fontSize: "0.9em", opacity: 0.7 }}>
              Drag a deck here to remove it from its folder
            </div>
          )}
      </div>
    </div>
  );
}

export default SavedDeckLibrary;