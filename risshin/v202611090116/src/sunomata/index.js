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
import { GOALS15 } from './goals.js';

const S = (rt) => (rt.flags.s15 ||= {});
export function install(rt, def, C) { const v = S(rt); v.C = C; v.def = def; }
// 普請の段取り（北門か脇か）の前に運搬の護衛を挟む。済んだら then
export function afterIntro(rt, then) { const v = S(rt); hakobi.start(rt, v.def, v.C, then); }
export function heading(rt) { const v = S(rt); return v.ph === 'hakobi' ? GOALS15.hakobi : undefined; }
export function onWave2(rt) { const v = S(rt); yoru.start(rt, v.def, v.C); }
export function tick(rt, dt) {
  const v = S(rt);
  if (v.ph === 'hakobi') hakobi.tick(rt, dt);
  if (v.yoruT) yoru.tick(rt, dt);
  if ((rt.flags.wave || 0) >= 3) asa.tick(rt, dt);
  else asa.waveTick(rt, dt);
}
export function bot(b, inp, { goTo, patientStrike }) {
  const v = S(b), u = b.player.u;
  if (v.ph !== 'hakobi') return false;
  const e = b.army.nearestEnemy(u, 6, (o) => !o.fleeing && !o.invuln && !o.noTarget);
  const T = e?.pos || hakobi.dest(b);
  if (!T) return false;
  const d = Math.hypot(T.x - u.pos.x, T.z - u.pos.z);
  if (e) b.player.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
  if (d > 2.2) goTo(b.player, inp, T.x, T.z, 2.2);
  else if (e) patientStrike?.(b.player, inp, e, d, true);
  return true;
}
