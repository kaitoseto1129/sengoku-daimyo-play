// 稽古場（腕試し）の定義（battles.js から分けた。中身は元のまま）
import { gauss, enemyGroup, allyGroup } from './bhelp.js';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { koshisaku, nobori, hut, solidRect, solidCircle } from './props.js';
import { sfx } from './audio.js';

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
// ======================================================================
// 稽古の段（11/17 クラウド kaito2「稽古場の質」）：はじめての人が字を読まずに、歩く・走る・斬る・受ける・撃つ・馬に乗る・組を動かすを覚える。
//   その時に使う丸（指の端末）・武具の札・キーの絵（パソコン）を一つだけ光らせ、地面のピンか相手を一つ出す。できたら次の段へ。字は出さない。
//   段を全部済ませたら、いつもの腕試し（押し寄せる陣）へ。一度済ませた人は段を飛ばす（端末に覚える）。
// ======================================================================
const LESSON_KEY = 'risshin-dojo-lessons';
const MOUSE = (side) => `<svg viewBox="0 0 24 32" width="22" height="30" aria-hidden="true"><rect x="2" y="2" width="20" height="28" rx="10" fill="none" stroke="#f3ead6" stroke-width="2"/><path d="M12 2v11" stroke="#f3ead6" stroke-width="2"/><path d="${side < 0 ? 'M12 3a9 9 0 0 0-9 9v1h9z' : 'M12 3a9 9 0 0 1 9 9v1h-9z'}" fill="#f0c070"/></svg>`;
const CAP = (k) => `<b style="display:inline-flex;align-items:center;justify-content:center;min-width:34px;height:34px;padding:0 8px;border:2px solid #f3ead6;border-radius:6px;font:800 16px/1 sans-serif;color:#f3ead6;background:#14120f">${k}</b>`;
const LESSONS = [
  { id: 'move', ob: '印まで歩け', sel: ['#tc-stick'], key: CAP('W'), pin: 10 },
  { id: 'run', ob: '印まで走れ', sel: ['#tc-stick'], key: CAP('Shift') + CAP('W'), pin: 22 },
  { id: 'atk', ob: '▼の敵を突け', sel: ['#tc [data-b="atk"]'], key: MOUSE(-1), enemy: 'ashigaru' },
  { id: 'guard', ob: '守って受けよ', sel: ['#tc [data-b="guard"]'], key: MOUSE(1), enemy: 'ashigaru' },
  { id: 'gun', ob: '鉄砲で撃て', sel: ['#tc [data-b="wpn"]', 'button[data-weapon="gun"]'], key: CAP('3') + MOUSE(-1), enemy: 'ashigaru', far: 18 },
  { id: 'mount', ob: '馬に乗れ', sel: ['#tc [data-b="mount"]'], key: CAP('R'), horse: true },
  { id: 'cmd', ob: '組に指図せよ', sel: ['#tc [data-b="cmd"]'], key: CAP('Tab'), squad: true },
];
function lessonsSeen() { try { return localStorage.getItem(LESSON_KEY) === '1'; } catch (e) { return false; } }
function lessonGlow(rt, st) {
  const want = new Set();
  for (const q of st ? st.sel : []) for (const el of document.querySelectorAll(q)) want.add(el);
  for (const el of document.querySelectorAll('.dj-glow')) if (!want.has(el)) el.classList.remove('dj-glow');
  for (const el of want) el.classList.add('dj-glow');
  let k = document.getElementById('dj-key');
  const touch = document.documentElement.classList.contains('touch');
  if (!st || touch) { if (k) k.hidden = true; return; }
  if (!k) {
    k = document.createElement('div'); k.id = 'dj-key'; k.setAttribute('aria-hidden', 'true');
    k.style.cssText = 'position:fixed;left:50%;bottom:22%;transform:translateX(-50%);display:flex;gap:6px;align-items:center;padding:8px 10px;background:rgba(20,18,15,.82);border:2px solid #f0c070;border-radius:8px;pointer-events:none;z-index:30';
    document.body.appendChild(k);
  }
  if (k.dataset.id !== st.id) { k.dataset.id = st.id; k.innerHTML = st.key; }
  k.hidden = false;
}
function lessonStyle() {
  if (document.getElementById('dj-glow-css')) return;
  const s = document.createElement('style'); s.id = 'dj-glow-css';
  // 点滅はさせない（kaito 10/23「チカチカがほんとにやだ」）。動かない金の輪で一つだけ示す
  //   丸の縁はもともと金なので、縁の外に太い輪と光を重ねて、隣の丸と見分けられるように（写真で「守る」と同じに見えた）
  s.textContent = 'html body .dj-glow,html body #tc .tb.dj-glow,html body #tc .stick.dj-glow{outline:4px solid #ffd27a!important;outline-offset:5px!important;box-shadow:0 0 0 3px #14120f,0 0 26px 10px rgba(255,210,122,.75)!important}';
  document.head.appendChild(s);
}
function lessonClear(rt) {
  lessonGlow(rt, null);
  const k = document.getElementById('dj-key'); if (k) k.remove();
}
function lessonEnemy(rt, st) {
  const F = rt.flags, p = rt.player, a = p.yaw + (p.camYawOff || 0), d = st.far || 8;
  let x = p.u.pos.x + Math.sin(a) * d, z = p.u.pos.z + Math.cos(a) * d;
  const edge = Math.hypot(x, z); if (edge > 28) { x *= 28 / edge; z *= 28 / edge; }
  F.lessonGroup = enemyGroup(rt, { faction: 'saito', fixed: true, noGuard: true, anchor: { x, z }, facing: a + Math.PI, order: 'attack', seekRange: 90, noRout: true, width: 2 }, [{ type: st.enemy, n: 1 }]);
}
function lessonEnter(rt, i) {
  const F = rt.flags, p = rt.player;
  let st = LESSONS[i];
  // 組を動かす段：稽古場には組が居ないので、自分の後ろに槍の組（四人）を呼ぶ。呼べなければ段を飛ばす
  if (st && st.squad && !(rt.squad || []).some((u) => u.alive)) {
    const a = p.yaw + (p.camYawOff || 0);
    try { rt.makeSquad({ x: p.u.pos.x - Math.sin(a) * 4, z: p.u.pos.z - Math.cos(a) * 4 }, a, [{ kind: 'spear', n: 4 }]); } catch (e) { /* 呼べなければ飛ばす */ }
  }
  while (st && st.squad && !(rt.squad || []).some((u) => u.alive)) st = LESSONS[++i];
  while (st && st.horse && !(p.canRide && p.horse)) st = LESSONS[++i];
  F.lessonI = i; F.lesson = st || null; F.lessonT = 0; F.lessonGun = p.gunLoaded;
  if (!st) {
    lessonClear(rt);
    try { localStorage.setItem(LESSON_KEY, '1'); } catch (e) { /* 覚えられなくても進む */ }
    if (F.lessonGroup && F.lessonGroup.count > 0) { F.cur = F.lessonGroup; F.wave = 0; }
    F.lessonGroup = null;
    if (!F.cur) rt.def.next.call(rt.def, rt);
    return;
  }
  F.lessonPin = null;
  // 右上の任務の一行だけ、いま覚える事に合わせる（ほかの字は出さない）
  rt.obj('dojo', st.ob, 'main');
  if (st.pin) { const a = p.yaw + (p.camYawOff || 0); F.lessonPin = { x: p.u.pos.x + Math.sin(a) * st.pin, z: p.u.pos.z + Math.cos(a) * st.pin, r: 3, enemy: false, unit: null }; const e = Math.hypot(F.lessonPin.x, F.lessonPin.z); if (e > 30) { F.lessonPin.x *= 30 / e; F.lessonPin.z *= 30 / e; } }
  if (st.horse && p.loose) F.lessonPin = { x: p.loose.x, z: p.loose.z, r: 2.5, enemy: false, unit: null };
  if (st.enemy && !(F.lessonGroup && F.lessonGroup.count > 0)) lessonEnemy(rt, st);
}
function lessonTick(rt, dt) {
  const F = rt.flags, st = F.lesson, p = rt.player;
  if (!st) return;
  F.lessonT += dt;
  F.glowT = (F.glowT || 0) - dt;
  if (F.glowT <= 0) { F.glowT = 0.25; lessonGlow(rt, st); }
  const seen = F.lessonMarks || (F.lessonMarks = {});
  let done = false;
  if (st.pin && F.lessonPin && Math.hypot(p.u.pos.x - F.lessonPin.x, p.u.pos.z - F.lessonPin.z) < 3.2) done = st.id === 'move' || (seen.run || 0) > 0.6;
  if (st.id === 'run' && (seen.run || 0) > 1.2) done = true;
  if (st.id === 'atk' && (F.kills > (F.lessonKills ?? (F.lessonKills = F.kills)) || seen.thrust)) done = true;
  if (st.id === 'guard' && (seen.guard || seen.parry)) done = true;
  if (st.id === 'gun') { if (p.weapon === 'gun' && F.lessonGun && !p.gunLoaded) done = true; F.lessonGun = p.weapon === 'gun' && p.gunLoaded; }
  if (st.id === 'mount' && p.mounted) done = true;
  if (st.id === 'cmd' && (seen.radial || seen.cmd || p.cmdOpen)) done = true;
  // 相手が倒れた段は、同じ段の相手をもう一人出す
  if (!done && st.enemy && !(F.lessonGroup && F.lessonGroup.count > 0)) lessonEnemy(rt, st);
  if (done) { for (const k of Object.keys(seen)) seen[k] = 0; F.lessonKills = null; sfxOk(); lessonEnter(rt, F.lessonI + 1); }
}
function sfxOk() { try { sfx('merit', 0.6); } catch (e) { /* 音は無くても進む */ } }
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
  missionHeading: (rt) => (rt?.flags?.lesson && !rt.flags.lesson.enemy ? '' : '▼の敵をたおせ'),
  missionSignTarget(rt) { this.missionPin(rt); return practiceEnemyAlive(rt.flags.guideEnemy) ? rt.flags.guideEnemy : null; },
  enemyTriangleSigns: true,
  hideArmyPeek: true,
  noFieldMap: true,
  noPlayerFoot: true,
  speechAllowed: () => false,
  missionPin(rt) {
    const F = rt.flags, me = rt.player.u;
    // 稽古の段：歩く・走る・馬の段は地面のピン、相手の段はその相手
    if (F.lesson && F.lessonPin) { if (F.lesson.horse && rt.player.loose) { F.lessonPin.x = rt.player.loose.x; F.lessonPin.z = rt.player.loose.z; } return F.lessonPin; }
    if (F.lesson && !F.lesson.enemy) return null;
    if (F.lesson && F.lessonGroup) { const u = F.lessonGroup.units?.find((x) => practiceEnemyAlive(x)); if (u) { const pin = F.guidePin || (F.guidePin = { x: 0, z: 0, r: 5, enemy: true, unit: null }); pin.x = u.pos.x; pin.z = u.pos.z; pin.unit = u; F.guideEnemy = u; return pin; } }
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
    // 稽古の段：はじめての人は、歩く→走る→斬る→受ける→撃つ→乗る→組を動かすを一つずつ（字は出さず、使う丸を光らせる）。
    //   一騎打ち（net_duel.js が定義を写して使う）と出世の段の試しでは出さない。一度済ませた人も出さない
    const lessons = this === dojo && rt.G?.trialStep == null && !lessonsSeen();
    if (lessons) {
      const marks = rt.flags.lessonMarks = {};
      const mark = rt.tutMark.bind(rt);
      rt.tutMark = (id) => { marks[id] = (marks[id] || 0) + (id === 'run' ? 1 / 60 : 1); return mark(id); };
      // 組への号令（短押しの「状況の一つ」や号令の札から）も、組を動かす段の済みに数える
      const P = rt.player, order = P.command.bind(P);
      P.command = (id, ...rest) => { marks.cmd = (marks.cmd || 0) + 1; return order(id, ...rest); };
      lessonStyle();
      const watch = setInterval(() => { if (window.__game?.battle !== rt || rt.over) { clearInterval(watch); lessonClear(rt); } }, 1000);
    }
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
    if (lessons) lessonEnter(rt, 0);
    else this.next(rt);
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
  update(rt, dt = 1 / 60) {
    const F = rt.flags;
    if (F.drill) drillTick(rt, F.drill);
    if (F.lesson) lessonTick(rt, dt);
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
