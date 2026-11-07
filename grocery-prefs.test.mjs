import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseSidebarTab,
  parseItemSort,
  parseStoredListId,
  pickActiveListId,
} from "./grocery-prefs.mjs";

describe("parseSidebarTab", () => {
  it("accepts meals", () => {
    assert.equal(parseSidebarTab("meals"), "meals");
  });

  it("defaults to grocery", () => {
    assert.equal(parseSidebarTab("grocery"), "grocery");
    assert.equal(parseSidebarTab(undefined), "grocery");
    assert.equal(parseSidebarTab("other"), "grocery");
  });
});

describe("parseItemSort", () => {
  it("accepts checked", () => {
    assert.equal(parseItemSort("checked"), "checked");
  });

  it("defaults to name", () => {
    assert.equal(parseItemSort("name"), "name");
    assert.equal(parseItemSort(undefined), "name");
    assert.equal(parseItemSort("nope"), "name");
  });
});

describe("parseStoredListId", () => {
  it("returns trimmed ids", () => {
    assert.equal(parseStoredListId(" shared-grocery "), "shared-grocery");
  });

  it("rejects empty values", () => {
    assert.equal(parseStoredListId(""), null);
    assert.equal(parseStoredListId("   "), null);
    assert.equal(parseStoredListId(null), null);
    assert.equal(parseStoredListId(12), null);
  });
});

describe("pickActiveListId", () => {
  const shared = [{ id: "shared-a" }, { id: "shared-b" }];
  const personal = [{ id: "personal-a" }];

  it("prefers a remembered visible list", () => {
    assert.equal(
      pickActiveListId({
        preferredId: "personal-a",
        defaultListId: "shared-a",
        sharedLists: shared,
        personalLists: personal,
      }),
      "personal-a",
    );
  });

  it("falls back to the default when remembered is missing", () => {
    assert.equal(
      pickActiveListId({
        preferredId: "gone",
        defaultListId: "shared-b",
        sharedLists: shared,
        personalLists: personal,
      }),
      "shared-b",
    );
  });

  it("falls back through shared then personal", () => {
    assert.equal(
      pickActiveListId({
        preferredId: null,
        defaultListId: "gone",
        sharedLists: shared,
        personalLists: personal,
      }),
      "shared-a",
    );
    assert.equal(
      pickActiveListId({
        preferredId: null,
        defaultListId: null,
        sharedLists: [],
        personalLists: personal,
      }),
      "personal-a",
    );
    assert.equal(
      pickActiveListId({
        preferredId: null,
        defaultListId: null,
        sharedLists: [],
        personalLists: [],
      }),
      null,
    );
  });
});
