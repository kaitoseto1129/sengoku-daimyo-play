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
import { paintGeo, hipGeo, hipEaveGeo, TILE_MAT, WOOD_MAT, THATCH_MAT, ITA_MAT, varyHex, solidRect, solidCircle, solidSeg, dou, romon, SOLIDS, castleMat, stoneStepGeo } from './props.js';
import { WIND_STATE } from './world.js';
import { sfx } from './audio.js';
import { addInterior, facePanels } from './naka.js';
import { nodaNageshiHeight } from './interior_parts.js';
import { S as SETTINGS } from './settings.js';
import { interiorLayout } from './interior_layouts.js';
import { FL, addDeck } from './floors.js';

const paint = (g, hex) => paintGeo(g, hex);
const KEEP = new Set(['position', 'normal', 'uv', 'color']);

// ---- 材質（props.js の物を使い回す。瓦・茅・板は頂点の色で黒ずませるため、色を読む写しを一度だけ作る） ----
let MATS = null;
function mats() {
  if (MATS) return MATS;
  const vc = (m, color) => { const c = m.clone(); c.vertexColors = true; if (color !== undefined) c.color = new THREE.Color(color); return c; };
  MATS = {
    // 木目の凹凸は数センチに抑え、軒下でも木の色を残す。
    wood: (() => { const m = WOOD_MAT().clone(); m.bumpScale = 0.025; if (m.emissive) { m.emissive.setHex(0x524535); m.emissiveIntensity = 0.12; } return m; })(),
    tile: vc(TILE_MAT()),
    thatch: vc(THATCH_MAT()),
    ita: vc(ITA_MAT()),
    bark: vc(ITA_MAT(), 0x6a4a36),           // 檜皮葺き（瑠璃堂・社殿）
    plain: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 }),   // 遠くの軽い僧坊
    get plaster() { return castleMat('plaster'); },   // 白壁（漆喰の汚れ・雨だれ・剥げ。本能寺の壁）
    // 歩く敷石は低い濃淡の細粒にする。石垣の大きな白黒模様を引き延ばさない。
    paving: (() => {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
      const c = canvas.getContext('2d');
      c.fillStyle = '#d3cec2'; c.fillRect(0, 0, 128, 128);
      for (let i = 0; i < 512; i++) {
        c.fillStyle = i % 2 ? 'rgba(72,66,54,.04)' : 'rgba(255,250,236,.04)';
        c.fillRect(i * 37 % 128, (i * 53 + Math.floor(i / 128) * 29) % 128, 2, 2);
      }
      const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
      map.wrapS = map.wrapT = THREE.RepeatWrapping; map.anisotropy = 4;
      return new THREE.MeshStandardMaterial({ map, vertexColors: true, roughness: .96 });
    })(),
    stone: castleMat('nozura'),   // 石段も低画質では軽い共通材質
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
function gable(L, D, rh, y, rotY = 0, { ridgeGap = 0, offsetX = 0, totalLength = L } = {}) {
  const s = Math.hypot(D / 2, rh), out = [];
  for (const sd of [1, -1]) {
    // 軒の厚みを持つ曲面。瓦の絵の段を伸ばさず、隅だけ少し跳ね上げる。
    const g = new THREE.BoxGeometry(L, 0.2, D / 2, 4, 1, 6), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) + offsetX, t = (p.getZ(i) / (D / 2) + 0.5) * (1 - ridgeGap / (D / 2));
      p.setXYZ(i, x, p.getY(i) - 0.1 + y + rh * (0.5 * t + 0.5 * t * t) + 0.22 * Math.pow(Math.abs(x) / (totalLength / 2), 3) * (1 - t) * (1 - t), sd * D / 2 * (1 - t));
    }
    if (sd > 0) { const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const a = ix[i]; ix[i] = ix[i + 1]; ix[i + 1] = a; } }
    uvScale(g, L / 2, s / 2); g.computeVertexNormals();
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
function templeHip(G, r, material, ex, ez, rh, y, rl) {
  G.add(r, material, paint(hipGeo(ex, ez, rh, y, rl), 0xffffff));
  // 遠い谷では細い垂木を省く。木材の既存のまとめと燃焼の頂点範囲を使う。
  const far = r.lite || ['far', 'saito', 'yokawa'].includes(r.dist);
  G.add(r, 'wood', hipEaveGeo(ex, ez, rh, y, rl, far ? true : undefined, r.profile === 'honnoji_shoro'));
}

// ---- 伽藍 ----
const _garanAt = new THREE.Vector3();
export class Garan {
  constructor(rt) {
    this.rt = rt; this.W = rt.world;
    this.buckets = new Map();
    this.recs = []; this.byId = {};
    this.proxyGeo = new THREE.BoxGeometry(1, 1, 1);
    this.proxyMat = new THREE.MeshBasicMaterial({ visible: false });
    this.mk = BAKE_MK();
  }
  _bucket(dist, mk, at) {
    // 影を落とす近い物は、形の置き場の 80m 四方ごとに分ける（山道の石段や屋根が山じゅうで一つの形だと、画面の外も影も毎コマ全部描いていた）
    const far = dist === 'far' || dist === 'saito' || dist === 'yokawa';
    const cell = far || !at ? '' : '|' + Math.floor(at.x / 80) + ',' + Math.floor(at.z / 80);
    const key = dist + '|' + mk + cell;
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
    if (!g.boundingBox) g.computeBoundingBox();
    const at = g.boundingBox.getCenter(_garanAt);
    const b = this._bucket(rec.dist, mk, at);
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
      } else {
        cameraBox(0, rec.top - .6, 0, b.w + .8, 1.2, b.d + .8);
        if (b.kind === 'roka') {
          // 屋根だけでは柱列の隙間から視点が柱へ入り込む。全柱を一つの軽い当たりに束ねる。
          // 通行の当たりには加えず、描く柱の太さと視点の余白だけを取る。
          const parts = [], n = Math.max(1, Math.round(b.d / 2.3));
          for (let i = 0; i <= n; i++) for (const side of [-1, 1]) {
            const g = this.proxyGeo.clone(); g.scale(0.8, 2.5, 0.8);
            g.translate(side * b.w / 2, 1.5, -b.d / 2 + i * b.d / n); parts.push(g);
          }
          const p = new THREE.Mesh(mergeGeometries(parts), this.proxyMat);
          for (const g of parts) g.dispose();
          p.position.set(b.x, rec.y0, b.z); p.rotation.y = b.rot || 0;
          p.userData.camBlock = true; p.matrixAutoUpdate = false; p.updateMatrix();
          this.rt.scene.add(p); rec.cameraParts.push(p);
        }
      }
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
      const g = stoneStepGeo(w * (0.96 + j * 0.03), 1.1, 1.25, k); g.translate(0, -0.47, -0.15); g.rotateY(q.dir + j * 0.025); g.translate(q.x, q.h + 0.02 + j * 0.02, q.z);
      this._push(rec, 'stone', g);
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
    if (!rec.orig) {
      rec.orig = rec.ranges.map((r) => r.b.mesh.geometry.attributes.color.array.slice(r.start * 3, (r.start + r.count) * 3));
      // 火元の周りの焦げを一度だけ測る。更新では色の掛け算だけにする。
      if (rec.fireRoof) rec.charMask = rec.ranges.map((r) => {
        const p = r.b.mesh.geometry.attributes.position, mask = new Float32Array(r.count);
        for (let j = 0; j < r.count; j++) {
          const v = r.start + j, dx = p.getX(v) - rec.fireRoof.x, dz = p.getZ(v) - rec.fireRoof.z;
          const dy = (p.getY(v) - rec.fireRoof.y) * .45;
          const rough = .8 + .2 * Math.sin(p.getX(v) * 8.7 + p.getZ(v) * 6.3 + p.getY(v) * 11.0);
          mask[j] = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy + dz * dz) / 4) * rough;
        }
        return mask;
      });
    }
    rec.ranges.forEach((r, i) => {
      const A = r.b.mesh.geometry.attributes.color, a = A.array, o = rec.orig[i];
      // 燃えている間は少し赤みが残り、燃え落ちると黒い炭
      const kr = k, kg = k * (k < 0.5 ? 0.85 : 0.95), kb = k * (k < 0.5 ? 0.75 : 0.9);
      const mask = rec.charMask?.[i];
      for (let j = 0; j < o.length; j += 3) {
        const char = mask ? 1 - mask[j / 3] * Math.min(.75, (1 - k) * 1.5) : 1;
        a[r.start * 3 + j] = o[j] * kr * char; a[r.start * 3 + j + 1] = o[j + 1] * kg * char; a[r.start * 3 + j + 2] = o[j + 2] * kb * char;
      }
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
  const margin = b.profile === 'hieizan' && b.kind === 'chudo' ? 1.5 : .45;
  const hw = b.w / 2 + margin, hd = b.d / 2 + margin;
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
  const honnoji = r.profile?.startsWith('honnoji_');
  const boardWall = honnoji && ['honnoji_kuri', 'honnoji_kura', 'honnoji_umagura', 'honnoji_umaya', 'honnoji_naya', 'honnoji_kyozo'].includes(r.profile);
  const grand = r.kind === 'chudo', hall = grand || ['hondo', 'kodo', 'do', 'rurido'].includes(r.kind);
  const y = grand ? 1.5 : r.kind === 'kuri' ? .15 : .4;
  const h = grand ? (r.h || 6.2) : r.h || (hall ? 3.4 : 2.5), door = Math.min(2.8, w * .45);
  // 本能寺の客殿は左奥に床の間、祖師堂は左奥、講堂は中央奥に須弥壇と来迎壁がある。
  // 背面の明かり窓は右の脇へ寄せ、造り付けの背後を窓にしない（間取りは推定）。
  // 回転前の位置を外壁・室内・兵と視点の当たりで共有する。
  const rearWindowX = ['honnoji_kyakuden', 'honnoji_soshido', 'honnoji_kodo'].includes(r.profile) ? w * .25 : 0;
  // 馬具蔵の奥中央には高さ一・二メートルの鞍掛けがある。
  // 背面は高窓にして鞍橋の上へ明かりを通し、窓枠も梁下へ収める（配置は推定）。
  // 窓の数・幅・高さは増やさず、外壁と室内・当たりへ同じ位置を渡す。
  // 経蔵は背面の左右に高さ一・六五メートルの経巻棚がある。
  // 棚際に窓枠を重ねず、棚の上と桁の下の間へ横長の明かり窓を納める（配置は推定）。
  // 上下の八センチの枠も含めて梁組から離し、外壁と室内・当たりで開口を共用する。
  const rearWindowY = r.profile === 'honnoji_kyozo' ? 1.85 : r.profile === 'honnoji_umagura' ? 1.35 : 1.0;
  const rearWindowH = r.profile === 'honnoji_kyozo' ? .6 : .8;
  // 馬舎の側窓は馬房の柱頭より上から採光する（配置は推定）。
  // 土間から一・二メートルの柱と下枠を離し、窓の広さは保つ。
  // 窓枠の上端も梁の下面へ食い込ませず、外壁・格子・当たりへ同じ高さを渡す。
  const sideWindowY = r.profile === 'honnoji_umaya' ? 1.35 : 1.0;
  // 納屋の左壁際には高さ一・五五メートルの農具掛けがある。
  // 鍬・鋤の背後へ腰高の窓を置かず、道具の上から採光する高窓にする（配置は推定）。
  // 上枠も桁の下面より下へ納め、外壁・格子・通行の当たりで同じ開口を使う。
  const leftWindowY = r.profile === 'honnoji_naya' ? 1.7 : sideWindowY;
  const leftWindowH = r.profile === 'honnoji_naya' ? .45 : .8;
  // 御影堂の推定復元：須弥壇と御木像の背後は壁で受ける。
  // 本尊の真後ろへ格子窓・内障子を重ねず、外陣の左右の窓で採光する。
  const nodaHall = SETTINGS.quality === 'high' && r.profile === 'nodafukushima' && r.kind === 'hondo';
  const nodaFrame = SETTINGS.quality === 'high' && r.profile === 'nodafukushima'
    && ['hondo', 'sobo', 'kuri'].includes(r.kind);
  // 比叡山の僧坊は座敷の建具と同じ内法高。外壁・当たり・動く障子で共有する。
  const doorH = r.profile === 'hieizan' && r.kind === 'sobo' ? Math.min(2, h - .5) : 2.2;
  // 同じ窓の寸法を外壁と室内の当たりへ渡す。外に壁がある所を窓として通さない。
  const windows = [
    ...nodaHall ? [] : [{ face: 'z', s: -1, t: rearWindowX, w: Math.min(1.8, w * .3), y0: rearWindowY, y1: rearWindowY + rearWindowH }],
    { face: 'x', s: -1, t: 0, w: Math.min(1.5, d * .3), y0: leftWindowY, y1: leftWindowY + leftWindowH },
    { face: 'x', s: 1, t: 0, w: Math.min(1.5, d * .3), y0: sideWindowY, y1: sideWindowY + .8 },
  ];
  if (r.profile === 'hieizan' && hall) {
    // 本尊・光背の真裏に窓を開けず、須弥壇を受ける背面の壁を残す。
    // 焼失前の窓割は断定せず、左右の明かり取りで補う。
    // この寸法を外壁・室内の格子・当たりで共有する。
    windows.length = 0;
    // 側窓を外陣だけへ寄せず、内陣にも明かり取りを設ける。
    // 各室の中央は繋梁を受ける柱筋なので、奥側の四分の一へ窓を寄せる。
    // 窓枠も間仕切り・隅柱・中央の柱から離す。細かな窓割は推定。
    const rooms = interiorLayout(grand ? 'chudo' : 'hondo', w, d, { profile: r.profile }).rooms;
    for (const room of rooms) {
      const depth = room.z1 - room.z0;
      const width = Math.min(.9, depth / 2 - .5);
      if (width < .5) continue;
      for (const side of [-1, 1]) windows.push({
        face: 'x', s: side, t: room.z0 + depth / 4,
        w: width, y0: 1.0, y1: 1.8,
      });
    }
    for (const side of [-1, 1]) windows.push({
      face: 'z', s: -1, t: side * w * .3, w: Math.min(.9, w * .12), y0: 1.0, y1: 1.8,
    });
  }
  // 僧坊の明かり取りは紙障子。堂の格子窓とは分け、射手の持ち場にしない。
  const paperWindows = r.profile === 'hieizan' && r.kind === 'sobo';
  if (paperWindows) {
    // 側窓を建物の中央へ置くと、奥と控えの座敷を分ける柱・襖と重なる。
    // 両座敷の間取りから窓を割り付け、控えにも開閉できる明かり障子を設ける。
    // 開いた障子と二倍長の溝を部屋の内側へ収め、戸口脇の柱から離す。
    // 焼失前の窓割は推定。外壁・窓枠・動く戸・当たりへ同じ寸法を渡す。
    const rooms = interiorLayout('sobo', w, d, { profile: r.profile }).rooms;
    windows.length = 1; // 背面の障子は残し、側窓は座敷ごとに組み直す。
    windows[0].shoji = true;
    for (const room of rooms) {
      if (room.floor !== 'tatami') continue;
      const width = Math.min(1.5, d * .3, (room.z1 - room.z0 - .4) / 2);
      if (width < .5) continue;
      for (const side of [-1, 1]) windows.push({
        face: 'x', s: side, t: (room.z0 + room.z1) / 2,
        w: width, y0: 1.0, y1: 1.8, shoji: true,
      });
    }
  }
  // 中堂の縁は壁から一・五メートル張り出す。階段を基壇の外から縁へつなぐ。
  // 内外の床・描く石段・通行の坂は、同じ踊り場の長さを使う。
  const entryPad = grand && r.profile === 'hieizan' ? 1.5 : .25;
  if (nodaHall && w >= 12) {
    // 外陣の採光を側面の小窓だけに頼らず、正面の縁に面した左右にも格子窓と内障子を設ける。
    // 窓割りは推定。障子の引き代（二倍幅）を玄関の竪枠と隅柱の間へ収める。
    // 共通の窓定義を使い、外壁の開口・柱・室内の当たり・操作できる引き戸を一致させる。
    const t = w * .3, width = Math.min(1.4, t - door - .3, w / 2 - t - .3);
    if (width >= .5) for (const side of [-1, 1])
      windows.push({ face: 'z', s: 1, t: side * t, w: width, y0: 1.0, y1: 1.8 });
  }
  if (nodaFrame && r.kind === 'sobo') {
    // 僧坊の正面の板間にも明かり取りを設ける推定復元。
    // 玄関の板戸の全開位置と隅柱の間に、内障子の二倍幅と竪枠まで収める。
    // 共通の窓定義で外壁を抜き、格子・内障子・当たりを同じ位置に作る。
    const t = (door + hw) / 2;
    const width = Math.min(1.2, t - door - .3, hw - t - .3);
    if (width >= .5) for (const side of [-1, 1])
      windows.push({ face: 'z', s: 1, t: side * t, w: width, y0: 1.0, y1: 1.8 });
  }
  if (nodaFrame && r.kind === 'kuri') {
    // 炊事土間の正面にも、竈・器棚より高い明かり取りを補う推定復元。
    // 煤や雨を受ける窓は紙障子にせず、格子の内側の板戸で閉じる。
    // 玄関の全開位置と隅柱を避け、窓の二倍幅に竪枠の余白も残す。
    // 外壁・室内・開閉は同じ窓定義を使い、共通の札で板戸を横へ滑らせる。
    const t = (door + hw) / 2;
    const width = Math.min(.9, t - door - .3, hw - t - .3);
    if (width >= .5) for (const side of [-1, 1])
      windows.push({ face: 'z', s: 1, t: side * t, w: width,
        y0: 1.2, y1: 2.0, doorKind: 'itado' });
  }
  const si = SOLIDS.length, di = FL.decks.length, ri = FL.ramps.length;
  r.naka = addInterior(G.W, { name: r.name || (r.kind === 'kuri' ? '庫裏' : '僧坊'), kind: r.interiorKind || (hall ? (grand ? 'chudo' : 'hondo') : r.kind),
    profile: r.profile || 'hiei', x: r.x, z: r.z, rot: r.rot || 0, levels: [{ w, d, h, y: r.y0 + y + .06 }], door: { w: door, h: doorH }, wins: (lv) => {
      // 宿坊・方丈・講堂・祖師堂の側窓を、間仕切りに突き当てない（配置は推定）。
      // 柱と窓枠の余白を取り、幅を変えず、元の位置に近い室の壁へ収める。
      // 設営時に一度だけ決め、外壁・室内の格子・兵と視点の当たりで共有する。
      if (['honnoji_sobo', 'honnoji_hojo', 'honnoji_kodo', 'honnoji_soshido'].includes(r.profile)) {
        for (const v of windows) {
          if (v.face !== 'x') continue;
          // 小さな祖師堂では中央の窓が内外陣の格子へ重なる。
          // 須弥壇の脇を避け、参拝する外陣の壁へ窓枠ごと納める。
          if (r.profile === 'honnoji_soshido') {
            const outer = lv.layout.rooms[1];
            v.t = (outer.z0 + outer.z1) / 2;
          }
          let best = v.t, distance = Infinity;
          for (const room of lv.layout.rooms) {
            const edge = v.s < 0 ? room.x0 : room.x1;
            if (Math.abs(edge - v.s * hw) > .01) continue;
            const lo = room.z0 + .2 + v.w / 2, hi = room.z1 - .2 - v.w / 2;
            if (lo > hi) continue;
            const t = Math.max(lo, Math.min(hi, v.t)), move = Math.abs(t - v.t);
            if (move < distance) { best = t; distance = move; }
          }
          v.t = best;
        }
      }
      // 僧の座敷・方丈・客殿と、講堂の畳敷きの外陣には明かり障子を納める。
      // 講堂の内陣・板縁は連子窓のまま。共通室内の紙・組子と採光を使う（意匠は推定）。
      if (['honnoji_sobo', 'honnoji_hojo', 'honnoji_kyakuden', 'honnoji_kodo'].includes(r.profile)) {
        for (const v of windows) {
          const x = v.face === 'x' ? v.s * (hw - .1) : v.t;
          const z = v.face === 'z' ? v.s * (hd - .1) : v.t;
          v.paperBacked = lv.layout.rooms.some(room => room.floor === 'tatami'
            && x >= room.x0 && x <= room.x1 && z >= room.z0 && z <= room.z1);
        }
      }
      if (nodaFrame) {
        // 僧坊の控えと庫裏の食事座敷にも、部屋ごとの明かり取りを設ける推定復元。
        // 御影堂も外陣だけへ窓を集めず、内陣の左右から採光する。
        // 須弥壇の背面は板壁を保ち、側縁に面する格子窓と内障子で受ける。
        // 板敷きの狭い玄関は除き、座敷には内障子、庫裏の炊事土間には板戸を付ける。
        // 全開時の二倍幅と竪枠まで各室へ納め、間仕切りの柱や鴨居と重ねない。
        for (let i = windows.length - 1; i >= 0; i--) if (windows[i].face === 'x') windows.splice(i, 1);
        for (const room of lv.layout.rooms) {
          if (!['tatami', 'earth'].includes(room.floor) && !(nodaHall && room.floor === 'boards')) continue;
          const width = Math.min(nodaHall ? 1.5 : 1.2, (room.z1 - room.z0 - .7) / 2);
          if (width < .5) continue;
          // 炊事土間の側窓も正面と同じ高窓の板戸とする推定復元。
          // 紙障子で塞がず、竈・作業台より上で換気する。座敷の紙障子は保つ。
          // 外壁・格子・敷居・当たり・横に滑る戸へ同じ窓定義を渡す。
          const kitchen = r.kind === 'kuri' && room.floor === 'earth';
          for (const side of [-1, 1]) windows.push({ face: 'x', s: side,
            t: (room.z0 + room.z1) / 2, w: width,
            y0: kitchen ? 1.2 : 1.0, y1: kitchen ? 2.0 : 1.8,
            doorKind: kitchen ? 'itado' : 'shoji' });
        }
      } else if (SETTINGS.quality === 'high' && r.profile === 'nodafukushima') {
        // 個別の窓割りは不明。開いた内障子と二倍幅の敷居・鴨居まで、
        // 一つの部屋に納める推定復元。間仕切りへ障子を引き込まない。
        const room = lv.layout.rooms.reduce((a, b) => b.z1 - b.z0 > a.z1 - a.z0 ? b : a);
        for (const v of windows) if (v.face === 'x') {
          v.t = (room.z0 + room.z1) / 2;
          v.w = Math.min(v.w, (room.z1 - room.z0 - .5) / 2);
        }
      }
      if (nodaFrame) for (const v of windows) {
        // 堂・僧坊・庫裏の窓は三本の棒で済ませず、外壁の窓枠で受ける格子とする推定復元。
        // 外形を作る側と室内の当たりで同じ割りを使い、内障子の溝は空ける。
        v.outerLattice = { divisions: Math.max(3, Math.round(v.w / .18)),
          width: .035, depth: .06, offset: 0,
          // 縦格子を上下の框だけに頼らせず、外側の横桟でつなぐ推定復元。
          // 内障子の引き代を空け、室内の当たりにも同じ断面を渡す。
          crossbars: [1 / 3, 2 / 3], crossHeight: .035, crossDepth: .03, crossOffset: .045 };
      }
      return windows;
    }, approach: { pad: nodaHall ? .95 : entryPad, len: grand ? 3.2 : 1.8 } });
  if (nodaHall) {
    // 御影堂の正面の縁は推定復元。深い軒の内側へ納め、
    // 階段の上を踊り場にして、開けた板戸から外陣へ歩いて入れる。
    const [cx, cz] = r.naka.P(0, hd + .45);
    addDeck({ cx, cz, rot: r.rot || 0, x0: -hw, x1: hw, z0: -.5, z1: .5,
      y: r.y0 + y + .06, name: '御影堂の正面の縁' });
    // 側縁の有無・寸法は推定。既存の軒下だけに納め、正面の縁へ角でつなぐ。
    for (const side of [-1, 1]) {
      const [sx, sz] = r.naka.P(side * (hw + .475), .475);
      addDeck({ cx: sx, cz: sz, rot: r.rot || 0, x0: -.475, x1: .475, z0: -(d + .95) / 2, z1: (d + .95) / 2,
        y: r.y0 + y + .06, name: '御影堂の側縁' });
    }
  }
  r.innerSolids = SOLIDS.slice(si); r.innerDecks = FL.decks.slice(di); r.innerRamps = FL.ramps.slice(ri);
  // 外壁と同じ開口に紙と桟を張り、室内の白壁で障子を覆わない。
  r.naka.templePaper = paperWindows;
  // 比叡山・本能寺の室内床は基壇の床板より六センチ高い。外壁・柱も
  // 同じ天井下面まで伸ばし、軒下から堂内へ外光が漏れる隙間を残さない。
  // 戸口と窓の高さは従来のまま、設営時のまとめ描きだけで揃える。
  const wallHeight = r.profile === 'hieizan' || honnoji || nodaFrame ? r.naka.levels[0].y - r.y0 - y + h : h;
  const P = [];
  if (['honnoji_sobo', 'honnoji_hojo', 'honnoji_kyakuden', 'honnoji_kodo', 'honnoji_soshido'].includes(r.profile)) {
    // 座敷・講堂・祖師堂の床下を石の塊にせず、礎石・束柱・大引で板床を受ける（床組は推定）。
    // 床高・戸口・歩行面は保ち、既存の木部へ設営時だけまとめる。
    const nx = Math.max(1, Math.ceil((w - .32) / 1.9));
    const nz = Math.max(1, Math.ceil((d - .32) / 1.9));
    const c = Math.cos(r.rot || 0), s = Math.sin(r.rot || 0);
    const beamBottom = y - .18;
    for (let ix = 0; ix <= nx; ix++) {
      const lx = -hw + .16 + ix * (w - .32) / nx;
      P.push(box(.18, .12, d - .5, lx, y - .12, 0, 0x4a3020));
      for (let iz = 0; iz <= nz; iz++) {
        const lz = -hd + .16 + iz * (d - .32) / nz;
        const ground = G.W.heightAt(r.x + lx * c + lz * s, r.z - lx * s + lz * c) - r.y0;
        const foot = ground + .09;
        P.push(box(.32, .18, .32, lx, ground, lz, 0x756e60));
        if (beamBottom > foot)
          P.push(box(.16, beamBottom - foot, .16, lx, (foot + beamBottom) / 2, lz, 0x4a3020));
      }
    }
    for (const side of [-1, 1])
      P.push(box(w - .14, .12, .18, 0, y - .12, side * (hd - .16), 0x4a3020));
  } else P.push(box(w, y + 2, d, 0, (y - 2) / 2, 0, 0x756e60));
  P.push(box(w, .12, d, 0, y, 0, 0x5a4230));
  if (nodaHall) {
    // 板・端の框・床下の束は外壁と同じ束へまとめ、材質を共有する。
    // 縁束を土へ直接埋めず、束石の上へ立てる推定復元。
    // 正面・側面で地面の高さを個別に拾い、低い地面でも柱脚を浮かせない。
    // 桁の下面で上端を止め、石も木も既存の形の束へ設営時だけ加える。
    const rc = Math.cos(r.rot || 0), rs = Math.sin(r.rot || 0);
    const verandaPost = (x, z) => {
      const ground = G.W.heightAt(r.x + x * rc + z * rs, r.z - x * rs + z * rc) - r.y0;
      const top = y - .24, foot = Math.min(ground + .06, top - .04);
      P.push(box(.3, .18, .3, x, foot - .09, z, 0x756e60));
      P.push(box(.14, top - foot, .14, x, (top + foot) / 2, z, 0x493624));
    };
    P.push(box(w, .16, .1, 0, y - .02, hd + .9, 0x493624));
    const n = Math.max(2, Math.ceil(w / 1.8));
    // 正面の縁は厚い一枚板へ線を貼らず、四センチ厚の板を根太の芯で継ぐ。
    // 上面は歩ける床と同じ高さ。隣の列は継ぎ目をずらし、木口を宙に浮かせない。
    // 外端の框の内面までで板を止め、同じ高さの板面を框へ重ねない。
    const frontBoardDepth = .9 / 4;
    for (let row = 0; row < 4; row++) {
      const z0 = hd - .05 + row * frontBoardDepth, z1 = z0 + frontBoardDepth;
      let left = -hw;
      for (let i = 0; i <= n; i++) {
        if (i < n && (i + row) % 2) continue;
        const right = i === n ? hw : -hw + .1 + (w - .2) * i / n;
        if (right - left < .15) continue;
        P.push(box(right - left - (left > -hw ? .004 : .002), .04, frontBoardDepth - .004,
          (left + right) / 2, y + .04, (z0 + z1) / 2, 0x6a5038));
        left = right;
      }
    }
    // 正面の縁も側縁と同じ桁で受ける推定復元。束・桁・根太・板の
    // 上下を合わせ、階段と戸口の通りには張り出さない。
    P.push(box(w, .14, .14, 0, y - .17, hd + .78, 0x493624));
    // 正面の縁も二本の桁で根太を受ける。壁際の受けがないまま、
    // 根太の木口だけを主屋へ突き付けていた床組みを補う推定復元。
    // 側縁と同じ断面を使い、全て床板の下へ収める。
    P.push(box(w, .14, .14, 0, y - .17, hd + .12, 0x493624));
    for (let i = 0; i <= n; i++) {
      const x = -hw + .1 + (w - .2) * i / n;
      verandaPost(x, hd + .78);
      // 両端の床板も根太で受ける。角では側縁の床組みへ食い込ませない。
      P.push(box(.1, .12, .9, x, y - .04, hd + .45, 0x493624));
    }
    for (const side of [-1, 1]) {
      // 側縁は外壁の線から始め、正面の縁と角で突き付ける。
      // 五センチ重なる板面をなくし、歩く床も同じ内外端へ合わせる。
      const sx = side * (hw + .475), length = d + .95;
      P.push(box(.1, .16, length, side * (hw + .9), y - .02, .475, 0x493624));
      // 濡れ縁の短い板は壁に直交させ、端の框と床下の束・桁で受ける。
      // 板の外端は側框の内面へ納める。前後の木口も框で受け、
      // 正面の縁と同じく、板と框の上面が重なってちらつくのを防ぐ。
      const boardLength = length - .2, boardWidth = .85;
      const boards = Math.ceil(boardLength / .3), posts = Math.ceil(length / 1.8);
      for (const z of [-hd + .05, hd + .9])
        P.push(box(boardWidth, .04, .1, side * (hw + boardWidth / 2), y + .04, z, 0x493624));
      for (let i = 0; i < boards; i++)
        P.push(box(boardWidth, .04, boardLength / boards - .004,
          side * (hw + boardWidth / 2), y + .04,
          -hd + .1 + boardLength * (i + .5) / boards, 0x6a5038));
      P.push(box(.14, .14, length, side * (hw + .78), y - .17, .475, 0x493624));
      // 側縁の床組は推定復元。壁際にも桁を通し、二本の桁へ根太を掛ける。
      // 短い床板の下を受け、根太の上面を床板の下面へ合わせる。
      // 正面の縁とは外壁の端で分け、前隅まで床組みを通す。
      P.push(box(.14, .14, length, side * (hw + .12), y - .17, .475, 0x493624));
      for (let i = 0; i <= posts; i++) {
        const z = -hd + .1 + (length - .2) * i / posts;
        P.push(box(.94, .12, .1, sx, y - .04, z, 0x493624));
      }
      for (let i = 0; i <= posts; i++)
        verandaPost(side * (hw + .78), -hd + .1 + (length - .2) * i / posts);
    }
  }
  for (const face of ['x', 'z']) for (const side of [-1, 1]) {
    const len = face === 'z' ? w : d;
    const holes = windows.filter((v) => v.face === face && v.s === side).map((v) => ({ t0: v.t - v.w / 2, t1: v.t + v.w / 2, y0: v.y0 + .06, y1: v.y1 + .06 }));
    if (face === 'z' && side === 1) holes.push({ t0: -door / 2, t1: door / 2, y0: 0, y1: Math.min(h, doorH + .06) });
    for (const [t0, t1, y0, y1] of facePanels(len, wallHeight, holes)) {
      const mid = (t0 + t1) / 2, cy = y + (y0 + y1) / 2;
      const wallColor = honnoji && !boardWall ? 0xb8ab90 : 0x6e5840;
      if (boardWall) {
        // 板倉・庫裏の外壁は線だけで板目を描かず、厚い縦板を張る（板割りは推定）。
        // 二ミリの目透かしの奥にも下地を残し、窓・戸口の外形と壁厚は保つ。
        // 従来の壁一枚と目地の線を置き換え、既存のまとまりへ設営時だけ結合する。
        P.push(face === 'z'
          ? box(t1 - t0, y1 - y0, .10, mid, cy, side * (hd - .01), wallColor)
          : box(.10, y1 - y0, t1 - t0, side * (hw - .01), cy, mid, wallColor));
        // 窓の上下で板幅を割り直さず、内壁と同じ二十六センチの板割りを通す。
        // 開口際だけ板を切り欠き、縦の目地が窓枠の上下で食い違わないようにする（板組は推定）。
        for (let q = Math.floor((t0 + len / 2) / .26); -len / 2 + q * .26 < t1; q++) {
          const near = -len / 2 + q * .26, far = Math.min(len / 2, near + .26);
          const left = Math.max(t0, near + (q ? .001 : 0));
          const right = Math.min(t1, far - (far < len / 2 ? .001 : 0));
          if (right <= left) continue;
          P.push(face === 'z'
            ? box(right - left, y1 - y0, .02, (left + right) / 2, cy, side * (hd + .05), wallColor)
            : box(.02, y1 - y0, right - left, side * (hw + .05), cy, (left + right) / 2, wallColor));
        }
      } else P.push(face === 'z' ? box(t1 - t0, y1 - y0, .12, mid, cy, side * hd, wallColor) : box(.12, y1 - y0, t1 - t0, side * hw, cy, mid, wallColor));
      if (honnoji) {
        // 堂・座敷は腰板の上を白壁とする真壁、炊事・収納の棟は縦板壁（仕上げは推定）。
        // 窓・戸口を抜いた面だけへ足し、室内へ通る開口はふさがない。
        if (!boardWall) {
          const top = Math.min(y1, .8);
          if (top > y0) P.push(face === 'z'
            ? box(t1 - t0, top - y0, .02, mid, y + (y0 + top) / 2, side * (hd + .065), 0x6e5840)
            : box(.02, top - y0, t1 - t0, side * (hw + .065), y + (y0 + top) / 2, mid, 0x6e5840));
        }
        const top = boardWall ? y0 : Math.min(y1, .8);
        for (let t = Math.ceil((t0 + .02 + len / 2) / .26) * .26 - len / 2; t < t1 - .02 && top > y0; t += .26)
          P.push(face === 'z'
            ? box(.008, top - y0, .004, t, y + (y0 + top) / 2, side * (hd + (boardWall ? .062 : .077)), 0x4a3828)
            : box(.004, top - y0, .008, side * (hw + (boardWall ? .062 : .077)), y + (y0 + top) / 2, t, 0x4a3828));
      }
    }
    if (honnoji && !boardWall) {
      // 内側と同じ柱割り。窓で省いた柱は既存の窓枠が受け、格子や戸口へ柱を立てない。
      // 既存の木部へ設営時にまとめ、描く回数や毎コマの処理は増やさない。
      const n = Math.max(2, Math.round(len / 1.9));
      for (let q = 1; q < n; q++) {
        const t = -len / 2 + q * len / n;
        if (holes.some(v => t > v.t0 - .12 && t < v.t1 + .12)) continue;
        P.push(face === 'z' ? box(.16, wallHeight, .14, t, y + wallHeight / 2, side * (hd + .02), 0x4a3020)
          : box(.14, wallHeight, .16, side * (hw + .02), y + wallHeight / 2, t, 0x4a3020));
      }
    }
    if (nodaFrame) {
      // 三棟の柱割りは推定。室内と同じ約一間の割りで壁を受け、
      // 戸口・格子窓の幅を保ったまま、開口の両脇へ柱を寄せる。
      const timber = (t, cy, width, height, depth = .22) => P.push(face === 'z'
        ? box(width, height, depth, t, cy, side * hd, 0x4a3020)
        : box(depth, height, width, side * hw, cy, t, 0x4a3020));
      const posts = [], n = Math.max(2, Math.round(len / 1.9));
      for (const v of holes) for (const t of [v.t0 - .08, v.t1 + .08]) {
        if (Math.abs(t) < len / 2 - .11 && !posts.some(p => Math.abs(p - t) < .16)) posts.push(t);
      }
      for (let i = 1; i < n; i++) {
        const t = -len / 2 + len * i / n;
        if (holes.some(v => t > v.t0 - .16 && t < v.t1 + .16)
          || posts.some(p => Math.abs(p - t) < .16)) continue;
        posts.push(t);
      }
      for (const t of posts) timber(t, y + wallHeight / 2, .16, wallHeight);
      if (nodaHall) {
        // 御影堂の組物は推定復元。柱頭の大斗・外へ出す肘木・桁下の束で
        // 既存の軒桁を受ける。戸口と内障子より上に納め、柱のない所へ飾らない。
        // hipEaveGeo の t=.18 の桁下面へ合わせる。反りは桁と同じ八分割で補間する。
        const ex = hw + 1.5, ez = hd + 1.5, rl = hw * .5, tRoof = .18;
        const across = face === 'z' ? ex + (rl - ex) * tRoof : ez * (1 - tRoof);
        const out = face === 'z' ? ez * (1 - tRoof) - hd : ex + (rl - ex) * tRoof - hw;
        const lift = Math.min(.55, .28 + ez * .04);
        for (const t of posts) {
          const u = Math.min(1, Math.abs(t) / across), segment = Math.min(3, Math.floor(u * 4));
          const a = segment / 4, b = (segment + 1) / 4;
          const curve = a ** 3 + (b ** 3 - a ** 3) * (u - a) * 4;
          const top = y + h + .4 + ez * .8 * (.5 * tRoof + .5 * tRoof ** 2)
            + lift * curve * (1 - tRoof) ** 2 - .38 - .12;
          const block = (width, height, depth, cy, offset) => P.push(face === 'z'
            ? box(width, height, depth, t, cy, side * (hd + offset), 0x4a3020)
            : box(depth, height, width, side * (hw + offset), cy, t, 0x4a3020));
          // 柱頭と同じ上端から組物を積み、屋根側の受け位置は保つ。
          // 天井へ揃えた柱へ大斗を埋めず、束だけ六センチ短くする。
          block(.32, .12, .32, y + wallHeight + .06, 0);
          block(.18, .14, out + .32, y + wallHeight + .19, out / 2);
          const rise = top - (y + wallHeight + .26);
          block(.26, rise, .26, top - rise / 2, out);
        }
      }
      // 窓の上下は框、入口の上は鴨居で受ける。戸の通る内側の溝へは出さない。
      for (const v of holes) {
        const mid = (v.t0 + v.t1) / 2, width = v.t1 - v.t0 + .32;
        timber(mid, y + v.y1 + .05, width, .1);
        if (v.y0 > 0) timber(mid, y + v.y0 - .04, width, .08);
      }
      for (const v of windows) {
        if (v.face !== face || v.s !== side || !v.outerLattice) continue;
        const lattice = v.outerLattice;
        for (let i = 0; i <= lattice.divisions; i++) {
          const t = v.t - v.w / 2 + v.w * i / lattice.divisions;
          // 格子の木口は上下の窓枠へ差す。外壁と同じ束にまとめ、
          // 近づいた時に室内側へ別の格子を重ねない。
          timber(t, y + .06 + (v.y0 + v.y1) / 2,
            lattice.width, v.y1 - v.y0, lattice.depth);
        }
        for (const t of lattice.crossbars || []) {
          const cy = y + .06 + v.y0 + (v.y1 - v.y0) * t;
          const off = side * ((face === 'z' ? hd : hw) + lattice.crossOffset);
          P.push(face === 'z'
            ? box(v.w + lattice.width, lattice.crossHeight, lattice.crossDepth, v.t, cy, off, 0x4a3020)
            : box(lattice.crossDepth, lattice.crossHeight, v.w + lattice.width, off, cy, v.t, 0x4a3020));
        }
      }
      // 堂・僧坊・庫裏の長押は、内側の欄間・鴨居と同じ高さで外側もつなぐ。
      // 室内の床は外の板床より六センチ上。柱の外面へ添え、柱中へ埋めない。
      const nageshi = Math.min(h - .08, Math.max(nodaNageshiHeight(r.naka.kind, h),
        ...holes.map(v => v.y1 - .06 + .1)));
      // 正面・背面を通し、側面の木口を内面へ突き付ける。四隅で横木を重ねない。
      const length = len + (face === 'z' ? .42 : .22), off = side * (hd + .16);
      P.push(face === 'z'
        ? box(length, .1, .1, 0, y + .06 + nageshi, off, 0x4a3020)
        : box(.1, .1, length, side * (hw + .16), y + .06 + nageshi, 0, 0x4a3020));
      timber(0, y + wallHeight - .1, len, .2, .24);
    }
  }
  for (const x of [-hw, hw]) for (const z of [-hd, hd]) P.push(box(.22, wallHeight, .22, x, y + wallHeight / 2, z, 0x4a3020));
  if (grand) {
    // 九間の柱列と深い軒。中央の戸口だけを開け、江戸期の現存堂は写さない。
    const ox = hw + 1.2, oz = hd + 1.2;
    for (let i = 0; i <= 9; i++) for (const sd of [-1, 1]) {
      let x = -ox + i * ox * 2 / 9;
      // 比叡山の正面は、柱の太さも含めて戸口と同じ幅を空ける。
      if (r.profile === 'hieizan' && sd === 1 && Math.abs(x) < door / 2 + .3) x = Math.sign(x) * (door / 2 + .35);
      // 比叡山の縁柱は板床へ埋めず、基壇に据えた礎石の上で受ける。
      // 礎石は既存の柱の当たり半径に収め、正面の出入り幅を保つ。
      const footRise = r.profile === 'hieizan' ? .18 : 0;
      P.push(post(.3, h + .5 - footRise, x, y + footRise, sd * oz, 0x5a3e2a));
      if (r.profile === 'hieizan') {
        G.verandaFootShape ||= new THREE.CylinderGeometry(.3, .3, .28, 8);
        const foot = G.verandaFootShape.clone();
        foot.translate(x, y + .04, sd * oz);
        G.add(r, 'stone', paint(foot, 0x827b6d)); foot.dispose();
        const [px, pz] = r.naka.P(x, sd * oz);
        Object.assign(solidCircle(px, pz, .3), { yBot: r.y0 + y, yTop: r.y0 + y + h + .5 });
      }
    }
    if (r.profile === 'hieizan') {
      // 外周の柱を支える縁と基壇。室内・戸口の踊り場と床の高さを揃える。
      // 四つの帯で外周を囲み、堂の中の床や石段を重ねて塞がない。
      const ex = hw + 1.5, ez = hd + 1.5;
      // 縁を一枚の塊にせず、框の内側へ踏板を納める。板割は推定。
      // 薄い下地で目地を閉じ、共通の箱から作って既存の木部へまとめる。
      G.verandaBoardShape ||= new THREE.BoxGeometry(1, 1, 1);
      const timber = (w, h, d, x, cy, z, color) => {
        const g = G.verandaBoardShape.clone().scale(w, h, d);
        // 縁板と框の木目を材の長手へ通す。単位箱の絵を引き延ばさず、
        // 堂内の角材と同じ幅四十五センチ・長さ二・四メートルで繰り返す。
        // 下地も同じ形を使い、設営時のまとめ描きへ納める。
        const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
        const alongX = w >= d, offset = (x * .37 + cy * .19 + z * .53) % 1;
        for (let i = 0; i < p.count; i++) {
          const along = alongX ? p.getX(i) : p.getZ(i);
          const across = alongX ? p.getZ(i) : p.getX(i);
          const end = Math.abs(alongX ? n.getX(i) : n.getZ(i)) > .5;
          const cross = Math.abs(n.getY(i)) > .5 ? across : p.getY(i);
          uv.setXY(i, (end ? across : cross) / .45 + offset,
            end ? p.getY(i) / .45 : along / 2.4);
        }
        g.translate(x, cy, z); P.push(paint(g, color));
      };
      for (const [x0, x1, z0, z1] of [[-ex, ex, hd, ez], [-ex, ex, -ez, -hd], [-ex, -hw, -hd, hd], [hw, ex, -hd, hd]]) {
        const x = (x0 + x1) / 2, z = (z0 + z1) / 2;
        const width = x1 - x0, depth = z1 - z0, rim = .08;
        P.push(box(x1 - x0, y + 1.94, z1 - z0, x, (y - 2.06) / 2, z, 0x756e60));
        for (const side of [-1, 1]) {
          timber(rim, .12, depth, x + side * (width - rim) / 2, y, z, 0x5a4230);
          timber(width - rim * 2, .12, rim, x, y, z + side * (depth - rim) / 2, 0x5a4230);
        }
        timber(width - rim * 2, .10, depth - rim * 2, x, y - .01, z, 0x4e3c2a);
        const front = depth < width;
        const span = (front ? width : depth) - rim * 2;
        const count = Math.max(1, Math.round(span / .3)), pitch = span / count;
        for (let i = 0; i < count; i++) {
          const offset = -span / 2 + (i + .5) * pitch;
          timber(front ? pitch - .003 : width - rim * 2, .02,
            front ? depth - rim * 2 : pitch - .003,
            x + (front ? offset : 0), y + .05, z + (front ? 0 : offset),
            i % 2 ? 0x695039 : 0x72573d);
        }
        const [cx, cz] = r.naka.P(x, z);
        addDeck({ cx, cz, rot: r.rot || 0, x0: -(x1 - x0) / 2, x1: (x1 - x0) / 2, z0: -(z1 - z0) / 2, z1: (z1 - z0) / 2, y: r.y0 + y + .06, name: '根本中堂の縁側', pad: 0 });
      }
    }
    P.push(box(w + .6, .5, d + .6, 0, y + h + .25, 0, 0x3a2a1c));
    P.push(box(w, .65, .14, 0, y + h - .325, hd, 0xd2c9b2));
  }
  if (honnoji && !grand && !hall) {
    // 本能寺の切妻の付属棟は、天井の上にも板張りの妻壁を立てる（造作は推定）。
    // 屋根は棟が東西方向。南北の壁でなく、左右の妻を屋根裏まで閉じる。
    // 屋根と同じ六分割の曲線へ板端を合わせ、単純な三角で屋根を突き抜けさせない。
    const roofD = hd + .8, rh = roofD * .65, roofL = hw + .6;
    // 屋根の長手は四分割なので、妻の位置の反りも頂点間で補間する。
    const a = Math.floor(hw / (roofL / 2)) * roofL / 2, b = a + roofL / 2;
    const uplift = .22 * ((a / roofL) ** 3
      + ((b / roofL) ** 3 - (a / roofL) ** 3) * (hw - a) / (b - a));
    const roofBottom = z => {
      const t = 1 - Math.abs(z) / roofD, q = Math.min(5, Math.floor(t * 6));
      const curve = u => rh * (.5 * u + .5 * u * u) + uplift * (1 - u) ** 2;
      return y + h - .05 + curve(q / 6) + (curve((q + 1) / 6) - curve(q / 6)) * (t * 6 - q);
    };
    const edge = [-hd];
    for (let q = 1; q < 12; q++) {
      const z = (q - 6) * roofD / 6;
      if (z > -hd && z < hd) edge.push(z);
    }
    edge.push(hd);
    const outline = new THREE.Shape();
    outline.moveTo(-hd, y + h - .08); outline.lineTo(hd, y + h - .08);
    for (let q = edge.length - 1; q >= 0; q--) outline.lineTo(edge[q], roofBottom(edge[q]));
    outline.closePath();
    const end = new THREE.ExtrudeGeometry(outline, { depth: .12, bevelEnabled: false });
    end.rotateY(Math.PI / 2);
    for (const side of [-1, 1]) P.push(paint(end.clone().translate(side * hw - .06, 0, 0), 0x6e5840));
    end.dispose();
  }
  if (honnoji && hall && !grand) {
    // 講堂・祖師堂・方丈・客殿の軒下は、基壇基準の壁高から四十センチ上。
    // 屋根だけを浮かせず、外周の柱の上へ桁を通して軒を受ける（架構は推定）。
    // 東西の桁を通し、南北の木口はその内面で止め、隅で材を二重にしない。
    // 室内の天井・建具には入れず、既存の木部と視点の当たりへ一度だけまとめる。
    // 室内基準へ伸ばした柱の上端から屋根下面までを受け、柱と桁を重ねない。
    const girderH = h + .4 - wallHeight, girderY = y + wallHeight + girderH / 2;
    for (const side of [-1, 1]) {
      P.push(box(w + .22, girderH, .22, 0, girderY, side * hd, 0x4a3020));
      P.push(box(.22, girderH, d - .22, side * hw, girderY, 0, 0x4a3020));
    }
  }
  // 縁側と柱も焼失時に室内と一緒に片付ける。
  r.innerSolids = SOLIDS.slice(si); r.innerDecks = FL.decks.slice(di); r.innerRamps = FL.ramps.slice(ri);
  G.add(r, 'wood', P);
  // 開いた戸口・窓を保った外壁そのものを、カメラの当たりにも使う。
  r.openCamera = new THREE.Mesh(mergeGeometries(P), G.proxyMat);
  r.openCamera.userData.camBlock = true;
  r.openCamera.matrixAutoUpdate = false;
  G.rt.scene.add(r.openCamera);
  if (grand || hall) {
    const ex = hw + (grand ? 3.8 : 1.5), ez = hd + (grand ? 3.8 : 1.5), rh = ez * .8;
    templeHip(G, r, r.roof || 'tile', ex, ez, rh, y + h + .4, hw * .5);
    r.top = y + h + .4 + rh;
  } else {
    const rh = (hd + .8) * .65;
    if (nodaFrame && r.kind === 'kuri') {
      // 庫裏の天井の煙抜きは小屋裏へ通じるが、元の屋根は棟まで閉じていた。
      // 棟の中央を実際に抜き、四本の束で支える雨除けを掛ける推定復元。
      // 茅と木は既存の束へ結合し、毎コマの処理や材質を増やさない。
      const length = w + 1.2, depth = d + 1.6, eave = y + h + .15;
      const opening = 1.4, gap = .45, sideLength = (length - opening) / 2;
      const roof = gable(opening, depth, rh, eave, 0, { ridgeGap: gap, totalLength: length });
      for (const side of [-1, 1]) roof.push(...gable(sideLength, depth, rh, eave, 0,
        { offsetX: side * (opening + sideLength) / 2, totalLength: length }));
      const capY = eave + rh + .4;
      roof.push(...gable(opening + .6, 1.5, .4, capY));
      G.add(r, 'thatch', roof);
      const t = 1 - gap / (depth / 2), bottom = eave + rh * (.5 * t + .5 * t * t);
      const frame = [];
      // 煙出しの切り口には低い立ち上がりを付け、茅の木口を雨へさらさない推定復元。
      // 開口の外側だけを囲い、天井から上がる煙と雨除けの下の出口は空ける。
      // 妻側の板は屋根勾配へ合わせ、棟の両側に宙へ浮く木口を残さない。
      // 四枚とも既存の木材の束へ入れ、設営後の形・材質の追加はしない。
      const curbH = .18, curbD = .06;
      for (const side of [-1, 1]) {
        frame.push(box(opening, curbH, curbD, 0, bottom + curbH / 2,
          side * (gap + curbD / 2), 0x4a3020));
        const curb = new THREE.BoxGeometry(curbD, curbH, gap * 2 + curbD * 2, 1, 1, 12);
        const positions = curb.attributes.position;
        for (let i = 0; i < positions.count; i++) {
          const x = side * (opening / 2 + curbD / 2) + positions.getX(i);
          const z = positions.getZ(i), t = 1 - Math.min(gap, Math.abs(z)) / (depth / 2);
          const surface = eave + rh * (.5 * t + .5 * t * t)
            + .22 * Math.pow(Math.abs(x) / (length / 2), 3) * (1 - t) * (1 - t);
          positions.setXYZ(i, x, surface + curbH / 2 + positions.getY(i), z);
        }
        curb.computeVertexNormals(); frame.push(paint(curb, 0x4a3020));
      }
      // 雨除けの茅を束と横木だけへ載せず、二本の桁・登り垂木・棟木で受ける推定復元。
      // 垂木の上面は gable と同じ曲面の下面へ合わせ、煙の出口を板で塞がない。
      // 屋根と一緒に設営時だけ組み、既存の木材の束へ結合する。
      const capHalf = .75, capRise = .4, capLength = opening + .6;
      const underside = (x, z) => {
        const t = 1 - Math.abs(z) / capHalf;
        return capY + capRise * (.5 * t + .5 * t * t)
          + .22 * Math.pow(Math.abs(x) / (capLength / 2), 3) * (1 - t) * (1 - t) - .2;
      };
      const bearing = underside(opening / 2, gap) - .08;
      for (const x of [-opening / 2, opening / 2]) {
        for (const z of [-gap, gap])
          frame.push(box(.1, bearing - .1 - bottom, .1, x, (bearing - .1 + bottom) / 2, z, 0x4a3020));
        for (const side of [-1, 1]) {
          const timber = new THREE.BoxGeometry(.07, .08, capHalf, 1, 1, 6);
          const positions = timber.attributes.position;
          for (let i = 0; i < positions.count; i++) {
            const z = side * (positions.getZ(i) + capHalf / 2);
            // 幅方向は柱筋の高さを共用し、細い垂木を横へねじらない。
            positions.setXYZ(i, x + positions.getX(i),
              underside(x, z) + positions.getY(i) - .04, z);
          }
          if (side < 0) {
            const indices = timber.index.array;
            for (let i = 0; i < indices.length; i += 3) {
              const a = indices[i]; indices[i] = indices[i + 1]; indices[i + 1] = a;
            }
          }
          timber.computeVertexNormals(); frame.push(paint(timber, 0x4a3020));
        }
      }
      for (const z of [-gap, gap])
        frame.push(box(opening + .1, .1, .1, 0, bearing - .05, z, 0x4a3020));
      // 煙出しの妻では左右の束を陸梁で結ぶ推定復元。
      // 桁方向だけの木組みにせず、梁の木口は左右の束の内面で止める。
      // 両端の柱筋だけに納め、中央の煙道と軒下の出口を空ける。
      const tieTop = bearing - .1;
      for (const x of [-opening / 2, opening / 2])
        frame.push(box(.07, .08, gap * 2 - .1, x, tieTop - .04, 0, 0x4a3020));
      // 棟木の木口は両端の垂木の内面で止め、交点に同じ木の面を重ねない。
      frame.push(box(opening - .07, .08, .08, 0, capY + capRise - .32, 0, 0x4a3020));
      G.add(r, 'wood', frame);
      r.top = capY + .4;
      return;
    }
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
    templeHip(G, r, 'tile', ex, ez, rh, ey, rl);
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
    templeHip(G, r, 'tile', w / 2 + 2.2, d / 2 + 1.6, 1.8, H + 0.4, w / 2 * 0.5);
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
    templeHip(G, r, 'tile', w / 2 + 1.5, w / 2 + 1.5, 2.2, 0.5 + H + 0.2, 0.25);
    r.top = H + 3;
  },
  // 鐘楼：四本柱に梁、釣り鐘（鳴ると警戒）。倒れうる（55章）
  shoro(G, r) {
    const w = r.w, d = r.d, H = 3.2, P = [];
    const open = r.profile === 'honnoji_shoro';
    if (open) {
      // 四方が開いた鐘楼を一つの見えない壁で塞がない。柱だけを避け、石の基壇へ立てる。
      // 床の高さと外形は見える基壇と共用する。造り・段の位置は推定。
      addDeck({ x0: -w / 2 - .7, x1: w / 2 + .7, z0: -d / 2 - .7, z1: d / 2 + .7,
        cx: r.x, cz: r.z, rot: r.rot || 0, y: r.y0 + .3, pad: 0, name: '鐘楼の基壇' });
      const angle = r.rot || 0, c = Math.cos(angle), s = Math.sin(angle), stepZ = d / 2 + .95;
      P.push(box(1.6, .15, .5, 0, .075, stepZ, 0x8a857a));
      addDeck({ x0: -.8, x1: .8, z0: -.25, z1: .25, cx: r.x + stepZ * s, cz: r.z + stepZ * c,
        rot: angle, y: r.y0 + .15, pad: 0, name: '鐘楼の石段' });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) solidCircle2(r, sx * w / 2, sz * d / 2, .18);
    } else solidRect(r.x, r.z, w + 0.6, d + 0.6, r.rot || 0);
    P.push(box(w + 1.4, 0.5, d + 1.4, 0, 0.05, 0, 0x8a857a));
    // 本能寺の側柱は基壇から桁の下面まで。柱頭を横木の上端へ突き抜けさせない（架構は推定）。
    const postH = open ? H + .2 - .11 - .3 : H;
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) P.push(post(0.18, postH, sx * w / 2, 0.3, sz * d / 2, 0x5e4a34, 8));
    P.push(box(w + 0.4, 0.22, 0.22, 0, H + 0.2, d / 2, 0x3a2c1c), box(w + 0.4, 0.22, 0.22, 0, H + 0.2, -d / 2, 0x3a2c1c));
    if (open) {
      // 側面の桁で吊り梁の木口を受ける。梁を柱間へ浮かせず、吊り綱の上端も下面へ当てる。
      for (const x of [-w / 2, w / 2]) P.push(box(.22, .22, d - .22, x, H + .2, 0, 0x3a2c1c));
      P.push(box(w - .22, .22, .22, 0, H + .2, 0, 0x3a2c1c));
      // 開放した四本柱を頭貫でもつなぐ推定の架構。直交する貫は高さを違え、
      // 柱の中で重ねずに通す。木口は柱の外へ八センチ出し、鐘・撞木と頭上の通路を空ける。
      // 既存の木部へ設営時にまとめ、柱の当たりや毎コマの処理は増やさない。
      for (const side of [-1, 1]) {
        P.push(box(w + .52, .12, .12, 0, H - .55, side * d / 2, 0x5e4a34));
        P.push(box(.12, .12, d + .52, side * w / 2, H - .69, 0, 0x5e4a34));
      }
      // 張り天井を作らず、吊り梁の上の束で棟木を受ける化粧屋根裏（架構は推定）。
      // 野地板の下面は屋根面から二十四センチ、垂木の下面は三十八センチ下。
      // 共通の屋根裏と同じ高さへ棟木を納め、鐘の吊り輪は元の梁へ残す。
      const ridgeTop = H + .35 + 1.7 - .38, ridgeBottom = ridgeTop - .2;
      P.push(box(.9, .2, .16, 0, (ridgeTop + ridgeBottom) / 2, 0, 0x3a2c1c));
      for (const x of [-.25, .25])
        P.push(post(.065, ridgeBottom - (H + .31), x, H + .31, 0, 0x5e4a34, 8));
    } else P.push(box(.22, .22, d + .4, 0, H + .25, 0, 0x3a2c1c));
    // 鐘の下を円板で塞がず、厚い駒の爪から内壁を折り返す。入った時にも釣り鐘の口が見える。
    const bell = open ? new THREE.LatheGeometry([
      new THREE.Vector2(0, .7), new THREE.Vector2(.5, .7),
      new THREE.Vector2(.6, -.6), new THREE.Vector2(.64, -.66), new THREE.Vector2(.64, -.7),
      new THREE.Vector2(.56, -.7), new THREE.Vector2(.56, -.62),
      new THREE.Vector2(.45, .61), new THREE.Vector2(0, .61),
    ], 12) : new THREE.CylinderGeometry(0.5, 0.62, 1.4, 12, 1, false);
    // 本能寺の鐘は肩と浅い笠を梁の下へ納め、吊り輪で受ける。笠を梁や屋根へ埋めない（細部は推定）。
    const bellDrop = open ? .25 : 0;
    bell.translate(0, H - .6 - bellDrop, 0); P.push(paint(bell, 0x3a3226));
    const top = new THREE.SphereGeometry(0.5, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2);
    if (open) top.scale(1, .24, 1);
    top.translate(0, H + .1 - bellDrop, 0); P.push(paint(top, 0x3a3226));
    if (open) {
      const ring = new THREE.TorusGeometry(.06, .018, 4, 8);
      ring.translate(0, H + .012, 0); P.push(paint(ring, 0x3a3226));
    }
    if (open) {
      // 撞木を綱だけで代用しない。鐘の口から離した横木を二本の綱で梁から吊るす（推定）。
      // 設営時に既存の木部へまとめ、毎コマの形や材質は増やさない。
      const striker = paint(new THREE.CylinderGeometry(.09, .09, 1.25, 8), 0x5e4a34);
      striker.rotateZ(Math.PI / 2); striker.translate(1.39, H - .65 - bellDrop, 0); P.push(striker);
      // 撞木も鐘と同じだけ下げ、二本の綱は横木の上面から吊り梁の下面まで届かせる。
      for (const x of [.9, 1.4]) P.push(post(.018, .65 + bellDrop, x, H - .56 - bellDrop, 0, 0x8a7a50, 5));
    } else P.push(post(0.06, 1.2, 0.9, H - 1.3, 0, 0x8a7a50, 5));   // 撞木の綱
    G.add(r, 'wood', P);
    templeHip(G, r, 'tile', w / 2 + 1.3, d / 2 + 1.2, 1.7, H + 0.35, 0.3);
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
    if (v === 0) templeHip(G, r, 'tile', w / 2 + 1, d / 2 + 1, (d / 2 + 1) * 0.75, ey, w / 2 * 0.4);
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
    templeHip(G, r, 'bark', w / 2 + 2, d / 2 + 2.2, (d / 2 + 2.2) * 0.8, 1.0 + H + 0.4, w / 2 * 0.5);
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
    const honnoji = r.profile === 'honnoji_kairo' && r.earthen;
    // 土間の廊は地面に接する敷石。板床の廊と同じ黒い台を敷かない。
    if (r.earthen) {
      G.add(r, 'paving', uvScale(box(w + 0.3, 0.12, d, 0, -0.035, 0, 0xb5afa1), w / 2, d / 2));
    } else {
      G.add(r, 'stone', box(w + 0.3, 0.4, d, 0, 0, 0, 0xaaa598));
      for (let i = 0, n = Math.ceil(d / 0.28); i < n; i++) P.push(box(w, 0.1, d / n - 0.008, 0, 0.25, -d / 2 + (i + 0.5) * d / n, varyHex(0x8d7860, i)));
    }
    const n = Math.max(1, Math.round(d / 2.3));
    const stones = [];
    for (let i = 0; i <= n; i++) {
      const z = -d / 2 + i * d / n;
      for (const sx of [-1, 1]) {
        const x = sx * w / 2;
        if (honnoji) {
          // 本能寺の土間廊は敷石上面（二・五センチ）から礎石で角柱を受ける（架構は推定）。
          // 柱頭は桁の下面で止め、柱脚を宙へ浮かせない。既存の柱の当たりは保つ。
          stones.push(box(.36, .12, .36, x, .085, z, 0x77736a));
          P.push(box(.2, 2.57 - .145, .2, x, (.145 + 2.57) / 2, z, 0x5e4230));
        } else P.push(post(0.14, 2.5, x, 0.25, z, 0x5e4230, 6));
        // 柱だけを避ける。柱間は通し、倒壊時には棟の当たりと一緒に取り除く。
        solidCircle2(r, x, z, 0.14);
      }
      // 柱割りごとの梁を両側の桁の内面へ掛け、屋根だけが柱に載る形を避ける。
      // 梁下は二・五三メートル。通る所へ柱や低い横木を増やさない。
      if (honnoji) P.push(box(w - .18, .22, .2, 0, 2.64, z, 0x5e4230));
    }
    if (honnoji) {
      for (const sx of [-1, 1]) P.push(box(.18, .18, d + .2, sx * w / 2, 2.66, 0, 0x5e4230));
      // 形は設営時に既存の材質別のまとまりへ結合し、毎コマの処理は増やさない。
      G.add(r, 'stone', stones);
    }
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
    templeHip(G, r, 'bark', ex, ez, rh, ey, rl);
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
    f.flame.visible = f.inner.visible = !!rec;
    if (!rec) { f.rec = null; f.x = 1e5; f.z = 1e5; f.flame.position.set(1e5, -999, 1e5); f.inner.position.set(1e5, -999, 1e5); if (f.glow) f.glow.position.set(1e5, -999, 1e5); moveSmoke(f.smoke, 1e5, -9999, 1e5, 1); if (f.window) placeFlame(f.window, null); return; }
    const size = Math.min(4.2, 1.8 + Math.sqrt(rec.w * rec.d) * 0.16) * (f.isWindow ? .5 : 1);
    const collapse = rec.collapseScale || 1, rot = rec.rot || 0;
    // 中央の屋根裏に隠さず、棟の上と側面の窓から吹き出す。
    const side = f.isWindow ? rec.w / 2 - .08 : 0;
    const anchor = !f.isWindow && rec.fireRoof;
    const x = anchor ? anchor.x : rec.x + Math.cos(rot) * side, z = anchor ? anchor.z : rec.z - Math.sin(rot) * side;
    const windowY = (rec.kind === 'chudo' ? 1.5 : rec.kind === 'kuri' ? .15 : .4) + 1.4;
    const y = rec.y0 + (f.isWindow ? windowY : anchor ? anchor.y - rec.y0 : (rec.top || 3)) * collapse;
    const moved = f.rec !== rec || f.x !== x || f.z !== z || f.size !== size;
    f.rec = rec; f.x = x; f.z = z; f.size = size; f.base = y + size * .35; f.ly = f.base - W.heightAt(x, z) + size * .3;
    f.lightRadius = Math.max(12, Math.min(28, size * 7));
    // 作り置きの炎も、棟の寸法に合わせて大小を更新する。
    f.flame.scale.set(size * .95, size * 1.3, 1); f.inner.scale.set(size * .6, size * .85, 1);
    f.flame.position.set(x, f.base, z); f.inner.position.set(x, f.base - size * .08, z);
    if (f.glow) {
      // 待機場所から移した火の照りも、実際の地面へ貼り直す。屋根の高さには浮かせない。
      const ground = W.heightAt(x, z), span = f.lightRadius * 2;
      f.glow.position.set(x, ground + 0.025, z); f.glow.scale.setScalar(span);
      f.glowFalloff = 1 / (1 + (y - ground) ** 2 / (f.lightRadius * f.lightRadius));
      if (moved) {
        const p = f.glow.geometry.attributes.position;
        for (let i = 0; i < p.count; i++) p.setY(i, (W.heightAt(x + p.getX(i) * span, z + p.getZ(i) * span) - ground) / span);
        p.needsUpdate = true; f.glow.geometry.computeBoundingSphere();
        W.fireLightT = 0; if (W.fireFill) W.fireFill.time = -1;
      }
    }
    moveSmoke(f.smoke, x, y + size * .5, z, Math.min(4, size * .95));
    if (f.window) placeFlame(f.window, rec);
  }
  function assign() {
    const P = rt.player && rt.player.u ? rt.player.u.pos : { x: 0, z: 0 };
    const B = burning().map((r) => ({ r, s: (Math.sqrt(r.w * r.d) / 6) / (1 + Math.hypot(r.x - P.x, r.z - P.z) / 35) })).sort((a, b) => b.s - a.s);
    // 炎：近い・大きい棟から決まった数だけ。夜は遠い火も見せる。
    const fireReach = W.timeKey === 'night' || W.timeKey === 'dusk' ? 420 : 110;
    const wantF = B.filter((q) => Math.hypot(q.r.x - P.x, q.r.z - P.z) < fireReach).slice(0, MAXF).map((q) => q.r);
    // 煙の空き枠で炎を止めない。棟と窓の対を近い数棟だけ使い回す。
    while (flames.length < wantF.length) {
      const f = W.addFire(1e5, 1e5, { size: 3, blackSmoke: true });
      f.window = W.addFire(1e5, 1e5, { size: 1.5, smoke: false }); f.window.isWindow = true;
      flames.push(f); placeFlame(f, null);
    }
    const keep = new Set();
    for (const f of flames) if (f.rec && wantF.includes(f.rec) && f.rec.state === 1) { keep.add(f.rec); placeFlame(f, f.rec); } else if (f.rec) placeFlame(f, null);
    for (const r of wantF) { if (keep.has(r)) continue; const f = flames.find((q) => !q.rec); if (!f) break; placeFlame(f, r); keep.add(r); }
    // 煙の柱：炎の付かない燃えている棟（遠い地区の火も見える）。同じ群れに二本は立てない
    const used = new Set(wantF.map((r) => r.cl || r.id));
    const wantS = [];
    for (const q of B) { if (wantS.length >= MAXS) break; const k = q.r.cl || q.r.id; if (keep.has(q.r) || used.has(k)) continue; used.add(k); wantS.push(q.r); }
    while (smokes.length < wantS.length && smokeRoom()) { const id = W.addSmokeColumn(1e5, -9999, 1e5, { size: 2, black: true }); if (id == null) break; smokes.push({ id, rec: null }); }
    smokes.forEach((s, i) => {
      const r = wantS[i] || null;
      if (r === s.rec) return;
      s.rec = r;
      if (r) moveSmoke(s.id, r.x, r.y0 + (r.top || 3), r.z, Math.min(4, 1.6 + Math.sqrt(r.w * r.d) * 0.15));
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
