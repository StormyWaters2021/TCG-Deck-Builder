import React, { forwardRef, useImperativeHandle, useState } from "react";
import AppModal from "./AppModal";
import {
  exportDeckImage,
  exportDeckImageCompact,
} from "../utils/deckExportHelpers";

function getImageExportPreviewSrc(settings, filename) {
  const baseUrl = (import.meta.env.BASE_URL || "").replace(/\/$/, "");
  const folder = String(settings?.imageExportPreviewFolder || "")
    .trim()
    .replace(/^\/+|\/+$/g, "");

  return folder
    ? `${baseUrl}/images/${folder}/${filename}`
    : `${baseUrl}/images/${filename}`;
}

const ImageExportFlow = forwardRef(function ImageExportFlow(
  { deck, cards, settings, deckName, game, onBeforeOpen },
  ref,
) {
  const [open, setOpen] = useState(false);

  useImperativeHandle(ref, () => ({
    open: () => {
      onBeforeOpen?.();
      setOpen(true);
    },
    close: () => setOpen(false),
  }));

  function closeModal() {
    setOpen(false);
  }

  async function handleExport(format) {
    closeModal();

    const flatDeck = {};
    Object.entries(deck || {}).forEach(([cardId, entry]) => {
      flatDeck[cardId] = entry?.count || 0;
    });

    if (format === "Image") {
      await exportDeckImage(flatDeck, cards, settings, deckName, game);
    } else if (format === "ImageCompact") {
      await exportDeckImageCompact(flatDeck, cards, settings, deckName, game);
    }
  }

  return (
    <AppModal
      open={open}
      title="Export As Image"
      message={null}
      modalClassName="image-export-modal"
      actions={[
        {
          label: "Cancel",
          onClick: closeModal,
        },
      ]}
      onClose={closeModal}
    >
      <div className="image-export-option-grid">
        <button
          type="button"
          className="image-export-option"
          onClick={async () => {
            await handleExport("ImageCompact");
          }}
        >
          <img
            src={getImageExportPreviewSrc(settings, "cardstacks.png")}
            alt="Card stacks export preview"
            className="image-export-option-preview"
          />
        </button>

        <button
          type="button"
          className="image-export-option"
          onClick={async () => {
            await handleExport("Image");
          }}
        >
          <img
            src={getImageExportPreviewSrc(settings, "cardimages.png")}
            alt="Card quantities export preview"
            className="image-export-option-preview"
          />
        </button>
      </div>
    </AppModal>
  );
});

export default ImageExportFlow;