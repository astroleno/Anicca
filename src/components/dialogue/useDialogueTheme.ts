"use client";

import { useEffect, useState } from "react";

export type DialogueTheme = "light" | "dark";
export type DialogueThemePreference = DialogueTheme | "system";
export const DIALOGUE_THEME_KEY = "anicca.dialogue.appearance.v1";
const valid = (value: string | null): value is DialogueThemePreference =>
  value === "light" || value === "dark" || value === "system";

export function useDialogueTheme() {
  const [preference, setPreference] = useState<DialogueThemePreference>("light");
  const [systemDark, setSystemDark] = useState(false);
  useEffect(() => {
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    const updateSystem = () => setSystemDark(media?.matches ?? false);
    updateSystem();
    try { const saved = window.localStorage.getItem(DIALOGUE_THEME_KEY); if (valid(saved)) setPreference(saved); } catch { /* Appearance still works when storage is unavailable. */ }
    const onStorage = (event: StorageEvent) => {
      if (event.key === DIALOGUE_THEME_KEY) setPreference(valid(event.newValue) ? event.newValue : "light");
    };
    media?.addEventListener?.("change", updateSystem);
    window.addEventListener("storage", onStorage);
    return () => { media?.removeEventListener?.("change", updateSystem); window.removeEventListener("storage", onStorage); };
  }, []);
  const selectTheme = (next: DialogueThemePreference) => {
    setPreference(next);
    try { window.localStorage.setItem(DIALOGUE_THEME_KEY,next); } catch { /* Keep the in-session preference. */ }
  };
  const theme: DialogueTheme = preference === "system" ? systemDark ? "dark" : "light" : preference;
  return { theme, preference, selectTheme };
}
