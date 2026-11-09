// ======================================================================
// 稲生の戦い　約十五分の構成（kaito 11/8 夜・docs/oda15_plan_1108.md の 1）
//   0〜2分　march.js    ：於多井川を渡った列が稲生の街道を北へ。信長の見回り・使番・名塚の戦・手負い・柴田勢の現れ（移動も出来事に）
//   2〜5分　vanguard.js ：柴田の物見（本体の練習）の後、葦原の脇道から林勢の前衛。物頭を討つと崩れて逃げる（敗走を初めて見せる）
//   5〜8分　flank.js    ：柴田勢と列がぶつかり正面は押される。組は小川沿いの畦から柴田の横を突く（横槍）
//   8〜10分 katsuie.js  ：信長が前へ出て一喝。柴田勝家が馬で打ち掛かる短い一騎打ち。手負うて退く（『信長公記』）
//   10〜12分 raid.js     ：列を整える間に、林勢の別手が葦原を回って信長の旗本へ（狙われる本陣）。組が駆け戻って止める
//   12〜14分 本体        ：林勢の槍の列（hayashi2.js：六割まで減らすと二の備が押し出す）→ 田の伏兵（fushi.js）→ 美作守の旗本（sakuma.js：名塚の佐久間勢が後詰に駆けつける）→ 信長が美作守を突き伏せる
//   14〜15分 yoin.js     ：信勝方の総崩れ・勝鬨三度・信長の言葉・初陣の評価（余韻を削らない）
// 本体（b_inou_spec.js）からは、ここの関数を数行で呼ぶだけ。
// ======================================================================
import * as march from './march.js';
import * as vanguard from './vanguard.js';
import * as flank from './flank.js';
import * as katsuie from './katsuie.js';
import * as raid from './raid.js';
import * as hayashi2 from './hayashi2.js';
import * as sakuma from './sakuma.js';
import * as fushi from './fushi.js';
import * as yoin from './yoin.js';
import { GOALS15 } from '../b_inou_goals.js';

const FAR = 30;
const S = (rt) => (rt.flags.v15 ||= {});

// 行き先：遠ければ金の▼に距離（本体の farPin）、近ければ地面のピン（敵なら本人の赤い▼）
export function pinAt(rt, pos, label, unit = null, r = 3) {
  const F = rt.flags, P = rt.player.u.pos;
  if (!pos) { F.farPin = null; return null; }
  const d2 = (pos.x - P.x) ** 2 + (pos.z - P.z) ** 2;
  if (d2 <= r * r) { F.farPin = null; return null; }
  if (d2 > FAR * FAR) {
    const far = F.farPinObj || (F.farPinObj = { x: 0, z: 0, r: 0, label: '' });
    far.x = pos.x; far.z = pos.z; far.r = FAR - 2; far.label = label;
    F.farPin = far;
    return null;
  }
  F.farPin = null;
  const pin = F.beginnerPin || (F.beginnerPin = { x: 0, z: 0, r: 0 });
  pin.x = pos.x; pin.z = pos.z; pin.r = r;
  pin.unit = unit; pin.enemy = !!unit; pin.flagDestination = !unit;
  return pin;
}

// setup の終わり：行軍から始める
export function install(rt, def, C) {
  const v = S(rt);
  v.C = C; v.def = def;
  march.start(rt, def, C);
}

// 右上の一行・行き先・赤い▼の相手（undefined なら本体のまま）
export function heading(rt) {
  const v = S(rt);
  if (rt.flags.ending) return undefined;
  if (v.ph === 'march') return GOALS15.march;
  if (v.ph === 'van' || v.vanT && !((rt.flags.stage || 0) >= 1)) return GOALS15.van;
  if (v.ph === 'flank') return GOALS15.flank;
  if (v.ph === 'raid') return GOALS15.raid;
  return undefined;
}
export function sign(rt) {
  const v = S(rt);
  if (v.ph === 'van') return vanguard.target(rt);
  if (v.ph === 'duel') return katsuie.target(rt);
  if (v.ph === 'raid') return raid.target(rt) || null;
  return undefined;
}
export function pin(rt) {
  const v = S(rt);
  if (rt.flags.ending) return undefined;
  if (v.ph === 'march') return march.pin(rt);
  if (v.ph === 'van') return vanguard.pin(rt);
  if (v.ph === 'flank') return flank.pin(rt);
  if (v.ph === 'duel') return katsuie.pin(rt);
  if (v.ph === 'raid') return raid.pin(rt);
  return undefined;
}

// 物見を討った後：林の前衛を退けるまで柴田勢との列は組み合わない
export function linesReady(rt, def) {
  const v = S(rt);
  if (v.vanDone) return true;
  if (!v.vanT) vanguard.start(rt, def, v.C);
  return false;
}
// 柴田勢と列がぶつかった（段一の始め）
export function onLines(rt, def) { flank.start(rt, def, S(rt).C); }
// 信長の一喝は、主人公が畦へ着いて横槍を済ませてから
export function shoutOk(rt) {
  const v = S(rt);
  // 横槍の後、柴田の二陣と三十五秒は槍を合わせる。横槍そのものは時刻で省かない。
  return !!v.flankDone && (!!v.reserveT && rt.t - v.reserveT > 35 || rt.t - (rt.flags.stageT || 0) > 240);
}
// 林勢の槍の列を破るのは、二の備が押し出して四十五秒たってから（済まなければ段二の五分半で）
export function line2Ok(rt) { const v = S(rt); return !!v.l2res && rt.t - v.l2res > 45 || rt.t - (rt.flags.stageT || 0) > 330; }
// 一喝の後：勝家との一騎打ち（済んだら breakLine1 を呼ぶ）。引き受けたら true
export function duel(rt, def) { return katsuie.start(rt, def, S(rt).C); }
// 柴田勢が崩れた後：林勢の別手を止めてから列が林勢へ進む
export function raidDone(rt, def) {
  const v = S(rt);
  if (v.raidDone) return true;
  if (!v.raidT) raid.start(rt, def, v.C);
  return false;
}
// 勝った後の余韻（then で本体の finish）
export function ending(rt, def, then) { yoin.start(rt, def, S(rt).C, then); }

export function tick(rt, dt) {
  const v = S(rt);
  if (v.ph === 'march') march.tick(rt, dt);
  if (v.vanT) vanguard.tick(rt, dt);
  if (v.ph === 'flank' || v.flankHit && !v.flankDone) flank.tick(rt, dt);
  if (v.ph === 'duel') katsuie.tick(rt, dt);
  if (v.raidT) raid.tick(rt, dt);
  if (v.raidDone) { hayashi2.tick(rt, dt); fushi.tick(rt, dt); sakuma.tick(rt, dt); }
}
export function onKill(rt, victim, killer) {
  vanguard.onKill(rt, victim, killer);
  const v = S(rt);
  if (killer?.isPlayer && v.raidGs?.includes(victim?.group)) v.raidPlayer = true;
}

// bot：新しい段の行き先へ（近い敵は本体の bot が先に突く）。引き受けたら true
export function bot(b, inp, goTo) {
  const v = S(b), u = b.player.u;
  let T = null;
  if (v.ph === 'van') T = vanguard.target(b)?.pos || null;
  else if (v.ph === 'flank') T = v.C?.FLANK;
  else if (v.ph === 'duel') T = katsuie.target(b)?.pos || null;
  else if (v.ph === 'raid') T = raid.target(b)?.pos || b.flags.nobuG?.center?.() || null;
  if (!T) return false;
  if (Math.hypot(T.x - u.pos.x, T.z - u.pos.z) < 2.2) return false;
  goTo(b.player, inp, T.x, T.z, 2);
  return true;
}
