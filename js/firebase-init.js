/* ---------- firebase-init.js (v0.1.0) ---------- */
import { initializeApp }   from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js';
import { getAuth }         from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js';
import { getFirestore }    from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';

// ✅ kidsani 프로젝트용 Firebase 설정
export const firebaseConfig = {
  apiKey: "AIzaSyAhBvRE0D2Vkg4m800kkTaFi360Y4_4nLc",
  authDomain: "kidsani.firebaseapp.com",
  projectId: "kidsani",
  storageBucket: "kidsani.appspot.com",
  // messagingSenderId, appId는 생략 가능 (필요 시 Firebase 콘솔에서 추가 복사 가능)
};

// Firebase 앱/서비스 인스턴스
export const app  = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db   = getFirestore(app);

// 디버깅용 (필요시 주석 해제)
// console.log('CONFIG', firebaseConfig);
/* ---------- end of firebase-init.js (v0.1.0) ---------- */
