// Logika stránky s nastavením.
import { initNavigation } from "./navigation.js";

const SETTING_COMPACT = "recept.setting.compact";
const SETTING_CONFIRM_DELETE = "recept.setting.confirmDelete";

initNavigation("nastaveni");

// ----- Nastavení (přepínače) -----
const toggleCompact = document.getElementById("toggle-compact");
const toggleConfirmDelete = document.getElementById("toggle-confirm-delete");

toggleCompact.checked = localStorage.getItem(SETTING_COMPACT) === "true";
toggleConfirmDelete.checked =
    localStorage.getItem(SETTING_CONFIRM_DELETE) !== "false"; // default true

toggleCompact.addEventListener("change", () => {
    localStorage.setItem(SETTING_COMPACT, String(toggleCompact.checked));
});

toggleConfirmDelete.addEventListener("change", () => {
    localStorage.setItem(
        SETTING_CONFIRM_DELETE,
        String(toggleConfirmDelete.checked)
    );
});

// ----- Brána k záložkám (2 checkboxy) -----
const gateCheck1 = document.getElementById("gate-check-1");
const gateCheck2 = document.getElementById("gate-check-2");
const linkZalozky = document.getElementById("link-zalozky");

function updateGate() {
    const unlocked = gateCheck1.checked && gateCheck2.checked;
    if (unlocked) {
        linkZalozky.classList.remove("settings-item-locked");
    } else {
        linkZalozky.classList.add("settings-item-locked");
    }
}

linkZalozky.addEventListener("click", (e) => {
    if (linkZalozky.classList.contains("settings-item-locked")) {
        e.preventDefault();
    }
});

gateCheck1.addEventListener("change", updateGate);
gateCheck2.addEventListener("change", updateGate);

// ----- Smazání lokálních dat -----
const clearBtn = document.getElementById("btn-clear-local");
clearBtn.addEventListener("click", () => {
    const ok = window.confirm(
        "Opravdu smazat všechna lokální data (recepty, záložky a nastavení v tomto prohlížeči)? Data uložená v cloudu to neovlivní."
    );
    if (!ok) return;

    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith("recept.")) {
            keys.push(key);
        }
    }
    keys.forEach((k) => localStorage.removeItem(k));

    alert("Lokální data byla smazána.");
    toggleCompact.checked = false;
    toggleConfirmDelete.checked = true;
});
