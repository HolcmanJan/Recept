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
    ensureHeaderAvatar();
    initAuth(onUserChange);
}

// ----- Avatar v horní liště + popover -----
let currentUser = null;
let popoverOpen = false;

function ensureHeaderAvatar() {
    const headerInner = document.querySelector("header .header-inner");
    if (!headerInner) return;
    if (document.getElementById("user-avatar")) return;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = "user-avatar";
    btn.className = "user-avatar user-avatar-loading";
    btn.setAttribute("aria-label", "Účet");
    btn.setAttribute("aria-haspopup", "true");
    btn.setAttribute("aria-expanded", "false");
    btn.title = "Účet";
    btn.innerHTML = '<span class="user-avatar-placeholder">👤</span>';
    btn.addEventListener("click", (e) => {
        e.stopPropagation();
        togglePopover();
    });

    // Přidej do pravé části hlavičky (vedle .header-actions pokud existuje)
    const actions = headerInner.querySelector(".header-actions");
    if (actions) {
        actions.appendChild(btn);
    } else {
        headerInner.appendChild(btn);
    }

    // Popover vytvoř jednou
    if (!document.getElementById("user-popover")) {
        const pop = document.createElement("div");
        pop.id = "user-popover";
        pop.className = "user-popover hidden";
        pop.setAttribute("role", "dialog");
        pop.addEventListener("click", (e) => e.stopPropagation());
        document.body.appendChild(pop);
    }

    // Globální zavření kliknutím mimo / Escapem
    document.addEventListener("click", () => {
        if (popoverOpen) closePopover();
    });
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && popoverOpen) closePopover();
    });
}

function updateHeaderAvatar(user) {
    currentUser = user;

    const btn = document.getElementById("user-avatar");
    if (!btn) return;
    btn.classList.remove("user-avatar-loading");
    btn.innerHTML = "";

    if (!user) {
        btn.classList.remove("is-signed-in");
        const span = document.createElement("span");
        span.className = "user-avatar-placeholder";
        span.textContent = "👤";
        btn.appendChild(span);
        btn.title = "Přihlásit se";
    } else {
        btn.classList.add("is-signed-in");
        btn.title = user.displayName || user.email || "Účet";

        if (user.photoURL) {
            const img = document.createElement("img");
            img.src = user.photoURL;
            img.alt = user.displayName || "Účet";
            img.referrerPolicy = "no-referrer";
            img.addEventListener("error", () => {
                img.remove();
                btn.appendChild(buildInitialSpan(user));
            });
            btn.appendChild(img);
        } else {
            btn.appendChild(buildInitialSpan(user));
        }
    }

    // Pokud je popover otevřený, přegeneruj obsah
    if (popoverOpen) renderPopover();
}

function buildInitialSpan(user) {
    const span = document.createElement("span");
    span.className = "user-avatar-initial";
    const src = user.displayName || user.email || "?";
    span.textContent = src.trim().charAt(0).toUpperCase();
    return span;
}

function togglePopover() {
    if (popoverOpen) closePopover();
    else openPopover();
}

function openPopover() {
    const pop = document.getElementById("user-popover");
    const btn = document.getElementById("user-avatar");
    if (!pop || !btn) return;
    renderPopover();
    pop.classList.remove("hidden");
    btn.setAttribute("aria-expanded", "true");
    popoverOpen = true;
}

function closePopover() {
    const pop = document.getElementById("user-popover");
    const btn = document.getElementById("user-avatar");
    if (pop) pop.classList.add("hidden");
    if (btn) btn.setAttribute("aria-expanded", "false");
    popoverOpen = false;
}

function renderPopover() {
    const pop = document.getElementById("user-popover");
    if (!pop) return;
    pop.innerHTML = "";

    if (currentUser) {
        const head = document.createElement("div");
        head.className = "user-popover-head";

        const big = document.createElement("div");
        big.className = "user-popover-avatar";
        if (currentUser.photoURL) {
            const img = document.createElement("img");
            img.src = currentUser.photoURL;
            img.alt = "";
            img.referrerPolicy = "no-referrer";
            img.addEventListener("error", () => {
                img.remove();
                big.appendChild(buildInitialSpan(currentUser));
            });
            big.appendChild(img);
        } else {
            big.appendChild(buildInitialSpan(currentUser));
        }
        head.appendChild(big);

        const info = document.createElement("div");
        info.className = "user-popover-info";
        const name = document.createElement("strong");
        name.textContent = currentUser.displayName || "Přihlášen";
        info.appendChild(name);
        if (currentUser.email) {
            const em = document.createElement("span");
            em.textContent = currentUser.email;
            info.appendChild(em);
        }
        head.appendChild(info);
        pop.appendChild(head);

        const status = document.createElement("p");
        status.className = "user-popover-status";
        status.textContent = "☁ Data se synchronizují";
        pop.appendChild(status);

        const logout = document.createElement("button");
        logout.type = "button";
        logout.className = "btn btn-secondary btn-sm user-popover-btn";
        logout.textContent = "Odhlásit";
        logout.addEventListener("click", () => {
            closePopover();
            signOutUser();
        });
        pop.appendChild(logout);
    } else {
        const hint = document.createElement("p");
        hint.className = "user-popover-hint";
        hint.textContent = "Přihlaš se, aby se data synchronizovala mezi zařízeními.";
        pop.appendChild(hint);

        const login = document.createElement("button");
        login.type = "button";
        login.className = "btn btn-primary btn-sm user-popover-btn";
        login.textContent = "Přihlásit se Googlem";
        login.addEventListener("click", () => {
            closePopover();
            signInWithGoogle();
        });
        pop.appendChild(login);
    }
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
