import {
  itemNameCommitAction,
  itemNameCommitUIEffect,
} from "./grocery-items.mjs";

function parseNonEmptyName(input) {
  const trimmed = String(input).trim();
  return trimmed === "" ? null : trimmed;
}

export function parseMealName(input) {
  return parseNonEmptyName(input);
}

export function parseIngredientName(input) {
  return parseNonEmptyName(input);
}

function normalizeName(name) {
  return name.trim().toLocaleLowerCase();
}

export function ingredientExists(items, name) {
  const parsed = parseIngredientName(name);
  if (parsed === null) {
    return false;
  }
  const needle = normalizeName(parsed);
  return items.some((item) => normalizeName(item.name) === needle);
}

export function ingredientExistsAmongOthers(items, name, excludeItemId) {
  const parsed = parseIngredientName(name);
  if (parsed === null) {
    return false;
  }
  const needle = normalizeName(parsed);
  return items.some(
    (item) =>
      item.id !== excludeItemId && normalizeName(item.name) === needle,
  );
}

export function mealIngredientNameCommitAction({
  nameInput,
  existingName,
  items,
  editingItemId,
}) {
  const action = itemNameCommitAction({ nameInput, existingName });
  if (
    action.type === "rename" &&
    ingredientExistsAmongOthers(items, action.name, editingItemId)
  ) {
    return {
      type: "reject_duplicate",
      restoreName: existingName,
      userMessage: "That ingredient is already on this meal.",
    };
  }
  return action;
}

export function mealIngredientNameCommitUIEffect(action) {
  if (action.type === "reject_duplicate") {
    return {
      exitEditMode: true,
      firestoreName: null,
      userMessage: action.userMessage,
    };
  }
  const base = itemNameCommitUIEffect(action);
  if (action.type === "reject_empty") {
    return {
      ...base,
      userMessage: "Ingredient name cannot be empty.",
    };
  }
  return base;
}

export function mealEditorTitleCommitUIEffect(action) {
  if (action.type === "noop") {
    return {
      exitEditMode: true,
      mealFirestoreName: null,
      persistDraft: false,
      userMessage: null,
    };
  }
  if (action.type === "reject_empty") {
    return {
      exitEditMode: true,
      mealFirestoreName: null,
      persistDraft: false,
      userMessage: "Meal name cannot be empty.",
    };
  }
  if (action.type === "persist_draft") {
    return {
      exitEditMode: true,
      mealFirestoreName: null,
      persistDraft: true,
      userMessage: null,
    };
  }
  return {
    exitEditMode: true,
    mealFirestoreName: action.name,
    persistDraft: false,
    userMessage: null,
  };
}

export function mealEditorDeleteAction(editingMealId) {
  if (!editingMealId) {
    return { type: "close_draft" };
  }
  return { type: "delete_saved_meal" };
}

export function draftMealPersistResult({
  editingMealId,
  draftMealScope,
  nameInput,
}) {
  if (editingMealId) {
    return { status: "already_saved", mealId: editingMealId };
  }
  if (!draftMealScope) {
    return { status: "skipped", reason: "no_draft" };
  }
  const name = parseMealName(nameInput);
  if (!name) {
    return {
      status: "blocked",
      reason: "empty_name",
      userMessage: "Meal name cannot be empty.",
    };
  }
  return { status: "ready", name, scope: draftMealScope };
}

export function mealEditorNameBlurAction({
  editingMealId,
  draftMealScope,
  nameInput,
  existingMealName,
}) {
  if (!editingMealId && draftMealScope) {
    const name = parseMealName(nameInput);
    if (!name) {
      return { type: "noop" };
    }
    return { type: "persist_draft" };
  }
  if (!editingMealId) {
    return { type: "noop" };
  }
  const name = parseMealName(nameInput);
  if (!name) {
    return { type: "reject_empty", restoreName: existingMealName };
  }
  if (name === existingMealName) {
    return { type: "noop" };
  }
  return { type: "rename", name };
}

export function buildMealCreateFields({ name, scope, ownerUid }) {
  const fields = { name, scope };
  if (scope === "personal") {
    fields.ownerUid = ownerUid;
  }
  return fields;
}

export function mealIngredientAddAttempt({
  editingMealId,
  draftMealScope,
  mealNameInput,
  ingredientInput,
  mealEditorItems,
}) {
  const persistResult = draftMealPersistResult({
    editingMealId,
    draftMealScope,
    nameInput: mealNameInput,
  });
  if (persistResult.status === "blocked") {
    return {
      ok: false,
      message: persistResult.userMessage,
      focusField: "meal_name",
    };
  }
  if (persistResult.status === "skipped") {
    return {
      ok: false,
      message: "Meal name cannot be empty.",
      focusField: "meal_name",
    };
  }

  const ingredientName = parseIngredientName(ingredientInput);
  if (!ingredientName) {
    return {
      ok: false,
      message: "Enter an ingredient.",
      focusField: "ingredient",
    };
  }
  if (ingredientExists(mealEditorItems, ingredientInput)) {
    return {
      ok: false,
      message: "That ingredient is already on this meal.",
      focusField: "ingredient",
    };
  }

  return {
    ok: true,
    ingredientName,
    mustPersistDraft: persistResult.status === "ready",
  };
}
