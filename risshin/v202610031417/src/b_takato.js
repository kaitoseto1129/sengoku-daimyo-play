// ======================================================================
// 織田家編　高遠城の戦い（天正十年三月二日）
// 甲州征伐。武田の城々が次々に開かれる中、信玄の五男・仁科盛信だけは高遠城に籠もって降らなかった。
// 織田信忠は夜明けに城を攻め、自ら塀に取り付いて攻めたという。城はその日のうちに落ち、盛信は討ち死にした。
// 足軽は信忠の手（森長可の組）。①夜明け、大手門を破る組を守る（塀の上の鉄砲の下で）
// ②三の丸に押し入り、城兵を退ける ③二の丸の門から打って出た兵を退ける ④本丸で、仁科盛信の最後の衆と戦う
// ②と③の間・③と④の間に段（b_depth.js）：東の長屋の鉄砲衆か西の搦手の口か→二の丸からの逆襲（三方から）
// →塀際の信忠を守るか、二の丸の門へ押すか→本丸へ土橋か崖沿いの細道か。大手の塀の左右では、織田の大軍と城兵が塀越しに突き合う（軽い作り）
// 向き：北（-z）の台地の上に城。南（+z）に織田の陣。南の崖の下を三峰川が流れる
// ======================================================================
import { dobei as dobeiP } from './props.js';
import * as THREE from 'three';
import { nobori, hut, yagura, campfire, jinmaku, kabukimon, tawara, tobiraLeaf } from './props.js';
import { flagTexture } from './textures.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { isTouch } from './touch.js';
import { K } from './settings.js';
// 門を打つ操作の言い方（指は丸の字「打つ」、キーは E）
const RAM_HOW = () => (isTouch ? '「打つ」長押し' : `${K('use')} 長押し`);
import { moraleWord } from './hud.js';
import { gauss, enemyGroup, allyGroup, nm, centerOf, unitPos, wallLine, ringWall } from './bhelp.js';
import { applyLook, DAWN, dress, gone } from './b_inabayama.js';
import { KIT } from './b_nagashinojo.js';
import { volleyAt, horseHost } from './b_tano.js';
import { depthStart, depthTick, rest, pick, fight, hold, depthBot } from './b_depth.js';
import { uS, uA, uG, uB, gunLine, lines, leanAll, volleyAll, camp } from './b_mid.js';
// 足軽大将候補より上（信長で遊ぶ時は除く）：任務の文を「一手を預かる」者の役目に
const HI = (rt) => !rt.G.lord && (rt.G.rank || 0) >= 3;

const FRONT_Z = -24;                       // 大手の塀（三の丸の前）
const NI_Z = -62;                          // 二の丸の塀
const HON = { x: 0, z: -98, r: 16 };       // 本丸
const CAMP = { x: 0, z: 60 };
const ODA = { flag: 'oda' };
const TAKEDA = { flag: 'takeda' };

function height(x, z) {
  let h = 0.4 * Math.sin(x * 0.035 + 0.2) * Math.cos(z * 0.03) + 0.25 * Math.sin(z * 0.07 + x * 0.02);
  // 城の台地：前の縁は急な切岸、上は平ら（空堀の所で一段下がる）
  const up = 1 / (1 + Math.exp((z - (FRONT_Z + 8)) / 2.2));
  const side = 1 / (1 + Math.exp((Math.abs(x) - 70) / 3));
  h += 9 * up * side;
  // 大手の前の空堀
  h -= 3.2 * Math.exp(-((z - (FRONT_Z + 5)) ** 2) / 5) * side;
  // 大手へ上る土橋（堀を渡る道）
  h += 3.2 * Math.exp(-((z - (FRONT_Z + 5)) ** 2) / 5) * Math.exp(-(x * x) / 18);
  // 南の三峰川の谷と、まわりの山（遠くに南アルプス）
  h -= 4 * Math.exp(-((z - 110) ** 2) / 200);
  h += 40 * gauss(x, z, -220, -80, 9000) + 50 * gauss(x, z, 200, -200, 12000) + 30 * gauss(x, z, 60, 220, 9000);
  return h;
}

// 門の扉（二枚。破られると内へ倒れる）
function doors(W, x, z, w) {
  const grp = new THREE.Group();
  grp.userData.leaves = [];
  for (const sd of [-1, 1]) {
    const pv = new THREE.Group();
    pv.position.set(sd * w / 4, 0, 0);
    const m = tobiraLeaf(w / 2 - 0.06, 3.2, sd);   // 板と乳金物・内の貫と筋交いの扉（props.js）
    pv.add(m);
    grp.add(pv);
    grp.userData.leaves.push(pv);
  }
  grp.position.set(x, W.heightAt(x, z), z);
  return grp;
}

const takato = {
  spawn: { x: 8, z: 22, heading: Math.PI },
  world: {
    seed: 1582,
    time: 'dusk',
    muddy: 0.5,
    mist: true,
    paths: [[[0, 150], [CAMP.x, CAMP.z], [0, 10], [0, FRONT_Z], [0, NI_Z], [0, HON.z]]],
    height,
    tint(x, z, h, c) {
      // 城の中の踏み固めた土、春先の枯れ草
      if (z < FRONT_Z && Math.abs(x) < 64) c.lerp({ r: 0.47, g: 0.43, b: 0.35 }, 0.35);
      else c.lerp({ r: 0.5, g: 0.46, b: 0.34 }, 0.25);
    },
    clear: (x, z) => (Math.abs(x) < 80 && z < 40 && z > -130) || Math.hypot(x - CAMP.x, z - CAMP.z) < 30,
    trees: 480,
    tufts: 3000,
    treeDensity: (x, z) => (Math.abs(x) < 90 && z < 80 ? 0.1 : 1),
    groves: [{ x: -100, z: 20, r: 14, n: 20 }, { x: 100, z: -40, r: 14, n: 22 }],
    camPull: 1.6,
    fleeOut: (x, z, team) => team === 1 && (z < -125 || Math.abs(x) > 90),
  },

  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    F.step = 0; F.ek = 0; F.ak = 0;
    const noT = (segs) => { for (const s of segs) { s.noTarget = true; s.wall = true; s.h = 2.4; } return segs; };
    // ---- 大手：土塀と門（三の丸の前） ----
    noT(wallLine(rt, [[-66, FRONT_Z + 1], [-30, FRONT_Z], [-3.5, FRONT_Z]], { team: 1, hp: 1e9, name: '塀', segLen: 6, mesh: dobeiP, meshOpt: { hikae: -1 } }));
    noT(wallLine(rt, [[3.5, FRONT_Z], [30, FRONT_Z], [66, FRONT_Z + 1]], { team: 1, hp: 1e9, name: '塀', segLen: 6, mesh: dobeiP, meshOpt: { hikae: -1 } }));
    F.gate = rt.army.addStruct({ seg: [-3.5, FRONT_Z, 3.5, FRONT_Z], nx: 0, nz: 1, hp: 1600, maxHp: 1600, armor: 0.25, team: 1, name: '大手門' });
    F.gate.mesh = doors(W, 0, FRONT_Z, 7);
    rt.scene.add(F.gate.mesh, kabukimon(W, 0, FRONT_Z, 7.6, 0, { doors: false }));
    rt.scene.add(yagura(W, -14, FRONT_Z - 4), yagura(W, 16, FRONT_Z - 4));
    // ---- 二の丸の塀（門は開いたまま：城兵が打って出る） ----
    noT(wallLine(rt, [[-60, NI_Z], [-4, NI_Z]], { team: 1, hp: 1e9, name: '塀', segLen: 6, mesh: dobeiP, meshOpt: { hikae: -1 } }));
    noT(wallLine(rt, [[4, NI_Z], [60, NI_Z]], { team: 1, hp: 1e9, name: '塀', segLen: 6, mesh: dobeiP, meshOpt: { hikae: -1 } }));
    rt.scene.add(kabukimon(W, 0, NI_Z, 8.4, 0));
    // ---- 本丸：柵の囲い（南に口） ----
    for (const s of ringWall(rt, HON.x, HON.z, HON.r, { gapAt: 0, gapW: 0.5, team: 1, hp: 1e9, name: '本丸の柵', segLen: 5 })) { s.noTarget = true; s.wall = true; }
    rt.scene.add(hut(W, HON.x - 2, HON.z - 6, 12, 7, 0, { h: 3.4, wall: 0x6a5238, roof: 0x3a3430 }), yagura(W, HON.x + 10, HON.z - 8));
    for (const [x, z, r] of [[-30, -40, 0.1], [26, -44, -0.2], [-34, -78, 0], [30, -80, 0.2]]) rt.scene.add(hut(W, x, z, 8, 5, r, { wall: 0x6a5238 }));
    for (const [x, z] of [[-8, FRONT_Z - 3], [8, FRONT_Z - 3], [-40, FRONT_Z - 3], [40, FRONT_Z - 3], [-6, NI_Z - 3], [6, NI_Z - 3], [HON.x - 6, HON.z + 8], [HON.x + 6, HON.z + 8]]) rt.scene.add(nobori(W, x, z, 'takeda', 6));
    // ---- 織田信忠の手（森長可の組に自分がいる）、団忠正の手、門を破る組、鉄砲衆 ----
    F.mori = allyGroup(rt, { name: '森長可の手', anchor: { x: 0, z: 14 }, facing: Math.PI, width: 14, aggro: 8, noRout: true, formation: 'yari' },
      dress([{ type: 'samurai', n: 1, o: { name: '森長可', invuln: true, hat: 'kabuto_m', haori: 0x2a2a2a } }, { type: 'samurai', n: 1 }, { type: 'ashigaru', n: 16 }], ODA));
    F.moriU = F.mori.units[0];
    F.nobutada = allyGroup(rt, { name: '織田信忠の旗本', anchor: { x: -24, z: 20 }, facing: Math.PI, width: 12, aggro: 8, noRout: true },
      dress([{ type: 'busho', n: 1, o: { name: '織田信忠', invuln: true, hat: 'kabuto_m', haori: 0x7a1d14 } }, { type: 'samurai', n: 3 }, { type: 'ashigaru', n: 12 }], ODA));
    F.tadaU = F.nobutada.units[0];
    F.dan = allyGroup(rt, { name: '団忠正の手', anchor: { x: 26, z: 18 }, facing: Math.PI, width: 12, aggro: 8, noRout: true },
      dress([{ type: 'samurai', n: 1, o: { name: '団忠正', invuln: true, hat: 'kabuto_w', haori: 0x3a2e24 } }, { type: 'ashigaru', n: 14 }], ODA));
    F.ram = allyGroup(rt, { name: '門を破る組', anchor: { x: 8, z: 28 }, facing: Math.PI, width: 5, aggro: 3, noRout: true, formation: 'column' },
      dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 12, o: { hat: 'jingasa_n' } }], ODA));
    F.teppo = allyGroup(rt, { name: '織田の鉄砲衆', anchor: { x: -8, z: 6 }, facing: Math.PI, width: 16, aggro: 40, noRout: true },
      dress([{ type: 'samurai', n: 1 }, { type: 'gun', n: 12 }], ODA));
    F.oda = [F.mori, F.nobutada, F.dan, F.ram, F.teppo];
    for (const g of F.oda) { g.defMult = 1.15; g.dmgMult = 0.7; }
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: 10, z: 20 }, Math.PI, [{ kind: 'spear', n }]);
    // ---- 城兵（仁科の衆）：大手の塀の内の鉄砲と弓 ----
    F.wallGun = enemyGroup(rt, { faction: 'takeda', name: '塀の内の鉄砲', anchor: { x: 0, z: FRONT_Z - 2.2 }, facing: 0, width: 34, aggro: 44, noRout: true, morale: 100, fleeDir: { x: 0, z: -1 }, dmgMult: 0.6 },
      dress([{ type: 'samurai', n: 1 }, { type: 'gun', n: 8 }, { type: 'bow', n: 4 }], TAKEDA));
    for (const u of F.wallGun.units) if (u.type === 'gun') u.dmg *= 0.4;
    // ---- 陣と大軍（軽い作り） ----
    rt.scene.add(tawara(W, CAMP.x + 16, CAMP.z - 6, 0.3, 6));
    // 信忠の本陣（信忠は自ら塀に取り付くので、陣は河尻秀隆が預かる。控えは後ろの大軍）
    F.honjin = camp(rt, { x: CAMP.x, z: CAMP.z, facing: Math.PI, team: 0, faction: 'oda', mon: 'oda', general: { name: '河尻秀隆', hat: 'kabuto_m', haori: 0x3a3228 }, guard: 15, reserve: 200, runTo: { x: -24, z: 20 } });
    F.honjin.guard.name = '信忠の本陣の守り';
    for (const [x, z, k] of [[CAMP.x - 8, CAMP.z - 8, 'oda'], [CAMP.x + 6, CAMP.z - 8, 'eiraku'], [-40, 14, 'oda'], [40, 12, 'oda'], [-20, 24, 'oda']]) rt.scene.add(nobori(W, x, z, k, 6));
    const DA = (x, z, w, d, count, facing, armor, flag, seed) => W.addDistantArmy({ x, z, w, d, count, facing, armor, flagTex: flagTexture(flag), seed });
    DA(0, 58, 70, 12, 300, Math.PI, 0x2b3140, 'oda', 15829);   // 前の原にも陣列（B103）
    DA(-60, 40, 40, 12, 260, Math.PI, 0x2b3140, 'oda', 15821);
    DA(60, 40, 40, 12, 260, Math.PI, 0x2b3140, 'eiraku', 15822);
    DA(0, 96, 60, 14, 320, Math.PI, 0x2b3140, 'oda', 15823);
    DA(-100, -60, 30, 12, 200, Math.PI / 2, 0x2b3140, 'oda', 15824);   // 搦手へまわった手
    horseHost(rt, 70, -150, 40, 16, 200, 0, 15830);   // 城の奥の馬場に、仁科の騎馬が固まる（軽い作り）
    for (const [x, z] of [[-30, 40], [30, 44]]) { rt.scene.add(campfire(W, x, z)); W.addFire(x, z); }

    applyLook(rt, DAWN);
    rt.setPhase('brief');
    rt.obj('main', HI(rt) ? '森長可の先手で足軽の一手を預かり、下知を待て' : '森長可のもとで、城攻めの下知を待て', 'main');
    rt.say('森長可', `${nm(rt)}、武田の城は皆、戦わずに開いた。……じゃが、この高遠の仁科盛信だけは降らぬ`, 5);
    rt.say('織田信忠', '盛信は降らぬか。……夜明けとともに攻めかかるぞ', 5);
    rt.marker('mori', unitPos(F.moriU), '森長可', {});
    rt.after(16, () => this.gateFight(rt));
  },

  // ① 大手門を破る
  gateFight(rt) {
    const F = rt.flags;
    if (F.step >= 1) return;
    F.step = 1; F.stepT = rt.t;
    rt.setPhase('gate');
    rt.unmark('mori');
    rt.world.setTime('morning');
    sfx('horagai', 1); rt.after(0.8, () => sfx('taiko', 1));
    rt.banner('かかれ', '大手門へ寄せる');
    rt.obj('main', `大手門を打ち破れ（${RAM_HOW()}）`, 'main');
    rt.say('森長可', '門を破る組を通せ！　塀の上の鉄砲に構うな、足を止めるな！', 3.5);
    const R = F.ram;
    R.order = 'assault'; R.formation = 'line'; R.aggro = 2; R.assault = () => (F.gate.alive ? F.gate : null);
    const go = (g, x, z) => { g.order = 'move'; g.dest = { x, z }; g.speed = 2.4; g.onArrive = (gg) => { gg.order = 'hold'; gg.anchor = { x, z }; gg.aggro = 14; }; };
    go(F.mori, 4, FRONT_Z + 12); go(F.dan, 30, FRONT_Z + 12); go(F.nobutada, -22, FRONT_Z + 12); go(F.teppo, -4, FRONT_Z + 20);
    rt.marker('gate', { x: 0, z: FRONT_Z }, () => `大手門 ${Math.round(Math.max(0, F.gate.hp) / F.gate.maxHp * 100)}%`, { h: 4 });
    // 門を破る組だけに任せず、遊び手も門に取り付いて打てる（待たされる感じを無くす）
    rt.addInteract('ramgate', { x: 0, z: FRONT_Z + 1.4 }, '大手門を打つ', () => {
      if (!F.gate.alive) return;
      rt.army.damage(F.gate, 55, rt.player.u);
      rt.army.play('wood', { x: 0, z: FRONT_Z }, 1.1);
      rt.game.hitstop = 0.05;
    }, { r: 3.4, hold: 0.6 });
    // 大手の塀の左右でも、織田の大軍が塀に取り付き、塀の内の城兵と槍を突き合う（軽い作り）
    F.lines = lines(rt, [
      { x: -40, z: FRONT_Z, facing: Math.PI, w: 40, gap: 3, seed: 15825, A: ['oda', 0x2b3140, 480, 'oda'], B: ['takeda', 0x3a2622, 300, 'takeda'], gunsB: true, surge: false },
      { x: 42, z: FRONT_Z, facing: Math.PI, w: 40, gap: 3, seed: 15826, A: ['eiraku', 0x2b3140, 480, 'oda'], B: ['takeda', 0x3a2622, 300, 'takeda'], gunsB: true, surge: false },
    ]);
    F.lines.forEach((c, i) => rt.after(3 + i * 1.5, () => c.go()));
    rt.after(10, () => volleyAll(F.lines, 'B'));
    rt.after(16, () => { rt.say('足軽', '中将様（信忠）が……自ら塀に取り付いておられる！', 3.5); rt.say('織田信忠', '者ども、続け！　わしに遅れるな！', 3); });
    // 城兵が塀の脇の口から打って出る
    rt.after(17, () => {
      if (F.step !== 1) return;
      const g = enemyGroup(rt, { faction: 'takeda', name: '打って出た城兵', anchor: { x: 60, z: FRONT_Z + 8 }, facing: -Math.PI / 2, order: 'attack', seekRange: 70, aggro: 14, width: 10, morale: 95, fleeDir: { x: 0.5, z: -1 }, dmgMult: 0.66 },
        dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 12 }], TAKEDA));
      g.focus = R.units.find((u) => u.alive) || null;
      KIT.backOf(rt, g, { flag: 'takeda', armor: 0x3a2622, kind: 'spear', w: 18, depth: 10, count: 150, seed: 15827 });
      F.sally = g;
      rt.army.play('eshout', { x: 60, z: FRONT_Z + 8 }, 1.6);
      rt.say('足軽', '東の塀の端から城兵が打って出た！　門を破る組を狙っておる！', 3.5);
      rt.marker('sally', centerOf(g), () => `打って出た城兵・${moraleWord(g.morale)}`, { red: true, group: g });
    });
  },

  // ② 三の丸
  sannomaru(rt) {
    const F = rt.flags;
    if (F.step >= 2) return;
    F.step = 2; F.stepT = rt.t;
    rt.setPhase('san');
    rt.unmark('gate'); rt.unmark('sally');
    if (F.sally && !gone(F.sally)) F.sally.morale = Math.min(F.sally.morale, 15);
    F.wallGun.noRout = false; F.wallGun.morale = 25;
    rt.award((t) => t.side.push('大手門を破った'), '大手門を破った');
    sfx('taiko', 1);
    rt.banner('大手門、破れる', '三の丸に押し入る');
    rt.obj('main', '三の丸で、仁科の兵を退けよ', 'main');
    const g = enemyGroup(rt, { faction: 'takeda', name: '三の丸の兵', anchor: { x: -6, z: -44 }, facing: 0, order: 'attack', seekRange: 60, aggro: 14, width: 14, morale: 100, fleeDir: { x: 0, z: -1 }, dmgMult: 0.66, formation: 'yari' },
      dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 16 }, { type: 'bow', n: 2 }], TAKEDA));
    F.san = g;
    KIT.backOf(rt, g, { flag: 'takeda', armor: 0x3a2622, kind: 'spear', w: 22, depth: 10, count: 200, seed: 15828 });
    leanAll(F.lines, 'A', 0.35);
    rt.after(3, () => {   // 新手は三の丸の兵と一度に来る
      if (F.step !== 2) return;
      F.san2 = enemyGroup(rt, { faction: 'takeda', name: '三の丸の新手', anchor: { x: 40, z: -48 }, facing: -Math.PI / 2, order: 'attack', seekRange: 70, aggro: 14, width: 12, morale: 100, fleeDir: { x: 0.3, z: -1 }, dmgMult: 0.66 },
        dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 14 }], TAKEDA));
      rt.army.play('eshout', { x: 40, z: -48 }, 1.5);
      rt.say('足軽', '東の長屋の陰から、新手が来る！', 3);
      rt.marker('san2', centerOf(F.san2), () => `三の丸の新手・${moraleWord(F.san2.morale)}`, { red: true, group: F.san2 });
    });
    rt.say('仁科の侍', '一歩も退くな！　高遠の意地を見せよ！', 3);
    rt.marker('san', centerOf(g), () => `三の丸の兵・${moraleWord(g.morale)}`, { red: true, group: g });
    for (const q of [F.mori, F.nobutada, F.dan, F.ram]) { q.order = 'attack'; q.seekRange = 50; q.formation = 'line'; }
    F.ram.assault = null;
    F.teppo.order = 'move'; F.teppo.dest = { x: -4, z: FRONT_Z - 10 }; F.teppo.onArrive = (q) => { q.order = 'hold'; q.anchor = { x: -4, z: FRONT_Z - 10 }; };
    // 勝ち筋：城兵が寄せた所を、織田の鉄砲衆がそろって撃ち崩す
    rt.after(0.5, () => rt.say('森長可', '鉄砲衆、火縄を消すな！　城兵を引きつけて一度に放て。崩れた所へ槍を入れよ', 4));
    volleyAt(rt, { guns: () => [F.teppo], foes: () => [F.san, F.san2], who: '森長可', near: 22, drop: 30, max: 40, line: '織田の鉄砲衆が三の丸の城兵を撃ち崩した。今じゃ、槍を入れよ' });
  },

  // ②の後の段：三の丸の長屋と搦手 → 二の丸からの逆襲 → ③へ
  midA(rt) {
    const F = rt.flags;
    if (F.step >= 2.5) return;
    F.step = 2.5;
    rt.unmark('san'); rt.unmark('san2');
    for (const q of [F.san, F.san2]) if (q && !gone(q)) { q.noRout = false; q.morale = Math.min(q.morale, 15); }
    rt.award((t) => t.side.push('三の丸に押し入った'), '三の丸に押し入った');
    depthStart(rt, tkCtx(rt), tkA(), () => this.ninomaru(rt));
  },
  // ③の後の段：二の丸の門の奪い合い（信忠を守るか、門へ押すか）→ ④へ
  midB(rt) {
    const F = rt.flags;
    if (F.step >= 3.5) return;
    F.step = 3.5;
    rt.unmark('ni');
    if (!gone(F.ni)) { F.ni.noRout = false; F.ni.morale = Math.min(F.ni.morale, 15); }
    rt.obj('main', HI(rt) ? '預かった一手を率い、本丸へ寄せよ' : '本丸へ寄せよ', 'main');
    depthStart(rt, tkCtx(rt), tkB(), () => this.honmaru(rt));
  },

  // ③ 二の丸の門から打って出る
  ninomaru(rt) {
    const F = rt.flags;
    if (F.step >= 3) return;
    F.step = 3; F.stepT = rt.t;
    rt.setPhase('ni');
    rt.unmark('san'); rt.unmark('san2');
    for (const q of [F.san, F.san2]) if (q && !gone(q)) q.morale = Math.min(q.morale, 15);
    rt.obj('main', '二の丸の門から打って出た兵を退け、二の丸へ入れ', 'main');
    const g = enemyGroup(rt, { faction: 'takeda', name: '二の丸の兵', anchor: { x: 0, z: NI_Z - 8 }, facing: 0, order: 'attack', seekRange: 60, aggro: 14, width: 12, morale: 100, fleeDir: { x: 0, z: -1 }, dmgMult: 0.66 },
      dress([{ type: 'samurai', n: 3 }, { type: 'cavalry', n: 4 }, { type: 'ashigaru', n: 15 }, { type: 'gun', n: 3 }], TAKEDA));
    for (const u of g.units) if (u.type === 'gun') u.dmg *= 0.45;
    KIT.backOf(rt, g, { flag: 'takeda', armor: 0x3a2622, kind: 'cavalry', w: 20, depth: 10, count: 140, seed: 15829 });
    F.ni = g;
    F.niGun = enemyGroup(rt, { faction: 'takeda', name: '二の丸の塀の鉄砲', anchor: { x: 0, z: NI_Z - 2.2 }, facing: 0, width: 30, aggro: 40, noRout: true, morale: 100, fleeDir: { x: 0, z: -1 }, dmgMult: 0.55 },
      dress([{ type: 'gun', n: 6 }, { type: 'bow', n: 4 }], TAKEDA));
    for (const u of F.niGun.units) if (u.type === 'gun') u.dmg *= 0.4;
    rt.army.play('eshout', { x: 0, z: NI_Z }, 1.6);
    rt.say('森長可', '二の丸の門が開いた！　打って出てくるぞ、押し返して、そのまま門を奪え！', 4);
    rt.marker('ni', centerOf(g), () => `二の丸の兵・${moraleWord(g.morale)}`, { red: true, group: g });
  },

  // ④ 本丸：仁科盛信
  honmaru(rt) {
    const F = rt.flags;
    if (F.step >= 4) return;
    F.step = 4; F.stepT = rt.t;
    rt.setPhase('hon');
    rt.unmark('ni');
    if (!gone(F.ni)) F.ni.morale = Math.min(F.ni.morale, 15);
    if (F.niGun) { F.niGun.noRout = false; F.niGun.morale = 20; }
    rt.award((t) => t.side.push('二の丸へ一番に入った'), '二の丸へ入った');
    sfx('horagai', 0.9);
    rt.banner('本丸', '仁科盛信が、最後の衆とともに打って出る');
    const g = enemyGroup(rt, { faction: 'takeda', name: '仁科盛信の衆', anchor: { x: HON.x, z: HON.z + 4 }, facing: 0, order: 'attack', seekRange: 70, aggro: 16, width: 12, morale: 100, noRout: true, fleeDir: { x: 0, z: -1 }, dmgMult: 0.64, defMult: 1.2 },
      dress([{ type: 'busho', n: 1, o: { name: '仁科盛信', invuln: true, hat: 'kabuto_m', haori: 0x7a2a1c } }, { type: 'samurai', n: 5 }, { type: 'ashigaru', n: 20 }, { type: 'bow', n: 3 }], TAKEDA));
    g.units[0].dmg *= 0.5;
    F.boss = g; F.bossU = g.units[0];
    rt.say('仁科盛信', '我は信玄が五男、仁科五郎盛信！　この首、取れるものなら取ってみよ！', 4.5);
    rt.say('森長可', '本丸へ押し込め！　盛信殿の最後の意地じゃ、侮るな', 3.5);
    rt.obj('main', '本丸で、仁科盛信の衆を退けよ', 'main');
    rt.marker('boss', centerOf(g), () => `仁科盛信の衆・${moraleWord(g.morale)}`, { red: true, group: g });
    for (const q of [F.mori, F.nobutada, F.dan, F.ram]) { q.order = 'attack'; q.seekRange = 70; }
    rt.after(6, () => {   // 名乗りのすぐ後、旗本も一度に打って出る
      if (F.ending) return;
      F.boss2 = enemyGroup(rt, { faction: 'takeda', name: '盛信の旗本', anchor: { x: HON.x + 6, z: HON.z - 8 }, facing: 0, order: 'attack', seekRange: 70, aggro: 16, width: 10, morale: 100, fleeDir: { x: 0, z: -1 }, dmgMult: 0.62 },
        dress([{ type: 'samurai', n: 4 }, { type: 'ashigaru', n: 12 }], TAKEDA));
      rt.army.play('eshout', { x: HON.x, z: HON.z }, 1.6);
      rt.say('仁科の侍', '殿（盛信）をお守りせよ！　一人でも多く道連れにせよ！', 3.5);
      rt.marker('boss2', centerOf(F.boss2), () => `盛信の旗本・${moraleWord(F.boss2.morale)}`, { red: true, group: F.boss2 });
    });
    rt.after(40, () => {   // 本丸の奥の最後の衆（女や小者までが刀を取った）。後ろに控えの数百
      if (F.ending) return;
      F.boss3 = enemyGroup(rt, { faction: 'takeda', name: '本丸の奥の最後の衆', anchor: { x: HON.x - 8, z: HON.z - 10 }, facing: 0, order: 'attack', seekRange: 70, aggro: 16, width: 12, morale: 100, noRout: true, fleeDir: { x: 0, z: -1 }, dmgMult: 0.6 },
        dress([{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 16 }], TAKEDA));
      rt.after(25, () => { if (F.boss3) F.boss3.noRout = false; });
      KIT.backOf(rt, F.boss3, { flag: 'takeda', armor: 0x3a2622, kind: 'spear', w: 18, depth: 10, count: 160, seed: 15831 });
      rt.army.play('eshout', { x: HON.x, z: HON.z - 8 }, 1.6);
      rt.say('足軽', '本丸の奥から、まだ出てくる……小者までが刀を取っておる！', 3.5);
      rt.say('森長可', '盛信殿の衆を先に崩せ。大将が崩れれば、奥の者も続かぬ', 3.5);
      rt.marker('boss3', centerOf(F.boss3), () => `本丸の奥の最後の衆・${moraleWord(F.boss3.morale)}`, { red: true, group: F.boss3 });
    });
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.unmark('boss'); rt.unmark('boss2'); rt.unmark('boss3');
    for (const c of F.lines || []) c.rout('B', { from: 0, hideAfter: 20, minFight: 0 });
    rt.objDone('main');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '高遠城の本丸まで攻め入った', pts: 20 }; }, '任務達成・高遠城を落とした');
    for (const q of [F.boss, F.boss2, F.boss3, F.ni, F.niGun, F.san, F.san2, F.wallGun, F.sally]) if (q && !gone(q)) { q.noRout = false; q.morale = 0; }
    if (F.bossU) { F.bossU.announced = true; if (F.bossU.alive) { F.bossU.invuln = false; F.bossU.noTarget = true; } }
    rt.world.addFire(HON.x - 2, HON.z - 6, { h: 2 }); rt.world.addSmokeColumn(HON.x - 2, rt.world.heightAt(HON.x, HON.z) + 7, HON.z - 6, { size: 3 });
    sfx('horagai', 0.8); rt.after(1, () => sfx('toki', 0.8));
    rt.banner('高遠城、落ちる', '仁科盛信は、最後まで戦って討ち死にした');
    // 盛信の最期（B105）：本丸の奥で腹を切る
    rt.say('仁科盛信', '……ここまでじゃ。皆、よう戦うた。わしは腹を切る。城に火をかけよ', 4.5);
    rt.after(5, () => rt.say('織田信忠', '……盛信、見事であった。手厚く葬れ', 4));
    rt.after(10, () => rt.say('', '――高遠が落ちて十日ほどのち、武田勝頼は天目山のふもと田野で自害し、武田家は滅んだ', 5.5));
    rt.player.u.invuln = true;
    rt.finish({}, 17);
  },

  update(rt, dt) {
    const F = rt.flags;
    KIT.backTick(rt);
    depthTick(rt, dt);
    // 崩れた隊の印は消す（古い印が「あちらじゃ」の行き先にならないように）
    for (const m of rt.markers.slice()) if (m.group && gone(m.group)) rt.unmark(m.id);
    if (F.ending) return;
    if (F.step === 1) {
      rt.objProgress('main', `大手門 ${Math.round(Math.max(0, F.gate.hp) / F.gate.maxHp * 100)}%・組 ${F.ram.count}人`);
      if (F.ram.count < 4 && !F.ram2) {
        F.ram2 = true;
        const g = allyGroup(rt, { name: '門を破る組', anchor: { x: 6, z: FRONT_Z + 30 }, facing: Math.PI, width: 5, aggro: 2, noRout: true, order: 'assault' },
          dress([{ type: 'ashigaru', n: 10, o: { hat: 'jingasa_n' } }], ODA));
        g.assault = F.ram.assault;
        rt.say('森長可', '次の組、行けっ！', 2);
      }
      if (F.sally && F.sally.count < 5 && !gone(F.sally)) F.sally.morale = Math.min(F.sally.morale, 20);
      if (rt.t - F.stepT > 130 && F.gate.alive) rt.army.damage(F.gate, 99999, null);
    }
    if (F.step === 2) {
      const qs = [F.san, F.san2].filter(Boolean);
      rt.objProgress('main', `三の丸の兵 ${qs.reduce((a, q) => a + (gone(q) ? 0 : q.count), 0)}人`);
      for (const q of qs) if (q.count < 5 && !gone(q)) q.morale = Math.min(q.morale, 20);
      if ((F.san2 && qs.every(gone)) || rt.t - F.stepT > 130) this.midA(rt);
    }
    if (F.step === 3) {
      rt.objProgress('main', `二の丸の兵 ${F.ni.count}人`);
      if (F.ni.count < 5 && !gone(F.ni)) F.ni.morale = Math.min(F.ni.morale, 20);
      if ((gone(F.ni) && rt.t - F.stepT > 30) || rt.t - F.stepT > 130) this.midB(rt);
    }
    if (F.step === 4) {
      const g = F.boss, b2 = F.boss2;
      rt.objProgress('main', `盛信の衆 ${g.count}人${b2 ? `・旗本 ${gone(b2) ? 0 : b2.count}人` : ''}`);
      if (b2 && b2.count < 4 && !gone(b2)) b2.morale = Math.min(b2.morale, 20);
      const b3 = F.boss3;
      if (b3 && b3.count < 4 && !gone(b3)) b3.morale = Math.min(b3.morale, 20);
      if (g.count <= 5 && b3 && !gone(b3)) { b3.noRout = false; b3.morale = Math.min(b3.morale, 30); }
      if ((g.count <= 5 && b2 && gone(b2) && b3 && gone(b3)) || rt.t - F.stepT > 200) this.win(rt);
    }
  },

  onKill(rt, v) {
    const F = rt.flags;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
  },
  onRout(rt, g) {
    if (g.team !== 1) return;
    const F = rt.flags;
    if (rt.t - (F.routSayT || -99) < 8) return;   // 同じ知らせを続けて出さない
    F.routSayT = rt.t;
    rt.say('足軽', `${g.name}が奥へ退いていく！`, 2.5);
  },
  onStructHit(rt, s) {
    const F = rt.flags;
    if (s !== F.gate) return;
    const pct = Math.round(Math.max(0, s.hp) / s.maxHp * 100);
    const next = [75, 50, 25].find((q) => pct <= q && !(F.saidPct || []).includes(q));
    if (next) { F.saidPct = [...(F.saidPct || []), next]; rt.bark(`大手門がきしむ（残り ${pct}%）`); }
  },
  onStructDestroyed(rt, s) {
    const F = rt.flags;
    if (s !== F.gate) return;
    rt.uninteract('ramgate');
    for (const lv of s.mesh.userData.leaves) { lv.rotation.x = -1.4; lv.position.y = 0.1; }
    sfx('wood', 1.2);
    this.sannomaru(rt);
  },
};

// 両軍の総勢（織田信忠の軍 三万ほど、高遠城の仁科勢 三千ほど。数には諸説ある）
takato.force = (rt) => {
  const F = rt.flags;
  return { a: Math.round(30000 - (F.ak || 0) * 30), a0: 30000, b: Math.max(0, 3000 - (F.ek || 0) * 40), b0: 3000 };
};
takato.sides = { a: { name: '織田軍', mon: 'oda' }, b: { name: '武田軍（仁科盛信）', mon: 'takeda' } };
// 史実でこの戦にいた名のある武将（battle.js の placeFamous が、その家の隊に加える。敵は名乗り、討てば手柄）
takato.famous = [
  { name: '小山田昌行', g: /二の丸/, loose: 1, line: '武田の小山田昌行なり！　高遠は仁科様と共に果てる！' },
  { name: '諏訪勝右衛門', g: /三の丸/, loose: 1, line: '諏訪勝右衛門なり！　女子供まで刀を取っておるわ！' },
];
takato.date = (rt) => `天正十年三月二日　春・${rt.flags.step >= 1 ? '朝' : '夜明け'}`;
takato.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '城攻めの下知まで待つ' : '');
takato.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
// ---------------- 三の丸と二の丸の門の段 ----------------
const SAN = { x: 0, z: -42 };             // 三の丸の真ん中
const NG = { x: 0, z: NI_Z + 7 };         // 二の丸の門の前（三の丸の側）
function tkCtx(rt) {
  const F = rt.flags;
  return { faction: 'takeda', flag: 'takeda', armor: 0x3a2622, dmg: 0.64, look: (l) => dress(l, TAKEDA), friends: () => [F.mori, F.dan].filter((g) => g && g.count), aid: { name: '森長可の手の一組', list: [uS(1), uA(8)] }, aidSaid: '森長可の手から一組が加わった' };
}
function tkA() {
  return [
    rest({ dur: 8, say: [['森長可', '三の丸は取った。……じゃが、城兵は一人も降らぬ'], ['足軽', '長屋の窓という窓から、火縄の火が……']] }),
    pick({ title: '三の丸の東の長屋に城兵が籠もって撃ちかけ、西では搦手の味方が塀の外で止まっている。どうする？',
      pre: (rt) => rt.say('伝令', '搦手へ回った味方が、西の塀の外で止められておりまする！', 3.5),
      options: [{ label: '東の長屋へ斬り込み、鉄砲衆を追い出す', note: '長屋の鉄砲を黙らせれば、この後の撃ち合いが軽くなる。狭い長屋の間で挟まれる' }, { label: '西の塀の口を内から開け、搦手の味方を引き入れる', note: '搦手の味方が加わる。長屋の鉄砲は残る' }],
      on: (rt, m, i) => { m.tkEast = i === 0; rt.say('森長可', i === 0 ? 'よし、長屋じゃ！　窓の下を走れ！' : 'よし、西の口じゃ！　内から閂を外せ！', 3); } }),
    fight({ skip: (rt, m) => !m.tkEast, at: { x: 36, z: -44 }, max: 150, title: '東の長屋', sub: '長屋の窓から、仁科の鉄砲衆が撃つ', obj: '東の長屋の鉄砲衆と城兵を崩せ',
      foes: () => [gunLine('長屋の鉄砲衆', { x: 54, z: -52 }, { x: 36, z: -44 }, 10), { name: '長屋を守る城兵', from: { x: 56, z: -34 }, list: [uS(2), uA(12)], mass: 180 }],
      later: [{ t: 40, title: '挟まれる', sub: '二の丸の塀沿いに、城兵が回る', say: ['足軽', '背を取られた！　塀沿いに回ってきおった！'], foes: () => [{ name: '塀沿いに回った城兵', from: { x: 10, z: -56 }, list: [uS(2), uA(10)], mass: 150 }] }],
      reward: (t) => { t.special = { label: '東の長屋の鉄砲衆を崩した', pts: 20 }; }, rewardLabel: '長屋の鉄砲衆を崩した' }),
    fight({ skip: (rt, m) => m.tkEast, at: { x: -44, z: -44 }, max: 150, title: '西の塀の口', sub: '口を守る城兵が、必死に閂を押さえる', obj: '西の塀の口を守る城兵を崩し、搦手の味方を引き入れよ',
      foes: () => [{ name: '西の口を守る城兵', from: { x: -56, z: -56 }, list: [uS(2), uA(12), uB(3)], mass: 180 }],
      later: [{ t: 35, say: ['足軽', '長屋の方から撃ってくる……！　背を撃たれるぞ！'], foes: () => [gunLine('長屋の鉄砲衆', { x: 20, z: -52 }, { x: -44, z: -44 }, 9, { off: { x: 24, z: -6 } })] }],
      reward: '搦手の味方を引き入れた', onEnd: (rt, m, won) => { if (won) { m.tkKara = true; rt.say('足軽', '搦手の味方が入ってきた！', 3); } } }),
    rest({ dur: 8, say: [['森長可', '……二の丸の門の向こうで、太鼓が鳴っておる'], ['足軽', '来るぞ、来るぞ……']] }),
    hold({ at: SAN, dur: 95, r: 14, title: '二の丸からの逆襲', sub: '二の丸の門が開き、仁科の兵がどっと押し出す', label: '三の丸の真ん中', obj: '三の丸を守り、二の丸からの逆襲を押し返せ',
      say: [['森長可', '逆襲じゃ！　三の丸を取り返されるな！']],
      waves: [
        { t: 4, say: ['足軽', '門から……城兵があふれ出てくる！'], foes: (rt, m) => [{ name: '二の丸から押し出す城兵', from: { x: 0, z: NI_Z + 2 }, list: [uS(3), uA(m.tkKara ? 12 : 16)], mass: 260, noRout: 25 }] },
        { t: 30, say: ['足軽', '二の丸の塀の上に鉄砲が並んだ……！'], foes: (rt, m) => [gunLine('二の丸の塀の上の鉄砲衆', { x: -20, z: NI_Z + 3 }, SAN, m.tkEast ? 7 : 11, { off: { x: -16, z: -15 } })] },
        { t: 55, say: ['足軽', '東の塀沿いからも……囲まれるぞ！'], foes: () => [{ name: '東から回る城兵', from: { x: 56, z: -50 }, list: [uS(1), uA(10)], mass: 160 }] },
      ],
      reward: '二の丸からの逆襲を押し返した' }),
  ];
}
function tkB() {
  return [
    rest({ dur: 8, bark: '立て直し：組を二の丸の門へ寄せる', say: [['森長可', '本丸じゃ。……盛信殿が待っておる'], ['森長可', '西の崖沿いに細道がある。回れば、本丸の鉄砲の横腹へ出られるぞ']] }),
    pick({ title: '本丸の前に空堀。正面の土橋か、西の崖沿いの細道か。どう寄せる？',
      options: [{ label: '正面の土橋を押し渡る', note: '味方と一緒に押せる。土橋の上で本丸の鉄砲を正面から浴びる' }, { label: '西の崖沿いの細道を回る', note: '鉄砲の的になりにくい。細道で待ち伏せに遭うかもしれぬ' }],
      on: (rt, m, i) => { m.tkCliff = i === 1; rt.say('森長可', i === 0 ? '土橋じゃ！　撃たれても足を止めるな！' : '崖沿いを回れ。足を滑らせるなよ', 3); } }),
    fight({ skip: (rt, m) => m.tkCliff, at: { x: 0, z: HON.z + HON.r + 10 }, max: 120, title: '空堀の土橋', sub: '本丸の塀の上から、鉄砲が揃って火を噴く', obj: '土橋の前の城兵を崩し、本丸へ寄れ',
      foes: () => [{ name: '土橋を守る城兵', from: { x: 0, z: HON.z + HON.r + 2 }, list: [uS(2), uA(12)], mass: 180 }, gunLine('本丸の塀の鉄砲衆', { x: 14, z: HON.z + HON.r + 2 }, { x: 0, z: HON.z + HON.r + 10 }, 10, { off: { x: 8, z: -6 } })],
      reward: '空堀の土橋を押し渡った' }),
    fight({ skip: (rt, m) => !m.tkCliff, at: { x: -24, z: HON.z + HON.r + 4 }, max: 120, title: '崖沿いの細道', sub: '細道の先で、城兵が待ち構える', obj: '崖沿いの細道の城兵を崩し、本丸へ寄れ',
      foes: () => [{ name: '細道の城兵', from: { x: -30, z: HON.z }, list: [uS(2), uA(10)], mass: 140 }],
      later: [{ t: 25, title: '待ち伏せ', sub: '後ろの藪から、城兵が出る', say: ['足軽', '後ろから……！　細道で挟まれた！'], foes: () => [{ name: '藪に潜んだ城兵', from: { x: -40, z: NI_Z - 12 }, list: [uS(1), uA(8)], mass: 100 }] }],
      reward: (t) => { t.special = { label: '崖沿いの細道を抜けた', pts: 15 }; }, rewardLabel: '崖沿いの細道を抜けた' }),
    // 本丸の脇の館：城の女たちまでが刀を取って籠もる（諏訪勝右衛門の妻が薙刀で戦ったと伝わる）
    rest({ dur: 7, heal: 0.3, say: [['足軽', '本丸の脇の館から……女が薙刀を構えて出てきおった！'], ['森長可', '諏訪勝右衛門の妻じゃ。……この城は、女までが降らぬのか']] }),
    pick({ title: '本丸の脇の館に、城の女たちと侍が籠もって刀を取る。どうする？',
      options: [{ label: '館を囲み、降るよう呼びかける', note: '刃向かわぬ者は助かる。囲む間、本丸から寄せを受け続ける' }, { label: 'かまわず本丸の口へ押す', note: '早く盛信へ届く。館の者に横と背を突かれる' }],
      on: (rt, m, i) => { m.tkCall = i === 0; rt.say('森長可', i === 0 ? '……囲め。刃向かわぬ者には手を出すな。本丸から来る者だけを突け' : '館は捨ておけ！　本丸の口へ押せ！', 3.5); } }),
    hold({ skip: (rt, m) => !m.tkCall, at: { x: -24, z: -76 }, dur: 90, r: 13, title: '館を囲む', sub: '本丸から、盛信の侍が館を救いに打って出る', label: '館の前', obj: '館を囲み、本丸から救いに来る城兵を退けよ',
      waves: [
        { t: 4, say: ['仁科の侍', '館の者を見殺しにするな！'], foes: () => [{ name: '館を救いに出た城兵', from: { x: 0, z: HON.z + 4 }, list: [uS(3), uA(12)], mass: 200, noRout: 25 }] },
        { t: 30, say: ['足軽', '館の中から打って出た……！'], foes: () => [{ name: '館の衆', from: { x: -34, z: -84 }, list: [uS(3), uA(6)], mass: 0 }] },
        { t: 55, say: ['足軽', '本丸の柵の上から弓じゃ！'], foes: () => [{ name: '本丸の弓衆', from: { x: -14, z: HON.z + 6 }, list: [uS(1), uB(6), uA(6)], mass: 100 }] },
      ],
      reward: '館を囲み、刃向かわぬ者を助けた', onEnd: (rt, m, won) => { if (won) rt.say('足軽', '……館の者が、刀を置いた', 3); } }),
    fight({ skip: (rt, m) => m.tkCall, at: { x: -6, z: HON.z + HON.r + 6 }, max: 120, title: '本丸の口', sub: '本丸の口を、盛信の侍が固める', obj: '本丸の口の城兵を崩せ',
      foes: () => [{ name: '本丸の口の城兵', from: { x: 0, z: HON.z + 4 }, list: [uS(3), uA(12)], mass: 200, noRout: 25 }],
      later: [{ t: 30, title: '横槍', sub: '脇の館から、薙刀の衆が打って出る', say: ['足軽', '横じゃ！　館の衆が出てきた！'], foes: () => [{ name: '館の衆', from: { x: -34, z: -84 }, list: [uS(4), uA(6)], mass: 0 }] }],
      reward: (t) => { t.special = { label: '本丸の口を一番に破った', pts: 20 }; }, rewardLabel: '本丸の口を一番に破った' }),
  ];
}

takato.history = '天正十年（1582）二月、木曽義昌が武田から織田に寝返ったのをきっかけに、織田信長は武田攻め（甲州征伐）を始めた。総大将は嫡男の織田信忠。伊那口の武田の城は次々に開かれたが、信玄の五男・仁科盛信は高遠城に籠もり、降るようにとの勧めを退けた。三月二日の夜明け、信忠は城を攻め、自ら武具を取って塀に取り付き、柵を破って攻めたと『信長公記』は伝える。城兵は激しく戦い、女までが刀を取って戦ったというが、城はその日のうちに落ち、盛信は討ち死にした。十日ほどのち、武田勝頼は天目山のふもとの田野で自害し、武田家は滅んだ。兵の数には諸説ある。';

// 素直な遊び手：門を破る組を守り、三の丸・二の丸の兵と戦い、本丸で盛信の衆へ
takato.botBrain = (b, inp, { goTo }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyE');
  if (!u.alive || F.ending) return;
  // 段（b_depth.js）が動いている間は、そちらの的へ向かう
  if (F.dp && F.dp.on) { depthBot(b, inp, goTo); return; }
  if (u.hp < u.maxHp * 0.5) b.botRest = true;
  if (b.botRest && u.hp > u.maxHp * 0.85) b.botRest = false;
  if (b.botRest) { inp.guardHold = false; goTo(p, inp, 6, F.step >= 2 ? FRONT_Z - 6 : FRONT_Z + 24, 2); return; }
  const inside = F.step >= 2;
  const e = b.army.nearestEnemy(u, 12, (o) => !o.fleeing && !o.invuln && (inside || o.pos.z > FRONT_Z + 0.8));
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d > 2.6) inp.k.add('KeyW');
    if (d < 3.2 && Math.random() < 0.5) inp.leftPressed = true;
    inp.guardHold = (b.army.threats || []).length > 0 && Math.random() < 0.85;
    return;
  }
  inp.guardHold = false;
  const via = (x, z, lineZ) => { if (u.pos.z > lineZ + 1 && Math.abs(u.pos.x) > 2.5) { goTo(p, inp, 0, lineZ + 3, 1); return true; } if (u.pos.z > lineZ - 2 && u.pos.z <= lineZ + 1) { goTo(p, inp, 0, lineZ - 4, 1); return true; } goTo(p, inp, x, z, 2); return true; };
  if (F.step === 1) {
    if (F.sally && !gone(F.sally)) { const c = F.sally.center(); goTo(p, inp, c.x, c.z, 2); return; }
    const it = b.interacts.find((q) => q.id === 'ramgate');
    if (it) { const d = Math.hypot(it.pos.x - u.pos.x, it.pos.z - u.pos.z); if (d > 1.4) { goTo(p, inp, it.pos.x, it.pos.z, 1); return; } inp.k.add('KeyE'); return; }
    goTo(p, inp, 4, FRONT_Z + 7, 2); return;
  }
  if (F.step === 2) { const q = [F.san, F.san2].find((x) => x && !gone(x)); const c = q ? q.center() : { x: 0, z: -44 }; via(c.x, c.z, FRONT_Z); return; }
  if (F.step === 3) { const c = gone(F.ni) ? { x: 0, z: NI_Z - 6 } : F.ni.center(); if (u.pos.z > FRONT_Z - 2) { via(c.x, c.z, FRONT_Z); return; } via(c.x, c.z, c.z < NI_Z ? NI_Z : -999); return; }
  if (F.step === 4) { const q = [F.boss2, F.boss, F.boss3].find((x) => x && !gone(x)) || F.boss; const c = q.center(); if (u.pos.z > FRONT_Z - 2) { via(c.x, c.z, FRONT_Z); return; } if (u.pos.z > NI_Z - 2) { via(c.x, c.z, NI_Z); return; } goTo(p, inp, c.x, c.z, 2); return; }
  const a = F.moriU.pos; goTo(p, inp, a.x + 3, a.z + 3, 3);
};

export { takato };
