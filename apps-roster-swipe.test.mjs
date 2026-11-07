import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  clampSwipeOffset,
  shouldOpenSwipe,
  ROSTER_SWIPE_WIDTH_PX,
  ROSTER_SWIPE_OPEN_THRESHOLD_PX,
} from "./apps-roster-swipe.mjs";

describe("clampSwipeOffset", () => {
  it("clamps between -width and 0", () => {
    assert.equal(clampSwipeOffset(0, -80, 52), -52);
    assert.equal(clampSwipeOffset(0, 20, 52), 0);
    assert.equal(clampSwipeOffset(-52, 30, 52), -22);
  });
});

describe("shouldOpenSwipe", () => {
  it("opens past threshold", () => {
    assert.equal(
      shouldOpenSwipe({
        next: -30,
        startOffset: 0,
        threshold: ROSTER_SWIPE_OPEN_THRESHOLD_PX,
      }),
      true,
    );
  });

  it("stays closed above threshold", () => {
    assert.equal(
      shouldOpenSwipe({
        next: -10,
        startOffset: 0,
        threshold: ROSTER_SWIPE_OPEN_THRESHOLD_PX,
      }),
      false,
    );
  });
});
