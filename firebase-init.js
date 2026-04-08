// Sdílená inicializace Firebase pro všechny stránky aplikace.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
    getAuth,
    GoogleAuthProvider,
    signInWithPopup,
    signOut,
    onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyDwOHPoR8UFAoobKsAVLGCwT0Os5qUdAX0",
    authDomain: "wibeapp-eb1d6.firebaseapp.com",
    projectId: "wibeapp-eb1d6",
    storageBucket: "wibeapp-eb1d6.firebasestorage.app",
    messagingSenderId: "1069372760530",
    appId: "1:1069372760530:web:156283056c4222992ca80b",
};

export const fbApp = initializeApp(firebaseConfig);
export const auth = getAuth(fbApp);
export const db = getFirestore(fbApp);

const googleProvider = new GoogleAuthProvider();

export async function signInWithGoogle() {
    try {
        await signInWithPopup(auth, googleProvider);
    } catch (err) {
        console.error(err);
        if (
            err.code !== "auth/popup-closed-by-user" &&
            err.code !== "auth/cancelled-popup-request"
        ) {
            alert("Přihlášení se nezdařilo: " + err.message);
        }
    }
}

export async function signOutUser() {
    try {
        await signOut(auth);
    } catch (err) {
        console.error(err);
        alert("Odhlášení se nezdařilo: " + err.message);
    }
}

export { onAuthStateChanged };
