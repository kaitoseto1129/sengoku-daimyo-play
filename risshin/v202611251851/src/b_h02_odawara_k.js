// 北条家編 一戦目「小田原城攻め（上杉謙信）」（永禄四年〔1561〕三月・相模国 小田原）。軽い型（light_battle.js）・H3（docs/house_hojo.md ①②④⑤）
//   史実：長尾景虎（のちの上杉謙信）は関東の諸将を率いて（十万と号す）小田原城を囲み、蓮池門のあたりまで攻め入った。
//   北条氏康は城に籠もって打って出ず、支城（玉縄・江戸・河越など）は持ちこたえた。景虎は一月ほどで囲みを解いた
//   （『北条五代記』B・『小田原記』B・小田原市の解説 C。兵数は諸説・盛られた説あり）。上杉編 u04 の同じ戦の、城の内の側。
// 仕組み「狼煙の網」（字は足さない・新しい札とボタンは足さない。煙と旗と音で見せる）：
//   ①蓮池門の前で上杉の先手を受ける
//   ②東の丘の狼煙台へ走る。上杉の乱破（忍び）が台を狙ってくる。台のそばに立って守る間だけ火が育つ（本人が離れて台のそばに乱破が居座ると火が消え、台が傾く）
//   ③火が上がり切ると、遠くの丘の狼煙が東へ一つずつ続く（支城の網）。門へ戻って大寄せを受けると、東から玉縄の後詰が囲みの背後に出る。
//     火を上げ損ねると、後詰は来ない（戦は続く・負けではない）
//   ④門を開けて打って出、城下の口の上杉の先手を追う。小田原の城の絵は上杉編 u04 と同じ castles/odawara1561.js（味方の城として）
//   本物の兵は味方・敵を合わせて二百人ほどまで
import * as THREE from 'three';
import { withCastle } from './light_castle.js';
import { ODAWARA1561_PLAN } from './castles/odawara1561.js';
import { lightBattle, uS, uA, uG, uB, busho } from './light_battle.js';
import { allyGroup } from './bhelp.js';
import { dress } from './b_k_help.js';
import { sfx } from './audio.js';

const HOJO = { flag: 'hojo', armor: 0x2a2f3a };
const UESUGI = { flag: 'uesugi', armor: 0x24221f };
const GATE = { x: 20, z: 44 };          // 蓮池門の前（居館の南の口 (20,62) の外）
const SPAWN = { x: 20, z: 52 };
const BEACON = { x: 112, z: 30 };       // 東の丘の狼煙台
const TOWN = { x: 10, z: -20 };         // 城下の口（上杉の先手の陣）
// 遠くの丘の狼煙（玉縄・江戸・河越への網）。地面の外の遠景の柱（霧を受けない）
const FAR = [{ x: 230, z: 120 }, { x: 330, z: 40 }, { x: 430, z: -60 }];
const RELIEF_FROM = { x: 150, z: -24 };  // 玉縄の後詰が出る東の野

// 狼煙の柱：霧を受けない玉を縦に重ねる（玉はゆっくり昇って上で薄れ、下から生まれ直す）。絵は一つを使い回し、柱ごとに材質一つ
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
// 描く遠さ（カメラの far 150m）の外の柱は、カメラへ向けて縮めて置く（見かけの向きと大きさは同じ＝遠くの丘の煙に見える。town_sakurajima.js と同じ考え）
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

// 狼煙台：四本柱の櫓と火の籠（基本形だけ。材質は一度だけ作る）
function beaconTower(rt) {
  const W = rt.world, y = W.heightAt(BEACON.x, BEACON.z);
  const wood = new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.95 });
  const grp = new THREE.Group();
  const post = new THREE.CylinderGeometry(0.16, 0.2, 6, 6);
  for (const [dx, dz] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) { const m = new THREE.Mesh(post, wood); m.position.set(dx, 3, dz); grp.add(m); }
  const deck = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.25, 3.2), wood); deck.position.y = 5.2; grp.add(deck);
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.6, 0.9, 8), new THREE.MeshStandardMaterial({ color: 0x2a241e, roughness: 1 })); pot.position.y = 5.8; grp.add(pot);
  // 積んだ柴（火の元）
  const brush = new THREE.Mesh(new THREE.ConeGeometry(1.6, 1.6, 7), new THREE.MeshStandardMaterial({ color: 0x6b5a3a, roughness: 1 })); brush.position.set(2.6, 0.8, 0.4); grp.add(brush);
  grp.position.set(BEACON.x, y, BEACON.z);
  rt.scene.add(grp);
  return { grp, y };
}

// 火が上がり切った：遠くの丘の狼煙が東へ一つずつ続く（支城の網）。法螺と遠い鬨
function lightUp(rt) {
  const F = rt.flags, N = F.hj;
  if (N.lit || N.fallen) return;
  N.lit = true; N.prog = 1;
  sfx('hora', 1);
  rt.say('組頭', '火が上がった！　煙が東へ続くぞ！', 3);
  FAR.forEach((p, i) => rt.after(4 + i * 4, () => { N.far[i].want = 1; if (i === FAR.length - 1) rt.say('北条氏康の使番', '玉縄の狼煙が応えた！　後詰が来るぞ。門へ戻れ', 3.4); }));
}
// 台のそばに乱破が居座ると、台が傾いて火が消える（後詰は来ない）
function knockDown(rt) {
  const F = rt.flags, N = F.hj;
  if (N.lit || N.fallen) return;
  N.fallen = true; N.prog = 0;
  if (N.tower) N.tower.grp.rotation.z = 0.5;
  rt.say('組頭', '台が倒された！　……後詰は呼べぬ', 3.2);
}
// 大寄せの段：東から玉縄の後詰が囲みの背後に出る（火が上がった時だけ）
function sendRelief(rt) {
  const F = rt.flags, N = F.hj;
  if (N.relief) return;
  N.relief = true;
  if (!N.lit) { rt.say('組頭', '東に煙が上がらなんだ。わしらだけで守るぞ', 3.2); return; }
  const at = { ...RELIEF_FROM };
  const g = allyGroup(rt, { name: '玉縄の後詰', flag: HOJO.flag, anchor: at, facing: -Math.PI / 2, fullStrength: true, noRout: true, aggro: 30, seekRange: 80, morale: 95, dmgMult: 0.45, order: 'attack' },
    dress([busho('北条綱成'), uS(4), uA(14), uG(4)], HOJO));
  g.anchor = { x: GATE.x + 10, z: GATE.z - 30 };
  (F.allies || (F.allies = [])).push(g);
  sfx('hora', 1); rt.after(0.6, () => sfx('toki', 1));
  rt.say('北条綱成', '玉縄の綱成、推参！　上杉の背を突け！', 3.2);
  rt.after(3.4, () => rt.say('上杉の侍', '後ろに北条の旗！　支城から来たか！', 3));
}

// 11/25 K651（kaito「家どうしの同じ戦も一つの戦場に」）：永禄四年の小田原の地面（酒匂川・城の後ろの丘・東の狼煙台の丘・道と森）。上杉編 u04 も同じ戦場を使う（城は同じ所）
//   上杉の寄せの道（酒匂川の渡りから城下の口へ）も一本に入れた
export const ODAWARA1561_LAND = {
  seed: 1561, time: 'day', fogFar: 420, sky: { mist: true },
  river: [[-200, -96], [-80, -92], [0, -98], [100, -90], [200, -96]], riverW: 16, riverDepth: 0.5,
  hills: [[30, 110, 60, 24], [-60, 130, 60, 18], [124, 34, 40, 10]],
  paths: [{ pts: [[20, 44], [10, -20], [-10, -50], [-30, -80], [0, -150]], w: 3 }, { pts: [[20, 44], [70, 36], [112, 30]], w: 2 }],
  groves: [{ x: -60, z: 130, r: 30, n: 30 }, { x: 150, z: 70, r: 26, n: 24 }],
  trees: 400, tufts: 1800,
};

export const h02_odawara_k = withCastle(lightBattle({
  id: 'h02_odawara_k',
  date: '永禄四年（1561）三月　春・霞　相模国 小田原',
  intro: '長尾景虎が関東の諸将を集め、小田原の城を囲んだ。氏康様は城を出ない。守り抜いて、東の支城を狼煙で呼ぶ。',
  history: '永禄四年（1561）三月、長尾景虎（のちの上杉謙信）は関東の諸将とともに小田原城を囲み、蓮池門のあたりまで攻め入った。北条氏康は城に籠もって出ず、玉縄・江戸・河越などの支城も持ちこたえた。兵糧の尽きた景虎は一月ほどで囲みを解いた（兵の数は十万と号すなど諸説ある）。',
  sides: { a: { name: '北条氏康の軍', mon: 'hojo', faction: 'hojo' }, b: { name: '長尾景虎と関東の諸将', mon: 'uesugi', faction: 'uesugi' } },
  force: { a: 12000, b: 30000 },
  allyLook: HOJO, foeLook: UESUGI,
  allyDmg: 0.35,
  friendsSend: 2,
  minutes: 6,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: Math.PI },
  world: ODAWARA1561_LAND,
  allies: [
    { name: '北条氏政の旗本', at: { x: GATE.x, z: GATE.z + 12 }, fixed: true, list: [busho('北条氏政'), uS(4), uA(6)] },
    { name: '蓮池門の足軽', at: { x: GATE.x - 10, z: GATE.z + 2 }, face: Math.PI, list: [uS(2), uA(12)] },
    { name: '門の鉄砲衆', at: { x: GATE.x + 12, z: GATE.z + 4 }, face: Math.PI, list: [uS(1), uG(8)] },
    { name: '狼煙番', at: { x: BEACON.x - 4, z: BEACON.z + 4 }, face: Math.PI, list: [uS(1), uA(5)] },   // 台の番（本人が来るまで台のそばで待つ）
  ],
  steps: [
    { kind: 'rest', dur: 12, heal: 0, say: [
      ['北条氏政', '景虎は十万と号しておる。じゃが城は落ちぬ。父上は打って出ぬと決められた', 3.4],
      ['組頭', '東の丘に狼煙台がある。火が上がれば、玉縄の兵が来る', 3.2],
      ['組頭', 'まずは門じゃ。上杉の先手を、門の前で受け止めよ', 3]] },
    { kind: 'hold', at: GATE, label: '蓮池門', obj: '蓮池門の前で、上杉の先手を受け止める', r: 16, dur: 50, title: '蓮池門', sub: '上杉の先手が門へ寄せる',
      say: [['上杉の侍', '門を破れ！　氏康を引きずり出せ！', 3]],
      waves: [
        { t: 2, foes: [{ name: '上杉の先手', from: { x: GATE.x - 4, z: GATE.z - 40 }, list: [uS(3), uA(14)] }] },
        // K652⑥ 逸話の段：景虎は蓮池門の前で馬を下り、城の鉄砲に撃たれながら悠々と酒を三杯飲んで退いた（『北越軍談』C・後の軍記の逸話）。本人は門の鉄砲衆の前で、景虎の馬廻を斬って止める
        { t: 28, say: ['見張り', '門の前で白頭巾の大将が酒を飲んでおる！　景虎じゃ！'], foes: [{ name: '景虎の馬廻', from: { x: GATE.x + 14, z: GATE.z - 44 }, list: [{ type: 'samurai', n: 1, o: { name: '景虎の馬廻', horse: true } }, uS(2), uA(11)] }] },
        { t: 34, say: ['北条氏政', '鉄砲衆、景虎を撃て！　馬廻は門に寄せるな！'], foes: [] }],
      reward: '蓮池門の前で上杉の先手を受け止めた' },
    { kind: 'move', at: BEACON, label: '狼煙台', obj: '東の丘の狼煙台へ走る', r: 9, max: 100,
      say: [['北条氏政', '狼煙台へ行け！　上杉の乱破が火を消しに来るぞ', 3.2]] },
    { kind: 'hold', at: BEACON, label: '狼煙台', obj: '狼煙台のそばに立ち、乱破から守って火を上げる', r: 12, dur: 80, title: '狼煙台', sub: '乱破が台を狙う',
      say: [['組頭', '台から離れるな！　火が育つまで守れ！', 3]],
      waves: [
        { t: 3, say: ['上杉の乱破', '狼煙を上げさせるな！'], foes: [{ name: '上杉の乱破', from: { x: BEACON.x + 4, z: BEACON.z - 30 }, list: [uS(1), uA(8)] }] },
        { t: 30, say: ['見張り', '林からも乱破じゃ！'], foes: [{ name: '林の乱破', from: { x: BEACON.x + 30, z: BEACON.z + 26 }, list: [uS(1), uA(6)] }] }],
      reward: '狼煙台を乱破から守った' },
    { kind: 'hold', at: GATE, label: '蓮池門', obj: '門へ戻り、上杉の大寄せを受け止める', r: 16, dur: 60, title: '大寄せ', sub: '関東の諸将が門へ押し寄せる',
      say: [['北条氏政', '大寄せじゃ！　門を守り抜け！', 3]],
      waves: [
        { t: 4, foes: [{ name: '関東の諸将の手', from: { x: GATE.x - 10, z: GATE.z - 42 }, list: [uS(3), uA(14)] }] },
        { t: 30, say: ['見張り', '新手じゃ！　竹に雀の旗も見える！'], foes: [{ name: '上杉の新手', from: { x: GATE.x + 16, z: GATE.z - 46 }, list: [uS(2), uA(12)] }] },
        { t: 44, foes: [{ name: '上杉の三の手', from: { x: GATE.x - 2, z: GATE.z - 48 }, list: [uS(1), uA(8)] }] }],
      reward: '門で上杉の大寄せを受け止めた' },
    { kind: 'fight', at: TOWN, obj: '門を開けて打って出、城下の口の上杉の先手を追う', title: '打って出', sub: '囲みが揺らいだ',
      say: [['北条氏政', '今じゃ！　門を開けよ。城下の上杉を追い払え！', 3.2]],
      foes: [{ name: '城下の上杉の手', from: { x: TOWN.x, z: TOWN.z - 10 }, list: [{ type: 'samurai', n: 1, o: { name: '上杉の侍大将', horse: true } }, uS(3), uA(14)] }],
      later: [{ t: 30, say: ['上杉の侍', '退くな！　まだ囲みは解けておらぬ！'], foes: [{ name: '上杉の後備え', from: { x: TOWN.x - 16, z: TOWN.z - 24 }, list: [uS(2), uA(10)] }] }],
      max: 120, limit: 120, reward: '城下の口から上杉を追った' },
    // K652② 足した段（11/25 Sanae・史実の流れの続き）
    { kind: 'rest', dur: 8, heal: 0.35, say: [
      ['使番', '上杉の先手が崩れた！　されど関東の諸将の新手が城下へ戻って来まする', 3.4],
      ['組頭', '城下の口を渡すな。ここで押し返す', 3]] },
    { kind: 'hold', at: TOWN, label: '城下の口', obj: '城下の口で、取り返しに来る関東の諸将の新手を受け止める', r: 16, dur: 70, title: '取り返し', sub: '成田・太田の兵が城下へ押し戻す',
      say: [['北条氏康', '一歩も退くな。もう一度押し返せば、囲みは解ける', 3.2]],
      waves: [
        { t: 3, say: ['関東の侍', '城下を取り返せ！'], foes: [{ name: '関東の諸将の新手', from: { x: TOWN.x - 8, z: TOWN.z - 40 }, list: [{ type: 'samurai', n: 1, o: { name: '成田の組頭' } }, uS(3), uA(16)] }] },
        { t: 34, say: ['見張り', '西の道からも来る！'], foes: [{ name: '西の道の寄せ手', from: { x: TOWN.x - 44, z: TOWN.z - 20 }, list: [uS(2), uA(12), uB(3)] }] }],
      reward: '城下の口を取り返させなかった' },
    { kind: 'rest', dur: 8, heal: 0.3, say: [
      ['使番', '景虎は囲みを解き、鎌倉へ退く由！', 3],
      ['北条氏康', '深追いはせぬ。じゃが川の岸の殿は叩いておけ', 3.2]] },
    { kind: 'fight', at: { x: -40, z: -78 }, limit: 140, obj: '酒匂川の岸で、退く上杉の殿を崩す', title: '酒匂川', sub: '上杉の殿が川を背に構える',
      say: [['組頭', '川を背にした殿じゃ。押せば崩れる！', 3]],
      foes: [{ name: '上杉の殿', from: { x: -46, z: -88 }, list: [busho('上杉の殿の侍大将', { mustLive: false, invuln: false }), uS(4), uA(18), uG(3)] }],
      later: [{ t: 30, say: ['上杉の侍', '殿を見捨てるな！　引き返せ！'], foes: [{ name: '引き返した上杉の兵', from: { x: -90, z: -86 }, list: [uS(2), uA(10)] }] }],
      reward: '酒匂川の岸で上杉の殿を崩した' },
  ],
  setup(rt) {
    const F = rt.flags, W = rt.world;
    const tower = beaconTower(rt);
    F.hj = { prog: 0, harm: 0, lit: false, fallen: false, relief: false, tower,
      near: column(rt, BEACON.x, BEACON.z, tower.y + 6, 50),
      far: FAR.map((p) => Object.assign(column(rt, p.x, p.z, (W.heightAt(Math.min(250, p.x), p.z) || 0) + 8, 90, 2.4), { want: 0 })) };
  },
  update(rt, dt) {
    const F = rt.flags, N = F.hj;
    if (!N) return;
    dt = dt || 0;
    // 狼煙台の段（hold の二つ目＝F.step 2 の間）：本人が台のそばに居る間だけ火が育つ。乱破が台に居座ると台が傾く
    if (F.step === 2 && !N.lit && !N.fallen && !F.ending) {
      const P = rt.player?.u;
      let foeNear = 0;
      for (const u of rt.army.units) {
        if (!u.alive || u.gone || u.team === 0 || u.fleeing) continue;
        if (Math.hypot(u.pos.x - BEACON.x, u.pos.z - BEACON.z) < 6 && ++foeNear >= 2) break;
      }
      const me = P?.alive && Math.hypot(P.pos.x - BEACON.x, P.pos.z - BEACON.z) < 16;
      // 台の番（狼煙番）が台のそばに残っていれば、本人が乱破を払いに出ている間も火はゆっくり育つ（乱破が居座らない間だけ）
      let ban = false;
      if (!me && !foeNear) for (const g of F.allies || []) if (g?.name === '狼煙番' && g.units.some((u) => u.alive && Math.hypot(u.pos.x - BEACON.x, u.pos.z - BEACON.z) < 10)) { ban = true; break; }
      if (me) { N.prog = Math.min(1, N.prog + dt / (foeNear ? 48 : 26)); N.harm = Math.max(0, N.harm - dt); }
      else if (ban) N.prog = Math.min(1, N.prog + dt / 70);
      else if (foeNear >= 2) { N.harm += dt; N.prog = Math.max(0, N.prog - dt / 20); }
      if (N.harm > 30) knockDown(rt);
      else if (N.prog >= 1) lightUp(rt);
    }
    // 狼煙台の段が終わった時に火が育ち切っていなければ、後詰は来ない（倒れたのではなく、間に合わなかった）
    if ((F.step || 0) >= 3 && !N.lit && !N.fallen && !N.late) { N.late = true; }
    // 大寄せの段の二十秒目に、東から後詰（火が上がった時だけ）
    if (F.step === 3 && !N.relief) { N.reliefT = (N.reliefT || 0) + dt; if (N.reliefT > 20) sendRelief(rt); }
    // 煙：台の柱は火の育ちに合わせて、遠くの柱は順に濃く
    N.near.a = N.fallen ? Math.max(0, N.near.a - dt * 0.3) : N.lit ? Math.min(1, N.near.a + dt * 0.3) : N.prog * 0.5;
    const cam = rt.camera?.position;
    columnTick(N.near, dt, cam);
    for (const c of N.far) { c.a = Math.min(c.want, c.a + dt * 0.12); columnTick(c, dt, cam); }
  },
  win: {
    banner: '小田原を守り抜いた', sub: '景虎は囲みを解いて去った', award: '小田原城で上杉の大軍を凌いだ',
    say: [['北条氏政', '景虎の陣が退いていく。城は落ちなんだ', 3.2],
      ['北条氏康', '城は守り、支城は応える。これが北条の戦じゃ', 3.4],
      ['北条氏政', '門の前で酒を飲んだ景虎に、玉は一つも当たらなんだ……恐ろしき男よ', 3.2],
      ['組頭', '狼煙台の火を落とせ。今宵はよう眠れるぞ', 3]],
  },
}), { plan: ODAWARA1561_PLAN, at: { x: 0, z: 0 }, lift: 0, team: 0, life: false });
export default h02_odawara_k;
