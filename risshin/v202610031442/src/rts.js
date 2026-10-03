// RTS の上空視点（rts.js）：docs/siege-plan.md 3・4・6章 S3。
// 三人称 ⇄ 上空を切り替える（Tab・main.js の入口）。上空の間は自分の武将は「待て」のまま、
// 隊（本物の兵の Group と、遠くの軽い大軍）を指で／マウスで選び、地面か敵を押して下知する。
// 下知そのものは gunbai.js の orderReal・orderArmy（信長の軍配と同じ仕組み）をそのまま使う。まだ
// 部隊（butai.js）の無い戦では、今の Group・軽い大軍を一つずつ「部隊」として扱う（gunbai.js の collect と同じ集め方）。
//
// 携帯の指の操作の仕上げ（釦の札・小地図・構えの開き）は F5（touch.js・hud.js）。ここは rts.js だけの持ち場として、
// 一本指で動かす・二本指で寄る・回す・傾ける・押して選ぶ・長押しで引いて囲む、の土台を自分で持つ（touch.js には触らない）。
import * as THREE from 'three';
import { collect, orderReal, orderArmy } from './gunbai.js';

const PITCH_MIN = 0.32, PITCH_MAX = 1.42;
const DIST_MIN = 28, DIST_MAX = 190;
const BLEND_SEC = 0.6;

const _v3 = new THREE.Vector3();
const _ray = new THREE.Raycaster();
const _plane = new THREE.Plane();
const _hit = new THREE.Vector3();

function groundY(b, x, z) {
  return (b.world && b.world.heightAt) ? b.world.heightAt(x, z) : 0;
}

// ---------------- 状態 ----------------
function stateOf(b) {
  if (!b._rts) {
    b._rts = {
      on: false, blend: 0, cx: 0, cz: 0, yaw: 0, pitch: 0.95, dist: 74,
      sel: new Set(), ptrs: new Map(), gesture: null,
    };
  }
  return b._rts;
}

// C6：城攻めの「寄せ」【城68】。城の全体→攻め手→城門→守り→自分、の順で短く見せてから元のカメラへ戻す。
// gungi.js の開始（軍議 → 攻め始め）から呼ぶ。b_takato_siege.js（C7）などは、門を破った時・本丸に
// 入った時にも同じ形で一つの場面（shots が一つの配列）を渡して使える。呼び終えたら player.updateCamera が
// 次のコマで自分の三人称に描き直すので、ここでは元へ戻す処理を持たない。
// shots：[{ at:{x,z}, dist, pitch, sec, y? }, …]。at を見つめる姿勢で dist・pitch を保ち、sec 秒とどまる
export function siegeCinema(game, battle, shots, done) {
  const list = (shots || []).filter(Boolean);
  const cam = game.camera;
  let idx = 0, t = 0, stopped = false, raf = 0, last = performance.now();
  function place(s, yaw) {
    const y = s.y != null ? s.y : groundY(battle, s.at.x, s.at.z);
    const cp = Math.cos(s.pitch);
    cam.position.set(
      s.at.x - Math.sin(yaw) * s.dist * cp,
      y + s.dist * Math.sin(s.pitch) + 7,
      s.at.z - Math.cos(yaw) * s.dist * cp,
    );
    cam.lookAt(s.at.x, y + 2, s.at.z);
  }
  function finish() { if (stopped) return; stopped = true; cancelAnimationFrame(raf); if (done) done(); }
  function tick(now) {
    if (stopped) return;
    if (!list.length) { finish(); return; }
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const s = list[idx];
    t += dt;
    place(s, 0.35 + t * 0.05);   // わずかに回しながら留まる（止め絵にしない）
    if (t >= (s.sec || 1)) { idx++; t = 0; if (idx >= list.length) { finish(); return; } }
    raf = requestAnimationFrame(tick);
  }
  raf = requestAnimationFrame(tick);
  // cancel：done を呼ばずに止める（軍議の途中で題へ戻る・やり直す時）
  return { skip: finish, cancel() { stopped = true; cancelAnimationFrame(raf); } };
}

export function rtsAvailable(b) {
  return !!(b && !b.over && (b.lord || (b.def && b.def.rts)));
}
export function isRtsOn(b) {
  return !!(b && b._rts && b._rts.on);
}

// カメラの引き渡し：player.updateCamera を一度だけ包み、開いている間・切り替えの0.6秒は
// 上空の姿勢を混ぜる。閉じたら元の三人称へそのまま任せる
function installCameraHook(b) {
  if (b.player._rtsOrig) return;
  const orig = b.player._rtsOrig = b.player.updateCamera.bind(b.player);
  const origPos = new THREE.Vector3(), origQuat = new THREE.Quaternion();
  const rtsPos = new THREE.Vector3(), rtsQuat = new THREE.Quaternion();
  b.player.updateCamera = (dt, camera) => {
    const R = b._rts;
    if (!R) { orig(dt, camera); return; }
    const target = R.on ? 1 : 0;
    R.blend += (target - R.blend) * Math.min(1, dt / BLEND_SEC * 3);
    if (R.blend < 0.0015 && !R.on) { R.blend = 0; orig(dt, camera); return; }
    orig(dt, camera);
    if (R.blend <= 0.0015) return;
    origPos.copy(camera.position); origQuat.copy(camera.quaternion);
    poseRts(b, R, camera);
    rtsPos.copy(camera.position); rtsQuat.copy(camera.quaternion);
    camera.position.lerpVectors(origPos, rtsPos, R.blend);
    camera.quaternion.copy(origQuat).slerp(rtsQuat, R.blend);
  };
}
function poseRts(b, R, camera) {
  const gy = groundY(b, R.cx, R.cz);
  const cp = Math.cos(R.pitch);
  const ex = R.cx - Math.sin(R.yaw) * R.dist * cp;
  const ez = R.cz - Math.cos(R.yaw) * R.dist * cp;
  const ey = gy + R.dist * Math.sin(R.pitch) + 11;
  camera.position.set(ex, ey, ez);
  camera.lookAt(R.cx, gy + 2, R.cz);
}

export function toggleRts(b, on) {
  if (!b) return false;
  installCameraHook(b);
  const R = stateOf(b);
  const want = on == null ? !R.on : !!on;
  if (want && !R.on) {
    const P = b.player.u.pos;
    R.cx = P.x; R.cz = P.z; R.yaw = b.player.yaw || 0;
    R.sel.clear();
    if (b.bark) b.bark('上空から指図する（もう一度で戻る）');
  } else if (!want && R.on) {
    hideBox();
    R.gesture = null; R.ptrs.clear();
  }
  R.on = want;
  return R.on;
}

// ---------------- 選んだ隊へ下知 ----------------
function isRealGroup(o) { return !!o && !!o.units; }
// 足軽の身では上空で動かせるのは自分の組と「預かった一手」（g.entrusted）だけ（軍配 M.own と同じ決まり、docs/siege-plan.md 7-1）。
// 信長・信忠で遊ぶ時（b.lord）は全部の部隊を動かせる
export function rtsCanCommand(b, o) {
  if (!b) return false;
  if (b.lord) return true;
  if (isRealGroup(o)) return !!(o.isPlayerSquad || o.entrusted);
  return false; // 遠くの軽い大軍は、身分が無いと動かせない
}
function orderSelected(b, R, id, arg) {
  for (const o of R.sel) {
    if (!rtsCanCommand(b, o)) continue;
    if (isRealGroup(o)) { if (o.count) orderReal(b, o, id, arg); }
    else orderArmy(b, o, id, arg);
  }
}

// ---------------- 画面座標 ⇄ 世界 ----------------
function projectEntry(camera, rect, e, gy) {
  _v3.set(e.x, gy + 1.5, e.z).project(camera);
  if (_v3.z > 1 || _v3.z < -1) return null;
  return { x: (_v3.x * 0.5 + 0.5) * rect.width, y: (-_v3.y * 0.5 + 0.5) * rect.height };
}
function pickEntry(b, camera, rect, sx, sy) {
  let best = null, bd = Infinity;
  for (const e of collect(b)) {
    const gy = groundY(b, e.x, e.z);
    const p = projectEntry(camera, rect, e, gy);
    if (!p) continue;
    const d = Math.hypot(p.x - sx, p.y - sy);
    const th = 30 + (e.r || 4) * 2;
    if (d < th && d < bd) { bd = d; best = e; }
  }
  return best;
}
function groundPoint(b, camera, R, sx, sy, rect) {
  const ndcX = (sx / rect.width) * 2 - 1, ndcY = -(sy / rect.height) * 2 + 1;
  _ray.setFromCamera({ x: ndcX, y: ndcY }, camera);
  let y = groundY(b, R.cx, R.cz);
  for (let i = 0; i < 3; i++) {
    _plane.setComponents(0, 1, 0, -y);
    if (!_ray.ray.intersectPlane(_plane, _hit)) return { x: R.cx, z: R.cz };
    y = groundY(b, _hit.x, _hit.z);
  }
  return { x: _hit.x, z: _hit.z };
}

function onTap(b, camera, R, rect, sx, sy, addSel) {
  const hit = pickEntry(b, camera, rect, sx, sy);
  // 釦で「進め」「攻めよ」を選んだ後（R.pick）は、選んだ隊を押し直さず、地図か敵を指すだけにする
  if (!R.pick && hit && hit.team === 0) {
    if (!addSel) R.sel.clear();
    R.sel.add(hit.o);
    return;
  }
  if (!R.sel.size) return;
  if (R.pick === 'move') { orderSelected(b, R, 'move', { pt: groundPoint(b, camera, R, sx, sy, rect) }); R.pick = null; return; }
  if (R.pick === 'attack') {
    if (hit && hit.team === 1) { orderSelected(b, R, 'attack', { tgt: { real: hit.real, o: hit.o } }); R.pick = null; }
    else if (b.bark) b.bark('敵の隊を押す');
    return;
  }
  if (hit && hit.team === 1) orderSelected(b, R, 'attack', { tgt: { real: hit.real, o: hit.o } });
  else orderSelected(b, R, 'move', { pt: groundPoint(b, camera, R, sx, sy, rect) });
}

// ---------------- 引いて囲む（長押し） ----------------
let boxEl = null;
function showBox() {
  if (!boxEl) {
    boxEl = document.createElement('div');
    boxEl.style.cssText = 'position:fixed;z-index:25;border:2px solid rgba(236,228,210,.9);background:rgba(236,228,210,.12);pointer-events:none;';
    document.body.appendChild(boxEl);
  }
  boxEl.hidden = false;
}
function updateBox(a, c) {
  if (!boxEl) return;
  const x0 = Math.min(a.x, c.x), y0 = Math.min(a.y, c.y);
  boxEl.style.left = `${x0}px`; boxEl.style.top = `${y0}px`;
  boxEl.style.width = `${Math.abs(c.x - a.x)}px`; boxEl.style.height = `${Math.abs(c.y - a.y)}px`;
}
function hideBox() { if (boxEl) boxEl.hidden = true; }
function finishBox(b, camera, R, rect, addSel) {
  const x0 = Math.min(R.boxStart.x, R.boxCur.x) - rect.left, x1 = Math.max(R.boxStart.x, R.boxCur.x) - rect.left;
  const y0 = Math.min(R.boxStart.y, R.boxCur.y) - rect.top, y1 = Math.max(R.boxStart.y, R.boxCur.y) - rect.top;
  if (!addSel) R.sel.clear();
  for (const e of collect(b)) {
    if (e.team !== 0) continue;
    const gy = groundY(b, e.x, e.z);
    const p = projectEntry(camera, rect, e, gy);
    if (!p) continue;
    if (p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1) R.sel.add(e.o);
  }
}

// ---------------- 入力（一度だけ付ける） ----------------
let inited = false;
export function initRtsInput(canvas, getBattle, getCamera) {
  if (inited) return;
  inited = true;

  const down = (e) => {
    const b = getBattle(); if (!b || !isRtsOn(b)) return;
    e.preventDefault(); e.stopImmediatePropagation();
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
    const R = stateOf(b);
    R.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (R.ptrs.size === 1) {
      R.gesture = 'pending'; R.pendT = performance.now();
      R.downX = e.clientX; R.downY = e.clientY; R.shift = e.shiftKey; R.btn = e.button;
    } else if (R.ptrs.size === 2) {
      const [p1, p2] = [...R.ptrs.values()];
      R.gesture = 'pinch';
      R.pinchD0 = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1;
      R.pinchA0 = Math.atan2(p2.y - p1.y, p2.x - p1.x);
      R.dist0 = R.dist; R.yaw0 = R.yaw; R.pitch0 = R.pitch; R.midY0 = (p1.y + p2.y) / 2;
    }
  };
  const move = (e) => {
    const b = getBattle(); if (!b || !isRtsOn(b)) return;
    const R = stateOf(b); if (!R.ptrs.has(e.pointerId)) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const prev = R.ptrs.get(e.pointerId);
    R.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (R.gesture === 'pinch' && R.ptrs.size === 2) {
      const [p1, p2] = [...R.ptrs.values()];
      const d = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1;
      const ang = Math.atan2(p2.y - p1.y, p2.x - p1.x);
      R.dist = Math.max(DIST_MIN, Math.min(DIST_MAX, R.dist0 * (R.pinchD0 / d)));
      R.yaw = R.yaw0 - (ang - R.pinchA0);
      const midY = (p1.y + p2.y) / 2;
      R.pitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, R.pitch0 - (midY - R.midY0) * 0.0035));
      return;
    }
    if (R.ptrs.size !== 1) return;
    const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
    if (R.gesture === 'pending') {
      const moved = Math.hypot(e.clientX - R.downX, e.clientY - R.downY);
      if (moved > 8) R.gesture = (R.btn === 2 || R.shift) ? 'orbit' : 'pan';
      else if (performance.now() - R.pendT > 320) { R.gesture = 'box'; R.boxStart = { x: R.downX, y: R.downY }; showBox(); }
      else return;
    }
    if (R.gesture === 'pan') {
      const right = { x: Math.cos(R.yaw), z: -Math.sin(R.yaw) };
      const fwd = { x: Math.sin(R.yaw), z: Math.cos(R.yaw) };
      const k = R.dist * 0.0018;
      R.cx -= (dx * right.x - dy * fwd.x) * k;
      R.cz -= (dx * right.z - dy * fwd.z) * k;
    } else if (R.gesture === 'orbit') {
      R.yaw -= dx * 0.006;
      R.pitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, R.pitch + dy * 0.004));
    } else if (R.gesture === 'box') {
      R.boxCur = { x: e.clientX, y: e.clientY };
      updateBox(R.boxStart, R.boxCur);
    }
  };
  const up = (e) => {
    const b = getBattle(); if (!b || !isRtsOn(b)) return;
    const R = stateOf(b); if (!R.ptrs.has(e.pointerId)) return;
    e.preventDefault(); e.stopImmediatePropagation();
    R.ptrs.delete(e.pointerId);
    const camera = getCamera();
    const rect = canvas.getBoundingClientRect();
    const add = R.shift || R.multi;
    if (R.gesture === 'pending') onTap(b, camera, R, rect, e.clientX - rect.left, e.clientY - rect.top, add);
    else if (R.gesture === 'box') { finishBox(b, camera, R, rect, add); hideBox(); }
    if (R.ptrs.size === 0) R.gesture = null;
    else if (R.ptrs.size === 1) {
      const [only] = [...R.ptrs.values()];
      R.gesture = 'pending'; R.pendT = performance.now(); R.downX = only.x; R.downY = only.y;
    }
  };
  const wheel = (e) => {
    const b = getBattle(); if (!b || !isRtsOn(b)) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const R = stateOf(b);
    R.dist = Math.max(DIST_MIN, Math.min(DIST_MAX, R.dist + e.deltaY * 0.06));
  };
  canvas.addEventListener('pointerdown', down, true);
  canvas.addEventListener('pointermove', move, true);
  canvas.addEventListener('pointerup', up, true);
  canvas.addEventListener('pointercancel', up, true);
  canvas.addEventListener('wheel', wheel, { capture: true, passive: false });
  canvas.addEventListener('contextmenu', (e) => { const b = getBattle(); if (b && isRtsOn(b)) e.preventDefault(); }, true);
}

// 確かめ（snap.mjs）向け：選んだ隊へ直に下知する
export function rtsDebugOrder(b, id, arg) { orderSelected(b, stateOf(b), id, arg); }
export function rtsSelection(b) { return [...stateOf(b).sel]; }
export function rtsSelectAll(b, team = 0) { const R = stateOf(b); R.sel.clear(); for (const e of collect(b)) if (e.team === team) R.sel.add(e.o); return R.sel.size; }
export function rtsCollect(b) { return collect(b); }

// ---------------- F5：hud.js の釦（選んだ隊の札・下知の釦・構え）から使う ----------------
// 「進め」「攻めよ」を釦で選んだ後は、次に地図か敵を指すまで待つ（R.pick）
export function rtsSetPick(b, mode) { const R = stateOf(b); R.pick = mode; }
export function rtsPick(b) { return b && b._rts ? b._rts.pick : null; }
// 「複数」釦：押している間、隊を押すたびに選びへ足していく（携帯では Shift が無いため）
export function rtsSetMulti(b, on) { stateOf(b).multi = !!on; }
export function rtsMultiOn(b) { return !!(b && b._rts && b._rts.multi); }
// 選んだ隊へ、釦から直に下知（待て・退け・撃て・構え）
export function rtsOrder(b, id, arg) { rtsSetPick(b, null); orderSelected(b, stateOf(b), id, arg); }

// ---------------- 地形の読み（M4）：小地図・俯瞰（hud.js drawMap）が出す尾根・谷・分かれ道・伏兵注意 ----------------
// 道（world.def.paths）の周りだけ、粗い格子で峰（周りより高い）と谷（周りより低い）を拾う。
// 分かれ道は道の点が近くに三つ以上集まる所、伏兵に気を付ける所は道のそばの谷筋。
// 戦の間は一度作って使い回す（rt._terrainHints）。道の無い戦（平らな野戦）は空を返す。
export function terrainHints(b) {
  if (!b || !b.world || typeof b.world.heightAt !== 'function') return null;
  if (b._terrainHints) return b._terrainHints;
  const empty = { ridge: [], valley: [], branch: [], ambush: [] };
  const paths = (b.world.def && b.world.def.paths) || [];
  const pts = [];
  for (const p of paths) for (const pt of p) pts.push({ x: pt[0], z: pt[1] });
  if (!pts.length) return (b._terrainHints = empty);
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const { x, z } of pts) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; }
  const pad = 14; x0 -= pad; x1 += pad; z0 -= pad; z1 += pad;
  // 格子は 300 点ほどに抑える（山一つぶんの範囲でも軽い）
  const area = Math.max(1, (x1 - x0) * (z1 - z0));
  const STEP = Math.max(9, Math.sqrt(area / 300));
  const h = (x, z) => b.world.heightAt(x, z);
  const ridge = [], valley = [];
  for (let x = x0; x <= x1; x += STEP) for (let z = z0; z <= z1; z += STEP) {
    const c = h(x, z);
    const n = [h(x - STEP, z), h(x + STEP, z), h(x, z - STEP), h(x, z + STEP)];
    if (n.every((v) => v < c - 0.4)) ridge.push({ x, z });
    else if (n.every((v) => v > c + 0.4)) valley.push({ x, z });
  }
  const branch = [];
  for (const p of pts) {
    if (branch.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < 10)) continue;
    let n = 0; for (const q of pts) if (Math.hypot(q.x - p.x, q.z - p.z) < 8) n++;
    if (n >= 3) branch.push(p);
  }
  const ambush = valley.filter((v) => pts.some((p) => Math.hypot(p.x - v.x, p.z - v.z) < 12));
  return (b._terrainHints = { ridge, valley, branch, ambush });
}
