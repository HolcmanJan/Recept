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
