// js/watch.js (v0.1.1-kidsani)
import { auth, db } from './firebase-init.js';
import { onAuthStateChanged, signOut as fbSignOut } from './auth.js';
import { getDoc, doc } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';

/* ---------- 상단바: 기존 패턴 유지 ---------- */
const signupLink = document.getElementById('signupLink');
const signinLink = document.getElementById('signinLink');
const welcome    = document.getElementById('welcome');
const menuBtn    = document.getElementById('menuBtn');
const dropdown   = document.getElementById('dropdownMenu');
const btnSignOut = document.getElementById('btnSignOut');
const btnGoUpload= document.getElementById('btnGoUpload');
const btnAbout   = document.getElementById('btnAbout');
const btnList    = document.getElementById('btnList');

function openDropdown(){ dropdown?.classList.remove('hidden'); requestAnimationFrame(()=> dropdown?.classList.add('show')); }
function closeDropdown(){ dropdown?.classList.remove('show'); setTimeout(()=> dropdown?.classList.add('hidden'), 180); }

onAuthStateChanged(auth, user => {
  const loggedIn = !!user;
  signupLink?.classList.toggle('hidden', loggedIn);
  signinLink?.classList.toggle('hidden', loggedIn);
  if (welcome) welcome.textContent = loggedIn ? `Welcome! ${user?.displayName || '회원'}` : '';
  closeDropdown();
});
menuBtn   ?.addEventListener('click', (e)=>{ e.stopPropagation(); dropdown?.classList.contains('hidden') ? openDropdown() : closeDropdown(); });
document.addEventListener('pointerdown', (e)=>{ if(dropdown?.classList.contains('hidden')) return; if(!e.target.closest('#dropdownMenu,#menuBtn')) closeDropdown(); }, true);
document.addEventListener('keydown', (e)=>{ if(e.key==='Escape') closeDropdown(); });
dropdown  ?.addEventListener('click', (e)=> e.stopPropagation());
btnSignOut?.addEventListener('click', async ()=>{ if(!auth.currentUser){ location.href='signin.html'; return; } try{ await fbSignOut(auth); }catch{} closeDropdown(); });
btnGoUpload?.addEventListener('click', ()=>{ location.href='upload.html'; closeDropdown(); });
btnAbout   ?.addEventListener('click', ()=>{ location.href='about.html';  closeDropdown(); });
btnList    ?.addEventListener('click', ()=>{ location.href='list.html';   closeDropdown(); });

/* ---------- DOM ---------- */
const $title = document.getElementById('title');
const $chips = document.getElementById('chips');
const $meta  = document.getElementById('meta');
const $btnPrev = document.getElementById('btnPrev');
const $btnNext = document.getElementById('btnNext');
const $btnMute = document.getElementById('btnMute');

/* ---------- 상태 ---------- */
let queue = [];
let index = 0;
let player = null;
let muted = true;

/* ---------- 유틸 ---------- */
function esc(s=''){ return String(s).replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m])); }
function extractId(url=''){
  const m = String(url).match(/(?:youtu\.be\/|v=|shorts\/|embed\/)([^?&\/]+)/);
  return m ? m[1] : '';
}
function toEmbedUrl(url){
  const id = extractId(url);
  return id ? `https://www.youtube.com/embed/${id}?autoplay=1&mute=${muted?1:0}&playsinline=1&rel=0&modestbranding=1&enablejsapi=1` : '';
}
function readAutoNext(){
  const v = (localStorage.getItem('autonext') || '').toLowerCase();
  return v==='1' || v==='true' || v==='on';
}

/* ---------- 큐 로딩 ---------- */
function loadQueueFromSession(){
  try{
    const rawQ = sessionStorage.getItem('playQueue');
    const rawI = sessionStorage.getItem('playIndex');
    if(!rawQ) return false;
    const arr = JSON.parse(rawQ || '[]');
    const idx = Number(rawI || 0);
    if(!Array.isArray(arr) || !arr.length) return false;
    queue = arr; index = (isFinite(idx) ? Math.max(0, Math.min(arr.length-1, idx)) : 0);
    return true;
  }catch{ return false; }
}

async function loadSingleDocIfNeeded(){
  const params = new URLSearchParams(location.search);
  const docId  = params.get('doc');
  const idxStr = params.get('idx');
  if (queue.length || !docId) return;

  try{
    const snap = await getDoc(doc(db,'videos', decodeURIComponent(docId)));
    if (!snap.exists()) return;
    const d = snap.data();
    const item = {
      id: snap.id,
      url: d?.url || '',
      title: d?.title || '',
      cats: Array.isArray(d?.categories) ? d.categories : []
    };
    queue = [item];
    index = Math.max(0, Math.min(queue.length-1, Number(idxStr || 0) || 0));
  }catch(e){ /* ignore */ }
}

/* ---------- 칩/제목/메타 ---------- */
function renderInfo(){
  const item = queue[index] || {};
  const t = item.title || '(제목 없음)';
  $title.textContent = t;

  $chips.innerHTML = '';
  const cats = Array.isArray(item.cats) ? item.cats : [];
  cats.forEach(c=>{
    const span = document.createElement('span');
    span.className = 'chip';
    span.textContent = c;
    $chips.appendChild(span);
  });

  $meta.textContent = `${index+1} / ${queue.length}`;
}

/* ---------- 플레이어 ---------- */
// iframe API가 글로벌로 onYouTubeIframeAPIReady 호출을 요구하므로 window에 핸들러를 연결
function createPlayer(){
  const item = queue[index] || {};
  const id = extractId(item.url);
  if (!id) return;

  if (player){
    try{ player.destroy(); }catch{}
    player = null;
  }

  // eslint-disable-next-line no-undef
  player = new YT.Player('player', {
    width: '100%',
    height: '100%',
    videoId: id,
    playerVars: {
      autoplay: 1,
      mute: muted ? 1 : 0,
      playsinline: 1,
      rel: 0,
      modestbranding: 1,
      enablejsapi: 1
    },
    events: {
      onReady: (e)=> {
        try {
          muted ? e.target.mute() : e.target.unMute();
          e.target.playVideo();
        } catch {}
      },
      onStateChange: (e)=> {
        // 0 = ended
        if (e.data === 0 && readAutoNext()){
          goNext();
        }
      }
    }
  });
}
window.onYouTubeIframeAPIReady = function(){ createPlayer(); };

/* ---------- 이동 ---------- */
function go(indexTo){
  index = Math.max(0, Math.min(queue.length-1, indexTo));
  renderInfo();
  createPlayer();
  // 현재 위치 기억(뒤로가기 대비)
  sessionStorage.setItem('playIndex', String(index));
}
function goNext(){
  if (index < queue.length-1) go(index+1);
}
function goPrev(){
  if (index > 0) go(index-1);
}

/* ---------- 이벤트 ---------- */
$btnNext?.addEventListener('click', goNext);
$btnPrev?.addEventListener('click', goPrev);
$btnMute?.addEventListener('click', ()=>{
  muted = !muted;
  $btnMute.textContent = muted ? '🔇 음소거' : '🔊 소리 켜짐';
  try{
    if (player){
      if (muted) player.mute(); else player.unMute();
    }
  }catch{}
});

/* ---------- 시작 ---------- */
(async function init(){
  const ok = loadQueueFromSession();
  if (!ok) { await loadSingleDocIfNeeded(); }
  if (!queue.length){
    // 큐가 비면 홈으로
    location.replace('index.html');
    return;
  }
  renderInfo();

  // iframe API를 이미 불러왔으므로, 전역 콜백이 생성자를 호출할 것
  if (window.YT && window.YT.Player) {
    createPlayer();
  }
})();
//
// end of js/watch.js (v0.1.1-kidsani)
