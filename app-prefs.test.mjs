import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseStoredSelectionId,
  preferCloudSelectionId,
  shouldMigrateLocalSelectionToCloud,
  remoteSelectionShouldApply,
} from "./app-prefs.mjs";

describe("parseStoredSelectionId", () => {
  it("returns trimmed ids", () => {
    assert.equal(parseStoredSelectionId(" list-1 "), "list-1");
  });

  it("rejects empty values", () => {
    assert.equal(parseStoredSelectionId(""), null);
    assert.equal(parseStoredSelectionId(null), null);
    assert.equal(parseStoredSelectionId(1), null);
  });
});

describe("preferCloudSelectionId", () => {
  it("prefers cloud over local", () => {
    assert.equal(
      preferCloudSelectionId({ cloud: "cloud-id", local: "local-id" }),
      "cloud-id",
    );
  });

  it("falls back to local", () => {
    assert.equal(
      preferCloudSelectionId({ cloud: "", local: "local-id" }),
      "local-id",
    );
  });

  it("returns null when both missing", () => {
    assert.equal(preferCloudSelectionId({}), null);
  });
});

describe("remoteSelectionShouldApply", () => {
  it("is false when remote is missing", () => {
    assert.equal(remoteSelectionShouldApply({ remoteId: null, activeId: "a" }), false);
  });

  it("is true when remote differs from active", () => {
    assert.equal(
      remoteSelectionShouldApply({ remoteId: "b", activeId: "a" }),
      true,
    );
  });

  it("is false when remote matches active", () => {
    assert.equal(
      remoteSelectionShouldApply({ remoteId: "a", activeId: "a" }),
      false,
    );
  });
});

describe("shouldMigrateLocalSelectionToCloud", () => {
  it("is true when only local is set", () => {
    assert.equal(
      shouldMigrateLocalSelectionToCloud({ cloud: null, local: "a" }),
      true,
    );
  });

  it("is false when cloud already set", () => {
    assert.equal(
      shouldMigrateLocalSelectionToCloud({ cloud: "a", local: "b" }),
      false,
    );
  });

  it("is false when local missing", () => {
    assert.equal(
      shouldMigrateLocalSelectionToCloud({ cloud: null, local: null }),
      false,
    );
  });
});
