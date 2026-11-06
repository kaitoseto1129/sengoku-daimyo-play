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
function logGeo(kind, coarse = false) {
  const key = kind + (coarse ? '遠' : '近');
  if (!GEO[key]) {
    const heavy = kind === '破城槌', length = heavy ? 4.4 : 3.8;
    const g = new THREE.CylinderGeometry(heavy ? .21 : .17, heavy ? .24 : .2,
      length, coarse ? 6 : 12, coarse ? 1 : 6);
    const p = g.attributes.position, uv = g.attributes.uv;
    // 真円の棒を避け、木口を少し面取りする。周の継ぎ目と木口も同じ位置へ動かす。
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const a = Math.atan2(z, x);
      const r = (1 + .035 * Math.sin(a * 3) + .02 * Math.cos(a * 5))
        * (Math.abs(y) > length * .49 ? .93 : 1);
      p.setXYZ(i, x * r, y, z * r);
    }
    // 側面の縦木目と、両端の年輪を一枚の絵にまとめる。材質も描画も増やさない。
    const sideEnd = (coarse ? 7 : 13) * (coarse ? 2 : 7);
    for (let i = 0; i < uv.count; i++) {
      const u = uv.getX(i), v = uv.getY(i);
      uv.setXY(i, i < sideEnd ? u * .74 : .75 + u * .25, i < sideEnd ? v : .25 + v * .5);
    }
    g.computeVertexNormals();
    GEO[key] = g;
  }
  return GEO[key];
}
function logMat() {
  if (!MAT.wood) {
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 256;
    const c = canvas.getContext('2d');
    c.fillStyle = '#76604a'; c.fillRect(0, 0, 512, 256);
    // 固定の種で裂け目・削り跡を描き、細い木目を丸太の長さに沿わせる。
    for (let i = 0; i < 210; i++) {
      const x = (i * 73.13) % 379, y = (i * 37.71) % 256;
      c.strokeStyle = i % 3 ? 'rgba(38,28,19,.32)' : 'rgba(211,182,135,.36)';
      c.lineWidth = i % 7 === 0 ? 2 : .7;
      c.beginPath(); c.moveTo(x, y - 80);
      c.bezierCurveTo(x + 3, y - 35, x - 2, y + 15, x + 1, y + 90); c.stroke();
    }
    // 二か所の締め縄。巻きごとの陰と撚りを絵に焼き、遠くでも形を増やさない。
    for (const y of [65, 183]) {
      c.fillStyle = '#392e21'; c.fillRect(0, y - 2, 380, 15);
      for (let j = 0; j < 3; j++) {
        c.fillStyle = j % 2 ? '#a58e64' : '#baa278'; c.fillRect(0, y + j * 4, 380, 3);
        c.strokeStyle = '#756044'; c.lineWidth = 1; c.beginPath();
        for (let x = -4; x < 380; x += 6) { c.moveTo(x, y + j * 4); c.lineTo(x + 3, y + j * 4 + 3); }
        c.stroke();
      }
    }
    c.fillStyle = '#ad9166'; c.fillRect(384, 64, 128, 128);
    for (let i = 1; i < 13; i++) {
      c.strokeStyle = i % 3 ? '#816441' : '#c1a477'; c.lineWidth = i % 3 ? 1.2 : 2;
      c.beginPath(); c.ellipse(447, 129, i * 5, i * 4.8, .12, 0, Math.PI * 2); c.stroke();
    }
    c.strokeStyle = '#57422c'; c.lineWidth = 1.5; c.beginPath();
    for (const a of [.4, 2.8, 4.7]) {
      c.moveTo(448 + Math.cos(a) * 25, 128 + Math.sin(a) * 25);
      c.lineTo(448 + Math.cos(a) * 64, 128 + Math.sin(a) * 64);
    }
    c.stroke();
    const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
    MAT.wood = new THREE.MeshStandardMaterial({ map, bumpMap: map, bumpScale: .018, roughness: .94 });
    // 目前を横切る材木だけ網目で透かす。並べ替えや透過用の描き直しは増やさない。
    {
      const mat = MAT.wood;
      mat.customProgramCacheKey = () => 'ramNearWood';
      mat.onBeforeCompile = (sh) => {
        sh.fragmentShader = sh.fragmentShader.replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
          float ramNear = smoothstep(0.55, 1.8, length(vViewPosition));
          float ramDot = fract(dot(floor(gl_FragCoord.xy), vec2(0.75487766, 0.56984029)));
          if (ramDot > ramNear) discard;`);
      };
    }
  }
  return MAT.wood;
}

// 打つ力と揺れの速さ（破城槌の方が重く、ゆっくり・強く打つ）
// 千八百の門でも、打ち手が取り付けば一分ほどで破れる重さにする。
const POWER = { 丸太: 48, 破城槌: 80 };
const HIT_R = 4.2;        // 門に着いたとみなす間合い
const HIT_PERIOD = 1.1; // 揺れが門に当たる周期（秒）に合わせて損を入れる間隔

function canCarry(u) {
  return u.alive && !u.fleeing && !u.woundOut && !u.downed && !u.rearWound && !u.climb && !u._carry &&
    !u.isPlayer && !u.mounted && u.type !== 'gun' && u.type !== 'bow';
}

export function makeRam(rt, o = {}) {
  const group = o.group;
  const gate = o.gate;
  const kind = o.kind === '破城槌' ? '破城槌' : '丸太';
  const nearGeo = logGeo(kind, false), farGeo = logGeo(kind, true);
  const mesh = new THREE.Mesh(nearGeo, logMat());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.noFreeze = true;
  mesh.visible = false;
  rt.scene.add(mesh);
  if (gate && gate.struct) gate.struct._ramMesh = mesh;

  const log = (text) => { rt.__siegeLog = rt.__siegeLog || []; rt.__siegeLog.push(`${Math.round(rt.t || 0)}s ${text}`); };

  let stopped = false;
  let hitT = 0;
  const startCarriers = group && group.units ? group.units.filter((u) => u.alive).length : 0;
  // 手の目当ては初めに六人分だけ用意し、毎コマ同じ入れ物を使う。
  const grips = Array.from({ length: 6 }, () => ({ u: null, right: new THREE.Vector3(), left: new THREE.Vector3(), visible: true }));
  const clearGrips = () => {
    for (const grip of grips) if (grip.u) {
      if (grip.u.ramGrip === grip) { grip.u.ramGrip = null; if (grip.u.wpn) grip.u.wpn.visible = grip.visible; }
      grip.u = null;
    }
  };

  return {
    mesh, stopped: false,
    // 毎コマ：組の真ん中について動き、門に着くと前後に揺らして打つ
    tick(dt) {
      clearGrips();
      if (stopped || !gate || gate.breached || gate.opened || !gate.struct.alive || (group && group.routed)) { mesh.visible = false; return; }
      const struct = gate.struct;
      const mx = (struct.seg[0] + struct.seg[2]) / 2, mz = (struct.seg[1] + struct.seg[3]) / 2;
      let count = 0, n = 0, working = 0, cx = 0, cz = 0, bearer = null, nearest = Infinity;
      // 配列の先頭の後列ではなく、門へ着いた打ち手を中心に担ぐ。
      for (const u of (group && group.units) || EMPTY) {
        if (u.alive) count++;
        if (!canCarry(u)) continue;
        const d = Math.hypot(u.pos.x - mx, u.pos.z - mz);
        if (d < nearest) { nearest = d; bearer = u; }
      }
      if (bearer) for (const u of group.units) {
        if (!canCarry(u) || Math.hypot(u.pos.x - bearer.pos.x, u.pos.z - bearer.pos.z) > 3.5) continue;
        if (u.target === struct && Math.hypot(u.pos.x - mx, u.pos.z - mz) < HIT_R &&
            Math.abs(u.pos.y - rt.world.heightAt(mx, mz)) < 2) working++;
        if (n < 6) { cx += u.pos.x; cz += u.pos.z; n++; }
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
      const d = Math.hypot(mx - cx, mz - cz);
      const atGate = working >= 2 && d < HIT_R && Math.abs(bearer.pos.y - rt.world.heightAt(mx, mz)) < 2
        && /^(attack|assault|charge)$/.test(group.order);
      // 引く→打つを損の周期とそろえる。門を離れた間は振りを止める。
      if (atGate) hitT += dt; else hitT = 0;
      const heading = atGate ? Math.atan2(mx - cx, mz - cz) : (bearer.heading || Math.PI);
      const swing = atGate && !S.reduceMotion ? Math.cos(Math.min(1, hitT / HIT_PERIOD) * Math.PI * 2) * 0.6 : 0;
      const x = cx + Math.sin(heading) * swing, z = cz + Math.cos(heading) * swing;
      mesh.position.set(x, (rt.world ? rt.world.heightAt(x, z) : 0) + 0.95, z);
      mesh.rotation.order = 'YXZ';
      const fx = Math.sin(heading), fz = Math.cos(heading), length = kind === '破城槌' ? 4.4 : 3.8;
      const frontY = rt.world.heightAt(x + fx * length / 2, z + fz * length / 2);
      const backY = rt.world.heightAt(x - fx * length / 2, z - fz * length / 2);
      const slope = Math.max(-.35, Math.min(.35, Math.atan2(frontY - backY, length)));
      mesh.rotation.set(Math.PI / 2 - slope, heading, 0);
      let gi = 0;
      for (const u of (group && group.units) || EMPTY) {
        if (gi >= grips.length) break;
        if (!u.alive || u.fleeing || u.isPlayer || u.mounted || u.climb || u.downed || u.stagger > 0 ||
            u.woundOut || u.rearWound || !u.wpn || !u.hand || u.type === 'gun' || u.type === 'bow' ||
            u.target && !u.target.isStruct) continue;
        const dx = u.pos.x - x, dz = u.pos.z - z;
        const along = dx * fx + dz * fz, across = dx * fz - dz * fx;
        const y = mesh.position.y + along * Math.tan(slope) - .12;
        // 手の届く者だけ支える。離れた者の腕を材木へ引き伸ばさない。
        if (Math.abs(along) > length / 2 - .35 || Math.abs(across) < .25 || Math.abs(across) > .75 ||
            Math.abs(y - u.pos.y - 1) > .35) continue;
        const grip = grips[gi++]; grip.u = u; grip.visible = u.wpn.visible;
        grip.right.set(x + fx * (along - .16), y, z + fz * (along - .16));
        grip.left.set(x + fx * (along + .16), y, z + fz * (along + .16));
        u.ramGrip = grip; u.wpn.visible = false;
      }
      const view = rt.player?.u?.pos;
      mesh.geometry = false || view && (view.x - x) ** 2 + (view.z - z) ** 2 > 32 * 32 ? farGeo : nearGeo;

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
