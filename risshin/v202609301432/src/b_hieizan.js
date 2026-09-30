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
import { nobori, jinmaku, hut, romon, dou, stumps, hashigo, tsuiji, tobiraLeaf } from './props.js';
import { flagTexture } from './textures.js';
import { RANKS } from './state.js';
import { applyLook } from './b_inabayama.js';
// 堂塔が燃える煙で日が陰り、空が茶色く濁った朝
const SMOKY = { sky: 0x8a7a66, fog: 0x7a6a58, sun: 0xd89a64, sunI: 0.95, hs: 0xa89480, hg: 0x3a3026, hI: 1.0, top: 0x5a5048, glow: 0.3, dir: [0.8, 0.35, 0.3], mount: 0x3a342c };
import { sfx } from './audio.js';
import { moraleWord } from './hud.js';
import { gauss, enemyGroup, allyGroup, nm, centerOf, unitPos, wallLine } from './bhelp.js';
import { volleyScene } from './b_shiga.js';
import { camp } from './b_mid.js';
import { depthStart, depthTick, depthBot, rest, pick, fight, hold, move } from './b_depth.js';
import { backTick } from './b_nagashinojo.js';

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
  for (const sd of [-1, 1]) {
    const pv = new THREE.Group();
    pv.position.set(0, 0, sd * w / 4);
    const m = tobiraLeaf(w / 2 - 0.06, 3.1, -sd); m.rotation.y = Math.PI / 2;   // 外の面を東（+x）へ
    pv.add(m);
    grp.add(pv);
    grp.userData.leaves.push(pv);
  }
  grp.position.set(x, W.heightAt(x, z), z);
  return grp;
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
    const g = new THREE.BoxGeometry(0.98, 0.6, 5.2); g.translate(x, y - 0.14, z0);   // 段の下は土へ埋め、隙間の草を見せない
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
    clear: (x, z) => (x > GATE.x - 70 && x < 110 && Math.abs(z) < 34) || Math.hypot(x - 100, z + 20) < 16,
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
    wallLine(rt, [[GATE.x, GATE.z - 3], [GATE.x + 1, -24], [GATE.x - 4, -40]], { team: 1, hp: 1e9, name: '築地塀', segLen: 6, mesh: tsuiji });
    wallLine(rt, [[GATE.x, GATE.z + 3], [GATE.x + 1, 24], [GATE.x - 4, 40]], { team: 1, hp: 1e9, name: '築地塀', segLen: 6, mesh: tsuiji });
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
    F.teppo = allyGroup(rt, { faction: 'oda', name: '明智の鉄砲組', anchor: { x: SAKA.x - 22, z: SAKA.z + 8 }, facing: -Math.PI / 2, width: 10, aggro: 4, noRout: true, formation: 'line' },
      dress([{ type: 'gun', n: 6 }], ODA));
    F.oda = [F.ake, F.ram, F.saku, F.teppo];
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
    // 坂本の織田の本陣：信長と旗本（信長で遊ぶ時は旗本だけ）。まわりは囲む大軍（軽い兵）なので控えは置かない
    F.camp = camp(rt, { x: SAKA.x + 4, z: SAKA.z - 26, facing: -Math.PI / 2, team: 0, faction: 'oda', mon: 'oda', general: { name: '織田信長', hat: 'kabuto_m', haori: 0x8a1a14 }, guard: 15, reserve: 0, runTo: { x: SAKA.x - 24, z: SAKA.z } });
    for (const [x, z, k] of [[SAKA.x - 6, SAKA.z - 36, 'oda'], [SAKA.x + 14, SAKA.z - 36, 'eiraku'], [SAKA.x - 26, SAKA.z + 8, 'oda'], [SAKA.x - 26, SAKA.z - 8, 'oda']]) rt.scene.add(nobori(W, x, z, k, 6));
    // ---- 大軍（軽い作り）：比叡を囲む織田勢三万 ----
    const DA = (x, z, w, d, count, facing, flag, seed) => W.addDistantArmy({ x, z, w, d, count, facing, armor: 0x2b3140, flagTex: flagTexture(flag), seed });
    // 明智の手の本隊（見た目だけ）：自分の組の後ろに続く
    W.addDistantArmy({ x: SAKA.x - 6, z: SAKA.z + 2, w: 16, d: 8, count: 120, facing: -Math.PI / 2, armor: 0x2e2a30, flagTex: flagTexture('oda'), seed: 1719 });
    [[104, -50, 'oda'], [100, 60, 'eiraku'], [70, -90, 'oda'], [74, 100, 'oda'], [140, -20, 'oda'], [136, 40, 'eiraku']].forEach(([x, z, f], i) => DA(x, z, 26, 14, 220, -Math.PI / 2, f, 1710 + i));

    rt.world.setTime('day');
    rt.setPhase('brief');
    rt.obj('main', rt.G.lord ? '旗本と明智の手に下知し、比叡の山道を山門まで攻め上がれ' : (rt.G.rank || 0) >= 3 ? '明智光秀の先手の一隊を率い、比叡の山道を山門まで登れ' : '明智光秀の手について、比叡の山道を山門まで登れ', 'main');
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
    rt.after(15, () => this.climb(rt));
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
    go(F.ake, GATE.x + 34, 2); go(F.saku, GATE.x + 36, -18); go(F.ram, GATE.x + 44, 12); go(F.teppo, GATE.x + 40, -6);
    // 一斉射：明智の鉄砲組は込めたまま登り、山門の僧兵が間合いに入ったら揃えて放つ
    volleyScene(rt, { guns: () => [F.teppo, F.ake], at: () => F.teppo.center(), r: 32, who: '明智光秀', shots: 3, until: 120, wait: '鉄砲、込めたまま登れ。門の前で揃えて放つ',
      banner: ['一斉射', '明智の鉄砲が、山門の前の僧兵を撃ちすくめる'] });
    rt.marker('front', centerOf(F.front), () => `山門の僧兵・${moraleWord(F.front.morale)}`, { red: true, group: F.front });
    rt.after(14, () => { rt.army.play('eshout', { x: GATE.x + 12, z: 0 }, 1.6); rt.say('僧兵', '仏敵じゃ！　この御山に一歩も入れるな！', 3); });
    // 判断①：山門の前の僧兵をどう崩すか
    rt.after(7, () => {
      if (F.step !== 1 || F.ending) return;
      rt.choose('山門の前を僧兵が固めている。どう崩す？', [
        { label: '鉄砲の一斉射を待ち、崩れた所へ寄る', note: '確かな手。門の前に着くのは少し遅れる' },
        { label: '佐久間の手と南の杉木立を回り、横から突く', note: '早く崩せる。木立の中で僧兵の弓に狙われる' },
      ], (i) => {
        F.flank = i === 1;
        if (i === 0) { rt.say('明智光秀', 'よし。鉄砲が放ったら、一息に寄れ', 3); return; }
        rt.say('佐久間信盛', '南の木立を回るぞ！　横腹を突け！', 3);
        const S = F.saku; S.order = 'move'; S.speed = 2.8; S.dest = { x: GATE.x + 20, z: -20 };
        S.onArrive = (gg) => { gg.order = 'attack'; gg.seekRange = 50; gg.focus = F.front.units.find((u) => u.alive) || null; };
        rt.obj('flank', '佐久間の手と南の杉木立を回り、山門の僧兵の横を突け', 'side');
        rt.marker('flank', { x: GATE.x + 20, z: -20 }, '南の杉木立', { h: 3 });
        const b = enemyGroup(rt, { faction: 'saito', name: '木立の僧兵の弓', anchor: { x: GATE.x + 14, z: -30 }, facing: Math.PI / 2, order: 'attack', seekRange: 40, aggro: 12, width: 6, morale: 70, fleeDir: { x: -1, z: 0 }, dmgMult: 0.5 },
          dress([{ type: 'samurai', n: 1, o: { hat: 'hachimaki', weapon: 'spear' } }, { type: 'bow', n: 5 }, { type: 'ashigaru', n: 6 }], SOHEI));
        F.woodBow = b;
        rt.after(3, () => rt.say('足軽', '木立の中から矢じゃ！', 2.5));
      }, 14);
    });
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
        dress([{ type: 'samurai', n: 2, o: { hat: 'hachimaki', weapon: 'spear' } }, { type: 'ashigaru', n: 16 }], SOHEI));
      g.focus = R.units.find((u) => u.alive) || null;
      F.sally = g;
      rt.say('足軽', '塀の脇から僧兵が！　門を破る組を狙っておる！', 3);
      rt.marker('sally', centerOf(g), () => `打って出た僧兵・${moraleWord(g.morale)}`, { red: true, group: g });
    });
    // 北の塀の脇からも、二度目の打って出
    rt.after(58, () => {
      if (F.step !== 2) return;
      const g = enemyGroup(rt, { faction: 'saito', name: '北から打って出た僧兵', anchor: { x: GATE.x + 6, z: -30 }, facing: Math.PI / 2, order: 'attack', seekRange: 60, aggro: 12, width: 10, morale: 85, fleeDir: { x: -1, z: 0 }, dmgMult: 0.6 },
        dress([{ type: 'samurai', n: 2, o: { hat: 'hachimaki', weapon: 'spear' } }, { type: 'ashigaru', n: 14 }, { type: 'bow', n: 3 }], SOHEI));
      g.focus = (F.ram.units.find((u) => u.alive)) || null;
      F.sally2 = g;
      rt.army.play('eshout', { x: GATE.x + 6, z: -30 }, 1.4);
      rt.say('明智光秀', '北からも来た！　門を破る組を囲ませるな！', 3);
      rt.marker('sally2', centerOf(g), () => `北の僧兵・${moraleWord(g.morale)}`, { red: true, group: g });
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
    rt.unmark('gate'); rt.unmark('front'); rt.unmark('sally'); rt.unmark('sally2');
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
    const civ = (x, z, n2, name) => this.civ(rt, x, z, n2, name);
    civ(-30, 16, 5, '逃げる僧'); civ(-40, -18, 4, '逃げる里の者');
    rt.after(20, () => { if (!F.ending) civ(-56, 8, 5, '逃げる僧'); });
    rt.after(10, () => rt.bark('手向かわずに逃げる僧や里の者は追うな。討てば下知に背くぞ'));
    this.insideRest(rt, g);
  },
  // 逃げる僧や里の者（戦わない。誰にも狙われない。自分で討てば下知違反）
  civ(rt, x, z, n2, name) {
    const F = rt.flags;
    {
      const c = enemyGroup(rt, { faction: 'imagawa', name, anchor: { x, z }, facing: -Math.PI / 2, width: 4, aggro: 0, morale: 0, fleeDir: { x: -1, z: z > 0 ? 0.3 : -0.3 }, speed: 2.6 },
        // 今川の色が混じらないよう、姿は全部ここで決める（僧は墨染の衣、里の者は野良着）
        [{ type: 'porter', n: n2, o: name.includes('僧') ? { flag: null, hat: 'none', armor: 0x1e1c1a, lace: 0x2a2826, cloth: 0x24221f, haori: null, mon: null } : { flag: null, hat: 'none', armor: 0x4a4034, lace: 0x5a4e3c, cloth: 0x6a5a44, haori: null, mon: null } }]);
      c.routed = true; c.order = 'flee';
      for (const u of c.units) { u.fleeing = true; u.noTarget = true; u.dmg = 0; }
      c.civ = true;
      F.civ.push(c);
    }
  },
  insideRest(rt, g) {
    const F = rt.flags;
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

  // 段を重ねる（b_depth.js）：中堂の前 → 尾根道の朝倉・浅井 → 追うか、人を救うか
  deep(rt) {
    const F = rt.flags;
    if (F.deep || F.ending) return;
    F.deep = true;
    rt.unmark('gosei'); rt.unmark('gosei2');
    for (const q of [F.gosei, F.gosei2]) if (q && !gone(q)) { q.noRout = false; q.morale = 0; }
    rt.award((t) => t.side.push('門の内で豪盛の衆を退けた'), '豪盛の衆を退けた');
    rt.banner('豪盛の衆、退く', '中堂の奥で、僧兵が集まり直している');
    rt.obj('main', '中堂を押さえ、寄せてくる僧兵と朝倉・浅井の兵を退けよ', 'main');
    const ctx = { faction: 'saito', flag: 'hikyaku', armor: 0xcfc7b4, dmg: 0.6, mass: 140, look: (l) => dress(l, SOHEI),
      friends: () => F.oda.filter((g) => g && g.count && !g.routed),
      aid: { name: '明智の後詰', faction: 'oda', list: [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 10 }] }, aidSaid: '明智の後詰が山門をくぐって加わった' };
    depthStart(rt, ctx, hzSteps(this), (rt2, m) => this.win(rt2, m.hChase ? '退く殿の手を崩し、山の戦は終わった' : '逃げ遅れた人々を堂から出し、山の戦は終わった'));
  },

  win(rt, how) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.unmark('gosei'); rt.unmark('gosei2'); rt.unmark('dp'); rt.unzone('dp');
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
    if (F.flank && !F.flankDone) {
      const p = rt.player.u.pos;
      if (Math.hypot(p.x - GATE.x - 20, p.z + 20) < 12) {
        F.flankDone = true; rt.unmark('flank'); rt.objDone('flank');
        if (F.front && !gone(F.front)) F.front.morale -= 35;
        rt.bark('横を突かれて、山門の僧兵が乱れた');
        rt.award((t) => t.side.push('杉木立を回り、僧兵の横を突いた'), '僧兵の横を突いた');
      } else if (F.step >= 3) { F.flankDone = true; rt.unmark('flank'); rt.objRemove('flank'); }
    }
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
      if (!F.deep) rt.objProgress('main', `僧兵 ${g.count + (F.gosei2 ? F.gosei2.count : 0)}人`);
      if (rt.t - F.stepT > 25) this.burn(rt);
      if (rt.t - F.stepT > 30) this.burnHalls(rt);
      if (F.deep) { depthTick(rt, dt); backTick(rt); return; }
      if (g.count < 6 && g.noRout) { g.noRout = false; g.morale = Math.min(g.morale, 20); }
      if (gone(g) && F.gosei2 && gone(F.gosei2)) this.deep(rt);
      else if (rt.t - F.stepT > 150) { for (const q of [g, F.gosei2]) if (q) { q.noRout = false; q.morale = 0; } }
      // 保険：崩れても散り残りが居座る時は、時が経てば次の段へ
      if (rt.t - F.stepT > 200 && !F.deep) this.deep(rt);
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
// 史実でこの戦にいた名のある武将（battle.js の placeFamous が、その家の隊に加える。敵は名乗り、討てば手柄）
hieizan.famous = [
  { name: '柴田勝家', team: 0, g: /門を破る/, loose: 1, line: '柴田勝家じゃ。山門を破れ。刃向かう者だけを討て！' },
];
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
  if (F.deep) { depthBot(b, inp, goTo); return; }
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
  if (F.step === 2) { goTo(p, inp, GATE.x + 8, 0, 2); return; }
  if (F.step === 1) { goTo(p, inp, GATE.x + 20, 2, 3); return; }
  const a = F.akeU.pos; goTo(p, inp, a.x + 4, a.z + 3, 3);
};

// ---- 門の内から先の段 ----
const SO = (s, a, bw) => [{ type: 'samurai', n: s, o: { hat: 'hachimaki', weapon: 'spear' } }, { type: 'ashigaru', n: a }, { type: 'bow', n: bw }];
// 山にかくまわれていた朝倉・浅井の兵（僧兵の姿を外す）
const armed = (flag, armor, lace, list) => ({ flag, armor, list: list.map((q) => ({ ...q, o: { sohei: 0, armor, lace, cloth: 0x3a3228, flag, hat: q.type === 'samurai' ? 'kabuto_m' : 'jingasa_n', ...(q.o || {}) } })) });
const asa = (list) => armed('asakura', 0x33291f, 0x7a5a2a, list);
const aza = (list) => armed('azai', 0x2e2a26, 0x3c5a48, list);
const A = (n) => ({ type: 'ashigaru', n }), S = (n) => ({ type: 'samurai', n }), G = (n) => ({ type: 'gun', n });
function hzSteps(def) {
  return [
    rest({ dur: 10, heal: 0.3, say: [['明智光秀', '豪盛の衆は退いた。……じゃが、まだ終わらぬ'], ['伝令', '根本中堂の奥に、僧兵が集まり直しておりまする！　逃げ込んだ人々も混じって'], ['明智光秀', '中堂を押さえれば、この山の戦は終わる。刃向かう者だけを見よ']] }),
    pick({ title: '中堂の前に、僧兵と逃げ込んだ人々が混じっている。どうする？',
      options: [{ label: '人々を先に山の奥へ逃がし、堂の前で僧兵を受ける', note: '非戦の者を守れる。そのあいだ、僧兵の寄せを受け続ける' }, { label: 'すぐに僧兵へかかり、中堂を押さえる', note: '早く片づく。人々が混じり、刃が迷う' }],
      on: (rt, m, i) => {
        m.hLet = i === 0;
        def.civ(rt, -60, -14, 5, '逃げる僧'); def.civ(rt, -64, 16, 5, '逃げる里の者');
        rt.say('明智光秀', i === 0 ? 'よう申した。道を空けよ、人々を奥へ通せ！' : 'よし、かかれ。……逃げる者には刃を向けるなよ', 3.5);
      } }),
    hold({ skip: (rt, m) => !m.hLet, at: { x: -34, z: 2 }, dur: 90, r: 14, title: '中堂の前', sub: '人々が逃れるまで、僧兵の寄せを受ける', label: '中堂の前', obj: '人々が山の奥へ逃れるまで、中堂の前で僧兵を受けよ',
      waves: [
        { t: 4, say: ['足軽', '中堂から僧兵が押し出してくる！'], foes: () => [{ name: '中堂の僧兵', from: { x: -84, z: -6 }, list: SO(3, 13, 3), noRout: 25 }] },
        { t: 34, say: ['足軽', '右の堂の陰からも来る！'], foes: () => [{ name: '堂の陰の僧兵', from: { x: -72, z: 30 }, list: SO(2, 11, 2) }] },
        { t: 60, say: ['明智光秀', '堂の縁に弓が並んだ。組を固めて寄れ！'], foes: () => [{ name: '堂の縁の弓衆', from: { x: -76, z: -28 }, list: SO(1, 5, 6) }] },
      ],
      reward: '中堂の前で人々を逃がした', lost: ['明智光秀', '押し込まれたか……じゃが、人々は奥へ逃れた'] }),
    fight({ skip: (rt, m) => m.hLet, at: { x: -46, z: 0 }, title: '中堂へかかれ', sub: '僧兵が中堂の石段を固めている', obj: '中堂の前の僧兵を崩し、中堂を押さえよ',
      foes: () => [{ name: '中堂を固める僧兵', from: { x: -82, z: -4 }, list: SO(3, 15, 3), noRout: 25 }],
      later: [{ t: 30, say: ['足軽', '堂の陰から、また出てくる！'], foes: () => [{ name: '堂の陰の僧兵', from: { x: -72, z: 28 }, list: SO(2, 12, 2) }] }],
      max: 140, reward: '中堂を押さえた' }),
    rest({ dur: 8, bark: '組を寄せ直し、息を整えよ', say: [['足軽', '西の尾根道に……甲冑の者じゃ！　僧兵ではないぞ'], ['明智光秀', '三つ盛木瓜……朝倉じゃ。山にかくまわれていた兵が下りてくる']] }),
    pick({ title: '尾根道から朝倉と浅井の兵が下りてくる。どう受ける？',
      options: [{ label: '杉木立に伏せ、下りきった所を横から突く', note: 'うまくいけば一息に崩せる。遅れれば挟まれる' }, { label: '堂の前に槍を揃えて、正面で受ける', note: '崩れにくい。重い甲冑の兵と、長く押し合う' }],
      on: (rt, m, i) => { m.hAmb = i === 0; rt.say('明智光秀', i === 0 ? '木立に伏せよ。旗を伏せ、声を立てるな……' : '槍を揃えよ！　一歩も退くな！', 3); } }),
    fight({ skip: (rt, m) => !m.hAmb, at: { x: -46, z: -36 }, title: '横槍', sub: '杉木立から、尾根道を下る朝倉勢の横腹へ', obj: '杉木立から躍り出て、尾根道の朝倉勢を崩せ',
      say: [['明智光秀', '今じゃ、かかれっ！']],
      foes: () => [{ name: '尾根道の朝倉勢', from: { x: -90, z: -40 }, ...asa([S(2), A(12), G(2)]), morale: 70, mass: 200 }],
      later: [{ t: 75, say: ['明智光秀', '尾根の上に鉄砲が並んだ！　木の陰を伝って寄れ'], foes: () => [{ name: '尾根の朝倉の鉄砲', from: { x: -86, z: -46 }, ...asa([S(1), G(5), A(6)]), mass: 100 }] }, { t: 40, title: '新手', sub: '浅井の兵も尾根を下りてくる', say: ['足軽', '北の尾根からも来る！　あれは浅井の旗じゃ！'], foes: () => [{ name: '浅井の兵', from: { x: -88, z: 30 }, ...aza([S(2), A(11)]), mass: 180 }] }],
      max: 150, reward: (t) => { t.special = { label: '伏せて朝倉勢の横腹を突いた', pts: 20 }; }, rewardLabel: '伏せて朝倉勢の横腹を突いた' }),
    hold({ skip: (rt, m) => m.hAmb, at: { x: -40, z: 0 }, dur: 100, r: 14, title: '朝倉・浅井の寄せ', sub: '尾根道から、甲冑の兵が押し寄せる', label: '堂の前', obj: '堂の前で槍を揃え、朝倉・浅井の兵を受けよ',
      waves: [
        { t: 4, say: ['足軽', '来たぞ、甲冑の兵じゃ！'], foes: () => [{ name: '尾根道の朝倉勢', from: { x: -88, z: -30 }, ...asa([S(3), A(13), G(2)]), mass: 260, noRout: 25 }] },
        { t: 38, say: ['足軽', '北の尾根から浅井の旗！'], foes: () => [{ name: '浅井の兵', from: { x: -86, z: 30 }, ...aza([S(2), A(11)]), mass: 200 }] },
        { t: 68, say: ['明智光秀', '最後の寄せじゃ。これを凌げば山は落ちる！'], foes: () => [{ name: '残った僧兵', from: { x: -84, z: 0 }, list: SO(2, 12, 2) }] },
      ],
      reward: '堂の前で朝倉・浅井の寄せを受け止めた', lost: ['明智光秀', '押し込まれた……じゃが、まだ崩れてはおらぬ！'] }),
    rest({ dur: 8, say: [['伝令', '豪盛と朝倉の残りが、西塔の方へ落ちていきまする！'], ['足軽', '……燃える堂の中から、声がする']] }),
    pick({ title: '西塔へ落ちる兵がいる。燃える堂には逃げ遅れた人がいる。どうする？',
      options: [{ label: '追わず、燃える堂から逃げ遅れた人々を出す', note: '下知に沿う。人を救えば、後の噂も違う' }, { label: '追い討ちをかけ、退く殿の手を崩す', note: '手柄になる。山の奥で殿の手とぶつかる' }],
      on: (rt, m, i) => { m.hChase = i === 1; rt.say('明智光秀', i === 0 ? 'それでよい。……堂へ行け、煙に巻かれるなよ' : '深追いはするな。殿の手を崩したら戻れ', 3.5); } }),
    move({ skip: (rt, m) => m.hChase, to: { x: -24, z: -22 }, r: 8, label: '燃える堂', obj: '燃える堂へ行き、逃げ遅れた人々を外へ出せ',
      say: [['足軽', '中に人が……！　手を貸せ！']],
      onEnd: (rt, m, arr) => { if (arr) { def.civ(rt, -28, -18, 4, '救い出した人々'); rt.award((t) => { t.special = { label: '燃える堂から人々を救い出した', pts: 15 }; }, '燃える堂から人々を救い出した'); rt.say('明智光秀', '……ようやった。この山で、それが一番の働きかもしれぬ', 4); } } }),
    fight({ skip: (rt, m) => !m.hChase, at: { x: -78, z: -6 }, title: '追い討ち', sub: '西塔へ落ちる殿の手', obj: '西塔へ落ちる殿の手を崩せ',
      foes: () => [{ name: '朝倉の殿', from: { x: -96, z: -10 }, ...asa([S(2), A(10)]), mass: 120 }, { name: '豪盛の殿の僧兵', from: { x: -96, z: 12 }, list: SO(2, 8, 2), mass: 80 }],
      max: 110, reward: '退く殿の手を崩した' }),
    rest({ dur: 7, heal: 0.25, say: [['足軽', '西塔の方から、鐘と鬨の声が……！'], ['明智光秀', '豪盛が西塔の衆を率いて、取って返してきたか。これが最後じゃ']] }),
    hold({ at: { x: -40, z: 0 }, dur: 80, r: 14, title: '豪盛の取って返し', sub: '西塔の僧兵と朝倉の残りが、一つになって押し寄せる', label: '中堂の前', obj: '中堂の前で、豪盛の最後の寄せを受けよ',
      say: [['明智光秀', '組を固めよ！　これを凌げば、山の戦は終わる']],
      waves: [
        { t: 4, say: ['正覚院豪盛', '仏敵を山から追い落とせ！'], foes: () => [{ name: '西塔の僧兵', from: { x: -86, z: 8 }, list: SO(3, 14, 3), mass: 200, noRout: 25 }] },
        { t: 36, say: ['足軽', '北の木立から、朝倉の兵も！'], foes: () => [{ name: '朝倉の残り', from: { x: -80, z: 34 }, ...asa([S(2), A(10), G(2)]), mass: 160 }] },
      ],
      reward: '豪盛の最後の寄せを退けた', lost: ['明智光秀', '押されたが……僧兵も尽きた'] }),
  ];
}

export { hieizan };
