// ======================================================================
// 織田家編　稲葉山城の戦い（永禄十年八月）
// 美濃三人衆が織田方につき、信長はすぐに兵を出して稲葉山城（金華山）を囲んだ。
// 足軽は木下藤吉郎の手。①夜明け、城下の井口の町に火を放つ ②大手口から打って出た斎藤勢を退ける
// ③藤吉郎について、山の裏の道（搦手）を登り、木戸の守りを破る ④本丸の脇に火を放って、大手の味方へ合図を送る
// 何日もの囲みを、一日の流れにまとめている
// 向き：北（-z）が金華山と本丸。南（+z）が井口の町。東（+x）の瑞龍寺山に信長の本陣。西の外を長良川が流れる
// ======================================================================
import { nobori, jinmaku, hut, kabukimon, yagura, tawara, campfire } from './props.js';
import { flagTexture } from './textures.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { moraleWord } from './hud.js';
import { gauss, enemyGroup, allyGroup, nm, centerOf, unitPos, wallLine, ringWall } from './bhelp.js';

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
export function applyLook(rt, L) {
  const W = rt.world;
  W.setTime('dusk');
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
  W.updateEnv();
}

// 夜の色（箕作城の夜攻め・本能寺で使う）
export const NIGHT = { sky: 0x2a3446, fog: 0x283244, sun: 0x9eb0d0, sunI: 0.7, hs: 0x8494b4, hg: 0x2a2a2c, hI: 1.25, top: 0x151c2e, glow: 0.05, dir: [0.8, 0.16, -0.4], mount: 0x13171e };
export { DAWN };

// textures.js に無い家の紋・字の旗：flagTexture の無地の布に、ここで描き足す（一度だけ。兵の指物・幟・遠くの大軍が同じ布を使う）
// draw(g) は 128×256 の布の上に描く（紋の真ん中はおよそ (64, 82)、半径 43）。すでに紋が描かれている布なら何もしない
export function customFlag(key, draw, bg) {
  const t = flagTexture(key);
  if (t.userData.custom) return t;
  t.userData.custom = true;
  const g = t.image.getContext('2d');
  const d = g.getImageData(24, 40, 80, 84).data;
  let ink = 0;
  for (let i = 0; i < d.length; i += 16) if (d[i] + d[i + 1] + d[i + 2] < 240) ink++;
  if (ink > 40) return t;
  if (bg) { g.save(); g.globalCompositeOperation = 'multiply'; g.fillStyle = bg; g.fillRect(0, 0, 128, 256); g.restore(); }
  g.save(); g.fillStyle = g.strokeStyle = '#17130f'; draw(g); g.restore();
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
  h.fires = [W.addFire(h.x, h.z, { h: 1.2 }), W.addFire(h.x + 1.4, h.z - 0.8, { h: 2.2 })];
  W.addSmokeColumn(h.x, W.heightAt(h.x, h.z) + 5, h.z, { size: 2.4 });
  rt.army.play('wood', { x: h.x, z: h.z }, 0.8);
}

const inabayama = {
  spawn: { x: 34, z: 110, heading: Math.PI + 0.3 },
  world: {
    seed: 1567,
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
    rt.scene.add(hut(W, HON.x + 4, HON.z - 6, 9, 6, 0.1, { h: 3, wall: 0x6a5238 }), hut(W, HON.x + 7, HON.z + 6, 6, 4, -0.2));
    rt.scene.add(yagura(W, HON.x - 6, HON.z - 8), yagura(W, HON.x + 10, HON.z - 12));
    rt.scene.add(yagura(W, OTE.x + 12, OTE.z - 6));
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
    rt.scene.add(jinmaku(W, ZUI.x, ZUI.z, 18, 12, 5, { mon: 'oda' }));
    for (const [x, z, k] of [[ZUI.x - 10, ZUI.z + 8, 'oda'], [ZUI.x - 4, ZUI.z + 9, 'eiraku'], [ZUI.x + 4, ZUI.z + 9, 'oda'], [ZUI.x + 10, ZUI.z + 8, 'eiraku']]) rt.scene.add(nobori(W, x, z, k, 6.5));
    DA(ZUI.x - 16, ZUI.z + 20, 26, 12, 220, -Math.PI * 0.75, 0x2b3140, 'oda', 15671);
    DA(ZUI.x + 14, ZUI.z - 12, 24, 10, 160, -Math.PI * 0.7, 0x2b3140, 'eiraku', 15672);
    DA(-64, 40, 30, 12, 240, Math.PI * 0.85, 0x33302a, 'inaba', 15673);     // 美濃三人衆（西美濃から）
    DA(80, 60, 30, 12, 220, Math.PI * 1.2, 0x2b3140, 'oda', 15674);
    DA(70, -86, 24, 10, 160, -Math.PI / 2, 0x2b3140, 'oda', 15675);
    for (const [x, z] of [[-58, 26], [-70, 30]]) rt.scene.add(nobori(W, x, z, 'inaba', 6));
    for (const [x, z] of [[46, 110], [60, 104]]) { rt.scene.add(campfire(W, x, z)); W.addFire(x, z); }

    applyLook(rt, DAWN);
    rt.setPhase('brief');
    rt.obj('main', '木下藤吉郎の手について、井口の町へ入れ', 'main');
    rt.say('', '永禄十年八月　美濃国 稲葉山城下 井口', 3.5);
    rt.say('木下藤吉郎', `${nm(rt)}、聞け。美濃三人衆が殿（信長公）についた。稲葉山の斎藤龍興は、もう裸も同じじゃ`, 5);
    rt.say('木下藤吉郎', '夜の明けぬうちに、城下の井口の町に火をかける。城から町へ逃げ込む道を断つのじゃ', 4.5);
    rt.marker('kino', unitPos(F.kinoU), '木下藤吉郎', {});
    rt.after(16, () => this.burnStart(rt));
  },

  // ① 城下に火を放つ
  burnStart(rt) {
    const F = rt.flags;
    if (F.step >= 1) return;
    F.step = 1; F.stepT = rt.t;
    rt.setPhase('burn');
    sfx('horagai', 0.9);
    rt.unmark('kino');
    rt.banner('井口の町を焼け', '城下を焼いて、城を裸にする');
    rt.obj('main', `印の家に火を放て（${NEED}軒）`, 'main');
    rt.obj('side', '手向かわぬ町の者は討たない', 'side');
    rt.say('木下藤吉郎', '松明を持て！　印の家に火を放て。手向かう者だけを相手にせよ', 3.5);
    for (const h of F.houses.filter((q) => q.mine)) {
      rt.marker('h' + h.i, { x: h.x, z: h.z }, '火を放つ', { h: 3 });
      rt.addInteract('h' + h.i, { x: h.x, z: h.z + 3 }, '家に火を放つ', () => this.light(rt, h), { r: 4, hold: 1.4 });
    }
    const go = (g, x, z) => { g.order = 'move'; g.dest = { x, z }; g.speed = 2.4; g.onArrive = (gg) => { gg.order = 'hold'; gg.anchor = { x, z }; gg.aggro = 12; }; };
    go(F.kino, 22, 76); go(F.shiba, 40, 62); go(F.niwa, 0, 90);
    rt.marker('town', centerOf(F.town), () => `町の番の兵・${moraleWord(F.town.morale)}`, { red: true, group: F.town });
    // 味方もほかの家に火を放っていく
    F.houses.filter((h) => !h.mine).forEach((h, k) => rt.after(22 + k * 9, () => burnHouse(rt, h)));
    // 町の者が逃げていく（戦わない。討てば下知違反）
    F.civ = [];
    const civ = (x, z, n2) => {
      const c = enemyGroup(rt, { faction: 'saito', name: '逃げる町の者', anchor: { x, z }, facing: 0, width: 4, aggro: 0, morale: 0, fleeDir: { x: -0.6, z: -0.4 }, speed: 2.6 },
        [{ type: 'porter', n: n2, o: { flag: null, hat: 'none', armor: 0x4a4034, cloth: 0x3a3228 } }]);
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

  light(rt, h) {
    const F = rt.flags;
    if (h.burnt) return;
    burnHouse(rt, h);
    rt.uninteract('h' + h.i); rt.unmark('h' + h.i);
    F.lit++;
    rt.award((t) => { t.special = { label: '城下に火を放った', pts: 4 * F.lit }; }, '家に火を放った');
    if (F.lit >= NEED) {
      rt.objDone('main');
      for (const q of F.houses.filter((x) => x.mine && !x.burnt)) { rt.uninteract('h' + q.i); rt.unmark('h' + q.i); rt.after(4 + q.i, () => burnHouse(rt, q)); }
      rt.say('木下藤吉郎', 'ようし、町は燃えた。……あとは町に残る斎藤の兵を追い払え！', 3.5);
      // 町の斎藤の兵を追い払うまで（長くかかれば、次へ）
      F.clearT = rt.t;
      rt.after(1, () => rt.obj('main', '町に残る斎藤の兵を追い払え', 'main'));
    } else rt.objProgress('main', `${F.lit}／${NEED}軒`);
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
    rt.obj('main', '大手口から打って出た斎藤勢を退けよ', 'main');
    F.ote = enemyGroup(rt, { faction: 'saito', name: '大手の斎藤勢', anchor: { x: OTE.x, z: OTE.z - 8 }, facing: 0, order: 'hold', aggro: 12, width: 12, morale: 95, fleeDir: { x: 0, z: -1 }, dmgMult: 0.72, formation: 'yari' },
      [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 18 }, { type: 'bow', n: 4 }, { type: 'gun', n: 2 }]);
    for (const u of F.ote.units) if (u.type === 'gun') u.dmg *= 0.5;
    const go = (g, x, z) => { g.order = 'move'; g.dest = { x, z }; g.speed = 2.4; g.onArrive = (gg) => { gg.order = 'hold'; gg.anchor = { x, z }; gg.aggro = 14; }; };
    go(F.kino, -4, -18); go(F.shiba, 14, -24); go(F.niwa, -18, -12);
    rt.say('木下藤吉郎', '大手の木戸の前で鹿垣を結うぞ。斎藤の兵が打って出てくる、受け止めよ！', 4);
    rt.after(16, () => {
      if (F.step !== 2) return;
      F.ote.order = 'attack'; F.ote.seekRange = 70;
      rt.army.play('eshout', { x: OTE.x, z: OTE.z }, 1.6);
      rt.say('斎藤方の侍', '町を焼いた織田の者どもを追い落とせ！', 3);
      rt.marker('ote', centerOf(F.ote), () => `大手の斎藤勢・${moraleWord(F.ote.morale)}`, { red: true, group: F.ote });
    });
    // 木戸の内から新手
    rt.after(58, () => {
      if (F.step !== 2) return;
      F.ote2 = enemyGroup(rt, { faction: 'saito', name: '大手の新手', anchor: { x: OTE.x + 4, z: OTE.z - 10 }, facing: 0, order: 'attack', seekRange: 80, aggro: 14, width: 10, morale: 90, fleeDir: { x: 0, z: -1 }, dmgMult: 0.7 },
        [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 12 }, { type: 'bow', n: 2 }]);
      rt.army.play('eshout', { x: OTE.x, z: OTE.z }, 1.4);
      rt.say('足軽', '木戸から新手が出てくるぞ！', 3);
      rt.marker('ote2', centerOf(F.ote2), () => `大手の新手・${moraleWord(F.ote2.morale)}`, { red: true, group: F.ote2 });
    });
  },

  // ③ 搦手の道を登る
  karamete(rt) {
    const F = rt.flags;
    if (F.step >= 3) return;
    F.step = 3; F.stepT = rt.t;
    rt.setPhase('karamete');
    rt.unmark('ote'); rt.unmark('ote2');
    for (const q of [F.ote, F.ote2]) if (q && !gone(q)) { q.noRout = false; q.morale = Math.min(q.morale, 15); }
    rt.award((t) => t.side.push('大手の打って出を退けた'), '大手の斎藤勢を退けた');
    rt.banner('搦手へ', '山の裏の道を、藤吉郎の手が登る');
    rt.say('木下藤吉郎', '大手は固い。……じゃが、山の裏に細い道があると、この辺りの者に聞いた', 4.5);
    rt.say('木下藤吉郎', `${nm(rt)}、ついて来い。わしらは裏から登って、本丸の脇に火をつける`, 4);
    rt.obj('main', '木下藤吉郎について、搦手の道を登れ', 'main');
    const K = F.kino;
    K.order = 'path'; K.path = KARA.slice(0, -1); K.pathIdx = 0; K.speed = 2.5; K.formation = 'column'; K.aggro = 6;
    K.onArrive = (g) => { g.order = 'hold'; g.anchor = { x: KARA[KARA.length - 2][0], z: KARA[KARA.length - 2][1] }; g.formation = 'line'; g.aggro = 14; };
    rt.marker('kino', unitPos(F.kinoU), '木下藤吉郎', {});
    // 大手には柴田・丹羽が残って押さえる
    for (const g of [F.shiba, F.niwa]) { g.order = 'hold'; g.anchor = { x: g === F.shiba ? 10 : -10, z: -30 }; }
    // 搦手の木戸の守り
    F.kguard = enemyGroup(rt, { faction: 'saito', name: '搦手の守り', anchor: { x: -30, z: -118 }, facing: -Math.PI / 2, order: 'hold', aggro: 14, width: 8, morale: 90, fleeDir: { x: 1, z: 0 }, dmgMult: 0.7, formation: 'yari' },
      [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 9 }, { type: 'gun', n: 2 }]);
    for (const u of F.kguard.units) if (u.type === 'gun') u.dmg *= 0.5;
  },

  // 搦手の守りとぶつかる
  guardFight(rt) {
    const F = rt.flags;
    if (F.guardOn) return;
    F.guardOn = true;
    rt.unmark('kino');
    rt.obj('main', '搦手の守りを破れ', 'main');
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
    rt.say('木下藤吉郎', '入ったぞ！　本丸の旗本を退けて、脇の小屋に火を放て。大手の殿への合図じゃ', 4);
    rt.obj('main', '本丸の旗本を退けよ', 'main');
    F.kino.order = 'attack'; F.kino.seekRange = 40; F.kino.formation = 'line';
    // 本丸の旗本（二手。御殿の前と、奥から）
    const mk = (x, z, name, list) => {
      const g = enemyGroup(rt, { faction: 'saito', name, anchor: { x, z }, facing: -Math.PI / 2, order: 'attack', seekRange: 40, aggro: 14, width: 8, morale: 90, fleeDir: { x: 0.4, z: -1 }, dmgMult: 0.6 }, list);
      rt.marker(name, centerOf(g), () => `${name}・${moraleWord(g.morale)}`, { red: true, group: g });
      return g;
    };
    F.hata = [mk(HON.x + 6, HON.z - 2, '本丸の旗本', [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 8 }])];
    rt.after(24, () => { if (!F.ending) { F.hata.push(mk(HON.x + 8, HON.z - 10, '御殿から出た旗本', [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 8 }])); rt.say('斎藤方の侍', '殿（龍興）の御座所に近づけるな！', 3); } });
  },
  // 旗本を退けたら、合図の火
  lightSig(rt) {
    const F = rt.flags;
    if (F.sig) return;
    for (const n2 of ['本丸の旗本', '御殿から出た旗本']) rt.unmark(n2);
    const S = { x: HON.x + 7, z: HON.z + 6 };
    F.sig = S;
    rt.obj('main', '本丸の脇の小屋に火を放ち、大手の味方へ合図を送れ', 'main');
    rt.say('木下藤吉郎', '今じゃ、火を放て！', 2.5);
    rt.marker('sig', S, '火を放つ', { h: 3 });
    rt.addInteract('sig', { x: S.x - 4, z: S.z }, '小屋に火を放つ（合図）', () => this.win(rt), { r: 4, hold: 1.6 });
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.uninteract('sig'); rt.unmark('sig');
    const S = F.sig;
    rt.world.addFire(S.x, S.z, { h: 1.6 });
    rt.world.addSmokeColumn(S.x, rt.world.heightAt(S.x, S.z) + 6, S.z, { size: 3 });
    rt.objDone('main');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '搦手から本丸に火を放った', pts: 20 }; }, '任務達成・本丸に合図の火');
    if (!F.civHurt) { rt.objDone('side'); rt.award((t) => t.side.push('町の者を討たなかった'), '副任務：町の者を討たなかった'); }
    for (const q of [...(F.hata || []), F.kguard, F.ote, F.ote2]) if (q && !gone(q)) { q.noRout = false; q.morale = 0; }
    sfx('horagai', 0.8); rt.after(1, () => sfx('toki', 0.8));
    rt.banner('稲葉山城、落ちる', '斎藤龍興は城を明け渡し、長良川を舟で下った');
    rt.say('木下藤吉郎', `やったぞ、${nm(rt)}！　大手の殿の本陣から鬨の声じゃ`, 4);
    rt.after(5, () => rt.say('', '――信長は井口を「岐阜」と改め、この山の城を新しい居城とした', 5));
    rt.player.u.invuln = true;
    rt.finish({}, 11);
  },

  update(rt, dt) {
    const F = rt.flags;
    // 崩れた隊の印は消す（古い印が「あちらじゃ」の行き先にならないように）
    for (const m of rt.markers.slice()) if (m.group && gone(m.group)) rt.unmark(m.id);
    if (F.ending) return;
    if (F.step === 1) {
      if (F.lit < NEED) rt.objProgress('main', `${F.lit}／${NEED}軒`);
      // 長くかかりすぎたら、味方が残りに火を放つ
      if (rt.t - F.stepT > 130 && F.lit < NEED) {
        for (const h of F.houses.filter((q) => q.mine && !q.burnt)) { rt.uninteract('h' + h.i); rt.unmark('h' + h.i); burnHouse(rt, h); }
        F.lit = NEED;
        rt.objFail('main');
        rt.say('木下藤吉郎', '遅いぞ！　……ほかの者が火をつけた。大手へまわれ', 3.5);
        rt.after(5, () => this.sally(rt));
      }
    }
    if (F.step === 2) {
      const qs = [F.ote, F.ote2].filter(Boolean);
      rt.objProgress('main', `斎藤勢 ${qs.reduce((s, q) => s + (gone(q) ? 0 : q.count), 0)}人`);
      for (const q of qs) if (q.count < 5 && !gone(q)) q.morale = Math.min(q.morale, 25);
      if ((F.ote2 && qs.every(gone)) || rt.t - F.stepT > 160) this.karamete(rt);
    }
    if (F.step === 3) {
      const p = rt.player.u.pos;
      const kd = Math.hypot(p.x + 30, p.z + 118);
      if (!F.guardOn) rt.objProgress('main', `搦手の木戸まで ${Math.max(0, Math.round(kd))}m`);
      else rt.objProgress('main', `守り ${F.kguard.count}人`);
      const kc = F.kino.center();
      if (!F.guardOn && (kd < 30 || Math.hypot(kc.x + 30, kc.z + 118) < 26)) this.guardFight(rt);
      if (F.guardOn && (gone(F.kguard) || F.kguard.count < 3)) { if (!gone(F.kguard)) F.kguard.morale = 0; this.signal(rt); }
      // 長くかかりすぎたとき
      if (rt.t - F.stepT > 200 && !F.guardOn) this.guardFight(rt);
    }
    if (F.step === 1 && F.clearT !== undefined) {
      const qs = [F.town, F.town2].filter(Boolean);
      rt.objProgress('main', `斎藤の兵 ${qs.reduce((a, q) => a + (gone(q) ? 0 : q.count), 0)}人`);
      for (const q of qs) if (q.count < 4 && !gone(q)) q.morale = Math.min(q.morale, 20);
      if ((F.town2 && qs.every(gone)) || rt.t - F.clearT > 70) { F.clearT = undefined; F.step = 1.5; rt.after(4, () => this.sally(rt)); }
    }
    if (F.step === 4 && F.hata) {
      for (const q of F.hata) if (q.count < 4 && !gone(q)) q.morale = Math.min(q.morale, 20);
      if (!F.sig && ((F.hata.length >= 2 && F.hata.every(gone)) || rt.t - F.stepT > 110)) this.lightSig(rt);
      if (rt.t - F.stepT > 170) this.win(rt);
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
    if (g.team !== 1 || g.civ) return;
    rt.say('足軽', `${g.name}が山へ逃げていく！`, 2.5);
  },
};

// 両軍の総勢（織田 一万ほど、斎藤 三千ほど。数には諸説ある）
inabayama.force = (rt) => {
  const F = rt.flags;
  return { a: Math.round(10000 - (F.ak || 0) * 20), a0: 10000, b: Math.max(0, 3000 - (F.ek || 0) * 30), b0: 3000 };
};
inabayama.sides = { a: { name: '織田軍', mon: 'oda' }, b: { name: '斎藤軍', mon: 'saito' } };
inabayama.date = (rt) => `永禄十年八月　秋・晴・${rt.flags.step >= 2 ? '朝' : '夜明け'}`;
inabayama.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '焼き討ちの下知まで待つ' : '');
inabayama.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
inabayama.history = '永禄十年（1567）八月、西美濃の稲葉良通（一鉄）・氏家直元（卜全）・安藤守就の三人――美濃三人衆が織田方についた。織田信長はすぐに兵を出して稲葉山城の東の瑞龍寺山に陣を取り、城下の井口の町を焼き払って城を裸にし、まわりに鹿垣を結って囲んだ。城主の斎藤龍興は半月ほどで城を明け渡し、長良川を舟で下って伊勢長島へ逃れた。信長は井口を「岐阜」と改め、この城を新しい居城として、天下布武の印を使い始める。木下藤吉郎（のちの豊臣秀吉）が山の裏の道を案内されて搦手から攻め上ったという話は、のちの『太閤記』などに見える伝えで、確かな記録にはない。この戦では、何日もの囲みを一日の流れにまとめている。兵の数には諸説ある。';

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
