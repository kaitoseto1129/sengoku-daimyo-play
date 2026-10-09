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
import { Garan, makeTempleFire } from './temple1571.js';
import { flagTexture } from './textures.js';
import { RANKS } from './state.js';
import { applyLook } from './b_inabayama.js';
// 堂塔が燃える煙で日が陰り、空が茶色く濁った昼
const SMOKY = { sky: 0x8a7a66, fog: 0x7a6a58, sun: 0xd89a64, sunI: 0.95, hs: 0xa89480, hg: 0x3a3026, hI: 1.0, top: 0x5a5048, glow: 0.3, dir: [0.8, 0.35, 0.3], mount: 0x3a342c };
import { sfx } from './audio.js';
import { addDeck } from './floors.js';
import { moraleWord } from './hud.js';
import { gauss, enemyGroup, allyGroup, nm, centerOf, unitPos, wallLine } from './bhelp.js';
import { volleyScene } from './b_shiga.js';
import { camp } from './b_mid.js';
import { depthStart, depthTick, depthBot, rest, pick, fight, hold, move } from './b_depth.js';

const GATE = { x: 8, z: 0 };               // 山門（東向き）
const SAKA = { x: 96, z: 6 };              // 坂本（湖のほとり）
const CHUDO = { x: -50, z: -4 };           // 根本中堂の前
const ROAD = [[150, 10], [SAKA.x, SAKA.z], [60, -4], [34, 6], [GATE.x + 2, 0], [-20, -2], [CHUDO.x, CHUDO.z], [-110, -20], [-178, -30]];
// 道案内と石段で、同じ本坂の中心線を使う。
function roadZ(x) {
  for (let i = 0; i < ROAD.length - 1; i++) {
    const [ax, az] = ROAD[i], [bx, bz] = ROAD[i + 1];
    if ((x - ax) * (x - bx) <= 0 && ax !== bx) return az + (bz - az) * (x - ax) / (bx - ax);
  }
  return 0;
}
const ROAD_WAY = { x: 0, z: 0 }; // 毎コマ作り直さない。
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
  const zc = roadZ;
  // 蹴上げは約二十センチ。三枚の石を横に並べ、継ぎ目と石の側面を見せる。
  const block = new THREE.BoxGeometry(0.9, 1.2, 1.7);
  for (let x = GATE.x + 2; x < GATE.x + 32; x += 0.9) {
    const z0 = zc(x), k = Math.round((x - GATE.x - 2) / 0.9);
    const rot = -Math.atan2(zc(x + 0.45) - zc(x - 0.45), 0.9);
    const y = W.heightAt(x - 0.45, zc(x - 0.45)) + 0.04 + (k % 3) * 0.012;
    // 見える踏面と同じ高さを足場へ登録。石灯籠や塀の当たりは変えない。
    addDeck({ x0: x - 0.45, x1: x + 0.45, z0: z0 - 2.6, z1: z0 + 2.6, cx: x, cz: z0, rot, y, name: '本坂の石段' });
    for (let j = -1; j <= 1; j++) {
      const g = paint(block.clone(), [0x9b9486, 0x928c80, 0xa39b8c][(k + j + 3) % 3]);
      const colors = g.attributes.color, normals = g.attributes.normal;
      for (let v = 0; v < colors.count; v++) {
        const shade = normals.getY(v) > 0.5 ? 1.08 : 0.82 + ((k + Math.floor(v / 3)) % 3) * 0.035;
        colors.setXYZ(v, colors.getX(v) * shade, colors.getY(v) * shade, colors.getZ(v) * shade);
      }
      g.translate(0, -0.6, j * 1.74); g.rotateY(rot); g.translate(x, y, z0); stone.push(g);
    }
    // 苔は端、落ち葉は継ぎ目へ。まとめて描くので描画回数を増やさない。
    for (const side of [-1, 1]) {
      const moss = new THREE.BoxGeometry(0.42, 0.015, 0.32);
      moss.translate(x, y + 0.01, z0 + side * 2.3); stone.push(paint(moss, k % 2 ? 0x626d43 : 0x738053));
      const leaf = new THREE.BoxGeometry(0.12, 0.012, 0.22);
      leaf.rotateY(k * 1.7); leaf.translate(x + 0.2, y + 0.012, z0 + side * 1.8); stone.push(paint(leaf, k % 2 ? 0x947044 : 0xac8550));
    }
  }
  block.dispose();
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
  const sm = new THREE.Mesh(mergeGeometries(stone), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, emissive: 0x665e4e, emissiveIntensity: 0.18 }));
  sm.receiveShadow = true; sm.castShadow = false;
  const tm = new THREE.Mesh(mergeGeometries(tree), new THREE.MeshLambertMaterial({ vertexColors: true }));
  tm.castShadow = true;
  g.add(sm, tm);
  return g;
}

const hieizan = {
  battleVoices: { enemy: 'tendai', lines: {
    enemy: { ambient: ['山王権現の御山ぞ！　守れ！'], push: ['山門の衆、押し返せ！'], waver: ['堂の陰へ退け！　備えを立て直せ！'] },
    ally: { rout: ['僧兵が退いたぞ！　深追いせんでええ！'], regroup: ['僧兵が寄り直すぞ！　槍を揃えよ！'] },
  } },
  noWake: true, // 山の遠景を新たな戦う兵に替えず、近い僧兵だけを扱う
  spawn: { x: SAKA.x - 18, z: SAKA.z + 4, heading: -Math.PI / 2 },
  world: {
    seed: 1571,
    wind: [0.8, 0.6],   // 比叡おろし：山から湖へ吹き下ろす
    time: 'day',
    autumn: true,     // 旧暦九月：枯れ色の草と色づく木
    muddy: 0.2,
    water: { x: 124, level: -2.4 },
    paths: [ROAD],
    pathWidth: 2.6,
    guideWay(u, want) {
      // 門へ直線で向けず、まず曲がった本坂へ戻す。
      const x = u.pos.x > 40 ? 40 : u.pos.x > 34 ? 34 : want.x;
      ROAD_WAY.x = Math.abs(u.pos.z - roadZ(u.pos.x)) > 3 ? u.pos.x : x;
      ROAD_WAY.z = ROAD_WAY.x === want.x ? want.z : roadZ(ROAD_WAY.x);
      return want.x >= GATE.x && u.pos.x > GATE.x + 2 ? ROAD_WAY : want;
    },
    blockedHint: () => '足が止まったら、味方の旗と本坂の印へ戻れ',
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
    fleeOut: (x, z, team) => team === 1 && (x < -105 || x > 110),
  },

  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    F.step = 0; F.ek = 0; F.ak = 0; F.civ = [];
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
    // 旧い比叡山の戦にも同じ出入りを使う。位置・焼き討ちの順は保つ。
    F.teranaka = new Garan(rt);
    F.halls = HALLS.map(([x, z, w, d], i) => {
      const rec = F.teranaka.build({ id: 'hiei_room_' + i, name: i === 0 ? '根本中堂' : '僧坊', kind: i === 0 ? 'chudo' : 'sobo', x, z, w, d, rot: Math.PI / 2, enterable: true });
      return { x, z, w, d, rec };
    });
    F.farHalls = FAR.map(([x, z], i) => F.teranaka.build({ id: 'hiei_far_' + i, name: '山の堂', kind: 'do', x, z, w: 12, d: 8, rot: Math.PI / 2 + 0.3 }));
    F.teranaka.finish();
    F.templeFire = makeTempleFire(rt, F.teranaka, { flames: 4, smokes: 6 });
    // 始めから焼き討ちの最中：麓の坂本の町と日吉の社が燃え、本坂の脇の小屋からも煙が上がる（「煙の上がる本坂」）
    for (const [x, z, s] of [[150, -40, 3.2], [168, 30, 3.6], [140, 64, 2.8]]) W.addFire(x, z, { size: s, h: 1.5 });
    for (const [x, z, s] of [[124, -70, 4], [182, -6, 4], [58, 44, 2.2], [30, -46, 2]]) W.addSmokeColumn(x, W.heightAt(x, z) + 2, z, { size: s });
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
    for (const side of [-1, 1]) rt.scene.add(nobori(W, 40, roadZ(40) + side * 3.4, 'oda', 5));
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
    applyLook(rt, SMOKY);
    F.templeFire.ignite(F.halls[2].rec, '僧坊への火');
    for (const r of F.farHalls) F.templeFire.ignite(r, '山の上の火');
    F.templeFire.tick(0.5);
    this.civ(rt, 42, 12, 4, '逃げる里の者', { x: 1, z: 0.4 });
    rt.setPhase('brief');
    rt.obj('main', rt.G.lord ? '旗本と明智の手を率い、山門へ寄せよ' : (rt.G.rank || 0) >= 3 ? '先手の一隊を率い、山門へ登れ' : '明智の手に続き、山門へ登れ', 'main');
    rt.obj('civ', '逃げる僧・里の者に刃を向けるな', 'side');
    if (rt.G.lord) {
      // 信長で遊ぶ時：光秀の言上を聞いて、山を攻めさせる
      rt.say('明智光秀', '殿、寄せ手の支度、整ってござる。山門に僧兵がおりまする', 4.5);
      rt.say('織田信長', '浅井・朝倉に与した山じゃ。堂も社も焼き払え！', 4.5);
    } else {
      rt.say('明智光秀', `${nm(rt)}、浅井・朝倉をかくもうた山じゃ。先手に立て`, 5);
      rt.say('明智光秀', '山門へ寄れ。僧兵を退け、道を開けよ', 4.5);
      rt.say('明智光秀', '……里の者まで逃げておる。刃を向けるな', 3.5);
    }
    rt.after(15, () => this.climb(rt));
  },

  // ① 山道を登る
  climb(rt) {
    const F = rt.flags;
    if (F.step >= 1 || F.ending) return;
    F.step = 1; F.stepT = rt.t;
    rt.setPhase('climb');
    rt.obj('main', '本坂を登り、山門の僧兵を退けよ', 'main');
    F.roadBest = Infinity; F.roadWait = 0; F.roadSayT = -99;
    F.roadStop = { x: 0, z: 0, t: 0, distance: 0, cause: '', allyLoss: 0, foeLoss: 0 };
    rt.marker('road', { x: GATE.x + 24, z: roadZ(GATE.x + 24) }, '本坂の先・山門', { h: 3, guidePriority: 200 });
    F.roadMark = rt.markers[rt.markers.length - 1];
    sfx('taiko', 1);
    rt.say('明智光秀', '登れ！　山門の前の僧兵を追い払い、門を破る組を通せ', 3.5);
    const go = (g, x, z) => { g.order = 'move'; g.dest = { x, z }; g.speed = 2.3; g.onArrive = (gg) => { gg.order = 'hold'; gg.anchor = { x, z }; gg.aggro = 10; }; };
    go(F.ake, GATE.x + 34, 2); go(F.saku, GATE.x + 36, -18); go(F.ram, GATE.x + 44, 12); go(F.teppo, GATE.x + 40, -6);
    // 一斉射：明智の鉄砲組は込めたまま登り、山門の僧兵が間合いに入ったら揃えて放つ
    volleyScene(rt, { guns: () => [F.teppo, F.ake], at: () => F.teppo.center(), r: 32, who: '明智光秀', shots: 3, until: 120, wait: '鉄砲、込めたまま登れ。門の前で揃えて放つ',
      banner: ['一斉射', '明智の鉄砲が、山門の前の僧兵を撃ちすくめる'] });
    rt.marker('front', centerOf(F.front), () => `山門の僧兵・${moraleWord(F.front.morale)}`, { red: true, group: F.front });
    rt.after(14, () => {
      if (F.step !== 1 || F.ending || gone(F.front)) return;
      const c = F.front.center();
      if (rt.distTo(c) > 30 || rt.army.wallBetween(rt.player.u.pos, rt.player.u.team, c)) return;
      rt.army.play('eshout', c, 1.6); rt.say('僧兵', '山門の衆、ここは通さぬ！', 3);
    });
    // 判断①：山門の前の僧兵をどう崩すか
    rt.after(7, () => {
      if (F.step !== 1 || F.ending) return;
      rt.choose('山門の前を僧兵が固めている。どう崩す？', [
        { label: '鉄砲の一斉射を待ち、崩れた所へ寄る', note: '確かな手。門の前に着くのは少し遅れる' },
        { label: '佐久間の手と南の杉木立を回り、横から突く', note: '早く崩せる。木立の中で僧兵の弓に狙われる' },
      ], (i) => {
        F.flank = i === 1;
        if (i === 0) { rt.say('明智光秀', 'よし。鉄砲の音を合図に、一息に寄せよ！', 3); return; }
        rt.say('佐久間信盛', '南の木立を回るぞ！　横腹を突け！', 3);
        const S = F.saku; S.order = 'move'; S.speed = 2.8; S.dest = { x: GATE.x + 20, z: -20 };
        S.onArrive = (gg) => { gg.order = 'attack'; gg.seekRange = 50; gg.focus = F.front.units.find((u) => u.alive) || null; };
        rt.obj('flank', '佐久間の手と南の木立を回り、横を突け', 'side');
        rt.marker('flank', { x: GATE.x + 20, z: -20 }, '南の杉木立', { h: 3 });
        const b = enemyGroup(rt, { faction: 'saito', name: '木立の僧兵の弓', anchor: { x: GATE.x + 14, z: -30 }, facing: Math.PI / 2, order: 'attack', seekRange: 40, aggro: 12, width: 6, morale: 70, fleeDir: { x: -1, z: 0 }, dmgMult: 0.5 },
          dress([{ type: 'samurai', n: 1, o: { hat: 'hachimaki', weapon: 'spear' } }, { type: 'bow', n: 5 }, { type: 'ashigaru', n: 6 }], SOHEI));
        F.woodBow = b;
        rt.after(3, () => rt.say('足軽', '木立から矢だがや！　伏せよ！', 2.5));
      }, 14);
    });
    // 山門へ寄った時に次の下知を出す。坂本に残る者へ門攻めの札を出さない。
  },

  // ② 山門を破る
  assault(rt) {
    const F = rt.flags;
    if (F.step >= 2 || F.ending) return;
    F.step = 2; F.stepT = rt.t;
    rt.setPhase('gate');
    rt.unmark('road');
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
      rt.say('明智光秀', `${nm(rt)}、南の塀は低いぞ。梯子で越えれば、内から閂を外せよう`, 4.5);
      rt.obj('ladder', '南の塀を梯子で越え、内から閂を外せ', 'side');
      rt.marker('ladder', L, '梯子を掛ける所', { h: 3 });
      rt.addInteract('ladder', L, '梯子を掛けて塀を越える', () => this.overWall(rt, L), { r: 3, hold: 1.4 });
    });
    // 門の脇から僧兵の新手が打って出る
    rt.after(24, () => {
      if (F.step !== 2) return;
      const g = enemyGroup(rt, { faction: 'saito', name: '打って出た僧兵', anchor: { x: GATE.x + 6, z: -30 }, facing: Math.PI / 2, order: 'attack', seekRange: 60, aggro: 12, width: 8, morale: 85, fleeDir: { x: -1, z: 0 }, dmgMult: 0.6 },
        dress([{ type: 'samurai', n: 2, o: { hat: 'hachimaki', weapon: 'spear' } }, { type: 'ashigaru', n: 16 }], SOHEI));
      g.focus = R.units.find((u) => u.alive) || null;
      F.sally = g;
      rt.say('足軽', '塀の脇だがや！　丸太の組が狙われとる！', 3);
      rt.marker('sally', centerOf(g), () => `打って出た僧兵・${moraleWord(g.morale)}`, { red: true, group: g });
    });
    // 北の塀の脇からも、二度目の打って出
    rt.after(58, () => {
      if (F.step !== 2) return;
      const g = enemyGroup(rt, { faction: 'saito', name: '北から打って出た僧兵', anchor: { x: GATE.x + 6, z: 30 }, facing: Math.PI / 2, order: 'attack', seekRange: 60, aggro: 12, width: 10, morale: 85, fleeDir: { x: -1, z: 0 }, dmgMult: 0.6 },
        dress([{ type: 'samurai', n: 2, o: { hat: 'hachimaki', weapon: 'spear' } }, { type: 'ashigaru', n: 14 }, { type: 'bow', n: 3 }], SOHEI));
      g.focus = (F.ram.units.find((u) => u.alive)) || null;
      F.sally2 = g;
      rt.army.play('eshout', { x: GATE.x + 6, z: 30 }, 1.4);
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
    pu.pos.y = W.heightAt(to.x, to.z);
    for (const u of rt.squad) if (u.alive) u.pos.y = W.heightAt(u.pos.x, u.pos.z);
    sfx('wood', 0.8);
    rt.banner('塀を越えた', '内から山門の閂を外せ');
    const bar = { x: GATE.x - 1.6, z: 0 };
    rt.marker('bar', bar, '山門の閂', { h: 3 });
    rt.addInteract('bar', bar, '閂を外して山門を開ける', () => {
      if (!F.gate.alive) return;
      F.barOpen = true;
      rt.army.damage(F.gate, F.gate.hp + 10, pu);
    }, { r: 2.8, hold: 2.4 });
    rt.say('僧兵', '内に入られたぞ！　門を守れ！', 2.5);
  },

  // ③ 門の内：豪盛の薙刀の衆
  inside(rt) {
    const F = rt.flags;
    if (F.step >= 3 || F.ending) return;
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
    rt.say('明智光秀', '門内へ続け！　薙刀の間合いに入るな！', 3.5);
    rt.obj('main', '門内の豪盛の衆を押し退けよ', 'main');
    rt.marker('gosei', centerOf(g), () => `豪盛の衆・${moraleWord(g.morale)}`, { red: true, group: g });
    for (const q of F.oda) { q.order = 'attack'; q.seekRange = 70; q.formation = 'line'; }
    F.ram.assault = null;
    if (F.ramReserve) { F.ramReserve.assault = null; F.ramReserve.order = 'attack'; }
    // 逃げる僧や里の者（戦わない。誰にも狙われない。自分で討てば下知違反）
    const civ = (x, z, n2, name) => this.civ(rt, x, z, n2, name);
    civ(-12, 8, 5, '逃げる僧'); civ(-24, -9, 4, '逃げる里の者');
    rt.after(20, () => { if (!F.ending) civ(-56, 8, 5, '逃げる僧'); });
    rt.after(10, () => rt.bark('逃げる僧・里の者を追うな'));
    this.insideRest(rt, g);
  },
  // 逃げる僧や里の者（戦わない。誰にも狙われない。自分で討てば下知違反）
  civ(rt, x, z, n2, name, fleeDir) {
    const F = rt.flags;
    {
      const c = enemyGroup(rt, { faction: 'imagawa', name, anchor: { x, z }, facing: -Math.PI / 2, width: 4, aggro: 0, morale: 0, fleeDir: fleeDir || { x: -1, z: z > 0 ? 0.3 : -0.3 }, speed: 1.8 },
        // 今川の色が混じらないよう、姿は全部ここで決める（僧は墨染の衣、里の者は野良着）
        [{ type: 'porter', n: n2, o: name.includes('僧') ? { flag: null, hat: 'none', kosode: 1, bozu: 1, kosodeCol: 0x24221f, armor: 0x1e1c1a, lace: 0x2a2826, cloth: 0x24221f, haori: null, mon: null } : { flag: null, hat: 'none', kosode: 1, kosodeCol: 0x6a5a44, armor: 0x4a4034, lace: 0x5a4e3c, cloth: 0x6a5a44, haori: null, mon: null } }]);
      c.routed = true; c.order = 'flee';
      for (const u of c.units) { u.fleeing = true; u.noTarget = true; u.civ = true; u.dmg = 0; u.speed = 1.5; u.run = 1.8; }
      c.civ = true;
      F.civ.push(c);
      return c;
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
      rt.say('足軽', '中堂から新手だがや！　槍を揃えよ！', 3);
      rt.marker('gosei2', centerOf(g2), () => `中堂の僧兵・${moraleWord(g2.morale)}`, { red: true, group: g2 });
    });
  },

  // ④ 山の上の堂塔が燃える
  burn(rt) {
    const F = rt.flags;
    if (F.burning) return;
    F.burning = true;
    for (const r of F.farHalls) F.templeFire.ignite(r, '山の上の火');
    // 時刻は変えない（昼のまま）。煙で日が陰り、空が茶色く濁っていく
    rt.after(12, () => { if (!rt.flags.ending) applyLook(rt, SMOKY); });
    rt.banner('山の上の堂塔から煙', '山の奥からも煙が立ち上る');
    rt.say('足軽', '……あの堂も燃えとる。屋根まで火だがや', 3);
    rt.say('明智光秀', '火の粉が来るぞ。堂から離れ、道を塞ぐな！', 4.5);
  },

  // 門の内の堂にも火が入る（ほかの組の火付け。自分は加わらない）
  burnHalls(rt) {
    const F = rt.flags;
    if (F.hallsBurn) return;
    F.hallsBurn = true;
    // 戦っている所から遠い堂から順に
    const p = rt.player.u.pos;
    const hs = [...F.halls].sort((a, b) => Math.hypot(b.x - p.x, b.z - p.z) - Math.hypot(a.x - p.x, a.z - p.z));
    hs.forEach((h, i) => rt.after(i * 7, () => {
      F.templeFire.ignite(h.rec, '堂への火');
      if (i === 0) {
        rt.army.play('cry', { x: h.x, z: h.z }, 1.2);
        rt.say('足軽', 'こっちの堂にも火だがや！', 3);
      }
    }));
    // 根本中堂の方の遠景の人々は、山の奥へ逃れていく
    if (F.crowd && F.crowd.rout) F.crowd.rout({ hideAfter: 30 });
  },

  // 中堂の前を押さえ、僧坊に逃げ遅れた人を救い出す
  deep(rt) {
    const F = rt.flags;
    if (F.deep || F.ending) return;
    F.deep = true;
    rt.unmark('gosei'); rt.unmark('gosei2');
    for (const q of [F.gosei, F.gosei2]) if (q && !gone(q)) { q.noRout = false; q.morale = 0; }
    rt.award((t) => t.side.push('門の内で豪盛の衆を退けた'), '豪盛の衆を退けた');
    rt.banner('豪盛の衆、退く', '中堂の奥で、僧兵が集まり直している');
    rt.obj('main', '中堂へ進み、僧兵を退けよ', 'main');
    const ctx = { faction: 'saito', flag: 'hikyaku', armor: 0xcfc7b4, dmg: 0.7, mass: 100, scale: 1, backing: false, fixedSpawn: true, look: (l) => dress(l, SOHEI),
      friends: () => F.oda.filter((g) => g && g.count && !g.routed),
      aid: { name: '明智の後詰', faction: 'oda', list: [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 10 }] }, aidSaid: '明智の後詰が山門をくぐって加わった' };
    depthStart(rt, ctx, hzSteps(this), (rt2, m) => {
      if (m.hSecured && m.hRescued) this.win(rt2, '中堂を押さえ、逃げ遅れた人々を外へ出した');
      else this.stalled(rt2, '中堂の持ち場を守れず、寄せを引いた');
    });
  },

  win(rt, how) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.unmark('gosei'); rt.unmark('gosei2'); rt.unmark('dp'); rt.unzone('dp');
    rt.obj('main', '中堂を押さえ、人々を堂から出せ', 'main');
    rt.objDone('main');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '山門を破り、僧兵を退けた', pts: 20 }; }, '任務達成・僧兵を退けた');
    if (!F.civHurt) { rt.objDone('civ'); rt.award((t) => t.side.push('手向かわぬ者を討たなかった'), '副任務：手向かわぬ者を討たなかった'); }
    for (const q of [F.gosei, F.gosei2]) if (q && !gone(q)) { q.noRout = false; q.morale = 0; }
    sfx('horagai', 0.7);
    rt.banner('比叡の山、落ちる', how);
    rt.say('明智光秀', rt.G.lord ? '殿、中堂の前を押さえてござる。……山が煙に包まれておりまする' : `${nm(rt)}、中堂は押さえたぞ。……この煙、目に焼きつけよ`, 5);
    rt.player.u.invuln = true;
    rt.finish({ scriptedEnd: true }, 10);
  },

  update(rt, dt) {
    const F = rt.flags;
    if (F.templeFire) F.templeFire.tick(dt);
    for (let i = rt.markers.length - 1; i >= 0; i--) { const m = rt.markers[i]; if (m.group && gone(m.group)) rt.unmark(m.id); }
    if (F.ending) return;
    if (rt.t > 420) { this.stalled(rt, '山の持ち場に届かず、次の備に寄せを任せた'); return; }
    if (F.step === 0 && rt.player.u.pos.x < 62) this.climb(rt);
    if (rt.t >= (F.lossNoteT || 0) && ((F.ak || 0) !== (F.shownAk || 0) || (F.ek || 0) !== (F.shownEk || 0))) {
      F.lossNoteT = rt.t + 8; F.shownAk = F.ak || 0; F.shownEk = F.ek || 0;
      rt.bark(`この持ち場の死者：味方${F.shownAk}人・僧兵${F.shownEk}人`);
    }
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
      rt.objProgress('main', `山門まで約${Math.max(0, Math.round(d))}歩。入口の味方の旗から石段へ`);
      if (!rt.choice) {
        if (d < F.roadBest - 1) { F.roadBest = d; F.roadWait = 0; }
        else F.roadWait += dt;
        const m = F.roadMark;
        if (m) m.guideAlways = F.roadWait >= 30;
        if (F.roadWait >= 30 && rt.t - F.roadSayT >= 30) {
          F.roadSayT = rt.t;
          const r = F.roadStop, p = rt.player.u.pos;
          r.x = p.x; r.z = p.z; r.t = rt.t; r.distance = d;
          r.cause = rt.blockedMove && rt.t - rt.blockedMove.t < 10 ? rt.blockedMove.cause : '進む入力と足止めの記録なし';
          r.allyLoss = F.ak; r.foeLoss = F.ek;
          rt.say('明智光秀', '本坂の入口に味方の旗がある。足元の矢印に沿い、石段を登れ', 4);
        }
      }
      if (rt.t - F.stepT >= 26 && d < 30) this.assault(rt);
    }
    if (F.step === 2) {
      let workers = 0;
      for (let i = 0; i < 2; i++) {
        const g = i ? F.ramReserve : F.ram;
        if (!g || g.routed) continue;
        for (const u of g.units) if (u.alive && !u.fleeing && !u.woundOut && !u.gone && !u.noTarget) workers++;
      }
      rt.objProgress('main', `門を破る組を守れ：山門${Math.round(Math.max(0, F.gate.hp) / F.gate.maxHp * 100)}％・担ぎ手${workers}人`);
      // 門を破る組が減ったら、控えの者が加わる
      if (workers < 4 && !F.ram2) {
        F.ram2 = true;
        const g = allyGroup(rt, { faction: 'oda', name: '門を破る組', anchor: { x: GATE.x + 40, z: 10 }, facing: -Math.PI / 2, width: 5, aggro: 2, noRout: true, order: 'assault' },
          dress([{ type: 'ashigaru', n: 10, o: { hat: 'jingasa_n' } }], ODA));
        g.assault = F.ram.assault; F.ramReserve = g;
        rt.say('明智光秀', '控えの者、丸太に付け！', 2);
      }
      if (rt.t - F.stepT > 140 && !F.gateDelayed) {
        F.gateDelayed = true; rt.say('明智光秀', '門はまだ持ちこたえておる。丸太の組を守れ！　塀越しなら閂を外せよう', 4);
      }
      if (rt.t - F.stepT > 180 && F.gate.alive) { this.stalled(rt, '山門を破れず、寄せを引いた'); return; }
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
      if (!F.deep) rt.objProgress('main', `残る僧兵 ${ (gone(g) ? 0 : g.count) + (F.gosei2 && !gone(F.gosei2) ? F.gosei2.count : 0)}人。逃げる者は追うな`);
      if (rt.t - F.stepT > 25) this.burn(rt);
      if (rt.t - F.stepT > 30) this.burnHalls(rt);
      if (F.deep) { depthTick(rt, dt); return; }
      if (g.count < 6 && g.noRout) { g.noRout = false; g.morale = Math.min(g.morale, 20); }
      if ((gone(g) || g.count <= 3 || g.units.every((u) => !u.alive || u.fleeing || u.woundOut)) && F.gosei2 && (gone(F.gosei2) || F.gosei2.count <= 3)) this.deep(rt);
      else if (rt.t - F.stepT > 150) {
        for (let i = 0; i < 2; i++) {
          const q = i ? F.gosei2 : g;
          if (q && !gone(q) && (q.count <= q.initial * 0.5 || q.morale <= 30)) {
            q.noRout = false; q.morale = Math.min(q.morale, 20);
          }
        }
      }
      if (rt.t - F.stepT > 180 && !F.deep) { this.stalled(rt, '門内の抵抗は残り、寄せを引いた'); return; }
    }
  },

  stalled(rt, reason) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    if (F.dp) {
      F.dp.on = false;
      if (F.dp.cur?.people) F.dp.cur.people.fleePath = null;
    }
    F.rescueHelp = null;
    rt.unzone('dp');
    rt.setPhase('end');
    rt.objFail('dp');
    rt.obj('main', '中堂まで寄せ、山の持ち場を守れ', 'main'); rt.objFail('main'); rt.tracker.main = false;
    for (const id of ['road', 'dp', 'gate', 'front', 'sally', 'sally2', 'gosei', 'gosei2', 'flank', 'ladder', 'bar', 'rescue']) { rt.unmark(id); rt.uninteract(id); }
    rt.banner('寄せを立て直す', reason);
    rt.say('明智光秀', 'この手では押し切れぬ。味方の列へ退き、次の備に任せよ', 4);
    rt.finish({ scriptedEnd: true }, 8);
  },
  onKill(rt, v, k) {
    const F = rt.flags;
    if (v.group && v.group.civ) {
      if (k && k.isPlayer && !F.civHurt) {
        F.civHurt = true;
        rt.objFail('civ');
        rt.violation('手向かわず逃げる者を討った', rt.G.lord ? ['明智光秀', '殿……！　その者は手向かっておりませぬ'] : ['明智光秀', '下知を忘れたか！　手向かわぬ者を討つとは何事じゃ！']);
      }
      return;
    }
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
    if (v.type === 'busho' && v.team === 1 && v.group) { v.group.noRout = false; v.group.morale -= 40; }
  },
  onRout(rt, g) {
    if (g.team !== 1 || g.civ || g._routSaid || rt.t < (rt.flags.routSayT || 0)) return;
    const c = g.center();
    if (rt.distTo(c) > 30 || rt.army.wallBetween(rt.player.u.pos, rt.player.u.team, c)) return;
    g._routSaid = true; rt.flags.routSayT = rt.t + 8;
    rt.say('足軽', `${g.name}が奥へ逃げてくぞ！`, 2.5);
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
    for (let i = 0; i < s.mesh.userData.leaves.length; i++) {
      const lv = s.mesh.userData.leaves[i];
      if (F.barOpen) lv.rotation.y = i ? -Math.PI / 2 : Math.PI / 2;
      else { lv.rotation.z = 1.4; lv.position.y = 0.1; }
    }
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
  return { a: 30000, a0: 30000, b: 4000, b0: 4000 };
};
hieizan.sides = { a: { name: '織田軍', mon: 'oda' }, b: { name: '延暦寺の僧兵', mon: 'hikyaku' } };
// 史実でこの戦にいた名のある武将（battle.js の placeFamous が、その家の隊に加える。敵は名乗り、討てば手柄）
hieizan.famous = [
  { name: '柴田勝家', team: 0, g: /門を破る/, loose: 1, line: '柴田勝家じゃ！　丸太を寄せよ、門を打ち破れ！' },
];
hieizan.date = (rt) => `元亀二年九月十二日　秋・煙に陰る山`;
hieizan.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '登りの下知まで待つ' : '');
hieizan.skip = (rt) => { if (rt.phase === 'brief') hieizan.climb(rt); };
hieizan.history = '元亀二年九月十二日、織田信長は比叡山を攻めた。前年、山門の衆は浅井・朝倉に味方し、信長が求めた織田方への加勢にも、双方に与しないとの求めにも応じなかった。信長公記は、根本中堂や山王の社、僧坊などを焼き払い、八王子山へ逃れた僧俗や子供、女も殺し、死者は数千に及んだと記す。焼き討ち後、明智光秀に志賀郡が与えられたとも記す。ここで示す両軍三万・四千は遊び上の目安で、信長公記の確定した兵数ではない。煙に陰る昼の景色や火の回る順、山門の攻防、正覚院豪盛の指揮と退却、救出の任務は遊びのための補いである。逃げる者を討たぬ下知も創作で、史実の信長の命令ではない。';
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
  if (F.rescueHelp) {
    inp.guardHold = false;
    goTo(p, inp, F.rescueHelp.x, F.rescueHelp.z, 2);
    if (Math.hypot(u.pos.x - F.rescueHelp.x, u.pos.z - F.rescueHelp.z) < 4) inp.k.add('KeyE');
    return;
  }
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
// 中堂の前を押さえ、逃げ遅れた人を助ける。前年の朝倉・浅井の兵は新手にしない。
function hzSteps(def) {
  const steps = [
    rest({ dur: 8, heal: 0.2, say: [['明智光秀', '中堂へ進め。……堂の陰に里の者がおる'], ['足軽', '煙で見えんがや！　旗を見失うな！']] }),
    pick({ title: '中堂の前に僧兵と里の者がいる。どう寄せる？',
      options: [{ label: '道を空け、人々を逃がして僧兵を受ける', note: '中堂の前で味方と持ちこたえる' }, { label: '僧兵を押し退け、中堂の前を押さえる', note: '里の者へ刃を向けぬよう寄せる' }],
      on: (rt, m, i) => {
        rt.objRemove('main');
        m.hLet = i === 0;
        def.civ(rt, -36, 9, 4, '逃げる里の者');
        rt.say('明智光秀', i === 0 ? '道を空けよ。僧兵はここで受ける！' : '中堂へかかれ。里の者に刃を向けるな', 3);
      } }),
    hold({ skip: (rt, m) => !m.hLet, at: { x: -34, z: 2 }, dur: 65, realHold: true, r: 14,
      title: '中堂の前', sub: '味方と並び、人々の逃げ道を守る', label: '中堂の前', obj: '中堂前で味方と並び、僧兵を返せ',
      waves: [
        { t: 4, say: ['足軽', '堂の陰だがや！　薙刀が来るぞ！'], foes: () => [{ name: '中堂の僧兵', from: { x: -58, z: 5 }, list: SO(2, 12, 2), noRout: 20 }] },
        { t: 30, say: ['明智光秀', '北にも来た。隣の組と並べ！'], foes: () => [{ name: '僧坊の僧兵', from: { x: -42, z: 30 }, list: SO(2, 10, 2) }] },
      ], reward: '中堂の前で逃げ道を守った',
      onEnd: (rt, m, won) => { m.hSecured = won; if (!won) def.stalled(rt, '中堂の持ち場を守れず、寄せを引いた'); } }),
    fight({ skip: (rt, m) => m.hLet, at: { x: -40, z: 0 }, title: '中堂へかかれ', sub: '堂の前の僧兵を押し退ける', obj: '中堂の前の僧兵を崩せ',
      foes: () => [{ name: '中堂を守る僧兵', from: { x: -58, z: 5 }, list: SO(3, 14, 2), noRout: 20 }],
      later: [{ t: 24, say: ['足軽', '北の僧坊からも出てきたがや！'], foes: () => [{ name: '僧坊の僧兵', from: { x: -42, z: 30 }, list: SO(2, 10, 2) }] }],
      max: 100, reward: '中堂の前を押さえた',
      onEnd: (rt, m, won) => { m.hSecured = won; if (!won) def.stalled(rt, '中堂の僧兵を崩せず、寄せを引いた'); } }),
    rest({ dur: 6, heal: 0, say: [['足軽', '……僧坊にまだ人がおるがや！'], ['明智光秀', '縁へ寄れ。中へは入るな、外から手を貸せ']] }),
    hzRescue(def),
  ];
  // 段が敗れた後は、残る下知や救出の札を出さない。
  for (const step of steps) {
    const skip = step.skip;
    step.skip = (rt, m) => rt.flags.ending || !!(skip && skip(rt, m));
  }
  return steps;
}

// 堂の外で手を貸して初めて救出とする。近づいただけでは手柄にしない。
function hzRescue(def) {
  const at = { x: -17, z: -22 };
  const step = move({ to: at, max: 60, r: 4, label: '煙の残る僧坊の縁', obj: '僧坊の縁で手を貸し、人を出せ',
    onEnd: (rt, m, rescued) => {
      rt.flags.rescueHelp = null;
      rt.uninteract('rescue');
      if (!rescued) return;
      rt.award((t) => t.side.push('僧坊から人々を救い出した'), '僧坊から人々を救い出した');
      rt.say('足軽', '手を出しやあ！　堂から離れるぞ！', 3);
    } });
  const start = step.start, tick = step.tick, end = step.end;
  step.start = (rt, C, m, ctx) => {
    start(rt, C, m, ctx);
    m.hRescued = false;
    C.people = def.civ(rt, at.x, at.z, 4, '逃げ遅れた人々');
    C.people.fleePath = [[at.x, at.z]];
    rt.flags.rescueHelp = at;
    rt.addInteract('rescue', at, '手を貸して人々を外へ出す', () => {
      if (rt.flags.ending || m.hRescued) return;
      m.hRescued = true;
      C.people.name = '救い出した人々';
      C.people.fleePath = [[-17, -16], [-34, -10], [-106, -8]];
      for (const u of C.people.units) u.fleePathIdx = 0;
      rt.uninteract('rescue');
    }, { r: 4, hold: 3 });
  };
  step.tick = (rt, C, m, ctx, el) => {
    tick(rt, C, m, ctx, el);
    if (C.arr && !m.hRescued) rt.objProgress('dp', '縁で手を貸し、人を外へ出せ');
    return m.hRescued;
  };
  step.end = (rt, C, m, ctx) => {
    C.arr = !!m.hRescued;
    C.people.fleePath = m.hRescued ? C.people.fleePath : null;
    end(rt, C, m, ctx);
  };
  return step;
}

export { hieizan };
