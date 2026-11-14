// ======================================================================
// 稲生 2〜5分：林勢の前衛（葦原の脇道からの寄せ）
//   柴田の物見を討った直後、左の葦原の脇道から林勢の前衛（物頭と足軽の二組）が列の左の端へ駆け寄る。
//   組と左の二組が向きを変えて受ける。物頭（頭）を討つと、頭を失った足軽が背を向けて逃げる（敗走を初めて見せる）。
//   その間、正面の柴田勢は太鼓に合わせてじりじりと寄せて来る（見える敵は必ず動く）。
//   物頭は主人公が討つまで残し、時間経過だけで前衛を退けた事にしない。
// ======================================================================
import { enemyGroup } from '../bhelp.js';
import { sfx } from '../audio.js';
import { pinAt } from './index.js';
import { inouEnemyAlive } from '../b_inou_goals.js';

const live = (g) => g && g.units.some((u) => u.alive && !u.gone);
const LOOK = { armor: 0x2e2822, hatColor: 0x1c1916, lace: 0x6a4a30, cloth: 0x7a5236, flag: 'nobukatsu', flagShape: 1 };
const dress = (list) => list.map((s) => ({ ...s, o: { ...LOOK, ...(s.o || {}) } }));

export function start(rt, def, C) {
  const F = rt.flags, v = F.v15;
  v.vanT = rt.t; v.ph = 'van';
  const ZL = v.lineZ ?? C.ALLY_Z0 - 20;
  v.vanMeet = { x: -34, z: ZL - 2 };   // 列の左の端の西（柴田勢の列の三十m 南。前衛へ向かう道が柴田勢の前を通らない）
  rt.after(1.2, () => rt.say('足軽', '左じゃ！　葦原の脇道から林の兵が来るぞ！', 3));
  rt.after(4.4, () => rt.say('組頭', '林の前衛じゃ。我らと左の二組で受けるぞ。物頭を狙え！', 3.4));
  sfx('taiko', 0.8);
  // 一の組：物頭と足軽。脇道（x −40 あたり）を南へ駆けて来る
  const mk = (name, z, list, sp) => {
    const g = enemyGroup(rt, { faction: 'nobukatsu', name, anchor: { x: -70, z }, facing: Math.PI / 2, fleeDir: { x: -1, z: -0.3 }, width: 4, noRout: true, noAI: true,
      formation: 'line', morale: 80, dmgMult: 0.4, order: 'move', dest: { ...v.vanMeet }, aggro: 0, speed: sp }, dress(list));
    g.onArrive = (q) => { q.noAI = false; q.order = 'attack'; q.aggro = 16; q.seekRange = 26; };
    (F.groups || []).push(g);
    return g;
  };
  // 一の組（足軽八・侍一）が先に駆け寄り、物頭は二の組（弓まじり）と三十秒遅れて来る
  v.vg1 = mk('林勢の前衛', ZL + 6, [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 6, o: { flagScale: 1 } }, { type: 'ashigaru', n: 2 }], 3.3);
  rt.after(30, () => {
    if (v.vanDone || F.ending) return;
    v.vg2 = mk('林勢の前衛', ZL + 14, [{ type: 'samurai', n: 1, o: { name: '林勢の物頭' } }, { type: 'ashigaru', n: 6, o: { flagScale: 1 } }, { type: 'ashigaru', n: 1 }, { type: 'bow', n: 2 }], 3.4);
    v.boss = v.vg2.units.find((u) => u.name === '林勢の物頭') || v.vg2.units[0];
    v.vg2.leader = v.boss;
    rt.say('組頭', '物頭が二の組を連れて来たぞ。あの侍を討て！', 3);
  });
  rt.army.play('eshout', { x: -66, z: ZL + 4 }, 1.1);
  // 組（主人公の組）と列の左の二組が左へ向きを変えて受ける
  v.vanAllies = [F.allies, F.line[1], F.line[2]].filter(Boolean);
  v.vanAllies.forEach((g, i) => {
    g.order = 'move'; g.speed = 3.2; g.aggro = 14;
    g.dest = { x: v.vanMeet.x + 8 + i * 5, z: v.vanMeet.z + (i - 1) * 6 };
    g.onArrive = (q) => { q.order = 'attack'; q.aggro = 14; q.seekRange = 14; };   // 柴田勢の列へは向かわない（狭く探す）
  });
  // 正面の柴田勢は田の向こうで槍を立てて構え、太鼓で一度だけ六m 押し出す（組み合うのは本体の段一。前は寄せ過ぎて段一の前に組み合った）
  for (const g of F.l1 || []) if (live(g)) { g.noAI = true; g.aggro = 0; g.order = 'hold'; }
  rt.after(40, () => {
    if (v.vanDone) return;
    sfx('taiko', 0.6); rt.army.play('toki', { x: C.FRONT_X, z: C.L1_MEET - 30 }, 0.9);
    for (const g of F.l1 || []) if (live(g)) { const c = g.center(), to = { x: c.x, z: Math.min(c.z + 6, C.L1_MEET - 22) }; g.order = 'move'; g.speed = 3.4; g.dest = to; g.onArrive = (q) => { q.order = 'hold'; q.anchor = { ...to }; }; }
  });
}

export function target(rt) {
  const v = rt.flags.v15;
  if (inouEnemyAlive(v.boss)) return v.boss;
  let best = null, bd = Infinity;
  const P = rt.player.u.pos;
  for (const g of [v.vg1, v.vg2]) if (g && !g.routed) for (const u of g.units) {
    if (!inouEnemyAlive(u)) continue;
    const d = (u.pos.x - P.x) ** 2 + (u.pos.z - P.z) ** 2;
    if (d < bd) { bd = d; best = u; }
  }
  return best;
}
export function pin(rt) {
  const u = target(rt);
  return u ? pinAt(rt, u.pos, '葦原の脇道', u, 3) : pinAt(rt, null);
}

function routAll(rt) {
  const F = rt.flags, v = F.v15;
  if (v.vanRout) return;
  v.vanRout = rt.t;
  for (const g of [v.vg1, v.vg2]) if (g) {
    g.noRout = false; g.noAI = false; g.morale = 0; g.leader = null; g.fleeDir = { x: -1, z: -0.3 }; g.speed = 4.6;
  }
  rt.army.play('eshout', v.boss?.pos || rt.player.u.pos, 1.3);
  rt.say('組頭', '物頭が討たれて、前衛が崩れたぞ！　頭を失うた兵は、ああして逃げる。', 3.4);
  rt.after(3.8, () => rt.say('組頭', '追うな！　列へ戻れ。本当の敵は正面の柴田勢じゃ！', 3));
  rt.after(9, () => finish(rt));
}
function finish(rt) {
  const F = rt.flags, v = F.v15;
  if (v.vanDone) return;
  v.vanDone = true; v.ph = null;
  // 組と左の二組は持ち場へ戻る（本体の startLines が列ごと前へ出す）
  for (const g of v.vanAllies || []) if (live(g)) { g.focus = null; g.order = 'move'; g.speed = 3; g.aggro = 6; g.dest = { x: g.slotX, z: (v.lineZ ?? 110) }; g.onArrive = (q) => { q.order = 'hold'; }; }
  // 逃げ遅れの林の兵は霞の向こうへ（本物の枠を空ける）
  rt.after(14, () => { for (const g of [v.vg1, v.vg2]) if (g) for (const u of g.units) if (u.alive && !u.gone && Math.hypot(u.pos.x - rt.player.u.pos.x, u.pos.z - rt.player.u.pos.z) > 40) rt.army.despawn(u); });
}

export function tick(rt) {
  const F = rt.flags, v = F.v15;
  if (v.vanDone || F.ending) return;
  if (!v.vanRout && v.boss && (!v.boss.alive || v.boss.gone)) routAll(rt);
  // 物頭は主人公が討つ相手として残す。時間だけで済ませない。
}
export function onKill(rt, victim) {
  const v = rt.flags.v15;
  if (v && victim && victim === v.boss && !v.vanRout) routAll(rt);
}
