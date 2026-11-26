// 霧を画面へ（K587・オンライン 12/1・docs/status/online_progress.md の 40 の残り「霧を画面（敵の印）へ」）。33・11/21 クラウド k365-cloud-33（40 に断って取った）。
//   決まりは 40 の pvp_rules.js（createFog・observe・tickFog・fogView）。ここは①自分の目で敵の隊を見る（observe を呼ぶ）②敵の印を画面に出す、だけ。
//   ① 毎コマ（tickFog の直前。IDENTIFIED は見えなかったコマにすぐ LOST へ移る決まりなので間引かない・敵は四隊だけで軽い）：自分の隊（team 0）の一番近い者からの遠さで 'eye'、斬り合いの近さ（30m）で 'touch'、官兵衛の「軍師」（31 の tacticReveal）の間は 'scout'。
//   ② 敵の隊ごとに頭上の印を一つ（字を使わない・画面の決まり）：
//      SPOTTED＝赤い菱だけ（誰か分からない）・IDENTIFIED＝赤い菱と武将の名（残してよい字＝武将の名）・LOST＝薄い白抜きの菱を「最後に見た所」に・UNKNOWN＝出さない。
//   描かない部品（DOM の印が四つまで）。押せない（pointer-events:none）。試合が終われば片付ける（片付け忘れの守りつき）。
import { isEn, tr } from '../i18n.js';
import { DIST_FAKE_NEAR } from '../world_army_shader.js';

const TOUCH = 30;
const posOf = (s) => { try { const c = s.b?.real?.center?.(); if (c) return { x: c.x, z: c.z }; } catch (e) { /* 組が無い */ } return s.b?.pos ? { x: s.b.pos.x, z: s.b.pos.z } : null; };
const alive = (s) => s.count() > 0 && s.state !== '敗走';
// K686 ①（kaito 11/25「敵がいないのに敵将動いてる」）：画面に兵が一人もいない備は見ない・印を出さない（K285 本物の兵しか映さない）。
//   本物の組が出ていない備の軽い大軍は、本人とカメラから DIST_FAKE_NEAR（＋兵ごとに 0〜30m）の内では描かれない（world_army_shader.js）。
//   本物の枠（250人）が尽きた近くの敵の備は、兵のいない野の上に菱と名だけが浮いて動いていた。軽い兵が描かれる遠さの備だけを『兵がいる』と見る
let _me = null, _cam = null;
const hasTroops = (s) => {
  const B = s.b; if (!B) return false;
  try {
    if ((B.realCount?.() || 0) > 0) return true;
    if (!(B.light && !B.light.army?.empty && (B.lightCount?.() || 0) > 0) || !B.pos) return false;
    const near = (DIST_FAKE_NEAR.value || 0) + 15;
    for (const q of [_me, _cam]) if (q && Math.hypot(B.pos.x - q.x, B.pos.z - q.z) < near) return false;
    return true;
  } catch (e) { return false; }
};
const setEye = (rt) => { const u = rt.player?.u; _me = u?.pos ? { x: u.pos.x, z: u.pos.z } : null; const c = rt.camera?.position; _cam = c ? { x: c.x, z: c.z } : null; };

// ① 見る
export function fogSee(rt, M, P) {
  const R = P.rules, fog = M.fog;
  if (!R?.observe || !fog || !M.sonae) return;
  const t = rt.t - M.t0;
  fog.t = t;
  setEye(rt);
  const mine = M.sonae.filter((s) => !s.team && alive(s)).map(posOf).filter(Boolean);
  const reveal = !!P.tac?.tacticReveal?.(rt, 0);
  for (const s of M.sonae) {
    if (!s.team || !alive(s) || !hasTroops(s)) continue;
    const p = posOf(s); if (!p) continue;
    let d = Infinity; for (const q of mine) d = Math.min(d, Math.hypot(p.x - q.x, p.z - q.z));
    const how = reveal ? 'scout' : d <= TOUCH ? 'touch' : 'eye';
    if (how === 'eye' && d > R.FOG.seeSpot * R.FOG.highBonus) continue;   // 見えない（tickFog が LOST・UNKNOWN へ移す）
    R.observe(fog, s.id, p, how, d);
  }
}

// ② 印
const CSS = `
.fogm{position:fixed;inset:0;pointer-events:none;z-index:40;overflow:hidden}
.fogm i{position:absolute;left:0;top:0;width:16px;height:16px;margin:-8px 0 0 -8px;transform-origin:50% 50%;will-change:transform}
.fogm i::before{content:'';position:absolute;inset:2px;transform:rotate(45deg);background:#d8322a;border:2px solid #fff3;box-shadow:0 0 6px #000a}
.fogm i.lost::before{background:none;border:2px dashed #f1e9d6cc;box-shadow:none}
.fogm i.lost{opacity:.6}
.fogm i canvas{display:none}
.fogm i.hon canvas{display:block}
.fogm i.hon{width:22px;height:52px;margin:-52px 0 0 -11px}
.fogm i.hon::before{display:none}
.fogm i.hon canvas{position:absolute;inset:0;width:22px;height:52px;border:2px solid #d8322a;box-shadow:0 0 6px #000c;background:#000}
.fogm i.hon b{top:-18px}
.fogm i b{position:absolute;left:50%;top:-20px;transform:translateX(-50%);white-space:nowrap;font:600 13px/1 "Noto Serif JP","Hiragino Mincho ProN",serif;color:#fff;text-shadow:0 0 3px #000,0 0 6px #000}
@media (prefers-reduced-motion:reduce){.fogm i{transition:none}}
`;
export function fogMarks(rt, M, P) {
  const R = P.rules, fog = M.fog, cam = rt.camera;
  if (!R?.fogView || !fog || !cam || typeof document === 'undefined') return;
  let L = M.fogLayer;
  if (!L || !L.isConnected) {
    if (!document.getElementById('fogm-css')) { const st = document.createElement('style'); st.id = 'fogm-css'; st.textContent = CSS; document.head.appendChild(st); }
    L = M.fogLayer = document.createElement('div'); L.className = 'fogm'; L.setAttribute('aria-hidden', 'true');
    document.body.appendChild(L);
    M.fogEls = new Map();
    // 片付け忘れの守り：試合の外で一秒動かなければ消える（抜けた・戦を閉じた時）
    const guard = setInterval(() => { if (!L.isConnected || performance.now() - (L._seen || 0) > 1000) { clearInterval(guard); L.remove(); } }, 500);
  }
  L._seen = performance.now();
  setEye(rt);
  const el = rt.game?.renderer?.domElement || document.querySelector('canvas');
  const rect = el?.getBoundingClientRect?.() || { left: 0, top: 0, width: innerWidth, height: innerHeight };
  const V = cam.position.constructor;
  const placed = [];   // K686 ③：この一コマで置いた名の箱（重なる名は上へ一段ずつずらす）
  for (const s of M.sonae || []) {
    if (!s.team) continue;
    const v = R.fogView(fog, s.id);
    let m = M.fogEls.get(s.id);
    if (!v || !hasTroops(s)) { if (m) m.style.display = 'none'; continue; }   // K686：最後に見た所の薄い菱も、兵の見えない近さでは出さない
    if (!m) { m = document.createElement('i'); m.appendChild(document.createElement('b')); L.appendChild(m); M.fogEls.set(s.id, m); }
    // 印の位置はいつも霧の帳の「最後に見た所」（見えている間は毎コマ今の所に更新される）。見えなくなった隊の今の所は出さない
    const p = v.pos;
    if (!p) { m.style.display = 'none'; continue; }
    const hy = s.b?.taishoU?.pos?.y; if (Number.isFinite(hy)) m._y = hy;   // 高さは大将の足元（見えなくなった後は最後の高さ）
    const y = (m._y ?? 0) + 9;
    // 前か後ろかはカメラの目の向きで見る（遠い敵はカメラの遠い面（far）の先でも印は出す＝q.z が 1 を越えても x・y は正しい）
    const w = new V(p.x, y, p.z); cam.updateMatrixWorld?.();
    const ahead = w.clone().applyMatrix4(cam.matrixWorldInverse).z < -1;
    const q = w.project(cam);
    if (!ahead || Math.abs(q.x) > 1.1 || Math.abs(q.y) > 1.1) { m.style.display = 'none'; continue; }
    m.style.display = '';
    // 11/21 K586（司令塔 (b)）：相手の本陣（総大将の備）は、誰か分かった後（showName）だけ、赤い菱を家の色と紋の板（その大将の旗印の絵・字なし・赤い縁）に替える。
    //   霧の端（110m）の先でも本陣の家が見分けられる。板は DOM の小さな絵一枚（描く回数を増やさない・旗の絵は一度だけ描く）
    const hon = !v.estimate && v.showName && (s.line === 'honjin' || s.major);
    if (hon && !m._flag) {
      m._flag = document.createElement('canvas'); m._flag.width = 40; m._flag.height = 96;
      import('../bushou_card_art.js').then((A) => { if (!A.drawCardFlag(m._flag, s.taisho || '')) m._flag = null; else m.insertBefore(m._flag, m.firstChild); }).catch(() => { m._flag = null; });
    }
    m.className = v.estimate ? 'lost' : hon && m._flag ? 'hon' : '';
    // 本陣の板は上へ 52px 伸びるので、画面の上の端で切れないよう、板の上が画面の内（上から 4px）に収まる所まで下げる
    const sy = Math.round(rect.top + (1 - q.y) / 2 * rect.height), ty = m.className === 'hon' ? Math.max(sy, Math.round(rect.top) + 74) : sy;
    const sx = Math.round(rect.left + (q.x + 1) / 2 * rect.width);
    m.style.transform = `translate(${sx}px,${ty}px)`;
    const name = v.showName ? (isEn() ? tr(s.taisho || '') : (s.taisho || '')) : '';
    if (m._name !== name) { m._name = name; m.firstChild.textContent = name; }   // 画面の訳（i18n の見張り）が字を替えても、毎コマ書き戻さない
    // K686 ③（「奥平信昌本多正純」と名が重なって読めない）：先に置いた名の箱と重なる間は、名を上へ 16px ずつ（四段まで）ずらす
    if (name) {
      const w = name.length * 14 + 6, base = ty + (m.className === 'hon' ? -70 : -20);
      let k = 0; while (k < 4 && placed.some((r) => Math.abs(r.x - sx) < (r.w + w) / 2 && Math.abs(r.y - (base - k * 16)) < 15)) k++;
      placed.push({ x: sx, y: base - k * 16, w });
      const off = k ? `translate(-50%,${-k * 16}px)` : '';
      if (m._off !== off) { m._off = off; m.firstChild.style.transform = off; }
    }
  }
}

export function fogViewTick(rt, dt, M, P) {
  fogSee(rt, M, P);
  fogMarks(rt, M, P);
}
export function fogViewDispose(M) { try { M.fogLayer?.remove(); } catch (e) { /* 無ければよい */ } M.fogLayer = null; }
