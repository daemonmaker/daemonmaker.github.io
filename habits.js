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
  GOOGLE_OAUTH_CLIENT_ID,
  GOOGLE_OAUTH_REDIRECT_URI,
} from "./habits-config.js";
import {
  toDateKey,
  weekGridCells,
  wrapSequence,
  dayKeysForRange,
} from "./habits-grid.mjs";
import {
  doneDayKeysForHabit,
  pendingDoneKey,
  isDayDoneForHabit,
  reconcilePendingDoneKeys as reconcilePendingDoneKeysPure,
  userCoinLetter,
  parseLayoutPref,
  parseRangePref,
  parseStoredHabitId,
  pickActiveHabitId,
} from "./habits-state.mjs";
import {
  sessionView,
  accessDocIdForEmail,
  bindUidWrite,
  userMenuAppLinks,
} from "./apps-access.mjs";
import {
  HABITS_ACTIVE_HABIT_FIELD,
  preferCloudSelectionId,
  shouldMigrateLocalSelectionToCloud,
} from "./app-prefs.mjs";
import { loadSharedThemePref, saveSharedThemePref } from "./app-theme.mjs";
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  setDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
  deleteField,
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

const DEFAULT_DONE_COLOR = "#22c55e";
const DEFAULT_UNDONE_COLOR = "#9ca3af";
const DEFAULT_TODAY_OUTLINE_COLOR = "#2563eb";
const LAYOUT_KEY = "habits_layout";
const RANGE_KEY = "habits_range";
const ACTIVE_HABIT_KEY = "habits_active_habit";

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
const OAUTH_NONCE_KEY = "habits_google_oauth_nonce";
const appMessage = document.getElementById("app-message");
const userLabel = document.getElementById("user-label");
const habitNavEl = document.getElementById("habit-nav");
const habitMainEl = document.getElementById("habit-main");
const habitEmptyEl = document.getElementById("habit-empty");
const habitTitleRegion = document.getElementById("habit-title-region");
const habitGridEl = document.getElementById("habit-grid");
const habitWeekdaysEl = document.getElementById("habit-weekdays");
const inputDoneColor = document.getElementById("input-done-color");
const inputUndoneColor = document.getElementById("input-undone-color");
const inputTodayOutlineColor = document.getElementById(
  "input-today-outline-color",
);
const btnDeleteHabit = document.getElementById("btn-delete-habit");
const layoutRadios = document.querySelectorAll('input[name="habit-layout"]');
const rangeRadios = document.querySelectorAll('input[name="habit-range"]');
const themeRadios = document.querySelectorAll('input[name="habit-theme"]');
const userCoinInitial = document.getElementById("user-coin-initial");
const btnUserMenu = document.getElementById("btn-user-menu");
const userMenuPanel = document.getElementById("user-menu-panel");
const userMenuApps = document.getElementById("user-menu-apps");
const btnHabitMenu = document.getElementById("btn-habit-menu");
const habitMenuPanel = document.getElementById("habit-menu-panel");
const loginThemeButtons = document.querySelectorAll(
  "[data-habits-theme-pick]",
);

const state = {
  user: null,
  habits: [],
  activeHabitId: null,
  layout: parseLayoutPref(localStorage.getItem(LAYOUT_KEY)),
  range: parseRangePref(localStorage.getItem(RANGE_KEY)),
  editingTitle: false,
  pendingHabitName: null,
  /** @type {Record<string, boolean>} `habitId:dateKey` -> desired done while write is in flight */
  pendingDoneKeys: {},
  ready: false,
};

const unsubscribers = [];
const titleRenameSkipBlur = new Set();

function persistLayoutPref(value) {
  localStorage.setItem(LAYOUT_KEY, value);
}

function persistRangePref(value) {
  localStorage.setItem(RANGE_KEY, value);
}

function readThemePref() {
  return loadSharedThemePref(localStorage);
}

function applyTheme(mode) {
  document.documentElement.dataset.habitsTheme = mode;
}

function persistThemePref(value) {
  saveSharedThemePref(value, localStorage);
}

function syncActiveHabitLocal(habitId) {
  const stored = parseStoredHabitId(habitId);
  if (stored) {
    localStorage.setItem(ACTIVE_HABIT_KEY, stored);
  } else {
    localStorage.removeItem(ACTIVE_HABIT_KEY);
  }
}

function persistHabitsActiveHabitCloud(habitId) {
  const uid = state.user?.uid;
  if (!uid) {
    return Promise.resolve();
  }
  const stored = parseStoredHabitId(habitId);
  const ref = doc(db, "prefs", uid);
  const payload = stored
    ? {
        [HABITS_ACTIVE_HABIT_FIELD]: stored,
        updatedAt: serverTimestamp(),
      }
    : {
        [HABITS_ACTIVE_HABIT_FIELD]: deleteField(),
        updatedAt: serverTimestamp(),
      };
  return setDoc(ref, payload, { merge: true }).catch((error) => {
    console.warn("Could not save habit preference.", error);
  });
}

async function loadHabitsActiveHabitPreference(uid) {
  const localId = parseStoredHabitId(localStorage.getItem(ACTIVE_HABIT_KEY));
  let cloudRaw = null;
  try {
    const snap = await getDoc(doc(db, "prefs", uid));
    if (snap.exists()) {
      cloudRaw = snap.data()[HABITS_ACTIVE_HABIT_FIELD];
    }
  } catch (error) {
    console.warn("Could not load habit preference.", error);
    return preferCloudSelectionId({ cloud: null, local: localId });
  }
  if (
    shouldMigrateLocalSelectionToCloud({ cloud: cloudRaw, local: localId })
  ) {
    void persistHabitsActiveHabitCloud(localId);
  }
  return preferCloudSelectionId({ cloud: cloudRaw, local: localId });
}

function rememberActiveHabitId(habitId) {
  syncActiveHabitLocal(habitId);
  void persistHabitsActiveHabitCloud(habitId);
}

function setActiveHabitId(habitId, { persist = true } = {}) {
  state.activeHabitId = parseStoredHabitId(habitId);
  if (persist) {
    rememberActiveHabitId(state.activeHabitId);
  } else {
    syncActiveHabitLocal(state.activeHabitId);
  }
}

function applyCloudHabitsActivePref(cloudRaw) {
  const cloudId = parseStoredHabitId(cloudRaw);
  if (!cloudId || cloudId === state.activeHabitId) {
    return;
  }
  if (state.habits.some((h) => h.id === cloudId)) {
    setActiveHabitId(cloudId, { persist: false });
    return;
  }
  if (!state.habits.length) {
    state.activeHabitId = cloudId;
    syncActiveHabitLocal(cloudId);
  }
}

function subscribeUserPrefs(uid) {
  const prefRef = doc(db, "prefs", uid);
  const unsub = onSnapshot(
    prefRef,
    (snap) => {
      if (!snap.exists()) {
        return;
      }
      applyCloudHabitsActivePref(snap.data()[HABITS_ACTIVE_HABIT_FIELD]);
    },
    (error) => {
      console.warn("Could not subscribe to habit preferences.", error);
    },
  );
  unsubscribers.push(unsub);
}

function syncThemeRadios() {
  const mode = readThemePref();
  for (const radio of themeRadios) {
    radio.checked = radio.value === mode;
  }
  for (const btn of loginThemeButtons) {
    const pressed = btn.getAttribute("data-habits-theme-pick") === mode;
    btn.setAttribute("aria-pressed", pressed ? "true" : "false");
    btn.classList.toggle("login__theme-btn--active", pressed);
  }
}

function closeUserMenu() {
  if (!userMenuPanel) {
    return;
  }
  userMenuPanel.hidden = true;
  btnUserMenu?.setAttribute("aria-expanded", "false");
}

function renderUserMenuApps(accessDoc, currentAppId) {
  if (!userMenuApps) {
    return;
  }
  userMenuApps.replaceChildren();
  for (const link of userMenuAppLinks(accessDoc)) {
    const anchor = document.createElement("a");
    anchor.href = link.href;
    anchor.className = "user-menu__link";
    anchor.textContent = link.title;
    if (link.id === currentAppId) {
      anchor.setAttribute("aria-current", "page");
    }
    userMenuApps.appendChild(anchor);
  }
}

function closeHabitMenu() {
  if (!habitMenuPanel) {
    return;
  }
  habitMenuPanel.hidden = true;
  btnHabitMenu?.setAttribute("aria-expanded", "false");
}

function closeAllMenus() {
  closeUserMenu();
  closeHabitMenu();
}

function toggleUserMenu() {
  const willOpen = userMenuPanel.hidden;
  closeAllMenus();
  if (willOpen) {
    userMenuPanel.hidden = false;
    btnUserMenu.setAttribute("aria-expanded", "true");
  }
}

function toggleHabitMenu() {
  const willOpen = habitMenuPanel.hidden;
  closeAllMenus();
  if (willOpen) {
    habitMenuPanel.hidden = false;
    btnHabitMenu.setAttribute("aria-expanded", "true");
  }
}

function setThemeFromUI(mode) {
  const next = saveSharedThemePref(mode, localStorage);
  applyTheme(next);
  syncThemeRadios();
}

function hideAllViews() {
  viewLogin.hidden = true;
  viewApp.hidden = true;
  viewNotFound.hidden = true;
}

function showLogin() {
  hideAllViews();
  viewLogin.hidden = false;
}

function showNotFound() {
  hideAllViews();
  viewNotFound.hidden = false;
}

function showApp() {
  hideAllViews();
  viewApp.hidden = false;
}

async function loadAccessDoc(user) {
  const emailKey = accessDocIdForEmail(user.email || "");
  if (!emailKey) {
    return null;
  }
  const snap = await getDoc(doc(db, "access", emailKey));
  return snap.exists() ? snap.data() : null;
}

async function maybeBindAccessUid(user, accessDoc) {
  const emailKey = accessDocIdForEmail(user.email || "");
  const bind = bindUidWrite({ accessDoc, uid: user.uid });
  if (!bind.ok || !bind.patch) {
    return accessDoc;
  }
  await updateDoc(doc(db, "access", emailKey), {
    ...bind.patch,
    updatedAt: serverTimestamp(),
  });
  const snap = await getDoc(doc(db, "access", emailKey));
  return snap.data();
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

function getActiveHabit() {
  return state.habits.find((h) => h.id === state.activeHabitId) ?? null;
}

function sortHabits(habits) {
  return [...habits].sort((a, b) => a.name.localeCompare(b.name));
}

function syncViewPrefsToUI() {
  for (const radio of layoutRadios) {
    radio.checked = radio.value === state.layout;
  }
  for (const radio of rangeRadios) {
    radio.checked = radio.value === state.range;
  }
}

function todayKey() {
  return toDateKey(new Date());
}

function dayKeysForView() {
  return dayKeysForRange(state.range, new Date());
}

function isDayDone(dateKey) {
  return isDayDoneForHabit({
    habit: getActiveHabit(),
    dateKey,
    pendingDoneKeys: state.pendingDoneKeys,
  });
}

function reconcilePendingDoneKeys(habit) {
  state.pendingDoneKeys = reconcilePendingDoneKeysPure(
    habit,
    state.pendingDoneKeys,
  );
}

function renderHabitNav() {
  habitNavEl.textContent = "";
  for (const habit of sortHabits(state.habits)) {
    const li = document.createElement("li");
    li.className = "list-nav__item";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "list-nav__button";
    btn.textContent = habit.name;
    btn.setAttribute(
      "aria-current",
      habit.id === state.activeHabitId ? "true" : "false",
    );
    btn.addEventListener("click", () => {
      selectHabit(habit.id);
    });
    li.appendChild(btn);
    habitNavEl.appendChild(li);
  }
}

function habitTitleDisplay(habit) {
  if (typeof state.pendingHabitName === "string") {
    return state.pendingHabitName;
  }
  return habit.name;
}

function renderHabitTitle() {
  const habit = getActiveHabit();
  habitTitleRegion.textContent = "";
  if (!habit) {
    return;
  }

  if (state.editingTitle) {
    const input = document.createElement("input");
    input.type = "text";
    input.className = "habit-title__input";
    input.value = habitTitleDisplay(habit);
    input.setAttribute("aria-label", "Habit name");
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        void commitHabitTitle(input.value, habit);
      }
      if (event.key === "Escape") {
        state.editingTitle = false;
        renderHabitTitle();
      }
    });
    input.addEventListener("blur", () => {
      if (titleRenameSkipBlur.has(habit.id)) {
        titleRenameSkipBlur.delete(habit.id);
        return;
      }
      void commitHabitTitle(input.value, habit);
    });
    habitTitleRegion.appendChild(input);
    input.focus();
    input.select();
    return;
  }

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "habit-title__button";
  btn.textContent = habitTitleDisplay(habit);
  btn.addEventListener("click", () => {
    state.editingTitle = true;
    renderHabitTitle();
  });
  habitTitleRegion.appendChild(btn);
}

async function commitHabitTitle(raw, habit) {
  const name = String(raw).trim();
  state.editingTitle = false;
  if (name === "") {
    setAppMessage("Habit name cannot be empty.");
    renderHabitTitle();
    return;
  }
  if (name === habit.name) {
    setAppMessage("");
    renderHabitTitle();
    return;
  }
  state.pendingHabitName = name;
  renderHabitTitle();
  setAppMessage("");
  try {
    await updateDoc(doc(db, "habits", habit.id), {
      name,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    state.pendingHabitName = null;
    setAppMessage(error.message || "Could not rename habit.");
    renderHabitTitle();
  }
}

function renderColorInputs() {
  const habit = getActiveHabit();
  if (!habit) {
    return;
  }
  inputDoneColor.value = habit.doneColor || DEFAULT_DONE_COLOR;
  inputUndoneColor.value = habit.undoneColor || DEFAULT_UNDONE_COLOR;
  inputTodayOutlineColor.value =
    habit.todayOutlineColor || DEFAULT_TODAY_OUTLINE_COLOR;
}

function renderMainVisibility() {
  const hasActive = Boolean(getActiveHabit());
  habitMainEl.hidden = !hasActive;
  habitEmptyEl.hidden = hasActive;
}

function renderGrid() {
  const habit = getActiveHabit();
  if (!habit) {
    habitGridEl.textContent = "";
    return;
  }

  const keys = dayKeysForView();
  const tKey = todayKey();
  const doneColor = habit.doneColor || DEFAULT_DONE_COLOR;
  const undoneColor = habit.undoneColor || DEFAULT_UNDONE_COLOR;
  const todayOutlineColor =
    habit.todayOutlineColor || DEFAULT_TODAY_OUTLINE_COLOR;

  const isWeek = state.layout === "week";
  habitGridEl.classList.toggle("habit-grid--week", isWeek);
  habitGridEl.classList.toggle("habit-grid--wrap", !isWeek);
  habitWeekdaysEl.hidden = !isWeek;

  const cells = isWeek
    ? weekGridCells(keys, { weekStartsOn: 0, todayKey: tKey })
    : wrapSequence(keys, { todayKey: tKey });

  habitGridEl.textContent = "";
  for (const cell of cells) {
    if (cell.type === "empty") {
      const spacer = document.createElement("span");
      spacer.className = "habit-dot habit-dot--empty";
      spacer.setAttribute("aria-hidden", "true");
      habitGridEl.appendChild(spacer);
      continue;
    }

    const done = isDayDone(cell.dateKey);
    const dot = document.createElement("button");
    dot.type = "button";
    dot.className = "habit-dot";
    dot.title = cell.dateKey;
    dot.style.backgroundColor = done ? doneColor : undoneColor;
    if (cell.dateKey === tKey) {
      dot.classList.add("habit-dot--today");
      dot.style.setProperty("--habit-dot-today-outline", todayOutlineColor);
    }
    if (cell.future) {
      dot.classList.add("habit-dot--future");
      dot.disabled = true;
    } else {
      dot.addEventListener("click", () => {
        void toggleDay(habit.id, cell.dateKey, isDayDone(cell.dateKey));
      });
    }
    const todayPart = cell.dateKey === tKey ? ", today" : "";
    dot.setAttribute(
      "aria-label",
      `${cell.dateKey}${done ? ", done" : ""}${todayPart}`,
    );
    habitGridEl.appendChild(dot);
  }
}

function renderAll() {
  renderHabitNav();
  renderMainVisibility();
  const habit = getActiveHabit();
  if (habit && state.pendingHabitName === habit.name) {
    state.pendingHabitName = null;
  }
  renderHabitTitle();
  renderColorInputs();
  syncViewPrefsToUI();
  renderGrid();
}

function selectHabit(habitId) {
  if (state.activeHabitId === habitId) {
    return;
  }
  setActiveHabitId(habitId);
  state.editingTitle = false;
  state.pendingHabitName = null;
  renderAll();
}

function subscribeHabits(uid) {
  const habitsQuery = query(
    collection(db, "habits"),
    where("ownerUid", "==", uid),
  );
  const unsub = onSnapshot(
    habitsQuery,
    (snapshot) => {
      state.habits = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));
      const nextId = pickActiveHabitId({
        preferredId: state.activeHabitId,
        habits: state.habits,
      });
      if (nextId !== state.activeHabitId) {
        setActiveHabitId(nextId);
      } else {
        syncActiveHabitLocal(state.activeHabitId);
      }
      reconcilePendingDoneKeys(getActiveHabit());
      renderAll();
    },
    (error) => {
      setAppMessage(error.message || "Could not load habits.");
    },
  );
  unsubscribers.push(unsub);
}

async function createHabit() {
  if (!state.user) {
    return;
  }
  const name = window.prompt("Habit name");
  if (!name || !name.trim()) {
    return;
  }
  setAppMessage("");
  try {
    const ref = await addDoc(collection(db, "habits"), {
      name: name.trim(),
      ownerUid: state.user.uid,
      doneColor: DEFAULT_DONE_COLOR,
      undoneColor: DEFAULT_UNDONE_COLOR,
      todayOutlineColor: DEFAULT_TODAY_OUTLINE_COLOR,
      doneDayKeys: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    setActiveHabitId(ref.id);
    renderAll();
  } catch (error) {
    setAppMessage(error.message || "Could not create habit.");
  }
}

async function deleteActiveHabit() {
  const habit = getActiveHabit();
  if (!habit) {
    return;
  }
  if (!window.confirm(`Delete “${habit.name}”?`)) {
    return;
  }
  setAppMessage("");
  try {
    await deleteDoc(doc(db, "habits", habit.id));
    setActiveHabitId(null);
    renderAll();
  } catch (error) {
    setAppMessage(error.message || "Could not delete habit.");
  }
}

async function updateHabitColor(field, value) {
  const habit = getActiveHabit();
  if (!habit) {
    return;
  }
  setAppMessage("");
  try {
    await updateDoc(doc(db, "habits", habit.id), {
      [field]: value,
      updatedAt: serverTimestamp(),
    });
    renderGrid();
  } catch (error) {
    setAppMessage(error.message || "Could not save color.");
  }
}

async function toggleDay(habitId, dateKey, currentlyDone) {
  const wantDone = !currentlyDone;
  const pendingId = pendingDoneKey(habitId, dateKey);
  state.pendingDoneKeys[pendingId] = wantDone;
  renderGrid();
  setAppMessage("");
  try {
    await updateDoc(doc(db, "habits", habitId), {
      doneDayKeys: currentlyDone ? arrayRemove(dateKey) : arrayUnion(dateKey),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    delete state.pendingDoneKeys[pendingId];
    const code = error?.code ? `${error.code}: ` : "";
    setAppMessage(`${code}${error.message || "Could not update day."}`);
    renderGrid();
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
  const storedHash = sessionStorage.getItem("habits_oauth_hash");
  if (!storedHash) {
    return;
  }
  sessionStorage.removeItem("habits_oauth_hash");

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

async function startSession(user) {
  cleanupSubscriptions();
  state.user = user;
  state.ready = false;
  state.habits = [];
  state.activeHabitId = null;
  state.editingTitle = false;
  state.pendingHabitName = null;

  userLabel.textContent = user.displayName
    ? `${user.displayName} (${user.email})`
    : user.email || user.uid;
  if (userCoinInitial) {
    userCoinInitial.textContent = userCoinLetter(user);
  }

  setAppMessage("");

  try {
    let accessDoc = await loadAccessDoc(user);
    if (
      sessionView({ accessDoc, appId: "habits", seedAdmin: false }) ===
      "notFound"
    ) {
      showNotFound();
      return;
    }
    accessDoc = await maybeBindAccessUid(user, accessDoc);
    if (
      sessionView({ accessDoc, appId: "habits", seedAdmin: false }) ===
      "notFound"
    ) {
      showNotFound();
      return;
    }

    renderUserMenuApps(accessDoc, "habits");
    showApp();
    state.activeHabitId = await loadHabitsActiveHabitPreference(user.uid);
    syncActiveHabitLocal(state.activeHabitId);
    subscribeHabits(user.uid);
    subscribeUserPrefs(user.uid);
    state.ready = true;
    renderAll();
  } catch (error) {
    setAppMessage(error.message || "Could not load habits.");
  }
}

function endSession() {
  cleanupSubscriptions();
  state.user = null;
  state.habits = [];
  state.activeHabitId = null;
  state.ready = false;
  state.editingTitle = false;
  state.pendingHabitName = null;
  state.pendingDoneKeys = {};
  closeAllMenus();
  userMenuApps?.replaceChildren();
  showLogin();
}

document
  .getElementById("btn-not-found-sign-out")
  ?.addEventListener("click", async () => {
    await signOut(auth);
  });

document.getElementById("btn-sign-out").addEventListener("click", async () => {
  await signOut(auth);
});

document.getElementById("btn-new-habit").addEventListener("click", () => {
  void createHabit();
});

btnDeleteHabit.addEventListener("click", () => {
  void deleteActiveHabit();
});

inputDoneColor.addEventListener("input", () => {
  void updateHabitColor("doneColor", inputDoneColor.value);
});

inputUndoneColor.addEventListener("input", () => {
  void updateHabitColor("undoneColor", inputUndoneColor.value);
});

inputTodayOutlineColor.addEventListener("input", () => {
  void updateHabitColor("todayOutlineColor", inputTodayOutlineColor.value);
});

for (const radio of layoutRadios) {
  radio.addEventListener("change", () => {
    if (!radio.checked) {
      return;
    }
    state.layout = radio.value === "wrap" ? "wrap" : "week";
    persistLayoutPref(state.layout);
    renderGrid();
  });
}

for (const radio of rangeRadios) {
  radio.addEventListener("change", () => {
    if (!radio.checked) {
      return;
    }
    state.range = radio.value === "calendar" ? "calendar" : "rolling";
    persistRangePref(state.range);
    renderGrid();
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

for (const btn of loginThemeButtons) {
  btn.addEventListener("click", () => {
    setThemeFromUI(btn.getAttribute("data-habits-theme-pick"));
  });
}

btnUserMenu?.addEventListener("click", (event) => {
  event.stopPropagation();
  toggleUserMenu();
});

btnHabitMenu?.addEventListener("click", (event) => {
  event.stopPropagation();
  toggleHabitMenu();
});

document.addEventListener("click", (event) => {
  if (!event.target.closest(".user-menu")) {
    closeUserMenu();
  }
  if (!event.target.closest(".habit-menu")) {
    closeHabitMenu();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeAllMenus();
  }
});

applyTheme(readThemePref());
syncThemeRadios();

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
