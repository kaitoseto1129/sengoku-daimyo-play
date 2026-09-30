// ======================================================================
// 織田家編　稲葉山城の戦い（永禄十年八月）
// 美濃三人衆が織田方につき、信長はすぐに兵を出して稲葉山城（金華山）を囲んだ。
// 足軽は木下藤吉郎の手。①夜明け、城下の井口の町に火を放つ ②大手口から打って出た斎藤勢を退ける
// ③藤吉郎について、山の裏の道（搦手）を登り、木戸の守りを破る ④本丸の脇に火を放って、大手の味方へ合図を送る
// 何日もの囲みを、一日の流れにまとめている
// 向き：北（-z）が金華山と本丸。南（+z）が井口の町。東（+x）の瑞龍寺山に信長の本陣。西の外を長良川が流れる
// ======================================================================
import * as THREE from 'three';
import { nobori, jinmaku, hut, kabukimon, yagura, tawara, campfire, palisade, village, ishigaki, sumiyagura, sakamogi, kagaribi } from './props.js';
import { flagTexture } from './textures.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { moraleWord } from './hud.js';
import { gauss, enemyGroup, allyGroup, nm, centerOf, unitPos, wallLine, ringWall } from './bhelp.js';
import { KIT } from './b_nagashinojo.js';
import { camp } from './b_mid.js';
import { depthStart, depthTick, depthBot, rest, pick, fight, hold } from './b_depth.js';

// 足軽大将ほどの身分（信長で遊ぶ時は除く）：藤吉郎の手の一隊を預かる
const hi = (rt) => !rt.G.lord && (rt.G.rank || 0) >= 3;

const HON = { x: 0, z: -116 };            // 本丸（山の上）
const OTE = { x: 0, z: -62 };             // 大手の木戸（七曲りの道の途中）
const ZUI = { x: 112, z: -30 };           // 瑞龍寺山（信長の本陣）
const ROAD = [[70, 150], [36, 104], [18, 70], [6, 36], [0, 0], [0, -40], [OTE.x, OTE.z], [0, -96]];
// 搦手の道（百曲り）：大手の西の麓から、山の西の肩をまわって本丸の裏の口へ
const KARA = [[-6, -34], [-44, -58], [-64, -92], [-54, -120], [-26, -118], [-9, -116]];
const GAP_A = Math.PI * 1.5;              // 本丸の柵の口（西向き）
// 井口の町の家（x, z, 向き）。はじめの五つが自分で火を放つ候補
const HOUSES = [[24, 80, 0.1], [4, 64, -0.2], [30, 54, 0.3], [-10, 44, 0.05], [44, 78, -0.1], [-18, 70, 0.2], [16, 38, 0.15], [42, 44, -0.25], [-4, 86, 0.1], [8, 100, -0.1]];
const MINE = 5;
const NEED = 3;                            // 自分で火を放つ数

const ODA = { flag: 'oda' };

// 夜明けの色（鳶ヶ巣山砦夜襲・強右衛門と同じ作り）。のちに setTime('morning') で朝へ移ろう
const DAWN = { sky: 0x7e7a88, fog: 0x6e6c7a, sun: 0xffbe86, sunI: 1.05, hs: 0xa4a0b4, hg: 0x362e26, hI: 1.0, top: 0x46506c, glow: 0.24, dir: [1, 0.08, 0.3], mount: 0x262624 };
// env：空の映り込み（PMREM）を作り直すか。重いので、少しずつ移ろう間は false にし、最後に一度だけ作る
export function applyLook(rt, L, env = true) {
  const W = rt.world;
  // 既に夕暮れの扱いなら setTime は呼ばない（呼ぶたびに空の映り込みを作り直して重い）
  if (W.timeKey !== 'dusk') W.setTime('dusk');
  // 戦の途中で呼ぶと setTime が夕暮れへの移ろいを始めて、下の色を上書きしてしまうので止める
  W.fade = null;
  W.scene.background.set(L.sky);
  W.scene.fog.color.set(L.fog);
  W.sun.color.set(L.sun); W.sun.intensity = L.sunI;
  W.hemi.color.set(L.hs); W.hemi.groundColor.set(L.hg); W.hemi.intensity = L.hI; W.baseHemi = L.hI;
  W.sunOffset.set(...L.dir).normalize().multiplyScalar(120);
  const U = W.skyMat.uniforms;
  U.top.value.set(L.top); U.bottom.value.set(L.fog);
  U.sunDir.value.set(...L.dir).normalize(); U.sunCol.value.set(L.sun);
  U.glowK.value = L.glow; U.cover.value = 0.35;
  W.mountMats.forEach((m, k) => { const far = m.color.clone().set(L.mount); m.color.set(L.fog).lerp(far, [0.78, 0.52, 0.3][k]); });
  if (env) W.updateEnv();
}

// 夜の色（箕作城の夜攻め・本能寺で使う）
export const NIGHT = { sky: 0x2a3446, fog: 0x283244, sun: 0x9eb0d0, sunI: 0.7, hs: 0x8494b4, hg: 0x2a2a2c, hI: 1.25, top: 0x151c2e, glow: 0.05, dir: [0.8, 0.16, -0.4], mount: 0x13171e };
export { DAWN };
// 町に火を放つ間に、夜明けの空が少しずつ明るむ（DAWN → DAWN2）
const DAWN2 = { sky: 0xa6a2a8, fog: 0x96929e, sun: 0xffc896, sunI: 1.3, hs: 0xb4b0bc, hg: 0x3e362c, hI: 1.1, top: 0x5a6888, glow: 0.3, dir: [1, 0.14, 0.3], mount: 0x2c2c2a };
function mixLook(a, b, k) {
  const o = {};
  for (const key of Object.keys(a)) {
    if (Array.isArray(a[key])) o[key] = a[key].map((v, i) => v + (b[key][i] - v) * k);
    else if (key === 'sunI' || key === 'hI' || key === 'glow') o[key] = a[key] + (b[key] - a[key]) * k;
    else o[key] = new THREE.Color(a[key]).lerp(new THREE.Color(b[key]), k).getHex();
  }
  return o;
}

// textures.js に無い家の紋・字の旗：flagTexture の無地の布に、ここで描き足す（一度だけ。兵の指物・幟・遠くの大軍が同じ布を使う）
// draw(g) は 128×256 の布の上に描く（紋の真ん中はおよそ (64, 82)、半径 43）。すでに紋が描かれている布なら何もしない
export function customFlag(key, draw, bg) {
  const t = flagTexture(key);
  if (t.userData.custom) return t;
  t.userData.custom = true;
  const g = t.image.getContext('2d');
  // 布の絵は 128×256 で描いた頃の座標で描く（今の布が倍の細かさなら、その分だけ拡げる）
  const k = (t.image.width || 128) / 128;
  const d = g.getImageData(24 * k, 40 * k, 80 * k, 84 * k).data;
  let ink = 0;
  for (let i = 0; i < d.length; i += 16 * k * k) if (d[i] + d[i + 1] + d[i + 2] < 240) ink++;
  if (ink > 40) return t;
  if (bg) { g.save(); g.globalCompositeOperation = 'multiply'; g.fillStyle = bg; g.fillRect(0, 0, 128 * k, 256 * k); g.restore(); }
  g.save(); g.scale(k, k); g.fillStyle = g.strokeStyle = '#17130f'; draw(g); g.restore();
  t.needsUpdate = true;
  return t;
}
// 縦書きの字（字の旗）
export function flagColumn(g, text, x, y0, y1, size) {
  g.font = `bold ${Math.round(size)}px "Hiragino Mincho ProN", "Yu Mincho", serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const cs = [...text], step = (y1 - y0) / cs.length;
  cs.forEach((ch, i) => { g.globalAlpha = 0.35; g.fillText(ch, x + 0.8, y0 + step * (i + 0.5) + 0.6); g.globalAlpha = 1; g.fillText(ch, x, y0 + step * (i + 0.5)); });
}
export const dress = (list, lk) => list.map((s) => ({ ...s, o: { ...lk, ...(s.o || {}) } }));
export const gone = (g) => !g || g.count === 0 || g.routed;
// 自分の組が大きいほど、敵を厚くする（組の人数の k 倍を足す）
export const more = (rt, k = 0.5) => Math.round((RANKS[rt.G.rank].squad || 0) * k);
// 味方の鉄砲の一斉射：敵の隊が鉄砲の組へ寄せた所で一度だけ「放て」。当たった隊の士気を落として崩れやすくする
// o = { guns: () => 組, foes: () => [隊], r: 寄せの距離, who, line, sub, drop: 士気の落ち }。update で毎コマ呼ぶ
export function volleyWatch(rt, key, o) {
  const F = rt.flags, k = 'vw_' + key;
  if (F[k]) return;
  const g = o.guns && o.guns();
  if (gone(g)) return;
  const c = g.center(), r = o.r || 30;
  const near = (o.foes() || []).filter((q) => { if (gone(q)) return false; const d = q.center(); return Math.hypot(d.x - c.x, d.z - c.z) < r; });
  if (!near.length) return;
  F[k] = true;
  g.fire = true;
  rt.say(o.who || '鉄砲頭', o.line || '引きつけた……放て！', 2.5);
  rt.banner('放て！', o.sub || '鉄砲の一斉射');
  sfx('volley', 1);
  rt.after(1.4, () => {
    for (const q of near) if (!gone(q)) { q.morale = Math.max(0, q.morale - (o.drop || 30)); }
    rt.bark('敵の前が崩れた。今こそ突け', false);
  });
}

function base(x, z) {
  let h = 0.6 * Math.sin(x * 0.031 + 0.4) * Math.cos(z * 0.027) + 0.3 * Math.sin(z * 0.07 + x * 0.02);
  // 金華山：本丸の峰と、西の肩（搦手の道が通る）
  h += 44 * gauss(x, z, HON.x, HON.z - 4, 2600) + 14 * gauss(x, z, -40, -130, 1800) + 20 * gauss(x, z, 40, -150, 2600);
  // 瑞龍寺山
  h += 20 * gauss(x, z, ZUI.x, ZUI.z, 1500);
  // 北と西の山並み
  h += Math.max(0, -z - 170) * 0.3 + Math.max(0, x - 150) * 0.2;
  // 西は長良川の川べりへ下がる
  if (x < -90) h -= Math.min(3, (-90 - x) * 0.08);
  return h;
}
const HTOP = base(HON.x, HON.z);
function height(x, z) {
  const h = base(x, z);
  // 本丸の平場（ならして平らに）
  const d = Math.hypot(x - HON.x, z - HON.z);
  const k = Math.max(0, Math.min(1, (22 - d) / 6));
  return h * (1 - k) + HTOP * k;
}

// 焼けた家：屋根を焦がし、炎と煙を上げる
export function burnHouse(rt, h) {
  if (h.burnt) return;
  h.burnt = true;
  const W = rt.world;
  const roof = h.m.children[1];
  if (roof && roof.material) { roof.material = roof.material.clone(); roof.material.color.setRGB(0.18, 0.15, 0.12); }
  // 一軒に炎は一つ（大きめ）。煙の柱は炎が上げる（数を絞って重くしない）
  h.fires = [W.addFire(h.x + 0.6, h.z - 0.4, { h: 1.6, size: 2.2 })];
  rt.army.play('wood', { x: h.x, z: h.z }, 0.8);
  // 燃え続けた家は、屋根から崩れ落ちる（少しずつ傾き、沈み、最後に壁が潰れる）
  rt.after(30 + Math.random() * 25, () => {
    const wall = h.m.children[0], tilt = Math.random() < 0.5 ? -1 : 1;
    for (let i = 1; i <= 14; i++) rt.after(i * 0.07, () => {
      for (const r of [roof, h.m.children[2]]) if (r) { r.position.y -= 0.16; r.rotation.z = tilt * 0.025 * i; r.rotation.x = 0.012 * i; }
      if (wall && i > 8) wall.scale.y = Math.max(0.35, 1 - (i - 8) * 0.11);
    });
    rt.army.play('wood', { x: h.x, z: h.z }, 1.2);
    rt.army.smoke && rt.army.smoke(h.x, W.heightAt(h.x, h.z) + 1, h.z, 0, 0);
  });
}

const inabayama = {
  spawn: { x: 34, z: 110, heading: Math.PI + 0.3 },
  world: {
    seed: 1567,
    wind: [0.5, 0.86],   // 長良川の方から吹く明け方の風
    time: 'dusk',
    muddy: 0.2,
    paths: [ROAD, KARA],
    height,
    tint(x, z, h, c) {
      // 城下の土の道と町の庭
      if (z > 30 && z < 108 && x > -30 && x < 56) c.lerp({ r: 0.5, g: 0.45, b: 0.36 }, 0.35);
      // 金華山の杉と岩は暗く
      else if (h > 12) c.setRGB(c.r * 0.8, c.g * 0.88, c.b * 0.8);
    },
    clear: (x, z) => (z > 26 && z < 112 && x > -34 && x < 60) || Math.hypot(x - HON.x, z - HON.z) < 24 || Math.hypot(x - ZUI.x, z - ZUI.z) < 26 ||
      (Math.abs(x) < 14 && z < 30 && z > -100) || Math.hypot(x - OTE.x, z - OTE.z) < 20,
    streams: [{ pts: [[-150, -190], [-118, -110], [-112, -30], [-124, 60], [-150, 170]], w: 9, depth: 1.4 }],
    trees: 560,
    tufts: 3800,
    treeDensity: (x, z) => (z > 20 ? 0.25 : 1),
    groves: [{ x: -40, z: 10, r: 14, n: 20 }, { x: 60, z: 10, r: 12, n: 16 }, { x: 72, z: 120, r: 12, n: 14 }],
    // 崩れた斎藤の兵は、山の奥（北）で消す
    fleeOut: (x, z, team) => team === 1 && (z < -150 || (z < -90 && Math.abs(x) > 40)),
  },

  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    F.step = 0; F.ek = 0; F.ak = 0; F.lit = 0;
    // ---- 井口の町 ----
    F.houses = HOUSES.map(([x, z, r], i) => {
      const m = hut(W, x, z, 6 + (i % 3), 4.5, r, { wall: i % 2 ? 0x7b6448 : 0x6e5a40 });
      rt.scene.add(m);
      return { x, z, m, i, mine: i < MINE };
    });
    rt.scene.add(tawara(W, 12, 72, 0.3, 5), tawara(W, -2, 52, -0.4, 4));
    // ---- 大手の木戸（七曲りの道を切る柵。口は開いている） ----
    const noT = (segs) => { for (const s of segs) { s.noTarget = true; s.wall = true; } return segs; };
    noT(wallLine(rt, [[-26, OTE.z + 6], [-4, OTE.z]], { team: 1, hp: 1e9, name: '柵', segLen: 5 }));
    noT(wallLine(rt, [[4, OTE.z], [26, OTE.z + 6]], { team: 1, hp: 1e9, name: '柵', segLen: 5 }));
    rt.scene.add(kabukimon(W, OTE.x, OTE.z, 7.4, 0));
    // ---- 本丸：柵の囲いと、櫓・小屋。口は西（搦手）に一つ ----
    F.hwall = noT(ringWall(rt, HON.x, HON.z, 15, { gapAt: GAP_A, gapW: 0.6, team: 1, hp: 1e9, name: '本丸の柵', segLen: 5 }));
    // 本丸の奥の館は、二重の櫓に（下から見上げて城と分かるように。A4）
    rt.scene.add(sumiyagura(W, HON.x + 5, HON.z + 7, { rot: 0.05, w: 7, d: 5.5, base: 1.6, stone: 'nozura' }), hut(W, HON.x + 4, HON.z - 6, 6, 4, -0.2));
    rt.scene.add(yagura(W, HON.x - 6, HON.z - 8), yagura(W, HON.x + 10, HON.z - 12));
    rt.scene.add(yagura(W, OTE.x + 12, OTE.z - 6));
    // 城の見栄え（A4）：本丸の柵の外に野面積みの石垣（搦手の口は空ける）、本丸の北の頂に二重の櫓、大手の前に逆茂木、木戸に篝火
    {
      const arc = (a0, a1, r) => { const n = Math.max(2, Math.round(r * (a1 - a0) / 3)); return Array.from({ length: n + 1 }, (_, i) => { const a = a0 + (a1 - a0) * i / n; return [HON.x + Math.sin(a) * r, HON.z + Math.cos(a) * r]; }); };
      rt.scene.add(ishigaki(W, arc(GAP_A - Math.PI * 2 + 0.55, GAP_A - 0.55, 17.4), { top: 1.5, minH: 2.6, maxH: 3.4, lean: 0.12 }));
      rt.scene.add(sakamogi(W, OTE.x - 13, OTE.z + 9, 0.2, 7), sakamogi(W, OTE.x + 13, OTE.z + 9, -0.2, 7));
      for (const [x, z] of [[OTE.x - 5.5, OTE.z + 2], [OTE.x + 5.5, OTE.z + 2]]) { rt.scene.add(kagaribi(W, x, z)); W.addFire(x, z, { h: 1.4 }); }
      // 本丸に詰める城兵（軽い大軍の作り。見上げると塀の内に人と旗が見える）
      W.addDistantArmy({ x: HON.x - 3, z: HON.z - 2, w: 12, d: 6, count: 45, facing: 0, armor: 0x33302a, flagTex: flagTexture('saito'), seed: 15677 });
      // 本丸の奥の御座所：斎藤龍興と馬廻（見上げに来れば大将がいる。寄り過ぎなければ打って出ない）
      F.tatsu = enemyGroup(rt, { faction: 'saito', name: '斎藤龍興の馬廻', anchor: { x: HON.x, z: HON.z - 11 }, facing: 0, order: 'hold', aggro: 3, width: 6, morale: 100, noRout: true, fleeDir: { x: 0, z: -1 }, dmgMult: 0.6 },
        dress([{ type: 'busho', n: 1, o: { name: '斎藤龍興', invuln: true, hat: 'kabuto_w', haori: 0x2e3a2a } }, { type: 'samurai', n: 4 }, { type: 'gun', n: 2 }], { flag: 'saito' }));
      if (F.tatsu.units[0]) F.tatsu.leader = F.tatsu.units[0];
      // 本丸の柵の内に沿って、外を向いて構える鉄砲・弓・槍の者（軽い作り。柵の隙間から筒先と頭がのぞく）。口の前は空ける
      const crew = [];
      for (let a = GAP_A - Math.PI * 2 + 0.5, k = 0; a < GAP_A - 0.5; a += 0.22, k++) {
        crew.push({ x: HON.x + Math.sin(a) * 13.6, z: HON.z + Math.cos(a) * 13.6, k: ['gun', 'bow', 'spear', 'gun'][k % 4], facing: a });
        if (k % 5 === 2) crew.push({ x: HON.x + Math.sin(a) * 11.8, z: HON.z + Math.cos(a) * 11.8, k: 'banner', facing: a });
      }
      W.addDistantArmy({ people: crew, armor: 0x33302a, flagTex: flagTexture('saito'), seed: 15678 });
    }
    for (const [x, z] of [[HON.x - 4, HON.z + 10], [HON.x + 10, HON.z + 2], [OTE.x - 8, OTE.z - 6], [OTE.x + 8, OTE.z - 6], [-30, -120]]) rt.scene.add(nobori(W, x, z, 'saito', 6));
    // 山の上の小屋（二の丸・三の丸の見え）
    for (const [x, z, r] of [[-26, -96, 0.4], [22, -92, -0.3], [34, -120, 0.2], [-10, -84, 0.1]]) rt.scene.add(hut(W, x, z, 6, 4, r, { wall: 0x6a5238 }));
    // ---- 織田勢：木下藤吉郎の手（自分の持ち場）、柴田勝家の手、丹羽長秀の手 ----
    F.kino = allyGroup(rt, { name: '木下藤吉郎の手', anchor: { x: 28, z: 104 }, facing: Math.PI, width: 12, aggro: 8, noRout: true },
      dress([{ type: 'busho', n: 1, o: { name: '木下藤吉郎', invuln: true } }, { type: 'ashigaru', n: 14 }, { type: 'gun', n: 2 }], ODA));
    F.kinoU = F.kino.units[0];
    F.shiba = allyGroup(rt, { name: '柴田勝家の手', anchor: { x: 52, z: 96 }, facing: Math.PI, width: 14, aggro: 8, noRout: true },
      dress([{ type: 'samurai', n: 1, o: { name: '柴田勝家', invuln: true, horse: true, hat: 'kabuto_m', haori: 0x3a2a1a } }, { type: 'samurai', n: 1 }, { type: 'ashigaru', n: 16 }], ODA));
    F.niwa = allyGroup(rt, { name: '丹羽長秀の手', anchor: { x: 8, z: 116 }, facing: Math.PI, width: 12, aggro: 8, noRout: true },
      dress([{ type: 'samurai', n: 1, o: { name: '丹羽長秀', invuln: true, horse: true, hat: 'kabuto_w', haori: 0x2a3a2a } }, { type: 'ashigaru', n: 12 }, { type: 'bow', n: 4 }], ODA));
    F.oda = [F.kino, F.shiba, F.niwa];
    for (const g of F.oda) { g.defMult = 1.2; g.dmgMult = 0.85; }
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: 36, z: 114 }, Math.PI, [{ kind: 'spear', n }]);
    // ---- 町に残る斎藤の番の兵 ----
    F.town = enemyGroup(rt, { faction: 'saito', name: '町の番の兵', anchor: { x: 8, z: 50 }, facing: 0, width: 10, aggro: 12, morale: 80, fleeDir: { x: 0, z: -1 }, dmgMult: 0.7 },
      [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 13 }]);
    // ---- 大軍（軽い作り）：瑞龍寺山の信長の本陣、美濃三人衆、城を囲む織田勢 ----
    const DA = (x, z, w, d, count, facing, armor, flag, seed) => W.addDistantArmy({ x, z, w, d, count, facing, armor, flagTex: flagTexture(flag), seed });
    // 瑞龍寺山の本陣：信長と旗本（控えは周りの大軍。信長で遊ぶ時は旗本だけ）
    F.odaCamp = camp(rt, { x: ZUI.x, z: ZUI.z, facing: Math.atan2(HON.x - ZUI.x, HON.z - ZUI.z), team: 0, faction: 'oda', mon: 'oda', general: { name: '織田信長' }, guard: 15, reserve: 0, runTo: { x: 70, z: 20 } });
    for (const [x, z, k] of [[ZUI.x - 10, ZUI.z + 8, 'oda'], [ZUI.x - 4, ZUI.z + 9, 'eiraku'], [ZUI.x + 4, ZUI.z + 9, 'oda'], [ZUI.x + 10, ZUI.z + 8, 'eiraku']]) rt.scene.add(nobori(W, x, z, k, 6.5));
    DA(ZUI.x - 16, ZUI.z + 20, 26, 12, 220, -Math.PI * 0.75, 0x2b3140, 'oda', 15671);
    DA(ZUI.x + 14, ZUI.z - 12, 24, 10, 160, -Math.PI * 0.7, 0x2b3140, 'eiraku', 15672);
    DA(-64, 40, 30, 12, 240, Math.PI * 0.85, 0x33302a, 'inaba', 15673);     // 美濃三人衆（西美濃から）
    DA(80, 60, 30, 12, 220, Math.PI * 1.2, 0x2b3140, 'oda', 15674);
    DA(70, -86, 24, 10, 160, -Math.PI / 2, 0x2b3140, 'oda', 15675);
    for (const [x, z] of [[-58, 26], [-70, 30]]) rt.scene.add(nobori(W, x, z, 'inaba', 6));
    // 大手の側に詰める織田の大軍（合図の火で押し出す）
    // （町で戦う味方の兵が埋もれないように、町の南の外れで控える）
    F.otePush = [DA(-40, 8, 22, 8, 180, Math.PI, 0x2b3140, 'oda', 15676), DA(40, 4, 22, 8, 180, Math.PI, 0x2b3140, 'eiraku', 15677)];
    // 斎藤の城兵：金華山の山腹の曲輪と、大手の木戸の奥
    DA(-24, -96, 14, 6, 70, 0, 0x3a3a30, 'saito', 15678);
    DA(22, -92, 14, 6, 70, 0, 0x35382c, 'saito', 15679);
    DA(OTE.x, OTE.z - 16, 18, 6, 90, 0, 0x3a3a30, 'saito', 15680);
    DA(34, -122, 10, 6, 50, -0.4, 0x35382c, 'saito', 15681);
    for (const [x, z] of [[-24, -90], [22, -86], [OTE.x - 14, OTE.z - 12], [36, -116]]) rt.scene.add(nobori(W, x, z, 'saito', 6));
    // 井口の町の奥へ続く家並み（遠景）。焼き討ちが進むと、こちらにも煙が上がる
    F.farTown = [village(W, 40, 142, { n: 7, r: 26, rot: Math.PI, fields: 4, seed: 67, smoke: 0 }), village(W, -30, 130, { n: 6, r: 22, rot: Math.PI, fields: 4, seed: 68, smoke: 0 })];
    for (const v of F.farTown) rt.scene.add(v);
    for (const [x, z] of [[46, 110], [60, 104]]) { rt.scene.add(campfire(W, x, z)); W.addFire(x, z); }

    applyLook(rt, DAWN);
    rt.setPhase('brief');
    rt.obj('main', hi(rt) ? '木下藤吉郎の手の一隊を率い、井口の町へ入れ' : '木下藤吉郎の手について、井口の町へ入れ', 'main');
    rt.say('木下藤吉郎', `${nm(rt)}、来たか。夜の明けぬうちに、城下の井口の町に火をかける`, 4.5);
    rt.say('木下藤吉郎', '城から町へ逃げ込む道を断つのじゃ。……松明の支度をせい', 4);
    // 印の藤吉郎に寄って話を聞けば、すぐに次へ（寄らなくても下知は来る）
    rt.marker('kino', unitPos(F.kinoU), '木下藤吉郎（話を聞く）', {});
    rt.addInteract('talk', { x: 28, z: 104 }, '藤吉郎の話を聞く', () => {
      rt.uninteract('talk');
      rt.say('木下藤吉郎', 'よし、行くぞ。わしの手から離れるな', 2.5);
      rt.after(2.5, () => this.burnStart(rt));
    }, { r: 5 });
    rt.after(16, () => this.burnStart(rt));
  },

  // ① 城下に火を放つ
  burnStart(rt) {
    const F = rt.flags;
    if (F.step >= 1) return;
    F.step = 1; F.stepT = rt.t;
    rt.setPhase('burn');
    sfx('horagai', 0.9);
    rt.unmark('kino'); rt.uninteract('talk');
    rt.banner('井口の町を焼け', '城下を焼いて、城を裸にする');
    // 信長で遊ぶ時：火付けは足軽の役目。当主は町の番の兵を払わせ、焼き働きを見届ける
    rt.obj('main', rt.G.lord ? `足軽に町を焼かせ、町の番の兵を払え（${NEED}軒）` : `印の家に火を放て（${NEED}軒）`, 'main');
    rt.obj('side', '手向かわぬ町の者は討たない', 'side');
    rt.say('木下藤吉郎', '松明を持て！　印の家に火を放て。手向かう者だけを相手にせよ', 3.5);
    // 家の印は近い二軒だけ（残りは近づくと出る。update の markHouses）
    if (rt.G.lord) F.houses.filter((q) => q.mine).forEach((h, k) => rt.after(8 + k * 6, () => this.light(rt, h)));
    else for (const h of F.houses.filter((q) => q.mine)) rt.addInteract('h' + h.i, { x: h.x, z: h.z + 3 }, '家に火を放つ', () => this.light(rt, h), { r: 4, hold: 1.4 });
    this.markHouses(rt);
    const go = (g, x, z) => { g.order = 'move'; g.dest = { x, z }; g.speed = 2.4; g.onArrive = (gg) => { gg.order = 'hold'; gg.anchor = { x, z }; gg.aggro = 12; }; };
    go(F.kino, 22, 76); go(F.shiba, 40, 62); go(F.niwa, 0, 90);
    rt.marker('town', centerOf(F.town), () => `町の番の兵・${moraleWord(F.town.morale)}`, { red: true, group: F.town });
    // 味方もほかの家に火を放っていく
    // 松明を持った足軽が家に寄ってから火が上がる
    F.houses.filter((h) => !h.mine).forEach((h, k) => rt.after(14 + k * 9, () => this.sendTorch(rt, h)));
    rt.after(40, () => { for (const [x, z, sz] of [[34, 146, 2.6], [-26, 128, 2.4]]) rt.world.addSmokeColumn(x, rt.world.heightAt(x, z) + 5, z, { size: sz }); });
    // 町の者が逃げていく（戦わない。討てば下知違反）
    F.civ = [];
    const civ = (x, z, n2) => {
      const c = enemyGroup(rt, { faction: 'saito', name: '逃げる町の者', anchor: { x, z }, facing: 0, width: 4, aggro: 0, morale: 0, fleeDir: { x: -0.6, z: -0.4 }, speed: 2.6 },
        // 町の者：色のある小袖の女・子、荷を背負った男（兵の暗い具足の色にしない）
        [{ type: 'porter', n: n2, o: { flag: null, hat: 'none', armor: [0x7a4a3c, 0x5a5a7a, 0x8a7050, 0x6a4a5a][n2 % 4], lace: 0x9a8a70, cloth: [0x9a6a58, 0x6e7896, 0xa08a60, 0x86607a][(n2 + 1) % 4], haori: null, mon: null } }]);
      c.routed = true; c.order = 'flee'; c.civ = true;
      for (const u of c.units) { u.fleeing = true; u.noTarget = true; u.dmg = 0; }
      F.civ.push(c);
    };
    rt.after(6, () => { civ(-4, 60, 4); civ(20, 46, 3); });
    // 城から町の番の加勢が駆け下りてくる
    rt.after(18, () => {
      if (F.step !== 1) return;
      F.town2 = enemyGroup(rt, { faction: 'saito', name: '城から下りた斎藤勢', anchor: { x: 2, z: 6 }, facing: 0, order: 'attack', seekRange: 70, aggro: 14, width: 10, morale: 85, fleeDir: { x: 0, z: -1 }, dmgMult: 0.7 },
        [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 10 }, { type: 'bow', n: 2 }]);
      rt.army.play('eshout', { x: 2, z: 10 }, 1.5);
      rt.say('足軽', '城の方から斎藤の兵が駆け下りてくる！', 3);
      rt.marker('town2', centerOf(F.town2), () => `城から下りた斎藤勢・${moraleWord(F.town2.morale)}`, { red: true, group: F.town2 });
    });
  },

  markHouses(rt) {
    const F = rt.flags, p = rt.player.u.pos;
    const left = F.houses.filter((q) => q.mine && !q.burnt).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
    const want = F.lit >= NEED ? [] : left.slice(0, 2);
    for (const q of F.houses) if (q.mine && !want.includes(q)) rt.unmark('h' + q.i);
    for (const q of want) if (!rt.markers.some((m) => m.id === 'h' + q.i)) rt.marker('h' + q.i, { x: q.x, z: q.z }, '火を放つ', { h: 3 });
  },
  // 味方の足軽が松明を持って家に寄り、着いてから火が上がる
  sendTorch(rt, h) {
    const F = rt.flags;
    if (h.burnt || F.ending) return;
    // 火付けの足軽は一組だけを使い回す（家ごとに組を作らない）
    if (!F.torchG) { const c = F.kino.center(); F.torchG = allyGroup(rt, { name: '火付けの足軽', anchor: { x: c.x + 2, z: c.z + 2 }, facing: Math.PI, width: 2, aggro: 0, noRout: true }, dress([{ type: 'ashigaru', n: 2, o: { weapon: 'none' } }], ODA)); }
    const g = F.torchG;
    g.order = 'move'; g.dest = { x: h.x + 2, z: h.z + 3 }; g.speed = 3;
    g.onArrive = (gg) => { gg.order = 'hold'; gg.anchor = { x: h.x + 2, z: h.z + 3 }; rt.after(1.2, () => burnHouse(rt, h)); };
    rt.after(25, () => burnHouse(rt, h));   // 道が詰まっても、しばらくすれば燃える
  },
  // 一つの任務札の段が済んだ事を二秒見せてから、次の札に替える
  nextObj(rt, text) {
    rt.objDone('main');
    rt.after(2, () => { if (!rt.flags.ending) rt.obj('main', text, 'main'); });
  },

  light(rt, h) {
    const F = rt.flags;
    if (h.burnt) return;
    burnHouse(rt, h);
    rt.uninteract('h' + h.i); rt.unmark('h' + h.i);
    F.lit++;
    if (!rt.G.lord) rt.award((t) => { t.special = { label: '城下に火を放った', pts: 4 * F.lit }; }, '家に火を放った');
    if (F.lit >= NEED) {
      rt.objDone('main');
      for (const q of F.houses.filter((x) => x.mine && !x.burnt)) { rt.uninteract('h' + q.i); rt.unmark('h' + q.i); rt.after(4 + q.i, () => burnHouse(rt, q)); }
      rt.say('木下藤吉郎', 'ようし、町は燃えた。……あとは町に残る斎藤の兵を追い払え！', 3.5);
      // 町の斎藤の兵を追い払うまで（長くかかれば、次へ）
      F.clearT = rt.t;
      rt.after(2, () => rt.obj('main', '町に残る斎藤の兵を追い払え', 'main'));
    } else { rt.objProgress('main', `${F.lit}／${NEED}軒`); this.markHouses(rt); }
  },

  // ② 大手口から打って出た斎藤勢を退ける
  sally(rt) {
    const F = rt.flags;
    if (F.step >= 2) return;
    F.step = 2; F.stepT = rt.t;
    rt.setPhase('ote');
    rt.unmark('town'); rt.unmark('town2');
    for (const q of [F.town, F.town2]) if (q && !gone(q)) { q.noRout = false; q.morale = Math.min(q.morale, 20); }
    rt.world.setTime('morning');
    sfx('taiko', 1);
    rt.banner('夜が明ける', '城のまわりに鹿垣を結い、囲みにかかる');
    this.nextObj(rt, '鹿垣を結い、城兵の打って出に備えよ');
    // 焼き討ちが済んだので、「町の者は討たない」を済にして畳む
    if (!F.civHurt && !F.civDone) { F.civDone = true; rt.objDone('side'); rt.award((t) => t.side.push('町の者を討たなかった'), '副任務：町の者を討たなかった'); rt.after(4, () => rt.objRemove('side')); }
    // 足軽が鹿垣（木の枝を組んだ低い柵）を一間ずつ結っていく
    for (let i = 0; i < 8; i++) rt.after(3 + i * 1.6, () => {
      if (F.step !== 2) return;
      const x = -30 + i * 7.5;
      rt.scene.add(palisade(rt.world, [x, -26 + Math.sin(i) * 1.2, x + 7, -26 + Math.sin(i + 1) * 1.2], { h: 1.5 }));
      rt.army.play('knock', { x: x + 3.5, z: -26 }, 0.6);
    });
    F.ote = enemyGroup(rt, { faction: 'saito', name: '大手の斎藤勢', anchor: { x: OTE.x, z: OTE.z - 8 }, facing: 0, order: 'hold', aggro: 12, width: 12, morale: 95, fleeDir: { x: 0, z: -1 }, dmgMult: 0.72, formation: 'yari' },
      [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 18 }, { type: 'bow', n: 4 }, { type: 'gun', n: 2 }]);
    for (const u of F.ote.units) if (u.type === 'gun') u.dmg *= 0.5;
    const go = (g, x, z) => { g.order = 'move'; g.dest = { x, z }; g.speed = 2.4; g.onArrive = (gg) => { gg.order = 'hold'; gg.anchor = { x, z }; gg.aggro = 14; }; };
    go(F.kino, -4, -18); go(F.shiba, 14, -24); go(F.niwa, -18, -12);
    // 鹿垣の内の鉄砲（永禄のころは鉄砲がまだ少ない。四挺だけ）
    F.nGun = allyGroup(rt, { name: '丹羽の鉄砲衆', anchor: { x: 2, z: 112 }, facing: Math.PI, width: 8, aggro: 4, noRout: true }, dress([{ type: 'gun', n: 4 }], ODA));
    go(F.nGun, 4, -20);
    rt.say('木下藤吉郎', '大手の木戸の前で鹿垣を結うぞ。斎藤の兵が打って出てくる、受け止めよ！', 4);
    rt.after(6, () => { if (F.step === 2) rt.say('丹羽長秀', '鹿垣の内から出るな。寄せた所を鉄砲で崩す。崩れてから突け', 4); });
    rt.after(16, () => {
      if (F.step !== 2) return;
      F.ote.order = 'attack'; F.ote.seekRange = 70;
      rt.obj('main', '大手口から打って出た斎藤勢を退けよ', 'main');
      rt.army.play('eshout', { x: OTE.x, z: OTE.z }, 1.6);
      rt.say('斎藤方の侍', '町を焼いた織田の者どもを追い落とせ！', 3);
      rt.marker('ote', centerOf(F.ote), () => `大手の斎藤勢・${moraleWord(F.ote.morale)}`, { red: true, group: F.ote });
      // 打って出る兵は数人でなく、木戸の内に城兵が詰めて続く（軽い作り）
      KIT.backOf(rt, F.ote, { flag: 'saito', armor: 0x33302a, kind: 'spear', w: 14, depth: 8, count: 110, seed: 15679 });
    });
    // 木戸の内から新手（前の勢が崩れて 5 秒後か、58 秒たった時）
    rt.after(58, () => this.ote2(rt));
  },
  ote2(rt) {
    const F = rt.flags;
    {
      if (F.step !== 2 || F.ote2) return;
      F.ote2 = enemyGroup(rt, { faction: 'saito', name: '大手の新手', anchor: { x: OTE.x + 4, z: OTE.z - 10 }, facing: 0, order: 'attack', seekRange: 80, aggro: 14, width: 10, morale: 90, fleeDir: { x: 0, z: -1 }, dmgMult: 0.7 },
        [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 12 }, { type: 'bow', n: 2 }]);
      rt.army.play('eshout', { x: OTE.x, z: OTE.z }, 1.4);
      rt.say('足軽', '木戸から新手が出てくるぞ！', 3);
      rt.marker('ote2', centerOf(F.ote2), () => `大手の新手・${moraleWord(F.ote2.morale)}`, { red: true, group: F.ote2 });
    }
  },

  // ③ 搦手の道を登る
  karamete(rt, late = false) {
    const F = rt.flags;
    if (F.step >= 3) return;
    F.step = 3; F.stepT = rt.t;
    rt.setPhase('karamete');
    rt.unmark('ote'); rt.unmark('ote2');
    for (const q of [F.ote, F.ote2]) if (q && !gone(q)) { q.noRout = false; q.morale = Math.min(q.morale, 15); }
    // 時間切れで先へ進んだ時は手柄に入れない
    if (!late) rt.award((t) => t.side.push('大手の打って出を退けた'), '大手の斎藤勢を退けた');
    rt.banner('搦手へ', '山の裏の道を、藤吉郎の手が登る');
    rt.say('木下藤吉郎', '大手は固い。……じゃが、山の裏に細い道があると、この辺りの者に聞いた', 4.5);
    rt.say('木下藤吉郎', `${nm(rt)}、ついて来い。わしらは裏から登って、本丸の脇に火をつける`, 4);
    this.nextObj(rt, '搦手の道を登り、木戸へ（藤吉郎について）');
    // 大手に残るか、搦手へ行くか
    rt.after(9, () => { if (F.step === 3 && !F.guardOn) rt.choose('藤吉郎について搦手へ行くか、大手に残るか', [{ label: '搦手へ行く', note: '藤吉郎の手と裏の道を登り、本丸に火を放つ' }, { label: '大手に残る', note: '柴田の手と大手の木戸を押さえ、城兵を引き付ける' }], (i) => { if (i === 1) this.stayOte(rt); }, 15); });
    const K = F.kino;
    K.order = 'path'; K.path = KARA.slice(0, -1); K.pathIdx = 0; K.speed = 2.5; K.formation = 'column'; K.aggro = 6;
    K.onArrive = (g) => { g.order = 'hold'; g.anchor = { x: KARA[KARA.length - 2][0], z: KARA[KARA.length - 2][1] }; g.formation = 'line'; g.aggro = 14; };
    // 印は進み具合と同じ的（搦手の木戸）に。藤吉郎の名札は頭の上に出る
    rt.marker('kido', { x: -30, z: -118 }, '搦手の木戸', { h: 3 });
    F.climbSpots = 0;
    // 大手には柴田・丹羽が残って押さえる
    for (const g of [F.shiba, F.niwa]) { g.order = 'hold'; g.anchor = { x: g === F.shiba ? 10 : -10, z: -30 }; }
    // 搦手の木戸の守り
    F.kguard = enemyGroup(rt, { faction: 'saito', name: '搦手の守り', anchor: { x: -30, z: -118 }, facing: -Math.PI / 2, order: 'hold', aggro: 14, width: 8, morale: 90, fleeDir: { x: 1, z: 0 }, dmgMult: 0.7, formation: 'yari' },
      [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 9 }, { type: 'gun', n: 2 }]);
    for (const u of F.kguard.units) if (u.type === 'gun') u.dmg *= 0.5;
  },

  // 搦手の登りの途中の出来事：岩場の足止め、藤吉郎の小声、物見との小競り合い
  climbEvents(rt) {
    const F = rt.flags, p = rt.player.u.pos;
    const near = (i, r) => Math.hypot(p.x - KARA[i][0], p.z - KARA[i][1]) < r;
    if (F.climbSpots === 0 && near(1, 9)) {
      F.climbSpots = 1;
      rt.say('木下藤吉郎', '（小声で）ここから岩場じゃ。手をついて登れ。音を立てるなよ', 3.5);
      F.kino.speed = 1.3; rt.after(10, () => { if (F.kino) F.kino.speed = 2.5; });
      rt.army.play('knock', { x: KARA[1][0], z: KARA[1][1] }, 0.5);
    } else if (F.climbSpots === 1 && near(2, 12)) {
      F.climbSpots = 2;
      // 斎藤の物見が二人。見つかれば声を上げられる前に討て
      F.scout = enemyGroup(rt, { faction: 'saito', name: '斎藤の物見', anchor: { x: KARA[2][0] + 4, z: KARA[2][1] - 10 }, facing: 0.4, order: 'attack', seekRange: 30, aggro: 10, width: 2, morale: 70, fleeDir: { x: 0.4, z: -1 }, dmgMult: 0.6 },
        [{ type: 'ashigaru', n: 2 }]);
      rt.say('足軽', '物見じゃ！　声を上げさせるな！', 2.5);
      rt.marker('scout', centerOf(F.scout), '物見', { red: true, group: F.scout });
    } else if (F.climbSpots === 2 && near(3, 10)) {
      F.climbSpots = 3;
      rt.unmark('scout');
      rt.say('木下藤吉郎', '（小声で）あの木戸を抜ければ本丸の裏じゃ。……一気に行くぞ', 3.5);
    }
  },
  // 大手に残る：柴田の手と木戸を押さえ、城兵を引き付ける。藤吉郎の合図の火が上がれば勝ち
  stayOte(rt) {
    const F = rt.flags;
    F.stayOte = true;
    rt.unmark('kido');
    rt.say('柴田勝家', '大手に残るか。よし、木戸の前で斎藤の兵を引き付けよ。猿めが裏から火を放つまでじゃ', 4.5);
    this.nextObj(rt, '大手の木戸の前を押さえ、城兵を引き付けよ');
    rt.zone('ote', OTE.x, OTE.z + 22, 12);
    for (const g of [F.shiba, F.niwa]) { g.order = 'hold'; g.anchor = { x: g === F.shiba ? 8 : -8, z: OTE.z + 24 }; }
    rt.after(10, () => {
      if (F.ending) return;
      F.ote3 = enemyGroup(rt, { faction: 'saito', name: '大手の城兵', anchor: { x: OTE.x, z: OTE.z - 6 }, facing: 0, order: 'attack', seekRange: 60, aggro: 14, width: 10, morale: 90, fleeDir: { x: 0, z: -1 }, dmgMult: 0.7 },
        [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 12 }, { type: 'bow', n: 2 }]);
      rt.army.play('eshout', { x: OTE.x, z: OTE.z }, 1.6);
      rt.marker('ote3', centerOf(F.ote3), () => `大手の城兵・${moraleWord(F.ote3.morale)}`, { red: true, group: F.ote3 });
    });
    // 城兵の二の手（先の兵を崩した後も、木戸の前が空かないように）
    const ote4 = () => {
      if (F.ending || F.ote4) return;
      F.ote4 = enemyGroup(rt, { faction: 'saito', name: '大手の二の手', anchor: { x: OTE.x + 6, z: OTE.z - 8 }, facing: 0, order: 'attack', seekRange: 60, aggro: 14, width: 10, morale: 85, fleeDir: { x: 0, z: -1 }, dmgMult: 0.6 },
        [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 10 }]);
      rt.army.play('eshout', { x: OTE.x, z: OTE.z }, 1.4);
      rt.say('柴田勝家', '木戸がまた開いたぞ！　二の手じゃ、ここで食い止めよ', 3);
      rt.marker('ote4', centerOf(F.ote4), () => `大手の二の手・${moraleWord(F.ote4.morale)}`, { red: true, group: F.ote4 });
    };
    F.ote4Go = ote4;
    rt.after(42, ote4);
    // 藤吉郎の手は自分で登り、しばらくして本丸に火を放つ
    rt.after(85, () => {
      if (F.ending) return;
      F.sig = { x: HON.x + 7, z: HON.z + 6 };
      F.otePart = true;
      rt.world.addSmokeColumn(F.sig.x, rt.world.heightAt(F.sig.x, F.sig.z) + 6, F.sig.z, { size: 3 });
      rt.say('柴田勝家', '見よ、本丸から煙じゃ！　藤吉郎め、ようやりおったわ', 3.5);
      rt.unzone('ote'); rt.unmark('ote3'); rt.unmark('ote4');
      for (const q of [F.ote3, F.ote4]) if (q && !gone(q)) { q.noRout = false; q.morale = 0; }
      this.deep(rt, 'C', () => this.win(rt, false, true));
    });
  },

  // 搦手の守りとぶつかる
  guardFight(rt) {
    const F = rt.flags;
    if (F.guardOn) return;
    F.guardOn = true;
    rt.unmark('kido');
    this.nextObj(rt, '搦手の守りを破れ');
    F.kguard.order = 'attack'; F.kguard.seekRange = 40;
    F.kino.order = 'attack'; F.kino.seekRange = 40;
    rt.army.play('eshout', { x: -30, z: -118 }, 1.4);
    rt.say('斎藤方の足軽', '裏から来たぞ！　こんな所まで……！', 3);
    rt.marker('kguard', centerOf(F.kguard), () => `搦手の守り・${moraleWord(F.kguard.morale)}`, { red: true, group: F.kguard });
  },

  // ④ 本丸の脇に火を放つ
  signal(rt) {
    const F = rt.flags;
    if (F.step >= 4) return;
    F.step = 4; F.stepT = rt.t;
    rt.setPhase('honmaru');
    rt.unmark('kguard');
    rt.award((t) => t.side.push('搦手の木戸を破った'), '搦手の守りを破った');
    rt.say('木下藤吉郎', '入ったぞ！　本丸の旗本を退けて、脇の小屋に火を放て。瑞龍寺山の殿への合図じゃ', 4);
    this.nextObj(rt, '本丸の旗本を退けよ');
    F.kino.order = 'attack'; F.kino.seekRange = 40; F.kino.formation = 'line';
    // 本丸の旗本（二手。御殿の前と、奥から）
    const mk = (x, z, name, list) => {
      const g = enemyGroup(rt, { faction: 'saito', name, anchor: { x, z }, facing: -Math.PI / 2, order: 'attack', seekRange: 40, aggro: 14, width: 8, morale: 90, fleeDir: { x: 0.4, z: -1 }, dmgMult: 0.6 }, list);
      rt.marker(name, centerOf(g), () => `${name}・${moraleWord(g.morale)}`, { red: true, group: g });
      return g;
    };
    F.hata = [mk(HON.x + 6, HON.z - 2, '本丸の旗本', [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 8 }])];
    // 本丸には城兵が詰めている（軽い作り。踏み込めば本物の兵に替わる）
    KIT.backOf(rt, F.hata[0], { flag: 'saito', armor: 0x33302a, kind: 'spear', w: 12, depth: 6, count: 90, seed: 15690 });
    // 二の丸の道を塞がなかった時：後ろから斎藤勢が上がってきて挟まれる
    if (F.dpMem && F.dpMem.block === false) rt.after(12, () => {
      if (F.ending) return;
      F.hata.push(mk(-34, -104, '二の丸から上がった斎藤勢', [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 10 }]));
      rt.army.play('eshout', { x: -34, z: -104 }, 1.4);
      rt.say('足軽', '後ろじゃ！　二の丸の兵が上がってきた、挟まれるぞ！', 3);
    });
    rt.after(24, () => { if (!F.ending) { F.hata.push(mk(HON.x + 8, HON.z - 10, '御殿から出た旗本', [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 8 }])); rt.say('斎藤方の侍', 'お屋形様の御座所に近づけるな！', 3); } });
  },
  // 旗本を退けたら、合図の火
  lightSig(rt) {
    const F = rt.flags;
    if (F.sig) return;
    for (const n2 of ['本丸の旗本', '御殿から出た旗本', '二の丸から上がった斎藤勢']) rt.unmark(n2);
    const S = { x: HON.x + 7, z: HON.z + 6 };
    F.sig = S; F.sigT = rt.t;
    this.nextObj(rt, '本丸の脇の小屋に火を放ち、瑞龍寺山の殿へ合図を送れ');
    rt.say('木下藤吉郎', '今じゃ、火を放て！', 2.5);
    rt.marker('sig', S, '火を放つ', { h: 3 });
    rt.addInteract('sig', { x: S.x - 4, z: S.z }, '小屋に火を放つ（合図）', () => this.win(rt), { r: 4, hold: 1.6 });
  },

  // 段を重ねる（b_depth.js）：A 大手の打って出を退けた後 ／ B 搦手の木戸を破った後 ／ C 大手に残って、本丸の煙が上がった後
  deep(rt, which, then) {
    const F = rt.flags;
    if (F['dp' + which]) return;
    F['dp' + which] = true;
    if (rt.G.lord) { then(); return; }
    F.dpOn = true;
    depthStart(rt, inaCtx(rt, which), which === 'T' ? inaT() : which === 'A' ? inaA() : which === 'B' ? inaB() : inaC(), () => { F.dpOn = false; rt.after(3, () => { const q = rt.objectives.find((x) => x.id === 'dp'); if (q && q.state) rt.objRemove('dp'); }); then(); });
  },

  win(rt, late = false, stayed = false) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.uninteract('sig'); rt.unmark('sig');
    const S = F.sig || { x: HON.x + 7, z: HON.z + 6 };
    rt.world.addFire(S.x, S.z, { h: 1.6 });
    rt.world.addSmokeColumn(S.x, rt.world.heightAt(S.x, S.z) + 6, S.z, { size: 3 });
    rt.objDone('main');
    rt.tracker.main = true;
    // 時間切れでほかの者が火を付けた時は、手柄にしない。大手に残った時は大手を押さえた手柄
    if (stayed) rt.award((t) => { t.main = true; t.special = { label: '大手を押さえ、城兵を引き付けた', pts: 12 }; }, '任務達成・大手を押さえた');
    else if (late) rt.award((t) => { t.main = true; }, '任務達成（合図の火はほかの者が付けた）');
    else rt.award((t) => { t.main = true; t.special = { label: '搦手から本丸に火を放った', pts: 20 }; }, '任務達成・本丸に合図の火');
    if (!F.civHurt) { rt.objDone('side'); rt.award((t) => t.side.push('町の者を討たなかった'), '副任務：町の者を討たなかった'); }
    rt.unzone('ote'); rt.unmark('ote3');
    for (const q of [...(F.hata || []), F.kguard, F.ote, F.ote2, F.ote3, F.scout]) if (q && !gone(q)) { q.noRout = false; q.morale = 0; }
    sfx('horagai', 0.8); rt.after(1, () => sfx('toki', 0.8));
    rt.banner('稲葉山城、落ちる', '斎藤龍興は城を明け渡し、長良川を舟で下った');
    if (!stayed) rt.say('木下藤吉郎', late ? '……ほかの者が火を付けたか。まあよい、合図は届いた' : `やったぞ、${nm(rt)}！　瑞龍寺山の殿の本陣から鬨の声じゃ`, 4);
    // 合図を見て、大手の大軍が押し出す。鬨の声は大手の方から
    for (const a of F.otePush || []) if (a.advance) a.advance(30, 12, { charge: true });
    rt.army.play('eshout', { x: OTE.x, z: OTE.z + 20 }, 2);
    rt.after(5, () => rt.say('', '――信長は井口を「岐阜」と改め、この山の城を新しい居城とした', 5));
    rt.player.u.invuln = true;
    rt.finish({}, 11);
  },

  update(rt, dt) {
    const F = rt.flags;
    // 崩れた隊の印は消す（古い印が「あちらじゃ」の行き先にならないように）
    for (const m of rt.markers.slice()) if (m.group && gone(m.group)) rt.unmark(m.id);
    KIT.backTick(rt);
    if (F.ending) return;
    if (F.dpOn) { depthTick(rt, dt); return; }
    if (F.step === 1) {
      if (F.lit < NEED) rt.objProgress('main', `${F.lit}／${NEED}軒`);
      if (rt.t > (F.mhT || 0)) { F.mhT = rt.t + 1; if (F.lit < NEED) this.markHouses(rt); }
      if (rt.t > (F.dawnT || 0) && !F.dawnDone) { F.dawnT = rt.t + 4; const k = Math.min(1, (rt.t - F.stepT) / 100); applyLook(rt, mixLook(DAWN, DAWN2, k), k >= 1); if (k >= 1) F.dawnDone = true; }
      // 火を放ちに来ない時は、藤吉郎がやり方を言う（一度だけ）
      if (rt.t - F.stepT > 45 && F.lit < NEED && !F.burnCall) { F.burnCall = true; rt.say('木下藤吉郎', `${nm(rt)}、印の家の前で「家に火を放つ」を長く押せ。松明はもう持っておる`, 4); }
      // 長くかかりすぎたら、味方が残りに火を放つ
      if (rt.t - F.stepT > 130 && F.lit < NEED) {
        for (const h of F.houses.filter((q) => q.mine && !q.burnt)) { rt.uninteract('h' + h.i); rt.unmark('h' + h.i); burnHouse(rt, h); }
        F.lit = NEED;
        rt.objFail('main');
        rt.say('木下藤吉郎', '町はほかの者が焼いた。よい、次は大手へまわれ', 3.5);
        rt.after(5, () => this.sally(rt));
      }
    }
    if (F.step === 2) {
      const qs = [F.ote, F.ote2].filter(Boolean);
      rt.objProgress('main', `斎藤勢 ${qs.reduce((s, q) => s + (gone(q) ? 0 : q.count), 0)}人`);
      for (const q of qs) if (q.count < 5 && !gone(q)) q.morale = Math.min(q.morale, 25);
      // 前の勢が崩れたら、5 秒後に新手
      volleyWatch(rt, 'ote', { guns: () => F.nGun, foes: () => qs, r: 26, who: '丹羽長秀', line: '鹿垣まで引きつけた……鉄砲、放て！', sub: '鹿垣の内から、丹羽の鉄砲衆' });
      if (gone(F.ote) && !F.ote2 && !F.ote2Q) { F.ote2Q = true; rt.after(5, () => this.ote2(rt)); }
      if ((F.ote2 && qs.every(gone)) || rt.t - F.stepT > 160) {
        const late = !(F.ote2 && qs.every(gone));
        rt.unmark('ote'); rt.unmark('ote2');
        for (const q of qs) if (!gone(q)) { q.noRout = false; q.morale = 0; }
        if (!late) rt.objDone('main');
        this.deep(rt, 'A', () => this.karamete(rt, late));
      }
    }
    if (F.step === 3 && F.stayOte) {
      const oq = [F.ote3, F.ote4].filter(Boolean);
      rt.objProgress('main', oq.length ? `大手の城兵 ${oq.reduce((a, q) => a + (gone(q) ? 0 : q.count), 0)}人` : '');
      if (F.ote3 && gone(F.ote3) && !F.ote4) F.ote4Go();   // 先の城兵を早く崩した時は、二の手をすぐ出す
    } else if (F.step === 3) {
      const p = rt.player.u.pos;
      const kd = Math.hypot(p.x + 30, p.z + 118);
      if (!F.guardOn) rt.objProgress('main', `搦手の木戸まで ${Math.max(0, Math.round(kd))}m`);
      else rt.objProgress('main', `守り ${F.kguard.count}人`);
      const kc = F.kino.center();
      if (!F.guardOn && !F.stayOte) this.climbEvents(rt);
      if (!F.guardOn && (kd < 30 || Math.hypot(kc.x + 30, kc.z + 118) < 26)) this.guardFight(rt);
      if (F.guardOn && (gone(F.kguard) || F.kguard.count < 3)) { if (!gone(F.kguard)) F.kguard.morale = 0; rt.unmark('kguard'); this.deep(rt, 'B', () => this.signal(rt)); }
      // 長くかかりすぎたとき
      if (rt.t - F.stepT > 200 && !F.guardOn) this.guardFight(rt);
    }
    if (F.step === 1 && F.clearT !== undefined) {
      const qs = [F.town, F.town2].filter(Boolean);
      rt.objProgress('main', `斎藤の兵 ${qs.reduce((a, q) => a + (gone(q) ? 0 : q.count), 0)}人`);
      for (const q of qs) if (q.count < 4 && !gone(q)) q.morale = Math.min(q.morale, 20);
      if ((F.town2 && qs.every(gone)) || rt.t - F.clearT > 70) {
        F.clearT = undefined; F.step = 1.5;
        rt.unmark('town'); rt.unmark('town2');
        for (const q of qs) if (!gone(q)) { q.noRout = false; q.morale = 0; }
        rt.objDone('main');
        this.deep(rt, 'T', () => this.sally(rt));
      }
    }
    if (F.step === 4 && F.hata) {
      for (const q of F.hata) if (q.count < 4 && !gone(q)) q.morale = Math.min(q.morale, 20);
      if (!F.sig && ((F.hata.length >= 2 && F.hata.every(gone)) || rt.t - F.stepT > 130)) this.lightSig(rt);
      // 合図の火を放ちに来ない時：藤吉郎が呼び、それでも来なければほかの者が火を付ける
      if (F.sig && rt.t - F.sigT > 20 && !F.sigCall) { F.sigCall = true; rt.say('木下藤吉郎', `${nm(rt)}、印の小屋じゃ！　前に立って「小屋に火を放つ」を長く押せ`, 4); }
      if (rt.t - F.stepT > 170 || (F.sig && rt.t - F.sigT > 50)) this.win(rt, true);
    }
  },

  onKill(rt, v, k) {
    const F = rt.flags;
    if (v.group && v.group.civ) {
      if (k && k.isPlayer && !F.civHurt) {
        F.civHurt = true;
        rt.objFail('side');
        rt.violation('逃げる町の者を討った', ['木下藤吉郎', '町の者に手を出すな！　焼くのは家じゃ、人ではない']);
      }
      return;
    }
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
  },
  onRout(rt, g) {
    if (g.team !== 1 || g.civ || rt.t < (rt.flags.routSayT || 0)) return;
    rt.flags.routSayT = rt.t + 9;
    rt.say('足軽', `${g.name}が山へ逃げていく！`, 2.5);
  },
};

// ---------------- 一つの戦を濃くする段（b_depth.js） ----------------
// 山城の攻め：斎藤の城兵は七曲りの大手から、後ろに数百の城兵を連ねてどっと打って出る。山の曲輪からも次々に新手
const uS = (n) => ({ type: 'samurai', n }), uA = (n) => ({ type: 'ashigaru', n }), uB = (n) => ({ type: 'bow', n });
const bowLine = (name, from, n, o = {}) => ({ name, from, list: [uS(1), uB(n)], formation: 'line', seek: 70, mass: 70, dmg: 0.45, ...o });
function inaCtx(rt, which) {
  const F = rt.flags;
  const fr = which === 'A' ? () => [F.kino, F.shiba, F.niwa] : which === 'B' ? () => [F.kino] : () => [F.shiba, F.niwa];
  return { faction: 'saito', flag: 'saito', armor: 0x33302a, dmg: 0.6, mass: 220,
    friends: () => fr().filter((g) => g && g.count && !g.routed),
    ring: which === 'B' ? { x: HON.x, z: HON.z, r: 17.5, gap: GAP_A } : null, botSteer: oteSteer,
    aid: { name: which === 'B' ? '藤吉郎の手の後続' : '柴田の手の一組', faction: 'oda', flag: 'oda', list: [uS(1), uA(9)] }, aidSaid: which === 'B' ? '藤吉郎の手の後続が登ってきた' : '柴田の手から一組が加わった' };
}
// bot が大手の木戸の左右の柵に突っかからないように：柵の線を越える時は、木戸の口へ回る
function oteSteer(b, inp) {
  if (!inp.k.has('KeyW')) return;
  const p = b.player, u = p.u, fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
  const ax = u.pos.x + fx * 3, az = u.pos.z + fz * 3;
  if (Math.abs(u.pos.x - OTE.x) < 3 || Math.abs(u.pos.x - OTE.x) > 27 || Math.abs(ax - OTE.x) < 3) return;
  const wz = OTE.z + (Math.min(26, Math.abs(u.pos.x - OTE.x)) - 4) / 22 * 6;
  if (u.pos.z > wz + 0.3 && az < wz + 1.5) p.yaw = Math.atan2(OTE.x - u.pos.x, OTE.z + 4 - u.pos.z);
  else if (u.pos.z < wz - 0.3 && az > wz - 1.5) p.yaw = Math.atan2(OTE.x - u.pos.x, OTE.z - 4 - u.pos.z);
}
// T 町を焼いた後：町の北の出口に、城から駆け下りた斎藤勢が大勢で固まる
function inaT() {
  return [
    fight({ at: { x: 6, z: 28 }, title: '町の北の出口', sub: '城から駆け下りた斎藤勢が、焼けた町の出口を固める', obj: (rt) => (hi(rt) ? '預かった一隊を率いて、町の北の出口の斎藤勢を崩せ' : '町の北の出口の斎藤勢を崩せ'),
      say: [['木下藤吉郎', '出口を塞がれては、大手へ寄れぬ。……西から美濃三人衆の兵が来る。それまで押し負けるな！', 4.5]],
      foes: () => [{ name: '出口を固める斎藤勢', from: { x: 2, z: 2 }, list: [uS(2), uA(12)], mass: 300, noRout: 15 }],
      later: [
        { t: 32, say: ['足軽', '長良川の方から回ってくる！'], foes: () => [{ name: '川の方から回る斎藤勢', from: { x: -46, z: 16 }, list: [uS(1), uA(10), uB(3)], mass: 220 }] },
        { t: 58, title: '美濃三人衆', sub: '稲葉一鉄の兵が、西から斎藤勢の横を突く', say: ['稲葉一鉄', '斎藤の者ども、美濃はもう龍興殿のものではないわ！'], foes: () => [] },
      ],
      max: 120, reward: '町の北の出口を押し通った',
      onEnd: (rt) => { const F = rt.flags; if (!F.inaba) { F.inaba = allyGroup(rt, { name: '稲葉一鉄の手', anchor: { x: -30, z: 20 }, facing: Math.PI / 2, width: 12, aggro: 10, noRout: true }, dress([{ type: 'samurai', n: 1, o: { name: '稲葉一鉄', invuln: true, hat: 'kabuto_m' } }, { type: 'ashigaru', n: 10 }], { flag: 'inaba' })); F.inaba.order = 'move'; F.inaba.dest = { x: -24, z: -20 }; F.inaba.onArrive = (g) => { g.order = 'hold'; }; } } }),
  ];
}
// A 大手の打って出を退けた後：鹿垣で受けるか、木戸の口まで押し上げるか（判断①）
function inaA() {
  return [
    rest({ dur: 7, heal: 0.3, bark: '鹿垣の内で、組を寄せ直す（手傷を縛った）', say: [['木下藤吉郎', '退いたか。……じゃが木戸は開いたままじゃ。中に城兵がぎっしり詰めておる'], ['丹羽長秀', '鹿垣の内で受ければ、鉄砲で崩せる。押し上げれば口は取れるが、城兵がどっと出る']] }),
    pick({ title: '大手の木戸が開いたまま。どうする？',
      options: [{ label: '鹿垣の内で受け、鉄砲で崩す', note: '鹿垣が守ってくれる。手柄は小さい' }, { label: '木戸の前まで押し上げ、口を奪う', note: '大手柄。木戸の内から城兵が大勢で出てくる' }],
      on: (rt, m, i) => { m.push = i === 1; rt.say(i === 1 ? '柴田勝家' : '丹羽長秀', i === 1 ? 'よう言うた！　わしも行く。木戸の口に槍を突っ込め！' : 'よし。鹿垣まで引きつけよ。撃つのはわしが言う', 3); } }),
    hold({ skip: (rt, m) => m.push, at: { x: 0, z: -30 }, dur: 70, r: 14, title: '鹿垣の守り', sub: '木戸の内から、城兵が波のように押し寄せる', label: '鹿垣', obj: (rt) => (hi(rt) ? '預かった一隊を鹿垣に並べ、押し寄せる城兵を受け止めよ' : '鹿垣で、押し寄せる城兵を受け止めよ'),
      say: [['丹羽長秀', '鹿垣に寄せた所を撃つ。崩れてから槍で突け。鹿垣の外へ出るな', 4]],
      waves: [
        { t: 4, say: ['足軽', '来た！　七曲りを駆け下りてくる！'], foes: () => [{ name: '大手の三の手', from: { x: 0, z: -68 }, list: [uS(2), uA(12)], mass: 300, noRout: 18 }] },
        { t: 26, say: ['丹羽長秀', '木戸の脇の櫓から矢じゃ！　鹿垣の陰へ！'], foes: () => [bowLine('大手の弓衆', { x: 12, z: -60 }, 7)] },
        { t: 42, say: ['足軽', '西の山裾を回ってくる！　横を突かれる！'], foes: () => [{ name: '山裾を回る斎藤勢', from: { x: -44, z: -44 }, list: [uS(2), uA(10)], mass: 220 }] },
      ],
      reward: '鹿垣で城兵を受け止めた', lost: ['木下藤吉郎', '押し込まれたか……鹿垣を結い直せ！'] }),
    fight({ skip: (rt, m) => !m.push, at: { x: 0, z: -50 }, title: '大手の木戸の口', sub: '七曲りの坂の上、木戸の口に斎藤勢が槍を並べる', obj: (rt) => (hi(rt) ? '預かった一隊を率いて、大手の木戸の口の斎藤勢を崩せ' : '大手の木戸の口の斎藤勢を崩せ'),
      say: [['柴田勝家', '口は狭い。先頭の槍を崩せば、後ろの者は下がれずに詰まる！', 4]],
      foes: () => [{ name: '木戸の口の斎藤勢', from: { x: 0, z: -70 }, list: [uS(3), uA(13)], mass: 320 }],
      later: [
        { t: 30, say: ['足軽', '櫓から矢じゃ！'], foes: () => [bowLine('木戸の櫓の弓衆', { x: 12, z: -66 }, 7)] },
        { t: 60, title: '新手', sub: '木戸の内から、城兵の新手', say: ['柴田勝家', 'まだ来るか！　押し返せ、ここが勝負じゃ！'], foes: () => [{ name: '木戸の内の新手', from: { x: -6, z: -76 }, list: [uS(2), uA(12)], mass: 280 }] },
      ],
      max: 140, reward: (t) => { t.special = { label: '大手の木戸の口を奪った', pts: 15 }; }, rewardLabel: '大手の木戸の口を奪った' }),
  ];
}
// B 搦手の木戸を破った後：二の丸から上がる斎藤勢の道を塞ぐか、構わず本丸へ（判断③）
function inaB() {
  return [
    rest({ dur: 6, heal: 0.3, bark: '木戸の陰で、息を整える', say: [['木下藤吉郎', '（小声で）破ったぞ。……じゃが、下の二の丸で声がする。気づかれたな'], ['足軽', '二の丸の兵が、この道を上がってきまする！']] }),
    pick({ title: '二の丸から斎藤勢が上がってくる。どうする？',
      options: [{ label: '二の丸の道を塞ぎ、背を守る', note: '本丸へは遅れる。後ろを突かれずに済む。手柄' }, { label: '構わず、本丸へ斬り込む', note: '早い。本丸で旗本と、後ろの兵に挟まれる' }],
      on: (rt, m, i) => { m.block = i === 0; rt.say('木下藤吉郎', i === 0 ? 'よし、道を塞げ。細い道じゃ、槍をそろえれば一人ずつしか来られぬ' : '行くぞ！　後ろは振り向くな！', 3.5); } }),
    hold({ skip: (rt, m) => !m.block, at: { x: -38, z: -104 }, dur: 65, r: 12, title: '二の丸の道', sub: '搦手の木戸の下、二の丸から上がる細い道', label: '二の丸の道', obj: (rt) => (hi(rt) ? '預かった一隊で二の丸の道を塞ぎ、上がってくる斎藤勢を防げ' : '二の丸の道を塞ぎ、上がってくる斎藤勢を防げ'),
      waves: [
        { t: 3, say: ['足軽', '来た！　道いっぱいに上がってくる！'], foes: () => [{ name: '二の丸から上がる斎藤勢', from: { x: -22, z: -86 }, list: [uS(2), uA(11)], mass: 260, noRout: 15 }] },
        { t: 30, say: ['木下藤吉郎', '三の丸の弓じゃ、伏せよ！　矢が尽きたら、また槍が来るぞ'], foes: () => [bowLine('三の丸の弓衆', { x: -8, z: -88 }, 6), { name: '二の丸の二の手', from: { x: -20, z: -82 }, list: [uS(1), uA(9)], mass: 180 }] },
      ],
      reward: '二の丸の道を塞いだ', lost: ['木下藤吉郎', '抜かれたか……じゃが、もう本丸じゃ！'] }),
  ];
}
// C 大手に残り、本丸の煙が上がった後：逃げる城兵を追うか、木戸の前を固めるか（判断③）
function inaC() {
  return [
    rest({ dur: 6, heal: 0.3, say: [['柴田勝家', '城兵が崩れるぞ。……木戸の内へ攻め入るか、ここで降る者を待つか']] }),
    pick({ title: '本丸から煙。城兵が七曲りを逃げ下りる。どうする？',
      options: [{ label: '木戸の内へ攻め入り、逃げる城兵を討つ', note: '手柄。木戸の内で死にものぐるいの者とぶつかる' }, { label: '木戸の前を固め、降る者を受け入れる', note: '手柄は小さい。無駄な血を流さない' }],
      on: (rt, m, i) => { m.chase = i === 0; rt.say('柴田勝家', i === 0 ? 'よし、かかれ！　木戸の内じゃ！' : 'よかろう。刀を捨てた者は討つな', 3); if (i === 1) rt.award((t) => t.side.push('降る城兵を受け入れた'), '降る城兵を受け入れた'); } }),
    fight({ skip: (rt, m) => !m.chase, at: { x: 0, z: -72 }, title: '木戸の内', sub: '逃げ場を失った城兵が、死にものぐるいで向き直る', obj: (rt) => (hi(rt) ? '預かった一隊を率いて木戸の内へ攻め入り、城兵を崩せ' : '木戸の内の城兵を崩せ'),
      foes: () => [{ name: '死にものぐるいの城兵', from: { x: 0, z: -86 }, list: [uS(3), uA(10)], mass: 240 }],
      later: [{ t: 30, say: ['足軽', '山の曲輪から下りてくる！'], foes: () => [{ name: '曲輪から下りる城兵', from: { x: 20, z: -90 }, list: [uS(2), uA(9)], mass: 200 }] }],
      max: 110, reward: (t) => { t.special = { label: '大手の木戸の内へ攻め入った', pts: 15 }; }, rewardLabel: '大手の木戸の内へ攻め入った' }),
  ];
}

// 両軍の総勢（織田 一万ほど、斎藤 三千ほど。数には諸説ある）
inabayama.force = (rt) => {
  const F = rt.flags;
  return { a: Math.round(10000 - (F.ak || 0) * 20), a0: 10000, b: Math.max(0, 3000 - (F.ek || 0) * 30), b0: 3000 };
};
inabayama.sides = { a: { name: '織田軍', mon: 'oda' }, b: { name: '斎藤軍', mon: 'saito' } };
// 史実でこの戦にいた名のある武将（battle.js の placeFamous が、その家の隊に加える。敵は名乗り、討てば手柄）
inabayama.famous = [
  { name: '柴田勝家', team: 0 }, { name: '丹羽長秀', team: 0 },
  { name: '稲葉良通', team: 0, g: /稲葉/, line: '稲葉一鉄じゃ。今日よりは織田の者として働く！' },
  { name: '日根野弘就', g: /大手/, loose: 1, line: '日根野弘就なり！　稲葉山は落ちぬ。下がれ下がれ！' },
];
inabayama.date = (rt) => `永禄十年八月　秋・晴・${rt.flags.step >= 2 ? '朝' : '夜明け'}`;
inabayama.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '焼き討ちの下知まで待つ'
  : rt.phase === 'karamete' && !rt.flags.guardOn && !rt.flags.stayOte && rt.flags.climbSpots >= 2 && (!rt.flags.scout || gone(rt.flags.scout)) ? '搦手の木戸の手前まで登る' : '');
inabayama.skip = (rt) => {
  if (rt.phase === 'karamete') {
    // 敵のいない登りを飛ばす：自分と組と藤吉郎の手を木戸の手前へ
    const F = rt.flags, to = { x: KARA[3][0] + 2, z: KARA[3][1] + 4 };
    for (const u of [rt.player.u, ...rt.squad, ...F.kino.units]) if (u.alive) { u.pos.x = to.x + (Math.random() - 0.5) * 4; u.pos.z = to.z + (Math.random() - 0.5) * 4; }
    F.kino.pathIdx = Math.max(F.kino.pathIdx || 0, 3);
    return;
  }
  for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2);
};
inabayama.history = '永禄十年（1567）八月、西美濃の稲葉良通（一鉄）・氏家直元（卜全）・安藤守就の三人――美濃三人衆が織田方についた。織田信長はすぐに兵を出して稲葉山城の東の瑞龍寺山に陣を取り、城下の井口の町を焼き払って城を裸にし、まわりに鹿垣を結って囲んだ。城主の斎藤龍興は半月ほどで城を明け渡し、長良川を舟で下って伊勢長島へ逃れた。信長は井口を「岐阜」と改め、この城を新しい居城として、天下布武の印を使い始める。木下藤吉郎（のちの豊臣秀吉）が山の裏の道を案内されて搦手から攻め上ったという話は、のちの『太閤記』などに見える伝えで、確かな記録にはない。この戦では、何日もの囲みを一日の流れにまとめている。兵の数には諸説ある。';
// 信長で遊ぶ時：居場所の目安（bot の目が始まりの位置を確かめる） と立つ所
inabayama.lordAt = { x: 112, z: -24, r: 14, why: '瑞龍寺山の本陣（信長は瑞龍寺山に陣を取り、井口の町を焼かせた）' };
inabayama.lordSpawn = { x: 112, z: -16, heading: -0.55 };

// 素直な遊び手：印の家に火を放ち、大手では斎藤勢と戦い、藤吉郎について搦手を登り、本丸の小屋に火を放つ
const nearIt = (b, pre) => {
  const u = b.player.u;
  let it = null, bd = Infinity;
  for (const x of b.interacts) if (x.id.startsWith(pre)) { const d = Math.hypot(x.pos.x - u.pos.x, x.pos.z - u.pos.z); if (d < bd) { bd = d; it = x; } }
  return it ? { it, d: bd } : null;
};
inabayama.botBrain = (b, inp, { goTo }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyE');
  if (!u.alive || F.ending) return;
  if (F.dpOn) { depthBot(b, inp, goTo); return; }
  if (u.hp < u.maxHp * 0.5) b.botRest = true;
  if (b.botRest && u.hp > u.maxHp * 0.85) b.botRest = false;
  const c = F.kino.center();
  if (b.botRest) { inp.guardHold = false; goTo(p, inp, c.x + 3, c.z + 3, 2); return; }
  const e = b.army.nearestEnemy(u, F.step === 1 ? 7 : 12, (o) => !o.fleeing && !(o.group && o.group.civ));
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d > 2.6) inp.k.add('KeyW');
    if (d < 3.2 && Math.random() < 0.5) inp.leftPressed = true;
    inp.guardHold = (b.army.threats || []).length > 0 && Math.random() < 0.85;
    return;
  }
  inp.guardHold = false;
  if (F.step === 1) {
    const q = nearIt(b, 'h');
    if (q) { if (q.d > 1.6) goTo(p, inp, q.it.pos.x, q.it.pos.z, 1.2); else inp.k.add('KeyE'); return; }
    const t = [F.town, F.town2].find((x) => x && !gone(x));
    if (t) { const cc = t.center(); goTo(p, inp, cc.x, cc.z, 2); return; }
  }
  if (F.step === 2) { const q = [F.ote, F.ote2].find((x) => x && !gone(x)); const t = q ? q.center() : { x: 0, z: -30 }; goTo(p, inp, t.x, t.z, 3); return; }
  if (F.step === 3) {
    if (F.guardOn && !gone(F.kguard)) { const t = F.kguard.center(); goTo(p, inp, t.x, t.z, 2); return; }
    // 道の点を順にたどる（藤吉郎の少し後ろを）
    b.botWp = b.botWp || 0;
    const w = KARA[Math.min(b.botWp, KARA.length - 2)];
    if (Math.hypot(w[0] - u.pos.x, w[1] - u.pos.z) < 3 && b.botWp < KARA.length - 2) b.botWp++;
    goTo(p, inp, w[0], w[1], 2);
    return;
  }
  if (F.step === 4) {
    const hq = (F.hata || []).find((q) => !gone(q));
    if (hq) { const t = hq.center(); goTo(p, inp, t.x, t.z, 2); return; }
    const q = nearIt(b, 'sig');
    if (q) {
      if (b.botWp < KARA.length - 1 && Math.hypot(u.pos.x - HON.x, u.pos.z - HON.z) > 12) { const w = KARA[KARA.length - 1]; goTo(p, inp, w[0], w[1], 1.5); if (Math.hypot(w[0] - u.pos.x, w[1] - u.pos.z) < 2.5) b.botWp = KARA.length - 1; return; }
      if (q.d > 1.6) goTo(p, inp, q.it.pos.x, q.it.pos.z, 1.2); else inp.k.add('KeyE');
    }
    return;
  }
  goTo(p, inp, c.x + 3, c.z + 4, 3);
};

export { inabayama };
