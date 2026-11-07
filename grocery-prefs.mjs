/** @param {unknown} value @returns {"grocery" | "meals"} */
export function parseSidebarTab(value) {
  return value === "meals" ? "meals" : "grocery";
}

/** @param {unknown} value @returns {"name" | "checked"} */
export function parseItemSort(value) {
  return value === "checked" ? "checked" : "name";
}

/** @param {unknown} value @returns {string | null} */
export function parseStoredListId(value) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/**
 * Prefer a remembered list when it is still visible; otherwise the default,
 * then the first shared or personal list.
 * @param {{
 *   preferredId?: unknown,
 *   defaultListId?: unknown,
 *   sharedLists?: { id: string }[],
 *   personalLists?: { id: string }[],
 * }} args
 * @returns {string | null}
 */
export function pickActiveListId({
  preferredId = null,
  defaultListId = null,
  sharedLists = [],
  personalLists = [],
} = {}) {
  const shared = Array.isArray(sharedLists) ? sharedLists : [];
  const personal = Array.isArray(personalLists) ? personalLists : [];
  const visibleIds = new Set(
    [...shared, ...personal]
      .map((list) => list?.id)
      .filter((id) => typeof id === "string" && id),
  );

  const preferred = parseStoredListId(preferredId);
  if (preferred && visibleIds.has(preferred)) {
    return preferred;
  }

  const fallbackDefault = parseStoredListId(defaultListId);
  if (fallbackDefault && visibleIds.has(fallbackDefault)) {
    return fallbackDefault;
  }

  if (shared.length && typeof shared[0]?.id === "string") {
    return shared[0].id;
  }
  if (personal.length && typeof personal[0]?.id === "string") {
    return personal[0].id;
  }
  return null;
}
