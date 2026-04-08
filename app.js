import { db } from "./firebase-init.js";
import {
    collection,
    doc,
    setDoc,
    deleteDoc,
    onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { initNavigation } from "./navigation.js";

// ----- Stav aplikace -----
const STORAGE_KEY = "recept.recipes.v1";
let recipes = [];
let editingId = null;
let currentDetailId = null;
let currentUser = null;
let unsubscribeRecipes = null;
let authReady = false;

// ----- DOM odkazy -----
const views = {
    list: document.getElementById("view-list"),
    detail: document.getElementById("view-detail"),
    form: document.getElementById("view-form"),
};
const recipesEl = document.getElementById("recipes");
const emptyStateEl = document.getElementById("empty-state");
const searchEl = document.getElementById("search");
const filterEl = document.getElementById("filter-category");
const detailContentEl = document.getElementById("detail-content");
const formEl = document.getElementById("recipe-form");
const formTitleEl = document.getElementById("form-title");
const syncBannerEl = document.getElementById("sync-banner");

// ----- Inicializace -----
document.getElementById("btn-new").addEventListener("click", () => openForm());
document.getElementById("btn-back").addEventListener("click", showList);
document.getElementById("btn-cancel").addEventListener("click", showList);
searchEl.addEventListener("input", renderList);
filterEl.addEventListener("change", renderList);
formEl.addEventListener("submit", handleFormSubmit);

renderSyncBanner();
showList();

// Inicializuj navigaci (side menu + hamburger + auth UI) a reaguj na změny uživatele.
initNavigation("recepty", (user) => {
    authReady = true;
    currentUser = user;

    // Zruš předchozí Firestore odběr
    if (unsubscribeRecipes) {
        unsubscribeRecipes();
        unsubscribeRecipes = null;
    }

    if (user) {
        // Přihlášen – odebírej data z Firestore
        const recipesRef = collection(db, "users", user.uid, "recipes");
        unsubscribeRecipes = onSnapshot(
            recipesRef,
            (snapshot) => {
                recipes = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
                renderList();
                refreshDetailIfOpen();
            },
            (err) => {
                console.error("Firestore chyba:", err);
                alert("Chyba při načítání receptů z cloudu: " + err.message);
            }
        );
    } else {
        // Odhlášen – používej localStorage
        recipes = loadLocalRecipes();
        renderList();
        refreshDetailIfOpen();
    }

    renderSyncBanner();
});

function renderSyncBanner() {
    if (!authReady) {
        syncBannerEl.classList.add("hidden");
        return;
    }
    if (currentUser) {
        syncBannerEl.classList.remove("hidden");
        syncBannerEl.className = "sync-banner sync-banner-ok";
        syncBannerEl.textContent = "☁ Recepty se synchronizují s tvým Google účtem.";
    } else {
        const localCount = loadLocalRecipes().length;
        if (localCount > 0) {
            syncBannerEl.classList.remove("hidden");
            syncBannerEl.className = "sync-banner sync-banner-warn";
            syncBannerEl.textContent =
                "⚠ Recepty jsou uložené jen v tomto prohlížeči. Přihlas se Googlem pro synchronizaci mezi zařízeními.";
        } else {
            syncBannerEl.classList.add("hidden");
        }
    }
}

// ----- Úložiště (lokální fallback) -----
function loadLocalRecipes() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        console.error("Chyba při načítání receptů:", e);
        return [];
    }
}

function saveLocalRecipes() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(recipes));
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ----- Ukládání / mazání (abstrakce nad backendem) -----
async function persistRecipe(recipe) {
    if (currentUser) {
        const ref = doc(db, "users", currentUser.uid, "recipes", recipe.id);
        const { id, ...data } = recipe;
        await setDoc(ref, data);
    } else {
        const idx = recipes.findIndex((r) => r.id === recipe.id);
        if (idx !== -1) {
            recipes[idx] = recipe;
        } else {
            recipes.push(recipe);
        }
        saveLocalRecipes();
        renderList();
    }
}

async function removeRecipe(id) {
    if (currentUser) {
        await deleteDoc(doc(db, "users", currentUser.uid, "recipes", id));
    } else {
        recipes = recipes.filter((r) => r.id !== id);
        saveLocalRecipes();
        renderList();
    }
}

// ----- Přepínání pohledů -----
function showView(name) {
    Object.keys(views).forEach((key) => {
        views[key].classList.toggle("hidden", key !== name);
    });
    window.scrollTo({ top: 0, behavior: "instant" });
}

function showList() {
    editingId = null;
    currentDetailId = null;
    renderList();
    showView("list");
}

function refreshDetailIfOpen() {
    if (currentDetailId && !views.detail.classList.contains("hidden")) {
        const recipe = recipes.find((r) => r.id === currentDetailId);
        if (recipe) {
            renderDetail(recipe);
        } else {
            // Recept byl smazán (případně z jiného zařízení)
            showList();
        }
    }
}

// ----- Vykreslení seznamu -----
function renderList() {
    const query = searchEl.value.trim().toLowerCase();
    const category = filterEl.value;

    const filtered = recipes
        .filter((r) => {
            if (category && r.category !== category) return false;
            if (!query) return true;
            const haystack = [
                r.title,
                r.category,
                r.ingredients,
                r.instructions,
                r.notes,
            ].join(" ").toLowerCase();
            return haystack.includes(query);
        })
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

    recipesEl.innerHTML = "";
    if (filtered.length === 0) {
        emptyStateEl.classList.remove("hidden");
        if (recipes.length > 0) {
            emptyStateEl.innerHTML = "Žádný recept neodpovídá tvému hledání.";
        } else {
            emptyStateEl.innerHTML =
                'Zatím tu nejsou žádné recepty. Klikni na <strong>+ Nový recept</strong> a přidej svůj první!';
        }
        return;
    }
    emptyStateEl.classList.add("hidden");

    filtered.forEach((recipe) => {
        const card = document.createElement("div");
        card.className = "recipe-card";
        card.addEventListener("click", () => showDetail(recipe.id));

        const title = document.createElement("h3");
        title.textContent = recipe.title;
        card.appendChild(title);

        const meta = document.createElement("div");
        meta.className = "meta";

        if (recipe.category) {
            const badge = document.createElement("span");
            badge.className = "badge";
            badge.textContent = recipe.category;
            meta.appendChild(badge);
        }
        if (recipe.time) {
            const time = document.createElement("span");
            time.textContent = "⏱ " + recipe.time + " min";
            meta.appendChild(time);
        }
        if (recipe.servings) {
            const serv = document.createElement("span");
            serv.textContent = "🍽 " + recipe.servings + " porcí";
            meta.appendChild(serv);
        }
        card.appendChild(meta);
        recipesEl.appendChild(card);
    });
}

// ----- Detail receptu -----
function showDetail(id) {
    const recipe = recipes.find((r) => r.id === id);
    if (!recipe) {
        showList();
        return;
    }
    currentDetailId = id;
    renderDetail(recipe);
    showView("detail");
}

function renderDetail(recipe) {
    detailContentEl.innerHTML = "";

    const title = document.createElement("h2");
    title.textContent = recipe.title;
    detailContentEl.appendChild(title);

    const meta = document.createElement("div");
    meta.className = "detail-meta";
    if (recipe.category) {
        const badge = document.createElement("span");
        badge.className = "badge";
        badge.textContent = recipe.category;
        meta.appendChild(badge);
    }
    if (recipe.time) {
        const t = document.createElement("span");
        t.textContent = "⏱ " + recipe.time + " minut";
        meta.appendChild(t);
    }
    if (recipe.servings) {
        const s = document.createElement("span");
        s.textContent = "🍽 " + recipe.servings + " porcí";
        meta.appendChild(s);
    }
    detailContentEl.appendChild(meta);

    const ingredients = parseLines(recipe.ingredients);
    if (ingredients.length > 0) {
        const section = document.createElement("div");
        section.className = "detail-section";
        const h3 = document.createElement("h3");
        h3.textContent = "Suroviny";
        section.appendChild(h3);
        const ul = document.createElement("ul");
        ul.className = "ingredients-list";
        ingredients.forEach((line) => {
            const li = document.createElement("li");
            li.textContent = line;
            ul.appendChild(li);
        });
        section.appendChild(ul);
        detailContentEl.appendChild(section);
    }

    if (recipe.instructions && recipe.instructions.trim()) {
        const section = document.createElement("div");
        section.className = "detail-section";
        const h3 = document.createElement("h3");
        h3.textContent = "Postup";
        section.appendChild(h3);
        const p = document.createElement("p");
        p.className = "instructions-text";
        p.textContent = recipe.instructions;
        section.appendChild(p);
        detailContentEl.appendChild(section);
    }

    if (recipe.notes && recipe.notes.trim()) {
        const section = document.createElement("div");
        section.className = "detail-section";
        const h3 = document.createElement("h3");
        h3.textContent = "Poznámky";
        section.appendChild(h3);
        const p = document.createElement("p");
        p.className = "notes-text";
        p.textContent = recipe.notes;
        section.appendChild(p);
        detailContentEl.appendChild(section);
    }

    const actions = document.createElement("div");
    actions.className = "detail-actions";

    const editBtn = document.createElement("button");
    editBtn.className = "btn btn-secondary";
    editBtn.textContent = "Upravit";
    editBtn.addEventListener("click", () => openForm(recipe.id));
    actions.appendChild(editBtn);

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn btn-danger";
    deleteBtn.textContent = "Smazat";
    deleteBtn.addEventListener("click", () => deleteRecipe(recipe.id));
    actions.appendChild(deleteBtn);

    detailContentEl.appendChild(actions);
}

function parseLines(text) {
    if (!text) return [];
    return text
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
}

// ----- Formulář -----
function openForm(id) {
    formEl.reset();
    editingId = id || null;

    if (id) {
        const recipe = recipes.find((r) => r.id === id);
        if (!recipe) return;
        formTitleEl.textContent = "Upravit recept";
        formEl.elements.title.value = recipe.title || "";
        formEl.elements.category.value = recipe.category || "Hlavní jídlo";
        formEl.elements.servings.value = recipe.servings || 4;
        formEl.elements.time.value = recipe.time || 30;
        formEl.elements.ingredients.value = recipe.ingredients || "";
        formEl.elements.instructions.value = recipe.instructions || "";
        formEl.elements.notes.value = recipe.notes || "";
    } else {
        formTitleEl.textContent = "Nový recept";
    }

    showView("form");
    formEl.elements.title.focus();
}

async function handleFormSubmit(event) {
    event.preventDefault();
    const data = new FormData(formEl);
    const title = (data.get("title") || "").toString().trim();
    if (!title) return;

    const now = Date.now();
    const existing = editingId ? recipes.find((r) => r.id === editingId) : null;
    const recipe = {
        id: editingId || generateId(),
        title,
        category: (data.get("category") || "").toString(),
        servings: parseInt(data.get("servings"), 10) || null,
        time: parseInt(data.get("time"), 10) || null,
        ingredients: (data.get("ingredients") || "").toString(),
        instructions: (data.get("instructions") || "").toString(),
        notes: (data.get("notes") || "").toString(),
        createdAt: existing ? existing.createdAt || now : now,
        updatedAt: now,
    };

    try {
        await persistRecipe(recipe);
        const targetId = recipe.id;
        editingId = null;
        showDetail(targetId);
    } catch (err) {
        console.error(err);
        alert("Chyba při ukládání: " + err.message);
    }
}

async function deleteRecipe(id) {
    const recipe = recipes.find((r) => r.id === id);
    if (!recipe) return;
    const ok = window.confirm('Opravdu chceš smazat recept "' + recipe.title + '"?');
    if (!ok) return;
    try {
        await removeRecipe(id);
        showList();
    } catch (err) {
        console.error(err);
        alert("Chyba při mazání: " + err.message);
    }
}
