// kidsani / js/firebase-init.js  v0.1.0
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import {
  initializeAuth,
  getAuth,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  inMemoryPersistence,
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

const fallback = {
  apiKey: "AIzaSyAhBvRE0D2Vkg4m800kkTaFi360Y4_4nLc",
  authDomain: "kidsani.firebaseapp.com",
  projectId: "kidsani",
  storageBucket: "kidsani.appspot.com",
  messagingSenderId: "917416041435",
  appId: "1:917416041435:web:018c4e60a16e81f6b565fe",
  measurementId: "G-E336TJY0ZE"
};

const firebaseConfig =
  (globalThis.__FIREBASE_CONFIG && typeof globalThis.__FIREBASE_CONFIG === 'object')
    ? globalThis.__FIREBASE_CONFIG
    : fallback;

const app = initializeApp(firebaseConfig);

let auth;
if (!globalThis.__kidsaniAuthInitialized) {
  try {
    auth = initializeAuth(app, {
      persistence: [
        indexedDBLocalPersistence,
        browserLocalPersistence,
        browserSessionPersistence,
        inMemoryPersistence,
      ],
    });
  } catch (e) {
    auth = getAuth(app);
  }
  globalThis.__kidsaniAuthInitialized = true;
} else {
  auth = getAuth(app);
}

export { auth };
export const db = getFirestore(app);
