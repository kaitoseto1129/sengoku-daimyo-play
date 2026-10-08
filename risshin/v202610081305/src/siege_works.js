// 地図の城攻め：掘った仕寄りと、柴・土俵で埋める堀。兵は増やさない。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { addTaba, tabaMat } from './taketaba.js';

let SHIELD = null, EARTH = null, BLOCK = null;
function shieldGeometry() {
  if (SHIELD) return SHIELD;
  const parts = [];
  for (let i = 0; i < 6; i++) {
    const p = new THREE.BoxGeometry(.26, 1.9, .12);
    p.translate((i - 2.5) * .26, .95, 0);
    const a = new Float32Array(p.attributes.position.count * 3);
    for (let k = 0; k < a.length; k += 3) { a[k] = .36; a[k + 1] = .27; a[k + 2] = .16; }
    p.setAttribute('color', new THREE.BufferAttribute(a, 3)); parts.push(p);
  }
  SHIELD = mergeGeometries(parts);
  return SHIELD;
}

// 準備済みの仕寄りを地形そのものへ掘る。入口・出口はゆるい坂にする。
export function prepareSiegeWorks(P, spawnZ, yoseZ) {
  const height = P.height;
  const lanes = [-14, 3, 14], z0 = yoseZ + 3, z1 = spawnZ - 8;
  function depth(x, z) {
    if (z <= z0 || z >= z1) return 0;
    let side = 0;
    for (const cx of lanes) side = Math.max(side, Math.max(0, Math.min(1, (4 - Math.abs(x - cx)) / 1.6)));
    return 1.15 * side * Math.min(1, (z - z0) / 5, (z1 - z) / 5);
  }
  P.height = (x, z) => height(x, z) - depth(x, z);
  return { depth, ladder: P.ladders.find((l) => l.from === 0), progress: 0, ready: false, active: false };
}

export function buildSiegeWorks(rt, works, team) {
  const l = works.ladder;
  if (!l) { works.ready = true; return; }
  const W = rt.world;
  works.outer = { x: l.x + l.n.x * 17, z: l.z + l.n.z * 17 };
  works.inner = { x: l.x + l.n.x * 1.8, z: l.z + l.n.z * 1.8 };
  works.y0 = W.heightAt(works.outer.x, works.outer.z);
  works.y1 = W.heightAt(works.inner.x, works.inner.z);
  works.blocks = [];
  if (!BLOCK) BLOCK = new THREE.BoxGeometry(1, 1, 1);
  if (!EARTH) EARTH = new THREE.MeshStandardMaterial({ color: 0x6d583b, roughness: 1 });
  // 埋める幅は三人分だけ。切岸や城壁は埋めない。
  for (let i = 0; i < 12; i++) {
    const t = (i + .5) / 12, x = works.outer.x + (works.inner.x - works.outer.x) * t, z = works.outer.z + (works.inner.z - works.outer.z) * t;
    const top = works.y0 + (works.y1 - works.y0) * t, bottom = W.heightAt(x, z);
    if (top - bottom < .35) continue;
    const m = new THREE.Mesh(BLOCK, EARTH);
    m.position.set(x, bottom, z); m.rotation.y = Math.atan2(l.n.x, l.n.z);
    m.scale.set(3.6, .01, 1.4); m.visible = false;
    rt.scene.add(m); works.blocks.push({ m, bottom, top });
  }
  works.ready = works.blocks.length === 0;
  if (!works.ready) rt.marker('fill', works.outer, '堀を埋める所', { h: 2.5 });
  // 門破りの組が板の楯を押す。形と材質は共用する。
  for (const off of [-1.1, 1.1]) {
    const tb = addTaba(rt, rt.flags.ram.anchor.x + off, rt.flags.ram.anchor.z - 2.8, team, { van: rt.flags.ram, off });
    tb.m.geometry = shieldGeometry(); tb.m.material = tabaMat();
  }
  const damage = rt.army.damage.bind(rt.army);
  rt.army.damage = (t, amount, src, opts) => {
    if (t?.alive && !t.isStruct && t.team === team && src?.pos && src.team !== team && (opts?.kind === 'gun' || opts?.kind === 'arrow')) {
      const d = Math.hypot(src.pos.x - t.pos.x, src.pos.z - t.pos.z);
      if (d > 6) {
        // 仕寄りは上から・横からの射撃まで消さない。
        if (!t.climb && works.depth(t.pos.x, t.pos.z) > .7 && src.pos.y - t.pos.y < 4) amount *= .45;
        else if (src.sama && d < 50) amount *= 1.5;
      }
    }
    return damage(t, amount, src, opts);
  };
}

export function beginSiegeWorks(rt, works) {
  if (works.ready || works.active) return;
  works.active = true;
  const g = rt.flags.ram;
  g.order = 'move'; g.speed = .85; g.dest = works.outer; g.formation = 'column';
  g.onArrive = (gg) => { gg.order = 'hold'; gg.anchor = works.outer; };
  rt.obj('fill', '楯で堀埋めの組を守れ。柴と土を入れて道を作れ', 'main');
  rt.say('門破りの頭', '堀へ柴と土俵を入れよ！　楯を前へ。狭間の鉄砲に身をさらすな', 4);
}

export function tickSiegeWorks(rt, works, dt) {
  if (!works.active || works.ready) return;
  let hands = 0;
  for (const u of rt.flags.ram.units) {
    if (u.alive && !u.fleeing && !u.climb && !(u.stagger > 0) && !(u.target?.alive && !u.target.isStruct) && Math.hypot(u.pos.x - works.outer.x, u.pos.z - works.outer.z) < 5) hands++;
  }
  // 生きて働ける人数が減るほど遅れる。時間だけでは完成しない。
  works.progress = Math.min(1, works.progress + dt * Math.min(6, hands) / 216);
  for (const b of works.blocks) {
    const h = (b.top - b.bottom) * works.progress;
    b.m.visible = h > .05; b.m.scale.y = Math.max(.01, h); b.m.position.y = b.bottom + h / 2;
  }
  rt.objProgress('fill', `堀埋め ${Math.round(works.progress * 100)}％・働ける者 ${hands}人`);
  if (works.progress < 1) return;
  works.ready = true;
  // 完成した土の道だけを歩ける地面にする。水深・坂・兵の歩みも同じ高さを見る。
  const W = rt.world, base = W.heightAt.bind(W), a = works.outer, b = works.inner;
  const dx = b.x - a.x, dz = b.z - a.z, len2 = dx * dx + dz * dz;
  W.heightAt = (x, z) => {
    const t = ((x - a.x) * dx + (z - a.z) * dz) / len2;
    if (t < 0 || t > 1 || Math.abs((x - a.x) * dz - (z - a.z) * dx) > Math.sqrt(len2) * 1.8) return base(x, z);
    return Math.max(base(x, z), works.y0 + (works.y1 - works.y0) * t);
  };
  rt.objDone('fill'); rt.unmark('fill');
  rt.bark('堀に道が通った。梯子を掛け、門破りの組を進めよ');
}

export function siegeWorkEntries(works, want) {
  if (!works.active || works.ready) return;
  want.push(['fill-work', works.outer, '柴と土を堀に入れる', () => { works.progress = Math.min(1, works.progress + .06); }, { r: 4, hold: 1.5 }]);
}
