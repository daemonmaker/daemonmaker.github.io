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
} from "./grocery-config.js";
import {
  isChecked,
  sortItems,
  parseSortDir,
  itemNameCommitAction,
  itemNameCommitUIEffect,
  itemNameDisplayAfterCommit,
  shouldCommitItemNameOnOutsidePointerDown,
  itemNameForDisplay,
  reconcilePendingItemRenames,
} from "./grocery-items.mjs";
import {
  parseSidebarTab,
  parseItemSort,
  parseStoredListId,
  pickActiveListId,
} from "./grocery-prefs.mjs";
import {
  GROCERY_ACTIVE_LIST_FIELD,
  preferCloudSelectionId,
  shouldMigrateLocalSelectionToCloud,
} from "./app-prefs.mjs";
import { matchMealItems, itemsToAdd } from "./grocery-meals.mjs";
import {
  mealEditorDeleteAction,
  draftMealPersistResult,
  parseMealName,
  mealEditorNameBlurAction,
  mealEditorTitleCommitUIEffect,
  mealIngredientNameCommitAction,
  mealIngredientNameCommitUIEffect,
  buildMealCreateFields,
  mealIngredientAddAttempt,
} from "./grocery-meal-editor.mjs";
import {
  sessionView,
  accessDocIdForEmail,
  bindUidWrite,
  userCoinLetter,
  parseThemePref,
  userMenuAppLinks,
} from "./apps-access.mjs";
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
  writeBatch,
  deleteField,
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
const OAUTH_NONCE_KEY = "grocery_google_oauth_nonce";
const THEME_KEY = "grocery_theme";
const ACTIVE_LIST_KEY = "grocery_active_list";
const SIDEBAR_TAB_COOKIE = "grocery_sidebar_tab";
const SIDEBAR_TAB_MAX_AGE_SEC = 60 * 60 * 24 * 365;
const appMessage = document.getElementById("app-message");
const userLabel = document.getElementById("user-label");
const userCoinInitial = document.getElementById("user-coin-initial");
const btnUserMenu = document.getElementById("btn-user-menu");
const userMenuPanel = document.getElementById("user-menu-panel");
const userMenuApps = document.getElementById("user-menu-apps");
const themeRadios = document.querySelectorAll('input[name="grocery-theme"]');
const loginThemeButtons = document.querySelectorAll("[data-grocery-theme-pick]");
const sidebarTabButtons = document.querySelectorAll("[data-sidebar-tab]");
const panelGrocery = document.getElementById("panel-grocery");
const panelMeals = document.getElementById("panel-meals");
const listSharedEl = document.getElementById("list-shared");
const listPersonalEl = document.getElementById("list-personal");
const listTitleRegion = document.getElementById("list-title-region");
const btnListMenu = document.getElementById("btn-list-menu");
const listMenuPanel = document.getElementById("list-menu-panel");
const itemsEl = document.getElementById("items");
const itemsEmptyEl = document.getElementById("items-empty");
const btnSetDefault = document.getElementById("btn-set-default");
const btnDeleteList = document.getElementById("btn-delete-list");
const formAddItem = document.getElementById("form-add-item");
const inputItem = document.getElementById("input-item");
const itemSortRadios = document.querySelectorAll('input[name="item-sort"]');
const itemSortDirRadios = document.querySelectorAll(
  'input[name="item-sort-dir"]',
);
const listMealsSharedEl = document.getElementById("list-meals-shared");
const listMealsPersonalEl = document.getElementById("list-meals-personal");
const ITEMS_SWIPE_WIDTH_PX = 52;
const ITEMS_SWIPE_OPEN_THRESHOLD_PX = 28;
const mealDialog = document.getElementById("meal-dialog");
const mealDialogTitleRegion = document.getElementById("meal-dialog-title-region");
const mealDialogMessage = document.getElementById("meal-dialog-message");
const mealDialogItemsEl = document.getElementById("meal-dialog-items");
const mealDialogClose = document.getElementById("meal-dialog-close");
const mealEditorDialog = document.getElementById("meal-editor-dialog");
const mealEditorNameRegion = document.getElementById("meal-editor-name-region");
const formMealIngredient = document.getElementById("form-meal-ingredient");
const inputMealIngredient = document.getElementById("input-meal-ingredient");
const mealEditorItemsEl = document.getElementById("meal-editor-items");
const btnDeleteMeal = document.getElementById("btn-delete-meal");
const mealEditorClose = document.getElementById("meal-editor-close");
const mealEditorMessage = document.getElementById("meal-editor-message");

const state = {
  user: null,
  defaultListId: null,
  activeListId: null,
  sharedLists: [],
  personalLists: [],
  sharedMeals: [],
  personalMeals: [],
  items: [],
  editingItemId: null,
  pendingItemRenames: {},
  editingListName: false,
  pendingListName: null,
  itemSort: "name",
  itemSortDir: "asc",
  openSwipeItemId: null,
  ready: false,
  sharedListsReady: false,
  personalListsReady: false,
  mealDialogMealId: null,
  mealDialogMealItems: [],
  editingMealDialogTarget: null,
  pendingMealDialogTitleRename: null,
  pendingMealDialogIngredientRenames: {},
  editingMealId: null,
  draftMealScope: null,
  draftMealTitle: "",
  mealEditorItems: [],
  editingMealEditorTarget: null,
  pendingMealTitleRename: null,
  pendingMealIngredientRenames: {},
};

const unsubscribers = [];
const itemRenameSkipBlur = new Set();
const mealEditorRenameSkipBlur = new Set();
const mealDialogRenameSkipBlur = new Set();
const listTitleRenameSkipBlur = new Set();
let itemsUnsub = null;
let mealEditorItemsUnsub = null;
let mealDialogItemsUnsub = null;

function applyTheme(mode) {
  document.documentElement.dataset.groceryTheme = mode;
}

function syncThemeRadios() {
  const mode = parseThemePref(localStorage.getItem(THEME_KEY));
  for (const radio of themeRadios) {
    radio.checked = radio.value === mode;
  }
  for (const btn of loginThemeButtons) {
    const pressed = btn.getAttribute("data-grocery-theme-pick") === mode;
    btn.setAttribute("aria-pressed", pressed ? "true" : "false");
    btn.classList.toggle("login__theme-btn--active", pressed);
  }
}

function setThemeFromUI(mode) {
  const next =
    mode === "light" || mode === "dark" || mode === "system" ? mode : "system";
  applyTheme(next);
  localStorage.setItem(THEME_KEY, next);
  syncThemeRadios();
}

function persistGroceryActiveListCloud(listId) {
  const uid = state.user?.uid;
  if (!uid) {
    return Promise.resolve();
  }
  const stored = parseStoredListId(listId);
  const ref = doc(db, "prefs", uid);
  const payload = stored
    ? {
        [GROCERY_ACTIVE_LIST_FIELD]: stored,
        updatedAt: serverTimestamp(),
      }
    : {
        [GROCERY_ACTIVE_LIST_FIELD]: deleteField(),
        updatedAt: serverTimestamp(),
      };
  return setDoc(ref, payload, { merge: true }).catch(() => {});
}

async function loadGroceryActiveListPreference(uid) {
  const localId = parseStoredListId(localStorage.getItem(ACTIVE_LIST_KEY));
  let cloudRaw = null;
  try {
    const snap = await getDoc(doc(db, "prefs", uid));
    if (snap.exists()) {
      cloudRaw = snap.data()[GROCERY_ACTIVE_LIST_FIELD];
    }
  } catch {
    return preferCloudSelectionId({ cloud: null, local: localId });
  }
  if (
    shouldMigrateLocalSelectionToCloud({ cloud: cloudRaw, local: localId })
  ) {
    void persistGroceryActiveListCloud(localId);
  }
  return preferCloudSelectionId({ cloud: cloudRaw, local: localId });
}

function rememberActiveListId(listId) {
  const stored = parseStoredListId(listId);
  if (stored) {
    localStorage.setItem(ACTIVE_LIST_KEY, stored);
  } else {
    localStorage.removeItem(ACTIVE_LIST_KEY);
  }
  void persistGroceryActiveListCloud(stored);
}

function setActiveListId(listId, { resubscribe = true } = {}) {
  const next = parseStoredListId(listId);
  const changed = state.activeListId !== next;
  state.activeListId = next;
  rememberActiveListId(next);
  if (changed && resubscribe) {
    subscribeItems();
  }
}

function readCookie(name) {
  const prefix = `${encodeURIComponent(name)}=`;
  const parts = document.cookie ? document.cookie.split("; ") : [];
  for (const part of parts) {
    if (part.startsWith(prefix)) {
      return decodeURIComponent(part.slice(prefix.length));
    }
  }
  return null;
}

function writeCookie(name, value, maxAgeSeconds) {
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(
    value,
  )}; path=/; max-age=${maxAgeSeconds}; SameSite=Lax`;
}

function applySidebarTab(tab) {
  const next = parseSidebarTab(tab);
  const showMeals = next === "meals";
  if (panelGrocery) {
    panelGrocery.hidden = showMeals;
  }
  if (panelMeals) {
    panelMeals.hidden = !showMeals;
  }
  for (const button of sidebarTabButtons) {
    const selected = button.getAttribute("data-sidebar-tab") === next;
    button.setAttribute("aria-selected", selected ? "true" : "false");
    button.tabIndex = selected ? 0 : -1;
  }
  writeCookie(SIDEBAR_TAB_COOKIE, next, SIDEBAR_TAB_MAX_AGE_SEC);
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

function closeListMenu() {
  if (!listMenuPanel) {
    return;
  }
  listMenuPanel.hidden = true;
  btnListMenu?.setAttribute("aria-expanded", "false");
}

function closeAllMenus() {
  closeUserMenu();
  closeListMenu();
}

function toggleUserMenu() {
  const willOpen = Boolean(userMenuPanel?.hidden);
  closeAllMenus();
  if (willOpen && userMenuPanel) {
    userMenuPanel.hidden = false;
    btnUserMenu?.setAttribute("aria-expanded", "true");
  }
}

function toggleListMenu() {
  const willOpen = Boolean(listMenuPanel?.hidden);
  closeAllMenus();
  if (willOpen && listMenuPanel) {
    listMenuPanel.hidden = false;
    btnListMenu?.setAttribute("aria-expanded", "true");
  }
}

function clearListNameEdit() {
  state.editingListName = false;
  state.pendingListName = null;
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

function showApp() {
  hideAllViews();
  viewApp.hidden = false;
  viewApp.inert = false;
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

function setMealEditorMessage(message) {
  if (!mealEditorMessage) {
    return;
  }
  if (!message) {
    mealEditorMessage.hidden = true;
    mealEditorMessage.textContent = "";
    return;
  }
  mealEditorMessage.hidden = false;
  mealEditorMessage.textContent = message;
}

function focusMealEditorField(focusField) {
  if (focusField === "meal_name") {
    void startMealTitleEdit();
    return;
  }
  if (focusField === "ingredient") {
    inputMealIngredient.focus();
  }
}

function cleanupSubscriptions() {
  if (itemsUnsub) {
    itemsUnsub();
    itemsUnsub = null;
  }
  if (mealEditorItemsUnsub) {
    mealEditorItemsUnsub();
    mealEditorItemsUnsub = null;
  }
  if (mealDialogItemsUnsub) {
    mealDialogItemsUnsub();
    mealDialogItemsUnsub = null;
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

function getMealById(id) {
  return (
    state.sharedMeals.find((meal) => meal.id === id) ||
    state.personalMeals.find((meal) => meal.id === id) ||
    null
  );
}

function sortLists(lists) {
  return [...lists].sort((a, b) => a.name.localeCompare(b.name));
}

function sortMeals(meals) {
  return sortLists(meals);
}

async function readDocOrMissing(ref) {
  try {
    return await getDoc(ref);
  } catch (error) {
    if (error?.code === "permission-denied") {
      return null;
    }
    throw error;
  }
}

async function ensureBootstrap() {
  const bootstrapRef = doc(db, "lists", BOOTSTRAP_LIST_ID);
  const bootstrapSnap = await readDocOrMissing(bootstrapRef);

  if (!bootstrapSnap?.exists()) {
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
    const defaultListSnap = await readDocOrMissing(doc(db, "lists", defaultId));
    defaultIsValid =
      !!defaultListSnap?.exists() &&
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
    empty.className = "list-nav__item list-nav__item--empty";
    empty.textContent = emptyLabel;
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
      if (state.activeListId !== list.id) {
        clearListNameEdit();
        closeListMenu();
        closeOpenItemSwipe({ animate: false });
      }
      setActiveListId(list.id);
      renderAll();
    });

    li.appendChild(button);
    container.appendChild(li);
  }
}

function renderMealNav(container, meals, emptyLabel) {
  container.replaceChildren();
  if (!meals.length) {
    const empty = document.createElement("li");
    empty.className = "list-nav__item list-nav__item--empty";
    empty.textContent = emptyLabel;
    container.appendChild(empty);
    return;
  }

  for (const meal of meals) {
    const li = document.createElement("li");
    li.className = "list-nav__item list-nav__item--meal";

    const row = document.createElement("div");
    row.className = "list-nav__meal-row";

    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "list-nav__button list-nav__button--meal";
    addBtn.textContent = meal.name;
    addBtn.addEventListener("click", () => {
      addMealToList(meal.id);
    });

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "btn btn--text list-nav__edit-meal";
    editBtn.textContent = "Edit";
    editBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      openMealEditor(meal.id);
    });

    row.appendChild(addBtn);
    row.appendChild(editBtn);
    li.appendChild(row);
    container.appendChild(li);
  }
}

const MEAL_DIALOG_TITLE_KEY = "title";
const MEAL_EDITOR_TITLE_KEY = "title";

function setMealDialogMessage(message) {
  if (!mealDialogMessage) {
    return;
  }
  if (!message) {
    mealDialogMessage.hidden = true;
    mealDialogMessage.textContent = "";
    return;
  }
  mealDialogMessage.hidden = false;
  mealDialogMessage.textContent = message;
}

function clearMealDialogEditState() {
  state.editingMealDialogTarget = null;
  state.pendingMealDialogTitleRename = null;
  state.pendingMealDialogIngredientRenames = {};
}

function reconcileMealDialogTitlePending() {
  if (!state.pendingMealDialogTitleRename || !state.mealDialogMealId) {
    return;
  }
  const meal = getMealById(state.mealDialogMealId);
  if (meal?.name === state.pendingMealDialogTitleRename) {
    state.pendingMealDialogTitleRename = null;
  }
}

function getMealDialogStoredTitle() {
  if (!state.mealDialogMealId) {
    return "";
  }
  return getMealById(state.mealDialogMealId)?.name ?? "";
}

function getMealDialogTitleDisplayName() {
  const stored = getMealDialogStoredTitle();
  const display = itemNameForDisplay(stored, state.pendingMealDialogTitleRename);
  return display === "" ? null : display;
}

function getActiveMealDialogInlineInput() {
  if (!state.editingMealDialogTarget) {
    return null;
  }
  if (state.editingMealDialogTarget === MEAL_DIALOG_TITLE_KEY) {
    return mealDialogTitleRegion.querySelector(".meal-editor__name-input");
  }
  return mealDialogItemsEl.querySelector(
    `input.items__name-input[data-item-id="${state.editingMealDialogTarget}"]`,
  );
}

async function commitActiveMealDialogEdit() {
  if (state.editingMealDialogTarget === MEAL_DIALOG_TITLE_KEY) {
    await commitMealDialogTitleEdit();
    return;
  }
  if (state.editingMealDialogTarget) {
    await commitMealDialogIngredientEdit(state.editingMealDialogTarget);
  }
}

async function startMealDialogTitleEdit() {
  await commitActiveMealDialogEdit();
  state.editingMealDialogTarget = MEAL_DIALOG_TITLE_KEY;
  renderMealDialog();
  const input = mealDialogTitleRegion.querySelector(".meal-editor__name-input");
  if (input) {
    input.focus();
    input.select();
  }
}

function cancelMealDialogTitleEdit() {
  mealDialogRenameSkipBlur.add(MEAL_DIALOG_TITLE_KEY);
  state.editingMealDialogTarget = null;
  renderMealDialog();
}

async function startMealDialogIngredientEdit(itemId) {
  await commitActiveMealDialogEdit();
  state.editingMealDialogTarget = itemId;
  renderMealDialog();
  const input = mealDialogItemsEl.querySelector(
    `input.items__name-input[data-item-id="${itemId}"]`,
  );
  if (input) {
    input.focus();
    input.select();
  }
}

function cancelMealDialogIngredientEdit(itemId) {
  mealDialogRenameSkipBlur.add(itemId);
  state.editingMealDialogTarget = null;
  renderMealDialog();
}

async function commitMealDialogTitleEdit() {
  if (state.editingMealDialogTarget !== MEAL_DIALOG_TITLE_KEY) {
    return;
  }
  const mealId = state.mealDialogMealId;
  if (!mealId) {
    state.editingMealDialogTarget = null;
    renderMealDialog();
    return;
  }

  const input = mealDialogTitleRegion.querySelector(".meal-editor__name-input");
  if (!input) {
    state.editingMealDialogTarget = null;
    renderMealDialog();
    return;
  }

  const meal = getMealById(mealId);
  const action = mealEditorNameBlurAction({
    editingMealId: mealId,
    draftMealScope: null,
    nameInput: input.value,
    existingMealName: meal?.name ?? null,
  });
  const effect = mealEditorTitleCommitUIEffect(action);
  const previousTitle = getMealDialogStoredTitle();

  state.editingMealDialogTarget = null;
  setMealDialogMessage(effect.userMessage ?? "");

  if (action.type === "reject_empty") {
    renderMealDialog();
    return;
  }

  if (effect.mealFirestoreName) {
    state.pendingMealDialogTitleRename = effect.mealFirestoreName;
    if (meal) {
      meal.name = effect.mealFirestoreName;
    }
  }

  renderMealDialog();

  if (!effect.mealFirestoreName || !meal) {
    return;
  }

  try {
    await updateDoc(doc(db, "meals", mealId), {
      name: effect.mealFirestoreName,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    state.pendingMealDialogTitleRename = null;
    meal.name = previousTitle;
    setMealDialogMessage(error.message || "Could not rename meal.");
    renderMealDialog();
  }
}

async function commitMealDialogIngredientEdit(itemId) {
  if (state.editingMealDialogTarget !== itemId) {
    return;
  }
  const mealId = state.mealDialogMealId;
  if (!mealId) {
    state.editingMealDialogTarget = null;
    renderMealDialog();
    return;
  }

  const item = state.mealDialogMealItems.find((entry) => entry.id === itemId);
  if (!item) {
    state.editingMealDialogTarget = null;
    renderMealDialog();
    return;
  }

  const input = mealDialogItemsEl.querySelector(
    `input.items__name-input[data-item-id="${itemId}"]`,
  );
  if (!input) {
    state.editingMealDialogTarget = null;
    renderMealDialog();
    return;
  }

  const action = mealIngredientNameCommitAction({
    nameInput: input.value,
    existingName: item.name,
    items: state.mealDialogMealItems,
    editingItemId: itemId,
  });
  const effect = mealIngredientNameCommitUIEffect(action);
  const previousName = item.name;

  state.editingMealDialogTarget = null;
  item.name = itemNameDisplayAfterCommit(action, previousName);
  setMealDialogMessage(effect.userMessage ?? "");
  renderMealDialog();

  if (!effect.firestoreName) {
    return;
  }

  state.pendingMealDialogIngredientRenames[itemId] = effect.firestoreName;
  renderMealDialog();

  try {
    await updateDoc(doc(db, "meals", mealId, "items", itemId), {
      name: effect.firestoreName,
    });
  } catch (error) {
    delete state.pendingMealDialogIngredientRenames[itemId];
    item.name = previousName;
    setMealDialogMessage(error.message || "Could not rename ingredient.");
    renderMealDialog();
  }
}

function bindMealDialogInlineInput(input, blurKey, onCommit, onCancel) {
  bindInlineNameInput(input, {
    skipBlurSet: mealDialogRenameSkipBlur,
    blurKey,
    onCommit,
    onCancel,
  });
}

function mealDialogNameButtonClass(row) {
  const checked = row.onList && row.checked;
  let className = checked ? "items__name items__name--done" : "items__name";
  if (!row.onList) {
    className += " items__name--pending";
  }
  return className;
}

function renderMealDialogTitle() {
  reconcileMealDialogTitlePending();
  const isEditing = state.editingMealDialogTarget === MEAL_DIALOG_TITLE_KEY;
  const displayName = getMealDialogTitleDisplayName();

  let nameBtn = mealDialogTitleRegion.querySelector("button.meal-editor__name");
  let nameInput = mealDialogTitleRegion.querySelector(".meal-editor__name-input");

  if (isEditing) {
    if (nameBtn) {
      nameBtn.remove();
    }
    if (!nameInput) {
      nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.className = "meal-editor__name-input";
      nameInput.setAttribute("aria-label", "Meal name");
      nameInput.value = displayName ?? "";
      bindMealDialogInlineInput(
        nameInput,
        MEAL_DIALOG_TITLE_KEY,
        () => commitMealDialogTitleEdit(),
        () => cancelMealDialogTitleEdit(),
      );
      mealDialogTitleRegion.appendChild(nameInput);
    }
  } else {
    if (nameInput) {
      nameInput.remove();
    }
    if (!nameBtn) {
      nameBtn = document.createElement("button");
      nameBtn.type = "button";
      nameBtn.addEventListener("click", () => {
        void startMealDialogTitleEdit();
      });
      mealDialogTitleRegion.appendChild(nameBtn);
    }
    nameBtn.className = "meal-editor__name";
    nameBtn.textContent = displayName ?? "Meal";
  }
}

function renderMealDialogItems() {
  const rows = matchMealItems(state.mealDialogMealItems, state.items);
  const existingById = new Map();
  for (const child of mealDialogItemsEl.children) {
    if (child.dataset.itemId) {
      existingById.set(child.dataset.itemId, child);
    }
  }

  const nextIds = new Set();

  for (const row of rows) {
    if (!row.id) {
      continue;
    }
    nextIds.add(row.id);
    const isEditing = state.editingMealDialogTarget === row.id;
    const displayName = itemNameForDisplay(
      row.name,
      state.pendingMealDialogIngredientRenames[row.id],
    );
    const checked = row.onList && row.checked;
    const disabled = !row.onList;

    let li = existingById.get(row.id);
    if (!li) {
      li = document.createElement("li");
      li.className = "items__row";
      li.dataset.itemId = row.id;
      mealDialogItemsEl.appendChild(li);

      const check = document.createElement("input");
      check.type = "checkbox";
      check.className = "items__check";
      check.addEventListener("change", () => {
        const match = matchMealItems(state.mealDialogMealItems, state.items).find(
          (entry) => entry.id === row.id,
        );
        if (match?.groceryItem?.id) {
          toggleItem(match.groceryItem.id);
        }
      });
      li.appendChild(check);
    }

    const check = li.querySelector(".items__check");
    if (document.activeElement !== check) {
      check.checked = checked;
      check.disabled = disabled;
      check.setAttribute("aria-label", displayName);
    }

    let nameBtn = li.querySelector("button.items__name");
    let nameInput = li.querySelector("input.items__name-input");

    if (isEditing) {
      if (nameBtn) {
        nameBtn.remove();
      }
      if (!nameInput) {
        nameInput = document.createElement("input");
        nameInput.type = "text";
        nameInput.className = "items__name-input";
        nameInput.dataset.itemId = row.id;
        nameInput.setAttribute("aria-label", "Ingredient name");
        nameInput.value = displayName;
        bindMealDialogInlineInput(
          nameInput,
          row.id,
          () => commitMealDialogIngredientEdit(row.id),
          () => cancelMealDialogIngredientEdit(row.id),
        );
        li.appendChild(nameInput);
      }
    } else {
      if (nameInput) {
        nameInput.remove();
      }
      if (!nameBtn) {
        nameBtn = document.createElement("button");
        nameBtn.type = "button";
        nameBtn.addEventListener("click", () => {
          void startMealDialogIngredientEdit(row.id);
        });
        li.appendChild(nameBtn);
      }
      nameBtn.className = mealDialogNameButtonClass(row);
      nameBtn.textContent = displayName;
    }
  }

  for (const [itemId, li] of existingById) {
    if (!nextIds.has(itemId)) {
      li.remove();
    }
  }

  if (!state.editingMealDialogTarget) {
    for (const row of rows) {
      if (!row.id) {
        continue;
      }
      const li = mealDialogItemsEl.querySelector(`li[data-item-id="${row.id}"]`);
      if (li) {
        mealDialogItemsEl.appendChild(li);
      }
    }
  }
}

function renderMealDialog() {
  if (!state.mealDialogMealId || !mealDialog.open) {
    return;
  }
  renderMealDialogTitle();
  renderMealDialogItems();
}

function subscribeMealDialogItems(mealId) {
  if (mealDialogItemsUnsub) {
    mealDialogItemsUnsub();
    mealDialogItemsUnsub = null;
  }

  if (!mealId) {
    state.mealDialogMealItems = [];
    state.editingMealDialogTarget = null;
    state.pendingMealDialogIngredientRenames = {};
    renderMealDialog();
    return;
  }

  state.editingMealDialogTarget = null;
  state.pendingMealDialogIngredientRenames = {};

  const itemsQuery = query(
    collection(db, "meals", mealId, "items"),
    orderBy("createdAt", "asc"),
  );

  mealDialogItemsUnsub = onSnapshot(itemsQuery, (snap) => {
    state.mealDialogMealItems = snap.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    }));
    state.pendingMealDialogIngredientRenames = reconcilePendingItemRenames(
      state.pendingMealDialogIngredientRenames,
      state.mealDialogMealItems,
    );
    renderMealDialog();
  });
}


function clearMealEditorEditState() {
  state.editingMealEditorTarget = null;
  state.pendingMealTitleRename = null;
  state.pendingMealIngredientRenames = {};
}

function reconcileMealTitlePending() {
  if (!state.pendingMealTitleRename || !state.editingMealId) {
    return;
  }
  const meal = getMealById(state.editingMealId);
  if (meal?.name === state.pendingMealTitleRename) {
    state.pendingMealTitleRename = null;
  }
}

function getMealEditorStoredTitle() {
  if (state.editingMealId) {
    return getMealById(state.editingMealId)?.name ?? "";
  }
  if (state.draftMealScope) {
    return state.draftMealTitle;
  }
  return "";
}

function getMealEditorTitleDisplayName() {
  const stored = getMealEditorStoredTitle();
  const display = itemNameForDisplay(stored, state.pendingMealTitleRename);
  return display === "" ? null : display;
}

function getMealEditorTitleValue() {
  if (state.editingMealEditorTarget === MEAL_EDITOR_TITLE_KEY) {
    const input = mealEditorNameRegion.querySelector(".meal-editor__name-input");
    if (input) {
      return input.value;
    }
  }
  if (state.pendingMealTitleRename !== null) {
    return state.pendingMealTitleRename;
  }
  return getMealEditorStoredTitle();
}

function getActiveMealEditorInlineInput() {
  if (!state.editingMealEditorTarget) {
    return null;
  }
  if (state.editingMealEditorTarget === MEAL_EDITOR_TITLE_KEY) {
    return mealEditorNameRegion.querySelector(".meal-editor__name-input");
  }
  return mealEditorItemsEl.querySelector(
    `input.items__name-input[data-item-id="${state.editingMealEditorTarget}"]`,
  );
}

async function commitActiveMealEditorEdit() {
  if (state.editingMealEditorTarget === MEAL_EDITOR_TITLE_KEY) {
    await commitMealTitleEdit();
    return;
  }
  if (state.editingMealEditorTarget) {
    await commitMealIngredientEdit(state.editingMealEditorTarget);
  }
}

async function startMealTitleEdit() {
  await commitActiveMealEditorEdit();
  state.editingMealEditorTarget = MEAL_EDITOR_TITLE_KEY;
  renderMealEditor();
  const input = mealEditorNameRegion.querySelector(".meal-editor__name-input");
  if (input) {
    input.focus();
    input.select();
  }
}

function cancelMealTitleEdit() {
  mealEditorRenameSkipBlur.add(MEAL_EDITOR_TITLE_KEY);
  state.editingMealEditorTarget = null;
  renderMealEditor();
}

async function startMealIngredientEdit(itemId) {
  await commitActiveMealEditorEdit();
  state.editingMealEditorTarget = itemId;
  renderMealEditor();
  const input = mealEditorItemsEl.querySelector(
    `input.items__name-input[data-item-id="${itemId}"]`,
  );
  if (input) {
    input.focus();
    input.select();
  }
}

function cancelMealIngredientEdit(itemId) {
  mealEditorRenameSkipBlur.add(itemId);
  state.editingMealEditorTarget = null;
  renderMealEditor();
}

async function commitMealTitleEdit() {
  if (state.editingMealEditorTarget !== MEAL_EDITOR_TITLE_KEY) {
    return;
  }

  const input = mealEditorNameRegion.querySelector(".meal-editor__name-input");
  if (!input) {
    state.editingMealEditorTarget = null;
    renderMealEditor();
    return;
  }

  const meal = state.editingMealId ? getMealById(state.editingMealId) : null;
  const action = mealEditorNameBlurAction({
    editingMealId: state.editingMealId,
    draftMealScope: state.draftMealScope,
    nameInput: input.value,
    existingMealName: meal?.name ?? null,
  });
  const effect = mealEditorTitleCommitUIEffect(action);
  const previousTitle = getMealEditorStoredTitle();

  state.editingMealEditorTarget = null;
  setMealEditorMessage(effect.userMessage ?? "");

  if (action.type === "reject_empty") {
    renderMealEditor();
    return;
  }

  if (effect.persistDraft) {
    const parsed = parseMealName(input.value);
    if (parsed) {
      state.draftMealTitle = parsed;
    }
    renderMealEditor();
    await persistDraftMeal();
    renderMealEditor();
    return;
  }

  if (effect.mealFirestoreName) {
    state.pendingMealTitleRename = effect.mealFirestoreName;
    if (meal) {
      meal.name = effect.mealFirestoreName;
    }
  } else if (action.type === "noop") {
    /* keep stored title */
  }

  renderMealEditor();

  if (!effect.mealFirestoreName || !state.editingMealId || !meal) {
    return;
  }

  try {
    await updateDoc(doc(db, "meals", state.editingMealId), {
      name: effect.mealFirestoreName,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    state.pendingMealTitleRename = null;
    meal.name = previousTitle;
    setMealEditorMessage(error.message || "Could not rename meal.");
    renderMealEditor();
  }
}

async function commitMealIngredientEdit(itemId) {
  if (state.editingMealEditorTarget !== itemId) {
    return;
  }

  const mealId = state.editingMealId;
  if (!mealId) {
    state.editingMealEditorTarget = null;
    renderMealEditor();
    return;
  }

  const item = state.mealEditorItems.find((entry) => entry.id === itemId);
  if (!item) {
    state.editingMealEditorTarget = null;
    renderMealEditor();
    return;
  }

  const input = mealEditorItemsEl.querySelector(
    `input.items__name-input[data-item-id="${itemId}"]`,
  );
  if (!input) {
    state.editingMealEditorTarget = null;
    renderMealEditor();
    return;
  }

  const action = mealIngredientNameCommitAction({
    nameInput: input.value,
    existingName: item.name,
    items: state.mealEditorItems,
    editingItemId: itemId,
  });
  const effect = mealIngredientNameCommitUIEffect(action);
  const previousName = item.name;

  state.editingMealEditorTarget = null;
  item.name = itemNameDisplayAfterCommit(action, previousName);
  setMealEditorMessage(effect.userMessage ?? "");
  renderMealEditor();

  if (!effect.firestoreName) {
    return;
  }

  state.pendingMealIngredientRenames[itemId] = effect.firestoreName;
  renderMealEditor();

  try {
    await updateDoc(doc(db, "meals", mealId, "items", itemId), {
      name: effect.firestoreName,
    });
  } catch (error) {
    delete state.pendingMealIngredientRenames[itemId];
    item.name = previousName;
    setMealEditorMessage(error.message || "Could not rename ingredient.");
    renderMealEditor();
  }
}

function bindMealEditorInlineInput(input, blurKey, onCommit, onCancel) {
  bindInlineNameInput(input, {
    skipBlurSet: mealEditorRenameSkipBlur,
    blurKey,
    onCommit,
    onCancel,
  });
}

function renderMealEditorTitle() {
  reconcileMealTitlePending();
  const isEditing = state.editingMealEditorTarget === MEAL_EDITOR_TITLE_KEY;
  const displayName = getMealEditorTitleDisplayName();
  const placeholder = displayName === null;

  let nameBtn = mealEditorNameRegion.querySelector("button.meal-editor__name");
  let nameInput = mealEditorNameRegion.querySelector(".meal-editor__name-input");

  if (isEditing) {
    if (nameBtn) {
      nameBtn.remove();
    }
    if (!nameInput) {
      nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.className = "meal-editor__name-input";
      nameInput.setAttribute("aria-label", "Meal name");
      nameInput.placeholder = "Meal name";
      nameInput.value = displayName ?? "";
      bindMealEditorInlineInput(
        nameInput,
        MEAL_EDITOR_TITLE_KEY,
        () => commitMealTitleEdit(),
        () => cancelMealTitleEdit(),
      );
      mealEditorNameRegion.appendChild(nameInput);
    }
  } else {
    if (nameInput) {
      nameInput.remove();
    }
    if (!nameBtn) {
      nameBtn = document.createElement("button");
      nameBtn.type = "button";
      nameBtn.addEventListener("click", () => {
        void startMealTitleEdit();
      });
      mealEditorNameRegion.appendChild(nameBtn);
    }
    nameBtn.className = placeholder
      ? "meal-editor__name meal-editor__name--placeholder"
      : "meal-editor__name";
    nameBtn.textContent = displayName ?? "Meal name";
  }
}

function ensureMealIngredientRowControls(li, item) {
  let removeBtn = li.querySelector(".items__remove");
  if (!removeBtn) {
    removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "btn btn--ghost items__remove";
    removeBtn.textContent = "Remove";
    removeBtn.addEventListener("click", () => removeMealIngredient(item.id));
    li.appendChild(removeBtn);
  }
}

function renderMealEditorItems() {
  const existingById = new Map();
  for (const child of mealEditorItemsEl.children) {
    if (child.dataset.itemId) {
      existingById.set(child.dataset.itemId, child);
    }
  }

  const sorted = sortItems(state.mealEditorItems, "name");
  const nextIds = new Set();

  for (const item of sorted) {
    nextIds.add(item.id);
    const isEditing = state.editingMealEditorTarget === item.id;
    const displayName = itemNameForDisplay(
      item.name,
      state.pendingMealIngredientRenames[item.id],
    );

    let li = existingById.get(item.id);
    if (!li) {
      li = document.createElement("li");
      li.className = "items__row";
      li.dataset.itemId = item.id;
      mealEditorItemsEl.appendChild(li);
    }

    ensureMealIngredientRowControls(li, item);

    let nameBtn = li.querySelector("button.items__name");
    let nameInput = li.querySelector("input.items__name-input");

    if (isEditing) {
      if (nameBtn) {
        nameBtn.remove();
      }
      if (!nameInput) {
        nameInput = document.createElement("input");
        nameInput.type = "text";
        nameInput.className = "items__name-input";
        nameInput.dataset.itemId = item.id;
        nameInput.setAttribute("aria-label", "Ingredient name");
        nameInput.value = displayName;
        bindMealEditorInlineInput(
          nameInput,
          item.id,
          () => commitMealIngredientEdit(item.id),
          () => cancelMealIngredientEdit(item.id),
        );
        const removeBtn = li.querySelector(".items__remove");
        li.insertBefore(nameInput, removeBtn);
      }
    } else {
      if (nameInput) {
        nameInput.remove();
      }
      if (!nameBtn) {
        nameBtn = document.createElement("button");
        nameBtn.type = "button";
        nameBtn.addEventListener("click", () => {
          void startMealIngredientEdit(item.id);
        });
        const removeBtn = li.querySelector(".items__remove");
        li.insertBefore(nameBtn, removeBtn);
      }
      nameBtn.className = "items__name";
      nameBtn.textContent = displayName;
    }
  }

  for (const [itemId, li] of existingById) {
    if (!nextIds.has(itemId)) {
      li.remove();
    }
  }

  if (!state.editingMealEditorTarget) {
    for (const item of sorted) {
      const li = mealEditorItemsEl.querySelector(`li[data-item-id="${item.id}"]`);
      if (li) {
        mealEditorItemsEl.appendChild(li);
      }
    }
  }
}

function renderMealEditor() {
  renderMealEditorTitle();
  renderMealEditorItems();
}

function itemNameButtonClass(checked) {
  return checked ? "items__name items__name--done" : "items__name";
}

function itemNameInputClass(checked) {
  return checked
    ? "items__name-input items__name-input--done"
    : "items__name-input";
}

function startItemNameEdit(itemId) {
  closeOpenItemSwipe();
  state.editingItemId = itemId;
  renderItems();
  const input = itemsEl.querySelector(`input.items__name-input[data-item-id="${itemId}"]`);
  if (input) {
    input.focus();
    input.select();
  }
}

function cancelItemNameEdit(itemId) {
  itemRenameSkipBlur.add(itemId);
  state.editingItemId = null;
  renderItems();
}

async function commitItemNameEdit(itemId) {
  if (state.editingItemId !== itemId) {
    return;
  }
  const item = state.items.find((entry) => entry.id === itemId);
  if (!item) {
    state.editingItemId = null;
    renderItems();
    return;
  }

  const input = itemsEl.querySelector(
    `input.items__name-input[data-item-id="${itemId}"]`,
  );
  if (!input) {
    state.editingItemId = null;
    renderItems();
    return;
  }

  const action = itemNameCommitAction({
    nameInput: input.value,
    existingName: item.name,
  });
  const effect = itemNameCommitUIEffect(action);
  const previousName = item.name;

  state.editingItemId = null;
  item.name = itemNameDisplayAfterCommit(action, previousName);
  setAppMessage(effect.userMessage ?? "");
  renderItems();

  if (!effect.firestoreName) {
    return;
  }

  state.pendingItemRenames[itemId] = effect.firestoreName;
  renderItems();

  const active = getListById(state.activeListId);
  if (!active) {
    delete state.pendingItemRenames[itemId];
    item.name = previousName;
    renderItems();
    return;
  }

  try {
    await updateDoc(doc(db, "lists", active.id, "items", itemId), {
      name: effect.firestoreName,
    });
  } catch (error) {
    delete state.pendingItemRenames[itemId];
    item.name = previousName;
    setAppMessage(error.message || "Could not rename item.");
    renderItems();
  }
}

function bindInlineNameInput(input, { skipBlurSet, blurKey, onCommit, onCancel }) {
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      onCommit();
    }
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
    }
  });
  input.addEventListener("change", () => {
    onCommit();
  });
  input.addEventListener("blur", () => {
    if (skipBlurSet.has(blurKey)) {
      skipBlurSet.delete(blurKey);
      return;
    }
    onCommit();
  });
}

function bindItemNameInput(input, itemId) {
  bindInlineNameInput(input, {
    skipBlurSet: itemRenameSkipBlur,
    blurKey: itemId,
    onCommit: () => commitItemNameEdit(itemId),
    onCancel: () => cancelItemNameEdit(itemId),
  });
}

function trashIconSvg() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "items__delete-icon");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("fill", "currentColor");
  path.setAttribute(
    "d",
    "M9 3h6l1 2h5v2H3V5h5l1-2zm1 6h2v10h-2V9zm4 0h2v10h-2V9zM7 9h2v10H7V9zm-1 13h12a1 1 0 0 0 1-1V7H5v14a1 1 0 0 0 1 1z",
  );
  svg.appendChild(path);
  return svg;
}

function setItemSwipeOffset(li, offsetPx, { animate = true } = {}) {
  const front = li.querySelector(".items__front");
  if (!front) {
    return;
  }
  li.classList.toggle("is-swiping", !animate);
  front.style.transform =
    offsetPx === 0 ? "" : `translateX(${offsetPx}px)`;
}

function syncItemSwipePresentation(li, itemId) {
  const front = li.querySelector(".items__front");
  if (!front) {
    return;
  }
  const open = state.openSwipeItemId === itemId;
  li.classList.toggle("is-revealed", open);
  li.classList.remove("is-swiping");
  front.style.transform = open ? `translateX(${-ITEMS_SWIPE_WIDTH_PX}px)` : "";
}

function closeOpenItemSwipe({ animate = true } = {}) {
  if (!state.openSwipeItemId) {
    return;
  }
  const openLi = itemsEl.querySelector(
    `li[data-item-id="${state.openSwipeItemId}"]`,
  );
  state.openSwipeItemId = null;
  if (openLi) {
    openLi.classList.remove("is-revealed");
    setItemSwipeOffset(openLi, 0, { animate });
    if (!animate) {
      openLi.classList.remove("is-swiping");
    }
  }
}

function openItemSwipe(itemId) {
  if (state.openSwipeItemId && state.openSwipeItemId !== itemId) {
    closeOpenItemSwipe();
  }
  const li = itemsEl.querySelector(`li[data-item-id="${itemId}"]`);
  if (!li) {
    return;
  }
  state.openSwipeItemId = itemId;
  li.classList.add("is-revealed");
  li.classList.remove("is-swiping");
  setItemSwipeOffset(li, -ITEMS_SWIPE_WIDTH_PX);
}

function bindItemSwipe(front, itemId) {
  if (front.dataset.swipeBound === "true") {
    return;
  }
  front.dataset.swipeBound = "true";

  let pointerId = null;
  let startX = 0;
  let startY = 0;
  let startOffset = 0;
  let axis = null;
  let dragging = false;
  let moved = false;

  front.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) {
      return;
    }
    if (event.target.closest(".items__check, .items__name-input")) {
      return;
    }
    const li = front.closest(".items__row");
    if (!li) {
      return;
    }
    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    startOffset =
      state.openSwipeItemId === itemId ? -ITEMS_SWIPE_WIDTH_PX : 0;
    axis = null;
    dragging = true;
    moved = false;
    // Capture only after a horizontal swipe is confirmed so name clicks still work.
  });

  front.addEventListener("pointermove", (event) => {
    if (!dragging || event.pointerId !== pointerId) {
      return;
    }
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (!axis) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) {
        return;
      }
      axis = Math.abs(dx) >= Math.abs(dy) ? "x" : "y";
      if (axis === "y") {
        dragging = false;
        pointerId = null;
        return;
      }
      if (state.openSwipeItemId && state.openSwipeItemId !== itemId) {
        closeOpenItemSwipe({ animate: false });
      }
      try {
        front.setPointerCapture(pointerId);
      } catch {
        /* unsupported or already released */
      }
    }
    if (axis !== "x") {
      return;
    }
    event.preventDefault();
    moved = true;
    const next = Math.min(0, Math.max(-ITEMS_SWIPE_WIDTH_PX, startOffset + dx));
    const li = front.closest(".items__row");
    if (li) {
      li.classList.remove("is-revealed");
      setItemSwipeOffset(li, next, { animate: false });
    }
  });

  function endSwipe(event) {
    if (!dragging || event.pointerId !== pointerId) {
      return;
    }
    const activePointerId = pointerId;
    dragging = false;
    const li = front.closest(".items__row");
    const wasHorizontal = axis === "x";
    pointerId = null;
    axis = null;
    if (front.hasPointerCapture?.(activePointerId)) {
      try {
        front.releasePointerCapture(activePointerId);
      } catch {
        /* already released */
      }
    }
    if (!li || !wasHorizontal) {
      return;
    }
    const dx = event.clientX - startX;
    const next = Math.min(0, Math.max(-ITEMS_SWIPE_WIDTH_PX, startOffset + dx));
    const shouldOpen =
      next <= -ITEMS_SWIPE_OPEN_THRESHOLD_PX ||
      (startOffset < 0 && next < startOffset);
    if (shouldOpen) {
      openItemSwipe(itemId);
    } else {
      if (state.openSwipeItemId === itemId) {
        state.openSwipeItemId = null;
      }
      li.classList.remove("is-revealed");
      setItemSwipeOffset(li, 0);
    }
  }

  front.addEventListener("pointerup", endSwipe);
  front.addEventListener("pointercancel", endSwipe);

  front.addEventListener(
    "click",
    (event) => {
      if (!moved) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      moved = false;
    },
    true,
  );
}

function ensureItemRowControls(li, item) {
  let reveal = li.querySelector(".items__reveal");
  if (!reveal) {
    reveal = document.createElement("div");
    reveal.className = "items__reveal";
    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "items__delete";
    deleteBtn.setAttribute("aria-label", `Delete ${item.name}`);
    deleteBtn.appendChild(trashIconSvg());
    deleteBtn.addEventListener("click", () => {
      void removeItem(item.id);
    });
    reveal.appendChild(deleteBtn);
    li.appendChild(reveal);
  } else {
    const deleteBtn = reveal.querySelector(".items__delete");
    if (deleteBtn) {
      deleteBtn.setAttribute("aria-label", `Delete ${item.name}`);
    }
  }

  let front = li.querySelector(".items__front");
  if (!front) {
    front = document.createElement("div");
    front.className = "items__front";
    li.appendChild(front);
  }
  bindItemSwipe(front, item.id);

  let check = front.querySelector(".items__check");
  if (!check) {
    check = document.createElement("input");
    check.type = "checkbox";
    check.className = "items__check";
    check.addEventListener("change", () => toggleItem(item.id));
    front.appendChild(check);
  }
}

function renderItems() {
  itemsEmptyEl.hidden = state.items.length > 0;

  const existingById = new Map();
  for (const child of itemsEl.children) {
    if (child.dataset.itemId) {
      existingById.set(child.dataset.itemId, child);
    }
  }

  const sorted = sortItems(state.items, state.itemSort, state.itemSortDir);
  const nextIds = new Set();

  for (const item of sorted) {
    nextIds.add(item.id);
    const checked = isChecked(item);
    const isEditing = state.editingItemId === item.id;
    const displayName = itemNameForDisplay(
      item.name,
      state.pendingItemRenames[item.id],
    );

    let li = existingById.get(item.id);
    if (!li) {
      li = document.createElement("li");
      li.className = "items__row";
      li.dataset.itemId = item.id;
      itemsEl.appendChild(li);
    }

    ensureItemRowControls(li, item);
    const front = li.querySelector(".items__front");

    const check = front.querySelector(".items__check");
    if (document.activeElement !== check) {
      check.checked = checked;
      check.setAttribute("aria-label", displayName);
    }

    let nameBtn = front.querySelector("button.items__name");
    let nameInput = front.querySelector("input.items__name-input");

    if (isEditing) {
      if (nameBtn) {
        nameBtn.remove();
        nameBtn = null;
      }
      if (!nameInput) {
        nameInput = document.createElement("input");
        nameInput.type = "text";
        nameInput.className = itemNameInputClass(checked);
        nameInput.dataset.itemId = item.id;
        nameInput.setAttribute("aria-label", "Item name");
        nameInput.value = displayName;
        bindItemNameInput(nameInput, item.id);
        front.appendChild(nameInput);
      } else {
        nameInput.className = itemNameInputClass(checked);
      }
    } else {
      if (nameInput) {
        nameInput.remove();
        nameInput = null;
      }
      if (!nameBtn) {
        nameBtn = document.createElement("button");
        nameBtn.type = "button";
        nameBtn.addEventListener("click", () => startItemNameEdit(item.id));
        front.appendChild(nameBtn);
      }
      nameBtn.className = itemNameButtonClass(checked);
      nameBtn.textContent = displayName;
    }

    syncItemSwipePresentation(li, item.id);
  }

  for (const [itemId, li] of existingById) {
    if (!nextIds.has(itemId)) {
      if (state.openSwipeItemId === itemId) {
        state.openSwipeItemId = null;
      }
      li.remove();
    }
  }

  if (!state.editingItemId) {
    for (const item of sorted) {
      const li = itemsEl.querySelector(`li[data-item-id="${item.id}"]`);
      if (li) {
        itemsEl.appendChild(li);
      }
    }
  }
}

function listTitleDisplay(list) {
  if (typeof state.pendingListName === "string") {
    return state.pendingListName;
  }
  return list.name;
}

function startListNameEdit() {
  const active = getListById(state.activeListId);
  if (!active) {
    return;
  }
  closeListMenu();
  state.editingListName = true;
  renderListTitle();
}

function cancelListNameEdit() {
  const active = getListById(state.activeListId);
  if (active) {
    listTitleRenameSkipBlur.add(active.id);
  }
  state.editingListName = false;
  renderListTitle();
}

async function commitListNameEdit(raw) {
  const active = getListById(state.activeListId);
  if (!active) {
    clearListNameEdit();
    renderListTitle();
    return;
  }

  const name = String(raw).trim();
  state.editingListName = false;

  if (name === "") {
    setAppMessage("List name cannot be empty.");
    renderListTitle();
    return;
  }
  if (name === active.name) {
    setAppMessage("");
    renderListTitle();
    return;
  }

  state.pendingListName = name;
  renderListTitle();
  setAppMessage("");

  try {
    await updateDoc(doc(db, "lists", active.id), {
      name,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    state.pendingListName = null;
    setAppMessage(error.message || "Could not rename list.");
    renderListTitle();
  }
}

function renderListTitle() {
  const active = getListById(state.activeListId);
  if (!active) {
    clearListNameEdit();
    listTitleRegion.replaceChildren();
    btnSetDefault.hidden = true;
    btnSetDefault.disabled = true;
    btnDeleteList.disabled = true;
    btnListMenu.disabled = true;
    closeListMenu();
    formAddItem.querySelector("button").disabled = true;
    inputItem.disabled = true;
    for (const radio of itemSortRadios) {
      radio.disabled = true;
    }
    for (const radio of itemSortDirRadios) {
      radio.disabled = true;
    }
    return;
  }

  if (state.pendingListName === active.name) {
    state.pendingListName = null;
  }

  const isDefault =
    active.scope === "shared" && active.id === state.defaultListId;
  btnSetDefault.hidden = active.scope !== "shared";
  btnSetDefault.disabled = isDefault;
  btnDeleteList.disabled = false;
  btnListMenu.disabled = false;
  formAddItem.querySelector("button").disabled = false;
  inputItem.disabled = false;
  for (const radio of itemSortRadios) {
    radio.disabled = false;
  }
  for (const radio of itemSortDirRadios) {
    radio.disabled = false;
  }

  if (state.editingListName) {
    let input = listTitleRegion.querySelector("input.list-title__input");
    if (!input) {
      listTitleRegion.replaceChildren();
      input = document.createElement("input");
      input.type = "text";
      input.className = "list-title__input";
      input.value = listTitleDisplay(active);
      input.setAttribute("aria-label", "List name");
      bindInlineNameInput(input, {
        skipBlurSet: listTitleRenameSkipBlur,
        blurKey: active.id,
        onCommit: () => {
          void commitListNameEdit(input.value);
        },
        onCancel: () => cancelListNameEdit(),
      });
      listTitleRegion.appendChild(input);
      input.focus();
      input.select();
    }
    return;
  }

  const existingBtn = listTitleRegion.querySelector("button.list-title__button");
  const displayName = listTitleDisplay(active);
  if (existingBtn) {
    existingBtn.textContent = displayName;
    return;
  }

  listTitleRegion.replaceChildren();
  const button = document.createElement("button");
  button.type = "button";
  button.className = "list-title__button";
  button.textContent = displayName;
  button.addEventListener("click", () => startListNameEdit());
  listTitleRegion.appendChild(button);
}

function renderAll() {
  renderListNav(listSharedEl, state.sharedLists, "No shared lists yet.");
  renderListNav(listPersonalEl, state.personalLists, "No personal lists yet.");
  renderMealNav(
    listMealsSharedEl,
    state.sharedMeals,
    "No shared meals yet.",
  );
  renderMealNav(
    listMealsPersonalEl,
    state.personalMeals,
    "No personal meals yet.",
  );
  renderListTitle();
  renderItems();
  renderMealDialog();
}

function subscribeConfig() {
  const configRef = doc(db, "config", "app");
  const unsub = onSnapshot(configRef, (snap) => {
    const nextDefault = snap.exists() ? snap.data().defaultListId : null;
    state.defaultListId = nextDefault;
    if (state.ready && nextDefault && !state.activeListId) {
      setActiveListId(nextDefault);
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
    state.sharedListsReady = true;
    ensureActiveList();
    renderAll();
  });

  const unsubPersonal = onSnapshot(personalQuery, (snap) => {
    state.personalLists = sortLists(
      snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })),
    );
    state.personalListsReady = true;
    ensureActiveList();
    renderAll();
  });

  unsubscribers.push(unsubShared, unsubPersonal);
}

function subscribeMeals(uid) {
  const sharedQuery = query(
    collection(db, "meals"),
    where("scope", "==", "shared"),
  );
  const personalQuery = query(
    collection(db, "meals"),
    where("scope", "==", "personal"),
    where("ownerUid", "==", uid),
  );

  const unsubShared = onSnapshot(sharedQuery, (snap) => {
    state.sharedMeals = sortMeals(
      snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })),
    );
    renderAll();
  });

  const unsubPersonal = onSnapshot(personalQuery, (snap) => {
    state.personalMeals = sortMeals(
      snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })),
    );
    renderAll();
  });

  unsubscribers.push(unsubShared, unsubPersonal);
}

function subscribeMealEditorItems(mealId) {
  if (mealEditorItemsUnsub) {
    mealEditorItemsUnsub();
    mealEditorItemsUnsub = null;
  }

  if (!mealId) {
    state.mealEditorItems = [];
    state.editingMealEditorTarget = null;
    state.pendingMealIngredientRenames = {};
    renderMealEditor();
    return;
  }

  state.editingMealEditorTarget = null;
  state.pendingMealIngredientRenames = {};

  const itemsQuery = query(
    collection(db, "meals", mealId, "items"),
    orderBy("createdAt", "asc"),
  );

  mealEditorItemsUnsub = onSnapshot(itemsQuery, (snap) => {
    state.mealEditorItems = snap.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    }));
    state.pendingMealIngredientRenames = reconcilePendingItemRenames(
      state.pendingMealIngredientRenames,
      state.mealEditorItems,
    );
    renderMealEditor();
  });
}

function ensureActiveList() {
  const activeStillVisible = getListById(state.activeListId);
  if (activeStillVisible) {
    rememberActiveListId(state.activeListId);
    return;
  }

  // Wait until both list queries have loaded so a remembered personal list
  // is not cleared when the shared snapshot arrives first.
  if (!state.sharedListsReady || !state.personalListsReady) {
    return;
  }

  clearListNameEdit();
  closeListMenu();

  const nextId = pickActiveListId({
    preferredId: state.activeListId,
    defaultListId: state.defaultListId,
    sharedLists: state.sharedLists,
    personalLists: state.personalLists,
  });
  setActiveListId(nextId);
}

function subscribeItems() {
  if (itemsUnsub) {
    itemsUnsub();
    itemsUnsub = null;
  }

  if (!state.activeListId) {
    state.items = [];
    state.editingItemId = null;
    state.pendingItemRenames = {};
    state.openSwipeItemId = null;
    renderItems();
    return;
  }

  state.editingItemId = null;
  state.pendingItemRenames = {};
  state.openSwipeItemId = null;

  const itemsQuery = query(
    collection(db, "lists", state.activeListId, "items"),
    orderBy("createdAt", "asc"),
  );

  itemsUnsub = onSnapshot(itemsQuery, (snap) => {
    state.items = snap.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    }));
    state.pendingItemRenames = reconcilePendingItemRenames(
      state.pendingItemRenames,
      state.items,
    );
    renderItems();
    renderMealDialog();
  });
}

function createMeal(scope) {
  clearMealEditorEditState();
  state.draftMealScope = scope;
  state.editingMealId = null;
  state.draftMealTitle = "";
  if (mealEditorItemsUnsub) {
    mealEditorItemsUnsub();
    mealEditorItemsUnsub = null;
  }
  state.mealEditorItems = [];
  setMealEditorMessage("");
  setAppMessage("");
  renderMealEditor();
  mealEditorDialog.showModal();
  void startMealTitleEdit();
}

function openMealEditor(mealId) {
  const meal = getMealById(mealId);
  if (!meal) {
    return;
  }
  clearMealEditorEditState();
  state.draftMealScope = null;
  state.draftMealTitle = "";
  state.editingMealId = mealId;
  setMealEditorMessage("");
  subscribeMealEditorItems(mealId);
  renderMealEditor();
  mealEditorDialog.showModal();
}

function closeMealEditor() {
  setMealEditorMessage("");
  clearMealEditorEditState();
  state.editingMealId = null;
  state.draftMealScope = null;
  state.draftMealTitle = "";
  if (mealEditorItemsUnsub) {
    mealEditorItemsUnsub();
    mealEditorItemsUnsub = null;
  }
  state.mealEditorItems = [];
  mealEditorDialog.close();
}

async function persistDraftMeal() {
  const result = draftMealPersistResult({
    editingMealId: state.editingMealId,
    draftMealScope: state.draftMealScope,
    nameInput: getMealEditorTitleValue(),
  });
  if (result.status === "already_saved") {
    return result.mealId;
  }
  if (result.status === "skipped") {
    return null;
  }
  if (result.status === "blocked") {
    setMealEditorMessage(result.userMessage);
    void startMealTitleEdit();
    return null;
  }
  setAppMessage("");
  try {
    const payload = {
      ...buildMealCreateFields({
        name: result.name,
        scope: result.scope,
        ownerUid: state.user.uid,
      }),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    const ref = await addDoc(collection(db, "meals"), payload);
    state.editingMealId = ref.id;
    state.draftMealScope = null;
    state.draftMealTitle = "";
    subscribeMealEditorItems(ref.id);
    return ref.id;
  } catch (error) {
    setMealEditorMessage(error.message || "Could not create meal.");
    return null;
  }
}

async function addMealIngredient(event) {
  event.preventDefault();
  await commitActiveMealEditorEdit();
  const attempt = mealIngredientAddAttempt({
    editingMealId: state.editingMealId,
    draftMealScope: state.draftMealScope,
    mealNameInput: getMealEditorTitleValue(),
    ingredientInput: inputMealIngredient.value,
    mealEditorItems: state.mealEditorItems,
  });
  if (!attempt.ok) {
    setMealEditorMessage(attempt.message);
    focusMealEditorField(attempt.focusField);
    return;
  }

  let mealId = state.editingMealId;
  if (attempt.mustPersistDraft) {
    mealId = await persistDraftMeal();
    if (!mealId) {
      return;
    }
  }

  setMealEditorMessage("");
  try {
    await addDoc(collection(db, "meals", mealId, "items"), {
      name: attempt.ingredientName,
      createdAt: serverTimestamp(),
    });
    inputMealIngredient.value = "";
    inputMealIngredient.focus();
  } catch (error) {
    setMealEditorMessage(error.message || "Could not add ingredient.");
  }
}

async function removeMealIngredient(itemId) {
  const mealId = state.editingMealId;
  if (!mealId) {
    return;
  }
  setAppMessage("");
  try {
    await deleteDoc(doc(db, "meals", mealId, "items", itemId));
  } catch (error) {
    setAppMessage(error.message || "Could not remove ingredient.");
  }
}

async function deleteEditingMeal() {
  const deleteAction = mealEditorDeleteAction(state.editingMealId);
  if (deleteAction.type === "close_draft") {
    closeMealEditor();
    return;
  }
  const meal = getMealById(state.editingMealId);
  if (!meal) {
    return;
  }
  const confirmed = window.confirm(
    `Delete "${meal.name}" and all of its ingredients? This cannot be undone.`,
  );
  if (!confirmed) {
    return;
  }
  setAppMessage("");
  try {
    const itemsSnap = await getDocs(
      collection(db, "meals", meal.id, "items"),
    );
    await Promise.all(itemsSnap.docs.map((itemDoc) => deleteDoc(itemDoc.ref)));
    await deleteDoc(doc(db, "meals", meal.id));
    closeMealEditor();
  } catch (error) {
    setAppMessage(error.message || "Could not delete meal.");
  }
}

async function addMealToList(mealId) {
  const active = getListById(state.activeListId);
  if (!active) {
    setAppMessage("Select a grocery list first.");
    return;
  }
  const meal = getMealById(mealId);
  if (!meal) {
    return;
  }

  setAppMessage("");
  try {
    const mealItemsSnap = await getDocs(
      collection(db, "meals", mealId, "items"),
    );
    const mealItems = mealItemsSnap.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    }));

    const toAdd = itemsToAdd(mealItems, state.items);
    if (toAdd.length) {
      const batch = writeBatch(db);
      const itemsCol = collection(db, "lists", active.id, "items");
      for (const name of toAdd) {
        batch.set(doc(itemsCol), {
          name,
          checked: false,
          createdAt: serverTimestamp(),
        });
      }
      await batch.commit();
    }

    clearMealDialogEditState();
    setMealDialogMessage("");
    state.mealDialogMealId = mealId;
    mealDialogItemsEl.replaceChildren();
    mealDialog.showModal();
    subscribeMealDialogItems(mealId);
  } catch (error) {
    setAppMessage(error.message || "Could not add meal to list.");
  }
}

function closeMealDialog() {
  if (mealDialogItemsUnsub) {
    mealDialogItemsUnsub();
    mealDialogItemsUnsub = null;
  }
  clearMealDialogEditState();
  setMealDialogMessage("");
  state.mealDialogMealId = null;
  state.mealDialogMealItems = [];
  mealDialogItemsEl.replaceChildren();
  mealDialog.close();
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
  clearListNameEdit();
  closeListMenu();
  setActiveListId(ref.id);
  renderAll();
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

  closeListMenu();
  clearListNameEdit();
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

  setActiveListId(null, { resubscribe: false });
  ensureActiveList();
  renderAll();
}

async function setGlobalDefault() {
  const active = getListById(state.activeListId);
  if (!active || active.scope !== "shared") {
    return;
  }
  closeListMenu();
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
    checked: false,
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
  const item = state.items.find((entry) => entry.id === itemId);
  const label = item?.name ? `"${item.name}"` : "this item";
  const confirmed = window.confirm(
    `Remove ${label} from this list? This cannot be undone.`,
  );
  if (!confirmed) {
    return;
  }
  if (state.openSwipeItemId === itemId) {
    state.openSwipeItemId = null;
  }
  setAppMessage("");
  await deleteDoc(doc(db, "lists", active.id, "items", itemId));
}

async function toggleItem(itemId) {
  const active = getListById(state.activeListId);
  if (!active) {
    return;
  }
  const item = state.items.find((entry) => entry.id === itemId);
  if (!item) {
    return;
  }
  setAppMessage("");
  await updateDoc(doc(db, "lists", active.id, "items", itemId), {
    checked: !isChecked(item),
  });
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
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
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
  const storedHash = sessionStorage.getItem("grocery_oauth_hash");
  if (!storedHash) {
    return;
  }
  sessionStorage.removeItem("grocery_oauth_hash");

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
  state.sharedListsReady = false;
  state.personalListsReady = false;
  state.activeListId = null;
  state.items = [];

  userLabel.textContent = user.displayName
    ? `${user.displayName} (${user.email})`
    : user.email || user.uid;
  if (userCoinInitial) {
    userCoinInitial.textContent = userCoinLetter(user);
  }

  setAppMessage("");
  closeUserMenu();

  try {
    let accessDoc = await loadAccessDoc(user);
    if (
      sessionView({ accessDoc, appId: "grocery", seedAdmin: false }) ===
      "notFound"
    ) {
      showNotFound();
      return;
    }
    accessDoc = await maybeBindAccessUid(user, accessDoc);
    if (
      sessionView({ accessDoc, appId: "grocery", seedAdmin: false }) ===
      "notFound"
    ) {
      showNotFound();
      return;
    }

    renderUserMenuApps(accessDoc, "grocery");
    showApp();
    state.activeListId = await loadGroceryActiveListPreference(user.uid);
    await ensureBootstrap();
    subscribeConfig();
    subscribeLists(user.uid);
    subscribeMeals(user.uid);

    const configSnap = await getDoc(doc(db, "config", "app"));
    state.defaultListId = configSnap.exists()
      ? configSnap.data().defaultListId
      : BOOTSTRAP_LIST_ID;
    if (!state.activeListId) {
      setActiveListId(state.defaultListId, { resubscribe: false });
    } else {
      rememberActiveListId(state.activeListId);
    }
    state.ready = true;
    ensureActiveList();
    subscribeItems();
    renderAll();
  } catch (error) {
    setAppMessage(error.message || "Could not load lists.");
  }
}

function endSession() {
  if (mealDialog.open) {
    closeMealDialog();
  }
  if (mealEditorDialog.open) {
    closeMealEditor();
  }
  cleanupSubscriptions();
  state.user = null;
  state.defaultListId = null;
  state.activeListId = null;
  state.sharedLists = [];
  state.personalLists = [];
  state.sharedListsReady = false;
  state.personalListsReady = false;
  state.sharedMeals = [];
  state.personalMeals = [];
  state.items = [];
  clearListNameEdit();
  closeAllMenus();
  state.openSwipeItemId = null;
  userMenuApps?.replaceChildren();
  state.mealDialogMealId = null;
  state.mealDialogMealItems = [];
  state.editingMealId = null;
  state.draftMealScope = null;
  state.mealEditorItems = [];
  state.ready = false;
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

document.getElementById("btn-new-shared").addEventListener("click", () => {
  createList("shared");
});

document.getElementById("btn-new-personal").addEventListener("click", () => {
  createList("personal");
});

document.getElementById("btn-new-shared-meal").addEventListener("click", () => {
  createMeal("shared");
});

document.getElementById("btn-new-personal-meal").addEventListener("click", () => {
  createMeal("personal");
});

mealDialogClose.addEventListener("click", () => {
  closeMealDialog();
});

mealDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeMealDialog();
});

mealDialog.addEventListener("pointerdown", (event) => {
  if (!state.editingMealDialogTarget) {
    return;
  }
  const input = getActiveMealDialogInlineInput();
  if (!input) {
    return;
  }
  const pointerOnActiveInput =
    input === event.target || input.contains(event.target);
  if (
    !shouldCommitItemNameOnOutsidePointerDown({
      editingItemId: state.editingMealDialogTarget,
      pointerOnActiveInput,
    })
  ) {
    return;
  }
  void commitActiveMealDialogEdit();
});

mealEditorClose.addEventListener("click", () => {
  closeMealEditor();
});

mealEditorDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeMealEditor();
});

mealEditorDialog.addEventListener("pointerdown", (event) => {
  if (!state.editingMealEditorTarget) {
    return;
  }
  const input = getActiveMealEditorInlineInput();
  if (!input) {
    return;
  }
  const pointerOnActiveInput =
    input === event.target || input.contains(event.target);
  if (
    !shouldCommitItemNameOnOutsidePointerDown({
      editingItemId: state.editingMealEditorTarget,
      pointerOnActiveInput,
    })
  ) {
    return;
  }
  void commitActiveMealEditorEdit();
});

formMealIngredient.addEventListener("submit", addMealIngredient);

btnDeleteMeal.addEventListener("click", () => {
  deleteEditingMeal();
});

btnDeleteList.addEventListener("click", () => {
  deleteActiveList();
});

btnSetDefault.addEventListener("click", () => {
  setGlobalDefault();
});

formAddItem.addEventListener("submit", addItem);

viewApp.addEventListener("pointerdown", (event) => {
  if (!state.editingItemId) {
    return;
  }
  const input = itemsEl.querySelector(
    `input.items__name-input[data-item-id="${state.editingItemId}"]`,
  );
  if (!input) {
    return;
  }
  const pointerOnActiveInput =
    input === event.target || input.contains(event.target);
  if (
    !shouldCommitItemNameOnOutsidePointerDown({
      editingItemId: state.editingItemId,
      pointerOnActiveInput,
    })
  ) {
    return;
  }
  commitItemNameEdit(state.editingItemId);
});

function syncItemSortRadios() {
  for (const radio of itemSortRadios) {
    radio.checked = radio.value === state.itemSort;
  }
  for (const radio of itemSortDirRadios) {
    radio.checked = radio.value === state.itemSortDir;
  }
}

for (const radio of itemSortRadios) {
  radio.addEventListener("change", () => {
    if (!radio.checked) {
      return;
    }
    state.itemSort = parseItemSort(radio.value);
    closeOpenItemSwipe({ animate: false });
    syncItemSortRadios();
    renderItems();
  });
}

for (const radio of itemSortDirRadios) {
  radio.addEventListener("change", () => {
    if (!radio.checked) {
      return;
    }
    state.itemSortDir = parseSortDir(radio.value);
    closeOpenItemSwipe({ animate: false });
    syncItemSortRadios();
    renderItems();
  });
}

syncItemSortRadios();

for (const btn of loginThemeButtons) {
  btn.addEventListener("click", () => {
    setThemeFromUI(btn.getAttribute("data-grocery-theme-pick"));
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

btnListMenu?.addEventListener("click", (event) => {
  event.stopPropagation();
  toggleListMenu();
});

document.addEventListener("click", (event) => {
  if (!event.target.closest(".user-menu")) {
    closeUserMenu();
  }
  if (!event.target.closest(".list-menu")) {
    closeListMenu();
  }
  if (
    state.openSwipeItemId &&
    !event.target.closest(`li[data-item-id="${state.openSwipeItemId}"]`)
  ) {
    closeOpenItemSwipe();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeAllMenus();
    closeOpenItemSwipe();
  }
});

setThemeFromUI(parseThemePref(localStorage.getItem(THEME_KEY)));
applySidebarTab(readCookie(SIDEBAR_TAB_COOKIE));

for (const button of sidebarTabButtons) {
  button.addEventListener("click", () => {
    applySidebarTab(button.getAttribute("data-sidebar-tab"));
  });
}

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
    hint.textContent = `Authorized redirect URI: ${oauthRedirectUri()}`;
  }
  btnGoogleSignIn.addEventListener("click", () => {
    signInWithGoogle();
  });
  await completeGoogleRedirect();
}

initAuth();
