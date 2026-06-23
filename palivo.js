import { db } from "./firebase-init.js";
import {
    doc,
    setDoc,
    onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { initNavigation } from "./navigation.js";

const STORAGE_KEY = "recept.palivo.v1";

let currentUser = null;
let unsubData = null;
let data = { consumption: 0, pricePerLiter: 0, people: [] };

// DOM
const kmEl = document.getElementById("fuel-km");
const passEl = document.getElementById("fuel-passengers");
const consEl = document.getElementById("fuel-consumption");
const priceEl = document.getElementById("fuel-price");
const totalEl = document.getElementById("fuel-total");
const perPersonEl = document.getElementById("fuel-per-person");
const assignBtn = document.getElementById("fuel-assign-btn");
const assignMenu = document.getElementById("fuel-assign-menu");
const peopleListEl = document.getElementById("fuel-people-list");
const newPersonInput = document.getElementById("fuel-new-person-name");
const newPersonBtn = document.getElementById("fuel-new-person-btn");

// ----- Data -----
function loadLocal() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") return null;
        if (!Array.isArray(parsed.people)) parsed.people = [];
        return parsed;
    } catch (e) { return null; }
}

function saveLocal() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

async function persist() {
    if (!data) return;
    if (currentUser) {
        try {
            const ref = doc(db, "users", currentUser.uid, "palivo", "data");
            await setDoc(ref, data);
        } catch (e) { console.error(e); }
    }
    saveLocal();
}

let saveTimeout = null;
function debouncedSave() {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => persist(), 400);
}

function loadData() {
    if (unsubData) { unsubData(); unsubData = null; }

    if (currentUser) {
        const ref = doc(db, "users", currentUser.uid, "palivo", "data");
        unsubData = onSnapshot(ref, (snap) => {
            if (snap.exists()) {
                const d = snap.data();
                data.consumption = d.consumption || data.consumption || 0;
                data.pricePerLiter = d.pricePerLiter || data.pricePerLiter || 0;
                data.people = Array.isArray(d.people) ? d.people : data.people;
            }
            applyDataToInputs();
            renderPeople();
        }, () => {
            applyDataToInputs();
            renderPeople();
        });
    } else {
        const saved = loadLocal();
        if (saved) {
            data.consumption = saved.consumption || 0;
            data.pricePerLiter = saved.pricePerLiter || 0;
            data.people = Array.isArray(saved.people) ? saved.people : [];
        }
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
    if (consumption !== data.consumption || price !== data.pricePerLiter) {
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

    if (data.people.length === 0) {
        const hint = document.createElement("div");
        hint.className = "fuel-menu-hint";
        hint.textContent = "Nejprve vytvořte osobu níže.";
        assignMenu.appendChild(hint);
        return;
    }

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

    if (!Array.isArray(person.entries)) person.entries = [];
    person.entries.unshift({
        id: uid(),
        amount: amount,
        paid: false,
        date: todayStr(),
    });

    expandedPersonId = personId;
    debouncedSave();
    renderPeople();
}

// ----- New person -----
function addNewPerson() {
    const name = newPersonInput.value.trim();
    if (!name) return;

    const person = { id: uid(), name: name, entries: [] };
    data.people.push(person);
    newPersonInput.value = "";

    debouncedSave();
    expandedPersonId = person.id;
    renderPeople();
}

// ----- People list -----
let expandedPersonId = null;
let editingEntryId = null;
let renamingPersonId = null;
let confirmDeleteId = null;

function renderPeople() {
    peopleListEl.innerHTML = "";

    if (data.people.length === 0) {
        peopleListEl.innerHTML = '<p class="fuel-empty">Zatím žádné osoby. Zadejte jméno níže.</p>';
        return;
    }

    data.people.forEach((person) => {
        const card = document.createElement("div");
        card.className = "fuel-person-card";

        if (!Array.isArray(person.entries)) person.entries = [];
        const unpaid = person.entries.filter((e) => !e.paid).reduce((s, e) => s + e.amount, 0);

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
            editingEntryId = null;
            renamingPersonId = null;
            confirmDeleteId = null;
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

            body.appendChild(renderPersonActions(person));
            card.appendChild(body);
        }

        peopleListEl.appendChild(card);
    });
}

function renderEntry(person, entry) {
    if (editingEntryId === entry.id) {
        return renderEntryEdit(person, entry);
    }

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
    editBtn.title = "Upravit";
    editBtn.textContent = "✎";
    editBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        editingEntryId = entry.id;
        renderPeople();
    });

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "fuel-entry-btn fuel-entry-btn-danger";
    delBtn.title = "Smazat";
    delBtn.textContent = "✕";
    delBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        person.entries = person.entries.filter((x) => x.id !== entry.id);
        debouncedSave();
        renderPeople();
    });

    actionsDiv.appendChild(paidBtn);
    actionsDiv.appendChild(editBtn);
    actionsDiv.appendChild(delBtn);

    row.appendChild(dateSpan);
    row.appendChild(amountSpan);
    row.appendChild(actionsDiv);
    return row;
}

function renderEntryEdit(person, entry) {
    const row = document.createElement("div");
    row.className = "fuel-entry fuel-entry-editing";

    const input = document.createElement("input");
    input.type = "number";
    input.className = "fuel-edit-input";
    input.value = entry.amount;
    input.min = "0";
    input.step = "any";
    input.inputMode = "decimal";

    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "btn btn-primary fuel-edit-save";
    saveBtn.textContent = "Uložit";
    saveBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const val = parseInt(input.value);
        if (!isNaN(val) && val >= 0) {
            entry.amount = val;
            debouncedSave();
        }
        editingEntryId = null;
        renderPeople();
    });

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "fuel-action-btn";
    cancelBtn.textContent = "Zrušit";
    cancelBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        editingEntryId = null;
        renderPeople();
    });

    row.appendChild(input);
    row.appendChild(saveBtn);
    row.appendChild(cancelBtn);

    setTimeout(() => input.focus(), 10);
    return row;
}

function renderPersonActions(person) {
    const wrap = document.createElement("div");
    wrap.className = "fuel-person-actions";

    if (renamingPersonId === person.id) {
        const input = document.createElement("input");
        input.type = "text";
        input.className = "fuel-rename-input";
        input.value = person.name;
        input.placeholder = "Nové jméno";

        const saveBtn = document.createElement("button");
        saveBtn.type = "button";
        saveBtn.className = "btn btn-primary fuel-edit-save";
        saveBtn.textContent = "Uložit";
        saveBtn.addEventListener("click", () => {
            const v = input.value.trim();
            if (v) { person.name = v; debouncedSave(); }
            renamingPersonId = null;
            renderPeople();
        });

        const cancelBtn = document.createElement("button");
        cancelBtn.type = "button";
        cancelBtn.className = "fuel-action-btn";
        cancelBtn.textContent = "Zrušit";
        cancelBtn.addEventListener("click", () => { renamingPersonId = null; renderPeople(); });

        wrap.appendChild(input);
        wrap.appendChild(saveBtn);
        wrap.appendChild(cancelBtn);
        setTimeout(() => input.focus(), 10);
        return wrap;
    }

    if (confirmDeleteId === person.id) {
        const msg = document.createElement("span");
        msg.className = "fuel-confirm-msg";
        msg.textContent = "Smazat „" + person.name + ""?";

        const yesBtn = document.createElement("button");
        yesBtn.type = "button";
        yesBtn.className = "fuel-action-btn fuel-action-danger";
        yesBtn.textContent = "Ano, smazat";
        yesBtn.addEventListener("click", () => {
            data.people = data.people.filter((p) => p.id !== person.id);
            expandedPersonId = null;
            confirmDeleteId = null;
            debouncedSave();
            renderPeople();
        });

        const noBtn = document.createElement("button");
        noBtn.type = "button";
        noBtn.className = "fuel-action-btn";
        noBtn.textContent = "Zrušit";
        noBtn.addEventListener("click", () => { confirmDeleteId = null; renderPeople(); });

        wrap.appendChild(msg);
        wrap.appendChild(yesBtn);
        wrap.appendChild(noBtn);
        return wrap;
    }

    const renameBtn = document.createElement("button");
    renameBtn.type = "button";
    renameBtn.className = "fuel-action-btn";
    renameBtn.textContent = "Přejmenovat";
    renameBtn.addEventListener("click", () => { renamingPersonId = person.id; renderPeople(); });

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "fuel-action-btn fuel-action-danger";
    deleteBtn.textContent = "Smazat osobu";
    deleteBtn.addEventListener("click", () => { confirmDeleteId = person.id; renderPeople(); });

    wrap.appendChild(renameBtn);
    wrap.appendChild(deleteBtn);
    return wrap;
}

// ----- Utils -----
function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function todayStr() {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
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
kmEl.addEventListener("change", onCalcInput);
passEl.addEventListener("change", onCalcInput);
consEl.addEventListener("change", onCalcInput);
priceEl.addEventListener("change", onCalcInput);

assignBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleAssignMenu();
});

document.addEventListener("click", () => {
    if (menuOpen) closeAssignMenu();
});

newPersonBtn.addEventListener("click", addNewPerson);
newPersonInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") addNewPerson();
});

// ----- Init -----
const saved = loadLocal();
if (saved) {
    data.consumption = saved.consumption || 0;
    data.pricePerLiter = saved.pricePerLiter || 0;
    data.people = Array.isArray(saved.people) ? saved.people : [];
}
applyDataToInputs();
renderPeople();

initNavigation("home", (user) => {
    currentUser = user;
    loadData();
});
