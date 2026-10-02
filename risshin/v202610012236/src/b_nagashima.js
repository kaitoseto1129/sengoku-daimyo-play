// ======================================================================
// 織田家編　長島一向一揆（天正二年七月〜九月）
// 木曽・長良・揖斐の川が海に注ぐ輪中の島々に、一向宗の門徒が砦を構えて立てこもった。
// 信長は陸と海（九鬼嘉隆の船）から島々を囲み、兵糧を断った。
// 足軽は柴田勝家の手。①中江の砦に向かう岸に柵を結う（砦から打って出る門徒を退けながら）
// ②夕暮れ、兵糧を運び込もうとする一揆の舟が岸に着く。上がった者を退ける ③夜、砦から決死の門徒が打って出る。柵で受け止める
// 最後に砦には火がかけられる。惨い終わりは、歴史の文で伝える
// ②と③の間・③の後に段（b_depth.js）：葦原に潜んだ舟の者→川を渡る門徒の群れ（砦の堤の鉄砲・背と横から）→佐久間の陣の囲み
// →一門の陣へ斬り込む門徒（助けに走るか、柵を守るか）。岸の左右では、門徒の群れと織田の手が押し合う（軽い作り）
// 向き：北（-z）の川の向こうに中江の砦のある輪中。南（+z）に織田の陣。東（+x）は海へ
// ======================================================================
import * as THREE from 'three';
import { nobori, hut, yagura, campfire, jinmaku, tawara, dou, romon, village, kobune } from './props.js';
import { flagTexture } from './textures.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { moraleWord } from './hud.js';
import { gauss, enemyGroup, allyGroup, nm, centerOf, unitPos, wallLine, brokenWall } from './bhelp.js';
import { applyLook, NIGHT, dress, gone, volleyWatch } from './b_inabayama.js';
import { namuTex } from './b_nodafukushima.js';
import { KIT } from './b_nagashinojo.js';
import { depthStart, depthTick, rest, pick, fight, hold, depthBot } from './b_depth.js';
import { uS, uA, uG, round, gunLine, lines, leanAll, volleyAll, camp } from './b_mid.js';
import { attachFireSpread } from './siege_fire.js';
import { YANAGASHIMA } from './castles/nagashima.js';

// 足軽大将ほどの身分（信長で遊ぶ時は除く）：柴田の手の、岸の持ち場の一手を預かる
const hi = (rt) => !rt.G.lord && (rt.G.rank || 0) >= 3;

const CH_Z = -32;                          // 島の手前の川筋
const BANK_Z = -20;                        // こちらの岸（柵を結う所）
const FORT = { x: 0, z: -74 };             // 中江の砦
const GANSHO = { x: -44, z: -82 };         // 願証寺・寺内町（中江の砦とは別の、宗教の中心。軍事拠点と分ける）
const SPOTS = [{ x: -26, z: BANK_Z }, { x: 0, z: BANK_Z - 1 }, { x: 26, z: BANK_Z }];   // 柵を結う所
// 砦群（docs/late6-1573-1575-spec.md 38〜52）：願証寺一つを落とす戦にしない。河口近くの加路戸砦・水路の堤の拠点・川筋の中洲砦
const KARATO = { x: 70, z: -100 };          // 加路戸砦（河口近くの城館）
const TSUTSUMI = { x: -50, z: -60 };        // 堤の拠点（両側が水の、狭い堤の守り）
const NAKASU = { x: 46, z: -46 };           // 中洲の砦（川筋の中洲）
const ODA = { flag: 'oda' };
const IKKO = { armor: 0x3a342c, lace: 0x5a5040, cloth: 0x4a4236, hat: 'hachimaki', flag: 'namu' };

function height(x, z) {
  let h = 0.25 * Math.sin(x * 0.03 + 0.4) * Math.cos(z * 0.025) + 0.15 * Math.sin(z * 0.07 + x * 0.02);
  // こちらの岸の堤と、島の堤（輪中）
  h += 1.8 * Math.exp(-((z - (BANK_Z + 5)) ** 2) / 30);
  const di = Math.hypot((x - FORT.x) / 1.4, z - FORT.z);
  h += 1.6 * Math.exp(-((di - 30) ** 2) / 24) + 1.0 * Math.max(0, Math.min(1, (34 - di) / 10));
  // 北西の養老の山並み
  h += 30 * gauss(x, z, -200, -200, 12000);
  return h;
}

// 舟：底の平らな川舟（艪で漕ぐ）。一揆の兵糧舟
const WOOD = new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.95 });
const DARK = new THREE.MeshStandardMaterial({ color: 0x3a2e22, roughness: 0.95 });
function boat(len = 9, wide = 2.2) {
  const g = new THREE.Group();
  const bot = new THREE.Mesh(new THREE.BoxGeometry(wide, 0.25, len), WOOD); bot.position.y = 0.1; g.add(bot);
  for (const sd of [-1, 1]) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.6, len), DARK); s.position.set(sd * wide / 2, 0.35, 0); s.rotation.z = sd * 0.15; g.add(s); }
  const bow = new THREE.Mesh(new THREE.BoxGeometry(wide * 0.7, 0.5, 1.4), DARK); bow.position.set(0, 0.45, len / 2 + 0.3); bow.rotation.x = -0.4; g.add(bow);
  // 積んだ俵
  for (let i = 0; i < 4; i++) { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.9, 8), new THREE.MeshStandardMaterial({ color: 0x9a8656, roughness: 1 })); t.rotation.z = Math.PI / 2; t.position.set(0, 0.55, -len / 2 + 1.5 + i * 1.1); g.add(t); }
  for (const m of g.children) m.castShadow = true;
  return g;
}
// 九鬼の安宅船（大きな軍船。矢倉と旗）
function ataka() {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(7, 2, 22), DARK); hull.position.y = 0.6; g.add(hull);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(6.4, 2.2, 15), WOOD); deck.position.y = 2.6; g.add(deck);
  const top = new THREE.Mesh(new THREE.BoxGeometry(4, 1.8, 5), WOOD); top.position.set(0, 4.6, -2); g.add(top);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.3, 5.8), DARK); roof.position.set(0, 5.6, -2); g.add(roof);
  for (const m of g.children) { m.castShadow = true; m.userData.camBlock = true; }
  return g;
}

const nagashima = {
  spawn: { x: 6, z: 12, heading: Math.PI },
  world: {
    seed: 1574,
    time: 'after',
    muddy: 0.7,
    waterSlow: true,   // 川・水路が本当に足を遅くする（terrain_tags.js の 'water' タグ。「敵の強さは水」）
    paths: [[[0, 150], [0, 40], [0, BANK_Z + 6]]],
    height,
    tint(x, z, h, c) {
      // 葦の生えた川べりと、島の泥
      if (z < BANK_Z + 2 && z > -48) c.lerp({ r: 0.4, g: 0.42, b: 0.3 }, 0.4);
    },
    clear: (x, z) => (Math.abs(x) < 110 && z > -100 && z < 50),
    streams: [
      { pts: [[-240, CH_Z + 4], [-100, CH_Z], [0, CH_Z], [100, CH_Z - 2], [240, CH_Z + 6]], w: 13, depth: 1.1 },
      { pts: [[-240, -118], [-60, -114], [60, -116], [240, -110]], w: 16, depth: 1.3 },
      { pts: [[-58, CH_Z], [-66, -74], [-60, -114]], w: 9, depth: 1 },
      { pts: [[60, CH_Z - 2], [70, -74], [62, -116]], w: 9, depth: 1 },
    ],
    // 輪中の外の田
    paddy(x, z) {
      if (z < 30 || z > 180 || Math.abs(x) < 34) return 0;
      if ((Math.floor(x / 14) + Math.floor(z / 12)) % 3 === 1) return 0;
      const ex = Math.min(((x % 14) + 14) % 14, 14 - ((x % 14) + 14) % 14), ez = Math.min(((z % 12) + 12) % 12, 12 - ((z % 12) + 12) % 12);
      return Math.max(0, Math.min(1, (Math.min(ex, ez) - 0.8) / 0.6)) * 0.85;
    },
    trees: 200,
    tufts: 6000,
    treeDensity: (x, z) => (z > -110 && z < 60 ? 0.08 : 0.5),
    groves: [{ x: -90, z: 30, r: 12, n: 14 }, { x: 96, z: 40, r: 12, n: 12 }],
    fleeOut: (x, z, team) => team === 1 && (z < -60 || Math.abs(x) > 140),
  },

  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    F.step = 0; F.ek = 0; F.ak = 0; F.built = 0;
    namuTex();
    // ---- 中江の砦（島の上）：土塁の上の柵と小屋・櫓 ----
    const noT = (segs) => { for (const s of segs) { s.noTarget = true; s.wall = true; } return segs; };
    // 虎口は中央 (0,-52) に来るよう、隙間を2区画に広げる（元は -10〜-5 に寄っていて、中央は柵にぶつかって詰まっていた）
    F.fwall = noT(wallLine(rt, [[-30, -56], [-10, -52], [10, -52], [30, -56]], { team: 1, hp: 1e9, name: '柵', segLen: 5, gaps: [4, 5] }));
    for (const [x, z, r] of [[-16, -68, 0.1], [14, -72, -0.2], [26, -64, 0.3], [-8, -96, 0], [16, -94, 0.2], [-24, -84, -0.2]]) rt.scene.add(hut(W, x, z, 7, 5, r, { wall: 0x6a5a44 }));
    rt.scene.add(yagura(W, -20, -60), yagura(W, 20, -60));
    for (const [x, z] of [[-26, -60], [-4, -58], [14, -58], [30, -62]]) rt.scene.add(nobori(W, x, z, 'namu', 6.5));
    // 焼き討ち（attachFireSpread）で本当に燃え移る蔵・小屋（castles/nagashima.js の縄張りの内）
    F.kuraStruct = rt.army.addStruct({ x: -8, z: -96, r: 4, solidR: 4, hp: 180, maxHp: 180, armor: 0, team: 1, name: '中江の砦の蔵', moraleOnBurn: 'big', flammable: true });
    F.kuraStruct2 = rt.army.addStruct({ x: 16, z: -94, r: 4, solidR: 4, hp: 150, maxHp: 150, armor: 0, team: 1, name: '中江の砦の小屋', moraleOnBurn: 'small', flammable: true });
    // ---- 屋長島の砦（castles/nagashima.js の YANAGASHIMA。中江のほかにもう一つの輪中の砦） ----
    for (const [dx, dz, r] of [[-5, -5, 0.1], [5, -3, -0.1]]) rt.scene.add(hut(W, YANAGASHIMA.x + dx, YANAGASHIMA.z + dz, 6, 4, r, { wall: 0x6a5a44 }));
    rt.scene.add(yagura(W, YANAGASHIMA.x, YANAGASHIMA.z - 8));
    for (const [dx, dz] of [[-4, -2], [4, -2]]) rt.scene.add(nobori(W, YANAGASHIMA.x + dx, YANAGASHIMA.z + dz, 'namu', 6));
    W.addDistantArmy({ x: YANAGASHIMA.x, z: YANAGASHIMA.z - 4, w: 8, d: 6, count: 40, facing: 0, armor: IKKO.armor, flagTex: flagTexture('namu'), seed: 15747 });
    F.yanaStruct = rt.army.addStruct({ x: YANAGASHIMA.x, z: YANAGASHIMA.z, r: 4, solidR: 4, hp: 160, maxHp: 160, armor: 0, team: 1, name: '屋長島の砦', moraleOnBurn: 'big', flammable: true });
    // ---- 願証寺の寺内町（中江の砦とは別の、宗教の中心。本堂・門・門徒屋敷・倉・船着場。大天守は無い） ----
    rt.scene.add(dou(W, GANSHO.x, GANSHO.z, 11, 8, 0, { wall: 0x5a3e2a }));
    rt.scene.add(romon(W, GANSHO.x, GANSHO.z + 11, 5.2, 0));
    rt.scene.add(village(W, GANSHO.x - 18, GANSHO.z + 2, { n: 9, r: 15, rot: 0.2, seed: 15748 }));
    for (const [dx, dz, r] of [[12, -2, 0.15], [10, 6, -0.1]]) rt.scene.add(hut(W, GANSHO.x + dx, GANSHO.z + dz, 5, 4, r, { wall: 0x7a6a50 }));   // 僧坊・倉
    for (const [dx, dz] of [[-4, 13], [4, 13]]) rt.scene.add(nobori(W, GANSHO.x + dx, GANSHO.z + dz, 'namu', 6));
    // 船着場（島の北の水路ぎわ）と舟
    const dockZ = -112;
    rt.scene.add(tawara(W, GANSHO.x + 6, GANSHO.z - 18, 0.2, 4));
    for (const [dx, rot] of [[-6, 0.1], [4, -0.15]]) { const kb = kobune(GANSHO.x + dx, W.heightAt(GANSHO.x + dx, dockZ) - 0.3, dockZ, rot, 6.5); rt.scene.add(kb); }
    F.ganshoStruct = rt.army.addStruct({ x: GANSHO.x, z: GANSHO.z, r: 5, solidR: 5, hp: 220, maxHp: 220, armor: 0, team: 1, name: '願証寺の本堂', moraleOnBurn: 'big', flammable: true });
    // ---- 砦群：願証寺一つを落とす戦にしない（遠景の軽い作り。河口近くの加路戸砦・堤の拠点・中洲の砦） ----
    rt.scene.add(hut(W, KARATO.x, KARATO.z, 6, 4, 0.1, { wall: 0x6a5a44 }), yagura(W, KARATO.x + 6, KARATO.z - 4));
    for (const [dx, dz] of [[-3, 5], [4, 4]]) rt.scene.add(nobori(W, KARATO.x + dx, KARATO.z + dz, 'namu', 6));
    W.addDistantArmy({ x: KARATO.x, z: KARATO.z - 4, w: 8, d: 6, count: 36, facing: 0, armor: IKKO.armor, flagTex: flagTexture('namu'), seed: 15749 });
    F.karatoStruct = rt.army.addStruct({ x: KARATO.x, z: KARATO.z, r: 4, solidR: 4, hp: 140, maxHp: 140, armor: 0, team: 1, name: '加路戸砦', moraleOnBurn: 'small', flammable: true });
    rt.scene.add(hut(W, TSUTSUMI.x, TSUTSUMI.z, 5, 4, -0.1, { wall: 0x6a5a44 }));
    for (const [dx, dz] of [[-3, 3]]) rt.scene.add(nobori(W, TSUTSUMI.x + dx, TSUTSUMI.z + dz, 'namu', 5.5));
    W.addDistantArmy({ x: TSUTSUMI.x, z: TSUTSUMI.z - 3, w: 6, d: 5, count: 24, facing: 0, armor: IKKO.armor, flagTex: flagTexture('namu'), seed: 15750 });
    F.tsutsumiStruct = rt.army.addStruct({ x: TSUTSUMI.x, z: TSUTSUMI.z, r: 3.5, solidR: 3.5, hp: 110, maxHp: 110, armor: 0, team: 1, name: '堤の拠点', moraleOnBurn: 'small', flammable: true });
    rt.scene.add(hut(W, NAKASU.x, NAKASU.z, 5, 4, 0.15, { wall: 0x6a5a44 }), yagura(W, NAKASU.x - 4, NAKASU.z + 3));
    for (const [dx, dz] of [[3, -3]]) rt.scene.add(nobori(W, NAKASU.x + dx, NAKASU.z + dz, 'namu', 5.5));
    W.addDistantArmy({ x: NAKASU.x, z: NAKASU.z - 3, w: 6, d: 5, count: 24, facing: 0, armor: IKKO.armor, flagTex: flagTexture('namu'), seed: 15751 });
    F.nakasuStruct = rt.army.addStruct({ x: NAKASU.x, z: NAKASU.z, r: 3.5, solidR: 3.5, hp: 110, maxHp: 110, armor: 0, team: 1, name: '中洲の砦', moraleOnBurn: 'small', flammable: true });
    F.FS = attachFireSpread(rt, {});
    // 砦の奥の陣所：長島の門徒を率いる下間頼旦と旗本、後ろに門徒の控え
    F.ikkoCamp = camp(rt, { x: 0, z: -80, facing: 0, team: 1, faction: 'saito', mon: 'namu', armor: IKKO.armor, general: { name: '下間頼旦', hat: 'hachimaki', haori: 0x4a4236 }, guard: 15, reserve: 0, runTo: { x: 0, z: -58 } });
    W.addDistantArmy({ x: 18, z: -82, w: 10, d: 8, count: 60, facing: 0, armor: IKKO.armor, flagTex: flagTexture('namu'), seed: 15745 });
    W.addDistantArmy({ x: -14, z: -78, w: 8, d: 6, count: 36, facing: 0, armor: IKKO.armor, flagTex: flagTexture('namu'), seed: 15746 });
    // ---- こちらの岸：織田の陣（信長と旗本。後ろの大軍が控え） ----
    F.odaCamp = camp(rt, { x: 0, z: 44, facing: Math.PI, team: 0, faction: 'oda', mon: 'oda', general: { name: '織田信長' }, guard: 18, reserve: 260, runTo: { x: 0, z: BANK_Z + 8 } });
    rt.scene.add(tawara(W, -14, 30, 0.3, 6));
    for (const [x, z, k] of [[-8, 34, 'oda'], [8, 34, 'eiraku'], [-40, BANK_Z + 10, 'oda'], [40, BANK_Z + 10, 'oda']]) rt.scene.add(nobori(W, x, z, k, 6));
    for (const s of SPOTS) rt.scene.add(tawara(W, s.x + 4, s.z + 8, 0.2, 2));
    // 九鬼の船団（東の川筋・海の封鎖）：川口をふさぎ、ゆっくり動きながら遠くの射撃を見せる
    F.ship = ataka();
    F.ship.position.set(84, W.heightAt(84, CH_Z) - 0.9, CH_Z - 2);
    F.ship.rotation.y = Math.PI / 2 + 0.1;
    rt.scene.add(F.ship);
    const sn = nobori(W, 84, CH_Z - 2, 'oda', 5); sn.position.y = F.ship.position.y + 5.6; rt.scene.add(sn);
    F.ships = [{ m: F.ship, x0: 60, x1: 110, z: CH_Z - 2, x: 84, dir: 1, speed: 0.6, t: 4 }];
    for (const [x0, x1, z, sp] of [[118, 170, CH_Z + 4, 0.5], [40, 76, CH_Z - 16, 0.45]]) {
      const m2 = ataka();
      const x = (x0 + x1) / 2;
      m2.position.set(x, W.heightAt(x, z) - 0.9, z);
      m2.rotation.y = Math.PI / 2 + 0.1;
      rt.scene.add(m2);
      const sn2 = nobori(W, x, z, 'oda', 5); sn2.position.y = m2.position.y + 5.6; rt.scene.add(sn2);
      F.ships.push({ m: m2, x0, x1, z, x, dir: 1, speed: sp, t: 3 + Math.random() * 3 });
    }
    // ---- 柴田勝家の手（自分の持ち場）と、柵を結う者 ----
    F.shiba = allyGroup(rt, { name: '柴田勝家の手', anchor: { x: 0, z: BANK_Z + 8 }, facing: Math.PI, width: 16, aggro: 10, noRout: true, formation: 'yari' },
      dress([{ type: 'busho', n: 1, o: { name: '柴田勝家', invuln: true, hat: 'kabuto_m', haori: 0x3a2a1a } }, { type: 'ashigaru', n: 16 }, { type: 'bow', n: 4 }], ODA));
    F.shibaU = F.shiba.units[0];
    F.teppo = allyGroup(rt, { name: '織田の鉄砲衆', anchor: { x: 34, z: BANK_Z + 6 }, facing: Math.PI, width: 10, aggro: 36, noRout: true },
      dress([{ type: 'samurai', n: 1, o: { name: '織田信広', invuln: true } }, { type: 'gun', n: 12 }], ODA));
    rt.after(3, () => rt.say('織田信広', '一揆勢は舟でも渡ってくる。柵の外を見張れ', 3));
    F.oda = [F.shiba, F.teppo];
    for (const g of F.oda) { g.defMult = 1.25; g.dmgMult = 0.85; }
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: -10, z: BANK_Z + 12 }, Math.PI, [{ kind: 'spear', n }]);
    // ---- 大軍（軽い作り）：輪中を囲む織田勢 ----
    const DA = (x, z, w, d, count, facing, armor, flag, seed) => W.addDistantArmy({ x, z, w, d, count, facing, armor, flagTex: flagTexture(flag), seed });
    DA(-90, 0, 40, 12, 260, Math.PI, 0x2b3140, 'oda', 15741);
    DA(96, 4, 40, 12, 260, Math.PI, 0x2b3140, 'eiraku', 15742);
    DA(0, 80, 60, 14, 300, Math.PI, 0x2b3140, 'oda', 15743);
    DA(-150, -150, 40, 12, 200, Math.PI * 0.25, 0x2b3140, 'oda', 15744);
    for (const [x, z] of [[-24, 50], [24, 52]]) { rt.scene.add(campfire(W, x, z)); W.addFire(x, z); }

    rt.world.setTime('after');
    rt.setPhase('brief');
    rt.obj('main', hi(rt) ? '柴田勝家の手の、岸の持ち場の一手を預かれ' : '柴田勝家のもとで、下知を待て', 'main');
    rt.say('柴田勝家', `${nm(rt)}、川の向こうが中江の砦じゃ。一揆の門徒が、島に籠もって二月になる`, 4.5);
    rt.say('柴田勝家', '兵糧はもう尽きかけておる。岸に柵を結い、一人も島から出すな。舟も入れるな', 4.5);
    rt.marker('shiba', unitPos(F.shibaU), '柴田勝家', {});
    rt.after(15, () => this.build(rt));
  },

  // ① 柵を結う
  build(rt) {
    const F = rt.flags;
    if (F.step >= 1) return;
    F.step = 1; F.stepT = rt.t;
    rt.setPhase('build');
    rt.unmark('shiba');
    rt.obj('main', rt.G.lord ? `足軽に岸の柵を結わせ、打って出る門徒に備えよ（${SPOTS.length}か所）` : `岸の三か所に柵を結え（${SPOTS.length}か所）`, 'main');
    rt.say('柴田勝家', '杭と縄はそこにある。印の所に柵を結え！', 3);
    // 信長で遊ぶ時：柵は足軽が結う（手柄にはしない）。当主は岸で門徒に備える
    if (rt.G.lord) { F.helped = true; SPOTS.forEach((s, i) => rt.after(5 + i * 4, () => { if (F.step === 1 && F.built < SPOTS.length) this.raise(rt, i); })); }
    else SPOTS.forEach((s, i) => {
      rt.marker('s' + i, s, '柵を結う', { h: 2 });
      rt.zone('s' + i, s.x, s.z + 2, 3);
      rt.addInteract('s' + i, { x: s.x, z: s.z + 2 }, '柵を結う', () => this.raise(rt, i), { r: 3.4, hold: 2.2 });
    });
    // 砦から門徒が川を渡って打って出る
    rt.after(20, () => {
      if (F.step !== 1) return;
      F.sortie = enemyGroup(rt, { faction: 'saito', name: '川を渡る門徒', anchor: { x: -10, z: -48 }, facing: 0, order: 'attack', seekRange: 60, aggro: 14, width: 12, morale: 90, fleeDir: { x: 0, z: -1 }, dmgMult: 0.62 },
        dress([{ type: 'samurai', n: 1, o: { hat: 'hachimaki' } }, { type: 'ashigaru', n: 12 }], IKKO));
      rt.army.play('eshout', { x: 0, z: -44 }, 1.6);
      rt.say('一揆の門徒', '南無阿弥陀仏！　柵を結わせるな！', 3);
      rt.say('柴田勝家', '川を渡って来るぞ！　槍を揃えよ、岸で叩け！', 3);
      rt.marker('sortie', centerOf(F.sortie), () => `川を渡る門徒・${moraleWord(F.sortie.morale)}`, { red: true, group: F.sortie });
      F.shiba.order = 'hold'; F.shiba.anchor = { x: 0, z: BANK_Z + 2 }; F.shiba.aggro = 14;
    });
  },
  raise(rt, i) {
    const F = rt.flags;
    const s = SPOTS[i];
    rt.uninteract('s' + i); rt.unmark('s' + i); rt.unzone('s' + i);
    const segs = wallLine(rt, [[s.x - 7, s.z], [s.x + 7, s.z]], { team: 0, hp: 700, name: '柵', segLen: 5 });
    F.fence = [...(F.fence || []), ...segs];
    sfx('wood', 0.8);
    F.built++;
    if (F.helped) return;   // 足軽が代わりに結った分は手柄にしない
    rt.award((t) => { t.special = { label: '岸に柵を結った', pts: 4 * F.built }; }, '柵を結った');
    if (F.built >= SPOTS.length) rt.objDone('main');
    else rt.objProgress('main', `${F.built}／${SPOTS.length}`);
  },

  // ② 一揆の舟が岸に着く
  boats(rt) {
    const F = rt.flags;
    if (F.step >= 2) return;
    F.step = 2; F.stepT = rt.t;
    rt.setPhase('boats');
    rt.unmark('sortie');
    for (let i = 0; i < SPOTS.length; i++) { rt.uninteract('s' + i); rt.unmark('s' + i); rt.unzone('s' + i); }
    if (F.sortie && !gone(F.sortie)) F.sortie.morale = Math.min(F.sortie.morale, 15);
    rt.world.setTime('dusk');
    rt.banner('夕暮れ', '島へ兵糧を運ぼうとする一揆の舟が、川を下ってくる');
    rt.obj('main', '岸に着いた一揆の舟の者を退けよ', 'main');
    rt.say('柴田勝家', '西から舟じゃ！　九鬼の船の目をかすめて来おった。岸に上げるな！', 4);
    F.boats = [];
    this.launch(rt, -120, -44, 2);
    rt.after(24, () => { if (F.step === 2 && F.boats.length < 2) this.launch(rt, 130, 42, -1); });
  },
  // 舟を一艘、川筋に沿って動かし、岸に着いたら兵を上げる
  launch(rt, x0, xLand, dir) {
    const F = rt.flags;
    const m = boat();
    m.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    rt.scene.add(m);
    F.boats.push({ m, x: x0, xLand, dir: Math.sign(xLand - x0), landed: false });
    rt.bark(dir > 0 ? '西の川筋に舟が見える！' : '東の川筋からも舟が来る！');
  },
  land(rt, bt) {
    const F = rt.flags;
    bt.landed = true;
    const g = enemyGroup(rt, { faction: 'saito', name: '舟から上がった一揆勢', anchor: { x: bt.xLand, z: CH_Z + 8 }, facing: 0, order: 'attack', seekRange: 70, aggro: 14, width: 8, morale: 88, fleeDir: { x: 0, z: -1 }, dmgMult: 0.62 },
      dress([{ type: 'samurai', n: 1, o: { hat: 'hachimaki' } }, { type: 'ashigaru', n: 9 }, { type: 'gun', n: 2 }], IKKO));
    for (const u of g.units) if (u.type === 'gun') u.dmg *= 0.45;
    KIT.backOf(rt, g, { flag: 'namu', armor: IKKO.armor, kind: 'spear', w: 18, depth: 10, count: 160, seed: 15741 + (F.landers || []).length });
    F.landers = [...(F.landers || []), g];
    const k = F.landers.length;
    rt.army.play('eshout', { x: bt.xLand, z: CH_Z + 6 }, 1.5);
    rt.marker('l' + k, centerOf(g), () => `舟から上がった一揆勢・${moraleWord(g.morale)}`, { red: true, group: g });
  },

  // ②の後の段：葦原に潜った舟の者・川を渡る門徒の群れ・東の陣の囲み → ③へ
  midA(rt) {
    const F = rt.flags;
    if (F.step >= 2.5) return;
    F.step = 2.5;
    for (let k = 1; k <= (F.landers || []).length; k++) rt.unmark('l' + k);
    for (const q of F.landers || []) if (!gone(q)) { q.noRout = false; q.morale = Math.min(q.morale, 15); }
    rt.award((t) => t.side.push('一揆の舟を岸に上げなかった'), '舟の者を退けた');
    F.boatsDone = true;
    for (const bt of F.boats || []) if (!bt.landed) bt.m.visible = false;   // 着かなかった舟は闇に消える（川の上で止まったままにしない）
    // 岸の左右いっぱいに、川を渡ろうとする門徒の群れと、織田の手が岸で押し合う（軽い作り）
    F.lines = lines(rt, [
      { x: -70, z: CH_Z + 6, facing: Math.PI, w: 50, seed: 15742, A: ['oda', 0x2b3140, 420, 'oda'], B: ['namu', IKKO.armor, 620, 'saito'], gunsA: true, surge: { every: 45, count: 160, flank: 0.2 } },
      { x: 72, z: CH_Z + 6, facing: Math.PI, w: 50, seed: 15743, A: ['oda', 0x2b3140, 420, 'oda'], B: ['namu', IKKO.armor, 600, 'saito'], surge: { every: 50, count: 150, flank: 0.2 } },
    ]);
    F.lines.forEach((c, i) => rt.after(2 + i * 2, () => c.go()));
    depthStart(rt, ngCtx(rt), ngA(), () => this.lastSally(rt));
  },
  // ③の後の段：一門の陣へ斬り込む門徒 → 勝ち
  midB(rt) {
    const F = rt.flags;
    if (F.step >= 3.5) return;
    F.step = 3.5;
    for (let k = 1; k <= 3; k++) rt.unmark('x' + k);
    for (const q of F.last || []) if (!gone(q)) { q.noRout = false; q.morale = Math.min(q.morale, 15); }
    rt.award((t) => t.side.push('打って出た門徒を柵の前で受け止めた'), '門徒を受け止めた');
    depthStart(rt, ngCtx(rt), ngB(), () => this.win(rt));
  },

  // ③ 夜、砦から決死の門徒
  lastSally(rt) {
    const F = rt.flags;
    if (F.step >= 3) return;
    F.step = 3; F.stepT = rt.t;
    rt.setPhase('sally');
    for (let k = 1; k <= (F.landers || []).length; k++) rt.unmark('l' + k);
    for (const q of F.landers || []) if (!gone(q)) q.morale = Math.min(q.morale, 15);
    if (!F.boatsDone) rt.award((t) => t.side.push('一揆の舟を岸に上げなかった'), '舟の者を退けた');
    applyLook(rt, NIGHT);
    rt.banner('夜更け', '兵糧の尽きた砦から、門徒が死に物狂いで打って出る');
    rt.obj('main', hi(rt) ? '持ち場の柵を守り、打って出た門徒を受け止めよ' : '柵の前で、打って出た門徒を受け止めよ', 'main');
    rt.say('柴田勝家', '来るぞ……！　あの者らは、もう退く所がない。気を抜くな', 4);
    F.last = [];
    const mk = (x, name, n) => {
      const g = enemyGroup(rt, { faction: 'saito', name, anchor: { x, z: -48 }, facing: 0, order: 'attack', seekRange: 90, aggro: 16, width: 14, morale: 100, fleeDir: { x: 0, z: -1 }, dmgMult: 0.6 },
        dress([{ type: 'samurai', n: 2, o: { hat: 'hachimaki' } }, { type: 'ashigaru', n }], IKKO));
      KIT.backOf(rt, g, { flag: 'namu', armor: IKKO.armor, kind: 'spear', w: 22, depth: 12, count: 260, seed: 15744 + F.last.length });
      F.last.push(g);
      rt.marker('x' + F.last.length, centerOf(g), () => `${name}・${moraleWord(g.morale)}`, { red: true, group: g });
      return g;
    };
    rt.after(6, () => { mk(-14, '打って出た門徒', 16); rt.army.play('eshout', { x: -14, z: -44 }, 1.8); rt.say('一揆の門徒', '進まば往生極楽、退かば無間地獄！', 3.5); });
    rt.after(36, () => { if (!F.ending) { mk(18, '門徒の新手', 14); rt.army.play('eshout', { x: 18, z: -44 }, 1.6); } });
    rt.after(72, () => { if (!F.ending) { mk(-30, '最後の門徒', 14); rt.army.play('eshout', { x: -30, z: -44 }, 1.8); rt.say('足軽', '……まだ来る。鎧もつけておらぬ者ばかりじゃ', 3.5); } });
    for (const [g, x] of [[F.shiba, 0], [F.teppo, 30]]) { g.order = 'hold'; g.anchor = { x, z: BANK_Z + 3 }; g.aggro = 14; }
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    for (let k = 1; k <= 3; k++) rt.unmark('x' + k);
    for (const q of F.last || []) if (!gone(q)) { q.noRout = false; q.morale = 0; }
    for (const c of F.lines || []) c.rout('B', { from: 0, hideAfter: 20, minFight: 0 });
    rt.objDone('main');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '岸の柵を守り切った', pts: 20 }; }, '任務達成・岸の柵を守り切った');
    // ---- 降伏の交渉：門徒の使いが白旗で柴田の陣へ下るが、聞き届けられない ----
    const W = rt.world;
    const env = enemyGroup(rt, { faction: 'saito', name: '長島の使い', anchor: { x: 0, z: GANSHO.z + 6 }, facing: Math.PI, order: 'move', aggro: 0, width: 3, morale: 100, noRout: true, dmgMult: 0 },
      dress([{ type: 'samurai', n: 1, o: { name: '長島の使い', hat: 'hachimaki' } }, { type: 'ashigaru', n: 1 }], IKKO));
    for (const u of env.units) { u.noTarget = true; u.dmg = 0; }
    env.dest = { x: 0, z: BANK_Z + 2 }; env.speed = 1.8;
    rt.after(1, () => { if (!rt.player.lock) rt.player.cine = { x: 0, z: BANK_Z, t: 2.5 }; });
    rt.say('伝令', '降伏を乞う使いが参っております……が、信長公はお聞き届けにならぬと', 4.5);
    rt.after(5, () => { rt.say('柴田勝家', 'お許しは出ぬ。……下がらせよ', 3.5); env.order = 'move'; env.dest = { x: 0, z: GANSHO.z + 10 }; });
    // ---- 脱出：寺内の舟が川下（海）へ逃げようとするが、九鬼の船団が川口をふさいで止める ----
    rt.after(7, () => {
      rt.banner('寺内の舟、逃れんとす', '寺内の者が舟に取りつき、川下へ逃れようとする');
      rt.say('足軽', '舟が出ます……！　川口は九鬼の船がふさいでおります', 4);
      const kb = []; for (const [dx, rot] of [[-5, 0.2], [3, -0.15], [9, 0.3]]) kb.push(kobune(GANSHO.x + dx, W.heightAt(GANSHO.x + dx, -112) - 0.3, -112, rot, 6.5));
      for (const m of kb) rt.scene.add(m);
      const steps = 10;
      for (let i = 1; i <= steps; i++) {
        rt.after(i * 0.5, () => {
          for (const m of kb) { m.position.x += 6; m.position.z += 0.6; }
          if (i === steps) {
            for (const sh of F.ships || []) { rt.army.play('gun', { x: sh.x, z: sh.z }, 0.9); rt.army.smoke(sh.x - 3, sh.m.position.y + 4, sh.z, -1, 0, 1.4); }
            rt.after(0.6, () => { for (const m of kb) m.visible = false; rt.bark('舟は川口を越えられなかった'); });
          }
        });
      }
    });
    // 砦に火がかけられる（attachFireSpread。蔵・小屋から本当に燃え移る。民を的にはしない＝火と煙だけ見せ、討つ対象にはしない）
    rt.after(12, () => {
      for (const [x, z] of [[-14, -70], [8, -74], [26, -68], [-6, -88], [GANSHO.x, GANSHO.z], [KARATO.x, KARATO.z], [TSUTSUMI.x, TSUTSUMI.z], [NAKASU.x, NAKASU.z]]) { W.addFire(x, z, { h: 1.6 }); W.addSmokeColumn(x, W.heightAt(x, z) + 6, z, { size: 3 }); }
      for (const s of [F.kuraStruct, F.kuraStruct2, F.yanaStruct, F.ganshoStruct, F.karatoStruct, F.tsutsumiStruct, F.nakasuStruct]) if (s && s.alive) rt.army.igniteStruct(s, { x: s.x, z: s.z });
      rt.banner('中江の砦に火', '信長の下知で、砦々と願証寺のまわりに柵が結われ、火がかけられた');
      rt.say('伝令', '……舟で逃れようとした者も、川口で止められたと。寺内には、まだ多くの女子供が残っております', 4.5);
      rt.say('柴田勝家', '……見よ。これが、この戦の終わりじゃ', 4);
      rt.after(5, () => rt.say('柴田勝家', `${nm(rt)}、目をそらすな。……だが、忘れてもよい。忘れられるものならな`, 5));
    });
    rt.player.u.invuln = true;
    rt.finish({}, 20);
  },

  update(rt, dt) {
    const F = rt.flags;
    KIT.backTick(rt);
    if (F.FS) F.FS.tick(dt);
    // 近寄って目を覚ました控えの兵は、当たりを弱める（大軍に呑まれて倒れ続けないように。一揆・地侍の雑兵は具足も槍も粗い）
    if ((F.wkT = (F.wkT || 0) - dt) <= 0) { F.wkT = 0.5; for (const g of rt.army.groups) if (g.woke && g.team === 1 && !g.wkDm) { g.wkDm = true; g.dmgMult = (g.dmgMult || 1) * 0.55; } }
    depthTick(rt, dt);
    // 崩れた隊の印は消す（古い印が「あちらじゃ」の行き先にならないように）
    for (const m of rt.markers.slice()) if (m.group && gone(m.group)) rt.unmark(m.id);
    // 九鬼の船団：川口を行き来し（海の封鎖）、ときどき遠くの射撃を見せる（F.ending の間も動かす）
    for (const sh of F.ships || []) {
      sh.x += sh.dir * sh.speed * dt;
      if (sh.x > sh.x1) { sh.x = sh.x1; sh.dir = -1; } else if (sh.x < sh.x0) { sh.x = sh.x0; sh.dir = 1; }
      sh.m.position.x = sh.x; sh.m.position.y = rt.world.heightAt(sh.x, sh.z) - 0.9;
      if ((sh.t -= dt) <= 0) {
        sh.t = 4 + Math.random() * 5;
        rt.army.play('gun', { x: sh.x, z: sh.z }, 0.6);
        rt.army.smoke(sh.x - 3, sh.m.position.y + 4, sh.z, -1, 0, 1.2);
      }
    }
    if (F.ending) return;
    if (F.step === 1) {
      const s = F.sortie;
      if (s) rt.objProgress('main', `${F.built}／${SPOTS.length}・門徒 ${gone(s) ? 0 : s.count}人`);
      if (s && s.count < 4 && !gone(s)) s.morale = Math.min(s.morale, 20);
      if (s) volleyWatch(rt, 'sortie', { guns: () => F.teppo, foes: () => [s], r: 40, who: '柴田勝家', line: '水から上がって足が止まった……鉄砲衆、放て！', sub: '岸の上から、織田の鉄砲衆' });
      // 結いに来ない時は、柴田が場所とやり方を言い、それでも来なければ足軽が残りを結う（待たせきりにしない）
      const w = rt.t - F.stepT;
      if (F.built < SPOTS.length && w > 50 && !F.nudge) { F.nudge = true; rt.say('柴田勝家', `${nm(rt)}、柵はまだか！　印の所に立って「柵を結う」を長く押せ。杭の俵がそこにある`, 4); }
      if (F.built < SPOTS.length && w > 85 && !F.nudge2) { F.nudge2 = true; rt.say('足軽', 'お頭、手が足りませぬ。残りは我らも手伝いまする', 3); }
      if ((F.built >= SPOTS.length && s && gone(s)) || w > 115) {
        if (F.built < SPOTS.length) { if (!F.built) rt.objFail('main'); else rt.objDone('main'); F.helped = true; rt.say('柴田勝家', '残りは足軽どもに結わせた。次じゃ', 3); for (let i = 0; i < SPOTS.length; i++) if (rt.interacts.some((q) => q.id === 's' + i)) this.raise(rt, i); }
        rt.after(3, () => this.boats(rt));
        F.step = 1.5;
      }
    }
    if (F.step === 2) {
      // 舟を動かす
      for (const bt of F.boats) {
        if (!bt.landed) {
          bt.x += bt.dir * 6 * dt;
          bt.m.position.set(bt.x, rt.world.heightAt(bt.x, CH_Z + 4) - 0.5, CH_Z + 4);
          if ((bt.dir > 0 && bt.x >= bt.xLand) || (bt.dir < 0 && bt.x <= bt.xLand)) this.land(rt, bt);
        }
      }
      const L = F.landers || [];
      // 一艘目の者を早く退けた時は、東の舟をすぐ見せる（岸で待つだけの間を作らない）
      if (F.boats.length < 2 && L.length && L.every(gone)) this.launch(rt, 100, 42, -1);
      rt.objProgress('main', `舟の者 ${L.reduce((s, q) => s + (gone(q) ? 0 : q.count), 0)}人`);
      for (const q of L) if (q.count < 4 && !gone(q)) q.morale = Math.min(q.morale, 20);
      if ((L.length >= 2 && L.every(gone)) || rt.t - F.stepT > 160) this.midA(rt);
    }
    if (F.step === 3) {
      const L = F.last || [];
      rt.objProgress('main', `門徒 ${L.reduce((s, q) => s + (gone(q) ? 0 : q.count), 0)}人`);
      for (const q of L) if (q.count < 5 && !gone(q)) q.morale = Math.min(q.morale, 20);
      if ((L.length >= 3 && L.every(gone)) || rt.t - F.stepT > 180) this.midB(rt);
    }
  },

  onKill(rt, v) {
    const F = rt.flags;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
  },
  onRout(rt, g) {
    if (g.team !== 1) return;
    rt.say('足軽', `${g.name}が川へ退いていく`, 2.5);
  },
  onStructDestroyed(rt, s) {
    if ((rt.flags.fence || []).includes(s)) { brokenWall(rt, s); rt.bark('柵が破られた！', true); }
  },
};

// ---------------- 夕暮れの岸と、夜の一門の陣の段 ----------------
const FEN = { x: 0, z: BANK_Z + 5 };        // 柵の内
const REED = { x: 64, z: -14 };             // 東の葦原
const SAND = { x: 40, z: -18 };             // 東の砂州
function ngCtx(rt) {
  const F = rt.flags;
  return { faction: 'saito', flag: 'namu', armor: IKKO.armor, dmg: 0.6, look: (l) => dress(l, IKKO), friends: () => [F.shiba].filter((g) => g && g.count), aid: { name: '柴田の手の一組', list: [uS(1), uA(8)] }, aidSaid: '柴田の手から一組が加わった' };
}
const mon = (o) => ({ hat: 'hachimaki', ...(o || {}) });
function ngA() {
  const R = round(FEN, Math.PI, 44);
  return [
    rest({ dur: 8, say: [['足軽', '舟の者の残りが、東の葦原へ潜った……'], ['柴田勝家', '日が落ちる。……砦の中で念仏が大きくなっておる']] }),
    pick({ title: '舟から上がった者の残りが、東の葦原に潜んだ。どうする？',
      options: [{ label: '葦原に斬り込み、潜んだ者を追い出す', note: '夜討ちの芽を摘めば手柄。葦の中は見通しが利かない' }, { label: '柵の内へ戻り、夜に備える', note: '柵を背に守れる。夜、葦原から背を突かれる' }],
      on: (rt, m, i) => { m.ngReed = i === 0; rt.say('柴田勝家', i === 0 ? '行け！　葦の中では槍を短く持て' : '柵の内へ戻れ。見張りを倍にせよ', 3); } }),
    fight({ skip: (rt, m) => !m.ngReed, at: REED, max: 150, title: '東の葦原', sub: '背丈より高い葦の中に、門徒が潜む', obj: (rt) => (hi(rt) ? '預かった一手で葦原に斬り込み、潜んだ門徒を追い出せ' : '東の葦原に潜んだ門徒を追い出せ'),
      foes: () => [{ name: '葦原に潜んだ門徒', from: { x: 90, z: -26 }, list: [uS(2, mon()), uA(12)], mass: 160 }],
      later: [
        { t: 30, title: '舟の鉄砲', sub: '川の舟から、鉄砲が並んで撃つ', say: ['足軽', '川の舟の上に鉄砲が並んだ……！'], foes: () => [gunLine('舟の上の鉄砲衆', { x: 70, z: -44 }, REED, 9, { off: { x: 4, z: -18 } })] },
        { t: 60, title: '囲まれる', sub: '葦の中から、四方に念仏が起こる', say: ['足軽', '後ろからも念仏が……囲まれておる！'], foes: () => [{ name: '後ろの葦の門徒', from: { x: 50, z: 14 }, list: [uS(1, mon()), uA(10)], mass: 140 }] },
      ],
      reward: (t) => { t.special = { label: '葦原に潜んだ門徒を追い出した', pts: 15 }; }, rewardLabel: '葦原の門徒を追い出した' }),
    hold({ at: FEN, dur: 90, r: 14, title: '川を渡る群れ', sub: '砦から、門徒の群れが川へ入る', label: '柵の内', obj: (rt) => (hi(rt) ? '持ち場の柵に一手を並べ、川を渡る門徒の群れを受け止めよ' : '柵の内で、川を渡ってくる門徒の群れを受け止めよ'),
      say: [['柴田勝家', '川を渡ってくるぞ！　水から上がる所を叩け！']],
      waves: [
        { t: 5, say: ['一揆の門徒', '南無阿弥陀仏……南無阿弥陀仏……！'], foes: () => [{ name: '川を渡る門徒の群れ', from: { x: 0, z: -56 }, list: [uS(2, mon()), uA(16)], mass: 300, noRout: 20 }] },
        { t: 35, say: ['足軽', '砦の堤に鉄砲が並んだ……伏せろ！'], foes: () => [gunLine('砦の堤の鉄砲衆', { x: -20, z: -56 }, FEN, 11, { off: { x: -14, z: -34 } })] },
        { t: 65, if: (rt, m) => !m.ngReed, say: ['足軽', '後ろじゃ！　葦原に潜んでおった者どもが！'], foes: () => [{ name: '葦原から出た門徒', from: { x: 60, z: 20 }, list: [uS(1, mon()), uA(12)], mass: 180 }] },
        { t: 80, say: ['柴田勝家', '西の川筋からも……！　背を合わせよ！'], foes: () => [{ name: '西から渡る門徒', from: R.left, list: [uS(1, mon()), uA(12)], mass: 180 }] },
      ],
      reward: '川を渡る群れを柵で受け止めた' }),
    // 砂州の鉄砲：舟で東の砂州に上がった鉄砲衆が、柵を横から撃つ
    rest({ dur: 6, heal: 0.25, say: [['足軽', '東の砂州で火縄の火が並んだ……柵を横から撃つ気じゃ'], ['柴田勝家', '九鬼の船は川下じゃ。呼べば来るが、間に合うか']] }),
    pick({ title: '舟で東の砂州に上がった門徒の鉄砲衆が、柵を横から撃ちかける。どうする？',
      options: [{ label: '砂州へ走り、鉄砲衆を潰す', note: '鉄砲衆を討てば手柄。撃たれながら、ぬかるみを走る' }, { label: '九鬼の船を呼び、柵の陰で耐える', note: '船の大鉄砲が砂州を撃つ。それまで柵の陰で寄せを受ける' }],
      on: (rt, m, i) => { m.ngSand = i === 0; rt.say('柴田勝家', i === 0 ? '走れ！　鉄砲は一度放てば、込め直す間は撃てぬ。放った後に詰めよ' : 'よし、狼煙を上げよ！　船が来るまで、柵の陰から出るな', 3.5); } }),
    fight({ skip: (rt, m) => !m.ngSand, at: SAND, max: 130, title: '東の砂州', sub: 'ぬかるみの砂州に、門徒の鉄砲衆が並ぶ',
      obj: (rt) => (hi(rt) ? '預かった一手で砂州へ走り、門徒の鉄砲衆を潰せ' : '東の砂州で、門徒の鉄砲衆を潰せ'),
      foes: () => [gunLine('砂州の門徒の鉄砲衆', { x: SAND.x + 18, z: SAND.z - 8 }, SAND, 9, { list: dress([uS(1, mon()), uG(9)], IKKO), mass: 80 }), { name: '鉄砲衆を守る門徒', from: { x: SAND.x + 24, z: SAND.z + 4 }, list: [uS(1, mon()), uA(12)], mass: 160 }],
      later: [{ t: 40, title: '舟の新手', sub: '川から、舟で門徒が上がってくる', say: ['足軽', '舟がもう一艘……！　砂州に着いたぞ'], foes: () => [{ name: '舟から上がった門徒', from: { x: SAND.x + 10, z: SAND.z - 14 }, list: [uS(1, mon()), uA(12)], mass: 140 }] }],
      reward: (t) => { t.special = { label: '砂州の鉄砲衆を潰した', pts: 15 }; }, rewardLabel: '砂州の鉄砲衆を潰した' }),
    hold({ skip: (rt, m) => m.ngSand, at: FEN, dur: 70, r: 14, title: '船を待つ', sub: '狼煙を見た九鬼の船が、川を上ってくる', label: '柵の内',
      obj: (rt) => (hi(rt) ? '預かった一手を柵の陰に伏せ、九鬼の船が来るまで寄せを受けよ' : '柵の陰で、九鬼の船が来るまで寄せを受けよ'),
      waves: [
        { t: 4, say: ['足軽', '砂州から撃ってくる……！　柵の陰へ！'], foes: () => [gunLine('砂州の門徒の鉄砲衆', { x: SAND.x + 18, z: SAND.z - 8 }, FEN, 9, { list: dress([uS(1, mon()), uG(9)], IKKO), mass: 80 })] },
        { t: 25, say: ['柴田勝家', '撃たせておいて、川から寄せる気か。槍を揃えよ！'], foes: () => [{ name: '撃たれる間に寄せる門徒', from: { x: 10, z: -52 }, list: [uS(2, mon()), uA(14)], mass: 220 }] },
        { t: 55, say: ['足軽', '九鬼の船じゃ！　大鉄砲が砂州を撃っておる！'], foes: (rt) => {
          const P = rt.flags.ship && rt.flags.ship.position;
          if (P) for (let k = 0; k < 3; k++) rt.after(k * 0.7, () => { rt.army.play('gun', { x: P.x, z: P.z }, 1); rt.army.smoke(P.x - 3, P.y + 4, P.z, -1, 0, 1.4); });
          for (const g of rt.army.groups) if (g.team === 1 && g.name === '砂州の門徒の鉄砲衆' && g.count) { g.noRout = false; g.morale = 0; }
          return [];
        } },
      ],
      reward: '九鬼の船が来るまで柵を守った' }),
  ];
}
function ngB() {
  const ICH = { x: -70, z: 6 };     // 西の一門の陣
  const R = round(ICH, -Math.PI / 2, 40);
  return [
    rest({ dur: 8, say: [['足軽', '……砦の方が静かになった'], ['柴田勝家', '静かな時が、一番恐ろしい']] }),
    pick({ title: '裸に刀一本の門徒の群れが、西の一門の陣へ斬り込んでいく。どうする？',
      pre: (rt) => { rt.army.play('eshout', ICH, 2); rt.say('伝令', '西の御一門の陣へ、門徒が死に物狂いで斬り込みました！', 3.5); },
      options: [{ label: '西の一門の陣へ助けに走る', note: '一門の陣を守れば大手柄。死に物狂いの群れの真ん中へ入る' }, { label: '柵を守り、川を渡る者を止める', note: '柵は守れる。一門の陣は大きく討たれる' }],
      on: (rt, m, i) => { m.ngIchi = i === 0; rt.say('柴田勝家', i === 0 ? '走れ！　あの者らは死ぬ気じゃ。まともに受けるな、横から突け' : '柵を固めよ！　一人も渡すな', 3.5); } }),
    fight({ skip: (rt, m) => !m.ngIchi, at: ICH, max: 170, title: '一門の陣', sub: '鎧もつけぬ門徒が、陣幕を斬り裂いてなだれ込む', obj: (rt) => (hi(rt) ? '預かった一手を率いて一門の陣へ走り、斬り込んだ門徒を崩せ' : '一門の陣へ斬り込んだ門徒の群れを崩せ'),
      foes: () => [{ name: '斬り込んだ門徒の群れ', from: R.front, list: [uS(3, mon()), uA(18)], mass: 320, noRout: 30, morale: 100 }],
      later: [
        { t: 30, title: '左右から', sub: '川筋を渡った門徒が、左右から', say: ['足軽', '左右からも……数が知れぬ！'], foes: () => [{ name: '左の門徒', from: R.left, list: [uS(1, mon()), uA(12)], mass: 180 }, { name: '右の門徒', from: R.right, list: [uS(1, mon()), uA(12)], mass: 180 }] },
        { t: 70, say: ['足軽', '砦の方で火縄の火が並んだ……！'], foes: () => [gunLine('川向こうの鉄砲衆', { x: -70, z: -40 }, ICH, 10, { off: { x: 0, z: -34 } })] },
      ],
      reward: (t) => { t.special = { label: '一門の陣へ斬り込んだ門徒を退けた', pts: 25 }; }, rewardLabel: '一門の陣を守った' }),
    hold({ skip: (rt, m) => m.ngIchi, at: FEN, dur: 85, r: 14, title: '柵の夜', sub: '西の陣の叫びが聞こえる。川を渡る者は絶えない', label: '柵の内', obj: (rt) => (hi(rt) ? '持ち場の柵を一手で固め、川を渡る門徒を止めよ' : '柵の内で、川を渡る門徒を止めよ'),
      waves: [
        { t: 5, say: ['足軽', '西の陣で叫びが……！　こちらにも来るぞ'], foes: () => [{ name: '川を渡る門徒', from: { x: -20, z: -56 }, list: [uS(2, mon()), uA(14)], mass: 260 }] },
        { t: 40, say: ['足軽', '西の陣を破った者どもが、柵の横へ回ってきた……！'], foes: () => [{ name: '西から回った門徒', from: { x: -64, z: -10 }, list: [uS(2, mon()), uA(12)], mass: 220 }] },
        { t: 70, say: ['足軽', '堤の鉄砲が火を吹くぞ！　頭を下げよ！'], foes: () => [gunLine('砦の堤の鉄砲衆', { x: 20, z: -56 }, FEN, 10, { off: { x: 14, z: -34 } })] },
      ],
      reward: '柵を守りぬいた', onEnd: (rt) => rt.say('伝令', '……西の御一門の陣で、多くの方が討たれたとのこと', 3.5) }),
  ];
}

// 両軍の総勢（織田 七万ほど。中江の砦の一揆勢 一万ほど。島々に籠もった人々は、女や子供を合わせて数万とも。数には諸説ある）
nagashima.force = (rt) => {
  const F = rt.flags;
  return { a: Math.round(70000 - (F.ak || 0) * 30), a0: 70000, b: Math.max(0, 10000 - (F.ek || 0) * 30), b0: 10000 };
};
nagashima.sides = { a: { name: '織田軍', mon: 'oda' }, b: { name: '長島の一揆勢', mon: 'namu' } };
nagashima.rts = true;
// 史実でこの戦にいた名のある武将（battle.js の placeFamous が、その家の隊に加える。敵は名乗り、討てば手柄）
nagashima.famous = [
  { name: '滝川一益', team: 0, g: /鉄砲/, loose: 1, line: '滝川一益じゃ。舟を寄せさせるな。撃て！' },
  { name: '織田信広', team: 0, mortal: 1, loose: 1, line: '織田信広じゃ。門徒の斬り込み、ここで止める！' },
];
nagashima.date = (rt) => `天正二年九月　秋・${rt.flags.step >= 3 ? '夜' : rt.flags.step >= 2 ? '夕暮れ' : '昼下がり'}`;
nagashima.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '柵の下知まで待つ' : '');
nagashima.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
nagashima.history = '伊勢の長島は、木曽川・長良川・揖斐川が海に注ぐ所の輪中の島々で、一向宗の願証寺を中心に門徒の力が強かった。石山本願寺の呼びかけで起った長島の一揆は、元亀元年に信長の弟・織田信興を討ち、その後の織田の攻めも二度退けた。天正二年（1574）七月、信長は陸と海から大軍で島々を囲み、九鬼嘉隆らの船で川と海を断って兵糧攻めにした。篠橋・大鳥居の砦が落ち、九月、長島の砦は降ったが、城を出る門徒に織田方が鉄砲を撃ちかけ、怒った門徒が斬り込んで、信長の兄の織田信広など多くの一門が討ち死にした。残る中江・屋長島の砦は柵で囲まれて火をかけられ、中にいた二万人ほどが焼け死んだと伝わる。この戦では、岸の柵を守る足軽の目から、その終わりを見ている。数には諸説ある。';
// 信長で遊ぶ時：居場所の目安（bot の目が始まりの位置を確かめる） と立つ所
nagashima.lordAt = { x: 0, z: 40, r: 12, why: '岸の後ろの織田の陣（信長は陸と海から長島を囲んだ）' };
nagashima.lordSpawn = { x: 0, z: 36, heading: Math.PI };

// 素直な遊び手：柵を結い、岸で門徒と戦い、舟から上がった者へ向かい、夜は柵の前で受け止める
nagashima.botBrain = (b, inp, { goTo }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyE');
  if (!u.alive || F.ending) return;
  // 段（b_depth.js）が動いている間は、そちらの的へ向かう
  if (F.dp && F.dp.on) { depthBot(b, inp, goTo); return; }
  if (u.hp < u.maxHp * 0.5) b.botRest = true;
  if (b.botRest && u.hp > u.maxHp * 0.85) b.botRest = false;
  if (b.botRest) { inp.guardHold = false; goTo(p, inp, 4, BANK_Z + 16, 2); return; }
  const e = b.army.nearestEnemy(u, F.step === 1 ? 8 : 13, (o) => !o.fleeing && o.pos.z > -46);
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d > 2.6) inp.k.add('KeyW');
    if (d < 3.2 && Math.random() < 0.5) inp.leftPressed = true;
    inp.guardHold = (b.army.threats || []).length > 0 && Math.random() < 0.85;
    return;
  }
  inp.guardHold = false;
  if (F.step === 1) {
    let it = null, bd = Infinity;
    for (const x of b.interacts) if (x.id.startsWith('s')) { const d = Math.hypot(x.pos.x - u.pos.x, x.pos.z - u.pos.z); if (d < bd) { bd = d; it = x; } }
    if (it) { if (bd > 1.6) goTo(p, inp, it.pos.x, it.pos.z, 1.2); else inp.k.add('KeyE'); return; }
    if (F.sortie && !gone(F.sortie)) { const c = F.sortie.center(); goTo(p, inp, c.x, Math.max(c.z, BANK_Z - 10), 2); return; }
  }
  if (F.step === 2) { const q = (F.landers || []).find((x) => !gone(x)); if (q) { const c = q.center(); goTo(p, inp, c.x, c.z, 2); return; } goTo(p, inp, 0, BANK_Z + 4, 2); return; }
  if (F.step === 3) { const q = (F.last || []).find((x) => !gone(x)); if (q) { const c = q.center(); if (c.z > -40) { goTo(p, inp, c.x, c.z, 2); return; } } goTo(p, inp, 4, BANK_Z + 3, 2); return; }
  goTo(p, inp, 6, BANK_Z + 8, 3);
};

export { nagashima };
