/** @param {{ doneDayKeys?: string[] } | null | undefined} habit */
export function doneDayKeysForHabit(habit) {
  if (!habit) {
    return [];
  }
  return Array.isArray(habit.doneDayKeys) ? habit.doneDayKeys : [];
}

export function pendingDoneKey(habitId, dateKey) {
  return `${habitId}:${dateKey}`;
}

/**
 * @param {{
 *   habit: { id: string, doneDayKeys?: string[] } | null,
 *   dateKey: string,
 *   pendingDoneKeys: Record<string, boolean>,
 * }} args
 */
export function isDayDoneForHabit({ habit, dateKey, pendingDoneKeys }) {
  if (!habit) {
    return false;
  }
  const pendingId = pendingDoneKey(habit.id, dateKey);
  if (Object.hasOwn(pendingDoneKeys, pendingId)) {
    return pendingDoneKeys[pendingId];
  }
  return doneDayKeysForHabit(habit).includes(dateKey);
}

/**
 * @param {{ id: string, doneDayKeys?: string[] }} habit
 * @param {Record<string, boolean>} pendingDoneKeys
 */
export function reconcilePendingDoneKeys(habit, pendingDoneKeys) {
  if (!habit) {
    return { ...pendingDoneKeys };
  }
  const next = { ...pendingDoneKeys };
  const stored = new Set(doneDayKeysForHabit(habit));
  const prefix = `${habit.id}:`;
  for (const [key, wantDone] of Object.entries(next)) {
    if (!key.startsWith(prefix)) {
      continue;
    }
    const dateKey = key.slice(prefix.length);
    if (stored.has(dateKey) === wantDone) {
      delete next[key];
    }
  }
  return next;
}

/** @param {{ displayName?: string, email?: string }} user */
export function userCoinLetter(user) {
  const source = (user.displayName || user.email || "?").trim();
  return source.charAt(0).toUpperCase() || "?";
}

/** @param {string | null | undefined} stored */
export function parseThemePref(stored) {
  if (stored === "light" || stored === "dark" || stored === "system") {
    return stored;
  }
  return "system";
}

/** @param {string | null | undefined} stored */
export function parseLayoutPref(stored) {
  return stored === "wrap" ? "wrap" : "week";
}

/** @param {string | null | undefined} stored */
export function parseRangePref(stored) {
  return stored === "calendar" ? "calendar" : "rolling";
}

/** @param {unknown} value @returns {string | null} */
export function parseStoredHabitId(value) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/**
 * Prefer a remembered habit when it still exists; otherwise the first by name.
 * @param {{
 *   preferredId?: unknown,
 *   habits?: { id: string, name?: string }[],
 * }} args
 * @returns {string | null}
 */
export function pickActiveHabitId({ preferredId = null, habits = [] } = {}) {
  const list = Array.isArray(habits) ? habits : [];
  const visibleIds = new Set(
    list
      .map((habit) => habit?.id)
      .filter((id) => typeof id === "string" && id),
  );

  const preferred = parseStoredHabitId(preferredId);
  if (preferred && visibleIds.has(preferred)) {
    return preferred;
  }

  const sorted = [...list]
    .filter((habit) => typeof habit?.id === "string" && habit.id)
    .sort((a, b) =>
      String(a.name || "").localeCompare(String(b.name || "")),
    );
  return sorted[0]?.id ?? null;
}
