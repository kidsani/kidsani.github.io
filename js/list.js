// js/list.js — Gemini Final Version
import { auth, db } from './firebase-init.js';
import {
  collection, query, where, orderBy, limit, startAfter, getDocs,
  doc, getDoc, updateDoc, deleteDoc
} from 'https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js';
import { onAuthStateChanged } from './auth.js';
import { CATEGORY_GROUPS } from './categories.js';
import { bindIndexSwipe } from './swipe-index.js';

// --- 유틸리티 및 상수 ---
const $ = (sel, root = document) => root.querySelector(sel);
const PAGE_SIZE = 30;

// --- 상태 관리 객체 ---
const state = {
  user: null,
  isAdmin: false,
  cat: '',
  sortField: 'createdAt',
  sortDir: 'desc',
  kw: '',
  items: [],
  lastDoc: null,
  loading: false,
  reachedEnd: false,
  selectedIds: new Set(),
  io: null // IntersectionObserver instance
};

// --- 초기화 ---
document.addEventListener('DOMContentLoaded', init);

function init() {
  // 1. UI 요소 캐싱
  const elements = {
    catSelect: $('#catSelect'),
    sortSelect: $('#sortSelect'),
    keyword: $('#keyword'),
    refreshBtn: $('#refreshBtn'),
    list: $('#list'),
    empty: $('#empty'),
    errorBanner: $('#errorBanner'),
    sentinel: $('#sentinel'),
    selCount: $('#selCount'),
    bulkChangeBtn: $('#bulkChangeBtn'),
    bulkDeleteBtn: $('#bulkDeleteBtn'),
    catDialog: $('#catDialog'),
    catDialogBody: $('#catDialogBody'),
    catSaveBtn: $('#catSaveBtn'),
  };

  // 2. 인증 상태 감시
  onAuthStateChanged(auth, async (user) => {
    state.user = user || null;
    state.isAdmin = user ? await isAdmin(user.uid) : false;
    syncBulkButtons(elements);
    resetAndLoad(elements); // 로그인/아웃 시 목록 새로고침
  });

  // 3. UI 및 이벤트 초기화
  initCategoriesSelect(elements.catSelect);
  loadPrefs();
  updateUIToReflectState(elements);
  bindEvents(elements);
  bindIndexSwipe(); // 스와이프 기능 활성화
}

// --- 이벤트 바인딩 ---
function bindEvents(elements) {
  elements.refreshBtn.addEventListener('click', () => resetAndLoad(elements));
  elements.keyword.addEventListener('input', debounce(() => {
    state.kw = elements.keyword.value.trim().toLowerCase();
    savePrefs();
    applyClientSearch(elements.list);
  }, 300));

  elements.sortSelect.addEventListener('change', () => {
    const [field, dir] = elements.sortSelect.value.split('_');
    state.sortField = field;
    state.sortDir = dir;
    savePrefs();
    resetAndLoad(elements);
  });

  elements.catSelect.addEventListener('change', () => {
    state.cat = elements.catSelect.value;
    savePrefs();
    resetAndLoad(elements);
  });
  
  // 무한 스크롤
  state.io = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && !state.loading && !state.reachedEnd) {
      loadMore(elements);
    }
  }, { rootMargin: '200px' });
  state.io.observe(elements.sentinel);

  // 일괄 작업 버튼
  elements.bulkChangeBtn.addEventListener('click', () => {
    if (state.selectedIds.size > 0) openCategoryDialog(elements, [...state.selectedIds]);
  });
  elements.bulkDeleteBtn.addEventListener('click', () => {
    if (state.selectedIds.size > 0) onBulkDelete(elements, [...state.selectedIds]);
  });
  elements.catSaveBtn.addEventListener('click', (e) => {
    e.preventDefault();
    saveCategoryDialog(elements);
    elements.catDialog.close();
  });
}

// --- 데이터 로딩 및 쿼리 ---
function buildQuery() {
  const q = collection(db, 'videos');
  const constraints = [];
  if (state.cat) constraints.push(where('cats', 'array-contains', state.cat));
  constraints.push(orderBy(state.sortField, state.sortDir));
  if (state.lastDoc) constraints.push(startAfter(state.lastDoc));
  constraints.push(limit(PAGE_SIZE));
  return query(q, ...constraints);
}

async function resetAndLoad(elements) {
  if (state.loading) return;
  state.items = [];
  state.lastDoc = null;
  state.reachedEnd = false;
  state.selectedIds.clear();
  elements.list.innerHTML = '';
  elements.empty.style.display = 'none';
  elements.errorBanner.style.display = 'none';
  syncBulkButtons(elements);
  await loadMore(elements, true);
}

async function loadMore(elements, isFirstLoad = false) {
  if (state.loading || state.reachedEnd) return;
  state.loading = true;

  try {
    const q = buildQuery();
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      state.reachedEnd = true;
      if (isFirstLoad) elements.empty.style.display = 'block';
      return;
    }

    state.lastDoc = snapshot.docs[snapshot.docs.length - 1];
    const newItems = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    state.items.push(...newItems);

    renderList(elements, newItems, true);
    applyClientSearch(elements.list);

  } catch (err) {
    console.error('[list] 로드 오류:', err);
    showIndexBanner(elements.errorBanner, err);
  } finally {
    state.loading = false;
  }
}

// --- 렌더링 ---
function renderList(elements, itemsToRender, append = false) {
  if (!append) elements.list.innerHTML = '';
  const frag = document.createDocumentFragment();
  itemsToRender.forEach(item => {
    frag.appendChild(createItemElement(elements, item));
  });
  elements.list.appendChild(frag);
}

function createItemElement(elements, item) {
  const li = document.createElement('article');
  li.className = 'item';
  li.dataset.id = item.id;

  const canUserEdit = canEdit(item);
  const chipsHTML = (item.cats || []).map(cat => `<span class="chip">${getCategoryLabel(cat)}</span>`).join('');

  li.innerHTML = `
    <div class="col-check">
      <input type="checkbox" data-id="${item.id}" ${!canUserEdit ? 'disabled' : ''}>
    </div>
    <div class="col-main">
      <div class="title" title="${item.title || ''}">${item.title || '(제목 없음)'}</div>
      <div class="url" title="${item.url || ''}">${item.url || ''}</div>
      <div class="chips">${chipsHTML}</div>
      <div class="meta">
        <span>${item.createdAt?.toDate ? item.createdAt.toDate().toLocaleString('ko-KR') : '-'}</span>
        ${item.seriesTitle ? `<span class="series-badge">${item.seriesTitle}</span>` : ''}
        ${typeof item.episode === 'number' ? `<span class="episode-badge">EP ${item.episode}</span>` : ''}
      </div>
    </div>
    <div class="col-side">
      <img class="thumb" src="${item.thumb || guessThumb(item.url)}" alt="썸네일" loading="lazy">
    </div>
  `;

  // [중요] watch.html 연동 및 일괄 선택 이벤트
  li.addEventListener('click', (e) => {
    if (e.target.type === 'checkbox') { // 체크박스 클릭
      const checkbox = e.target;
      if (checkbox.checked) state.selectedIds.add(item.id);
      else state.selectedIds.delete(item.id);
      syncBulkButtons(elements);
      return;
    }
    
    // 카드 클릭 -> watch.html로 이동 (컨텍스트 저장)
    const itemIndex = state.items.findIndex(i => i.id === item.id);
    const itemIds = state.items.map(i => i.id);
    
    sessionStorage.setItem('watchCtx', JSON.stringify({
        ids: itemIds,
        idx: itemIndex,
        state: { cat: state.cat, sortField: state.sortField, sortDir: state.sortDir, kw: state.kw }
    }));
    location.href = `watch.html?vid=${item.id}`;
  });

  return li;
}


// --- 기능 함수 (검색, 권한, UI 업데이트 등) ---
function applyClientSearch(listElement) {
  const q = state.kw;
  const nodes = Array.from(listElement.children);
  nodes.forEach(node => {
    if (!q) {
      node.style.display = '';
      return;
    }
    const title = $('.title', node)?.textContent?.toLowerCase() || '';
    const url = $('.url', node)?.textContent?.toLowerCase() || '';
    node.style.display = (title.includes(q) || url.includes(q)) ? '' : 'none';
  });
}

function syncBulkButtons(elements) {
  const count = state.selectedIds.size;
  elements.selCount.textContent = `선택 ${count}`;
  const canPerformAction = count > 0 && state.user;
  elements.bulkChangeBtn.disabled = !canPerformAction;
  elements.bulkDeleteBtn.disabled = !canPerformAction;
}

function canEdit(item) {
  if (!state.user) return false;
  if (state.isAdmin) return true;
  return item.ownerUid && item.ownerUid === state.user.uid;
}

async function isAdmin(uid) {
  try {
    return (await getDoc(doc(db, 'admins', uid))).exists();
  } catch { return false; }
}

function showIndexBanner(bannerElement, err) {
  const msg = err?.message || '';
  const linkMatch = msg.match(/https:\/\/console\.firebase\.google\.com[^\s)"]+/);
  bannerElement.style.display = 'block';
  bannerElement.innerHTML = linkMatch
    ? `정렬/필터에 필요한 색인이 없습니다. <a href="${linkMatch[0]}" target="_blank">색인 만들기</a>`
    : `데이터 로딩 오류. Firestore 콘솔에서 색인 생성이 필요할 수 있습니다.`;
}

// --- 카테고리 관련 ---
function initCategoriesSelect(selectElement) {
  CATEGORY_GROUPS.forEach(group => {
    const optgroup = document.createElement('optgroup');
    optgroup.label = group.label;
    group.children.forEach(cat => {
      const option = document.createElement('option');
      option.value = cat.value;
      option.textContent = cat.label;
      optgroup.appendChild(option);
    });
    selectElement.appendChild(optgroup);
  });
}

function getCategoryLabel(value) {
  for (const group of CATEGORY_GROUPS) {
    const found = group.children.find(c => c.value === value);
    if (found) return found.label;
  }
  return value;
}

// --- 일괄 작업 로직 ---
function openCategoryDialog(elements, targetIds) {
    elements.catDialog.dataset.target = JSON.stringify(targetIds);
    elements.catDialogBody.innerHTML = ''; // Clear previous
    CATEGORY_GROUPS.forEach(group => {
        elements.catDialogBody.innerHTML += `<h4>${group.label}</h4>`;
        group.children.forEach(cat => {
            elements.catDialogBody.innerHTML += `
                <label><input type="checkbox" name="dialog_cat" value="${cat.value}"> ${cat.label}</label>
            `;
        });
    });
    elements.catDialog.showModal();
}

async function saveCategoryDialog(elements) {
    const targetIds = JSON.parse(elements.catDialog.dataset.target || '[]');
    const newCats = Array.from(elements.catDialogBody.querySelectorAll('input:checked')).map(cb => cb.value);

    const editableIds = targetIds.filter(id => canEdit(state.items.find(i => i.id === id)));
    if (editableIds.length === 0) return alert('변경 권한이 없습니다.');

    try {
        await Promise.all(editableIds.map(id => updateDoc(doc(db, 'videos', id), { cats: newCats })));
        resetAndLoad(elements); // 간단하게 전체 리프레시
    } catch (err) {
        console.error('카테고리 변경 오류:', err);
        alert('카테고리 변경 중 오류 발생');
    }
}

async function onBulkDelete(elements, ids) {
    const deletableIds = ids.filter(id => canEdit(state.items.find(i => i.id === id)));
    if (deletableIds.length === 0) return alert('삭제 권한이 없습니다.');
    if (!confirm(`선택한 ${deletableIds.length}개 항목을 정말 삭제할까요?`)) return;

    try {
        await Promise.all(deletableIds.map(id => deleteDoc(doc(db, 'videos', id))));
        resetAndLoad(elements); // 간단하게 전체 리프레시
    } catch (err) {
        console.error('삭제 오류:', err);
        alert('삭제 중 오류 발생');
    }
}


// --- LocalStorage 및 기타 유틸 ---
function savePrefs() {
  localStorage.setItem('list.cat', state.cat);
  localStorage.setItem('list.sortField', state.sortField);
  localStorage.setItem('list.sortDir', state.sortDir);
  localStorage.setItem('list.kw', state.kw);
}

function loadPrefs() {
  state.cat = localStorage.getItem('list.cat') || '';
  state.sortField = localStorage.getItem('list.sortField') || 'createdAt';
  state.sortDir = localStorage.getItem('list.sortDir') || 'desc';
  state.kw = localStorage.getItem('list.kw') || '';
}

function updateUIToReflectState(elements) {
  elements.catSelect.value = state.cat;
  elements.sortSelect.value = `${state.sortField}_${state.sortDir}`;
  elements.keyword.value = state.kw;
}

function guessThumb(url) {
  const ytIdMatch = url.match(/(?:youtu\.be\/|v=|\/embed\/|\/shorts\/|vi\/)([a-zA-Z0-9_-]{11})/);
  return ytIdMatch ? `https://i.ytimg.com/vi/${ytIdMatch[1]}/hqdefault.jpg` : '';
}

function debounce(func, delay) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), delay);
  };
}
