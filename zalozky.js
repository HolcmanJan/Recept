// Stránka s uživatelskými záložkami (URL → dlaždice s náhledem).
// Metadata stránek se získávají přes microlink.io, screenshot fallback přes thum.io.
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
    if (bookmark.favorite) tile.classList.add("is-favorite");

    // Pozadí pro swipe (ikony smazání vlevo i vpravo)
    const swipeBg = document.createElement("div");
    swipeBg.className = "bookmark-swipe-bg";
    swipeBg.innerHTML =
        '<span class="bookmark-swipe-icon">🗑</span>' +
        '<span class="bookmark-swipe-icon">🗑</span>';
    tile.appendChild(swipeBg);

    // Posuvná část (obsahuje všechno viditelné)
    const content = document.createElement("div");
    content.className = "bookmark-swipe-content";
    tile.appendChild(content);

    // Klikatelný odkaz
    const link = document.createElement("a");
    link.href = bookmark.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.className = "bookmark-link";
    link.draggable = false;
    content.appendChild(link);

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
    // Zastav bublání pointerdown, aby hvězda nespustila swipe
    starBtn.addEventListener("pointerdown", (e) => e.stopPropagation());
    content.appendChild(starBtn);

    // Swipe na smazání
    attachSwipe(tile, content, async () => {
        try {
            await removeBookmark(bookmark.id);
        } catch (err) {
            console.error(err);
            alert("Chyba při mazání: " + err.message);
            // Vrať dlaždici zpět
            tile.style.maxHeight = "";
            tile.style.opacity = "";
            content.style.transform = "translateX(0)";
        }
    });

    return tile;
}

// ----- Swipe gesture -----
function attachSwipe(tileEl, contentEl, onDelete) {
    let startX = 0;
    let currentDx = 0;
    let pressed = false;
    let swiping = false;
    let justSwiped = false;

    contentEl.style.touchAction = "pan-y";

    function onDown(e) {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        pressed = true;
        swiping = false;
        startX = e.clientX;
        currentDx = 0;
        contentEl.style.transition = "none";
        // Pointer capture jen pro touch – na myši blokuje klik na <a>
        if (e.pointerType !== "mouse") {
            try {
                contentEl.setPointerCapture(e.pointerId);
            } catch {}
        }
    }

    function onMove(e) {
        if (!pressed) return;
        const dx = e.clientX - startX;
        if (!swiping && Math.abs(dx) > 10) {
            swiping = true;
            tileEl.classList.add("swiping");
        }
        if (swiping) {
            currentDx = dx;
            contentEl.style.transform = "translateX(" + dx + "px)";
            e.preventDefault();
        }
    }

    function onUp() {
        if (!pressed) return;
        pressed = false;
        contentEl.style.transition = "transform 0.22s ease";

        const threshold = Math.max(80, tileEl.offsetWidth * 0.35);
        if (swiping && Math.abs(currentDx) > threshold) {
            // Dokonči swipe – animuj ven a odstraň
            const dir = currentDx > 0 ? 1 : -1;
            contentEl.style.transform =
                "translateX(" + dir * tileEl.offsetWidth * 1.1 + "px)";
            const h = tileEl.offsetHeight;
            tileEl.style.maxHeight = h + "px";
            // Vynucení reflow, aby přechod výšky startoval z aktuální hodnoty
            void tileEl.offsetHeight;
            tileEl.style.transition =
                "max-height 0.22s ease, opacity 0.22s ease, margin 0.22s ease, padding 0.22s ease";
            requestAnimationFrame(() => {
                tileEl.style.maxHeight = "0px";
                tileEl.style.opacity = "0";
                tileEl.style.marginTop = "0px";
                tileEl.style.marginBottom = "0px";
                tileEl.style.paddingTop = "0px";
                tileEl.style.paddingBottom = "0px";
            });
            justSwiped = true;
            setTimeout(() => {
                onDelete();
                tileEl.classList.remove("swiping");
            }, 240);
        } else {
            contentEl.style.transform = "translateX(0)";
            if (swiping) justSwiped = true;
            setTimeout(() => {
                tileEl.classList.remove("swiping");
            }, 220);
        }
        swiping = false;
        setTimeout(() => {
            justSwiped = false;
        }, 50);
    }

    // Zabraň kliknutí, když došlo ke swipe gestu
    contentEl.addEventListener(
        "click",
        (e) => {
            if (justSwiped || Math.abs(currentDx) > 10) {
                e.preventDefault();
                e.stopPropagation();
            }
        },
        true
    );

    contentEl.addEventListener("pointerdown", onDown);
    contentEl.addEventListener("pointermove", onMove);
    contentEl.addEventListener("pointerup", onUp);
    contentEl.addEventListener("pointercancel", onUp);
}
