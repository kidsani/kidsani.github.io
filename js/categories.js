/* ---------- js/categories.js (v0.3.1-kidsani) ---------- */
/**
 * KidsAni 전용 카테고리 정의
 * - value(고유키)는 절대 바꾸지 말 것. label은 자유롭게 변경 OK.
 * - "시리즈"는 별도 대분류 없이 각 시리즈를 "큰카테고리(그룹)"로 추가하고 meta.series=true 지정.
 * - 모든 페이지(index/upload/list/watch)는 이 파일만 바라보도록 설계.
 */

/* ===== 일반 카테고리 ===== */
const GROUPS_BASE = [
  {
    key: 'kids_song',
    label: '동요·동화',
    children: [
      { value: 'nursery_song',   label: '동요' },
      { value: 'sing_along',     label: '함께 불러요' },
      { value: 'story_time',     label: '동화 듣기' },
      { value: 'phonics',        label: '파닉스' },
    ],
  },
  {
    key: 'cartoon_anime',
    label: '만화·애니',
    children: [
      { value: 'classic_toon',   label: '고전 만화' },
      { value: 'learning_anime', label: '학습 애니' },
      { value: 'short_cartoon',  label: '짧은 만화' },
    ],
  },
  {
    key: 'learning',
    label: '학습',
    children: [
      { value: 'korean_basic',   label: '국어 기초' },
      { value: 'math_play',      label: '수학 놀이' },
      { value: 'english_basic',  label: '영어 기초' },
      { value: 'social_manners', label: '예절·사회성' },
    ],
  },
  {
    key: 'art_making',
    label: '미술·만들기',
    children: [
      { value: 'drawing',        label: '그리기' },
      { value: 'craft',          label: '만들기' },
      { value: 'origami',        label: '종이접기' },
    ],
  },
  {
    key: 'music_listen',
    label: '음악감상',
    children: [
      { value: 'kids_classic',   label: '어린이 클래식' },
      { value: 'calm_music',     label: '차분한 음악' },
      { value: 'dance_music',    label: '춤추는 음악' },
    ],
  },
  {
    key: 'nature_science',
    label: '자연·과학',
    children: [
      { value: 'animals',        label: '동물' },
      { value: 'space',          label: '우주' },
      { value: 'simple_science', label: '쉬운 과학' },
    ],
  },
];

/* ===== 시리즈(각각이 "큰카테고리") =====
 * - meta.series: true → index에서 [체크박스][제목][정렬토글] 렌더
 * - meta.orderDefault: 'created' | 'latest' (기본 등록순)
 */
const GROUPS_SERIES = [
  {
    key: 'series_pororo',
    label: '뽀로로',
    meta: { series: true, orderDefault: 'created' },
    children: [
      { value: 'pororo_s1',      label: '시즌1' },
      { value: 'pororo_s2',      label: '시즌2' },
      { value: 'pororo_s3',      label: '시즌3' },
    ],
  },
  {
    key: 'series_octonauts',
    label: '옥토넛탐험대',
    meta: { series: true, orderDefault: 'created' },
    children: [
      { value: 'octo_main',      label: '본편' },
      { value: 'octo_short',     label: '숏츠/특별편' },
    ],
  },
];

/* ===== 개인 보관함 ===== */
const GROUPS_PERSONAL = [
  {
    key: 'personal',
    label: '개인 자료',
    children: [
      { value: 'personal_1',     label: '자료1' },
      { value: 'personal_2',     label: '자료2' },
    ],
  },
];

/* 최종 그룹 합치기: 선언 순서 = 초기 표시 순서 */
export const CATEGORY_GROUPS = [
  ...GROUPS_BASE,
  ...GROUPS_SERIES,
  ...GROUPS_PERSONAL,
];

/* value→label 맵 */
export const FLAT_LABEL_MAP = (() => {
  const map = Object.create(null);
  for (const g of CATEGORY_GROUPS) for (const c of g.children) map[c.value] = c.label;
  return map;
})();

/* 유틸 */
export function isValidCategory(value){ return Object.prototype.hasOwnProperty.call(FLAT_LABEL_MAP, value); }
export function getCategoryLabel(value){ return FLAT_LABEL_MAP[value] || value; }
export function getGroupLabel(value){ for (const g of CATEGORY_GROUPS) if (g.children.some(c=>c.value===value)) return g.label; return null; }
export function getGroupKey(value){ for (const g of CATEGORY_GROUPS) if (g.children.some(c=>c.value===value)) return g.key; return null; }

/* 그룹 순서(초기값 = 선언 순서). category-order.html에서 localStorage('groupOrderV1')로 재배치 */
export const GROUP_ORDER = CATEGORY_GROUPS.map(g => g.key);

/* 시리즈 판별/기본정렬 조회 */
export function isSeriesGroupKey(k){
  const g = CATEGORY_GROUPS.find(x=>x.key===k);
  return !!(g && g.meta && g.meta.series === true);
}
export function getSeriesOrderDefault(k){
  const g = CATEGORY_GROUPS.find(x=>x.key===k);
  return (g && g.meta && (g.meta.orderDefault==='latest'||g.meta.orderDefault==='created')) ? g.meta.orderDefault : 'created';
}
/* ---------- end of js/categories.js ---------- */
