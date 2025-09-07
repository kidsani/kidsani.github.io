// js/upload.js (KidsAni v0.3.0)
// - 다중 URL 등록, 붙여넣기 지원
// - 개인자료: 이름 변경 + 로컬 저장 (서버 미사용)
// - 일반: 최대 3개 카테고리
// - 시리즈/개인자료: 단독 등록 (다른 카테고리와 혼합 불가)
// - YouTube Data API (있으면 사용)로 시리즈 영상의 업로드시간(ytPublishedAt) 조회 → seriesSortAt = ytPublishedAt || createdAt
// - 문서 ID = ytid (전역 중복 방지). 다른 소유자가 이미 등록한 경우 건너뜀.
// - 상단바/드롭다운, 오른쪽 스와이프 → index 이동
console.log(new URL('./firebase-init.js?v=0.1.0', import.meta.url).href);

import { auth, db } from './firebase-init.js?v=0.1.0';
import { onAuthStateChanged, signOut as fbSignOut } from './auth.js?v=0.1.0';
import {
  doc, getDoc, setDoc, serverTimestamp, collection, getDocs, query, where, updateDoc, Timestamp
} from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';
import { CATEGORY_GROUPS } from './categories.js?v=0.2.1';

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
const btnNick    = $('#btnNick');

function openDropdown(){ dropdown?.classList.remove('hidden'); requestAnimationFrame(()=> dropdown?.classList.add('show')); }
function closeDropdown(){ dropdown?.classList.remove('show'); setTimeout(()=> dropdown?.classList.add('hidden'), 180); }

onAuthStateChanged(auth, (user)=>{
  const loggedIn = !!user;
  signupLink?.classList.toggle('hidden', loggedIn);
  signinLink?.classList.toggle('hidden', loggedIn);
  if (welcome) welcome.textContent = loggedIn ? `Welcome! ${user.displayName||'회원'}` : '';
  closeDropdown();
});
menuBtn?.addEventListener('click',(e)=>{ e.stopPropagation(); dropdown?.classList.contains('hidden') ? openDropdown() : closeDropdown(); });
document.addEventListener('pointerdown',(e)=>{ if(dropdown?.classList.contains('hidden')) return; if(!e.target.closest('#dropdownMenu,#menuBtn')) closeDropdown(); }, true);
document.addEventListener('keydown',(e)=>{ if(e.key==='Escape') closeDropdown(); });
dropdown?.addEventListener('click',(e)=> e.stopPropagation());
btnGoUpload ?.addEventListener('click', ()=>{ location.href='upload.html'; closeDropdown(); });
btnMyUploads?.addEventListener('click', ()=>{ location.href='manage-uploads.html'; closeDropdown(); });
btnAbout    ?.addEventListener('click', ()=>{ location.href='about.html'; closeDropdown(); });
btnNick     ?.addEventListener('click', ()=>{ location.href='nick.html'; closeDropdown(); });
btnList     ?.addEventListener('click', ()=>{ location.href='list.html'; closeDropdown(); });
btnSignOut  ?.addEventListener('click', async ()=>{ await fbSignOut(auth); closeDropdown(); });

/* ------- 메시지 ------- */
const msgTop = $('#msgTop');
const msg    = $('#msg');
function setMsg(t){ if(msgTop) msgTop.textContent=t||''; if(msg) msg.textContent=t||''; }

/* ------- 개인 라벨 ------- */
const PERSONAL_LABELS_KEY = 'personalLabels';
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

/* ------- 그룹 순서(있으면 적용, 없으면 현재 순서) ------- */
const GROUP_ORDER_KEY = 'groupOrderV1';
function applyGroupOrder(groups){
  let saved=null; try{ saved=JSON.parse(localStorage.getItem(GROUP_ORDER_KEY)||'null'); }catch{}
  const order = Array.isArray(saved) && saved.length ? saved : groups.map(g=>g.key);
  const idx = new Map(order.map((k,i)=>[k,i]));
  return groups.slice().sort((a,b)=>(idx.get(a.key)??999) - (idx.get(b.key)??999));
}

/* ------- 시리즈 판단 셋 ------- */
const SERIES_VALUES = (()=> {
  const set = new Set();
  for(const g of CATEGORY_GROUPS){ if(g.series){ for(const c of g.children) set.add(c.value); } }
  return set;
})();
const isSeriesVal = (v)=> SERIES_VALUES.has(v);
const isPersonalVal = (v)=> v==='personal1' || v==='personal2';

/* ------- 카테고리 렌더 (DOM API) ------- */
const catsBox = $('#cats');

function renderCats(){
  if(!Array.isArray(CATEGORY_GROUPS) || !CATEGORY_GROUPS.length){
    setMsg('카테고리 정의가 비었습니다.');
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
    if (g.personal) fieldset.setAttribute('data-personal','true');
    if (g.series)   fieldset.setAttribute('data-series','true');

    const legend = document.createElement('legend');
    legend.textContent = g.label;
    fieldset.appendChild(legend);

    if (g.personal){
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

      const text = document.createTextNode(' ' + (g.personal && personalLabels[c.value] ? personalLabels[c.value] : c.label));

      label.appendChild(input);
      label.appendChild(text);

      if (g.personal){
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

    if (g.personal){
      const note = document.createElement('div');
      note.className = 'muted';
      note.style.margin = '6px 4px 2px';
      note.textContent = '개인자료는 단독 등록/재생만 가능합니다.';
      fieldset.appendChild(note);
    }

    if (g.series){
      const note = document.createElement('div');
      note.className = 'muted';
      note.style.margin = '6px 4px 2px';
      note.textContent = '시리즈는 단독 등록/재생만 가능합니다.';
      fieldset.appendChild(note);
    }

    frag.appendChild(fieldset);
  }

  catsBox.appendChild(frag);

  // 선택 제약
  catsBox.querySelectorAll('input.cat').forEach(chk=>{
    chk.addEventListener('change', ()=>{
      const v = chk.value;
      const isPers = isPersonalVal(v);
      const isSeries = isSeriesVal(v);

      if ((isPers || isSeries) && chk.checked){
        // 시리즈/개인자료는 단독 선택
        catsBox.querySelectorAll('input.cat').forEach(x=>{ if(x!==chk) x.checked=false; });
        setMsg(isPers ? '개인자료는 단독으로만 등록/재생됩니다.' : '시리즈는 단독으로만 등록/재생됩니다.');
        return;
      }
      if(!isPers && !isSeries && chk.checked){
        // 일반 선택 시 개인/시리즈 해제
        catsBox.querySelectorAll('.group[data-personal] input.cat:checked, .group[data-series] input.cat:checked')
          .forEach(x=> x.checked=false);
        // 일반은 최대 3개
        const normals = Array.from(catsBox.querySelectorAll('input.cat:checked'))
          .map(x=>x.value).filter(x=>!isPersonalVal(x) && !isSeriesVal(x));
        if(normals.length>3){
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

/* ------- URL 유틸 ------- */
const urlsBox = $('#urls');
function parseUrls(){ return urlsBox.value.split(/\r?\n/).map(s=>s.trim()).filter(Boolean); }
function extractId(url){
  const m = String(url).match(/(?:youtu\.be\/|v=|shorts\/|embed\/)([^?&/]+)/);
  return m?m[1]:'';
}
const YT_WHITELIST = /^(https:\/\/(www\.)?youtube\.com\/(watch\?v=|shorts\/)|https:\/\/youtu\.be\/)/i;

/* ------- YouTube 메타 (oEmbed 제목 폴백) ------- */
async function fetchTitleById(id){
  if(!id) return '';
  try{
    const res = await fetch('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent(`https://www.youtube.com/watch?v=${id}`));
    if(!res.ok) throw 0;
    const data = await res.json();
    return String(data?.title || '').slice(0,200);
  }catch{ return ''; }
}
function parseISODurationToSec(iso){
  // PT#H#M#S
  if(!iso || typeof iso!=='string') return null;
  const re = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/i;
  const m = iso.match(re);
  if(!m) return null;
  const h = parseInt(m[1]||'0',10), mnt = parseInt(m[2]||'0',10), s = parseInt(m[3]||'0',10);
  return h*3600 + mnt*60 + s;
}

/* ------- YouTube Data API (있으면 사용) ------- */
const YT_API_KEY = (typeof window!=='undefined' && window.YT_API_KEY) ? String(window.YT_API_KEY) : '';

async function fetchYouTubeBatchMeta(ids){
  // ids: 최대 50개
  const result = new Map(); // id -> { title, channelTitle, publishedAt, durationSec }
  if(!ids.length) return result;

  if(!YT_API_KEY){
    console.warn('[upload] YT_API_KEY 미설정: publishedAt/채널명/길이 수집 불가. seriesSortAt은 createdAt으로 대체됩니다.');
    return result;
  }
  const url = new URL('https://www.googleapis.com/youtube/v3/videos');
  url.searchParams.set('part','snippet,contentDetails');
  url.searchParams.set('id', ids.join(','));
  url.searchParams.set('key', YT_API_KEY);

  try{
    const res = await fetch(url.toString());
    if(!res.ok) throw new Error('YouTube API 실패: ' + res.status);
    const data = await res.json();
    const items = Array.isArray(data?.items) ? data.items : [];
    for(const it of items){
      const id = it.id;
      const sn = it.snippet || {};
      const cd = it.contentDetails || {};
      result.set(id, {
        title: String(sn.title||''),
        channelTitle: String(sn.channelTitle||''),
        publishedAt: sn.publishedAt ? new Date(sn.publishedAt) : null,
        durationSec: parseISODurationToSec(cd.duration) ?? null,
      });
    }
  }catch(e){
    console.error('[upload] YouTube API 에러:', e);
  }
  return result;
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

/* ------- 권한/밴/닉네임 확인 ------- */
async function ensureNotBanned(uid){
  try{
    const banSnap = await getDoc(doc(db,'banned_users', uid));
    return !banSnap.exists();
  }catch{ return true; }
}
async function readNickname(uid){
  try{
    const snap = await getDoc(doc(db,'users', uid));
    const name = snap.exists() ? String(snap.data()?.displayName || '') : '';
    return name.trim();
  }catch{ return ''; }
}

/* ------- 등록 ------- */
function getOrderValue(){ return document.querySelector('input[name="order"]:checked')?.value || 'bottom'; }

async function submitAll(){
  setMsg('검사 중...');
  const user = auth.currentUser;
  if(!user){ setMsg('로그인 후 이용하세요.'); return; }

  if(!(await ensureNotBanned(user.uid))){
    setMsg('업로드가 제한된 계정입니다. 관리자에게 문의하세요.');
    return;
  }

  const nick = await readNickname(user.uid);
  if(!nick){
    setMsg('닉네임이 설정되어 있지 않습니다. 먼저 닉네임을 정해 주세요.');
    setTimeout(()=> location.href='nick.html', 600);
    return;
  }

  const lines = parseUrls();
  if(!lines.length){ setMsg('URL을 한 줄에 하나씩 입력해 주세요.'); return; }

  const selected = Array.from(document.querySelectorAll('.cat:checked')).map(c=>c.value);
  if(!selected.length){ setMsg('카테고리를 최소 1개 선택해 주세요.'); return; }

  const personals = selected.filter(isPersonalVal);
  const seriesSel = selected.filter(isSeriesVal);
  const normals   = selected.filter(v=> !isPersonalVal(v) && !isSeriesVal(v));

  // 개인자료 단독 → 로컬 저장
  if(personals.length===1 && seriesSel.length===0 && normals.length===0){
    const slot = personals[0]; // 'personal1' | 'personal2'
    const key  = `kidsani_${slot}`;
    let arr=[]; try{ arr=JSON.parse(localStorage.getItem(key)||'[]'); }catch{ arr=[]; }
    let added=0;
    for(const raw of lines){
      if(!YT_WHITELIST.test(raw)) { continue; }
      if(!extractId(raw)) continue;
      arr.push({ url: raw, savedAt: Date.now() });
      added++;
    }
    localStorage.setItem(key, JSON.stringify(arr));
    urlsBox.value='';
    document.querySelectorAll('.cat:checked').forEach(c=> c.checked=false);
    setMsg(`로컬 저장 완료: ${added}건 (${slot==='personal1'?'개인자료1':'개인자료2'})`);
    return;
  }

  // 혼합 금지
  if(seriesSel.length>=1 && (personals.length>=1 || normals.length>=1)){
    setMsg('시리즈는 단독으로만 등록할 수 있습니다.');
    return;
  }
  if(personals.length>=1 && (seriesSel.length>=1 || normals.length>=1)){
    setMsg('개인자료는 단독으로만 등록할 수 있습니다.');
    return;
  }

  // 일반 카테고리: 최대 3개
  if(seriesSel.length===0){
    if(normals.length===0){ setMsg('카테고리를 최소 1개 선택해 주세요.'); return; }
    if(normals.length>3){ setMsg('카테고리는 최대 3개까지 선택 가능합니다.'); return; }
  }else{
    // 시리즈 단독: 정확히 1개로 고정
    if(seriesSel.length!==1){ setMsg('시리즈는 한 번에 1개만 선택할 수 있습니다.'); return; }
  }

  const order = getOrderValue();
  const list  = (order==='bottom') ? lines.slice().reverse() : lines.slice();

  // URL/ID 전처리
  const items = [];
  const idSet = new Set();
  for(const url of list){
    if(!YT_WHITELIST.test(url)) continue;
    const id = extractId(url);
    if(!id) continue;
    items.push({ url, id });
    idSet.add(id);
  }
  if(!items.length){ setMsg('유효한 YouTube URL을 찾지 못했습니다.'); return; }

  // 메타 수집: 시리즈면 API 우선 사용
  let metaMap = new Map();
  if(seriesSel.length===1){
    const ids = Array.from(idSet);
    // 50개씩 배치
    metaMap = new Map();
    for(let i=0;i<ids.length;i+=50){
      const batch = ids.slice(i, i+50);
      const m = await fetchYouTubeBatchMeta(batch);
      // 합치기
      for(const [k,v] of m.entries()) metaMap.set(k,v);
    }
  }

  // 진행
  setMsg(`등록 중... (0/${items.length})`);
  let ok=0, skip=0, fail=0;

  for(let i=0;i<items.length;i++){
    const {url, id} = items[i];
    try{
      const ref = doc(db,'videos', id);
      const snap = await getDoc(ref);

      if(snap.exists()){
        const owner = String(snap.data()?.uid || '');
        if(owner && owner !== auth.currentUser.uid){
          skip++;
          setMsg(`이미 등록된 영상(다른 소유자) 건너뜀... (${ok+skip+fail}/${items.length})`);
          continue;
        }
      }

      // 메타 준비
      let title = '';
      let channelTitle = '';
      let ytPublishedAt = null;
      let durationSec = null;

      const meta = metaMap.get(id);
      if(meta){
        title = (meta.title || '').slice(0,200);
        channelTitle = (meta.channelTitle || '').slice(0,200);
        ytPublishedAt = meta.publishedAt ? Timestamp.fromDate(meta.publishedAt) : null;
        durationSec = meta.durationSec ?? null;
      }else{
        // 폴백: 제목만 oEmbed 시도
        title = await fetchTitleById(id);
      }

      const normalizedUrl = `https://www.youtube.com/watch?v=${id}`;
      const thumb = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

      // 필드 확정
      const isSeries = seriesSel.length===1;
      const cats = isSeries ? seriesSel : normals;

      const baseData = {
        uid: auth.currentUser.uid,
        uNickname: nick,
        url: normalizedUrl,
        ytid: id,
        thumb,
        cats,
        source: 'youtube',
        updatedAt: serverTimestamp(),
      };
      if(title) baseData.title = title;
      if(channelTitle) baseData.channelTitle = channelTitle;
      if(typeof durationSec === 'number') baseData.durationSec = durationSec;
      if(ytPublishedAt) baseData.ytPublishedAt = ytPublishedAt;

      // seriesSortAt: 등록순(= 유튜브 업로드시각) 우선, 없으면 createdAt(서버)
      // 새 문서면 createdAt 넣음, 기존 문서면 유지
      if(!snap.exists()){
        baseData.createdAt = serverTimestamp();
      }
      if(isSeries){
        baseData.seriesSortAt = ytPublishedAt || serverTimestamp();
      }
console.log('WRITE payload', {
  path: `videos/${id}`,
  uid: auth.currentUser.uid,
  data: baseData
});
      await setDoc(ref, baseData, { merge: true });
      ok++;
    }catch(e){
      console.error('[upload] setDoc failed:', e?.code, e?.message, e);
      fail++;
    }
    setMsg(`등록 중... (${ok+skip+fail}/${items.length})`);
  }

  setMsg(`완료: 성공 ${ok}건, 건너뜀 ${skip}건, 실패 ${fail}건`);
  if(ok){ urlsBox.value=''; document.querySelectorAll('.cat:checked').forEach(c=> c.checked=false); }
}

$('#btnSubmitTop')   ?.addEventListener('click', submitAll);
$('#btnSubmitBottom')?.addEventListener('click', submitAll);

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
/* 고급형 스와이프 — 오른쪽으로 index 이동 (왼쪽 잠금) */
/* ===================== */
(function(){
  function initDragSwipe({ goRightHref=null, threshold=60, slop=45, timeMax=700, feel=1.0, deadZoneCenterRatio=0.15 }={}){
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

      // 오른쪽만 허용
      let dxAdj = dx;
      if (dx < 0) dxAdj = 0;
      if (dxAdj === 0){
        page.style.transform = 'translateX(0px)';
        return;
      }

      e.preventDefault();
      page.style.transform = 'translateX(' + (dxAdj * feel) + 'px)';
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
        page.style.transition = 'transform 160ms ease';
        page.style.transform  = 'translateX(100vw)';
        setTimeout(()=>{ location.href = goRightHref; }, 150);
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

  // upload: 오른쪽으로 스와이프하면 index로
  initDragSwipe({ goRightHref: 'index.html', threshold:60, slop:45, timeMax:700, feel:1.0, deadZoneCenterRatio: 0.15 });
})();
