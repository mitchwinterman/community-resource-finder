// ----------------------------------------------------------
// firebase.js — shared Firebase initialization
// ----------------------------------------------------------

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// Your Firebase config
const firebaseConfig = {
    apiKey: "AIzaSyAGd-wAWcMG2mrzwPBLgvOrmPWmwY7isok",
    authDomain: "washoe-community-resources.firebaseapp.com",
    projectId: "washoe-community-resources",
    storageBucket: "washoe-community-resources.firebasestorage.app",
    messagingSenderId: "788386726804",
    appId: "1:788386726804:web:d069f55e96a5d196b38581",
    measurementId: "G-8BC3DJ5RWH"
};

// Initialize
export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
