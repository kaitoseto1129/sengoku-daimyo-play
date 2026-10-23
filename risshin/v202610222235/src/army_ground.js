// 戦の跡：歩いた地面と、倒れた兵・旗・得物。形と材質は全て使い回す。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { S, MEM_TIGHT } from './settings.js';
import { DEATH_END } from './units.js';
import { cloneWaterMaterial } from './water_body.js';
import { muddyFlag, lodSwap } from './units_flags.js';
import { groundAt } from './floors.js';
import { dropLazyGeo } from './units_model.js';

// 落下時だけ使う作業場所。形ごとの外周を共有し、頂点全部で地面を調べない。
const litterSupports = new WeakMap();
const litterPoint = new THREE.Vector3(), litterNormal = new THREE.Vector3();
const litterUp = new THREE.Vector3(0, 1, 0), litterTurn = new THREE.Quaternion();
export function slopeLitter(o, world, y) {
  const { x, z } = o.position, e = 0.4;
  litterNormal.set(groundAt(world, x - e, z, y) - groundAt(world, x + e, z, y), 2 * e,
    groundAt(world, x, z - e, y) - groundAt(world, x, z + e, y)).normalize();
  o.quaternion.premultiply(litterTurn.setFromUnitVectors(litterUp, litterNormal));
}
function supportPoints(g) {
  let points = litterSupports.get(g);
  if (points) return points;
  points = [];
  const p = g.attributes.position;
  // 軸と斜めの計26方向の端。箱の空いた隅ではなく、実際の形の点で支える。
  for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
    if (!x && !y && !z) continue;
    let best = -Infinity, index = -1;
    for (let i = 0; i < p.count; i++) {
      const d = p.getX(i) * x + p.getY(i) * y + p.getZ(i) * z;
      if (d > best) { best = d; index = i; }
    }
    if (index >= 0 && !points.includes(index)) points.push(index);
  }
  litterSupports.set(g, points);
  return points;
}
export function contactLitter(o, world, y, gap = 0.015) {
  // 地面へ移す直前の物を対象に、見える子部品（穂先・弦など）も一緒に支える。
  o.updateMatrixWorld(true);
  let lift = -Infinity;
  o.traverseVisible((m) => {
    const p = m.geometry?.attributes.position;
    if (!p) return;
    for (const i of supportPoints(m.geometry)) {
      litterPoint.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld);
      lift = Math.max(lift, groundAt(world, litterPoint.x, litterPoint.z, y) + gap - litterPoint.y);
    }
  });
  if (Number.isFinite(lift)) o.position.y += lift;
}

// 寝た軽い体：胴の厚みと裾の垂れ。倒れる四方向・元の形ごとに一度だけ作る。
// 倒れた体の形：元の形を弱い鍵にする（強い表だと、倒れた兵の元の形（写す時に GPU から読み戻した配列ごと）を戦の終わりまで抱え、
//   森部で死体 200 で 90MB まで伸びていた。10/20）。作った写しは戦の片付けのために別に覚える
let fallenBodies = new WeakMap();
const fallenMade = new Set();
function fallenBody(src, direction) {
  let variants = fallenBodies.get(src);
  if (!variants) { variants = []; fallenBodies.set(src, variants); }
  if (variants[direction]) return variants[direction];
  const g = bendFallen(src, direction);
  // 写しは GPU へ送った後に CPU の配列を手放す（main.js の gpuOnly）。描かれないまま残る写しは、iPhone では units.js の
  //   掃除（dropLazyGeo）が配列を手放し、要る時にここで作り直す（_make）。clone は印を写さない
  // 囲み（箱と球）は配列があるうちに作る。手放した後に視野の判定や影の箱で求めると、GPU から読み戻して待たせる（10/23）
  if (!g.boundingBox) g.computeBoundingBox(); if (!g.boundingSphere) g.computeBoundingSphere();
  for (const k in g.attributes) g.attributes[k].gpuOnly = true; if (g.index) g.index.gpuOnly = true;
  g._make = () => bendFallen(src, direction);
  variants[direction] = g; fallenMade.add(g);
  // 写すために元の形の配列を作り直した（lazyGeo）。元はもう倒れた兵の形ではないので、配列はまた手放す（要れば作り直す）
  if (MEM_TIGHT) dropLazyGeo(src);
  return g;
}
function bendFallen(src, direction) {
  const g = src.clone(), p = g.attributes.position, m = g.attributes.mtl;
  // 元の形の表の鍵（ck）を写さない（作り直した時に元の鍵の表へ倒れた形を入れてしまう）
  delete g.userData.ck; delete g.userData.cpuUse; delete g.userData.gpuUse;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const chest = Math.max(0, 1 - Math.abs(y - 1.16) / 0.3);
    let xx = x, zz = z * (1 + chest * 0.12);
    // 布だけを地面側へ垂らす。肩・帯と、鉄の草摺は形を保つ。
    if (m && Math.floor(m.getX(i)) % 8 === 0 && y > 0.65 && y < 1.35 && (Math.abs(x) > 0.22 || Math.abs(z) > 0.22)) {
      const sag = Math.min(0.07, (1.35 - y) * 0.12);
      if (direction < 2) zz += (direction === 0 ? 1 : -1) * sag;
      else xx += (direction === 2 ? 1 : -1) * sag;
    }
    p.setXYZ(i, xx, y, zz);
  }
  g.computeVertexNormals(); g.computeBoundingBox(); g.computeBoundingSphere();
  return g;
}

// 元の材質を変えず、薄さ四段の材質を敵味方で共用する。
const fadeMats = new Map();
let groundObjects = new WeakMap();
const groundFlagMats = new Map();
// 倒れた体の元の色と濡れ方を保ち、顔・縅・籠手・脛当を弱い散乱光で拾う。
// 同じ材質の兵は補光用も共有する。部品や光源は増やさない。
const fallenMats = new Map();
export function fallenMaterial(src) {
  if (!src || src.userData?.fallenContour || src.userData?.faded) return src;
  let mat = fallenMats.get(src);
  if (mat) return mat;
  if (Array.isArray(src)) mat = src.map(fallenMaterial);
  else {
    if (!src.isMeshStandardMaterial && !src.isMeshLambertMaterial && !src.isMeshPhongMaterial) return src;
    mat = cloneWaterMaterial(src);
    mat.userData.fallenContour = true;
    // 兵の束（units.js batchDraw）が、倒れた兵も同じ補光の束で描けるよう元の材質を覚える
    Object.defineProperty(mat.userData, 'fallenSrc', { value: src, configurable: true });
    mat.customProgramCacheKey = () => src.customProgramCacheKey() + '|fallenContour';
    mat.onBeforeCompile = (sh, renderer) => {
      src.onBeforeCompile(sh, renderer);
      sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        // 色の付いた面の明るさを底上げし、見る角度の浅い縁だけ少し強くする。
        float fallenRim = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 3.0);
        reflectedLight.indirectDiffuse += diffuseColor.rgb * (0.12 + fallenRim * 0.1)
          + vec3(0.012, 0.014, 0.017) * fallenRim;`);
    };
  }
  fallenMats.set(src, mat);
  // 材質の配列も次の半秒に作り直さない。
  fallenMats.set(mat, mat);
  return mat;
}
// 倒れた体の材質を前もって作る（main.js が支度の間に絵の仕組みを作るため）
export function fallenVariant(src) { return fallenMaterial(src); }
function groundFlagMaterial(src) {
  let mat = groundFlagMats.get(src);
  if (!mat) {
    // 地に伏せた布ははためかせない。汚れた色だけを共有し、低画質でも束ねられる。
    mat = cloneWaterMaterial(muddyFlag(src));
    mat.transparent = false; mat.opacity = 1; mat.forceSinglePass = true;
    groundFlagMats.set(src, mat);
  }
  return mat;
}
// 支度と本番で、地に伏せた旗も同じ材質を使う。
export function groundFlagVariant(src) { return groundFlagMaterial(src); }
// 落ちた指物も竿と横木を残す。形と材質は一つだけ作り、布と同じ向きに寝かせる。
let groundFlagPoleGeo = null, groundFlagPoleMat = null;
function groundFlagPole() {
  if (!groundFlagPoleGeo) {
    const pole = new THREE.CylinderGeometry(0.012, 0.015, 1.4, 4);
    pole.translate(0, -0.34, 0.012);
    const bar = new THREE.CylinderGeometry(0.009, 0.009, 0.38, 4);
    bar.rotateZ(Math.PI / 2); bar.translate(0.18, 0.375, 0.012);
    groundFlagPoleGeo = mergeGeometries([pole, bar]);
    pole.dispose(); bar.dispose();
    groundFlagPoleMat = new THREE.MeshStandardMaterial({ color: 0x493723, roughness: 1 });
  }
  return new THREE.Mesh(groundFlagPoleGeo, groundFlagPoleMat);
}
const groundFlagGeos = new Map(), crumpledFlagGeos = new Map();
function groundFlagGeometry(src, crumpled = false) {
  const cache = crumpled ? crumpledFlagGeos : groundFlagGeos;
  if (cache.has(src)) return cache.get(src);
  const g = src.clone(), pa = g.attributes.position;
  for (let i = 0; i < pa.count; i++) {
    const x = pa.getX(i), y = pa.getY(i);
    if (crumpled) {
      // 横木の辺は保ち、下の布は縮んで皺になる。寝かせた後は地上二〜六センチ。
      const loose = Math.max(0, Math.min(1, (.36 - y) / .72));
      pa.setXY(i, x * (1 - loose * .18), y + loose * .08);
      pa.setZ(i, -.008 - Math.abs(Math.sin(x * 27 + y * 19)) * .035 * loose);
    } else pa.setZ(i, -Math.abs(Math.sin(x * 27 + y * 19)) * 0.018);
  }
  g.computeVertexNormals(); cache.set(src, g);
  return g;
}
function fadedMaterial(mat, step) {
  // 材質でない部品は複製しない。
  if (!mat?.isMaterial || typeof mat.clone !== 'function') return mat;
  let levels = fadeMats.get(mat);
  if (!levels) { levels = []; fadeMats.set(mat, levels); }
  if (!levels[step]) {
    // 濡れた材質の元への参照を保つ。通常の複製では参照が失われ、
    // 乾く時に薄れた材質を元と取り違えて、複製を重ねてしまう。
    const m = cloneWaterMaterial(mat);
    // 背の旗を遠い形へ戻す処理が、薄れた材質を上書きしないようにする。
    m.userData.faded = true;
    m.onBeforeCompile = mat.onBeforeCompile;
    m.customProgramCacheKey = mat.customProgramCacheKey;
    m.transparent = true; m.depthWrite = false; m.forceSinglePass = true;
    // 薄れる時も、布の外の透明な余白を板に戻さない。
    m.alphaTest = mat.alphaTest * (1 - step / 5);
    m.forceSinglePass = true;
    m.opacity = mat.opacity * (1 - step / 5);
    levels[step] = m;
  }
  return levels[step];
}
export function fadedVariant(src) { return fadedMaterial(src, 1); }
function fadeObject(o, step) {
  if (!step) return;
  let state = groundObjects.get(o);
  if (state?.step === step) return;
  if (!state) {
    state = { step: 0, material: o.material, levels: [] };
    groundObjects.set(o, state);
  }
  state.step = step;
  if (o.isMesh) {
    const src = state.material;
    if (Array.isArray(src)) {
      // 複数材質の配列も一度作って使い回す。
      const levels = state.levels;
      if (!levels[step]) levels[step] = src.map(m => fadedMaterial(m, step));
      o.material = levels[step];
    } else o.material = fadedMaterial(src, step);
    o.castShadow = false;
  }
  for (const c of o.children) fadeObject(c, step);
}
// 束ねる前の部品数で見積もるので、束ねられない顔・薄れた物も上限に入る。
function drawCost(o, fallen = false) {
  if (fallen && o.isMesh) o.material = fallenMaterial(o.material);
  let n = o.isMesh ? (Array.isArray(o.material) ? (o.geometry?.groups.length || o.material.length) : 1) * (o.castShadow ? 2 : 1) : 0;
  for (const c of o.children) if (c.visible) n += drawCost(c, fallen);
  return n;
}

// 開戦時の落とし物も、実際に落ちた物と同じ寿命・距離・総数の枠で扱う。
let clashHat, clashArrow, clashHatMat, clashArrowMat;
// 元の共有素材が残ると弱参照の写しも残る。場面から外れた薄さの途中段階まで返す。
export function disposeBattleGround(resources) {
  fallenBodies = new WeakMap();
  for (const cache of [fallenMade, fadeMats, groundFlagMats, fallenMats, groundFlagGeos, crumpledFlagGeos]) {
    for (const value of cache.values()) resources.add(value);
    cache.clear();
  }
  resources.add([groundFlagPoleGeo, groundFlagPoleMat, clashHat, clashArrow, clashHatMat, clashArrowMat]);
  groundFlagPoleGeo = groundFlagPoleMat = null;
  clashHat = clashArrow = clashHatMat = clashArrowMat = null;
  groundObjects = new WeakMap();
}
function clashGroundKit() {
  if (clashHat) return;
  clashHat = new THREE.ConeGeometry(0.29, 0.12, 8, 1, true);
  clashHat.translate(0, 0.06, 0);
  const shaft = new THREE.CylinderGeometry(0.008, 0.008, 0.85, 4, 1, true);
  shaft.rotateZ(Math.PI / 2);
  const head = new THREE.ConeGeometry(0.025, 0.09, 4, 1, true);
  head.rotateZ(-Math.PI / 2); head.translate(0.47, 0, 0);
  const feather = new THREE.PlaneGeometry(0.12, 0.045); feather.translate(-0.32, 0, 0);
  const feather2 = feather.clone(); feather2.rotateX(Math.PI / 2);
  clashArrow = mergeGeometries([shaft, head, feather, feather2]);
  for (const g of [shaft, head, feather, feather2]) g.dispose();
  clashHatMat = new THREE.MeshLambertMaterial({ color: 0x514433, side: THREE.DoubleSide });
  clashArrowMat = new THREE.MeshLambertMaterial({ color: 0x66523a, side: THREE.DoubleSide });
}

export const ArmyGround = {
  seedClashGround(x, z, outer = false) {
    clashGroundKit();
    const hats = outer ? 1 : 2, arrows = outer ? 3 : 5, marks = outer ? 3 : 5;
    for (let i = 0; i < hats + arrows; i++) {
      const hat = i < hats, a = i * 2.399 + (outer ? 0.7 : 0);
      const r = 1.2 + (i % 4) * 0.75;
      const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r * (outer ? 2 : 1.2);
      const o = new THREE.Mesh(hat ? clashHat : clashArrow, hat ? clashHatMat : clashArrowMat);
      o.position.set(px, groundAt(this.world, px, pz, this.world.heightAt(px, pz)), pz);
      o.rotation.set(hat ? 0.15 : 0, a, hat ? 0.2 : 0);
      slopeLitter(o, this.world, o.position.y); contactLitter(o, this.world, o.position.y);
      this.scene.add(o); this.keepLitter(o);
    }
    for (let i = 0; i < marks; i++) {
      const a = i * 2.4 + 0.4, r = 0.6 + i * 0.62;
      // 血を控える設定と、既存の三十二枚の上限はそのまま使う。
      this.stain(x + Math.cos(a) * r, z + Math.sin(a) * r, 0.85 + (i % 3) * 0.28, 120);
    }
  },
  foldGroundFlag(flag) {
    flag.geometry = groundFlagGeometry(flag.geometry, true);
    flag.material = groundFlagMaterial(flag.material);
    // 柄への留め位置と布の長さは保つ。縮小すると乳が竿から離れてしまう。
  },
  fadeGround(o, step) { fadeObject(o, step); },
  keepLitter(o) {
    if (!o || o.parent !== this.scene || o.userData.groundKept) return;
    o.userData.groundKept = true;
    const list = this.litter || (this.litter = []);
    list.push(o);
    o.userData.groundAt = this.time;
    // 同じ足元へ槍・矢・落ちた具足を積み上げない。落ちた時だけ近い跡を数える。
    let nearby = 0, oldest = null;
    for (const a of list) {
      if (a === o || a.userData.groundFadeAt != null || Math.abs(a.position.y - o.position.y) > 0.6) continue;
      if ((a.position.x - o.position.x) ** 2 + (a.position.z - o.position.z) ** 2 > 4) continue;
      nearby++;
      if (!oldest || a.userData.groundAt < oldest.userData.groundAt) oldest = a;
    }
    if (nearby >= (this.world.def.spreadFalls ? 2 : 4) && oldest) { oldest.userData.groundFadeAt = this.time; fadeObject(oldest, 1); }
    const cap = 120;
    this.trimLitter(cap);
  },

  trimLitter(cap = 120) {
    const list = this.litter;
    if (!list) return;
    const view = this._groundView || this.playerUnit?.pos;
    let active = 0;
    for (const o of list) if (o.userData.groundFadeAt == null) active++;
    while (active > cap) {
      let best = null, far = -1;
      for (const o of list) {
        if (o.userData.groundFadeAt != null) continue;
        const d = view ? (o.position.x - view.x) ** 2 + (o.position.z - view.z) ** 2 : this.time - o.userData.groundAt;
        if (d > far) { far = d; best = o; }
      }
      if (!best) break;
      best.userData.groundFadeAt = this.time; fadeObject(best, 1); active--;
    }
    // 薄れ待ちは四つまで。急に大量に落ちた時も描く数を膨らませない。
    while (list.length > cap + 4) {
      let index = -1, far = -1;
      for (let i = 0; i < list.length; i++) {
        const o = list[i];
        if (o.userData.groundFadeAt == null) continue;
        const d = view ? (o.position.x - view.x) ** 2 + (o.position.z - view.z) ** 2 : this.time - o.userData.groundAt;
        if (d > far) { far = d; index = i; }
      }
      if (index < 0) break;
      this.scene.remove(list[index]); list.splice(index, 1);
    }
  },

  fallenKit(u) {
    if (u.groundKit || u.isPlayer || u.type === 'dummy') return;
    u.groundKit = true;
    if (u.body && !u.mounted && !u.death?.aid) {
      const side = Math.abs(u.mesh.rotation.z) > Math.abs(u.mesh.rotation.x);
      const direction = side ? (u.mesh.rotation.z > 0 ? 3 : 2) : (u.mesh.rotation.x > 0 ? 0 : 1);
      const lod = u.body.userData.lod;
      // 画質「低」の遠い形（9m より先）は布の垂れ（数cm）を作り分けない。倒れた向きごとに束が四つに分かれていた
      if (lod) lodSwap(u.body, fallenBody(lod[0], direction), fallenBody(lod[1], direction), lod[2]);
      else u.body.geometry = fallenBody(u.body.geometry, direction);
    }
    this.keepLitter(u.dropped); this.keepLitter(u.hatOff);
    // 折れるのは一部の槍だけ。既存の柄と穂の形を二つに分ける。
    const w = u.dropped, F = w?.userData.flex;
    if (F && w.parent === this.scene && u.id % 7 === 0) {
      w.geometry = F.G.s0;
      const a = F.a;
      a.userData.groundSpear = true;
      w.remove(a); a.visible = F.b.visible = true;
      a.position.set(0, 0, F.G.j1).applyQuaternion(w.quaternion).add(w.position);
      a.quaternion.copy(w.quaternion); a.rotateY(0.28);
      a.position.x += Math.cos(u.heading) * 0.18;
      a.position.z -= Math.sin(u.heading) * 0.18;
      a.position.y = this.world.heightAt(a.position.x, a.position.z) + 0.035;
      if (true) {
        a.rotation.set(0, w.rotation.y + 0.28, 0, 'YXZ');
        slopeLitter(a, this.world, u.pos.y);
        contactLitter(a, this.world, u.pos.y, 0.025);
        // 折れた後の元の柄も、残った長さで接地し直す。
        contactLitter(w, this.world, u.pos.y, 0.025);
      }
      this.scene.add(a); this.keepLitter(a);
    }
    // 弾よけを持っていた兵だけ、その竹束を残す。体が消えても盾まで消さない。
    const shield = u.tatake;
    if (shield?.parent === u.mesh) {
      const a = u.heading, sx = Math.sin(a), sz = Math.cos(a);
      const x = u.pos.x + sx * 0.65, z = u.pos.z + sz * 0.65;
      if (!this.world.inWaterAt(x, z)) {
        const y0 = this.world.heightAt(x, z), y1 = this.world.heightAt(x + sx * 1.8, z + sz * 1.8);
        shield.position.set(x, y0 + 0.09, z);
        shield.rotation.set(Math.PI / 2 + Math.atan2(y0 - y1, 1.8), a, 0, 'YXZ');
        shield.castShadow = false;
        this.scene.add(shield); this.keepLitter(shield);
      }
    }
    // 身に付けていた旗だけを残す。持っていない盾は増やさない。
    if (!u.flag || !(u.tag === 'flag' || u.id % 8 === 0)) return;
    const crumpled = !!this.world.def.crumpledFlags;
    const a = u.heading + u.id * 0.73, x = u.pos.x + (crumpled ? u.death?.sx || 0 : 0) + Math.sin(a) * 0.8, z = u.pos.z + (crumpled ? u.death?.sz || 0 : 0) + Math.cos(a) * 0.8;
    if (this.world.inWaterAt(x, z)) return;
    const m = new THREE.Mesh(groundFlagGeometry(u.flag.geometry, crumpled), groundFlagMaterial(u.flagMat || u.flag.material));
    m.scale.copy(u.flag.scale);
    if (crumpled) m.scale.multiplyScalar(Math.min(1, 1.15 / Math.max(m.scale.x, m.scale.y)));
    m.add(groundFlagPole());
    m.position.set(x, this.world.heightAt(x, z) + 0.025, z);
    const gx = this.world.heightAt(x + 0.5, z) - this.world.heightAt(x - 0.5, z);
    const gz = this.world.heightAt(x, z + 0.5) - this.world.heightAt(x, z - 0.5);
    m.rotation.set(Math.PI / 2 - Math.atan(gx * Math.sin(a) + gz * Math.cos(a)), a, Math.atan(gx * Math.cos(a) - gz * Math.sin(a)), 'YXZ');
    this.scene.add(m); this.keepLitter(m);
    u.flag.visible = false;
  },

  clearCorpse(index) {
    const u = this.dead.splice(index, 1)[0];
    if (u.death?.aid) this.endAid(u);
    // 上限による片付けも、倒れる姿勢と床への接地を先に完了する。
    if (u.death && !u.mounted && u.death.t < DEATH_END)
      this.animDeath(u, DEATH_END - u.death.t, false);
    this.dropWeapon(u);
    this.fallenKit(u);
    this.corpseAt(u, -1);
    u.gone = true;
    this.scene.remove(u.mesh);
    // 上限に達して倒れる途中で片付けた時も、手の槍は地面に残す。
    this.keepLitter(u.dropped); this.keepLitter(u.hatOff);
    for (const a of this.arrows) if (a.host === u) a.life = 0;
  },

  trimCorpses() {
    const cap = 64;
    while (this.dead.length > cap) {
      // 手当て中の兵と自分を守り、見る所から遠い亡骸を先に片付ける。
      const view = this._groundView || this.playerUnit?.pos;
      let index = -1, far = -1;
      for (let i = 0; i < this.dead.length; i++) {
        const u = this.dead[i];
        if (u.isPlayer || u.death?.aid) continue;
        if (u.mounted ? u.deadT < 4 : u.death ? u.death.t < DEATH_END : u.deadT < 1) continue;
        const d = view ? (u.pos.x - view.x) ** 2 + (u.pos.z - view.z) ** 2 : this.time - u.killedAt;
        if (d > far) { far = d; index = i; }
      }
      if (index < 0) break;
      this.clearCorpse(index);
    }
  },

  groundTick(dt, focus, cam) {
    // 足元は十組に分け、半秒で全員を巡る。兵数・足跡の頻度・踏み倒す量は保つ。
    // 長い停止の後も過去の足運びをまとめて再生しない。配列や待ち行列は作らない。
    this.groundStepT = (this.groundStepT || 0) + dt;
    const phases = Math.min(10, Math.floor((this.groundStepT + 1e-9) / 0.05));
    const phase = this.groundPhase || 0;
    if (phases) {
      this.groundStepT %= 0.05;
      // 丸め誤差で半秒の境目を次のコマへ持ち越さない。
      if (this.groundStepT > 0.05 - 1e-9) this.groundStepT = 0;
      this.groundPhase = (phase + phases) % 10;
    }
    const w = this.world, wet = w.rainLevel > 0.4 || w.wetness > 0.5;
    if (phases) for (const u of this.units) {
      if (!u.alive || u.isPlayer || u.type === 'dummy' || u.gone) continue;
      if ((u.id % 10 - phase + 10) % 10 >= phases) continue;
      const x = u.pos.x, z = u.pos.z;
      const dx = x - (u.groundX ?? x), dz = z - (u.groundZ ?? z);
      const moved2 = dx * dx + dz * dz;
      u.groundX = x; u.groundZ = z;
      if ((moved2 < 0.0625 && !u.atk && !u.target) || moved2 > 100) continue;
      if (w.inWaterAt(x, z, u.pos.y)) {
        // 半秒ごとの足運びから確実に水を跳ねる。橋の上と遠い兵には出さない。
        const view = focus || this.playerUnit?.pos;
        if (moved2 >= 0.0625 && view && (x - view.x) ** 2 + (z - view.z) ** 2 < 30 ** 2) w.spray(x, z, u.mounted ? 5 : 3);
        continue;
      }
      if (w.inWaterAt(x, z) || Math.abs(u.pos.y - w.heightAt(x, z)) > 0.7) continue;
      // 土煙の描画距離によらず足跡を貯める。立ち合い中の足踏みも少しずつ草を倒す。
      const radius = u.mounted ? 1.5 : 0.9;
      const steps = Math.min(4, Math.max(1, Math.ceil(Math.sqrt(moved2) / (radius * 1.5))));
      const amount = (wet ? 8 : 5) * (u.mounted ? 1.6 : 1);
      // 走った区間にも跡を補う。半秒に最大四点、形や配列は作らない。
      for (let i = 1; i <= steps; i++) {
        const px = x - dx * (1 - i / steps), pz = z - dz * (1 - i / steps);
        if (!w.inWaterAt(px, pz)) w.stampWear(px, pz, radius, amount);
      }
      // 近い敵味方だけ、既存の四百枠に実際の足運びの向きで跡を残す。
      const view = focus || this.playerUnit?.pos;
      // 既存の煙の枠を使い、近い兵の踏み込みにだけ低い土煙を添える。
      // 半秒ごとの足運びを間引き、湿った岸や水面では乾いた煙を増やさない。
      if (!S.reduceMotion && !wet && moved2 >= 0.0625 && view &&
          (x - view.x) ** 2 + (z - view.z) ** 2 < 22 ** 2 &&
          (u.id + Math.floor(this.time * 2)) % 4 === 0 && w.dustVeil?.list.length < 18) {
        const dust = w.dustCloud(x, z, false, true);
        if (dust) { dust.s0 = 0.35; dust.s1 = u.mounted ? 2.1 : 1.2; dust.life = 1.4;
          dust.a *= 1.5; dust.rise = 0.035; dust.fin = 5; }
      }
      if (moved2 >= 0.0625 && view && (x - view.x) ** 2 + (z - view.z) ** 2 < 24 ** 2)
        w.footprint(x, z, u.mounted, Math.atan2(dx, dz));
    }
    // 布の垂れの形づくり・落とし物の接地は一コマ一人まで。
    // 一斉射撃で倒れた兵の四秒後に、全員分の複製と法線計算を重ねない。
    // 生きた兵の動きと当たりは待たせず、亡骸の元の姿も作業中は残す。
    const deadCount = this.dead.length;
    for (let checked = 0; checked < deadCount; checked++) {
      const i = (this.groundKitNext || 0) % deadCount;
      this.groundKitNext = i + 1;
      const u = this.dead[i];
      if (u.groundKit || u.isPlayer || u.type === 'dummy' || this.time - u.killedAt < 4) continue;
      this.fallenKit(u);
      break;
    }
    // 亡骸と落とし物の描画予算は、これまでどおり半秒ごとに全体で数える。
    this.groundT = (this.groundT || 0) - dt;
    if (this.groundT > 0) return;
    this.groundT = 0.5;
    this._groundView = cam || focus || this.playerUnit?.pos;
    this.trimCorpses();
    const low = false, far = low ? 45 : 70;
    // 半秒ごとに描く部品を数える。影も含め、この跡に使う回数を抑える。
    let budget = low ? 140 : 300;
    const view = this._groundView;
    for (let i = this.dead.length - 1; i >= 0; i--) {
      const u = this.dead[i], age = this.time - u.killedAt;
      if (u.isPlayer) continue;
      const d = view ? (u.pos.x - view.x) ** 2 + (u.pos.z - view.z) ** 2 : 0;
      const near = focus || this.playerUnit?.pos || view;
      const playerD = near ? (u.pos.x - near.x) ** 2 + (u.pos.z - near.z) ** 2 : 0;
      // 倒れる動きが終わり、本人とカメラの両方から十分遠ければ先に片付ける。
      if (!u.death?.aid && (age >= 90 || age >= 12 && d > (far + 15) ** 2 && playerD > (far + 15) ** 2)) { this.clearCorpse(i); continue; }
      const cost = drawCost(u.mesh, true);
      // 亡骸は片付けるまで不透明に保つ。輪や透けた体を床の上へ残さない。
      u.mesh.visible = d <= far * far && cost <= budget;
      if (u.mesh.visible) budget -= cost;
    }
    // 戦の途中で画質を下げた時も、次の落下を待たず低画質の上限へ戻す。
    this.trimLitter();
    const list = this.litter;
    if (!list) return;
    for (let i = list.length - 1; i >= 0; i--) {
      const o = list[i], age = this.time - o.userData.groundAt;
      const retiring = o.userData.groundFadeAt == null ? 0 : this.time - o.userData.groundFadeAt + 0.5;
      // 長い槍は八秒後から薄れ、二十秒で片付ける。短い得物と旗は元の時間を保つ。
      const fadeAt = o.userData.groundSpear ? 8 : 95, endAt = o.userData.groundSpear ? 20 : 120;
      if (retiring >= 2.5 || age >= endAt) { this.scene.remove(o); list.splice(i, 1); continue; }
      if (retiring > 0 || age > fadeAt) fadeObject(o, Math.min(4, Math.max(Math.ceil(retiring * 2), Math.ceil((age - fadeAt) / (o.userData.groundSpear ? 3 : 5)))));
      const d = view ? (o.position.x - view.x) ** 2 + (o.position.z - view.z) ** 2 : 0;
      const cost = drawCost(o);
      o.visible = d <= (low ? 35 : 65) ** 2 && cost <= budget;
      if (o.visible) budget -= cost;
    }
  },
};
