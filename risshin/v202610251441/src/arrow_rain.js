// 矢の雨：弓組の一斉射ちで、数十本の矢が高く上がり、上からばらけて降る（kaito 10/14）
// 飛ぶ矢も刺さった矢も InstancedMesh 一つずつ。降る前に地面へ暗い影が濃くなり、上を見れば黒い群れが見える。
// 下にいる者には敵味方とも当たる（痛手と怯み。盾・甲冑で防ぐ。重なると危ない）。兵への当たりは一度の雨で八人まで。
import * as THREE from 'three';
import { arrowGeometry, MAT } from './units_model.js';
import { projectileCover, projectileGroundHeight } from './projectile_cover.js';
import { localClear } from './army_local_way.js';

const FLY_MAX = 240, STUCK_MAX = 360, G = 9.8;
const Z = new THREE.Vector3(0, 0, 1), _d = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
let SHADOW_TEX = null, SHADOW_GEO = null;
function shadowTex() {
  if (SHADOW_TEX) return SHADOW_TEX;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.6, 'rgba(0,0,0,0.6)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  SHADOW_TEX = new THREE.CanvasTexture(c);
  return SHADOW_TEX;
}

// 危険な側だけを縞で囲み、外周の太い破線で安全な外側と区別する。
// 中央は空けたまま、五組で形と材質を使い回す。
function dangerGeometry() {
  const vertices = [], colors = [];
  const dark = new THREE.Color(0x14120f), light = new THREE.Color(0xfff3ba);
  const band = (a, b, inner, outer, color, skew = 0) => {
    const ax = Math.sin(a) * inner, az = Math.cos(a) * inner;
    const bx = Math.sin(a + skew) * outer, bz = Math.cos(a + skew) * outer;
    const cx = Math.sin(b + skew) * outer, cz = Math.cos(b + skew) * outer;
    const dx = Math.sin(b) * inner, dz = Math.cos(b) * inner;
    vertices.push(ax, 0, az, bx, 0, bz, cx, 0, cz, ax, 0, az, cx, 0, cz, dx, 0, dz);
    for (let i = 0; i < 6; i++) colors.push(color.r, color.g, color.b);
  };
  for (let i = 0; i < 96; i++) {
    const a = i * Math.PI / 48, b = (i + 1) * Math.PI / 48;
    band(a, b, .85, .93, i % 2 ? light : dark, .035);
    if (i % 6 < 4) {
      band(a, b, .94, .955, dark);
      band(a, b, .985, 1, dark);
      band(a, b, .955, .985, light);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return geo;
}

function drapeCue(army, mesh, x, z, radius, angle = 0) {
  const pos = mesh.geometry.attributes.position, flat = mesh.userData.flat;
  const sin = Math.sin(angle), cos = Math.cos(angle);
  for (let i = 0; i < pos.count; i++) {
    const a = flat[i * 3] * radius, b = flat[i * 3 + 2] * radius;
    const wx = x + a * cos + b * sin, wz = z - a * sin + b * cos;
    pos.setXYZ(i, wx, army.world.heightAt(wx, wz) + .16, wz);
  }
  pos.needsUpdate = true;
}

function state(army) {
  if (army._rain) return army._rain;
  const fly = new THREE.InstancedMesh(arrowGeometry(), MAT, FLY_MAX);
  fly.count = 0; fly.frustumCulled = false; fly.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const stuck = new THREE.InstancedMesh(arrowGeometry(), MAT, STUCK_MAX);
  stuck.count = 0; stuck.frustumCulled = false;
  // 矢の本体だけを描く。空や兵に重なる拡大した黒い棒は足さない。
  const natural = !!army.world.def.naturalArrowRain;
  // 落ちる所の点々（一本ごとの落ちる先に、降るにつれ濃く大きくなる黒い点）
  if (!SHADOW_GEO) { SHADOW_GEO = new THREE.PlaneGeometry(1, 1); SHADOW_GEO.rotateX(-Math.PI / 2); }
  const dots = new THREE.InstancedMesh(SHADOW_GEO, new THREE.MeshBasicMaterial({ map: shadowTex(), color: 0x000000, transparent: true, opacity: natural ? 0.2 : 0.75, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }), FLY_MAX);
  dots.count = 0; dots.frustumCulled = false; dots.instanceMatrix.setUsage(THREE.DynamicDrawUsage); dots.renderOrder = 2;
  army.scene.add(fly); army.scene.add(stuck); army.scene.add(dots);
  // 斜面の縞が地面に埋もれないようにする。兵との前後関係は保つ。
  const cueMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, depthTest: true, depthWrite: false, fog: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4 });
  const ringGeo = dangerGeometry();
  const rings = Array.from({ length: 5 }, () => {
    const mesh = new THREE.Mesh(ringGeo.clone(), cueMat);
    mesh.userData.flat = ringGeo.attributes.position.array;
    mesh.frustumCulled = false; mesh.visible = false; mesh.renderOrder = 3; army.scene.add(mesh); return mesh;
  });
  ringGeo.dispose();
  // 同時に降る五組分を支度する。斉射のたびに影の形・材質を作って捨てない。
  const shadows = Array.from({ length: 5 }, () => {
    const mat = new THREE.MeshBasicMaterial({ map: shadowTex(), color: 0x000000, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    const mesh = new THREE.Mesh(SHADOW_GEO, mat);
    mesh.visible = false; mesh.renderOrder = 2; army.scene.add(mesh); return mesh;
  });
  return (army._rain = { fly, stuck, dots, rings, shadows, shadowPool: shadows.slice(), cueAt: 0, list: [], stuckN: 0, volleys: [] });
}

// 空の束も場面へ置き、開戦前の絵の組み立てに含める。矢も危険の印もまだ出さない。
export function prepareRain(army) {
  if (!army.world.def.noArrowRain) state(army);
}

export function disposeRain(army) {
  const R = army._rain;
  if (!R) return;
  for (const mesh of [R.fly, R.stuck, R.dots, ...R.rings, ...R.shadows]) {
    mesh.removeFromParent();
    mesh.dispose?.();
  }
  R.dots.material.dispose();
  for (const ring of R.rings) ring.geometry.dispose();
  R.rings[0].material.dispose();
  for (const shadow of R.shadows) shadow.material.dispose();
  // 矢の形・材質と影の画像・平面は戦をまたいで共有する。
  army._rain = null; army.rainEscape = null;
}

// 指定した戦では、本人に当たらない味方の斉射で持ち場を離れさせない。
// 矢の本体と被害の判定は変えず、ほかの戦の案内も従来どおりにする。
function rainWarnsPlayer(army, volley) {
  return !army.world.def.enemyArrowWarnings || volley.team !== army.playerUnit?.team;
}

// 案内だけで使う危険判定。
export function rainDanger(army) {
  const p = army.playerUnit;
  if (!p?.alive || army.aftermath || !army._rain) return false;
  for (const v of army._rain.volleys) {
    if (!rainWarnsPlayer(army, v)) continue;
    if (v.t < v.T + .6 && Math.hypot(p.pos.x - v.x, p.pos.z - v.z) < v.r + 4) return true;
  }
  return false;
}

// 安全性は通常の逃げ先と同じ。見える候補がなければ元の退路を残す。
export function visibleRainEscape(army, visible) {
  if (!army._rain || !army.rainEscape) return;
  const fallback = army.rainEscape;
  rainGuide(army, army._rain, visible);
  if (!army.rainEscape) army.rainEscape = fallback;
}

// 落下範囲の外まで歩ける道を探す。重なった斉射・川・塀へは案内しない。
function rainGuide(army, R, visible = null) {
  const P = army.playerUnit, C = P?.pos;
  army.rainEscape = null;
  for (let i = 0; i < R.rings.length; i++) {
    const V = R.volleys[i], ring = R.rings[i];
    ring.visible = army.world.def.arrowRainGroundCue !== false && !!V && rainWarnsPlayer(army, V) && V.t < V.T + 0.6;
    if (ring.visible && ring.userData.volley !== V) {
      drapeCue(army, ring, V.x, V.z, V.r + 1, Math.PI / 4); ring.userData.volley = V;
    }
  }
  if (!C || !P.alive || army.aftermath) { for (const ring of R.rings) ring.visible = false; return; }
  // 警告が出るふちの外側にも、同じ安全な逃げ先を示す。当たりは変えない。
  const danger = rainDanger(army);
  if (!danger) return;
  let best = Infinity, bestX = 0, bestZ = 0;
  const point = R.testPoint || (R.testPoint = { x: 0, y: 0, z: 0 });
  const edge = R.escapeEdge || (R.escapeEdge = { x: 0, y: 0, z: 0 });
  const allowed = army.hooks.rainEscapePointAllowed;
  const safe = (x, z, y) => {
    point.x = x; point.y = y; point.z = z;
    if (allowed && !allowed(point)) return false;
    if (!localClear(army, C, point) || Math.abs(y - C.y) > .6) return false;
    // 輪の中心だけでなく周囲の足場も空け、家の壁や崖へ輪を貼らない。
    for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4;
      edge.x = x + Math.cos(angle) * 1.65; edge.z = z + Math.sin(angle) * 1.65;
      edge.y = army.world.heightAt(edge.x, edge.z);
      if (allowed && !allowed(edge)) return false;
      if (Math.abs(edge.y - y) > .3 || !localClear(army, point, edge)) return false;
    }
    // 岸の曲がりで、乾いた終点までの近道が川を横切らないようにする。
    if (allowed) {
      const steps = Math.max(1, Math.ceil(Math.hypot(x - C.x, z - C.z)));
      for (let i = 1; i < steps; i++) {
        edge.x = C.x + (x - C.x) * i / steps; edge.z = C.z + (z - C.z) * i / steps;
        edge.y = army.world.heightAt(edge.x, edge.z);
        if (!allowed(edge)) return false;
      }
    }
    if (R.volleys.some(V => rainWarnsPlayer(army, V) && V.t < V.T + .6 && Math.hypot(x - V.x, z - V.z) < V.r + 3.8)) return false;
    for (const u of army.units) {
      if (u === P || !u.alive || u.gone || u.isStruct) continue;
      if (Math.abs(u.pos.y - y) < 3 && Math.hypot(x - u.pos.x, z - u.pos.z) < (u.mounted || u.type === 'cavalry' ? 4 : 3)) return false;
    }
    return true;
  };
  // 安全な間は同じ輪を保ち、歩くたびに逃げ先を遠ざけない。
  const previous = R.cue;
  if (previous && Number.isFinite(previous.posX) && safe(previous.posX, previous.posZ, army.world.heightAt(previous.posX, previous.posZ)) && (!visible || visible(point))) {
    const dx = previous.posX - C.x, dz = previous.posZ - C.z, distance = Math.hypot(dx, dz);
    previous.x = dx / (distance || 1); previous.z = dz / (distance || 1); previous.distance = distance;
    army.rainEscape = previous; return;
  }
  for (let i = 0; i < 24; i++) {
    const dx = Math.sin(i * Math.PI / 12), dz = Math.cos(i * Math.PI / 12);
    for (let d = 2; d <= 36; d += 2) {
      if (d >= best) break;
      const x = C.x + dx * d, z = C.z + dz * d, y = army.world.heightAt(x, z);
      point.x = x; point.y = y; point.z = z;
      if (!army.world.walkable(x, z, y) || Math.abs(y - C.y) > d * 0.5 || army.wallBetween(C, -1, point)) break;
      if (d < 5 || !safe(x, z, y) || visible && !visible(point)) continue;
      if (d < best) { best = d; bestX = dx; bestZ = dz; }
      break;
    }
  }
  if (best === Infinity) return;
  const cue = R.cue || (R.cue = { x: 0, z: 0 }); cue.x = bestX; cue.z = bestZ; cue.distance = best; cue.posX = C.x + bestX * best; cue.posZ = C.z + bestZ * best; army.rainEscape = cue;
}

// 一斉射ち一度に一つの雨。from は射た組、to は落ちる所の真ん中、d は届く距離
export function rainVolley(army, g, u, to, d) {
  const P = army.playerUnit;
  // 本人の近く（または見える所）でだけ降らせる。遠い戦の矢の雨は本物の矢だけで足りる。
  if (!P || army.world.def.noArrowRain || Math.hypot(to.x - P.pos.x, to.z - P.pos.z) > 70 && !(u.camD < 60)) return;
  const R = state(army);
  if (R.volleys.length > 4) return;
  const bows = [];
  for (const o of g.units || []) if (o.alive && !o.gone && o.type === 'bow') bows.push(o);
  if (!bows.length) bows.push(u);
  // 降る矢は射手の数に合わせる（一人一本。数人の弓から何十本も降らせない。kaito 10/22）。多く見せたい戦だけ arrowRainPerBow で増やす。
  const perBow = army.world.def.arrowRainPerBow ?? 1;
  const count = Math.max(1, Math.round(bows.length * perBow));
  const n = Math.min(FLY_MAX - R.list.length, 80, count);
  if (n < 1) return;
  const spread = 3.5 + d * 0.06;
  const th = 1.0;   // 射上げ 57 度ほど
  const T0 = 2 * Math.sqrt(G * Math.max(8, d) / Math.sin(2 * th)) * Math.sin(th) / G;
  const V = { x: to.x, z: to.z, y: to.y, r: spread, t: 0, T: T0, team: u.team, owner: u, sounded: false, ducked: false, warned: false, shadow: null, hits: 0 };
  // 地面の影（降る所に、だんだん濃くなる）
  const sh = R.shadowPool.pop();
  sh.visible = army.world.def.arrowRainAreaShadow !== false; sh.material.opacity = 0;
  sh.scale.set(spread * 2.4, 1, spread * 2.4); sh.position.set(to.x, army.world.heightAt(to.x, to.z) + 0.15, to.z); sh.renderOrder = 2;
  V.shadow = sh;
  R.volleys.push(V);
  R.cueAt = 0; // 警告を出した最初の更新で逃げ先も探す。
  for (let i = 0; i < n; i++) {
    const b = bows[(Math.random() * bows.length) | 0];
    const sx = b.pos.x + (Math.random() - 0.5) * 1.2, sz = b.pos.z + (Math.random() - 0.5) * 1.2, sy = b.pos.y + 1.5;
    const a = Math.random() * Math.PI * 2, rr = spread * Math.sqrt(Math.random());
    const lx = to.x + Math.cos(a) * rr, lz = to.z + Math.sin(a) * rr, ly = army.world.heightAt(lx, lz);
    const T = T0 * (0.92 + Math.random() * 0.16), delay = Math.random() * 0.35;
    R.list.push({ x: sx, y: sy, z: sz, vx: (lx - sx) / T, vy: (ly - sy + 0.5 * G * T * T) / T, vz: (lz - sz) / T, delay, V, lx, ly, lz, T, t: 0 });
  }
  // 放った時の「ブワッ」（数十の弦と矢羽が一度に空を切る）
  army.playFar('arrowLaunch', u.pos, 1.3);
  army.hooks.onArrowRain?.(V, Math.hypot(to.x - P.pos.x, to.z - P.pos.z) < spread + 4);
}

// 落ちる矢が兵の体の筒（上から入る）に入ったか。射た側の者・本人は除く（本人は別に見る）
function rainHit(army, a) {
  const V = a.V;
  if (V.hits >= 8) return null;
  let hit = null;
  army.forNear(a.x, a.z, 0.7, (o) => {
    if (hit || !o.alive || o.gone || o.isStruct || o.isPlayer || o === V.owner) return;
    if (o.team === V.team && !army.world.def.friendlyProjectiles) return;
    const rr = o.mounted ? 0.55 : o.bodyRadius || 0.3;
    if (Math.hypot(o.pos.x - a.x, o.pos.z - a.z) < rr && a.y > o.pos.y && a.y < o.pos.y + (o.mounted ? 2.6 : 1.7)) hit = o;
  });
  return hit;
}

function stick(army, R, a) {
  const i = R.stuckN++ % STUCK_MAX;
  _d.set(a.vx, a.vy, a.vz).normalize();
  _q.setFromUnitVectors(Z, _d);
  _p.set(a.x + _d.x * 0.22, a.y + _d.y * 0.22, a.z + _d.z * 0.22);
  _m.compose(_p, _q, _s);
  R.stuck.setMatrixAt(i, _m);
  R.stuck.count = Math.min(STUCK_MAX, R.stuckN);
  R.stuck.instanceMatrix.needsUpdate = true;
}

export function updateRain(army, dt) {
  const R = army._rain;
  if (!R) return;
  const P = army.playerUnit, def = army.world.def;
  R.cueAt -= dt;
  if (R.cueAt <= 0) { R.cueAt = 0.25; rainGuide(army, R); }
  for (let i = R.volleys.length - 1; i >= 0; i--) {
    const V = R.volleys[i];
    V.t += dt;
    const k = Math.min(1, V.t / V.T);
    V.shadow.material.opacity = (def.naturalArrowRain ? 0.18 : 0.8) * k * k * (V.t > V.T + 0.5 ? Math.max(0, 1 - (V.t - V.T - 0.5) * 2) : 1);
    // 落ちる一秒前：空を切る音と、下の者のすくみ
    if (!V.sounded && V.t > V.T - 1.1) {
      V.sounded = true;
      army.play('arrowRain', V, 1.2);
      army.forNear(V.x, V.z, V.r + 2, (o) => { if (o.alive && o.team !== V.team && !o.isPlayer && !o.mounted && !o.atk && !o.swing) o.duckT = army.time + 1 + Math.random() * 0.8; });
    }
    if (V.t > V.T + 1.2) { V.shadow.visible = false; R.shadowPool.push(V.shadow); R.volleys.splice(i, 1); }
  }
  let n = 0;
  const top = P ? P.pos.y + (P.mounted ? 2.6 : 1.75) : 0;
  for (let i = 0; i < R.list.length; i++) {
    const a = R.list[i];
    if (a.delay > 0) a.delay -= dt;
    else {
    const px = a.x, py = a.y, pz = a.z;
    a.x += a.vx * dt; a.z += a.vz * dt; a.y += a.vy * dt - 4.9 * dt * dt; a.vy -= G * dt;
    let done = false, o2 = null;
    a.t += dt;
    if (a.vy < 0) {
      const gy = projectileGroundHeight(army.world, a.x, a.z);
      // 本人：体の筒（半径 0.35m）に上から入ったら当たる
      if (P && P.alive && a.V.team !== P.team && Math.abs(a.x - P.pos.x) < 0.6 && Math.abs(a.z - P.pos.z) < 0.6 && Math.hypot(a.x - P.pos.x, a.z - P.pos.z) < (P.mounted ? 0.55 : 0.35) && a.y < top && a.y > P.pos.y) {
        const o = a.V.owner;
        if (o) army.damage(P, (o.dmg || 9) * (o.group?.dmgMult ?? 1), o, { kind: 'arrow', y: a.y, incoming: _p.set(a.vx, a.vy, a.vz).clone() });
        army.play('thunk', P.pos, 0.5);
        done = true;
      } else if (a.y - gy < 2.4 && (o2 = rainHit(army, a))) {
        const o = a.V.owner, rec = { res: null };
        a.V.hits++;
        army.damage(o2, (o?.dmg || 9) * (o?.group?.dmgMult ?? 1), o || null, { kind: 'arrow', y: a.y, incoming: new THREE.Vector3(a.vx, a.vy, a.vz), out: rec });
        if (o2.camD < 40) army.play(rec.res === 'armor' ? 'kin' : 'thunk', o2.pos, 0.35);
        done = true;
      } else if (a.y - gy < 4) {
        // 盾・柵・家の屋根：落ちる最後の一筋だけ見る
        const c = projectileCover(army, px, py, pz, a.x, a.y, a.z, a.V.owner);
        if (c.q <= 1) {
          a.x = px + (a.x - px) * c.q; a.y = py + (a.y - py) * c.q; a.z = pz + (a.z - pz) * c.q;
          // 土への線判定でも、地面の矢を残さない指定を守る。木に当たった矢は従来どおり。
          if (!c.host && !c.object?.isStruct && (c.object || !def.noGroundArrows)) stick(army, R, a);
          done = true;
        } else if (a.y <= gy) {
          a.y = gy;
          if (!def.noGroundArrows) stick(army, R, a);
          done = true;
        }
      }
    }
    if (done) continue;
    }
    R.list[n++] = a;
    _d.set(a.vx, a.vy, a.vz).normalize();
    _q.setFromUnitVectors(Z, _d);
    _p.set(a.x, a.y, a.z);
    _m.compose(_p, _q, _s);
    R.fly.setMatrixAt(n - 1, _m);
    // 落ちる先の点：降るにつれ濃く（大きく）なる
    const k = Math.min(1, a.t / a.T), ds = def.naturalArrowRain ? 0.06 + 0.16 * k * k : 0.15 + 0.85 * k * k;
    _p.set(a.lx, a.ly + 0.12, a.lz); _q.identity(); _s.set(ds, 1, ds);
    _m.compose(_p, _q, _s); _s.set(1, 1, 1);
    R.dots.setMatrixAt(n - 1, _m);
  }
  R.list.length = n;
  R.fly.count = R.dots.count = n;
  R.fly.instanceMatrix.needsUpdate = true;
  R.dots.instanceMatrix.needsUpdate = true;
}
