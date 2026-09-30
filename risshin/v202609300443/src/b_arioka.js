// ======================================================================
// 織田家編　有岡城の戦い（天正七年十月十五日）
// 摂津の荒木村重は信長に背き、有岡城に一年近く籠もった。説きに来た黒田官兵衛（孝高）は城に捕らえられ、牢に入れられた。
// 村重が城を抜け出して尼崎へ移った後、十月、城の中から内応する者が出て、織田勢は城の中へ攻め入った。
// 官兵衛は牢から救い出されたが、長い牢暮らしで足が不自由になっていたと伝わる。
// 足軽は滝川一益の手。①夜、内応で開いた砦の木戸から攻め入る ②城下を抜けて、本丸の脇の牢の前へ
// ③牢から黒田官兵衛を救い出す ④足の不自由な官兵衛の一行を、織田の陣まで供する
// 向き：北（-z）が城の奥（本丸）。南（+z）に織田の陣。東西に惣構えの土塁
// ======================================================================
import * as THREE from 'three';
import { nobori, hut, yagura, campfire, kabukimon, tawara, dobei, ishigaki, tenshu, yaguramon, sumiyagura, kagaribi, tamon } from './props.js';
import { flagTexture } from './textures.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { moraleWord } from './hud.js';
import { gauss, enemyGroup, allyGroup, nm, centerOf, unitPos, wallLine } from './bhelp.js';
import { applyLook, NIGHT, dress, gone, burnHouse, more } from './b_inabayama.js';
import { KIT } from './b_nagashinojo.js';
import { volleyAt } from './b_tano.js';
import { camp } from './b_mid.js';
import { depthStart, depthTick, depthBot, rest, pick, fight, hold } from './b_depth.js';
// 足軽大将候補より上（信長で遊ぶ時は除く）：任務の文を「一手を預かる」者の役目に
const HI = (rt) => !rt.G.lord && (rt.G.rank || 0) >= 3;

const WALL_Z = 20;                         // 砦の土塁と柵（東西に）
const GATE = { x: 0, z: WALL_Z };          // 内応で開く木戸
const ROU = { x: -30, z: -96 };            // 牢（本丸の脇）
const CAMP = { x: 4, z: 96 };              // 織田の陣
const ODA = { flag: 'oda' };
const ARAKI = { flag: 'maru' };            // 荒木の紋（無いので丸で代える）

function height(x, z) {
  let h = 0.3 * Math.sin(x * 0.04 + 0.2) * Math.cos(z * 0.03) + 0.2 * Math.sin(z * 0.07 + x * 0.02);
  // 惣構えの土塁（砦の柵の下）
  h += 2.2 * Math.exp(-((z - WALL_Z) ** 2) / 10) * (Math.abs(x) > 5 ? 1 : 0.2);
  // 本丸の台地（北）
  h += 5 / (1 + Math.exp((z + 80) / 4));
  // 六甲の山並み（遠く）
  h += 40 * gauss(x, z, -200, -240, 16000);
  return h;
}

const arioka = {
  spawn: { x: 6, z: 70, heading: Math.PI },
  world: {
    seed: 15791,
    time: 'dusk',
    muddy: 0.35,
    paths: [[[0, 150], [0, WALL_Z], [0, -30], [-20, -70], [ROU.x, ROU.z + 6]]],
    height,
    clear: (x, z) => Math.abs(x) < 90 && z > -130 && z < 130,
    trees: 220,
    tufts: 2600,
    treeDensity: (x, z) => (Math.abs(x) < 100 && Math.abs(z) < 140 ? 0.05 : 0.6),
    groves: [{ x: 50, z: -20, r: 10, n: 10 }, { x: -60, z: 40, r: 10, n: 10 }],
    fleeOut: (x, z, team) => team === 1 && (z < -125 || Math.abs(x) > 110),
  },

  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    F.step = 0; F.ek = 0; F.ak = 0;
    // ---- 惣構えの柵（真ん中に木戸。内応で開く） ----
    const noT = (segs) => { for (const s of segs) { s.noTarget = true; s.wall = true; } return segs; };
    noT(wallLine(rt, [[-90, WALL_Z], [-3.5, WALL_Z]], { team: 1, hp: 1e9, name: '塀', segLen: 6, mesh: dobei, sama: 1.5, meshOpt: { hikae: 1 } }));
    noT(wallLine(rt, [[3.5, WALL_Z], [90, WALL_Z]], { team: 1, hp: 1e9, name: '塀', segLen: 6, mesh: dobei, sama: 1.5, meshOpt: { hikae: 1 } }));
    F.gate = rt.army.addStruct({ seg: [-3.5, WALL_Z, 3.5, WALL_Z], nx: 0, nz: 1, hp: 1e9, maxHp: 1e9, team: 1, name: '砦の木戸' });
    F.gate.noTarget = true;
    const dm = new THREE.Mesh(new THREE.BoxGeometry(6.8, 2.9, 0.2), new THREE.MeshStandardMaterial({ color: 0x3e3024, roughness: 0.95 }));
    dm.position.set(GATE.x, W.heightAt(GATE.x, GATE.z) + 1.45, GATE.z); dm.castShadow = true;
    F.door = dm;
    // 木戸の上に渡櫓（櫓門）。両脇の隅に二重の櫓（A4）
    rt.scene.add(dm, yaguramon(W, GATE.x, GATE.z, 7.4, 0), sumiyagura(W, -30, WALL_Z - 5, { rot: 0, w: 6, d: 5, base: 1.2 }), sumiyagura(W, 34, WALL_Z - 5, { rot: 0, w: 6, d: 5, base: 1.2 }));
    for (const [x, z] of [[-7, WALL_Z + 3], [7, WALL_Z + 3]]) { rt.scene.add(kagaribi(W, x, z)); W.addFire(x, z, { h: 1.4 }); }
    // ---- 城下の町屋（惣構えの内）と本丸の脇の牢 ----
    F.houses = [[-24, -6, 0.1], [22, -2, -0.2], [-36, -34, 0.2], [28, -38, 0], [-6, -52, 0.1], [40, -66, 0.2]].map(([x, z, r], i) => {
      const m = hut(W, x, z, 7, 5, r, { wall: i % 2 ? 0x6e5a40 : 0x7b6448 });
      rt.scene.add(m);
      return { x, z, m };
    });
    rt.scene.add(hut(W, 10, -110, 16, 10, 0, { h: 3.6, wall: 0x7a6a50, roof: 0x3a3430 }), yagura(W, 24, -96));
    // 本丸：台地の縁に打込接の石垣（牢へ上る道は空ける）と、石垣の上に三重の天守（有岡は早い天守を持った城）
    rt.scene.add(ishigaki(W, [[-90, -84], [-46, -84]], { kind: 'uchikomi', top: 0.1, minH: 2.6 }), ishigaki(W, [[-8, -84], [90, -84]], { kind: 'uchikomi', top: 0.1, minH: 2.6 }));
    rt.scene.add(tenshu(W, -8, -122, { floors: 3, b: 10, old: true, stone: 'uchikomi' }));
    rt.scene.add(tamon(W, [-46, -140, 30, -140], { out: -1 }));   // 本丸の北の縁を囲う多聞櫓
    W.addDistantArmy({ x: 12, z: -104, w: 16, d: 6, count: 50, facing: 0, armor: 0x2e2a26, flagTex: flagTexture('maru'), seed: 15792 });   // 本丸に詰める荒木の城兵
    // 本丸の石垣の上に並んで、城下を見下ろして構える鉄砲・弓の者と旗（軽い作り。牢へ上る道の口は空ける）
    {
      const crew = [];
      for (let x = -86, k = 0; x <= 86; x += 3.4, k++) {
        if (x > -48 && x < -6) continue;
        crew.push({ x: x + ((k * 37) % 10) / 10 - 0.5, z: -86.2 - ((k * 53) % 7) / 10, k: ['gun', 'gun', 'bow', 'spear'][k % 4], facing: ((k * 29) % 9 - 4) * 0.06 });
        if (k % 5 === 2) crew.push({ x: x + 1.2, z: -88.5, k: 'banner', facing: 0 });
      }
      W.addDistantArmy({ people: crew, armor: 0x2e2a26, flagTex: flagTexture('maru'), seed: 15794 });
    }
    F.rou = hut(W, ROU.x, ROU.z, 4, 3.4, 0.3, { h: 1.8, wall: 0x3a3228 });
    rt.scene.add(F.rou);
    for (const [x, z] of [[-10, WALL_Z - 6], [10, WALL_Z - 6], [0, -100], [18, -100]]) rt.scene.add(nobori(W, x, z, 'maru', 6));
    // ---- 滝川一益の手（自分の持ち場）、黒田の者 ----
    F.taki = allyGroup(rt, { name: '滝川一益の手', anchor: { x: 0, z: 62 }, facing: Math.PI, width: 14, aggro: 10, noRout: true, formation: 'yari' },
      dress([{ type: 'busho', n: 1, o: { name: '滝川一益', invuln: true, hat: 'kabuto_w', haori: 0x2a2a3a } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 16 }, { type: 'gun', n: 4 }], ODA));
    F.takiU = F.taki.units[0];
    F.kuri = allyGroup(rt, { name: '黒田の家臣', anchor: { x: -16, z: 66 }, facing: Math.PI, width: 6, aggro: 10, noRout: true },
      dress([{ type: 'samurai', n: 1, o: { name: '栗山善助', invuln: true, hat: 'kabuto_m', haori: 0x2a2a2a } }, { type: 'samurai', n: 1 }, { type: 'ashigaru', n: 5 }], { flag: 'kuroda' }));
    F.kuriU = F.kuri.units[0];
    F.oda = [F.taki, F.kuri];
    for (const g of F.oda) { g.defMult = 1.2; g.dmgMult = 0.8; }
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: 10, z: 72 }, Math.PI, [{ kind: 'spear', n }]);
    // ---- 陣と大軍（軽い作り） ----
    rt.scene.add(tawara(W, CAMP.x - 14, CAMP.z + 6, 0.3, 6));
    for (const [x, z, k] of [[-14, CAMP.z - 10, 'oda'], [20, CAMP.z - 10, 'eiraku'], [-30, 80, 'kuroda']]) rt.scene.add(nobori(W, x, z, k, 6));
    // 織田の本陣（城攻めの総大将 織田信忠）と、本丸の城将 荒木久左衛門の陣所（村重は尼崎へ移っている）
    F.honjin = camp(rt, { x: CAMP.x, z: CAMP.z + 4, facing: Math.PI, team: 0, faction: 'oda', mon: 'oda', general: { name: '織田信忠', hat: 'kabuto_m', haori: 0x7a1d14 }, guard: 15, reserve: 200, runTo: { x: 0, z: 62 } });
    F.ehon = camp(rt, { x: 42, z: -108, facing: 0, team: 1, faction: 'saito', mon: 'maru', armor: 0x2e2a26, general: { name: '荒木久左衛門', hat: 'kabuto_m', haori: 0x3a2e2a }, guard: 15, reserve: 100, runTo: { x: 0, z: -40 } });
    const DA = (x, z, w, d, count, facing, armor, flag, seed) => W.addDistantArmy({ x, z, w, d, count, facing, armor, flagTex: flagTexture(flag), seed });
    DA(-60, 70, 40, 12, 260, Math.PI, 0x2b3140, 'oda', 15792);
    DA(60, 72, 40, 12, 260, Math.PI, 0x2b3140, 'eiraku', 15793);
    for (const [x, z] of [[-30, 60], [30, 64], [0, 86]]) { rt.scene.add(campfire(W, x, z)); W.addFire(x, z); }
    for (const [x, z] of [[-12, WALL_Z - 3], [12, WALL_Z - 3]]) W.addFire(x, z, { torch: true, h: 1.5 });

    applyLook(rt, NIGHT);
    rt.setPhase('brief');
    rt.obj('main', HI(rt) ? '足軽の一手を預かり、滝川一益の合図を待て' : '滝川一益のもとで、合図を待て', 'main');
    rt.say('滝川一益', `${nm(rt)}、城の中に、こちらへつくと申す者がおる。今夜、砦の木戸を内から開けさせる`, 5);
    rt.say('栗山善助', '……城の牢に、わが主（黒田官兵衛）が囚われておりまする。どうか、お力をお貸しくだされ', 4.5);
    rt.marker('taki', unitPos(F.takiU), '滝川一益', {});
    rt.after(15, () => this.open(rt));
  },

  // ① 木戸が内から開く
  open(rt) {
    const F = rt.flags;
    if (F.step >= 1) return;
    F.step = 1; F.stepT = rt.t;
    rt.setPhase('open');
    rt.unmark('taki');
    // 木戸を開ける
    F.gate.alive = false;
    F.door.position.x -= 3.2; F.door.rotation.y = 1.2;
    sfx('wood', 0.9); rt.after(1, () => sfx('horagai', 1));
    rt.banner('木戸が開いた', '内応の者が、砦の木戸を内から開けた');
    rt.obj('main', HI(rt) ? '手の者を率いて木戸から攻め入り、砦の兵を退けよ' : '開いた木戸から攻め入り、砦の兵を退けよ', 'main');
    rt.say('滝川一益', 'かかれ！　声を上げよ、城じゅうに内応が出たと思わせよ！', 3.5);
    F.taki.order = 'attack'; F.taki.seekRange = 60;
    F.kuri.order = 'move'; F.kuri.dest = { x: -6, z: WALL_Z - 10 }; F.kuri.onArrive = (g) => { g.order = 'hold'; };
    F.g1 = enemyGroup(rt, { faction: 'saito', name: '砦の荒木勢', anchor: { x: 6, z: WALL_Z - 16 }, facing: 0, order: 'attack', seekRange: 60, aggro: 16, width: 14, morale: 85, fleeDir: { x: 0, z: -1 }, dmgMult: 0.64 },
      dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 16 + more(rt) }, { type: 'gun', n: 2 }], ARAKI));
    for (const u of F.g1.units) if (u.type === 'gun') u.dmg *= 0.45;
    // 塀の狭間に付く守り（A4）：木戸の左右の塀の内から、鉄砲と弓で寄せ手を撃つ（任務の数には入れない）
    F.wallG = [-26, 26].map((x) => enemyGroup(rt, { faction: 'saito', name: '塀の守り', anchor: { x, z: WALL_Z - 2.5 }, facing: 0, order: 'hold', aggro: 30, width: 10, morale: 70, fleeDir: { x: 0, z: -1 }, dmgMult: 0.5 },
      dress([{ type: 'gun', n: 3 }, { type: 'bow', n: 3 }], ARAKI)));
    for (const g of F.wallG) for (const u of g.units) u.dmg *= 0.5;
    rt.marker('g1', centerOf(F.g1), () => `砦の荒木勢・${moraleWord(F.g1.morale)}`, { red: true, group: F.g1 });
    // 城下に火の手（味方が火を放つ）
    F.houses.slice(0, 2).forEach((h, i) => rt.after(24 + i * 14, () => { if (!F.ending) burnHouse(rt, h); }));
  },

  // ② 城下を抜けて牢へ
  toRou(rt) {
    const F = rt.flags;
    if (F.step >= 2) return;
    F.step = 2; F.stepT = rt.t;
    rt.setPhase('town');
    rt.unmark('g1');
    if (!gone(F.g1)) F.g1.morale = Math.min(F.g1.morale, 15);
    rt.obj('main', '栗山善助とともに、本丸の脇の牢へ急げ', 'main');
    rt.say('栗山善助', '牢は本丸の西の脇じゃ。……殿（官兵衛）、今参りまする！', 3.5);
    rt.marker('rou', ROU, '牢', { h: 3 });
    F.kuri.order = 'path'; F.kuri.path = [[-10, -20], [-20, -60], [ROU.x + 4, ROU.z + 10]]; F.kuri.pathIdx = 0; F.kuri.speed = 2.8;
    F.kuri.onArrive = (g) => { g.order = 'hold'; g.anchor = { x: ROU.x + 4, z: ROU.z + 10 }; };
    F.taki.order = 'move'; F.taki.dest = { x: -8, z: -60 }; F.taki.onArrive = (g) => { g.order = 'hold'; g.aggro = 14; };
    F.g2 = enemyGroup(rt, { faction: 'saito', name: '本丸から出た荒木勢', anchor: { x: -8, z: -84 }, facing: 0, order: 'attack', seekRange: 70, aggro: 16, width: 12, morale: 95, fleeDir: { x: 0.4, z: -1 }, dmgMult: 0.64 },
      dress([{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 14 + more(rt) }], ARAKI));
    rt.marker('g2', centerOf(F.g2), () => `本丸から出た荒木勢・${moraleWord(F.g2.morale)}`, { red: true, group: F.g2 });
    // 勝ち筋：本丸の兵は大通りへ出てくる。滝川の鉄砲組が通りで待ち受けて撃ち崩す間に、西の小路から牢へ
    F.agun = allyGroup(rt, { name: '滝川の鉄砲組', anchor: { x: -4, z: -50 }, facing: Math.PI, width: 14, aggro: 4, noRout: true, formation: 'line' },
      dress([{ type: 'samurai', n: 1 }, { type: 'gun', n: 10 }], ODA));
    rt.after(4, () => rt.say('滝川一益', '本丸の兵は大通りへ出てくる。鉄砲組がそこで撃ち崩す。その方は西の小路を抜けて牢へ急げ', 4.5));
    volleyAt(rt, { guns: () => [F.agun], foes: () => [F.g2], who: '滝川一益', near: 30, drop: 30, max: 45, line: '滝川の鉄砲組が大通りでそろって撃った。本丸の兵の足が止まる' });
  },

  // ③ 牢を開ける
  rouOpen(rt) {
    const F = rt.flags;
    if (F.rouOpened) return;
    F.rouOpened = true;
    rt.uninteract('rou'); rt.unmark('rou');
    sfx('wood', 1);
    rt.award((t) => t.side.push('牢を開けた'), '牢を開けた');
    rt.say('栗山善助', '殿……！　よくぞご無事で', 3);
    rt.say('黒田官兵衛', '……善助か。足が、言うことをきかぬ。すまぬが、肩を貸してくれ', 4);
    // 判断②：どの道で陣へ運ぶか（時間切れは、追手の少ない細道）
    rt.after(4.5, () => {
      if (F.ending || F.step >= 3) return;
      rt.say('栗山善助', '大通りは早いが、本丸の兵が追うてくる。西の土塁沿いは遠回りじゃが、人目が少ない', 4.5);
      rt.choose('官兵衛の足が動かぬ。どの道で陣へ運ぶ？', [
        { label: '西の土塁沿いの細道を回る', note: '遠回りで遅い。追手は少ないが、土塁の陰に鉄砲がひそむ' },
        { label: '戸板に乗せ、大通りを一気に下る', note: '早く着ける。本丸の兵が東と西から大勢で追ってくる' },
      ], go, 16);
    });
    const go = (i) => { if (F.route != null || F.ending) return; F.route = i; this.deep(rt, 'B', () => this.escape(rt)); };
    rt.after(24, () => { if (F.route == null) { if (rt.choice) rt.pickChoice(0); go(0); } });
  },

  // ④ 官兵衛を陣まで
  escape(rt) {
    const F = rt.flags;
    if (F.step >= 3) return;
    F.step = 3; F.stepT = rt.t;
    rt.setPhase('escape');
    rt.banner('黒田官兵衛を救い出した', '肩を貸して、織田の陣まで');
    rt.obj('main', HI(rt) ? '手の者で官兵衛の一行を囲み、織田の陣まで供せよ' : '官兵衛の一行を守り、織田の陣まで供せよ', 'main');
    // 官兵衛（肩を借りて歩く。戦わない）と、支える者
    const g = allyGroup(rt, { name: '官兵衛の一行', anchor: { x: ROU.x + 2, z: ROU.z + 6 }, facing: 0, width: 3, aggro: 0, noRout: true, formation: 'column', speed: 2.3 },
      [{ type: 'samurai', n: 1, o: { name: '黒田官兵衛', flag: null, hat: 'none', armor: 0x4a4238, weapon: 'none' } }, { type: 'porter', n: 2, o: { flag: null, hat: 'jingasa' } }]);
    for (const u of g.units) { u.noTarget = true; u.invuln = true; u.dmg = 0; }
    const west = F.route !== 1;
    g.order = 'path'; g.path = west ? [[-46, -70], [-62, -34], [-54, WALL_Z - 10], [-6, WALL_Z - 5], [0, WALL_Z + 10], [CAMP.x, CAMP.z - 14]] : [[-20, -60], [-10, -20], [0, WALL_Z - 4], [0, WALL_Z + 10], [CAMP.x, CAMP.z - 14]]; g.pathIdx = 0;
    g.speed = west ? 2.2 : 3.0;
    g.onArrive = () => { rt.unmark('esc'); rt.unzone('camp'); rt.objDone('main'); this.deep(rt, 'C', () => this.win(rt)); };
    F.esc = g;
    F.kuri.order = 'path'; F.kuri.path = g.path.slice(); F.kuri.pathIdx = 0; F.kuri.speed = 2.3; F.kuri.onArrive = (q) => { q.order = 'hold'; };
    rt.marker('esc', centerOf(g), '官兵衛の一行', {});
    rt.zone('camp', CAMP.x, CAMP.z - 14, 6);
    // 追手
    rt.say('滝川一益', west ? '土塁沿いは道が細い。陰から撃たれるぞ、一行の前を歩け' : '大通りを一気に下れ！　追手は鉄砲組が大通りで撃つ。足を止めるな', 4);
    rt.after(18, () => {
      if (F.ending) return;
      if (west) {
        // 細道：追手は西の一手だけ。その後ろに城兵の控え
        F.g3 = enemyGroup(rt, { faction: 'saito', name: '追ってくる荒木勢', anchor: { x: -20, z: -84 }, facing: Math.PI * 0.8, order: 'attack', seekRange: 90, aggro: 16, width: 10, morale: 90, fleeDir: { x: 0.5, z: -1 }, dmgMult: 0.6 },
          dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 12 + more(rt) }], ARAKI));
        KIT.backOf(rt, F.g3, { flag: 'maru', armor: 0x33302a, kind: 'spear', w: 16, depth: 10, count: 140, seed: 15801, stop: () => F.g3.center().z > -30 });
        rt.army.play('eshout', { x: -20, z: -84 }, 1.6);
        rt.say('足軽', '追手じゃ！　本丸の脇から、どっと出てきた！', 2.5);
        rt.marker('g3', centerOf(F.g3), () => `追ってくる荒木勢・${moraleWord(F.g3.morale)}`, { red: true, group: F.g3 });
        rt.after(16, () => this.rear(rt));
        return;
      }
      F.g3 = enemyGroup(rt, { faction: 'saito', name: '追ってくる荒木勢', anchor: { x: 30, z: -70 }, facing: -Math.PI * 0.8, order: 'attack', seekRange: 90, aggro: 16, width: 10, morale: 90, fleeDir: { x: 0.5, z: -1 }, dmgMult: 0.62 },
        dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 12 + more(rt) }], ARAKI));
      // 追手は一度にどっと来る：東の追手と本丸の脇から出た者、その後ろに城兵の控え（軽い作り）
      F.g3b = enemyGroup(rt, { faction: 'saito', name: '本丸の脇から出た荒木勢', anchor: { x: -44, z: -76 }, facing: -Math.PI * 0.2, order: 'attack', seekRange: 90, aggro: 16, width: 10, morale: 90, fleeDir: { x: -0.5, z: -1 }, dmgMult: 0.62 },
        dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 10 + more(rt) }], ARAKI));
      KIT.backOf(rt, F.g3, { flag: 'maru', armor: 0x33302a, kind: 'spear', w: 16, depth: 10, count: 120, seed: 15801, stop: () => F.g3.center().z > -30 });
      rt.army.play('eshout', { x: 30, z: -70 }, 1.6);
      rt.say('足軽', '追手じゃ！　東からも西からも来る。一行を守れ！', 2.5);
      rt.marker('g3', centerOf(F.g3), () => `追ってくる荒木勢・${moraleWord(F.g3.morale)}`, { red: true, group: F.g3 });
      rt.marker('g3b', centerOf(F.g3b), () => `本丸の脇の荒木勢・${moraleWord(F.g3b.morale)}`, { red: true, group: F.g3b });
      rt.after(14, () => this.rear(rt));
    });
    // 砦の土塁の近くで、最後の足止め（長い道を、ただ歩くだけにしない）
    rt.after(58, () => {
      if (F.ending || F.g4) return;
      const gx = west ? -76 : 26;
      F.g4 = enemyGroup(rt, { faction: 'saito', name: '土塁の陰の荒木の鉄砲組', anchor: { x: gx, z: WALL_Z - 12 }, facing: -Math.PI / 2, order: 'attack', seekRange: 50, aggro: 16, width: 8, morale: 70, fleeDir: { x: 1, z: -0.5 }, dmgMult: 0.55 },
        dress([{ type: 'samurai', n: 1 }, { type: 'gun', n: 3 }, { type: 'ashigaru', n: 5 }], ARAKI));
      for (const u of F.g4.units) if (u.type === 'gun') u.dmg *= 0.5;
      rt.army.play('eshout', { x: gx, z: WALL_Z - 12 }, 1.2);
      rt.say('栗山善助', '土塁の陰に鉄砲じゃ！　官兵衛様に当てさせるな！', 3);
      rt.marker('g4', centerOf(F.g4), () => `荒木の鉄砲組・${moraleWord(F.g4.morale)}`, { red: true, group: F.g4 });
    });
  },

  // 判断③：追手が一行に迫る。殿に残るか、一行のそばで退くか（時間切れは一行のそば）
  rear(rt) {
    const F = rt.flags;
    if (F.rearAsked || F.ending || F.step !== 3) return;
    F.rearAsked = true;
    rt.say('滝川一益', '追手が多い。誰かが殿（しんがり）に残って、足を止めねばならぬ', 4);
    rt.choose('追手が一行に迫る。どうする？', [
      { label: '一行のそばで、守りながら退く', note: '一行から離れない。追手は背に付いてくる' },
      { label: '殿に残り、追手を食い止める', note: '一行は先に行く。大手柄。囲まれやすい' },
    ], (i) => {
      if (i !== 1 || F.ending) { rt.say('栗山善助', 'かたじけない。離れずにおってくだされ', 3); return; }
      F.shingari = true; F.escGo = true;
      if (F.esc) F.esc.order = 'path';
      const p = rt.player.u.pos;
      F.sgAt = { x: p.x, z: p.z };
      rt.obj('rear', '殿：追手を食い止めよ（一行は先に行く）', 'order');
      rt.say('滝川一益', '頼むぞ。狭い辻で槍をそろえよ。辻なら、多勢でも一度には来られぬ', 4);
      rt.bark('殿に残った');
    }, 15);
  },

  // 段を重ねる（b_depth.js）：A 砦を取った後、城下の辻を押し通る ／ C 官兵衛を陣へ入れた後、木戸を奪い返しに来る荒木勢を防ぐ
  deep(rt, which, then) {
    const F = rt.flags;
    if (F['dp' + which]) return;
    F['dp' + which] = true;
    if (rt.G.lord) { then(); return; }
    F.dpOn = true;
    depthStart(rt, ariCtx(rt), which === 'A' ? ariA() : which === 'B' ? ariB() : ariC(), () => { F.dpOn = false; rt.after(3, () => { const q = rt.objectives.find((x) => x.id === 'dp'); if (q && q.state) rt.objRemove('dp'); }); then(); });
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    for (const id of ['esc', 'g2', 'g3', 'g3b', 'g4', 'dp']) rt.unmark(id);
    rt.unzone('camp');
    for (const q of [F.g2, F.g3, F.g3b]) if (q && !gone(q)) { q.noRout = false; q.morale = 0; }
    rt.objDone('main');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '黒田官兵衛を牢から救い出した', pts: 20 }; }, '任務達成・官兵衛を救い出した');
    sfx('horagai', 0.6);
    rt.banner('有岡城の惣構え、破れる', '官兵衛は一年ぶりに牢を出た');
    rt.say('栗山善助', `${nm(rt)}殿、この恩は、黒田の家は忘れませぬ`, 4);
    rt.after(5, () => rt.say('', '――村重の妻子や家臣の家族の多くは、のちに信長の命で殺された。惨い話として今に伝わる', 6));
    rt.player.u.invuln = true;
    rt.finish({}, 13);
  },

  update(rt, dt) {
    const F = rt.flags;
    // 崩れた隊の印は消す（古い印が「あちらじゃ」の行き先にならないように）
    for (const m of rt.markers.slice()) if (m.group && gone(m.group)) rt.unmark(m.id);
    KIT.backTick(rt);
    if (F.ending) return;
    if (F.dpOn) { depthTick(rt, dt); return; }
    const p = rt.player.u.pos;
    if (F.step === 1) {
      rt.objProgress('main', `荒木勢 ${F.g1.count}人`);
      if (F.g1.count < 5 && !gone(F.g1)) F.g1.morale = Math.min(F.g1.morale, 20);
      if (gone(F.g1) || rt.t - F.stepT > 120) {
        rt.unmark('g1');
        if (!gone(F.g1)) F.g1.morale = 0;
        for (const g of F.wallG) if (!gone(g)) g.morale = 0;
        rt.award((t) => t.side.push('砦の兵を退けた'), '砦の兵を退けた');
        F.g1Done = true;
        rt.objDone('main');
        this.deep(rt, 'A', () => this.toRou(rt));
      }
    }
    if (F.step === 2) {
      const d = Math.hypot(p.x - ROU.x, p.z - ROU.z);
      rt.objProgress('main', F.g2 && !gone(F.g2) ? `荒木勢 ${F.g2.count}人・牢まで ${Math.round(d)}m` : `牢まで ${Math.round(d)}m`);
      if (F.g2 && F.g2.count < 5 && !gone(F.g2)) F.g2.morale = Math.min(F.g2.morale, 20);
      if (!F.rouOn && gone(F.g2)) {
        F.rouOn = true;
        rt.obj('main', '牢の錠を打ち壊して、官兵衛を救い出せ', 'main');
        rt.addInteract('rou', { x: ROU.x + 2, z: ROU.z + 3 }, '牢の錠を打ち壊す', () => this.rouOpen(rt), { r: 3.4, hold: 2.4 });
      }
      if (rt.t - F.stepT > 160) this.rouOpen(rt);
    }
    if (F.step === 3 && F.esc) {
      const c = F.esc.center();
      const d = Math.hypot(c.x - p.x, c.z - p.z);
      if (d > 18 && F.esc.order === 'path' && !F.escGo) { F.esc.order = 'hold'; F.esc.anchor = { x: c.x, z: c.z }; F.escWaitT = rt.t; rt.bark('一行が待っている。そばを離れるな'); }
      else if (d < 10 && F.esc.order === 'hold') F.esc.order = 'path';
      // 待たせたまま来ない時：一行の者が呼び、それでも来なければ栗山らと先に進む（待たせきりにしない）
      if (F.esc.order === 'hold' && F.escWaitT != null) {
        const w = rt.t - F.escWaitT;
        if (w > 20 && !F.escCall) { F.escCall = true; rt.say('栗山善助', '官兵衛様はここじゃ！　早う、そばへ来てくだされ', 3.5); }
        if (w > 45) { F.escGo = true; F.esc.order = 'path'; rt.say('栗山善助', '待てぬ……先に参る。追手を防いでくだされ！', 3); }
      }
      for (const q of [F.g3, F.g3b, F.g4]) if (q && q.count < 5 && !gone(q)) q.morale = Math.min(q.morale, 20);
      // 殿：追手を崩したら大手柄（一行から離れて戦った分）
      if (F.shingari && !F.sgDone && F.g3 && gone(F.g3) && (!F.g3b || gone(F.g3b))) {
        F.sgDone = true; rt.objDone('rear');
        rt.award((t) => { t.special = { label: '殿に残って追手を食い止めた', pts: 20 }; }, '殿に残って追手を食い止めた');
        rt.say('滝川一益', 'ようやった！　一行を追え、陣で待っておる', 3);
      }
      rt.objProgress('main', `陣まで ${Math.round(Math.hypot(c.x - CAMP.x, c.z - CAMP.z + 14))}m`);
      if (rt.t - F.stepT > 240) this.deep(rt, 'C', () => this.win(rt));
    }
  },

  onKill(rt, v) {
    const F = rt.flags;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
  },
  onRout(rt, g) {
    if (g.team !== 1 || rt.t < (rt.flags.routSayT || 0)) return;
    rt.flags.routSayT = rt.t + 9;
    rt.say('足軽', `${g.name}が退いた！`, 2.5);
  },
};

// ---------------- 一つの戦を濃くする段（b_depth.js） ----------------
// 城攻めの夜：荒木勢は惣構えの内の辻ごとに固まり、本丸から次々に新手を出す。一つの波は数百の城兵が後ろに付く
const uS = (n) => ({ type: 'samurai', n }), uA = (n) => ({ type: 'ashigaru', n }), uG = (n) => ({ type: 'gun', n });
const gunLine = (name, from, n, o = {}) => ({ name, from, list: [uS(1), uG(n)], formation: 'line', seek: 70, mass: 80, kind: 'gun', dmg: 0.45, ...o });
function ariCtx(rt) {
  const F = rt.flags;
  return { faction: 'saito', flag: 'maru', armor: 0x2e2a26, dmg: 0.58, mass: 220, look: (l) => dress(l, ARAKI),
    friends: () => [F.taki, F.kuri].filter((g) => g && g.count && !g.routed), botSteer: wallSteer,
    aid: { name: '滝川の後詰の一組', faction: 'oda', flag: 'oda', list: [uS(1), uA(9)] }, aidSaid: '滝川の手から一組が加わった' };
}
// bot が惣構えの塀に突っかからないように：塀の線を越える時は、木戸の口へ回る
function wallSteer(b, inp) {
  if (!inp.k.has('KeyW')) return;
  const p = b.player, u = p.u, fz = Math.cos(p.yaw), fx = Math.sin(p.yaw);
  const az = u.pos.z + fz * 3, ax = u.pos.x + fx * 3;
  if (Math.abs(u.pos.x) < 2.5 && Math.abs(ax) < 2.5) return;
  if (u.pos.z > WALL_Z + 0.3 && az < WALL_Z + 1.5) p.yaw = Math.atan2(-u.pos.x, WALL_Z + 4 - u.pos.z);
  else if (u.pos.z < WALL_Z - 0.3 && az > WALL_Z - 1.5) p.yaw = Math.atan2(-u.pos.x, WALL_Z - 4 - u.pos.z);
}
// A 砦を取った後：どう町を抜けるか（判断①）→ 城下の辻の押し合い
function ariA() {
  const at = { x: -2, z: -14 };
  return [
    rest({ dur: 7, heal: 0.3, say: [['滝川一益', '砦は取った。じゃが惣構えの内には、荒木の兵がまだ千はおる'], ['栗山善助', '牢は本丸の西の脇。この町を抜けねばなりませぬ']] }),
    pick({ title: '惣構えの内の町。どう抜ける？',
      options: [{ label: '町屋に火を放ち、煙に紛れて押し通る', note: '敵は乱れて崩れやすい。町の者が焼け出される' }, { label: '火は放たず、辻ごとに斬り合って進む', note: '敵は乱れない。町の者を巻き込まない（手柄）' }],
      on: (rt, m, i) => {
        const F = rt.flags;
        m.fire = i === 0;
        if (m.fire) { F.houses.slice(2).forEach((h, k) => rt.after(1 + k * 2.5, () => burnHouse(rt, h))); rt.say('滝川一益', '火をかけよ！　城じゅうに内応が出たと思わせるのじゃ', 3); }
        else { rt.award((t) => t.side.push('町に火を放たなかった'), '町に火を放たなかった'); rt.say('滝川一益', 'よかろう。辻ごとに槍をそろえて押せ', 3); }
      } }),
    fight({ at, title: '城下の辻', sub: '町屋の間の辻ごとに、荒木勢が固まる', obj: (rt) => (HI(rt) ? '手の者を率いて、城下の辻の荒木勢を崩せ' : '城下の辻の荒木勢を崩せ'),
      say: [['滝川一益', '町屋の陰の鉄砲を先に潰せ。撃たせたまま辻へ出れば、狙い撃ちじゃ', 4.5]],
      foes: (rt, m) => [{ name: '辻を固める荒木勢', from: { x: -10, z: -40 }, list: [uS(2), uA(12)], mass: 280, morale: m.fire ? 60 : 90 }, gunLine('町屋の陰の鉄砲', { x: 22, z: -30 }, 6, { morale: m.fire ? 50 : 85 })],
      later: [
        { t: 34, title: '横槍', sub: '西の惣構えの内から、荒木勢が回り込む', say: ['足軽', '西から来る！　横を突かれるぞ！'], foes: (rt, m) => [{ name: '西から回る荒木勢', from: { x: -60, z: -4 }, list: [uS(2), uA(11)], mass: 240, morale: m.fire ? 65 : 90 }] },
        { t: 70, say: ['栗山善助', '本丸から新手じゃ……！　ここを抜ければ牢は近い！'], foes: (rt, m) => [{ name: '本丸から下りた新手', from: { x: 10, z: -66 }, list: [uS(3), uA(12)], mass: 300, morale: m.fire ? 70 : 95 }] },
      ],
      max: 150, reward: '城下の辻を押し通った' }),
  ];
}
// B 牢を開けた後：官兵衛を戸板に乗せる支度の間、牢の前を守る
function ariB() {
  const at = { x: ROU.x + 6, z: ROU.z + 14 };
  return [
    hold({ at, dur: 55, r: 12, title: '牢の前', sub: '官兵衛を運び出す支度の間、牢の前を守る', label: '牢の前', obj: (rt) => (HI(rt) ? '手の者で牢の前を固め、支度が済むまで荒木勢を寄せつけるな' : '支度が済むまで、牢の前を守れ'),
      say: [['栗山善助', '戸板を探して参る！　しばし、ここを頼みまする', 3.5]],
      waves: [
        { t: 3, say: ['足軽', '牢番が知らせたか……本丸の口から来る！'], foes: () => [{ name: '本丸の口の荒木勢', from: { x: -6, z: -104 }, list: [uS(2), uA(11)], mass: 240 }] },
        { t: 28, say: ['足軽', '石垣の下を回って、西からも来る！'], foes: () => [{ name: '石垣の下の荒木勢', from: { x: -64, z: -100 }, list: [uS(2), uA(10)], mass: 200 }] },
      ],
      reward: '牢の前を守り抜いた', lost: ['栗山善助', '支度は済んだ……急ぎまするぞ！'] }),
  ];
}
// C 官兵衛を陣へ入れた後：木戸を奪い返しに来る荒木勢を、木戸の口で防ぐ
function ariC() {
  const at = { x: 0, z: WALL_Z + 8 };
  return [
    rest({ dur: 7, heal: 0.4, bark: '官兵衛の一行は陣に入った（手傷を縛った）', say: [['織田信忠', '官兵衛を救うたか。ようやった'], ['滝川一益', '……荒木の者が、木戸を奪い返しに来るぞ。ここで口を塞がれては、明日の攻めが立たぬ'], ['滝川一益', '木戸の口は狭い。口の外で槍をそろえれば、多勢でも一度には来られぬ', 4.5]] }),
    hold({ at, dur: 88, r: 13, title: '木戸の口', sub: '荒木勢が木戸を奪い返しに押し寄せる', label: '砦の木戸', obj: (rt) => (HI(rt) ? '手の者を木戸の口に並べ、押し寄せる荒木勢を防げ' : '木戸の口で、押し寄せる荒木勢を防げ'),
      waves: [
        { t: 4, say: ['足軽', '来た！　町の中から、どっと押し寄せる！'], foes: () => [{ name: '木戸へ寄せる荒木勢', from: { x: 0, z: -10 }, list: [uS(3), uA(13)], mass: 360, noRout: 20 }] },
        { t: 30, say: ['滝川一益', '塀の狭間に鉄砲が並んだ！　口の脇の土塁に寄れ！'], foes: () => [gunLine('塀の内の鉄砲衆', { x: -18, z: WALL_Z - 4 }, 6, { mass: 0 })] },
        { t: 46, say: ['足軽', '東の土塁の端を越えて来る！'], foes: () => [{ name: '土塁を越える荒木勢', from: { x: 40, z: WALL_Z - 6 }, list: [uS(2), uA(10)], mass: 200 }] },
        { t: 64, title: '最後の寄せ', sub: '荒木久左衛門の手が、自ら木戸へ', say: ['足軽', '大将の旗が来る！　これが最後じゃ、押し返せ！'], foes: () => [{ name: '荒木久左衛門の手', from: { x: 12, z: -30 }, list: [uS(4), uA(12)], mass: 300 }] },
      ],
      reward: '木戸の口を守り抜いた', lost: ['滝川一益', '押し込まれたか……陣から後詰を出せ！'] }),
    rest({ dur: 6, heal: 0.3, bark: '荒木勢が町の中へ退いていく', say: [['滝川一益', '退くぞ。……追えば、辻を取り戻せる。じゃが、本丸の鉄砲の届く所じゃ']] }),
    pick({ title: '木戸は守った。退く荒木勢をどうする？',
      options: [{ label: '追って、城下の辻まで押し返す', note: '辻を取れば明日の攻めが楽になる。手柄。本丸の鉄砲が届く' }, { label: '木戸を固め、夜明けを待つ', note: '組を休ませる。手柄は小さい' }],
      on: (rt, m, i) => { m.chase = i === 0; rt.say('滝川一益', i === 0 ? 'よし、押せ！　深追いはするな、辻までじゃ' : 'よかろう。木戸に篝火を増やせ', 3); if (i === 1) rt.award((t) => t.side.push('木戸を固めて夜明けを待った'), '木戸を固めた'); } }),
    fight({ skip: (rt, m) => !m.chase, at: { x: 0, z: -18 }, title: '辻の取り返し', sub: '退く荒木勢の殿が、辻で向き直る', obj: (rt) => (HI(rt) ? '手の者を率いて、城下の辻まで荒木勢を押し返せ' : '城下の辻まで、荒木勢を押し返せ'),
      foes: () => [{ name: '荒木の殿', from: { x: -4, z: -34 }, list: [uS(3), uA(10)], mass: 220 }],
      later: [{ t: 30, say: ['足軽', '本丸の石垣から撃ってくる！　町屋の陰へ！'], foes: () => [gunLine('本丸の口の鉄砲衆', { x: -20, z: -78 }, 6, { mass: 0, dmg: 0.4 })] }],
      max: 100, reward: (t) => { t.special = { label: '城下の辻を取り返した', pts: 15 }; }, rewardLabel: '城下の辻を取り返した' }),
  ];
}

// 両軍の総勢（有岡城を囲む織田勢 五万ほど、城に残った荒木勢 数千。数には諸説ある）
arioka.force = (rt) => {
  const F = rt.flags;
  return { a: Math.round(50000 - (F.ak || 0) * 30), a0: 50000, b: Math.max(0, 5000 - (F.ek || 0) * 40), b0: 5000 };
};
arioka.sides = { a: { name: '織田軍', mon: 'oda' }, b: { name: '荒木軍', mon: 'maru' } };
// 史実でこの戦にいた名のある武将（battle.js の placeFamous が、その家の隊に加える。敵は名乗り、討てば手柄）
arioka.famous = [
  { name: '渡辺勘大夫', g: /砦|土塁/, loose: 1, line: '荒木の渡辺勘大夫なり！　城は明け渡さぬ！' },
];
arioka.date = () => '天正七年十月十五日　秋・夜';
arioka.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '合図まで待つ' : '');
arioka.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
arioka.history = '天正六年（1578）十月、摂津の荒木村重は信長に背いて有岡城（伊丹城）に籠もった。村重を説きに城へ入った黒田官兵衛（孝高。小寺家の家老で、羽柴秀吉のもとで働いていた）は捕らえられ、牢に入れられた。織田勢は城を囲み、一年近く戦いが続いたが、翌年九月、村重はわずかな供と城を抜けて尼崎城へ移った。十月十五日、城の中から織田方に内応する者が出て、滝川一益らが惣構えの内へ攻め入った。本丸はなお持ちこたえたが、十一月に城は開け渡された。官兵衛は救い出されたが（救い出された日には諸説ある）、長い牢暮らしで足が不自由になったと伝わる。村重の妻子や家臣の家族の多くは、のちに信長の命で処刑された。荒木家の紋の絵はまだ無いので、ここでは丸の旗で代えている。日付や人数には諸説ある。';

// 素直な遊び手：木戸から入り、砦の兵と戦い、牢へ行って錠を壊し、一行のそばを歩く
arioka.botBrain = (b, inp, o) => { ariBot(b, inp, o); wallSteer(b, inp); };
function ariBot(b, inp, { goTo }) {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyE');
  if (!u.alive || F.ending) return;
  if (F.dpOn) { depthBot(b, inp, goTo); return; }
  if (u.hp < u.maxHp * 0.5) b.botRest = true;
  if (b.botRest && u.hp > u.maxHp * 0.85) b.botRest = false;
  if (b.botRest && F.step < 3) { inp.guardHold = false; const c = F.taki.center(); goTo(p, inp, c.x, c.z + 4, 2); return; }
  const e = b.army.nearestEnemy(u, 12, (o) => !o.fleeing && (F.step >= 1 ? true : o.pos.z > WALL_Z));
  if (e && (F.step !== 3 || Math.hypot(e.pos.x - F.esc.center().x, e.pos.z - F.esc.center().z) < 16)) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d > 2.6) inp.k.add('KeyW');
    if (d < 3.2 && Math.random() < 0.5) inp.leftPressed = true;
    inp.guardHold = (b.army.threats || []).length > 0 && Math.random() < 0.85;
    return;
  }
  inp.guardHold = false;
  if (F.step === 1) { if (u.pos.z > WALL_Z + 1 && Math.abs(u.pos.x) > 2.5) { goTo(p, inp, 0, WALL_Z + 4, 1); return; } const c = gone(F.g1) ? { x: 0, z: 0 } : F.g1.center(); goTo(p, inp, c.x, c.z, 2); return; }
  if (F.step === 2) {
    if (u.pos.z > WALL_Z - 1 && Math.abs(u.pos.x) > 2.5) { goTo(p, inp, 0, WALL_Z + 4, 1); return; }
    if (u.pos.z > WALL_Z - 1) { goTo(p, inp, 0, WALL_Z - 5, 1); return; }
    if (F.g2 && !gone(F.g2)) { const c = F.g2.center(); goTo(p, inp, c.x, c.z, 2); return; }
    const it = b.interacts.find((q) => q.id === 'rou');
    if (it) { const d = Math.hypot(it.pos.x - u.pos.x, it.pos.z - u.pos.z); if (d > 1.4) goTo(p, inp, it.pos.x, it.pos.z, 1); else inp.k.add('KeyE'); return; }
    goTo(p, inp, ROU.x + 3, ROU.z + 6, 2);
    return;
  }
  if (F.step === 3 && F.esc) { const c = F.esc.center(); goTo(p, inp, c.x + 2, c.z - 2, 3); }
}

export { arioka };
