// ======================================================================
// 墨俣築城防衛　約十五分の構成（kaito 11/8 夜・docs/oda15_plan_1108.md の 4）
//   0〜2分半 hakobi.js：藤吉郎の段取り。川並衆の舟が材木を岸の舟着きへ運ぶ。人足が担いで砦へ、斎藤の物見が荷を狙う（運搬の護衛）
//   2〜6分  本体の一の手（北の柵の口・破れた柵の修理）
//   6〜9分  本体の二の手 ＋ yoru.js：日が落ちて夜。火矢が組みかけの柵に刺さり、人足が火を叩き消す
//   9〜13分 本体の三の手（北と西の二方向・伏兵の挟み・寄せ大将）＋ asa.js：夜明け。柵の外で立ち往生した寄せ手は退く
//   13〜15分 本体の夜明けの勝ち（完成した砦・藤吉郎の言葉・勝鬨）
// 本体（b_sunomata.js）からは、ここの関数を数行で呼ぶだけ。
// ======================================================================
import * as hakobi from './hakobi.js';
import * as yoru from './yoru.js';
import * as asa from './asa.js';

const S = (rt) => (rt.flags.s15 ||= {});
export function install(rt, def, C) { const v = S(rt); v.C = C; v.def = def; }
// 普請の段取り（北門か脇か）の前に運搬の護衛を挟む。済んだら then
export function afterIntro(rt, then) { const v = S(rt); hakobi.start(rt, v.def, v.C, then); }
export function heading(rt) {
  const v = S(rt);
  if (v.ph !== 'hakobi') return undefined;
  if (v.raid && !v.raid.routed && v.raid.units.some(hakobi.ready)) return '荷物を狙う敵を止めよう';
  if (v.backT) return v.wkHome ? '砦へ戻ろう' : '砦まで荷物を運ぶ人を守ろう';
  return v.atDock ? '船つき場で荷下ろしを守ろう' : '船つき場へ行こう';
}
// 運ぶ本数を作らず、実際の荷下ろしと帰還の条件を短く示す。
export function progressText(rt) {
  const v = S(rt);
  if (v.ph !== 'hakobi') return '';
  if (!v.atDock) return '船つき場で木材を受け取る';
  if (!v.backT) return v.loadingT == null ? '荷物を運ぶ人の到着待ち'
    : `荷下ろし あと${Math.max(0, Math.ceil(12 - (rt.t - v.loadingT)))}秒`;
  if (v.raid && !v.raid.routed) {
    let enemies = 0;
    for (const u of v.raid.units) if (hakobi.ready(u)) enemies++;
    if (enemies) return `荷物を狙う敵 あと${enemies}人`;
  }
  let outside = 0;
  for (const u of rt.flags.wk?.units || []) if (hakobi.ready(u) &&
    (Math.abs(u.pos.x) >= v.C.FORT - 2 || Math.abs(u.pos.z) >= v.C.FORT - 2)) outside++;
  return outside ? `砦へ あと${outside}人` : '木材は砦に到着';
}
export function destination(rt) { return S(rt).ph === 'hakobi' ? hakobi.dest(rt) : null; }
// 11/10 六十秒の見張り（fushin.js）から：運搬の護衛を済ませて次へ
export function hakobiForce(rt) { hakobi.force(rt); }
export function onWave2(rt) { const v = S(rt); yoru.start(rt, v.def, v.C); }
export function tick(rt, dt) {
  const v = S(rt);
  if (v.ph === 'hakobi') hakobi.tick(rt, dt);
  if (v.yoruT != null) yoru.tick(rt, dt);
  if ((rt.flags.wave || 0) >= 3) asa.tick(rt, dt);
  else asa.waveTick(rt, dt);
}
export function bot(b, inp, { goTo, patientStrike }) {
  const v = S(b), u = b.player.u;
  if (v.ph !== 'hakobi') return false;
  const e = b.army.nearestEnemy(u, 6, (o) => !(o.hp <= 0) && !o.dying && !o.gone && !o.woundOut && !o.group?.routed && !o.fleeing && !o.invuln && !o.noTarget);
  const T = e?.pos || hakobi.dest(b);
  if (!T) return false;
  const d = Math.hypot(T.x - u.pos.x, T.z - u.pos.z);
  if (e) b.player.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
  // 運搬の護衛も守備と同じ南門の道を使う。舟着きへ直進すると東の柵で止まる。
  if (d > 2.2) v.C.walk(b, inp, goTo, T.x, T.z, 2.2);
  else if (e) patientStrike?.(b.player, inp, e, d, true);
  return true;
}
