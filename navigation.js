// Sdílená logika pro hamburger menu, navigaci a auth UI (používá ji každá stránka).
import {
    auth,
    onAuthStateChanged,
    signInWithGoogle,
    signOutUser,
} from "./firebase-init.js";

const NAV_ITEMS = [
    { key: "home", label: "🏠 Domů", href: "index.html" },
    { key: "recepty", label: "🍳 Recepty", href: "recepty.html" },
    { key: "rozpocet", label: "💰 Rozpočet", href: "rozpocet.html" },
    { key: "cviceni", label: "💪 Cvičení", note: "připravujeme" },
    { key: "hry", label: "🎮 Hry", note: "připravujeme" },
];

// Jednotný vstupní bod pro inicializaci navigace na stránce.
export function initNavigation(activePage, onUserChange) {
    renderSideMenu(activePage);
    initHamburger();
    initMenuAuth(onUserChange);
}

function renderSideMenu(activePage) {
    const root = document.getElementById("side-menu-root");
    if (!root) return;

    const navHtml = NAV_ITEMS.map((item) => {
        if (item.href) {
            const cls = item.key === activePage ? ' class="active"' : "";
            return `<a href="${item.href}"${cls}>${item.label}</a>`;
        }
        return `<span class="menu-disabled">${item.label} <em>(${item.note})</em></span>`;
    }).join("");

    const isSettingsActive =
        activePage === "nastaveni" || activePage === "zalozky";
    const settingsCls = isSettingsActive ? ' class="active"' : "";

    root.innerHTML = `
        <div id="hamburger-backdrop" class="hamburger-backdrop hidden"></div>
        <aside id="side-menu" class="side-menu">
            <div class="side-menu-header">
                <h2>Menu</h2>
                <button id="close-menu" class="close-btn" aria-label="Zavřít menu">×</button>
            </div>
            <nav class="side-menu-nav">
                ${navHtml}
            </nav>
            <nav class="side-menu-nav side-menu-nav-settings">
                <a href="nastaveni.html"${settingsCls}>⚙ Nastavení</a>
            </nav>
            <div class="side-menu-section">
                <h3>Účet</h3>
                <div id="menu-auth-area"></div>
            </div>
            <div class="side-menu-section side-menu-footer">
                <h3>O aplikaci</h3>
                <p>Moje aplikace v1.0</p>
            </div>
        </aside>
    `;
}

function initHamburger() {
    const btn = document.getElementById("hamburger-btn");
    const menu = document.getElementById("side-menu");
    const backdrop = document.getElementById("hamburger-backdrop");
    const closeBtn = document.getElementById("close-menu");
    if (!btn || !menu || !backdrop) return;

    function open() {
        menu.classList.add("open");
        backdrop.classList.remove("hidden");
        document.body.classList.add("menu-open");
    }
    function close() {
        menu.classList.remove("open");
        backdrop.classList.add("hidden");
        document.body.classList.remove("menu-open");
    }

    btn.addEventListener("click", open);
    backdrop.addEventListener("click", close);
    if (closeBtn) closeBtn.addEventListener("click", close);
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && menu.classList.contains("open")) close();
    });
}

function initMenuAuth(onUserChange) {
    renderMenuAuth(null, false);
    onAuthStateChanged(auth, (user) => {
        renderMenuAuth(user, true);
        if (typeof onUserChange === "function") {
            onUserChange(user);
        }
    });
}

function renderMenuAuth(user, authReady) {
    const container = document.getElementById("menu-auth-area");
    if (!container) return;
    container.innerHTML = "";

    if (!authReady) {
        const p = document.createElement("p");
        p.className = "menu-auth-loading";
        p.textContent = "Načítání…";
        container.appendChild(p);
        return;
    }

    if (user) {
        const info = document.createElement("div");
        info.className = "menu-user-info";

        const name = document.createElement("p");
        name.className = "menu-user-name";
        name.textContent = user.displayName || "Přihlášen";
        info.appendChild(name);

        if (user.email) {
            const email = document.createElement("p");
            email.className = "menu-user-email";
            email.textContent = user.email;
            info.appendChild(email);
        }

        const status = document.createElement("p");
        status.className = "menu-status";
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
        p.className = "menu-hint";
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
