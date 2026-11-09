// k08/engun.js … 木津川口の 9〜12 分「城から加勢が来て一時押され、味方の新手で押し返す」（docs/toku15_plan_1108.md の 8）
// 新手は湧かせない（kaito AW の6）：城の方の加勢は始めから砦の北の葦原の奥（博労淵へ通う道）に控え、
//   浅野の後備は始めから浅野の陣の後ろに控える。④（北の口）に入ってから放つ。
// 流れ：④の十八秒後に北で法螺と旗（足軽の一声）→ 加勢が北の口へ駆け込み、味方は一時押される →
//   四十秒ほど後に浅野の後備が南から来て押し返す。④は北の口の守兵と加勢の両方が崩れるまで終わらない。
// 加勢に史料の名のある将は当てない（隊の名だけ）。字の札は足さない（台詞だけ）。
import { enemyGroup, allyGroup } from '../bhelp.js';
import { sfx } from '../audio.js';

const alive = (g) => g && !g.routed && g.count > 0;

export function install(rt, K) {
  const F = rt.flags;
  const t = (side, type, n, o) => ({ type, n, o: { flag: side.flag, armor: side.armor, ...o } });
  // 城の方からの加勢：砦の北の口の先、博労淵へ通う道に控える（遠く、動かない）
  F.engun = enemyGroup(rt, { fixed: true, name: '城からの加勢', faction: 'toyotomi', flag: K.TOYO.flag, armor: K.TOYO.armor, anchor: { x: 6, z: -150 }, facing: 0,
    order: 'hold', aggro: 0, width: 10, noRout: true },
    [t(K.TOYO, 'samurai', 3), t(K.TOYO, 'ashigaru', 12), t(K.TOYO, 'gun', 2)]);
  F.engun.noAI = true; F.engun.noFrontline = true;
  F.engun.dmgMult = 0.45;   // 押されるのは隊の位置で見せる。本人が一息で撃ち倒されないように
  for (const u of F.engun.units) u.noTarget = true;
  // 浅野の後備：浅野の陣の後ろに控える
  F.asano2 = allyGroup(rt, { faction: 'asano', name: '浅野の後備', anchor: { x: K.ASANO_AT.x + 6, z: K.ASANO_AT.z + 18 }, facing: Math.PI, width: 10, aggro: 4, morale: 95, noRout: true, fullStrength: true },
    [t(K.ASANO, 'samurai', 3), t(K.ASANO, 'ashigaru', 8), t(K.ASANO, 'gun', 4)]);
  F.asano2.noAI = true;
}

export function start(rt, K) {
  const F = rt.flags;
  F.engunN = F.engun ? F.engun.count : 0;
  const S = (t, fn) => rt.after(t, () => { if (F.step === 4 && !F.ending) fn(); });
  S(18, () => { sfx('horagai', 0.45); rt.say('足軽', '北に桐の旗！　城の方から加勢が来るぞ！', 3); });
  S(20, () => {
    if (!alive(F.engun)) return;
    F.engun.noAI = false; F.engun.order = 'attack'; F.engun.aggro = 20; F.engun.seekRange = 40;
    F.engun.anchor.x = K.NGATE.x; F.engun.anchor.z = K.NGATE.z + 8;
    for (const u of F.engun.units) u.noTarget = false;
    F.engunOn = true;
    if (Array.isArray(F.s4) && !F.s4.includes(F.engun)) F.s4.push(F.engun);   // 印と bot の行き先に入れる
  });
  // 加勢が北の口へ着く頃：味方が押される（隊を門の内の半ばまで下げる）
  S(40, () => {
    rt.say('蜂須賀の侍', '押される！　門の内まで下がって組を立て直せ！', 3);
    for (const g of [F.saki, F.asano, F.ikeda]) if (alive(g)) { g.anchor.x = (g.anchor.x || 0) * 0.6; g.anchor.z = K.GATE.z - 18; }
  });
  // 浅野の後備が来て押し返す
  S(58, () => {
    const g = F.asano2;
    if (!alive(g)) return;
    g.noAI = false; g.order = 'attack'; g.aggro = 24; g.seekRange = 40; g.speed = 4.2;
    g.anchor.x = K.NGATE.x + 8; g.anchor.z = K.NGATE.z + 12;
    sfx('taiko', 0.6);
    rt.say('浅野長晟', '後備を出せ！　北の口へ押し返せ！', 3);
    rt.after(10, () => {
      if (F.step !== 4) return;
      for (const q of [F.saki, F.asano, F.ikeda]) if (alive(q)) { q.anchor.x = K.NGATE.x + (q === F.ikeda ? -10 : q === F.asano ? 12 : 3); q.anchor.z = K.NGATE.z + 10; }
    });
  });
}

// ④を終えてよいか：加勢を放った後は、加勢が三割まで減るか崩れるまで待つ（放つ前なら待つ）
export function remaining(rt) {
  const g = rt.flags.engun;
  if (!alive(g)) return 0;
  let n = 0;
  for (const u of g.units) if (u.alive && !u.dying && !u.woundOut && !u.evacuatedWound && !u.fleeing && !u.invuln) n++;
  return n;
}

export function cleared(rt) {
  const F = rt.flags;
  if (!F.engun) return true;
  if (!F.engunOn) return false;
  return remaining(rt) <= Math.ceil((F.engunN || 1) * 0.3);
}
// ⑤へ移る時：残る加勢も博労淵へ退く
export function fleeAll(rt) {
  const g = rt.flags.engun;
  if (!alive(g)) return;
  g.noRout = false; g.noAI = false; g.routed = true; g.order = 'flee';
}
