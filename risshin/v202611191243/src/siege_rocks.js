// ======================================================================
// 落石・丸太（siege_rocks.js）… docs/castle-design.md 7-1「登る最中の落石・丸太（山城）」
// 山城の七曲りの坂道で、上の守り手が石や丸太を転がして寄せ手を止める。
// makeRockTraps(rt, { posts }) を一つ呼べば、置き場ごとに「石じゃ！」の合図→帯の影→転がる→当たる、を回す。
// posts: [{ id, at:{x,z}（置き場）, lane:[[x,z],...]（上から下への道筋）, team（守りの側。既定1）,
//           active: () => bool（置き場がまだ生きているか）, stock（石の数。既定 6）, interval:[min,max] 秒,
//           burst（一度の合図で落とす数。既定 1）, spread（筋の横へ散らす幅 m。既定 0） }]
// burst が2以上なら、一度の合図で石と丸太が少しずつ遅れて横に散って転がる（K141「石が雨」）。本人に当たるのは一度の合図で一つまで。
// 同時に転がる石・丸太は、戦全体で 8 個まで（docs の数の上限）。竹束を抱えている者（u.tatake・rt.flags.carry の自分）は
// 前から来る分の 7 割を防ぐ（castle-design 7-3 と合わせる）。
// ======================================================================
import * as THREE from 'three';
import { inCoverOf } from './taketaba.js';
import { rockShape } from './rock_shape.js';

const MAX_ROLLING = 8;
let ROCK_GEO = null, LOG_GEO = null, ROCK_MAT = null, LOG_MAT = null;
function geoms() {
  if (!ROCK_GEO) {
    ROCK_GEO = rockShape(0.46);
    // 転がる岩は埋め込み分を戻し、従来の高さと当たりを保つ。
    ROCK_GEO.translate(0, 0.46 * 0.08, 0);
    ROCK_GEO.scale(1, 1.25, 1);
    LOG_GEO = new THREE.CylinderGeometry(0.22, 0.24, 4, 7);
    LOG_GEO.rotateZ(Math.PI / 2);
    ROCK_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true });
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
      // 帯は地面に沿わせる（一枚の平らな板を中ほどの高さに置くと、坂の上で宙に浮く）
      // 崖ほど急な区間（道ではない山肌）には帯を描かない（大きな黒い幕になる）
      if (Math.abs(rt.world.heightAt(bx, bz) - rt.world.heightAt(ax, az)) / len > 0.7) continue;
      const n = Math.max(1, Math.ceil(len / 1.5)), nx = -(bz - az) / len * w / 2, nz = (bx - ax) / len * w / 2, pos = [];
      for (let k = 0; k <= n; k++) {
        const x = ax + (bx - ax) * k / n, z = az + (bz - az) * k / n;
        pos.push(x + nx, rt.world.heightAt(x + nx, z + nz) + 0.06, z + nz, x - nx, rt.world.heightAt(x - nx, z - nz) + 0.06, z - nz);
      }
      const idx = [];
      for (let k = 0; k < n; k++) idx.push(k * 2, k * 2 + 1, k * 2 + 2, k * 2 + 1, k * 2 + 3, k * 2 + 2);
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx);
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x1a1612, transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide }));
      g.add(mesh);
      if (i > 3) break;   // 帯は始めの区間だけで足りる（軽く）
    }
    rt.scene.add(g);
    return g;
  }

  function spawn(post, delay = 0, off = 0, volley = null) {
    if (rolling.length >= MAX_ROLLING || post.stock <= 0) return;
    post.stock--;
    const kind = Math.random() < 0.25 ? 'log' : 'rock';
    const { ROCK_GEO, LOG_GEO, ROCK_MAT, LOG_MAT } = geoms();
    const mesh = new THREE.Mesh(kind === 'log' ? LOG_GEO : ROCK_GEO, kind === 'log' ? LOG_MAT : ROCK_MAT);
    mesh.castShadow = true; mesh.receiveShadow = true;
    const p0 = post.lane[0];
    mesh.position.set(p0[0], rt.world.heightAt(p0[0], p0[1]) + 0.5, p0[1]);
    if (kind === 'rock') { const k = 0.85 + Math.random() * 0.6; mesh.scale.set(k, k * (0.85 + Math.random() * 0.3), k); }
    mesh.visible = delay <= 0;
    rt.scene.add(mesh);
    rolling.push({ post, mesh, kind, s: 0, speed: 3 + Math.random() * 1.5, hit: new Set(), t: 0, delay, off, volley, spin: (Math.random() - 0.5) * 2 });
    if (delay > 0) return;
    if (rt.t - lastShoutT > 6) { lastShoutT = rt.t; rt.bark(kind === 'log' ? '丸太が来るぞ！　避けよ！' : '石じゃ！　気を付けよ！', true); }
    rt.army.play && rt.army.play('knock', { x: p0[0], z: p0[1] }, 0.7);
  }

  function hitDmg(kind) { return kind === 'log' ? 50 : 25 + Math.random() * 15; }
  // 竹束を抱えている者は、前から来る分の 7 割を防ぐ（castle-design 7-3）
  function guarded(u) {
    if (u.isPlayer) return !!(rt.flags && rt.flags.carry) || inCoverOf(rt, u.pos.x, u.pos.z, u.team);
    return !!u.tatake || inCoverOf(rt, u.pos.x, u.pos.z, u.team);
  }
  function strike(u, kind, volley) {
    if (!u.alive) return;
    if (u.isPlayer && volley) { if (volley.hitPlayer) return; volley.hitPlayer = true; }
    let dmg = hitDmg(kind);
    if (guarded(u)) dmg *= 0.3;
    // 本人は一つの石で命の三分の一まで。何に打たれたかを札と一行に残す（満タン近くから一瞬で討たれ、訳が出なかった。11/8 critic60 八王子）
    if (u.isPlayer) {
      dmg = Math.min(dmg, u.maxHp * 0.34) * (rt.def?.playerTaken ?? 1);   // 戦の受ける傷の倍率（def.playerTaken）を石にも（11/8 八王子の15分の構成）
      if (rt.player) rt.player.lastHit = { t: rt.t, name: '上から落ちた石', type: '', kind: 'rock' };
      if (rt.bark && u.hp - dmg > 0) rt.bark('上から石が落ちて来た！');
    }
    else if (rt.def?.rockAllyTaken != null && rt.player?.u && u.team === rt.player.u.team) dmg *= rt.def.rockAllyTaken;   // 11/19 K358 iMac n-kiba：戦ごとに本人の側の兵（味方）が石から受ける傷の倍率（比叡山：石の帯を列で登る明智の手が石で削れ、五分の一を割って負けた）
    if (u.hpFloor > 0) dmg = Math.min(dmg, Math.max(0, u.hp - u.maxHp * u.hpFloor));   // 11/18 クラウド 岐阜城：戦が決めた命の下限（hpFloor）を石にも
    u.hp -= dmg; u.lastHitT = 0;
    if (u.hp <= 0) rt.army.kill(u, null); else u.stagger = Math.max(u.stagger || 0, 1.1);
  }

  return {
    rolling, // 写真の道具（k141_rocks_shot）が転がる石を探す
    tick(dt) {
      for (const post of posts) {
        if (post.warnMesh) {
          post.warnT -= dt;
          if (post.warnT <= 0) { rt.scene.remove(post.warnMesh); post.warnMesh.traverse((m) => { if (m.geometry) m.geometry.dispose(); if (m.material) m.material.dispose(); }); post.warnMesh = null;
            const n = Math.max(1, post.burst || 1), w = post.spread || 0, volley = n > 1 ? { hitPlayer: false } : null;
            for (let k = 0; k < n; k++) spawn(post, k * (0.12 + Math.random() * 0.14), n > 1 ? (k / (n - 1) - 0.5) * w + (Math.random() - 0.5) * 0.8 : 0, volley);
          }
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
        if (r.delay > 0) {
          r.delay -= dt;
          if (r.delay > 0) continue;
          r.mesh.visible = true;
          rt.army.play && rt.army.play('knock', { x: r.post.lane[0][0], z: r.post.lane[0][1] }, 0.5);
        }
        r.t += dt;
        // 斜面なりに転がる：下地の傾きぶん速さが増し、坂が緩い・曲がりで遅くなる
        const here = laneAt(r.post.lane, r.post.d, r.s);
        const ahead = laneAt(r.post.lane, r.post.d, r.s + 1);
        const dh = rt.world.heightAt(here.x, here.z) - rt.world.heightAt(ahead.x, ahead.z);
        r.speed = Math.max(2.5, Math.min(13, r.speed + (dh * 9.8 - 0.6) * dt));
        r.s += r.speed * dt;
        const at = laneAt(r.post.lane, r.post.d, r.s);
        if (r.off) {   // 筋の横へずらす（筋の向きに直角）。散らした石も同じ斜面を下る
          const nx = ahead.z - here.z, nz = here.x - ahead.x, nl = Math.hypot(nx, nz) || 1;
          at.x += nx / nl * r.off; at.z += nz / nl * r.off;
        }
        const y = rt.world.heightAt(at.x, at.z);
        r.mesh.position.set(at.x, y + (r.kind === 'log' ? 0.22 : 0.42), at.z);
        r.mesh.rotation.x += r.speed * dt / 0.45;
        if (r.kind === 'rock') r.mesh.rotation.z += r.spin * dt;   // 石は不揃いに跳ねて回る
        // 転がった跡に低い土煙（足首の高さ・見通しは塞がない）。宙に浮く灰色の玉に見えず、坂を落ちて来る石と分かる（11/19 クラウド 岐阜城 写真）
        r.dustT = (r.dustT || 0) - dt;
        if (r.dustT <= 0 && r.speed >= 3.5 && rt.world.dustCloud && !(rt.world.rainLevel > 0.4 || (rt.world.wetness || 0) > 0.5)) { r.dustT = 0.3; rt.world.dustCloud(at.x, at.z, false, false, true); }
        rt.army.forNear(at.x, at.z, 1.1, (u) => {
          if (!u.alive || u.team === r.post.team || r.hit.has(u) || u.invuln) return;
          if (r.speed < 4) return;
          r.hit.add(u);
          strike(u, r.kind, r.volley);
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
