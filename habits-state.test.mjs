import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  doneDayKeysForHabit,
  pendingDoneKey,
  isDayDoneForHabit,
  reconcilePendingDoneKeys,
  userCoinLetter,
  parseThemePref,
  parseLayoutPref,
  parseRangePref,
} from "./habits-state.mjs";

describe("doneDayKeysForHabit", () => {
  it("returns empty when habit missing", () => {
    assert.deepEqual(doneDayKeysForHabit(null), []);
  });

  it("returns empty when doneDayKeys missing", () => {
    assert.deepEqual(doneDayKeysForHabit({ id: "a" }), []);
  });

  it("returns array when present", () => {
    assert.deepEqual(doneDayKeysForHabit({ doneDayKeys: ["2024-01-01"] }), [
      "2024-01-01",
    ]);
  });
});

describe("pendingDoneKey", () => {
  it("joins habit id and date", () => {
    assert.equal(pendingDoneKey("abc", "2024-06-01"), "abc:2024-06-01");
  });
});

describe("isDayDoneForHabit", () => {
  const habit = { id: "h1", doneDayKeys: ["2024-06-01"] };

  it("returns false without habit", () => {
    assert.equal(
      isDayDoneForHabit({
        habit: null,
        dateKey: "2024-06-01",
        pendingDoneKeys: {},
      }),
      false,
    );
  });

  it("reads stored doneDayKeys", () => {
    assert.equal(
      isDayDoneForHabit({
        habit,
        dateKey: "2024-06-01",
        pendingDoneKeys: {},
      }),
      true,
    );
  });

  it("prefers pending over stored", () => {
    assert.equal(
      isDayDoneForHabit({
        habit,
        dateKey: "2024-06-01",
        pendingDoneKeys: { [pendingDoneKey("h1", "2024-06-01")]: false },
      }),
      false,
    );
    assert.equal(
      isDayDoneForHabit({
        habit: { id: "h1", doneDayKeys: [] },
        dateKey: "2024-06-02",
        pendingDoneKeys: { [pendingDoneKey("h1", "2024-06-02")]: true },
      }),
      true,
    );
  });
});

describe("reconcilePendingDoneKeys", () => {
  it("returns a shallow copy when habit is missing", () => {
    const pending = { "h1:2024-06-01": true };
    const next = reconcilePendingDoneKeys(null, pending);
    assert.deepEqual(next, pending);
    assert.notEqual(next, pending);
  });

  it("drops pending entries that match server", () => {
    const habit = { id: "h1", doneDayKeys: ["2024-06-01"] };
    const pending = {
      [pendingDoneKey("h1", "2024-06-01")]: true,
      [pendingDoneKey("h1", "2024-06-02")]: true,
      [pendingDoneKey("other", "2024-06-03")]: true,
    };
    const next = reconcilePendingDoneKeys(habit, pending);
    assert.equal(next[pendingDoneKey("h1", "2024-06-01")], undefined);
    assert.equal(next[pendingDoneKey("h1", "2024-06-02")], true);
    assert.equal(next[pendingDoneKey("other", "2024-06-03")], true);
  });

  it("removes pending off when server matches undone", () => {
    const habit = { id: "h1", doneDayKeys: [] };
    const key = pendingDoneKey("h1", "2024-06-01");
    const next = reconcilePendingDoneKeys(habit, { [key]: false });
    assert.equal(next[key], undefined);
  });
});

describe("userCoinLetter", () => {
  it("uses display name", () => {
    assert.equal(userCoinLetter({ displayName: "Ada", email: "a@b.c" }), "A");
  });

  it("falls back to email", () => {
    assert.equal(userCoinLetter({ email: "bob@example.com" }), "B");
  });

  it("returns ? when empty", () => {
    assert.equal(userCoinLetter({}), "?");
  });
});

describe("parseThemePref", () => {
  it("accepts known values", () => {
    assert.equal(parseThemePref("dark"), "dark");
  });

  it("defaults to system", () => {
    assert.equal(parseThemePref("nope"), "system");
    assert.equal(parseThemePref(null), "system");
  });
});

describe("parseLayoutPref", () => {
  it("maps wrap", () => {
    assert.equal(parseLayoutPref("wrap"), "wrap");
  });

  it("defaults to week", () => {
    assert.equal(parseLayoutPref(undefined), "week");
  });
});

describe("parseRangePref", () => {
  it("maps calendar", () => {
    assert.equal(parseRangePref("calendar"), "calendar");
  });

  it("defaults to rolling", () => {
    assert.equal(parseRangePref(""), "rolling");
  });
});
