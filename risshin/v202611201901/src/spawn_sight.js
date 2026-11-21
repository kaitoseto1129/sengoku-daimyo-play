// 11/20 K470（kaito「遠くは絵・近くで急に本物、をやめる。これでこのゲームはおしまいだなと思う」）・クラウド k365-cloud-37：
//   本物の兵の備（新手・布陣の表の備・depth_real・広い戦場の行）を、画面に見えている所（カメラの前・霧の手前）に立てると、何も無かった野に
//   急に兵の塊が現れた（三方ヶ原 200秒・パソコン：画面の中・霧の手前に新しく現れた兵 81 人）。見えている所には立てず、カメラが余所を向いた時か
//   霧の奥にある時に立てる（立てる側は次の見直しでまた試す）。本人の 25m 内まで来た所は、戦いに要るのでそのまま立てる。
//   ?popok=1 で前の立て方（比べるだけ）
import * as THREE from 'three';

const OFF = typeof location !== 'undefined' && /[?&]popok=1\b/.test(location.search);
const fr = new THREE.Frustum(), M = new THREE.Matrix4(), S = new THREE.Sphere(new THREE.Vector3(), 12);
let frT = -1, frCam = null;

// (x, z) に立てる備が今の画面に見えるか（見えるなら true＝今は立てない）
export function seenSpot(rt, x, z, r = 12) {
  if (OFF || (typeof window !== 'undefined' && window.__k470pop)) return false;
  const cam = rt.camera, P = rt.player?.u?.pos;
  if (!cam || !P) return false;
  if (Math.hypot(x - P.x, z - P.z) < 25) return false;   // 本人の間近（25m）は戦いに要る（45m では新手が三十 m に見えたまま立った）
  const far = Math.min(rt.scene?.fog?.far || 150, cam.far || 150);
  const d = Math.hypot(x - cam.position.x, z - cam.position.z);
  if (d - r > far) return false;   // 霧の奥（見えない）
  if (frT !== rt.t || frCam !== cam) {   // 一コマに一度だけ視錐台を作る
    frT = rt.t; frCam = cam; cam.updateMatrixWorld();
    fr.setFromProjectionMatrix(M.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
  }
  S.center.set(x, (rt.world?.heightAt?.(x, z) ?? 0) + 1.5, z); S.radius = r;
  return fr.intersectsSphere(S);
}

// 見えている所 p に立てたい備の、代わりに立てる見えない所（横へ・奥へずらす）。ok(q) は置ける所か。無ければ null（今は立てない）
//   立てた後は、立てる側が p へ歩かせる（援軍が画面の外から歩いて来る形。急に現れない）
export function hiddenSpot(rt, p, ok) {
  const cam = rt.camera; if (!cam || !seenSpot(rt, p.x, p.z)) return p;
  let fx = p.x - cam.position.x, fz = p.z - cam.position.z; const l = Math.hypot(fx, fz) || 1; fx /= l; fz /= l;
  for (const k of [60, 90, 130]) for (const s of [1, -1]) {
    const q = { x: p.x - fz * k * s, z: p.z + fx * k * s };
    if (!seenSpot(rt, q.x, q.z) && (!ok || ok(q))) return q;
  }
  for (const k of [90, 160]) { const q = { x: p.x + fx * k, z: p.z + fz * k }; if (!seenSpot(rt, q.x, q.z) && (!ok || ok(q))) return q; }
  return null;
}
