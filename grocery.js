import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithCredential,
  signOut,
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import {
  GOOGLE_OAUTH_CLIENT_ID,
  GOOGLE_OAUTH_REDIRECT_URI,
} from "./grocery-config.js";
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBrh3SWdqneRJFzCuIwmkGqN_U0UG_YXFE",
  authDomain: "daemonmaker-grocery.firebaseapp.com",
  projectId: "daemonmaker-grocery",
  storageBucket: "daemonmaker-grocery.firebasestorage.app",
  messagingSenderId: "75529110090",
  appId: "1:75529110090:web:24c19a6e93c516e7641cb3",
};

const BOOTSTRAP_LIST_ID = "shared-grocery";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const viewLogin = document.getElementById("view-login");
const viewApp = document.getElementById("view-app");
const loginError = document.getElementById("login-error");
const loginStatus = document.getElementById("login-status");
const btnGoogleSignIn = document.getElementById("btn-google-sign-in");
const appMessage = document.getElementById("app-message");
const userLabel = document.getElementById("user-label");
const listSharedEl = document.getElementById("list-shared");
const listPersonalEl = document.getElementById("list-personal");
const activeListNameEl = document.getElementById("active-list-name");
const defaultBadgeEl = document.getElementById("default-badge");
const itemsEl = document.getElementById("items");
const itemsEmptyEl = document.getElementById("items-empty");
const btnSetDefault = document.getElementById("btn-set-default");
const formAddItem = document.getElementById("form-add-item");
const inputItem = document.getElementById("input-item");

const state = {
  user: null,
  defaultListId: null,
  activeListId: null,
  sharedLists: [],
  personalLists: [],
  items: [],
  ready: false,
};

const unsubscribers = [];
let itemsUnsub = null;

function showLogin() {
  viewLogin.hidden = false;
  viewApp.hidden = true;
}

function showApp() {
  viewLogin.hidden = true;
  viewApp.hidden = false;
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
  if (itemsUnsub) {
    itemsUnsub();
    itemsUnsub = null;
  }
  while (unsubscribers.length) {
    const unsub = unsubscribers.pop();
    unsub();
  }
}

function getListById(id) {
  return (
    state.sharedLists.find((list) => list.id === id) ||
    state.personalLists.find((list) => list.id === id) ||
    null
  );
}

function sortLists(lists) {
  return [...lists].sort((a, b) => a.name.localeCompare(b.name));
}

async function ensureBootstrap() {
  const bootstrapRef = doc(db, "lists", BOOTSTRAP_LIST_ID);
  const bootstrapSnap = await getDoc(bootstrapRef);

  if (!bootstrapSnap.exists()) {
    await setDoc(bootstrapRef, {
      name: "Grocery",
      scope: "shared",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  const configRef = doc(db, "config", "app");
  const configSnap = await getDoc(configRef);
  const defaultId = configSnap.exists()
    ? configSnap.data().defaultListId
    : null;

  let defaultIsValid = false;
  if (defaultId) {
    const defaultListSnap = await getDoc(doc(db, "lists", defaultId));
    defaultIsValid =
      defaultListSnap.exists() &&
      defaultListSnap.data().scope === "shared";
  }

  if (!defaultIsValid) {
    await setDoc(
      configRef,
      { defaultListId: BOOTSTRAP_LIST_ID },
      { merge: true },
    );
  }
}

function renderListNav(container, lists, emptyLabel) {
  container.replaceChildren();
  if (!lists.length) {
    const empty = document.createElement("li");
    empty.className = "list-nav__item";
    empty.textContent = emptyLabel;
    empty.style.color = "var(--text-muted)";
    empty.style.fontSize = "0.9rem";
    empty.style.padding = "0.45rem 0.5rem";
    container.appendChild(empty);
    return;
  }

  for (const list of lists) {
    const li = document.createElement("li");
    li.className = "list-nav__item";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "list-nav__button";
    button.dataset.listId = list.id;
    button.setAttribute(
      "aria-current",
      list.id === state.activeListId ? "true" : "false",
    );

    const label = document.createElement("span");
    label.textContent = list.name;

    button.appendChild(label);

    if (list.id === state.defaultListId && list.scope === "shared") {
      const meta = document.createElement("span");
      meta.className = "list-nav__meta";
      meta.textContent = "Default";
      button.appendChild(meta);
    }

    button.addEventListener("click", () => {
      state.activeListId = list.id;
      renderAll();
      subscribeItems();
    });

    li.appendChild(button);
    container.appendChild(li);
  }
}

function renderItems() {
  itemsEl.replaceChildren();
  itemsEmptyEl.hidden = state.items.length > 0;

  for (const item of state.items) {
    const li = document.createElement("li");
    li.className = "items__row";

    const name = document.createElement("p");
    name.className = "items__name";
    name.textContent = item.name;

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "btn btn--ghost";
    removeBtn.textContent = "Remove";
    removeBtn.addEventListener("click", () => removeItem(item.id));

    li.appendChild(name);
    li.appendChild(removeBtn);
    itemsEl.appendChild(li);
  }
}

function renderToolbar() {
  const active = getListById(state.activeListId);
  if (!active) {
    activeListNameEl.textContent = "";
    defaultBadgeEl.hidden = true;
    btnSetDefault.hidden = true;
    btnSetDefault.disabled = true;
    document.getElementById("btn-rename").disabled = true;
    document.getElementById("btn-delete-list").disabled = true;
    formAddItem.querySelector("button").disabled = true;
    inputItem.disabled = true;
    return;
  }

  activeListNameEl.textContent = active.name;
  const isDefault =
    active.scope === "shared" && active.id === state.defaultListId;
  defaultBadgeEl.hidden = !isDefault;
  btnSetDefault.hidden = active.scope !== "shared";
  btnSetDefault.disabled = isDefault;
  document.getElementById("btn-rename").disabled = false;
  document.getElementById("btn-delete-list").disabled = false;
  formAddItem.querySelector("button").disabled = false;
  inputItem.disabled = false;
}

function renderAll() {
  renderListNav(listSharedEl, state.sharedLists, "No shared lists yet.");
  renderListNav(listPersonalEl, state.personalLists, "No personal lists yet.");
  renderToolbar();
  renderItems();
}

function subscribeConfig() {
  const configRef = doc(db, "config", "app");
  const unsub = onSnapshot(configRef, (snap) => {
    const nextDefault = snap.exists() ? snap.data().defaultListId : null;
    state.defaultListId = nextDefault;
    if (state.ready && nextDefault && !state.activeListId) {
      state.activeListId = nextDefault;
      subscribeItems();
    }
    renderAll();
  });
  unsubscribers.push(unsub);
}

function subscribeLists(uid) {
  const sharedQuery = query(
    collection(db, "lists"),
    where("scope", "==", "shared"),
  );
  const personalQuery = query(
    collection(db, "lists"),
    where("scope", "==", "personal"),
    where("ownerUid", "==", uid),
  );

  const unsubShared = onSnapshot(sharedQuery, (snap) => {
    state.sharedLists = sortLists(
      snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })),
    );
    ensureActiveList();
    renderAll();
  });

  const unsubPersonal = onSnapshot(personalQuery, (snap) => {
    state.personalLists = sortLists(
      snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })),
    );
    ensureActiveList();
    renderAll();
  });

  unsubscribers.push(unsubShared, unsubPersonal);
}

function ensureActiveList() {
  const activeStillVisible = getListById(state.activeListId);
  if (activeStillVisible) {
    return;
  }

  if (state.defaultListId && getListById(state.defaultListId)) {
    state.activeListId = state.defaultListId;
  } else if (state.sharedLists.length) {
    state.activeListId = state.sharedLists[0].id;
  } else if (state.personalLists.length) {
    state.activeListId = state.personalLists[0].id;
  } else {
    state.activeListId = null;
  }

  subscribeItems();
}

function subscribeItems() {
  if (itemsUnsub) {
    itemsUnsub();
    itemsUnsub = null;
  }

  if (!state.activeListId) {
    state.items = [];
    renderItems();
    return;
  }

  const itemsQuery = query(
    collection(db, "lists", state.activeListId, "items"),
    orderBy("createdAt", "asc"),
  );

  itemsUnsub = onSnapshot(itemsQuery, (snap) => {
    state.items = snap.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    }));
    renderItems();
  });
}

async function promptListName(title, defaultValue = "") {
  const name = window.prompt(title, defaultValue);
  if (name === null) {
    return null;
  }
  const trimmed = name.trim();
  if (!trimmed) {
    setAppMessage("List name cannot be empty.");
    return null;
  }
  return trimmed;
}

async function createList(scope) {
  const name = await promptListName(
    scope === "shared" ? "Name for the shared list" : "Name for your personal list",
  );
  if (!name) {
    return;
  }

  setAppMessage("");
  const payload = {
    name,
    scope,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (scope === "personal") {
    payload.ownerUid = state.user.uid;
  }

  const ref = await addDoc(collection(db, "lists"), payload);
  state.activeListId = ref.id;
  renderAll();
  subscribeItems();
}

async function renameActiveList() {
  const active = getListById(state.activeListId);
  if (!active) {
    return;
  }
  const name = await promptListName("Rename list", active.name);
  if (!name) {
    return;
  }
  setAppMessage("");
  await updateDoc(doc(db, "lists", active.id), {
    name,
    updatedAt: serverTimestamp(),
  });
}

async function deleteActiveList() {
  const active = getListById(state.activeListId);
  if (!active) {
    return;
  }

  const confirmed = window.confirm(
    `Delete "${active.name}" and all of its items? This cannot be undone.`,
  );
  if (!confirmed) {
    return;
  }

  setAppMessage("");

  const itemsSnap = await getDocs(
    collection(db, "lists", active.id, "items"),
  );
  const deletes = itemsSnap.docs.map((itemDoc) =>
    deleteDoc(itemDoc.ref),
  );
  await Promise.all(deletes);

  const wasDefault =
    active.scope === "shared" && active.id === state.defaultListId;

  await deleteDoc(doc(db, "lists", active.id));

  if (wasDefault) {
    const remainingShared = state.sharedLists.filter((l) => l.id !== active.id);
    const nextDefault =
      remainingShared.find((l) => l.id === BOOTSTRAP_LIST_ID) ||
      remainingShared[0] ||
      null;

    if (nextDefault) {
      await setDoc(
        doc(db, "config", "app"),
        { defaultListId: nextDefault.id },
        { merge: true },
      );
    } else {
      await ensureBootstrap();
    }
  }

  state.activeListId = null;
  ensureActiveList();
  renderAll();
}

async function setGlobalDefault() {
  const active = getListById(state.activeListId);
  if (!active || active.scope !== "shared") {
    return;
  }
  setAppMessage("");
  await setDoc(
    doc(db, "config", "app"),
    { defaultListId: active.id },
    { merge: true },
  );
}

async function addItem(event) {
  event.preventDefault();
  const active = getListById(state.activeListId);
  if (!active) {
    return;
  }

  const name = inputItem.value.trim();
  if (!name) {
    return;
  }

  setAppMessage("");
  await addDoc(collection(db, "lists", active.id, "items"), {
    name,
    createdAt: serverTimestamp(),
  });
  inputItem.value = "";
  inputItem.focus();
}

async function removeItem(itemId) {
  const active = getListById(state.activeListId);
  if (!active) {
    return;
  }
  setAppMessage("");
  await deleteDoc(doc(db, "lists", active.id, "items", itemId));
}

const PKCE_VERIFIER_KEY = "google_oauth_pkce_verifier";
const PKCE_REDIRECT_KEY = "google_oauth_redirect_uri";

function getOAuthRedirectUri() {
  if (window.location.hostname === "localhost") {
    return `${window.location.origin}/`;
  }
  if (GOOGLE_OAUTH_REDIRECT_URI) {
    return GOOGLE_OAUTH_REDIRECT_URI;
  }
  return `${window.location.origin}/`;
}

function base64UrlEncode(bytes) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

function randomPkceVerifier() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

async function pkceChallengeFromVerifier(verifier) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return base64UrlEncode(new Uint8Array(digest));
}

async function startGoogleOAuthRedirect() {
  setLoginError("");
  setLoginBusy(true, "Redirecting to Google…");

  const redirectUri = getOAuthRedirectUri();
  const verifier = randomPkceVerifier();
  const challenge = await pkceChallengeFromVerifier(verifier);
  sessionStorage.setItem(PKCE_VERIFIER_KEY, verifier);
  sessionStorage.setItem(PKCE_REDIRECT_KEY, redirectUri);

  const params = new URLSearchParams({
    client_id: GOOGLE_OAUTH_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid profile email",
    prompt: "select_account",
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  window.location.assign(
    `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
  );
}

async function signInWithGoogleTokens(idToken, accessToken) {
  const credential = GoogleAuthProvider.credential(
    idToken || null,
    accessToken || null,
  );
  await signInWithCredential(auth, credential);
}

async function completeGoogleOAuthFromReturn() {
  const query = new URLSearchParams(window.location.search);
  const queryError = query.get("error");
  if (queryError) {
    history.replaceState(null, "", window.location.pathname);
    setLoginError(query.get("error_description") || queryError);
    return true;
  }

  const code = query.get("code");
  if (code) {
    history.replaceState(null, "", window.location.pathname);

    const verifier = sessionStorage.getItem(PKCE_VERIFIER_KEY);
    const redirectUri =
      sessionStorage.getItem(PKCE_REDIRECT_KEY) || getOAuthRedirectUri();
    sessionStorage.removeItem(PKCE_VERIFIER_KEY);
    sessionStorage.removeItem(PKCE_REDIRECT_KEY);

    if (!verifier) {
      setLoginError(
        "Sign-in session expired. Close this tab and try again from the grocery page.",
      );
      return true;
    }

    setLoginBusy(true, "Signing in…");
    try {
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: GOOGLE_OAUTH_CLIENT_ID,
          code,
          code_verifier: verifier,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      });
      const tokenJson = await tokenRes.json();
      if (!tokenRes.ok) {
        throw new Error(
          tokenJson.error_description ||
            tokenJson.error ||
            "Token exchange failed.",
        );
      }
      await signInWithGoogleTokens(tokenJson.id_token, tokenJson.access_token);
    } catch (error) {
      setLoginBusy(false);
      setLoginError(error.message || "Sign-in failed.");
    }
    return true;
  }

  const hash = window.location.hash;
  if (!hash || !hash.includes("access_token=")) {
    return false;
  }

  const hashParams = new URLSearchParams(hash.slice(1));
  history.replaceState(null, "", window.location.pathname);

  const oauthError = hashParams.get("error");
  if (oauthError) {
    setLoginError(hashParams.get("error_description") || oauthError);
    return true;
  }

  const accessToken = hashParams.get("access_token");
  if (!accessToken) {
    return false;
  }

  setLoginBusy(true, "Signing in…");
  try {
    await signInWithGoogleTokens(null, accessToken);
  } catch (error) {
    setLoginBusy(false);
    setLoginError(error.message || "Sign-in failed.");
  }
  return true;
}

function showOAuthRedirectHint() {
  const hint = document.getElementById("oauth-redirect-hint");
  if (!hint || !GOOGLE_OAUTH_CLIENT_ID) {
    return;
  }
  const redirectUri = getOAuthRedirectUri();
  hint.hidden = false;
  hint.textContent = `Google Cloud → Credentials → client ${GOOGLE_OAUTH_CLIENT_ID.slice(0, 20)}… → Authorized redirect URIs must include exactly: ${redirectUri}`;
}

function initGoogleSignIn() {
  if (!GOOGLE_OAUTH_CLIENT_ID) {
    setLoginError(
      "Set GOOGLE_OAUTH_CLIENT_ID in grocery-config.js (Firebase Console → Authentication → Google → Web client ID).",
    );
    return;
  }

  showOAuthRedirectHint();
  btnGoogleSignIn.addEventListener("click", startGoogleOAuthRedirect);
}

async function startSession(user) {
  cleanupSubscriptions();
  state.user = user;
  state.ready = false;
  state.activeListId = null;
  state.items = [];

  userLabel.textContent = user.displayName
    ? `${user.displayName} (${user.email})`
    : user.email || user.uid;

  showApp();
  setAppMessage("");

  try {
    await ensureBootstrap();
    subscribeConfig();
    subscribeLists(user.uid);

    const configSnap = await getDoc(doc(db, "config", "app"));
    state.defaultListId = configSnap.exists()
      ? configSnap.data().defaultListId
      : BOOTSTRAP_LIST_ID;
    state.activeListId = state.defaultListId;
    state.ready = true;
    subscribeItems();
    renderAll();
  } catch (error) {
    setAppMessage(error.message || "Could not load lists.");
  }
}

function endSession() {
  cleanupSubscriptions();
  state.user = null;
  state.defaultListId = null;
  state.activeListId = null;
  state.sharedLists = [];
  state.personalLists = [];
  state.items = [];
  state.ready = false;
  showLogin();
}

document.getElementById("btn-sign-out").addEventListener("click", async () => {
  await signOut(auth);
});

document.getElementById("btn-new-shared").addEventListener("click", () => {
  createList("shared");
});

document.getElementById("btn-new-personal").addEventListener("click", () => {
  createList("personal");
});

document.getElementById("btn-rename").addEventListener("click", () => {
  renameActiveList();
});

document.getElementById("btn-delete-list").addEventListener("click", () => {
  deleteActiveList();
});

btnSetDefault.addEventListener("click", () => {
  setGlobalDefault();
});

formAddItem.addEventListener("submit", addItem);

async function initAuth() {
  showLogin();

  onAuthStateChanged(auth, (user) => {
    setLoginBusy(false);
    if (user) {
      startSession(user);
    } else {
      endSession();
    }
  });

  initGoogleSignIn();
  await completeGoogleOAuthFromReturn();
}

initAuth();
