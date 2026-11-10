// ======================================================================
// 戸次川　②の段（3〜6分）：伊集院の先手に槍を入れる → 先手が退く（退くふり） → 追う
// 追うのは二つの足：A 鶴賀城の下の島津の囲みの陣（島津は陣小屋に火を掛けて退く。城の坂の囲みも解ける）
//                 B 中津留の河原の奥（釣り野伏せの口）。B に着いて少し経つと③の伏せ（本体の toStep(3)）
// 呼び方：install(rt, K)・feign(rt, K)（本体の feign から）・update(rt, K)・pin(rt)・ready(rt)。
// ======================================================================
import { hut, nobori, tawara } from '../props.js';
import { sfx } from '../audio.js';

export const SIEGE = { x: 48, z: -70 };   // 島津の囲みの陣（伊集院の先手の後ろ。退く道の x=20 の筋から外す）

export function install(rt) {
  const W = rt.world, F = rt.flags;
  F.s2 = { leg: 0 };
  // 囲みの陣：陣幕と小屋と島津の幟（退く時に火を掛ける）
  try {
    // 陣幕は張らない（中へ入った者が幕に囲まれて出られなかった）。小屋と幟と俵だけの野陣
    rt.scene.add(tawara(W, SIEGE.x + 2, SIEGE.z - 6, 0.4, 3));
    rt.scene.add(hut(W, SIEGE.x - 9, SIEGE.z + 4, 6, 4, 0.4, { roof: 0x6a5c44 }));
    rt.scene.add(hut(W, SIEGE.x + 9, SIEGE.z + 2, 6, 4, -0.3, { roof: 0x5a4c38 }));
    for (const [dx, dz] of [[-5, -5], [5, -5], [0, 6]]) rt.scene.add(nobori(W, SIEGE.x + dx, SIEGE.z + dz, 'shimazu', 5));
  } catch (e) { /* 飾り */ }
}

// 先手が背を見せる：四国の衆はまず囲みの陣まで追う（A）
export function feign(rt, K) {
  const F = rt.flags, B = F.blk, S = F.s2;
  S.leg = 1; S.tA = rt.t;
  K.go(B.ijuin, { x: 14, z: -150 }, 2.0, { back: true });
  rt.unmark('go');
  rt.marker('go', SIEGE, '島津の囲みの陣');
  K.go(B.sen, { x: 62, z: -64 }, 2.6, { charge: true });
  K.go(B.nobu, { x: 24, z: -70 }, 2.6, { charge: true });
  K.go(B.sogo, { x: 44, z: -58 }, 2.4, { charge: true });
  rt.say('長宗我部の侍', '敵、崩れたぞ！　追え、追え！', 2.6);
  rt.after(3.2, () => rt.say('長宗我部元親', '追うな！　それは島津の釣りじゃ', 3));
  // 島津は囲みの陣に火を掛けて退き、城の坂の囲みも解ける（同じ時に城の下でも島津が動く）
  rt.after(5, () => {
    const W = rt.world;
    try { W.addFire(SIEGE.x - 9, SIEGE.z + 4, { size: 3.2, h: 0.3, blackSmoke: true }); W.addFire(SIEGE.x + 9, SIEGE.z + 2, { size: 2.6, h: 0.3, blackSmoke: true }); } catch (e) { /* 飾り */ }
    F.siegeC?.rout?.('B', { from: 0, hideAfter: 30 });
    rt.banner('鶴賀城の囲み、解ける', '');
    sfx('taiko', 0.7);
  });
  rt.after(9, () => rt.say('鶴賀城の城兵', '援軍じゃ！　島津が退いていくぞ！', 2.8));
}

// B：さらに中津留の河原の奥へ
function legB(rt, K) {
  const F = rt.flags, B = F.blk, S = F.s2;
  if (S.leg >= 2) return;
  S.leg = 2; S.tB = rt.t;
  K.go(B.sen, { x: 52, z: -104 }, 2.8, { charge: true });
  K.go(B.nobu, { x: 6, z: -100 }, 2.8, { charge: true });
  K.go(B.sogo, { x: 40, z: -98 }, 2.6, { charge: true });
  rt.unmark('go');
  rt.marker('go', { x: K.RING.x, z: K.RING.z + 6 }, '中津留の河原');
  rt.say('長宗我部信親', '島津は総崩れじゃ。中津留の河原まで追い討て！', 3);
  rt.after(12, () => { if (F.step === 2) rt.say('手勢の侍', '静かすぎる……。両の林に、旗が見えた気がいたす', 3); });
  rt.after(26, () => { if (F.step === 2) rt.say('十河存保', '島津の足が速い。まるで退き慣れておるようじゃ', 3); });
}

export function pin(rt, K) {
  const S = rt.flags.s2;
  // 先手に当たる前から追撃先を指すと、敵を素通りして進行が止まる。
  if (!rt.flags.feigned) return K.lightPos(rt.flags.blk.ijuin);
  return S && S.leg === 1 ? SIEGE : { x: K.RING.x, z: K.RING.z + 6 };
}

// 槍が受けや甲冑で止まっても交戦。討ち取りや本人の負傷を強いない。
// 攻撃の結果は短時間で消えるため、本体から毎コマ呼んで残す。
export function engaged(rt) {
  const F = rt.flags, swing = rt.player.u.swing;
  if (F.ijContact || rt.stats.kills > F.ijKills0 || rt.stats.taken > F.ijTaken0) return true;
  if (swing && (swing.res === 'hit' || swing.res === 'armor' || swing.res === 'block') && F.ijBands) {
    for (const g of F.ijBands) if (g.units.includes(swing.target)) { F.ijContact = true; return true; }
  }
  return false;
}

export function update(rt, K) {
  const S = rt.flags.s2, P = rt.player.u.pos;
  if (!S || S.leg !== 1) return;
  const el = rt.t - S.tA;
  if (el > 45 && Math.hypot(P.x - SIEGE.x, P.z - SIEGE.z) < 16) legB(rt, K);
}

// ③の伏せへ進めてよいか：B の足で河原に着き、少し経った
export function ready(rt, K) {
  const S = rt.flags.s2, P = rt.player.u.pos;
  // 北へ進んだだけでは追撃を果たさない。行き先の印と同じ河原へ着いてから伏せが出る。
  return S && S.leg === 2 && Math.hypot(P.x - K.RING.x, P.z - (K.RING.z + 6)) < 14 && rt.t - S.tB > 40;
}
