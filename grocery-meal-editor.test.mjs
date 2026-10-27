import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseMealName,
  parseIngredientName,
  ingredientExists,
  mealEditorDeleteAction,
  draftMealPersistResult,
  mealEditorNameBlurAction,
  buildMealCreateFields,
  mealIngredientAddAttempt,
} from "./grocery-meal-editor.mjs";

describe("parseMealName", () => {
  it("returns trimmed string for non-empty input", () => {
    assert.equal(parseMealName("  Pasta  "), "Pasta");
  });

  it("returns string unchanged when already trimmed", () => {
    assert.equal(parseMealName("Tacos"), "Tacos");
  });

  it("returns null for empty string", () => {
    assert.equal(parseMealName(""), null);
  });

  it("returns null for whitespace-only input", () => {
    assert.equal(parseMealName("   \t  "), null);
  });
});

describe("parseIngredientName", () => {
  it("returns trimmed string for non-empty input", () => {
    assert.equal(parseIngredientName("  Tomatoes  "), "Tomatoes");
  });

  it("returns null for empty string after trim", () => {
    assert.equal(parseIngredientName("  "), null);
  });
});

describe("ingredientExists", () => {
  const items = [{ name: "Milk" }, { name: "  Bread  " }, { name: "Eggs" }];

  it("returns true for exact name match", () => {
    assert.equal(ingredientExists(items, "Milk"), true);
  });

  it("returns true for case-insensitive match", () => {
    assert.equal(ingredientExists(items, "milk"), true);
    assert.equal(ingredientExists(items, "EGGS"), true);
  });

  it("trims and compares name argument case-insensitively", () => {
    assert.equal(ingredientExists(items, "  bread  "), true);
  });

  it("matches item names after trim and case fold on item side", () => {
    assert.equal(ingredientExists(items, "bread"), true);
  });

  it("returns false when no item matches", () => {
    assert.equal(ingredientExists(items, "Butter"), false);
  });

  it("returns false for empty items list", () => {
    assert.equal(ingredientExists([], "Milk"), false);
  });

  it("returns false when parsed name would be empty", () => {
    assert.equal(ingredientExists(items, "   "), false);
  });
});

describe("mealEditorDeleteAction", () => {
  it("closes draft when there is no saved meal id", () => {
    assert.deepEqual(mealEditorDeleteAction(null), { type: "close_draft" });
    assert.deepEqual(mealEditorDeleteAction(undefined), { type: "close_draft" });
  });

  it("requires delete flow when a meal is saved", () => {
    assert.deepEqual(mealEditorDeleteAction("meal-1"), {
      type: "delete_saved_meal",
    });
  });
});

describe("draftMealPersistResult", () => {
  it("returns existing meal id when already saved", () => {
    assert.deepEqual(
      draftMealPersistResult({
        editingMealId: "meal-1",
        draftMealScope: "shared",
        nameInput: "",
      }),
      { status: "already_saved", mealId: "meal-1" },
    );
  });

  it("skips when not in draft mode", () => {
    assert.deepEqual(
      draftMealPersistResult({
        editingMealId: null,
        draftMealScope: null,
        nameInput: "Tacos",
      }),
      { status: "skipped", reason: "no_draft" },
    );
  });

  it("blocks persist with message when draft name is empty", () => {
    assert.deepEqual(
      draftMealPersistResult({
        editingMealId: null,
        draftMealScope: "shared",
        nameInput: "  ",
      }),
      {
        status: "blocked",
        reason: "empty_name",
        userMessage: "Meal name cannot be empty.",
      },
    );
  });

  it("is ready to create when draft has a valid name", () => {
    assert.deepEqual(
      draftMealPersistResult({
        editingMealId: null,
        draftMealScope: "personal",
        nameInput: "  Chili  ",
      }),
      { status: "ready", name: "Chili", scope: "personal" },
    );
  });
});

describe("mealEditorNameBlurAction", () => {
  it("does not error when a new draft meal name is still empty", () => {
    assert.deepEqual(
      mealEditorNameBlurAction({
        editingMealId: null,
        draftMealScope: "shared",
        nameInput: "",
        existingMealName: null,
      }),
      { type: "noop" },
    );
  });

  it("persists draft when blur leaves a valid name", () => {
    assert.deepEqual(
      mealEditorNameBlurAction({
        editingMealId: null,
        draftMealScope: "shared",
        nameInput: "Tacos",
        existingMealName: null,
      }),
      { type: "persist_draft" },
    );
  });

  it("rejects empty rename for a saved meal", () => {
    assert.deepEqual(
      mealEditorNameBlurAction({
        editingMealId: "meal-1",
        draftMealScope: null,
        nameInput: "  ",
        existingMealName: "Tacos",
      }),
      { type: "reject_empty", restoreName: "Tacos" },
    );
  });

  it("renames when saved meal name changes", () => {
    assert.deepEqual(
      mealEditorNameBlurAction({
        editingMealId: "meal-1",
        draftMealScope: null,
        nameInput: "Burritos",
        existingMealName: "Tacos",
      }),
      { type: "rename", name: "Burritos" },
    );
  });

  it("noops when saved meal name is unchanged", () => {
    assert.deepEqual(
      mealEditorNameBlurAction({
        editingMealId: "meal-1",
        draftMealScope: null,
        nameInput: "Tacos",
        existingMealName: "Tacos",
      }),
      { type: "noop" },
    );
  });
});

describe("mealIngredientAddAttempt", () => {
  const items = [{ name: "Rice" }];

  it("requires a meal name before adding to a draft", () => {
    assert.deepEqual(
      mealIngredientAddAttempt({
        editingMealId: null,
        draftMealScope: "shared",
        mealNameInput: "",
        ingredientInput: "Beans",
        mealEditorItems: [],
      }),
      {
        ok: false,
        message: "Meal name cannot be empty.",
        focusField: "meal_name",
      },
    );
  });

  it("requires an ingredient name", () => {
    assert.deepEqual(
      mealIngredientAddAttempt({
        editingMealId: "meal-1",
        draftMealScope: null,
        mealNameInput: "Tacos",
        ingredientInput: "  ",
        mealEditorItems: [],
      }),
      {
        ok: false,
        message: "Enter an ingredient.",
        focusField: "ingredient",
      },
    );
  });

  it("rejects duplicate ingredients with in-editor messaging fields", () => {
    assert.deepEqual(
      mealIngredientAddAttempt({
        editingMealId: "meal-1",
        draftMealScope: null,
        mealNameInput: "Tacos",
        ingredientInput: "rice",
        mealEditorItems: items,
      }),
      {
        ok: false,
        message: "That ingredient is already on this meal.",
        focusField: "ingredient",
      },
    );
  });

  it("allows add for a saved meal without persisting draft", () => {
    assert.deepEqual(
      mealIngredientAddAttempt({
        editingMealId: "meal-1",
        draftMealScope: null,
        mealNameInput: "Tacos",
        ingredientInput: "  Cheese  ",
        mealEditorItems: items,
      }),
      {
        ok: true,
        ingredientName: "Cheese",
        mustPersistDraft: false,
      },
    );
  });

  it("allows add for a draft meal when name is valid and must persist first", () => {
    assert.deepEqual(
      mealIngredientAddAttempt({
        editingMealId: null,
        draftMealScope: "personal",
        mealNameInput: "Chili",
        ingredientInput: "Tomatoes",
        mealEditorItems: [],
      }),
      {
        ok: true,
        ingredientName: "Tomatoes",
        mustPersistDraft: true,
      },
    );
  });
});

describe("buildMealCreateFields", () => {
  it("omits ownerUid for shared meals", () => {
    assert.deepEqual(
      buildMealCreateFields({ name: "Salad", scope: "shared", ownerUid: "u1" }),
      { name: "Salad", scope: "shared" },
    );
  });

  it("includes ownerUid for personal meals", () => {
    assert.deepEqual(
      buildMealCreateFields({
        name: "Salad",
        scope: "personal",
        ownerUid: "u1",
      }),
      { name: "Salad", scope: "personal", ownerUid: "u1" },
    );
  });
});
