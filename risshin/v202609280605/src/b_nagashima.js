// ======================================================================
// 織田家編　長島一向一揆（天正二年七月〜九月）
// 木曽・長良・揖斐の川が海に注ぐ輪中の島々に、一向宗の門徒が砦を構えて立てこもった。
// 信長は陸と海（九鬼嘉隆の船）から島々を囲み、兵糧を断った。
// 足軽は柴田勝家の手。①中江の砦に向かう岸に柵を結う（砦から打って出る門徒を退けながら）
// ②夕暮れ、兵糧を運び込もうとする一揆の舟が岸に着く。上がった者を退ける ③夜、砦から決死の門徒が打って出る。柵で受け止める
// 最後に砦には火がかけられる。惨い終わりは、歴史の文で伝える
// 向き：北（-z）の川の向こうに中江の砦のある輪中。南（+z）に織田の陣。東（+x）は海へ
// ======================================================================
import * as THREE from 'three';
import { nobori, hut, yagura, campfire, jinmaku, tawara } from './props.js';
import { flagTexture } from './textures.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { moraleWord } from './hud.js';
import { gauss, enemyGroup, allyGroup, nm, centerOf, unitPos, wallLine, brokenWall } from './bhelp.js';
import { applyLook, NIGHT, dress, gone } from './b_inabayama.js';
import { namuTex } from './b_nodafukushima.js';

const CH_Z = -32;                          // 島の手前の川筋
const BANK_Z = -20;                        // こちらの岸（柵を結う所）
const FORT = { x: 0, z: -74 };             // 中江の砦
const SPOTS = [{ x: -26, z: BANK_Z }, { x: 0, z: BANK_Z - 1 }, { x: 26, z: BANK_Z }];   // 柵を結う所
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
    F.fwall = noT(wallLine(rt, [[-30, -56], [-10, -52], [10, -52], [30, -56]], { team: 1, hp: 1e9, name: '柵', segLen: 5, gaps: [4] }));
    for (const [x, z, r] of [[-14, -70, 0.1], [8, -74, -0.2], [26, -68, 0.3], [-6, -88, 0], [16, -92, 0.2], [-24, -84, -0.2]]) rt.scene.add(hut(W, x, z, 7, 5, r, { wall: 0x6a5a44 }));
    rt.scene.add(yagura(W, -20, -60), yagura(W, 20, -60));
    for (const [x, z] of [[-26, -60], [-4, -58], [14, -58], [30, -62], [0, -80]]) rt.scene.add(nobori(W, x, z, 'namu', 6.5));
    // ---- こちらの岸：織田の陣 ----
    rt.scene.add(jinmaku(W, 0, 44, 18, 10, 5, { mon: 'oda' }), tawara(W, -14, 30, 0.3, 6));
    for (const [x, z, k] of [[-8, 34, 'oda'], [8, 34, 'eiraku'], [-40, BANK_Z + 10, 'oda'], [40, BANK_Z + 10, 'oda']]) rt.scene.add(nobori(W, x, z, k, 6));
    for (const s of SPOTS) rt.scene.add(tawara(W, s.x + 4, s.z + 8, 0.2, 2));
    // 九鬼の安宅船（東の川筋に）
    F.ship = ataka();
    F.ship.position.set(84, W.heightAt(84, CH_Z) - 0.9, CH_Z - 2);
    F.ship.rotation.y = Math.PI / 2 + 0.1;
    rt.scene.add(F.ship);
    const sn = nobori(W, 84, CH_Z - 2, 'oda', 5); sn.position.y = F.ship.position.y + 5.6; rt.scene.add(sn);
    F.shipT = 4;
    // ---- 柴田勝家の手（自分の持ち場）と、柵を結う者 ----
    F.shiba = allyGroup(rt, { name: '柴田勝家の手', anchor: { x: 0, z: BANK_Z + 8 }, facing: Math.PI, width: 16, aggro: 10, noRout: true, formation: 'yari' },
      dress([{ type: 'busho', n: 1, o: { name: '柴田勝家', invuln: true, hat: 'kabuto_m', haori: 0x3a2a1a } }, { type: 'ashigaru', n: 16 }, { type: 'bow', n: 4 }], ODA));
    F.shibaU = F.shiba.units[0];
    F.teppo = allyGroup(rt, { name: '織田の鉄砲衆', anchor: { x: 34, z: BANK_Z + 6 }, facing: Math.PI, width: 10, aggro: 36, noRout: true },
      dress([{ type: 'samurai', n: 1 }, { type: 'gun', n: 8 }], ODA));
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
    rt.obj('main', '柴田勝家のもとで、下知を待て', 'main');
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
    rt.obj('main', `岸の三か所に柵を結え（${SPOTS.length}か所）`, 'main');
    rt.say('柴田勝家', '杭と縄はそこにある。印の所に柵を結え！', 3);
    SPOTS.forEach((s, i) => {
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
    rt.after(40, () => { if (F.step === 2) this.launch(rt, 130, 42, -1); });
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
    F.landers = [...(F.landers || []), g];
    const k = F.landers.length;
    rt.army.play('eshout', { x: bt.xLand, z: CH_Z + 6 }, 1.5);
    rt.marker('l' + k, centerOf(g), () => `舟から上がった一揆勢・${moraleWord(g.morale)}`, { red: true, group: g });
  },

  // ③ 夜、砦から決死の門徒
  lastSally(rt) {
    const F = rt.flags;
    if (F.step >= 3) return;
    F.step = 3; F.stepT = rt.t;
    rt.setPhase('sally');
    for (let k = 1; k <= (F.landers || []).length; k++) rt.unmark('l' + k);
    for (const q of F.landers || []) if (!gone(q)) q.morale = Math.min(q.morale, 15);
    rt.award((t) => t.side.push('一揆の舟を岸に上げなかった'), '舟の者を退けた');
    applyLook(rt, NIGHT);
    rt.banner('夜更け', '兵糧の尽きた砦から、門徒が死に物狂いで打って出る');
    rt.obj('main', '柵の前で、打って出た門徒を受け止めよ', 'main');
    rt.say('柴田勝家', '来るぞ……！　あの者らは、もう退く所がない。気を抜くな', 4);
    F.last = [];
    const mk = (x, name, n) => {
      const g = enemyGroup(rt, { faction: 'saito', name, anchor: { x, z: -48 }, facing: 0, order: 'attack', seekRange: 90, aggro: 16, width: 14, morale: 100, fleeDir: { x: 0, z: -1 }, dmgMult: 0.6 },
        dress([{ type: 'samurai', n: 2, o: { hat: 'hachimaki' } }, { type: 'ashigaru', n }], IKKO));
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
    rt.objDone('main');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '岸の柵を守り切った', pts: 20 }; }, '任務達成・岸の柵を守り切った');
    // 砦に火がかけられる
    const W = rt.world;
    for (const [x, z] of [[-14, -70], [8, -74], [26, -68], [-6, -88]]) { W.addFire(x, z, { h: 1.6 }); W.addSmokeColumn(x, W.heightAt(x, z) + 6, z, { size: 3 }); }
    rt.banner('中江の砦に火', '信長の下知で、砦のまわりに柵が結われ、火がかけられた');
    rt.say('柴田勝家', '……見よ。これが、この戦の終わりじゃ', 4);
    rt.after(5, () => rt.say('柴田勝家', `${nm(rt)}、目をそらすな。……だが、忘れてもよい。忘れられるものならな`, 5));
    rt.player.u.invuln = true;
    rt.finish({}, 12);
  },

  update(rt, dt) {
    const F = rt.flags;
    // 崩れた隊の印は消す（古い印が「あちらじゃ」の行き先にならないように）
    for (const m of rt.markers.slice()) if (m.group && gone(m.group)) rt.unmark(m.id);
    if (F.ending) return;
    // 九鬼の安宅船から、ときどき大鉄砲
    if ((F.shipT -= dt) <= 0) {
      F.shipT = 4 + Math.random() * 5;
      const p = F.ship.position;
      rt.army.play('gun', { x: p.x, z: p.z }, 0.7);
      rt.army.smoke(p.x - 3, p.y + 4, p.z, -1, 0, 1.2);
    }
    if (F.step === 1) {
      const s = F.sortie;
      if (s) rt.objProgress('main', `${F.built}／${SPOTS.length}・門徒 ${gone(s) ? 0 : s.count}人`);
      if (s && s.count < 4 && !gone(s)) s.morale = Math.min(s.morale, 20);
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
      rt.objProgress('main', `舟の者 ${L.reduce((s, q) => s + (gone(q) ? 0 : q.count), 0)}人`);
      for (const q of L) if (q.count < 4 && !gone(q)) q.morale = Math.min(q.morale, 20);
      if ((L.length >= 2 && L.every(gone)) || rt.t - F.stepT > 160) this.lastSally(rt);
    }
    if (F.step === 3) {
      const L = F.last || [];
      rt.objProgress('main', `門徒 ${L.reduce((s, q) => s + (gone(q) ? 0 : q.count), 0)}人`);
      for (const q of L) if (q.count < 5 && !gone(q)) q.morale = Math.min(q.morale, 20);
      if ((L.length >= 3 && L.every(gone)) || rt.t - F.stepT > 180) this.win(rt);
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

// 両軍の総勢（織田 七万ほど。中江の砦の一揆勢 一万ほど。島々に籠もった人々は、女や子供を合わせて数万とも。数には諸説ある）
nagashima.force = (rt) => {
  const F = rt.flags;
  return { a: Math.round(70000 - (F.ak || 0) * 30), a0: 70000, b: Math.max(0, 10000 - (F.ek || 0) * 30), b0: 10000 };
};
nagashima.sides = { a: { name: '織田軍', mon: 'oda' }, b: { name: '長島の一揆勢', mon: 'namu' } };
nagashima.date = (rt) => `天正二年九月　秋・${rt.flags.step >= 3 ? '夜' : rt.flags.step >= 2 ? '夕暮れ' : '昼下がり'}`;
nagashima.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '柵の下知まで待つ' : '');
nagashima.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
nagashima.history = '伊勢の長島は、木曽川・長良川・揖斐川が海に注ぐ所の輪中の島々で、一向宗の願証寺を中心に門徒の力が強かった。石山本願寺の呼びかけで起った長島の一揆は、元亀元年に信長の弟・織田信興を討ち、その後の織田の攻めも二度退けた。天正二年（1574）七月、信長は陸と海から大軍で島々を囲み、九鬼嘉隆らの船で川と海を断って兵糧攻めにした。篠橋・大鳥居の砦が落ち、九月、長島の砦は降ったが、城を出る門徒に織田方が鉄砲を撃ちかけ、怒った門徒が斬り込んで、信長の兄の織田信広など多くの一門が討ち死にした。残る中江・屋長島の砦は柵で囲まれて火をかけられ、中にいた二万人ほどが焼け死んだと伝わる。この戦では、岸の柵を守る足軽の目から、その終わりを見ている。数には諸説ある。';

// 素直な遊び手：柵を結い、岸で門徒と戦い、舟から上がった者へ向かい、夜は柵の前で受け止める
nagashima.botBrain = (b, inp, { goTo }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyE');
  if (!u.alive || F.ending) return;
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
