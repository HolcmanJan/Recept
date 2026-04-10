// Stránka s uživatelskými záložkami (URL → dlaždice s náhledem).
// Metadata stránek se získávají přes microlink.io.
import { db } from "./firebase-init.js";
import {
    collection,
    doc,
    setDoc,
    deleteDoc,
    onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { initNavigation } from "./navigation.js";

const STORAGE_KEY = "recept.bookmarks.v1";
const PAGE_SIZE = 12;
const PREVIEW_API = "https://api.microlink.io/?url=";
const TABS = ["all", "1", "2", "3", "4"];

// ----- Stav -----
let bookmarks = [];
let currentUser = null;
let unsubscribeBookmarks = null;
let renderedCount = 0;
let observer = null;
let activeTab = "all";

// ----- DOM -----
const formEl = document.getElementById("bookmark-form");
const urlEl = document.getElementById("bookmark-url");
const submitBtn = document.getElementById("bookmark-submit");
const statusEl = document.getElementById("bookmark-status");
const gridEl = document.getElementById("bookmarks-grid");
const emptyEl = document.getElementById("bookmarks-empty");
const sentinelEl = document.getElementById("scroll-sentinel");
const endEl = document.getElementById("bookmarks-end");
const tabsEl = document.getElementById("bookmark-tabs");

// ----- Záložkové přepínače -----
tabsEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".bookmark-tab");
    if (!btn) return;
    const tab = btn.dataset.tab;
    if (tab === activeTab) return;
    activeTab = tab;
    tabsEl.querySelectorAll(".bookmark-tab").forEach((b) => {
        b.classList.toggle("active", b.dataset.tab === activeTab);
    });
    resetRender();
});

// ----- Filtr podle záložky -----
function filteredBookmarks() {
    if (activeTab === "all") return bookmarks;
    return bookmarks.filter((b) => b.tab === activeTab);
}

// ----- Inicializace navigace + reakce na změnu uživatele -----
initNavigation("zalozky", (user) => {
    currentUser = user;

    if (unsubscribeBookmarks) {
        unsubscribeBookmarks();
        unsubscribeBookmarks = null;
    }

    if (user) {
        const ref = collection(db, "users", user.uid, "bookmarks");
        unsubscribeBookmarks = onSnapshot(
            ref,
            (snapshot) => {
                bookmarks = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
                sortBookmarks(bookmarks);
                resetRender();
            },
            (err) => {
                console.error("Firestore chyba:", err);
                alert("Chyba při načítání záložek: " + err.message);
            }
        );
    } else {
        bookmarks = loadLocal();
        resetRender();
    }
});

formEl.addEventListener("submit", handleSubmit);

// Tlačítko "Vložit ze schránky" – vloží URL a rovnou odešle
document.getElementById("bookmark-paste").addEventListener("click", async () => {
    try {
        const text = await navigator.clipboard.readText();
        if (text && text.trim()) {
            urlEl.value = text.trim();
            formEl.requestSubmit();
        }
    } catch (err) {
        showStatus("Nelze přečíst schránku. Povol přístup v prohlížeči.", "error");
    }
});

// ----- Ukládání -----
function loadLocal() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        sortBookmarks(parsed);
        return parsed;
    } catch (e) {
        console.error("Chyba načítání záložek:", e);
        return [];
    }
}

function saveLocal() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bookmarks));
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function sortBookmarks(arr) {
    arr.sort((a, b) => {
        const af = a.favorite ? 1 : 0;
        const bf = b.favorite ? 1 : 0;
        if (af !== bf) return bf - af;
        return (b.createdAt || 0) - (a.createdAt || 0);
    });
    return arr;
}

async function persistBookmark(bookmark) {
    if (currentUser) {
        const ref = doc(db, "users", currentUser.uid, "bookmarks", bookmark.id);
        const { id, ...data } = bookmark;
        await setDoc(ref, data);
    } else {
        bookmarks.unshift(bookmark);
        sortBookmarks(bookmarks);
        saveLocal();
        resetRender();
    }
}

async function updateBookmark(bookmark) {
    if (currentUser) {
        const ref = doc(db, "users", currentUser.uid, "bookmarks", bookmark.id);
        const { id, ...data } = bookmark;
        await setDoc(ref, data);
    } else {
        const idx = bookmarks.findIndex((b) => b.id === bookmark.id);
        if (idx !== -1) bookmarks[idx] = bookmark;
        sortBookmarks(bookmarks);
        saveLocal();
        resetRender();
    }
}

async function removeBookmark(id) {
    if (currentUser) {
        await deleteDoc(doc(db, "users", currentUser.uid, "bookmarks", id));
    } else {
        bookmarks = bookmarks.filter((b) => b.id !== id);
        saveLocal();
        resetRender();
    }
}

// ----- Náhled / obrázek -----
async function fetchPreview(url) {
    const parsed = safeParseUrl(url);
    const hostname = parsed ? parsed.hostname : url;

    try {
        const res = await fetch(PREVIEW_API + encodeURIComponent(url));
        if (!res.ok) throw new Error("HTTP " + res.status);
        const json = await res.json();
        if (json.status !== "success" || !json.data) {
            throw new Error("API odpověď neúspěšná");
        }
        const d = json.data;
        return {
            title: d.title || hostname,
            description: d.description || "",
            image: (d.image && d.image.url) || "",
            domain: d.publisher || hostname,
        };
    } catch (err) {
        console.warn("Náhled se nepodařilo načíst:", err);
        return {
            title: hostname,
            description: "",
            image: "",
            domain: hostname,
        };
    }
}

function safeParseUrl(url) {
    try {
        return new URL(url);
    } catch {
        return null;
    }
}

// ----- Přidání záložky -----
async function handleSubmit(event) {
    event.preventDefault();
    let url = urlEl.value.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) {
        url = "https://" + url;
    }
    if (!safeParseUrl(url)) {
        showStatus("Neplatná URL.", "error");
        return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Načítám…";
    showStatus("Načítám náhled stránky…", "info");

    try {
        const preview = await fetchPreview(url);
        const bookmark = {
            id: generateId(),
            url,
            title: preview.title,
            description: preview.description,
            image: preview.image,
            domain: preview.domain,
            favorite: false,
            tab: activeTab === "all" ? null : activeTab,
            createdAt: Date.now(),
        };
        await persistBookmark(bookmark);
        formEl.reset();
        showStatus("Záložka přidána.", "ok");
    } catch (err) {
        console.error(err);
        showStatus("Chyba: " + err.message, "error");
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "Přidat";
    }
}

function showStatus(text, type) {
    statusEl.textContent = text;
    statusEl.className = "bookmark-status bookmark-status-" + type;
    statusEl.classList.remove("hidden");
    if (type === "ok") {
        setTimeout(() => statusEl.classList.add("hidden"), 2500);
    }
}

// ----- Oblíbené -----
async function toggleFavorite(bookmark) {
    const updated = { ...bookmark, favorite: !bookmark.favorite };
    try {
        await updateBookmark(updated);
    } catch (err) {
        console.error(err);
        alert("Chyba: " + err.message);
    }
}

// ----- Vykreslení s infinite scroll -----
function resetRender() {
    gridEl.innerHTML = "";
    renderedCount = 0;

    const filtered = filteredBookmarks();

    if (filtered.length === 0) {
        emptyEl.classList.remove("hidden");
        emptyEl.textContent =
            activeTab === "all" && bookmarks.length === 0
                ? "Zatím tu nejsou žádné záložky. Vlož nahoře první URL!"
                : "V této záložce nejsou žádné odkazy.";
        endEl.classList.add("hidden");
        disconnectObserver();
        return;
    }
    emptyEl.classList.add("hidden");

    renderNextPage();
    ensureObserver();
}

function renderNextPage() {
    const filtered = filteredBookmarks();
    const nextCount = Math.min(renderedCount + PAGE_SIZE, filtered.length);
    for (let i = renderedCount; i < nextCount; i++) {
        gridEl.appendChild(createTile(filtered[i]));
    }
    renderedCount = nextCount;

    if (renderedCount >= filtered.length) {
        disconnectObserver();
        endEl.classList.remove("hidden");
    } else {
        endEl.classList.add("hidden");
    }
}

function ensureObserver() {
    if (observer) return;
    observer = new IntersectionObserver(
        (entries) => {
            for (const entry of entries) {
                if (entry.isIntersecting && renderedCount < filteredBookmarks().length) {
                    renderNextPage();
                }
            }
        },
        { rootMargin: "200px" }
    );
    observer.observe(sentinelEl);
}

function disconnectObserver() {
    if (observer) {
        observer.disconnect();
        observer = null;
    }
}

function createTile(bookmark) {
    const tile = document.createElement("article");
    tile.className = "bookmark-tile";
    if (bookmark.favorite) tile.classList.add("is-favorite");

    // Klikatelný odkaz
    const link = document.createElement("a");
    link.href = bookmark.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.className = "bookmark-link";
    link.draggable = false;
    tile.appendChild(link);

    // Obrázek
    const imgWrap = document.createElement("div");
    imgWrap.className = "bookmark-image";
    if (bookmark.image) {
        const img = document.createElement("img");
        img.src = bookmark.image;
        img.loading = "lazy";
        img.alt = "";
        img.draggable = false;
        img.addEventListener("error", () => {
            imgWrap.innerHTML = "";
            imgWrap.classList.add("bookmark-image-fallback");
            imgWrap.textContent = "🔗";
        });
        imgWrap.appendChild(img);
    } else {
        imgWrap.classList.add("bookmark-image-fallback");
        imgWrap.textContent = "🔗";
    }
    link.appendChild(imgWrap);

    // Tělo
    const body = document.createElement("div");
    body.className = "bookmark-body";

    const title = document.createElement("h3");
    title.textContent = bookmark.title || bookmark.url;
    body.appendChild(title);

    if (bookmark.description) {
        const desc = document.createElement("p");
        desc.className = "bookmark-description";
        desc.textContent = bookmark.description;
        body.appendChild(desc);
    }

    const domain = document.createElement("p");
    domain.className = "bookmark-domain";
    domain.textContent = bookmark.domain || "";
    body.appendChild(domain);

    link.appendChild(body);

    // Hvězdička (oblíbené)
    const starBtn = document.createElement("button");
    starBtn.type = "button";
    starBtn.className = "bookmark-favorite";
    starBtn.setAttribute(
        "aria-label",
        bookmark.favorite ? "Odebrat z oblíbených" : "Přidat do oblíbených"
    );
    starBtn.textContent = bookmark.favorite ? "★" : "☆";
    starBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleFavorite(bookmark);
    });
    tile.appendChild(starBtn);

    // Výběr záložky (přeřazení)
    const tabSelect = document.createElement("select");
    tabSelect.className = "bookmark-tab-select";
    tabSelect.setAttribute("aria-label", "Přesunout do záložky");
    const tabOptions = [
        { value: "", label: "—" },
        { value: "1", label: "1" },
        { value: "2", label: "2" },
        { value: "3", label: "3" },
        { value: "4", label: "4" },
    ];
    tabOptions.forEach((opt) => {
        const option = document.createElement("option");
        option.value = opt.value;
        option.textContent = opt.label;
        if ((bookmark.tab || "") === opt.value) option.selected = true;
        tabSelect.appendChild(option);
    });
    tabSelect.addEventListener("change", async (e) => {
        e.stopPropagation();
        const newTab = tabSelect.value || null;
        try {
            await updateBookmark({ ...bookmark, tab: newTab });
        } catch (err) {
            console.error(err);
            alert("Chyba: " + err.message);
        }
    });
    tabSelect.addEventListener("click", (e) => e.stopPropagation());
    tile.appendChild(tabSelect);

    // Tlačítko smazání (pravý pruh přes celou výšku)
    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "bookmark-delete";
    delBtn.setAttribute("aria-label", "Smazat záložku");
    delBtn.textContent = "🗑";
    delBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
            await removeBookmark(bookmark.id);
        } catch (err) {
            console.error(err);
            alert("Chyba při mazání: " + err.message);
        }
    });
    tile.appendChild(delBtn);

    return tile;
}
