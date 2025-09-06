// js/index.js (kidsani hotfix)
// - categories.js?v=1.5.1 로딩 실패 시 ./categories.js로 재시도
// - 실패해도 UI 나머지는 동작(에러 안내 표시)
// - 시리즈 토글/전체선택 제외/개인 단독 포함 (원본 기능 유지)

import { auth } from './firebase-init.js?v=1.5.1';
import { onAuthStateChanged, signOut as fbSignOut } from './auth.js?v=1.5.1';

// ---------- 안전한 categories 모듈 로딩 ----------
let CATEGORY_GROUPS = [];
async function loadCategories(){
  try {
    const m = await import('./categories.js?v=1.5.1');
    CATEGORY_GROUPS = m.CATEGORY_GROUPS || [];
    // 시리즈 헬퍼가 있으면 그대로 사용, 없으면 폴백
    isSeriesGroupKey = m.isSeriesGroupKey || isSeriesGroupKey;
    getSeriesOrderDefault = m.getSeriesOrderDefault || getSeriesOrderDefault;
  } catch (e1) {
    console.warn('[KidsAni] fallback categories import', e1);
    try {
      const m2 = await import('./categories.js');
      CATEGORY_GROUPS = m2.CATEGORY_GROUPS || [];
      isSeriesGroupKey = m2.isSeriesGroupKey || isSeriesGroupKey;
      getSeriesOrderDefault = m2.getSeriesOrderDefault || getSeriesOrderDefault;
    } catch (e2) {
      console.error('[KidsAni] categories import failed twice', e2);
      CATEGORY_GROUPS = [];
    }
  }
}

// ---------- 공통 상수/도우미 ----------
const GROUP_ORDER_KEY   = 'groupOrderV1';
const ORDER_PREF_PREFIX = 'orderMode:'; // 'orderMode:<groupKey>' = 'created' | 'latest'
const isPersonalVal = (v)=> v==='personal_1' || v==='personal_2' || v==='personal1' || v==='personal2';

// 시리즈 판별(폴백): key가 series_로 시작하거나 localStorage 등록 목록에 있으면 시리즈
function getSeriesKeySet(){
  try{
    const raw = localStorage.getItem('seriesGroupKeys');
    const arr = JSON.parse(raw || '[]');
    return new Set(Array.isArray(arr)?arr:[]);
  }catch{ return new Set(); }
}
function isSeriesGroupKey(k){
  const set = getSeriesKeySet();
  return typeof k === 'string' && (k.startsWith('series_') || set.has(k));
}
function getSeriesOrderDefault(){ return 'created'; }
function getOrderMode(groupKey){
  if(!isSeriesGroupKey(groupKey)) return 'created';
  const saved = localStorage.getItem(ORDER_PREF_PREFIX + groupKey);
  return (saved==='latest' || saved==='created') ? saved : getSeriesOrderDefault(groupKey);
}
function toggleOrderMode(groupKey){
  const cur = getOrderMode(groupKey);
  const next = (cur==='created') ? 'latest' : 'created';
  localStorage.setItem(ORDER_PREF_PREFIX + groupKey, next);
  const btn = document.querySelector(`.order-toggle[data-group="${groupKey}"]`);
  if(btn) btn.textContent = (next==='created') ? '등록순' : '최신순';
}

// 전역 내비 중복 방지
window.__swipeNavigating = window.__swipeNavigating || false;

/* ---------- group order ---------- */
function applyGroupOrder(groups){
  let saved = null;
  try{ saved = JSON.parse(localStorage.getItem(GROUP_ORDER_KEY) || 'null'); }catch{}
  const order = Array.isArray(saved) && saved.length ? saved : groups.map(g=>g.key);
  const idx = new Map(order.map((k,i)=>[k,i]));
  return groups.slice().sort((a,b)=>(idx.get(a.key)??999) - (idx.get(b.key)??999));
}

/* ---------- personal labels (local) ---------- */
function getPersonalLabels(){
  try { return JSON.parse(localStorage.getItem('personalLabels') || '{}'); }
  catch { return {}; }
}

/* ---------- topbar ---------- */
const signupLink   = document.getElementById("signupLink");
const signinLink   = document.getElementById("signinLink");
const welcome      = document.getElementById("welcome");
const menuBtn      = document.getElementById("menuBtn");
const dropdown     = document.getElementById("dropdownMenu");
const btnSignOut   = document.getElementById("btnSignOut");
const btnGoUpload  = document.getElementById("btnGoUpload");
const btnMyUploads = document.getElementById("btnMyUploads");
const btnAbout     = document.getElementById("btnAbout");
const btnOrder     = document.getElementById("btnOrder");
const btnList      = document.getElementById("btnList");
const brandHome    = document.getElementById("brandHome");

let isMenuOpen=false;
function openDropdown(){ isMenuOpen=true; dropdown?.classList.remove("hidden"); requestAnimationFrame(()=> dropdown?.classList.add("show")); }
function closeDropdown(){ isMenuOpen=false; dropdown?.classList.remove("show"); setTimeout(()=> dropdown?.classList.add("hidden"),180); }

onAuthStateChanged(auth,(user)=>{
  const loggedIn = !!user;
  signupLink?.classList.toggle("hidden", loggedIn);
  signinLink?.classList.toggle("hidden", loggedIn);
  if (welcome) welcome.textContent = loggedIn ? `Welcome! ${user.displayName || '회원'}` : "";
  closeDropdown();
});
menuBtn?.addEventListener("click",(e)=>{ e.stopPropagation(); dropdown?.classList.contains("hidden") ? openDropdown() : closeDropdown(); });
document.addEventListener('pointerdown',(e)=>{ if(!dropdown || dropdown.classList.contains('hidden')) return; if(!e.target.closest('#dropdownMenu, #menuBtn')) closeDropdown(); }, true);
document.addEventListener('keydown',(e)=>{ if(e.key==='Escape') closeDropdown(); });
dropdown?.addEventListener("click",(e)=> e.stopPropagation());
btnMyUploads ?.addEventListener("click", ()=>{ location.href = "manage-uploads.html"; closeDropdown(); });
btnGoUpload  ?.addEventListener("click", ()=>{ location.href = "upload.html"; closeDropdown(); });
btnAbout     ?.addEventListener("click", ()=>{ location.href = "about.html"; closeDropdown(); });
btnOrder     ?.addEventListener("click", ()=>{ location.href = "category-order.html"; closeDropdown(); });
btnSignOut   ?.addEventListener("click", async ()=>{ if(!auth.currentUser){ location.href='signin.html'; return; } await fbSignOut(auth); closeDropdown(); });
btnList      ?.addEventListener("click", ()=>{ location.href = "list.html"; closeDropdown(); });
brandHome    ?.addEventListener("click",(e)=>{ e.preventDefault(); window.scrollTo({top:0,behavior:"smooth"}); });

/* === 연속재생(autonext) === */
(function setupAutoNext(){
  const KEY='autonext', $auto=document.getElementById('cbAutoNext');
  if(!$auto) return;
  const read=()=>{ const v=(localStorage.getItem(KEY)||'').toLowerCase(); return v==='1'||v==='true'||v==='on'; };
  const write=(on)=> localStorage.setItem(KEY, on?'1':'0');
  if(localStorage.getItem(KEY)!=null){ $auto.checked = read(); } else { write($auto.checked); }
  $auto.addEventListener('change', ()=> write($auto.checked));
  window.addEventListener('storage', (e)=>{ if(e.key===KEY) $auto.checked = read(); });
})();

/* ---------- cats ---------- */
const catsBox      = document.getElementById("cats");
const btnWatch     = document.getElementById("btnWatch");
const cbAutoNext   = document.getElementById("cbAutoNext");
const cbToggleAll  = document.getElementById("cbToggleAll");
const catTitleBtn  = document.getElementById("btnOpenOrder");

function safeGroups(){
  if (!Array.isArray(CATEGORY_GROUPS) || CATEGORY_GROUPS.length===0){
    console.error('[KidsAni] CATEGORY_GROUPS empty.');
    catsBox && (catsBox.innerHTML = `<div class="muted" style="padding:8px;">카테고리를 불러오지 못했습니다. <code>js/categories.js?v=1.5.1</code> 경로/배포를 확인하세요.</div>`);
    return [];
  }
  return CATEGORY_GROUPS;
}

function renderGroups(){
  const groups = applyGroupOrder(safeGroups());
  if (groups.length===0) return;

  const personalLabels = getPersonalLabels();

  const html = groups.map(g=>{
    const isPersonalGroup = g.key==='personal';
    const isSeriesGroup   = isSeriesGroupKey(g.key);

    const kids = g.children.map(c=>{
      const labelText = (isPersonalGroup && personalLabels[c.value]) ? personalLabels[c.value] : c.label;
      return `<label><input type="checkbox" class="cat" value="${c.value}"> ${labelText}</label>`;
    }).join('');

    const baseToggle = isPersonalGroup
      ? `<span style="font-weight:800;">${g.label}</span> <span class="muted">(로컬저장소)</span>`
      : `<label class="group-toggle">
           <input type="checkbox" class="group-check" data-group="${g.key}" />
           <span>${g.label}</span>
         </label>`;

    const orderBtn = (!isPersonalGroup && isSeriesGroup)
      ? `<button type="button" class="group-toggle order-toggle" data-group="${g.key}" aria-label="정렬 전환">
           ${getOrderMode(g.key)==='created' ? '등록순' : '최신순'}
         </button>`
      : '';

    const legendHTML = isPersonalGroup
      ? `<legend>${baseToggle}</legend>`
      : `<legend style="display:flex; gap:8px; align-items:center;">${baseToggle}${orderBtn}</legend>`;

    const noteHTML = isPersonalGroup
      ? `<div class="muted" style="margin:6px 4px 2px;">개인자료는 <b>단독 재생만</b> 가능합니다.</div>`
      : '';

    const seriesAttr = isSeriesGroup ? ' data-series="1"' : ' data-series="0"';

    return `
      <fieldset class="group" data-key="${g.key}"${seriesAttr}>
        ${legendHTML}
        <div class="child-grid">${kids}</div>
        ${noteHTML}
      </fieldset>
    `;
  }).join('');

  catsBox.innerHTML = html;
  bindGroupInteractions();
}

/* ---------- parent/child sync ---------- */
function setParentStateByChildren(groupEl){
  const parent = groupEl.querySelector('.group-check');
  if(!parent) return;
  const children = Array.from(groupEl.querySelectorAll('input.cat'));
  const total = children.length;
  const checked = children.filter(c=>c.checked).length;
  if(checked===0){ parent.checked=false; parent.indeterminate=false; }
  else if(checked===total){ parent.checked=true; parent.indeterminate=false; }
  else { parent.checked=false; parent.indeterminate=true; }
}
function setChildrenByParent(groupEl,on){
  groupEl.querySelectorAll('input.cat').forEach(c=> c.checked=!!on);
}
function refreshAllParentStates(){
  catsBox.querySelectorAll('.group').forEach(setParentStateByChildren);
}
function computeAllSelected(){
  const real = Array.from(catsBox.querySelectorAll('.group[data-series="0"]:not([data-key="personal"]) input.cat'));
  return real.length>0 && real.every(c=>c.checked);
}
let allSelected=false;

function bindGroupInteractions(){
  catsBox.querySelectorAll('.group-check').forEach(parent=>{
    parent.addEventListener('change', ()=>{
      const groupEl = parent.closest('.group');
      setChildrenByParent(groupEl, parent.checked);
      setParentStateByChildren(groupEl);
      allSelected = computeAllSelected();
      if (cbToggleAll) cbToggleAll.checked = allSelected;
      catsBox.querySelectorAll('.group[data-key="personal"] input.cat:checked').forEach(c=> c.checked=false);
    });
  });

  catsBox.querySelectorAll('.order-toggle').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const gk = btn.getAttribute('data-group');
      toggleOrderMode(gk);
    });
  });

  catsBox.querySelectorAll('input.cat').forEach(child=>{
    child.addEventListener('change', ()=>{
      const v = child.value;
      const isPersonal = isPersonalVal(v);

      if (isPersonal && child.checked){
        catsBox.querySelectorAll('.group[data-key="personal"] input.cat').forEach(c=>{ if(c!==child) c.checked=false; });
        catsBox.querySelectorAll('.group:not([data-key="personal"]) input.cat:checked').forEach(c=> c.checked=false);
      }
      if (!isPersonal && child.checked){
        catsBox.querySelectorAll('.group[data-key="personal"] input.cat:checked').forEach(c=> c.checked=false);
      }

      const groupEl = child.closest('.group');
      setParentStateByChildren(groupEl);
      refreshAllParentStates();

      allSelected = computeAllSelected();
      if (cbToggleAll) cbToggleAll.checked = allSelected;
    });
  });
}

/* ---------- select all & load saved ---------- */
function selectAll(on){
  catsBox
    .querySelectorAll('.group[data-series="0"]:not([data-key="personal"]) input.cat')
    .forEach(b => { b.checked = !!on; });

  catsBox.querySelectorAll('.group[data-key="personal"] input.cat:checked, .group[data-series="1"] input.cat:checked')
    .forEach(c => { c.checked = false; });

  refreshAllParentStates();
  allSelected = !!on;
  if (cbToggleAll) cbToggleAll.checked = allSelected;
}
function applySavedSelection(){
  let saved = null;
  try{ saved = JSON.parse(localStorage.getItem('selectedCats')||'null'); }catch{}
  if (!saved || saved==="ALL"){ selectAll(true); }
  else{
    selectAll(false);
    const set = new Set(saved);
    catsBox.querySelectorAll('.cat').forEach(ch=>{ if (set.has(ch.value)) ch.checked=true; });
    const personals = Array.from(catsBox.querySelectorAll('.group[data-key="personal"] input.cat:checked'));
    const normals   = Array.from(catsBox.querySelectorAll('.group:not([data-key="personal"]) input.cat:checked'));
    if (personals.length >= 1 && normals.length >= 1){
      personals.forEach(c=> c.checked=false);
    }else if (personals.length >= 2){
      personals.slice(1).forEach(c=> c.checked=false);
    }
    refreshAllParentStates();
  }
  const vv = (localStorage.getItem('autonext') || '').toLowerCase();
  if (cbAutoNext) cbAutoNext.checked = (vv==='1' || vv==='true' || vv==='on');
}

/* ---------- go watch ---------- */
function persistSelectedCatsForList(){
  const selected = Array.from(document.querySelectorAll('.cat:checked')).map(c=>c.value);
  const personals = selected.filter(isPersonalVal);
  const normals   = selected.filter(v=> !isPersonalVal(v));

  if (personals.length === 1 && normals.length === 0) {
    localStorage.setItem('selectedCats', JSON.stringify(personals));
    return;
  }
  const isAll = computeAllSelected() === true;
  const valueToSave = (normals.length===0 || isAll) ? "ALL" : normals;
  localStorage.setItem('selectedCats', JSON.stringify(valueToSave));
}

function wireCTA(){
  const btnWatch = document.getElementById('btnWatch');
  btnWatch?.addEventListener('click', ()=>{
    sessionStorage.removeItem('playQueue'); sessionStorage.removeItem('playIndex');

    const selected = Array.from(document.querySelectorAll('.cat:checked')).map(c=>c.value);
    const personals = selected.filter(isPersonalVal);
    const normals   = selected.filter(v=> !isPersonalVal(v));

    if (personals.length === 1 && normals.length === 0){
      localStorage.setItem('selectedCats', JSON.stringify(personals));
      localStorage.setItem('autonext', cbAutoNext?.checked ? '1' : '0');
      location.href = `watch.html?cats=${encodeURIComponent(personals[0])}`;
      return;
    }

    const isAll = computeAllSelected();
    const valueToSave = (normals.length===0 || isAll) ? "ALL" : normals;
    localStorage.setItem('selectedCats', JSON.stringify(valueToSave));
    localStorage.setItem('autonext', cbAutoNext?.checked ? '1' : '0');

    const seriesOrderHints = {};
    applyGroupOrder(CATEGORY_GROUPS).forEach(g=>{
      if(isSeriesGroupKey(g.key)) seriesOrderHints[g.key] = getOrderMode(g.key);
    });
    sessionStorage.setItem('seriesOrderHints', JSON.stringify(seriesOrderHints));

    location.href = 'watch.html';
  });

  document.getElementById('cbToggleAll')?.addEventListener('change', (e)=> selectAll(!!e.target.checked));
  document.getElementById('btnOpenOrder')?.addEventListener('click', ()=> location.href='category-order.html');
}

/* ===================== */
/* 단순형 스와이프 */
/* ===================== */
function initSwipeNav({ goLeftHref=null, goRightHref=null, animateMs=260, deadZoneCenterRatio=0.30 } = {}){
  let sx=0, sy=0, t0=0, tracking=false;
  const THRESH_X = 70, MAX_OFF_Y = 80, MAX_TIME = 600;
  const getPoint=(e)=> e.touches?.[0] || e.changedTouches?.[0] || e;

  function onStart(e){
    const p=getPoint(e); if(!p) return;
    const vw=Math.max(document.documentElement.clientWidth, window.innerWidth||0);
    const dz=Math.max(0, Math.min(0.9, deadZoneCenterRatio));
    const L=vw*(0.5-dz/2), R=vw*(0.5+dz/2);
    if (p.clientX>=L && p.clientX<=R) { tracking=false; return; }
    sx=p.clientX; sy=p.clientY; t0=Date.now(); tracking=true;
  }
  function onEnd(e){
    if(!tracking) return; tracking=false;
    if (window.__swipeNavigating) return;
    const p=getPoint(e), dx=p.clientX-sx, dy=p.clientY-sy, dt=Date.now()-t0;
    if (Math.abs(dy)>MAX_OFF_Y || dt>MAX_TIME) return;
    if (dx<=-THRESH_X && goLeftHref){
      window.__swipeNavigating=true; document.documentElement.classList.add('slide-out-left');
      setTimeout(()=> location.href=goLeftHref, animateMs);
    } else if (dx>=THRESH_X && goRightHref){
      window.__swipeNavigating=true; persistSelectedCatsForList();
      document.documentElement.classList.add('slide-out-right');
      setTimeout(()=> location.href=goRightHref, animateMs);
    }
  }
  document.addEventListener('touchstart', onStart, { passive:true });
  document.addEventListener('touchend',   onEnd,   { passive:true });
  document.addEventListener('pointerdown',onStart, { passive:true });
  document.addEventListener('pointerup',  onEnd,   { passive:true });
}
initSwipeNav({ goLeftHref:'upload.html', goRightHref:'list.html', deadZoneCenterRatio:0.30 });

/* ===================== */
/* 고급형 스와이프 */
/* ===================== */
(function(){
  function initDragSwipe({ goLeftHref=null, goRightHref=null, threshold=60, slop=45, timeMax=700, feel=1.0, deadZoneCenterRatio=0.15 }={}){
    const page=document.querySelector('main')||document.body; if(!page) return;
    if(!page.style.willChange || !page.style.willChange.includes('transform')){
      page.style.willChange = (page.style.willChange ? page.style.willChange + ', transform' : 'transform');
    }
    let x0=0,y0=0,t0=0,active=false,canceled=false;
    const isInteractive=(el)=> !!(el && (el.closest('input,textarea,select,button,a,[role="button"],[contenteditable="true"]')));

    function reset(anim=true){ if(anim) page.style.transition='transform 180ms ease';
      requestAnimationFrame(()=>{ page.style.transform='translateX(0px)'; });
      setTimeout(()=>{ if(anim) page.style.transition=''; },200);
    }

    function start(e){
      if (window.__swipeNavigating) return;
      const t=(e.touches&&e.touches[0])||(e.pointerType?e:null); if(!t) return;
      if(isInteractive(e.target)) return;
      const vw=Math.max(document.documentElement.clientWidth, window.innerWidth||0);
      const dz=Math.max(0, Math.min(0.9, deadZoneCenterRatio));
      const L=vw*(0.5-dz/2), R=vw*(0.5+dz/2);
      if (t.clientX>=L && t.clientX<=R) return;
      x0=t.clientX; y0=t.clientY; t0=Date.now(); active=true; canceled=false; page.style.transition='none';
    }

    function move(e){
      if(!active) return;
      const t=(e.touches&&e.touches[0])||(e.pointerType?e:null); if(!t) return;
      const dx=t.clientX-x0, dy=t.clientY-y0;
      if(Math.abs(dy)>slop){ canceled=true; active=false; reset(true); return; }
      e.preventDefault(); page.style.transform='translateX('+(dx*feel)+'px)';
    }

    function end(e){
      if(!active) return; active=false;
      const t=(e.changedTouches&&e.changedTouches[0])||(e.pointerType?e:null); if(!t) return;
      const dx=t.clientX-x0, dy=t.clientY-y0, dt=Date.now()-t0;
      if(canceled || Math.abs(dy)>slop || dt>timeMax){ reset(true); return; }
      if(dx>=threshold && goRightHref){
        window.__swipeNavigating=true; persistSelectedCatsForList();
        page.style.transition='transform 160ms ease'; page.style.transform='translateX(100vw)';
        setTimeout(()=>{ location.href=goRightHref; },150);
      } else if(dx<=-threshold && goLeftHref){
        window.__swipeNavigating=true; page.style.transition='transform 160ms ease'; page.style.transform='translateX(-100vw)';
        setTimeout(()=>{ location.href=goLeftHref; },150);
      } else { reset(true); }
    }

    document.addEventListener('touchstart',  start, { passive:true });
    document.addEventListener('touchmove',   move,  { passive:false });
    document.addEventListener('touchend',    end,   { passive:true, capture:true });
    document.addEventListener('pointerdown', start, { passive:true });
    document.addEventListener('pointermove', move,  { passive:false });
    document.addEventListener('pointerup',   end,   { passive:true, capture:true });
  }
  initDragSwipe({ goLeftHref:'upload.html', goRightHref:'list.html', threshold:60, slop:45, timeMax:700, feel:1.0, deadZoneCenterRatio:0.15 });
})();

/* ---------- 부팅 ---------- */
(async function boot(){
  await loadCategories();      // ← 여기서 모듈 로딩 실패해도 페이지 나머지는 살려둠
  renderGroups();
  applySavedSelection();
  wireCTA();
})();
