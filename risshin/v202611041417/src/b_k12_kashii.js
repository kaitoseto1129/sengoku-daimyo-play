// ======================================================================
// 徳川編 12　樫井の戦い（慶長二十年＝1615 四月二十九日。和泉国 樫井＝今の泉佐野。夏の陣の始まり）
// 筋書きの正：docs/chapter3_tokugawa.md の「12. 樫井」。手本と出所：docs/battle_refs/k12_kashii.md
// 紀州から北上した浅野長晟の軍（およそ五千）は、大野治房の先手を見つけて樫井まで退き、亀田高綱を安松に殿に残した。
// 朝八時ごろ、塙団右衛門の手（二〜三百）が熊野街道を寄せ、安松の八丁畷で戦が始まる。亀田は鉄砲で撃っては退き、敵を樫井の村へ引き寄せた。
// 樫井の村の中で両軍が入り乱れ、上田宗箇・浅野知近らが加わる。岡部則綱は横から攻めたが退き、塙と淡輪重政は討ち死に（名のある者十二人）。
// 総大将の大野治房は貝塚から動かず、戦場へ来なかった（ゲームでも出さない。AT3）。浅野長晟も川の南の本陣から出ない（AR3）。
// 亀田高綱は樫井で死なない（のちに浅野家を去り寛永まで生きた）。
// 主人公は亀田高綱の殿に加わる浅野の家老。目標は五つ（STAGES）：
//   ①八丁畷で塙の先手を討つ ②樫井の村の備えまで退く ③村に攻め入る塙・淡輪の隊を討つ ④東の田から横を突く岡部の隊を押し返す ⑤塙団右衛門を討つ
// 時間の制限は目標ごと（AP8）。負け：本人が討たれる・殿が取り残される・村を破られる・横を破られる。
// 11/3 kaito AP〜AV：見せかけの軍勢（addDistantArmy・clash・farHost）は置かず、見える兵は全部本物。旗は浅野の違い鷹の羽と豊臣の桐だけ。
//   名のある将は全員馬上で侍の旗本を連れる。兵の比：八丁畷では殿の少数で大勢を受け（苦しい所）、村で味方が揃うと浅野が多い。
// 向き：北（−z）が貝塚・大坂の側、南（＋z）が紀州。熊野街道が南北に通り、樫井川（東西）を浅瀬で渡る。東（＋x）が和泉の山、西（−x）が海。
// 地形：樫井川の下の平野で標高の起伏はごく小さいため、国土地理院の標高は混ぜず、手で描いた形にした（tools/dem.mjs に鍵を足せば混ぜられる）。
// ======================================================================
import { enemyGroup, allyGroup, nm } from './bhelp.js';
import { nobori, jinmaku, kagaribi } from './props.js';
import { KIT } from './b_nagashinojo.js';
import { distToPolyline } from './world.js';
import { GENERALS } from './units_data.js';
import { STAGES, KILLS, cut } from './stages.js';
import { sfx } from './audio.js';
import { timeslipField } from './timeslip_field.js';

// ---- 名のある武将の甲冑（ここだけで足す。無ければ足す）。黒を基本に、威しの色だけで分ける（AV1） ----
const face = (o) => ({ w: 1.05, jaw: 1.1, chin: 1, cheek: 1, gaunt: 0.2, brow: 1.2, nose: 1, nw: 1.1, eye: 1.1, t: 5, hair: 0x15110d, age: 40, ...o });
const give = (name, g) => { GENERALS[name] ||= { horo: 0, haoriMonCol: 0xe6dfcf, skin: 0x9c7453, ...g }; };
give('塙団右衛門', { armor: 0x1c1614, lace: 0x8a1e18, hat: 'kabuto_g', haori: 0x2a1c18, mon: 'toyotomi', tack: 0x3a1a14,
  face: face({ age: 50, brow: 1.5, jaw: 1.3, beard: { mus: 1, musW: 1.2, droop: 0.6, goat: 0.8, side: 0.8, stub: 1.2 } }) });
give('岡部則綱', { armor: 0x1e1e20, lace: 0x4a4a52, hat: 'kabuto_w', haori: 0x2a2a30, mon: 'toyotomi', tack: 0x2a2a30,
  face: face({ age: 48, gaunt: 0.4, beard: { mus: 0.7, musW: 1, droop: 0.5, goat: 0.1, side: 0.2, stub: 0.5 } }) });
give('淡輪重政', { armor: 0x221e1c, lace: 0x6a4a2a, hat: 'kabuto_w', haori: 0x2e2620, mon: 'toyotomi',
  face: face({ age: 44, beard: { mus: 0.7, musW: 1, droop: 0.4, goat: 0.2, side: 0.3, stub: 0.7 } }) });
give('浅野長晟', { armor: 0x1c1e26, lace: 0x2a3a58, hat: 'kabuto_s', haori: 0x22283a, mon: 'none', tack: 0x1c2438, lord: true,
  face: face({ age: 29, jaw: 1, brow: 1, beard: { mus: 0.5, musW: 0.9, droop: 0.2, goat: 0, side: 0, stub: 0.1 } }) });
give('亀田高綱', { armor: 0x22201e, lace: 0x5a4a2a, hat: 'kabuto_t', haori: 0x2e2822, mon: 'none',
  face: face({ age: 57, beard: { mus: 0.8, musW: 1, droop: 0.4, goat: 0.2, side: 0.3, stub: 0.8 } }) });
give('上田宗箇', { armor: 0x1e1c1a, lace: 0x3a4a3a, hat: 'kabuto_m', haori: 0x283024, mon: 'none',
  face: face({ age: 53, gaunt: 0.5, beard: { mus: 0.6, musW: 0.9, droop: 0.3, goat: 0.5, side: 0.4, stub: 0.6 } }) });
give('浅野知近', { armor: 0x1e2028, lace: 0x34445e, hat: 'kabuto_s', haori: 0x242c40, mon: 'none',
  face: face({ age: 40, beard: { mus: 0.5, musW: 0.9, droop: 0.2, goat: 0, side: 0, stub: 0.3 } }) });

// ---- 場所（ゲームの座標。北が −z） ----
const YASU = { x: -4, z: -128 };             // 安松の八丁畷（亀田高綱の殿が構える畷の上）
const START = { x: -2, z: -112 };
const FORD = { x: 0, w: 26 };                // 熊野街道が川を渡る浅瀬（幅の半分）
const FORD2 = { x: 92, w: 10 };
const VILLAGE = { x: 24, z: -44 };           // 樫井の村（川の北の岸。家には当たりがある）
const LINE = { x: 2, z: -20 };               // 村の南の端：上田宗箇・浅野知近の備え
const EAST = { x: 52, z: -36 };              // 岡部の隊が横を突いて来る村の東の口
const HATA = { x: -6, z: -84 };              // 塙団右衛門の旗本が構える所（村の北）
const RIVER = [[-230, 6], [-110, -3], [-30, 1], [40, -1], [110, 5], [230, -2]];
const ROAD = [[6, 230], [4, 150], [4, 90], [2, 30], [0, 0], [-2, -50], [-4, -120], [-4, -230]];
const ASANO_HON = { x: 6, z: 120 };          // 浅野長晟の本陣（川の南で動かない）
const FROM_N = { x: -4, z: -212 };           // 豊臣の先手が寄せて来る所（貝塚・佐野の側）
const FROM_E = { x: 150, z: -110 };          // 岡部の隊が回り込んで来る所（東の田の向こう）
const EXIT_N = { x: -4, z: -224 };           // 豊臣の退き口
// 目標ごとの時間（秒）
const T1 = 160, T2 = 100, T3 = 210, T4 = 160, T5 = 170;
const STEP_TEXT = ['',
  '八丁畷で亀田高綱と並び、畷を寄せる塙の先手を討て',
  '撃ちながら南へ退き、樫井の村の上田宗箇の備えまで戻れ',
  '樫井の村に攻め入る塙・淡輪の隊を討て',
  '東の田から村の横を突く岡部則綱の隊を押し返せ',
  '旗本に守られた塙団右衛門を討て'];
const STEP_T = [0, T1, T2, T3, T4, T5];

const sm = (a, b, v) => { const k = Math.max(0, Math.min(1, (v - a) / (b - a))); return k * k * (3 - 2 * k); };
function riverZ(x) {
  for (let i = 0; i < RIVER.length - 1; i++) { const [ax, az] = RIVER[i], [bx, bz] = RIVER[i + 1]; if (x >= ax && x <= bx) return az + (bz - az) * (x - ax) / (bx - ax); }
  return 0;
}
// 川の両岸は低い河原と田。東は和泉の山すそへゆるく上がり、西は海へ下りる砂丘
function height(x, z) {
  const rz = z - riverZ(x);
  let h = 1.3 + 0.3 * Math.sin(x * 0.02 + 0.5) * Math.cos(z * 0.017) + 0.2 * Math.sin(z * 0.06 - x * 0.03);
  h -= 0.8 * (1 - sm(12, 36, Math.abs(rz)));
  h += 20 * sm(120, 230, x) + 1.8 * sm(30, 150, Math.abs(rz)) * sm(60, 200, x);
  h += 1.6 * sm(-150, -230, x);
  return h;
}
// 八丁畷：熊野街道の左右は水を張った田。畷（道）の上だけが乾いていて、兵は畷を寄せる（足が取られる田は避ける）
function paddy(x, z) {
  if (z < -175 || z > -92) return 0;
  const rx = x - (-4);
  if (Math.abs(rx) < 5 || Math.abs(rx) > 66) return 0;
  const ex = Math.min(((x % 14) + 14) % 14, 14 - ((x % 14) + 14) % 14), ez = Math.min(((z % 12) + 12) % 12, 12 - ((z % 12) + 12) % 12);
  return Math.max(0, Math.min(1, (Math.min(ex, ez) - 0.8) / 0.6)) * 0.85;
}

const live = (g) => g && g.units.some((u) => u.alive && !u.gone && !u.fleeing);
const aliveN = (g) => (g ? g.units.reduce((n, u) => n + (u.alive && !u.gone && !u.fleeing ? 1 : 0), 0) : 0);
const sumN = (...gs) => gs.reduce((n, g) => n + aliveN(g), 0);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
// 浅野勢：黒い具足に浅野の旗（丸に違い鷹の羽）。豊臣方の浪人衆：くすんだ黒の具足に豊臣の桐
const ASA = { flag: 'asano' };
const TOY = { flag: 'toyotomi', armor: 0x2a2622 };
const asaD = (list) => list.map((s) => ({ ...s, o: { ...ASA, ...(s.o || {}) } }));
const toyD = (list) => list.map((s) => ({ ...s, o: { ...TOY, ...(s.o || {}) } }));
const PIN = { x: 0, z: 0, r: 8, hide: 6, always: true, silent: true, enemy: false, unit: null, follow: false, fire: false, gate: false, defend: false, waiting: false, arrived: false, area: false, route: false };
const mmss = (s) => { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

const k12_kashii = {
  // 身の回りの合戦の跡（timeslip_field.js）。樫井：四月末（今の六月初め）の初夏。青い草と田の水、押し合った跡
  timeslip: {
    wet: 0.4, dust: 0.3, trample: 0.35, debris: 1.2, arrows: 0.9, reeds: 0.4,
    grass: 0x7e9a4c, grassTints: [0xffffff, 0xe4ecc4, 0xc8d49c], grassH: 1.15, grassLift: 0.2, grassShape: 'blade', tallGrass: 0.9,
    flagColors: [0xe6dfcc, 0x3a4a6a, 0xdaaf3c],
  },
  spawn: { x: START.x, z: START.z, heading: Math.PI },
  minutes: 15,
  noWake: true,
  noFrontFill: true,       // 見せかけの軍勢（奥の軽い乱戦・自動の大軍）を重ねない（AA・AF・AP9・AQ6）。見える兵は全部本物
  noDistantBattle: true,
  noLeaderFollow: true,    // 行き先の印は段ごとの一つだけ（AL：黄色と青を同時に出さない）
  compactIntro: true,
  introText: () => '安松の八丁畷で殿を務め、塙団右衛門の先手を樫井の村まで引き寄せて討て。',
  hideGuideSteps: true,
  noCouriers: true,
  noTaisho: true,
  noReserve: true,
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
    const c = (...gs) => { for (const g of gs) if (live(g)) return g.center(); return null; };
    let p = YASU;
    if (F.step === 1) p = c(F.hana1, F.oka1) || YASU;
    else if (F.step === 2) p = LINE;
    else if (F.step === 3) p = c(F.hana, F.awa) || VILLAGE;
    else if (F.step === 4) p = c(F.oka) || EAST;
    else if (F.step === 5) p = F.hanaU?.alive ? F.hanaU.pos : HATA;
    PIN.x = p.x; PIN.z = p.z; PIN.r = F.step === 2 ? 12 : 8;
    return PIN;
  },
  // 戦の前と後の会話（docs/chapter3_tokugawa.md の 12）
  talk: {
    before: [['亀田高綱', '佐野の北に塙と岡部の旗。先を争って、熊野街道を寄せて来る'], ['使番', '長晟様のお下知。本隊は樫井の村で構える。亀田殿は安松で殿を'],
      ['亀田高綱', '承った。畷は一筋、田は足を取る。鉄砲を前へ。撃っては退き、敵を樫井まで引き寄せるぞ']],
    after: [['浅野長晟', '団右衛門も淡輪も果てたか。……亀田、ようも殿を務めた'], ['亀田高綱', '治房の本隊は貝塚から来ませなんだ。先手だけが突き出たのが、敵の負けにござる']],
  },
  world: {
    seed: 16150429,
    time: 'day',
    mist: 0.3,
    groundHalf: 235,
    moveLim: 226,
    height,
    paddy,
    fieldStage: 'seedling',  // 旧暦四月末：田植えの済んだ水田
    patchyGround: true,
    noGroundRipples: true,
    riverCross: true,
    wadeDepth: 0.85,
    streams: [{ pts: RIVER, w: 12, depth: 1.5, fords: [FORD, FORD2] }],
    paths: [{ pts: ROAD, w: 3.4 }],
    // 旧暦四月二十九日（今の六月初め）：水を張った田、濃い草
    tint(x, z, h, c) {
      const a = Math.sin(x * 0.05 + 1.1) * Math.cos(z * 0.04 - 0.4);
      const k = 0.5 + 0.5 * a;
      if (h < 3.2 && Math.abs(x) < 120) c.setRGB(c.r * (0.7 + k * 0.2), c.g * (0.9 + k * 0.2), c.b * (0.62 + k * 0.2));
      else c.setRGB(c.r * (0.8 + k * 0.2), c.g * (0.9 + k * 0.2), c.b * (0.78 + k * 0.2));
    },
    groves: [
      { x: -130, z: 30, r: 28, n: 60, kind: 'matsu' }, { x: -150, z: -60, r: 26, n: 50, kind: 'matsu' },
      { x: 150, z: 60, r: 24, n: 50 }, { x: 170, z: -40, r: 22, n: 46, kind: 'sugi' },
      { x: 62, z: 150, r: 14, n: 18 }, { x: VILLAGE.x + 8, z: VILLAGE.z - 22, r: 8, n: 10 },
    ],
    trees: 150,
    tufts: 2200,
    treeDensity: (x, z) => (distToPolyline(x, z, ROAD) < 14 || Math.abs(z - riverZ(x)) < 22 || paddy(x, z) > 0 || dist({ x, z }, VILLAGE) < 34 ? 0.05 : 0.6),
    clear: (x, z) => distToPolyline(x, z, ROAD) < 10 || Math.abs(z - riverZ(x)) < 24,
    fleeOut: (x, z, team) => (team === 1 ? z < -218 : z > 228),
  },

  setup(rt) {
    timeslipField(rt);   // 身の回りの踏み荒らした地面・倒れた槍と旗・季節の草（def.timeslip）
    const F = rt.flags, W = rt.world;
    F.step = 0; F.holdPlayer = true; F.foes = []; F.ending = false; F.ek = 0; F.ak = 0;
    // 樫井の村（川の北の岸。家には当たりがある）と浅野の本陣の幕・旗。見せかけの軍勢は置かない（AA・AF・AP9・AQ6）
    KIT.farVillage(rt, VILLAGE.x, VILLAGE.z, { rot: 0, n: 9, r: 20, fields: 6, seed: 1615 });
    rt.scene.add(jinmaku(W, ASANO_HON.x + 10, ASANO_HON.z + 10, 14, 10, 4, { mon: 'asano' }));
    for (const [x, z] of [[ASANO_HON.x - 10, ASANO_HON.z + 2], [ASANO_HON.x + 22, ASANO_HON.z + 4], [LINE.x - 22, LINE.z + 6], [LINE.x + 20, LINE.z + 6], [YASU.x + 8, YASU.z + 8]]) rt.scene.add(nobori(W, x, z, 'asano', 6));
    for (const [x, z] of [[ASANO_HON.x + 4, ASANO_HON.z - 6], [LINE.x + 8, LINE.z + 10]]) rt.scene.add(kagaribi(W, x, z));
    // 亀田高綱の殿（安松の八丁畷）と主人公の手勢。鉄砲が多い（撃っては退く）
    F.mine = allyGroup(rt, { faction: 'tokugawa', name: '手勢', fullStrength: true, fixed: true, anchor: { x: START.x + 2, z: START.z + 4 }, facing: Math.PI, width: 5, aggro: 10, speed: 3.6, order: 'hold', noRout: true, dmgMult: 0.9 },
      asaD([{ type: 'samurai', n: 4 }, { type: 'ashigaru', n: 8 }, { type: 'gun', n: 5 }]));
    F.kame = allyGroup(rt, { faction: 'tokugawa', name: '亀田高綱の殿', fullStrength: true, fixed: true, anchor: { x: YASU.x, z: YASU.z + 4 }, facing: Math.PI, width: 6, aggro: 12, speed: 3.6, order: 'hold', noRout: true, defMult: 1.3 },
      asaD([{ type: 'busho', n: 1, o: { name: '亀田高綱', invuln: true, horse: true } }, { type: 'samurai', n: 4 }, { type: 'gun', n: 10 }, { type: 'ashigaru', n: 8 }]));
    // 樫井の村の南の端で待つ浅野の備え（上田宗箇・浅野知近）
    F.ueda = allyGroup(rt, { faction: 'tokugawa', name: '上田宗箇の手', fullStrength: true, fixed: true, anchor: { x: LINE.x + 16, z: LINE.z }, facing: Math.PI, width: 9, aggro: 12, speed: 3.6, order: 'hold', noRout: true, formation: 'yari' },
      asaD([{ type: 'busho', n: 1, o: { name: '上田宗箇', invuln: true, horse: true } }, { type: 'samurai', n: 5 }, { type: 'ashigaru', n: 16 }, { type: 'gun', n: 6 }]));
    F.tomo = allyGroup(rt, { faction: 'tokugawa', name: '浅野知近の手', fullStrength: true, fixed: true, anchor: { x: LINE.x - 16, z: LINE.z }, facing: Math.PI, width: 9, aggro: 12, speed: 3.6, order: 'hold', noRout: true, formation: 'yari' },
      asaD([{ type: 'busho', n: 1, o: { name: '浅野知近', invuln: true, horse: true } }, { type: 'samurai', n: 4 }, { type: 'ashigaru', n: 16 }, { type: 'bow', n: 4 }]));
    // 浅野長晟の本陣：川の南で旗本の侍に囲まれ、前に出ない（AR3）
    F.honjin = allyGroup(rt, { faction: 'tokugawa', name: '浅野長晟の本陣', fullStrength: true, fixed: true, anchor: { x: ASANO_HON.x, z: ASANO_HON.z }, facing: Math.PI, width: 8, aggro: 4, seekRange: 10, order: 'hold', noRout: true },
      asaD([{ type: 'busho', n: 1, o: { name: '浅野長晟', invuln: true, horse: true } }, { type: 'samurai', n: 16 }, { type: 'gun', n: 4 }]));
    for (const g of [F.kame, F.ueda, F.tomo]) g.ai = true;
    const T = this.talk.before;
    T.forEach(([who, s], i) => rt.after(0.6 + i * 3.4, () => rt.say(who, s, 3.2)));
    rt.after(0.6 + T.length * 3.4, () => { F.holdPlayer = false; this.toStep(rt, 1); });
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
      F.kame.order = 'attack'; F.kame.seekRange = 30;
      // 塙の先手が貝塚の側から畷を寄せる。少し遅れて岡部の先手も（先陣を争う二つの隊）
      F.hana1 = this.foe(rt, '塙の先手', { x: FROM_N.x, z: FROM_N.z }, [{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 18 }, { type: 'gun', n: 5 }], { aim: YASU, width: 4 });
      F.w1S = aliveN(F.hana1);
      rt.after(22, () => { if (F.step === 1) { F.oka1 = this.foe(rt, '岡部の先手', { x: FROM_N.x + 6, z: FROM_N.z - 6 }, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 15 }, { type: 'gun', n: 4 }], { aim: YASU, width: 4 }); F.w1S += aliveN(F.oka1); } });
      F.w1N = 47;
      rt.after(2.5, () => rt.say('亀田高綱', '来たぞ。畷に並んだ所を引き付けて、放て！', 3));
      rt.after(24, () => rt.say('使番', '岡部の隊も畷に並んだ！　塙に先を越されまいと急いでおる', 3.4));
    } else if (n === 2) {
      rt.banner('撃っては退く', '樫井の村まで敵を引き寄せる');
      rt.say('亀田高綱', 'もう十分じゃ。撃ちながら退け！　樫井の村で上田殿が待っておる', 3.4);
      F.kame.order = 'move'; F.kame.dest = { x: LINE.x - 2, z: LINE.z + 8 }; F.kame.speed = 3.9;
      F.kame.onArrive = (q) => { q.order = 'hold'; q.anchor = { x: LINE.x - 2, z: LINE.z + 8 }; };
      // 追手：残りの先手と、塙の新手が背中を追う（後ろの北から。横や前には湧かせない）
      for (const g of [F.hana1, F.oka1]) if (live(g)) { g.order = 'attack'; g.seekRange = 120; g.speed = 3.7; g.anchor = { x: LINE.x, z: LINE.z - 20 }; }
      F.chase = this.foe(rt, '塙の追手', { x: FROM_N.x, z: FROM_N.z + 10 }, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 10 }], { aim: { x: LINE.x, z: LINE.z - 20 } });
      rt.after(5, () => rt.say('足軽', '後ろから追って来る！　足を止めるな！', 2.8));
    } else if (n === 3) {
      rt.banner('樫井の村', '塙と淡輪が村へ攻め入って来る');
      sfx('taiko', 1);
      // 先の追手は村の前で合流して戦い続ける。遠く残った者は北へ退かせ、本物の兵の枠を空ける
      for (const g of [F.hana1, F.oka1, F.chase]) if (live(g)) for (const u of g.units) if (u.alive && dist(u.pos, LINE) > 110) rt.army.despawn(u);
      F.hana = this.foe(rt, '塙団右衛門の隊', { x: -8, z: -150 }, [{ type: 'samurai', n: 4 }, { type: 'ashigaru', n: 18 }, { type: 'gun', n: 6 }], { aim: { x: 0, z: -30 }, morale: 98 });
      F.awa = this.foe(rt, '淡輪重政の隊', { x: 14, z: -158 }, [{ type: 'busho', n: 1, o: { name: '淡輪重政', invuln: false, horse: true } }, { type: 'samurai', n: 3 }, { type: 'ashigaru', n: 12 }, { type: 'gun', n: 3 }], { aim: { x: 22, z: -34 } });
      F.awaU = F.awa.units.find((u) => u.name === '淡輪重政');
      // 塙団右衛門は旗本の侍に守られて村の北に構える（目標の段まで前に出ない）
      F.hata = this.foe(rt, '塙団右衛門の旗本', { x: HATA.x, z: -170 }, [{ type: 'busho', n: 1, o: { name: '塙団右衛門', invuln: true, horse: true } }, { type: 'samurai', n: 10 }, { type: 'gun', n: 2 }], { aim: HATA, hold: true, morale: 100 });
      F.hanaU = F.hata.units.find((u) => u.name === '塙団右衛門');
      F.w3N = sumN(F.hana, F.awa);
      for (const g of [F.ueda, F.tomo, F.kame]) { g.order = 'attack'; g.seekRange = 40; g.aggro = 16; }
      rt.army.play('toki', { x: -4, z: -110 }, 1.5);
      rt.say('上田宗箇', '亀田殿、ようも引き付けた。村の家を楯に迎え撃つ。一人も川へ通すな！', 3.4);
      rt.after(4, () => rt.say('塙団右衛門', '先陣は我が物じゃ。岡部に遅れを取るな、村へ押し込め！', 3));
    } else if (n === 4) {
      rt.banner('横から岡部の隊', '東の田を回って村の横へ');
      F.oka = this.foe(rt, '岡部則綱の隊', FROM_E, [{ type: 'busho', n: 1, o: { name: '岡部則綱', invuln: true, horse: true } }, { type: 'samurai', n: 4 }, { type: 'ashigaru', n: 16 }, { type: 'gun', n: 4 }], { aim: EAST });
      F.okaU = F.oka.units.find((u) => u.name === '岡部則綱');
      F.w4N = aliveN(F.oka);
      if (live(F.ueda)) { F.ueda.order = 'attack'; F.ueda.anchor = { x: EAST.x - 12, z: EAST.z + 8 }; F.ueda.seekRange = 50; }
      rt.say('使番', '東の田に岡部の旗！　村の横へ回って来る！', 3);
      rt.after(3.4, () => rt.say('上田宗箇', '横を破られれば村は持たぬ。我らと東の口を固めよ！', 3.2));
    } else if (n === 5) {
      F.hanaU.invuln = false;
      rt.banner('塙団右衛門、斬り込む', '旗本の侍を連れて前へ出て来た');
      if (live(F.hata)) { F.hata.order = 'attack'; F.hata.anchor = { x: LINE.x, z: LINE.z - 14 }; F.hata.seekRange = 70; F.hata.noRout = true; }
      for (const g of [F.ueda, F.tomo, F.kame]) if (live(g)) { g.order = 'attack'; g.seekRange = 60; }
      rt.after(1.2, () => rt.say('塙団右衛門', '塙団右衛門直之、これにあり！　首が欲しくば取りに来い！', 3.4));
      rt.after(5, () => rt.say('亀田高綱', 'あれが団右衛門よ。旗本の侍を剥がして討て！', 3));
    }
  },

  // 豊臣方の隊を出す（見える所に湧かせない。北と東の遠くから寄せる）
  foe(rt, name, at, list, o = {}) {
    const F = rt.flags;
    const g = enemyGroup(rt, { faction: 'toyotomi', name, fixed: true, anchor: { x: at.x, z: at.z }, facing: 0, width: o.width || 7, noRout: true, formation: 'line',
      morale: o.morale || 95, dmgMult: 0.5, order: o.hold ? 'hold' : 'attack', seekRange: o.hold ? 26 : 90, aggro: 16, speed: 3.7 }, toyD(list));
    if (o.aim) g.anchor = { x: o.aim.x, z: o.aim.z };
    if (o.hold) { g.order = 'move'; g.dest = { x: o.aim.x, z: o.aim.z }; g.onArrive = (q) => { if (q.order === 'move') q.order = 'hold'; }; }
    rt.after(30, () => { if (g !== F.hata) g.noRout = false; });
    F.foes.push(g);
    return g;
  },

  // 岡部は横を突いたが退く（史実）
  okabeBack(rt) {
    const F = rt.flags;
    if (F.okaBack) return;
    F.okaBack = true;
    if (live(F.oka)) { F.oka.order = 'retreat'; F.oka.dest = { x: FROM_E.x, z: EXIT_N.z }; F.oka.speed = 4.3; F.oka.aggro = 0; }
    if (F.okaU?.alive) F.okaU.invuln = true;
    rt.banner('岡部の隊、退く', '村の横を守り切った');
    rt.after(1.2, () => rt.say('岡部則綱', '横からも破れぬか……。引け、引け！', 2.8));
    rt.after(4, () => this.toStep(rt, 5));
  },

  // 塙団右衛門の最期
  hanawaFalls(rt, byPlayer) {
    const F = rt.flags;
    if (F.hanaDown) return;
    F.hanaDown = true;
    if (!byPlayer && F.hanaU?.alive) {
      F.hanaU.invuln = false;
      rt.army.play('volley', F.hanaU.pos, 1.5);
      rt.army.kill(F.hanaU, null);
    }
    rt.banner('塙団右衛門、討ち取ったり', '樫井に散る');
    if (byPlayer) rt.award((t) => { t.special = { label: '塙団右衛門を討ち取った', pts: 32 }; }, '塙団右衛門を討ち取った');
    for (const g of [F.hata, F.hana, F.awa]) if (live(g)) { g.noRout = false; g.morale = Math.min(g.morale, 15); }
    rt.after(1.2, () => rt.say('浅野の侍', byPlayer ? '団右衛門、討ち取ったり！' : '鉄砲が団右衛門を撃ち倒したぞ！', 2.6));
    rt.after(4, () => this.win(rt));
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.objDone('s5');
    rt.tracker.main = true;
    rt.player.u.invuln = true;
    for (const g of F.foes) if (live(g)) { g.order = 'retreat'; g.dest = { x: EXIT_N.x, z: EXIT_N.z }; g.speed = 4.2; g.aggro = 0; }
    sfx('horagai', 0.8);
    rt.award((t) => { t.main = true; t.special = { label: '樫井で塙の先手を破った', pts: 20 }; }, '樫井で塙の先手を破った');
    rt.banner('樫井の戦い、浅野の勝ち', '大野治房は大坂へ引き上げた');
    const A = this.talk.after;
    rt.after(1.2, () => rt.say('使番', '申し上げます。治房の本隊は塙の死を聞き、貝塚から大坂へ引き上げた由', 3.4));
    rt.after(5, () => rt.say(A[0][0], A[0][1], 3.6));
    rt.after(9, () => rt.say(A[1][0], A[1][1], 3.6));
    rt.after(13, () => rt.say(nm(rt), '大坂の城は、もう目と鼻の先にござる', 3.2));
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
    if (F.ending || !F.step) return;
    const P = rt.player.u;
    // 手勢は本人の脇に付いて一緒に走る（AP5）
    if ((F.mineT = (F.mineT || 0) - dt) <= 0) {
      F.mineT = 0.6;
      const g = F.mine, c = live(g) && g.center();
      if (c) {
        if (dist(c, P.pos) > 8) { g.order = 'move'; g.dest = { x: P.pos.x + 2, z: P.pos.z + 3 }; g.speed = 3.9; }
        else { g.order = 'attack'; g.seekRange = 14; }
      }
    }
    if ((F.scanT = (F.scanT || 0) - dt) > 0) return;
    F.scanT = 0.25;
    const el = rt.t - F.stepT, left = STEP_T[F.step] - el;
    // 退いた敵は遠く離れたら去らせる（本物の兵の枠を空ける）
    if ((F.gcT = (F.gcT || 0) - 0.25) <= 0) {
      F.gcT = 1;
      for (const g of F.foes) for (const u of g.units) if (u.alive && !u.gone && (u.fleeing || g.order === 'retreat') && (u.pos.z < -170 || u.pos.x > 140) && dist(u.pos, P.pos) > 70) rt.army.despawn(u);
    }
    if (F.hanaU && !F.hanaU.alive && !F.hanaDown) this.hanawaFalls(rt, !!F.hanaByMe);
    if (F.step === 1) {
      const k = F.w1S - sumN(F.hana1, F.oka1), need = Math.round(F.w1N * 0.5);
      rt.objProgress('s1', `塙・岡部の先手 ${Math.min(k, need)}／${need}人・あと${mmss(left)}`);
      if (F.oka1 && k >= need) this.toStep(rt, 2);
      else if (left <= 0) { rt.say('亀田高綱', 'これ以上は持たぬ。退け！', 2.6); this.toStep(rt, 2); }
    } else if (F.step === 2) {
      rt.objProgress('s2', `あと${mmss(left)}`);
      if (P.pos.z > LINE.z - 10 && dist(P.pos, LINE) < 24) this.toStep(rt, 3);
      else if (left <= 0) this.lose(rt, '殿が取り残された', '樫井の村まで退けなかった');
    } else if (F.step === 3) {
      const k = F.w3N - sumN(F.hana, F.awa), need = Math.round(F.w3N * 0.5);
      rt.objProgress('s3', `塙・淡輪の隊 ${Math.min(k, need)}／${need}人・あと${mmss(left)}`);
      if (k >= need) this.toStep(rt, 4);
      else if (left <= 0) this.lose(rt, '樫井の村を破られた', '村を守り切れなかった');
    } else if (F.step === 4) {
      const k = F.w4N - aliveN(F.oka), need = Math.round(F.w4N * 0.5);
      if (!F.okaBack) rt.objProgress('s4', `岡部の隊 ${Math.min(k, need)}／${need}人・あと${mmss(left)}`);
      if (!F.okaBack && k >= need) this.okabeBack(rt);
      else if (!F.okaBack && left <= 0) this.lose(rt, '村の横を破られた', '岡部の隊を押し返せなかった');
    } else if (F.step === 5) {
      rt.objProgress('s5', `あと${mmss(left)}`);
      // 時が尽きても団右衛門は浅野の鉄砲に倒れる（史実）。手柄は付かない
      if (left <= 0 && !F.hanaDown) this.hanawaFalls(rt, false);
    }
  },

  onKill(rt, v, k) {
    const F = rt.flags;
    if (v.team === 1) F.ek++; else F.ak++;
    if (v.name === '塙団右衛門') F.hanaByMe = !!k?.isPlayer;
    if (v.name === '淡輪重政') {
      rt.banner('淡輪重政、討ち取ったり', '塙の隊の将');
      if (k?.isPlayer) rt.award((t) => { t.special = { label: '淡輪重政を討ち取った', pts: 18 }; }, '淡輪重政を討ち取った');
    }
  },
  onRout(rt, g) {
    if (g.team === 1 && g.name && !rt.flags.ending) rt.say('足軽', `${g.name}が崩れた！`, 2.5);
  },

  // bot：近い敵を突き、いなければ段の行き先へ
  botBrain(b, inp, { goTo, patientStrike }) {
    const p = b.player, u = p.u, F = b.flags;
    if (F.holdPlayer || !F.step || F.ending) return;
    const ok = (o) => !o.fleeing && !o.invuln && !o.noTarget && Math.abs(o.pos.y - u.pos.y) < 3;
    const e = F.step === 2 ? null : b.army.nearestEnemy(u, 9, ok);
    if (e) {
      const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
      if (p.lock && p.lock !== e) inp.e.add('KeyQ');
      p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
      if (d > 2.2) goTo(p, inp, e.pos.x, e.pos.z, 2.2); else inp.k.delete('KeyW');
      patientStrike(p, inp, e, d, true);
      return;
    }
    inp.guardHold = false;
    const t = this.missionPin(b) || LINE;
    goTo(p, inp, t.x, t.z, 2);
  },
};
k12_kashii.sides = { a: { name: '浅野勢', mon: 'asano' }, b: { name: '塙・岡部の先手', mon: 'toyotomi' } };
k12_kashii.force = (rt) => ({ a: Math.round(5000 - (rt.flags.ak || 0) * 20), a0: 5000, b: Math.max(0, Math.round(3000 - (rt.flags.ek || 0) * 25)), b0: 3000 });
k12_kashii.date = () => '慶長二十年（1615）四月二十九日　朝';
k12_kashii.canSkip = (rt) => (!rt.flags.step && rt.t > 3 ? '下知まで待つ' : '');
k12_kashii.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
k12_kashii.history = '慶長二十年（1615）四月、大坂城は堀を埋められて再び戦になった（夏の陣）。紀州の浅野長晟はおよそ五千で北上したが、大野治房の軍の先手を見つけて樫井まで退くと決め、亀田高綱を安松に殿として残した。二十九日の朝八時ごろ、塙団右衛門（直之）の手が熊野街道を寄せ、安松の八丁畷で戦が始まった。亀田は鉄砲で撃っては退き、敵を樫井の村へ引き寄せた。村の中で両軍が入り乱れ、上田宗箇・浅野知近らが加わる。岡部則綱は横から攻めたが退き、塙と淡輪重政ら名のある者十二人が討たれた。治房の本隊は貝塚から動かず、大坂へ引き上げた。\n兵の数、陣の配置、討たれ方には史料により違いがあり、遊びのために配置を縮めて復元した部分がある。';
k12_kashii.bushou = [{ name: '塙団右衛門', g: /団右衛門/ }, { name: '岡部則綱', g: /則綱/ }, { name: '淡輪重政', g: /重政/ }];

const st = (n) => (rt) => (rt.flags.step ?? 0) >= n;
STAGES.k12_kashii = [['八丁畷で塙の先手を討つ'], ['樫井の村の備えまで退く', st(2)], ['村に攻め入る塙・淡輪の隊を討つ', st(3)], ['横を突く岡部の隊を押し返す', st(4)], ['塙団右衛門を討つ', st(5)]];
// 倒す数（kaito 11/2 O）：段が進む判定と同じ数え方（stages.js）
KILLS.k12_kashii = (rt) => {
  const F = rt.flags;
  if (F.ending) return null;
  if (F.step === 1) return cut(F.w1N, F.w1N - (F.w1S - sumN(F.hana1, F.oka1)), F.w1N * 0.5);
  if (F.step === 3) return cut(F.w3N, sumN(F.hana, F.awa), (F.w3N || 1) * 0.5);
  if (F.step === 4 && !F.okaBack) return cut(F.w4N, aliveN(F.oka), (F.w4N || 1) * 0.5);
  return null;
};

export { k12_kashii };
export default k12_kashii;
