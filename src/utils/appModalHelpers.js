export function closeModal(setModalState) {
  setModalState((prev) => ({ ...prev, open: false }));
}

export function openMessageModal(setModalState, title, message) {
  setModalState({
    open: true,
    title,
    message,
    inputValue: "",
    inputPlaceholder: "",
    showInput: false,
    actions: [
      {
        label: "OK",
        primary: true,
        onClick: () => closeModal(setModalState),
      },
    ],
  });
}

export function openInputModal(
  setModalState,
  {
    title,
    message,
    initialValue = "",
    inputPlaceholder = "",
    confirmLabel = "OK",
    cancelLabel = "Cancel",
    onConfirm,
  },
) {
  setModalState({
    open: true,
    title,
    message,
    inputValue: initialValue,
    inputPlaceholder,
    showInput: true,
    actions: [
      {
        label: cancelLabel,
        onClick: () => closeModal(setModalState),
      },
      {
        label: confirmLabel,
        primary: true,
        onClick: (value) => {
          const trimmed = String(value || "").trim();
          if (!trimmed) return;
          closeModal(setModalState);
          onConfirm?.(trimmed);
        },
      },
    ],
  });
}

export function openChoiceModal(setModalState, { title, message, actions }) {
  setModalState({
    open: true,
    title,
    message,
    inputValue: "",
    inputPlaceholder: "",
    showInput: false,
    actions: actions.map((action) => ({
      ...action,
      onClick: () => {
        closeModal(setModalState);
        action.onClick?.();
      },
    })),
  });
}