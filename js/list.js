// js/list.js (v2.2.0) — KidsAni
// - Firestore 필드명 정합: categories→cats, thumbnail→thumb
// - 시리즈 정렬: seriesSortAt/createdAt/title
// - 개인자료 로컬키 통일: kidsani_{slot}
// - 검색/칩/썸네일/큐 생성 모두 cats/thumb 기준
// - 중복 로드 제거(이 파일이 필요한 모듈들을 import)

import { auth, db } from './firebase-init.js?v=0.1.0';
import { onAuthStateChanged, signOut as fbSignOut } from './auth.js?v=0.1.0';
import { CATEGORY_GROUPS } from './categories.js?v=0.2.1';
import {
  collection, getDocs, getDoc, doc, query, where, orderBy, limit, startAfter
} from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';

/* ---------- 전역 내비 중복 방지 플래그 ---------- */
window.__swipeNavigating = window.__swipeNavigating || false;

/* ---------- Topbar ---------- */
const $ = (s)=>document.querySelector(s);
const signupLink   = $('#signupLink');
const signinLink   = $('#signinLink');
const welcome      = $('#welcome');
const menuBtn      = $('#menuBtn');
const dropdown     = $('#dropdownMenu');
const btnSignOut   = $('#btnSignOut');
const btnGoUpload  = $('#btnGoUpload');
const btnAbout     = $('#btnAbout');
const btnList      = $('#btnList');
const btnMyUploads = $('#btnMyUploads');
const btnNick      = $('#btnNick');

function openDropdown(){ dropdown?.classList.remove('hidden'); requestAnimationFrame(()=> dropdown?.classList.add('show')); }
function closeDropdown(){ dropdown?.classList.remove('show'); setTimeout(()=> dropdown?.classList.add('hidden'), 180); }

onAuthStateChanged(auth,(user)=>{
  const loggedIn = !!user;
  signupLink?.classList.toggle('hidden', loggedIn);
  signinLink?.classList.toggle('hidden', loggedIn);
  if (welcome) welcome.textContent = loggedIn ? `Welcome! ${user?.displayName || '회원'}` : '';
  closeDropdown();
});
menuBtn?.addEventListener('click',(e)=>{ e.stopPropagation(); dropdown?.classList.contains('hidden') ? openDropdown() : closeDropdown(); });
document.addEventListener('pointerdown',(e)=>{ if(!dropdown || dropdown.classList.contains('hidden')) return; if(!e.target.closest('#dropdownMenu,#menuBtn')) closeDropdown(); }, true);
document.addEventListener('keydown',(e)=>{ if(e.key==='Escape') closeDropdown(); });
dropdown?.addEventListener('click',(e)=> e.stopPropagation());

btnSignOut ?.addEventListener('click', async ()=>{ if(!auth.currentUser){ location.href='signin.html'; return; } try{ await fbSignOut(auth);}catch{} closeDropdown(); });
btnGoUpload?.addEventListener('click', ()=>{ location.href='upload.html'; closeDropdown(); });
btnAbout   ?.addEventListener('click', ()=>{ location.href='about.html'; closeDropdown(); });
btnList    ?.addEventListener('click', ()=>{ location.href='list.html'; closeDropdown(); });
btnMyUploads?.addEventListener('click',()=>{ location.href='manage-uploads.html'; closeDropdown(); });
btnNick    ?.addEventListener('click', ()=>{ location.href='nick.html'; closeDropdown(); });

/* ---------- DOM ---------- */
const $cards     = document.getElementById('cards');
const $msg       = document.getElementById('msg');
const $q         = document.getElementById('q');
const $btnSearch = document.getElementById('btnSearch');
const $btnMore   = document.getElementById('btnMore');

/* ---------- 상태 ---------- */
const PAGE_SIZE        = 48;   // 한 번에 목표 합계
const PER_CAT_MIN_LOAD = 12;   // 카테고리당 최소 로드(초기)
const SERIES_PREFS_KEY = 'seriesSortPrefs';

let isLoading = false;
let hasMore   = true;

/* 전략 A 상태 */
const loaders = [];   // [{ cat, isSeries, mode, cursor, exhausted, items:[] }]
let merged    = [];   // 누적 병합 결과(표시)

/* ---------- 유틸 ---------- */
function setStatus(t){ if($msg) $msg.textContent = t || ''; }
function toggleMore(show){ if($btnMore) $btnMore.parentElement.style.display = show ? '' : 'none'; }
function esc(s=''){ return String(s).replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m])); }

function extractId(url=''){ const m = String(url).match(/(?:youtu\.be\/|v=|shorts\/|embed\/)([^?&\/]+)/); return m ? m[1] : ''; }
function toThumb(url,fallback=''){ const id=extractId(url); return id?`https://i.ytimg.com/vi/${id}/hqdefault.jpg`:fallback; }

/* 카테고리 라벨 */
const LABEL_MAP = (()=>{ const m={}; CATEGORY_GROUPS.forEach(g=> g.children?.forEach(c=> { if(c?.value) m[c.value]=c.label||c.value; })); return m; })();
const getLabel = (key)=> LABEL_MAP[key]||key;

/* 선택 카테고리 */
function readSelectedCats(){
  try{
    const raw = localStorage.getItem('selectedCats');
    const v = JSON.parse(raw || 'ALL');
    if (v === 'ALL') return 'ALL';
    return Array.isArray(v) ? v : 'ALL';
  }catch{ return 'ALL'; }
}

/* 시리즈/개인 구분 */
const SERIES_VALUES   = new Set(CATEGORY_GROUPS.filter(g=>g.series).flatMap(g=> g.children?.map(c=>c.value) || []));
const PERSONAL_VALUES = new Set(CATEGORY_GROUPS.filter(g=>g.personal).flatMap(g=> g.children?.map(c=>c.value) || []));
const NORMAL_VALUES   = CATEGORY_GROUPS.filter(g=> !g.series && !g.personal).flatMap(g=> g.children?.map(c=>c.value) || []);

/* seriesSortPrefs */
function loadSeriesPrefs(){ try{ return JSON.parse(localStorage.getItem(SERIES_PREFS_KEY) || '{}'); }catch{ return {}; } }
function getSeriesModeFor(cat){
  const m = loadSeriesPrefs()?.[cat];
  return (m==='latest'||m==='registered'||m==='title') ? m : 'registered';
}

/* ---------- YouTube 제목 oEmbed 캐시(7일) ---------- */
const TitleCache = {
  get(id){
    try{
      const j = localStorage.getItem('yt_title_'+id);
      if(!j) return null;
      const { t, exp } = JSON.parse(j);
      if(exp && Date.now() > exp){ localStorage.removeItem('yt_title_'+id); return null; }
      return t || null;
    }catch{ return null; }
  },
  set(id, title){
    try{
      const exp = Date.now() + 7*24*60*60*1000;
      localStorage.setItem('yt_title_'+id, JSON.stringify({ t: String(title||'').slice(0,200), exp }));
    }catch{}
  }
};
const lazyTitleMap = new Map();

async function fetchYouTubeTitleById(id){
  if(!id) return null;
  const c = TitleCache.get(id);
  if(c){ lazyTitleMap.set(id,c); return c; }
  try{
    const url = `https://www.youtube.com/oembed?format=json&url=https://www.youtube.com/watch?v=${id}`;
    const res = await fetch(url, { mode:'cors' });
    if(!res.ok) throw 0;
    const data = await res.json();
    const title = data?.title ? String(data.title) : null;
    if(title){ TitleCache.set(id, title); lazyTitleMap.set(id, title); }
    return title;
  }catch{ return null; }
}
async function hydrateTitleIfNeeded(titleEl, url, existingTitle){
  if(!titleEl) return;
  if(existingTitle && existingTitle !== '(제목 없음)') return;
  const id = extractId(url); if(!id) return;
  const t = await fetchYouTubeTitleById(id);
  if(t) titleEl.textContent = t;
}

/* ---------- 닉네임 캐시 ---------- */
const NickCache = {
  map: new Map(), // uid -> string
  get(uid){ return this.map.get(uid) || ''; },
  set(uid, name){ if(uid) this.map.set(uid, String(name||'')); }
};
function ownerUidOf(d = {}){ return d?.uid || d?.ownerUid || d?.userUid || null; }
async function preloadNicknamesFor(docs){
  const uids = new Set();
  docs.forEach(x => {
    const d = x.data || {};
    const uid = ownerUidOf(d);
    if (!uid || NickCache.map.has(uid)) return;
    // 문서에 uNickname 있으면 그걸 우선 쓰고, 없으면 users/{uid} 조회
    if (d.uNickname){ NickCache.set(uid, d.uNickname); }
    else uids.add(uid);
  });
  if (!uids.size) return;
  await Promise.all([...uids].map(async (uid) => {
    try{
      const snap = await getDoc(doc(db, 'users', uid));
      const prof = snap.exists() ? snap.data() : null;
      const name = prof?.displayName || prof?.nickname || '';
      NickCache.set(uid, name);
    }catch{ NickCache.set(uid, ''); }
  }));
}

/* ---------- 개인자료 모드 ---------- */
function isPersonalOnlySelection(){
  try{
    const raw = localStorage.getItem('selectedCats');
    const v = JSON.parse(raw || '[]');
    return Array.isArray(v) && v.length === 1 && PERSONAL_VALUES.has(v[0]);
  }catch{ return false; }
}
function getPersonalSlot(){
  try{ const v = JSON.parse(localStorage.getItem('selectedCats') || '[]'); return Array.isArray(v) ? v[0] : null; }
  catch{ return null; }
}
function readPersonalItems(slot){
  try{ const arr = JSON.parse(localStorage.getItem(`kidsani_${slot}`) || '[]'); return Array.isArray(arr) ? arr : []; }
  catch{ return []; }
}
function getPersonalLabel(slot){
  try{
    const labels = JSON.parse(localStorage.getItem('personalLabels') || '{}');
    return labels?.[slot] || (slot === 'personal1' ? '개인자료1' : '개인자료2');
  }catch{ return slot; }
}
function renderPersonalList(){
  const slot  = getPersonalSlot();
  const items = readPersonalItems(slot);
  const label = getPersonalLabel(slot);

  $cards.innerHTML = '';
  const q = ($q?.value || '').trim().toLowerCase();
  let list = items.slice();
  if(q){
    list = list.filter(it =>
      String(it.title||'').toLowerCase().includes(q) ||
      String(it.url||'').toLowerCase().includes(q)
    );
  }

  if (!list.length){
    $cards.innerHTML = `<div style="padding:14px;border:1px dashed var(--border);border-radius:12px;color:#cfcfcf;">${esc(label)}에 저장된 영상이 없습니다.</div>`;
    toggleMore(false); setStatus('0개'); return;
  }

  const frag = document.createDocumentFragment();
  list.forEach((it, idx)=>{
    const title = it.title || '(제목 없음)';
    const url   = it.url   || '';
    const id    = extractId(url);
    const thumb = id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : '';

    const card = document.createElement('article');
    card.className = 'card';
    card.innerHTML = `
      <div class="left">
        <div class="title" title="${esc(title)}">${esc(title)}</div>
        <div class="chips"><span class="chip">${esc(label)}</span></div>
        <div class="meta">등록: 나</div>
      </div>
      <div class="right">
        <div class="thumb-wrap"><img class="thumb" src="${esc(thumb)}" alt="썸네일" loading="lazy"></div>
      </div>
    `;
    card.querySelector('.left') ?.addEventListener('click', ()=> openInWatchPersonal(list, idx, slot, label));
    card.querySelector('.thumb')?.addEventListener('click', ()=> openInWatchPersonal(list, idx, slot, label));
    frag.appendChild(card);
  });

  $cards.appendChild(frag);
  toggleMore(false);
  setStatus(`총 ${list.length}개`);
}
function openInWatchPersonal(items, index, slot, label){
  const queue = items.map((it,i)=>({
    id: `local-${slot}-${i}`,
    url: it.url || '',
    title: it.title || '(제목 없음)',
    cats: [label]
  }));
  sessionStorage.setItem('playQueue', JSON.stringify(queue));
  sessionStorage.setItem('playIndex', String(index));
  location.href = `watch.html?idx=${index}&cats=${encodeURIComponent(slot)}`;
}

/* ---------- Firestore(일반/시리즈) : 전략 A ---------- */
function buildLoaders(){
  loaders.length = 0;
  const sel = readSelectedCats();

  let targets = [];
  if (sel === 'ALL'){
    // 기본: 일반 카테고리 전체만 노출 (제품 의도 유지)
    targets = NORMAL_VALUES.slice();
  } else {
    targets = sel.filter(v => !PERSONAL_VALUES.has(v)); // 개인 제외
  }

  // 중복 제거
  targets = [...new Set(targets)];

  for (const cat of targets){
    const isSeries = SERIES_VALUES.has(cat);
    const mode = isSeries ? getSeriesModeFor(cat) : 'latest'; // 일반은 최신 고정
    loaders.push({ cat, isSeries, mode, cursor:null, exhausted:false, items:[] });
  }
}

async function loadOneLoader(ld, perCatLimit){
  if (ld.exhausted) return [];

  const parts = [ where('cats','array-contains', ld.cat) ];
  // 정렬
  if (ld.isSeries){
    if (ld.mode === 'title'){
      parts.push(orderBy('title','asc'));
    } else if (ld.mode === 'registered'){
      parts.push(orderBy('createdAt','asc'));
    } else { // latest(업로드시각 기반)
      parts.push(orderBy('seriesSortAt','desc'));
    }
  } else {
    parts.push(orderBy('createdAt','desc'));
  }

  if (ld.cursor) parts.push(startAfter(ld.cursor));
  parts.push(limit(perCatLimit));

  let snap;
  try{
    snap = await getDocs(query(collection(db,'videos'), ...parts));
  }catch(e){
    console.error('[list] query failed (index needed?)', e);
    setStatus('인덱스가 필요한 정렬입니다. 콘솔의 오류 링크로 인덱스를 생성해 주세요.');
    ld.exhausted = true;
    return [];
  }

  if (snap.empty){ ld.exhausted = true; return []; }

  const batch = snap.docs.map(d => ({ id:d.id, data:d.data(), _created:(d.data()?.createdAt?.toMillis?.()||0) }));
  ld.cursor = snap.docs[snap.docs.length-1];
  ld.items = ld.items.concat(batch);
  return batch;
}

// 새로 꺼낸 아이템 조각(Chunk)을 merged에 추가
function takeMergedChunkAndAppend(){
  const seriesLoaders = loaders.filter(l=> l.isSeries);
  const normalLoaders = loaders.filter(l=> !l.isSeries);

  // 시리즈끼리 라운드-로빈
  const seriesChunk = [];
  let progressed = true;
  while (progressed){
    progressed = false;
    for (const l of seriesLoaders){
      if (!l.items.length) continue;
      seriesChunk.push(l.items.shift());
      progressed = true;
    }
  }

  // 일반은 모두 모아 최신순 정렬
  const normalsChunk = [];
  normalLoaders.forEach(l => { if (l.items.length) normalsChunk.push(...l.items.splice(0)); });
  normalsChunk.sort((a,b)=> b._created - a._created);

  const newChunk = seriesChunk.concat(normalsChunk);
  if (newChunk.length) merged = merged.concat(newChunk);

  const anyBuffered = loaders.some(l => l.items.length > 0);
  const anyAlive    = loaders.some(l => !l.exhausted);
  hasMore = anyBuffered || anyAlive;

  toggleMore(hasMore);
  setStatus(`총 ${merged.length}개`);
  return newChunk;
}

async function ensureAtLeast(totalTarget = PAGE_SIZE, perCatMin = PER_CAT_MIN_LOAD){
  if (isLoading) return;
  isLoading = true;
  setStatus(merged.length ? `총 ${merged.length}개 불러옴 · 더 불러오는 중…` : '불러오는 중…');

  const alive = loaders.filter(l=> !l.exhausted);
  if (!alive.length && loaders.every(l => !l.items.length)){
    hasMore = false; toggleMore(false);
    setStatus(merged.length ? `총 ${merged.length}개` : '등록된 영상이 없습니다.');
    isLoading = false; return;
  }

  // 1차: 각 로더에서 최소 확보
  await Promise.all(alive.map(l => loadOneLoader(l, perCatMin).catch(()=>[])));

  // 2차: 부족하면 라운드로 추가
  const want = ()=> merged.length + loaders.reduce((acc,l)=> acc + l.items.length, 0);
  let guard = 0;
  while (want() < totalTarget && loaders.some(l=>!l.exhausted) && guard < 6){
    for (const l of loaders){
      if (want() >= totalTarget) break;
      if (l.exhausted) continue;
      try{ await loadOneLoader(l, Math.max(6, Math.ceil(perCatMin/2))); }catch{}
    }
    guard++;
  }

  const newChunk = takeMergedChunkAndAppend();

  // 닉네임 프리로드(신규분에 대해)
  try{ await preloadNicknamesFor(newChunk); }catch{}

  setStatus(`총 ${merged.length}개`);
  isLoading = false;
}

/* ---------- 검색 & 렌더 ---------- */
function filterSearch(list){
  const q = ($q?.value || '').trim().toLowerCase();
  if (!q) return list;
  return list.filter(x => {
    const d = x.data || {};
    const url = String(d.url || '').toLowerCase();
    const id  = extractId(d.url || '');
    const tt  = String(d.title || lazyTitleMap.get(id) || '').toLowerCase();
    const uid = ownerUidOf(d);
    const nick= (NickCache.get(uid) || d.uNickname || '').toLowerCase();
    const domain = (()=>{ try{ const u = new URL(d.url); return u.hostname.toLowerCase(); }catch{ return ''; }})();
    return tt.includes(q) || url.includes(q) || nick.includes(q) || domain.includes(q);
  });
}

function render(){
  if (isPersonalOnlySelection()){ renderPersonalList(); return; }

  const list = filterSearch(merged);

  $cards.innerHTML = '';
  if (!list.length){
    $cards.innerHTML = `<div style="padding:14px;border:1px dashed var(--border);border-radius:12px;color:#cfcfcf;">결과가 없습니다.</div>`;
    toggleMore(hasMore);
    return;
  }

  const frag = document.createDocumentFragment();
  list.forEach((x, idx) => {
    const d     = x.data || {};
    const title = d.title || '(제목 없음)';
    const url   = d.url || '';
    const catsV = Array.isArray(d.cats) ? d.cats : [];
    const thumb = d.thumb || toThumb(url);
    const uid   = ownerUidOf(d);
    const nick  = NickCache.get(uid) || d.uNickname || '회원';

    const chipsHTML = catsV.map(v => `<span class="chip" title="${esc(getLabel(v))}">${esc(getLabel(v))}</span>`).join('');

    const card = document.createElement('article');
    card.className = 'card';
    card.innerHTML = `
      <div class="left" aria-label="영상 열기: ${esc(title)}">
        <div class="title" title="${esc(title)}">${esc(title)}</div>
        <div class="chips">${chipsHTML}</div>
        <div class="meta">등록: ${esc(nick)}</div>
      </div>
      <div class="right">
        <div class="thumb-wrap"><img class="thumb" src="${esc(thumb)}" alt="썸네일" loading="lazy" decoding="async"></div>
      </div>
    `;

    hydrateTitleIfNeeded(card.querySelector('.title'), url, title);

    const open = ()=> openInWatch(list, idx);
    card.querySelector('.left') ?.addEventListener('click', open);
    card.querySelector('.thumb')?.addEventListener('click', open);

    frag.appendChild(card);
  });
  $cards.appendChild(frag);
  toggleMore(hasMore);
}

/* ---------- watch로 이동(현재 렌더 순서 기준 큐) ---------- */
function openInWatch(list, index){
  const queue = list.map(x => {
    const d = x.data || {};
    const id = extractId(d.url || '');
    return {
      id: x.id,
      url: d.url || '',
      title: d.title || lazyTitleMap.get(id) || '',
      cats: Array.isArray(d.cats) ? d.cats : []
    };
  });
  sessionStorage.setItem('playQueue', JSON.stringify(queue));
  sessionStorage.setItem('playIndex', String(index));

  const docId = encodeURIComponent(list[index].id);

  let catsParam = '';
  try{
    const raw = localStorage.getItem('selectedCats');
    const parsed = JSON.parse(raw || '[]');
    const arr = Array.isArray(parsed) ? parsed : [];
    if (arr.length) catsParam = `&cats=${encodeURIComponent(arr.join(','))}`;
  }catch{}

  location.href = `watch.html?doc=${docId}&idx=${index}${catsParam}`;
}

/* ---------- 이벤트 ---------- */
$q?.addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ e.preventDefault(); render(); }});
$btnSearch?.addEventListener('click', ()=> render());
$btnMore  ?.addEventListener('click', async ()=>{
  $btnMore.disabled = true; $btnMore.textContent = '불러오는 중…';
  try{
    await ensureAtLeast(PAGE_SIZE, PER_CAT_MIN_LOAD);
    render();
  } finally {
    $btnMore.disabled = false; $btnMore.textContent = '더 보기';
  }
});

/* ---------- 초기화 ---------- */
(async function init(){
  try{
    if (isPersonalOnlySelection()){
      renderPersonalList();
      return;
    }
    buildLoaders();
    await ensureAtLeast(PAGE_SIZE, PER_CAT_MIN_LOAD);
    render();
    toggleMore(hasMore);
  }catch(e){
    console.error('[list] init error', e);
    setStatus('목록을 불러오지 못했습니다.');
  }
})();

/* ---------- 스크롤 하단 근접 시 추가 로드 ---------- */
const SCROLL_LOAD_OFFSET = 320;
window.addEventListener('scroll', async ()=>{
  if (isLoading || !hasMore) return;
  const nearBottom = (window.innerHeight + window.scrollY) >= (document.body.offsetHeight - SCROLL_LOAD_OFFSET);
  if (!nearBottom) return;

  await ensureAtLeast(PAGE_SIZE, Math.max(8, Math.floor(PER_CAT_MIN_LOAD/2)));
  render();
}, { passive:true });

/* ===================== */
/* Slide-out CSS (백업용) */
/* ===================== */
(function injectSlideCSS(){
  if (document.getElementById('slide-css-152')) return;
  const style = document.createElement('style');
  style.id = 'slide-css-152';
  style.textContent = `
@keyframes pageSlideLeft { from { transform: translateX(0); opacity:1; } to { transform: translateX(-22%); opacity:.92; } }
@keyframes pageSlideRight{ from { transform: translateX(0); opacity:1; } to { transform: translateX(22%);  opacity:.92; } }
:root.slide-out-left  body { animation: pageSlideLeft 0.26s ease forwards; }
:root.slide-out-right body { animation: pageSlideRight 0.26s ease forwards; }
@media (prefers-reduced-motion: reduce){
  :root.slide-out-left  body,
  :root.slide-out-right body { animation:none; }
}`;
  document.head.appendChild(style);
})();

/* ===================== */
/* 스와이프: 우→좌(index로), 반대쪽 차단 */
/* ===================== */
function initSwipeNav({ goLeftHref=null, goRightHref=null, animateMs=260, deadZoneCenterRatio=0.30 } = {}){
  let sx=0, sy=0, t0=0, tracking=false;
  const THRESH_X = 70, MAX_OFF_Y = 80, MAX_TIME = 600;
  const getPoint = (e) => e.touches?.[0] || e.changedTouches?.[0] || e;

  function onStart(e){
    const p = getPoint(e); if(!p) return;
    const vw = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
    const dz = Math.max(0, Math.min(0.9, deadZoneCenterRatio));
    const L  = vw * (0.5 - dz/2), R = vw * (0.5 + dz/2);
    if (p.clientX >= L && p.clientX <= R) { tracking = false; return; }
    sx = p.clientX; sy = p.clientY; t0 = Date.now(); tracking = true;
  }
  function onEnd(e){
    if(!tracking) return; tracking = false;
    if (window.__swipeNavigating) return;
    const p = getPoint(e);
    const dx = p.clientX - sx, dy = p.clientY - sy, dt = Date.now() - t0;
    if (Math.abs(dy) > MAX_OFF_Y || dt > MAX_TIME) return;
    if (dx <= -THRESH_X && goLeftHref){
      window.__swipeNavigating = true;
      document.documentElement.classList.add('slide-out-left');
      setTimeout(()=> location.href = goLeftHref, animateMs);
    }
  }
  document.addEventListener('touchstart', onStart, { passive:true });
  document.addEventListener('touchend',   onEnd,   { passive:true });
  document.addEventListener('pointerdown',onStart, { passive:true });
  document.addEventListener('pointerup',  onEnd,   { passive:true });
}
initSwipeNav({ goLeftHref: 'index.html', goRightHref: null, deadZoneCenterRatio: 0.30 });

(function(){
  function initDragSwipe({ goLeftHref=null, threshold=60, slop=45, timeMax=700, feel=1.0, deadZoneCenterRatio=0.15 }={}){
    const page = document.querySelector('main') || document.body;
    if(!page) return;

    if(!page.style.willChange || !page.style.willChange.includes('transform')){
      page.style.willChange = (page.style.willChange ? page.style.willChange + ', transform' : 'transform');
    }

    let x0=0, y0=0, t0=0, active=false, canceled=false;
    const isInteractive = (el)=> !!(el && (el.closest('input,textarea,select,button,a,[role="button"],[contenteditable="true"]')));

    function reset(anim=true){
      if(anim) page.style.transition = 'transform 180ms ease';
      requestAnimationFrame(()=>{ page.style.transform = 'translateX(0px)'; });
      setTimeout(()=>{ if(anim) page.style.transition = ''; }, 200);
    }

    function start(e){
      if (window.__swipeNavigating) return;
      const t = (e.touches && e.touches[0]) || (e.pointerType ? e : null);
      if(!t) return;
      if(isInteractive(e.target)) return;

      const vw = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
      const dz = Math.max(0, Math.min(0.9, deadZoneCenterRatio));
      const L  = vw * (0.5 - dz/2), R  = vw * (0.5 + dz/2);
      if (t.clientX >= L && t.clientX <= R) return;

      x0 = t.clientX; y0 = t.clientY; t0 = Date.now();
      active = true; canceled = false;
      page.style.transition = 'none';
    }

    function move(e){
      if(!active) return;
      const t = (e.touches && e.touches[0]) || (e.pointerType ? e : null);
      if(!t) return;
      const dx = t.clientX - x0;
      const dy = t.clientY - y0;
      if(Math.abs(dy) > slop){ canceled = true; active = false; reset(true); return; }
      // 오른쪽 이동 차단
      if (dx > 0){ page.style.transform = 'translateX(0px)'; return; }
      e.preventDefault();
      page.style.transform = 'translateX(' + (dx * feel) + 'px)';
    }

    function end(e){
      if(!active) return; active = false;
      const t = (e.changedTouches && e.changedTouches[0]) || (e.pointerType ? e : null);
      if(!t) return;
      const dx = t.clientX - x0;
      const dy = t.clientY - y0;
      const dt = Date.now() - t0;

      if(canceled || Math.abs(dy) > slop || dt > timeMax){ reset(true); return; }

      if(dx <= -threshold && goLeftHref){
        window.__swipeNavigating = true;
        page.style.transition = 'transform 160ms ease';
        page.style.transform  = 'translateX(-100vw)';
        setTimeout(()=>{ location.href = goLeftHref; }, 150);
      } else {
        reset(true);
      }
    }

    document.addEventListener('touchstart',  start, { passive:true });
    document.addEventListener('touchmove',   move,  { passive:false });
    document.addEventListener('touchend',    end,   { passive:true, capture:true });

    document.addEventListener('pointerdown', start, { passive:true });
    document.addEventListener('pointermove', move,  { passive:false });
    document.addEventListener('pointerup',   end,   { passive:true, capture:true });
  }

  // 오른쪽 페이지 없음 → index로만 복귀
  initDragSwipe({ goLeftHref: 'index.html', threshold:60, slop:45, timeMax:700, feel:1.0, deadZoneCenterRatio: 0.15 });
})();
