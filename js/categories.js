/* ---------- js/categories.js (v0.1.0-kids) ---------- */
/**
 * KidsAni 전용 카테고리 정의 파일
 * - 이 파일만 수정하면 모든 페이지(index/upload/list/watch)가 새 카테고리를 자동 반영하도록 설계하세요.
 * - “값(value)”은 절대 바꾸지 말고, “라벨(label)”만 자유롭게 바꾸는 것을 권장합니다.
 * - 새 카테고리는 아래 GROUPS에 item 추가 → label 맵은 자동 생성됩니다.
 *
 * 사용 예:
 *   import { CATEGORY_GROUPS, FLAT_LABEL_MAP, getCategoryLabel, isValidCategory } from './js/categories.js?v=0.1.0';
 *   if (isValidCategory(cat)) chip.textContent = getCategoryLabel(cat);
 */

/* =========================================================
 * 1) 대분류별 카테고리 그룹
 *    - key: 그룹 고유키 (UI가 아니라 내부 식별용)
 *    - label: 그룹 표시명 (화면에 보일 이름)
 *    - children: { value(고유키), label(표시명) } 목록
 * ---------------------------------------------------------
 * ✅ 규칙
 *  - value는 소문자+숫자+언더스코어 권장 (예: kids_song, fairy_tale)
 *  - label은 자유롭게 (예: “동요 / 따라 부르기”)
 *  - value는 변경하지 말고, label만 바꾸세요. (value 변경 시 기존 데이터와 충돌)
 * =======================================================*/
export const CATEGORY_GROUPS = [
  {
    key: 'kids_song',
    label: '동요·동화',
    children: [
      { value: 'nursery_song',     label: '동요' },
      { value: 'sing_along',       label: '함께 불러요' },
      { value: 'story_time',       label: '동화 듣기' },
      { value: 'phonics',          label: '파닉스' },
    ],
  },
  {
    key: 'cartoon_anime',
    label: '만화·애니',
    children: [
      { value: 'classic_toon',     label: '고전 만화' },
      { value: 'learning_anime',   label: '학습 애니' },
      { value: 'short_cartoon',    label: '짧은 만화' },
    ],
  },
  {
    key: 'learning',
    label: '학습',
    children: [
      { value: 'korean_basic',     label: '국어 기초' },
      { value: 'math_play',        label: '수학 놀이' },
      { value: 'english_basic',    label: '영어 기초' },
      { value: 'social_manners',   label: '예절·사회성' },
    ],
  },
  {
    key: 'play_game',
    label: '놀이·게임',
    children: [
      { value: 'indoor_play',      label: '실내 놀이' },
      { value: 'outdoor_play',     label: '바깥 놀이' },
      { value: 'brain_teaser',     label: '두뇌 게임' },
    ],
  },
  {
    key: 'art_making',
    label: '미술·만들기',
    children: [
      { value: 'drawing',          label: '그리기' },
      { value: 'craft',            label: '만들기' },
      { value: 'origami',          label: '종이접기' },
    ],
  },
  {
    key: 'music_listen',
    label: '음악감상',
    children: [
      { value: 'kids_classic',     label: '어린이 클래식' },
      { value: 'calm_music',       label: '차분한 음악' },
      { value: 'dance_music',      label: '춤추는 음악' },
    ],
  },
  {
    key: 'health_safety',
    label: '건강·안전',
    children: [
      { value: 'good_habits',      label: '생활습관' },
      { value: 'safety_rules',     label: '안전 수칙' },
      { value: 'exercise',         label: '운동' },
    ],
  },
  {
    key: 'nature_science',
    label: '자연·과학',
    children: [
      { value: 'animals',          label: '동물' },
      { value: 'space',            label: '우주' },
      { value: 'simple_science',   label: '쉬운 과학' },
    ],
  },

  /* -------------------------------------------------------
   * 개인 보관함(선택): 사용자가 "자료1/자료2"로 저장해 두는 용도
   * 필요 없으면 이 블록을 삭제해도 됩니다. value는 바꾸지 마세요.
   * ----------------------------------------------------- */
  {
    key: 'personal',
    label: '개인 자료',
    children: [
      { value: 'personal_1',       label: '자료1' },
      { value: 'personal_2',       label: '자료2' },
    ],
  },
];

/* =========================================================
 * 2) 라벨 맵 자동 생성
 *    - value → label 빠른 조회용
 *    - 페이지 어디서든 getCategoryLabel(value)로 안전하게 접근
 * =======================================================*/
export const FLAT_LABEL_MAP = (() => {
  const map = Object.create(null);
  for (const g of CATEGORY_GROUPS) {
    for (const c of g.children) {
      map[c.value] = c.label;
    }
  }
  return map;
})();

/* =========================================================
 * 3) 유틸 함수 (페이지 공통 사용)
 * =======================================================*/
/** 해당 카테고리 값이 유효한지 검사 */
export function isValidCategory(value) {
  return Object.prototype.hasOwnProperty.call(FLAT_LABEL_MAP, value);
}

/** 카테고리 표시명을 가져오기 (없으면 원본 value 반환) */
export function getCategoryLabel(value) {
  return FLAT_LABEL_MAP[value] || value;
}

/** 그룹(label) 가져오기: value가 포함된 상위 그룹의 label 반환 */
export function getGroupLabel(value) {
  for (const g of CATEGORY_GROUPS) {
    if (g.children.some(c => c.value === value)) return g.label;
  }
  return null;
}

/** 그룹(key) 가져오기: value가 포함된 상위 그룹의 key 반환 */
export function getGroupKey(value) {
  for (const g of CATEGORY_GROUPS) {
    if (g.children.some(c => c.value === value)) return g.key;
  }
  return null;
}

/* =========================================================
 * 4) 정렬/렌더링 기준
 *    - 필요한 페이지에서 이 배열을 순서대로 돌며 그룹을 그리세요.
 *    - 그룹 추가/순서변경 시 여기만 바꾸면 전체가 동일하게 반영됩니다.
 * =======================================================*/
export const GROUP_ORDER = CATEGORY_GROUPS.map(g => g.key);

/* =========================================================
 * 5) 카테고리 추가 가이드 (중요 주석)
 * ---------------------------------------------------------
 *  - 새 대분류: CATEGORY_GROUPS에 {key, label, children: []} 블록을 추가
 *  - 새 소분류: 해당 그룹의 children에 {value, label} 추가
 *  - value 작명 규칙: 소문자+숫자+언더스코어, 영문 권장 (예: calm_music2)
 *  - 기존 value 절대 변경 금지 (기존 데이터와 충돌)
 *  - 라벨만 바꾸는 건 안전 (UI만 변동)
 *  - 추가 후: FLAT_LABEL_MAP, GROUP_ORDER는 자동/반자동으로 반영됨
 * ---------------------------------------------------------
 *  - 업로드/목록/재생 페이지는 반드시 이 파일의 isValidCategory로 검사
 *  - 잘못된 value는 업로드 거부 or '미분류' 처리 등 정책을 한 곳에서 결정
 * ---------------------------------------------------------
 *  - (선택) i18n: 다국어가 필요하면 LABEL_MAP_KO, LABEL_MAP_EN 등 분리
 * =======================================================*/
/* ---------- end of js/categories.js (v0.1.0-kids) ---------- */
