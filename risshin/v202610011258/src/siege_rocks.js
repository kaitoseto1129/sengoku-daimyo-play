// ======================================================================
// 落石・丸太（siege_rocks.js）… docs/castle-design.md 7-1「登る最中の落石・丸太（山城）」
// 山城の七曲りの坂道で、上の守り手が石や丸太を転がして寄せ手を止める。
// makeRockTraps(rt, { posts }) を一つ呼べば、置き場ごとに「石じゃ！」の合図→帯の影→転がる→当たる、を回す。
// posts: [{ id, at:{x,z}（置き場）, lane:[[x,z],...]（上から下への道筋）, team（守りの側。既定1）,
//           active: () => bool（置き場がまだ生きているか）, stock（石の数。既定 6）, interval:[min,max] 秒 }]
// 同時に転がる石・丸太は、戦全体で 8 個まで（docs の数の上限）。竹束を抱えている者（u.tatake・rt.flags.carry の自分）は
// 前から来る分の 7 割を防ぐ（castle-design 7-3 と合わせる）。
// ======================================================================
import * as THREE from 'three';
import { inCoverOf } from './taketaba.js';

const MAX_ROLLING = 8;
let ROCK_GEO = null, LOG_GEO = null, ROCK_MAT = null, LOG_MAT = null;
function geoms() {
  if (!ROCK_GEO) {
    ROCK_GEO = new THREE.IcosahedronGeometry(0.46, 1);
    LOG_GEO = new THREE.CylinderGeometry(0.22, 0.24, 4, 7);
    LOG_GEO.rotateZ(Math.PI / 2);
    ROCK_MAT = new THREE.MeshStandardMaterial({ color: 0x6a6660, roughness: 1, flatShading: true });
    LOG_MAT = new THREE.MeshStandardMaterial({ color: 0x4a3a28, roughness: 0.95 });
  }
  return { ROCK_GEO, LOG_GEO, ROCK_MAT, LOG_MAT };
}

// 道筋 lane の長さ（累積距離の表）を作る
function laneTable(lane) {
  const d = [0];
  for (let i = 1; i < lane.length; i++) d.push(d[i - 1] + Math.hypot(lane[i][0] - lane[i - 1][0], lane[i][1] - lane[i - 1][1]));
  return d;
}
// 進んだ距離 s から、lane 上の座標を取る
function laneAt(lane, d, s) {
  if (s <= 0) return { x: lane[0][0], z: lane[0][1], seg: 0 };
  const total = d[d.length - 1];
  if (s >= total) return { x: lane[lane.length - 1][0], z: lane[lane.length - 1][1], seg: lane.length - 2, end: true };
  let i = 1;
  while (i < d.length && d[i] < s) i++;
  const t = (s - d[i - 1]) / Math.max(1e-6, d[i] - d[i - 1]);
  const a = lane[i - 1], b = lane[i];
  return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, seg: i - 1 };
}

export function makeRockTraps(rt, o) {
  const posts = (o.posts || []).map((p) => ({
    ...p, team: p.team ?? 1, stock: p.stock ?? 6, interval: p.interval || [20, 30], d: laneTable(p.lane), nextT: rt.t + 4 + Math.random() * 6, warnT: 0, warnMesh: null,
  }));
  const rolling = [];
  let lastShoutT = -99;

  function warn(post) {
    const { ROCK_GEO } = geoms();
    // 落ちる筋の帯（道の上の暗い帯。色だけに頼らず、縁を破線にする見た目は簡単な点線のドットで示す）
    const g = new THREE.Group();
    const w = 1.1;
    for (let i = 0; i < post.lane.length - 1; i++) {
      const [ax, az] = post.lane[i], [bx, bz] = post.lane[i + 1];
      const len = Math.hypot(bx - ax, bz - az) || 1e-6;
      const geo = new THREE.PlaneGeometry(w, len);
      geo.rotateX(-Math.PI / 2);
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x1a1612, transparent: true, opacity: 0.4, depthWrite: false }));
      mesh.position.set((ax + bx) / 2, rt.world.heightAt((ax + bx) / 2, (az + bz) / 2) + 0.05, (az + bz) / 2);
      mesh.rotation.y = Math.atan2(bx - ax, bz - az);
      g.add(mesh);
      if (i > 3) break;   // 帯は始めの区間だけで足りる（軽く）
    }
    rt.scene.add(g);
    return g;
  }

  function spawn(post) {
    if (rolling.length >= MAX_ROLLING || post.stock <= 0) return;
    post.stock--;
    const kind = Math.random() < 0.25 ? 'log' : 'rock';
    const { ROCK_GEO, LOG_GEO, ROCK_MAT, LOG_MAT } = geoms();
    const mesh = new THREE.Mesh(kind === 'log' ? LOG_GEO : ROCK_GEO, kind === 'log' ? LOG_MAT : ROCK_MAT);
    const p0 = post.lane[0];
    mesh.position.set(p0[0], rt.world.heightAt(p0[0], p0[1]) + 0.5, p0[1]);
    rt.scene.add(mesh);
    rolling.push({ post, mesh, kind, s: 0, speed: 3, hit: new Set(), t: 0 });
    if (rt.t - lastShoutT > 6) { lastShoutT = rt.t; rt.bark(kind === 'log' ? '丸太が来るぞ！　避けよ！' : '石じゃ！　気を付けよ！', true); }
    rt.army.play && rt.army.play('knock', { x: p0[0], z: p0[1] }, 0.7);
  }

  function hitDmg(kind) { return kind === 'log' ? 50 : 25 + Math.random() * 15; }
  // 竹束を抱えている者は、前から来る分の 7 割を防ぐ（castle-design 7-3）
  function guarded(u) {
    if (u.isPlayer) return !!(rt.flags && rt.flags.carry) || inCoverOf(rt, u.pos.x, u.pos.z, u.team);
    return !!u.tatake || inCoverOf(rt, u.pos.x, u.pos.z, u.team);
  }
  function strike(u, kind) {
    if (!u.alive) return;
    let dmg = hitDmg(kind);
    if (guarded(u)) dmg *= 0.3;
    u.hp -= dmg; u.lastHitT = rt.army.time;
    if (u.hp <= 0) rt.army.kill(u, null); else u.stagger = Math.max(u.stagger || 0, 1.1);
  }

  return {
    tick(dt) {
      for (const post of posts) {
        if (post.warnMesh) {
          post.warnT -= dt;
          if (post.warnT <= 0) { rt.scene.remove(post.warnMesh); post.warnMesh.traverse((m) => { if (m.geometry) m.geometry.dispose(); if (m.material) m.material.dispose(); }); post.warnMesh = null; spawn(post); }
          continue;
        }
        if (!post.active || !post.active()) continue;
        if (post.stock <= 0) continue;
        if (rt.t < post.nextT) continue;
        post.nextT = rt.t + post.interval[0] + Math.random() * (post.interval[1] - post.interval[0]);
        if (rolling.length >= MAX_ROLLING) continue;
        post.warnMesh = warn(post);
        post.warnT = 1.5;
      }
      for (let i = rolling.length - 1; i >= 0; i--) {
        const r = rolling[i];
        r.t += dt;
        // 斜面なりに転がる：下地の傾きぶん速さが増し、坂が緩い・曲がりで遅くなる
        const here = laneAt(r.post.lane, r.post.d, r.s);
        const ahead = laneAt(r.post.lane, r.post.d, r.s + 1);
        const dh = rt.world.heightAt(here.x, here.z) - rt.world.heightAt(ahead.x, ahead.z);
        r.speed = Math.max(2.5, Math.min(13, r.speed + (dh * 9.8 - 0.6) * dt));
        r.s += r.speed * dt;
        const at = laneAt(r.post.lane, r.post.d, r.s);
        const y = rt.world.heightAt(at.x, at.z);
        r.mesh.position.set(at.x, y + (r.kind === 'log' ? 0.22 : 0.42), at.z);
        r.mesh.rotation.x += r.speed * dt / 0.45;
        rt.army.forNear(at.x, at.z, 1.1, (u) => {
          if (!u.alive || u.team === r.post.team || r.hit.has(u) || u.invuln) return;
          if (r.speed < 4) return;
          r.hit.add(u);
          strike(u, r.kind);
        });
        if (at.end || r.t > 20) {
          rt.scene.remove(r.mesh); r.mesh.geometry = r.mesh.geometry; // ジオメトリはプールの共有物。破棄しない
          rolling.splice(i, 1);
        }
      }
    },
    stock(id) { const p = posts.find((q) => q.id === id); return p ? p.stock : 0; },
  };
}
