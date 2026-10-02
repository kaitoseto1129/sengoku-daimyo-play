// ======================================================================
// 織田家編　本能寺の変（天正十年六月二日）
// 夜明け前、明智光秀の一万余りの兵が京の本能寺を囲んだ。信長はわずかな供と戦い、奥に火をかけて自害した。
// 妙覚寺にいた嫡男・信忠は二条御所に移って戦い、ここでも自害した。
// 足軽（近習寄り）の流れ（kaito 10/2「寺の中で信長と一緒に戦いたい」）：本能寺の御殿に詰める者として、甲冑を着ない小袖の信長のそばで、
// 表門→本堂→御殿の奥へ退きながら戦い、退路を開いて信長を奥へ移す。最後は史実どおり本能寺は落ち、信長の命で裏門から出て二条御所へ
// 境内の形は honno_tera.js（docs/honnoji-1582-spec.md）。この戦だけ馬には乗れない（def.noHorse）
// 信長で遊ぶ時（G.lord）は別の流れ（下の lordSetup〜）：境内の奥から、囲みを破って落ちのびる
// 向き：京の町の碁盤の目。南西（-x, +z）に本能寺、北東（+x, -z）に二条御所
// ======================================================================
import * as THREE from 'three';
import { nobori, hut, campfire, kabukimon, tawara, tsuiji, solidSeg, makeKitBatch, finalizeKitBatch, makeSimpleBatch, finalizeSimpleBatch } from './props.js';
import { buildTera, teraTick, breakNear, hallAt, TERA, inTera, GATES, CLIMB, PT } from './honno_tera.js';
import { flagTexture } from './textures.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { moraleWord } from './hud.js';
import { gauss, enemyGroup, allyGroup, nm, centerOf, unitPos, wallLine } from './bhelp.js';
import { applyLook, DAWN, dress, gone } from './b_inabayama.js';
import { KIT } from './b_nagashinojo.js';
import { volleyAt } from './b_tano.js';
import { camp } from './b_mid.js';
import { depthStart, depthTick, depthBot, rest, pick, fight, hold } from './b_depth.js';
import { Garan, makeTempleFire } from './temple1571.js';
// 足軽大将候補より上（信長で遊ぶ時は除く）：任務の文を「一手を預かる」者の役目に
const HI = (rt) => !rt.G.lord && (rt.G.rank || 0) >= 3;

// 本能寺の位置：今の寺町御池でなく、1582年は油小路蛸薬師の一帯（今の元本能寺町）。HIST_B（推定復元）
// 大伽藍・宿坊30余の想定。近くは本物（下の HONNO_BUILDINGS・buildHonno）、遠くは addDistantArmy 等の軽い作りで賑わいだけ足す
const HONNO = { x: -54, z: 54, h: 16 };     // 本能寺（築地の囲いの真ん中と、半分の幅）
const NIJO = { x: 54, z: -54, h: 17 };      // 二条御所
const START = { x: 14, z: 27 };              // 宿所の前
const HONNO_GATE = { x: HONNO.x + HONNO.h, z: HONNO.z };      // 本能寺の東の門
const NIJO_GATE = { x: NIJO.x - NIJO.h, z: NIJO.z };          // 二条御所の西の門
const NIJO_BACK = { x: NIJO.x, z: NIJO.z - NIJO.h };          // 二条御所の北の口（落ちる口）
const OUT = { x: NIJO.x + 4, z: -118 };                        // 落ちのびる先（北の町はずれ）
const STREETS = [-81, -27, 27, 81];         // 通りの筋（東西・南北とも。町と町の間を通る）
const ODA = { flag: 'oda' };
const AKECHI = { flag: 'akechi' };

// 井戸・木戸（蛸薬師通り一帯の細い路地の雰囲気。町家の合間に少しだけ。軽い形で当たりは取らない）
function well(W, x, z) {
  const y = W.heightAt(x, z), g = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial({ color: 0x7e7a70, roughness: 0.95 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x5a4230, roughness: 0.9 });
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.65, 0.5, 10), stone); ring.position.y = 0.25; g.add(ring);
  for (const sx of [-1, 1]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.4, 6), wood); p.position.set(sx * 0.6, 0.95, 0); g.add(p); }
  const roof = new THREE.Mesh(new THREE.ConeGeometry(0.9, 0.5, 4), wood); roof.position.y = 1.7; roof.rotation.y = Math.PI / 4; g.add(roof);
  g.position.set(x, y, z); g.traverse((o) => { o.castShadow = true; });
  return g;
}
function kido(W, x, z, rot = 0) {
  const y = W.heightAt(x, z), g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color: 0x4a3a28, roughness: 0.9 });
  for (const sx of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.2, 0.18), m); p.position.set(sx * 1.1, 1.1, 0); g.add(p); }
  const top = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.18, 0.18), m); top.position.y = 2.15; g.add(top);
  g.position.set(x, y, z); g.rotation.y = rot; g.traverse((o) => { o.castShadow = true; });
  return g;
}

function height(x, z) {
  // 京の町はほぼ平ら。まわりに東山・北山・西山
  let h = 0.15 * Math.sin(x * 0.05) * Math.cos(z * 0.04);
  h += 40 * gauss(x, z, 300, -40, 16000) + 40 * gauss(x, z, -40, -320, 20000) + 36 * gauss(x, z, -320, 60, 16000);
  return h;
}

// 四角の囲い（門の口を一つ空ける）。side：'e'|'w'|'n'|'s'
// batch を渡すと、築地塀の区画ごとの形を材質別に積むだけにして（描画は呼び手の finalizeKitBatch で一括）、
// 寺・御所二つ分の塀（区画数が多い）の描く回数を減らす
function compound(rt, c, gateSide, gw = 7, batch = null) {
  const { x, z, h } = c;
  const E = [[x + h, z + h], [x + h, z - h]], Wl = [[x - h, z - h], [x - h, z + h]], N = [[x + h, z - h], [x - h, z - h]], S = [[x - h, z + h], [x + h, z + h]];
  const sides = { e: E, w: Wl, n: N, s: S };
  const out = [];
  const wo = { team: 0, hp: 1e9, name: '築地塀', segLen: 6, mesh: tsuiji, meshOpt: batch ? { batch } : undefined };
  for (const [k, [[ax, az], [bx, bz]]] of Object.entries(sides)) {
    if (k === gateSide || k === c.back) {
      const mx = (ax + bx) / 2, mz = (az + bz) / 2, L = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / L, uz = (bz - az) / L;
      const g2 = (k === gateSide ? gw : 4) / 2;
      out.push(...wallLine(rt, [[ax, az], [mx - ux * g2, mz - uz * g2]], wo));
      out.push(...wallLine(rt, [[mx + ux * g2, mz + uz * g2], [bx, bz]], wo));
    } else out.push(...wallLine(rt, [[ax, az], [bx, bz]], wo));
  }
  for (const s of out) { s.noTarget = true; s.wall = true; s.h = 2.6; }
  return out;
}

// 本能寺の伽藍（temple1571.js の Garan・makeTempleFire を使い回す：建物ごとに燃え、近い棟へ少しずつ燃え移る）。
// 本堂・祖師堂系の堂・客殿・庫裏・宿坊・倉。30余の宿坊は全部作らず、近くは本物（sobo・do・kuri・kura）、
// 外れは軽い作り（lite）で賑わいだけ足す（HIST_B：個々の配置は推定）
const HONNO_BUILDINGS = [
  { id: 'hondo', kind: 'do', x: HONNO.x - 3, z: HONNO.z - 2, w: 13, d: 9, rot: Math.PI / 2, h: 3.8 },      // 本堂
  { id: 'soshido', kind: 'do', x: HONNO.x + 6, z: HONNO.z - 10, w: 8, d: 6, rot: 0, h: 3.6 },               // 祖師堂系の堂
  { id: 'kyakuden', kind: 'do', x: HONNO.x - 6, z: HONNO.z + 10, w: 9, d: 6, rot: 0, h: 3.6 },               // 客殿
  { id: 'kyakuden2', kind: 'do', x: HONNO.x + 6, z: HONNO.z - 3, w: 6, d: 5, rot: 0, h: 3 },                 // 客殿（小）
  { id: 'kuri', kind: 'kuri', x: HONNO.x + 6, z: HONNO.z + 8, w: 6, d: 5, rot: 0 },                          // 庫裏
  { id: 'sobo1', kind: 'sobo', x: HONNO.x + 12, z: HONNO.z - 3, w: 5, d: 5, rot: 0, var: 0 },                // 宿坊
  { id: 'sobo2', kind: 'sobo', x: HONNO.x + 12, z: HONNO.z + 8, w: 5, d: 5, rot: 0, var: 1 },                // 宿坊
  { id: 'kura', kind: 'kura', x: HONNO.x + 9, z: HONNO.z + 13, w: 4, d: 4, rot: 0 },                         // 倉
  // 遠くに見える宿坊（30余の残り。軽い作り・当たりも影も無し）
  { id: 'sobo_f1', kind: 'lite', x: HONNO.x - 11, z: HONNO.z - 6, w: 4, d: 4, var: 0, lite: true, dist: 'far' },
  { id: 'sobo_f2', kind: 'lite', x: HONNO.x - 11, z: HONNO.z + 3, w: 4, d: 4, var: 1, lite: true, dist: 'far' },
  { id: 'sobo_f3', kind: 'lite', x: HONNO.x - 2, z: HONNO.z + 13.5, w: 4, d: 3.5, var: 2, lite: true, dist: 'far' },
  { id: 'sobo_f4', kind: 'lite', x: HONNO.x + 2, z: HONNO.z + 13.5, w: 4, d: 3.5, var: 0, lite: true, dist: 'far' },
];
function buildHonno(rt) {
  const F = rt.flags;
  const G = new Garan(rt);
  for (const b of HONNO_BUILDINGS) G.build({ dist: 'near', ...b });
  G.finish();
  F.honG = G;
  F.fire = makeTempleFire(rt, G, {
    onBurnt: (r) => { if (!F.ending) rt.bark(`${r.id === 'hondo' ? '本堂' : '伽藍の一棟'}が焼け落ちた`); },
  });
  return G;
}

// ---------------- 足軽の流れ：本能寺の内で、信長と共に戦う（docs/honnoji-1582-spec.md） ----------------
// 自分は御殿に詰める近習寄りの足軽。信長（甲冑なし・白い小袖・帯刀）のすぐそばで、門前→本堂→御殿の奥へ退きながら戦い、
// 退路を開いて信長を奥へ移す。最後は史実どおり本能寺は落ち、信長の命で裏門から落ちて二条御所（信忠）へ走る（第二幕）。
// P1 静かな寺 → P2 異変 → P3 門前防衛 → P4 本堂へ退く → P5 信長と共闘 → P6 別棟へ移る → P7 最終防衛 → P8 終局 → 二条御所
// 火は段で進む（1 表の宿坊 → 2 回廊 → 3 煙 → 4 本堂・宿坊（道が塞がる）→ 5 見通しが悪い → 6 御殿の広間（守る所が狭まる））
// 明智は入口ごとの隊で時間差に来る。どれも築地の外（見えない所）に湧き、門・乗り越え口・勝手口から入る
const IN = {
  main: [[-22, 50], [-30, 50], [-35, 50]],
  side: [[-48, 21], [-48, 29], [-48, 35]],
  climb: [[-66, 21], [-66, 29], [-66, 35]],
  ura: [[-88, 76], [-78, 76], [-73.5, 76]],
  katte: [[-47, 113], [-47, 104], [-47, 99]],
};
const HONDO_IN = { x: -51.5, z: 46 };       // 本堂の外陣
const HONDO_FRONT = { x: -45.6, z: 46 };    // 本堂の東の縁
// 本堂から御殿へ移る道（燃えている物が道にあれば選べない）
const MOVES = {
  watari: { name: '渡り廊下を行く', note: '近い。ただ火が本堂から移りやすい', burn: ['watari'], pts: [[-55, 47], [-56, 49], [-57, 50.6], [-61.5, 50.6], [-62.4, 47.2], [-63.8, 46], [-66, 47], [-68, 51], [-68, 70], [-68, 79], [-68, 80.6], [-68, 82.2], [-64, 86], [-61, 89]] },
  niwa: { name: '中庭を突っ切る', note: '開けていて速い。ただ鉄砲に撃たれやすい', burn: ['kairo2'], pts: [[-50, 49], [-50, 51], [-50, 54], [-51, 66], [-52, 75], [-52, 80], [-52, 82.2], [-54, 86], [-55, 89]] },
  urate: { name: '裏手を回る', note: '遠回り。細い道で、少しずつしか来られない', burn: [], pts: [[-52, 44], [-52, 41.5], [-52, 38], [-62, 37], [-70, 38], [-70.5, 50], [-70.5, 70], [-70.5, 79], [-71, 80.6], [-71, 82.2], [-67, 86], [-63, 89]] },
  shukubo: { name: '宿坊を抜ける', note: '狭い部屋を抜ける。火が迫っている', burn: ['shukuboA'], pts: [[-48, 46], [-44, 50], [-40, 58], [-35.5, 64.5], [-35.5, 68.5], [-38.5, 70], [-41, 70], [-44, 71.5], [-46.5, 80], [-47.5, 88], [-50.5, 88], [-55, 89]] },
  kairo: { name: '回廊を行く', note: '屋根があり守りやすい。詰まりやすい', burn: ['kairo1', 'kairo2'], pts: [[-48, 49.4], [-45.5, 53], [-45, 58], [-45, 70], [-45.5, 77], [-52, 77.5], [-52, 80], [-52, 82.2], [-55, 86], [-57, 89]] },
};
// 御殿の口（最終防衛で明智が入ってくる所）
const GOTEN_IN = {
  north: [[-52, 72], [-52, 80], [-52, 82.2], [-54, 86]],
  east: [[-44, 88], [-48, 88], [-50.5, 88], [-53, 88.5]],
  south: [[-61, 101], [-61, 96.5], [-61, 93]],
  west: [[-76, 86], [-75, 90], [-72, 90], [-70, 90]],
};
const NBK = { A: 1.6, B: 4, C: 7.5, D: 5, E: 5.5 };   // 信長の間合い（状態ごと）

function nbSet(rt, st, o = {}) {
  const F = rt.flags, g = F.nbG;
  if (!g || !F.nb || !F.nb.alive) return;
  F.nbSt = st; F.nbGoal = null;
  g.aggro = NBK[st];
  if (st === 'D') {
    g.order = 'path'; g.path = o.pts.map((p) => [p[0], p[1]]); g.pathIdx = 0; g.speed = 3.3;
    const last = o.pts[o.pts.length - 1];
    F.nbGoal = { x: last[0], z: last[1] }; F.nbDT = rt.t;
    g.onArrive = () => { nbSet(rt, o.then || 'E', { at: F.nbGoal }); if (o.done) o.done(); };
  } else { g.order = 'hold'; g.anchor = { x: o.at.x, z: o.at.z }; g.onArrive = null; if (o.facing != null) g.facing = o.facing; }
}
const nbSay = (rt, s, t = 3) => rt.say('織田信長', s, t);
// 明智の一隊。from：築地の外の湧く所。path：入って来る道（門・乗り越え口）。gate：先に打ち破る門
function akechi(rt, name, path, list, o = {}) {
  const F = rt.flags;
  if (F.ending) return null;
  if (rt.army.units.filter((u) => u.alive && u.team === 1).length > (o.cap || 64)) return null;
  const at = { x: path[0][0], z: path[0][1] };
  const g = enemyGroup(rt, { faction: 'saito', name, anchor: at, facing: Math.atan2(-54 - at.x, 66 - at.z), width: o.width || 4, aggro: o.aggro || 9, morale: 100, noRout: true, fleeDir: { x: 0, z: 0 }, dmgMult: o.dmg ?? 0.92, order: 'attack', seekRange: 22 },
    dress(list, AKECHI));
  for (const u of g.units) if (u.type === 'gun') u.dmg *= 0.5;
  if (o.gate && o.gate.alive) { g.order = 'assault'; g.assault = hitGate(o.gate); g.gate = o.gate; g.seekRange = 140; }
  else if (o.hold) { g.order = 'hold'; g.anchor = { ...at }; g.aggro = o.aggro || 30; }
  else { g.order = 'path'; g.path = path.slice(1).map((p) => [p[0], p[1]]); g.pathIdx = 0; g.onArrive = (gg) => { gg.order = 'attack'; gg.seekRange = o.seek || 24; if (o.nb && F.nb && F.nb.alive) gg.focus = F.nb; }; }
  if (o.nb && F.nb && F.nb.alive && g.order !== 'path') g.focus = F.nb;
  F.foes.push(g);
  rt.army.play('eshout', at, 1.2);
  return g;
}
const uS = (n) => ({ type: 'samurai', n }), uA = (n) => ({ type: 'ashigaru', n }), uG = (n) => ({ type: 'gun', n }), uB = (n) => ({ type: 'bow', n });
// 門の扉（開いた二枚の扉。閉めると army の struct になる）
function openLeaves(W, x, z, w) {
  const g = new THREE.Group(), mat = new THREE.MeshStandardMaterial({ color: 0x4a3626, roughness: 0.9 });
  for (const sd of [-1, 1]) { const m = new THREE.Mesh(new THREE.BoxGeometry(w / 2 - 0.1, 3, 0.18), mat); m.position.set(-w / 4 - 0.1, 1.5, sd * (w / 2 - 0.1)); m.castShadow = true; g.add(m); }
  g.position.set(x, W.heightAt(x, z), z);
  return g;
}
function closeGate(rt, by) {
  const F = rt.flags, W = rt.world, gm = GATES.main;
  if (F.gMain) return;
  F.gMain = rt.army.addStruct({ seg: [gm.x, gm.z - gm.w / 2, gm.x, gm.z + gm.w / 2], hp: 1500, maxHp: 1500, armor: 0.5, team: 0, name: '表門' });
  F.gMain.mesh = gateDoors(W, gm.x, gm.z, gm.w, 0); rt.scene.add(F.gMain.mesh);
  if (F.leaves) F.leaves.visible = false;
  rt.uninteract('gate');
  rt.army.play('wood', gm, 1.2);
  // 閉める時に門の口にいた明智の者は、外へ押し出す
  for (const u of rt.army.units) if (u.alive && u.team === 1 && Math.abs(u.pos.x - gm.x) < 1.2 && Math.abs(u.pos.z - gm.z) < gm.w / 2 + 0.5) u.pos.x = gm.x + 1.6;
  if (by === 'me') { rt.award((t) => t.side.push('表門を閉めた'), '表門を閉めた'); rt.say('森蘭丸', 'よう閉めた！　閂を下ろせ！', 2.5); }
  else rt.say('門番', '閂を下ろした！　門を押さえよ！', 2.5);
}
function smallGate(rt, gd, hp) {
  const s = rt.army.addStruct({ seg: gd.side === 'n' || gd.side === 's' ? [gd.x - gd.w / 2, gd.z, gd.x + gd.w / 2, gd.z] : [gd.x, gd.z - gd.w / 2, gd.x, gd.z + gd.w / 2], hp, maxHp: hp, armor: 0.5, team: 0, name: gd.name });
  s.mesh = gateDoors(rt.world, gd.x, gd.z, gd.w, gd.side === 'n' || gd.side === 's' ? Math.PI / 2 : 0); rt.scene.add(s.mesh);
  return s;
}
// 火の段（1〜6）
function fireStage(rt, n) {
  const F = rt.flags, T = F.T, W = rt.world;
  if ((F.fireSt || 0) >= n) return;
  F.fireSt = n;
  const ig = (id, why) => T.fire.ignite(id, why);
  if (n === 1) { ig('soboN', '明智方の火矢'); rt.bark('火矢じゃ！　表の宿坊に火がついた', true); }
  if (n === 2) { ig('kairo1', '火矢'); rt.bark('火が回廊へ移った。回廊はじきに通れなくなる', true); }
  if (n === 3) { F.smoke = 1; W.distMul = F.dm0 * 0.7; rt.bark('煙が境内に広がる。遠くが見えぬ'); }
  if (n === 4) { ig('hondo', '明智方の火'); ig('kairo2'); ig('shukuboA'); rt.bark('本堂に火が回った！　宿坊も燃えている', true); }
  if (n === 5) { F.smoke = 2; W.distMul = F.dm0 * 0.42; rt.bark('煙で、敵と味方の見分けがつかぬ'); }
  if (n === 6) {
    // 御殿の東の広間に火が入る：広間は熱で入れず、守る所は控えの間と居室だけになる
    F.heatZone = { x0: -57, x1: -49, z0: 83.2, z1: 95 };
    for (const [x, z] of [[-53, 86], [-51, 92], [-55, 93]]) W.addFire(x, z, { size: 1.6, h: 0.3 });
    W.addSmokeColumn(-53, 6, 89, { size: 2.5 });
    solidSeg(-57, 88.1, -57, 89.9, 0.12);   // 広間と控えの間の間の口は火で塞がる
    rt.bark('広間に火が入った！　控えの間まで退け', true);
  }
}
function teleport(rt, x, z) {
  const P = rt.player.u, W = rt.world, dx = x - P.pos.x, dz = z - P.pos.z;
  for (const g of rt.squadGroups || []) { for (const u of g.units) if (u.alive) { u.pos.x += dx; u.pos.z += dz; u.pos.y = W.heightAt(u.pos.x, u.pos.z); u.moveTo = null; u.target = null; } if (g.anchor) { g.anchor.x += dx; g.anchor.z += dz; } }
  for (const u of rt.tomoUnits || []) if (u.alive) { u.pos.x += dx; u.pos.z += dz; u.pos.y = W.heightAt(u.pos.x, u.pos.z); u.moveTo = null; u.target = null; }
  P.pos.x = x; P.pos.z = z; P.pos.y = W.heightAt(x, z);
}

const honnoji = {
  spawn: { x: PT.start.x, z: PT.start.z, heading: Math.PI / 2 },
  noHorse: true,   // 本能寺の変だけは馬に乗れない（kaito 10/2。寺の中で戦う）
  world: {
    seed: 1582 + 6,
    time: 'dusk',
    muddy: 0.1,
    // 東西の通り（z=81）は、本能寺の境内（南へ広い）の所だけ切る
    paths: [...STREETS.map((s) => [[s, -170], [s, 170]]), ...STREETS.filter((s) => s !== 81).map((s) => [[-170, s], [170, s]]), [[-170, 81], [-84, 81]], [[-24, 81], [170, 81]]],
    height,
    tint(x, z, h, c) {
      // 境内は白っぽい砂利、町は土の道
      // 境内は掃き清めた白っぽい砂利（草は生えない：色から草の割合を読むので緑を残さない）
      if (inTera(x, z)) { const v = 0.55 + 0.03 * Math.sin(x * 0.7) * Math.cos(z * 0.9); c.setRGB(v + 0.02, v, v - 0.05); return; }
      const onSt = STREETS.some((s) => Math.abs(x - s) < 4 || Math.abs(z - s) < 4);
      if (onSt) c.lerp({ r: 0.52, g: 0.47, b: 0.38 }, 0.5);
    },
    clear: (x, z) => Math.abs(x) < 130 && Math.abs(z) < 150,
    trees: 160,
    tufts: 1400,
    treeDensity: (x, z) => (Math.abs(x) < 140 && Math.abs(z) < 160 ? 0.02 : 0.6),
    groves: [{ x: HONNO.x - 6, z: HONNO.z + 8, r: 6, n: 6 }, { x: NIJO.x + 6, z: NIJO.z + 6, r: 6, n: 6 }],
    fleeOut: (x, z, team) => team === 1 && (Math.abs(x) > 120 || Math.abs(z) > 140),
  },

  setup(rt) {
    // 馬には乗れない（信長で遊ぶ時も）。降ろして、空馬も取らせない
    const P0 = rt.player;
    if (P0.mounted) { rt.army.setMounted(P0.u, false); P0.mounted = false; }
    P0.canRide = false; P0.updateTake = () => {};
    if (rt.G.lord) { this.lordSetup(rt); return; }
    const W = rt.world;
    const F = rt.flags;
    F.step = 0; F.hp = 0; F.ek = 0; F.ak = 0; F.foes = []; F.dm0 = W.distMul || 1;
    F.bossName = '森蘭丸';   // 寺の中の上役（褒め・叱りの声）。二条御所では信忠
    // ---- 京の町並み：通りに面して町屋を並べる（境内と二条御所の中は空ける） ----
    const inCompound = (x, z) => inTera(x, z, 6) || (Math.abs(x - NIJO.x) < NIJO.h + 8 && Math.abs(z - NIJO.z) < NIJO.h + 8);
    // 町屋が何十も並ぶ所なので、材質ごとの BatchedMesh にまとめて描く回数を減らす
    const hutBatch = makeSimpleBatch();
    let k = 0;
    for (const sx of [-54, 0, 54]) for (const sz of [-54, 0, 54]) {
      for (const [dx, dz, r] of [[-14, -20, 0], [0, -20, 0], [14, -20, 0], [-14, 20, Math.PI], [0, 20, Math.PI], [14, 20, Math.PI], [-20, -6, Math.PI / 2], [-20, 8, Math.PI / 2], [20, -6, -Math.PI / 2], [20, 8, -Math.PI / 2]]) {
        const x = sx + dx, z = sz + dz;
        if (inCompound(x, z)) continue;
        hut(W, x, z, 7 + (k % 3), 5, r + Math.PI, { wall: k % 2 ? 0x6e5a40 : 0x7b6448, h: 2.4, batch: hutBatch });
        k++;
      }
    }
    rt.scene.add(well(W, -8, 62), kido(W, -27, 40, Math.PI / 2), well(W, -74, 57));
    // ---- 本能寺の境内（築地・門・伽藍・中のある建物）と二条御所 ----
    F.T = buildTera(rt);
    F.leaves = openLeaves(W, GATES.main.x, GATES.main.z, GATES.main.w); rt.scene.add(F.leaves);
    F.gSide = smallGate(rt, GATES.side, 900);
    F.gKatte = smallGate(rt, GATES.katte, 700);
    NIJO.back = 'n';
    // 二条御所の塀も材質ごとの BatchedMesh にまとめ、描く回数を減らす
    const wallBatch = makeKitBatch();
    F.nwall = compound(rt, NIJO, 'w', 7, wallBatch);
    finalizeKitBatch(rt, wallBatch);
    rt.scene.add(kabukimon(W, NIJO_GATE.x, NIJO_GATE.z, 7.4, Math.PI / 2));
    hut(W, NIJO.x + 2, NIJO.z - 2, 16, 11, 0, { h: 3.6, wall: 0x7a6a50, roof: 0x3a3430, batch: hutBatch });
    hut(W, NIJO.x - 6, NIJO.z + 10, 8, 5, 0, { batch: hutBatch });
    finalizeSimpleBatch(rt, hutBatch);
    for (const [x, z] of [[NIJO.x - 10, NIJO.z - 6], [NIJO.x - 10, NIJO.z + 6], [NIJO.x + 10, NIJO.z + 10]]) rt.scene.add(nobori(W, x, z, 'oda', 6));
    rt.scene.add(nobori(W, -44, 56, 'oda', 5), nobori(W, -47.5, 88, 'eiraku', 4.5));
    // ---- 外周を封じる明智の大軍（軽い作り）。築地の外の通りを埋める ----
    const DA = (x, z, w, d, count, facing, seed) => W.addDistantArmy({ x, z, w, d, count, facing, armor: 0x2a2a30, team: 1, flagTex: flagTexture('akechi'), seed });
    F.aHost = [DA(-54, 23, 40, 4, 150, 0, 1586), DA(-86, 67, 4, 56, 200, Math.PI / 2, 1587), DA(-54, 117, 44, 10, 220, Math.PI, 1588), DA(-24.5, 72, 3.5, 30, 120, -Math.PI / 2, 1589), DA(-14, 44, 12, 14, 160, -Math.PI / 2, 1590)];
    F.ehon = camp(rt, { x: -104, z: 120, facing: Math.PI * 0.75, team: 1, faction: 'saito', mon: 'akechi', armor: 0x2a2a30, general: { name: '明智光秀', hat: 'kabuto_m', haori: 0x3a3a5a }, guard: 12, reserve: 120, runTo: { x: -86, z: 100 } });
    for (const [x, z] of [[-24, 40], [-24, 62], [-82, 50], [-82, 95], [-60, 112], [-40, 22]]) W.addFire(x, z, { torch: true, h: 1.4 });
    for (const [x, z] of [[-20, 56], [-84, 60], [-50, 114], [-62, 22]]) rt.scene.add(nobori(W, x, z, 'akechi', 6));
    // ---- 寺の中の者：信長・小姓衆・馬廻と中間・僧 ----
    F.nbG = allyGroup(rt, { name: '織田信長', anchor: { ...PT.nbRoom }, facing: Math.PI / 2, width: 1, aggro: NBK.A, noRout: true, fullStrength: true },
      [{ type: 'busho', n: 1, o: { name: '織田信長', kosode: 1, kosodeCol: 0xebe5d6, obi: 0x2e3448, flag: null, horse: false, keep: true } }]);
    F.nb = F.nbG.units[0];
    F.nb.maxHp = F.nb.hp = 1100; F.nb.dmg = 12;
    F.nbG.defMult = 1.4;
    F.kosho = allyGroup(rt, { name: '森蘭丸と小姓衆', anchor: { x: PT.hikae.x, z: PT.hikae.z }, facing: Math.PI / 2, width: 3, aggro: 7, noRout: true, fullStrength: true },
      [{ type: 'samurai', n: 1, o: { name: '森蘭丸', kosode: 1, kosodeCol: 0xd9d0bc, obi: 0x6a2a24, flag: null, horse: false } },
        { type: 'samurai', n: 1, o: { name: '森坊丸', kosode: 1, kosodeCol: 0x3a4458, flag: null, horse: false } },
        { type: 'samurai', n: 1, o: { name: '森力丸', kosode: 1, kosodeCol: 0x4a4038, flag: null, horse: false } },
        { type: 'samurai', n: 2, o: { kosode: 1, kosodeCol: 0x2e3a4a, flag: null, keep: true } }]);
    F.kosho.defMult = 1.35;
    F.ran = F.kosho.units[0];
    F.uma = allyGroup(rt, { name: '馬廻と中間', anchor: { x: PT.gateIn.x - 2, z: PT.gateIn.z }, facing: Math.PI / 2, width: 6, aggro: 8, noRout: true, fullStrength: true },
      dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 3, o: { keep: true } }, { type: 'ashigaru', n: 3, o: { kosode: 1, kosodeCol: 0x5a5244, keep: true } }], ODA));
    F.uma.defMult = 1.2;
    F.monks = allyGroup(rt, { name: '寺の僧', anchor: { x: -52, z: 62 }, facing: 0, width: 3, aggro: 0, noRout: true, fullStrength: true },
      [{ type: 'porter', n: 3, o: { kosode: 1, bozu: 1, kosodeCol: 0x2a2826, flag: null } }]);
    F.monks.civ = true;
    for (const u of F.monks.units) { u.noTarget = true; u.invuln = true; }
    // 自分の組は、狭い寺の中なので四人まで（室内に一度に入れる数を絞る）
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: -60, z: 77.5 }, Math.PI / 2, [{ kind: 'spear', n: Math.min(n, 4) }]);
    rt.army.maxAttackers = rt.army.maxAttackers + 1;
    // 敵の総大将（光秀）の仕組みは使わない：寺の中に閉じ込められた戦で、味方の組が本陣へ斬り込んで勝ちになってしまう
    rt.after(0.05, () => { rt.taisho = null; });
    applyLook(rt, DAWN);
    rt.setPhase('brief');
    this.p1(rt);
  },

  // P1 静かな寺：まだ夜明け前。表門まで見回る（寺の広さを少し知る）
  p1(rt) {
    const F = rt.flags;
    F.hp = 1; F.pT = rt.t;
    rt.say('', '天正十年六月二日　夜明け前　京 本能寺（油小路蛸薬師）', 3.5);
    rt.say('森蘭丸', `${nm(rt)}、上様はまだお休みじゃ。表門まで見回って参れ。……静かな朝じゃな`, 4.5);
    rt.obj('main', '表門まで見回れ（回廊を抜けて東へ）', 'main');
    rt.marker('next', { ...PT.gateIn }, '表門', { h: 3 });
    rt.marker('nb', unitPos(F.nb), () => `上様${F.nb.hp < F.nb.maxHp * 0.5 ? '（手負い）' : ''}`, { h: 2.3 });
    F.monks.order = 'hold';
  },
  // P2 異変：鬨の声と鉄砲。信長が起き出す
  p2(rt) {
    const F = rt.flags;
    if (F.hp >= 2) return;
    F.hp = 2; F.pT = rt.t;
    rt.setPhase('alarm');
    rt.unmark('next');
    rt.army.play('eshout', { x: -18, z: 50 }, 1.6);
    for (let i = 0; i < 6; i++) rt.after(0.4 + i * 0.3, () => rt.army.play('gun', { x: -20, z: 44 + Math.random() * 12 }, 0.8));
    rt.after(1.2, () => { sfx('bellRapid', 0.5); });
    rt.say('門番', '何者じゃ！　……桔梗の旗！　明智様の兵が、門の前に！', 3.5);
    rt.banner('明智光秀、謀反', '桔梗の旗が本能寺を囲む');
    rt.obj('main', '表門を閉めよ（門の口で長押し）', 'main');
    rt.addInteract('gate', { x: GATES.main.x - 1.5, z: GATES.main.z }, '表門を閉める', () => closeGate(rt, 'me'), { r: 4.5, hold: 1, prio: 1 });
    rt.marker('next', { x: GATES.main.x - 1, z: GATES.main.z }, '表門を閉めよ', { h: 3 });
    // 僧は勝手口の方へ逃げる
    F.monks.order = 'move'; F.monks.dest = { x: -44, z: 99 }; F.monks.speed = 3.2;
    // 信長が起き出し、回廊を抜けて表へ（B 警戒 → D 移る）
    nbSet(rt, 'B', { at: { x: -61, z: 79 } });
    F.kosho.order = 'hold';
    rt.after(3, () => { if (F.hp === 2) nbSet(rt, 'D', { pts: [[-52, 82.2], [-52, 80], [-52, 77.5], [-45.5, 77], [-45, 64], [-44, 54], [-40, 50]], then: 'C' }); });
    rt.after(4, () => rt.say('森蘭丸', '上様！　明智日向守（光秀）が者と見え申す。寺は十重二十重に囲まれております', 4.5));
    // 明智の先手が門へ寄る（開いたままなら、なだれ込む）
    rt.after(6, () => { F.van = akechi(rt, '明智の先手', IN.main, [uS(2), uA(5)], { nb: false }); });
    rt.after(18, () => { if (!F.gMain) closeGate(rt, 'other'); });
  },
  // P3 門前防衛：門を閉め、押し返し、狭い門の口で斬り合う。鉄砲と弓が撃ち込まれる。少数で大軍を防ぐ
  p3(rt) {
    const F = rt.flags;
    if (F.hp >= 3) return;
    F.hp = 3; F.pT = rt.t;
    rt.setPhase('gate');
    rt.unmark('next');
    nbSay(rt, '是非に及ばず。……門を閉めよ！　寄せる者は門の口で討て', 4);
    rt.obj('main', '上様と共に、表門を守れ', 'main');
    rt.zone('gz', PT.gateIn.x, PT.gateIn.z, 7);
    F.uma.order = 'hold'; F.uma.anchor = { x: PT.gateIn.x + 1, z: PT.gateIn.z }; F.uma.aggro = 9;
    const at = (s, f) => rt.after(s, () => { if (F.hp === 3 && !F.ending) f(); });
    const wave = (name, list, o = {}) => akechi(rt, name, IN.main, list, { gate: F.gMain, ...o });
    at(2, () => wave('明智の一の手', [uS(2), uA(8)]));
    at(6, () => { F.guns = akechi(rt, '築地の外の鉄砲', [[-23, 42], [-23, 42]], [uG(4), uB(2)], { hold: true, aggro: 40 }); rt.say('馬廻', '塀の外から鉄砲じゃ！　頭を下げよ！', 3); });
    at(16, () => fireStage(rt, 1));
    at(22, () => wave('明智の二の手', [uS(2), uA(9)]));
    // 外塀を乗り越えて来る（北の築地の裏手）。塀の一間が崩れる
    at(32, () => {
      const s = F.T.walls.filter((w) => w.alive && Math.hypot((w.seg[0] + w.seg[2]) / 2 - CLIMB.x, (w.seg[1] + w.seg[3]) / 2 - CLIMB.z) < 4.5);
      for (const w of s) { w.hp = 0; w.alive = false; rt.army.structFall(w); }
      akechi(rt, '塀を越えた明智勢', [...IN.climb, [-58, 37], [-46, 41]], [uS(2), uA(4)]);
      rt.say('小姓', '北の塀を越えて来たぞ！　裏手からじゃ！', 3);
      nbSay(rt, '裏へ回るな！　ここを守れ。……門が破られれば、どこも同じじゃ', 3.5);
    });
    at(44, () => wave('明智の三の手', [uS(3), uA(9)]));
    at(58, () => { wave('明智の大手', [uS(3), uA(10)]); rt.say('門番', '閂が……もう持ちませぬ！', 3); });
  },
  gateDown(rt) {
    const F = rt.flags;
    if (F.gDown) return;
    F.gDown = true;
    const g = F.gMain;
    if (g && g.alive) { g.hp = 0; g.alive = false; rt.army.structFall(g); }
    rt.unzone('gz');
    sfx('taiko', 0.8);
    rt.banner('表門、破らる', '明智勢が境内へなだれ込む');
    for (const q of F.foes) if (q.gate === g && !gone(q)) { q.order = 'attack'; q.seekRange = 40; q.assault = null; }
    rt.award((t) => t.side.push('上様と共に表門を守った'), '表門を守った');
    this.p4(rt);
  },
  // P4 本堂へ退く：表庭は開けて危ない。本堂の縁と堂の中で迎える（室内と室外の往復）
  p4(rt) {
    const F = rt.flags;
    if (F.hp >= 4) return;
    F.hp = 4; F.pT = rt.t;
    rt.setPhase('hondo');
    nbSay(rt, '退け！　本堂で迎え撃つ。堂の口は狭い', 3);
    rt.obj('main', '本堂へ退き、堂の口で上様をお守りせよ', 'main');
    rt.marker('next', { ...HONDO_FRONT }, '本堂', { h: 3 });
    nbSet(rt, 'D', { pts: [[-42, 47], [-45.5, 46], [-48.5, 46], [HONDO_IN.x, HONDO_IN.z]], then: 'E' });
    F.uma.order = 'hold'; F.uma.anchor = { x: HONDO_FRONT.x + 0.5, z: HONDO_FRONT.z }; F.uma.aggro = 7;
    rt.zone('hz', HONDO_FRONT.x - 2, HONDO_FRONT.z, 6);
    const at = (s, f) => rt.after(s, () => { if (F.hp === 4 && !F.ending) f(); });
    at(4, () => akechi(rt, 'なだれ込む明智勢', IN.main, [uS(2), uA(8)]));
    at(8, () => fireStage(rt, 2));
    // 宿坊の方（勝手口）からも回り込む：止めなければ回廊を伝って本堂の横へ
    at(12, () => {
      F.flank = akechi(rt, '宿坊から回る明智勢', [...IN.katte, [-44, 90], [-44, 76], [-44, 60], [-46, 52]], [uS(1), uA(5)], { gate: null });
      if (F.gKatte.alive) { F.gKatte.hp = 0; F.gKatte.alive = false; rt.army.structFall(F.gKatte); }
      rt.say('小姓', '勝手口が破られた！　宿坊の方から回り込んで来る！', 3);
      rt.obj('flank', '宿坊から回り込む明智勢を止めよ', 'side');
      rt.marker('flank', centerOf(F.flank), '回り込む明智勢', { red: true, group: F.flank });
    });
    at(24, () => akechi(rt, '明智の新手', IN.main, [uS(2), uA(7), uG(2)]));
  },
  // P5 信長と共闘：本堂の外陣で、信長が横で斬る。北の口と脇門からも来る
  p5(rt) {
    const F = rt.flags;
    if (F.hp >= 5) return;
    F.hp = 5; F.pT = rt.t;
    rt.setPhase('kyoto');
    rt.unmark('next'); rt.unzone('hz');
    nbSay(rt, 'まだ退くな！　ここで一息に押し返す。……者ども、続け', 3.5);
    rt.obj('main', '本堂の中で、上様と共に戦え', 'main');
    nbSet(rt, 'E', { at: { x: -50.5, z: 46 } });
    F.uma.anchor = { x: -48.5, z: 46 };
    fireStage(rt, 3);
    const at = (s, f) => rt.after(s, () => { if (F.hp === 5 && !F.ending) f(); });
    at(3, () => { akechi(rt, '裏手から来る明智勢', [...IN.climb, [-58, 37], [-52, 38], [-52, 41.5]], [uS(2), uA(4)], { nb: true }); rt.say('森蘭丸', '北の口から！　上様のお背中じゃ！', 3); });
    at(14, () => { akechi(rt, '脇門の明智勢', [...IN.side, [-50, 38], [-52, 41.5]], [uS(2), uA(5)], { gate: F.gSide }); rt.say('小姓', '北の脇門を打っておる！', 2.5); });
    at(26, () => akechi(rt, '上様を狙う明智の侍', [...IN.main, [-42, 46], [-46, 46]], [uS(3), uA(3)], { nb: true }));
    at(38, () => { rt.say('森蘭丸', '上様！　お肘に槍傷が……！', 3); rt.after(2.6, () => nbSay(rt, 'かすり傷じゃ。……弓の弦も切れた。刀で足りる', 3.5)); });
  },
  // P6 別棟へ移る：本堂に火。燃えていない道を選び、信長を御殿へ
  p6(rt) {
    const F = rt.flags;
    if (F.hp >= 6) return;
    F.hp = 6; F.pT = rt.t;
    rt.setPhase('move');
    fireStage(rt, 4);
    nbSay(rt, '火が回る、奥へ！　あちらの棟（御殿）へ移るぞ', 3.5);
    rt.obj('main', '上様の退路を開け：御殿へ移る道を選べ', 'main');
    const burning = (id) => { const r = F.T.G.byId[id]; return r && r.state >= 1; };
    const ok = Object.entries(MOVES).filter(([, m]) => !m.burn.some(burning)).map(([k]) => k);
    const keys = (ok.length ? ok : ['urate']).slice(0, 3);
    F.mvKeys = keys;
    rt.choose('御殿へ移る道は？', keys.map((k) => ({ label: MOVES[k].name, note: MOVES[k].note })), (i) => this.p6go(rt, keys[i] || keys[0]), 10);
  },
  p6go(rt, key) {
    const F = rt.flags;
    if (F.mv) return;
    const M = MOVES[key];
    F.mv = key; F.pT = rt.t;
    rt.say('森蘭丸', `${M.name.replace(/を.*$/, '')}じゃ！　${nm(rt)}、先に立って道を開け！`, 3);
    rt.obj('main', `上様を御殿へお移しせよ（${M.name}）`, 'main');
    const last = M.pts[M.pts.length - 1];
    rt.marker('next', { x: last[0], z: last[1] }, '御殿', { h: 3 });
    nbSet(rt, 'D', { pts: M.pts, then: 'E', done: () => this.p7(rt) });
    // 道の途中へ、煙の中から明智勢（築地の外の近い口から入る）
    const mid = M.pts[Math.floor(M.pts.length * 0.55)];
    const from = key === 'urate' ? IN.climb : key === 'watari' ? IN.ura : key === 'shukubo' ? IN.katte : IN.side;
    rt.after(3, () => { if (F.hp === 6) { const g = akechi(rt, '煙の中から来る明智勢', [...from, mid], [uS(2), uA(4)]); if (g) rt.marker('amb', centerOf(g), '道を塞ぐ明智勢', { red: true, group: g }); rt.say('小姓', '煙の中から来るぞ！', 2.5); } });
    rt.after(14, () => { if (F.hp === 6) { fireStage(rt, 5); akechi(rt, '追ってくる明智勢', [...IN.main, [-42, 47], [-47, 47]], [uS(2), uA(6)], { nb: true }); } });
    if (key === 'niwa') rt.after(6, () => { if (F.hp === 6) { akechi(rt, '中庭を撃つ鉄砲', [[-44, 110], [-46, 103.5], [-44, 96]], [uG(4)], { hold: true, aggro: 40 }); rt.bark('勝手口の方から鉄砲！　中庭は早く抜けよ', true); } });
  },
  // P7 最終防衛：御殿の中。襖が破れ、別の部屋から回り込まれる。広間に火が入って、守る所が狭まる
  p7(rt) {
    const F = rt.flags;
    if (F.hp >= 7) return;
    F.hp = 7; F.pT = rt.t;
    rt.setPhase('goten');
    rt.unmark('next'); rt.unmark('amb');
    rt.award((t) => t.side.push('上様を御殿へお移しした'), '上様を御殿へ移した');
    nbSet(rt, 'E', { at: { ...PT.hikae } });
    nbSay(rt, '……ここが最後の間じゃ。一人も通すな', 3);
    rt.obj('main', '御殿の中で、最後まで上様をお守りせよ', 'main');
    rt.zone('gt', PT.hikae.x + 3, PT.hikae.z, 7);
    F.uma.order = 'hold'; F.uma.anchor = { x: -55, z: 86 };
    const at = (s, f) => rt.after(s, () => { if (F.hp === 7 && !F.ending) f(); });
    at(3, () => { akechi(rt, '廊下から来る明智勢', GOTEN_IN.north, [uS(2), uA(2)]); rt.say('小姓', '北の廊下から来る！', 2.5); });
    at(15, () => { akechi(rt, '東の口の明智勢', GOTEN_IN.east, [uS(1), uA(3)], { nb: true }); rt.say('森蘭丸', '襖を破って来るぞ！　広間じゃ！', 2.5); });
    at(26, () => { akechi(rt, '縁側から来る明智勢', GOTEN_IN.south, [uS(2), uA(2), uB(1)]); rt.say('小姓', '縁側の障子が破られた！', 2.5); });
    at(36, () => { fireStage(rt, 6); nbSet(rt, 'E', { at: { ...PT.kyoshitsu } }); nbSay(rt, '火が回る、奥へ！　控えの間で防げ', 3); rt.zone('gt', PT.hikae.x, PT.hikae.z, 5); });
    at(46, () => { akechi(rt, '裏から入った明智勢', GOTEN_IN.west, [uS(2), uA(3)], { nb: true }); rt.say('森蘭丸', '裏からも！　居室の口を固めよ！', 3); });
  },
  // P8 終局：本能寺は落ちる。信長は奥へ入り、火をかける。自分は信長の命で裏門から出る
  p8(rt) {
    const F = rt.flags;
    if (F.hp >= 8) return;
    F.hp = 8; F.pT = rt.t;
    rt.setPhase('end1');
    rt.unzone('gt');
    rt.award((t) => t.side.push('最後の間で上様をお守りした'), '最後の間を守り抜いた');
    nbSet(rt, 'A', { at: { ...PT.oku } });
    F.nbG.aggro = 1.2;
    nbSay(rt, '……もはやこれまでじゃ。女どもは苦しからず、急ぎ罷り出よ', 4);
    rt.after(4.2, () => nbSay(rt, `${nm(rt)}と申したな。そなたは裏門から出よ。……妙覚寺の信忠に、この次第を伝えよ`, 5));
    rt.after(9.4, () => rt.say('森蘭丸', '御殿に火を！　……上様のお首は、明智に渡しませぬ', 4));
    rt.after(11, () => { F.T.fire.ignite('goten', '信長の命の火'); });
    F.kosho.order = 'hold'; F.kosho.anchor = { ...PT.kyoshitsu }; F.koshoStay = true;
    rt.obj('main', '裏門から落ちのびよ（御殿の西の口から裏門へ）', 'main');
    rt.marker('next', { ...PT.uraOut }, '裏門の外', { h: 2.5 });
    F.uraG = akechi(rt, '裏門を見張る明智勢', [[-89, 78], [-89, 78]], [uS(1), uA(4)], { hold: true, aggro: 11, cap: 999 });
    if (F.uraG) rt.marker('uraG', centerOf(F.uraG), '裏門の外の見張り', { red: true, group: F.uraG });
  },
  fallen(rt) {
    const F = rt.flags;
    if (F.hp >= 9) return;
    F.hp = 9;
    rt.unmark('next'); rt.unmark('uraG'); rt.unmark('nb');
    rt.award((t) => t.side.push('本能寺から落ちのびた'), '本能寺から落ちのびた');
    sfx('kane', 0.5);
    rt.banner('本能寺、落つ', '信長は奥の間に火を放ち、自害した。享年四十九');
    rt.say('', '――燃え落ちる御殿の奥から、もう声は聞こえなかった', 4);
    rt.after(5, () => this.toNijo(rt));
  },

  // 第二幕：二条御所（信忠）。場面を移して、御所の門を守り、北の口から落ちる
  toNijo(rt) {
    const F = rt.flags;
    if (F.step >= 3) return;
    F.step = 3; F.stepT = rt.t;
    rt.setPhase('nijo');
    F.bossName = '織田信忠';
    rt.world.setTime('morning');
    rt.world.distMul = F.dm0; F.smoke = 0;
    for (const g of F.foes) if (!gone(g)) { for (const u of g.units) if (u.alive) { u.alive = false; u.mesh.visible = false; } }
    teleport(rt, NIJO_GATE.x + 5, NIJO_GATE.z + 2);
    // 場面が移る間に息を整えた（本能寺で深く傷ついたまま、すぐ次の寄せを受けない）
    { const u = rt.player.u; u.hp = Math.max(u.hp, u.maxHp * 0.9); if (rt.player.sta != null) rt.player.sta = rt.player.maxSta; }
    rt.banner('二条御所', '妙覚寺の信忠は、二条の新御所に移って明智を待つ');
    F.tada = allyGroup(rt, { name: '織田信忠の手', anchor: { x: NIJO.x - 6, z: NIJO.z }, facing: -Math.PI / 2, width: 12, aggro: 12, noRout: true },
      dress([{ type: 'busho', n: 1, o: { name: '織田信忠', invuln: true, hat: 'kabuto_m', haori: 0x7a1d14, horse: false } }, { type: 'samurai', n: 1, o: { name: '村井貞勝', invuln: true, hat: 'kabuto_w', horse: false } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 12 }], ODA));
    F.tada.defMult = 1.3;
    F.tadaU = F.tada.units[0];
    rt.after(2, () => this.arrive(rt));
  },
  arrive(rt) {
    const F = rt.flags;
    if (F.step >= 4) return;
    F.step = 4; F.stepT = rt.t;
    rt.setPhase('defend');
    rt.say('織田信忠', '……父上が。明智はここへも来よう。囲まれた今、逃げても討たれるだけじゃ。ここで戦う', 5);
    rt.say('村井貞勝', '親王様（誠仁親王）は、御所を出て内裏へお移りいただきました。存分に戦えまする', 4.5);
    rt.obj('main', HI(rt) ? '二条御所の西の門の一手を預かり、中将様（信忠）をお守りせよ' : '二条御所で、中将様（信忠）をお守りせよ', 'main');
    F.tada.order = 'hold'; F.tada.anchor = { x: NIJO_GATE.x + 6, z: NIJO_GATE.z }; F.tada.aggro = 12;
    F.ngun = allyGroup(rt, { name: '御所の鉄砲組', anchor: { x: NIJO_GATE.x + 9, z: NIJO_GATE.z }, facing: -Math.PI / 2, width: 12, aggro: 4, noRout: true, formation: 'line' },
      dress([{ type: 'samurai', n: 1 }, { type: 'gun', n: 10 }], ODA));
    F.roofT = 30;
    this.deep(rt);
  },
  deep(rt) {
    const F = rt.flags;
    if (F.dpB) return;
    F.dpB = true; F.dpOn = true;
    depthStart(rt, hCtx(rt), stepsN(rt), () => {
      F.dpOn = false;
      rt.after(3, () => { if (rt.objectives.some((q) => q.id === 'dp')) rt.objRemove('dp'); });
      this.escape(rt);
    });
  },

  // 二条御所の北の口から落ちる
  escape(rt) {
    const F = rt.flags;
    if (F.step >= 5) return;
    F.step = 5; F.stepT = rt.t;
    rt.setPhase('escape');
    for (const g of rt.squadGroups) g.order = 'follow';
    rt.unzone('ng');
    const W = rt.world;
    W.addFire(NIJO.x + 4, NIJO.z - 4, { h: 2.4 }); W.addSmokeColumn(NIJO.x + 4, 9, NIJO.z - 4, { size: 3 });
    rt.banner('もはやこれまで', '御所に火がかけられた');
    rt.say('織田信忠', `${nm(rt)}と申したか。父上の最期を見た者が、ここで死んではならぬ`, 5);
    rt.say('織田信忠', '生きて、この次第を安土に伝えよ。……行け！', 3.5);
    rt.obj('main', '御所の北の口から落ちのびよ', 'main');
    rt.marker('out', OUT, '落ちのびる先', { h: 2 });
    rt.zone('out', OUT.x, OUT.z, 7);
    F.north = enemyGroup(rt, { faction: 'saito', name: '北の口の明智勢', anchor: { x: NIJO_BACK.x + 4, z: NIJO_BACK.z - 26 }, facing: 0, width: 8, aggro: 12, morale: 75, fleeDir: { x: 1, z: 0 }, dmgMult: 0.6 },
      dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 6 }], AKECHI));
    rt.marker('north', centerOf(F.north), () => `北の口の明智勢・${moraleWord(F.north.morale)}`, { red: true, group: F.north });
    F.tada.order = 'hold'; F.tada.anchor = { x: NIJO.x, z: NIJO.z - 6 };
    rt.say('村井貞勝', 'わしらはここに残る。行け、振り返るな！', 3.5);
    // 落ちる者を追う明智の手（徒。この戦に馬は出さない）
    rt.after(16, () => {
      if (F.step !== 5 || F.ending) return;
      F.chase = enemyGroup(rt, { faction: 'saito', name: '落ち武者狩りの明智勢', anchor: { x: NIJO.x - 30, z: NIJO.z - 30 }, facing: Math.PI * 0.5, order: 'attack', seekRange: 60, width: 8, aggro: 16, morale: 80, fleeDir: { x: -1, z: 0 }, dmgMult: 0.55 },
        dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 6 }], AKECHI));
      rt.marker('chase', centerOf(F.chase), () => `落ち武者狩り・${moraleWord(F.chase.morale)}`, { red: true, group: F.chase });
      rt.say('明智の侍', '御所の裏から落ちる者がおるぞ！　逃がすな！', 3);
      rt.after(3, () => rt.bark('足を止めずに、印の方へ。追手とは斬り合わずともよい'));
    });
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.unmark('out'); rt.unmark('north'); rt.unmark('chase'); rt.unzone('out');
    rt.objDone('main');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '信長と共に本能寺で戦い、生き延びた', pts: 24 }; }, '任務達成・生き延びた');
    sfx('kane', 0.5);
    rt.banner('二条御所、落ちる', '織田信忠は自害した。享年二十六');
    rt.say('', `――${nm(rt)}は京の北の町はずれに出た。振り返ると、本能寺と二条の空に黒い煙が上がっていた`, 6);
    rt.after(6, () => rt.say('', '――十一日後、羽柴秀吉が中国から大返しで戻り、山崎で明智光秀を破る', 5.5));
    rt.player.u.invuln = true;
    rt.finish({}, 13);
  },
  // 上様を守れなかった（深手で倒れられた）
  nbFail(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.objFail('main');
    rt.tracker.main = false;
    rt.banner('上様、深手', '囲まれた信長が倒れた。近習は守り切れなかった');
    rt.say('森蘭丸', '上様！　……おのれ、明智！', 3.5);
    rt.finish({}, 8);
  },

  update(rt, dt) {
    if (rt.G.lord) { this.lordTick(rt, dt); return; }
    const F = rt.flags;
    for (const m of rt.markers.slice()) if (m.group && gone(m.group)) rt.unmark(m.id);
    KIT.backTick(rt);
    if (F.T) { F.T.fire.tick(dt); teraTick(rt, F.T, dt); }
    if (F.ending) return;
    if (F.dpOn) depthTick(rt, dt);
    if (F.hp && F.hp < 9) { honnoTick(this, rt, dt); return; }
    const p = rt.player.u.pos;
    if (F.step === 4) {
      // 隣の屋敷（近衛殿）の屋根からの鉄砲
      if ((F.roofT -= dt) <= 0 && rt.t - F.stepT > 30) {
        F.roofT = 2 + Math.random() * 3;
        const x = NIJO.x - NIJO.h - 12, z = NIJO.z - 12 + Math.random() * 10;
        rt.army.play('gun', { x, z }, 0.7); rt.army.smoke(x, 4.5, z, 1, 0, 0.8);
      }
    }
    if (F.step === 5) {
      const d = Math.hypot(p.x - OUT.x, p.z - OUT.z);
      rt.objProgress('main', `あと ${Math.max(0, Math.round(d))}m`);
      if (d >= 7 && rt.t - F.stepT > 40 && !F.outCall) { F.outCall = true; rt.say('御所の侍', '北の口はこちらじゃ！　印の方へ、早う落ちよ！　火が回るぞ', 3.5); }
      if (d < 7 || rt.t - F.stepT > 100) this.win(rt);
    }
  },

  onKill(rt, v) {
    const F = rt.flags;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
  },
  onRout(rt, g) {
    const F = rt.flags;
    if (rt.G.lord || g.team !== 1 || !g.name || /備の兵|控え/.test(g.name) || rt.t - (F.routSaidT || -99) < 8) return;
    F.routSaidT = rt.t;
    rt.say('足軽', `${g.name}が退いた！`, 2.5);
  },
};

// 本能寺の段の毎コマ（P1〜P8）
function honnoTick(def, rt, dt) {
  const F = rt.flags, P = rt.player.u, p = P.pos, NB = F.nb, T = F.T;
  const t = rt.t - F.pT;
  const dNb = NB && NB.alive ? Math.hypot(p.x - NB.pos.x, p.z - NB.pos.z) : 0;
  // 小姓衆は信長の後ろに付く（終局では居室の口に残る）
  if (!gone(F.kosho) && !F.koshoStay && NB.alive && F.hp >= 2) {
    F.kosho.order = 'hold';
    const h = F.nbG.facing || 0;
    F.kosho.anchor = { x: NB.pos.x - Math.sin(h) * 1.8, z: NB.pos.z - Math.cos(h) * 1.8 };
  }
  if (F.ran && !F.ran.alive && !F.ranDead) { F.ranDead = true; rt.say('小姓', '蘭丸様、討死……！', 3); }
  // 信長の傷：敵が寄っていなければ少しずつ息を整える。深手（二割）で倒れれば負け
  if (NB.alive) {
    let near = 0;
    rt.army.forNear(NB.pos.x, NB.pos.z, 5, (o) => { if (o.alive && o.team === 1 && !o.fleeing) near++; });
    if (!near) NB.hp = Math.min(NB.maxHp, NB.hp + NB.maxHp * 0.012 * dt);
    if (near >= 3 && rt.t - (F.nbPressT || -99) > 14 && F.hp >= 3 && F.hp <= 7) { F.nbPressT = rt.t; rt.say('森蘭丸', `上様が囲まれた！　${nm(rt)}、お助けせよ！`, 3); }
    if (NB.hp < NB.maxHp * 0.5 && !F.nbHurtSaid) { F.nbHurtSaid = true; rt.bark('上様が手負いじゃ！　そばの敵を払え', true); }
    if (NB.hp < NB.maxHp * 0.2 && F.hp < 8) { def.nbFail(rt); return; }
  } else if (F.hp < 8) { def.nbFail(rt); return; }
  // 上様のそばを離れない
  if (F.hp >= 3 && F.hp <= 7 && dNb > 26) {
    F.farT = (F.farT || 0) + dt;
    if (F.farT > 8 && rt.t - (F.farSaidT || -99) > 20) { F.farSaidT = rt.t; rt.say('森蘭丸', `${nm(rt)}！　上様のおそばを離れるな！`, 3); }
  } else F.farT = 0;
  // 移る間：自分が遠すぎれば、信長は待つ（その先で一人で戦わない）
  if (F.nbSt === 'D') { const wait = dNb > 20 && F.hp >= 6 && (F.waitAcc || 0) < 10; if (wait) F.waitAcc = (F.waitAcc || 0) + dt; F.nbG.speed = wait ? 0 : 3.3; }
  // 襖・障子：自分の一振りで破れる。押し寄せた敵も破って入る
  if (P.strikeT > 0.12 && !F.brkHit) { F.brkHit = true; const h = P.heading || 0; breakNear(rt, T, p.x + Math.sin(h) * 1, p.z + Math.cos(h) * 1, 1.0, 1); }
  if (!(P.strikeT > 0.12)) F.brkHit = false;
  F.brkT = (F.brkT || 0) - dt;
  if (F.brkT <= 0) {
    F.brkT = 0.5;
    for (const q of F.foes) {
      if (gone(q)) continue;
      for (const u of q.units) {
        if (!u.alive || u.fleeing || !hallAt(T, u.pos.x, u.pos.z) && !hallNear(T, u.pos.x, u.pos.z)) continue;
        if (breakNear(rt, T, u.pos.x, u.pos.z, 0.75, 1) && rt.t - (F.brkSaidT || -99) > 10) { F.brkSaidT = rt.t; rt.bark('襖が破れた！　隣の間から来るぞ', true); }
      }
    }
  }
  // 煙：燃える棟のまわりと、自分のまわりに低い煙を置く（遠くが見えず、敵が煙の中から現れる）
  if (F.smoke) {
    F.smT = (F.smT || 0) - dt;
    if (F.smT <= 0) {
      F.smT = F.smoke > 1 ? 0.35 : 0.7;
      const B = T.fire.burning().filter((r) => Math.hypot(r.x - p.x, r.z - p.z) < 45);
      if (B.length) { const r = B[Math.floor(Math.random() * B.length)]; rt.world.gunSmoke(r.x + (Math.random() - 0.5) * r.w, r.z + (Math.random() - 0.5) * r.d, 0x4a4642); }
      if (F.smoke > 1) { const a = Math.random() * Math.PI * 2, d = 5 + Math.random() * 10; rt.world.gunSmoke(p.x + Math.sin(a) * d, p.z + Math.cos(a) * d, 0x5a5650); }
    }
  }
  // 広間の火（第六段）：入れば熱い
  const Z = F.heatZone;
  if (Z && p.x > Z.x0 && p.x < Z.x1 && p.z > Z.z0 && p.z < Z.z1 && P.alive) {
    F.hzT = (F.hzT || 0) - dt;
    if (F.hzT <= 0) { F.hzT = 0.5; P.hp = Math.max(P.maxHp * 0.12, P.hp - P.maxHp * 0.035); if (rt.t - (F.heatSaidT || -99) > 8) { F.heatSaidT = rt.t; rt.bark('広間は火の中じゃ！　控えの間へ退け', true); } }
  }
  // ---- 段の進み ----
  if (F.hp === 1) {
    const d = Math.hypot(p.x - PT.gateIn.x, p.z - PT.gateIn.z);
    rt.objProgress('main', `表門まで ${Math.max(0, Math.round(d))}m`);
    if (d < 11 || t > 38) def.p2(rt);
  } else if (F.hp === 2) {
    if ((F.gMain && (dNb < 16 || t > 14)) || t > 22) def.p3(rt);
  } else if (F.hp === 3) {
    const g = F.gMain;
    if (g && g.alive && t < 55 && g.hp < 220) g.hp = 220;
    rt.objProgress('main', g && g.alive ? `表門 ${Math.max(0, Math.round(g.hp / g.maxHp * 100))}%` : '門が開いている');
    if ((g && !g.alive) || t > 68) def.gateDown(rt);
  } else if (F.hp === 4) {
    if (F.flank && !F.flankDone && (gone(F.flank) || F.flank.count <= 1)) { F.flankDone = true; rt.objDone('flank'); rt.award((t2) => t2.side.push('宿坊から回り込む明智勢を止めた'), '回り込みを止めた'); }
    rt.objProgress('main', `本堂まで ${Math.max(0, Math.round(Math.hypot(p.x - HONDO_FRONT.x, p.z - HONDO_FRONT.z)))}m`);
    if (t > 40) def.p5(rt);
  } else if (F.hp === 5) {
    rt.objProgress('main', `持ちこたえよ あと${Math.max(0, Math.ceil(50 - t))}秒`);
    if (t > 50) { if (F.flank && !F.flankDone) { F.flankDone = true; rt.objFail('flank'); } def.p6(rt); }
  } else if (F.hp === 6) {
    if (F.mv && F.nbGoal) {
      const d = Math.hypot(NB.pos.x - F.nbGoal.x, NB.pos.z - F.nbGoal.z);
      rt.objProgress('main', `上様は御殿まで ${Math.max(0, Math.round(d))}m`);
      if (dNb > 20 && rt.t - (F.waitSaidT || -99) > 12) { F.waitSaidT = rt.t; rt.say('森蘭丸', '上様がお待ちじゃ！　先に立って道を開け！', 3); }
      // 長く詰まった時は、上様を御殿へ着かせる（待たせきりにしない）
      if (rt.t - F.pT > 85) { NB.pos.x = F.nbGoal.x; NB.pos.z = F.nbGoal.z; def.p7(rt); }
    } else if (t > 16 && !F.mv) def.p6go(rt, F.mvKeys[0]);
  } else if (F.hp === 7) {
    rt.objProgress('main', `持ちこたえよ あと${Math.max(0, Math.ceil(64 - t))}秒`);
    if (t > 64) def.p8(rt);
  } else if (F.hp === 8) {
    const d = Math.hypot(p.x - PT.uraOut.x, p.z - PT.uraOut.z);
    rt.objProgress('main', `裏門の外まで ${Math.max(0, Math.round(d))}m`);
    if (((d < 6 || p.x < -82) && t > 12) || t > 75) def.fallen(rt);
  }
}
const hallNear = (T, x, z) => T.halls.some((h) => x > h.x0 - 1 && x < h.x1 + 1 && z > h.z0 - 1 && z < h.z1 + 1);

// ======================================================================
// 信長で遊ぶ時の本能寺（rt.G.lord の時だけ。足軽の流れは上のまま）
// 始まりは境内の奥。供は森蘭丸ら小姓衆と、わずかな者（二十数人）。明智の一万余りが築地を幾重にも囲む
// ①弓と槍で表門を防ぐ（判断：門の内で射るか、打って出るか）②表門が破られる（判断：自ら槍を取るか、すぐ奥へ）
// ③奥へ下がり、御殿に火を放つ ④囲みを破る（判断：小姓衆を連れるか、囮にするか）⑤築地の外で落ちる先を決める（妙覚寺か東山か）→ 着けば勝ち
// 討たれる・炎に呑まれる＝史実どおりの最期（負け）
// 囲みの破れ目は、時と場所で開く（火を放ってから。蘭丸らを囮にすれば早く開く）：
//   北の裏門……はじめから開いているが、外に北の囲み。しばらくで北の囲みが表へ回され、薄くなる
//   西の築地……裏の松の枝を伝って越えられる（E 長押し）。その後に西の囲みが表へ回され、薄くなる
//   南の築地……火が回って崩れ、南の囲みは火と煙を避けて退く
// 築地の外には四つの辻を固める明智勢。外へ出れば、明智の追手（騎馬）がかかる
// 百七十秒で炎が御殿を包む。その時まだ築地の内にいれば、最期
// ======================================================================
const L_START = { x: HONNO.x - 8, z: HONNO.z - 12 };            // 始まり：境内の奥（御殿の北西）
const OKU = { x: HONNO.x - 12.6, z: HONNO.z - 2 };              // 御殿の裏（奥）
const WALL_W = { x: HONNO.x - HONNO.h + 1.7, z: HONNO.z + 8 };  // 西の築地の越え口（内）
const WALL_W_OUT = { x: HONNO.x - HONNO.h - 3.4, z: HONNO.z + 8 };
const GATE_N = { x: HONNO.x, z: HONNO.z - HONNO.h };             // 裏門（北）
const S_BREAK = { x: HONNO.x - 3, z: HONNO.z + HONNO.h };       // 火が回って崩れる南の築地
const MYO = { x: 22, z: -22 };                                   // 妙覚寺（信忠の宿所。北東の町）
const HIGASHI = { x: 112, z: 50 };                               // 東山の麓（東の町はずれ）
// 火の回る御殿の奥へ逃れる道（西の縁 → 小書院の裏 → 南の渡り廊下 → 奥の納戸）。納戸で煙に身を潜めてから、囲みを破る
const FLEE = [{ x: HONNO.x - 12.5, z: HONNO.z + 9, name: '西の縁' }, { x: HONNO.x - 12, z: HONNO.z + 14.3, name: '小書院の裏' }, { x: HONNO.x + 2, z: HONNO.z + 14.3, name: '南の渡り廊下' }, { x: HONNO.x - 2, z: HONNO.z + 5.3, name: '奥の納戸' }];
const inHonno = (x, z, m = 0) => Math.abs(x - HONNO.x) < HONNO.h + m && Math.abs(z - HONNO.z) < HONNO.h + m;
function gateDoors(W, x, z, w, rotY) {
  const grp = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x4a3626, roughness: 0.9 });
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3, w - 0.1), mat);
  m.position.y = 1.5; m.castShadow = true;
  grp.add(m);
  grp.position.set(x, W.heightAt(x, z), z);
  grp.rotation.y = rotY;
  return grp;
}
// 門を打ち破る組の狙い（門が倒れたら null を返し、lordTick が「かかれ」に替える）
const hitGate = (gate) => () => (gate.alive ? gate : null);

Object.assign(honnoji, {
  lordSpawn: { x: L_START.x, z: L_START.z, heading: Math.PI / 2 },
  lordAt: { x: HONNO.x - 4, z: HONNO.z, r: HONNO.h, why: '本能寺の境内の内（信長は本能寺に泊まっていた）' },
  lordHata: { spear: 12, bow: 8 },   // 供のわずかな者（小姓衆は別に六人）

  lordSetup(rt) {
    const W = rt.world, F = rt.flags;
    F.lstep = 0; F.ek = 0; F.ak = 0;
    // ---- 京の町並み（足軽の流れと同じ） ----
    const inCompound = (x, z) => [HONNO, NIJO].some((c) => Math.abs(x - c.x) < c.h + 5 && Math.abs(z - c.z) < c.h + 5);
    // 町屋が何十も並ぶ所なので、材質ごとの BatchedMesh にまとめて描く回数を減らす
    const hutBatch = makeSimpleBatch();
    let k = 0;
    for (const sx of [-54, 0, 54]) for (const sz of [-54, 0, 54]) {
      for (const [dx, dz, r] of [[-14, -20, 0], [0, -20, 0], [14, -20, 0], [-14, 20, Math.PI], [0, 20, Math.PI], [14, 20, Math.PI], [-20, -6, Math.PI / 2], [-20, 8, Math.PI / 2], [20, -6, -Math.PI / 2], [20, 8, -Math.PI / 2]]) {
        const x = sx + dx, z = sz + dz;
        if (inCompound(x, z)) continue;
        hut(W, x, z, 7 + (k % 3), 5, r + Math.PI, { wall: k % 2 ? 0x6e5a40 : 0x7b6448, h: 2.4, batch: hutBatch });
        k++;
      }
    }
    // 蛸薬師通りの路地：井戸と木戸を少し（門前の密な町割り）
    rt.scene.add(well(W, -22, 44), well(W, -8, 62), kido(W, -27, 54, Math.PI / 2));
    // ---- 本能寺：東に表門、北に裏門（どちらも破られる門）。二条御所は描くだけ ----
    const wallBatch = makeKitBatch();
    F.walls = compound(rt, { ...HONNO, back: 'n' }, 'e', 7, wallBatch);
    compound(rt, NIJO, 'w', 7, wallBatch);
    finalizeKitBatch(rt, wallBatch);
    rt.scene.add(kabukimon(W, HONNO_GATE.x, HONNO_GATE.z, 7.4, Math.PI / 2), kabukimon(W, NIJO_GATE.x, NIJO_GATE.z, 7.4, Math.PI / 2));
    F.gE = rt.army.addStruct({ seg: [HONNO_GATE.x, HONNO_GATE.z - 3.5, HONNO_GATE.x, HONNO_GATE.z + 3.5], hp: 2600, maxHp: 2600, armor: 0.5, team: 0, name: '表門' });
    F.gE.mesh = gateDoors(W, HONNO_GATE.x, HONNO_GATE.z, 7, 0); rt.scene.add(F.gE.mesh);
    F.gN = rt.army.addStruct({ seg: [GATE_N.x - 2, GATE_N.z, GATE_N.x + 2, GATE_N.z], hp: 1800, maxHp: 1800, armor: 0.5, team: 0, name: '裏門' });
    F.gN.mesh = gateDoors(W, GATE_N.x, GATE_N.z, 4, Math.PI / 2); rt.scene.add(F.gN.mesh);
    F.sWall = F.walls.filter((s) => Math.abs((s.seg[1] + s.seg[3]) / 2 - S_BREAK.z) < 0.5 && Math.abs((s.seg[0] + s.seg[2]) / 2 - S_BREAK.x) < 7);
    buildHonno(rt);   // 本堂・祖師堂系・客殿・庫裏・宿坊・倉（Garan。御殿に火を放つと、建物ごとに少しずつ燃え移る）
    hut(W, NIJO.x + 2, NIJO.z - 2, 16, 11, 0, { h: 3.6, wall: 0x7a6a50, roof: 0x3a3430, batch: hutBatch });
    finalizeSimpleBatch(rt, hutBatch);
    // 裏の松（西の築地を越える枝）
    rt.scene.add(nobori(W, HONNO.x - 4, HONNO.z - 4, 'oda', 5), nobori(W, HONNO.x + 8, HONNO.z + 4, 'eiraku', 5));
    // ---- 遠景の明智の大軍（四方）と篝・旗。落ち口の斜めの隅は空けておく ----
    const DA = (x, z, w, d, count, facing, seed) => W.addDistantArmy({ x, z, w, d, count, facing, armor: 0x2a2a30, team: 1, flagTex: flagTexture('akechi'), seed });
    F.aHost = [
      DA(HONNO.x, HONNO.z + 52, 34, 10, 240, Math.PI, 1586),
      DA(HONNO.x - 56, HONNO.z, 10, 34, 220, Math.PI / 2, 1587),
      DA(HONNO.x, HONNO.z - 52, 34, 10, 220, 0, 1588),
      DA(HONNO.x + 64, HONNO.z, 10, 34, 260, -Math.PI / 2, 1589),
    ];
    for (const [x, z] of [[HONNO.x - 22, HONNO.z + 26], [HONNO.x - 26, HONNO.z - 24], [HONNO.x + 26, HONNO.z + 22], [HONNO.x + 24, HONNO.z - 26]]) W.addFire(x, z, { torch: true, h: 1.4 });
    for (const [x, z] of [[HONNO.x - 10, HONNO.z + 36], [HONNO.x - 36, HONNO.z + 8], [HONNO.x + 4, HONNO.z - 36], [HONNO.x + 36, HONNO.z - 6]]) rt.scene.add(nobori(W, x, z, 'akechi', 6));
    // ---- 小姓衆（森蘭丸ら）。自分のそばを離れない ----
    F.kosho = allyGroup(rt, { name: '森蘭丸と小姓衆', anchor: { x: L_START.x + 3, z: L_START.z + 2 }, facing: Math.PI / 2, width: 4, aggro: 8, noRout: true },
      dress([{ type: 'samurai', n: 1, o: { name: '森蘭丸', hat: 'none' } }, { type: 'samurai', n: 1, o: { name: '森坊丸', hat: 'none' } }, { type: 'samurai', n: 1, o: { name: '森力丸', hat: 'none' } }, { type: 'samurai', n: 3, o: { hat: 'none' } }], ODA));
    F.kosho.defMult = 1.4;
    F.ran = F.kosho.units[0]; F.bo = F.kosho.units[1]; F.riki = F.kosho.units[2];
    // 供のわずかな者（槍と弓。自分の組として付いて来る）
    rt.makeSquad({ x: L_START.x - 2, z: L_START.z + 4 }, Math.PI / 2, [{ kind: 'spear', n: 12 }, { kind: 'bow', n: 8 }]);
    // ---- 築地の外の囲み（本物の兵でぎっしり）：北・西・南。表へ回される本隊と、動かない残りの者 ----
    // 囲みの鉄砲は、寄せる波の鉄砲と同じく半分の重さ（長くなった戦で、落ちのびる所まで行けるよう）
    const ring = (name, x, z, facing, n, w = 14) => { const g = enemyGroup(rt, { faction: 'saito', name, anchor: { x, z }, facing, width: w, aggro: 18, morale: 100, noRout: true, fleeDir: { x: 0, z: 0 }, dmgMult: 0.8 },
      dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: n - 4 }, { type: 'gun', n: 2 }], AKECHI)); for (const u of g.units) if (u.type === 'gun') u.dmg *= 0.5; return g; };
    // 844×390・画質「低」で1コマ100ms超（kaito 10/2 botrun 実測）だったので、周りを囲む本物の兵の数を少し減らした
    // （遠景は addDistantArmy のままで、大軍に見える量感は保つ）
    F.ringN = ring('北の囲み', HONNO.x, HONNO.z - HONNO.h - 9, 0, 14);
    F.ringW = ring('西の囲み', HONNO.x - HONNO.h - 11, HONNO.z + 4, Math.PI / 2, 14);
    F.ringS = ring('南の囲み', HONNO.x, HONNO.z + HONNO.h + 11, Math.PI, 14);
    ring('北の囲みの残り', HONNO.x + 8, HONNO.z - HONNO.h - 16, 0, 5, 6);
    ring('西の囲みの残り', HONNO.x - HONNO.h - 18, HONNO.z + 14, Math.PI / 2, 5, 6);
    F.ringS2 = ring('南の囲みの残り', HONNO.x - 12, HONNO.z + HONNO.h + 20, Math.PI, 5, 6);
    // 町の辻（四つの隅）を固める明智勢：囲みを抜けても、ここを破らねば町へ出られない
    F.corner = {};
    for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) F.corner[(sz > 0 ? 's' : 'n') + (sx > 0 ? 'e' : 'w')] = ring('辻を固める明智勢', HONNO.x + sx * 42, HONNO.z + sz * 42, Math.atan2(-sx, -sz), 6, 8);
    rt.army.maxAttackers = rt.army.maxAttackers + 1;   // 大勢に囲まれる戦：同時に打ちかかる敵を一人多く
    F.foes = [];
    applyLook(rt, DAWN);
    // 寝入っていたところを急襲された信長：具足を着ける間が無い。小袖（肌着）のまま、兜も羽織も無しで戦い出す
    // （applyLord が戦の始めに具足一式を着せるので、その後の最初のコマで剥ぐ。rishi の段で簡単な羽織だけ足す）
    // 写真で見返すと、肌着のはずの信長がいつもの旗指物を背負ったままだった（直す：寝入りを襲われた体では指物を立てる間が無い）
    rt.after(0, () => { const u = rt.player.u; u.look = { ...u.look, armor: 0xcfc4a8, lace: 0x8a7a5a, hat: 'none', haori: 0, menpo: 0, horo: 0, sode: false, trim: 0, real: 0, flag: null, pole: false }; });
    rt.setPhase('brief');
    rt.obj('main', '何事か、確かめよ', 'main');
    rt.say('', '天正十年六月二日　夜明け前　京 本能寺', 3.5);
    rt.after(1.8, () => { for (let i = 0; i < 6; i++) rt.after(i * 0.3, () => rt.army.play('gun', { x: HONNO.x + 26, z: HONNO.z + (Math.random() - 0.5) * 20 }, 0.8)); });
    rt.after(3, () => rt.army.play('eshout', { x: HONNO.x + 24, z: HONNO.z }, 1.6));
    rt.say('織田信長', '……下々の喧嘩か。騒がしい', 3);
    rt.say('森蘭丸', '殿！　表に桔梗の旗。明智日向守（光秀）が者と見え申す。寺は十重二十重に囲まれております', 5);
    rt.say('織田信長', '是非に及ばず。……弓を持て', 3);
    rt.after(12, () => this.lordDefend(rt));
  },

  // ① 弓と槍で表門を防ぐ
  lordDefend(rt) {
    const F = rt.flags;
    if (F.lstep >= 1) return;
    F.lstep = 1; F.stepT = rt.t;
    rt.setPhase('defend');
    sfx('horagai', 0.8);
    rt.banner('明智光秀、謀反', '桔梗の旗が本能寺を囲む');
    rt.obj('main', '弓と槍で、表門に寄せる明智勢を防げ', 'main');
    rt.marker('gE', { x: HONNO_GATE.x, z: HONNO_GATE.z }, () => `表門・${Math.max(0, Math.round(F.gE.hp / F.gE.maxHp * 100))}%`, { h: 3 });
    rt.say('森蘭丸', '供の者は、表門の内に弓を並べよ！　槍は門の脇じゃ！', 3.5);
    // 判断①：表門の防ぎ方
    // 一戦が長くなりすぎる（kaito 10/2・botrun で確かめ 601秒・目標6〜9分=360〜540秒）のを直すため、各段の上限を少し詰めた
    F.gateHold = 90; F.gateMax = 150;
    rt.after(4, () => rt.choose('表門をどう防ぐ？', [
      { label: '門の内に弓を並べ、寄せる者を射る', note: '門は長く持つ。ただ、寄せは幾度も来る' },
      { label: '門を開いて打って出て、先手を突き崩す', note: '先手は崩れ、門の前が空く。ただ、外は明智の大軍の前' },
    ], (i) => {
      F.sally = i === 1;
      if (!F.sally) { F.gateHold = 120; rt.say('織田信長', '弓を持て。門に寄る者から射よ。……門は、そう容易くは破れぬ', 3.5); return; }
      F.gateHold = 80; F.gateMax = 130;
      rt.say('織田信長', '門を開け。……先手を突き崩して、すぐ戻る。続け！', 3);
      rt.obj('sally', '門の外の明智の先手を崩し、門の内へ戻れ', 'side');
      F.sallyT = rt.t;
      for (const g of F.foes) if (!gone(g) && g.gate === F.gE) { g.order = 'attack'; g.seekRange = 60; g.assault = null; g.morale = Math.min(g.morale, 70); g.noRout = false; g.sallied = true; }
    }, 16));
    const E = (dx, dz) => ({ x: HONNO_GATE.x + 16 + dx, z: HONNO_GATE.z + dz });
    rt.after(3, () => this.lordWave(rt, '明智の先手', E(0, -4), F.gE, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 14 }]));
    rt.after(10, () => this.lordWave(rt, '築地の外の鉄砲', E(-4, 9), null, [{ type: 'gun', n: 5 }, { type: 'bow', n: 3 }], { order: 'hold', aggro: 26 }));
    rt.after(22, () => this.lordWave(rt, '明智の二の手', E(4, 4), F.gE, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 14 }, { type: 'gun', n: 2 }]));
    rt.after(34, () => { this.lordWave(rt, '裏門へ回った明智勢', { x: GATE_N.x + 6, z: GATE_N.z - 14 }, F.gN, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 12 }]); rt.say('小姓', '裏門にも寄せてまいりました！', 3); rt.marker('gN', { x: GATE_N.x, z: GATE_N.z }, () => `裏門・${Math.max(0, Math.round(F.gN.hp / F.gN.maxHp * 100))}%`, { h: 3 }); });
    rt.after(48, () => this.lordWave(rt, '明智の三の手', E(0, 0), F.gE, [{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 16 }]));
    // 門が持つ間も、明智勢は切れ目なく寄せる（大きな波）
    rt.after(66, () => { if (F.lstep === 1) { this.lordWave(rt, '明智の四の手', E(2, -6), F.gE, [{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 14 }, { type: 'gun', n: 3 }]); rt.say('森蘭丸', '桔梗の旗が、通りを埋めて参ります！　矢を惜しむな！', 3); } });
    rt.after(84, () => { if (F.lstep === 1) this.lordWave(rt, '築地を越えようとする明智勢', { x: HONNO.x + HONNO.h + 6, z: HONNO.z + 12 }, null, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 8 }], { order: 'hold', aggro: 20 }); });
    rt.after(100, () => { if (F.lstep === 1) this.lordWave(rt, '明智の五の手', E(0, 4), F.gE, [{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 16 }]); });
    rt.after(122, () => { if (F.lstep === 1) { this.lordWave(rt, '明智の大手', E(-2, 0), F.gE, [{ type: 'samurai', n: 4 }, { type: 'ashigaru', n: 16 }]); rt.say('小姓', '門の閂が、もう持ちませぬ！', 3); } });
  },
  // 明智の一隊（門があれば門を打ち、無ければ寺の内へ討ち入る）
  lordWave(rt, name, at, gate, list, o = {}) {
    const F = rt.flags;
    if (F.ending) return null;
    const alive = rt.army.units.filter((u) => u.alive && u.team === 1).length;
    if (alive > 130) return null;
    const into = !gate || !gate.alive;
    const g = enemyGroup(rt, { faction: 'saito', name, anchor: { ...at }, facing: Math.atan2(HONNO.x - at.x, HONNO.z - at.z), width: 10, aggro: 14, morale: 100, noRout: true, fleeDir: { x: 0, z: 0 }, dmgMult: 0.7,
      order: into ? 'attack' : 'assault', seekRange: 140, ...o }, dress(list, AKECHI));
    for (const u of g.units) if (u.type === 'gun') u.dmg *= 0.5;
    if (!into && gate) { g.assault = hitGate(gate); g.gate = gate; }
    F.foes.push(g);
    rt.army.play('eshout', at, 1.5);
    return g;
  },
  lordGateDown(rt, gate) {
    const F = rt.flags;
    if (gate.downDone) return;
    gate.downDone = true;
    if (gate.alive) { gate.hp = 0; gate.alive = false; rt.army.structFall(gate); }
    rt.unmark(gate === F.gE ? 'gE' : 'gN');
    sfx('taiko', 0.8);
    rt.banner(`${gate.name}、破らる`, gate === F.gE ? '明智勢が境内へなだれ込む' : '裏からも明智勢が入ってくる');
    for (const g of F.foes) if (g.gate === gate) { g.order = 'attack'; g.seekRange = 140; g.aggro = 40; g.assault = null; }
    if (gate === F.gE) this.lordCourt(rt);
  },
  // 判断②：表門が破られた。自ら槍を取るか、すぐ奥へ下がるか
  lordCourt(rt) {
    const F = rt.flags;
    if (F.lstep >= 1.5) return;
    F.lstep = 1.5; F.stepT = rt.t;
    rt.objDone('sally'); rt.objRemove('sally');
    rt.say('森蘭丸', '殿！　門が破られました。奥へお下がりくだされ！', 3);
    rt.choose('表門が破られた。どうする？', [
      { label: '自ら槍を取り、境内で明智勢を押し返す', note: '供の者が奮い立つ。ただ、手傷を負うおそれ' },
      { label: '蘭丸らに任せ、すぐに奥へ下がる', note: '火を放つ支度が早くできる。ただ、小姓衆が削られる' },
    ], (i) => {
      if (i === 1) {
        // 小姓衆が身代わりに削られる（蘭丸は残す）。坊丸・力丸には名乗りの言葉を
        if (F.bo && F.bo.alive) { rt.say('森坊丸', '兄上、それがしも参ります！　三兄弟、ここが死に場所にござる！', 3); F.bo.invuln = false; rt.army.kill(F.bo, null); }
        if (F.riki && F.riki.alive) { rt.say('森力丸', '力丸、お供つかまつる……！', 2.5); F.riki.invuln = false; rt.army.kill(F.riki, null); }
        let n = 0;
        for (const u of F.kosho.units) if (u.alive && u !== F.ran && u !== F.bo && u !== F.riki && n < 2) { u.invuln = false; rt.army.kill(u, null); n++; }
        this.lordBack(rt);
        return;
      }
      F.court = rt.t;
      rt.say('織田信長', '槍を持て！　……わしの首が欲しくば、取りに来い', 3);
      rt.obj('main', '境内で明智勢を押し返せ', 'main');
      rt.marker('court', { x: HONNO.x + 8, z: HONNO.z - 2 }, '境内', { h: 2 });
      for (const g of rt.squadGroups) { g.order = 'hold'; g.anchor = { x: HONNO.x + 6, z: HONNO.z - 12 }; g.aggro = 10; g.morale = Math.min(100, g.morale + 30); }
      F.kosho.morale = 100;
      this.lordWave(rt, '境内へなだれ込む明智勢', { x: HONNO_GATE.x + 10, z: HONNO_GATE.z + 4 }, null, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 10 }]);
      rt.after(28, () => { if (F.lstep === 1.5) { this.lordWave(rt, '門から続く明智の新手', { x: HONNO_GATE.x + 12, z: HONNO_GATE.z - 4 }, null, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 8 }]); rt.say('小姓', '新手が門から！　殿、もう十分にございます！', 3); } });
    }, 16);
  },

  // ② 奥へ下がる
  lordBack(rt) {
    const F = rt.flags;
    if (F.lstep >= 2) return;
    if (F.court) { rt.unmark('court'); if (!F.ending) rt.award((t) => t.side.push('自ら槍を取り、境内で明智勢を押し返した'), '自ら槍を振るった'); }
    F.lstep = 2; F.stepT = rt.t;
    rt.setPhase('back');
    rt.say('森蘭丸', '殿、ここは我らが防ぎまする。奥へお下がりくだされ！', 3.5);
    rt.obj('main', '奥（御殿の裏）へ下がれ', 'main');
    rt.marker('oku', OKU, '奥', { h: 2 });
    rt.zone('oku', OKU.x, OKU.z, 3.6);
    // 蘭丸らは御殿の前で踏みとどまる
    F.kosho.anchor = { x: HONNO.x + 8, z: HONNO.z - 2 }; F.kosho.aggro = 14; F.koshoStay = Infinity;
    // 供の者は御殿の北の庭で踏みとどまる（狭い奥へ皆で押し込むと、火を放つ所まで行けない）
    for (const g of rt.squadGroups) { g.order = 'hold'; g.anchor = { x: HONNO.x - 5, z: HONNO.z - 11 }; g.facing = Math.PI / 2; g.dest = null; }
    // 蘭丸らが前に出た間に、手傷を縛る（下がる間の一息）
    { const u = rt.player.u; if (u.alive) u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.4); }
    // 境内の明智勢は、蘭丸らに阻まれてしばし足が止まる
    for (const g of F.foes) if (!gone(g)) { g.focus = null; g.morale = Math.min(g.morale, 65); }
    rt.after(14, () => this.lordWave(rt, '境内へ討ち入る明智勢', { x: HONNO_GATE.x + 14, z: HONNO_GATE.z }, null, [{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 12 }]));
    F.moreT = rt.t + 26;
  },
  // ②' 御殿の縁で、斎藤利三の手を防ぐ（明智の大きな波。蘭丸らと並んで、火を放つ間を稼ぐ）
  lordRishi(rt) {
    const F = rt.flags;
    if (F.lstep >= 2.5) return;
    F.lstep = 2.5; F.stepT = rt.t; F.moreT = rt.t + 999;
    rt.setPhase('rishi');
    rt.unmark('oku'); rt.unzone('oku');
    sfx('taiko', 0.8);
    rt.banner('斎藤利三の手、討ち入る', '明智の先手の大将が、御殿へ寄せる');
    rt.say('森蘭丸', '殿、あれは斎藤内蔵助（利三）の旗！　明智の一の家老にござる！', 3.5);
    rt.say('織田信長', '……内蔵助か。火を放つ間を稼ぐ。御殿の縁で防げ', 3.5);
    rt.obj('main', '御殿の縁で、斎藤利三の手を防げ', 'main');
    F.kosho.anchor = { x: OKU.x + 6, z: OKU.z - 8 }; F.kosho.aggro = 14; F.koshoStay = Infinity;
    for (const g of rt.squadGroups) { g.order = 'hold'; g.anchor = { x: OKU.x + 3, z: OKU.z - 9 }; g.aggro = 12; g.dest = null; }
    { const u = rt.player.u; if (u.alive) u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.45); }
    // 境内に残った明智勢は、一度門の内まで退いて利三の手に代わる（先手の入れ替え。押し潰されないよう、利三の手とだけ戦う）
    this.lordFallBack(rt);
    // 町の宿所から、馬廻の者が築地を越えて駆けつける（史実でも、町にいた馬廻の者が本能寺へ走り、討ち死にした）
    const mw = allyGroup(rt, { name: '駆けつけた馬廻', anchor: { x: OKU.x + 5, z: OKU.z - 11 }, facing: Math.PI / 2, width: 6, aggro: 12, noRout: true },
      dress([{ type: 'samurai', n: 5 }], ODA));
    mw.defMult = 1.3;
    rt.say('馬廻', '上様！　町の宿所より、馬廻の者、駆けつけましてござる！', 3);
    // 馬廻も駆けつけ、共に御殿の縁で防ぐ構え。小袖のままだった信長も、蘭丸が投げ渡した羽織だけ纏う（具足を着ける間は無い）
    rt.say('森蘭丸', '殿、これなりとお召しくだされ！', 2.5);
    { const u = rt.player.u; if (u.alive) u.look = { ...u.look, haori: 0x7a1d14, haoriMonCol: 0xc9a24a, mon: 'oda' }; }
    const g = this.lordWave(rt, '斎藤利三の手', { x: HONNO.x + 12, z: HONNO.z - 13 }, null,
      [{ type: 'busho', n: 1, o: { name: '斎藤利三' } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 7 }], { dmgMult: 0.5 });
    if (g) {
      F.rishi = g; g.noRout = false;
      F.rishiU = g.units.find((x) => x.type === 'busho');
      if (F.rishiU) F.rishiU.nanori = '明智の斎藤内蔵助利三なり！　上様、お覚悟めされよ！';
      rt.marker('rishi', centerOf(g), () => `斎藤利三の手・${moraleWord(g.morale)}`, { red: true, group: g });
    }
    rt.after(34, () => { if (F.lstep === 2.5) { this.lordWave(rt, '利三の二の手', { x: HONNO.x + 12, z: HONNO.z + 8 }, null, [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 7 }], { dmgMult: 0.5 }); rt.say('小姓', '南の縁からも回って参ります！', 3); } });
    rt.after(72, () => { if (F.lstep === 2.5) { this.lordWave(rt, '御殿の縁へ回る明智勢', { x: HONNO.x + 10, z: HONNO.z - 14 }, null, [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 6 }], { dmgMult: 0.5 }); rt.say('森蘭丸', 'もう少しにござる！　持ちこたえよ！', 3); } });
    rt.bark('御殿の縁で踏みとどまれ。しのげば、火を放つ支度が整う');
  },
  // 境内の明智勢を表門の内まで下げる（段の入れ替わりの間。火と煙、蘭丸らに阻まれて）
  lordFallBack(rt) {
    const F = rt.flags;
    for (const q of F.foes) {
      if (gone(q) || q === F.rishi) continue;
      const c = q.center();
      if (!inHonno(c.x, c.z, 6)) continue;
      q.order = 'move'; q.dest = { x: HONNO_GATE.x - 3, z: HONNO_GATE.z + (Math.random() - 0.5) * 10 }; q.speed = 2.6;
      q.focus = null; q.aggro = 4; q.dmgMult = Math.min(q.dmgMult ?? 1, 0.5); q.morale = Math.min(q.morale, 45);
      q.onArrive = (qq) => { qq.order = 'hold'; qq.anchor = { ...qq.dest }; };
    }
  },
  // ③ 御殿に火を放つ
  lordFireStep(rt) {
    const F = rt.flags;
    if (F.lstep >= 3) return;
    F.lstep = 3; F.stepT = rt.t;
    rt.setPhase('fire');
    rt.unmark('oku'); rt.unzone('oku'); rt.unmark('rishi');
    rt.say('織田信長', '……わしの首、明智に渡すな。御殿に火をかけよ', 3.5);
    rt.obj('main', '御殿に火を放て', 'main');
    rt.addInteract('fire', { x: OKU.x, z: OKU.z }, '御殿に火を放つ', () => this.lordBurn(rt), { r: 5.5, hold: 1.2, prio: 6 });
    // 蘭丸らが御殿の前を支える間は、新手が奥まで来ない（火を放つ間を作る）
    F.moreT = rt.t + 22;
    for (const g of F.foes) if (!gone(g)) { const c = g.center(); if (Math.hypot(c.x - OKU.x, c.z - OKU.z) < 14) { g.morale = Math.min(g.morale, 55); g.focus = null; } }
    rt.bark('奥の印のそばで長押しすると、御殿に火を放つ');   // 奥は供の者で混み合うので、少し離れていても火を放てる
  },
  lordBurn(rt) {
    const F = rt.flags;
    if (F.burnT) return;
    F.burnT = rt.t;
    rt.uninteract('fire');
    // 御殿（本堂）に火がかかる。周りの棟へは makeTempleFire が少しずつ燃え移らせる（一度に伽藍を燃やさない）
    F.fire.ignite('hondo', '御殿の火');
    rt.banner('本能寺、炎上', '御殿から火の手が上がった');
    sfx('kane', 0.5);
    rt.award((t) => t.side.push('御殿に火を放った'), '御殿に火を放った');
    // 火の手に、境内の明智勢の足が止まる（しばらく）
    for (const g of F.foes) if (!gone(g)) g.morale = Math.min(g.morale, 60);
    this.lordFlee(rt);
  },
  // ③' 火の回る御殿の奥へ：煙の中を西の縁から奥の納戸へ抜け、納戸で明智の探す手をやり過ごす
  //   火は後ろから回る。ぐずぐずしていると炎に巻かれて負け
  lordFlee(rt) {
    const F = rt.flags;
    if (F.lstep >= 3.5) return;
    F.lstep = 3.5; F.stepT = rt.t; F.fleeI = 0; F.moreT = rt.t + 40;
    rt.setPhase('flee');
    F.koshoStay = 0;
    for (const g of rt.squadGroups) g.order = 'follow';
    rt.say('森蘭丸', '火が回ります！　殿、奥の納戸へ。煙の中なら、明智の目も届きませぬ！', 4);
    rt.obj('main', '火の回る御殿の奥へ逃れよ（西の縁から、奥の納戸へ）', 'main');
    rt.bark('炎は後ろから迫る。足を止めずに、奥の印へ');
    this.lordFleeMark(rt);
    // 火と煙で、境内の明智勢は信長を見失う（蘭丸らが間に立つ）。煙を吸わぬよう、手傷を縛って走る
    this.lordFallBack(rt);
    { const u = rt.player.u; if (u.alive) u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.3); }
    // 煙の中で道を塞ぐ明智勢（納戸の前）
    rt.after(3, () => { const g = this.lordWave(rt, '煙の中の明智勢', { x: FLEE[2].x + 2, z: FLEE[2].z - 3 }, null, [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 4 }], { dmgMult: 0.5, seekRange: 40 }); if (g) rt.say('明智の侍', '煙の奥に人影！　逃がすな！', 2.5); });
  },
  lordFleeMark(rt) {
    const F = rt.flags, w = FLEE[F.fleeI];
    rt.marker('flee', w, w.name, { h: 2 });
    rt.zone('flee', w.x, w.z, 2.6);
  },
  // 一つの所に着いた：通ってきた所に火が回る。納戸に着いたら、煙に身を潜めてしのぐ
  lordFleeReach(rt) {
    const F = rt.flags, W = rt.world, w = FLEE[F.fleeI];
    const back = F.fleeI === 0 ? OKU : FLEE[F.fleeI - 1];
    W.addFire(back.x, back.z, { h: 2.4 }); W.addSmokeColumn(back.x, 8, back.z, { size: 2.6 });
    sfx('kane', 0.25);
    F.fleeI++;
    if (F.fleeI < FLEE.length) {
      rt.say('小姓', `${w.name}にも火が！　奥へ、奥へ！`, 2.5);
      this.lordFleeMark(rt);
      return;
    }
    rt.unmark('flee'); rt.unzone('flee');
    F.hideT = rt.t;
    rt.obj('main', '奥の納戸で煙に身を潜め、明智の探す手をしのげ', 'main');
    rt.say('森蘭丸', 'ここで息を殺して……。火が回りきる前に、煙に紛れて外へ出まする', 4);
    rt.award((t) => t.side.push('火の回る御殿を抜け、奥の納戸へ逃れた'), '火の回る御殿を抜けた');
    rt.after(6, () => { if (F.lstep === 3.5) { this.lordWave(rt, '御殿を探す明智勢', { x: HONNO.x + 10, z: HONNO.z + 9 }, null, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 6 }], { dmgMult: 0.5, seekRange: 40 }); rt.say('明智の侍', '上様（信長）は奥におるはずじゃ。納戸を探せ！', 3); } });
    rt.after(44, () => { if (F.lstep === 3.5) { this.lordWave(rt, '縁の下を探す明智勢', { x: HONNO.x + 8, z: HONNO.z + 13 }, null, [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 5 }], { dmgMult: 0.5, seekRange: 40 }); rt.say('明智の侍', '縁の下も、納戸も探せ！　首を見つけた者には褒美じゃ！', 3); } });
    rt.after(60, () => { if (F.lstep === 3.5) { rt.say('小姓', '煙が濃うなって参りました。もう、あと少し……！', 2.5); } });
    rt.after(24, () => { if (F.lstep === 3.5) this.lordWave(rt, '御殿を探す明智勢', { x: HONNO.x + 9, z: HONNO.z - 11 }, null, [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 6 }], { dmgMult: 0.5, seekRange: 40 }); });
  },

  // ④ 囲みを破って落ちのびる
  lordEscape(rt) {
    const F = rt.flags;
    if (F.lstep >= 4) return;
    F.lstep = 4; F.stepT = rt.t; F.escT = rt.t;
    rt.setPhase('escape');
    F.koshoStay = 0;
    for (const g of rt.squadGroups) g.order = 'follow';
    rt.say('森蘭丸', '殿！　煙に紛れれば、囲みの薄い所を抜けられるやもしれませぬ。……お落ちくだされ！', 5);
    { const u = rt.player.u; if (u.alive) u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.3); }
    rt.obj('main', '囲みを破って落ちのびよ（本能寺から離れよ）', 'main');
    rt.obj('side', '炎が御殿を包む前に、築地の外へ出よ', 'side');
    if (F.gN.alive) this.lordGateDown(rt, F.gN);
    rt.marker('outN', { x: GATE_N.x, z: GATE_N.z - 2 }, '裏門（北）', { h: 2.5 });
    rt.addInteract('wallW', WALL_W, '築地を越える（松の枝を伝う）', () => this.lordOverWall(rt), { r: 2.6, hold: 1.8, prio: 6 });
    rt.marker('outW', WALL_W, '西の築地（越えられる）', { h: 2.5 });
    rt.bark('落ち口は北の裏門と西の築地。西は松の枝を伝って越えよ。囲みの薄くなる時を見よ');
    // 判断③：小姓衆をどうするか。囲みの破れ目の開く時が変わる
    const open = (a, b, c) => {
      rt.after(a, () => { if (F.ending) return; this.lordPull(rt, F.ringN); rt.bark('北の囲みが表へ回された。裏門の外が薄い！'); });
      rt.after(b, () => { if (F.ending) return; this.lordPull(rt, F.ringW); rt.bark('西の囲みが表へ回された。西の築地の外が薄い！'); });
      rt.after(c, () => { if (!F.ending) this.lordSouth(rt); });
    };
    rt.choose('囲みを破る。小姓衆をどうする？', [
      { label: '小姓衆を連れ、共に落ちる', note: '供が守ってくれる。ただ、囲みの破れ目は時を待たねばならぬ' },
      { label: '蘭丸らに表で鬨を上げさせ、囲みを引きつける', note: '囲みが早く表へ回る。ただ、小姓衆は戻らぬ' },
    ], (i) => {
      if (i === 0) { open(20, 40, 60); rt.say('森蘭丸', 'お供つかまつる！　煙の薄い所を探しまする', 3); return; }
      F.decoy = true;
      F.koshoStay = Infinity; F.kosho.anchor = { x: HONNO_GATE.x - 3, z: HONNO_GATE.z }; F.kosho.aggro = 18;
      rt.say('森蘭丸', '……承知。我ら、表で鬨を上げまする。殿、どうかご無事で', 4);
      rt.after(3, () => rt.army.play('shout', { x: HONNO_GATE.x, z: HONNO_GATE.z }, 1.4));
      rt.award((t) => t.side.push('蘭丸らに囲みを引きつけさせた'), '蘭丸らが囲みを引きつけた');
      open(8, 18, 40);
    }, 14);
    // 境内へ新手が入り続ける（納戸に潜んだ後なので、少し間を置いてから）
    F.moreT = rt.t + 18;
  },
  // 囲みの一手を、表門の前へ回す（その辺りが手薄になる）
  // 西の囲みは、真っ直ぐ行くと西の築地（壁）に阻まれて詰まる（kaito 10/1 bot確かめで発見：x=-70 辺りで止まったまま動かなくなっていた）。
  // 北の辻の外を回ってから表へ出す（北の囲みと同じ、壁に遮られない外回りの道）
  lordPull(rt, g) {
    if (gone(g)) return;
    if (g === rt.flags.ringN) rt.flags.nOpen = true; else rt.flags.wOpen = true;
    const dest = { x: HONNO_GATE.x + 18, z: HONNO_GATE.z + (g === rt.flags.ringN ? -12 : 12) };
    g.speed = 2.6;
    if (g === rt.flags.ringW) {
      const via1 = { x: HONNO.x - HONNO.h - 6, z: HONNO.z - HONNO.h - 6 };
      const via2 = { x: HONNO.x + HONNO.h + 6, z: HONNO.z - HONNO.h - 6 };
      g.order = 'move'; g.dest = via1;
      g.onArrive = (q) => { q.dest = via2; q.onArrive = (q2) => { q2.dest = dest; q2.onArrive = (q3) => { q3.order = 'hold'; q3.anchor = { ...q3.dest }; }; }; };
      return;
    }
    g.order = 'move'; g.dest = dest;
    g.onArrive = (q) => { q.order = 'hold'; q.anchor = { ...q.dest }; };
  },
  lordSouth(rt) {
    const F = rt.flags;
    F.sOpen = true;
    for (const s of F.sWall) { s.hp = 0; s.alive = false; rt.army.structFall(s); }
    const W = rt.world;
    for (const s of F.sWall) { const x = (s.seg[0] + s.seg[2]) / 2, z = (s.seg[1] + s.seg[3]) / 2; W.addFire(x, z - 1.5, { h: 2 }); W.addSmokeColumn(x, 7, z, { size: 2.6 }); }
    rt.banner('南の築地が崩れた', '火が回り、南の囲みが煙を避けて退く');
    // 崩れた築地の火と煙に、境内の明智勢もしばし浮き足立つ（この間は新手も入らない）
    for (const g of F.foes) if (!gone(g)) { const c = g.center(); if (inHonno(c.x, c.z, 4)) { g.morale = Math.min(g.morale, 35); g.focus = null; g.aggro = Math.min(g.aggro, 8); } }
    F.moreT = rt.t + 20;
    rt.marker('outS', { x: S_BREAK.x, z: S_BREAK.z + 2 }, '崩れた南の築地', { h: 2.5 });
    // 南西の辻の固めは、煙に巻かれて浮き足立つ（数は残るが、手はゆるむ）
    const sw = F.corner.sw;
    if (!gone(sw)) { sw.aggro = 7; sw.dmgMult = 0.75; sw.morale = Math.min(sw.morale, 45); }
    // 南の囲みは、残りの者も火と煙を避けて東へ退く（南西の辻の固めだけが残る）
    for (const [g, dx] of [[F.ringS, 36], [F.ringS2, 42]]) if (!gone(g)) { g.order = 'move'; g.dest = { x: HONNO.x + dx, z: HONNO.z + HONNO.h + 26 }; g.speed = 2.4; g.aggro = 6; g.onArrive = (q) => { q.order = 'hold'; q.anchor = { ...q.dest }; }; }
  },
  lordOverWall(rt) {
    const u = rt.player.u;
    u.pos.x = WALL_W_OUT.x; u.pos.z = WALL_W_OUT.z; u.pos.y = rt.world.heightAt(u.pos.x, u.pos.z);
    if (u.mesh) u.mesh.position.copy(u.pos);
    rt.say('織田信長', '……者ども、続け', 2.5);
    rt.bark('西の築地を越えた。供の者は築地の内に残る');
  },
  // 外へ出たら、明智の追手（騎馬）がかかる
  lordChase(rt) {
    const F = rt.flags, p = rt.player.u.pos;
    const dx = p.x - HONNO.x, dz = p.z - HONNO.z, L = Math.hypot(dx, dz) || 1;
    const side = F.chaseN % 2 ? 1 : -1;
    const at = { x: HONNO.x + (dx / L) * 40 - (dz / L) * 26 * side, z: HONNO.z + (dz / L) * 40 + (dx / L) * 26 * side };
    F.chaseN = (F.chaseN || 0) + 1;
    const g = this.lordWave(rt, '明智の追手', at, null, [{ type: 'cavalry', n: 3 }, { type: 'samurai', n: 1 }, { type: 'ashigaru', n: 6 }], { seekRange: 200, aggro: 60, dmgMult: 0.66 });
    if (g) g.focus = rt.player.u;   // 追手は信長だけを狙う
    if (g) rt.say('明智の侍', '築地の外へ出た者がおるぞ！　逃がすな、追えっ！', 3);
  },

  lordWin(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    for (const id of ['outN', 'outW', 'outS']) rt.unmark(id);
    rt.uninteract('wallW');
    rt.objDone('main'); rt.objDone('side');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '本能寺の囲みを破って落ちのびた', pts: 40 }; }, '任務達成・囲みを破った');
    sfx('kane', 0.5);
    rt.banner('本能寺を落ちのびる', '――もしも、信長が生きていたら');
    rt.unmark('dest'); rt.unzone('dest'); rt.unmark('block');
    rt.say('', F.dest && F.dest.i === 0 ? '――煙と夜明けの闇に紛れ、信長は妙覚寺の信忠のもとへたどり着いた。背の本能寺は、なお燃えている' : '――煙と夜明けの闇に紛れ、信長は東山の麓へ落ちのびた。背の本能寺は、なお燃えている', 6);
    rt.after(6, () => rt.say('', '――史実の信長は、ここで火をかけ自害した。享年四十九。遺体は見つからなかった', 5.5));
    rt.player.u.invuln = true;
    rt.finish({}, 13);
  },
  // 史実どおりの最期（討たれた・炎に呑まれた）
  lordEnd(rt, how) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    const me = rt.player.u;
    me.hp = 0; me.alive = false; me.fall = 1; me.deadT = 0;
    rt.tracker.main = false;
    rt.banner('是非に及ばず', how === 'fire' ? '炎が御殿を包んだ' : '織田信長、本能寺に死す');
    rt.say('', '――信長は奥の間に入り、火の中で自害したと伝わる。享年四十九', 5);
    rt.after(5, () => rt.say('', '――遺体は見つからなかった。十一日後、羽柴秀吉が山崎で明智光秀を破る', 5));
    rt.finish({ down: true }, 10);
  },

  lordTick(rt, dt) {
    const F = rt.flags;
    for (const m of rt.markers.slice()) if (m.group && gone(m.group)) rt.unmark(m.id);
    if (F.fire) F.fire.tick(dt);
    if (F.ending) return;
    const u = rt.player.u, p = u.pos;
    // 小姓衆は自分のそばに付く（奥へ下がる間は、蘭丸らが御殿の前で踏みとどまる）
    if (!gone(F.kosho) && !(F.koshoStay > rt.t)) { F.kosho.order = 'hold'; F.kosho.anchor = { x: p.x - Math.sin(u.heading || 0) * 2.5, z: p.z - Math.cos(u.heading || 0) * 2.5 }; }
    if (F.ran && !F.ran.alive && !F.ranDead) { F.ranDead = true; rt.say('小姓', '蘭丸様、討死……！', 3); }
    if (F.lstep === 1) {
      const t = rt.t - F.stepT;
      // 表門は四十五秒は持つ。裏門は六十秒（それより前に崩れそうでも、門の者が支える）
      if (t < F.gateHold && F.gE.alive && F.gE.hp < 200) F.gE.hp = 200;
      if (t < F.gateHold + 10 && F.gN.alive && F.gN.hp < 200) F.gN.hp = 200;
      rt.objProgress('main', `表門 ${Math.max(0, Math.round(F.gE.hp / F.gE.maxHp * 100))}%`);
      // 打って出た先手を崩した
      if (F.sally && !F.sallyDone) {
        const S = F.foes.filter((g) => g.sallied);
        if (S.every((g) => gone(g) || g.count <= 2)) {
          F.sallyDone = true; rt.objDone('sally');
          rt.award((t2) => t2.side.push('門を開いて打って出て、明智の先手を崩した'), '先手を崩した');
          rt.say('森蘭丸', '先手が崩れました！　殿、門の内へお戻りを！', 3);
          for (const g of S) if (!gone(g)) g.morale = 0;
        } else if (rt.t - F.sallyT > 60) { F.sallyDone = true; rt.objFail('sally'); }
      }
      if (!F.gE.alive || t > F.gateMax) this.lordGateDown(rt, F.gE);
    }
    if (F.lstep === 1.5 && F.court) {
      const left = Math.max(0, 45 - (rt.t - F.court));
      rt.objProgress('main', `押し返す あと${Math.ceil(left)}秒`);
      if (left <= 0) this.lordBack(rt);
    }
    if (F.gN.alive === false && !F.gNDown) { F.gNDown = true; if (F.lstep < 4) this.lordGateDown(rt, F.gN); }
    else if (F.gN.alive === false) F.gNDown = true;
    if (F.lstep === 2) {
      const d = Math.hypot(p.x - OKU.x, p.z - OKU.z);
      rt.objProgress('main', `奥まで ${Math.max(0, Math.round(d))}m`);
      if (d < 6 || rt.t - F.stepT > 35) this.lordRishi(rt);
    }
    if (F.lstep === 2.5) {
      const left = Math.max(0, 90 - (rt.t - F.stepT));
      rt.objProgress('main', `火を放つ支度まで ${Math.ceil(left)}秒`);
      if (F.rishiU && !F.rishiU.alive && !F.rishiDead) {
        F.rishiDead = true;
        rt.say('森蘭丸', '内蔵助、討ち取ったり！　明智の先手の足が止まりましたぞ！', 3);
        for (const g of F.foes) if (!gone(g)) g.morale = Math.min(g.morale, 50);
      }
      if (left <= 0 || (F.rishiDead && rt.t - F.stepT > 65)) this.lordFireStep(rt);
    }
    if (F.lstep === 3 && rt.t - F.stepT > 28) { rt.say('小姓', '火は我らが！　……殿、お早く！', 3); this.lordBurn(rt); }
    if (F.lstep === 3.5) {
      const left = Math.max(0, 110 - (rt.t - F.stepT));
      if (F.hideT) {
        const h = Math.max(0, 70 - (rt.t - F.hideT));
        rt.objProgress('main', `身を潜める あと${Math.ceil(h)}秒`);
        if (h <= 0) { rt.say('森蘭丸', '火が納戸に！　今です、煙に紛れて外へ！', 3); this.lordEscape(rt); }
      } else {
        const w = FLEE[F.fleeI], d = Math.hypot(p.x - w.x, p.z - w.z);
        rt.objProgress('main', `${w.name}まで ${Math.round(d)}m・火に巻かれるまで ${Math.ceil(left)}秒`);
        if (d < 3) this.lordFleeReach(rt);
        else if (left <= 0) { this.lordEnd(rt, 'fire'); return; }
      }
    }
    // 新手（境内へ討ち入る）
    if (F.lstep >= 2 && F.moreT && rt.t > F.moreT) {
      F.moreT = rt.t + (F.lstep >= 4 ? 16 : 18);
      const n = F.lstep >= 4 ? 8 : 10;
      const g = this.lordWave(rt, '境内へ討ち入る明智勢', { x: HONNO_GATE.x + 14, z: HONNO_GATE.z + (Math.random() - 0.5) * 10 }, null, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n }], { dmgMult: F.lstep >= 4 ? 0.85 : 0.72 });
      if (g && F.lstep >= 4) g.focus = u;   // 火を放った後の新手は、信長の首を探す
    }
    if (F.lstep === 4) {
      const left = Math.max(0, 130 - (rt.t - F.escT));
      const inside = inHonno(p.x, p.z, 0.5);
      const far = Math.hypot(p.x - HONNO.x, p.z - HONNO.z);
      if (!F.dest) rt.objProgress('main', inside ? `炎が御殿を包むまで ${Math.round(left)}秒` : `本能寺から ${Math.round(far)}m`);
      if (!inside && !F.outT) rt.objDone('side');
      if (!inside) { if (!F.outT) { F.outT = rt.t; F.chaseT = rt.t + 16; } }
      if (F.chaseT && rt.t > F.chaseT && (F.chaseN || 0) < (F.chaseMax || 4)) { F.chaseT = rt.t + 20; this.lordChase(rt); }
      if (left <= 0 && inside) { this.lordEnd(rt, 'fire'); return; }
      // 判断④：築地の外へ出たら、どこへ落ちるかを決める
      if (!inside && !F.destAsk) {
        F.destAsk = true;
        rt.choose('築地の外へ出た。どこへ落ちる？', [
          { label: '妙覚寺の信忠のもとへ（北東の町）', note: '近い。ただ、通りを明智の兵が固めている' },
          { label: '東山へ走り、山に紛れる（東）', note: '遠い。追手の騎馬が幾度もかかる' },
        ], (i) => {
          F.dest = i === 0 ? { ...MYO, name: '妙覚寺', i } : { ...HIGASHI, name: '東山の麓', i };
          rt.marker('dest', F.dest, F.dest.name, { h: 3 });
          rt.zone('dest', F.dest.x, F.dest.z, 8);
          rt.obj('main', `${F.dest.name}へ落ちのびよ`, 'main');
          if (i === 0) {
            const g = this.lordWave(rt, '通りを固める明智勢', { x: -4, z: 4 }, null, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 10 }], { order: 'hold', aggro: 16, dmgMult: 0.6 });
            if (g) { g.noRout = false; rt.marker('block', centerOf(g), () => `通りを固める明智勢・${moraleWord(g.morale)}`, { red: true, group: g }); }
            rt.say('小姓', '辻の先に桔梗の旗！　通りを固めております。脇をすり抜けるか、割るか……', 3.5);
          } else { F.chaseMax = 6; rt.say('小姓', '東山までは遠うございます。追手に追いつかれぬよう、足を止めずに！', 3.5); }
        }, 12);
      }
      if (F.dest) {
        const dd = Math.hypot(p.x - F.dest.x, p.z - F.dest.z);
        rt.objProgress('main', `${F.dest.name}まで ${Math.round(dd)}m`);
        if (dd < 9 || (F.outT && rt.t - F.outT > 240)) this.lordWin(rt);
      }
    }
  },
});
honnoji.lordDown = (rt) => honnoji.lordEnd(rt, 'down');

// 素直な信長の bot：表門の内で戦い、奥へ下がって火を放ち、いちばん先に開いた落ち口へ走る
// （window.__lordSmart のときは、南の築地が崩れるまで奥でしのいでから南へ出る）
function lordBot(b, inp, goTo) {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyE');
  inp.guardHold = false;
  if (!u.alive || F.ending) return;
  const fight = (r) => {
    const e = b.army.nearestEnemy(u, r, (o) => !o.fleeing);
    if (!e) return false;
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d > 2.6) inp.k.add('KeyW');
    if (d < 3.2 && Math.random() < 0.5) inp.leftPressed = true;
    inp.guardHold = (b.army.threats || []).length > 0 && Math.random() < 0.7;
    return true;
  };
  const follow = (key, pts) => {
    if (b.botPath !== key) { b.botPath = key; b.botWp = 0; }
    const w = pts[Math.min(b.botWp, pts.length - 1)];
    if (Math.hypot(w[0] - u.pos.x, w[1] - u.pos.z) < 2.2 && b.botWp < pts.length - 1) b.botWp++;
    goTo(p, inp, w[0], w[1], 1);
  };
  const step = F.lstep || 0;
  if (step < 2) { if (fight(8)) return; follow('gate', [[HONNO.x - 2, HONNO.z - 14.5], [HONNO.x + 12, HONNO.z - 14.5], [HONNO.x + 12, HONNO.z]]); return; }   // 御殿の北を回って表門の内へ
  if (step === 2) { if (fight(1.8)) return; follow('oku', [[HONNO.x + 12, HONNO.z - 14.5], [HONNO.x - 2, HONNO.z - 14.5], [OKU.x, HONNO.z - 11], [OKU.x, OKU.z]]); return; }
  if (step === 2.5) { if (fight(2.6)) return; goTo(p, inp, OKU.x + 1, OKU.z - 5, 1.5); return; }   // 小姓衆の後ろで構え、寄ってきた者とだけ斬り合う
  if (step === 3.5) {
    if (F.hideT) { if (fight(5)) return; goTo(p, inp, FLEE[FLEE.length - 1].x, FLEE[FLEE.length - 1].z, 1.5); return; }
    if (fight(1.6)) return;
    const w = FLEE[Math.min(F.fleeI || 0, FLEE.length - 1)]; goTo(p, inp, w.x, w.z, 1); return;
  }
  if (step === 3) { const it = b.nearestInteract(); if (!it || it.id !== 'fire') { goTo(p, inp, OKU.x, OKU.z, 1); return; } inp.k.add('KeyE'); return; }   // 斬りかかられても、火を放つ手は止めない
  // ④ 落ち口：素直な bot は開いている所へすぐ走る（北の裏門）。賢い bot は南が崩れるまで待つ
  const smart = typeof window !== 'undefined' && window.__lordSmart;
  const inside = inHonno(u.pos.x, u.pos.z, 0.5);
  if (!b.botRoute) b.botRoute = smart ? (F.sOpen ? 's' : '') : (F.nOpen ? 'n' : '');   // 素直な bot も、北の囲みが表へ回るまでは奥で待つ
  if (smart && !b.botRoute && F.sOpen) b.botRoute = 's';
  if (!b.botRoute) { if (fight(3)) return; goTo(p, inp, OKU.x, OKU.z + 4, 1.5); return; }
  if (!inside && fight(1.3)) return;   // 外では斬り合わず走る
  if (inside && fight(1.4)) return;
  const fin = F.dest ? [[F.dest.x, F.dest.z]] : [];
  if (b.botRoute === 'n') follow('n', [[OKU.x, HONNO.z - 11], [GATE_N.x, GATE_N.z + 3], [GATE_N.x, GATE_N.z - 4], [HONNO.x + 24, HONNO.z - 36], ...fin]);
  else follow('s', [[OKU.x - 0.4, HONNO.z + 6], [OKU.x - 0.4, S_BREAK.z - 2], [S_BREAK.x - 3, S_BREAK.z - 1.5], [S_BREAK.x - 3, S_BREAK.z + 5], [HONNO.x - 20, HONNO.z + 38], ...(fin.length ? fin : [[HONNO.x - 22, HONNO.z + 80]])]);   // 辻の固めの脇をすり抜ける
}

// 両軍の総勢（京にいた織田の者 千五百ほど。明智 一万三千ほど。数には諸説ある）
honnoji.force = (rt) => {
  const F = rt.flags;
  // 信長で遊ぶ時：寺にいた供回りは百五十ほど（小姓衆と馬廻の一部）
  if (rt.G.lord) { const n = rt.army.units.filter((u) => u.alive && u.team === 0).length; F.a0n = F.a0n || n || 1; return { a: Math.round(150 * n / F.a0n), a0: 150, b: Math.max(0, 13000 - (F.ek || 0) * 10), b0: 13000 }; }
  return { a: Math.max(0, 1500 - (F.ak || 0) * 8 - (F.step >= 5 ? 900 : 0)), a0: 1500, b: Math.max(0, 13000 - (F.ek || 0) * 10), b0: 13000 };
};
honnoji.sides = { a: { name: '織田軍', mon: 'oda' }, b: { name: '明智軍', mon: 'akechi' } };
// 史実でこの戦にいた名のある武将（battle.js の placeFamous が、その家の隊に加える。敵は名乗り、討てば手柄）
honnoji.famous = [
  { name: '明智秀満', g: /辻|囲み|明智/, loose: 1, line: '明智左馬助秀満なり！　敵は本能寺にあり！' },
  { name: '安田国継', g: /境内|先手|明智/, loose: 1, line: '明智の安田作兵衛国継なり！　一番槍はわしが付ける！' },
];
honnoji.date = (rt) => `天正十年六月二日　夏・${!rt.G.lord && rt.flags.step >= 3 ? '朝' : '夜明け前'}`;
honnoji.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '話を飛ばす' : '');
honnoji.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
honnoji.history = '天正十年（1582）六月二日の夜明け前、中国の毛利攻めに向かうはずだった明智光秀の軍一万三千ほどが、京の本能寺を囲んだ。わずかな供と泊まっていた織田信長は、明智の謀反と知って「是非に及ばず」と言い、自ら弓や槍を取って戦ったが、傷を負って奥へ入り、火を放って自害したと『信長公記』は伝える。森成利（蘭丸）ら小姓衆も討ち死にした。近くの妙覚寺にいた嫡男の信忠は、村井貞勝らと二条御所（二条新御所）に移り、誠仁親王を御所の外へ移してから戦ったが、明智勢は隣の近衛前久の屋敷の屋根から鉄砲を撃ちかけ、信忠も自害した。信長の遺体は見つからなかった。十一日後、中国から引き返した羽柴秀吉が山崎の戦いで光秀を破る。この戦の主人公と組頭の甚兵衛は、遊びのための人物である。兵の数には諸説ある。';

// ---------------- 第二幕（二条御所）の段（b_depth.js） ----------------
function hCtx(rt) {
  const F = rt.flags;
  return { faction: 'saito', flag: 'akechi', armor: 0x2a2a30, dmg: 0.54, mass: 110, scale: 1.4, look: (l) => dress(l, AKECHI),
    friends: () => [F.tada, F.ngun].filter((g) => g && g.count) };
}
// 二条御所：門を守る → 息を整える → 最後の寄せ（本能寺の続きの段なので短く）
function stepsN(rt) {
  const F = rt.flags;
  const gateIn = { x: NIJO_GATE.x + 2, z: NIJO_GATE.z };
  const volley = () => volleyAt(rt, { guns: () => [F.ngun], foes: () => (F.dp && F.dp.cur ? F.dp.cur.groups : []), who: '織田信忠', near: 24, drop: 28, max: 50, say: '門の前に詰まったぞ……放てぇっ！', line: '御所の鉄砲がそろって火を吹いた。桔梗の旗が門の前でたじろぐ' });
  return [
    hold({ at: gateIn, dur: 70, r: 12, title: '二条御所の門', sub: '桔梗の旗が、通りを埋めて寄せて来る', label: '西の門', obj: '二条御所の西の門を守れ',
      say: [['織田信忠', '門の外へは出るな。詰まった所を撃つ。槍は門の口を固めよ']],
      waves: () => { volley(); return [
        { t: 4, say: ['足軽', '桔梗の旗が、通りを埋めて来る！'], foes: () => [{ name: '明智勢', from: { x: 27, z: -10 }, list: [uS(2), uA(8), uG(2)], mass: 200 }] },
        { t: 34, say: ['村井貞勝', '北の通りからも！　崩れるな！'], foes: () => [{ name: '明智勢の新手', from: { x: 27, z: -100 }, list: [uS(2), uA(9)], mass: 180 }] },
      ]; }, reward: '二条御所の門を守った' }),
    rest({ dur: 6, heal: 0.5, say: [['村井貞勝', '隣の屋敷の屋根から、鉄砲を撃ちかけて来ておる……'], ['織田信忠', '……次が最後の寄せになろう']] }),
    hold({ at: { x: NIJO_GATE.x + 6, z: NIJO.z + 2 }, dur: 45, r: 12, title: '最後の寄せ', sub: '明智勢が、御所の四方から寄せて来る', label: '御殿の前', obj: '御殿の前で、最後の寄せを凌げ',
      say: [['織田信忠', '……これが最後の寄せじゃ。凌げば、そなたを落とす間ができる']],
      waves: () => [
        { t: 4, say: ['足軽', '門が破られた！　なだれ込んで来る！'], foes: () => [{ name: '御所へなだれ込む明智勢', from: { x: NIJO_GATE.x - 4, z: NIJO_GATE.z }, list: [uS(2), uA(8)], mass: 80, dmg: 0.46 }] },
        { t: 22, foes: () => [{ name: '塀を越える明智勢', from: { x: NIJO.x - 4, z: NIJO.z + NIJO.h + 6 }, list: [uS(2), uA(5), uG(2)], mass: 80, dmg: 0.46 }] },
      ], reward: '最後の寄せを凌いだ' }),
  ];
}

// 素直な遊び手：表門を閉めて守り、本堂で上様と戦い、御殿へ移して守り抜き、裏門から落ちる → 二条御所の門を守り、北の口から落ちる
honnoji.botBrain = (b, inp, { goTo }) => {
  if (b.G.lord) { lordBot(b, inp, goTo); return; }
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyE');
  if (!u.alive || F.ending) return;
  if (F.dpOn && F.dp && F.dp.on) { depthBot(b, inp, goTo); return; }
  // 道の点を順にたどる
  const follow = (key, pts) => {
    if (b.botPath !== key) { b.botPath = key; let bi = 0, bd = 1e9; pts.forEach((w, i) => { const d = Math.hypot(w[0] - u.pos.x, w[1] - u.pos.z); if (d < bd) { bd = d; bi = i; } }); b.botWp = bi; }
    const w = pts[Math.min(b.botWp, pts.length - 1)];
    if (Math.hypot(w[0] - u.pos.x, w[1] - u.pos.z) < 1.6 && b.botWp < pts.length - 1) b.botWp++;
    goTo(p, inp, w[0], w[1], 0.8);
  };
  const fight = (r) => {
    const e = b.army.nearestEnemy(u, r, (o) => !o.fleeing && !o.isStruct);
    if (!e) return false;
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d > 2.6) inp.k.add('KeyW');
    if (d < 3.2 && Math.random() < 0.5) inp.leftPressed = true;
    inp.guardHold = (b.army.threats || []).length > 0 && Math.random() < 0.8;
    return true;
  };
  inp.guardHold = false;
  const NB = F.nb, hp = F.hp || 0;
  if (hp === 1) { follow('h1', [[-55, 82.1], [-52, 82.2], [-52, 80], [-52, 77.5], [-45.5, 77], [-45, 64], [-44, 54], [-37, 50]]); return; }
  if (hp === 2) { if (fight(3)) return; if (!F.gMain && Math.hypot(u.pos.x - (GATES.main.x - 1.5), u.pos.z - GATES.main.z) < 2.5) { inp.k.add('KeyE'); return; } goTo(p, inp, GATES.main.x - 1.5, GATES.main.z, 1); return; }
  if (hp === 3) { if (fight(11)) return; goTo(p, inp, PT.gateIn.x, PT.gateIn.z, 2); return; }
  if (hp === 4) { if (fight(7)) return; follow('h4', [[-40, 48], [-45.5, 46], [-48.5, 46]]); return; }
  if (hp === 5) { if (fight(8)) return; goTo(p, inp, NB.pos.x + 1.5, NB.pos.z, 2.5); return; }
  if (hp === 6) { if (fight(6)) return; if (F.mv) follow('h6' + F.mv, MOVES[F.mv].pts); else goTo(p, inp, NB.pos.x, NB.pos.z, 2.5); return; }
  if (hp === 7) { if (fight(7)) return; goTo(p, inp, PT.hikae.x, PT.hikae.z, 2); return; }
  if (hp === 8) { if (u.pos.x < -76 && fight(6)) return; follow('h8', [[-61, 89], [-65, 89], [-70, 90], [-73, 90], [-75.5, 90], [-75.5, 79], [-77, 76], [-86, 76]]); return; }
  if (F.step === 3 || F.step === 4) { if (fight(10)) return; goTo(p, inp, NIJO_GATE.x + 3, NIJO_GATE.z, 2); return; }
  if (F.step === 5) { if (fight(4)) return; follow('d', [[NIJO_GATE.x + 5, NIJO.z - 12], [NIJO.x, NIJO.z - 13], [NIJO_BACK.x, NIJO_BACK.z + 2], [NIJO_BACK.x, NIJO_BACK.z - 6], [OUT.x, OUT.z]]); }
};

export { honnoji };
