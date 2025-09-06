// kidsani / js/auth.js
// v0.1.0 — 구글 로그인 전용으로 경량화
// - 읽기 기능은 비로그인도 가능(페이지 로직에서 자유롭게 read)
// - 쓰기(업로드/삭제 등)에서만 인증 요구
// - copytube 원본과의 호환을 위해 doc/runTransaction/serverTimestamp 재수출 유지

import { auth, db } from './firebase-init.js?v=0.1.0';
export { auth, db };

import {
  onAuthStateChanged as _onAuthStateChanged,
  signInWithPopup as _signInWithPopup,
  signOut as _signOut,
  GoogleAuthProvider,
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

import {
  doc, runTransaction, setDoc, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

// re-export 필요한 firestore 유틸(페이지에서 쓰고 있음)
export { doc, runTransaction, serverTimestamp };

/* helpers */
export function sanitizeNickname(raw){
  const s = String(raw||'').trim();
  if (!s) return '';
  // 허용: 한글/영문/숫자/[-_.], 길이 2~20
  if (!/^[\w가-힣\-_.]{2,20}$/.test(s)) return '';
  return s;
}

// ✅ 구글 로그인 전용
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

export async function signInWithGoogle(){
  const cred = await _signInWithPopup(auth, googleProvider);
  return cred.user; // { uid, displayName, photoURL, email, ... }
}

/* auth wrappers */
export const onAuthStateChanged = _onAuthStateChanged;
export const signOut = _signOut;

/* after signup/login: optionally create /users/{uid} profile */
export async function ensureUserDoc(uid, displayName){
  try{
    await setDoc(doc(db,'users', uid), {
      displayName: displayName || '회원',
      updatedAt: serverTimestamp()
    }, { merge:true });
  }catch(e){ /* ignore */ }
}
