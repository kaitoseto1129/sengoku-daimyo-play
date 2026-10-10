// hajo.js … 門を打つ組（丸太・破城槌）と門の燃えにくさ（束29）
// docs/castle-fort-system-spec.md 17・18・43章。b_castle.js の ramLog（組の真ん中について動き、
// 門に着くと前後に揺れる）と同じ動きを、他の戦からも使える共通の部品にする（b_castle.js は直さない）。
//
// 使い方（戦の定義から）：
//   import { makeRam } from './hajo.js';
//   const ram = makeRam(rt, { group: butai（丸太を担ぐ組）, gate, kind: '丸太'|'破城槌' });
//     // gate：siege_gate.js の makeGate の戻り（struct・inner を持つ）
//   // 毎コマ：ram.tick(dt)
import * as THREE from 'three';
import { sfx } from './audio.js';
import { S } from './settings.js';

const GEO = {};
const MAT = {};
const EMPTY = [];
function logGeo(kind) {
  if (!GEO[kind]) {
    GEO[kind] = kind === '破城槌'
      ? new THREE.CylinderGeometry(0.3, 0.34, 6.2, 8)
      : new THREE.CylinderGeometry(0.22, 0.26, 5.2, 8);
  }
  return GEO[kind];
}
function logMat() {
  if (!MAT.wood) MAT.wood = new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.9 });
  return MAT.wood;
}

// 打つ力と揺れの速さ（破城槌の方が重く、ゆっくり・強く打つ）
const POWER = { 丸太: 9, 破城槌: 16 };
const HIT_R = 7;        // 門に着いたとみなす間合い
const HIT_PERIOD = 1.1; // 揺れが門に当たる周期（秒）に合わせて損を入れる間隔

export function makeRam(rt, o = {}) {
  const group = o.group;
  const gate = o.gate;
  const kind = o.kind === '破城槌' ? '破城槌' : '丸太';
  const mesh = new THREE.Mesh(logGeo(kind), logMat());
  mesh.castShadow = true;
  mesh.visible = false;
  rt.scene.add(mesh);
  if (gate && gate.struct) gate.struct._ramMesh = mesh;

  const log = (text) => { rt.__siegeLog = rt.__siegeLog || []; rt.__siegeLog.push(`${Math.round(rt.t || 0)}s ${text}`); };

  let stopped = false;
  let hitT = 0;
  const startCarriers = group && group.units ? group.units.filter((u) => u.alive).length : 0;

  return {
    mesh, stopped: false,
    // 毎コマ：組の真ん中について動き、門に着くと前後に揺らして打つ
    tick(dt) {
      if (stopped || !gate || gate.breached || gate.opened || !gate.struct.alive || (group && group.routed)) { mesh.visible = false; return; }
      let count = 0, n = 0, cx = 0, cz = 0, bearer = null;
      for (const u of (group && group.units) || EMPTY) {
        if (!u.alive) continue;
        count++;
        if (u.fleeing || u.climb || u._carry) continue;
        if (n < 6) { cx += u.pos.x; cz += u.pos.z; n++; bearer = u; }
      }
      // 担ぎ手の半分が討たれたら止まる【束29】
      if (startCarriers > 0 && count <= startCarriers / 2) {
        stopped = true; this.stopped = true; mesh.visible = false;
        log(`${kind}の組が担ぎ手を失って止まる`);
        return;
      }
      if (n < 2) { mesh.visible = false; hitT = 0; return; }
      mesh.visible = true;
      cx /= n; cz /= n;
      const struct = gate.struct;
      const mx = (struct.seg[0] + struct.seg[2]) / 2, mz = (struct.seg[1] + struct.seg[3]) / 2;
      const d = Math.hypot(mx - cx, mz - cz);
      const atGate = d < HIT_R;
      // 引く→打つを損の周期とそろえる。門を離れた間は振りを止める。
      if (atGate) hitT += dt; else hitT = 0;
      const heading = atGate ? Math.atan2(mx - cx, mz - cz) : (bearer.heading || Math.PI);
      const swing = atGate && !S.reduceMotion ? Math.cos(Math.min(1, hitT / HIT_PERIOD) * Math.PI * 2) * 0.6 : 0;
      const x = cx + Math.sin(heading) * swing, z = cz + Math.cos(heading) * swing;
      mesh.position.set(x, (rt.world ? rt.world.heightAt(x, z) : 0) + 0.95, z);
      mesh.rotation.order = 'YXZ';
      mesh.rotation.set(Math.PI / 2, heading, 0);

      if (atGate) {
        if (hitT >= HIT_PERIOD) {
          hitT %= HIT_PERIOD;
          if (rt.army && rt.army.damage) rt.army.damage(struct, POWER[kind], bearer, { kind: 'ram' });
          try { sfx('gateBash'); } catch (e) { /* 音が無い環境（確かめ）では無視 */ }
          if (typeof rt.logEvent === 'function') rt.logEvent('ramHit', { kind, hp: struct.hp });
        }
      }
    },
  };
}
