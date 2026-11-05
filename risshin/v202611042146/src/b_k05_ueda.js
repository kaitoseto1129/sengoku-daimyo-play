// ======================================================================
// 徳川編 5　第二次上田合戦（慶長五年九月六日・1600　秋・晴）　筋書きの正：docs/chapter3_tokugawa.md の「5.」
// 手本と出所：docs/battle_refs/k05_ueda.md
// 中山道を西へ向かう徳川秀忠の三万八千が、上田城の真田昌幸・信繁（およそ二千五百）に行く手を阻まれた。
// 長男の信之は徳川方で、戸石城を受け取りに行っている（父・弟と分かれた。この戦の場には出ない）。
// 秀忠は染屋台に本陣を置き、牧野康成に城下の稲を刈らせて真田を誘った。城から真田の兵が打って出て刈田の衆を襲い、
// 本多忠政・大久保忠隣の手が押し返して大手門まで追った。門の上の鉄砲と、門から打って出た槍、虚空蔵山の方から横を突く信繁の手に、
// 追い込んだ先手は討たれ、秀忠の命で引き揚げた。城は落ちず、家康の急使を受けた秀忠は西へ急ぎ、関ヶ原（九月十五日）に間に合わなかった。
// 主人公は本多忠政の先手の侍大将。目標は五つ（STAGES）：
//   ①刈田の衆を襲う真田の兵を討つ ②退く真田を追い、大手門の前へ ③門から打って出た槍を討つ ④横から来る信繁の手を押し返す ⑤神川を渡り秀忠の本陣の前へ退く
// 時間の制限は目標ごと（AP8）。負け：本人が討たれる・時のうちに果たせない。
// 11/3 kaito AP〜AT：見せかけの軍勢（farHost・clash・backOf）は置かず、見える兵は全部本物。旗は徳川・本多・大久保・榊原・真田だけ。
//   総大将の秀忠は神川の東の本陣で旗本に囲まれ、昌幸は城の内から出ない（AT3）。名のある将は全員馬上。
//   兵の比：両軍の総勢は三万八千対二千五百。城下で組む所だけは寄せ手が多いが、門の前と信繁の横撃で押し返される（史実の難しさ）。
// 向き：北が -z。上田城は原点の北、東が +x（神川と染屋台）。地形：国土地理院の標高（dem_ueda.js）。ゲームの 1 が実の 4m。
// ======================================================================
import DEM from './dem_ueda.js';
import { demSample } from './dem.js';
import { nobori, yagura, hut, tawara, dobei, sumiyagura, jinmaku, kagaribi, yaguramon, hasa } from './props.js';
import { enemyGroup, allyGroup, nm, wallLine } from './bhelp.js';
import { KIT } from './b_nagashinojo.js';
import { farSight } from './far_sight.js';
import { GENERALS } from './units_data.js';
import { STAGES, KILLS, cut } from './stages.js';
import { TEGARA_ON } from './merit.js';
import { sfx } from './audio.js';
import { timeslipField } from './timeslip_field.js';

const ID = 'k05_ueda';
TEGARA_ON.add(ID);

// ---- 名のある武将の甲冑（無ければ足す）。黒を基本に、威しの色だけで分ける（AV1） ----
const face = (o) => ({ w: 1.05, jaw: 1.1, chin: 1, cheek: 1, gaunt: 0.2, brow: 1.2, nose: 1, nw: 1.1, eye: 1.1, t: 5, hair: 0x15110d, age: 40, ...o });
const give = (name, g) => { GENERALS[name] ||= { horo: 0, haoriMonCol: 0xe6dfcf, skin: 0x9c7453, ...g }; };
give('徳川秀忠', { armor: 0x1c1a18, lace: 0x2a3a58, hat: 'kabuto_s', haori: 0x22283a, mon: 'tokugawa', tack: 0x2a2018, lord: true,
  face: face({ age: 22, jaw: 1, brow: 1, beard: { mus: 0.3, musW: 0.9, droop: 0.2, goat: 0, side: 0, stub: 0.3 } }) });
give('榊原康政', { armor: 0x1e1c1a, lace: 0x2a3a58, hat: 'kabuto_m', haori: 0x2a2a30, mon: 'none',
  face: face({ age: 53, gaunt: 0.4, beard: { mus: 0.7, musW: 1, droop: 0.4, goat: 0.4, side: 0.3, stub: 0.7 } }) });
give('牧野康成', { armor: 0x201e1c, lace: 0x4a3a2a, hat: 'kabuto_w', haori: 0x2e2620, mon: 'none',
  face: face({ age: 52, beard: { mus: 0.6, musW: 1, droop: 0.4, goat: 0.3, side: 0.2, stub: 0.6 } }) });
give('大久保忠隣', { armor: 0x1c1c1e, lace: 0x2e3a52, hat: 'kabuto_m', haori: 0x28282a, mon: 'none',
  face: face({ age: 48, brow: 1.3, beard: { mus: 0.7, musW: 1, droop: 0.4, goat: 0.3, side: 0.3, stub: 0.7 } }) });
give('真田昌幸', { armor: 0x1c1816, lace: 0x7a2a20, hat: 'kabuto_m', haori: 0x2a1c18, mon: 'sanada', lord: true,
  face: face({ age: 54, gaunt: 0.5, brow: 1.4, beard: { mus: 0.8, musW: 1, droop: 0.5, goat: 0.5, side: 0.3, stub: 0.8 } }) });

// ---- 場所 ----
const C = { x: -10, z: -30 };                  // 上田城の本丸
const GATE = { x: 22, z: -30 };                // 大手門（東向き）
const FRONT = { x: 40, z: -30 };               // 大手門の前の町屋の外れ
const TOWN = { x: 62, z: -20 };                // 城下の町屋
const KARI = { x: 70, z: -66 };                // 城下の北の田（牧野康成の手が稲を刈る）
const KOKUZO = { x: 46, z: -118 };             // 北の林（虚空蔵山の方。信繁の手が出て来る）
const FORD = { x: 112, z: 0 };                 // 神川の浅瀬
const HONJIN = { x: 168, z: 6 };               // 秀忠の本陣（神川の東の染屋台。旗本に囲まれて動かない）
const RET = { x: 146, z: 4 };                  // 退く先（本陣の前）
const START = { x: 92, z: -52 };
const RIVER = [[108, -260], [112, -80], [106, 60], [110, 260]];
// 東の堀（神川から水を引いた。大手門の前だけ土橋で切れる。寄せ手は水に足を取られ、塀の内の鉄砲に撃たれる。BA7・AV9）
const MOAT_N = [[GATE.x + 6, -33.5], [GATE.x + 6, -64], [-24, -64]];
const MOAT_S = [[GATE.x + 6, -26.5], [GATE.x + 6, 4], [-24, 4]];
const T1 = 200, T2 = 150, T3 = 200, T4 = 200, T5 = 150;
const STEP_TEXT = ['',
  '北の田で稲を刈る牧野康成の手へ走り、城から打って出た真田の兵を討て',
  '退く真田の兵を追い、町屋を抜けて大手門の前まで進め',
  '大手門の前に踏みとどまり、門から打って出た真田の槍を討て',
  '北の林から横を突く真田信繁の手を押し返せ',
  '秀忠の退けの命。神川を渡り、東の秀忠の本陣の前まで退け'];
const STEP_T = [0, T1, T2, T3, T4, T5];

const XY = 4, DEM0 = demSample(DEM, C.x * XY, C.z * XY);
function height(x, z) {
  let h = (demSample(DEM, x * XY, z * XY) - DEM0) * 0.4;
  h += 0.18 * Math.sin(x * 0.05) * Math.cos(z * 0.04);
  return h;
}

const live = (g) => g && g.units.some((u) => u.alive && !u.gone && !u.fleeing);
const aliveN = (g) => (g ? g.units.reduce((n, u) => n + (u.alive && !u.gone && !u.fleeing ? 1 : 0), 0) : 0);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
// 真田の兵も黒い具足（赤備えは大坂の陣の時。AV1）。徳川の諸隊はそれぞれの家の旗
const SA = { flag: 'sanada', armor: 0x221e1b };
const dress = (look) => (list) => list.map((s) => ({ ...s, o: { ...look, ...(s.o || {}) } }));
const saD = dress(SA), tkD = dress({ flag: 'tokugawa' }), hoD = dress({ flag: 'honda' }), okD = dress({ flag: 'okubo' }), skD = dress({ flag: 'sakakibara' });
const uS = (n) => ({ type: 'samurai', n }), uA = (n) => ({ type: 'ashigaru', n }), uG = (n) => ({ type: 'gun', n });
const bu = (name, o = {}) => ({ type: 'busho', n: 1, o: { name, invuln: true, horse: true, ...o } });
const PIN = { x: 0, z: 0, r: 8, hide: 6, always: true, silent: true, enemy: false, unit: null, follow: false, fire: false, gate: false, defend: false, waiting: false, arrived: false, area: false, route: false };
const mmss = (s) => { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

const k05_ueda = {
  // 身の回りの合戦の跡（timeslip_field.js）。上田：九月初め（今の十月）の刈田。乾いた土、稲を刈った後の黄土の草、神川の岸の葦
  timeslip: {
    wet: 0.15, dust: 0.6, trample: 0.3, debris: 1.1, arrows: 0.9, reeds: 0.4,
    grass: 0xb3a17c, grassTints: [0xffffff, 0xeee1c7, 0xd9c9a8], grassH: 1, grassLift: 0.2, grassShape: 'blade', tallGrass: 0.7,
    flagColors: [0xe6dfcc, 0x24211e, 0x5a4a36],
  },
  spawn: { x: START.x, z: START.z, heading: -Math.PI * 0.75 },
  minutes: 16,
  noWake: true,
  noFrontFill: true,       // 見せかけの軍勢を重ねない（AA・AF・AP9・AQ6）。見える兵は全部本物
  noDistantBattle: true,
  noLeaderFollow: true,    // 行き先の印は段ごとの一つだけ
  compactIntro: true,
  introText: () => '上田城下の田で、牧野康成の手が稲を刈る。城から打って出る真田を討ち、大手門まで追え。',
  hideGuideSteps: true,
  noCouriers: true,
  noTaisho: true,
  noReserve: true,
  noTaishoRaid: true,
  foeMarks: true,
  playerAtkMax: 3,
  playerTaken: 0.5,
  playerRegen: 0.025,
  closeCombatAssist: true,
  noWinCrane: true,
  // 行き先のピン：段ごとに一つ（字は出さない）。場所は段ごとに決まっている（AW3）
  missionPin(rt) {
    const F = rt.flags;
    if (!F.step || F.ending) return null;
    const c = (...gs) => { for (const g of gs) if (live(g)) return g.center(); return null; };
    let p = KARI;
    if (F.step === 1) p = c(F.sortie) || KARI;
    else if (F.step === 2) p = FRONT;
    else if (F.step === 3) p = c(F.yari) || FRONT;
    else if (F.step === 4) p = c(F.nobushige) || { x: FRONT.x + 10, z: FRONT.z - 20 };
    else if (F.step === 5) p = RET;
    PIN.x = p.x; PIN.z = p.z; PIN.r = F.step === 2 || F.step === 5 ? 9 : 8;
    return PIN;
  },
  talk: {
    before: [['本多忠政', '上田の城は小さいが、昌幸は戦上手じゃ。殿（秀忠）は牧野殿に城下の稲を刈らせ、真田を誘い出す'],
      ['牧野康成', '刈れ、刈れ。真田の米を一粒も城へ入れるな'],
      ['本多忠政', '城から兵が出れば、我らが叩く。門へは深追いするな']],
    after: [['真田昌幸', '徳川の大軍を、この小城で足止めしてやったわ'], ['徳川秀忠', '……間に合うまい。関ヶ原には、間に合うまい']],
  },
  world: {
    seed: 1600906, time: 'day',
    groundHalf: 260, moveLim: 250,
    height,
    waterSlow: true,
    streams: [{ pts: RIVER, w: 12, depth: 1.8 }, { pts: MOAT_N, w: 3, depth: 1.2 }, { pts: MOAT_S, w: 3, depth: 1.2 }],
    fieldStage: 'harvest',
    paths: [[[HONJIN.x + 30, 8], [HONJIN.x, 6], [FORD.x + 6, 2], [TOWN.x + 10, TOWN.z + 6], [FRONT.x, FRONT.z], [GATE.x + 2, GATE.z]], [[KARI.x + 10, KARI.z + 6], [TOWN.x + 6, TOWN.z - 4]]],
    tint(x, z, h, c) {
      c.setRGB(c.r * 0.52 + 0.24, c.g * 0.5 + 0.2, c.b * 0.4 + 0.08);   // 秋の刈田
      if (Math.hypot(x - C.x, z - C.z) < 40) c.setRGB(c.r * 0.7 + 0.1, c.g * 0.65 + 0.08, c.b * 0.55 + 0.05);
    },
    clear: (x, z) => (x > -30 && x < 200 && Math.abs(z) < 90) || dist({ x, z }, KOKUZO) < 14,
    trees: 220,
    tufts: 2600,
    treeDensity: (x, z) => (x < -30 || z < -96 || z > 90 ? 1 : 0.1),
    groves: [{ x: 84, z: 46, r: 10, n: 12 }, { x: 30, z: -104, r: 18, n: 30 }, { x: 64, z: -108, r: 14, n: 20 }],
    fleeOut: (x, z, team) => (team === 1 ? x < -40 : x > 240),
  },
  sides: { a: { name: '徳川秀忠軍', mon: 'tokugawa' }, b: { name: '真田昌幸・信繁　上田城', mon: 'sanada' } },
  date: () => '慶長五年（1600）九月六日　信濃国 上田・晴',

  setup(rt) {
    timeslipField(rt);   // 身の回りの踏み荒らした地面・倒れた槍と旗・季節の草（def.timeslip）
    const F = rt.flags, W = rt.world, S = rt.scene;
    F.step = 0; F.holdPlayer = true; F.foes = []; F.ending = false; F.ek = 0; F.ak = 0;
    // ---- 上田城：土塀・大手門（櫓門）・櫓。城は落とせない ----
    const castle0 = S.children.length;
    wallLine(rt, [[GATE.x, GATE.z - 30], [GATE.x, GATE.z - 4]], { team: 1, hp: 1e9, name: '城の土塀', mesh: dobei, segLen: 5, h: 2.4 });
    wallLine(rt, [[GATE.x, GATE.z + 4], [GATE.x, GATE.z + 30]], { team: 1, hp: 1e9, name: '城の土塀', mesh: dobei, segLen: 5, h: 2.4 });
    wallLine(rt, [[GATE.x, GATE.z - 30], [C.x - 30, GATE.z - 30], [C.x - 30, GATE.z + 30], [GATE.x, GATE.z + 30]], { team: 1, hp: 1e9, name: '城の土塀', mesh: dobei, segLen: 5, h: 2.4 });
    try { S.add(yaguramon(W, GATE.x, GATE.z, 7, Math.PI / 2, { doors: false, inside: false })); } catch (e) { console.warn(e); }
    for (const [x, z] of [[GATE.x - 3, GATE.z - 28], [GATE.x - 3, GATE.z + 28], [C.x - 28, GATE.z - 28]]) S.add(yagura(W, x, z, { mon: 'sanada', team: 1 }));
    S.add(sumiyagura(W, GATE.x - 2, GATE.z - 10, { w: 6, d: 5, base: 1.4 }), sumiyagura(W, GATE.x - 2, GATE.z + 10, { w: 6, d: 5, base: 1.4 }));
    // 六文銭の幟：土塀の内に並べ、寄せ手から城の守りが見えるように（Q・動かない城にだけ）
    for (const [x, z] of [[GATE.x - 10, GATE.z - 14], [GATE.x - 10, GATE.z + 14], [C.x, C.z], [GATE.x - 4, GATE.z - 22], [GATE.x - 4, GATE.z - 16], [GATE.x - 4, GATE.z + 16], [GATE.x - 4, GATE.z + 22],
      [GATE.x - 6, GATE.z - 5], [GATE.x - 6, GATE.z + 5], [C.x + 4, C.z - 8], [C.x + 4, C.z + 8], [C.x - 22, C.z - 22], [C.x - 22, C.z + 22]]) S.add(nobori(W, x, z, 'sanada', 7));
    // 本丸の二重櫓（今の西櫓と同じ下見板と白壁の二重。町屋の屋根越しに城の姿が見える）
    S.add(sumiyagura(W, C.x + 6, C.z - 14, { w: 9, d: 7, base: 4.2 }), sumiyagura(W, C.x + 6, C.z + 16, { w: 8, d: 6, base: 3.6 }));
    farSight(S.children.slice(castle0), { W, ground: { x: C.x + 10, z: C.z, r: 50 } });
    // ---- 城下の町屋と北の田（刈った稲を掛けた稲架） ----
    for (const [x, z, w, d, r] of [[TOWN.x - 8, TOWN.z - 10, 9, 6, 0.1], [TOWN.x + 6, TOWN.z - 8, 8, 6, -0.1], [TOWN.x - 4, TOWN.z + 14, 9, 6, 0.2], [TOWN.x + 10, TOWN.z + 12, 8, 5, 0], [FRONT.x + 4, FRONT.z - 12, 8, 5, 0.05], [FRONT.x + 6, FRONT.z + 12, 8, 5, -0.05]]) S.add(hut(W, x, z, w, d, r));
    S.add(tawara(W, TOWN.x + 20, TOWN.z, 0.3, 4));
    try { for (const [x, z] of [[KARI.x - 8, KARI.z - 6], [KARI.x + 8, KARI.z - 8], [KARI.x, KARI.z + 8]]) S.add(hasa(W, x, z, 0.2)); } catch (e) { console.warn(e); }
    // ---- 秀忠の本陣（神川の東・染屋台）：幕と葵の旗・篝火 ----
    S.add(jinmaku(W, HONJIN.x + 6, HONJIN.z, 18, 12, 6, { mon: 'tokugawa' }));
    for (const dz of [-10, -5, 0, 5, 10]) S.add(nobori(W, HONJIN.x - 6, HONJIN.z + dz, 'tokugawa', 6));
    for (const dz of [-8, 8]) S.add(nobori(W, HONJIN.x + 18, HONJIN.z + dz, 'tokugawa', 6));
    for (const dx of [-6, 0, 6]) S.add(nobori(W, HONJIN.x - 10 + dx, HONJIN.z - 30, 'sakakibara', 6));   // 榊原の陣の後ろ
    S.add(kagaribi(W, HONJIN.x - 2, HONJIN.z + 13));
    KIT.farVillage(rt, 190, 100, { rot: -Math.PI / 2, n: 5, fields: 6, seed: 45 });

    // ---- 徳川方（本物の兵だけ） ----
    F.mine = allyGroup(rt, { faction: 'tokugawa', name: '手勢', fullStrength: true, fixed: true, anchor: { x: START.x + 2, z: START.z + 3 }, facing: -Math.PI * 0.75, width: 5, aggro: 10, speed: 3.6, order: 'hold', noRout: true, dmgMult: 0.9 },
      hoD([uS(4), uA(9), uG(3)]));
    F.honda = allyGroup(rt, { faction: 'tokugawa', name: '本多忠政の先手', fullStrength: true, fixed: true, anchor: { x: START.x + 6, z: START.z - 6 }, facing: -Math.PI * 0.75, width: 7, aggro: 12, speed: 3.6, order: 'hold', noRout: true, formation: 'yari' },
      hoD([bu('本多忠政'), uS(5), uA(16), uG(5)]));
    F.makino = allyGroup(rt, { faction: 'tokugawa', name: '牧野康成の刈田の手', fullStrength: true, fixed: true, anchor: { x: KARI.x + 2, z: KARI.z }, facing: -Math.PI / 2, width: 7, aggro: 10, speed: 3.4, order: 'hold', noRout: true },
      tkD([bu('牧野康成'), uS(3), uA(14)]));
    F.okubo = allyGroup(rt, { faction: 'tokugawa', name: '大久保忠隣の手', fullStrength: true, fixed: true, anchor: { x: TOWN.x + 30, z: TOWN.z + 8 }, facing: -Math.PI / 2, width: 7, aggro: 12, speed: 3.6, order: 'hold', noRout: true, formation: 'yari' },
      okD([bu('大久保忠隣'), uS(5), uA(14), uG(3)]));
    // 秀忠の本陣：神川の東で旗本に囲まれ、前に出ない（AR3・AT3）
    F.hide = allyGroup(rt, { faction: 'tokugawa', name: '徳川秀忠の本陣', fullStrength: true, fixed: true, anchor: { x: HONJIN.x, z: HONJIN.z }, facing: -Math.PI / 2, width: 8, aggro: 4, seekRange: 10, order: 'hold', noRout: true },
      tkD([bu('徳川秀忠', { horse: false }), uS(22), uG(6)]));
    F.hideU = F.hide.units.find((u) => u.name === '徳川秀忠');
    if (F.hideU) F.hideU._crouch = true;   // 床几に腰を下ろす
    F.saka = allyGroup(rt, { faction: 'tokugawa', name: '榊原康政の隊', fullStrength: true, fixed: true, anchor: { x: HONJIN.x - 10, z: HONJIN.z - 22 }, facing: -Math.PI / 2, width: 7, aggro: 6, seekRange: 14, order: 'hold', noRout: true, formation: 'yari' },
      skD([bu('榊原康政'), uS(4), uA(10), uG(3)]));
    for (const g of [F.honda, F.okubo, F.makino]) g.ai = true;
    // 真田昌幸は城の内（本丸）にいて出て来ない
    F.masa = this.foe(rt, '真田昌幸の旗本', { x: C.x + 2, z: C.z }, [bu('真田昌幸', { horse: false }), uS(6), uG(2)], { hold: true, width: 5 });
    F.masaU = F.masa.units.find((u) => u.name === '真田昌幸');
    if (F.masaU) F.masaU._crouch = true;   // 本丸で床几に座り、出て来ない
    // 門の上の鉄砲衆（土塀の内に並ぶ。門へ寄る者を撃つ）
    F.wallG = this.foe(rt, '大手門の鉄砲衆', { x: GATE.x - 3, z: GATE.z }, [uS(1), uG(10)], { hold: true, width: 9 });
    F.wallG.facing = Math.PI / 2;
    // 隅櫓の脇の鉄砲衆（北と南の塀の内から、門へ寄る者を横から撃つ。BK3・BJ3）
    F.wallN = this.foe(rt, '北の隅櫓の鉄砲衆', { x: GATE.x - 4, z: GATE.z - 12 }, [uG(6)], { hold: true, width: 6 });
    F.wallS = this.foe(rt, '南の隅櫓の鉄砲衆', { x: GATE.x - 4, z: GATE.z + 12 }, [uG(6)], { hold: true, width: 6 });
    // 信繁の手は初めから北の林に潜む（伏兵。四の段で林から出る。急に湧かせない AT17・AV10）
    F.nobushige = this.foe(rt, '真田信繁の手', { x: KOKUZO.x, z: KOKUZO.z }, [bu('真田信繁', { hat: 'kabuto_sanada' }), uS(6), uA(20), uG(4)], { hold: true, width: 8, morale: 100, dmg: 0.6 });
    F.nobushige.seekRange = 8; F.nobushige.aggro = 6;
    const T = this.talk.before;
    T.forEach(([who, s], i) => rt.after(0.6 + i * 3.6, () => rt.say(who, s, 3.4)));
    rt.after(0.6 + T.length * 3.6, () => { F.holdPlayer = false; this.toStep(rt, 1); });
  },

  // 真田の隊を出す（見える所に湧かせない。城の門の内か、北の林から）
  foe(rt, name, at, list, o = {}) {
    const F = rt.flags;
    const g = enemyGroup(rt, { faction: 'toyotomi', name, fixed: true, anchor: { x: at.x, z: at.z }, facing: o.facing ?? Math.PI / 2, width: o.width || 6, noRout: true, formation: 'line',
      morale: o.morale || 95, dmgMult: o.dmg || 0.55, order: o.hold ? 'hold' : 'attack', seekRange: o.hold ? 16 : 90, aggro: o.hold ? 12 : 16, speed: 3.8, fire: true }, saD(list));
    if (o.aim) { g.anchor = { x: o.aim.x, z: o.aim.z }; g.order = 'move'; g.dest = { x: o.aim.x, z: o.aim.z }; g.onArrive = (q) => { if (q.order === 'move') q.order = 'attack'; }; }
    if (!o.hold) rt.after(40, () => { g.noRout = false; });
    F.foes.push(g);
    return g;
  },
  // 城の内へ退かせる（門をくぐったら去らせる）
  back(g) {
    if (!live(g)) return;
    g.order = 'retreat'; g.dest = { x: GATE.x - 12, z: GATE.z }; g.speed = 4.3; g.aggro = 0; g.noRout = false;
  },

  toStep(rt, n) {
    const F = rt.flags;
    if (F.step >= n || F.ending) return;
    if (F.step) rt.objDone('s' + F.step);
    F.step = n; F.stepT = rt.t;
    rt.obj('s' + n, STEP_TEXT[n], 'main');
    if (n === 1) {
      sfx('horagai', 0.8);
      // 大手門から真田の兵が打って出て、北の田の刈田の手を襲う
      F.sortie = this.foe(rt, '打って出た真田の兵', { x: GATE.x - 6, z: GATE.z - 2 }, [uS(4), uA(16), uG(4)], { aim: { x: KARI.x - 4, z: KARI.z + 2 }, width: 7 });
      F.w1N = aliveN(F.sortie);
      F.honda.order = 'attack'; F.honda.seekRange = 50; F.honda.anchor = { x: KARI.x, z: KARI.z + 4 };
      // 大久保の手も町屋から北の田へ寄せ、刈田の手を襲う真田を挟む（BK1・AP5：自分だけが走らない）
      F.okubo.order = 'attack'; F.okubo.seekRange = 50; F.okubo.anchor = { x: KARI.x + 6, z: KARI.z + 12 };
      rt.after(3, () => rt.say('牧野康成', '城の門が開いた！　真田が刈田を襲うて来るぞ！', 3));
      rt.after(7, () => rt.say('本多忠政', '待っておったわ。田へ走れ、刈田の衆を助けよ！', 3));
    } else if (n === 2) {
      this.back(F.sortie);
      rt.banner('真田の兵、城へ退く', '町屋の小路を大手門へ');
      rt.say('大久保忠隣', '逃がすな！　門まで追い詰めよ！', 3);
      rt.after(3.5, () => rt.say('本多忠政', '深追いはならぬと言うたが……もう止まらぬ。続け！', 3));
      for (const [g, p] of [[F.honda, { x: FRONT.x + 8, z: FRONT.z - 6 }], [F.okubo, { x: FRONT.x + 8, z: FRONT.z + 6 }], [F.makino, { x: TOWN.x + 6, z: TOWN.z - 14 }]]) {
        g.order = 'move'; g.dest = p; g.speed = 3.8; g.onArrive = (q) => { q.order = 'hold'; q.anchor = { x: p.x, z: p.z }; };
      }
    } else if (n === 3) {
      sfx('taiko', 1);
      rt.banner('大手門', '門の上から鉄砲、門から槍');
      sfx('volley', 0.9);
      for (let i = 0; i < 6; i++) rt.army.smoke(GATE.x - 2, rt.world.heightAt(GATE.x, GATE.z) + 2.6, GATE.z - 8 + i * 3.2, 1, 0);
      F.yari = this.foe(rt, '門から打って出た真田の槍', { x: GATE.x - 8, z: GATE.z }, [uS(5), uA(20), uG(3)], { aim: { x: FRONT.x + 2, z: FRONT.z }, width: 8, morale: 98 });
      F.w3N = aliveN(F.yari);
      for (const g of [F.honda, F.okubo]) { g.order = 'attack'; g.seekRange = 30; g.anchor = { x: FRONT.x + 4, z: g === F.honda ? FRONT.z - 4 : FRONT.z + 4 }; }
      rt.after(2, () => rt.say('足軽', '門の上から撃ってくる！　前の者がばたばた倒れる！', 3));
      rt.after(6, () => rt.say('真田昌幸', '引き付けて放て。門の前に寄せた者は、一人も帰すな', 3.2));
    } else if (n === 4) {
      // 信繁の手が北の林から出て、門の前の徳川の先手の横を突く
      sfx('taiko', 1);
      rt.banner('北の林から六文銭', '真田信繁の手が横を突く');
      const nb = F.nobushige, aim = { x: FRONT.x + 6, z: FRONT.z - 6 };
      nb.anchor = { ...aim }; nb.order = 'move'; nb.dest = { ...aim }; nb.seekRange = 90; nb.aggro = 16;
      nb.onArrive = (q) => { if (q.order === 'move') q.order = 'attack'; };
      rt.after(40, () => { nb.noRout = false; });
      F.w4N = aliveN(nb);
      for (const g of [F.honda, F.okubo, F.makino]) if (live(g)) { g.morale -= 15; g.order = 'attack'; g.seekRange = 40; }
      rt.after(3, () => rt.say('大久保忠隣', '横から来たぞ！　槍を北へ向けよ！', 3));
      rt.after(8, () => rt.say('真田信繁', '徳川の先手、門の前で足が止まったわ。揉み潰せ！', 3.2));
    } else if (n === 5) {
      sfx('horagai', 0.9);
      rt.banner('退けの命', '秀忠の使番が来た');
      rt.say('秀忠の使番', '殿のお下知！　先手は引け。神川を越えて本陣へ戻れ！', 3.6);
      rt.after(4, () => rt.say(nm(rt), 'しんがりは我らじゃ。真田に背を見せるな、退きながら突け！', 3.4));
      for (const [g, p] of [[F.okubo, { x: RET.x + 6, z: -14 }], [F.makino, { x: RET.x + 10, z: 20 }], [F.honda, { x: RET.x + 2, z: 4 }]]) {
        if (!live(g)) continue;
        g.order = 'move'; g.dest = p; g.speed = 3.7; g.onArrive = (q) => { q.order = 'hold'; q.anchor = { x: p.x, z: p.z }; };
      }
      // 追い討ちの真田（門から出て、退く先手の背を追う）
      F.oi = this.foe(rt, '追い討ちの真田の兵', { x: GATE.x - 6, z: GATE.z + 2 }, [uS(4), uA(14), uG(3)], { aim: { x: FORD.x - 6, z: 2 }, width: 7 });
      if (live(F.nobushige)) { F.nobushige.order = 'attack'; F.nobushige.anchor = { x: TOWN.x, z: TOWN.z }; }
      rt.after(10, () => rt.say('足軽', '真田が追って来る！　川の手前で追いつかれるぞ！', 3));
    }
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.objDone('s5');
    rt.tracker.main = true;
    rt.player.u.invuln = true;
    for (const g of F.foes) if (g !== F.masa && g !== F.wallG && g !== F.wallN && g !== F.wallS) this.back(g);
    sfx('horagai', 0.8);
    rt.award((t) => { t.main = true; t.special = { label: '上田城下から先手を退かせた', pts: 20 }; }, '上田城下でしんがりを務めた');
    rt.banner('先手、本陣へ退く', '上田城は落ちなかった');
    rt.after(1.5, () => rt.say(this.talk.after[0][0], this.talk.after[0][1], 3.6));
    rt.after(6, () => rt.say('家康の使者', '大御所様より急ぎのお下知。上田にかかずらわず、美濃へ急がれよ', 3.8));
    rt.after(11, () => rt.say(this.talk.after[1][0], this.talk.after[1][1], 3.8));
    rt.finish({ scriptedEnd: true }, 17);
  },

  lose(rt, title, why) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.tracker.main = false;
    rt.objFail('s' + (F.step || 1));
    rt.banner(title, why);
    rt.finish({ scriptedEnd: true, failureReason: why }, 6);
  },

  update(rt, dt) {
    const F = rt.flags;
    KIT.backTick?.(rt);
    if (F.ending || !F.step) return;
    const P = rt.player.u;
    // 手勢は本人の脇に付いて一緒に走る（AP5）
    if ((F.mineT = (F.mineT || 0) - dt) <= 0) {
      F.mineT = 0.6;
      const g = F.mine, c = live(g) && g.center();
      if (c) {
        if (dist(c, P.pos) > 8) { g.order = 'move'; g.dest = { x: P.pos.x + 2, z: P.pos.z + 2.5 }; g.speed = 3.9; }
        else { g.order = 'attack'; g.seekRange = 14; }
      }
    }
    if ((F.scanT = (F.scanT || 0) - dt) > 0) return;
    F.scanT = 0.25;
    const left = STEP_T[F.step] - (rt.t - F.stepT);
    // 城の内へ退いた真田は去らせる（本物の兵の枠を空ける）
    if ((F.gcT = (F.gcT || 0) - 0.25) <= 0) {
      F.gcT = 1;
      for (const g of F.foes) if (g.order === 'retreat') for (const u of g.units) if (u.alive && !u.gone && u.pos.x < GATE.x - 4) rt.army.despawn(u);
    }
    if (left > 0) rt.objProgress('s' + F.step, `あと${mmss(left)}`);
    if (F.step === 1) {
      if (F.w1N - aliveN(F.sortie) >= Math.round(F.w1N * 0.5)) this.toStep(rt, 2);
      else if (left <= 0) this.lose(rt, '刈田の衆が崩れた', '城から出た真田に、刈田の手を討たれた');
    } else if (F.step === 2) {
      if (dist(P.pos, FRONT) < 10) this.toStep(rt, 3);
      else if (left <= 0) this.lose(rt, '追い遅れた', '大手門の前へ進めなかった');
    } else if (F.step === 3) {
      if (F.w3N - aliveN(F.yari) >= Math.round(F.w3N * 0.5)) { this.back(F.yari); rt.say('足軽', '門の槍が引いた！　……北の林が騒がしいぞ', 3); this.toStep(rt, 4); }
      else if (left <= 0) this.lose(rt, '門の前で崩れた', '真田の槍と鉄砲に押し返された');
    } else if (F.step === 4) {
      if (F.w4N - aliveN(F.nobushige) >= Math.round(F.w4N * 0.5)) {
        rt.say('真田信繁', '徳川も粘るわ……一度引け', 2.8);
        this.toStep(rt, 5);
      } else if (left <= 0) this.lose(rt, '横を突かれて崩れた', '信繁の手に先手を揉み潰された');
    } else if (F.step === 5) {
      if (P.pos.x > RET.x - 6 && dist(P.pos, RET) < 16) this.win(rt);
      else if (left <= 0) this.lose(rt, '退き遅れた', '神川の手前で真田に囲まれた');
    }
  },

  onKill(rt, v) {
    const F = rt.flags;
    if (v.team === 1) F.ek++; else F.ak++;
    KIT.carrion(rt, v);
  },
  onRout(rt, g) {
    if (g.team === 1 && g.name && !rt.flags.ending) rt.say('足軽', `${g.name}が城へ引いていく！`, 2.5);
  },

  // bot：近い敵を突き、いなければ段の行き先へ
  botBrain(b, inp, { goTo, patientStrike }) {
    const p = b.player, u = p.u, F = b.flags;
    if (F.holdPlayer || !F.step || F.ending) return;
    const ok = (o) => !o.fleeing && !o.invuln && !o.noTarget && Math.abs(o.pos.y - u.pos.y) < 3 && o.pos.x > GATE.x + 1;
    const e = F.step === 2 || F.step === 5 ? null : b.army.nearestEnemy(u, 9, ok);
    if (e) {
      const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
      if (p.lock && p.lock !== e) inp.e.add('KeyQ');
      p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
      if (d > 2.2) goTo(p, inp, e.pos.x, e.pos.z, 2.2); else inp.k.delete('KeyW');
      patientStrike(p, inp, e, d, true);
      return;
    }
    inp.guardHold = false;
    const t = this.missionPin(b) || RET;
    goTo(p, inp, F.step === 5 ? t.x + 4 : t.x, t.z, 2);
  },
};

// 両軍の総勢：秀忠軍およそ三万八千、上田城の真田勢は二千五百ほど（諸説）
k05_ueda.force = (rt) => {
  const F = rt.flags;
  return { a: Math.max(0, Math.round(38000 - (F.ak || 0) * 30)), a0: 38000, b: Math.max(0, 2500 - (F.ek || 0) * 8), b0: 2500 };
};
k05_ueda.canSkip = (rt) => (!rt.flags.step && rt.t > 3 ? '下知まで待つ' : '');
k05_ueda.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
k05_ueda.history = '慶長五年（1600）、会津征伐から引き返した徳川秀忠は、三万八千の軍を率いて中山道を西へ進んだ。信濃の上田城には、豊臣方（西軍）に付いた真田昌幸と次男・信繁がおよそ二千五百で籠った。長男の信之は徳川方で、真田家は父・弟と長男に分かれた。\n秀忠は降伏を勧めたが昌幸は返事を引き延ばして時を稼いだ。九月五日、信之が戸石城に向かうと、信繁は兄と戦うのを避けて上田城へ退いた。翌六日ごろ、秀忠は牧野康成らに城下の稲を刈らせ、城から出た真田の兵と小競り合いになった。本多忠政・大久保忠隣の手が追って大手門に迫ったが、城の鉄砲と伏兵に押し返され、秀忠は兵を引かせた。\n上田城は落ちず、家康から急ぎ美濃へ上れとの使者を受けた秀忠は西へ急いだが、九月十五日の関ヶ原の決戦に間に合わなかった。戦いの細部（伏兵・神川の堰を切った話など）は軍記物の伝えで、小競り合いだったとする見方もある。';
k05_ueda.bushou = [{ name: '真田信繁', g: /信繁/ }];

const st = (n) => (rt) => (rt.flags.step ?? 0) >= n;
STAGES[ID] = [['刈田の手を襲う真田の兵を討つ'], ['大手門の前まで追う', st(2)], ['門から出た真田の槍を討つ', st(3)], ['北の林から来た真田信繁の手を押し返す', st(4)], ['神川を渡り秀忠の本陣の前へ退く', st(5)]];
// 倒す数（kaito 11/2 O）：段が進む判定と同じ数え方
KILLS[ID] = (rt) => {
  const F = rt.flags;
  if (F.ending) return null;
  if (F.step === 1) return cut(F.w1N, aliveN(F.sortie), F.w1N - Math.round(F.w1N * 0.5));
  if (F.step === 3) return cut(F.w3N, aliveN(F.yari), F.w3N - Math.round(F.w3N * 0.5));
  if (F.step === 4) return cut(F.w4N, aliveN(F.nobushige), F.w4N - Math.round(F.w4N * 0.5));
  return null;
};

export { k05_ueda };
export default k05_ueda;
