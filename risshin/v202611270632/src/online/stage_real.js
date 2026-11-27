// K678 ①（kaito 11/25「見た目ほんとにやばい」）：オンラインの武将の札の後ろの軍勢を、本編の兵と馬で立てる。
//   前は world_army_geometry.js の軽い形（棒人間の木の人形・箱の馬）を並べていて、K285（本物の兵しか映さない）に背いていた。
//   本編の骨の人（mhbody・陣笠・御貸具足・実写の顔）と骨の馬（horse.bin）を一人ずつ作り、立ち姿の一コマを形に焼いて（骨を解いた形）、
//   その形を InstancedMesh で並べる。焼いた後は骨の人も骨の馬も手放す（記憶は焼いた形の分だけ。K675）。
//   作れない時（素材が読めない等）は null を返し、呼ぶ側は後ろを景色だけにする（棒人間は出さない）。
import * as THREE from 'three';

const v = new THREE.Vector3(), n = new THREE.Vector3(), p2 = new THREE.Vector3();
const shown = (o, top) => { for (let q = o; q && q !== top; q = q.parent) if (!q.visible) return false; return true; };

// 位置を自分で出す材質（鬣・尾の毛：humans_horse_materials.js が project_vertex を差し替え modelMatrix だけで置く）は、
//   並べる時に一頭ごとの置き場（instanceMatrix）を見ず、全部の毛が一か所に重なった。並べる形では毛の揺れを外した写しを使う
const FIX = new WeakMap();
function matFix(mt) {
  const f = mt.onBeforeCompile;
  const src = f ? String(f) : '';
  if (!f || f === THREE.Material.prototype.onBeforeCompile || !/project_vertex/.test(src) || /project_vertex>['"`],\s*['"`]#include <project_vertex>/.test(src)) return mt;
  if (!FIX.has(mt)) { const c = mt.clone(); c.onBeforeCompile = THREE.Material.prototype.onBeforeCompile; c.customProgramCacheKey = THREE.Material.prototype.customProgramCacheKey; FIX.set(mt, c); }
  return FIX.get(mt);
}

// 一つの姿（u.mesh の下の全部）を、root から見た形に焼く。材質ごとに一つの形へまとめる
function bake(top, mergeGeometries) {
  top.updateMatrixWorld(true);
  const inv = top.matrixWorld.clone().invert(), byMat = new Map();
  const m4 = new THREE.Matrix4(), nm = new THREE.Matrix3();
  top.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || !o.geometry?.attributes?.position || !shown(o, top)) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    if (mats.some((mt) => !mt || mt.isShaderMaterial || mt.isPointsMaterial)) return;
    const src = o.geometry, pos = src.attributes.position, nor = src.attributes.normal;
    const g = new THREE.BufferGeometry();
    const P = new Float32Array(pos.count * 3), N = nor ? new Float32Array(pos.count * 3) : null;
    m4.multiplyMatrices(inv, o.matrixWorld); nm.getNormalMatrix(m4);
    if (o.isSkinnedMesh) o.skeleton?.update();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      if (N) n.fromBufferAttribute(nor, i);
      if (o.isSkinnedMesh) {
        // 法線は「点＋法線」も同じ骨で動かして差を取る（剛体の部品は正しく、曲がる所もほぼ正しい）
        if (N) { p2.copy(v).addScaledVector(n, 0.01); o.applyBoneTransform(i, p2); }
        o.applyBoneTransform(i, v);
        if (N) n.subVectors(p2, v);
      }
      v.applyMatrix4(m4); P.set([v.x, v.y, v.z], i * 3);
      if (N) { if (o.isSkinnedMesh) n.transformDirection(m4); else n.applyMatrix3(nm); n.normalize(); N.set([n.x, n.y, n.z], i * 3); }
    }
    g.setAttribute('position', new THREE.BufferAttribute(P, 3));
    if (N) g.setAttribute('normal', new THREE.BufferAttribute(N, 3)); else g.computeVertexNormals();
    for (const k of ['uv', 'color']) if (src.attributes[k]) g.setAttribute(k, src.attributes[k].clone());
    if (src.index) g.setIndex(src.index.clone());
    const groups = src.groups.length && Array.isArray(o.material) ? src.groups : [{ start: 0, count: src.index ? src.index.count : pos.count, materialIndex: 0 }];
    for (const gr of groups) {
      const mt = matFix(mats[gr.materialIndex] || mats[0]);
      const part = g.clone();
      if (groups.length > 1) part.clearGroups();
      if (groups.length > 1 && part.index) { const ix = part.index.array.slice(gr.start, gr.start + gr.count); part.setIndex(new THREE.BufferAttribute(ix, 1)); }
      if (!byMat.has(mt)) byMat.set(mt, []);
      byMat.get(mt).push(part);
    }
    g.dispose();
  });
  const parts = [];
  for (const [mt, list] of byMat) {
    // 同じ材質の部品を一つにまとめる（描く回数を減らす）。属性が揃わない時は別のまま
    const keyOf = (g) => Object.keys(g.attributes).sort().join(',') + (g.index ? '#i' : '');
    const bucket = new Map();
    for (const g of list) { const k = keyOf(g); if (!bucket.has(k)) bucket.set(k, []); bucket.get(k).push(g); }
    for (const gs of bucket.values()) {
      let one = gs.length > 1 && mergeGeometries ? mergeGeometries(gs, false) : null;
      if (one) for (const g of gs) g.dispose(); else one = null;
      if (one) parts.push({ geo: one, mat: mt }); else for (const g of gs) parts.push({ geo: g, mat: mt });
    }
  }
  return parts;
}

// 戦の中の兵と同じ組み立て：buildModel → 腕の構え →（騎馬なら鞍へ）→ 骨の人 → 立ち姿の一コマ
async function makeOne(look, ride) {
  const [U, H, HH] = await Promise.all([import('../units.js'), import('../humans.js'), import('../humans_horses.js')]);
  const u = {};
  const m = U.buildModel(u, look);
  if (u.hand) u.hand.rotation.x = -0.5;
  U.poseArms(u);
  let horse = null;
  if (ride) {
    await H.loadHorse?.();
    horse = U.buildHorse();
    U.Army.prototype.setMounted.call({ world: { def: {} } }, u, true, horse);
    if (!HH.showHorse(horse)) { /* 骨の馬が無ければ形の馬（buildHorse の細かい形）のまま */ }
  }
  u.pos = m.position; u.alive = true; u.heading = 0; u.moving = 0; u.forceSpd = 0; u.wpnKind = look.weapon; u.portrait = true; u.focusD = 0;   // 柄を拳の中に通して握る（preview.js と同じ）
  if (!H.showHuman(u)) { if (horse) HH.detachReal?.(horse); return null; }
  for (let i = 0; i < 24; i++) { u.pos = u.mesh.position; H.stepHuman(u, 1 / 30); if (horse) U.animateHorse(horse, 1 / 30, 0); }
  const scene = new THREE.Scene(); scene.add(m);
  return { u, m, horse, HH, scene };
}

const CACHE = new Map();   // 家の色×兵種で一度だけ焼く（武将を替えて同じ家なら焼き直さない）
export async function realTroops({ armor = 0x2a2622, flag = 'tokugawa', kind = 'yari' } = {}) {
  const key = [armor, flag, kind].join('|');
  if (CACHE.has(key)) return CACHE.get(key);
  const job = (async () => {
    const H = await import('../humans.js');
    await H.loadHumans(); await H.loadDomaru?.(); await H.loadKabuto?.();
    if (!H.HUM?.ready) return null;
    const { mergeGeometries } = await import('three/addons/utils/BufferGeometryUtils.js').catch(() => ({}));
    // 雑兵の御貸具足（K685 のホームの雑兵と同じ作り）：陣笠・桶側胴・籠手。家の漆の色と、背に家の旗の指物
    const base = { armor, lacquer: armor, hatColor: armor, lace: 0x4a3a2a, hat: 'jingasa', sode: false, kote: 3, menpo: 0, haori: 0, horo: 0, tier: 0, real: 0,
      cloth: 0x43392f, skin: 0xb98e6a, dirt: 0.25, saya: true, pole: true, flag, flagScale: 1, flagShape: 0, spearLook: 'su' };
    const weapon = kind === 'gun' ? 'gun' : kind === 'yumi' ? 'bow' : 'spear';
    const out = {};
    for (const [name, look, ride] of [['main', { ...base, weapon }, kind === 'kiba'], ['banner', { ...base, weapon: 'spear', flag: null, pole: false }, false]]) {
      const one = await makeOne(look, ride).catch((e) => { globalThis.__stageRealErr = String(e?.stack || e).slice(0, 300); return null; });
      if (!one) { if (name === 'main') return null; continue; }
      out[name] = bake(one.m, mergeGeometries);
      if (one.horse) { one.HH.detachReal?.(one.horse); one.HH.horsesOn?.delete(one.horse); }
      one.scene.remove(one.m);
    }
    return out.main?.length ? out : null;
  })().catch((e) => { globalThis.__stageRealErr = String(e?.stack || e).slice(0, 300); return null; });
  CACHE.set(key, job);
  // K675（記憶）：焼いた形は家×兵種で二組まで持つ。古い組は形を GPU と CPU から返す（材質は本編と共有なので触らない）
  while (CACHE.size > 2) { const [k0, j0] = CACHE.entries().next().value; CACHE.delete(k0); j0.then((r) => { if (r) for (const list of Object.values(r)) for (const pt of list) pt.geo.dispose(); }); }
  const r = await job;
  if (!r) CACHE.delete(key);
  return r;
}

// 武将のそばの乗馬（轡を取る立ち姿の横の馬）も、骨の馬（horse.bin）の立ち姿を焼いた形にする（前は箱の馬）。作れなければ null
let HORSE_PARTS = null;
export async function realHorseMesh() {
  try {
    if (!HORSE_PARTS) HORSE_PARTS = (async () => {
      const [U, H, HH] = await Promise.all([import('../units.js'), import('../humans.js'), import('../humans_horses.js')]);
      await H.loadHorse?.();
      const { mergeGeometries } = await import('three/addons/utils/BufferGeometryUtils.js').catch(() => ({}));
      const h = U.buildHorse(), sc = new THREE.Scene(); sc.add(h);
      if (!HH.showHorse(h)) return null;
      for (let i = 0; i < 12; i++) U.animateHorse(h, 1 / 30, 0);
      const parts = bake(h, mergeGeometries);
      HH.detachReal?.(h); HH.horsesOn?.delete(h);
      return parts.length ? parts : null;
    })().catch(() => null);
    const parts = await HORSE_PARTS;
    if (!parts) { HORSE_PARTS = null; return null; }
    const g = new THREE.Group();
    for (const pt of parts) { const m = new THREE.Mesh(pt.geo, pt.mat); m.castShadow = true; m.receiveShadow = true; g.add(m); }
    return g;
  } catch (e) { return null; }
}
