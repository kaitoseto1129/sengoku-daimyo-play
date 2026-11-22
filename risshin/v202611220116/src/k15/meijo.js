// ======================================================================
// k15/meijo.js … 天王寺・岡山の目印（11/14 K287：上からの写真で四天王寺・茶臼山が読めなかった）
// 四天王寺：冬の陣で伽藍は焼けたが、境内の白い砂利の四角・崩れた築地・西の石の鳥居（永仁二年・1294。今も残る）は残った。
//   上からは「白い四角の境内と、崩れた土塀の枠」で寺と分かるようにする。
// 茶臼山：古墳の丘。冬の陣では家康の本陣で、丘の上に土塁を巡らせた（夏の陣は真田の陣）。北東に河底池（延暦七年に和気清麻呂が掘った堀の名残）。
//   上からは「濃い草の丸い丘・丘の上の土塁の輪・北東の池」で茶臼山と分かるようにする。
// 手本：四天王寺式伽藍配置（南大門・中門・塔・金堂・講堂が一直線）・石鳥居（重要文化財）・茶臼山古墳と河底池（大阪市の史跡の案内）。
// 重さ：形は数個（土塀は InstancedMesh 一つ）。当たりは鳥居の柱と池だけ。崩れた土塀は膝の高さで踏み越える。
// ======================================================================
import * as THREE from 'three';
import { solidCircle } from '../props.js';

let M = null;
function mats() {
  return (M ||= {
    gravel: new THREE.MeshStandardMaterial({ color: 0xcfc6b0, roughness: 1, metalness: 0 }),   // 境内の白い砂利（焼け跡の灰で少し茶）
    tsuiji: new THREE.MeshStandardMaterial({ color: 0xb59a6c, roughness: 1, metalness: 0 }),   // 築地の土（瓦は焼け落ちた）
    stone: new THREE.MeshStandardMaterial({ color: 0x9c978c, roughness: 0.9, metalness: 0 }),   // 石の鳥居の花崗岩
    grass: new THREE.MeshStandardMaterial({ color: 0x4f6a34, roughness: 1, metalness: 0 }),     // 古墳の丘の濃い草
    dorui: new THREE.MeshStandardMaterial({ color: 0x7e6a48, roughness: 1, metalness: 0 }),     // 土塁の掘り返した土
    water: new THREE.MeshStandardMaterial({ color: 0x3d5560, roughness: 0.15, metalness: 0.1 }), // 池の水（空を映す暗い青緑）
  });
}

// 地面に沿う板（四角か丸）。lift は地面からの浮き
function groundSheet(W, cx, cz, w, d, mat, { round = false, lift = 0.06, seg = 16 } = {}) {
  const g = new THREE.PlaneGeometry(w, d, seg, seg); g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), z = p.getZ(i);
    if (round) { const r = Math.hypot(x / (w / 2), z / (d / 2)); if (r > 1) { x /= r; z /= r; } p.setX(i, x); p.setZ(i, z); }
    p.setY(i, W.heightAt(cx + x, cz + z) + lift);
  }
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat); m.position.set(cx, 0, cz); m.receiveShadow = true;
  return m;
}

// 四天王寺の境内：白い砂利の四角＋崩れた築地の枠＋西の石の鳥居
function shitennoji(rt, S) {
  const W = rt.world, m = mats();
  const cx = S.x, cz = S.z - 31, w = 34, d = 34;   // 南大門（S）から北へ講堂の後ろまで（伽藍跡 garanAto の z -20〜-41 を包む）
  rt.scene.add(groundSheet(W, cx, cz, w, d, m.gravel, { lift: 0.04 }));
  // 崩れた築地：四辺に沿って長さ 2.4m の土塀を並べ、所々が崩れて抜け、残りも高さがまちまち
  const box = new THREE.BoxGeometry(2.4, 1, 0.9), spots = [];
  const edge = (ax, az, bx, bz, gate) => {
    const L = Math.hypot(bx - ax, bz - az), n = Math.round(L / 2.4);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      if (gate && Math.abs(t - 0.5) < 0.12) continue;          // 門の口（南大門・西門）
      if ((i * 7 + Math.round(ax + az)) % 5 === 0) continue;  // 焼けて崩れ落ちた所
      spots.push({ x, z, ry: Math.atan2(bz - az, bx - ax), h: 0.5 + ((i * 11) % 4) * 0.18 });
    }
  };
  const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
  edge(x0, z1, x1, z1, true); edge(x0, z0, x1, z0, false); edge(x0, z0, x0, z1, true); edge(x1, z0, x1, z1, false);
  const wall = new THREE.InstancedMesh(box, m.tsuiji, spots.length);
  const mx = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  spots.forEach((s, k) => { mx.compose(v.set(s.x, W.heightAt(s.x, s.z) + s.h / 2 - 0.05, s.z), q.setFromEuler(e.set(0, -s.ry, 0)), sc.set(1, s.h, 1)); wall.setMatrixAt(k, mx); });
  wall.castShadow = true; wall.receiveShadow = true; rt.scene.add(wall);
  // 西の石の鳥居（西門の外。焼けずに残った）
  const tx = x0 - 3, tz = cz, y = W.heightAt(tx, tz), T = new THREE.Group();
  for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.4, 5.2, 10), m.stone); p.position.set(0, 2.6, s * 2.1); T.add(p); solidCircle(tx, tz + s * 2.1, 0.42); }
  const kasagi = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.45, 6.4), m.stone); kasagi.position.y = 5.35; T.add(kasagi);
  const nuki = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.32, 5.2), m.stone); nuki.position.y = 4.3; T.add(nuki);
  T.position.set(tx, y, tz); T.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  rt.scene.add(T);
}

// 茶臼山：濃い草の丸い丘・丘の上の土塁の輪（冬の陣の家康の陣の跡）・北東の河底池
function chausuyama(rt, C) {
  const W = rt.world, m = mats();
  rt.scene.add(groundSheet(W, C.x, C.z, 30, 30, m.grass, { round: true, lift: 0.05, seg: 20 }));
  const ring = new THREE.Group(), N = 22, R = 8.5;
  const lump = new THREE.CylinderGeometry(0.9, 1.4, 1, 6);
  for (let i = 0; i < N; i++) {
    if (i === 5 || i === 16) continue;   // 虎口（南と北）
    const a = (i / N) * Math.PI * 2, x = C.x + Math.cos(a) * R, z = C.z + Math.sin(a) * R, h = 0.7 + (i % 3) * 0.15;
    const b = new THREE.Mesh(lump, m.dorui); b.scale.set(1.5, h, 1.1); b.rotation.y = -a; b.position.set(x, W.heightAt(x, z) + h / 2 - 0.1, z);
    b.castShadow = true; b.receiveShadow = true; ring.add(b);
  }
  rt.scene.add(ring);
  // 河底池：丘の北東。水面は池の中の一番高い地面より少し上（傾いた地面の土手が水を隠した）
  const px = C.x + 15, pz = C.z - 12, pw = 16, pd = 9;
  let hi = -Infinity; for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) if (i * i / 4 + j * j / 4 <= 1) hi = Math.max(hi, W.heightAt(px + i * pw / 5, pz + j * pd / 5));
  const pond = new THREE.Mesh(new THREE.CircleGeometry(1, 28), m.water);
  pond.rotation.x = -Math.PI / 2; pond.scale.set(pw / 2, pd / 2, 1); pond.position.set(px, hi + 0.1, pz); pond.receiveShadow = true;
  rt.scene.add(pond);
  // 池の縁の土手（水面より下に敷く）
  const bank = groundSheet(W, px, pz, pw + 3, pd + 3, m.dorui, { round: true, lift: 0.03, seg: 12 });
  bank.renderOrder = -1; rt.scene.add(bank);
  for (const [dx, dz, r] of [[-4, 0, 3.4], [0, 0, 3.8], [4, 0, 3.4]]) solidCircle(px + dx, pz + dz, r);   // 兵は池に入らない
}

export function install(rt, { SHITENNO, CHAUSU }) {
  shitennoji(rt, SHITENNO);
  chausuyama(rt, CHAUSU);
}
