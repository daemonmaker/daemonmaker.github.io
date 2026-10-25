import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithRedirect,
  getRedirectResult,
  signOut,
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
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
const googleProvider = new GoogleAuthProvider();

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

async function signInWithGoogle() {
  setLoginError("");
  setLoginBusy(true, "Redirecting to Google…");
  try {
    await signInWithRedirect(auth, googleProvider);
  } catch (error) {
    setLoginBusy(false);
    setLoginError(error.message || "Sign-in failed.");
  }
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

btnGoogleSignIn.addEventListener("click", () => {
  signInWithGoogle();
});

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
  setLoginBusy(true, "Checking sign-in…");

  try {
    await getRedirectResult(auth);
  } catch (error) {
    setLoginBusy(false);
    setLoginError(error.message || "Sign-in failed.");
  }

  onAuthStateChanged(auth, (user) => {
    setLoginBusy(false);
    if (user) {
      startSession(user);
    } else {
      endSession();
    }
  });
}

initAuth();
