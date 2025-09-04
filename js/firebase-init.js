// /js/firebase-init.js  (v1.5.1)
import { initializeApp }   from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js';
import { getAuth }         from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js';
import { getFirestore }    from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';

// ✅ kidsani 프로젝트용 설정
export const firebaseConfig = {
  apiKey: "AIzaSyAhBvRE0D2Vkg4m800kkTaFi360Y4_4nLc",  // 주신 웹 API 키
  authDomain: "kidsani.firebaseapp.com",
  projectId: "kidsani",
  storageBucket: "kidsani.appspot.com",
  // messagingSenderId / appId 는 없어도 Auth/Firestore 동작합니다. 
  // (콘솔 스니펫의 값이 있으면 추가로 넣어도 됩니다)
};

// 앱/서비스 인스턴스
export const app  = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db   = getFirestore(app);

// 디버그(필요 시)
// console.log('CONFIG', firebaseConfig);
