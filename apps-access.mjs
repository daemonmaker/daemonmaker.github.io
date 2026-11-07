/** @typedef {"grocery" | "habits"} AppId */

const APP_ORDER = ["grocery", "habits"];

const LAUNCHER_META = {
  grocery: { id: "grocery", href: "grocery.html", title: "Grocery" },
  habits: { id: "habits", href: "habits.html", title: "Habits" },
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * @param {string | null | undefined} raw
 */
export function normalizeEmail(raw) {
  if (raw == null) {
    return "";
  }
  return raw.trim().toLowerCase();
}

/**
 * @param {unknown} raw
 * @returns {AppId[]}
 */
export function normalizeApps(raw) {
  if (!Array.isArray(raw)) {
    return [];
  }
  const seen = new Set();
  /** @type {AppId[]} */
  const out = [];
  for (const item of raw) {
    if (item !== "grocery" && item !== "habits") {
      continue;
    }
    if (seen.has(item)) {
      continue;
    }
    seen.add(item);
    out.push(item);
  }
  out.sort((a, b) => APP_ORDER.indexOf(a) - APP_ORDER.indexOf(b));
  return out;
}

/**
 * @param {{ apps?: unknown } | null | undefined} accessDoc
 * @param {AppId} appId
 */
export function hasApp(accessDoc, appId) {
  if (!accessDoc) {
    return false;
  }
  return normalizeApps(accessDoc.apps).includes(appId);
}

/**
 * @param {{ email?: string | null, uid?: string | null }} user
 * @param {{ seedEmails?: string[], adminConfig?: { uids?: string[], emails?: string[] } | null }} opts
 */
export function isAdminUser(user, opts) {
  const email = normalizeEmail(user.email);
  const uid = user.uid || "";
  const seedEmails = (opts.seedEmails || []).map((e) => normalizeEmail(e));
  if (email && seedEmails.includes(email)) {
    return true;
  }
  const config = opts.adminConfig;
  if (!config) {
    return false;
  }
  const uids = Array.isArray(config.uids) ? config.uids : [];
  if (uid && uids.includes(uid)) {
    return true;
  }
  const emails = (config.emails || []).map((e) => normalizeEmail(e));
  return email !== "" && emails.includes(email);
}

/**
 * @param {{
 *   accessDoc: { apps?: unknown } | null | undefined,
 *   appId: AppId | "portal",
 *   seedAdmin: boolean,
 * }} args
 * @returns {"app" | "notFound"}
 */
export function sessionView({ accessDoc, appId, seedAdmin }) {
  if (appId === "portal") {
    if (seedAdmin || accessDoc) {
      return "app";
    }
    return "notFound";
  }
  if (!accessDoc || !hasApp(accessDoc, appId)) {
    return "notFound";
  }
  return "app";
}

/**
 * @param {{ accessDoc: { uid?: string | null } | null | undefined, uid: string }}
 * @returns {{ ok: true, patch: Record<string, unknown> | null } | { ok: false, error: string }}
 */
export function bindUidWrite({ accessDoc, uid }) {
  if (!accessDoc) {
    return { ok: false, error: "No access record." };
  }
  const bound = accessDoc.uid;
  if (bound == null || bound === "") {
    return { ok: true, patch: { uid } };
  }
  if (bound === uid) {
    return { ok: true, patch: null };
  }
  return { ok: false, error: "Access record is bound to another account." };
}

/**
 * @param {{ email: string, apps?: unknown }}
 * @returns {{ ok: true, fields: { email: string, apps: AppId[] } } | { ok: false, error: string }}
 */
export function inviteUpsertFields({ email, apps }) {
  const normalized = normalizeEmail(email);
  if (!normalized) {
    return { ok: false, error: "Email is required." };
  }
  if (!EMAIL_RE.test(normalized)) {
    return { ok: false, error: "Email format is invalid." };
  }
  return {
    ok: true,
    fields: { email: normalized, apps: normalizeApps(apps) },
  };
}

/**
 * @param {{ apps?: unknown } | null | undefined} accessDoc
 */
export function appsLauncherLinks(accessDoc) {
  const apps = normalizeApps(accessDoc?.apps);
  return apps.map((id) => ({ ...LAUNCHER_META[id] }));
}

/**
 * Granted apps plus the Micro Apps portal, for account menus.
 * @param {{ apps?: unknown } | null | undefined} accessDoc
 */
export function userMenuAppLinks(accessDoc) {
  return [
    ...appsLauncherLinks(accessDoc),
    { id: "portal", href: "apps.html", title: "Micro Apps" },
  ];
}

/**
 * @param {Array<{ email?: string }>} rows
 */
export function adminRosterSort(rows) {
  return [...rows].sort((a, b) =>
    normalizeEmail(a.email).localeCompare(normalizeEmail(b.email)),
  );
}

/**
 * @param {string} email
 */
export function accessDocIdForEmail(email) {
  return normalizeEmail(email);
}

/** @param {{ displayName?: string, email?: string }} user */
export function userCoinLetter(user) {
  const source = (user.displayName || user.email || "?").trim();
  return source.charAt(0).toUpperCase() || "?";
}

/** @param {string | null | undefined} stored */
export function parseThemePref(stored) {
  if (stored === "light" || stored === "dark" || stored === "system") {
    return stored;
  }
  return "system";
}
