// この戦で使う材質の描き方を用意する。見本は戦場へ残さない。
import * as THREE from 'three';
import { MAT, MAT_I, MAT_P, arrowGeometry, EMBER_GEO, EMBER_MAT } from './units_model.js';
import { humanProgramSamples, preparationFrame } from './humans.js';
import { YUMI } from './yumi.js';
import { fallenVariant } from './army_ground.js';
import { armorProgramSamples } from './armor_wear.js';
import { hasMultiDraw } from './world.js';

import { compileBattleSlice } from './compile_wait.js';
export { compileBattleSlice } from './compile_wait.js';

// 束で描かれる兵の部品か（units.js batchWalk の条件と同じ。骨・独自の描き方・形の変化・半透明の得物は束にしない）
function armyBatchable(c, m) {
  if (!c.isMesh || c.isSkinnedMesh || c.isInstancedMesh || c.isBatchedMesh || Array.isArray(m) || !m?.isMaterial) return false;
  const g = c.geometry;
  if (!g || g.morphAttributes.position || g.isInstancedBufferGeometry) return false;
  if (g.userData.unitFlag) return !m.transparent;
  return (!m.transparent || !!m.userData.unitBatch) && (!g.groups.length || g.groups.length <= 1);
}

export async function prepareBattlePrograms(renderer, battle, camera, current = () => true, { uploadTextures, offscreen = true, shadow = null } = {}) {
  const before = new Set(renderer.info.programs || []);
  const stats = battle.programPreparation = { before: before.size, after: before.size, created: 0, materials: 0, variants: 0, failed: 0, complete: false, yields: 0, sources: 0 };
  const tStart = performance.now();
  if (!current()) return stats;
  const group = new THREE.Group(), seen = new Set(), materials = new Set();
  // 待ち時間にも通常の描画は進む。大きな頭などの見本は描く瞬間だけ出す。
  group.visible = false;
  let target = null;
  const ranges = new Map();
  // 本番の仕上げと同じ色空間・材質で、一画素だけ描く。待っている間は描画先を占有しない。
  const onTarget = (work) => {
    const previous = renderer.getRenderTarget(), viewport = renderer.getViewport(new THREE.Vector4());
    const scissor = renderer.getScissor(new THREE.Vector4()), scissorTest = renderer.getScissorTest();
    try {
      if (offscreen && !target) target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
      renderer.setRenderTarget(target);
      renderer.setViewport(0, 0, 1, 1);
      renderer.setScissorTest(false);
      // 戦の中と同じ影の有無で組む（待ちの間に題の絵が影を切っても、ここで戻す）
      shadow?.();
      // 見本は同期の支度中だけ置く。待ち時間や通常の描画へ顔の見本を残さない。
      battle.scene.add(group);
      group.visible = true;
      return work();
    } finally {
      group.visible = false;
      battle.scene.remove(group);
      renderer.setRenderTarget(previous); renderer.setViewport(viewport);
      renderer.setScissor(scissor); renderer.setScissorTest(scissorTest);
    }
  };
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
  // 舞台も含めて最後まで用意し、戦中へ時間切れの残りを渡さない。
  for (const o of humanProgramSamples(battle)) walk(o, true);
  // 具足も人の一部として、倒れた時の描き方（fallenContour）まで用意する（乱戦で討たれた瞬間に組まれていた。10/26）
  for (const o of armorProgramSamples(renderer)) {
    walk(o, true);
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
      source.receiveShadow, source.castShadow, ...mats.map(materialKey)].join('|');
    // 同じ描き方でも顔や旗の絵は別。転送の一覧には全材質を残す。
    for (const m of mats) materials.add(m);
    if (seen.has(key)) return true;
    // 束は複製せず、その場の本物で束用の描き方を用意する。
    if (source.isBatchedMesh) {
      onTarget(() => renderer.compile(source, camera, battle.scene));
      seen.add(key);
      stats.variants++;
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
    o.castShadow = source.castShadow; o.frustumCulled = false;
    o.customDepthMaterial = source.customDepthMaterial;
    o.customDistanceMaterial = source.customDistanceMaterial;
    // 影を兵だけへ絞る処理にも、兵の見本として渡す。
    if (o.castShadow) o._armyUnit = { shOn: true, alive: true };
    group.add(o);
    seen.add(key);
    stats.variants++;
    return current();
  };
  try {
    let sliceStart = performance.now(), sliceCount = 0;
    stats.sources = sources.size; stats.samplesMs = Math.round(performance.now() - tStart);
    const tLoop = performance.now();
    for (const [source, person] of sources) {
      // 同じ描き方で組み立てを省く物も、照明の追加を一度に済ませない。
      //   一度に 8ms まで進めてから次のコマへ譲る（1ms ごとに譲ると、譲る待ち（一コマ 16〜33ms）が支度の大半になり、桶狭間で十数秒かかっていた。10/28）
      if (++sliceCount >= 1024 || performance.now() - sliceStart >= 8) {
        await yieldFrame(); stats.yields++;
        sliceStart = performance.now(); sliceCount = 0;
      }
      if (!current()) return stats;
      try {
        battle.world.prepareFireMaterial(source);
        const material = source.material;
        if (!material) continue;
        if (!await prepare(source, material)) return stats;
        // 傷・泥・血は高画質で束ねる。普通の板だけの支度では、最初の乱戦で束用の組み立てが残る。
        //   骨の入った人の髪・目・近くの指物も束で描く（army_human_batch.js）。束用の描き方も支度で作る
        const ud = material.userData;
        if (ud && (ud.unitBatch || ud.humanBatch || ud.nearFlag) && !source.isInstancedMesh)
          if (!await prepare(source, material, true)) return stats;
        // 顔の形ごとに違う小さな部品（目玉・髷・元結）は BatchedMesh で描く。その描き方も作る
        if (ud?.humanBatch && hasMultiDraw() && source.geometry && source.geometry.attributes.position.count <= 1500) {
          const g = source.geometry, bm = new THREE.BatchedMesh(1, g.attributes.position.count, g.index ? g.index.count : 3, material);
          try {
            bm.addGeometry(g); bm.receiveShadow = true; bm.castShadow = source.castShadow; if (!await prepare(bm, material)) return stats;
            // 倒れた人の目・髪も同じ束で描く。その描き方も作る（討たれた瞬間に組まれていた）
            const fm = fallenVariant(material);
            if (fm !== material) { bm.material = fm; if (!await prepare(bm, fm)) return stats; }
          } catch (e) { /* 入らない形は束にしない */ } finally { bm.dispose(); }
        }
        if (source.isBatchedMesh) continue;
        // 兵の遠い形・透過・倒れを総当たりで作らない。
        // 初回に三十ミリ秒を超えると測れた姿だけ、今後ここへ個別に加える。
        const lod = !person && source.userData?.lod;
        const geos = Array.isArray(lod) ? lod.slice(0, 2) : lod && typeof lod === 'object'
          ? [lod.lo, lod.xlo, lod.xxlo].filter(g => g && g.isBufferGeometry) : [];
        for (const geo of geos) if (geo && geo !== source.geometry)
          if (!await prepare(source, material, false, false, geo)) return stats;
        // 倒れた兵の材質の変種（|fallenContour）は、倒れた瞬間に一人分（体・頭・髪・目・歯）がまとめて作られ、一コマが止まる。ここで先に作る
        let fallen = material;
        if (person && source.isMesh && !source.isInstancedMesh) {
          fallen = Array.isArray(material) ? material.map(fallenVariant) : fallenVariant(material);
          if (fallen !== material && !await prepare(source, fallen)) return stats;
        }
        // 兵の部品は、乱戦で同じ形と材質ごとに束（InstancedMesh）へ、まとめて描く（units.js batchDraw）。
        //   印の無い材質も束で描かれ、開戦直後と討たれた時に束用の描き方が組まれて止まっていた（10/28 三方ヶ原・比叡山・小谷）。倒れの材質の束も同じく作る
        if (person && armyBatchable(source, material)) {
          for (const m of fallen !== material ? [material, fallen] : [material]) {
            if (!(ud && (ud.unitBatch || ud.humanBatch || ud.nearFlag)) || m !== material) if (!await prepare(source, m, true)) return stats;
          }
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
    if (!current()) return stats;
    stats.loopMs = Math.round(performance.now() - tLoop);
    // 一種類ごとの完了待ちをやめ、全ての描き方を作り始めてから一度だけ待つ。
    const tUp = performance.now();
    if (uploadTextures) stats.textures = await uploadTextures(battle.scene, materials);
    stats.uploadMs = Math.round(performance.now() - tUp);
    if (!current()) return stats;
    const tCompile = performance.now();
    const complete = await onTarget(() => compileBattleSlice(renderer, battle.scene, camera, battle.scene, current, Infinity));
    if (!complete) return stats;
    stats.compileMs = Math.round(performance.now() - tCompile);
    if (!current() || renderer.getContext().isContextLost()) return stats;
    // 空の煙・火花・土埃も一度は描く。借りた形の描画範囲は必ず元へ戻す。
    for (const o of group.children) {
      const g = o.geometry;
      if (!g || ranges.has(g)) continue;
      ranges.set(g, { instanceCount: g.instanceCount, start: g.drawRange.start, count: g.drawRange.count });
      if (g.instanceCount === 0) g.instanceCount = 1;
      if (g.drawRange.count === 0) g.setDrawRange(0, Math.min(3, g.index?.count || g.attributes.position.count));
    }
    // 前の場面が影の描き直しを休んでいても、この一枚では影用の描き方も作る。
    if (renderer.shadowMap) renderer.shadowMap.needsUpdate = true;
    const tDraw = performance.now();
    onTarget(() => renderer.render(battle.scene, camera));
    stats.drawMs = Math.round(performance.now() - tDraw);
    stats.rendered = group.children.length;
    stats.complete = stats.failed === 0;
    return stats;
  } finally {
    stats.after = renderer.info.programs?.length || 0;
    stats.created = (renderer.info.programs || []).filter(p => !before.has(p)).length;
    stats.materials = materials.size;
    // 透過や倒れの姿は必要になってから作るため、戦中の追加数は未計測。
    stats.expectedDuringBattle = null;
    battle.scene.remove(group);
    for (const [g, range] of ranges) {
      if (range.instanceCount !== undefined) g.instanceCount = range.instanceCount;
      g.setDrawRange(range.start, range.count);
    }
    for (const o of group.children) if (o.isInstancedMesh) { o.morphTexture = null; o.dispose(); }
    group.clear();
    target?.dispose();
  }
}
