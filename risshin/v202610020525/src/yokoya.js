// yokoya.js … 門前・枡形・横矢・石落としの殺し場（束9）
// docs/battle-system-spec.md 22〜24・27章。壁・櫓の上の守り（本物の鉄砲・弓がいればその者の撃つ損に上乗せ、
// いなければ名目の数で撃つ）が、門前（門の外12m）・枡形の中の攻め手を0.5秒ごとに数えて撃つ。
// 密集ほど当たる（dense 1.4倍）。横矢の点からの当たりは側面に数える（正面の竹束・狭間の陰が効かない）。
// 石落としは門の真上から6〜9秒に一度、2〜3人を討つ。どれも本物の兵には army.damage、軽い兵には名目の損で。
//
// 使い方（戦の定義から）：
//   import { makeKillZones } from './yokoya.js';
//   const KZ = makeKillZones(rt, C, {
//     gates: [{ at: { x, z }, name }],                 // 門前（外12m）を数える
//     masugata: [{ at: { x, z }, r: 10 }],              // 枡形の中（四角）
//     yokoya: [{ at: { x, z }, r: 14 }],                // 横矢の点（隅櫓・塀の折れ）。側面に数える
//     rocks: [{ at: { x, z } }],                        // 石落とし（門の真上）
//     team,                                             // 守りの team
//     dense: 5,                                         // この数を超えると密集（1.4倍）
//   });
//   // 毎コマ：KZ.tick(dt)
const TICK = 0.5;
const GATE_R = 12;
const BASE_RATE = 1.6;      // 一人当たりの基礎の撃つ損（秒あたり）
const DENSE_MUL = 1.4;
const SIDE_MUL = 1.25;      // 横矢は側面に数える（正面の陰が効かないので実質当たりやすい）
const ROCK_MIN = 6, ROCK_MAX = 9;
const ROCK_DMG = 26;

function log(rt, text) {
  rt.__siegeLog = rt.__siegeLog || [];
  rt.__siegeLog.push(`${Math.round(rt.t || 0)}s ${text}`);
}

export function makeKillZones(rt, C, o = {}) {
  const team = o.team ?? 1;
  const denseN = o.dense ?? 5;
  const gates = (o.gates || []).map((g, i) => ({ id: g.id || `gate${i}`, at: g.at, name: g.name || null }));
  const masugata = (o.masugata || []).map((m, i) => ({ id: m.id || `masu${i}`, at: m.at, r: m.r ?? 10 }));
  const yokoya = (o.yokoya || []).map((y, i) => ({ id: y.id || `yoko${i}`, at: y.at, r: y.r ?? 14 }));
  const rocks = (o.rocks || []).map((r, i) => ({ id: r.id || `rock${i}`, at: r.at, nextT: ROCK_MIN + Math.random() * (ROCK_MAX - ROCK_MIN) }));

  let acc = TICK;
  const stat = { gate: {}, masugata: {}, yokoya: {} };

  function collectFoes(at, r) {
    const list = [];
    if (rt.army && rt.army.forNear) {
      rt.army.forNear(at.x, at.z, r, (u) => { if (u.alive && !u.isStruct && u.team !== team) list.push(u); });
    }
    return list;
  }

  // 守りの火力：その点から 20m 内にいる本物の鉄砲・弓の守りがいればその数、いなければ名目（一定の2）
  function defenderPower(at) {
    let real = 0;
    if (rt.army && rt.army.forNear) {
      rt.army.forNear(at.x, at.z, 20, (u) => { if (u.alive && !u.isStruct && u.team === team && (u.kind === 'gun' || u.kind === 'bow')) real++; });
    }
    return real > 0 ? real : 2;
  }

  function strikeArea(id, bucket, at, r, { side = false } = {}) {
    const foes = collectFoes(at, r);
    bucket[id] = { n: foes.length };
    if (!foes.length) return;
    const power = defenderPower(at);
    const denseMul = foes.length >= denseN ? DENSE_MUL : 1;
    const sideMul = side ? SIDE_MUL : 1;
    const rate = BASE_RATE * power * denseMul * sideMul * TICK;
    // 損は foes に割り振る（本物は army.damage、軽い兵は名目を直に減らす）
    let remain = rate;
    const n = Math.min(foes.length, Math.max(1, Math.round(rate / 4)));
    for (let i = 0; i < n && remain > 0; i++) {
      const u = foes[(Math.random() * foes.length) | 0];
      const amt = remain / (n - i);
      if (rt.army && rt.army.damage) rt.army.damage(u, amt, null, { kind: side ? 'yokoya' : 'gate' });
      remain -= amt;
    }
  }

  function tickRocks(dt) {
    for (const r of rocks) {
      r.nextT -= dt;
      if (r.nextT > 0) continue;
      r.nextT = ROCK_MIN + Math.random() * (ROCK_MAX - ROCK_MIN);
      const foes = collectFoes(r.at, 4);
      if (!foes.length) continue;
      const n = Math.min(foes.length, 2 + (Math.random() < 0.5 ? 0 : 1));
      for (let i = 0; i < n; i++) {
        const u = foes[(Math.random() * foes.length) | 0];
        if (rt.army && rt.army.damage) rt.army.damage(u, ROCK_DMG, null, { kind: 'rock' });
      }
      log(rt, `石落とし（${r.id}）が${n}人を討つ`);
    }
  }

  return {
    stat,
    tick(dt) {
      tickRocks(dt);
      acc += dt;
      if (acc < TICK) return;
      acc = 0;
      for (const g of gates) strikeArea(g.id, stat.gate, g.at, GATE_R);
      for (const m of masugata) strikeArea(m.id, stat.masugata, m.at, m.r);
      for (const y of yokoya) strikeArea(y.id, stat.yokoya, y.at, y.r, { side: true });
    },
  };
}

// 虎口：枡形の中で向きを変える間は歩み0.7倍・撃たれる率1.3倍。army_move.js の steer 側から
// 「枡形の中か」を見る時に使う薄い判定（束9-3）。castle_plan.js の masugata 点の列から判定。
export function inMasugataTurn(x, z, masugata, r = 10) {
  for (const m of masugata || []) {
    const at = m.at || m;
    if (Math.hypot(x - at.x, z - at.z) < (m.r ?? r)) return true;
  }
  return false;
}
export const MASUGATA_SPEED_MUL = 0.7;
export const MASUGATA_HIT_MUL = 1.3;
