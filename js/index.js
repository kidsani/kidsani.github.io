// js/index.js (v1.8.1) — KidsAni
// - 'series' 단일 키가 아닌 여러 시리즈 그룹을 지원 (data-series 플래그 기반)
// - 전체선택 시 personal/series 그룹 제외
// - 시리즈별 정렬 칩(등록순/최신순) 단일 토글 + 로컬 저장(seriesSortPrefs)
// - 기존 기능(연속재생, 드롭다운, 스와이프, 개인자료 단독선택 등) 유지

import { CATEGORY_GROUPS } from './categories.js?v=0.2.1';
import { auth } from './firebase-init.js?v=0.1.0';
import { onAuthStateChanged, signOut as fbSignOut } from './auth.js?v=0.1.0';

const GROUP_ORDER_KEY = 'groupOrderV1';
const SERIES_SORT_PREFS_KEY = 'seriesSortPrefs'; // { [categoryValue]: "registered" | "latest" }
const isPersonalVal = (v)=> v==='personal1' || v==='personal2';

/* ---------- series sort prefs ---------- */
function loadSeriesPrefs(){
  try{ return JSON.parse(localStorage.getItem(SERIES_SORT_PREFS_KEY) || '{}'); }
  catch{ return {}; }
}
function saveSeriesPrefs(p){ localStorage.setItem(SERIES_SORT_PREFS_KEY, JSON.stringify(p||{})); }
function getSeriesMode(prefs, catValue){
  const m = prefs[catValue];
  return (m === 'latest' || m === 'registered') ? m : 'registered';
}
function toggleSeriesMode(prefs, catValue){
  const cur = getSeriesMode(prefs, catValue);
  const next = (cur === 'registered') ? 'latest' : 'registered';
  prefs[catValue] = next;
  saveSeriesPrefs(prefs);
  return next;
}

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
const btnList      = document.getElementById("btnList");
const brandHome    = document.getElementById("brandHome");
const btnNick      = document.getElementById("btnNick");

let isMenuOpen=false;
function openDropdown(){ isMenuOpen=true; dropdown.classList.remove("hidden"); requestAnimationFrame(()=> dropdown.classList.add("show")); }
function closeDropdown(){ isMenuOpen=false; dropdown.classList.remove("show"); setTimeout(()=> dropdown.classList.add("hidden"),180); }

onAuthStateChanged(auth,(user)=>{
  const loggedIn = !!user;
  signupLink?.classList.toggle("hidden", loggedIn);
  signinLink?.classList.toggle("hidden", loggedIn);
  welcome.textContent = loggedIn ? `Welcome! ${user.displayName || '회원'}` : "";
  closeDropdown();
});
menuBtn?.addEventListener("click",(e)=>{ e.stopPropagation(); dropdown.classList.contains("hidden") ? openDropdown() : closeDropdown(); });
document.addEventListener('pointerdown',(e)=>{ if(dropdown.classList.contains('hidden')) return; if(!e.target.closest('#dropdownMenu, #menuBtn')) closeDropdown(); }, true);
document.addEventListener('keydown',(e)=>{ if(e.key==='Escape') closeDropdown(); });
dropdown?.addEventListener("click",(e)=> e.stopPropagation());
btnMyUploads ?.addEventListener("click", ()=>{ location.href = "manage-uploads.html"; closeDropdown(); });
btnGoUpload  ?.addEventListener("click", ()=>{ location.href = "upload.html"; closeDropdown(); });
btnAbout     ?.addEventListener("click", ()=>{ location.href = "about.html"; closeDropdown(); });
btnNick      ?.addEventListener("click", ()=>{ location.href = "nick.html"; closeDropdown(); });
btnSignOut   ?.addEventListener("click", async ()=>{ if(!auth.currentUser){ location.href='signin.html'; return; } await fbSignOut(auth); closeDropdown(); });
btnList      ?.addEventListener("click", ()=>{ location.href = "list.html"; closeDropdown(); });
brandHome    ?.addEventListener("click",(e)=>{ e.preventDefault(); window.scrollTo({top:0,behavior:"smooth"}); });

/* === 연속재생(autonext) 표준 관리: index 전용 === */
(function setupAutoNext(){
  const KEY = 'autonext';
  const $auto = document.getElementById('cbAutoNext');
  if (!$auto) return;
  const read = () => ['1','true','on'].includes((localStorage.getItem(KEY)||'').toLowerCase());
  const write = (on) => localStorage.setItem(KEY, on ? '1' : '0');
  const hasSaved = localStorage.getItem(KEY) != null;
  if (hasSaved) $auto.checked = read(); else write($auto.checked);
  $auto.addEventListener('change', () => write($auto.checked));
  window.addEventListener('storage', (e)=>{ if (e.key === KEY) $auto.checked = read(); });
})();

/* ---------- cats ---------- */
const catsBox      = document.getElementById("cats");
const btnWatch     = document.getElementById("btnWatch");
const cbAutoNext   = document.getElementById("cbAutoNext");
const cbToggleAll  = document.getElementById("cbToggleAll");
const catTitleBtn  = document.getElementById("btnOpenOrder");

function isSeriesGroup(g){ return !!g.series; }

function renderGroups(){
  const groups = applyGroupOrder(CATEGORY_GROUPS);
  const personalLabels = getPersonalLabels();
  const seriesPrefs = loadSeriesPrefs();

  const html = groups.map(g=>{
    const isPersonalGroup = !!g.personal;
    const isSeries = isSeriesGroup(g);

    const kids = g.children.map(c=>{
      const labelText = isPersonalGroup && personalLabels[c.value] ? personalLabels[c.value] : c.label;
      const value = c.value;

      // 시리즈 그룹일 때만 단일 칩 토글(등록순/최신순)
      const chip = isSeries
        ? `<button type="button" class="chip-toggle" data-series-value="${value}" aria-label="정렬 전환">${getSeriesMode(seriesPrefs, value)==='latest' ? '최신순' : '등록순'}</button>`
        : '';

      return `
        <label data-value="${value}">
          <input type="checkbox" class="cat" value="${value}"> ${labelText}
          ${chip}
        </label>
      `;
    }).join('');

    // legend (개인자료는 부모 토글 없음)
    const legendHTML = isPersonalGroup
      ? `<legend><span style="font-weight:800;">${g.label}</span> <span class="muted">(로컬저장소)</span></legend>`
      : `<legend>
           <label class="group-toggle">
             <input type="checkbox" class="group-check" data-group="${g.key}" />
             <span>${g.label}</span>
           </label>
         </legend>`;

    const noteHTML = isPersonalGroup
      ? `<div class="muted" style="margin:6px 4px 2px;">시리즈와 개인자료는 <b>단독 재생만</b> 가능합니다.</div>`
      : '';

    // 플래그 속성: true일 때만 추가
    const flags = [
      isPersonalGroup ? 'data-personal="true"' : '',
      isSeries ? 'data-series="true"' : ''
    ].join(' ');

    return `
      <fieldset class="group" data-key="${g.key}" ${flags}>
        ${legendHTML}
        <div class="child-grid">${kids}</div>
        ${noteHTML}
      </fieldset>
    `;
  }).join('');

  catsBox.innerHTML = html;

  // 칩 토글 이벤트 (체크박스 토글과 충돌 방지)
  catsBox.querySelectorAll('.chip-toggle').forEach(chip=>{
    chip.addEventListener('click', (e)=>{
      e.preventDefault();
      e.stopPropagation();
      const value = chip.getAttribute('data-series-value');
      const prefs = loadSeriesPrefs();
      const next = toggleSeriesMode(prefs, value);
      chip.textContent = (next === 'latest') ? '최신순' : '등록순';
    });
  });

  bindGroupInteractions();
}
renderGroups();

/* ---------- parent/child sync ---------- */
function setParentStateByChildren(groupEl){
  const parent   = groupEl.querySelector('.group-check');
  if (!parent) return; // personal: no parent toggle
  const children = Array.from(groupEl.querySelectorAll('input.cat'));
  const total = children.length;
  const checked = children.filter(c => c.checked).length;
  if (checked===0){ parent.checked=false; parent.indeterminate=false; }
  else if (checked===total){ parent.checked=true; parent.indeterminate=false; }
  else { parent.checked=false; parent.indeterminate=true; }
}
function setChildrenByParent(groupEl,on){
  groupEl.querySelectorAll('input.cat').forEach(c=> c.checked = !!on);
}
function refreshAllParentStates(){
  catsBox.querySelectorAll('.group').forEach(setParentStateByChildren);
}
function computeAllSelected(){
  // personal/series 플래그가 없는 '일반' 그룹만 대상으로 모두 선택됐는지 확인
  const real = Array.from(
    catsBox.querySelectorAll('.group:not([data-personal]):not([data-series]) input.cat')
  );
  return real.length > 0 && real.every(c => c.checked);
}
let allSelected=false;

function bindGroupInteractions(){
  // parent toggles (개인자료 제외)
  catsBox.querySelectorAll('.group-check').forEach(parent=>{
    const groupEl = parent.closest('.group');
    if (groupEl?.hasAttribute('data-personal')) return;
    parent.addEventListener('change', ()=>{
      setChildrenByParent(groupEl, parent.checked);
      setParentStateByChildren(groupEl);
      allSelected = computeAllSelected();
      if (cbToggleAll) cbToggleAll.checked = allSelected;
      // 개인자료 체크 해제
      catsBox.querySelectorAll('.group[data-personal] input.cat:checked').forEach(c=> c.checked=false);
    });
  });

  // child toggles
  catsBox.querySelectorAll('input.cat').forEach(child=>{
    child.addEventListener('change', ()=>{
      const v = child.value;
      const isPersonal = isPersonalVal(v);

      if (isPersonal && child.checked){
        // personal = single-mode: 다른 모든 항목 해제
        catsBox.querySelectorAll('.group[data-personal] input.cat').forEach(c=>{ if(c!==child) c.checked=false; });
        catsBox.querySelectorAll('.group:not([data-personal]) input.cat:checked').forEach(c=> c.checked=false);
      }
      if (!isPersonal && child.checked){
        // 일반/시리즈 선택 시 personal 해제
        catsBox.querySelectorAll('.group[data-personal] input.cat:checked').forEach(c=> c.checked=false);
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
  // 일반 그룹만 on/off (개인자료/시리즈 제외)
  catsBox
    .querySelectorAll('.group:not([data-personal]):not([data-series]) input.cat')
    .forEach(b => { b.checked = !!on; });

  // personal/series는 항상 해제
  catsBox.querySelectorAll('.group[data-personal] input.cat:checked, .group[data-series] input.cat:checked')
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

    // personal 단독 보장
    const personals = Array.from(catsBox.querySelectorAll('.group[data-personal] input.cat:checked'));
    const normals   = Array.from(catsBox.querySelectorAll('.group:not([data-personal]) input.cat:checked'));
    if (personals.length >= 1 && normals.length >= 1){
      personals.forEach(c=> c.checked=false);
    }else if (personals.length >= 2){
      personals.slice(1).forEach(c=> c.checked=false);
    }
    refreshAllParentStates();
  }
  // 연속재생 초기 표시
  const vv = (localStorage.getItem('autonext') || '').toLowerCase();
  if (cbAutoNext) cbAutoNext.checked = (vv==='1' || vv==='true' || vv==='on');
}
applySavedSelection();

cbToggleAll?.addEventListener('change', ()=> selectAll(!!cbToggleAll.checked));

/* ---------- go watch ---------- */
btnWatch?.addEventListener('click', ()=>{
  // list→watch 잔여 큐 무시: index→watch는 항상 최신부터 시작
  sessionStorage.removeItem('playQueue'); sessionStorage.removeItem('playIndex');

  const selected = Array.from(document.querySelectorAll('.cat:checked')).map(c=>c.value);
  const personals = selected.filter(isPersonalVal);
  const normals   = selected.filter(v=> !isPersonalVal(v));

  // personal-only
  if (personals.length === 1 && normals.length === 0){
    localStorage.setItem('selectedCats', JSON.stringify(personals));
    localStorage.setItem('autonext', cbAutoNext?.checked ? '1' : '0'); // 통일
    location.href = `watch.html?cats=${encodeURIComponent(personals[0])}`;
    return;
  }

  // normal only
  const isAll = computeAllSelected();
  const valueToSave = (normals.length===0 || isAll) ? "ALL" : normals;
  localStorage.setItem('selectedCats', JSON.stringify(valueToSave));
  localStorage.setItem('autonext', cbAutoNext?.checked ? '1' : '0');
  location.href = 'watch.html';
});

catTitleBtn?.addEventListener('click', ()=> location.href='category-order.html');

/* ---------- storage listener: other-tab updates ---------- */
window.addEventListener('storage', (e)=>{
  if (e.key === 'personalLabels' || e.key === 'groupOrderV1' || e.key === SERIES_SORT_PREFS_KEY) {
    renderGroups();
    applySavedSelection();
  }
});

/* ===================== */
/* Slide-out CSS (단순형에서도 사용) */
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

/* ---------- 선택 저장: index→list 직전 ---------- */
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

/* ===================== */
/* 단순형 스와이프(중앙 30% 데드존) */
/* ===================== */
function initSwipeNav({ goLeftHref=null, goRightHref=null, animateMs=260, deadZoneCenterRatio=0.30 } = {}){
  let sx=0, sy=0, t0=0, tracking=false;
  const THRESH_X = 70;
  const MAX_OFF_Y = 80;
  const MAX_TIME  = 600;

  const getPoint = (e) => e.touches?.[0] || e.changedTouches?.[0] || e;

  function onStart(e){
    const p = getPoint(e);
    if(!p) return;

    const vw = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
    const dz = Math.max(0, Math.min(0.9, deadZoneCenterRatio));
    const L  = vw * (0.5 - dz/2);
    const R  = vw * (0.5 + dz/2);
    if (p.clientX >= L && p.clientX <= R) { tracking = false; return; }

    sx = p.clientX; sy = p.clientY; t0 = Date.now(); tracking = true;
  }
  function onEnd(e){
    if(!tracking) return; tracking = false;
    if (window.__swipeNavigating) return;

    const p = getPoint(e);
    const dx = p.clientX - sx;
    const dy = p.clientY - sy;
    const dt = Date.now() - t0;
    if (Math.abs(dy) > MAX_OFF_Y || dt > MAX_TIME) return;

    if (dx <= -THRESH_X && goLeftHref){
      window.__swipeNavigating = true;
      document.documentElement.classList.add('slide-out-left');
      setTimeout(()=> location.href = goLeftHref, animateMs);
    } else if (dx >= THRESH_X && goRightHref){
      window.__swipeNavigating = true;
      persistSelectedCatsForList();
      document.documentElement.classList.add('slide-out-right');
      setTimeout(()=> location.href = goRightHref, animateMs);
    }
  }
  document.addEventListener('touchstart', onStart, { passive:true });
  document.addEventListener('touchend',   onEnd,   { passive:true });
  document.addEventListener('pointerdown',onStart, { passive:true });
  document.addEventListener('pointerup',  onEnd,   { passive:true });
}
initSwipeNav({ goLeftHref: 'upload.html', goRightHref: 'list.html', deadZoneCenterRatio: 0.30 });

/* ===================== */
/* 고급형 스와이프(끌리는 모션, 중앙 15% 데드존) */
/* ===================== */
(function(){
  function initDragSwipe({ goLeftHref=null, goRightHref=null, threshold=60, slop=45, timeMax=700, feel=1.0, deadZoneCenterRatio=0.15 }={}){
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
      const L  = vw * (0.5 - dz/2);
      const R  = vw * (0.5 + dz/2);
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
      if(Math.abs(dy) > slop){
        canceled = true; active = false;
        reset(true);
        return;
      }
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

      if(canceled || Math.abs(dy) > slop || dt > timeMax){
        reset(true);
        return;
      }

      if(dx >= threshold && goRightHref){
        window.__swipeNavigating = true;
        persistSelectedCatsForList();
        page.style.transition = 'transform 160ms ease';
        page.style.transform  = 'translateX(100vw)';
        setTimeout(()=>{ location.href = goRightHref; }, 150);
      } else if(dx <= -threshold && goLeftHref){
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

  initDragSwipe({ goLeftHref: 'upload.html', goRightHref: 'list.html', threshold:60, slop:45, timeMax:700, feel:1.0, deadZoneCenterRatio: 0.15 });
})();
