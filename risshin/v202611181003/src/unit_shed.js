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
const inScene = (o) => { let r = o; for (let i = 0; i < 64 && r.parent; i++) r = r.parent; return !!r.isScene; };
export function shedModel(u) {
  if (u._shed) return;
  u._shed = true;
  // 11/18 夜50-47 K210：場面から外れた木の枝（体・手足は親＝外した兵の木につながったまま）も差し替える。
  //   前は親の無い物だけを差し替えたので、u.body・u.legL などから兵の木が丸ごと残り、越前で 200 秒に遠景へ戻した
  //   約千人の形が全部 GC されずに残っていた。根が場面（Scene）の物（地面の槍・陣笠など）は今までどおり触らない。
  for (const k of Object.keys(u)) {
    const v = u[k];
    if (v && v.isObject3D && v !== GONE_PART && !inScene(v)) u[k] = GONE_PART;
  }
  // 甲冑の汚れ・矢の入れ物（armor_wear.js）も兵の木につながっている。要る時は armorFrame が作り直す
  if (u.armorWear && !inScene(u.armorWear.root)) u.armorWear = null;
  // 乗り手の手綱・鐙（units_model.js seatRider）も同じ。稲葉山で騎馬の供回りの形が残っていた
  if (u.riderModel && !inScene(u.riderModel.reins)) u.riderModel = null;
}
