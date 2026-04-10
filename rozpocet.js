// Rozpočet – sledování měsíčního rozpočtu (období 14. – 14.)
import { db } from "./firebase-init.js";
import {
    doc,
    setDoc,
    onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { initNavigation } from "./navigation.js";

const STORAGE_KEY = "recept.budget.v1";
const STEP = 10;

// ----- Stav -----
let currentUser = null;
let unsubscribeBudget = null;
let budgetData = null; // { amount, expenses: { "YYYY-MM-DD": number } }
let periodStart = null;
let periodEnd = null;
let periodDays = [];
let openDay = null; // "YYYY-MM-DD" právě otevřená bublina

// ----- DOM -----
const periodEl = document.getElementById("budget-period");
const amountEl = document.getElementById("budget-amount");
const calendarEl = document.getElementById("budget-calendar");
const statTotalEl = document.getElementById("stat-total");
const statSpentEl = document.getElementById("stat-spent");
const statRemainingValueEl = document.getElementById("stat-remaining-value");
const statRemainingArrowEl = document.getElementById("stat-remaining-arrow");
const statDailyEl = document.getElementById("stat-daily");

// ----- Období -----
function computePeriod() {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();

    if (now.getDate() >= 14) {
        periodStart = new Date(y, m, 14);
        periodEnd = new Date(y, m + 1, 13);
    } else {
        periodStart = new Date(y, m - 1, 14);
        periodEnd = new Date(y, m, 13);
    }

    periodDays = [];
    const d = new Date(periodStart);
    while (d <= periodEnd) {
        periodDays.push(fmtDate(d));
        d.setDate(d.getDate() + 1);
    }
}

function fmtDate(d) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return yyyy + "-" + mm + "-" + dd;
}

function fmtDateCZ(dateStr) {
    const [y, m, d] = dateStr.split("-");
    return parseInt(d) + ". " + parseInt(m) + ". " + y;
}

function periodKey() {
    return fmtDate(periodStart);
}

// ----- Data -----
function defaultBudget() {
    return { amount: 0, expenses: {} };
}

function loadLocal() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return {};
        return JSON.parse(raw) || {};
    } catch {
        return {};
    }
}

function saveLocal(allData) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(allData));
}

function getBudgetForPeriod(allData) {
    const key = periodKey();
    return allData[key] ? { ...defaultBudget(), ...allData[key] } : defaultBudget();
}

// Migrace starého formátu (pole objektů → číslo)
function migrateExpenses(expenses) {
    if (!expenses) return {};
    const out = {};
    for (const [key, val] of Object.entries(expenses)) {
        if (Array.isArray(val)) {
            out[key] = val.reduce((s, e) => s + (e.amount || 0), 0);
        } else {
            out[key] = typeof val === "number" ? val : 0;
        }
    }
    return out;
}

async function persistBudgetData() {
    if (currentUser) {
        const ref = doc(db, "users", currentUser.uid, "budget", periodKey());
        await setDoc(ref, budgetData);
    } else {
        const allData = loadLocal();
        allData[periodKey()] = budgetData;
        saveLocal(allData);
    }
}

let saveTimeout = null;
function debouncedSave() {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
        try {
            await persistBudgetData();
        } catch (err) {
            console.error(err);
        }
    }, 400);
}

// ----- Výpočty -----
function daySpent(dateStr) {
    return (budgetData.expenses && budgetData.expenses[dateStr]) || 0;
}

function totalSpent() {
    let sum = 0;
    for (const day of periodDays) sum += daySpent(day);
    return sum;
}

function dailyBudget() {
    const today = fmtDate(new Date());
    const remaining = budgetData.amount - totalSpent();
    let daysLeft = 0;
    for (const day of periodDays) {
        if (day >= today) daysLeft++;
    }
    if (daysLeft <= 0) return 0;
    return remaining / daysLeft;
}

function expectedRemainingToday() {
    const today = fmtDate(new Date());
    let daysPassed = 0;
    for (const day of periodDays) {
        if (day <= today) daysPassed++;
    }
    return budgetData.amount - dailyBudget() * daysPassed;
}

// ----- Vykreslení -----
function render() {
    renderPeriod();
    renderSummary();
    renderCalendar();
}

function renderPeriod() {
    periodEl.textContent =
        "Období: " + fmtDateCZ(fmtDate(periodStart)) + " – " + fmtDateCZ(fmtDate(periodEnd));
}

function renderSummary() {
    const total = budgetData.amount || 0;
    const spent = totalSpent();
    const remaining = total - spent;
    const daily = dailyBudget();

    statTotalEl.textContent = fmtMoney(total);
    statSpentEl.textContent = fmtMoney(spent);
    statRemainingValueEl.textContent = fmtMoney(remaining);
    statDailyEl.textContent = fmtMoney(Math.round(daily));

    const expected = expectedRemainingToday();
    if (total > 0) {
        statRemainingArrowEl.classList.remove("hidden");
        if (remaining < expected) {
            statRemainingArrowEl.textContent = "▼";
            statRemainingArrowEl.className = "budget-arrow arrow-down";
        } else {
            statRemainingArrowEl.textContent = "▲";
            statRemainingArrowEl.className = "budget-arrow arrow-up";
        }
    } else {
        statRemainingArrowEl.classList.add("hidden");
    }
}

function renderCalendar() {
    calendarEl.innerHTML = "";
    const today = fmtDate(new Date());
    const daily = dailyBudget();

    const dayNames = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"];
    const headerRow = document.createElement("div");
    headerRow.className = "budget-cal-header";
    dayNames.forEach((name) => {
        const cell = document.createElement("div");
        cell.className = "budget-cal-dayname";
        cell.textContent = name;
        headerRow.appendChild(cell);
    });
    calendarEl.appendChild(headerRow);

    const grid = document.createElement("div");
    grid.className = "budget-cal-grid";

    const firstDayOfWeek = periodStart.getDay();
    const offset = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;

    for (let i = 0; i < offset; i++) {
        const empty = document.createElement("div");
        empty.className = "budget-cal-cell budget-cal-empty";
        grid.appendChild(empty);
    }

    periodDays.forEach((dateStr) => {
        const cell = document.createElement("div");
        cell.className = "budget-cal-cell";

        const spent = daySpent(dateStr);
        const dayNum = parseInt(dateStr.split("-")[2]);

        if (daily > 0) {
            const ratio = spent / daily;
            if (spent === 0) {
                cell.classList.add("budget-day-neutral");
            } else if (ratio <= 1) {
                cell.classList.add("budget-day-ok");
            } else if (ratio <= 1.5) {
                cell.classList.add("budget-day-warn");
            } else {
                cell.classList.add("budget-day-over");
            }
        }

        if (dateStr === today) cell.classList.add("budget-day-today");

        const numEl = document.createElement("span");
        numEl.className = "budget-cal-num";
        numEl.textContent = dayNum;
        cell.appendChild(numEl);

        if (spent > 0) {
            const spentEl = document.createElement("span");
            spentEl.className = "budget-cal-spent";
            spentEl.textContent = fmtMoney(spent);
            cell.appendChild(spentEl);
        }

        // Klik → otevři / zavři bublinu
        cell.addEventListener("click", (e) => {
            e.stopPropagation();
            toggleBubble(dateStr, cell);
        });

        // Pokud je den právě otevřený, přidej bublinu
        if (openDay === dateStr) {
            cell.classList.add("budget-cell-open");
            cell.appendChild(createBubble(dateStr));
        }

        grid.appendChild(cell);
    });

    calendarEl.appendChild(grid);
}

// ----- Inline bublina (+/- ovládání) -----
function toggleBubble(dateStr, cell) {
    if (openDay === dateStr) {
        openDay = null;
    } else {
        openDay = dateStr;
    }
    renderCalendar();
}

function createBubble(dateStr) {
    const bubble = document.createElement("div");
    bubble.className = "budget-bubble";

    const minusBtn = document.createElement("button");
    minusBtn.type = "button";
    minusBtn.className = "budget-bubble-btn";
    minusBtn.textContent = "−";
    minusBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        changeExpense(dateStr, -STEP);
    });

    const valueEl = document.createElement("span");
    valueEl.className = "budget-bubble-value";
    valueEl.textContent = daySpent(dateStr);

    const plusBtn = document.createElement("button");
    plusBtn.type = "button";
    plusBtn.className = "budget-bubble-btn";
    plusBtn.textContent = "+";
    plusBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        changeExpense(dateStr, STEP);
    });

    bubble.appendChild(minusBtn);
    bubble.appendChild(valueEl);
    bubble.appendChild(plusBtn);

    // Zastav klik, aby se bublina nezavřela klikem na sebe
    bubble.addEventListener("click", (e) => e.stopPropagation());

    return bubble;
}

function changeExpense(dateStr, delta) {
    if (!budgetData.expenses) budgetData.expenses = {};
    const current = budgetData.expenses[dateStr] || 0;
    const next = Math.max(0, current + delta);
    if (next === 0) {
        delete budgetData.expenses[dateStr];
    } else {
        budgetData.expenses[dateStr] = next;
    }
    debouncedSave();
    renderSummary();
    renderCalendar();
}

// Zavři bublinu klikem kamkoliv mimo
document.addEventListener("click", () => {
    if (openDay !== null) {
        openDay = null;
        renderCalendar();
    }
});

function fmtMoney(n) {
    return n.toLocaleString("cs-CZ") + " Kč";
}

// ----- Změna rozpočtu -----
function onBudgetAmountChange() {
    budgetData.amount = parseFloat(amountEl.value) || 0;
    renderSummary();
    renderCalendar();
    debouncedSave();
}

// ----- Event listeners -----
amountEl.addEventListener("input", onBudgetAmountChange);

// ----- Inicializace -----
computePeriod();

initNavigation("rozpocet", (user) => {
    currentUser = user;

    if (unsubscribeBudget) {
        unsubscribeBudget();
        unsubscribeBudget = null;
    }

    if (user) {
        const ref = doc(db, "users", user.uid, "budget", periodKey());
        unsubscribeBudget = onSnapshot(
            ref,
            (snapshot) => {
                if (snapshot.exists()) {
                    budgetData = { ...defaultBudget(), ...snapshot.data() };
                    budgetData.expenses = migrateExpenses(budgetData.expenses);
                } else {
                    budgetData = defaultBudget();
                }
                amountEl.value = budgetData.amount || "";
                render();
            },
            (err) => {
                console.error("Firestore chyba:", err);
                budgetData = defaultBudget();
                amountEl.value = "";
                render();
                alert(
                    "Nepodařilo se načíst rozpočet z cloudu. Zkontroluj Firestore pravidla.\n\n" +
                    err.message
                );
            }
        );
    } else {
        const allData = loadLocal();
        budgetData = getBudgetForPeriod(allData);
        budgetData.expenses = migrateExpenses(budgetData.expenses);
        amountEl.value = budgetData.amount || "";
        render();
    }
});
