// ======================================================================
// 山崎の戦い　遠くの戦（同じ時に別の場所でも何万人も戦っている）
//   ・南の西国街道を上って来る羽柴の後ろ備え（神戸信孝・丹羽長秀）の長い列（軽い作り）
//   ・天王山の裾で、秀長・官兵衛の手が松田・並河と取り合う軽い合戦（addClash）
//   ・御坊塚の後ろの明智の控えと、勝竜寺城の前の守り（軽い作り）
//   ・使番の知らせ（別の戦線の様子）。同じ文は出さない
// 遊ぶ道（円明寺川の中ほど・東の浅瀬・淀川沿い）から離して置く。本物の兵は増やさない。
// ======================================================================
import { flagTexture } from '../textures.js';
import { clash } from '../b_sekigahara.js';

const AK_ARMOR = 0x2c2a27, HA_ARMOR = 0x2a2622;

export function farArmies(rt) {
  const W = rt.world, F = rt.flags, Y = (F.yfar = {});
  if (!W?.addDistantArmy) return Y;
  const A = (o) => { try { return W.addDistantArmy({ host: false, farFill: true, kind: 'mixed', flagTex: flagTexture(o.flag), mon: o.flag, ...o }); } catch (e) { console.warn('t01 far', e); return null; } };
  // 南の街道を上る羽柴の後ろ備え（初めは遠く南。②から北へ歩いて来て、後ろを埋める）
  Y.nobutaka = A({ x: 34, z: 168, w: 26, d: 10, count: 300, facing: Math.PI, armor: HA_ARMOR, flag: 'toyotomi', seed: 15821, team: 0 });
  Y.niwa = A({ x: -70, z: 166, w: 24, d: 10, count: 260, facing: Math.PI, armor: HA_ARMOR, flag: 'toyotomi', seed: 15822, team: 0 });
  // 秀吉の本陣の後ろの旗本の備え（巨大な本陣の厚み）
  Y.hon = A({ x: -36, z: 132, w: 22, d: 8, count: 200, facing: Math.PI, armor: HA_ARMOR, flag: 'toyotomi', seed: 15823, team: 0 });
  // 明智の控え（御坊塚の後ろ）と勝竜寺城の前
  Y.akRes = A({ x: -20, z: -176, w: 26, d: 10, count: 260, facing: 0, armor: AK_ARMOR, flag: 'akechi', seed: 15824, team: 1 });
  Y.shoR = A({ x: 40, z: -196, w: 18, d: 6, count: 120, facing: 0, armor: AK_ARMOR, flag: 'akechi', seed: 15825, team: 1 });
  // 天王山の裾の取り合い（秀長・官兵衛の手と松田・並河の手。軽い合戦）
  try {
    Y.tenno = clash(rt, {
      x: -128, z: -14, facing: Math.PI, w: 40, gap0: 14, seed: 15826, noRout: true, noWake: true,
      A: { flag: 'kuroda', armor: HA_ARMOR, count: 160, flagRate: 0.5, guns: true },
      B: { flag: 'akechi', armor: AK_ARMOR, count: 150, flagRate: 0.5, guns: true },
    });
  } catch (e) { Y.tenno = null; }
  return Y;
}

// 使番の知らせ（別の戦線）。同じ文は二度出さない
export function report(rt, text, sec = 3.4) {
  const F = rt.flags, S = (F.repSaid = F.repSaid || {});
  if (S[text] || rt.over) return;
  S[text] = true;
  rt.say('使番', text, sec);
}
