import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isChecked, sortItems } from "./grocery-items.mjs";

describe("isChecked", () => {
  it("returns true when item.checked === true", () => {
    assert.equal(isChecked({ name: "apples", checked: true }), true);
  });

  it("returns false when item.checked === false", () => {
    assert.equal(isChecked({ name: "apples", checked: false }), false);
  });

  it("returns false when checked field is missing", () => {
    assert.equal(isChecked({ name: "apples" }), false);
  });

  it('returns false when checked is non-boolean like "true"', () => {
    assert.equal(isChecked({ name: "apples", checked: "true" }), false);
  });
});

describe("sortItems", () => {
  describe("name sort", () => {
    it("sorts by localeCompare with sensitivity base (case-insensitive)", () => {
      const items = [
        { name: "Milk" },
        { name: "apples" },
        { name: "Bread" },
      ];
      const sorted = sortItems(items, "name");
      assert.deepEqual(
        sorted.map((i) => i.name),
        ["apples", "Bread", "Milk"],
      );
    });
  });

  describe("checked sort", () => {
    it("puts unchecked first, then checked, with name tie-break", () => {
      const items = [
        { name: "apples", checked: true },
        { name: "Bread", checked: false },
        { name: "Milk", checked: false },
      ];
      const sorted = sortItems(items, "checked");
      assert.deepEqual(
        sorted.map((i) => i.name),
        ["Bread", "Milk", "apples"],
      );
    });

    it("treats missing checked field as unchecked", () => {
      const items = [
        { name: "apples", checked: true },
        { name: "Bread" },
        { name: "Milk", checked: false },
      ];
      const sorted = sortItems(items, "checked");
      assert.deepEqual(
        sorted.map((i) => i.name),
        ["Bread", "Milk", "apples"],
      );
    });
  });

  it("returns empty array for empty list", () => {
    const items = [];
    const sorted = sortItems(items, "name");
    assert.deepEqual(sorted, []);
  });

  it("does not mutate the input array", () => {
    const items = [
      { name: "Milk" },
      { name: "apples" },
      { name: "Bread" },
    ];
    const snapshot = [...items];
    sortItems(items, "name");
    assert.deepEqual(items, snapshot);
  });
});
