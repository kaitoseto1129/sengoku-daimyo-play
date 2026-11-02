// ======================================================================
// 徳川編 15　天王寺・岡山の戦い（慶長二十年 1615・五月七日）　徳川編とゲーム全体の最終決戦
// 筋書きの正：docs/chapter3_tokugawa.md の「15. 天王寺・岡山」
// 大坂方の最後の野戦。天王寺口は家康、岡山口は秀忠。豊臣の総出撃に、毛利勝永が本多忠朝の先手を破り、
// 真田信繁が茶臼山から家康の本陣へ三度突き掛かり、馬印が倒れるほど本陣は乱れた。松平忠直の越前勢が横から押し、
// 疲れ果てた真田隊は安居の天神で崩れて信繁は討たれた。勝永は城へ退き、岡山口でも大野治房らが崩れ、
// 大坂城は火に包まれた。翌八日、秀頼と淀殿は自害し、豊臣家は滅んだ。
// 主人公は徳川方。天王寺口の本多忠朝の先手の後ろに付き、崩れた後は大御所の本陣を守る。
// 段：①毛利勝永の先手を食い止める ②本陣へ戻る ③④⑤真田の三度の突撃をしのぐ（二度目で馬印が倒れる）
//     ⑥⑦安居の天神へ真田隊を追う ⑧勝永の退きと岡山口の崩れ ⑨茶臼山から大坂城の炎上を見る
// 勝ち：本陣を守り抜き、真田隊を崩す（全滅で勝ちにしない）。負け：日が傾く（九分）・本人が倒れる。
// 向き：北が -z（大坂城）、東が +x（岡山口）。ゲームの 1 は実の 8m（国土地理院の標高・上町台地）。
//   茶臼山・安居の天神・四天王寺・御勝山は実の場所。家康と秀忠の本陣は遊びのため北へ縮めた。大坂城は遠景（実はもっと北）。
// 重さ：本物の兵は段ごとに出し、同時に百五十ほどまで。大軍は軽い作り（陣立て・addClash・addDistantArmy）。
// ======================================================================
import { useTerrain, BATTLE_ASSETS, assetsForBattle } from './asset_manifest.js';
import { demSample } from './dem.js';
import { nobori, jinmaku, kagaribi, umajirushi, tenshu, ishigaki } from './props.js';
import { flagTexture } from './textures.js';
import { RANKS } from './state.js';
import { STAGES } from './stages.js';
import { sfx } from './audio.js';
import { allyGroup, enemyGroup, nm } from './bhelp.js';
import { distToPolyline } from './world.js';
import { clash } from './b_sekigahara.js';
import { jindateSetup, jindateTick } from './army_jindate.js';
import * as DP from './b_depth.js';
import { depthStart, depthTick, depthBot } from './b_depth.js';
import { timeslipField } from './timeslip_field.js';

BATTLE_ASSETS.k15_tennoji_okayama = Object.freeze([...assetsForBattle('k15_tennoji_okayama'), 'dem_tennoji_okayama']);
let dem = null;
useTerrain('dem_tennoji_okayama', (data) => { dem = data; });

// ---- 場所（ゲームの座標） ----
const START = { x: -46, z: 72 };          // 本多忠朝の先手の後ろ
const FRONT = { x: -46, z: 40 };          // 天王寺口の先手（本多忠朝・小笠原秀政）
const SHITENNO = { x: -46, z: -14 };      // 四天王寺の南（毛利勝永）
const CHAUSU = { x: -106, z: 4 };         // 茶臼山（真田の陣）
const YASUI = { x: -80, z: 18 };          // 安居の天神
const HON = { x: -40, z: 130 };           // 大御所（家康）の本陣
const HONF = { x: -48, z: 112 };          // 本陣の前の持ち場
const OKA = { x: 152, z: -78 };           // 御勝山（岡山口・大野治房）
const OKA_T = { x: 150, z: 46 };          // 将軍（秀忠）の本陣
const CASTLE = { x: 60, z: -272 };        // 大坂城（遠景）
const LIMIT = 540;                        // 日が傾くまで（秒）

const ROADS = [
  [[-38, 230], [-40, HON.z], [-46, 90], [-46, FRONT.z], [-46, 0], [-36, -80], [10, -180], [CASTLE.x, CASTLE.z + 30]],
  [[-46, 30], [-64, 22], [YASUI.x, YASUI.z], [CHAUSU.x, CHAUSU.z]],
  [[OKA_T.x, 160], [OKA_T.x, OKA_T.z], [152, -20], [OKA.x, OKA.z], [100, -180]],
];

const TOYO = { armor: 0x2e2a24, flag: 'toyotomi' };
const SANADA = { armor: 0x8e1f16, lace: 0xb8342a, flag: 'sanada' };
const MORI = { armor: 0x2a1c18, flag: 'mori' };
const TOKU = { armor: 0x24221f, flag: 'tokugawa' };
const HONDA = { armor: 0x1c1a18, flag: 'honda' };
const DATE = { armor: 0x141414, flag: 'date' };
const look = (lk) => (list) => list.map((s) => ({ ...s, o: { ...lk, ...(s.o || {}) } }));
const alive = (g) => g && !g.routed && g.count > 0;
const near = (p, q, r) => Math.hypot(p.x - q.x, p.z - q.z) < r;

// ---- 地形：国土地理院の標高（上町台地の西の崖・茶臼山・東の低い田）を縦に少し強めて写す ----
const XY = 8, VZ = 0.36;
function demAt(x, z) {
  const sx = x * XY, sz = z * XY;
  // 崖が急すぎないよう、まわり四つの点と均す
  return (demSample(dem, sx, sz) * 2 + demSample(dem, sx + 24, sz) + demSample(dem, sx - 24, sz) + demSample(dem, sx, sz + 24) + demSample(dem, sx, sz - 24)) / 6;
}
function height(x, z) {
  let h = 0.25 * Math.sin(x * 0.05 + 0.7) * Math.cos(z * 0.043) + 0.15 * Math.sin(z * 0.09 - x * 0.03);
  if (dem) h += Math.max(0, demAt(x, z) - 3) * VZ;
  // 茶臼山（古墳の丘）：真田の陣の小山
  const dc = Math.hypot(x - CHAUSU.x, z - CHAUSU.z);
  if (dc < 16) { const t = 1 - dc / 16; h += 4.2 * t * t * (3 - 2 * t); }
  return h;
}

// ---- 陣の見た目：家康の本陣（陣幕・金扇の馬印・葵の幟）・秀忠の本陣・茶臼山の六文銭・大坂城 ----
function scenery(rt) {
  const W = rt.world, F = rt.flags;
  rt.scene.add(jinmaku(W, HON.x, HON.z + 6, 16, 12, 6, { mon: 'tokugawa' }));
  F.uma = umajirushi(W, HON.x + 3, HON.z + 2, 0, 'ogi');
  rt.scene.add(F.uma);
  for (const [x, z] of [[HON.x - 9, HON.z - 4], [HON.x + 9, HON.z - 4], [HON.x - 12, HON.z + 8], [HON.x + 12, HON.z + 8]]) rt.scene.add(nobori(W, x, z, 'tokugawa', 6));
  for (const [x, z] of [[HON.x - 5, HON.z - 6], [HON.x + 6, HON.z - 6]]) rt.scene.add(kagaribi(W, x, z));
  rt.scene.add(jinmaku(W, OKA_T.x, OKA_T.z + 8, 14, 10, 5, { mon: 'tokugawa' }));
  for (const [x, z] of [[OKA_T.x - 8, OKA_T.z], [OKA_T.x + 8, OKA_T.z]]) rt.scene.add(nobori(W, x, z, 'tokugawa', 6));
  for (const [x, z] of [[FRONT.x - 8, FRONT.z + 4], [FRONT.x + 8, FRONT.z + 4]]) rt.scene.add(nobori(W, x, z, 'honda', 5));
  // 茶臼山の真田の陣（赤い幟）と、四天王寺の前の毛利の旗、御勝山の大野の旗
  for (const [x, z] of [[CHAUSU.x - 4, CHAUSU.z - 3], [CHAUSU.x + 4, CHAUSU.z - 2], [CHAUSU.x, CHAUSU.z + 5], [CHAUSU.x + 8, CHAUSU.z + 6]]) rt.scene.add(nobori(W, x, z, 'sanada', 6));
  for (const [x, z] of [[SHITENNO.x - 10, SHITENNO.z], [SHITENNO.x + 6, SHITENNO.z - 4], [SHITENNO.x + 16, SHITENNO.z]]) rt.scene.add(nobori(W, x, z, 'mori', 5));
  for (const [x, z] of [[OKA.x - 6, OKA.z], [OKA.x + 6, OKA.z - 3]]) rt.scene.add(nobori(W, x, z, 'toyotomi', 5));
  // 大坂城：五重の天守と本丸の石垣（遠景）
  rt.scene.add(tenshu(W, CASTLE.x, CASTLE.z, { floors: 5, b: 17, base: 9, old: true, stone: 'uchikomi' }));
  rt.scene.add(ishigaki(W, [[CASTLE.x - 50, CASTLE.z + 22], [CASTLE.x + 50, CASTLE.z + 22]], { kind: 'uchikomi', top: 0.1, minH: 5, maxH: 7 }));
}

// ---- 大軍：陣立て（天王寺口の徳川と豊臣の備）・岡山口の押し合い・後ろの大軍 ----
function hosts(rt) {
  const W = rt.world, F = rt.flags;
  try {
    jindateSetup(rt, { A: { flag: 'tokugawa', faction: 'tokugawa', armor: TOKU.armor, form: '魚鱗' }, B: { flag: 'toyotomi', faction: 'toyotomi', armor: TOYO.armor, form: '鶴翼' },
      ahead: 64, lat: 74, men: 0.5 });
  } catch (e) { console.warn('陣立て', e); }
  // 岡山口：秀忠の手（前田・井伊・藤堂）と大野治房の手が、御勝山の南で組み合う
  F.okaClash = clash(rt, { x: 151, z: -20, facing: Math.PI, w: 70, gap0: 0, seed: 1615, noRout: true, noWake: true, host: false,
    A: { flag: 'ii', armor: 0x8e1f16, count: 240, team: 0, faction: 'tokugawa' },
    B: { flag: 'toyotomi', armor: TOYO.armor, count: 220, team: 1, faction: 'toyotomi', bows: true } });
  F.okaClash?.go?.();
  // 天王寺口：持ち場の先（四十五メートルほど）で、本多・小笠原の先手と毛利勝永の先手が先に組み合う（軽い作り。本物の兵の数は変えない）
  //   noWake を外す（noWake の乱戦は近づくまで形を作らず、持ち場から正面が空いて敵が遠く見えていた）。幅も天王寺口の野いっぱいに
  F.tennojiClash = clash(rt, { x: -46, z: 22, facing: Math.PI, w: 64, gap0: 0, seed: 16156, noRout: true, host: false,
    A: { flag: 'honda', armor: HONDA.armor, count: 110, team: 0, faction: 'tokugawa' },
    B: { flag: 'mori', armor: MORI.armor, count: 100, team: 1, faction: 'toyotomi' } });
  F.tennojiClash?.go?.();
  W.addDistantArmy({ x: OKA_T.x + 30, z: OKA_T.z + 30, w: 60, d: 26, count: 260, facing: Math.PI, armor: 0x2a2420, team: 0, flagTex: flagTexture('maeda'), mon: 'maeda', kind: 'mixed', seed: 16151, host: false });
  W.addDistantArmy({ x: OKA_T.x - 36, z: OKA_T.z + 18, w: 40, d: 20, count: 180, facing: Math.PI, armor: 0x24221f, team: 0, flagTex: flagTexture('todo'), mon: 'todo', kind: 'mixed', seed: 16152, host: false });
  // 天王寺口の後ろ：大御所の旗本の大軍（本陣の南）と、西の伊達の手
  W.addDistantArmy({ x: HON.x + 6, z: HON.z + 46, w: 60, d: 24, count: 260, facing: Math.PI, armor: TOKU.armor, team: 0, flagTex: flagTexture('tokugawa'), mon: 'tokugawa', kind: 'mixed', seed: 16153, host: false });
  W.addDistantArmy({ x: -160, z: 120, w: 40, d: 26, count: 200, facing: Math.PI, armor: DATE.armor, team: 0, flagTex: flagTexture('date'), mon: 'date', kind: 'gun', seed: 16154, host: false });
  // 北：大坂城の前に残る豊臣の後詰
  W.addDistantArmy({ x: 0, z: -150, w: 70, d: 24, count: 240, facing: 0, armor: TOYO.armor, team: 1, flagTex: flagTexture('toyotomi'), mon: 'toyotomi', kind: 'mixed', seed: 16155, host: false });
}

const keep = (name, from, list, o = {}) => ({ name, from, width: o.width || 10, list, seek: o.seek || 50, morale: o.morale || 95, flag: o.flag, armor: o.armor, kind: o.kind });

const k15_tennoji_okayama = {
  // 身の回りの合戦の跡（timeslip_field.js）。天王寺・岡山：五月七日（今の六月）の昼。乾いた台地の土埃、最後の野戦の倒れた槍と旗
  timeslip: {
    wet: 0.1, dust: 0.7, trample: 0.45, debris: 1.5, arrows: 1, maxSlope: 0.3,
    grass: 0x80984e, grassTints: [0xffffff, 0xe4e6c0, 0xd0c898], grassH: 1.1, grassLift: 0.2, grassShape: 'blade', tallGrass: 0.8,
    flagColors: [0xe6dfcc, 0x24211e, 0x8e1f16],
  },
  spawn: { x: START.x, z: START.z, heading: Math.PI },
  cutFloor: 0.5,
  // 時間切れはこの戦の「日が傾く」（LIMIT）で決める。共通の八分の打ち切りは使わない（安居の天神で崩した二秒後に打ち切られて負けた）
  pacingWait: (rt) => !!rt.flags.begun,
  meleeGrace: { rate: 1, burst: 1, interval: 3 },   // 刃を受けた後の3秒は次の刃を通さない（bot が続けての太刀で倒れて負けた）
  noWake: true,
  minutes: 7,
  world: {
    seed: 1615507,
    time: 'day',
    groundHalf: 300,
    height,
    paths: ROADS,
    tint(x, z, h, c) {
      for (const r of ROADS) if (distToPolyline(x, z, r) < 2.6) { c.setRGB(c.r * 0.5 + 0.21, c.g * 0.5 + 0.18, c.b * 0.5 + 0.12); return; }
      // 台地の上は麦の刈り跡と草地、西と東の低い所は田植えの前後の水田（初夏）
      if (h < 1.4) { c.setRGB(c.r * 0.55 + 0.08, c.g * 0.62 + 0.12, c.b * 0.6 + 0.08); return; }
      const p = 0.5 + 0.5 * Math.sin(x * 0.07 + 1.3) * Math.cos(z * 0.06);
      c.setRGB(c.r * (0.8 + p * 0.2) + 0.05 * p, c.g * (0.84 + p * 0.16), c.b * 0.8);
    },
    clear: (x, z) => ROADS.some((r) => distToPolyline(x, z, r) < 6) || near({ x, z }, HON, 20) || near({ x, z }, HONF, 24) || near({ x, z }, YASUI, 14) || near({ x, z }, CHAUSU, 18) || near({ x, z }, FRONT, 26),
    trees: 320,
    tufts: 2600,
    treeDensity: (x, z) => {
      if (near({ x, z }, SHITENNO, 26)) return 1.2;     // 四天王寺の森（冬の陣で焼けた寺の跡）
      if (near({ x, z }, YASUI, 22)) return 1;           // 安居の天神の杜
      if (x < -70 && z > -60 && z < 160) return 0.05;   // 真田の寄せ道
      return x > -130 && x < 190 && z > -120 && z < 200 ? 0.08 : 0.5;
    },
    groves: [{ x: SHITENNO.x, z: SHITENNO.z - 16, r: 16, n: 22, kind: 'sugi' }, { x: YASUI.x - 10, z: YASUI.z - 8, r: 8, n: 12, kind: 'sugi' }],
    fleeOut: (x, z, team) => (team === 1 ? z < -200 : z > 240),
  },

  setup(rt) {
    timeslipField(rt);   // 身の回りの踏み荒らした地面・倒れた槍と旗・季節の草（def.timeslip）
    { const P = rt.player, td = P.takeDamage, k = rt.def.cutFloor; P.takeDamage = function (a, s) { const m = this.u.hitKind === 'gun' || this.u.hitKind === 'arrow'; const d = td.call(this, a, s); return s && !s.isStruct && !m && d > 0 ? d * k : d; }; }   // 刃の一太刀を def.cutFloor 倍に（共通の一太刀五割・六割は変えず、この戦だけ）
    const F = rt.flags;
    F.ek = 0; F.ak = 0; F.ending = false; F.begun = false;
    scenery(rt);
    hosts(rt);
    // ---- 徳川方：大御所の本陣・本多忠朝の先手・自分の手勢・伊達・岡山口の秀忠 ----
    F.hon = allyGroup(rt, { faction: 'tokugawa', name: '大御所の本陣', anchor: { x: HON.x, z: HON.z }, facing: Math.PI, width: 8, aggro: 6, seekRange: 12, order: 'hold', fixed: true, noRout: true, fullStrength: true },
      look(TOKU)([{ type: 'busho', n: 1, o: { name: '徳川家康', invuln: true, horse: false } }, { type: 'busho', n: 1, o: { name: '本多正純', invuln: true, horse: false, hat: 'kabuto_m', flag: 'honda' } },
        { type: 'samurai', n: 5 }, { type: 'ashigaru', n: 8 }, { type: 'gun', n: 3 }]));
    F.honda = allyGroup(rt, { faction: 'tokugawa', name: '本多忠朝の先手', anchor: { x: FRONT.x, z: FRONT.z + 4 }, facing: Math.PI, width: 12, aggro: 14, seekRange: 40, morale: 95, noRout: true, fixed: true, formation: 'yari' },
      look(HONDA)([{ type: 'busho', n: 1, o: { name: '本多忠朝', hat: 'kabuto_shika', horse: true } }, { type: 'busho', n: 1, o: { name: '小笠原秀政', invuln: true, hat: 'kabuto_m', horse: false, flag: 'tokugawa' } },
        { type: 'samurai', n: 3 }, { type: 'ashigaru', n: 14 }, { type: 'gun', n: 4 }]));
    F.mine = allyGroup(rt, { faction: 'tokugawa', name: '手勢', anchor: { x: START.x + 6, z: START.z + 2 }, facing: Math.PI, width: 10, aggro: 12, noRout: true, fixed: true, formation: 'yari' },
      look(TOKU)([{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 14 }, { type: 'gun', n: 4 }]));
    F.date = allyGroup(rt, { faction: 'tokugawa', name: '伊達政宗の手', anchor: { x: -132, z: 104 }, facing: Math.PI, width: 8, aggro: 8, seekRange: 16, order: 'hold', fixed: true, noRout: true },
      look(DATE)([{ type: 'busho', n: 1, o: { name: '伊達政宗', invuln: true, hat: 'kabuto_f', horse: true } }, { type: 'gun', n: 6 }, { type: 'samurai', n: 2 }]));
    F.shogun = allyGroup(rt, { faction: 'tokugawa', name: '将軍の本陣', anchor: { x: OKA_T.x, z: OKA_T.z }, facing: Math.PI, width: 10, aggro: 4, seekRange: 8, order: 'hold', fixed: true, noRout: true },
      [{ type: 'busho', n: 1, o: { ...TOKU, name: '徳川秀忠', invuln: true, hat: 'kabuto_s', horse: true } },
        { type: 'busho', n: 1, o: { armor: 0x8e1f16, lace: 0xb8342a, flag: 'ii', name: '井伊直孝', invuln: true, hat: 'kabuto_tentsuki', horse: true } },
        { type: 'busho', n: 1, o: { armor: 0x24221f, flag: 'todo', name: '藤堂高虎', invuln: true, hat: 'kabuto_w', horse: false } },
        { type: 'busho', n: 1, o: { armor: 0x2a2420, flag: 'maeda', name: '前田利常', invuln: true, hat: 'kabuto_g', horse: true } },
        { type: 'samurai', n: 3, o: TOKU }]);
    // 岡山口の豊臣：御勝山の大野治房
    F.harufusa = enemyGroup(rt, { faction: 'toyotomi', name: '大野治房の手', anchor: { x: OKA.x, z: OKA.z }, facing: 0, width: 10, aggro: 4, seekRange: 8, order: 'hold', fixed: true, noRout: true },
      look(TOYO)([{ type: 'busho', n: 1, o: { name: '大野治房', invuln: true, hat: 'kabuto_m', horse: true } }, { type: 'samurai', n: 3 }, { type: 'ashigaru', n: 4 }]));
    for (const g of [F.mine, F.honda]) { g.defMult = 1.2; g.dmgMult = 0.8; }
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: START.x - 4, z: START.z + 6 }, Math.PI, [{ kind: 'spear', n: Math.min(n, 14) }]);
    rt.world.setTime('day');
    rt.setPhase('brief');
    rt.obj('main', '大御所の本陣を守り抜き、真田隊を崩せ', 'main');
    // 戦の前
    rt.say('徳川家康', '秀頼が城を出ぬなら、今日で終いじゃ。天王寺口はわしが受け持つ', 4.5);
    rt.after(4.8, () => rt.say('本多正純', '岡山口は将軍様。井伊・藤堂・前田が付いておりまする', 3.4));
    rt.after(8.4, () => rt.say(nm(rt), '茶臼山に赤い旗。六文銭、真田にございます', 3));
    rt.after(11.6, () => rt.say('大野治長', '秀頼公のご出馬を……城へ戻って、今一度願い申す！', 3.2));
    rt.after(15, () => rt.say('本多忠朝', '先手はこの忠朝が承る。父の名に恥じぬ槍を見せようぞ', 3.2));
    rt.after(18.4, () => this.begin(rt));
  },

  begin(rt) {
    const F = rt.flags;
    if (F.begun) return;
    F.begun = true; F.t0 = rt.t;
    rt.setPhase('battle');
    sfx('horagai', 0.8);
    rt.after(1.2, () => sfx('taiko', 0.8));
    rt.banner('豊臣方の総出撃', '慶長二十年五月七日　天王寺口');
    depthStart(rt, { faction: 'toyotomi', flag: 'toyotomi', armor: TOYO.armor, friends: () => [F.mine], look: (l) => l, scale: 1.3, fixedSpawn: true, dmg: 0.32, botSeek: 40 }, [
      // ① 毛利勝永が本多忠朝の先手へ
      DP.fight({ at: FRONT, title: '天王寺口', sub: '毛利勝永の隊が先手へ突き掛かる', obj: '毛利勝永の先手を食い止めよ', max: 75,
        say: [['毛利勝永', '狙うは本多の先手じゃ。一息に突き崩せ！']],
        foes: () => [keep('毛利勝永の先手', { x: SHITENNO.x + 4, z: SHITENNO.z + 6 }, look(MORI)([{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 10 }, { type: 'gun', n: 4 }]), { flag: 'mori', armor: MORI.armor })],
        later: [
          { t: 14, say: ['毛利の侍', '殿（勝永）が自ら出られたぞ！'], foes: () => [keep('毛利勝永の本隊', { x: SHITENNO.x - 12, z: SHITENNO.z + 4 }, look(MORI)([{ type: 'busho', n: 1, o: { name: '毛利勝永', invuln: true, hat: 'kabuto_g', horse: true } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 8 }]), { flag: 'mori', armor: MORI.armor })] },
          { t: 26, if: (r) => { this.tadatomo(r); return false; }, foes: () => [] },
        ],
        reward: '毛利勢の先手を食い止めた' }),
      // ② 先手が崩れ、本陣へ戻る
      DP.move({ to: HONF, obj: '大御所の本陣へ戻れ。真田が来る', label: '大御所の本陣', r: 12, max: 55,
        say: [['使番', '茶臼山の真田が動いた！　狙いは大御所の本陣ぞ']],
        ambush: { d: 30, say: ['手勢の侍', '横から赤い騎馬！　真田の物見じゃ'], foes: () => [keep('真田の物見', { x: -96, z: 94 }, look(SANADA)([{ type: 'cavalry', n: 3 }, { type: 'ashigaru', n: 4 }]), { flag: 'sanada', armor: SANADA.armor })] } }),
      // ③ 一の突撃
      DP.hold({ at: HONF, r: 16, dur: 50, title: '真田の一の突撃', sub: '赤備えが本陣へ', obj: '本陣の前で真田の突撃を止めよ', label: '本陣の前',
        say: [['真田信繁', '狙うは家康の首、ただ一つ！']],
        waves: [
          { t: 0, if: (r) => { this.charge(r, 1); return false; }, foes: () => [] },
          { t: 2, foes: () => [keep('真田の赤備え', { x: -112, z: 82 }, look(SANADA)([{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 10 }, { type: 'gun', n: 3 }]), { flag: 'sanada', armor: SANADA.armor })] },
          { t: 22, say: ['手勢の侍', '後ろからまだ来る！'], foes: () => [keep('真田の二番手', { x: -118, z: 100 }, look(SANADA)([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 8 }]), { flag: 'sanada', armor: SANADA.armor })] },
        ],
        onEnd: (r) => this.pullBack(r),
        reward: '真田の一の突撃を止めた' }),
      DP.rest({ dur: 6, heal: 0.8, say: [['手勢の侍', '一息つけ。まだ来るぞ']] }),
      // ④ 二の突撃：馬印が倒れる
      DP.hold({ at: HONF, r: 16, dur: 45, title: '真田の二の突撃', sub: '大御所の馬印が倒れた', obj: '崩れた本陣を支えよ', label: '本陣の前',
        waves: [
          { t: 0, if: (r) => { this.charge(r, 2); this.umaFall(r); return false; }, foes: () => [] },
          { t: 2, foes: () => [keep('真田の赤備え', { x: -124, z: 118 }, look(SANADA)([{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 11 }, { type: 'gun', n: 2 }]), { flag: 'sanada', armor: SANADA.armor })] },
          { t: 16, say: ['明石全登', '大御所の横を突け！　明石の手、続け！'], foes: () => [keep('明石全登の手', { x: -132, z: 70 }, look(TOYO)([{ type: 'busho', n: 1, o: { name: '明石全登', invuln: true, hat: 'kabuto_nanban', horse: false } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 8 }]))] },
        ],
        onEnd: (r) => this.pullBack(r),
        reward: '馬印が倒れても本陣を支えた' }),
      DP.rest({ dur: 6, heal: 0.8 }),
      // ⑤ 三の突撃：越前勢が横から
      DP.fight({ at: HONF, title: '真田の三の突撃', sub: '最後の力で本陣へ', obj: '越前勢と共に真田隊を押し返せ', max: 80,
        say: [['真田信繁', 'あと一息じゃ！　家康は目の前ぞ！']],
        foes: () => [keep('真田の最後の寄せ', { x: -112, z: 92 }, look(SANADA)([{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 10 }]), { flag: 'sanada', armor: SANADA.armor, morale: 100 })],
        later: [
          { t: 0, if: (r) => { this.charge(r, 3); return false; }, foes: () => [] },
          { t: 10, if: (r) => { this.echizen(r); return false; }, foes: () => [] },
        ],
        reward: '真田の三の突撃を押し返した' }),
      // ⑥⑦ 安居の天神へ追う：真田隊の消耗と信繁の最期
      DP.move({ to: { x: YASUI.x + 6, z: YASUI.z + 16 }, obj: '退く真田隊を追え。安居の天神へ', label: '安居の天神', r: 12, max: 60,
        say: [['松平忠直', '真田は疲れ果てておる。天神の杜へ追え！']] }),
      DP.fight({ at: YASUI, title: '安居の天神', sub: '真田隊、力尽きる', obj: '疲れ果てた真田隊の残りを崩せ', max: 70,
        foes: () => [keep('真田隊の残り', { x: YASUI.x - 6, z: YASUI.z - 6 }, look(SANADA)([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 6 }]), { flag: 'sanada', armor: SANADA.armor, morale: 80 })],
        later: [{ t: 0, if: (r) => { this.yasui(r); return false; }, foes: () => [] }],
        onEnd: (r) => this.nobushige(r),
        reward: '安居の天神で真田隊を崩した' }),
      // ⑧ 勝永退く・岡山口でも崩れる
      DP.rest({ dur: 13, heal: 0.3,
        say: [['使番', '毛利勝永、城へ退く！　天王寺口の豊臣方、総崩れ！', 4], ['使番', '岡山口も勝ち戦！　大野治房の手が崩れ、井伊・藤堂・前田が城へ迫る', 4.4], ['松平忠直', '越前勢は城へ一番乗りじゃ！', 3.2]],
        fn: (r) => this.okayama(r) }),
      // ⑨ 茶臼山から大坂城を見る
      DP.move({ to: { x: CHAUSU.x + 4, z: CHAUSU.z + 4 }, obj: '茶臼山に登り、大坂城を見よ', label: '茶臼山', r: 10, max: 60 }),
    ], (rt2) => this.win(rt2));
  },

  // 本多忠朝の討死（毛利勝永の突き崩し）
  tadatomo(rt) {
    const F = rt.flags;
    if (F.tadaDone) return;
    F.tadaDone = true;
    const u = F.honda?.units.find((q) => q.name === '本多忠朝' && q.alive);
    if (u) { u.invuln = false; rt.army.kill(u, null); }
    rt.banner('本多忠朝、討死', '小笠原秀政も深手。先手が崩れる');
    rt.say('本多の侍', '殿が……忠朝様が討たれた！', 3.2);
    if (alive(F.honda)) { F.honda.noRout = false; F.honda.morale = Math.min(F.honda.morale, 25); }
    F.mine.morale = Math.max(F.mine.morale || 0, 85);
  },

  // 真田信繁と赤備えの騎馬（三度の突撃で同じ隊が出入りする）
  charge(rt, k) {
    const F = rt.flags;
    if (!F.sanada || !F.sanada.count) {
      F.sanada = enemyGroup(rt, { faction: 'toyotomi', name: '真田信繁の隊', anchor: { x: -116, z: 88 }, facing: Math.PI * 0.5, width: 8, aggro: 30, seekRange: 50, morale: 100, noRout: true, fixed: true, order: 'attack' },
        look(SANADA)([{ type: 'busho', n: 1, o: { name: '真田信繁', invuln: true, horse: true } }, { type: 'cavalry', n: 4 }, { type: 'samurai', n: 2 }]));
      F.sanada.dmgMult = 0.6;
      rt.marker('sanada', () => F.sanadaU?.alive ? F.sanadaU.pos : F.sanada.center(), '真田信繁', { red: true, group: F.sanada });
    }
    F.sanadaU = F.sanada.units.find((u) => u.name === '真田信繁');
    F.sanada.routed = false; F.sanada.order = 'attack'; F.sanada.morale = 100; F.sanada.aggro = 30; F.sanada.seekRange = 50;
    F.sanada.anchor = { x: HONF.x - 4, z: HONF.z - 2 };
    F.sanadaK = k;
    rt.army.play('toki', { x: -110, z: 90 }, 1.5);
    if (k === 2) rt.after(2.5, () => rt.say('真田信繁', '馬印を倒せ！　大御所の旗本を蹴散らせ！', 3.2));
  },

  // 突撃の合間：真田の隊は西へ引いて息を整え、また突き掛かる
  pullBack(rt) {
    const F = rt.flags;
    if (!F.sanada || !F.sanada.count) return;
    F.sanada.order = 'move'; F.sanada.dest = { x: -112, z: 86 };
    F.sanada.onArrive = (g) => { g.order = 'hold'; g.anchor = { x: -112, z: 86 }; };
    rt.say('真田信繁', '退け、退け！　息を入れて、もう一度じゃ', 3);
  },

  // 二の突撃：金扇の馬印が倒れ、家康は南へ退く
  umaFall(rt) {
    const F = rt.flags;
    if (F.umaDown) return;
    F.umaDown = true; F.umaT = 0;
    rt.banner('大御所の馬印が倒れた', '本陣が乱れる');
    rt.say('本多正純', '大御所様、お退きくだされ！', 3);
    rt.after(3.4, () => rt.say('徳川家康', '退かぬ……いや、ここは退く。旗本、支えよ！', 3.4));
    rt.after(7.2, () => rt.say(nm(rt), '本陣を空けるな！　馬印を起こせ！', 3));
    if (F.hon) { F.hon.order = 'move'; F.hon.dest = { x: HON.x + 8, z: HON.z + 46 }; F.hon.onArrive = (g) => { g.order = 'hold'; g.anchor = { ...g.dest }; }; }
  },

  // 三の突撃の最中：松平忠直の越前勢が真田の横を突く
  echizen(rt) {
    const F = rt.flags;
    if (F.echizen) return;
    F.echizen = allyGroup(rt, { faction: 'tokugawa', name: '松平忠直の越前勢', anchor: { x: -96, z: 54 }, facing: 0, width: 12, aggro: 30, seekRange: 60, noRout: true, fixed: true, order: 'attack' },
      look(TOKU)([{ type: 'busho', n: 1, o: { name: '松平忠直', invuln: true, hat: 'kabuto_w', horse: true } }, { type: 'busho', n: 1, o: { name: '西尾宗次', invuln: true, hat: 'kabuto_m', horse: false } },
        { type: 'samurai', n: 3 }, { type: 'ashigaru', n: 12 }, { type: 'gun', n: 3 }]));
    F.echizen.anchor = { x: HONF.x - 18, z: HONF.z - 10 };
    F.echizen.dmgMult = 0.75;
    rt.banner('越前勢、横槍', '松平忠直が真田の横を突く');
    rt.say('松平忠直', '越前勢、真田の横へかかれ！　遅れを取り返せ！', 3.4);
    rt.after(4, () => rt.say('真田信繁', '……ここまでか。者ども、天神の杜まで退け', 3.4));
    // 真田の隊は息が切れ、安居の天神へ退く
    rt.after(26, () => { if (F.sanada) { F.sanada.order = 'move'; F.sanada.dest = { x: YASUI.x, z: YASUI.z }; F.sanada.onArrive = (g) => { g.order = 'hold'; g.anchor = { x: YASUI.x, z: YASUI.z }; }; } });
  },

  // 安居の天神：信繁は疲れて腰を下ろす。討てる身になる
  yasui(rt) {
    const F = rt.flags;
    if (F.sanada) {
      F.sanada.order = 'hold'; F.sanada.anchor = { x: YASUI.x, z: YASUI.z }; F.sanada.noRout = true;
      for (const u of F.sanada.units) if (u.alive) { u.pos.x = YASUI.x + (Math.random() - 0.5) * 4; u.pos.z = YASUI.z + (Math.random() - 0.5) * 4; }
    }
    if (F.sanadaU) { F.sanadaU.invuln = false; F.sanadaU.hp = Math.min(F.sanadaU.hp, F.sanadaU.maxHp * 0.4); }
    if (F.echizen) { F.echizen.anchor = { x: YASUI.x + 6, z: YASUI.z + 8 }; F.echizen.order = 'attack'; }
    rt.say('真田信繁', '……もはや槍を握る力も無い', 3.2);
  },

  // 信繁の最期（西尾宗次が討つ。自分が討ってもよい）
  nobushige(rt) {
    const F = rt.flags;
    if (F.nobuDead) return;
    F.nobuDead = true;
    rt.unmark('sanada');
    const u = F.sanadaU;
    if (u && u.alive) {
      rt.say('真田信繁', 'わしの首を手柄にされよ', 3);
      rt.after(3.2, () => { if (u.alive) { u.invuln = false; rt.army.kill(u, null); } rt.say('西尾宗次', '真田左衛門佐、越前の西尾宗次が討ち取った！', 3.6); });
    }
    rt.after(3.4, () => rt.banner('真田信繁、討死', '安居の天神にて　日本一の兵'));
    if (F.sanada) { F.sanada.noRout = false; F.sanada.morale = 0; }
  },

  // 岡山口の崩れ：治房の手が退き、軽い大軍も押し切る
  okayama(rt) {
    const F = rt.flags;
    F.okaDone = true;
    F.okaClash?.push?.('A', 1); F.okaClash?.rout?.('B', { from: 0, minFight: 4 });
    // 天王寺口・岡山口の豊臣方は総崩れ：残る隊は城へ逃げる
    for (const g of rt.army.groups) if (g.team === 1 && alive(g)) { g.noRout = false; g.routed = true; g.order = 'flee'; }
    const J = F.jindate;
    for (const k of J?.clashes || []) { k.C.push?.('A', 1); k.C.rout?.('B', { from: 0, minFight: 4 }); }
  },

  // 大坂城の炎上
  burn(rt) {
    const F = rt.flags;
    if (F.burned) return;
    F.burned = true;
    rt.world.setTime('dusk');
    for (const [dx, dz, s, h] of [[0, 0, 4.5, 14], [-14, 10, 3, 4], [16, 8, 3.2, 4], [-30, 24, 2.4, 1], [28, 24, 2.4, 1], [0, 30, 2.8, 1]]) {
      if (rt.world.addFire) rt.world.addFire(CASTLE.x + dx, CASTLE.z + dz, { size: s, h, blackSmoke: true });
    }
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    this.burn(rt);
    rt.setPhase('end');
    rt.objDone('main');
    rt.award((t) => { t.main = true; t.special = { label: '大御所の本陣を守り抜き、真田隊を崩した', pts: 50 }; }, '天王寺・岡山の戦いに勝った');
    sfx('horagai', 0.9);
    rt.banner('大坂城、炎上', '慶長二十年五月七日　豊臣方、総崩れ');
    rt.player.u.invuln = true;
    rt.after(2.5, () => rt.say(nm(rt), '天守が……燃えておりまする', 3));
    rt.after(6, () => rt.say('徳川家康', '真田は日本一の兵であった。……あれほどの者が、豊臣に付いておったか', 4.4));
    rt.after(11, () => rt.say('淀殿', '城が燃える……。秀頼、もはやこれまでじゃ', 3.6));
    rt.after(15, () => rt.say('豊臣秀頼', '母上、共に参りましょう。太閤の子として', 3.6));
    rt.after(19, () => rt.say('使番', '翌八日、秀頼公と淀殿、山里曲輪にて御自害。大野治長殿らも共に', 4.4));
    rt.after(24, () => rt.banner('豊臣家、滅ぶ', '元和偃武　戦の世が終わる'));
    rt.after(26, () => rt.say('徳川家康', 'これで、戦の世は終わりじゃ', 3.6));
    rt.finish({}, 32);
  },

  lose(rt) {
    const F = rt.flags;
    if (F.ending || !rt.canFailMission()) return;
    F.ending = true;
    rt.setPhase('end');
    rt.objFail('main');
    rt.tracker.main = false;
    rt.banner('日が傾いた', '真田隊を崩しきれぬ');
    rt.say('本多正純', '日が傾いた……。今日のうちに決着が付かなんだ', 4);
    rt.finish({ failureReason: '日が傾くまでに真田隊を崩せなかった' }, 6);
  },

  update(rt, dt) {
    const F = rt.flags;
    try { jindateTick(rt, dt); } catch (e) { if (!F.jindateErr) { F.jindateErr = 1; console.warn('陣立て', e); } }
    // 倒れる馬印（一秒ほどで横へ）
    if (F.umaDown && F.uma && F.umaT < 1) { F.umaT = Math.min(1, F.umaT + dt * 1.2); F.uma.rotation.z = 1.45 * F.umaT * F.umaT; }
    if (F.ending) return;
    depthTick(rt, dt);
    if (F.begun && rt.t - F.t0 > LIMIT) this.lose(rt);
    else if (F.begun && !F.warned && rt.t - F.t0 > LIMIT - 60) { F.warned = true; rt.say('本多正純', '日が傾く！　急げ', 3); }
  },

  onKill(rt, v) {
    const F = rt.flags;
    if (v.team === 1) F.ek++; else F.ak++;
    if (v.name === '真田信繁' && !F.nobuAward) {
      F.nobuAward = true;
      rt.award((t) => { t.special = { label: '真田信繁の最期に立ち会った', pts: 40 }; }, '真田信繁の最期に立ち会った');
    }
  },
  onRout(rt, g) {
    if (g.team === 1 && g.name && g.name !== '真田信繁の隊') rt.say('足軽', `${g.name}が崩れた！`, 2.5);
  },
};

k15_tennoji_okayama.force = (rt) => ({ a: Math.round(150000 - (rt.flags.ak || 0) * 40), a0: 150000, b: Math.max(0, 55000 - (rt.flags.ek || 0) * 60 - (rt.flags.okaDone ? 20000 : 0)), b0: 55000 });
k15_tennoji_okayama.sides = { a: { name: '徳川方', mon: 'tokugawa', faction: 'tokugawa' }, b: { name: '豊臣方', mon: 'toyotomi', faction: 'toyotomi' } };
k15_tennoji_okayama.date = (rt) => (rt.flags.burned ? '慶長二十年（1615）五月七日　初夏・夕　摂津国 天王寺・岡山' : '慶長二十年（1615）五月七日　初夏・昼　摂津国 天王寺・岡山');
k15_tennoji_okayama.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '下知まで待つ' : '');
k15_tennoji_okayama.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
k15_tennoji_okayama.history = '慶長二十年（1615）五月七日、大坂夏の陣の最後の野戦。徳川方はおよそ十五万で、天王寺口を家康、岡山口を秀忠が受け持った。豊臣方はおよそ五万五千が城の南に打って出た。天王寺口では毛利勝永が本多忠朝・小笠原秀政の先手を破り、忠朝は討死した。茶臼山に陣した真田信繁は家康の本陣へ三度突き掛かり、本陣は崩れて馬印が倒れ、家康も一時退いたと伝わる。やがて松平忠直の越前勢らに押され、疲れ果てた真田隊は崩れ、信繁は安居の天神の近くで越前の西尾宗次に討たれた。勝永は城へ退き、岡山口でも大野治房らが前田・井伊・藤堂の手に崩された。大坂城は火に包まれ、翌八日、秀頼と淀殿は山里曲輪で自害し、豊臣家は滅んだ。\n家康が自害を覚悟した・家康が討たれたなどの話は後の伝えで、史実とは分けて扱う。本陣と秀忠の陣の場所、真田の突撃の道筋は遊びのために縮めて復元したもの。地形は国土地理院の標高（上町台地）による。';
k15_tennoji_okayama.bushou = [{ name: '真田信繁', g: /信繁/ }, { name: '毛利勝永', g: /勝永/ }, { name: '徳川家康', g: /家康/ }];

k15_tennoji_okayama.botBrain = (b, inp, { goTo }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  if (!u.alive || F.ending) return;
  if (F.dp && F.dp.on) { depthBot(b, inp, goTo); return; }
  inp.k.delete('KeyW');
  goTo(p, inp, START.x, START.z - 4, 3);
};

const dpAt = (k) => (rt) => (rt.flags.dp?.i ?? -1) >= k || (rt.flags.dp && !rt.flags.dp.on && rt.flags.begun);
STAGES.k15_tennoji_okayama = [['毛利勝永の先手を食い止める'], ['真田の突撃から本陣を守る', dpAt(2)], ['安居の天神へ真田隊を追う', dpAt(5)], ['大坂城の最期を見届ける', dpAt(7)]];

export { k15_tennoji_okayama };
export default k15_tennoji_okayama;
