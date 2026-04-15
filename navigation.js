// Sdílená navigace: spodní lišta s rozcestníky + auth UI na stránce Nastavení.
import {
    auth,
    onAuthStateChanged,
    signInWithGoogle,
    signOutUser,
} from "./firebase-init.js";

const NAV_ITEMS = [
    { key: "home", label: "Domů", icon: "🏠", href: "index.html" },
    { key: "recepty", label: "Recepty", icon: "🍳", href: "recepty.html" },
    { key: "rozpocet", label: "Rozpočet", icon: "💰", href: "rozpocet.html" },
    { key: "cviceni", label: "Cvičení", icon: "💪", href: "cviceni.html" },
    { key: "nastaveni", label: "Nastavení", icon: "⚙", href: "nastaveni.html" },
];

// Jednotný vstupní bod pro inicializaci navigace na stránce.
export function initNavigation(activePage, onUserChange) {
    renderBottomNav(activePage);
    ensureHeaderAvatar(activePage);
    initAuth(onUserChange);
}

// ----- Avatar v horní liště -----
function ensureHeaderAvatar(activePage) {
    const headerInner = document.querySelector("header .header-inner");
    if (!headerInner) return;
    if (headerInner.querySelector(".user-avatar")) return;

    const a = document.createElement("a");
    a.id = "user-avatar";
    a.className = "user-avatar user-avatar-loading";
    a.href = "nastaveni.html";
    a.setAttribute("aria-label", "Účet");
    a.title = "Účet";

    // Na stránce Nastavení nedává smysl navigovat jinam
    if (activePage === "nastaveni") {
        a.setAttribute("aria-current", "page");
    }

    // Výchozí placeholder (siluety)
    a.innerHTML = '<span class="user-avatar-placeholder">👤</span>';

    // Přidej do pravé části hlavičky (vedle .header-actions pokud existuje)
    const actions = headerInner.querySelector(".header-actions");
    if (actions) {
        actions.appendChild(a);
    } else {
        headerInner.appendChild(a);
    }
}

function updateHeaderAvatar(user) {
    const a = document.getElementById("user-avatar");
    if (!a) return;
    a.classList.remove("user-avatar-loading");
    a.innerHTML = "";

    if (!user) {
        a.classList.remove("is-signed-in");
        const span = document.createElement("span");
        span.className = "user-avatar-placeholder";
        span.textContent = "👤";
        a.appendChild(span);
        a.title = "Přihlásit se";
        return;
    }

    a.classList.add("is-signed-in");
    a.title = user.displayName || user.email || "Účet";

    if (user.photoURL) {
        const img = document.createElement("img");
        img.src = user.photoURL;
        img.alt = user.displayName || "Účet";
        img.referrerPolicy = "no-referrer";
        img.addEventListener("error", () => {
            img.remove();
            a.appendChild(buildInitialSpan(user));
        });
        a.appendChild(img);
    } else {
        a.appendChild(buildInitialSpan(user));
    }
}

function buildInitialSpan(user) {
    const span = document.createElement("span");
    span.className = "user-avatar-initial";
    const src = user.displayName || user.email || "?";
    span.textContent = src.trim().charAt(0).toUpperCase();
    return span;
}

function renderBottomNav(activePage) {
    // Odeber starý side-menu root (pokud z minulých verzí HTML zbyl)
    const oldRoot = document.getElementById("side-menu-root");
    if (oldRoot) oldRoot.remove();

    // Schovej hamburger tlačítko z headeru (pokud ho HTML stránky ještě obsahuje)
    const oldBtn = document.getElementById("hamburger-btn");
    if (oldBtn) oldBtn.remove();

    // Existující lišta (např. při opakovaném volání)
    let nav = document.getElementById("bottom-nav");
    if (nav) nav.remove();

    nav = document.createElement("nav");
    nav.id = "bottom-nav";
    nav.className = "bottom-nav";
    nav.setAttribute("aria-label", "Hlavní navigace");

    for (const item of NAV_ITEMS) {
        const a = document.createElement("a");
        a.href = item.href;
        a.className = "bottom-nav-item";
        if (item.key === activePage) a.classList.add("active");

        const icon = document.createElement("span");
        icon.className = "bottom-nav-icon";
        icon.textContent = item.icon;
        a.appendChild(icon);

        const lbl = document.createElement("span");
        lbl.className = "bottom-nav-label";
        lbl.textContent = item.label;
        a.appendChild(lbl);

        nav.appendChild(a);
    }

    document.body.appendChild(nav);
    document.body.classList.add("has-bottom-nav");
}

function initAuth(onUserChange) {
    renderAuthArea(null, false);
    onAuthStateChanged(auth, (user) => {
        renderAuthArea(user, true);
        updateHeaderAvatar(user);
        if (typeof onUserChange === "function") {
            onUserChange(user);
        }
    });
}

// Renderuje stav účtu do #account-area (existuje pouze na stránce Nastavení).
function renderAuthArea(user, authReady) {
    const container = document.getElementById("account-area");
    if (!container) return;
    container.innerHTML = "";

    if (!authReady) {
        const p = document.createElement("p");
        p.className = "account-loading";
        p.textContent = "Načítání…";
        container.appendChild(p);
        return;
    }

    if (user) {
        const info = document.createElement("div");
        info.className = "account-info";

        const name = document.createElement("p");
        name.className = "account-name";
        name.textContent = user.displayName || "Přihlášen";
        info.appendChild(name);

        if (user.email) {
            const email = document.createElement("p");
            email.className = "account-email";
            email.textContent = user.email;
            info.appendChild(email);
        }

        const status = document.createElement("p");
        status.className = "account-status";
        status.textContent = "☁ Data se synchronizují";
        info.appendChild(status);

        const btn = document.createElement("button");
        btn.className = "btn btn-secondary btn-sm";
        btn.textContent = "Odhlásit";
        btn.addEventListener("click", signOutUser);
        info.appendChild(btn);

        container.appendChild(info);
    } else {
        const p = document.createElement("p");
        p.className = "account-hint";
        p.textContent =
            "Přihlaš se, aby se data synchronizovala mezi všemi tvými zařízeními.";
        container.appendChild(p);

        const btn = document.createElement("button");
        btn.className = "btn btn-primary";
        btn.textContent = "Přihlásit se Googlem";
        btn.addEventListener("click", signInWithGoogle);
        container.appendChild(btn);
    }
}
