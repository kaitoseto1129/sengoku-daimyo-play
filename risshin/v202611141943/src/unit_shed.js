// 兵の表から外した兵の形を手放す（units.js の pruneGone・army_ground.js の reapGone）。
import * as THREE from 'three';

// 兵の表から外した兵の形（体・頭・手足・得物・旗の Object3D の木）を手放す（11/8 稲葉山：供回りが足され続け、
//   討たれた兵の形が隊の表 g.units に残って、30 分で JS の記憶が 276→677MB に伸びた。docs/crash_1108.md）。
//   隊の表は討死の数えに使うので兵そのものは残し、形の鍵は一つの空の置き物に差し替える（触っても落ちない・場面には入らない）。
//   場面に残っている物（地面の槍・陣笠など）は触らない。やり直しの写しが生きていた時の形を持っていれば、戻す時にそちらが入る。
const GONE_PART = new THREE.Mesh();
GONE_PART.name = 'gonePart';
// 空の置き物へ誰かが子を足しても溜めない
GONE_PART.add = function () { return this; };
export function shedModel(u) {
  if (u._shed) return;
  u._shed = true;
  for (const k of Object.keys(u)) {
    const v = u[k];
    if (v && v.isObject3D && v !== GONE_PART && !v.parent) u[k] = GONE_PART;
  }
}
