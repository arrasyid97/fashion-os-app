import { initializeApp } from "firebase/app";

import {
    initializeFirestore,
    persistentLocalCache,
    persistentMultipleTabManager
} from "firebase/firestore";

import { getAuth } from "firebase/auth";

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

// Firestore dengan cache permanen IndexedDB.
// persistentMultipleTabManager membuat beberapa tab browser
// dapat memakai dan menyinkronkan cache Firestore yang sama.
export const db = initializeFirestore(app, {
    localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager()
    })
});

// Firebase Authentication
export const auth = getAuth(app);