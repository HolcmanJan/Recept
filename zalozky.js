// Stránka s uživatelskými záložkami (URL → dlaždice s náhledem).
// Metadata stránek se získávají přes volně dostupné API microlink.io.
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

// ----- Stav -----
let bookmarks = [];
let currentUser = null;
let unsubscribeBookmarks = null;
let renderedCount = 0;
let observer = null;

// ----- DOM -----
const formEl = document.getElementById("bookmark-form");
const urlEl = document.getElementById("bookmark-url");
const submitBtn = document.getElementById("bookmark-submit");
const statusEl = document.getElementById("bookmark-status");
const gridEl = document.getElementById("bookmarks-grid");
const emptyEl = document.getElementById("bookmarks-empty");
const sentinelEl = document.getElementById("scroll-sentinel");
const endEl = document.getElementById("bookmarks-end");

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
                bookmarks = snapshot.docs
                    .map((d) => ({ id: d.id, ...d.data() }))
                    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
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

// ----- Ukládání -----
function loadLocal() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
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

async function persistBookmark(bookmark) {
    if (currentUser) {
        const ref = doc(db, "users", currentUser.uid, "bookmarks", bookmark.id);
        const { id, ...data } = bookmark;
        await setDoc(ref, data);
    } else {
        bookmarks.unshift(bookmark);
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

// ----- Načtení náhledu z URL -----
async function fetchPreview(url) {
    try {
        const res = await fetch(PREVIEW_API + encodeURIComponent(url));
        if (!res.ok) throw new Error("HTTP " + res.status);
        const json = await res.json();
        if (json.status !== "success" || !json.data) {
            throw new Error("API odpověď neúspěšná");
        }
        const d = json.data;
        const parsed = safeParseUrl(url);
        return {
            title: d.title || (parsed ? parsed.hostname : url),
            description: d.description || "",
            image: d.image && d.image.url ? d.image.url : "",
            domain: d.publisher || (parsed ? parsed.hostname : ""),
        };
    } catch (err) {
        console.warn("Náhled se nepodařilo načíst, použije se fallback:", err);
        const parsed = safeParseUrl(url);
        return {
            title: parsed ? parsed.hostname : url,
            description: "",
            image: "",
            domain: parsed ? parsed.hostname : "",
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

// ----- Vykreslení s infinite scroll -----
function resetRender() {
    gridEl.innerHTML = "";
    renderedCount = 0;

    if (bookmarks.length === 0) {
        emptyEl.classList.remove("hidden");
        endEl.classList.add("hidden");
        disconnectObserver();
        return;
    }
    emptyEl.classList.add("hidden");

    renderNextPage();
    ensureObserver();
}

function renderNextPage() {
    const nextCount = Math.min(renderedCount + PAGE_SIZE, bookmarks.length);
    for (let i = renderedCount; i < nextCount; i++) {
        gridEl.appendChild(createTile(bookmarks[i]));
    }
    renderedCount = nextCount;

    if (renderedCount >= bookmarks.length) {
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
                if (entry.isIntersecting && renderedCount < bookmarks.length) {
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

    const link = document.createElement("a");
    link.href = bookmark.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.className = "bookmark-link";

    const imgWrap = document.createElement("div");
    imgWrap.className = "bookmark-image";
    if (bookmark.image) {
        const img = document.createElement("img");
        img.src = bookmark.image;
        img.alt = "";
        img.loading = "lazy";
        img.addEventListener("error", () => {
            imgWrap.classList.add("bookmark-image-fallback");
            imgWrap.textContent = "🔗";
        });
        imgWrap.appendChild(img);
    } else {
        imgWrap.classList.add("bookmark-image-fallback");
        imgWrap.textContent = "🔗";
    }
    link.appendChild(imgWrap);

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
    tile.appendChild(link);

    const delBtn = document.createElement("button");
    delBtn.className = "bookmark-delete";
    delBtn.setAttribute("aria-label", "Smazat záložku");
    delBtn.textContent = "×";
    delBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const ok = window.confirm("Smazat tuto záložku?");
        if (!ok) return;
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
