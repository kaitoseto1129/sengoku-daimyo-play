// ======================================================================
// 徳川編 15　天王寺・岡山の戦い（慶長二十年 1615・五月七日）　徳川編とゲーム全体の最終決戦
// 手本と出所：docs/battle_refs/k15_tennoji_okayama.md（Wikipedia・史跡の解説・YouTube の解説）。筋書きの正は docs/chapter3_tokugawa.md の「15」。
// 史実：毛利勝永（木村・後藤の残兵を合わせ約六千五百）が四天王寺の南門の前から本多忠朝・小笠原秀政の先手を破り、忠朝は討死。
//   茶臼山の真田信繁（約三千五百）は家康の本陣を目がけて突き掛かり、本陣は崩れて金扇の馬印が倒れ、家康も退いた。
//   松平忠直の越前勢が横から押し、疲れた真田隊は崩れ、信繁は安居の天神の辺りで越前の西尾宗次に討たれた。大坂城は炎上した。
// 主人公は徳川方の侍。本多忠朝の先手の後ろに付き、先手が崩れた後は大御所の本陣の前で真田の突撃を正面から食い止める。
// 段（段ごとに時間の限り。kaito AP の8）：
// 布陣（11/5 直し・史料は battle_learn）：茶臼山の真田の正面（南）に松平忠直の越前勢（一万五千）が陣し、越前勢は真田の陣を抜けて城へ進み、入れ違いに真田は家康の本陣へ寄せる。
//   本陣は天王寺口の後ろ（南）で旗本一万五千。安居の天神は茶臼山の北（実の三百三十メートルほど・歩いて五分）。
//   ①四天王寺の南で毛利勝永の先手を食い止める ②本陣の前で真田と毛利の突撃を止める（二筋で本陣へ） ③倒れた馬印のもとで二の突撃を止める
//   ④越前勢と真田信繁の旗本を討つ ⑤安居の天神で真田信繁を討つ
// kaito AP〜AV：見せかけの軍勢（addDistantArmy・addClash・陣立て）は置かない。兵は全部本物。
//   真田の兵は主人公ではなく家康の本陣を目がけて走る（近い者とだけ斬り合う）。家康は本陣の旗本（侍）に囲まれ、前に出ない。
//   旗は徳川・本多・真田・豊臣だけ。岡山口（秀忠・大野治房）は遠くの話として使番が知らせるだけ（遊ぶ所に置かない）。
// 向き：北が -z（大坂城）、東が +x。ゲームの 1 は実の 8m（国土地理院の標高・上町台地）。家康の本陣は遊びのため北へ縮めた。
// 重さ：本物の兵は同時に二百五十ほどまで（真田の二番手は先手が崩れてから茶臼山に出す）。
// ======================================================================
import { useTerrain, BATTLE_ASSETS, assetsForBattle } from './asset_manifest.js';
import { demSample } from './dem.js';
import * as THREE from 'three';
import { nobori, jinmaku, kagaribi, umajirushi, dou, solidCircle, castleStoneMat, bridgeWoodMaterial } from './props.js';
import { osakaFar } from './osaka_far.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { allyGroup, enemyGroup, centerOf, nm } from './bhelp.js';
import { distToPolyline } from './world.js';
import { timeslipField } from './timeslip_field.js';
import { KILLS, cut } from './stages.js';
import { setStages } from './b_k_help.js';

BATTLE_ASSETS.k15_tennoji_okayama = Object.freeze([...assetsForBattle('k15_tennoji_okayama'), 'dem_tennoji_okayama']);
let dem = null;
useTerrain('dem_tennoji_okayama', (data) => { dem = data; });

// ---- 場所（ゲームの座標） ----
const START = { x: -46, z: 64 };          // 本多忠朝の先手の後ろ
const FRONT = { x: -46, z: 40 };          // 天王寺口の先手（本多忠朝・小笠原秀政）
const SHITENNO = { x: -46, z: -14 };      // 四天王寺の南門の前（毛利勝永）
const CHAUSU = { x: -106, z: 4 };         // 茶臼山（真田の陣）
const YASUI = { x: -89, z: -37 };         // 安居の天神（茶臼山の北、少し東。実の三百三十メートル・歩いて五分）
const ECHI = { x: -98, z: 54 };           // 茶臼山の正面（南）の越前勢（鉄砲の届く外で向き合う）
const HON = { x: -40, z: 130 };           // 大御所（家康）の本陣
const HONF = { x: -50, z: 112 };          // 本陣の前の持ち場（真田の寄せ道を正面で受ける）
const HON2 = { x: -32, z: 168 };          // 馬印が倒れて家康が退く先
const CASTLE = { x: 60, z: -272 };        // 大坂城（遠景）
const LIMIT = [0, 240, 240, 240, 240, 200];   // 段ごとの時間の限り（秒）
const GOAL_LIMIT = { 1: '毛利勝永の先手に押し切られた', 2: '真田と毛利の突撃を止められなかった', 3: '真田の二の突撃に本陣を破られた', 4: '真田信繁の旗本を討ちきれなかった', 5: '真田信繁を取り逃がした' };

const ROADS = [
  [[-38, 230], [-40, HON.z], [-46, 90], [-46, FRONT.z], [-46, 0], [-26, -6], [-24, -60], [10, -180], [CASTLE.x, CASTLE.z + 30]],
  [[-46, 0], [-68, -26], [YASUI.x, YASUI.z], [CHAUSU.x, CHAUSU.z]],
  [[CHAUSU.x, CHAUSU.z], [-104, 50], [-84, 92], [HONF.x, HONF.z]],   // 茶臼山から本陣への真田の寄せ道
];

const TOYO = { armor: 0x221f1c, flag: 'toyotomi' };                    // 毛利勝永の隊（豊臣の旗）
const SANADA = { armor: 0x8e1f16, lace: 0xb8342a, flag: 'sanada' };     // 真田の赤備え（全員赤）
const TOKU = { armor: 0x1f1e1c, flag: 'tokugawa' };
const HONDA = { armor: 0x1c1a18, flag: 'honda' };
const kit = (side, o = {}) => ({ flag: side.flag, armor: side.armor, ...(side.lace ? { lace: side.lace } : {}), ...o });
const sq = (side, type, n, o) => ({ type, n, o: kit(side, o) });
const alive = (g) => g && !g.routed && g.count > 0;
const near = (p, q, r) => Math.hypot(p.x - q.x, p.z - q.z) < r;
const sum = (gs) => (gs || []).reduce((s, g) => s + (alive(g) ? g.count : 0), 0);
// 味方の隊は持ち場（anchor）を移すだけ。兵は走って付いてくる
const hold = (g, x, z) => { if (!g || g.routed) return; g.anchor.x = x; g.anchor.z = z; g.order = 'hold'; g.dest = null; g.path = null; g.focus = null; };
// 道の点を順に歩かせ、終わりの点で構える
const march = (g, pts) => { if (!alive(g) || !pts.length) return; const [p, ...rest] = pts; g.order = 'move'; g.anchor = { x: p.x, z: p.z }; g.dest = { x: p.x, z: p.z }; g.onArrive = (q) => { q.onArrive = null; if (rest.length) march(q, rest); else hold(q, p.x, p.z); }; };
const flee = (gs) => { for (const g of gs) if (alive(g)) { g.noRout = false; g.routed = true; g.order = 'flee'; } };

// ---- 地形：国土地理院の標高（上町台地の西の崖・茶臼山・東の低い田）を縦に少し強めて写す ----
// 標高の茶臼山の頂（実の二十六メートル。格子の (-99,-25)）をゲームの茶臼山に重ねる（DX・DZ）。安居の天神・四天王寺との向きと距離は史跡の地図どおり
const XY = 8, VZ = 0.36, DX = 7, DZ = -29;
function demAt(x, z) {
  const sx = (x + DX) * XY, sz = (z + DZ) * XY;
  return (demSample(dem, sx, sz) * 2 + demSample(dem, sx + 24, sz) + demSample(dem, sx - 24, sz) + demSample(dem, sx, sz + 24) + demSample(dem, sx, sz - 24)) / 6;
}
function height(x, z) {
  let h = 0.25 * Math.sin(x * 0.05 + 0.7) * Math.cos(z * 0.043) + 0.15 * Math.sin(z * 0.09 - x * 0.03);
  if (dem) h += Math.max(0, demAt(x, z) - 3) * VZ;
  // 茶臼山（古墳の丘。高さは実の二十六メートルほど）。標高の丘に、人の背の倍ほどの盛り上がりを足す（標高が読めない時は丘ごと）
  const dc = Math.hypot(x - CHAUSU.x, z - CHAUSU.z);
  if (dc < 16) { const t = 1 - dc / 16; h += (dem ? 1.8 : 3.2) * t * t * (3 - 2 * t); }
  return h;
}

// ---- 陣の見た目：家康の本陣（陣幕・金扇の馬印・葵の幟）・本多の先手・茶臼山の六文銭・四天王寺の前の豊臣の旗・大坂城 ----
function scenery(rt) {
  const W = rt.world, F = rt.flags;
  rt.scene.add(jinmaku(W, HON.x, HON.z + 6, 16, 12, 6, { mon: 'tokugawa', noUma: true }));
  F.uma = umajirushi(W, HON.x + 3, HON.z - 2, 0, 'ogi');
  rt.scene.add(F.uma);
  // 本陣のまわりの旗本の葵の幟（数千の旗本の旗が並ぶ）
  for (let i = 0; i < 14; i++) { const a = -1.2 + (i / 13) * 2.4, r = 15 + (i % 2) * 5; rt.scene.add(nobori(W, HON.x + Math.sin(a) * r, HON.z + 4 - Math.cos(a) * r * 0.8, 'tokugawa', 6)); }
  for (const [x, z] of [[HON.x - 5, HON.z - 6], [HON.x + 6, HON.z - 6]]) rt.scene.add(kagaribi(W, x, z));
  for (const [x, z] of [[FRONT.x - 10, FRONT.z + 5], [FRONT.x, FRONT.z + 7], [FRONT.x + 10, FRONT.z + 5]]) rt.scene.add(nobori(W, x, z, 'honda', 6));
  for (const [x, z] of [[CHAUSU.x - 5, CHAUSU.z - 3], [CHAUSU.x + 5, CHAUSU.z - 2], [CHAUSU.x, CHAUSU.z + 6], [CHAUSU.x + 9, CHAUSU.z + 7], [CHAUSU.x - 8, CHAUSU.z + 6]]) rt.scene.add(nobori(W, x, z, 'sanada', 6));
  for (const [x, z] of [[SHITENNO.x - 10, SHITENNO.z - 4], [SHITENNO.x + 6, SHITENNO.z - 6], [SHITENNO.x + 16, SHITENNO.z - 4]]) rt.scene.add(nobori(W, x, z, 'toyotomi', 6));
  garanAto(rt);
  yasuiSha(rt);
  // 大坂城（遠景。兵は置かない）：冬の陣の和議で二の丸・惣構えを壊され堀を埋められた「裸城」（osaka_far.js）
  osakaFar(rt, { x: CASTLE.x - 26, z: CASTLE.z + 28, s: 2, era: 'summer', land: [[-200, -700, 300, -301]] });
}

// 四天王寺の伽藍の焼け跡：前の年の冬の陣で焼け、建て直しは元和九年（1623）。南大門から北へ中門・塔・金堂・講堂が一直線（四天王寺式）。
// 基壇と礎石・焦げた柱の根だけが残る
const GARAN = [{ z: -20, nx: 3, nz: 2, s: 2.2, base: 0.25 }, { z: -25.5, nx: 4, nz: 4, s: 1.8, base: 0.45 }, { z: -32.5, nx: 5, nz: 4, s: 2.4, base: 0.5 }, { z: -41, nx: 7, nz: 4, s: 2.5, base: 0.4 }];
let charMat = null, earthMat = null;
function garanAto(rt) {
  const W = rt.world, stone = castleStoneMat('warishiGrain');
  charMat ||= Object.assign(bridgeWoodMaterial().clone(), { color: new THREE.Color(0x1c1814) });
  earthMat ||= new THREE.MeshStandardMaterial({ color: 0x7a6a52, roughness: 1, metalness: 0 });
  const rock = new THREE.DodecahedronGeometry(0.42, 0), stub = new THREE.CylinderGeometry(0.2, 0.24, 1, 7);
  const spots = [];
  for (const b of GARAN) for (let i = 0; i < b.nx; i++) for (let j = 0; j < b.nz; j++) spots.push({ b, x: SHITENNO.x + (i - (b.nx - 1) / 2) * b.s, z: SHITENNO.z + b.z + (j - (b.nz - 1) / 2) * b.s });
  const stones = new THREE.InstancedMesh(rock, stone, spots.length), posts = new THREE.InstancedMesh(stub, charMat, spots.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  let np = 0;
  spots.forEach((p, k) => {
    const y = W.heightAt(p.x, p.z) + p.b.base;
    m.compose(v.set(p.x, y + 0.08, p.z), q.setFromEuler(e.set(0, k * 1.7, 0)), sc.set(1.1, 0.45, 1.1)); stones.setMatrixAt(k, m);
    // 焼け残った柱の根（焦げて折れた高さはまちまち。三本に一本ほど）
    if (k % 3 === 0) { const hh = 0.5 + ((k * 13) % 5) * 0.35; m.compose(v.set(p.x, y + 0.2 + hh / 2, p.z), q.setFromEuler(e.set(((k % 4) - 1.5) * 0.08, 0, ((k % 3) - 1) * 0.1)), sc.set(1, hh, 1)); posts.setMatrixAt(np++, m); solidCircle(p.x, p.z, 0.3); }
  });
  posts.count = np;
  for (const o of [stones, posts]) { o.castShadow = true; o.receiveShadow = true; rt.scene.add(o); }
  // 基壇（土を突き固めた低い台。焼けて縁の石が崩れ、角は丸く崩れている）
  for (const b of GARAN) {
    const w = (b.nx - 1) * b.s + 2.4, d = (b.nz - 1) * b.s + 2.4, cz = SHITENNO.z + b.z, hh = b.base + 0.6;
    const geo = new THREE.CylinderGeometry(0.5, 0.62, hh, 8, 1); geo.rotateY(Math.PI / 8); geo.scale(w * 1.08, 1, d * 1.08);
    const g = new THREE.Mesh(geo, earthMat);
    g.position.set(SHITENNO.x, W.heightAt(SHITENNO.x, cz) + b.base - hh / 2, cz); g.receiveShadow = true; rt.scene.add(g);
  }
}
// 安居の天神（菅原道真を祀る小さな社と、白木の鳥居）
function yasuiSha(rt) {
  const W = rt.world, wood = bridgeWoodMaterial(), x = YASUI.x - 7, z = YASUI.z - 10;
  rt.scene.add(dou(W, x, z, 4.2, 3.4, 0, { h: 2.4 }));
  const tz = z + 6.5, y = W.heightAt(x, tz), T = new THREE.Group();
  for (const sx of [-1, 1]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.19, 3.6, 10), wood); p.position.set(sx * 1.5, 1.8, 0); T.add(p); solidCircle(x + sx * 1.5, tz, 0.22); }
  const kasagi = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.26, 0.36), wood); kasagi.position.y = 3.7; T.add(kasagi);
  const shimaki = new THREE.Mesh(new THREE.BoxGeometry(4, 0.2, 0.3), wood); shimaki.position.y = 3.47; T.add(shimaki);
  const nuki = new THREE.Mesh(new THREE.BoxGeometry(3.7, 0.18, 0.16), wood); nuki.position.y = 2.75; T.add(nuki);
  const gaku = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.6, 0.18), wood); gaku.position.y = 3.12; T.add(gaku);
  T.position.set(x, y, tz); T.traverse((o) => { o.castShadow = true; }); rt.scene.add(T);
}

const k15_tennoji_okayama = {
  // 身の回りの合戦の跡（timeslip_field.js）。五月七日（今の六月）の昼。乾いた台地の土埃、最後の野戦の倒れた槍と旗
  timeslip: {
    wet: 0.1, dust: 0.7, trample: 0.45, debris: 1.5, arrows: 1, maxSlope: 0.3,
    grass: 0x80984e, grassTints: [0xffffff, 0xe4e6c0, 0xd0c898], grassH: 1.1, grassLift: 0.2, grassShape: 'blade', tallGrass: 0.8,
    flagColors: [0xe6dfcc, 0x24211e, 0x8e1f16],
  },
  spawn: { x: START.x, z: START.z, heading: Math.PI },
  prelude: 16,
  cutFloor: 0.5,
  meleeGrace: { rate: 1, burst: 1, interval: 3 },   // 刃を受けた後の3秒は次の刃を通さない
  // 見せかけの軍勢・遠くの作り物の戦い・見えない所から湧く小勢は置かない（kaito AA・AF・AV の4・AW の6）
  noReserve: true, noWake: true, noTaishoRaid: true, noFrontFill: true, noDistantBattle: true, noFarFill: true, noAheadFill: true,
  frontlineDensity: false,
  stageGoalsOnly: true,   // 目標は五つの段だけ
  // 戦の前の話の間は、近くの名のある味方（小笠原秀政）へ「ついて行く」印を出さない。人の頭の▼に字を添えない（物差し 五-1）
  goalSignOff: (rt) => !rt.flags.step,
  goalSignUnitNoLabel: true,
  sides: { a: { name: '徳川方', mon: 'tokugawa', faction: 'tokugawa' }, b: { name: '豊臣方', mon: 'toyotomi', faction: 'toyotomi' } },
  taisho: { a: { name: '徳川家康', def: true }, b: { name: '真田信繁', def: true } },
  world: {
    seed: 1615507,
    time: 'day',
    groundHalf: 300,
    height,
    paths: ROADS,
    tint(x, z, h, c) {
      for (const r of ROADS) if (distToPolyline(x, z, r) < 2.6) { c.setRGB(c.r * 0.5 + 0.21, c.g * 0.5 + 0.18, c.b * 0.5 + 0.12); return; }
      if (h < 1.4) { c.setRGB(c.r * 0.55 + 0.08, c.g * 0.62 + 0.12, c.b * 0.6 + 0.08); return; }
      const p = 0.5 + 0.5 * Math.sin(x * 0.07 + 1.3) * Math.cos(z * 0.06);
      c.setRGB(c.r * (0.8 + p * 0.2) + 0.05 * p, c.g * (0.84 + p * 0.16), c.b * 0.8);
    },
    clear: (x, z) => ROADS.some((r) => distToPolyline(x, z, r) < 6) || near({ x, z }, HON, 24) || near({ x, z }, HONF, 24) || near({ x, z }, HON2, 16) || near({ x, z }, YASUI, 14) || near({ x, z }, CHAUSU, 18) || near({ x, z }, ECHI, 16) || near({ x, z }, FRONT, 26) || (Math.abs(x - SHITENNO.x) < 12 && z < SHITENNO.z - 15 && z > SHITENNO.z - 47) || near({ x, z }, { x: YASUI.x - 7, z: YASUI.z - 6 }, 7),
    trees: 320,
    tufts: 2600,
    treeDensity: (x, z) => {
      if (near({ x, z }, SHITENNO, 26)) return 1.2;     // 四天王寺の森
      if (near({ x, z }, YASUI, 22)) return 1;           // 安居の天神の杜
      if (x < -70 && z > -60 && z < 160) return 0.05;   // 真田の寄せ道
      return x > -130 && x < 190 && z > -120 && z < 200 ? 0.08 : 0.5;
    },
    // 四天王寺の森は焼けた伽藍の東西に残る。安居の天神の杜は社の後ろ（北）
    groves: [{ x: SHITENNO.x - 22, z: SHITENNO.z - 28, r: 10, n: 12, kind: 'sugi' }, { x: SHITENNO.x + 38, z: SHITENNO.z - 28, r: 8, n: 10, kind: 'sugi' }, { x: YASUI.x - 8, z: YASUI.z - 20, r: 8, n: 12, kind: 'sugi' }],
    fleeOut: (x, z, team) => (team === 1 ? z < -200 : z > 240),
  },

  setup(rt) {
    timeslipField(rt);
    { const P = rt.player, td = P.takeDamage, k = rt.def.cutFloor; P.takeDamage = function (a, s) { const m = this.u.hitKind === 'gun' || this.u.hitKind === 'arrow'; const d = td.call(this, a, s); return s && !s.isStruct && !m && d > 0 ? d * k : d; }; }   // 刃の一太刀を def.cutFloor 倍に（この戦だけ）
    const F = rt.flags, S = Math.PI;
    F.step = 0; F.ek = 0; F.ak = 0; F.ending = false;
    if (rt.player.canRide && rt.player.mounted) rt.player.toggleMount();
    scenery(rt);

    // ---- 徳川方：大御所の本陣（旗本の侍に囲まれて床几に座る。床几の主の前で近臣の正純は馬を下りる）・旗本の二の備・本多忠朝の先手・自分の手勢 ----
    F.hon = allyGroup(rt, { faction: 'tokugawa', name: '大御所の旗本', anchor: { x: HON.x, z: HON.z }, facing: S, width: 9, aggro: 7, seekRange: 10, order: 'hold', fixed: true, noRout: true, fullStrength: true, morale: 100 },
      [sq(TOKU, 'busho', 1, { name: '徳川家康', invuln: true, horse: false }), sq(TOKU, 'busho', 1, { name: '本多正純', invuln: true, horse: false, hat: 'kabuto_m', flag: 'honda' }),
        sq(TOKU, 'samurai', 30), sq(TOKU, 'gun', 8)]);
    F.ieyasu = F.hon.units.find((u) => u.name === '徳川家康');
    if (F.ieyasu) F.ieyasu._crouch = true;   // 床几に腰を下ろす
    F.hata2 = allyGroup(rt, { faction: 'tokugawa', name: '旗本の二の備', anchor: { x: HON.x - 16, z: HON.z - 12 }, facing: S, width: 10, aggro: 10, seekRange: 14, order: 'hold', fixed: true, noRout: true, fullStrength: true, formation: 'yari' },
      [sq(TOKU, 'samurai', 12), sq(TOKU, 'ashigaru', 10), sq(TOKU, 'gun', 4)]);
    F.honda = allyGroup(rt, { faction: 'tokugawa', name: '本多忠朝の先手', anchor: { x: FRONT.x, z: FRONT.z }, facing: S, width: 12, aggro: 14, seekRange: 30, morale: 95, noRout: true, fixed: true, fullStrength: true, formation: 'yari' },
      [sq(HONDA, 'busho', 1, { name: '本多忠朝', hat: 'kabuto_m', horse: true }), sq(HONDA, 'busho', 1, { name: '小笠原秀政', hat: 'kabuto_m', horse: true, flag: null }),   // 小笠原は三階菱の家。大将は背に旗を差さず、葵の旗は持たせない

        sq(HONDA, 'samurai', 5), sq(HONDA, 'ashigaru', 18), sq(HONDA, 'gun', 5)]);
    F.mine = allyGroup(rt, { faction: 'tokugawa', name: '手勢', anchor: { x: START.x + 4, z: START.z - 2 }, facing: S, width: 10, aggro: 14, seekRange: 20, noRout: true, fixed: true, fullStrength: true, formation: 'yari' },
      [sq(TOKU, 'samurai', 4), sq(TOKU, 'ashigaru', 16), sq(TOKU, 'gun', 3)]);
    // 松平忠直の越前勢：初めから茶臼山の正面（南）に陣し、真田と向き合う（史実の布陣。忠直と西尾宗次は馬上）
    F.echizen = allyGroup(rt, { faction: 'tokugawa', name: '松平忠直の越前勢', anchor: { x: ECHI.x, z: ECHI.z }, facing: S, width: 12, aggro: 12, seekRange: 16, order: 'hold', noRout: true, fixed: true, fullStrength: true, formation: 'yari' },
      [sq(TOKU, 'busho', 1, { name: '松平忠直', invuln: true, hat: 'kabuto_w', horse: true }), sq(TOKU, 'busho', 1, { name: '西尾宗次', invuln: true, hat: 'kabuto_m', horse: true }),
        sq(TOKU, 'samurai', 6), sq(TOKU, 'ashigaru', 16), sq(TOKU, 'gun', 6)]);
    F.echizen.dmgMult = 0.45;
    for (const g of [F.mine, F.honda, F.hata2]) { g.defMult = 1.15; g.dmgMult = 0.7; }
    F.hon.dmgMult = 0.6; F.hon.defMult = 1.5;   // 旗本は厚い具足の侍。崩れにくい
    const n = Math.min(12, RANKS[rt.G.rank || 0]?.squad || 0);
    if (n) rt.makeSquad({ x: START.x - 4, z: START.z + 4 }, S, [{ kind: 'spear', n }]);

    // ---- 豊臣方：四天王寺の南門の前の毛利勝永の先手・茶臼山の真田（初めは丘の上で待つ） ----
    F.mori = enemyGroup(rt, { fixed: true, faction: 'toyotomi', name: '毛利勝永の先手', anchor: { x: SHITENNO.x, z: SHITENNO.z + 8 }, facing: 0, width: 12, aggro: 10, seekRange: 20, order: 'hold', morale: 95, formation: 'yari' },
      [sq(TOYO, 'samurai', 7), sq(TOYO, 'ashigaru', 24), sq(TOYO, 'gun', 9)]);
    F.sanada = enemyGroup(rt, { fixed: true, faction: 'toyotomi', name: '真田の赤備え', anchor: { x: CHAUSU.x + 6, z: CHAUSU.z + 10 }, facing: 0.6, width: 12, aggro: 4, seekRange: 6, order: 'hold', morale: 100, noRout: true },
      [sq(SANADA, 'samurai', 8), sq(SANADA, 'ashigaru', 22), sq(SANADA, 'gun', 6)]);
    F.nobu = enemyGroup(rt, { fixed: true, faction: 'toyotomi', name: '真田信繁の旗本', anchor: { x: CHAUSU.x, z: CHAUSU.z }, facing: 0.6, width: 8, aggro: 4, seekRange: 6, order: 'hold', morale: 100, noRout: true },
      [sq(SANADA, 'busho', 1, { name: '真田信繁', invuln: true, horse: true, hat: 'kabuto_sanada' }), sq(SANADA, 'cavalry', 6), sq(SANADA, 'samurai', 10)]);
    F.nobuU = F.nobu.units.find((u) => u.name === '真田信繁');
    for (const g of [F.sanada, F.nobu]) g.noFrontline = true;

    // 戦の前の話（大御所の本陣）
    rt.setPhase('brief');
    rt.after(0.5, () => rt.say('徳川家康', '秀頼が城を出ぬなら、今日で終いじゃ。天王寺口はわしが受け持つ', 4.4));
    rt.after(5.2, () => rt.say('本多正純', '岡山口は将軍様。井伊・藤堂・前田が付いておりまする', 3.6));
    rt.after(9.2, () => rt.say('本多忠朝', '先手はこの忠朝が承る。冬の陣の恥を、今日の槍で雪ぐ', 3.6));
    rt.after(13.2, () => rt.say(nm(rt), '四天王寺の前に毛利豊前の手。茶臼山の六文銭の前には越前勢', 3.4));
    rt.after(16.8, () => this.stage1(rt));
  },

  // ① 四天王寺の南で毛利勝永の先手を食い止める（途中で本多忠朝が討たれ、勝永の本隊が出る）
  stage1(rt) {
    const F = rt.flags;
    F.step = 1; F.tS = rt.t;
    rt.setPhase('battle');
    sfx('horagai', 0.8); rt.after(1.2, () => sfx('taiko', 0.8));
    rt.banner('豊臣方の総出撃', '慶長二十年五月七日　正午　天王寺口');
    rt.obj('main', '四天王寺の南で毛利勝永の先手を食い止める', 'main');
    F.s1 = [F.mori]; F.n1 = F.mori.count;
    rt.marker('k15', () => { const g = F.s1.find(alive); return g ? centerOf(g)() : SHITENNO; }, '毛利勝永の先手', { red: true, group: F.mori });
    F.mori.order = 'attack'; F.mori.aggro = 22; F.mori.seekRange = 50;
    F.mori.anchor = { x: FRONT.x, z: FRONT.z };
    hold(F.honda, FRONT.x, FRONT.z - 6); F.honda.aggro = 22;
    hold(F.mine, FRONT.x + 10, FRONT.z - 2); F.mine.aggro = 22;
    rt.say('使番', '毛利の手が、物見に出た本多の先手へ鉄砲を撃ちかけた！', 3.2);
    rt.after(3.6, () => rt.say('毛利勝永', '狙うは本多の先手じゃ。一息に突き崩せ！', 3.4));
  },
  // 本多忠朝の討死と、勝永の本隊（勝永は馬上で後ろに付く。討てない）
  tadatomo(rt) {
    const F = rt.flags;
    if (F.tadaDone) return;
    F.tadaDone = true;
    const u = F.honda?.units.find((q) => q.name === '本多忠朝' && q.alive);
    if (u) { u.invuln = false; rt.army.kill(u, null); }
    rt.banner('本多忠朝、討死', '小笠原秀政も深手。先手が崩れる');
    rt.say('本多の侍', '殿が……出雲守様が討たれた！', 3.2);
    if (alive(F.honda)) F.honda.morale = Math.min(F.honda.morale, 45);
    // 小笠原秀政は深手を負って戦場を去る（のちに死ぬ。史実）。討ち取らせず、南へ退かせる
    const og = F.honda?.units.find((q) => q.name === '小笠原秀政' && q.alive);
    if (og) { og.moraleFleeDir = { x: 0.2, z: 1 }; og.fleeing = true; og.fleeT = rt.army.time; og.target = null; og.atk = null; og.swing = null; }
    F.katsu = enemyGroup(rt, { fixed: true, faction: 'toyotomi', name: '毛利勝永の本隊', anchor: { x: SHITENNO.x - 6, z: SHITENNO.z }, facing: 0, width: 10, aggro: 22, seekRange: 50, order: 'attack', morale: 95, noRout: true },
      [sq(TOYO, 'busho', 1, { name: '毛利勝永', invuln: true, hat: 'kabuto_g', horse: true }), sq(TOYO, 'samurai', 10), sq(TOYO, 'ashigaru', 12), sq(TOYO, 'gun', 2)]);
    F.katsu.anchor = { x: FRONT.x - 4, z: FRONT.z + 4 };
    // 毛利に付いた木村宗明の備（木村重成の残兵）が四天王寺の西から小笠原の横を突く（史実）
    F.kimura = enemyGroup(rt, { fixed: true, faction: 'toyotomi', name: '木村宗明の備', anchor: { x: SHITENNO.x - 22, z: SHITENNO.z + 10 }, facing: 0, width: 8, aggro: 22, seekRange: 40, order: 'attack', morale: 95, formation: 'yari' },
      [sq(TOYO, 'samurai', 3), sq(TOYO, 'ashigaru', 10), sq(TOYO, 'gun', 3)]);
    F.kimura.anchor = { x: FRONT.x - 10, z: FRONT.z - 2 };
    F.s1.push(F.katsu, F.kimura); F.n1 += F.katsu.count - 1 + F.kimura.count;
    rt.after(3.6, () => rt.say('毛利勝永', '本多は崩れた。続けて押せ！', 3));
    rt.after(7.4, () => rt.say('使番', '木村の手が西から小笠原様の横を突いた！', 3.2));
    rt.after(11.2, () => rt.say('使番', '小笠原様父子、横を突かれた！　若殿は討死、殿は深手を負うて退かれる', 3.4));
  },
  // ② 先手が崩れ、茶臼山の真田が家康の本陣を目がけて走る（主人公は本陣の前へ）
  stage2(rt) {
    const F = rt.flags;
    F.step = 2; F.tS = rt.t;
    rt.award((t) => t.side.push('毛利勝永の先手を食い止めた'), '毛利勝永の先手を食い止めた');
    rt.unmark('k15');
    flee([F.kimura]);
    // 越前勢は真田の陣の横を抜けて城（北）へ進み、入れ違いに真田が本陣へ走る（史実）。茶臼山の西を通り、真田の寄せ道を空ける
    if (alive(F.echizen)) { F.echizen.stay = true; F.echizen.aggro = 3; F.echizen.seekRange = 4; F.echizen.defMult = 2; march(F.echizen, [{ x: CHAUSU.x - 30, z: CHAUSU.z + 30 }, { x: CHAUSU.x - 26, z: CHAUSU.z - 26 }]); }
    // 勝永の手は本多を破った勢いのまま、四天王寺の道を真っすぐ家康の本陣へ寄せる（真田と二筋で）。崩れた本多の先手は本陣の後ろへ退く
    for (const g of [F.mori, F.katsu]) if (alive(g)) { g.noRout = true; g.morale = 100; g.routed = false; }
    // 道を本陣の前まで走り（move）、着いたら家康の居所へ寄せる（hold のままでは四天王寺の前に留まった）
    for (const g of [F.mori, F.katsu]) if (alive(g)) { g.order = 'move'; g.stay = true; g._apCharge = false; g.dest = { x: HONF.x + 6, z: HONF.z - 10 }; g.onArrive = (q) => { q.onArrive = null; this.charge(rt, q, 6); }; }
    if (alive(F.honda)) { F.honda.noRout = false; F.honda.order = 'move'; F.honda.dest = { x: HON.x + 14, z: HON.z + 30 }; F.honda.onArrive = (q) => flee([q]); }
    // 手勢は斬り合いを切り上げて本陣の前へ走る（stay：一緒に突っ込む ally_charge に引かれて毛利の手と組み合ったまま残らない）
    if (alive(F.mine)) { F.mine.stay = true; F.mine._apCharge = false; hold(F.mine, HONF.x + 4, HONF.z - 4); F.mine.aggro = 12; }
    hold(F.hata2, HONF.x - 8, HONF.z + 2);
    rt.obj('main', '本陣の前で真田と毛利の突撃を止める', 'main');
    rt.banner('真田と毛利の突撃', '茶臼山の赤備えと毛利の手が本陣へ');
    rt.say('使番', '茶臼山の真田と毛利の手が、大御所の本陣へ一直線！　本陣の前へ戻れ！', 3.8);
    rt.after(4, () => rt.say('真田信繁', '狙うは家康の首、ただ一つ！　者ども、続け！', 3.4));
    rt.after(8, () => rt.say('使番', '越前勢は城へ向かい、真田と入れ違った！　赤備えが本陣へ来るぞ！', 3.4));
    // 真田の流した偽りの噂（史実）
    rt.after(12, () => rt.say('旗本', '浅野但馬守殿が寝返ったと！？　後ろを突かれるぞ！', 3.2));
    rt.after(15.6, () => rt.say('本多正純', '偽りの噂じゃ！　浅野は寝返っておらぬ。持ち場を離れるな！', 3.4));
    rt.after(5, () => { this.charge(rt, F.sanada, 6); this.charge(rt, F.nobu, 4); rt.army.play?.('toki', { x: CHAUSU.x, z: CHAUSU.z }, 1.5); });
    F.s2 = [F.sanada, F.mori, F.katsu].filter(alive); F.n2 = sum(F.s2);
    rt.marker('k15', () => { const g = F.s2.find(alive); return g ? centerOf(g)() : HONF; }, '真田の赤備え', { red: true, group: F.sanada });
  },
  // 真田の兵は主人公ではなく家康のいる所を目がける（近い者とだけ斬り合う）
  charge(rt, g, aggro) {
    const F = rt.flags;
    if (!alive(g)) return;
    const at = F.ieyasu?.alive ? F.ieyasu.pos : HON;
    // 'attack' は逃げる兵を追って横へ逸れる（11/3 の流しで真田の二番手が東へ流れた）。持ち場を家康の居所に置き、走って寄せ、近い者とだけ斬り合う
    // stay：持ち場（家康の居所）から逸れて主人公や逃げる兵を追わない（ally_charge・army_think）。目の前を塞ぐ者とだけ斬り合う
    g.order = 'hold'; g._charge = true; g.stay = true; g._apCharge = false; g.dest = null; g.path = null; g.focus = null; g.anchor = { x: at.x, z: at.z }; g.aggro = aggro; g.seekRange = aggro + 4; g.morale = 100; g.routed = false;
  },
  // ③ 二の突撃：金扇の馬印が倒れ、家康は南へ退く。主人公は倒れた馬印のもとで支える
  stage3(rt) {
    const F = rt.flags;
    F.step = 3; F.tS = rt.t;
    rt.award((t) => t.side.push('真田と毛利の突撃を止めた'), '真田と毛利の突撃を止めた');
    rt.unmark('k15');
    flee([F.sanada, F.mori]);
    // 毛利勝永は崩れず、手をまとめて城の方へ退く（史実）
    flee([F.katsu]);
    // 茶臼山から真田の二番手（先手の残りと新手。重さのため、先の赤備えが退いてから出す）
    F.sanada2 = enemyGroup(rt, { fixed: true, faction: 'toyotomi', name: '真田の二番手', anchor: { x: CHAUSU.x + 4, z: CHAUSU.z + 16 }, facing: 0.6, width: 12, aggro: 6, order: 'hold', morale: 100, noRout: true },
      [sq(SANADA, 'samurai', 6), sq(SANADA, 'ashigaru', 18), sq(SANADA, 'gun', 4)]);
    F.sanada2.noFrontline = true;
    this.charge(rt, F.sanada2, 6); this.charge(rt, F.nobu, 6);
    F.s3 = [F.sanada2]; F.n3 = F.sanada2.count;
    F.umaDown = true; F.umaT = 0;
    rt.obj('main', '倒れた馬印のもとで真田の二の突撃を止める', 'main');
    rt.banner('大御所の馬印が倒れた', '本陣が乱れる');
    rt.say('本多正純', '大御所様、お退きくだされ！', 3);
    rt.after(3.4, () => rt.say('徳川家康', '退かぬ……いや、ここは退く。旗本、支えよ！', 3.4));
    rt.after(7.2, () => rt.say(nm(rt), '本陣を空けるな！　馬印を起こせ！', 3));
    if (F.ieyasu) F.ieyasu._crouch = false;
    hold(F.hon, HON2.x, HON2.z);
    hold(F.mine, HON.x - 4, HON.z - 6); hold(F.hata2, HON.x - 12, HON.z);
    // 本陣の崩れを知った越前勢が城の手前から引き返し、真田の後ろへ迫る
    // 真田の寄せ道（茶臼山→本陣）の西を下り、道の横で構える（道を塞いで二番手と組み合ったまま残らない）
    if (alive(F.echizen)) { F.echizen.aggro = 3; march(F.echizen, [{ x: CHAUSU.x - 30, z: CHAUSU.z + 30 }, { x: -128, z: 64 }]); }
    rt.after(10, () => rt.say('使番', '越前勢が城の手前から引き返して来る！', 3));
    // 旗奉行が馬印を倒し、旗本には三里も逃げた者がいた（三方ヶ原の後で初めて馬印が倒れた。史実）
    rt.after(13.4, () => rt.say('旗奉行', '馬印を倒してしもうた……大御所様のお姿が見えぬ！', 3.2));
    rt.after(17, () => rt.say('本多正純', '逃げた旗本は三里も先じゃ。残る者で支えよ！', 3.2));
    rt.marker('k15', { x: F.uma.position.x, z: F.uma.position.z }, '倒れた馬印', { h: 3, red: true });
  },
  // ④ 三の突撃：松平忠直の越前勢が横から突く。真田信繁の旗本を討つ
  stage4(rt) {
    const F = rt.flags;
    F.step = 4; F.tS = rt.t;
    rt.award((t) => t.side.push('馬印のもとで本陣を支えた'), '馬印が倒れても本陣を支えた');
    rt.unmark('k15');
    flee([F.sanada2]);
    if (F.umaUp !== true) { F.umaUp = true; }
    if (F.nobuU) F.nobuU.invuln = true;
    this.charge(rt, F.nobu, 10);
    // 引き返した越前勢が真田の横へ掛かる（見えない所から湧かせない）
    if (alive(F.echizen)) { F.echizen.order = 'attack'; F.echizen.aggro = 26; F.echizen.seekRange = 50; F.echizen.dmgMult = 0.8; F.echizen.anchor = { x: HONF.x - 14, z: HONF.z - 6 }; }   // 持ち場は信繁の旗本の居所を追う（update）
    hold(F.mine, HONF.x, HONF.z); F.mine.aggro = 22;
    // 茶臼山に残した真田の馬廻が信繁のもとへ駆け付ける（一と二の突撃で旗本が減っていても、信繁は馬廻に守られる）
    F.nobu2 = enemyGroup(rt, { fixed: true, faction: 'toyotomi', name: '真田の馬廻', anchor: { x: CHAUSU.x + 2, z: CHAUSU.z + 12 }, facing: 0.6, width: 8, order: 'hold', morale: 100, noRout: true },
      [sq(SANADA, 'cavalry', 4), sq(SANADA, 'samurai', 12)]);
    F.nobu2.noFrontline = true;
    this.charge(rt, F.nobu2, 10);
    F.s4 = [F.nobu, F.nobu2]; F.n4 = this.guards(rt);
    rt.obj('main', '越前勢と共に真田信繁の旗本を討つ', 'main');
    rt.banner('真田の三の突撃', '越前勢が横から突く');
    rt.say('真田信繁', 'あと一息じゃ！　家康は目の前ぞ！', 3.2);
    rt.after(3.6, () => rt.say('松平忠直', '越前勢、真田の横へかかれ！　遅れを取り返せ！', 3.4));
    // 水野勝成が自ら一番槍で崩れた天王寺口を立て直す（史実。遊ぶ所の外の話として使番が知らせる）
    rt.after(7.6, () => rt.say('使番', '水野日向守殿が自ら一番槍！　崩れた天王寺口の諸隊が立て直した', 3.4));
    rt.marker('k15', () => (F.nobuU?.alive ? F.nobuU.pos : centerOf(F.nobu)()), '真田信繁の旗本', { red: true, group: F.nobu });
  },
  // 越前勢は相手の隊を追う：離れていれば走って寄り（move）、近ければ斬り合う（attack）。持ち場だけ移すと元の所に留まった
  chase(g, tg) {
    const c = centerOf(tg)(), e = centerOf(g)();
    g.stay = false; g.anchor = { x: c.x, z: c.z };
    if (!near(e, c, 14)) { g.order = 'move'; g.dest = { x: c.x, z: c.z }; g.onArrive = (q) => { q.onArrive = null; q.order = 'attack'; }; } else { g.order = 'attack'; g.dest = null; }
  },
  // 信繁の守り（旗本と馬廻）の生きている数。信繁本人は数えない
  guards(rt) {
    const F = rt.flags;
    let n = 0;
    for (const g of [F.nobu, F.nobu2]) if (g) for (const u of g.units) if (u.alive && !u.fleeing && u !== F.nobuU) n++;
    return n;
  },
  // ⑤ 疲れ果てた信繁は安居の天神へ退く。追って討つ
  stage5(rt) {
    const F = rt.flags;
    F.step = 5; F.tS = rt.t;
    rt.award((t) => t.side.push('真田信繁の旗本を討った'), '真田信繁の旗本を討った');
    rt.unmark('k15');
    flee([F.nobu2]);
    const g = F.nobu;
    if (alive(g)) { g.order = 'move'; g.dest = { x: YASUI.x, z: YASUI.z }; g.aggro = 4; g.onArrive = (q) => { q.order = 'hold'; q.anchor = { x: YASUI.x, z: YASUI.z }; q.aggro = 8; }; }
    if (F.nobuU) { F.nobuU.invuln = false; F.nobuU.hp = Math.min(F.nobuU.hp, F.nobuU.maxHp * 0.45); }
    if (alive(F.echizen)) { F.echizen.anchor = { x: YASUI.x + 8, z: YASUI.z + 14 }; F.echizen.order = 'hold'; F.echizen.dmgMult = 0.25; }
    rt.obj('main', '安居の天神へ追い、真田信繁を討つ', 'main');
    rt.say('真田信繁', '……ここまでか。天神の杜まで退け', 3.4);
    rt.after(3.8, () => rt.say('西尾宗次', '真田は疲れ果てておる。天神の杜へ追え！', 3.2));
    rt.marker('k15', () => (F.nobuU?.alive ? F.nobuU.pos : YASUI), '真田信繁', { red: true });
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

  win(rt, mine, at) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.unmark('k15');
    this.burn(rt);
    rt.setPhase('end');
    rt.objDone('main');
    rt.award((t) => { t.main = true; t.special = { label: mine ? '大御所の本陣を守り抜き、真田信繁を討ち取った' : '大御所の本陣を守り抜き、真田隊を崩した', pts: mine ? 60 : 40 }; }, '天王寺・岡山の戦いに勝った');
    flee(rt.army.groups.filter((g) => g.team === 1));
    sfx('horagai', 0.9);
    // 討たれた所で書き分ける。「日本一の兵」は島津家の者の書状の言葉なので札には書かない
    rt.banner('真田信繁、討死', at && !near(at, YASUI, 26) ? '天王寺口にて' : '安居の天神にて');
    rt.player.u.invuln = true;
    rt.after(3, () => rt.say('使番', '毛利豊前は殿をして城へ退く。明石掃部は水野勢へ突き掛かり、姿を消した', 4.4));
    rt.after(8, () => rt.banner('大坂城、炎上', '岡山口も大野治房が崩れ、豊臣方は総崩れ'));
    rt.after(9.5, () => rt.say(nm(rt), '天守が……燃えておりまする', 3));
    rt.after(13, () => rt.say('徳川家康', '真田左衛門佐、見事な最期であった', 3.6));
    // 秀頼の自害は翌日の事。七日の使番は知り得ないので、語りの札で書く
    rt.after(17, () => rt.banner('翌五月八日', '秀頼公と御母君、山里曲輪にて御自害。大野修理も共に'));
    rt.after(22, () => rt.banner('豊臣家、滅ぶ', '七月、元号は元和に改まる'));
    rt.after(24, () => rt.say('徳川家康', 'これで、戦の世は終わりじゃ', 3.6));
    rt.finish({ scriptedEnd: true }, 30);
  },
  lose(rt, why) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.objFail('main'); rt.tracker.main = false; rt.unmark('k15');
    rt.player.u.invuln = true;
    if (why) rt.banner('負け戦', why);
    rt.finish({ scriptedEnd: true, failureReason: why }, 7);
  },

  onKill(rt, v, killer) {
    const F = rt.flags;
    if (v.team === 1) F.ek++; else F.ak++;
    if (v === F.nobuU && !F.ending) {
      const mine = killer ? (killer === rt.player.u || killer.group?.isPlayerSquad) : false;
      // 西尾は名を知らずに首を取り、後で真田左衛門佐と知れた（福井の松平文庫の伝え）。名乗りは通称の久作で
      if (!mine) { rt.say('西尾宗次', '名のある武者と見た。越前の西尾久作が討ち取った！', 3.6); rt.after(4, () => rt.say('使番', '西尾久作の取った首は、真田左衛門佐と知れた！', 3.4)); }
      else rt.say(nm(rt), '真田左衛門佐、討ち取ったり！', 3.6);   // 名乗りは官途名で呼ぶ（諱は口にしない）
      this.win(rt, mine, v.pos);
    }
  },

  update(rt, dt) {
    const F = rt.flags;
    // 倒れる馬印（一秒ほどで横へ）と、主人公が寄ると起こし直す
    if (F.uma) {
      if (F.umaDown && !F.umaUp && F.umaT < 1) F.umaT = Math.min(1, F.umaT + dt * 1.2);
      if (F.umaUp && F.umaT > 0) F.umaT = Math.max(0, F.umaT - dt * 0.6);
      F.uma.rotation.z = 1.45 * F.umaT * F.umaT;
    }
    if (F.ending || !F.step) return;
    const P = rt.player.u.pos;
    if (rt.t - F.tS > LIMIT[F.step]) { this.lose(rt, GOAL_LIMIT[F.step]); return; }
    // 真田の兵が家康のすぐそばまで多く入ったら、本陣が破られて負け
    if (F.step >= 2 && F.step <= 4 && F.ieyasu) {
      let k = 0;
      for (const g of [F.sanada, F.sanada2, F.nobu, F.mori, F.katsu]) if (alive(g) && g._charge && g.order === 'hold') for (const u of g.units) if (u.alive && !u.fleeing && near(u.pos, F.ieyasu.pos, 7)) k++;
      F.breachT = k >= 20 ?(F.breachT || 0) + dt : 0;
      // 一の突撃で本陣へ斬り込まれたら、史実どおり馬印が倒れて家康が退く（三の段へ。負けにしない）。二の突撃からは負け
      if (F.breachT > 15 && F.step === 2) { F.breachT = 0; rt.say('使番', '真田が本陣へ斬り込んだ！　大御所様をお守りせよ！', 3.2); this.stage3(rt); return; }
      // 二の突撃で斬り込まれたら、一度は越前勢がすぐ真田の後ろを突き、残った旗本が踏み止まる（史実の立て直し）。二度目は負け
      if (F.breachT > 15 && F.step === 3 && !F.rally) {
        F.breachT = 0; F.rally = true; F.hon.defMult = 2.4; if (alive(F.hata2)) F.hata2.defMult = 1.8;
        if (!F.echi3 && alive(F.echizen)) { F.echi3 = true; F.echizen.order = 'attack'; F.echizen.aggro = 26; F.echizen.seekRange = 50; F.echizen.dmgMult = 0.8; }
        rt.say('本多正純', '旗本、踏み止まれ！　越前勢が真田の後ろへ掛かったぞ！', 3.4); return;
      }
      if (F.breachT > 15) { this.lose(rt, '真田の兵に大御所の本陣を破られた'); return; }
    }
    // 真田の兵は走りながら目当て（家康の居所）を追い直す
    if (!(F.reT > rt.t)) { F.reT = rt.t + 2; for (const g of [F.sanada, F.sanada2, F.mori, F.katsu]) if (alive(g) && g._charge && g.order === 'hold') this.charge(rt, g, 6); const tg = F.step === 4 ? F.nobu : F.step === 3 && F.echi3 ? F.sanada2 : null; if (alive(F.echizen) && alive(tg)) this.chase(F.echizen, tg); }
    if (F.step === 1) {
      if (!F.tadaDone && (rt.t - F.tS > 40 || sum([F.mori]) <= F.n1 * 0.7)) this.tadatomo(rt);
      if (F.tadaDone && (sum(F.s1) <= F.n1 * 0.3 || (rt.t - F.tS > 110 && sum(F.s1) <= F.n1 * 0.5) || rt.t - F.tS > 150)) this.stage2(rt);
    } else if (F.step === 2) {
      if (sum(F.s2) <= F.n2 * 0.4 || (rt.t - F.tS > 100 && sum(F.s2) <= F.n2 * 0.6) || rt.t - F.tS > 140) this.stage3(rt);
    } else if (F.step === 3) {
      if (!F.umaUp && near(P, F.uma.position, 4)) { F.umaUp = true; rt.say(nm(rt), '馬印を起こした！　大御所はご無事ぞ！', 3); sfx('taiko', 0.6); }
      // 引き返した越前勢が真田の二番手の後ろを突く（史実。主人公が動かなくても段が進む）
      if (!F.echi3 && rt.t - F.tS > 55 && alive(F.echizen) && alive(F.sanada2)) {
        F.echi3 = true; F.echizen.order = 'attack'; F.echizen.aggro = 26; F.echizen.seekRange = 50; F.echizen.dmgMult = 0.8;
        rt.say('使番', '越前勢が真田の二番手の後ろを突いた！', 3);
      }
      if (sum(F.s3) <= F.n3 * 0.3 || (rt.t - F.tS > 100 && sum(F.s3) <= F.n3 * 0.5) || rt.t - F.tS > 140) this.stage4(rt);
    } else if (F.step === 4) {
      const left = this.guards(rt);
      if (left <= F.n4 * 0.35 || (rt.t - F.tS > 90 && left <= F.n4 * 0.6) || rt.t - F.tS > 130) this.stage5(rt);
    } else if (F.step === 5 && rt.t - F.tS > 75 && F.nobuU?.alive) {
      // 主人公が討てなければ、追い付いた越前の西尾宗次が討つ（史実）
      // 討ち手を渡すと名のある将は踏み止まる（army_combat の officerStand）ので、討ち手無しで倒し、台詞は onKill が西尾宗次に言わせる
      F.nobuU.invuln = false; rt.army.kill(F.nobuU, null);
    }
  },
};

k15_tennoji_okayama.force = (rt) => ({ a: Math.round(150000 - (rt.flags.ak || 0) * 40), a0: 150000, b: Math.max(0, 55000 - (rt.flags.ek || 0) * 60), b0: 55000 });
k15_tennoji_okayama.date = (rt) => (rt.flags.burned ? '慶長二十年（1615）五月七日　初夏・夕　摂津国 天王寺・岡山' : '慶長二十年（1615）五月七日　初夏・昼　摂津国 天王寺・岡山');
k15_tennoji_okayama.history = '慶長二十年（1615）五月七日、大坂夏の陣の最後の野戦。徳川方はおよそ十五万で、天王寺口を家康、岡山口を秀忠が受け持った。豊臣方はおよそ五万五千が城の南に打って出た。天王寺口では四天王寺の南門の前に陣した毛利勝永（木村・後藤の残兵を合わせおよそ六千五百）が本多忠朝・小笠原秀政の先手を破り、忠朝は討死した。茶臼山に陣した真田信繁（およそ三千五百）は、正面の松平忠直の越前勢（およそ一万五千）が城へ向かって真田の陣を抜けると、入れ違いに家康の本陣（旗本およそ一万五千）を目がけて突き掛かり、本陣は崩れて馬印が倒れ、家康も一時退いたと伝わる。やがて引き返した松平忠直の越前勢らに横から押され、疲れ果てた真田隊は崩れ、信繁は安居の天神の辺り（生玉と勝鬘の間の高台とも）で越前の西尾宗次に討たれた。勝永は城へ退き、岡山口でも大野治房らが前田・井伊・藤堂の手に崩された。大坂城は火に包まれ、翌八日、秀頼と淀殿は山里曲輪で自害し、豊臣家は滅んだ。\n開戦の引き金は、毛利の寄騎が物見の本多勢を撃ったとも、本多勢が先に撃ったとも言い、時刻も十時・正午・十三時と記録が分かれる（ここは毛利から始まる説）。真田は「浅野長晟が寝返った」と偽りの噂を流して幕府方を揺らし、本陣へ二度とも三度とも突き掛かった。旗奉行は馬印を倒し、旗本には三里も逃げた者がいたと言う。小笠原秀政は深手を負って戦場を去り、のちに死んだ。子の忠脩は討死した。崩れた天王寺口は水野勝成が自ら一番槍で立て直し、明石全登は水野勢に突き掛かって姿を消した。\n四天王寺は、秀頼が建て直した五重塔ともども前の年の冬の陣で焼け、この日は焼け跡の礎石が並ぶだけだった（建て直しは元和の頃）。「真田日本一の兵」は、島津家の者が国元へ書き送った言葉として伝わる。\n茶臼山の後ろには前の日に戦った大和路勢と浅野長晟の手が控えていた。天王寺口の戦いの布陣は日本語版ウィキペディア「天王寺・岡山の戦い」と史跡の解説を手本に、地形は国土地理院の標高（上町台地）によった。';
k15_tennoji_okayama.bushou = [{ name: '真田信繁', g: /信繁/ }, { name: '毛利勝永', g: /勝永/ }, { name: '徳川家康', g: /家康/ }];

// bot の頭：近い敵を突き、段の行き先へ
k15_tennoji_okayama.botBrain = (b, inp, { goTo }) => {
  inp.quickCmd = null;
  const F = b.flags, p = b.player, u = p.u;
  if (!u.alive || F.ending) return;
  inp.leftPressed = false;
  inp.k.delete('KeyW');
  const gc = F.mine.center();
  if (u.hp < u.maxHp * 0.3 && Math.hypot(u.pos.x - gc.x, u.pos.z - gc.z) > 4) { goTo(p, inp, gc.x, gc.z, 3); return; }
  const e = b.army.nearestEnemy(u, 12, (o) => !o.noTarget && !o.isStruct && !o.fleeing && !o.invuln && o.type !== 'dummy');
  // 二・三の段は本陣を守る：本陣から遠い敵は追わず、まず本陣の前へ戻る
  if (e && F.step >= 1 && !(F.step >= 2 && F.step <= 3 && !near(u.pos, HON, 46))) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d > 2.4) inp.k.add('KeyW');
    if (d < 3.2 && Math.random() < 0.5) inp.leftPressed = true;
    return;
  }
  const at = (q, r = 3) => goTo(p, inp, q.x, q.z, r);
  if (F.step <= 1) { const g = (F.s1 || []).find(alive); at(g ? g.center() : FRONT, 4); return; }
  if (F.step === 2) { const g = F.s2.find(alive); at(alive(g) && near(g.center(), HONF, 30) ? g.center() : HONF, 4); return; }
  if (F.step === 3) { if (!F.umaUp) { at(F.uma.position, 2); return; } const g = F.sanada2; at(alive(g) && near(g.center(), HON, 34) ? g.center() : HON, 4); return; }
  if (F.step === 4) { at(F.nobu.center(), 3); return; }
  at(F.nobuU?.alive ? F.nobuU.pos : YASUI, 2);
};

// 倒す数（kaito 11/2 O）：段が進む判定と同じ数え方
KILLS.k15_tennoji_okayama = (rt) => {
  const F = rt.flags;
  if (F.ending) return null;
  if (F.step === 1) return cut(F.n1, sum(F.s1), F.n1 * 0.3);
  if (F.step === 2) return cut(F.n2, sum(F.s2), F.n2 * 0.3);
  if (F.step === 3) return cut(F.n3, sum(F.s3), F.n3 * 0.3);
  if (F.step === 4) return cut(F.n4, k15_tennoji_okayama.guards(rt), F.n4 * 0.35);
  return null;
};
setStages('k15_tennoji_okayama', [['四天王寺の南で毛利勝永の先手を食い止める', 1], ['本陣の前で真田と毛利の突撃を止める', 2], ['倒れた馬印のもとで真田の二の突撃を止める', 3], ['越前勢と共に真田信繁の旗本を討つ', 4], ['安居の天神へ追い、真田信繁を討つ', 5]]);

export { k15_tennoji_okayama };
export default k15_tennoji_okayama;
