// この戦で使う材質の描き方を用意する。見本は戦場へ残さない。
import * as THREE from 'three';
import { MAT, MAT_I, MAT_P, arrowGeometry, EMBER_GEO, EMBER_MAT } from './units_model.js';
import { humanProgramSamples, preparationFrame } from './humans.js';
import { YUMI } from './yumi.js';
import { fallenVariant } from './army_ground.js';
import { armorProgramSamples } from './armor_wear.js';
import { hasMultiDraw } from './world.js';
import { MEM_TIGHT } from './settings.js';

import { compileBattleSlice } from './compile_wait.js';
import { vatProgramSamples } from './crowd_vat.js';
import { prepareWaterSurface } from './water_body.js';
export { compileBattleSlice } from './compile_wait.js';

// 束で描かれる兵の部品か（units.js batchWalk の条件と同じ。骨・独自の描き方・形の変化・半透明の得物は束にしない）
function armyBatchable(c, m) {
  if (!c.isMesh || c.isSkinnedMesh || c.isInstancedMesh || c.isBatchedMesh || Array.isArray(m) || !m?.isMaterial) return false;
  const g = c.geometry;
  if (!g || g.morphAttributes.position || g.isInstancedBufferGeometry) return false;
  if (g.userData.unitFlag) return !m.transparent;
  return (!m.transparent || !!m.userData.unitBatch) && (!g.groups.length || g.groups.length <= 1);
}

// K214 kaito 11/9 夜「押した瞬間に遊べる・前もって支度」：組んだ描き方（GL のプログラム）を戦をまたいで残す。
//   前は戦を閉じると材質と一緒に描き方も捨て、同じ頁の次の戦（同じ人・具足・馬・地面）で百余りを組み直していた（桶狭間を二度続けると 152→109 組み直し）。
//   使い回しの印（usedTimes）を一つ足しておけば、three の取り出し（同じ鍵の物を探す）がそのまま拾う。数が上限を越えたら古い物から手放す
const KEPT = [], KEPT_SET = new Set(), KEEP_MAX = MEM_TIGHT ? 260 : 480;
export function keepPrograms(renderer) {
  const all = renderer.info.programs;
  if (!all || renderer.getContext().isContextLost()) return 0;
  if (!KEPT.lostHook) {
    KEPT.lostHook = true;
    // 文脈を失った描き方は使えない。残しの印を外して three の組み直しに任せる
    renderer.domElement.addEventListener('webglcontextlost', () => {
      for (const p of KEPT.splice(0)) if (--p.usedTimes === 0) { const i = renderer.info.programs.indexOf(p); if (i >= 0) renderer.info.programs.splice(i, 1); }
      KEPT_SET.clear();
    });
  }
  let n = 0;
  for (const p of all) if (!KEPT_SET.has(p)) { p.usedTimes++; KEPT.push(p); KEPT_SET.add(p); n++; }
  while (KEPT.length > KEEP_MAX) {
    const p = KEPT.shift(); KEPT_SET.delete(p);
    if (--p.usedTimes === 0) { const i = all.indexOf(p); if (i >= 0) all.splice(i, 1); try { p.destroy(); } catch (e) { /* 失った文脈 */ } }
  }
  return n;
}
export async function prepareBattlePrograms(renderer, battle, camera, current = () => true, { uploadTextures, offscreen = true, shadow = null, progress = null, deferLater = false } = {}) {
  const before = new Set(renderer.info.programs || []);
  const stats = battle.programPreparation = { before: before.size, after: before.size, created: 0, materials: 0, variants: 0, failed: 0, complete: false, yields: 0, sources: 0 };
  const tStart = performance.now();
  if (!current()) return stats;
  // 水面の重ね塗り（波・映り・照り）を先に掛けてから組む。後から掛けると鍵が変わり、開戦の最初のコマで水を組み直す（11/15 K169）
  prepareWaterSurface(battle.world);
  const group = new THREE.Group(), seen = new Map(), materials = new Set();
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
  for (const o of battle.standardProgramSamples?.() || []) walk(o, true);
  walk(battle.player?.horse, true);
  for (const u of battle.army.units) { walk(u.mesh, true); walk(u.horse, true); }
  for (const o of battle.world.battleProgramSamples()) walk(o);
  walk(battle.army.contactProgramSample?.());
  for (const o of vatProgramSamples()) walk(o);
  walk(battle.scene);
  walk(new THREE.Mesh(arrowGeometry(), MAT));
  walk(new THREE.Mesh(EMBER_GEO, EMBER_MAT));
  if (YUMI.ready) walk(new THREE.Mesh(YUMI.ya, YUMI.arrowMat));
  const yieldFrame = preparationFrame;
  // 色・汚れの値と材質の番号は描き方を変えない。絵の有無・属性・独自の処理でまとめる。
  // 11/11 iPhone12 で桶狭間の始まりに落ちた件：鍵に描き方の全文（数十KB）を毎回入れ、一戦の支度で約 340MB の文字を作り捨てていた。
  //   全文は短い番号に置き換え、材質ごとの鍵は一度だけ作る（この支度の間だけ覚える）。
  const textIds = new Map(), keyOf = new WeakMap(), armyKeys = new Set(), soloSeen = new Set(), batchProgs = new Set();
  const tid = s => { if (!s) return 0; let i = textIds.get(s); if (i === undefined) textIds.set(s, i = textIds.size + 1); return i; };
  const materialKey = m => { let k = keyOf.get(m); if (k === undefined) keyOf.set(m, k = materialKeyOf(m)); return k; };
  const materialKeyOf = m => [m.type, tid(m.customProgramCacheKey()), tid(m.vertexShader), tid(m.fragmentShader),
    JSON.stringify(m.defines), m.side, m.transparent, m.alphaTest > 0, m.vertexColors, m.flatShading, m.fog,
    m.precision, m.dithering, ...['clearcoat', 'sheen', 'transmission', 'iridescence', 'anisotropy'].map(k => m[k] > 0), m.premultipliedAlpha, m.toneMapped, m.normalMapType, m.depthPacking,
    ...Object.keys(m).filter(k => k === 'map' || k.endsWith('Map')).sort().map(k => m[k] ? k + ':' + m[k].channel + ':' + m[k].colorSpace + ':' + m[k].mapping : '')].join('/');
  // K214：後回しにできる描き方の印。倒れの変種（討たれてから要る）だけ。人の見本と束は開戦の0〜2秒に要るので支度で組む
  //   （11/17 クラウド12：人の見本・束まで後回しにすると、札を早く閉じた時に開戦0〜2秒で20〜35の描き方を組んで止まった）
  let markLater = false, laterSamples = [];
  const prepare = async (source, material, instanced = false, palette = false, geometry = source.geometry) => {
    if (!current()) return false;
    const mats = Array.isArray(material) ? material : [material];
    const attrs = geometry ? Object.entries(geometry.attributes).map(([k, a]) => k + ':' + a.itemSize).join(',') : '';
    const key = [source.type, attrs, geometry?.morphAttributes.position?.length || 0, geometry?.morphAttributes.normal?.length || 0,
      geometry?.morphTargetsRelative, source.isInstancedMesh || instanced, !!source.instanceColor || palette,
      source.receiveShadow, source.castShadow, ...mats.map(materialKey)].join('|');
    // 同じ描き方でも顔や旗の絵は別。転送の一覧には全材質を残す。
    for (const m of mats) materials.add(m);
    if (seen.has(key)) {
      // 後回しの見本と同じ描き方を、戦場の本物が今すぐ要る時は、その見本を前へ戻す
      const prev = seen.get(key);
      if (!markLater && prev?.userData?.k214Later) delete prev.userData.k214Later;
      return true;
    }
    // 束は複製せず、その場の本物で束用の描き方を用意する。
    if (source.isBatchedMesh) {
      // 組んだだけで繋ぎ（getUniforms）を戦の最初の一コマへ持ち越さない。後で十二ずつ繋ぐ（11/17 K365 天王寺：開戦0秒に目・馬具の束で 0.6〜1.4 秒ずつ止まっていた）
      onTarget(() => { for (const m of renderer.compile(source, camera, battle.scene)) { const p = renderer.properties.get(m).currentProgram; if (p) batchProgs.add(p); } });
      seen.set(key, null);
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
    if (markLater) o.userData.k214Later = true;
    o.castShadow = source.castShadow; o.frustumCulled = false;
    o.customDepthMaterial = source.customDepthMaterial;
    o.customDistanceMaterial = source.customDistanceMaterial;
    // 影を兵だけへ絞る処理にも、兵の見本として渡す。
    if (o.castShadow) o._armyUnit = { shOn: true, alive: true };
    group.add(o);
    seen.set(key, o);
    stats.variants++;
    return current();
  };
  try {
    let sliceStart = performance.now(), sliceCount = 0, processed = 0;
    stats.sources = sources.size; stats.samplesMs = Math.round(performance.now() - tStart);
    const tLoop = performance.now();
    for (const [source, person] of sources) {
      // 同じ描き方で組み立てを省く物も、照明の追加を一度に済ませない。
      //   一度に 8ms まで進めてから次のコマへ譲る（1ms ごとに譲ると、譲る待ち（一コマ 16〜33ms）が支度の大半になり、桶狭間で十数秒かかっていた。10/28）
      if (++sliceCount >= 1024 || performance.now() - sliceStart >= 8) {
        if (current()) progress?.(processed, sources.size);
        await yieldFrame(); stats.yields++;
        sliceStart = performance.now(); sliceCount = 0;
      }
      if (!current()) return stats;
      processed++;
      try {
        battle.world.prepareFireMaterial(source);
        const material = source.material;
        if (!material) continue;
        if (!await prepare(source, material)) return stats;
        // 傷・泥・血は高画質で束ねる。普通の板だけの支度では、最初の乱戦で束用の組み立てが残る。
        //   骨の入った人の髪・目・近くの指物も束で描く（army_human_batch.js）。束用の描き方も支度で作る
        const ud = material.userData;
        if (ud && (ud.unitBatch || ud.humanBatch || ud.nearFlag) && !source.isInstancedMesh) {
          if (!await prepare(source, material, true)) return stats;
        }
        // 幟と隊旗の竿・布は描く時に束（props.js flagBatchDraw の InstancedMesh）へ詰める。束用の描き方も先に作る
        //   （11/15 K314 真田丸：60〜90秒に置き幟の皺_near_nobori の束が組まれていた）
        if ((ud?.nbInst || source.parent?.userData?.std) && source.isMesh && !source.isInstancedMesh && !Array.isArray(material))
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
        // 軽い大軍は戦中に全軍の束（army_batch.js）へ詰め替えて描く。その描き方もここで作る
        const armySample = battle.world.armyBatch?.programSample(source);
        if (armySample && !armyKeys.has(armySample.key)) {
          armyKeys.add(armySample.key);
          if (!await prepare(source, armySample.material, true, armySample.color, armySample.geometry())) return stats;
        }
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
          markLater = deferLater;
          try { if (fallen !== material && !await prepare(source, fallen)) return stats; } finally { markLater = false; }
        }
        // 兵の部品は、乱戦で同じ形と材質ごとに束（InstancedMesh）へ、まとめて描く（units.js batchDraw）。
        //   印の無い材質も束で描かれ、開戦直後と討たれた時に束用の描き方が組まれて止まっていた（10/28 三方ヶ原・比叡山・小谷）。倒れの材質の束も同じく作る
        if (person && armyBatchable(source, material)) {
          for (const m of fallen !== material ? [material, fallen] : [material]) {
            markLater = deferLater && m !== material;
            try { if (!(ud && (ud.unitBatch || ud.humanBatch || ud.nearFlag)) || m !== material) if (!await prepare(source, m, true)) return stats; } finally { markLater = false; }
          }
        }
        if (person && ud?.soloPrep && armyBatchable(source, material)) {
          // 一人（四人まで）だけが使う形は、一つの BatchedMesh へまとめて描く（units.js soloDraw）。印（soloPrep）の材質だけ、その描き方（batching）も作る
          //   （人の具足・顔の材質まで足すと、姉川で開戦時に頭の材質が十数組まれる別の動きが出たので、馬具と隊旗に絞る）
          //   （11/17 K365 天王寺の iPhone の真似：開戦0秒に馬具 tack2g・tack2m・tacksilk などの束用が六つ組まれ、合わせて数秒止まっていた）
          if (hasMultiDraw() && !material.transparent && !source.geometry.morphAttributes.position && !(source.geometry.groups.length > 1)) {
            const g = source.geometry;
            for (const m of fallen !== material ? [material, fallen] : [material]) {
              const sk = materialKey(m) + '#' + Object.keys(g.attributes).sort().join(',') + (g.index ? 'i' : 'n');
              if (soloSeen.has(sk)) continue;
              soloSeen.add(sk); stats.solo = soloSeen.size;
              const bm = new THREE.BatchedMesh(1, g.attributes.position.count, g.index ? g.index.count : 3, m);
              try {
                bm.addGeometry(g); bm.receiveShadow = false; bm.castShadow = false;
                if (!await prepare(bm, m)) return stats;
              } catch (e) { /* 入らない形は束にしない */ } finally { bm.dispose(); }
            }
          }
        }
        if (!person || !source.isMesh || source.isSkinnedMesh || source.isInstancedMesh) continue;
        // 兵の束は実際の対象材質だけ。骨の入った体や他の材質の束を仮に増やさない。
        const batched = material === MAT || material.userData?.waterSource === MAT || material.userData?.batchAs === MAT;
        if (batched && source.geometry.attributes.mtl && source.geometry.attributes.color) for (const mat of [MAT_I, MAT_P]) {
          if (!await prepare(source, mat, true, mat === MAT_P)) return stats;
        }
        // 一人だけの兵の形は MAT_I の写しで BatchedMesh に入る（units.js soloDraw）。その描き方も一度だけ作る（11/17 K365 本能寺：開戦0秒に組まれていた）
        if (batched && hasMultiDraw() && !soloSeen.has('MAT_I') && source.geometry.attributes.mtl && source.geometry.attributes.color && !source.geometry.morphAttributes.position && !(source.geometry.groups.length > 1)) {
          soloSeen.add('MAT_I');
          const g = source.geometry, bm = new THREE.BatchedMesh(1, g.attributes.position.count, g.index ? g.index.count : 3, MAT_I);
          try { bm.addGeometry(g); bm.receiveShadow = false; bm.castShadow = false; battle.world.prepareFireMaterial(bm); if (!await prepare(bm, MAT_I)) return stats; }
          catch (e) { /* 入らない形は束にしない */ } finally { bm.dispose(); }
        }
      } catch (e) {
        stats.failed++;
        if (stats.firstError === undefined) stats.firstError = String(e?.message || e);
      }
    }
    if (!current()) return stats;
    progress?.(processed, sources.size);
    stats.loopMs = Math.round(performance.now() - tLoop);
    // 一種類ごとの完了待ちをやめ、全ての描き方を作り始めてから一度だけ待つ。
    const tUp = performance.now();
    if (uploadTextures) stats.textures = await uploadTextures(battle.scene, materials);
    stats.uploadMs = Math.round(performance.now() - tUp);
    if (!current()) return stats;
    // 描き方を一度に全部組み始めない（11/12：稲葉山の iPhone の真似で、百八十余りの組み立てと繋ぎが一枚の描画に
    //   集まり、主の糸が三十秒止まっていた。iPhone の初回の支度で落ちる元の山）。見本を十二ずつ組み、繋ぎ終えてから次のコマへ譲る
    // K214「最小限で始め、残りは遊びながら足す」：倒れの変種（討たれた時に要る）は支度で組まず、開戦の札と布陣図を見ている間（戦の時計が止まっている間）に組む
    laterSamples = group.children.filter(o => o.userData.k214Later);
    if (laterSamples.length) group.remove(...laterSamples);
    const tParts = performance.now(), samples = group.children.slice(), part = new THREE.Group(), linked = new Set();
    // 見本だけを一枚に描くための仮の層（光も同じ層に入れる。影の描き直しはこの間休む＝最後の一枚で作る）
    const LAYER = 31, lights = [];
    battle.scene.traverse(o => { if (o.isLight && !o.layers.isEnabled(LAYER)) lights.push(o); });
    const drawPart = (batch) => {
      const mask = camera.layers.mask, auto = renderer.shadowMap.autoUpdate, need = renderer.shadowMap.needsUpdate;
      try {
        for (const o of lights) o.layers.enable(LAYER);
        for (const o of batch) o.layers.enable(LAYER);
        camera.layers.set(LAYER);
        renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = false;
        onTarget(() => renderer.render(battle.scene, camera));
      } finally {
        camera.layers.mask = mask; renderer.shadowMap.autoUpdate = auto; renderer.shadowMap.needsUpdate = need;
        for (const o of lights) o.layers.disable(LAYER);
        for (const o of batch) o.layers.disable(LAYER);
      }
    };
    // 束（BatchedMesh）の見本の描き方も、ほかの見本と同じく出来上がりを待って繋ぐ
    const bp = [...batchProgs];
    for (let k = 0; k < bp.length; k += 12) {
      const progs = bp.slice(k, k + 12).filter(p => !linked.has(p));
      for (const p of progs) linked.add(p);
      for (let w = 0; w < 60 && progs.some(p => !p.isReady()); w++) { await yieldFrame(); if (!current()) return stats; }
      for (const p of progs) p.getUniforms();
      await yieldFrame(); stats.yields++;
      if (!current()) return stats;
    }
    const compileBatch = async (batch, cur) => {
      const progs = [];
      onTarget(() => {
        part.add(...batch);
        try {
          for (const m of renderer.compile(part, camera, battle.scene)) {
            const p = renderer.properties.get(m).currentProgram;
            if (p && !linked.has(p)) { linked.add(p); progs.push(p); }
          }
        } finally { group.add(...batch); }
      });
      // 並べて組める端末は出来上がりを待ち、そうでない端末はここで繋ぐ（最初の描画へ持ち越さない）
      for (let w = 0; w < 60 && progs.some(p => !p.isReady()); w++) { await yieldFrame(); if (!cur()) return false; }
      for (const p of progs) p.getUniforms();
      // 形の送り込みと、端末が初めて描く時の下ごしらえも、この十二だけで済ませる（最後の一枚へ全部を持ち越さない）
      {
        for (const o of batch) {
          const g = o.geometry;
          if (!g || ranges.has(g)) continue;
          ranges.set(g, { instanceCount: g.instanceCount, start: g.drawRange.start, count: g.drawRange.count });
          if (g.instanceCount === 0) g.instanceCount = 1;
          if (g.drawRange.count === 0) g.setDrawRange(0, Math.min(3, g.index?.count || g.attributes.position.count));
        }
        drawPart(batch);
      }
      return true;
    };
    for (let k = 0; k < samples.length; k += 12) {
      if (!await compileBatch(samples.slice(k, k + 12), current)) return stats;
      await yieldFrame(); stats.yields++;
      if (!current()) return stats;
    }
    stats.samplePartsMs = Math.round(performance.now() - tParts);   // K214：見本の組み立ての分（残りは形の送り）
    // 戦場の本物の形（地面・城・大軍の束）も、八MB ずつ描いて送る。最後の一枚で百MB余りを一度に送らない
    //   （iPhone の WebKit は送る分の写しを一度に積み、絵と同じく 2GB の壁を越える。10/19 の絵の分け送りと同じ考え）
    const objs = [], counted = new WeakSet();
    battle.scene.traverseVisible(o => { if ((o.isMesh || o.isPoints || o.isLine || o.isSprite) && !o.layers.isEnabled(LAYER)) objs.push(o); });
    const bytesOf = g => {
      if (!g || counted.has(g)) return 0;
      counted.add(g);
      let n = g.index?.array.byteLength || 0;
      for (const k in g.attributes) n += g.attributes[k].array?.byteLength || 0;
      return n;
    };
    let chunk = [], bytes = 0;
    for (let k = 0; k <= objs.length; k++) {
      if (k < objs.length) { chunk.push(objs[k]); bytes += bytesOf(objs[k].geometry); }
      if (chunk.length && (k === objs.length || bytes > 8e6 || chunk.length >= 64)) {
        drawPart(chunk); chunk = []; bytes = 0;
        await yieldFrame(); stats.yields++;
        if (!current()) return stats;
      }
    }
    stats.partsMs = Math.round(performance.now() - tParts); stats.parts = linked.size;
    // 端末が完了を返さない時も、確認の時計と見本を支度へ残さない。
    const tCompile = performance.now();
    const complete = await onTarget(() => compileBattleSlice(renderer, battle.scene, camera, battle.scene, current, 8000));
    stats.compileMs = Math.round(performance.now() - tCompile);
    if (!complete) { stats.failed++; return stats; }
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
    keepPrograms(renderer);
    stats.laterN = laterSamples.length;
    if (laterSamples.length) {
      // 残りの見本は戦の後ろで少しずつ組む。休みの間（resting）は二つずつ（布陣図の動きを止めない）、戦が動き出したら三コマに一つずつ。戦が替わったら捨てる
      const held = laterSamples.splice(0);
      stats.later = async (alive, resting) => {
        const t = performance.now();
        ranges.clear();
        try {
          for (let k = 0; k < held.length;) {
            if (!alive()) break;
            const n = resting() ? 2 : 1, batch = held.slice(k, k + n);
            group.add(...batch);
            try { if (!await compileBatch(batch, alive)) break; } finally { group.remove(...batch); battle.scene.remove(group); }
            for (const [g, range] of ranges) { if (range.instanceCount !== undefined) g.instanceCount = range.instanceCount; g.setDrawRange(range.start, range.count); }
            ranges.clear();
            k += n;
            for (let f = resting() ? 1 : 3; f > 0; f--) await yieldFrame();
          }
          keepPrograms(renderer);
        } finally {
          for (const o of held) if (o.isInstancedMesh) { o.morphTexture = null; o.dispose(); }
          held.length = 0;
          target?.dispose(); target = null;
        }
        return Math.round(performance.now() - t);
      };
    }
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
    for (const o of laterSamples) if (o.isInstancedMesh) { o.morphTexture = null; o.dispose(); }   // 途中で止めた時の残り
    if (!stats.later) { target?.dispose(); target = null; }
  }
}
