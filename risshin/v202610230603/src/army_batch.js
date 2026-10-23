import * as THREE from 'three';

// 隊の計算と置換用の束は残し、描画だけを戦全体で共有する。
// 動きの値は隊ごとの表から読む。乱戦の塊・討死・兵の並びは元の値のまま。
const PARAMS = [
  'uIdle', 'uMarch', 'uCharge', 'uTurn', 'uRout', 'uRoutT', 'uYose', 'uFieldRanks',
  'uArmyNear', 'uUnavailable', 'uMoveLim', 'uArmyRealR',
  'uSide', 'uApp', 'uAppM', 'uAppC', 'uNearHide', 'uMeasuredMelee',
];
const ALIAS = { uArmyNear: 'uNear', uArmyRealR: 'uRealNear', uArmySplitR: 'uSplitR' };
const CHANNEL = 'xyzw';
const HEAD = 5, BLOCKS = 40;

class MotionTable {
  constructor(clash, defaults) {
    this.width = HEAD + (clash ? BLOCKS * 2 : 0);
    this.defaults = defaults;
    this.rows = [];
    this.ids = new WeakMap();
    this.uniform = { value: null };
    this.resize(32);
  }
  resize(height) {
    const old = this.uniform.value;
    this.height = height;
    this.data = new Float32Array(this.width * height * 4);
    const texture = new THREE.DataTexture(this.data, this.width, height, THREE.RGBAFormat, THREE.FloatType);
    texture.magFilter = texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    this.uniform.value = texture;
    if (old) old.dispose();
  }
  row(material) {
    const U = material.userData.armyU;
    let row = this.ids.get(U);
    if (row !== undefined) return row;
    row = this.rows.length;
    if (row === this.height) this.resize(this.height * 2);
    const refs = PARAMS.map((name) => U[ALIAS[name] || name] || this.defaults[name] || { value: 0 });
    refs.push(U.uSplitR || this.defaults.uArmySplitR);
    this.rows.push({ U, refs });
    this.ids.set(U, row);
    return row;
  }
  update() {
    const data = this.data;
    let changed = false;
    for (let row = 0; row < this.rows.length; row++) {
      const entry = this.rows[row], base = row * this.width * 4;
      for (let i = 0; i < PARAMS.length; i++) {
        const value = Math.fround(entry.refs[i].value);
        if (data[base + i] !== value) { data[base + i] = value; changed = true; }
      }
      const split = entry.refs[PARAMS.length].value;
      if (data[base + 18] !== Math.fround(split.x) || data[base + 19] !== Math.fround(split.y)) {
        data[base + 18] = split.x; data[base + 19] = split.y; changed = true;
      }
      if (this.width === HEAD) continue;
      for (let side = 0; side < 2; side++) {
        const blocks = entry.U[side ? 'uBlk2' : 'uBlk'].value;
        for (let j = 0; j < BLOCKS; j++) {
          const block = blocks[j], offset = base + (HEAD + side * BLOCKS + j) * 4;
          for (let k = 0; k < 4; k++) {
            const value = Math.fround(block[CHANNEL[k]]);
            if (data[offset + k] !== value) { data[offset + k] = value; changed = true; }
          }
        }
      }
    }
    // 高さを増やした直後も、表の全体を一度送る。
    if (changed || !this.uniform.value.version) this.uniform.value.needsUpdate = true;
  }
  shader(shader) {
    shader.uniforms.uArmyTable = this.uniform;
    const names = new Set(PARAMS.concat(['uArmySplitR', 'uBlk', 'uBlk2']));
    let source = shader.vertexShader.replace(/uniform\s+(float|vec2|vec4)\s+([^;]+);/g, (declaration, type, list) => {
      const keep = list.split(',').map((s) => s.trim()).filter((s) => !names.has(s.replace(/\[.*$/, '')));
      return keep.length ? `uniform ${type} ${keep.join(', ')};` : '';
    });
    let declarations = 'uniform sampler2D uArmyTable;\nattribute float aArmyRow;\n';
    let init = '';
    for (let i = 0; i < HEAD; i++) {
      declarations += `vec4 armyRow${i};\n`;
      init += `armyRow${i} = texelFetch(uArmyTable, ivec2(${i}, int(aArmyRow)), 0);\n`;
    }
    for (let i = 0; i < PARAMS.length; i++) {
      // 乱戦の歩きと突進は cInit が塊ごとに決める通常の変数。
      if (this.width > HEAD && (PARAMS[i] === 'uMarch' || PARAMS[i] === 'uCharge')) continue;
      declarations += `#define ${PARAMS[i]} armyRow${Math.floor(i / 4)}.${CHANNEL[i % 4]}\n`;
    }
    declarations += '#define uArmySplitR armyRow4.zw\n';
    source = source.replace(/uBlk2?\s*\[([^\]]+)\]/g, (expression, index) =>
      `texelFetch(uArmyTable, ivec2(${expression.startsWith('uBlk2') ? HEAD + BLOCKS : HEAD} + int(${index}), int(aArmyRow)), 0)`);
    shader.vertexShader = declarations + source.replace(/void main\s*\(\s*\)\s*\{/, (main) => main + '\n' + init);
  }
  dispose() { this.uniform.value.dispose(); }
}

// clone された同じ形も照合する。頂点は変更せず、束の形と材質を共有する。
function geometryHash(geometry) {
  let hash = 2166136261;
  const attributes = Object.keys(geometry.attributes).filter((name) => !geometry.attributes[name].isInstancedBufferAttribute).sort();
  const arrays = attributes.map((name) => geometry.attributes[name]);
  if (geometry.index) arrays.push(geometry.index);
  for (const attribute of arrays) {
    const bytes = new Uint8Array(attribute.array.buffer, attribute.array.byteOffset, attribute.array.byteLength);
    for (let i = 0; i < bytes.length; i++) hash = Math.imul(hash ^ bytes[i], 16777619);
  }
  return attributes.join(',') + ':' + hash + ':' + arrays.map((a) => `${a.itemSize}/${a.count}/${a.normalized}`).join(',');
}
function sameGeometry(a, b) {
  const names = Object.keys(a.attributes).filter((name) => !a.attributes[name].isInstancedBufferAttribute);
  for (let i = -1; i < names.length; i++) {
    const left = i < 0 ? a.index : a.attributes[names[i]], right = i < 0 ? b.index : b.attributes[names[i]];
    if (!left || !right) { if (left !== right) return false; continue; }
    if (left.array.length !== right.array.length) return false;
    for (let j = 0; j < left.array.length; j++) if (left.array[j] !== right.array[j]) return false;
  }
  return a.groups.length === 0 && b.groups.length === 0;
}

export class ArmyBatch {
  constructor(scene, defaults) {
    this.scene = scene;
    this.tables = [new MotionTable(false, defaults), new MotionTable(true, defaults)];
    this.geometryIds = new WeakMap(); this.geometries = new Map(); this.nextGeometry = 0;
    this.batches = new Map(); this.materials = new Map(); this.sources = []; this.hidden = [];
    this.sourceBatches = new WeakMap();
    this.jobs = [];
    this.selections = new WeakMap(); this.blockStates = new WeakMap(); this.frame = 0;
    this.matrix = new THREE.Matrix4(); this.worldMatrix = new THREE.Matrix4();
    this.frustum = new THREE.Frustum(); this.projection = new THREE.Matrix4();
    this.visit = (object) => {
      if (object.isInstancedMesh && object.material?.userData.armyU && !object.userData.armyBatch && !object.castShadow) this.sources.push(object);
    };
  }
  restoreLayers() {
    for (const source of this.hidden) source.layers.mask = source.userData.armyBatchMask;
    this.hidden.length = 0;
  }
  restore() {
    this.restoreLayers();
    for (const batch of this.batches.values()) {
      if (batch.mesh) { batch.mesh.visible = false; batch.mesh.count = 0; }
      batch.used = 0; batch.dirty = false; batch.dirtyStart = Infinity; batch.dirtyEnd = 0;
    }
  }
  geometryId(geometry) {
    const cached = this.geometryIds.get(geometry);
    if (cached && cached.index === geometry.index) {
      let same = true;
      for (const name of cached.names) if (cached.attributes[name] !== geometry.attributes[name]) { same = false; break; }
      if (same) return cached.id;
    }
    let id;
    const hash = geometryHash(geometry);
    let bucket = this.geometries.get(hash);
    if (!bucket) this.geometries.set(hash, bucket = []);
    for (const entry of bucket) if (sameGeometry(geometry, entry.geometry)) { id = entry.id; break; }
    if (id === undefined) {
      id = this.nextGeometry++;
      // 遠近の写しは同じ入れ物の索引と頂点を替える。照合用には前の形を保つ。
      const shape = new THREE.BufferGeometry();
      shape.setIndex(geometry.index);
      for (const name in geometry.attributes) if (!geometry.attributes[name].isInstancedBufferAttribute) shape.setAttribute(name, geometry.attributes[name]);
      bucket.push({ id, geometry: shape });
    }
    const names = Object.keys(geometry.attributes).filter((name) => !geometry.attributes[name].isInstancedBufferAttribute);
    const attributes = {};
    for (const name of names) attributes[name] = geometry.attributes[name];
    this.geometryIds.set(geometry, { id, index: geometry.index, names, attributes });
    return id;
  }
  material(source, table) {
    const original = source.material;
    const key = [table.width, original.map?.uuid || '', original.customProgramCacheKey(), original.side,
      original.vertexColors, original.opacity, original.transparent, original.depthWrite, original.depthTest,
      original.color.getHex(), original.fog, original.blending].join('|');
    let material = this.materials.get(key);
    if (!material) {
      material = new THREE.MeshLambertMaterial({
        color: original.color, map: original.map, side: original.side, vertexColors: original.vertexColors,
        opacity: original.opacity, transparent: original.transparent, depthWrite: original.depthWrite,
        depthTest: original.depthTest, fog: original.fog, blending: original.blending,
      });
      material.onBeforeCompile = (shader, renderer) => { original.onBeforeCompile(shader, renderer); table.shader(shader); };
      material.onBeforeRender = original.onBeforeRender;
      material.customProgramCacheKey = () => '全軍の束:' + key;
      this.materials.set(key, material);
    }
    return material;
  }
  batch(source, table) {
    let cache = this.sourceBatches.get(source);
    if (!cache) { cache = new WeakMap(); this.sourceBatches.set(source, cache); }
    const cached = cache.get(source.geometry);
    const geometryId = this.geometryId(source.geometry);
    if (cached && cached.original === source.material && cached.split === source.geometry.attributes.aSplit &&
      cached.geometryId === geometryId && cached.color === source.instanceColor) return cached.batch;
    const material = this.material(source, table), geometry = source.geometry;
    const layout = Object.keys(geometry.attributes).filter((name) => geometry.attributes[name].isInstancedBufferAttribute).sort();
    const key = [geometryId, material.id, !!source.instanceColor, source.receiveShadow, source.renderOrder,
      layout.map((name) => `${name}/${geometry.attributes[name].itemSize}`).join(',')].join('|');
    let batch = this.batches.get(key);
    if (!batch) {
      const geo = new THREE.BufferGeometry();
      geo.setIndex(geometry.index);
      for (const name in geometry.attributes) if (!geometry.attributes[name].isInstancedBufferAttribute) geo.setAttribute(name, geometry.attributes[name]);
      batch = { mesh: null, geo, layout, material, color: !!source.instanceColor, source, capacity: 0,
        slots: [], used: 0, dirty: false, dirtyStart: Infinity, dirtyEnd: 0 };
      // 指物だけの形は、持たない兵の分を送らない。混在した体や幟は対象外。
      const parts = geometry.attributes.aPart?.array;
      batch.flagOnly = !!parts?.length && parts.every((part) => part === 10 || part === 11);
      this.batches.set(key, batch);
    }
    cache.set(geometry, { original: source.material, split: geometry.attributes.aSplit, color: source.instanceColor, geometryId, batch });
    return batch;
  }
  grow(batch, needed) {
    let capacity = Math.max(64, batch.capacity);
    while (capacity < needed) capacity *= 2;
    const previous = batch.mesh, geo = batch.geo;
    if (previous) geo.dispose();
    for (const name of batch.layout) {
      const old = geo.attributes[name], original = batch.source.geometry.attributes[name];
      const attribute = new THREE.InstancedBufferAttribute(new original.array.constructor(capacity * original.itemSize), original.itemSize, original.normalized);
      if (old) attribute.array.set(old.array);
      geo.setAttribute(name, attribute.setUsage(THREE.DynamicDrawUsage));
    }
    const row = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
    if (geo.attributes.aArmyRow) row.array.set(geo.attributes.aArmyRow.array);
    geo.setAttribute('aArmyRow', row.setUsage(THREE.DynamicDrawUsage));
    const mesh = new THREE.InstancedMesh(geo, batch.material, capacity);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.count = previous?.count || 0; mesh.frustumCulled = false;
    mesh.receiveShadow = batch.source.receiveShadow; mesh.renderOrder = batch.source.renderOrder;
    mesh.userData.armyBatch = true; mesh.userData.noFreeze = true;
    if (batch.color) mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3).setUsage(THREE.DynamicDrawUsage);
    if (previous) {
      mesh.instanceMatrix.array.set(previous.instanceMatrix.array);
      if (mesh.instanceColor) mesh.instanceColor.array.set(previous.instanceColor.array);
      this.scene.remove(previous); previous.dispose();
    }
    batch.mesh = mesh; batch.capacity = capacity;
    batch.uploads = [mesh.instanceMatrix, geo.attributes.aArmyRow];
    if (mesh.instanceColor) batch.uploads.push(mesh.instanceColor);
    for (const name of batch.layout) batch.uploads.push(geo.attributes[name]);
    // 転送範囲の入れ物も拡張時だけ作り、描画後に空になる一覧へ再利用する。
    batch.ranges = batch.uploads.map(() => ({ start: 0, count: 0 }));
    batch.dirty = true;
  }
  selection(source, flagOnly) {
    const attributes = source.geometry.attributes, clash = attributes.aClash;
    const flags = flagOnly && attributes.aInfo2;
    if (!flags && !clash) return null;
    const U = source.material.userData.armyU;
    let blocks;
    if (clash) {
      blocks = this.blockStates.get(U);
      if (!blocks) {
        blocks = { frame: -1, version: 0, values: new Float64Array(BLOCKS * 2) };
        this.blockStates.set(U, blocks);
      }
      // 歩き・斬り合いは選別に関係しない。討死と置換だけを隊ごとに一度調べる。
      if (blocks.frame !== this.frame) {
        for (let j = 0; j < BLOCKS; j++) {
          // 生きた枠の順番は整数。討死の補間中も半人の境目まで選び直さない。
          const dead = Math.floor(U.uBlk.value[j].z + 0.5), hidden = U.uBlk2.value[j].w > 0.5 ? 1 : 0;
          if (blocks.values[j * 2] !== dead || blocks.values[j * 2 + 1] !== hidden) {
            blocks.values[j * 2] = dead; blocks.values[j * 2 + 1] = hidden; blocks.version++;
          }
        }
        blocks.frame = this.frame;
      }
    }
    let selection = this.selections.get(source);
    if (!selection) {
      selection = { version: 0 };
      this.selections.set(source, selection);
    }
    const count = source.count;
    if (selection.count === count && selection.flags === flags && selection.flagVersion === flags?.version &&
      selection.clash === clash && selection.clashVersion === clash?.version &&
      selection.blocks === blocks && selection.blockVersion === blocks?.version) return selection;
    if (!selection.indices || selection.indices.length < count) selection.indices = new Uint32Array(source.instanceMatrix.count);
    let kept = 0, changed = false;
    for (let i = 0; i < count; i++) {
      if (flags && flags.array[i * 2] === 0) continue;
      if (clash && clash.array[i * 4 + 3] <= 0.5) {
        const j = Math.floor(clash.array[i * 4] + 0.5) * 2;
        if (blocks.values[j + 1] || clash.array[i * 4 + 1] < blocks.values[j]) continue;
      }
      if (selection.indices[kept] !== i) changed = true;
      selection.indices[kept++] = i;
    }
    if (selection.kept !== kept || changed) selection.version++;
    selection.kept = kept; selection.count = count; selection.flags = flags; selection.flagVersion = flags?.version;
    selection.clash = clash; selection.clashVersion = clash?.version;
    selection.blocks = blocks; selection.blockVersion = blocks?.version;
    return selection;
  }
  pack(source, batch, row, start, count) {
    const mesh = batch.mesh, at = batch.used++;
    let slot = batch.slots[at];
    if (!slot) batch.slots[at] = slot = { world: new Float64Array(16), versions: new Array(batch.layout.length) };
    let changed = slot.source !== source || slot.geometry !== source.geometry || slot.start !== start || slot.count !== count ||
      slot.matrixVersion !== source.instanceMatrix.version || slot.colorVersion !== source.instanceColor?.version;
    const selection = this.selection(source, batch.flagOnly);
    const kept = selection ? selection.kept : count;
    if (slot.selection !== selection || slot.selectionVersion !== selection?.version) changed = true;
    if (slot.kept !== kept) changed = true;
    const world = source.matrixWorld.elements;
    for (let k = 0; k < 16; k++) if (slot.world[k] !== world[k]) changed = true;
    for (let k = 0; k < batch.layout.length; k++) if (slot.versions[k] !== source.geometry.attributes[batch.layout[k]].version) changed = true;
    // 同じ位置の同じ兵は写し直さず、足踏み・斬り合いは共有表だけを更新する。
    if (!changed) return kept;
    for (let out = 0; out < kept; out++) {
      const i = selection ? selection.indices[out] : out;
      source.getMatrixAt(i, this.matrix);
      this.worldMatrix.multiplyMatrices(source.matrixWorld, this.matrix);
      mesh.setMatrixAt(start + out, this.worldMatrix);
      if (mesh.instanceColor) for (let k = 0; k < 3; k++) mesh.instanceColor.array[(start + out) * 3 + k] = source.instanceColor.array[i * 3 + k];
      for (const name of batch.layout) {
        const from = source.geometry.attributes[name], to = mesh.geometry.attributes[name], size = from.itemSize;
        for (let k = 0; k < size; k++) to.array[(start + out) * size + k] = from.array[i * size + k];
      }
      mesh.geometry.attributes.aArmyRow.array[start + out] = row;
    }
    slot.source = source; slot.geometry = source.geometry; slot.start = start; slot.count = count; slot.kept = kept;
    slot.selection = selection; slot.selectionVersion = selection?.version;
    slot.matrixVersion = source.instanceMatrix.version; slot.colorVersion = source.instanceColor?.version;
    slot.world.set(world);
    for (let k = 0; k < batch.layout.length; k++) slot.versions[k] = source.geometry.attributes[batch.layout[k]].version;
    batch.dirty = true;
    batch.dirtyStart = Math.min(batch.dirtyStart, start); batch.dirtyEnd = Math.max(batch.dirtyEnd, start + kept);
    return kept;
  }
  draw(renderer, camera, armies, clashes) {
    this.frame++;
    let jobs = 0;
    for (const batch of this.batches.values()) { batch.planned = 0; batch.needed = 0; }
    this.sources.length = 0;
    for (const army of armies || []) army.mesh.traverse(this.visit);
    for (const clash of clashes || []) clash.mesh.traverse(this.visit);
    this.projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projection);
    for (const source of this.sources) {
      let visible = camera.layers.test(source.layers);
      for (let parent = source; visible && parent; parent = parent.parent) visible = parent.visible;
      if (!visible) continue;
      // 画面外の元の束も描画層から外す。飛ばすだけだと元の束が描かれてしまう。
      if (source.frustumCulled && !this.frustum.intersectsObject(source)) {
        source.userData.armyBatchMask = source.layers.mask;
        source.layers.mask = 0; this.hidden.push(source);
        continue;
      }
      source.onBeforeRender(renderer, this.scene, camera, source.geometry, source.material, null);
      if (source.count && camera.layers.test(source.layers)) {
        const table = this.tables[source.material.userData.armyU.uBlk ? 1 : 0];
        const row = table.row(source.material), batch = this.batch(source, table);
        // 全隊を数えてから一度だけ広げる。同じコマで64→128→256…と
        // 配列・形・描画用の領域を何度も捨てて作り直さない。
        const count = source.count, selection = this.selection(source, batch.flagOnly);
        const start = batch.planned || 0;
        batch.needed = Math.max(batch.needed || 0, start + count);
        batch.planned = start + (selection ? selection.kept : count);
        const job = this.jobs[jobs] || (this.jobs[jobs] = {});
        job.source = source; job.batch = batch; job.row = row; job.count = count;
        jobs++;
      }
      source.onAfterRender(renderer, this.scene, camera, source.geometry, source.material, null);
      // 0人も元の束を描かない。層は次の進行の前に戻す。
      source.userData.armyBatchMask = source.layers.mask;
      source.layers.mask = 0; this.hidden.push(source);
    }
    for (const batch of this.batches.values()) if (batch.needed > batch.capacity) this.grow(batch, batch.needed);
    for (let i = 0; i < jobs; i++) {
      const job = this.jobs[i], source = job.source, batch = job.batch, mesh = batch.mesh;
      // 描画後に枠数を戻す亡骸・遠近の写しも、選別には描く時の数を使う。
      const saved = source.count;
      source.count = job.count;
      try { mesh.count += this.pack(source, batch, job.row, mesh.count, job.count); }
      finally { source.count = saved; job.source = job.batch = null; }
      mesh.visible = mesh.count > 0;
      if (mesh.count && !mesh.parent) this.scene.add(mesh);
    }
    for (const table of this.tables) table.update();
    for (const batch of this.batches.values()) {
      // 消えていた隊の場所へ別の隊が詰まった時は、再登場した隊を必ず写し直す。
      for (let i = batch.used; i < batch.slots.length; i++) batch.slots[i].source = null;
      if (!batch.mesh?.count) {
        if (batch.mesh?.parent) this.scene.remove(batch.mesh);
        continue;
      }
      if (!batch.dirty) continue;
      for (let i = 0; i < batch.uploads.length; i++) {
        const attribute = batch.uploads[i], range = batch.ranges[i];
        const start = batch.dirtyStart * attribute.itemSize, end = batch.dirtyEnd * attribute.itemSize;
        if (end <= start) continue;
        if (attribute.updateRanges.length) {
          const previousEnd = range.start + range.count;
          range.start = Math.min(range.start, start); range.count = Math.max(previousEnd, end) - range.start;
        } else {
          range.start = start; range.count = end - start; attribute.updateRanges.push(range);
        }
        attribute.needsUpdate = true;
      }
    }
  }
  dispose() {
    this.restore();
    for (const batch of this.batches.values()) {
      if (batch.mesh) { this.scene.remove(batch.mesh); batch.mesh.dispose(); }
      batch.geo.dispose();
    }
    for (const material of this.materials.values()) material.dispose();
    for (const table of this.tables) table.dispose();
    for (const bucket of this.geometries.values()) for (const entry of bucket) entry.geometry.dispose();
    this.geometries.clear();
    this.batches.clear(); this.materials.clear();
  }
}
