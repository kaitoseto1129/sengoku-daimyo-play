// 城攻めの共通の部品（siege_kit.js・ui/siege_kit。docs/risshin_tasks.md「城攻めを本当に城を攻めている水準に」）
// 城そのものを兵器にする。字・札・ボタンは出さない（分からせるのは道筋・敵の動き・煙と弾）。兵は足さない。
//   縄張り：大手の門（枡形虎口か喰違虎口）・横矢掛り（塀の張り出し）・空堀と畝堀・切岸・土橋・馬出し（角か丸。左右二つの口）・
//           堀の外の逆茂木・攻め手の前の仕寄り（竹束と土嚢の列）。
//   守り手の射撃：塀の狭間と張り出しの面から、鉄砲の閃光と白煙・弾の着弾・矢が降る。近づくほど激しい。横矢の面で十字に撃たれる。
//           塀の上に陣笠と銃口が並ぶ。煙・矢・笠・銃口はそれぞれ一つの束（描く回数は合わせて五つほど）。毎コマ new しない。
//   出撃と付け入り：守りの隊が馬出しの口から出て攻め手の横を突き、引き上げる時に門を開ける。
//           その時に自分（か攻め手）が門の近くまで追えば、門は閉まらず城内へなだれ込める（付け入り）。
// 使い方（城の戦のファイルで）：
//   import { siegePlan, siegeHeight, buildSiege } from './siege_kit.js';
//   const SP = siegePlan({ x: 0, z: -60, rot: 0 });                 // 大手の門の位置と外向き（前は (sin rot, cos rot)）
//   world: { height: (x, z) => base(x, z) + siegeHeight(SP)(x, z) } // 堀・畝・切岸を地形に掘る（siegeHeight は一度作って使い回す）
//   setup(rt) { F.K = buildSiege(rt, SP, { team: 1 }); F.K.sortie(enemyGroup(rt, { anchor: F.K.at.plaza }, [...]), { mouth: 1, at: 20 }); }
//   update(rt, dt) { F.K.tick(dt); }                                   // F.K.tsukeiri が true になれば付け入りが起きた
// 部品だけ使う時：buildSiege(rt, SP, { umadashi: false, shiyori: false, ... }) で要らない物を外す。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { masugata, kabukiGate, dobeiLine, fence, sakamogiRow } from './castle_parts.js';
import { dorui, solidRect, makeSimpleBatch, finalizeSimpleBatch } from './props.js';
import { closeGate } from './siege_gate.js';
import { tabaGeo, tabaMat } from './taketaba.js';
import { arrowGeometry, MAT as UNIT_MAT } from './units_model.js';
import { WIND_STATE } from './world_weather.js';
import { S as SET } from './settings.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// ---------------------------------------------------------------- 縄張り（形だけ・rt は要らない）
// o: { x, z, rot（大手の門と外向き）, W（正面の塀の半幅 34）, koguchi: 'masu'|'kuichigai', turn（枡形の折れ ±1）,
//      yokoya: { at（張り出しの中心の横位置 13）, w（張り出しの幅 7）, d（張り出しの出 5） } | false,
//      moat: { w（幅 10）, depth（深さ 3.2）, une（畝の間合い 6・0 で無し） }, kirigishi（城の側を上げる高さ 1.2）,
//      umadashi: { kind: 'kaku'|'maru', r（半径 8）, moatW（三日月堀の幅 5）, depth（2.4） } | false,
//      sakamogi: { at（堀の外からの距離 9） } | false, shiyori: { at（門からの距離 58）, rows（2）, gap（列の間 11） } | false }
export function siegePlan(o = {}) {
  const P = { x: o.x ?? 0, z: o.z ?? 0, rot: o.rot ?? 0, W: o.W ?? 34, koguchi: o.koguchi || 'masu', turn: o.turn ?? 1 };
  const ux = Math.sin(P.rot), uz = Math.cos(P.rot), px = uz, pz = -ux;
  Object.assign(P, { ux, uz, px, pz });
  // a：横（p の向き）、b：外へ（u の向き）
  P.L = (a, b) => [P.x + px * a + ux * b, P.z + pz * a + uz * b];
  P.loc = (x, z) => { const dx = x - P.x, dz = z - P.z; return [dx * px + dz * pz, dx * ux + dz * uz]; };
  P.yokoya = o.yokoya === false ? null : { at: 13, w: 7, d: 5, ...(o.yokoya || {}) };
  const D = P.yokoya ? P.yokoya.d : 0;
  P.moat = o.moat === false ? null : { w: 10, depth: 3.2, une: 6, ...(o.moat || {}) };
  const mw = P.moat ? P.moat.w : 0;
  P.mIn = D + 3;                 // 堀の城の側の縁
  P.mOut = P.mIn + mw;           // 堀の外の縁
  P.kirigishi = o.kirigishi ?? 1.2;
  // 門から外へ出る筋（喰違は口が横へ開くので、筋を横へずらす）
  P.laneA = P.koguchi === 'kuichigai' ? 6 : 0;
  P.bridgeW = o.bridgeW ?? 4;
  P.uma = o.umadashi === false ? null : { kind: 'kaku', r: 8, moatW: 5, depth: 2.4, ...(o.umadashi || {}) };
  if (P.uma) {
    const U = P.uma;
    U.back = P.mOut + 1;                         // 馬出しの奥（堀の側）
    U.cb = U.kind === 'maru' ? U.back : U.back + U.r;   // 中心
    U.front = U.back + 2 * U.r;                  // 角馬出しの前の塀（丸は弧の頂）
    if (U.kind === 'maru') U.front = U.back + U.r;
    U.outer = U.r + 1.5 + U.moatW;               // 馬出しの堀の外の縁（横の半幅）
    // 左右の口：奥の角の横（-1 が左・+1 が右）
    U.mouths = [-1, 1].map((s) => ({ s, inA: P.laneA + s * (U.r - 1.2), outA: P.laneA + s * (U.r + 3), b: U.back + 1.8 }));
  }
  P.sak = o.sakamogi === false ? null : { at: 9, ...(o.sakamogi || {}) };
  P.shi = o.shiyori === false ? null : { at: 58, rows: 2, gap: 11, ...(o.shiyori || {}) };
  // 道筋の要所（戦の側がピンや隊の行き先に使う）
  const W2 = (a, b) => { const [x, z] = P.L(a, b); return { x, z }; };
  P.at = {
    gate: W2(P.koguchi === 'kuichigai' ? 0 : 0, P.koguchi === 'kuichigai' ? -3 : 0),
    gateOut: W2(P.laneA, 2.2),
    bridgeIn: W2(P.laneA, P.mIn - 0.5), bridgeOut: W2(P.laneA, P.mOut + 0.5),
    plaza: P.koguchi === 'kuichigai' ? W2(-6, -9) : W2(0, -5),
  };
  if (P.uma) {
    const U = P.uma;
    P.at.uma = W2(P.laneA, U.kind === 'maru' ? U.back + U.r * 0.45 : U.cb);
    P.at.mouths = U.mouths.map((m) => ({ inner: W2(m.inA, m.b), outer: W2(m.outA, m.b), lane: W2(P.laneA + m.s * (U.outer + 4.5), m.b + 2), far: W2(P.laneA + m.s * (U.outer + 4.5), U.front + U.moatW + 10) }));
  }
  return P;
}

// 地形に掘る：空堀（薬研・畝堀）・馬出しの堀・切岸（城の側を上げる）。土橋の筋は掘らない。
export function siegeHeight(P) {
  if (P._h) return P._h;
  const M = P.moat, U = P.uma, W = P.W, la = P.laneA, hb = P.bridgeW / 2;
  const R = Math.max(80, W + 30);
  P._h = (x, z) => {
    const [a, b] = P.loc(x, z);
    if (Math.abs(a) > R || b < -60 || b > (U ? U.front + U.moatW + 12 : P.mOut + 12)) return 0;
    let h = 0;
    const lat = 1 - sstep(W, W + 8, Math.abs(a));
    // 土橋：掘らず、城の側の高さへなだらかに上がる
    const onBridge = Math.abs(a - la) < hb + 0.6;
    const bridgeK = onBridge ? 1 - sstep(hb, hb + 0.6, Math.abs(a - la)) : 0;
    // 切岸：堀の内の縁から城の側を上げる（縁は急）
    if (P.kirigishi > 0 && lat > 0) {
      const inner = 1 - sstep(P.mIn - 0.6, P.mIn + 0.4, b);
      const ramp = P.moat ? sstep(P.mOut, P.mIn, b) : 0;   // 土橋の上は外から内へ坂
      h += P.kirigishi * lat * Math.max(inner * sstep(-60, -45, b), bridgeK * ramp);
    }
    if (M && lat > 0 && b > P.mIn - 0.5 && b < P.mOut + 0.5) {
      const c = (P.mIn + P.mOut) / 2, half = M.w / 2, d = Math.abs(b - c);
      if (d < half) {
        // 内の法は急（切岸）、外はやや緩い
        const u = b < c ? d / half : Math.pow(d / half, 0.8);
        let dig = M.depth * Math.min(1, (1 - u) / 0.82);
        // 畝堀：底を横切る土の畝（上を一列でしか渡れない）
        if (M.une > 0) { const q = ((a - la) % M.une + M.une) % M.une, rib = 1 - sstep(0.4, 0.9, Math.min(q, M.une - q)); dig -= rib * M.depth * 0.62 * (1 - u); }
        h -= Math.max(0, dig) * lat * (1 - bridgeK);
      }
    }
    if (U) {
      const da = a - la;
      let d = Infinity, inner = false;
      if (U.kind === 'maru') {
        const r = Math.hypot(da, b - U.back), th = Math.atan2(b - U.back, Math.abs(da));
        if (th > 0.5) { d = Math.abs(r - (U.r + 1.5 + U.moatW / 2)); inner = r < U.r + 1.5 + U.moatW / 2; }
      } else {
        const ox = U.r + 1.5 + U.moatW / 2, fz = U.front + 1.5 + U.moatW / 2;
        if (b > U.back + 5 && b < fz + U.moatW && Math.abs(da) < ox + U.moatW) {
          const dSide = Math.abs(Math.abs(da) - ox), dFront = Math.abs(b - fz);
          d = Math.min(Math.abs(da) < ox ? dFront : Infinity, b < fz ? dSide : Math.hypot(Math.abs(da) - ox, b - fz));
          inner = Math.abs(da) < ox && b < fz;
        }
      }
      const half = U.moatW / 2;
      if (d < half) { const u = inner ? d / half : Math.pow(d / half, 0.8); h -= U.depth * Math.min(1, (1 - u) / 0.82); }
    }
    return h;
  };
  return P._h;
}

// ---------------------------------------------------------------- 置く（setup の中で一度）
// o: { team（守り 1）, wall: 'dobei'|'saku', wallH, umadashiWall: 'saku'|'dobei', gateHp, masuHp,
//      fire: {…}（下の makeSamaFire の o）| false, heads: true, umadashi/sakamogi/shiyori/walls/gate: false で外す }
export function buildSiege(rt, P, o = {}) {
  const team = o.team ?? 1, L = P.L, K = { P, at: P.at, walls: [], umaWalls: [], sak: [], shiyori: null, gate: null, masu: null, tsukeiri: false, sorties: [] };
  const wallFn = (pts, x = {}) => (o.wall === 'saku'
    ? fence(rt, pts, { team, hp: o.wallHp ?? 420, ...x }).structs
    : dobeiLine(rt, pts, { team, h: o.wallH, hp: o.wallHp ?? 520, sama: 1.8, ...x }).structs);
  const Y = P.yokoya, W = P.W;
  // 門と虎口
  if (o.gate !== false) {
    if (P.koguchi === 'kuichigai') {
      // 喰違：左の塀は門より右へ伸び、右の塀は 6m 奥に下がって重なる。間の横の筋に門を立てる（まっすぐ入れない）
      const [gx, gz] = L(0, -3);
      K.gate = kabukiGate(rt, gx, gz, 5.4, P.rot + Math.PI / 2, { team, hp: o.gateHp ?? 420, gate: 0, roof: true });
      K.walls.push(...wallFn([L(-3, -0.3), L(3.2, -0.3)]), ...wallFn([L(-3.2, -6.2), L(3.6, -6.2)]));
    } else {
      K.masu = masugata(rt, P.x, P.z, P.rot, { team, turn: P.turn, hp1: o.gateHp ?? 420, hp2: o.masuHp ?? 640, gate: 0 });
      K.gate = K.masu.outer;
    }
  }
  // 正面の塀と横矢の張り出し（門の左右。張り出しの内向きの面が門の前を横から撃つ）
  if (o.walls !== false) {
    const g0 = P.koguchi === 'kuichigai' ? 3.2 : 2.4;
    for (const s of [-1, 1]) {
      const side = [];
      if (P.koguchi === 'kuichigai' && s > 0) side.push(L(3.6, -6.2), L(Y ? Y.at - Y.w / 2 : W, -6.2), L(Y ? Y.at - Y.w / 2 : W, 0));
      else side.push(L(s * g0, 0));
      if (Y) side.push(L(s * (Y.at - Y.w / 2), 0), L(s * (Y.at - Y.w / 2), Y.d), L(s * (Y.at + Y.w / 2), Y.d), L(s * (Y.at + Y.w / 2), 0));
      side.push(L(s * W, 0), L(s * W, -10));
      // 点の並びは門から外へ（右と左で向きが逆になっても、撃つ向きは中の点で決めるので構わない）
      const pts = side.filter((p, i) => i === 0 || Math.hypot(p[0] - side[i - 1][0], p[1] - side[i - 1][1]) > 0.5);
      K.walls.push(...wallFn(pts));
    }
  }
  // 土橋の縁（低い土の盛り。歩く床は地形そのもの）
  if (P.moat && o.bridge !== false) {
    const B = makeSimpleBatch();
    for (const s of [-1, 1]) {
      const a = P.laneA + s * (P.bridgeW / 2 + 0.2), [ax, az] = L(a, P.mIn - 0.3), [bx, bz] = L(a, P.mOut + 0.3);
      dorui(rt.world, [ax, az, bx, bz], P.px * s, P.pz * s, { w: 0.6, h: 0.35, batch: B });
    }
    finalizeSimpleBatch(rt, B);
  }
  // 馬出し：堀の外の小さな曲輪。前は閉じ、左右の奥の角に口
  if (P.uma && o.umadashi !== false) {
    const U = P.uma, la = P.laneA, wf = (pts) => (o.umadashiWall === 'dobei'
      ? dobeiLine(rt, pts, { team, hp: 460, sama: 1.8, h: 2.1 }).structs
      : fence(rt, pts, { team, hp: 360 }).structs);
    if (U.kind === 'maru') {
      const pts = [];
      for (let i = 0; i <= 10; i++) { const th = 0.42 + (Math.PI - 0.84) * i / 10; pts.push(L(la + Math.cos(th) * U.r, U.back + Math.sin(th) * U.r)); }
      K.umaWalls.push(...wf(pts));
      U.mouths.forEach((m) => { m.inA = la + m.s * (U.r - 0.6); m.b = U.back + 1.4; });
    } else {
      K.umaWalls.push(...wf([L(la - U.r, U.back + 3.6), L(la - U.r, U.front), L(la + U.r, U.front), L(la + U.r, U.back + 3.6)]));
    }
    // 土塁を塀の下に（見た目だけ。当たりは塀）
    const B = makeSimpleBatch();
    for (const s of K.umaWalls) { const [ax, az, bx, bz] = s.seg, l = Math.hypot(bx - ax, bz - az) || 1; dorui(rt.world, s.seg, -(bz - az) / l, (bx - ax) / l, { w: 2.2, h: 0.45, batch: B }); }
    finalizeSimpleBatch(rt, B);
  }
  // 逆茂木：堀の外の縁ぞい。馬出しの横の筋（口へ回る道）は空ける
  if (P.sak && o.sakamogi !== false) {
    const bS = P.mOut + P.sak.at, U = P.uma, open = U ? U.outer + 9 : P.bridgeW / 2 + 4;
    for (const s of [-1, 1]) K.sak.push(...sakamogiRow(rt, [L(P.laneA + s * open, bS), L(s * (W + 4), bS)], { team, hp: 90, spacing: 5 }).structs);
    if (U) { const bF = U.front + U.moatW + 4; K.sak.push(...sakamogiRow(rt, [L(P.laneA - U.outer, bF), L(P.laneA + U.outer, bF)], { team, hp: 90, spacing: 5 }).structs); }
  }
  // 仕寄り：攻め手の前の竹束と土嚢の列（弾を止める当たり付き）
  if (P.shi && o.shiyori !== false) K.shiyori = buildShiyori(rt, P, o.shiyoriTeam ?? (team === 1 ? 0 : 1));
  // 守り手の射撃と、塀の上の笠・銃口
  const inside = { x: L(0, -14)[0], z: L(0, -14)[1] }, umaC = P.at.uma || inside;
  K.fire = o.fire === false ? null : makeSamaFire(rt, [
    { structs: K.walls, inside, flank: true },
    { structs: K.umaWalls, inside: umaC },
    ...(K.masu ? [{ structs: K.masu.walls, inside: P.at.plaza }] : []),
    ...(o.extraWalls || []),
  ], { team, heads: o.heads !== false, ...(o.fire || {}) });
  // 出撃：守りの隊を馬出しの口から出し、横を突かせて引き上げさせる（付け入りの筋）
  K.sortie = (g, so = {}) => { const s = makeSortie(rt, K, g, so); K.sorties.push(s); return s; };
  K.tick = (dt) => {
    if (K.fire) K.fire.tick(dt);
    for (const s of K.sorties) s.tick(dt);
  };
  return K;
}

// ---------------------------------------------------------------- 仕寄り
function buildShiyori(rt, P, team) {
  const S = P.shi, U = P.uma, rows = [];
  const lane = (a) => (U ? Math.abs(Math.abs(a - P.laneA) - (U.outer + 4.5)) < 4 : false) || Math.abs(a - P.laneA) < 3;
  const face = P.rot + Math.PI;                                    // 竹束の前は城の側
  const spots = [], bags = [];
  for (let r = 0; r < S.rows; r++) {
    const b = S.at + r * S.gap, off = r % 2 ? 4.5 : 0;
    for (let a = -P.W * 0.85 + off; a <= P.W * 0.85; a += 9) {
      // 三つの竹束と、その横に土嚢の段（列は少しずつ前後にずらす＝手で並べた形）
      for (let k = 0; k < 3; k++) {
        const aa = a + k * 2.05, bb = b + Math.sin(aa * 0.7) * 0.35;
        if (lane(aa)) continue;
        spots.push(L2(P, aa, bb));
      }
      const ab = a + 6.6;
      if (!lane(ab)) bags.push(L2(P, ab, b + 0.6));
    }
  }
  const W = rt.world;
  // 竹束：一つの束で全部を描く
  const geo = tabaGeo(false, false, false, false), mat = tabaMat();
  const im = new THREE.InstancedMesh(geo, mat, Math.max(1, spots.length));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  spots.forEach(([x, z], i) => {
    q.setFromEuler(e.set(0, face + Math.PI + Math.sin(x * 1.3 + z) * 0.08, 0));
    im.setMatrixAt(i, m4.compose(v.set(x, W.heightAt(x, z), z), q, one));
    Object.assign(solidRect(x, z, 1.9, 0.6, face), { missileH: 1.7, missileType: 'wood' });
  });
  im.count = spots.length; im.castShadow = true; im.receiveShadow = true;
  im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere();
  if (spots.length) rt.scene.add(im);
  // 土嚢：麻袋を三段に積んだ低い壁（一つの形にまとめる）
  const parts = [];
  for (const [x, z] of bags) {
    const y0 = W.heightAt(x, z);
    for (let row = 0; row < 3; row++) for (let i = 0; i < 4 - row; i++) {
      const g = new THREE.SphereGeometry(0.5, 7, 4); g.scale(0.62, 0.3, 0.36);
      const la = (i - (3 - row) / 2) * 0.66;
      g.rotateY(face + (i % 2 ? 0.08 : -0.06));
      const dx = Math.cos(face) * la, dz = -Math.sin(face) * la;
      g.translate(x + dx, y0 + 0.14 + row * 0.27, z + dz);
      const c = new THREE.Color(row % 2 ? 0x8f7c5a : 0x9d8963).multiplyScalar(0.9 + ((i * 7 + row * 3) % 5) * 0.03);
      const n = g.attributes.position.count, col = new Float32Array(n * 3);
      for (let k = 0; k < n; k++) { col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b; }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      parts.push(g.index ? g.toNonIndexed() : g);
    }
    Object.assign(solidRect(x, z, 2.6, 0.8, face), { missileH: 0.95, missileType: 'dust' });
  }
  let bagMesh = null;
  if (parts.length) {
    const g = mergeGeometries(parts); parts.forEach((p) => p.dispose());
    bagMesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true }));
    bagMesh.castShadow = true; bagMesh.receiveShadow = true;
    rt.scene.add(bagMesh);
  }
  rows.push(...spots.map(([x, z]) => ({ x, z })));
  return { spots: rows, bundles: im, bags: bagMesh };
}
const L2 = (P, a, b) => P.L(a, b);

// ---------------------------------------------------------------- 狭間からの射撃（見た目と音。兵は足さない）
// groups: [{ structs, inside:{x,z}（城の内の点。撃つ向きを決める）, flank（横矢の面を重く） }]
// o: { team, near（激しくなり始める 110m）, close（いちばん激しい 22m）, base（遠くの一秒あたりの発砲 1.1）, peak（近くで 7）,
//      arrows（矢の割合 0.3）, smoke（白煙 true）, hurt（自分に当たる強さ 1・0 で当てない）, needMen（近くに守り手がいる所だけ撃つ true）, heads }
export function makeSamaFire(rt, groups, o = {}) {
  const team = o.team ?? 1, A = rt.army, Wd = rt.world;
  const near = o.near ?? 110, close = o.close ?? 22, base = o.base ?? 1.1, peak = o.peak ?? 7, arrowShare = o.arrows ?? 0.3;
  const hurt = o.hurt ?? 1, needMen = o.needMen !== false;
  // 撃つ所：塀の区画ごとの狭間（army.samasOf）。外向きは内の点から決める
  const src = [];
  for (const G of groups) for (const s of G.structs || []) {
    if (!s || !s.seg) continue;
    const ms = A.samasOf ? A.samasOf(s) : [];
    const [ax, az, bx, bz] = s.seg, mx = (ax + bx) / 2, mz = (az + bz) / 2, l = Math.hypot(bx - ax, bz - az) || 1;
    let nx = -(bz - az) / l, nz = (bx - ax) / l;
    if ((mx - G.inside.x) * nx + (mz - G.inside.z) * nz < 0) { nx = -nx; nz = -nz; }
    const list = ms.length ? ms : [{ x: mx, z: mz, kind: 'gun' }];
    for (const m of list) src.push({ i: src.length, s, x: m.x, z: m.z, nx, nz, kind: m.kind || 'gun', flank: !!G.flank, h: s.h || 2.3, men: true, cool: 0 });
  }
  const F = { src, t: 0, acc: 0, menT: 0, shots: 0 };
  if (!src.length) { F.tick = () => {}; return F; }
  const P = () => rt.player && rt.player.u;
  // --- 白煙：一つの束（板を常にカメラへ向ける。描く回数一つ）
  const SM = o.smoke === false ? null : smokeBatch(rt, 128);
  // --- 矢：一つの束（飛ぶ矢と刺さった矢）
  const AR = arrowShare > 0 ? arrowBatch(rt, 36) : null;
  // --- 塀の上の陣笠と、狭間から出る銃口
  const HD = o.heads === false ? null : headsBatch(rt, src);
  // 着弾の待ち（使い回す）
  const pend = Array.from({ length: 24 }, () => ({ on: false, t: 0, x: 0, y: 0, z: 0, hit: false, s: null, d: 0 }));
  const _pos = { x: 0, y: 0, z: 0 };
  const menNear = (x, z) => { let n = 0; A.forNear(x, z, 32, (u) => { if (!n && u.alive && !u.gone && u.team === team && !u.fleeing) n = 1; }); return n > 0; };
  function shoot(c, u, I) {
    // 狙い：自分のまわり（近いほど散りが小さい）。たまに後ろの攻め手の列へ
    const d = Math.hypot(u.pos.x - c.x, u.pos.z - c.z);
    const spread = 1.2 + (1 - I) * 5 + d * 0.03;
    const ang = Math.random() * 6.283, r = spread * (0.35 + Math.random() * 0.9);
    const tx = u.pos.x + Math.cos(ang) * r, tz = u.pos.z + Math.sin(ang) * r;
    const y0 = Wd.heightAt(c.x, c.z);
    const sx = c.x + c.nx * 0.45, sz = c.z + c.nz * 0.45, sy = y0 + (c.kind === 'bow' ? c.h + 0.4 : 1.4);
    const bow = AR && (c.kind === 'bow' || Math.random() < arrowShare * 0.5);
    if (bow) {
      AR.fire(sx, sy + 0.4, sz, tx, Wd.heightAt(tx, tz), tz);
      if (d < 60 && Math.random() < 0.35) A.play('string', c, 0.5);
      return;
    }
    A.flash(sx, sy, sz, 0.85);
    if (SM) SM.puff(sx, sy, sz, c.nx, c.nz, 1);
    if (d < 140) A.play('gun', c, clamp(1.15 - d / 140, 0.2, 1));
    F.shots++;
    // 弾：遅れて着く（160m/秒）
    const p = pend.find((q) => !q.on); if (!p) return;
    p.on = true; p.t = d / 160; p.x = tx; p.z = tz; p.y = Wd.heightAt(tx, tz) + 0.05; p.s = c; p.d = d;
    // 当たり：開けた所に立っていれば、近いほど当たる（竹束・塀の陰は army.coverBetween が 0 に近い）
    p.hit = false;
    if (hurt > 0 && !u.invuln) {
      const cov = A.coverBetween ? A.coverBetween({ x: sx, y: sy - 1.46, z: sz }, u.pos, team) : 1;
      const ch = (0.03 + I * 0.05) * cov * hurt;
      if (Math.random() < ch) p.hit = true;
    }
  }
  F.tick = (dt) => {
    F.t += dt;
    const u = P();
    if (SM) SM.tick(dt);
    if (AR) AR.tick(dt);
    if (HD) HD.tick(dt, F.t);
    for (const p of pend) if (p.on && (p.t -= dt) <= 0) {
      p.on = false;
      if (!u || !u.alive) continue;
      const dm = Math.hypot(p.x - u.pos.x, p.z - u.pos.z);
      if (p.hit) {
        // 傷は近くの本物の守り手から（守り手がいなければ当てない）
        let by = null; A.forNear(p.s.x, p.s.z, 32, (q) => { if (!by && q.alive && q.team === team && !q.fleeing) by = q; });
        if (by) { A.damage(u, 7 + Math.random() * 5, by, { kind: 'gun', d: p.d }); continue; }
      }
      if (dm < 2.6) A.play('whiz', u.pos, 1.2 - dm * 0.3);
      if (A.projectileImpact) A.projectileImpact(p.x, p.y, p.z, 'dust', 0, 0);
    }
    if (!u || !u.alive || rt.over) return;
    // 守り手のいる所だけ（一秒ごとに数え直す）
    if ((F.menT -= dt) <= 0) {
      F.menT = 1;
      for (const c of src) c.men = c.s.alive !== false && !c.s.opened && (!needMen || menNear(c.x, c.z));
      if (HD) HD.refresh(src);
    }
    // 近いほど激しい
    let dmin = Infinity;
    for (let i = 0; i < src.length; i += 3) { const c = src[i]; dmin = Math.min(dmin, Math.hypot(u.pos.x - c.x, u.pos.z - c.z)); }
    if (dmin > 175) return;
    const I = 1 - sstep(close, near, dmin);
    F.acc += dt * (base + (peak - base) * I) * (SET.reduceMotion ? 0.5 : 1);
    let guard = 4;
    while (F.acc >= 1 && guard--) {
      F.acc -= 1;
      // 撃てる狭間の中から、自分の方を向く所を選ぶ（横矢の面は重く＝十字に撃たれる）
      let best = null, bw = 0;
      for (let k = 0; k < 7; k++) {
        const c = src[(Math.random() * src.length) | 0];
        if (!c.men || c.cool > F.t) continue;
        const dx = u.pos.x - c.x, dz = u.pos.z - c.z, d = Math.hypot(dx, dz) || 1;
        const face = (dx * c.nx + dz * c.nz) / d;
        if (face < 0.25 || d > 150) continue;
        const w = face * (c.flank && face < 0.85 ? 1.8 : 1) / (1 + d / 60) * (0.6 + Math.random());
        if (w > bw) { bw = w; best = c; }
      }
      if (best) {
        best.cool = F.t + 1.6 + Math.random() * 2.2; shoot(best, u, I);
        // 一斉射ち：となりの狭間も続けて撃つ（塀の前に煙の帯ができる）
        if (Math.random() < 0.2 + I * 0.3) for (const j of [best.i - 1, best.i + 1, best.i + 2]) {
          const c = src[j]; if (c && c.s === best.s && c.men && c.cool <= F.t && c.kind !== 'bow') { c.cool = F.t + 2 + Math.random() * 2; shoot(c, u, I); }
        }
      }
    }
  };
  return F;
}

// 白煙の束：一つの InstancedBufferGeometry。板は頂点の側でカメラへ向ける
function smokeBatch(rt, cap) {
  const geo = new THREE.InstancedBufferGeometry();
  const pl = new THREE.PlaneGeometry(1, 1);
  geo.index = pl.index; geo.setAttribute('position', pl.attributes.position); geo.setAttribute('uv', pl.attributes.uv);
  const iP = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const iS = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3).setUsage(THREE.DynamicDrawUsage);   // 大きさ・濃さ・回り
  geo.setAttribute('iP', iP); geo.setAttribute('iS', iS); geo.instanceCount = 0;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  for (let i = 0; i < 9; i++) {
    const cx = 32 + Math.cos(i * 2.4) * (i ? 11 : 0), cy = 32 + Math.sin(i * 2.4) * (i ? 9 : 0), r = i ? 13 : 20;
    const gr = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    gr.addColorStop(0, 'rgba(255,255,255,0.75)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  }
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: null }, tint: { value: new THREE.Color(0xd9d7cf) } }]),
    vertexShader: `attribute vec3 iP; attribute vec3 iS; varying vec2 vUv; varying float vA;
      #include <fog_pars_vertex>
      void main(){ float c=cos(iS.z), s=sin(iS.z); vec2 q=vec2(c*position.x-s*position.y, s*position.x+c*position.y);
        vec4 mvPosition=modelViewMatrix*vec4(iP,1.0); mvPosition.xy+=q*iS.x; vUv=uv; vA=iS.y;
        gl_Position=projectionMatrix*mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform sampler2D map; uniform vec3 tint; varying vec2 vUv; varying float vA;
      #include <fog_pars_fragment>
      void main(){ float a=texture2D(map,vUv).a*vA; if(a<0.01) discard; gl_FragColor=vec4(tint,a);
        #include <fog_fragment>
      }`,
    transparent: true, depthWrite: false, fog: true,
  });
  mat.uniforms.map.value = tex;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false; mesh.renderOrder = 3;
  rt.scene.add(mesh);
  const L = Array.from({ length: cap }, () => ({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, t: 0, life: 1, s0: 0.5, s1: 3, r: 0 }));
  let live = 0;
  const B = {
    mesh,
    puff(px, py, pz, fx, fz, amt = 1) {
      for (let k = 0; k < 2; k++) {
        let o = L.find((q) => !q.on);
        if (!o) { o = L[0]; for (const q of L) if (q.t / q.life > o.t / o.life) o = q; }
        const v = k ? 5.5 : 2;
        o.on = true; o.x = px; o.y = py; o.z = pz; o.vx = fx * v + (Math.random() - 0.5); o.vz = fz * v + (Math.random() - 0.5); o.vy = 0.25 + Math.random() * 0.3;
        o.t = 0; o.life = (k ? 7 : 9) + Math.random() * 3; o.s0 = 0.9 * amt; o.s1 = (k ? 5.5 : 7.5) * amt; o.r = Math.random() * 6.28;
      }
    },
    tick(dt) {
      const wx = WIND_STATE.dirX * (WIND_STATE.gust ?? 1) * 0.9, wz = WIND_STATE.dirZ * (WIND_STATE.gust ?? 1) * 0.9;
      live = 0;
      const fc = rt.scene.fog && rt.scene.fog.color;
      if (fc) { const amb = clamp((fc.r * 0.3 + fc.g * 0.59 + fc.b * 0.11) * 1.5, 0.3, 1); mat.uniforms.tint.value.setRGB(0.93 * amb, 0.92 * amb, 0.9 * amb); }
      for (const o of L) {
        if (!o.on) continue;
        o.t += dt;
        if (o.t >= o.life) { o.on = false; continue; }
        const drag = Math.exp(-dt * 1.6);
        o.vx = o.vx * drag + wx * (1 - drag); o.vz = o.vz * drag + wz * (1 - drag); o.vy *= Math.exp(-dt * 0.5);
        o.x += o.vx * dt; o.y += o.vy * dt; o.z += o.vz * dt;
        const k = o.t / o.life, i = live++;
        iP.array[i * 3] = o.x; iP.array[i * 3 + 1] = o.y; iP.array[i * 3 + 2] = o.z;
        iS.array[i * 3] = o.s0 + (o.s1 - o.s0) * Math.sqrt(k); iS.array[i * 3 + 1] = 0.95 * (1 - k) * (1 - k * 0.3) * Math.min(1, o.t * 6); iS.array[i * 3 + 2] = o.r + o.t * 0.05;
      }
      geo.instanceCount = live;
      if (live) { iP.needsUpdate = true; iS.needsUpdate = true; }
      mesh.visible = live > 0;
    },
  };
  mesh.visible = false;
  return B;
}

// 矢の束：高く上がって降り、地面に刺さって少し残る
function arrowBatch(rt, cap) {
  const im = new THREE.InstancedMesh(arrowGeometry(), UNIT_MAT, cap);
  im.count = 0; im.frustumCulled = false; im.castShadow = false;
  rt.scene.add(im);
  const L = Array.from({ length: cap }, () => ({ on: false, stuck: 0, t: 0, T: 1, ax: 0, ay: 0, az: 0, bx: 0, by: 0, bz: 0, h: 0, x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: 1 }));
  const Z = new THREE.Vector3(0, 0, 1), d = new THREE.Vector3(), q = new THREE.Quaternion(), m = new THREE.Matrix4(), p = new THREE.Vector3(), one = new THREE.Vector3(1.1, 1.1, 1.1);
  return {
    fire(ax, ay, az, bx, by, bz) {
      let o = L.find((a) => !a.on); if (!o) { o = L[0]; for (const a of L) if (a.stuck && a.stuck < o.stuck) o = a; }
      const dist = Math.hypot(bx - ax, bz - az);
      Object.assign(o, { on: true, stuck: 0, t: 0, T: 0.7 + dist / 38, ax, ay, az, bx: bx + (Math.random() - 0.5) * 3, by, bz: bz + (Math.random() - 0.5) * 3, h: 4 + dist * 0.16 });
    },
    tick(dt) {
      let n = 0;
      for (const o of L) {
        if (!o.on) continue;
        if (o.stuck) { if ((o.stuck -= dt) <= 0) { o.on = false; continue; } }
        else {
          o.t += dt; const k = Math.min(1, o.t / o.T);
          const x = o.ax + (o.bx - o.ax) * k, z = o.az + (o.bz - o.az) * k, y = o.ay + (o.by - o.ay) * k + o.h * 4 * k * (1 - k);
          o.dx = x - o.x; o.dy = y - o.y; o.dz = z - o.z; o.x = x; o.y = y; o.z = z;
          if (k >= 1) { o.stuck = 4; o.y = o.by + 0.25; const P = rt.player && rt.player.u; if (P && Math.hypot(P.pos.x - x, P.pos.z - z) < 4) rt.army.play('thunk', { x, y, z }, 0.4); }
        }
        d.set(o.dx, o.dy, o.dz); if (d.lengthSq() < 1e-8) d.set(0, -1, 0.3); d.normalize();
        q.setFromUnitVectors(Z, d);
        im.setMatrixAt(n++, m.compose(p.set(o.x, o.y, o.z), q, one));
      }
      im.count = n; if (n) im.instanceMatrix.needsUpdate = true;
    },
  };
}

// 塀の上の陣笠と、狭間から出る銃口（狭間二つに一人）
function headsBatch(rt, src) {
  const W = rt.world, picks = src.filter((c, i) => i % 2 === 0).slice(0, 80);
  const kasaG = new THREE.ConeGeometry(0.34, 0.17, 9); kasaG.translate(0, 0.08, 0);
  const headG = new THREE.SphereGeometry(0.12, 6, 4); headG.translate(0, -0.06, 0);
  const kasa = new THREE.InstancedMesh(mergeGeometries([kasaG.toNonIndexed(), headG.toNonIndexed()]), new THREE.MeshLambertMaterial({ color: 0x2b2722 }), picks.length);
  const barG = new THREE.CylinderGeometry(0.016, 0.022, 0.95, 5); barG.rotateX(Math.PI / 2);
  const bar = new THREE.InstancedMesh(barG, new THREE.MeshLambertMaterial({ color: 0x1c1a18 }), picks.length);
  kasa.castShadow = false; bar.castShadow = false;
  rt.scene.add(kasa, bar);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), zero = new THREE.Vector3(0, 0, 0);
  const base = picks.map((c) => ({ c, y: W.heightAt(c.x, c.z), ph: (c.x * 3.1 + c.z * 1.7) % 6.28, rot: Math.atan2(c.nx, c.nz) }));
  let shown = base.map(() => true);
  const put = (t) => {
    base.forEach((b, i) => {
      const c = b.c, on = shown[i];
      const bob = Math.sin(t * 0.9 + b.ph) * 0.05;
      q.setFromEuler(e.set(0, b.rot, 0));
      kasa.setMatrixAt(i, m.compose(p.set(c.x - c.nx * 0.5, b.y + c.h + 0.2 + bob, c.z - c.nz * 0.5), q, on ? one : zero));
      const gun = on && c.kind !== 'bow';
      bar.setMatrixAt(i, m.compose(p.set(c.x + c.nx * 0.1, b.y + 1.4, c.z + c.nz * 0.1), q, gun ? one : zero));
    });
    kasa.instanceMatrix.needsUpdate = true; bar.instanceMatrix.needsUpdate = true;
  };
  put(0); kasa.computeBoundingSphere(); bar.computeBoundingSphere();
  let acc = 0;
  return {
    refresh() { shown = base.map((b) => b.c.men); },
    tick(dt, t) { if ((acc += dt) < 0.25) return; acc = 0; put(t); },   // 揺れは四分の一秒ごと（軽く）
  };
}

// ---------------------------------------------------------------- 出撃と付け入り
// g：守りの隊（enemyGroup で作り、馬出しの中か枡形の広場に置く）
// so: { mouth（0 左・1 右。既定は自分のいる側）, at（始める秒。rt.t）, when: (rt) => bool（始める条件）, strike: {x,z}|() => {x,z}（突く所。既定は自分）,
//       fight（突く秒 16）, from: 'uma'|'plaza'（出る所。plaza なら門を開けて出る）, R（付け入りの間合い 10）, onOut, onBack, onTsukeiri, again（引いた後にまた出る秒）}
export function makeSortie(rt, K, g, so = {}) {
  const P = K.P, A = rt.army, at = P.at;
  const S = { g, phase: 'wait', t: 0, tsukeiri: false, n: 0 };
  const alive = () => g && g.units && g.units.some((u) => u.alive && !u.gone);
  // 崩れても城へ逃げ込む：散らずに道筋を戻らせる（逃げ込む敵を追えば付け入りになる）
  const homeward = () => {
    g.routed = false;
    for (const u of g.units) if (u.alive && !u.gone && u.fleeing && !u.woundOut && !u.downed) { u.fleeing = false; u.routIn = undefined; u.target = null; u.atk = null; u.confused = 0; }
  };
  const pt = (o) => [o.x, o.z];
  const gateOpen = () => { const G = K.gate; if (!G || !G.struct || !G.struct.alive) return; if (!G.struct.opened) { G.struct.opened = true; G.open && G.open(); } if (K.masu && K.tsukeiri) { const I = K.masu.inner; if (I && I.struct && I.struct.alive && !I.struct.opened) { I.struct.opened = true; I.open && I.open(); } } };
  const gateShut = () => { const G = K.gate; if (G && G.struct && G.struct.alive && G.struct.opened && !K.tsukeiri) closeGate(G); };
  const who = () => rt.player && rt.player.u;
  const pickMouth = () => {
    if (so.mouth !== undefined) return so.mouth;
    const u = who(); if (!u) return 1;
    const [a] = P.loc(u.pos.x, u.pos.z); return a - P.laneA < 0 ? 0 : 1;
  };
  function goOut() {
    if (!alive() || !at.mouths) { S.phase = 'done'; return; }
    const M = at.mouths[pickMouth()];
    const path = [];
    if (so.from === 'plaza') { path.push(pt(at.gateOut), pt(at.bridgeIn), pt(at.bridgeOut)); gateOpen(); }
    path.push(pt(at.uma), pt(M.inner), pt(M.outer), pt(M.lane), pt(M.far));
    const tg = typeof so.strike === 'function' ? so.strike(rt) : so.strike;
    const u = who(); const T = tg || (u ? { x: u.pos.x, z: u.pos.z } : M.far);
    // 横から：自分のいる所より少し外（攻め手の横腹）へ回り込む
    // 仕寄りの列の後ろを突く時は、列の切れ目（口の筋）を抜けてから横へ
    const [ta, tb] = P.loc(T.x, T.z), [fa] = P.loc(M.far.x, M.far.z);
    if (P.shi && tb > P.shi.at - 3) path.push(P.L(fa, tb + 2));
    path.push([T.x + (M.far.x - M.lane.x) * 0.15, T.z + (M.far.z - M.lane.z) * 0.15]);
    S.via = P.shi && tb > P.shi.at - 3 ? P.L(fa, tb + 2) : null;
    S.M = M; S.phase = 'out'; S.t = 0; S.n++;
    S.aggro = g.aggro; g.aggro = 3;
    S.form = g.formation; g.formation = 'column';
    if (S.noRout0 === undefined) { S.noRout0 = !!g.noRout; S.speed0 = g.speed; }
    g.speed = (S.speed0 || 2.2) * 1.45;   // 駆け足で出る
    walk(path, () => { S.phase = 'fight'; S.t = 0; g.order = 'attack'; g.formation = S.form || 'yari'; g.aggro = S.aggro ?? 9; restore(); });
    so.onOut && so.onOut(rt, S);
  }
  // 道筋を一つずつ歩く（隊の要を次の点へ。遅れた者は追いつく）。path の順は隊列の待ちで遅れすぎるので使わない
  function walk(route, done) { S.route = route; S.ri = 0; S.done = done; g.order = 'move'; g.dest = { x: route[0][0], z: route[0][1] }; g.onArrive = null; g.march = false; }
  function stepWalk() {
    if (!S.route) return;
    const d = g.dest, a = g.anchor;
    if (!d || g.order !== 'move') { if (g.order === 'flee' || g.routed) { homeward(); g.order = 'move'; } else return; }
    if (Math.hypot(a.x - g.dest.x, a.z - g.dest.z) > 0.6) return;
    if (++S.ri >= S.route.length) { const f = S.done; S.route = null; S.done = null; g.dest = null; f && f(); return; }
    g.dest = { x: S.route[S.ri][0], z: S.route[S.ri][1] };
  }
  function restore() { if (S.noRout0 !== undefined) { g.noRout = S.noRout0; g.speed = S.speed0; S.noRout0 = undefined; } }
  function goBack() {
    if (!alive()) { S.phase = 'done'; return; }
    const M = S.M || at.mouths[1];
    S.phase = 'back'; S.t = 0;
    homeward(); g.aggro = 1; g.focus = null; g.formation = 'column'; g.morale = Math.max(g.morale ?? 0, 55);
    // 引き上げの間は崩れない（城へ駆け戻る）。足も少し速く
    if (S.noRout0 === undefined) { S.noRout0 = !!g.noRout; S.speed0 = g.speed; }
    g.noRout = true; g.speed = (S.speed0 || 2.2) * 1.35;
    for (const u of g.units) if (u.alive && !u.isPlayer) { u.target = null; u.atk = null; }
    walk([...(S.via ? [S.via] : []), pt(M.far), pt(M.lane), pt(M.outer), pt(M.inner), pt(at.uma), pt(at.bridgeOut), pt(at.bridgeIn), pt(at.gateOut), pt(at.gate), pt(at.plaza)],
      () => { g.order = 'hold'; g.aggro = S.aggro ?? 8; g.formation = S.form || g.formation; restore(); });
    so.onBack && so.onBack(rt, S);
  }
  S.tick = (dt) => {
    S.t += dt;
    if (S.phase === 'done') return;
    if (S.phase === 'wait') {
      const go = so.when ? so.when(rt) : rt.t >= (so.at ?? 20);
      if (go) goOut();
      return;
    }
    if (!alive()) { if (S.phase !== 'in') S.phase = 'done'; if (!K.tsukeiri) gateShut(); return; }
    stepWalk();
    if (S.phase === 'out') {
      if (so.from === 'plaza' && S.t > 6) gateShut();
      if (g.routed || g.order === 'flee') { goBack(); return; }
      if (S.t > 28 && S.done) { const f = S.done; S.route = null; S.done = null; f(); }
      return;
    }
    if (S.phase === 'fight') {
      const c = g.center ? g.center() : null;
      const lost = g.units.filter((u) => !u.alive).length / Math.max(1, g.units.length);
      if (g.routed || g.order === 'flee' || S.t > (so.fight ?? 16) || lost > 0.35 || (g.morale ?? 100) < 40 || (c && Math.hypot(c.x - at.gate.x, c.z - at.gate.z) > 140)) goBack();
      return;
    }
    if (S.phase === 'back' || S.phase === 'in') {
      // 先頭が土橋に掛かったら門を開ける
      let lead = Infinity, tail = -Infinity, tx = 0, tz = 0;
      for (const u of g.units) if (u.alive && !u.gone) {
        const [, b] = P.loc(u.pos.x, u.pos.z); lead = Math.min(lead, b); if (b > tail) { tail = b; tx = u.pos.x; tz = u.pos.z; }
      }
      if (S.phase === 'back') {
        // 引き上げは崩れずに道筋を戻る（逃げ散らない）
        g.morale = Math.max(g.morale ?? 0, 55);
        // 斬り合いを振り切って要（隊の頭）へ駆け戻る
        if ((S.cut = (S.cut || 0) - dt) <= 0) { S.cut = 0.5; for (const u of g.units) if (u.alive && u.target && Math.hypot(u.pos.x - g.anchor.x, u.pos.z - g.anchor.z) > 5) { u.target = null; u.atk = null; u.swing = null; } }
        const [, cb] = P.loc(g.anchor.x, g.anchor.z);
        if (cb < P.mOut + 6) gateOpen();
      }
      // 付け入り：門が開いている間に、自分か攻め手が門の近くで引く隊のしんがりに追いすがっていれば、門は閉まらない
      const G = K.gate;
      if (!K.tsukeiri && G && G.struct && G.struct.opened) {
        const R = so.R ?? 10, gx = at.gate.x, gz = at.gate.z;
        let chase = false;
        A.forNear(gx, gz, R + 4, (u) => {
          if (chase || !u.alive || u.gone || u.team === (g.team ?? 1) || u.fleeing) return;
          const dg = Math.hypot(u.pos.x - gx, u.pos.z - gz), dt2 = Math.hypot(u.pos.x - tx, u.pos.z - tz);
          if (dg < R && (dt2 < 14 || tail < 2)) chase = true;
        });
        const u = who();
        if (!chase && u && u.alive) { const [, b] = P.loc(u.pos.x, u.pos.z); if (Math.hypot(u.pos.x - gx, u.pos.z - gz) < R && b < P.mOut + 2) chase = true; }
        if (chase) {
          K.tsukeiri = S.tsukeiri = true; S.phase = 'in';
          gateOpen();
          // 中の守りは崩れかける（門を破られた）
          for (const q of A.groups || []) if (q.team === (g.team ?? 1) && q !== g) { const c = q.center && q.center(); if (c && Math.hypot(c.x - gx, c.z - gz) < 45) q.morale = Math.max(0, (q.morale ?? 100) - 25); }
          g.morale = Math.max(0, (g.morale ?? 100) - 30); S.route = null; g.dest = null; g.order = 'attack'; g.aggro = 9; restore();
          so.onTsukeiri && so.onTsukeiri(rt, S);
          return;
        }
      }
      // 全部が門をくぐって二秒、誰も追ってこなければ門を閉める
      if (S.phase === 'back' && tail < -2) {
        S.inT = (S.inT || 0) + dt;
        if (S.inT > 2) { gateShut(); S.phase = 'in'; S.t = 0; }
      } else S.inT = 0;
      if (S.phase === 'in' && !K.tsukeiri && so.again && S.t > so.again) goOut2();
    }
  };
  function goOut2() { so.from = 'plaza'; goOut(); }
  return S;
}
