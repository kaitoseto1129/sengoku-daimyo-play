// ======================================================================
// tsumari.js … 詰まり：門・橋・山道の口に maxFlow、曲輪の capacity、密集の度合い（束20）
// docs/battle-system-plan.md 束20／docs/castle-fort-system-spec.md 32・33・77章。
// army_move.js の gateFactor は army.chokes の各口（{a,b,w,maxFlow,team}）を見て、口の芯（a-b の中ほど
// 2.5m）にいる人数が maxFlow を超えたら超えた分だけ待たせる。ch.maxFlow が無い口（siege_gate.js の城門
// など）は今まで通り幅 w から出す（挙動は変わらない）。ここはその口を足す薄い道具と、曲輪の capacity
// から入口の maxFlow を絞る仕組みをまとめる。束21（切岸・堀・world.js・army の進み）とはぶつからない
// 新しい関数名だけを使う。
//
// 使い方（戦の定義・試しの JS から）：
//   import { addChoke, addPathChokes, crowdAt, tickKuruwaCapacity } from './tsumari.js';
//   addChoke(rt, { a: {x,z}, b: {x,z}, maxFlow: 12, kind: '橋' });
//   addPathChokes(rt, ROAD, { kind: '山道', maxFlow: 3 });
//   const dense = crowdAt(rt, x, z);   // 0〜1
//   tickKuruwaCapacity(K, { san: [F.gates.oteInner] });  // 毎コマ（K は nawabari.js の戻り）
// ======================================================================

// 77 章の既定の maxFlow：門 8・橋 12・山道 3
export const DEF_MAXFLOW = { gate: 8, bridge: 12, pass: 3 };

function kindToDefault(kind) {
  if (kind === '橋') return DEF_MAXFLOW.bridge;
  if (kind === '山道') return DEF_MAXFLOW.pass;
  return DEF_MAXFLOW.gate;
}

// 口を一つ足して rt.army.chokes に積む（army_move.js の gateFactor がそのまま読む形）。戻り値は口そのもの
export function addChoke(rt, { a, b, w, maxFlow, kind = '門', team } = {}) {
  if (!rt || !rt.army || !a || !b) return null;
  rt.army.chokes = rt.army.chokes || [];
  const mf = maxFlow ?? kindToDefault(kind);
  const ch = { a, b, w: w ?? Math.max(1, mf / 1.4), maxFlow: mf, kind, team };
  rt.army.chokes.push(ch);
  return ch;
}

// 道 pts（[[x,z], ...]）の上を、いくつかの区切りに分けて口にする（山道の狭い所をまとめて絞る用）。
// step：何点ごとに一つの口にするか（既定2。道が細かい点の列の時に口を作りすぎない）
export function addPathChokes(rt, pts, { w, maxFlow, kind = '山道', team, step = 2 } = {}) {
  const out = [];
  if (!pts || pts.length < 2) return out;
  for (let i = 0; i + step < pts.length; i += step) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + step];
    const ch = addChoke(rt, { a: { x: ax, z: az }, b: { x: bx, z: bz }, w, maxFlow, kind, team });
    if (ch) out.push(ch);
  }
  return out;
}

// (x, z) を中心にした升（既定半径2.5m＝口の芯と同じ）の密集度を 0〜1 で返す（1人/1.1㎡あたりで満杯とみなす）
export function crowdAt(rt, x, z, r = 2.5) {
  if (!rt || !rt.army || !rt.army.forNear) return 0;
  let n = 0;
  rt.army.forNear(x, z, r, (o) => { if (o.alive && !o.isStruct) n++; });
  const area = Math.PI * r * r;
  return Math.max(0, Math.min(1, (n / area) / 0.9));
}

// 曲輪の capacity（nawabari.js の K.kuruwa[id].capacity）を見て、攻め手がそこへ capacity を超えて
// 入ろうとしている間は、入口の口の maxFlow を絞る（同時に戦える数を絞る＝77章のボトルネック扱い）。
// gatesByKuruwa：{ 曲輪id: [siege_gate.makeGate の戻り, ...] }（戻りの _flowEntry が実の口）。
// 毎コマ呼んでよい（曲輪が無い・capacity が無い・口が makeGate 製でない場合は何もしない）
export function tickKuruwaCapacity(K, gatesByKuruwa) {
  if (!K || !K.kuruwa || !gatesByKuruwa) return;
  for (const id in gatesByKuruwa) {
    const k = K.kuruwa[id];
    const gates = gatesByKuruwa[id];
    if (!k || !k.capacity || !gates) continue;
    const over = k.attackers > k.capacity;
    for (const g of gates) {
      const ch = g && g._flowEntry;
      if (!ch) continue;
      if (ch._baseMaxFlow === undefined) ch._baseMaxFlow = ch.maxFlow ?? null;
      if (over) {
        const ratio = Math.max(0.3, k.capacity / k.attackers);
        ch.maxFlow = Math.max(2, Math.round((ch._baseMaxFlow ?? DEF_MAXFLOW.gate) * ratio));
      } else if (ch._baseMaxFlow != null) {
        ch.maxFlow = ch._baseMaxFlow;
      }
    }
  }
}
