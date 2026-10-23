// ======================================================================
// naka_doors.js … 城の御殿・寺の堂・屋敷の「中」の引き戸（kaito 10/14「障子を開けられる」）
//   naka.js の間取り（interior_layouts の portals＝間仕切りの口）に、襖・障子・板戸をはめる。
//   ・近づくと「開ける／閉める」の札（hud は naka_ で始まる札を指で押せる釦にする）。押すと戸が左右の壁の前へ滑る
//   ・閉めている間は当たりがある（紙の戸は槍が通る）。中の兵が戸口へ来ると自分で開ける。遊び手が押し続けても開く
//   ・形は interior_parts の panelInstances を使い回し、一つの建物・一つの種類で一つの InstancedMesh。動く間だけ行列を書く
//   ・寺の堂（内陣と外陣の境）は格子戸。開け放った形から始める（本尊が見える）。ほかは閉めて始める
// ======================================================================
import * as THREE from 'three';
import { SOLIDS } from './props.js';
import { INTERIOR_WALLS } from './shironaka.js';
import { panelInstances } from './interior_parts.js';

export const DOORS = [];
const SKIP = ['tenshu', 'yagura', 'gate'];
const TEMPLE = ['hondo', 'chudo', 'temple'];
const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
const moving = new Set();

export function resetNakaDoors() { DOORS.length = 0; moving.clear(); }

// 間仕切りの口ごとに戸を一組。lv.layout.walls の当たりを作った後に呼ぶ（y0・y1 は壁と同じ高さの幅）
export function addNakaDoors(I, lv, y0, y1) {
  if (SKIP.includes(I.kind) || I.open || I.profile === 'yagura') return;
  for (const p of lv.layout.portals || []) {
    let l = -Infinity, r = Infinity, paper = true;
    for (const v of lv.layout.walls) {
      if (v.guideOnly || Math.abs(v.az - p.z) > .01 || Math.abs(v.bz - p.z) > .01) continue;
      const a = Math.min(v.ax, v.bx), b = Math.max(v.ax, v.bx);
      if (b <= p.x + .01 && b > l) { l = b; paper = v.paper; }
      if (a >= p.x - .01 && a < r) r = a;
    }
    if (!isFinite(l) || !isFinite(r) || r - l < .5 || r - l > 4.4) continue;
    const temple = TEMPLE.includes(I.kind);
    const kind = p.kind || (temple ? 'koshi' : !paper ? 'itado' : ['goten', 'yashiki', 'shisha'].includes(I.kind) ? 'fusumaE' : 'shoji');
    const W = r - l, n = Math.max(2, Math.round(W / 1.8) * 2);
    const [ax, az] = I.P(l, p.z), [bx, bz] = I.P(r, p.z), rad = .06;
    const solid = { k: 's', ax, az, bx, bz, r: rad, yBot: y0, yTop: y1, naka: I.id, fusuma: kind !== 'itado',
      x0: Math.min(ax, bx) - rad, x1: Math.max(ax, bx) + rad, z0: Math.min(az, bz) - rad, z1: Math.max(az, bz) + rad };
    SOLIDS.push(solid); INTERIOR_WALLS.push(solid);
    const [x, z] = I.P((l + r) / 2, p.z);
    const d = { I, lv, kind, lx: (l + r) / 2, lz: p.z, W, n, pw: W / n, h: lv.h > 3 ? 2.3 : lv.h - .02, y: lv.y, x, z, solid, saved: null, open: 0, want: 0, meshes: null, base: 0 };
    (I.doors || (I.doors = [])).push(d); DOORS.push(d);
    if (temple) { d.open = d.want = 1; solidOff(d); }
  }
}

// 近づいて中を作る時（naka.js の buildInside）に、戸の形を grp へ足す
export function buildNakaDoorMeshes(I, grp) {
  if (!I.doors) return;
  const by = new Map();
  for (const d of I.doors) { if (!by.has(d.kind)) by.set(d.kind, []); by.get(d.kind).push(d); }
  for (const [kind, list] of by) {
    const count = list.reduce((s, d) => s + d.n, 0), meshes = panelInstances(kind, count);
    let i = 0;
    for (const d of list) { d.meshes = meshes; d.base = i; i += d.n; }
    for (const m of meshes) { m.count = count; grp.add(m); }
    for (const d of list) pose(d);
    for (const m of meshes) m.computeBoundingSphere();
  }
}

function pose(d) {
  if (!d.meshes) return;
  const I = d.I, k = d.open, e = k * k * (3 - 2 * k);
  Q.setFromAxisAngle(Y, I.rot); S.set(d.pw / .9, d.h / 1.8, 1);
  for (let j = 0; j < d.n; j++) {
    const left = j < d.n / 2;
    // 閉めた時は二本の溝（前後に少しずらす）。開けると左右の壁の前へ引き込む
    const lx = d.lx - d.W / 2 + (j + .5) * d.pw + (left ? -1 : 1) * e * d.W / 2;
    const lz = d.lz + (j % 2 ? 1 : -1) * (.02 + .045 * e);
    const [x, z] = I.P(lx, lz);
    P.set(x, d.y, z); M.compose(P, Q, S);
    for (const m of d.meshes) m.setMatrixAt(d.base + j, M);
  }
  for (const m of d.meshes) m.instanceMatrix.needsUpdate = true;
}
function solidOff(d) {
  const s = d.solid;
  if (!d.saved) d.saved = { ax: s.ax, az: s.az, bx: s.bx, bz: s.bz, x0: s.x0, x1: s.x1, z0: s.z0, z1: s.z1 };
  s.ax = s.az = s.bx = s.bz = s.x0 = s.x1 = s.z0 = s.z1 = 1e9;
}
function setWant(rt, d, want) {
  if (d.want === want) return;
  d.want = want;
  if (want) solidOff(d);
  moving.add(d);
  if (rt.army && rt.army.play) rt.army.play('wood', { x: d.x, z: d.z }, .3);
}
// 戸口の帯（壁の線の前後0.35m・戸の幅の内）に立っているか
function inDoorway(d, o) {
  const [lx, lz] = d.I.L(o.pos.x, o.pos.z);
  return Math.abs(lz - d.lz) < .35 && Math.abs(lx - d.lx) < d.W / 2 + .1 && Math.abs(o.pos.y - d.y) < 1.2;
}

let pickT = -1, pick = null;
function nearest(rt) {
  if (pickT === rt.t) return pick;
  pickT = rt.t; pick = null;
  const u = rt.player && rt.player.u;
  if (!u || !u.alive || rt.player.mounted || !u.naka) return null;
  let bd = 1.5;
  for (const d of DOORS) {
    if (d.I.id + 1 !== u.naka || Math.abs(u.pos.y - d.y) > 1.2) continue;
    const dist = Math.hypot(d.x - u.pos.x, d.z - u.pos.z);
    if (dist < bd) { bd = dist; pick = d; }
  }
  return pick;
}

let autoT = 0;
// 毎コマ（naka.js の nakaTick の終わり）。flagged：中にいる兵
export function nakaDoorTick(rt, dt, flagged) {
  if (!DOORS.length) return;
  if (rt.addInteract && !rt._nakaDoors) {
    rt._nakaDoors = true;
    rt.addInteract('naka_to', () => { const d = nearest(rt); return d && !(d.want && rt.def.doorCloseOK?.(rt) === false) ? { x: d.x, z: d.z } : null; }, '開ける', () => {
      const d = nearest(rt); if (d) setWant(rt, d, d.want ? 0 : 1);
    }, { r: 1.5, prio: -3 });
    const it = rt.interacts[rt.interacts.length - 1];
    Object.defineProperty(it, 'label', { get: () => (nearest(rt) && nearest(rt).want ? '閉める' : '開ける'), configurable: true });
  }
  // 中の兵は戸口へ来たら自分で開ける。遊び手も閉じた戸へ押し続けると開く
  autoT -= dt;
  if (autoT <= 0) {
    autoT = .2;
    const u = rt.player && rt.player.u;
    if (u && u.alive && (rt.player.blockedWalkT || 0) >= .5) {
      const d = nearest(rt);
      if (d && !d.want && Math.hypot(d.x - u.pos.x, d.z - u.pos.z) < 1.1) setWant(rt, d, 1);
    }
    for (const o of flagged) {
      if (o.isPlayer || !o.alive || !o.naka) continue;
      const I = DOORS.find((d) => d.I.id + 1 === o.naka)?.I;
      if (!I || !I.doors) continue;
      for (const d of I.doors) if (!d.want && Math.hypot(d.x - o.pos.x, d.z - o.pos.z) < 1.2 && Math.abs(o.pos.y - d.y) < 1.2) setWant(rt, d, 1);
    }
  }
  for (const d of moving) {
    d.open = Math.max(0, Math.min(1, d.open + (d.want ? 1 : -1) * dt * 2.6));
    pose(d);
    if (d.open !== d.want) continue;
    if (!d.want) {
      // 閉め切った時に戸口に人が立っていれば、開けたままにして待つ
      const u = rt.player && rt.player.u;
      if ((u && inDoorway(d, u)) || flagged.some((o) => o.alive && o.naka === d.I.id + 1 && inDoorway(d, o))) { d.open = .02; continue; }
      if (d.saved) Object.assign(d.solid, d.saved);
    }
    moving.delete(d);
  }
}
