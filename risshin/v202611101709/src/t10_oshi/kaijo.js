// ======================================================================
// 忍城攻め　終幕「開城」（14〜16分）　docs/toyo15_plan_1108.md の 13
// 史実：水攻めでも城は沈まず、七月五日に小田原が開城。城主の成田氏長の言葉で、忍城は七月十六日ごろに明け渡された。
//   寄せ手は自力で落とせなかった（docs/oshi_spec_1109.md：「陥落」でなく「開城」。城は最後まで水の上に残る）。
// 遊び：切れ口を塞いだ後、時が飛ぶ。使番「小田原城、開城。」一瞬静か。任務は「城方の使者を迎えよ」へ。
//   佐間口の門が開き、城の者が槍を伏せて出てくる。成田の旗が下がり、成田長親が三成の名代に城を渡す。主人公は門前で見届ける。
// 入れ方：b_t10_oshi.js の update（切れ口が塞がった所）で start(rt, C)、tick(rt, dt, C)。見届けると def.win(rt)。
// ======================================================================
import { enemyGroup, allyGroup, nm } from '../bhelp.js';
import { nobori, kobune } from '../props.js';
import { sfx } from '../audio.js';

const WATCH = 42;   // 門が開いてから、見届けて締めるまで（秒）

export function start(rt, C) {
  const F = rt.flags;
  if (F.step >= 8) return;
  F.step = 8; F.stepT = rt.t;
  // 門前へ移る前に一斉射撃を止める。半秒ごとの本体の確認まで待つと、開城の知らせの最中にも矢が降る。
  F.noVolley = true;
  rt.setPhase('kaijo');
  rt.obj('main', C.MISSIONS[7], 'main');
  const K = F.kai = { t0: rt.t, jump: rt.t };
  // 時が飛ぶ（七月半ば）。誰も刃を交えない
  for (const g of rt.army.groups) if (g.team === 1) for (const u of g.units) if (u.alive && !u.gone && !u.invuln && !C.near(u.pos, C.CASTLE, 30)) rt.army.despawn(u);
  for (const g of rt.army.groups) if (g.team === 0 || g.team === 1) {
    g.peaceful = true; g.fire = false; g.aggro = 0;
    for (const u of g.units) { u.target = null; u.watch = null; u.atk = null; u.swing = null; u.bind = null; u.charging = false; }
  }
  rt.world.setTime('day'); rt.world.setRainTarget?.(0);
  C.warp(rt, C.FRONT.x + 6, C.FRONT.z + 6, Math.atan2(C.GATE.x - C.FRONT.x, C.GATE.z - C.FRONT.z));
  // 浅瀬の土手は狭い。組は土手に沿って二列の縦に並べる（横へ広げると沼の水に腰まで立った）
  { const ux = Math.SQRT1_2, uz = Math.SQRT1_2;   // 門から浅瀬の手前への向き
    (rt.squad || []).forEach((o, i) => { if (!o.alive || o.gone) return; const k = 8 + (i >> 1) * 1.3, sd = (i % 2 ? 0.8 : -0.8), x = C.FRONT.x + ux * k + uz * sd, z = C.FRONT.z + uz * k - ux * sd;
      o.pos.set(x, rt.world.heightAt(x, z), z); if (o.vel) o.vel.x = o.vel.y = o.vel.z = 0; if (o.mesh) o.mesh.position.copy(o.pos); }); }
  rt.banner('七月　小田原開城', '佐間口で、城方の使者を迎えよ');
  sfx('taiko', 0.4);
  // 城の門の脇に、城の舟が繋がれている（城の者が水の上を行き来した舟）
  K.boats = [[-3.5, 4.5], [4.5, -3.5]].map(([dx, dz]) => { const b = kobune(C.FRONT.x + dx - 4, (F.lakeY ?? -0.6) + 0.05, C.FRONT.z + dz - 4, Math.PI / 4, 6); if (b) rt.scene.add(b); return b; });
  rt.after(2, () => rt.say('使番', '小田原城、開城。', 2.6));
  rt.after(7, () => rt.say('使番', '北条氏直殿、城を出て殿下の陣へ下られました', 3.2));
  rt.after(11, () => rt.say(nm(rt), '……忍の城は、まだ落ちておらぬのに', 3));
  rt.after(15, () => rt.say('石田三成', '城主の氏長は小田原で降った。その言葉で、この城も開く', 3.4));
  rt.after(19, () => open(rt, C));
}

// 門が開き、城の者が槍を伏せて出てくる。成田の旗が下がる
function open(rt, C) {
  const F = rt.flags, K = F.kai;
  if (K.open) return;
  K.open = rt.t;
  C.openDoor(rt);
  // 本丸に座る長親を退場させてから門前へ移す。同じ本人を二人残さない。
  if (F.naritaU?.alive && !F.naritaU.gone) rt.army.despawn(F.naritaU);
  const at = { ...C.INSIDE }, sit = { x: C.FRONT.x - 1, z: C.FRONT.z - 1 };
  K.out = enemyGroup(rt, { faction: 'narita', name: '城を出る成田の者', anchor: at, facing: Math.PI * 0.25, width: 5, noAI: true, noRout: true, order: 'move', dest: sit, speed: 1.6, aggro: 0 },
    C.dress([{ type: 'busho', n: 1, o: { name: '成田長親', invuln: true, horse: false, hat: 'kabuto_m' } }, { type: 'samurai', n: 4 }, { type: 'ashigaru', n: 8 }], C.HOJO));
  K.out.peaceful = true; K.out.fire = false;
  for (const u of K.out.units) { u.invuln = true; u.noTarget = true; }
  K.out.onArrive = (q) => { q.onArrive = null; q.order = 'hold'; for (const u of q.units) if (u.alive && u.name !== '成田長親') u._crouch = true; };
  // 寄せ手の兵は手を出さない
  for (const g of rt.army.groups) if (g.team === 0) { for (const u of g.units) u.target = null; }
  // 三成の名代（浅野の手の侍）が門前で受け取る
  K.recv = allyGroup(rt, { faction: 'ishida', name: '三成の名代', fullStrength: true, anchor: { x: C.FRONT.x + 3, z: C.FRONT.z + 3 }, facing: Math.atan2(-1, -1), width: 2, aggro: 0, order: 'hold', noAI: true, fixed: true },
    C.dress([{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 4 }], C.ISHI));
  K.recv.peaceful = true;
  sfx('wood', 1);
  rt.say('三成の名代', '門が開くぞ！　手を出すな。槍を下げよ', 3.2);
  rt.after(7, () => rt.say('成田長親', '城は明け渡す。城の者の命、お頼み申す', 3.6));
  rt.after(11.4, () => rt.say('三成の名代', '殿下の仰せじゃ。城の者の命は助ける。女子供も城を出よ', 3.6));
  rt.after(15, () => rt.say('成田の侍', '城はまだ落ちておらぬ。主家が降ったゆえ、槍を置くまで', 3.4));
  rt.after(16, () => {
    // 成田の旗が下がり、門の前に石田の旗が立つ
    K.lower = rt.t;
    K.flag = nobori(rt.world, C.FRONT.x + 1.5, C.FRONT.z - 1.5, 'ishida', 5);
    if (K.flag) { K.flag.position.y -= 5; rt.scene.add(K.flag); }
  });
  rt.after(21, () => rt.say('石田三成', '……', 1.6));
  rt.after(24, () => rt.say(nm(rt), '結局、落とせなかった。', 3));
}

export function tick(rt, dt, C) {
  const F = rt.flags, K = F.kai;
  if (!K || F.step !== 8) return;
  // 開城の後は誰も刃を交えない
  if (K.jump) for (const u of rt.army.units) if (u.alive && (u.team === 0 || u.team === 1)) {
    u.target = null; u.watch = null; u.atk = null; u.swing = null; u.bind = null; u.charging = false;
    if (u.team === 1) u.noTarget = true;
  }
  if (K.lower) {
    const k = Math.min(1, (rt.t - K.lower) / 6);
    for (const f of F.naritaFlags || []) { if (f.userData.y0 == null) f.userData.y0 = f.position.y; f.position.y = f.userData.y0 - k * 5; if (k >= 1) f.visible = false; }
    if (K.flag && K.flag.userData.y1 == null) K.flag.userData.y1 = K.flag.position.y;
    if (K.flag) K.flag.position.y = K.flag.userData.y1 + k * 5;
  }
  const P = rt.player.u;
  // 門前で見届けるまで締めない。離れた本人や討たれた本人を時刻だけで勝ちにしない。
  const watching = P.alive && K.open && C.near(P.pos, C.FRONT, 18);
  K.watch = watching ? (K.watch || 0) + dt : 0;
  if (K.watch >= WATCH) C.def.win(rt);
}

export function pin(rt, C) {
  const F = rt.flags, K = F.kai;
  if (!K || F.step !== 8) return undefined;
  // 小田原開城の知らせを待つ間も、見届ける場所を消さない。
  return { x: C.FRONT.x + 2, z: C.FRONT.z + 2, r: 8, label: '佐間口の門前' };
}

export function bot(b, inp, T, C) {
  const F = b.flags;
  if (F.step !== 8) return false;
  T.goTo(b.player, inp, C.FRONT.x + 3, C.FRONT.z + 3, 3);
  return true;
}
