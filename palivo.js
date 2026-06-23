import { db } from "./firebase-init.js";
import {
    doc,
    setDoc,
    getDoc,
    onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { initNavigation } from "./navigation.js";

const STORAGE_KEY = "recept.palivo.v1";

let currentUser = null;
let unsubData = null;
let data = null; // { consumption, pricePerLiter, people: [...] }

// DOM
const kmEl = document.getElementById("fuel-km");
const passEl = document.getElementById("fuel-passengers");
const consEl = document.getElementById("fuel-consumption");
const priceEl = document.getElementById("fuel-price");
const totalEl = document.getElementById("fuel-total");
const perPersonEl = document.getElementById("fuel-per-person");
const assignBtn = document.getElementById("fuel-assign-btn");
const assignMenu = document.getElementById("fuel-assign-menu");
const addPersonBtn = document.getElementById("fuel-add-person");
const peopleListEl = document.getElementById("fuel-people-list");

// ----- Data -----
function defaultData() {
    return { consumption: 0, pricePerLiter: 0, people: [] };
}

function loadLocal() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch { return null; }
}

function saveLocal(d) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(d));
}

async function persist() {
    if (currentUser) {
        const ref = doc(db, "users", currentUser.uid, "palivo", "data");
        await setDoc(ref, data);
    } else {
        saveLocal(data);
    }
}

let saveTimeout = null;
function debouncedSave() {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
        try { await persist(); }
        catch (err) { console.error(err); }
    }, 400);
}

function loadData() {
    if (unsubData) { unsubData(); unsubData = null; }

    if (currentUser) {
        const ref = doc(db, "users", currentUser.uid, "palivo", "data");
        unsubData = onSnapshot(ref, (snap) => {
            if (snap.exists()) {
                data = { ...defaultData(), ...snap.data() };
                if (!Array.isArray(data.people)) data.people = [];
            } else {
                data = loadLocal() || defaultData();
            }
            applyDataToInputs();
            renderPeople();
        }, (err) => {
            console.error("Firestore error:", err);
            data = defaultData();
            applyDataToInputs();
            renderPeople();
        });
    } else {
        data = loadLocal() || defaultData();
        applyDataToInputs();
        renderPeople();
    }
}

function applyDataToInputs() {
    if (data.consumption) consEl.value = data.consumption;
    if (data.pricePerLiter) priceEl.value = data.pricePerLiter;
    recalc();
}

// ----- Calculator -----
function recalc() {
    const km = parseFloat(kmEl.value) || 0;
    const passengers = Math.max(1, parseInt(passEl.value) || 1);
    const consumption = parseFloat(consEl.value) || 0;
    const price = parseFloat(priceEl.value) || 0;

    const total = (km * consumption / 100) * price;
    const pp = passengers > 0 ? total / passengers : 0;

    totalEl.textContent = fmtMoney(Math.round(total));
    perPersonEl.textContent = fmtMoney(Math.round(pp));
    assignBtn.disabled = pp <= 0;
}

function onCalcInput() {
    recalc();
    const consumption = parseFloat(consEl.value) || 0;
    const price = parseFloat(priceEl.value) || 0;
    if (data && (consumption !== data.consumption || price !== data.pricePerLiter)) {
        data.consumption = consumption;
        data.pricePerLiter = price;
        debouncedSave();
    }
}

// ----- Assign to person -----
let menuOpen = false;

function toggleAssignMenu() {
    if (assignBtn.disabled) return;
    menuOpen = !menuOpen;
    if (menuOpen) {
        renderAssignMenu();
        assignMenu.classList.remove("hidden");
    } else {
        assignMenu.classList.add("hidden");
    }
}

function closeAssignMenu() {
    menuOpen = false;
    assignMenu.classList.add("hidden");
}

function renderAssignMenu() {
    assignMenu.innerHTML = "";
    data.people.forEach((person) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "fuel-menu-item";
        btn.textContent = person.name;
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            assignToPerson(person.id);
        });
        assignMenu.appendChild(btn);
    });
    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "fuel-menu-item fuel-menu-item-new";
    addBtn.textContent = "+ Nová osoba";
    addBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        closeAssignMenu();
        promptNewPersonAndAssign();
    });
    assignMenu.appendChild(addBtn);
}

function getPerPerson() {
    const km = parseFloat(kmEl.value) || 0;
    const passengers = Math.max(1, parseInt(passEl.value) || 1);
    const consumption = parseFloat(consEl.value) || 0;
    const price = parseFloat(priceEl.value) || 0;
    const total = (km * consumption / 100) * price;
    return Math.round(total / passengers);
}

function assignToPerson(personId) {
    closeAssignMenu();
    const amount = getPerPerson();
    if (amount <= 0) return;

    const person = data.people.find((p) => p.id === personId);
    if (!person) return;

    person.entries.unshift({
        id: uid(),
        amount,
        paid: false,
        date: todayStr(),
    });
    debouncedSave();
    renderPeople();
    expandedPersonId = personId;
    renderPeople();
}

function promptNewPersonAndAssign() {
    const name = prompt("Jméno nové osoby:");
    if (!name || !name.trim()) return;

    const person = {
        id: uid(),
        name: name.trim(),
        entries: [],
    };
    data.people.push(person);

    const amount = getPerPerson();
    if (amount > 0) {
        person.entries.push({
            id: uid(),
            amount,
            paid: false,
            date: todayStr(),
        });
    }
    debouncedSave();
    expandedPersonId = person.id;
    renderPeople();
}

// ----- People list -----
let expandedPersonId = null;

function renderPeople() {
    peopleListEl.innerHTML = "";
    if (!data || data.people.length === 0) {
        peopleListEl.innerHTML = '<p class="fuel-empty">Zatím žádné osoby.</p>';
        return;
    }

    data.people.forEach((person) => {
        const card = document.createElement("div");
        card.className = "fuel-person-card";

        const unpaid = person.entries
            .filter((e) => !e.paid)
            .reduce((s, e) => s + e.amount, 0);

        const header = document.createElement("button");
        header.type = "button";
        header.className = "fuel-person-header";
        if (expandedPersonId === person.id) header.classList.add("open");

        const nameSpan = document.createElement("span");
        nameSpan.className = "fuel-person-name";
        nameSpan.textContent = person.name;

        const totalSpan = document.createElement("span");
        totalSpan.className = "fuel-person-total";
        if (unpaid > 0) {
            totalSpan.textContent = fmtMoney(unpaid);
            totalSpan.classList.add("has-debt");
        } else {
            totalSpan.textContent = "vyrovnáno";
        }

        const arrow = document.createElement("span");
        arrow.className = "fuel-person-arrow";
        arrow.textContent = expandedPersonId === person.id ? "▾" : "▸";

        header.appendChild(nameSpan);
        header.appendChild(totalSpan);
        header.appendChild(arrow);

        header.addEventListener("click", () => {
            expandedPersonId = expandedPersonId === person.id ? null : person.id;
            renderPeople();
        });

        card.appendChild(header);

        if (expandedPersonId === person.id) {
            const body = document.createElement("div");
            body.className = "fuel-person-body";

            if (person.entries.length === 0) {
                const empty = document.createElement("p");
                empty.className = "fuel-entry-empty";
                empty.textContent = "Žádné záznamy.";
                body.appendChild(empty);
            } else {
                person.entries.forEach((entry) => {
                    body.appendChild(renderEntry(person, entry));
                });
            }

            const actions = document.createElement("div");
            actions.className = "fuel-person-actions";

            const renameBtn = document.createElement("button");
            renameBtn.type = "button";
            renameBtn.className = "fuel-action-btn";
            renameBtn.textContent = "Přejmenovat";
            renameBtn.addEventListener("click", () => renamePerson(person));

            const deleteBtn = document.createElement("button");
            deleteBtn.type = "button";
            deleteBtn.className = "fuel-action-btn fuel-action-danger";
            deleteBtn.textContent = "Smazat osobu";
            deleteBtn.addEventListener("click", () => deletePerson(person));

            actions.appendChild(renameBtn);
            actions.appendChild(deleteBtn);
            body.appendChild(actions);

            card.appendChild(body);
        }

        peopleListEl.appendChild(card);
    });
}

function renderEntry(person, entry) {
    const row = document.createElement("div");
    row.className = "fuel-entry" + (entry.paid ? " fuel-entry-paid" : "");

    const dateSpan = document.createElement("span");
    dateSpan.className = "fuel-entry-date";
    dateSpan.textContent = fmtDateCZ(entry.date);

    const amountSpan = document.createElement("span");
    amountSpan.className = "fuel-entry-amount";
    amountSpan.textContent = fmtMoney(entry.amount);

    const actionsDiv = document.createElement("div");
    actionsDiv.className = "fuel-entry-actions";

    const paidBtn = document.createElement("button");
    paidBtn.type = "button";
    paidBtn.className = "fuel-entry-btn" + (entry.paid ? " active" : "");
    paidBtn.title = entry.paid ? "Označit jako nezaplacené" : "Označit jako zaplacené";
    paidBtn.textContent = "✓";
    paidBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        entry.paid = !entry.paid;
        debouncedSave();
        renderPeople();
    });

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "fuel-entry-btn";
    editBtn.title = "Upravit částku";
    editBtn.textContent = "✎";
    editBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        editEntry(person, entry);
    });

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "fuel-entry-btn fuel-entry-btn-danger";
    delBtn.title = "Smazat";
    delBtn.textContent = "✕";
    delBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        deleteEntry(person, entry);
    });

    actionsDiv.appendChild(paidBtn);
    actionsDiv.appendChild(editBtn);
    actionsDiv.appendChild(delBtn);

    row.appendChild(dateSpan);
    row.appendChild(amountSpan);
    row.appendChild(actionsDiv);

    return row;
}

// ----- Entry actions -----
function editEntry(person, entry) {
    const val = prompt("Nová částka:", entry.amount);
    if (val === null) return;
    const num = parseInt(val);
    if (isNaN(num) || num < 0) return;
    entry.amount = num;
    debouncedSave();
    renderPeople();
}

function deleteEntry(person, entry) {
    if (!confirm("Smazat záznam " + fmtMoney(entry.amount) + "?")) return;
    person.entries = person.entries.filter((e) => e.id !== entry.id);
    debouncedSave();
    renderPeople();
}

function renamePerson(person) {
    const name = prompt("Nové jméno:", person.name);
    if (!name || !name.trim()) return;
    person.name = name.trim();
    debouncedSave();
    renderPeople();
}

function deletePerson(person) {
    if (!confirm("Smazat osobu „" + person.name + "" a všechny její záznamy?")) return;
    data.people = data.people.filter((p) => p.id !== person.id);
    if (expandedPersonId === person.id) expandedPersonId = null;
    debouncedSave();
    renderPeople();
}

// ----- Utils -----
function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function todayStr() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return yyyy + "-" + mm + "-" + dd;
}

function fmtDateCZ(dateStr) {
    const [y, m, d] = dateStr.split("-");
    return parseInt(d) + ". " + parseInt(m) + ". " + y;
}

function fmtMoney(n) {
    return n.toLocaleString("cs-CZ") + " Kč";
}

// ----- Events -----
kmEl.addEventListener("input", onCalcInput);
passEl.addEventListener("input", onCalcInput);
consEl.addEventListener("input", onCalcInput);
priceEl.addEventListener("input", onCalcInput);

assignBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleAssignMenu();
});

document.addEventListener("click", () => {
    if (menuOpen) closeAssignMenu();
});

addPersonBtn.addEventListener("click", () => {
    const name = prompt("Jméno nové osoby:");
    if (!name || !name.trim()) return;
    data.people.push({ id: uid(), name: name.trim(), entries: [] });
    debouncedSave();
    renderPeople();
});

// ----- Init -----
initNavigation("home", (user) => {
    currentUser = user;
    loadData();
});
