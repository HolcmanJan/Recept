// Rozpočet – sledování měsíčního rozpočtu (období 14. – 14.)
import { db } from "./firebase-init.js";
import {
    collection,
    doc,
    setDoc,
    deleteDoc,
    onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { initNavigation } from "./navigation.js";

const STORAGE_KEY = "recept.budget.v1";

// ----- Stav -----
let currentUser = null;
let unsubscribeBudget = null;
let budgetData = null; // { amount, expenses: { "YYYY-MM-DD": [{desc, amount}] } }
let periodStart = null; // Date
let periodEnd = null; // Date
let periodDays = []; // ["YYYY-MM-DD", ...]
let selectedDate = null; // "YYYY-MM-DD" pro modal

// ----- DOM -----
const periodEl = document.getElementById("budget-period");
const amountEl = document.getElementById("budget-amount");
const calendarEl = document.getElementById("budget-calendar");
const statTotalEl = document.getElementById("stat-total");
const statSpentEl = document.getElementById("stat-spent");
const statRemainingValueEl = document.getElementById("stat-remaining-value");
const statRemainingArrowEl = document.getElementById("stat-remaining-arrow");
const statDailyEl = document.getElementById("stat-daily");

const modalEl = document.getElementById("expense-modal");
const modalTitleEl = document.getElementById("expense-modal-title");
const expenseListEl = document.getElementById("expense-list");
const expenseDescEl = document.getElementById("expense-desc");
const expenseAmountEl = document.getElementById("expense-amount");
const expenseAddBtn = document.getElementById("expense-add-btn");
const expenseCloseBtn = document.getElementById("expense-close-btn");
const expenseDayTotalEl = document.getElementById("expense-day-total");
const modalBackdrop = document.querySelector(".expense-modal-backdrop");

// ----- Období -----
function computePeriod() {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth(); // 0-indexed

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
        periodDays.push(formatDate(d));
        d.setDate(d.getDate() + 1);
    }
}

function formatDate(d) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return yyyy + "-" + mm + "-" + dd;
}

function formatDateCZ(dateStr) {
    const [y, m, d] = dateStr.split("-");
    return parseInt(d) + ". " + parseInt(m) + ". " + y;
}

function periodKey() {
    return formatDate(periodStart);
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

// ----- Výpočty -----
function dayExpenseTotal(dateStr) {
    const items = (budgetData.expenses && budgetData.expenses[dateStr]) || [];
    return items.reduce((sum, e) => sum + (e.amount || 0), 0);
}

function totalSpent() {
    let sum = 0;
    for (const day of periodDays) {
        sum += dayExpenseTotal(day);
    }
    return sum;
}

function dailyBudget() {
    if (periodDays.length === 0) return 0;
    return budgetData.amount / periodDays.length;
}

function expectedRemainingToday() {
    const today = formatDate(new Date());
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
        "Období: " + formatDateCZ(formatDate(periodStart)) + " – " + formatDateCZ(formatDate(periodEnd));
}

function renderSummary() {
    const total = budgetData.amount || 0;
    const spent = totalSpent();
    const remaining = total - spent;
    const daily = dailyBudget();

    statTotalEl.textContent = formatMoney(total);
    statSpentEl.textContent = formatMoney(spent);
    statRemainingValueEl.textContent = formatMoney(remaining);
    statDailyEl.textContent = formatMoney(Math.round(daily));

    // Šipka u zůstatku
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
    const today = formatDate(new Date());
    const daily = dailyBudget();

    // Záhlaví dnů v týdnu
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

    // Dny v gridu
    const grid = document.createElement("div");
    grid.className = "budget-cal-grid";

    // Najdi den v týdnu prvního dne (0=Ne, 1=Po, ... 6=So)
    const firstDayOfWeek = periodStart.getDay();
    // Převeď na pondělní start (Po=0, Út=1, ..., Ne=6)
    const offset = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;

    // Prázdné buňky před prvním dnem
    for (let i = 0; i < offset; i++) {
        const empty = document.createElement("div");
        empty.className = "budget-cal-cell budget-cal-empty";
        grid.appendChild(empty);
    }

    periodDays.forEach((dateStr) => {
        const cell = document.createElement("div");
        cell.className = "budget-cal-cell";

        const spent = dayExpenseTotal(dateStr);
        const dayNum = parseInt(dateStr.split("-")[2]);

        // Barva podle poměru útraty k dennímu budgetu
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

        if (dateStr === today) {
            cell.classList.add("budget-day-today");
        }

        const numEl = document.createElement("span");
        numEl.className = "budget-cal-num";
        numEl.textContent = dayNum;
        cell.appendChild(numEl);

        if (spent > 0) {
            const spentEl = document.createElement("span");
            spentEl.className = "budget-cal-spent";
            spentEl.textContent = formatMoney(spent);
            cell.appendChild(spentEl);
        }

        cell.addEventListener("click", () => openExpenseModal(dateStr));
        grid.appendChild(cell);
    });

    calendarEl.appendChild(grid);
}

function formatMoney(n) {
    return n.toLocaleString("cs-CZ") + " Kč";
}

// ----- Modal pro zadání útraty -----
function openExpenseModal(dateStr) {
    selectedDate = dateStr;
    modalTitleEl.textContent = formatDateCZ(dateStr);
    renderExpenseList();
    modalEl.classList.remove("hidden");
    expenseAmountEl.focus();
}

function closeExpenseModal() {
    modalEl.classList.add("hidden");
    selectedDate = null;
    expenseDescEl.value = "";
    expenseAmountEl.value = "";
}

function renderExpenseList() {
    expenseListEl.innerHTML = "";
    const items = (budgetData.expenses && budgetData.expenses[selectedDate]) || [];

    if (items.length === 0) {
        const empty = document.createElement("p");
        empty.className = "expense-empty";
        empty.textContent = "Žádné útraty.";
        expenseListEl.appendChild(empty);
    } else {
        items.forEach((item, idx) => {
            const row = document.createElement("div");
            row.className = "expense-row";

            const desc = document.createElement("span");
            desc.className = "expense-row-desc";
            desc.textContent = item.desc || "Útrata";
            row.appendChild(desc);

            const amt = document.createElement("span");
            amt.className = "expense-row-amount";
            amt.textContent = formatMoney(item.amount);
            row.appendChild(amt);

            const delBtn = document.createElement("button");
            delBtn.className = "expense-row-delete";
            delBtn.textContent = "×";
            delBtn.title = "Smazat";
            delBtn.addEventListener("click", () => removeExpense(idx));
            row.appendChild(delBtn);

            expenseListEl.appendChild(row);
        });
    }

    const total = dayExpenseTotal(selectedDate);
    expenseDayTotalEl.textContent = "Celkem: " + formatMoney(total);
}

async function addExpense() {
    const amount = parseFloat(expenseAmountEl.value);
    if (!amount || amount <= 0) return;

    const desc = expenseDescEl.value.trim();
    if (!budgetData.expenses) budgetData.expenses = {};
    if (!budgetData.expenses[selectedDate]) budgetData.expenses[selectedDate] = [];

    budgetData.expenses[selectedDate].push({ desc, amount });

    try {
        await persistBudgetData();
    } catch (err) {
        console.error(err);
        alert("Chyba při ukládání: " + err.message);
    }

    expenseDescEl.value = "";
    expenseAmountEl.value = "";
    expenseAmountEl.focus();

    renderExpenseList();
    renderSummary();
    renderCalendar();
}

async function removeExpense(idx) {
    const items = budgetData.expenses[selectedDate];
    if (!items) return;
    items.splice(idx, 1);
    if (items.length === 0) delete budgetData.expenses[selectedDate];

    try {
        await persistBudgetData();
    } catch (err) {
        console.error(err);
        alert("Chyba při mazání: " + err.message);
    }

    renderExpenseList();
    renderSummary();
    renderCalendar();
}

// ----- Změna rozpočtu -----
let saveTimeout = null;
async function onBudgetAmountChange() {
    budgetData.amount = parseFloat(amountEl.value) || 0;
    renderSummary();
    renderCalendar();

    // Debounce uložení
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
        try {
            await persistBudgetData();
        } catch (err) {
            console.error(err);
        }
    }, 500);
}

// ----- Event listeners -----
amountEl.addEventListener("input", onBudgetAmountChange);
expenseAddBtn.addEventListener("click", addExpense);
expenseCloseBtn.addEventListener("click", closeExpenseModal);
modalBackdrop.addEventListener("click", closeExpenseModal);
document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modalEl.classList.contains("hidden")) {
        closeExpenseModal();
    }
});
// Enter v částce přidá útratu
expenseAmountEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
        e.preventDefault();
        addExpense();
    }
});

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
                budgetData = snapshot.exists()
                    ? { ...defaultBudget(), ...snapshot.data() }
                    : defaultBudget();
                amountEl.value = budgetData.amount || "";
                render();
            },
            (err) => {
                console.error("Firestore chyba:", err);
                alert("Chyba při načítání rozpočtu: " + err.message);
            }
        );
    } else {
        const allData = loadLocal();
        budgetData = getBudgetForPeriod(allData);
        amountEl.value = budgetData.amount || "";
        render();
    }
});
