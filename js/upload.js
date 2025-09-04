// js/upload.js (v1.8.0-series)
// - UI 변경 없음. 로직만 추가.
// - "시리즈" 그룹에서 카테고리 1개를 선택하면 시리즈 업로드 모드가 자동 활성화됩니다.
// - 현재 해당 시리즈의 마지막 episode를 읽어와 그 다음 번호부터 순차 부여(여러 URL 일괄 등록 지원).
// - personal 과의 혼합, 일반 카테고리와의 혼합을 금지(기존 정책 유지).
// - Firestore 인덱스: seriesKey ==, orderBy(episode desc) 쿼리에 대해 콘솔에서 안내 뜨면 한 번 생성 필요.

import { auth, db } from './firebase-init.js?v=1.5.1';
import { onAuthStateChanged, signOut as fbSignOut } from './auth.js?v=1.5.1';
import {
  addDoc, collection, serverTimestamp,
  getDocs, query, where, orderBy, limit
} from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';
import { CATEGORY_GROUPS } from './categories.js?v=1.5.1';

/* ------- 전역 내비 중복 방지 ------- */
window.__swipeNavigating = window.__swipeNavigating || false;

/* ------- 상단바/드롭다운 ------- */
const $ = (s)=>document.querySelector(s);
const signupLink = $('#signupLink');
const signinLink = $('#signinLink');
const welcome    = $('#welcome');
const menuBtn    = $('#menuBtn');
const dropdown   = $('#dropdownMenu');
const btnSignOut = $('#btnSignOut');
const btnGoUpload= $('#btnGoUpload');
const btnMyUploads = $('#btnMyUploads');
const btnAbout   = $('#btnAbout');
const btnList    = $('#btnList');

function openDropdown(){ dropdown?.classList.remove('hidden'); requestAnimationFrame(()=> dropdown?.classList.add('show')); }
function closeDropdown(){ dropdown?.classList.remove('show'); setTimeout(()=> dropdown?.classList.add('hidden'), 180); }

onAuthStateChanged(auth, (user)=>{
  const loggedIn = !!user;
  signupLink?.classList.toggle('hidden', loggedIn);
  signinLink?.classList.toggle('hidden', loggedIn);
  if (welcome) welcome.textContent = loggedIn ? `ThankU ${user.displayName||'회원'}!!` : '';
  closeDropdown();
});
menuBtn?.addEventListener('click',(e)=>{ e.stopPropagation(); dropdown?.classList.contains('hidden') ? openDropdown() : closeDropdown(); });
document.addEventListener('pointerdown',(e)=>{ if(dropdown?.classList.contains('hidden')) return; if(!e.target.closest('#dropdownMenu,#menuBtn')) closeDropdown(); }, true);
document.addEventListener('keydown',(e)=>{ if(e.key==='Escape') closeDropdown(); });
dropdown?.addEventListener('click',(e)=> e.stopPropagation());
btnGoUpload ?.addEventListener('click', ()=>{ location.href='upload.html'; closeDropdown(); });
btnMyUploads?.addEventListener('click', ()=>{ location.href='manage-uploads.html'; closeDropdown(); });
btnAbout    ?.addEventListener('click', ()=>{ location.href='about.html'; closeDropdown(); });
btnList     ?.addEventListener('click', ()=>{ location.href='list.html'; closeDropdown(); });
btnSignOut  ?.addEventListener('click', async ()=>{ await fbSignOut(auth); closeDropdown(); });

/* ------- 공통 키 ------- */
const GROUP_ORDER_KEY      = 'groupOrderV1';
const PERSONAL_LABELS_KEY  = 'personalLabels';
const isPersonalVal = (v)=> v==='personal1' || v==='personal2';

/* ------- 메시지 ------- */
const msgTop = $('#msgTop');
const msg    = $('#msg');
function setMsg(t){ if(msgTop) msgTop.textContent=t||''; if(msg) msg.textContent=t||''; }

/* ------- 개인 라벨 ------- */
function getPersonalLabels(){
  try{ return JSON.parse(localStorage.getItem(PERSONAL_LABELS_KEY)||'{}'); }catch{ return {}; }
}
function setPersonalLabel(key,label){
  let s = String(label||'').replace(/\r\n?/g,'\n').trim();
  s = s.slice(0,12).replace(/[<>"]/g,'').replace(/[\u0000-\u001F]/g,'');
  const map = getPersonalLabels();
  map[key] = s;
  localStorage.setItem(PERSONAL_LABELS_KEY, JSON.stringify(map));
}

/* ------- 그룹/라벨 맵 (시리즈 판단용) ------- */
const SERIES_SET = new Set();
const LABEL_MAP  = new Map(); // value -> label
(function buildMaps(){
  try{
    CATEGORY_GROUPS.forEach(g=>{
      g.children.forEach(c=>{
        LABEL_MAP.set(c.value, c.label||c.value);
        if (g.key === 'series') SERIES_SET.add(c.value);
      });
    });
  }catch{}
})();
const isSeriesVal = (v)=> SERIES_SET.has(v);
const labelOf = (v)=> LABEL_MAP.get(v)||v;

/* ------- 그룹 순서 적용 ------- */
function applyGroupOrder(groups){
  let saved=null; try{ saved=JSON.parse(localStorage.getItem(GROUP_ORDER_KEY)||'null'); }catch{}
  const order = Array.isArray(saved)? saved : [];
  if(!order.length) return groups.slice();
  const byKey = new Map(groups.map(g=>[g.key,g]));
  const sorted = order.map(k=> byKey.get(k)).filter(Boolean);
  groups.forEach(g=>{ if(!order.includes(g.key)) sorted.push(g); });
  return sorted;
}

/* ------- 카테고리 렌더 (XSS-safe) ------- */
const catsBox = $('#cats');

function renderCats(){
  try{
    if(!Array.isArray(CATEGORY_GROUPS) || !CATEGORY_GROUPS.length){
      setMsg('카테고리 정의(CATEGORY_GROUPS)가 비어 있습니다. js/categories.js 확인 필요.');
      return;
    }
  }catch(e){
    setMsg('카테고리 로드 실패: js/categories.js import 에러');
    return;
  }

  const personalLabels = getPersonalLabels();
  const groups = applyGroupOrder(CATEGORY_GROUPS);

  catsBox.replaceChildren();
  const frag = document.createDocumentFragment();

  for (const g of groups){
    const fieldset = document.createElement('fieldset');
    fieldset.className = 'group';
    fieldset.dataset.key = g.key;

    const legend = document.createElement('legend');
    legend.textContent = g.key === 'personal' ? `${g.label} ` : g.label;
    fieldset.appendChild(legend);

    if (g.key === 'personal'){
      const sub = document.createElement('span');
      sub.className = 'subnote';
      sub.textContent = '(로컬저장소)';
      legend.appendChild(sub);
    }

    const grid = document.createElement('div');
    grid.className = 'child-grid';
    fieldset.appendChild(grid);

    for (const c of g.children){
      const label = document.createElement('label');

      const input = document.createElement('input');
      input.type = 'checkbox';
      input.className = 'cat';
      input.value = c.value;

      const text = document.createTextNode(' ' + (g.key==='personal' && personalLabels[c.value] ? personalLabels[c.value] : c.label));
      label.appendChild(input);
      label.appendChild(text);

      if (g.key==='personal'){
        const btn = document.createElement('button');
        btn.className = 'rename-btn';
        btn.type = 'button';
        btn.dataset.key = c.value;
        btn.textContent = '이름변경';
        btn.addEventListener('click', ()=>{
          const key = btn.getAttribute('data-key');
          const cur = getPersonalLabels()[key] || (key==='personal1'?'자료1':'자료2');
          const name = prompt('개인자료 이름(최대 12자):', cur);
          if(!name) return;
          setPersonalLabel(key, name);
          renderCats();
        });
        label.appendChild(document.createTextNode(' '));
        label.appendChild(btn);
      }

      grid.appendChild(label);
    }

    if (g.key==='personal'){
      const note = document.createElement('div');
      note.className = 'muted';
      note.style.margin = '6px 4px 2px';
      note.textContent = '개인자료는 단독 등록/재생만 가능합니다.';
      fieldset.appendChild(note);
    }

    frag.appendChild(fieldset);
  }

  catsBox.appendChild(frag);

  // 선택 제약: personal/series는 "단독 모드"
  catsBox.querySelectorAll('input.cat').forEach(chk=>{
    chk.addEventListener('change', ()=>{
      const v = chk.value;

      // 1) personal 선택 시: 나머지 모두 해제
      if (isPersonalVal(v) && chk.checked){
        catsBox.querySelectorAll('input.cat').forEach(x=>{ if(x!==chk) x.checked=false; });
        setMsg('개인자료는 단독으로만 등록/재생됩니다.');
        return;
      }

      // 2) series 선택 시: 시리즈 1개만 허용, 나머지 전부 해제
      if (isSeriesVal(v) && chk.checked){
        catsBox.querySelectorAll('input.cat').forEach(x=>{
          if (x!==chk) x.checked = false; // 시리즈는 단독
        });
        setMsg('시리즈는 단독으로만 등록됩니다.');
        return;
      }

      // 3) 일반 카테고리 선택 시: personal/series는 해제 + 일반은 최대 3개 제한
      if (!isPersonalVal(v) && !isSeriesVal(v) && chk.checked){
        catsBox.querySelectorAll('.group[data-key="personal"] input.cat:checked, .group[data-key="series"] input.cat:checked')
          .forEach(x=> x.checked=false);

        const normals = Array.from(catsBox.querySelectorAll('input.cat:checked'))
          .map(x=>x.value).filter(x=> !isPersonalVal(x) && !isSeriesVal(x));
        if (normals.length>3){
          chk.checked=false;
          setMsg('카테고리는 최대 3개까지 선택 가능합니다.');
          return;
        }
      }
      setMsg('');
    });
  });
}
renderCats();

/* ------- URL 유틸/화이트리스트 ------- */
const urlsBox = $('#urls');
function parseUrls(){ return urlsBox.value.split(/\r?\n/).map(s=>s.trim()).filter(Boolean); }
function extractId(url){ const m=String(url).match(/(?:youtu\.be\/|v=|shorts\/|embed\/)([^?&/]+)/); return m?m[1]:''; }
const YT_WHITELIST = /^(https:\/\/(www\.)?youtube\.com\/(watch\?v=|shorts\/)|https:\/\/youtu\.be\/)/i;

/* ------- 제목 가져오기(oEmbed) ------- */
async function fetchTitleById(id){
  if(!id) return '';
  try{
    const res = await fetch('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent(`https://www.youtube.com/watch?v=${id}`));
    if(!res.ok) throw 0;
    const data = await res.json();
    return String(data?.title || '').slice(0,200);
  }catch{ return ''; }
}

/* ------- 붙여넣기 ------- */
$('#btnPaste')?.addEventListener('click', async ()=>{
  try{
    const txt = await navigator.clipboard.readText();
    if(!txt){ setMsg('클립보드가 비어있습니다.'); return; }
    urlsBox.value = (urlsBox.value.trim()? (urlsBox.value.replace(/\s*$/,'')+'\n') : '') + txt.trim();
    setMsg('붙여넣기 완료.');
  }catch{
    setMsg('클립보드 접근이 차단되었습니다. 브라우저 설정에서 허용해 주세요.');
  }
});

/* ------- 등록 ------- */
function getOrderValue(){ return document.querySelector('input[name="order"]:checked')?.value || 'bottom'; }

async function getNextEpisodeStart(seriesKey){
  // 기본값: 1부터
  let start = 1;
  try{
    const qs = await getDocs(
      query(
        collection(db,'videos'),
        where('seriesKey','==', seriesKey),
        orderBy('episode','desc'),
        limit(1)
      )
    );
    if (!qs.empty){
      const last = Number(qs.docs[0].data()?.episode) || 0;
      start = last + 1;
    }
  }catch(e){
    // 인덱스 없으면 콘솔 링크(Firestore가 자동 안내)로 한 번 생성해 주면 OK.
    console.warn('[upload.series] getNextEpisodeStart failed (index needed?)', e?.code, e?.message);
    setMsg('시리즈 인덱스가 필요할 수 있어요. 콘솔 링크로 인덱스를 한 번 생성해 주세요.');
  }
  return start;
}

async function submitAll(){
  setMsg('검사 중...');
  const user = auth.currentUser;
  if(!user){ setMsg('로그인 후 이용하세요.'); return; }

  const lines = parseUrls();
  if(!lines.length){ setMsg('URL을 한 줄에 하나씩 입력해 주세요.'); return; }

  const selected = Array.from(document.querySelectorAll('.cat:checked')).map(c=>c.value);

  const personals = selected.filter(isPersonalVal);
  const seriesSel = selected.filter(isSeriesVal);
  const normals   = selected.filter(v=> !isPersonalVal(v) && !isSeriesVal(v));

  // A) 개인자료 단독(로컬 저장)
  if (personals.length===1 && seriesSel.length===0 && normals.length===0){
    const slot = personals[0];
    const key  = `copytube_${slot}`;
    let arr=[]; try{ arr=JSON.parse(localStorage.getItem(key)||'[]'); }catch{ arr=[]; }
    let added=0;
    for(const raw of lines){
      if(!YT_WHITELIST.test(raw)) continue;
      if(!extractId(raw)) continue;
      arr.push({ url: raw, savedAt: Date.now() });
      added++;
    }
    localStorage.setItem(key, JSON.stringify(arr));
    urlsBox.value=''; document.querySelectorAll('.cat:checked').forEach(c=> c.checked=false);
    setMsg(`로컬 저장 완료: ${added}건 (${slot==='personal1'?'개인자료1':'개인자료2'})`);
    return;
  }

  // 혼합 금지
  if (seriesSel.length>=1 && (personals.length>=1 || normals.length>=1)){
    setMsg('시리즈는 다른 카테고리/개인자료와 함께 선택할 수 없습니다.');
    return;
  }

  // B) 시리즈 단독 업로드
  if (seriesSel.length===1 && personals.length===0 && normals.length===0){
    const seriesKey   = seriesSel[0];
    const seriesTitle = labelOf(seriesKey);
    const order       = getOrderValue();
    const list        = (order==='bottom') ? lines.slice().reverse() : lines.slice();

    setMsg('시리즈 시작 번호 확인 중...');
    let nextEp = await getNextEpisodeStart(seriesKey);

    setMsg(`등록 중... (0/${list.length})`);
    let ok=0, fail=0;

    for(let i=0;i<list.length;i++){
      const url = list[i];
      if(!YT_WHITELIST.test(url)){ fail++; setMsg(`YouTube 링크만 등록할 수 있습니다. (${ok+fail}/${list.length})`); continue; }
      const id  = extractId(url);
      if(!id){ fail++; setMsg(`등록 중... (${ok+fail}/${list.length})`); continue; }

      let title = '';
      try{ title = await fetchTitleById(id); }catch{}

      const docData = {
        url,
        ...(title ? { title } : {}),
        categories: [seriesKey],    // 시리즈 카테고리 값 그대로 사용
        uid: user.uid,              // 규칙(compat)에서 uid/ownerUid 둘 다 허용
        createdAt: serverTimestamp(),

        // ▼ 시리즈 메타
        seriesKey,
        seriesTitle,
        episode: nextEp++
      };

      try{
        await addDoc(collection(db,'videos'), docData);
        ok++;
      }catch(e){
        console.error('[upload.series] addDoc failed:', e?.code, e?.message);
        fail++;
      }
      setMsg(`등록 중... (${ok+fail}/${list.length})`);
    }

    setMsg(`완료: 성공 ${ok}건, 실패 ${fail}건`);
    if(ok){ urlsBox.value=''; document.querySelectorAll('.cat:checked').forEach(c=> c.checked=false); }
    return;
  }

  // C) 일반 카테고리 업로드 (기존 로직)
  if(normals.length===0){
    setMsg('카테고리를 최소 1개 선택해 주세요.');
    return;
  }
  if(normals.length>3){
    setMsg('카테고리는 최대 3개까지 선택 가능합니다.');
    return;
  }

  const order = getOrderValue();
  const list  = (order==='bottom') ? lines.slice().reverse() : lines.slice();

  setMsg(`등록 중... (0/${list.length})`);
  let ok=0, fail=0;

  for(let i=0;i<list.length;i++){
    const url = list[i];
    if(!YT_WHITELIST.test(url)){ fail++; setMsg(`YouTube 링크만 등록할 수 있습니다. (${ok+fail}/${list.length})`); continue; }
    const id  = extractId(url);
    if(!id){ fail++; setMsg(`등록 중... (${ok+fail}/${list.length})`); continue; }

    let title = '';
    try{ title = await fetchTitleById(id); }catch{}

    try{
      const docData = {
        url,
        ...(title ? { title } : {}),
        categories: normals,
        uid: user.uid,
        createdAt: serverTimestamp(),
      };
      await addDoc(collection(db,'videos'), docData);
      ok++;
    }catch(e){
      console.error('[upload] addDoc failed:', e?.code, e?.message, e);
      fail++;
    }
    setMsg(`등록 중... (${ok+fail}/${list.length})`);
  }

  setMsg(`완료: 성공 ${ok}건, 실패 ${fail}건`);
  if(ok){ urlsBox.value=''; document.querySelectorAll('.cat:checked').forEach(c=> c.checked=false); }
}

/* ------- 버튼 바인딩 ------- */
$('#btnSubmitTop')   ?.addEventListener('click', submitAll);
$('#btnSubmitBottom')?.addEventListener('click', submitAll);

/* ------- 디버 힌트(옵션) ------- */
try{
  console.debug('[upload] CATEGORY_GROUPS keys:', CATEGORY_GROUPS.map(g=>g.key));
  console.debug('[upload] groupOrderV1:', localStorage.getItem('groupOrderV1'));
}catch{}

/* ===================== */
/* Slide-out CSS (단순형/백업용) */
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
/* 단순형 스와이프 정의(중앙 30% 데드존 추가) — 호출 안 함 */
/* ===================== */
function simpleSwipeNav({ goLeftHref=null, goRightHref=null, animateMs=260, deadZoneCenterRatio=0.30 } = {}){
  let sx=0, sy=0, t0=0, tracking=false;
  const THRESH_X = 70, MAX_OFF_Y = 80, MAX_TIME = 600;
  const getPoint = (e) => e.touches?.[0] || e.changedTouches?.[0] || e;
  function onStart(e){
    const p = getPoint(e); if(!p) return;
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
      document.documentElement.classList.add('slide-out-right');
      setTimeout(()=> location.href = goRightHref, animateMs);
    }
  }
  document.addEventListener('touchstart', onStart, { passive:true });
  document.addEventListener('touchend',   onEnd,   { passive:true });
  document.addEventListener('pointerdown',onStart, { passive:true });
  document.addEventListener('pointerup',  onEnd,   { passive:true });
}

// End of js/upload.js (v1.8.0-series)
