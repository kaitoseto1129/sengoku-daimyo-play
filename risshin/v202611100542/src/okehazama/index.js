// ======================================================================
// 桶狭間の戦い　約十五分の構成（kaito 11/8 夜・docs/oda15_plan_1108.md の 2）
//   0〜3分  muster.js ：中島砦の下に集まる。佐々・千秋の先駆けが今川の前で討たれるのを遠くに見る。家老が轡を取って止める。
//                       簗田の物見の知らせ（義元は桶狭間山で休む）。信長の下知で谷へ（移動も出来事に）
//   3〜6分  本体の行軍と雨待ち ＋ tani.js：雷と倒木、藪に潜む今川の物見 ＋ zenei.js：雨に紛れ、谷の出口の林で雨宿りする今川の鉄砲衆を討つ（火縄は濡れて撃てない）
//   6〜9分  本体の松井の先手 ＋ nida.js：桶狭間山の麓の今川の陣（小荷駄と前の備え）へ。雨上がりの陣は混乱。服部・毛利が前へ
//   9〜10分 ii.js     ：本陣の左の井伊直盛の備えが前へ出る。破ると幕の前へ（井伊はこの戦で討死）
//   10〜11分 saka.js   ：幕の下の坂の旗本の弓組。矢をくぐって駆け上がる
//   11〜13分 本体の本陣 ＋ kinju.js：幕の前の旗本に、陣の後ろから義元の近習と新手が駆けつける（敵兵が増える）
//   13〜15分 本体の義元討死・帰陣 ＋ kaeri.js：引き揚げの道で残兵が斬り込む ＋ yoin.js：勝鬨・今川の旗が倒れる・大高の松平元康が退いてゆく知らせ（余韻を削らない）
// 本体（b_okehazama.js）からは、ここの関数を数行で呼ぶだけ。
// ======================================================================
import * as muster from './muster.js';
import * as tani from './tani.js';
import * as zenei from './zenei.js';
import * as nida from './nida.js';
import * as ii from './ii.js';
import * as saka from './saka.js';
import * as kinju from './kinju.js';
import * as kaeri from './kaeri.js';
import * as saigo from './saigo.js';
import * as yoin from './yoin.js';
import { GOALS15 } from './goals.js';
const S = (rt) => (rt.flags.o15 ||= {});

export function install(rt, def, C) { const v = S(rt); v.C = C; v.def = def; }
// 組が揃ってから谷へ下るまでの集まり（引き受けたら true。済んだら startMarch を呼ぶ）
export function muster15(rt, def) { return muster.start(rt, def, S(rt).C); }

export function heading(rt) {
  const v = S(rt);
  if (rt.flags.victory || rt.flags.ending) return undefined;
  // 追加した四段も、目標一覧の十件と同じ番号で下知する。
  if (v.ph === 'zenei') return '②' + GOALS15.zenei;
  if (v.ph === 'nida') return '⑤' + GOALS15.nida;
  if (v.ph === 'ii') return '⑥' + GOALS15.ii;
  if (v.ph === 'saka') return '⑦' + GOALS15.saka;
  return undefined;
}
export function pin(rt) {
  const v = S(rt);
  if (rt.flags.ending || rt.flags.victory) return undefined;
  if (v.ph === 'zenei') return zenei.pin(rt);
  if (v.ph === 'nida') return nida.pin(rt);
  if (v.ph === 'ii') return ii.pin(rt);
  if (v.ph === 'saka') return saka.pin(rt);
  return undefined;
}
export function sign(rt) {
  const v = S(rt);
  if (v.ph === 'zenei') return zenei.target(rt);
  if (v.ph === 'nida') return nida.target(rt);
  if (v.ph === 'ii') return ii.target(rt);
  if (v.ph === 'saka') return saka.target(rt);
  return undefined;
}
// 本陣の幕の前へ入るのは、麓の陣を破ってから
export function canEnter(rt) {
  const v = S(rt);
  if (v.nidaDone && v.iiDone && v.sakaDone) return true;
  if (!v.nidaT) nida.start(rt, v.def, v.C);
  else if (v.nidaDone && !v.iiT) ii.start(rt, v.def, v.C);
  else if (v.iiDone && !v.sakaT) saka.start(rt, v.def, v.C);
  return false;
}
// 旗本の囲みが開くのは、近習の新手と組み合ってから
export function guardOk(rt) { const v = S(rt); return !!v.kinju2T && rt.t - v.kinju2T > 40 || rt.t - (rt.flags.enteredAt ?? rt.t) > 150; }
// 義元の深手は、輿を捨てて退く旗本が三度向き直ってから（公記「二度三度、四度五度」。済まなければ退き始めて八十秒）
export function woundOk(rt) { const F = rt.flags; return (F.turnBack || 0) >= 3 && rt.t - F.koshiLeftT > 40 || rt.t - F.koshiLeftT > 80; }
// 帰陣の旗に着いた後の余韻（then で本体の finish）
export function ending(rt, then) { const v = S(rt); yoin.start(rt, v.def, v.C, then); }

export function tick(rt, dt) {
  const v = S(rt), F = rt.flags;
  if (v.musterT && !v.musterDone) muster.tick(rt, dt);
  if (rt.phase === 'march' || v.taniT) tani.tick(rt, dt);
  if (rt.phase === 'wait' || v.zeneiT) zenei.tick(rt, dt);
  if (v.nidaT) nida.tick(rt, dt);
  if (v.iiT) ii.tick(rt, dt);
  if (v.sakaT) saka.tick(rt, dt);
  if (F.entered && !F.victory) kinju.tick(rt, dt);
  if (F.yoshiDown && !F.victory) saigo.tick(rt, dt);
  if (F.victory) kaeri.tick(rt, dt);
}

// bot：新しい段の行き先と相手へ（ほかは本体の既定の動き）
export function bot(b, inp, { goTo, patientStrike }) {
  const v = S(b), u = b.player.u;
  if (!['zenei', 'nida', 'ii', 'saka'].includes(v.ph)) return false;
  const e = b.army.nearestEnemy(u, 5, (o) => !o.fleeing && !o.invuln && !o.noTarget);
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    b.player.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d > 2.2) goTo(b.player, inp, e.pos.x, e.pos.z, 2.2); else inp.k.delete('KeyW');
    patientStrike?.(b.player, inp, e, d, true);
    return true;
  }
  const t = sign(b);
  const T = t?.pos || pin(b);
  if (!T) return false;
  goTo(b.player, inp, T.x, T.z, 2);
  return true;
}
