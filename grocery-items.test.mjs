import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isChecked,
  sortItems,
  itemNameCommitAction,
  itemNameCommitUIEffect,
  itemNameDisplayAfterCommit,
  shouldCommitItemNameOnOutsidePointerDown,
  itemNameForDisplay,
  reconcilePendingItemRenames,
} from "./grocery-items.mjs";

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

describe("itemNameCommitAction", () => {
  it("renames with trimmed spelling when case changes", () => {
    assert.deepEqual(
      itemNameCommitAction({ nameInput: "  Eggs  ", existingName: "eggs" }),
      { type: "rename", name: "Eggs" },
    );
  });

  it("noops when trimmed input equals existing name", () => {
    assert.deepEqual(
      itemNameCommitAction({ nameInput: "eggs", existingName: "eggs" }),
      { type: "noop" },
    );
    assert.deepEqual(
      itemNameCommitAction({ nameInput: "  eggs  ", existingName: "eggs" }),
      { type: "noop" },
    );
  });

  it("rejects empty input and restores existing name", () => {
    assert.deepEqual(
      itemNameCommitAction({ nameInput: "", existingName: "eggs" }),
      { type: "reject_empty", restoreName: "eggs" },
    );
    assert.deepEqual(
      itemNameCommitAction({ nameInput: "   \t  ", existingName: "eggs" }),
      { type: "reject_empty", restoreName: "eggs" },
    );
  });

  it("renames to a different word", () => {
    assert.deepEqual(
      itemNameCommitAction({ nameInput: "milk", existingName: "eggs" }),
      { type: "rename", name: "milk" },
    );
  });
});

describe("itemNameCommitUIEffect", () => {
  it("always exits edit mode for rename, noop, and reject_empty", () => {
    assert.deepEqual(
      itemNameCommitUIEffect(
        itemNameCommitAction({ nameInput: "Eggs", existingName: "eggs" }),
      ),
      { exitEditMode: true, firestoreName: "Eggs", userMessage: null },
    );
    assert.deepEqual(
      itemNameCommitUIEffect(
        itemNameCommitAction({ nameInput: "eggs", existingName: "eggs" }),
      ),
      { exitEditMode: true, firestoreName: null, userMessage: null },
    );
    assert.deepEqual(
      itemNameCommitUIEffect(
        itemNameCommitAction({ nameInput: "", existingName: "eggs" }),
      ),
      {
        exitEditMode: true,
        firestoreName: null,
        userMessage: "Item name cannot be empty.",
      },
    );
  });
});

describe("shouldCommitItemNameOnOutsidePointerDown", () => {
  it("commits when editing and the pointer is not on the active input", () => {
    assert.equal(
      shouldCommitItemNameOnOutsidePointerDown({
        editingItemId: "a",
        pointerOnActiveInput: false,
      }),
      true,
    );
  });

  it("does not commit when not editing or pointer is on the active input", () => {
    assert.equal(
      shouldCommitItemNameOnOutsidePointerDown({
        editingItemId: null,
        pointerOnActiveInput: false,
      }),
      false,
    );
    assert.equal(
      shouldCommitItemNameOnOutsidePointerDown({
        editingItemId: "a",
        pointerOnActiveInput: true,
      }),
      false,
    );
  });
});

describe("itemNameForDisplay", () => {
  it("prefers a pending rename over the stored name", () => {
    assert.equal(itemNameForDisplay("eggs", "Eggs"), "Eggs");
  });

  it("uses the stored name when there is no pending rename", () => {
    assert.equal(itemNameForDisplay("eggs", undefined), "eggs");
  });
});

describe("reconcilePendingItemRenames", () => {
  it("drops pending entries once Firestore matches the pending spelling", () => {
    const pending = { a: "Eggs", b: "Milk" };
    const items = [
      { id: "a", name: "Eggs" },
      { id: "b", name: "bread" },
    ];
    assert.deepEqual(reconcilePendingItemRenames(pending, items), { b: "Milk" });
  });
});

describe("itemNameDisplayAfterCommit", () => {
  it("shows the new spelling immediately after rename commit", () => {
    const action = itemNameCommitAction({
      nameInput: "Eggs",
      existingName: "eggs",
    });
    assert.equal(itemNameDisplayAfterCommit(action, "eggs"), "Eggs");
  });

  it("keeps existing name for noop and reject_empty", () => {
    assert.equal(
      itemNameDisplayAfterCommit(
        itemNameCommitAction({ nameInput: "eggs", existingName: "eggs" }),
        "eggs",
      ),
      "eggs",
    );
    assert.equal(
      itemNameDisplayAfterCommit(
        itemNameCommitAction({ nameInput: "", existingName: "eggs" }),
        "eggs",
      ),
      "eggs",
    );
  });
});
