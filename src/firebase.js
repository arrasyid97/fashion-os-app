import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth"
// Tempel (paste) konfigurasi Anda dari Firebase di sini
const firebaseConfig = {
  apiKey: "AIzaSyACoc4vE2aq3-zuhKmzx0TsV79GoD5202o",
  authDomain: "fashion-os-app.firebaseapp.com",
  projectId: "fashion-os-app",
  storageBucket: "fashion-os-app.firebasestorage.app",
  messagingSenderId: "498193441506",
  appId: "1:498193441506:web:4b6f4914f1fbda8bf9f4bb"
};


// Inisialisasi Firebase
const app = initializeApp(firebaseConfig);

// Ekspor database Firestore agar bisa digunakan di file lain
export const db = getFirestore(app);
export const auth = getAuth(app);