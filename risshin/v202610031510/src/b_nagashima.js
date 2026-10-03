// 長島一向一揆：包囲の柵 → 長島の降伏と退城 → 射撃後の反撃 → 中江・屋長島の包囲と火。
// 信長公記巻七・九月二十九日条を芯にする。舟と三川の寸法・局地の持ち場は遊び用の復元。
// 北（-z）は輪中、南（+z）は織田の岸、東（+x）は川口。史実の二か月余を終日の持ち場に縮める。
import * as THREE from 'three';
import { nobori, hut, yagura, campfire, tawara, dou, romon, village, kobune } from './props.js';
import { flagTexture } from './textures.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { moraleWord } from './hud.js';
import { gauss, enemyGroup, allyGroup, nm, centerOf, unitPos, wallLine, brokenWall, guardRecover, hpBarSystem, strengthBanner } from './bhelp.js';
import { dress, gone, volleyWatch } from './b_inabayama.js';
import { namuTex } from './b_nodafukushima.js';
import { KIT } from './b_nagashinojo.js';
// 新しい波を出す時だけ数える。武将と供の余地を残し、遠景は本物へ替えない。
function depthLook(rt, list, style) {
  KIT.freeRoom(rt, list.reduce((n, q) => n + q.n, 0));
  let room = 235;
  for (const u of rt.army.units) if (u.alive && !u.gone) room--;
  return dress(list.map((q) => {
    const n = Math.min(q.n, Math.max(0, room)); room -= n;
    return { ...q, n };
  }).filter((q) => q.n > 0), style);
}

import { depthStart, depthTick, hold, depthBot } from './b_depth.js';
import { uS, uA, lines, volleyAll, camp } from './b_mid.js';
import { attachFireSpread } from './siege_fire.js';
import { YANAGASHIMA } from './castles/nagashima.js';
import { makeKakoi } from './kakoi.js';
import { battleEvent, EVENT_MESSENGER, EVENT_VOLLEY, EVENT_REINFORCEMENT, EVENT_FIRE_START } from './battle_events.js';

// 足軽大将ほどの身分（信長で遊ぶ時は除く）：柴田の手の、岸の持ち場の一手を預かる
const hi = (rt) => !rt.G.lord && (rt.G.rank || 0) >= 3;

const CH_Z = -32;                          // 島の手前の川筋
const BANK_Z = -20;                        // こちらの岸（柵を結う所）
const FORT = { x: 0, z: -74 };             // 中江の砦
const GANSHO = { x: -44, z: -82 };         // 願証寺・寺内町（中江の砦とは別の、宗教の中心。軍事拠点と分ける）
const SPOTS = [{ x: -26, z: BANK_Z }, { x: 0, z: BANK_Z - 1 }, { x: 26, z: BANK_Z }];   // 柵を結う所
// 遠景の長島城と水路の拠点。正確な位置・寸法は不明なので、輪中の配置を遊び用に縮める。
const NAGASHIMA = { x: 70, z: -100 };          // 長島城（位置は遊び用の復元）
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
  h += 1.2 * gauss(x, z, YANAGASHIMA.x, YANAGASHIMA.z, 220); // 屋長島の低い輪中
  // 北西の養老の山並み
  h += 30 * gauss(x, z, -200, -200, 12000);
  return h;
}

// 船の材質は共用。船は段の始めだけ置き、毎コマは位置だけ動かす。
const WOOD = new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.95 });
const DARK = new THREE.MeshStandardMaterial({ color: 0x3a2e22, roughness: 0.95 });
// 九鬼の安宅船（大きな軍船。矢倉と旗）
const SHIP_GEOMETRY = [new THREE.BoxGeometry(7, 2, 22), new THREE.BoxGeometry(6.4, 2.2, 15), new THREE.BoxGeometry(4, 1.8, 5), new THREE.BoxGeometry(4.8, 0.3, 5.8)];
function ataka() {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(SHIP_GEOMETRY[0], DARK); hull.position.y = 0.6; g.add(hull);
  const deck = new THREE.Mesh(SHIP_GEOMETRY[1], WOOD); deck.position.y = 2.6; g.add(deck);
  const top = new THREE.Mesh(SHIP_GEOMETRY[2], WOOD); top.position.set(0, 4.6, -2); g.add(top);
  const roof = new THREE.Mesh(SHIP_GEOMETRY[3], DARK); roof.position.set(0, 5.6, -2); g.add(roof);
  for (const m of g.children) { m.castShadow = true; m.userData.camBlock = true; }
  return g;
}

const nagashima = {
  spawn: { x: 6, z: 12, heading: Math.PI },
  world: {
    seed: 1574,
    time: 'day',
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
    // 内部の史実札（HIST_A=根拠強い／HIST_B=推定復元／GAME_C=ゲーム補完）。表には出さない
    F.hist = { wajuu: 'HIST_A', kuki: 'HIST_A', surrender: 'HIST_A', counterattack: 'HIST_A', fire: 'HIST_A', forts: 'GAME_C', temple: 'HIST_B', sortie: 'GAME_C', localHold: 'GAME_C' };
    F.step = 0; F.ek = 0; F.ak = 0; F.built = 0;
    F.hpBars = hpBarSystem(rt);
    strengthBanner(rt, 70000, 10000);
    // 二か月余の兵糧攻め。舟の退城と補給を取り違えない。
    F.kakoi = makeKakoi({ day: 60, foodDays: 5, morale: 60 });
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
    noT(wallLine(rt, [[30, -54], [66, -54]], { team: 1, hp: 1e9, name: '屋長島の柵', segLen: 6, gaps: [2, 3] }));
    for (const [dx, dz, r] of [[-5, -5, 0.1], [5, -3, -0.1]]) rt.scene.add(hut(W, YANAGASHIMA.x + dx, YANAGASHIMA.z + dz, 6, 4, r, { wall: 0x6a5a44 }));
    rt.scene.add(yagura(W, YANAGASHIMA.x, YANAGASHIMA.z - 8));
    for (const [dx, dz] of [[-4, -2], [4, -2]]) rt.scene.add(nobori(W, YANAGASHIMA.x + dx, YANAGASHIMA.z + dz, 'namu', 6));
    W.addDistantArmy({ x: YANAGASHIMA.x, z: YANAGASHIMA.z - 4, w: 8, d: 6, count: 40, facing: 0, armor: IKKO.armor, team: 1, flagTex: flagTexture('namu'), seed: 15747 });
    F.yanaStruct = rt.army.addStruct({ x: YANAGASHIMA.x, z: YANAGASHIMA.z, r: 4, solidR: 4, hp: 160, maxHp: 160, armor: 0, team: 1, name: '屋長島の砦', moraleOnBurn: 'big', flammable: true });
    // ---- 願証寺の寺内町（中江の砦とは別の、宗教の中心。本堂・門・門徒屋敷・倉・船着場。大天守は無い） ----
    rt.scene.add(dou(W, GANSHO.x, GANSHO.z, 11, 8, 0, { wall: 0x5a3e2a }));
    rt.scene.add(romon(W, GANSHO.x, GANSHO.z + 11, 5.2, 0));
    rt.scene.add(village(W, GANSHO.x - 18, GANSHO.z + 2, { n: 9, r: 15, rot: 0.2, seed: 15748 }));
    for (const [dx, dz, r] of [[12, -2, 0.15], [10, 6, -0.1]]) rt.scene.add(hut(W, GANSHO.x + dx, GANSHO.z + dz, 5, 4, r, { wall: 0x7a6a50 }));   // 僧坊・倉
    for (const [dx, dz] of [[-4, 13], [4, 13]]) rt.scene.add(nobori(W, GANSHO.x + dx, GANSHO.z + dz, 'namu', 6));
    // 門前の市（床の低い小屋と俵の店。寺内町は門徒の暮らしの町で、長島城や屋長島の砦の軍事の曲輪とは分ける）
    for (const [dx, dz, r] of [[18, 10, 0.05], [24, 6, -0.1], [22, 14, 0.1]]) rt.scene.add(hut(W, GANSHO.x + dx, GANSHO.z + dz, 3.4, 2.6, r, { wall: 0x8a7a58, h: 2.0 }));
    for (const [dx, dz] of [[16, 5], [26, 11]]) rt.scene.add(tawara(W, GANSHO.x + dx, GANSHO.z + dz, 0.4, 3));
    // 船着場（島の北の水路ぎわ）と舟
    const dockZ = -112;
    rt.scene.add(tawara(W, GANSHO.x + 6, GANSHO.z - 18, 0.2, 4));
    for (const [dx, rot] of [[-6, 0.1], [4, -0.15]]) { const kb = kobune(GANSHO.x + dx, W.heightAt(GANSHO.x + dx, dockZ) - 0.3, dockZ, rot, 6.5); rt.scene.add(kb); }
    // こちらの水路の舟：開戦から川と舟が見える（輪中の水郷。A112）
    for (const [bx, rot] of [[-34, 1.5], [18, 1.7], [44, 1.45]]) rt.scene.add(kobune(bx, W.heightAt(bx, CH_Z + 1) - 0.3, CH_Z + 1, rot, 6.5));
    F.ganshoStruct = rt.army.addStruct({ x: GANSHO.x, z: GANSHO.z, r: 5, solidR: 5, hp: 220, maxHp: 220, armor: 0, team: 1, name: '願証寺の本堂', moraleOnBurn: 'big', flammable: true });
    // ---- 砦群：願証寺一つを落とす戦にしない（遠景の軽い作り。河口近くの長島城・堤の拠点・中洲の砦） ----
    rt.scene.add(hut(W, NAGASHIMA.x, NAGASHIMA.z, 6, 4, 0.1, { wall: 0x6a5a44 }), yagura(W, NAGASHIMA.x + 6, NAGASHIMA.z - 4));
    for (const [dx, dz] of [[-3, 5], [4, 4]]) rt.scene.add(nobori(W, NAGASHIMA.x + dx, NAGASHIMA.z + dz, 'namu', 6));
    W.addDistantArmy({ x: NAGASHIMA.x, z: NAGASHIMA.z - 4, w: 8, d: 6, count: 36, facing: 0, armor: IKKO.armor, team: 1, flagTex: flagTexture('namu'), seed: 15749 });
    F.karatoStruct = rt.army.addStruct({ x: NAGASHIMA.x, z: NAGASHIMA.z, r: 4, solidR: 4, hp: 140, maxHp: 140, armor: 0, team: 1, name: '長島城', moraleOnBurn: 'small', flammable: true });
    rt.scene.add(hut(W, TSUTSUMI.x, TSUTSUMI.z, 5, 4, -0.1, { wall: 0x6a5a44 }));
    for (const [dx, dz] of [[-3, 3]]) rt.scene.add(nobori(W, TSUTSUMI.x + dx, TSUTSUMI.z + dz, 'namu', 5.5));
    W.addDistantArmy({ x: TSUTSUMI.x, z: TSUTSUMI.z - 3, w: 6, d: 5, count: 24, facing: 0, armor: IKKO.armor, team: 1, flagTex: flagTexture('namu'), seed: 15750 });
    F.tsutsumiStruct = rt.army.addStruct({ x: TSUTSUMI.x, z: TSUTSUMI.z, r: 3.5, solidR: 3.5, hp: 110, maxHp: 110, armor: 0, team: 1, name: '堤の拠点', moraleOnBurn: 'small', flammable: true });
    rt.scene.add(hut(W, NAKASU.x, NAKASU.z, 5, 4, 0.15, { wall: 0x6a5a44 }), yagura(W, NAKASU.x - 4, NAKASU.z + 3));
    for (const [dx, dz] of [[3, -3]]) rt.scene.add(nobori(W, NAKASU.x + dx, NAKASU.z + dz, 'namu', 5.5));
    W.addDistantArmy({ x: NAKASU.x, z: NAKASU.z - 3, w: 6, d: 5, count: 24, facing: 0, armor: IKKO.armor, team: 1, flagTex: flagTexture('namu'), seed: 15751 });
    F.nakasuStruct = rt.army.addStruct({ x: NAKASU.x, z: NAKASU.z, r: 3.5, solidR: 3.5, hp: 110, maxHp: 110, armor: 0, team: 1, name: '中洲の砦', moraleOnBurn: 'small', flammable: true });
    F.FS = attachFireSpread(rt, {});
    // 砦の奥の陣所：長島の門徒を率いる下間頼旦と旗本、後ろに門徒の控え
    F.ikkoCamp = camp(rt, { x: 0, z: -80, facing: 0, team: 1, faction: 'saito', mon: 'namu', armor: IKKO.armor, general: { name: '下間頼旦', hat: 'hachimaki', haori: 0x4a4236 }, guard: 15, reserve: 0, runTo: { x: 0, z: -58 } });
    W.addDistantArmy({ x: 18, z: -82, w: 10, d: 8, count: 60, facing: 0, armor: IKKO.armor, team: 1, flagTex: flagTexture('namu'), seed: 15745 });
    W.addDistantArmy({ x: -14, z: -78, w: 8, d: 6, count: 36, facing: 0, armor: IKKO.armor, team: 1, flagTex: flagTexture('namu'), seed: 15746 });
    // ---- こちらの岸：織田の陣（信長と旗本。後ろの大軍が控え） ----
    // 岸の手前に構える織田の手（見た目だけ。起こさない）と、二月の籠城で中江の砦・願証寺から上がる炊ぎの煙（川向こうに人が籠もっている事を見せる）
    for (const [x, z, sd, k] of [[-30, -2, 15752, 'oda'], [36, 0, 15753, 'eiraku']]) W.addDistantArmy({ x, z, w: 16, d: 8, count: 100, facing: Math.PI, armor: 0x2b3140, team: 0, flagTex: flagTexture(k), seed: sd }).army.noWake = true;
    for (const [x, z, sz] of [[FORT.x + 6, FORT.z - 6, 1.8], [GANSHO.x, GANSHO.z, 2.2]]) W.addSmokeColumn(x, W.heightAt(x, z) + 3, z, { size: sz });
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
    F.ships = [{ m: F.ship, flag: sn, x0: 60, x1: 110, z: CH_Z - 2, x: 84, dir: 1, speed: 0.6, t: 4 }];
    for (const [x0, x1, z, sp] of [[118, 170, CH_Z + 4, 0.5], [40, 76, CH_Z - 16, 0.45]]) {
      const m2 = ataka();
      const x = (x0 + x1) / 2;
      m2.position.set(x, W.heightAt(x, z) - 0.9, z);
      m2.rotation.y = Math.PI / 2 + 0.1;
      rt.scene.add(m2);
      const sn2 = nobori(W, x, z, 'oda', 5); sn2.position.y = m2.position.y + 5.6; rt.scene.add(sn2);
      F.ships.push({ m: m2, flag: sn2, x0, x1, z, x, dir: 1, speed: sp, t: 3 + Math.random() * 3 });
    }
    // ---- 柴田勝家の手（自分の持ち場）と、柵を結う者 ----
    F.shiba = allyGroup(rt, { name: '柴田勝家の手', anchor: { x: 0, z: BANK_Z + 8 }, facing: Math.PI, width: 16, aggro: 10, noRout: true, formation: 'yari' },
      dress([{ type: 'busho', n: 1, o: { name: '柴田勝家', invuln: true, hat: 'kabuto_m', haori: 0x3a2a1a } }, { type: 'ashigaru', n: 16 }, { type: 'bow', n: 4 }], ODA));
    F.shibaU = F.shiba.units[0];
    F.recover = { line: ['柴田勝家', '手傷じゃ。しばし岸を守れ'], backLine: ['柴田勝家', '前へ戻る。槍を揃えよ'] };
    F.teppo = allyGroup(rt, { name: '織田の鉄砲衆', anchor: { x: 34, z: BANK_Z + 6 }, facing: Math.PI, width: 10, aggro: 36, noRout: true },
      dress([{ type: 'samurai', n: 1 }, { type: 'gun', n: 12 }], ODA));
    rt.after(3, () => rt.say('鉄砲頭', '一揆勢は舟でも渡ってくる。柵の外を見張れ', 3));
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

    rt.world.setTime('day');
    rt.setPhase('brief');
    rt.obj('main', hi(rt) ? '柴田勝家の手の、岸の持ち場の一手を預かれ' : '柴田勝家のもとで、下知を待て', 'main');
    rt.say('柴田勝家', `${nm(rt)}、川の向こうが中江の砦じゃ。一揆の門徒が、島に籠もって二か月になる`, 4.5);
    rt.say('柴田勝家', '兵糧はもう尽きかけておる。岸に柵を結え。水路を見張り、打って出る者を止めよ', 4.5);
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
      rt.addInteract('s' + i, { x: s.x, z: s.z + 2 }, '柵を結う', () => this.raise(rt, i), { r: 3.4, hold: 4.5 });
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
      F.sortieWatch = { guns: () => F.teppo, foes: () => [F.sortie], r: 40, who: '柴田勝家', line: '水から上がって足が止まった……鉄砲衆、放て！', sub: '岸の上から、織田の鉄砲衆' };
      F.shiba.order = 'hold'; F.shiba.anchor = { x: 0, z: BANK_Z + 2 }; F.shiba.aggro = 14;
    });
  },
  raise(rt, i) {
    const F = rt.flags;
    const s = SPOTS[i];
    if (F.raised?.[i]) return;
    (F.raised || (F.raised = []))[i] = true;
    rt.uninteract('s' + i); rt.unmark('s' + i); rt.unzone('s' + i);
    const segs = wallLine(rt, [[s.x - 7, s.z], [s.x + 7, s.z]], { team: 0, hp: 700, name: '柵', segLen: 5 });
    F.fence = [...(F.fence || []), ...segs];
    sfx('wood', 0.8);
    F.built++;
    if (F.helped) {
      if (F.built >= SPOTS.length) rt.obj('main', '柵の前で、川を渡る門徒を退けよ', 'main');
      return;
    }   // 足軽が代わりに結った分は手柄にしない
    rt.award((t) => { t.special = { label: '岸に柵を結った', pts: 4 * F.built }; }, '柵を結った');
    if (F.built >= SPOTS.length) rt.obj('main', '柵の前で、川を渡る門徒を退けよ', 'main');
    else rt.objProgress('main', `${F.built}／${SPOTS.length}`);
  },

  // ② 降伏して退城する舟。非戦闘の景色とし、討つ任務にはしない。
  boats(rt) {
    const F = rt.flags;
    if (F.step >= 2) return;
    F.step = 2; F.stepT = rt.t;
    rt.setPhase('boats');
    rt.unmark('sortie');
    if (F.sortie) { F.sortie.noRout = false; F.sortie.morale = 0; }
    rt.banner('長島、降伏', '二か月余の包囲の末、城の者が舟で退く');
    rt.obj('main', '岸の柵へ戻り、退く舟を見張れ', 'main');
    rt.marker('bank', { x: 0, z: BANK_Z + 5 }, '岸の持ち場');
    rt.say('伝令', '長島城、開城にござる。城兵は舟で退きまする。岸の持ち場を離れるな', 5);
    battleEvent(rt, EVENT_MESSENGER, F.shibaU.pos, null, 0, true, '長島城が降った。舟で退城する');
    F.boats = [];
    for (const [x, z] of [[-48, CH_Z], [-68, CH_Z + 3], [-90, CH_Z - 3]]) {
      const m = kobune(x, rt.world.heightAt(x, z) - 0.3, z, Math.PI / 2, 6.5);
      rt.scene.add(m); F.boats.push({ m, x, z });
    }
    rt.after(26, () => {
      if (F.step !== 2) return;
      for (const u of F.teppo.units) if (u.alive && u.type === 'gun') {
        rt.army.play('gun', u.pos, 0.8);
        rt.army.smoke(u.pos.x, u.pos.y + 1.4, u.pos.z, 0, -1, 0.9);
      }
      battleEvent(rt, EVENT_VOLLEY, { x: 0, z: CH_Z }, F.teppo, 0, true, '退く舟へ、織田方の鉄砲が放たれた');
      rt.banner('退く舟へ射撃', '川筋に銃声。岸の一揆勢が向きを変える');
      rt.say('足軽', '退く舟へ撃ちかけた……！　岸の門徒が、こちらへ向きを変えたぞ！', 4);
    });
    rt.after(32, () => this.lastSally(rt));
  },

  // ④ 反撃ののち、中江・屋長島の外へ柵をつなぎ直す。
  midB(rt) {
    const F = rt.flags;
    if (F.step >= 3.5) return;
    F.step = 3.5;
    for (let k = 1; k <= 3; k++) rt.unmark('x' + k);
    for (const q of F.last || []) if (!gone(q)) { q.noRout = false; q.morale = 0; }
    for (const c of F.lines || []) c.rout('B', { from: 0, hideAfter: 20, minFight: 0 });
    rt.obj('main', '東の印へ移り、残る二砦の囲みを守れ', 'main'); rt.unmark('bank');
    rt.say('伝令', '別の岸で信広様ら御一門が討死。中江と屋長島の囲みを固めよとの下知！', 5);
    battleEvent(rt, EVENT_MESSENGER, F.shibaU.pos, null, 0, true, '一門の陣で多くが討たれた。残る二砦を囲む');
    // 北岸へ渡らせない。こちらの堤の切れ目を守る局地戦。
    depthStart(rt, { faction: 'saito', flag: 'namu', armor: IKKO.armor, dmg: 0.6, scale: 1,
      look: (l) => depthLook(rt, l, IKKO), friends: () => F.oda }, [
      hold({ at: { x: 24, z: BANK_Z + 5 }, dur: 60, r: 18,
        title: '残る二砦を囲む', sub: '中江・屋長島の外へ、柵がつながれていく',
        label: '東の柵の切れ目', obj: '東の印へ移り、柵の切れ目を一分守れ',
        waves: [
          { t: 8, foes: () => [{ name: '堤へ打って出る門徒', from: { x: 42, z: -44 }, list: [uS(1), uA(10)], mass: 180 }] },
          { t: 34, say: ['柴田勝家', '東からも来るぞ。柵の内に槍を揃えよ！'], foes: () => [{ name: '川筋から回る門徒', from: { x: 68, z: -16 }, list: [uS(1), uA(10)], mass: 180 }] },
        ], onEnd: (rt, m, won) => { F.held = won; }, reward: '包囲の柵の切れ目を守った' }),
    ], () => this.win(rt));
    rt.after(8, () => {
      wallLine(rt, [[34, BANK_Z], [64, BANK_Z]], { team: 0, hp: 700, name: '包囲の柵', segLen: 5 });
      wallLine(rt, [[-64, BANK_Z], [-34, BANK_Z]], { team: 0, hp: 700, name: '包囲の柵', segLen: 5 });
    });
  },

  // ③ 舟への射撃を受けた門徒の反撃。鎧のない歩兵が、岸を南へ突き抜ける。
  lastSally(rt) {
    const F = rt.flags;
    if (F.step >= 3) return;
    F.step = 3; F.stepT = rt.t;
    rt.setPhase('sally');
    rt.unmark('bank');
    F.sallyHeld = 0;
    rt.banner('岸へ斬り込む一揆勢', '舟への射撃を受け、門徒が織田の陣へ反撃する');
    rt.obj('main', hi(rt) ? '持ち場の柵を守り、打って出た門徒を受け止めよ' : '柵の前で、打って出た門徒を受け止めよ', 'main');
    rt.say('柴田勝家', '来るぞ……！　あの者らは、もう退く所がない。気を抜くな', 4);
    F.last = [];
    rt.marker('bank', { x: 0, z: BANK_Z + 5 }, '岸の持ち場');
    F.lines = lines(rt, [
      { x: -74, z: CH_Z + 8, facing: Math.PI, w: 44, seed: 15742, A: ['oda', 0x2b3140, 420, 'oda'], B: ['namu', IKKO.armor, 620, 'saito'], gunsA: true, surge: false },
      { x: 76, z: CH_Z + 8, facing: Math.PI, w: 44, seed: 15743, A: ['oda', 0x2b3140, 420, 'oda'], B: ['namu', IKKO.armor, 600, 'saito'], surge: false },
    ]);
    for (const c of F.lines) c.go();
    rt.after(12, () => volleyAll(F.lines, 'A'));
    // 共通の兵の士気・旗・遠景が、この動く前線を拾う。個人の反応を作り直さない。
    F.teppo.morale = 48; F.teppo.noRout = false;
    rt.after(20, () => { F.teppo.morale = Math.max(F.teppo.morale, 75); });
    const mk = (x, name, n) => {
      const g = enemyGroup(rt, { faction: 'saito', name, anchor: { x, z: -48 }, facing: 0, order: 'attack', seekRange: 90, aggro: 16, width: 14, morale: 100, noRout: true, fleeDir: { x: 0, z: -1 }, dmgMult: 0.6 },
        dress([{ type: 'samurai', n: 2, o: { hat: 'hachimaki' } }, { type: 'ashigaru', n }], IKKO));
      KIT.backOf(rt, g, { flag: 'namu', armor: IKKO.armor, kind: 'spear', w: 22, depth: 12, count: 260, seed: 15744 + F.last.length });
      F.last.push(g);
      battleEvent(rt, EVENT_REINFORCEMENT, g.anchor, g, 1, false, '門徒の新手が岸へ迫る');
      rt.marker('x' + F.last.length, centerOf(g), () => `${name}・${moraleWord(g.morale)}`, { red: true, group: g });
      return g;
    };
    rt.after(6, () => { mk(-14, '打って出た門徒', 16); rt.army.play('eshout', { x: -14, z: -44 }, 1.8); rt.say('一揆の門徒', '南無阿弥陀仏！', 3.5); });
    rt.after(36, () => { if (F.step === 3) { mk(18, '門徒の新手', 14); rt.army.play('eshout', { x: 18, z: -44 }, 1.6); } });
    rt.after(72, () => { if (F.step === 3) { mk(-30, '最後の門徒', 14); rt.army.play('eshout', { x: -30, z: -44 }, 1.8); rt.say('足軽', '……まだ来る。鎧もつけておらぬ者ばかりじゃ', 3.5); } });
    for (const [g, x] of [[F.shiba, 0], [F.teppo, 30]]) { g.order = 'hold'; g.anchor = { x, z: BANK_Z + 3 }; g.aggro = 14; }
  },

  win(rt) {
    const F = rt.flags, W = rt.world;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    const held = F.held && F.sallyHeld >= 54;
    rt.obj('main', held ? '岸と包囲の柵を守り切った' : '持ち場を守り切れなかった', 'main');
    if (held) {
      rt.objDone('main');
      rt.award((t) => { t.main = true; t.special = { label: '岸と包囲の柵を守った', pts: 20 }; }, '岸と包囲の柵を守った');
    } else rt.objFail('main');
    rt.tracker.main = !!held;
    // 最後に火がかかるのは残る中江・屋長島。願証寺や既に降った長島を混ぜない。
    rt.world.setTime('dusk');
    rt.after(3, () => {
      for (const [x, z] of [[-14, -70], [8, -74], [-6, -88], [YANAGASHIMA.x - 5, YANAGASHIMA.z], [YANAGASHIMA.x + 5, YANAGASHIMA.z - 5]]) {
        W.addFire(x, z, { h: 1.6 }); W.addSmokeColumn(x, W.heightAt(x, z) + 6, z, { size: 3 });
      }
      for (const s of [F.kuraStruct, F.kuraStruct2, F.yanaStruct]) if (s && s.alive) rt.army.igniteStruct(s, { x: s.x, z: s.z });
      battleEvent(rt, EVENT_FIRE_START, FORT, null, 1, true, '中江・屋長島に火がかけられた');
      rt.banner('中江・屋長島に火', '柵で囲まれた二つの砦から、煙が上がる');
      rt.say('伝令', '中江と屋長島に火が……！　まだ多くの者が中におりまする', 5);
    });
    rt.player.u.invuln = true;
    rt.after(20, () => rt.finish({}, 0.2));
  },

  update(rt, dt) {
    const F = rt.flags;
    KIT.backTick(rt);
    guardRecover(rt, F.shibaU, dt, F.recover);
    if (F.hpBars) F.hpBars.update(rt.army.groups);
    if (F.FS) F.FS.tick(dt);
    depthTick(rt, dt);
    // 崩れた隊の印は消す（古い印が「あちらじゃ」の行き先にならないように）
    for (let i = rt.markers.length - 1; i >= 0; i--) { const m = rt.markers[i]; if (m.group && gone(m.group)) rt.unmark(m.id); }
    // 九鬼の船団：川口を行き来し（海の封鎖）、ときどき遠くの射撃を見せる（F.ending の間も動かす）
    for (const sh of F.ships || []) {
      sh.x += sh.dir * sh.speed * dt;
      if (sh.x > sh.x1) { sh.x = sh.x1; sh.dir = -1; } else if (sh.x < sh.x0) { sh.x = sh.x0; sh.dir = 1; }
      sh.m.position.x = sh.x; sh.m.position.y = rt.world.heightAt(sh.x, sh.z) - 0.9;
      sh.flag.position.x = sh.x; sh.flag.position.y = sh.m.position.y + 5.6;
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
      if (s && !F.vw_sortie && (F.volleyT = (F.volleyT || 0) - dt) <= 0) { F.volleyT = 0.5; volleyWatch(rt, 'sortie', F.sortieWatch); }
      // 結いに来ない時は、柴田が場所とやり方を言い、それでも来なければ足軽が残りを結う（待たせきりにしない）
      const w = rt.t - F.stepT;
      if (F.built < SPOTS.length && w > 45 && !F.nudge) { F.nudge = true; rt.say('柴田勝家', `${nm(rt)}、柵はまだか！　印の所に立って「柵を結う」を長く押せ。杭の俵がそこにある`, 4); }
      if (F.built < SPOTS.length && w > 75 && !F.nudge2) { F.nudge2 = true; rt.say('足軽', 'お頭、手が足りませぬ。残りは我らも手伝いまする', 3); }
      if ((w >= 65 && F.built >= SPOTS.length && s && gone(s)) || w > 90) {
        if (F.built < SPOTS.length) { if (!F.built) rt.objFail('main'); else rt.objDone('main'); F.helped = true; rt.say('柴田勝家', '残りは足軽どもに結わせた。次じゃ', 3); for (let i = 0; i < SPOTS.length; i++) if (rt.interacts.some((q) => q.id === 's' + i)) this.raise(rt, i); }
        rt.obj('main', '岸の柵で、長島城からの報せを待て', 'main');
        rt.after(3, () => this.boats(rt));
        F.step = 1.5;
      }
    }
    if (F.step === 2) {
      for (const bt of F.boats) { bt.x += dt * 2.6; bt.m.position.x = bt.x; }
    }
    if (F.step === 3) {
      const w = rt.t - F.stepT;
      const p = rt.player.u.pos;
      if (Math.abs(p.x) < 62 && p.z > CH_Z - 3 && p.z < BANK_Z + 38) F.sallyHeld += dt;
      if (Math.floor(w) !== F.lastClock) {
        F.lastClock = Math.floor(w);
        rt.objProgress('main', `岸を守る あと${Math.max(0, Math.ceil(120 - w))}秒`);
      }
      if (w >= 120) for (const q of F.last) { q.noRout = false; q.morale = Math.min(q.morale, 20); }
      if ((w >= 120 && F.last.length >= 3 && F.last.every(gone)) || w > 150) this.midB(rt);
    }
  },

  onKill(rt, v) {
    const F = rt.flags;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
  },
  onRout(rt, g) {
    if (g.team !== 1 || g._routSaid || rt.t < (rt.flags.routSayT || 0)) return;
    g._routSaid = true; rt.flags.routSayT = rt.t + 8;   // 隊ごとに一度・間を 8 秒（崩れて立て直す隊が同じ一言を繰り返さない。10/2）
    rt.say('足軽', `${g.name}が川へ退いていく`, 2.5);
  },
  onStructDestroyed(rt, s) {
    if ((rt.flags.fence || []).includes(s)) { brokenWall(rt, s); rt.bark('柵が破られた！', true); }
  },
};

// 表示の兵力は遊びの目安。戦う者と、二砦に残る非戦闘の人々の数を分ける。
nagashima.force = (rt) => {
  const F = rt.flags;
  return { a: Math.round(70000 - (F.ak || 0) * 30), a0: 70000, b: Math.max(0, 10000 - (F.ek || 0) * 30), b0: 10000 };
};
nagashima.sides = { a: { name: '織田軍', mon: 'oda' }, b: { name: '長島の一揆勢', mon: 'namu' } };
nagashima.rts = true;
// 任務外の遠景は実兵へ替えない。基本約七十＋柵前十三＋反撃五十＋最後二十二人。
nagashima.noWake = true;
// 史実でこの戦にいた名のある武将（battle.js の placeFamous が、その家の隊に加える。敵は名乗り、討てば手柄）
nagashima.famous = [
  { name: '滝川一益', team: 0, g: /鉄砲/, loose: 1, line: '滝川一益じゃ。舟を寄せさせるな。撃て！' },
];
nagashima.date = (rt) => `天正二年九月二十九日　秋・${rt.flags.ending ? '夕暮れ' : '昼'}`;
nagashima.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '柵の下知まで待つ' : '');
nagashima.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
nagashima.history = '伊勢の長島は、木曽川・長良川・揖斐川が海に注ぐ所の輪中の島々で、一向宗の願証寺を中心に門徒の力が強かった。石山本願寺の呼びかけで起った長島の一揆は、元亀元年に信長の弟・織田信興を討ち、その後の織田の攻めも二度退けた。天正二年（1574）七月、信長は陸と海から大軍で島々を囲み、九鬼嘉隆らの船で川と海を断って兵糧攻めにした。篠橋・大鳥居の砦が落ち、九月二十九日、長島の砦は降った。ところが、城を出る門徒に織田方が鉄砲を撃ちかけたため、怒った門徒が斬り込み、信長の兄の織田信広など多くの一門が討ち死にした。残る中江・屋長島の砦は柵で囲まれて火をかけられ、中にいた二万人ほどが焼け死んだと伝わる。この戦では、岸の柵を守る足軽の目から、その終わりを見ている。数には諸説あり、総勢七万・一揆の戦う者一万は遊びの目安。信長公記巻七と大日本史料の九月二十九日条をもとにした。岸の柵作り、反撃の波の数と秒数、砦の距離は遊び用の復元で、織田信広らの討死は自分の手柄で変わらない。';
// 信長で遊ぶ時：居場所の目安（bot の目が始まりの位置を確かめる） と立つ所
nagashima.lordAt = { x: 0, z: 40, r: 12, why: '岸の後ろの織田の陣（信長は陸と海から長島を囲んだ）' };
nagashima.lordSpawn = { x: 0, z: 36, heading: Math.PI };

// 素直な遊び手：柵を結い、舟を見張り、反撃を岸で受け止め、東の包囲の柵へ移る
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
  if (F.step === 2) { goTo(p, inp, 0, BANK_Z + 4, 2); return; }
  if (F.step === 3) { const q = (F.last || []).find((x) => !gone(x)); if (q) { const c = q.center(); if (c.z > -40) { goTo(p, inp, c.x, c.z, 2); return; } } goTo(p, inp, 4, BANK_Z + 3, 2); return; }
  goTo(p, inp, 6, BANK_Z + 8, 3);
};

export { nagashima };
