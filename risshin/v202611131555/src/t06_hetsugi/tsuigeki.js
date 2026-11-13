// ======================================================================
// 戸次川　②の段（3〜6分）：伊集院の先手に槍を入れる → 先手が退く（退くふり） → 追う
// 追うのは二つの足：A 鶴賀城の下の島津の囲みの陣（島津は陣小屋に火を掛けて退く。城の坂の囲みも解ける）
//                 B 中津留の河原の奥（釣り野伏せの口）。B に着いて少し経つと③の伏せ（本体の toStep(3)）
// 呼び方：install(rt, K)・feign(rt, K)（本体の feign から）・update(rt, K)・pin(rt)・ready(rt)。
// ======================================================================
import { hut, nobori, tawara } from '../props.js';
import { sfx } from '../audio.js';
import { nm } from '../bhelp.js';

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
  // 仙石は東の小屋（SIEGE.x+9）の脇を抜けず、東の外を回る（62,-64 では河原へ下る道が小屋の壁に掛かり、旗本が (60,-65) で20秒★★★94回止まった。11/13 クラウドか act bot）
  K.go(B.sen, { x: 70, z: -62 }, 2.6, { charge: true });
  K.go(B.nobu, { x: 24, z: -70 }, 2.6, { charge: true });
  K.go(B.sogo, { x: 44, z: -58 }, 2.4, { charge: true });
  rt.say('長宗我部の侍', '押しているぞ！　島津が退く、追え、追え！', 2.6);
  rt.after(3.2, () => rt.say('仙石秀久', '逃がすな！　鶴賀の囲みを破れ！', 3));
  rt.flags.mText = '退く島津勢を追え'; rt.obj('main', '退く島津勢を追え', 'main', true);
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
  rt.after(8, () => { if (F.step === 2) rt.say('土佐の足軽', '島津も大したことないぞ！', 2.6); });
  // 7:00 の違和感：まだ退く。振り返ると戸次川が遠い（字で罠を教えない）
  rt.after(22, () => { if (F.step === 2) rt.say('手勢の侍', '……川が、ずいぶん遠うなった', 3); });
  rt.after(30, () => { if (F.step === 2) rt.say('十河存保', '島津の足が速い。まだ退くか', 3); });
}

export function pin(rt, K) {
  const S = rt.flags.s2;
  // 先手に当たる前から追撃先を指すと、敵を素通りして進行が止まる。
  if (!rt.flags.feigned) {
    // 塊と本物の先手は別々に動く。塊の中心へ案内すると、追って来た先手から離れてしまう。
    const p = rt.player.u.pos;
    let nearest = null, best = Infinity;
    for (const g of rt.flags.ijBands || []) for (const u of g.units) {
      if (!u.alive || u.gone || u.dying || u.noTarget || u.woundOut || u.rearWound || u.fleeing) continue;
      const dx = u.pos.x - p.x, dz = u.pos.z - p.z, d = dx * dx + dz * dz;
      if (d < best) { nearest = u; best = d; }
    }
    return nearest ? nearest.pos : K.lightPos(rt.flags.blk.ijuin);
  }
  return S && S.leg === 1 ? SIEGE : { x: K.RING.x, z: K.RING.z + 6 };
}

// 槍が受けや甲冑で止まっても交戦。討ち取りや本人の負傷を強いない。
// 攻撃の結果は短時間で消えるため、本体から毎コマ呼んで残す。
export function engaged(rt) {
  const F = rt.flags, swing = rt.player.u.swing;
  // 全体の討ち取り・負傷には先手以外との戦いも混じる。伊集院へ槍を入れた記録だけで判定する。
  if (F.ijContact) return true;
  if (swing && (swing.res === 'hit' || swing.res === 'armor' || swing.res === 'block') && F.ijBands) {
    for (const g of F.ijBands) if (g.units.includes(swing.target)) { F.ijContact = true; return true; }
  }
  // 先手の槍を本人が受けた時も交戦。攻め返す前に味方が討っても止めない。
  for (const g of F.ijBands || []) for (const u of g.units) {
    // 倒れた者や戦列を離れた者に残る古い刃の結果は、新たな交戦に数えない。
    if (!u.alive || u.gone || u.dying || u.hp <= 0 || u.noTarget || u.woundOut || u.rearWound || u.fleeing) continue;
    if (u.swing?.target === rt.player.u && (u.swing.res === 'hit' || u.swing.res === 'armor' || u.swing.res === 'block')) { F.ijContact = true; return true; }
  }
  return false;
}

export function pressed(rt, K) {
  if (engaged(rt)) return true;
  const F = rt.flags, P = rt.player.u.pos;
  // 本人が先手の持ち場を押さえ、味方が既に先手を崩した場合も追撃へ。
  // 無関係な敵の討ち取りや、遠くで待つだけでは進めない。
  const front = K.lightPos(F.blk.ijuin);
  const remaining = (F.ijBands || []).some((g) => g.units.some((u) =>
    u.alive && !u.gone && !u.dying && !u.noTarget && !u.woundOut && !u.rearWound && !u.fleeing));
  if (remaining || Math.hypot(P.x - front.x, P.z - front.z) >= 24) { F.ijFrontAt = null; return false; }
  F.ijFrontAt ??= rt.t;
  return rt.t - F.ijFrontAt >= 10;
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
