// js/firebase-init.js  (safe web version)
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import {
  getAuth,
  setPersistence,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  inMemoryPersistence,
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAhBvRE0D2Vkg4m800kkTaFi360Y4_4nLc",
  authDomain: "kidsani.firebaseapp.com",
  projectId: "kidsani",
  storageBucket: "kidsani.appspot.com",
  messagingSenderId: "917416041435",
  appId: "1:917416041435:web:018c4e60a16e81f6b565fe",
  measurementId: "G-E336TJY0ZE"
};

const app = initializeApp(firebaseConfig);

// ✅ 웹 기본 초기화
export const auth = getAuth(app);
export const db = getFirestore(app);

// 선택: 퍼시스턴스 우선순위 설정(실패 시 폴백)
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
