// js/auth.js  (KidsAni v0.1.3 stable)
import { auth, db } from "./firebase-init.js"; // ← index가 ?v=...로 임포트해도 OK
export { auth, db };

// Auth SDK 원함수
import {
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged as fbOnAuthStateChanged,
  signOut as fbSignOut,
  updateProfile as fbUpdateProfile,
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

// Firestore SDK 원함수(페이지에서 직접 쓰고 싶을 때)
export {
  doc,
  runTransaction,
  setDoc,
  getDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

// ─────────────────────────────────────
// onAuthStateChanged 래퍼: 콜백만 넘기면 됨
export function onAuthStateChanged(cb) {
  return fbOnAuthStateChanged(auth, cb);
}

// 구글 로그인
export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  const cred = await signInWithPopup(auth, provider); // getAuth 기반 → 팝업 리졸버 자동
  return cred.user;
}

// index에서 'signOut' 이름을 기대할 수 있으므로 동일 이름으로 보장
export async function signOut() { await fbSignOut(auth); }
// (원하면 logout 별칭도 사용 가능)
export async function logout() { await fbSignOut(auth); }

// 닉네임 정규화
export function sanitizeNickname(raw) {
  const s = String(raw ?? "").trim();
  return /^[\w가-힣\-_.]{2,20}$/.test(s) ? s : "";
}

// 최초 로그인/가입 직후: /users/{uid} 보강(존재하면 merge)
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
      { merge: true },
    );
  } catch (e) {
    console.warn("[ensureUserDoc] failed:", e);
  }
}

// (옵션) 닉네임-UID 중복 방지 맵
export async function claimNicknameUniq(uid, nick) {
  const lower = String(nick || "").toLowerCase();
  if (!lower) throw new Error("닉네임이 비었습니다.");
  const { doc, runTransaction, serverTimestamp } =
    await import("https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js");
  const ref = doc(db, "nickname_to_uid", lower);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists() && snap.data()?.uid !== uid) {
      throw new Error("이미 사용 중인 닉네임입니다.");
    }
    tx.set(ref, { uid, updatedAt: serverTimestamp() });
  });
}

// (옵션) 닉네임 저장 통합
export async function setNicknameProfile(uid, nick, { claimUniq = true } = {}) {
  const clean = sanitizeNickname(nick);
  if (!clean) throw new Error("닉네임 형식: 한글/영문/숫자/[-_.], 2~20자");
  const { doc, setDoc, serverTimestamp } =
    await import("https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js");
  if (claimUniq) await claimNicknameUniq(uid, clean);
  await setDoc(
    doc(db, "users", uid),
    { displayName: clean, updatedAt: serverTimestamp(), createdAt: serverTimestamp() },
    { merge: true },
  );
  if (auth.currentUser?.uid === uid) {
    await fbUpdateProfile(auth.currentUser, { displayName: clean });
  }
  return clean;
}
