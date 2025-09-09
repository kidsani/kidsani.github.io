// js/watch.js (KidsAni Watch v0.4.0)
// 요구사항: 로그인 없이 읽기 가능, 시리즈 이전/다음, 자동다음, 위치복원, 화면잠금, 웨이크락, 가로전체화면 시도

import { db } from "./firebase-init.js";

// Firestore SDK (필요 모듈만 개별 임포트)
import {
  doc, getDoc, collection, query, where, orderBy, limit, getDocs
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

/* ───────────── 유틸 ───────────── */
const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
// 진입 방식 1) ?id=<videos/{id} 문서ID>  2) ?v=<YouTubeID>
const docId = params.get("id");
const ytvFromParam = params.get("v")?.trim() || null;

function extractYouTubeId(urlOrId) {
  if (!urlOrId) return null;
  // 이미 ID 형태면(11자 가정) 그대로 사용
  const idLike = urlOrId.match(/^[a-zA-Z0-9_-]{11}$/);
  if (idLike) return idLike[0];

  // URL에서 추출
  const m =
    urlOrId.match(/[?&]v=([^&#]+)/) || // youtu.be 제외 일반 URL
    urlOrId.match(/youtu\.be\/([^?&#]+)/) ||
    urlOrId.match(/embed\/([^?&#]+)/);
  return m ? m[1] : null;
}

function saveLastWatch({ videoId, title, seriesKey, episode, docId }) {
  const data = { videoId, title, seriesKey: seriesKey || null, episode: episode ?? null, docId: docId || null, at: Date.now() };
  localStorage.setItem("lastWatch", JSON.stringify(data));
}

function getAutoNextDefault() {
  const s = localStorage.getItem("autonext");
  return s === null ? true : s === "true";
}

function setAutoNext(val) {
  localStorage.setItem("autonext", String(val));
}

/* ────────── 상태 ────────── */
let player = null;
let ytId = null;
let vDoc = null;           // Firestore 비디오 문서 데이터
let vRefId = null;         // Firestore 문서 ID
let wakeLock = null;
let lockOn = false;

/* ────────── DOM ────────── */
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

/* ────────── YouTube API ────────── */
// onYouTubeIframeAPIReady 전역 훅 필요: window에 심는다.
window.onYouTubeIframeAPIReady = () => {
  boot().catch(console.error);
};

async function boot() {
  // 1) 문서/파라미터 로드
  if (docId) {
    const snap = await getDoc(doc(db, "videos", docId));
    if (!snap.exists()) throw new Error("영상 문서를 찾을 수 없습니다.");
    vDoc = snap.data();
    vRefId = snap.id;
    ytId = extractYouTubeId(vDoc.url);
  } else if (ytvFromParam) {
    ytId = extractYouTubeId(ytvFromParam);
    vDoc = {
      title: "(단일 재생) YouTube",
      cats: [],
      seriesKey: null, seriesTitle: null, episode: null
    };
  } else {
    throw new Error("watch 페이지 진입 파라미터가 없습니다. (?id=문서ID 또는 ?v=YouTubeID)");
  }

  if (!ytId) throw new Error("유효한 YouTube ID를 추출하지 못했습니다.");

  // 2) 메타 표시
  renderMeta();

  // 3) 다음/이전 화 상태 확인
  await prepareSeriesNav();

  // 4) 플레이어 생성
  createPlayer(ytId);

  // 5) 자동다음 설정 동기화
  elAuto.checked = getAutoNextDefault();
  elAuto.addEventListener("change", () => setAutoNext(elAuto.checked));

  // 6) 컨트롤 이벤트
  wireControls();

  // 7) lastWatch 기록
  saveLastWatch({
    videoId: ytId,
    title: vDoc?.title || "(단일 재생)",
    seriesKey: vDoc?.seriesKey || null,
    episode: vDoc?.episode ?? null,
    docId: vRefId || null,
  });
}

function renderMeta() {
  elTitle.textContent = vDoc?.title || "(제목 없음)";
  const seriesKey = vDoc?.seriesKey || null;
  if (seriesKey) {
    const epi = vDoc?.episode ?? "?";
    const st = vDoc?.seriesTitle || "시리즈";
    elSeries.textContent = `${st} · ${epi}화`;
  } else {
    elSeries.textContent = "시리즈 정보 없음";
  }

  elChips.innerHTML = "";
  const cats = Array.isArray(vDoc?.cats) ? vDoc.cats : [];
  cats.forEach(c => {
    const span = document.createElement("span");
    span.className = "chip";
    span.textContent = c;
    elChips.appendChild(span);
  });
}

async function prepareSeriesNav() {
  elPrev.disabled = true;
  elNext.disabled = true;
  elNextPreview.textContent = "";

  if (!vDoc?.seriesKey || typeof vDoc?.episode !== "number") return;

  const seriesKey = vDoc.seriesKey;
  const epi = vDoc.episode;

  // 다음 화
  const qNext = query(
    collection(db, "videos"),
    where("seriesKey", "==", seriesKey),
    where("episode", ">", epi),
    orderBy("episode", "asc"),
    limit(1)
  );
  const nextSnap = await getDocs(qNext);
  let nextDoc = null;
  nextSnap.forEach(d => { nextDoc = { id: d.id, ...d.data() }; });

  // 이전 화
  const qPrev = query(
    collection(db, "videos"),
    where("seriesKey", "==", seriesKey),
    where("episode", "<", epi),
    orderBy("episode", "desc"),
    limit(1)
  );
  const prevSnap = await getDocs(qPrev);
  let prevDoc = null;
  prevSnap.forEach(d => { prevDoc = { id: d.id, ...d.data() }; });

  if (prevDoc) {
    elPrev.disabled = false;
    elPrev.onclick = () => toDoc(prevDoc.id);
  } else {
    elPrev.disabled = true;
    elPrev.onclick = null;
  }

  if (nextDoc) {
    elNext.disabled = false;
    elNext.onclick = () => toDoc(nextDoc.id);
    const previewTitle = nextDoc.title || "다음 화";
    elNextPreview.textContent = `다음 화: ${previewTitle}`;
  } else {
    elNext.disabled = true;
    elNext.onclick = null;
  }
}

function toDoc(id) {
  // 동일 페이지 내 전환으로 히스토리 깔끔 유지
  location.href = `watch.html?id=${encodeURIComponent(id)}`;
}

/* ────────── 플레이어 ────────── */
function createPlayer(videoId) {
  player = new YT.Player("player", {
    videoId,
    playerVars: {
      modestbranding: 1,
      rel: 0,
      playsinline: 1,
      fs: 1,
    },
    events: {
      onReady: onPlayerReady,
      onStateChange: onPlayerStateChange,
    }
  });
}

let resumeTimer = null;
let saveTimer = null;

function onPlayerReady(e) {
  // 위치 복원
  const key = `watchpos:${ytId}`;
  const saved = Number(localStorage.getItem(key) || "0");
  if (saved > 5) {
    // 2초 뒤 점프(초기 광고/프리롤 대비)
    resumeTimer = setTimeout(() => {
      try {
        player.seekTo(saved, true);
      } catch {}
    }, 2000);
  }

  // 웨이크락 시도 (재생 시)
  // 전체화면/가로잠금 시도는 사용자 제스처 버튼에서 수행
}

async function requestWakeLock() {
  try {
    if ("wakeLock" in navigator) {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release", () => { wakeLock = null; });
    }
  } catch {}
}

function releaseWakeLock() {
  try {
    if (wakeLock) { wakeLock.release(); wakeLock = null; }
  } catch {}
}

async function tryFullscreenAndLandscape() {
  const root = document.documentElement;
  try {
    if (!document.fullscreenElement) {
      await root.requestFullscreen();
    }
  } catch {}
  try {
    if (screen.orientation && screen.orientation.lock) {
      await screen.orientation.lock("landscape");
    }
  } catch {}
}

function onPlayerStateChange(e) {
  const state = e.data;
  // 재생 중: 위치 저장, 웨이크락
  if (state === YT.PlayerState.PLAYING) {
    requestWakeLock();
    if (!saveTimer) {
      saveTimer = setInterval(() => {
        try {
          const t = Math.floor(player.getCurrentTime());
          localStorage.setItem(`watchpos:${ytId}`, String(t));
        } catch {}
      }, 5000);
    }
  }
  // 일시정지: 웨이크락 유지(O), 저장은 계속
  if (state === YT.PlayerState.PAUSED) {
    // no-op
  }
  // 종료: 자동 다음화
  if (state === YT.PlayerState.ENDED) {
    releaseWakeLock();
    clearInterval(saveTimer); saveTimer = null;
    localStorage.removeItem(`watchpos:${ytId}`); // 다 본 영상은 위치 초기화

    if (elAuto.checked && !elNext.disabled) {
      elNext.click();
    }
  }
}

/* ────────── 컨트롤 & 잠금 ────────── */
function wireControls() {
  // 자동다음 체크는 boot에서 이미 연결

  elLock.addEventListener("change", () => {
    lockOn = elLock.checked;
    elLockLayer.classList.toggle("active", lockOn);
  });

  // 전체화면(사용자 제스처)
  elFull.addEventListener("click", async () => {
    await tryFullscreenAndLandscape();
    // 최초 재생도 보장
    try { player.playVideo(); } catch {}
  });

  // 음소거
  elMute.addEventListener("click", () => {
    try {
      const m = player.isMuted();
      if (m) player.unMute(); else player.mute();
    } catch {}
  });

  // 배속
  elSpeed.addEventListener("click", () => {
    try {
      const cur = player.getPlaybackRate();
      // 유튜브 지원 속도 목록 중에서 다음 값
      const rates = player.getAvailablePlaybackRates() || [0.75, 1, 1.25, 1.5, 1.75, 2];
      const idx = rates.indexOf(cur);
      const next = rates[(idx + 1) % rates.length];
      player.setPlaybackRate(next);
      elSpeed.textContent = `배속 ${next.toFixed(2)}×`;
    } catch {}
  });

  // 키보드 단축키
  window.addEventListener("keydown", (ev) => {
    if (lockOn) { ev.preventDefault(); return; }
    try {
      switch (ev.key) {
        case "k":
        case "K":
          togglePlay(); break;
        case "j":
        case "J":
          seekRel(-10); break;
        case "l":
        case "L":
          seekRel(10); break;
        case "m":
        case "M":
          if (player.isMuted()) player.unMute(); else player.mute(); break;
        case ",":
          stepSpeed(-0.25); break;
        case ".":
          stepSpeed(0.25); break;
        case "[":
          if (!elPrev.disabled) elPrev.click(); break;
        case "]":
          if (!elNext.disabled) elNext.click(); break;
      }
    } catch {}
  });

  // 잠금 레이어 클릭 막기
  elLockLayer.addEventListener("click", (e) => {
    if (lockOn) e.stopPropagation();
  });
}

function togglePlay() {
  const s = player.getPlayerState();
  if (s === YT.PlayerState.PLAYING) player.pauseVideo();
  else player.playVideo();
}

function seekRel(dt) {
  const t = player.getCurrentTime();
  player.seekTo(Math.max(0, t + dt), true);
}

function stepSpeed(dv) {
  const cur = player.getPlaybackRate();
  let next = Math.max(0.25, Math.min(2, (Math.round((cur + dv)*100)/100)));
  player.setPlaybackRate(next);
  elSpeed.textContent = `배속 ${next.toFixed(2)}×`;
}

/* ────────── 정리 ────────── */
window.addEventListener("beforeunload", () => {
  try { clearInterval(saveTimer); } catch {}
  try { clearTimeout(resumeTimer); } catch {}
  releaseWakeLock();
});

/* ────────── Firestore 인덱스 안내 ──────────
시리즈 이전/다음 조회를 위해 아래 조합 색인이 필요할 수 있습니다.

videos: seriesKey == ... , episode asc
videos: seriesKey == ... , episode desc

콘솔에서 쿼리 에러 링크로 생성하시면 됩니다.
──────────────────────────────────────────*/
