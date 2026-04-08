// Logika domovské stránky – inicializuje hamburger menu a auth stav v nastavení.
import { auth, onAuthStateChanged } from "./firebase-init.js";
import { initHamburger, renderMenuAuth } from "./navigation.js";

let currentUser = null;
let authReady = false;

initHamburger();
renderMenuAuth(currentUser, authReady);

onAuthStateChanged(auth, (user) => {
    authReady = true;
    currentUser = user;
    renderMenuAuth(currentUser, authReady);
});
