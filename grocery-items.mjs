export function isChecked(item) {
  return item.checked === true;
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
