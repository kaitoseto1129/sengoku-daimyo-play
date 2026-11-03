// ======================================================================
// 豊臣編 4　紀州征伐／根来寺（天正十三年（1585）三月二十三日。docs/chapter2_toyotomi.md の 4）
// 小牧・長久手の和睦の後、秀吉はおよそ十万で紀州へ向かった。鉄砲で名高い根来衆・雑賀衆を攻める。
// 三月二十一日、和泉の千石堀城で根来衆の主力が激しく戦い、火が煙硝蔵に入って落ちた。
// 二十三日、秀吉勢が根来寺へ入り、坊舎の多くが焼けた。大塔と大師堂は残った。
// 自分は部将として羽柴秀次の先手を率いる。竹束で門前の坊舎へ寄る → 坊舎の鉄砲衆を追い出す →
// 山門を開ける → 大塔の前の行人方を崩し、大塔を焼かせない。
// 史実では根来寺での抵抗は少ない。寺に残った鉄砲衆の抵抗を厚くしたのは脚色（筋書きの一枚どおり）。
// 向き：+z が北（根来の谷の奥・和泉山脈）、-z が南（紀の川へ下る田）。寸法は縮めた復元。
// ======================================================================
import * as THREE from 'three';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { flagTexture } from './textures.js';
import { useTerrain, BATTLE_ASSETS, assetsForBattle } from './asset_manifest.js';
import { demDetail } from './dem.js';
import { distToPolyline } from './world.js';
import { enemyGroup, allyGroup, wallLine, nm } from './bhelp.js';
import { dress } from './b_inabayama.js';
import { KIT } from './b_nagashinojo.js';
import { nobori, jinmaku, tsuiji, tawara } from './props.js';
import { sobo, kura, doja, sanmon, shoro } from './temple_parts.js';
import * as DP from './b_depth.js';
import { depthStart, depthTick, depthBot } from './b_depth.js';
import { addTaba, makeTabaAdvance, tickTabas, patchGunCover } from './taketaba.js';
import { STAGES } from './stages.js';
import { withGuard } from './toyo_bot.js';
import { farSight } from './far_sight.js';
import { MEM_TIGHT } from './settings.js';

// 国土地理院の標高（tools/dem.mjs の negoro。無い時は手書きの谷だけで遊べる）
let ngDem = null;
// 標高の束（tools/dem.mjs の negoro）を支度で読む（11/1 まで束が無く、手書きの地形だけだった）
BATTLE_ASSETS.t04_negoro = Object.freeze([...assetsForBattle(''), 'dem_negoro']);
useTerrain('dem_negoro', (data) => { ngDem = data; });

const SANDO = [[0, -230], [0, -120], [0, -40], [0, 0], [0, 60], [0, 140]];   // 参道（南の田から大塔まで）
const GATE = { x: 0, z: 0 };            // 山門
const DAITO = { x: -24, z: 76 };        // 大塔（参道の西。参道を塞がない）
const DAISHI = { x: 28, z: 72 };        // 大師堂
const TOWER_FRONT = { x: -6, z: 98 };   // 大塔を背にして、奥から来る行人方を受ける所
const MONZEN = { x: 0, z: -74 };        // 門前の坊舎の並び
const YOSE = { x: 0, z: -96 };          // 竹束の寄せ場
const START = { x: 0, z: -140 };         // 門前の坊舎の屋根と山門が始めの画面に入る所（-168 では坊舎が霧の端で細い帯にしか見えなかった）
const WALL_X = 74;                      // 築地塀の東西の端
const HASHIBA = { armor: 0x2a2420, flag: 'toyotomi' };
const NEGORO = { armor: 0x3a342c, flag: 'maru' };
// 上の身分（足軽大将より上）は先手を率いる部将の言い方
const HI = (rt) => !rt.G.lord && (rt.G.rank || 0) >= 3;

// ---- 地形：南の田から北へゆるく上り、東西の尾根が谷を挟む。北の奥は和泉山脈 ----
function base(x, z) {
  let h = 0.03 * (z + 220);
  const ax = Math.abs(x);
  if (ax > 78) h += Math.pow(ax - 78, 1.25) * 0.32;
  if (z > 132) h += (z - 132) * 0.55;
  h += 0.35 * Math.sin(x * 0.06 + 0.7) * Math.cos(z * 0.05) + 0.2 * Math.sin(z * 0.11 - x * 0.03);
  // 境内の平場：大塔のまわりを少し均す
  const dt = Math.hypot(x - DAITO.x, z - DAITO.z);
  if (dt < 34) { const k = 1 - dt / 34; h += (0.03 * (DAITO.z + 220) - h) * k * 0.7; }
  // 南の田は平らに
  if (z < -120) h = Math.min(h, 0.03 * 100 + 0.08 * Math.sin(x * 0.2) + (ax > 78 ? Math.pow(ax - 78, 1.25) * 0.32 : 0));
  return h;
}
function height(x, z) {
  const h = base(x, z);
  if (!ngDem) return h;
  // 実測の尾根と谷の凹凸は、遊ぶ参道の外にだけ足す
  const away = Math.max(0, Math.min(1, (Math.abs(x) - 40) / 40));
  return away > 0 ? h + away * demDetail(ngDem, x, z, { xy: 3, win: 60, scale: 0.25 }) : h;
}

// 段の数（右上の一行。stages.js の作りに乗せる）
const atStep = (n) => (rt) => (rt.flags.step ?? 0) >= n;
STAGES.t04_negoro = [
  ['竹束を押して、門前の坊舎へ寄る'],
  ['坊舎に斬り込み、鉄砲衆を追い出す', atStep(2)],
  ['山門を開け、境内へ入る', atStep(3)],
  ['大塔の前の行人方を崩し、大塔を守る', atStep(4)],
];
// 段に入った時に step を進める包み
const stepped = (n, st) => ({ ...st, start(rt, C, m, ctx) { rt.flags.step = n; rt.flags.stepT = rt.t; st.start(rt, C, m, ctx); } });
const alive = (g) => !!g && g.count > 0 && !g.routed;
const heads = (list) => list.reduce((a, g) => a + (alive(g) ? g.count : 0), 0);

// ---- 大塔（多宝塔）：基本形を組んだ軽い一棟。材質は一度だけ作る ----
let TOWER_MAT = null;
function towerMats() {
  if (TOWER_MAT) return TOWER_MAT;
  const m = (c, r = 0.9) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: 0 });
  TOWER_MAT = { stone: m(0x8a857a), wood: m(0x4e3424), white: m(0xe2dccd), roof: m(0x3e3026, 0.95), bronze: new THREE.MeshStandardMaterial({ color: 0x5a4a2a, roughness: 0.5, metalness: 0.6 }) };
  return TOWER_MAT;
}
function daitoModel(world, x, z) {
  const M = towerMats(), g = new THREE.Group();
  const y = world.heightAt(x, z);
  const add = (geo, mat, py, ry = 0) => { const o = new THREE.Mesh(geo, mat); o.position.y = py; o.rotation.y = ry; o.castShadow = true; o.receiveShadow = true; g.add(o); return o; };
  add(new THREE.BoxGeometry(17, 1.2, 17), M.stone, 0.6);                         // 基壇
  add(new THREE.BoxGeometry(14, 6, 14), M.white, 4.2);                           // 初重の壁
  for (const sx of [-1, 1]) for (const k of [-1, 0, 1]) {                        // 柱
    add(new THREE.BoxGeometry(0.6, 6, 0.6), M.wood, 4.2).position.set(sx * 7, 4.2, k * 6.6);
    add(new THREE.BoxGeometry(0.6, 6, 0.6), M.wood, 4.2).position.set(k * 6.6, 4.2, sx * 7);
  }
  add(new THREE.ConeGeometry(14.5, 3.6, 4, 1, true), M.roof, 8.6, Math.PI / 4);   // 裳階の屋根
  add(new THREE.CylinderGeometry(5.6, 6.4, 1.8, 24), M.white, 10.6);              // 亀腹
  add(new THREE.CylinderGeometry(5.2, 5.2, 5.2, 24), M.white, 13.6);              // 円い塔身
  add(new THREE.CylinderGeometry(5.4, 5.4, 0.6, 24), M.wood, 16.3);
  add(new THREE.ConeGeometry(12.5, 5, 4, 1, true), M.roof, 18.6, Math.PI / 4);    // 上重の屋根
  add(new THREE.CylinderGeometry(0.35, 0.45, 11, 8), M.bronze, 26.4);              // 相輪
  for (let i = 0; i < 9; i++) add(new THREE.CylinderGeometry(1.1 - i * 0.06, 1.1 - i * 0.06, 0.22, 12), M.bronze, 22.4 + i * 0.75);
  add(new THREE.SphereGeometry(0.6, 10, 8), M.bronze, 32.2);
  g.position.set(x, y, z);
  return g;
}

const t04_negoro = {
  spawn: { x: START.x, z: START.z, heading: 0 },
  minutes: 5,
  noWake: true, noTaishoRaid: true, noDespair: true,
  // 共通の奥の乱戦の補い（front_fill）は参道の正面に立って門前の坊舎と山門を隠すので、この戦では下の setup で参道の左右にだけ置く
  noFrontFill: true,
  introPlace: '紀伊国 根来寺（今の和歌山県岩出市根来）',
  introText: '竹束を押して門前の坊舎へ寄れ。鉄砲衆を追い出し、山門を開けて境内へ。大塔の前の行人方を崩し、大塔を焼かせるな。',
  world: {
    seed: 1585, time: 'day', muddy: 0.15,
    paths: [SANDO],
    height,
    tint(x, z, h, c) {
      // 参道は踏み固めた土、境内は白い砂
      const d = distToPolyline(x, z, SANDO);
      if (d < 4) { const k = 1 - d / 4; c.setRGB(c.r * (1 - k) + 0.42 * k, c.g * (1 - k) + 0.37 * k, c.b * (1 - k) + 0.29 * k); }
      if (z > 8 && z < 120 && Math.abs(x) < 60) c.setRGB(c.r * 0.8 + 0.1, c.g * 0.8 + 0.09, c.b * 0.8 + 0.07);
      // 尾根は濃い雑木の緑
      if (Math.abs(x) > 84 || z > 136) c.setRGB(c.r * 0.82, c.g * 0.92, c.b * 0.78);
    },
    paddy(x, z) {
      if (z > -118 || z < -240 || Math.abs(x) < 7 || Math.abs(x) > 76) return 0;
      const ex = Math.min(((x % 14) + 14) % 14, 14 - ((x % 14) + 14) % 14), ez = Math.min(((z % 12) + 12) % 12, 12 - ((z % 12) + 12) % 12);
      return Math.max(0, Math.min(1, (Math.min(ex, ez) - 0.8) / 0.6)) * 0.7;
    },
    clear: (x, z) => distToPolyline(x, z, SANDO) < 12 || (z > -112 && z < 124 && Math.abs(x) < 66) || Math.hypot(x - START.x, z - START.z) < 20,
    trees: 520, tufts: 2600,
    treeDensity: (x, z) => (Math.abs(x) > 84 || z > 132 ? 1.4 : z < -118 ? 0.05 : 0.25),
    groves: [{ x: -60, z: 128, r: 14, n: 18 }, { x: 58, z: 126, r: 14, n: 18 }, { x: -82, z: -20, r: 12, n: 14 }, { x: 84, z: 30, r: 12, n: 14 }],
    fleeOut: (x, z, team) => team === 1 && (z > 150 || Math.abs(x) > 110),
  },
  sides: { a: { name: '羽柴勢', mon: 'toyotomi' }, b: { name: '根来衆', mon: 'maru' } },
  date: () => '天正十三年三月二十三日　春・晴',

  setup(rt) {
    const W = rt.world, F = rt.flags;
    F.step = 0; F.ek = 0; F.ak = 0; F.towerHp = 100; F.ending = false;
    patchGunCover(rt);

    // ---- 寺の形：築地塀・山門・坊舎・大師堂・大塔 ----
    const tera0 = rt.scene.children.length;
    // 南の築地塀（山門の口を空ける）。東西の塀は谷の奥へ折れる。塀は壊れない（打つのは山門だけ）
    wallLine(rt, [[-WALL_X, 0], [-3.4, 0]], { team: 1, hp: 1e9, name: '築地塀', mesh: tsuiji, segLen: 8 });
    wallLine(rt, [[3.4, 0], [WALL_X, 0]], { team: 1, hp: 1e9, name: '築地塀', mesh: tsuiji, segLen: 8 });
    wallLine(rt, [[-WALL_X, 0], [-WALL_X, 118]], { team: 1, hp: 1e9, name: '築地塀', mesh: tsuiji, segLen: 8 });
    wallLine(rt, [[WALL_X, 0], [WALL_X, 118]], { team: 1, hp: 1e9, name: '築地塀', mesh: tsuiji, segLen: 8 });
    rt.scene.add(sanmon(W, GATE.x, GATE.z + 1.5, 0));
    F.gate = rt.army.addStruct({ seg: [-3.4, GATE.z, 3.4, GATE.z], nx: 0, nz: -1, hp: 260, maxHp: 260, team: 1, name: '山門の門扉' });
    F.gateMesh = new THREE.Mesh(new THREE.BoxGeometry(6.8, 4.2, 0.35), towerMats().wood);
    F.gateMesh.position.set(GATE.x, W.heightAt(GATE.x, GATE.z) + 2.1, GATE.z + 0.3);
    F.gateMesh.castShadow = true; rt.scene.add(F.gateMesh);
    F.gate.mesh = F.gateMesh;
    // 門前の坊舎：参道の東西に並ぶ。鉄砲衆が窓から撃つ
    F.monzen = [];
    for (const [x, z, r] of [[-18, -84, Math.PI / 2], [-18, -66, Math.PI / 2], [-32, -76, Math.PI / 2], [18, -84, -Math.PI / 2], [18, -66, -Math.PI / 2], [32, -76, -Math.PI / 2], [-20, -40, Math.PI / 2], [20, -40, -Math.PI / 2]]) {
      rt.scene.add(sobo(W, x, z, r)); F.monzen.push({ x, z });
    }
    rt.scene.add(kura(W, -40, -52, Math.PI / 2));
    rt.scene.add(kura(W, 40, -56, -Math.PI / 2));
    // 境内：大塔・大師堂・堂舎と坊舎・鐘楼
    rt.scene.add(daitoModel(W, DAITO.x, DAITO.z));
    rt.scene.add(doja(W, DAISHI.x, DAISHI.z, 0));
    rt.scene.add(doja(W, 32, 100, 0));
    rt.scene.add(shoro(W, 24, 46, 0));
    F.keidai = [];
    for (const [x, z, r] of [[-50, 30, Math.PI / 2], [-50, 52, Math.PI / 2], [-54, 92, Math.PI / 2], [50, 26, -Math.PI / 2], [52, 64, -Math.PI / 2], [-26, 108, 0], [54, 104, -Math.PI / 2], [-28, 24, Math.PI / 2]]) {
      rt.scene.add(sobo(W, x, z, r)); F.keidai.push({ x, z });
    }
    for (const [x, z] of [[-8, -6], [8, -6], [-10, 64], [10, 64]]) rt.scene.add(nobori(W, x, z, NEGORO.flag, 5));
    // 門前の坊舎・蔵・山門は、田の寄せ口からでも霧に沈めない（根来の坊舎の屋根の並びが見える）
    farSight(rt.scene.children.slice(tera0), { W, ground: { x: 0, z: -60, r: 70 } });
    // 秀次の陣：出だしの後ろに陣幕と幟
    rt.scene.add(jinmaku(W, START.x - 22, START.z - 18, 12, 8, 4, { mon: HASHIBA.flag }));
    for (const [x, z] of [[-8, -178], [8, -178], [-26, -170], [26, -170]]) rt.scene.add(nobori(W, x, z, HASHIBA.flag, 6));
    rt.scene.add(tawara(W, 20, -186, 0.3, 4));

    // ---- 羽柴勢：秀次の先手（自分が率いる）と筒井定次の手 ----
    const H = { faction: 'oda', armor: HASHIBA.armor };
    F.vanG = allyGroup(rt, { ...H, name: '秀次の先手', anchor: { x: -6, z: START.z + 10 }, facing: 0, width: 12, aggro: 9, noRout: true, formation: 'yari', dmgMult: 0.85 },
      dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 14 }, { type: 'gun', n: 5 }], HASHIBA));
    F.tsutsuiG = allyGroup(rt, { ...H, name: '筒井定次の手', anchor: { x: 14, z: START.z + 4 }, facing: 0, width: 12, aggro: 9, noRout: true, formation: 'yari', dmgMult: 0.85 },
      dress([{ type: 'samurai', n: 1, o: { name: '筒井定次', invuln: true, hat: 'kabuto_m', haori: 0x2a2a3a } }, { type: 'ashigaru', n: 12 }, { type: 'gun', n: 4 }], HASHIBA));
    F.hidetsugu = allyGroup(rt, { ...H, name: '羽柴秀次の旗本', anchor: { x: START.x - 22, z: START.z - 14 }, facing: 0, width: 8, aggro: 4, noRout: true },
      dress([{ type: 'busho', n: 1, o: { name: '羽柴秀次', invuln: true, horse: true, hat: 'kabuto_m', haori: 0x6a4a1c } }, { type: 'samurai', n: 3 }], HASHIBA));
    F.hidetsuguU = F.hidetsugu.units[0];
    // 紀州攻めの大将たち（battle_events_1101：秀吉・秀長・堀秀政・仙石秀久）。秀吉と秀長は陣幕の前、堀と仙石は先手の両脇
    F.hideyoshi = allyGroup(rt, { ...H, name: '羽柴秀吉の本陣', anchor: { x: START.x - 30, z: START.z - 24 }, facing: 0, width: 6, aggro: 3, seekRange: 6, noRout: true },
      dress([{ type: 'busho', n: 1, o: { name: '羽柴秀吉', invuln: true, horse: true, hat: 'kabuto_m', haori: 0x8a6a1c } }, { type: 'busho', n: 1, o: { name: '羽柴秀長', invuln: true, horse: true, hat: 'kabuto_m' } }, { type: 'samurai', n: 3 }], HASHIBA));
    F.horiG = allyGroup(rt, { ...H, name: '堀秀政の手', anchor: { x: -34, z: START.z + 2 }, facing: 0, width: 8, aggro: 9, noRout: true, dmgMult: 0.85 },
      dress([{ type: 'busho', n: 1, o: { name: '堀秀政', invuln: true, horse: true, hat: 'kabuto_m' } }, { type: 'ashigaru', n: 6 }, { type: 'gun', n: 3 }], HASHIBA));
    F.sengokuG = allyGroup(rt, { ...H, name: '仙石秀久の手', anchor: { x: 36, z: START.z + 2 }, facing: 0, width: 8, aggro: 9, noRout: true, dmgMult: 0.85 },
      dress([{ type: 'busho', n: 1, o: { name: '仙石秀久', invuln: true, horse: true, hat: 'kabuto_m' } }, { type: 'ashigaru', n: 6 }, { type: 'gun', n: 2 }], HASHIBA));
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: START.x + 4, z: START.z + 6 }, 0, [{ kind: 'spear', n }]);
    F.friends = () => [F.vanG, F.tsutsuiG].filter((g) => g && g.count);
    // 十万の羽柴勢（軽い作り）：田の向こうに控える
    // 豊臣の旗は敵の紋の表にもあるので、側（team）をはっきり渡す
    const DA = (x, z, w, d, count, facing, armor, flag, seed, team) => {
      const A = W.addDistantArmy({ x, z, w, d, count, facing, armor, flagTex: flagTexture(flag), mon: flag, seed, team });
      if (A && A.army) { A.army.team = team; A.army.noWake = true; }
      return A;
    };
    [[-40, -206], [40, -206], [0, -226], [-60, -150], [60, -150]].forEach(([x, z], i) => DA(x, z, 30, 14, 200, 0, HASHIBA.armor, HASHIBA.flag, 15850 + i, 0));
    // 境内の奥の根来衆（軽い作り）
    DA(0, 120, 34, 10, 140, Math.PI, NEGORO.armor, NEGORO.flag, 15860, 1);

    // 田の左右で羽柴勢と根来の行人がぶつかる乱戦（軽い作り）。参道の正面は空け、門前の坊舎の屋根と山門を見せる
    for (const [x, z, sd] of [[-19, -106, 1], [21, -107, -1]]) {
      W.addClash({ x, z, facing: 0.6 * sd, w: MEM_TIGHT ? 20 : 26, gap: 2.6, bw: 5, seed: 15870 + x, noWake: true, noRout: true, measuredMelee: true, killRate: 0.01, maxDrift: 2, corpses: MEM_TIGHT ? 10 : 20,
        A: { flag: HASHIBA.flag, armor: HASHIBA.armor, count: MEM_TIGHT ? 70 : 110, flagRate: 0.6 },
        B: { flag: NEGORO.flag, armor: NEGORO.armor, count: MEM_TIGHT ? 80 : 120, flagRate: 0.5, guns: true },
        host: MEM_TIGHT ? false : undefined,
        play: (k, q, v) => rt.army.play(k, q, v * 0.5), smoke: (x2, y, z2, sx, sz) => rt.army.smoke(x2, y, z2, sx, sz) });
    }

    // ---- 根来衆：門前の坊舎の鉄砲（はじめから撃ってくる） ----
    const R = { faction: 'saika', fixed: true, order: 'hold', fleeDir: { x: 0, z: 1 } };
    F.bouGuns = [-1, 1].map((s) => enemyGroup(rt, { ...R, name: s < 0 ? '西の坊舎の鉄砲衆' : '東の坊舎の鉄砲衆', anchor: { x: s * 12, z: MONZEN.z }, facing: Math.PI, width: 6, aggro: 10, seekRange: 70, dmgMult: 0.4, noRout: true },
      dress([{ type: 'samurai', n: 1 }, { type: 'gun', n: 6 }], NEGORO)));
    F.towerFoes = [];

    // ---- 竹束：先手と筒井の手の前に押し立てる ----
    for (const [x, z] of [[-3, START.z + 18], [3, START.z + 18], [-9, START.z + 16], [9, START.z + 16], [15, START.z + 12], [-15, START.z + 12]]) addTaba(rt, x, z, 0);
    F.TA = makeTabaAdvance(rt, {
      near: 60, speed: 1.6, maxPush: 90,
      items: [{ g: F.vanG, yose: { x: -6, z: YOSE.z }, until: () => (F.step ?? 0) >= 2 }, { g: F.tsutsuiG, yose: { x: 8, z: YOSE.z + 2 }, until: () => (F.step ?? 0) >= 2 }],
      avoid: [this.spawn],
    });

    // ---- 戦の前の会話 ----
    rt.setPhase('brief');
    rt.obj('main', HI(rt) ? '先手を率い、山門を破って根来寺の大塔まで攻め入る' : '山門を破り、境内の奥の大塔まで攻め入る', 'main');
    rt.say('羽柴秀吉', '十万で紀州へ入った。根来と雑賀の鉄砲を、根から絶て', 4);
    rt.after(4.3, () => rt.say('羽柴秀次', '千石堀で根来の者はほとんど死んだ。だが、寺にはまだ鉄砲が残っておる', 4.5));
    rt.after(9.1, () => rt.say('組頭', '一つの窓から三挺が撃ってきます。雑賀の鉄砲衆も寺へ逃げ込んだ由', 4));
    rt.after(13.4, () => rt.say('羽柴秀次', `${nm(rt)}、先手を率いよ。大塔は焼くな。殿下の仰せじゃ`, 4));
    rt.after(17.4, () => this.begin(rt));
  },

  begin(rt) {
    const F = rt.flags;
    if (F.step >= 1) return;
    rt.setPhase('fight');
    sfx('taiko', 0.9);
    const ctx = { faction: 'saika', flag: NEGORO.flag, armor: NEGORO.armor, friends: F.friends, look: (list) => dress(list, NEGORO), dmg: 0.5, scale: 1.4, mass: 120 };
    depthStart(rt, ctx, [
      // ① 竹束を押して寄る（坊舎の鉄砲が撃ってくる）
      stepped(1, DP.move({ to: YOSE, r: 10, max: 110, label: '竹束の寄せ場', obj: '竹束を押して、門前の坊舎へ寄れ',
        say: [['組頭', '竹束を前へ！　押し立てて寄せよ！', 3]] })),
      // ② 坊舎に斬り込み、鉄砲衆を追い出す
      stepped(2, DP.fight({ at: MONZEN, max: 150, title: '坊舎へ斬り込め', sub: '窓の鉄砲衆を追い出す', obj: '坊舎に斬り込み、鉄砲衆を追い出せ',
        say: [['組頭', '今じゃ！　鉄砲は込め直す間に斬れ！', 3]],
        foes: () => [
          { name: '坊舎の行人方', from: { x: -26, z: -60 }, list: [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 8 }, { type: 'gun', n: 3 }] },
          { name: '坊舎の行人方', from: { x: 26, z: -58 }, list: [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 8 }, { type: 'gun', n: 3 }] },
        ],
        later: [{ t: 30, say: ['足軽', '奥の坊舎からも出てきたぞ！', 3], foes: () => [{ name: '奥の坊舎の衆', from: { x: 0, z: -34 }, list: [{ type: 'ashigaru', n: 8 }, { type: 'gun', n: 2 }] }] },
          // 雑賀衆の鉄砲（必ず）：坊舎の屋根の陰から一斉に撃つ
          { t: 14, say: ['足軽', '雑賀の鉄砲衆じゃ！　坊舎の陰から撃ってくるぞ、伏せよ！', 3], foes: () => [{ name: '雑賀の鉄砲衆', from: { x: -40, z: -46 }, list: [{ type: 'samurai', n: 1 }, { type: 'gun', n: 6 }] }] }],
        reward: '門前の坊舎の鉄砲衆を追い出した',
        onEnd: (rt2) => { for (const g of rt2.flags.bouGuns) if (alive(g)) { g.noRout = false; g.morale = 0; } } })),
      // ③ 山門を開け、境内へ入る
      stepped(3, this.gateStep()),
      // ④ 大塔の前の行人方を崩し、大塔を守り抜く
      stepped(4, DP.hold({ at: TOWER_FRONT, r: 16, dur: 75, label: '大塔の前', obj: '大塔の前の行人方を崩し、大塔を守れ',
        title: '大塔を焼かせるな', sub: '行人方が火をかけに来る',
        say: [['羽柴秀次', '大塔に火をかけさせるな！　あれは残せと殿下の仰せじゃ', 4]],
        waves: () => [
          { t: 2, say: ['足軽', '奥から行人方じゃ！　松明を持っておる！', 3], foes: () => [this.towerWave('西の行人方', { x: -44, z: 112 })] },
          { t: 22, foes: () => [this.towerWave('東の行人方', { x: 44, z: 114 })] },
          { t: 44, say: ['組頭', 'まだ来る！　大塔の裏へ回らせるな！', 3], foes: () => [this.towerWave('奥の院の衆', { x: 0, z: 128 })] },
        ],
        reward: '大塔を焼かせずに守った' })),
    ], () => this.win(rt));
  },

  // 大塔へ寄せる行人方：大塔の前へ駆け、近くに居る間は塔が焦げる（update で数える）
  towerWave(name, from) {
    return { name, from, list: [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 8 }, { type: 'gun', n: 2 }], dmg: 0.5, mass: 100, noRout: 20 };
  },

  // 山門：門の前の守りを崩し、門扉を打ち破る（自分が門の前に着けば味方が閂を外す）
  gateStep() {
    const self = this;
    return {
      kind: 'fight', max: 160,
      start(rt, C) {
        const F = rt.flags;
        C.at = { x: GATE.x, z: GATE.z - 6 }; C.goal = C.at; C.groups = [];
        rt.banner('山門を開けよ', '門の前の守りを崩す');
        sfx('taiko', 0.8);
        rt.say('組頭', '山門の前に行人方が固めておる！　崩して門を破れ！', 3.5);
        const g = enemyGroup(rt, { faction: 'saika', fixed: true, name: '山門の守り', anchor: { x: GATE.x, z: GATE.z - 8 }, facing: Math.PI, order: 'attack', seekRange: 40, aggro: 12, width: 10, morale: 90, fleeDir: { x: 0, z: 1 }, dmgMult: 0.5, noRout: true },
          dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 10 }, { type: 'gun', n: 2 }], NEGORO));
        rt.after(18, () => { g.noRout = false; });
        C.groups.push(g);
        KIT.backOf(rt, g, { flag: NEGORO.flag, armor: NEGORO.armor, kind: 'spear', w: 18, depth: 8, count: 80, seed: 15870 });
        rt.obj('dp', '根来寺の山門を守る行人方を崩し、門を開けて境内へ入る', 'main');
        rt.marker('dp', C.at, '山門', { h: 4 });
        for (const fg of F.friends()) { fg.order = 'attack'; fg.seekRange = 40; fg.anchor = { x: C.at.x, z: C.at.z - 4 }; }
      },
      tick(rt, C, m, ctx, el) {
        const F = rt.flags, p = rt.player.u.pos;
        const left = heads(C.groups);
        if (left < 4) for (const g of C.groups) if (alive(g)) { g.noRout = false; g.morale = Math.min(g.morale, 15); }
        const near = Math.hypot(p.x - GATE.x, p.z - (GATE.z - 3)) < 9;
        // 守りが崩れて自分が門の前に居る時、または長引いた時は、味方が門扉を破る
        if (F.gate.alive && ((left < 4 && near) || el > 110)) self.openGate(rt);
        if (!F.gate.alive && !C.opened) { C.opened = true; rt.marker('dp', { x: GATE.x, z: GATE.z + 12 }, '境内', { h: 3 }); }
        C.goal = C.opened ? { x: GATE.x, z: GATE.z + 12 } : left ? (C.groups.find(alive)?.center() || C.at) : C.at;
        rt.objProgress('dp', C.opened ? '' : left ? `残り${left}人` : '');
        return C.opened && p.z > GATE.z + 6;
      },
      end(rt, C) {
        for (const g of C.groups) if (alive(g)) { g.noRout = false; g.morale = 0; }
        rt.unmark('dp');
        rt.objDone('dp');
        rt.award((t) => t.side.push('山門を破り、境内へ入った'), '山門を破った');
        const F = rt.flags;
        for (const fg of F.friends()) { fg.order = 'attack'; fg.anchor = { x: TOWER_FRONT.x, z: TOWER_FRONT.z - 10 }; }
      },
    };
  },

  openGate(rt) {
    const F = rt.flags, s = F.gate;
    // 味方が打ち破った時（onStructDestroyed）も、ここで一度だけ火と知らせを出す
    if (F.gateOpened) return;
    F.gateOpened = true;
    if (s.alive) {
      s.hitFrom = { x: GATE.x, z: GATE.z - 4 }; s.alive = false; s.hp = 0;
      rt.army.structFall(s);
    }
    sfx('taiko', 1);
    rt.banner('山門が開いた', '境内へ攻め入る');
    rt.say('足軽', '門が破れたぞ！　境内へ！', 2.5);
    // 史実：坊舎の多くが焼けた。境内の坊舎に火が回る（大塔と大師堂は残る）
    const W = rt.world;
    if (W.addBlaze && !F.blazes) {
      F.blazes = [];
      for (const q of [F.keidai[0], F.keidai[3], F.keidai[5], F.monzen[2], F.monzen[5]]) if (q) F.blazes.push(W.addBlaze(q.x, q.z, { w: 6.5, d: 5, h: 3.2 }));
      rt.after(5, () => rt.say('堀秀政', '坊舎に火が回った！　根来の寺が燃えるぞ。大塔へ火を渡すな', 3.5));
    }
  },

  onStructDestroyed(rt, s) {
    if (s === rt.flags.gate) this.openGate(rt);
  },

  update(rt, dt) {
    const F = rt.flags;
    KIT.backTick(rt);
    if (F.TA) F.TA.tick(dt);
    tickTabas(rt, dt);
    depthTick(rt, dt);
    if (F.ending) return;
    // 大塔：近くに寄った根来衆の数だけ焦げる。焼け落ちたら負け
    if (F.step >= 4) {
      F.towerScanT = (F.towerScanT || 0) - dt;
      if (F.towerScanT <= 0) {
        F.towerScanT = 0.5;
        let k = 0;
        for (const u of rt.army.units) if (u.alive && u.team === 1 && !u.fleeing && Math.hypot(u.pos.x - DAITO.x, u.pos.z - DAITO.z) < 13) k++;
        if (k) {
          F.towerHp = Math.max(0, F.towerHp - k * 0.2);
          if (!F.towerWarn && F.towerHp < 60) { F.towerWarn = true; rt.say('羽柴秀次', '大塔の縁に火がついた！　行人方を寄せつけるな！', 3); }
          if (F.towerHp < 40 && !F.towerFire && rt.world.addFire) F.towerFire = rt.world.addFire(DAITO.x + 6, DAITO.z - 6, { size: 1.6, h: 1.2 });
        }
        rt.objProgress('main', `大塔の守り ${Math.round(F.towerHp)}／100`);
        if (F.towerHp <= 0) { this.lose(rt, '大塔が焼け落ちた'); return; }
      }
    }
    // 時間：六分を過ぎても大塔へ届かなければ、行人方が大塔に火をかける
    if (rt.t > 420 && rt.canFailMission()) this.lose(rt, '刻を失い、大塔に火をかけられた');
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.objDone('main');
    for (const g of rt.army.groups || []) if (g.team === 1 && g.count) { g.noRout = false; g.morale = 0; }
    if (F.towerFire && rt.world.removeFire) rt.world.removeFire(F.towerFire);
    sfx('horagai', 0.8);
    rt.banner('根来寺、落ちる', '大塔と大師堂は残った');
    rt.award((t) => { t.main = true; t.special = { label: F.towerHp > 80 ? '大塔に火を付けさせずに守り抜いた' : '焦げた大塔を守り抜いた', pts: 18 }; }, '大塔を守った');
    // 戦の後の会話
    rt.player.u.invuln = true;
    rt.say('羽柴秀吉', '坊主の鉄砲も、これで終いじゃ', 3.5);
    rt.after(3.8, () => rt.say(rt.G.name || '自分', '大塔だけは残りました', 3));
    rt.after(7, () => rt.say('羽柴秀次', '弾の跡は残ろうと、塔は立っておる。よう働いた', 3.5));
    rt.after(11, () => rt.say('仙石秀久', '雑賀の衆も散り散りじゃ。紀州の鉄砲の守りは崩れましたぞ', 3.5));
    rt.finish({}, 15);
  },

  lose(rt, why) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.objFail('main');
    rt.tracker.main = false;
    if (rt.world.addBlaze) rt.world.addBlaze(DAITO.x, DAITO.z, { w: 14, d: 14, h: 12, n: 3 });
    rt.banner(why, '大塔の炎が谷を照らす');
    rt.say('羽柴秀次', '大塔が……！　殿下に何と申し上げればよい', 3.5);
    rt.finish({ failureReason: why }, 8);
  },

  onKill(rt, v) {
    const F = rt.flags;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
  },
  onRout(rt, g) {
    if (g.team !== 1) return;
    rt.say('足軽', `${g.name}が崩れた！`, 2.5);
  },
};

// 両軍の総勢（羽柴勢はおよそ十万。根来寺に残った衆は数千の目安）
t04_negoro.force = (rt) => {
  const F = rt.flags;
  return { a: Math.round(100000 - (F.ak || 0) * 30), a0: 100000, b: Math.max(0, 3000 - (F.ek || 0) * 40), b0: 3000 };
};
t04_negoro.history = '天正十三年（1585）三月、小牧・長久手の和睦を終えた羽柴秀吉は、およそ十万の兵で紀州へ向かった。鉄砲で名高い根来衆・雑賀衆を攻めるためである。三月二十一日、和泉の千石堀城では根来衆の主力が激しく戦ったが、火が煙硝蔵に入って城は落ちた。二十三日、秀吉勢は根来寺へ入り、坊舎の多くが焼けた。大塔と大師堂は焼け残り、大塔には今も弾の跡が残ると伝わる。史実では根来寺そのものでの抵抗は少なかった。遊びでは寺に残った鉄砲衆の抵抗を厚くし、竹束での寄せ・坊舎の斬り込み・山門・大塔の守りを一続きの段にまとめた。寺の並びと寸法、秀次・筒井定次の持ち場は推定。';

// bot：段の的へ進み、目の前の敵を突く（b_depth の頭）
t04_negoro.botBrain = (b, inp, { goTo }) => {
  inp.quickCmd = null;
  if (b.flags.ending) { inp.k.delete('KeyW'); return; }
  if (!b.flags.dp || !b.flags.dp.on) {
    // 段の始まる前は先手のそばで待つ
    const u = b.player.u;
    inp.k.delete('KeyW');
    if (Math.hypot(u.pos.x - START.x, u.pos.z - (START.z + 8)) > 4) goTo(b.player, inp, START.x, START.z + 8, 2);
    return;
  }
  depthBot(b, inp, goTo);
};

// bot は打ち込みを見て構えてから、この戦の頭へ（toyo_bot.js）
withGuard(t04_negoro);

export { t04_negoro };
export default t04_negoro;
