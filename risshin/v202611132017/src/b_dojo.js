// 稽古場（腕試し）の定義（battles.js から分けた。中身は元のまま）
import { gauss, enemyGroup, allyGroup } from './bhelp.js';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { koshisaku, nobori, hut, solidRect, solidCircle } from './props.js';

// ---- 稽古場の道具（手本は docs/town_dojo_1102.md）：的場の安土と霞的・巻藁・槍立て。形は一つに束ねて一回で描く ----
const paint = (g, hex) => {
  g = g.index ? g.toNonIndexed() : g;
  const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  return g;
};
const at = (g, x, y, z, ry = 0, rx = 0, rz = 0) => { g.rotateX(rx); g.rotateZ(rz); g.rotateY(ry); g.translate(x, y, z); return g; };
let KASUMI = null;
// 霞的（白地に黒の太い輪が三つ。尺二＝直径36cm）
function kasumiMat() {
  if (KASUMI) return KASUMI;
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const g = cv.getContext('2d'), R = 64;
  g.fillStyle = '#6b5a3e'; g.fillRect(0, 0, 128, 128);
  for (const [r, col] of [[1, '#1b1915'], [.93, '#ebe6da'], [.8, '#1b1915'], [.66, '#ebe6da'], [.53, '#1b1915'], [.4, '#ebe6da'], [.27, '#1b1915'], [.12, '#ebe6da']]) {
    g.fillStyle = col; g.beginPath(); g.arc(R, R, R * r, 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  return (KASUMI = new THREE.MeshStandardMaterial({ map: t, roughness: .9, metalness: 0 }));
}
function dojoGrounds(rt) {
  const W = rt.world, geos = [], y = (x, z) => W.heightAt(x, z);
  // 的場：土を盛った安土（台形）と、上に掛けた板葺きの小屋根。前に霞的を三つ
  const az = -37, ay = y(0, az);
  const mound = new THREE.CylinderGeometry(1, 1, 1, 4, 1); mound.rotateY(Math.PI / 4); mound.scale(14 / Math.SQRT2 * 1.0, 2.6, 3.2 / Math.SQRT2);
  geos.push(paint(at(mound, 0, ay + 1.1, az - .6), 0x7b6449));
  const face = new THREE.BoxGeometry(13.2, 2.6, .8); geos.push(paint(at(face, 0, ay + 1.1, az + .5, 0, -.5), 0x9a8160));   // 的を受ける砂の斜面
  for (const sx of [-6.6, -2.2, 2.2, 6.6]) geos.push(paint(at(new THREE.CylinderGeometry(.09, .1, 3.6, 6), sx, ay + 1.8, az + 2.4), 0x4a3a2a));
  geos.push(paint(at(new THREE.BoxGeometry(15, .12, 3.8), 0, ay + 3.5, az + .9, 0, .22), 0x5c5243));
  solidRect(0, az - .2, 14, 3.2);
  for (const mx of [-4, 0, 4]) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(.36, .36, .05, 24), kasumiMat());
    t.rotation.set(Math.PI / 2 - .12, 0, 0); t.position.set(mx, ay + .62, az + 1.75); rt.scene.add(t);
    geos.push(paint(at(new THREE.CylinderGeometry(.02, .02, .6, 4), mx, ay + .3, az + 1.7), 0x3a2c20));
  }
  // 射場：的に向かい、矢道をはさんだ手前の板葺きの小屋（三方を開けた稽古の小屋）
  rt.scene.add(hut(W, 0, 34, 10, 4.5, Math.PI, { wall: 0x6a5a44, minka: false, ita: true }));
  // 巻藁（槍と刀の突き打ちの稽古）：左手に二列
  const mk = [];
  for (let i = 0; i < 6; i++) mk.push([-24 + (i % 2) * 3, -12 + Math.floor(i / 2) * 6]);
  for (const [x, z] of mk) {
    const b = y(x, z);
    geos.push(paint(at(new THREE.CylinderGeometry(.07, .08, 1.9, 6), x, b + .95, z), 0x4a3a2a));
    geos.push(paint(at(new THREE.CylinderGeometry(.2, .22, .95, 8), x, b + 1.25, z), 0xb59d64));
    for (const yy of [.9, 1.25, 1.6]) geos.push(paint(at(new THREE.CylinderGeometry(.215, .215, .045, 8), x, b + yy, z), 0x6a5230));
    solidCircle(x, z, .35);
  }
  // 槍立て（横木に稽古槍を立て掛ける）：右手。石突を手前に置き、穂先の代わりのたんぽ（綿の包み）は奥へ
  const lean = .42;
  for (const [rx, rz] of [[25, -6], [25, 6]]) {
    const b = y(rx, rz);
    for (const sx of [-1.5, 1.5]) geos.push(paint(at(new THREE.CylinderGeometry(.07, .08, 1.7, 6), rx, b + .85, rz + sx), 0x4f3e2c));
    geos.push(paint(at(new THREE.CylinderGeometry(.05, .05, 3.2, 6), rx, b + 1.55, rz, 0, Math.PI / 2), 0x4f3e2c));
    for (let k = 0; k < 8; k++) {
      const zz = rz - 1.2 + k * .34, bx = rx - .75 + (k % 2) * .08;
      geos.push(paint(at(new THREE.CylinderGeometry(.017, .021, 4.2, 5), bx + 2.1 * Math.sin(lean), b + 2.1 * Math.cos(lean), zz, 0, 0, -lean), 0x6b4f33));
      geos.push(paint(at(new THREE.SphereGeometry(.075, 6, 4), bx + 4.2 * Math.sin(lean), b + 4.2 * Math.cos(lean), zz), 0xd8d0bc));
    }
    solidRect(rx, rz, 1.4, 3.4);
  }
  const m = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .95, metalness: 0 }));
  m.castShadow = true; m.receiveShadow = true;
  rt.scene.add(m);
  return mk;
}
// 巻藁を突く稽古の者（味方・討たれず・狙われない）。間をずらして突きの型を繰り返す
//   heading は巻藁へ向く向き（既定は -x）。城下の訓練場も使う
export function drillers(rt, mk, heading = -Math.PI / 2) {
  const list = [];
  mk.forEach(([x, z], i) => {
    const g = allyGroup(rt, { name: '稽古の者', anchor: { x: x - Math.sin(heading) * 1.7, z: z - Math.cos(heading) * 1.7 }, fixed: true, facing: heading, order: 'hold', noRout: true, width: 1, aggro: 0, seekRange: 0, march: false },
      [{ type: 'ashigaru', n: 1, o: { flag: null, invuln: true, hat: i % 3 ? 'hachimaki' : 'none' } }]);
    g.people = true;
    const u = g.units[0];
    if (!u) return;
    u.noTarget = true;
    list.push({ u, heading, next: 1 + i * .37 });
  });
  return list;
}
export function drillTick(rt, list) {
  for (const d of list) {
    const u = d.u;
    if (!u.alive) continue;
    u.heading = d.heading;   // 寄せ手や本人の方へ振り向かず、巻藁から目を離さない
    if (rt.t < d.next || u.swing) continue;
    d.next = rt.t + 1.1 + (u.id % 5) * .12;
    u.swing = { kind: 'thrust', t: 0, dur: .32, at: 0, done: true, target: null, res: null, d: 1.4, side: u.id % 2 ? 1 : -1 };
  }
}

const DOJO_SOIL = new THREE.Color(.42, .37, .29);
const practiceEnemyAlive =u => u?.alive && !u.gone && !u.dying && !u.downed && !u.woundOut && !u.rearWound && !u.fleeing;

// ======================================================================
// 稽古場（腕試し）：押し寄せる敵を何人討てるか
// ======================================================================
export const dojo = {
  dojo: true,
  missionStyle: 'practice',
  missionSingleLine: true,
  hideGuideSteps: true,
  noPlayerFoot: true,
  noFieldMap: true,
  hideArmyPeek: true,
  nearbyAllySignLimit: 0,
  keepTaskLabel: true,
  missionHeading: () => '▼の敵をたおせ',
  missionSignTarget(rt) { this.missionPin(rt); return practiceEnemyAlive(rt.flags.guideEnemy) ? rt.flags.guideEnemy : null; },
  enemyTriangleSigns: true,
  hideArmyPeek: true,
  noFieldMap: true,
  noPlayerFoot: true,
  speechAllowed: () => false,
  missionPin(rt) {
    const F = rt.flags, me = rt.player.u;
    if (!F.guideAt || rt.t >= F.guideAt) {
      F.guideAt = rt.t + .25;
      if (!practiceEnemyAlive(F.guideEnemy))
        F.guideEnemy = rt.army.nearestEnemy(me, 90);
    }
    const u = F.guideEnemy;
    if (!practiceEnemyAlive(u)) return null;
    const pin = F.guidePin || (F.guidePin = { x: 0, z: 0, r: 5, enemy: true, unit: null });
    pin.x = u.pos.x; pin.z = u.pos.z; pin.unit = u;
    return pin;
  },
  trackerIndex: 0,
  spawn: { x: 0, z: 8, heading: Math.PI },
  world: {
    seed: 41, clearAir: true,
    paths: [],
    height: (x, z) => 0.6 * Math.sin(x * 0.05) * Math.cos(z * 0.04) + 6 * gauss(x, z, 0, 0, 90000) * 0 + (Math.hypot(x, z) > 45 ? (Math.hypot(x, z) - 45) * 0.12 : 0),
    clear: (x, z) => Math.hypot(x, z) < 48,
    // 稽古場の中は踏み固めた土（草は柵の際に少し残る）
    tint: (x, z, h, c) => { const r = Math.hypot(x, z); if (r < 41) c.lerp(DOJO_SOIL, r < 34 ? .78 : .78 * (41 - r) / 7); },
    trees: 260,
    tufts: 2500,
    time: 'day',
  },
  sides: { a: { name: '稽古の者', mon: 'maru' }, b: { name: '敵', mon: 'saito' } },
  date: () => '清洲の稽古場　腕試し',
  setup(rt) {
    const W = rt.world;
    for (let i = 0; i < 16; i++) {
      const a0 = (i / 16) * Math.PI * 2, a1 = ((i + 1) / 16) * Math.PI * 2;
      if (i % 4 === 0) continue;
      // 稽古場の囲いは低い埒（馬場の柵）。戦の逆茂木・柵のように見せない
      rt.scene.add(koshisaku(W, [Math.sin(a0) * 40, Math.cos(a0) * 40, Math.sin(a1) * 40, Math.cos(a1) * 40], { h: 1.3 }));    }
    rt.flags.drill = drillers(rt, dojoGrounds(rt));
    for (const [x, z] of [[-14, 36], [14, 36], [-9, -38]]) rt.scene.add(nobori(W, x, z, 'oda', 5));
    // 乗馬は試せるようにする（canRide）が、常に騎乗の本物の馬を出し続けると重い。待たせておき、Rで乗れるように（kaito 10/1）
    if (rt.player.canRide && rt.player.mounted) rt.player.toggleMount();
    // 最初の相手へ通じる正面を空ける。馬は柵のそばで待たせる。
    const p = rt.player;
    if (p.loose && p.horse) {
      p.loose.x = 24; p.loose.z = 24; p.loose.mode = 'wait'; p.loose.spd = 0;
      p.horse.position.set(24, W.heightAt(24, 24), 24);
    }
    rt.flags.wave = 0; rt.flags.kills = 0;
    rt.obj('dojo', '目の前の相手を斬り倒せ', 'main');
    // 稽古の最初から正面に一人。隠し配置や出現待ちで相手を探させない。
    const meritHit = rt.army.hooks.onMeritHit;
    rt.army.hooks.onMeritHit = function (target, source, kind, amount) {
      if (source?.isPlayer && target.team !== source.team && amount > 0) {
        target.okeHitHp = target.hp + amount;
        target.okeDamageUntil = rt.t + 2.4;
        target.okeHitUntil = rt.t + .9;
      }
      meritHit?.call(this, target, source, kind, amount);
    };
    this.next(rt);
  },
  next(rt) {
    const F = rt.flags;
    F.wave++;
    const n = F.wave;
    const list = [{ type: 'ashigaru', n: n === 1 ? 1 : Math.min(180, 2 + n * 2) }];
    if (n >= 3) list.push({ type: 'samurai', n: Math.min(40, Math.floor(n / 2)) });
    if (n >= 5) list.push({ type: 'cavalry', n: Math.min(20, 1 + Math.floor((n - 5) / 2)) });
    if (n >= 4) list.push({ type: 'gun', n: 1 });
    if (n % 5 === 0) list.push({ type: 'busho', n: 1, o: { name: '敵の頭' } });
    const a = rt.player.yaw + (rt.player.camYawOff || 0), p = rt.player.u.pos;
    const distance = n === 1 ? 9 : 16;
    let x = p.x + Math.sin(a) * distance, z = p.z + Math.cos(a) * distance;
    const edge = Math.hypot(x, z);
    if (edge > 28) { x *= 28 / edge; z *= 28 / edge; }
    // 次の陣も稽古場の柵の内側へ。実戦用の画面外への移動を行わない。
    const g = enemyGroup(rt, { faction: 'saito', fixed: true, noGuard: true, anchor: { x, z }, facing: a + Math.PI, order: 'attack', seekRange: 90, noRout: true, width: 5 }, list);
    F.cur = g;
    rt.obj('dojo', '目の前の相手を斬り倒せ', 'main');
  },
  update(rt) {
    const F = rt.flags;
    if (F.drill) drillTick(rt, F.drill);
    if (F.cur && F.cur.count === 0 && !F.waiting) {
      F.waiting = true;
      rt.player.u.hp = Math.min(rt.player.u.maxHp, rt.player.u.hp + rt.player.u.maxHp * 0.25);
      rt.after(4, () => { F.waiting = false; this.next(rt); });
    }
  },
  onKill(rt, v, k) {
    if (k?.isPlayer) rt.flags.kills++;
    v.okeDefeatUntil = rt.t + .7;
  },
};
