// 北条家編「狼煙の網」の使い回し（K647・11/25 Sanae・docs/house_hojo.md ①②'）。h02 小田原城攻め（b_h02_odawara_k.js）と同じ仕組みを、ほかの守りの戦でも使う。
//   h02 は作り直さず、そのまま（この紙は同じ手の写しを、置き場と後詰を変えて使えるようにした物）。
//   使い方：const N = noroshi({ beacon, far, reliefFrom, reliefTo, beaconStep, relief: { name, list, say } })
//     lightBattle({ ..., setup: N.setup, update: N.update })
//   beaconStep：狼煙台の hold の段の前にある「rest 以外の段」の数（F.step がその数の間が狼煙台の段）。その次の段の reliefT 秒目に後詰が出る。
//   字・札・ボタンは足さない。煙と旗と音で見せる。本物の兵は後詰を足しても二百人ほどまで。
import * as THREE from 'three';
import { allyGroup } from './bhelp.js';
import { dress } from './b_k_help.js';
import { sfx } from './audio.js';

const HOJO = { flag: 'hojo', armor: 0x2a2f3a };
let PUFF_TEX = null;
function puffTex() {
  if (PUFF_TEX) return PUFF_TEX;
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const g = cv.getContext('2d'), gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.55, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return (PUFF_TEX = new THREE.CanvasTexture(cv));
}
function column(rt, x, z, y0, H, wk = 1) {
  const mat = new THREE.SpriteMaterial({ map: puffTex(), color: 0x3e3a36, transparent: true, opacity: 0, depthWrite: false, fog: false });
  const list = [];
  for (let i = 0; i < 10; i++) { const s = new THREE.Sprite(mat); s.renderOrder = 2; s.visible = false; rt.scene.add(s); list.push({ s, k: i / 10 }); }
  return { x, z, y0, H, wk, mat, list, a: 0 };
}
const NEAR_D = 130;
function columnTick(c, dt, cam) {
  const on = c.a > 0.01;
  c.mat.opacity = Math.min(0.8, c.a);
  for (const p of c.list) {
    p.s.visible = on;
    if (!on) continue;
    p.k = (p.k + dt / 36) % 1;
    const k = p.k, w = (3 + k * 12 * Math.max(0.4, c.a)) * c.wk;
    let x = c.x + k * k * 12 * c.wk, y = c.y0 + k * c.H * Math.max(0.35, c.a), z = c.z - k * 4, f = 1;
    if (cam) {
      const d = Math.hypot(x - cam.x, y - cam.y, z - cam.z);
      if (d > NEAR_D) { f = NEAR_D / d; x = cam.x + (x - cam.x) * f; y = cam.y + (y - cam.y) * f; z = cam.z + (z - cam.z) * f; }
    }
    p.s.position.set(x, y, z);
    p.s.scale.set(w * f, w * 1.15 * f, 1);
  }
}
// 材質と形は一度だけ（戦をまたいで使い回す＝城下⇄合戦で増えない）
let TOWER_PARTS = null;
function towerParts() {
  if (TOWER_PARTS) return TOWER_PARTS;
  return (TOWER_PARTS = {
    wood: new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.95 }),
    potM: new THREE.MeshStandardMaterial({ color: 0x2a241e, roughness: 1 }),
    brushM: new THREE.MeshStandardMaterial({ color: 0x6b5a3a, roughness: 1 }),
    post: new THREE.CylinderGeometry(0.16, 0.2, 6, 6), deck: new THREE.BoxGeometry(3.2, 0.25, 3.2),
    pot: new THREE.CylinderGeometry(0.9, 0.6, 0.9, 8), brush: new THREE.ConeGeometry(1.6, 1.6, 7),
  });
}
function beaconTower(rt, B) {
  const P = towerParts(), y = rt.world.heightAt(B.x, B.z), grp = new THREE.Group();
  for (const [dx, dz] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) { const m = new THREE.Mesh(P.post, P.wood); m.position.set(dx, 3, dz); grp.add(m); }
  const deck = new THREE.Mesh(P.deck, P.wood); deck.position.y = 5.2; grp.add(deck);
  const pot = new THREE.Mesh(P.pot, P.potM); pot.position.y = 5.8; grp.add(pot);
  const brush = new THREE.Mesh(P.brush, P.brushM); brush.position.set(2.6, 0.8, 0.4); grp.add(brush);
  grp.position.set(B.x, y, B.z);
  rt.scene.add(grp);
  return { grp, y };
}

export function noroshi(o) {
  const B = o.beacon, FAR = o.far, S0 = o.beaconStep, look = o.look || HOJO, R = o.relief;
  const banName = o.banName || '狼煙番';
  function lightUp(rt) {
    const N = rt.flags.hj;
    if (N.lit || N.fallen) return;
    N.lit = true; N.prog = 1;
    sfx('hora', 1);
    rt.say('組頭', '火が上がった！　煙が支城へ続くぞ！', 3);
    FAR.forEach((p, i) => rt.after(4 + i * 4, () => { N.far[i].want = 1; if (i === FAR.length - 1) rt.say('使番', '支城の狼煙が応えた！　後詰が来るぞ', 3.4); }));
  }
  function knockDown(rt) {
    const N = rt.flags.hj;
    if (N.lit || N.fallen) return;
    N.fallen = true; N.prog = 0;
    if (N.tower) N.tower.grp.rotation.z = 0.5;
    rt.say('組頭', '台が倒された！　……後詰は呼べぬ', 3.2);
  }
  function sendRelief(rt) {
    const F = rt.flags, N = F.hj;
    if (N.relief) return;
    N.relief = true;
    if (!N.lit) { rt.say('組頭', '煙が上がらなんだ。わしらだけで守るぞ', 3.2); return; }
    const g = allyGroup(rt, { name: R.name, flag: look.flag, anchor: { ...o.reliefFrom }, facing: o.reliefFace ?? 0, fullStrength: true, noRout: true, aggro: 30, seekRange: 80, morale: 95, dmgMult: 0.45, order: 'attack' },
      dress(R.list, look));
    g.anchor = { ...o.reliefTo };
    (F.allies || (F.allies = [])).push(g);
    sfx('hora', 1); rt.after(0.6, () => sfx('toki', 1));
    if (R.say) rt.say(R.say[0], R.say[1], 3.2);
    if (R.foeSay) rt.after(3.4, () => rt.say(R.foeSay[0], R.foeSay[1], 3));
  }
  return {
    setup(rt) {
      const W = rt.world, tower = beaconTower(rt, B);
      rt.flags.hj = { prog: 0, harm: 0, lit: false, fallen: false, relief: false, tower,
        near: column(rt, B.x, B.z, tower.y + 6, 50),
        far: FAR.map((p) => Object.assign(column(rt, p.x, p.z, (W.heightAt(Math.max(-250, Math.min(250, p.x)), Math.max(-250, Math.min(250, p.z))) || 0) + 8, 90, 2.4), { want: 0 })) };
      o.setup?.(rt);
    },
    update(rt, dt) {
      const F = rt.flags, N = F.hj;
      if (!N) return;
      dt = dt || 0;
      if (F.step === S0 && !N.lit && !N.fallen && !F.ending) {
        const P = rt.player?.u;
        let foeNear = 0;
        for (const u of rt.army.units) {
          if (!u.alive || u.gone || u.team === 0 || u.fleeing) continue;
          if (Math.hypot(u.pos.x - B.x, u.pos.z - B.z) < 6 && ++foeNear >= 2) break;
        }
        const me = P?.alive && Math.hypot(P.pos.x - B.x, P.pos.z - B.z) < 16;
        let ban = false;
        if (!me && !foeNear) for (const g of F.allies || []) if (g?.name === banName && g.units.some((u) => u.alive && Math.hypot(u.pos.x - B.x, u.pos.z - B.z) < 10)) { ban = true; break; }
        if (me) { N.prog = Math.min(1, N.prog + dt / (foeNear ? 48 : 26)); N.harm = Math.max(0, N.harm - dt); }
        else if (ban) N.prog = Math.min(1, N.prog + dt / 70);
        else if (foeNear >= 2) { N.harm += dt; N.prog = Math.max(0, N.prog - dt / 20); }
        if (N.harm > 30) knockDown(rt);
        else if (N.prog >= 1) lightUp(rt);
      }
      if (F.step === S0 + 1 && !N.relief) { N.reliefT = (N.reliefT || 0) + dt; if (N.reliefT > (o.reliefT || 20)) sendRelief(rt); }
      N.near.a = N.fallen ? Math.max(0, N.near.a - dt * 0.3) : N.lit ? Math.min(1, N.near.a + dt * 0.3) : N.prog * 0.5;
      const cam = rt.camera?.position;
      columnTick(N.near, dt, cam);
      for (const c of N.far) { c.a = Math.min(c.want, c.a + dt * 0.12); columnTick(c, dt, cam); }
      o.update?.(rt, dt);
    },
  };
}
