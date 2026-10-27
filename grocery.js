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
  itemNameCommitAction,
  itemNameCommitUIEffect,
  itemNameDisplayAfterCommit,
  shouldCommitItemNameOnOutsidePointerDown,
  itemNameForDisplay,
  reconcilePendingItemRenames,
} from "./grocery-items.mjs";
import { matchMealItems, itemsToAdd } from "./grocery-meals.mjs";
import {
  mealEditorDeleteAction,
  draftMealPersistResult,
  mealEditorNameBlurAction,
  buildMealCreateFields,
  mealIngredientAddAttempt,
} from "./grocery-meal-editor.mjs";
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
const loginError = document.getElementById("login-error");
const loginStatus = document.getElementById("login-status");
const btnGoogleSignIn = document.getElementById("btn-google-sign-in");
const OAUTH_NONCE_KEY = "grocery_google_oauth_nonce";
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
const itemSortEl = document.getElementById("item-sort");
const listMealsSharedEl = document.getElementById("list-meals-shared");
const listMealsPersonalEl = document.getElementById("list-meals-personal");
const mealDialog = document.getElementById("meal-dialog");
const mealDialogTitle = document.getElementById("meal-dialog-title");
const mealDialogItemsEl = document.getElementById("meal-dialog-items");
const mealDialogClose = document.getElementById("meal-dialog-close");
const mealEditorDialog = document.getElementById("meal-editor-dialog");
const mealEditorName = document.getElementById("meal-editor-name");
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
  itemSort: "name",
  ready: false,
  mealDialogMealId: null,
  mealDialogMealItems: [],
  editingMealId: null,
  draftMealScope: null,
  mealEditorItems: [],
};

const unsubscribers = [];
const itemRenameSkipBlur = new Set();
let itemsUnsub = null;
let mealEditorItemsUnsub = null;

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
    mealEditorName.focus();
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

function renderMealNav(container, meals, emptyLabel) {
  container.replaceChildren();
  if (!meals.length) {
    const empty = document.createElement("li");
    empty.className = "list-nav__item";
    empty.textContent = emptyLabel;
    empty.style.color = "var(--text-muted)";
    empty.style.fontSize = "0.9rem";
    empty.style.padding = "0.45rem 0.5rem";
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

function renderMealDialog() {
  if (!state.mealDialogMealId || !mealDialog.open) {
    return;
  }

  const rows = matchMealItems(state.mealDialogMealItems, state.items);
  const existingByKey = new Map();
  for (const child of mealDialogItemsEl.children) {
    if (child.dataset.mealRowKey) {
      existingByKey.set(child.dataset.mealRowKey, child);
    }
  }

  const nextKeys = new Set();
  for (const row of rows) {
    const key = row.name;
    nextKeys.add(key);
    let li = existingByKey.get(key);
    const checked = row.onList && row.checked;
    const disabled = !row.onList;

    if (!li) {
      li = document.createElement("li");
      li.className = "items__row";
      li.dataset.mealRowKey = key;

      const check = document.createElement("input");
      check.type = "checkbox";
      check.className = "items__check";
      check.dataset.mealRowKey = key;

      const name = document.createElement("p");
      name.className = "items__name";
      name.dataset.mealRowKey = key;

      li.appendChild(check);
      li.appendChild(name);
      mealDialogItemsEl.appendChild(li);

      check.addEventListener("change", () => {
        const match = matchMealItems(state.mealDialogMealItems, state.items).find(
          (entry) => entry.name === key,
        );
        if (match?.groceryItem?.id) {
          toggleItem(match.groceryItem.id);
        }
      });
    }

    const check = li.querySelector('input[type="checkbox"]');
    const name = li.querySelector(".items__name");
    if (document.activeElement !== check) {
      check.checked = checked;
      check.disabled = disabled;
      check.setAttribute("aria-label", row.name);
    }
    name.textContent = row.name;
    name.className = checked
      ? "items__name items__name--done"
      : "items__name";
    if (!row.onList) {
      name.classList.add("items__name--pending");
    } else {
      name.classList.remove("items__name--pending");
    }
  }

  for (const [key, li] of existingByKey) {
    if (!nextKeys.has(key)) {
      li.remove();
    }
  }
}

function renderMealEditorItems() {
  mealEditorItemsEl.replaceChildren();
  for (const item of sortItems(state.mealEditorItems, "name")) {
    const li = document.createElement("li");
    li.className = "items__row";

    const name = document.createElement("p");
    name.className = "items__name";
    name.textContent = item.name;

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "btn btn--ghost";
    removeBtn.textContent = "Remove";
    removeBtn.addEventListener("click", () => removeMealIngredient(item.id));

    li.appendChild(name);
    li.appendChild(removeBtn);
    mealEditorItemsEl.appendChild(li);
  }
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

function bindItemNameInput(input, itemId) {
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commitItemNameEdit(itemId);
    }
    if (event.key === "Escape") {
      event.preventDefault();
      cancelItemNameEdit(itemId);
    }
  });
  input.addEventListener("change", () => {
    commitItemNameEdit(itemId);
  });
  input.addEventListener("blur", () => {
    if (itemRenameSkipBlur.has(itemId)) {
      itemRenameSkipBlur.delete(itemId);
      return;
    }
    commitItemNameEdit(itemId);
  });
}

function ensureItemRowControls(li, item) {
  let check = li.querySelector(".items__check");
  if (!check) {
    check = document.createElement("input");
    check.type = "checkbox";
    check.className = "items__check";
    check.addEventListener("change", () => toggleItem(item.id));
    li.appendChild(check);
  }

  let removeBtn = li.querySelector(".items__remove");
  if (!removeBtn) {
    removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "btn btn--ghost items__remove";
    removeBtn.textContent = "Remove";
    removeBtn.addEventListener("click", () => removeItem(item.id));
    li.appendChild(removeBtn);
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

  const sorted = sortItems(state.items, state.itemSort);
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

    const check = li.querySelector(".items__check");
    if (document.activeElement !== check) {
      check.checked = checked;
      check.setAttribute("aria-label", displayName);
    }

    let nameBtn = li.querySelector("button.items__name");
    let nameInput = li.querySelector("input.items__name-input");

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
        const removeBtn = li.querySelector(".items__remove");
        li.insertBefore(nameInput, removeBtn);
      } else if (document.activeElement !== nameInput) {
        nameInput.className = itemNameInputClass(checked);
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
        const removeBtn = li.querySelector(".items__remove");
        li.insertBefore(nameBtn, removeBtn);
      }
      nameBtn.className = itemNameButtonClass(checked);
      nameBtn.textContent = displayName;
    }
  }

  for (const [itemId, li] of existingById) {
    if (!nextIds.has(itemId)) {
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
    itemSortEl.disabled = true;
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
  itemSortEl.disabled = false;
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
  renderToolbar();
  renderItems();
  renderMealDialog();
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
    renderMealEditorItems();
    return;
  }

  const itemsQuery = query(
    collection(db, "meals", mealId, "items"),
    orderBy("createdAt", "asc"),
  );

  mealEditorItemsUnsub = onSnapshot(itemsQuery, (snap) => {
    state.mealEditorItems = snap.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    }));
    renderMealEditorItems();
  });
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
    state.editingItemId = null;
    state.pendingItemRenames = {};
    renderItems();
    return;
  }

  state.editingItemId = null;
  state.pendingItemRenames = {};

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
  state.draftMealScope = scope;
  state.editingMealId = null;
  if (mealEditorItemsUnsub) {
    mealEditorItemsUnsub();
    mealEditorItemsUnsub = null;
  }
  state.mealEditorItems = [];
  renderMealEditorItems();
  mealEditorName.value = "";
  setMealEditorMessage("");
  setAppMessage("");
  mealEditorDialog.showModal();
  mealEditorName.focus();
}

function openMealEditor(mealId) {
  const meal = getMealById(mealId);
  if (!meal) {
    return;
  }
  state.draftMealScope = null;
  state.editingMealId = mealId;
  mealEditorName.value = meal.name;
  setMealEditorMessage("");
  subscribeMealEditorItems(mealId);
  mealEditorDialog.showModal();
}

function closeMealEditor() {
  setMealEditorMessage("");
  state.editingMealId = null;
  state.draftMealScope = null;
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
    nameInput: mealEditorName.value,
  });
  if (result.status === "already_saved") {
    return result.mealId;
  }
  if (result.status === "skipped") {
    return null;
  }
  if (result.status === "blocked") {
    setMealEditorMessage(result.userMessage);
    mealEditorName.focus();
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
    subscribeMealEditorItems(ref.id);
    return ref.id;
  } catch (error) {
    setMealEditorMessage(error.message || "Could not create meal.");
    return null;
  }
}

async function saveMealEditorName() {
  const meal = state.editingMealId
    ? getMealById(state.editingMealId)
    : null;
  const action = mealEditorNameBlurAction({
    editingMealId: state.editingMealId,
    draftMealScope: state.draftMealScope,
    nameInput: mealEditorName.value,
    existingMealName: meal?.name ?? null,
  });

  if (action.type === "noop") {
    return;
  }
  if (action.type === "persist_draft") {
    await persistDraftMeal();
    return;
  }
  if (action.type === "reject_empty") {
    setMealEditorMessage("Meal name cannot be empty.");
    mealEditorName.value = action.restoreName;
    return;
  }

  const mealId = state.editingMealId;
  if (!mealId || !meal) {
    return;
  }
  setAppMessage("");
  try {
    await updateDoc(doc(db, "meals", mealId), {
      name: action.name,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    setAppMessage(error.message || "Could not rename meal.");
    mealEditorName.value = meal.name;
  }
}

async function addMealIngredient(event) {
  event.preventDefault();
  const attempt = mealIngredientAddAttempt({
    editingMealId: state.editingMealId,
    draftMealScope: state.draftMealScope,
    mealNameInput: mealEditorName.value,
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

    state.mealDialogMealId = mealId;
    state.mealDialogMealItems = mealItems;
    mealDialogTitle.textContent = meal.name;
    mealDialogItemsEl.replaceChildren();
    mealDialog.showModal();
    renderMealDialog();
  } catch (error) {
    setAppMessage(error.message || "Could not add meal to list.");
  }
}

function closeMealDialog() {
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
    subscribeMeals(user.uid);

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
  state.sharedMeals = [];
  state.personalMeals = [];
  state.items = [];
  state.mealDialogMealId = null;
  state.mealDialogMealItems = [];
  state.editingMealId = null;
  state.draftMealScope = null;
  state.mealEditorItems = [];
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

mealEditorClose.addEventListener("click", () => {
  closeMealEditor();
});

mealEditorDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeMealEditor();
});

mealEditorName.addEventListener("change", () => {
  saveMealEditorName();
});

formMealIngredient.addEventListener("submit", addMealIngredient);

btnDeleteMeal.addEventListener("click", () => {
  deleteEditingMeal();
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

itemSortEl.addEventListener("change", () => {
  state.itemSort = itemSortEl.value;
  renderItems();
});

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
