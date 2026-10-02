// ======================================================================
// 織田家編　小谷城の戦い（天正元年八月〜九月）
// 刀根坂で朝倉を破り、一乗谷を焼いた信長は、その足で北近江の小谷城を囲んだ。
// 羽柴秀吉は夜、谷から尾根の真ん中の京極丸へ攻め上り、長政のいる本丸と、父の久政のいる小丸とを切り離した。
// 足軽は羽柴秀吉の手。①夜の谷を登る ②京極丸の守りを退けて取る ③本丸と小丸の両方からの寄せを受け止め、京極丸を守る
// ④本丸から出されたお市の方と三人の姫の一行を、織田の陣まで供する（長政の最期は史実の文で）
// 向き：尾根は南北（北 -z が高い）。南の番所・大広間・本丸、真ん中の京極丸、北の小丸・山王丸。東（+x）の谷から登る
// 縄張り（docs/late6-1573-1575-spec.md 14〜37章）は castles/odani.js：番所→御茶屋→御馬屋（馬洗池）→
// 桜馬場→黒金御門→大広間→本丸→（大堀切）→中丸→京極丸→小丸→山王丸の梯郭。プレイヤーの実の持ち場は
// 京極丸より東（谷からの夜討ち）。南の番所〜大広間は遠景・見た目として作る（docs 周りの砦と同じ扱い）。
// ======================================================================
import * as THREE from 'three';
import { nobori, hut, yagura, campfire, koshi, ishigaki, sumiyagura, kagaribi, sakamogi, umatsunagi, yaguramon } from './props.js';
import { flagTexture } from './textures.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { moraleWord } from './hud.js';
import { gauss, enemyGroup, allyGroup, nm, centerOf, unitPos, wallLine, guardRecover, hpBarSystem, strengthBanner } from './bhelp.js';
import { applyLook, NIGHT, dress, gone, volleyWatch } from './b_inabayama.js';
import { KIT } from './b_nagashinojo.js';
import { camp } from './b_mid.js';
import { volleyScene } from './b_shiga.js';
import { depthStart, depthTick, depthBot, rest, pick, fight, hold } from './b_depth.js';
import { buildCastlePlan, heightOf } from './castle_plan.js';
import { goten } from './castle_parts.js';
import { makeSiegeZones } from './siege_zones.js';
import { demBlend } from './dem.js';
let DEM = null;
import('./asset_dem_odani.js').then((m) => { DEM = m.default; }).catch(() => {});
import {
  ODANI_PLAN, HON, KYOGOKU as KYO, KOMARU as KOM, SANNOMARU as SANNO, OOHIROMA, SAKURABABA, ONMAYA, OCHAYA, BANSHO,
  UMAARAI, GATE_KURO, NAKAMARU, OHORIKIRI, GATE_EAST,
} from './castles/odani.js';

const DEM_SCALE = 0.16;   // 実測 relief(m) をゲームの高さの単位へ縮める（曲輪の段差を壊さない程度に弱く）
const DEM_FLOOR = -3;
const VALLEY = { x: 84, z: -50 };           // 東の谷（登り口）
const CAMP = { x: 110, z: -20 };            // 谷の織田の陣
const CLIMB = [[VALLEY.x, VALLEY.z], [56, -54], [43, -55], [30, -56], [KYO.x + KYO.r + 2, KYO.z]];
// お市の方の一行が下る道：本丸の北の口 → 京極丸 → 東の口 → 谷
const ESCORT = [[0, -18], [0, -40], [2, -52], [KYO.x + KYO.r + 2, KYO.z], [30, -56], [56, -54], [VALLEY.x, VALLEY.z]];
const ODA = { flag: 'oda' };
const AZAI = { flag: 'azai' };
// 任務札の段が済んだ事を二秒見せてから、次の札に替える
// 足軽大将ほどの身分（信長で遊ぶ時は除く）：羽柴の先手の一隊を預かり、京極丸の一手を守る
const hi = (rt) => !rt.G.lord && (rt.G.rank || 0) >= 3;
const nextObj = (rt, text) => { rt.objDone('main'); rt.after(2, () => { if (!rt.flags.ending) rt.obj('main', text, 'main'); }); };
// 羽柴秀吉の見た目（units.js の GENERALS は「木下藤吉郎」の名で持つので、同じ兜・羽織を渡す）
const HIDE = { hat: 'kabuto_bari', haori: 0x6a4a1c, armor: 0x2a2420, lace: 0x7a5a2a };

const ridgeH = (z) => (34 + Math.max(-20, Math.min(110, -z)) * 0.14) * Math.exp(-(Math.max(0, z - 20) ** 2) / 2400);
function baseTerrain(x, z) {
  let h = 0.5 * Math.sin(x * 0.04 + 0.3) * Math.cos(z * 0.03) + 0.3 * Math.sin(z * 0.08 + x * 0.02);
  // 小谷山の尾根（上は平らに削った曲輪が並ぶ。平らにする所は castle_plan.js の heightOf が上書きする）
  const ax = Math.max(0, Math.abs(x) - 9);
  // 谷から尾根への登り（x=56〜30）が崖のように急すぎて詰まったので、勾配を緩める
  h += ridgeH(z) * Math.exp(-(ax * ax) / 4000);
  // 西の山並みと、東の谷の向こうの山（虎御前山）
  h += 22 * gauss(x, z, -110, -40, 3000) + 16 * gauss(x, z, 170, 40, 2600);
  // 大堀切（本丸の北。尾根を断つ窪み。中は道の幅だけ自然に浅く、渡れる）
  const dz = z - OHORIKIRI.z, dx = Math.max(0, Math.abs(x) - 2.2);
  h -= OHORIKIRI.deep * Math.exp(-(dz * dz) / 18) * Math.exp(-(dx * dx) / 10);
  return h;
}
// 国土地理院の標高（asset_dem_odani）を手書きの base に混ぜる（曲輪・縁は heightOf が上から均す）
function baseWithDem(x, z) {
  const b = baseTerrain(x, z);
  return DEM ? demBlend(DEM, x, z, b, { scale: DEM_SCALE, floor: DEM_FLOOR }) : b;
}
let HEIGHT_FN = null;
function height(x, z) {
  if (!HEIGHT_FN) HEIGHT_FN = heightOf(ODANI_PLAN, baseWithDem, 3);
  return HEIGHT_FN(x, z);
}

// 弧の柵（a0 から a1 まで。角は +z から時計の向き。0 = 南、π/2 = 東、π = 北）。castle_plan.js の
// 塀（口は辺一つぶんの約5mしか開かず、隊列が詰まって動けなくなる＝確かめで見つけた）は使わず、
// 元のまま広い弧で結う（skipWalls で castle_plan.js 側の塀は作らせない）
function arcWall(rt, c, a0, a1, o) {
  const n = Math.max(2, Math.round((c.r * (a1 - a0)) / 5));
  const pts = [];
  for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * (i / n); pts.push([c.x + Math.sin(a) * c.r, c.z + Math.cos(a) * c.r]); }
  const segs = wallLine(rt, pts, { team: 1, hp: 1e9, segLen: 999, ...o });
  for (const s of segs) { s.noTarget = true; s.wall = true; }
  return segs;
}

const odani = {
  spawn: { x: VALLEY.x + 8, z: VALLEY.z + 4, heading: -Math.PI / 2 },
  world: {
    seed: 1573,
    wind: [-0.7, 0.7],   // 夜の山風
    time: 'dusk',
    muddy: 0.3,
    paths: [CLIMB, [[0, 40], [0, -110]]],
    height,
    tint(x, z, h, c) {
      // 尾根の曲輪の土
      if (Math.abs(x) < 12 && z < 20 && z > -115) c.lerp({ r: 0.46, g: 0.42, b: 0.34 }, 0.4);
      else if (h > 10) c.setRGB(c.r * 0.8, c.g * 0.88, c.b * 0.8);
    },
    clear: (x, z) => (Math.abs(x) < 22 && z < 160 && z > -144) || (z > -66 && z < -44 && x > 10 && x < 100) || Math.hypot(x - CAMP.x, z - CAMP.z) < 22,
    trees: 620,
    tufts: 3000,
    treeDensity: (x, z) => (Math.abs(x) < 24 ? 0.2 : 1),
    // 桜馬場は名の通り、尾根の中でそこだけ桜の群れを足す
    groves: [{ x: 40, z: -10, r: 14, n: 24 }, { x: 40, z: -96, r: 14, n: 24 }, { x: -40, z: -60, r: 16, n: 26 }, { x: -20, z: SAKURABABA.z, r: 10, n: 14 }, { x: 20, z: SAKURABABA.z + 6, r: 9, n: 12 }],
    fleeOut: (x, z, team) => team === 1 && (x < -40 || z < -144 || z > 160),
  },

  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    F.step = 0; F.ek = 0; F.ak = 0;
    F.hpBars = hpBarSystem(rt);
    strengthBanner(rt, 30000, 5000);
    // ---- 主尾根の梯郭：本丸・京極丸・小丸・山王丸・大広間は自分で塀を建てる（口の幅が辺一つ分しか
    // 開かず隊列が詰まるので＝確かめで見つけた、広めの弧で結う）。番所〜桜馬場は castle_plan.js に
    // そのまま建てさせる（背景・見た目の曲輪なので、辺一つ分の口でよい） ----
    const P = Math.PI, GW = 0.22;   // GW：弧の塀の口の半幅（門の幅のめやす）
    const C = F.C = buildCastlePlan(rt, ODANI_PLAN, { baseHeight: baseWithDem, edgeW: 3, buildGates: false, buildTowers: false, team: 1, skipWalls: ['oohiroma', 'hon', 'kyogoku', 'koma', 'sannomaru'] });
    // 本丸：南（大広間）と北（京極丸へ、中丸越し）の二つの口
    arcWall(rt, HON, GW, P - GW, { name: '本丸の柵' });
    arcWall(rt, HON, P + GW, 2 * P - GW, { name: '本丸の柵' });
    // 京極丸：南（本丸）・東（谷の登り口）・北（小丸）の三つの口
    arcWall(rt, KYO, GW, P / 2 - GW, { name: '京極丸の柵' });
    arcWall(rt, KYO, P / 2 + GW, P - GW, { name: '京極丸の柵' });
    arcWall(rt, KYO, P + GW, 2 * P - GW, { name: '京極丸の柵' });
    // 小丸：南（京極丸）・北（山王丸）の二つの口（北は元は塀が無く、尾根の脇が開いていた＝直した）
    arcWall(rt, KOM, GW, P - GW, { name: '小丸の柵' });
    arcWall(rt, KOM, P + GW, 2 * P - GW, { name: '小丸の柵' });
    // 大広間：南（桜馬場・黒金御門）と北（本丸）の二つの口（元は塀そのものが無かった＝直した）
    arcWall(rt, OOHIROMA, GW, P - GW, { name: '大広間の柵' });
    arcWall(rt, OOHIROMA, P + GW, 2 * P - GW, { name: '大広間の柵' });
    // 山王丸：南（小丸）一つの口。詰の城なので石垣を厚く（元は塀そのものが無かった＝直した）
    arcWall(rt, SANNO, GW * 1.1, 2 * P - GW * 1.1, { name: '山王丸の柵' });
    rt.scene.add(hut(W, HON.x - 4, HON.z + 4, 11, 7, 0.05, { h: 3.2, wall: 0x6a5238 }), hut(W, HON.x + 7, HON.z - 5, 6, 4, -0.1));
    rt.scene.add(hut(W, KYO.x - 5, KYO.z - 2, 7, 5, 0.1, { wall: 0x6a5238 }), yagura(W, KYO.x + 6, KYO.z - 7));
    rt.scene.add(hut(W, KOM.x + 2, KOM.z - 3, 8, 5, -0.1, { wall: 0x6a5238 }), yagura(W, KOM.x - 6, KOM.z + 4));
    rt.scene.add(yagura(W, HON.x + 10, HON.z + 8));
    // 城の見栄え：曲輪の縁に野面積みの石垣（口は空ける）、本丸の南に二重の櫓、東の登り口に逆茂木
    {
      const arcP = (c, a0, a1, r) => { const n = Math.max(2, Math.round(r * (a1 - a0) / 3)); return Array.from({ length: n + 1 }, (_, i) => { const a = a0 + (a1 - a0) * i / n; return [c.x + Math.sin(a) * r, c.z + Math.cos(a) * r]; }); };
      const st = (c, a0, a1) => rt.scene.add(ishigaki(W, arcP(c, a0, a1, c.r + 1.3), { top: 1.1, minH: 2.2, maxH: 3, lean: 0.12 }));
      st(HON, GW, P - GW); st(HON, P + GW, 2 * P - GW);
      st(KYO, GW, P / 2 - GW); st(KYO, P / 2 + GW, P - GW); st(KYO, P + GW, 2 * P - GW);
      st(KOM, GW, P - GW); st(KOM, P + GW, 2 * P - GW);
      st(OOHIROMA, GW, P - GW); st(OOHIROMA, P + GW, 2 * P - GW);
      // 山王丸：詰の城。四段を思わせる、少し小さな内の段をもう一重
      st(SANNO, GW * 1.1, 2 * P - GW * 1.1);
      st({ x: SANNO.x, z: SANNO.z - 2, r: SANNO.r * 0.55 }, GW * 1.4, 2 * P - GW * 1.4);
      rt.scene.add(sumiyagura(W, HON.x - 2, HON.z + 26, { rot: Math.PI, w: 7, d: 5.5, stone: 'nozura' }));
      rt.scene.add(sumiyagura(W, SANNO.x - 3, SANNO.z - 6, { rot: Math.PI, w: 6, d: 5, stone: 'nozura' }));
      rt.scene.add(sakamogi(W, 40, -43, Math.PI / 2 + 0.2, 6), sakamogi(W, 40, -68, Math.PI / 2 - 0.2, 6));
    }
    F.flagsKom = [];
    for (const [x, z] of [[HON.x - 8, HON.z - 10], [HON.x + 8, HON.z - 12], [KYO.x - 8, KYO.z - 6], [KOM.x + 6, KOM.z + 6], [KOM.x - 4, KOM.z - 8], [SANNO.x + 4, SANNO.z - 4]]) { const n2 = nobori(W, x, z, 'azai', 6); rt.scene.add(n2); if (z < -80) F.flagsKom.push(n2); }
    // 本丸と南の曲輪に詰める浅井の城兵（遠景）と篝火
    // 本丸の本陣：浅井長政は建物の中（天守は無い。御殿を本丸の奥に置き、旗本がその前を固める）
    goten(rt, HON.x - 1, HON.z + 7, { team: 1, w: 10, d: 6.5 });
    F.honCamp = camp(rt, { x: HON.x, z: HON.z, facing: 0, team: 1, faction: 'saito', mon: 'azai', armor: 0x2e2a26, general: { name: '浅井長政', hat: 'kabuto_m', haori: 0x2e2a3a }, guard: 16, reserve: 0, runTo: { x: 0, z: 40 } });
    // 本丸の柵の内に沿って、外を向いて構える鉄砲・弓・槍の者（軽い作り）。北の口の前は空ける
    {
      const crew = [];
      for (let a = -P * 0.8, k = 0; a <= P * 0.8; a += 0.2, k++) {
        crew.push({ x: HON.x + Math.sin(a) * (HON.r - 1.2), z: HON.z + Math.cos(a) * (HON.r - 1.2), k: ['gun', 'spear', 'bow', 'spear'][k % 4], facing: a });
        if (k % 6 === 3) crew.push({ x: HON.x + Math.sin(a) * (HON.r - 3), z: HON.z + Math.cos(a) * (HON.r - 3), k: 'banner', facing: a });
      }
      W.addDistantArmy({ people: crew, armor: 0x2e2a26, team: 1, flagTex: flagTexture('azai'), seed: 15737 });
    }
    W.addDistantArmy({ x: 0, z: 40, w: 14, d: 12, count: 130, facing: Math.PI, armor: 0x2e2a26, team: 1, flagTex: flagTexture('azai'), seed: 15736 });
    for (const [x, z] of [[4, 26], [-6, 44], [HON.x - 10, HON.z + 6]]) { rt.scene.add(campfire(W, x, z)); W.addFire(x, z); }
    // 山王丸（詰の城）に詰める兵（遠景）
    W.addDistantArmy({ x: SANNO.x, z: SANNO.z, w: 10, d: 10, count: 40, facing: Math.PI, armor: 0x2e2a26, team: 1, flagTex: flagTexture('azai'), seed: 15738 });
    // ---- 主尾根の南：桜馬場・御馬屋（馬洗池）・御茶屋・番所（遠景・見た目。周りの砦と同じ扱い） ----
    rt.scene.add(hut(W, 0, OOHIROMA.z - 8, 9, 6, 0.1, { wall: 0x6a5238 }));   // 大広間の大きな建物
    rt.scene.add(yaguramon(W, GATE_KURO.x, GATE_KURO.z, 3.6, 0, { stone: 'nozura' }));   // 黒金御門（門＋石垣＋狭い道）
    rt.scene.add(ishigaki(W, [[-5, GATE_KURO.z + 4], [-5, GATE_KURO.z - 4]], { top: 1.1, minH: 2, maxH: 2.6 }));
    rt.scene.add(ishigaki(W, [[5, GATE_KURO.z - 4], [5, GATE_KURO.z + 4]], { top: 1.1, minH: 2, maxH: 2.6 }));
    rt.scene.add(hut(W, SAKURABABA.x - 4, SAKURABABA.z, 8, 6, -0.1), hut(W, SAKURABABA.x + 5, SAKURABABA.z + 6, 6, 4, 0.1));
    rt.scene.add(hut(W, ONMAYA.x + 3, ONMAYA.z - 2, 7, 10, 0, { wall: 0x5a4a34 }));   // 御馬屋
    rt.scene.add(umatsunagi(W, ONMAYA.x - 4, ONMAYA.z - 5, 0.2, 6));
    { const w = new THREE.Mesh(new THREE.CircleGeometry(UMAARAI.r, 16), new THREE.MeshStandardMaterial({ color: 0x2c3a36, roughness: 0.2, metalness: 0, transparent: true, opacity: 0.9 }));
      w.rotation.x = -Math.PI / 2; w.position.set(UMAARAI.x, rt.world.heightAt(UMAARAI.x, UMAARAI.z) + 0.03, UMAARAI.z); rt.scene.add(w); }   // 馬洗池
    rt.scene.add(hut(W, OCHAYA.x, OCHAYA.z, 6, 5, 0.1, { wall: 0x6a5238 }));   // 御茶屋（再編地点）
    rt.scene.add(hut(W, BANSHO.x, BANSHO.z, 4.5, 3.6, 0, { wall: 0x4a3a2a }), sakamogi(W, BANSHO.x, BANSHO.z + BANSHO.r - 1, 0, 5));   // 番所
    for (const [x, z] of [[OOHIROMA.x, OOHIROMA.z], [SAKURABABA.x - 3, SAKURABABA.z - 4], [ONMAYA.x, ONMAYA.z + 6], [BANSHO.x, BANSHO.z - 3]]) { const n2 = nobori(W, x, z, 'azai', 6); rt.scene.add(n2); }
    // 中丸：本丸の後ろ、京極丸への道の脇。桝形虎口を思わせる折れた石垣の目印（当たりは持たない。見た目だけ）
    rt.scene.add(ishigaki(W, [[NAKAMARU.x - 3, NAKAMARU.z + 3], [NAKAMARU.x - 3, NAKAMARU.z - 3], [NAKAMARU.x + 3, NAKAMARU.z - 3]], { top: 1, minH: 1.8, maxH: 2.2 }));
    rt.scene.add(yagura(W, NAKAMARU.x, NAKAMARU.z));
    // 篝火
    for (const [x, z] of [[HON.x + 4, HON.z - 12], [KOM.x, KOM.z + 8], [KYO.x - 2, KYO.z + 4], [SANNO.x, SANNO.z - 6]]) { rt.scene.add(kagaribi(W, x, z)); W.addFire(x, z, { h: 1.4 }); }
    // ---- 羽柴秀吉の手（自分の持ち場）と、蜂須賀の手 ----
    F.hide = allyGroup(rt, { name: '羽柴秀吉の手', anchor: { x: VALLEY.x, z: VALLEY.z }, facing: -Math.PI / 2, width: 12, aggro: 8, noRout: true },
      dress([{ type: 'busho', n: 1, o: { name: '羽柴秀吉', invuln: true, ...HIDE } }, { type: 'ashigaru', n: 16 }, { type: 'gun', n: 3 }], ODA));
    F.hideU = F.hide.units[0];
    F.hachi = allyGroup(rt, { name: '蜂須賀正勝の手', anchor: { x: VALLEY.x + 6, z: VALLEY.z - 14 }, facing: -Math.PI / 2, width: 12, aggro: 8, noRout: true },
      dress([{ type: 'samurai', n: 1, o: { name: '蜂須賀正勝', invuln: true, hat: 'kabuto_m', haori: 0x3a2a1a } }, { type: 'ashigaru', n: 14 }], ODA));
    F.oda = [F.hide, F.hachi];
    for (const g of F.oda) { g.defMult = 1.25; g.dmgMult = 0.85; }
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: VALLEY.x + 10, z: VALLEY.z + 10 }, -Math.PI / 2, [{ kind: 'spear', n }]);
    // ---- 谷の見張り（浅井） ----
    F.watch = enemyGroup(rt, { faction: 'saito', name: '谷の見張り', anchor: { x: 44, z: -54 }, facing: Math.PI / 2, width: 6, aggro: 14, morale: 70, fleeDir: { x: -1, z: 0 }, dmgMult: 0.7 },
      dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 6 }], AZAI));
    // ---- 京極丸の守り ----
    F.kyo = enemyGroup(rt, { faction: 'saito', name: '京極丸の守り', anchor: { x: KYO.x + 2, z: KYO.z }, facing: Math.PI / 2, width: 10, aggro: 12, morale: 95, fleeDir: { x: 0, z: -1 }, dmgMult: 0.7, formation: 'yari' },
      dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 14 }, { type: 'bow', n: 3 }], AZAI));
    // ---- 区域の網（links）：京極丸を取れば、尾根の鎖の上で本丸と小丸が切れる（castles/odani.js） ----
    F.SZ = makeSiegeZones(rt, {
      zones: [
        { id: 'hon', name: '本丸', test: C.kuruwa.hon.test, pos: C.kuruwa.hon.centroid, need: 10, hold: 20 },
        { id: 'kyogoku', name: '京極丸', test: C.kuruwa.kyogoku.test, pos: C.kuruwa.kyogoku.centroid, need: 8, hold: 14 },
        { id: 'koma', name: '小丸', test: C.kuruwa.koma.test, pos: C.kuruwa.koma.centroid, need: 8, hold: 20 },
      ],
      links: [['hon', 'kyogoku'], ['kyogoku', 'koma']],
      friendTeam: 0, enemyTeam: 1,
      noReinforce: () => true,
      onFall: (id) => { if (id === 'kyogoku' && F.step === 2) this.cut(rt); },
    });
    // ---- 陣と大軍（軽い作り）：虎御前山の信長の本陣、小谷を囲む織田勢 ----
    // 谷の織田の陣：信長と旗本、後ろに控え（信長で遊ぶ時は旗本だけ）
    F.odaCamp = camp(rt, { x: CAMP.x, z: CAMP.z, facing: -Math.PI / 2, team: 0, faction: 'oda', mon: 'oda', general: { name: '織田信長' }, guard: 16, reserve: 200, runTo: { x: VALLEY.x, z: VALLEY.z } });
    for (const [x, z, k] of [[CAMP.x - 8, CAMP.z - 8, 'oda'], [CAMP.x + 4, CAMP.z - 9, 'eiraku'], [VALLEY.x - 4, VALLEY.z + 8, 'oda']]) rt.scene.add(nobori(W, x, z, k, 6));
    const DA = (x, z, w, d, count, facing, armor, flag, seed) => W.addDistantArmy({ x, z, w, d, count, facing, armor, flagTex: flagTexture(flag), seed });
    DA(150, 20, 30, 12, 240, -Math.PI / 2, 0x2b3140, 'oda', 15731);
    DA(130, -90, 30, 12, 200, -Math.PI / 2, 0x2b3140, 'eiraku', 15732);
    DA(30, 110, 40, 12, 260, Math.PI, 0x2b3140, 'oda', 15733);
    for (const [x, z] of [[140, 0], [120, -80], [20, 96]]) W.addFire(x, z, { torch: true, h: 1.4 });

    applyLook(rt, NIGHT);
    rt.setPhase('brief');
    rt.obj('main', hi(rt) ? '羽柴秀吉の先手の一隊を預かり、夜攻めの下知を待て' : '羽柴秀吉のもとで、夜攻めの下知を待て', 'main');
    rt.say('羽柴秀吉', `${nm(rt)}、朝倉は越前で滅んだ。残るは、この小谷の浅井だけじゃ`, 4.5);
    rt.say('羽柴秀吉', '尾根の真ん中の京極丸を取れば、長政殿の本丸と、久政殿の小丸が切れる。今夜、谷から登るぞ', 5);
    // 印の秀吉に寄って話を聞けば、すぐに次へ（寄らなくても下知は来る）
    rt.marker('hide', unitPos(F.hideU), '羽柴秀吉（話を聞く）', {});
    rt.addInteract('talk', { x: VALLEY.x, z: VALLEY.z }, '秀吉の話を聞く', () => { rt.uninteract('talk'); rt.say('羽柴秀吉', '（小声で）よし、参るぞ', 2); rt.after(2, () => this.climb(rt)); }, { r: 5 });
    rt.after(15, () => this.climb(rt));
  },

  // ① 夜の谷を登る
  climb(rt) {
    const F = rt.flags;
    if (F.step >= 1) return;
    F.step = 1; F.stepT = rt.t;
    rt.setPhase('climb');
    rt.uninteract('talk');
    // 忍んで登る：太鼓は鳴らさず、組の返事も声にしない
    F.quiet = true;
    rt.obj('main', hi(rt) ? '先手の一隊を率いて、谷を京極丸まで登れ' : '羽柴秀吉について、谷を京極丸まで登れ', 'main');
    rt.say('羽柴秀吉', '（小声で）声を立てるな。松明は消せ。……行くぞ', 3);
    const H = F.hide;
    H.order = 'path'; H.path = CLIMB.slice(1, -1); H.pathIdx = 0; H.speed = 2.2; H.formation = 'column'; H.aggro = 10;
    H.onArrive = (g) => { g.order = 'hold'; g.anchor = { x: 30, z: -56 }; g.formation = 'line'; g.aggro = 12; };
    F.hachi.order = 'move'; F.hachi.dest = { x: 34, z: -66 }; F.hachi.speed = 2.1; F.hachi.onArrive = (g) => { g.order = 'hold'; g.anchor = { x: 34, z: -66 }; };
  },

  // ② 京極丸を取る
  assault(rt) {
    const F = rt.flags;
    if (F.step >= 2) return;
    F.step = 2; F.stepT = rt.t;
    rt.setPhase('kyogoku');
    rt.unmark('hide');
    if (!gone(F.watch)) F.watch.morale = Math.min(F.watch.morale, 15);
    sfx('horagai', 0.9);
    F.quiet = false;
    rt.banner('京極丸へ', '尾根の真ん中の曲輪に攻め入る');
    nextObj(rt, '京極丸に攻め入り、守りを退けよ');
    rt.say('羽柴秀吉', 'かかれ！　京極丸を取れ！', 2.5);
    for (const g of F.oda) { g.order = 'attack'; g.seekRange = 40; g.formation = 'line'; }
    F.kyo.order = 'attack'; F.kyo.seekRange = 30;
    rt.marker('kyo', centerOf(F.kyo), () => `京極丸の守り・${moraleWord(F.kyo.morale)}`, { red: true, group: F.kyo });
    F.kyo.noRout = true; rt.after(25, () => { F.kyo.noRout = false; });
    KIT.backOf(rt, F.kyo, { flag: 'azai', armor: 0x2e2a26, kind: 'spear', w: 12, depth: 8, count: 90, seed: 15741 });
    // 本丸から京極丸へ加勢が駆けつける（京極丸は、ただの小勢の曲輪ではない）
    rt.after(16, () => {
      if (F.step !== 2) return;
      const g = enemyGroup(rt, { faction: 'saito', name: '本丸からの加勢', anchor: { x: 0, z: -24 }, facing: Math.PI, order: 'attack', seekRange: 70, aggro: 14, width: 10, morale: 90, fleeDir: { x: 0, z: 1 }, dmgMult: 0.62 },
        dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 14 }, { type: 'bow', n: 2 }], AZAI));
      F.kyoAid = g;
      KIT.backOf(rt, g, { flag: 'azai', armor: 0x2e2a26, kind: 'spear', w: 14, depth: 8, count: 110, seed: 15742 });
      rt.army.play('eshout', { x: 0, z: -26 }, 1.5);
      rt.say('羽柴秀吉', '本丸から加勢が来た！　京極丸に入れるな、南の口を塞げ！', 3.5);
      rt.marker('kyoAid', centerOf(g), () => `本丸からの加勢・${moraleWord(g.morale)}`, { red: true, group: g });
    });
  },

  // ③ 本丸と小丸からの寄せ
  cut(rt, late = false) {
    const F = rt.flags;
    if (F.step >= 3) return;
    F.step = 3; F.stepT = rt.t;
    rt.setPhase('cut');
    rt.unmark('kyo');
    if (!gone(F.kyo)) F.kyo.morale = 0;
    if (!late) rt.award((t) => t.side.push('京極丸を取った'), '京極丸を取った');
    rt.banner('京極丸を取った', '本丸と小丸が切り離された');
    nextObj(rt, hi(rt) ? '京極丸の一手を預かり守れ：本丸と小丸の両方から寄せてくる' : '京極丸を守れ：本丸と小丸の両方から寄せてくる');
    // 守る場所の輪（出れば秀吉が呼び戻す）
    rt.zone('kyo', KYO.x, KYO.z, KYO.r + 6);
    rt.say('羽柴秀吉', 'よし、これで長政殿と久政殿は、互いに助けに行けぬ。……じゃが、両方から来るぞ！', 4.5);
    for (const [g, x, z] of [[F.hide, 0, -46], [F.hachi, 0, -64]]) { g.order = 'hold'; g.anchor = { x, z }; g.aggro = 14; }
    F.hide.facing = 0; F.hachi.facing = Math.PI;
    // 京極丸の南の口に鉄砲を並べる（本丸からの道は細い。出口で撃てば崩れる）
    { const c = F.hide.center();
      F.gunH = allyGroup(rt, { name: '羽柴の鉄砲衆', anchor: { x: c.x, z: c.z }, facing: 0, width: 10, aggro: 4, noRout: true }, dress([{ type: 'gun', n: 6 }], ODA));
      F.gunH.order = 'move'; F.gunH.dest = { x: 2, z: -38 }; F.gunH.speed = 2.6; F.gunH.onArrive = (gg) => { gg.order = 'hold'; gg.anchor = { x: 2, z: -38 }; gg.facing = 0; gg.aggro = 4; }; }
    rt.after(12, () => { if (F.step === 3) rt.say('羽柴秀吉', '本丸からの道は細い。出口で鉄砲を浴びせて崩し、そこを槍で突け', 4); });
    const mk = (name, x, z, face, fz, list) => enemyGroup(rt, { faction: 'saito', name, anchor: { x, z }, facing: face, order: 'attack', seekRange: 80, aggro: 14, width: 10, morale: 95, fleeDir: { x: 0, z: fz }, dmgMult: 0.68 }, dress(list, AZAI));
    rt.after(6, () => {
      F.fromHon = mk('本丸から打って出た兵', 0, -6, Math.PI, 1, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 14 }, { type: 'bow', n: 2 }]);
      // 本丸の兵は数人でなく、曲輪を埋めて寄せる（後ろの控えは軽い作り）
      KIT.backOf(rt, F.fromHon, { flag: 'azai', armor: 0x2e2a26, kind: 'spear', w: 14, depth: 10, count: 140, seed: 15739 });
      rt.army.play('eshout', { x: 0, z: -10 }, 1.6);
      rt.say('浅井の侍', '京極丸を取り返せ！　小丸の大殿を見捨てるな！', 3.5);
      rt.marker('fh', centerOf(F.fromHon), () => `本丸の兵・${moraleWord(F.fromHon.morale)}`, { red: true, group: F.fromHon });
    });
    rt.after(34, () => {
      if (F.step !== 3) return;
      F.fromKom = mk('小丸から打って出た兵', 0, -96, 0, -1, [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 12 }, { type: 'gun', n: 2 }]);
      for (const u of F.fromKom.units) if (u.type === 'gun') u.dmg *= 0.5;
      rt.army.play('eshout', { x: 0, z: -92 }, 1.4);
      rt.say('足軽', '北の小丸からも来るぞ！　後ろじゃ！', 3);
      rt.marker('fk', centerOf(F.fromKom), () => `小丸の兵・${moraleWord(F.fromKom.morale)}`, { red: true, group: F.fromKom });
    });
  },

  // 段を重ねる（b_depth.js）：小丸を叩くか京極丸で受けるか → 本丸の精兵をどう受けるか
  deep(rt, late = false) {
    const F = rt.flags;
    if (F.deep) return;
    F.deep = true;
    rt.unmark('fh'); rt.unmark('fk'); rt.unzone('kyo');
    for (const q of [F.fromHon, F.fromKom]) if (q && !gone(q)) { q.noRout = false; q.morale = 0; }
    if (!late) rt.award((t) => t.side.push('京極丸で最初の寄せを退けた'), '最初の寄せを退けた');
    rt.banner('寄せを退けた', '本丸も小丸も、まだ兵を集め直している');
    rt.obj('main', '京極丸を保ち、本丸と小丸の浅井勢を退けよ', 'main');
    const ctx = { faction: 'saito', flag: 'azai', armor: 0x2e2a26, dmg: 0.6, mass: 160, look: (l) => dress(l, AZAI),
      friends: () => [F.hide, F.hachi, F.gunH].filter((g) => g && g.count && !g.routed),
      aid: { name: '羽柴の後詰', faction: 'oda', list: [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 10 }] }, aidSaid: '谷から羽柴の後詰が登ってきた' };
    depthStart(rt, ctx, odSteps(), () => this.escort(rt, true));
  },

  // ④ お市の方の一行を供する
  escort(rt, late = false) {
    const F = rt.flags;
    if (F.step >= 4) return;
    F.step = 4; F.stepT = rt.t;
    rt.setPhase('escort');
    rt.unmark('fh'); rt.unmark('fk'); rt.unzone('kyo');
    for (const q of [F.fromHon, F.fromKom]) if (q && !gone(q)) { q.noRout = false; q.morale = 0; }
    if (!late) rt.award((t) => t.side.push('京極丸を守り切った'), '京極丸を守り切った');
    rt.world.setTime('morning');
    sfx('kane', 0.5);
    rt.banner('小丸、落ちる', '浅井久政は小丸で腹を切った');
    // 小丸から煙が上がり、浅井の旗が倒れる（京極丸から見える）
    rt.world.addSmokeColumn(KOM.x, rt.world.heightAt(KOM.x, KOM.z) + 4, KOM.z, { size: 2.8 });
    rt.world.addFire(KOM.x + 2, KOM.z - 3, { h: 1.6 });
    F.flagsKom.forEach((n2, i) => rt.after(1 + i * 0.8, () => { n2.rotation.z = 1.3; n2.position.y += 0.1; }));
    if (!rt.player.lock) rt.player.cine = { x: KOM.x, z: KOM.z, t: 2.2 };
    rt.say('羽柴秀吉', '……本丸から使いが来た。長政殿が、お市様と三人の姫君を、織田の陣へお返しなさると', 5);
    rt.say('羽柴秀吉', `${nm(rt)}、一行の供をせよ。谷の陣まで、誰にも指一本触れさせるな`, 4);
    nextObj(rt, 'お市の方と三人の姫の一行を、谷の織田の陣まで供せよ');
    // 一行（戦わない。狙われない）。お市の方と姫は塗輿に乗り、担ぎ手と侍女が囲む
    const g = allyGroup(rt, { name: 'お市の方の一行', anchor: { x: 0, z: -14 }, facing: Math.PI, width: 4, aggro: 0, noRout: true, formation: 'column', speed: 2.2 },
      [{ type: 'samurai', n: 1, o: { name: '藤掛永勝', flag: null, hat: 'none' } },
        { type: 'porter', n: 2, o: { flag: null, hat: 'none', armor: 0x6a3a4a, lace: 0xb8a070, cloth: 0x8a3a4a } },
        { type: 'porter', n: 2, o: { flag: null, hat: 'none', armor: 0x3a4a6a, lace: 0xb8a070, cloth: 0x4a5a8a } },
        { type: 'porter', n: 2, o: { flag: null, hat: 'none', armor: 0x4a4034, cloth: 0x5a4a3c } }]);
    F.escKoshi = koshi(rt.world, 0, -14, Math.PI, { moving: true });
    rt.scene.add(F.escKoshi);
    for (const u of g.units) { u.noTarget = true; u.invuln = true; u.dmg = 0; }
    g.order = 'path'; g.path = ESCORT.slice(); g.pathIdx = 0;
    g.onArrive = () => this.win(rt);
    F.esc = g;
    rt.marker('esc', centerOf(g), 'お市の方の一行', {});
    rt.zone('camp', VALLEY.x, VALLEY.z, 6);
    rt.after(3, () => rt.say('藤掛永勝', '織田の方々、お市様と姫君がたを、しかとお頼み申す', 4));
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.unmark('esc'); rt.unzone('camp');
    rt.objDone('main');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '京極丸を取り、お市の方の一行を供した', pts: 20 }; }, '任務達成・お市の方を織田の陣へ');
    sfx('horagai', 0.5);
    rt.banner('小谷城、落ちる', '数日のち、九月一日――浅井長政は本丸で自害した');
    rt.say('羽柴秀吉', '……長政殿は、よい大将じゃった。お市様と姫君は、殿がお預かりなさる', 5);
    rt.after(6, () => rt.say('', '――浅井の旧領、北近江の多くは秀吉に与えられた。秀吉はのちに今浜を長浜と改め、城を築く', 5.5));
    rt.player.u.invuln = true;
    rt.finish({}, 12);
  },

  update(rt, dt) {
    const F = rt.flags;
    // 崩れた隊の印は消す（古い印が「あちらじゃ」の行き先にならないように）
    for (const m of rt.markers.slice()) if (m.group && gone(m.group)) rt.unmark(m.id);
    if (F.ending) return;
    guardRecover(rt, F.hideU, dt, { line: ['羽柴秀吉', '……退くぞ。手傷じゃ、しばし堪えよ'], backLine: ['羽柴秀吉', 'もう良い、前へ出る'] });
    if (F.hpBars) F.hpBars.update(rt.army.groups);
    if (F.SZ) F.SZ.tick(dt);
    const p = rt.player.u.pos;
    if (F.step === 1) {
      const d = Math.hypot(p.x - (KYO.x + KYO.r), p.z - KYO.z);
      rt.objProgress('main', `京極丸まで ${Math.max(0, Math.round(d))}m`);
      const hc0 = F.hide.center();
      if (!F.watchOn && (Math.hypot(p.x - 44, p.z + 54) < 22 || Math.hypot(hc0.x - 44, hc0.z + 54) < 20)) { F.watchOn = true; F.watch.order = 'attack'; F.watch.seekRange = 30; rt.say('浅井の見張り', '谷に人がおるぞ！　織田じゃ！', 2.5); rt.marker('watch', centerOf(F.watch), () => `谷の見張り・${moraleWord(F.watch.morale)}`, { red: true, group: F.watch }); }
      if (gone(F.watch)) rt.unmark('watch');
      const hc = F.hide.center();
      if ((d < 22 && gone(F.watch)) || Math.hypot(hc.x - 30, hc.z + 56) < 6 || rt.t - F.stepT > 130) { rt.unmark('watch'); this.assault(rt); }
    }
    if (F.step === 2) {
      rt.objProgress('main', `守り ${F.kyo.count + (F.kyoAid && !gone(F.kyoAid) ? F.kyoAid.count : 0)}人`);
      if (F.kyo.count < 5 && !gone(F.kyo)) F.kyo.morale = Math.min(F.kyo.morale, 20);
      if (gone(F.kyo) && rt.t - F.stepT > 18 && (!F.kyoAid || gone(F.kyoAid))) { rt.unmark('kyoAid'); this.cut(rt); }
      else if (rt.t - F.stepT > 130) this.cut(rt, true);
    }
    if (F.step === 3) {
      const qs = [F.fromHon, F.fromKom].filter(Boolean);
      if (!F.deep) rt.objProgress('main', `寄せる兵 ${qs.reduce((s, q) => s + (gone(q) ? 0 : q.count), 0)}人`);
      volleyWatch(rt, 'hon', { guns: () => F.gunH, foes: () => [F.fromHon], r: 22, who: '羽柴秀吉', line: '道の出口まで来た……鉄砲、放て！', sub: '京極丸の口から、羽柴の鉄砲衆' });
      for (const q of qs) if (q.count < 5 && !gone(q)) q.morale = Math.min(q.morale, 20);
      if (F.deep) { depthTick(rt, dt); KIT.backTick(rt); return; }
      if (qs.length === 2 && qs.every(gone)) this.deep(rt);
      else if (rt.t - F.stepT > 170) this.deep(rt, true);
      // 京極丸の輪から出たら、秀吉が呼び戻す
      if (!F.deep && rt.t - F.stepT > 12 && Math.hypot(p.x - KYO.x, p.z - KYO.z) > KYO.r + 9 && !(F.kyoCallT > rt.t)) { F.kyoCallT = rt.t + 14; rt.say('羽柴秀吉', `${nm(rt)}、どこへ行く！　京極丸を空けるな、戻れ！`, 3); }
    }
    if (F.step === 4) {
      const c = F.esc.center();
      const d = Math.hypot(c.x - p.x, c.z - p.z);
      // 供が後ろに離れた時だけ一行は待つ。前に出すぎた時は一言だけ
      const nx = ESCORT[Math.min(F.esc.pathIdx || 0, ESCORT.length - 1)];
      const ahead = (p.x - c.x) * (nx[0] - c.x) + (p.z - c.z) * (nx[1] - c.z) > 0;
      if (d > 16 && !ahead && F.esc.order === 'path' && !F.escGo) { F.esc.order = 'hold'; F.esc.anchor = { x: c.x, z: c.z }; F.escWaitT = rt.t; rt.bark('一行が待っている。そばを離れるな'); }
      else if ((d < 9 || ahead) && F.esc.order === 'hold' && (!F.ochiOn || F.ochiOn === 'done')) F.esc.order = 'path';
      // 待たせたまま来ない時：藤掛が呼び、それでも来なければ一行は組の者と先に進む（待たせきりにしない）
      if (F.esc.order === 'hold' && F.escWaitT != null && (!F.ochiOn || F.ochiOn === 'done')) {
        const w = rt.t - F.escWaitT;
        if (w > 20 && !F.escCall) { F.escCall = true; rt.say('藤掛永勝', `${nm(rt)}殿、こちらでござる！　輿の印の方へお越しくだされ`, 3.5); }
        if (w > 45) { F.escGo = true; F.esc.order = 'path'; rt.say('藤掛永勝', '……先に参りまする。どうか後からお追いくだされ', 3); }
      }
      if (rt.t - F.stepT > 10 && d > 16 && ahead && !(F.aheadT > rt.t)) { F.aheadT = rt.t + 15; rt.say('藤掛永勝', 'お待ちを！　姫君がたの足では、そう速うは参れませぬ', 3); }
      // 塗輿は一行の真ん中について動く
      if (F.escKoshi) { F.escKoshi.position.set(c.x, rt.world.heightAt(c.x, c.z) + 0.3, c.z); const q = F.esc.units.find((u) => u.alive); if (q) F.escKoshi.rotation.y = q.heading || 0; }
      // 京極丸を過ぎるまでの道：浅井の兵が道を開け、本丸の長政が見送る（黙って歩くだけにしない）
      if (!F.escSay && (F.esc.pathIdx || 0) >= 2) {
        F.escSay = true;
        rt.say('浅井の侍', '……お市様じゃ。道を開けよ。誰も手を出すな', 3);
        rt.after(4, () => { if (!F.ending) rt.say('足軽', '本丸の塀の上に、人影が……長政殿が見送っておられる', 3.5); });
        rt.after(9, () => { if (!F.ending) { sfx('kane', 0.4); rt.say('藤掛永勝', '振り返りますな、姫君。……前だけを', 3); } });
      }
      // 道の半ばで、落ち武者の小勢が一度寄ってくる
      if (!F.ochiOn && (F.esc.pathIdx || 0) >= 4) {
        F.ochiOn = true;
        F.esc.order = 'hold'; F.esc.anchor = { x: c.x, z: c.z };
        F.ochi = enemyGroup(rt, { faction: 'saito', name: '落ち武者', anchor: { x: 40, z: -34 }, facing: -Math.PI / 2, order: 'attack', seekRange: 40, aggro: 12, width: 8, morale: 60, fleeDir: { x: 0, z: 1 }, dmgMult: 0.55 }, dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 10 }], AZAI));
        rt.say('足軽', '林から落ち武者じゃ！　一行を守れ！', 3);
        // 判断③：一行を止めて追い払うか、先へ急がせて後ろを守るか
        rt.choose('林から落ち武者が出た。一行をどうする？', [
          { label: '一行を止め、落ち武者を追い払ってから進む', note: '一行は安心。陣に着くのは遅れる' },
          { label: '一行を先へ急がせ、組の者と後ろを守る', note: '早く陣に着ける。落ち武者を一人で引き受ける' },
        ], (i) => {
          if (i !== 1) return;
          F.ochiOn = 'done'; F.ochiRear = true; F.esc.order = 'path';
          rt.say('藤掛永勝', '承知！　お市様、急ぎまするぞ', 3);
        }, 12);
        rt.marker('ochi', centerOf(F.ochi), () => `落ち武者・${moraleWord(F.ochi.morale)}`, { red: true, group: F.ochi });
      }
      if (F.ochiRear && F.ochi && gone(F.ochi)) { F.ochiRear = false; rt.unmark('ochi'); rt.award((t) => t.side.push('一行を止めずに落ち武者を退けた'), '一行を止めずに落ち武者を退けた'); }
      if (F.ochi && gone(F.ochi) && F.ochiOn !== 'done') { F.ochiOn = 'done'; rt.unmark('ochi'); F.esc.order = 'path'; rt.say('藤掛永勝', 'かたじけない。……参りましょう', 2.5); }
      rt.objProgress('main', `陣まで ${Math.round(Math.hypot(c.x - VALLEY.x, c.z - VALLEY.z))}m`);
      if (rt.t - F.stepT > 200) this.win(rt);
    }
  },

  onKill(rt, v) {
    const F = rt.flags;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
  },
  onRout(rt, g) {
    if (g.team !== 1) return;
    rt.say('足軽', `${g.name}が退いていく！`, 2.5);
  },
};

// 両軍の総勢（織田 三万ほど、浅井 五千ほど。数には諸説ある）
odani.force = (rt) => {
  const F = rt.flags;
  return { a: Math.round(30000 - (F.ak || 0) * 30), a0: 30000, b: Math.max(0, 5000 - (F.ek || 0) * 40), b0: 5000 };
};
odani.sides = { a: { name: '織田軍', mon: 'oda' }, b: { name: '浅井軍', mon: 'azai' } };
odani.rts = true;
// 史実でこの戦にいた名のある武将（battle.js の placeFamous が、その家の隊に加える。敵は名乗り、討てば手柄）
odani.famous = [
  { name: '竹中重治', team: 0, g: /鉄砲/, loose: 1, line: '竹中半兵衛じゃ。京極丸を取れば、本丸と小丸は切れる' },
  { name: '浅井久政', g: /京極丸|本丸/, loose: 1, line: '浅井下野守久政なり！　この小谷、易々とは渡さぬ！' },
  { name: '赤尾清綱', g: /本丸|京極丸/, loose: 1, line: '浅井の赤尾清綱なり！　老いたりとも槍は衰えぬ！' },
];
odani.date = (rt) => `天正元年八月　秋・${rt.flags.step >= 4 ? '朝' : '夜'}`;
odani.canSkip = (rt) => {
  const F = rt.flags;
  if (rt.phase === 'brief' && rt.t > 3) return '登りの下知まで待つ';
  // 敵のいない歩きの段：見張りを討った後の谷の登り、落ち武者の後のお市の供
  if (rt.phase === 'climb' && F.watchOn && gone(F.watch)) return '京極丸の手前まで登る';
  if (rt.phase === 'escort' && F.ochiOn === 'done') return '谷の陣まで供をする';
  return '';
};
odani.skip = (rt) => {
  const F = rt.flags;
  const put = (units, x, z) => { for (const u of units) if (u.alive) { u.pos.x = x + (Math.random() - 0.5) * 4; u.pos.z = z + (Math.random() - 0.5) * 4; } };
  if (rt.phase === 'climb') { put([rt.player.u, ...rt.squad, ...F.hide.units], 32, -56); return; }
  if (rt.phase === 'escort') { put([rt.player.u, ...rt.squad, ...F.esc.units], VALLEY.x - 6, VALLEY.z); F.esc.pathIdx = ESCORT.length - 1; return; }
  for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2);
};
odani.history = '天正元年（1573）八月、織田信長は刀根坂で朝倉義景を破り、一乗谷を焼いて朝倉家を滅ぼした。すぐに兵を返して北近江の小谷城を囲む。小谷城は小谷山の尾根に曲輪を連ねた山城で、南の本丸に浅井長政、北の小丸に父の久政がいた。羽柴秀吉は、その間の京極丸へ攻め上って本丸と小丸を切り離し、小丸の久政は自害した。長政は、妻のお市の方（信長の妹）と三人の娘（のちの茶々・初・江）を城から出して織田方へ返し、九月一日に本丸で自害したと伝わる（日付には異説がある）。浅井の旧領の多くは秀吉に与えられ、秀吉はのちに今浜を長浜と改めて城を築いた。攻め上った道や、一行を送った者の名には諸説がある。兵の数にも諸説ある。';
// 信長で遊ぶ時：居場所の目安（bot の目が始まりの位置を確かめる） と立つ所
odani.lordAt = { x: 106, z: -26, r: 14, why: '谷の織田の陣（信長は虎御前山に本陣を置き、小谷を囲んだ）' };
odani.lordSpawn = { x: 100, z: -38, heading: -Math.PI / 2 };   // 旗本が陣幕に重ならない所

// 素直な遊び手：秀吉について谷を登り、京極丸で戦い、両方からの寄せを受け、お市の方の一行のそばを歩く
odani.botBrain = (b, inp, { goTo }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyE');
  if (!u.alive || F.ending) return;
  if (u.hp < u.maxHp * 0.5) b.botRest = true;
  if (b.botRest && u.hp > u.maxHp * 0.85) b.botRest = false;
  if (F.deep && F.step === 3) { depthBot(b, inp, goTo); return; }
  if (b.botRest && F.step < 4) { inp.guardHold = false; const c = F.hide.center(); goTo(p, inp, c.x + 4, c.z, 2); return; }
  const e = b.army.nearestEnemy(u, 12, (o) => !o.fleeing);
  if (e && F.step < 4) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d > 2.6) inp.k.add('KeyW');
    if (d < 3.2 && Math.random() < 0.5) inp.leftPressed = true;
    inp.guardHold = (b.army.threats || []).length > 0 && Math.random() < 0.85;
    return;
  }
  inp.guardHold = false;
  if (F.step <= 1) {
    b.botWp = b.botWp || 1;
    const w = CLIMB[Math.min(b.botWp, CLIMB.length - 1)];
    if (Math.hypot(w[0] - u.pos.x, w[1] - u.pos.z) < 3 && b.botWp < CLIMB.length - 1) b.botWp++;
    if (F.step === 0) { const a = F.hideU.pos; goTo(p, inp, a.x + 3, a.z + 3, 3); return; }
    goTo(p, inp, w[0], w[1], 2);
    return;
  }
  if (F.step === 2) { const t = gone(F.kyo) ? KYO : F.kyo.center(); if (u.pos.x > KYO.x + KYO.r + 1 && Math.abs(u.pos.z - KYO.z) > 3) { goTo(p, inp, KYO.x + KYO.r + 3, KYO.z, 1.5); return; } goTo(p, inp, t.x, t.z, 2); return; }
  if (F.step === 3) {
    const q = [F.fromHon, F.fromKom].find((x) => x && !gone(x));
    if (q) { const c = q.center(); goTo(p, inp, c.x, Math.max(-70, Math.min(-40, c.z)), 2); return; }
    goTo(p, inp, 0, -52, 2);
    return;
  }
  if (F.step === 4 && F.esc) { const c = F.esc.center(); goTo(p, inp, c.x + 2, c.z + 2, 3); }
};

// ---- 京極丸を取った後の段 ----
const uS = (n) => ({ type: 'samurai', n }), uA = (n) => ({ type: 'ashigaru', n }), uG = (n) => ({ type: 'gun', n }), uB = (n) => ({ type: 'bow', n });
function odSteps() {
  return [
    rest({ dur: 10, heal: 0.3, say: [['羽柴秀吉', '一度は退けた。……じゃが、見よ。本丸にも小丸にも、まだ篝火が増えておる'], ['足軽', '小丸の方で、鬨の声が……'], ['羽柴秀吉', '小丸の久政殿を追い詰めれば、本丸の長政殿は動けぬ。じゃが、京極丸を空ければ取り返される']] }),
    pick({ title: '小丸の兵がまた集まっている。どうする？',
      options: [{ label: '北の小丸へ攻め上がり、寄せる前に叩く', note: '小丸が早く落ちる。京極丸は蜂須賀の手に任せる' }, { label: '京極丸に構え、両方からの寄せを受ける', note: '京極丸は固い。北と南から、何度も寄せが来る' }],
      on: (rt, m, i) => { m.oKom = i === 0; rt.say('羽柴秀吉', i === 0 ? 'よし、小丸へ登れ！　久政殿の旗を倒せ！' : '構えよ！　京極丸を一歩も渡すな！', 3); } }),
    fight({ skip: (rt, m) => !m.oKom, at: { x: 0, z: -84 }, title: '小丸へ', sub: '北の曲輪へ攻め上がる', obj: '小丸の前の浅井勢を崩せ',
      foes: () => [{ name: '小丸の守り', from: { x: 0, z: -104 }, list: [uS(3), uA(12), uB(3)], mass: 180, noRout: 25 }],
      later: [{ t: 35, title: '横から', sub: '小丸の西の腰曲輪から', say: ['足軽', '西の腰曲輪から、また出てくる！'], foes: () => [{ name: '腰曲輪の兵', from: { x: -26, z: -96 }, list: [uS(2), uA(10), uG(2)], mass: 140 }] },
        { t: 70, say: ['羽柴秀吉', '小丸の最後の守りじゃ！　押し切れ！'], foes: () => [{ name: '久政の旗本', from: { x: 0, z: -108 }, list: [uS(3), uA(10)], mass: 120 }] }],
      max: 150, reward: (t) => { t.special = { label: '小丸へ攻め上がり、守りを崩した', pts: 20 }; }, rewardLabel: '小丸の守りを崩した' }),
    hold({ skip: (rt, m) => m.oKom, at: { x: 0, z: -55 }, dur: 95, r: 13, title: '南北からの寄せ', sub: '本丸と小丸が、代わる代わる寄せてくる', label: '京極丸', obj: '京極丸を守れ：北と南から代わる代わる寄せてくる',
      waves: [
        { t: 4, say: ['足軽', '小丸から来た！　北じゃ！'], foes: () => [{ name: '小丸の兵', from: { x: 0, z: -100 }, list: [uS(2), uA(12), uG(2)], mass: 180, noRout: 20 }] },
        { t: 34, say: ['足軽', '南の本丸からもじゃ！'], foes: () => [{ name: '本丸の兵', from: { x: 0, z: -12 }, list: [uS(2), uA(12), uB(2)], mass: 180 }] },
        { t: 64, say: ['羽柴秀吉', '北の腰曲輪からも登ってくる！　背を合わせよ！'], foes: () => [{ name: '腰曲輪の兵', from: { x: -24, z: -90 }, list: [uS(2), uA(10)], mass: 140 }] },
      ],
      reward: '京極丸で南北の寄せを受け止めた', lost: ['羽柴秀吉', '押された……じゃが、京極丸はまだ我らのものじゃ！'] }),
    rest({ dur: 8, bark: '組を集め直せ', say: [['足軽', '北の山王丸から、松明が下りてくる！'], ['羽柴秀吉', '山王丸の兵が小丸を救いに来たか。京極丸の北で止めよ']] }),
    hold({ at: { x: 0, z: -72 }, dur: 90, r: 13, title: '山王丸の兵', sub: '北の尾根の出丸から、浅井勢が下りてくる', label: '京極丸の北', obj: '京極丸の北で、山王丸から下りる浅井勢を止めよ',
      waves: [
        { t: 4, say: ['足軽', '来たぞ、山王丸の兵じゃ！'], foes: () => [{ name: '山王丸の兵', from: { x: -6, z: -110 }, list: [uS(3), uA(13), uG(2)], mass: 200, noRout: 20 }] },
        { t: 36, say: ['足軽', '西の谷からも登ってくる！'], foes: () => [{ name: '西の谷の浅井勢', from: { x: -34, z: -80 }, list: [uS(2), uA(10), uB(2)], mass: 140 }] },
        { t: 62, say: ['羽柴秀吉', '山王丸の二の手じゃ！　槍を揃えよ！'], foes: () => [{ name: '山王丸の二の手', from: { x: 4, z: -112 }, list: [uS(2), uA(12)], mass: 160 }] },
      ],
      reward: '山王丸から下りる浅井勢を止めた', lost: ['羽柴秀吉', '押されたが……小丸へは通しておらぬ'] }),
    rest({ dur: 8, bark: '組を集め直し、南の本丸の方を向け', say: [['伝令', '本丸から、浅井の精兵が京極丸を取り返しに出てまいりまする！'], ['羽柴秀吉', '長政殿の旗本じゃ。本丸からの道は細い。……さて、どう受ける']] }),
    pick({ title: '本丸から浅井の精兵が来る。どう受ける？',
      options: [{ label: '細い道の出口に鉄砲を並べ、出てくる所を撃つ', note: '数を削れる。撃ち漏らしは京極丸で槍で受ける' }, { label: '道の中へ打って出て、細い所で突き崩す', note: '大手柄になる。狭い道で、前の敵と押し合う' }],
      on: (rt, m, i) => {
        m.oOut = i === 1;
        const F = rt.flags;
        if (i === 0 && F.gunH && F.gunH.count) {
          F.gunH.anchor = { x: 2, z: -40 }; F.gunH.formation = 'line';
          volleyScene(rt, { guns: () => [F.gunH], at: { x: 0, z: -32 }, r: 26, who: '羽柴秀吉', shots: 3, wait: '道の出口まで引きつけよ……', fire: '出てきた！　放てぇっ！', hit: 18 });
        } else rt.say('羽柴秀吉', 'よし、道へ出よ！　細い所なら数は関わりない！', 3);
      } }),
    hold({ skip: (rt, m) => m.oOut, at: { x: 0, z: -48 }, dur: 100, r: 13, title: '本丸の精兵', sub: '浅井長政の旗本が、京極丸を取り返しに来る', label: '京極丸の南の口', obj: '京極丸の南の口で、本丸の精兵を受けよ',
      waves: [
        { t: 4, say: ['浅井の侍', '京極丸を取り返せ！　殿の御前ぞ！'], foes: () => [{ name: '浅井の旗本', from: { x: 0, z: -12 }, list: [uS(4), uA(12)], mass: 220, noRout: 25 }] },
        { t: 40, say: ['足軽', '本丸の西の崖を回ってくる！'], foes: () => [{ name: '崖を回る浅井勢', from: { x: -26, z: -26 }, list: [uS(2), uA(10), uG(2)], mass: 140 }] },
        { t: 66, say: ['羽柴秀吉', '最後の寄せじゃ！　これを凌げ！'], foes: () => [{ name: '本丸の最後の寄せ', from: { x: 0, z: -10 }, list: [uS(3), uA(12)], mass: 200 }] },
      ],
      reward: '京極丸で本丸の精兵を受け止めた', lost: ['羽柴秀吉', '押し込まれたか……じゃが、まだ持っておる！'] }),
    fight({ skip: (rt, m) => !m.oOut, at: { x: 0, z: -30 }, title: '細い道の戦い', sub: '本丸と京極丸をつなぐ道で、浅井の旗本とぶつかる', obj: '細い道で、浅井の旗本を突き崩せ',
      foes: () => [{ name: '浅井の旗本', from: { x: 0, z: -10 }, list: [uS(4), uA(12)], mass: 220, noRout: 25 }],
      later: [{ t: 45, title: '新手', sub: '本丸から、また押し出してくる', say: ['足軽', '後ろからまだ来る！'], foes: () => [{ name: '本丸の新手', from: { x: 0, z: -8 }, list: [uS(2), uA(12), uG(2)], mass: 180 }] }],
      max: 150, reward: (t) => { t.special = { label: '細い道で浅井の旗本を突き崩した', pts: 20 }; }, rewardLabel: '細い道で浅井の旗本を突き崩した' }),
    rest({ dur: 8, heal: 0.25, say: [['足軽', '……小丸の方から煙が上がっておる'], ['羽柴秀吉', '久政殿が……。京極丸が持ったおかげで、本丸は小丸を救えなんだ']] }),
  ];
}

export { odani };
