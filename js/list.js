// js/list.js (KidsAni v1.1.0)
// - Index에서 전달된 "정렬 모드(mode)" 반영: registered|latest|title → createdAt|seriesSortAt|title
// - List는 "정렬 방향(dir)"만 토글: asc|desc (기본은 모드별 디폴트 방향)
// - 검색(제목/URL), 무한 스크롤, 카드 2열(제목/칩/등록 + 썸네일 오른쪽), 스와이프(오른쪽, 중앙 10% 데드존)

import { auth, db } from './firebase-init.js?v=0.1.0';
import { onAuthStateChanged, signOut as fbSignOut } from './auth.js?v=0.1.1';
import { CATEGORY_GROUPS } from './categories.js?v=0.2.1';
import {
  collection, query, where, orderBy, limit, startAfter, getDocs
} from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';

/* ---------- 상단바 ---------- */
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
function closeDropdown(){ if(!dropdown)return; dropdown.classList.remove('show'); setTimeout(()=> dropdown.classList.add('hidden'),180); }

onAuthStateChanged((user)=>{
  const loggedIn = !!user;
  signupLink?.classList.toggle('hidden', loggedIn);
  signinLink?.classList.toggle('hidden', loggedIn);
  if(welcome) welcome.textContent = loggedIn ? `Welcome! ${user.displayName||'회원'}` : '';
  closeDropdown();
});
menuBtn?.addEventListener('click',(e)=>{ e.stopPropagation(); dropdown?.classList.contains('hidden') ? openDropdown() : closeDropdown(); });
document.addEventListener('pointerdown',(e)=>{ if(dropdown?.classList.contains('hidden')) return; if(!e.target.closest('#dropdownMenu,#menuBtn')) closeDropdown(); }, true);
document.addEventListener('keydown',(e)=>{ if(e.key==='Escape') closeDropdown(); });
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
const $btnSort   = $('#btnSort');

/* ---------- 정렬 모드/방향 ---------- */
/*  mode: registered|latest|title ↔ field: createdAt|seriesSortAt|title
    dir : asc|desc  (list에서 토글)
    초기값: URL ?mode=..(기본 registered), URL ?dir=..(없으면 모드 기본 방향)
    - registered → 기본 dir = desc (최신순)
    - latest     → 기본 dir = asc  (유튜브 업로드 과거→최신)
    - title      → 기본 dir = asc  (가나다)
*/
function getParams(){
  const u = new URL(location.href);
  return {
    mode: (u.searchParams.get('mode') || 'registered'),
    dir : (u.searchParams.get('dir')  || '')
  };
}
function fieldByMode(mode){
  switch((mode||'registered')){
    case 'latest': return 'seriesSortAt';
    case 'title' : return 'title';
    case 'registered':
    default:       return 'createdAt';
  }
}
function defaultDirByMode(mode){
  switch((mode||'registered')){
    case 'latest': return 'asc';
    case 'title' : return 'asc';
    case 'registered':
    default:       return 'desc';
  }
}
const urlInit = getParams();
let mode = urlInit.mode;
let orderField = fieldByMode(mode);
let orderDir   = urlInit.dir || defaultDirByMode(mode);

/* ---------- 상태 ---------- */
const PAGE_SIZE = 60;
let isLoading = false;
let hasMore   = true;
let lastDoc   = null;
let allDocs   = []; // {id,data}

/* ---------- 라벨맵 ---------- */
const LABEL_MAP = (() => {
  const m = {};
  try { CATEGORY_GROUPS.forEach(g => g?.children?.forEach(c => { if(c?.value) m[c.value] = c.label || c.value; })); } catch {}
  return m;
})();
const labelOf = (key)=> LABEL_MAP[key] || key;

/* ---------- 유틸 ---------- */
function esc(s=''){ return String(s).replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[m])); }
function extractYTId(url=''){ const m=String(url).match(/(?:youtu\.be\/|v=|shorts\/|embed\/)([^?&/]+)/); return m?m[1]:''; }
function toThumb(url){ const id=extractYTId(url); return id?`https://i.ytimg.com/vi/${id}/hqdefault.jpg`:''; }
function setStatus(t){ if($msg) $msg.textContent = t||''; }
function toggleMore(show){ if($btnMore) $btnMore.style.display = show ? '' : 'none'; }
function updateSortBtn(){ if(!$btnSort) return; $btnSort.textContent = (orderDir==='asc' ? '오름차순' : '내림차순'); $btnSort.title='정렬 방향 전환(오름/내림)'; }

// === 선택 카테고리 읽기 (index/watch와 동일 규칙) ===
function parseCatsFromQuery(){
  try{
    const p = new URL(location.href).searchParams.get('cats');
    if(!p) return null;
    const arr = p.split(',').map(s=>s.trim()).filter(Boolean);
    return arr.length ? arr : null;
  }catch{ return null; }
}
function getSelectedCats(){
  const fromUrl = parseCatsFromQuery();
  if (fromUrl) return fromUrl;
  try{ return JSON.parse(localStorage.getItem('selectedCats')||'null'); }catch{ return "ALL"; }
}
// 개인자료 제외 + 빈 배열이면 null
function resolveCatFilter(){
  const sel = getSelectedCats();
  if (sel==="ALL" || !sel) return null;
  if (Array.isArray(sel) && sel.length){
    const filtered = sel.filter(v=> v!=='personal1' && v!=='personal2');
    return filtered.length ? new Set(filtered) : null;
  }
  return null;
}
let CAT_FILTER = resolveCatFilter();

function matchesFilter(data){
  if(!CAT_FILTER) return true;
  const cats = Array.isArray(data?.cats) ? data.cats
              : Array.isArray(data?.categories) ? data.categories : [];
  for(const v of cats){ if(CAT_FILTER.has(v)) return true; }
  return false;
}

/* ---------- Firestore 로드 ---------- */
async function loadPage(){
  if(isLoading || !hasMore) return false;
  isLoading = true;
  setStatus(allDocs.length ? `총 ${allDocs.length}개 불러옴 · 더 불러오는 중…` : '불러오는 중…');

  try{
    const base = collection(db,'videos');
    const parts = [];

    // 정렬 필드/방향
    parts.push(orderBy(orderField, orderDir));
    if (lastDoc) parts.push(startAfter(lastDoc));
    parts.push(limit(PAGE_SIZE));

    // 카테고리 필터(≤10개면 서버 필터)
    const filterSize = CAT_FILTER ? CAT_FILTER.size : 0;
    let snap;

    if (!CAT_FILTER) {
      snap = await getDocs(query(base, ...parts));
    } else if (filterSize <= 10) {
      const whereVals = Array.from(CAT_FILTER);
      // cats 필드 고정
      snap = await getDocs(query(base, /* where 먼저 */ 
        // Firestore는 orderBy보다 where가 먼저여도 됩니다(여기선 query(...) 안에서 순서 무관).
        // 다만 UI상 가독을 위해 분리하지 않고 parts에 얹지 않고 같이 넘깁니다.
        // createdAt/title 정렬 인덱스 필요할 수 있음.
        // @ts-ignore
        where('cats','array-contains-any', whereVals),
        orderBy(orderField, orderDir),
        ...(lastDoc ? [startAfter(lastDoc)] : []),
        limit(PAGE_SIZE)
      ));
    } else {
      // >10개: 서버 where가 불가 → 최신 페이지를 몇 번 스캔하며 클라 필터
      const MAX_SCAN_PAGES = 6; // 과도한 스캔 방지(원하면 12로 올리세요)
      let appended = 0;
      let scanned = 0;
      let localLast = lastDoc;
      let reachedEnd = false;

      while(appended < PAGE_SIZE && !reachedEnd && scanned < MAX_SCAN_PAGES){
        const snap2 = await getDocs(query(
          base, orderBy(orderField, orderDir),
          ...(localLast ? [startAfter(localLast)] : []),
          limit(PAGE_SIZE)
        ));
        if (snap2.empty){ reachedEnd=true; break; }

        const batch = [];
        snap2.docs.forEach(d=>{
          const data = d.data();
          if(matchesFilter(data)) batch.push({id:d.id, data});
          localLast = d;
        });

        // 추가
        allDocs = allDocs.concat(batch);
        appended += batch.length;
        scanned  += 1;
        if (snap2.size < PAGE_SIZE) reachedEnd = true;
        lastDoc = localLast || lastDoc;
      }

      render();
      toggleMore(!reachedEnd);
      setStatus(`총 ${allDocs.length}개`);
      isLoading=false; return true;
    }

    if(snap){
      if(snap.empty){
        hasMore=false; toggleMore(false);
        setStatus(allDocs.length ? `총 ${allDocs.length}개` : '등록된 영상이 없습니다.');
        isLoading=false; return false;
      }
      let batch = snap.docs.map(d => ({ id:d.id, data:d.data() }));
      // 서버 where를 못 쓴 경우 대비(혹시 모를 혼합 케이스)
      if (CAT_FILTER && filterSize > 10) batch = batch.filter(x=> matchesFilter(x.data));
      allDocs = allDocs.concat(batch);
      lastDoc = snap.docs[snap.docs.length-1] || lastDoc;
      if (snap.size < PAGE_SIZE) hasMore=false;

      render();
      toggleMore(hasMore);
      setStatus(`총 ${allDocs.length}개`);
      isLoading=false; return true;
    }
  }catch(e){
    console.error('[list] load failed:', e);
    setStatus('목록을 불러오지 못했습니다.');
    toggleMore(false);
    isLoading=false; return false;
  }
}


/* ---------- 검색(클라 필터) ---------- */
function filtered(){
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
  const list = filtered();
  $cards.innerHTML = '';
  if(!list.length){
    $cards.innerHTML = `<div style="padding:14px;border:1px dashed var(--border);border-radius:12px;color:#cfcfcf;">결과가 없습니다.</div>`;
    return;
  }

  const frag = document.createDocumentFragment();
  for(const x of list){
    const d = x.data || {};
    const title = d.title || '(제목 없음)';
    const url   = d.url || '';
    const cats  = Array.isArray(d.cats) ? d.cats : (Array.isArray(d.categories)? d.categories : []);
    const nick  = d.uNickname || d.ownerNick || '회원';
    const thumb = d.thumb || toThumb(url);

    const chipsHTML = (cats||[]).map(v => `<span class="chip" title="${esc(labelOf(v))}">${esc(labelOf(v))}</span>`).join('');

    const el = document.createElement('article');
    el.className = 'card';
    el.setAttribute('data-id', x.id);
    el.innerHTML = `
      <div class="title" title="${esc(title)}">${esc(title)}</div>
      <div class="chips">${chipsHTML}</div>
      <div class="meta">등록: ${esc(nick)}</div>
      <div class="right"><div class="thumb-wrap"><img class="thumb" src="${esc(thumb)}" alt="썸네일" loading="lazy"></div></div>
    `;
    el.addEventListener('click', ()=> openInWatch(list, x.id));
    frag.appendChild(el);
  }
  $cards.appendChild(frag);
}

/* ---------- watch로 이동 (큐 + 인덱스) ---------- */
function openInWatch(list, docId){
  const queue = list.map(x => ({ id:x.id, url:x.data?.url||'', title:x.data?.title||'' }));
  const idx = Math.max(0, queue.findIndex(it => it.id === docId));
  sessionStorage.setItem('playQueue', JSON.stringify(queue));
  sessionStorage.setItem('playIndex', String(idx));
  location.href = `watch.html?doc=${encodeURIComponent(docId)}&idx=${idx}`;
}

/* ---------- 이벤트 ---------- */
$btnSort?.addEventListener('click', async ()=>{
  orderDir = (orderDir==='asc' ? 'desc' : 'asc');
  // URL dir 쿼리 갱신(히스토리 보존)
  const u = new URL(location.href);
  u.searchParams.set('mode', mode);
  u.searchParams.set('dir', orderDir);
  history.replaceState(null, '', u);
  // 리셋 후 재조회
  updateSortBtn();
  allDocs=[]; lastDoc=null; hasMore=true; $cards.innerHTML='';
  await loadPage();
});

$q?.addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ render(); } });
$btnSearch?.addEventListener('click', ()=> render());
$btnClear ?.addEventListener('click', ()=>{ if($q){ $q.value=''; render(); } });
$btnMore  ?.addEventListener('click', async ()=>{
  $btnMore.disabled=true; $btnMore.textContent='불러오는 중…';
  try{ await loadPage(); } finally{ $btnMore.disabled=false; $btnMore.textContent='더 보기'; }
});

/* ---------- 무한 스크롤 ---------- */
const SCROLL_LOAD_OFFSET = 320;
window.addEventListener('scroll', async ()=>{
  if(isLoading || !hasMore) return;
  const nearBottom = (window.innerHeight + window.scrollY) >= (document.body.offsetHeight - SCROLL_LOAD_OFFSET);
  if(!nearBottom) return;
  await loadPage();
}, { passive:true });

/* ---------- 초기 ---------- */
(function init(){
  updateSortBtn();
  loadPage();
})();

/* ---------- 스와이프: 중앙 10% 데드존 + 오른쪽 스와이프 → index (Pointer Events 단일화) ---------- */
(function initSwipeToIndex(){
  let startX=0, startY=0, moved=false, blocked=false, t0=0, active=false, pid=null;
  const THRESH_X = 70;   // 최소 수평 거리
  const MAX_OFF_Y = 80;  // 수직 흔들림 허용치
  const MAX_TIME  = 700; // 최대 제스처 시간(ms)

  const el = document.querySelector('main') || document.body;
  // 수직 스크롤은 브라우저에 맡기고, 수평 제스처를 직접 처리
  if (el && !el.style.touchAction) el.style.touchAction = 'pan-y';

  function onPointerDown(e){
    // 마우스 오른쪽/중간 버튼 무시
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    active = true; moved = false; blocked = false; pid = e.pointerId;
    startX = e.clientX; startY = e.clientY; t0 = Date.now();

    // 중앙 10% 데드존 (가로)
    const vw = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
    const L = vw * 0.45, R = vw * 0.55;
    if (startX >= L && startX <= R) blocked = true;

    // 이 제스처 추적(포인터 캡처)
    try { e.target.setPointerCapture(pid); } catch(_){}
  }

  function onPointerMove(e){
    if (!active || e.pointerId !== pid) return;
    moved = true;

    // 수직으로 크게 흔들리면 제스처 취소
    const dy = e.clientY - startY;
    if (Math.abs(dy) > MAX_OFF_Y) {
      active = false;
      try { e.target.releasePointerCapture(pid); } catch(_){}
    }
  }

  function onPointerUp(e){
    if (!active || e.pointerId !== pid) return;
    active = false;
    try { e.target.releasePointerCapture(pid); } catch(_){}

    if (!moved || blocked) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const dt = Date.now() - t0;

    if (Math.abs(dy) > MAX_OFF_Y || dt > MAX_TIME) return;

    // 오른쪽으로 스와이프 → index.html
    if (dx >= THRESH_X) {
      // 애니메이션이 없어도 이동은 되지만, 있으면 부드럽게
      document.documentElement.classList.add('slide-out-right');
      setTimeout(() => { location.href = 'index.html'; }, 160);
    }
  }

  function onPointerCancel(e){
    if (e.pointerId !== pid) return;
    active = false;
    try { e.target.releasePointerCapture(pid); } catch(_){}
  }

  // Pointer Events만 사용(이중 등록 방지)
  (document.querySelector('main') || document).addEventListener('pointerdown',  onPointerDown,  { passive: true });
  (document.querySelector('main') || document).addEventListener('pointermove',  onPointerMove,  { passive: true });
  (document.querySelector('main') || document).addEventListener('pointerup',    onPointerUp,    { passive: true });
  (document.querySelector('main') || document).addEventListener('pointercancel',onPointerCancel,{ passive: true });
})();
