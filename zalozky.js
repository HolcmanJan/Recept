// Stránka s uživatelskými záložkami (URL → dlaždice s náhledem).
// Metadata stránek se získávají přes vlastní Cloudflare Worker.
import { db } from "./firebase-init.js";
import {
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    deleteDoc,
    onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { initNavigation } from "./navigation.js";

const STORAGE_KEY = "recept.bookmarks.v1";
const PAGE_SIZE = 12;
const FEATURED_COUNT = 8;
const PREVIEW_API = "https://api.microlink.io/?url=";
const PROXY_ENDPOINTS = [
    "https://corsproxy.io/?url=",
    "https://api.allorigins.win/raw?url=",
];
const TABS = ["unassigned", "1", "2", "3", "4", "reddit"];
const TAB_2_PASSWORD = "abc129";

// ===== Šifrování (Web Crypto API: PBKDF2 + AES-GCM) =====

let encKey = null; // CryptoKey po odemčení, jinak null (= šifrování vypnuto)

function b64Enc(buf) {
    return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
function b64Dec(s) {
    return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

async function deriveEncKey(password, saltHex) {
    const km = await crypto.subtle.importKey(
        "raw", new TextEncoder().encode(password),
        { name: "PBKDF2" }, false, ["deriveKey"]
    );
    const salt = Uint8Array.from(saltHex.match(/.{2}/g), (x) => parseInt(x, 16));
    return crypto.subtle.deriveKey(
        { name: "PBKDF2", salt, iterations: 200_000, hash: "SHA-256" },
        km,
        { name: "AES-GCM", length: 256 },
        false, ["encrypt", "decrypt"]
    );
}

async function aeEncrypt(key, text) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv }, key,
        new TextEncoder().encode(text)
    );
    return b64Enc(iv) + "." + b64Enc(ct);
}

async function aeDecrypt(key, token) {
    const p = token.indexOf(".");
    const plain = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: b64Dec(token.slice(0, p)) },
        key, b64Dec(token.slice(p + 1))
    );
    return new TextDecoder().decode(plain);
}

async function encryptBookmark(bm) {
    if (!encKey) return bm;
    const payload = JSON.stringify({
        url: bm.url || "", title: bm.title || "",
        description: bm.description || "",
        image: bm.image || "", domain: bm.domain || "",
    });
    return {
        id: bm.id,
        createdAt: bm.createdAt || Date.now(),
        tab: bm.tab || null,
        favorite: bm.favorite || false,
        _enc: await aeEncrypt(encKey, payload),
    };
}

async function decryptBookmark(raw) {
    if (!raw._enc) return raw; // nešifrovaná (legacy) záložka
    if (!encKey) return raw;   // nemáme klíč — zobraz prázdnou záložku
    try {
        const s = JSON.parse(await aeDecrypt(encKey, raw._enc));
        return {
            id: raw.id, createdAt: raw.createdAt,
            tab: raw.tab || null, favorite: raw.favorite || false,
            ...s,
        };
    } catch {
        return null; // špatný klíč nebo poškozená data
    }
}

// ----- Inicializace šifrování -----

async function initEncryption() {
    if (!currentUser) return;
    const metaRef = doc(db, "users", currentUser.uid, "meta", "enc");
    let meta = null;
    try {
        const snap = await getDoc(metaRef);
        if (snap.exists()) meta = snap.data();
    } catch (err) {
        console.error("Nelze načíst enc meta:", err);
        return;
    }

    if (meta && meta.enabled && meta.salt) {
        await showEncDialog({ mode: "unlock", salt: meta.salt, verify: meta.verify });
    } else if (!meta) {
        const result = await showEncDialog({ mode: "setup" });
        if (result) {
            await setDoc(metaRef, { enabled: true, salt: result.salt, verify: result.verify });
            await migrateBookmarks();
        } else {
            await setDoc(metaRef, { enabled: false });
        }
    }
    // meta.enabled === false → šifrování trvale vypnuto, nic nedělat
}

async function migrateBookmarks() {
    if (!currentUser || !encKey) return;
    const colRef = collection(db, "users", currentUser.uid, "bookmarks");
    const snap = await getDocs(colRef);
    const unenc = snap.docs.filter((d) => !d.data()._enc);
    await Promise.all(unenc.map(async (d) => {
        const bm = { id: d.id, ...d.data() };
        const enc = await encryptBookmark(bm);
        const { id, ...data } = enc;
        await setDoc(doc(db, "users", currentUser.uid, "bookmarks", id), data);
    }));
}

function showEncDialog({ mode, salt, verify }) {
    return new Promise((resolve) => {
        const overlay  = document.getElementById("enc-overlay");
        const titleEl  = document.getElementById("enc-title");
        const descEl   = document.getElementById("enc-desc");
        const pwdEl    = document.getElementById("enc-password");
        const errEl    = document.getElementById("enc-error");
        const submitBtn = document.getElementById("enc-submit");
        const skipBtn  = document.getElementById("enc-skip");

        pwdEl.value = "";
        errEl.classList.add("hidden");
        overlay.classList.remove("hidden");

        if (mode === "setup") {
            titleEl.textContent = "Šifrování záložek";
            descEl.textContent  = "Nastav heslo pro šifrování záložek v databázi. Heslo nikde neukládáme — bez něj záložky nepůjdou zobrazit.";
            submitBtn.textContent = "Nastavit heslo";
            skipBtn.classList.remove("hidden");
        } else {
            titleEl.textContent = "Záložky jsou zašifrované";
            descEl.textContent  = "Zadej heslo pro odemčení záložek.";
            submitBtn.textContent = "Odemknout";
            skipBtn.classList.add("hidden");
        }

        setTimeout(() => pwdEl.focus(), 50);

        async function onSubmit() {
            const pwd = pwdEl.value.trim();
            if (!pwd) return;
            submitBtn.disabled = true;
            errEl.classList.add("hidden");
            try {
                let useSalt   = salt;
                let useVerify = verify;

                if (mode === "setup") {
                    const bytes = crypto.getRandomValues(new Uint8Array(16));
                    useSalt = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
                }

                const key = await deriveEncKey(pwd, useSalt);

                if (mode === "unlock") {
                    await aeDecrypt(key, useVerify); // hodí výjimku při špatném hesle
                } else {
                    useVerify = await aeEncrypt(key, "ok");
                }

                encKey = key;
                cleanup();
                overlay.classList.add("hidden");
                resolve(mode === "setup" ? { salt: useSalt, verify: useVerify } : true);
            } catch {
                submitBtn.disabled = false;
                errEl.textContent = mode === "unlock" ? "Nesprávné heslo." : "Chyba při generování klíče.";
                errEl.classList.remove("hidden");
                pwdEl.select();
            }
        }

        function onSkip() {
            cleanup();
            overlay.classList.add("hidden");
            resolve(false);
        }

        function onKeydown(e) { if (e.key === "Enter") onSubmit(); }

        function cleanup() {
            submitBtn.removeEventListener("click", onSubmit);
            skipBtn.removeEventListener("click", onSkip);
            pwdEl.removeEventListener("keydown", onKeydown);
            submitBtn.disabled = false;
        }

        submitBtn.addEventListener("click", onSubmit);
        skipBtn.addEventListener("click", onSkip);
        pwdEl.addEventListener("keydown", onKeydown);
    });
}
const REDDIT_POST_LIMIT = 5; // kolik příspěvků načíst ze subredditu
const WORKER_API = "https://link-preview.recept.workers.dev/?url=";

// ----- Stav -----
let bookmarks = [];
let currentUser = null;
let unsubscribeBookmarks = null;
let renderedCount = 0;
let observer = null;
let _patchBookmarkId = null; // ID záložky pro in-place patch místo resetRender
let activeTab = "unassigned";
let tab2Unlocked = false;

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
const featuredEl = document.getElementById("bookmark-featured");
const featuredGridEl = document.getElementById("bookmark-featured-grid");
const featuredRefreshBtn = document.getElementById("featured-refresh");
const featuredFixBtn = document.getElementById("featured-fix");

featuredRefreshBtn.addEventListener("click", () => {
    renderFeatured();
});

featuredFixBtn.addEventListener("click", () => {
    fixBrokenPreviews();
});

// ----- Bookmarklet -----
// Kód bookmarkletu — čte meta tagy, JSON-LD, link[rel] a fallback <img> přímo ze stránky
function buildBookmarkletHref() {
    const appUrl = location.origin + location.pathname;
    const code = `(function(){
function g(a){var e=document.querySelector('meta[property="'+a+'"],meta[name="'+a+'"],meta[itemprop="'+a.replace(/^og:/,"")+'"]');return e?e.getAttribute('content')||'':(a==='og:title'?document.title||'':'');}
var u=encodeURIComponent;
var t=g('og:title')||g('twitter:title')||document.title||'';
var d=g('og:description')||g('twitter:description')||g('description')||'';
var i=g('og:image')||g('og:image:url')||g('twitter:image')||g('twitter:image:src')||g('image');
if(!i){var lk=document.querySelector('link[rel="image_src"],link[rel="icon"][sizes="192x192"],link[rel="apple-touch-icon"]');if(lk)i=lk.href||'';}
if(!i){try{document.querySelectorAll('script[type="application/ld+json"]').forEach(function(sc){if(i)return;var j=JSON.parse(sc.textContent);function f(n){if(!n||typeof n!=='object')return'';if(Array.isArray(n)){for(var x=0;x<n.length;x++){var r=f(n[x]);if(r)return r;}return'';}if(n.image){if(typeof n.image==='string')return n.image;if(Array.isArray(n.image)){var r2=f(n.image);if(r2)return r2;}if(n.image.url)return n.image.url;}if(n['@graph'])return f(n['@graph']);return'';}i=f(j);});}catch(e){}}
if(!i){var imgs=document.querySelectorAll('article img[src],main img[src],[role="main"] img[src],#content img[src],.post img[src]');if(!imgs.length)imgs=document.querySelectorAll('img[src]');for(var m=0;m<imgs.length;m++){var src=imgs[m].src;if(!src||/^data:|favicon|spacer|pixel|blank|tracking|1x1|sprite|logo.*\\.(ico|svg)/i.test(src))continue;var w=imgs[m].naturalWidth||imgs[m].width,h=imgs[m].naturalHeight||imgs[m].height;if((w>0&&w<150)||(h>0&&h<150))continue;i=src;break;}}
if(i&&!/^https?:\\/\\//i.test(i)){i=i.indexOf('//')==0?'https:'+i:i[0]==='/'?location.origin+i:location.origin+'/'+i;}
var s=g('og:site_name')||location.hostname.replace(/^www\\./,'');
window.open('${appUrl}?bm_url='+u(location.href)+'&bm_title='+u(t)+'&bm_desc='+u(d)+'&bm_image='+u(i)+'&bm_domain='+u(s));
})();`;
    return "javascript:" + code.replace(/\n\s*/g, "");
}

document.getElementById("bookmarklet-link").href = buildBookmarkletHref();

// Pokud byla stránka otevřena bookmarkletem, zpracuj parametry a ulož záložku
const BM_PARAMS = (() => {
    const p = new URLSearchParams(location.search);
    if (!p.has("bm_url")) return null;
    return {
        url:    p.get("bm_url")    || "",
        title:  p.get("bm_title")  || "",
        desc:   p.get("bm_desc")   || "",
        image:  p.get("bm_image")  || "",
        domain: p.get("bm_domain") || "",
    };
})();

// Odstraň parametry z URL baru (bez přesměrování)
if (BM_PARAMS) {
    history.replaceState(null, "", location.pathname);
}

// ----- Záložkové přepínače -----
tabsEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".bookmark-tab");
    if (!btn) return;
    const tab = btn.dataset.tab;
    if (tab === activeTab) return;

    // Heslem chráněná složka 2
    if (tab === "2" && !tab2Unlocked) {
        const pwd = prompt("Heslo pro složku 2:");
        if (pwd === null) return;
        if (pwd !== TAB_2_PASSWORD) {
            alert("Nesprávné heslo.");
            return;
        }
        tab2Unlocked = true;
    }

    activeTab = tab;
    tabsEl.querySelectorAll(".bookmark-tab").forEach((b) => {
        b.classList.toggle("active", b.dataset.tab === activeTab);
    });
    resetRender();
});

// ----- Filtr podle složky -----
function filteredBookmarks() {
    if (activeTab === "unassigned") {
        return bookmarks.filter((b) => !b.tab);
    }
    return bookmarks.filter((b) => b.tab === activeTab);
}

// ----- Reddit -----
function isRedditUrl(url) {
    const u = safeParseUrl(url);
    if (!u) return false;
    const h = u.hostname.toLowerCase();
    return h === "reddit.com" ||
        h === "www.reddit.com" ||
        h === "old.reddit.com" ||
        h === "new.reddit.com" ||
        h === "np.reddit.com" ||
        h === "m.reddit.com";
}

function redditJsonUrl(url) {
    const u = safeParseUrl(url);
    if (!u) return null;
    // Odstraň query + fragment, znormalizuj host na www, přidej .json
    let pathname = u.pathname;
    if (pathname.endsWith("/")) pathname = pathname.slice(0, -1);
    const base = "https://www.reddit.com" + pathname + ".json";
    const params = new URLSearchParams();
    params.set("raw_json", "1");
    params.set("limit", String(REDDIT_POST_LIMIT));
    return base + "?" + params.toString();
}

async function fetchRedditJson(jsonUrl) {
    // 1) Zkus přímo
    try {
        const res = await fetch(jsonUrl);
        if (res.ok) {
            const text = await res.text();
            const trimmed = text.trim();
            // Reddit vrací 200 s HTML challenge, když to vyhodnotí jako bota
            if (!trimmed.startsWith("<")) {
                return JSON.parse(trimmed);
            }
            console.warn("Reddit vrátil HTML (blokování), zkouším proxy");
        } else {
            console.warn("Reddit přímo: HTTP " + res.status);
        }
    } catch (err) {
        console.warn("Přímé volání Redditu selhalo:", err.message || err);
    }

    // 2) Fallback přes veřejnou CORS proxy
    const proxies = [
        "https://corsproxy.io/?url=" + encodeURIComponent(jsonUrl),
        "https://api.allorigins.win/raw?url=" + encodeURIComponent(jsonUrl),
    ];
    let lastErr;
    for (const proxyUrl of proxies) {
        try {
            const res = await fetch(proxyUrl);
            if (!res.ok) {
                lastErr = new Error("Proxy HTTP " + res.status);
                continue;
            }
            const text = await res.text();
            const trimmed = text.trim();
            if (trimmed.startsWith("<")) {
                lastErr = new Error("Proxy vrátila HTML");
                continue;
            }
            return JSON.parse(trimmed);
        } catch (err) {
            lastErr = err;
        }
    }
    throw lastErr || new Error("Všechny zdroje selhaly");
}

async function fetchRedditPosts(url) {
    const jsonUrl = redditJsonUrl(url);
    if (!jsonUrl) throw new Error("Neplatná Reddit URL");
    const data = await fetchRedditJson(jsonUrl);
    // Endpoint příspěvku vrací pole [postListing, commentsListing]; subreddit vrací jen listing.
    let listing;
    if (Array.isArray(data)) {
        listing = data[0];
    } else {
        listing = data;
    }
    const children = (listing && listing.data && listing.data.children) || [];
    return children
        .map((c) => c.data)
        .filter((p) => p && p.kind !== "more");
}

function pickBestRedditImage(post) {
    // Priorita: preview.images > thumbnail > url_overridden_by_dest (pokud obrázek)
    try {
        const pv = post.preview && post.preview.images && post.preview.images[0];
        if (pv) {
            const resolutions = pv.resolutions || [];
            // Vezmi prostřední/větší rozlišení (<= 960 px široké)
            const pref = resolutions.filter((r) => r.width <= 960).pop();
            if (pref) return pref.url;
            if (pv.source && pv.source.url) return pv.source.url;
        }
    } catch (_) {}
    const thumb = post.thumbnail;
    if (thumb && /^https?:\/\//.test(thumb)) return thumb;
    const target = post.url_overridden_by_dest || post.url;
    if (target && /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(target)) return target;
    return "";
}

function formatScore(n) {
    if (typeof n !== "number") return "0";
    if (Math.abs(n) >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "k";
    return String(n);
}

function timeAgo(unixSec) {
    if (!unixSec) return "";
    const diff = Date.now() / 1000 - unixSec;
    if (diff < 60) return "před chvílí";
    if (diff < 3600) return "před " + Math.floor(diff / 60) + " min";
    if (diff < 86400) return "před " + Math.floor(diff / 3600) + " h";
    if (diff < 86400 * 30) return "před " + Math.floor(diff / 86400) + " dny";
    if (diff < 86400 * 365) return "před " + Math.floor(diff / (86400 * 30)) + " měs.";
    return "před " + Math.floor(diff / (86400 * 365)) + " r.";
}

// ----- Inicializace navigace + reakce na změnu uživatele -----
let bmAutoSaveDone = false;

initNavigation("zalozky", async (user) => {
    currentUser = user;

    if (unsubscribeBookmarks) {
        unsubscribeBookmarks();
        unsubscribeBookmarks = null;
    }

    if (user) {
        await initEncryption();

        const ref = collection(db, "users", user.uid, "bookmarks");
        unsubscribeBookmarks = onSnapshot(
            ref,
            async (snapshot) => {
                const raw = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
                const decrypted = await Promise.all(raw.map(decryptBookmark));
                bookmarks = decrypted.filter(Boolean);
                sortBookmarks(bookmarks);
                const patchId = _patchBookmarkId;
                _patchBookmarkId = null;
                if (patchId) {
                    patchTileById(patchId);
                } else {
                    resetRender();
                }
                // Auto-save z bookmarkletu — až víme kdo je přihlášen
                if (BM_PARAMS && !bmAutoSaveDone) {
                    bmAutoSaveDone = true;
                    saveBookmarkletData(BM_PARAMS);
                }
            },
            (err) => {
                console.error("Firestore chyba:", err);
                alert("Chyba při načítání záložek: " + err.message);
            }
        );
    } else {
        bookmarks = loadLocal();
        resetRender();
        if (BM_PARAMS && !bmAutoSaveDone) {
            bmAutoSaveDone = true;
            saveBookmarkletData(BM_PARAMS);
        }
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
        const enc = await encryptBookmark(bookmark);
        const ref = doc(db, "users", currentUser.uid, "bookmarks", enc.id);
        const { id, ...data } = enc;
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
        const enc = await encryptBookmark(bookmark);
        const ref = doc(db, "users", currentUser.uid, "bookmarks", enc.id);
        const { id, ...data } = enc;
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
// Řetěz: site-specific → microlink → og:image a další z HTML (přes proxy) → Wikipedia API
async function fetchPreview(url) {
    const parsed = safeParseUrl(url);
    const hostname = parsed ? parsed.hostname : url;

    let title = "";
    let description = "";
    let image = "";
    let domain = hostname;

    // 0) Site-specific: YouTube, Imgur — okamžité, bez sítě
    const siteImg = getSiteSpecificImage(url);
    if (siteImg) image = siteImg;

    // 1) microlink.io
    try {
        const res = await fetch(PREVIEW_API + encodeURIComponent(url));
        if (res.ok) {
            const json = await res.json();
            if (json.status === "success" && json.data) {
                const d = json.data;
                title = d.title || "";
                description = d.description || "";
                if (!image && d.image && d.image.url) image = d.image.url;
                if (d.publisher) domain = d.publisher;
            }
        }
    } catch (err) {
        console.warn("microlink selhal:", err && err.message);
    }

    // 2) Fallback: parsování meta/link/JSON-LD z HTML přes CORS proxy
    if (!image || !title) {
        const og = await fetchOpenGraph(url);
        if (og) {
            if (!image && og.image) image = og.image;
            if (!title && og.title) title = og.title;
            if (!description && og.description) description = og.description;
            if (og.siteName && domain === hostname) domain = og.siteName;
        }
    }

    // 3) Wikipedia REST API
    if (!image) {
        const wp = await getWikipediaImage(url);
        if (wp) image = wp;
    }

    return {
        title: title || hostname,
        description: description || "",
        image: image || "",
        domain: domain || hostname,
    };
}

function getSiteSpecificImage(url) {
    const parsed = safeParseUrl(url);
    if (!parsed) return "";
    const h = parsed.hostname.toLowerCase().replace(/^www\./, "");

    if (h === "youtube.com" || h === "m.youtube.com" || h === "music.youtube.com") {
        const v = parsed.searchParams.get("v");
        if (v) return "https://img.youtube.com/vi/" + encodeURIComponent(v) + "/hqdefault.jpg";
        const seg = parsed.pathname.split("/").filter(Boolean);
        if ((seg[0] === "shorts" || seg[0] === "embed") && seg[1])
            return "https://img.youtube.com/vi/" + encodeURIComponent(seg[1]) + "/hqdefault.jpg";
    }
    if (h === "youtu.be") {
        const id = parsed.pathname.slice(1).split("/")[0];
        if (id) return "https://img.youtube.com/vi/" + encodeURIComponent(id) + "/hqdefault.jpg";
    }
    if (h === "i.imgur.com") return url;

    return "";
}

async function getWikipediaImage(url) {
    const parsed = safeParseUrl(url);
    if (!parsed) return "";
    const m = parsed.hostname.match(/^([a-z]+)\.wikipedia\.org$/i);
    if (!m) return "";
    const pm = parsed.pathname.match(/^\/wiki\/(.+)$/);
    if (!pm) return "";
    try {
        const res = await fetch(
            "https://" + m[1] + ".wikipedia.org/api/rest_v1/page/summary/" + pm[1]
        );
        if (!res.ok) return "";
        const data = await res.json();
        return (data.thumbnail && data.thumbnail.source) || "";
    } catch (_) {
        return "";
    }
}

async function fetchOpenGraph(url) {
    let html = "";
    for (const proxy of PROXY_ENDPOINTS) {
        try {
            const res = await fetch(proxy + encodeURIComponent(url));
            if (!res.ok) continue;
            const text = await res.text();
            if (text && text.length > 200 && /<html|<head|<meta/i.test(text)) {
                html = text;
                break;
            }
        } catch (_) {}
    }
    if (!html) return null;

    const parsed = safeParseUrl(url);
    const origin = parsed ? parsed.origin : "";

    const metaContent = (attr, value) => {
        const esc = escapeRegex(value);
        const re1 = new RegExp(
            '<meta[^>]+' + attr + '=["\']' + esc + '["\'][^>]*content=["\']([^"\']+)["\']',
            "i"
        );
        const re2 = new RegExp(
            '<meta[^>]+content=["\']([^"\']+)["\'][^>]*' + attr + '=["\']' + esc + '["\']',
            "i"
        );
        const m = html.match(re1) || html.match(re2);
        return m ? decodeEntities(m[1].trim()) : "";
    };

    let image =
        metaContent("property", "og:image") ||
        metaContent("name", "og:image") ||
        metaContent("property", "og:image:url") ||
        metaContent("name", "twitter:image") ||
        metaContent("property", "twitter:image") ||
        metaContent("name", "twitter:image:src") ||
        metaContent("itemprop", "image") ||
        linkHref(html, "image_src") ||
        extractJsonLdImage(html) ||
        findFirstMeaningfulImage(html);
    if (image) image = resolveUrl(image, origin);

    let title =
        metaContent("property", "og:title") ||
        metaContent("name", "twitter:title");
    if (!title) {
        const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        if (t) title = decodeEntities(t[1].trim());
    }

    const description =
        metaContent("property", "og:description") ||
        metaContent("name", "description") ||
        metaContent("name", "twitter:description");

    const siteName = metaContent("property", "og:site_name");

    return { title, description, image, siteName };
}

function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function linkHref(html, rel) {
    const esc = escapeRegex(rel);
    const re1 = new RegExp(
        '<link[^>]+rel=["\']' + esc + '["\'][^>]*href=["\']([^"\']+)["\']',
        "i"
    );
    const re2 = new RegExp(
        '<link[^>]+href=["\']([^"\']+)["\'][^>]*rel=["\']' + esc + '["\']',
        "i"
    );
    const m = html.match(re1) || html.match(re2);
    return m ? decodeEntities(m[1].trim()) : "";
}

function extractJsonLdImage(html) {
    const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
        const raw = m[1].trim();
        if (!raw) continue;
        try {
            const parsed = JSON.parse(raw);
            const img = pickImageFromJsonLd(parsed);
            if (img) return img;
        } catch (_) {}
    }
    return "";
}

function pickImageFromJsonLd(node) {
    if (!node || typeof node !== "object") return "";
    if (Array.isArray(node)) {
        for (const item of node) {
            const r = pickImageFromJsonLd(item);
            if (r) return r;
        }
        return "";
    }
    if (node.image) {
        if (typeof node.image === "string") return node.image;
        if (Array.isArray(node.image)) {
            for (const x of node.image) {
                if (typeof x === "string") return x;
                if (x && typeof x === "object" && x.url) return x.url;
            }
        }
        if (typeof node.image === "object" && node.image.url) return node.image.url;
    }
    if (node["@graph"]) return pickImageFromJsonLd(node["@graph"]);
    return "";
}

function findFirstMeaningfulImage(html) {
    const bodyIdx = html.search(/<body[\s>]/i);
    const start = bodyIdx === -1 ? 0 : bodyIdx;
    const body = html.slice(start);
    const re = /<img\b([^>]*)>/gi;
    let m;
    while ((m = re.exec(body)) !== null) {
        const attrs = m[1];
        const srcMatch = attrs.match(/\bsrc=["']([^"']+)["']/i);
        if (!srcMatch) continue;
        const src = srcMatch[1];
        if (!src || src.startsWith("data:")) continue;
        if (/1x1|pixel|spacer|blank|tracking|analytics|beacon|sprite/i.test(src)) continue;
        const w = parseInt((attrs.match(/\bwidth=["']?(\d+)/i) || [])[1] || "0", 10);
        const h = parseInt((attrs.match(/\bheight=["']?(\d+)/i) || [])[1] || "0", 10);
        if ((w > 0 && w < 120) || (h > 0 && h < 120)) continue;
        return decodeEntities(src);
    }
    return "";
}

function resolveUrl(href, origin) {
    if (/^https?:\/\//i.test(href)) return href;
    if (href.startsWith("//")) return "https:" + href;
    if (href.startsWith("/") && origin) return origin + href;
    return href;
}

function decodeEntities(str) {
    return str
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#0?39;/g, "'")
        .replace(/&#x27;/gi, "'")
        .replace(/&nbsp;/g, " ");
}

// Google favicon služba — spolehlivý poslední fallback při selhání obrázku
function faviconUrl(url) {
    const parsed = safeParseUrl(url);
    if (!parsed) return "";
    return (
        "https://www.google.com/s2/favicons?domain=" +
        encodeURIComponent(parsed.hostname) +
        "&sz=128"
    );
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
        let preview = await fetchPreview(url);

        // Worker fallback pokud chybí obrázek
        if (!preview.image) {
            try {
                const wp = await fetchWorkerPreview(url);
                if (wp) {
                    if (!preview.image && wp.image) preview.image = wp.image;
                    if (!preview.title && wp.title) preview.title = wp.title;
                    if (!preview.description && wp.description) preview.description = wp.description;
                    if (!preview.domain && wp.domain) preview.domain = wp.domain;
                }
            } catch (_) {}
        }

        const bookmark = {
            id: generateId(),
            url,
            title: preview.title,
            description: preview.description,
            image: preview.image,
            domain: preview.domain,
            favorite: false,
            tab: activeTab === "unassigned" ? null : activeTab,
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

// Uloží nebo aktualizuje záložku přijatou přes bookmarklet.
// Data pocházejí přímo z meta tagů stránky — žádný proxy, žádné limity.
async function saveBookmarkletData({ url, title, desc, image, domain }) {
    if (!url) return;
    const parsed = safeParseUrl(url);
    if (!parsed) return;

    // Zkus najít existující záložku se stejnou URL
    const existing = bookmarks.find((b) => b.url === url);

    if (existing) {
        showStatus("Aktualizuji náhled záložky…", "info");
        try {
            await updateBookmark({
                ...existing,
                title:       title  || existing.title,
                description: desc   || existing.description,
                image:       image  || existing.image,
                domain:      domain || existing.domain,
            });
            showStatus("✓ Náhled záložky aktualizován ze stránky.", "ok");
        } catch (err) {
            console.error(err);
            showStatus("Chyba při aktualizaci: " + err.message, "error");
        }
    } else {
        showStatus("Ukládám záložku ze stránky…", "info");
        const bookmark = {
            id: generateId(),
            url,
            title:       title  || parsed.hostname,
            description: desc   || "",
            image:       image  || "",
            domain:      domain || parsed.hostname,
            favorite: false,
            tab: null,
            createdAt: Date.now(),
        };
        try {
            await persistBookmark(bookmark);
            showStatus("✓ Záložka uložena s náhledem ze stránky.", "ok");
        } catch (err) {
            console.error(err);
            showStatus("Chyba při ukládání: " + err.message, "error");
        }
    }
}

// Zkusí Cloudflare Worker — parsuje HTML server-side (bez CORS omezení)
async function fetchWorkerPreview(url) {
    const res = await fetch(WORKER_API + encodeURIComponent(url));
    if (!res.ok) return null;
    const data = await res.json();
    if (data.error && !data.title && !data.image) return null;
    return data;
}

// Přegeneruje náhled záložky: fetchPreview → Worker fallback
async function regenBookmarkPreview(bookmark, btn) {
    if (btn.disabled) return;
    btn.disabled = true;
    btn.textContent = "⏳";
    showStatus("Přegenerovávám náhled…", "info");

    try {
        let preview = await fetchPreview(bookmark.url);

        // Fallback přes Cloudflare Worker pokud chybí obrázek nebo title
        if (!preview.image || !preview.title || preview.title === bookmark.domain) {
            try {
                const wp = await fetchWorkerPreview(bookmark.url);
                if (wp) {
                    if (!preview.image && wp.image) preview.image = wp.image;
                    if ((!preview.title || preview.title === bookmark.domain) && wp.title) preview.title = wp.title;
                    if (!preview.description && wp.description) preview.description = wp.description;
                    if (!preview.domain && wp.domain) preview.domain = wp.domain;
                }
            } catch (err) {
                console.warn("Worker fallback selhal:", err.message);
            }
        }

        const newImg = preview.image || "";
        _patchBookmarkId = bookmark.id;
        await updateBookmark({
            ...bookmark,
            title:       preview.title       || bookmark.title,
            description: preview.description  || bookmark.description,
            image:       newImg,
            domain:      preview.domain       || bookmark.domain,
        });
        showStatus("Náhled přegenerován.", "ok");
    } catch (err) {
        console.error("Regen error:", err);
        showStatus("Nepodařilo se přegenerovat náhled: " + err.message, "error");
    } finally {
        btn.disabled = false;
        btn.textContent = "🔄";
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
    disconnectObserver();

    const filtered = filteredBookmarks();

    // V Reddit složce: jiný layout, žádný featured, žádný infinite scroll
    if (activeTab === "reddit") {
        featuredEl.classList.add("hidden");
        gridEl.classList.add("reddit-grid");
        endEl.classList.add("hidden");

        if (filtered.length === 0) {
            emptyEl.classList.remove("hidden");
            emptyEl.textContent =
                "V Reddit složce nejsou žádné odkazy. Vlož URL příspěvku nebo subredditu.";
            return;
        }
        emptyEl.classList.add("hidden");
        renderRedditFeed(filtered);
        return;
    }

    gridEl.classList.remove("reddit-grid");
    gridEl.classList.toggle("tab-landscape", activeTab === "2");
    featuredGridEl.classList.toggle("tab-landscape", activeTab === "2");
    renderFeatured();

    if (filtered.length === 0) {
        emptyEl.classList.remove("hidden");
        emptyEl.textContent =
            bookmarks.length === 0
                ? "Zatím tu nejsou žádné záložky. Vlož nahoře první URL!"
                : "V této složce nejsou žádné odkazy.";
        endEl.classList.add("hidden");
        return;
    }
    emptyEl.classList.add("hidden");

    renderNextPage();
    ensureObserver();
}

// ----- Reddit feed -----
async function renderRedditFeed(filtered) {
    const reddit = filtered.filter((b) => isRedditUrl(b.url));
    const other = filtered.filter((b) => !isRedditUrl(b.url));

    // Loading skeleton pro reddit URL
    const loadingMap = new Map();
    for (const b of reddit) {
        const sk = document.createElement("article");
        sk.className = "reddit-card reddit-card-loading";
        sk.innerHTML = '<div class="reddit-card-spinner">Načítám příspěvek…</div>';
        gridEl.appendChild(sk);
        loadingMap.set(b.id, sk);
    }

    // Ne-Reddit URL ve složce: zobrazit jako normální dlaždice
    for (const b of other) {
        gridEl.appendChild(createTile(b));
    }

    // Paralelně načti všechny Reddit příspěvky
    await Promise.all(reddit.map(async (bookmark) => {
        const skeleton = loadingMap.get(bookmark.id);
        try {
            const posts = await fetchRedditPosts(bookmark.url);
            if (posts.length === 0) {
                renderRedditError(skeleton, bookmark, "Žádné příspěvky.");
                return;
            }
            const frag = document.createDocumentFragment();
            for (const post of posts) {
                frag.appendChild(createRedditCard(post, bookmark));
            }
            skeleton.replaceWith(frag);
        } catch (err) {
            console.error("Reddit fetch error pro", bookmark.url, err);
            const detail = err && err.message ? " (" + err.message + ")" : "";
            renderRedditError(skeleton, bookmark, "Nelze načíst příspěvek" + detail + ".");
        }
    }));
}

function renderRedditError(skeleton, bookmark, msg) {
    const card = document.createElement("article");
    card.className = "reddit-card reddit-card-error";

    const body = document.createElement("div");
    body.className = "reddit-card-body";

    const title = document.createElement("h3");
    title.className = "reddit-card-title";
    title.textContent = bookmark.title || bookmark.url;
    body.appendChild(title);

    const errP = document.createElement("p");
    errP.className = "reddit-card-desc";
    errP.textContent = msg + " Klikni pro otevření na Redditu.";
    body.appendChild(errP);

    const meta = document.createElement("div");
    meta.className = "reddit-card-meta";
    const link = document.createElement("a");
    link.href = bookmark.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "Otevřít na Redditu →";
    meta.appendChild(link);
    body.appendChild(meta);

    card.appendChild(body);

    // Smazat záložku
    card.appendChild(createRedditDeleteBtn(bookmark));

    skeleton.replaceWith(card);
}

function createRedditCard(post, bookmark) {
    const card = document.createElement("article");
    card.className = "reddit-card";
    if (post.over_18) card.classList.add("reddit-card-nsfw");

    // Hlavička: subreddit · autor · čas
    const head = document.createElement("div");
    head.className = "reddit-card-head";
    const sub = document.createElement("span");
    sub.className = "reddit-card-sub";
    sub.textContent = "r/" + (post.subreddit || "?");
    head.appendChild(sub);
    const sep1 = document.createElement("span");
    sep1.className = "reddit-card-sep";
    sep1.textContent = "·";
    head.appendChild(sep1);
    const author = document.createElement("span");
    author.className = "reddit-card-author";
    author.textContent = "u/" + (post.author || "?");
    head.appendChild(author);
    const sep2 = document.createElement("span");
    sep2.className = "reddit-card-sep";
    sep2.textContent = "·";
    head.appendChild(sep2);
    const time = document.createElement("span");
    time.className = "reddit-card-time";
    time.textContent = timeAgo(post.created_utc);
    head.appendChild(time);
    if (post.over_18) {
        const nsfw = document.createElement("span");
        nsfw.className = "reddit-card-badge reddit-card-badge-nsfw";
        nsfw.textContent = "NSFW";
        head.appendChild(nsfw);
    }
    card.appendChild(head);

    // Titulek (odkaz na post)
    const titleLink = document.createElement("a");
    titleLink.className = "reddit-card-title-link";
    titleLink.href = "https://www.reddit.com" + (post.permalink || "");
    titleLink.target = "_blank";
    titleLink.rel = "noopener noreferrer";
    const title = document.createElement("h3");
    title.className = "reddit-card-title";
    title.textContent = post.title || "";
    titleLink.appendChild(title);
    card.appendChild(titleLink);

    // Obrázek
    const imgUrl = pickBestRedditImage(post);
    if (imgUrl && !post.is_video) {
        const imgWrap = document.createElement("a");
        imgWrap.className = "reddit-card-image";
        imgWrap.href = "https://www.reddit.com" + (post.permalink || "");
        imgWrap.target = "_blank";
        imgWrap.rel = "noopener noreferrer";
        const img = document.createElement("img");
        img.src = imgUrl;
        img.alt = post.title || "";
        img.loading = "lazy";
        img.addEventListener("error", () => imgWrap.remove());
        imgWrap.appendChild(img);
        card.appendChild(imgWrap);
    } else if (post.is_video) {
        const badge = document.createElement("div");
        badge.className = "reddit-card-video-badge";
        badge.textContent = "▶ Video — otevřít na Redditu";
        card.appendChild(badge);
    }

    // Text příspěvku (selftext)
    if (post.selftext && post.selftext.trim()) {
        const desc = document.createElement("p");
        desc.className = "reddit-card-desc";
        const text = post.selftext.trim();
        desc.textContent = text.length > 300 ? text.slice(0, 300) + "…" : text;
        card.appendChild(desc);
    }

    // Patička: skóre, komentáře, odkaz
    const meta = document.createElement("div");
    meta.className = "reddit-card-meta";

    const score = document.createElement("span");
    score.className = "reddit-card-stat";
    score.innerHTML = "▲ <strong>" + formatScore(post.score || 0) + "</strong>";
    meta.appendChild(score);

    const comments = document.createElement("a");
    comments.className = "reddit-card-stat reddit-card-stat-link";
    comments.href = "https://www.reddit.com" + (post.permalink || "");
    comments.target = "_blank";
    comments.rel = "noopener noreferrer";
    comments.innerHTML = "💬 " + formatScore(post.num_comments || 0);
    meta.appendChild(comments);

    // Externí link (pokud post odkazuje mimo Reddit)
    const target = post.url_overridden_by_dest;
    if (target && !target.includes("reddit.com") && !/\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(target)) {
        const ext = document.createElement("a");
        ext.className = "reddit-card-stat reddit-card-stat-link";
        ext.href = target;
        ext.target = "_blank";
        ext.rel = "noopener noreferrer";
        const host = safeParseUrl(target);
        ext.textContent = "🔗 " + (host ? host.hostname.replace(/^www\./, "") : "odkaz");
        meta.appendChild(ext);
    }

    card.appendChild(meta);

    // Smazat zdrojovou záložku (jen u prvního postu ze záložky — tlačítko v rohu)
    card.appendChild(createRedditDeleteBtn(bookmark));

    return card;
}

function createRedditDeleteBtn(bookmark) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "reddit-card-delete";
    btn.setAttribute("aria-label", "Smazat záložku");
    btn.title = "Smazat záložku";
    btn.textContent = "×";
    btn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const ok = window.confirm("Smazat Reddit záložku?\n\n" + (bookmark.title || bookmark.url));
        if (!ok) return;
        try {
            await removeBookmark(bookmark.id);
        } catch (err) {
            console.error(err);
            alert("Chyba: " + err.message);
        }
    });
    return btn;
}

// ----- Náhodný výběr 6 záložek -----
function pickRandom(arr, n) {
    if (arr.length <= n) return arr.slice();
    const picks = [];
    const used = new Set();
    while (picks.length < n) {
        const idx = Math.floor(Math.random() * arr.length);
        if (used.has(idx)) continue;
        used.add(idx);
        picks.push(arr[idx]);
    }
    return picks;
}

function renderFeatured() {
    const filtered = filteredBookmarks();
    featuredGridEl.innerHTML = "";

    if (filtered.length === 0) {
        featuredEl.classList.add("hidden");
        return;
    }
    featuredEl.classList.remove("hidden");

    const picks = pickRandom(filtered, FEATURED_COUNT);
    for (const bookmark of picks) {
        featuredGridEl.appendChild(createFeaturedTile(bookmark));
    }
}

function createFeaturedTile(bookmark) {
    const link = document.createElement("a");
    link.href = bookmark.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.className = "bookmark-featured-item";
    link.title = bookmark.title || bookmark.url;
    link.draggable = false;

    if (bookmark.image) {
        const img = document.createElement("img");
        img.src = bookmark.image;
        img.loading = "lazy";
        img.alt = bookmark.title || "";
        img.draggable = false;
        let triedFavicon = false;
        img.addEventListener("error", () => {
            const fav = faviconUrl(bookmark.url);
            if (!triedFavicon && fav && img.src !== fav) {
                triedFavicon = true;
                link.classList.add("bookmark-featured-favicon");
                img.src = fav;
                return;
            }
            link.innerHTML = "";
            link.classList.remove("bookmark-featured-favicon");
            link.classList.add("bookmark-featured-fallback");
            link.textContent = "🔗";
        });
        link.appendChild(img);
    } else {
        const fav = faviconUrl(bookmark.url);
        if (fav) {
            const img = document.createElement("img");
            img.src = fav;
            img.loading = "lazy";
            img.alt = bookmark.title || "";
            img.draggable = false;
            img.addEventListener("error", () => {
                link.innerHTML = "";
                link.classList.remove("bookmark-featured-favicon");
                link.classList.add("bookmark-featured-fallback");
                link.textContent = "🔗";
            });
            link.classList.add("bookmark-featured-favicon");
            link.appendChild(img);
        } else {
            link.classList.add("bookmark-featured-fallback");
            link.textContent = "🔗";
        }
    }
    return link;
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

// ----- Oprava chybějících náhledů -----
function isImageLoadable(url) {
    return new Promise((resolve) => {
        if (!url) return resolve(false);
        const img = new Image();
        let done = false;
        const finish = (ok) => {
            if (done) return;
            done = true;
            resolve(ok);
        };
        img.onload = () => finish(img.naturalWidth > 0 && img.naturalHeight > 0);
        img.onerror = () => finish(false);
        img.src = url;
        setTimeout(() => finish(false), 8000);
    });
}

// Staré náhledy vygenerované jako screenshot přes thum.io — chceme je přegenerovat
function isLegacyScreenshotUrl(url) {
    return typeof url === "string" && /image\.thum\.io\//i.test(url);
}

// Generický „obrázek stránky" — favicon, apple-touch-icon, manifest ikona, logo apod.
// Tohle není náhled konkrétního URL, takže to chceme přegenerovat.
function isGenericSiteIcon(imageUrl) {
    if (!imageUrl || typeof imageUrl !== "string") return false;
    if (/google\.com\/s2\/favicons/i.test(imageUrl)) return true;
    if (/(?:^|\/)favicon[._-]?\d*\.(?:ico|png|jpe?g|svg|webp|gif)/i.test(imageUrl)) return true;
    if (/\/favicon\b/i.test(imageUrl)) return true;
    if (/apple-touch-icon/i.test(imageUrl)) return true;
    if (/\/icon[-_]\d+(?:x\d+)?\.(?:png|jpe?g|svg|webp)/i.test(imageUrl)) return true;
    if (/\/manifest-icon/i.test(imageUrl)) return true;
    if (/\/site[-_]?logo/i.test(imageUrl)) return true;
    if (/\/touch-icon/i.test(imageUrl)) return true;
    return false;
}

// Mapa hostname → image URL → počet záložek. Když 2+ záložky ze stejné domény
// sdílí přesně stejný obrázek, je to skoro jistě SITE obrázek (logo/banner), ne náhled URL.
function buildSharedImageMap(bookmarksList) {
    const map = new Map();
    for (const b of bookmarksList) {
        if (!b || !b.image || !b.url) continue;
        const u = safeParseUrl(b.url);
        if (!u) continue;
        let inner = map.get(u.hostname);
        if (!inner) {
            inner = new Map();
            map.set(u.hostname, inner);
        }
        inner.set(b.image, (inner.get(b.image) || 0) + 1);
    }
    return map;
}

function isSharedSiteImage(bookmark, sharedMap) {
    if (!bookmark || !bookmark.image || !bookmark.url) return false;
    const u = safeParseUrl(bookmark.url);
    if (!u) return false;
    const inner = sharedMap.get(u.hostname);
    if (!inner) return false;
    return (inner.get(bookmark.image) || 0) >= 2;
}

async function fixBrokenPreviews() {
    const filtered = filteredBookmarks();
    if (filtered.length === 0) {
        showStatus("V této složce nejsou žádné záložky.", "info");
        return;
    }

    featuredFixBtn.disabled = true;
    featuredFixBtn.classList.add("is-loading");

    // Mapa pro detekci sdílených site obrázků (počítáno přes všechny záložky, ne jen filtr)
    const sharedMap = buildSharedImageMap(bookmarks);

    let fixed = 0;
    let checked = 0;

    try {
        for (const bookmark of filtered) {
            checked++;
            showStatus(
                "Opravuji náhledy… " + checked + "/" + filtered.length,
                "info"
            );

            const legacy = isLegacyScreenshotUrl(bookmark.image);
            const generic =
                isGenericSiteIcon(bookmark.image) || isSharedSiteImage(bookmark, sharedMap);
            // Když máme legacy screenshot nebo generickou ikonu, vždy přegenerovat
            const works = !legacy && !generic && (await isImageLoadable(bookmark.image));
            if (works) continue;

            try {
                const preview = await fetchPreview(bookmark.url);
                // Pokud i nový náhled je generický, raději ho zahodíme (favicon až při renderu)
                let newImg = preview.image || "";
                if (newImg && isGenericSiteIcon(newImg)) newImg = "";

                if (legacy || generic || (newImg && newImg !== bookmark.image)) {
                    await updateBookmark({
                        ...bookmark,
                        title: preview.title || bookmark.title,
                        description: preview.description || bookmark.description,
                        image: newImg,
                        domain: preview.domain || bookmark.domain,
                    });
                    fixed++;
                }
            } catch (err) {
                console.warn("Nelze aktualizovat náhled pro", bookmark.url, err);
            }

            // Šetrné tempo vůči microlink.io
            await new Promise((r) => setTimeout(r, 300));
        }

        showStatus(
            "Opraveno " + fixed + " z " + filtered.length + " záložek.",
            "ok"
        );
    } finally {
        featuredFixBtn.disabled = false;
        featuredFixBtn.classList.remove("is-loading");
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
    tile.dataset.bookmarkId = bookmark.id;
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
        let triedFavicon = false;
        img.addEventListener("error", () => {
            const fav = faviconUrl(bookmark.url);
            if (!triedFavicon && fav && img.src !== fav) {
                triedFavicon = true;
                imgWrap.classList.add("bookmark-image-favicon");
                img.src = fav;
                return;
            }
            imgWrap.innerHTML = "";
            imgWrap.classList.remove("bookmark-image-favicon");
            imgWrap.classList.add("bookmark-image-fallback");
            imgWrap.textContent = "🔗";
        });
        imgWrap.appendChild(img);
    } else {
        const fav = faviconUrl(bookmark.url);
        if (fav) {
            const img = document.createElement("img");
            img.src = fav;
            img.loading = "lazy";
            img.alt = "";
            img.draggable = false;
            img.addEventListener("error", () => {
                imgWrap.innerHTML = "";
                imgWrap.classList.remove("bookmark-image-favicon");
                imgWrap.classList.add("bookmark-image-fallback");
                imgWrap.textContent = "🔗";
            });
            imgWrap.classList.add("bookmark-image-favicon");
            imgWrap.appendChild(img);
        } else {
            imgWrap.classList.add("bookmark-image-fallback");
            imgWrap.textContent = "🔗";
        }
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
        { value: "reddit", label: "R" },
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

    // Tlačítko smazání
    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "bookmark-delete";
    delBtn.setAttribute("aria-label", "Smazat záložku");
    delBtn.textContent = "🗑";
    delBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const label = bookmark.title || bookmark.url;
        const ok = window.confirm("Opravdu smazat záložku?\n\n" + label);
        if (!ok) return;
        try {
            await removeBookmark(bookmark.id);
        } catch (err) {
            console.error(err);
            alert("Chyba při mazání: " + err.message);
        }
    });

    // Tlačítko přegenerování náhledu přes bookmarklet v popupu
    const regenBtn = document.createElement("button");
    regenBtn.type = "button";
    regenBtn.className = "bookmark-regen";
    regenBtn.setAttribute("aria-label", "Přegenerovat náhled");
    regenBtn.title = "Přegenerovat náhled (otevře stránku, klikni na 📌 v liště)";
    regenBtn.textContent = "🔄";
    regenBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        regenBookmarkPreview(bookmark, regenBtn);
    });

    const controls = document.createElement("div");
    controls.className = "bookmark-controls";
    controls.appendChild(regenBtn);
    controls.appendChild(tabSelect);
    controls.appendChild(delBtn);
    tile.appendChild(controls);

    return tile;
}

// Nahradí jeden tile na místě bez resetRender (zachová scroll pozici)
function patchTileById(id) {
    const bm = bookmarks.find((b) => b.id === id);
    if (!bm) return;
    const old = gridEl.querySelector(`[data-bookmark-id="${id}"]`);
    if (!old) return;
    old.replaceWith(createTile(bm));
}
