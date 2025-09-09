// js/kidsani-list.js (KidsAni v1.0.0)
// - 새 로직: 간단하고 견고한 목록 로더
// - createdAt 기준 정렬(오름/내림 토글), 검색(제목/URL 부분일치), 무한스크롤
// - 카드 탭 → watch.html 내부 플레이어, playQueue/playIndex 전달
// - 중앙 10% 데드존 스와이프: 오른쪽으로 스와이프 시 index.html 이동

import { auth, db } from './firebase-init.js?v=0.1.0';
import { onAuthStateChanged, signOut as fbSignOut } from './auth.js?v=0.1.1';
import { CATEGORY_GROUPS } from './categories.js?v=0.2.1';
import {
  collection, query, orderBy, limit, startAfter, getDocs
} from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';

/* ---------- 상단바: 최소 동기 ---------- */
const $ = (s)=>document.querySelector(s);
const signupLink = $('#signupLink');
const signinLink = $('#signinLink');
const welcome    = $('#welcome');
const menuBtn    = $('#menuBtn');
const dropdown   = $('#dropdownMenu');
const btnSignOut = $('#btnSignOut');
const btnGoUpload= $('#btnGoUpload');
const btnAbout   = $('#btnAbout');
const btnList    = $('#btnList');

function openDropdown(){ if(!dropdown)return; dropdown.classList.remove('hidden'); requestAnimationFrame(()=> dropdown.classList.add('show')); }
function closeDropdown(){ if(!dropdown)return; dropdown.classList.remove('show'); setTimeout(()=> dropdown.classList.add('hidden'), 180); }

onAuthStateChanged((user)=>{
  const loggedIn = !!user;
  signupLink?.classList.toggle('hidden', loggedIn);
  signinLink?.classList.toggle('hidden', loggedIn);
  if (welcome) welcome.textContent = loggedIn ? `Welcome! ${user.displayName || '회원'}` : '';
  closeDropdown();
});
menuBtn?.addEventListener('click', (e)=>{ e.stopPropagation(); dropdown?.classList.contains('hidden') ? openDropdown() : closeDropdown(); });
document.addEventListener('pointerdown', (e)=>{ if(dropdown?.classList.contains('hidden')) return; if(!e.target.closest('#dropdownMenu,#menuBtn')) closeDropdown(); }, true);
document.addEventListener('keydown', (e)=>{ if(e.key==='Escape') closeDropdown(); });
dropdown?.addEventListener('click', (e)=> e.stopPropagation());
btnSignOut?.addEventListener('click', async ()=>{ if(!auth.currentUser){ location.href='signin.html'; return; } try{ await fbSignOut(auth); }catch{} closeDropdown(); });
btnGoUpload?.addEventListener('click', ()=>{ location.href='upload.html'; closeDropdown(); });
btnAbout   ?.addEventListener('click', ()=>{ location.href='about.html'; closeDropdown(); });
btnList    ?.addEventListener('click', ()=>{ location.href='list.html'; closeDropdown(); });

/* ---------- DOM ---------- */
const $cards     = $('#cards');
const $msg       = $('#msg');
const $q         = $('#q');
const $btnSearch = $('#btnSearch');
const $btnClear  = $('#btnClear');
const $btnMore   = $('#btnMore');
const $btnSort   = $('#btnSort'); // 내림/오름 토글

/* ---------- 상태 ---------- */
const PAGE_SIZE = 60;
let orderDir = (localStorage.getItem('kidsani_list_order') || 'desc'); // 'desc'|'asc'
let isLoading = false;
let hasMore   = true;
let lastDoc   = null;
let allDocs   = []; // {id, data}

/* ---------- 보조 ---------- */
function esc(s=''){ return String(s).replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[m])); }
function extractYTId(url=''){ const m=String(url).match(/(?:youtu\.be\/|v=|shorts\/|embed\/)([^?&/]+)/); return m?m[1]:''; }
function toThumb(url){ const id=extractYTId(url); return id?`https://i.ytimg.com/vi/${id}/hqdefault.jpg`:''; }

const LABEL_MAP = (() => {
  const m = {};
  try {
    CATEGORY_GROUPS.forEach(g => g?.children?.forEach(c => { if (c?.value) m[c.value] = c.label || c.value; }));
  } catch {}
  return m;
})();
function labelOf(key){ return LABEL_MAP[key] || key; }

function setStatus(t){ if($msg) $msg.textContent = t || ''; }
function toggleMore(show){ if($btnMore) $btnMore.style.display = show ? '' : 'none'; }

/* ---------- 정렬 토글 초기화 ---------- */
function updateSortButton(){
  if(!$btnSort) return;
  // createdAt 내림차순이 기본 → 버튼 라벨은 현재 상태를 표시
  $btnSort.textContent = (orderDir==='desc') ? '내림차순' : '오름차순';
  $btnSort.setAttribute('aria-label', `정렬: ${$btnSort.textContent}`);
}
updateSortButton();

$btnSort?.addEventListener('click', async ()=>{
  orderDir = (orderDir === 'desc') ? 'asc' : 'desc';
  localStorage.setItem('kidsani_list_order', orderDir);
  // 상태 리셋 후 재조회
  allDocs = [];
  lastDoc = null;
  hasMore = true;
  $cards.innerHTML = '';
  setStatus('정렬 변경: 다시 불러오는 중…');
  updateSortButton();
  await loadPage();
});

/* ---------- Firestore 로드 ---------- */
async function loadPage(){
  if(isLoading || !hasMore) return false;
  isLoading = true;
  setStatus(allDocs.length ? `총 ${allDocs.length}개 불러옴 · 더 불러오는 중…` : '불러오는 중…');

  try{
    const parts = [ orderBy('createdAt', orderDir) ];
    if (lastDoc) parts.push(startAfter(lastDoc));
    parts.push(limit(PAGE_SIZE));
    const snap = await getDocs(query(collection(db,'videos'), ...parts));

    if(snap.empty){
      hasMore = false;
      toggleMore(false);
      setStatus(allDocs.length ? `총 ${allDocs.length}개` : '등록된 영상이 없습니다.');
      isLoading=false;
      return false;
    }

    const batch = snap.docs.map(d => ({ id:d.id, data:d.data() }));
    allDocs = allDocs.concat(batch);
    lastDoc = snap.docs[snap.docs.length-1] || lastDoc;
    if (snap.size < PAGE_SIZE) hasMore = false;

    render();
    toggleMore(hasMore);
    setStatus(`총 ${allDocs.length}개`);
    isLoading=false;
    return true;
  }catch(e){
    console.error('[kidsani-list] load failed:', e);
    setStatus('목록을 불러오지 못했습니다.');
    toggleMore(false);
    isLoading=false;
    return false;
  }
}

/* ---------- 검색(클라 필터) ---------- */
function filteredDocs(){
  const q = ($q?.value || '').trim().toLowerCase();
  if(!q) return allDocs;
  return allDocs.filter(x=>{
    const t = String(x.data?.title || '').toLowerCase();
    const u = String(x.data?.url || '').toLowerCase();
    return t.includes(q) || u.includes(q);
  });
}

/* ---------- 렌더 ---------- */
function render(){
  const list = filteredDocs();
  $cards.innerHTML = '';
  if (!list.length){
    $cards.innerHTML = `<div style="padding:14px;border:1px dashed var(--border);border-radius:12px;color:#cfcfcf;">결과가 없습니다.</div>`;
    return;
  }

  const frag = document.createDocumentFragment();
  for(const x of list){
    const d       = x.data || {};
    const title   = d.title || '(제목 없음)';
    const url     = d.url || '';
    const catsArr = Array.isArray(d.cats) ? d.cats : (Array.isArray(d.categories) ? d.categories : []);
    const thumb   = d.thumb || toThumb(url);
    const nick    = d.uNickname || d.ownerNick || '회원';

    const chipsHTML = (catsArr||[]).map(v => `<span class="chip" title="${esc(labelOf(v))}">${esc(labelOf(v))}</span>`).join('');

    const el = document.createElement('article');
    el.className = 'card';
    el.setAttribute('data-id', x.id);
    el.innerHTML = `
      <div class="card-grid">
        <div class="card-left">
          <div class="title" title="${esc(title)}">${esc(title)}</div>
          <div class="chips">${chipsHTML}</div>
          <div class="meta">등록: ${esc(nick)}</div>
        </div>
        <div class="card-right">
          <img class="thumb" src="${esc(thumb)}" alt="썸네일" loading="lazy"/>
        </div>
      </div>
    `;
    el.addEventListener('click', ()=> openInWatch(list, x.id));
    frag.appendChild(el);
  }
  $cards.appendChild(frag);
}

/* ---------- watch로 이동 (큐 + 인덱스 전달) ---------- */
function openInWatch(list, docId){
  // 재생 큐(현재 렌더 결과 순서)를 간단히 전달
  const queue = list.map(x => ({
    id: x.id,
    url: x.data?.url || '',
    title: x.data?.title || ''
  }));
  const idx = Math.max(0, queue.findIndex(it => it.id === docId));

  sessionStorage.setItem('playQueue', JSON.stringify(queue));
  sessionStorage.setItem('playIndex', String(idx));

  // 내부 플레이어로 이동 (유튜브 이동 금지)
  location.href = `watch.html?doc=${encodeURIComponent(docId)}&idx=${idx}`;
}

/* ---------- 이벤트 ---------- */
$q?.addEventListener('keydown', async (e)=>{ if(e.key==='Enter'){ render(); } });
$btnSearch?.addEventListener('click', ()=> render());
$btnClear ?.addEventListener('click', ()=>{ if($q){ $q.value=''; render(); } });
$btnMore  ?.addEventListener('click', async ()=>{
  $btnMore.disabled = true; $btnMore.textContent = '불러오는 중…';
  try{ await loadPage(); } finally { $btnMore.disabled=false; $btnMore.textContent='더 보기'; }
});

/* ---------- 무한 스크롤 ---------- */
const SCROLL_LOAD_OFFSET = 320;
window.addEventListener('scroll', async ()=>{
  if (isLoading || !hasMore) return;
  const nearBottom = (window.innerHeight + window.scrollY) >= (document.body.offsetHeight - SCROLL_LOAD_OFFSET);
  if (!nearBottom) return;
  await loadPage();
}, { passive:true });

/* ---------- 초기 로드 ---------- */
(async function init(){
  try{
    await loadPage();
  }catch(e){
    console.error(e);
    setStatus('목록을 불러오지 못했습니다.');
  }
})();

/* ===================== */
/* 스와이프: 중앙 10% 데드존 + 우측 스와이프→index */
/* ===================== */
(function initSwipeToIndex(){
  let sx=0, sy=0, moved=false, blocked=false, t0=0;
  const THRESH_X=70, MAX_OFF_Y=80, MAX_TIME=700;

  function onStart(e){
    const t = e.touches?.[0] || e;
    if(!t) return;
    sx=t.clientX; sy=t.clientY; moved=false; blocked=false; t0=Date.now();

    // 중앙 10% 가로 데드존
    const vw = Math.max(document.documentElement.clientWidth, window.innerWidth||0);
    const L = vw * 0.45, R = vw * 0.55;
    if (sx >= L && sx <= R) blocked = true;
  }
  function onMove(){ moved=true; }
  function onEnd(e){
    if(!moved || blocked) return;
    const t = e.changedTouches?.[0] || e;
    const dx = t.clientX - sx, dy = t.clientY - sy, dt=Date.now()-t0;
    if (Math.abs(dy) > MAX_OFF_Y || dt > MAX_TIME) return;
    if (dx >= THRESH_X){ // 오른쪽으로 스와이프
      document.documentElement.classList.add('slide-out-right');
      setTimeout(()=> location.href='index.html', 200);
    }
  }
  document.addEventListener('touchstart', onStart, {passive:true});
  document.addEventListener('touchmove',  onMove,  {passive:true});
  document.addEventListener('touchend',   onEnd,   {passive:true});
  document.addEventListener('pointerdown',onStart, {passive:true});
  document.addEventListener('pointerup',  onEnd,   {passive:true});
})();

/* ===================== */
/* 슬라이드 아웃 효과 (가벼운 전환) */
/* ===================== */
(function injectSlideCSS(){
  if (document.getElementById('kidsani-slide-css')) return;
  const style = document.createElement('style');
  style.id = 'kidsani-slide-css';
  style.textContent = `
@keyframes pageSlideRight{ from { transform: translateX(0); opacity:1; } to { transform: translateX(22%); opacity:.92; } }
:root.slide-out-right body { animation: pageSlideRight 0.26s ease forwards; }
@media (prefers-reduced-motion: reduce){
  :root.slide-out-right body { animation:none; }
}`;
  document.head.appendChild(style);
})();
