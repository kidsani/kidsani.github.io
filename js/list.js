// js/list.js — 완전판
import { auth, db } from './firebase-init.js';
import {
  collection, query, where, orderBy, limit, startAfter, getDocs,
  doc, getDoc, updateDoc, deleteDoc
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js';
import { CATEGORIES_GROUPS } from './categories.js';

/**
 * videos 문서 필드(가정):
 *  - title: string
 *  - url: string
 *  - cats: string[]
 *  - createdAt: Timestamp
 *  - ownerUid, ownerNick
 *  - seriesKey?: string
 *  - seriesTitle?: string
 *  - episode?: number
 *  - seriesSortAt?: Timestamp (유튜브 업로드시각 등)
 *  - thumb?: string
 *
 * 인덱스(권장):
 * 1) cats array-contains + createdAt desc
 * 2) cats array-contains + createdAt asc
 * 3) cats array-contains + title asc
 * 4) cats array-contains + title desc
 * 5) cats array-contains + seriesSortAt desc
 * 6) cats array-contains + seriesSortAt asc
 */

const $catSelect   = document.getElementById('catSelect');
const $sortSelect  = document.getElementById('sortSelect');  // 호환용(숨김)
const $keyword     = document.getElementById('keyword');
const $refresh     = document.getElementById('refreshBtn');
const $more        = document.getElementById('moreBtn');
const $list        = document.getElementById('list');
const $empty       = document.getElementById('empty');
const $banner      = document.getElementById('errorBanner');

const $dirToggleBtn      = document.getElementById('dirToggleBtn');
const $seriesSortFields  = document.getElementById('seriesSortFields');
const $seriesFieldRadios = $seriesSortFields
  ? Array.from($seriesSortFields.querySelectorAll('input[name="sortField"]'))
  : [];

const $bulkChangeBtn = document.getElementById('bulkChangeBtn');
const $bulkDeleteBtn = document.getElementById('bulkDeleteBtn');
const $selCount      = document.getElementById('selCount');
const $catDialog     = document.getElementById('catDialog');
const $catDialogBody = document.getElementById('catDialogBody');
const $catSaveBtn    = document.getElementById('catSaveBtn');

const $sentinel = document.getElementById('sentinel');

/* ===== 상태 ===== */
const PAGE_SIZE = 30;
const LS_KEY = {
  CAT: 'list.cat',
  FIELD: 'list.sort.field',
  DIR: 'list.sort.dir',
  KW: 'list.keyword',
  SCROLL: 'list.scrollY'
};

let state = {
  user: null,
  isAdmin: false,

  cat: '',
  sortField: 'createdAt', // createdAt | seriesSortAt | title
  sortDir: 'desc',        // asc | desc
  kw: '',

  items: [],
  lastDoc: null,
  loading: false,
  reachedEnd: false,

  selectedIds: new Set(),

  // infinite scroll
  io: null,

  // restore scroll
  restoringScroll: false,
};

function $(sel, root=document){ return root.querySelector(sel); }
function textNode(s){ return document.createTextNode(s); }
function clamp(v,min,max){ return Math.max(min, Math.min(max, v)); }

/* ===== 권한 ===== */
onAuthStateChanged(auth, async (user)=>{
  state.user = user || null;
  state.isAdmin = await isAdmin(user?.uid);
  // 권한은 버튼 활성/비활성에 반영
  syncBulkButtons();
});
async function isAdmin(uid){
  if(!uid) return false;
  try{
    const snap = await getDoc(doc(db,'admins',uid));
    return snap.exists();
  }catch{ return false; }
}

/* ===== 카테고리 셀렉트 초기화 (CATEGORIES: { groupKey: { label, items:[{value,label},...] } }) ===== */
(function initCategoriesSelect(){
  Object.entries(CATEGORIES).forEach(([_, group])=>{
    const og = document.createElement('optgroup');
    og.label = group.label ?? '';
    (group.items||[]).forEach(cat=>{
      const opt = document.createElement('option');
      opt.value = cat.value;
      opt.textContent = cat.label || cat.value;
      og.appendChild(opt);
    });
    $catSelect.appendChild(og);
  });
})();

/* ===== 시리즈 그룹 판정 ===== */
function isSeriesCategory(catValue){
  if(!catValue) return false;
  for(const [, group] of Object.entries(CATEGORIES)){
    const isSeriesGroup = (group.label||'').includes('시리즈');
    if(!isSeriesGroup) continue;
    if((group.items||[]).some(it=> it.value === catValue)) return true;
  }
  return false;
}

/* ===== 정렬 라벨 갱신 ===== */
function updateDirToggleLabel(field, dir){
  if(!$dirToggleBtn) return;
  if(field === 'createdAt'){
    $dirToggleBtn.textContent = (dir==='desc' ? '최신순' : '등록순');
  }else if(field === 'seriesSortAt'){
    $dirToggleBtn.textContent = (dir==='desc' ? '최신화' : '오래된화');
  }else if(field === 'title'){
    $dirToggleBtn.textContent = (dir==='asc' ? '가나다' : '역가나다');
  }else{
    $dirToggleBtn.textContent = (dir==='desc' ? '내림차순' : '오름차순');
  }
}

/* ===== 정렬 스펙 (라디오/토글 우선) ===== */
function getSortSpec(){
  const seriesUIVisible = $seriesSortFields && $seriesSortFields.style.display !== 'none';
  if(seriesUIVisible && $seriesFieldRadios.length){
    const sel = $seriesFieldRadios.find(r=> r.checked);
    const field = sel ? sel.value : 'createdAt';
    updateDirToggleLabel(field, state.sortDir);
    return { field, dir: state.sortDir };
  }
  // 호환: 기존 select
  const raw = ($sortSelect && $sortSelect.value) ? $sortSelect.value : 'createdAt_desc';
  const [field, dir] = raw.split('_');
  return { field, dir: (dir==='asc'?'asc':'desc') };
}

/* ===== 로컬 스토리지 ===== */
function savePrefs(){
  try{
    localStorage.setItem(LS_KEY.CAT, state.cat);
    localStorage.setItem(LS_KEY.FIELD, state.sortField);
    localStorage.setItem(LS_KEY.DIR, state.sortDir);
    localStorage.setItem(LS_KEY.KW, state.kw);
  }catch{}
}
function loadPrefs(){
  try{
    const cat   = localStorage.getItem(LS_KEY.CAT) || '';
    const field = localStorage.getItem(LS_KEY.FIELD) || '';
    const dir   = localStorage.getItem(LS_KEY.DIR) || '';
    const kw    = localStorage.getItem(LS_KEY.KW) || '';
    if(cat) state.cat = cat;
    if(field) state.sortField = field;
    if(dir) state.sortDir = dir;
    if(kw) state.kw = kw;
  }catch{}
}
function saveScrollY(){
  try{ localStorage.setItem(LS_KEY.SCROLL, String(window.scrollY||0)); }catch{}
}
function loadScrollY(){
  try{
    const y = parseInt(localStorage.getItem(LS_KEY.SCROLL)||'0',10);
    return isNaN(y) ? 0 : clamp(y, 0, 10_000_000);
  }catch{ return 0; }
}

/* ===== 이벤트 바인딩 ===== */
if($refresh) $refresh.addEventListener('click', ()=> resetAndLoad());
if($more) $more.addEventListener('click', ()=> loadMore());

if($keyword){
  $keyword.addEventListener('input', ()=>{
    state.kw = ($keyword.value||'').trim().toLowerCase();
    savePrefs();
    // 서버 재쿼리 없이 클라 필터
    applyClientSearch();
  });
}

if($sortSelect){
  $sortSelect.addEventListener('change', ()=>{
    const [field, dir] = $sortSelect.value.split('_');
    state.sortField = field;
    state.sortDir   = (dir==='asc'?'asc':'desc');
    updateDirToggleLabel(state.sortField, state.sortDir);
    savePrefs();
    resetAndLoad();
  });
}

if($catSelect){
  $catSelect.addEventListener('change', ()=>{
    state.cat = $catSelect.value || '';
    savePrefs();

    const series = isSeriesCategory(state.cat);
    if($seriesSortFields) $seriesSortFields.style.display = series ? '' : 'none';

    if(series){
      state.sortField = 'createdAt';
      state.sortDir   = 'asc';
      if($seriesFieldRadios.length){
        const r = $seriesFieldRadios.find(x=> x.value==='createdAt');
        if(r) r.checked = true;
      }
    }else{
      state.sortField = 'createdAt';
      state.sortDir   = 'desc';
      if($seriesFieldRadios.length){
        const r = $seriesFieldRadios.find(x=> x.checked);
        if(r) r.checked = false;
      }
    }
    updateDirToggleLabel(state.sortField, state.sortDir);
    resetAndLoad();
  });
}

if($seriesFieldRadios.length){
  $seriesFieldRadios.forEach(r=>{
    r.addEventListener('change', ()=>{
      state.sortField = r.value; // createdAt | seriesSortAt | title
      // 필드별 합리적 기본 방향
      if(state.sortField==='createdAt')      state.sortDir='asc';
      else if(state.sortField==='seriesSortAt') state.sortDir='desc';
      else if(state.sortField==='title')     state.sortDir='asc';
      updateDirToggleLabel(state.sortField, state.sortDir);
      savePrefs();
      resetAndLoad();
    });
  });
}

if($dirToggleBtn){
  $dirToggleBtn.addEventListener('click', ()=>{
    state.sortDir = (state.sortDir==='asc'?'desc':'asc');
    updateDirToggleLabel(state.sortField, state.sortDir);
    savePrefs();
    resetAndLoad();
  });
}

/* ===== 일괄 액션 ===== */
if($bulkChangeBtn) $bulkChangeBtn.addEventListener('click', ()=>{
  if(state.selectedIds.size===0) return;
  openCategoryDialog([...state.selectedIds]);
});
if($bulkDeleteBtn) $bulkDeleteBtn.addEventListener('click', ()=>{
  if(state.selectedIds.size===0) return;
  onBulkDelete([...state.selectedIds]);
});
if($catSaveBtn){
  $catSaveBtn.addEventListener('click', async (e)=>{
    e.preventDefault();
    await saveCategoryDialog();
  });
}

/* ===== 인덱스 에러 배너 ===== */
function showIndexBanner(err){
  if(!$banner) return;
  const msg = String(err?.message||'');
  const m = msg.match(/https:\/\/console\.firebase\.google\.com[^\s)"]+/);
  const link = m ? m[0] : '';
  $banner.style.display = '';
  $banner.innerHTML = link
    ? `정렬/필터에 필요한 색인이 없습니다. 콘솔에서 색인을 생성해 주세요: <a href="${link}" target="_blank" rel="noopener">색인 만들기</a>`
    : `정렬/필터에 필요한 색인이 없습니다. Firestore 콘솔에서 색인을 생성해 주세요.`;
}

/* ===== 초기 상태 복원 ===== */
loadPrefs();
if(state.cat) $catSelect.value = state.cat;
if(state.kw){ $keyword.value = state.kw; }
const seriesInit = isSeriesCategory(state.cat);
if($seriesSortFields) $seriesSortFields.style.display = seriesInit ? '' : 'none';
updateDirToggleLabel(state.sortField, state.sortDir);

/* ===== 무한 스크롤 ===== */
if('IntersectionObserver' in window && $sentinel){
  state.io = new IntersectionObserver((entries)=>{
    for(const e of entries){
      if(e.isIntersecting && !state.loading && !state.reachedEnd){
        loadMore();
      }
    }
  }, { rootMargin: '200px' });
  state.io.observe($sentinel);
}

/* ===== 쿼리 빌드 ===== */
function buildQuery({ cat, sortField, sortDir, pageStart }){
  const baseCol = collection(db, 'videos');
  const parts = [];
  if(cat) parts.push(where('cats','array-contains',cat));
  parts.push(orderBy(sortField, sortDir==='asc'?'asc':'desc'));
  if(pageStart) parts.push(startAfter(pageStart));
  parts.push(limit(PAGE_SIZE));
  return query(baseCol, ...parts);
}

/* ===== 로딩 ===== */
async function resetAndLoad(){
  if(state.loading) return;
  state.items = [];
  state.lastDoc = null;
  state.reachedEnd = false;
  state.selectedIds.clear();
  syncBulkButtons();

  $list.innerHTML = '';
  if($empty) $empty.hidden = true;
  if($more) $more.disabled = true;
  if($banner) $banner.style.display = 'none';

  await loadMore(true);
}

async function loadMore(first=false){
  if(state.loading || state.reachedEnd) return;
  state.loading = true;

  try{
    const q = buildQuery({
      cat: state.cat,
      sortField: state.sortField,
      sortDir: state.sortDir,
      pageStart: state.lastDoc
    });
    const snap = await getDocs(q);
    const docs = snap.docs;
    if(docs.length===0){
      if(first && $list.childElementCount===0){
        $empty.hidden = false;
      }
      state.reachedEnd = true;
      if($more) $more.disabled = true;
      return;
    }
    state.lastDoc = docs[docs.length-1];

    const batch = docs.map(d => ({ id: d.id, ...d.data() }));
    state.items.push(...batch);

    renderList(batch, /*append=*/true);
    applyClientSearch(); // 키워드 즉시 반영

    if($more) $more.disabled = !state.lastDoc;
  }catch(err){
    console.error('[list] 로드 오류:', err);
    showIndexBanner(err);
    alert('목록 불러오기 중 오류가 발생했습니다. 인덱스가 필요한 경우 콘솔 안내 링크로 생성해 주세요.');
  }finally{
    state.loading = false;

    // 첫 로드시 스크롤 복원
    if(!state.restoringScroll){
      state.restoringScroll = true;
      const y = loadScrollY();
      if(y>0) setTimeout(()=> window.scrollTo(0,y), 0);
    }
  }
}

/* ===== 검색: 클라이언트 필터 ===== */
function applyClientSearch(){
  const q = (state.kw||'').trim().toLowerCase();
  const nodes = Array.from($list.children);
  if(!q){
    nodes.forEach(n=> n.style.display='');
    return;
  }
  nodes.forEach(n=>{
    const title = $('.title', n)?.textContent?.toLowerCase()||'';
    const url   = $('.url', n)?.textContent?.toLowerCase()||'';
    n.style.display = (title.includes(q) || url.includes(q)) ? '' : 'none';
  });
}

/* ===== 렌더 ===== */
function renderList(items, append){
  const frag = document.createDocumentFragment();
  for(const v of items){
    frag.appendChild(renderItem(v));
  }
  if(append) $list.appendChild(frag);
  else { $list.innerHTML=''; $list.appendChild(frag); }
}

function renderItem(v){
  const li = document.createElement('article');
  li.className = 'item';

  // 좌측 체크
  const colCheck = document.createElement('div');
  colCheck.className = 'col-check';
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.dataset.id = v.id;
  cb.addEventListener('change', ()=>{
    if(cb.checked) state.selectedIds.add(v.id);
    else state.selectedIds.delete(v.id);
    syncBulkButtons();
  });
  colCheck.appendChild(cb);

  // 메인
  const colMain = document.createElement('div');
  colMain.className = 'col-main';

  const title = document.createElement('div');
  title.className = 'title';
  title.textContent = v.title || '(제목 없음)';
  title.title = v.title || '';

  const url = document.createElement('div');
  url.className = 'url';
  url.textContent = v.url || '';
  url.title = v.url || '';

  const chips = document.createElement('div');
  chips.className = 'chips';
  (v.cats||[]).forEach(c=>{
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = labelFromCat(c);
    chips.appendChild(chip);
  });

  const meta = document.createElement('div');
  meta.className = 'meta';
  if(v.createdAt?.toDate){
    meta.appendChild(textNode(fmtDateTime(v.createdAt.toDate())));
  }else{
    meta.appendChild(textNode('-'));
  }
  if(v.seriesKey){
    const s = document.createElement('span');
    s.className = 'series-badge';
    s.textContent = v.seriesTitle ? `시리즈: ${v.seriesTitle}` : '시리즈';
    meta.appendChild(s);
    if(typeof v.episode === 'number'){
      const e = document.createElement('span');
      e.className = 'episode-badge';
      e.textContent = `EP ${v.episode}`;
      meta.appendChild(e);
    }
  }

  colMain.appendChild(title);
  colMain.appendChild(url);
  colMain.appendChild(chips);
  colMain.appendChild(meta);

  // 우측
  const colSide = document.createElement('div');
  colSide.className = 'col-side';

  const thumb = document.createElement('img');
  thumb.className = 'thumb';
  thumb.alt = '썸네일';
  thumb.referrerPolicy = 'no-referrer';
  thumb.loading = 'lazy';
  thumb.src = v.thumb || guessThumb(v.url);
  thumb.onerror = ()=> { thumb.src = './image/copytube_logo_512.png'; };

  const actions = document.createElement('div');
  actions.className = 'actions';

  const btnWatch = document.createElement('button');
  btnWatch.className = 'btn';
  btnWatch.textContent = '보기';
  btnWatch.addEventListener('click', (e)=>{
    e.stopPropagation();
    const qp = new URLSearchParams();
    // id 우선(문서 기반 재생), 부가로 v/series 전달
    qp.set('id', v.id);
    const vid = extractYouTubeId(v.url);
    if(vid) qp.set('v', vid);
    if(v.seriesKey) qp.set('series', v.seriesKey);
    location.href = `./watch.html?${qp.toString()}`;
  });

  const btnCat = document.createElement('button');
  btnCat.className = 'btn btn-ghost';
  btnCat.textContent = '카테고리';
  btnCat.addEventListener('click', (e)=>{
    e.stopPropagation();
    openCategoryDialog([v.id], v.cats||[]);
  });

  const btnDel = document.createElement('button');
  btnDel.className = 'btn btn-ghost';
  btnDel.textContent = '삭제';
  btnDel.addEventListener('click', async (e)=>{
    e.stopPropagation();
    await onBulkDelete([v.id]);
  });

  // 권한: 본인 또는 관리자만 수정/삭제 허용
  if(!(canEdit(v))){
    btnCat.disabled = true;
    btnDel.disabled = true;
  }

  actions.appendChild(btnWatch);
  actions.appendChild(btnCat);
  actions.appendChild(btnDel);

  colSide.appendChild(thumb);
  colSide.appendChild(actions);

  // 전체 아이템 클릭 → 보기
  li.addEventListener('click', ()=>{
    const qp = new URLSearchParams();
    qp.set('id', v.id);
    const vid = extractYouTubeId(v.url);
    if(vid) qp.set('v', vid);
    if(v.seriesKey) qp.set('series', v.seriesKey);
    location.href = `./watch.html?${qp.toString()}`;
  });

  li.appendChild(colCheck);
  li.appendChild(colMain);
  li.appendChild(colSide);

  return li;
}

function canEdit(v){
  if(!state.user) return false;
  if(state.isAdmin) return true;
  return v.ownerUid && v.ownerUid === state.user.uid;
}

function syncBulkButtons(){
  const count = state.selectedIds.size;
  if($selCount) $selCount.textContent = `선택 ${count}`;
  const can = count>0;
  if($bulkChangeBtn) $bulkChangeBtn.disabled = !can;
  if($bulkDeleteBtn) $bulkDeleteBtn.disabled = !can;
  // 권한 없는 경우 버튼 비활성(선택 개수와 무관)
  if(!state.user && $bulkChangeBtn) $bulkChangeBtn.disabled = true;
  if(!state.user && $bulkDeleteBtn) $bulkDeleteBtn.disabled = true;
}

/* ===== 카테고리 다이얼로그 ===== */
function openCategoryDialog(targetIds, currentCats=[]){
  if(!$catDialog) return;
  $catDialog.dataset.target = JSON.stringify(targetIds);
  renderCatDialogOptions(currentCats);
  $catDialog.showModal();
}
function renderCatDialogOptions(selectedCats){
  $catDialogBody.innerHTML = '';
  for(const [, group] of Object.entries(CATEGORIES)){
    const h = document.createElement('div');
    h.style.cssText = 'margin:6px 0 2px; opacity:.85; font-weight:700;';
    h.textContent = group.label || '';
    $catDialogBody.appendChild(h);

    for(const item of (group.items||[])){
      const id = `dlg_${item.value}`;
      const row = document.createElement('label');
      row.style.cssText = 'display:flex; gap:8px; align-items:center; margin:2px 0;';
      const chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.id = id;
      chk.value = item.value;
      chk.checked = selectedCats.includes(item.value);
      const span = document.createElement('span');
      span.textContent = item.label || item.value;
      row.appendChild(chk);
      row.appendChild(span);
      $catDialogBody.appendChild(row);
    }
  }
}

async function saveCategoryDialog(){
  const targetIds = JSON.parse($catDialog.dataset.target||'[]');
  const checks = Array.from($catDialogBody.querySelectorAll('input[type=checkbox]'));
  const newCats = checks.filter(ch=> ch.checked).map(ch=> ch.value);

  // 권한 확인(모든 타겟이 본인 또는 관리자)
  const editableIds = [];
  for(const id of targetIds){
    const v = state.items.find(x=> x.id===id);
    if(v && canEdit(v)) editableIds.push(id);
  }
  if(editableIds.length===0){
    alert('변경할 권한이 없습니다.');
    return;
  }
  try{
    await Promise.all(editableIds.map(id=> updateDoc(doc(db,'videos',id), { cats: newCats })));
    // UI 동기화
    for(const v of state.items){
      if(editableIds.includes(v.id)) v.cats = newCats.slice();
    }
    renderList(state.items, /*append=*/false);
    applyClientSearch();
  }catch(err){
    console.error('[list] 카테고리 변경 오류:', err);
    alert('카테고리 변경 중 오류가 발생했습니다.');
  }
}

/* ===== 삭제 ===== */
async function onBulkDelete(ids){
  // 권한 필터
  const dels = ids.filter(id=>{
    const v = state.items.find(x=> x.id===id);
    return v && canEdit(v);
  });
  if(dels.length===0){ alert('삭제할 권한이 없습니다.'); return; }
  if(!confirm(`정말로 ${dels.length}개 항목을 삭제할까요?`)) return;

  try{
    await Promise.all(dels.map(id=> deleteDoc(doc(db,'videos',id))));
    state.items = state.items.filter(v=> !dels.includes(v.id));
    // 선택 상태 정리
    dels.forEach(id=> state.selectedIds.delete(id));
    syncBulkButtons();
    renderList(state.items, /*append=*/false);
    applyClientSearch();
  }catch(err){
    console.error('[list] 삭제 오류:', err);
    alert('삭제 중 오류가 발생했습니다.');
  }
}

/* ===== 유틸 ===== */
function labelFromCat(value){
  for(const [, group] of Object.entries(CATEGORIES)){
    for(const item of (group.items||[])){
      if(item.value===value) return item.label || value;
    }
  }
  return value;
}
function fmtDateTime(d){
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  const hh = String(d.getHours()).padStart(2,'0');
  const mm = String(d.getMinutes()).padStart(2,'0');
  return `${y}-${m}-${day} ${hh}:${mm}`;
}
function extractYouTubeId(url){
  try{
    if(!url) return '';
    const u = new URL(url);
    if(u.hostname==='youtu.be'){
      return u.pathname.slice(1);
    }
    if(u.hostname.includes('youtube.com')){
      // /watch?v=, /live/, /shorts/
      if(u.searchParams.get('v')) return u.searchParams.get('v');
      const m = u.pathname.match(/\/(live|shorts|embed)\/([^/?#]+)/);
      if(m) return m[2];
    }
  }catch{}
  return '';
}
function guessThumb(url){
  const vid = extractYouTubeId(url);
  return vid ? `https://i.ytimg.com/vi/${vid}/hqdefault.jpg` : './image/copytube_logo_512.png';
}

/* ===== 초기 로드 ===== */
(async function init(){
  // 프리셋 UI 반영
  if(state.cat) $catSelect.value = state.cat;
  if(state.kw)  $keyword.value   = state.kw;

  // 시리즈 그룹이면 라디오 노출
  if($seriesSortFields) $seriesSortFields.style.display = isSeriesCategory(state.cat) ? '' : 'none';

  // 첫 로드
  await resetAndLoad();

  // 스크롤 복원 이벤트
  window.addEventListener('beforeunload', saveScrollY);
  window.addEventListener('scroll', ()=> {
    // 과도 저장 방지: 간단 스로틀
    if(!state._scrollTick){
      state._scrollTick = true;
      requestAnimationFrame(()=> { saveScrollY(); state._scrollTick = false; });
    }
  });
})();
