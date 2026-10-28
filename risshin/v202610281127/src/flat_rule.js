// 平たい兵を霧の手前に出さない決まり（kaito 10/28「イラストみたいな敵も味方も気分落ちる」・棒人間と同じく二度と見せない）
//   霧が濃くなり切る距離（FLAT.far ＝ scene.fog.far の整数部。fog_fragment の fogVis と同じ）の内は、兵を骨の人か VAT（立体）だけで描く。
//   絵札（efuda.js）・軽い兵の束（units.js の updateImpostors）は FLAT.far より先だけ。遠景の軽い大軍（addDistantArmy・addBacking・addClash）は描かない（army_batch.js）。
//   ?flat=1 で前の描き方（見比べ用）。window.__flatNear() が霧の手前に描かれた平たい兵の数を返す（取り込みと Web の関所 mg.sh・web_hourly.sh が 0 を求める）。
import * as THREE from 'three';

const qs = typeof location !== 'undefined' ? location.search : '';
export const FLAT = { on: !/[?&]flat=1/.test(qs), far: 92, armyDrawn: 0 };

// 描く直前（army_batch.js の draw）に今の霧から決める。煙で一時に霧が寄っても、決まりの距離は急に縮めない（立体と板の入れ替わりを揺らさない）
let lastT = 0;
export function flatFogFar(fogFar) {
  const now = performance.now(), dt = Math.min(0.25, Math.max(0, (now - lastT) / 1000)); lastT = now;
  const v = Math.max(20, Math.floor(fogFar));
  FLAT.far = v >= FLAT.far ? v : Math.max(v, FLAT.far - 40 * dt);
}

const _fr = new THREE.Frustum(), _pm = new THREE.Matrix4(), _sph = new THREE.Sphere(new THREE.Vector3(), 1.4);
// 霧の手前・画面の中に描かれた平たい兵（絵札・軽い束・部品だけの兵・軽い大軍）を数える
export function flatNear() {
  const b = typeof window !== 'undefined' && window.__game && window.__game.battle;
  const out = { total: 0, efuda: 0, imp: 0, parts: 0, army: 0, far: Math.round(FLAT.far) };
  if (!b || !b.army || !b.camera) return out;
  const cam = b.camera, cx = cam.position.x, cz = cam.position.z, R = FLAT.far - 1;
  cam.updateMatrixWorld();
  _pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); _fr.setFromProjectionMatrix(_pm);
  for (const u of b.army.units) {
    if (u.gone || u.isStruct || u.isPlayer || u.camHidden) continue;
    const d = Math.hypot(u.pos.x - cx, u.pos.z - cz);
    if (d >= R) continue;
    _sph.center.set(u.pos.x, u.pos.y + 1, u.pos.z);
    if (!_fr.intersectsSphere(_sph)) continue;
    if (u.efuda) out.efuda++;
    else if (u.imp) out.imp++;
    else if (u.mesh && u.mesh.visible && u.body && u.body.visible && !u.vatOn && !(u.human && u.human.root && u.human.root.visible)) {
      // 部品の姿は、骨の人が出来るまでの一瞬（混んだ機械で 1 秒ほど）なら数えない。1.5 秒より長く続いた者だけ数える
      const now = performance.now();
      if (!(u._flatAt > 0) || now - u._flatSeen > 700) u._flatAt = now;
      u._flatSeen = now;
      if (now - u._flatAt > 1500) out.parts++;
    }
  }
  out.army = FLAT.armyDrawn;
  out.total = out.efuda + out.imp + out.parts + out.army;
  return out;
}
if (typeof window !== 'undefined') window.__flatNear = flatNear;
