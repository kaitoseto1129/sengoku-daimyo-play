// ======================================================================
// honno_tera.js … 天正十年（1582）の本能寺（油小路蛸薬師の旧地）の境内。足軽の流れの舞台（docs/honnoji-1582-spec.md）
//   ・ゾーン：外周（築地・四つの門）／前面（表門・表庭・前の宿坊）／中心（本堂・中庭）／居住（信長の御殿）／
//     周辺宿坊（宿坊・庫裏）／裏手（物置・井戸・細い道・裏門）／庭園（中庭・回廊）
//   ・近くで通る建物（本堂・御殿・宿坊）は中まで作る：襖で区切った部屋・廊下・縁側・広間・信長の居室。
//     屋根は自分が中にいる間だけ隠す（中が見える）。襖と障子は一枚ずつ破れる（InstancedMesh の一つを消す）
//   ・建物は temple1571.js の Garan に積む（材質ごとに一つの形。燃えると黒ずみ、燃え落ちると潰れる）。築地は makeKitBatch
//   ・個々の配置は推定（HIST_B）。向き：東（+x）に表門、北（-z）に脇門、西に裏門、南に勝手口
// ======================================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { paintGeo, hipGeo, solidSeg, solidRect, solidCircle, tsuiji, kabukimon, makeKitBatch, finalizeKitBatch } from './props.js';
import { wallLine } from './bhelp.js';
import { S as SETTINGS } from './settings.js';
import { Garan, makeTempleFire } from './temple1571.js';

export const TERA = { x0: -77, x1: -31, z0: 30, z1: 104 };
export const inTera = (x, z, m = 0) => x > TERA.x0 - m && x < TERA.x1 + m && z > TERA.z0 - m && z < TERA.z1 + m;
// 門（築地の切れ目）。side は築地のどの辺か
export const GATES = {
  main: { x: -31, z: 50, w: 6, side: 'e', name: '表門' },
  side: { x: -48, z: 30, w: 3.6, side: 'n', name: '北の脇門' },
  ura: { x: -77, z: 76, w: 3.2, side: 'w', name: '裏門' },
  katte: { x: -47, z: 104, w: 3, side: 's', name: '南の勝手口' },
};
export const CLIMB = { x: -66, z: 30 };   // 外塀を乗り越えられる所（北の築地・裏手の上）
// 大事な場所
export const PT = {
  start: { x: -61, z: 82.1 },     // 御殿の廊下（控えの間の前）
  nbRoom: { x: -69, z: 90.5 },    // 信長の居室
  gateIn: { x: -36, z: 50 },      // 表門の内
  omote: { x: -40, z: 47 },       // 表庭
  niwa: { x: -50, z: 66 },        // 中庭（回廊の際）
  hiroma: { x: -53, z: 89 },      // 御殿の広間
  hikae: { x: -61, z: 89 },       // 控えの間
  kyoshitsu: { x: -67, z: 89 },   // 居室の口
  oku: { x: -71.2, z: 85.6 },     // 奥の納戸
  ura: { x: -74.5, z: 76 },       // 裏門の内
  uraOut: { x: -86, z: 76 },      // 裏門の外（西の通り）
  climbIn: { x: -66, z: 34 },
};
// 表庭から御殿へ移る五つの道（迷わせない：どれも御殿の北か東の口に着く）
export const ROUTES = {
  kairo: { name: '回廊', note: '屋根のある廊。守りやすいが詰まる', pts: [[-43.5, 52], [-45, 58], [-45, 70], [-45.5, 77], [-52, 77.5], [-52, 80], [-52, 82.2], [-54, 86]] },
  hondo: { name: '本堂を抜ける', note: '堂の中は広い。西の口から渡り廊下へ', pts: [[-44, 46], [-48, 46], [-55, 44], [-62, 46], [-65, 47], [-68, 51], [-68, 70], [-68, 79], [-68, 80.6], [-68, 82.2], [-62, 86]] },
  niwa: { name: '中庭を突っ切る', note: '近いが開けている。鉄砲に撃たれやすい', pts: [[-44, 54], [-50, 64], [-52, 74], [-52, 80], [-52, 82.2], [-54, 86]] },
  shukubo: { name: '宿坊を抜ける', note: '狭い部屋を抜ける。少しずつしか来られない', pts: [[-37, 62], [-35.5, 64.5], [-35.5, 68.5], [-38.5, 70], [-41, 70], [-44, 71.5], [-46.5, 80], [-47.5, 88], [-50.5, 88], [-53, 88.5]] },
  urate: { name: '裏手を回る', note: '細い道。遠回りだが敵が少ない', pts: [[-44, 38], [-52, 37], [-62, 37], [-70, 38], [-70.5, 50], [-70.5, 70], [-70.5, 79], [-71, 80.6], [-71, 82.2], [-66, 86]] },
};

// ---- 形の小道具（世界の座標で作る） ----
const pb = (w, h, d, x, y, z, hex) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return paintGeo(g, hex); };
const pcyl = (r, h, x, y, z, hex, seg = 8) => { const g = new THREE.CylinderGeometry(r * 0.94, r, h, seg); g.translate(x, y + h / 2, z); return paintGeo(g, hex); };
// 襖・障子の一枚（幅 0.9・高さ 1.8、+x に幅、z が厚み、足もと y=0）
function panelGeo(kind) {
  const P = [], W = 0.9, H = 1.8;
  if (kind === 'fusuma') {
    P.push(pb(W - 0.06, H - 0.06, 0.03, 0, H / 2, 0, 0xd6c7a0));
    P.push(pb(W - 0.12, 0.42, 0.034, 0, 1.28, 0, 0xc2ab72));     // 金砂子の帯（山水の気配）
    P.push(pb(W - 0.3, 0.16, 0.035, 0.08, 0.62, 0, 0x8c9a86));    // 低い山の淡い緑
    for (const [w, h, x, y] of [[W, 0.04, 0, H - 0.02], [W, 0.04, 0, 0.02], [0.035, H, -W / 2 + 0.018, H / 2], [0.035, H, W / 2 - 0.018, H / 2]]) P.push(pb(w, h, 0.045, x, y, 0, 0x231a14));
    P.push(pb(0.05, 0.08, 0.05, W / 2 - 0.12, 0.85, 0, 0x6a5a3a));
  } else {
    P.push(pb(W - 0.06, H - 0.34, 0.012, 0, H / 2 + 0.14, 0, 0xebe6d8));
    P.push(pb(W - 0.06, 0.3, 0.03, 0, 0.16, 0, 0x6a5038));
    for (const [w, h, x, y] of [[W, 0.04, 0, H - 0.02], [W, 0.04, 0, 0.31], [0.04, H, -W / 2 + 0.02, H / 2], [0.04, H, W / 2 - 0.02, H / 2]]) P.push(pb(w, h, 0.04, x, y, 0, 0x7a5a3a));
    for (const x of [-0.22, 0, 0.22]) P.push(pb(0.016, H - 0.36, 0.026, x, H / 2 + 0.15, 0, 0x8a6a48));
    for (let i = 1; i <= 5; i++) P.push(pb(W - 0.08, 0.016, 0.026, 0, 0.33 + i * 0.245, 0, 0x8a6a48));
  }
  return mergeGeometries(P);
}

// ---- 中のある建物（軸に沿った四角。座標は世界の座標） ----
// walls：[ax, az, bx, bz, 種, 口]。種 'wall'（腰板と白壁）'fusuma'（襖）'shoji'（障子）。口は [線の上の真ん中, 幅]
// floors：[x0, z0, x1, z1, 'tatami'|'ita']。engawa：縁側の辺（'s' など）
const HALLS = [
  { id: 'hondo', name: '本堂', x0: -63, x1: -47, z0: 40, z1: 52, H: 3.4, flam: 0.5, dur: 120, engawa: 'e',
    walls: [[-63, 40, -47, 40, 'wall', [[-56, 2.4]]], [-63, 52, -47, 52, 'wall', [[-50, 2.4], [-60, 2.2]]],
      [-47, 40, -47, 52, 'shoji', [[42.6, 2], [46, 2.4], [49.4, 2]]], [-63, 40, -63, 52, 'wall', [[46, 2.4]]],
      [-56, 40, -56, 52, 'fusuma', [[43, 2.4], [49, 2.4]]]],
    floors: [[-63, 40, -56, 52, 'tatami'], [-56, 40, -47, 52, 'ita']] },
  { id: 'goten', name: '御殿', x0: -73, x1: -49, z0: 81, z1: 95, H: 2.9, flam: 0.7, dur: 95, engawa: 's',
    walls: [[-73, 81, -49, 81, 'wall', [[-71, 1.8], [-68, 2], [-52, 2]]], [-73, 95, -49, 95, 'shoji', [[-69, 1.8], [-61, 1.8], [-53, 1.8]]],
      [-49, 81, -49, 95, 'wall', [[88, 2]]], [-73, 81, -73, 95, 'wall', [[90, 1.6]]],
      [-73, 83.2, -49, 83.2, 'fusuma', [[-70.6, 1.6], [-67, 1.8], [-62, 1.8], [-54, 1.8]]],
      [-65, 83.2, -65, 95, 'fusuma', [[89, 1.8]]], [-57, 83.2, -57, 95, 'fusuma', [[89, 1.8]]],
      [-69.4, 83.2, -69.4, 88.2, 'fusuma', [[86.6, 1.3]]], [-73, 88.2, -69.4, 88.2, 'fusuma', []]],
    floors: [[-73, 81, -49, 83.2, 'ita'], [-73, 83.2, -49, 95, 'tatami']] },
  { id: 'shukuboA', name: '宿坊', x0: -42, x1: -33, z0: 66, z1: 74, H: 2.6, flam: 1, dur: 55,
    walls: [[-42, 66, -33, 66, 'wall', [[-35.5, 1.8]]], [-42, 74, -33, 74, 'shoji', [[-38, 1.6]]],
      [-42, 66, -42, 74, 'wall', [[70, 1.8]]], [-33, 66, -33, 74, 'wall', []], [-38.5, 66, -38.5, 74, 'fusuma', [[70, 1.6]]]],
    floors: [[-42, 66, -33, 74, 'tatami']] },
];
// Garan で作る中の無い建物（遠くから見る物・通り抜けない物）と、屋根だけの廊
const GARAN = [
  { id: 'soboN', kind: 'sobo', x: -38, z: 36, w: 8, d: 6, var: 0 },          // 前面の宿坊
  { id: 'soboB', kind: 'sobo', x: -37.5, z: 84, w: 8, d: 6, var: 1 },        // 周辺の宿坊
  { id: 'kuri', kind: 'kuri', x: -38, z: 97, w: 8, d: 6 },                    // 庫裏（炊事）
  { id: 'kura', kind: 'kura', x: -74, z: 44, w: 3, d: 4 },                    // 物置
  { id: 'naya', kind: 'sobo', x: -74, z: 66, w: 3, d: 4, var: 2 },           // 納屋
  { id: 'shoro', kind: 'shoro', x: -57, z: 34, w: 3.2, d: 3.2 },              // 鐘楼
  { id: 'kairo1', kind: 'roka', x: -45, z: 64.75, w: 2.6, d: 24.5 },          // 回廊（南へ）
  { id: 'kairo2', kind: 'roka', x: -51.5, z: 77, w: 2.6, d: 13, rot: Math.PI / 2 },   // 回廊（西へ）
  { id: 'watari', kind: 'roka', x: -68, z: 66.5, w: 2.4, d: 28 },             // 渡り廊下（本堂→御殿）
  { id: 'soshido', kind: 'do', x: -61, z: 58.5, w: 5, d: 4, h: 3, hist: 'HIST_B' },        // 祖師堂（日蓮の像を祀る。境内の脇の小さな堂）
  { id: 'kyakuden', kind: 'do', x: -55, z: 101.5, w: 6, d: 4, h: 2.8, hist: 'HIST_B' },     // 客殿（来客を通す建物。御殿の南）
  { id: 'sobo_f1', kind: 'lite', x: -64, z: 100.5, w: 5, d: 3.5, var: 1, lite: true },   // 南の小さな僧坊
  { id: 'sobo_f2', kind: 'lite', x: -72, z: 100.5, w: 4, d: 3.5, var: 2, lite: true },
];

// 境内を作る。戻り値 T：G（Garan）・fire・halls・panels・gate structs・tick
export function buildTera(rt) {
  const W = rt.world, F = rt.flags;
  const G = new Garan(rt);
  const T = { G, halls: [], panels: [], doorsBlocked: new Set() };
  // ---- 築地（四つの門の口を空ける。makeKitBatch でまとめて描く） ----
  const kb = makeKitBatch();
  const { x0, x1, z0, z1 } = TERA;
  const sides = { n: [[x0, z0], [x1, z0]], s: [[x0, z1], [x1, z1]], w: [[x0, z0], [x0, z1]], e: [[x1, z0], [x1, z1]] };
  T.walls = [];
  for (const [k, [[ax, az], [bx, bz]]] of Object.entries(sides)) {
    const gs = Object.values(GATES).filter((g) => g.side === k).map((g) => (k === 'n' || k === 's' ? [g.x - g.w / 2, g.x + g.w / 2] : [g.z - g.w / 2, g.z + g.w / 2])).sort((a, b) => a[0] - b[0]);
    const along = k === 'n' || k === 's';
    let s = along ? ax : az;
    const end = along ? bx : bz;
    const pts = [];
    for (const [g0, g1] of gs) { pts.push([s, g0]); s = g1; }
    pts.push([s, end]);
    for (const [p0, p1] of pts) {
      if (p1 - p0 < 0.5) continue;
      const P = along ? [[p0, az], [p1, az]] : [[ax, p0], [ax, p1]];
      T.walls.push(...wallLine(rt, P, { team: 0, hp: 1e9, name: '築地塀', segLen: 6, mesh: tsuiji, meshOpt: { batch: kb } }));
    }
  }
  for (const s of T.walls) { s.noTarget = true; s.wall = true; s.h = 2.6; }
  finalizeKitBatch(rt, kb);
  rt.scene.add(kabukimon(W, GATES.main.x, GATES.main.z, GATES.main.w + 1.4, Math.PI / 2));
  // ---- 中の無い建物・廊・灯籠 ----
  for (const b of GARAN) G.build({ dist: 'near', ...b });
  for (const [x, z] of [[-48.5, 60], [-60, 72], [-55, 57]]) G.lantern(x, z, 'near');
  // ---- 中のある建物 ----
  for (const H of HALLS) T.halls.push(buildHall(rt, G, H, T));
  G.finish();
  for (const h of T.halls) { const b = G.buckets.get('roof_' + h.id + '|tile'); h.roof = b && b.mesh; }
  // ---- 襖と障子（一枚ずつ破れる）：二つの InstancedMesh ----
  const pm = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });
  T.inst = {};
  for (const kind of ['fusuma', 'shoji']) {
    const list = T.panels.filter((p) => p.kind === kind);
    const m = new THREE.InstancedMesh(panelGeo(kind), pm, Math.max(1, list.length));
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), Pv = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
    list.forEach((p, i) => { p.mesh = m; p.i = i; Q.setFromAxisAngle(Y, p.rot); S.set(p.sx, 1, 1); Pv.set(p.x, p.y, p.z); M.compose(Pv, Q, S); m.setMatrixAt(i, M); });
    m.count = list.length; m.castShadow = true; m.receiveShadow = true;
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
    rt.scene.add(m);
    T.inst[kind] = m;
  }
  // ---- 火（建物ごとに燃え、近い棟へ少しずつ燃え移る。燃え移りは遅めにして、段で火をかける） ----
  T.fire = makeTempleFire(rt, G, {
    // 画質「低」（携帯）は炎の板と煙の柱を減らす（寺の中は近くに大きな煙の粒が重なって重い）
    rate: 0.3, flames: SETTINGS.quality === 'low' ? 3 : 4, smokes: SETTINGS.quality === 'low' ? 4 : 8,
    onBurnt: (r) => { if (!F.ending) rt.bark(`${r.label || '伽藍の一棟'}が焼け落ちた`); if (r.kind !== 'hall') { rt.world.addSmokeColumn(r.x, (r.y0 || 0) + 1, r.z, { size: 2.2 }); rt.world.addFire(r.x, r.z, { size: 1.1, h: 0.2 }); } },   // 崩れた跡に燻る煙と残り火（B118）
  });
  const LBL = { soboN: '表の宿坊', soboB: '奥の宿坊', kuri: '庫裏', kairo1: '回廊', kairo2: '回廊', watari: '渡り廊下', kura: '物置', naya: '納屋', shoro: '鐘楼' };
  for (const r of G.recs) r.label = r.label || LBL[r.id];
  return T;
}

// 中のある建物を一つ
function buildHall(rt, G, H, T) {
  const W = rt.world;
  const cx = (H.x0 + H.x1) / 2, cz = (H.z0 + H.z1) / 2;
  const rec = G.build({ id: H.id, kind: 'hall', x: cx, z: cz, w: H.x1 - H.x0, d: H.z1 - H.z0, lite: true, dist: 'hall' });
  rec.flam = H.flam; rec.dur = H.dur; rec.label = H.name; rec.top = H.H + 1.8;
  const y = rec.y0, put = (mk, g) => G._push(rec, mk, g);
  // カメラの寄せ用の当たり：壁だけの描かない箱（細かい柱・道具まで入った大きな形を毎コマ線で調べると重い）
  const blk = [];
  const bb = (w, h, d, x, yy, z) => { const g = new THREE.BoxGeometry(w, h, d); g.deleteAttribute('uv'); g.deleteAttribute('normal'); g.translate(x, yy, z); blk.push(g); };
  const hall = { id: H.id, name: H.name, H, rec, doors: [], panels: [], x0: H.x0, x1: H.x1, z0: H.z0, z1: H.z1 };
  // 基壇（石）と床（畳・板）
  put('wood', pb(H.x1 - H.x0 + 0.5, 0.3, H.z1 - H.z0 + 0.5, cx, y - 0.1, cz, 0x7e7a70));
  for (const [a, b, c, d, k] of H.floors) put(k === 'tatami' ? 'plain' : 'wood', pb(c - a - 0.04, 0.05, d - b - 0.04, (a + c) / 2, y + 0.07, (b + d) / 2, k === 'tatami' ? 0x9c9566 : 0x6a5034));
  // 畳の縁（黒い筋。部屋の畳の割り付けの気配だけ）
  for (const [a, b, c, d, k] of H.floors) if (k === 'tatami') for (let x = a + 1.8; x < c - 0.3; x += 1.8) put('plain', pb(0.06, 0.052, d - b - 0.1, x, y + 0.075, (b + d) / 2, 0x2a2a22));
  // 壁・襖・障子
  for (const [ax, az, bx, bz, kind, doors] of H.walls) {
    const alongX = Math.abs(bz - az) < 1e-3;
    const a = alongX ? ax : az, b = alongX ? bx : bz, fix = alongX ? az : ax;
    const at = (s) => (alongX ? [s, fix] : [fix, s]);
    const gaps = doors.map(([m, w]) => [m - w / 2, m + w / 2]).sort((p, q) => p[0] - q[0]);
    for (const [g0, g1] of gaps) hall.doors.push({ x: at((g0 + g1) / 2)[0], z: at((g0 + g1) / 2)[1], w: g1 - g0, alongX });
    const runs = [];
    let s = a;
    for (const [g0, g1] of gaps) { if (g0 - s > 0.05) runs.push([s, g0]); s = g1; }
    if (b - s > 0.05) runs.push([s, b]);
    const L = b - a, mid = (a + b) / 2;
    const bx3 = (len, h, yy, m, hex, mk = 'wood', th = 0.14) => { const [px, pz] = at(m); put(mk, alongX ? pb(len, h, th, px, y + yy, pz, hex) : pb(th, h, len, px, y + yy, pz, hex)); };
    // 小壁（鴨居の上）と鴨居は口の上にも通す
    const top = kind === 'wall' ? 1.95 : 1.8;
    bx3(L, H.H - top, top + (H.H - top) / 2, mid, 0xd2cab4, 'plain', kind === 'wall' ? 0.14 : 0.1);
    { const [px, pz] = at(mid); bb(alongX ? L : 0.14, H.H - top, alongX ? 0.14 : L, px, y + top + (H.H - top) / 2, pz); }
    bx3(L, 0.1, top + 0.05, mid, 0x3a2a1c, 'wood', 0.16);
    put('wood', pb(0.18, H.H, 0.18, at(a)[0], y + H.H / 2, at(a)[1], 0x4a3826));
    put('wood', pb(0.18, H.H, 0.18, at(b)[0], y + H.H / 2, at(b)[1], 0x4a3826));
    for (const [r0, r1] of runs) {
      const len = r1 - r0, m = (r0 + r1) / 2;
      const [p0x, p0z] = at(r0), [p1x, p1z] = at(r1);
      put('wood', pb(0.16, H.H, 0.16, p0x, y + H.H / 2, p0z, 0x4a3826)); put('wood', pb(0.16, H.H, 0.16, p1x, y + H.H / 2, p1z, 0x4a3826));
      if (kind === 'wall') {
        bx3(len, 0.9, 0.45, m, 0x4a3a2a, 'wood');
        bx3(len, 1.05, 0.9 + 0.525, m, 0xd8d0bc, 'plain');
        { const [px, pz] = at(m); bb(alongX ? len : 0.14, top, alongX ? 0.14 : len, px, y + top / 2, pz); }
        solidSeg(p0x, p0z, p1x, p1z, 0.1);
        for (let k = Math.ceil((r0 + 2.7) / 2.7) * 2.7; k < r1 - 0.8; k += 2.7) { const [qx, qz] = at(k); put('wood', pb(0.15, H.H, 0.15, qx, y + H.H / 2, qz, 0x4a3826)); }
      } else {
        // 一枚ずつ（幅 0.9 前後に割る）。当たりも一枚ずつ（破れたら消す）
        const n = Math.max(1, Math.round(len / 0.9)), pw = len / n;
        for (let i = 0; i < n; i++) {
          const c0 = r0 + i * pw, c1 = c0 + pw, [qx, qz] = at((c0 + c1) / 2), [sx0, sz0] = at(c0), [sx1, sz1] = at(c1);
          const p = { kind, hall: H.id, x: qx, z: qz, y: y + 0.08, rot: alongX ? 0 : Math.PI / 2, sx: pw / 0.9, alive: true, solid: solidSeg(sx0, sz0, sx1, sz1, 0.06) };
          T.panels.push(p); hall.panels.push(p);
        }
        bx3(len, 0.06, 0.1, m, 0x3a2a1c, 'wood', 0.12);   // 敷居
      }
    }
  }
  // 縁側（板と、軒を支える柱）
  if (H.engawa === 's') { put('wood', pb(H.x1 - H.x0, 0.08, 1.3, cx, y + 0.06, H.z1 + 0.65, 0x5e4630)); for (let x = H.x0; x <= H.x1 + 0.01; x += 3) put('wood', pb(0.14, H.H, 0.14, x, y + H.H / 2, H.z1 + 1.25, 0x4a3826)); }
  if (H.engawa === 'e') { put('wood', pb(1.2, 0.08, H.z1 - H.z0, H.x1 + 0.6, y + 0.06, cz, 0x5e4630)); for (let z = H.z0; z <= H.z1 + 0.01; z += 3) put('wood', pb(0.14, H.H, 0.14, H.x1 + 1.15, y + H.H / 2, z, 0x4a3826)); }
  // 中の道具
  INTERIOR[H.id](put, y, hall);
  // 屋根（入母屋に見える寄棟。この建物だけの形にして、中にいる間は隠す）
  const ex = (H.x1 - H.x0) / 2 + 1.5, ez = (H.z1 - H.z0) / 2 + 1.5;
  const rf = paintGeo(hipGeo(ex, ez, ez * 0.62, H.H + 0.05, Math.max(0.6, ex - ez * 0.9)), 0xffffff); rf.translate(cx, y, cz);
  rec.dist = 'roof_' + H.id; put('tile', rf);
  // 軒の裏の板（下から見て屋根の中が抜けないように）
  put('wood', pb(H.x1 - H.x0 + 2.8, 0.06, H.z1 - H.z0 + 2.8, cx, y + H.H + 0.06, cz, 0x3a2c20));
  rec.dist = 'hall';
  if (blk.length) {
    const bm = new THREE.Mesh(mergeGeometries(blk), G.proxyMat);
    bm.userData.camBlock = true; bm.matrixAutoUpdate = false; bm.updateMatrix();
    rt.scene.add(bm); hall.blk = bm;
  }
  return hall;
}

// 部屋の中の道具（当たりは大きな物だけ）
const INTERIOR = {
  hondo(put, y) {
    // 須弥壇と本尊、内陣の柱
    put('wood', pb(2.6, 0.9, 5, -60, y + 0.45, 46, 0x2a1a12)); put('wood', pb(2.2, 0.25, 4.4, -60, y + 1.02, 46, 0x8a6a2a));
    put('plain', pcyl(0.42, 1.0, -60.3, y + 1.15, 46, 0xa8862e, 10)); put('plain', pb(0.5, 0.55, 0.5, -60.3, y + 2.4, 46, 0xa8862e));
    { const g = new THREE.CylinderGeometry(0.9, 0.9, 0.05, 14); g.rotateZ(Math.PI / 2); g.translate(-61.1, y + 2.5, 46); put('plain', paintGeo(g, 0x8a6a2a)); }   // 光背
    solidRect(-60, 46, 2.7, 5.1);
    for (const [x, z] of [[-58, 42.4], [-58, 49.6], [-52, 42.4], [-52, 49.6]]) { put('wood', pcyl(0.17, 3.4, x, y, z, 0x5a3e2a)); solidCircle(x, z, 0.2); }
    for (const z of [43, 49]) put('plain', pb(0.3, 0.5, 0.3, -58.6, y + 0.9, z, 0xe0c890));   // 灯明
  },
  goten(put, y) {
    // 信長の居室：床の間・掛軸・屏風・寝具・燭台・刀掛け
    put('wood', pb(0.9, 0.2, 3, -72.5, y + 0.12, 91.5, 0x3a2a1c)); put('plain', pb(0.04, 1.1, 0.6, -72.95, y + 1.3, 91.5, 0xe0dccb));
    for (let i = 0; i < 6; i++) put('plain', pb(0.62, 1.45, 0.04, -71.2 + i * 0.6, y + 0.8, 93.9 + (i % 2) * 0.18, 0xb8963a));
    put('plain', pb(1.0, 0.12, 2.0, -68.6, y + 0.13, 91.4, 0xe6e2d6)); put('plain', pb(0.5, 0.1, 0.3, -68.6, y + 0.22, 90.5, 0xd8d2c0));
    put('wood', pcyl(0.03, 0.9, -66.2, y + 0.08, 93.6, 0x2a1c14)); put('plain', pb(0.14, 0.16, 0.14, -66.2, y + 1.05, 93.6, 0xffd890));
    put('wood', pb(0.5, 0.35, 0.18, -70.3, y + 0.25, 84.2, 0x2a1c14)); put('wood', pb(0.9, 0.04, 0.04, -70.3, y + 0.46, 84.2, 0x1a1210));
    // 控えの間：槍立て（武具置き場）
    put('wood', pb(0.12, 1.6, 2.4, -57.4, y + 0.8, 91.5, 0x3a2a1c));
    for (let i = 0; i < 6; i++) put('wood', pcyl(0.02, 2.8, -57.55, y + 0.1, 90.5 + i * 0.4, 0x5a4230, 5));
    // 広間：上段の間（低い一段）
    put('plain', pb(2.6, 0.1, 10.6, -50.4, y + 0.11, 89.1, 0xa8a070));
    put('wood', pcyl(0.03, 0.9, -51, y + 0.08, 84.5, 0x2a1c14)); put('plain', pb(0.14, 0.16, 0.14, -51, y + 1.05, 84.5, 0xffd890));
  },
  shukuboA(put, y) {
    for (const [x, z] of [[-40.5, 68], [-40.5, 72.4], [-35, 72.4]]) put('plain', pb(0.9, 0.1, 1.9, x, y + 0.12, z, 0xd8d2c2));
    put('plain', pb(0.32, 0.6, 0.32, -34, y + 0.38, 67.2, 0xe8dcb8));   // 行灯
  },
};

// 毎コマ：屋根の出し入れ・燃える建物の口を塞ぐ・熱
export function teraTick(rt, T, dt) {
  const P = rt.player && rt.player.u;
  if (!P) return;
  const px = P.pos.x, pz = P.pos.z;
  for (const h of T.halls) {
    const inside = px > h.x0 - 0.3 && px < h.x1 + 0.3 && pz > h.z0 - 0.3 && pz < h.z1 + 0.3;
    h.inside = inside;
    if (h.roof) h.roof.visible = !inside || h.rec.state === 2;
  }
  T.heatT = (T.heatT || 0) - dt;
  if (T.heatT > 0) return;
  T.heatT = 0.5;
  for (const h of T.halls) {
    const r = h.rec;
    // よく燃えている建物：口を塞ぐ（自分が中にいる間は待つ）、襖は燃えて消える
    if (r.state >= 1 && r.burnT > 40 && !h.blocked && !h.inside) {
      h.blocked = true;
      for (const d of h.doors) solidSeg(d.alongX ? d.x - d.w / 2 : d.x, d.alongX ? d.z : d.z - d.w / 2, d.alongX ? d.x + d.w / 2 : d.x, d.alongX ? d.z : d.z + d.w / 2, 0.12);
      for (const p of h.panels) breakPanel(rt, p, true);
    }
    if (r.state === 1 && r.burnT > 22 && h.inside && P.alive) heat(rt, P);
  }
  // 屋根だけの廊（回廊・渡り廊下）と宿坊：燃えていれば熱で近寄れない
  for (const r of T.G.recs) {
    if (r.state !== 1 || r.burnT < 8 || r.kind === 'hall') continue;
    const rot = r.rot || 0, c = Math.cos(rot), s = Math.sin(rot), dx = px - r.x, dz = pz - r.z;
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    if (Math.abs(lx) < r.w / 2 + 0.8 && Math.abs(lz) < r.d / 2 + 0.8 && P.alive) heat(rt, P);
  }
}
function heat(rt, P) {
  P.hp = Math.max(P.maxHp * 0.12, P.hp - P.maxHp * 0.035);
  if (rt.t - (rt.flags.heatSaidT || -99) > 8) { rt.flags.heatSaidT = rt.t; rt.bark('火の中じゃ！　ここは通れぬ。外へ出よ', true); }
}
// 襖・障子を一枚破る（quiet：燃えて消える時は音を出さない）
export function breakPanel(rt, p, quiet) {
  if (!p || !p.alive) return false;
  p.alive = false;
  const M = new THREE.Matrix4().makeScale(0, 0, 0);
  p.mesh.setMatrixAt(p.i, M); p.mesh.instanceMatrix.needsUpdate = true;
  const s = p.solid; s.x0 = s.x1 = s.z0 = s.z1 = 1e9;
  if (!quiet) rt.army.play('wood', { x: p.x, z: p.z }, 0.9);
  return true;
}
// 近くの襖を破る（自分の一振り・敵の突き破り）。破った数を返す
export function breakNear(rt, T, x, z, r, max = 2, dir = null) {
  let n = 0;
  for (const p of T.panels) {
    if (!p.alive || n >= max) continue;
    const dx = p.x - x, dz = p.z - z, d = Math.hypot(dx, dz);
    if (d > r) continue;
    if (dir && d > 0.3 && (dx * dir.x + dz * dir.z) / d < 0.3) continue;
    if (breakPanel(rt, p)) n++;
  }
  return n;
}
// 中のある建物の中か（どの建物か）
export function hallAt(T, x, z) { return T.halls.find((h) => x > h.x0 && x < h.x1 && z > h.z0 && z < h.z1) || null; }
