// /js/nick.js (KidsAni v0.1.1 - fixed)
import { auth, db } from "./firebase-init.js?v=0.1.0";
import {
  doc, getDoc, setDoc, serverTimestamp, runTransaction
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import {
  onAuthStateChanged, updateProfile
} from "./auth.js?v=0.1.0";

// 닉네임 형식: 한글/영문/숫자/밑줄 2~16자
const NICK_RE = /^[가-힣A-Za-z0-9_]{2,16}$/;

const $ = (s)=>document.querySelector(s);
const input   = $("#nickInput");
const saveBtn = $("#nickSave");
const msg     = $("#nickMsg");

// 로그인 확인 & 기존 닉 불러오기
onAuthStateChanged(auth, async (user)=>{
  if(!user){
    msg.textContent = "로그인이 필요합니다.";
    setTimeout(()=> location.href="signin.html", 600);
    return;
  }
  try{
    const snap = await getDoc(doc(db, "users", user.uid));
    const cur = snap.exists() ? String(snap.data()?.displayName || "") : "";
    if (cur) {
      input.value = cur;
      msg.textContent = "이미 닉네임이 설정되어 있습니다. 변경 후 저장을 누르세요.";
    } else {
      msg.textContent = "닉네임을 입력해 주세요.";
    }
  }catch(e){
    console.error(e);
    msg.textContent = "사용자 정보를 불러오지 못했습니다.";
  }
});

// (선택) 닉네임 중복 체크용 컬렉션: nickname_to_uid/{lowerNick} -> { uid }
// 중복검사를 사용하고 싶지 않다면, 이 블록을 생략하고 바로 setDoc만 하세요.
async function claimNicknameUniq(uid, nick){
  const lower = nick.toLowerCase();
  const mapRef = doc(db, "nickname_to_uid", lower);

  await runTransaction(db, async (tx)=>{
    const mapSnap = await tx.get(mapRef);
    if (mapSnap.exists() && mapSnap.data()?.uid !== uid) {
      throw new Error("이미 사용 중인 닉네임입니다.");
    }
    tx.set(mapRef, { uid, updatedAt: serverTimestamp() }); // 점유
  });
}

async function saveNickname(){
  const user = auth.currentUser;
  if(!user){ msg.textContent="로그인이 필요합니다."; return; }

  const raw = String(input.value || "").trim();
  if(!NICK_RE.test(raw)){
    msg.textContent = "닉네임 형식: 한글/영문/숫자/밑줄 2~16자";
    input.focus();
    return;
  }

  saveBtn.disabled = true; msg.textContent = "저장 중…";
  try{
    // (선택) 중복 점유
    await claimNicknameUniq(user.uid, raw);

    // Firestore 저장
    const userRef = doc(db, "users", user.uid);
    await setDoc(userRef, {
      displayName: raw,
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(), // 존재하면 Firestore가 merge로 최신값 유지
    }, { merge: true });

    // Auth 프로필에도 반영
    await updateProfile(user, { displayName: raw });

    msg.textContent = "닉네임이 저장되었습니다.";
    setTimeout(()=> location.href="upload.html", 600);
  }catch(e){
    console.error(e);
    msg.textContent = e?.message || "닉네임 저장 중 오류가 발생했습니다.";
  }finally{
    saveBtn.disabled = false;
  }
}

saveBtn?.addEventListener("click", (e)=>{ e.preventDefault(); saveNickname(); });
input?.addEventListener("keydown", (e)=>{ if(e.key === "Enter"){ e.preventDefault(); saveNickname(); }});
