// K665・K666：塀（土塀・柵・板塀・多聞・石垣）の線と門（冠木門・薬医門・櫓門）の柱の位置を記録し、
// prototype/tools/k666_gaps.mjs が「門の柱と塀の端の隙間」を数える。globalThis.__K666 の時は道具のために全部を残す
// 遊ぶ時も、戦の組み立ての間だけ globalThis.__K665 に集め、組み終えた所で gate_fill.js が門の脇の隙間を埋めて捨てる
// meta：石垣の継ぎ目を同じ作りで継ぐための、呼んだ時の world と引数（gate_fill.js。遊ぶ時の記録だけに持つ）
export function probeWall(kind, pts, baseY = null, meta = null) {
  if (!pts || pts.length < 2) return;
  const q = pts.map((p) => [p[0], p[1]]);
  if (globalThis.__K665) globalThis.__K665.walls.push({ kind, baseY, pts: q, meta });
  if (globalThis.__K666) globalThis.__K666.walls.push({ kind, baseY, pts: q });
}
// half：門の柱（脇の台）の外の端までの半幅。rot：門の向き（柱は x ± cos(rot)・z ∓ sin(rot) の側）
export function probeGate(kind, x, z, half, rot) {
  for (const P of [globalThis.__K665, globalThis.__K666]) if (P) P.gates.push({ kind, x, z, half, rot });
}
