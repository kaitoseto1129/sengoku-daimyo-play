// ======================================================================
// 織田家編　志賀の陣・宇佐山城（元亀元年九月）
// 信長が摂津の野田・福島に出ている間に、浅井・朝倉の三万が湖の西を下って坂本へ出てきた。
// 宇佐山城を守る森可成は、信長の弟・織田信治とともに坂本で迎え撃ち、二人とも討ち死にした。
// 城は残った者たちが守り通し、摂津から戻った信長の前に、浅井・朝倉は比叡山へ上がった。
// 足軽は森可成の手。①坂本の町口で朝倉の先手を迎え撃つ ②大軍に押され、宇佐山城へ退く
// ③宇佐山城の木戸を守る（寄せ手が木戸を破りにかかる）。信長の後詰が来るまで持ちこたえる
// 向き：東（+x）が琵琶湖。北（-z）から浅井・朝倉が湖の西を下ってくる。南（+z）の山の上に宇佐山城。西に比叡山
// ======================================================================
import * as THREE from 'three';
import { nobori, hut, yagura, campfire, kabukimon, tawara } from './props.js';
import { flagTexture } from './textures.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { moraleWord } from './hud.js';
import { gauss, enemyGroup, allyGroup, nm, centerOf, unitPos, ringWall } from './bhelp.js';
import { dress, gone } from './b_inabayama.js';

const TOWN = { x: 20, z: 10 };             // 坂本の町口
const USA = { x: -22, z: 96, r: 16 };      // 宇佐山城
const ROAD = [[30, -190], [26, -80], [22, -20], [TOWN.x, TOWN.z], [10, 50], [-8, 76], [USA.x + 6, USA.z - USA.r + 2]];
const ODA = { flag: 'oda' };
const ASA = { flag: 'asakura' };
const AZA = { flag: 'azai' };

function height(x, z) {
  let h = 0.4 * Math.sin(x * 0.03 + 0.2) * Math.cos(z * 0.028) + 0.25 * Math.sin(z * 0.07 + x * 0.02);
  // 宇佐山（上は平らな砦）
  const d = Math.hypot(x - USA.x, z - USA.z);
  h += 26 * Math.exp(-(Math.max(0, d - 12) ** 2) / 1600);
  // 比叡山（西）と、南の山並み
  h += 60 * gauss(x, z, -170, -40, 9000) + Math.max(0, -x - 80) * 0.25 + 20 * gauss(x, z, -60, 170, 4000);
  // 東は琵琶湖へ
  if (x > 70) h -= Math.min(7, (x - 70) * 0.3);
  return h;
}

const shiga = {
  spawn: { x: TOWN.x + 4, z: TOWN.z + 8, heading: Math.PI },
  world: {
    seed: 15709,
    time: 'day',
    muddy: 0.25,
    autumn: true,
    water: { x: 94, level: -2.4 },
    paths: [ROAD],
    height,
    tint(x, z, h, c) {
      if (x > 74) { const k = Math.min(1, (x - 74) / 12); c.lerp({ r: 0.6, g: 0.57, b: 0.48 }, k * 0.7); }
      else if (h > 12) c.setRGB(c.r * 0.84, c.g * 0.9, c.b * 0.8);
    },
    clear: (x, z) => (Math.abs(x - TOWN.x) < 50 && z > -70 && z < 60) || Math.hypot(x - USA.x, z - USA.z) < USA.r + 8 || (x > -20 && x < 30 && z > 40 && z < 90),
    trees: 520,
    tufts: 3400,
    treeDensity: (x, z) => (x > -30 && x < 70 && z > -80 && z < 60 ? 0.15 : 1),
    groves: [{ x: -40, z: 0, r: 14, n: 20 }, { x: 50, z: 70, r: 12, n: 16 }],
    fleeOut: (x, z, team) => team === 1 && (z < -140 || x < -90),
  },

  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    F.step = 0; F.ek = 0; F.ak = 0;
    // ---- 坂本の町（湖べりの町屋） ----
    for (const [x, z, r] of [[36, 20, 0.1], [44, 4, -0.2], [48, -14, 0.2], [34, -24, 0], [2, 24, 0.3], [-6, 6, -0.1], [52, 30, 0.2]]) rt.scene.add(hut(W, x, z, 7, 5, r, { wall: 0x7b6448 }));
    rt.scene.add(tawara(W, 28, 30, 0.2, 5));
    // ---- 宇佐山城：柵の囲いと木戸（北東の口） ----
    const GA = Math.PI * 0.8;   // 口の向き（北東へ少し東）
    F.uwall = ringWall(rt, USA.x, USA.z, USA.r, { gapAt: GA, gapW: 0.34, team: 0, hp: 1e9, name: '柵', segLen: 5 });
    for (const s of F.uwall) { s.noTarget = true; s.wall = true; }
    const n0 = Math.max(6, Math.round((2 * Math.PI * USA.r) / 5));
    const i0 = Math.round(GA / (2 * Math.PI / n0));
    const a0 = (i0 - 1) * (2 * Math.PI / n0), a1 = (i0 + 1) * (2 * Math.PI / n0);
    const p0 = [USA.x + Math.sin(a0) * USA.r, USA.z + Math.cos(a0) * USA.r], p1 = [USA.x + Math.sin(a1) * USA.r, USA.z + Math.cos(a1) * USA.r];
    F.gate = rt.army.addStruct({ seg: [p0[0], p0[1], p1[0], p1[1]], hp: 2600, maxHp: 2600, armor: 0.25, team: 0, name: '宇佐山城の木戸' });
    F.gateC = { x: (p0[0] + p1[0]) / 2, z: (p0[1] + p1[1]) / 2 };
    F.gateN = { x: Math.sin(GA), z: Math.cos(GA) };
    const dm = new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) - 0.2, 2.8, 0.2), new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 0.95 }));
    dm.position.set(F.gateC.x, W.heightAt(F.gateC.x, F.gateC.z) + 1.4, F.gateC.z);
    dm.rotation.y = Math.atan2(p1[1] - p0[1], -(p1[0] - p0[0]));
    dm.castShadow = true;
    F.gate.mesh = dm;
    rt.scene.add(dm, kabukimon(W, F.gateC.x, F.gateC.z, 6.2, dm.rotation.y));
    rt.scene.add(hut(W, USA.x - 4, USA.z + 4, 9, 6, 0.2, { wall: 0x6a5238 }), yagura(W, USA.x + 6, USA.z - 6), yagura(W, USA.x - 8, USA.z - 4));
    for (const [x, z] of [[USA.x + 2, USA.z - 10], [USA.x - 10, USA.z + 2], [USA.x + 10, USA.z + 4]]) rt.scene.add(nobori(W, x, z, 'oda', 6));
    // ---- 森可成の手（自分の持ち場）と、織田信治の手 ----
    F.mori = allyGroup(rt, { name: '森可成の手', anchor: { x: TOWN.x, z: TOWN.z - 6 }, facing: Math.PI, width: 14, aggro: 10, noRout: true, formation: 'yari' },
      dress([{ type: 'busho', n: 1, o: { name: '森可成', invuln: true, hat: 'kabuto_m', haori: 0x2a2a2a } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 16 }], ODA));
    F.moriU = F.mori.units[0];
    F.nobuharu = allyGroup(rt, { name: '織田信治の手', anchor: { x: TOWN.x + 22, z: TOWN.z - 4 }, facing: Math.PI, width: 12, aggro: 10, noRout: true, formation: 'yari' },
      dress([{ type: 'samurai', n: 1, o: { name: '織田信治', invuln: true, hat: 'kabuto_m', haori: 0x6a1a14 } }, { type: 'ashigaru', n: 12 }, { type: 'gun', n: 3 }], ODA));
    F.nobuU = F.nobuharu.units[0];
    // 城に残る者（各務元正ら）
    F.keep = allyGroup(rt, { name: '宇佐山城の守り', anchor: { x: USA.x, z: USA.z }, facing: GA, width: 10, aggro: 10, noRout: true },
      dress([{ type: 'samurai', n: 1, o: { name: '各務元正', invuln: true, hat: 'kabuto_w' } }, { type: 'ashigaru', n: 8 }, { type: 'bow', n: 4 }], ODA));
    F.oda = [F.mori, F.nobuharu, F.keep];
    for (const g of F.oda) { g.defMult = 1.2; g.dmgMult = 0.8; }
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: TOWN.x + 8, z: TOWN.z + 10 }, Math.PI, [{ kind: 'spear', n }]);
    // ---- 大軍（軽い作り）：湖の西を下ってくる浅井・朝倉 ----
    const DA = (x, z, w, d, count, facing, armor, flag, seed) => W.addDistantArmy({ x, z, w, d, count, facing, armor, flagTex: flagTexture(flag), seed });
    F.host = [DA(24, -150, 40, 16, 320, 0, 0x33291f, 'asakura', 15791), DA(-20, -160, 36, 14, 280, 0.2, 0x2e2a26, 'azai', 15792), DA(60, -170, 30, 12, 220, -0.1, 0x33291f, 'asakura', 15793)];
    for (const [x, z] of [[-2, -130], [14, -128], [40, -132]]) rt.scene.add(nobori(W, x, z, 'asakura', 7));
    for (const [x, z] of [[20, 40], [-10, 60]]) { rt.scene.add(campfire(W, x, z)); W.addFire(x, z); }

    rt.world.setTime('day');
    rt.setPhase('brief');
    rt.obj('main', '森可成のもとで、坂本の町口を固めよ', 'main');
    rt.say('', '元亀元年九月　近江国 坂本', 3.5);
    rt.say('森可成', `${nm(rt)}、湖の西を浅井・朝倉が下ってくる。三万じゃ。殿（信長公）は摂津で三好と対陣しておられる`, 5);
    rt.say('織田信治', '京へ抜かれれば、殿は挟まれる。ここで一日でも止めるぞ', 4);
    rt.marker('mori', unitPos(F.moriU), '森可成', {});
    rt.after(16, () => this.first(rt));
  },

  // ① 朝倉の先手を迎え撃つ
  first(rt) {
    const F = rt.flags;
    if (F.step >= 1) return;
    F.step = 1; F.stepT = rt.t;
    rt.setPhase('first');
    rt.unmark('mori');
    sfx('horagai', 0.9);
    rt.banner('朝倉の先手', '湖の西の道を、朝倉の旗が下ってくる');
    rt.obj('main', '町口で朝倉の先手を迎え撃て', 'main');
    for (const h of F.host) h.advance(40, 60);
    const g = enemyGroup(rt, { faction: 'saito', name: '朝倉の先手', anchor: { x: 22, z: -70 }, facing: 0, order: 'attack', seekRange: 90, aggro: 14, width: 16, morale: 95, fleeDir: { x: 0, z: -1 }, dmgMult: 0.66, formation: 'yari' },
      dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 18 }, { type: 'bow', n: 3 }], ASA));
    F.w1 = g;
    rt.marker('w1', centerOf(g), () => `朝倉の先手・${moraleWord(g.morale)}`, { red: true, group: g });
    rt.say('森可成', '槍を揃えよ！　町口を一歩も通すな！', 3);
    rt.after(34, () => {
      if (F.step !== 1) return;
      F.w1b = enemyGroup(rt, { faction: 'saito', name: '朝倉の二の手', anchor: { x: 44, z: -70 }, facing: 0, order: 'attack', seekRange: 90, aggro: 14, width: 12, morale: 90, fleeDir: { x: 0, z: -1 }, dmgMult: 0.66 },
        dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 14 }, { type: 'gun', n: 2 }], ASA));
      for (const u of F.w1b.units) if (u.type === 'gun') u.dmg *= 0.45;
      rt.marker('w1b', centerOf(F.w1b), () => `朝倉の二の手・${moraleWord(F.w1b.morale)}`, { red: true, group: F.w1b });
      rt.say('織田信治', '湖べりからも来るぞ！', 2.5);
    });
  },

  // ② 大軍に押され、宇佐山城へ退く
  fall(rt) {
    const F = rt.flags;
    if (F.step >= 2) return;
    F.step = 2; F.stepT = rt.t;
    rt.setPhase('fall');
    rt.unmark('w1'); rt.unmark('w1b');
    rt.award((t) => t.side.push('朝倉の先手を退けた'), '朝倉の先手を退けた');
    for (const h of F.host) h.advance(60, 50);
    rt.banner('浅井・朝倉の大軍', '比叡山の方からも、浅井の兵が回り込んでくる');
    const g = enemyGroup(rt, { faction: 'saito', name: '浅井の手', anchor: { x: -30, z: -30 }, facing: Math.PI * 0.7, order: 'attack', seekRange: 100, aggro: 14, width: 16, morale: 100, fleeDir: { x: -1, z: -1 }, dmgMult: 0.7 },
      dress([{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 20 }], AZA));
    F.w2 = g;
    rt.marker('w2', centerOf(g), () => `浅井の手・${moraleWord(g.morale)}`, { red: true, group: g });
    rt.say('森可成', `……多すぎる。${nm(rt)}、そなたらは宇佐山の城へ上がれ。わしと信治殿がここで食い止める`, 5);
    rt.say('織田信治', '城を頼む。殿が戻られるまで、城を渡すな！', 3.5);
    rt.obj('main', '宇佐山城へ退け', 'main');
    rt.marker('usa', F.gateC, '宇佐山城', { h: 3 });
    rt.zone('usa', F.gateC.x + F.gateN.x * 6, F.gateC.z + F.gateN.z * 6, 5);
    // 森・信治の手は町口に踏みとどまる
    for (const q of [F.mori, F.nobuharu]) { q.order = 'hold'; q.aggro = 16; }
  },

  // ③ 宇佐山城を守る
  siege(rt) {
    const F = rt.flags;
    if (F.step >= 3) return;
    F.step = 3; F.stepT = rt.t;
    rt.setPhase('siege');
    rt.unmark('usa'); rt.unzone('usa'); rt.unmark('w2');
    // 坂本の町口の戦いの終わり（史実：森可成・織田信治は討ち死に）
    for (const u of [F.moriU, F.nobuU]) { u.invuln = false; if (u.alive) rt.army.kill(u, null); }
    for (const q of [F.mori, F.nobuharu]) { q.noRout = false; q.morale = 0; q.fleeDir = { x: -0.4, z: 1 }; }
    if (F.w2 && !gone(F.w2)) { F.w2.noRout = false; F.w2.morale = 0; }
    sfx('kane', 0.4);
    rt.banner('森可成・織田信治、討ち死に', '坂本の町口で、二人とも最後まで戦った');
    rt.say('各務元正', '……殿（可成）が。……木戸を閉めよ！　ここは渡さぬ。上様が戻られるまで守り抜く', 5);
    rt.obj('main', '宇佐山城の木戸の前で、取り付く寄せ手を討て', 'main');
    F.keep.order = 'hold'; F.keep.anchor = { x: F.gateC.x + F.gateN.x * 4, z: F.gateC.z + F.gateN.z * 4 }; F.keep.facing = Math.atan2(F.gateN.x, F.gateN.z); F.keep.aggro = 12;
    rt.marker('gate', F.gateC, () => `木戸 ${Math.round(Math.max(0, F.gate.hp) / F.gate.maxHp * 100)}%`, { h: 4 });
    F.waves = [];
    const mk = (i) => {
      const flag = i % 2 ? AZA : ASA;
      const from = [[40, 40], [0, 50], [30, 60]][i];
      const g = enemyGroup(rt, { faction: 'saito', name: ['城へ寄せる朝倉勢', '城へ寄せる浅井勢', '朝倉の新手'][i], anchor: { x: from[0], z: from[1] }, facing: -Math.PI * 0.7, order: 'assault', aggro: 6, width: 10, morale: 95, fleeDir: { x: 0.3, z: -1 }, dmgMult: 0.62 },
        dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 14 }, ...(i === 2 ? [{ type: 'gun', n: 3 }] : [])], flag));
      g.assault = () => (F.gate.alive ? F.gate : null);
      for (const u of g.units) if (u.type === 'gun') u.dmg *= 0.45;
      F.waves.push(g);
      rt.army.play('eshout', { x: from[0], z: from[1] }, 1.6);
      rt.marker('x' + i, centerOf(g), () => `${g.name}・${moraleWord(g.morale)}`, { red: true, group: g });
    };
    rt.after(8, () => { mk(0); rt.say('足軽', '寄せてくるぞ！　木戸に取り付かせるな！', 3); });
    rt.after(50, () => { if (!F.ending) { mk(1); rt.say('足軽', '浅井の旗じゃ、また来る！', 2.5); } });
    rt.after(95, () => { if (!F.ending) mk(2); });
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.unmark('gate'); for (let i = 0; i < 3; i++) rt.unmark('x' + i);
    for (const q of F.waves || []) if (!gone(q)) { q.noRout = false; q.morale = 0; }
    for (const h of F.host) h.retreat(60, 40);
    rt.objDone('main');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '宇佐山城を守り通した', pts: 20 }; }, '任務達成・宇佐山城を守り通した');
    sfx('horagai', 0.8);
    rt.banner('宇佐山城、守り通す', '摂津から戻った信長の前に、浅井・朝倉は比叡山へ上がった');
    rt.say('各務元正', `${nm(rt)}、ようやった。……殿（可成）に、城は渡さなんだと申し上げられる`, 5);
    rt.after(6, () => rt.say('', '――浅井・朝倉は比叡山に籠もり、延暦寺がこれをかくまった。この冬、信長は和を結ぶ。翌年、比叡山は焼かれる', 6));
    rt.player.u.invuln = true;
    rt.finish({}, 13);
  },

  update(rt, dt) {
    const F = rt.flags;
    // 崩れた隊の印は消す（古い印が「あちらじゃ」の行き先にならないように）
    for (const m of rt.markers.slice()) if (m.group && gone(m.group)) rt.unmark(m.id);
    if (F.ending) return;
    const p = rt.player.u.pos;
    if (F.step === 1) {
      const qs = [F.w1, F.w1b].filter(Boolean);
      rt.objProgress('main', `朝倉勢 ${qs.reduce((a, q) => a + (gone(q) ? 0 : q.count), 0)}人`);
      for (const q of qs) if (q.count < 5 && !gone(q)) q.morale = Math.min(q.morale, 20);
      if ((F.w1b && qs.every(gone)) || rt.t - F.stepT > 140) this.fall(rt);
    }
    if (F.step === 2) {
      const zc = { x: F.gateC.x + F.gateN.x * 6, z: F.gateC.z + F.gateN.z * 6 };
      const d = Math.hypot(p.x - zc.x, p.z - zc.z);
      rt.objProgress('main', `城まで ${Math.max(0, Math.round(d))}m`);
      if (d < 6 || rt.t - F.stepT > 100) this.siege(rt);
    }
    if (F.step === 3) {
      const L = F.waves || [];
      const left = Math.max(0, 170 - (rt.t - F.stepT));
      rt.objProgress('main', `木戸 ${Math.round(Math.max(0, F.gate.hp) / F.gate.maxHp * 100)}%・後詰まで ${Math.ceil(left)}秒`);
      for (const q of L) if (q.count < 4 && !gone(q)) q.morale = Math.min(q.morale, 20);
      if ((L.length >= 3 && L.every(gone)) || left <= 0) this.win(rt);
    }
  },

  onKill(rt, v) {
    const F = rt.flags;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
  },
  onRout(rt, g) {
    if (g.team !== 1) return;
    rt.say('足軽', `${g.name}が退いていく！`, 2.5);
  },
  onStructHit(rt, s) {
    const F = rt.flags;
    if (s !== F.gate) return;
    const pct = Math.round(Math.max(0, s.hp) / s.maxHp * 100);
    const next = [75, 50, 25].find((q) => pct <= q && !(F.saidPct || []).includes(q));
    if (next) { F.saidPct = [...(F.saidPct || []), next]; rt.bark(`木戸が叩かれている（残り ${pct}%）`, true); }
  },
  onStructDestroyed(rt, s) {
    const F = rt.flags;
    if (s !== F.gate) return;
    s.mesh.rotation.x = -1.4; s.mesh.position.y -= 1.2;
    sfx('wood', 1.2);
    rt.say('各務元正', '木戸が破られた！　口で押し返せ、中へ入れるな！', 3.5);
    for (const q of F.waves || []) { q.order = 'attack'; q.seekRange = 60; }
  },
};

// 両軍の総勢（宇佐山城の森可成の兵 千ほど、浅井・朝倉 三万ほど。数には諸説ある）
shiga.force = (rt) => {
  const F = rt.flags;
  return { a: Math.max(0, 1000 - (F.ak || 0) * 8 - (F.step >= 3 ? 300 : 0)), a0: 1000, b: Math.max(0, 30000 - (F.ek || 0) * 20), b0: 30000 };
};
shiga.sides = { a: { name: '織田軍（宇佐山城）', mon: 'oda' }, b: { name: '浅井・朝倉軍', mon: 'asakura' } };
shiga.date = () => '元亀元年九月二十日　秋・晴';
shiga.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '可成の話を飛ばす' : '');
shiga.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
shiga.history = '元亀元年（1570）九月、信長が摂津の野田・福島で三好三人衆と対陣している間に、浅井長政・朝倉義景の三万ほどが琵琶湖の西を下って近江の坂本へ出てきた。宇佐山城を守っていた森可成は、信長の弟・織田信治とともに坂本で迎え撃ったが、九月二十日、二人とも討ち死にした。城は各務元正らが守り通した。信長が急いで摂津から戻ると、浅井・朝倉は比叡山に上がり、延暦寺がこれをかくまった。対陣は冬まで続き、十二月、将軍義昭らの仲立ちで和が結ばれた（志賀の陣）。翌年九月、信長は比叡山を攻める。森可成は、のちの森長可・森成利（蘭丸）の父である。兵の数には諸説ある。';

// 素直な遊び手：町口で朝倉と戦い、城へ退き、木戸に取り付く寄せ手を討つ
shiga.botBrain = (b, inp, { goTo }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyE');
  if (!u.alive || F.ending) return;
  if (u.hp < u.maxHp * 0.5) b.botRest = true;
  if (b.botRest && u.hp > u.maxHp * 0.85) b.botRest = false;
  const inside = { x: USA.x, z: USA.z };
  if (b.botRest && F.step !== 2) { inp.guardHold = false; const r = F.step >= 3 ? inside : { x: TOWN.x + 4, z: TOWN.z + 16 }; goTo(p, inp, r.x, r.z, 2); return; }
  const e = b.army.nearestEnemy(u, F.step === 2 ? 5 : 12, (o) => !o.fleeing);
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d > 2.6) inp.k.add('KeyW');
    if (d < 3.2 && Math.random() < 0.5) inp.leftPressed = true;
    inp.guardHold = (b.army.threats || []).length > 0 && Math.random() < 0.85;
    return;
  }
  inp.guardHold = false;
  const out = { x: F.gateC.x + F.gateN.x * 5, z: F.gateC.z + F.gateN.z * 5 };
  if (F.step === 1) { const q = [F.w1, F.w1b].find((x) => x && !gone(x)); if (q) { const c = q.center(); goTo(p, inp, c.x, c.z, 2); return; } }
  if (F.step === 2) { goTo(p, inp, out.x, out.z, 1.5); return; }
  if (F.step === 3) {
    // 木戸の外に出て、取り付く寄せ手を討つ
    const q = (F.waves || []).find((x) => !gone(x));
    if (q) { const c = q.center(); if (Math.hypot(c.x - F.gateC.x, c.z - F.gateC.z) < 26) { goTo(p, inp, c.x, c.z, 2); return; } }
    goTo(p, inp, out.x, out.z, 2);
    return;
  }
  const a = F.moriU.pos; goTo(p, inp, a.x + 3, a.z + 4, 3);
};

export { shiga };
