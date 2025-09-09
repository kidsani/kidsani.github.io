// js/watch.js — KidsAni Watch v0.7.0 (FULL)
// ✅ 지원 파라미터: ?id=<docId> | ?v=<YouTubeID|URL> | ?cats=ALL | a,b,c
// ✅ 기능: 위치저장/복원, 자동다음, 이전/다음 화, 웨이크락, 가로전체화면 시도, 화면잠금,
//         단축키(K/J/L/M/[,], , .), 배속/음소거, 다음 화 미리보기(썸네일),
//         환경설정(pref_*), 시리즈 정렬 기준(seriesSortPrefs) 반영

import { db } from "./firebase-init.js";
import {
  doc, getDoc, collection, query, where, orderBy, limit, getDocs
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

/* ─────────────────────────────
 * Storage Keys / Prefs
 * ───────────────────────────── */
const KEY_AUTONEXT = "autonext";                 // "1"/"0"
const KEY_LAST_WATCH = "lastWatch";              // {videoId,title,seriesKey,episode,docId,at}
const KEY_SERIES_PREFS = "seriesSortPrefs";      // { [catValue]: "registered"|"latest"|"title" }
const KEY_SPEED = "pref_speed";                  // number (e.g., 1, 1.25)
const KEY_PREF_FS = "pref_fullscreenOnStart";    // "1"/"0"
const KEY_PREF_LOCK = "pref_lockOnStart";        // "1"/"0"
const KEY_PREF_MUTE = "pref_muteOnStart";        // "1"/"0"
const KEY_PREF_SWIPE = "pref_swipeNav";          // "1"/"0"

/* ─────────────────────────────
 * DOM helpers / Params
 * ───────────────────────────── */
const $ = (s)=> document.querySelector(s);
const $$ = (s)=> Array.from(document.querySelectorAll(s));
const params = new URLSearchParams(location.search);
const docIdParam = params.get("id");
const vParam = params.get("v")?.trim() || null;
const catsParam = params.get("cats") || null;

/* ─────────────────────────────
 * State
 * ───────────────────────────── */
let player = null;
let ytId = null;
let vDoc = null;     // 현재 영상 문서 데이터
let vRefId = null;   // 현재 문서 ID
let wakeLock = null;
let lockOn = false;
let firstGestureUsed = false; // 첫 사용자 제스처로 전체화면/가로잠금 시도
let resumeTimer = null;
let saveTimer = null;

/* ─────────────────────────────
 * DOM refs
 * ───────────────────────────── */
const elTitle = $("#v-title");
const elSeries = $("#v-series");
const elChips = $("#v-chips");
const elPrev = $("#btn-prev");
const elNext = $("#btn-next");
const elAuto = $("#toggle-autonext");
const elLock = $("#toggle-lock");
const elFull = $("#btn-full");
const elMute = $("#btn-mute");
const elSpeed = $("#btn-speed");
const elLockLayer = $("#lock");
const elNextPreview = $("#next-preview");

/* ─────────────────────────────
 * Utils
 * ───────────────────────────── */
function getBool(key, def=false){
  const s = (localStorage.getItem(key)||"").toLowerCase();
  if (s==="1"||s==="true"||s==="on") return true;
  if (s==="0"||s==="false"||s==="off") return false;
  return def;
}
function setBool(key, v){ localStorage.setItem(key, v ? "1" : "0"); }

function extractYouTubeId(input){
  if (!input) return null;
  const idLike = input.match(/^[a-zA-Z0-9_-]{11}$/);
  if (idLike) return idLike[0];
  const m = input.match(/[?&]v=([^&#]+)/) ||
            input.match(/youtu\.be\/([^?&#]+)/) ||
            input.match(/embed\/([^?&#]+)/);
  return m ? m[1] : null;
}

function posKeyFor(yt){ return `watchpos:${yt}`; }
function saveLastWatch({ videoId, title, seriesKey, episode, docId }){
  const data = { videoId, title, seriesKey: seriesKey||null, episode: episode??null, docId: docId||null, at: Date.now() };
  localStorage.setItem(KEY_LAST_WATCH, JSON.stringify(data));
}

function loadSeriesPrefs(){
  try { return JSON.parse(localStorage.getItem(KEY_SERIES_PREFS)||'{}'); }
  catch { return {}; }
}
function normalizeMode(m){
  return (m==="latest"||m==="title"||m==="registered") ? m : "registered";
}
function modeToOrder(mode){
  switch(normalizeMode(mode)){
    case "title":      return { field: "title",       dir: "asc"  };
    case "latest":     return { field: "seriesSortAt",dir: "asc"  };
    case "registered":
    default:           return { field: "createdAt",   dir: "desc" };
  }
}
function firstOf(arr){ return Array.isArray(arr) && arr.length ? arr[0] : null; }

/* ─────────────────────────────
 * Firestore fetching
 * ───────────────────────────── */
async function fetchDocById(id){
  const snap = await getDoc(doc(db,"videos",id));
  if (!snap.exists()) throw new Error("영상 문서를 찾을 수 없습니다.");
  return { id: snap.id, ...snap.data() };
}

async function fetchNewestAny(){
  const qAll = query(collection(db,"videos"), orderBy("createdAt","desc"), limit(1));
  const s = await getDocs(qAll);
  let obj = null; s.forEach(d=> obj = { id:d.id, ...d.data() });
  return obj;
}

async function fetchFirstByCats(catsList){
  // 대표 카테고리의 모드로 정렬
  const prefs = loadSeriesPrefs();
  const rep = firstOf(catsList);
  const mode = rep && prefs[rep] ? prefs[rep] : "registered";
  const { field, dir } = modeToOrder(mode);

  // array-contains-any 로 첫 1건
  const q1 = query(
    collection(db,"videos"),
    where("cats","array-contains-any", catsList),
    orderBy(field, dir),
    limit(1)
  );
  const s = await getDocs(q1);
  let obj = null; s.forEach(d=> obj = { id:d.id, ...d.data() });
  return obj;
}

/* ─────────────────────────────
 * Boot
 * ───────────────────────────── */
// --- YouTube IFrame API 부트스트랩 (안전판) ---
// 어떤 로드 순서에서도 boot()가 반드시 한 번만 호출되도록 처리
let __bootStarted = false;
function safeBoot() {
  if (__bootStarted) return;
  __bootStarted = true;
  boot().catch(err=>{
    console.error(err);
    try { document.getElementById("v-title").textContent = "영상을 불러오지 못했습니다."; } catch {}
    setTimeout(()=> location.href="list.html", 1200);
  });
}

function initYouTubeBootstrap() {
  // 1) API가 이미 로드되어 있으면 즉시
  if (window.YT && typeof YT.Player === "function") {
    safeBoot();
    return;
  }
  // 2) YT.ready 지원 시(이미/곧 준비) – 두 경우 모두 안전
  if (window.YT && typeof YT.ready === "function") {
    YT.ready(safeBoot);
  }
  // 3) 전통 콜백(스크립트가 나중에 로드될 때)
  window.onYouTubeIframeAPIReady = safeBoot;

  // 4) 최후의 수단: 폴링 (일부 브라우저 캐싱/모듈 순서 꼬임 대비)
  const iv = setInterval(()=>{
    if (window.YT && typeof YT.Player === "function") {
      clearInterval(iv);
      safeBoot();
    }
  }, 120);
  // 6초 타임아웃 후 중지
  setTimeout(()=> clearInterval(iv), 6000);
}

// 모듈 로딩 시점에 초기화
initYouTubeBootstrap();


async function boot(){
  // 1) 파라미터 해석 → vDoc / ytId 준비
  if (docIdParam){
    const d = await fetchDocById(docIdParam);
    vDoc = d; vRefId = d.id; ytId = extractYouTubeId(d.url);
  } else if (vParam){
    ytId = extractYouTubeId(vParam);
    vDoc = { title:"(단일 재생) YouTube", cats:[], seriesKey:null, seriesTitle:null, episode:null };
  } else if (catsParam){
    const val = catsParam.trim();
    if (val.toUpperCase() === "ALL"){
      const d = await fetchNewestAny();
      if (!d) throw new Error("등록된 영상이 없습니다.");
      vDoc = d; vRefId = d.id; ytId = extractYouTubeId(d.url);
    } else {
      const catsList = val.split(",").map(s=>s.trim()).filter(Boolean);
      if (!catsList.length) throw new Error("유효한 카테고리가 없습니다.");
      const d = await fetchFirstByCats(catsList);
      if (!d) throw new Error("선택한 카테고리에 해당하는 영상이 없습니다.");
      vDoc = d; vRefId = d.id; ytId = extractYouTubeId(d.url);
    }
  } else {
    throw new Error("watch 진입 파라미터가 없습니다. (?id= / ?v= / ?cats=)");
  }

  if (!ytId) throw new Error("유효한 YouTube ID를 추출하지 못했습니다.");

  // 2) 메타 렌더
  renderMeta();

  // 3) 이전/다음 화 탐색 및 미리보기 준비
  await prepareSeriesNav();

  // 4) 플레이어 생성
  createPlayer(ytId);

  // 5) 자동다음 토글
  elAuto.checked = getBool(KEY_AUTONEXT, true);
  elAuto.addEventListener("change", ()=> setBool(KEY_AUTONEXT, elAuto.checked));

  // 6) 컨트롤 배선
  wireControls();

  // 7) lastWatch 기록
  saveLastWatch({
    videoId: ytId,
    title: vDoc?.title || "(단일 재생)",
    seriesKey: vDoc?.seriesKey || null,
    episode: vDoc?.episode ?? null,
    docId: vRefId || null,
  });

  // 8) 첫 제스처 포착해서 전체화면/가로잠금 시도 (옵션)
  setupFirstGestureFullscreen();
}

/* ─────────────────────────────
 * Render / Meta
 * ───────────────────────────── */
function renderMeta(){
  elTitle.textContent = vDoc?.title || "(제목 없음)";
  if (vDoc?.seriesKey && typeof vDoc?.episode === "number"){
    const st = vDoc.seriesTitle || "시리즈";
    elSeries.textContent = `${st} · ${vDoc.episode}화`;
  } else {
    elSeries.textContent = "시리즈 정보 없음";
  }

  elChips.innerHTML = "";
  (Array.isArray(vDoc?.cats) ? vDoc.cats : []).forEach(c=>{
    const span = document.createElement("span");
    span.className = "chip";
    span.textContent = c;
    elChips.appendChild(span);
  });
}

/* ─────────────────────────────
 * Series Prev/Next + Preview
 * ───────────────────────────── */
async function prepareSeriesNav(){
  elPrev.disabled = true; elNext.disabled = true;
  elPrev.onclick = null;   elNext.onclick = null;
  elNextPreview.textContent = "";

  if (!vDoc?.seriesKey || typeof vDoc?.episode !== "number") return;

  const k = vDoc.seriesKey, ep = vDoc.episode;

  const qNext = query(
    collection(db,"videos"),
    where("seriesKey","==",k),
    where("episode",">",ep),
    orderBy("episode","asc"),
    limit(1)
  );
  const qPrev = query(
    collection(db,"videos"),
    where("seriesKey","==",k),
    where("episode","<",ep),
    orderBy("episode","desc"),
    limit(1)
  );

  const [ns, ps] = await Promise.all([getDocs(qNext), getDocs(qPrev)]);
  let nextDoc = null, prevDoc = null;
  ns.forEach(d=> nextDoc = { id:d.id, ...d.data() });
  ps.forEach(d=> prevDoc = { id:d.id, ...d.data() });

  if (prevDoc){
    elPrev.disabled = false;
    elPrev.onclick = ()=> toDoc(prevDoc.id);
  }
  if (nextDoc){
    elNext.disabled = false;
    elNext.onclick = ()=> toDoc(nextDoc.id);
    const title = nextDoc.title || "다음 화";
    elNextPreview.innerHTML = "";
    const wrap = document.createElement("div");
    const tid = extractYouTubeId(nextDoc.url);
    const img = tid ? `https://i.ytimg.com/vi/${tid}/hqdefault.jpg` : null;
    wrap.style.display = "flex";
    wrap.style.alignItems = "center";
    wrap.style.gap = "8px";

    if (img){
      const th = document.createElement("img");
      th.src = img; th.alt = "다음 화 미리보기"; th.loading = "lazy";
      th.width = 80; th.height = 45; th.style.borderRadius = "6px";
      // 프리로드
      const pre = new Image(); pre.src = img;
      wrap.appendChild(th);
    }
    const t = document.createElement("div");
    t.textContent = `다음 화: ${title}`;
    wrap.appendChild(t);

    elNextPreview.appendChild(wrap);
  }
}

function toDoc(id){
  location.href = `watch.html?id=${encodeURIComponent(id)}`;
}

/* ─────────────────────────────
 * YouTube Player
 * ───────────────────────────── */
function createPlayer(videoId){
  player = new YT.Player("player", {
    videoId,
    playerVars: { modestbranding:1, rel:0, playsinline:1, fs:1 },
    events: { onReady: onPlayerReady, onStateChange: onPlayerStateChange }
  });
}

function onPlayerReady(){
  // 1) 위치 복원
  const key = posKeyFor(ytId);
  const saved = Number(localStorage.getItem(key) || "0");
  if (saved > 5){
    resumeTimer = setTimeout(()=>{ try{ player.seekTo(saved, true); }catch{} }, 2000);
  }

  // 2) 환경설정 적용 (음소거/배속/잠금)
  if (getBool(KEY_PREF_MUTE, false)){
    try { player.mute(); } catch {}
  }
  const spd = Number(localStorage.getItem(KEY_SPEED) || "0");
  if (spd && !Number.isNaN(spd)){
    try {
      const rates = player.getAvailablePlaybackRates() || [0.75,1,1.25,1.5,1.75,2];
      if (rates.includes(spd)) {
        player.setPlaybackRate(spd);
        elSpeed.textContent = `배속 ${spd.toFixed(2)}×`;
      }
    } catch {}
  }
  if (getBool(KEY_PREF_LOCK, false)){
    lockOn = true; elLock.checked = true; elLockLayer.classList.add("active");
  }

  // 3) 웨이크락은 재생 시작 시 획득
}

async function onPlayerStateChange(e){
  const s = e.data;
  if (s === YT.PlayerState.PLAYING){
    requestWakeLock();
    if (!saveTimer){
      saveTimer = setInterval(()=>{
        try {
          const t = Math.floor(player.getCurrentTime());
          localStorage.setItem(posKeyFor(ytId), String(t));
        } catch {}
      }, 5000);
    }
  } else if (s === YT.PlayerState.PAUSED){
    // 유지
  } else if (s === YT.PlayerState.ENDED){
    releaseWakeLock();
    try { clearInterval(saveTimer); } catch {}
    saveTimer = null;
    localStorage.removeItem(posKeyFor(ytId));

    if (elAuto.checked && !elNext.disabled){
      elNext.click();
    }
  }
}

/* ─────────────────────────────
 * Wake Lock / Fullscreen / Orientation
 * ───────────────────────────── */
async function requestWakeLock(){
  try {
    if ("wakeLock" in navigator){
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release", ()=>{ wakeLock = null; });
    }
  } catch {}
}
function releaseWakeLock(){
  try { if (wakeLock){ wakeLock.release(); wakeLock = null; } } catch {}
}

async function tryFullscreenAndLandscape(){
  const root = document.documentElement;
  try {
    if (!document.fullscreenElement) await root.requestFullscreen();
  } catch {}
  try {
    if (screen.orientation && screen.orientation.lock){
      await screen.orientation.lock("landscape");
    }
  } catch {}
}

function setupFirstGestureFullscreen(){
  const wantFS = getBool(KEY_PREF_FS, false);
  if (!wantFS) return;

  const once = async ()=> {
    if (firstGestureUsed) return;
    firstGestureUsed = true;
    document.removeEventListener("pointerdown", once, true);
    await tryFullscreenAndLandscape();
    try { player.playVideo(); } catch {}
  };
  document.addEventListener("pointerdown", once, true);
}

/* ─────────────────────────────
 * Controls / Shortcuts
 * ───────────────────────────── */
function wireControls(){
  // 화면잠금
  elLock.addEventListener("change", ()=>{
    lockOn = elLock.checked;
    elLockLayer.classList.toggle("active", lockOn);
  });

  // 전체화면(사용자 제스처)
  elFull.addEventListener("click", async ()=>{
    await tryFullscreenAndLandscape();
    try { player.playVideo(); } catch {}
  });

  // 음소거
  elMute.addEventListener("click", ()=>{
    try {
      player.isMuted() ? player.unMute() : player.mute();
    } catch {}
  });

  // 배속 순환
  elSpeed.addEventListener("click", ()=>{
    try {
      const cur = player.getPlaybackRate();
      const rates = player.getAvailablePlaybackRates() || [0.75,1,1.25,1.5,1.75,2];
      const idx = rates.indexOf(cur);
      const next = rates[(idx + 1) % rates.length];
      player.setPlaybackRate(next);
      elSpeed.textContent = `배속 ${next.toFixed(2)}×`;
      localStorage.setItem(KEY_SPEED, String(next));
    } catch {}
  });

  // 키보드 단축키
  window.addEventListener("keydown", (ev)=>{
    if (lockOn){ ev.preventDefault(); return; }
    try {
      switch (ev.key){
        case "k": case "K": togglePlay(); break;
        case "j": case "J": seekRel(-10); break;
        case "l": case "L": seekRel(10); break;
        case "m": case "M": player.isMuted()?player.unMute():player.mute(); break;
        case ",": stepSpeed(-0.25); break;
        case ".": stepSpeed(0.25); break;
        case "[": if (!elPrev.disabled) elPrev.click(); break;
        case "]": if (!elNext.disabled) elNext.click(); break;
        case "f": case "F": tryFullscreenAndLandscape(); break;
      }
    } catch {}
  }, { passive: true });

  // 시리즈 스와이프 내비 (옵션)
  if (getBool(KEY_PREF_SWIPE, true)){
    initSwipeForSeries();
  }

  // 잠금 레이어 터치 차단
  elLockLayer.addEventListener("click", (e)=>{ if (lockOn) e.stopPropagation(); });
}

function togglePlay(){
  const s = player.getPlayerState();
  if (s === YT.PlayerState.PLAYING) player.pauseVideo();
  else player.playVideo();
}
function seekRel(dt){
  const t = player.getCurrentTime();
  player.seekTo(Math.max(0, t + dt), true);
}
function stepSpeed(dv){
  try {
    const cur = player.getPlaybackRate();
    let nx = Math.max(0.25, Math.min(2, (Math.round((cur + dv) * 100) / 100)));
    player.setPlaybackRate(nx);
    elSpeed.textContent = `배속 ${nx.toFixed(2)}×`;
    localStorage.setItem(KEY_SPEED, String(nx));
  } catch {}
}

/* ─────────────────────────────
 * Swipe (Prev/Next in series)
 * ───────────────────────────── */
function initSwipeForSeries(){
  if (!("ontouchstart" in window)) return;    // 모바일만
  let sx=0, sy=0, t0=0, tracking=false;
  const THX = 80, MAXY = 80, MAXT = 700;
  const getPt = (e)=> e.touches?.[0] || e;

  function start(e){
    const p = getPt(e); if(!p) return;
    sx = p.clientX; sy = p.clientY; t0 = Date.now(); tracking = true;
  }
  function end(e){
    if(!tracking) return; tracking = false;
    const p = getPt(e); if(!p) return;
    const dx = p.clientX - sx, dy = p.clientY - sy, dt = Date.now() - t0;
    if (Math.abs(dy) > MAXY || dt > MAXT) return;
    if (dx <= -THX && !elNext.disabled) elNext.click();
    if (dx >=  THX && !elPrev.disabled) elPrev.click();
  }
  document.addEventListener("touchstart", start, { passive: true });
  document.addEventListener("touchend",   end,   { passive: true });
}

/* ─────────────────────────────
 * Error / Cleanup
 * ───────────────────────────── */
function showError(msg){
  try { elTitle.textContent = msg; } catch {}
  try { elSeries.textContent = "문제 발생"; } catch {}
}
window.addEventListener("beforeunload", ()=>{
  try { clearInterval(saveTimer); } catch {}
  try { clearTimeout(resumeTimer); } catch {}
  releaseWakeLock();
});

/* ─────────────────────────────
 * Firestore Indexes (필수)
 * ─────────────────────────────
1) 카테고리 기반 첫 영상:
   - collection: videos
   - where: cats array-contains-any
   - orderBy: createdAt desc
   → 조합 색인 필요 (에러 콘솔 링크로 생성)

2) 유튜브 업로드순 정렬:
   - where: cats array-contains-any
   - orderBy: seriesSortAt asc
   → 조합 색인 필요

3) 제목 가나다순 정렬:
   - where: cats array-contains-any
   - orderBy: title asc
   → 조합 색인 필요

4) 시리즈 이전/다음:
   - where: seriesKey == ...
   - where: episode > / <
   - orderBy: episode asc/desc
   → 조합 색인 필요
────────────────────────────────*/
