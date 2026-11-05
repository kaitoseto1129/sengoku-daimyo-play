// ======================================================================
// 徳川編⑩　鴫野の戦い（慶長十九年十一月二十六日・1614　冬・曇り）　docs/chapter3_tokugawa.md の「10.」が正
// 手本と出所：docs/battle_refs/k10_shigino.md
// 大坂冬の陣。大坂城の東、大和川と平野川に挟まれた鴫野は低い湿地で、大軍は堤の上しか動けない。
// 豊臣方は堤に三重の柵を作り、井上頼次に二千で守らせた。上杉景勝の軍（およそ五千）の先手・須田長義と安田能元が柵を奪い、井上は討ち死に。
// 大坂城から大野治長・渡辺糺・木村宗明・竹田永翁らが一万二千で来援し、上杉の先手は一の柵まで押し戻された。
// 二番手の水原親憲が隊を堤の左右へ開いて鉄砲を一斉に放ち、安田能元が槍で突き入って押し返した。
// 家康は上杉に「退いて休め」と命じたが、景勝は戦の最中に退かぬと拒み、榊原康勝らの助けも着いて、豊臣勢は城へ退いた。
// 主人公は須田長義の先手に加わる上杉の部将。目標は五つ（STAGES）：
//   ①一の柵・二の柵の鉄砲衆を討つ ②三の柵の井上頼次を討つ ③水原の鉄砲の後ろまで退く ④渡辺・木村の隊を押し返す ⑤竹田永翁の隊を討つ
// 時間の制限は目標ごと（AP8）。①②④は時が尽きても味方の手で史実どおり進む（手柄は付かない）。負け：本人が討たれる・③で退き遅れる・⑤を果たせず堤を奪い返される。
// 11/3 kaito AP〜AV：見せかけの軍勢（farHost・clash・addDistantArmy）は置かず、見える兵は全部本物。旗は上杉（竹に雀・毘）・榊原（無）・豊臣（桐）だけ。
//   総大将の上杉景勝は東の本陣の陣幕で床几に座り、来援の大野治長は西の奥で馬上のまま旗本に囲まれ、どちらも前に出ない（AT3）。ほかの名のある将は全員馬上。
//   兵の比：柵を攻める間は上杉が多く、来援の後は豊臣が二倍を超える（押し戻される苦しさ）。
// 座標：北が −z、東が +x。堤（鴫野の道）は東西に z=0。大坂城は西（−x）の遠く。
// 地形：大阪平野の低地は平らなので、国土地理院の標高は混ぜず、手で描いた堤と湿地にした。
// ======================================================================
import * as THREE from 'three';
import { distToPolyline } from './world.js';
import { nobori, hut, yagura, jinmaku, kagaribi } from './props.js';
import { enemyGroup, allyGroup, nm, wallLine } from './bhelp.js';
import { KIT } from './b_nagashinojo.js';
import { osakaFar } from './osaka_far.js';
import { GENERALS } from './units_data.js';
import { STAGES, KILLS, cut } from './stages.js';
import { TEGARA_ON } from './merit.js';
import { sfx } from './audio.js';
import { timeslipField } from './timeslip_field.js';

const ID = 'k10_shigino';
TEGARA_ON.add(ID);

// ---- 名のある武将の甲冑（ここだけで足す。無ければ足す）。黒を基本に、威しの色だけで分ける（AV1） ----
const face = (o) => ({ w: 1.05, jaw: 1.1, chin: 1, cheek: 1, gaunt: 0.2, brow: 1.2, nose: 1, nw: 1.1, eye: 1.1, t: 5, hair: 0x15110d, age: 40, ...o });
const give = (name, g) => { GENERALS[name] ||= { horo: 0, haoriMonCol: 0xe6dfcf, skin: 0x9c7453, ...g }; };
give('上杉景勝', { armor: 0x1c1a18, lace: 0x3a2e24, hat: 'kabuto_s', haori: 0x2a241e, mon: 'none', tack: 0x2a2018, lord: true,
  face: face({ age: 59, brow: 1.4, jaw: 1.2, gaunt: 0.4, beard: { mus: 0.6, musW: 1, droop: 0.4, goat: 0.3, side: 0.2, stub: 0.6 } }) });
give('直江兼続', { armor: 0x1e1c1a, lace: 0x2a3a58, hat: 'kabuto_s', haori: 0x22283a, mon: 'none',
  face: face({ age: 55, jaw: 1, brow: 1.2, beard: { mus: 0.5, musW: 0.9, droop: 0.3, goat: 0.2, side: 0.1, stub: 0.4 } }) });
give('須田長義', { armor: 0x1e1c1a, lace: 0x4a3a2a, hat: 'kabuto_w', haori: 0x2e2620, mon: 'none',
  face: face({ age: 37, beard: { mus: 0.6, musW: 1, droop: 0.3, goat: 0.2, side: 0.2, stub: 0.6 } }) });
give('安田能元', { armor: 0x201e1c, lace: 0x5a4630, hat: 'kabuto_t', haori: 0x302820, mon: 'none',
  face: face({ age: 57, gaunt: 0.4, beard: { mus: 0.8, musW: 1, droop: 0.5, goat: 0.4, side: 0.4, stub: 0.8 } }) });
give('水原親憲', { armor: 0x1c1c1e, lace: 0x4a4a3a, hat: 'kabuto_m', haori: 0x28282a, mon: 'none',
  face: face({ age: 68, gaunt: 0.6, brow: 1.4, beard: { mus: 0.9, musW: 1.1, droop: 0.6, goat: 0.7, side: 0.5, stub: 1 } }) });
give('榊原康勝', { armor: 0x1e1e22, lace: 0x2a3a58, hat: 'kabuto_s', haori: 0x22283a, mon: 'none',
  face: face({ age: 25, jaw: 1, brow: 1, beard: { mus: 0.3, musW: 0.9, droop: 0.2, goat: 0, side: 0, stub: 0.2 } }) });
give('井上頼次', { armor: 0x221e1c, lace: 0x6a3a2a, hat: 'kabuto_w', haori: 0x2e2620, mon: 'toyotomi',
  face: face({ age: 45, beard: { mus: 0.7, musW: 1, droop: 0.4, goat: 0.3, side: 0.3, stub: 0.7 } }) });
give('渡辺糺', { armor: 0x1c1614, lace: 0x8a1e18, hat: 'kabuto_g', haori: 0x2a1c18, mon: 'toyotomi',
  face: face({ age: 40, brow: 1.4, jaw: 1.2, beard: { mus: 0.8, musW: 1.1, droop: 0.5, goat: 0.5, side: 0.6, stub: 1 } }) });
give('木村宗明', { armor: 0x1e1e20, lace: 0x4a4a52, hat: 'kabuto_w', haori: 0x2a2a30, mon: 'toyotomi',
  face: face({ age: 42, beard: { mus: 0.6, musW: 1, droop: 0.4, goat: 0.1, side: 0.2, stub: 0.5 } }) });
give('穴澤盛秀', { armor: 0x1e1a18, lace: 0x6a2a20, hat: 'kabuto_t', haori: 0x2a2220, mon: 'toyotomi',
  face: face({ age: 50, gaunt: 0.4, beard: { mus: 0.8, musW: 1, droop: 0.5, goat: 0.4, side: 0.3, stub: 0.8 } }) });
give('竹田永翁', { armor: 0x221e1c, lace: 0x5a4a2a, hat: 'kabuto_t', haori: 0x2e2822, mon: 'toyotomi',
  face: face({ age: 55, gaunt: 0.5, beard: { mus: 0.7, musW: 1, droop: 0.5, goat: 0.6, side: 0.4, stub: 0.8 } }) });
give('大野治長', { armor: 0x1c1a1a, lace: 0x2a2a2a, hat: 'kabuto_s', haori: 0x2a2622, mon: 'toyotomi', tack: 0x2a2018, lord: true,
  face: face({ age: 46, jaw: 1, beard: { mus: 0.5, musW: 0.9, droop: 0.2, goat: 0.1, side: 0, stub: 0.3 } }) });

// ---- 場所 ----
const START = { x: 112, z: 2 };                  // 須田長義の先手の後ろ（一の柵まで四十歩）
const HONJIN = { x: 192, z: -8 };                // 上杉景勝の本陣（堤の東の端。旗本に囲まれて動かない）
const F1 = 70, F2 = 44, F3 = 18;                 // 豊臣方の三重の柵（一の柵・二の柵・三の柵）の x
const INOUE = { x: 8, z: 0 };                    // 井上頼次が鉄砲を指図する所（三の柵の内）
const MIZU = { x: 92, z: 0 };                    // 水原親憲の鉄砲が堤の左右に開く所（一の柵の東）
const HOLD = { x: F2 + 4, z: 0 };                // 二の柵の跡（最後に踏みとどまる所）
const OONO = { x: -124, z: 4 };                  // 大野治長の旗本（西の奥で動かない）
const FROM_W = { x: -190, z: 0 };                // 来援の豊臣勢が堤を寄せて来る所
const EXIT_W = { x: -236, z: 0 };                // 豊臣の退き口（城の方）
const ROAD = [[230, 0], [150, 1], [100, 0], [40, 0], [-40, 1], [-120, 0], [-250, 0]];   // 鴫野の堤
const OYAMATO = [[-300, -78], [-150, -86], [0, -80], [150, -90], [300, -82]];            // 北の大和川
const HIRANO = [[-300, 74], [-150, 82], [0, 78], [150, 88], [300, 80]];                  // 南の平野川
// 目標ごとの時間（秒）
const T1 = 200, T2 = 180, T3 = 70, T4 = 200, T5 = 200;
const STEP_TEXT = ['',
  '須田長義と堤を進み、一の柵・二の柵の内の鉄砲衆を討て',
  '三の柵の内で鉄砲を指図する井上頼次を討て',
  '城から大軍が来る。一の柵の東、水原親憲の鉄砲の後ろまで退け',
  '安田能元と槍で突き入り、渡辺糺・木村宗明の隊を押し返せ',
  '二の柵の跡に踏みとどまり、寄せ返す竹田永翁の隊を討て'];
const STEP_T = [0, T1, T2, T3, T4, T5];

const sm = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
function height(x, z) {
  // 低い湿地。堤の道だけが一段高い
  let h = 0.7 + 0.25 * Math.sin(x * 0.03) * Math.cos(z * 0.04);
  const rd = Math.abs(z - 0.5 * Math.sin(x * 0.02));
  h += 1.6 * sm(1 - rd / 12);
  const rv = Math.min(distToPolyline(x, z, OYAMATO), distToPolyline(x, z, HIRANO));
  if (rv < 7) h -= (1 - rv / 7) * 1.4;
  h += Math.max(0, Math.abs(z) - 150) * 0.12;
  return h;
}
// 堤の両脇は水の溜まった冬の田（足を取られる。大軍は堤の上しか動けない）
function paddy(x, z) {
  const az = Math.abs(z);
  if (az < 17 || az > 70 || x < -170 || x > 170) return 0;
  const ex = Math.min(((x % 16) + 16) % 16, 16 - ((x % 16) + 16) % 16), ez = Math.min(((z % 13) + 13) % 13, 13 - ((z % 13) + 13) % 13);
  return Math.max(0, Math.min(1, (Math.min(ex, ez) - 0.8) / 0.6)) * 0.8;
}

const live = (g) => g && g.units.some((u) => u.alive && !u.gone && !u.fleeing);
const aliveN = (g) => (g ? g.units.reduce((n, u) => n + (u.alive && !u.gone && !u.fleeing ? 1 : 0), 0) : 0);
const sumN = (...gs) => gs.reduce((n, g) => n + aliveN(g), 0);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
// 上杉勢：黒い具足に竹に雀。豊臣方：くすんだ黒の具足に桐。榊原：無の字
const UE = { flag: 'uesugi' };
const TOY = { flag: 'toyotomi', armor: 0x2a2622 };
const SAK = { flag: 'sakakibara' };
const dress = (look) => (list) => list.map((s) => ({ ...s, o: { ...look, ...(s.o || {}) } }));
const ueD = dress(UE), toyD = dress(TOY), sakD = dress(SAK);
const uS = (n) => ({ type: 'samurai', n }), uA = (n) => ({ type: 'ashigaru', n }), uG = (n) => ({ type: 'gun', n });
const PIN = { x: 0, z: 0, r: 8, hide: 6, always: true, silent: true, enemy: false, unit: null, follow: false, fire: false, gate: false, defend: false, waiting: false, arrived: false, area: false, route: false };
const mmss = (s) => { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

// 柵：堤を横切って張り、真ん中だけが口。柵の外は水の堀と湿地
function fenceLine(rt, x) {
  return wallLine(rt, [[x, -11], [x, 11]], { team: 1, hp: 260, segLen: 4.4, gaps: [2], name: '柵' });
}
function fenceDown(rt, list) {
  for (const s of list || []) if (s.alive) { s.alive = false; s.hp = 0; s.hitFrom = { x: s.seg[0] + 6, z: 0 }; rt.army.structFall(s); }
}

const k10_shigino = {
  // 身の回りの合戦の跡（timeslip_field.js）。鴫野：冬の曇りの堤と湿地。枯れ葦・ぬかるみ、鉄砲で撃ち合った跡
  timeslip: {
    wet: 0.5, dust: 0.1, trample: 0.3, debris: 1.2, arrows: 0.8, reeds: 0.5, maxSlope: 0.22,
    grass: 0xa49c66, grassTints: [0xffffff, 0xeadcb0, 0xc8c898], grassH: 1.2, grassLift: 0.2, grassShape: 'blade', tallGrass: 1,
    flagColors: [0xe6dfcc, 0x24211e, 0x5a4a36],
  },
  spawn: { x: START.x, z: START.z, heading: -Math.PI / 2 },
  minutes: 16,
  noWake: true,
  noFrontFill: true,       // 見せかけの軍勢（奥の軽い乱戦・自動の大軍）を重ねない（AA・AF・AP9・AQ6）。見える兵は全部本物
  noDistantBattle: true,
  noLeaderFollow: true,    // 行き先の印は段ごとの一つだけ
  compactIntro: true,
  introText: () => '鴫野の堤に豊臣方の三重の柵。上杉の先手と柵を破り、城から来る大軍を堤で食い止めよ。',
  hideGuideSteps: true,
  noCouriers: true,
  noTaisho: true,
  noReserve: true,
  noTaishoRaid: true,
  foeMarks: true,
  playerAtkMax: 3,
  playerTaken: 0.45,
  playerRegen: 0.025,
  closeCombatAssist: true,
  noWinCrane: true,
  // 行き先のピン：段ごとに一つ（字は出さない）。場所は段ごとに決まっている（AW3）
  missionPin(rt) {
    const F = rt.flags;
    if (!F.step || F.ending) return null;
    // 場所は柵・堤の決まった所だけ（隊の真ん中を追わない。行くたびに動かない・AW3）
    let p = { x: F1, z: 0 };
    if (F.step === 1) p = live(F.g1) ? { x: F1, z: 0 } : { x: F2, z: 0 };
    else if (F.step === 2) p = INOUE;
    else if (F.step === 3) p = MIZU;
    else if (F.step === 4) p = { x: MIZU.x - 12, z: 0 };
    else if (F.step === 5) p = HOLD;
    PIN.x = p.x; PIN.z = p.z; PIN.r = F.step === 3 ? 10 : 8;
    return PIN;
  },
  talk: {
    before: [['須田長義', '堤に柵が三重。柵の内に井上頼次の鉄砲が並んでおる'], ['直江兼続', '御館様のお下知じゃ。先手は須田殿、二番手は水原殿。堤を西へ攻め上れ'],
      ['須田長義', '堤の外は泥田じゃ。足を取られれば撃たれる。柵の口へ一気に詰めよ']],
    after: [['上杉景勝', '……鴫野の堤、確かに取った'], ['水原親憲', '子供の喧嘩のような戦で褒められるとは。上杉の戦は、もっと厳しいものでござった']],
  },
  world: {
    seed: 1614, time: 'day', muddy: 0.4, mist: 0.25,
    groundHalf: 250, moveLim: 240,
    paths: [ROAD],
    height,
    paddy,
    fieldStage: 'fallow',
    // 北の大和川・南の平野川と、堤の両脇の水の溜まった堀（湿地の中の一本道だと分かる）
    streams: [{ pts: OYAMATO, w: 10, depth: 0.8 }, { pts: HIRANO, w: 10, depth: 0.8 },
      { pts: [[-250, -13], [-40, -12.5], [30, -13], [100, -12.5], [175, -13]], w: 5, depth: 0.35 }, { pts: [[-250, 13.5], [-40, 13], [30, 13.5], [100, 13], [175, 13.5]], w: 5, depth: 0.35 }],
    // 堤は乾いた土の色、水辺は湿った枯れ草、遠くは冬の田
    tint(x, z, h, c) {
      const rd = distToPolyline(x, z, ROAD);
      if (rd < 6) { const k = 0.6 * (1 - rd / 6); c.setRGB(c.r * (1 - k) + 0.46 * k, c.g * (1 - k) + 0.4 * k, c.b * (1 - k) + 0.3 * k); }
      else { const k = 0.4; c.setRGB(c.r * (1 - k) + 0.42 * k, c.g * (1 - k) + 0.4 * k, c.b * (1 - k) + 0.26 * k); }
    },
    clear: (x, z) => distToPolyline(x, z, ROAD) < 9 || dist({ x, z }, HONJIN) < 18 || dist({ x, z }, OONO) < 16,
    trees: 200, tufts: 3200,
    treeDensity: (x, z) => (Math.abs(z) < 20 || paddy(x, z) > 0 ? 0 : 0.5),
    fleeOut: (x, z, team) => (team === 1 ? x < -230 : x > 236),
  },
  sides: { a: { name: '上杉景勝の軍', mon: 'uesugi' }, b: { name: '豊臣方（井上頼次・大野治長ら）', mon: 'toyotomi' } },
  date: () => '慶長十九年（1614）十一月二十六日　冬・曇り',

  setup(rt) {
    timeslipField(rt);   // 身の回りの踏み荒らした地面・倒れた槍と旗・季節の草（def.timeslip）
    const F = rt.flags, W = rt.world, S = rt.scene;
    F.step = 0; F.holdPlayer = true; F.foes = []; F.ending = false; F.ek = 0; F.ak = 0; F.shot = 0;
    // 豊臣方の三重の柵（壊せる。口は真ん中だけ）と、三の柵の井楼・小屋・桐の旗
    F.fence1 = fenceLine(rt, F1); F.fence2 = fenceLine(rt, F2); F.fence3 = fenceLine(rt, F3);
    S.add(yagura(W, F3 - 5, -8, { team: 1, mon: 'toyotomi' }));
    S.add(hut(W, F3 - 14, 7, 7, 5, 0.1, { h: 2.6 }), hut(W, F3 - 16, -7, 6, 5, 0, { h: 2.6 }));
    for (const [x, z] of [[F1 - 4, 8], [F1 - 4, -8], [F2 - 4, 8], [F2 - 4, -8], [F3 - 4, 9], [F3 - 8, -3], [OONO.x - 6, OONO.z - 8], [OONO.x - 6, OONO.z + 8]]) S.add(nobori(W, x, z, 'toyotomi', 5));
    // 上杉の本陣：幕と竹に雀・毘の旗、篝火
    S.add(jinmaku(W, HONJIN.x + 4, HONJIN.z, 16, 12, 6));
    for (const dz of [-9, 9]) S.add(nobori(W, HONJIN.x - 6, HONJIN.z + dz, 'uesugi', 6));
    S.add(nobori(W, HONJIN.x - 8, HONJIN.z, 'uesugi_bi', 7));
    S.add(kagaribi(W, HONJIN.x - 2, HONJIN.z + 12));
    // 堤の北と南の水辺に蘆の群れ
    const reed = new THREE.MeshLambertMaterial({ color: 0x8a7a4a });
    const m = new THREE.InstancedMesh(new THREE.ConeGeometry(0.25, 2.4, 4), reed, 420);
    const d = new THREE.Object3D();
    for (let i = 0; i < 420; i++) {
      const x = -260 + ((i * 97) % 520), side = i % 2 ? 1 : -1;
      const z = side * (14 + ((i * 53) % 24)) + Math.sin(i) * 3;
      d.position.set(x, W.heightAt(x, z) + 1.1, z); d.rotation.set(0, i, 0); d.scale.setScalar(0.8 + (i % 5) * 0.12); d.updateMatrix(); m.setMatrixAt(i, d.matrix);
    }
    S.add(m);
    // 大坂城（西の遠く）：本丸・二の丸・玉造口の馬出と、手前の惣構えの東（猫間川）。osaka_far.js（兵は置かない）
    try { osakaFar(rt, { x: -315, z: 70, s: 1.6, big: 2.2, land: [[-700, -400, -181, 400]], sogamae: [{ pts: [[-178, -260], [-178, 220]], side: -1, water: true, s: 1.6 }] }); } catch (e) { console.warn(e); }

    // ---- 上杉勢 ----
    F.mine = allyGroup(rt, { faction: 'uesugi', name: '手勢', fullStrength: true, fixed: true, anchor: { x: START.x + 2, z: START.z + 3 }, facing: -Math.PI / 2, width: 5, aggro: 10, speed: 3.6, order: 'hold', noRout: true, dmgMult: 0.9 },
      ueD([uS(4), uA(9), uG(3)]));
    F.suda = allyGroup(rt, { faction: 'uesugi', name: '須田長義の先手', fullStrength: true, fixed: true, anchor: { x: 100, z: 0 }, facing: -Math.PI / 2, width: 7, aggro: 12, speed: 3.6, order: 'hold', noRout: true, formation: 'yari' },
      ueD([{ type: 'busho', n: 1, o: { name: '須田長義', invuln: true, horse: true } }, uS(5), uA(18), uG(6)]));
    F.yasu = allyGroup(rt, { faction: 'uesugi', name: '安田能元の手', fullStrength: true, fixed: true, anchor: { x: 124, z: -2 }, facing: -Math.PI / 2, width: 7, aggro: 12, speed: 3.6, order: 'hold', noRout: true, formation: 'yari' },
      ueD([{ type: 'busho', n: 1, o: { name: '安田能元', invuln: true, horse: true } }, uS(5), uA(16), uG(3)]));
    // 二番手：水原親憲の鉄砲（来援の段で堤の左右へ開く）
    F.mzN = allyGroup(rt, { faction: 'uesugi', name: '水原親憲の鉄砲', fullStrength: true, fixed: true, anchor: { x: 136, z: -4 }, facing: -Math.PI / 2, width: 5, aggro: 6, speed: 3.6, order: 'hold', noRout: true, fire: true },
      ueD([{ type: 'busho', n: 1, o: { name: '水原親憲', invuln: true, horse: true } }, uS(2), uG(11)]));
    F.mzS = allyGroup(rt, { faction: 'uesugi', name: '水原の鉄砲（南）', fullStrength: true, fixed: true, anchor: { x: 136, z: 5 }, facing: -Math.PI / 2, width: 5, aggro: 6, speed: 3.6, order: 'hold', noRout: true, fire: true },
      ueD([uS(2), uG(11)]));
    // 上杉景勝の本陣：東の端で旗本に囲まれ、前に出ない（AR3・AT3）
    F.honjin = allyGroup(rt, { faction: 'uesugi', name: '上杉景勝の本陣', fullStrength: true, fixed: true, anchor: { x: HONJIN.x, z: HONJIN.z }, facing: -Math.PI / 2, width: 8, aggro: 4, seekRange: 10, order: 'hold', noRout: true },
      ueD([{ type: 'busho', n: 1, o: { name: '上杉景勝', invuln: true, horse: false } }, { type: 'busho', n: 1, o: { name: '直江兼続', invuln: true, horse: true } }, uS(30), uG(6)]));
    F.kage = F.honjin.units.find((u) => u.name === '上杉景勝');
    if (F.kage) F.kage._crouch = true;   // 総大将は陣幕の内で床几に腰を下ろす
    for (const g of [F.suda, F.yasu]) g.ai = true;

    // ---- 豊臣方の柵の守り（井上頼次の手。柵の内で鉄砲を構える） ----
    F.g1 = this.foe(rt, '一の柵の鉄砲衆', { x: F1 - 6, z: 0 }, [uS(2), uA(7), uG(8)], { hold: true });
    F.g2 = this.foe(rt, '二の柵の鉄砲衆', { x: F2 - 6, z: 0 }, [uS(2), uA(7), uG(8)], { hold: true });
    F.w1S = sumN(F.g1, F.g2);
    const T = this.talk.before;
    T.forEach(([who, s], i) => rt.after(0.6 + i * 3.4, () => rt.say(who, s, 3.2)));
    rt.after(0.6 + T.length * 3.4, () => { F.holdPlayer = false; this.toStep(rt, 1); });
  },

  // 豊臣方の隊を出す（見える所に湧かせない。柵の内か、西の遠くから寄せる）
  foe(rt, name, at, list, o = {}) {
    const F = rt.flags;
    const g = enemyGroup(rt, { faction: 'toyotomi', name, fixed: true, anchor: { x: at.x, z: at.z }, facing: Math.PI / 2, width: o.width || 6, noRout: true, formation: 'line',
      morale: o.morale || 95, dmgMult: 0.5, order: o.hold ? 'hold' : 'attack', seekRange: o.hold ? 14 : 90, aggro: o.hold ? 10 : 16, speed: 3.7, fire: true }, toyD(list));
    if (o.aim) { g.anchor = { x: o.aim.x, z: o.aim.z }; g.order = 'move'; g.dest = { x: o.aim.x, z: o.aim.z }; g.onArrive = (q) => { if (q.order === 'move') q.order = o.stay ? 'hold' : 'attack'; }; }
    if (!o.hold && !o.stay) rt.after(30, () => { g.noRout = false; });
    F.foes.push(g);
    return g;
  },

  // 段を進める（右上の目標と行き先のピン）
  toStep(rt, n) {
    const F = rt.flags;
    if (F.step >= n || F.ending) return;
    if (F.step) rt.objDone('s' + F.step);
    F.step = n; F.stepT = rt.t;
    rt.obj('s' + n, STEP_TEXT[n], 'main');
    if (n === 1) {
      sfx('horagai', 0.8);
      rt.after(1, () => sfx('taiko', 0.8));
      F.suda.order = 'attack'; F.suda.seekRange = 40; F.suda.anchor = { x: F2 - 4, z: 0 };
      rt.army.play('toki', { x: 104, z: 0 }, 1.5);
      rt.after(2, () => rt.say('須田長義', '掛かれ！　柵の口へ詰めよ。撃たれる前に槍を付けい！', 3));
      rt.after(16, () => rt.say('足軽', '柵の内から撃ってくる！　泥田へ降りるな、堤を行け！', 3));
    } else if (n === 2) {
      fenceDown(rt, F.fence1); fenceDown(rt, F.fence2);
      rt.banner('一の柵・二の柵を破った', '三の柵に井上頼次の鉄砲衆');
      F.ino = this.foe(rt, '井上頼次の鉄砲衆', { x: INOUE.x, z: 0 }, [{ type: 'busho', n: 1, o: { name: '井上頼次', invuln: false, horse: true } }, uS(4), uA(6), uG(12)], { hold: true, width: 7, morale: 100 });
      F.inoU = F.ino.units.find((u) => u.name === '井上頼次');
      F.suda.anchor = { x: F3 - 6, z: 0 }; F.suda.seekRange = 50;
      F.yasu.order = 'attack'; F.yasu.anchor = { x: F2, z: 0 }; F.yasu.seekRange = 30;
      rt.say('須田長義', '残るは三の柵じゃ。指図する井上を討てば、鉄砲は止む！', 3.2);
      rt.after(4, () => rt.say('井上頼次', '引き付けて放て。堤の上の者を一人も通すな！', 3));
    } else if (n === 3) {
      fenceDown(rt, F.fence3);
      sfx('taiko', 1);
      rt.banner('城から大軍', '大野治長・渡辺糺・木村宗明が一万二千で来援');
      // 柵の残りの守り手は西へ退く（遠く離れたら去らせて、本物の兵の枠を空ける）
      for (const g of [F.g1, F.g2, F.ino]) if (live(g)) { g.order = 'retreat'; g.dest = { x: EXIT_W.x, z: 0 }; g.speed = 4.2; g.aggro = 0; g.noRout = false; }
      // 大野治長は西の奥で旗本に囲まれて動かない（総大将は前に出ない）
      F.oono = this.foe(rt, '大野治長の旗本', { x: OONO.x - 50, z: OONO.z }, [{ type: 'busho', n: 1, o: { name: '大野治長', invuln: true, horse: true } }, uS(20), uG(4)], { aim: OONO, stay: true, morale: 100 });
      F.wata = this.foe(rt, '渡辺糺の隊', { x: FROM_W.x + 40, z: -2 }, [{ type: 'busho', n: 1, o: { name: '渡辺糺', invuln: true, horse: true } }, { type: 'busho', n: 1, o: { name: '穴澤盛秀', horse: true } }, uS(7), uA(26), uG(10)], { aim: { x: MIZU.x - 10, z: 0 }, width: 8 });
      F.kimu = this.foe(rt, '木村宗明の隊', { x: FROM_W.x + 20, z: 3 }, [{ type: 'busho', n: 1, o: { name: '木村宗明', invuln: true, horse: true } }, uS(6), uA(22), uG(8)], { aim: { x: MIZU.x - 14, z: 2 }, width: 8 });
      F.w4N = sumN(F.wata, F.kimu);
      // 上杉の先手は押されて一の柵の東へ退く。水原の鉄砲は堤の左右へ開いて待つ
      for (const [g, p] of [[F.suda, { x: MIZU.x + 6, z: 1 }], [F.yasu, { x: MIZU.x + 14, z: -1 }]]) {
        g.order = 'move'; g.dest = p; g.speed = 3.9; g.onArrive = (q) => { q.order = 'hold'; q.anchor = { x: p.x, z: p.z }; };
      }
      for (const [g, z] of [[F.mzN, -9], [F.mzS, 9]]) { g.order = 'move'; g.dest = { x: MIZU.x + 2, z }; g.fire = false; g.onArrive = (q) => { q.order = 'hold'; q.anchor = { x: MIZU.x + 2, z }; q.facing = -Math.PI / 2; }; }
      rt.say('須田長義', '数が違いすぎる……！　退け、一の柵の東まで退け！', 3.2);
      rt.after(4, () => rt.say('水原親憲', '鉄砲は堤の左右へ開け。味方が抜けるまで撃つな', 3.2));
      rt.after(9, () => rt.say('足軽', '後ろから追って来る！　止まれば囲まれるぞ！', 2.8));
    } else if (n === 4) {
      // 水原の鉄砲が堤の左右から一斉に放つ → 安田能元が槍で突き入る
      this.volley(rt);
      rt.after(5, () => this.volley(rt));
      for (const g of [F.mzN, F.mzS]) g.fire = true;
      for (const g of [F.yasu, F.suda]) { g.order = 'attack'; g.seekRange = 60; g.aggro = 16; g.anchor = { x: F1 - 8, z: 0 }; }
      rt.after(6, () => { rt.army.play('toki', { x: MIZU.x, z: 0 }, 1.5); rt.say('安田能元', '今じゃ！　煙の晴れぬうちに、槍を揃えて突き入れ！', 3.2); });
    } else if (n === 5) {
      rt.banner('退けの命', '家康の使番が来た');
      rt.say('家康の使番', '大御所様の仰せ。上杉勢は退いて休め。堀尾忠晴に先手を代われ、と', 3.6);
      rt.after(4, () => rt.say('上杉景勝', '……退かぬ。戦の最中に先手を人に譲るは、上杉の家にあらず', 3.8));
      rt.after(8.5, () => rt.say('須田長義', '聞いたか。二の柵の跡まで押し出し、一歩も退くな！', 3));
      F.take = this.foe(rt, '竹田永翁の隊', { x: FROM_W.x + 30, z: 0 }, [{ type: 'busho', n: 1, o: { name: '竹田永翁', invuln: true, horse: true } }, uS(5), uA(17), uG(7)], { aim: { x: HOLD.x - 4, z: 0 }, width: 8, morale: 98 });
      F.w5N = aliveN(F.take);
      for (const g of [F.yasu, F.suda]) if (live(g)) { g.order = 'attack'; g.anchor = { x: HOLD.x + 4, z: 0 }; g.seekRange = 40; }
      for (const g of [F.mzN, F.mzS]) { const z = g === F.mzN ? -9 : 9; g.order = 'move'; g.dest = { x: HOLD.x + 18, z }; g.onArrive = (q) => { q.order = 'hold'; q.anchor = { x: HOLD.x + 18, z }; }; }
      // 榊原康勝の手が東から堤を来る（言った物は本当に来る）
      F.saka = allyGroup(rt, { faction: 'tokugawa', name: '榊原康勝の手', fullStrength: true, fixed: true, anchor: { x: 214, z: 2 }, facing: -Math.PI / 2, width: 7, aggro: 12, speed: 3.7, noRout: true, formation: 'yari' },
        sakD([{ type: 'busho', n: 1, o: { name: '榊原康勝', invuln: true, horse: true } }, uS(4), uA(12), uG(4)]));
      F.saka.order = 'move'; F.saka.dest = { x: HOLD.x + 26, z: 2 }; F.saka.onArrive = (q) => { q.order = 'attack'; q.seekRange = 40; q.anchor = { x: HOLD.x, z: 0 }; };
      rt.after(14, () => rt.say('足軽', '東の堤に榊原の「無」の旗！　助けが来るぞ！', 3));
    }
  },

  // 水原の鉄砲の一斉射撃：堤の上の寄せ手が倒れる（煙は堤の左右から）
  volley(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.shot++;
    sfx('volley', 0.9);
    for (const z of [-9, 9]) for (let i = 0; i < 5; i++) rt.army.smoke(MIZU.x + 2 - i * 1.6, rt.world.heightAt(MIZU.x, z) + 1.4, z, -1, -z * 0.04);
    rt.army.play('gun', MIZU, 1.5);
    const shooter = F.mzN.units.find((u) => u.alive) || null;
    let fell = 0;
    for (const g of [F.wata, F.kimu]) for (const u of g?.units || []) {
      if (!u.alive || u.invuln || fell >= 9) continue;
      if (u.pos.x > MIZU.x - 40 && u.pos.x < MIZU.x + 6 && Math.random() < 0.55) { rt.army.damage(u, u.maxHp * 0.9, shooter, { kind: 'gun', pierce: true }); fell++; }
    }
    for (const g of [F.wata, F.kimu]) if (live(g)) g.morale -= 15;
    if (F.shot === 1) rt.say('水原親憲', '放て！', 2);
    else if (F.shot === 2) rt.say('足軽', '堤の上で、大坂の兵が折り重なって倒れていく！', 3);
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.objDone('s5');
    rt.tracker.main = true;
    rt.player.u.invuln = true;
    for (const g of F.foes) if (live(g)) { g.order = 'retreat'; g.dest = { x: EXIT_W.x, z: EXIT_W.z }; g.speed = 4.2; g.aggro = 0; g.noRout = false; }
    sfx('horagai', 0.8);
    rt.award((t) => { t.main = true; t.special = { label: '鴫野の堤を守り抜き、豊臣勢を城へ退けた', pts: 20 }; }, '鴫野の堤を守り抜いた');
    rt.banner('鴫野、上杉の勝ち', '大野治長の隊は城へ退いた');
    rt.after(1.2, () => rt.say('大野治長', '堤は取れなんだ……城へ引け。退き鐘を打て', 3.4));
    const A = this.talk.after;
    rt.after(5, () => rt.say(A[0][0], A[0][1], 3.4));
    rt.after(9, () => rt.say('家康の使番', '大御所様は、軍令に従わなんだ事をお咎めにならず、お褒めになられた由', 3.8));
    rt.after(13.5, () => rt.say(A[1][0], A[1][1], 4));
    rt.after(3, () => rt.army.celebrate(0));
    rt.finish({ scriptedEnd: true }, 19);
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
    // 退いた敵は遠く離れたら去らせる（本物の兵の枠を空ける）
    if ((F.gcT = (F.gcT || 0) - 0.25) <= 0) {
      F.gcT = 1;
      for (const g of F.foes) for (const u of g.units) if (u.alive && !u.gone && (u.fleeing || g.order === 'retreat') && u.pos.x < -150 && dist(u.pos, P.pos) > 70) rt.army.despawn(u);
    }
    if (left > 0) rt.objProgress('s' + F.step, `あと${mmss(left)}`);
    if (F.step === 1) {
      const k = F.w1S - sumN(F.g1, F.g2);
      // 時が尽きても須田の先手が柵を破る（史実。自分が何もしなくても物語は進む・kaito_standard 二5）
      if (k >= Math.round(F.w1S * 0.6) || left <= 0) this.toStep(rt, 2);
    } else if (F.step === 2) {
      if (F.inoU && !F.inoU.alive && !F.inoDown) {
        F.inoDown = true;
        rt.banner('井上頼次、討ち取ったり', '三の柵の鉄砲が止んだ');
        if (F.inoByMe) rt.award((t) => { t.special = { label: '井上頼次を討ち取った', pts: 24 }; }, '井上頼次を討ち取った');
        rt.after(3, () => this.toStep(rt, 3));
      } else if (left <= 0 && !F.inoDown) {
        // 時が尽きても須田の手が井上を討つ（史実）。手柄は付かない
        F.inoU.invuln = false; rt.army.kill(F.inoU, null);
      }
    } else if (F.step === 3) {
      if (P.pos.x > MIZU.x + 4 && Math.abs(P.pos.z) < 14) this.toStep(rt, 4);
      else if (left <= 0) this.lose(rt, '囲まれた', '退き遅れて、大坂の大軍に呑まれた');
    } else if (F.step === 4 && !F.back4) {
      const k = F.w4N - sumN(F.wata, F.kimu);
      // 時が尽きても水原の鉄砲と安田の槍で押し返す（史実）。最後の段だけは果たさねば負け
      if (k >= Math.round(F.w4N * 0.5) || left <= 0) {
        for (const g of [F.wata, F.kimu]) if (live(g)) { g.order = 'retreat'; g.dest = { x: -150, z: 0 }; g.speed = 4; g.aggro = 0; }
        rt.say('渡辺糺', '上杉の鉄砲、侮れぬ……一度引け！', 2.8);
        rt.after(3, () => this.toStep(rt, 5));
        F.back4 = true;
      }
    } else if (F.step === 5) {
      const k = F.w5N - aliveN(F.take);
      if (k >= Math.round(F.w5N * 0.5)) this.win(rt);
      else if (left <= 0) this.lose(rt, '堤を奪い返された', '二の柵の跡を守り切れなかった');
    }
  },

  onKill(rt, v, k) {
    const F = rt.flags;
    if (v.team === 1) F.ek++; else F.ak++;
    if (v.name === '井上頼次') F.inoByMe = !!k?.isPlayer;
    if (v.name === '穴澤盛秀' && !F.ending) rt.say('足軽', '大坂方の穴澤盛秀、堤の上で討たれたぞ！', 3);
    KIT.carrion(rt, v);
  },
  onRout(rt, g) {
    if (g.team === 1 && g.name && !rt.flags.ending) rt.say('足軽', `${g.name}が崩れた！`, 2.5);
  },

  // bot：近い敵を突き、いなければ段の行き先へ
  botBrain(b, inp, { goTo, patientStrike }) {
    const p = b.player, u = p.u, F = b.flags;
    if (F.holdPlayer || !F.step || F.ending) return;
    const ok = (o) => !o.fleeing && !o.invuln && !o.noTarget && Math.abs(o.pos.y - u.pos.y) < 3;
    const e = F.step === 3 ? null : b.army.nearestEnemy(u, 9, ok);
    if (e) {
      const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
      if (p.lock && p.lock !== e) inp.e.add('KeyQ');
      p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
      if (d > 2.2) goTo(p, inp, e.pos.x, e.pos.z, 2.2); else inp.k.delete('KeyW');
      patientStrike(p, inp, e, d, true);
      return;
    }
    inp.guardHold = false;
    const t = this.missionPin(b) || MIZU;
    goTo(p, inp, F.step === 3 ? t.x + 8 : t.x, t.z, 2);
  },
};

// 兵数は諸説。上杉勢およそ五千、柵を守る井上頼次の手およそ二千、来援の大野治長らおよそ一万二千
k10_shigino.force = (rt) => {
  const F = rt.flags, big = (F.step || 0) >= 3;
  const b0 = big ? 14000 : 2000;
  return { a: Math.max(2000, Math.round(5000 - (F.ak || 0) * 20)), a0: 5000, b: F.ending && rt.tracker.main ? 3000 : Math.max(0, Math.round(b0 - (F.ek || 0) * 25)), b0 };
};
k10_shigino.canSkip = (rt) => (!rt.flags.step && rt.t > 3 ? '下知まで待つ' : '');
k10_shigino.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
k10_shigino.history = '慶長十九年（1614）十一月二十六日、大坂冬の陣。大坂城の東の鴫野は低い湿地で、大軍は大和川沿いの堤の上しか動けなかった。豊臣方は堤に三重の柵を作り、井上頼次に守らせた。\n上杉景勝の軍の先手、須田長義・安田能元らが柵を次々に奪い、井上頼次は討ち死にした。城から大野治長・渡辺糺・竹田永翁・木村宗明・穴澤盛秀らが一万二千で来援し、上杉の先手は一の柵まで押し戻された。二番手の水原親憲が堤の左右から鉄砲を一斉に放ち、安田能元が槍で突き入って押し返した。\n家康は上杉に「退いて休み、堀尾忠晴と代われ」と命じたが、景勝は戦の最中に退かぬと拒んだ。堀尾・丹羽長重・榊原康勝らの助けも加わり、豊臣方は城へ退いた。同じ日、大和川の北の今福でも佐竹義宣らと木村重成・後藤基次が戦った。';
k10_shigino.bushou = [{ name: '井上頼次', g: /頼次/ }, { name: '渡辺糺', g: /渡辺糺/ }, { name: '竹田永翁', g: /永翁/ }];

const st = (n) => (rt) => (rt.flags.step ?? 0) >= n;
STAGES[ID] = [['一の柵・二の柵の鉄砲衆を討つ'], ['三の柵の井上頼次を討つ', st(2)], ['水原親憲の鉄砲の後ろまで退く', st(3)], ['渡辺糺・木村宗明の隊を押し返す', st(4)], ['二の柵の跡で竹田永翁の隊を討つ', st(5)]];
// 倒す数（kaito 11/2 O）：段が進む判定と同じ数え方（stages.js）
KILLS[ID] = (rt) => {
  const F = rt.flags;
  if (F.ending) return null;
  if (F.step === 1) return cut(F.w1S, sumN(F.g1, F.g2), F.w1S - Math.round(F.w1S * 0.6));
  if (F.step === 4 && !F.back4) return cut(F.w4N, sumN(F.wata, F.kimu), F.w4N - Math.round(F.w4N * 0.5));
  if (F.step === 5) return cut(F.w5N, aliveN(F.take), F.w5N - Math.round(F.w5N * 0.5));
  return null;
};

export { k10_shigino };
export default k10_shigino;
