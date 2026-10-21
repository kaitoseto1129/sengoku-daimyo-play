// この戦で使う材質の描き方を用意する。見本は戦場へ残さない。
import * as THREE from 'three';
import { MAT, MAT_I, MAT_P, arrowGeometry, EMBER_GEO, EMBER_MAT } from './units_model.js';
import { humanProgramSamples, preparationFrame } from './humans.js';
import { YUMI } from './yumi.js';
import { fallenVariant } from './army_ground.js';
import { armorProgramSamples } from './armor_wear.js';

// compileAsync は外の待ち切りだけでは内部の確認時計が止まらず、材質と戦場を持ち続ける。
// 同じ組み立てを開始し、完了の確認だけをこちらで持って必ず片付ける。
export async function compileBattleSlice(renderer, group, camera, scene, current, ms = 1500) {
  if (!current()) return false;
  const end = performance.now() + ms, programs = new Set();
  let timer;
  try {
    const materials = renderer.compile(group, camera, scene);
    // 次の姿の支度で currentProgram が変わっても、この姿の完了を確かめる。
    for (const material of materials) programs.add(renderer.properties.get(material).currentProgram);
    return await new Promise((resolve, reject) => {
      const poll = () => {
        try {
          if (!current() || renderer.getContext?.().isContextLost() || performance.now() >= end) { resolve(false); return; }
          for (const program of programs) if (program.isReady()) programs.delete(program);
          if (!programs.size) { resolve(true); return; }
          timer = setTimeout(poll, 16);
        } catch (error) { reject(error); }
      };
      poll();
    });
  } finally { clearTimeout(timer); programs.clear(); }
}

export async function prepareBattlePrograms(renderer, battle, camera, current = () => true) {
  const before = new Set(renderer.info.programs || []);
  const stats = battle.programPreparation = { before: before.size, after: before.size, created: 0, materials: 0, variants: 0, failed: 0, complete: false };
  if (!current()) return stats;
  const group = new THREE.Group(), seen = new Set(), materials = new Set();
  const sources = new Map();
  const collect = (o, person) => {
    if (o.isMesh || o.isSprite || o.isPoints || o.isLine) {
      sources.set(o, person || sources.get(o) || false);
    }
  };
  const walk = (o, person = false) => {
    const root = o?.traverse ? o : o?.mesh?.traverse ? o.mesh : o?.group;
    root?.traverse(child => collect(child, person));
  };
  // 順は「最初の一枚に映らない物」から：人の見本（姿の変種・目・歯・馬具）→ 兵と馬 → 舞台。
  //   舞台の材質は最初の一枚を描く時にどのみち作られる（支度の札の中）。携帯は時間の枠で切れるので、戦中に初めて描かれる物を先に作る（10/20）
  for (const o of humanProgramSamples(battle)) walk(o, true);
  for (const o of armorProgramSamples(renderer)) {
    walk(o);
    await preparationFrame();
    if (!current()) return stats;
  }
  walk(battle.player?.horse, true);
  for (const u of battle.army.units) { walk(u.mesh, true); walk(u.horse, true); }
  for (const o of battle.world.battleProgramSamples()) walk(o);
  walk(battle.scene);
  walk(new THREE.Mesh(arrowGeometry(), MAT));
  walk(new THREE.Mesh(EMBER_GEO, EMBER_MAT));
  if (YUMI.ready) walk(new THREE.Mesh(YUMI.ya, YUMI.arrowMat));
  const yieldFrame = preparationFrame;
  // 色・汚れの値と材質の番号は描き方を変えない。絵の有無・属性・独自の処理でまとめる。
  const materialKey = m => [m.type, m.customProgramCacheKey(), m.vertexShader, m.fragmentShader,
    JSON.stringify(m.defines), m.side, m.transparent, m.alphaTest > 0, m.vertexColors, m.flatShading, m.fog,
    m.precision, m.dithering, ...['clearcoat', 'sheen', 'transmission', 'iridescence', 'anisotropy'].map(k => m[k] > 0), m.premultipliedAlpha, m.toneMapped, m.normalMapType, m.depthPacking,
    ...Object.keys(m).filter(k => k === 'map' || k.endsWith('Map')).sort().map(k => m[k] ? k + ':' + m[k].channel + ':' + m[k].colorSpace + ':' + m[k].mapping : '')].join('/');
  const prepare = async (source, material, instanced = false, palette = false, geometry = source.geometry) => {
    if (!current()) return false;
    const mats = Array.isArray(material) ? material : [material];
    const attrs = geometry ? Object.entries(geometry.attributes).map(([k, a]) => k + ':' + a.itemSize).join(',') : '';
    const key = [source.type, attrs, geometry?.morphAttributes.position?.length || 0, geometry?.morphAttributes.normal?.length || 0,
      geometry?.morphTargetsRelative, source.isInstancedMesh || instanced, !!source.instanceColor || palette,
      source.receiveShadow, ...mats.map(materialKey)].join('|');
    // 絵は実際に描かれる時に転送する。見本の全素材をここで積むと携帯のメモリを圧迫する。
    for (const m of mats) materials.add(m);
    if (seen.has(key)) return true;
    // 束は複製せず、その場の本物で束用の描き方を用意する。
    if (source.isBatchedMesh) {
      // 一つの姿が 1.5 秒で終わらなくても支度全体を止めない（作り始めた program は裏で続く。止めると残り全部が戦中の作りになる。10/20）
      if (!await compileBattleSlice(renderer, source, camera, battle.scene, current)) { stats.slow = (stats.slow || 0) + 1; if (!current()) return false; }
      seen.add(key);
      stats.variants++;
      await yieldFrame();
      return current();
    }
    // 本物の複製は大量の行列と、形を含む付記まで写す。見本は形・材質・骨を借りるだけ。
    let o;
    if (instanced || source.isInstancedMesh) {
      o = new THREE.InstancedMesh(geometry, material, 1);
      o.morphTexture = source.morphTexture || null;
      if (palette || source.instanceColor) o.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(3), 3);
    } else if (source.isSkinnedMesh) {
      o = new THREE.SkinnedMesh(geometry, material);
      o.skeleton = source.skeleton; o.bindMode = source.bindMode;
      o.bindMatrix.copy(source.bindMatrix); o.bindMatrixInverse.copy(source.bindMatrixInverse);
    } else if (source.isMesh) o = new THREE.Mesh(geometry, material);
    else if (source.isSprite) o = new THREE.Sprite(material);
    else if (source.isPoints) o = new THREE.Points(geometry, material);
    else if (source.isLineSegments) o = new THREE.LineSegments(geometry, material);
    else if (source.isLineLoop) o = new THREE.LineLoop(geometry, material);
    else o = new THREE.Line(geometry, material);
    o.material = material; o.receiveShadow = source.receiveShadow; o.visible = true; o.layers.set(0);
    group.add(o);
    try {
      // 一回に一つの姿。32個と全場面を一度に渡して400msを越えていた山を分ける。
      if (!await compileBattleSlice(renderer, group, camera, battle.scene, current)) { stats.slow = (stats.slow || 0) + 1; if (!current()) return false; }
      seen.add(key);
      stats.variants++;
    } finally {
      group.clear();
      if (o.isInstancedMesh) { o.morphTexture = null; o.dispose(); }
    }
    await yieldFrame();
    return current();
  };
  try {
    let sliceStart = performance.now(), sliceCount = 0;
    for (const [source, person] of sources) {
      // 同じ描き方で組み立てを省く物も、照明の追加を一度に済ませない。
      if (++sliceCount >= 128 || performance.now() - sliceStart >= 1) {
        await yieldFrame();
        sliceStart = performance.now(); sliceCount = 0;
      }
      if (!current()) return stats;
      try {
        battle.world.prepareFireMaterial(source);
        const material = source.material;
        if (!material) continue;
        if (!await prepare(source, material)) return stats;
        // 傷・泥・血は高画質で束ねる。普通の板だけの支度では、最初の乱戦で束用の組み立てが残る。
        if (material.userData?.unitBatch && !source.isInstancedMesh)
          if (!await prepare(source, material, true)) return stats;
        if (source.isBatchedMesh) continue;
        // 兵の遠い形・透過・倒れを総当たりで作らない。
        // 初回に三十ミリ秒を超えると測れた姿だけ、今後ここへ個別に加える。
        const lod = !person && source.userData?.lod;
        const geos = Array.isArray(lod) ? lod.slice(0, 2) : lod && typeof lod === 'object'
          ? [lod.lo, lod.xlo, lod.xxlo].filter(g => g && g.isBufferGeometry) : [];
        for (const geo of geos) if (geo && geo !== source.geometry)
          if (!await prepare(source, material, false, false, geo)) return stats;
        // 倒れた兵の材質の変種（|fallenContour）は、倒れた瞬間に一人分（体・頭・髪・目・歯）がまとめて作られ、一コマが止まる。ここで先に作る
        if (person && source.isMesh && !source.isInstancedMesh) {
          const fallen = Array.isArray(material) ? material.map(fallenVariant) : fallenVariant(material);
          if (fallen !== material && !await prepare(source, fallen)) return stats;
        }
        if (!person || !source.isMesh || source.isSkinnedMesh || source.isInstancedMesh) continue;
        // 兵の束は実際の対象材質だけ。骨の入った体や他の材質の束を仮に増やさない。
        const batched = material === MAT || material.userData?.waterSource === MAT || material.userData?.batchAs === MAT;
        if (batched && source.geometry.attributes.mtl && source.geometry.attributes.color) for (const mat of [MAT_I, MAT_P]) {
          if (!await prepare(source, mat, true, mat === MAT_P)) return stats;
        }
      } catch (e) {
        stats.failed++;
        if (stats.firstError === undefined) stats.firstError = String(e?.message || e);
      }
    }
    stats.complete = true;
    return stats;
  } finally {
    stats.after = renderer.info.programs?.length || 0;
    stats.created = (renderer.info.programs || []).filter(p => !before.has(p)).length;
    stats.materials = materials.size;
    // 透過や倒れの姿は必要になってから作るため、戦中の追加数は未計測。
    stats.expectedDuringBattle = null;
    group.clear();
  }
}
