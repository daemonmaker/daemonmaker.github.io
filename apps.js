import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js";
import {
  initializeAuth,
  browserLocalPersistence,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithCredential,
  signOut,
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import {
  GOOGLE_OAUTH_CLIENT_ID,
  GOOGLE_OAUTH_REDIRECT_URI,
  SEED_ADMIN_EMAILS,
} from "./apps-config.js";
import {
  normalizeEmail,
  normalizeApps,
  isAdminUser,
  sessionView,
  bindUidWrite,
  inviteUpsertFields,
  appsLauncherLinks,
  adminRosterSort,
  accessDocIdForEmail,
  userCoinLetter,
} from "./apps-access.mjs";
import {
  trashIconSvg,
  bindRosterRowSwipe,
  syncRosterSwipePresentation,
  closeOpenRosterSwipe,
} from "./apps-roster-swipe.mjs";
import { loadSharedThemePref, saveSharedThemePref } from "./app-theme.mjs";

const OAUTH_NONCE_KEY = "apps_google_oauth_nonce";

const firebaseConfig = {
  apiKey: "AIzaSyBrh3SWdqneRJFzCuIwmkGqN_U0UG_YXFE",
  authDomain: "daemonmaker-grocery.firebaseapp.com",
  projectId: "daemonmaker-grocery",
  storageBucket: "daemonmaker-grocery.firebasestorage.app",
  messagingSenderId: "75529110090",
  appId: "1:75529110090:web:24c19a6e93c516e7641cb3",
};

const app = initializeApp(firebaseConfig);
const auth = initializeAuth(app, {
  persistence: browserLocalPersistence,
});
const db = getFirestore(app);

const viewLogin = document.getElementById("view-login");
const viewApp = document.getElementById("view-app");
const viewNotFound = document.getElementById("view-not-found");
const loginError = document.getElementById("login-error");
const loginStatus = document.getElementById("login-status");
const btnGoogleSignIn = document.getElementById("btn-google-sign-in");
const appMessage = document.getElementById("app-message");
const userLabel = document.getElementById("user-label");
const launcherList = document.getElementById("launcher-list");
const launcherEmpty = document.getElementById("launcher-empty");
const adminPanel = document.getElementById("admin-panel");
const inviteForm = document.getElementById("invite-form");
const inviteEmail = document.getElementById("invite-email");
const rosterEl = document.getElementById("roster");
const loginThemeButtons = document.querySelectorAll("[data-apps-theme-pick]");
const userCoinInitial = document.getElementById("user-coin-initial");
const btnUserMenu = document.getElementById("btn-user-menu");
const userMenuPanel = document.getElementById("user-menu-panel");
const themeRadios = document.querySelectorAll('input[name="apps-theme"]');

const state = {
  user: null,
  accessDoc: null,
  adminConfig: null,
  seedAdmin: false,
  isAdmin: false,
  roster: [],
  openSwipeEmailKey: null,
};

const rosterSwipeCtx = {
  rosterEl,
  getOpenKey: () => state.openSwipeEmailKey,
  setOpenKey: (key) => {
    state.openSwipeEmailKey = key;
  },
};

const unsubscribers = [];

function applyTheme(mode) {
  document.documentElement.dataset.appsTheme = mode;
}

function syncThemeRadios() {
  const mode = loadSharedThemePref(localStorage);
  for (const radio of themeRadios) {
    radio.checked = radio.value === mode;
  }
  for (const btn of loginThemeButtons) {
    const pressed = btn.getAttribute("data-apps-theme-pick") === mode;
    btn.setAttribute("aria-pressed", pressed ? "true" : "false");
    btn.classList.toggle("login__theme-btn--active", pressed);
  }
}

function setThemeFromUI(mode) {
  const next = saveSharedThemePref(mode, localStorage);
  applyTheme(next);
  syncThemeRadios();
}

function closeUserMenu() {
  if (!userMenuPanel) {
    return;
  }
  userMenuPanel.hidden = true;
  btnUserMenu?.setAttribute("aria-expanded", "false");
}

function toggleUserMenu() {
  const willOpen = userMenuPanel.hidden;
  if (willOpen) {
    userMenuPanel.hidden = false;
    btnUserMenu.setAttribute("aria-expanded", "true");
  } else {
    closeUserMenu();
  }
}

function hideAllViews() {
  viewLogin.hidden = true;
  viewApp.hidden = true;
  viewNotFound.hidden = true;
  viewLogin.inert = true;
  viewApp.inert = true;
  viewNotFound.inert = true;
}

function showLogin() {
  hideAllViews();
  viewLogin.hidden = false;
  viewLogin.inert = false;
  closeUserMenu();
}

function showNotFound() {
  hideAllViews();
  viewNotFound.hidden = false;
  viewNotFound.inert = false;
  closeUserMenu();
}

function showAppShell() {
  hideAllViews();
  viewApp.hidden = false;
  viewApp.inert = false;
}

function setLoginError(message) {
  if (!message) {
    loginError.hidden = true;
    loginError.textContent = "";
    return;
  }
  loginError.hidden = false;
  loginError.textContent = message;
}

function setLoginBusy(busy, statusText = "") {
  btnGoogleSignIn.disabled = busy;
  if (statusText) {
    loginStatus.hidden = false;
    loginStatus.textContent = statusText;
  } else {
    loginStatus.hidden = true;
    loginStatus.textContent = "";
  }
}

function setAppMessage(message) {
  if (!message) {
    appMessage.hidden = true;
    appMessage.textContent = "";
    return;
  }
  appMessage.hidden = false;
  appMessage.textContent = message;
}

function cleanupSubscriptions() {
  while (unsubscribers.length) {
    const unsub = unsubscribers.pop();
    unsub();
  }
}

function oauthRedirectUri() {
  if (window.location.hostname === "localhost") {
    return `${window.location.origin}${window.location.pathname}`;
  }
  return GOOGLE_OAUTH_REDIRECT_URI;
}

function randomNonce() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

function signInWithGoogle() {
  setLoginError("");
  setLoginBusy(true, "Redirecting to Google…");
  const nonce = randomNonce();
  localStorage.setItem(OAUTH_NONCE_KEY, nonce);
  const params = new URLSearchParams({
    client_id: GOOGLE_OAUTH_CLIENT_ID,
    redirect_uri: oauthRedirectUri(),
    response_type: "id_token token",
    response_mode: "fragment",
    scope: "openid email profile",
    nonce,
  });
  window.location.assign(
    `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
  );
}

function decodeJwtPayload(idToken) {
  const payload = idToken.split(".")[1];
  if (!payload) {
    return null;
  }
  const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  return JSON.parse(atob(padded));
}

async function completeGoogleRedirect() {
  const storedHash = sessionStorage.getItem("apps_oauth_hash");
  if (!storedHash) {
    return;
  }
  sessionStorage.removeItem("apps_oauth_hash");

  const hash = new URLSearchParams(storedHash.replace(/^#/, ""));
  const oauthError = hash.get("error");
  const idToken = hash.get("id_token");
  const accessToken = hash.get("access_token");
  const expectedNonce = localStorage.getItem(OAUTH_NONCE_KEY);
  localStorage.removeItem(OAUTH_NONCE_KEY);

  if (oauthError) {
    setLoginError(hash.get("error_description") || oauthError);
    return;
  }
  if (!idToken && !accessToken) {
    setLoginError("Google did not return a sign-in token.");
    return;
  }

  try {
    if (idToken && expectedNonce) {
      const nonce = decodeJwtPayload(idToken)?.nonce;
      if (nonce && nonce !== expectedNonce) {
        setLoginError("Sign-in could not be verified. Please try again.");
        return;
      }
    }
    setLoginBusy(true, "Signing in…");
    const credential = GoogleAuthProvider.credential(
      idToken || null,
      accessToken || null,
    );
    await signInWithCredential(auth, credential);
  } catch (error) {
    const code = error?.code ? `${error.code}: ` : "";
    setLoginError(`${code}${error.message || "Sign-in failed."}`);
  } finally {
    setLoginBusy(false);
  }
}

async function loadAdminConfig() {
  const snap = await getDoc(doc(db, "config", "admins"));
  return snap.exists() ? snap.data() : null;
}

async function ensureAdminConfig(user) {
  const email = normalizeEmail(user.email);
  const ref = doc(db, "config", "admins");
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      uids: [user.uid],
      emails: email ? [email] : [],
    });
    return { uids: [user.uid], emails: email ? [email] : [] };
  }
  const data = snap.data();
  const uids = Array.isArray(data.uids) ? [...data.uids] : [];
  const emails = Array.isArray(data.emails)
    ? data.emails.map((e) => normalizeEmail(e))
    : [];
  let changed = false;
  if (!uids.includes(user.uid)) {
    uids.push(user.uid);
    changed = true;
  }
  if (email && !emails.includes(email)) {
    emails.push(email);
    changed = true;
  }
  if (changed) {
    await updateDoc(ref, { uids, emails });
  }
  return { uids, emails };
}

async function ensureSeedAccessDoc(user) {
  const emailKey = accessDocIdForEmail(user.email || "");
  if (!emailKey) {
    return null;
  }
  const ref = doc(db, "access", emailKey);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      email: emailKey,
      apps: ["grocery", "habits"],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await updateDoc(ref, {
      uid: user.uid,
      displayName: user.displayName || null,
      updatedAt: serverTimestamp(),
    });
    const created = await getDoc(ref);
    return created.data();
  }
  const data = snap.data();
  const apps = normalizeApps(data.apps);
  const patch = { updatedAt: serverTimestamp() };
  if (apps.length === 0) {
    patch.apps = ["grocery", "habits"];
  }
  const bind = bindUidWrite({ accessDoc: data, uid: user.uid });
  if (bind.ok && bind.patch) {
    Object.assign(patch, bind.patch);
  }
  if (user.displayName && data.displayName !== user.displayName) {
    patch.displayName = user.displayName;
  }
  if (Object.keys(patch).length > 1) {
    await updateDoc(ref, patch);
  }
  const refreshed = await getDoc(ref);
  return refreshed.data();
}

async function loadAccessDocForUser(user) {
  const emailKey = accessDocIdForEmail(user.email || "");
  if (!emailKey) {
    return null;
  }
  const snap = await getDoc(doc(db, "access", emailKey));
  return snap.exists() ? snap.data() : null;
}

async function bindAccessUid(user, accessDoc) {
  const emailKey = accessDocIdForEmail(user.email || "");
  const bind = bindUidWrite({ accessDoc, uid: user.uid });
  if (!bind.ok) {
    throw new Error(bind.error);
  }
  if (!bind.patch) {
    return accessDoc;
  }
  const ref = doc(db, "access", emailKey);
  const patch = {
    ...bind.patch,
    updatedAt: serverTimestamp(),
  };
  if (user.displayName) {
    patch.displayName = user.displayName;
  }
  await updateDoc(ref, patch);
  const snap = await getDoc(ref);
  return snap.data();
}

function renderLauncher() {
  launcherList.textContent = "";
  const links = appsLauncherLinks(state.accessDoc);
  if (links.length === 0) {
    launcherEmpty.hidden = false;
    return;
  }
  launcherEmpty.hidden = true;
  for (const link of links) {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.className = "launcher__link";
    a.href = link.href;
    const title = document.createElement("span");
    title.className = "launcher__title";
    title.textContent = link.title;
    a.appendChild(title);
    if (link.description) {
      const desc = document.createElement("span");
      desc.className = "launcher__desc";
      desc.textContent = link.description;
      a.appendChild(desc);
    }
    li.appendChild(a);
    launcherList.appendChild(li);
  }
}

function renderRoster() {
  const openKey = state.openSwipeEmailKey;
  rosterEl.textContent = "";
  const rows = adminRosterSort(state.roster);
  const stillOpen = openKey && rows.some((r) => r.id === openKey);
  state.openSwipeEmailKey = stillOpen ? openKey : null;

  for (const row of rows) {
    const wrap = document.createElement("div");
    wrap.className = "roster__row";
    wrap.dataset.emailKey = row.id;

    const reveal = document.createElement("div");
    reveal.className = "roster__reveal";
    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "roster__delete";
    deleteBtn.setAttribute(
      "aria-label",
      `Remove ${row.email || row.id}`,
    );
    deleteBtn.appendChild(trashIconSvg());
    deleteBtn.addEventListener("click", () => {
      void removeInvite(row.id);
    });
    reveal.appendChild(deleteBtn);

    const front = document.createElement("div");
    front.className = "roster__front";

    const emailCol = document.createElement("div");
    const emailP = document.createElement("p");
    emailP.className = "roster__email";
    emailP.textContent = row.email || row.id;
    const meta = document.createElement("p");
    meta.className = "roster__meta";
    meta.textContent = row.uid ? `uid: ${row.uid}` : "Not signed in yet";
    emailCol.append(emailP, meta);

    const appsCol = document.createElement("div");
    appsCol.className = "roster__apps";
    const apps = normalizeApps(row.apps);
    for (const appId of ["grocery", "habits"]) {
      const label = document.createElement("label");
      label.className = "check";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = apps.includes(appId);
      input.dataset.app = appId;
      input.addEventListener("change", () => {
        void saveRosterApps(row.id, appsCol);
      });
      label.append(input, document.createTextNode(appId));
      appsCol.appendChild(label);
    }

    front.append(emailCol, appsCol);
    wrap.append(reveal, front);
    bindRosterRowSwipe(front, row.id, rosterSwipeCtx);
    syncRosterSwipePresentation(wrap, row.id, state.openSwipeEmailKey);
    rosterEl.appendChild(wrap);
  }
}

async function saveRosterApps(emailKey, appsCol) {
  const selected = [...appsCol.querySelectorAll('input[type="checkbox"]')]
    .filter((el) => el.checked)
    .map((el) => el.dataset.app);
  setAppMessage("");
  try {
    await updateDoc(doc(db, "access", emailKey), {
      apps: normalizeApps(selected),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    setAppMessage(error.message || "Could not update access.");
  }
}

async function removeInvite(emailKey) {
  setAppMessage("");
  if (state.openSwipeEmailKey === emailKey) {
    state.openSwipeEmailKey = null;
  }
  try {
    await deleteDoc(doc(db, "access", emailKey));
  } catch (error) {
    setAppMessage(error.message || "Could not remove invite.");
  }
}

function subscribeRoster() {
  const ref = collection(db, "access");
  const unsub = onSnapshot(
    ref,
    (snap) => {
      state.roster = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderRoster();
    },
    (error) => {
      setAppMessage(error.message || "Could not load roster.");
    },
  );
  unsubscribers.push(unsub);
}

function renderShell() {
  renderLauncher();
  adminPanel.hidden = !state.isAdmin;
  if (state.isAdmin) {
    renderRoster();
  }
}

async function startSession(user) {
  cleanupSubscriptions();
  state.user = user;
  state.accessDoc = null;
  state.adminConfig = await loadAdminConfig();
  state.seedAdmin = isAdminUser(
    { email: user.email, uid: user.uid },
    { seedEmails: SEED_ADMIN_EMAILS, adminConfig: state.adminConfig },
  );
  state.isAdmin = isAdminUser(
    { email: user.email, uid: user.uid },
    { seedEmails: SEED_ADMIN_EMAILS, adminConfig: state.adminConfig },
  );

  userLabel.textContent = user.displayName
    ? `${user.displayName} (${user.email})`
    : user.email || user.uid;
  if (userCoinInitial) {
    userCoinInitial.textContent = userCoinLetter(user);
  }

  setAppMessage("");
  closeUserMenu();

  try {
    if (state.seedAdmin) {
      state.adminConfig = await ensureAdminConfig(user);
      state.isAdmin = true;
      state.accessDoc = await ensureSeedAccessDoc(user);
    } else {
      let accessDoc = await loadAccessDocForUser(user);
      const view = sessionView({
        accessDoc,
        appId: "portal",
        seedAdmin: false,
      });
      if (view === "notFound") {
        showNotFound();
        return;
      }
      accessDoc = await bindAccessUid(user, accessDoc);
      state.accessDoc = accessDoc;
    }

    const view = sessionView({
      accessDoc: state.accessDoc,
      appId: "portal",
      seedAdmin: state.seedAdmin,
    });
    if (view === "notFound") {
      showNotFound();
      return;
    }

    showAppShell();
    if (state.isAdmin) {
      subscribeRoster();
    }
    renderShell();
  } catch (error) {
    const code = error?.code ? `${error.code}: ` : "";
    setAppMessage(`${code}${error.message || "Could not load session."}`);
    showAppShell();
  }
}

function endSession() {
  cleanupSubscriptions();
  state.user = null;
  state.accessDoc = null;
  state.adminConfig = null;
  state.seedAdmin = false;
  state.isAdmin = false;
  state.roster = [];
  showLogin();
}

inviteForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.isAdmin) {
    return;
  }
  const apps = [...inviteForm.querySelectorAll('input[name="app"]:checked')].map(
    (el) => el.value,
  );
  const parsed = inviteUpsertFields({
    email: inviteEmail.value,
    apps,
  });
  if (!parsed.ok) {
    setAppMessage(parsed.error);
    return;
  }
  setAppMessage("");
  try {
    const { email, apps: nextApps } = parsed.fields;
    const ref = doc(db, "access", email);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, {
        email,
        apps: nextApps,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        email,
        apps: nextApps,
        uid: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    inviteEmail.value = "";
  } catch (error) {
    setAppMessage(error.message || "Could not save invite.");
  }
});

document.getElementById("btn-sign-out").addEventListener("click", async () => {
  await signOut(auth);
});

document.getElementById("btn-not-found-sign-out").addEventListener("click", async () => {
  await signOut(auth);
});

for (const btn of loginThemeButtons) {
  btn.addEventListener("click", () => {
    setThemeFromUI(btn.getAttribute("data-apps-theme-pick"));
  });
}

for (const radio of themeRadios) {
  radio.addEventListener("change", () => {
    if (!radio.checked) {
      return;
    }
    setThemeFromUI(radio.value);
  });
}

btnUserMenu?.addEventListener("click", (event) => {
  event.stopPropagation();
  toggleUserMenu();
});

document.addEventListener("click", (event) => {
  if (!event.target.closest(".user-menu")) {
    closeUserMenu();
  }
  if (!event.target.closest(".roster__row")) {
    closeOpenRosterSwipe(rosterSwipeCtx);
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeUserMenu();
    closeOpenRosterSwipe(rosterSwipeCtx);
  }
});

setThemeFromUI(loadSharedThemePref(localStorage));

async function initAuth() {
  showLogin();

  onAuthStateChanged(auth, (user) => {
    setLoginBusy(false);
    if (user) {
      void startSession(user);
    } else {
      endSession();
    }
  });

  const hint = document.getElementById("login-oauth-hint");
  if (hint) {
    const code = hint.querySelector("code");
    if (code) {
      code.textContent = oauthRedirectUri();
    }
  }
  btnGoogleSignIn.addEventListener("click", () => {
    signInWithGoogle();
  });
  await completeGoogleRedirect();
}

initAuth();
