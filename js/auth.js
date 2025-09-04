import { auth, db, googleProvider } from "./firebase-init.js";
import { signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { doc, getDoc, setDoc, runTransaction } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// 닉네임 형식: 한글/영문/숫자/밑줄 2~16자
const NICK_RE = /^[가-힣A-Za-z0-9_]{2,16}$/;

export async function signInWithGoogleAndClaimNick() {
  const cred = await signInWithPopup(auth, googleProvider);
  const uid = cred.user.uid;

  // 이미 users/{uid}가 있으면(닉네임 설정된 상태면) 바로 종료
  const userRef = doc(db, "users", uid);
  const snap = await getDoc(userRef);
  if (snap.exists()) return cred.user;

  // 최초 로그인: 닉네임 1회 입력
  let nick = prompt("닉네임을 입력하세요 (2~16자, 한글/영문/숫자, 이후 변경 불가):");
  nick = (nick || "").trim();
  if (!NICK_RE.test(nick)) throw new Error("닉네임 형식이 올바르지 않습니다.");

  // nicknames/{nick} 점유 + users/{uid} 생성 (트랜잭션)
  const nickRef = doc(db, "nicknames", nick);
  await runTransaction(db, async (tx) => {
    const n = await tx.get(nickRef);
    if (n.exists()) throw new Error("이미 사용 중인 닉네임입니다.");
    tx.set(nickRef, { uid });
    tx.set(userRef, { uid, nickname: nick, createdAt: new Date().toISOString() });
  });

  return cred.user;
}

export function onAuth(cb) { return onAuthStateChanged(auth, cb); }
export async function doSignOut() { await signOut(auth); }
