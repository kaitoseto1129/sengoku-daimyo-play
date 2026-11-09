// ======================================================================
// 森部の戦い　約十五分の構成（kaito 11/8 夜・docs/oda15_plan_1108.md の 3）
//   0〜2分  kishi.js   ：楡俣川の南岸で渡河の下知を待つ。雨・対岸の斎藤の槍・勘当の前田又左衛門・信長の「天の与ふる所」
//   2〜5分  本体の渡河（流れに足を取られる・対岸で組をそろえる）と北岸の畦の先手
//   5〜7分  azemichi.js：先手が退いた後、ぬかるむ田の畦に潜む斎藤の物頭と伏兵（足場の悪さ・小隊長撃破）
//   7〜10分 本体の槍の押し合い ＋ yumi.js：左の畦に斎藤の弓・鉄砲衆が集まる。森可成の隊と合流して討つ（遠い兵の集まり）
//   10〜14分 本体の両将の旗本と殿の追い討ち
//   14〜15分 yoin.js    ：勝鬨三度・薬師堂の首実検・墨俣への伏線（余韻を削らない）
// 本体（b_moribe.js）からは、ここの関数を数行で呼ぶだけ。
// ======================================================================
import * as kishi from './kishi.js';
import * as aze from './azemichi.js';
import * as yumi from './yumi.js';
import * as yoin from './yoin.js';
import { GOALS15 } from './goals.js';

const S = (rt) => (rt.flags.m15 ||= {});
export function install(rt, def, C) { const v = S(rt); v.C = C; v.def = def; kishi.start(rt, def, C); }
export function heading(rt) {
  const v = S(rt);
  if (rt.flags.ending) return undefined;
  if (v.ph === 'kishi') return GOALS15.kishi;
  if (v.ph === 'aze') return GOALS15.aze;
  if (v.ph === 'yumi') return GOALS15.yumi;
  return undefined;
}
// 渡河の合図（本体の signal）は、南岸の下知が済んでから
export function crossOk(rt) { return !!S(rt).kishiDone; }
// 先手が退いた後、槍の押し合いへ移るのは畦の物頭を討ってから
export function holdOk(rt) {
  const v = S(rt);
  if (v.azeDone) return true;
  if (!v.azeT) aze.start(rt, v.def, v.C);
  return false;
}
// 反撃（両将の旗本へ）は、左の畦の弓・鉄砲衆を討ってから
export function pressOk(rt) { const v = S(rt); return !!v.yumiDone; }
export function ending(rt, then) { const v = S(rt); yoin.start(rt, v.def, v.C, then); }

export function tick(rt, dt) {
  const v = S(rt), F = rt.flags;
  if (!v.kishiDone) kishi.tick(rt, dt);
  if (v.azeT) aze.tick(rt, dt);
  if (F.stage === 'hold' || v.yumiT) yumi.tick(rt, dt);
}
export function target(rt) {
  const v = S(rt);
  if (v.ph === 'aze') return aze.target(rt);
  if (v.ph === 'yumi') return yumi.target(rt);
  return null;
}
export function bot(b, inp, { goTo, patientStrike }) {
  const v = S(b), u = b.player.u;
  if (v.ph === 'kishi') { const q = v.C.KISHI; if (Math.hypot(q.x - u.pos.x, q.z - u.pos.z) > 3) goTo(b.player, inp, q.x, q.z, 2.5); return true; }
  if (v.ph !== 'aze' && v.ph !== 'yumi') return false;
  const e = b.army.nearestEnemy(u, 5, (o) => o.hp > 0 && !o.dying && !o.downed && !o.fleeing && !o.woundOut && !o.rearWound && !o.invuln && !o.noTarget) || null;
  const t = e || target(b);
  if (!t) return false;
  const d = Math.hypot(t.pos.x - u.pos.x, t.pos.z - u.pos.z);
  b.player.yaw = Math.atan2(t.pos.x - u.pos.x, t.pos.z - u.pos.z);
  if (d > 2.2) goTo(b.player, inp, t.pos.x, t.pos.z, 2.2);
  else patientStrike?.(b.player, inp, t, d, true);
  return true;
}
