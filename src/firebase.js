import { initializeApp } from "firebase/app";

import { initializeFirestore, memoryLocalCache } from "firebase/firestore";

import { getAuth } from "firebase/auth";
import { getFunctions } from "firebase/functions";

const firebaseConfig = {
    apiKey: "AIzaSyACoc4vE2aq3-zuhKmzx0TsV79GoD5202o",
    authDomain: "fashion-os-app.firebaseapp.com",
    projectId: "fashion-os-app",
    storageBucket: "fashion-os-app.firebasestorage.app",
    messagingSenderId: "498193441506",
    appId: "1:498193441506:web:4b6f4914f1fbda8bf9f4bb"
};

// Inisialisasi Firebase satu kali
const app = initializeApp(firebaseConfig);


// PATCH POS FIRESTORE MEMORY CACHE
// Gunakan cache memori agar Vue tidak menulis objek query ke IndexedDB.
// Data utama tetap dibaca dan disimpan langsung ke Firestore server.
export const db = initializeFirestore(app, {
    localCache: memoryLocalCache()
});

// Firebase Authentication
export const auth = getAuth(app);

// Cloud Functions dipakai untuk membaca ringkasan Dashboard hemat read.
export const functions = getFunctions(app);
