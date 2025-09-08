// js/firebase-init.js  (KidsAni safe init)
import {
  initializeApp,
  getApps,
  getApp,
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import {
  getAuth,
  setPersistence,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  inMemoryPersistence,
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

// 운영 시 window.__FIREBASE_CONFIG를 주입해도 되고, 없으면 fallback 사용
const fallback = {
  apiKey: "AIzaSyAhBvRE0D2Vkg4m800kkTaFi360Y4_4nLc",
  authDomain: "kidsani.firebaseapp.com",
  projectId: "kidsani",
  storageBucket: "kidsani.appspot.com",
  messagingSenderId: "917416041435",
  appId: "1:917416041435:web:018c4e60a16e81f6b565fe",
  measurementId: "G-E336TJY0ZE",
};
const cfg =
  (globalThis.__FIREBASE_CONFIG && typeof globalThis.__FIREBASE_CONFIG === "object")
    ? globalThis.__FIREBASE_CONFIG
    : fallback;

// ⚠️ 여러 번 로드되어도 재초기화되지 않게 보호
const app = getApps().length ? getApp() : initializeApp(cfg);

// ✅ 웹 기본 Auth 초기화(팝업 리졸버 자동 포함)
export const auth = getAuth(app);
export const db = getFirestore(app);

// 선택: 퍼시스턴스(실패 시 단계적 폴백)
try {
  await setPersistence(auth, indexedDBLocalPersistence);
} catch {
  try {
    await setPersistence(auth, browserLocalPersistence);
  } catch {
    try {
      await setPersistence(auth, browserSessionPersistence);
    } catch {
      await setPersistence(auth, inMemoryPersistence);
    }
  }
}
