// ======================================================================
// 大坂の陣　夏の陣・道明寺の戦い（慶長二十年五月六日）
// 河内の道明寺。夜のうちに石川を渡った後藤又兵衛（基次）の二千八百が小松山に登り、
// 大和口から来た徳川の先手（水野勝成・本多忠政・松平忠明、のちに伊達政宗）を迎え撃つ。
// 真田・毛利の後詰は、濃い霧で道に迷って遅れた。足軽は徳川方・水野勝成の手。
// ①霧の中を小松山へ寄せる ②又兵衛の駆け下りを受け止め、小松山を奪う ③遅れて石川を渡る薄田兼相の隊を瀬で止める
// ④誉田に着いた真田・毛利を前に、石川を渡らず持ちこたえる（豊臣勢は大坂へ退く）
// 向き：西が -x（大坂）。石川は北から南へ流れ、x ≒ -52。小松山は石川の東
// ======================================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { nobori, jinmaku, tawara, hut } from './props.js';
import { flagTexture } from './textures.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { moraleWord } from './hud.js';
import { gauss, enemyGroup, allyGroup, nm, centerOf, unitPos } from './bhelp.js';
import { KIT } from './b_nagashinojo.js';
import { camp } from './b_mid.js';
import { volleyTick } from './b_sekigahara.js';
// 上の身分（足軽大将候補より上）：水野の先手の一手を預かる者として任務の文を変える
const HI = (rt) => !rt.G.lord && (rt.G.rank || 0) >= 3;

const ISHI = [[-46, -180], [-52, -100], [-50, -30], [-56, 30], [-52, 100], [-58, 180]];   // 石川
const KOMA = { x: 4, z: -18 };           // 小松山の頂
const MIZUNO = { x: 84, z: 14 };         // 水野勝成の手（はじめの持ち場）
const FOOT = { x: 34, z: -8 };           // 小松山の東の麓
const FORD = { x: -44, z: 6 };           // 石川の中の瀬（東の岸）
const HONDA = { x: -110, z: 80 };        // 誉田（真田・毛利が着く所）
const FOG_T0 = 40, FOG_T1 = 110;         // 霧の晴れはじめと晴れきり（秒）

const GOTO = { armor: 0x2a2624, lace: 0x5a2a1c, flag: 'toyotomi' };
const SANADA = { armor: 0x8e1f16, lace: 0xb8342a, flag: 'sanada' };
const TOYO = { armor: 0x2c2a2a, lace: 0x6a5a3a, flag: 'toyotomi' };
const MIZ = { flag: 'mizuno' };   // 水野勝成の手は水野の旗
const DATE = { armor: 0x1c1a1a, lace: 0x2a2a3a, flag: 'date' };
const dress = (list, lk) => list.map((s) => ({ ...s, o: { ...lk, ...(s.o || {}) } }));
const gone = (g) => !g || g.count === 0 || g.routed;
const soften = (g, k = 0.4) => { for (const u of g.units) if (u.type === 'gun') u.dmg *= k; return g; };
const lerp = (a, b, t) => a + (b - a) * t;
const MIST = { r: 0.8, g: 0.81, b: 0.8 };

function height(x, z) {
  let h = 0.5 * Math.sin(x * 0.035) * Math.cos(z * 0.03) + 0.35 * Math.sin(z * 0.05 + x * 0.03);
  // 小松山（東の尾根とつながる）・東の国分の山並み・西の誉田の台
  h += 15 * gauss(x, z, KOMA.x, KOMA.z, 1300) + 8 * gauss(x, z, KOMA.x + 26, KOMA.z - 26, 1200);
  h += Math.max(0, x - 120) * 0.3 + 12 * gauss(x, z, 150, -110, 3000);
  h += 3 * gauss(x, z, HONDA.x - 20, HONDA.z, 2600);
  return h;
}

// 石川の川原：岸に砂利の斑と葦の株を置く。形と材質は一つずつ、開戦時に一度だけ並べる。
function kawara(rt) {
  const W = rt.world, h01 = (k) => { const v = Math.sin(k * 12.9898) * 43758.5453; return v - Math.floor(v); };
  const gravel = [], reeds = [];
  for (let i = 0; i < ISHI.length - 1; i++) {
    const [ax, az] = ISHI[i], [bx, bz] = ISHI[i + 1], L = Math.hypot(bx - ax, bz - az);
    const nx = -(bz - az) / L, nz = (bx - ax) / L;
    for (let d = 0; d < L; d += 0.9) for (const side of [-1, 1]) {
      const k = i * 1000 + d * 7 + side * 3.3, t = d / L;
      // 斑：砂利の帯と草の帯を交互にし、一様に敷かない。
      const patch = Math.sin((az + (bz - az) * t) * 0.09 + side) + Math.sin((az + (bz - az) * t) * 0.23 + i);
      const off = side * (6.6 + h01(k) * 6.5), x = ax + (bx - ax) * t + nx * off, z = az + (bz - az) * t + nz * off;
      if (W.inWaterAt?.(x, z)) continue;
      if (patch > -0.4 && h01(k + 1) < 0.9) for (let q = 0; q < 4; q++) gravel.push([x + (h01(k + q * 5) - 0.5) * 1.6, z + (h01(k + q * 7) - 0.5) * 1.6, 0.06 + h01(k + q * 11) * 0.12, h01(k + q * 13)]);
      if (patch < 0.3 && h01(k + 2) < 0.8) for (let q = 0; q < 2; q++) reeds.push([x + nx * side * (1.5 + q) + (h01(k + q * 3) - 0.5), z + nz * side * (1.5 + q) + (h01(k + q * 9) - 0.5) * 1.4, 0.8 + h01(k + 3 + q) * 0.6, h01(k + 4 + q)]);
    }
  }
  const pose = new THREE.Object3D(), col = new THREE.Color();
  const stone = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: 0xffffff }), gravel.length);
  gravel.forEach(([x, z, r, v], i) => {
    pose.position.set(x, W.heightAt(x, z) + r * 0.15, z); pose.rotation.set(v * 3, v * 9, 0);
    pose.scale.set(r * 1.3, r * 0.6, r); pose.updateMatrix(); stone.setMatrixAt(i, pose.matrix);
    stone.setColorAt(i, col.setRGB(0.27 + v * 0.12, 0.25 + v * 0.10, 0.21 + v * 0.08));
  });
  stone.receiveShadow = true; stone.computeBoundingSphere(); rt.scene.add(stone);
  // 葦：細い葉を何枚も束ねた株。根もとは濃く、先は枯れ色。
  const blades = [];
  for (let b = 0; b < 9; b++) {
    const a = b * 2.4, lean = 0.12 + (b % 3) * 0.08, hgt = 1 + (b % 4) * 0.18;
    const g = new THREE.PlaneGeometry(0.06, hgt, 1, 2);
    const pp = g.attributes.position;
    for (let v = 0; v < pp.count; v++) { const y = pp.getY(v) + hgt / 2; pp.setX(v, pp.getX(v) * (1 - y / hgt * 0.8)); pp.setY(v, y); pp.setZ(v, y * y * lean); }
    g.rotateY(a); g.translate(Math.cos(a) * 0.12, 0, Math.sin(a) * 0.12);
    const c = g.attributes.position.count, cl = new Float32Array(c * 3);
    for (let v = 0; v < c; v++) { const y = g.attributes.position.getY(v) / hgt; cl[v * 3] = 0.30 + y * 0.32; cl[v * 3 + 1] = 0.36 + y * 0.22; cl[v * 3 + 2] = 0.16 + y * 0.12; }
    g.setAttribute('color', new THREE.BufferAttribute(cl, 3)); g.deleteAttribute('uv');
    blades.push(g);
  }
  const reedGeo = mergeGeometries(blades); for (const g of blades) g.dispose();
  const reed = new THREE.InstancedMesh(reedGeo, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), reeds.length);
  reeds.forEach(([x, z, s, v], i) => {
    pose.position.set(x, W.heightAt(x, z) - 0.05, z); pose.rotation.set(0, v * 6.28, 0);
    pose.scale.set(s, s * (1.1 + v * 0.5), s); pose.updateMatrix(); reed.setMatrixAt(i, pose.matrix);
  });
  reed.computeBoundingSphere(); rt.scene.add(reed);
}

const domyoji = {
  noEnemyFootRing: true,   // 11/18 05:40 クラウド kaito2 ⑥写真200秒：狙う敵の足元の太い輪が兵のいない草の上に浮いて見えた→敵は頭上の▼だけ（木津川口と同じ）
  resumeSteps: [[1, 'advance'], [2, 'attack'], [3, 'charge'], [4, 'susukida']],   // 戦の途中の保存（battle_checkpoint.js）：段の始まりを、段の関数を順に流して作り直す
  spawn: { x: MIZUNO.x + 3, z: MIZUNO.z + 4, heading: -Math.PI / 2 },
  world: {
    // 11/18 03:30 クラウド kaito2（K285「本物の兵しか映したらいけない」・act bot が数えた見せかけの兵 3843〜4032人）：絵だけの兵を作らない。
    //   遠景の大軍（DA）・瀬の控え（KIT.backOf）は空の入れ物になり、本人が近づいた所から本物の備に替わる（depth_real.js）
    noFake: true,
    seed: 1615,
    time: 'day',
    mist: true,
    muddy: 0.3,
    paths: [[[178, 30], [110, 20], [60, 10], [30, 26], [-20, 20], [-60, 14], [-110, 30], [-178, 40]]],
    height,
    tint(x, z, h, c) {
      // 小松山の雑木と岩
      if (h > 6) c.setRGB(c.r * 0.84, c.g * 0.93, c.b * 0.82);
      // 石川の川原
      let d = Infinity;
      for (let i = 0; i < ISHI.length - 1; i++) { const [ax, az] = ISHI[i], [bx, bz] = ISHI[i + 1]; if (z >= az && z <= bz) d = Math.abs(x - (ax + (bx - ax) * (z - az) / (bz - az))); }
      if (d < 12) { const k = 1 - d / 12; c.setRGB(c.r * (1 - 0.5 * k) + 0.27 * k, c.g * (1 - 0.5 * k) + 0.26 * k, c.b * (1 - 0.5 * k) + 0.22 * k); }
    },
    clear: (x, z) => x > -40 && x < 110 && Math.abs(z) < 90 && Math.hypot(x - KOMA.x, z - KOMA.z) > 26,
    fieldStage: 'seedling',   // 稲の育ちと水の有無を合わせる（細かな収穫時期は推定）
    paddy(x, z) {
      if (x < 40 || x > 130 || z < -80 || z > 90 || Math.abs(z - 16) < 6) return 0;
      if ((Math.floor(x / 13) + Math.floor(z / 11)) % 3 === 1) return 0;
      const ex = Math.min(((x % 13) + 13) % 13, 13 - ((x % 13) + 13) % 13), ez = Math.min(((z % 11) + 11) % 11, 11 - ((z % 11) + 11) % 11);
      return Math.max(0, Math.min(1, (Math.min(ex, ez) - 0.8) / 0.6)) * 0.8;
    },
    streams: [{ pts: ISHI, w: 6, depth: 1.3 }],
    trees: 420,
    tufts: 4200,
    treeDensity: (x, z) => (Math.hypot(x - KOMA.x, z - KOMA.z) < 30 ? 0.55 : x > 130 || Math.abs(z) > 110 ? 1 : 0.2),
    groves: [{ x: KOMA.x - 6, z: KOMA.z + 14, r: 10, n: 16 }, { x: KOMA.x + 16, z: KOMA.z - 12, r: 9, n: 14 }, { x: KOMA.x - 14, z: KOMA.z - 16, r: 9, n: 12 }, { x: HONDA.x + 10, z: HONDA.z + 20, r: 16, n: 26 }, { x: -96, z: -50, r: 12, n: 16 }],
    // 退く豊臣の兵は、石川の向こう（西）で消す
    fleeOut: (x, z, team) => team === 1 && x < -80,
  },

  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    F.step = 0; F.fog = 1; F.ek = 0; F.ak = 0;
    // 11/18 07:50 クラウド kaito2（⑥の写真 200秒：討たれた旗持ちの幟の布が、手前の草の上に斜めに寝た黒い大きな板に見えた）：木津川口・岩村と同じく、落ちた幟は竿だけ残し布を隠す
    { const A = rt.army, dw = A.dropWeapon; if (dw) A.dropWeapon = function (u) { dw.call(this, u); if (u.dropped?.userData?.standard && u.standardFlag && u.dropped.parent === this.scene) u.standardFlag.visible = false; }; }
    // ---- 徳川方：水野勝成の手（自分の持ち場）・本多忠政・松平忠明 ----
    F.miz = allyGroup(rt, { faction: 'tokugawa', name: '水野勝成の手', anchor: { ...MIZUNO }, facing: -Math.PI / 2, width: 14, aggro: 7, noRout: true, formation: 'yari' },
      dress([{ type: 'busho', n: 1, o: { name: '水野勝成', invuln: true, horse: true, hat: 'kabuto_m', haori: 0x3a2a1a } }, { type: 'ashigaru', n: 16 }, { type: 'gun', n: 4 }], MIZ));
    F.mizU = F.miz.units[0];
    F.honda = allyGroup(rt, { faction: 'tokugawa', name: '本多忠政の手', anchor: { x: MIZUNO.x + 4, z: MIZUNO.z - 26 }, facing: -Math.PI / 2, width: 14, aggro: 7, noRout: true, formation: 'yari' },
      dress([{ type: 'samurai', n: 1, o: { name: '本多忠政', invuln: true, horse: true, hat: 'kabuto_w', haori: 0x2a2a2a } }, { type: 'ashigaru', n: 14 }, { type: 'bow', n: 3 }], MIZ));
    F.matsu = allyGroup(rt, { faction: 'tokugawa', name: '松平忠明の手', anchor: { x: MIZUNO.x + 6, z: MIZUNO.z + 26 }, facing: -Math.PI / 2, width: 14, aggro: 7, noRout: true, formation: 'yari' },
      dress([{ type: 'samurai', n: 1, o: { name: '松平忠明', invuln: true, horse: true, hat: 'kabuto_m', haori: 0x2a3a2a } }, { type: 'ashigaru', n: 14 }, { type: 'gun', n: 3 }], MIZ));
    F.east = [F.miz, F.honda, F.matsu];
    // 11/18 03:45 クラウド kaito2（act bot「6分で5人・斬り合う相手が少なくて退屈」・味方の討ち取り95）：味方の三手の刃 0.8→0.65。敵を本人の槍に残す
    for (const g of F.east) { g.defMult = 1.25; g.dmgMult = 0.65; }
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: MIZUNO.x + 4, z: MIZUNO.z + 7 }, -Math.PI / 2, [{ kind: 'spear', n }]);

    // ---- 豊臣方：小松山の後藤又兵衛 ----
    F.g1 = soften(enemyGroup(rt, { faction: 'toyotomi', name: '後藤の先手', anchor: { x: KOMA.x + 12, z: KOMA.z + 4 }, facing: Math.PI / 2, fleeDir: { x: -1, z: 0 }, aggro: 10, width: 14, noRout: true, formation: 'yari', dmgMult: 0.75, defMult: 1.6 },
      dress([{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 26 }, { type: 'gun', n: 7 }], GOTO)), 0.7);   // 11/18 04:25 K281：90秒の60m内の敵が30人前後→先手の槍 20→26
    // 11/18 16:50 クラウド kaito2（act bot 16:35「ちょっと簡単すぎる・受けた傷0・7分で34人」）：後藤の先手の槍の刃 0.62→0.75
  // 11/18 03:15 クラウド kaito2（act bot「歯ごたえがない・無傷で17〜33人」・受けた傷は鉄砲8か0）：槍の本人へ刀の敵は届かない（共通の間合い）。
    //   小松山の上から撃ち下ろす後藤の鉄砲（journey の痛み「山の上の鉄砲」）を5→7挺・弾の重さ0.4→0.7倍にし、斜面を登る間に傷を負う様にした
    F.gotoG = soften(enemyGroup(rt, { faction: 'toyotomi', name: '後藤又兵衛の旗本', anchor: { x: KOMA.x - 2, z: KOMA.z - 2 }, facing: Math.PI / 2, fleeDir: { x: -1, z: 0 }, aggro: 6, width: 10, noRout: true, dmgMult: 0.62, defMult: 1.4 },
      dress([{ type: 'busho', n: 1, o: { name: '後藤又兵衛', invuln: true, horse: true, hat: 'kabuto', haori: 0, flagScale: 1.3 } }, { type: 'samurai', n: 4 }, { type: 'ashigaru', n: 22 }], GOTO)));   // 11/18 04:25 K281：旗本の槍 18→22
    // 11/18 03:35 クラウド kaito2（K285 で小松山の頂の絵の兵90人を無くした分・90秒に本人から60m内の敵が24人）：後藤の与力・山田外記の組を本物で立てる。
    //   山田外記・古沢満興は又兵衛とともに小松山で討死した（通説）。頂の北の肩に槍を揃え、寄せの段で先手と一緒に下る
    F.yamada = soften(enemyGroup(rt, { faction: 'toyotomi', name: '山田外記の組', anchor: { x: KOMA.x + 8, z: KOMA.z - 14 }, facing: Math.PI / 2, fleeDir: { x: -1, z: 0 }, aggro: 9, width: 12, noRout: true, formation: 'yari', dmgMult: 0.62, defMult: 1.6 },
      dress([{ type: 'samurai', n: 1, o: { name: '山田外記' } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 20 }, { type: 'gun', n: 2 }], GOTO)), 0.7);   // 11/18 05:20 K281：90秒 60m内の敵が33〜44人で揺れる→山田の組 18→25人
    F.gotoU = F.gotoG.units[0];
    F.gotoU.dmg *= 0.5;   // 馬上の将は、足軽ひとりを斬り伏せるより兵を率いて押す役

    // ---- 陣と旗 ----
    for (const [x, z, k] of [[KOMA.x - 4, KOMA.z - 6, 'toyotomi'], [KOMA.x + 6, KOMA.z + 2, 'toyotomi'], [KOMA.x + 2, KOMA.z - 10, 'toyotomi']]) rt.scene.add(nobori(W, x, z, k, 6));
    // 小松山の頂に後藤の陣幕。霧の中でも山の上の陣と分かる。
    // 11/17 K365（見回り：又兵衛の旗本が幕の内で生まれ、東へ駆け下りる時に幕の東の布 x≈6.4 に当たって16人が一点に重なった）：
    //   幕を頂の西（後ろ）へ14m 寄せ（8m では西の端の侍5人がまだ幕の内で生まれた）、旗本は幕の前（東）に立つ。幕は山の上の陣の印のまま
    // 11/18 クラウド kaito2（act bot：又兵衛を追って幕の内へ入った本多の手が、4m の口から出られず60秒立ち尽くした）：口を南6m・北6m に開ける
    rt.scene.add(jinmaku(W, KOMA.x - 17, KOMA.z - 3, 12, 8, 6, { mon: 'toyotomi', gapNorth: 6 }));
    kawara(rt);
    // 国分の徳川の陣：大和口の総大将と旗本（見に行けば大将がいる。控えは軽い兵）
    camp(rt, { x: 150, z: 20, facing: -Math.PI / 2, team: 0, faction: 'tokugawa', mon: 'tokugawa', armor: 0x24221f,
      general: { name: '松平忠輝', hat: 'kabuto_m', haori: 0x2a2a3a }, guard: 15, reserve: 200, runTo: { x: MIZUNO.x + 8, z: MIZUNO.z } });
    for (const [x, z, k] of [[144, 14, 'tokugawa'], [156, 14, 'tokugawa'], [MIZUNO.x - 6, MIZUNO.z - 8, 'mizuno'], [MIZUNO.x - 6, MIZUNO.z + 8, 'mizuno']]) rt.scene.add(nobori(W, x, z, k, x > 100 ? 7 : 5));
    // 道明寺の村（石川の西）
    for (const [x, z, r] of [[-86, 18, 0.2], [-96, 34, -0.3], [-80, 44, 0.5], [-104, 8, 0.1]]) rt.scene.add(hut(W, x, z, 7, 5, r, { roof: 0x6a5c44 }));
    rt.scene.add(tawara(W, 100, 24, 0.3, 5));

    // ---- 大軍（軽い作り）：大和口の徳川勢二万三千 ----
    const DA = (x, z, w, d, count, facing, armor, flag, seed) => W.addDistantArmy({ x, z, w, d, count, facing, armor, flagTex: flagTexture(flag), seed });
    const TK = 0x24221f;
    [[120, -40, 'tokugawa'], [126, 60, 'tokugawa'], [150, -10, 'tokugawa'], [160, 70, 'tokugawa'], [110, 110, 'date'], [140, 120, 'date'], [100, -100, 'tokugawa']]
      .forEach(([x, z, f], i) => DA(x, z, 28, 14, 220, -Math.PI / 2, f === 'date' ? DATE.armor : TK, f, 1650 + i));
    // 小松山の上の後藤の兵
    DA(KOMA.x - 8, KOMA.z, 10, 18, 90, Math.PI / 2, GOTO.armor, 'toyotomi', 1660);
    // 誉田に遅れて着く真田・毛利（はじめは見えない）
    F.late = [DA(HONDA.x, HONDA.z, 30, 14, 260, Math.PI / 2, SANADA.armor, 'sanada', 1661), DA(HONDA.x + 6, HONDA.z - 40, 30, 14, 240, Math.PI / 2, TOYO.armor, 'toyotomi', 1662), DA(HONDA.x - 20, HONDA.z + 34, 26, 12, 200, Math.PI / 2, SANADA.armor, 'sanada2', 1663)];
    for (const m of F.late) m.visible = false;

    rt.world.setTime('day');
    rt.setPhase('fog');
    rt.obj('main', '霧の中、水野の手に加わって小松山へ寄せよ', 'main');
    rt.obj('stay', '霧が晴れるまで、水野の旗を離れるな', 'order');
    rt.say('水野勝成', `${nm(rt)}、又兵衛が石川を渡った。あの小松山に陣取っておる`, 5);
    rt.say('水野勝成', '又兵衛は剛の者ぞ。後詰が来ぬうちに、小松山を取る', 4.5);
    rt.bark('朝霧が濃い。水野の旗を見失うな');
    rt.after(16, () => this.advance(rt));
  },

  // ① 霧の中、小松山の麓へ
  advance(rt) {
    const F = rt.flags;
    if (F.step >= 1) return;
    F.step = 1; F.stepT = rt.t;
    rt.setPhase('advance');
    sfx('taiko', 1);
    rt.say('水野勝成', '進め！　山の麓まで槍を揃えて押し出せ！', 3);
    rt.obj('main', HI(rt) ? '水野の先手の一手を預かり、小松山の後藤勢を攻めよ' : '小松山の後藤勢を攻めよ', 'main');
    const go = (g, x, z) => { g.order = 'move'; g.dest = { x, z }; g.speed = 2.2; g.onArrive = (gg) => { gg.order = 'hold'; gg.anchor = { x, z }; gg.aggro = 10; }; };
    go(F.miz, FOOT.x, FOOT.z); go(F.honda, FOOT.x + 4, FOOT.z - 26); go(F.matsu, FOOT.x + 6, FOOT.z + 24);
    // 11/18 17:20 クラウド kaito2（act bot：霧・寄せ・小松山の三段 90秒で討ち取り0＝4〜5段の「物見・小競り合い」が無い）：
    //   霧の中で麓の手前に出ていた後藤の物見の組が、寄せる水野の先手と行き合う（道明寺は霧の中の遭遇戦・通説）。打ち合って崩れたら小松山へ退く
    rt.after(4, () => { if (F.step !== 1 || F.monomi) return;
      const mg = soften(enemyGroup(rt, { faction: 'toyotomi', name: '後藤の物見', anchor: { x: 56, z: 6 }, facing: Math.PI / 2, fleeDir: { x: -1, z: 0 }, order: 'attack', seekRange: 34, aggro: 16, width: 8, formation: 'yari', dmgMult: 0.7, defMult: 1.3, speed: 2.6 },
        dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 8 }, { type: 'gun', n: 2 }], GOTO)), 0.6);
      mg.focus = rt.player.u;
      F.monomi = mg;
      rt.marker('mono', centerOf(mg), '', { red: true, group: mg });   // 物見へ向かう印（字なし）。崩れたら外す
      const off = () => { if (gone(mg) || F.step >= 2) rt.unmark('mono'); else rt.after(1, off); }; rt.after(1, off);
      rt.army.play('eshout', { x: 56, z: 6 }, 1.1);
      rt.say('足軽', '霧の中に人影！　後藤の物見じゃ！', 3);
    });
    rt.after(10, () => { if (F.step === 1) { sfx('volley', 0.6); rt.army.play('gun', { x: KOMA.x + 10, z: KOMA.z }, 1.4); rt.say('足軽', '山の上から鉄砲じゃ！　霧の中から撃ってくる！', 3); } });
    rt.after(22, () => this.attack(rt));
  },

  // 小松山へかかる（又兵衛の先手が山の上で槍を揃える）
  attack(rt) {
    const F = rt.flags;
    if (F.step >= 2) return;
    F.step = 2; F.stepT = rt.t;
    rt.setPhase('komatsu');
    sfx('horagai', 0.9);
    rt.banner('小松山へかかれ', '後藤又兵衛の先手が山の上に');
    rt.say('水野勝成', '山へかかれ！　敵を追い落とせ！', 3);
    for (const g of F.east) { g.order = 'attack'; g.seekRange = 60; g.formation = 'line'; }
    rt.after(6, () => { if (!gone(F.yamada)) { F.yamada.order = 'attack'; F.yamada.seekRange = 50; } });
    rt.marker('g1', centerOf(F.g1), () => `後藤の先手・${moraleWord(F.g1.morale)}`, { red: true, group: F.g1 });
    rt.after(10, () => { rt.army.play('eshout', F.gotoU.pos, 1.6); F.gotoU.cheer = 1.5; rt.say('後藤又兵衛', '小松山は渡さぬ！　一歩も退くな！', 4); });
    rt.after(40, () => this.charge(rt));
  },

  // ② 又兵衛の駆け下り
  charge(rt) {
    const F = rt.flags;
    if (F.step >= 3) return;
    F.step = 3; F.stepT = rt.t;
    rt.setPhase('charge');
    sfx('taiko', 1); rt.after(0.4, () => sfx('horagai', 1));
    rt.banner('又兵衛、山を駆け下る', '後藤の旗本が、寄せ手の中へ');
    rt.say('足軽', '山の上から又兵衛が駆け下りてくるぞ！', 3);
    rt.say('水野勝成', '崩れるな！　槍を立てて受け止めよ！', 3);
    const g = F.gotoG;
    g.order = 'attack'; g.seekRange = 70; g.aggro = 14; g.speed = 3.2;
    // 11/17 K365（見回り：駆け下りの号令で行き先が山の上のまま、的の無い旗本16人が91秒に一点へ重なった）：
    //   持ち場を水野の手の前へ移し、横に広い列で駆け下りる（的が見つかればそのまま斬り合う）
    g.anchor = { x: (KOMA.x + MIZUNO.x) / 2, z: (KOMA.z + MIZUNO.z) / 2 }; g.facing = Math.atan2(MIZUNO.x - KOMA.x, MIZUNO.z - KOMA.z);
    g.formation = 'line'; g.width = Math.max(g.width || 10, 12);
    rt.marker('goto', unitPos(F.gotoU), '後藤又兵衛', { red: true, h: 3.4 });
    rt.after(20, () => { if (!F.gotoDown) rt.banner('奥田忠次、討死', '徳川の先手の将が、又兵衛の兵に討たれる'); });
    // 伊達勢が南から着き、鉄砲を浴びせる
    rt.after(34, () => this.dateArrive(rt));
  },
  dateArrive(rt) {
    const F = rt.flags;
    if (F.dateG) return;
    const g = soften(allyGroup(rt, { faction: 'tokugawa', name: '片倉重長の鉄砲', anchor: { x: 60, z: 90 }, facing: -Math.PI * 0.75, width: 14, aggro: 34, noRout: true, speed: 3.4 },
      dress([{ type: 'samurai', n: 1, o: { name: '片倉重長', invuln: true, horse: true, hat: 'kabuto_m', haori: 0x1a1a2a } }, { type: 'gun', n: 10 }, { type: 'cavalry', n: 4 }], DATE)));
    g.order = 'move'; g.dest = { x: KOMA.x + 26, z: KOMA.z + 30 };
    g.onArrive = (gg) => { gg.order = 'hold'; gg.anchor = { x: KOMA.x + 26, z: KOMA.z + 30 }; gg.facing = -Math.PI * 0.8; gg.aggro = 34; };
    g.focus = F.gotoU;
    F.dateG = g;
    // 11/18 04:20 クラウド kaito2（K281：200秒に本人から60m内の敵が本物8人・先手と山田の組が討たれ尽くして斬る相手が細る）：
    //   後藤の与力・古沢満興（又兵衛とともに小松山で討死・通説）の組を、頂の南の肩から二の手として駆け下ろす。陣の層＝先手・旗本・二の手
    rt.after(30, () => { if (F.furusawa || F.gotoDown) return;
      const fz = soften(enemyGroup(rt, { faction: 'toyotomi', name: '古沢満興の組', anchor: { x: KOMA.x + 6, z: KOMA.z + 14 }, facing: Math.PI / 2, fleeDir: { x: -1, z: 0 }, order: 'attack', seekRange: 70, aggro: 14, width: 14, noRout: true, formation: 'yari', dmgMult: 0.62, defMult: 1.8, speed: 2.8 },
        dress([{ type: 'samurai', n: 1, o: { name: '古沢満興' } }, { type: 'samurai', n: 4 }, { type: 'ashigaru', n: 34 }, { type: 'gun', n: 3 }], GOTO)), 0.7);   // 11/18 05:30 K281：200秒 60m内の敵 30→40人へ（24→34・侍3→4）
      F.furusawa = fz;
      rt.army.play('eshout', { x: KOMA.x + 6, z: KOMA.z + 14 }, 1.4);
      rt.say('足軽', '山の南の肩から、後藤の二の手が下りてくるぞ！', 3);
    });
    // 11/18 05:10 クラウド kaito2（K281：200秒に60m内の敵が30〜36人で揺れる・二の手も味方百人に削られる）：
    //   又兵衛の二千八百の後ろ備えを、二の手の三十秒後に頂の北の肩から下ろす（先手・旗本・二の手・後備えの四層）
    rt.after(58, () => { if (F.atozonae || F.gotoDown) return;
      const az = soften(enemyGroup(rt, { faction: 'toyotomi', name: '後藤勢の後備え', anchor: { x: KOMA.x + 4, z: KOMA.z - 12 }, facing: Math.PI / 2, fleeDir: { x: -1, z: 0 }, order: 'attack', seekRange: 70, aggro: 14, width: 14, noRout: true, formation: 'yari', dmgMult: 0.6, defMult: 1.6, speed: 2.8 },
        dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 18 }, { type: 'gun', n: 2 }], GOTO)), 0.7);
      F.atozonae = az;
      rt.army.play('eshout', { x: KOMA.x + 4, z: KOMA.z - 12 }, 1.2);
    });
    sfx('taiko', 0.8);
    rt.banner('伊達勢、着陣', '片倉重長の鉄砲が、南から又兵衛を撃つ');
    rt.say('伝令', '伊達政宗殿の先手、片倉小十郎殿、着陣！', 3);
    // ここから又兵衛は討たれうる
    rt.after(24, () => { F.gotoU.invuln = false; F.gotoU.announced = true; rt.after(6, () => { if (F.gotoU.alive) F.gotoU.announced = false; }); });
  },

  // 又兵衛が倒れ、小松山の後藤勢が崩れる
  gotoFell(rt, how) {
    const F = rt.flags;
    if (F.gotoDown) return;
    F.gotoDown = true;
    rt.unmark('goto'); rt.unmark('g1');
    rt.banner('後藤又兵衛、討死', how);
    rt.say('足軽', '又兵衛が倒れたぞ！　後藤勢が崩れる！', 3);
    for (const g of [F.g1, F.gotoG, F.yamada, F.furusawa, F.atozonae]) if (!gone(g)) { g.noRout = false; g.morale = Math.min(g.morale, 12); }
    // 11/18 07:35 クラウド kaito2（act bot：283秒に倒れた・瀬の段に入っても後藤勢の後備え・古沢の組が侍の頭を残して本人を追い、手負いの本人を囲んだ）：
    //   又兵衛が討たれた後藤勢は崩れて石川の西へ退いた（通説）。討死の六秒後に残る組を背を向けさせ、西へ退かせる（崩れの見えを残す）
    rt.after(6, () => { for (const g of [F.g1, F.gotoG, F.yamada, F.furusawa, F.atozonae]) if (!gone(g)) {
      if (rt.army.duel && g.units.includes(rt.army.duel.foe)) rt.army.duelEnd(false, '');
      g.routed = true; g.order = 'flee'; g.morale = 0; g.noRout = false; g.focus = null; g.fleeDir = { x: -1, z: 0 };
    } });
    rt.award((t) => { t.side.push('小松山を取った'); }, '小松山を取った');
    rt.after(9, () => this.susukida(rt));
  },

  // ③ 遅れて着いた薄田兼相・明石全登が石川を渡る
  susukida(rt) {
    const F = rt.flags;
    if (F.step >= 4) return;
    F.step = 4; F.stepT = rt.t;
    rt.setPhase('river');
    sfx('taiko', 1);
    rt.banner('薄田兼相・明石全登、着陣', '霧で道を誤り、又兵衛に遅れて着いた');
    rt.say('水野勝成', '石川の向こうに新手じゃ！　瀬を渡らせるな。川べりで止めよ！', 4);
    rt.obj('main', HI(rt) ? '瀬を渡ってくる薄田兼相の隊を止めよ' : '石川の瀬を渡ってくる薄田兼相の隊を止めよ', 'main');
    rt.obj('stay', '川を渡って追うな。東の岸に留まれ', 'order');
    F.strayed = false;
    const go = (g, x, z) => { g.order = 'move'; g.dest = { x, z }; g.speed = 2.6; g.formation = 'yari'; g.onArrive = (gg) => { gg.order = 'hold'; gg.anchor = { x, z }; gg.aggro = 11; gg.facing = -Math.PI / 2; }; };
    // 11/18 03:10 クラウド kaito2（act bot：本多の手が 306〜326秒 (-18,-19) で move のまま止まる）：持ち場 (-26,-20) は陣幕の西の布（x -19）から7m で、
    //   組の横幅（±7m）の東の端の兵が幕に当たっていた。持ち場を幕から離し、瀬の北の岸 (-30,-12) にする
    go(F.miz, FORD.x + 16, FORD.z); go(F.honda, FORD.x + 14, FORD.z - 18); go(F.matsu, FORD.x + 20, FORD.z + 26);
    // 11/18 08:20 クラウド kaito2：後続の組も瀬の東の岸へ（川を渡って薄田を追わない）
    (F.reG || []).forEach((g, i) => { if (!gone(g)) this.toFord(g, i); });
    // 11/18 クラウド kaito2（act bot：本多忠政の手が (-13,-20) で 261〜321秒 move のまま動かない）：
    //   小松山の頂の西の陣幕（x -19〜-7・z -25〜-17）が、麓から瀬へ向かう本多の真っすぐの道を塞いでいた。幕の南を回らせる
    //   幕の口は南（+z）と北の x -16〜-10。組の横幅（±7m）が幕に掛からないよう、幕の南 13m を東から西へ回らせる
    const hc = F.honda.center(), JX = KOMA.x - 17, JZ = KOMA.z - 3;
    let via = null;
    if (hc && Math.abs(hc.x - JX) < 7.5 && Math.abs(hc.z - JZ) < 5.5) via = [[JX, JZ + 13], [JX - 8, JZ + 13]];
    else if (hc && hc.x > JX - 6 && hc.z < JZ + 6) via = [[JX + 16, JZ + 13], [JX - 8, JZ + 13]];
    if (via) {
      const arrive = F.honda.onArrive, fin = F.honda.dest;
      const step = (i) => { F.honda.dest = { x: via[i][0], z: via[i][1] }; F.honda.onArrive = (gg) => { if (gg.order !== 'move') return; if (i + 1 < via.length) step(i + 1); else { gg.dest = fin; gg.onArrive = arrive; } }; };
      step(0);
    }
    const s = soften(enemyGroup(rt, { faction: 'toyotomi', name: '薄田兼相の隊', anchor: { x: -96, z: 10 }, facing: Math.PI / 2, order: 'attack', seekRange: 90, aggro: 12, width: 14, morale: 90, noRout: true, fleeDir: { x: -1, z: 0 }, dmgMult: 0.46, speed: 2.6 },
      dress([{ type: 'busho', n: 1, o: { name: '薄田兼相', horse: true, invuln: true, hat: 'kabuto_m', haori: 0x4a2a1a } }, { type: 'samurai', n: 3 }, { type: 'ashigaru', n: 18 }], TOYO)));   // 11/17 物差し③：瀬へ寄せる塊を太く（14→22人）
    s.units[0].dmg *= 0.5;
    F.susuU = s.units[0];
    const a = soften(enemyGroup(rt, { faction: 'toyotomi', name: '明石全登の隊', anchor: { x: -100, z: -34 }, facing: Math.PI / 2, order: 'attack', seekRange: 90, aggro: 12, width: 14, morale: 80, fleeDir: { x: -1, z: 0 }, dmgMult: 0.36, speed: 2.4 },
      dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 13 }, { type: 'gun', n: 2 }], TOYO)));   // 11/17 物差し③：12→17人
    F.w4 = [s, a];
    // 二つの隊の後ろに、遅れて着いた豊臣勢の本隊が続く（軽い作り）：瀬へ寄せる波をまとまった数に見せる
    KIT.backOf(rt, s, { flag: 'toyotomi', armor: TOYO.armor, kind: 'spear', w: 18, depth: 12, count: 120, seed: 64 });
    KIT.backOf(rt, a, { flag: 'toyotomi', armor: TOYO.armor, kind: 'mixed', w: 16, depth: 10, count: 90, seed: 65 });
    rt.marker('susu', centerOf(s), () => `薄田兼相の隊・${moraleWord(s.morale)}`, { red: true, group: s });
    rt.marker('akashi', centerOf(a), () => `明石全登の隊・${moraleWord(a.morale)}`, { red: true, group: a });
    rt.after(25, () => { for (const u of s.units) if (u.type === 'busho') u.invuln = false; });
    rt.after(40, () => { s.noRout = false; });
    // 水野の鉄砲組：東岸に並び、薄田の隊が瀬を渡りきる前に一斉に放つ（勝ち筋：川の中で足の止まった所を撃つ）
    F.mizGun = allyGroup(rt, { faction: 'tokugawa', name: '水野の鉄砲組', anchor: { x: FORD.x + 10, z: FORD.z + 8 }, facing: -Math.PI / 2, width: 12, aggro: 30, noRout: true, formation: 'line', order: 'hold' },
      dress([{ type: 'samurai', n: 1 }, { type: 'gun', n: 9 }], MIZ));
    F.vol = { guns: () => [F.mizGun], foe: () => s, r: 26, max: 60, hit: 40, who: '水野勝成',
      wait: '瀬は一つじゃ。鉄砲組、薄田が川の中で足を取られるまで待て', line: '川の中じゃ！　鉄砲組、放てぇっ！', sub: '薄田の隊が瀬の中で乱れる',
      then: (rt) => rt.say('水野勝成', '乱れた！　岸へ上がる所を、槍で叩き落とせ！', 3) };
  },

  // ④ 誉田に真田・毛利。石川を挟んでにらみ合い、豊臣勢は大坂へ退く
  lateArrive(rt) {
    const F = rt.flags;
    if (F.step >= 5) return;
    F.step = 5; F.stepT = rt.t;
    rt.setPhase('late');
    rt.unmark('susu'); rt.unmark('akashi');
    for (const g of F.w4) if (!gone(g)) { g.noRout = false; g.morale = 0; }
    rt.objDone('main');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '道明寺の瀬を守った', pts: 20 }; }, '石川の瀬を守った');
    for (const m of F.late) m.visible = true;
    // 11/18 17:45 クラウド kaito2（本物らしさ・K285：noFake で誉田の遠景の大軍は空の入れ物になり、「赤備えの旗が石川の向こうに並ぶ」の見せ場に兵が一人も立っていなかった）：
    //   誉田に真田信繁の本物の備（赤備えの騎馬と槍）を立てる。渡っては来ない（伊達と当たった後、陣を固めた・通説）。本物の兵の総数が二百未満の時だけ
    if (!F.sanaH && rt.army.units.reduce((n, u) => n + (u.alive && !u.isStruct ? 1 : 0), 0) < 200) {
      F.sanaH = enemyGroup(rt, { faction: 'toyotomi', name: '真田信繁の備', anchor: { x: HONDA.x + 22, z: HONDA.z - 30 }, facing: Math.PI / 2, order: 'hold', aggro: 0, width: 16, morale: 100, noRout: true, formation: 'line', fleeDir: { x: -1, z: 0 } },
        dress([{ type: 'busho', n: 1, o: { name: '真田信繁', horse: true, invuln: true, hat: 'kabuto', haori: 0x8e1f16, flagScale: 1.3 } }, { type: 'cavalry', n: 6 }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 14 }], SANADA));
      for (const u of F.sanaH.units) u.invuln = true;
      F.sanaH.stay = true; F.sanaH._home = { ...F.sanaH.anchor };
    }
    sfx('taiko', 0.9); rt.after(0.5, () => sfx('horagai', 0.8));
    rt.player.cine = { x: HONDA.x, z: HONDA.z, t: 3.5 };
    rt.banner('真田・毛利勢、誉田に着く', '赤備えの旗が、石川の向こうに並ぶ');
    rt.say('足軽', '川の向こうに赤い旗が……！　真田じゃ！', 3);
    rt.say('水野勝成', '渡るな！　伊達勢が誉田で当たっておる。我らはこの岸を固めよ', 4);
    rt.obj('hold', HI(rt) ? '石川の東岸の旗を守り、味方が退くまで敵を討て' : '石川の東岸の旗の前で、豊臣勢が退くまで敵を討て', 'main');
    F.holdEnd = rt.t + 60;
    // 真田の鉄砲が川向こうから撃ちかけてくる（渡っては来ない）
    const g = soften(enemyGroup(rt, { faction: 'toyotomi', name: '真田の鉄砲', anchor: { x: -78, z: 20 }, facing: Math.PI / 2, order: 'hold', aggro: 26, width: 12, morale: 90, noRout: true, fleeDir: { x: -1, z: 0.3 }, dmgMult: 0.4 },
      dress([{ type: 'samurai', n: 1 }, { type: 'gun', n: 5 }, { type: 'ashigaru', n: 8 }], SANADA)));   // 11/17 物差し③：11→14人
    // 11/18 09:45 クラウド kaito2（act bot「無傷で二十人」・東岸の旗は x−32 で、川向こう x−78 の鉄砲の三十歩は届かなかった）：
    //   真田の鉄砲は西の岸の際から東岸の旗まで届かせる（四十八歩・弾の重さは 0.4 のまま）
    for (const u of g.units) if (u.type === 'gun') u.range = 48;
    F.sanaG = g;
    // 11/18 物差し⑥（写真：東岸の60秒、敵が川向こうに立つだけで斬る相手がいない）：
    //   真田の足軽の一手が鉄砲の煙にまぎれて瀬を渡り、東岸の旗へ槍を入れてくる（小競り合い。崩れれば西へ退く）
    rt.after(8, () => {
      if (F.ending) return;
      // 11/18 09:30 クラウド kaito2（POSLOG：x−88 に生まれ、瀬の西で水野勝成と後続に当たって止まり、本人の二十歩内に来ないまま六十秒が終わる）：
      //   瀬の西の岸 x−64 から渡らせ、本人の十二歩内に来るまでは本人だけを狙う（focusOnly）
      const r = soften(enemyGroup(rt, { faction: 'toyotomi', name: '真田の足軽', anchor: { x: -64, z: FORD.z }, facing: Math.PI / 2, order: 'attack', seekRange: 60, aggro: 14, width: 10, morale: 70, fleeDir: { x: -1, z: 0.2 }, dmgMult: 0.5, speed: 2.4 },
        dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 11 }], SANADA)));
      r.dest = { x: FORD.x + 12, z: FORD.z };
      r.focus = rt.player.u;   // 11/18 歯ごたえ（act bot『無傷で30人』）：渡ってくる足軽は本人の槍先を狙う
      r.focusOnly = true;
      F.sanaR = r;
      rt.say('足軽', '赤備えが瀬を渡ってくるぞ！', 3);
    });
    rt.after(22, () => {
      rt.army.play('eshout', { x: HONDA.x, z: HONDA.z }, 1.2);
      rt.banner('誉田の戦い', '伊達勢と真田勢がぶつかり、押し戻される');
      rt.say('伝令', '伊達勢が押し戻され申した！　真田は追わず、陣を固めておりまする', 4);
    });
    rt.after(44, () => {
      rt.say('', '――日が傾くころ、大坂城から退けの下知が届いた。真田信繁は殿（しんがり）となって、兵をまとめて退いたという', 5.5);
      rt.after(5.5, () => rt.say('真田信繁', '関東勢百万と候え、男は一人もなく候', 4));
    });
  },

  // 後続の組を瀬の東の岸の二の列へ（i で南北にずらす）。
  //   11/18 08:45 クラウド kaito2（POSLOG：岸の前の列 x−22 では水野・本多の手と押し合い、x−18 で move のまま百秒止まった）：前の三手の十歩後ろに控える
  toFord(g, i) {
    const x = FORD.x + 32, z = FORD.z + ((i % 3) - 1) * 12;
    g._fi = i;
    g.order = 'move'; g.dest = { x, z }; g.speed = 2.8;
    g.onArrive = (gg) => { gg.order = 'hold'; gg.anchor = { x, z }; gg.aggro = 11; gg.facing = -Math.PI / 2; };
  },
  susuDuel(rt, u) { this.namedDuel(rt, u, 'susu', ['薄田兼相', '我こそは薄田隼人正兼相！　その首、この瀬で貰い受ける！']); },
  // 名のある将が隊ごと本人へ寄せて名乗り、一騎打ちを挑む（k＝flags の鍵の頭・line＝名乗りの台詞）
  namedDuel(rt, u, k, line, callD = 55, nameD = 12) {
    const F = rt.flags, P = rt.player.u, g = u.group;
    const d = Math.hypot(u.pos.x - P.pos.x, u.pos.z - P.pos.z);
    const drop = () => { F[k + 'Call'] = 0; F[k + 'DuelOn'] = 0; u.duelOpponent = false; if (g && g.focus === P) g.focus = null; if (g) g.noRout = false; };
    if (F[k + 'DuelOn']) {
      if (u.alive && P.alive && d < 24 && (rt.army.duel || rt.t - F[k + 'DuelOn'] < 3)) return;
      if (rt.army.duel && rt.army.duel.foe === u) rt.army.duelEnd(false, '');
      drop(); return;
    }
    if (F[k + 'Call']) {
      // 隊ごと瀬を渡って本人へ寄せ、十二歩まで来たら名乗る（遠くで名乗ると輪が川の中に出来る）
      if (!u.alive || !P.alive || g.routed || P.pos.x < -60 || rt.t - F[k + 'Call'] > 45) { drop(); return; }
      if (d < nameD && !rt.army.duel) {
        F[k + 'DuelOn'] = rt.t; u.duelOpponent = true; u.dmg *= 1.6;
        rt.say(line[0], line[1], 3.5);
      }
      return;
    }
    if (F[k + 'DuelDone'] || !u.alive || u.invuln || u.fleeing || !g || g.routed || !P.alive || P.hp < P.maxHp * 0.65 || rt.army.duel) return;
    if (d > callD || P.pos.x < -60) return;
    F[k + 'DuelDone'] = true; F[k + 'Call'] = rt.t;
    g.focus = P; g.noRout = true; g.order = 'attack'; g.seekRange = 60;
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.objDone('hold');
    if (!F.strayed) rt.objDone('stay');
    if (F.sanaG && !gone(F.sanaG)) { F.sanaG.noRout = false; F.sanaG.morale = 0; }
    if (F.sanaR && !gone(F.sanaR)) F.sanaR.morale = 0;
    for (const m of F.late) m.visible = false;
    // 11/18 17:45 クラウド kaito2：真田が殿となって兵をまとめて退いた（通説）＝崩れではなく、隊の形のまま西（大坂）へ歩いて退く
    if (F.sanaH && !gone(F.sanaH)) { const g = F.sanaH, c = g.center(); g.focus = null; g.order = 'move'; g.dest = { x: Math.max(-168, c.x - 70), z: c.z }; g.speed = 1.6; g.aggro = 0; g.onArrive = (gg) => { gg.order = 'hold'; }; }
    sfx('horagai', 0.8);
    rt.banner('豊臣勢、大坂へ退く', '道明寺の戦、終わる');
    rt.say('水野勝成', `${nm(rt)}、よう働いた。明日はいよいよ大坂じゃ。天王寺口で決着がつく`, 4.5);
    rt.player.u.invuln = true;
    rt.finish({}, 10);
  },

  update(rt, dt) {
    const F = rt.flags;
    const p = rt.player.u.pos;
    // 控えは前の隊が崩れたら一緒に崩れる（KIT.backTick は遠くの軍勢まで本物に替えるので、崩れだけを見る）
    for (const q of F.backs || []) if (!q.gone && (q.g.routed || !q.g.count)) { q.gone = true; q.b.rout({ hideAfter: 16 }); rt.after(16.5, () => { q.b.visible = false; }); }
    // 11/18 08:20 クラウド kaito2（POSLOG：水野・本多・松平の三手が 150秒までに大将ひとりずつになり、本人が後藤勢百五十の中に孤立。
    //   act bot は囲まれて退き続け、駆け下りの段の討ち取り0〜2）：徳川の先手は一万二千余り。小松山から瀬の段まで、減った手へ東から後続の組を送る。
    //   討たれた分の入れ替えだけ（本物の兵の総数は増やさない・一戦で五組まで・同じ手へは四十秒あけて）
    //   瀬の段から後は、後続の組が川の中まで追って出たら東の岸の持ち場へ戻す（POSLOG：x−60 まで出て真田の方へ渡りかけた）
    if (F.step >= 4 && F.reG && (F.leashT = (F.leashT || 0) - dt) <= 0) {
      F.leashT = 1;
      // 11/18 09:20 クラウド kaito2（POSLOG：東岸の六十秒、瀬を渡る真田の足軽を後続の組が x−55 まで出て囲み、本人の前へ一人も来ず e20:0 のまま終わる）：
      //   東岸の段では後続を本人の後ろ（瀬から二十歩）より前へ出さない・寄せの間合いも短く（渡ってくる足軽は本人の槍で受ける）
      const lim = F.step >= 5 ? FORD.x + 20 : FORD.x - 2;
      for (const g of F.reG) if (g._fi !== undefined && g.count) {
        if (F.step >= 5) g.aggro = Math.min(g.aggro || 6, 6);
        if (g.order !== 'move' && g.center().x < lim) this.toFord(g, g._fi);
      }
    }
    // 11/18 15:20 クラウド kaito2（act bot 261秒★★：瀬の西 (-106,5)・(-97,8) で薄田の控えが本物になった『遠くの備』五人が hold のまま
    //   百五十秒重なって立ち、薄田が崩れても退かなかった）：控えは前の隊に二十秒遅れて瀬へ続く二の波にし、前の隊が崩れたら一緒に西へ退く
    if (F.step >= 4 && (F.bkT = (F.bkT || 0) - dt) <= 0) {
      F.bkT = 1;
      const fall = F.step >= 5 || F.w4.every((g) => gone(g) || g.routed);
      for (const g of rt.army.groups) {
        if (g.team !== 1 || !g._fjN || !g.count || g.routed) continue;
        if (F.step === 4) g._dmyBk = true; else if (!g._dmyBk) continue;   // 誉田に着く真田・毛利の備は崩さない
        if (fall) { g.routed = true; g.order = 'flee'; g.morale = 0; g.noRout = false; g.focus = null; g.fleeDir = { x: -1, z: 0 }; }
        else if (g.order === 'hold' && rt.t - F.stepT > 20 && g.center().x < FORD.x - 20) {
          g.depthFree = true; g.order = 'attack'; g.seekRange = 90; g.aggro = 12; g.speed = 2.6; g.dmgMult = Math.min(g.dmgMult ?? 1, 0.46);
        }
      }
    }
    // 誉田の真田の備は陣を固めたまま（川へ寄って来たら持ち場へ戻す）。退けの下知の後は win で西へ歩かせる
    if (F.sanaH && !F.ending && F.sanaH.count && (F.shT = (F.shT || 0) - dt) <= 0) {
      F.shT = 1; const g = F.sanaH, c = g.center(), h = g._home;
      if (c && Math.hypot(c.x - h.x, c.z - h.z) > 8 && g.order !== 'move') { g.focus = null; g.order = 'move'; g.dest = { ...h }; g.speed = 2.4; g.onArrive = (gg) => { gg.order = 'hold'; gg.anchor = { ...h }; gg.facing = Math.PI / 2; }; }
    }
    if (F.step >= 2 && F.step <= 4 && (F.reT = (F.reT || 0) - dt) <= 0) {
      F.reT = 4;
      const A = rt.army, P = rt.player.u;
      const real = A.units.reduce((a, u) => a + (u.alive && !u.isStruct ? 1 : 0), 0);
      const g = (F.reN || 0) < 5 && real < 230 && F.east.find((e) => e.count <= 4 && !(e._reAt > rt.t - 40));
      if (g) {
        F.reN = (F.reN || 0) + 1; g._reAt = rt.t;
        const c = g.center(), x = Math.max(c.x, P.pos.x) + 34;
        const r = allyGroup(rt, { faction: 'tokugawa', name: g.name.replace('の手', 'の後続'), anchor: { x, z: c.z }, facing: -Math.PI / 2, width: 12, aggro: 12, order: 'attack', seekRange: 80, noRout: true, formation: 'yari', speed: 3 },
          dress([{ type: 'samurai', n: 1, o: { keep: true } }, { type: 'ashigaru', n: 10, o: { keep: true } }], MIZ));
        r.defMult = 1.25; r.dmgMult = 0.45;   // 後続は列を支える役（後藤勢を本人の槍に残す）
        (F.reG ||= []).push(r);
        if (F.step >= 4) this.toFord(r, F.reN);
      }
    }
    // 朝霧（関ヶ原と同じ作り）：はじめは一町先も見えず、しだいに晴れる
    F.fog = rt.t < FOG_T0 ? 1 : Math.max(0, 1 - (rt.t - FOG_T0) / (FOG_T1 - FOG_T0));
    if (F.fog > 0) {
      const f = rt.scene.fog, k = F.fog;
      f.near = Math.min(f.near, lerp(40, 3, k));
      f.far = Math.min(f.far, lerp(230, 36, k));
      if (!F.fogCol) F.fogCol = f.color.clone();
      f.color.copy(F.fogCol).lerp(MIST, k);
      const W = rt.world, U = W.skyMat && W.skyMat.uniforms;
      if (U && U.top && U.bottom) {
        if (!F.skyCol) F.skyCol = { top: U.top.value.clone(), bottom: U.bottom.value.clone() };
        U.top.value.copy(F.skyCol.top).lerp(MIST, k * 0.9);
        U.bottom.value.copy(F.skyCol.bottom).lerp(MIST, k);
      }
      if (W.mountU) { W.mountU.mist.value = Math.max(W.mountU.mist.value, k); W.mountU.hazeCol.value.copy(f.color); }
      for (const m of (W.mountains && W.mountains.children) || []) if (m.material.uniforms && m.material.uniforms.haze) m.material.uniforms.haze.value = Math.max(m.material.uniforms.haze.value, k);
    } else if (F.fogCol && !F.fogClear) {
      F.fogClear = true;
      rt.scene.fog.color.copy(F.fogCol);
      const U = rt.world.skyMat && rt.world.skyMat.uniforms;
      if (U && F.skyCol) { U.top.value.copy(F.skyCol.top); U.bottom.value.copy(F.skyCol.bottom); }
      rt.banner('霧が晴れた', '小松山と石川の河原が見える。豊臣の後詰の旗は、まだ見えない');
      if (!F.strayed && F.step < 4) { rt.objDone('stay'); rt.objRemove('stay'); }
    }
    if (F.ending) return;
    volleyTick(rt, dt, F.vol);
    // 霧の間、水野の旗から離れたか
    if (F.step >= 1 && F.step < 4 && F.fog > 0.25 && !F.strayed) {
      const d = Math.hypot(p.x - F.mizU.pos.x, p.z - F.mizU.pos.z);
      F.strayT = d > 26 ? (F.strayT || 0) + dt : 0;
      if (F.strayT > 4) { F.strayed = true; rt.violation('霧の中で持ち場を離れた', ['水野勝成', '戻れ！　霧の中で旗を見失えば、討たれるだけじゃ！']); rt.objFail('stay'); }
    }
    // 瀬を守る間は、石川を渡って追わない
    if (F.step >= 4 && !F.strayed && p.x < -60) {
      F.strayT = (F.strayT || 0) + dt;
      if (F.strayT > 4) { F.strayed = true; rt.violation('下知なく石川を渡った', ['水野勝成', '渡るなと申したはずじゃ！　川向こうには真田がおるぞ！']); rt.objFail('stay'); }
    } else if (F.step >= 4) F.strayT = 0;
    if (F.step === 2 || F.step === 3) {
      // 11/18 07:25 クラウド kaito2：後備え（58秒後に頂の北の肩から下りる）も後藤勢。右上の数に入れる（前は後備え十七人が斬り合っているのに数に無かった）
      const live = [F.g1, F.gotoG, F.yamada, F.furusawa, F.atozonae].reduce((a, g) => a + (gone(g) ? 0 : g.count), 0);
      rt.objProgress('main', `後藤勢 ${live}人`);
      // 先手が弱れば又兵衛の旗本も前へ（待ちを作らない）
      // 11/18 15:30 クラウド kaito2（POSLOG：先手が崩れて西へ逃げても赤い印が先手に付いたまま (30,1)→(5,1)→(-19,0) と動き、
      //   本人が印を追って味方から離れ、囲まれて退き続けた＝駆け下りの段の討ち取り0〜6）：先手が崩れたら印を、まだ戦う後藤勢の一番大きい組へ移す
      //   （旗本の組は名が伏せられて印が出ないので外す。移す先がまだ無ければ一秒ごとに見直す）
      if (!F.gotoDown && rt.t >= (F.g1MkT || 0)) {
        F.g1MkT = rt.t + 1;
        const cur = F.g1Mk || F.g1;
        if (gone(cur) || cur.order === 'flee') {
          const ng = [F.furusawa, F.atozonae, F.yamada].filter((g) => !gone(g) && g.order !== 'flee').sort((a, b) => b.count - a.count)[0];
          if (ng) { F.g1Mk = ng; F.g1Off = false; rt.marker('g1', centerOf(ng), () => `${ng.name}・${moraleWord(ng.morale)}`, { red: true, group: ng }); }
          else if (!F.g1Off) { F.g1Off = true; rt.unmark('g1'); }
        }
      }
      if (F.step === 2 && F.g1.count < 10) this.charge(rt);
      if (F.g1.count < 8) F.g1.noRout = false;
      if (F.yamada.count < 6) F.yamada.noRout = false;
      if (F.furusawa && F.furusawa.count < 6) F.furusawa.noRout = false;
      if (F.atozonae && F.atozonae.count < 6) F.atozonae.noRout = false;
      if (!F.gotoU.alive) this.gotoFell(rt, '伊達勢の鉄砲に撃たれ、小松山に倒れた');
      else if (F.step === 3 && rt.t - F.stepT > 130) {
        // 11/18 07:40 クラウド kaito2（act bot：又兵衛は毎回ここで音もなく倒れていた）：伊達の鉄砲の一斉射の音と硝煙を立ててから倒す（通説＝片倉の鉄砲に撃たれた）
        const dg = F.dateG && !gone(F.dateG) ? F.dateG : null;
        if (dg) { rt.army.play('volley', dg.center(), 1.5); for (const u of dg.units) if (u.alive && u.type === 'gun') { const fx = F.gotoU.pos.x - u.pos.x, fz = F.gotoU.pos.z - u.pos.z, l = Math.hypot(fx, fz) || 1; rt.army.smoke(u.pos.x, u.pos.y + 1.4, u.pos.z, fx / l, fz / l); } }
        F.gotoU.invuln = false; F.gotoU.hp = 0; rt.army.kill(F.gotoU, null); this.gotoFell(rt, '伊達勢の鉄砲に撃たれ、小松山に倒れた'); }
      else if (F.step === 3 && gone(F.gotoG) && gone(F.g1) && gone(F.yamada) && gone(F.furusawa) && gone(F.atozonae)) this.gotoFell(rt, '兵を失い、小松山で力尽きた');
    }
    // 11/18 クラウド kaito2（act bot「ちょっと簡単すぎ・もっと強い奴と斬り合いたい」・受けた傷0）：
    //   瀬で薄田兼相（大坂方きっての豪傑・この瀬で討死）が隊ごと本人へ寄せ、十二歩で名乗って一騎打ちを挑む（army_duel の名乗り・間合い・鍔迫り合い）。
    //   兵の数は変えない。本人の命が六割半を切っていたら挑まない。二十四歩離れるか、討つか討たれれば元の下知へ戻す
    if (F.step === 4 && F.susuU) this.susuDuel(rt, F.susuU);
    // 11/18 04:40 クラウド kaito2（act bot「もっと強い奴と斬り合いたい」）：小松山の段でも、古沢満興が本人へ寄せて名乗る
    // 11/18 07:45 クラウド kaito2（act bot 166秒・210秒：駆け下りた又兵衛の旗本の足軽が、本人の三歩内で的を持たず六秒立つ）：
    //   一秒ごとに、本人の三歩半内で的の無い後藤勢の兵に本人を狙わせる（一騎打ちの間は割り込まない決まりのまま）
    if (F.step === 3 && !F.gotoDown && !rt.army.duel && (F.nearT = (F.nearT || 0) - dt) <= 0) {
      F.nearT = 1;
      const P = rt.player.u;
      if (P.alive && !P.invuln && !(P.soloFor && P.soloFor.alive)) for (const g of [F.g1, F.gotoG, F.yamada, F.furusawa, F.atozonae]) if (!gone(g)) for (const u of g.units) {
        if (!u.alive || u.fleeing || u.target || u.atk || u.name || u.type === 'gun' || Math.abs(u.pos.y - P.pos.y) > 1.5 || Math.hypot(u.pos.x - P.pos.x, u.pos.z - P.pos.z) > 3.5) continue;
        u.target = P; u.aiT = 0.8;
      }
    }
    if (F.step === 3 && F.furusawa && !F.gotoDown) this.namedDuel(rt, F.furusawa.units[0], 'furu', ['古沢満興', '後藤又兵衛が与力、古沢満興！　小松山は一歩も渡さぬ！'], 26, 16);   // 遠くで呼ぶと味方と斬り合ううちに45秒が過ぎる（描かず 43m で止まった）
    if (F.step === 4) {
      const live = F.w4.reduce((a, g) => a + (gone(g) ? 0 : g.count), 0);
      rt.objProgress('main', `薄田・明石 ${live}人`);
      if (F.w4.every(gone) || rt.t - F.stepT > 110) this.lateArrive(rt);
    }
    if (F.step === 5) {
      const sr = F.sanaR;
      if (sr && sr.focusOnly && (!rt.player.u.alive || gone(sr) || (() => { const c = sr.center(); return Math.hypot(c.x - p.x, c.z - p.z) < 12; })())) sr.focusOnly = false;
      const left = Math.max(0, Math.ceil(F.holdEnd - rt.t));
      rt.objProgress('hold', `豊臣勢が退くまで ${left}秒`);
      if (left <= 0) this.win(rt);
    }
  },

  onKill(rt, v, k) {
    const F = rt.flags;
    // 11/18 07:20 クラウド kaito2（⑥の悪い所③：200秒に敵の数が 1,600→575 と速く減り、小松山に本物の兵が百人立つうちに二千八百が尽きた）：
    //   小松山の後藤勢の本物は五組で百五十二人。一人討つごとに 2800/152≒18人 減らす（瀬・東岸の後詰は 25人のまま）
    if (v.team === 1) { F.ek = (F.ek || 0) + 1; F.eLoss = (F.eLoss || 0) + (F.step >= 4 ? 25 : 18); } else F.ak = (F.ak || 0) + 1;
    if (v.type === 'busho' && v.team === 1) {
      if (v === F.gotoU) return;
      if (!(k && k.isPlayer)) rt.banner(`${v.name}、討死`, '道明寺の河原に倒れる');
      if (v.group) { v.group.noRout = false; v.group.morale -= 35; }
    }
  },
  onRout(rt, g) {
    const F = rt.flags;
    if (g.team !== 1) return;
    if (g === F.g1) rt.say('足軽', '後藤の先手が崩れたぞ！', 2.5);
    else if (g === F.sanaG) return;
    else rt.say('足軽', `${g.name}が崩れた！`, 2.5);
  },
};

// 両軍の総勢（戦国大名に合わせ、徳川 二万三千、豊臣 一万二千。はじめは後藤の二千八百だけ。後詰は遅れて着く）
domyoji.force = (rt) => {
  const F = rt.flags;
  const arrived = 2800 + (F.step >= 4 ? 3600 : 0) + (F.step >= 5 ? 5600 : 0);
  return { a: Math.round(23000 - (F.ak || 0) * 40), a0: 23000, b: Math.max(0, arrived - (F.eLoss || 0)), b0: 12000 };
};
domyoji.canSkip = (rt) => (rt.phase === 'fog' && rt.t > 3 ? '寄せの下知まで待つ' : '');
domyoji.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
domyoji.sides = { a: { name: '徳川方（大和口）', mon: 'tokugawa' }, b: { name: '豊臣方', mon: 'toyotomi' } };
domyoji.date = (rt) => {
  const F = rt.flags;
  const w = F.fog > 0.6 ? '朝霧' : F.fog > 0 ? '霧が晴れていく' : '晴';
  const t = rt.t < 120 ? '朝' : rt.t < 260 ? '昼' : '昼下がり';
  return `慶長二十年五月六日　夏・${w}・${t}`;
};
domyoji.history = '慶長二十年（元和元年）五月六日、大坂夏の陣の道明寺の戦い。冬の陣の和睦で堀を埋められた豊臣方は、城を出て戦うほかなかった。後藤又兵衛（基次）は二千八百ほどで夜のうちに石川を渡り、小松山に登って、大和口から来た水野勝成・本多忠政・松平忠明・伊達政宗らの徳川勢を迎え撃った。濃い霧のため、あとに続くはずの真田信繁・毛利勝永らは遅れ、又兵衛は数時間の奮戦の末に討ち死にした。遅れて着いた薄田兼相も討ち死にし、明石全登は傷を負った。昼すぎ、真田勢は誉田の辺りで伊達勢を押し返したのち、大坂城からの下知で兵をまとめて退いた。「関東勢百万と候え、男は一人もなく候」は、この退き際に信繁が言ったと伝わる言葉である。';

// 素直な遊び手：霧の間は水野の旗のそばで戦い、小松山では後藤勢へ、薄田が来れば瀬へ、最後は東岸で待つ
domyoji.botBrain = (b, inp, { goTo }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW');
  if (!u.alive || F.ending) return;
  if (u.hp < u.maxHp * 0.6) b.botRest = true;
  if (b.botRest && u.hp > u.maxHp * 0.85) b.botRest = false;
  const lead = F.mizU.pos;
  if (b.botRest) { inp.guardHold = false; goTo(p, inp, lead.x + 12, lead.z, 2); return; }
  const e = b.army.nearestEnemy(u, F.step >= 2 ? 12 : 7, (o) => !o.fleeing && !o.invuln && o.pos.x > -58 && (F.fog < 0.25 || Math.hypot(o.pos.x - lead.x, o.pos.z - lead.z) < 22));
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d > 2.6) inp.k.add('KeyW');
    if (d < 3.2 && Math.random() < 0.5) inp.leftPressed = true;
    inp.guardHold = (b.army.threats || []).length > 0 && Math.random() < 0.85;
    return;
  }
  inp.guardHold = false;
  if ((F.step === 2 || F.step === 3) && F.fog < 0.3) { const t = [F.g1, F.gotoG].find((g) => !gone(g)); if (t) { const c = t.center(); goTo(p, inp, c.x, c.z, 2); return; } }
  if (F.step === 4) { const t = F.w4.find((g) => !gone(g)); if (t) { const c = t.center(); if (c.x > -56) { goTo(p, inp, c.x, c.z, 2); return; } } goTo(p, inp, FORD.x + 12, FORD.z, 3); return; }
  if (F.step >= 5) { goTo(p, inp, FORD.x + 20, FORD.z, 3); return; }
  goTo(p, inp, lead.x + 5, lead.z + 2, 3);
};

export { domyoji };
