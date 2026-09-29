// ======================================================================
// 信長包囲網　比叡山（延暦寺）攻め（元亀二年九月十二日）
// 浅井・朝倉をかくまい、織田に従わなかった延暦寺を、信長は坂本から攻めた。
// 足軽は明智光秀の手。①坂本から山道を登る ②山門の前で僧兵を退け、門を破る組を守る
// ③門の内で、名のある僧兵の大将・正覚院豪盛の薙刀の衆と戦う ④山の上の堂塔が燃える。逃げる者は追わない
// 史実の焼き討ちは多くの死者を出したと伝わるが、ここでは戦う僧兵とだけ戦い、非戦の者は討たない（副任務）
// 向き：東（+x）が琵琶湖と坂本。西（-x）へ登ると山門、その奥に東塔の堂
// ======================================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { nobori, jinmaku, hut, romon, dou, stumps, hashigo } from './props.js';
import { flagTexture } from './textures.js';
import { RANKS } from './state.js';
import { applyLook } from './b_inabayama.js';
// 堂塔が燃える煙で日が陰り、空が茶色く濁った朝
const SMOKY = { sky: 0x8a7a66, fog: 0x7a6a58, sun: 0xd89a64, sunI: 0.95, hs: 0xa89480, hg: 0x3a3026, hI: 1.0, top: 0x5a5048, glow: 0.3, dir: [0.8, 0.35, 0.3], mount: 0x3a342c };
import { sfx } from './audio.js';
import { moraleWord } from './hud.js';
import { gauss, enemyGroup, allyGroup, nm, centerOf, unitPos, wallLine } from './bhelp.js';

const GATE = { x: 8, z: 0 };               // 山門（東向き）
const SAKA = { x: 96, z: 6 };              // 坂本（湖のほとり）
const CHUDO = { x: -50, z: -4 };           // 根本中堂の前
const ROAD = [[150, 10], [SAKA.x, SAKA.z], [60, -4], [34, 6], [GATE.x + 2, 0], [-20, -2], [CHUDO.x, CHUDO.z], [-110, -20], [-178, -30]];
const HALLS = [[-62, -22, 14, 9], [-44, 22, 9, 6], [-24, -24, 8, 6], [-80, 18, 10, 7]];   // 門の内の堂（x, z, 幅, 奥行）
const FAR = [[-130, -60], [-140, 30], [-120, 90], [-150, -110]];                          // 山の上の遠い堂塔（西塔・横川）

// 僧兵：袈裟の上に腹巻、白い頭巾（今ある形では鉢巻で代える）、短く持った長柄（薙刀の代わり）
// sohei: 1 を見て、humans.js が白い裹頭・袈裟・薙刀の僧兵の姿にする
const SOHEI = { armor: 0x2a2622, lace: 0xcfc7b4, cloth: 0xd8d2c2, hat: 'hachimaki', flag: null, weaponExtra: 0, sohei: 1 };
const ODA = { flag: 'oda' };
const dress = (list, lk) => list.map((s) => ({ ...s, o: { ...lk, ...(s.o || {}) } }));
const gone = (g) => !g || g.count === 0 || g.routed;

function height(x, z) {
  let h = 0.5 * Math.sin(x * 0.04) * Math.cos(z * 0.033) + 0.35 * Math.sin(z * 0.06 + x * 0.02);
  // 西へ登る比叡の山すそ。門の内は一段ならした平場
  h += Math.max(0, 70 - x) * 0.26;
  h += 10 * gauss(x, z, -150, 0, 6000);
  // 門の内の平場（ならして平らに）
  const flat = Math.max(0, 1 - Math.max(0, Math.hypot(x - (CHUDO.x + 20), z) - 36) / 10);
  h = h * (1 - flat * 0.6) + (70 - (CHUDO.x + 20)) * 0.26 * flat * 0.6;
  // 東は琵琶湖へ
  if (x > 112) h -= Math.min(8, (x - 112) * 0.4);
  return h;
}

// 山門の扉（二枚。破られると内へ倒れる）
function doors(W, x, z, w) {
  const grp = new THREE.Group();
  grp.userData.leaves = [];
  const mat = new THREE.MeshStandardMaterial({ color: 0x4a3626, roughness: 0.9 });
  for (const sd of [-1, 1]) {
    const pv = new THREE.Group();
    pv.position.set(0, 0, sd * w / 4);
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.18, 3.1, w / 2 - 0.06), mat);
    m.position.y = 1.55; m.castShadow = true;
    pv.add(m);
    grp.add(pv);
    grp.userData.leaves.push(pv);
  }
  grp.position.set(x, W.heightAt(x, z), z);
  return grp;
}

// 築地塀：土を突き固めた白壁に、瓦の笠
const TSUJI = { wall: new THREE.MeshStandardMaterial({ color: 0xd2cabb, roughness: 0.95 }), base: new THREE.MeshStandardMaterial({ color: 0x6a5a48, roughness: 1 }), roof: new THREE.MeshStandardMaterial({ color: 0x34322f, roughness: 0.8 }) };
function tsuji(W, seg) {
  const [ax, az, bx, bz] = seg;
  const len = Math.hypot(bx - ax, bz - az), mx = (ax + bx) / 2, mz = (az + bz) / 2;
  const y = Math.min(W.heightAt(ax, az), W.heightAt(bx, bz), W.heightAt(mx, mz));
  const g = new THREE.Group();
  const add = (geo, mat, yy) => { const m = new THREE.Mesh(geo, mat); m.position.y = yy; m.castShadow = true; m.receiveShadow = true; m.userData.camBlock = true; g.add(m); };
  add(new THREE.BoxGeometry(0.9, 2.6, len + 0.05), TSUJI.wall, 1.3 - 0.4);
  add(new THREE.BoxGeometry(0.95, 0.5, len + 0.06), TSUJI.base, -0.1);
  add(new THREE.BoxGeometry(1.5, 0.16, len + 0.4), TSUJI.roof, 2.3);
  add(new THREE.BoxGeometry(0.4, 0.2, len + 0.4), TSUJI.roof, 2.45);
  g.position.set(mx, y, mz);
  g.rotation.y = Math.atan2(bx - ax, bz - az);
  return g;
}

// 延暦寺の幟：生成りの布に、墨の輪宝（八本の輻と、縁の八つの爪）。textures.js の紋にはないので、ここで描く
let rinboTex = null;
function rinboTexture() {
  if (rinboTex) return rinboTex;
  const c = document.createElement('canvas'); c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#e4dccb'; g.fillRect(0, 0, 128, 256);
  const cx = 64, cy = 82, r = 36;
  g.strokeStyle = g.fillStyle = '#1a1712';
  g.lineWidth = 6; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, r - 7, 0, Math.PI * 2); g.stroke();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
    // 輻（細い剣の形）
    g.lineWidth = 4; g.beginPath(); g.moveTo(cx + ca * 9, cy + sa * 9); g.lineTo(cx + ca * (r - 3), cy + sa * (r - 3)); g.stroke();
    // 縁の外の爪（三角）
    const p = (d, o) => [cx + Math.cos(a + o) * d, cy + Math.sin(a + o) * d];
    g.beginPath(); g.moveTo(...p(r + 12, 0)); g.lineTo(...p(r + 1, 0.13)); g.lineTo(...p(r + 1, -0.13)); g.closePath(); g.fill();
  }
  g.beginPath(); g.arc(cx, cy, 10, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#e4dccb'; g.beginPath(); g.arc(cx, cy, 4, 0, Math.PI * 2); g.fill();
  // 使い込んだ布：織り目と、裾の汚れ
  for (let y = 0; y < 256; y += 2) { g.fillStyle = `rgba(0,0,0,${0.02 + Math.random() * 0.02})`; g.fillRect(0, y, 128, 1); }
  const gr = g.createLinearGradient(0, 180, 0, 256); gr.addColorStop(0, 'rgba(60,48,30,0)'); gr.addColorStop(1, 'rgba(60,48,30,.35)');
  g.fillStyle = gr; g.fillRect(0, 180, 128, 76);
  rinboTex = new THREE.CanvasTexture(c);
  rinboTex.colorSpace = THREE.SRGBColorSpace;
  return rinboTex;
}
function rinboNobori(W, x, z, h) {
  const n = nobori(W, x, z, 'hikyaku', h);
  const f = n.userData.flag, m0 = f.material;
  const m = m0.clone(); m.onBeforeCompile = m0.onBeforeCompile; m.map = rinboTexture();
  f.material = m;
  return n;
}

// 参道：山門の手前の坂に石段を刻み、両脇に石灯籠と杉並木
function sando(W) {
  const stone = [], tree = [];
  const paint = (g, hex) => { const gg = g.toNonIndexed(); const c = new THREE.Color(hex); const a = new Float32Array(gg.attributes.position.count * 3); for (let i = 0; i < a.length; i += 3) { a[i] = c.r; a[i + 1] = c.g; a[i + 2] = c.b; } gg.setAttribute('color', new THREE.BufferAttribute(a, 3)); return gg; };
  // 道の真ん中の z（ROAD の点をつないだ線）
  const zc = (x) => { for (let i = 0; i < ROAD.length - 1; i++) { const [ax, az] = ROAD[i], [bx, bz] = ROAD[i + 1]; if ((x - ax) * (x - bx) <= 0 && ax !== bx) return az + (bz - az) * (x - ax) / (bx - ax); } return 0; };
  // 石段：山門から東へ 30m、一段ずつ地面に沿って
  for (let x = GATE.x + 2; x < GATE.x + 32; x += 0.9) {
    const z0 = zc(x), y = W.heightAt(x, z0);
    const g = new THREE.BoxGeometry(0.85, 0.22, 5.2); g.translate(x, y + 0.02, z0);
    stone.push(paint(g, (Math.round(x * 3) % 2) ? 0x807a70 : 0x767168));
  }
  // 石灯籠：竿・火袋・笠・宝珠
  for (const x of [GATE.x + 6, GATE.x + 14, GATE.x + 22, GATE.x + 30]) for (const dz of [-4, 4]) {
    const z = zc(x) + dz, y = W.heightAt(x, z);
    const parts = [[0.5, 0.2, 0.5, 0.1], [0.2, 0.9, 0.2, 0.65], [0.55, 0.12, 0.55, 1.16], [0.42, 0.42, 0.42, 1.43], [0.7, 0.16, 0.7, 1.72]];
    for (const [w, h, d, yy] of parts) { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y + yy, z); stone.push(paint(g, 0x8a857a)); }
    const hj = new THREE.SphereGeometry(0.12, 6, 4); hj.translate(x, y + 1.9, z); stone.push(paint(hj, 0x8a857a));
  }
  // 杉並木：まっすぐな幹と、段になった暗い葉
  for (let x = GATE.x + 8; x < GATE.x + 44; x += 5) for (const z of [-7.5, 7.5]) {
    const zz = zc(x) + z + ((x * 7) % 3 - 1) * 0.6, y = W.heightAt(x, zz), H = 13 + ((x * 13) % 5);
    const tr = new THREE.CylinderGeometry(0.22, 0.4, H, 6); tr.translate(x, y + H / 2, zz); tree.push(paint(tr, 0x4a3a2c));
    for (let k = 0; k < 4; k++) { const c = new THREE.ConeGeometry(2.2 - k * 0.4, 3.2, 7); c.translate(x, y + H * 0.45 + k * 2.2, zz); tree.push(paint(c, [0x243222, 0x2a3a28, 0x223020, 0x2c3c2a][k])); }
  }
  const g = new THREE.Group();
  const sm = new THREE.Mesh(mergeGeometries(stone), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
  sm.receiveShadow = true; sm.castShadow = true;
  const tm = new THREE.Mesh(mergeGeometries(tree), new THREE.MeshLambertMaterial({ vertexColors: true }));
  tm.castShadow = true;
  g.add(sm, tm);
  return g;
}

const hieizan = {
  spawn: { x: SAKA.x - 18, z: SAKA.z + 4, heading: -Math.PI / 2 },
  world: {
    seed: 1571,
    wind: [-0.8, 0.6],   // 比叡おろし：山から湖へ吹き下ろす
    time: 'day',
    autumn: true,     // 旧暦九月：枯れ色の草と色づく木
    muddy: 0.2,
    water: { x: 124, level: -2.4 },
    paths: [ROAD],
    height,
    tint(x, z, h, c) {
      // 門の内の白い砂の平場
      if (x < GATE.x && x > CHUDO.x - 40 && Math.abs(z) < 40) c.lerp({ r: 0.55, g: 0.52, b: 0.45 }, 0.55);
      // 杉の山は暗く
      else if (x < 40) c.setRGB(c.r * 0.82, c.g * 0.9, c.b * 0.8);
    },
    clear: (x, z) => (x > GATE.x - 70 && x < 110 && Math.abs(z) < 34),
    trees: 620,
    tufts: 3600,
    // 比叡の杉木立（道と平場のまわりは開ける）
    treeDensity: (x, z) => (x > 110 ? 0.1 : Math.abs(z) < 36 && x > -95 ? 0.25 : 1),
    groves: [{ x: 30, z: 40, r: 14, n: 26 }, { x: 40, z: -40, r: 14, n: 26 }, { x: -20, z: 50, r: 14, n: 24 }, { x: -30, z: -52, r: 14, n: 24 }],
    // 退く僧兵と、逃げる人々は山の奥（西）で消す
    fleeOut: (x, z, team) => team === 1 && x < -105,
  },

  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    F.step = 0; F.ek = 0; F.ak = 0;
    // ---- 山門と、左右の築地塀（壊せない） ----
    F.gate = rt.army.addStruct({ seg: [GATE.x, GATE.z - 3, GATE.x, GATE.z + 3], hp: 1500, maxHp: 1500, armor: 0.2, team: 1, name: '山門' });
    F.gate.mesh = doors(W, GATE.x, GATE.z, 6);
    rt.scene.add(F.gate.mesh);
    // 山門：瓦屋根の二階の楼門
    rt.scene.add(romon(W, GATE.x, GATE.z, 6.4, Math.PI / 2));
    wallLine(rt, [[GATE.x, GATE.z - 3], [GATE.x + 1, -24], [GATE.x - 4, -40]], { team: 1, hp: 1e9, name: '築地塀', segLen: 6, mesh: tsuji });
    wallLine(rt, [[GATE.x, GATE.z + 3], [GATE.x + 1, 24], [GATE.x - 4, 40]], { team: 1, hp: 1e9, name: '築地塀', segLen: 6, mesh: tsuji });
    // ---- 門の内の堂と、山の上の堂塔 ----
    // 堂は石の基壇・縁側・瓦の大屋根（正面を東の山門へ向ける）
    F.halls = HALLS.map(([x, z, w, d]) => { const m = dou(W, x, z, w, d, Math.PI / 2); rt.scene.add(m); return { x, z, w, d, m }; });
    for (const [x, z] of FAR) rt.scene.add(dou(W, x, z, 12, 8, Math.PI / 2 + 0.3, { h: 4.2 }));
    // 堂の前に集まった僧と山の人々（遠景）。門が破れると奥へ逃れる
    F.crowd = W.addDistantArmy({ x: CHUDO.x - 30, z: 2, w: 16, d: 8, count: 90, facing: Math.PI / 2, armor: 0xcfc7b4, flagTex: rinboTexture(), seed: 1571 });
    W.addDistantArmy({ x: -128, z: -34, w: 12, d: 8, count: 60, facing: Math.PI / 2, armor: 0xbdb5a2, flagTex: rinboTexture(), seed: 1572 });
    // ---- 織田勢：明智光秀の手（自分の持ち場）、門を破る組、佐久間の手 ----
    F.ake = allyGroup(rt, { faction: 'oda', name: '明智光秀の手', anchor: { x: SAKA.x - 24, z: SAKA.z }, facing: -Math.PI / 2, width: 14, aggro: 8, noRout: true },
      dress([{ type: 'busho', n: 1, o: { name: '明智光秀', invuln: true, horse: true, hat: 'kabuto_w', haori: 0x3a3a52 } }, { type: 'ashigaru', n: 16 }, { type: 'gun', n: 4 }], ODA));
    F.akeU = F.ake.units[0];
    F.ram = allyGroup(rt, { faction: 'oda', name: '門を破る組', anchor: { x: SAKA.x - 18, z: SAKA.z + 14 }, facing: -Math.PI / 2, width: 5, aggro: 3, noRout: true, formation: 'column' },
      dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 12, o: { hat: 'jingasa_n' } }], ODA));
    F.saku = allyGroup(rt, { faction: 'oda', name: '佐久間信盛の手', anchor: { x: SAKA.x - 20, z: SAKA.z - 16 }, facing: -Math.PI / 2, width: 14, aggro: 8, noRout: true },
      dress([{ type: 'samurai', n: 1, o: { name: '佐久間信盛', invuln: true, horse: true, hat: 'kabuto_m', haori: 0x4a3a2a } }, { type: 'ashigaru', n: 14 }, { type: 'bow', n: 4 }], ODA));
    F.oda = [F.ake, F.ram, F.saku];
    for (const g of F.oda) { g.defMult = 1.2; g.dmgMult = 0.8; }
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: SAKA.x - 14, z: SAKA.z + 6 }, -Math.PI / 2, [{ kind: 'spear', n }]);
    // ---- 延暦寺の僧兵：山門の前と、門の内 ----
    F.front = enemyGroup(rt, { faction: 'saito', name: '山門の僧兵', anchor: { x: GATE.x + 12, z: 0 }, facing: Math.PI / 2, aggro: 10, width: 12, morale: 90, fleeDir: { x: -1, z: 0 }, dmgMult: 0.62, formation: 'yari' },
      dress([{ type: 'samurai', n: 2, o: { hat: 'hachimaki', weapon: 'spear' } }, { type: 'ashigaru', n: 16 }, { type: 'bow', n: 4 }], SOHEI));
    // ---- 延暦寺の幟：山門の内と、根本中堂の前 ----
    for (const [x, z] of [[GATE.x - 4, -7], [GATE.x - 4, 7], [CHUDO.x + 8, -12], [CHUDO.x + 8, 12], [-100, -12], [-100, 16]]) rt.scene.add(rinboNobori(W, x, z, 6));
    // ---- 山道：石段・杉並木・石灯籠（寺の山らしく） ----
    rt.scene.add(sando(W));
    // ---- 陣と旗：坂本の織田の陣 ----
    rt.scene.add(jinmaku(W, SAKA.x + 10, SAKA.z - 20, 16, 10, 5));
    for (const [x, z, k] of [[SAKA.x + 4, SAKA.z - 14, 'oda'], [SAKA.x + 16, SAKA.z - 14, 'eiraku'], [SAKA.x - 26, SAKA.z + 8, 'oda'], [SAKA.x - 26, SAKA.z - 8, 'oda']]) rt.scene.add(nobori(W, x, z, k, 6));
    // ---- 大軍（軽い作り）：比叡を囲む織田勢三万 ----
    const DA = (x, z, w, d, count, facing, flag, seed) => W.addDistantArmy({ x, z, w, d, count, facing, armor: 0x2b3140, flagTex: flagTexture(flag), seed });
    // 明智の手の本隊（見た目だけ）：自分の組の後ろに続く
    W.addDistantArmy({ x: SAKA.x - 6, z: SAKA.z + 2, w: 16, d: 8, count: 120, facing: -Math.PI / 2, armor: 0x2e2a30, flagTex: flagTexture('oda'), seed: 1719 });
    [[104, -50, 'oda'], [100, 60, 'eiraku'], [70, -90, 'oda'], [74, 100, 'oda'], [140, -20, 'oda'], [136, 40, 'eiraku']].forEach(([x, z, f], i) => DA(x, z, 26, 14, 220, -Math.PI / 2, f, 1710 + i));

    rt.world.setTime('day');
    rt.setPhase('brief');
    rt.obj('main', '明智光秀の手について、比叡の山道を山門まで登れ', 'main');
    rt.obj('civ', '刃向かわぬ者（僧・里の者）は討つな', 'side');
    if (rt.G.lord) {
      // 信長で遊ぶ時：光秀の言上を聞いて、山を攻めさせる
      rt.say('明智光秀', '殿、坂本の備え、整いましてございます。山門の前に僧兵が固めておりまする', 4.5);
      rt.say('織田信長', '浅井・朝倉をかくもうた山じゃ。刃向かう者は退けよ。……逃げる者は追うな', 4.5);
    } else {
      rt.say('明智光秀', `${nm(rt)}、比叡の山は浅井・朝倉をかくまい、殿（信長公）に従わなかった。今日、この山を攻める`, 5);
      rt.say('明智光秀', '刃向かう僧兵とは戦え。じゃが、逃げる者、手向かわぬ者は追うな。……よいな', 4.5);
      rt.say('明智光秀', 'わしの手は後ろに千。その方の組は、その先手じゃ', 3.5);
    }
    rt.after(18, () => this.climb(rt));
  },

  // ① 山道を登る
  climb(rt) {
    const F = rt.flags;
    if (F.step >= 1) return;
    F.step = 1; F.stepT = rt.t;
    rt.setPhase('climb');
    sfx('taiko', 1);
    rt.say('明智光秀', '登れ！　山門の前の僧兵を追い払い、門を破る組を通せ', 3.5);
    const go = (g, x, z) => { g.order = 'move'; g.dest = { x, z }; g.speed = 2.3; g.onArrive = (gg) => { gg.order = 'hold'; gg.anchor = { x, z }; gg.aggro = 10; }; };
    go(F.ake, GATE.x + 34, 2); go(F.saku, GATE.x + 36, -18); go(F.ram, GATE.x + 44, 12);
    rt.marker('front', centerOf(F.front), () => `山門の僧兵・${moraleWord(F.front.morale)}`, { red: true, group: F.front });
    rt.after(14, () => { rt.army.play('eshout', { x: GATE.x + 12, z: 0 }, 1.6); rt.say('僧兵', '仏敵じゃ！　この御山に一歩も入れるな！', 3); });
    rt.after(26, () => this.assault(rt));
  },

  // ② 山門を破る
  assault(rt) {
    const F = rt.flags;
    if (F.step >= 2) return;
    F.step = 2; F.stepT = rt.t;
    rt.setPhase('gate');
    rt.banner('山門へかかれ', '門を破る組が丸太を担いで進む');
    // 山の上から寺の鐘が乱れ打ちされる（急を告げる早鐘）
    // 陣鉦（kane）ではなく、山の上の青銅の梵鐘の乱れ打ち（bellRapid）を二度。遠いので小さめに
    for (let k = 0; k < 2; k++) rt.after(1 + k * 4.2, () => { if (!F.ending) sfx('bellRapid', 0.6 - k * 0.1); });
    rt.obj('main', '門を破る組を守り、山門を破れ', 'main');
    const R = F.ram;
    R.order = 'assault'; R.formation = 'line'; R.aggro = 2; R.assault = () => (F.gate.alive ? F.gate : null);
    for (const g of [F.ake, F.saku]) { g.order = 'attack'; g.seekRange = 40; }
    rt.marker('gate', { x: GATE.x, z: GATE.z }, () => `山門 ${Math.round(Math.max(0, F.gate.hp) / F.gate.maxHp * 100)}%`, { h: 4 });
    // 別の手：南の築地塀に梯子を掛けて越え、内から閂を外す（門が破れるのを待たずに自分で道を選べる）
    rt.after(12, () => {
      if (F.step !== 2 || !F.gate.alive) return;
      const L = { x: GATE.x + 2.6, z: -15 };
      rt.say('明智光秀', `${nm(rt)}、南の塀は低い。梯子を掛けて越え、内から門を開ける手もある`, 4.5);
      rt.obj('ladder', '南の築地塀に梯子を掛けて越え、内から閂を外せ（別の手）', 'side');
      rt.marker('ladder', L, '梯子を掛ける所', { h: 3 });
      rt.addInteract('ladder', L, '梯子を掛けて塀を越える', () => this.overWall(rt, L), { r: 3, hold: 1.4 });
    });
    // 門の脇から僧兵の新手が打って出る
    rt.after(24, () => {
      if (F.step !== 2) return;
      const g = enemyGroup(rt, { faction: 'saito', name: '打って出た僧兵', anchor: { x: GATE.x + 6, z: 30 }, facing: Math.PI / 2, order: 'attack', seekRange: 60, aggro: 12, width: 8, morale: 85, fleeDir: { x: -1, z: 0 }, dmgMult: 0.6 },
        dress([{ type: 'samurai', n: 1, o: { hat: 'hachimaki', weapon: 'spear' } }, { type: 'ashigaru', n: 10 }], SOHEI));
      g.focus = R.units.find((u) => u.alive) || null;
      F.sally = g;
      rt.say('足軽', '塀の脇から僧兵が！　門を破る組を狙っておる！', 3);
      rt.marker('sally', centerOf(g), () => `打って出た僧兵・${moraleWord(g.morale)}`, { red: true, group: g });
    });
  },

  // 梯子で塀を越える：自分と近くの組の者が塀の内へ。内から閂を外せば山門が開く
  overWall(rt, L) {
    const F = rt.flags, W = rt.world;
    if (F.step !== 2 || F.over) return;
    F.over = true;
    rt.uninteract('ladder'); rt.unmark('ladder');
    const top = { x: GATE.x - 0.2, y: W.heightAt(GATE.x, L.z) + 2.7, z: L.z };
    rt.scene.add(hashigo({ x: L.x, y: W.heightAt(L.x, L.z), z: L.z }, top));
    rt.army.play('wood', L, 1);
    const pu = rt.player.u, to = { x: GATE.x - 3, z: L.z + 1 };
    for (const u of rt.squad) if (u.alive && Math.hypot(u.pos.x - pu.pos.x, u.pos.z - pu.pos.z) < 16) { u.pos.x = to.x - 1 - Math.random() * 2; u.pos.z = to.z + (Math.random() - 0.5) * 3; }
    pu.pos.x = to.x; pu.pos.z = to.z;
    sfx('wood', 0.8);
    rt.banner('塀を越えた', '内から山門の閂を外せ');
    const bar = { x: GATE.x - 1.6, z: 0 };
    rt.marker('bar', bar, '山門の閂', { h: 3 });
    rt.addInteract('bar', bar, '閂を外して山門を開ける', () => {
      if (!F.gate.alive) return;
      F.barOpen = true;
      rt.army.damage(F.gate, F.gate.hp + 10, pu);
    }, { r: 2.8, hold: 2.4 });
    rt.say('足軽', '内に入られたぞ！　門を守れ！', 2.5);
  },

  // ③ 門の内：豪盛の薙刀の衆
  inside(rt) {
    const F = rt.flags;
    if (F.step >= 3) return;
    F.step = 3; F.stepT = rt.t;
    rt.setPhase('inside');
    rt.unmark('gate'); rt.unmark('front'); rt.unmark('sally');
    rt.award((t) => t.side.push('山門を破った'), '山門を破った');
    sfx('taiko', 1); rt.after(0.5, () => sfx('horagai', 0.9));
    rt.banner('山門、破れる', '門の内から、僧兵の大将が打って出る');
    const g = enemyGroup(rt, { faction: 'saito', name: '正覚院豪盛の衆', anchor: { x: CHUDO.x + 14, z: 0 }, facing: Math.PI / 2, order: 'attack', seekRange: 80, aggro: 12, width: 12, morale: 100, noRout: true, fleeDir: { x: -1, z: -0.2 }, dmgMult: 0.62, defMult: 1.2 },
      dress([{ type: 'busho', n: 1, o: { name: '正覚院豪盛', invuln: true, hat: 'hachimaki', weapon: 'spear', haori: 0xd8d2c2, flag: null } }, { type: 'samurai', n: 4, o: { hat: 'hachimaki', weapon: 'spear' } }, { type: 'ashigaru', n: 18 }, { type: 'bow', n: 3 }], SOHEI));
    g.units[0].dmg *= 0.5;
    F.gosei = g; F.goseiU = g.units[0];
    rt.say('正覚院豪盛', '叡山は王城鎮護の御山なるぞ！　打ち物を取れ、一人も通すな！', 4);
    rt.say('明智光秀', '門の内へ押し入れ！　手向かう者だけを相手にせよ', 3.5);
    rt.obj('main', '門の内で、豪盛の衆（僧兵）を押し退けよ', 'main');
    rt.marker('gosei', centerOf(g), () => `豪盛の衆・${moraleWord(g.morale)}`, { red: true, group: g });
    for (const q of F.oda) { q.order = 'attack'; q.seekRange = 70; q.formation = 'line'; }
    F.ram.assault = null;
    // 逃げる僧や里の者（戦わない。誰にも狙われない。自分で討てば下知違反）
    F.civ = [];
    const civ = (x, z, n2, name) => {
      const c = enemyGroup(rt, { faction: 'imagawa', name, anchor: { x, z }, facing: -Math.PI / 2, width: 4, aggro: 0, morale: 0, fleeDir: { x: -1, z: z > 0 ? 0.3 : -0.3 }, speed: 2.6 },
        // 今川の色が混じらないよう、姿は全部ここで決める（僧は墨染の衣、里の者は野良着）
        [{ type: 'porter', n: n2, o: name.includes('僧') ? { flag: null, hat: 'none', armor: 0x1e1c1a, lace: 0x2a2826, cloth: 0x24221f, haori: null, mon: null } : { flag: null, hat: 'none', armor: 0x4a4034, lace: 0x5a4e3c, cloth: 0x6a5a44, haori: null, mon: null } }]);
      c.routed = true; c.order = 'flee';
      for (const u of c.units) { u.fleeing = true; u.noTarget = true; u.dmg = 0; }
      c.civ = true;
      F.civ.push(c);
    };
    civ(-30, 16, 5, '逃げる僧'); civ(-40, -18, 4, '逃げる里の者');
    rt.after(20, () => { if (!F.ending) civ(-56, 8, 5, '逃げる僧'); });
    rt.after(10, () => rt.bark('手向かわずに逃げる僧や里の者は追うな。討てば下知に背くぞ'));
    // 豪盛は討たれない（山を逃れ、のちに甲斐の武田信玄を頼った）。衆が減れば退く
    F.goseiU.announced = true;
    rt.after(70, () => { g.noRout = false; });
    // 根本中堂の方から、次の僧兵が加わる
    rt.after(18, () => {
      if (F.ending) return;
      const g2 = enemyGroup(rt, { faction: 'saito', name: '中堂の僧兵', anchor: { x: CHUDO.x - 6, z: 14 }, facing: Math.PI / 2, order: 'attack', seekRange: 80, aggro: 12, width: 10, morale: 90, fleeDir: { x: -1, z: 0.3 }, dmgMult: 0.55 },
        dress([{ type: 'samurai', n: 2, o: { hat: 'hachimaki', weapon: 'spear' } }, { type: 'ashigaru', n: 14 }, { type: 'bow', n: 3 }], SOHEI));
      F.gosei2 = g2;
      rt.army.play('eshout', { x: CHUDO.x, z: 10 }, 1.4);
      rt.say('足軽', '中堂の方から、また僧兵が出てくる！', 3);
      rt.marker('gosei2', centerOf(g2), () => `中堂の僧兵・${moraleWord(g2.morale)}`, { red: true, group: g2 });
    });
  },

  // ④ 山の上の堂塔が燃える
  burn(rt) {
    const F = rt.flags;
    if (F.burning) return;
    F.burning = true;
    const W = rt.world;
    F.fires = [];
    for (const [x, z] of FAR) {
      const y = W.heightAt(x, z);
      F.fires.push(W.addFire(x, z, { h: 2.2 }));
      W.addSmokeColumn(x, y + 4, z, { size: 3.4 });
    }
    // 時刻は変えない（朝のまま）。煙で日が陰り、空が茶色く濁っていく
    rt.after(12, () => { if (!rt.flags.ending) applyLook(rt, SMOKY); });
    rt.banner('山の上の堂塔から煙', '西塔・横川の方にも火が放たれた');
    rt.say('足軽', '……山の上の堂が燃えておる', 3);
    rt.say('明智光秀', '……目をそらすな。だが、我らは刃向かう者とだけ戦う。それを忘れるな', 4.5);
  },

  // 門の内の堂にも火が入る（ほかの組の火付け。自分は加わらない）
  burnHalls(rt) {
    const F = rt.flags, W = rt.world;
    if (F.hallsBurn) return;
    F.hallsBurn = true;
    // 戦っている所から遠い堂から順に
    const p = rt.player.u.pos;
    const hs = [...F.halls].sort((a, b) => Math.hypot(b.x - p.x, b.z - p.z) - Math.hypot(a.x - p.x, a.z - p.z));
    hs.forEach((h, i) => rt.after(i * 7, () => {
      const y = h.m.userData.roofY || 5;
      for (const s2 of [-1, 1]) W.addFire(h.x + s2 * h.d * 0.25, h.z + s2 * h.w * 0.2, { h: y, size: 3.2 });
      if (i === 0) {
        rt.army.play('cry', { x: h.x, z: h.z }, 1.2);
        rt.say('足軽', '門の内の堂にも火が……！', 3);
      }
    }));
    // 根本中堂の方の遠景の人々は、山の奥へ逃れていく
    if (F.crowd && F.crowd.rout) F.crowd.rout({ hideAfter: 30 });
  },

  win(rt, how) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.unmark('gosei'); rt.unmark('gosei2');
    rt.objDone('main');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '山門を破り、僧兵を退けた', pts: 20 }; }, '任務達成・僧兵を退けた');
    if (!F.civHurt) { rt.objDone('civ'); rt.award((t) => t.side.push('非戦の者を討たなかった'), '副任務：非戦の者を討たなかった'); }
    for (const q of [F.gosei, F.gosei2]) if (q && !gone(q)) { q.noRout = false; q.morale = 0; }
    sfx('horagai', 0.7);
    rt.banner('比叡の山、落ちる', how);
    rt.say('明智光秀', rt.G.lord ? '殿、山は落ちました。……この煙は、京からも見えましょう' : `${nm(rt)}、ようやった。……この山の煙は、京からも見えよう。忘れぬことじゃ`, 5);
    rt.player.u.invuln = true;
    rt.finish({}, 10);
  },

  update(rt, dt) {
    const F = rt.flags;
    if (F.ending) return;
    if (F.step === 1) {
      const d = Math.hypot(rt.player.u.pos.x - GATE.x, rt.player.u.pos.z - GATE.z);
      rt.objProgress('main', `山門まで ${Math.max(0, Math.round(d))}m`);
    }
    if (F.step === 2) {
      rt.objProgress('main', `山門 ${Math.round(Math.max(0, F.gate.hp) / F.gate.maxHp * 100)}%・組 ${F.ram.count}人`);
      // 門を破る組が減ったら、控えの者が加わる
      if (F.ram.count < 4 && !F.ram2) {
        F.ram2 = true;
        const g = allyGroup(rt, { faction: 'oda', name: '門を破る組', anchor: { x: GATE.x + 40, z: 10 }, facing: -Math.PI / 2, width: 5, aggro: 2, noRout: true, order: 'assault' },
          dress([{ type: 'ashigaru', n: 10, o: { hat: 'jingasa_n' } }], ODA));
        g.assault = F.ram.assault;
        rt.say('明智光秀', '次の者、行けっ！', 2);
      }
      if (rt.t - F.stepT > 140 && F.gate.alive) rt.army.damage(F.gate, 99999, null);
      // 門が破れるまで、明智・佐久間の手は門を破る組の後ろで構えて待つ（塀の向こうの敵へは届かないので「かかれ」のまま立ち尽くさない）。
      // 打って出た僧兵が寄れば、またかかる
      F.calmT = (F.calmT || 0) - dt;
      if (F.calmT <= 0) {
        F.calmT = 1;
        for (const g of [F.ake, F.saku]) {
          if (!g || !g.count || g.routed || (g.order !== 'attack' && !g.calm)) continue;
          const c = g.center();
          const foe = rt.army.nearestEnemy({ pos: c, team: g.team }, (g.seekRange || 40) + 6, (o) => !rt.army.wallBetween(c, g.team, o.pos));
          if (g.order === 'attack' && !foe) { g.calm = true; g.order = 'hold'; }
          else if (g.calm && foe && g.order === 'hold') { g.calm = false; g.order = 'attack'; }
        }
      }
    }
    // 門が破れたら、構えて待っていた手も「かかれ」に戻す
    if (F.step !== 2) for (const g of [F.ake, F.saku]) if (g && g.calm && g.order === 'hold') { g.calm = false; g.order = 'attack'; }
    if (F.step === 3) {
      const g = F.gosei;
      rt.objProgress('main', `僧兵 ${g.count + (F.gosei2 ? F.gosei2.count : 0)}人`);
      if (rt.t - F.stepT > 25) this.burn(rt);
      if (rt.t - F.stepT > 30) this.burnHalls(rt);
      if (g.count < 6 && g.noRout) { g.noRout = false; g.morale = Math.min(g.morale, 20); }
      if (gone(g) && F.gosei2 && gone(F.gosei2)) this.win(rt, '正覚院豪盛は山の奥へ退いた');
      else if (rt.t - F.stepT > 150) { for (const q of [g, F.gosei2]) if (q) { q.noRout = false; q.morale = 0; } }
    }
  },

  onKill(rt, v, k) {
    const F = rt.flags;
    if (v.group && v.group.civ) {
      if (k && k.isPlayer && !F.civHurt) {
        F.civHurt = true;
        rt.objFail('civ');
        rt.violation('逃げる非戦の者を討った', rt.G.lord ? ['明智光秀', '殿……！　逃げる者でございます'] : ['明智光秀', '追うなと申したはずじゃ！　刃向かわぬ者を討って、何の手柄か！']);
      }
      return;
    }
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
    if (v.type === 'busho' && v.team === 1 && v.group) { v.group.noRout = false; v.group.morale -= 40; }
  },
  onRout(rt, g) {
    if (g.team !== 1 || g.civ) return;
    rt.say('足軽', `${g.name}が山の奥へ退いていく！`, 2.5);
  },
  onStructHit(rt, s) {
    const F = rt.flags;
    if (s !== F.gate) return;
    const pct = Math.round(Math.max(0, s.hp) / s.maxHp * 100);
    const next = [75, 50, 25].find((q) => pct <= q && !(F.saidPct || []).includes(q));
    if (next) { F.saidPct = [...(F.saidPct || []), next]; rt.bark(`山門がきしむ（残り ${pct}%）`); }
  },
  onStructDestroyed(rt, s) {
    const F = rt.flags;
    if (s !== F.gate) return;
    for (const lv of s.mesh.userData.leaves) { lv.rotation.z = 1.4; lv.position.y = 0.1; }
    rt.uninteract('ladder'); rt.unmark('ladder'); rt.uninteract('bar'); rt.unmark('bar');
    if (F.barOpen) {
      rt.objDone('ladder');
      rt.award((t) => { t.special = { label: '内から山門を開けた', pts: 20 }; }, '塀を越え、内から山門を開けた');
      rt.say('明智光秀', 'でかした！　門が内から開いたぞ、押し入れ！', 3);
    } else rt.objRemove('ladder');
    sfx('wood', 1.2);
    this.inside(rt);
  },
};

// 両軍の総勢（織田 三万、延暦寺の僧兵と籠もった者 四千ほど。数には諸説ある）
hieizan.force = (rt) => {
  const F = rt.flags;
  return { a: Math.round(30000 - (F.ak || 0) * 30), a0: 30000, b: Math.max(0, 4000 - (F.ek || 0) * 40), b0: 4000 };
};
hieizan.sides = { a: { name: '織田軍', mon: 'oda' }, b: { name: '延暦寺の僧兵', mon: 'hikyaku' } };
hieizan.date = (rt) => `元亀二年九月十二日　秋・晴・${rt.world.timeKey === 'after' ? '昼下がり' : '朝'}`;
hieizan.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '登りの下知まで待つ' : '');
hieizan.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
hieizan.history = '元亀二年九月十二日、織田信長は比叡山延暦寺を攻めた。延暦寺は前年の志賀の陣で浅井・朝倉の兵を山にかくまい、信長の求めに応じなかった。織田勢は坂本から山へ攻め上り、根本中堂をはじめ多くの堂塔を焼いたと伝わる。僧兵だけでなく、僧や山に逃れた人々も多く殺されたとされるが、その数は数百とも数千とも言われ、諸説ある。近年の発掘では、焼けた跡が思ったより少ない所もあり、焼き討ちの規模にも諸説がある。正覚院豪盛は山を逃れ、のちに甲斐の武田信玄を頼ったという。焼き討ちの後、明智光秀は志賀郡を与えられ、坂本城を築いた。この戦では、刃向かう僧兵とだけ戦い、逃げる者は討たない形にしている。';
// 信長で遊ぶ時：居場所の目安（bot の目が始まりの位置を確かめる） と立つ所
hieizan.lordAt = { x: 104, z: -2, r: 12, why: '坂本の織田の陣（信長は坂本から山を囲ませた）' };
hieizan.lordSpawn = { x: 102, z: 0, heading: -Math.PI / 2 };

// 素直な遊び手：光秀の手のそばで僧兵を突き、門の前では門を破る組を守り、門の内では豪盛の衆へ。逃げる者には手を出さない
hieizan.botBrain = (b, inp, { goTo }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW');
  if (!u.alive || F.ending) return;
  if (u.hp < u.maxHp * 0.55) b.botRest = true;
  if (b.botRest && u.hp > u.maxHp * 0.85) b.botRest = false;
  if (b.botRest) { inp.guardHold = false; goTo(p, inp, GATE.x + 40, 4, 2); return; }
  const inside = F.step >= 3;
  const e = b.army.nearestEnemy(u, inside ? 16 : 12, (o) => !o.fleeing && !o.invuln && !(o.group && o.group.civ) && (inside || o.pos.x > GATE.x + 0.5));
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d > 2.6) inp.k.add('KeyW');
    if (d < 3.2 && Math.random() < 0.5) inp.leftPressed = true;
    inp.guardHold = (b.army.threats || []).length > 0 && Math.random() < 0.85;
    return;
  }
  inp.guardHold = false;
  if (F.step === 3) { const t = [F.gosei, F.gosei2].find((q) => q && !gone(q)); if (t) { const c = t.center(); goTo(p, inp, c.x, c.z, 2); return; } }
  if (F.step === 2) { goTo(p, inp, GATE.x + 8, 6, 2); return; }
  if (F.step === 1) { goTo(p, inp, GATE.x + 20, 2, 3); return; }
  const a = F.akeU.pos; goTo(p, inp, a.x + 4, a.z + 3, 3);
};

export { hieizan };
