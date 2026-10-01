// 見える範囲（Fog of War）。RTS の視点（軍配）・小地図・軍議で、敵を隠すためだけに使う。
// 三人称の自分の目では隠さない（自分の目で見える物は見える＝F7）。
// 部隊（本物の兵の隊）と物見櫓（rt.flags.towers）の位置・高さから、1秒に2回だけ数え直す（毎コマではない＝軽い）。
// 森の中は狭くなる。地形の起伏（丘・尾根）が間にあれば見えない。
// M7［D］：霧・雨・夜で見える距離が縮み（world.vis を使う）、燃える建物の煙が風下へ流れて見える範囲をさらに狭める。
import * as THREE from 'three';
import { WIND_STATE } from './world.js';

const _v = new THREE.Vector3();
const DAY_VIS = 680; // world.js の TIME.day（晴れた昼）の見通し。これを基準に縮み具合を測る

// 霧・雨・夜・煙の帳ぶんが掛かった世界の見通し（world.vis）を、晴れた昼と比べた掛け目。下限は残す（真っ暗でも近くは見える）
function weatherVisMult(world) {
  const v = world.vis || DAY_VIS;
  return Math.max(0.32, Math.min(1, v / DAY_VIS));
}

// 夜襲（fort-spec 20）：夜は射撃の当たりが落ちる。戦の定義の側で army_ranged の当たり判定に掛ける（opt-in・既定は 1＝変えない）
export function nightAccuracyMult(world) {
  return weatherVisMult(world) < 1 ? 0.7 : 1;
}

// 燃えている構造物の場所（siege_fire.js の structPoint と同じ考え方）
function burnPoint(s) {
  if (s.seg) return { x: (s.seg[0] + s.seg[2]) / 2, z: (s.seg[1] + s.seg[3]) / 2 };
  return { x: s.x, z: s.z };
}

// (x, z) にかかる煙の濃さ（0〜1）。燃えている物から風下（WIND_STATE）へ流れ、燃えている時が経つほど広く濃くなる
export function smokeAt(rt, x, z) {
  const B = rt.army && rt.army.burning;
  if (!B || !B.length) return 0;
  let m = 0;
  for (const s of B) {
    if (!s.fireF) continue; // 倒れて火が消えた物は数えない
    const p = burnPoint(s);
    const t = Math.min(90, s.burnT || 0);
    const drift = 6 + t * 0.35; // 風下へ流れた距離
    const cx = p.x + WIND_STATE.dirX * drift, cz = p.z + WIND_STATE.dirZ * drift;
    const rad = 14 + t * 0.28; // 煙のかたまりの広さ
    const d = Math.hypot(x - cx, z - cz);
    if (d < rad) m = Math.max(m, 1 - d / rad);
  }
  return Math.min(1, m);
}

function inGrove(world, x, z) {
  for (const gv of world.def.groves || []) if (Math.hypot(x - gv.x, z - gv.z) < gv.r) return true;
  return false;
}

// a（見張り手。x,z,y）から (x,z) の地面への見通し。間の地形が高く盛り上がっていればさえぎる
function blocked(world, a, x, z) {
  const L = Math.hypot(x - a.x, z - a.z);
  if (L < 10 || !world.heightAt) return false;
  const gy = world.heightAt(x, z) + 1.2;
  const n = Math.min(5, Math.max(2, Math.round(L / 16)));
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const h = world.heightAt(a.x + (x - a.x) * t, a.z + (z - a.z) * t);
    if (h > a.y + (gy - a.y) * t - 0.5) return true;
  }
  return false;
}

function armyCenter(A) {
  if (!A.mesh) return null;
  A.mesh.updateMatrixWorld();
  _v.set(A.cx + A.off.x, 0, A.cz + A.off.z).applyMatrix4(A.mesh.matrixWorld);
  return { x: _v.x, z: _v.z };
}

// 見張り手の一覧：自分・味方の実体の隊の中心（150m ほど）と、物見櫓（rt.flags.towers＝{x,z,h,r}。無ければ空）
function watchers(rt) {
  const out = [];
  const W = rt.world;
  const pu = rt.player && rt.player.u;
  if (pu && pu.alive) out.push({ x: pu.pos.x, z: pu.pos.z, y: pu.pos.y + 1.6, r: 170 });
  for (const g of rt.army.groups) {
    if (g.team !== 0 || !g.count || g === rt.player.group) continue;
    if (!g.units.some((u) => u.alive)) continue;
    const c = g.center();
    out.push({ x: c.x, z: c.z, y: W.heightAt(c.x, c.z) + 1.6, r: 130 });
  }
  for (const t of rt.flags.towers || []) {
    // garrison（射手の隊）を持たせている物見櫓は、その隊が全滅・敗走すれば見張りを失う
    if (t.garrison && (!t.garrison.count || t.garrison.routed)) continue;
    out.push({ x: t.x, z: t.z, y: W.heightAt(t.x, t.z) + (t.h || 7), r: t.r || 240 });
  }
  return out;
}

// 見える隊・備の一覧を作り直す（0.5 秒に一度。rt.flags._vis に貯める）
export function updateVis(rt) {
  const F = rt.flags;
  const now = rt.army.time;
  if (F._visT !== undefined && now - F._visT < 0.5) return F._vis || (F._vis = new Set());
  F._visT = now;
  const W = rt.world, ws = watchers(rt);
  const vis = new Set();
  const wMul = weatherVisMult(W);
  const test = (x, z, ref) => {
    if (!ref) return;
    const grove = inGrove(W, x, z);
    const smoke = smokeAt(rt, x, z);
    for (const w of ws) {
      let r = w.r * (grove ? 0.55 : 1) * wMul;
      if (smoke > 0) r *= 1 - smoke * 0.6;
      if (Math.hypot(x - w.x, z - w.z) > r) continue;
      if (blocked(W, w, x, z)) continue;
      vis.add(ref);
      return;
    }
  };
  for (const g of rt.army.groups) {
    if (g.team === 0 || !g.count) continue;
    const c = g.center();
    test(c.x, c.z, g);
  }
  for (const A of W.armies || []) {
    if (!A.mesh || !A.mesh.visible || A.rout) continue;
    const c = armyCenter(A);
    if (c) test(c.x, c.z, A);
  }
  F._vis = vis;
  return vis;
}

// ref（隊 Group か 軽い大軍 Army）が今、見張り手のだれかから見えているか
export function isVisible(rt, ref) {
  return updateVis(rt).has(ref);
}
