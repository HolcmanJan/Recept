// Sdílená logika pro hamburger menu (používá ji každá stránka aplikace).
import { signInWithGoogle, signOutUser } from "./firebase-init.js";

export function initHamburger() {
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

export function renderMenuAuth(user, authReady) {
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
        p.textContent = "Přihlaš se, aby se recepty synchronizovaly mezi všemi tvými zařízeními.";
        container.appendChild(p);

        const btn = document.createElement("button");
        btn.className = "btn btn-primary";
        btn.textContent = "Přihlásit se Googlem";
        btn.addEventListener("click", signInWithGoogle);
        container.appendChild(btn);
    }
}
