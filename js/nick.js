// ---------- js/nick.js (v0.1.0) ----------
import { auth, db } from './firebase-init.js';
import { onAuthStateChanged } from './auth.js';
import {
  doc, runTransaction, serverTimestamp, getDoc
} from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';

// 닉 규칙: 한글/영문/숫자/밑줄, 길이 2~16
const NICK_RE = /^[가-힣A-Za-z0-9_]{2,16}$/;

const $nick = document.getElementById('nick');
const $btnSave = document.getElementById('btnSave');
const $btnHome = document.getElementById('btnHome');
const $msg = document.getElementById('msg');
const $currentBox = document.getElementById('currentBox');

function show(text, ok=false){
  $msg.textContent = text;
  $msg.className = 'msg show ' + (ok ? 'ok':'err');
}

function toKey(raw){ return String(raw||'').trim().toLowerCase(); }

let currentUser = null;
let currentNick = '';

onAuthStateChanged(async (user)=>{
  if(!user){
    // 로그인 필요 → 로그인 페이지로
    location.replace('signin.html');
    return;
  }
  currentUser = user;

  // 현재 닉 조회
  try{
    const snap = await getDoc(doc(db,'users', user.uid));
    currentNick = (snap.exists() && snap.data()?.nick) ? String(snap.data().nick) : '';
    if(currentNick){
      $currentBox.style.display = 'block';
      $currentBox.textContent = `현재 닉네임: ${currentNick}`;
    }
  }catch(e){
    console.warn('load user doc failed', e);
  }

  $nick.focus();
});

$btnHome?.addEventListener('click', ()=> location.href='index.html');

$btnSave?.addEventListener('click', async ()=>{
  if(!currentUser){ return show('로그인이 필요합니다.'); }

  const raw = String($nick.value||'').trim();
  if(!NICK_RE.test(raw)){
    return show('닉네임 형식이 올바르지 않아요. (한글/영문/숫자/밑줄, 2~16자)');
  }
  const newKey = toKey(raw);
  const oldKey = toKey(currentNick);

  try{
    await runTransaction(db, async (tx)=>{
      const userRef = doc(db,'users', currentUser.uid);
      const newNickRef = doc(db,'nicks', newKey);

      // 새 닉이 점유돼 있는지 확인
      const newSnap = await tx.get(newNickRef);
      if(newSnap.exists()){
        const owner = newSnap.data()?.uid;
        if(owner !== currentUser.uid){
          throw new Error('이미 사용 중인 닉네임이에요.');
        }
        // owner가 자기 자신이면 그대로 진행(멱등성)
      }

      // 유저 문서 갱신
      tx.set(userRef, {
        uid: currentUser.uid,
        nick: raw,
        updatedAt: serverTimestamp(),
      }, { merge:true });

      // 새 닉 점유
      tx.set(newNickRef, {
        uid: currentUser.uid,
        nick: raw,
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      }, { merge:true });

      // 기존 닉이 있고, 키가 달라졌다면 기존 점유 해제
      if(oldKey && oldKey !== newKey){
        const oldNickRef = doc(db,'nicks', oldKey);
        const oldSnap = await tx.get(oldNickRef);
        if(oldSnap.exists() && oldSnap.data()?.uid === currentUser.uid){
          // 본인 소유인 경우에만 해제
          tx.delete(oldNickRef);
        }
      }
    });

    show('닉네임이 저장되었어요! 처음 화면으로 이동합니다…', true);
    setTimeout(()=> location.replace('index.html'), 600);
  }catch(e){
    show(e?.message || '닉네임 저장 중 오류가 발생했어요.');
    console.error(e);
  }
});
