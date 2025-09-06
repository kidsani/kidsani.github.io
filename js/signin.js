// ---------- js/signin.js (v0.1.0) ----------
import { db } from './firebase-init.js';
import { signInWithGoogle, onAuthStateChanged } from './auth.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';

const btnGoogle = document.getElementById('btnGoogle');
const msg = document.getElementById('msg');

function show(text, ok=false){
  msg.textContent = text;
  msg.className = 'msg show ' + (ok ? 'ok':'err');
}

// 로그인 상태면 닉 유무 확인 → 분기
onAuthStateChanged(async (user)=>{
  if(!user) return;
  try{
    const snap = await getDoc(doc(db,'users', user.uid));
    const hasNick = snap.exists() && !!snap.data()?.nick;
    location.replace(hasNick ? 'index.html' : 'nick.html');
  }catch(e){
    // 문제가 있어도 닉 설정 페이지로 안내
    location.replace('nick.html');
  }
});

btnGoogle?.addEventListener('click', async ()=>{
  try{
    await signInWithGoogle();
    show('로그인 성공! 잠시만요…', true);
    // onAuthStateChanged가 라우팅 처리
  }catch(e){
    show('구글 로그인에 실패했어요. 잠시 후 다시 시도해 주세요.');
    console.error(e);
  }
});
