// Stránka Cvičení — evidence tréninků, sety, šablony a statistiky.
import { db } from "./firebase-init.js";
import {
    collection,
    doc,
    setDoc,
    deleteDoc,
    onSnapshot,
    getDoc,
    query,
    orderBy,
    limit,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { initNavigation } from "./navigation.js";

// ===== Katalog partií =====
const GROUPS = [
    { id: "chest", label: "Hrudník", color: "#ef4444" },
    { id: "back", label: "Záda", color: "#3b82f6" },
    { id: "legs", label: "Nohy", color: "#10b981" },
    { id: "shoulders", label: "Ramena", color: "#f59e0b" },
    { id: "biceps", label: "Biceps", color: "#8b5cf6" },
    { id: "triceps", label: "Triceps", color: "#ec4899" },
    { id: "core", label: "Core", color: "#14b8a6" },
];

// ===== Katalog cviků (ikona slouží jako vizuální „obrázek") =====
const EXERCISES = [
    // Hrudník
    { id: "bench-press-barbell", name: "Bench press s činkou", group: "chest", icon: "🏋️" },
    { id: "bench-press-dumbbell", name: "Bench press s jednoručkami", group: "chest", icon: "💪" },
    { id: "bench-press-incline", name: "Nakloněný bench press", group: "chest", icon: "📐" },
    { id: "chest-fly-dumbbell", name: "Rozpažování s jednoručkami", group: "chest", icon: "🦋" },
    { id: "chest-press-machine", name: "Tlaky na hrudním stroji", group: "chest", icon: "🎯" },
    { id: "pec-deck", name: "Peck deck", group: "chest", icon: "🕸️" },
    { id: "cable-crossover", name: "Křížení kabelů", group: "chest", icon: "✖️" },
    { id: "pushups", name: "Kliky", group: "chest", icon: "⬇️" },
    // Záda
    { id: "deadlift", name: "Mrtvý tah", group: "back", icon: "🪨" },
    { id: "pullup", name: "Shyby", group: "back", icon: "🆙" },
    { id: "lat-pulldown", name: "Kladka za hlavu", group: "back", icon: "⤵️" },
    { id: "seated-row-cable", name: "Veslování na kladce vsedě", group: "back", icon: "🚣" },
    { id: "bent-over-row", name: "Přítahy v předklonu s činkou", group: "back", icon: "↙️" },
    { id: "dumbbell-row", name: "Přítahy s jednoručkou", group: "back", icon: "🔻" },
    { id: "t-bar-row", name: "T-bar veslování", group: "back", icon: "🅃" },
    { id: "face-pull", name: "Face pull", group: "back", icon: "😤" },
    { id: "hyperextension", name: "Hyperextenze", group: "back", icon: "⤴️" },
    // Nohy
    { id: "squat-barbell", name: "Dřep s činkou", group: "legs", icon: "🦵" },
    { id: "leg-press", name: "Leg press", group: "legs", icon: "🛠️" },
    { id: "leg-extension", name: "Předkopávání", group: "legs", icon: "🦿" },
    { id: "leg-curl", name: "Zakopávání", group: "legs", icon: "🔄" },
    { id: "rdl", name: "Rumunský mrtvý tah", group: "legs", icon: "⬇️" },
    { id: "lunges", name: "Výpady", group: "legs", icon: "🚶" },
    { id: "calf-raise", name: "Výpony na špičkách", group: "legs", icon: "⬆️" },
    { id: "hip-thrust", name: "Hip thrust", group: "legs", icon: "🌉" },
    { id: "hack-squat", name: "Hack squat", group: "legs", icon: "⚙️" },
    // Ramena
    { id: "ohp-barbell", name: "Tlaky nad hlavu s činkou", group: "shoulders", icon: "🏋️" },
    { id: "ohp-dumbbell", name: "Tlaky nad hlavu s jednoručkami", group: "shoulders", icon: "💪" },
    { id: "arnold-press", name: "Arnold press", group: "shoulders", icon: "🎖️" },
    { id: "lateral-raise", name: "Upažování s jednoručkami", group: "shoulders", icon: "🕴️" },
    { id: "front-raise", name: "Předpažování", group: "shoulders", icon: "➡️" },
    { id: "rear-delt-fly", name: "Rozpažování pro zadní delty", group: "shoulders", icon: "🦋" },
    { id: "shrug", name: "Krčení ramen", group: "shoulders", icon: "🤷" },
    { id: "upright-row", name: "Přítahy k bradě", group: "shoulders", icon: "⬆️" },
    // Biceps
    { id: "barbell-curl", name: "Bicepsový zdvih s činkou", group: "biceps", icon: "💪" },
    { id: "dumbbell-curl", name: "Bicepsový zdvih s jednoručkami", group: "biceps", icon: "🔩" },
    { id: "hammer-curl", name: "Kladivový zdvih", group: "biceps", icon: "🔨" },
    { id: "preacher-curl", name: "Scottův zdvih", group: "biceps", icon: "⛪" },
    { id: "cable-curl", name: "Bicepsový zdvih na kladce", group: "biceps", icon: "🔗" },
    // Triceps
    { id: "tricep-pushdown", name: "Tricepsové stahování na kladce", group: "triceps", icon: "⬇️" },
    { id: "skull-crusher", name: "Francouzský tlak", group: "triceps", icon: "💀" },
    { id: "overhead-tricep", name: "Natahování nad hlavou", group: "triceps", icon: "⬆️" },
    { id: "close-grip-bench", name: "Úzký bench press", group: "triceps", icon: "🤏" },
    { id: "dips-tricep", name: "Dipy", group: "triceps", icon: "🔽" },
    { id: "rope-pushdown", name: "Stahování lanem", group: "triceps", icon: "🪢" },
    // Core
    { id: "plank", name: "Prkno", group: "core", icon: "📏" },
    { id: "crunch", name: "Zkracovačky", group: "core", icon: "🔽" },
    { id: "russian-twist", name: "Ruské zkracovačky", group: "core", icon: "🌀" },
    { id: "leg-raise", name: "Zdvihy nohou", group: "core", icon: "🦵" },
    { id: "hanging-leg-raise", name: "Zdvihy nohou ve visu", group: "core", icon: "🪝" },
    { id: "cable-woodchop", name: "Dřevorubec na kladce", group: "core", icon: "🪓" },
    { id: "ab-wheel", name: "Kolečko na břicho", group: "core", icon: "☯️" },
];

const EXERCISE_BY_ID = Object.fromEntries(EXERCISES.map((e) => [e.id, e]));
const GROUP_BY_ID = Object.fromEntries(GROUPS.map((g) => [g.id, g]));

// ===== Lokální úložiště klíče =====
const ACTIVE_KEY = "recept.workout.active";
const TEMPLATES_LOCAL = "recept.workout.templates";
const HISTORY_LOCAL = "recept.workout.history";
const STATS_LOCAL = "recept.workout.stats";

// ===== Stav =====
let currentUser = null;
let unsubTemplates = null;
let unsubHistory = null;
let unsubStats = null;
let templates = [];
let history = [];
let exerciseStats = {}; // { exerciseId: {sessions, totalVolume, bestWeight, totalSets, lastUsedAt, customImage} }
let activeWorkout = null;
let timerInterval = null;
let pickerFilter = "all";
let pickerSearch = "";
let detailExerciseId = null;

// ===== DOM =====
const viewHome = document.getElementById("view-home");
const viewActive = document.getElementById("view-active");
const viewDetail = document.getElementById("view-detail");

const exercisesListEl = document.getElementById("exercises-list");
const exercisesEmptyEl = document.getElementById("exercises-empty");

const btnDetailBack = document.getElementById("btn-detail-back");
const detailImageEl = document.getElementById("detail-image");
const detailNameEl = document.getElementById("detail-name");
const detailGroupEl = document.getElementById("detail-group");
const detailImageInput = document.getElementById("detail-image-input");
const btnImageRemove = document.getElementById("btn-image-remove");
const detailStatsEl = document.getElementById("detail-stats");
const detailChartEl = document.getElementById("detail-chart");
const detailChartEmptyEl = document.getElementById("detail-chart-empty");
const detailSessionsEl = document.getElementById("detail-sessions");

const btnStart = document.getElementById("btn-start-workout");
const btnAddExercise = document.getElementById("btn-add-exercise");
const btnCancel = document.getElementById("btn-cancel-workout");
const btnFinish = document.getElementById("btn-finish-workout");

const templatesListEl = document.getElementById("templates-list");
const templatesEmptyEl = document.getElementById("templates-empty");
const historyListEl = document.getElementById("history-list");
const historyEmptyEl = document.getElementById("history-empty");

const activeTitleEl = document.getElementById("active-title");
const activeTimerEl = document.getElementById("active-timer");
const activeTotalEl = document.getElementById("active-total");
const activeExercisesEl = document.getElementById("active-exercises");

const pickerModal = document.getElementById("picker-modal");
const pickerBackdrop = document.getElementById("picker-backdrop");
const pickerClose = document.getElementById("picker-close");
const pickerSearchEl = document.getElementById("picker-search");
const pickerFiltersEl = document.getElementById("picker-filters");
const pickerListEl = document.getElementById("picker-list");

const finishModal = document.getElementById("finish-modal");
const finishBackdrop = document.getElementById("finish-backdrop");
const finishClose = document.getElementById("finish-close");
const finishCancel = document.getElementById("finish-cancel");
const finishConfirm = document.getElementById("finish-confirm");
const finishTotalEl = document.getElementById("finish-total");
const finishSummaryEl = document.getElementById("finish-summary");
const finishSaveTplEl = document.getElementById("finish-save-template");
const finishTplNameEl = document.getElementById("finish-template-name");

// ===== Pomocné =====
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function emptySet() {
    return { weight: 0, reps: 0 };
}

function emptyWorkout() {
    return {
        id: generateId(),
        name: "Trénink",
        startedAt: Date.now(),
        exercises: [],
    };
}

function computeVolume(workout) {
    let total = 0;
    for (const ex of workout.exercises) {
        for (const s of ex.sets) {
            total += (s.weight || 0) * (s.reps || 0);
        }
    }
    return Math.round(total);
}

function fmtKg(n) {
    return (n || 0).toLocaleString("cs-CZ") + " kg";
}

function fmtDateTime(ts) {
    const d = new Date(ts);
    const pad = (x) => String(x).padStart(2, "0");
    return (
        pad(d.getDate()) + ". " + pad(d.getMonth() + 1) + ". " +
        d.getFullYear() + " " + pad(d.getHours()) + ":" + pad(d.getMinutes())
    );
}

function fmtDuration(ms) {
    const s = Math.floor(ms / 1000);
    const mm = String(Math.floor(s / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    return mm + ":" + ss;
}

// ===== Aktivní trénink (vždy v localStorage kvůli návratu) =====
function loadActive() {
    try {
        const raw = localStorage.getItem(ACTIVE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

function saveActive() {
    if (activeWorkout) {
        localStorage.setItem(ACTIVE_KEY, JSON.stringify(activeWorkout));
    } else {
        localStorage.removeItem(ACTIVE_KEY);
    }
}

// ===== Šablony + historie + statistiky =====
function loadLocalArray(key) {
    try {
        const raw = localStorage.getItem(key);
        const arr = raw ? JSON.parse(raw) : [];
        return Array.isArray(arr) ? arr : [];
    } catch {
        return [];
    }
}

function saveLocalArray(key, arr) {
    localStorage.setItem(key, JSON.stringify(arr));
}

function loadLocalStats() {
    try {
        const raw = localStorage.getItem(STATS_LOCAL);
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
}

function saveLocalStats(stats) {
    localStorage.setItem(STATS_LOCAL, JSON.stringify(stats));
}

// ===== Přepínání pohledů =====
function showView(name) {
    viewHome.classList.toggle("hidden", name !== "home");
    viewActive.classList.toggle("hidden", name !== "active");
    viewDetail.classList.toggle("hidden", name !== "detail");
    window.scrollTo({ top: 0, behavior: "instant" });
}

// ===== Inicializace — navigace + auth =====
initNavigation("cviceni", (user) => {
    currentUser = user;

    if (unsubTemplates) { unsubTemplates(); unsubTemplates = null; }
    if (unsubHistory) { unsubHistory(); unsubHistory = null; }
    if (unsubStats) { unsubStats(); unsubStats = null; }

    if (user) {
        // Statistiky cviků
        unsubStats = onSnapshot(
            collection(db, "users", user.uid, "exerciseStats"),
            (snap) => {
                exerciseStats = {};
                snap.docs.forEach((d) => {
                    exerciseStats[d.id] = { exerciseId: d.id, ...d.data() };
                });
                renderExercisesList();
                if (detailExerciseId && !viewDetail.classList.contains("hidden")) {
                    renderDetail();
                }
            },
            (err) => console.error("Stats:", err)
        );
        // Šablony
        unsubTemplates = onSnapshot(
            collection(db, "users", user.uid, "workoutTemplates"),
            (snap) => {
                templates = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
                templates.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
                renderTemplates();
            },
            (err) => console.error("Šablony:", err)
        );
        // Historie — posledních 30
        unsubHistory = onSnapshot(
            query(
                collection(db, "users", user.uid, "workouts"),
                orderBy("finishedAt", "desc"),
                limit(30)
            ),
            (snap) => {
                history = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
                renderHistory();
            },
            (err) => console.error("Historie:", err)
        );
    } else {
        templates = loadLocalArray(TEMPLATES_LOCAL);
        history = loadLocalArray(HISTORY_LOCAL);
        exerciseStats = loadLocalStats();
        renderTemplates();
        renderHistory();
        renderExercisesList();
    }
});

// ===== Rendering: šablony =====
function renderTemplates() {
    templatesListEl.innerHTML = "";
    if (templates.length === 0) {
        templatesEmptyEl.classList.remove("hidden");
        return;
    }
    templatesEmptyEl.classList.add("hidden");
    for (const tpl of templates) {
        const card = document.createElement("div");
        card.className = "template-card";

        const info = document.createElement("div");
        info.className = "template-info";
        const title = document.createElement("h4");
        title.textContent = tpl.name || "Šablona";
        info.appendChild(title);
        const sub = document.createElement("p");
        const exCount = (tpl.exercises || []).length;
        const setCount = (tpl.exercises || []).reduce((s, e) => s + (e.sets || []).length, 0);
        sub.textContent = exCount + " cviků · " + setCount + " setů";
        info.appendChild(sub);
        card.appendChild(info);

        const useBtn = document.createElement("button");
        useBtn.className = "btn btn-primary btn-sm";
        useBtn.textContent = "Použít";
        useBtn.addEventListener("click", () => startWorkout(tpl));
        card.appendChild(useBtn);

        const delBtn = document.createElement("button");
        delBtn.className = "btn-icon btn-icon-danger";
        delBtn.setAttribute("aria-label", "Smazat šablonu");
        delBtn.textContent = "🗑";
        delBtn.addEventListener("click", () => deleteTemplate(tpl));
        card.appendChild(delBtn);

        templatesListEl.appendChild(card);
    }
}

// ===== Rendering: historie =====
function renderHistory() {
    historyListEl.innerHTML = "";
    if (history.length === 0) {
        historyEmptyEl.classList.remove("hidden");
        return;
    }
    historyEmptyEl.classList.add("hidden");
    for (const w of history) {
        const card = document.createElement("div");
        card.className = "history-card";

        const top = document.createElement("div");
        top.className = "history-top";
        const title = document.createElement("h4");
        title.textContent = w.name || "Trénink";
        top.appendChild(title);
        const total = document.createElement("span");
        total.className = "history-total";
        total.textContent = fmtKg(w.totalWeight || 0);
        top.appendChild(total);
        card.appendChild(top);

        const meta = document.createElement("p");
        meta.className = "history-meta";
        meta.textContent = fmtDateTime(w.finishedAt || w.startedAt || Date.now());
        card.appendChild(meta);

        const list = document.createElement("ul");
        list.className = "history-ex-list";
        for (const ex of (w.exercises || [])) {
            const info = EXERCISE_BY_ID[ex.exerciseId];
            if (!info) continue;
            const li = document.createElement("li");
            const setCount = (ex.sets || []).length;
            const vol = (ex.sets || []).reduce((s, x) => s + (x.weight || 0) * (x.reps || 0), 0);
            li.innerHTML = "<span>" + info.icon + " " + info.name + "</span>" +
                "<span>" + setCount + " × · " + fmtKg(Math.round(vol)) + "</span>";
            list.appendChild(li);
        }
        card.appendChild(list);

        historyListEl.appendChild(card);
    }
}

// ===== Rendering: aktivní trénink =====
function renderActive() {
    if (!activeWorkout) return;
    activeTitleEl.value = activeWorkout.name || "Trénink";
    activeExercisesEl.innerHTML = "";

    activeWorkout.exercises.forEach((ex, exIdx) => {
        const info = EXERCISE_BY_ID[ex.exerciseId];
        if (!info) return;
        const group = GROUP_BY_ID[info.group];

        const card = document.createElement("div");
        card.className = "active-exercise";

        const head = document.createElement("div");
        head.className = "active-exercise-head";

        const icon = document.createElement("div");
        icon.className = "exercise-icon";
        const customImg = exerciseStats[ex.exerciseId]?.customImage;
        if (customImg) {
            const img = document.createElement("img");
            img.src = customImg;
            img.alt = info.name;
            icon.appendChild(img);
            icon.classList.add("exercise-icon-img");
        } else {
            icon.style.background = group ? group.color : "#6b7280";
            icon.textContent = info.icon;
        }
        head.appendChild(icon);

        const info2 = document.createElement("div");
        info2.className = "active-exercise-info";
        const nm = document.createElement("strong");
        nm.textContent = info.name;
        info2.appendChild(nm);
        const gl = document.createElement("span");
        gl.className = "exercise-group-label";
        gl.textContent = group ? group.label : "";
        info2.appendChild(gl);
        head.appendChild(info2);

        const rmEx = document.createElement("button");
        rmEx.className = "btn-icon btn-icon-danger";
        rmEx.setAttribute("aria-label", "Odebrat cvik");
        rmEx.textContent = "×";
        rmEx.addEventListener("click", () => removeExercise(exIdx));
        head.appendChild(rmEx);

        card.appendChild(head);

        // Řádky setů
        const setsWrap = document.createElement("div");
        setsWrap.className = "sets-wrap";

        const header = document.createElement("div");
        header.className = "set-row set-row-header";
        header.innerHTML = "<span>Set</span><span>Váha (kg)</span><span>Opakování</span><span></span>";
        setsWrap.appendChild(header);

        ex.sets.forEach((s, setIdx) => {
            const row = document.createElement("div");
            row.className = "set-row";

            const idx = document.createElement("span");
            idx.className = "set-idx";
            idx.textContent = setIdx + 1;
            row.appendChild(idx);

            const w = document.createElement("input");
            w.type = "number";
            w.inputMode = "decimal";
            w.min = "0";
            w.step = "0.5";
            w.value = s.weight || "";
            w.placeholder = "0";
            w.addEventListener("input", () => updateSet(exIdx, setIdx, "weight", w.value));
            row.appendChild(w);

            const r = document.createElement("input");
            r.type = "number";
            r.inputMode = "numeric";
            r.min = "0";
            r.step = "1";
            r.value = s.reps || "";
            r.placeholder = "0";
            r.addEventListener("input", () => updateSet(exIdx, setIdx, "reps", r.value));
            row.appendChild(r);

            const rm = document.createElement("button");
            rm.className = "btn-icon";
            rm.setAttribute("aria-label", "Odebrat set");
            rm.textContent = "−";
            rm.addEventListener("click", () => removeSet(exIdx, setIdx));
            row.appendChild(rm);

            setsWrap.appendChild(row);
        });

        const addBtn = document.createElement("button");
        addBtn.className = "btn btn-secondary btn-sm btn-add-set";
        addBtn.textContent = "+ Přidat set";
        addBtn.addEventListener("click", () => addSet(exIdx));
        setsWrap.appendChild(addBtn);

        card.appendChild(setsWrap);
        activeExercisesEl.appendChild(card);
    });

    updateTotal();
}

function updateTotal() {
    if (!activeWorkout) return;
    activeTotalEl.textContent = fmtKg(computeVolume(activeWorkout));
}

// ===== Akce: start / ukončení / zrušení =====
function startWorkout(template) {
    activeWorkout = emptyWorkout();
    if (template) {
        activeWorkout.name = template.name || "Trénink";
        activeWorkout.exercises = (template.exercises || []).map((ex) => ({
            exerciseId: ex.exerciseId,
            sets: (ex.sets || []).map((s) => ({
                weight: s.weight || 0,
                reps: s.reps || 0,
            })),
        }));
    }
    saveActive();
    showView("active");
    renderActive();
    startTimer();
}

function cancelWorkout() {
    if (!activeWorkout) return;
    const hasData = activeWorkout.exercises.length > 0;
    if (hasData && !confirm("Opravdu zrušit rozpracovaný trénink? Data se ztratí.")) return;
    activeWorkout = null;
    saveActive();
    stopTimer();
    showView("home");
}

// ===== Akce: cviky a sety =====
function addExerciseToWorkout(exerciseId) {
    if (!activeWorkout) return;
    activeWorkout.exercises.push({ exerciseId, sets: [emptySet()] });
    saveActive();
    renderActive();
}

function removeExercise(exIdx) {
    if (!confirm("Odebrat tento cvik z tréninku?")) return;
    activeWorkout.exercises.splice(exIdx, 1);
    saveActive();
    renderActive();
}

function addSet(exIdx) {
    const ex = activeWorkout.exercises[exIdx];
    // Předvyplň poslední váhou/opakováním
    const last = ex.sets[ex.sets.length - 1];
    ex.sets.push(last ? { weight: last.weight, reps: last.reps } : emptySet());
    saveActive();
    renderActive();
}

function removeSet(exIdx, setIdx) {
    const ex = activeWorkout.exercises[exIdx];
    ex.sets.splice(setIdx, 1);
    if (ex.sets.length === 0) ex.sets.push(emptySet());
    saveActive();
    renderActive();
}

function updateSet(exIdx, setIdx, field, value) {
    const s = activeWorkout.exercises[exIdx].sets[setIdx];
    s[field] = parseFloat(value) || 0;
    saveActive();
    updateTotal();
}

// ===== Časovač =====
function startTimer() {
    stopTimer();
    const tick = () => {
        if (!activeWorkout) return;
        activeTimerEl.textContent = fmtDuration(Date.now() - (activeWorkout.startedAt || Date.now()));
    };
    tick();
    timerInterval = setInterval(tick, 1000);
}

function stopTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    activeTimerEl.textContent = "00:00";
}

// ===== Picker cviků =====
function openPicker() {
    pickerFilter = "all";
    pickerSearch = "";
    pickerSearchEl.value = "";
    renderPickerFilters();
    renderPickerList();
    pickerModal.classList.remove("hidden");
    setTimeout(() => pickerSearchEl.focus(), 80);
}

function closePicker() {
    pickerModal.classList.add("hidden");
}

function renderPickerFilters() {
    pickerFiltersEl.innerHTML = "";
    const all = [{ id: "all", label: "Vše" }, ...GROUPS];
    for (const g of all) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "picker-filter";
        if (pickerFilter === g.id) b.classList.add("active");
        if (g.color) b.style.setProperty("--pf-color", g.color);
        b.textContent = g.label;
        b.addEventListener("click", () => {
            pickerFilter = g.id;
            renderPickerFilters();
            renderPickerList();
        });
        pickerFiltersEl.appendChild(b);
    }
}

function renderPickerList() {
    pickerListEl.innerHTML = "";
    const q = pickerSearch.trim().toLowerCase();
    const items = EXERCISES.filter((e) => {
        if (pickerFilter !== "all" && e.group !== pickerFilter) return false;
        if (q && !e.name.toLowerCase().includes(q)) return false;
        return true;
    });
    if (items.length === 0) {
        const p = document.createElement("p");
        p.className = "empty-state";
        p.textContent = "Žádný cvik neodpovídá.";
        pickerListEl.appendChild(p);
        return;
    }
    for (const ex of items) {
        const group = GROUP_BY_ID[ex.group];
        const customImg = exerciseStats[ex.id]?.customImage;
        const it = document.createElement("button");
        it.type = "button";
        it.className = "picker-item";

        const icon = document.createElement("div");
        icon.className = "exercise-icon";
        if (customImg) {
            const img = document.createElement("img");
            img.src = customImg;
            img.alt = ex.name;
            icon.appendChild(img);
            icon.classList.add("exercise-icon-img");
        } else {
            icon.style.background = group ? group.color : "#6b7280";
            icon.textContent = ex.icon;
        }
        it.appendChild(icon);

        const info = document.createElement("div");
        info.className = "picker-item-info";
        const nm = document.createElement("strong");
        nm.textContent = ex.name;
        info.appendChild(nm);
        const gl = document.createElement("span");
        gl.textContent = group ? group.label : "";
        info.appendChild(gl);
        it.appendChild(info);

        it.addEventListener("click", () => {
            addExerciseToWorkout(ex.id);
            closePicker();
        });
        pickerListEl.appendChild(it);
    }
}

// ===== Ukončení tréninku =====
function openFinishModal() {
    if (!activeWorkout || activeWorkout.exercises.length === 0) {
        alert("Trénink je prázdný — přidej aspoň jeden cvik.");
        return;
    }
    finishTotalEl.textContent = fmtKg(computeVolume(activeWorkout));

    // Souhrn cviků
    finishSummaryEl.innerHTML = "";
    for (const ex of activeWorkout.exercises) {
        const info = EXERCISE_BY_ID[ex.exerciseId];
        if (!info) continue;
        const row = document.createElement("div");
        row.className = "finish-row";
        const setCount = ex.sets.length;
        const vol = ex.sets.reduce((s, x) => s + (x.weight || 0) * (x.reps || 0), 0);
        const best = ex.sets.reduce((m, x) => Math.max(m, x.weight || 0), 0);
        row.innerHTML =
            '<span class="finish-row-name">' + info.icon + " " + info.name + "</span>" +
            '<span class="finish-row-stats">' + setCount + " setů · max " + fmtKg(best) + " · " + fmtKg(Math.round(vol)) + "</span>";
        finishSummaryEl.appendChild(row);
    }

    finishSaveTplEl.checked = false;
    finishTplNameEl.value = activeWorkout.name || "";
    finishTplNameEl.classList.add("hidden");
    finishModal.classList.remove("hidden");
}

function closeFinishModal() {
    finishModal.classList.add("hidden");
}

async function confirmFinish() {
    if (!activeWorkout) return;
    const finished = {
        ...activeWorkout,
        name: activeTitleEl.value.trim() || "Trénink",
        finishedAt: Date.now(),
        totalWeight: computeVolume(activeWorkout),
    };

    try {
        await saveWorkout(finished);
        await updateExerciseStats(finished);
        if (finishSaveTplEl.checked) {
            const tplName = finishTplNameEl.value.trim() || finished.name;
            await saveTemplate(tplName, finished.exercises);
        }
    } catch (err) {
        console.error(err);
        alert("Chyba při ukládání: " + err.message);
        return;
    }

    activeWorkout = null;
    saveActive();
    stopTimer();
    closeFinishModal();
    showView("home");
}

// ===== Ukládání: workout / template / stats =====
async function saveWorkout(workout) {
    if (currentUser) {
        await setDoc(
            doc(db, "users", currentUser.uid, "workouts", workout.id),
            workout
        );
    } else {
        const all = loadLocalArray(HISTORY_LOCAL);
        all.unshift(workout);
        saveLocalArray(HISTORY_LOCAL, all.slice(0, 100));
        history = all;
        renderHistory();
        // Pro lokální režim rovnou přečti statistiky z localStorage
        exerciseStats = loadLocalStats();
        renderExercisesList();
    }
}

async function saveTemplate(name, exercises) {
    const tpl = {
        id: generateId(),
        name,
        exercises: exercises.map((ex) => ({
            exerciseId: ex.exerciseId,
            sets: ex.sets.map((s) => ({
                weight: s.weight || 0,
                reps: s.reps || 0,
            })),
        })),
        createdAt: Date.now(),
    };
    if (currentUser) {
        const { id, ...data } = tpl;
        await setDoc(
            doc(db, "users", currentUser.uid, "workoutTemplates", id),
            data
        );
    } else {
        const all = loadLocalArray(TEMPLATES_LOCAL);
        all.unshift(tpl);
        saveLocalArray(TEMPLATES_LOCAL, all);
        templates = all;
        renderTemplates();
    }
}

async function deleteTemplate(tpl) {
    if (!confirm('Smazat šablonu "' + (tpl.name || "Šablona") + '"?')) return;
    if (currentUser) {
        await deleteDoc(doc(db, "users", currentUser.uid, "workoutTemplates", tpl.id));
    } else {
        templates = templates.filter((t) => t.id !== tpl.id);
        saveLocalArray(TEMPLATES_LOCAL, templates);
        renderTemplates();
    }
}

async function updateExerciseStats(workout) {
    // Součet objemu a max. váhy po cvicích
    const perExercise = {};
    for (const ex of workout.exercises) {
        if (!perExercise[ex.exerciseId]) {
            perExercise[ex.exerciseId] = { volume: 0, bestWeight: 0, sets: 0 };
        }
        const p = perExercise[ex.exerciseId];
        for (const s of ex.sets) {
            p.volume += (s.weight || 0) * (s.reps || 0);
            p.bestWeight = Math.max(p.bestWeight, s.weight || 0);
            p.sets++;
        }
    }

    if (currentUser) {
        for (const [exId, p] of Object.entries(perExercise)) {
            const ref = doc(db, "users", currentUser.uid, "exerciseStats", exId);
            // Načti existující a aktualizuj
            try {
                const snap = await getDoc(ref);
                const prev = snap.exists() ? snap.data() : {};
                await setDoc(ref, {
                    exerciseId: exId,
                    sessions: (prev.sessions || 0) + 1,
                    totalVolume: (prev.totalVolume || 0) + Math.round(p.volume),
                    totalSets: (prev.totalSets || 0) + p.sets,
                    bestWeight: Math.max(prev.bestWeight || 0, p.bestWeight),
                    lastUsedAt: Date.now(),
                });
            } catch (err) {
                console.warn("Statistika selhala pro", exId, err);
            }
        }
    } else {
        const stats = loadLocalStats();
        for (const [exId, p] of Object.entries(perExercise)) {
            const prev = stats[exId] || {};
            stats[exId] = {
                exerciseId: exId,
                sessions: (prev.sessions || 0) + 1,
                totalVolume: (prev.totalVolume || 0) + Math.round(p.volume),
                totalSets: (prev.totalSets || 0) + p.sets,
                bestWeight: Math.max(prev.bestWeight || 0, p.bestWeight),
                lastUsedAt: Date.now(),
            };
        }
        saveLocalStats(stats);
    }
}

// ===== Event handlery =====
btnStart.addEventListener("click", () => startWorkout(null));
btnAddExercise.addEventListener("click", openPicker);
btnCancel.addEventListener("click", cancelWorkout);
btnFinish.addEventListener("click", openFinishModal);

activeTitleEl.addEventListener("input", () => {
    if (!activeWorkout) return;
    activeWorkout.name = activeTitleEl.value;
    saveActive();
});

pickerClose.addEventListener("click", closePicker);
pickerBackdrop.addEventListener("click", closePicker);
pickerSearchEl.addEventListener("input", () => {
    pickerSearch = pickerSearchEl.value;
    renderPickerList();
});

finishClose.addEventListener("click", closeFinishModal);
finishBackdrop.addEventListener("click", closeFinishModal);
finishCancel.addEventListener("click", closeFinishModal);
finishConfirm.addEventListener("click", confirmFinish);
finishSaveTplEl.addEventListener("change", () => {
    finishTplNameEl.classList.toggle("hidden", !finishSaveTplEl.checked);
    if (finishSaveTplEl.checked) finishTplNameEl.focus();
});

// ===== Rendering: „Moje cviky" =====
function renderExercisesList() {
    exercisesListEl.innerHTML = "";
    const ids = Object.keys(exerciseStats).filter((id) => EXERCISE_BY_ID[id]);
    if (ids.length === 0) {
        exercisesEmptyEl.classList.remove("hidden");
        return;
    }
    exercisesEmptyEl.classList.add("hidden");
    // Seřaď podle lastUsedAt desc
    ids.sort((a, b) => (exerciseStats[b].lastUsedAt || 0) - (exerciseStats[a].lastUsedAt || 0));

    for (const id of ids) {
        const ex = EXERCISE_BY_ID[id];
        const group = GROUP_BY_ID[ex.group];
        const s = exerciseStats[id] || {};

        const card = document.createElement("button");
        card.type = "button";
        card.className = "exercise-card";
        card.addEventListener("click", () => openDetail(id));

        const thumb = document.createElement("div");
        thumb.className = "exercise-card-thumb";
        if (s.customImage) {
            const img = document.createElement("img");
            img.src = s.customImage;
            img.alt = ex.name;
            thumb.appendChild(img);
        } else {
            thumb.style.background = group ? group.color : "#6b7280";
            thumb.textContent = ex.icon;
        }
        card.appendChild(thumb);

        const body = document.createElement("div");
        body.className = "exercise-card-body";
        const nm = document.createElement("strong");
        nm.textContent = ex.name;
        body.appendChild(nm);

        const stats = document.createElement("span");
        stats.className = "exercise-card-stats";
        stats.textContent =
            (s.sessions || 0) + "× · max " + fmtKg(s.bestWeight || 0);
        body.appendChild(stats);

        card.appendChild(body);
        exercisesListEl.appendChild(card);
    }
}

// ===== Detail cviku =====
function openDetail(exerciseId) {
    detailExerciseId = exerciseId;
    renderDetail();
    showView("detail");
}

function renderDetail() {
    const ex = EXERCISE_BY_ID[detailExerciseId];
    if (!ex) return;
    const group = GROUP_BY_ID[ex.group];
    const s = exerciseStats[detailExerciseId] || {};

    detailNameEl.textContent = ex.name;
    detailGroupEl.textContent = group ? group.label : "";
    detailGroupEl.style.color = group ? group.color : "";

    // Obrázek
    detailImageEl.innerHTML = "";
    if (s.customImage) {
        const img = document.createElement("img");
        img.src = s.customImage;
        img.alt = ex.name;
        detailImageEl.appendChild(img);
        btnImageRemove.classList.remove("hidden");
    } else {
        detailImageEl.style.background = group ? group.color : "#6b7280";
        const span = document.createElement("span");
        span.textContent = ex.icon;
        detailImageEl.appendChild(span);
        btnImageRemove.classList.add("hidden");
    }

    // Statistiky
    detailStatsEl.innerHTML = "";
    const statsData = [
        { label: "Tréninků", value: (s.sessions || 0) + "×" },
        { label: "Max. váha", value: fmtKg(s.bestWeight || 0) },
        { label: "Celkový objem", value: fmtKg(s.totalVolume || 0) },
        { label: "Celkem setů", value: (s.totalSets || 0) + "×" },
    ];
    for (const st of statsData) {
        const cell = document.createElement("div");
        cell.className = "detail-stat";
        const v = document.createElement("strong");
        v.textContent = st.value;
        const l = document.createElement("span");
        l.textContent = st.label;
        cell.appendChild(v);
        cell.appendChild(l);
        detailStatsEl.appendChild(cell);
    }

    // Graf + sessions
    renderProgressChart(detailExerciseId);
    renderDetailSessions(detailExerciseId);
}

function collectExerciseHistory(exerciseId) {
    // Vrátí pole bodů {date, maxWeight, volume, sets} setříděné chronologicky.
    const points = [];
    for (const w of history) {
        const ex = (w.exercises || []).find((e) => e.exerciseId === exerciseId);
        if (!ex || !ex.sets || ex.sets.length === 0) continue;
        let maxW = 0;
        let vol = 0;
        for (const s of ex.sets) {
            maxW = Math.max(maxW, s.weight || 0);
            vol += (s.weight || 0) * (s.reps || 0);
        }
        points.push({
            date: w.finishedAt || w.startedAt || 0,
            maxWeight: maxW,
            volume: Math.round(vol),
            sets: ex.sets.length,
            workoutName: w.name || "Trénink",
        });
    }
    points.sort((a, b) => a.date - b.date);
    return points;
}

function renderProgressChart(exerciseId) {
    const points = collectExerciseHistory(exerciseId);
    detailChartEl.innerHTML = "";

    if (points.length < 2) {
        detailChartEmptyEl.classList.remove("hidden");
        detailChartEl.classList.add("hidden");
        return;
    }
    detailChartEmptyEl.classList.add("hidden");
    detailChartEl.classList.remove("hidden");

    const W = 600;
    const H = 220;
    const PAD_L = 40;
    const PAD_R = 12;
    const PAD_T = 14;
    const PAD_B = 28;
    const innerW = W - PAD_L - PAD_R;
    const innerH = H - PAD_T - PAD_B;

    const weights = points.map((p) => p.maxWeight);
    const minY = 0;
    const maxY = Math.max(...weights, 1);
    const yScale = (v) => PAD_T + innerH - ((v - minY) / (maxY - minY || 1)) * innerH;
    const xScale = (i) => PAD_L + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);

    const svgNS = "http://www.w3.org/2000/svg";

    // Mřížka Y — 4 čáry
    const gridCount = 4;
    for (let i = 0; i <= gridCount; i++) {
        const y = PAD_T + (innerH / gridCount) * i;
        const line = document.createElementNS(svgNS, "line");
        line.setAttribute("x1", PAD_L);
        line.setAttribute("x2", W - PAD_R);
        line.setAttribute("y1", y);
        line.setAttribute("y2", y);
        line.setAttribute("class", "chart-grid");
        detailChartEl.appendChild(line);

        const value = maxY - ((maxY - minY) / gridCount) * i;
        const label = document.createElementNS(svgNS, "text");
        label.setAttribute("x", PAD_L - 6);
        label.setAttribute("y", y + 4);
        label.setAttribute("class", "chart-axis");
        label.setAttribute("text-anchor", "end");
        label.textContent = Math.round(value);
        detailChartEl.appendChild(label);
    }

    // Vyplněná oblast pod křivkou
    const areaPts = points.map((p, i) => xScale(i) + "," + yScale(p.maxWeight));
    const area = document.createElementNS(svgNS, "polygon");
    area.setAttribute("class", "chart-area");
    area.setAttribute(
        "points",
        PAD_L + "," + (PAD_T + innerH) + " " + areaPts.join(" ") + " " +
        (W - PAD_R) + "," + (PAD_T + innerH)
    );
    detailChartEl.appendChild(area);

    // Spojovací čára
    const line = document.createElementNS(svgNS, "polyline");
    line.setAttribute("class", "chart-line");
    line.setAttribute("points", areaPts.join(" "));
    detailChartEl.appendChild(line);

    // Body + tooltipy (title)
    points.forEach((p, i) => {
        const c = document.createElementNS(svgNS, "circle");
        c.setAttribute("cx", xScale(i));
        c.setAttribute("cy", yScale(p.maxWeight));
        c.setAttribute("r", 4);
        c.setAttribute("class", "chart-point");
        const d = new Date(p.date);
        const dateStr = d.getDate() + ". " + (d.getMonth() + 1) + ".";
        const title = document.createElementNS(svgNS, "title");
        title.textContent = dateStr + " — " + fmtKg(p.maxWeight);
        c.appendChild(title);
        detailChartEl.appendChild(c);
    });

    // Osy X — první a poslední datum
    const first = new Date(points[0].date);
    const last = new Date(points[points.length - 1].date);
    const fmtAxisDate = (d) => d.getDate() + ". " + (d.getMonth() + 1) + ".";
    const xLabelFirst = document.createElementNS(svgNS, "text");
    xLabelFirst.setAttribute("x", xScale(0));
    xLabelFirst.setAttribute("y", H - 8);
    xLabelFirst.setAttribute("class", "chart-axis");
    xLabelFirst.setAttribute("text-anchor", "start");
    xLabelFirst.textContent = fmtAxisDate(first);
    detailChartEl.appendChild(xLabelFirst);

    const xLabelLast = document.createElementNS(svgNS, "text");
    xLabelLast.setAttribute("x", xScale(points.length - 1));
    xLabelLast.setAttribute("y", H - 8);
    xLabelLast.setAttribute("class", "chart-axis");
    xLabelLast.setAttribute("text-anchor", "end");
    xLabelLast.textContent = fmtAxisDate(last);
    detailChartEl.appendChild(xLabelLast);
}

function renderDetailSessions(exerciseId) {
    const points = collectExerciseHistory(exerciseId).slice().reverse();
    detailSessionsEl.innerHTML = "";
    if (points.length === 0) {
        const p = document.createElement("p");
        p.className = "empty-state";
        p.textContent = "Žádné záznamy.";
        detailSessionsEl.appendChild(p);
        return;
    }
    for (const p of points.slice(0, 10)) {
        const row = document.createElement("div");
        row.className = "detail-session-row";
        const d = new Date(p.date);
        row.innerHTML =
            '<span>' + fmtDateTime(d.getTime()) + '</span>' +
            '<span class="detail-session-metric">max ' + fmtKg(p.maxWeight) + '</span>' +
            '<span class="detail-session-metric">' + p.sets + " setů · " + fmtKg(p.volume) + '</span>';
        detailSessionsEl.appendChild(row);
    }
}

// ===== Upload obrázku / GIFu =====
function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error || new Error("FileReader error"));
        reader.readAsDataURL(file);
    });
}

async function resizeImage(file, maxW, maxH) {
    const dataUrl = await fileToDataUrl(file);
    const isPng = file.type === "image/png";
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            let w = img.naturalWidth;
            let h = img.naturalHeight;
            const ratio = Math.min(maxW / w, maxH / h, 1);
            w = Math.round(w * ratio);
            h = Math.round(h * ratio);
            const canvas = document.createElement("canvas");
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext("2d");
            if (isPng) {
                // PNG: zachovej průhlednost — žádné vyplnění pozadí
                ctx.clearRect(0, 0, w, h);
                ctx.drawImage(img, 0, 0, w, h);
                resolve(canvas.toDataURL("image/png"));
            } else {
                // JPEG/WebP: nepodporuje alfu, transparent pixely by byly černé.
                // Proto napřed vyplníme bílou.
                ctx.fillStyle = "#ffffff";
                ctx.fillRect(0, 0, w, h);
                ctx.drawImage(img, 0, 0, w, h);
                resolve(canvas.toDataURL("image/jpeg", 0.82));
            }
        };
        img.onerror = () => reject(new Error("Obrázek nelze načíst"));
        img.src = dataUrl;
    });
}

async function handleImageUpload(file) {
    if (!detailExerciseId || !file) return;
    const MAX_SIZE = 1.5 * 1024 * 1024; // 1,5 MB surový soubor
    if (file.size > MAX_SIZE) {
        alert("Soubor je moc velký. Max 1,5 MB.");
        return;
    }

    let dataUrl;
    try {
        if (file.type === "image/gif") {
            dataUrl = await fileToDataUrl(file);
        } else if (file.type.startsWith("image/")) {
            dataUrl = await resizeImage(file, 640, 640);
        } else {
            alert("Nahraj prosím obrázek nebo GIF.");
            return;
        }
    } catch (err) {
        alert("Chyba při zpracování souboru: " + err.message);
        return;
    }

    await saveCustomImage(detailExerciseId, dataUrl);
}

async function saveCustomImage(exerciseId, dataUrl) {
    if (currentUser) {
        const ref = doc(db, "users", currentUser.uid, "exerciseStats", exerciseId);
        try {
            const snap = await getDoc(ref);
            const prev = snap.exists() ? snap.data() : { exerciseId };
            await setDoc(ref, { ...prev, customImage: dataUrl });
        } catch (err) {
            alert("Chyba při ukládání obrázku: " + err.message);
        }
    } else {
        const stats = loadLocalStats();
        stats[exerciseId] = {
            ...(stats[exerciseId] || { exerciseId }),
            customImage: dataUrl,
        };
        saveLocalStats(stats);
        exerciseStats = stats;
        renderExercisesList();
        renderDetail();
    }
}

async function removeCustomImage() {
    if (!detailExerciseId) return;
    if (!confirm("Odstranit obrázek?")) return;
    if (currentUser) {
        const ref = doc(db, "users", currentUser.uid, "exerciseStats", detailExerciseId);
        try {
            const snap = await getDoc(ref);
            if (snap.exists()) {
                const data = snap.data();
                delete data.customImage;
                await setDoc(ref, data);
            }
        } catch (err) {
            alert("Chyba: " + err.message);
        }
    } else {
        const stats = loadLocalStats();
        if (stats[detailExerciseId]) {
            delete stats[detailExerciseId].customImage;
            saveLocalStats(stats);
        }
        exerciseStats = stats;
        renderExercisesList();
        renderDetail();
    }
}

// ===== Event handlery detailu =====
btnDetailBack.addEventListener("click", () => {
    detailExerciseId = null;
    showView("home");
});

detailImageInput.addEventListener("change", () => {
    const file = detailImageInput.files && detailImageInput.files[0];
    if (file) handleImageUpload(file);
    detailImageInput.value = "";
});

btnImageRemove.addEventListener("click", removeCustomImage);

// Obnova rozpracovaného tréninku po refreshi
activeWorkout = loadActive();
if (activeWorkout) {
    showView("active");
    renderActive();
    startTimer();
} else {
    showView("home");
}
