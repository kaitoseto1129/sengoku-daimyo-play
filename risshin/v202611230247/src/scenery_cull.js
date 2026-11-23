// 11/18 kaito「見えない所は描かない・遠くは描かない」：霧で見えなくなる遠さより先の、動かない建物・置き物（舞台の直の子）は描かない。
//   兵と同じ遠さ（world.vis と霧の far の小さい方）に、物の大きさと 10m の余裕を足した所で切る。近づけば戻す。
//   兵・動く物・大きな物（地面・空・遠景）・初めから隠れている物には触らない。四分の一秒ごとに見直す（毎コマは見ない）
import * as THREE from 'three';
import { MEM_TIGHT } from './settings.js';

const _s = new THREE.Sphere();
export function sceneryCull(battle, camera) {
  const W = battle?.world, sc = battle?.scene;
  // iPhone だけ・戦が始まった後だけ（支度の間は切らない。11/18 実機で支度が終わらなかった）
  if (!MEM_TIGHT || !W || !sc || !camera || W.ohView || !((battle.t || 0) > 2)) return restore(battle);
  const t = performance.now();
  if (battle._scT && t - battle._scT < 250) return;
  battle._scT = t;
  const vis = Math.min(W.vis ?? Infinity, sc.fog?.far ?? 150);
  if (!(vis < 400)) return restore(battle);
  let units = battle._scUnits;
  const A = battle.army;
  if (!units || battle._scUnitN !== (A?.units?.length || 0)) {
    units = battle._scUnits = new Set();
    for (const u of A?.units || []) if (u.mesh) units.add(u.mesh);
    battle._scUnitN = A?.units?.length || 0;
  }
  const list = battle._scList || (battle._scList = []);
  let budget = 30;
  const cx = camera.position.x, cz = camera.position.z;
  for (const o of sc.children) {
    if (units.has(o) || o.isLight || o.isCamera || o.isPoints || o.isSprite || o.isInstancedMesh) continue;
    if (!o._scOff && o.visible === false) continue;
    let r = o._scR;
    if (r === undefined) {
      if (budget-- <= 0) continue;
      r = null;
      // 11/22 K615①：軽い大軍（addDistantArmy の群れ）は子の場所（A.off）で歩くので、組の置き場は動かず、覚えた真ん中が古いまま切っていた（近づいても隊が出ない・寄った隊が消える）。
      //   軍勢の群れは切らない（遠い大軍は world_lod.js が隊ごとに描かない）
      if ((o.isMesh || o.isGroup) && o.frustumCulled !== false && !o.userData.unit && !o.userData.noFreeze && typeof o.take !== 'function') {
        const b = new THREE.Box3().setFromObject(o);
        if (!b.isEmpty()) { b.getBoundingSphere(_s); if (_s.radius < 60) r = { x: _s.center.x, z: _s.center.z, r: _s.radius, mw: o.matrixWorld.elements[12] + o.matrixWorld.elements[14] }; }
      }
      o._scR = r;
    }
    if (!r) continue;
    if (o.matrixWorld.elements[12] + o.matrixWorld.elements[14] !== r.mw) { o._scR = null; if (o._scOff) { o._scOff = false; o.visible = true; } continue; }   // 動いた物は外す
    const lim = vis + r.r + 10, far = (r.x - cx) ** 2 + (r.z - cz) ** 2 > lim * lim;
    if (far && !o._scOff) { o._scOff = true; o.visible = false; list.push(o); }
    else if (!far && o._scOff) { o._scOff = false; o.visible = true; }
  }
}
function restore(battle) {
  const list = battle?._scList;
  if (!list) return;
  for (const o of list) if (o._scOff) { o._scOff = false; o.visible = true; }
  list.length = 0;
}
