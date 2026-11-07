import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  SHARED_THEME_STORAGE_KEY,
  LEGACY_THEME_STORAGE_KEYS,
  loadSharedThemePref,
  saveSharedThemePref,
} from "./app-theme.mjs";

function mockStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(key, value);
    },
    snapshot() {
      return Object.fromEntries(map);
    },
  };
}

describe("SHARED_THEME_STORAGE_KEY", () => {
  it("is not a legacy per-app key", () => {
    assert.equal(LEGACY_THEME_STORAGE_KEYS.includes(SHARED_THEME_STORAGE_KEY), false);
  });
});

describe("loadSharedThemePref", () => {
  it("reads the unified key when set", () => {
    const storage = mockStorage({ [SHARED_THEME_STORAGE_KEY]: "dark" });
    assert.equal(loadSharedThemePref(storage), "dark");
  });

  it("defaults invalid unified values to system", () => {
    const storage = mockStorage({ [SHARED_THEME_STORAGE_KEY]: "neon" });
    assert.equal(loadSharedThemePref(storage), "system");
  });

  it("migrates the first valid legacy key and writes unified", () => {
    const storage = mockStorage({
      grocery_theme: "light",
      habits_theme: "dark",
    });
    assert.equal(loadSharedThemePref(storage), "light");
    assert.equal(storage.getItem(SHARED_THEME_STORAGE_KEY), "light");
  });

  it("prefers unified over legacy", () => {
    const storage = mockStorage({
      [SHARED_THEME_STORAGE_KEY]: "system",
      apps_theme: "dark",
    });
    assert.equal(loadSharedThemePref(storage), "system");
  });

  it("returns system when nothing is stored", () => {
    assert.equal(loadSharedThemePref(mockStorage()), "system");
  });
});

describe("saveSharedThemePref", () => {
  it("persists parsed theme to the unified key", () => {
    const storage = mockStorage();
    assert.equal(saveSharedThemePref("light", storage), "light");
    assert.equal(storage.getItem(SHARED_THEME_STORAGE_KEY), "light");
  });

  it("rejects invalid values via parseThemePref", () => {
    const storage = mockStorage();
    assert.equal(saveSharedThemePref("bogus", storage), "system");
    assert.equal(storage.getItem(SHARED_THEME_STORAGE_KEY), "system");
  });
});
