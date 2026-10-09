// ======================================================================
// 通りの人込み（kaito 10/2 二回目 ②）
// 遠い人は軽い描き方：一つの InstancedMesh（小袖の形・人ごとの色）で何十人も一度に描く。
// 近づくと、同じ色の本物の人（使い回す数人の組）がその場に入れ替わり、ぶつかれば避け、話しかけられる。
// 離れると、また軽い形に戻る（GTA の通行人と同じ考え）。
// 人の数は刻（夜は少ない）・雨（半分）・出世の格（lv が上がるほど賑わう）で変わる。
// ======================================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { allyGroup } from './bhelp.js';
import { S as SETTINGS } from './settings.js';
import { park, unpark, giveUmbrella } from './town_air.js';

// 歩く道（折れ線）：loop は輪、それ以外は端で折り返す。w は道の幅の半分（人が散らばる幅）
const ROUTES = [
  { pts: [[0, -76], [0, -50], [0, -22], [0, 4], [0, 28]], w: 3.0, n: 15 },
  { pts: [[-56, 30], [-20, 30], [0, 30], [20, 30], [56, 30]], w: 2.4, n: 5 },
  { pts: [[6, -51], [18, -51], [18, -37], [18, -24], [6, -24], [6, -37]], w: 1.2, loop: true, n: 6 },
  { pts: [[-3, -22], [-20, -22], [-33, -22], [-33, -45], [-33, -62]], w: 1.3, n: 3 },
  { pts: [[-33, -22], [-33, 0], [-33, 14]], w: 1.2, n: 2 },
  { pts: [[4, -38], [20, -38], [30, -38], [36, -38]], w: 1.0, n: 2 },
  { pts: [[0, -78], [0, -100], [0, -130]], w: 2.2, n: 2 },
];
const LINES = {
  day: ['今日は人出が多いのう', '楽市のおかげで、よそからも商人が来る', '城の普請で、また人足を集めとるそうな', '戦の噂で、米の値が上がっとる'],
  dusk: ['日が暮れる前に帰らねば', '夕餉の支度じゃ。急がんと', '今日もよう歩いた'],
  night: ['夜道は物騒じゃ。お侍さまも気をつけなされ', '提灯が無いと足元が見えん'],
  rain: ['ひどい降りじゃ', '傘を持ってきてよかった', '濡れ鼠じゃ……'],
};
const BUMP = ['危ないのう！', 'どこを見て歩いとる', 'おっと……気をつけなされ', 'わっ、押さんでくだされ'];

// ---- 軽い人の形：小袖の胴（色を人ごとに）・帯・頭・髷・腕・脛 ----
// aTint：1 の所だけ人ごとの色を掛ける（顔や髪は色を変えない）
function personGeo() {
  const parts = [];
  const add = (g, hex, tint) => {
    const n = g.attributes.position.count, c = new THREE.Color(hex), a = new Float32Array(n * 3), t = new Float32Array(n).fill(tint ? 1 : 0);
    for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3)); g.setAttribute('aTint', new THREE.BufferAttribute(t, 1));
    if (g.index) g = g.toNonIndexed();
    g.deleteAttribute('uv');
    parts.push(g);
  };
  const robe = new THREE.CylinderGeometry(0.15, 0.25, 1.12, 8); robe.translate(0, 0.72, 0); add(robe, 0xffffff, true);
  const sh = new THREE.CylinderGeometry(0.2, 0.17, 0.2, 8); sh.translate(0, 1.32, 0); add(sh, 0xffffff, true);
  const obi = new THREE.CylinderGeometry(0.175, 0.185, 0.12, 8); obi.translate(0, 1.0, 0); add(obi, 0x2a2420, false);
  for (const s of [-1, 1]) {
    const arm = new THREE.BoxGeometry(0.11, 0.6, 0.13); arm.translate(s * 0.23, 1.06, 0.02); arm.rotateZ(s * 0.06); add(arm, 0xe6e6e6, true);
    const hand = new THREE.BoxGeometry(0.07, 0.08, 0.08); hand.translate(s * 0.25, 0.73, 0.03); add(hand, 0xb58c68, false);
    const shin = new THREE.BoxGeometry(0.08, 0.2, 0.08); shin.translate(s * 0.08, 0.1, 0); add(shin, 0x9c7453, false);
  }
  const head = new THREE.SphereGeometry(0.11, 8, 6); head.scale(1, 1.12, 1); head.translate(0, 1.54, 0.01); add(head, 0xb58c68, false);
  const hair = new THREE.SphereGeometry(0.115, 8, 4, 0, Math.PI * 2, 0, Math.PI * 0.55); hair.translate(0, 1.56, -0.005); add(hair, 0x1a1612, false);
  const mage = new THREE.BoxGeometry(0.04, 0.04, 0.13); mage.translate(0, 1.68, -0.02); add(mage, 0x1a1612, false);
  return mergeGeometries(parts);
}
function tintMat() {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = 'attribute float aTint;\n' + sh.vertexShader.replace('#include <color_vertex>',
      'vColor = vec3(1.0);\nvColor *= color;\n#ifdef USE_INSTANCING_COLOR\nvColor *= mix(vec3(1.0), instanceColor.xyz, aTint);\n#endif');
  };
  return m;
}
let GEO = null, MATL = null, UGEO = null, UMAT = null;

// ======================================================================
// ctx：{ dress, cloth（色の並び）, lv（出世の格 0〜4） }
export function crowdSetup(rt, ctx) {
  const F = rt.flags, low = SETTINGS.quality === 'low';
  const lv = ctx.lv || 0;
  const scale = (low ? 0.85 : 1) * (0.5 + lv * 0.14);
  // 本物に入れ替わる組：色ごとに一人ずつ（色の並びの頭から）
  const nPool = low ? 7 : 11;
  const C = F.crowd = { agents: [], pool: [], near: low ? 15 : 21, chkT: 0, spd: 1.35, bumpT: -9, said: 0, lv };
  for (let i = 0; i < nPool; i++) {
    const ci = (i * 7 + 3) % ctx.cloth.length;
    const g = allyGroup(rt, { name: '町の人', anchor: { x: 0, z: 0 }, facing: 0, order: 'hold', noRout: true, width: 1, speed: 1.15, march: false, aggro: 0, seekRange: 0, fixed: true },
      [{ type: 'porter', n: 1, o: { flag: null, invuln: true, weapon: 'none' } }]);
    const u = g.units[0];
    if (!u) continue;
    ctx.dress(rt, u, i % 5 === 4 ? 'elder' : 'townsman', i);
    u.name = '町の人';
    u.civ = true; u.civKind = 'townsman';
    const P = { g, u, ci, ag: null, i: 200 + i, crowd: true, talkT: 0 };
    giveUmbrella(P);
    park(P);
    C.pool.push(P);
    rt.addInteract('crowd' + i, () => (P.ag && u.alive && !u.downed ? { x: u.pos.x, z: u.pos.z } : null), '話す　町の人', () => talk(rt, P), { r: 2.2 });
  }
  const cis = C.pool.map((P) => P.ci);
  // 歩く人（データだけ。描くのは軽い形）
  let s = 11;
  const R = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (const [ri, r] of ROUTES.entries()) {
    const n = Math.max(1, Math.round(r.n * scale * 2.1));
    for (let k = 0; k < n; k++) {
      const a = { r, ri, seg: Math.floor(R() * (r.pts.length - 1)), dir: R() < 0.5 ? 1 : -1, off: (R() * 2 - 1) * r.w, k: 0.85 + R() * 0.3, ci: cis[Math.floor(R() * cis.length)], on: true, x: 0, z: 0, h: 0, ph: R() * 6, bound: null, umb: R() < 0.55, sc: 0.92 + R() * 0.12, i: k };
      a.u = R();   // 区間の中の位置
      place(a);
      C.agents.push(a);
    }
  }
  // 軽い形（一つの InstancedMesh）と、雨の傘（もう一つ）
  if (!GEO) { GEO = personGeo(); MATL = tintMat(); }
  const im = new THREE.InstancedMesh(GEO, MATL, C.agents.length);
  im.frustumCulled = false; im.castShadow = false; im.receiveShadow = false; im.count = 0;
  rt.scene.add(im);
  C.im = im;
  if (!UGEO) {
    const t = new THREE.ConeGeometry(0.6, 0.3, 10, 1, true); t.translate(0, 2.12, 0);
    const st = new THREE.CylinderGeometry(0.014, 0.014, 1.1, 4); st.translate(0, 1.55, 0);
    UGEO = mergeGeometries([t.toNonIndexed(), st.toNonIndexed()].map((g) => { g.deleteAttribute('uv'); return g; }));
    UMAT = new THREE.MeshLambertMaterial({ color: 0xb8894a, side: THREE.DoubleSide });
  }
  const um = new THREE.InstancedMesh(UGEO, UMAT, C.agents.length);
  um.frustumCulled = false; um.count = 0;
  rt.scene.add(um);
  C.um = um;
  C.cloth = ctx.cloth.map((h) => new THREE.Color(h));
  C.m4 = new THREE.Matrix4(); C.q = new THREE.Quaternion(); C.p = new THREE.Vector3(); C.sv = new THREE.Vector3(); C.up = new THREE.Vector3(0, 1, 0);
}

// 区間の中の位置（a.u）から、場所と向きを出す
function segOf(a) {
  const P = a.r.pts, i = a.seg, j = a.r.loop ? (i + 1) % P.length : i + 1;
  return [P[i], P[j]];
}
function place(a) {
  const [p0, p1] = segOf(a);
  const dx = p1[0] - p0[0], dz = p1[1] - p0[1], L = Math.hypot(dx, dz) || 1;
  const nx = -dz / L, nz = dx / L;
  a.x = p0[0] + dx * a.u + nx * a.off; a.z = p0[1] + dz * a.u + nz * a.off;
  a.h = Math.atan2(dx * a.dir, dz * a.dir);
  a.len = L;
}
// 次の区間へ（端で折り返す。輪の道は回り続ける）
function nextSeg(a) {
  const n = a.r.pts.length, segs = a.r.loop ? n : n - 1;
  if (a.dir > 0) {
    if (a.seg + 1 < segs) { a.seg++; a.u = 0; } else if (a.r.loop) { a.seg = 0; a.u = 0; } else { a.dir = -1; a.u = 1; }
  } else {
    if (a.seg > 0) { a.seg--; a.u = 1; } else if (a.r.loop) { a.seg = segs - 1; a.u = 1; } else { a.dir = 1; a.u = 0; }
  }
}
// 本物の人が向かう先：今の区間の終わり（向きの側の端）
function goalOf(a) {
  const [p0, p1] = segOf(a);
  const dx = p1[0] - p0[0], dz = p1[1] - p0[1], L = Math.hypot(dx, dz) || 1, nx = -dz / L, nz = dx / L;
  const e = a.dir > 0 ? p1 : p0;
  return { x: e[0] + nx * a.off, z: e[1] + nz * a.off };
}

function talk(rt, P) {
  const C = rt.flags.crowd, A = rt.flags.air, u = P.u, pu = rt.player.u;
  if (rt.choice) return;
  P.talkT = 4; P.g.order = 'hold'; P.g.dest = null; P.g.anchor = { x: u.pos.x, z: u.pos.z };
  u.heading = Math.atan2(pu.pos.x - u.pos.x, pu.pos.z - u.pos.z); P.g.facing = u.heading;
  const k = A && A.rainK > 0.3 ? 'rain' : A && A.ph >= 3 ? 'night' : A && A.ph === 2 ? 'dusk' : 'day';
  const Ls = LINES[k];
  rt.say('町の人', Ls[(C.said++) % Ls.length], 3.5);
}

// 刻と雨で、通りにいてほしい人の割合
function wantShare(rt) {
  const A = rt.flags.air;
  if (!A) return 1;
  return [0.7, 1, 0.75, 0.15][A.ph] * (A.rainK > 0.3 ? 0.5 : 1);
}

function bind(rt, C, a) {
  // 同じ色の空いた人を選ぶ（無ければ空いた人のだれか）
  let P = C.pool.find((q) => !q.ag && q.ci === a.ci && q.u.alive) || C.pool.find((q) => !q.ag && q.u.alive);
  if (!P) return false;
  P.ag = a; a.bound = P;
  unpark(P, { x: a.x, z: a.z }, a.h);
  P.waitT = 0;
  const gl = goalOf(a);
  P.g.order = 'move'; P.g.dest = gl; P.g.facing = a.h;
  if (P.umb) P.umb.visible = a.umb && rt.flags.air && rt.flags.air.rainK > 0.3;
  P.lx = a.x; P.lz = a.z;
  return true;
}
function release(C, P) {
  const a = P.ag;
  if (a) {
    a.x = P.u.pos.x; a.z = P.u.pos.z; a.h = P.u.heading || a.h;
    // 区間の中の位置を、今いる所から取り直す
    const [p0, p1] = segOf(a);
    const dx = p1[0] - p0[0], dz = p1[1] - p0[1], L2 = dx * dx + dz * dz || 1;
    a.u = Math.max(0, Math.min(1, ((a.x - p0[0]) * dx + (a.z - p0[1]) * dz) / L2));
    a.bound = null;
  }
  P.ag = null;
  park(P);
}

export function crowdTick(rt, dt) {
  const C = rt.flags.crowd;
  if (!C) return;
  const pu = rt.player.u, px = pu.pos.x, pz = pu.pos.z, cam = rt.camera;
  const A = rt.flags.air, rain = A && A.rainK > 0.3;
  // 見ている向き（後ろの人は出し入れしてよい）
  const fx = cam ? -cam.matrixWorld.elements[8] : 0, fz = cam ? -cam.matrixWorld.elements[10] : 1;
  const seen = (x, z) => { const dx = x - px, dz = z - pz, d = Math.hypot(dx, dz); return d < 12 || (dx * fx + dz * fz) / (d || 1) > 0.35; };
  // 刻・雨で人を減らす・増やす（見ていない所で、遠い人から）
  C.chkT -= dt;
  if (C.chkT <= 0) {
    C.chkT = 0.3;
    const want = Math.round(C.agents.length * wantShare(rt));
    let on = 0;
    for (const a of C.agents) if (a.on) on++;
    for (const a of C.agents) {
      if (on === want) break;
      const d = Math.hypot(a.x - px, a.z - pz);
      if (on > want && a.on && !a.bound && (d > 40 || !seen(a.x, a.z))) { a.on = false; on--; }
      else if (on < want && !a.on) {
        // 遠くの道の上に置き直して出す
        a.seg = Math.floor(Math.random() * (a.r.pts.length - 1)); a.u = Math.random(); place(a);
        if (Math.hypot(a.x - px, a.z - pz) > 30 || !seen(a.x, a.z)) { a.on = true; on++; }
      }
    }
    // 近い人を本物へ、離れた人を軽い形へ
    for (const P of C.pool) {
      if (!P.ag) continue;
      const u = P.u;
      if (!u.alive || u.downed) { P.ag.on = false; P.ag.bound = null; P.ag = null; continue; }
      if (Math.hypot(u.pos.x - px, u.pos.z - pz) > C.near + 6 || !P.ag.on) release(C, P);
    }
    for (const a of C.agents) {
      if (!a.on || a.bound) continue;
      if (Math.hypot(a.x - px, a.z - pz) < C.near) bind(rt, C, a);
    }
  }
  // 本物になっている人：道をたどる・ぶつかれば避ける
  const pv = pu.vel || { x: 0, z: 0 }, pspd = Math.hypot(pv.x, pv.z), bumpR = rt.player.mounted ? 3.2 : 1.1;
  for (const P of C.pool) {
    const a = P.ag;
    if (!a) continue;
    const u = P.u, g = P.g;
    if (P.umb) P.umb.visible = a.umb && rain;
    // 歩く速さを覚える（軽い形の速さを本物に合わせる）
    const mv = Math.hypot(u.pos.x - P.lx, u.pos.z - P.lz) / Math.max(dt, 1e-3);
    if (g.order === 'move' && mv > 0.4 && mv < 4) C.spd += (mv - C.spd) * Math.min(1, dt * 0.5);
    P.lx = u.pos.x; P.lz = u.pos.z;
    a.x = u.pos.x; a.z = u.pos.z;
    if (P.talkT > 0) { P.talkT -= dt; if (P.talkT <= 0) { g.order = 'move'; g.dest = goalOf(a); } continue; }
    const dx = u.pos.x - px, dz = u.pos.z - pz, d = Math.hypot(dx, dz);
    if (d < bumpR && pspd > 2.2 && !P.stepT) {
      const k = 1.7 / (d || 1);
      g.order = 'move'; g.dest = { x: u.pos.x + dx * k, z: u.pos.z + dz * k }; P.stepT = 1.2;
      const L = rt.flags.life;
      const last = L ? L.bumpT : C.bumpT;
      if (rt.t - last > 8) { if (L) L.bumpT = rt.t; C.bumpT = rt.t; rt.say('町の人', BUMP[Math.floor(Math.random() * BUMP.length)], 2.2); }
      continue;
    }
    if (P.stepT) { P.stepT -= dt; if (P.stepT <= 0) { P.stepT = 0; g.order = 'move'; g.dest = goalOf(a); } continue; }
    if (!g.dest || Math.hypot(u.pos.x - g.dest.x, u.pos.z - g.dest.z) < 1.2) { nextSeg(a); g.order = 'move'; g.dest = goalOf(a); }
  }
  // 軽い形の人：道をたどって歩かせ、まとめて描く
  const W = rt.world, im = C.im, um = C.um, m4 = C.m4, q = C.q, p = C.p, sv = C.sv;
  let n = 0, nu = 0;
  for (const a of C.agents) {
    if (!a.on || a.bound) continue;
    const sp = C.spd * a.k * (rain && !a.umb ? 1.5 : 1);
    a.u += a.dir * sp * dt / (a.len || 1);
    if (a.u > 1 || a.u < 0) { a.u = Math.max(0, Math.min(1, a.u)); nextSeg(a); }
    place(a);
    a.ph += dt * sp * 4.2;
    const dd = Math.hypot(a.x - px, a.z - pz);
    if (dd > 150) continue;
    p.set(a.x, W.heightAt(a.x, a.z) + Math.abs(Math.sin(a.ph)) * 0.035, a.z);
    q.setFromAxisAngle(C.up, a.h + Math.sin(a.ph) * 0.05);
    sv.setScalar(a.sc);
    m4.compose(p, q, sv);
    im.setMatrixAt(n, m4); im.setColorAt(n, C.cloth[a.ci]);
    n++;
    if (rain && a.umb) { um.setMatrixAt(nu, m4); nu++; }
  }
  im.count = n; um.count = nu;
  im.instanceMatrix.needsUpdate = true;
  if (im.instanceColor) im.instanceColor.needsUpdate = true;
  um.instanceMatrix.needsUpdate = true;
  um.visible = nu > 0;
}
