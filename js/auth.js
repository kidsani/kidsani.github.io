// /js/auth.js  (KidsAni v0.1.1 - stable)
// - Firebase SDK 함수를 "그대로" 재수출 (래핑 최소화) → onAuthStateChanged 타입/바인딩 문제 방지
// - 구글 로그인 전용 signInWithGoogle()
// - 닉네임 관련 유틸: sanitizeNickname, ensureUserDoc(), setNicknameProfile()(선택), claimNicknameUniq()(선택)
// - auth/db는 firebase-init.js에서 만든 "진짜 인스턴스"를 그대로 재사용

import { auth, db } from "./firebase-init.js?v=0.1.0";
export { auth, db };  // 필요 페이지에서 그대로 사용

// === Firebase SDK: 그대로 재수출 ===
// (이 방식이 가장 안전합니다. 페이지들에서 SDK 함수 그대로 쓰면 됩니다.)
export {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  updateProfile,
  GoogleAuthProvider,
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

export {
  doc,
  runTransaction,
  setDoc,
  getDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

// === 추가 유틸 ===

// 닉네임 정규화: 한글/영문/숫자/[-_.], 길이 2~20
export function sanitizeNickname(raw){
  const s = String(raw ?? "").trim();
  if (!/^[\w가-힣\-_.]{2,20}$/.test(s)) return "";
  return s;
}

// 구글 로그인(팝업)
export async function signInWithGoogle(){
  const { GoogleAuthProvider, signInWithPopup } =
    await import("https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js");

  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });

  const cred = await signInWithPopup(auth, provider);
  return cred.user; // { uid, displayName, ... }
}

// 최초 로그인/가입 직후: /users/{uid} 프로필 보강
export async function ensureUserDoc(uid, displayName){
  const { doc, setDoc, serverTimestamp } =
    await import("https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js");

  try{
    await setDoc(
      doc(db, "users", uid),
      {
        displayName: displayName || "회원",
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp(), // merge 시 기존 있으면 유지
      },
      { merge: true }
    );
  }catch(e){
    // 무시(로그 정도)
    console.warn("[auth.ensureUserDoc] failed:", e);
  }
}

// (선택) 닉네임-UID 단방향 매핑으로 중복 점유 방지하고 싶을 때 사용
// nickname_to_uid/{lowerNick} -> { uid }
export async function claimNicknameUniq(uid, nick){
  const lower = String(nick || "").toLowerCase();
  if (!lower) throw new Error("닉네임이 비었습니다.");

  const { doc, runTransaction, serverTimestamp } =
    await import("https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js");

  const mapRef = doc(db, "nickname_to_uid", lower);

  await runTransaction(db, async (tx)=>{
    const snap = await tx.get(mapRef);
    if (snap.exists() && snap.data()?.uid !== uid) {
      throw new Error("이미 사용 중인 닉네임입니다.");
    }
    tx.set(mapRef, { uid, updatedAt: serverTimestamp() });
  });
}

// (선택) 닉네임 저장 통합: Firestore + Auth 프로필 + (옵션) 중복 점유
export async function setNicknameProfile(uid, nick, { claimUniq = true } = {}){
  const clean = sanitizeNickname(nick);
  if (!clean) throw new Error("닉네임 형식: 한글/영문/숫자/[-_.], 2~20자");

  const [{ doc, setDoc, serverTimestamp }, { updateProfile }] = await Promise.all([
    import("https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js"),
    import("https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js"),
  ]);

  if (claimUniq) {
    await claimNicknameUniq(uid, clean);
  }

  // Firestore
  await setDoc(
    doc(db, "users", uid),
    { displayName: clean, updatedAt: serverTimestamp(), createdAt: serverTimestamp() },
    { merge: true }
  );

  // Auth 프로필
  if (auth.currentUser && auth.currentUser.uid === uid) {
    await updateProfile(auth.currentUser, { displayName: clean });
  }

  return clean;
}
