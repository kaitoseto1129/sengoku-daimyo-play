// 近くの本物の兵へ替える範囲（m）。以前の adaptive_quality.js は段が一度も進まず常に 60 だった（10/21 に消した）
// 長篠編 一戦目　長篠城籠城（天正三年五月十四日〜十六日）
// 寒狭川と宇連川の合わさる崖の上の城。北の大手から武田の大軍が寄せ、奥平信昌の五百が塀の内で守る。
// 流れ：①大手門と北の塀への寄せ ②兵糧蔵に火矢 ③夕暮れ、鳥居強右衛門を川まで送り出す ④二日後、強右衛門の知らせ ⑤最後の寄せを後詰の旗まで凌ぐ
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { distToPolyline, nearHideRequest, ARMY_REAL_P, ARMY_REAL_R, ARMY_REAL_NEAR } from './world.js';
import { LIGHT_HIDE_R } from './world_army_shader.js';
import { stumps, nobori, hut, kabukimon, tawara, jinCamp, village, tobiraLeaf, bobosaku, takataba, tateNarabi, yagura, solidRect } from './props.js';
import { woodTex } from './nature.js';
import { flagTexture } from './textures.js';
import { horseStyleFor } from './units_model.js';
import { rockShape, groundRocks } from './rock_shape.js';
import { sfx } from './audio.js';
import { moraleWord } from './hud.js';
import { timeSkipGoal } from './center_call.js';
import { gauss, nm, centerOf, unitPos, wallLine, samaTs, guardRecover, hpBarSystem, strengthBanner } from './bhelp.js';
import { isTouch } from './touch.js';
import { fujinRealN } from './fujin_layout.js';
import { K, S as SETTINGS } from './settings.js';
import { camp } from './b_mid.js';
import { carryLadder, startClimb, updateLadders, resetLadders, ladderAlive } from './siege_ladder.js';
import { monomi } from './castle_parts.js';
import { tabaGeo, tabaMat } from './taketaba.js';
import { reset as flReset } from './floors.js';
import { depth as nagaDepth } from './nagashinojo/depth.js';
import { runnerWay as nagaRunnerWay } from './nagashinojo/runner.js';
import { missionTarget } from './mission_pin_target.js';
import { SH, shSide, allyGroup, enemyGroup, shPos, shGhostTick } from './nagashinojo/side.js';   // K661：両軍の側（元の戦と武田編 d10 が同じ setup・update を使う）
import { sideGuard } from './guard_refill.js';   // 深手で囲まれたら近くの味方の組が横へ（設楽原・長久手と同じ共通の形）
import { isEn, addEn } from './i18n.js';
import { tedoMemCap } from './tedorigawa/yasumi.js';
import { MEM_BUDGET } from './device_tier.js';   // K564：記憶4GB 以下の携帯で本物の兵を記憶の予算（205）に収める共通の手
// K516 英語の時だけ長篠城の字の表を読む（日本語の時は読まない・重さ0）
if (isEn()) import('./i18n_nagashinojo.js').then((m) => addEn(m.default)).catch(() => {});

// 共通の道具は、桶狭間だけの支度でも長篠城の定義を伴わない場所へ分ける。
import { ARMOR, farHost, backOf, backTick, markRecyclable, honjin, farVillage, carrion, freeRoom, KIT } from './battle_army_kit.js';
export { ARMOR, farHost, backOf, backTick, markRecyclable, honjin, farVillage, carrion, freeRoom, KIT } from './battle_army_kit.js';

// 一斉射（kaito 0929）：味方の鉄砲の組に「引きつけよ」で撃つのを待たせ、wait 秒の後に「放て」で揃えて撃たせる。
// 撃った後、鉄砲の組から r の内にいる敵の隊は気勢（morale）が hit 下がる。C（clash）があれば軽い大軍も一斉に撃つ。
export function volley(rt, guns, o = {}) {
  const live = () => (guns || []).filter((g) => g && g.count > 0 && !g.routed);
  if (!live().length) return false;
  const who = o.who || '鉄砲頭';
  for (const g of live()) g.holdFire = true;
  if (o.waitLine !== '') rt.say(who, o.waitLine || 'まだじゃ……まだ撃つな。引きつけよ', 2.2);
  rt.after(o.wait ?? 2.4, () => {
    const gs = live();
    for (const g of gs) { g.holdFire = false; g.fire = true; }
    if (o.banner) rt.banner(o.banner[0], o.banner[1] || '');
    rt.say(who, o.line || '放てぇっ！', 1.8);
    if (gs[0]) rt.army.play('gun', gs[0].center(), 1.3);
    if (o.C) o.C.volley(o.side || 'A');
    rt.after(1.2, () => {
      const cs = gs.filter((g) => g.count > 0).map((g) => g.center());
      for (const e of rt.army.groups) {
        if (e.team === (o.self ?? 0) || e.routed || !(e.count > 0)) continue;
        const c = e.center();
        if (!cs.some((q) => Math.hypot(c.x - q.x, c.z - q.z) < (o.r ?? 55))) continue;
        e.morale = Math.max(o.floor ?? 6, (e.morale ?? 60) - (o.hit ?? 24));
      }
      if (o.done) o.done(rt, gs);
    });
  });
  return true;
}

// ---------------- 城の形 ----------------
// 北が -z。城は台地の上（高さ 14）。南と西は崖で、その下を川が流れる
const N_Z = -24, S_Z = 40, W_X = -38, E_X = 32;   // 外の塀（二の丸と本丸をまとめて囲む）
const IN_Z = 10;                                   // 二の丸（北）と本丸（南）の境の塀
const GATE = { x: -3, z: N_Z };                    // 大手門（幅6）
const GATE_HITTERS = 6;                            // 一度に大手門を打てる寄せ手の数
const GATE2 = { x: -5, z: IN_Z };                  // 本丸の門（戸はない）
const KARA = { x: 21, z: S_Z };                    // 搦手の口
const HALL = { x: -14, z: 27 };                    // 本丸の館
const KURA = { x: 18, z: -5 };                     // 兵糧蔵
const MID = { x: -3, z: 8 };
const TOP = 14;                                    // 台地の高さ
// 川：寒狭川（西を北から南へ）・宇連川（南を東から西へ）。城の南西で合わさって豊川になる
const KANSA = [[-72, -180], [-63, -110], [-57, -40], [-56, 20], [-58, 62]];
const URE = [[180, 80], [110, 73], [60, 66], [0, 64], [-58, 62]];
const TOYO = [[-58, 62], [-78, 105], [-92, 180]];
// 大手道と、搦手から崖を下りて川べりへ出る細道（強右衛門の道）
const OTE = [[-3, -24], [-4, -52], [-8, -82], [-12, -125]];
const SUNE_PATH = [[21, 36], [21, 43], [33, 44], [41, 47], [48, 51], [55, 55], [58, 58.5]];

const sm = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
const plateau = (x, z) => sm(52, 47, z) * sm(-47, -42, x) * sm(-76, -36, z) * sm(74, 40, x);
function baseH(x, z) {
  let h = 0.9 * Math.sin(x * 0.03 + 0.4) * Math.cos(z * 0.026) + 0.5 * Math.sin(z * 0.07 + x * 0.02);
  // 北の医王寺山（勝頼の陣）・北東の丘・東の台・対岸の鳶ヶ巣山・西の山
  h += 16 * gauss(x, z, -30, -155, 2600) + 11 * gauss(x, z, 95, -120, 2400) + 9 * gauss(x, z, 150, -10, 3000);
  h += 22 * gauss(x, z, 35, 150, 3400) + 14 * gauss(x, z, -130, 140, 3000) + 17 * gauss(x, z, -140, -40, 3200);
  return h;
}
const heightFn = (x, z) => { const p = plateau(x, z); return TOP * p + baseH(x, z) * (1 - p * 0.85); };
const insideCastle = (x, z, m = 0) => x > W_X - m && x < E_X + m && z > N_Z - m && z < S_Z + m;
// 寄せ手の控えは塀から離れた所で待つ（塀の内の者から 60m ほど離して置く）
const inCastle = (g) => () => { const c = g.center(); return insideCastle(c.x, c.z, 45); };

// ---------------- 小道具（この戦だけで使う形） ----------------
const WOOD = new THREE.MeshStandardMaterial({ vertexColors: true, map: woodTex(), roughness: 0.9, metalness: 0 });
function paint(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
function mesh(parts) {
  const m = new THREE.Mesh(mergeGeometries(parts), WOOD);
  m.castShadow = true; m.receiveShadow = true; m.userData.camBlock = true;
  return m;
}
// 磔の柱（宇連川の対岸・二日後の段）：キの字の柱。人は後から縛り付ける（K358 初めての目：対岸に人の塊だけで磔が見えない）
const CLOTH = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
function haritsuke(world, x, z) {
  const grp = new THREE.Group(), wood = [], man = [];
  const box = (arr, w, h, d, px, py, pz, hex, rz = 0) => { const g = new THREE.BoxGeometry(w, h, d); if (rz) g.rotateZ(rz); g.translate(px, py, pz); arr.push(paint(g, hex)); };
  box(wood, .26, 6.2, .26, 0, 3.1, 0, 0x6a5238);          // 柱
  box(wood, 2.5, .2, .2, 0, 5.0, 0, 0x6a5238);            // 上の横木（両腕）
  box(wood, 1.4, .2, .2, 0, 2.5, 0, 0x6a5238);            // 下の横木（両足）
  box(wood, .9, .3, .9, 0, .15, 0, 0x5a4630);             // 根の土留め
  const wm = mesh(wood); grp.add(wm);
  box(man, .5, .75, .3, 0, 4.45, .2, 0xd9d2bf);           // 白い小袖の胴
  box(man, .5, .6, .3, 0, 3.75, .2, 0xcfc7b2);            // 腰
  box(man, .26, .3, .26, 0, 5.05, .22, 0xb98f68);         // 頭
  box(man, .3, .12, .3, 0, 5.24, .22, 0x1d1712);          // 髷
  box(man, 2.0, .16, .18, 0, 4.82, .2, 0xd9d2bf);         // 両腕を横木へ
  box(man, .16, 1.3, .18, -.36, 3.0, .2, 0xcfc7b2, .32);  // 足は開いて下の横木へ
  box(man, .16, 1.3, .18, .36, 3.0, .2, 0xcfc7b2, -.32);
  const body = new THREE.Mesh(mergeGeometries(man), CLOTH);
  body.castShadow = true; body.visible = false; grp.add(body);
  grp.position.set(x, world.heightAt(x, z), z);
  grp.rotation.y = Math.PI;   // 城（北）へ向ける
  grp.scale.setScalar(1.25);  // 川越し四十m からも柱と人が読める
  return { grp, body };
}
// 宇連川の鳴子の綱（11/18 クラウド 長篠城の持ち主・本物らしさ）：武田は城の者が川を抜けて出ないよう、
//   川に縄を張り鳴子を下げていた（強右衛門はその下を潜って抜けたと伝わる）。両岸に杭、たるんだ縄に板の鳴子を下げる。
//   形は一つにまとめ（一回の描き）、当たりは持たない。強右衛門の道の先（川べりの印）から見える所に置く。
function narukoRope(world, a, b) {
  const parts = [];
  const ha = world.heightAt(a[0], a[1]), hb = world.heightAt(b[0], b[1]);
  const post = (x, z, h) => { const g = new THREE.BoxGeometry(.16, 1.7, .16); g.translate(x, h + .85, z); parts.push(paint(g, 0x5b4630)); };
  post(a[0], a[1], ha); post(b[0], b[1], hb);
  const top = [ha + 1.55, hb + 1.55], low = Math.min(ha, hb) + .55;   // 真ん中は水の少し上までたるむ
  const pt = (t) => { const y = top[0] + (top[1] - top[0]) * t; const sag = 4 * t * (1 - t); return new THREE.Vector3(a[0] + (b[0] - a[0]) * t, y + (low - Math.min(top[0], top[1]) ) * sag, a[1] + (b[1] - a[1]) * t); };
  const N = 14;
  for (let i = 0; i < N; i++) {
    const p0 = pt(i / N), p1 = pt((i + 1) / N), len = p0.distanceTo(p1);
    const g = new THREE.BoxGeometry(.1, .1, len);   // 二十m 先からも読める太さ（細いと川面に消えた）
    const m = new THREE.Matrix4().lookAt(p0, p1, new THREE.Vector3(0, 1, 0));
    g.applyMatrix4(m); g.translate((p0.x + p1.x) / 2, (p0.y + p1.y) / 2, (p0.z + p1.z) / 2);
    parts.push(paint(g, 0xc4ae7c));
    if (i > 0 && i < N - 1 && i % 2 === 1) {
      // 鳴子：小さな板に竹の管を二、三本（縄から短い紐で下げる）
      const q = pt((i + .5) / N);
      const board = new THREE.BoxGeometry(.42, .26, .05); board.translate(q.x, q.y - .34, q.z); parts.push(paint(board, 0xb39d6a));
      const cord = new THREE.BoxGeometry(.02, .2, .02); cord.translate(q.x, q.y - .12, q.z); parts.push(paint(cord, 0x6e5e44));
      for (const dx of [-.1, 0, .1]) { const c = new THREE.CylinderGeometry(.04, .04, .32, 5); c.translate(q.x + dx, q.y - .55, q.z); parts.push(paint(c, 0x7d8a4a)); }
    }
  }
  const m = new THREE.Mesh(mergeGeometries(parts), CLOTH);
  m.castShadow = true;
  return m;
}
// 武田の金掘りの穴（11/18 クラウド 長篠城の持ち主・本物らしさ）：勝頼は甲斐の金掘り衆に塀の下を掘らせたと伝わる。
//   北東の角の外の斜面に、坑口の木枠・黒い口・掘り出した土の山・もっこを置く。見た目だけ（当たり・兵は持たない）。
function kanahoriPit(world, x, z, rot) {
  const parts = [], dark = [];
  const c = Math.cos(rot), s = Math.sin(rot);
  const at = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
  const put = (arr, g, lx, ly, lz, hex) => { const [px, pz] = at(lx, lz); g.rotateY(rot); g.translate(px, world.heightAt(px, pz) + ly, pz); arr.push(hex == null ? g : paint(g, hex)); };
  // 坑口の木枠（二本の柱と梁）
  put(parts, new THREE.BoxGeometry(.18, 1.7, .18), -.75, .85, 0, 0x5d4a32);
  put(parts, new THREE.BoxGeometry(.18, 1.7, .18), .75, .85, 0, 0x5d4a32);
  put(parts, new THREE.BoxGeometry(1.9, .2, .22), 0, 1.72, 0, 0x5d4a32);
  // 坑口の闇
  put(parts, new THREE.BoxGeometry(1.32, 1.5, .5), 0, .72, .22, 0x0d0b09);
  // 掘り出した土の山（三つ）と、もっこ二つ
  for (const [lx, lz, r, h] of [[-2.6, -1.6, 1.5, .9], [2.4, -2.2, 1.9, 1.1], [.2, -3.6, 1.3, .7]]) {
    const g = new THREE.ConeGeometry(r, h, 9); put(parts, g, lx, h / 2 - .05, lz, 0x6b5233);
  }
  for (const [lx, lz] of [[-1.3, -1.2], [1.1, -1.0]]) put(parts, new THREE.CylinderGeometry(.34, .26, .3, 8), lx, .15, lz, 0x8a7a52);
  // 担い棒（もっこを運ぶ天秤）を一本、土の山に立て掛ける
  { const g = new THREE.BoxGeometry(.07, .07, 2.2); g.rotateX(.6); put(parts, g, 1.9, .55, -1.4, 0x7a6444); }
  const m = new THREE.Mesh(mergeGeometries(parts), CLOTH);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
// この城の館と蔵だけを高床にする。共通の小屋や兵舎の土間は変えない。
function raisedCastleHut(world, x, z, w, d, rot, o) {
  const root = hut(world, x, z, w, d, rot, o);
  const lift = .65, parts = [], unit = new THREE.BoxGeometry(1, 1, 1);
  const box = (bw, bh, bd, px, py, pz, col, yaw = 0) => {
    const g = unit.clone(); g.scale(bw, bh, bd); g.rotateY(yaw); g.translate(px, py, pz);
    parts.push(paint(g, col));
  };
  // 写真の床下の影と束柱。小屋本体と戸口を同じ分だけ上げる。
  for (const child of root.children) child.position.y += lift;
  const count = Math.ceil(w / 1.8), c = Math.cos(rot), s = Math.sin(rot);
  for (const sz of [-1, 1]) {
    const pz = sz * (d / 2 - .14);
    box(w, .16, .2, 0, lift - .04, pz, 0x584b3b);
    for (let i = 0; i <= count; i++) {
      const px = -w / 2 + .14 + (w - .28) * i / count;
      const ground = world.heightAt(x + px * c + pz * s, z - px * s + pz * c) - root.position.y;
      box(.2, lift - ground + .12, .2, px, (ground + lift) / 2 - .06, pz, 0x625440);
    }
  }
  box(w, .14, d, 0, lift + .02, 0, 0x796a52);
  // 戸口前の踏板と三段の木階。縁は軒下に収め、守兵の通り道へ張り出さない。
  box(w - .2, .12, .38, 0, lift + .07, d / 2 + .16, 0x88765b);
  for (let i = 0; i < 3; i++) {
    const pz = d / 2 + .38 + i * .22, top = lift * (3 - i) / 3;
    const ground = world.heightAt(x + pz * s, z + pz * c) - root.position.y;
    const bottom = Math.min(ground, top - .08);
    box(1.35, top - bottom, .23, 0, (top + bottom) / 2, pz, i % 2 ? 0x78664e : 0x8a775a);
  }
  // 本の館・蔵のように軒下へ小さな格子窓を収める。閉じた内戸を背に置き、
  // 柱間の中央に枠と格子をまとめる。既存の壁・当たり・戸口は動かさない。
  const H = o.h || 2.6;
  const window = (px, pz, yaw) => {
    const cy = lift + H * .72, c = Math.cos(yaw), s = Math.sin(yaw);
    const piece = (bw, bh, bd, lx, ly, lz, col) =>
      box(bw, bh, bd, px + lx * c + lz * s, cy + ly, pz - lx * s + lz * c, col, yaw);
    piece(.66, .76, .045, 0, 0, 0, 0x383328);
    for (const sx of [-1, 1]) piece(.075, .86, .12, sx * .37, 0, .035, 0x72634d);
    for (const sy of [-1, 1]) piece(.82, .075, .15, 0, sy * .42, .045, 0x817057);
    for (let i = 0; i < 4; i++) piece(.035, .76, .08, (i - 1.5) * .16, 0, .045, i % 2 ? 0x76654e : 0x8b795e);
  };
  const bays = Math.max(1, Math.round(w / 1.8));
  // 両端から二つ目の柱間。狭い蔵は両端の柱間を使い、中央の戸を避ける。
  const offset = w / 2 - w / bays * (bays > 4 ? 1.5 : .5);
  for (const side of [-1, 1]) {
    for (const px of [-offset, offset]) window(px, side * (d / 2 + .12), side > 0 ? 0 : Math.PI);
    window(side * (w / 2 + .12), 0, side * Math.PI / 2);
  }
  root.add(mesh(parts));
  parts.forEach(g => g.dispose()); unit.dispose();
  return root;
}
// 板塀：板を張った塀に、柱・押縁・狭間（鉄砲や弓を出す穴）と、板葺きの小さな屋根
function hei(world, seg, o = {}) {
  const [ax, az, bx, bz] = seg;
  const len = Math.hypot(bx - ax, bz - az), ang = Math.atan2(bx - ax, bz - az);
  const mx = (ax + bx) / 2, mz = (az + bz) / 2;
  const y = Math.min(world.heightAt(ax, az), world.heightAt(bx, bz), world.heightAt(mx, mz));
  const H = 1.9, parts = [];
  // 11/18 クラウド35（cloud-19 の見つけ）：昼の日は北寄り（-z）から差すので、北の塀の内（城の側）の面は逆光で、木の絵と暗い板の色が掛け合わさり真っ黒な一枚の板に見えた。
  //   内の面の板だけ空の照り返しの分だけ明るくする（外の面・柱・屋根は今のまま）。内は城の真ん中の側
  const inSd = Math.sign(Math.cos(ang) * ((W_X + E_X) / 2 - mx) - Math.sin(ang) * ((N_Z + S_Z) / 2 - mz)) || 1;   // 胸ほどの高さ：塀越しに寄せ手の大軍が見える
  const box = (w, h, d, x, yy, z, hex) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, yy, z); parts.push(paint(g, hex)); return g; };
  const high = true;
  const holes = samaTs(len, o.samaStep || 1.8).map(t => -len / 2 + t * len);
  if (high) {
    // 写真の縦板と横桟。狭間は黒い印でなく板を分けた開口にする。
    box(.16, 1.66, len + .04, 0, .33, 0, 0x756048);
    box(.16, .5, len + .04, 0, 1.65, 0, 0x756048);
    let edge = -len / 2;
    for (const z of [...holes, len / 2 + .12]) {
      const end = z - .12;
      if (end > edge) box(.16, .24, end - edge, 0, 1.28, (edge + end) / 2, 0x756048);
      edge = z + .12;
    }
    // 写真の古板は灰褐色が混ざり、地際ほど泥で暗い。継ぎ目用の面を板の表へ
    // 置き換え、一枚二三角・同じ材質の頂点色で描く。開口を塞がない上下だけに張る。
    const boards = Math.max(1, Math.ceil(len / .28)), step = len / boards;
    const tones = [0x88775f, 0x756955, 0x968069, 0x706858, 0x806c53];
    const mud = new THREE.Color(0x514635), tint = new THREE.Color();
    for (let i = 0; i < boards; i++) {
      const z = -len / 2 + (i + .5) * step;
      const base = new THREE.Color(tones[(i + Math.abs(Math.round(mx + mz))) % tones.length]);
      for (const [h, yy] of [[1.66, .33], [.5, 1.65]]) for (const sd of [-1, 1]) {
        const g = paint(new THREE.PlaneGeometry(step - .012, h), 0xffffff);
        g.rotateY(sd * Math.PI / 2); g.translate(sd * .095, yy, z);   // 11/18 クラウド35：箱の面（±.08）と1mm では遠くで箱の面が勝ち、板の色が出なかった
        const p = g.attributes.position, colors = g.attributes.color;
        for (let j = 0; j < p.count; j++) {
          tint.copy(base).lerp(mud, Math.max(0, 1 - p.getY(j) / 1.16) * .65);
          if (sd === inSd) { tint.multiplyScalar(1.3); tint.r = Math.min(1, tint.r); tint.g = Math.min(1, tint.g); tint.b = Math.min(1, tint.b); }
          colors.setXYZ(j, tint.r, tint.g, tint.b);
        }
        parts.push(g);
      }
    }
  } else box(0.16, H + 0.5, len + 0.04, 0, (H + 0.5) / 2 - 0.5, 0, 0x6a5540);
  for (const hy of [0.45, H - 0.35]) box(0.22, 0.09, len, 0, hy, 0, 0x4a3a2a);
  const posts = Math.max(1, Math.round(len / 2));
  for (let i = 0; i <= posts; i++) box(0.24, H + 0.2, 0.24, 0, (H + 0.2) / 2 - 0.2, -len / 2 + (i / posts) * len, 0x4e3c2a);
  // 狭間：城兵が立って撃つ所と同じ割り方（bhelp の samaTs）。鉄砲を構えた筒の高さ（1.3m ほど）に三角と四角を交互に
  if (!high) samaTs(len, o.samaStep || 1.8).forEach((t, i) => {
    const z = -len / 2 + t * len;
    if (i % 2) box(0.2, 0.22, 0.24, 0, 1.28, z, 0x14110e);
    else { const g = new THREE.CylinderGeometry(0.16, 0.16, 0.2, 3); g.rotateZ(Math.PI / 2); g.rotateX(Math.PI / 2); g.translate(0, 1.27, z); parts.push(paint(g, 0x14110e)); }
  });
  for (const sd of [1, -1]) {
    const g = new THREE.BoxGeometry(0.62, 0.06, len + 0.3);
    g.rotateZ(sd * 0.5); g.translate(sd * 0.24, H + 0.1, 0);
    parts.push(paint(g, high ? (sd === inSd ? 0x7a654e : 0x65513d) : 0x2f2a25));
    if (high) {
      // 写真の板葺き。薄い面を重ねて継ぎ目と褪色を出し、側面の三角形は増やさない。
      const n = Math.max(1, Math.round((len + .3) / .38)), step = (len + .3) / n;
      const tones = [0x79644d, 0x6b5946, 0x826d53, 0x62523f, 0x736451];
      for (let i = 0; i < n; i++) {
        const board = new THREE.PlaneGeometry(.62, step - .012);
        board.rotateX(-Math.PI / 2); board.translate(0, .032, 0); board.rotateZ(sd * .5);
        board.translate(sd * .24, H + .1, -(len + .3) / 2 + (i + .5) * step);
        // 11/18 クラウド35：始めの眺め（櫓ほどの高さから見下ろす）では内の屋根が一番大きく見え、日陰で黒い帯になった。内の屋根の板も明るく
        const tone = tones[(i + (sd > 0 ? 0 : 2)) % tones.length];
        parts.push(paint(board, sd === inSd ? new THREE.Color(tone).multiplyScalar(1.25).getHex() : tone));
      }
    }
  }
  box(0.12, 0.1, len + 0.3, 0, H + 0.26, 0, high ? 0x554331 : 0x26211c);
  const m = mesh(parts);
  m.position.set(mx, y, mz);
  m.rotation.y = ang;
  return m;
}
// 大手門の扉（二枚。破られると内へ倒れる）
function gateDoors(world, x, z, w) {
  const grp = new THREE.Group();
  grp.userData.leaves = [];
  for (const sd of [-1, 1]) {
    const pv = new THREE.Group();
    pv.position.set(sd * w / 4, 0, 0);
    pv.add(tobiraLeaf(w / 2 - 0.06, 3.1, sd));   // 板と乳金物・内の貫と筋交いの扉（props.js）
    grp.add(pv);
    grp.userData.leaves.push(pv);
  }
  grp.position.set(x, world.heightAt(x, z), z);
  return grp;
}

// ---------------- 塀の外の眺め（寄せ手の竹束と旗の列・崖の岩） ----------------
// 竹束は一つの InstancedMesh で（当たりは一つずつ）
// 11/18 19:45 UTC 持ち主：二十面の平たい岩は、近くで灰色の大きな板（三角の面）に見えた→割れと苔の色を持つ共用の岩の形（rock_shape.js・八十面）にし、
//   傾けすぎ（前は 0〜3 rad の転がり＝削った頂が横を向いて板に見えた）をやめ、根の陰と草で地に据える
let ROCK_GEO = null, ROCK_MAT = null;
function siegeLayers(rt) {
  const W = rt.world, m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  const rr = (k) => { const t = Math.sin(k * 12.9898) * 43758.5453; return t - Math.floor(t); };
  // 竹束は塀の外の坂の肩（塀から十数メートル）に、二つ組みで間を空けて二列。寄せ手は間を抜けて塀へ上る
  const pts = [];
  // 11/18 07:58 UTC 持ち主（act bot 258秒 final：破れ目への寄せの遠い兵が (-36,-42) で行き先を持ったまま二十秒立つ・201秒 梯子の寄せが (27,-42) で重なる）：
  //   二列目を三・二m ずらすと一列目の間をちょうど塞ぎ、真っすぐ抜ける道が無く、井楼の脇で詰まった。ずらしを半分にして、二列を貫く一・八m の通り道を残す
  for (const [z0, off] of [[-37, 0], [-41.5, 1.6]]) {
    for (let x = W_X - 2 + off; x < E_X + 2; x += 6.4) {
      for (const dx of [0, 2]) {
        const xx = x + dx;
        if (Math.abs(xx - GATE.x) < 7) continue;   // 大手道は空ける
        // 11/18 17:48 UTC 持ち主（act bot 239秒 final：北の塀（西）への寄せ二人が二列目の西の端の竹束 (-36.4,-41.5) の当たりの中で
        //   行き先 (-17,-28) を持ったまま二十秒立つ★★、07:58 と同じ所）：西の端（井楼の脇）の二列目は置かず、寄せの通り道にする
        if (z0 < -40 && xx < -35) continue;
        // 11/28 14:50 クラウド 長篠城の持ち主（act bot --mobile d10 2本とも w1 125秒に (7,-42) で前へ進めない★★：二列目の大手道の東の竹束 (6.4〜8.4,-41.5) に当たり、
        //   一列目との抜け道が〇・九m しかなかった）。二列目の大手道の脇（道から十二m の内）は置かず、大手道の口を広げる（一列目の楯は今まで通り）
        if (z0 < -40 && Math.abs(xx - GATE.x) < 12) continue;
        // 11/28 17:35 クラウド 長篠城の持ち主（act bot --mobile 籠城 w1 126秒：北の塀への寄せ九人が二列目の竹束 (-25.6,-41.5) の前 (-26,-41) で
        //   一点に重なり止まった★★。遠くの軽い考えの兵は竹束を回り込めない）。西の梯子（x-22）へ上る筋の二列目は置かず、一列目の間から真っすぐ梯子へ
        if (z0 < -40 && Math.abs(xx + 22) < 4) continue;
        pts.push([xx, z0 + (rr(xx * 3.1 + z0) - 0.5) * 0.8, (rr(xx + z0 * 7) - 0.5) * 0.3]);
      }
    }
  }
  const taba = new THREE.InstancedMesh(tabaGeo(false, false, false, false, false), tabaMat(), pts.length);
  pts.forEach(([x, z, r], i) => {
    e.set(0, r + Math.PI, 0); q.setFromEuler(e);
    taba.setMatrixAt(i, m4.compose(v.set(x, W.heightAt(x, z), z), q, sc.set(1, 1, 1)));
    Object.assign(solidRect(x, z, 1.9, 0.6, r), { missileH: 1.7, missileType: 'wood' });
  });
  taba.castShadow = true; taba.receiveShadow = true;
  rt.scene.add(taba);
  // 竹束の後ろに寄せ手の旗の列（花菱・風林火山・赤備え）。塀越しに旗の頭が並んで見える
  const kinds = ['takeda', 'furin', 'takeda', 'akazonae'];
  let n = 0;
  for (let x = W_X + 1; x <= E_X; x += 4) {
    if (Math.abs(x - GATE.x) < 6) continue;
    rt.scene.add(nobori(W, x + (rr(x) - 0.5) * 1.5, -46 - rr(x + 5) * 3, kinds[n++ % kinds.length], 8));
  }
  // 崖：西の寒狭川へ、北の坂へ落ちる急な所に岩を出す（足もとの落ち込みが分かるように）
  const rocks = [];
  for (let k = 0; k < 900 && rocks.length < 90; k++) {
    const x = -75 + rr(k * 1.7) * 150, z = -80 + rr(k * 2.3 + 9) * 150;
    if (insideCastle(x, z, 4)) continue;
    const sl = Math.abs(W.heightAt(x + 1.5, z) - W.heightAt(x - 1.5, z)) + Math.abs(W.heightAt(x, z + 1.5) - W.heightAt(x, z - 1.5));
    if (sl < 3.2 || Math.abs(x + 4) < 9 && z < -24) continue;   // 大手道の筋は空ける
    // 11/18 19:40 UTC 持ち主（17:58 の残り「川べり (55,55) の黒い平たい板」）：強右衛門の細道の上に大岩が四つ
    //   （(44.5,49.9) は道の真ん中 0.8m・幅 4.5m）載り、本人と強右衛門が岩の中を抜け、カメラが岩に埋まって黒い板に写った。細道は岩の大きさ＋1.5m 空ける
    const s = 0.8 + rr(k * 5.1) * 1.8;
    //   19:50 UTC：1.5m では細道の脇の岩に後ろのカメラ（本人の後ろ 2〜3m）が 1.2m まで寄り、陰の面が黒い板に写った→カメラの分も空けて 3.5m
    if (distToPolyline(x, z, SUNE_PATH) < s * 1.4 + 3.5) continue;
    rocks.push([x, z, s, k]);
  }
  if (!ROCK_GEO) { ROCK_GEO = rockShape(1, false, 1); ROCK_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, color: 0x9a9284, roughness: 1, metalness: 0 }); }
  const rk = new THREE.InstancedMesh(ROCK_GEO, ROCK_MAT, rocks.length);
  rocks.forEach(([x, z, s, k], i) => {
    e.set((rr(k + 1) - 0.5) * 0.5, rr(k + 2) * 6, (rr(k + 3) - 0.5) * 0.5); q.setFromEuler(e);
    rk.setMatrixAt(i, m4.compose(v.set(x, W.heightAt(x, z) - s * 0.2, z), q, sc.set(s * 1.3, s * (0.75 + rr(k + 4) * 0.5), s)));
  });
  rk.castShadow = true; rk.receiveShadow = true;
  try { groundRocks(W, rk); } catch (err) { console.warn(err); }
  rt.scene.add(rk);
}

// ---------------- 塀の破れ目と寄せ手の動き ----------------
// 塀の区画の外向き（城の中心から離れる向き）
function outward(s) {
  const mx = (s.seg[0] + s.seg[2]) / 2, mz = (s.seg[1] + s.seg[3]) / 2;
  const dx = s.seg[2] - s.seg[0], dz = s.seg[3] - s.seg[1], L = Math.hypot(dx, dz) || 1;
  let nx = -dz / L, nz = dx / L;
  if (nx * (mx - MID.x) + nz * (mz - MID.z) < 0) { nx = -nx; nz = -nz; }
  return { mx, mz, nx, nz };
}
// side：'gate'（大手門）・'w'（北の塀の西）・'e'（北の塀の東）
function assaultFn(rt, side) {
  return (u) => {
    const F = rt.flags;
    const x = u.pos.x, z = u.pos.z;
    if (insideCastle(x, z, -0.4)) {
      // 本丸に入ったら館へ。二の丸なら本丸の門を抜ける
      if (z > IN_Z + 0.8) return F.hall.alive ? F.hall : null;
      if (Math.abs(x - GATE2.x) < 2.2 && z > IN_Z - 3) return { x: GATE2.x, z: IN_Z + 5 };
      return { x: GATE2.x, z: IN_Z - 2.5 };
    }
    // 破れ目（門を含む）があれば、そこから入る
    let gap = null, gd = 45;
    for (const s of F.north) {
      if (s.alive) continue;
      const o = outward(s);
      const d = Math.hypot(x - o.mx, z - o.mz);
      if (d < gd) { gd = d; gap = o; }
    }
    if (gap) {
      const out = (x - gap.mx) * gap.nx + (z - gap.mz) * gap.nz;
      const lat = Math.abs((x - gap.mx) * gap.nz - (z - gap.mz) * gap.nx);
      if (out < 3 && lat < 2) return { x: gap.mx - gap.nx * 6, z: gap.mz - gap.nz * 6 };
      return { x: gap.mx + gap.nx * 2.5, z: gap.mz + gap.nz * 2.5 };
    }
    if (side === 'gate' && F.gate.alive) {
      // 横から扉へ直進すると、塀の当たりに押されて門の脇で止まる。
      // 押し出された門打ちの者も、塀の外の正面へ回ってから取り付く。
      if (Math.abs(x - GATE.x) > 3 || z < N_Z - 12) {
        return { x: GATE.x + (u.id % 3 - 1) * 1.3, z: N_Z - 5 };
      }
      // 門の幅は6m。一度に門を打てるのは前の6人まで。前の者が倒れたら入れ替わる
      const hit = F.gateHit = (F.gateHit || []).filter((q) => q.alive && q.group && !q.group.routed);
      if (hit.includes(u)) return F.gate;
      if (hit.length < GATE_HITTERS) { hit.push(u); return F.gate; }
      // あぶれた者は門のすぐ脇の塀（大手の槍の組の前）を打つ。そこも尽きていれば門の前で控える
      const beside = F.north.filter((q) => q.alive && q !== F.gate && Math.abs((q.seg[0] + q.seg[2]) / 2 - GATE.x) < 9);
      if (beside.length) return beside[u.id % beside.length];
      const k = (u.id % 7) - 3;
      return { x: GATE.x + k * 1.3, z: N_Z - 5 - (u.id % 3) * 1.3 };
    }
    if (!u.segTarget || !u.segTarget.alive) {
      const cands = F.north.filter((s) => s.alive && s !== F.gate && (side === 'w' ? s.seg[0] < GATE.x : side === 'e' ? s.seg[0] > GATE.x : true));
      let best = null, bd = Infinity;
      for (const s of cands.length ? cands : F.north.filter((q) => q.alive)) {
        const o = outward(s);
        const d = Math.hypot(x - o.mx, z - o.mz) + Math.random() * 14;
        if (d < bd) { bd = d; best = s; }
      }
      u.segTarget = best;
    }
    return u.segTarget;
  };
}

// 寄せ手の一隊
// 11/18 16:50 UTC 持ち主（act bot 3回「歯ごたえがない・十九〜二十五人を無傷で討った」＝塀の内で一度も傷を受けない）：
//   井楼（塀より高い物見の櫓）の上の武田の鉄砲は、城の内を見下ろして撃ち込むための物（城攻めの常の手）なのに、一発も撃っていなかった。
//   寄せの段（w1・final）に、本人から18〜80歩の井楼の鉄砲が一、二挺、七〜十秒おきに本人を狙って撃つ（数・強さは変えない。
//   命が七割五分を切ったら撃たない＝傷を負って斬り合いから退かせない。道明寺の hondaFire と同じ形）
function seiroFire(rt, F, dt) {
  const P = rt.player?.u;
  if (F._seiroXZ && !F._seiroOpen && rt.army?.solids?.length) {
    F._seiroOpen = true;
    for (const o of rt.army.solids) {
      const ox = o.x ?? (o.ax != null ? (o.ax + o.bx) / 2 : null), oz = o.z ?? (o.az != null ? (o.az + o.bz) / 2 : null);
      if (ox == null || !F._seiroXZ.some(([x, z]) => Math.hypot(ox - x, oz - z) < 4.5)) continue;
      o.noMissile = true; o.missileH = undefined; o.naka = undefined;
    }
  }
  if (SH.flip) return;   // K661：井楼から城兵の本人を狙う所（d10 の本人は寄せ手）
  if (!F.seiro || (rt.phase !== 'w1' && rt.phase !== 'final') || F.won) return;
  if ((F._sfT = (F._sfT ?? 8) - dt) > 0) return;
  F._sfT = 7 + Math.random() * 3;
  if (!P?.alive || P.hp < P.maxHp * 0.75) return;
  const ready = [];
  for (const g of F.seiro) for (const u of g.units) {
    if (!u.alive || u.reload || u.fleeing || u.downed) continue;
    const d = Math.hypot(u.pos.x - P.pos.x, u.pos.z - P.pos.z);
    if (d > 18 && d < 80) ready.push([d + Math.random() * 10, u]);
  }
  ready.sort((a, c) => a[0] - c[0]);
  // 11/18 20:45 UTC 持ち主（act bot「歯ごたえがない・十六〜十九人を無傷で討った」が続く）：井楼は北の坂の下（塀より低い台）に立ち、
  //   その鉄砲の弾は塀に当たって本人へ届かなかった。寄せ手の弓は塀越しに曲射で射込む（城攻めの常の手）→近い弓三人が本人へ一矢ずつ
  //   （shoot は遠い的に空へ射上げて上から落とす。数・強さは変えない。七割五分を切ったら射ない）
  //   描かずの確かめ（330秒）：本人へ矢26・弾16が飛ぶが当たり0（曲射は散り、当たっても具足で十二→一ほど）。二人を三人に（一回に一、二本当たる見込み）
  const bows = [];
  for (const g of F.enemies) if (g.units) for (const u of g.units) {
    if (u.type !== 'bow' || !u.alive || u.fleeing || u.downed || u.climb) continue;
    const d = Math.hypot(u.pos.x - P.pos.x, u.pos.z - P.pos.z);
    if (d > 16 && d < 70) bows.push([d, u]);
  }
  bows.sort((a, c) => a[0] - c[0]);
  bows.slice(0, 3).forEach(([, bow], k) => rt.after(0.5 + k * 0.4, () => {
    if (!bow.alive || !P.alive || P.hp < P.maxHp * 0.75) return;
    bow.heading = Math.atan2(P.pos.x - bow.pos.x, P.pos.z - bow.pos.z);
    bow.arrowAmmo = Math.max(bow.arrowAmmo ?? 24, 1);
    // 11/18 21:50 UTC 持ち主（act bot 籠城 333秒「二十人を無傷で討った」・止めて立つ本人も五分で二度しか傷を受けない）：曲射は散りが三m あり、
    //   三十本射ても当たり0だった。狙って射込む三人だけ散りを三分の一に（本人の頭上へ降る。七割五分を切ったら射ないのは同じ）
    //   描かずの確かめ：散りを縮めても三十本とも本人の一・五m 奥（射手から見て向こう）の地面に落ちた（胸の高さを狙った矢が足元まで降りる分と、
    //   上から降る矢が筒の半径 0.3m に入らない分）→ 狙いを射手の側へ一・六m 手前に置く（〇・八m では一m 奥へ落ちた）
    bow.lobAim = 0.35;
    const dd = Math.hypot(P.pos.x - bow.pos.x, P.pos.z - bow.pos.z) || 1;
    rt.army.shoot(bow, P, null, { x: P.pos.x - (P.pos.x - bow.pos.x) / dd * 1.6, y: P.pos.y, z: P.pos.z - (P.pos.z - bow.pos.z) / dd * 1.6 });
    bow.lobAim = 0;
  }));
  ready.slice(0, 1 + (Math.random() < 0.4 ? 1 : 0)).forEach(([, u], k) => rt.after(k * 0.3, () => {
    if (!u.alive || !P.alive || P.hp < P.maxHp * 0.75) return;
    const fl = Math.hypot(u.pos.x - P.pos.x, u.pos.z - P.pos.z) / 160, v = P.vel || { x: 0, z: 0 };
    const aim = { x: P.pos.x + v.x * fl, y: P.pos.y, z: P.pos.z + v.z * fl };
    u.gunAmmo = Math.max(u.gunAmmo ?? 20, 1);
    u.heading = Math.atan2(aim.x - u.pos.x, aim.z - u.pos.z);
    if (u.mesh) u.mesh.rotation.y = u.heading;
    if (rt.army.fireGun(u, P, null, aim)) rt.army.startReload(u);
  }));
}

// 11/18 16:30 UTC 持ち主（act bot 信長で出陣 271秒 final：名の無い鉄砲六人の組が号令 attack のまま二の丸 (27,5) で一点に重なる★★）：
//   本人の小さい鉄砲の組（十二人以下）は塀の内に据える手から漏れ、付いて回るうちに共通の「一緒に突っ込む」で『かかれ』になり、
//   城の内で敵を追って固まった。小さい鉄砲の組も北の塀の東の内（大きい組と槍の組の間）に据え、撃ち続けさせる（本人の号令で外れる）
function smallGun(rt) {
  if (SH.flip) return;   // K661：城兵の本人の組だけ（d10 の本人は寄せ手）
  for (const g of rt.army.groups) if (g.isPlayerSquad && g.count <= 12 && g.order === 'follow' && g.units.some((u) => u.alive && u.type === 'gun') && g.units.filter((u) => u.alive && u.type === 'gun').length >= g.count * 0.6) {
    g.order = 'hold'; g.anchor = { x: 18, z: N_Z + 4 }; g.facing = Math.PI; g.formation = 'line'; g.width = Math.max(g.width || 0, 10); g._heldByCmd = rt.t;
  }
}

function takedaGroup(rt, side, o, list) {
  const F = rt.flags;
  // 最後の大きな寄せは数で押す分、一人一人の突きは少し弱める（最初の戦なので、初めての人が倒れすぎないように）
  const g = enemyGroup(rt, { faction: 'takeda', facing: 0, order: 'assault', fleeDir: { x: 0, z: -1 }, width: 10, aggro: 8, morale: 100, dmgMult: rt.phase === 'final' ? 0.45 : 1, dmgMultPlayer: 1, ...o }, list);
  // 11/18 21:55 UTC 持ち主：K360⑦（kaito 11/17「全ての戦に敵の手加減外して」）。総がかりの〇・四五は味方の城兵へだけ（城兵が崩れ過ぎない）、本人へは一
  //   （act bot 二戦とも「十六〜二十四人を無傷で討った」）
  g.assault = assaultFn(rt, side);
  g.bornT = rt.t;
  F.enemies.push(g);
  return g;
}

// 破れた塀と門を繕う
function repairWalls(rt) {
  const F = rt.flags;
  let n = 0;
  for (const s of F.north) {
    if (s.alive) continue;
    s.alive = true; s.hp = s.maxHp; s.mesh.visible = true;
    if (s.stumps) { rt.scene.remove(s.stumps); s.stumps = null; }
    if (s === F.gate) for (const lv of s.mesh.userData.leaves) { lv.rotation.x = 0; lv.position.y = 0; }
    n++;
  }
  return n;
}

const gone = (g) => !g || g.count === 0 || g.routed;

// 始めの眺め：城主が「見よ」と言う間（一の寄せの前）だけ、持ち場の真上の櫓ほどの高さから塀越しに見下ろす。
// 胸の高さの塀と台地の肩の陰にならず、坂の竹束・北の原の寄せ手の大軍・左手の崖の下の寒狭川が一つの画面に入る。
// 共通の「大事な所を見せる」視点（cine）の間だけ。本人が視点を触る・動く・動きを減らす設定なら、いつもの肩越しへ戻す。
const OPEN_END = 14, OPEN_EYE = new THREE.Vector3(), OPEN_LOOK = new THREE.Vector3();
function nagaOpening(rt, pos, look) {
  const F = rt.flags, P = rt.player, u = P && P.u, t = rt.t;
  if (F.openOff || t > OPEN_END || rt.over || !u) return;
  const sp = nagashinojo.spawn;
  if (!F.openCine) {
    if (t < 0.5) return;
    F.openCine = true;
    if (SETTINGS.reduceMotion || P.lock) { F.openOff = true; return; }
    P.cine = { x: -40, z: -76, t: OPEN_END - t, vista: true, encounter: true };
  }
  if (!P.cine?.vista || Math.hypot(u.pos.x - sp.x, u.pos.z - sp.z) > 2.5) { F.openOff = true; if (P.cine?.vista) P.cine = null; return; }
  const sm3 = (v) => { const k = Math.max(0, Math.min(1, v)); return k * k * (3 - 2 * k); };
  const s = sm3((t - 0.6) / 1.8) * (1 - sm3((t - (OPEN_END - 3)) / 3));
  // 寄せ手の大軍は霧（九十メートルほど）の手前に置いてあるので、持ち場の少し後ろの上（十三メートル）から見る
  const W = rt.world, gy = W.heightAt(sp.x, sp.z);
  OPEN_EYE.set(sp.x + 2, gy + 13, sp.z + 4);
  OPEN_LOOK.set(-40, 3, -76);
  // 見下ろす間だけ霞を遠くへ（共通の霧の式は一コマごとに戻す。小数の部分は雲の影の濃さなので残す）
  const fog = W.scene && W.scene.fog, far = 90 + 150 * s;
  if (fog && fog.far < far) { fog.far = far + (fog.far % 1); if (W.mountU) W.mountU.vis.value = Math.max(W.mountU.vis.value, far); }
  pos.lerp(OPEN_EYE, s); look.lerp(OPEN_LOOK, s);
}

// ======================================================================
const NAGA_DEPTH_FLIP = { ...nagaDepth, A: { ...nagaDepth.A, team: 1 }, B: { ...nagaDepth.B, team: 0 } };   // K661：武田編 d10
let wallLift = 0;   // 塀ぎわの肩越しの持ち上げ（camLift の値。毎コマ update で寄せる）

// ---------------- K651：戦場を建てる所（地形の上の塀・門・館・蔵・櫓・竹束・陣・村） ----------------
// 籠城の遊び（兵・組・台詞・段・旗）は作らない。ほかの家の同じ戦（武田編 d10 長篠城攻め）は nagaField(rt, 1) 一つを呼び、
//   遊ぶ側・備・行き先・勝ち負けだけ入れ替える（docs/k651_howto.md）。team は城の側（籠城の本人＝0・寄せ手の本人＝1）
export const NAGA_FIELD = {
  look(rt, team = 0) {
    const W = rt.world;
    const high = true;
    // ----- 塀と門 -----
    // 塀は厚い板塀（鉄砲の狭間の所は槍が届かないので、一の寄せで破れすぎないよう強めに）
    const wopt = { team, hp: 800, segLen: 6, name: '塀', mesh: hei, sama: 1.8 };
    const north = [
      ...wallLine(rt, [[W_X, N_Z + 4], [W_X + 4, N_Z], [GATE.x - 3, N_Z]], wopt),
      ...wallLine(rt, [[GATE.x + 3, N_Z], [E_X - 4, N_Z], [E_X, N_Z + 4]], wopt),
    ];
    const gate = rt.army.addStruct({ seg: [GATE.x - 3, N_Z, GATE.x + 3, N_Z], hp: 2200, maxHp: 2200, armor: 0.3, team, name: '大手門' });
    gate.mesh = gateDoors(W, GATE.x, N_Z, 6);
    rt.scene.add(gate.mesh);
    rt.scene.add(kabukimon(W, GATE.x, N_Z, 6.4, 0, { doors: false }));
    north.push(gate);
    const rest = { team, hp: 99999, segLen: 6, name: '塀', mesh: hei, sama: 1.8 };
    wallLine(rt, [[E_X, N_Z + 4], [E_X, S_Z - 5], [E_X - 5, S_Z], [KARA.x + 3, S_Z]], rest);
    wallLine(rt, [[KARA.x - 3, S_Z], [W_X + 5, S_Z], [W_X, S_Z - 5], [W_X, N_Z + 4]], rest);
    rt.scene.add(kabukimon(W, KARA.x, S_Z, 5.4));
    // 本丸と二の丸の境
    wallLine(rt, [[W_X, IN_Z], [GATE2.x - 3, IN_Z]], rest);
    wallLine(rt, [[GATE2.x + 3, IN_Z], [E_X, IN_Z]], rest);
    rt.scene.add(kabukimon(W, GATE2.x, IN_Z, 6));
    // ----- 館・蔵・櫓・幟 -----
    const hall = rt.army.addStruct({ x: HALL.x, z: HALL.z, r: 5, solidR: 4.8, hp: 2600, maxHp: 2600, armor: 0.35, team, name: '本丸の館' });
    // 写真の館・蔵の薄い板葺き。高画質だけ石置きを外し、押さえ木と褪色を残す。
    const castleRoof = high ? { ita: true, boardRoof: true, weatheredBoards: true } : {};
    hall.mesh = raisedCastleHut(W, HALL.x, HALL.z, 11, 7, Math.PI, { h: 3.1, wall: 0x6e5a44, ...castleRoof });
    rt.scene.add(hall.mesh);
    rt.army.addStruct({ x: KURA.x, z: KURA.z, r: 3, solidR: 3.2, hp: 1e9, maxHp: 1e9, team, name: '兵糧蔵' });
    rt.scene.add(raisedCastleHut(W, KURA.x, KURA.z, 6.5, 5, Math.PI, { h: 2.9, wall: high ? 0x99876b : 0xcfc6b0, ...castleRoof }));
    // 11/18 17:10 UTC 持ち主（act bot 122秒 lull：蔵の東 (22,-7) で前へ進めない★★）：俵の山が蔵の当たり（半径三・二m）と一m ほどの隙間で
    //   挟み、本人が角に挟まった→俵の山を蔵から二m 余り離し、間を人が抜けられる広さにする
    rt.scene.add(tawara(W, KURA.x + 6.6, KURA.z - 1.2, 0.3, 6), tawara(W, KURA.x - 6.2, KURA.z + 1, -0.4, 5));
    rt.scene.add(hut(W, 14, 26, 6, 4, Math.PI / 2, { roof: 0x6a5c44, ...castleRoof }));
    // 櫓：梯子で登れる形にする（monomi。床の層はもうある。kaito 10/2）。大手に近い二つには鉄砲を上げ、高さの分だけ遠くへ届かせる
    const towers = [[-13, N_Z + 4], [7, N_Z + 4], [E_X - 5, N_Z + 5], [W_X + 5, N_Z + 5], [E_X - 5, S_Z - 5], [W_X + 5, S_Z - 6]]
      .map(([x, z], i) => {
        // 高さは従来の八・八メートル。床・梯子・守兵を動かさず、先細りの骨組みを直す。
        const t = monomi(rt, x, z, { name: '櫓', ...(high ? { logFrame: true, height: 8.8, boarded: i < 2, mon: 'okudaira', team } : {}) });
        rt.scene.add(t.mesh); return t;
      });
    for (const [x, z, k] of [[-8, N_Z + 3, 'okudaira'], [2, N_Z + 3, 'okudaira'], [-24, -8, 'tokugawa'], [18, 4, 'okudaira'], [-20, 20, 'okudaira'], [-8, 20, 'tokugawa'], [GATE2.x - 4, IN_Z + 2, 'okudaira'], [GATE2.x + 4, IN_Z + 2, 'okudaira']]) rt.scene.add(nobori(W, x, z, k, 5.5));
    return { north, gate, hall, towers };
  },
  scenery(rt) {
    const W = rt.world;
    const high = true;
    siegeLayers(rt);
    // 竹束の後ろの井楼（上の鉄砲の寄せ手は籠城の遊びの側に残す）
    for (const [x, z] of [[-34, -44], [27, -44]]) {
      rt.scene.add(yagura(W, x, z, { height: 7.4, kind: 'seiro', boarded: false, fieldFrame: true, mon: 'takeda', team: SH.tak }));
      rt.scene.add(nobori(W, x + 1.4, z - 0.6, 'takeda', 7.4 + 5));
    }
    if (high) {
      // 天正三年の山上の寄せ陣。設楽原の三重柵を城前へ移さず、陣の左右を守る。
      // 大手への道、出撃する組、本陣の正面の口は空ける。兵数と備の密度はそのまま。
      for (const x of [-48, -12]) {
        // 線の右側が柵の外。西側だけ始終点を反転し、横木と乱杭を外、控えを陣内へ。
        rt.scene.add(bobosaku(W, x < -30 ? [x, -157, x, -173] : [x, -173, x, -157]));
        // 写真の細竹を詰めた四束。近くのみ十九本、四十五メートル以遠は七本へ戻す共有形。
        for (const z of [-165, -161]) rt.scene.add(takataba(W, x + (x < -30 ? 2 : -2), z, x < -30 ? -Math.PI / 2 : Math.PI / 2, { fieldBundle: true }));
      }
      // 写真の無紋の板二枚楯。表を城側（南）、控え棒を陣側へ向ける。
      // 写真のように二枚ずつ寄せ、組の間を空ける。九メートルに六組、組間は約四十三センチ。
      // 空いた所は当たりも抜き、中央の通り口と兵の並びは保つ。
      // 八巡目：写真の黄褐色の木地と地際の泥。二枚の板色を違え、黒帯と控え棒は保つ。
      const shields = { fieldPairs: true, fieldTimber: true };
      rt.scene.add(tateNarabi(W, -34, -152, -43, -152, shields),
        tateNarabi(W, -17, -152, -26, -152, shields));
      // 陣幕の後ろに花菱の旗を等間隔に立て、軍勢の背後にも同じ家の旗列を置く。
      for (let i = 0; i < 5; i++) {
        rt.scene.add(nobori(W, -38 + i * 4, -172, 'takeda', 5.5));
        rt.scene.add(nobori(W, 11 + i * 12, -126, 'takeda', 5.5));
      }
      // 写真の物見は上の楯囲いの下に張り出し床と手すりがある。
      // 八巡目：横桟だけだった手すりに縦格子を入れ、上段の明るい板楯を裏桟へ縄で留める。
      // 既存の共有形へ結合し、八十五メートル先では格子・縄・床の継ぎ目を省く。
      // 井楼と見張りは戦場の端（176m）の内へ五m寄せる（見張りが戦場の外に数えられていた 11/18 見回り）
      rt.scene.add(yagura(W, -53, -172, { height: 8.8, boarded: false, fieldFrame: true, fieldGallery: true,
        fieldDetail: true, fieldLashings: true, barkPosts: true, mon: 'takeda', team: SH.tak }));
    }
    // 北東の角の外の斜面に、武田の金掘りの穴（坑は城の方＝南西へ掘り進み、口と土の山は外＝北東）
    rt.scene.add(kanahoriPit(W, 40, -34, -0.8));
    // 宇連川の鳴子の綱（強右衛門が抜けた所の川上と川下に二筋）
    rt.scene.add(narukoRope(W, [62, 60.5], [64.5, 72.5]), narukoRope(W, [30, 58.5], [31, 70.5]));
    // 遠景の村（寒狭川の向こうの山すそ）
    farVillage(rt, -104, 100, { rot: -Math.PI / 2, n: 6, fields: 8, seed: 12 });
  },
  haritsuke(rt, x, z) { const c = haritsuke(rt.world, x, z); rt.scene.add(c.grp); return c; },
};
export function nagaField(rt, team = 1) {
  const r = NAGA_FIELD.look(rt, team);
  NAGA_FIELD.scenery(rt);
  return r;
}
// 戦場の物差し（城の塀の四方・大手門・搦手・館・蔵・川筋・崖の細道・鳴子）
// K667：二日後の段の持ち場への運び。本人が塀の外（強右衛門を送った崖道）なら、崖道の一番近い所から搦手の口へ逆に辿ってから、
//   塀の内の持ち場へ。一コマの動きは六m 未満（audit の pjump に掛からない）。運ぶ間は「塀の外へ出るな」の数えを止める
function nagaGlideHome(rt, x, z, done) {
  const u = rt.player?.u, F = rt.flags; if (!u) return;
  const pts = [];
  if (!insideCastle(u.pos.x, u.pos.z)) {
    let bi = 0, bd = Infinity;
    for (let i = 0; i < SUNE_PATH.length; i++) { const d = Math.hypot(SUNE_PATH[i][0] - u.pos.x, SUNE_PATH[i][1] - u.pos.z); if (d < bd) { bd = d; bi = i; } }
    for (let i = bi; i >= 0; i--) pts.push(SUNE_PATH[i]);
  }
  pts.push([x, z]);
  let len = 0, px = u.pos.x, pz = u.pos.z;
  for (const [qx, qz] of pts) { len += Math.hypot(qx - px, qz - pz); px = qx; pz = qz; }
  if (len <= 6) { u.pos.x = x; u.pos.z = z; done(); return; }
  F._nGlide = { pts: [[u.pos.x, u.pos.z], ...pts], len, t: 0, dur: Math.min(5, Math.max(1.5, len / 12)), done };
}
function nagaGlideTick(rt, dt) {
  const F = rt.flags, G = F._nGlide, u = rt.player?.u; if (!G || !u) return;
  if (!u.alive || rt.over) { F._nGlide = null; return; }
  G.t += dt; F.outT = 0;
  const k0 = Math.min(1, G.t / G.dur), k = k0 * k0 * (3 - 2 * k0);
  let want = k * G.len, i = 1, x = G.pts[0][0], z = G.pts[0][1];
  for (; i < G.pts.length; i++) {
    const [ax, az] = G.pts[i - 1], [bx, bz] = G.pts[i], L = Math.hypot(bx - ax, bz - az);
    if (want <= L || i === G.pts.length - 1) { const f = L > 0 ? Math.min(1, want / L) : 1; x = ax + (bx - ax) * f; z = az + (bz - az) * f; if (want > 0.01 || i > 1) u.heading = Math.atan2(bx - ax, bz - az); break; }
    want -= L;
  }
  u.pos.x = x; u.pos.z = z; u.pos.y = rt.world.heightAt(x, z);
  u.mesh?.position.copy(u.pos); u.moveTo = null; if (u.vel) { u.vel.x = 0; u.vel.z = 0; }
  if (k0 >= 1) { F._nGlide = null; G.done(); }
}
export const NAGA_AT = { N_Z, S_Z, W_X, E_X, IN_Z, GATE, GATE2, KARA, HALL, KURA, KANSA, URE, TOYO, OTE, SUNE_PATH, naruko: [[62, 60.5, 64.5, 72.5], [30, 58.5, 31, 70.5]], kanahori: { x: 40, z: -34 }, honjin: { x: -30, z: -162 } };

export const nagashinojo = {
  // K564（11/22 クラウド 長篠城の持ち主）：記憶4GB 以下の携帯は、布陣の表と厚みの備が予算（205）いっぱいまで立った上に大手・北の塀の寄せ（四十人ほど・上限を見ずに立つ）が足され 30〜60秒 218〜231 に越えた。
  //   その携帯だけ表と厚みの備の上限を予算より四十手前に（寄せ・名のある将・城の兵は同じ）。記憶の多い携帯は250・パソコンは今まで通り
  realCap: isTouch ? (MEM_BUDGET.real ? MEM_BUDGET.real - 40 : 250) : 250 + fujinRealN('nagashinojo'),   // 11/20 クラウド17（kaito_now ③）：パソコンは布陣の表の分を足す
  // 始めの持ち場は北の塀の西の端、塀のすぐ内。塀から離れると塀の陰で坂の下が隠れる。
  // ここからなら塀越しに、坂の竹束と北の原の寄せ手の大軍、左手に西の崖の下の寒狭川が一つの画面に入る
  spawn: { x: -28, z: -20.8, heading: 3.1 },
  // 物差し⑥ 初めての目（11/18 クラウド）：侍大将の位で出ると、本人だけ馬に乗ったまま塀の内（幅六十m の台地の城）を駆けていた。
  //   籠城の五百は塀の狭間と梯子の口で戦い、搦手の崖の細道も馬では下りられない。本人も徒歩で持ち場に立つ（城の中に馬は出さない）
  noHorse: true,
  // 11/19 09:00 UTC 持ち主（描かずの流し・立つだけの本人：二日後の段の333〜363秒に本人が南の塀の外 (18.7,49.8) へ歩き出て「戻れ！塀の外へ出るな」と叱られた）：
  //   三十秒手を離した本人は行き先のピンへ歩く（player.js autoLead）。二日後の段のピンは宇連川の向こうの磔の場で、城の外だった。
  //   強右衛門を送る段（sune）のほかは、行き先が塀の外なら塀の内の一番近い所（南の塀ぎわなら対岸の磔が見える所）までにする
  // 11/21 持ち主（act bot 信長で出陣 3回に1回、総がかりの段 281秒に本丸 (0,13) で小山田の後ろ二組に囲まれ足軽の槍 60 を二度受けて倒れた）：
  //   信長で出陣の総がかりの段だけ受ける傷を八割（K360⑦ の下限・高遠や山中と同じ。敵の数・強さは同じ）
  takenMult(rt) { return rt.G?.lord && rt.phase === 'final' ? 0.8 : 1; },
  // K564（11/22 09:50 UTC 持ち主）：信長で出陣では旗本の鉄砲百人が幅六十m の城の中へ湧き、一コマ約24ms（籠城の版 約7ms・frame_prof MOBILE=1 250秒 40コマ）。
  //   11/21 18:50 に足した供の数の決まりが main から消えていたので戻す（森部・本能寺と同じく供を二十四挺に）
  lordHata: { gun: 24 },
  autoLeadTarget(rt) {
    if (rt.phase === 'sune' || rt.phase === 'brief' || rt.phase === 'end') return null;
    let q = null; try { q = missionTarget(rt); } catch (e) { return null; }
    if (rt.phase === 'news' && !q) q = { x: 16, z: 77 };
    if (!q || !Number.isFinite(q.x) || !Number.isFinite(q.z) || insideCastle(q.x, q.z)) return null;
    return { x: Math.max(W_X + 3, Math.min(E_X - 3, q.x)), z: Math.max(N_Z + 3, Math.min(S_Z - 3, q.z)), r: 3 };
  },
  // 11/19 02:50 UTC 持ち主（物差し⑥ 40秒の写真：北の塀の内に立つと、塀（二・三m）が坂の寄せ手を隠し、見えるのは井楼と幟だけ）：
  //   塀ぎわ（内六m）に立つ間は、肩越しの目を一・八m 上げて塀の上から坂を見下ろす（石打棚に上がった城兵の目の高さ）。離れれば戻す
  get camLift() { return wallLift; },
  quietArmyCalls: true,   // K358（検品 11/17）：守る戦・忍ぶ戦で備ひとつの崩れに「味方が追撃に移った」の字が浮いた
  frameCamera: nagaOpening,
  depth: (rt) => (SH.flip ? NAGA_DEPTH_FLIP : nagaDepth),   // K661：d10（武田の側）は陣立ての側も入れ替える   // 城を囲む武田の備（docs/fujin/nagashinojo.md）
  // 11/18 クラウド長篠城の持ち主（K285「本物の兵しか映したらいけない」・描かずに数えた見せかけの兵 0秒 11520人・90秒 6256人）：絵だけの兵を作らない。
  //   遠景の寄せ手の大軍（addDistantArmy・farHost）・寄せの控え（backOf）は空の入れ物になり、近い所から本物の備に替わる（depth_real.js）
  noWake: true,   // 籠城なので、遠くの寄せ手の軽い兵は本物に替えない（KIT の wake）
  tutorialHold: 30,   // 初めての手ほどきの間は、一の寄せを30秒まで遅らせてよい（battle.js）
  world: {
    noFake: true,   // K285：上の印の訳
    clearAir: true,   // 11/21 クラウド17（司令塔：携帯の写真で北の坂の寄せ手が霧の白に消えた）：霧の端を空気の見通しへ（設楽原・姉川と同じ）。兵を描く遠さ・数・敵の見通しは同じ
    runnerWay: nagaRunnerWay,
    moveWay: nagaRunnerWay,
    // 退く武田兵は、北の原の大軍の列の手前で消す
    fleeOut: (x, z, team) => team === SH.tak && z < -104,   // K661：武田の側（d10 では team 0）
    seed: 75,
    // 城内の井楼だけ、写真の垂直な通し柱と交互に積んだ横木を使う。
    lookoutLogFrame: true,
    muddy: 0.2,
    time: 'day',
    // 11/21 クラウドす（kaito_now ③・iMac 03:55 の手放し）：携帯では霧の端が六十m 余りで、北の原の寄せ手の列（塀から五十〜六十m）が霧に溶けて大軍に見えなかった。
    //   天王寺岡山・関ヶ原と同じ晴れた五月の空気に（world_update.js clearAir・霧の数字だけ。兵を描く遠さ・数・敵の見通しは同じ）
    clearAir: true,
    paths: [],
    height: heightFn,
    tint(x, z, h, c) {
      const n = Math.sin(x * 0.37) * Math.cos(z * 0.29) * 0.04;
      // 崖：急な所は岩肌
      const sl = Math.abs(heightFn(x + 1.5, z) - heightFn(x - 1.5, z)) + Math.abs(heightFn(x, z + 1.5) - heightFn(x, z - 1.5));
      if (sl > 2.2) { const k = Math.min(1, (sl - 2.2) / 2.5); c.lerp(new THREE.Color(0.35 + n, 0.32 + n, 0.28 + n), k); }
      // 城の中は踏み固められた土
      if (insideCastle(x, z, 1)) c.setRGB(0.40 + n, 0.35 + n, 0.26 + n);
      // 大手道と、崖の細道
      const pd = Math.min(distToPolyline(x, z, OTE) - 1.2, distToPolyline(x, z, SUNE_PATH) - 0.2);
      if (pd < 1.6) c.setRGB(0.39 + n, 0.33 + n, 0.23);
      // 川原：石まじりの砂
      const rd = Math.min(distToPolyline(x, z, KANSA), distToPolyline(x, z, URE), distToPolyline(x, z, TOYO));
      if (rd < 12 && rd > 7) c.lerp(new THREE.Color(0.46, 0.44, 0.39), 0.7);
    },
    clear: (x, z) => insideCastle(x, z, 6) || (Math.abs(x + 4) < 40 && z < -24 && z > -105) || Math.hypot(x + 114, z - 100) < 40,   // 最後は西の村
    streams: [{ pts: KANSA, w: 7, depth: 3.4 }, { pts: URE, w: 7, depth: 3.4 }, { pts: TOYO, w: 8, depth: 3.6 }],
    trees: 440,
    tufts: 3600,
    treeDensity: (x, z) => (Math.abs(x) < 70 && z > -110 && z < 55 ? 0.25 : 1),
    groves: [{ x: 35, z: 118, r: 22, n: 40 }, { x: -120, z: -40, r: 18, n: 30 }, { x: 70, z: -60, r: 12, n: 16 }, { x: -85, z: 120, r: 16, n: 24 }],
  },

  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    const high = true;
    shSide(!!this.sideFlip);   // K661：武田編 d10（sideFlip）は側を入れ替える（setup の頭で決める）
    F.enemies = [];
    F.mor = 60;   // 城兵の士気
    resetLadders();
    flReset();
    F.ladders = [];
    if (K.hpBars !== false) F.hpBars = hpBarSystem(rt);
    // K651：塀・門・館・蔵・櫓（武田の d10 と同じ所から建てる）
    const { north: _n, gate: _g, hall: _h, towers } = NAGA_FIELD.look(rt, SH.oda);
    F.north = _n; F.gate = _g; F.hall = _h;
    F.yagura = towers;
    [towers[0], towers[1]].forEach((t) => {
      const grp = allyGroup(rt, { faction: 'tokugawa', name: '櫓の鉄砲', anchor: { x: t.x, z: t.z }, facing: Math.PI, width: 1, aggro: 9, noRout: true },
        [{ type: 'gun', n: 1, o: { flag: 'okudaira', x: t.x, z: t.z, range: 140 } }]);
      grp.units[0].pos.y = t.topY;
    });

    // ----- 味方：奥平信昌と城兵 -----
    // 本丸の門を守る護衛。遠い寄せ手への攻撃に切り替えず、近づいた敵だけを迎え撃って持ち場へ戻る。
    const oku = allyGroup(rt, { faction: 'tokugawa', name: '奥平信昌', anchor: { x: GATE2.x, z: 2 }, facing: Math.PI, noRout: true, aggro: 4, width: 5, guard: true, guardSight: 14, guardLeash: 4, seekRange: 14 },
      [{ type: 'busho', n: 1, o: { name: '奥平信昌', invuln: true, flag: 'okudaira' } }, { type: 'samurai', n: 4, o: { flag: 'okudaira', invuln: true } }]);
    F.oku = oku.units[0];
    const flagOf = (i) => (i % 3 === 2 ? 'tokugawa' : 'okudaira');
    F.allies = [];
    // 槍の組は塀にぴったり付いて立つ（塀から 1.5m より離れると、塀越しに槍が届かない：units.js の wallBetween）
    // 大手の脇と、北の塀の東西の端を受け持つ。鉄砲の組とは持ち場を分ける（同じ所に並ぶと押し合って、どちらも塀から離れる）
    // 塀際で迎え撃つ守備隊。寄せ手を追う攻撃や、鉄砲隊の前へ出る判断で塀に詰まらせない。
    [[GATE.x, 14, 10], [-31, 12, 7], [25, 12, 7]].forEach(([x, n, w], i) => {
      F.allies.push(allyGroup(rt, { faction: 'tokugawa', name: '槍の組', anchor: { x, z: N_Z + 1.2 }, facing: Math.PI, width: w, spacing: 1.45, aggro: 7, noRout: true, guard: true, wallGuard: true, guardSight: 14, guardLeash: 1, seekRange: 14 },
        [{ type: 'samurai', n: 1, o: { flag: flagOf(i) } }, { type: 'ashigaru', n, o: { flag: flagOf(i) } }]));
    });
    // 鉄砲の組は北の塀の狭間の真後ろに一人ずつ（狭間は 1.8m ごと。槍の組の間に、塀に付いて立つ）
    // 隊の自動判断で狭間から離れ、本丸の塀に阻まれないよう持ち場を保つ。兵ごとの射撃と装填は続ける。
    // 狭間は一人一穴。既定の二段交代で、後列の持ち場と狭間への移動を競合させない。
    for (const [x, i] of [[-18, 0], [12, 1]]) {
      F.allies.push(allyGroup(rt, { faction: 'tokugawa', name: '鉄砲の組', anchor: { x, z: N_Z + 0.7 }, facing: Math.PI, width: 9, spacing: 1.8, ranks: 1, aggro: 6, noRout: true, noAI: true },
        [{ type: 'gun', n: 9, o: { flag: flagOf(i) } }]));
    }
    // 本丸を守る控えは遠い寄せ手を追わず、近づいた敵を迎え撃って館の前へ戻る。
    F.guard = allyGroup(rt, { faction: 'tokugawa', name: '本丸の守り', anchor: { x: HALL.x, z: HALL.z - 7 }, facing: Math.PI, width: 6, aggro: 9, noRout: true, guard: true, guardSight: 14, guardLeash: 4, seekRange: 14 },
      [{ type: 'samurai', n: 1, o: { flag: 'okudaira' } }, { type: 'ashigaru', n: 8, o: { flag: 'okudaira' } }]);
    F.allies.push(F.guard);

    // ----- 武田の大軍（遠景） -----
    // この戦の高画質の槍隊だけ、写真の斜めにそろう長槍と旗指物の列を使う。
    // 風林火山の大旗は本陣に残し、足軽の指物は武田の花菱にそろえる。
    // 兵数・隊の広さ・遠近の形は変えず、共通の軍勢への指定は増やさない。
    const DA = (x, z, w, d, count, facing, armor, flag, seed, kind) => high && kind === 'spear'
      ? W.addDistantArmy({ x, z, w, d, count, facing, armor, flagTex: flagTexture('takeda'), mon: 'takeda', seed, kind, fieldRanks: true })
      : farHost(rt, x, z, w, d, count, facing, armor, flag, seed, kind);
    const face = (x, z) => Math.atan2(MID.x - x, MID.z - z);
    const TD = ARMOR.takeda, AK = ARMOR.akazonae;
    // 北の原：城を囲む寄せ手の列（前に鉄砲と槍の備）
    // 霧（約九十メートル）の手前に置き、塀際から坂の下の寄せ手の列が見えるようにする
    // 後詰め扱い（host）の軽い兵は、カメラから七十メートルの内では本物の兵に替わる前提で間引かれる。
    // 籠城は本物に替えない（noWake）ので、この二つは host にせず、塀の内から見える距離でも描く
    F.siege = [W.addDistantArmy({ x: -40, z: -99, w: 70, d: 12, count: 380, facing: 0, armor: TD, flagTex: flagTexture('takeda'), mon: 'takeda', seed: 71, kind: 'mixed', host: false }),
      W.addDistantArmy({ x: 35, z: -97, w: 70, d: 12, count: 360, facing: 0, armor: TD, flagTex: flagTexture('takeda'), mon: 'takeda', seed: 72, kind: 'spear', fieldRanks: true, host: false })];
    NAGA_FIELD.scenery(rt);   // K651：竹束・井楼・寄せ陣の柵と楯・金掘りの穴・鳴子・村（武田の d10 と同じ所から建てる）
    // 検品 11/17（iMac n-kwatch）：開戦と寄せの合間に、塀の内から寄せ手が一人も見えない（北の坂は塀より二〜十m 下で、塀に隠れる）。
    //   城攻めの常の手の井楼（丸太を井桁に組んだ物見の櫓）を、竹束の後ろの台の上に大手道を避けて左右二つ組み、上に鉄砲の寄せ手を三人ずつ。
    //   塀より高い所に武田の兵と旗が立ち、城の内から寄せ手が見える（小谷の井楼の場面 docs/books/sengoku_manga.md を手本に推した）
    for (const [x, z] of [[-34, -44], [27, -44]]) {
      // 11/18 クラウド17（act bot「歯ごたえがない・無傷」：井楼の鉄砲の弾が百二十秒で九発とも撃ち手の手元の井楼の柱（置き物 s）に当たって止まり、本人へ届かなかった）：
      //   板を張らない丸太組みの井楼の当たりは弾を止めない（柱の間から撃つ）。歩く当たりはそのまま
      F._seiroXZ = (F._seiroXZ || []).concat([[x, z]]);
      const top = { x, z, y: W.heightAt(x, z) + 7.4 * .68 + .05 };
      const g = enemyGroup(rt, { faction: 'takeda', name: '井楼の鉄砲', anchor: top, facing: 0, width: 2, aggro: 0, noAI: true, noRout: true, holdFire: true },
        [-0.7, 0, 0.7].map((dx) => ({ type: 'gun', n: 1, o: { flag: 'takeda', x: x + dx, z: top.z } })));
      (F.seiro = F.seiro || []).push(g);
      // 井楼の上の者は塀の内の鉄砲に初めの三十秒で撃ち落とされ、寄せの間に一発も撃てなかった→的にしない（撃ち込む役。数は増やさない）
      for (const u of g.units) u.noTarget = true;
      g.units.forEach((u, k) => { const at = { x: x + (k - 1) * 0.7, z: top.z, y: top.y }; u.perch = at; u.pos.set(at.x, at.y, at.z); u.mesh.position.copy(u.pos); });
    }
    // 11/18 22:55 UTC 持ち主（K281 の物差し：描かずの通しで九十秒に本人から三十〜六十m の敵の本物の兵が十八人だけ。北の坂は塀に隠れ、
    //   寄せの合間は塀の外に武田が居ない城に見える）：城攻めの常の手の仕寄り＝竹束の二列の陰に、武田の鉄砲の寄せ手を大手道の左右に六人ずつ据え、
    //   籠城の間ずっと塀へ撃ちかける（動かない・攻めの波には入れない。塀の内の鉄砲の的にはなる）
    F.shiyori = [-20, 14].map((x) => enemyGroup(rt, { faction: 'takeda', name: '竹束の鉄砲', fixed: true, anchor: { x, z: -45 }, facing: 0, order: 'hold', aggro: 0, noRout: true, width: 5 },
      [{ type: 'samurai', n: 1 }, { type: 'gun', n: 5 }]));
    // 医王寺山の勝頼の本陣と、その前と脇の備（赤備えの騎馬は赤）
    // 見に行けば勝頼と旗本がいる（籠城で wake は止めてあるので、本物の兵で置く。後ろの控えは軽い兵）
    F.kCamp = camp(rt, { x: -30, z: -162, facing: 0, team: SH.tak, faction: 'takeda', mon: 'takeda', armor: TD, general: { name: '武田勝頼' }, noUma: high, tate: !high, contour: high, depth: true, guard: 15, reserve: 260, runTo: { x: -30, z: -125 } });
    // 旗本は別隊で十五人いる。一人用の本陣へ供回りを重ねて足し、陣幕の奥で詰まらせない。
    if (F.kCamp.general) F.kCamp.general.group.noRetinue = true;
    [[-30, -136, 'takeda', 'spear'], [-62, -140, 'furin', 'cavalry'], [6, -146, 'akazonae', 'cavalry']].forEach(([x, z, f, kind], i) => DA(x, z, 22, 14, kind === 'cavalry' ? 150 : 240, face(x, z), f === 'akazonae' ? AK : TD, f, 73 + i, kind));
    // 北東・東の台地、宇連川の向こう（鳶ヶ巣山）、寒狭川の向こう
    [[92, -100, 'takeda', 'spear'], [128, -20, 'furin', 'mixed'], [120, 40, 'takeda', 'spear'], [20, 112, 'takeda', 'gun'], [70, 118, 'furin', 'spear'], [-112, -30, 'takeda', 'mixed'], [-118, 30, 'akazonae', 'cavalry']].forEach(([x, z, f, kind], i) =>
      DA(x, z, 24, kind === 'gun' ? 6 : 16, kind === 'cavalry' ? 140 : 220, face(x, z), f === 'akazonae' ? AK : TD, f, 80 + i, kind));
    for (const [x, z, k] of [[-44, -150, 'furin'], [-50, -132, 'furin'], [8, -134, 'akazonae'], [60, -104, 'takeda']]) rt.scene.add(nobori(W, x, z, k, 6.5));
    if (high) {
      // 張り出し床の南東に見張りを一人。梯子口を空け、武田の旗指物で所属をそろえる。
      // 既存の兵の形と持ち場固定を使い、城へ寄せる乱戦の人数には手を加えない。
      const watch = { x: -52.16, z: -170.5, y: W.heightAt(-53, -172) + 8.8 * .68 + .05 };
      const lookout = enemyGroup(rt, { faction: 'takeda', name: '井楼の見張り', anchor: watch,
        facing: 0, width: 1, aggro: 0, noAI: true, noRout: true, holdFire: true },
      [{ type: 'ashigaru', n: 1, o: { flag: 'takeda', x: watch.x, z: watch.z } }]);
      for (const u of lookout.units) {
        u.perch = watch; u.pos.set(watch.x, watch.y, watch.z); u.mesh.position.copy(u.pos);
      }
    }
    // 寄せの波ごとに、北の原から後続の隊が坂の下まで押し出す（見た目だけ）
    F.far = [];
    for (const [x, f, kind] of [[-26, 'takeda', 'spear'], [18, 'furin', 'spear'], [-8, 'akazonae', 'cavalry'], [36, 'takeda', 'mixed']]) {
      const m = DA(x, -150, 18, 10, 110, 0, f === 'akazonae' ? AK : TD, f, 90 + F.far.length, kind);
      m.visible = false;
      F.far.push({ m, x, v: 0 });
    }

    // ----- 任務と下知 -----
    rt.world.setTime('day');
    rt.setPhase('brief');
    // 11/18 クラウド 長篠城の持ち主：本人の大きな鉄砲の組（八十余人）は既定の二段だと横四十三人・幅七十m になり、
    //   城の内（東西七十m）に収まらず西の塀の外まで並びが伸び、塀に当たった者が本人の足もとへ寄って重なる。
    //   段を増やして横幅を三十五m ほどに詰め、塀の内に収める（数は減らさない）
    const fitSquad = () => { for (const g of rt.army.groups) if (g.isPlayerSquad && g.count > 12) {
      if (g.isGun) { g.ranks = Math.max(g.ranks || 2, Math.ceil(g.count / 22)); g.rankSpacing = Math.max(g.rankSpacing || 1, 1.5); } else g.width = Math.min(g.width || 22, 22);
      // 11/18 14:55 UTC 持ち主（act bot 信長で出陣：城主の話の十六秒に鉄砲の組が本人に付いて並び、塀の外 (z-26) の持ち場へ大手から出て、
      //   一の寄せで塀の外 z-42 まで寄せ手と撃ち合った）：籠城の鉄砲は始めから北の塀の内に据える（wave1 と同じ持ち場・本人の号令で外れる）
      if (g.isGun && g.order === 'follow') { g.order = 'hold'; g.anchor = { x: -8, z: N_Z + 9 }; g.facing = Math.PI; g.formation = 'line'; g.width = Math.min(Math.max(g.width || 0, 22), 34); g._heldByCmd = rt.t; }
    } smallGun(rt); };
    if (!SH.flip) { fitSquad(); rt.after(0.2, fitSquad); }   // K661：城の内に並べるのは城兵の本人の組だけ
    const hiR = !rt.G.lord && (rt.G.rank || 0) >= 3;   // 足軽大将ほどの者は、大手の塀の一手を預かる
    rt.flags.holdText = hiR ? '大手の塀の一手を預かり、長篠城を守り抜け（本丸の館を守る）' : '長篠城を守り抜け（本丸の館を守る）';
    rt.obj('hold', rt.flags.holdText, 'main');
    rt.obj('stay', '城を出ず、塀の内で守れ', 'order');
    rt.obj('gate', '大手門を破らせるな', 'side');
    // 兵力の差を数で見せる（kaito 10/2：味方は少なく、敵は途切れず押し寄せる圧を感じたい。共通の関数は bhelp.js の strengthBanner）
    strengthBanner(rt, 500, 15000);
    rt.marker('oku', unitPos(F.oku), '奥平信昌', { h: 3.2 });
    rt.after(12, () => rt.unmark('oku'));
    rt.say('奥平信昌', `${nm(rt)}、見よ。北の原も、川向こうの山も、みな武田の旗じゃ`, 4.5);
    rt.say('奥平信昌', '寄せ手は一万五千、我らは五百。じゃが南と西は崖、攻め口は北の大手しかない', 5);
    rt.say('奥平信昌', '塀に取り付く者を、狭間から鉄砲で撃ち、槍で突き落とせ。門を破らせるな', 4.5);
    if (hiR) rt.say('奥平信昌', 'その方には大手の脇の塀を預ける。槍と鉄砲の組を指図し、門の脇を固めよ', 4.5);
    // 手ほどきの文は、城主の話が済んでから（字幕が溜まって飛ばされないように）
    rt.after(12, () => rt.bark('狭間や塀の上から、槍で突ける。塀の外へは出るな'));
    F.wave = 0;
    rt.after(16, () => this.wave1(rt));   // 寄せ手は坂の中ほどから（着くまでの空白を短く）
    // 固定物は兵のように受けたり押し返したりしない。構造物の stagger は時間で減らない。
    // 門・塀への命中と破壊はそのまま通し、兵専用の座標を読む受け判定だけを止める。
    for (const s of rt.army.structs) s.stagger = Infinity;
  },

  // ① 大手門と北の塀への寄せ
  wave1(rt) {
    const F = rt.flags;
    if (F.wave) return;
    F.wave = 1;
    rt.setPhase('w1');
    // 11/18 cloud-04 の見回り（76秒・本人の組八十余人が号令 follow のまま北の塀の内 (-16,-21) で一点に重なり20秒動かない、が三回とも）：
    //   籠城の寄せが来たら、大きな組は本人に付いて回らず、北の塀の内に横へ広く並んで構える
    for (const g of rt.army.groups) if (!SH.flip && g.isPlayerSquad && g.order === 'follow' && g.count > 12) {
      g.order = 'hold'; g.anchor = { x: -8, z: N_Z + 9 }; g.facing = Math.PI; g.formation = 'line'; g.width = Math.min(Math.max(g.width || 0, 22), 34);
      // 11/18 持ち主：四段の段の間（既定 0.8 間）だと w1 に塀の内で前後の者が重なって立つ→段の間を一・五倍に
      if (g.isGun) { g.ranks = Math.max(g.ranks || 2, Math.ceil(g.count / 22)); g.rankSpacing = Math.max(g.rankSpacing || 1, 1.5); }
      // 11/18 08:45 UTC 持ち主（act bot 信長で出陣 286秒 final：本人の鉄砲の組70人が号令 attack のまま二の丸 (16,-10) で一点に重なる★★）：
      //   脇差を抜いた者が出ると共通の「一緒に突っ込む」（ally_charge.js）が鉄砲の組まで『かかれ』にし、七十人が城の内で敵を追って固まった。
      //   籠城の鉄砲の組は塀の内の並びで撃ち続ける（本人の「待て」と同じ印。本人が別の号令を出せば外れる）
      if (g.isGun) g._heldByCmd = rt.t;
    }
    smallGun(rt);
    F.w1 = [
      takedaGroup(rt, 'gate', { name: '大手への寄せ', anchor: { x: GATE.x, z: -74 } },
        [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 22 }, { type: 'bow', n: 3 }]),
      takedaGroup(rt, 'w', { name: '北の塀への寄せ', faction: 'takeda', anchor: { x: -24, z: -78 } },
        [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 20 }, { type: 'bow', n: 3 }]),
    ];
    this.farPush(rt, 2);
    // 寄せ手の後ろに、同じ旗の後続が続く
    backOf(rt, F.w1[0], { flag: 'takeda', armor: ARMOR.takeda, kind: 'spear', w: 16, depth: 10, count: 110, seed: 95, stop: inCastle(F.w1[0]) });
    backOf(rt, F.w1[1], { flag: 'takeda', armor: ARMOR.takeda, kind: 'spear', w: 14, depth: 8, count: 80, seed: 96, stop: inCastle(F.w1[1]) });
    rt.after(6, () => this.ladderAssault(rt, F.w1[1], -22));
    rt.after(24, () => { if (rt.phase === 'w1' && !F.won) rt.say('奥平信昌', '北東の角の外で、武田の金掘りが土を掘っておる。塀の下を崩す気じゃ。角の守りを緩めるな', 4); });
    // 11/18 持ち主（物差し③・act bot 毎回『斬り合う相手が少なくて退屈』7分で討ち取り2〜7）：塀の内で本人の前に寄せ手が来ない。
    //   四十秒で、本人の立つ北の塀の前（大手の口と西の梯子は外す）にもう一つ梯子を掛け、七人の一手が登って来る（兵の総数は寄せの波の内で軽い）
    rt.after(40, () => this.playerLadder(rt, 1));
    // 11/18 22:30 UTC 持ち主（act bot 信長で出陣 2回：一の寄せの五十余秒で討ち取り0）：三十人を超す本人の鉄砲の組が寄せ手を坂で撃ち崩し、
    //   一の寄せは四十秒の梯子より先に済む→その時だけ十四秒にも本人の前へ梯子を掛ける（竹束と塀の間から十三人）
    if (rt.army.groups.some((g) => g.isPlayerSquad && g.isGun && g.count > 30)) rt.after(14, () => this.playerLadder(rt, 1, -4));
    // 11/18 03:30 持ち主（act bot 2戦とも『斬り合う相手が少なくて退屈』7分で討ち取り3・5）：一の寄せは百六十秒続くのに、
    //   本人の前の梯子は四十秒の一つだけ。八十五秒と百二十五秒にも、本人の前の塀の少し脇へ梯子と七人の一手を掛ける
    rt.after(85, () => this.playerLadder(rt, 1, 5));
    rt.after(125, () => this.playerLadder(rt, 1, -5));
    this._wave1Rest(rt);
  },

  // 本人の立つ北の塀の前（大手の口と西の梯子を外す）に梯子を一つ掛け、七人の一手を登らせる（斬り合う相手を本人の前に）
  playerLadder(rt, wave, dx = 0) {
    const F = rt.flags;
    {
      if (F.wave !== wave || rt.over) return;
      if (wave === 1 && rt.phase !== 'w1' && rt.phase !== 'final') return;   // 一の寄せが退いた後（火・強右衛門の段）には掛けない（総がかりは掛ける）
      const p = shPos(rt);   // K661：d10 では元の本人（城兵）の持ち場の前
      let x = Math.max(-33, Math.min(27, (p.z < N_Z + 20 ? p.x : 10) + dx));
      if (Math.abs(x - GATE.x) < 7) x = GATE.x + (x < GATE.x ? -7 : 7);
      if (Math.abs(x + 22) < 5) x = -22 + (x < -22 ? -5 : 5);
      if (x < -33) x = -16;
      // 11/18 20:00 UTC 持ち主（act bot 信長で出陣 326秒：討ち取り4・「斬り合う相手が少ない」）：本人が三十人を超す鉄砲の組を持つ時は、
      //   梯子の寄せ七人が塀に着く前に撃ち倒され、本人の前まで来なかった→その時だけ梯子の寄せを十三人に厚くする（竹束の陰から寄る数）
      const bigGun = rt.army.groups.some((g) => g.isPlayerSquad && g.isGun && g.count > 30);
      // 11/18 20:30 UTC 持ち主（act bot 信長で出陣 314秒：十三人に厚くしても総がかりの百二十五秒で討ち取り3）：坂の上 (N_Z-16) から
      //   出ると、三十人を超す本人の鉄砲の組に塀へ着く前に撃ち倒される→その時だけ竹束と塀の間（塀の外八m）の陰から出す
      // 11/18 23:00 UTC 持ち主（act bot 侍の出陣 414秒：総がかりで十四人を討ち、全部で二十一人を無傷で討った★）：総がかりの梯子の一手は
      //   侍を二人に（足軽は斬り合いで本人に傷を負わせられず登るそばから突き落とされた。数は減らさず、打ち返す者を足す）
      const lg = takedaGroup(rt, 'w', { name: '梯子の寄せ', anchor: { x, z: bigGun ? N_Z - 8 : N_Z - 16 }, width: bigGun ? 6 : 4 }, [{ type: 'samurai', n: bigGun || rt.phase === 'final' ? 2 : 1 }, { type: 'ashigaru', n: bigGun ? 11 : 6 }]);
      this.ladderAssault(rt, lg, x);
      // 11/19 00:50 UTC 持ち主（act bot 籠城 310秒：十四人を討って傷0・信長で出陣 319秒：二十人を討って傷0）：梯子は一丁に一人ずつしか登れず、塀の上へ一人ずつ着いて
      //   一人ずつ突き落とされた。総がかりは梯子を二丁並べて掛ける（城攻めの常の手）→ 二人が同時に着き、本人が二方から打たれる（兵の数は同じ）
      if (rt.phase === 'final') {
        let x2 = x + (x > 20 ? -3.5 : 3.5);
        if (Math.abs(x2 - GATE.x) < 7 || Math.abs(x2 + 22) < 5) x2 = x - (x2 - x);
        this.ladderAssault(rt, lg, x2);
      }
    }
  },
  // 寄せの一番の合図と印（wave1 の続き）
  _wave1Rest(rt) {
    const F = rt.flags;
    sfx('taiko', 1);
    rt.after(0.6, () => sfx('horagai', 0.8));
    rt.banner('武田勢、寄せ来る', '大手門と北の塀へ');
    rt.army.play('eshout', { x: GATE.x, z: -60 }, 2);
    rt.say('足軽', '来たぞ！　武田の寄せじゃ！', 2.5);
    rt.say('奥平信昌', '引きつけて撃て！　塀に取り付いた者から突け！', 3.5);
    // 11/18 03:40 持ち主（act bot 三回とも『大手への寄せ』の印へ百八十秒歩けず、最も近くて54m）：寄せ手が塀の外の坂にいる間は、
    //   印を出さない（塀ぎわに置くと、着いても敵が来ず二十秒何も起きない）。塀から二十m に寄せたら寄せ手の上に出す（本人を塀の外へ誘わない）
    // 11/19 04:30 UTC 持ち主（act bot 2戦：印『北の塀への寄せ・崩れかけ』へ百八十秒歩けず最も近くて17〜22m・印へ歩けた18/44）：
    //   鉄砲で崩れかけた組は塀へ寄らず塀の外四〜二十m に留まる。塀の内から届かないので、崩れかけて塀の外にいる間は印を伏せる（立て直して寄せれば又出す）
    const atWall = (g) => () => { const c = g.center(); return c.z < N_Z - 20 || (g.morale < 30 && c.z < N_Z - 4) ? null : { x: c.x, z: c.z }; };
    rt.marker('w1a', atWall(F.w1[0]), () => `大手への寄せ・${moraleWord(F.w1[0].morale)}`, { red: true, group: F.w1[0] });
    rt.marker('w1b', atWall(F.w1[1]), () => `北の塀への寄せ・${moraleWord(F.w1[1].morale)}`, { red: true, group: F.w1[1] });
  },

  // 遠くの後続が坂の下まで押し出す
  farPush(rt, n) {
    const fin = rt.phase === 'final';
    for (const fc of rt.flags.far.filter((q) => !q.v).slice(0, n)) {
      fc.v = 1; fc.m.reform(); fc.m.visible = true;
      fc.m.advance(70, fin ? 9 : 12, { charge: fin });
      fc.backAt = rt.t + (fin ? 9 : 12) + 18;
    }
  },

  // 梯子（束23）：寄せ手の二人が北の塀へ梯子を担いで運び、掛けて登る（長篠城でも見える手。kaito 10/2）
  ladderAssault(rt, group, x) {
    const F = rt.flags;
    if (!group || !group.units || !group.units.some((u) => u.alive)) return;
    const topY = rt.world.heightAt(x, N_Z) + 2.3;
    const job = carryLadder(rt, {
      team: SH.tak, group, from: { x, z: N_Z - 14 },
      // 11/19 01:40 UTC 持ち主（act bot 籠城 343秒：二十人を討って受けた傷は足軽から0・421秒：二十人を討って刃の傷0）：登り手は塀の頂（本人より二m余り上）に
      //   立ったまま突き落とされ、一太刀も本人に届かなかった→頂に着いたら塀の内二m へ飛び降りて斬り込む（乗り込み。数と強さは変えない）
      to: { foot: { x, z: N_Z - 0.6 }, topY, topX: x, topZ: N_Z + 0.6, landing: { x, z: N_Z + 2.2, y: rt.world.heightAt(x, N_Z + 2.2) },
        // 11/19 02:40 UTC 持ち主（act bot 籠城：降りた足軽が本人へ振れたのは一戦に一太刀。登りの無防備の名残り stagger 0.5 のまま降り、
        //   構える前に討たれていた）：降りた者は飛び降りた勢いのまま、近くの本人へすぐ打ち掛かる（鬨の声つき。数と強さは変えない）
        onLand: (u) => this.ladderLanded(rt, u) },
      autoKnock: true, hp: 46,
    });
    if (job) F.ladders.push(job);
  },

  // 梯子から塀の内へ降りた寄せ手：無防備の名残りを解き、六m の内の本人へすぐ打ち掛かる
  ladderLanded(rt, u) {
    if (!u || !u.alive) return;
    u.stagger = 0; u.inside = true;
    u.cd = Math.min(u.cd ?? 0, 0.1); u.guarding = 0;
    const me = SH.flip ? null : rt.player?.u;   // K661：d10 の本人は寄せ手の側
    // 打ち掛かるには相手へ向いている要る（army_think.js：向きの差〇・六の内）。飛び降りた時は城の内を向いているので、本人へ向き直る
    if (me && me.alive && Math.hypot(me.pos.x - u.pos.x, me.pos.z - u.pos.z) < 6) { u.target = me; u.aiT = Math.max(u.aiT || 0, 2.2); u.heading = Math.atan2(me.pos.x - u.pos.x, me.pos.z - u.pos.z); }   // 考え直しを二秒余り待たせる（すぐ考えると近い城兵へ狙いを移した）
    rt.army.play?.('eshout', u.pos, 1.1);
    const F = rt.flags;
    if (rt.t - (F.landSaid ?? -99) > 12) { F.landSaid = rt.t; rt.bark('敵が塀を乗り越えてきた！', true); }
  },

  // ② 兵糧蔵に火矢
  startFire(rt) {
    const F = rt.flags;
    if (F.fire && F.fire !== 'soon') return;
    F.fire = 'active';
    F.fireEnd = rt.t + 60;
    const W = rt.world;
    // 北東の坂から火矢を射かける弓の隊
    F.fireBows = enemyGroup(rt, { faction: 'takeda', name: '火矢の隊', anchor: { x: 30, z: -54 }, facing: -0.3, order: 'hold', aggro: 34, fleeDir: { x: 0.3, z: -1 }, width: 6 },
      [{ type: 'samurai', n: 1 }, { type: 'bow', n: 7 }]);
    F.enemies.push(F.fireBows);
    // 蔵の西・東・北の壁に火がつく（壁の外側から軒へ燃え上がる）
    const spots = [[KURA.x - 3.6, KURA.z - 1], [KURA.x + 3.6, KURA.z + 0.6], [KURA.x + 1, KURA.z - 3.8]];
    F.fires = spots.map(([x, z], i) => {
      // 軒から屋根へ燃え上がる炎（いくつも重ねて、昼でも見えるように）
      const flames = [W.addFire(x, z, { h: 0.2 }), W.addFire(x + 0.3, z - 0.3, { h: 1.0 }), W.addFire(x - 0.3, z + 0.3, { h: 1.8 }), W.addFire(x, z, { h: 2.6 })];
      for (const fl of flames) fl.size = 2.1;   // 焚き火より大きな炎
      return { x, z, flames, out: false };
    });
    rt.army.play('arrow', { x: KURA.x, z: KURA.z }, 1.2);
    rt.army.scriptArrows?.(1, KURA, 5);   // 11/18 cloud-31：音だけだった。武田の弓兵が蔵へ火矢を射込む（飛ぶ火矢）
    rt.banner('火矢', '兵糧蔵が燃えている');
    rt.say('足軽', '火矢じゃ！　兵糧蔵に火がついたぞ！', 3);
    rt.say('奥平信昌', `${nm(rt)}！　水桶を持て、蔵の火を消せ！　兵糧を焼かれては籠城できぬ`, 4);
    rt.obj('fire', isTouch ? '兵糧蔵の火を消せ（蔵のそばで「取る」を長押し）' : `兵糧蔵の火を消せ（蔵のそばで ${K('use')} 長押し）`, 'side');
    rt.marker('kura', { x: KURA.x, z: KURA.z }, '兵糧蔵（火）', { h: 6 });
    F.fires.forEach((f, i) => {
      rt.addInteract('fire' + i, { x: f.x, z: f.z + (i === 1 ? 0 : 0) }, '水を掛けて火を消す', () => this.douse(rt, i), { r: 2.8, hold: 1.6 });
    });
  },

  douse(rt, i) {
    const F = rt.flags;
    const f = F.fires[i];
    if (!f || f.out) return;
    f.out = true;
    rt.uninteract('fire' + i);
    for (const fl of f.flames) rt.world.removeFire(fl);
    rt.army.smoke(f.x, rt.world.heightAt(f.x, f.z) + 2.4, f.z, 0, 0);
    sfx('ui');
    const left = F.fires.filter((q) => !q.out).length;
    if (left) rt.bark(`火をひとつ消した（残り ${left} か所）`);
    else {
      F.fire = 'done';
      rt.objDone('fire'); rt.objProgress('fire', ''); rt.unmark('kura');
      rt.award((t) => t.side.push('兵糧蔵の火を消した'), '副任務：兵糧蔵の火を消した');
      rt.say('奥平信昌', 'ようやった！　兵糧は守られた', 3);
      F.mor = Math.min(100, F.mor + 8);
    }
  },

  fireFail(rt) {
    const F = rt.flags;
    F.fire = 'fail';
    rt.objFail('fire'); rt.objProgress('fire', ''); rt.unmark('kura');
    for (let i = 0; i < F.fires.length; i++) {
      rt.uninteract('fire' + i);
      if (!F.fires[i].out) for (const fl of F.fires[i].flames) rt.world.removeFire(fl);
    }
    F.mor = Math.max(10, F.mor - 25);
    rt.banner('兵糧蔵が焼け落ちた', '城兵の士気が下がる');
    rt.say('足軽', '蔵が……兵糧が焼けてしもうた', 3);
    rt.say('奥平信昌', 'うろたえるな！　残りの米を分けて食え。まだ戦える', 3.5);
  },

  // ③ 夕暮れ：鳥居強右衛門を川まで送り出す
  startSune(rt) {
    const F = rt.flags;
    rt.setPhase('sune');
    rt.world.setTime('dusk');
    const W = rt.world;
    for (const [x, z] of [[GATE.x - 3.4, N_Z + 0.6], [GATE.x + 3.4, N_Z + 0.6], [KARA.x - 3, S_Z - 0.6], [HALL.x + 5, HALL.z - 4.5]]) W.addFire(x, z, { torch: true, h: 1.5 });
    rt.banner('夕暮れ', '武田勢はいったん兵を引いた');
    // 11/18 07:35 UTC 持ち主（act bot 201秒 sune：本人の前の梯子の寄せ5人が F.w1 に入らず引き鉦で退かず、塀の外 (27,-42) で一点に重なる）：
    //   夕暮れには、塀へ寄せたまま残った組（assault）も坂の下へ引かせる
    for (const g of rt.army.groups) if (g.team !== SH.oda && g.order === 'assault' && g.count > 0 && !g.routed) { g.noRout = false; g.morale = 0; g.routed = true; g.order = 'flee'; g.fleeDir = { x: 0, z: -1 }; g.fleeSet = true; }
    // 11/21 17:30 UTC 持ち主（act bot 籠城 215秒 sune→news：夕暮れに兵を引いたはずの火矢の隊が坂に残り、九〜十三mから本人を射続けて倒した）：火矢の隊も夕暮れに坂の上へ引かせる
    if (F.fireBows && !gone(F.fireBows)) { const g = F.fireBows; g.noRout = false; g.morale = 0; g.routed = true; g.order = 'flee'; g.fleeDir = { x: 0.3, z: -1 }; g.fleeSet = true; }
    const sg = allyGroup(rt, { faction: 'tokugawa', name: '強右衛門', anchor: { x: SUNE_PATH[0][0], z: SUNE_PATH[0][1] }, facing: 0, noRout: true, aggro: 2, speed: 2.3, width: 1 },
      [{ type: 'ashigaru', n: 1, o: { name: '鳥居強右衛門', flag: null, hat: 'none' } }]);
    const s = sg.units[0];
    s.hp = s.maxHp = 140;
    sg.path = SUNE_PATH.map((p) => [...p]);
    F.sune = s; F.suneG = sg;
    F.suneAt = rt.t;
    // 川べりの見張り
    // 11/18 03:50 持ち主（act bot 信長の出陣で4回に2回、崖の細道の下で見張り五人に囲まれ一突き約五十の傷が続き倒れる）：本人への刃だけ半分に（見張りの数と構えは同じ）
    F.watch = enemyGroup(rt, { faction: 'takeda', name: '川べりの見張り', fixed: true, anchor: { x: 45, z: 53 }, facing: Math.PI - 0.5, order: 'hold', aggro: 8, fleeDir: { x: 1, z: 0.3 }, width: 3, morale: 90, dmgMultPlayer: 0.35 },
      [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 4 }]);
    F.enemies.push(F.watch);
    // 11/18 07:40 UTC 持ち主（act bot 信長で出陣・200秒 sune：崖の下で見張り五人に一人で囲まれ、二十秒で倒れた。討ち取り2で「斬り合う相手が少ない」も）：
    //   搦手の足軽三人が本人のすぐ後ろについて細道を下り、見張りが気づいたら一緒に斬りかかる（本人一人に五人の刃が集まらない）
    F.escort = allyGroup(rt, { faction: 'tokugawa', name: '搦手の足軽', anchor: { x: SUNE_PATH[0][0] - 2, z: SUNE_PATH[0][1] - 3 }, facing: 0, order: 'hold', aggro: 6, noRout: true, width: 3, spacing: 1.6, speed: 2.8 },
      [{ type: 'ashigaru', n: 3 }]);
    rt.say('奥平信昌', `${nm(rt)}、これへ。強右衛門が今宵、岡崎へ後詰を願いに出る`, 5);
    rt.say('鳥居強右衛門', '川に潜って下れば、武田の目もごまかせましょう。崖の下までお頼み申す', 4.5);
    rt.say('奥平信昌', '搦手から崖の細道を下りよ。川べりには武田の見張りがおる。強右衛門を守り、川まで送り届けよ', 5);
    rt.obj('sune', '鳥居強右衛門を搦手から川まで送り出せ', 'side');
    rt.obj('hold', '強右衛門を守り、搦手の崖から川まで送り出せ', 'main');   // K358：右上の一行も今の段の事に
    rt.obj('stay', '強右衛門と搦手を出て、見張りを討て', 'order');
    rt.marker('sune', unitPos(s), '鳥居強右衛門', { h: 2.8 });
    rt.marker('river', { x: SUNE_PATH[SUNE_PATH.length - 1][0], z: SUNE_PATH[SUNE_PATH.length - 1][1] }, '川（宇連川）', { h: 1.5 });
    rt.marker('watch', centerOf(F.watch), () => `武田の見張り・${moraleWord(F.watch.morale)}`, { red: true, group: F.watch });
  },

  suneUpdate(rt, dt) {
    const F = rt.flags;
    const p = shPos(rt);   // K661：d10 では元の本人（城兵）が強右衛門に付いて歩いた所
    const sayS = (t, d) => { F.suneTalkT = rt.t; rt.say('鳥居強右衛門', t, d); };
    const s = F.sune, g = F.suneG;
    if (F.suneState) return;
    if (!s.alive) {
      F.suneState = 'fail';
      rt.objFail('sune'); rt.unmark('sune'); rt.unmark('river'); rt.unmark('watch');
      rt.banner('強右衛門が討たれた');
      rt.say('奥平信昌', '……強右衛門が。いや、まだ望みは捨てぬ。別の者を出す', 4);
      rt.after(6, () => this.startNews(rt));
      return;
    }
    // 印の「着いた」（十m）より少し広く取る。九mでは印の縁で立ち止まると何も起きなかった（11/18 見回り）
    const near = Math.hypot(p.x - s.pos.x, p.z - s.pos.z) < 11;
    const foe = rt.army.nearestEnemy(s, 13);
    // 11/18 cloud-04 の見回り（255秒・印に着いても何も起きない、が一回）：見張り以外の敵が十三歩にいて、ずっと待っていた。そばで二十秒待てば下る
    // 11/18 持ち主（act bot 2回・229/249秒に印で二十秒なにも変わらない）：道をふさぐのは見張りの組の者だけ。ほかの敵なら待たず、待つのも十秒まで
    // 11/18 持ち主（act bot 242・249秒に印で何も変わらない）：待ち十秒で go になると waitT が0に戻り、次のコマにまた待ちへ戻って
    //   path と hold を行き来し一歩も下りなかった。一度下り始めたら（F.suneGo）そばにいる限り見張りがいても下り続ける
    const go = near && (F.suneGo || !foe || foe.group !== F.watch || rt.t - F.suneAt > 120 || (F.waitT || 0) > 8);  // 120秒を過ぎたら見張りがいても細道を下る（止まりきらない）
    if (go && near) F.suneGo = true;
    if (go && g.order !== 'path') { g.order = 'path'; F.waitSaid = false; }
    // K358：見張りが道をふさぐ間、着いても何も起きない事が無いよう、見張りの方から気づいて寄せて来る
    // 搦手の足軽三人は本人の二〜三m 後ろを一秒ごとに追う。見張りが気づいたら斬りかかる
    const E = F.escort;
    if (E && E.count > 0 && rt.t >= (F.escortT || 0)) {
      F.escortT = rt.t + 1;
      const yaw = SH.flip ? Math.PI : (rt.player.yaw || 0);
      if (F.watchAlert && !gone(F.watch)) { E.order = 'attack'; E.aggro = 24; }
      else { E.order = 'hold'; E.anchor = { x: p.x - Math.sin(yaw) * 2.5, z: p.z - Math.cos(yaw) * 2.5 }; E.facing = yaw; }
    }
    if (near && foe && !F.watchAlert && !gone(F.watch)) {
      F.watchAlert = true;
      if (E && E.count > 0) rt.say('搦手の足軽', '我らもお供いたす！　見張りを囲め！', 2.5);
      F.watch.fixed = false; F.watch.order = 'attack'; F.watch.aggro = 30;
      rt.say('武田の見張り', '誰じゃ！　城の者が崖を下りて来るぞ！', 2.5);
    }
    if (near && !F.suneNearSaid) { F.suneNearSaid = true; sayS(foe ? '見張りがおりまする。まず片付けてくだされ' : `${nm(rt)}殿、参りましょう。細道を下りまする`, 3); }
    // 11/18 クラウド 長篠城の持ち主（act bot 3回のうち2回、153秒・217秒に印へ着いても6秒なにも起きない）：
    //   はじめの一言は一度きりで、離れてまた着いた時は黙っていた。着き直すたびに（8秒に一度まで）強右衛門が一言返す
    if (near && !F.suneWasNear && F.suneNearSaid && !(F.suneAgainT > rt.t)) {
      F.suneAgainT = rt.t + 8;
      sayS(foe ? '見張りが道におりまする。先に片付けてくだされ' : `${nm(rt)}殿、離れずについて来てくだされ`, 2.5);
    }
    F.suneWasNear = near;
    if (!go && g.order === 'path') { g.order = 'hold'; g.anchor = { x: s.pos.x, z: s.pos.z }; }
    if (!go) {
      F.waitT = (F.waitT || 0) + dt;
      // 11/18 持ち主（act bot 223・243秒に印で6秒なにも変わらない）：待ちの一言を六秒目でなく三秒目に、待ちは八秒まで
      if (F.waitT > 3 && !F.waitSaid) {
        F.waitSaid = true;
        sayS(foe ? '見張りがおる……先に片付けてくだされ' : `${nm(rt)}殿、ついて来てくだされ`, 3);
      }
    } else F.waitT = 0;
    // 11/18 持ち主：見張りでない敵が十三歩にいる時も『見張りが道をふさいでいる』のままで、着いて下り始めても札が変わらなかった。ふさぐのは見張りで待つ間だけ
    rt.objProgress('sune', foe && !go && foe.group === F.watch ? (near ? '見張りを討って道を開け' : '見張りが道をふさいでいる') : near ? '崖の細道を下りている' : '強右衛門のそばへ');
    // K358：細道を一つ下りるごとに、強右衛門が一言（着いても何も起きない間を作らない）
    // 11/18 持ち主（act bot 233・244・251秒に印で6秒なにも変わらない）：一つおきの曲がりでは間が六秒を越えた。曲がるたびに一言
    const SL = { 1: '静かに……崖の縁を伝って参る', 2: '足元に気をつけなされ。崖の石が崩れまする', 3: '武田の篝火が見えまする。身を低う', 4: '川の音が近うなった……もう少しじゃ', 5: '岩の陰へ。見張りの目が切れる所じゃ', 6: 'あの流れじゃ。武田の鳴子の綱が張ってある……下を潜って参る' };
    if ((g.pathIdx || 0) > (F.suneIdx || 0)) { F.suneIdx = g.pathIdx; if (SL[g.pathIdx]) sayS(SL[g.pathIdx], 3); }
    if (near && !foe && !go) { F.idleT = (F.idleT || 0) + dt; if (F.idleT > 5) { F.idleT = -8; sayS(`${nm(rt)}殿、道は空いた。下りまするぞ`, 2.5); } }
    if (gone(F.watch) && !F.watchDone) { F.watchDone = true; rt.unmark('watch'); rt.bark('見張りを片付けた'); }
    // 11/18 クラウド 長篠城の持ち主（act bot 144秒 sune：印に着いても6秒なにも起きない、がまた一回）：そばにいて五秒黙っていたら、
    //   今の様子に合わせて強右衛門が一言（同じ言葉を続けない）
    if (near && rt.t - (F.suneTalkT || 0) > 5 && !(F.suneKeepT > rt.t)) {
      F.suneKeepT = rt.t + 5; F.suneKeepN = (F.suneKeepN || 0) + 1;
      // 11/18 23:40 UTC 持ち主：戦の声は同じ言葉を二十秒に一度しか鳴らさない（heardRecently）。二〜三通りを五秒ごとでは二巡目から黙り、
      //   着いても六秒なにも起きない（241秒 sune）が残っていた。六通りにして、一巡を三十秒にする
      const KL = foe && foe.group === F.watch && !go
        ? ['見張りがこちらを見ておる。槍で払うてくだされ', '見張りを討てば道が開きまする', '見張りは五人。囲まれぬよう岩を背に', '声を立てられては厄介じゃ。早う討ってくだされ', '篝火の向こうにも武田がおる。急がねば', 'あの侍が見張りの頭じゃ。あれを討てば崩れまする']
        : ['この先は崖じゃ。足を滑らすな', '川はすぐそこ。急ぎまするぞ', '武田の篝火を避けて参る', '岩の根に足を掛けなされ', '城の灯が遠うなった……もう戻れませぬな', '流れの音で足音は消えまする。今のうちに'];
      sayS(KL[F.suneKeepN % KL.length], 2.5);
    }
    // 川に着いた
    if (g.pathIdx >= g.path.length) {
      F.suneState = 'done';
      rt.objDone('sune'); rt.objProgress('sune', ''); rt.unmark('sune'); rt.unmark('river'); rt.unmark('watch');
      rt.award((t) => t.side.push('強右衛門を送り出した'), '副任務：強右衛門を送り出した');
      rt.say('鳥居強右衛門', 'かたじけない。必ず後詰を連れて戻りまする', 3.5);
      rt.banner('強右衛門、川へ', '鳴子の綱の下を潜り、流れを下っていった');
      rt.after(2, () => { rt.army.despawn(s); rt.world.puff(s.pos.x, s.pos.z, 4); });
      rt.after(8, () => this.startNews(rt));
      return;
    }
    // 送り出せずに長く経った
    if (rt.t - F.suneAt > 170) {
      F.suneState = 'fail';
      rt.objFail('sune'); rt.unmark('sune'); rt.unmark('river'); rt.unmark('watch');
      rt.say('鳥居強右衛門', 'もう待てぬ。ひとりで参る！', 3);
      rt.after(1.5, () => rt.army.despawn(s));
      rt.after(6, () => this.startNews(rt));
    }
  },

  // ④ 二日後：強右衛門の知らせ
  startNews(rt) {
    const F = rt.flags;
    if (rt.phase === 'news') return;
    rt.setPhase('news');
    rt.world.setTime('day');
    // 二日後の段：搦手の足軽三人は城の内へ戻った（崖の下に立たせたままにしない）
    if (F.escort) { for (const u of F.escort.units) if (u.alive) rt.army.despawn(u); F.escort = null; }
    for (const g of F.enemies) if (!gone(g)) { g.noRout = false; g.morale = 0; }
    // 夜のうちに塀と門を繕い、傷の手当てをした
    const n = repairWalls(rt);
    for (const sg of F.north) if (sg !== F.gate) { sg.maxHp = 900; sg.hp = 900; }
    // 破られずに残った大手門も、夜のうちに閂と板を繕う（8割までは戻す）
    if (F.gate.alive) F.gate.hp = Math.max(F.gate.hp, F.gate.maxHp * 0.8);
    if (!SH.flip) {   // K661：城兵の本人だけ二日後の持ち場へ（d10 の本人は動かさない・K667）
      // 11/28 クラウド 長篠城の持ち主（K667 kaito 11/25「ワープは全部禁止」・act bot --mobile 239秒 news：本人が搦手の崖道 (37,49) から一コマで (6,35) へ 35m 飛んだ）：
      //   一コマで置かず、強右衛門と下りた崖道を逆に辿り、搦手の口から塀の内の持ち場へ数秒かけて運ぶ（信貴山の sgGlide と同じ手・塀は抜けない）
      const u = rt.player.u;
      u.hp = u.maxHp;
      nagaGlideHome(rt, 6, S_Z - 5, () => { rt.player.yaw = 0.15; rt.player.camInit = false; });
    }
    // 討たれた城兵の穴を控えで埋める
    const lost = F.allies.reduce((a, g) => a + g.units.filter((q) => !q.alive).length, 0);
    if (lost > 3) {
      F.allies.push(allyGroup(rt, { faction: 'tokugawa', name: '城兵（控え）', anchor: { x: GATE.x, z: N_Z + 9 }, facing: Math.PI, width: 10, aggro: 8, noRout: true },
        [{ type: 'ashigaru', n: Math.min(18, lost), o: { flag: 'okudaira' } }]));
    }
    F.newsDay = true;
    rt.objRemove('sune');
    if (F.holdText) rt.obj('hold', F.holdText, 'main');
    rt.obj('stay', '城を出ず、塀の内で守れ', 'order');
    rt.banner('――二日後', '五月十六日　朝');
    timeSkipGoal(rt, 3.5);   // 時が飛んだので、真ん中に次の目標を短く（K183）
    rt.say('', n ? '――夜のうちに、破られた塀と門を繕った' : '――囲みは解けぬまま、二日が過ぎた', 3.5);
    // 対岸に引き出された強右衛門
    // 11/19 04:55 UTC 持ち主（K285 見せかけの兵は使わない・K281 の数え：二日後の段の百五十秒に本人から三十〜六十m の敵の本物が7人）：
    //   対岸の磔の場を遠い絵の四十人でなく、本物の武田の兵で囲む（磔の柱の左右と後ろに槍の二列・侍二人・鉄砲四。動かず撃たず・的にしない。総がかりで陣へ下がる）
    {
      const list = [];
      for (let i = 0; i < 8; i++) for (let r = 0; r < 2; r++) { const x = 16 + (i < 4 ? -4.5 - i * 1.3 : 4.5 + (i - 4) * 1.3), z = 78.2 + r * 1.4 + Math.abs(i % 4) * 0.15; list.push({ type: 'ashigaru', n: 1, o: { flag: 'takeda', x, z } }); }
      for (let i = 0; i < 6; i++) list.push({ type: 'ashigaru', n: 1, o: { flag: 'takeda', x: 12 + i * 1.6, z: 81.6 } });
      list.push({ type: 'samurai', n: 1, o: { flag: 'takeda', x: 13.4, z: 77.6 } }, { type: 'samurai', n: 1, o: { flag: 'takeda', x: 18.6, z: 77.6 } });
      for (let i = 0; i < 4; i++) list.push({ type: 'gun', n: 1, o: { flag: 'takeda', x: 10 + i * 4, z: 83.2 } });
      F.acrossG = enemyGroup(rt, { faction: 'takeda', name: '磔の場の武田勢', fixed: true, anchor: { x: 16, z: 80 }, facing: Math.PI, order: 'hold', width: 12, aggro: 0, noAI: true, noRout: true, holdFire: true }, list);
      for (const q of F.acrossG.units) { q.noTarget = true; q.heading = Math.PI; }
    }
    if (!F.cross) { F.cross = haritsuke(rt.world, 16, 76.5); rt.scene.add(F.cross.grp); }
    F.cross.grp.visible = true;
    rt.after(23, () => { if (F.cross && rt.phase === 'news') { F.cross.body.visible = true; rt.player.cine = { x: 16, z: 77, t: 3 }; } });
    rt.after(3.5, () => {
      rt.player.cine = { x: 16, z: 80, t: 3 };
      rt.say('足軽', '宇連川の向こうをご覧あれ！　武田の者に引き立てられて……あれは強右衛門殿じゃ！', 4.5);
      rt.say('奥平信昌', '岡崎まで走り抜き、殿と信長公に会うて戻る途中で、捕らえられたか', 4.5);
      rt.say('', '――「援軍は来ぬ」と城へ告げれば命は助ける。武田方はそう言い含めて、強右衛門を川べりに立たせたという', 6);
      rt.say('鳥居強右衛門', '皆の衆、後詰は来るぞ！　あと二、三日、城を守り抜け！', 5);
      rt.say('', '――強右衛門は、その場で磔にされた', 4);
      rt.say('奥平信昌', '……聞いたな。強右衛門の声を無にするな。後詰が来るまで守るぞ！', 5);
      rt.say('城兵', 'おおおーっ！', 2.5);
    });
    rt.after(26, () => {
      F.mor = Math.min(100, F.mor + 45);
      rt.banner('城兵の士気、大いに上がる', '強右衛門の声が、城を奮い立たせた');
      for (const g of F.allies) g.morale = 100;
      rt.army.celebrate(0);
      sfx('taiko', 0.8);
    });
    rt.after(32, () => this.startFinal(rt));
  },

  // ⑤ 最後の大きな寄せ
  startFinal(rt) {
    const F = rt.flags;
    if (rt.phase === 'final') return;
    rt.setPhase('final');
    F.finalAt = rt.t;
    F.holdEnd = rt.t + (SH.flip ? 250 : 125);   // K656 K658：d10（武田が寄せる側）は約6分で短い→総がかりを二百五十秒にして後の二つの寄せを足す
    if (F.across) F.across.visible = false;
    if (F.acrossG) { for (const q of F.acrossG.units) if (q.alive) rt.army.despawn(q); F.acrossG = null; }
    if (F.cross) F.cross.grp.visible = false;
    // 西の塀と大手へ先に寄せ、赤備えは少し遅れて東の塀へ
    F.fin = [
      takedaGroup(rt, 'gate', { name: '大手への総がかり', anchor: { x: GATE.x, z: -80 } },
        [{ type: 'busho', n: 1, o: { name: '小山田昌行' } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 22 }, { type: 'bow', n: 2 }]),
      // 11/19 持ち主：大手の総がかりの将は大通寺山の陣の小山田昌行（信豊・馬場と同じ山に陣取ったと伝わる。docs/fujin/nagashinojo.md）
      takedaGroup(rt, 'w', { name: '北の塀（西）への寄せ', anchor: { x: -26, z: -78 } },
        [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 20 }, { type: 'bow', n: 1 }]),
    ];
    F.masa = F.fin[0].units.find((u) => u.name === '小山田昌行') || null;
    // 11/21 03:50 UTC 持ち主（kaito_now ③「主人公が一人にならない」・描かずの数え：城の本物の味方が始め88 → 二日後43 → 総がかり30〜35 → 勝ちの時26。
    //   大手の内で本人が槍の組の数人とだけ立ち、千を超す寄せ手に対し城兵が見えない）：
    //   史実の城兵は五百。総がかりでは二の丸・本丸の手すきの者が大手へ集まった。生きた城兵が七十に満たなければ、
    //   足りない分（三十まで）を大手の内の二列（門の内七〜九m・幅十二m）に足す。塀の外へは出ず、門を破った寄せ手と斬り合う
    //   （初めの流しで足した二十人が十五秒で皆討たれ、持ち場から十五m 西へ引かれていた → 追う幅を縮め、受ける傷を二・二分の一に）
    {
      const alive = F.allies.reduce((a, g) => a + g.units.filter((q) => q.alive).length, 0);
      const add = Math.min(30, 70 - alive);
      if (add >= 6) {
        F.gateRes = allyGroup(rt, { faction: 'tokugawa', name: '大手の後ろ備え', anchor: { x: GATE2.x, z: IN_Z - 4 }, facing: Math.PI, width: 12, spacing: 1.2, aggro: 8, noRout: true, guard: true, guardSight: 10, guardLeash: 2, seekRange: 10, defMult: 2.2 },
          [{ type: 'samurai', n: 1, o: { flag: 'okudaira' } }, { type: 'ashigaru', n: add - 1, o: { flag: 'okudaira' } }]);
        F.allies.push(F.gateRes);
        F.gateRes.anchor = { x: GATE.x, z: N_Z + 8 };   // 本丸の門の内から出て、大手の内へ駆け付ける（その場に湧かせない）
        rt.say('奥平信昌', '本丸の手すきの者も大手へ回れ！', 3);
      }
    }
    rt.after(24, () => {
      if (rt.phase !== 'final' || F.won) return;
      F.fin.push(takedaGroup(rt, 'e', { name: '赤備えの寄せ', faction: 'akazonae', anchor: { x: 20, z: -80 } },
        [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 20 }, { type: 'gun', n: 2 }]));
      backOf(rt, F.fin[2], { flag: 'akazonae', armor: ARMOR.akazonae, kind: 'spear', w: 14, depth: 10, count: 100, seed: 98, stop: inCastle(F.fin[2]) });
      rt.marker('f2', centerOf(F.fin[2]), () => `赤備え・${moraleWord(F.fin[2].morale)}`, { red: true, group: F.fin[2] });
      rt.say('足軽', '東からも来るぞ！　赤備えじゃ！', 2.5);
    });
    this.farPush(rt, 4);
    backOf(rt, F.fin[0], { flag: 'takeda', armor: ARMOR.takeda, kind: 'spear', w: 16, depth: 10, count: 110, seed: 97, stop: inCastle(F.fin[0]) });
    rt.after(5, () => this.ladderAssault(rt, F.fin[1], -22));
    rt.after(28, () => this.playerLadder(rt, F.wave));   // 総がかりでも本人の前の塀へ一つ
    // 11/18 09:40 UTC 持ち主（act bot 4戦とも総がかり百二十五秒の本人の討ち取り 1〜5・一の寄せは 2〜15）：
    //   一の寄せと同じく、本人の前の塀へ間を置いて梯子を重ねる（大将の締めの段で斬り合いが途切れない）
    rt.after(55, () => { if (rt.phase === 'final' && !F.won) this.playerLadder(rt, F.wave, 5); });
    rt.after(85, () => { if (rt.phase === 'final' && !F.won) this.playerLadder(rt, F.wave, -5); });
    rt.after(16, () => this.ladderAssault(rt, F.fin[0], 14));
    // 武田の騎馬の大きな塊：坂の下の原へ押し出し、城を囲む（軽い作り。kaito 0929）
    for (const [x, z, f, sd] of [[58, -118, 'akazonae', 131], [-60, -124, 'takeda', 132]]) farHost(rt, x, z, 34, 20, 240, Math.atan2(-x, -z), f === 'akazonae' ? ARMOR.akazonae : ARMOR.takeda, f, sd, 'cavalry').advance(14, 10);
    rt.after(10, () => { if (rt.phase === 'final' && !F.won) rt.say('奥平信昌', '寄せ手は大手の坂で足が鈍る。坂の中ほどまで引きつけ、狭間から揃えて撃て', 4); });
    // 11/18 クラウド 長篠城の持ち主（act bot 3回とも「斬り合う相手が少なくて退屈」：7〜8分で討ち取り1〜5）：
    //   史実でも総がかりで外郭（瓢曲輪）の塀が破られ、城兵は内で押し返した。塀がまだ一つも破れていなければ、
    //   四十秒で西の梯子の脇の塀を一区画破らせ、寄せ手を塀の内へ入れて槍で斬り合う場を作る（門は残す）
    rt.after(40, () => {
      if (rt.phase !== 'final' || F.won || F.north.some((s) => !s.alive)) return;
      let s = null, bd = Infinity;
      for (const q of F.north) { if (q === F.gate || !q.seg) continue; const d = Math.abs((q.seg[0] + q.seg[2]) / 2 + 17); if (d < bd) { bd = d; s = q; } }
      if (!s) return;
      const mx = (s.seg[0] + s.seg[2]) / 2;
      s.hp = 0; s.alive = false; s.hitFrom = { x: mx, z: N_Z - 4 };
      try { rt.army.structFall(s); } catch (e) { /* 倒す形が無くても進む */ }
      this.onStructDestroyed(rt, s);
      rt.banner('北の塀が破られた', '破れ目で寄せ手を食い止めよ');
      const ws = F.allies && F.allies[1];
      if (ws && ws.count > 0) { ws.anchor = { x: mx, z: N_Z + 5 }; ws.facing = Math.PI; ws.formation = 'line'; ws.width = 6; ws.spacing = 1.5; ws.guardLeash = 4; }
      // 破れ目のすぐ外に控えていた一隊がなだれ込む（遠い寄せ手は鉄砲に削られて破れ目まで来ない事が多い）
      // 11/18 08:05 UTC 持ち主：N_Z-12 は竹束の一列目の上で、置かれた者が竹束を避けて西の井楼の脇 (-36,-42) へ押し出され、行き先を持ったまま立った。竹束と塀の間（塀の外七m）に置く
      const bg = takedaGroup(rt, 'w', { name: '破れ目への寄せ', anchor: { x: mx, z: N_Z - 7 } }, [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 12 }]);
      F.fin.push(bg);
      rt.marker('f1', centerOf(bg), () => `破れ目への寄せ・${moraleWord(bg.morale)}`, { red: true, group: bg });
      rt.army.play('eshout', { x: mx, z: N_Z - 8 }, 1.6);
      rt.say('奥平信昌', '破れ目へ寄せ手がなだれ込むぞ！　槍で押し返せ！', 3.5);
    });
    rt.after(60, () => {
      if (rt.phase !== 'final' || F.won) return;
      F.fin.push(takedaGroup(rt, 'gate', { name: '新手', anchor: { x: 6, z: -80 } }, [{ type: 'samurai', n: 1, o: { horse: true } }, { type: 'cavalry', n: 4 }, { type: 'ashigaru', n: 16 }]));
      rt.banner('新手', '武田の後続が大手へ');
      rt.say('足軽', '新手じゃ！　大手へ押し寄せてくる！', 2.5);
      for (const fc of F.far) if (fc.v === 2) fc.v = 0;
      this.farPush(rt, 2);
    });
    if (SH.flip) {
      for (const [at, nm, ax, az, nA] of [[105, '二の矢', 24, -92, 16], [170, '三の矢', -30, -92, 18]]) {
        rt.after(at, () => {
          if (rt.phase !== 'final' || F.won) return;
          const g = takedaGroup(rt, 'gate', { name: nm, anchor: { x: ax, z: az } }, [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: nA }, { type: 'bow', n: 2 }]);
          F.fin.push(g);
          rt.banner(nm, '武田の寄せは止まらぬ');
          rt.say('武田信豊', '手を緩めるな！　大手の門を破れ！', 3);
          this.farPush(rt, 2);
        });
      }
    }
    sfx('taiko', 1);
    rt.after(0.5, () => sfx('horagai', 1));
    rt.banner('武田の総がかり', '大手門の前で、寄せ手を討ち続けて門を守れ');
    rt.army.play('eshout', { x: GATE.x, z: -60 }, 2.2);
    rt.say('奥平信昌', '武田が総がかりに来るぞ！　後詰の旗が見えるまで、一歩も退くな！', 4);
    rt.obj('hold', '大手門の前で、寄せ手を討ち続けて門を守れ', 'main');
    rt.marker('f0', centerOf(F.fin[0]), () => `大手への総がかり・${moraleWord(F.fin[0].morale)}`, { red: true, group: F.fin[0] });
  },

  win(rt) {
    const F = rt.flags;
    if (F.won) return;
    F.won = true;
    rt.setPhase('end');
    rt.unmark('f0'); rt.unmark('f1'); rt.unmark('f2');
    const W = rt.world;
    // 西の山に織田・徳川の後詰の旗
    const DA = (x, z, flag, armor, seed, kind) => farHost(rt, x, z, 30, 14, kind === 'cavalry' ? 150 : 260, Math.atan2(-x, -z), armor, flag, seed, kind).advance(16, 14);
    DA(-135, -70, 'oda', ARMOR.oda, 111, 'spear'); DA(-140, -100, 'eiraku', ARMOR.oda, 112, 'cavalry'); DA(-128, -40, 'tokugawa', ARMOR.tokugawa, 113, 'mixed'); DA(-150, -15, 'onri', ARMOR.tokugawa, 114, 'spear');
    rt.player.cine = { x: -135, z: -60, t: 3 };
    sfx('horagai', 1);
    rt.banner('織田・徳川の後詰の旗が見える！', '西の山に、永楽銭と葵の旗');
    rt.say('足軽', '旗じゃ！　西の山に後詰の旗が見えるぞ！', 3);
    rt.say('奥平信昌', '持ちこたえたぞ！　強右衛門、聞こえるか。後詰は来たぞ！', 4);
    rt.say('', '――武田勢は囲みを解き、設楽原の方へ兵を向けはじめた', 4.5);
    for (const g of F.enemies) { g.noRout = false; g.morale = 0; }
    for (const fc of F.far) if (fc.v === 1) fc.backAt = rt.t;
    // 北の原の寄せ手も囲みを解いて、背を向けて退く
    F.siege.forEach((m, i) => rt.after(4 + i * 3, () => m.retreat(40, 36)));
    rt.objDone('hold'); rt.objProgress('hold', '');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '長篠城を守り抜いた', pts: 25 }; }, '任務達成・長篠城を守り抜いた');
    if (!F.gateBroken) { rt.objDone('gate'); rt.award((t) => t.side.push('大手門を守った'), '副任務：大手門を守った'); }
    if (!F.outWarned) rt.objDone('stay');
    rt.finish({}, 11);
  },

  update(rt, dt) {
    const F = rt.flags;
    nagaGlideTick(rt, dt);
    if (SH.flip) shGhostTick(rt, dt, this.ghostPin?.(rt), 5);   // K661：d10 は元の本人（城兵）の代わりが持ち場を歩く
    // K564（11/22 12:10 UTC クラウド 長篠城の持ち主）：mem=4 の描かずの数え（携帯の見なし）で 30秒 218・45秒 227・60秒 217 と予算205を越えた（布陣の厚みの備が始めに立った上に大手・北の塀の寄せが足される）。
    //   手取川・関ヶ原と同じく、三秒ごとに本人とカメラから百m 外で待つだけの組の名の無い兵を遠い組から外す。城の中の兵・寄せの前線・名のある将は減らさない。記憶の多い端末とパソコンは今まで通り
    tedoMemCap(rt, dt);
    // 11/21 クラウド17（司令塔）：act bot 305秒・最後の段（final）で大手の外の遠くの備の鉄砲と寄せ手に囲まれて倒れた。深手で三人以上に囲まれたら、近くの味方の組が本人の横へ寄る（敵は弱めない・兵は足さない）
    // 11/21 続き（司令塔：敵は弱めない）：final は深手の手前（命の六割）から、十五秒おきに近くの味方の組を本人の横へ
    if (SH.flip) { /* K661：城兵の本人を助ける所（d10 の本人は寄せ手） */ } else if (rt.phase === 'final') sideGuard(rt, { hp: 0.6, cd: 15 }); else if (rt.phase === 'news') sideGuard(rt);
    // 11/20 クラウド17（kaito_now ③「主人公が一人にならない」・874×402 の写真：大手門の両脇の櫓の下に入ると、肩越しのカメラが櫓の柱と床の中へ
    //   めり込み、柱と天井しか写らなかった）：カメラか本人が櫓の足もと（三・五m 内）で櫓の上の床より低い間は、その櫓を描かない（カメラの形は変えない）
    if (F.yagura && rt.camera) {
      const c = rt.camera.position, q = rt.player?.u?.pos;
      for (const t of F.yagura) {
        if (!t?.mesh) continue;
        const inC = Math.hypot(c.x - t.x, c.z - t.z) < 3.5 && c.y < (t.topY ?? 9) + 0.6;
        const inP = q && Math.hypot(q.x - t.x, q.z - t.z) < 3.5 && q.y < (t.topY ?? 9) - 1;
        const v = !(inC || inP);
        if (t.mesh.visible !== v) t.mesh.visible = v;
      }
    }
    {
      const q = rt.player.u.pos, at = !rt.over && q.z > N_Z && q.z < N_Z + 6 && q.x > W_X && q.x < E_X && Math.abs(q.x - GATE.x) > 8 && !rt.player.cine;   // 大手門の下と脇では上げない（250秒の写真：門の屋根の上から見下ろし、本人が屋根に隠れた）
      // 11/19 06:45 UTC 持ち主（物差し⑥ 215秒 sune の写真 874×402：始めの持ち場に立ったままだと、画面の真ん中が塀の板一面で坂も寄せ手も見えない）：強右衛門の段でも塀ぎわでは上げる（見せ場のカメラ cine の間だけ上げない）
      wallLift += ((at ? 1.8 : 0) - wallLift) * Math.min(1, dt * 1.5);
    }
    if (!rt.over && !F.hall.alive && rt.canFailMission()) { this.onStructDestroyed(rt, F.hall); return; }
    // 11/19 07:50 UTC 持ち主：大手の寄せの将（小山田昌行）は門の前で撃たれると手負いで坂の下へ退く（army_think の深手の下がり）。
    //   将が退けば寄せは鈍る：一度だけ、寄せの気を二十落とし、城兵が見て叫ぶ（討たずとも門の前から将を追い返した手応え）
    if (F.masa && !F.masaBack && rt.phase === 'final' && !F.won && !rt.over && F.masa.alive && F.masa.hp < F.masa.maxHp * 0.3) {
      F.masaBack = true;
      const g = F.fin && F.fin[0];
      if (g && g.count > 0) g.morale = Math.max(0, (g.morale || 100) - 20);
      rt.say('足軽', '寄せ手の大将が手負いで退くぞ！　大手の寄せが鈍った！', 3);
    }
    if ((rt.phase === 'w1' || rt.phase === 'final') && (F.pokeT = (F.pokeT || 0) - dt) <= 0) { F.pokeT = 0.4; this.wallPoke(rt); }
    const p = shPos(rt);   // K661：d10 では元の本人（城兵）の持ち場
    // 11/19 08:40 UTC 持ち主（act bot 333秒：本人が東の塀の内 (27,0) で「武田信豊の備」に討たれた）：囲みの備（depth.js・hold）に立てた本物の兵（depth_real・_far）は、
    //   十八m に敵が来ると待ちを解いて追い掛ける（depth_reserve engageNear）。大通寺山 (34,-140) から城の内まで百四十m 追って来ていた。
    //   囲みの備は自分からは寄せない（史実：寄せは大手・搦手の手の者）＝陣から五十m より先・塀の内へは追わず、陣へ戻して待たせる
    // 11/21 22:40 UTC 持ち主（K582 携帯の act bot 籠城 148秒 w1：本人が二の丸 (9,-7) で「真田信綱の備 二」の侍60・「武田信豊の備 二」の弓に囲まれ倒れた）：
    //   一秒ごとの引き戻しの間に、共通の engageNear（一・五秒ごと・十八m）が備を又起こし、塀の内へ入った者が本人へ打ち掛かっていた→
    //   〇・四秒ごとに見て、塀の六m 手前から内は引き戻す（起こされた備は、塀の外に敵がいない限り待ちへ戻す）
    if (!(F._farLeashT > rt.t)) {
      F._farLeashT = rt.t + 0.4;
      // 11/28 持ち主（act bot 足軽 87秒 w1 で本人が二の丸 (3,9) で「真田信綱の備 二」に討たれた・2回に1回）：布陣の表の囲みの塊（fujin_layout.js nagashinojo の ngN0〜N4・_fujinRow）は
      //   _far の印が無く、段で起こされ（fujin_wake.js K457「かかれ」）百二十秒には真田・馬場・信豊の塊 百人余りが塀の内に入っていた。
      //   起きて寄せるのは残し（K457）、塀の六m 手前から内へは入れない＝持ち場を塀の外へ出し、内へ入った者は塀の外へ戻す（寄せは梯子と大手の組だけ・docs/fujin/nagashinojo.md）
      for (const g of rt.army.groups) {
        if (g._fujinRow && !g._far && g.team !== SH.oda && !g.routed && g.units) {
          const out = (x, z) => { const dN = z - (N_Z - 12), dS = (S_Z + 12) - z, dW = x - (W_X - 12), dE = (E_X + 12) - x, m = Math.min(dN, dS, dW, dE);
            return m === dN ? { x, z: N_Z - 12 } : m === dS ? { x, z: S_Z + 12 } : m === dW ? { x: W_X - 12, z } : { x: E_X + 12, z }; };
          if (g.anchor && insideCastle(g.anchor.x, g.anchor.z, 6)) { const q = out(g.anchor.x, g.anchor.z); g.anchor.x = q.x; g.anchor.z = q.z; g.dest = null; g.path = null; }
          for (const u of g.units) if (u.alive && !u.gone && insideCastle(u.pos.x, u.pos.z, 6)) { u.target = null; u.atk = null; u.moveTo = out(u.pos.x, u.pos.z); u.aiT = 4; }
          continue;
        }
        if (!g._far || g.team === SH.oda || g.routed || !g.anchor || !g.units) continue;
        let back = false;
        for (const u of g.units) {
          if (!u.alive || u.gone) continue;
          const inWall = u.pos.x > W_X - 6 && u.pos.x < E_X + 6 && u.pos.z > N_Z - 6 && u.pos.z < S_Z + 6;
          if (inWall || Math.hypot(u.pos.x - g.anchor.x, u.pos.z - g.anchor.z) > 50) { back = true; u.target = null; u.atk = null; u.moveTo = { x: g.anchor.x, z: g.anchor.z }; u.aiT = 4; }
        }
        if (!back && !g.stay) {   // 起こされた備：起こした敵が皆塀の内（塀ぎわの城兵）なら待ちへ戻す
          const c = g.center(); let out = false;
          if (c) for (const e of rt.army.units) { if (!e.alive || e.gone || e.team !== SH.oda || e.civ || e.isStruct || insideCastle(e.pos.x, e.pos.z, 6)) continue; if (Math.abs(e.pos.x - c.x) < 20 && Math.abs(e.pos.z - c.z) < 20) { out = true; break; } }
          if (!out) back = true;
        }
        if (back && !g.stay) { g.stay = true; g.order = 'hold'; g.aggro = 15; g.seekRange = 16; g.dest = null; g.path = null; }
      }
    }
    // 11/21 22:50 UTC 持ち主（携帯の act bot 信長で出陣 306秒 final★★：「行軍の列」十八人が号令 attack のまま二の丸 (18,-10) で一点に重なった）：
    //   進軍の飾りの列（march_open.js・狙われず斬り合わない）が総がかりの「かかれ」に拾われ、斬れない相手へ寄って固まった→
    //   着いた後は持ち場で待たせ続ける。寄せが来てからは、列の誰もが本人の七十m の外なら外す（関ヶ原・真田丸と同じ手。携帯の数の枠を空ける）
    // 11/22 08:40 UTC 持ち主（携帯の act bot 信長で出陣 221秒 sune★★：本人の鉄砲の組七十一人が号令 follow に戻り、本人に付いて搦手の崖の細道を下り (30,33) で一点に重なった）：
    //   夕暮れ〜二日後の段は、大きな組は本人に付いて城の外へ出ず、北の塀の内の並びで待つ（w1 と同じ持ち場）
    if (!SH.flip && (rt.phase === 'sune' || rt.phase === 'news') && !(F._sqHoldT > rt.t)) {
      F._sqHoldT = rt.t + 1;
      for (const g of rt.army.groups) if (g.isPlayerSquad && g.order === 'follow' && g.count > 12) {
        g.order = 'hold'; g.anchor = { x: -8, z: N_Z + 9 }; g.facing = Math.PI; g.formation = 'line'; g.width = Math.min(Math.max(g.width || 0, 22), 34);
        if (g.isGun) { g.ranks = Math.max(g.ranks || 2, Math.ceil(g.count / 22)); g.rankSpacing = Math.max(g.rankSpacing || 1, 1.5); g._heldByCmd = rt.t; }
      }
    }
    const mg = F.marchG;
    if (mg && !F._mgOff && rt.phase !== 'intro' && (F._mgT = (F._mgT || 0) - dt) <= 0) {
      F._mgT = 1;
      const us = (mg.units || []).filter((u) => u.alive && !u.gone);
      if (!us.length) F._mgOff = true;
      else if (F.wave && !us.some((u) => Math.hypot(u.pos.x - p.x, u.pos.z - p.z) < 70)) { for (const u of us) { try { rt.army.despawn(u); } catch (e) { /* そのまま */ } } F._mgOff = true; }
      // 11/22 08:30 UTC 持ち主（携帯の act bot 信長で出陣 271秒 news★★：列が道の終わりに着かぬまま九十秒の掛け直しが切れ、
      //   着いた印が無いので attack を拾い (10,-4) で十八人が一点に重なった）→九十秒を過ぎたら、着いていなくてもその場で槍の並びに止める
      else if ((mg._marchDone || rt.t > 90) && mg.order !== 'hold') {
        if (!mg._marchDone) { const c = mg.center?.(); if (c && mg.anchor) { mg.anchor.x = c.x; mg.anchor.z = c.z; } mg._marchDone = true; mg.formation = 'yari'; mg.yariRanks = 3; }
        mg.order = 'hold'; mg.dest = null; mg.path = null; for (const u of us) { u.target = null; u.atk = null; } }
    }
    seiroFire(rt, F, dt);
    // 11/18 14:58 UTC 持ち主（act bot 信長で出陣 66秒・156秒：本人の鉄砲の組七十余人が塀の内 (-13〜-16,-15) で重なり三十余組・
    //   遠くの軽い兵（qualityAbstract）で行き先無し）：本人から見えない所（三十歩より遠く、画面の外か四十五歩より遠く）で
    //   〇・四五m 内に仲間が重なった鉄砲は、一秒に一度、組の並びの持ち場（塀の内に限る）の方へ二・五m ずつ寄せる
    if (!(F._gunSepT > rt.t)) {
      F._gunSepT = rt.t + 1;
      for (const g of rt.army.groups) {
        // 11/18 15:58 UTC 持ち主（act bot final 356秒：塀に付いて守る東の槍の組5人＝皆遠い兵が塀ぎわ (23,-24) で重なる★★）：塀に付く組（wallGuard）も同じに寄せる
        if (!(!SH.flip && g.isPlayerSquad && g.isGun || g.wallGuard) || g.order !== 'hold' || !g.slotPos) continue;
        const zMin = g.wallGuard ? N_Z + 1 : N_Z + 2;
        const us = g.units.filter((u) => u.alive && !u.fleeing && !u.atk && !u.climb);
        for (let i = 0; i < us.length; i++) {
          const u = us[i];
          const dm = Math.hypot(u.pos.x - p.x, u.pos.z - p.z);
          if (dm < 30 || !(u.offscreen || dm > 45)) continue;
          let hit = false;
          for (let j = 0; j < us.length && !hit; j++) if (j !== i && Math.abs(us[j].pos.x - u.pos.x) < 0.45 && Math.hypot(us[j].pos.x - u.pos.x, us[j].pos.z - u.pos.z) < 0.45) hit = true;
          if (!hit) continue;
          const q = g.slotPos(u.slot, g.initial);
          if (!q || q.z < zMin || Math.hypot(q.x - u.pos.x, q.z - u.pos.z) < 0.5 || rt.world.walkable?.(q.x, q.z) === false) continue;
          // 一度に二・五m まで（一息で飛ばさない。kizugawa と同じ）
          const dq = Math.hypot(q.x - u.pos.x, q.z - u.pos.z), k = Math.min(1, 2.5 / dq);
          const nx = u.pos.x + (q.x - u.pos.x) * k, nz = u.pos.z + (q.z - u.pos.z) * k;
          if (nz < zMin || rt.world.walkable?.(nx, nz) === false) continue;
          u.pos.x = nx; u.pos.z = nz; u.pos.y = rt.world.heightAt(nx, nz);
          if (u.vel) { u.vel.x = 0; u.vel.z = 0; }
        }
      }
    }
    // 一斉射：総がかりの先手が大手の坂の中ほど（塀から十八間ほど）まで来たら、狭間の鉄砲が揃えて放つ（kaito 0929）
    if (rt.phase === 'final' && !F.finVol && F.fin && F.fin[0] && !gone(F.fin[0]) && F.fin[0].center().z > N_Z - 34) {
      F.finVol = true;
      volley(rt, F.allies.filter((g) => g.isGun || g.units.some((u) => u.type === 'gun')), { self: SH.oda, who: '奥平信昌', wait: 2.6, line: '狭間の鉄砲、放てぇっ！', banner: ['一斉射', '狭間の鉄砲が、坂を上る寄せ手へ揃えて放つ'], r: 70, hit: 24 });
    }
    // 遠くの後続：坂の下まで押し出し、しばらく留まってから背を向けて引く
    for (const fc of F.far) {
      if (fc.v === 1 && rt.t > fc.backAt) { fc.v = -1; fc.m.retreat(70, 18); fc.hideAt = rt.t + 18; }
      else if (fc.v === -1 && rt.t > fc.hideAt) { fc.v = 2; fc.m.visible = false; }
    }
    backTick(rt);
    // 梯子（束23）：運び→掛け→登りを進め、足もとに着いた寄せ手を登らせる
    updateLadders(rt.army, dt);
    for (const job of F.ladders) {
      const l = job.ladder;
      if (!l || !ladderAlive(l)) continue;
      rt.army.forNear(l.x, l.z, 2.4, (u) => { if (u.alive && u.team === SH.tak && !u.climb && !u.isStruct && !u.isPlayer) startClimb(u, l); });
    }
    // 大将は深手で退いたら、持ち場の奥で手当てを続ける。
    guardRecover(rt, F.oku, dt, {
      line: ['奥平信昌', '……退くぞ。手当てをする間、持ちこたえよ'],
      backLine: ['奥平信昌', 'もう良い、前へ出る'],
    });
    // 11/21 持ち主 K564：命の棒へ渡す並びを毎コマ new しない（使い回す）
    if (F.hpBars) { const hl = F._hpList || (F._hpList = []); hl.length = 0; for (const g of F.allies) hl.push(g); for (const g of F.enemies) hl.push(g); F.hpBars.update(hl); }
    // 城兵の士気：強さに効く
    for (const g of F.allies) g.dmgMult = 0.8 + F.mor / 200;
    const hallPct = Math.round(F.hall.hp / F.hall.maxHp * 100);
    const gatePct = Math.round(F.gate.hp / F.gate.maxHp * 100);
    const status = `城兵の士気 ${moraleWord(F.mor)}・大手門 ${F.gate.alive ? gatePct + '%' : '破られた'}・館 ${hallPct}%`;
    if (rt.phase === 'final' && !F.won) {
      const left = Math.max(0, Math.ceil(F.holdEnd - rt.t));
      rt.objProgress('hold', `残り ${left}秒・${status}`);
      // 寄せ手が早く崩れたら：時が残っていれば三の手、残り少なければ後詰の旗を早める（何もない待ちを作らない）
      if (F.fin.length >= 3 && F.fin.every(gone) && !F.lastPush) {
        F.lastPush = true;
        if (left > 50) {
          F.pushPending = true;
          rt.after(6, () => {
            F.pushPending = false;
            if (F.won) return;
            const g = takedaGroup(rt, 'w', { name: '三の手', anchor: { x: -14, z: -96 } }, [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 15 }, { type: 'bow', n: 1 }]);
            F.fin.push(g);
            rt.banner('三の手', '武田はなおも寄せてくる');
            rt.say('奥平信昌', 'まだ来るか……！　槍を立てよ、あと一息じゃ！', 3);
            this.farPush(rt, 2);
          });
        }
      } else if (F.lastPush && !F.pushPending && F.fin.every(gone) && left > 15 && !F.shortened) {
        F.shortened = true;
        F.holdEnd = rt.t + 15;
        rt.say('足軽', '武田が引いていく……？　西の山を見よ！', 3);
      }
      if (left <= 0) this.win(rt);
    } else if (!F.won) rt.objProgress('hold', status);
    if (hallPct < 50 && !F.hallWarn) { F.hallWarn = true; rt.bark('本丸の館が危ない！　中に入った敵を討て', true); }
    // 寄せが長引いたら、残った者は退く（どこかで詰まらないように）
    for (const g of F.enemies) {
      if (gone(g) || g === F.watch) continue;
      const age = rt.t - (g.bornT || 0);
      const live = g.units.filter((u) => u.alive);
      if ((age > 110 && live.length <= 4) || (age > 80 && live.every((u) => u.type === 'bow' || u.type === 'gun')) || age > 190) { g.noRout = false; g.morale = 0; }
      // 11/19 08:00 UTC 持ち主（描かずの測り：総がかりの80秒目から、将の退いた大手の寄せ九〜十四人が坂の下 (−4,−98) に留まり、
      //   崩れも寄せもせず、本人の二十m 内に敵が一人もいない四十秒が続いた。崩れていないので三の手も後詰の旗も早まらなかった）：
      //   総がかりの寄せで、生きた者が皆塀から三十五m より下にいる時が十秒続けば崩れたとみなす（三の手・後詰の旗の早めへ渡す）
      if (rt.phase === 'final' && (F.fin || []).includes(g) && age > 50 && live.length && live.every((u) => u.pos.z < N_Z - 35)) {
        // 頭（侍・将）が生きている組は士気だけでは崩れない（army_groups）。一の寄せの引き鉦と同じく、引く下知として崩れに替える
        if ((g._farT = (g._farT || 0) + dt) > 10) { g.noRout = false; g.morale = 0; g.routed = true; g.order = 'flee'; g.fleeDir = { x: 0, z: -1 }; g.fleeSet = true; }
      } else g._farT = 0;
    }
    // 城の外へ出たか（強右衛門を送る間は別）
    if (!SH.flip && rt.phase !== 'sune' && !F.won && !insideCastle(p.x, p.z, 3)) {   // K661：塀の外へ出るなの掟は城兵の本人だけ
      F.outT = (F.outT || 0) + dt;
      if (F.outT > 4 && !F.outWarned) {
        F.outWarned = true;
        rt.violation('下知なく城の外へ出た', ['奥平信昌', '戻れ！　塀の外へ出るなと申したはずじゃ！']);
        rt.objFail('stay');
      }
    } else F.outT = 0;
    if (rt.phase === 'w1') this.w1Update(rt);
    if (F.fire === 'active') {
      const left = Math.ceil(F.fireEnd - rt.t);
      rt.objProgress('fire', `残り ${F.fires.filter((q) => !q.out).length} か所・${Math.max(0, left)}秒`);
      if ((F.smokeT = (F.smokeT || 0) - dt) <= 0) {
        F.smokeT = 0.7;
        for (const f of F.fires) if (!f.out) rt.army.smoke(f.x + (Math.random() - 0.5), rt.world.heightAt(f.x, f.z) + 3.4, f.z, 0.1, 0.05);
      }
      if (left <= 25 && !F.fireWarn) { F.fireWarn = true; rt.bark('蔵の火が広がっている！　急げ', true); }
      if (left <= 0) this.fireFail(rt);
    }
    if (rt.phase === 'sune') this.suneUpdate(rt, dt);
  },

  // 11/19 04:40 UTC 持ち主（act bot 2戦：塀ぎわで二十人を突き伏せ、受けた刃の傷は足軽・侍とも0）：本人は塀越しに突けるが、
  //   寄せ手の槍は塀に遮られて一度も突き返さなかった。塀の下に取り付いた寄せ手の槍は、塀ぎわに立つ本人へ塀越しに突き上げる
  //   （城攻めの常。塀の外一・八m 内の槍と、塀の内一・八m 内の本人の間だけ。二・五秒に一度・数と強さは変えない）
  wallPoke(rt) {
    if (SH.flip) return;   // K661：塀越しに城兵の本人を突く寄せ手（d10 の本人は寄せ手）
    const me = rt.player?.u;
    if (!me || !me.alive || rt.over || !insideCastle(me.pos.x, me.pos.z) || me.pos.z > N_Z + 1.8) return;
    // 11/19 08:50 UTC 持ち主（act bot 394秒 final「すぐそばの敵の侍が六秒なにもしない」）：塀のすぐ外（二・五m 内）で本人の三・五m 内に立つ刀の寄せ手は、
    //   塀越しに本人へ届かず（高さの差）、狙いも振りも無いまま立っていた。二度続けて見つけたら（〇・八秒）目の前の塀（門の前なら門）を打たせる＝塀を破りに掛かる
    rt.army.forNearIn(me.pos.x, me.pos.z, 3.5, 3.5, (o) => {
      if (o.team !== SH.tak || !o.alive || o.fleeing || o.target || o.atk || o.swing || o.downed || o.isStruct || o.inside || o.type === 'gun' || o.type === 'bow' || o.type === 'busho') { if (o.team === SH.tak) o._wallIdle = 0; return; }
      if (o.pos.z > N_Z - 0.2 || o.pos.z < N_Z - 2.5 || (o.wpnKind || o.lookWeapon || o.weapon) === 'spear') return;
      if ((o._wallIdle = (o._wallIdle || 0) + 1) < 2) return;
      o._wallIdle = 0;
      let seg = null, sd = 1e9;
      for (const s of rt.flags.north) { if (!s.alive || !s.seg) continue; const d = Math.abs((s.seg[0] + s.seg[2]) / 2 - o.pos.x) - (s === rt.flags.gate ? 2 : 0); if (d < sd) { sd = d; seg = s; } }
      if (seg) { o.target = seg; o.moveTo = null; o.aiT = 3; }
    });
    if (Math.abs(me.pos.x - GATE.x) < 3.5 && rt.flags.gate.alive) return;   // 大手門の扉越しには突かない
    let best = null, bd = 9;
    rt.army.forNearIn(me.pos.x, me.pos.z, 3.4, 3.4, (o) => {
      if (o.team !== SH.tak || !o.alive || o.fleeing || o.swing || o.downed || o.stagger > 0 || o.inside || o.isStruct) return;
      if ((o.wpnKind || o.lookWeapon || o.weapon) !== 'spear' || o.pos.z > N_Z - 0.2 || o.pos.z < N_Z - 1.8 || (o.pokeAt || 0) > rt.t) return;
      const d = (o.pos.x - me.pos.x) ** 2 + (o.pos.z - me.pos.z) ** 2;
      if (d < bd) { bd = d; best = o; }
    });
    if (!best) return;
    best.pokeAt = rt.t + 2.5 + Math.random();
    best.heading = Math.atan2(me.pos.x - best.pos.x, me.pos.z - best.pos.z);
    rt.army.startSwing(best, 'thrust', me);
    if (best.swing) best.swing.overWall = true;
  },

  w1Update(rt) {
    const F = rt.flags;
    if (!F.fire && (rt.pt > 55 || F.w1.every(gone))) { F.fire = 'soon'; rt.after(3, () => this.startFire(rt)); }
    if (F.w1.every(gone)) { rt.unmark('w1a'); rt.unmark('w1b'); }
    else { if (gone(F.w1[0])) rt.unmark('w1a'); if (gone(F.w1[1])) rt.unmark('w1b'); }
    // 11/18 03:30 持ち主（act bot：印『大手への寄せ・崩れかけ』へ百八十秒歩けず、最も近くて56m）：鉄砲で崩れかけて坂の中ほどに
    //   留まる寄せ手は、塀の内から行けない所にいる。塀から二十五m より外で崩れかけた組の印は消す（本人を塀の外へ誘わない）
    F.w1.forEach((g, i) => { if (!gone(g) && g.morale < 30 && g.center().z < N_Z - 25) rt.unmark(i ? 'w1b' : 'w1a'); });
    const fireOver = F.fire === 'done' || F.fire === 'fail';
    // 11/10 クラウド長篠城：寄せ手が塀の外に残ると、一の寄せが千秒終わらなかった（act・侍の出陣）。
    //   火の段が済んで寄せが百六十秒を過ぎたら、残りの寄せ手は引き鉦で坂の下へ退く（城攻めは一日で落ちず、寄せては引いた）。
    if (fireOver && rt.pt > 150 && !F.w1Back && !F.w1.every(gone)) {
      F.w1Back = true;
      // 頭（侍）が生きている組は士気だけでは崩れない（army_groups）。引く下知として崩れに替える。
      for (const g of F.w1) if (!gone(g)) { g.noRout = false; g.morale = 0; g.routed = true; g.order = 'flee'; g.fleeDir = { x: 0, z: -1 }; g.fleeSet = true; }
      sfx('kane', 0.8);
      rt.say('足軽', '寄せ手が引いていくぞ！', 2.5);
    }
    if (F.w1.every(gone) && fireOver && !F.w1Done) {
      F.w1Done = true;
      rt.setPhase('lull');
      if (F.fireBows && !gone(F.fireBows)) { F.fireBows.noRout = false; F.fireBows.morale = 0; }
      rt.award((t) => t.side.push('一の寄せを退けた'), '一の寄せを退けた');
      rt.say('奥平信昌', 'よう凌いだ。……じゃが、武田は明日もまた来る。兵糧も心許ない', 4);
      rt.after(10, () => this.startSune(rt));
      F.suneSoon = rt.t + 10;
    }
  },

  onKill(rt, v, k) {
    if (v.team === SH.tak && !v.isPlayer) rt.flags.ek = (rt.flags.ek || 0) + 1; else if (v.team !== SH.tak && !v.isPlayer) rt.flags.ak = (rt.flags.ak || 0) + 1;
    carrion(rt, v);
    // 11/19 持ち主：大手の総がかりの将が討たれたら、その寄せは怯む（手柄は本人の手で討った時だけ）
    if (v.name === '小山田昌行') {
      const F = rt.flags, g = F.fin && F.fin[0];
      if (g && g.count > 0) g.morale = Math.max(0, (g.morale || 100) - 35);
      if (k && k.isPlayer) rt.award((t) => t.side.push('小山田昌行を討ち取った'), '小山田昌行を討ち取った');
      // 11/19 07:50 UTC 持ち主（描かずの測り：昌行は207秒に大手門の前で撃たれ、手負いで坂の下 (-4,-102) へ退き、
      //   勝った後の312秒に深手で倒れた。誰もいない坂の下で倒れたのに「討ち取ったり」と叫んでいた）：
      //   総がかりの間に、城兵の手（討った者）がある時だけ叫ぶ
      if (k && !F.won && !rt.over && rt.phase === 'final') rt.say(k.isPlayer ? '奥平信昌' : '足軽', '小山田昌行、討ち取ったり！　大手の寄せが怯んだぞ！', 3);
    }
  },
  onRout(rt, g) {
    const F = rt.flags;
    if (g === F.watch) rt.unmark('watch');
    if ((F.fin || []).includes(g)) rt.say('足軽', `${g.name}が崩れたぞ！`, 2.5);
  },
  onStructHit(rt, s) {
    const F = rt.flags;
    if ((F.hitWarn || -99) + 12 > rt.t) return;
    F.hitWarn = rt.t;
    if (s === F.hall) { rt.bark('本丸の館が攻められている！', true); return; }
    if (s === F.gate) { rt.bark('大手門が打ち破られそうじゃ！', true); return; }
    if (!s.seg) return;
    const x = (s.seg[0] + s.seg[2]) / 2;
    rt.bark(`${x < GATE.x ? '北の塀の西' : '北の塀の東'}に取り付かれている！`, true);
  },
  onStructDestroyed(rt, s) {
    const F = rt.flags;
    if (s === F.hall) {
      if (!rt.canFailMission()) return;
      rt.banner('本丸の館が破られた', '長篠城、落ちる');
      rt.say('奥平信昌', '無念……ここまでか', 3.5);
      rt.tracker.main = false;
      rt.objFail('hold');
      rt.finish({}, 7);
      return;
    }
    if (s === F.gate) {
      F.gateBroken = true;
      rt.objFail('gate');
      s.mesh.visible = true;
      for (const lv of s.mesh.userData.leaves) { lv.rotation.x = 1.4 + Math.random() * 0.12; lv.position.y = 0.1; }
      rt.banner('大手門が破られた', '二の丸へなだれ込んでくる');
      rt.say('奥平信昌', '門が破られた！　門の内で食い止めよ！　本丸へは入れるな！', 3.5);
      // 11/18 長篠城の持ち主（act bot 351秒：大手の槍の組6人が破れた門の口 (-4,-24) の一点に重なって止まる）：
      //   門の口へ詰め寄らず、門の内五m に口より広く横に開いて槍衾で受ける
      const gs = F.allies && F.allies[0];
      if (gs && gs.alive !== false && gs.count > 0) {
        gs.anchor = { x: GATE.x, z: N_Z + 5 }; gs.facing = Math.PI; gs.formation = 'line';
        gs.width = Math.max(4, Math.min(10, Math.ceil(gs.count / 2))); gs.spacing = 1.6; gs.guardLeash = 3;
      }
      sfx('wood', 1.2);
      return;
    }
    s.stumps = stumps(rt.world, s.seg);
    rt.scene.add(s.stumps);
    rt.say('奥平信昌', '塀が破られたぞ！　破れ目を槍で塞げ！', 3);
    sfx('wood', 1);
  },
  onFinish(rt) {
    const R = rt.G.rel.okudaira;
    if (!R) return;
    if (rt.tracker.main) { R.trust += 8; R.like += 6; }
    if (rt.flags.suneState === 'done') R.like += 4;
  },
};

// 両軍の総勢（城兵 五百、武田 一万五千）
nagashinojo.kit = KIT;   // battles.js の戦も使う
nagashinojo.force = (rt) => {
  const F = rt.flags;
  return { a: Math.max(100, 500 - (F.ak || 0) * 3), a0: 500, b: 15000 - (F.ek || 0) * 18, b0: 15000 };
};
nagashinojo.sides = { a: { name: '徳川方・奥平勢', mon: 'okudaira' }, b: { name: '武田軍', mon: 'takeda' } };
nagashinojo.date = (rt) => {
  const w = rt.world;
  const time = { day: '昼', dusk: '夕暮れ', after: '昼下がり', storm: '昼' }[w.timeKey] || '昼';
  return rt.flags.newsDay ? `天正三年五月十六日　夏・晴・${w.timeKey === 'day' ? '朝' : time}` : `天正三年五月十四日　夏・晴・${time}`;
};
nagashinojo.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '武田の寄せまで待つ' : rt.phase === 'lull' ? '夕暮れまで待つ' : '');
nagashinojo.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
nagashinojo.history = '天正三年五月、武田勝頼はおよそ一万五千の兵で長篠城を囲んだ。城主の奥平信昌（この頃の名は貞昌）はわずか五百ほどの兵で守り、兵糧蔵を焼かれて追い詰められたと伝わる。鳥居強右衛門は夜のうちに城を抜け出して川を下り、岡崎で家康と信長に後詰を願った。城へ戻る途中で武田方に捕らえられ、「援軍は来ない」と告げるよう命じられたが、城に向かって「援軍はすぐに来る」と叫び、磔にされたと伝わる。五月十八日、織田・徳川の後詰は設楽原に着き、二十一日の決戦へと続いた。';

// 素直な遊び手：火が出れば消しに行き、夕暮れは強右衛門について見張りを討ち、ほかは塀の内で寄せ手を突く
// 城の中の塀は、本丸の門と搦手の口を通って越える
function navTo(p, inp, x, z, r, goTo) {
  const u = p.u, px = u.pos.x, pz = u.pos.z;
  const inP = insideCastle(px, pz), inT = insideCastle(x, z);
  // 口の手前に寄ってから、まっすぐ抜ける
  const via = (gx, gz) => {
    if (Math.abs(px - gx) > 1.2) { goTo(p, inp, gx, gz, 0.6); return true; }
    return false;
  };
  // 本丸と二の丸をまたぐ
  const sideOf = (zz) => (zz > IN_Z ? 1 : -1);
  if (inP && (inT || z > S_Z) && sideOf(pz) !== sideOf(z)) {
    const s = sideOf(pz);
    if (!via(GATE2.x, IN_Z + s * 2.5)) goTo(p, inp, GATE2.x, IN_Z - s * 3, 0.5);
    return;
  }
  // 搦手から出る・入る
  if (inP && !inT && z > S_Z) {
    if (!via(KARA.x, S_Z - 2.5)) goTo(p, inp, KARA.x, S_Z + 3, 0.5);
    return;
  }
  if (!inP && inT && pz > S_Z - 1) {
    if (!via(KARA.x, S_Z + 3)) goTo(p, inp, KARA.x, S_Z - 3, 0.5);
    return;
  }
  goTo(p, inp, x, z, r);
}
nagashinojo.botBrain = (b, inp, { goTo }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.k.delete('KeyW'); inp.k.delete('KeyE');
  inp.guardHold = false;
  if (!u.alive) return;
  const fight = (e) => {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    // 塀の外の敵は、塀のすぐ内で待って突く（塀越しに突けるのは、塀から 1.5m の内だけ）
    const overWall = insideCastle(u.pos.x, u.pos.z) && e.pos.z < N_Z && (b.flags.gate.alive || Math.abs(e.pos.x - GATE.x) > 3.5);
    if (overWall) goTo(p, inp, Math.max(W_X + 2, Math.min(E_X - 2, e.pos.x)), N_Z + 1.1, 0.4);   // 塀から 1.5m の内でないと槍が越えない
    else if (d > 2.4) navTo(p, inp, e.pos.x, e.pos.z, 2.2, goTo);
    if (d < 4 && !(overWall && inp.k.has('KeyW'))) p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d < 3.2 && Math.random() < 0.5) inp.leftPressed = true;
    inp.guardHold = (b.army.threats || []).length > 0 && Math.random() < 0.6;
  };
  // 火消し
  if (F.fire === 'active') {
    let it = null, bd = Infinity;
    for (const x of b.interacts) if (x.id.startsWith('fire')) { const d = Math.hypot(x.pos.x - u.pos.x, x.pos.z - u.pos.z); if (d < bd) { bd = d; it = x; } }
    if (it) {
      const foe = b.army.nearestEnemy(u, 2.6);
      if (foe) { fight(foe); return; }
      if (bd > 1.6) navTo(p, inp, it.pos.x, it.pos.z, 1.2, goTo); else inp.k.add('KeyE');
      return;
    }
  }
  // 強右衛門の送り出し
  if (b.phase === 'sune' && F.sune && F.sune.alive && !F.suneState) {
    const s = F.sune;
    const foe = b.army.nearestEnemy(s, 16) || b.army.nearestEnemy(u, 5);
    if (foe) { fight(foe); return; }
    navTo(p, inp, s.pos.x, s.pos.z, 4, goTo);
    return;
  }
  // 本丸に入った敵が最優先
  const inHon = b.army.nearestEnemy(u, 90, (o) => insideCastle(o.pos.x, o.pos.z) && o.pos.z > IN_Z);
  if (inHon) { fight(inHon); return; }
  // 深手なら、二の丸の奥で息を整える
  if (u.hp < u.maxHp * 0.5) F.botRest = true;
  if (u.hp > u.maxHp * 0.85) F.botRest = false;
  if (F.botRest) {
    const foe = b.army.nearestEnemy(u, 2.8);
    if (foe) { fight(foe); return; }
    navTo(p, inp, GATE2.x + 6, IN_Z - 4, 1.5, goTo);
    return;
  }
  // 大手門に取り付いた敵（門が打たれている間は、門の内から先に突く）
  if (F.gate.alive && F.gate.hp < F.gate.maxHp * 0.98) {
    const g = b.army.nearestEnemy(u, 60, (o) => Math.abs(o.pos.x - GATE.x) < 6 && o.pos.z < N_Z && o.pos.z > N_Z - 6);
    if (g) { fight(g); return; }
  }
  // 城の内か、塀のすぐ外の敵
  const e = b.army.nearestEnemy(u, 24, (o) => o.pos.z > N_Z - 3 && o.pos.x > W_X - 1 && o.pos.x < E_X + 1 && o.pos.z < S_Z);
  if (e) { fight(e); return; }
  // 寄せ手のいる所の塀へ
  // 11/18 クラウド k365-cloud-17（質の照らし：総がかりの200秒に bot が東の塀ぎわへ寄り、画面が塀と空の本丸だけ）：最後の段は任務の通り大手門の内に構える
  if (b.phase === 'final') { navTo(p, inp, GATE.x, N_Z + 10, 3, goTo); return; }
  const far = b.army.nearestEnemy(u, 200, (o) => o.pos.z < N_Z + 40 && o.pos.z > -130);
  if (far) navTo(p, inp, Math.max(W_X + 4, Math.min(E_X - 4, far.pos.x)), N_Z + 2.5, 2, goTo);
  else navTo(p, inp, GATE.x, N_Z + 8, 3, goTo);
};
// K651：戦場の地形と見た目の決まり（高さ・川・崖・道）。ほかの家の同じ戦（武田編 d10）は同じ地面を使う
export const NAGA_WORLD = nagashinojo.world;
