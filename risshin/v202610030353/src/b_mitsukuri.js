// ======================================================================
// 織田家編　箕作城の戦い（永禄十一年九月十二日・昼から夜の強襲・縄張り版。docs/first6-1560-1569-spec.md 34〜41）
// 足利義昭を奉じて京へ上る信長の道を、南近江の六角義賢・義治がふさいだ。
// 信長は観音寺城の支えの箕作城を攻めさせ、昼過ぎから攻めかかって、夜のうちに落とした。
// 八段の流れ：1 山麓へ寄る → 2 外側の柵（三の郭）→ 3 三の郭を取る → 4 日が傾き松明を灯す → 5 二の丸の木戸
//   → 6 夜戦 → 7 本丸が落ちる（城将は本丸の館の中）→ 8 六角勢が退く（観音寺の篝火が消えていく）
// 攻め手は佐久間・丹羽・木下・浅井新八の四手が同時に寄せる。自分は木下藤吉郎の手（南の大手の一方向）。ほかの方向は遠景と AI
// （castles/mitsukuri.js の縄張り・castle_plan.js・siege_zones.js・siege_ai.js・butai.js を使う。
//  三の郭〔坂の上〕→二の丸〔木戸構え〕→本丸、の区域の取り合い＋城の頭）
// 本丸が落ちた後の段（b_depth.js）：観音寺からの後詰（坂で迎え撃つか、城に火をかけて怯ませるか）
// 坂（三の郭）が落ちた後の段：左右の尾根の伏兵（忍ぶか、松明の道で挟まれるか）
// 向き：北（-z）が箕作山の城。北東の奥（+x, -z）に観音寺城のある繖山。南（+z）に織田の陣
// ======================================================================
import { nobori, hut, yagura, tawara, campfire, ishigaki, kabukimon } from './props.js';
import { flagTexture } from './textures.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { moraleWord } from './hud.js';
import { gauss, nm, centerOf, allyGroup, enemyGroup } from './bhelp.js';
import { applyLook, NIGHT, customFlag, dress, gone } from './b_inabayama.js';
import { KIT } from './b_nagashinojo.js';
import { depthStart, depthTick, rest, pick, fight, hold, depthBot } from './b_depth.js';
import { uS, uA, uB, uBu, round, gunLine, lines, camp } from './b_mid.js';
import { heightOf, buildCastlePlan, makeLordKeep } from './castle_plan.js';
import { sakamogiRow, goten } from './castle_parts.js';
import { makeSiegeZones, zoneWord, makeFirstIn } from './siege_zones.js';
import { makeTabaAdvance, tickTabas, tabaInteractTick, patchGunCover } from './taketaba.js';
import { makeGate, updateGates, resetGates } from './siege_gate.js';
import { makeDefenseAI, chooseRoute } from './siege_ai.js';
import { makeButai, butaiTick, lightClash } from './butai.js';
import { nightAccuracyMult } from './siege_vis.js';
import { demDetail } from './dem.js';
import {
  MITSUKURI_PLAN, SAN_C, NI_C, HON_C, KIDO, NISHI_TANI_X, ROAD_OTE, ROAD_TANI,
} from './castles/mitsukuri.js';

// 束0 の asset_dem_mitsukuri.js がまだ無い時も止まらないように（無ければ base のまま）
let dem = null;
import('./asset_dem_mitsukuri.js').then((m) => { dem = m.default; }).catch(() => {});

const KAN = { x: 130, z: -196 };           // 観音寺城のある繖山
const CAMP = { x: 4, z: 56 };              // 織田の陣
const ROAD = [[0, 150], [CAMP.x, CAMP.z], [2, 10], [0, -40], ...ROAD_OTE.slice(2)];
// 松明の束：日が傾いた時、三の郭の柵の口の外（坂の上）で火を移す
const TORCH = [{ x: -10, z: -36 }, { x: 4, z: -32 }, { x: 16, z: -37 }];
const ODA = { flag: 'oda' };
const RK = { flag: 'rokkaku' };
// 夕暮れから夜へ移る途中の色（松明を灯す間に少しずつ暗くする）
const MID = { sky: 0x4c4a5c, fog: 0x403e50, sun: 0xd08a64, sunI: 0.85, hs: 0x8c88a4, hg: 0x2a2624, hI: 1.15, top: 0x283048, glow: 0.14, dir: [-0.9, 0.1, 0.3], mount: 0x1c1e26 };
const hi = (rt) => !rt.G.lord && (rt.G.rank || 0) >= 3;
const nextObj = (rt, text) => { rt.objDone('main'); rt.after(2, () => { if (!rt.flags.ending) rt.obj('main', text, 'main'); }); };

// 六角の紋：隅立て四つ目結（四つの目結を菱に並べる）
function rokkakuTex() {
  return customFlag('rokkaku', (g) => {
    g.translate(64, 82); g.scale(43, 43);
    const P = new Path2D();
    const sq = (cx, cy, s) => { P.moveTo(cx, cy - s); P.lineTo(cx + s, cy); P.lineTo(cx, cy + s); P.lineTo(cx - s, cy); P.closePath(); };
    for (const [cx, cy] of [[0, -0.48], [0.48, 0], [0, 0.48], [-0.48, 0]]) { sq(cx, cy, 0.44); sq(cx, cy, 0.19); }
    g.fill(P, 'evenodd');
  });
}

// 手書きの地形（箕作山・繖山・和田山）。曲輪・道・切岸は heightOf（castle_plan.js）が上書きする
function baseRaw(x, z) {
  let h = 0.5 * Math.sin(x * 0.034 + 0.2) * Math.cos(z * 0.029) + 0.3 * Math.sin(z * 0.06 + x * 0.03);
  h += 34 * gauss(x, z, HON_C.x, HON_C.z + 6, 2400) + 16 * gauss(x, z, -44, -124, 2000) + 12 * gauss(x, z, 40, -130, 1800);
  h += 70 * gauss(x, z, KAN.x, KAN.z, 6000) + 18 * gauss(x, z, -130, -60, 1800);
  return h;
}
// 繖山の山腹の六角の本陣（平らに削った段。castle_plan の縄張りの外なので、ここは手で均す）
const KC = { x: 96, z: -140 };
const KTOP = baseRaw(KC.x, KC.z);
function baseWithKan(x, z) {
  const h = baseRaw(x, z);
  const dk = Math.hypot(x - KC.x, z - KC.z);
  const q = Math.max(0, Math.min(1, (20 - dk) / 8));
  return h * (1 - q) + KTOP * q;
}
// 国土地理院の標高（箕作山。asset_dem_mitsukuri.js は本丸が格子の原点）の尾根と谷の凹凸を、手書きの山に足す。
// 山の高さの形は手書きのまま。実測の 3m をゲームの 1 座標に縮め、本丸（HON_C）を原点に合わせる。
function baseWithDem(x, z) {
  const b = baseWithKan(x, z);
  return dem ? b + demDetail(dem, x, z, { xy: 3, ox: HON_C.x, oz: HON_C.z, win: 60, scale: 0.35 }) : b;
}
let HEIGHT_FN = null;
function height(x, z) {
  if (!HEIGHT_FN) HEIGHT_FN = heightOf(MITSUKURI_PLAN, baseWithDem, 2.6);
  return HEIGHT_FN(x, z);
}

// 攻め手（古い allyGroup）を、多点の道に沿って進め、最後は attack に入る
function routeOld(g, pts, speed = 2.3) {
  if (!g) return;
  let i = 0;
  const step = () => {
    if (!g.count) return;
    if (i >= pts.length) { g.order = 'attack'; g.seekRange = 50; return; }
    const [x, z] = pts[i++];
    g.order = 'move'; g.dest = { x, z }; g.speed = speed; g.onArrive = step;
  };
  step();
}

const mitsukuri = {
  spawn: { x: CAMP.x + 6, z: CAMP.z - 2, heading: Math.PI },
  world: {
    seed: 1568,
    wind: [0.7, 0.7],   // 湖からの夕風
    time: 'day',   // 昼過ぎから攻めかかり、夕暮れ・夜へ移る
    autumn: true,     // 旧暦九月：枯れ色の草と色づく木
    muddy: 0.15,
    terrainTags: true,
    paths: [ROAD, ROAD_TANI],
    height,
    tint(x, z, h, c) {
      if (h > 10) c.setRGB(c.r * 0.82, c.g * 0.9, c.b * 0.82);
    },
    clear: (x, z) => (Math.abs(x - CAMP.x) < 40 && Math.abs(z - CAMP.z) < 36) || (Math.abs(x) < 24 && z < 30 && z > -112),
    // 近江の稲田（刈り入れ前）
    paddy(x, z) {
      if (z < 0 || z > 150 || Math.abs(x - CAMP.x) < 42 || Math.abs(x) > 150) return 0;
      if ((Math.floor(x / 16) + Math.floor(z / 12)) % 4 === 1) return 0;
      const ex = Math.min(((x % 16) + 16) % 16, 16 - ((x % 16) + 16) % 16), ez = Math.min(((z % 12) + 12) % 12, 12 - ((z % 12) + 12) % 12);
      return Math.max(0, Math.min(1, (Math.min(ex, ez) - 0.8) / 0.6)) * 0.6;
    },
    trees: 520,
    tufts: 3400,
    treeDensity: (x, z) => (z > 0 ? 0.2 : 1),
    groves: [{ x: -50, z: 20, r: 12, n: 16 }, { x: 60, z: 30, r: 12, n: 16 }],
    fleeOut: (x, z, team) => team === 1 && (z < -150 || (z < -118 && Math.abs(x) > 40)),
  },

  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    F.step = 0; F.ek = 0; F.ak = 0; F.lit = 0; F.fow = true;
    rokkakuTex();
    resetGates();

    // ---- 縄張り（castles/mitsukuri.js）：三の郭・二の丸・本丸。木戸は castle_plan.js に建てさせる ----
    const C = F.C = buildCastlePlan(rt, MITSUKURI_PLAN, { ladders: true, baseHeight: baseWithDem, edgeW: 2.6, buildGates: true, buildTowers: true, team: 1 });
    const sanC = C.kuruwa.san.centroid, niC = C.kuruwa.ni.centroid, honC = C.kuruwa.hon.centroid;
    F.gates = { kido: makeGate(rt, C.gateObjs.kido, { name: KIDO.name, guardTeam: 1 }) };
    // 内部の史実札（HIST_A=根拠強い／HIST_B=推定復元／GAME_C=ゲーム補完）。表には出さない
    F.hist = { honmaru: 'HIST_A', ninomaru: 'HIST_A', sekirui: 'HIST_A', saku: 'HIST_B', kido: 'HIST_B', kirigishi: 'HIST_B', sanKuruwa: 'GAME_C',
      kannonjiNet: 'HIST_A', dayToNight: 'HIST_A', fourCommanders: 'HIST_A', torchLegend: 'HIST_B', honjinOda: 'GAME_C', honjinRokkaku: 'HIST_B', yoshidaIzumo: 'HIST_B' };
    // 三の郭（外側の防御線）：柵で囲い、南の柵の口に冠木の枠（戸は無い）。口の外に逆茂木を並べて寄せを鈍らせる
    rt.scene.add(kabukimon(W, 0, -44, 4.4, 0, { doors: false }));
    sakamogiRow(rt, [[-20, -39], [-9, -39]], { n: 3 }); sakamogiRow(rt, [[9, -39], [20, -39]], { n: 3 });
    rt.scene.add(yagura(W, sanC.x - 9, sanC.z - 8), yagura(W, sanC.x + 10, sanC.z - 8));
    for (const [x, z] of [[-4, sanC.z - 10], [5, sanC.z - 10], [0, niC.z - 8]]) rt.scene.add(nobori(W, x, z, 'rokkaku', 6));
    // 本丸：切岸の上に野面の石塁を一部だけ（口の両脇。全部を石垣にしない）。城将は本丸の館の中（大天守は無い）
    for (const pts of [[[-10, -92.6], [-3, -92.6]], [[3, -92.6], [10, -92.6]], [[-10.6, -93], [-10.6, -100]]]) rt.scene.add(ishigaki(W, pts, { top: 1.2, minH: 1.8, maxH: 2.4, lean: 0.14 }));
    // 館は縄張り（castles/mitsukuri.js の lordSeat）から castle_plan.js が建てる：中に入れて、奥の間に城将（kaito 10/2）
    rt.scene.add(hut(W, honC.x + 7, honC.z + 4, 5, 4, -0.3));
    // ---- 繖山の観音寺城（遠く）：山腹の屋敷と旗 ----
    for (const [x, z, r] of [[92, -150, 0.3], [104, -160, 0.1], [84, -166, -0.2], [112, -176, 0.4]]) rt.scene.add(hut(W, x, z, 10, 6, r, { h: 3.4, wall: 0x7a6a50, roof: 0x3a3430 }));
    for (const [x, z] of [[82, -146], [108, -156]]) rt.scene.add(nobori(W, x, z, 'rokkaku', 7));
    // 観音寺城の篝火（勝つと、一つ、また一つと消えていく）
    F.kanFires = [[90, -146], [100, -152], [110, -160], [84, -162], [96, -170], [116, -172], [106, -182]].map(([x, z]) => W.addFire(x, z, { h: 0.3 }));

    // ---- 守り（箕作城・六角の衆。曲輪ごとに butai.js の部隊。siege_ai.js の城の頭で動かす） ----
    // 柵の口は狭く、一人で先に飛び込むと 14 人の本物がいっぺんに届いて潰れる（57秒・ceil2 の最初の城攻め。kaito 10/1）。密に集まる数を減らす
    // → それでも78秒で倒れる例あり（10/1）。柵の口の本物をさらに減らし、味方（木下・丹羽・佐久間の手）が追いつくまでの壁を厚くする
    F.sanDef = makeButai(rt, { name: '坂の守り', team: 1, faction: 'imagawa', kind: 'ashigaru', nominal: 220, nearReal: 6, maxReal: 7, armor: 0x33291f, flag: RK.flag, at: sanC, facing: Math.PI, real: 6 });
    F.niDef = makeButai(rt, { name: '柵の内の弓（二の丸）', team: 1, faction: 'imagawa', kind: 'bow', nearReal: 12, maxReal: 14, nominal: 260, armor: 0x33291f, flag: RK.flag, at: { x: niC.x, z: niC.z + 6 }, facing: Math.PI, real: 10 });
    F.honDef = makeButai(rt, { name: '城将 吉田出雲守の衆', team: 1, faction: 'imagawa', kind: 'ashigaru', nearReal: 30, nominal: 320, armor: 0x33291f, flag: RK.flag, at: { x: honC.x, z: honC.z + 4 }, facing: Math.PI, real: 14 });
    F.defenders = [F.sanDef, F.niDef, F.honDef];
    F.defendTotal = F.defenders.reduce((s, b) => s + b.nominal, 0);
    // 城将・吉田出雲守は本丸の館の中（高遠の盛信と同じ作り）。旗本が縁側の上がり口を守り、踏み込むまで討てない
    F.keep = makeLordKeep(rt, {
      name: '吉田出雲守', spot: { x: honC.x, z: honC.z - 4 }, mouth: { x: honC.x, z: honC.z + 1 }, facing: Math.PI, guardN: 5,
      faction: 'imagawa', armor: 0x33291f, flag: RK.flag, hat: 'kabuto_m', haori: 0x33291f,
      onReach: () => { rt.banner('館へ踏み込んだ', '城将の吉田出雲守が刀を抜いた。討ち取れ'); rt.say('吉田出雲守', '箕作は渡さぬ……！', 3); },
    });
    F.commander = { alive: true, get real() { return F.keep && F.keep.lord && F.keep.lord.alive ? F.keep.lord : null; } };
    for (const b of F.defenders) b.order({ id: 'hold' });

    // ---- 織田勢：木下藤吉郎の手（自分の持ち場）、丹羽長秀の手、佐久間信盛の手、木戸を破る組 ----
    F.kino = allyGroup(rt, { name: '木下藤吉郎の手', anchor: { x: CAMP.x, z: CAMP.z - 6 }, facing: Math.PI, width: 12, aggro: 8, noRout: true },
      dress([{ type: 'busho', n: 1, o: { name: '木下藤吉郎', invuln: true } }, { type: 'ashigaru', n: 14 }, { type: 'gun', n: 2 }], ODA));
    F.kinoU = F.kino.units[0];
    F.niwa = allyGroup(rt, { name: '丹羽長秀の手', anchor: { x: CAMP.x - 22, z: CAMP.z - 4 }, facing: Math.PI, width: 12, aggro: 8, noRout: true },
      dress([{ type: 'samurai', n: 1, o: { name: '丹羽長秀', invuln: true, horse: true, hat: 'kabuto_w', haori: 0x2a3a2a } }, { type: 'ashigaru', n: 12 }, { type: 'bow', n: 4 }], ODA));
    F.saku = allyGroup(rt, { name: '佐久間信盛の手', anchor: { x: CAMP.x + 24, z: CAMP.z - 4 }, facing: Math.PI, width: 12, aggro: 8, noRout: true },
      dress([{ type: 'samurai', n: 1, o: { name: '佐久間信盛', invuln: true, horse: true, hat: 'kabuto_m', haori: 0x4a3a2a } }, { type: 'ashigaru', n: 14 }], ODA));
    F.ram = allyGroup(rt, { name: '木戸を破る組', anchor: { x: CAMP.x + 10, z: CAMP.z + 10 }, facing: Math.PI, width: 5, aggro: 3, noRout: true, formation: 'column' },
      dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 12, o: { hat: 'jingasa_n' } }], ODA));
    F.oda = [F.kino, F.niwa, F.saku, F.ram];
    for (const g of F.oda) { g.defMult = 1.2; g.dmgMult = 0.85; }
    F.attackers = F.oda;
    F.attackTotal = 50; // 旗本・遠景も含む目安（force() は別に総勢を出す）
    // 浅井新八の手：北東の尾根から本丸の東の切岸へ寄せる（遠景・AI。軽い作りの部隊で、数だけで押し合う）
    F.asai = makeButai(rt, { name: '浅井新八の手', team: 0, faction: 'oda', kind: 'ashigaru', nominal: 200, armor: 0x2b3140, flag: 'oda', at: { x: 58, z: -70 }, facing: -Math.PI * 0.62, real: 0, maxReal: 0 });
    F.asaiFoe = makeButai(rt, { name: '本丸の東の守り', team: 1, faction: 'imagawa', kind: 'bow', nominal: 140, armor: 0x33291f, flag: RK.flag, at: { x: 22, z: -98 }, facing: Math.PI * 0.4, real: 0, maxReal: 0 });
    for (const b of [F.asai, F.asaiFoe]) b.order({ id: 'hold' });
    for (const [x, z] of [[62, -64], [54, -62]]) rt.scene.add(nobori(W, x, z, 'oda', 6));
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: CAMP.x + 8, z: CAMP.z + 4 }, Math.PI, [{ kind: 'spear', n }]);
    // 一番乗り（siege_zones.js）：木戸が破れても、自分が二の丸へ踏み込むまで味方は木戸の外で待つ
    F.FI = makeFirstIn(rt, { from: { x: CAMP.x, z: CAMP.z }, gates: [{ gate: F.gates.kido, zone: C.kuruwa.ni.test }] });

    // ---- 陣と旗 ----
    F.odaCamp = camp(rt, { x: CAMP.x, z: CAMP.z + 22, facing: Math.PI, team: 0, faction: 'oda', mon: 'oda', general: { name: '織田信長' }, guard: 18, reserve: 260, runTo: { x: CAMP.x, z: CAMP.z - 6 } });
    rt.scene.add(tawara(W, CAMP.x - 14, CAMP.z + 16, 0.3, 6));
    for (const [x, z, k] of [[CAMP.x - 8, CAMP.z + 14, 'oda'], [CAMP.x + 8, CAMP.z + 14, 'eiraku'], [CAMP.x - 26, CAMP.z + 4, 'oda'], [CAMP.x + 28, CAMP.z + 4, 'oda']]) rt.scene.add(nobori(W, x, z, k, 6));
    for (const [x, z] of [[CAMP.x - 16, CAMP.z + 2], [CAMP.x + 18, CAMP.z + 6]]) { rt.scene.add(campfire(W, x, z)); W.addFire(x, z); }
    for (const t of TORCH) rt.scene.add(tawara(W, t.x, t.z, 0.5, 2));
    // ---- 大軍（軽い作り）：上洛の織田勢と、繖山の六角勢 ----
    const DA = (x, z, w, d, count, facing, armor, tex, seed) => W.addDistantArmy({ x, z, w, d, count, facing, armor, flagTex: tex, seed });
    const OT = flagTexture('oda'), ET = flagTexture('eiraku');
    DA(-40, 96, 36, 14, 260, Math.PI, 0x2b3140, OT, 15681);
    DA(46, 100, 36, 14, 260, Math.PI, 0x2b3140, ET, 15682);
    DA(0, 140, 50, 14, 300, Math.PI, 0x2b3140, OT, 15683);
    DA(-110, -20, 30, 12, 200, -Math.PI * 0.8, 0x2b3140, OT, 15684);     // 和田山城を抑える手
    // 繖山の山腹の六角の本陣：六角義賢と旗本、後ろに控え（軽い兵）
    F.rkCamp = camp(rt, { x: KC.x, z: KC.z, facing: Math.atan2(HON_C.x - KC.x, HON_C.z - KC.z), team: 1, faction: 'imagawa', mon: 'rokkaku', armor: 0x33291f, general: { name: '六角義賢', hat: 'kabuto_m', haori: 0x33291f }, depth: true, guard: 15, reserve: 180, runTo: { x: 60, z: -120 } });

    // ---- 区域の網（siege_zones.js）：三の郭→二の丸（木戸）→本丸 ----
    F.SZ = makeSiegeZones(rt, {
      zones: [
        { id: 'san', name: '三の郭（坂の上）', test: C.kuruwa.san.test, pos: sanC, need: 6, hold: 13, next: 'ni' },
        { id: 'ni', name: '二の丸（木戸構え）', test: C.kuruwa.ni.test, pos: niC, need: 8, hold: 15, gate: KIDO.name, next: 'hon' },
        { id: 'hon', name: '本丸', test: C.kuruwa.hon.test, pos: honC, need: 10, hold: 16, honmaru: true },
      ],
      links: [['san', 'ni'], ['ni', 'hon']],
      friendTeam: 0, enemyTeam: 1,
      totalDefenders: 160,
      commander: () => F.commander,
      noReinforce: () => true,
      quietRange: [16, 30],
      onFall: (id) => this.onZoneFall(rt, id),
      onHonmaru: () => this.midB(rt),
      onSurrender: () => this.midB(rt),
    });
    // ---- 城の頭（siege_ai.js）：守りは持ち場・門・退き ----
    F.DA = makeDefenseAI(rt, {
      posts: [
        { id: 'san', butai: F.sanDef, at: sanC, next: 'ni' },
        { id: 'ni', butai: F.niDef, at: niC, gate: KIDO.name, next: 'hon' },
        { id: 'hon', butai: F.honDef, at: honC },
      ],
      reserves: [],
      fallback: { x: honC.x, z: honC.z },
    });
    // 攻めの頭（軍議で作戦を選ばなければ、夜目の利かなさに揺らぎを掛けて自分で選ぶ）
    F.AI_ROUTES = [
      { id: 'ote', defThickness: 2.6, pathLen: 70, chokeWidth: 3.6 },
      { id: 'tani', defThickness: 1.2, pathLen: 90, chokeWidth: 5 },
    ];

    rt.banner('箕作攻め', '昼過ぎ。織田の四手が、箕作山へ寄せる');
    rt.setPhase('brief');
    rt.obj('main', hi(rt) ? '木下藤吉郎の先手の一隊を預かり、攻めの下知を待て' : '木下藤吉郎のもとで、攻めの下知を待て', 'main');
    rt.say('木下藤吉郎', `${nm(rt)}、見よ。あれが六角の箕作城、奥の山が観音寺城じゃ。佐久間殿・丹羽殿・浅井新八殿と、四方から一度に攻める`, 5);
    rt.marker('mk1', { x: HON_C.x, z: HON_C.z }, '箕作城', { h: 6 });
    rt.marker('mk2', { x: 98, z: -156 }, '観音寺城（繖山）', { h: 8 });
    rt.after(1, () => { if (!rt.player.lock) rt.player.cine = { x: HON_C.x, z: HON_C.z, t: 1.6 }; });
    rt.after(8, () => { rt.unmark('mk1'); rt.unmark('mk2'); });
    for (let k = 0; k < 6; k++) rt.after(1.5 + k * 2.2, () => {
      const x = (k % 3 - 1) * 16, z = -60 - (k % 2) * 16;
      rt.army.smoke(x, rt.world.heightAt(x, z) + 1.4, z, 0, 1);
      rt.army.play('gun', { x, z }, 0.8);
      if (k % 2) rt.army.play('eshout', { x, z: z - 10 }, 0.9);
    });
    rt.say('木下藤吉郎', 'わしらは南の大手じゃ。日が暮れる前に外の柵を破る。暮れても退かぬぞ', 4);
    rt.marker('kino', F.kinoU.pos, '木下藤吉郎（話を聞く）', {});
    rt.addInteract('talk', { x: CAMP.x, z: CAMP.z - 6 }, '藤吉郎の話を聞く', () => { rt.uninteract('talk'); rt.say('木下藤吉郎', 'よし、かかるぞ', 2); rt.after(2, () => this.climb(rt)); }, { r: 5 });
    rt.after(14, () => this.climb(rt));
  },

  // ④ 日が傾く：三の郭を取ったら、松明を灯して攻め続ける
  dusk(rt) {
    const F = rt.flags;
    if (F.step >= 2.5) return;
    F.step = 2.5; F.stepT = rt.t;
    rt.setPhase('torch');
    rt.world.setTime('dusk');
    rt.banner('日が傾く', '退かぬ。松明を灯して、夜も攻め続ける');
    nextObj(rt, rt.G.lord ? `松明に火を移させ、夜攻めの支度を整えよ（${TORCH.length}つ）` : `松明の束に火を移せ（${TORCH.length}つ）`);
    rt.say('木下藤吉郎', '日が暮れるぞ！　松明の束に火を移せ。一人一本ずつ持たせるのじゃ', 3.5);
    rt.after(14, () => { if (F.step === 2.5) applyLook(rt, MID); });
    if (rt.G.lord) { TORCH.forEach((t, i) => rt.after(4 + i * 3, () => { if (rt.flags.step === 2.5) this.light(rt, i); })); return; }
    TORCH.forEach((t, i) => {
      rt.marker('t' + i, t, '松明', { h: 2 });
      rt.addInteract('t' + i, t, '松明の束に火を移す', () => this.light(rt, i), { r: 3.4, hold: 1.2 });
    });
  },
  light(rt, i) {
    const F = rt.flags;
    const t = TORCH[i];
    rt.uninteract('t' + i); rt.unmark('t' + i);
    rt.world.addFire(t.x, t.z, { torch: true, h: 0.9 });
    F.lit++;
    for (let k = 0; k < 2; k++) rt.after(1 + k * 0.8, () => { const x = t.x * 0.6 + (k % 2 ? 3 : -3), z = t.z - 18 - k * 8; rt.world.addFire(x, z, { torch: true, h: 1.6 }); });
    if (F.lit >= TORCH.length) this.night(rt);
    else rt.objProgress('main', `${F.lit}／${TORCH.length}`);
  },
  // ⑥ 夜戦：月明かりと松明だけ。闇の中で弓のねらいが鈍る → 尾根の伏兵の段 → 二の丸の木戸へ
  night(rt) {
    const F = rt.flags;
    if (F.step >= 2.8) return;
    F.step = 2.8; F.stepT = rt.t;
    for (let i = 0; i < TORCH.length; i++) { rt.uninteract('t' + i); rt.unmark('t' + i); }
    applyLook(rt, NIGHT);
    // 月：北の空、城の上にかかる（applyLook は星と月を出さないので、ここで出す）
    const W = rt.world;
    if (W.moon) { W.moon.visible = true; W.moon.position.set(0.25, 0.42, -0.87).multiplyScalar(420); if (W.stars) W.stars.visible = true; }
    for (const b of [F.niDef, F.honDef]) if (b.real) b.real.dmgMult = (b.real.dmgMult || 1) * nightAccuracyMult(W);
    // 松明の列：坂道と左右の山腹に灯が並ぶ
    for (let k = 0; k < 5; k++) rt.after(1 + k * 1.2, () => { const z = -20 - k * 6; W.addFire(k % 2 ? 7 : -7, z, { torch: true, h: 1.6 }); });
    sfx('horagai', 1); rt.after(1, () => sfx('taiko', 1));
    rt.banner('夜戦', '月と松明の明かりで、二の丸へ寄せる');
    rt.say('木下藤吉郎', '松明を高く掲げよ。城の者に、山じゅうが織田じゃと思わせるのじゃ', 4);
    depthStart(rt, mkCtx(rt), mkA(), () => this.gateFight(rt));
  },

  // ②③ 昼過ぎ：軍議で選んだ道（無ければ攻めの頭が自分で選ぶ）で、外側の柵（三の郭）へ攻め上る
  climb(rt) {
    const F = rt.flags;
    if (F.step >= 2) return;
    F.step = 2; F.stepT = rt.t;
    rt.setPhase('climb');
    rt.unmark('kino'); rt.uninteract('talk');
    sfx('horagai', 1); rt.after(1, () => sfx('taiko', 1));
    rt.banner('外側の柵', '日の高いうちに、三の郭の柵の口へ攻め上る');
    nextObj(rt, hi(rt) ? '一隊を率いて先に立ち、三の郭の柵の口の守りを退けよ' : '坂を登り、三の郭の柵の口の守りを退けよ');
    // 浅井新八の手が北東の尾根から寄せ、本丸の東の守りと押し合う（遠景）
    if (F.asai.light) F.asai.light.advance(26, 14);
    rt.after(6, () => rt.bark('浅井新八の手が、北東の尾根から本丸の東へ寄せる'));
    F.strategy = window.__mitsukuriStrategy || F.strategy || null;
    if (!F.strategy) {
      F.aiPicked = true;
      const picked = chooseRoute(F.AI_ROUTES, Math.random);
      F.strategy = (picked && picked.id) || 'ote';
      rt.bark(`攻めの頭：${F.strategy === 'tani' ? '西の谷' : '大手'}を主に攻める`);
    }
    this.runStrategy(rt, F.strategy);
    rt.marker('san', F.C.kuruwa.san.centroid, () => `三の郭・${zoneWord(F.SZ.stat().san)}`, { red: true });
    rt.marker('hon', F.C.kuruwa.hon.centroid, () => `本丸・${moraleWord(F.honDef.morale)}`, { red: true });
    // 道の左右の山腹でも、松明を掲げた織田の大軍と六角勢が押し合う（軽い作り）
    F.lines = lines(rt, [
      { x: -38, z: -46, facing: Math.PI, w: 30, seed: 15687, A: ['oda', 0x2b3140, 360, 'oda'], B: ['rokkaku', 0x33291f, 320, 'imagawa'], bowsB: true, surge: { every: 55, count: 110, flank: 0.3 } },
      { x: 40, z: -48, facing: Math.PI, w: 30, seed: 15688, A: ['eiraku', 0x2b3140, 360, 'oda'], B: ['rokkaku', 0x33291f, 320, 'imagawa'], surge: { every: 60, count: 110, flank: 0.3 } },
    ]);
    F.lines.forEach((c, i) => rt.after(5 + i * 2, () => c.go()));
  },

  // 軍議の作戦：①大手の夜攻め（正面から三の郭へ） ②谷から松明で回る（三の郭の守りを避け、二の丸の脇へ）
  runStrategy(rt, strat) {
    const F = rt.flags;
    if (strat === 'tani') {
      rt.say('木下藤吉郎', '西の谷を忍んで、柵の口の脇へ回る。旗を伏せよ、気取られるな', 4);
      routeOld(F.kino, ROAD_TANI.slice(1), 3.4);
      routeOld(F.niwa, ROAD_TANI.slice(1), 3.2);
      routeOld(F.saku, [...ROAD_OTE.slice(2, 4)]);   // 大手は小さく構えて引きつけるだけ
      routeOld(F.ram, ROAD_TANI.slice(1));
      // 谷を忍ぶ道なので、三の郭の守りは松明の大軍ほど気付けない（出撃が遅れる＝士気の下がりを緩める）
      F.sanDef.morale = Math.min(100, F.sanDef.morale + 10);
    } else {
      rt.say('木下藤吉郎', 'かかれ！　柵の口へ押し上げよ。日のあるうちに三の郭を取るのじゃ', 4);
      routeOld(F.kino, ROAD_OTE.slice(2), 3.4);
      routeOld(F.niwa, [[-16, -36], ...ROAD_OTE.slice(3)], 3.2);
      routeOld(F.saku, [[16, -36], ...ROAD_OTE.slice(3)], 3.2);
      routeOld(F.ram, ROAD_OTE.slice(2));
    }
    // 坂の守りへ鉄砲を撃ちかける組（永禄のころなので四挺だけ）
    F.gunK = allyGroup(rt, { name: '藤吉郎の鉄砲組', anchor: { x: CAMP.x + 4, z: CAMP.z - 10 }, facing: Math.PI, width: 8, aggro: 4, noRout: true }, dress([{ type: 'gun', n: 4 }], ODA));
    routeOld(F.gunK, [[6, -34]]);
    // 竹束の寄せ（taketaba.js）：松明の列の先手は竹束を押し立て、終いの坂をゆっくり寄せ場まで登って、陰から撃ち合う
    // 昼の強襲（docs 41 の速いテンポ）：竹束の陰で止まった手は、update が柵の口へ押し込む（until を時で切ると taketaba が止まるので使わない）
    const tani = strat === 'tani', sanDone = () => !!F.sanFell;
    patchGunCover(rt);
    F.TA = makeTabaAdvance(rt, {
      near: 50,
      items: [
        // 藤吉郎の手（自分の組の周り）は竹束で止まらず、自分と一緒に柵の口へ駆け上がる（自分ひとりで三の郭へ飛び込まないように）
        { g: F.niwa, yose: tani ? { x: -36, z: -24 } : { x: -16, z: -34 }, until: sanDone },
        { g: F.saku, yose: { x: 16, z: -34 }, until: sanDone },
        { g: F.gunK, yose: { x: 6, z: -32 }, until: sanDone },
      ],
      avoid: [{ x: rt.player.u.pos.x, z: rt.player.u.pos.z }],
    });
  },

  // 区域が落ちた（siege_zones.js の onFall）
  onZoneFall(rt, id) {
    const F = rt.flags;
    if (id === 'san' && !F.sanFell) {
      F.sanFell = true;
      rt.unmark('san');
      rt.award((t) => t.side.push('坂の守りを退けた'), '坂の守りを退けた');
      this.dusk(rt);
    } else if (id === 'ni' && !F.niFell) {
      F.niFell = true;
      rt.unmark('hon');
      rt.marker('hon', F.C.kuruwa.hon.centroid, () => `本丸・${moraleWord(F.honDef.morale)}`, { red: true });
      this.inside(rt);
    } else if (id === 'hon' && !F.honFell) {
      F.honFell = true;
    }
  },
  // 坂を越えた後：木戸へ
  gateFight(rt) {
    const F = rt.flags;
    if (F.step >= 3) return;
    F.step = 3; F.stepT = rt.t;
    rt.setPhase('gate');
    rt.banner('木戸へかかれ', '木戸を破る組が丸太を担いで進む');
    nextObj(rt, '木戸を破る組を守り、木戸を破れ');
    rt.marker('gate', KIDO, () => `木戸 ${Math.round(Math.max(0, F.gates.kido.struct.hp) / F.gates.kido.struct.maxHp * 100)}%`, { h: 4 });
    F.ram.assault = () => (F.gates.kido.struct.alive ? F.gates.kido.struct : null);
    F.ram.order = 'assault'; F.ram.formation = 'line'; F.ram.aggro = 2;
    for (const g of [F.kino, F.niwa, F.saku]) { g.order = 'attack'; g.seekRange = 40; }
    rt.after(18, () => {
      if (F.step !== 3) return;
      const g = enemyGroup(rt, { faction: 'imagawa', name: '打って出た六角勢', anchor: { x: 24, z: NI_C.z + 16 }, facing: -Math.PI / 2, order: 'attack', seekRange: 60, aggro: 12, width: 8, morale: 85, fleeDir: { x: 0.3, z: -1 }, dmgMult: 0.65 },
        dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 10 }], RK));
      g.focus = F.ram.units.find((u) => u.alive) || null;
      F.sally = g;
      rt.army.play('eshout', { x: 24, z: NI_C.z + 16 }, 1.5);
      rt.say('足軽', '柵の脇の抜け道から、六角の兵が出てきた！　丸太の組を狙っておる！', 3.5);
      rt.marker('sally', centerOf(g), () => `打って出た六角勢・${moraleWord(g.morale)}`, { red: true, group: g });
    });
  },
  // 木戸の内（二の丸が落ちた直後の演出）
  inside(rt) {
    const F = rt.flags;
    if (F.insideSaid) return;
    F.insideSaid = true;
    rt.unmark('gate'); rt.unmark('sally');
    if (!F.gateForced) rt.award((t) => t.side.push('木戸を破った'), '木戸を破った');
    sfx('taiko', 1); rt.after(0.5, () => sfx('horagai', 0.9));
    rt.banner('木戸、破れる', '城将の衆が打ちかかってくる');
    rt.say('吉田出雲守', '箕作は六角の要ぞ！　ここを抜かれては観音寺が持たぬ、押し返せ！', 4);
    rt.say('木下藤吉郎', '内へ押し込め！　夜が明ける前に、この山を落とすのじゃ', 3.5);
    nextObj(rt, '木戸の内で、城将の衆を退けよ');
    for (const g of [F.kino, F.niwa, F.saku, F.ram]) { g.order = 'attack'; g.seekRange = 60; g.formation = 'line'; }
    F.ram.assault = null;
  },

  // 本丸が落ちた後の段：観音寺からの後詰 → 勝ち
  midB(rt) {
    const F = rt.flags;
    if (F.step >= 4.5) return;
    F.step = 4.5;
    rt.unmark('hon');
    rt.award((t) => t.side.push('城将の衆を退けた'), '城将の衆を退けた');
    depthStart(rt, mkCtx(rt), mkB(), () => this.win(rt));
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.unmark('san'); rt.unmark('hon');
    for (const c of F.lines || []) c.rout('B', { from: 0, hideAfter: 20, minFight: 0 });
    rt.objDone('main');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '夜のうちに箕作城を落とした', pts: 20 }; }, '任務達成・箕作城を落とした');
    sfx('horagai', 0.8); rt.after(1, () => sfx('toki', 0.8));
    rt.world.addFire(HON_C.x - 6, HON_C.z - 4, { h: 1.8 }); rt.world.addSmokeColumn(HON_C.x - 6, F.C.kuruwa.hon.level + 6, HON_C.z - 6, { size: 2.6 });
    rt.banner('六角勢、退く', '箕作城は落ちた。夜のうちに、六角父子は観音寺城を捨てて甲賀へ落ちた');
    rt.say('木下藤吉郎', `やったぞ、${nm(rt)}！　……見よ、観音寺の山の篝火が、一つ、また一つと消えていく`, 5);
    (F.kanFires || []).forEach((f, i) => rt.after(1.5 + i * 1.1, () => rt.world.removeFire(f)));
    rt.after(1, () => { if (!rt.player.lock) rt.player.cine = { x: 98, z: -160, t: 3 }; });
    rt.after(6, () => rt.say('', '――観音寺城は戦わずに開かれ、信長は京への道を開いた', 5));
    rt.player.u.invuln = true;
    rt.finish({}, 11);
  },

  update(rt, dt) {
    const F = rt.flags;
    KIT.backTick(rt);
    depthTick(rt, dt);
    butaiTick(rt, dt);
    for (const m of rt.markers.slice()) if (m.group && gone(m.group)) rt.unmark(m.id);
    if (F.ending) return;
    updateGates();
    if (F.TA) { F.TA.tick(dt); tickTabas(rt, dt); tabaInteractTick(rt, { allowPush: true, team: 0 }); }
    if (F.SZ) F.SZ.tick(dt);
    if (F.DA) F.DA.tick(dt);
    if (F.FI) F.FI.tick();
    if (F.step >= 2 && F.asai) lightClash(F.asai, F.asaiFoe, dt, 0.06);
    // 柵の内の弓・目覚めた軽い兵の弓は、坂の下へ向けて射る（見上げる的で当たりにくい。作り直された組にも掛け直す）
    if ((F.bowT = (F.bowT || 0) - dt) <= 0) { F.bowT = 0.5; for (const g of rt.army.groups) if (g.team === 1 && !g._mkBow && g.count) { g._mkBow = true; g.dmgMult = (g.dmgMult || 1) * (g.units.some((u) => u.type === 'bow') ? 0.5 : (g.woke || g.name === '坂の守り') ? 0.55 : 1); } }
    // 城将は本丸の館の中（kaito 10/1）：踏み込んで討てば本丸は落ちたとする
    if (F.keep) { F.keep.tick(); if (F.keep.down && F.step < 4.5) this.midB(rt); }
    if (F.step === 2.5 && rt.t - F.stepT > 25) {
      for (let i = 0; i < TORCH.length; i++) if (rt.interacts.some((q) => q.id === 't' + i)) { rt.uninteract('t' + i); rt.unmark('t' + i); rt.world.addFire(TORCH[i].x, TORCH[i].z, { torch: true, h: 0.9 }); }
      this.night(rt);
    }
    if (F.step >= 2) {
      const st = F.SZ ? F.SZ.stat() : {};
      if (!F.niFell) rt.objProgress('main', `三の郭・${zoneWord(st.san)}／二の丸・${zoneWord(st.ni)}`);
      else if (!F.honFell) rt.objProgress('main', `本丸・${zoneWord(st.hon)}`);
      // 保険：時をかけすぎたら決着させる（遊んで 4〜7 分の目安）
      if (!F.honFell && rt.t - F.stepT > 300) { for (const b of F.defenders) b.morale = Math.min(b.morale, 20); }
      // 速いテンポ（docs 41）：昼の三の郭の取り合いが長引いたら、坂の守りが崩れて退く（遊んで 4〜7 分に収める）
      // 竹束の陰で撃ち合った後、止まったままの手は柵の口へ押し込む（城の頭に任せず、昼のうちに三の郭を取りに行く）
      if (F.step === 2 && !F.sanFell && rt.t - F.stepT > 22 && rt.t > (F.pushT || 0)) {
        F.pushT = rt.t + 5;
        for (const g of [F.kino, F.niwa, F.saku]) if (g && g.count && g.order === 'hold') { g.order = 'attack'; g.seekRange = 45; g.aggro = 12; }
      }
      if (F.step === 2 && !F.sanFell && rt.t - F.stepT > 60) { F.sanDef.morale = Math.min(F.sanDef.morale, rt.t - F.stepT > 85 ? 8 : 30); if (rt.t - F.stepT > 105) this.onZoneFall(rt, 'san'); }
    }
    if (F.step === 3) {
      rt.objProgress('main', `木戸 ${Math.round(Math.max(0, F.gates.kido.struct.hp) / F.gates.kido.struct.maxHp * 100)}%・組 ${F.ram.count}人`);
      if (F.ram.count < 4 && !F.ram2) {
        F.ram2 = true;
        const g = allyGroup(rt, { name: '木戸を破る組', anchor: { x: 6, z: 6 }, facing: Math.PI, width: 5, aggro: 2, noRout: true, order: 'assault', speed: 3.2 },
          dress([{ type: 'ashigaru', n: 10, o: { hat: 'jingasa_n' } }], ODA));
        g.assault = F.ram.assault;
        rt.say('木下藤吉郎', '次の者、丸太を拾え！', 2);
      }
    }
    if (rt.t - (F.stepT0 || (F.stepT0 = rt.t)) > 420 && !F.ending) this.win(rt);
  },

  onKill(rt, v, k) {
    const F = rt.flags;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
    if (v.type === 'busho' && v.team === 1 && v.group) { v.group.noRout = false; v.group.morale -= 40; if (k && k.isPlayer) rt.say('足軽', '城将を討ち取ったぞ！', 3); }
  },
  onRout(rt, g) {
    // 同じ隊が崩れ・立て直しを繰り返すと、同じ一言が十秒おきに出ていた（10/2）。隊ごとに一度・間は 9 秒あける
    const F = rt.flags;
    if (g.team !== 1 || !g.name || g._routSaid || rt.t < (F.routSayT || 0)) return;
    g._routSaid = true; F.routSayT = rt.t + 9;
    rt.say('足軽', `${g.name}が${rt.flags.step >= 2.8 ? '闇の中へ' : '城の奥へ'}退いていく！`, 2.5);
  },
};

// 両軍の総勢（上洛の織田勢 五万ほど、箕作城の六角勢 三千ほど。数には諸説ある）
mitsukuri.force = (rt) => {
  const F = rt.flags;
  return { a: Math.round(50000 - (F.ak || 0) * 40), a0: 50000, b: Math.max(0, 3000 - (F.ek || 0) * 40), b0: 3000 };
};
mitsukuri.sides = { a: { name: '織田軍', mon: 'oda' }, b: { name: '六角軍', mon: 'rokkaku' } };
mitsukuri.famous = [
  { name: '建部秀明', g: /坂の守り|二の丸|打って出た/, loose: 1, line: '六角家の建部秀明なり！　箕作は一夜では落ちぬぞ！' },
];
mitsukuri.date = (rt) => `永禄十一年九月十二日　秋・晴・${rt.flags.step >= 2.8 ? '夜' : rt.flags.step >= 2.5 ? '夕暮れ' : '昼過ぎ'}`;
mitsukuri.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '攻めの下知まで待つ' : '');
mitsukuri.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
mitsukuri.history = '永禄十一年（1568）九月、織田信長は足利義昭を奉じて京へ上る兵を起こした。道をふさぐ南近江の六角義賢（承禎）・義治の父子は従わず、観音寺城と、その支えの和田山城・箕作城に兵を入れた。九月十二日、信長は佐久間信盛・木下藤吉郎・丹羽長秀らに箕作城を攻めさせた。織田勢は夕方から攻めかかり、夜のうちに城を落とした。藤吉郎が数百の松明を灯して夜に攻め上ったという話は、のちの伝えである。箕作城が一日で落ちたのを見て、六角父子はその夜のうちに観音寺城を捨てて甲賀へ落ち、観音寺城は戦わずに開かれた。信長はこのあと京へ入り、義昭は十五代将軍となった。城将の名は伝えによって違い、兵の数にも諸説ある。';
mitsukuri.lordAt = { x: 4, z: 74, r: 12, why: '箕作の麓の織田の陣（信長は諸将に夜攻めを命じた）' };
mitsukuri.lordSpawn = { x: 4, z: 70, heading: Math.PI };
mitsukuri.rts = true;

// 軍議（gungi.js）：城を回して見て、道を一つ選ぶ
mitsukuri.gungi = (rt) => {
  const F = rt.flags;
  const G = {
    center: { x: 0, z: -70 }, dist: 150,
    landmarks: [
      { name: '三の郭', x: SAN_C.x, z: SAN_C.z }, { name: '木戸', x: KIDO.x, z: KIDO.z },
      { name: '二の丸', x: NI_C.x, z: NI_C.z }, { name: '本丸', x: HON_C.x, z: HON_C.z },
      { name: '西の谷', x: NISHI_TANI_X, z: -36 },
    ],
    lines: [
      { name: '三の郭', owner: '敵' }, { name: '二の丸', owner: '敵' }, { name: '本丸', owner: '敵' },
    ],
    units: [{ id: 'main', name: '木下藤吉郎の手（全軍）', group: () => F.kino }],
    routes: [
      { id: 'ote', name: '大手の坂を正面から攻め上る' },
      { id: 'tani', name: '西の谷を忍び、柵の口の脇へ回る' },
    ],
    default: { main: 'ote' },
    enemy: [
      { name: '坂の守り', known: true, count: () => (F.sanDef ? F.sanDef.aliveNominal() : 0) },
      { name: '木戸構えの弓', known: false },
      { name: '城将の衆', known: false },
    ],
    cinema: { attackers: { x: 0, z: -20 }, gate: { x: KIDO.x, z: KIDO.z }, defenders: { x: HON_C.x, z: HON_C.z } },
    onStart: (assign) => mitsukuri.onGungiStart(rt, assign),
  };
  if (window.__mitsukuriStrategy) { mitsukuri.onGungiStart(rt, { main: window.__mitsukuriStrategy }); return null; }
  if (/[?&]bot/.test(location.search)) return null;
  return G;
};
mitsukuri.onGungiStart = (rt, assign) => { rt.flags.strategy = assign.main || 'ote'; };

// ---------------- ②の後の段：夜の山腹（尾根の伏兵・和田山の後詰）／本丸後の段：観音寺の後詰 ----------------
function mkCtx(rt) {
  const F = rt.flags;
  return { faction: 'imagawa', flag: 'rokkaku', armor: 0x33291f, dmg: 0.64, look: (l) => dress(l, RK), friends: () => [F.kino].filter((g) => g && g.count), aid: { name: '藤吉郎の手の一組', list: [uS(1), uA(8)] }, aidSaid: '藤吉郎の手から一組が加わった' };
}
function mkA() {
  const RD = { x: 0, z: -50 };
  const RR = round(RD, Math.PI, 40);
  return [
    rest({ dur: 8, say: [['木下藤吉郎', '坂の守りは崩れた。……じゃが、左右の尾根が妙に暗い'], ['足軽', '松明を消して潜んでおるのか……']] }),
    pick({ title: '左右の尾根に、六角の兵が松明を消して潜んでいるらしい。どうする？',
      options: [{ label: '松明を消し、西の尾根を忍び登って先に叩く', note: '伏兵を先に崩せば手柄。闇の中で数が読めない' }, { label: '松明を掲げたまま、道を押し登る', note: '山じゅうが織田に見え、城の者が怯える。左右から挟まれる' }],
      on: (rt, m, i) => { m.mkDark = i === 0; rt.say('木下藤吉郎', i === 0 ? '火を消せ。声を立てるな' : 'よし、火を高く掲げよ！　挟まれても槍を揃えよ', 3); } }),
    fight({ skip: (rt, m) => !m.mkDark, at: { x: -16, z: -58 }, max: 150, title: '西の尾根', sub: '闇の尾根で、潜んでいた六角勢とぶつかる', obj: '西の尾根に潜む六角勢を崩せ',
      foes: () => [{ name: '尾根に潜む六角勢', from: { x: -40, z: -76 }, list: [uS(2), uA(12), uB(3)], mass: 180 }],
      later: [{ t: 35, title: '東の尾根', sub: '東の尾根の伏兵が、道の味方へ下りる', say: ['足軽', '東の尾根からも下りた……藤吉郎様の手が挟まれる！'], foes: () => [{ name: '東の尾根の六角勢', from: { x: 34, z: -60 }, list: [uS(1), uA(10)], mass: 150 }] }],
      reward: (t) => { t.special = { label: '闇の尾根で伏兵を崩した', pts: 20 }; }, rewardLabel: '尾根の伏兵を崩した' }),
    hold({ skip: (rt, m) => m.mkDark, at: RD, dur: 80, r: 13, title: '松明の道', sub: '左右の尾根から、闇の中の六角勢が下りる', label: '松明の道', obj: '松明の道で踏みとどまり、左右から寄せる六角勢を退けよ',
      waves: [
        { t: 5, say: ['足軽', '右の尾根から来た！'], foes: () => [{ name: '右の尾根の六角勢', from: RR.right, list: [uS(2), uA(12)], mass: 180 }] },
        { t: 30, say: ['足軽', '左からも……挟まれた！'], foes: () => [{ name: '左の尾根の六角勢', from: RR.left, list: [uS(2), uA(12)], mass: 180 }] },
        { t: 55, say: ['足軽', '柵の前に鉄砲が並んだ……！　松明を狙っておる！'], foes: () => [gunLine('柵の前の六角の鉄砲組', RR.front, RD, 8)] },
      ],
      reward: '松明の道を守りぬいた' }),
  ];
}
function mkB() {
  const OG = { x: HON_C.x, z: HON_C.z + 10 };
  return [
    rest({ dur: 8, say: [['木下藤吉郎', '城は取った！　……じゃが見よ、観音寺の山から松明の列が下りてくる'], ['足軽', '後詰か……！　夜が明けるまでに取り返しに来る気じゃ']] }),
    pick({ title: '観音寺城から六角の後詰が、箕作を取り返しに来る。どうする？',
      options: [{ label: '木戸の外へ打って出て、坂で迎え撃つ', note: '坂の上から叩けば手柄。坂の左右から回り込まれる' }, { label: '城に火をかけ、観音寺の衆に見せつける', note: '箕作が落ちたと見せれば、後詰の足が鈍る。燃える城の前を守る' }],
      on: (rt, m, i) => { m.mkOut = i === 0; rt.say('木下藤吉郎', i === 0 ? '打って出る。坂の上で待ち構えよ！' : '火をかけよ！　観音寺から見えるように、高く燃やせ', 3); if (i === 1) { rt.world.addFire(HON_C.x + 8, HON_C.z - 2, { h: 1.6 }); rt.world.addSmokeColumn(HON_C.x + 8, rt.world.heightAt(HON_C.x, HON_C.z) + 6, HON_C.z - 2, { size: 2.4 }); } } }),
    fight({ skip: (rt, m) => !m.mkOut, at: { x: HON_C.x + 4, z: HON_C.z + 24 }, max: 160, title: '坂の迎え撃ち', sub: '観音寺からの後詰が、夜の坂を上る', obj: '坂で、観音寺からの後詰を崩せ',
      foes: () => [{ name: '観音寺からの後詰', from: { x: 40, z: -40 }, list: [uS(3), uA(14)], mass: 260, noRout: 20 }, gunLine('後詰の鉄砲衆', { x: 36, z: -60 }, { x: HON_C.x + 4, z: HON_C.z + 24 }, 9)],
      later: [{ t: 45, title: '回り込む', sub: '後詰の別手が、坂の下へ回る', say: ['足軽', '下からも来た……！　城へ戻る道を断たれるぞ！'], foes: () => [{ name: '坂の下へ回った後詰', from: { x: -14, z: -40 }, list: [uS(2), uA(10)], mass: 160 }] }],
      reward: (t) => { t.special = { label: '観音寺からの後詰を坂で崩した', pts: 25 }; }, rewardLabel: '観音寺の後詰を崩した' }),
    hold({ skip: (rt, m) => m.mkOut, at: OG, dur: 90, r: 12, title: '燃える箕作', sub: '燃える城を見て、後詰の足が鈍る', label: '木戸の前', obj: '燃える城の木戸の前を守れ',
      waves: [
        { t: 8, say: ['足軽', '後詰の先が来た……じゃが、数は少ない'], foes: () => [{ name: '観音寺からの後詰の先', from: { x: 40, z: -44 }, list: [uS(2), uA(10)], mass: 160 }] },
        { t: 45, say: ['足軽', '鉄砲を撃ちかけてくる！'], foes: () => [gunLine('後詰の鉄砲組', { x: 30, z: -56 }, OG, 7)] },
      ],
      reward: '城に火をかけ、観音寺の後詰を怯ませた', onEnd: (rt, m, won) => { if (won) rt.say('木下藤吉郎', '見よ、観音寺の松明が退いていく……燃える箕作を見て、気が萎えたか', 4); } }),
  ];
}

const nearIt = (b, pre) => {
  const u = b.player.u;
  let it = null, bd = Infinity;
  for (const x of b.interacts) if (x.id.startsWith(pre)) { const d = Math.hypot(x.pos.x - u.pos.x, x.pos.z - u.pos.z); if (d < bd) { bd = d; it = x; } }
  return it ? { it, d: bd } : null;
};
mitsukuri.botBrain = (b, inp, { goTo }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyE');
  if (!u.alive || F.ending) return;
  if (F.dp && F.dp.on) { depthBot(b, inp, goTo); return; }
  if (u.hp < u.maxHp * 0.5) b.botRest = true;
  if (b.botRest && u.hp > u.maxHp * 0.85) b.botRest = false;
  if (b.botRest) { inp.guardHold = false; goTo(p, inp, 4, F.step >= 3 ? NI_C.z + 6 : -10, 2); return; }
  const e = b.army.nearestEnemy(u, 12, (o) => !o.fleeing);
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d > 2.6) inp.k.add('KeyW');
    if (d < 3.2 && Math.random() < 0.5) inp.leftPressed = true;
    inp.guardHold = (b.army.threats || []).length > 0 && Math.random() < 0.85;
    return;
  }
  inp.guardHold = false;
  if (F.step === 2.5) { const q = nearIt(b, 't'); if (q) { if (q.d > 1.6) goTo(p, inp, q.it.pos.x, q.it.pos.z, 1.2); else inp.k.add('KeyE'); } return; }
  if (F.step === 3) { if (F.sally && !gone(F.sally)) { const t = F.sally.center(); goTo(p, inp, t.x, t.z, 2); return; } goTo(p, inp, 3, KIDO.z + 4, 2); return; }
  const tgt = !F.sanFell ? F.C.kuruwa.san.centroid : !F.niFell ? F.C.kuruwa.ni.centroid : F.C.kuruwa.hon.centroid;
  goTo(p, inp, tgt.x, tgt.z, 2);
};

export { mitsukuri };
