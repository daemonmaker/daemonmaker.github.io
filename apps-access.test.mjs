import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeEmail,
  normalizeApps,
  hasApp,
  isAdminUser,
  sessionView,
  bindUidWrite,
  inviteUpsertFields,
  appsLauncherLinks,
  adminRosterSort,
  accessDocIdForEmail,
  userCoinLetter,
  parseThemePref,
} from "./apps-access.mjs";

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    assert.equal(normalizeEmail("  Alice@Example.COM "), "alice@example.com");
  });

  it("returns empty for blank", () => {
    assert.equal(normalizeEmail("   "), "");
    assert.equal(normalizeEmail(null), "");
  });
});

describe("normalizeApps", () => {
  it("filters invalid and dedupes with stable order", () => {
    assert.deepEqual(
      normalizeApps(["habits", "grocery", "habits", "other", "grocery"]),
      ["grocery", "habits"],
    );
  });

  it("returns empty for non-array", () => {
    assert.deepEqual(normalizeApps(null), []);
  });
});

describe("hasApp", () => {
  it("returns false when doc missing", () => {
    assert.equal(hasApp(null, "grocery"), false);
  });

  it("returns true when app granted", () => {
    assert.equal(hasApp({ apps: ["habits"] }, "habits"), true);
    assert.equal(hasApp({ apps: ["habits"] }, "grocery"), false);
  });
});

describe("isAdminUser", () => {
  const seed = ["admin@example.com"];

  it("matches seed email case-insensitively", () => {
    assert.equal(
      isAdminUser(
        { email: " Admin@Example.com ", uid: "u1" },
        { seedEmails: seed, adminConfig: null },
      ),
      true,
    );
  });

  it("matches config uid or email", () => {
    assert.equal(
      isAdminUser(
        { email: "x@y.com", uid: "u2" },
        {
          seedEmails: [],
          adminConfig: { uids: ["u2"], emails: [] },
        },
      ),
      true,
    );
    assert.equal(
      isAdminUser(
        { email: "other@example.com", uid: "u9" },
        {
          seedEmails: [],
          adminConfig: { uids: [], emails: ["other@example.com"] },
        },
      ),
      true,
    );
  });

  it("returns false for non-admin", () => {
    assert.equal(
      isAdminUser(
        { email: "guest@example.com", uid: "g1" },
        { seedEmails: seed, adminConfig: { uids: [], emails: [] } },
      ),
      false,
    );
  });
});

describe("sessionView", () => {
  const doc = { apps: ["grocery"] };

  it("grocery requires app grant", () => {
    assert.equal(
      sessionView({ accessDoc: doc, appId: "grocery", seedAdmin: false }),
      "app",
    );
    assert.equal(
      sessionView({ accessDoc: null, appId: "grocery", seedAdmin: false }),
      "notFound",
    );
  });

  it("portal allows seed admin without access doc", () => {
    assert.equal(
      sessionView({ accessDoc: null, appId: "portal", seedAdmin: true }),
      "app",
    );
    assert.equal(
      sessionView({
        accessDoc: { apps: [] },
        appId: "portal",
        seedAdmin: false,
      }),
      "app",
    );
    assert.equal(
      sessionView({ accessDoc: null, appId: "portal", seedAdmin: false }),
      "notFound",
    );
  });
});

describe("bindUidWrite", () => {
  it("patches when uid empty", () => {
    assert.deepEqual(bindUidWrite({ accessDoc: { uid: null }, uid: "u1" }), {
      ok: true,
      patch: { uid: "u1" },
    });
  });

  it("no-op when same uid", () => {
    assert.deepEqual(
      bindUidWrite({ accessDoc: { uid: "u1" }, uid: "u1" }),
      { ok: true, patch: null },
    );
  });

  it("errors when bound to other uid", () => {
    const r = bindUidWrite({ accessDoc: { uid: "u2" }, uid: "u1" });
    assert.equal(r.ok, false);
  });
});

describe("inviteUpsertFields", () => {
  it("validates email", () => {
    assert.equal(inviteUpsertFields({ email: "", apps: [] }).ok, false);
    assert.equal(inviteUpsertFields({ email: "bad", apps: [] }).ok, false);
  });

  it("allows empty apps", () => {
    const r = inviteUpsertFields({ email: "a@b.com", apps: ["grocery"] });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.deepEqual(r.fields, {
        email: "a@b.com",
        apps: ["grocery"],
      });
    }
  });
});

describe("appsLauncherLinks", () => {
  it("maps granted apps only", () => {
    assert.deepEqual(appsLauncherLinks({ apps: ["habits", "grocery"] }), [
      { id: "grocery", href: "grocery.html", title: "Grocery" },
      { id: "habits", href: "habits.html", title: "Habits" },
    ]);
  });
});

describe("adminRosterSort", () => {
  it("sorts by email", () => {
    assert.deepEqual(
      adminRosterSort([
        { email: "z@a.com" },
        { email: "a@z.com" },
      ]).map((r) => r.email),
      ["a@z.com", "z@a.com"],
    );
  });
});

describe("accessDocIdForEmail", () => {
  it("matches normalizeEmail", () => {
    assert.equal(accessDocIdForEmail("Bob@Mail.com"), "bob@mail.com");
  });
});

describe("userCoinLetter", () => {
  it("uses display name first character", () => {
    assert.equal(userCoinLetter({ displayName: "Ada", email: "a@b.com" }), "A");
  });
});

describe("parseThemePref", () => {
  it("defaults to system", () => {
    assert.equal(parseThemePref(undefined), "system");
    assert.equal(parseThemePref("light"), "light");
  });
});
