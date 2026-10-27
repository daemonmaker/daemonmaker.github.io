import { isChecked } from "./grocery-items.mjs";

export function normalizeItemName(name) {
  const trimmed = name.trim();
  if (trimmed === "") {
    return "";
  }
  return trimmed.toLocaleLowerCase();
}

function findGroceryMatch(normalizedName, groceryItems) {
  let firstMatch = null;
  for (const item of groceryItems) {
    if (normalizeItemName(item.name) !== normalizedName) {
      continue;
    }
    if (!firstMatch) {
      firstMatch = item;
    }
    if (!isChecked(item)) {
      return item;
    }
  }
  return firstMatch;
}

export function matchMealItems(mealItems, groceryItems) {
  return mealItems.map((meal) => {
    const normalized = normalizeItemName(meal.name);
    const groceryItem =
      normalized === ""
        ? null
        : findGroceryMatch(normalized, groceryItems);
    if (!groceryItem) {
      return {
        name: meal.name,
        groceryItem: null,
        onList: false,
        checked: false,
      };
    }
    return {
      name: meal.name,
      groceryItem,
      onList: true,
      checked: isChecked(groceryItem),
    };
  });
}

export function itemsToAdd(mealItems, groceryItems) {
  const onList = new Set(
    groceryItems
      .map((item) => normalizeItemName(item.name))
      .filter((normalized) => normalized !== ""),
  );
  const seenInMeal = new Set();
  const result = [];
  for (const meal of mealItems) {
    const normalized = normalizeItemName(meal.name);
    if (normalized === "") {
      continue;
    }
    if (onList.has(normalized)) {
      continue;
    }
    if (seenInMeal.has(normalized)) {
      continue;
    }
    seenInMeal.add(normalized);
    result.push(meal.name);
  }
  return result;
}
