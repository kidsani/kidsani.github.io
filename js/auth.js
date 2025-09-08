// /js/auth.js  (KidsAni v0.1.2 - stable)
// - Firebase 모듈식 SDK만 사용
// - onAuthStateChanged는 'auth'를 내부에서 넣는 래퍼로 export (콜백만 받으면 됨)

import { auth, db } from "./firebase-init.js?v=0.1.0";
export { auth, db };  // 필요시 그대로 사용

// Firebase Auth 원함수들
import {
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged as fbOnAuthStateChanged,
  signOut as fbSignOut,
  updateProfile as fbUpdateProfile,
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

// Firestore 원함수들 (필요 페이지에서 그대로 쓰기 용도)
export {
  doc,
  runTransaction,
  setDoc,
  getDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

// ───────────────────────────────────────────────────────────────
// 래퍼: 콜백만 넘기면 내부에서 auth 붙여 호출
export function onAuthStateChanged(cb) {
  return fbOnAuthStateChanged(auth, cb);
}

// 구글 로그인
export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  const cred = await signInWithPopup(auth, provider);
  return cred.user; // { uid, displayName, ... }
}

// 로그아웃
export async function logout() {
  await fbSignOut(auth);
}

// 닉네임 정규화: 한글/영문/숫자/[-_.], 길이 2~20
export function sanitizeNickname(raw) {
  const s = String(raw ?? "").trim();
  if (!/^[\w가-힣\-_.]{2,20}$/.test(s)) return "";
  return s;
}

// 최초 로그인/가입 직후: /users/{uid} 프로필 보강 (있으면 merge)
export async function ensureUserDoc(uid, displayName) {
  const { doc, setDoc, serverTimestamp } =
    await import("https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js");
  try {
    await setDoc(
      doc(db, "users", uid),
      {
        displayName: displayName || "회원",
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (e) {
    console.warn("[auth.ensureUserDoc] failed:", e);
  }
}

// (선택) 닉네임-UID 단방향 매핑(중복 방지)
export async function claimNicknameUniq(uid, nick) {
  const lower = String(nick || "").toLowerCase();
  if (!lower) throw new Error("닉네임이 비었습니다.");

  const { doc, runTransaction, serverTimestamp } =
    await import("https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js");

  const mapRef = doc(db, "nickname_to_uid", lower);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(mapRef);
    if (snap.exists() && snap.data()?.uid !== uid) {
      throw new Error("이미 사용 중인 닉네임입니다.");
    }
    tx.set(mapRef, { uid, updatedAt: serverTimestamp() });
  });
}

// (선택) 닉네임 저장: Firestore + Auth 프로필 + (옵션) 중복 점유
export async function setNicknameProfile(uid, nick, { claimUniq = true } = {}) {
  const clean = sanitizeNickname(nick);
  if (!clean) throw new Error("닉네임 형식: 한글/영문/숫자/[-_.], 2~20자");

  const [{ doc, setDoc, serverTimestamp }] = await Promise.all([
    import("https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js"),
  ]);

  if (claimUniq) {
    await claimNicknameUniq(uid, clean);
  }

  await setDoc(
    doc(db, "users", uid),
    { displayName: clean, updatedAt: serverTimestamp(), createdAt: serverTimestamp() },
    { merge: true }
  );

  if (auth.currentUser && auth.currentUser.uid === uid) {
    await fbUpdateProfile(auth.currentUser, { displayName: clean });
  }

  return clean;
}
