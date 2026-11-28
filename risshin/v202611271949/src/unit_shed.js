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
const SHED_KEEP = new Set(['_shed', '_shrunk']);
const SHED_NULL = ['target', 'moveTo', 'atk', 'swing', 'reload', 'bind', 'lastHit', 'hit', 'woundSource', 'idl', 'spr', 'stk', 'nearCounts', 'cvTarget',
  'crowdSkip', 'distanceTarget', 'frontlineStep', 'spearFront', 'qualityPoint', 'dragging'];
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
  // 無傷で遠景へ戻した兵（despawn の _shrunk）は討たれていないので討った数に数えない（11/18 司令の決め）。陣形の人数（initial）と持ち場も
  //   詰めてあるので、隊の表からも外す。残すと、起こしては戻す隊の表が伸び続け、稲葉山・姉川で 300 秒に千〜二千人分が残り、
  //   記憶と隊ごとの毎コマの輪が伸びた（11/18 夜50-47）
  // 11/26 K675 Sanae（生きている量）：外した兵の JS の側の覚え（判断・足・見通し・槍の筋の作り置き・傷の元・最後の一撃）も手放す。
  //   隊の表（g.units）に残る兵は桶狭間5分で千人あまり・一人約11KB（鍵 約320）で、狙い・傷の元から倒れた兵を鎖でつかんでいた。
  //   外した兵はもう動かず描かれない（兵の表・写しの外）。'_' で始まる鍵は後から足す作り置き（無ければ作り直す）なので消し、
  //   判断の参照は空にする。生死・体力・隊・型・名・位置・姿（look）は数えと札のために残す
  for (const k of Object.keys(u)) if (k.charCodeAt(0) === 95 && !SHED_KEEP.has(k)) delete u[k];
  for (const k of SHED_NULL) if (u[k] != null && typeof u[k] === 'object') u[k] = null;
  const g = u._shrunk && u.group;
  if (g && g.units && g.leader !== u) { const i = g.units.indexOf(u); if (i >= 0) g.units.splice(i, 1); }
}
