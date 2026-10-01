// ======================================================================
// 竹束（taketaba.js）… docs/quality-upgrade-plan.md「6. 竹束」
// b_castle.js にあった竹束（形・押す・陰は前からの矢玉をほぼ防ぐ）と、
// siege_rocks.js の「抱えた者は落石の7割を防ぐ」の考えを、一つの部品にまとめた。
// castle_plan を使う攻城戦（高遠・比叡山・越前一向一揆・稲葉山など）は、
//   addTaba / placeFromSpots で竹束を置き、patchGunCover(rt) を一度呼び、
//   毎フレーム tickTabas(rt, dt) と tabaInteractTick(rt, opts) を呼べば、
//   押す・据える・陰に入る、が動く。形と材質は使い回し、毎コマ new しない。
// ======================================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { woodTex } from './nature.js';

function paint(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

let TABA_GEO = null, TABA_MAT = null;
// 竹束：青竹を束ねて縄で縛った楯（原点に、前 = -z を向けて作る。動かすので一つずつの形）
export function tabaGeo() {
  if (TABA_GEO) return TABA_GEO;
  const P = [];
  for (let i = 0; i < 11; i++) {
    const g = new THREE.CylinderGeometry(0.08, 0.09, 2.1, 6);
    g.rotateX(0.2); g.translate((i - 5) * 0.15, 1.0, (i % 2) * 0.05 - 0.2);
    P.push(paint(g, [0x7c7a48, 0x6e6c3e, 0x86804e][i % 3]));
  }
  for (const yy of [0.55, 1.45]) { const b = new THREE.BoxGeometry(1.75, 0.07, 0.09); b.translate(0, yy, -0.18 - yy * 0.2 + 0.1); P.push(paint(b, 0x4a3a22)); }
  const s = new THREE.CylinderGeometry(0.05, 0.05, 1.9, 5); s.rotateX(-0.7); s.translate(0, 0.7, 0.45); P.push(paint(s, 0x5a4a32));
  TABA_GEO = mergeGeometries(P);
  return TABA_GEO;
}
export function tabaMat() {
  if (!TABA_MAT) TABA_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, map: woodTex(), roughness: 0.9, metalness: 0 });
  return TABA_MAT;
}

function tabas(rt) { return rt.flags.tabas || (rt.flags.tabas = []); }

// 竹束を一つ置く（team の側の楯。o.van があれば、その組の前について動く）
export function addTaba(rt, x, z, team = 0, o = {}) {
  const m = new THREE.Mesh(tabaGeo(), tabaMat());
  m.castShadow = true;
  rt.scene.add(m);
  const tb = { m, x, z, rot: o.rot ?? Math.PI, team, carrier: null, van: o.van || null, off: o.off || 0, fixed: !!o.fixed,
    faceSign: o.faceSign ?? -1, vanDist: o.vanDist ?? 2.8 };
  placeTaba(rt, tb);
  tabas(rt).push(tb);
  return tb;
}
// 定義（castles/*.js の def）に書いた置き場の列から、まとめて竹束を置く
// spots: [[x,z], ...] か [{x,z,rot?,van?,off?}, ...]
export function placeFromSpots(rt, spots, team = 0, o = {}) {
  for (const s of spots || []) {
    if (Array.isArray(s)) addTaba(rt, s[0], s[1], team, o);
    else addTaba(rt, s.x, s.z, team, { ...o, ...s });
  }
}
export function placeTaba(rt, tb) {
  tb.m.position.set(tb.x, rt.world.heightAt(tb.x, tb.z) - 0.05, tb.z);
  // 竹束の前（原点の -z）を寄せる向きへ
  tb.m.rotation.y = tb.rot + Math.PI;
}

// 竹束の陰にいる（team の味方の竹束から 2.6m 以内）か
export function nearTaba(rt, x, z, team) {
  for (const tb of tabas(rt)) {
    if (tb.team !== team) continue;
    if (Math.hypot(tb.x - x, tb.z - z) < 2.6) return tb;
  }
  return null;
}
// 石・丸太など、向きを問わない落下物を防げるか（siege_rocks.js と合わせる）
export function inCoverOf(rt, x, z, team) { return !!nearTaba(rt, x, z, team); }

// 竹束の陰にいる者には、前から来る矢玉がほとんど当たらない（army.damage を一度だけ差し替える）
export function patchGunCover(rt) {
  if (rt.flags.tabaCoverPatched) return;
  rt.flags.tabaCoverPatched = true;
  const army = rt.army;
  const dmg0 = army.damage.bind(army);
  army.damage = (t, amount, src, opts) => {
    if (t && !t.isStruct && src && (src.type === 'gun' || src.type === 'bow') && src.team !== t.team && t.pos && (rt.flags.tabas || []).length) {
      const dS = Math.hypot(src.pos.x - t.pos.x, src.pos.z - t.pos.z);
      if (dS > 6) {
        for (const tb of rt.flags.tabas) {
          if (tb.team !== t.team) continue;
          const dx = tb.x - t.pos.x, dz = tb.z - t.pos.z, d = Math.hypot(dx, dz);
          if (d > 2.6 || d < 0.05) continue;
          const dot = (dx * (src.pos.x - t.pos.x) + dz * (src.pos.z - t.pos.z)) / (d * dS);
          if (dot > 0.5 && Math.random() < 0.85) {
            army.play('knock', { x: tb.x, z: tb.z }, 0.5);
            army.spark(tb.x, rt.world.heightAt(tb.x, tb.z) + 1.2, tb.z, 3);
            rt.flags.tabaSaved = (rt.flags.tabaSaved || 0) + 1;
            return;
          }
        }
      }
    }
    return dmg0(t, amount, src, opts);
  };
}

// 毎フレーム：押している者の前、または組の前について動く
export function tickTabas(rt, dt) {
  const F = rt.flags, pu = rt.player.u;
  for (const tb of F.tabas || []) {
    if (tb.fixed) continue;
    if (tb.carrier === 'player') {
      const h = pu.heading || 0;
      tb.x = pu.pos.x + Math.sin(h) * 1.05; tb.z = pu.pos.z + Math.cos(h) * 1.05; tb.rot = h;
      placeTaba(rt, tb);
    } else if (tb.van && tb.van.count && (tb.van.order === 'move' || tb.van.order === 'hold')) {
      const c = tb.van.center();
      const tx = c.x + tb.off, tz = c.z + tb.faceSign * tb.vanDist;
      tb.x += (tx - tb.x) * Math.min(1, dt * 2); tb.z += (tz - tb.z) * Math.min(1, dt * 2);
      placeTaba(rt, tb);
    }
  }
}

// E で使う物（押す・据える）：want 配列（b_castle.js の acts と同じ形）を返す
export function wantEntries(rt, { allowPush = true, team = 0 } = {}) {
  const F = rt.flags, pu = rt.player.u, want = [];
  const mine = (F.tabas || []).find((tb) => tb.carrier === 'player');
  if (mine) want.push(['taba', () => ({ x: mine.x, z: mine.z }), '竹束を据える', () => { mine.carrier = null; mine.fixed = true; }, { r: 3 }]);
  else if (allowPush) {
    let best = null, bd = 2.6;
    for (const tb of F.tabas || []) { if (tb.team !== team || tb.van || tb.carrier) continue; const d = Math.hypot(tb.x - pu.pos.x, tb.z - pu.pos.z); if (d < bd) { bd = d; best = tb; } }
    if (best) want.push(['taba', { x: best.x, z: best.z }, '竹束を押して歩く', () => { best.carrier = 'player'; best.fixed = false; }, { r: 2.8 }]);
  }
  return want;
}
// 自前で E の札を出していない戦のための、まとめの呼び出し（毎フレーム一回）
export function tabaInteractTick(rt, opts) {
  const F = rt.flags;
  const want = wantEntries(rt, opts);
  const key = want.map((w) => w[0] + w[2]).join('|');
  if (key === F.tabaActKey) return;
  F.tabaActKey = key;
  for (const id of F.tabaActIds || []) rt.uninteract(id);
  F.tabaActIds = want.map((w) => w[0]);
  for (const [id, pos, label, fn, o] of want) rt.addInteract(id, pos, label, fn, o);
}

// 寄せの合図：「竹束を前へ」。大将の声と呼び出し札
export function announceAdvance(rt, speaker, line = '者ども、竹束を前へ！　押し立てて寄せよ！') {
  rt.banner('竹束を前へ', '押して、寄せ場まで');
  if (speaker) rt.say(speaker, line, 3);
}
