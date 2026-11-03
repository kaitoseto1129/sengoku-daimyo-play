// ======================================================================
// 豊臣編　山中城の戦い（天正十八年三月二十九日の朝）。docs/chapter2_toyotomi.md の 9 を正とする
// 豊臣秀次を大将におよそ七万が、松田康長らおよそ四千の守る北条の山中城（箱根の西の坂）を攻める。
// 一柳直末が鉄砲に当たって討たれるほどの激戦だったが、城は半日で落ちた。岱崎出丸の間宮康俊も討ち死に。
// 主人公は城主として自分の手勢を率い、秀次の下で岱崎出丸の側から寄る。
// ①岱崎出丸の鉄砲の中を寄る ②障子堀の畝の上を渡る ③三の丸の虎口（枡形）を破る ④二の丸を抜け、本丸の松田康長の隊を崩す
// 地形：国土地理院の標高（asset_dem_yamanaka.js・tools/dem.mjs の yamanaka）。高さは 0.6 倍に詰め、曲輪は平らに削る。
// 座標：x が東、z が南（+z が三島の側の下り坂）。寄せ手は南から北（−z）へ坂を上る。縄張りは史跡の形を手本にした推定。
// ======================================================================
import * as THREE from 'three';
import DEM from './asset_dem_yamanaka.js';
import { demSample } from './dem.js';
import { nobori, jinmaku, kagaribi, tawara } from './props.js';
import { flagTexture } from './textures.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { enemyGroup, allyGroup, nm, centerOf, unitPos, wallLine } from './bhelp.js';
import { dress, gone, more } from './b_inabayama.js';
import { distToPolyline } from './world.js';
import { bankTex } from './nature.js';
import { siegePlan, siegeHeight, buildSiege } from './siege_kit.js';
import { withGuard } from './toyo_bot.js';
import { toyoClash } from './toyo_mob.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// 東海道（城の中を通る土の道）。三島の側（南）から本丸の脇へ
const ROAD = [[34, 340], [24, 270], [14, 200], [10, 140], [10, 64], [10, 30], [14, -40], [24, -100], [30, -170]];
const START = { x: 22, z: 220 };            // 地面の格子（groundHalf 240）と動ける所（moveLim 236）の内。前は 292 で、兵がみな z=176 の端に寄せられていた
// 曲輪（中心・半径・削った面の高さの足し）。切岸の縁は 10m で地形へ戻す
const KURUWA = {
  dai: { x: -46, z: 176, r: 20, up: 1.6 },   // 岱崎出丸（間宮康俊）
  san: { x: 10, z: 14, r: 34, up: 1.2 },     // 三の丸
  ni: { x: 16, z: -46, r: 24, up: 1.6 },     // 二の丸
  hon: { x: 25, z: -106, r: 22, up: 2.2 },   // 本丸（松田康長）
};
// 障子堀：出丸と三の丸の間を東西に切る深い堀。底を格子の畝で仕切る（縦の畝の上だけを一列で渡れる）
const SHOJI = { x0: -40, x1: 60, z0: 90, z1: 110, depth: 4.6, cell: 6, rib: 0.7 };
const CROSS_X = 10;                          // 渡る筋（縦の畝の一つ。道の筋）
SHOJI.cx = CROSS_X;
// 岱崎出丸の東の柵の前の障子堀（史実：出丸の前も障子堀・畝堀で囲まれていた。始めの25秒に出丸へ寄る所の目の前に見える）。
//   南北に長い堀を二つ。間（z 170〜182）は掘らずに土橋として残し、寄せ手はそこを通って柵へ寄る
const SHOJI_DAI = [
  { x0: -27, x1: -12, z0: 140, z1: 169, depth: 3.4, cell: 5, rib: 0.6, cx: 140, alongZ: true },
  { x0: -27, x1: -12, z0: 183, z1: 210, depth: 3.4, cell: 5, rib: 0.6, cx: 183, alongZ: true },
];
// 三の丸の大手：枡形虎口・横矢・畝堀・切岸・逆茂木（城攻めの共通部品）
const SP = siegePlan({ x: 10, z: 48, rot: 0, W: 26, koguchi: 'masu', turn: 1,
  yokoya: { at: 14, w: 6, d: 4 }, moat: { w: 8, depth: 3.4, une: 4 }, kirigishi: 1.4,
  umadashi: false, sakamogi: { at: 5 }, shiyori: false });
const SP_H = siegeHeight(SP);
const HOJO = { flag: 'hojo', armor: 0x2e2a26, hatColor: 0x1e1b18, lace: 0x5a4632, cloth: 0x6a5a40 };
const TOYO = { flag: 'toyotomi' };

const NAT = (x, z) => (demSample(DEM, x, z) - 100) * 0.6;
function kuruwaH(x, z, h) {
  for (const k of Object.values(KURUWA)) {
    const d = Math.hypot(x - k.x, z - k.z);
    if (d > k.r + 10) continue;
    const top = NAT(k.x, k.z) + k.up;
    h += (top - h) * (1 - sstep(k.r, k.r + 10, d));
  }
  return h;
}
function shojiH(x, z, S = SHOJI) {
  if (x < S.x0 - 3 || x > S.x1 + 3 || z < S.z0 - 3 || z > S.z1 + 3) return 0;
  const ex = Math.min(x - S.x0, S.x1 - x), ez = Math.min(z - S.z0, S.z1 - z);
  const edge = sstep(-3, 1.2, Math.min(ex, ez));           // 法（のり）は急
  let dig = S.depth * edge;
  // 縦の畝（南北の筋）と横の畝（東西の中ほど）：上は堀の縁から 0.8m 下
  //   alongZ の堀（南北に長い）は、畝の向きを入れ替える
  const q = (((S.alongZ ? z : x) - S.cx) % S.cell + S.cell) % S.cell, dv = Math.min(q, S.cell - q);
  const dh = S.alongZ ? Math.abs(x - (S.x0 + S.x1) / 2) : Math.abs(z - (S.z0 + S.z1) / 2);
  const rib = Math.max(1 - sstep(S.rib, S.rib + 0.6, dv), 1 - sstep(S.rib, S.rib + 0.6, dh));
  dig -= rib * (S.depth - 0.8) * edge;
  return -Math.max(0, dig);
}
const inShoji = (x, z, pad = 0, S = SHOJI) => x > S.x0 - pad && x < S.x1 + pad && z > S.z0 - pad && z < S.z1 + pad;
function height(x, z) {
  return kuruwaH(x, z, NAT(x, z)) + shojiH(x, z) + shojiH(x, z, SHOJI_DAI[0]) + shojiH(x, z, SHOJI_DAI[1]) + SP_H(x, z);
}
// 障子堀の畝の形（地面の格子は 3.3m で細い畝を描けないので、畝の土の背を形で足す。見た目だけ・一つの形にまとめて一回で描く）
//   畝ごとに、上が細く裾の広い土の背（台形の断面）を、堀の縁の高さに沿って続ける。色は関東ローム（赤みの土）
function shojiRibs(rt) {
  const W = rt.world, pos = [], col = [], uvs = [], idx = [];
  const rim = (x, z) => kuruwaH(x, z, NAT(x, z)) + SP_H(x, z);
  // 本物の障子堀（山中城跡の発掘・復元：関東ロームを削り残した畝）に寄せる：畝の背は丸く崩れ、法は踏み跡と雨の筋で凸凹。
  //   断面は七つの点（裾・法の下・法の上・肩・背・肩・法…）で、点ごとに少し揺らす。土の絵（bankTex）を張り、色は赤い関東ローム、
  //   底ほど湿って暗く、背は乾いて明るい（平らな茶色の板に見せない）
  const PROF = [[-1, 0], [-0.62, 0.34], [-0.34, 0.74], [-0.12, 0.97], [0.12, 0.97], [0.34, 0.74], [0.62, 0.34], [1, 0]];
  const hz = (a, b) => { const v = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return v - Math.floor(v); };
  const rib = (ax, az, bx, bz, wTop, wBot, tone) => {
    const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(L / 1.1));
    const nx = -(bz - az) / L, nz = (bx - ax) / L, NP = PROF.length;
    const base = pos.length / 3;
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      const top = rim(x, z) - 0.8 + (hz(i, tone) - 0.5) * 0.35, bot = Math.min(W.heightAt(x, z), top - 0.5) - 0.7;
      let v = 0, px = 0, py = 0;
      for (let k = 0; k < NP; k++) {
        const [f, hgt] = PROF[k], edge = k === 0 || k === NP - 1;
        const half = Math.abs(f) <= 0.12 ? wTop * 0.6 : wTop + (wBot - wTop) * (1 - hgt);
        const jit = edge ? 0 : (hz(i * 7 + k, tone * 3) - 0.5) * 0.28;
        const off = Math.sign(f) * half + jit * Math.sign(f || 1), y = bot + (top - bot) * hgt + (edge ? 0 : (hz(i + k * 5, tone) - 0.5) * 0.18);
        if (k) v += Math.hypot(off - px, y - py) / 3; px = off; py = y;
        pos.push(x + nx * off, y, z + nz * off); uvs.push(L * t / 3 + tone * 0.37, v);
        // 色：底は湿った濃い赤土、背は乾いて白っぽく、ところどころ枯れ草の黄
        const wet = 1 - hgt, r1 = hz(i * 3 + k, tone + 1), dry = hgt > 0.9 ? 0.12 : 0;
        let c = [1.72 - wet * 0.42 + dry, 1.5 - wet * 0.38 + dry * 0.9, 1.22 - wet * 0.3 + dry * 0.7];   // 絵（bankTex）が暗い赤土なので、堀の法の地面の色に合うまで持ち上げる
        if (hgt > 0.3 && r1 > 0.78) c = [c[0] * 0.92, c[1] * 1.0, c[2] * 0.72];
        const k2 = 0.9 + r1 * 0.18; col.push(c[0] * k2, c[1] * k2, c[2] * k2);
      }
      if (i < n) {
        const a = base + i * NP, b = a + NP;
        for (let p = 0; p < NP - 1; p++) idx.push(a + p, a + p + 1, b + p, a + p + 1, b + p + 1, b + p);
      }
    }
  };
  let tone = 0;
  for (const S of [SHOJI, ...SHOJI_DAI]) {
    const [u0, u1, v0, v1] = S.alongZ ? [S.z0, S.z1, S.x0, S.x1] : [S.x0, S.x1, S.z0, S.z1];
    const P = (u, v) => (S.alongZ ? [v, u] : [u, v]);
    const wT = S.rib * 0.9, wB = S.rib + 1.5;
    for (let u = S.cx + Math.ceil((u0 + 0.8 - S.cx) / S.cell) * S.cell; u < u1 - 0.8; u += S.cell) rib(...P(u, v0 - 0.6), ...P(u, v1 + 0.6), wT, wB, tone++);
    const vm = (v0 + v1) / 2;
    rib(...P(u0 - 0.6, vm), ...P(u1 + 0.6, vm), wT, wB, tone++);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, map: bankTex(), side: THREE.DoubleSide }));
  m.receiveShadow = true;
  rt.scene.add(m);
  return m;
}
const nearKuruwa = (x, z, pad) => Object.values(KURUWA).some((k) => Math.hypot(x - k.x, z - k.z) < k.r + pad);

const t09_yamanaka = {
  spawn: { x: START.x, z: START.z, heading: Math.PI },
  world: {
    seed: 15900,
    // 格子は 480m を 144 に割る（3.33m。障子堀の渡る畝 x=10 が格子の線に乗る）。出丸の前から始められるように広げた
    groundHalf: 240,
    moveLim: 236,
    time: 'day',
    mist: true,
    muddy: 0.25,
    paths: [ROAD],
    height,
    tint(x, z, h, c) {
      // 堀の底と法は関東ローム（赤みの土）、曲輪は踏まれた草地、道は土
      if (inShoji(x, z, 1) || SHOJI_DAI.some((S) => inShoji(x, z, 1, S)) || (Math.abs(x - SP.x) < SP.W + 6 && z > SP.z + SP.mIn - 1 && z < SP.z + SP.mOut + 1)) c.lerp({ r: 0.46, g: 0.3, b: 0.2 }, 0.75);
      else if (distToPolyline(x, z, ROAD) < 4) c.lerp({ r: 0.48, g: 0.4, b: 0.3 }, 0.45);
      else if (nearKuruwa(x, z, 2)) c.setRGB(c.r * 0.92, c.g * 0.97, c.b * 0.86);
      else c.setRGB(c.r * 0.8, c.g * 0.86, c.b * 0.78);
    },
    clear: (x, z) => distToPolyline(x, z, ROAD) < 10 || nearKuruwa(x, z, 8) || inShoji(x, z, 8) || SHOJI_DAI.some((S) => inShoji(x, z, 8, S)) || (Math.abs(x - SP.x) < SP.W + 10 && z > SP.z - 8 && z < SP.z + SP.mOut + 12) || Math.hypot(x - START.x, z - START.z) < 30,
    trees: 900,
    tufts: 2600,
    treeDensity: (x, z) => (distToPolyline(x, z, ROAD) < 18 ? 0.15 : 1),
    groves: [{ x: -110, z: 60, r: 16, n: 18 }, { x: 110, z: -20, r: 16, n: 18 }, { x: -90, z: -120, r: 14, n: 14 }],
    fleeOut: (x, z, team) => team === 1 && z < -175,
  },

  setup(rt) {
    const W = rt.world, F = rt.flags;
    F.step = 0; F.ek = 0; F.ak = 0;
    // ---- 三の丸の大手（枡形・横矢・畝堀・狭間からの鉄砲） ----
    F.K = buildSiege(rt, SP, { team: 1, wall: 'saku', wallHp: 520, gateHp: 460, masuHp: 600, fire: { hurt: 0.2, near: 90, close: 18, base: 0.8, peak: 4 } });
    shojiRibs(rt);
    // ---- 岱崎出丸の柵（南と東へ向く。狭間は無いが、鉄砲の隊が内から撃つ） ----
    const D = KURUWA.dai;
    wallLine(rt, [[D.x - 16, D.z + 14], [D.x + 4, D.z + 18], [D.x + 18, D.z + 6], [D.x + 18, D.z - 10]], { team: 1, hp: 300, name: '出丸の柵', segLen: 8 });
    // ---- 旗と陣 ----
    for (const [x, z] of [[D.x - 6, D.z - 8], [D.x + 10, D.z - 4]]) rt.scene.add(nobori(W, x, z, 'hojo', 5));
    for (const [x, z] of [[SP.x - 20, SP.z - 8], [SP.x + 20, SP.z - 8], [KURUWA.ni.x - 10, KURUWA.ni.z], [KURUWA.hon.x - 8, KURUWA.hon.z + 6], [KURUWA.hon.x + 10, KURUWA.hon.z - 6]]) rt.scene.add(nobori(W, x, z, 'hojo', 6));
    rt.scene.add(jinmaku(W, KURUWA.hon.x, KURUWA.hon.z - 10, 14, 9, 5.5, { mon: 'hojo' }));
    rt.scene.add(tawara(W, KURUWA.hon.x - 9, KURUWA.hon.z - 4, 0.3, 3));
    for (const [x, z] of [[SP.x - 4, SP.z - 6], [SP.x + 5, SP.z - 10]]) { rt.scene.add(kagaribi(W, x, z)); W.addFire(x, z, { h: 1.3, size: 0.6 }); }
    for (const [x, z] of [[START.x - 14, START.z + 10], [START.x + 16, START.z + 6]]) rt.scene.add(nobori(W, x, z, 'toyotomi', 6));
    // ---- 豊臣方：一柳直末の隊・中村一氏の隊（本物の兵）と、後ろに続く秀次の大軍（軽い作り） ----
    F.ichi = allyGroup(rt, { name: '一柳直末の隊', anchor: { x: START.x - 10, z: START.z - 6 }, facing: Math.PI, width: 12, aggro: 10, noRout: true, formation: 'yari' },
      dress([{ type: 'busho', n: 1, o: { name: '一柳直末', invuln: true, hat: 'kabuto_m', haori: 0x3a2e24 } }, { type: 'samurai', n: 3 }, { type: 'ashigaru', n: 18 }, { type: 'gun', n: 6 }], TOYO));
    F.naka = allyGroup(rt, { name: '中村一氏の隊', anchor: { x: START.x + 14, z: START.z - 2 }, facing: Math.PI, width: 12, aggro: 10, noRout: true },
      dress([{ type: 'samurai', n: 1, o: { name: '中村一氏', invuln: true, hat: 'kabuto_w', haori: 0x2a2a3a } }, { type: 'samurai', n: 1, o: { name: '渡辺勘兵衛', invuln: true, hat: 'kabuto_m' } }, { type: 'samurai', n: 1 }, { type: 'ashigaru', n: 16 }], TOYO));
    // 東の尾根から寄せる堀秀政の隊（城をいくつもの方から攻める）
    F.hori = allyGroup(rt, { name: '堀秀政の隊', anchor: { x: START.x + 46, z: START.z - 30 }, facing: Math.PI, width: 12, aggro: 10, noRout: true },
      dress([{ type: 'busho', n: 1, o: { name: '堀秀政', invuln: true, hat: 'kabuto_w', haori: 0x2a3a2a } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 12 }, { type: 'gun', n: 3 }], TOYO));
    F.toyo = [F.ichi, F.naka, F.hori];
    // 大将の豊臣秀次は街道の後ろの本陣から下知する（動かない）
    F.hide = allyGroup(rt, { name: '秀次の本陣', anchor: { x: START.x + 18, z: START.z + 14 }, facing: Math.PI, width: 5, aggro: 0, fixed: true, noAI: true, noRout: true, order: 'hold' },
      dress([{ type: 'busho', n: 1, o: { name: '豊臣秀次', invuln: true, hat: 'kabuto_w', horse: false } }, { type: 'samurai', n: 4 }], TOYO));
    rt.scene.add(jinmaku(W, START.x + 20, START.z + 20, 14, 9, 3, { mon: 'toyotomi' }));
    for (const g of F.toyo) { g.defMult = 1.2; g.dmgMult = 0.85; }
    const n = RANKS[rt.G.rank]?.squad;
    if (n) rt.makeSquad({ x: START.x + 2, z: START.z + 8 }, Math.PI, [{ kind: 'spear', n }]);
    const DA = (x, z, w, d, count, facing, armor, flag, seed, team = 0) => W.addDistantArmy({ x, z, w, d, count, facing, armor, team, flagTex: flagTexture(flag), mon: flag, seed });
    F.host = [DA(16, 340, 70, 26, 420, Math.PI, 0x2b2723, 'toyotomi', 15901), DA(-60, 320, 40, 20, 220, Math.PI * 0.9, 0x2b2723, 'toyotomi', 15902)];
    for (const g of F.host) if (g && g.army) g.army.noWake = true;
    // 東と西の尾根にも寄せ手の旗（四方から攻める）
    F.host.push(DA(120, 150, 40, 20, 260, Math.PI * 1.25, 0x2b2723, 'toyotomi', 15904), DA(-130, 150, 36, 18, 220, Math.PI * 0.75, 0x2b2723, 'toyotomi', 15905));
    for (const g of F.host) if (g && g.army) g.army.noWake = true;
    const far = DA(26, -150, 30, 12, 140, 0, 0x2e2a26, 'hojo', 15903, 1);
    if (far && far.army) far.army.noWake = true;
    // 岱崎出丸の東の堀の外で、一柳の手が柵へ寄せ、出丸から打って出た北条の兵と斬り合う（始めの25秒のカメラの正面 36m）
    F.near = toyoClash(rt, { x: -10, z: 172, facing: -Math.PI / 2 - 0.5, w: 30, seed: 15906,
      A: { flag: 'toyotomi', armor: 0x2b2723, count: 130 }, B: { flag: 'hojo', armor: HOJO.armor, count: 110, guns: true } });

    W.setTime('day');
    rt.setPhase('brief');
    rt.obj('main', '秀次の下知を待て', 'main');
    // 戦の前の会話
    rt.say('豊臣秀次', '半日で落とせ。小田原の前の、ただの坂の城じゃ', 4.5);
    rt.after(4.8, () => rt.say(nm(rt), '堀の底が、田の畦のように仕切られております', 4));
    rt.after(9, () => rt.say('一柳直末', '北条の鉄砲は多いぞ。出丸の前で足を止めるな', 4));
    rt.after(13.5, () => rt.say('堀秀政', '我らは東の尾根から三の丸の横へ回る。挟んで落とすぞ', 3.5));
    rt.marker('ichi', unitPos(F.ichi.units[0]), '一柳直末', {});
    rt.after(17.5, () => this.dai(rt));
  },

  // ① 岱崎出丸の鉄砲の中を寄る
  dai(rt) {
    const F = rt.flags;
    if (F.step >= 1) return;
    F.step = 1; F.stepT = rt.t;
    rt.setPhase('dai'); rt.unmark('ichi');
    sfx('horagai', 0.8);
    rt.obj('main', '岱崎出丸の鉄砲の中を寄れ', 'main');
    const D = KURUWA.dai;
    F.dai = enemyGroup(rt, { faction: 'hojo', name: '間宮康俊の隊', anchor: { x: D.x + 6, z: D.z }, facing: 0.6, order: 'hold', aggro: 20, width: 12, morale: 95, fleeDir: { x: 0, z: -1 }, dmgMult: 0.6 },
      dress([{ type: 'busho', n: 1, o: { name: '間宮康俊', hat: 'kabuto_m', haori: 0x4a3a28 } }, { type: 'gun', n: 7 }, { type: 'ashigaru', n: 8 + more(rt, 0.4) }, { type: 'samurai', n: 2 }], HOJO));
    for (const u of F.dai.units) if (u.type === 'gun') u.dmg *= 0.5;
    rt.marker('dai', centerOf(F.dai), '間宮康俊', { red: true, group: F.dai });
    const go = (g, x, z) => { g.order = 'move'; g.dest = { x, z }; g.speed = 2.4; g.onArrive = (q) => { q.order = 'attack'; q.seekRange = 40; q.anchor = { x, z }; }; };
    go(F.ichi, D.x + 30, D.z + 2); go(F.naka, D.x + 40, D.z - 4);   // 東の土橋の口へ（出丸の前の障子堀を避ける）
    // 堀秀政は東の尾根を登り、障子堀の東の端の外で待つ
    go(F.hori, SHOJI.x1 + 22, SHOJI.z1 + 18);
  },

  // ② 障子堀の畝の上を渡る
  shoji(rt) {
    const F = rt.flags;
    if (F.step >= 2) return;
    F.step = 2; F.stepT = rt.t;
    rt.setPhase('shoji'); rt.unmark('dai');
    if (!gone(F.dai)) F.dai.morale = Math.min(F.dai.morale, 10);
    rt.award((t) => t.side.push('岱崎出丸を抜いた'), '岱崎出丸を抜いた');
    rt.banner('障子堀', '堀の底は畝で格子に仕切られている。畝の上を一列で渡れ');
    rt.obj('main', '障子堀の畝の上を渡れ', 'main');
    rt.say('中村一氏', '堀へ落ちれば這い上がれぬ。畝から足を外すな', 4);
    // 堀の底に潜む槍（落ちた者を下から突く）と、向こうの縁の鉄砲
    const mz = (SHOJI.z0 + SHOJI.z1) / 2;
    F.pit = enemyGroup(rt, { faction: 'hojo', name: '堀の底の槍', anchor: { x: CROSS_X + 9, z: mz + 4 }, facing: 0, order: 'hold', aggro: 7, width: 10, morale: 80, ambush: true, fleeDir: { x: 0, z: -1 }, dmgMult: 0.55 },
      dress([{ type: 'ashigaru', n: 6 + more(rt, 0.3) }], HOJO));
    F.rim = enemyGroup(rt, { faction: 'hojo', name: '堀の縁の鉄砲', anchor: { x: CROSS_X + 4, z: SHOJI.z0 - 8 }, facing: 0, order: 'hold', aggro: 24, width: 14, morale: 85, fleeDir: { x: 0, z: -1 }, dmgMult: 0.55 },
      dress([{ type: 'gun', n: 6 }, { type: 'ashigaru', n: 6 }], HOJO));
    for (const u of F.rim.units) if (u.type === 'gun') u.dmg *= 0.45;
    F.cross = { x: CROSS_X, z: SHOJI.z0 - 6 };
    rt.marker('cross', F.cross, '', { h: 2 });
    const path = (g, dx) => { g.order = 'path'; g.path = [[CROSS_X + dx, SHOJI.z1 + 6], [CROSS_X + dx, SHOJI.z0 - 6]]; g.pathIdx = 0; g.speed = 1.8; g.onArrive = (q) => { q.order = 'attack'; q.seekRange = 30; }; };
    path(F.ichi, -SHOJI.cell); path(F.naka, SHOJI.cell);
    if (!gone(F.hori)) { F.hori.order = 'path'; F.hori.path = [[SHOJI.x1 + 14, SHOJI.z1 + 6], [SHOJI.x1 + 14, SHOJI.z0 - 10], [SP.x + 36, SP.z + 4]]; F.hori.pathIdx = 0; F.hori.speed = 2; F.hori.onArrive = (q) => { q.order = 'hold'; q.anchor = { x: SP.x + 36, z: SP.z + 4 }; q.aggro = 14; }; }
  },

  // ③ 三の丸の虎口（枡形）を破る
  koguchi(rt) {
    const F = rt.flags;
    if (F.step >= 3) return;
    F.step = 3; F.stepT = rt.t;
    rt.setPhase('koguchi'); rt.unmark('cross');
    for (const g of [F.pit, F.rim]) if (!gone(g)) g.morale = Math.min(g.morale, 12);
    rt.award((t) => t.side.push('障子堀を渡った'), '障子堀を渡った');
    rt.obj('main', '三の丸の虎口を破れ', 'main');
    rt.banner('畝堀と枡形の虎口', '堀の底の畝の上を進み、折れた門を破れ');
    rt.after(6, () => { if (F.step === 3) rt.say('渡辺勘兵衛', '一番乗りは、この勘兵衛がもらう！', 3.5); });
    F.san = enemyGroup(rt, { faction: 'hojo', name: '三の丸の守り', anchor: { ...SP.at.plaza }, facing: 0, order: 'hold', aggro: 12, width: 12, morale: 95, fleeDir: { x: 0, z: -1 }, dmgMult: 0.58 },
      dress([{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 10 + more(rt, 0.4) }], HOJO));
    const gate = F.K.gate && F.K.gate.struct;
    rt.marker('gate', SP.at.gateOut, '', { red: true, h: 3 });
    for (const g of F.toyo) {
      g.order = 'assault'; g.speed = 2;
      g.assault = () => (gate && gate.alive && !gate.opened ? gate : SP.at.plaza);
    }
    rt.after(22, () => { if (F.step === 3) rt.say('使番', '一柳殿、鉄砲に当たられた！　旗はまだ立っておる！', 4); });
  },
  openGate(rt) {
    const F = rt.flags;
    if (F.gateOpen) return;
    F.gateOpen = true;
    for (const G of [F.K.gate, F.K.masu && F.K.masu.inner]) if (G && G.struct && G.struct.alive !== false) { G.struct.opened = true; G.open && G.open(); }
    rt.unmark('gate');
    sfx('kane', 0.4);
    rt.banner('虎口を破った', '三の丸へなだれ込め');
    for (const g of F.toyo) { g.order = 'attack'; g.seekRange = 40; g.anchor = { ...SP.at.plaza }; }
    rt.after(2, () => rt.say('堀秀政', '東の塀を越えた！　三の丸を挟め！', 3.5));
  },

  // ④ 二の丸を抜け、本丸の松田康長の隊を崩す
  honmaru(rt) {
    const F = rt.flags;
    if (F.step >= 4) return;
    F.step = 4; F.stepT = rt.t;
    rt.setPhase('honmaru');
    if (!gone(F.san)) F.san.morale = Math.min(F.san.morale, 12);
    rt.award((t) => t.side.push('三の丸の虎口を破った'), '三の丸の虎口を破った');
    rt.obj('main', '二の丸を抜け、本丸の松田康長を崩せ', 'main');
    const H = KURUWA.hon;
    F.hon = enemyGroup(rt, { faction: 'hojo', name: '松田康長の隊', anchor: { x: H.x, z: H.z + 6 }, facing: 0, order: 'hold', aggro: 16, width: 12, morale: 100, noRout: true, fleeDir: { x: 0, z: -1 }, dmgMult: 0.5, defMult: 1.15 },
      dress([{ type: 'busho', n: 1, o: { name: '松田康長', invuln: true, hat: 'kabuto_m', haori: 0x5a2a1c } }, { type: 'samurai', n: 4 }, { type: 'ashigaru', n: 10 + more(rt, 0.4) }, { type: 'gun', n: 3 }], HOJO));
    F.honU = F.hon.units[0];
    rt.marker('hon', centerOf(F.hon), '松田康長', { red: true, group: F.hon });
    rt.say('松田康長', 'ここは小田原の西の門ぞ。一足も通すな！', 4);
    for (const g of F.toyo) { g.order = 'path'; g.path = [[KURUWA.ni.x, KURUWA.ni.z], [H.x, H.z + 14]]; g.pathIdx = 0; g.speed = 2.2; g.onArrive = (q) => { q.order = 'attack'; q.seekRange = 40; }; }
    rt.after(10, () => { if (!gone(F.hon)) { F.hon.order = 'attack'; F.hon.seekRange = 34; } });
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    for (const id of ['hon', 'gate', 'cross', 'dai']) rt.unmark(id);
    if (F.hon && !gone(F.hon)) F.hon.morale = 0;
    rt.objDone('main');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '山中城を半日で落とした', pts: 24 }; }, '任務達成・山中城の本丸を崩した');
    sfx('kane', 0.5);
    rt.banner('山中城、落つ', '北条の西の守りは、半日で崩れた');
    // 戦の後の会話
    rt.say('豊臣秀次', '一柳殿が撃たれた。だが城は落ちた', 4.5);
    rt.after(13.4, () => rt.say('使番', '松田康長、討ち死に。一番乗りは渡辺勘兵衛！', 3.4));
    rt.after(4.8, () => rt.say(nm(rt), '北条の西の門は、開きました', 4));
    rt.after(9, () => rt.say('豊臣秀次', '箱根を越えるぞ。小田原はもう目の前じゃ', 4));
    rt.player.u.invuln = true;
    rt.finish({ scriptedEnd: true }, 17.5);
  },
  lose(rt, why) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.objFail('main'); rt.tracker.main = false;
    rt.banner('一柳の旗が倒れた', '寄せ手が崩れた。退け');
    rt.player.u.invuln = true;
    rt.finish({ scriptedEnd: true, failureReason: why }, 8);
  },

  update(rt, dt) {
    const F = rt.flags;
    if (F.K) F.K.tick(dt);
    for (const m of rt.markers.slice()) if (m.group && gone(m.group)) rt.unmark(m.id);
    if (F.ending || !F.step) return;
    const p = rt.player.u.pos, T = rt.t - F.stepT;
    // 負け方：一柳の旗の隊が全部崩れる（本人が倒れるのは共通の仕組み）
    if (F.ichi.count === 0 && (!rt.canFailMission || rt.canFailMission())) { this.lose(rt, '一柳直末の隊が崩れた'); return; }
    if (F.step === 1) {
      rt.objProgress('main', `間宮の隊 ${F.dai.count}人`);
      if (!F.daiOn && p.z < KURUWA.dai.z + 60) { F.daiOn = true; F.dai.order = 'attack'; F.dai.seekRange = 36; }
      if (F.dai.count < 5 && !gone(F.dai)) F.dai.morale = Math.min(F.dai.morale, 20);
      if (gone(F.dai) || T > 130) this.shoji(rt);
    }
    if (F.step === 2) {
      const d = Math.hypot(p.x - F.cross.x, p.z - F.cross.z);
      rt.objProgress('main', `堀の向こうまで ${Math.round(d)}m`);
      if (!F.rimOn && p.z < SHOJI.z1 + 30) { F.rimOn = true; F.rim.order = 'attack'; F.rim.seekRange = 30; }
      if ((p.z < SHOJI.z0 - 2 && d < 16) || T > 120) this.koguchi(rt);
    }
    if (F.step === 3) {
      const gate = F.K.gate && F.K.gate.struct;
      if (!F.gateOpen && (!gate || gate.alive === false || gate.opened || T > 75)) this.openGate(rt);
      const d = Math.hypot(p.x - SP.at.plaza.x, p.z - SP.at.plaza.z);
      rt.objProgress('main', F.gateOpen ? `三の丸の守り ${F.san.count}人` : '');
      if (F.san.count < 4 && !gone(F.san)) F.san.morale = Math.min(F.san.morale, 20);
      if (F.gateOpen && ((gone(F.san) && d < 30) || p.z < SP.z - 20 || T > 150)) this.honmaru(rt);
    }
    if (F.step === 4) {
      const g = F.hon;
      rt.objProgress('main', `松田の隊 ${g.count}人`);
      if (g.count < 6 && g.noRout) { g.noRout = false; g.morale = Math.min(g.morale, 25); if (F.honU) F.honU.invuln = false; }
      // 二分斬り合えば、ほかの手（中村・堀・山内）が本丸へ攻め上って城は落ちる（一人で三分斬り続けて息が切れない）
      if (gone(g) || T > 120) this.win(rt);
    }
  },

  onKill(rt, v) {
    const F = rt.flags;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
  },
  onRout(rt, g) {
    if (g.team !== 1) return;
    rt.say('足軽', `${g.name}が奥へ退いた`, 2.5);
  },
};

// 両軍の総勢（豊臣秀次の寄せ手およそ七万、山中城の北条勢およそ四千。数には諸説ある）
t09_yamanaka.force = (rt) => {
  const F = rt.flags;
  return { a: Math.round(70000 - (F.ak || 0) * 40), a0: 70000, b: Math.max(0, 4000 - (F.ek || 0) * 40), b0: 4000 };
};
t09_yamanaka.sides = { a: { name: '豊臣軍（豊臣秀次）', mon: 'toyotomi' }, b: { name: '北条軍（松田康長）', mon: 'hojo' } };
t09_yamanaka.date = () => '天正十八年三月二十九日　春・朝';
t09_yamanaka.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '下知まで待つ' : '');
t09_yamanaka.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
t09_yamanaka.history = '天正十八年（1590）、豊臣秀吉は小田原の北条氏を攻めた。三月二十九日の朝、豊臣秀次を大将におよそ七万が、箱根の西の坂にある山中城を攻めた。城は松田康長らおよそ四千が守り、堀の底を畝で仕切った障子堀・畝堀と、折れた虎口で固めていた。寄せ手の一柳直末は鉄砲に当たって討たれたが、中村一氏（家臣の渡辺勘兵衛が一番乗り）・堀秀政・山内一豊らの手がいくつもの方から攻め上り、城は半日で落ちた。岱崎出丸を守った間宮康俊も、城主の松田康長も討ち死にした。北条の西の守りは一日で崩れ、秀吉の軍は箱根を越えて小田原を囲んだ。兵の数には諸説ある。';

// 素直な遊び手：出丸の隊と戦い、障子堀を縦の畝の上で渡り、虎口が開いたら三の丸から本丸へ
t09_yamanaka.botBrain = (b, inp, { goTo }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyE');
  if (!u.alive || F.ending) return;
  if (u.hp < u.maxHp * 0.45) b.botRest = true;
  if (b.botRest && u.hp > u.maxHp * 0.85) b.botRest = false;
  const c = F.ichi.center();
  if (b.botRest && F.step !== 2) { inp.guardHold = false; goTo(p, inp, c.x, c.z + 6, 2); return; }
  // 堀の中では寄り道をせず、畝の筋をまっすぐ渡る
  if (F.step === 2) { inp.guardHold = false; goTo(p, inp, CROSS_X, u.pos.z > SHOJI.z0 - 4 ? SHOJI.z0 - 7 : F.cross.z, 1.5); return; }
  const e = b.army.nearestEnemy(u, 12, (o) => !o.fleeing && !o.isStruct);
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d > 2.6) inp.k.add('KeyW');
    if (d < 3.2 && Math.random() < 0.5) inp.leftPressed = true;
    inp.guardHold = (b.army.threats || []).length > 0 && Math.random() < 0.85;
    return;
  }
  inp.guardHold = false;
  if (F.step === 1 && F.dai && !gone(F.dai)) { const t = F.dai.center(); goTo(p, inp, t.x, t.z, 2); return; }
  if (F.step === 1) { goTo(p, inp, CROSS_X, SHOJI.z1 + 8, 3); return; }
  if (F.step === 3) {
    if (!F.gateOpen) { goTo(p, inp, SP.at.bridgeOut.x, SP.at.bridgeOut.z + 4, 2); return; }
    if (F.san && !gone(F.san)) { const t = F.san.center(); goTo(p, inp, t.x, t.z, 2); return; }
    goTo(p, inp, SP.at.plaza.x, SP.z - 26, 2); return;
  }
  if (F.step === 4 && F.hon && !gone(F.hon)) { const t = F.hon.center(); goTo(p, inp, t.x, t.z, 2); return; }
  goTo(p, inp, c.x, c.z - 4, 3);
};

// bot は打ち込みを見て構えてから、この戦の頭へ（toyo_bot.js）
withGuard(t09_yamanaka);

export { t09_yamanaka };
export default t09_yamanaka;
