/* ---------- js/categories.js (v0.2.0-kids) ---------- */
/**
 * KidsAni 전용 카테고리 정의/유틸
 * - "value"는 절대 바꾸지 마세요(데이터 충돌 위험). label만 자유 변경 권장.
 * - 시리즈는 "그룹 단위"로 선택(자식 체크박스 없음). 각 시리즈 그룹은 정렬 토글(등록순/최신순)을 가집니다.
 * - 그룹 순서는 GROUP_ORDER 기본값 + 로컬저장소('groupOrderKidsV1')로 관리(인덱스에서 변경 UI).
 */

/* =========================================================
 * 1) 그룹 타입
 *    - normal  : 일반 그룹 (children 존재, 하위 카테고리 체크)
 *    - series  : 시리즈 그룹 (children 없이 그룹 체크박스 + 정렬 토글)
 *    - personal: 개인 보관함 (children 존재, 단독 재생 모드)
 * =======================================================*/
export const GROUP_TYPES = Object.freeze({
  NORMAL: 'normal',
  SERIES: 'series',
  PERSONAL: 'personal',
});

/* =========================================================
 * 2) 카테고리 그룹 정의
 *    - key       : 그룹 고유키 (영문/숫자/언더스코어 권장)
 *    - type      : GROUP_TYPES.NORMAL | SERIES | PERSONAL
 *    - label     : 화면 표시명
 *    - children  : normal/personal에서만 사용 [{value,label}]
 *    - seriesKey : type==='series' 인 경우 필수. 쿼리/라우팅 키로 사용.
 * =======================================================*/
export const CATEGORY_GROUPS = [
  /* ---------- 일반 그룹들 ---------- */
  {
    key: 'kids_song',
    type: GROUP_TYPES.NORMAL,
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
    type: GROUP_TYPES.NORMAL,
    label: '만화·애니',
    children: [
      { value: 'classic_toon',   label: '고전 만화' },
      { value: 'learning_anime', label: '학습 애니' },
      { value: 'short_cartoon',  label: '짧은 만화' },
    ],
  },
  {
    key: 'learning',
    type: GROUP_TYPES.NORMAL,
    label: '학습',
    children: [
      { value: 'korean_basic',   label: '국어 기초' },
      { value: 'math_play',      label: '수학 놀이' },
      { value: 'english_basic',  label: '영어 기초' },
      { value: 'social_manners', label: '예절·사회성' },
    ],
  },
  {
    key: 'play_game',
    type: GROUP_TYPES.NORMAL,
    label: '놀이·게임',
    children: [
      { value: 'indoor_play',    label: '실내 놀이' },
      { value: 'outdoor_play',   label: '바깥 놀이' },
      { value: 'brain_teaser',   label: '두뇌 게임' },
    ],
  },
  {
    key: 'art_making',
    type: GROUP_TYPES.NORMAL,
    label: '미술·만들기',
    children: [
      { value: 'drawing',        label: '그리기' },
      { value: 'craft',          label: '만들기' },
      { value: 'origami',        label: '종이접기' },
    ],
  },
  {
    key: 'music_listen',
    type: GROUP_TYPES.NORMAL,
    label: '음악감상',
    children: [
      { value: 'kids_classic',   label: '어린이 클래식' },
      { value: 'calm_music',     label: '차분한 음악' },
      { value: 'dance_music',    label: '춤추는 음악' },
    ],
  },
  {
    key: 'health_safety',
    type: GROUP_TYPES.NORMAL,
    label: '건강·안전',
    children: [
      { value: 'good_habits',    label: '생활습관' },
      { value: 'safety_rules',   label: '안전 수칙' },
      { value: 'exercise',       label: '운동' },
    ],
  },
  {
    key: 'nature_science',
    type: GROUP_TYPES.NORMAL,
    label: '자연·과학',
    children: [
      { value: 'animals',        label: '동물' },
      { value: 'space',          label: '우주' },
      { value: 'simple_science', label: '쉬운 과학' },
    ],
  },

  /* ---------- 시리즈 그룹들(예시) ---------- */
  // ⚠️ seriesKey는 Firestore 등에서 시리즈를 구분할 실제 키와 일치시켜 주세요.
  { key: 'series_pororo',     type: GROUP_TYPES.SERIES,  label: '뽀로로',       seriesKey: 'pororo' },
  { key: 'series_octonauts',  type: GROUP_TYPES.SERIES,  label: '옥토넛탐험대', seriesKey: 'octonauts' },

  /* ---------- 개인 보관함 ---------- */
  {
    key: 'personal',
    type: GROUP_TYPES.PERSONAL,
    label: '개인 자료',
    children: [
      { value: 'personal_1',   label: '자료1' },
      { value: 'personal_2',   label: '자료2' },
    ],
  },
];

/* =========================================================
 * 3) 라벨 맵 (normal/personal 전용)
 * =======================================================*/
export const FLAT_LABEL_MAP = (() => {
  const map = Object.create(null);
  for (const g of CATEGORY_GROUPS) {
    if (g.type !== GROUP_TYPES.NORMAL && g.type !== GROUP_TYPES.PERSONAL) continue;
    for (const c of (g.children || [])) {
      map[c.value] = c.label;
    }
  }
  return map;
})();

/* =========================================================
 * 4) 유틸: 타입/시리즈 식별 등
 * =======================================================*/
export const GROUP_BY_KEY = (() => {
  const m = new Map();
  CATEGORY_GROUPS.forEach(g => m.set(g.key, g));
  return m;
})();

export function isValidCategory(value) {
  return Object.prototype.hasOwnProperty.call(FLAT_LABEL_MAP, value);
}
export function getCategoryLabel(value) {
  return FLAT_LABEL_MAP[value] || value;
}
export function getGroupMeta(groupKey) {
  return GROUP_BY_KEY.get(groupKey) || null;
}
export function isSeriesGroupKey(groupKey) {
  const g = GROUP_BY_KEY.get(groupKey);
  return !!g && g.type === GROUP_TYPES.SERIES;
}
export function getSeriesKeyForGroup(groupKey) {
  const g = GROUP_BY_KEY.get(groupKey);
  return (g && g.type === GROUP_TYPES.SERIES) ? g.seriesKey : null;
}
export function isPersonalValue(v) {
  return v === 'personal_1' || v === 'personal_2';
}

/* =========================================================
 * 5) 그룹 순서 기본값
 *    - 저장 키: 'groupOrderKidsV1'
 *    - index.js에서 저장/로드하며, 현재 존재하지 않는 key는 자동 필터링
 * =======================================================*/
export const GROUP_ORDER = CATEGORY_GROUPS.map(g => g.key);

/* =========================================================
 * 6) 상수: Select All에서 제외할 그룹 타입
 * =======================================================*/
export const EXCLUDE_FROM_SELECT_ALL_TYPES = new Set([GROUP_TYPES.SERIES, GROUP_TYPES.PERSONAL]);

/* ---------- end of js/categories.js (v0.2.0-kids) ---------- */
