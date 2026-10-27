"use client";

import { useCallback, useEffect, useState } from "react";
import { isLiquidRendererMode, LIQUID_RENDERER_KEY, type LiquidRendererMode } from "./liquid/preference";

function deviceDefault(): LiquidRendererMode {
  // Keep touch-first devices and the existing phone layout on the original.
  // Unknown media capabilities take the same conservative default.
  return window.matchMedia?.("(pointer: coarse), (max-width: 640px)").matches === false ? "tsl" : "original";
}

export function useLiquidRenderer() {
  // Resolve after hydration, once per visit rather than during resize/drag.
  const [mode, setMode] = useState<LiquidRendererMode>("original");
  useEffect(() => {
    const resolveMode = (value: string | null) => isLiquidRendererMode(value) ? value : deviceDefault();
    try {
      setMode(resolveMode(localStorage.getItem(LIQUID_RENDERER_KEY)));
    } catch { setMode(deviceDefault()); }
    const onStorage = (event: StorageEvent) => {
      if (event.key === LIQUID_RENDERER_KEY || event.key === null) setMode(resolveMode(event.newValue));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  const selectRenderer = useCallback((value: LiquidRendererMode) => {
    setMode(value);
    try { localStorage.setItem(LIQUID_RENDERER_KEY, value); } catch { /* Keep the current selection without storage. */ }
  }, []);
  return { rendererMode: mode, selectRenderer };
}
