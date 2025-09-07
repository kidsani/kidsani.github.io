// ---------- js/signup.js (v0.1.0) ----------
import { db } from './firebase-init.js';
import { signInWithGoogle, onAuthStateChanged } from './auth.js';
import {
  doc,
  getDoc,
} from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';

const $ = (id) => document.getElementById(id);
const btnGoogle = $('btnGoogle');
const msg = $('msg');

function show(text, ok = false) {
  if (!msg) return;
  msg.textContent = text;
  msg.className = 'msg show ' + (ok ? 'ok' : 'err');
}

// 로그인 상태 감지 → 닉네임 보유 여부에 따라 라우팅
onAuthStateChanged(async (user) => {
  if (!user) return;
  try {
    const snap = await getDoc(doc(db, 'users', user.uid));
    const hasNick = snap.exists() && !!snap.data()?.nick;
    // 닉 있으면 홈으로, 없으면 닉 설정 페이지로
    location.replace(hasNick ? 'index.html' : 'nick.html');
  } catch (e) {
    // 문제 있어도 닉 설정 페이지로 보냄
    location.replace('nick.html');
  }
});

// [Google로 시작] 버튼
btnGoogle?.addEventListener('click', async () => {
  try {
    await signInWithGoogle();
    show('로그인 성공! 잠시만요…', true);
    // 라우팅은 onAuthStateChanged가 처리
  } catch (e) {
    console.error(e);
    show('구글 인증에 실패했어요. 잠시 후 다시 시도해 주세요.');
  }
});
