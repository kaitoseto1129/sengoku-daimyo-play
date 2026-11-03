// ======================================================================
// 徳川編 12　樫井の戦い（慶長二十年＝1615 四月二十九日。和泉国 樫井＝今の泉佐野。夏の陣の始まり）
// 筋書きの正：docs/chapter3_tokugawa.md の「12. 樫井」
// 紀州から北上する浅野長晟の軍（およそ五千）を、大野治房の軍（およそ三千）が樫井川で迎え撃つ。
// 先陣は岡部則綱のはずが、塙団右衛門は「先を越される」と抜け駆けして樫井へ先に出た。隊の連携が崩れ、浅野の先手と団右衛門の隊だけが先に組み合う。
// 団右衛門は戦死し（鉄砲に討たれたと伝わる）、浅野の先手の亀田高綱も討たれた。遅れて着いた治房の本隊は、浅野長晟の本隊を前に退く。
// 主人公は浅野長晟の軍の部将。段：①樫井川の渡しで塙の先手を迎え撃つ ②塙団右衛門を討つ ③遅れて来た大野治房の本隊を退ける
// 負け：本人が討たれる・七分のうちに渡しを守れない（樫井川を破られる）。
// 向き：北（−z）が大坂の側、南（＋z）が紀州の側。紀州街道が南北に通り、樫井川（東西）を浅瀬で渡る。東（＋x）が和泉の山、西（−x）が海。
// 地形：樫井川の下の平野で標高の起伏はごく小さいため、国土地理院の標高は混ぜず、手で描いた形にした（tools/dem.mjs に鍵を足せば混ぜられる）。
// 大軍：渡しの左右（東西）に浅野と豊臣の軽い大軍の乱戦を置き、本物の兵は渡しの真ん中。後ろに両軍の本陣と備。
// ======================================================================
import { enemyGroup, allyGroup, nm } from './bhelp.js';
import { nobori, jinmaku, kagaribi } from './props.js';
import { KIT } from './b_nagashinojo.js';
import { clash } from './b_sekigahara.js';
import { distToPolyline } from './world.js';
import { GENERALS } from './units_data.js';
import { STAGES } from './stages.js';
import { sfx } from './audio.js';
import { timeslipField } from './timeslip_field.js';

// ---- 名のある武将の甲冑（ここだけで足す。無ければ足す） ----
const face = (o) => ({ w: 1.05, jaw: 1.1, chin: 1, cheek: 1, gaunt: 0.2, brow: 1.2, nose: 1, nw: 1.1, eye: 1.1, t: 5, hair: 0x15110d, age: 40, ...o });
const give = (name, g) => { GENERALS[name] ||= { horo: 0, haoriMonCol: 0xe6dfcf, skin: 0x9c7453, ...g }; };
give('塙団右衛門', { armor: 0x1c1614, lace: 0x8a1e18, hat: 'kabuto_g', haori: 0x6a1812, mon: 'toyotomi', tack: 0x3a1a14,
  face: face({ age: 50, brow: 1.5, jaw: 1.3, beard: { mus: 1, musW: 1.2, droop: 0.6, goat: 0.8, side: 0.8, stub: 1.2 } }) });
give('大野治房', { armor: 0x2a2420, lace: 0x7a5a2a, hat: 'kabuto_m', haori: 0x4a3a22, mon: 'toyotomi', tack: 0x3a2a1c,
  face: face({ age: 45, beard: { mus: 0.8, musW: 1, droop: 0.4, goat: 0.2, side: 0.3, stub: 0.6 } }) });
give('岡部則綱', { armor: 0x2a2a2c, lace: 0x4a4a52, hat: 'kabuto_w', haori: 0x33343a, mon: 'toyotomi', tack: 0x2a2a30,
  face: face({ age: 48, gaunt: 0.4, beard: { mus: 0.7, musW: 1, droop: 0.5, goat: 0.1, side: 0.2, stub: 0.5 } }) });
give('浅野長晟', { armor: 0x1c1e26, lace: 0x2a3a58, hat: 'kabuto_s', haori: 0x2a3550, mon: 'none', tack: 0x1c2438, lord: true,
  face: face({ age: 29, jaw: 1, brow: 1, beard: { mus: 0.5, musW: 0.9, droop: 0.2, goat: 0, side: 0, stub: 0.1 } }) });
give('亀田高綱', { armor: 0x22201e, lace: 0x5a4a2a, hat: 'kabuto_t', haori: 0x3a2e22, mon: 'tokugawa',
  face: face({ age: 42, beard: { mus: 0.8, musW: 1, droop: 0.4, goat: 0.2, side: 0.3, stub: 0.8 } }) });
give('上田宗箇', { armor: 0x1e1c1a, lace: 0x3a4a3a, hat: 'kabuto_m', haori: 0x33402e, mon: 'tokugawa',
  face: face({ age: 53, gaunt: 0.5, beard: { mus: 0.6, musW: 0.9, droop: 0.3, goat: 0.5, side: 0.4, stub: 0.6 } }) });
give('浅野氏重', { armor: 0x1e2028, lace: 0x34445e, hat: 'kabuto_s', haori: 0x2e3a56, mon: 'none',
  face: face({ age: 32, beard: { mus: 0.5, musW: 0.9, droop: 0.2, goat: 0, side: 0, stub: 0.2 } }) });
give('淡輪重政', { armor: 0x2a2220, lace: 0x6a4a2a, hat: 'kabuto_w', haori: 0x4a3a28, mon: 'toyotomi',
  face: face({ age: 44, beard: { mus: 0.7, musW: 1, droop: 0.4, goat: 0.2, side: 0.3, stub: 0.7 } }) });

// ---- 場所（ゲームの座標。北が −z） ----
const START = { x: 6, z: 60 };               // 浅野の先手が陣を取る樫井川の南の岸
const FORD = { x: 0, w: 26 };                // 紀州街道が川を渡る浅瀬（幅の半分）
const FORD2 = { x: 92, w: 10 };
const RIVER = [[-230, 6], [-110, -3], [-30, 1], [40, -1], [110, 5], [230, -2]];
const ROAD = [[6, 230], [4, 150], [4, 90], [2, 30], [0, 0], [-4, -50], [-8, -120], [-4, -230]];
const VILLAGE = { x: 24, z: -54 };           // 樫井の宿（川の北）
const ASANO_HON = { x: 6, z: 128 };          // 浅野長晟の本陣
const ONO_HON = { x: -4, z: -176 };          // 大野治房の本陣（遠くで動かない）
const EXIT_N = { x: -4, z: -215 };           // 豊臣の退き口
const REAL_CAP = 190;                        // 戦う本物の兵の上限（iPhone の重さ）
const LIMIT = 420;                           // 渡しを破られるまで（秒）
const STEP_TEXT = ['', '樫井川の渡しで、塙団右衛門の先手を迎え撃て', '塙団右衛門を討て', '遅れて来た大野治房の本隊を退けよ'];

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

const live = (g) => g && g.units.some((u) => u.alive && !u.gone);
const aliveN = (g) => (g ? g.units.reduce((n, u) => n + (u.alive && !u.gone ? 1 : 0), 0) : 0);
const aliveReal = (rt) => rt.army.units.reduce((n, u) => n + (u.alive && !u.gone && !u.isStruct && u.type !== 'porter' ? 1 : 0), 0);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const ARMOR = KIT.ARMOR;
// 浅野勢：徳川方の黒い具足に、浅野の紺の差し色。豊臣方の浪人衆：くすんだ具足に豊臣の旗
const ASA = { flag: 'tokugawa' };
const TOY = { flag: 'toyotomi', armor: 0x302a24 };
const asaD = (list) => list.map((s) => ({ ...s, o: { ...ASA, ...(s.o || {}) } }));
const toyD = (list) => list.map((s) => ({ ...s, o: { ...TOY, ...(s.o || {}) } }));
const PIN = { x: 0, z: 0, r: 8, hide: 6, always: true, silent: true, enemy: false, unit: null, follow: false, fire: false, gate: false, defend: false, waiting: false, arrived: false, area: false, route: false };

const k12_kashii = {
  // 身の回りの合戦の跡（timeslip_field.js）。樫井：四月末（今の六月初め）の初夏。青い草と川岸の葦、押し合った跡
  timeslip: {
    wet: 0.3, dust: 0.35, trample: 0.35, debris: 1.2, arrows: 0.9, reeds: 0.4,
    grass: 0x7e9a4c, grassTints: [0xffffff, 0xe4ecc4, 0xc8d49c], grassH: 1.15, grassLift: 0.2, grassShape: 'blade', tallGrass: 0.9,
    flagColors: [0xe6dfcc, 0x24211e, 0x5a4a3a],
  },
  spawn: { x: START.x, z: START.z, heading: Math.PI },
  minutes: 6,
  compactIntro: true,
  introText: () => '紀州街道を北へ。樫井川の渡しで、抜け駆けの塙団右衛門を迎え撃て。',
  missionSingleLine: true,
  hideGuideSteps: true,
  noMiniMap: true,
  noCouriers: true,
  noTaisho: true,
  noReserve: true,
  foeMarks: true,
  playerAtkMax: 3,
  playerTaken: 0.45,
  playerRegen: 0.025,
  closeCombatAssist: true,
  noWinCrane: true,
  // 行き先のピン：段ごとに一つ（字は出さない）
  missionPin(rt) {
    const F = rt.flags;
    if (!F.step || F.ending) return null;
    let p = { x: FORD.x, z: 2 };
    if (F.step === 2 && F.hanaU?.alive) p = F.hanaU.pos;
    else if (F.step === 3) p = F.haruU?.alive ? F.haruU.pos : { x: 0, z: -90 };
    PIN.x = p.x; PIN.z = p.z; PIN.r = F.step === 1 ? 14 : 8;
    return PIN;
  },
  // 戦の前と後の会話（docs/chapter3_tokugawa.md の 12）
  talk: {
    before: [['浅野長晟', '大坂の城は堀を埋められ、再び戦になった。我らは紀州から北へ上り、大坂へ馳せ参ずる'], ['使番', '申し上げます。大野治房の軍が堺を焼き、岸和田の方から南へ。樫井で道をふさぐ構えにござる'],
      ['亀田高綱', '塙団右衛門なる者が、先に樫井へ出たと聞く。他の隊はまだ追いつかぬ様子。叩くなら今じゃ'], ['浅野長晟', '先手は樫井川の南に陣を取れ。渡しを破らせるな']],
    after: [['浅野長晟', '団右衛門は討たれたか。惜しい男よ。……だが大坂へはまだ遠い'], ['上田宗箇', '亀田殿も討死にござる。道をふさいだ代わりに、大きな代を払いましたな']],
  },
  world: {
    seed: 16150429,
    time: 'day',
    mist: 0.3,
    groundHalf: 235,
    moveLim: 226,
    height,
    patchyGround: true,
    noGroundRipples: true,
    riverCross: true,
    wadeDepth: 0.85,
    streams: [{ pts: RIVER, w: 12, depth: 1.5, fords: [FORD, FORD2] }],
    paths: [{ pts: ROAD, w: 3.4 }],
    // 旧暦四月二十九日（今の六月末）：梅雨どきの水を張った田、濃い草
    tint(x, z, h, c) {
      const a = Math.sin(x * 0.05 + 1.1) * Math.cos(z * 0.04 - 0.4);
      const k = 0.5 + 0.5 * a;
      if (h < 3.2 && Math.abs(x) < 120) c.setRGB(c.r * (0.7 + k * 0.2), c.g * (0.9 + k * 0.2), c.b * (0.62 + k * 0.2));
      else c.setRGB(c.r * (0.8 + k * 0.2), c.g * (0.9 + k * 0.2), c.b * (0.78 + k * 0.2));
    },
    groves: [
      { x: -130, z: 30, r: 28, n: 60, kind: 'matsu' }, { x: -150, z: -80, r: 26, n: 50, kind: 'matsu' },
      { x: 150, z: 60, r: 24, n: 50 }, { x: 160, z: -60, r: 26, n: 56, kind: 'sugi' },
      { x: 62, z: 150, r: 14, n: 18 }, { x: -60, z: -110, r: 16, n: 22, kind: 'matsu' },
    ],
    trees: 150,
    tufts: 2200,
    treeDensity: (x, z) => (distToPolyline(x, z, ROAD) < 14 || Math.abs(z - riverZ(x)) < 22 ? 0.05 : 0.6),
    clear: (x, z) => distToPolyline(x, z, ROAD) < 10 || Math.abs(z - riverZ(x)) < 24,
    fleeOut: (x, z, team) => (team === 1 ? z < -228 : z > 228),
  },

  setup(rt) {
    timeslipField(rt);   // 身の回りの踏み荒らした地面・倒れた槍と旗・季節の草（def.timeslip）
    const F = rt.flags, W = rt.world;
    F.step = 0; F.holdPlayer = true; F.foes = []; F.ending = false; F.ek = 0; F.ak = 0;
    // 樫井の宿・旗・篝火
    KIT.farVillage(rt, VILLAGE.x, VILLAGE.z, { rot: Math.PI / 2, n: 7, fields: 8, seed: 1615 });
    rt.scene.add(jinmaku(W, START.x + 14, START.z + 22, 12, 9, 4, { mon: 'tokugawa' }));
    for (const [x, z] of [[START.x - 14, START.z + 6], [START.x + 20, START.z + 8], [START.x + 4, START.z + 26]]) rt.scene.add(nobori(W, x, z, 'tokugawa', 6));
    for (const [x, z] of [[VILLAGE.x - 18, VILLAGE.z - 20], [VILLAGE.x + 6, VILLAGE.z - 30], [-30, -72]]) rt.scene.add(nobori(W, x, z, 'toyotomi', 6));
    for (const [x, z] of [[START.x + 16, START.z + 18], [VILLAGE.x - 6, VILLAGE.z - 4]]) rt.scene.add(kagaribi(W, x, z));
    // 大軍：渡しの左右の乱戦（浅野の大軍対豊臣の浪人衆）、後ろの両軍の本陣と備
    const wing = (x, seed) => clash(rt, { x, z: -8, facing: Math.PI, w: 56, gap0: 22, seed, noRout: true,
      A: { flag: 'tokugawa', armor: ARMOR.tokugawa, count: 330, team: 0, faction: 'tokugawa' },
      B: { flag: 'toyotomi', armor: 0x302a24, count: 280, team: 1, faction: 'ikko' } });
    F.cw = [wing(-78, 16151), wing(80, 16152)];
    W.addDistantArmy({ x: 4, z: 176, w: 40, d: 30, count: 300, facing: Math.PI, armor: ARMOR.tokugawa, team: 0, mon: 'tokugawa', seed: 16153 });
    W.addDistantArmy({ x: -8, z: -130, w: 30, d: 54, count: 320, facing: 0, armor: 0x302a24, team: 1, mon: 'toyotomi', seed: 16154 });
    KIT.farHost(rt, ASANO_HON.x, ASANO_HON.z + 16, 18, 10, 60, Math.PI, ARMOR.tokugawa, 'tokugawa', 16155, 'honjin');
    KIT.farHost(rt, ONO_HON.x, ONO_HON.z, 18, 10, 60, 0, 0x302a24, 'toyotomi', 16156, 'honjin');
    // 浅野の先手と本陣（主人公はその先手の部将）
    F.mine = allyGroup(rt, { name: '手勢', fullStrength: true, anchor: { x: START.x + 2, z: START.z + 5 }, facing: Math.PI, width: 5, aggro: 10, speed: 3.6, order: 'hold', noRout: true, dmgMult: 0.9 },
      asaD([{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 12 }, { type: 'gun', n: 3 }]));
    F.kame = allyGroup(rt, { name: '亀田高綱の先手', fullStrength: true, anchor: { x: START.x - 18, z: START.z - 2 }, facing: Math.PI, width: 6, aggro: 12, speed: 3.4, order: 'hold', noRout: true },
      asaD([{ type: 'busho', n: 1, o: { name: '亀田高綱', invuln: true, horse: true } }, { type: 'samurai', n: 3 }, { type: 'ashigaru', n: 14 }, { type: 'gun', n: 4 }, { type: 'bow', n: 2 }]));
    F.kameU = F.kame.units.find((u) => u.name === '亀田高綱');
    F.ueda = allyGroup(rt, { name: '上田宗箇の手', fullStrength: true, anchor: { x: START.x + 22, z: START.z - 2 }, facing: Math.PI, width: 6, aggro: 12, speed: 3.4, order: 'hold', noRout: true },
      asaD([{ type: 'busho', n: 1, o: { name: '上田宗箇', invuln: true, horse: false } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 12 }, { type: 'gun', n: 4 }]));
    F.ujishige = allyGroup(rt, { name: '浅野氏重の手', fullStrength: true, anchor: { x: START.x + 4, z: START.z + 26 }, facing: Math.PI, width: 6, aggro: 10, speed: 3.4, order: 'hold', noRout: true },
      asaD([{ type: 'busho', n: 1, o: { name: '浅野氏重', invuln: true, horse: true } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 12 }, { type: 'bow', n: 3 }]));
    F.honjin = allyGroup(rt, { name: '浅野長晟の本陣', fullStrength: true, anchor: { x: ASANO_HON.x, z: ASANO_HON.z }, facing: Math.PI, width: 4, aggro: 4, seekRange: 10, order: 'hold', noRout: true },
      asaD([{ type: 'busho', n: 1, o: { name: '浅野長晟', invuln: true, horse: true } }, { type: 'samurai', n: 4 }, { type: 'ashigaru', n: 6 }]));
    for (const g of [F.mine, F.kame, F.ueda, F.ujishige]) g.ai = true;
    rt.obj('main', STEP_TEXT[1], 'main');
    const T = this.talk.before;
    T.forEach(([who, s], i) => rt.after(0.6 + i * 3.2, () => rt.say(who, s, 3)));
    rt.after(0.6 + T.length * 3.2, () => { F.holdPlayer = false; this.toStep(rt, 1); });
  },

  // 段を進める（右上の一行と行き先のピン）
  toStep(rt, n) {
    const F = rt.flags;
    if (F.step >= n || F.ending) return;
    if (F.step) rt.objDone('s' + F.step);
    F.step = n; F.stepT = rt.t;
    rt.obj('s' + n, STEP_TEXT[n], 'main');
    if (n === 1) {
      sfx('horagai', 0.8);
      rt.after(1, () => sfx('taiko', 0.8));
      for (const c of F.cw) c?.go?.();
      // 浅野の先手が川の南の岸へ出て構える
      for (const [g, dx] of [[F.kame, -16], [F.ueda, 18], [F.ujishige, 2]]) {
        g.order = 'move'; g.dest = { x: FORD.x + dx, z: 22 + (dx === 2 ? 14 : 0) }; g.speed = 3.4;
        g.onArrive = (q) => { q.order = 'attack'; q.seekRange = 30; };
      }
      this.spawnHanawa(rt);
      rt.after(2.5, () => rt.say('使番', '樫井の宿に塙の旗！　一隊だけ先に出てござる！', 3));
    } else if (n === 2) {
      F.hanaU.invuln = false;
      rt.banner('隊の連携が崩れる', '塙団右衛門だけが先に出た');
      rt.after(1.5, () => rt.say('使番', '岡部殿も大野様の本隊も、まだ宿の北ではござらぬ！　塙ひとりが突っ込んでくる！', 3.4));
      rt.after(5, () => rt.say('塙団右衛門', '先陣は我が物じゃ。浅野の旗を一つ残らず取れ！', 3));
      // 亀田高綱は押し出して団右衛門の隊に当たる
      for (const g of [F.kame, F.ueda]) { g.order = 'attack'; g.seekRange = 70; g.aggro = 16; }
      F.kameFall = rt.t + 24;
    } else if (n === 3) {
      sfx('taiko', 1);
      rt.army.play('toki', { x: -4, z: -80 }, 1.5);
      F.cw.forEach((c) => c?.push?.('A', 0.6));
      this.spawnOno(rt);
      // 浅野の本隊が渡しへ上がる
      F.honjin.order = 'move'; F.honjin.dest = { x: 4, z: 34 }; F.honjin.speed = 3.2;
      F.honjin.onArrive = (q) => { q.order = 'hold'; };
      for (const g of [F.kame, F.ueda, F.ujishige]) if (live(g)) { g.order = 'attack'; g.seekRange = 70; g.aggro = 16; }
      rt.say('浅野長晟', '団右衛門は果てたか。本隊、渡しへ進め。治房の軍を川に入れるな', 3.2);
      rt.after(3.4, () => rt.say('大野治房', '塙が討たれたと！？　……ええい、浅野の本隊が見える。構わぬ、押せ！', 3.2));
    }
  },

  // 塙団右衛門の先手：北の街道を南へ、樫井の宿から川へ下りてくる
  spawnHanawa(rt) {
    const F = rt.flags;
    F.hana = enemyGroup(rt, { faction: 'ikko', name: '塙団右衛門の隊', anchor: { x: -4, z: -92 }, facing: 0, width: 6, noRout: true, formation: 'line',
      morale: 95, dmgMult: 0.5, order: 'attack', seekRange: 90, aggro: 16, speed: 3.7, focus: rt.player.u },
    toyD([{ type: 'busho', n: 1, o: { name: '塙団右衛門', invuln: true, horse: false } }, { type: 'samurai', n: 3 }, { type: 'ashigaru', n: 13 }, { type: 'gun', n: 4 }]));
    F.hanaU = F.hana.units.find((u) => u.name === '塙団右衛門');
    F.awa = enemyGroup(rt, { faction: 'ikko', name: '淡輪重政の隊', anchor: { x: 14, z: -102 }, facing: 0, width: 6, noRout: true, formation: 'line',
      morale: 90, dmgMult: 0.45, order: 'attack', seekRange: 90, aggro: 16, speed: 3.6 },
    toyD([{ type: 'busho', n: 1, o: { name: '淡輪重政', invuln: false, horse: false } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 12 }, { type: 'gun', n: 3 }]));
    F.foes.push(F.hana, F.awa);
    F.wave1N = aliveN(F.hana) + aliveN(F.awa);
    rt.army.play('toki', { x: -4, z: -90 }, 1.4);
  },

  // 遅れて着いた大野治房の本隊と岡部則綱の隊
  spawnOno(rt) {
    const F = rt.flags;
    const room = REAL_CAP - aliveReal(rt);
    F.ono = enemyGroup(rt, { faction: 'ikko', name: '大野治房の本隊', anchor: { x: -8, z: -112 }, facing: 0, width: 7, noRout: true, formation: 'line',
      morale: 95, dmgMult: 0.5, order: 'attack', seekRange: 90, aggro: 16, speed: 3.5, focus: rt.player.u },
    toyD([{ type: 'busho', n: 1, o: { name: '大野治房', invuln: true, horse: true } }, { type: 'samurai', n: 3 }, { type: 'ashigaru', n: room > 60 ? 14 : 8 }, { type: 'gun', n: 4 }, { type: 'bow', n: 2 }]));
    F.haruU = F.ono.units.find((u) => u.name === '大野治房');
    F.foes.push(F.ono);
    if (room > 40) {
      F.oka = enemyGroup(rt, { faction: 'ikko', name: '岡部則綱の隊', anchor: { x: 18, z: -122 }, facing: 0, width: 6, noRout: true, formation: 'line',
        morale: 92, dmgMult: 0.45, order: 'attack', seekRange: 90, aggro: 16, speed: 3.5 },
      toyD([{ type: 'busho', n: 1, o: { name: '岡部則綱', invuln: false, horse: false } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 11 }, { type: 'gun', n: 3 }]));
      F.foes.push(F.oka);
    }
    F.ono0 = aliveN(F.ono) + aliveN(F.oka);
  },

  // 塙団右衛門の最期
  hanawaFalls(rt, scripted) {
    const F = rt.flags;
    if (F.hanaDown) return;
    F.hanaDown = true;
    if (scripted && F.hanaU?.alive) {
      F.hanaU.invuln = false;
      rt.army.play('volley', F.hanaU.pos, 1.5);
      rt.army.kill(F.hanaU, null);
    }
    rt.banner('塙団右衛門、戦死', '樫井に散る');
    rt.award((t) => { t.special = { label: '塙団右衛門を討ち取った', pts: 32 }; }, '塙団右衛門を討ち取った');
    if (live(F.hana)) { F.hana.order = 'attack'; F.hana.morale = Math.min(F.hana.morale, 30); }
    rt.after(1.2, () => rt.say('浅野の侍', '団右衛門、討ち取ったり！', 2.6));
    rt.after(3, () => this.toStep(rt, 3));
  },

  // 亀田高綱の討死（史実。浅野の先手の大将）
  kameFalls(rt) {
    const F = rt.flags;
    if (F.kameDown) return;
    F.kameDown = true;
    if (F.kameU?.alive) { F.kameU.invuln = false; rt.army.kill(F.kameU, null); }
    rt.banner('亀田高綱、討死', '浅野の先手の将');
    rt.say('上田宗箇', '亀田殿が！　……退くな、仇を討つぞ', 2.8);
  },

  retreat(rt) {
    const F = rt.flags;
    if (F.retreating) return;
    F.retreating = true;
    rt.banner('豊臣勢、退く', '治房の軍が北へ引き上げる');
    sfx('horagai', 0.8);
    for (const g of F.foes) if (live(g)) { g.order = 'retreat'; g.dest = { x: EXIT_N.x, z: EXIT_N.z }; g.speed = 4.2; g.aggro = 0; }
    F.cw.forEach((c) => { c?.rout?.('B', { hideAfter: 20 }); c?.push?.('A', 1); });
    rt.say('大野治房', '無念じゃ。退け、退け！　岸和田まで引くぞ', 3);
    rt.after(6, () => this.win(rt));
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.objDone('s3');
    rt.tracker.main = true;
    rt.player.u.invuln = true;
    rt.award((t) => { t.main = true; t.special = { label: '樫井川の渡しを守り切った', pts: 20 }; }, '樫井川を守り切った');
    rt.banner('樫井の戦い、浅野の勝ち', '慶長二十年四月二十九日');
    const A = this.talk.after;
    rt.after(1.2, () => rt.say(A[0][0], A[0][1], 3.6));
    rt.after(5.2, () => rt.say(A[1][0], A[1][1], 3.6));
    rt.after(9.2, () => rt.say(nm(rt), '大坂は目と鼻の先。次は、道明寺の方にござりましょう', 3.4));
    rt.finish({ scriptedEnd: true }, 14);
  },

  lose(rt, why) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.tracker.main = false;
    rt.objFail('s' + (F.step || 1));
    rt.banner('樫井川を破られた', '浅野の先手が崩れた');
    rt.finish({ scriptedEnd: true, failureReason: why }, 6);
  },

  update(rt, dt) {
    const F = rt.flags;
    if (F.ending || !F.step) return;
    const P = rt.player.u;
    // 手勢は本人の脇に付く
    if ((F.mineT = (F.mineT || 0) - dt) <= 0) {
      F.mineT = 0.6;
      const g = F.mine, c = live(g) && g.center();
      if (c) {
        if (dist(c, P.pos) > 8) { g.order = 'move'; g.dest = { x: P.pos.x + 2, z: P.pos.z + 3 }; g.speed = 3.8; }
        else { g.order = 'attack'; g.seekRange = 14; }
      }
    }
    if ((F.scanT = (F.scanT || 0) - dt) > 0) return;
    F.scanT = 0.25;
    // 団右衛門の最期：討たれた時
    if (F.hanaU && !F.hanaU.alive && !F.hanaDown) this.hanawaFalls(rt, false);
    // 負け：渡しを破られる（時間切れ）
    if (rt.t > LIMIT && !F.retreating) return this.lose(rt, '渡しを守り切れなかった');
    const el = rt.t - F.stepT;
    if (F.step === 1) {
      const left = aliveN(F.hana) + aliveN(F.awa);
      if ((el > 20 && left <= F.wave1N * 0.5) || el > 50) this.toStep(rt, 2);
    } else if (F.step === 2) {
      if (F.kameFall && rt.t > F.kameFall) this.kameFalls(rt);
      // 団右衛門が生き残っていれば、浅野の鉄砲が討つ（史実：鉄砲に倒れたと伝わる）
      if (el > 75 && !F.hanaDown) this.hanawaFalls(rt, true);
    } else if (F.step === 3) {
      if (F.kameFall && rt.t > F.kameFall) this.kameFalls(rt);
      if (!F.retreating) {
        const left = aliveN(F.ono) + aliveN(F.oka);
        if ((el > 18 && left <= (F.ono0 || 1) * 0.4) || (F.haruU && !F.haruU.alive && el > 8) || el > 85) this.retreat(rt);
      } else {
        // 退く敵は本人から遠く離れたら去らせる（本物の兵の枠を空ける）
        if ((F.gcT = (F.gcT || 0) - dt) <= 0) {
          F.gcT = 1;
          for (const g of F.foes) for (const u of g.units) if (u.alive && !u.gone && u.pos.z < -190) rt.army.despawn(u);
        }
      }
    }
  },

  onKill(rt, v) {
    const F = rt.flags;
    if (v.team === 1) F.ek++; else F.ak++;
    if (v.name === '岡部則綱' || v.name === '淡輪重政') rt.award((t) => { t.special = { label: `${v.name}を討ち取った`, pts: 18 }; }, `${v.name}を討ち取った`);
  },
  onRout(rt, g) {
    if (g.team === 1 && g.name && !rt.flags.retreating) rt.say('足軽', `${g.name}が崩れた！`, 2.5);
  },

  // bot：近い敵を突き、いなければ段の行き先へ
  botBrain(b, inp, { goTo, patientStrike }) {
    const p = b.player, u = p.u, F = b.flags;
    if (F.holdPlayer || !F.step || F.ending) return;
    const ok = (o) => !o.fleeing && !o.invuln && !o.noTarget && Math.abs(o.pos.y - u.pos.y) < 3;
    const e = b.army.nearestEnemy(u, 9, ok);
    if (e) {
      const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
      if (p.lock && p.lock !== e) inp.e.add('KeyQ');
      p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
      if (d > 2.2) goTo(p, inp, e.pos.x, e.pos.z, 2.2); else inp.k.delete('KeyW');
      patientStrike(p, inp, e, d, true);
      return;
    }
    inp.guardHold = false;
    let t = { x: FORD.x + 2, z: 18 };
    if (F.step === 2 && F.hanaU?.alive) t = F.hanaU.pos;
    else if (F.step === 2) t = { x: 0, z: 0 };
    else if (F.step === 3) t = F.haruU?.alive ? F.haruU.pos : { x: 0, z: -30 };
    goTo(p, inp, t.x, t.z, 2);
  },
};
k12_kashii.sides = { a: { name: '浅野勢', mon: 'tokugawa' }, b: { name: '大野治房勢', mon: 'toyotomi' } };
k12_kashii.force = (rt) => ({ a: Math.round(5000 - (rt.flags.ak || 0) * 20), a0: 5000, b: Math.max(0, Math.round(3000 - (rt.flags.ek || 0) * 25)), b0: 3000 });
k12_kashii.date = () => '慶長二十年（1615）四月二十九日　梅雨のころの曇り';
k12_kashii.canSkip = (rt) => (!rt.flags.step && rt.t > 3 ? '下知まで待つ' : '');
k12_kashii.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
k12_kashii.history = '慶長二十年（1615）四月、大坂城は堀を埋められて再び戦になった（夏の陣）。紀州の浅野長晟はおよそ五千で北上して大坂へ向かい、大野治房の軍およそ三千は堺を焼いたのち、南の樫井で浅野軍を迎え撃とうとした。先陣は岡部則綱の役のはずが、塙団右衛門（直之）は先を越されまいと抜け駆けして樫井へ先に出た。隊の連携は崩れ、浅野の先手の亀田高綱と団右衛門の隊だけが先に組み合う。団右衛門は戦死し（鉄砲に討たれたと伝わる）、淡輪重政らも討たれ、亀田高綱も討死した。遅れて着いた治房の本隊は、浅野長晟の本隊を前に退いた。浅野軍は樫井で道を開き、大坂方は紀州からの援軍を止められなかった。\n兵の数、陣の配置、討たれ方には史料により違いがあり、遊びのために配置を縮めて復元した部分がある。';
k12_kashii.bushou = [{ name: '塙団右衛門', g: /団右衛門/ }, { name: '大野治房', g: /治房/ }];

const st = (n) => (rt) => (rt.flags.step ?? 0) >= n;
STAGES.k12_kashii = [['樫井川の渡しを守る'], ['塙団右衛門を討つ', st(2)], ['大野治房の本隊を退ける', st(3)]];

export { k12_kashii };
export default k12_kashii;
