// 黄石山城（朝鮮 慶尚道 咸陽の黄石山の山城＝石城）。K656 K655 11/28 クラウドさ（Opus）。
// 手本と出所：docs/kaito_refs_all/20261126/chosokabe15_spec.md「13」（戦場＝朝鮮半島の山地・城壁・門・石垣・林）・
//   『懲毖録』『乱中雑録』（B）・黄石山城跡（史跡）の解説（C）：山の頂を石の城壁が尾根伝いに一回りし（包谷式の山城）、
//   壁の上には女墻（銃眼の付いた低い胸壁）、門は石の虹霓門（アーチ）の上に木の門楼（入母屋の瓦屋根・丹青の柱）。頂に将台。
//   周りの長さ・壁の高さは推（ゲームの戦場に縮めた。壁は約5m）。
// 見た目だけ（light_battle に当たりは無い）。兵が通る所（大手の門・搦手の破れ・西の崩れ）は壁を切ってある。
// 材質と形は一度だけ作り、壁の石・女墻・松明は InstancedMesh で束ねる（描く回数を増やさない）。
import * as THREE from 'three';
import { stoneTex } from '../nature.js';

// 壁の筋（時計回り）。c09 の座標：大手の門 GATE (4,92)・搦手の破れ KARAME (30,98)・城の内 (-30,100)・(0,120)・城の奥 (0,134)
export const KOSEKI_WALL = [[4, 89], [20, 86], [33, 93], [37, 108], [30, 132], [8, 148], [-22, 146], [-46, 128], [-52, 104], [-36, 88], [-14, 86], [4, 89]];
// 壁を切る所（中心と幅）
const GAPS = [{ x: 4, z: 89, w: 7, gate: true }, { x: 33.6, z: 96, w: 6 }, { x: -22, z: 86.6, w: 7 }];

let MATS = null;
function mats() {
  if (MATS) return MATS;
  const st = stoneTex();
  MATS = {
    stone: new THREE.MeshStandardMaterial({ color: 0xdcd4c4, map: st, roughness: 0.95 }),
    stoneDark: new THREE.MeshStandardMaterial({ color: 0xa69e90, map: st, roughness: 0.95 }),
    hole: new THREE.MeshStandardMaterial({ color: 0x0d0b0a, roughness: 1 }),
    red: new THREE.MeshStandardMaterial({ color: 0x8e2a1c, roughness: 0.8 }),
    green: new THREE.MeshStandardMaterial({ color: 0x2f6a56, roughness: 0.8 }),
    roof: new THREE.MeshStandardMaterial({ color: 0x2c2c2e, roughness: 0.85 }),
    fire: new THREE.MeshBasicMaterial({ color: 0xffa040 }),
    flag: new THREE.MeshStandardMaterial({ color: 0xc8b25a, roughness: 0.9, side: THREE.DoubleSide }),
    pole: new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 0.9 }),
  };
  return MATS;
}

const inGap = (x, z) => GAPS.some((g) => Math.hypot(x - g.x, z - g.z) < g.w * 0.5 + 0.6);

// 入母屋の瓦屋根（反りは軒の四隅を上げた箱で見せる）
function roof(g, M, w, d, y, h) {
  const r = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 4, 1), M.roof);
  r.rotation.y = Math.PI / 4; r.scale.set(w * 0.78, h, d * 0.78); r.position.y = y + h * 0.5; g.add(r);
  const eave = new THREE.Mesh(new THREE.BoxGeometry(w + 1.4, 0.32, d + 1.4), M.roof); eave.position.y = y; g.add(eave);
  const ridge = new THREE.Mesh(new THREE.BoxGeometry(w * 0.55, 0.36, 0.42), M.roof); ridge.position.y = y + h * 0.92; g.add(ridge);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.26, 1.1), M.roof);
    c.position.set(sx * (w + 1.2) * 0.5, y + 0.34, sz * (d + 1.2) * 0.5); c.rotation.set(sz * 0.32, 0, -sx * 0.32); g.add(c);
  }
}

// 木の楼（丹青の柱と梁・瓦屋根）。門楼にも将台にも使う
function pavilion(M, w, d, ph) {
  const g = new THREE.Group();
  const post = new THREE.CylinderGeometry(0.22, 0.26, ph, 8);
  const nx = 3, nz = 2;
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const p = new THREE.Mesh(post, M.red); p.position.set(-w / 2 + (w * i) / (nx - 1), ph / 2, -d / 2 + (d * j) / (nz - 1)); g.add(p);
  }
  const floor = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.3, d + 0.6), M.pole); floor.position.y = 0.15; g.add(floor);
  for (const [bw, bd, bz] of [[w + 0.4, 0.34, -d / 2], [w + 0.4, 0.34, d / 2]]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(bw, 0.5, bd), M.green); b.position.set(0, ph - 0.25, bz); g.add(b);
  }
  for (const bx of [-w / 2, w / 2]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.5, d + 0.4), M.green); b.position.set(bx, ph - 0.25, 0); g.add(b); }
  const rail = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, 0.12, 0.12), M.red); rail.position.set(0, 1.0, d / 2 + 0.05); g.add(rail);
  roof(g, M, w, d, ph + 0.05, Math.max(1.6, w * 0.32));
  return g;
}

// 石の虹霓門（アーチの門）と上の門楼。rot は壁の向き
function gateHouse(M, rot) {
  const g = new THREE.Group();
  const W = 9, H = 6, D = 5.4;
  for (const sx of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(3.2, H, D), M.stone); p.position.set(sx * (W / 2 - 1.6), H / 2, 0); g.add(p); }
  const top = new THREE.Mesh(new THREE.BoxGeometry(W, 1.6, D), M.stone); top.position.y = H - 0.8; g.add(top);
  // アーチの上の半円（石）と、その奥の暗がり
  const arch = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.35, D, 12, 1, false, 0, Math.PI), M.stoneDark);
  arch.rotation.set(Math.PI / 2, 0, Math.PI / 2); arch.position.y = H - 2.2; arch.scale.set(1, 1, 0.9); g.add(arch);
  // 門の口の奥の暗がり（アーチの形が夜に読めるように）と、内へ開いた扉
  const hole = new THREE.Mesh(new THREE.BoxGeometry(2.6, 3.9, 0.2), M.hole); hole.position.set(0, 1.95, 0); g.add(hole);
  const holeTop = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 0.22, 12, 1, false, 0, Math.PI), M.hole);
  holeTop.rotation.set(Math.PI / 2, 0, Math.PI / 2); holeTop.position.set(0, 3.9, 0); g.add(holeTop);
  for (const sx of [-1, 1]) { const door = new THREE.Mesh(new THREE.BoxGeometry(1.3, 3.8, 0.2), M.red); door.position.set(sx * 1.25, 1.9, -0.7); door.rotation.y = sx * 1.2; g.add(door); }
  for (let i = 0; i < 5; i++) { const c = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.1, 0.5), M.stone); c.position.set(-W / 2 + 0.6 + i * 1.95, H + 0.55, D / 2 - 0.25); g.add(c); }
  const pav = pavilion(M, 6.4, 3.6, 3.0); pav.position.y = H; g.add(pav);
  g.rotation.y = rot;
  return g;
}

function flag(M, h) {
  const g = new THREE.Group();
  const p = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, h, 6), M.pole); p.position.y = h / 2; g.add(p);
  const c = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 2.4), M.flag); c.position.set(0.95, h - 1.3, 0); g.add(c);
  return g;
}

// 黄石山城を建てる。W＝rt.world。戻り値は Group（rt.scene に足す）
export function buildKoseki(W) {
  const M = mats();
  const root = new THREE.Group(); root.name = 'koseki';
  const PIECE = 2.4, HW = 5.2, TH = 2.2;
  const pieces = [], crenels = [], fires = [];
  const pts = KOSEKI_WALL;
  // 外向きの法線を決めるための中心
  let cx = 0, cz = 0; for (const [x, z] of pts.slice(0, -1)) { cx += x; cz += z; } cx /= pts.length - 1; cz /= pts.length - 1;
  let ci = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(L / PIECE)), yaw = Math.atan2(bx - ax, bz - az);
    let nxo = (bz - az) / L, nzo = -(bx - ax) / L;
    const mx = (ax + bx) / 2, mz = (az + bz) / 2;
    if ((mx - cx) * nxo + (mz - cz) * nzo < 0) { nxo = -nxo; nzo = -nzo; }
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      if (inGap(x, z)) continue;
      const y0 = Math.min(W.heightAt(x - nxo * 1.5, z - nzo * 1.5), W.heightAt(x + nxo * 1.5, z + nzo * 1.5)) - 0.8;
      pieces.push([x, y0 + HW / 2, z, yaw, L / n + 0.12]);
      // 女墻（外の縁に、間を空けて二つずつ）
      for (const s of [-0.25, 0.25]) {
        const ex = x + Math.sin(yaw) * s * (L / n), ez = z + Math.cos(yaw) * s * (L / n);
        crenels.push([ex + nxo * (TH / 2 - 0.25), y0 + HW + 0.6, ez + nzo * (TH / 2 - 0.25), yaw]);
      }
      if (ci++ % 6 === 3) fires.push([x - nxo * 0.4, y0 + HW + 1.6, z - nzo * 0.4]);
    }
  }
  const o = new THREE.Object3D();
  const wall = new THREE.InstancedMesh(new THREE.BoxGeometry(1, HW, TH), M.stone, pieces.length);
  // 箱の長さは z（向き yaw に沿う）なので、Box の z を長さに（1→len）
  pieces.forEach(([x, y, z, yaw, len], i) => { o.position.set(x, y, z); o.rotation.set(0, yaw, 0); o.scale.set(TH, 1, len / TH); o.updateMatrix(); wall.setMatrixAt(i, o.matrix); });
  wall.instanceMatrix.needsUpdate = true; root.add(wall);
  const cr = new THREE.InstancedMesh(new THREE.BoxGeometry(0.55, 1.2, 0.9), M.stoneDark, crenels.length);
  crenels.forEach(([x, y, z, yaw], i) => { o.position.set(x, y, z); o.rotation.set(0, yaw, 0); o.scale.set(1, 1, 1); o.updateMatrix(); cr.setMatrixAt(i, o.matrix); });
  cr.instanceMatrix.needsUpdate = true; root.add(cr);
  // 壁の上の松明（夜の城の灯）
  const fm = new THREE.InstancedMesh(new THREE.SphereGeometry(0.45, 6, 4), M.fire, fires.length);
  fires.forEach(([x, y, z], i) => { o.position.set(x, y, z); o.rotation.set(0, 0, 0); o.scale.set(1, 1.6, 1); o.updateMatrix(); fm.setMatrixAt(i, o.matrix); });
  fm.instanceMatrix.needsUpdate = true; root.add(fm);
  // 大手の門（虹霓門と門楼）
  const g0 = GAPS[0];
  const gy = Math.min(W.heightAt(g0.x, g0.z - 2), W.heightAt(g0.x, g0.z + 2)) - 0.4;
  const gh = gateHouse(M, Math.atan2(20 - 4, 86 - 89) - Math.PI / 2); gh.position.set(g0.x, gy, g0.z); root.add(gh);
  // 頂の将台（石の基壇の上の楼）
  const sx = -4, sz = 128, sy = W.heightAt(sx, sz);
  const base = new THREE.Mesh(new THREE.BoxGeometry(9, 2.4, 7), M.stone); base.position.set(sx, sy + 0.6, sz); root.add(base);
  const jd = pavilion(M, 6, 4.4, 3.2); jd.position.set(sx, sy + 1.8, sz); jd.rotation.y = 0.15; root.add(jd);
  // 壁の角の旗（黄の旗＝朝鮮の軍旗の色・推）
  for (const [x, z] of [[20, 86], [37, 108], [-46, 128], [-52, 104], [8, 148]]) {
    const f = flag(M, 5); f.position.set(x, W.heightAt(x, z) + HW - 0.6, z); f.rotation.y = 0.6; root.add(f);
  }
  return root;
}
