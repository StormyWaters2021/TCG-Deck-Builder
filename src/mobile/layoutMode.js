import { useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "layoutOverride"; // "mobile" | "desktop" | null

function readOverride() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "mobile" || v === "desktop") return v;
  } catch {
    // ignore
  }
  return null;
}

function writeOverride(v) {
  try {
    if (v === null) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, v);
  } catch {
    // ignore
  }
}

function computeAutoIsMobile() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;

  // Prefer "mobile-like" input characteristics, but also require a reasonably small viewport.
  // This avoids forcing mobile layout on desktops with touch screens.
  const mqSmall = window.matchMedia("(max-width: 900px)");
  const mqCoarse = window.matchMedia("(pointer: coarse)");
  const mqNoHover = window.matchMedia("(hover: none)");
  return !!mqSmall.matches && (!!mqCoarse.matches || !!mqNoHover.matches);
}

/**
 * Two-mode layout system:
 * - auto-detect on first load
 * - a single toggle button flips to the other mode and persists on this device
 */
export function useLayoutMode() {
  const [override, setOverride] = useState(() => readOverride());
  const [autoIsMobile, setAutoIsMobile] = useState(() => computeAutoIsMobile());

  // Track viewport/input changes for auto mode
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mqs = [
      window.matchMedia("(max-width: 900px)"),
      window.matchMedia("(pointer: coarse)"),
      window.matchMedia("(hover: none)"),
    ];

    const onChange = () => setAutoIsMobile(computeAutoIsMobile());
    mqs.forEach((mq) => {
      if (typeof mq.addEventListener === "function") mq.addEventListener("change", onChange);
      else if (typeof mq.addListener === "function") mq.addListener(onChange);
    });
    return () => {
      mqs.forEach((mq) => {
        if (typeof mq.removeEventListener === "function") mq.removeEventListener("change", onChange);
        else if (typeof mq.removeListener === "function") mq.removeListener(onChange);
      });
    };
  }, []);

  const isMobileLayout = useMemo(() => {
    if (override === "mobile") return true;
    if (override === "desktop") return false;
    return autoIsMobile;
  }, [override, autoIsMobile]);

  const toggleLayout = () => {
    const next = isMobileLayout ? "desktop" : "mobile";
    setOverride(next);
    writeOverride(next);
  };

  return {
    isMobileLayout,
    toggleLayout,
    hasUserOverride: override !== null,
    clearOverride: () => {
      setOverride(null);
      writeOverride(null);
    },
  };
}
