export function isChecked(item) {
  return item.checked === true;
}

function parseItemName(input) {
  const trimmed = String(input).trim();
  return trimmed === "" ? null : trimmed;
}

export function itemNameCommitAction({ nameInput, existingName }) {
  const name = parseItemName(nameInput);
  if (name === null) {
    return { type: "reject_empty", restoreName: existingName };
  }
  if (name === existingName) {
    return { type: "noop" };
  }
  return { type: "rename", name };
}

export function itemNameCommitUIEffect(action) {
  if (action.type === "noop") {
    return { exitEditMode: true, firestoreName: null, userMessage: null };
  }
  if (action.type === "reject_empty") {
    return {
      exitEditMode: true,
      firestoreName: null,
      userMessage: "Item name cannot be empty.",
    };
  }
  return {
    exitEditMode: true,
    firestoreName: action.name,
    userMessage: null,
  };
}

export function itemNameDisplayAfterCommit(action, existingName) {
  if (action.type === "rename") {
    return action.name;
  }
  if (action.type === "reject_empty") {
    return action.restoreName;
  }
  return existingName;
}

export function shouldCommitItemNameOnOutsidePointerDown({
  editingItemId,
  pointerOnActiveInput,
}) {
  return editingItemId !== null && !pointerOnActiveInput;
}

export function itemNameForDisplay(storedName, pendingName) {
  if (typeof pendingName === "string") {
    return pendingName;
  }
  return storedName;
}

export function reconcilePendingItemRenames(pendingRenames, items) {
  const next = { ...pendingRenames };
  for (const item of items) {
    if (next[item.id] !== undefined && next[item.id] === item.name) {
      delete next[item.id];
    }
  }
  return next;
}

function compareByName(a, b) {
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

export function sortItems(items, sortKey) {
  const sorted = [...items];
  if (sortKey === "checked") {
    sorted.sort((a, b) => {
      const aChecked = isChecked(a);
      const bChecked = isChecked(b);
      if (aChecked !== bChecked) {
        return aChecked ? 1 : -1;
      }
      return compareByName(a, b);
    });
    return sorted;
  }
  sorted.sort(compareByName);
  return sorted;
}
