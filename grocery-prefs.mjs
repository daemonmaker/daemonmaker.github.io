/** @param {unknown} value @returns {"grocery" | "meals"} */
export function parseSidebarTab(value) {
  return value === "meals" ? "meals" : "grocery";
}

/** @param {unknown} value @returns {"name" | "checked"} */
export function parseItemSort(value) {
  return value === "checked" ? "checked" : "name";
}
