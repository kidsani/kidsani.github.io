// kidsani / js/firebase-init.js
// v0.1.0 — iOS Safari 대비: 확실한 폴백 + 중복 초기화 방지 + 운영시 주입 허용

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

// ── 운영 편의: window.__FIREBASE_CONFIG 로 주입 가능 ──
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

/*
 iOS 사파리(특히 프라이빗 모드)에서는 IndexedDB / localStorage가 제한될 수 있습니다.
 initializeAuth에 복수 퍼시스턴스를 주고, 마지막에 inMemory까지 두면
 어떤 환경에서도 Auth 초기화가 실패하지 않도록 보장됩니다.
 또한 번들/모듈 중복 로드 시 initializeAuth 재호출로 에러가 날 수 있으니
 전역 플래그로 1회만 initializeAuth를 수행합니다.
*/
let auth;
if (!globalThis.__kidsaniAuthInitialized) {
  try {
    auth = initializeAuth(app, {
      persistence: [
        indexedDBLocalPersistence,
        browserLocalPersistence,
        browserSessionPersistence,
        inMemoryPersistence, // 최종 폴백
      ],
    });
  } catch (e) {
    // 이미 어딘가에서 getAuth(app)로 초기화된 경우 등
    auth = getAuth(app);
  }
  globalThis.__kidsaniAuthInitialized = true;
} else {
  auth = getAuth(app);
}

export { auth };
export const db = getFirestore(app);
