// ======================================================================
// 織田家編　信貴山城の戦い（天正五年十月）
// 石山本願寺攻めの陣を勝手に払い、信長に背いた松永久秀は、大和の信貴山城に籠もった。
// 織田信忠を大将に、明智光秀・羽柴秀吉・筒井順慶らが城を囲み、十月十日、久秀は天守に火を放って自害した。
// 足軽は信忠の軍の筒井順慶の手に付く。①筒井の者の案内で、尾根道を登る（横から伏兵）
// ②門の脇の物見櫓に火を放ち、上からの矢を止める ③門を破って、打って出る松永勢を退ける ④天守の前で最後の衆を退ける
// 向き：北（-z）の山の上に城。南（+z）の麓に織田の陣
// ======================================================================
import * as THREE from 'three';
import { nobori, hut, yagura, campfire, jinmaku, kabukimon, tawara } from './props.js';
import { flagTexture } from './textures.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { moraleWord } from './hud.js';
import { gauss, enemyGroup, allyGroup, nm, centerOf, unitPos, wallLine, ringWall } from './bhelp.js';
import { more, dress, gone } from './b_inabayama.js';

const TOP = { x: 0, z: -110, r: 20 };      // 本丸（天守）
const GATE = { x: 0, z: -66 };             // 門（本丸の手前の曲輪の口）
const TOWER = { x: 12, z: -70 };           // 門の脇の物見櫓
const ROAD = [[0, 150], [6, 90], [-10, 40], [4, -10], [0, -40], [GATE.x, GATE.z + 6], [0, TOP.z]];
const ODA = { flag: 'oda' };
const MATSU = { flag: 'todo' };            // 松永の蔦（藤堂蔦の紋で代える）

function base(x, z) {
  let h = 0.5 * Math.sin(x * 0.04 + 0.3) * Math.cos(z * 0.03) + 0.35 * Math.sin(z * 0.07 + x * 0.03);
  // 信貴山（北が高い）
  h += 46 * gauss(x, z, 0, -110, 4200) + 10 * gauss(x, z, -60, -80, 2000) + 12 * gauss(x, z, 70, -120, 2400);
  // 生駒の山並み
  h += 30 * gauss(x, z, -200, -140, 10000);
  return h;
}
const HT = base(TOP.x, TOP.z), HG = base(GATE.x, GATE.z - 12);
function height(x, z) {
  let h = base(x, z);
  // 本丸と、その手前の曲輪をならす
  const k1 = Math.max(0, Math.min(1, (TOP.r + 5 - Math.hypot(x - TOP.x, z - TOP.z)) / 6));
  h = h * (1 - k1) + HT * k1;
  const k2 = Math.max(0, Math.min(1, (18 - Math.hypot(x - GATE.x, (z - (GATE.z - 12)) * 1.3)) / 6));
  return h * (1 - k2) + Math.max(h, HG) * k2;
}

// 天守（四重の櫓を重ねた形）
function tenshu(W, x, z) {
  const g = new THREE.Group();
  const wall = new THREE.MeshStandardMaterial({ color: 0xcfc6b4, roughness: 0.95 }), roof = new THREE.MeshStandardMaterial({ color: 0x34322f, roughness: 0.85 }), wood = new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 0.95 });
  let y = 0;
  const base0 = new THREE.Mesh(new THREE.BoxGeometry(12, 1.6, 10), new THREE.MeshStandardMaterial({ color: 0x6a6258, roughness: 1 })); base0.position.y = 0.8; g.add(base0); y = 1.6;
  [[10, 3.2, 8], [8, 2.8, 6.4], [6.2, 2.6, 5], [4.6, 2.4, 3.8]].forEach(([w, h, d], i) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), i === 3 ? wood : wall); b.position.y = y + h / 2; g.add(b);
    const r = new THREE.Mesh(new THREE.BoxGeometry(w + 1.6, 0.3, d + 1.6), roof); r.position.y = y + h + 0.1; g.add(r);
    y += h + 0.3;
  });
  const cap = new THREE.Mesh(new THREE.ConeGeometry(3.2, 1.8, 4), roof); cap.position.y = y + 0.8; cap.rotation.y = Math.PI / 4; g.add(cap);
  for (const m of g.children) { m.castShadow = true; m.receiveShadow = true; m.userData.camBlock = true; }
  g.position.set(x, W.heightAt(x, z), z);
  return g;
}

const shigisan = {
  spawn: { x: 6, z: 100, heading: Math.PI },
  world: {
    seed: 15770,
    time: 'day',
    autumn: true,
    muddy: 0.3,
    paths: [ROAD],
    height,
    tint(x, z, h, c) { if (h > 14) c.setRGB(c.r * 0.84, c.g * 0.88, c.b * 0.8); },
    clear: (x, z) => Math.abs(x) < 26 && z > -140 && z < 130,
    trees: 640,
    tufts: 3000,
    treeDensity: (x, z) => (Math.abs(x) < 30 && z > -140 ? 0.15 : 1),
    groves: [{ x: -40, z: 20, r: 14, n: 22 }, { x: 40, z: -30, r: 14, n: 22 }],
    fleeOut: (x, z, team) => team === 1 && (z < -135 || Math.abs(x) > 80),
  },

  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    F.step = 0; F.ek = 0; F.ak = 0;
    const noT = (segs) => { for (const s of segs) { s.noTarget = true; s.wall = true; } return segs; };
    // ---- 門の曲輪：柵と門、脇の物見櫓 ----
    noT(wallLine(rt, [[-28, GATE.z + 4], [-3.5, GATE.z]], { team: 1, hp: 1e9, name: '柵', segLen: 5 }));
    noT(wallLine(rt, [[3.5, GATE.z], [28, GATE.z + 4]], { team: 1, hp: 1e9, name: '柵', segLen: 5 }));
    F.gate = rt.army.addStruct({ seg: [-3.5, GATE.z, 3.5, GATE.z], nx: 0, nz: 1, hp: 1800, maxHp: 1800, armor: 0.22, team: 1, name: '門' });
    const dm = new THREE.Mesh(new THREE.BoxGeometry(6.8, 2.9, 0.2), new THREE.MeshStandardMaterial({ color: 0x3e3024, roughness: 0.95 }));
    dm.position.set(GATE.x, W.heightAt(GATE.x, GATE.z) + 1.45, GATE.z); dm.castShadow = true;
    F.gate.mesh = dm;
    rt.scene.add(dm, kabukimon(W, GATE.x, GATE.z, 7.4, 0));
    F.tower = yagura(W, TOWER.x, TOWER.z);
    rt.scene.add(F.tower, yagura(W, -12, GATE.z - 6));
    // ---- 本丸：柵の囲い（南に口）と天守 ----
    noT(ringWall(rt, TOP.x, TOP.z, TOP.r, { gapAt: 0, gapW: 0.45, team: 1, hp: 1e9, name: '本丸の柵', segLen: 5 }));
    rt.scene.add(tenshu(W, TOP.x - 2, TOP.z - 8));
    rt.scene.add(hut(W, TOP.x + 10, TOP.z + 2, 7, 5, -0.3, { wall: 0x6a5238 }), hut(W, -14, GATE.z - 16, 8, 5, 0.2, { wall: 0x6a5238 }), hut(W, 16, GATE.z - 20, 7, 5, -0.1));
    for (const [x, z] of [[-6, GATE.z - 4], [6, GATE.z - 4], [TOP.x - 8, TOP.z + 12], [TOP.x + 8, TOP.z + 12]]) rt.scene.add(nobori(W, x, z, 'todo', 6));
    // ---- 筒井順慶の手（自分の持ち場）、明智の手、門を破る組 ----
    F.tsutsui = allyGroup(rt, { name: '筒井順慶の手', anchor: { x: 2, z: 92 }, facing: Math.PI, width: 12, aggro: 10, noRout: true },
      dress([{ type: 'busho', n: 1, o: { name: '筒井順慶', invuln: true, hat: 'kabuto_m', haori: 0x2a2a3a } }, { type: 'ashigaru', n: 16 }, { type: 'bow', n: 4 }], ODA));
    F.tsuU = F.tsutsui.units[0];
    F.ake = allyGroup(rt, { name: '明智光秀の手', anchor: { x: -20, z: 100 }, facing: Math.PI, width: 12, aggro: 10, noRout: true },
      dress([{ type: 'busho', n: 1, o: { name: '明智光秀', invuln: true } }, { type: 'ashigaru', n: 14 }, { type: 'gun', n: 6 }], ODA));
    F.ram = allyGroup(rt, { name: '門を破る組', anchor: { x: 14, z: 108 }, facing: Math.PI, width: 5, aggro: 3, noRout: true, formation: 'column' },
      dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 12, o: { hat: 'jingasa_n' } }], ODA));
    F.oda = [F.tsutsui, F.ake, F.ram];
    for (const g of F.oda) { g.defMult = 1.15; g.dmgMult = 0.75; }
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: 10, z: 110 }, Math.PI, [{ kind: 'spear', n }]);
    // ---- 門の上の弓（物見櫓に火を放つまで射かけてくる） ----
    F.arch = enemyGroup(rt, { faction: 'saito', name: '櫓の弓', anchor: { x: 8, z: GATE.z - 3 }, facing: 0, width: 14, aggro: 40, noRout: true, morale: 100, fleeDir: { x: 0, z: -1 }, dmgMult: 0.55 },
      dress([{ type: 'bow', n: 7 }, { type: 'gun', n: 2 }], MATSU));
    for (const u of F.arch.units) if (u.type === 'gun') u.dmg *= 0.4;
    // ---- 麓の織田の陣と大軍（軽い作り） ----
    rt.scene.add(jinmaku(W, 0, 140, 18, 10, 5, { mon: 'oda' }), tawara(W, -16, 132, 0.3, 6));
    for (const [x, z, k] of [[-8, 130, 'oda'], [8, 130, 'eiraku'], [-30, 110, 'akechi'], [30, 110, 'oda']]) rt.scene.add(nobori(W, x, z, k, 6));
    const DA = (x, z, w, d, count, facing, armor, flag, seed) => W.addDistantArmy({ x, z, w, d, count, facing, armor, flagTex: flagTexture(flag), seed });
    DA(-60, 120, 36, 12, 260, Math.PI, 0x2b3140, 'oda', 15771);
    DA(60, 120, 36, 12, 260, Math.PI, 0x2b3140, 'eiraku', 15772);
    DA(-70, 20, 30, 12, 200, Math.PI * 0.8, 0x2b3140, 'akechi', 15773);
    DA(70, 10, 30, 12, 200, -Math.PI * 0.8, 0x2b3140, 'oda', 15774);
    for (const [x, z] of [[-20, 124], [20, 126]]) { rt.scene.add(campfire(W, x, z)); W.addFire(x, z); }

    rt.world.setTime('day');
    rt.setPhase('brief');
    rt.obj('main', '筒井順慶のもとで、城攻めの下知を待て', 'main');
    rt.say('', '天正五年十月　大和国 信貴山城', 3.5);
    rt.say('筒井順慶', `${nm(rt)}、この山は、わしら筒井が長く松永と争うてきた所じゃ。尾根の道はよう知っておる`, 5);
    rt.say('筒井順慶', '中将様（信忠）の下知じゃ。尾根を登り、門を破る。松永弾正（久秀）め、今日で終わりにしてくれる', 5);
    rt.marker('tsu', unitPos(F.tsuU), '筒井順慶', {});
    rt.after(16, () => this.climb(rt));
  },

  // ① 尾根道を登る
  climb(rt) {
    const F = rt.flags;
    if (F.step >= 1) return;
    F.step = 1; F.stepT = rt.t;
    rt.setPhase('climb');
    rt.unmark('tsu');
    sfx('horagai', 1);
    rt.banner('かかれ', '筒井の案内で、尾根道を登る');
    rt.obj('main', '筒井順慶について尾根道を登れ', 'main');
    const go = (g, x, z) => { g.order = 'move'; g.dest = { x, z }; g.speed = 2.3; g.onArrive = (q) => { q.order = 'hold'; q.anchor = { x, z }; q.aggro = 14; }; };
    go(F.tsutsui, 2, -30); go(F.ake, -14, -24); go(F.ram, 10, -18);
    rt.after(20, () => {
      if (F.step !== 1) return;
      F.amb = enemyGroup(rt, { faction: 'saito', name: '松永の伏兵', anchor: { x: -30, z: 10 }, facing: Math.PI / 2, order: 'attack', seekRange: 60, aggro: 16, width: 12, morale: 90, fleeDir: { x: -1, z: -0.5 }, dmgMult: 0.64 },
        dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 14 + more(rt) }], MATSU));
      rt.army.play('eshout', { x: -30, z: 10 }, 1.6);
      rt.say('足軽', '横の藪から伏兵じゃ！', 2.5);
      rt.obj('main', '尾根道の伏兵を退けよ', 'main');
      rt.marker('amb', centerOf(F.amb), () => `松永の伏兵・${moraleWord(F.amb.morale)}`, { red: true, group: F.amb });
    });
  },

  // ② 物見櫓に火を放つ
  tower(rt) {
    const F = rt.flags;
    if (F.step >= 2) return;
    F.step = 2; F.stepT = rt.t;
    rt.setPhase('tower');
    rt.unmark('amb');
    if (F.amb && !gone(F.amb)) F.amb.morale = Math.min(F.amb.morale, 15);
    rt.award((t) => t.side.push('尾根の伏兵を退けた'), '伏兵を退けた');
    rt.banner('門の前', '門の脇の物見櫓から矢が降ってくる');
    rt.obj('main', '門の脇の物見櫓に火を放て（矢を止める）', 'main');
    rt.say('筒井順慶', 'あの櫓から射かけられては、門に寄れぬ。柵の外から、櫓の脚に火をかけよ！', 4);
    const P = { x: TOWER.x + 2, z: GATE.z + 4 };
    F.tp = P;
    rt.marker('tower', { x: TOWER.x, z: TOWER.z }, '物見櫓', { h: 7 });
    rt.addInteract('tower', P, '物見櫓の脚に火をかける', () => this.fireTower(rt), { r: 3.2, hold: 2 });
    rt.zone('tower', P.x, P.z, 2.5);
    F.ram.order = 'move'; F.ram.dest = { x: 6, z: GATE.z + 26 }; F.ram.onArrive = (q) => { q.order = 'hold'; };
    for (const [g, x] of [[F.tsutsui, 0], [F.ake, -16]]) { g.order = 'move'; g.dest = { x, z: GATE.z + 20 }; g.onArrive = (q) => { q.order = 'hold'; }; }
  },
  fireTower(rt) {
    const F = rt.flags;
    rt.uninteract('tower'); rt.unmark('tower'); rt.unzone('tower');
    const W = rt.world;
    W.addFire(TOWER.x, TOWER.z, { h: 3 }); W.addFire(TOWER.x + 0.6, TOWER.z + 0.6, { h: 5 });
    W.addSmokeColumn(TOWER.x, W.heightAt(TOWER.x, TOWER.z) + 8, TOWER.z, { size: 2.6 });
    F.tower.rotation.z = 0.12;
    F.arch.noRout = false; F.arch.morale = 10;
    rt.award((t) => t.side.push('物見櫓に火を放った'), '物見櫓に火を放った');
    rt.say('筒井順慶', '櫓が燃えた！　門を破る組、今じゃ！', 3);
    this.gateFight(rt);
  },

  // ③ 門を破る
  gateFight(rt) {
    const F = rt.flags;
    if (F.step >= 3) return;
    F.step = 3; F.stepT = rt.t;
    rt.setPhase('gate');
    rt.obj('main', '門を破る組を守り、門を破れ', 'main');
    const R = F.ram;
    R.order = 'assault'; R.formation = 'line'; R.aggro = 2; R.assault = () => (F.gate.alive ? F.gate : null);
    for (const g of [F.tsutsui, F.ake]) { g.order = 'attack'; g.seekRange = 34; }
    rt.marker('gate', GATE, () => `門 ${Math.round(Math.max(0, F.gate.hp) / F.gate.maxHp * 100)}%`, { h: 4 });
    rt.after(16, () => {
      if (F.step !== 3) return;
      F.sally = enemyGroup(rt, { faction: 'saito', name: '柵の外へ出た松永勢', anchor: { x: 32, z: GATE.z + 8 }, facing: -Math.PI / 2, order: 'attack', seekRange: 60, aggro: 12, width: 10, morale: 90, fleeDir: { x: 0.5, z: -1 }, dmgMult: 0.64 },
        dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 12 + more(rt) }], MATSU));
      F.sally.focus = R.units.find((u) => u.alive) || null;
      rt.army.play('eshout', { x: 32, z: GATE.z + 8 }, 1.5);
      rt.say('足軽', '柵の端から回り込んできた！　門を破る組を狙っておる！', 3.5);
      rt.marker('sally', centerOf(F.sally), () => `柵の外へ出た松永勢・${moraleWord(F.sally.morale)}`, { red: true, group: F.sally });
    });
  },

  // ④ 天守の前
  honmaru(rt) {
    const F = rt.flags;
    if (F.step >= 4) return;
    F.step = 4; F.stepT = rt.t;
    rt.setPhase('honmaru');
    rt.unmark('gate'); rt.unmark('sally');
    if (F.sally && !gone(F.sally)) F.sally.morale = Math.min(F.sally.morale, 15);
    rt.award((t) => t.side.push('門を破った'), '門を破った');
    sfx('taiko', 1); rt.after(0.5, () => sfx('horagai', 0.9));
    rt.banner('門、破れる', '本丸から、松永の最後の衆が打って出る');
    rt.obj('main', '天守の前で、松永の最後の衆を退けよ', 'main');
    const mk = (x, z, name, list) => enemyGroup(rt, { faction: 'saito', name, anchor: { x, z }, facing: 0, order: 'attack', seekRange: 70, aggro: 16, width: 14, morale: 100, noRout: true, fleeDir: { x: 0, z: -1 }, dmgMult: 0.62 }, dress(list, MATSU));
    F.last = [mk(TOP.x, TOP.z + TOP.r + 4, '松永の旗本', [{ type: 'samurai', n: 4 }, { type: 'ashigaru', n: 16 + more(rt) }, { type: 'gun', n: 2 }])];
    rt.marker('l1', centerOf(F.last[0]), () => `松永の旗本・${moraleWord(F.last[0].morale)}`, { red: true, group: F.last[0] });
    rt.say('松永の侍', '弾正様（久秀）は、信長に首を渡さぬと仰せじゃ！　それまで一人も通すな！', 4);
    for (const q of [F.tsutsui, F.ake, F.ram]) { q.order = 'attack'; q.seekRange = 70; q.formation = 'line'; }
    F.ram.assault = null;
    rt.after(26, () => {
      if (F.ending) return;
      const g = mk(TOP.x + 12, TOP.z + 4, '本丸の新手', [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 12 + more(rt) }]);
      F.last.push(g);
      rt.marker('l2', centerOf(g), () => `本丸の新手・${moraleWord(g.morale)}`, { red: true, group: g });
      rt.army.play('eshout', { x: TOP.x + 12, z: TOP.z + 4 }, 1.5);
    });
    rt.after(30, () => {
      if (F.ending) return;
      const W = rt.world;
      W.addFire(TOP.x - 2, TOP.z - 8, { h: 6 }); W.addFire(TOP.x - 4, TOP.z - 10, { h: 9 });
      W.addSmokeColumn(TOP.x - 2, HT + 16, TOP.z - 8, { size: 4 });
      rt.say('足軽', '天守から火が！', 2.5);
      rt.say('筒井順慶', '……弾正め、自ら火をかけたか', 3);
    });
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.unmark('l1'); rt.unmark('l2');
    for (const q of F.last || []) if (!gone(q)) { q.noRout = false; q.morale = 0; }
    rt.objDone('main');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '信貴山城の天守の前まで攻め入った', pts: 20 }; }, '任務達成・信貴山城を落とした');
    sfx('horagai', 0.8);
    rt.banner('信貴山城、落ちる', '松永久秀は天守に火を放ち、自害した');
    rt.say('筒井順慶', `……十年前の今日、東大寺の大仏殿が焼けた。あれも松永の戦のさなかじゃった。${nm(rt)}、因果とは、こういうものか`, 6);
    rt.after(7, () => rt.say('', '――大和一国は筒井順慶に任された', 4.5));
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
      if (F.amb) rt.objProgress('main', `伏兵 ${gone(F.amb) ? 0 : F.amb.count}人`);
      else rt.objProgress('main', `門まで ${Math.max(0, Math.round(Math.hypot(p.x - GATE.x, p.z - GATE.z)))}m`);
      if (F.amb && F.amb.count < 5 && !gone(F.amb)) F.amb.morale = Math.min(F.amb.morale, 20);
      if ((F.amb && gone(F.amb)) || rt.t - F.stepT > 140) this.tower(rt);
    }
    if (F.step === 2 && rt.t - F.stepT > 90 && rt.interacts.some((q) => q.id === 'tower')) { rt.objFail('main'); rt.say('筒井順慶', 'ほかの者が火をかけた！', 2.5); this.fireTower(rt); }
    if (F.step === 3) {
      rt.objProgress('main', `門 ${Math.round(Math.max(0, F.gate.hp) / F.gate.maxHp * 100)}%・組 ${F.ram.count}人`);
      if (F.ram.count < 4 && !F.ram2) {
        F.ram2 = true;
        const g = allyGroup(rt, { name: '門を破る組', anchor: { x: 6, z: GATE.z + 30 }, facing: Math.PI, width: 5, aggro: 2, noRout: true, order: 'assault' },
          dress([{ type: 'ashigaru', n: 10, o: { hat: 'jingasa_n' } }], ODA));
        g.assault = F.ram.assault;
      }
      if (F.sally && F.sally.count < 5 && !gone(F.sally)) F.sally.morale = Math.min(F.sally.morale, 20);
      if (rt.t - F.stepT > 140 && F.gate.alive) rt.army.damage(F.gate, 99999, null);
    }
    if (F.step === 4) {
      const L = F.last || [];
      rt.objProgress('main', `松永勢 ${L.reduce((a, q) => a + (gone(q) ? 0 : q.count), 0)}人`);
      for (const q of L) if (q.count < 6 && q.noRout) { q.noRout = false; q.morale = Math.min(q.morale, 25); }
      if ((L.length >= 2 && L.every(gone)) || rt.t - F.stepT > 170) this.win(rt);
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
    if (next) { F.saidPct = [...(F.saidPct || []), next]; rt.bark(`門がきしむ（残り ${pct}%）`); }
  },
  onStructDestroyed(rt, s) {
    const F = rt.flags;
    if (s !== F.gate) return;
    s.mesh.rotation.x = -1.4; s.mesh.position.y -= 1.2; s.mesh.position.z -= 1.4;
    sfx('wood', 1.2);
    this.honmaru(rt);
  },
};

// 両軍の総勢（織田信忠の軍 四万ほど、信貴山城の松永勢 八千ほど。数には諸説ある）
shigisan.force = (rt) => {
  const F = rt.flags;
  return { a: Math.round(40000 - (F.ak || 0) * 30), a0: 40000, b: Math.max(0, 8000 - (F.ek || 0) * 40), b0: 8000 };
};
shigisan.sides = { a: { name: '織田軍', mon: 'oda' }, b: { name: '松永軍', mon: 'todo' } };
shigisan.date = () => '天正五年十月十日　秋・晴';
shigisan.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '城攻めの下知まで待つ' : '');
shigisan.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
shigisan.history = '天正五年（1577）八月、石山本願寺を囲む陣にいた松永久秀は、勝手に陣を払って大和の信貴山城に籠もり、再び信長に背いた。信長は嫡男の織田信忠を大将に、明智光秀・羽柴秀吉・筒井順慶・細川藤孝らを向かわせ、支城の片岡城を落としてから信貴山城を囲んだ。十月十日、城は落ち、久秀は天守に火を放って自害した。この日は、十年前に東大寺の大仏殿が焼けた日と同じで、人々は因果と噂したと『信長公記』は伝える。久秀が名物の茶釜「平蜘蛛」を打ち砕いて死んだという話は、のちの伝えである。大和一国は筒井順慶に任された。松永の紋は蔦で、ここでは近い形の蔦の紋で旗を描いている。兵の数には諸説ある。';

// 素直な遊び手：筒井について登り、伏兵と戦い、櫓に火をかけ、門を破る組を守り、天守の前で戦う
shigisan.botBrain = (b, inp, { goTo }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyE');
  if (!u.alive || F.ending) return;
  if (u.hp < u.maxHp * 0.5) b.botRest = true;
  if (b.botRest && u.hp > u.maxHp * 0.85) b.botRest = false;
  if (b.botRest) { inp.guardHold = false; goTo(p, inp, 4, F.step >= 2 ? GATE.z + 34 : 60, 2); return; }
  const inside = F.step >= 4;
  const e = b.army.nearestEnemy(u, F.step === 2 ? 6 : 12, (o) => !o.fleeing && (inside || o.pos.z > GATE.z + 0.8));
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d > 2.6) inp.k.add('KeyW');
    if (d < 3.2 && Math.random() < 0.5) inp.leftPressed = true;
    inp.guardHold = (b.army.threats || []).length > 0 && Math.random() < 0.85;
    return;
  }
  inp.guardHold = false;
  if (F.step === 1) { if (F.amb && !gone(F.amb)) { const c = F.amb.center(); goTo(p, inp, c.x, c.z, 2); return; } goTo(p, inp, 2, -24, 2); return; }
  if (F.step === 2) { const it = b.interacts.find((q) => q.id === 'tower'); if (it) { const d = Math.hypot(it.pos.x - u.pos.x, it.pos.z - u.pos.z); if (d > 1.4) goTo(p, inp, it.pos.x, it.pos.z, 1); else inp.k.add('KeyE'); } return; }
  if (F.step === 3) { if (F.sally && !gone(F.sally)) { const c = F.sally.center(); goTo(p, inp, c.x, c.z, 2); return; } goTo(p, inp, 3, GATE.z + 7, 2); return; }
  if (F.step === 4) {
    if (u.pos.z > GATE.z + 0.5) { if (Math.abs(u.pos.x) > 2.5) { goTo(p, inp, 0, GATE.z + 3, 1); return; } goTo(p, inp, 0, GATE.z - 4, 1); return; }
    const q = (F.last || []).find((x) => !gone(x)); if (q) { const c = q.center(); goTo(p, inp, c.x, c.z, 2); }
    return;
  }
  const a = F.tsuU.pos; goTo(p, inp, a.x + 3, a.z + 3, 3);
};

export { shigisan };
