import { useTerrain } from './asset_manifest.js';
// ======================================================================
// 尾張統一戦　稲生の戦い（弘治二年八月二十四日・1556）
// 信長の七百が、弟の信勝（信行）方の千七百（柴田勝家 千・林美作守 七百）と、於多井川（庄内川）の東の稲生の野で戦う。
// 足軽は信長の旗本の足軽。組頭の源八の下で、信長の旗のそばに立つ。
// ①柴田勢の寄せを受け止める（佐々孫介らが討たれ、信長公のまわりは四十ほどに）
// ②信長の大音声で柴田勢が崩れる ③南から来る林美作守の隊を崩す（美作守は信長が討つ）④追わずに旗へ戻る
// 向き：x が東（+x）、z が南（+z）。於多井川は西の x ≒ -110、名塚の砦はその東。
// 地形は国土地理院の標高（asset_dem_inou.js）。今の堤は高すぎるので、高さを丸めて昔の平らな野に寄せる。
// ======================================================================
import { nobori, jinmaku, hut, tawara } from './props.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { moraleWord } from './hud.js';
import { gauss, enemyGroup, allyGroup, nm, centerOf, unitPos } from './bhelp.js';
import { KIT } from './b_nagashinojo.js';
import { clash } from './b_sekigahara.js';
import { demSample } from './dem.js';
import { weaponMesh } from './units.js';
import { K, S as SETTINGS } from './settings.js';
import { isTouch } from './touch.js';

const RIVER = [[-104, -400], [-110, -200], [-116, -60], [-112, 60], [-120, 200], [-126, 400]];   // 於多井川（庄内川）
const NOBU = { x: -8, z: 0 };            // 信長の旗（はじめの持ち場）
const NAZUKA = { x: -64, z: -34 };       // 名塚の砦（佐久間大学）
const SHIBA0 = { x: 112, z: -14 };       // 柴田勢の寄せはじめ
const HAYA0 = { x: 96, z: 112 };         // 林勢の寄せはじめ（南東）
const HAYA1 = { x: 30, z: 58 };          // 林勢を受ける所（信長の旗の南）

const SHIBA = { armor: 0x2e2a24, lace: 0x5a2a1c, flag: 'kari' };
const HAYA = { armor: 0x302c26, lace: 0x4a4a3a, flag: 'sujikai' };
const ODA = { flag: 'oda' };
const dress = (list, lk) => list.map((s) => ({ ...s, o: { ...lk, ...(s.o || {}) } }));
const gone = (g) => !g || g.count === 0 || g.routed;
const live = (gs) => gs.reduce((a, g) => a + (gone(g) ? 0 : g.count), 0);

let dem = null;
useTerrain('dem_inou', (data) => { dem = data; });
// 実の 4m をゲームの 1 に縮める（戦場 ±180 が実の ±720m）。今の堤（9.5m を超える所）は削る
function height(x, z) {
  let h = 0.25 * Math.sin(x * 0.04) * Math.cos(z * 0.035) + 0.2 * Math.sin(z * 0.06 + x * 0.02);
  // 川べりは低く、名塚の砦は少し高い
  let d = Infinity;
  for (let i = 0; i < RIVER.length - 1; i++) { const [ax, az] = RIVER[i], [bx, bz] = RIVER[i + 1]; if (z >= az && z <= bz) d = Math.abs(x - (ax + (bx - ax) * (z - az) / (bz - az))); }
  if (d < 30) h -= 1.4 * (1 - d / 30);
  h += 1.6 * gauss(x, z, NAZUKA.x, NAZUKA.z, 160);
  if (dem) h += (Math.min(9.5, demSample(dem, x * 4, z * 4)) - 7) * 0.8;
  return h;
}

// ---------------- 教えの戦：操作を一つずつ、戦の中で覚える（kaito 10/20） ----------------
// [id, する事, パソコンの操作, 指の操作]。id は player.js が tutMark で知らせる物（move・thrust・charged・guard・dodge・parry）と、
// この定義が update で見る物（look・cmd・gun・bow・spear・ride・dismount）
const LESSONS = {
  a: () => [
    ['move', '歩く', `${K('forward')}・${K('left')}・${K('back')}・${K('right')}`, '左の親指でなぞる'],
    ['look', '見回す', 'マウスを動かす', '画面の右をなぞる'],
    ['thrust', '突く', '左クリック（押した時に突く）', '「つく」を押す'],
    ['charged', '溜めて突く', '左クリックを長押しして、放す', '「つく」を長押しして、放す'],
    ['guard', '構える', SETTINGS.guardToggle ? '右クリックで構える' : '右クリックを押し続ける', '「かまえる」を押し続ける'],
    ['dodge', 'かわす', `${K('dodge')}`, '「回避」を押す'],
    ['cmd', '組に号令する', `${K('command')}で号令を開き、一つ選ぶ`, '「号令」を押し、一つ選ぶ'],
  ],
  b: () => [
    ['gun', '鉄砲で撃つ', '3 で持ち替え。左クリックを押し続けて狙い、放す', '「持替」で鉄砲。攻撃の丸を押し続けて、放す'],
    ['bow', '弓で射る', '4 で持ち替え。右で構え、左を押して引き、放す', '「持替」で弓。「狙う」で構え、「射る」を押して引き、放す'],
    ['spear', '槍に戻す', '1 で持ち替え', '「持替」で槍'],
  ],
  c: () => [['parry', '敵の「！」で構え、受け流す', '「！」が出たら右クリック', '「！」が出たら「かまえる」']],
  d: () => [
    ['ride', '空馬に乗る', `馬のそばで ${K('use')} を長押し`, '馬のそばで「取る」を長押し'],
    ['dismount', '馬を降りる', `${K('mount')}`, '「降りる」を押す'],
  ],
};
function lesson(rt, k, then) {
  const F = rt.flags;
  if (rt.G.lord || F.lessonDone?.[k]) { if (then) then(); return; }
  F.lessonDone = F.lessonDone || {};
  F.lesson = k;
  const ok = rt.tutStart('手ほどき', LESSONS[k](), () => { F.lessonDone[k] = true; F.lesson = null; if (then) rt.after(1.2, then); });
  if (!ok) { F.lessonDone[k] = true; if (then) then(); }
}
function lessonEnd(rt, k) {
  const F = rt.flags;
  if (F.lesson !== k) return;
  F.lessonDone[k] = true; F.lesson = null; rt.tutEnd();
}

const inou = {
  teach: true,           // 操作を教える戦（battle.js の teachOn）。ほかの戦は操作のやり方を出さない
  compactIntro: true,
  introTaskFirst: true,
  learningFight: true,   // 新しく始めた人の初陣。傷を軽くする
  noTaisho: true,        // 殿（信長）と大将の流れは、この定義が持つ
  noReserve: true,
  lordHata: { spear: 30 },
  foeHit: 0.85,
  spawn: { x: NOBU.x + 4, z: NOBU.z + 5, heading: Math.PI / 2 },
  lordSpawn: { x: NOBU.x, z: NOBU.z, heading: Math.PI / 2 },
  lordAt: { x: NOBU.x, z: NOBU.z, r: 20, why: '信長の旗本（稲生の野の西）' },
  world: {
    seed: 1556,
    time: 'day',
    muddy: 0.2,
    paths: [[[-180, -6], [-112, -4], [-60, -10], [0, -6], [60, -10], [120, -16], [180, -20]], [[30, 0], [50, 60], [80, 110], [100, 180]]],
    height,
    tint(x, z, h, c) {
      let d = Infinity;
      for (let i = 0; i < RIVER.length - 1; i++) { const [ax, az] = RIVER[i], [bx, bz] = RIVER[i + 1]; if (z >= az && z <= bz) d = Math.abs(x - (ax + (bx - ax) * (z - az) / (bz - az))); }
      if (d < 14) { const k = 1 - d / 14; c.setRGB(c.r * (1 - 0.45 * k) + 0.26 * k, c.g * (1 - 0.45 * k) + 0.25 * k, c.b * (1 - 0.45 * k) + 0.2 * k); }
    },
    clear: (x, z) => x > -80 && x < 130 && z > -70 && z < 130,
    fieldStage: 'ripe',   // 旧暦八月の末。稲は実っている（稲刈りの前か後かは分からない）
    paddy(x, z) {
      if (x < -96 || x > 170 || z < -160 || z > 170) return 0;
      if (Math.abs(z + 6) < 7 || (x > -30 && x < 60 && z > -50 && z < 70)) return 0;   // 街道と、ぶつかる野は畑と草地
      if ((Math.floor(x / 14) + Math.floor(z / 12)) % 3 === 1) return 0;
      const ex = Math.min(((x % 14) + 14) % 14, 14 - ((x % 14) + 14) % 14), ez = Math.min(((z % 12) + 12) % 12, 12 - ((z % 12) + 12) % 12);
      return Math.max(0, Math.min(1, (Math.min(ex, ez) - 0.8) / 0.6)) * 0.7;
    },
    streams: [{ pts: RIVER, w: 10, depth: 1.2 }],
    trees: 380,
    tufts: 4600,
    treeDensity: (x, z) => (x < -90 || x > 150 || Math.abs(z) > 140 ? 1 : 0.15),
    groves: [{ x: NAZUKA.x - 8, z: NAZUKA.z - 12, r: 10, n: 14 }, { x: 140, z: 60, r: 14, n: 20 }, { x: -20, z: 120, r: 12, n: 16 }],
    // 崩れた信勝方は東（末森の方）と南へ消す
    fleeOut: (x, z, team) => team === 1 && (x > 150 || z > 150),
  },

  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    const lord = !!rt.G.lord;
    F.step = 0; F.ek = 0; F.ak = 0;
    // ---- 信長方：旗本（信長）・森可成・前田犬千代・名塚の佐久間大学 ----
    F.hata = allyGroup(rt, { name: '信長の旗本', anchor: { ...NOBU }, facing: Math.PI / 2, width: 14, aggro: 6, noRout: true, formation: 'yari', fullStrength: true },
      dress([...(lord ? [] : [{ type: 'busho', n: 1, o: { name: '織田信長', invuln: true, horse: true, flagScale: 1.2 } }]),
        { type: 'samurai', n: 1, o: { name: '組頭 源八', invuln: true } }, { type: 'samurai', n: 4 }, { type: 'ashigaru', n: 18 }], ODA));
    F.nobuU = lord ? rt.player.u : F.hata.units.find((u) => u.name === '織田信長');
    F.genU = F.hata.units.find((u) => u.name === '組頭 源八');
    F.mori = allyGroup(rt, { name: '森可成の手', anchor: { x: NOBU.x + 14, z: NOBU.z - 22 }, facing: Math.PI / 2, width: 14, aggro: 8, noRout: true, formation: 'yari' },
      dress([{ type: 'samurai', n: 1, o: { name: '森可成', invuln: true, hat: 'kabuto_s' } }, { type: 'samurai', n: 3 }, { type: 'ashigaru', n: 24 }, { type: 'bow', n: 4 }], ODA));
    F.sassa = allyGroup(rt, { name: '佐々孫介の手', anchor: { x: NOBU.x + 18, z: NOBU.z + 18 }, facing: Math.PI / 2, width: 14, aggro: 8, noRout: true, formation: 'yari' },
      dress([{ type: 'samurai', n: 1, o: { name: '佐々孫介', invuln: true } }, { type: 'samurai', n: 3 }, { type: 'ashigaru', n: 22 }, { type: 'bow', n: 4 }], ODA));
    F.sassaU = F.sassa.units.find((u) => u.name === '佐々孫介');
    F.inu = allyGroup(rt, { name: '前田犬千代', anchor: { x: NOBU.x + 10, z: NOBU.z + 8 }, facing: Math.PI / 2, width: 6, aggro: 10, noRout: true },
      dress([{ type: 'samurai', n: 1, o: { name: '前田犬千代', invuln: true, keep: true } }, { type: 'samurai', n: 1 }], ODA));
    F.nazuka = allyGroup(rt, { name: '名塚の砦の兵', anchor: { x: NAZUKA.x + 6, z: NAZUKA.z }, facing: Math.PI / 2, width: 12, aggro: 6, noRout: true, formation: 'yari' },
      dress([{ type: 'samurai', n: 1, o: { name: '佐久間大学', invuln: true } }, { type: 'ashigaru', n: 10 }, { type: 'bow', n: 4 }], ODA));
    F.friends = [F.hata, F.mori, F.sassa, F.inu];
    for (const g of F.friends) { g.defMult = 1.15; }
    const n = RANKS[rt.G.rank].squad;
    // 号令を覚えるため、組の無い足軽にも源八が三人を付ける（この戦だけ。名簿には入らない）
    rt.makeSquad({ x: NOBU.x + 6, z: NOBU.z + 9 }, Math.PI / 2, [{ kind: 'spear', n: n || 3 }]);
    // 鉄砲と弓も、この戦だけ貸す（持ち物には入らない）
    const P = rt.player;
    if (!P.hasGun) { P.hasGun = true; P.gunMesh = weaponMesh('gun'); P.lentGun = true; }
    if (!P.hasBow) { P.hasBow = true; P.bowMesh = weaponMesh('bow'); P.lentBow = true; }
    F.yaw0 = P.yaw; F.look = 0; F.lc0 = P.lastCmd || null; F.bow0 = P.bowAmmo;

    // ---- 信勝方：柴田勝家の千（東から） ----
    F.shiba1 = enemyGroup(rt, { faction: 'nobukatsu', name: '柴田の先手', anchor: { ...SHIBA0 }, facing: -Math.PI / 2, fleeDir: { x: 1, z: 0 }, aggro: 8, width: 16, noRout: true, formation: 'yari', dmgMult: 0.6, defMult: 1.1 },
      dress([{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 30 }, { type: 'bow', n: 5 }], SHIBA));
    F.shibaG = enemyGroup(rt, { faction: 'nobukatsu', name: '柴田勝家の手', anchor: { x: SHIBA0.x + 18, z: SHIBA0.z - 6 }, facing: -Math.PI / 2, fleeDir: { x: 1, z: 0 }, aggro: 6, width: 14, noRout: true, formation: 'yari', dmgMult: 0.6, defMult: 1.2 },
      dress([{ type: 'busho', n: 1, o: { name: '柴田勝家', invuln: true, horse: true } }, { type: 'samurai', n: 4 }, { type: 'ashigaru', n: 26 }], SHIBA));
    F.shibaU = F.shibaG.units.find((u) => u.type === 'busho');
    F.shibaU.dmg *= 0.5;
    F.shiba = [F.shiba1, F.shibaG];
    KIT.markRecyclable(F.nazuka);

    // ---- 陣と旗 ----
    rt.scene.add(jinmaku(W, NOBU.x - 16, NOBU.z, 10, 8, 4, { mon: 'oda' }));
    for (const [x, z, k] of [[NOBU.x - 4, NOBU.z - 6, 'oda'], [NOBU.x - 4, NOBU.z + 6, 'oda'], [NOBU.x + 10, NOBU.z - 24, 'tsuru'], [NAZUKA.x, NAZUKA.z - 4, 'oda']]) rt.scene.add(nobori(W, x, z, k, 5));
    // 名塚の砦：急いで作った柵と小屋
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; rt.scene.add(tawara(W, NAZUKA.x + Math.sin(a) * 9, NAZUKA.z + Math.cos(a) * 9, a, 3)); }
    rt.scene.add(hut(W, NAZUKA.x - 4, NAZUKA.z - 6, 6, 4, 0.2, { roof: 0x6a5c44 }));
    // 稲生の村（野の北）
    for (const [x, z, r] of [[10, -96, 0.2], [26, -104, -0.3], [-6, -110, 0.5], [40, -92, 0.1]]) rt.scene.add(hut(W, x, z, 7, 5, r, { roof: 0x6a5c44 }));
    // 柴田の旗
    for (const [x, z] of [[SHIBA0.x + 6, SHIBA0.z - 10], [SHIBA0.x + 6, SHIBA0.z + 10], [SHIBA0.x + 24, SHIBA0.z - 4]]) rt.scene.add(nobori(W, x, z, 'kari', 5.5));

    // ---- 大軍（軽い作り）：北の野で、柴田の本隊と信長方が押し合う ----
    F.front = clash(rt, { x: 34, z: -46, facing: Math.PI / 2, w: 44, gap0: 30, seed: 1556, noRout: true, killRate: 0.25, noReserve: true, noWake: true, host: false,
      A: { flag: 'oda', armor: KIT.ARMOR.oda, count: 160, kind: 'spear', team: 0, faction: 'oda', flagRate: 0.2 },
      B: { flag: 'kari', armor: SHIBA.armor, count: 380, kind: 'spear', team: 1, faction: 'nobukatsu', flagRate: 0.2 } });
    // 東の奥の信勝方の控え（遠景）・西の清洲へ戻る道の味方の控え
    KIT.farHost(rt, 160, -20, 30, 12, 160, -Math.PI / 2, SHIBA.armor, 'kari', 1561);
    F.hayaFar = KIT.farHost(rt, 130, 150, 28, 12, 180, -Math.PI * 0.75, HAYA.armor, 'sujikai', 1562);

    rt.world.setTime('day');
    rt.setPhase('brief');
    rt.obj('main', '信長の旗のそばで、槍をそろえよ', 'main');
    rt.obj('stay', '信長の旗を離れるな', 'order');
    if (!lord) rt.say('織田信長', '勘十郎（信勝）が背いた。柴田も林も、あちらについた', 4.5);
    rt.say('組頭 源八', `${nm(rt)}、敵は倍じゃ。だが同じ織田の者。信長の旗を離れるでないぞ`, 5);
    rt.bark('東から柴田の旗が来る');
    // 柴田が寄せるまでに、体の使い方を覚える（済むか、百秒で寄せが来る）
    rt.after(4, () => {
      if (!rt.G.lord) rt.say('組頭 源八', '寄せが来るまで、体をほぐしておけ。槍の稽古じゃ', 3.5);
      lesson(rt, 'a', () => { if (F.step === 0) { rt.say('組頭 源八', 'よし、それでよい。……来たぞ', 3); rt.after(3, () => this.shibaCome(rt)); } });
    });
    rt.after(rt.G.lord ? 14 : 100, () => { lessonEnd(rt, 'a'); this.shibaCome(rt); });
  },

  // ① 柴田勢の寄せ
  shibaCome(rt) {
    const F = rt.flags;
    if (F.step >= 1) return;
    F.step = 1; F.stepT = rt.t;
    rt.setPhase('shibata');
    sfx('taiko', 1); rt.after(0.5, () => sfx('horagai', 0.9));
    rt.banner('柴田勝家、寄せる', '信勝方の千が、街道を西へ');
    rt.obj('main', '柴田勢の寄せを受け止めよ', 'main');
    rt.say('組頭 源八', '来るぞ！　槍をそろえて、穂先を下げよ！', 3.5);
    for (const g of F.shiba) { g.order = 'attack'; g.seekRange = 140; g.speed = 2.4; }
    F.shibaG.order = 'move'; F.shibaG.dest = { x: 40, z: -8 };
    F.shibaG.onArrive = (g) => { g.order = 'attack'; g.seekRange = 80; };
    rt.marker('shiba', centerOf(F.shiba1), () => `柴田の先手・${moraleWord(F.shiba1.morale)}`, { red: true, group: F.shiba1 });
    if (!rt.G.lord) rt.after(2, () => { rt.say('組頭 源八', '寄るまでに、鉄砲と弓を一つずつ放て。借り物じゃ、無駄にするな', 4); lesson(rt, 'b', () => lesson(rt, 'c')); });
    rt.after(40, () => { lessonEnd(rt, 'b'); if (!F.lessonDone?.c) lesson(rt, 'c'); });
    F.front.go();
    rt.after(28, () => {
      if (F.step !== 1) return;
      F.sassaU.invuln = false;
      if (F.sassaU.alive) { F.sassaU.hp = 0; rt.army.kill(F.sassaU, null); }
      rt.banner('佐々孫介、討死', '信長方の名のある者が、次々に倒れる');
      rt.say('足軽', '佐々殿が討たれた！　押される……！', 3);
      F.sassa.morale = Math.min(F.sassa.morale, 30);
      F.front.push('A', 0.5);
    });
    rt.after(48, () => {
      if (F.step !== 1) return;
      rt.banner('前田犬千代', '目の下に矢を受けながら、射手を討ったと伝わる');
      rt.say('組頭 源八', '犬千代め、矢が刺さったまま斬り込んでおる。負けておれぬぞ！', 4);
    });
    rt.after(62, () => {
      if (F.step !== 1) return;
      rt.say('組頭 源八', '信長公のまわりは四十ほどしかおらぬ。ここが踏ん張りどころじゃ！', 4);
    });
  },

  // ② 信長の大音声
  daionjo(rt) {
    const F = rt.flags;
    if (F.step >= 2) return;
    F.step = 2; F.stepT = rt.t;
    rt.setPhase('daionjo');
    rt.unmark('shiba');
    sfx('horagai', 1);
    if (F.nobuU && F.nobuU.alive) { rt.army.play('eshout', F.nobuU.pos, 2); F.nobuU.cheer = 2; }
    rt.banner('信長、大音声で怒鳴る', '主の声に、柴田の兵がひるむ');
    if (!rt.G.lord) rt.say('織田信長', 'うぬら、主に槍を向けるか！', 3.5);
    rt.after(3.5, () => rt.say('足軽', '柴田の兵が逃げていく……！', 3));
    for (const g of F.shiba) if (!gone(g)) { g.noRout = false; g.morale = 0; }
    F.front.push('A', 0); F.front.rout('B', { hideAfter: 16 });
    rt.objDone('main');
    rt.award((t) => { t.side.push('信長の旗のそばで柴田の寄せを受けた'); }, '柴田の寄せを受け止めた');
    rt.after(8, () => this.hayaCome(rt));
  },

  // ③ 南から林美作守
  hayaCome(rt) {
    const F = rt.flags;
    if (F.step >= 3) return;
    F.step = 3; F.stepT = rt.t;
    rt.setPhase('hayashi');
    sfx('taiko', 1);
    rt.banner('林美作守、南から', '林の七百が、信長の旗の横を突く');
    rt.obj('main', '南から来る林美作守の隊を崩せ', 'main');
    rt.say('組頭 源八', '向き直れ！　南じゃ、林の手が来る！', 3.5);
    if (F.hayaFar) F.hayaFar.visible = false;
    F.haya1 = enemyGroup(rt, { faction: 'nobukatsu', name: '林の先手', anchor: { ...HAYA0 }, facing: -Math.PI * 0.75, fleeDir: { x: 0.4, z: 1 }, aggro: 10, width: 16, noRout: true, formation: 'yari', order: 'attack', seekRange: 150, dmgMult: 0.55, defMult: 1.05, speed: 2.6 },
      dress([{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 28 }, { type: 'bow', n: 4 }], HAYA));
    F.hayaG = enemyGroup(rt, { faction: 'nobukatsu', name: '林美作守の旗本', anchor: { x: HAYA0.x + 10, z: HAYA0.z + 10 }, facing: -Math.PI * 0.75, fleeDir: { x: 0.4, z: 1 }, aggro: 6, width: 12, noRout: true, formation: 'yari', dmgMult: 0.55, defMult: 1.2 },
      dress([{ type: 'busho', n: 1, o: { name: '林美作守', invuln: true, horse: true, hat: 'kabuto_m', haori: 0x3a3a2a } }, { type: 'samurai', n: 4 }, { type: 'ashigaru', n: 16 }], HAYA));
    F.hayaU = F.hayaG.units.find((u) => u.type === 'busho');
    F.hayaU.dmg *= 0.5;
    F.hayaG.order = 'move'; F.hayaG.dest = { ...HAYA1 }; F.hayaG.speed = 2.2;
    F.hayaG.onArrive = (g) => { g.order = 'attack'; g.seekRange = 60; };
    F.haya = [F.haya1, F.hayaG];
    KIT.backOf(rt, F.haya1, { flag: 'sujikai', armor: HAYA.armor, kind: 'spear', w: 18, depth: 10, count: 110, seed: 1563 });
    // 黒田半平が美作守に挑む
    F.kuroda = allyGroup(rt, { name: '黒田半平', anchor: { x: NOBU.x + 16, z: NOBU.z + 24 }, facing: Math.PI * 0.75, width: 6, aggro: 14, noRout: true, order: 'attack', seekRange: 90 },
      dress([{ type: 'samurai', n: 1, o: { name: '黒田半平', invuln: true, keep: true } }, { type: 'samurai', n: 2 }], ODA));
    F.kuroda.focus = F.hayaU;
    for (const g of [F.hata, F.mori, F.inu]) { g.order = 'move'; g.dest = { x: HAYA1.x - 14, z: HAYA1.z - 16 }; g.onArrive = (gg) => { gg.order = 'attack'; gg.seekRange = 60; }; }
    // 空馬に乗って林の手へ（使番の馬を借りる）
    if (!rt.G.lord && !rt.player.mounted) {
      lessonEnd(rt, 'c');
      const pp = rt.player.u.pos;
      F.tsukai = allyGroup(rt, { name: '使番', anchor: { x: pp.x - 3, z: pp.z - 3 }, facing: Math.PI / 2, width: 3, aggro: 4, noRout: true, fixed: true },
        dress([{ type: 'samurai', n: 1, o: { name: '使番', invuln: true, horse: true, keep: true } }], ODA));
      rt.after(1, () => {
        const u = F.tsukai.units[0];
        // 使番が馬を降りて手綱を渡す（army の空馬の並びに足す。乗れる身分でなくても、空馬には乗れる）
        const h = u && u.alive && u.horse;
        if (h) {
          rt.army.setMounted(u, false);
          if (h.parent) h.parent.remove(h);
          h.position.copy(u.mesh.position); h.position.x += 1.6; h.rotation.set(0, u.heading, 0);
          rt.scene.add(h);
          const L = rt.army.looseHorses || (rt.army.looseHorses = []);
          L.push({ h, heading: u.heading, spd: 0, t: 0, from: { team: 0, house: '織田', name: '', speed: 1, hp: 150, maxHp: 150, hfat: 0 } });
        }
        rt.say('使番', `${nm(rt)}、この馬を使え！　林の手の横へ回れ`, 3.5);
        lesson(rt, 'd');
      });
      rt.after(70, () => lessonEnd(rt, 'd'));
    }
    rt.marker('haya1', centerOf(F.haya1), () => `林の先手・${moraleWord(F.haya1.morale)}`, { red: true, group: F.haya1 });
    rt.marker('hayaU', unitPos(F.hayaU), '林美作守', { red: true, h: 3.4 });
  },

  // 美作守を信長が討つ
  hayaFell(rt) {
    const F = rt.flags;
    if (F.step >= 4) return;
    F.step = 4; F.stepT = rt.t;
    rt.setPhase('hayafell');
    rt.unmark('haya1'); rt.unmark('hayaU');
    if (F.hayaU.alive) { F.hayaU.invuln = false; F.hayaU.hp = 0; rt.army.kill(F.hayaU, F.nobuU && F.nobuU !== rt.player.u ? F.nobuU : null); }
    rt.banner(rt.G.lord ? '林美作守を討ち取った' : '信長、林美作守を討つ', '黒田半平と斬り合う所へ、信長公が自ら槍を付けた');
    rt.say('足軽', '美作守が倒れた！　林の手が崩れるぞ！', 3);
    for (const g of F.haya) if (!gone(g)) { g.noRout = false; g.morale = 0; }
    rt.objDone('main');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '稲生の野で林の手を崩した', pts: 18 }; }, '林の手を崩した');
    rt.after(4, () => this.regroup(rt));
  },

  // ④ 追わずに旗へ戻る
  regroup(rt) {
    const F = rt.flags;
    if (F.step >= 5) return;
    F.step = 5; F.stepT = rt.t;
    rt.setPhase('regroup');
    sfx('horagai', 0.8);
    rt.say('組頭 源八', '追うな！　同じ織田の者じゃ。信長の旗へ戻れ', 3.5);
    for (const g of [F.hata, F.mori, F.inu, F.kuroda]) if (!gone(g)) { g.order = 'move'; g.dest = { x: NOBU.x + 20, z: NOBU.z + 14 }; g.onArrive = (gg) => { gg.order = 'hold'; gg.anchor = { x: NOBU.x + 20, z: NOBU.z + 14 }; }; }
    rt.obj('back', '信長の旗へ戻れ', 'main');
    rt.marker('back', { x: NOBU.x + 20, z: NOBU.z + 14 }, '信長の旗');
    F.backEnd = rt.t + 40;
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.unmark('back');
    rt.objDone('back');
    if (!F.strayed) rt.objDone('stay');
    sfx('horagai', 0.8);
    rt.banner('稲生の戦い、信長方の勝ち', '信勝方は末森の城へ退く');
    if (!rt.G.lord) rt.say('織田信長', '首は要らぬ。勘十郎には母上がとりなす。……尾張は、まだ一つにならぬ', 5);
    rt.after(5, () => rt.say('組頭 源八', `${nm(rt)}、よう生き残った。四年の後、今川が来る。槍を磨いておけ`, 4.5));
    rt.player.u.invuln = true;
    rt.finish({}, 10);
  },

  update(rt, dt) {
    const F = rt.flags;
    const p = rt.player.u.pos;
    for (const q of F.backs || []) if (!q.gone && (q.g.routed || !q.g.count)) { q.gone = true; q.b.rout({ hideAfter: 16 }); rt.after(16.5, () => { q.b.visible = false; }); }
    KIT.backTick(rt);
    // 手ほどきの段を、本人の動きから見る
    if (F.lesson) {
      const P = rt.player;
      F.look += Math.abs(((P.yaw - F.yaw0 + Math.PI * 3) % (Math.PI * 2)) - Math.PI); F.yaw0 = P.yaw;
      if (F.look > 1.6) rt.tutMark('look');
      if ((P.lastCmd || null) !== F.lc0) { F.lc0 = P.lastCmd || null; if (P.lastCmd) rt.tutMark('cmd'); }
      if (F.lesson === 'b') {
        if (P.weapon === 'gun' && !P.gunLoaded) F.gunShot = true;
        if (F.gunShot) rt.tutMark('gun');
        if (P.bowAmmo < F.bow0) rt.tutMark('bow');
        if (F.gunShot && P.bowAmmo < F.bow0 && P.weapon === 'spear') rt.tutMark('spear');
      }
      if (F.lesson === 'd') { if (P.mounted) { F.rode = true; rt.tutMark('ride'); } else if (F.rode) rt.tutMark('dismount'); }
    }
    if (F.ending) return;
    // 信長の旗から離れたか（柴田と林の間）
    const lead = F.nobuU && F.nobuU.alive ? F.nobuU.pos : NOBU;
    if (!rt.G.lord && F.step >= 1 && F.step < 5 && !F.strayed) {
      const d = Math.hypot(p.x - lead.x, p.z - lead.z);
      F.strayT = d > 42 ? (F.strayT || 0) + dt : 0;
      if (F.strayT > 6) { F.strayed = true; rt.violation('信長の旗を離れた', ['組頭 源八', '戻れ！　信長の旗を離れて何とする！']); rt.objFail('stay'); }
    }
    if (F.step === 1) {
      const n = live(F.shiba);
      rt.objProgress('main', `柴田勢 ${n}人`);
      if (F.shiba1.count < 12) F.shiba1.noRout = false;
      // 柴田勢が減るか、時がたてば大音声
      if ((rt.t - F.stepT > 75 && n < 50) || rt.t - F.stepT > 115) this.daionjo(rt);
    }
    if (F.step === 3) {
      const n = live(F.haya);
      rt.objProgress('main', `林勢 ${n}人`);
      if (F.haya1.count < 10) F.haya1.noRout = false;
      // 美作守の旗本が薄くなるか、時がたてば、信長公が自ら討つ
      const guard = gone(F.hayaG) ? 0 : F.hayaG.count - 1;
      if ((rt.t - F.stepT > 60 && (guard < 8 || n < 22)) || rt.t - F.stepT > 120) this.hayaFell(rt);
    }
    if (F.step === 5) {
      const d = Math.hypot(p.x - (NOBU.x + 20), p.z - (NOBU.z + 14));
      rt.objProgress('back', `あと ${Math.round(d)}m`);
      if (d < 12 || rt.t > F.backEnd) this.win(rt);
    }
  },

  onKill(rt, v, k) {
    const F = rt.flags;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
  },
  onRout(rt, g) {
    const F = rt.flags;
    if (g.team !== 1) return;
    if (g === F.shiba1 && F.step === 1) rt.say('足軽', '柴田の先手が崩れたぞ！', 2.5);
    else if (g === F.haya1 && F.step === 3) rt.say('足軽', '林の先手が崩れた！　旗本が裸じゃ！', 2.5);
  },
};

inou.taisho = { a: null, b: null };
inou.rts = true;
inou.sides = { a: { name: '信長方', mon: 'oda' }, b: { name: '信勝方', mon: 'kari' } };
inou.introSides = { a: '信長方 約七百', b: '信勝方 約千七百' };
// 信長公記の数：信長方 七百足らず、信勝方 柴田勝家 千・林美作守 七百
inou.force = (rt) => {
  const F = rt.flags;
  return { a: Math.max(0, 700 - (F.ak || 0) * 4), a0: 700, b: Math.max(0, 1700 - (F.ek || 0) * 6 - (F.step >= 2 ? 500 : 0) - (F.step >= 4 ? 500 : 0)), b0: 1700 };
};
inou.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 && !rt.flags.lesson ? '柴田の寄せまで待つ' : '');
inou.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
inou.date = () => '弘治二年八月二十四日　秋・晴・昼';
inou.history = '弘治二年（1556）八月二十四日、尾張の稲生の野で、織田信長と弟の信勝（信行）の兵が戦った。父の信秀が亡くなった後、家老の林秀貞・林美作守の兄弟と柴田勝家は信勝を立てようとした。信長は佐久間大学（盛重）に名塚に砦を築かせ、於多井川（庄内川）を渡って東へ出た。『信長公記』は、柴田勢千ほど、林美作守の七百ほどに対し、信長方は七百に足らなかったと記す。はじめ柴田勢に押され、佐々孫介らが討たれ、信長のまわりは四十ほどになった。信長が大声で怒鳴ると、柴田の兵は主の声に恐れて逃げたという。信長は南の林勢へ向かい、黒田半平と斬り合う美作守を自ら討った。前田犬千代（利家）が目の下を射られながら射手を討ったのもこの戦と伝わる。信勝は母の土田御前のとりなしで許されたが、のちに再び背き、清洲で討たれた。信長はこの後、浮野の戦いで岩倉の織田家も破り、尾張をほぼ一つにまとめた。兵の細かな配置、林勢の寄せ口、旗印、名塚の砦の形、短い時間は遊びのための推定。地形は国土地理院の標高を丸めて使った。';

// 素直な遊び手：信長の旗のそばで戦い、柴田、次に林の手へ。最後は旗へ戻る
inou.botBrain = (b, inp, { goTo }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW');
  if (!u.alive || F.ending) return;
  if (u.hp < u.maxHp * 0.55) b.botRest = true;
  if (b.botRest && u.hp > u.maxHp * 0.85) b.botRest = false;
  const lead = F.nobuU && F.nobuU.alive && F.nobuU !== u ? F.nobuU.pos : NOBU;
  if (b.botRest) { inp.guardHold = false; goTo(p, inp, lead.x - 6, lead.z, 2); return; }
  if (F.step >= 5) { goTo(p, inp, NOBU.x + 20, NOBU.z + 14, 3); return; }
  const e = b.army.nearestEnemy(u, 10, (o) => !o.fleeing && !o.invuln && Math.hypot(o.pos.x - lead.x, o.pos.z - lead.z) < 40);
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d > 2.6) inp.k.add('KeyW');
    if (d < 3.2 && Math.random() < 0.5) inp.leftPressed = true;
    inp.guardHold = (b.army.threats || []).length > 0 && Math.random() < 0.85;
    return;
  }
  inp.guardHold = false;
  if (F.step === 3) { const t = F.haya.find((g) => !gone(g)); if (t) { const c = t.center(); if (Math.hypot(c.x - lead.x, c.z - lead.z) < 36) { goTo(p, inp, c.x, c.z, 2); return; } } }
  goTo(p, inp, lead.x + 6, lead.z + 3, 3);
};

export { inou };
