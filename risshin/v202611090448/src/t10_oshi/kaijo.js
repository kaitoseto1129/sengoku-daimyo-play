// ======================================================================
// 忍城攻め　終幕「開城」（14〜16分）　docs/toyo15_plan_1108.md の 13
// 史実：七月の総攻めでも城の内へは入れず、七月五日に小田原が開城。城主の成田氏長の言葉で、忍城は七月十六日ごろに明け渡された。
//   寄せ手は自力で落とせなかった（「勝っているようで勝てない」城）。
// 遊び：門前の城兵を討っても、残りは門の内へ逃げ込み門が閉まる。時が飛び、使番が小田原の開城と、八王子・韮山の落城を伝える。
//   佐間口の門が開き、城の者が槍を伏せて出てくる。成田の旗が下がり、成田長親が三成の使いに城を渡す。主人公は門前で見届ける。
// 入れ方：b_t10_oshi.js の update（門前の城兵を討った所）で start(rt, C)、tick(rt, dt, C)。見届けると def.win(rt)。
// ======================================================================
import { enemyGroup, allyGroup, nm } from '../bhelp.js';
import { nobori } from '../props.js';
import { sfx } from '../audio.js';

const WATCH = 42;   // 門が開いてから、見届けて締めるまで（秒）

export function start(rt, C) {
  const F = rt.flags;
  if (F.step >= 10) return;
  F.step = 10; F.stepT = rt.t;
  rt.setPhase('kaijo');
  rt.obj('main', C.MISSIONS[9], 'main');
  rt.award((t) => { t.side.push('佐間口の門前で首を取った'); }, '佐間口の門前で首を取った');
  const K = F.kai = { t0: rt.t };
  // 打って出た手と門前の城兵の残りは門の内へ逃げ込み、門が閉まる（城の内へは入れない）
  for (const g of [...F.sorties, F.rear]) if (C.live(g)) { g.noRout = false; g.morale = 0; g.order = 'move'; g.dest = { ...C.INSIDE }; for (const u of g.units) if (u.alive && !u.gone) u.fleeing = true; }
  rt.after(2.5, () => { for (const g of [...F.sorties, F.rear]) if (g) for (const u of g.units) if (u.alive && !u.gone) rt.army.despawn(u); C.def.closeDoor(rt); });
  rt.after(3, () => rt.say('浅野長吉', '残りは門の内へ逃げ込んだ。首は取ったが、これより内へは入れぬ', 3.4));
  rt.after(7, () => rt.say(nm(rt), '寄せても寄せても、門の内へは一歩も入れぬ……', 3));
  // 時が飛ぶ（七月半ば）：小田原の開城の知らせ
  rt.after(11, () => {
    if (F.step !== 10) return;
    K.jump = rt.t;
    for (const g of rt.army.groups) if (g.team === 1) for (const u of g.units) if (u.alive && !u.gone && !u.invuln && C.near(u.pos, C.FRONT, 30)) rt.army.despawn(u);
    for (const g of rt.army.groups) if (g.team === 1) { g.peaceful = true; g.fire = false; g.aggro = 0; }
    C.warp(rt, C.FRONT.x + 6, C.FRONT.z + 6, Math.atan2(C.GATE.x - C.FRONT.x, C.GATE.z - C.FRONT.z));
    rt.banner('七月　小田原開城', '佐間口で、城の明け渡しを見届けよ');
    sfx('taiko', 0.6);
    rt.after(2, () => rt.say('使番', '小田原、開城！　北条氏直殿、城を出て殿下の陣へ下られました！', 3.6));
    rt.after(6.2, () => rt.say('使番', '八王子は落ち、韮山も開いた。残るは、この忍城のみ', 3.4));
    rt.after(10, () => rt.say('石田三成', '城主の氏長は小田原で降った。その言葉で、この城も開く', 3.4));
    rt.after(14, () => open(rt, C));
  });
}

// 門が開き、城の者が槍を伏せて出てくる。成田の旗が下がる
function open(rt, C) {
  const F = rt.flags, K = F.kai;
  if (K.open) return;
  K.open = rt.t;
  C.openDoor(rt);
  const at = { ...C.INSIDE }, sit = { x: C.FRONT.x - 1, z: C.FRONT.z - 1 };
  K.out = enemyGroup(rt, { faction: 'narita', name: '城を出る成田の者', anchor: at, facing: Math.PI * 0.25, width: 5, noAI: true, noRout: true, order: 'move', dest: sit, speed: 1.6, aggro: 0 },
    C.dress([{ type: 'busho', n: 1, o: { name: '成田長親', invuln: true, horse: false, hat: 'kabuto_m' } }, { type: 'samurai', n: 4 }, { type: 'ashigaru', n: 8 }], C.HOJO));
  K.out.peaceful = true; K.out.fire = false;
  for (const u of K.out.units) { u.invuln = true; u.noTarget = true; }
  K.out.onArrive = (q) => { q.onArrive = null; q.order = 'hold'; for (const u of q.units) if (u.alive && u.name !== '成田長親') u._crouch = true; };
  // 寄せ手の兵は手を出さない
  for (const g of rt.army.groups) if (g.team === 0) { for (const u of g.units) u.target = null; }
  // 三成の名代（浅野の手の侍）が門前で受け取る
  K.recv = allyGroup(rt, { faction: 'ishida', name: '三成の名代', fullStrength: true, anchor: { x: C.FRONT.x + 3, z: C.FRONT.z + 3 }, facing: Math.atan2(-1, -1), width: 4, aggro: 0, order: 'hold', noAI: true, fixed: true },
    C.dress([{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 4 }], C.ISHI));
  K.recv.peaceful = true;
  sfx('wood', 1);
  rt.say('浅野の侍', '門が開くぞ！　手を出すな。槍を下げよ', 3.2);
  rt.after(7, () => rt.say('成田長親', '城は明け渡す。城の者の命、お頼み申す', 3.6));
  rt.after(11.4, () => rt.say('浅野の侍', '殿下の仰せじゃ。城の者の命は助ける。女子供も城を出よ', 3.6));
  rt.after(16, () => {
    // 成田の旗が下がり、門の前に石田の旗が立つ
    K.lower = rt.t;
    K.flag = nobori(rt.world, C.FRONT.x + 1.5, C.FRONT.z - 1.5, 'ishida', 5);
    if (K.flag) { K.flag.position.y -= 5; rt.scene.add(K.flag); }
  });
  rt.after(21, () => rt.say(nm(rt), '自らの手では、ついに落とせなんだ城か', 3.2));
}

export function tick(rt, dt, C) {
  const F = rt.flags, K = F.kai;
  if (!K || F.step !== 10) return;
  // 開城の後は誰も刃を交えない
  if (K.jump) for (const u of rt.army.units) if (u.alive && u.team === 1) { u.target = null; u.atk = null; u.noTarget = true; }
  if (K.lower) {
    const k = Math.min(1, (rt.t - K.lower) / 6);
    for (const f of F.naritaFlags || []) { if (f.userData.y0 == null) f.userData.y0 = f.position.y; f.position.y = f.userData.y0 - k * 5; if (k >= 1) f.visible = false; }
    if (K.flag && K.flag.userData.y1 == null) K.flag.userData.y1 = K.flag.position.y;
    if (K.flag) K.flag.position.y = K.flag.userData.y1 + k * 5;
  }
  const P = rt.player.u;
  // 門前で見届けるまで締めない。離れた本人や討たれた本人を時刻だけで勝ちにしない。
  if (P.alive && K.open && rt.t - K.open > WATCH && C.near(P.pos, C.FRONT, 18)) C.def.win(rt);
}

export function pin(rt, C) {
  const F = rt.flags, K = F.kai;
  if (!K || F.step !== 10) return undefined;
  return K.jump ? { x: C.FRONT.x + 2, z: C.FRONT.z + 2, r: 8, label: '佐間口の門前' } : null;
}

export function bot(b, inp, T, C) {
  const F = b.flags;
  if (F.step !== 10) return false;
  T.goTo(b.player, inp, C.FRONT.x + 3, C.FRONT.z + 3, 3);
  return true;
}
