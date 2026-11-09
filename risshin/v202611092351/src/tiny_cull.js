// iPhone（MEM_TIGHT）だけ：画面で一画素ほどにしか写らない置き物を描かない（kaito 10/21「画面からいらないやつは徹底的に削る」）。
//   遠くの陣の鍋・床几・兵糧・篝火、遠い岩や藪など。描く回数だけ食って、絵には点も残らない物。
//   兵・人・旗・半透明（煙・土埃・旗の布）・独自の描き方（onBeforeRender）を持つ物・大きな物（城・寺・地形）は触らない。
//   隠すのは layers を空にするだけ（影の描き込みも同じ印を見る）。写りが大きくなれば元の layers へ戻す。
import * as THREE from 'three';

const PX = 1.5;          // 写りの径（画素）がこれ未満なら描かない
const EVERY = 10;        // 何コマごとに見直すか
const REBUILD = 300;     // 何コマごとに置き物の表を作り直すか（新しく置かれた物を拾う）
const BIG = 40;          // 半径がこれより大きい物（地形・城・川）は表に入れない
const NOOP = THREE.Object3D.prototype.onBeforeRender;
const _v = new THREE.Vector3(), _s = new THREE.Sphere();

let list = [], scene0 = null, frame = 0, builtAt = -1e9;

function eligibleTree(o) {
  // 兵・人（骨）・束の中は辿らない
  return !(o._armyUnit || o.isBone || o.isSkinnedMesh || o.name === 'unitBatch' || o.userData.noTinyCull);
}
function eligible(o) {
  if (!(o.isMesh) || o.isSkinnedMesh || o.isBatchedMesh) return false;
  if (o.onBeforeRender !== NOOP || o.userData.bT !== undefined) return false;
  const m = o.material;
  if (!m || Array.isArray(m) || m.transparent || m.alphaTest > 0 || (m.side === THREE.DoubleSide && !o.userData.ext) || !m.visible) return false;
  const g = o.geometry;
  if (!g || g.userData.unitFlag || g.morphAttributes.position) return false;
  if (o.isInstancedMesh && o.instanceMatrix.usage !== THREE.StaticDrawUsage) return false;
  return true;
}
function build(scene) {
  for (const e of list) if (e.hid) { e.o.layers.mask = e.mask; e.hid = false; }
  list = [];
  const walk = (o) => {
    if (!o.visible || !eligibleTree(o)) return;
    if (eligible(o)) {
      const g = o.geometry;
      if (!g.boundingSphere) g.computeBoundingSphere();
      let sph = null;
      if (o.isInstancedMesh) { if (!o.boundingSphere) o.computeBoundingSphere(); sph = o.boundingSphere; }
      const r = g.boundingSphere ? g.boundingSphere.radius : 0;
      if (r > 0 && (!sph || sph.radius < 2000)) {
        o.updateWorldMatrix(true, false);
        const sc = o.matrixWorld.getMaxScaleOnAxis();
        if (r * sc < BIG) list.push({ o, r: r * sc, c: g.boundingSphere.center, sph, hid: false, mask: o.layers.mask });
      }
    }
    for (const c of o.children) walk(c);
  };
  walk(scene);
}

export function tinyCull(scene, camera, renderer) {
  if (scene !== scene0) { for (const e of list) if (e.hid) { e.o.layers.mask = e.mask; e.hid = false; } list = []; scene0 = scene; builtAt = frame - REBUILD + 30; }
  frame++;
  if (frame - builtAt >= REBUILD) { build(scene); builtAt = frame; }
  if (frame % EVERY) return;
  const cp = camera.matrixWorld.elements, cx = cp[12], cy = cp[13], cz = cp[14];
  const h = renderer.domElement.height || 600;
  const k = PX / (h / 2 / Math.tan(camera.fov * Math.PI / 360)) / 2;   // 半径÷距離がこれ未満なら径 PX 画素未満
  for (const e of list) {
    const o = e.o;
    if (o.userData.bT !== undefined) continue;   // 兵の束へ移る物（落ちた得物・刺さった矢）は束の側が決める
    let d;
    if (e.sph) { _s.copy(e.sph).applyMatrix4(o.matrixWorld); d = Math.hypot(_s.center.x - cx, _s.center.y - cy, _s.center.z - cz) - _s.radius; }
    else { _v.copy(e.c).applyMatrix4(o.matrixWorld); d = Math.hypot(_v.x - cx, _v.y - cy, _v.z - cz); }
    const tiny = d > 0 && e.r < d * k;
    if (tiny && !e.hid) {
      // ほかの係が隠した物（layers 0）はそのまま
      if (!o.layers.mask) continue;
      e.mask = o.layers.mask; o.layers.mask = 0; e.hid = true;
    } else if (!tiny && e.hid) { o.layers.mask = e.mask; e.hid = false; }
  }
}
