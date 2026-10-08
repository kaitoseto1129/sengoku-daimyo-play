// ======================================================================
// temple1571.js … 元亀二年（1571）の比叡山の伽藍を、軽く・まとめて描く（docs/hiei-1571-spec.md）
//   ・建物は Three.js の基本形とキャンバスの絵（props.js の木肌・瓦・茅・板の材質を使い回す）。外の寺のモデルは使わない
//   ・まとまり（坂本・本坂・東塔・西塔・遠くの谷）×材質ごとに一つの形へまとめる（描く回数を十数回に抑える）
//   ・建物ごとに頂点の範囲を覚えておき、燃えると黒ずみ、燃え落ちると潰れる（形を作り直さない）
//   ・火は建物ごと＋風向きで、一棟→一群→地区へ広がる（55〜57章）。炎と煙は近い数棟だけに付け替えて使い回す
//   ・鐘楼の鐘が鳴ると、その地区と別の地区の守りが警戒する（57章）
//   ・史実の確度の札（hist：HIST_A・HIST_B・GAME_C。62章）は建物の記録（rec.hist）にそのまま持つ
// ======================================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { paintGeo, hipGeo, TILE_MAT, WOOD_MAT, THATCH_MAT, ITA_MAT, varyHex, solidRect, solidCircle, solidSeg, dou, romon, SOLIDS, castleMat } from './props.js';
import { WIND_STATE } from './world.js';
import { sfx } from './audio.js';
import { addInterior, facePanels } from './naka.js';
import { FL } from './floors.js';
import { stoneTex } from './nature.js';

const paint = (g, hex) => paintGeo(g, hex);
const KEEP = new Set(['position', 'normal', 'uv', 'color']);

// ---- 材質（props.js の物を使い回す。瓦・茅・板は頂点の色で黒ずませるため、色を読む写しを一度だけ作る） ----
let MATS = null;
function mats() {
  if (MATS) return MATS;
  const vc = (m, color) => { const c = m.clone(); c.vertexColors = true; if (color !== undefined) c.color = new THREE.Color(color); return c; };
  MATS = {
    wood: WOOD_MAT(),
    tile: vc(TILE_MAT()),
    thatch: vc(THATCH_MAT()),
    ita: vc(ITA_MAT()),
    bark: vc(ITA_MAT(), 0x6a4a36),           // 檜皮葺き（瑠璃堂・社殿）
    plain: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 }),   // 遠くの軽い僧坊
    get plaster() { return castleMat('plaster'); },   // 白壁（漆喰の汚れ・雨だれ・剥げ。本能寺の壁）
    stone: new THREE.MeshStandardMaterial({ vertexColors: true, map: stoneTex(), roughness: 0.96, metalness: 0, envMapIntensity: 0.5 }),   // 石段
  };
  return MATS;
}
// props.js の材質は画質で軽い作りに変わるため lazy()（呼ぶ関数）になっている（a46a61b）。ここも呼んで実の材質を渡す
const BAKE_MK = () => new Map([[WOOD_MAT(), 'wood'], [TILE_MAT(), 'tile'], [THATCH_MAT(), 'thatch'], [ITA_MAT(), 'ita']]);

// ---- 形の小道具（建物の足もと中心・正面 +z の座標で作る） ----
function box(w, h, d, x, y, z, hex, ry = 0) { const g = new THREE.BoxGeometry(w, h, d); if (ry) g.rotateY(ry); g.translate(x, y, z); return paint(g, hex); }
function post(r, h, x, y, z, hex, seg = 6) { const g = new THREE.CylinderGeometry(r * 0.92, r, h, seg, 1, true); g.translate(x, y + h / 2, z); return paint(g, hex); }
function uvScale(g, su, sv) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv); return g; }
// 切妻の屋根の二枚（L：棟の長さ、D：軒から軒、rh：高さ、y：軒の高さ）。uv は 1＝2m（hipGeo と同じ）
function gable(L, D, rh, y, rotY = 0) {
  const s = Math.hypot(D / 2, rh), th = Math.atan2(rh, D / 2), out = [];
  for (const sd of [1, -1]) {
    const g = new THREE.PlaneGeometry(L, s); g.rotateX(-Math.PI / 2); uvScale(g, L / 2, s / 2);
    g.rotateX(sd * th); g.translate(0, y + rh / 2, sd * D / 4);
    if (rotY) g.rotateY(rotY);
    out.push(paint(g, 0xffffff));
  }
  return out;
}
// 妻の三角（切妻・入母屋の妻飾り）。z の所に、幅 w・高さ h、下の高さ y
function tri(w, h, y, z, hex, rotY = 0) {
  const sh = new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(0, h)]);
  const g = new THREE.ShapeGeometry(sh); g.translate(0, y, z);
  const g2 = g.clone(); g2.rotateY(Math.PI); g2.translate(0, 0, 2 * z);   // 裏から見ても抜けない
  const m = mergeGeometries([g.toNonIndexed(), g2.toNonIndexed()]);
  if (rotY) m.rotateY(rotY);
  return paint(m, hex);
}
function hip(ex, ez, rh, y, rl) { return paint(hipGeo(ex, ez, rh, y, rl), 0xffffff); }

// ---- 伽藍 ----
export class Garan {
  constructor(rt) {
    this.rt = rt; this.W = rt.world;
    this.buckets = new Map();
    this.recs = []; this.byId = {};
    this.proxyGeo = new THREE.BoxGeometry(1, 1, 1);
    this.proxyMat = new THREE.MeshBasicMaterial({ visible: false });
    this.mk = BAKE_MK();
  }
  _bucket(dist, mk) {
    const key = dist + '|' + mk;
    let b = this.buckets.get(key);
    if (!b) { b = { key, dist, mk, geos: [], n: 0, mesh: null }; this.buckets.set(key, b); }
    return b;
  }
  // 世界の座標の形を、そのまとまりへ足す（建物の頂点の範囲を覚える）
  _push(rec, mk, g) {
    if (g.index) g = g.toNonIndexed();
    const n = g.attributes.position.count;
    if (!n) return;
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    if (!g.attributes.color) g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
    for (const k of Object.keys(g.attributes)) if (!KEEP.has(k)) g.deleteAttribute(k);
    g.morphAttributes = {}; g.clearGroups();
    const b = this._bucket(rec.dist, mk);
    const start = b.n;
    b.geos.push(g); b.n += n;
    const last = rec.ranges[rec.ranges.length - 1];
    if (last && last.b === b && last.start + last.count === start) last.count += n;
    else rec.ranges.push({ b, start, count: n });
  }
  // 建物の中の座標（足もと中心・正面 +z）の形を足す
  add(rec, mk, g) { if (Array.isArray(g)) { for (const q of g) this.add(rec, mk, q); return; } g.applyMatrix4(rec.M); this._push(rec, mk, g); }
  // props.js の Group（dou・romon など）を、そのまま世界の座標でまとめへ移す
  bake(rec, grp) {
    grp.updateMatrixWorld(true);
    grp.traverse((o) => {
      if (!o.isMesh) return;
      const mk = this.mk.get(o.material);
      if (!mk) return;
      const g = o.geometry.clone(); g.applyMatrix4(o.matrixWorld);
      this._push(rec, mk, g);
    });
  }
  // 建物を一つ作る（b は castles/hiei1571.js の BUILDINGS の一つ）
  build(b) {
    const W = this.W;
    const enter = !b.lite && (b.enterable || b.id === 'konponchudo_1571' || b.id === 'mid_bo_1' || b.id === 'kuri' || b.id === 'todo_kuri');
    const rec = {
      ...b, ranges: [], state: 0, burnT: 0, y0: enter ? templeGroundHeight(W, b) : W.heightAt(b.x, b.z),
      flam: FLAM[b.kind] ?? 0.8, dur: DUR[b.kind] ?? 50, top: 3,
    };
    rec.M = new THREE.Matrix4().makeRotationY(b.rot || 0).setPosition(b.x, rec.y0, b.z);
    // 入れる棟を絞る。谷の遠景まで中を作らず、既存の伽藍・筋書きの位置は動かさない。
    const fn = KINDS[b.kind];
    const solidStart = SOLIDS.length;
    if (enter) buildOpenTemple(this, rec);
    else if (fn) fn(this, rec);
    if (!enter) rec.outerSolids = SOLIDS.slice(solidStart);
    // 門の下や中庭を箱で塞がず、柱・回廊・屋根にだけカメラの当たりを付ける。
    if (!b.lite && ['romon', 'chumon', 'kairo', 'roka', 'torii'].includes(b.kind)) {
      rec.cameraParts = [];
      const cameraBox = (x, y, z, w, h, d) => {
        const p = new THREE.Mesh(this.proxyGeo, this.proxyMat);
        p.scale.set(w, h, d); p.position.set(x, y, z).applyMatrix4(rec.M); p.rotation.y = b.rot || 0;
        p.userData.camBlock = true; p.matrixAutoUpdate = false; p.updateMatrix();
        this.rt.scene.add(p); rec.cameraParts.push(p);
      };
      if (b.kind === 'kairo') {
        for (const sd of [-1, 1]) cameraBox(sd * (b.w / 2 - 1.6), 2.15, 0, 3.2, 4.3, b.d);
        const len = b.w / 2 - 2.6;
        for (const sd of [-1, 1]) cameraBox(sd * (2.6 + len / 2), 2.15, b.d / 2 - 1.6, len, 4.3, 3.2);
      } else if (b.kind === 'romon' || b.kind === 'chumon') {
        const low = b.kind === 'romon' ? 3.6 : 3.4;
        cameraBox(0, (low + rec.top) / 2, 0, b.w + 2, rec.top - low, b.d + 2);
        for (const sd of [-1, 1]) cameraBox(sd * (b.w / 2 + .25), low / 2, 0, .6, low, b.d);
      } else cameraBox(0, rec.top - .6, 0, b.w + .8, 1.2, b.d + .8);
    }
    if (!enter && !b.lite && rec.top > 1.2 && !['romon', 'chumon', 'kairo', 'roka', 'torii'].includes(b.kind)) {
      // カメラが建物にめり込まない当たり（描かない箱。大きな形を毎コマ調べない）
      const p = new THREE.Mesh(this.proxyGeo, this.proxyMat);
      p.scale.set(b.w * 1.08, rec.top * 1.1, b.d * 1.08); p.position.set(b.x, rec.y0 + rec.top * 0.55, b.z);
      p.rotation.y = b.rot || 0;
      p.userData.camBlock = true; p.matrixAutoUpdate = false; p.updateMatrix();
      this.rt.scene.add(p); rec.proxy = p;
    }
    this.recs.push(rec); this.byId[b.id] = rec;
    return rec;
  }
  // 石段：道の急な所（勾配 minG より急）に、道の幅で段を刻む
  stairs(path, pathPoint, o = {}) {
    const rec = { id: 'stairs_' + path.id, kind: 'stairs', hist: 'GAME_C', dist: o.dist || 'path', ranges: [], state: 0, noBurn: true, x: 0, z: 0, w: 1, d: 1 };
    const L = path.L, w = (path.w || 1.6) * 1.8;
    let lastH = -1e9;
    for (let s = o.from || 0; s <= Math.min(L, o.to ?? L); s += 0.7) {
      const q = pathPoint(path, s);
      if (Math.abs(q.grade) < (o.minG ?? 0.3)) continue;
      if (q.h - lastH < 0.16 && q.h >= lastH) continue;
      lastH = q.h;
      // 段は宙に浮いた板にせず、下を斜面へ深く埋めた石の塊（前の段の下へ潜り込む奥行き）。石ごとに少し向きと高さがずれる
      const k = Math.round(s * 3), j = ((k * 37) % 7 - 3) / 3;
      const g = new THREE.BoxGeometry(w * (0.96 + j * 0.03), 1.1, 1.25); g.translate(0, -0.47, -0.15); g.rotateY(q.dir + j * 0.025); g.translate(q.x, q.h + 0.02 + j * 0.02, q.z);
      this._push(rec, 'stone', paint(g, varyHex(k % 3 ? 0x6e695e : 0x645f54, k)));
    }
    this.recs.push(rec);
  }
  // 石灯籠（参道の両脇）
  lantern(x, z, dist) {
    const rec = { id: 'toro', kind: 'toro', hist: 'GAME_C', dist, ranges: [], state: 0, noBurn: true, x, z, w: 1, d: 1 };
    const y = this.W.heightAt(x, z), M = new THREE.Matrix4().makeTranslation(x, y, z);
    const parts = [box(0.5, 0.2, 0.5, 0, 0.1, 0, 0x7e7a70), post(0.11, 0.9, 0, 0.2, 0, 0x8a857a, 6), box(0.5, 0.42, 0.5, 0, 1.3, 0, 0x8e897e), box(0.22, 0.24, 0.52, 0, 1.3, 0, 0x2a2622), box(0.8, 0.14, 0.8, 0, 1.58, 0, 0x7a766c)];
    for (const g of parts) { g.applyMatrix4(M); this._push(rec, 'wood', g); }
    // 足もとの台に沿う丸い当たり。角に歩く向きを引っかけない。
    solidCircle(x, z, 0.25);
    this.recs.push(rec);
  }
  // まとめて描く形にする（まとまり×材質ごとに一つ）
  finish() {
    const M = mats();
    for (const b of this.buckets.values()) {
      if (!b.geos.length) continue;
      const g = mergeGeometries(b.geos);
      b.geos = null;
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, M[b.mk] || M.wood);
      const far = b.dist === 'far' || b.dist === 'saito' || b.dist === 'yokawa';
      m.castShadow = !far; m.receiveShadow = true;
      m.matrixAutoUpdate = false;
      this.rt.scene.add(m);
      b.mesh = m;
    }
    return this;
  }
  stat() {
    let v = 0, calls = 0;
    for (const b of this.buckets.values()) if (b.mesh) { v += b.mesh.geometry.attributes.position.count; calls++; }
    return { buildings: this.recs.filter((r) => r.kind !== 'stairs' && r.kind !== 'toro').length, verts: v, calls };
  }
  // 頂点の色を元の色の k 倍に（燃える・燃えた）
  shade(rec, k) {
    if (!rec.orig) rec.orig = rec.ranges.map((r) => r.b.mesh.geometry.attributes.color.array.slice(r.start * 3, (r.start + r.count) * 3));
    rec.ranges.forEach((r, i) => {
      const A = r.b.mesh.geometry.attributes.color, a = A.array, o = rec.orig[i];
      // 燃えている間は少し赤みが残り、燃え落ちると黒い炭
      const kr = k, kg = k * (k < 0.5 ? 0.85 : 0.95), kb = k * (k < 0.5 ? 0.75 : 0.9);
      for (let j = 0; j < o.length; j += 3) { a[r.start * 3 + j] = o[j] * kr; a[r.start * 3 + j + 1] = o[j + 1] * kg; a[r.start * 3 + j + 2] = o[j + 2] * kb; }
      markRange(A, r.start * 3, r.count * 3);
    });
  }
  // 燃え落ちる：高さを k 倍に潰す
  collapse(rec, k) {
    // 燃え落ちた閉じた棟にも、見えない元の壁を残さない。
    if (rec.outerSolids) for (const v of rec.outerSolids) v.yBot = v.yTop = -1e6;
    if (rec.cameraParts) for (const p of rec.cameraParts) p.visible = false;
    // 崩れた棟に無傷の室内や入口を残さない。床の升目は同じ物を参照している。
    if (rec.naka) {
      rec.naka.disabled = true;
      if (rec.naka.mesh) rec.naka.mesh.visible = false;
      if (rec.openCamera) rec.openCamera.visible = false;
      for (const v of rec.innerSolids) v.yBot = v.yTop = -1e6;
      for (const v of rec.innerDecks) { v.y = -1e6; v.roof = undefined; }
      for (const v of rec.innerRamps) v.ya = v.yb = -1e6;
    }
    rec.ranges.forEach((r) => {
      const A = r.b.mesh.geometry.attributes.position, a = A.array, y0 = rec.y0;
      for (let j = r.start; j < r.start + r.count; j++) a[j * 3 + 1] = y0 + (a[j * 3 + 1] - y0) * k;
      markRange(A, r.start * 3, r.count * 3);
    });
    rec.collapseScale = (rec.collapseScale || 1) * k;
    if (rec.proxy) { rec.proxy.scale.y *= k; rec.proxy.position.y = rec.y0 + rec.top * rec.collapseScale * 0.4; rec.proxy.updateMatrix(); }
  }
}
function markRange(A, start, count) {
  if (A.addUpdateRange) A.addUpdateRange(start, count);
  A.needsUpdate = true;
}

// 燃えやすさ（0〜1）と、燃え落ちるまでの秒。僧坊は燃え移りやすく、大きな堂は遅い（55章）
const FLAM = { sobo: 1, minka: 1, kuri: 1, lite: 1, kura: 0.45, do: 0.6, kodo: 0.5, chudo: 0.42, kairo: 0.7, chumon: 0.6, romon: 0.5, shoro: 0.75, kyozo: 0.5, honden: 0.8, hokora: 0.8, bansho: 0.9, roka: 0.8, rurido: 0, torii: 0, haka: 0 };
const DUR = { sobo: 40, minka: 36, kuri: 45, lite: 40, kura: 60, do: 80, kodo: 120, chudo: 160, kairo: 90, chumon: 70, romon: 90, shoro: 45, kyozo: 70, honden: 70, hokora: 22, bansho: 25, roka: 50 };

// 堂・坊・庫裏の内部。図が残らない間取りは推定。城の石垣や天守は足さない。
function templeGroundHeight(world, b) {
  // 中央だけで床を決めると、平場と道を補間した地面が低い床や戸口の横木へ食い込む。
  // 建物と戸口の踊り場の内側だけを測る。外の斜面で床を必要以上に持ち上げない。
  // 設営時だけ測り、外観・室内の床・石段・燃え落ちる原点を同じ高さにそろえる。
  const step = world.step, half = world.half;
  const c = Math.cos(b.rot || 0), s = Math.sin(b.rot || 0);
  const hw = b.w / 2 + .45, hd = b.d / 2 + .45;
  const rx = hw * Math.abs(c) + hd * Math.abs(s), rz = hw * Math.abs(s) + hd * Math.abs(c);
  let y = world.heightAt(b.x, b.z);
  for (let z = Math.floor((b.z - rz + half) / step) * step - half; z <= b.z + rz + step; z += step) {
    for (let x = Math.floor((b.x - rx + half) / step) * step - half; x <= b.x + rx + step; x += step) {
      const dx = x - b.x, dz = z - b.z;
      if (Math.abs(dx * c - dz * s) > hw || Math.abs(dx * s + dz * c) > hd) continue;
      y = Math.max(y, world.heightAt(x, z));
    }
  }
  // 双線形補間の升目の中に極大は無い。回した外周は升目ごとに二次式なので、
  // 四隅・格子との交点・辺の途中の極大も拾えば、床下の最高点を取りこぼさない。
  const corners = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]]
    .map(([x, z]) => [b.x + x * c + z * s, b.z - x * s + z * c]);
  for (let k = 0; k < 4; k++) {
    const a = corners[k], q = corners[(k + 1) % 4], dx = q[0] - a[0], dz = q[1] - a[1];
    const cuts = [0, 1];
    for (let axis = 0; axis < 2; axis++) {
      const delta = q[axis] - a[axis];
      if (Math.abs(delta) < 1e-8) continue;
      const low = Math.min(a[axis], q[axis]), high = Math.max(a[axis], q[axis]);
      for (let v = Math.ceil((low + half) / step) * step - half; v < high; v += step) {
        const t = (v - a[axis]) / delta;
        if (t > 0 && t < 1) cuts.push(t);
      }
    }
    cuts.sort((a, b) => a - b);
    const at = t => world.heightAt(a[0] + dx * t, a[1] + dz * t);
    for (let j = 1; j < cuts.length; j++) {
      const t0 = cuts[j - 1], t1 = cuts[j], v0 = at(t0), v1 = at(t1), vm = at((t0 + t1) / 2);
      y = Math.max(y, v0, v1);
      const qa = 2 * (v0 + v1 - 2 * vm), qb = v1 - v0 - qa;
      const t = qa < -1e-8 ? -qb / (2 * qa) : -1;
      if (t > 0 && t < 1) y = Math.max(y, at(t0 + (t1 - t0) * t));
    }
  }
  return y;
}

function buildOpenTemple(G, r) {
  const w = r.w, d = r.d, hw = w / 2, hd = d / 2;
  const grand = r.kind === 'chudo', hall = grand || ['hondo', 'kodo', 'do', 'rurido'].includes(r.kind);
  const y = grand ? 1.5 : r.kind === 'kuri' ? .15 : .4;
  const h = grand ? (r.h || 6.2) : r.h || (hall ? 3.4 : 2.5), door = Math.min(2.8, w * .45);
  // 同じ窓の寸法を外壁と室内の当たりへ渡す。外に壁がある所を窓として通さない。
  const windows = [
    { face: 'z', s: -1, t: 0, w: Math.min(1.8, w * .3), y0: 1.0, y1: 1.8 },
    { face: 'x', s: -1, t: 0, w: Math.min(1.5, d * .3), y0: 1.0, y1: 1.8 },
    { face: 'x', s: 1, t: 0, w: Math.min(1.5, d * .3), y0: 1.0, y1: 1.8 },
  ];
  const si = SOLIDS.length, di = FL.decks.length, ri = FL.ramps.length;
  r.naka = addInterior(G.W, { name: r.name || (r.kind === 'kuri' ? '庫裏' : '僧坊'), kind: hall ? (grand ? 'chudo' : 'hondo') : r.kind,
    profile: 'hiei', x: r.x, z: r.z, rot: r.rot || 0, levels: [{ w, d, h, y: r.y0 + y + .06 }], door: { w: door, h: 2.2 }, wins: () => windows, approach: { pad: .25, len: grand ? 3.2 : 1.8 } });
  r.innerSolids = SOLIDS.slice(si); r.innerDecks = FL.decks.slice(di); r.innerRamps = FL.ramps.slice(ri);
  const P = [];
  P.push(box(w, y + 2, d, 0, (y - 2) / 2, 0, 0x756e60));
  P.push(box(w, .12, d, 0, y, 0, 0x5a4230));
  for (const face of ['x', 'z']) for (const side of [-1, 1]) {
    const len = face === 'z' ? w : d;
    const holes = windows.filter((v) => v.face === face && v.s === side).map((v) => ({ t0: v.t - v.w / 2, t1: v.t + v.w / 2, y0: v.y0 + .06, y1: v.y1 + .06 }));
    if (face === 'z' && side === 1) holes.push({ t0: -door / 2, t1: door / 2, y0: 0, y1: Math.min(h, 2.26) });
    for (const [t0, t1, y0, y1] of facePanels(len, h, holes)) {
      const mid = (t0 + t1) / 2, cy = y + (y0 + y1) / 2;
      P.push(face === 'z' ? box(t1 - t0, y1 - y0, .12, mid, cy, side * hd, 0x6e5840) : box(.12, y1 - y0, t1 - t0, side * hw, cy, mid, 0x6e5840));
    }
  }
  for (const x of [-hw, hw]) for (const z of [-hd, hd]) P.push(box(.22, h, .22, x, y + h / 2, z, 0x4a3020));
  if (grand) {
    // 九間の柱列と深い軒。中央の戸口だけを開け、江戸期の現存堂は写さない。
    const ox = hw + 1.2, oz = hd + 1.2;
    for (let i = 0; i <= 9; i++) for (const sd of [-1, 1]) P.push(post(.3, h + .5, -ox + i * ox * 2 / 9, y, sd * oz, 0x5a3e2a));
    P.push(box(w + .6, .5, d + .6, 0, y + h + .25, 0, 0x3a2a1c));
    P.push(box(w, .65, .14, 0, y + h - .325, hd, 0xd2c9b2));
  }
  G.add(r, 'wood', P);
  // 開いた戸口・窓を保った外壁そのものを、カメラの当たりにも使う。
  r.openCamera = new THREE.Mesh(mergeGeometries(P), G.proxyMat);
  r.openCamera.userData.camBlock = true;
  r.openCamera.matrixAutoUpdate = false;
  G.rt.scene.add(r.openCamera);
  if (grand || hall) {
    const ex = hw + (grand ? 3.8 : 1.5), ez = hd + (grand ? 3.8 : 1.5), rh = ez * .8;
    G.add(r, r.roof || 'tile', hip(ex, ez, rh, y + h + .4, hw * .5));
    r.top = y + h + .4 + rh;
  } else {
    const rh = (hd + .8) * .65;
    G.add(r, r.kind === 'kuri' || r.var === 2 ? 'thatch' : 'ita', gable(w + 1.2, d + 1.6, rh, y + h + .15));
    r.top = y + h + .15 + rh;
  }

}

// ---- 建物の形 ----
const KINDS = {
  // 根本中堂（1571年版の推定。今の1642年の堂は写さない）：高い基壇・縁・柱の列・蔀戸・深い軒の大屋根（入母屋）。東塔でいちばん大きい
  chudo(G, r) {
    const w = r.w, d = r.d, H = r.h || 6.2, y0 = 1.5;
    solidRect(r.x, r.z, w + 5, d + 5, r.rot || 0);
    const P = [];
    P.push(box(w + 5, 3.6, d + 5, 0, y0 - 1.8, 0, 0x8a857a));                      // 石の基壇
    P.push(box(w + 3, 0.16, d + 3, 0, y0 + 0.08, 0, 0x4e3826));                      // 縁
    for (let s = 0; s < 6; s++) P.push(box(6, 0.25, 0.5, 0, 0.12 + s * 0.25, d / 2 + 2.5 + (5 - s) * 0.42, 0x7a756a));   // 正面の階
    P.push(box(w, H * 0.68, d, 0, y0 + H * 0.34, 0, 0x4a3020));                       // 身舎（下）
    P.push(box(w + 0.05, H * 0.32, d + 0.05, 0, y0 + H * 0.84, 0, 0xd2c9b2));         // 白い小壁
    P.push(box(w + 0.6, 0.5, d + 0.6, 0, y0 + H + 0.25, 0, 0x3a2a1c));               // 組物の帯
    // 正面の蔀戸（九間）：格子の板と、中央三間は開いて内陣の灯が見える
    const nb = 9, bw = w / nb;
    for (let i = 0; i < nb; i++) {
      const cx = -w / 2 + bw * (i + 0.5), open = Math.abs(i - 4) <= 1;
      P.push(box(bw - 0.12, H * 0.62, 0.08, cx, y0 + H * 0.31, d / 2 + 0.04, 0x2c2016));
      if (!open) for (let k = 1; k < 4; k++) P.push(box(0.06, H * 0.62, 0.1, cx - bw / 2 + k * bw / 4, y0 + H * 0.31, d / 2 + 0.08, 0x4a3422));
      else P.push(box(bw * 0.5, 0.5, 0.3, cx, y0 + 1.1, d / 2 - 1.2, 0xc8a050));   // 灯明の金の照り（内陣）
    }
    // 柱の列（外まわり）
    const ox = w / 2 + 1.2, oz = d / 2 + 1.2, nx = Math.round(2 * ox / 2.6), nz = Math.round(2 * oz / 2.6);
    for (let i = 0; i <= nx; i++) for (const sz of [-1, 1]) P.push(post(0.3, H + 0.5, -ox + i * 2 * ox / nx, y0, sz * oz, varyHex(0x5a3e2a, i)));
    for (let i = 1; i < nz; i++) for (const sx of [-1, 1]) P.push(post(0.3, H + 0.5, sx * ox, y0, -oz + i * 2 * oz / nz, varyHex(0x5a3e2a, i + 9)));
    G.add(r, 'wood', P);
    const ey = y0 + H + 0.9, ex = w / 2 + 3.8, ez = d / 2 + 3.8, rh = ez * 0.95, rl = w / 2 * 0.5;
    G.add(r, 'tile', hip(ex, ez, rh, ey, rl));
    // 入母屋の妻（棟の両端の三角）と棟・鬼瓦
    const gy = ey + rh * 0.55, gh = rh * 0.45;
    G.add(r, 'wood', [tri(ez * 0.9, gh, gy, 0, 0x3a2a1c, Math.PI / 2).translate(rl + 0.9, 0, 0), tri(ez * 0.9, gh, gy, 0, 0x3a2a1c, Math.PI / 2).translate(-rl - 0.9, 0, 0)]);
    G.add(r, 'wood', [box(2 * rl + 2.4, 0.7, 0.9, 0, ey + rh + 0.2, 0, 0x22201e), box(0.9, 1.3, 1.1, rl + 1.2, ey + rh + 0.4, 0, 0x1c1a18), box(0.9, 1.3, 1.1, -rl - 1.2, ey + rh + 0.4, 0, 0x1c1a18)]);
    r.top = ey + rh + 1;
  },
  // 廻廊：中庭の三方を囲む屋根付きの廊下（外は壁と連子窓、内は柱だけ）。正面の真ん中は中門のために空ける。奥は中堂につながる
  kairo(G, r) {
    const W2 = r.w / 2, D2 = r.d / 2, cw = 3.2, gap = 2.6;
    // 廊下の中心線（建物の中の座標）：左右（±x）と、正面（+z）の二つ
    const runs = [[-W2 + cw / 2, -D2, -W2 + cw / 2, D2 - cw / 2, -1], [W2 - cw / 2, -D2, W2 - cw / 2, D2 - cw / 2, 1],
      [-W2 + cw, D2 - cw / 2, -gap, D2 - cw / 2, 2], [gap, D2 - cw / 2, W2 - cw, D2 - cw / 2, 2]];
    const c = Math.cos(r.rot || 0), sn = Math.sin(r.rot || 0), wx = (lx, lz) => [r.x + lx * c + lz * sn, r.z - lx * sn + lz * c];
    for (const [ax, az, bx, bz, side] of runs) {
      const L = Math.hypot(bx - ax, bz - az), ang = Math.atan2(bx - ax, bz - az), mx = (ax + bx) / 2, mz = (az + bz) / 2;
      const P = [];
      const along = new THREE.Matrix4().makeRotationY(ang).setPosition(mx, 0, mz);
      const loc = [];
      loc.push(box(cw + 0.4, 0.5, L + 0.4, 0, -0.1, 0, 0x8a857a));   // 基壇
      loc.push(box(cw, 0.1, L, 0, 0.2, 0, 0x5a4230));                // 床
      const n = Math.max(2, Math.round(L / 2.4));
      for (let i = 0; i <= n; i++) for (const sx of [-1, 1]) loc.push(post(0.16, 2.7, sx * cw / 2, 0.25, -L / 2 + i * L / n, varyHex(0x5e4230, i), 6));
      // 外側の壁：下は板、上は連子窓
      const wallX = side === 2 ? -cw / 2 : side * cw / 2;
      loc.push(box(0.14, 1.3, L, wallX, 0.9, 0, 0x5a3e2a), box(0.12, 0.7, L, wallX, 1.9, 0, 0x3a2a1c), box(0.14, 0.45, L, wallX, 2.55, 0, 0xcdc4b0));
      for (const g of loc) { g.applyMatrix4(along); P.push(g); }
      G.add(r, 'wood', P);
      const rf = gable(L + 0.8, cw + 2, 1.3, 2.95, 0);
      for (const g of rf) { g.rotateY(Math.PI / 2); g.applyMatrix4(along); }
      G.add(r, 'tile', rf);
      // 当たり：外の壁の線
      const s = side === 2 ? 1 : side;
      const oa = side === 2 ? wx(ax, az + cw / 2) : wx(ax + s * cw / 2, az), ob = side === 2 ? wx(bx, bz + cw / 2) : wx(bx + s * cw / 2, bz);
      solidSeg(oa[0], oa[1], ob[0], ob[1], 0.25);
    }
    r.top = 4.3;
  },
  // 中門（八脚門）：一重の門。四本の本柱と八本の控え柱、入母屋の屋根
  chumon(G, r) {
    const w = r.w, d = r.d, H = 3.4, P = [];
    P.push(box(w + 1.6, 0.4, d + 0.8, 0, 0.0, 0, 0x8a857a));
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 0, 1]) P.push(post(0.24, H, sx * (w / 2 + 0.2), 0.2, sz * d / 2.4, 0x5e4230, 8));
      P.push(box(0.18, H * 0.8, d * 0.8, sx * (w / 2 + 0.25), 0.2 + H * 0.4, 0, 0xcdc4b0));
    }
    P.push(box(w + 1.2, 0.3, 0.3, 0, H + 0.1, d / 2.4, 0x4e3624), box(w + 1.2, 0.3, 0.3, 0, H + 0.1, -d / 2.4, 0x4e3624));
    G.add(r, 'wood', P);
    G.add(r, 'tile', hip(w / 2 + 2.2, d / 2 + 1.6, 1.8, H + 0.4, w / 2 * 0.5));
    G.add(r, 'wood', box(w * 0.6 + 0.8, 0.35, 0.45, 0, H + 2.3, 0, 0x222120));
    const c = Math.cos(r.rot || 0), sn = Math.sin(r.rot || 0);
    for (const sx of [-1, 1]) { const lx = sx * (w / 2 + 0.25); solidSeg(r.x + lx * c + (-d / 2) * sn, r.z - lx * sn + (-d / 2) * c, r.x + lx * c + (d / 2) * sn, r.z - lx * sn + (d / 2) * c, 0.3); }
    r.top = H + 2.6;
  },
  // 文殊楼（室町末期の楼門として推定。今の江戸の建物は写さない）：props.js の楼門（二階・高欄・二重の屋根）を使い回す
  romon(G, r) { G.bake(r, romon(G.W, r.x, r.z, r.w, r.rot || 0)); r.top = 9; },
  // 講堂・大堂（大講堂・西塔の釈迦堂の前身）
  kodo(G, r) { G.bake(r, dou(G.W, r.x, r.z, r.w, r.d, r.rot || 0, { h: r.h || 4.6 })); r.top = (r.h || 4.6) + 1.5 + (r.d / 2 + 2.4) * 0.8; },
  // 中くらいの堂（中腹の小堂・戒壇院・浄土院・常行堂・法華堂）
  do(G, r) { G.bake(r, dou(G.W, r.x, r.z, r.w, r.d, r.rot || 0, { h: r.h || 3.2 })); r.top = (r.h || 3.2) + 1.5 + (r.d / 2 + 2.4) * 0.8; },
  // 経蔵：高床の小さな方形の蔵
  kyozo(G, r) {
    const w = r.w, H = 2.8, P = [];
    solidRect(r.x, r.z, w + 1, w + 1, r.rot || 0);
    P.push(box(w + 1, 0.8, w + 1, 0, 0.1, 0, 0x8a857a), box(w, H, w, 0, 0.5 + H / 2, 0, 0x5a3e2a), box(w + 0.04, 0.7, w + 0.04, 0, 0.5 + H - 0.35, 0, 0xcfc6b2), box(1.4, 1.9, 0.08, 0, 1.45, w / 2 + 0.04, 0x1c1610));
    G.add(r, 'wood', P);
    G.add(r, 'tile', hip(w / 2 + 1.5, w / 2 + 1.5, 2.2, 0.5 + H + 0.2, 0.25));
    r.top = H + 3;
  },
  // 鐘楼：四本柱に梁、釣り鐘（鳴ると警戒）。倒れうる（55章）
  shoro(G, r) {
    const w = r.w, d = r.d, H = 3.2, P = [];
    solidRect(r.x, r.z, w + 0.6, d + 0.6, r.rot || 0);
    P.push(box(w + 1.4, 0.5, d + 1.4, 0, 0.05, 0, 0x8a857a));
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) P.push(post(0.18, H, sx * w / 2, 0.3, sz * d / 2, 0x5e4a34, 8));
    P.push(box(w + 0.4, 0.22, 0.22, 0, H + 0.2, d / 2, 0x3a2c1c), box(w + 0.4, 0.22, 0.22, 0, H + 0.2, -d / 2, 0x3a2c1c), box(0.22, 0.22, d + 0.4, 0, H + 0.25, 0, 0x3a2c1c));
    const bell = new THREE.CylinderGeometry(0.5, 0.62, 1.4, 12, 1, false); bell.translate(0, H - 0.6, 0); P.push(paint(bell, 0x3a3226));
    const top = new THREE.SphereGeometry(0.5, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2); top.translate(0, H + 0.1, 0); P.push(paint(top, 0x3a3226));
    P.push(post(0.06, 1.2, 0.9, H - 1.3, 0, 0x8a7a50, 5));   // 撞木の綱
    G.add(r, 'wood', P);
    G.add(r, 'tile', hip(w / 2 + 1.3, d / 2 + 1.2, 1.7, H + 0.35, 0.3));
    r.top = H + 2.2;
    r.bellAt = { x: r.x, z: r.z };
  },
  // 僧坊（三つの姿）：0 瓦の寄棟・1 板葺きの切妻・2 茅葺きの切妻。低い床・縁・土間・薪
  sobo(G, r) {
    const w = r.w, d = r.d, H = 2.5, v = r.var || 0, P = [];
    solidRect(r.x, r.z, w + 0.3, d + 0.3, r.rot || 0);
    const wall = [0x6e5840, 0x7b6448, 0x655340][v];
    P.push(box(w + 0.3, 2.6, d + 0.3, 0, -0.9, 0, 0x7e7a70));   // 石の基礎（斜面の平場の縁でも浮かないよう深く）
    P.push(uvScale(box(w, H, d, 0, 0.4 + H / 2, 0, wall), w / 2, 1.2));
    if (v !== 2) P.push(box(w + 0.03, 0.55, d + 0.03, 0, 0.4 + H - 0.3, 0, 0xcfc6b0));
    P.push(box(w + 0.6, 0.12, 1.0, 0, 0.62, d / 2 + 0.5, 0x5a4230));                // 縁
    P.push(box(1.0, 1.75, 0.05, -w * 0.28, 0.45 + 0.88, d / 2 + 0.03, 0x51402c));   // 入れない坊は板戸を閉める
    P.push(box(w * 0.42, 1.2, 0.05, w * 0.12, 0.62 + 0.7, d / 2 + 0.03, 0xd8d0bc)); // 障子
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) P.push(box(0.16, H + 0.2, 0.16, sx * w / 2, 0.4 + H / 2, sz * d / 2, 0x4a3826));
    P.push(box(1.6, 0.7, 0.6, w / 2 + 0.6, 0.35, -d * 0.2, 0x6a5038));            // 薪
    G.add(r, 'wood', P);
    const ey = 0.4 + H + 0.05;
    if (v === 0) G.add(r, 'tile', hip(w / 2 + 1, d / 2 + 1, (d / 2 + 1) * 0.75, ey, w / 2 * 0.4));
    else {
      const rh = v === 2 ? (d / 2 + 0.8) * 0.95 : (d / 2 + 0.8) * 0.55;
      G.add(r, v === 2 ? 'thatch' : 'ita', gable(w + 1.2, d + 1.6, rh, ey));
      G.add(r, 'wood', [tri(d, rh * 0.93, ey, w / 2 + 0.01, wall, Math.PI / 2), tri(d, rh * 0.93, ey, -w / 2 - 0.01, wall, Math.PI / 2), box(w + 1.3, 0.22, 0.3, 0, ey + rh + 0.05, 0, 0x3a2c1c)]);
    }
    r.top = ey + d / 2 + 1;
  },
  // 民家（坂本の家）：低い土壁と茅葺きの切妻
  minka(G, r) {
    const w = r.w, d = r.d, H = 2.2, P = [];
    solidRect(r.x, r.z, w + 0.3, d + 0.3, r.rot || 0);
    P.push(box(w + 0.2, 2.4, d + 0.2, 0, -1.05, 0, 0x6e6658), uvScale(box(w, H, d, 0, 0.15 + H / 2, 0, 0x7b6448), w / 2, 1));
    P.push(box(1.1, 1.7, 0.05, 0, 0.15 + 0.85, d / 2 + 0.03, 0x51402c), box(1.4, 0.8, 0.6, -w / 2 - 0.5, 0.4, 0, 0x6a5038));
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) P.push(box(0.15, H, 0.15, sx * w / 2, 0.15 + H / 2, sz * d / 2, 0x4a3826));
    G.add(r, 'wood', P);
    const ey = 0.15 + H, rh = (d / 2 + 0.9) * 1.05;
    G.add(r, 'thatch', gable(w + 1.4, d + 1.8, rh, ey));
    G.add(r, 'wood', [tri(d, rh * 0.93, ey, w / 2 + 0.01, 0x7b6448, Math.PI / 2), tri(d, rh * 0.93, ey, -w / 2 - 0.01, 0x7b6448, Math.PI / 2), box(w + 1.5, 0.3, 0.4, 0, ey + rh + 0.05, 0, 0x4a3c2c)]);
    r.top = ey + rh;
  },
  // 倉：白い土壁と瓦の切妻（燃えにくい）
  kura(G, r) {
    const w = r.w, d = r.d, H = 2.8, P = [];
    solidRect(r.x, r.z, w + 0.3, d + 0.3, r.rot || 0);
    P.push(box(w + 0.3, 0.6, d + 0.3, 0, 0.0, 0, 0x6e6a62), box(w, H, d, 0, 0.3 + H / 2, 0, 0xd9d2c0), box(w + 0.04, 0.8, d + 0.04, 0, 0.7, 0, 0x3a3632), box(1.0, 1.6, 0.08, 0, 1.1, d / 2 + 0.04, 0x2a2622));
    G.add(r, 'wood', P);
    const ey = 0.3 + H, rh = (d / 2 + 0.6) * 0.6;
    G.add(r, 'tile', gable(w + 0.9, d + 1.2, rh, ey));
    G.add(r, 'wood', [tri(d, rh * 0.95, ey, w / 2 + 0.02, 0xd9d2c0, Math.PI / 2), tri(d, rh * 0.95, ey, -w / 2 - 0.02, 0xd9d2c0, Math.PI / 2), box(w + 1, 0.3, 0.35, 0, ey + rh + 0.05, 0, 0x22201e)]);
    r.top = ey + rh;
  },
  // 厨房（庫裏）：大きな茅の切妻と、棟の煙出し
  kuri(G, r) {
    KINDS.minka(G, r);
    const ey = 0.15 + 2.2, rh = (r.d / 2 + 0.9) * 1.05;
    G.add(r, 'thatch', gable(1.6, 1.4, 0.6, ey + rh + 0.2));
    G.add(r, 'wood', box(1.2, 0.5, 1.0, 0, ey + rh + 0.15, 0, 0x4a3c2c));
    r.top = ey + rh + 0.8;
  },
  // 祠・摂社：石の台に小さな社と板の屋根
  hokora(G, r) {
    const w = r.w, d = r.d, s = Math.min(1, w / 3), P = [];
    solidRect(r.x, r.z, w + 0.3, d + 0.3, r.rot || 0);
    P.push(box(w + 0.4, 0.5, d + 0.4, 0, 0.1, 0, 0x7e7a70), box(w * 0.7, 1.1 * s + 0.4, d * 0.7, 0, 0.35 + (1.1 * s + 0.4) / 2, 0, 0x6a4a30));
    G.add(r, 'wood', P);
    const ey = 0.35 + 1.1 * s + 0.4;
    G.add(r, 'ita', gable(w * 0.9 + 0.3, d * 0.9 + 0.5, 0.5 + 0.4 * s, ey));
    r.top = ey + 0.9;
  },
  // 日吉社の鳥居（山王鳥居）：笠木の上に合掌（三角）を載せた形
  torii(G, r) {
    const w = r.w, H = 4.6, P = [];
    for (const sx of [-1, 1]) {
      const y = G.W.heightAt(r.x + Math.cos(r.rot || 0) * sx * w / 2, r.z - Math.sin(r.rot || 0) * sx * w / 2) - r.y0;
      P.push(post(0.24, H - y + 0.3, sx * w / 2, y - 0.3, 0, 0x9a3a24, 10));
      solidCircle2(r, sx * w / 2, 0, 0.24);
    }
    P.push(box(w + 1.8, 0.32, 0.5, 0, H + 0.25, 0, 0x1e1a18), box(w + 1.2, 0.28, 0.36, 0, H - 0.1, 0, 0x9a3a24), box(w + 0.6, 0.24, 0.24, 0, H - 0.95, 0, 0x9a3a24));
    for (const sx of [-1, 1]) { const g = new THREE.BoxGeometry(0.2, 1.3, 0.2); g.rotateZ(-sx * 0.8); g.translate(sx * 0.42, H + 0.85, 0); P.push(paint(g, 0x9a3a24)); }
    G.add(r, 'wood', P);
    r.top = H + 1.2;
  },
  // 日吉社の社殿（推定）：高い床の社殿に檜皮葺きの屋根
  honden(G, r) {
    const w = r.w, d = r.d, H = 3.0, P = [];
    solidRect(r.x, r.z, w + 1.6, d + 1.6, r.rot || 0);
    P.push(box(w + 1.6, 0.5, d + 1.6, 0, 0.05, 0, 0x7e7a70), box(w + 1.2, 0.12, d + 1.2, 0, 1.0, 0, 0x5a3a26));
    P.push(box(w, H, d, 0, 1.0 + H / 2, 0, 0x8e3a26), box(w + 0.04, 0.6, d + 0.04, 0, 1.0 + H - 0.3, 0, 0xe0d6c0), box(w * 0.5, H * 0.6, 0.06, 0, 1.0 + H * 0.3, d / 2 + 0.03, 0x1a120c));
    for (let i = 0; i <= 4; i++) for (const sz of [-1, 1]) P.push(post(0.15, H + 1, -w / 2 - 0.4 + i * (w + 0.8) / 4, 0.3, sz * (d / 2 + 0.4), 0x8e3a26, 6));
    G.add(r, 'wood', P);
    G.add(r, 'bark', hip(w / 2 + 2, d / 2 + 2.2, (d / 2 + 2.2) * 0.8, 1.0 + H + 0.4, w / 2 * 0.5));
    r.top = 1 + H + 4;
  },
  // 見張り台（番所。GAME_C）：木の四本柱の低い台。立派な物見櫓にしない（36〜39章）
  bansho(G, r) {
    const w = r.w, H = 2.6, P = [];
    solidRect(r.x, r.z, w + 0.2, w + 0.2, r.rot || 0);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) P.push(post(0.1, H + 1.4, sx * w / 2, 0, sz * w / 2, 0x6a5a44, 5));
    P.push(box(w + 0.3, 0.1, w + 0.3, 0, H, 0, 0x6a5a40), box(w + 0.3, 0.5, 0.06, 0, H + 0.35, w / 2, 0x5a4a34), box(w + 0.3, 0.5, 0.06, 0, H + 0.35, -w / 2, 0x5a4a34));
    G.add(r, 'wood', P);
    G.add(r, 'ita', gable(w + 0.8, w + 0.8, 0.6, H + 1.4));
    r.top = H + 2;
  },
  // 墓所：墓石と五輪塔（燃えない）
  haka(G, r) {
    const P = [];
    let k = 0;
    for (let i = -2; i <= 2; i++) for (let j = -1; j <= 1; j++) {
      if ((i * 7 + j * 3 + 10) % 4 === 0) continue;
      const x = i * r.w / 5, z = j * r.d / 3, s = 0.8 + ((k++ * 37) % 10) / 25;
      if (k % 3 === 0) { P.push(box(0.5 * s, 0.4 * s, 0.5 * s, x, 0.2 * s, z, 0x7a766c)); const sp = new THREE.SphereGeometry(0.26 * s, 7, 5); sp.translate(x, 0.62 * s, z); P.push(paint(sp, 0x837e72)); P.push(box(0.55 * s, 0.22 * s, 0.55 * s, x, 0.95 * s, z, 0x7a766c)); }
      else P.push(box(0.36 * s, 0.9 * s, 0.24 * s, x, 0.45 * s, z, varyHex(0x7e7a70, k)));
    }
    G.add(r, 'wood', P);
    r.top = 1;
  },
  // にない堂の廊下（常行堂と法華堂をつなぐ）
  roka(G, r) {
    const w = r.w, d = r.d, P = [];
    P.push(box(w + 0.3, 0.4, d, 0, 0.0, 0, 0x8a857a), box(w, 0.1, d, 0, 0.25, 0, 0x5a4230));
    const n = Math.round(d / 2.3);
    for (let i = 0; i <= n; i++) for (const sx of [-1, 1]) P.push(post(0.14, 2.5, sx * w / 2, 0.25, -d / 2 + i * d / n, 0x5e4230, 6));
    G.add(r, 'wood', P);
    G.add(r, 'tile', gable(d + 0.6, w + 1.6, 1.0, 2.75).map((g) => g.rotateY(Math.PI / 2)));
    r.top = 3.8;
  },
  // 瑠璃堂（室町後期・焼き討ちを免れた唯一の堂。1571年の姿の手本として、方三間・入母屋・檜皮葺きを丁寧に）
  rurido(G, r) {
    const w = r.w, d = r.d, H = 3.0, y0 = 0.9, P = [];
    solidRect(r.x, r.z, w + 2.2, d + 2.2, r.rot || 0);
    P.push(box(w + 2.4, 1.6, d + 2.4, 0, y0 - 0.9, 0, 0x7e7a70), box(w + 1.8, 0.12, d + 1.8, 0, y0 + 0.06, 0, 0x5a4230));
    P.push(box(w, H, d, 0, y0 + H / 2, 0, 0x5c4430), box(w + 0.03, 0.5, d + 0.03, 0, y0 + H - 0.25, 0, 0xd4cab4));
    // 方三間：正面の三間に板扉、柱は面取りの角柱に見える八角
    for (let i = 0; i <= 3; i++) for (const sz of [-1, 1]) P.push(post(0.17, H + 0.35, -w / 2 + i * w / 3, y0, sz * d / 2, 0x6a4a30, 8));
    for (let i = 1; i < 3; i++) for (const sx of [-1, 1]) P.push(post(0.17, H + 0.35, sx * w / 2, y0, -d / 2 + i * d / 3, 0x6a4a30, 8));
    for (let i = 0; i < 3; i++) P.push(box(w / 3 - 0.4, H * 0.62, 0.06, -w / 2 + w / 3 * (i + 0.5), y0 + H * 0.33, d / 2 + 0.04, 0x3a2418));
    P.push(box(w + 0.5, 0.35, d + 0.5, 0, y0 + H + 0.2, 0, 0x3a2a1c));
    for (let s = 0; s < 4; s++) P.push(box(2, 0.22, 0.45, 0, 0.11 + s * 0.22, d / 2 + 1.3 + (3 - s) * 0.4, 0x7a756a));
    G.add(r, 'wood', P);
    const ey = y0 + H + 0.55, ex = w / 2 + 1.9, ez = d / 2 + 1.9, rh = ez * 0.95, rl = w / 2 * 0.42;
    G.add(r, 'bark', hip(ex, ez, rh, ey, rl));
    const gy = ey + rh * 0.5, gh = rh * 0.5;
    G.add(r, 'wood', [tri(ez * 0.85, gh, gy, 0, 0x4a3422, Math.PI / 2).translate(rl + 0.6, 0, 0), tri(ez * 0.85, gh, gy, 0, 0x4a3422, Math.PI / 2).translate(-rl - 0.6, 0, 0), box(2 * rl + 1.6, 0.35, 0.5, 0, ey + rh + 0.1, 0, 0x3a2a1c)]);
    r.top = ey + rh + 0.5;
  },
  // 遠くの谷の僧坊（軽い作り：箱と板の屋根だけ。当たりも影も無し）
  lite(G, r) {
    const w = r.w, d = r.d, H = 2.4;
    G.add(r, 'plain', [box(w, H, d, 0, H / 2 - 0.3, 0, varyHex(0x6e5840, r.var || 0)), box(w + 0.03, 0.5, d + 0.03, 0, H - 0.55, 0, 0xc6bea8)]);
    const rh = (d / 2 + 0.8) * 0.7, ey = H - 0.3;
    const rf = gable(w + 1.2, d + 1.6, rh, ey);
    for (const g of rf) { const c = g.attributes.color.array; for (let i = 0; i < c.length; i += 3) { c[i] = 0.28; c[i + 1] = 0.27; c[i + 2] = 0.26; } }
    G.add(r, 'plain', rf);
    r.top = ey + rh;
  },
};
function solidCircle2(r, lx, lz, rad) {
  const c = Math.cos(r.rot || 0), sn = Math.sin(r.rot || 0);
  solidCircle(r.x + lx * c + lz * sn, r.z - lx * sn + lz * c, rad);
}

// ======================================================================
// 火：建物ごと＋風向き（55〜57章）
//   一棟が燃えると、近い棟へ（風下ほど遠くまで・燃えやすい棟ほど）燃え移る。僧坊の群れ→谷→地区と広がる。
//   炎は近い数棟だけ（iPhone）。煙の柱も決まった数を、燃えている大きな棟・近い棟へ付け替える
// ======================================================================
export function makeTempleFire(rt, G, o = {}) {
  const W = rt.world;
  const MAXF = o.flames ?? 5, MAXS = o.smokes ?? 12;
  const flames = [], smokes = [];
  let tAcc = 0, tSpread = 0;
  const burning = () => G.recs.filter((r) => r.state === 1);
  const canBurn = (r) => r.state === 0 && !r.noBurn && (r.flam || 0) > 0;

  function ignite(rec, why) {
    if (typeof rec === 'string') rec = G.byId[rec];
    if (!rec || !canBurn(rec)) return false;
    rec.state = 1; rec.burnT = 0; rec.why = why || '';
    G.shade(rec, 0.8);
    if (o.onIgnite) o.onIgnite(rec);
    return true;
  }
  // 炎・煙の柱を、ある所から別の所へ付け替える（作り直さず使い回す。煙の柱の数には限りがある）
  function moveSmoke(id, x, y, z, size) {
    const S = W.smokeCol;
    if (!S || id == null) return;
    for (let k = 0; k < S.PER; k++) { const i = id * S.PER + k; S.pos[i * 3] = x; S.pos[i * 3 + 1] = y; S.pos[i * 3 + 2] = z; S.seed[i * 2 + 1] = size; }
    S.pts.geometry.attributes.position.needsUpdate = true; S.pts.geometry.attributes.seed.needsUpdate = true;
  }
  function smokeRoom() { const S = W.smokeCol; return !S || S.n < S.CAP - 6; }
  function placeFlame(f, rec) {
    f.lit = !!rec;
    if (!rec) { f.rec = null; f.x = 1e5; f.z = 1e5; f.flame.position.set(1e5, -999, 1e5); f.inner.position.set(1e5, -999, 1e5); if (f.glow) f.glow.position.set(1e5, -999, 1e5); moveSmoke(f.smoke, 1e5, -9999, 1e5, 1); return; }
    const size = Math.min(4.2, 1.8 + Math.sqrt(rec.w * rec.d) * 0.16);
    const y = rec.y0 + Math.max(1, (rec.top || 3) * (rec.state === 1 ? 0.45 : 0.2));
    f.rec = rec; f.x = rec.x; f.z = rec.z; f.size = size; f.base = y + size * 0.35; f.ly = f.base - rec.y0 + size * 0.3;
    f.flame.position.set(rec.x, f.base, rec.z); f.inner.position.set(rec.x, f.base - size * 0.08, rec.z);
    if (f.glow) { f.glow.position.set(rec.x, rec.y0 + 0.08, rec.z); f.glow.scale.setScalar(7 * Math.max(1, size / 1.3)); }
    moveSmoke(f.smoke, rec.x, f.base + size * 0.5, rec.z, Math.min(4, size * 0.95));
  }
  function assign() {
    const P = rt.player && rt.player.u ? rt.player.u.pos : { x: 0, z: 0 };
    const B = burning().map((r) => ({ r, s: (Math.sqrt(r.w * r.d) / 6) / (1 + Math.hypot(r.x - P.x, r.z - P.z) / 35) })).sort((a, b) => b.s - a.s);
    // 炎：近い・大きい棟から決まった数だけ。夜は遠い火も見せる。
    const fireReach = W.timeKey === 'night' || W.timeKey === 'dusk' ? 420 : 110;
    const wantF = B.filter((q) => Math.hypot(q.r.x - P.x, q.r.z - P.z) < fireReach).slice(0, MAXF).map((q) => q.r);
    while (flames.length < wantF.length && smokeRoom()) { const f = W.addFire(1e5, 1e5, { size: 3 }); flames.push(f); placeFlame(f, null); }
    const keep = new Set();
    for (const f of flames) if (f.rec && wantF.includes(f.rec) && f.rec.state === 1) keep.add(f.rec); else if (f.rec) placeFlame(f, null);
    for (const r of wantF) { if (keep.has(r)) continue; const f = flames.find((q) => !q.rec); if (!f) break; placeFlame(f, r); keep.add(r); }
    // 煙の柱：炎の付かない燃えている棟（遠い地区の火も見える）。同じ群れに二本は立てない
    const used = new Set(wantF.map((r) => r.cl || r.id));
    const wantS = [];
    for (const q of B) { if (wantS.length >= MAXS) break; const k = q.r.cl || q.r.id; if (keep.has(q.r) || used.has(k)) continue; used.add(k); wantS.push(q.r); }
    while (smokes.length < wantS.length && smokeRoom()) { const id = W.addSmokeColumn(1e5, -9999, 1e5, { size: 2 }); if (id == null) break; smokes.push({ id, rec: null }); }
    smokes.forEach((s, i) => {
      const r = wantS[i] || null;
      if (r === s.rec) return;
      s.rec = r;
      if (r) moveSmoke(s.id, r.x, r.y0 + (r.top || 3) * 0.7, r.z, Math.min(4, 1.6 + Math.sqrt(r.w * r.d) * 0.15));
      else moveSmoke(s.id, 1e5, -9999, 1e5, 1);
    });
  }
  // 燃え移り：風下ほど遠くへ、燃えやすい棟ほど移りやすい。雨なら遅い
  function spread(dt) {
    const wx = WIND_STATE.dirX, wz = WIND_STATE.dirZ, gust = WIND_STATE.gust || 1;
    const wet = Math.min(0.85, (W.rainLevel || 0) * 0.85);
    for (const r of burning()) {
      if (r.burnT < 6) continue;
      const R0 = 9 + Math.sqrt(r.w * r.d) * 0.5;
      for (const c of G.recs) {
        if (!canBurn(c)) continue;
        const dx = c.x - r.x, dz = c.z - r.z, d = Math.hypot(dx, dz);
        if (d > R0 * 2.2 || d < 0.1) continue;
        const down = Math.max(0, (dx * wx + dz * wz) / d);
        const reach = R0 * (1 + down * 1.2 * gust);
        if (d > reach) continue;
        const p = c.flam * (1 - d / reach) * 0.22 * (1 - wet) * (o.rate ?? 1) * dt;
        if (Math.random() < p) ignite(c, 'spread');
      }
    }
  }
  return {
    ignite,
    burning,
    count: () => burning().length,
    burnt: () => G.recs.filter((r) => r.state === 2).length,
    tick(dt) {
      tAcc += dt; tSpread += dt;
      if (tSpread >= 1) { spread(tSpread); tSpread = 0; }
      if (tAcc < 0.5) return;
      const st = tAcc; tAcc = 0;
      for (const r of G.recs) {
        if (r.state !== 1) continue;
        r.burnT += st;
        const k = Math.min(1, r.burnT / r.dur);
        G.shade(r, 0.8 - 0.62 * k);
        // 最後の八秒で屋根と柱が沈む。高さの比だけを掛け、繰り返しても潰し過ぎない。
        const endHeight = r.kind === 'chudo' || r.kind === 'kodo' ? 0.42 : r.kind === 'kura' ? 0.7 : 0.3;
        const fall = Math.max(0, Math.min(1, (r.burnT - r.dur + 8) / 8));
        if (fall > 0) {
          const height = 1 - (1 - endHeight) * fall * fall;
          G.collapse(r, height / (r.collapseScale || 1));
        }
        if (k >= 1) {
          r.state = 2;
          G.shade(r, 0.14);
          W.addScorch(r.x, r.z, r.w, r.d, r.rot || 0);
          if (W.dustCloud) W.dustCloud(r.x, r.z, true);
          if (o.onBurnt) o.onBurnt(r);
        }
      }
      // 火のそばの隊は熱と煙で士気が傷む（どちらの側も）
      for (const r of burning()) {
        const R = 6 + Math.sqrt(r.w * r.d) * 0.4;
        for (const g of rt.army.groups) {
          if (!g.count || g.civ) continue;
          const c = g.center(), d = Math.hypot(c.x - r.x, c.z - r.z);
          if (d < R) g.morale = Math.max(5, g.morale - 1.2 * st * (1 - d / R));
        }
      }
      assign();
    },
  };
}

// 鐘を撞く（警報）：近いほど大きく。戻り値は鳴らした鐘楼
export function ringBell(rt, rec, o = {}) {
  if (!rec || rec.state === 2) return null;
  const P = rt.player && rt.player.u ? rt.player.u.pos : { x: rec.x, z: rec.z };
  const d = Math.hypot(P.x - rec.x, P.z - rec.z);
  sfx(o.rapid === false ? 'bell' : 'bellRapid', Math.max(0.22, Math.min(1, 1.1 - d / 220)));
  return rec;
}
