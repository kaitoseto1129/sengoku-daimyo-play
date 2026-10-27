import { compileBattleSlice } from './compile_wait.js';

// 戦の途中で初めて出る描き方（味方を透かす・旗を薄くする・倒れた兵の写しなど）を、その場で組み立てて一コマ止めない。
//   three は新しい材質を初めて描く時に描き方（シェーダー）を組み、組み上がるまで待つ（Android の板で 100〜300ms 止まる。
//   走って味方の間を抜ける時に続けて起き「走るとカクつく」と言われた。Lancers 10/26）。
//   まだ一度も組んでいない材質で、同じ形の描き方も前に無い物だけ、そのコマは描かずに裏で組み（KHR_parallel_shader_compile）、
//   出来たら描く。影の描き（材質が本体と違う）と支度の描き（戦の画面でない）は今までどおり。
let renderer = null, active = false, camera = null, scene = null;
const known = new Set();        // 前に描いた材質と物の組み合わせの形（同じ形なら描き方は既にある）
const pending = new Map();      // 材質 → 組み立て中の形
const pendingSig = new Set();   // 組み立て中の形（同じ形の別の材質も、出来るまで待たせる）
let queue = [];                 // このコマで組み立てを頼む [物, 材質]
let flushing = false, generation = 0;
const sig = (m, o) => [m.type, m.customProgramCacheKey ? m.customProgramCacheKey() : '', m.transparent, m.side, m.forceSinglePass,
  m.alphaTest > 0, m.vertexColors, !!m.map, !!m.normalMap, !!m.alphaMap, !!m.emissiveMap, !!m.envMap, !!m.roughnessMap, !!m.aoMap, !!m.bumpMap,
  m.fog, m.flatShading, m.alphaHash, m.dithering, m.vertexShader || '', m.defines ? JSON.stringify(m.defines) : '',
  !!o.isInstancedMesh, !!o.instanceColor, !!o.isSkinnedMesh, !!o.isBatchedMesh, !!o.receiveShadow,
  o.geometry && o.geometry.morphAttributes && o.geometry.morphAttributes.position ? o.geometry.morphAttributes.position.length : 0].join('|');

function flush() {
  flushing = false;
  if (!queue.length || !renderer) { queue.length = 0; return; }
  const items = queue; queue = [];
  const sc = scene, cam = camera, gen = generation;
  // 描いた後は材質が元へ戻っている事がある（味方を透かすのは描く間だけ）。頼んだ材質を持たせた写しで組む
  const stand = items.map(([o, m]) => Object.create(o, { material: { value: m, writable: true } }));
  const fake = { traverse(cb) { for (const s of stand) cb(s); }, traverseVisible() {} };
  const done = () => { if (gen !== generation) return; for (const [, m, k] of items) { pending.delete(m); pendingSig.delete(k); known.add(k); } };
  // 戦が終わったら、古い材質の完了確認も止める。
  compileBattleSlice(renderer, fake, cam, sc,
    () => gen === generation && !sc.userData?.battleDisposed).then(done, done);
}

export function installCompileDefer(r, isBattleScene) {
  renderer = r;
  const ok = !!(r.extensions && r.extensions.has && r.extensions.has('KHR_parallel_shader_compile')) && !/[?&]defer=0/.test(location.search);
  if (!ok) return;
  const props = r.properties;
  const rbd = r.renderBufferDirect;
  r.renderBufferDirect = function (cam, sc, geometry, material, object, group) {
    if (active && material && object) {
      if (pending.has(material)) return;
      const own = object.material === material || (Array.isArray(object.material) && object.material.includes(material));
      if (own && props.get(material).programs === undefined) {
        const k = sig(material, object);
        if (pendingSig.has(k)) return;
        if (!known.has(k)) {
          pendingSig.add(k);
          pending.set(material, k);
          queue.push([object, material, k]);
          if (!flushing) { flushing = true; queueMicrotask(flush); }
          return;
        }
      }
    }
    return rbd.call(this, cam, sc, geometry, material, object, group);
  };
  const render = r.render;
  r.render = function (sc, cam) {
    const prev = active;
    const t = r.getRenderTarget();
    active = !!isBattleScene(sc) && (!t || t.width > 16);
    if (active) { if (sc !== scene) resetCompileDefer(); scene = sc; camera = cam; }
    try { return render.call(this, sc, cam); } finally { active = prev; }
  };
}
// 戦が替わったら忘れる（前の戦の形の印で、次の戦の初めての描き方を待たずに組んでしまわないよう）
export function resetCompileDefer() { generation++; scene = camera = null; known.clear(); pending.clear(); pendingSig.clear(); queue.length = 0; }
