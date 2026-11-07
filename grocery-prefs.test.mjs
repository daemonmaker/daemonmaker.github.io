import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseSidebarTab, parseItemSort } from "./grocery-prefs.mjs";

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
