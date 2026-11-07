import { parseThemePref } from "./apps-access.mjs";

export const SHARED_THEME_STORAGE_KEY = "micro_apps_theme";

export const LEGACY_THEME_STORAGE_KEYS = [
  "apps_theme",
  "grocery_theme",
  "habits_theme",
];

/**
 * @param {Pick<Storage, "getItem" | "setItem">} storage
 * @returns {"light" | "dark" | "system"}
 */
export function loadSharedThemePref(storage) {
  const unified = storage.getItem(SHARED_THEME_STORAGE_KEY);
  if (unified) {
    return parseThemePref(unified);
  }
  for (const key of LEGACY_THEME_STORAGE_KEYS) {
    const legacy = storage.getItem(key);
    if (legacy === "light" || legacy === "dark" || legacy === "system") {
      storage.setItem(SHARED_THEME_STORAGE_KEY, legacy);
      return legacy;
    }
  }
  return "system";
}

/**
 * @param {unknown} mode
 * @param {Pick<Storage, "setItem">} storage
 * @returns {"light" | "dark" | "system"}
 */
export function saveSharedThemePref(mode, storage) {
  const next = parseThemePref(mode);
  storage.setItem(SHARED_THEME_STORAGE_KEY, next);
  return next;
}
