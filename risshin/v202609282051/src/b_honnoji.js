// ======================================================================
// 織田家編　本能寺の変（天正十年六月二日）
// 夜明け前、明智光秀の一万余りの兵が京の本能寺を囲んだ。信長はわずかな供と戦い、奥に火をかけて自害した。
// 妙覚寺にいた嫡男・信忠は二条御所に移って戦い、ここでも自害した。
// 足軽は京の宿所に泊まっていた織田の者。①鉄砲の音で目を覚まし、本能寺へ駆けつける（明智の囲みを破る）
// ②燃える本能寺の前で、上様の最期を聞く ③二条御所の信忠のもとへ走り、御所の門を守る
// ④信忠の命で、裏の口から落ちる（生き延びて、この次第を伝える）
// 信長で遊ぶ時（G.lord）は別の流れ（下の lordSetup〜）：境内の奥から、囲みを破って落ちのびる
// 向き：京の町の碁盤の目。南西（-x, +z）に本能寺、北東（+x, -z）に二条御所
// ======================================================================
import * as THREE from 'three';
import { nobori, hut, campfire, kabukimon, tawara } from './props.js';
import { flagTexture } from './textures.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { moraleWord } from './hud.js';
import { gauss, enemyGroup, allyGroup, nm, centerOf, unitPos, wallLine } from './bhelp.js';
import { applyLook, DAWN, dress, gone } from './b_inabayama.js';

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

function height(x, z) {
  // 京の町はほぼ平ら。まわりに東山・北山・西山
  let h = 0.15 * Math.sin(x * 0.05) * Math.cos(z * 0.04);
  h += 40 * gauss(x, z, 300, -40, 16000) + 40 * gauss(x, z, -40, -320, 20000) + 36 * gauss(x, z, -320, 60, 16000);
  return h;
}

// 築地塀（白い土壁に瓦の笠）
const TS = { wall: new THREE.MeshStandardMaterial({ color: 0xd6cebd, roughness: 0.95 }), base: new THREE.MeshStandardMaterial({ color: 0x5e5446, roughness: 1 }), roof: new THREE.MeshStandardMaterial({ color: 0x33312e, roughness: 0.8 }) };
function tsuji(W, seg) {
  const [ax, az, bx, bz] = seg;
  const len = Math.hypot(bx - ax, bz - az), mx = (ax + bx) / 2, mz = (az + bz) / 2;
  const g = new THREE.Group();
  const add = (geo, mat, yy) => { const m = new THREE.Mesh(geo, mat); m.position.y = yy; m.castShadow = true; m.receiveShadow = true; m.userData.camBlock = true; g.add(m); };
  add(new THREE.BoxGeometry(0.8, 2.6, len + 0.05), TS.wall, 1.1);
  add(new THREE.BoxGeometry(0.85, 0.5, len + 0.06), TS.base, -0.1);
  add(new THREE.BoxGeometry(1.4, 0.16, len + 0.4), TS.roof, 2.45);
  g.position.set(mx, W.heightAt(mx, mz), mz);
  g.rotation.y = Math.atan2(bx - ax, bz - az);
  return g;
}
// 四角の囲い（門の口を一つ空ける）。side：'e'|'w'|'n'|'s'
function compound(rt, c, gateSide, gw = 7) {
  const { x, z, h } = c;
  const E = [[x + h, z + h], [x + h, z - h]], Wl = [[x - h, z - h], [x - h, z + h]], N = [[x + h, z - h], [x - h, z - h]], S = [[x - h, z + h], [x + h, z + h]];
  const sides = { e: E, w: Wl, n: N, s: S };
  const out = [];
  for (const [k, [[ax, az], [bx, bz]]] of Object.entries(sides)) {
    if (k === gateSide || k === c.back) {
      const mx = (ax + bx) / 2, mz = (az + bz) / 2, L = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / L, uz = (bz - az) / L;
      const g2 = (k === gateSide ? gw : 4) / 2;
      out.push(...wallLine(rt, [[ax, az], [mx - ux * g2, mz - uz * g2]], { team: 0, hp: 1e9, name: '築地塀', segLen: 6, mesh: tsuji }));
      out.push(...wallLine(rt, [[mx + ux * g2, mz + uz * g2], [bx, bz]], { team: 0, hp: 1e9, name: '築地塀', segLen: 6, mesh: tsuji }));
    } else out.push(...wallLine(rt, [[ax, az], [bx, bz]], { team: 0, hp: 1e9, name: '築地塀', segLen: 6, mesh: tsuji }));
  }
  for (const s of out) { s.noTarget = true; s.wall = true; s.h = 2.6; }
  return out;
}

const honnoji = {
  spawn: { x: START.x, z: START.z, heading: -Math.PI / 2 },
  world: {
    seed: 1582 + 6,
    time: 'dusk',
    muddy: 0.1,
    paths: [...STREETS.map((s) => [[s, -170], [s, 170]]), ...STREETS.map((s) => [[-170, s], [170, s]])],
    height,
    tint(x, z, h, c) {
      // 町の土の道
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
    if (rt.G.lord) { this.lordSetup(rt); return; }
    const W = rt.world;
    const F = rt.flags;
    F.step = 0; F.ek = 0; F.ak = 0;
    // ---- 京の町並み：通りに面して町屋を並べる ----
    const inCompound = (x, z) => [HONNO, NIJO].some((c) => Math.abs(x - c.x) < c.h + 5 && Math.abs(z - c.z) < c.h + 5);
    let k = 0;
    for (const sx of [-54, 0, 54]) for (const sz of [-54, 0, 54]) {
      // 通りに囲まれた一つの町（丁）の四辺に、町屋を並べる
      for (const [dx, dz, r] of [[-14, -20, 0], [0, -20, 0], [14, -20, 0], [-14, 20, Math.PI], [0, 20, Math.PI], [14, 20, Math.PI], [-20, -6, Math.PI / 2], [-20, 8, Math.PI / 2], [20, -6, -Math.PI / 2], [20, 8, -Math.PI / 2]]) {
        const x = sx + dx, z = sz + dz;
        if (inCompound(x, z)) continue;
        if (Math.hypot(x - START.x, z - START.z) < 5) continue;
        rt.scene.add(hut(W, x, z, 7 + (k % 3), 5, r + Math.PI, { wall: k % 2 ? 0x6e5a40 : 0x7b6448, h: 2.4 }));
        k++;
      }
    }
    // ---- 本能寺（東に門）と二条御所（西に門、北に裏の口） ----
    compound(rt, HONNO, 'e');
    NIJO.back = 'n';
    F.nwall = compound(rt, NIJO, 'w');
    rt.scene.add(kabukimon(W, HONNO_GATE.x, HONNO_GATE.z, 7.4, Math.PI / 2), kabukimon(W, NIJO_GATE.x, NIJO_GATE.z, 7.4, Math.PI / 2));
    for (const [x, z, w, d] of [[HONNO.x - 2, HONNO.z - 2, 16, 11], [HONNO.x - 6, HONNO.z + 10, 9, 6], [HONNO.x + 6, HONNO.z - 10, 8, 6]]) rt.scene.add(hut(W, x, z, w, d, 0, { h: 3.6, wall: 0x7a5a3c, roof: 0x3a3430 }));
    rt.scene.add(hut(W, NIJO.x + 2, NIJO.z - 2, 16, 11, 0, { h: 3.6, wall: 0x7a6a50, roof: 0x3a3430 }), hut(W, NIJO.x - 6, NIJO.z + 10, 8, 5, 0));
    for (const [x, z] of [[NIJO.x - 10, NIJO.z - 6], [NIJO.x - 10, NIJO.z + 6], [NIJO.x + 10, NIJO.z + 10]]) rt.scene.add(nobori(W, x, z, 'oda', 6));
    rt.scene.add(tawara(W, START.x - 5, START.z + 3, 0.2, 3));
    // ---- 本能寺を囲む明智の大軍（軽い作り）と、そのまわりの篝 ----
    const DA = (x, z, w, d, count, facing, armor, flag, seed) => W.addDistantArmy({ x, z, w, d, count, facing, armor, flagTex: flagTexture(flag), seed });
    F.aHost = [
      DA(HONNO.x, HONNO.z + 30, 30, 8, 200, Math.PI, 0x2a2a30, 'akechi', 1586),
      DA(HONNO.x - 30, HONNO.z, 8, 30, 160, Math.PI / 2, 0x2a2a30, 'akechi', 1587),
      DA(HONNO.x, HONNO.z - 30, 30, 8, 160, 0, 0x2a2a30, 'akechi', 1588),
      DA(-100, 110, 30, 12, 220, Math.PI * 0.75, 0x2a2a30, 'akechi', 1589),
    ];
    for (const [x, z] of [[HONNO.x - 20, HONNO.z + 24], [HONNO.x - 24, HONNO.z - 22], [HONNO.x + 26, HONNO.z + 20]]) W.addFire(x, z, { torch: true, h: 1.4 });
    for (const [x, z] of [[HONNO.x - 10, HONNO.z + 26], [HONNO.x - 26, HONNO.z + 8], [HONNO.x + 4, HONNO.z - 26]]) rt.scene.add(nobori(W, x, z, 'akechi', 6));
    // 本能寺の奥から火（はじめは小さく）
    F.fire0 = W.addFire(HONNO.x - 6, HONNO.z - 4, { h: 3 });
    W.addSmokeColumn(HONNO.x - 6, 10, HONNO.z - 4, { size: 2.4 });
    // ---- 宿所の仲間（自分の組と、同じ宿の足軽） ----
    F.mates = allyGroup(rt, { name: '宿所の足軽', anchor: { x: START.x + 4, z: START.z - 2 }, facing: -Math.PI / 2, width: 8, aggro: 9, noRout: true },
      dress([{ type: 'samurai', n: 1, o: { name: '宿所の組頭 甚兵衛', invuln: true, hat: 'kabuto_m' } }, { type: 'ashigaru', n: 7 }], ODA));
    F.mates.defMult = 1.3; F.mates.dmgMult = 0.9;
    F.jin = F.mates.units[0];
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: START.x + 8, z: START.z + 2 }, -Math.PI / 2, [{ kind: 'spear', n: Math.min(n, 20) }]);
    // ---- 通りを塞ぐ明智の兵（本能寺への道） ----
    F.cord = enemyGroup(rt, { faction: 'saito', name: '通りを塞ぐ明智勢', anchor: { x: -27, z: 42 }, facing: -Math.PI * 0.4, width: 12, aggro: 16, morale: 90, fleeDir: { x: -1, z: 1 }, dmgMult: 0.66, formation: 'yari' },
      dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 12 }, { type: 'gun', n: 2 }], AKECHI));
    for (const u of F.cord.units) if (u.type === 'gun') u.dmg *= 0.45;

    applyLook(rt, DAWN);
    rt.setPhase('brief');
    rt.obj('main', '何が起きているのか、確かめよ', 'main');
    rt.say('', '天正十年六月二日　夜明け前　京 四条西洞院のあたり', 3.5);
    rt.after(1.5, () => { for (let i = 0; i < 5; i++) rt.after(i * 0.35, () => rt.army.play('gun', { x: HONNO.x, z: HONNO.z }, 0.7)); });
    rt.after(3, () => rt.army.play('eshout', { x: HONNO.x, z: HONNO.z }, 1.4));
    rt.say('組頭 甚兵衛', `起きよ、${nm(rt)}！　本能寺の方で鉄砲じゃ。……喧嘩か？　いや、鬨の声じゃ`, 5);
    rt.say('組頭 甚兵衛', '桔梗の旗……明智様の兵が、本能寺を囲んでおる！　上様（信長公）が危ない。走れ！', 5);
    rt.after(12, () => this.run(rt));
  },

  // ① 本能寺へ駆けつける
  run(rt) {
    const F = rt.flags;
    if (F.step >= 1) return;
    F.step = 1; F.stepT = rt.t;
    rt.setPhase('run');
    sfx('taiko', 0.6);
    rt.obj('main', '本能寺へ駆けつけよ：通りを塞ぐ明智の兵を破れ', 'main');
    F.mates.order = 'attack'; F.mates.seekRange = 40;
    F.cord.order = 'attack'; F.cord.seekRange = 30;
    rt.marker('cord', centerOf(F.cord), () => `通りを塞ぐ明智勢・${moraleWord(F.cord.morale)}`, { red: true, group: F.cord });
    rt.say('明智の侍', '寄るな！　敵は本能寺にあり、じゃ。邪魔立てする者は討て！', 3.5);
  },

  // ② 燃える本能寺の前
  burning(rt) {
    const F = rt.flags;
    if (F.step >= 2) return;
    F.step = 2; F.stepT = rt.t;
    rt.setPhase('burn');
    rt.unmark('cord');
    if (!gone(F.cord)) F.cord.morale = Math.min(F.cord.morale, 15);
    rt.award((t) => t.side.push('明智の囲みを破った'), '明智の囲みを破った');
    // 本能寺が燃え上がる
    const W = rt.world;
    for (const [x, z] of [[HONNO.x - 2, HONNO.z - 2], [HONNO.x + 4, HONNO.z + 2], [HONNO.x - 8, HONNO.z + 8], [HONNO.x + 6, HONNO.z - 10]]) { W.addFire(x, z, { h: 2.6 }); W.addSmokeColumn(x, 9, z, { size: 3.2 }); }
    rt.banner('本能寺、炎上', '寺の奥から火の手が上がった');
    rt.obj('main', '本能寺の門の前へ走れ', 'main');
    rt.marker('gate', HONNO_GATE, '本能寺の門', { h: 3 });
    rt.zone('gate', HONNO_GATE.x + 8, HONNO_GATE.z, 6);
  },
  news(rt) {
    const F = rt.flags;
    if (F.newsHeard) return;
    F.newsHeard = true;
    rt.unmark('gate'); rt.unzone('gate');
    sfx('kane', 0.4);
    // 寺から逃れてきた中間
    const g = allyGroup(rt, { name: '寺から逃れた中間', anchor: { x: HONNO_GATE.x + 6, z: HONNO_GATE.z - 4 }, facing: Math.PI / 2, width: 3, aggro: 0, noRout: true },
      [{ type: 'porter', n: 2, o: { flag: null, hat: 'none', armor: 0x4a4034 } }]);
    for (const u of g.units) { u.noTarget = true; u.invuln = true; }
    F.chugen = g;
    rt.say('寺から逃れた中間', '……上様は、明智の謀反と聞いて「是非に及ばず」と仰せられ……', 4.5);
    rt.say('寺から逃れた中間', '弓を取り、弦が切れると槍を取って戦われた。傷を負われて奥へ入り、火をかけて……', 5);
    rt.say('組頭 甚兵衛', '……上様が。……ならば、妙覚寺の中将様（信忠）じゃ！　二条の御所へ移られたと聞く。走れ！', 5);
    rt.after(14, () => this.toNijo(rt));
  },

  // ③ 二条御所へ走り、門を守る
  toNijo(rt) {
    const F = rt.flags;
    if (F.step >= 3) return;
    F.step = 3; F.stepT = rt.t;
    rt.setPhase('nijo');
    rt.world.setTime('morning');
    rt.obj('main', '二条御所の信忠様のもとへ走れ', 'main');
    rt.marker('nijo', NIJO_GATE, '二条御所', { h: 3 });
    F.mates.order = 'move'; F.mates.dest = { x: NIJO_GATE.x - 6, z: NIJO_GATE.z + 4 }; F.mates.speed = 3.2;
    F.mates.onArrive = (g) => { g.order = 'hold'; g.anchor = { x: NIJO_GATE.x + 5, z: NIJO_GATE.z + 3 }; };
    // 御所の中の信忠の手
    F.tada = allyGroup(rt, { name: '織田信忠の手', anchor: { x: NIJO.x - 6, z: NIJO.z }, facing: -Math.PI / 2, width: 12, aggro: 12, noRout: true },
      dress([{ type: 'busho', n: 1, o: { name: '織田信忠', invuln: true, hat: 'kabuto_m', haori: 0x7a1d14 } }, { type: 'samurai', n: 1, o: { name: '村井貞勝', invuln: true, hat: 'kabuto_w' } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 12 }], ODA));
    F.tada.defMult = 1.3;
    F.tadaU = F.tada.units[0];
    // 通りの見回り
    F.patrol = enemyGroup(rt, { faction: 'saito', name: '明智の見回り', anchor: { x: 2, z: -27 }, facing: -Math.PI / 2, width: 8, aggro: 14, morale: 80, fleeDir: { x: 0, z: 1 }, dmgMult: 0.64 },
      dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 8 }], AKECHI));
  },
  arrive(rt) {
    const F = rt.flags;
    if (F.step >= 4) return;
    F.step = 4; F.stepT = rt.t;
    rt.setPhase('defend');
    rt.unmark('nijo');
    rt.say('織田信忠', '……父上が。……明智はここへも来よう。囲まれた今、逃げても討たれるだけじゃ。ここで戦う', 5);
    rt.say('村井貞勝', '親王様（誠仁親王）は、御所を出て内裏へお移りいただきました。存分に戦えまする', 4.5);
    rt.obj('main', '二条御所の西の門を守れ', 'main');
    rt.zone('ng', NIJO_GATE.x + 3, NIJO_GATE.z, 5);
    F.tada.order = 'hold'; F.tada.anchor = { x: NIJO_GATE.x + 6, z: NIJO_GATE.z }; F.tada.aggro = 12;
    F.waves = [];
    const mk = (x, z, name, list) => {
      const g = enemyGroup(rt, { faction: 'saito', name, anchor: { x, z }, facing: Math.PI / 2, order: 'attack', seekRange: 90, aggro: 16, width: 12, morale: 95, fleeDir: { x: -1, z: 0.3 }, dmgMult: 0.62 }, dress(list, AKECHI));
      for (const u of g.units) if (u.type === 'gun') u.dmg *= 0.45;
      F.waves.push(g);
      rt.marker('w' + F.waves.length, centerOf(g), () => `${name}・${moraleWord(g.morale)}`, { red: true, group: g });
      rt.army.play('eshout', { x, z }, 1.6);
      return g;
    };
    rt.after(8, () => { mk(27, -6, '明智勢', [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 14 }, { type: 'gun', n: 3 }]); sfx('horagai', 0.7); rt.say('足軽', '桔梗の旗が、通りを埋めて来る！', 3); });
    rt.after(46, () => { if (F.step === 4) { mk(27, -104, '明智勢の新手', [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 12 }, { type: 'gun', n: 3 }]); rt.say('足軽', '隣の屋敷の屋根から、鉄砲を撃ちかけてくる！', 3.5); } });
    // 隣の屋敷の屋根からの鉄砲（音と煙）
    F.roofT = 50;
  },

  // ④ 裏の口から落ちる
  escape(rt) {
    const F = rt.flags;
    if (F.step >= 5) return;
    F.step = 5; F.stepT = rt.t;
    rt.setPhase('escape');
    F.koshoStay = 0;
    for (const g of rt.squadGroups) g.order = 'follow';
    for (let i = 1; i <= (F.waves || []).length; i++) rt.unmark('w' + i);
    rt.unzone('ng');
    rt.award((t) => t.side.push('二条御所の門を守った'), '二条御所の門を守った');
    const W = rt.world;
    W.addFire(NIJO.x + 4, NIJO.z - 4, { h: 2.4 }); W.addSmokeColumn(NIJO.x + 4, 9, NIJO.z - 4, { size: 3 });
    rt.banner('もはやこれまで', '御所に火がかけられた');
    rt.say('織田信忠', `${nm(rt)}と申したか。そなたは落ちよ。……生きて、この次第を安土に伝えよ`, 5);
    rt.say('織田信忠', 'わしの首は、明智に渡さぬ。……行け！', 3.5);
    rt.obj('main', '御所の北の口から落ちのびよ', 'main');
    rt.marker('out', OUT, '落ちのびる先', { h: 2 });
    rt.zone('out', OUT.x, OUT.z, 7);
    // 北の口の外に明智の兵が少し
    F.north = enemyGroup(rt, { faction: 'saito', name: '北の口の明智勢', anchor: { x: NIJO_BACK.x + 4, z: NIJO_BACK.z - 26 }, facing: 0, width: 8, aggro: 12, morale: 75, fleeDir: { x: 1, z: 0 }, dmgMult: 0.6 },
      dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 6 }], AKECHI));
    rt.marker('north', centerOf(F.north), () => `北の口の明智勢・${moraleWord(F.north.morale)}`, { red: true, group: F.north });
    // 甚兵衛たちは殿を務める
    F.mates.order = 'hold'; F.mates.anchor = { x: NIJO.x, z: NIJO.z - 8 };
    rt.say('組頭 甚兵衛', 'わしらはここに残る。行け、振り返るな！', 3.5);
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.unmark('out'); rt.unmark('north'); rt.unzone('out');
    rt.objDone('main');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '本能寺の変を生き延びた', pts: 20 }; }, '任務達成・生き延びた');
    sfx('kane', 0.5);
    rt.banner('二条御所、落ちる', '織田信忠は自害した。享年二十六');
    rt.say('', `――${nm(rt)}は京の北の町はずれに出た。振り返ると、本能寺と二条の空に黒い煙が上がっていた`, 6);
    rt.after(6, () => rt.say('', '――十一日後、羽柴秀吉が中国から大返しで戻り、山崎で明智光秀を破る', 5.5));
    rt.player.u.invuln = true;
    rt.finish({}, 13);
  },

  update(rt, dt) {
    if (rt.G.lord) { this.lordTick(rt, dt); return; }
    const F = rt.flags;
    // 崩れた隊の印は消す（古い印が「あちらじゃ」の行き先にならないように）
    for (const m of rt.markers.slice()) if (m.group && gone(m.group)) rt.unmark(m.id);
    if (F.ending) return;
    const p = rt.player.u.pos;
    // 本能寺の方の鉄砲の音（はじめのうち）
    if (F.step <= 2 && Math.random() < dt * 0.6) { rt.army.play('gun', { x: HONNO.x + (Math.random() - 0.5) * 30, z: HONNO.z + (Math.random() - 0.5) * 30 }, 0.5); }
    if (F.step === 1) {
      rt.objProgress('main', `明智勢 ${F.cord.count}人`);
      if (F.cord.count < 5 && !gone(F.cord)) F.cord.morale = Math.min(F.cord.morale, 20);
      if (gone(F.cord) || rt.t - F.stepT > 120) this.burning(rt);
    }
    if (F.step === 2) {
      const d = Math.hypot(p.x - (HONNO_GATE.x + 8), p.z - HONNO_GATE.z);
      if (!F.newsHeard) rt.objProgress('main', `門まで ${Math.max(0, Math.round(d))}m`);
      if (!F.newsHeard && d >= 9 && rt.t - F.stepT > 20 && !F.gateCall) { F.gateCall = true; rt.say('組頭 甚兵衛', `${nm(rt)}、門の前へ！　寺から誰か逃れて来ぬか、見に行くぞ`, 3.5); }
      if (!F.newsHeard && (d < 9 || rt.t - F.stepT > 42)) this.news(rt);
    }
    if (F.step === 3) {
      const d = Math.hypot(p.x - NIJO_GATE.x, p.z - NIJO_GATE.z);
      rt.objProgress('main', `御所まで ${Math.max(0, Math.round(d))}m`);
      if (!F.patrolOn && Math.hypot(p.x - 2, p.z + 27) < 26) { F.patrolOn = true; F.patrol.order = 'attack'; F.patrol.seekRange = 30; rt.say('明智の侍', 'おい、そこの者！　織田の者か！', 2.5); rt.marker('patrol', centerOf(F.patrol), () => `明智の見回り・${moraleWord(F.patrol.morale)}`, { red: true, group: F.patrol }); }
      if (gone(F.patrol)) rt.unmark('patrol');
      // 走り出さない時は、組頭が道を言う（通りを北へ、二条の辻を東へ）
      if (d >= 10 && rt.t - F.stepT > 35 && !F.nijoCall) { F.nijoCall = true; rt.say('組頭 甚兵衛', `${nm(rt)}、何を立ち止まる！　印の方、二条御所へ走れ。中将様をお守りするのじゃ`, 4); }
      if (d < 10 || rt.t - F.stepT > 120) { rt.unmark('patrol'); this.arrive(rt); }
    }
    if (F.step === 4) {
      const L = F.waves || [];
      const left = Math.max(0, 130 - (rt.t - F.stepT));
      rt.objProgress('main', `明智勢 ${L.reduce((s, q) => s + (gone(q) ? 0 : q.count), 0)}人`);
      for (const q of L) if (q.count < 5 && !gone(q)) q.morale = Math.min(q.morale, 20);
      if ((F.roofT -= dt) <= 0 && L.length >= 2) {
        F.roofT = 2 + Math.random() * 3;
        const x = NIJO.x - NIJO.h - 12, z = NIJO.z - 12 + Math.random() * 10;
        rt.army.play('gun', { x, z }, 0.7); rt.army.smoke(x, 4.5, z, 1, 0, 0.8);
      }
      if ((L.length >= 2 && L.every(gone)) || left <= 0) this.escape(rt);
    }
    if (F.step === 5) {
      const d = Math.hypot(p.x - OUT.x, p.z - OUT.z);
      rt.objProgress('main', `あと ${Math.max(0, Math.round(d))}m`);
      if (d < 7) this.win(rt);
    }
  },

  onKill(rt, v) {
    const F = rt.flags;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
  },
  onRout(rt, g) {
    if (g.team !== 1) return;
    rt.say('足軽', `${g.name}が退いた！`, 2.5);
  },
};

// ======================================================================
// 信長で遊ぶ時の本能寺（rt.G.lord の時だけ。足軽の流れは上のまま）
// 始まりは境内の奥。供は森蘭丸ら小姓衆と、わずかな者（二十数人）。明智の一万余りが築地を幾重にも囲む
// ①弓と槍で表門を防ぐ ②表門・裏門が破られ、奥（御殿の裏）へ下がる ③御殿に火を放つ ④囲みを破って落ちのびる（勝ち）
// 討たれる・炎に呑まれる＝史実どおりの最期（負け）
// 囲みの破れ目は、時と場所で開く（火を放ってから）：
//   北の裏門……はじめから開いているが、外に北の囲み。二十秒ほどで北の囲みが表へ回され、薄くなる
//   西の築地……裏の松の枝を伝って越えられる（E 長押し）。四十秒ほどで西の囲みが表へ回され、薄くなる
//   南の築地……六十秒ほどで火が回って崩れ、南の囲みは火と煙を避けて退く
// 築地の外には四つの辻を固める明智勢（南の築地が崩れると、南西の辻は煙で浮き足立つ）。
// 外へ出れば、明智の追手（騎馬）がかかる。本能寺から八十余り m 離れれば、京の町に紛れて落ちのびる
// 百五十秒で炎が御殿を包む。その時まだ築地の内にいれば、最期
// ======================================================================
const L_START = { x: HONNO.x - 8, z: HONNO.z - 12 };            // 始まり：境内の奥（御殿の北西）
const OKU = { x: HONNO.x - 12.6, z: HONNO.z - 2 };              // 御殿の裏（奥）
const WALL_W = { x: HONNO.x - HONNO.h + 1.7, z: HONNO.z + 8 };  // 西の築地の越え口（内）
const WALL_W_OUT = { x: HONNO.x - HONNO.h - 3.4, z: HONNO.z + 8 };
const GATE_N = { x: HONNO.x, z: HONNO.z - HONNO.h };             // 裏門（北）
const S_BREAK = { x: HONNO.x - 3, z: HONNO.z + HONNO.h };       // 火が回って崩れる南の築地
const ESC_R = 76;                                                // 本能寺からこれだけ離れれば落ちのびた
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
    let k = 0;
    for (const sx of [-54, 0, 54]) for (const sz of [-54, 0, 54]) {
      for (const [dx, dz, r] of [[-14, -20, 0], [0, -20, 0], [14, -20, 0], [-14, 20, Math.PI], [0, 20, Math.PI], [14, 20, Math.PI], [-20, -6, Math.PI / 2], [-20, 8, Math.PI / 2], [20, -6, -Math.PI / 2], [20, 8, -Math.PI / 2]]) {
        const x = sx + dx, z = sz + dz;
        if (inCompound(x, z)) continue;
        rt.scene.add(hut(W, x, z, 7 + (k % 3), 5, r + Math.PI, { wall: k % 2 ? 0x6e5a40 : 0x7b6448, h: 2.4 }));
        k++;
      }
    }
    // ---- 本能寺：東に表門、北に裏門（どちらも破られる門）。二条御所は描くだけ ----
    F.walls = compound(rt, { ...HONNO, back: 'n' }, 'e');
    compound(rt, NIJO, 'w');
    rt.scene.add(kabukimon(W, HONNO_GATE.x, HONNO_GATE.z, 7.4, Math.PI / 2), kabukimon(W, NIJO_GATE.x, NIJO_GATE.z, 7.4, Math.PI / 2));
    F.gE = rt.army.addStruct({ seg: [HONNO_GATE.x, HONNO_GATE.z - 3.5, HONNO_GATE.x, HONNO_GATE.z + 3.5], hp: 2600, maxHp: 2600, armor: 0.5, team: 0, name: '表門' });
    F.gE.mesh = gateDoors(W, HONNO_GATE.x, HONNO_GATE.z, 7, 0); rt.scene.add(F.gE.mesh);
    F.gN = rt.army.addStruct({ seg: [GATE_N.x - 2, GATE_N.z, GATE_N.x + 2, GATE_N.z], hp: 1800, maxHp: 1800, armor: 0.5, team: 0, name: '裏門' });
    F.gN.mesh = gateDoors(W, GATE_N.x, GATE_N.z, 4, Math.PI / 2); rt.scene.add(F.gN.mesh);
    F.sWall = F.walls.filter((s) => Math.abs((s.seg[1] + s.seg[3]) / 2 - S_BREAK.z) < 0.5 && Math.abs((s.seg[0] + s.seg[2]) / 2 - S_BREAK.x) < 7);
    for (const [x, z, w, d] of [[HONNO.x - 2, HONNO.z - 2, 16, 11], [HONNO.x - 6, HONNO.z + 10, 9, 6], [HONNO.x + 6, HONNO.z - 10, 8, 6]]) rt.scene.add(hut(W, x, z, w, d, 0, { h: 3.6, wall: 0x7a5a3c, roof: 0x3a3430 }));
    rt.scene.add(hut(W, NIJO.x + 2, NIJO.z - 2, 16, 11, 0, { h: 3.6, wall: 0x7a6a50, roof: 0x3a3430 }));
    // 裏の松（西の築地を越える枝）
    rt.scene.add(nobori(W, HONNO.x - 4, HONNO.z - 4, 'oda', 5), nobori(W, HONNO.x + 8, HONNO.z + 4, 'eiraku', 5));
    // ---- 遠景の明智の大軍（四方）と篝・旗。落ち口の斜めの隅は空けておく ----
    const DA = (x, z, w, d, count, facing, seed) => W.addDistantArmy({ x, z, w, d, count, facing, armor: 0x2a2a30, flagTex: flagTexture('akechi'), seed });
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
    F.ran = F.kosho.units[0];
    // 供のわずかな者（槍と弓。自分の組として付いて来る）
    rt.makeSquad({ x: L_START.x - 2, z: L_START.z + 4 }, Math.PI / 2, [{ kind: 'spear', n: 12 }, { kind: 'bow', n: 8 }]);
    // ---- 築地の外の囲み（本物の兵でぎっしり）：北・西・南。表へ回される本隊と、動かない残りの者 ----
    const ring = (name, x, z, facing, n, w = 14) => enemyGroup(rt, { faction: 'saito', name, anchor: { x, z }, facing, width: w, aggro: 18, morale: 100, noRout: true, fleeDir: { x: 0, z: 0 }, dmgMult: 0.9 },
      dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: n - 4 }, { type: 'gun', n: 2 }], AKECHI));
    F.ringN = ring('北の囲み', HONNO.x, HONNO.z - HONNO.h - 9, 0, 20);
    F.ringW = ring('西の囲み', HONNO.x - HONNO.h - 11, HONNO.z + 4, Math.PI / 2, 20);
    F.ringS = ring('南の囲み', HONNO.x, HONNO.z + HONNO.h + 11, Math.PI, 20);
    ring('北の囲みの残り', HONNO.x + 8, HONNO.z - HONNO.h - 16, 0, 7, 6);
    ring('西の囲みの残り', HONNO.x - HONNO.h - 18, HONNO.z + 14, Math.PI / 2, 7, 6);
    F.ringS2 = ring('南の囲みの残り', HONNO.x - 12, HONNO.z + HONNO.h + 20, Math.PI, 7, 6);
    // 町の辻（四つの隅）を固める明智勢：囲みを抜けても、ここを破らねば町へ出られない
    F.corner = {};
    for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) F.corner[(sz > 0 ? 's' : 'n') + (sx > 0 ? 'e' : 'w')] = ring('辻を固める明智勢', HONNO.x + sx * 42, HONNO.z + sz * 42, Math.atan2(-sx, -sz), 10, 8);
    rt.army.maxAttackers = rt.army.maxAttackers + 1;   // 大勢に囲まれる戦：同時に打ちかかる敵を一人多く
    F.foes = [];
    applyLook(rt, DAWN);
    rt.setPhase('brief');
    rt.obj('main', '何事か、確かめよ', 'main');
    rt.say('', '天正十年六月二日　夜明け前　京 本能寺', 3.5);
    rt.after(1, () => { for (let i = 0; i < 6; i++) rt.after(i * 0.3, () => rt.army.play('gun', { x: HONNO.x + 26, z: HONNO.z + (Math.random() - 0.5) * 20 }, 0.8)); });
    rt.after(2, () => rt.army.play('eshout', { x: HONNO.x + 24, z: HONNO.z }, 1.6));
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
    const E = (dx, dz) => ({ x: HONNO_GATE.x + 16 + dx, z: HONNO_GATE.z + dz });
    rt.after(3, () => this.lordWave(rt, '明智の先手', E(0, -4), F.gE, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 14 }]));
    rt.after(10, () => this.lordWave(rt, '築地の外の鉄砲', E(-4, 9), null, [{ type: 'gun', n: 5 }, { type: 'bow', n: 3 }], { order: 'hold', aggro: 26 }));
    rt.after(22, () => this.lordWave(rt, '明智の二の手', E(4, 4), F.gE, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 14 }, { type: 'gun', n: 2 }]));
    rt.after(34, () => { this.lordWave(rt, '裏門へ回った明智勢', { x: GATE_N.x + 6, z: GATE_N.z - 14 }, F.gN, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 12 }]); rt.say('小姓', '裏門にも寄せてまいりました！', 3); rt.marker('gN', { x: GATE_N.x, z: GATE_N.z }, () => `裏門・${Math.max(0, Math.round(F.gN.hp / F.gN.maxHp * 100))}%`, { h: 3 }); });
    rt.after(48, () => this.lordWave(rt, '明智の三の手', E(0, 0), F.gE, [{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 16 }]));
  },
  // 明智の一隊（門があれば門を打ち、無ければ寺の内へ討ち入る）
  lordWave(rt, name, at, gate, list, o = {}) {
    const F = rt.flags;
    if (F.ending) return null;
    const alive = rt.army.units.filter((u) => u.alive && u.team === 1).length;
    if (alive > 130) return null;
    const into = !gate || !gate.alive;
    const g = enemyGroup(rt, { faction: 'saito', name, anchor: { ...at }, facing: Math.atan2(HONNO.x - at.x, HONNO.z - at.z), width: 10, aggro: 14, morale: 100, noRout: true, fleeDir: { x: 0, z: 0 }, dmgMult: 0.8,
      order: into ? 'attack' : 'assault', seekRange: 140, ...o }, dress(list, AKECHI));
    for (const u of g.units) if (u.type === 'gun') u.dmg *= 0.5;
    if (!into && gate) { g.assault = hitGate(gate); g.gate = gate; }
    F.foes.push(g);
    rt.army.play('eshout', at, 1.5);
    return g;
  },
  lordGateDown(rt, gate) {
    const F = rt.flags;
    if (gate.alive) { gate.hp = 0; gate.alive = false; rt.army.structFall(gate); }
    rt.unmark(gate === F.gE ? 'gE' : 'gN');
    sfx('taiko', 0.8);
    rt.banner(`${gate.name}、破らる`, gate === F.gE ? '明智勢が境内へなだれ込む' : '裏からも明智勢が入ってくる');
    for (const g of F.foes) if (g.gate === gate) { g.order = 'attack'; g.seekRange = 140; g.aggro = 40; g.assault = null; }
    if (gate === F.gE) this.lordBack(rt);
  },

  // ② 奥へ下がる
  lordBack(rt) {
    const F = rt.flags;
    if (F.lstep >= 2) return;
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
    rt.after(6, () => this.lordWave(rt, '境内へ討ち入る明智勢', { x: HONNO_GATE.x + 14, z: HONNO_GATE.z }, null, [{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 14 }]));
    F.moreT = rt.t + 16;
  },
  // ③ 御殿に火を放つ
  lordFireStep(rt) {
    const F = rt.flags;
    if (F.lstep >= 3) return;
    F.lstep = 3; F.stepT = rt.t;
    rt.setPhase('fire');
    rt.unmark('oku'); rt.unzone('oku');
    rt.say('織田信長', '……わしの首、明智に渡すな。御殿に火をかけよ', 3.5);
    rt.obj('main', '御殿に火を放て', 'main');
    rt.addInteract('fire', { x: OKU.x, z: OKU.z }, '御殿に火を放つ', () => this.lordBurn(rt), { r: 4.5, hold: 1.6, prio: 6 });   // 奥は供の者で混み合うので、少し離れていても火を放てる
  },
  lordBurn(rt) {
    const F = rt.flags;
    if (F.burnT) return;
    F.burnT = rt.t;
    rt.uninteract('fire');
    const W = rt.world;
    for (const [x, z] of [[HONNO.x - 2, HONNO.z - 2], [HONNO.x - 8, HONNO.z + 2], [HONNO.x + 4, HONNO.z - 4], [HONNO.x - 6, HONNO.z + 10]]) { W.addFire(x, z, { h: 3 }); W.addSmokeColumn(x, 10, z, { size: 3.4 }); }
    rt.banner('本能寺、炎上', '御殿から火の手が上がった');
    sfx('kane', 0.5);
    rt.award((t) => t.side.push('御殿に火を放った'), '御殿に火を放った');
    // 火の手に、境内の明智勢の足が止まる（しばらく）
    for (const g of F.foes) if (!gone(g)) g.morale = Math.min(g.morale, 60);
    this.lordEscape(rt);
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
    rt.obj('main', '囲みを破って落ちのびよ（本能寺から離れよ）', 'main');
    rt.obj('side', '炎が御殿を包む前に、築地の外へ出よ', 'side');
    if (F.gN.alive) this.lordGateDown(rt, F.gN);
    rt.marker('outN', { x: GATE_N.x, z: GATE_N.z - 2 }, '裏門（北）', { h: 2.5 });
    rt.addInteract('wallW', WALL_W, '築地を越える（松の枝を伝う）', () => this.lordOverWall(rt), { r: 2.6, hold: 1.8, prio: 6 });
    rt.marker('outW', WALL_W, '西の築地（越えられる）', { h: 2.5 });
    rt.bark('落ち口は北の裏門と西の築地。西は松の枝を伝って越えよ。囲みの薄くなる時を見よ');
    // 時とともに開く破れ目
    rt.after(20, () => { if (F.ending) return; this.lordPull(rt, F.ringN); rt.bark('北の囲みが表へ回された。裏門の外が薄い！'); });
    rt.after(40, () => { if (F.ending) return; this.lordPull(rt, F.ringW); rt.bark('西の囲みが表へ回された。西の築地の外が薄い！'); });
    rt.after(60, () => { if (!F.ending) this.lordSouth(rt); });
    // 境内へ新手が入り続ける
    F.moreT = rt.t + 8;
  },
  // 囲みの一手を、表門の前へ回す（その辺りが手薄になる）
  lordPull(rt, g) {
    if (gone(g)) return;
    g.order = 'move'; g.dest = { x: HONNO_GATE.x + 18, z: HONNO_GATE.z + (g === rt.flags.ringN ? -12 : 12) }; g.speed = 2.6;
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
    const g = this.lordWave(rt, '明智の追手', at, null, [{ type: 'cavalry', n: 3 }, { type: 'samurai', n: 1 }, { type: 'ashigaru', n: 6 }], { seekRange: 200, aggro: 60, dmgMult: 0.9 });
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
    rt.say('', '――煙と夜明けの闇に紛れ、信長は京の町へ落ちのびた。背の本能寺は、なお燃えている', 6);
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
    if (F.ending) return;
    const u = rt.player.u, p = u.pos;
    // 小姓衆は自分のそばに付く（奥へ下がる間は、蘭丸らが御殿の前で踏みとどまる）
    if (!gone(F.kosho) && !(F.koshoStay > rt.t)) { F.kosho.order = 'hold'; F.kosho.anchor = { x: p.x - Math.sin(u.heading || 0) * 2.5, z: p.z - Math.cos(u.heading || 0) * 2.5 }; }
    if (F.ran && !F.ran.alive && !F.ranDead) { F.ranDead = true; rt.say('小姓', '蘭丸様、討死……！', 3); }
    if (F.lstep === 1) {
      const t = rt.t - F.stepT;
      // 表門は四十五秒は持つ。裏門は六十秒（それより前に崩れそうでも、門の者が支える）
      if (t < 45 && F.gE.alive && F.gE.hp < 200) F.gE.hp = 200;
      if (t < 60 && F.gN.alive && F.gN.hp < 200) F.gN.hp = 200;
      rt.objProgress('main', `表門 ${Math.max(0, Math.round(F.gE.hp / F.gE.maxHp * 100))}%`);
      if (!F.gE.alive || t > 95) this.lordGateDown(rt, F.gE);
    }
    if (F.gN.alive === false && !F.gNDown) { F.gNDown = true; if (F.lstep < 4) this.lordGateDown(rt, F.gN); }
    else if (F.gN.alive === false) F.gNDown = true;
    if (F.lstep === 2) {
      const d = Math.hypot(p.x - OKU.x, p.z - OKU.z);
      rt.objProgress('main', `奥まで ${Math.max(0, Math.round(d))}m`);
      if (d < 3.8 || rt.t - F.stepT > 70) this.lordFireStep(rt);
    }
    if (F.lstep === 3 && rt.t - F.stepT > 60) { rt.say('小姓', '火は我らが！　……殿、お早く！', 3); this.lordBurn(rt); }
    // 新手（境内へ討ち入る）
    if (F.lstep >= 2 && F.moreT && rt.t > F.moreT) {
      F.moreT = rt.t + (F.lstep >= 4 ? 16 : 18);
      const n = F.lstep >= 4 ? 8 : 10;
      const g = this.lordWave(rt, '境内へ討ち入る明智勢', { x: HONNO_GATE.x + 14, z: HONNO_GATE.z + (Math.random() - 0.5) * 10 }, null, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n }], { dmgMult: 1 });
      if (g && F.lstep >= 4) g.focus = u;   // 火を放った後の新手は、信長の首を探す
    }
    if (F.lstep === 4) {
      const left = Math.max(0, 150 - (rt.t - F.escT));
      const inside = inHonno(p.x, p.z, 0.5);
      const far = Math.hypot(p.x - HONNO.x, p.z - HONNO.z);
      rt.objProgress('main', inside ? `炎が御殿を包むまで ${Math.round(left)}秒` : `本能寺から ${Math.round(far)}m／${ESC_R}m`);
      if (!inside && !F.outT) rt.objDone('side');
      if (!inside) { if (!F.outT) { F.outT = rt.t; F.chaseT = rt.t + 10; } }
      if (F.chaseT && rt.t > F.chaseT && (F.chaseN || 0) < 4) { F.chaseT = rt.t + 15; this.lordChase(rt); }
      if (left <= 0 && inside) { this.lordEnd(rt, 'fire'); return; }
      if (far >= ESC_R) this.lordWin(rt);
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
  if (step <= 1) { if (fight(8)) return; goTo(p, inp, HONNO.x + 6, HONNO.z, 2); return; }
  if (step === 2) { if (fight(1.8)) return; follow('oku', [[HONNO.x - 4, HONNO.z - 11], [OKU.x, HONNO.z - 11], [OKU.x, OKU.z]]); return; }
  if (step === 3) { const it = b.nearestInteract(); if (!it || it.id !== 'fire') { goTo(p, inp, OKU.x, OKU.z, 1); return; } inp.k.add('KeyE'); return; }   // 斬りかかられても、火を放つ手は止めない
  // ④ 落ち口：素直な bot は開いている所へすぐ走る（北の裏門）。賢い bot は南が崩れるまで待つ
  const smart = typeof window !== 'undefined' && window.__lordSmart;
  const inside = inHonno(u.pos.x, u.pos.z, 0.5);
  if (!b.botRoute) b.botRoute = smart ? (F.sOpen ? 's' : '') : 'n';
  if (smart && !b.botRoute && F.sOpen) b.botRoute = 's';
  if (!b.botRoute) { if (fight(3)) return; goTo(p, inp, OKU.x, OKU.z + 4, 1.5); return; }
  if (!inside && fight(1.3)) return;   // 外では斬り合わず走る
  if (inside && fight(1.4)) return;
  if (b.botRoute === 'n') follow('n', [[OKU.x, HONNO.z - 11], [GATE_N.x, GATE_N.z + 3], [GATE_N.x, GATE_N.z - 4], [HONNO.x + 24, HONNO.z - 36], [HONNO.x + 56, HONNO.z - 64]]);
  else follow('s', [[OKU.x - 0.4, HONNO.z + 6], [OKU.x - 0.4, S_BREAK.z - 2], [S_BREAK.x - 3, S_BREAK.z - 1.5], [S_BREAK.x - 3, S_BREAK.z + 5], [HONNO.x - 20, HONNO.z + 38], [HONNO.x - 22, HONNO.z + 80]]);   // 辻の固めの脇をすり抜ける
}

// 両軍の総勢（京にいた織田の者 千五百ほど。明智 一万三千ほど。数には諸説ある）
honnoji.force = (rt) => {
  const F = rt.flags;
  // 信長で遊ぶ時：寺にいた供回りは百五十ほど（小姓衆と馬廻の一部）
  if (rt.G.lord) { const n = rt.army.units.filter((u) => u.alive && u.team === 0).length; F.a0n = F.a0n || n || 1; return { a: Math.round(150 * n / F.a0n), a0: 150, b: Math.max(0, 13000 - (F.ek || 0) * 10), b0: 13000 }; }
  return { a: Math.max(0, 1500 - (F.ak || 0) * 8 - (F.step >= 5 ? 900 : 0)), a0: 1500, b: Math.max(0, 13000 - (F.ek || 0) * 10), b0: 13000 };
};
honnoji.sides = { a: { name: '織田軍', mon: 'oda' }, b: { name: '明智軍', mon: 'akechi' } };
honnoji.date = (rt) => `天正十年六月二日　夏・${!rt.G.lord && rt.flags.step >= 3 ? '朝' : '夜明け前'}`;
honnoji.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? (rt.G.lord ? '話を飛ばす' : '組頭の話を飛ばす') : '');
honnoji.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
honnoji.history = '天正十年（1582）六月二日の夜明け前、中国の毛利攻めに向かうはずだった明智光秀の軍一万三千ほどが、京の本能寺を囲んだ。わずかな供と泊まっていた織田信長は、明智の謀反と知って「是非に及ばず」と言い、自ら弓や槍を取って戦ったが、傷を負って奥へ入り、火を放って自害したと『信長公記』は伝える。森成利（蘭丸）ら小姓衆も討ち死にした。近くの妙覚寺にいた嫡男の信忠は、村井貞勝らと二条御所（二条新御所）に移り、誠仁親王を御所の外へ移してから戦ったが、明智勢は隣の近衛前久の屋敷の屋根から鉄砲を撃ちかけ、信忠も自害した。信長の遺体は見つからなかった。十一日後、中国から引き返した羽柴秀吉が山崎の戦いで光秀を破る。この戦の主人公と組頭の甚兵衛は、遊びのための人物である。兵の数には諸説ある。';

// 素直な遊び手：通りの明智勢を破り、本能寺の門の前で話を聞き、二条御所の門を守り、北の口から落ちる
honnoji.botBrain = (b, inp, { goTo }) => {
  if (b.G.lord) { lordBot(b, inp, goTo); return; }
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyE');
  if (!u.alive || F.ending) return;
  if (u.hp < u.maxHp * 0.45 && F.step !== 5) b.botRest = true;
  if (b.botRest && u.hp > u.maxHp * 0.85) b.botRest = false;
  const rest = F.step >= 3 ? { x: NIJO.x - 4, z: NIJO.z } : { x: START.x, z: START.z };
  if (b.botRest) { inp.guardHold = false; goTo(p, inp, rest.x, rest.z, 2); return; }
  const e = b.army.nearestEnemy(u, F.step === 5 ? 6 : 12, (o) => !o.fleeing);
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d > 2.6) inp.k.add('KeyW');
    if (d < 3.2 && Math.random() < 0.5) inp.leftPressed = true;
    inp.guardHold = (b.army.threats || []).length > 0 && Math.random() < 0.85;
    return;
  }
  inp.guardHold = false;
  // 通りを伝って歩く（点を順にたどる）
  const follow = (key, pts) => {
    if (b.botPath !== key) { b.botPath = key; b.botWp = 0; }
    const w = pts[Math.min(b.botWp, pts.length - 1)];
    if (Math.hypot(w[0] - u.pos.x, w[1] - u.pos.z) < 2.5 && b.botWp < pts.length - 1) b.botWp++;
    goTo(p, inp, w[0], w[1], 1.2);
  };
  if (F.step <= 1) { if (F.step === 1 && !gone(F.cord)) { const c = F.cord.center(); if (u.pos.x > -20) { follow('a', [[-27, 27]]); return; } goTo(p, inp, c.x, c.z, 2); return; } return; }
  if (F.step === 2) { follow('b', [[-27, 27], [-27, 54], [HONNO_GATE.x + 8, HONNO_GATE.z]]); return; }
  if (F.step === 3) { if (F.patrolOn && !gone(F.patrol)) { const c = F.patrol.center(); goTo(p, inp, c.x, c.z, 2); return; } follow('c', [[-27, 54], [-27, -27], [27, -27], [27, -54], [NIJO_GATE.x - 3, NIJO_GATE.z]]); return; }
  if (F.step === 4) { const q = (F.waves || []).find((x) => !gone(x)); if (q) { const c = q.center(); if (Math.hypot(c.x - NIJO_GATE.x, c.z - NIJO_GATE.z) < 30) { goTo(p, inp, c.x, c.z, 2); return; } } goTo(p, inp, NIJO_GATE.x - 1, NIJO_GATE.z, 2); return; }
  if (F.step === 5) follow('d', [[NIJO_GATE.x + 4, NIJO_GATE.z], [NIJO.x, NIJO.z - 4], [NIJO_BACK.x, NIJO_BACK.z + 2], [NIJO_BACK.x, NIJO_BACK.z - 6], [OUT.x, OUT.z]]);
};

export { honnoji };
