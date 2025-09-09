// js/list.js

import { db, auth } from './firebase-init.js';
import { onAuthStateChanged } from './auth.js';
import { CATEGORY_GROUPS } from './categories.js';
import { bindIndexSwipe } from './swipe-index.js';
import {
  collection, query, where, orderBy, limit, startAfter, getDocs
} from 'https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js';

// --- DOM 요소 ---
const $categoryFilters = document.getElementById('category-filters');
const $query = document.getElementById('query');
const $sort = document.getElementById('sort');
const $seriesHeader = document.getElementById('series-header');
const $msg = document.getElementById('msg');
const $cards = document.getElementById('cards');
const $btnMore = document.getElementById('btnMore');

// --- 상태 관리 ---
const PAGE_SIZE = 24;
let currentState = { seriesSort: 'asc' }; // [수정] 시리즈 정렬 기본값 추가
let lastDoc = null;
let hasMore = true;
let isLoading = false;
let currentRenderedIds = [];
const categoriesState = { labelMap: {} };

document.addEventListener('DOMContentLoaded', init);

async function init() {
  initTopbar();
  initCategoriesUI();
  
  const urlState = readStateFromURL();
  currentState = Object.keys(urlState).length > 0 ? urlState : loadLocalDefaults();
  currentState.seriesSort = currentState.seriesSort || 'asc';
  
  updateUIFromState();
  bindEvents();
  bindIndexSwipe();

  loadList(true);
}

// --- 상단바/드롭다운 (재사용) ---
function initTopbar() {
  const signupLink = document.getElementById('signupLink');
  const signinLink = document.getElementById('signinLink');
  const welcome = document.getElementById('welcome');
  const menuBtn = document.getElementById('menuBtn');
  const dropdown = document.getElementById('dropdownMenu');
  const btnSignOut = document.getElementById('btnSignOut');
  const btnGoUpload = document.getElementById('btnGoUpload');
  const btnManageUploads = document.getElementById('btnManageUploads');

  onAuthStateChanged(auth, (user) => {
    const loggedIn = !!user;
    signupLink?.classList.toggle('hidden', loggedIn);
    signinLink?.classList.toggle('hidden', loggedIn);
    if (welcome) welcome.textContent = loggedIn ? `Welcome! ${user?.displayName || '회원'}` : '';
  });

  menuBtn?.addEventListener('click', (e) => { e.stopPropagation(); dropdown?.classList.toggle('hidden'); });
  document.addEventListener('click', () => dropdown?.classList.add('hidden'));
  dropdown?.addEventListener('click', e => e.stopPropagation());
  
  btnSignOut?.addEventListener('click', () => auth.signOut());
  btnGoUpload?.addEventListener('click', () => location.href = 'upload.html');
  btnManageUploads?.addEventListener('click', () => location.href = 'manage-uploads.html'; });
}


// --- 카테고리 UI 초기화 (style.css .group, .child-grid 구조 사용) ---
function initCategoriesUI() {
  const frag = document.createDocumentFragment();
  CATEGORY_GROUPS.forEach(group => {
    const fieldset = document.createElement('fieldset');
    fieldset.className = 'group';
    
    const legend = document.createElement('legend');
    legend.textContent = group.label;
    fieldset.appendChild(legend);

    const grid = document.createElement('div');
    grid.className = 'child-grid';

    group.children.forEach(cat => {
      categoriesState.labelMap[cat.value] = cat.label;

      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.name = 'cats';
      input.value = cat.value;
      
      label.appendChild(input);
      label.append(cat.label);
      grid.appendChild(label);
    });
    fieldset.appendChild(grid);
    frag.appendChild(fieldset);
  });
  $categoryFilters.appendChild(frag);
}

// --- 상태 <-> URL 동기화 ---
function readStateFromURL() {
  const params = new URLSearchParams(location.search);
  const state = {};
  if (params.has('cats')) state.cats = params.get('cats').split(',').filter(Boolean);
  if (params.has('sort')) state.sort = params.get('sort');
  if (params.has('query')) state.query = params.get('query');
  if (params.has('seriesKey')) state.seriesKey = params.get('seriesKey');
  if (params.has('seriesSort')) state.seriesSort = params.get('seriesSort'); // [추가]
  return state;
}

function writeStateToURL(state) {
  const params = new URLSearchParams();
  if (state.cats?.length) params.set('cats', state.cats.join(','));
  if (state.sort) params.set('sort', state.sort);
  if (state.query) params.set('query', state.query);
  if (state.seriesKey) {
    params.set('seriesKey', state.seriesKey);
    params.set('seriesSort', state.seriesSort || 'asc'); // [추가]
  }
  
  const newUrl = `${location.pathname}?${params.toString()}`;
  history.pushState(state, '', newUrl);
}

function loadLocalDefaults() {
  const selectedCats = JSON.parse(localStorage.getItem('selectedCats') || '[]');
  return { cats: Array.isArray(selectedCats) ? selectedCats : [], sort: 'latest', query: '' };
}

function updateUIFromState() {
  document.querySelectorAll('input[name="cats"]').forEach(input => {
    input.checked = currentState.cats?.includes(input.value) || false;
  });
  $sort.value = currentState.sort || 'latest';
  $query.value = currentState.query || '';
}

// --- 이벤트 바인딩 ---
function bindEvents() {
  $categoryFilters.addEventListener('change', () => {
    currentState.cats = Array.from(document.querySelectorAll('input[name="cats"]:checked')).map(el => el.value);
    if (currentState.seriesKey) delete currentState.seriesKey;
    triggerReload();
  });
  $sort.addEventListener('change', () => { currentState.sort = $sort.value; triggerReload(); });
  $query.addEventListener('input', debounce(() => { currentState.query = $query.value.trim(); triggerReload(); }, 300));
  $btnMore.addEventListener('click', () => loadList(false));
  $cards.addEventListener('click', handleCardClick);
}

function handleCardClick(e) {
  const card = e.target.closest('.card');
  if (!card) return;

  const vid = card.dataset.id;
  const clickedIndex = currentRenderedIds.indexOf(vid);

  sessionStorage.setItem('watchCtx', JSON.stringify({
      ids: currentRenderedIds,
      idx: clickedIndex,
      state: currentState
  }));
  location.href = `watch.html?vid=${encodeURIComponent(vid)}`;
}

function triggerReload() {
  writeStateToURL(currentState);
  loadList(true);
}

// --- Firestore 쿼리 ---
function buildQueryByState(state) {
  let q = collection(db, 'videos');
  const constraints = [];

  if (state.seriesKey) {
    constraints.push(where('seriesKey', '==', state.seriesKey));
    // [수정] 시리즈 보기 시, 상태에 따라 정렬 방향 결정
    constraints.push(orderBy('episode', state.seriesSort || 'asc'));
    return query(q, ...constraints);
  }

  if (state.cats?.length) {
    constraints.push(where('cats', 'array-contains', state.cats[0]));
  }

  const sortField = { latest: 'createdAt', oldest: 'createdAt', title_asc: 'title', series_latest: 'seriesSortAt' }[state.sort] || 'createdAt';
  const sortDir = state.sort === 'oldest' || state.sort === 'title_asc' ? 'asc' : 'desc';
  constraints.push(orderBy(sortField, sortDir));
  
  return query(q, ...constraints);
}

async function fetchPage(q) {
  if (isLoading || !hasMore) return { items: [] };
  isLoading = true;
  $msg.textContent = lastDoc ? '더 불러오는 중...' : '불러오는 중...';
  $btnMore.parentElement.style.display = 'block';

  try {
    const queryConstraints = [limit(PAGE_SIZE)];
    if (lastDoc) queryConstraints.push(startAfter(lastDoc));
    
    const snapshot = await getDocs(query(q, ...queryConstraints));
    lastDoc = snapshot.docs[snapshot.docs.length - 1] || null;
    hasMore = snapshot.size === PAGE_SIZE;
    return { items: snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) };
  } catch (error) {
    console.error("Firestore fetch error:", error);
    $msg.textContent = '목록을 불러오는데 실패했습니다. 인덱스 설정이 필요할 수 있습니다.';
    return { error: true, items: [] };
  } finally {
    isLoading = false;
  }
}

// --- 로드 및 렌더링 ---
async function loadList(isNewQuery = false) {
  if (isNewQuery) {
    lastDoc = null;
    hasMore = true;
    currentRenderedIds = [];
    $cards.innerHTML = '';
  }

  const baseQuery = buildQueryByState(currentState);
  const { items, error } = await fetchPage(baseQuery);
  if (error) return;

  const filteredItems = filterItemsClientSide(items);

  renderList(filteredItems, isNewQuery);
  updateStatus(filteredItems.length);

  // [추가] 시리즈 헤더 렌더링
  if (isNewQuery && currentState.seriesKey && items.length > 0) {
      renderSeriesHeader(items[0].seriesTitle, items.length);
  } else if (!currentState.seriesKey) {
      $seriesHeader.style.display = 'none';
  }
}

function filterItemsClientSide(items) {
    let result = items;
    if (currentState.cats?.length > 1) {
        result = result.filter(item => currentState.cats.slice(1).every(cat => item.cats.includes(cat)));
    }
    if (currentState.query) {
        result = result.filter(item => item.title.toLowerCase().includes(currentState.query.toLowerCase()));
    }
    return result;
}

// [수정] 카드 렌더링 함수: style.css 구조에 맞게 수정
function renderList(items) {
  const frag = document.createDocumentFragment();
  items.forEach(item => {
    currentRenderedIds.push(item.id);
    const card = document.createElement('li');
    card.className = 'card';
    card.dataset.id = item.id;
    
    const thumb = item.thumb || `https://i.ytimg.com/vi/${getYoutubeId(item.url)}/hqdefault.jpg`;
    const chipsHTML = (item.cats || []).map(cat => `<span class="chip">${categoriesState.labelMap[cat] || cat}</span>`).join('');

    card.innerHTML = `
      <div class="left">
        <div class="title" title="${item.title}">${item.title}</div>
        <div class="url">${item.url}</div>
        <div class="chips">${chipsHTML}</div>
      </div>
      <div class="right">
        <div class="thumb-wrap">
            <img class="thumb" src="${thumb}" alt="" loading="lazy"/>
        </div>
      </div>
    `;
    frag.appendChild(card);
  });
  $cards.appendChild(frag);
}

// [추가] 시리즈 헤더 렌더링 및 이벤트 바인딩 함수
function renderSeriesHeader(title, count) {
    $seriesHeader.innerHTML = `
        <div>
            <h3>${title}</h3>
            <p>총 ${count}개의 에피소드</p>
        </div>
        <button id="seriesSortToggle" class="series-sort-toggle">
            ${currentState.seriesSort === 'asc' ? '오름차순' : '내림차순'}
        </button>
    `;
    $seriesHeader.style.display = 'flex';
    document.getElementById('seriesSortToggle').addEventListener('click', () => {
        currentState.seriesSort = currentState.seriesSort === 'asc' ? 'desc' : 'asc';
        triggerReload();
    });
}

function updateStatus() {
    if (currentRenderedIds.length === 0 && !hasMore) {
        $msg.textContent = '결과가 없습니다.';
        $btnMore.parentElement.style.display = 'none';
    } else {
        $msg.textContent = '';
        $btnMore.parentElement.style.display = hasMore ? 'block' : 'none';
    }
}

// --- 유틸리티 ---
function getYoutubeId(url = '') {
  const match = url.match(/(?:youtu\.be\/|v=|\/embed\/|\/shorts\/|vi\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : '';
}

function debounce(func, delay) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), delay);
  };
}
