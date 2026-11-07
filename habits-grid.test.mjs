import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  toDateKey,
  rollingDays,
  calendarYearDays,
  weekGridCells,
  wrapSequence,
  dayKeysForRange,
  parseDateKey,
} from "./habits-grid.mjs";

describe("toDateKey", () => {
  it("formats local calendar day", () => {
    assert.equal(toDateKey(new Date(2024, 1, 29)), "2024-02-29");
  });
});

describe("rollingDays", () => {
  it("returns count keys ending on endDate", () => {
    const end = new Date(2024, 5, 10);
    const keys = rollingDays(end, 3);
    assert.deepEqual(keys, ["2024-06-08", "2024-06-09", "2024-06-10"]);
  });

  it("defaults to 365 days", () => {
    const end = new Date(2024, 0, 1);
    assert.equal(rollingDays(end).length, 365);
  });
});

describe("calendarYearDays", () => {
  it("includes leap day", () => {
    const keys = calendarYearDays(2024);
    assert.ok(keys.includes("2024-02-29"));
    assert.equal(keys[0], "2024-01-01");
    assert.equal(keys[keys.length - 1], "2024-12-31");
    assert.equal(keys.length, 366);
  });
});

describe("weekGridCells", () => {
  it("pads before first day for Sunday week start", () => {
    const cells = weekGridCells(["2024-01-03"], { weekStartsOn: 0 });
    assert.equal(cells[0].type, "empty");
    assert.equal(cells[1].type, "empty");
    assert.equal(cells[2].type, "empty");
    assert.equal(cells[3].type, "day");
    assert.equal(cells[3].dateKey, "2024-01-03");
  });

  it("pads Jan 1 2024 (Monday) with one empty Sunday cell", () => {
    const keys = calendarYearDays(2024);
    const cells = weekGridCells(keys, {
      weekStartsOn: 0,
      todayKey: "2024-12-31",
    });
    assert.equal(cells[0].type, "empty");
    assert.equal(cells[1].dateKey, "2024-01-01");
  });

  it("marks future days in calendar year", () => {
    const cells = weekGridCells(["2024-06-01", "2024-06-02"], {
      todayKey: "2024-06-01",
    });
    const day2 = cells.find((c) => c.dateKey === "2024-06-02");
    assert.equal(day2?.future, true);
  });
});

describe("wrapSequence", () => {
  it("returns one cell per day without padding", () => {
    const seq = wrapSequence(["2024-01-01", "2024-01-02"], {
      todayKey: "2024-01-01",
    });
    assert.equal(seq.length, 2);
    assert.equal(seq[1].future, true);
  });
});

describe("parseDateKey", () => {
  it("round-trips with toDateKey", () => {
    const d = new Date(2024, 5, 15);
    assert.equal(toDateKey(parseDateKey("2024-06-15")), "2024-06-15");
    assert.equal(toDateKey(d), "2024-06-15");
  });
});

describe("dayKeysForRange", () => {
  const today = new Date(2024, 5, 10);

  it("calendar year is chronological", () => {
    const keys = dayKeysForRange("calendar", today);
    assert.equal(keys[0], "2024-01-01");
    assert.equal(keys[keys.length - 1], "2024-12-31");
  });

  it("rolling is reverse chronological ending today", () => {
    const keys = dayKeysForRange("rolling", today, 3);
    assert.deepEqual(keys, ["2024-06-10", "2024-06-09", "2024-06-08"]);
  });

  it("rolling first day aligns with today weekday in week grid", () => {
    const keys = dayKeysForRange("rolling", today, 5);
    const cells = weekGridCells(keys, {
      weekStartsOn: 0,
      todayKey: "2024-06-10",
    });
    const firstDay = cells.find((c) => c.type === "day");
    assert.equal(firstDay?.dateKey, "2024-06-10");
  });
});
