// ======================================================================
// 織田家編　箕作城の戦い（永禄十一年九月十二日・夜攻め・縄張り版）
// 足利義昭を奉じて京へ上る信長の道を、南近江の六角義賢・義治がふさいだ。
// 信長は観音寺城の支えの箕作城を攻めさせ、夕方から攻めかかって、夜のうちに落とした。
// 足軽は木下藤吉郎の手。①夕暮れ、夜攻めの松明を灯す ②軍議で道を選び、松明の列を率いて登る
// （castles/mitsukuri.js の縄張り・castle_plan.js・siege_zones.js・siege_ai.js・butai.js を使う。
//  三の郭〔坂の上〕→二の郭〔木戸構え〕→本丸、の区域の取り合い＋城の頭）
// 本丸が落ちた後の段（b_depth.js）：観音寺からの後詰（坂で迎え撃つか、城に火をかけて怯ませるか）
// 坂（三の郭）が落ちた後の段：左右の尾根の伏兵（忍ぶか、松明の道で挟まれるか）→和田山の後詰
// 向き：北（-z）が箕作山の城。北東の奥（+x, -z）に観音寺城のある繖山。南（+z）に織田の陣
// ======================================================================
import { nobori, hut, yagura, tawara, campfire } from './props.js';
import { flagTexture } from './textures.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { moraleWord } from './hud.js';
import { gauss, nm, centerOf, allyGroup, enemyGroup } from './bhelp.js';
import { applyLook, NIGHT, customFlag, dress, gone } from './b_inabayama.js';
import { KIT } from './b_nagashinojo.js';
import { depthStart, depthTick, rest, pick, fight, hold, depthBot } from './b_depth.js';
import { uS, uA, uB, uBu, round, gunLine, lines, camp } from './b_mid.js';
import { heightOf, buildCastlePlan } from './castle_plan.js';
import { sakamogiRow } from './castle_parts.js';
import { makeSiegeZones, zoneWord } from './siege_zones.js';
import { makeGate, updateGates, resetGates } from './siege_gate.js';
import { makeDefenseAI, chooseRoute } from './siege_ai.js';
import { makeButai, butaiTick } from './butai.js';
import { nightAccuracyMult } from './siege_vis.js';
import { demBlend } from './dem.js';
import {
  MITSUKURI_PLAN, SAN_C, NI_C, HON_C, KIDO, NISHI_TANI_X, ROAD_OTE, ROAD_TANI,
} from './castles/mitsukuri.js';

// 束0 の asset_dem_mitsukuri.js がまだ無い時も止まらないように（無ければ base のまま）
let dem = null;
import('./asset_dem_mitsukuri.js').then((m) => { dem = m.default; }).catch(() => {});

const KAN = { x: 130, z: -196 };           // 観音寺城のある繖山
const CAMP = { x: 4, z: 56 };              // 織田の陣
const ROAD = [[0, 150], [CAMP.x, CAMP.z], [2, 10], [0, -40], ...ROAD_OTE.slice(2)];
const TORCH = [{ x: -10, z: 34 }, { x: 6, z: 28 }, { x: 20, z: 36 }];   // 松明の束
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
// 国土地理院の標高（箕作山。束0 の asset_dem_mitsukuri.js）を手書きの base に混ぜる
function baseWithDem(x, z) {
  const b = baseWithKan(x, z);
  return dem ? demBlend(dem, x, z, b, { scale: 0.22, floor: b - 6 }) : b;
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
    time: 'dusk',
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

    // ---- 縄張り（castles/mitsukuri.js）：三の郭・二の郭・本丸。木戸は castle_plan.js に建てさせる ----
    const C = F.C = buildCastlePlan(rt, MITSUKURI_PLAN, { baseHeight: baseWithDem, edgeW: 2.6, buildGates: true, buildTowers: true, team: 1 });
    const sanC = C.kuruwa.san.centroid, niC = C.kuruwa.ni.centroid, honC = C.kuruwa.hon.centroid;
    F.gates = { kido: makeGate(rt, C.gateObjs.kido, { name: KIDO.name, guardTeam: 1 }) };
    // 坂の上（三の郭）に逆茂木を並べる（曲輪そのものは柵を構えていない、開けた段）
    sakamogiRow(rt, [[-14, sanC.z - 2], [14, sanC.z - 2]], { n: 8 });
    rt.scene.add(yagura(W, sanC.x - 9, sanC.z - 8), yagura(W, sanC.x + 10, sanC.z - 8));
    for (const [x, z] of [[-4, sanC.z - 10], [5, sanC.z - 10], [0, niC.z - 8]]) rt.scene.add(nobori(W, x, z, 'rokkaku', 6));
    rt.scene.add(hut(W, honC.x - 6, honC.z - 4, 9, 6, 0.2, { h: 3, wall: 0x6a5238 }), hut(W, honC.x + 7, honC.z, 6, 4, -0.3));
    // ---- 繖山の観音寺城（遠く）：山腹の屋敷と旗 ----
    for (const [x, z, r] of [[92, -150, 0.3], [104, -160, 0.1], [84, -166, -0.2], [112, -176, 0.4]]) rt.scene.add(hut(W, x, z, 10, 6, r, { h: 3.4, wall: 0x7a6a50, roof: 0x3a3430 }));
    for (const [x, z] of [[82, -146], [108, -156]]) rt.scene.add(nobori(W, x, z, 'rokkaku', 7));
    // 観音寺城の篝火（勝つと、一つ、また一つと消えていく）
    F.kanFires = [[90, -146], [100, -152], [110, -160], [84, -162], [96, -170], [116, -172], [106, -182]].map(([x, z]) => W.addFire(x, z, { h: 0.3 }));

    // ---- 守り（箕作城・六角の衆。曲輪ごとに butai.js の部隊。siege_ai.js の城の頭で動かす） ----
    F.sanDef = makeButai(rt, { name: '坂の守り', team: 1, faction: 'imagawa', kind: 'ashigaru', nominal: 420, armor: 0x33291f, flag: RK.flag, at: sanC, facing: Math.PI, real: 14 });
    F.niDef = makeButai(rt, { name: '柵の内の弓（二の郭）', team: 1, faction: 'imagawa', kind: 'bow', nominal: 260, armor: 0x33291f, flag: RK.flag, at: { x: niC.x, z: niC.z + 6 }, facing: Math.PI, real: 10 });
    F.honDef = makeButai(rt, { name: '城将 吉田出雲守の衆', general: '吉田出雲守', team: 1, faction: 'imagawa', kind: 'ashigaru', nominal: 320, armor: 0x33291f, flag: RK.flag, at: honC, facing: Math.PI, real: 14 });
    F.defenders = [F.sanDef, F.niDef, F.honDef];
    F.defendTotal = F.defenders.reduce((s, b) => s + b.nominal, 0);
    F.commander = { alive: true, get real() { return rt.army.units.find((u) => u.alive && u.name === '吉田出雲守'); } };
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
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: CAMP.x + 8, z: CAMP.z + 4 }, Math.PI, [{ kind: 'spear', n }]);

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
    F.rkCamp = camp(rt, { x: KC.x, z: KC.z, facing: Math.atan2(HON_C.x - KC.x, HON_C.z - KC.z), team: 1, faction: 'imagawa', mon: 'rokkaku', armor: 0x33291f, general: { name: '六角義賢', hat: 'kabuto_m', haori: 0x33291f }, guard: 15, reserve: 180, runTo: { x: 60, z: -120 } });

    // ---- 区域の網（siege_zones.js）：三の郭→二の郭（木戸）→本丸 ----
    F.SZ = makeSiegeZones(rt, {
      zones: [
        { id: 'san', name: '三の郭（坂の上）', test: C.kuruwa.san.test, pos: sanC, need: 6, hold: 13, next: 'ni' },
        { id: 'ni', name: '二の郭（木戸構え）', test: C.kuruwa.ni.test, pos: niC, need: 8, hold: 15, gate: KIDO.name, next: 'hon' },
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

    rt.world.setTime('dusk');
    rt.setPhase('brief');
    rt.obj('main', hi(rt) ? '木下藤吉郎の先手の一隊を預かり、夜攻めの下知を待て' : '木下藤吉郎のもとで、夜攻めの下知を待て', 'main');
    rt.say('木下藤吉郎', `${nm(rt)}、見よ。あれが六角の箕作城、奥の山が観音寺城じゃ。申の刻から攻めておるが、まだ落ちぬ`, 5);
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
    rt.say('木下藤吉郎', '日が暮れても退かぬ。松明を灯して、夜のうちに攻め上るぞ', 4);
    rt.marker('kino', F.kinoU.pos, '木下藤吉郎（話を聞く）', {});
    rt.addInteract('talk', { x: CAMP.x, z: CAMP.z - 6 }, '藤吉郎の話を聞く', () => { rt.uninteract('talk'); rt.say('木下藤吉郎', 'よし、松明の支度じゃ', 2); rt.after(2, () => this.torches(rt)); }, { r: 5 });
    rt.after(14, () => this.torches(rt));
  },

  // ① 松明を灯す
  torches(rt) {
    const F = rt.flags;
    if (F.step >= 1) return;
    F.step = 1; F.stepT = rt.t;
    rt.setPhase('torch');
    rt.unmark('kino'); rt.uninteract('talk');
    rt.obj('main', rt.G.lord ? `松明に火を移させ、夜攻めの支度を整えよ（${TORCH.length}つ）` : `松明の束に火を移せ（${TORCH.length}つ）`, 'main');
    rt.say('木下藤吉郎', '松明の束に火を移せ！　一人一本ずつ持たせるのじゃ', 3.5);
    rt.after(10, () => { if (F.step === 1) applyLook(rt, MID); });
    if (rt.G.lord) { TORCH.forEach((t, i) => rt.after(4 + i * 3, () => { if (rt.flags.step === 1) this.light(rt, i); })); return; }
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
    if (F.lit >= TORCH.length) this.climb(rt);
    else rt.objProgress('main', `${F.lit}／${TORCH.length}`);
  },

  // ② 軍議で選んだ道（無ければ攻めの頭が自分で選ぶ）で、松明の列を率いて山を登る
  climb(rt) {
    const F = rt.flags;
    if (F.step >= 2) return;
    F.step = 2; F.stepT = rt.t;
    rt.setPhase('climb');
    for (let i = 0; i < TORCH.length; i++) { rt.uninteract('t' + i); rt.unmark('t' + i); }
    applyLook(rt, NIGHT);
    // 夜攻め：柵の内の弓は闇の中でねらいが鈍る（siege_vis.js）
    if (F.niDef.real) F.niDef.real.dmgMult = (F.niDef.real.dmgMult || 1) * nightAccuracyMult(rt.world);
    sfx('horagai', 1); rt.after(1, () => sfx('taiko', 1));
    rt.banner('夜攻め', '松明の列が、箕作山を登っていく');
    nextObj(rt, hi(rt) ? '一隊を率いて松明の列の先に立ち、坂の守りを退けよ' : '松明の列について山を登り、坂の守りを退けよ');
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
    for (let k = 0; k < 3; k++) rt.after(4 + k * 5, () => { const z = 10 - k * 20; rt.world.addFire(k % 2 ? 10 : -10, z, { torch: true, h: 1.6 }); });
  },

  // 軍議の作戦：①大手の夜攻め（正面から三の郭へ） ②谷から松明で回る（三の郭の守りを避け、二の郭の脇へ）
  runStrategy(rt, strat) {
    const F = rt.flags;
    if (strat === 'tani') {
      rt.say('木下藤吉郎', '西の谷から回る。松明は低く構えよ、気取られるな', 4);
      routeOld(F.kino, ROAD_TANI.slice(1));
      routeOld(F.niwa, ROAD_TANI.slice(1));
      routeOld(F.saku, [...ROAD_OTE.slice(2, 4)]);   // 大手は小さく構えて引きつけるだけ
      routeOld(F.ram, ROAD_TANI.slice(1));
      // 谷を忍ぶ道なので、三の郭の守りは松明の大軍ほど気付けない（出撃が遅れる＝士気の下がりを緩める）
      F.sanDef.morale = Math.min(100, F.sanDef.morale + 10);
    } else {
      rt.say('木下藤吉郎', 'かかれ！　松明を高く掲げよ。城の者に、山じゅうが織田じゃと思わせるのじゃ', 4);
      routeOld(F.kino, ROAD_OTE.slice(2));
      routeOld(F.niwa, [[-16, -36], ...ROAD_OTE.slice(3)]);
      routeOld(F.saku, [[16, -36], ...ROAD_OTE.slice(3)]);
      routeOld(F.ram, ROAD_OTE.slice(2));
    }
    // 坂の守りへ鉄砲を撃ちかける組（永禄のころなので四挺だけ）
    F.gunK = allyGroup(rt, { name: '藤吉郎の鉄砲組', anchor: { x: CAMP.x + 4, z: CAMP.z - 10 }, facing: Math.PI, width: 8, aggro: 4, noRout: true }, dress([{ type: 'gun', n: 4 }], ODA));
    routeOld(F.gunK, [[6, -34]]);
  },

  // 区域が落ちた（siege_zones.js の onFall）
  onZoneFall(rt, id) {
    const F = rt.flags;
    if (id === 'san' && !F.sanFell) {
      F.sanFell = true;
      rt.unmark('san');
      rt.award((t) => t.side.push('坂の守りを退けた'), '坂の守りを退けた');
      depthStart(rt, mkCtx(rt), mkA(), () => this.gateFight(rt));
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
  // 木戸の内（二の郭が落ちた直後の演出）
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
    rt.banner('箕作城、落ちる', '夜のうちに、六角父子は観音寺城を捨てて甲賀へ落ちた');
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
    if (F.SZ) F.SZ.tick(dt);
    if (F.DA) F.DA.tick(dt);
    if (F.step === 1 && rt.t - F.stepT > 45) {
      for (let i = 0; i < TORCH.length; i++) if (rt.interacts.some((q) => q.id === 't' + i)) { rt.uninteract('t' + i); rt.unmark('t' + i); rt.world.addFire(TORCH[i].x, TORCH[i].z, { torch: true, h: 0.9 }); }
      this.climb(rt);
    }
    if (F.step >= 2) {
      const st = F.SZ ? F.SZ.stat() : {};
      if (!F.niFell) rt.objProgress('main', `三の郭・${zoneWord(st.san)}／二の郭・${zoneWord(st.ni)}`);
      else if (!F.honFell) rt.objProgress('main', `本丸・${zoneWord(st.hon)}`);
      // 保険：時をかけすぎたら決着させる（遊んで 4〜7 分の目安）
      if (!F.honFell && rt.t - F.stepT > 300) { for (const b of F.defenders) b.morale = Math.min(b.morale, 20); }
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
    if (g.team !== 1 || !g.name) return;
    rt.say('足軽', `${g.name}が闇の中へ退いていく！`, 2.5);
  },
};

// 両軍の総勢（上洛の織田勢 五万ほど、箕作城の六角勢 三千ほど。数には諸説ある）
mitsukuri.force = (rt) => {
  const F = rt.flags;
  return { a: Math.round(50000 - (F.ak || 0) * 40), a0: 50000, b: Math.max(0, 3000 - (F.ek || 0) * 40), b0: 3000 };
};
mitsukuri.sides = { a: { name: '織田軍', mon: 'oda' }, b: { name: '六角軍', mon: 'rokkaku' } };
mitsukuri.famous = [
  { name: '建部秀明', g: /坂の守り|二の郭|打って出た/, loose: 1, line: '六角家の建部秀明なり！　箕作は一夜では落ちぬぞ！' },
];
mitsukuri.date = (rt) => `永禄十一年九月十二日　秋・晴・${rt.flags.step >= 2 ? '夜' : '夕暮れ'}`;
mitsukuri.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '夜攻めの下知まで待つ' : '');
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
      { name: '二の郭', x: NI_C.x, z: NI_C.z }, { name: '本丸', x: HON_C.x, z: HON_C.z },
      { name: '西の谷', x: NISHI_TANI_X, z: -36 },
    ],
    lines: [
      { name: '三の郭', owner: '敵' }, { name: '二の郭', owner: '敵' }, { name: '本丸', owner: '敵' },
    ],
    units: [{ id: 'main', name: '木下藤吉郎の手（全軍）', group: () => F.kino }],
    routes: [
      { id: 'ote', name: '大手から松明を掲げて夜攻め' },
      { id: 'tani', name: '西の谷から松明を消して回る' },
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
    rest({ dur: 6, heal: 0.25, say: [['伝令', '申し上げます！　西の和田山城から、六角の後詰が松明を消して下りてまいります！']] }),
    pick({ title: '和田山城から六角の後詰が下りてくる。どうする？',
      options: [{ label: '西の麓へ回り、後詰の頭を叩く', note: '木戸攻めの背が安くなる。木戸へ着くのが遅れる' }, { label: '構わず、木戸へ急ぐ', note: '木戸を早く破れる。木戸攻めの最中に背へ回られる' }],
      on: (rt, m, i) => { m.mkLetBack = i === 1; rt.say('木下藤吉郎', i === 0 ? '西へ回れ！　麓の田の畦で待ち受けよ。道が狭い所で頭を叩けば、後ろは続けぬ' : 'よし、木戸じゃ！　背には気を配っておけ', 3.5); } }),
    fight({ skip: (rt, m) => m.mkLetBack, at: { x: -30, z: -22 }, max: 150, title: '和田山の後詰', sub: '麓の細い道で、後詰の頭を叩く',
      obj: (rt) => (hi(rt) ? '預かった一隊で麓の道を塞ぎ、和田山の後詰を崩せ' : '麓の道で、和田山の後詰を崩せ'),
      say: [['木下藤吉郎', '道は細い。先頭の侍を倒せば、後ろの足軽は続かぬぞ', 4]],
      foes: () => [{ name: '和田山からの後詰', from: { x: -66, z: -44 }, list: [uS(2), uA(14)], mass: 240, noRout: 20 }],
      later: [{ t: 40, title: '後詰の二の手', sub: '和田山の弓が、田の向こうから射かける', say: ['足軽', '二の手じゃ！　弓を連れておる！'], foes: () => [{ name: '和田山の二の手', from: { x: -70, z: -30 }, list: [uS(1), uA(10), uB(4)], mass: 180 }] }],
      reward: (t) => { t.special = { label: '和田山の後詰を麓で止めた', pts: 15 }; }, rewardLabel: '和田山の後詰を止めた',
      onEnd: (rt, m, won) => { if (won) rt.say('木下藤吉郎', 'これで背は安い。木戸へ戻れ！', 3); } }),
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
    rest({ dur: 6, heal: 0.3, say: [['足軽', '観音寺の山で、松明が右へ左へ乱れておる……'], ['木下藤吉郎', '六角父子が城を捨てる支度か。殿の兵が麓に残っておるぞ']] }),
    pick({ title: '六角父子が観音寺城を捨てて落ちる構え。麓に殿（しんがり）が残る。どうする？',
      options: [{ label: '繖山の麓へ追い討ちをかける', note: '殿を崩せば大手柄。暗い山道で、横から鉄砲を受ける' }, { label: '箕作を固め、夜明けを待つ', note: '取った城を失わない。夜討ちの取り返しを受け止める' }],
      on: (rt, m, i) => { m.mkChase = i === 0; rt.say('木下藤吉郎', i === 0 ? '追え！　殿を崩せば、観音寺は戦わずに開くぞ' : 'よし、木戸の前で槍を揃えよ。取った城は渡さぬ', 3.5); } }),
    fight({ skip: (rt, m) => !m.mkChase, at: { x: 50, z: -112 }, max: 160, title: '追い討ち', sub: '繖山の麓で、六角の殿とぶつかる',
      obj: (rt) => (hi(rt) ? '預かった一隊を率い、繖山の麓で六角の殿を崩せ' : '繖山の麓で、六角の殿を崩せ'),
      say: [['木下藤吉郎', '殿の侍大将を狙え。頭が倒れれば、殿は散る', 4]],
      foes: () => [{ name: '六角の殿', from: { x: 72, z: -126 }, list: [uBu('六角の殿の侍大将', { hat: 'kabuto_m', haori: 0x33291f }), uS(3), uA(14)], mass: 260, noRout: 25 }],
      later: [{ t: 35, title: '横から鉄砲', sub: '山腹の鉄砲衆が、追う者の横を撃つ', say: ['足軽', '山腹から鉄砲じゃ！　伏せよ！'], foes: () => [gunLine('山腹の六角の鉄砲衆', { x: 82, z: -100 }, { x: 50, z: -112 }, 8)] },
        { t: 70, say: ['足軽', '観音寺の旗本が下りてきた！　これが最後の手じゃ'], foes: () => [{ name: '六角の旗本', from: { x: 84, z: -136 }, list: [uS(3), uA(10)], mass: 200 }] }],
      reward: (t) => { t.special = { label: '六角の殿を追い崩した', pts: 25 }; }, rewardLabel: '六角の殿を崩した' }),
    hold({ skip: (rt, m) => m.mkChase, at: OG, dur: 85, r: 12, title: '夜明けを待つ', sub: '取り返しに来る六角の夜討ちを受け止める', label: '木戸の前',
      obj: (rt) => (hi(rt) ? '預かった一手で木戸の前を固め、夜明けまで箕作を守れ' : '木戸の前で、夜明けまで箕作を守れ'),
      waves: [
        { t: 8, say: ['足軽', '西の尾根から、夜討ちじゃ！'], foes: () => [{ name: '夜討ちの六角勢', from: { x: -30, z: -118 }, list: [uS(2), uA(12)], mass: 200 }] },
        { t: 40, say: ['足軽', '東からも来る！　松明を投げ込む気じゃ'], foes: () => [{ name: '東の夜討ち', from: { x: 34, z: -120 }, list: [uS(2), uA(10), uB(3)], mass: 180 }] },
      ],
      reward: '夜明けまで箕作を守りぬいた' }),
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
  if (F.step === 1) { const q = nearIt(b, 't'); if (q) { if (q.d > 1.6) goTo(p, inp, q.it.pos.x, q.it.pos.z, 1.2); else inp.k.add('KeyE'); } return; }
  if (F.step === 3) { if (F.sally && !gone(F.sally)) { const t = F.sally.center(); goTo(p, inp, t.x, t.z, 2); return; } goTo(p, inp, 3, KIDO.z + 4, 2); return; }
  const tgt = !F.sanFell ? F.C.kuruwa.san.centroid : !F.niFell ? F.C.kuruwa.ni.centroid : F.C.kuruwa.hon.centroid;
  goTo(p, inp, tgt.x, tgt.z, 2);
};

export { mitsukuri };
