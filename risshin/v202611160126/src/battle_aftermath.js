// 戦の後の余韻（kaito 11/1）：勝った後、少しの間、静かになった戦場を歩ける。
// 倒れた兵・倒れた旗はそのまま残し、遠くに煙を立て、太鼓と鬨を止めて烏と風だけにする。
// 兵の判断と攻撃は止め（units.js の aftermath）、遠い兵は描かない（重くしない）。
// 字は出さない。右の丸い印（▶）か Enter で戦の後の画面へ。何もしなくても六秒で進む。
import * as THREE from 'three';
import { setCrowd, setScene, afterBattle } from './audio.js';
import { groundAt } from './floors.js';
import { fallenHorses } from './gap_scene.js';

// 11/11 要件46 の続き（クラウドへ）：負傷兵・仲間を探す兵・戻る配下・捨てられた槍と折れた旗。形と材質は使い回す。
let _deb = null;
function debrisParts() {
  if (_deb) return _deb;
  _deb = {
    pole: new THREE.CylinderGeometry(0.022, 0.026, 1.3, 5),
    shaft: new THREE.CylinderGeometry(0.018, 0.02, 3.0, 5),
    tip: new THREE.ConeGeometry(0.03, 0.22, 4),
    tube: new THREE.CylinderGeometry(0.035, 0.035, 0.3, 6),
    cloth: new THREE.PlaneGeometry(0.42, 0.66),
    wood: new THREE.MeshStandardMaterial({ color: 0x3b2c1e, roughness: 0.9 }),
    iron: new THREE.MeshStandardMaterial({ color: 0x8a8c8e, roughness: 0.45, metalness: 0.6 }),
    bamboo: new THREE.MeshStandardMaterial({ color: 0x7d7a3e, roughness: 0.7 }),
    rag: new THREE.MeshStandardMaterial({ color: 0xbdb39c, roughness: 1, side: THREE.DoubleSide }),
    ragDark: new THREE.MeshStandardMaterial({ color: 0x2c2722, roughness: 1, side: THREE.DoubleSide }),
  };
  return _deb;
}
function dropDebris(rt, u, i) {
  const D = debrisParts(), g = new THREE.Group();
  const yaw = (u.id * 2.399) % (Math.PI * 2), ox = Math.sin(yaw) * 0.9, oz = Math.cos(yaw) * 0.9;
  const x = u.pos.x + ox, z = u.pos.z + oz;
  if (i % 2 === 0) {
    // 折れた指物：短い竿と、泥に落ちた布
    const p = new THREE.Mesh(D.pole, D.wood); p.rotation.z = Math.PI / 2; p.position.y = 0.03; g.add(p);
    const c = new THREE.Mesh(D.cloth, (u.id % 3) ? D.rag : D.ragDark); c.rotation.x = -Math.PI / 2 + 0.06; c.rotation.z = 0.4; c.position.set(0.75, 0.025, 0.12); g.add(c);
  } else {
    // 捨てられた槍
    const s = new THREE.Mesh(D.shaft, D.wood); s.rotation.z = Math.PI / 2; s.position.y = 0.03; g.add(s);
    const t = new THREE.Mesh(D.tip, D.iron); t.rotation.z = -Math.PI / 2; t.position.set(1.6, 0.03, 0); g.add(t);
  }
  g.position.set(x, groundAt(rt.world, x, z, u.pos.y), z);
  g.rotation.y = yaw + 1.1;
  rt.scene.add(g);
  return g;
}

const LIMIT = 30, FAR = 70;   // 11/11 要件46：戦後は最低30秒（右下の印で飛ばせる）
// 余韻は六秒（kaito 11/2 P「戦が終わった後の、何もできない待ちの画面が長すぎる。すぐ結果へ」。前は四十五秒）

// 退き口（追い討ち）を閉じる時に呼ぶ。勝った戦だけ余韻へ入り、入ったら true。
export function aftermathStart(rt) {
  if (rt.aftermath || rt.tracker.main !== true || rt.result?.down || rt.def.dojo || rt.def.town || rt.def.noAftermath || !rt.player?.u.alive) return false;
  rt.aftermath = rt.army.aftermath = true;
  rt.withdrawal = null;
  rt.endT = LIMIT;
  rt.aftermathSound = { aftermath: true, heat: 0, calm: true, rain: false, hurt: false, march: 0,
    night: rt.world.timeKey === 'dusk' || rt.world.timeKey === 'night', flap: 0, pant: 0.45 };
  const P = rt.player;
  P.lock = null; P.inCombatT = 0; P.cine = null;
  for (const u of rt.army.units) if (u.alive) {
    u.target = null; u.atk = null; u.swing = null; u.reload = null;
    u.moving = 0; u.charging = false; u.cheer = 0;
    if (!u.isPlayer && !u.mounted && !u.fleeing && (u.type === 'ashigaru' || u.type === 'samurai') && ((u.id | 0) % 3 !== 0)) u._crouch = true;   // 座り込む・膝をつく兵（三人に二人）
    u.hit = null; u.stagger = 0; u.recoil = 0; u.strikeT = 0; u.sweepT = 0;
  }
  aftermathRoles(rt);
  // 飛んでいる矢は外す（刺さった矢は残す）。
  for (let i = rt.army.arrows.length - 1; i >= 0; i--) {
    const a = rt.army.arrows[i];
    if (!a.stuck) { (a.parent || rt.scene).remove(a.mesh); rt.army.arrows.splice(i, 1); }
  }
  // 遠い兵は描かない。倒れた者（alive でない）は残す。
  const p = P.u.pos;
  rt._afterHidden = [];
  for (const u of rt.army.units) {
    if (!u.alive || u.isPlayer || !u.mesh || !u.mesh.visible) continue;
    if (Math.hypot(u.pos.x - p.x, u.pos.z - p.z) > FAR) { u.mesh.visible = false; rt._afterHidden.push(u); }
  }
  // 立ち上る煙：敵の来た方の遠くに二、三本（既存の煙の柱を使い回す）。
  if (rt.world.addSmokeColumn) {
    const foe = rt.army.units.find((u) => !u.alive && u.team !== 0) || null;
    const ax = foe ? foe.pos.x - p.x : 0, az = foe ? foe.pos.z - p.z : 1, l = Math.hypot(ax, az) || 1;
    for (let i = 0; i < 3; i++) {
      const a = Math.atan2(ax / l, az / l) + (i - 1) * 0.5, d = 55 + i * 18;
      const x = p.x + Math.sin(a) * d, z = p.z + Math.cos(a) * d;
      rt.world.addSmokeColumn(x, rt.world.heightAt(x, z), z, { size: 0.8 + i * 0.25, black: i === 1 });
    }
  }
  afterBattle(true, null);
  setCrowd(0.04);
  setScene({ approach: 0 });
  // 戦の後の画面へ進む丸い印
  const b = document.createElement('button');
  b.type = 'button'; b.id = 'aftermath-next'; b.textContent = '▶';
  b.setAttribute('aria-label', '戦の後の画面へ');
  b.style.cssText = 'position:fixed;right:calc(20px + env(safe-area-inset-right,0px));bottom:calc(20px + env(safe-area-inset-bottom,0px));z-index:22;width:56px;height:56px;border-radius:50%;border:2px solid rgba(240,232,214,.85);background:rgba(12,10,8,.55);color:#f0e8d6;font-size:22px;opacity:0;transition:opacity 1.5s';
  b.onclick = (e) => { e.stopPropagation(); rt.endT = Math.min(rt.endT, 0.01); };
  document.body.appendChild(b);
  rt._afterBtn = b;
  setTimeout(() => { if (rt._afterBtn) rt._afterBtn.style.opacity = '1'; }, 3000);
  return true;
}

// 負傷兵（深手の者は片膝で柄にすがる＝army_anim の woundRest）・倒れた仲間を探して歩み寄り膝をつく兵・
// 生き残った配下が主人公のもとへ戻る・討たれた者のそばの捨てられた槍と折れた指物。字は出さない。
function aftermathRoles(rt) {
  const P = rt.player.u, p = P.pos, team = P.team;
  const near = (u, r) => Math.hypot(u.pos.x - p.x, u.pos.z - p.z) < r;
  const dead = rt.army.units.filter((u) => !u.alive && u.mesh && !u.mounted && near(u, 40))
    .sort((a, b) => Math.hypot(a.pos.x - p.x, a.pos.z - p.z) - Math.hypot(b.pos.x - p.x, b.pos.z - p.z));
  rt._afterDebris = dead.slice(0, 8).map((u, i) => dropDebris(rt, u, i));
  // 11/11 P0-11 の残り：主を落とされた所の二頭まで、伏せた馬を残す（形は一つの InstancedMesh）
  const fell = dead.filter((u) => u.death?.kind === 'unhorse').slice(0, 2)
    .map((u) => { const a = (u.id * 1.7) % (Math.PI * 2); return [u.pos.x + Math.sin(a) * 2.2, u.pos.z + Math.cos(a) * 2.2, a + 1.2]; });
  if (fell.length) { const m = fallenHorses(rt, fell); if (m) rt._afterDebris.push(m); }
  // 座り込んだ近くの兵の三人まで、竹筒の水を飲む（左手を口へ。army_anim が u._drink を読む）
  rt._afterDrink = [];
  for (const u of rt.army.units) {
    if (rt._afterDrink.length >= 3) break;
    if (!u.alive || !u._crouch || u.team !== team || !u.armL || u.isSub || !near(u, 25)) continue;
    const t = new THREE.Mesh(debrisParts().tube, debrisParts().bamboo);
    t.position.set(0, -0.5, 0.04); t.rotation.x = 0.3;
    u.armL.add(t); u._drink = 1 + rt._afterDrink.length * 2.7; rt._afterDrink.push({ u, t });
  }
  rt._afterWalk = [];
  let hurt = 0, seek = 0;
  const taken = new Set();
  for (const u of rt.army.units) {
    if (!u.alive || u.isPlayer || u.mounted || u.fleeing || u.team !== team || !u.mesh || !near(u, 45)) continue;
    if (u.isSub) {
      // 配下は主人公のそばへ戻って膝をつく（戻らない者は討たれた者）
      const a = (rt._afterWalk.length * 0.9) - 1.3;
      rt._afterWalk.push({ u, x: p.x + Math.sin(a) * 2.4, z: p.z + Math.cos(a) * 2.4, kneel: true });
      u._crouch = false; continue;
    }
    if (u.name || u.isTaisho || u.stdHeld || u.banner) continue;
    if (!u._crouch && hurt < 8 && u.hp < u.maxHp * 0.7) { u.hp = Math.min(u.hp, u.maxHp * 0.28); hurt++; continue; }
    if (seek < 4 && (u.id | 0) % 3 === 0) {
      const f = dead.find((d) => d.team === team && !taken.has(d) && Math.hypot(d.pos.x - u.pos.x, d.pos.z - u.pos.z) < 22);
      if (f) { taken.add(f); seek++; u._crouch = false; rt._afterWalk.push({ u, x: f.pos.x + (u.pos.x - f.pos.x) * 0.08, z: f.pos.z + (u.pos.z - f.pos.z) * 0.08, kneel: true, d: f }); }
    }
  }
}

// 余韻の間、毎コマ。Enter でも進む。歩む者だけ少しずつ動かす（判断は止めたまま）。
export function aftermathInput(rt, input, dt = 1 / 60) {
  if (input.pressed && input.pressed('Enter')) rt.endT = Math.min(rt.endT, 0.01);
  for (const w of rt._afterWalk || []) {
    const u = w.u;
    if (!u.alive || w.done) continue;
    const dx = w.x - u.pos.x, dz = w.z - u.pos.z, l = Math.hypot(dx, dz);
    if (l < 0.35 || l > 60) {
      w.done = true; u.moving = 0; if (u.mv) { u.mv.x = 0; u.mv.z = 0; }
      if (w.d) u.heading = Math.atan2(w.d.pos.x - u.pos.x, w.d.pos.z - u.pos.z);
      if (w.kneel) u._crouch = true;
      continue;
    }
    const v = 1.05 + ((u.id * 0.618) % 1) * 0.3, st = Math.min(l, v * dt);
    u.pos.x += dx / l * st; u.pos.z += dz / l * st;
    u.pos.y = groundAt(rt.world, u.pos.x, u.pos.z, u.pos.y);
    u.heading = Math.atan2(dx, dz); u.moving = v / 2.4;
    if (u.mv) { u.mv.x = dx / l * v; u.mv.z = dz / l * v; }
  }
}

export function aftermathDispose(rt) {
  rt._afterBtn?.remove(); rt._afterBtn = null;
  for (const u of rt._afterHidden || []) if (u.mesh) u.mesh.visible = true;
  for (const u of rt.army?.units || []) if (u._crouch && u.alive) u._crouch = false;
  rt._afterHidden = null;
  for (const g of rt._afterDebris || []) { g.parent?.remove(g); if (g.isInstancedMesh) g.geometry.dispose(); }
  for (const d of rt._afterDrink || []) { d.t.parent?.remove(d.t); d.u._drink = 0; }
  rt._afterDrink = null;
  rt._afterDebris = null; rt._afterWalk = null;
}
