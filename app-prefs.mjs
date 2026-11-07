export const GROCERY_ACTIVE_LIST_FIELD = "groceryActiveListId";
export const HABITS_ACTIVE_HABIT_FIELD = "habitsActiveHabitId";

/** @param {unknown} value @returns {string | null} */
export function parseStoredSelectionId(value) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/**
 * Cross-device selection: prefer Firestore, then localStorage.
 * @param {{ cloud?: unknown, local?: unknown }} args
 * @returns {string | null}
 */
export function preferCloudSelectionId({ cloud = null, local = null } = {}) {
  return parseStoredSelectionId(cloud) ?? parseStoredSelectionId(local);
}

/**
 * Upload a local-only value to Firestore once when the cloud doc has no field.
 * @param {{ cloud?: unknown, local?: unknown }} args
 */
export function shouldMigrateLocalSelectionToCloud({
  cloud = null,
  local = null,
} = {}) {
  return !parseStoredSelectionId(cloud) && !!parseStoredSelectionId(local);
}

/**
 * Whether a remote prefs snapshot should change the active selection.
 * @param {{ remoteId?: unknown, activeId?: unknown }} args
 */
export function remoteSelectionShouldApply({
  remoteId = null,
  activeId = null,
} = {}) {
  const remote = parseStoredSelectionId(remoteId);
  if (!remote) {
    return false;
  }
  const active = parseStoredSelectionId(activeId);
  return remote !== active;
}
