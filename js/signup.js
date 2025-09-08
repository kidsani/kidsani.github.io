// js/signup.js  (v0.1.2)
import { auth, db, onAuthStateChanged, signInWithGoogle, ensureUserDoc } from "./auth.js";
import { doc, getDoc } from "./auth.js";

const $ = (id) => document.getElementById(id);
const btnGoogle = $("btnGoogle");
const msg = $("msg");

function show(text, ok = false) {
  if (!msg) return;
  msg.textContent = text;
  msg.className = "msg show " + (ok ? "ok" : "err");
}

// 로그인 상태 감지 → 닉 보유 여부에 따라 라우팅
onAuthStateChanged(async (user) => {
  if (!user) return;
  try {
    // 사용자 문서가 없으면 보강
    await ensureUserDoc(user.uid, user.displayName || "회원");

    const snap = await getDoc(doc(db, "users", user.uid));
    const data = snap.exists() ? snap.data() : {};
    const hasNick = !!data?.nick || !!data?.displayName || !!user.displayName;

    location.replace(hasNick ? "index.html" : "nick.html");
  } catch {
    // 문제가 있어도 닉 설정 페이지로
    location.replace("nick.html");
  }
});

// [Google로 시작] 클릭
btnGoogle?.addEventListener("click", async () => {
  try {
    await signInWithGoogle();    // 팝업 로그인
    show("로그인 성공! 잠시만요…", true);
    // 라우팅은 onAuthStateChanged가 처리
  } catch (e) {
    console.error(e);
    show("구글 인증에 실패했어요. 잠시 후 다시 시도해 주세요.");
  }
});
