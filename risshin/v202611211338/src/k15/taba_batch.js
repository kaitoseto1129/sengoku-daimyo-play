// ======================================================================
// 天王寺・岡山：据え置きの竹束（本多の先手の前と家康の本陣の前・約四十本）を束（InstancedMesh）で描く（11/21 K564）。
//   前は一本ずつ別の網（携帯は近い形と軽い形の LOD）で、見える束の数だけ描く回数が増えていた（WARM90 で 248/429 回の内）。
//   形・材質・置き場・向きは今のまま。近い（14m 内）束は細かい形、先は軽い形を、それぞれ一つの束で描く（携帯の LOD と同じ切替・ゆとり .15）。
//   元の網は描く層を外すだけ（見える・当たり・矢の止め・カメラの当たり・焼いた影は今のまま。焼いた影は元の網から焼く）。
// 入れ方：buildFieldworks の後で install(rt, works.tabas)。update で tick(rt)。
// ======================================================================
import * as THREE from 'three';

const HIDE_LAYER = 7;   // 本のカメラが見ない層
const _v = new THREE.Vector3();

export function install(rt, tabas) {
  const list = (tabas || []).filter((tb) => tb && tb.fixed && !tb.van && tb.m);
  if (list.length < 4 || !rt.scene) return null;
  let nearGeo = null, farGeo = null, mat = null, dist = 14, hyst = 0.15;
  const m0 = list[0].m;
  if (m0.isLOD) {
    if (m0.levels.length < 2) return null;
    nearGeo = m0.levels[0].object.geometry; farGeo = m0.levels[1].object.geometry; mat = m0.levels[0].object.material;
    dist = m0.levels[1].distance; hyst = m0.levels[1].hysteresis ?? 0.15;
  } else if (m0.isMesh) { nearGeo = m0.geometry; mat = m0.material; }
  if (!nearGeo || !mat) return null;
  // 同じ形・材質の束だけをまとめる（違う物は一本ずつのまま）
  const same = (tb) => {
    const m = tb.m;
    if (m0.isLOD) return m.isLOD && m.levels.length === 2 && m.levels[0].object.geometry === nearGeo && m.levels[1].object.geometry === farGeo && m.levels[0].object.material === mat;
    return m.isMesh && m.geometry === nearGeo && m.material === mat;
  };
  const items = list.filter(same);
  if (items.length < 4) return null;
  const mk = (geo) => {
    const im = new THREE.InstancedMesh(geo, mat, items.length);
    im.count = 0; im.castShadow = false; im.receiveShadow = false;
    im.matrixAutoUpdate = false; im.userData.noFreeze = true; im.userData.k15TabaBatch = true;
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    rt.scene.add(im);
    return im;
  };
  const near = mk(nearGeo), far = farGeo ? mk(farGeo) : null;
  // 束の囲み（全部の竹束を包む球）。束ごとに画面の外なら描かない
  const box = new THREE.Box3();
  if (!nearGeo.boundingSphere) nearGeo.computeBoundingSphere();
  const r = nearGeo.boundingSphere.radius + 1;
  for (const tb of items) {
    tb.m.updateMatrixWorld(true);
    if (tb.m.isLOD) for (const lv of tb.m.levels) lv.object.layers.set(HIDE_LAYER);   // 刺さった矢（竹束の子）は今のまま描く
    else tb.m.layers.set(HIDE_LAYER);
    _v.setFromMatrixPosition(tb.m.matrixWorld);
    box.expandByPoint(_v.clone().addScalar(r)); box.expandByPoint(_v.clone().addScalar(-r));
  }
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  near.boundingSphere = sphere.clone(); if (far) far.boundingSphere = sphere.clone();
  const st = { items, near, far, dist, hyst, isNear: new Uint8Array(items.length), t: 0, dirty: true };
  rt.flags._k15TabaBatch = st;
  tick(rt, 0);
  return st;
}

// 0.15 秒ごとに、近い・先を分けて束の中身を詰め直す（竹束は動かないので行列はそのまま写す）
export function tick(rt, dt) {
  const st = rt.flags && rt.flags._k15TabaBatch, cam = rt.camera;
  if (!st || !cam) return;
  if ((st.t -= dt) > 0 && !st.dirty) return;
  st.t = 0.15; st.dirty = false;
  const { items, near, far, dist, hyst } = st;
  const zoom = cam.zoom || 1;
  let nn = 0, nf = 0;
  for (let i = 0; i < items.length; i++) {
    const m = items[i].m;
    if (!far) { near.setMatrixAt(nn++, m.matrixWorld); continue; }
    _v.setFromMatrixPosition(m.matrixWorld);
    const d = _v.distanceTo(cam.position) / zoom;
    // three の LOD と同じゆとり：今が先の形なら、境の手前（1-hyst）まで来て初めて近い形に替える
    const edge = st.isNear[i] ? dist : dist - dist * hyst;
    const isNear = d < edge;
    st.isNear[i] = isNear ? 1 : 0;
    if (isNear) near.setMatrixAt(nn++, m.matrixWorld); else far.setMatrixAt(nf++, m.matrixWorld);
  }
  near.count = nn; near.instanceMatrix.needsUpdate = true;
  if (far) { far.count = nf; far.instanceMatrix.needsUpdate = true; }
}
