import { HISTORICAL_GENERALS } from './b_historical_generals.js';
// ======================================================================
// 信長包囲網　姉川の戦い（元亀元年六月二十八日）
// 近江の姉川を挟んで、南に織田・徳川、北に浅井・朝倉。西の瀬では徳川が朝倉に、東では織田が浅井に当たる。
// 足軽は織田の備（森可成の手）の中に立つ。浅井の磯野員昌が川を渡って織田の段を次々に破って来る。
// ①幾重もの備を抜く磯野の先手を受ける ②東の回り込みを読み、先に備える ③横から押し返す ④川を渡って追う
// 向き：北が -z。川は x の向きに流れ、z ≒ 0。西（-x）が徳川と朝倉、東が織田と浅井
// ======================================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { nobori, jinmaku, tawara, hut, dorui, kabukimon } from './props.js';
import { flagTexture } from './textures.js';
import { stoneTex } from './nature.js';
import { RANKS } from './state.js';
import { buildHorse } from './units.js';
import { sfx } from './audio.js';
import { moraleWord } from './hud.js';
import { gauss, enemyGroup, allyGroup, nm, centerOf, unitPos, guardRecover, hpBarSystem, strengthBanner } from './bhelp.js';
import { KIT, volley } from './b_nagashinojo.js';
import { clash } from './b_sekigahara.js';
import { depthStart, depthTick, rest, pick, fight, hold, depthBot } from './b_depth.js';
import { camp, campDepth } from './b_mid.js';
import { demRelief } from './dem.js';
import { jinchiTick } from "./yasen_jinchi.js";
let aneDem = null;
import('./asset_dem_anegawa.js').then((m) => { aneDem = m.default; }).catch(() => {});

// 布陣図の座標を八分の一に縮め、両軍の本陣と西南の別手を地面の範囲に収める。川の原点と南北の向きはそのまま。
const ANE = [[-180, 8], [-120, -2], [-60, 5], [0, -1], [60, 4], [120, -3], [180, 5]];   // 姉川
const MORI = { x: -50 / 8, z: 570 / 8 };     // 森可成の備（自分の持ち場）
const HQ = { x: -100 / 8, z: 830 / 8 };     // 信長の本陣（陣杭の柳）
const DEM_RELIEF = { xy: 4, cx: 0, cz: 30, inner: 130, fade: 50, scale: 0.22, ax: 0.9 };
const BANK_N = -8;                 // これより北は向こう岸
const MITAMURA = { x: -860 / 8, z: -220 / 8 };   // 朝倉景健の本陣：三田村氏館（土塁・溝・屋敷・門の中世の館。天守にしない）

// 三田村氏館の溝（水堀）の輪：土塁のすぐ外を浅く掘り下げる。0〜1（1 が溝の底）
function mitamuraMoat(x, z) {
  const hw = 19.5, hd = 15.5, dx = Math.abs(x - MITAMURA.x), dz = Math.abs(z - MITAMURA.z);
  if (dx > hw + 2.5 || dz > hd + 2.5) return 0;
  const edge = Math.max(dx - hw, dz - hd);
  if (edge < -1) return 0;   // 土塁の内側
  return Math.max(0, 1 - Math.abs(edge) / 2.2);
}

// 三田村氏館：土塁の四辺＋門＋屋敷。溝（水堀）は周りの地形を少し掘り下げて見せる（height/tint で使う）
function mitamuraYakata(rt) {
  const W = rt.world;
  const cx = MITAMURA.x, cz = MITAMURA.z, hw = 17, hd = 13;
  const seg = [[cx - hw, cz - hd, cx + hw, cz - hd], [cx + hw, cz - hd, cx + hw, cz + hd], [cx + hw, cz + hd, cx - hw, cz + hd], [cx - hw, cz + hd, cx - hw, cz - hd]];
  const nrm = [[0, 1], [-1, 0], [0, -1], [1, 0]];
  for (let i = 0; i < seg.length; i++) if (i !== 2) W.scene.add(dorui(W, seg[i], nrm[i][0], nrm[i][1], { w: 2.6, h: 1.1 }));   // 南辺は門の分あけておく
  for (const [ax, az, bx, bz] of [[cx - hw, cz + hd, cx - 3, cz + hd], [cx + 3, cz + hd, cx + hw, cz + hd]]) W.scene.add(dorui(W, [ax, az, bx, bz], 0, 1, { w: 2.6, h: 1.1 }));
  W.scene.add(kabukimon(W, cx, cz + hd, 5.2, 0));
  W.scene.add(hut(W, cx, cz - 2, 13, 9, Math.PI, { wall: 0x6a5a44 }));
  W.scene.add(hut(W, cx - 10, cz + 4, 6, 5, Math.PI * 0.5, { wall: 0x6a5a44 }));
}

// 浅井・朝倉の兵の見た目（家ごとに甲冑の色と旗を変える）
const AZAI = { armor: 0x2e2a26, lace: 0x3c5a48, flag: 'azai' };
const ASAKURA = { armor: 0x33291f, lace: 0x7a5a2a, flag: 'asakura' };
const INABA = { flag: 'inaba', armor: 0x33302a, lace: 0x5a4a2a };   // 稲葉一鉄ら西美濃の衆は、もと斎藤の家臣
const dress = (list, lk) => list.map((s) => ({ ...s, o: { ...lk, ...(s.o || {}) } }));
const TK_ARMOR = 0x24221f;
const gone = (g) => !g || g.count === 0 || g.routed;

// 川原の石（見た目だけ）：川の両岸の帯に、大小の丸い石を散らす
function kawara(W) {
  const parts = [];
  let s = 70;
  const R = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < 420; i++) {
    const x = -170 + R() * 340;
    let zc = 0;
    for (let k = 0; k < ANE.length - 1; k++) { const [ax, az] = ANE[k], [bx, bz] = ANE[k + 1]; if (x >= ax && x <= bx) zc = az + (bz - az) * (x - ax) / (bx - ax); }
    const z = zc + (R() < 0.5 ? -1 : 1) * (3.2 + R() * 7);
    const r = 0.12 + R() * R() * 0.45;
    // 角の立った十二面体のままだと、低い目線で近くに来た時に白い多面体の塊に見えた（10/2）。一段細かくして角を崩し、石の絵を貼る
    const g = new THREE.DodecahedronGeometry(r, 1);
    { const P = g.attributes.position, ph = R() * 50; for (let q = 0; q < P.count; q++) { const X = P.getX(q), Y = P.getY(q), Z = P.getZ(q); const h = Math.sin((X * 12.9898 + Y * 78.233 + Z * 37.719) / r + ph) * 43758.5453; const k = 0.84 + (h - Math.floor(h)) * 0.26; P.setXYZ(q, X * k, Y * k, Z * k); } }   // 同じ角は同じだけ（面の間に隙間を作らない）
    g.scale(1.2, 0.5, 1);
    g.rotateY(R() * 6);
    g.translate(x, W.heightAt(x, z) + r * 0.2, z);
    const c = new THREE.Color().setHSL(0.09, 0.08, 0.5 + R() * 0.25);
    const gg = g.toNonIndexed();
    const col = new Float32Array(gg.attributes.position.count * 3);
    for (let q = 0; q < col.length; q += 3) { col[q] = c.r; col[q + 1] = c.g; col[q + 2] = c.b; }
    gg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    parts.push(gg);
  }
  const geo = mergeGeometries(parts); geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, map: stoneTex() }));
  m.receiveShadow = true;
  return m;
}

const anegawa = {
  softOpen: 60,   // 立ち上がり 60 秒は、受ける傷を半分に（A079）
  spawn: { x: MORI.x, z: MORI.z + 5, heading: Math.PI },
  // 重さ対策（kaito 10/1、原因を測って直す）：姉川は西・中・東の三方で大軍がぶつかり、本物の兵（写実の人）が同時に一番増える戦。
  // wakeRoom で本物の兵の上限を少し控えめに、humQ で写実の人へ替える数の上限を少し控えめにする（近さ・質はそのまま。見た目は大きく変えない）
  wakeRoom: 190,
  humQ: { max: 56, mustMax: 72 },
  world: {
    seed: 70,
    wind: [0.6, -0.8],   // 南東からの夏の風
    time: 'day',
    mood: 'morning',     // 卯の刻（早朝）に始まった戦：川面に朝の靄
    mist: true,          // 初めの朝靄は、今ある仕組みでしだいに晴れる
    muddy: 0.2,
    waterSlow: true,   // 姉川を渡る間は遅く、馬は岸へ上がる時に弱る（terrain_tags.js の 'water'）
    paths: [[[HQ.x, HQ.z], [MORI.x, MORI.z], [-30 / 8, 480 / 8], [10 / 8, 260 / 8], [30 / 8, 160 / 8], [10, 4]], [[-1030 / 8, 700 / 8], [-1000 / 8, 560 / 8], [-960 / 8, 360 / 8], [-110, 4]]],
    height(x, z) {
      let h = 0.5 * Math.sin(x * 0.03) * Math.cos(z * 0.025) + 0.3 * Math.sin(z * 0.05 + x * 0.02);
      // 北の山並み（小谷山・大依山）と、南東の横山（横山城）、信長の陣杭の柳
      h += Math.max(0, -z - 115) * 0.3 + 26 * gauss(x, z, 70, -175, 1800) + 12 * gauss(x, z, -40, -150, 1600);
      h += 16 * gauss(x, z, 600 / 8, 1560 / 8, 1500) + 5 * gauss(x, z, HQ.x, HQ.z + 8, 900);
      // 三田村氏館の溝（水堀）：館の縁をひと回り、浅く掘り下げる
      const mr = mitamuraMoat(x, z); if (mr > 0) h -= 0.7 * mr;
      // 国土地理院の標高：戦場（清めた所）の外の遠い丘にだけ、実際の起伏を足す（ゲームの 1 を実の 4m に縮める）
      if (aneDem) h += demRelief(aneDem, x, z, DEM_RELIEF);
      return h;
    },
    tint(x, z, h, c) {
      // 川原の石と砂
      let d = Infinity;
      for (let i = 0; i < ANE.length - 1; i++) {
        const [ax, az] = ANE[i], [bx, bz] = ANE[i + 1];
        if (x >= ax && x <= bx) d = Math.abs(z - (az + (bz - az) * (x - ax) / (bx - ax)));
      }
      if (d < 11) { const k = 1 - d / 11; c.setRGB(c.r * (1 - 0.5 * k) + 0.28 * k, c.g * (1 - 0.5 * k) + 0.26 * k, c.b * (1 - 0.5 * k) + 0.22 * k); }
      // 三田村氏館の溝：水を張った暗い色に
      const mr = mitamuraMoat(x, z); if (mr > 0.3) c.setRGB(c.r * 0.3, c.g * 0.32, c.b * 0.3);
    },
    clear: (x, z) => x > -170 && x < 100 && z > -110 && z < 120,
    paddy(x, z) {
      if (z < 50 || z > 128 || x < -30 || x > 100) return 0;
      if (Math.abs(x - 30) < 5) return 0;
      if ((Math.floor(x / 12) + Math.floor(z / 15)) % 3 === 0) return 0;
      const ex = Math.min(((x % 12) + 12) % 12, 12 - ((x % 12) + 12) % 12), ez = Math.min(((z % 15) + 15) % 15, 15 - ((z % 15) + 15) % 15);
      return Math.max(0, Math.min(1, (Math.min(ex, ez) - 0.8) / 0.6));
    },
    streams: [{ pts: ANE, w: 9, depth: 1.1 }],   // 川は飾りでない：開戦の視界にも見える幅（A080）
    trees: 230,   // 重さ対策：姉川は大軍の描く数が多いので、木は控えめに（kaito 10/1）
    tufts: 2600,
    treeDensity: (x, z) => (z < -80 || z > 130 || Math.abs(x) > 120 ? 1 : 0.25),
    groves: [{ x: -60, z: 60, r: 12, n: 18 }, { x: 90, z: 40, r: 12, n: 16 }, { x: -30, z: -60, r: 14, n: 22 }, { x: 80, z: -50, r: 12, n: 18 }],
  },

  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    // 信長公記巻三は渡河・押し合い・追撃を記す。磯野の突破、段の並び、個別の横槍と別手の進路は遊びの補い。
    F.hist = { river: 'HIST_A', honjinOda: 'HIST_A', honjinAsai: 'HIST_A', mitamura: 'HIST_B', isoAttack: 'GAME_C', tokugawaFlank: 'GAME_C', inabaFlank: 'GAME_C', quietFlank: 'GAME_C', gravel: 'GAME_C', linkedFronts: 'GAME_C' };
    F.step = 0; F.breach = 0; F.holdAt = { ...MORI };
    F.guardRecovery = { line: ['森可成', '手負いは後ろへ下がれ。槍の列を空けるな'], backLine: ['森可成', '槍の列へ戻るぞ'] };
    F.hpBars = hpBarSystem(rt);
    strengthBanner(rt, 28000, 13000);
    // ---- 味方：織田の段。前に坂井政尚の一段、その後ろに森可成の備（自分の持ち場） ----
    F.sakai = allyGroup(rt, { faction: 'oda', name: '坂井政尚の段', anchor: { x: 30 / 8, z: 160 / 8 }, facing: Math.PI, width: 14, aggro: 7, morale: 70, dmgMult: 0.7, fleeDir: { x: 0.1, z: 1 } },
      [{ type: 'samurai', n: 1, o: { name: '坂井政尚', hat: 'kabuto_m', haori: 0x3a3a44 } }, { type: 'ashigaru', n: 8 }, { type: 'gun', n: 3 }]);
    const mori = allyGroup(rt, { faction: 'oda', name: '森可成の備', anchor: { ...MORI }, facing: Math.PI, width: 16, aggro: 7, noRout: true, formation: 'yari', order: 'hold' },
      [{ type: 'samurai', n: 1, o: { name: '森可成', invuln: true, horse: true, hat: 'kabuto_w', haori: 0x2e2e38 } }, { type: 'ashigaru', n: 13 }]);
    F.mori = mori; F.moriU = mori.units[0]; F.mori0 = mori.count;
    mori.defMult = 1.5; mori.dmgMult = 0.8;
    // 段は縦に重ねる：坂井 → 池田 → 森（磯野が一段ずつ破って来る）
    F.ikeda = allyGroup(rt, { faction: 'oda', name: '池田恒興の段', anchor: { x: 10 / 8, z: 260 / 8 }, facing: Math.PI, width: 12, aggro: 7, morale: 80, formation: 'yari', order: 'hold', fleeDir: { x: -0.3, z: 1 } },
      [{ type: 'samurai', n: 1, o: { name: '池田恒興', hat: 'kabuto_m', haori: 0x4a2a22 } }, { type: 'ashigaru', n: 9 }]);
    F.ikeda.defMult = 1.3; F.ikeda.dmgMult = 0.75;
    // 木下藤吉郎は横山城の押さえに回っている（城下の話と同じ）。森の備の後ろは佐久間信盛の段
    F.kino = allyGroup(rt, { faction: 'oda', name: '佐久間信盛の段', anchor: { x: -80 / 8, z: 680 / 8 }, facing: Math.PI, width: 12, aggro: 7, noRout: true, formation: 'yari', order: 'hold' },
      [{ type: 'samurai', n: 1, o: { name: '佐久間信盛', hat: 'kabuto_m', haori: 0x4a3a2a } }, { type: 'ashigaru', n: 7 }, { type: 'bow', n: 2 }]);
    F.kino.defMult = 1.3; F.kino.dmgMult = 0.75;
    // 森の備の鉄砲（元亀のころは数が少ない）：磯野が川の中ほどまで来たら一斉に放つ（kaito 0929）
    F.guns = [allyGroup(rt, { faction: 'oda', name: '森の備の鉄砲', anchor: { x: 14, z: 26 }, facing: Math.PI, width: 10, spacing: 1.6, aggro: 30, noRout: true, holdFire: true, dmgMult: 0.8 },
      [{ type: 'gun', n: 6 }])];
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: MORI.x + 3, z: MORI.z + 5 }, Math.PI, [{ kind: 'spear', n }]);

    // ---- 陣と旗 ----
    // 信長の本陣（陣杭の柳）：陣幕の内に床几の大将と諸将、後ろに馬印と旗本
    F.hqCamp = camp(rt, { x: HQ.x, z: HQ.z, facing: Math.PI, team: 0, faction: 'oda', mon: 'oda', general: { name: '織田信長' }, guard: 15, reserve: 220, runTo: { x: MORI.x, z: MORI.z + 20 } });
    rt.scene.add(nobori(W, HQ.x - 12, HQ.z + 4, 'eiraku', 7));
    for (const [x, z] of [[8, 38], [34, 38], [-14, 36], [56, 36], [16, 18], [28, 18]]) rt.scene.add(nobori(W, x, z, z < 25 ? 'oda' : (x > 40 ? 'eiraku' : 'oda'), 5));
    rt.scene.add(tawara(W, 30, 60, 0.3, 5), hut(W, 60, 96, 7, 5, 0.2));
    // 向こう岸の浅井の旗
    for (const [x, z] of [[4, -30], [26, -34], [44, -28], [60, -40]]) rt.scene.add(nobori(W, x, z, 'azai', 5.5));
    for (const [x, z] of [[-98, -18], [-112, -22], [-126, -18]]) rt.scene.add(nobori(W, x, z, 'asakura', 5.5));
    mitamuraYakata(rt);
    for (const [x, z] of [[MITAMURA.x - 18, MITAMURA.z - 2], [MITAMURA.x + 20, MITAMURA.z + 10]]) rt.scene.add(nobori(W, x, z, 'asakura', 5));
    // 遠景の村（川の南の田の中）
    KIT.farVillage(rt, -80, 112, { rot: Math.PI, n: 6, fields: 10, seed: 41 });

    // ---- 大軍（軽い作り）：織田は十三段、徳川は西の瀬、北に浅井と朝倉 ----
    const DA = (x, z, w, d, count, facing, armor, flag, seed, kind) => {
      const m = KIT.farHost(rt, x, z, w, d, count, facing, armor, flag, seed, kind);
      return { m, x0: x, z0: z, x, z };
    };
    const OD = 0x2b3140, TK = 0x24221f;
    // 織田の段ごとに具足の色を少しずつ変える（十三段の厚み。家ごとに揃えた色）
    const ODS = [0x2b3140, 0x2e2a26, 0x303436, 0x3a2e28, 0x282c34, 0x34302a, 0x2a2e2a];
    // 織田の段：森の備の後ろに幾重にも（柴田・佐久間・丹羽…と続く）。本陣へ通じる真ん中の道は空けておく（兵が通る）
    [[-26, 60, 'oda', 'gun'], [18, 60, 'oda', 'spear'], [-32, 85, 'oda', 'spear'], [12, 85, 'oda', 'mixed'], [-12, 100, 'eiraku', 'cavalry'], [-40, 100, 'oda', 'spear'], [16, 100, 'oda', 'spear']]
      .forEach(([x, z, f, kind], i) => {
        const q = DA(x, z, 26, kind === 'gun' ? 6 : 12, kind === 'cavalry' ? 68 : 105, Math.PI, ODS[i % ODS.length], f, 11 + i, kind);
        if (i < 2) { q.m.army.noWake = true; (F.odaLayers || (F.odaLayers = [])).push(q); }
      });
    // 森可成の備の本隊（見た目だけ）：自分の組はその一番前
    DA(MORI.x, MORI.z + 16, 22, 8, 75, Math.PI, 0x2e2a26, 'oda', 19, 'spear');
    // 川原の石：川の両岸に丸い石が出ている
    rt.scene.add(kawara(W));
    // 地名の目印：野村（織田と浅井が当たる東の岸）・三田村（朝倉の本陣の館）
    rt.marker('nomura', { x: 58, z: 6 }, '野村', { h: 3 });
    rt.marker('mitamura', { x: MITAMURA.x, z: MITAMURA.z - 14 }, '三田村', { h: 5 });
    // 横山城を囲む織田の兵
    DA(510 / 8, 1350 / 8, 30, 10, 100, 0.9, OD, 'oda', 21, 'spear');
    // 徳川：西の瀬で朝倉と向き合う。奥に家康の本陣
    F.tk = [DA(-960 / 8, 360 / 8, 40, 16, 160, Math.PI, TK, 'tokugawa', 31, 'mixed'), camp(rt, { x: -1030 / 8, z: 700 / 8, facing: Math.PI, team: 0, faction: 'tokugawa', mon: 'tokugawa', general: { name: '徳川家康' }, guard: 15, reserve: 200, runTo: { x: -960 / 8, z: 360 / 8 } })];
    // 榊原康政の別手（のちに朝倉の横を突く）：家康の西南から北の瀬へ向いて控える
    F.sakaki = DA(-1220 / 8, 790 / 8, 18, 10, 85, Math.PI, TK, 'tokugawa', 33, 'cavalry');
    // 朝倉：西の対岸、浅井：北の対岸と大依山（長政の本陣）
    F.akDA = [DA(-880 / 8, -90 / 8, 44, 18, 185, 0, ASAKURA.armor, 'asakura', 41, 'mixed'), DA(MITAMURA.x, MITAMURA.z, 30, 20, 110, 0, ASAKURA.armor, 'asakura', 42, 'honjin')];
    F.akDA[1].m.army.lord = '朝倉景健';   // 本陣へ寄れば旗本が迎え撃つ（b_nagashinojo.js の wake）
    F.azDA = [DA(120 / 8, -340 / 8, 50, 16, 160, 0, AZAI.armor, 'azai', 51, 'spear'), DA(150 / 8, -690 / 8, 30, 24, 125, 0, AZAI.armor, 'azai', 52, 'honjin'), DA(140 / 8, -560 / 8, 30, 14, 100, 0, AZAI.armor, 'azai', 53, 'cavalry')]
    F.azDA[1].m.army.lord = '浅井長政';
    campDepth(rt, { x: 150 / 8, z: -690 / 8, facing: 0, mon: 'azai', armor: AZAI.armor, label: '浅井長政の本陣' });
    // ---- 大軍どうしの合戦（軽い作り・world.addClash）：川の中で組み合う。西の瀬は徳川と朝倉、森の備の左右は織田と浅井 ----
    // 織田と浅井の前線の、森の備に近い端は、本物の兵の押し引きにつながる（link）
    const side = (flag, armor, count, team, faction, x = {}) => ({ flag, armor, count, team, faction, ...x });
    const front = { x: 0, z: 0 };
    let frontT = -1, frontValid = false;
    const realFront = () => {
      // 左右の前線から同じコマに呼ばれるので、隊の中心は一度だけ拾う。
      if (frontT === rt.world.time) return frontValid ? front : null;
      frontT = rt.world.time; frontValid = false;
      if (F.step !== 1 || !F.mori.count) return null;
      const e = !gone(F.iso) ? F.iso : !gone(F.third) ? F.third : !gone(F.second) ? F.second : null;
      if (!e) return null;
      const c = e.center(); front.x = c.x; front.z = (c.z + F.mori.center().z) / 2;
      frontValid = true;
      return front;
    };
    // 自分の持ち場（30m ほど）では、味方は軽い兵のまま後ろに留め、敵を多めに本物へ替える（前が敵の塊に見えるように。kaito 0930）
    const WK = { allyWake: 0.3, foeWake: 1.8 };
    F.clash = [
      // 正面いっぱい（西の瀬の -158 から東の 120 まで。森の備の前の -12〜60 だけは本物の兵が受け持つ）
      // 三つの合戦がいつも同時に見えて重いので、描く数（count）は史実の総勢（force）とは別に2〜3割落とす（迫力の並びはそのまま）
      clash(rt, { x: -115, z: 2, facing: Math.PI, w: 76, gap0: 30, seed: 181, noRout: true, ...WK, surge: { k: 'B', every: 50, count: 100, flank: 0.30 }, A: side('tokugawa', TK, 320, 0, 'tokugawa', { guns: true }), B: side('asakura', ASAKURA.armor, 420, 1, 'saito', { bows: true }) }),
      clash(rt, { x: -44, z: 3, facing: Math.PI, w: 64, gap0: 26, seed: 182, noRout: true, ...WK, surge: { k: 'B', every: 45, count: 95, flank: 0.35 }, A: side('oda', OD, 280, 0, 'oda'), B: side('azai', AZAI.armor, 370, 1, 'saito'), link: realFront }),
      clash(rt, { x: 90, z: 3, facing: Math.PI, w: 60, gap0: 26, seed: 183, noRout: true, ...WK, surge: { k: 'B', every: 55, count: 85, flank: 0.30 }, A: side('oda', OD, 260, 0, 'oda', { guns: true }), B: side('azai', AZAI.armor, 345, 1, 'saito'), link: realFront }),
    ];

    rt.world.setTime('day');
    rt.setPhase('brief');
    rt.obj('main', rt.G.lord ? '浅井の猛攻を耐えて押し返せ' : ((rt.G.rank || 0) >= 3 ? '森の備の先手の一手を預かり、浅井の寄せを受け止めよ' : '森可成の備に立ち、浅井の寄せを受け止めよ'), 'main');
    if (!rt.G.lord) rt.obj('stay', '下知があるまで姉川を渡るな', 'order');
    rt.obj('mori', '森の備を半ばより多く保て', 'side');
    // 信長で遊ぶ時：本陣の前で、家臣の言上を聞く
    if (rt.G.lord) {
      rt.say('森可成', '殿、川向こうの旗が浅井、西の瀬の向こうが朝倉にございます', 4);
      rt.say('森可成', '徳川殿は西の瀬で朝倉に当たられます。浅井は我ら織田の段が受けまする', 4);
      rt.say('織田信長', '段を幾重破られようと、本陣は退かぬ。崩れた所へ旗本を回せ', 4);
      F.farT = 0;
      rt.after(18, () => this.charge(rt));
      return;
    }
    rt.say('森可成', `${nm(rt)}、夜が明けたぞ。川向こうの旗が浅井、西の瀬の向こうが朝倉じゃ`, 4.5);
    rt.say('森可成', '徳川殿は西の瀬で朝倉に当たる。我ら織田は、この川で浅井を受ける', 4.5);
    rt.say('森可成', '坂井殿の後ろにつけ。抜けた敵は、その方の組で止めよ', 5);
    rt.after(9, () => rt.bark('川は膝ほどの深さで歩いて渡れる。下知があるまで渡るな'));
    rt.after(7, () => rt.say('森可成', '前の段が抜かれたら、後ろの段へ槍を揃え直せ。東の瀬にも気を配れ', 4.5));
    F.farT = 0;
    // 磯野の渡河まで（出会うまでが長すぎるとの声で、少し早めた分、太鼓・喊声・遠くの合戦は濃く残す）
    rt.after(11, () => this.charge(rt));
  },

  // ① 磯野員昌の突撃：川を渡り、坂井の段を破って森の備へ
  charge(rt) {
    const F = rt.flags;
    if (F.step >= 1) return;
    F.step = 1; F.stepT = rt.t;
    rt.setPhase('charge');
    sfx('taiko', 1);
    rt.army.play('eshout', { x: 20, z: -20 }, 2);
    rt.banner('浅井勢、姉川を渡る', '磯野員昌の突撃');
    rt.say('足軽', '浅井が川へ入ったぞ！　先頭は磯野の旗じゃ！', 3);
    const g = enemyGroup(rt, { faction: 'saito', name: '磯野員昌の隊', anchor: { x: 80 / 8, z: -125 / 8 }, facing: 0, fleeDir: { x: 0, z: -1 }, aggro: 12, width: 16, morale: 100, noRout: true, speed: 3.0, dmgMult: 0.62 },
      dress([{ type: 'busho', n: 1, o: { name: '磯野員昌', horse: true, hat: 'kabuto_r', haori: 0x4a3a22 } }, { type: 'cavalry', n: 7 }, { type: 'samurai', n: 5 }, { type: 'ashigaru', n: 26 }], AZAI));
    F.iso = g; F.isoU = g.units[0];
    // こちらの岸の低い所から、川を渡って迫る磯野の騎馬と足軽を 3 秒見せる（戦っている時は撮らない）
    rt.after(1.2, () => rt.player.showShot({ x: 14, z: 7 }, () => g.center(), 3, { h: 0.7, lookH: 2.4, ang: 0, drift: 1.0 }));
    // 磯野の後ろに浅井の騎馬と足軽が続き、対岸の先の備も川べりへ押し出す
    KIT.backOf(rt, g, { flag: 'azai', armor: AZAI.armor, kind: 'cavalry', w: 20, depth: 12, count: 70, gap: 4, seed: 61, stop: () => g.center().z > -14 });   // 控えは川を渡りきらず、向こう岸で待つ（森の備の前で戦う兵を埋めない）
    F.azDA[0].m.advance(18, 12);
    // 西の瀬でも、森の備の左右でも、大軍どうしが川へ入って組み合う
    F.clash.forEach((c, i) => rt.after(i * 4, () => c.go()));
    // 騎馬の一撃は、槍衾の前の足軽を一度で崩さない強さに（駆け抜けて何度も当たるので）
    for (const u of g.units) if (u.type === 'cavalry') u.dmg *= 0.75;
    F.isoU.invuln = true; F.isoU.announced = false;   // 磯野はこの戦を生き延びて佐和山へ退いた
    g.order = 'move'; g.dest = { x: 20, z: 4 };   // 味方の列に頭から突っ込まないよう、手前の岸で止める（A078）
    g.onArrive = (gg) => {
      gg.order = 'attack'; gg.seekRange = 34; gg.aggro = 16;
      // 渡河した先手が、前の段へ取り付く。
      if (F.isoU.alive && !F.isoU.announced) {
        F.isoU.announced = true; F.isoU.cheer = 1.5;
        rt.army.play('eshout', F.isoU.pos, 1.6);
        rt.banner('浅井の先手、岸へ上がる', '前の段が押されている');
        rt.say('森可成', F.sakai.routed || F.sakai.count < 6 ? '坂井殿の段がもう抜かれたか……！　池田殿の段の後ろで槍を揃えよ！' : '坂井殿の段が押されておる……！　槍を揃えよ、抜けてきた者はここで止める！', 3.5);
      }
    };
    rt.marker('iso', centerOf(g), () => `磯野員昌の隊・${moraleWord(g.morale)}`, { red: true, group: g });
    rt.obj('main', rt.G.lord ? '浅井の猛攻を耐えて押し返せ（磯野員昌の突撃）' : '磯野員昌の突撃を受け止めよ', 'main');
    // 二の手：少し遅れて、東の瀬から（出会うまでが長すぎるとの声で、こちらも間合いを詰めた）
    rt.after(14, () => {
      if (F.step !== 1) return;
      const g2 = enemyGroup(rt, { faction: 'saito', name: '浅井の二の手', anchor: { x: 90 / 8, z: -230 / 8 }, facing: 0, fleeDir: { x: 0, z: -1 }, aggro: 10, width: 14, morale: 90, speed: 3.8 },
        dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 17 }, { type: 'gun', n: 5 }], AZAI));
      g2.dmgMult = 0.8;
      g2.order = 'move'; g2.dest = { x: 40, z: 18 };
      g2.onArrive = (gg) => { gg.order = 'attack'; gg.seekRange = 30; };
      F.second = g2;
      rt.say('足軽', '東の瀬からも来るぞ！', 2.5);
    });
    // 大声を上げず、東の浅瀬から後ろへ回る別手。正面の突破と同時に進む。
    rt.after(28, () => this.flank(rt));
    // 後ろの段（柴田勝家）が前へ詰めてくる
    rt.after(62, () => this.shibata(rt));
    // 徳川の横槍・稲葉の横槍
    rt.after(130, () => this.tokugawa(rt));
  },

  shibata(rt) {
    const F = rt.flags;
    if (F.step !== 1 || F.shibata) return;
    const g = allyGroup(rt, { faction: 'oda', name: '柴田勝家の段', anchor: { x: -30 / 8, z: 480 / 8 }, facing: Math.PI, width: 14, aggro: 9, noRout: true, speed: 2.8 },
      [{ type: 'samurai', n: 1, o: { name: '柴田勝家', horse: true, hat: 'kabuto_b', haori: 0x3a2a1c } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 10 }]);
    g.defMult = 1.3; g.dmgMult = 0.75;
    g.order = 'move'; g.dest = { x: MORI.x, z: F.holdAt.z - 12 };
    g.onArrive = (gg) => { gg.order = 'hold'; gg.anchor = { x: MORI.x, z: F.holdAt.z - 12 }; gg.aggro = 12; };
    F.shibata = g;
    rt.say('伝令', '柴田勝家殿の段が前へ詰めまする！　持ちこたえよとの仰せ！', 3.5);
  },

  // 正面の圧力が続く時だけ段が抜かれる。早く敵を減らせば、深く入られる前に止められる。
  breakthrough(rt) {
    const F = rt.flags, g = F.iso;
    if (gone(g) || g.count <= 8 || F.breach >= 3 || F.inaba) return;
    const c = g.center(), elapsed = rt.t - F.stepT;
    const z = F.breach === 0 ? 13 : F.breach === 1 ? 26 : MORI.z - 5;
    const wait = F.breach === 0 ? 22 : F.breach === 1 ? 38 : 56;
    if (c.z < z || elapsed < wait) return;
    F.breach++;
    if (F.breach < 3) {
      const row = F.breach === 1 ? F.sakai : F.ikeda;
      row.noRout = false; row.morale = 0;
      g.order = 'move'; g.dest = { x: MORI.x, z: F.breach === 1 ? 260 / 8 : MORI.z + 4 };
      g.onArrive = (q) => { q.order = 'attack'; q.seekRange = 24; };
      rt.banner(F.breach === 1 ? '前の段が破られた' : '次の段も破られた', '磯野の先手が、さらに奥へ');
    } else {
      // 本物の兵を増やさず、後ろの軽い二段も押し下げて、深い入り込みを見せる。
      for (const q of F.odaLayers) q.m.retreat(34, 12);
      F.holdAt.z = MORI.z + 20;
      for (const q of [F.mori, F.guns[0], F.shibata]) if (q && !gone(q)) {
        q.order = 'move'; q.dest = { x: q.anchor.x, z: q === F.guns[0] ? F.holdAt.z + 6 : F.holdAt.z };
        q.onArrive = (r) => { r.order = 'hold'; r.facing = Math.PI; r.aggro = 12; };
      }
      for (const q of [F.second, F.third]) if (q && !gone(q)) { q.order = 'attack'; q.seekRange = 75; }
      g.order = 'move'; g.dest = { x: MORI.x, z: F.holdAt.z - 13 };
      g.onArrive = (q) => { q.order = 'attack'; q.seekRange = 30; };
      rt.banner('後ろの段まで押し込まれた', '本陣の手前で、槍の列を揃え直せ');
      rt.obj('main', '後ろの段で磯野の先手を受け止めよ', 'main');
      rt.marker('stop', F.holdAt, '槍を揃える所');
    }
  },

  flank(rt) {
    const F = rt.flags;
    if (F.step !== 1 || F.flankG) return;
    const g = enemyGroup(rt, { faction: 'saito', name: '東へ回る浅井の別手', anchor: { x: 108, z: -16 }, facing: 0, width: 8, aggro: 2, morale: 85, speed: 2.2, fleeDir: { x: 0, z: -1 } },
      dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 10 }], AZAI));
    F.flankG = g;
    rt.objRemove('mori');
    rt.obj('flank', '東から後ろへ回る浅井の別手を止めよ', 'side');
    g.order = 'path'; g.path = [[108, 16], [96, 70], [60, 96]]; g.pathIdx = 0;
    g.onArrive = (q) => {
      q.order = 'attack'; q.seekRange = 32;
      if (!F.flankDone) {
        F.flankDone = true; rt.objFail('flank'); rt.unmark('flank');
        rt.obj('mori', '森の備を半ばより多く保て', 'side');
        F.mori.morale = Math.max(25, F.mori.morale - 15);
        rt.say('伝令', '東の別手が背後へ！　鉄砲組を守られよ！', 3);
      }
    };
    rt.say('伝令', '東の浅瀬に浅井の旗！　横へ回る構えにござる', 3);
    // 味方が崩れてからの救出でなく、進路を読んで先に一手を置く判断。
    rt.choose('正面が押される中、東の旗が横へ動く。どう備える？', [
      { label: '佐久間の一手を東へ回す', note: '東の浅瀬の出口をふさぐ。自分は正面の槍の列を保つ' },
      { label: '正面の槍を厚くする', note: '森の備を固める。東の別手は自分で止める必要がある' },
    ], (i) => {
      if (F.step !== 1 || F.flankDone) return;
      F.flankPick = i;
      if (i === 0 && !gone(F.kino)) {
        F.kino.order = 'move'; F.kino.dest = { x: 92, z: 70 };
        F.kino.onArrive = (q) => { q.order = 'hold'; q.facing = Math.PI; q.aggro = 18; };
      } else if (i === 1) F.mori.defMult = 1.8;
      rt.marker('flank', centerOf(g), '後ろへ回る浅井の別手', { red: true, group: g });
    }, 12);
  },

  // ② 西の瀬で徳川が朝倉を破り、稲葉一鉄が浅井の横腹を突く
  tokugawa(rt) {
    const F = rt.flags;
    if (F.tkDone) return;
    F.tkDone = true;
    sfx('horagai', 0.7);
    rt.banner('徳川勢、朝倉の横を突く', '榊原康政の横槍');
    rt.say('伝令', '西の瀬、徳川殿が朝倉を押し返しております！　榊原康政殿が朝倉の横腹へ！', 4);
    rt.after(7, () => { if (!rt.over) rt.say('森可成', '朝倉が乱れた！　浅井も押し返せ！', 3.5); });   // 一方の勝ちがもう一方に効く（A081）
    F.sakakiGo = rt.t;
    // 榊原の別手が朝倉の横へ駆け、朝倉の先手が崩れ、後ろの本陣も退く
    F.sakaki.m.advance(111, 26, { charge: true });
    rt.after(20, () => F.akDA[0].m.rout({ hideAfter: 45 }));
    // 西の瀬の朝倉：榊原の騎馬が西の端から突っ込み、その端から崩れる
    F.clash[0].cavalry('A', { from: 1, flag: 'tokugawa', armor: TK_ARMOR, count: 70, delay: 4 });
    F.clash[0].shake('B', 20);
    rt.after(22, () => F.clash[0].rout('B', { from: 1, hideAfter: 45 }));
    rt.after(26, () => F.akDA[1].m.retreat(60, 40));
    // 戦線の連動：西の朝倉が崩れる知らせは、東の浅井の士気へ響く
    rt.after(24, () => {
      if (F.step !== 1) return;
      F.clash[1].shake('B', 14); F.clash[2].shake('B', 14);
      for (const g of [F.iso, F.second, F.third]) if (g && !gone(g)) g.morale = Math.max(0, g.morale - 12);
      rt.say('伝令', '西の朝倉勢が崩れた、との声が浅井の陣に広がっておりまする！', 3);
    });
    // 浅井は朝倉の崩れを見る前に、残る旗本を押し出す（三の手）
    rt.after(4, () => {
      if (F.step !== 1) return;
      const g3 = enemyGroup(rt, { faction: 'saito', name: '浅井の三の手', anchor: { x: 120 / 8, z: -340 / 8 }, facing: 0, fleeDir: { x: 0, z: -1 }, aggro: 12, width: 16, morale: 95, noRout: true, speed: 2.9 },
        dress([{ type: 'samurai', n: 5 }, { type: 'cavalry', n: 4 }, { type: 'ashigaru', n: 16 }, { type: 'gun', n: 4 }], AZAI));
      g3.dmgMult = 0.7;
      g3.order = 'move'; g3.dest = { x: 26, z: F.holdAt.z - 14 };
      g3.onArrive = (gg) => { gg.order = 'attack'; gg.seekRange = 34; };
      F.third = g3;
      KIT.backOf(rt, g3, { flag: 'azai', armor: AZAI.armor, kind: 'spear', w: 18, depth: 10, count: 75, seed: 62, stop: () => g3.center().z > -14 });
      sfx('taiko', 0.9);
      rt.say('足軽', '浅井がまた川へ入った！　長政の旗本じゃ！', 3);
      rt.obj('main', rt.G.lord ? '浅井の猛攻を耐えて押し返せ（長政の旗本）' : '浅井の三の手（長政の旗本）を受け止めよ', 'main');
      rt.marker('third', centerOf(g3), () => `浅井の三の手・${moraleWord(g3.morale)}`, { red: true, group: g3 });
    });
    rt.after(24, () => this.inaba(rt));
  },
  inaba(rt) {
    const F = rt.flags;
    if (F.inaba || F.step !== 1) return;
    const tg = [F.third, F.iso, F.second].find((e) => e && e.count);
    const c = tg ? tg.center() : { x: 20, z: 20 };
    const g = allyGroup(rt, { faction: 'saito', name: '稲葉一鉄の隊', anchor: { x: 96, z: 26 }, facing: -Math.PI / 2, width: 12, aggro: 10, noRout: true, speed: 3.2 },
      dress([{ type: 'samurai', n: 1, o: { name: '稲葉一鉄', horse: true, hat: 'kabuto_w', haori: 0x3a3022 } }, { type: 'samurai', n: 3 }, { type: 'ashigaru', n: 12 }], INABA));
    g.order = 'move'; g.dest = { x: c.x + 10, z: c.z };
    g.onArrive = (gg) => { gg.order = 'attack'; gg.seekRange = 50; };
    F.inaba = g;
    sfx('taiko', 1);
    rt.banner('稲葉一鉄、浅井の横腹へ', '西美濃の衆が東から駆けつける');
    rt.say('森可成', '稲葉殿が横から入った！　今じゃ、押し返せ！', 3.5);
    // 横を突かれて浅井は揺らぐ（稲葉が取り付いたら崩れうる）
    F.inabaT = rt.t;
    // 東の前線の浅井にも、稲葉の手の騎馬が東の端から突っ込む
    F.clash[2].cavalry('A', { from: 1, flag: 'inaba', armor: INABA.armor, count: 60, delay: 2 });
    for (const c of F.clash.slice(1)) c.shake('B', 15);
    for (const e of [F.iso, F.second, F.third]) if (e && e.count) e.morale -= 12;
    rt.after(12, () => { for (const e of [F.iso, F.second, F.third]) if (e && e.count) { e.noRout = false; e.morale -= 10; } });
  },

  // ③ 浅井が崩れた：川を渡って追い落とす
  counter(rt) {
    const F = rt.flags;
    if (F.step >= 2) return;
    F.step = 2; F.stepT = rt.t;
    rt.setPhase('counter');
    // 追い討ちでは、段の後ろの味方（坂井・池田・佐久間）は任務に数えない：遠くの者から外して、浅井の本隊へ渡った時の枠に回す
    KIT.markRecyclable(F.sakai, F.ikeda, F.kino);
    rt.unmark('iso'); rt.unmark('third'); rt.unmark('stop');
    if (F.flankG && !F.flankDone) {
      F.flankDone = true; rt.objFail('flank'); rt.unmark('flank');
      F.flankG.noRout = false; F.flankG.morale = 0;
    }
    rt.objDone('main');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; }, '磯野の突撃を受け止めた');
    if (F.mori.count > F.mori0 / 2) { rt.objDone('mori'); rt.award((t) => t.side.push('森の備を保った'), '副任務：森の備を保った'); } else rt.objFail('mori');
    if (!F.crossed && !rt.G.lord) rt.objDone('stay');
    rt.objRemove('stay');
    sfx('horagai', 1);
    // 朝から戦い続け、日は高く昇った
    rt.world.setTime('after');
    rt.banner('浅井勢、崩れる', '姉川を渡り、追い落とせ');
    rt.say('森可成', '浅井が退く！　川を渡り、向こう岸のしんがりを崩せ！', 4.5);
    rt.obj('pursue', '姉川を渡り、向こう岸で踏みとどまる浅井の殿（しんがり）を崩せ', 'main');
    // 追い討ちは馬でなければ追いつけない：乗っていなければ、森の備から空馬を一頭引いてくる（身分が足りなくても、この馬だけは乗れる）
    if (!rt.player.mounted) {
      const u = rt.player.u, ang = u.heading + Math.PI * 0.35;
      const hx = u.pos.x + Math.sin(ang) * 3.5, hz = u.pos.z + Math.cos(ang) * 3.5;
      const h = buildHorse();
      h.position.set(hx, rt.world.heightAt(hx, hz), hz);
      h.rotation.set(0, u.heading + Math.PI, 0);
      rt.scene.add(h);
      const L = rt.army.looseHorses || (rt.army.looseHorses = []);
      L.push({ h, heading: u.heading, spd: 0, t: 0, calm: true, from: { team: u.team, house: '森', name: '', speed: 1, hp: 200 } });
      rt.after(1, () => rt.say('森可成', `${nm(rt)}、これに乗れ！　追い討ちは馬でなければ追いつけぬ！`, 3));
      rt.after(3, () => rt.bark('空馬が引かれてきた。そばへ寄って手綱を取れば乗れる'));
    }
    // 判断：浅井の殿を追うか、西の瀬で押し合う徳川を助けに回るか
    if (!rt.G.lord) rt.after(4, () => rt.choose('西の瀬で徳川が朝倉の残りと押し合っている。どうする？', [
      { label: '川を渡り、浅井のしんがりを追う', note: '森の備と一緒に向こう岸へ。追い討ちの手柄' },
      { label: '西の瀬へ回り、徳川を助ける', note: '朝倉の残りの横を突く。西の戦線を押し返す手柄。浅井のしんがりは森の備に任せる' },
    ], (i) => {
      if (i === 1) {
        F.helpTk = true;
        F.akRest = enemyGroup(rt, { faction: 'saito', name: '朝倉の残り', anchor: { x: -110, z: -2 }, facing: -Math.PI / 2, order: 'attack', seekRange: 60, aggro: 14, width: 14, morale: 90, fleeDir: { x: -0.5, z: -1 } },
          dress([{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 24 }, { type: 'gun', n: 2 }], ASAKURA));
        KIT.backOf(rt, F.akRest, { flag: 'asakura', armor: ASAKURA.armor, kind: 'spear', w: 20, depth: 12, count: 110, seed: 65 });
        rt.obj('tk', '西の瀬へ回り、朝倉の残りの横を突け', 'main');
        rt.marker('akr', centerOf(F.akRest), () => `朝倉の残り・${moraleWord(F.akRest.morale)}`, { red: true, group: F.akRest });
        rt.objRemove('pursue');   // 浅井のしんがりは森の備に任せる（選ばなかった任務で「しくじり」にしない）
        rt.say('森可成', 'よし、西へ回れ。浅井のしんがりは森の備が押す', 3.5);
      } else rt.say('森可成', 'よし、続け！　向こう岸じゃ！', 2.5);
    }, 18));
    for (const g of [F.ikeda, F.kino, F.inaba, F.shibata]) if (g && g.count) { g.order = 'attack'; g.seekRange = 70; g.formation = 'line'; }
    // 後ろの段からも川を渡れるよう、向こう岸へ移ってから追撃に替える。
    for (const g of [F.mori, F.kino, F.inaba, F.shibata]) if (g && !gone(g)) {
      g.order = 'move'; g.dest = { x: 24, z: -18 }; g.formation = 'line';
      g.onArrive = (q) => { q.order = 'attack'; q.seekRange = 70; };
    }
    const R = enemyGroup(rt, { faction: 'saito', name: '浅井のしんがり', anchor: { x: 24, z: -36 }, facing: 0, fleeDir: { x: 0.1, z: -1 }, aggro: 12, width: 16, morale: 85 },
      dress([{ type: 'busho', n: 1, o: { name: '浅井の殿の侍大将', horse: true, hat: 'kabuto_m', haori: 0x3a4a3a } }, { type: 'samurai', n: 5 }, { type: 'ashigaru', n: 26 }, { type: 'gun', n: 5 }], AZAI));
    F.rear = R;
    for (const u of R.units) if (u.type === 'gun') u.dmg *= 0.5;
    R.dmgMult = 0.7;   // 殿は退きながら踏みとどまる隊。川を渡る味方の大勢に押し包まれる側   // 川を渡る者を撃つ殿の鉄砲は、一発で倒れない強さに
    R.noRout = true;
    rt.after(35, () => { R.noRout = false; });
    if (F.flankStopped) { R.morale -= 20; rt.after(6, () => rt.say('森可成', '東の別手を止めたので、横から押せるぞ！', 3)); }
    rt.marker('rear', centerOf(R), () => `浅井のしんがり・${moraleWord(R.morale)}`, { red: true, group: R });
    // 浅井の先の備は崩れ、長政の本陣と後ろの騎馬は北の山へ引いていく
    F.retreat = rt.t;
    // （殿はこの大軍のいた所で踏みとどまるので、崩れた大軍は早めに散らして消す：戦う兵が影の兵に埋もれないように）
    F.azDA[0].m.rout({ hideAfter: 12 });
    rt.after(12.5, () => { F.azDA[0].m.visible = false; });
    // 磯野と三の手の後ろの控えも、浅井の崩れと一緒に散る（殿の戦う所に影の兵を残さない）
    for (const q of F.backs || []) if (!q.gone) { q.gone = true; q.b.rout({ hideAfter: 12 }); rt.after(12.5, () => { q.b.visible = false; }); }
    // 川の中の浅井の前線も崩れて向こう岸へ逃げる
    F.clash.slice(1).forEach((c, i) => rt.after(1 + i * 4, () => c.rout('B', { from: i ? -1 : 1, hideAfter: 45 })));
    rt.after(4, () => F.azDA[1].m.retreat(60, 45));
    rt.after(7, () => F.azDA[2].m.retreat(60, 40));
    KIT.backOf(rt, R, { flag: 'azai', armor: AZAI.armor, kind: 'spear', w: 18, depth: 10, count: 85, seed: 64 });
  },

  update(rt, dt) {
    const F = rt.flags;
    jinchiTick(rt, F.guns);   // 野戦の陣地：槍が前で揉み合う間は撃たない（yasen_jinchi.js）
    guardRecover(rt, F.moriU, dt, F.guardRecovery);
    if (F.hpBars) F.hpBars.update(rt.army.groups);
    const p = rt.player.u.pos;
    // 西の瀬の撃ち合い（遠くの音と煙）
    if (!F.ending && F.step >= 1) {
      F.farT -= dt;
      if (F.farT <= 0) {
        F.farT = 3 + Math.random() * 4;
        const x = -115 + (Math.random() - 0.5) * 40;
        rt.army.smoke(x, rt.world.heightAt(x, 6) + 1.4, 6, 0, -1);
        rt.army.play('gun', { x, z: 4 }, 0.9);
      }
    }
    KIT.backTick(rt);
    if (F.ending) return;
    // 一斉射：磯野の隊が川の中ほどまで寄せたら、森の備の鉄砲が「放て」（一度だけ）
    if (!F.vol1 && F.iso && !gone(F.iso) && F.iso.center().z > -12) {
      F.vol1 = true;
      volley(rt, F.guns, { who: '森可成', wait: 2.2, line: '鉄砲、放てぇっ！　川の中の足を止めよ！', banner: ['一斉射', '森の備の鉄砲が、川を渡る磯野勢へ放つ'], C: F.clash && F.clash[1], hit: 22 });
    }
    depthTick(rt, dt);
    // 川を渡ったか（下知の前）
    if (F.step < 2 && p.z < BANK_N && !rt.G.lord) {
      F.outT = (F.outT || 0) + dt;
      if (F.outT > 3 && !F.crossed) {
        F.crossed = true;
        rt.violation('下知なく姉川を渡った', ['森可成', '戻れ！　川を渡るなと申したはずじゃ！']);
        rt.objFail('stay');
      }
    } else F.outT = 0;
    if (F.step === 1) {
      const iso = F.iso;
      this.breakthrough(rt);
      if (F.flankG && !F.flankDone && gone(F.flankG)) {
        F.flankDone = true; F.flankStopped = true;
        rt.objDone('flank'); rt.unmark('flank');
        rt.obj('mori', '森の備を半ばより多く保て', 'side');
        rt.award((t) => t.side.push('東の回り込みを止めた'), '東の回り込みを止めた');
        F.clash[2].push('A', 0.5);
      }
      rt.objProgress('main', `浅井勢 ${[iso, F.second, F.third].reduce((a, g) => a + (g && !gone(g) ? g.count : 0), 0)}人・森の備 ${F.mori.count}人`);
      // 森の備が危うければ、稲葉の横槍を早める
      if (!F.inaba && F.mori.count < F.mori0 * 0.25 && F.tkDone) this.inaba(rt);
      if (!F.tkDone && F.mori.count < F.mori0 * 0.25) this.tokugawa(rt);
      // 坂井の段が押し負けていく様子を印で見せる（崩れたら消す）
      if (!F.sakaiMk && F.iso && F.iso.order === 'attack') { F.sakaiMk = true; rt.marker('sakai', centerOf(F.sakai), () => `坂井の段・${moraleWord(F.sakai.morale)}`, { group: F.sakai }); }
      if (F.sakaiMk && (F.sakai.routed || !F.sakai.count)) rt.unmark('sakai');
      // 戦線の連動：東の織田の段が二つ崩れると、西の徳川の備にも動きが走る（徳川の横槍は遅れる）
      if (!F.linkW && F.sakai.routed && F.ikeda.routed && !F.tkDone) {
        F.linkW = true; F.clash[0].shake('A', 14);
        rt.say('伝令', '東の織田勢が押されている、と西の徳川の陣にも知らせが！', 3);
      }
      // 坂井の段が崩れたら知らせる
      if (F.sakai.routed && !F.sakaiSaid) { F.sakaiSaid = true; rt.say('森可成', '坂井殿の段が破られた！　次は池田殿の段じゃ……', 3); }
      if ((F.ikeda.routed || F.ikeda.count < 4) && !F.ikedaSaid) { F.ikedaSaid = true; rt.banner('池田の段も破られる', '磯野の勢い、止まらず'); rt.say('森可成', '池田殿の段も抜かれた！　来るぞ、槍を揃えよ！', 3); }
      const waves = [iso, F.second, F.third, F.flankG];
      const spent = waves.every((e) => !e || gone(e) || e.count <= 3);
      // 浅井の寄せを早く退けたら、その間に西の瀬の徳川が朝倉を破る
      if (spent && !F.tkDone && !F.tkSoon) { F.tkSoon = true; rt.say('森可成', '浅井め、川向こうで立て直しておる。息を整えよ、また来るぞ', 3.5); rt.after(6, () => this.tokugawa(rt)); }
      if (F.third && gone(F.third)) rt.unmark('third');
      if (!iso.routed && iso.count <= 3 && !iso.fled) { iso.fled = true; iso.noRout = false; iso.morale = 0; rt.unmark('iso'); rt.banner('磯野員昌、退く', '浅井の先手、川向こうへ'); }
      // 浅井の寄せが尽きたら、槍の列を立て直し、最後の寄せを押し返す。
      if (spent && F.inabaT && rt.t - F.inabaT > 10 && F.third) { if (rt.G.lord) this.counter(rt); else { F.step = 1.5; depthStart(rt, aneCtx(rt, BANK_N + 2), aneA(), () => this.counter(rt)); } }
      // 長引いたら、浅井は横を突かれて自ら引く（先へ進めるように）
      else if (F.inabaT && rt.t - F.inabaT > 50) { for (const g of waves) if (g && g.count) { g.noRout = false; g.morale = 0; } }
    }
    if (F.step === 2) {
      const R = F.rear;
      if (!F.helpTk) rt.objProgress('pursue', `浅井のしんがり ${R.count}人`);
      // 徳川を助けに回った時は、朝倉の残りを崩せば勝ち（浅井の殿は森の備が崩す）
      if (F.helpTk && F.akRest && !F.tkHelped) {
        rt.objProgress('tk', `朝倉の残り ${gone(F.akRest) ? 0 : F.akRest.count}人`);
        if (F.akRest.count < 6 && !gone(F.akRest)) F.akRest.morale = Math.min(F.akRest.morale, 20);
        if (gone(F.akRest)) {
          F.tkHelped = true; rt.unmark('akr'); rt.objDone('tk');
          rt.award((t) => { t.special = { label: '西の瀬で徳川を助けた', pts: 25 }; }, '西の瀬で徳川を助けた');
          rt.say('徳川の侍', 'かたじけない！　織田の方の助太刀、主の三河守に申し伝えまする', 3.5);
          R.noRout = false; R.morale = Math.min(R.morale, 15);
        }
      }
      if (!F.dpB && (gone(R) || rt.t - F.stepT > (F.helpTk ? 120 : 85))) {
        F.dpB = true;
        if (F.helpTk && !F.tkHelped) { rt.objFail('tk'); rt.unmark('akr'); }
        rt.unmark('rear');
        if (F.helpTk) { if (!gone(R)) { R.noRout = false; R.morale = 0; } }
        else if (gone(R)) { rt.objDone('pursue'); rt.award((t) => { t.special = { label: '追い討ち', pts: 25 }; }, '浅井のしんがりを崩した'); }
        else { rt.objFail('pursue'); R.noRout = false; R.morale = 0; }
        if (F.akRest && !gone(F.akRest)) { F.akRest.noRout = false; F.akRest.morale = 0; }
        // 向こう岸を取った後も段を重ねる（長政の後備えか横山城か→退き口）
        if (!rt.G.lord) { depthStart(rt, aneCtx(rt, undefined, 0.48), aneB(), () => this.ending(rt)); return; }
        this.ending(rt);
      }
    }
  },
  ending(rt) {
    const F = rt.flags;
    F.ending = true;
    rt.banner('浅井・朝倉、退く', '姉川の戦、終わる');
    rt.say('森可成', '浅井・朝倉を押し返した。槍の列を保ち、組を集めよ', 4);
    rt.say('伝令', '横山城、降ると申し出ておりまする！', 3);
    sfx('horagai', 0.8);
    rt.player.u.invuln = true;   // 戦が終わったあとの流れ弾で重傷にならないように
    rt.finish({}, 10);
  },

  onKill(rt, v, k) {
    const F = rt.flags;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
    KIT.carrion(rt, v);
  },
  onRout(rt, g) {
    const F = rt.flags;
    if (g === F.iso) rt.say('足軽', '磯野の隊が崩れたぞ！　川へ逃げていく！', 3);
    if (g === F.rear) rt.say('足軽', 'しんがりが崩れた！　浅井は総崩れじゃ！', 3);
  },
};

// 織田・徳川は概数。浅井五千・朝倉八千は信長公記巻三の記述による。
anegawa.force = (rt) => {
  const F = rt.flags;
  const b = 13000 - (F.ek || 0) * 70 - (F.step >= 2 ? 1500 : 0) - (F.ending ? 1000 : 0);
  return { a: 28000 - (F.ak || 0) * 40, a0: 28000, b, b0: 13000 };
};
anegawa.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '浅井の寄せまで待つ' : '');
anegawa.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
anegawa.famous = HISTORICAL_GENERALS.anegawa;
anegawa.sides = { a: { name: '織田・徳川軍', mon: 'oda' }, b: { name: '浅井・朝倉軍', mon: 'azai' } };
anegawa.date = (rt) => {
  const w = rt.world;
  const time = { day: '朝', storm: '朝', after: '昼', dusk: '夕暮れ' }[w.timeKey] || '朝';
  return `元亀元年六月二十八日　夏・${w.rainLevel > 0.5 ? '雨' : '晴'}・${time}`;
};
anegawa.history = '信長公記巻三では、元亀元年六月二十八日、浅井・朝倉勢が野村と三田村の二手に分かれ、西に徳川勢、東に信長の馬廻りと美濃三人衆が当たったと記す。敵は姉川を越え、織田勢と押しつ押されつ入り乱れた。織田・徳川勢は敵を崩して小谷の麓まで追い、横山城は降った。磯野員昌が何段も破ったという細かな戦いぶりは後の軍記に伝わる話で、信長公記には段数の記述はない。この戦の磯野の突破と東の別手の進路は、戦の押し引きを遊ぶための補いである。';

// 素直な遊び手：移った槍の列を保ち、東の別手を読み、下知が出たら川を渡る
anegawa.botBrain = (b, inp, { goTo }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW');
  if (!u.alive || F.ending) return;
  // 段（b_depth.js）が動いている間は、そちらの的へ向かう
  if (F.dp && F.dp.on) { depthBot(b, inp, goTo); return; }
  // 下知の前は川のこちら側だけ
  const ok = (o) => !o.fleeing && !o.invuln && (F.step >= 2 || o.pos.z > BANK_N + 2);
  const flank = F.flankG;
  if (F.step === 1 && F.flankPick === 1 && !F.flankDone && flank && !gone(flank)) {
    const c = flank.center();
    goTo(p, inp, c.x, Math.max(BANK_N + 3, c.z), 2);
    const e = b.army.nearestEnemy(u, 3.2, ok);
    if (e) { p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z); inp.leftPressed = Math.random() < 0.5; }
    return;
  }
  inp.runHeld = false;
  // 深手なら備の後ろへ下がって息を整える（しばらく打たれなければ傷は癒える）
  if (u.hp < u.maxHp * 0.6) b.botRest = true;
  if (b.botRest && u.hp > u.maxHp * 0.85) b.botRest = false;
  if (b.botRest) {
    const back = F.step >= 2 ? { x: 22, z: 12 } : { x: F.holdAt.x, z: F.holdAt.z + 16 };
    inp.guardHold = false;
    goTo(p, inp, back.x, back.z, 2);
    return;
  }
  // 下知の前は、備の前に出すぎず、槍の届く所の敵だけを突く
  const home = F.step >= 2 ? u.pos : F.holdAt;
  const e = b.army.nearestEnemy(u, F.step >= 2 ? 16 : 9, (o) => ok(o) && Math.hypot(o.pos.x - home.x, o.pos.z - home.z) < (F.step >= 2 ? 99 : 12));
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d > 2.6) inp.k.add('KeyW');
    if (d < 3.2 && Math.random() < 0.5) inp.leftPressed = true;
    inp.guardHold = (b.army.threats || []).length > 0 && Math.random() < 0.85;
    return;
  }
  inp.guardHold = false;
  if (F.step >= 2 && F.rear && F.rear.count) { const c = F.rear.center(); goTo(p, inp, c.x, c.z, 2); }
  else goTo(p, inp, F.holdAt.x, F.holdAt.z - 3, 2.5);
};

// ---------------- 一つの戦を濃くする段（b_depth.js） ----------------
const uS = (n) => ({ type: 'samurai', n }), uA = (n) => ({ type: 'ashigaru', n }), uG = (n) => ({ type: 'gun', n }), uC = (n) => ({ type: 'cavalry', n }), uB = (n) => ({ type: 'bow', n });
function aneCtx(rt, keepZ, dmg) {
  const F = rt.flags;
  return { faction: 'saito', flag: 'azai', armor: AZAI.armor, dmg: dmg || 0.62, keepZ, look: (l) => dress(l, AZAI), friends: () => [F.shibata].filter((g) => g && g.count && !g.routed), aid: { name: '森の備の一手', list: [uS(1), uA(8)] }, aidSaid: '森の備から一手が加わった' };
}
// 浅井の寄せが尽きた後、列を立て直して最後の寄せを受ける。
function aneA() {
  return [
    rest({ dur: 9, say: [['森可成', '槍を揃え直せ。次の寄せを押し返すぞ']] }),
    hold({ at: (rt) => rt.flags.holdAt, dur: 42, r: 14, title: '浅井の最後の寄せ', sub: '押し返した槍の列を保つ', label: '森の備', obj: '槍の列を保ち、浅井の寄せを押し返せ',
      waves: [
        { t: 5, foes: (rt) => [{ name: '浅井の足軽', from: { x: 20, z: rt.flags.holdAt.z - 30 }, list: [uS(2), uA(12)], mass: 200 }] },
        { t: 24, foes: (rt) => [{ name: '浅井の騎馬と足軽', from: { x: 50, z: rt.flags.holdAt.z - 30 }, list: [uC(3), uA(8)], mass: 160 }] },
      ], reward: '浅井の最後の寄せを押し返した' }),
  ];
}
// 向こう岸の殿を崩した後：立て直し → 判断（長政の後備えか、横山城の城兵か）→ 判断（退き口を守るか、朝倉の残りを突くか）
function aneB() {
  return [
    rest({ dur: 9, heal: 0.6, say: [['森可成', (rt) => (rt.flags.helpTk ? '西の瀬は片づいた。森の備も向こう岸を取ったぞ。……息を整えよ' : '向こう岸を取ったぞ。……息を整えよ')], ['伝令', '長政の本陣、小谷へ退いていきまする！　横山城からは城兵が打って出たと！']] }),
    pick({ time: 12, title: '長政の本陣が北へ退き、横山城から城兵が出た。どうする？',
      options: [{ label: '北へ、長政の本陣の後備えを追う', note: '長政の後備えを崩せば大手柄。北の山際は狭い' }, { label: '西の横山城の城兵に当たる', note: '城兵を押し戻せば、横山城が早く降る' }],
      on: (rt, m, i) => { m.aneChase = i === 0; rt.say('森可成', i === 0 ? 'よし、北じゃ！　深入りして山へ入るな' : 'よし、城兵を城へ押し戻せ！', 3); } }),
    fight({ max: 95, skip: (rt, m) => !m.aneChase, at: { x: 30, z: -78 }, title: '長政の後備え', sub: '小谷へ退く長政を逃がすため、後備えが向き直る', obj: '長政の本陣の後備えを崩せ',
      foes: () => [{ name: '長政の後備え', from: { x: 30, z: -116 }, list: [uS(2), uA(10), uG(2)], noRout: 20 }],
      later: [{ t: 34, title: '横槍', sub: '浅井の騎馬が山際から', say: ['足軽', '山際から騎馬じゃ！'], foes: () => [{ name: '浅井の騎馬', from: { x: 66, z: -110 }, list: [uC(3), uA(6)] }] },
        { t: 70, title: '新手', sub: '小谷の方から浅井の新手が駆け戻る', say: ['森可成', '新手じゃ！　山へは入るな、ここで受けよ！'], foes: () => [{ name: '駆け戻る浅井の新手', from: { x: 10, z: -124 }, list: [uS(1), uA(8)], mass: 200 }] }],
      reward: (t) => { t.special = { label: '長政の後備えを崩した', pts: 25 }; }, rewardLabel: '長政の後備えを崩した' }),
    fight({ max: 95, skip: (rt, m) => m.aneChase, at: { x: -52, z: -58 }, title: '横山城の城兵', sub: '横山城から打って出た城兵が、川を渡る味方を狙う', obj: '横山城から出た城兵を押し戻せ',
      foes: () => [{ name: '横山城の城兵', from: { x: -84, z: -104 }, list: [uS(2), uA(15), uB(4)] }],
      later: [{ t: 28, say: ['足軽', '城からまだ出てくるぞ！'], foes: () => [{ name: '横山城の後の城兵', from: { x: -96, z: -90 }, list: [uS(2), uA(10)] }] }],
      reward: '横山城の城兵を押し戻した' }),
    rest({ dur: 9, heal: 0.6, bark: '川岸へ戻り、組を集め直せ', say: [['森可成', '日が傾いてきた。味方は川を渡って戻り始めておる'], ['伝令', (rt) => (rt.flags.tkHelped ? '西の瀬で崩れた朝倉勢が、また寄り集まって戻ってきまする！　渡る味方の背を狙うておると！' : '西の瀬から、朝倉の残りが戻ってきまする！　渡る味方の背を狙うておると！')]],
      fn: (rt) => rt.world.setTime('dusk') }),
    pick({ time: 12, skip: () => true, title: '朝倉の残りが、川を渡って戻る味方の背を狙う。どうする？',
      options: [{ label: '川岸で踏みとどまり、渡る味方を守る', note: '味方が無事に戻れる。朝倉の寄せを受け続ける' }, { label: '西へ打って出て、朝倉の残りを突く', note: '朝倉の残りを崩せば手柄。追い返せば戦は早く終わる' }],
      on: (rt, m, i) => { m.aneGuard = i === 0; } }),
    hold({ skip: () => true, at: { x: 6, z: -16 }, dur: 54, r: 13, title: '退き口', sub: '川を渡って戻る味方の背を守る', label: '川岸の退き口', obj: '川岸で踏みとどまり、渡って戻る味方を守れ',
      waves: [
        { t: 5, say: ['足軽', '西から朝倉勢じゃ！'], foes: () => [{ name: '朝倉の残り', from: { x: -60, z: -30 }, flag: 'asakura', armor: ASAKURA.armor, list: dress([uS(1), uA(8)], ASAKURA) }] },
        { t: 32, say: ['足軽', '鉄砲を撃ちかけてくる！'], foes: () => [{ name: '朝倉の鉄砲', from: { x: -50, z: -60 }, flag: 'asakura', armor: ASAKURA.armor, list: dress([uG(2), uA(5)], ASAKURA) }] },
        { t: 52, say: ['森可成', '朝倉の騎馬を通すな！　槍をそろえよ！'], foes: () => [{ name: '朝倉の騎馬', from: { x: -70, z: -44 }, flag: 'asakura', armor: ASAKURA.armor, list: dress([uC(2), uA(5)], ASAKURA), morale: 70 }] },
      ],
      reward: '退き口を守った' }),
    fight({ max: 95, skip: () => true, at: { x: -46, z: -22 }, title: '朝倉の残りを突く', sub: '西の瀬から戻る朝倉勢の横を突く', obj: '戻ってくる朝倉の残りを崩せ',
      foes: () => [{ name: '朝倉の残り', from: { x: -80, z: -36 }, flag: 'asakura', armor: ASAKURA.armor, list: dress([uS(2), uA(12), uG(2)], ASAKURA) }],
      later: [{ t: 30, say: ['足軽', '朝倉の騎馬が戻ってくる！'], foes: () => [{ name: '朝倉の騎馬', from: { x: -96, z: -20 }, flag: 'asakura', armor: ASAKURA.armor, list: dress([uC(3), uA(6)], ASAKURA), morale: 70 }] }],
      reward: (t) => { t.special = { label: '朝倉の残りを崩した', pts: 20 }; }, rewardLabel: '朝倉の残りを崩した' }),
  ];
}

export { anegawa };
