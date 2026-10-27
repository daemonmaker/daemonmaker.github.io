import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeItemName,
  matchMealItems,
  itemsToAdd,
} from "./grocery-meals.mjs";

describe("normalizeItemName", () => {
  it("trims and lowercases", () => {
    assert.equal(normalizeItemName("  Milk  "), "milk");
  });

  it("returns empty string for whitespace-only", () => {
    assert.equal(normalizeItemName("   \t  "), "");
  });

  it("returns empty string for empty input", () => {
    assert.equal(normalizeItemName(""), "");
  });
});

describe("matchMealItems", () => {
  it("matches grocery items case-insensitively and preserves meal name spelling", () => {
    const mealItems = [{ name: "Milk" }];
    const groceryItems = [{ id: "1", name: "milk", checked: false }];
    assert.deepEqual(matchMealItems(mealItems, groceryItems), [
      {
        name: "Milk",
        groceryItem: { id: "1", name: "milk", checked: false },
        onList: true,
        checked: false,
      },
    ]);
  });

  it("prefers unchecked grocery row when multiple share the same name", () => {
    const mealItems = [{ name: "eggs" }];
    const groceryItems = [
      { id: "a", name: "Eggs", checked: true },
      { id: "b", name: "EGGS", checked: false },
      { id: "c", name: "eggs", checked: true },
    ];
    const result = matchMealItems(mealItems, groceryItems);
    assert.equal(result[0].groceryItem.id, "b");
    assert.equal(result[0].checked, false);
    assert.equal(result[0].onList, true);
  });

  it("uses first match when all duplicate names are checked", () => {
    const mealItems = [{ name: "bread" }];
    const groceryItems = [
      { id: "first", name: "Bread", checked: true },
      { id: "second", name: "bread", checked: true },
    ];
    const result = matchMealItems(mealItems, groceryItems);
    assert.equal(result[0].groceryItem.id, "first");
    assert.equal(result[0].checked, true);
  });

  it("returns no match when item is not on grocery list", () => {
    const mealItems = [{ name: "butter" }];
    const groceryItems = [{ id: "1", name: "milk", checked: false }];
    assert.deepEqual(matchMealItems(mealItems, groceryItems), [
      {
        name: "butter",
        groceryItem: null,
        onList: false,
        checked: false,
      },
    ]);
  });

  it("treats missing checked as unchecked for match preference and result", () => {
    const mealItems = [{ name: "apples" }];
    const groceryItems = [
      { id: "1", name: "apples", checked: true },
      { id: "2", name: "Apples" },
    ];
    const result = matchMealItems(mealItems, groceryItems);
    assert.equal(result[0].groceryItem.id, "2");
    assert.equal(result[0].checked, false);
  });

  it("does not mutate input arrays", () => {
    const mealItems = [{ name: "Milk" }];
    const groceryItems = [{ id: "1", name: "milk", checked: false }];
    const mealSnapshot = [...mealItems];
    const grocerySnapshot = [...groceryItems];
    matchMealItems(mealItems, groceryItems);
    assert.deepEqual(mealItems, mealSnapshot);
    assert.deepEqual(groceryItems, grocerySnapshot);
  });
});

describe("itemsToAdd", () => {
  it("returns meal spellings not on grocery list (case-insensitive)", () => {
    const mealItems = [
      { name: "Milk" },
      { name: "Eggs" },
      { name: "Butter" },
    ];
    const groceryItems = [{ name: "milk", checked: false }];
    assert.deepEqual(itemsToAdd(mealItems, groceryItems), ["Eggs", "Butter"]);
  });

  it("skips blank names after normalize", () => {
    const mealItems = [{ name: "  " }, { name: "Salt" }, { name: "" }];
    const groceryItems = [];
    assert.deepEqual(itemsToAdd(mealItems, groceryItems), ["Salt"]);
  });

  it("collapses case-insensitive duplicates within meal to first spelling", () => {
    const mealItems = [
      { name: "Pasta" },
      { name: "PASTA" },
      { name: "pasta" },
      { name: "Sauce" },
    ];
    const groceryItems = [];
    assert.deepEqual(itemsToAdd(mealItems, groceryItems), ["Pasta", "Sauce"]);
  });

  it("returns empty array when all meal items are already on list", () => {
    const mealItems = [{ name: "Milk" }, { name: "EGGS" }];
    const groceryItems = [
      { name: "milk", checked: false },
      { name: "eggs", checked: true },
    ];
    assert.deepEqual(itemsToAdd(mealItems, groceryItems), []);
  });

  it("does not mutate input arrays", () => {
    const mealItems = [{ name: "Milk" }];
    const groceryItems = [{ name: "bread" }];
    const mealSnapshot = [...mealItems];
    const grocerySnapshot = [...groceryItems];
    itemsToAdd(mealItems, groceryItems);
    assert.deepEqual(mealItems, mealSnapshot);
    assert.deepEqual(groceryItems, grocerySnapshot);
  });
});
