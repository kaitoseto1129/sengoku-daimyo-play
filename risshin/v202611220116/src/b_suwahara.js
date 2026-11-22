// ======================================================================
// 長篠編　諏訪原城攻め（天正三年八月）
// 大井川を見下ろす台地の山城。本曲輪の正面に丸馬出、そのまわりに三日月堀。
// 足軽大将候補として組二十人を率い、堀の際まで寄せ、馬出の出撃を押し返し、門破りの組を守って大手の枡形（一の門・二の門）を破る。
// 門が破れたら本曲輪へ押し込み、城将・今福浄閑を討つか城兵を崩せば勝ち
// 向き：寄せ手は南（+z）から北（-z）へ攻め上る。東（+x）の崖の下に大井川
// ======================================================================
import * as THREE from 'three';
import { siegeStages } from './siege_stages.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { solidRect, jinmaku, nobori, hut, bridgeBoard, yagura, lookoutDeckHeight, tawara, stumps, dobei, kabukimon, tobira, yaguramon, dorui, uneBori, pointedStakeGeo, makeSimpleBatch, finalizeSimpleBatch, palisade } from './props.js';
import { S as SETTINGS } from './settings.js';
import { flagTexture } from './textures.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { isTouch } from './touch.js';
import { moraleWord } from './hud.js';
import { gauss, enemyGroup, allyGroup, nm, centerOf, unitPos, wallLine } from './bhelp.js';
import { KIT, volley } from './b_nagashinojo.js';
import { tabaGeo } from './taketaba.js';
import { camp } from './b_mid.js';
import { depth as suwaDepth } from './suwahara/depth.js';
import { isEn, addEn } from './i18n.js';
// K516 英語の時だけ諏訪原城の字の表を読む（日本語の時は読まない・重さ0）
if (isEn()) import('./i18n_suwahara.js').then((m) => addEn(m.default)).catch(() => {});

// 縄張り（城の形）
const HON = { x0: -30, x1: 30, z0: -88, z1: -34 };   // 本曲輪（南の辺 z1 に大手門）
const GATE = { x: 0, z: HON.z1, w: 6.4 };            // 大手 一の門（高麗門）
const MASU = { hw: 8, zN: -46 };                     // 枡形：一の門の内の四角い囲い（x は ±hw、北の辺が zN）
const GATE2 = { x: 8, z: -40, w: 5 };                // 二の門（櫓門）：枡形の東の辺。一の門から折れ曲がって通る
const MOAT = { z: -29, hw: 3.6 };                    // 本曲輪の前の空堀（z の中心と半幅）
const UMA = { x: 0, z: -19, r: 9.5, span: 1.75 };    // 丸馬出（半円の土塁と柵。span は南から左右へ開く角）
const MIKA = { r0: 11.6, r1: 18.4, span: 1.2 };        // 三日月堀（馬出を囲む弧）
const EDGE = { x: 0, z: 5, r: 7 };                   // 寄せの目当て：三日月堀の際
const TOWERS = [[-25.5, -38.5], [25.5, -38.5]];      // 隅櫓（上に弓・鉄砲）
const DECK = () => lookoutDeckHeight() + .02;                                   // 隅の井楼櫓（props.js の yagura）の床の高さ
const TIME_LIMIT = 540;                              // 日暮れまで（秒）

const clamp01 = (v) => Math.max(0, Math.min(1, v));
// 堀の断面：底が平らで、縁が edge の幅で立ち上がる
const trap = (d, hw, edge) => { const t = clamp01((hw - d) / edge); return t * t * (3 - 2 * t); };
const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const inHon = (x, z) => Math.abs(x) < HON.x1 && z < HON.z1 - 0.3 && z > HON.z0;
const segDist = (x, z, ax, az, bx, bz) => {
  const dx = bx - ax, dz = bz - az;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(x - ax - dx * t, z - az - dz * t);
};
const inMasu = (x, z) => Math.abs(x) < MASU.hw && z < HON.z1 - 0.3 && z > MASU.zN;
const inUma = (x, z) => Math.hypot(x - UMA.x, z - UMA.z) < UMA.r && z > MOAT.z + MOAT.hw;
// 三日月堀の中（底と法面）。11/18 16:40：出撃の段に bot が堀の底の敵を追って入り、上がれずに矢と槍を受けて倒れた（act bot 80秒 (-11,-12)→(-9,-3)）
const inMika = (x, z) => { const dr = Math.hypot(x - UMA.x, z - UMA.z); return dr > MIKA.r0 - 0.8 && dr < MIKA.r1 + 0.8 && Math.abs(Math.atan2(x - UMA.x, z - UMA.z)) < MIKA.span + 0.1 && z > MOAT.z + MOAT.hw; };

// 台地と城の土木（空堀・土塁・丸馬出・三日月堀）
function height(x, z) {
  let h = 0.6 * Math.sin(x * 0.04) * Math.cos(z * 0.03) + 0.4 * Math.sin(z * 0.07 + x * 0.02);
  // 台地：南の裾から攻め上る
  h += 7 * smooth(58, 6, z);
  h += 4 * gauss(x, z, -110, 60, 2600) + 3 * gauss(x, z, -120, -60, 3000);
  // 東の崖と大井川、北の崖
  if (x > 72) h -= Math.min(24, (x - 72) * 0.95);
  if (z < -104) h -= Math.min(16, (-104 - z) * 0.7);
  // 本曲輪：一段高く、縁に土塁
  const inX = smooth(HON.x1 + 2, HON.x1 - 1, Math.abs(x));
  const inZ = smooth(HON.z1 + 2, HON.z1 - 1, z) * smooth(HON.z0 - 2, HON.z0 + 1, z);
  h += 2.6 * inX * inZ;
  const dEdge = Math.min(segDist(x, z, HON.x0, HON.z1, HON.x1, HON.z1), segDist(x, z, HON.x1, HON.z1, HON.x1, HON.z0),
    segDist(x, z, HON.x1, HON.z0, HON.x0, HON.z0), segDist(x, z, HON.x0, HON.z0, HON.x0, HON.z1));
  if (!(Math.abs(x) < 5 && Math.abs(z - HON.z1) < 3)) h += 1.5 * clamp01(1 - dEdge / 3);
  // 空堀：本曲輪の前（土橋のところだけ残す）と左右
  // 深い箱堀：底は平らで、法面は斜め（堀底まで下りられる）
  const front = trap(Math.abs(z - MOAT.z), MOAT.hw, 2.6) * smooth(39, 35, Math.abs(x)) * smooth(2.6, 5.2, Math.abs(x));
  const side = trap(Math.abs(Math.abs(x) - 35.5), 3.4, 2.4) * smooth(MOAT.z + 2, MOAT.z - 1, z) * smooth(HON.z0 - 6, HON.z0 - 2, z);
  h -= 5 * Math.max(front, side);
  // 丸馬出：半円の内を少し盛り、縁に土塁
  const dr = Math.hypot(x - UMA.x, z - UMA.z);
  const ang = Math.abs(Math.atan2(x - UMA.x, z - UMA.z));
  if (z > MOAT.z + MOAT.hw - 1) h += 0.8 * smooth(UMA.r + 1.5, UMA.r - 1, dr);
  if (ang < UMA.span) h += 1.5 * clamp01(1 - Math.abs(dr - UMA.r) / 2.4);
  // 三日月堀：馬出を囲む弧の形に掘り下げる
  const mid = (MIKA.r0 + MIKA.r1) / 2, hw = (MIKA.r1 - MIKA.r0) / 2;
  h -= 4.6 * trap(Math.abs(dr - mid), hw, 2.6) * clamp01((MIKA.span + 0.12 - ang) / 0.2);
  // 堀の外の縁（寄せ手の側）を一段下げる：南の坂から、三日月形の堀の内岸と馬出の土塁が弧になって見える
  h -= 3.2 * clamp01((MIKA.span + 0.3 - ang) / 0.5) * smooth(MIKA.r0 + 1, mid, dr) * smooth(MIKA.r1 + 12, MIKA.r1 + 1, dr);
  return h;
}

// ---------------- 城の作り（塀・門・櫓・館・蔵・逆茂木・乱杭）。動かない物は一つの形にまとめて軽くする ----------------
const WALLMAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
function paint(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
function mesh(parts) {
  const m = new THREE.Mesh(mergeGeometries(parts), WALLMAT);
  m.castShadow = true; m.receiveShadow = true;
  m.userData.camBlock = true;
  return m;
}
// 箱を線 (ax,az)-(bx,bz) の向きに置く（out：外向きへずらす量）
function boxAlong(parts, hex, ax, az, bx, bz, w, h, d, y, out = 0) {
  const len = Math.hypot(bx - ax, bz - az);
  const g = new THREE.BoxGeometry(len * w, h, d);
  const nx = -(bz - az) / len, nz = (bx - ax) / len;
  g.rotateY(Math.atan2(-(bz - az), bx - ax));
  g.translate((ax + bx) / 2 + nx * out, y, (az + bz) / 2 + nz * out);
  parts.push(paint(g, hex));
}
// 置いた向きの箱（rot は y 軸まわり）
function box(parts, hex, x, y, z, w, h, d, rot = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.rotateY(rot); g.translate(x, y, z);
  parts.push(paint(g, hex));
}
// 切妻の屋根：棟の向き rot、幅 w（棟に沿う長さ）、奥行 d、軒の高さ y、勾配 pitch
function gable(parts, hex, x, y, z, w, d, rot, pitch = 0.5, th = 0.16) {
  for (const s of [-1, 1]) {
    const half = d / 2 / Math.cos(pitch);
    const g = new THREE.BoxGeometry(w, th, half + 0.3);
    g.rotateX(s * pitch);
    g.translate(0, y + Math.sin(pitch) * half / 2, s * d / 4);
    g.rotateY(rot); g.translate(x, 0, z);
    parts.push(paint(g, hex));
  }
  const ridge = new THREE.BoxGeometry(w + 0.2, 0.2, 0.3);
  ridge.translate(0, y + Math.tan(pitch) * d / 2 + 0.05, 0);
  ridge.rotateY(rot); ridge.translate(x, 0, z);
  parts.push(paint(ridge, 0x2a2828));
}

// 城将の館（板葺き）：縁側と格子の窓
function yakata(parts, world, x, z, w, d) {
  const y = world.heightAt(x, z);
  box(parts, 0x4a3a2a, x, y + 0.35, z, w + 1.6, 0.7, d + 1.6);                // 縁側
  box(parts, 0x3e3024, x, y + 1.9, z, w, 2.4, d);                              // 板壁
  for (let k = -2; k <= 2; k++) box(parts, 0xcfc6b2, x + k * w / 5.5, y + 2.0, z + d / 2 + 0.03, w / 8, 1.3, 0.04);   // 障子
  gable(parts, 0x5a4a38, x, y + 3.1, z, w + 1.8, d + 2.4, 0, 0.42, 0.2);      // 板葺きの屋根
  for (let k = -3; k <= 3; k++) box(parts, 0x3a3026, x + k * (w + 1.8) / 7, y + 3.45, z + (d + 2.4) / 4, 0.1, 0.12, (d + 2.4) / 2 + 0.4, 0);   // 押さえの桟
}
// 兵糧の蔵：板壁に板葺き
function kura(parts, world, x, z, w, d, rot = 0) {
  const y = world.heightAt(x, z);
  box(parts, 0x5e5a52, x, y + 0.35, z, w + 0.3, 0.7, d + 0.3, rot);
  box(parts, 0x75634c, x, y + 2.0, z, w, 2.8, d, rot);
  box(parts, 0x2f2c28, x + Math.sin(rot) * (d / 2 + 0.03), y + 1.4, z + Math.cos(rot) * (d / 2 + 0.03), 1.3, 1.9, 0.06, rot);   // 扉
  gable(parts, 0x5a4a38, x, y + 3.35, z, w + 0.8, d + 1.2, rot, 0.5);
}
// 逆茂木：枝を払った木を、先を外へ向けて寝かせ並べる
function sakamogi(parts, world, x, z, out) {
  const y = world.heightAt(x, z);
  for (let i = 0; i < 5; i++) {
    const L = 2.2 + (i % 3) * 0.3, col = [0x5a4632, 0x4e3c2a, 0x66523a][i % 3];
    // 11/18 クラウド：写真で丸太の X に見えた（⑥）→ 先を尖らせ、払い残した枝の股を三つ付けて「枝付きの木」に
    const g = new THREE.CylinderGeometry(0.012, 0.1, L, 5);
    const pieces = [g];
    for (let j = 0; j < 3; j++) {
      const bl = 0.45 + ((i + j) % 3) * 0.15, br = new THREE.CylinderGeometry(0.008, 0.03, bl, 4);
      br.translate(0, bl / 2, 0); br.rotateZ((j % 2 ? 1 : -1) * (0.6 + j * 0.12)); br.rotateY(j * 2.1 + i);
      br.translate(0, -L / 2 + L * (0.35 + j * 0.2), 0); pieces.push(br);
    }
    for (const q of pieces) {
      q.rotateX(Math.PI / 2 - 0.45 - (i % 2) * 0.15);
      q.rotateY(out + (i - 2) * 0.28);
      q.translate(x + Math.sin(out) * 0.6 + (i - 2) * 0.35 * Math.cos(out), y + 0.45, z + Math.cos(out) * 0.6 - (i - 2) * 0.35 * Math.sin(out));
      parts.push(paint(q, col));
    }
  }
  const b = new THREE.CylinderGeometry(0.1, 0.1, 2.2, 5); b.rotateZ(Math.PI / 2); b.rotateY(out + Math.PI / 2); b.translate(x, y + 0.15, z); parts.push(paint(b, 0x4a3a28));
}
// 乱杭：先を尖らせた杭を不揃いに打ち込む
function rankui(parts, world, x, z, k) {
  const y = world.heightAt(x, z);
  const h = 1.1 + ((k * 37) % 7) * 0.1;
  const high = true;
  const g = high ? pointedStakeGeo(k).clone().scale(1, h, 1) : new THREE.CylinderGeometry(0.02, 0.09, h, 5);
  g.rotateX(((k * 13) % 9 - 4) * 0.07); g.rotateZ(((k * 29) % 9 - 4) * 0.07);
  g.translate(x, y + h / 2 - 0.15, z);
  parts.push(high ? g : paint(g, [0x6b5238, 0x5a4430, 0x7a5c40][k % 3]));
}
// 竹束：竹の束を横に積み、縦竹と支え棒で組んだ弾除け（taketaba.js の共通の形を写して一つにまとめる）
function takeTaba(parts, world, x, z, rot) {
  const g = tabaGeo().clone(); g.rotateY(rot); g.translate(x, world.heightAt(x, z), z); parts.push(g);
}

// ---------------- 道すじ ----------------
// 城のまわりは塀と柵で塞がれているので、馬出の脇の口 → 馬出の中 → 土橋 → 一の門 → 枡形 → 二の門 の順に通す
function route(rt, x, z, final) {
  const F = rt.flags;
  // 枡形の内：二の門へ。破れていれば二の門をくぐって東へ出る
  if (inMasu(x, z)) return F.gate2.alive ? F.gate2 : { x: GATE2.x + 5, z: GATE2.z };
  if (inHon(x, z)) {
    // 枡形の脇にいるときは、枡形の角を回ってから目当てへ
    if (Math.abs(x) >= MASU.hw - 0.5 && z > MASU.zN - 2.5 && Math.abs(final.x) < MASU.hw + 3) return { x: Math.sign(x) * (MASU.hw + 4), z: MASU.zN - 5 };
    return final;
  }
  // 土橋：一の門へ。破れていれば枡形へ
  if (Math.abs(x) < 5 && z < MOAT.z + MOAT.hw + 0.5 && z > HON.z1 - 1) return F.gate.alive ? F.gate : { x: 0, z: HON.z1 - 6 };
  // 脇の口から土橋へ斜めに向かうと、橋の外の堀へ入り、馬出へ戻る道と往復してしまう。
  // 先に馬出の北側で橋の中央へ寄せ、それから堀を渡る。
  if (inUma(x, z)) return Math.abs(x) > 2 ? { x: 0, z: -24 } : { x: 0, z: MOAT.z + 1 };
  const s = Math.sign(x) || 1;
  // 馬出の脇（北の半分）：口の外 → 口をくぐって中へ
  if (z < UMA.z + 1) {
    // 行き先の手前1.6mで兵が落ち着く前に、柵の北の脇口へ道順を切り替える。
    if (Math.abs(x) > UMA.r - 0.5 && z > -22) return { x: s * Math.max(Math.abs(x), 12.5), z: -24 };
    return { x: s * 3, z: -24 };
  }
  // 馬出の前に張り付いていたら、弧に沿って脇へ回る
  if (Math.hypot(x - UMA.x, z - UMA.z) < 13.5) return { x: s * 14, z: -12 };
  return { x: s * 17, z: -23 };
}
// いま破っている門（一の門 → 二の門）と、その残りの割合
const curGate = (F) => (F.gate.alive ? F.gate : F.gate2);
const gatePct = (F) => { const g = curGate(F); return Math.round(Math.max(0, g.hp) / g.maxHp * 100); };
const gateName = (F) => (F.gate.alive ? '一の門' : '二の門（櫓門）');
// 門の前で立つ所（門の外向きへ少し離れる）
const gateFront = (g, d = 1.8) => ({ x: (g.seg[0] + g.seg[2]) / 2 + g.nx * d, z: (g.seg[1] + g.seg[3]) / 2 + g.nz * d });
const ramCount = (F) => F.rams.reduce((a, g) => a + g.count, 0);
const gone = (g) => !g || g.count === 0 || g.routed;
// 11/18 クラウド：本曲輪の城兵の道すじ。枡形と土橋の側の敵へは、まっすぐ寄ると枡形の北の塀 (0〜4,-46) に詰まって重なるので、二の門の外 → 二の門の内 と回る
// 11/18 17:00 クラウド：蔵二つ（16:02 に当たりを足した solidRect）の角に、本曲輪の奥の城兵が南の寄せ手へ真っすぐ向かって掛かり、(15,-60) で隊速0のまま二十秒止まった（act bot 2回）。
//   行く筋が蔵に掛かる時は、蔵の角の外を回る
const KURA = [[18, -57, 3.15 + 0.9, 2.4 + 0.9], [20, -68, 2.15 + 0.9, 2.65 + 0.9]];
function kuraWay(x, z, q) {
  if (!q) return q;
  for (const [cx, cz, hx, hz] of KURA) {
    let hit = false;
    for (let k = 1; k < 12 && !hit; k++) { const t = k / 12, sx = x + (q.x - x) * t, sz = z + (q.z - z) * t; hit = Math.abs(sx - cx) < hx && Math.abs(sz - cz) < hz; }
    if (!hit) continue;
    // 角の際（広げた囲いの内）にいる時は、まず目当てに近い側の横へ出る
    // 11/19 03:05 クラウド：蔵の南の壁の際 (15,-60) から目当ての側（東）へ横に出ようとして壁を擦り、隊速0で二十秒立った（act bot 2回）。浅く入った辺から真っすぐ外へ出る
    if (Math.abs(x - cx) < hx && Math.abs(z - cz) < hz) {
      if (hz - Math.abs(z - cz) < hx - Math.abs(x - cx)) return { x, z: cz + (Math.sign(z - cz) || 1) * (hz + 0.6) };
      const ex = Math.sign(q.x - cx) || -1; return { x: cx + ex * (hx + 0.6), z };
    }
    let best = null, bd = 1e9;
    // 11/19 02:00 クラウド：角に着いた後、角から目当てへの筋がまた広げた囲いの際を掠めると、同じ角を選び直して目当てへ真っすぐ向かい、蔵に掛かって隊速0で二十秒立った（act bot 信長で出陣 235秒 (10,-65)→(22,-57)）。
    //   着いた角（一m 余り内）と、そこへの筋が蔵に掛かる角は選ばず、次の角へ回る
    const cross = (ax, az, bx, bz) => { for (let k = 1; k < 12; k++) { const t = k / 12, sx = ax + (bx - ax) * t, sz = az + (bz - az) * t; if (Math.abs(sx - cx) < hx - 0.05 && Math.abs(sz - cz) < hz - 0.05) return true; } return false; };
    for (const [ex, ez] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
      const c = { x: cx + ex * (hx + 0.6), z: cz + ez * (hz + 0.6) }, d = Math.hypot(c.x - x, c.z - z) + Math.hypot(q.x - c.x, q.z - c.z);
      if (Math.hypot(c.x - x, c.z - z) < 1.2 || cross(x, z, c.x, c.z)) continue;
      if (d < bd) { bd = d; best = c; }
    }
    return best || q;
  }
  return q;
}
function honWay(rt, u) { const q = honWay0(rt, u); return q && !q.isStruct ? unjam(rt, u, kuraWay(u.pos.x, u.pos.z, q)) : q; }
// 11/18 23:45 クラウド：本曲輪の奥の城兵が (10〜11,-64〜-65) で行き先 (14,-50) へ向かうまま隊速0で二十秒立った（act bot 225秒・俵や仲間の背に詰まる）。
//   六秒で一m も進めない時は、四秒だけ行く筋の横へ四m 外して詰まりをほどく
function unjam(rt, u, q) {
  if (!q) return q;
  const s = u._uj ??= { t: rt.t, x: u.pos.x, z: u.pos.z, until: 0, ox: 0, oz: 0 };
  if (rt.t < s.until) return { x: u.pos.x + s.ox, z: u.pos.z + s.oz };
  const far = Math.hypot(q.x - u.pos.x, q.z - u.pos.z) > 3;
  if (!far || Math.hypot(u.pos.x - s.x, u.pos.z - s.z) > 1) { s.t = rt.t; s.x = u.pos.x; s.z = u.pos.z; return q; }
  if (rt.t - s.t < 6) return q;
  const dx = q.x - u.pos.x, dz = q.z - u.pos.z, L = Math.hypot(dx, dz) || 1;
  let sd = Math.random() < 0.5 ? -1 : 1;
  // 11/19 03:05 クラウド：横へ外す先が蔵の中だと、蔵へ押し付けて止まり続けた（(15,-60)→(19,-57)）。蔵の中なら逆の横へ
  const inKura = (ox, oz) => KURA.some(([cx, cz, hx, hz]) => Math.abs(u.pos.x + ox - cx) < hx && Math.abs(u.pos.z + oz - cz) < hz);
  if (inKura((-dz / L * sd + dx / L * 0.5) * 4, (dx / L * sd + dz / L * 0.5) * 4)) sd = -sd;
  s.ox = (-dz / L * sd + dx / L * 0.5) * 4; s.oz = (dx / L * sd + dz / L * 0.5) * 4; s.until = rt.t + 4; s.t = rt.t + 4; s.x = u.pos.x; s.z = u.pos.z;
  return { x: u.pos.x + s.ox, z: u.pos.z + s.oz };
}
function honWay0(rt, u) {
  const F = rt.flags;
  const foe = rt.army.nearestEnemy(u, 30, (o) => !o.fleeing && !o.isStruct);
  const d = foe ? foe.pos : null;
  // 11/19 04:00 クラウド：近くに敵がいない間、皆が同じ一点（持ち場 (22,-42)）を目当てにして、二の門の東 (17,-40) に二十一組重なって止まった（act bot storm 261秒）。一人ずつ持ち場の周りへずらす
  // 11/19 08:30 クラウド：枡形の内にいる城兵が、持ち場の周り (18,-46) へ真っすぐ向かい、枡形の北東の塀の内の際 (6.4,-45.6) で十八秒止まった（08:03 の未①）。枡形の内・土橋の側からは二の門を通す
  if (!d) { const k = u._hwK ??= Math.random(), a = k * 40, rr = 1.5 + (k * 13 % 1) * 3.5, h = { x: F.hon.anchor.x + Math.cos(a) * rr, z: F.hon.anchor.z + Math.sin(a) * rr }; return u.pos.z > HON.z1 - 0.3 || inMasu(u.pos.x, u.pos.z) ? route(rt, u.pos.x, u.pos.z, h) : h; }
  // 11/18 クラウドし：本曲輪の城兵が堀を越えて馬出の前 (0,-11) まで追い、息を整えに下がった足軽の本人を背から囲んで倒した（act bot 276〜430秒・6戦で2回）。城兵は空堀より外の敵を追わず本曲輪へ戻る
  if (d.z > MOAT.z - MOAT.hw) return u.pos.z > HON.z1 - 0.3 || inMasu(u.pos.x, u.pos.z) ? route(rt, u.pos.x, u.pos.z, F.hon.anchor) : F.hon.anchor;
  const uIn = inHon(u.pos.x, u.pos.z) && !inMasu(u.pos.x, u.pos.z);
  const dOut = inMasu(d.x, d.z) || d.z > HON.z1 - 0.3;
  if (uIn && dOut) {
    if (F.gate2.alive) return F.hon.anchor;
    // 11/18 17:50 クラウド：皆が同じ一点（二の門の外）を目当てにして、(12,-44) に二十八組重なって止まった（act bot 信長で出陣 241秒）。
    //   一人ずつ門の幅の中で目当てをずらす（08:45 の枝 gate2spread と同じ形。あの時の倒れの元＝城兵が土橋の外へ出る事は、空堀より外を追わない形で main に入った）
    const k = u._hwK ??= Math.random();
    const oz = GATE2.z + (k - 0.5) * (GATE2.w - 1.2);
    const o = { x: GATE2.x + 3.5 + (k * 7 % 1) * 3, z: oz };
    // 11/18 23:40 クラウド：枡形の北や西から二の門の外へまっすぐ向かうと、枡形の北の塀の東の角 (7,-46) に掛かって重なり止まった（23:01 の未）。
    //   枡形の西にいる時は北西の角の外へ、北にいる時は北東の角の外へ回ってから門へ
    const px = u.pos.x, pz = u.pos.z, cz = MASU.zN - 3.5;
    if (px < MASU.hw + 2 && pz > MASU.zN - 2.5) return { x: px < 0 ? -(MASU.hw + 3.5) : MASU.hw + 3.5, z: cz };
    if (px < MASU.hw + 2 && pz > cz - 4) return { x: MASU.hw + 3.5, z: cz };
    return Math.hypot(u.pos.x - o.x, u.pos.z - o.z) > 2.2 ? o : { x: GATE2.x - 3, z: oz };
  }
  return d;
}

const suwahara = {
  resumeSteps: [[1, 'approach'], [2, 'sortie'], [3, function (rt) { this.breach(rt, false); }], [4, 'storm']],   // 戦の途中の保存（battle_checkpoint.js）：段の関数を順に流して段の始まりを作り直す
  spawn: { x: 4, z: EDGE.z + 18, heading: Math.PI },
  // K564（11/21 クラウド）：城の小物が升（32m）ごとに六つ未満で束にならず一つずつ描いていた（iPhone 見なし 251 回）。升を広げ三つから束ねる
  staticBatchCell: 64, staticBatchMinN: 3,
  quietArmyCalls: true,   // K358（検品 11/17）：守る戦・忍ぶ戦で備ひとつの崩れに「味方が追撃に移った」の字が浮いた
  depth: suwaDepth,   // 徳川の囲みと城兵に名と兵数（docs/fujin/suwahara.md）
  // 一太刀の最低被害は meleeGrace の後に掛かる。戦の倍率も指定し、侍の六割を二割四分まで抑える（11/11：馬出の出撃で109秒に討死）。
  playerTaken: 0.4,
  // 刃の被害枠は命の四分の一まで、毎秒五分ずつ戻し、次の刃まで間を空ける。
  meleeGrace: { rate: 0.05, burst: 0.25, interval: 2.5 },
  world: {
    noFake: true,   // 11/18 K285（kaito「本物の兵しか映したらいけない」）：諏訪原だけ残っていた絵だけの兵（farHost の囲み九つ・backOf の後詰め）を作らない。映る兵は全員 戦の中の本物（描かずに数えて 0秒 4164・90秒 3152 人あった）
    // 近い主人公にも射撃停止の下知を守り、斉射後の支度の間を確保する。
    strictFireOrders: true,
    playerAtkMax: 2,   // K358：三人でも出撃と門の前で囲まれ、act bot が3回とも倒れた   // 11/10 クラウド：act の bot が一〜二分で足軽の槍を四方から浴びて倒れた。同時に打ち込むのを三人まで（共通は四人）
    seed: 75,
    time: 'day',
    water: { x: 112, level: -12 },
    paths: [[[-6, 176], [-2, 130], [2, 90], [4, 62], [2, 30]]],
    height,
    tint(x, z, h, c) {
      // 堀と土塁、城の中は土が出ている
      const dr = Math.hypot(x - UMA.x, z - UMA.z);
      const earth = inHon(x, z) || dr < MIKA.r1 + (Math.abs(Math.atan2(x - UMA.x, z - UMA.z)) < MIKA.span ? 4 : 1.5) || (Math.abs(z - MOAT.z) < MOAT.hw + 1.5 && Math.abs(x) < 38) || (Math.abs(Math.abs(x) - 35) < 4 && z < MOAT.z && z > HON.z0 - 4);
      if (earth) {
        c.setRGB(c.r * 0.55 + 0.17, c.g * 0.5 + 0.13, c.b * 0.45 + 0.08);
        // 11/18 クラウド ⑥：写真で本曲輪の前の土の壁が一色に見えた → 削った法面だけ、高さで重なる地層（赤土・黄土・灰の砂礫）とまだらを出す
        const sl = Math.hypot(height(x + 0.6, z) - height(x - 0.6, z), height(x, z + 0.6) - height(x, z - 0.6)) / 1.2;
        const cut = smooth(0.35, 0.9, sl);
        if (cut > 0) {
          const hh = h + 0.35 * Math.sin(x * 0.21 + z * 0.17);
          const band = Math.sin(hh * 2.9), fine = Math.sin(hh * 9.7 + x * 0.05);
          const mott = 0.5 + 0.5 * Math.sin(x * 1.37 + Math.sin(z * 0.9) * 2) * Math.cos(z * 1.11 - x * 0.3);
          const k = cut * (0.85 + 0.15 * mott);
          const r = band > 0.35 ? 1.12 : band < -0.45 ? 0.82 : 1, g = band > 0.35 ? 0.98 : band < -0.45 ? 0.84 : 1, b = band > 0.35 ? 0.86 : band < -0.45 ? 0.88 : 1;
          const f = 1 + 0.05 * fine - 0.08 * (1 - mott);
          c.setRGB(c.r * (1 - k + k * r * f), c.g * (1 - k + k * g * f), c.b * (1 - k + k * b * f));
        }
      }
      // 堀の底は湿って黒ずむ（台地の高さより低い所）
      const low = 7 * smooth(58, 6, z) - h;
      if (earth && low > 1) { const k = Math.min(1, (low - 1) / 1.8); c.setRGB(c.r * (1 - 0.4 * k), c.g * (1 - 0.38 * k), c.b * (1 - 0.3 * k)); }
      if (true) {
        // 暗くするだけでは地面の草の割合が残る。掘った深さから底を選び、湿った褐色の裸地にする。
        // 三日月堀の端と土橋は、地形と同じ式で除く。法面の草は残す。
        const ang = Math.abs(Math.atan2(x - UMA.x, z - UMA.z));
        const crescent = trap(Math.abs(dr - (MIKA.r0 + MIKA.r1) / 2), (MIKA.r1 - MIKA.r0) / 2, 2.6)
          * clamp01((MIKA.span + .12 - ang) / .2);
        const front = trap(Math.abs(z - MOAT.z), MOAT.hw, 2.6) * smooth(39, 35, Math.abs(x)) * smooth(2.6, 5.2, Math.abs(x));
        const side = trap(Math.abs(Math.abs(x) - 35.5), 3.4, 2.4) * smooth(MOAT.z + 2, MOAT.z - 1, z) * smooth(HON.z0 - 6, HON.z0 - 2, z);
        const bare = smooth(.48, .9, Math.max(crescent, front, side));
        if (bare > 0) {
          const stain = .94 + .06 * Math.sin(x * .83 + Math.sin(z * .6)) * Math.cos(z * 1.17);
          c.setRGB(c.r * (1 - bare) + .30 * stain * bare,
            c.g * (1 - bare) + .245 * stain * bare, c.b * (1 - bare) + .175 * stain * bare);
        }
      }
      // 寄せ手の踏み荒らした坂
      if (Math.abs(x) < 40 && z > -2 && z < 60) c.setRGB(c.r * 0.85 + 0.05, c.g * 0.85 + 0.04, c.b * 0.8 + 0.02);
      // 崖の岩肌
      if (x > 78 || z < -110) c.setRGB(c.r * 0.7 + 0.1, c.g * 0.7 + 0.09, c.b * 0.7 + 0.08);
    },
    clear: (x, z) => (Math.abs(x) < 68 && z > -96 && z < 96) || Math.hypot(x - 108, z - 118) < 34,   // 後は東の村
    trees: 320,
    tufts: 3800,
    treeDensity: (x, z) => (z < -100 || x < -80 ? 1 : 0.4),
    groves: [{ x: -110, z: -40, r: 16, n: 26 }, { x: -95, z: 70, r: 14, n: 20 }, { x: 40, z: -120, r: 14, n: 18 }],
  },

  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    F.step = 0;

    // ---- 城：本曲輪の土塀と枡形（team 1。プレイヤーの側からは壊せない）----
    const none = () => new THREE.Group();   // 形はあとで一つにまとめる
    const wallOpt = { team: 1, hp: 1e9, name: '塀', mesh: none, segLen: 5 };
    const G1 = GATE.w / 2, G2 = GATE2.w / 2;
    F.walls = [
      ...wallLine(rt, [[HON.x0, HON.z1], [GATE.x - G1, HON.z1]], wallOpt),
      ...wallLine(rt, [[GATE.x + G1, HON.z1], [HON.x1, HON.z1]], wallOpt),
      ...wallLine(rt, [[HON.x1, HON.z1], [HON.x1, HON.z0], [HON.x0, HON.z0], [HON.x0, HON.z1]], wallOpt),
      // 枡形：一の門をくぐると四角い囲い。二の門は東の辺にあり、右へ折れて通る
      ...wallLine(rt, [[-MASU.hw, HON.z1], [-MASU.hw, MASU.zN], [MASU.hw, MASU.zN], [MASU.hw, GATE2.z - G2]], wallOpt),
      ...wallLine(rt, [[MASU.hw, GATE2.z + G2], [MASU.hw, HON.z1]], wallOpt),
    ];
    F.gate = rt.army.addStruct({ seg: [GATE.x - G1, GATE.z, GATE.x + G1, GATE.z], nx: 0, nz: 1, hp: 1300, maxHp: 1300, armor: 0.2, team: 1, name: '一の門' });
    F.gate2 = rt.army.addStruct({ seg: [GATE2.x, GATE2.z - G2, GATE2.x, GATE2.z + G2], nx: -1, nz: 0, hp: 900, maxHp: 900, armor: 0.2, team: 1, name: '二の門' });
    F.gate.mesh = tobira(W, GATE.x, GATE.z, GATE.w - 0.1, 0); F.gate2.mesh = tobira(W, GATE2.x, GATE2.z, GATE2.w - 0.1, -Math.PI / 2);   // 閉じた扉（外は寄せ手の側）
    rt.scene.add(F.gate.mesh, F.gate2.mesh);
    // 丸馬出：半円の土塁の上に柵（脇に口が二つ。北は土橋へ抜ける）
    const arc = [];
    for (let i = 0; i <= 14; i++) {
      const a = -UMA.span + (2 * UMA.span * i) / 14;
      arc.push([UMA.x + Math.sin(a) * UMA.r, UMA.z + Math.cos(a) * UMA.r]);
    }
    F.uma = wallLine(rt, arc, { team: 1, hp: 1e9, name: '馬出の柵', segLen: 3, mesh: palisade });   // 区画ごとの形を作らせ、下で一つにまとめる（束にすると geometry が無い）
    const pal = F.uma.map((s) => s.mesh);
    const palM = new THREE.Mesh(mergeGeometries(pal.map((m) => m.geometry)), pal[0].material);
    palM.castShadow = true; palM.receiveShadow = true; palM.userData.camBlock = true;
    for (const s of F.uma) { rt.scene.remove(s.mesh); s.mesh = null; }
    rt.scene.add(palM);
    if (true) {
      // 半円の土塁の両法面。盛り土の高さ・脇の口は変えず、草と露出した土を共通材質で描く。
      const bank = makeSimpleBatch();
      for (let i = 0; i < arc.length - 1; i++) {
        const [ax, az] = arc[i], [bx, bz] = arc[i + 1];
        const a = -UMA.span + 2 * UMA.span * (i + .5) / 14;
        for (const s of [-1, 1]) dorui(W, [ax, az, bx, bz], Math.sin(a) * s, Math.cos(a) * s, { w: 2.5, surfaceOnly: true, batch: bank });
      }
      // 三日月堀の内岸・外岸。枯れ草から湿った土へ下り、平らな堀底は覆わない。
      // 堀の端で浅くなる区間と脇の出撃口は空ける。馬出の法面と同じ束にまとめる。
      const steps = 24, span = MIKA.span - .08;
      for (let i = 0; i < steps; i++) {
        const a = -span + 2 * span * i / steps, b = -span + 2 * span * (i + 1) / steps;
        const mid = (a + b) / 2;
        for (const [r, dir] of [[MIKA.r0, 1], [MIKA.r1, -1]]) {
          const seg = [UMA.x + Math.sin(a) * r, UMA.z + Math.cos(a) * r,
            UMA.x + Math.sin(b) * r, UMA.z + Math.cos(b) * r];
          dorui(W, seg, Math.sin(mid) * dir, Math.cos(mid) * dir, { w: 2.6, surfaceOnly: true, batch: bank });
        }
      }
      finalizeSimpleBatch(rt, bank);
      // 土橋の両脇に堀障子を残す。脇の出撃口と中央の通り道には置かない。
      for (const s of [-1, 1]) rt.scene.add(uneBori(W, s * 9, s * 29, MOAT.z - 1.2, MOAT.z + 1.2, { gap: 4, h: .65 }));
    }

    // 動かない城の形はまとめて数個の形にする（塀は十区画ずつ、門・櫓・館・蔵は一つずつ。カメラの当たりも軽く）
    const one = (fn) => { const pp = []; fn(pp); rt.scene.add(mesh(pp)); };
    // 塀の見た目：続いてまっすぐな区画を一本にまとめ、props.js の土塀で描く（土の城なので門の脇も土壁の台）
    const runs = [];
    for (const w of F.walls) {
      const r = runs[runs.length - 1], q = w.seg;
      if (r && Math.hypot(r[2] - q[0], r[3] - q[1]) < 0.01 && Math.abs(Math.atan2(r[3] - r[1], r[2] - r[0]) - Math.atan2(q[3] - q[1], q[2] - q[0])) < 0.01) { r[2] = q[2]; r[3] = q[3]; } else runs.push([...q]);
    }
    for (const r of runs) rt.scene.add(dobei(W, r, { ita: true }));
    rt.scene.add(kabukimon(W, GATE.x, GATE.z, GATE.w, 0, { doors: false }));
    rt.scene.add(true
      ? yaguramon(W, GATE2.x, GATE2.z, GATE2.w, -Math.PI / 2, { doors: false, earth: true, inside: false, noKit: true })
      : kabukimon(W, GATE2.x, GATE2.z, GATE2.w, -Math.PI / 2, { doors: false }));
    if (true) one((pp) => {
      // 土橋と同じ道幅・高さに木橋の床板と桁を重ねる。移動の当たりを追加しない。
      // 中央の桁で板を継ぎ、乾いた灰茶と濡れた木口を板ごとに描き分ける。
      // 頂点色だけで汚し、材質と描く回数は増やさない。
      const board = bridgeBoard(2.38, .16, .36), tone = new THREE.Color();
      for (let i = 0; i < 18; i++) {
        const z = MOAT.z - 3.5 + i * .4;
        for (const side of [-1, 1]) {
          const g = board.clone(), p = g.attributes.position, c = g.attributes.color;
          const shade = .86 + (Math.sin(i * 7.3 + side * 2.1) * .5 + .5) * .23;
          for (let k = 0; k < p.count; k++) {
            // 木口と板の側面は湿って暗く、踏み面は灰色に褪せる。
            tone.setRGB(c.getX(k), c.getY(k), c.getZ(k)).multiplyScalar(shade);
            if (p.getX(k) * side < 0) tone.multiplyScalar(.82);
            c.setXYZ(k, tone.r, tone.g, tone.b);
          }
          g.translate(side * 1.2, W.heightAt(0, z) + .1, z); pp.push(g);
        }
      }
      board.dispose();
      for (const x of [-2.15, 0, 2.15]) {
        const beam = new THREE.BoxGeometry(.24, .3, 7.5); beam.translate(x, W.heightAt(x, MOAT.z) - .15, MOAT.z); pp.push(paint(beam, 0x4f3d2a));
      }
      // 写真の木橋のように細い橋脚と二段の横木を付ける。床の外へ置き、通れる幅を保つ。
      const post = new THREE.BoxGeometry(.14, 1.05, .14);
      for (const x of [-2.34, 2.34]) {
        for (const z of [MOAT.z - 3.4, MOAT.z - 1.2, MOAT.z + 1.2, MOAT.z + 3.4]) {
          const deckY = W.heightAt(0, z) + .18;
          const g = post.clone(); g.translate(x, deckY + .5, z); pp.push(paint(g, 0x65543e));
        }
        for (const up of [.43, .9]) {
          const g = new THREE.BoxGeometry(.09, .1, 7.4), p = g.attributes.position;
          g.translate(x, 0, MOAT.z);
          for (let k = 0; k < p.count; k++) p.setY(k, p.getY(k) + W.heightAt(0, p.getZ(k)) + .18 + up);
          g.computeVertexNormals(); pp.push(paint(g, 0x6e5b42));
        }
        for (const z of [MOAT.z - 1.8, MOAT.z + 1.8]) {
          const top = W.heightAt(0, z) - .05, foot = W.heightAt(x, z) - .25;
          if (top <= foot) continue;
          const g = new THREE.BoxGeometry(.22, top - foot, .22);
          g.translate(x, (top + foot) / 2, z); pp.push(paint(g, 0x493b2c));
        }
      }
      post.dispose();
    });
    for (const [x, z] of TOWERS) rt.scene.add(yagura(W, x, z));   // 隅の井楼櫓（上に弓・鉄砲）
    one((pp) => yakata(pp, W, -12, -64, 13, 7));
    one((pp) => { kura(pp, W, 18, -57, 6, 4.5); kura(pp, W, 20, -68, 5, 4, Math.PI / 2); });
    // 11/18 クラウド：館と蔵は形だけで、兵が壁を抜けて歩けた。縁側の大きさで当たりを置く（units.js collide が押し戻す）
    solidRect(-12, -64, 14.6, 8.6); solidRect(18, -57, 6.3, 4.8); solidRect(20, -68, 5.3, 4.3, Math.PI / 2);
    // 小さな物（逆茂木・乱杭・竹束）は一つにまとめ、カメラの当たりにはしない
    const P = [];
    // 逆茂木：馬出の柵の外と、空堀の外の縁
    for (let a = -1.55; a <= 1.56; a += 0.2) sakamogi(P, W, UMA.x + Math.sin(a) * 11, UMA.z + Math.cos(a) * 11, a);
    for (const s of [-1, 1]) for (let x = 17; x <= 33; x += 3.2) sakamogi(P, W, s * x, MOAT.z + MOAT.hw + 1.4, 0);
    // 乱杭：三日月堀と空堀の底
    for (let k = 0; k < 46; k++) {
      const a = -1.12 + (2.24 * k) / 45 + Math.sin(k * 7.1) * 0.03, r = (MIKA.r0 + MIKA.r1) / 2 + ((k * 5) % 3 - 1) * 1.3;
      rankui(P, W, UMA.x + Math.sin(a) * r, UMA.z + Math.cos(a) * r, k);
    }
    for (let k = 0; k < 36; k++) { const x = (k < 18 ? -1 : 1) * (7 + (k % 18) * 1.55); rankui(P, W, x, MOAT.z + ((k * 7) % 5 - 2) * 0.5, k + 50); }
    // 三日月堀の底の溜まり水（杭の足もとを濁った水が浸す）。弧の形の一枚で、高さは底に沿わせる
    {
      const mid = (MIKA.r0 + MIKA.r1) / 2, span = MIKA.span - 0.06;
      const wg = new THREE.RingGeometry(mid - 1.3, mid + 1.3, 40, 1, -span - Math.PI / 2, 2 * span);
      wg.rotateX(-Math.PI / 2);
      const pa = wg.attributes.position;
      for (let i = 0; i < pa.count; i++) {
        const lx = pa.getX(i), lz = pa.getZ(i), a = Math.atan2(lx, lz);
        pa.setY(i, W.heightAt(UMA.x + Math.sin(a) * mid, UMA.z + Math.cos(a) * mid) + 0.4);
        pa.setX(i, lx + UMA.x); pa.setZ(i, lz + UMA.z);
      }
      wg.computeVertexNormals();
      const water = new THREE.Mesh(wg, new THREE.MeshStandardMaterial({ color: 0x3b4236, roughness: 0.12, metalness: 0.2, transparent: true, opacity: 0.88 }));
      water.receiveShadow = true;
      rt.scene.add(water);
    }
    // 竹束：寄せ手が堀の手前に並べた盾
    for (let x = -26; x <= 26; x += 4.5) if (Math.abs(x) > 3) takeTaba(P, W, x + Math.sin(x) * 0.6, 10 + Math.cos(x * 0.7) * 1.2, Math.PI + Math.sin(x) * 0.12);
    const small = mesh(P);
    small.userData.camBlock = false;
    rt.scene.add(small);
    // 物見櫓と足軽小屋・兵糧の俵
    rt.scene.add(yagura(W, -22, -80), yagura(W, 22, -82));
    rt.scene.add(hut(W, -2, -78, 8, 4.5, 0));
    // 11/19 04:30 クラウド：俵が蔵の南の角の外（kuraWay が回る角 (13.4,-60.9)・(22.7,-60.9)）に掛かり、角へ向かう城兵が俵に押し付いて (15,-60) で隊速0の二十秒（03:10 の未①）。俵を一歩半南へ置き、角と蔵の壁の間を通れる幅（二m）にする
    rt.scene.add(tawara(W, 14, -62.5, 0.3, 6), tawara(W, 23, -62.5, -0.2, 4));
    // 武田の旗と幟
    for (const [x, z, k] of [[-22, -37, 'takeda'], [-14, -37, 'furin'], [14, -37, 'takeda'], [22, -37, 'furin'], [-5, -13, 'takeda'], [5, -13, 'takeda'],
      [-6, -44, 'takeda'], [6, -44, 'furin'], [-18, -59, 'furin'], [-6, -59, 'takeda'], [10, -74, 'takeda']]) rt.scene.add(nobori(W, x, z, k, 5.5));

    // ---- 寄せ手の陣：大久保の陣幕と、殿（家康）の本陣 ----
    rt.scene.add(jinmaku(W, -30, 62, 14, 10, 5));
    // 家康の本陣：見に行けば家康と旗本がいる（後ろの控えは下の DA(0, 152) の軽い兵）
    F.hqCamp = camp(rt, { x: 0, z: 128, facing: Math.PI, team: 0, faction: 'tokugawa', mon: 'tokugawa', armor: 0x24221f, general: { name: '徳川家康' }, guard: 15, reserve: 0, runTo: { x: -8, z: 60 } });
    // 本陣と旗本は前線への寄せから外す。供回りだけが引き出され、陣幕の内で一点に詰まるのを防ぐ。
    for (const g of [F.hqCamp.general?.group, F.hqCamp.guard]) {
      if (!g) continue;
      g.stay = true;
      g.guard = true;
      g.noFrontline = true;
    }
    for (const [x, z, k, h] of [[-25, 56, 'okubo', 6], [-35, 56, 'okubo', 6], [-12, 117, 'onri', 7], [12, 117, 'tokugawa', 6.5], [-18, 44, 'tokugawa', 5], [16, 44, 'tokugawa', 5], [30, 40, 'katabami', 5]]) rt.scene.add(nobori(W, x, z, k, h));
    // 遠景の村（東の茶畑の下の在所）
    KIT.farVillage(rt, 104, 118, { rot: Math.PI / 2, n: 5, fields: 6, seed: 14, autumn: true });

    // ---- 大軍：城を囲む徳川勢と、城に籠もる武田勢（軽い作り） ----
    const DA = (x, z, w, d, count, facing, armor, flag, seed, kind) => KIT.farHost(rt, x, z, w, d, count, facing, armor, flag, seed, kind);
    const TK = 0x24221f;
    F.mainDA = DA(0, 88, 70, 18, 320, Math.PI, TK, 'tokugawa', 81, 'mixed');
    // 11/18 22:45 クラウド：囲みの入れ物に敵味方が付いておらず、共通の手（depth_real.js）が「味方か敵か分からない」と九つとも本物にしなかった（描かずの数え why.team 9）。
    //   人数の札は味方 7,950 なのに、storm で本人が待つ土橋の手前 (0,18) の周りに味方が一人も映らなかった（写真の悪い所②）。大手の本隊だけ味方に付ける
    if (F.mainDA.army) F.mainDA.army.team = 0;
    DA(0, 152, 60, 16, 240, Math.PI, TK, 'onri', 82, 'spear');
    F.sideDA = [DA(-56, 34, 22, 30, 220, 2.44, TK, 'okubo', 83, 'spear'), DA(54, 32, 22, 30, 220, -2.44, TK, 'katabami', 84, 'spear')];
    DA(-64, -40, 16, 44, 220, Math.PI / 2, TK, 'tokugawa', 85, 'spear');
    DA(-52, -104, 30, 14, 160, 0.9, TK, 'tokugawa', 86, 'mixed');
    DA(58, -40, 12, 36, 150, -Math.PI / 2, TK, 'tokugawa', 87, 'spear');
    // 西の台地の果てに、高天神の方から来た武田の騎馬の塊が見える（軽い作り。kaito 0929）
    DA(-128, -64, 44, 22, 260, Math.PI / 2, 0x3a2622, 'takeda', 88, 'cavalry');
    DA(-136, -10, 30, 18, 180, Math.PI / 2, 0x8e1f16, 'akazonae', 89, 'cavalry');
    // 本曲輪の奥に詰める城兵
    // 11/18 K285：noFake では空の囲みを共通の手（depth_real.js）が本物の「遠くの備」に替える。本曲輪の奥詰めは崩れず退かない備になり、
    //   act bot が storm で本曲輪の城兵と挟まれ倒れた（受けた傷の二百余りが遠くの備から）。奥の城兵は本物の本曲輪の城兵（F.hon・F.hon2）が受け持つので、ここは兵の無い呼び口だけにする。
    F.garDA = rt.def.world?.noFake ? rt.world.emptyDistantArmy({ x: 0, z: -81, facing: 0, flag: 'takeda' }) : DA(0, -81, 44, 8, 140, 0, 0x3a2622, 'takeda', 88, 'spear');

    // ---- 味方 ----
    const n = RANKS[rt.G.rank].squad;
    if (n) {
      const bows = Math.round(n * (rt.G.bowRatio ?? 0.33));
      rt.makeSquad({ x: 4, z: EDGE.z + 23 }, Math.PI, [{ kind: 'spear', n: n - bows }, { kind: 'bow', n: bows }]);
    }
    const ok = allyGroup(rt, { faction: 'tokugawa', name: '大久保組', anchor: { x: -8, z: 28 }, facing: Math.PI, width: 8, aggro: 9, noRout: true },
      [{ type: 'samurai', n: 1, o: { name: '大久保忠世', invuln: true, horse: true } }, { type: 'ashigaru', n: 16 }]);
    F.okG = ok;   // 陣立ての表（suwahara/depth.js）が名と兵数を結ぶ
    F.okubo = ok.units[0];
    F.okuboG = ok;
    F.left = allyGroup(rt, { faction: 'tokugawa', name: '先手・左', anchor: { x: -24, z: 24 }, facing: Math.PI, width: 8, aggro: 8, noRout: true },
      [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 10 }, { type: 'bow', n: 4 }, { type: 'gun', n: 2 }]);
    F.right = allyGroup(rt, { faction: 'tokugawa', name: '先手・右', anchor: { x: 22, z: 24 }, facing: Math.PI, width: 8, aggro: 8, noRout: true },
      [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 10 }, { type: 'gun', n: 6 }]);
    F.ram = allyGroup(rt, { faction: 'tokugawa', name: '門破りの組', anchor: { x: -14, z: 26 }, facing: Math.PI, width: 5, aggro: 3, noRout: true, formation: 'column' },
      [{ type: 'samurai', n: 1, o: { name: '門破りの頭 本多作左' } }, { type: 'ashigaru', n: 14, o: { hat: 'jingasa_n' } }]);

    // ---- 城兵（武田） ----
    // 丸馬出の守り：柵の内から鉄砲・弓。出撃隊と違い、退く相手を追って持ち場を離れない。
    F.umaG = enemyGroup(rt, { faction: 'takeda', name: '馬出の守り', anchor: { x: 0, z: -14.5 }, facing: 0, width: 7, aggro: 5, noRout: true, stay: true, noAI: true, interiorHold: true },
      [{ type: 'samurai', n: 1 }, { type: 'gun', n: 3 }, { type: 'bow', n: 3 }, { type: 'ashigaru', n: 9 }]);
    // 枡形の奥の塀の内：弓と鉄砲（一の門を破って枡形に入った者を上から撃つ）
    // 11/17 act bot：持ち場を離れて二の門の裏 (9,-43) へ回り、閉じた門に六人が重なって止まった → 塀の内の持ち場で構えて射る（stay・interiorHold・hold）
    F.wallG = enemyGroup(rt, { faction: 'takeda', name: '大手の守り', anchor: { x: 0, z: MASU.zN - 5 }, facing: 0, width: 12, aggro: 0, noRout: true, stay: true, interiorHold: true, order: 'hold' },
      [{ type: 'gun', n: 2 }, { type: 'bow', n: 5 }]);
    // 櫓の上の射手（足を止め、櫓の床の高さに立たせる）
    F.towerU = [];
    TOWERS.forEach(([x, z], i) => {
      const g = enemyGroup(rt, { faction: 'takeda', name: '櫓', anchor: { x, z }, facing: 0, width: 2, spacing: 1.1, aggro: 0, noRout: true },
        [{ type: i ? 'gun' : 'bow', n: 2 }, { type: 'bow', n: 2 }]);
      g.units.forEach((u, k) => {
        u.pos.x = x + (k % 2 ? 0.55 : -0.55); u.pos.z = z + (k < 2 ? 0.55 : -0.55);
        u.speed = u.run = 0; u.tower = { x, z };
        // 11/18 17:45 クラウド：櫓の床に据える（共通の perch：足もとを止め、行き先を持たない）。据えずにいると櫓の弓に地の行き先 (-18,-45) が付き、
        //   隊速0のまま「行き先があるのに20秒動かない兵」と数えられた（act bot 信長で出陣 204秒 (-25,-39)）
        u.perch = { x: u.pos.x, y: rt.world.heightAt(x, z) + DECK() + 0.08, z: u.pos.z };
        F.towerU.push(u);
      });
    });
    // 城からの鉄砲・矢は、当たれば痛いが一発では倒れない強さに
    for (const g of [F.umaG, F.wallG, ...TOWERS.map((_, i) => F.towerU[i * 4].group)]) {
      g.dmgMult = 0.42;
      for (const u of g.units) {
        if (u.type === 'gun') u.dmg *= 0.38;
        // 門破りに入るまでの連続被弾で倒れたため、守備の弓も一矢の傷を抑える。
        if (u.type === 'bow') u.dmg *= 0.6;
        // 馬出の弓三人が短い間隔で射続けると、退いても次の矢を受け続ける。射直しの間を空ける。
        if (g === F.umaG && u.type === 'bow') u.cdBase = 6;
      }
    }
    // 本曲輪：城将・今福浄閑と城兵（門が破れるまでは奥に控え、塀越しの矢の届かない所にいる）
    // 門が閉じている間は共通の出撃判断に任せず、塀際への追撃・密集を防ぐ。
    F.hon = enemyGroup(rt, { faction: 'takeda', name: '本曲輪の城兵', anchor: { x: 2, z: -70 }, facing: 0, width: 9, aggro: 3, stay: true, noAI: true, interiorHold: true, fleeDir: { x: 0, z: -1 } },   // 11/18：下の奥の城兵と同じ（東の角から塀の外へ抜けて跳ね戻った）
      [{ type: 'busho', n: 1, o: { name: '今福浄閑' } }, { type: 'samurai', n: 5 }, { type: 'ashigaru', n: 22 }]);
    F.jokan = F.hon.units[0];
    // 名乗りと討ち取りは門が破れてから（塀越しに討たれないように）
    F.jokan.announced = true; F.jokan.invuln = true;
    // 城攻めの段（siege_stages.js・docs/siege_honjin_spec_1107.md 5・13章）：馬出 → 一の門 → 枡形の二の門 → 本曲輪。
    //   今の段の守りだけが打って出て、奥は持ち場で構えて待つ。段が長引けば使番が知らせる（11章）
    F.stages = siegeStages(rt, [
      { groups: [F.umaG], at: { x: 0, z: HON.z1 + 6 }, done: () => F.step >= 3, report: '馬出の守り、まだ崩れませぬ！', reportAfter: 80 },
      { gate: F.gate, groups: [F.wallG, ...TOWERS.map((_, i) => F.towerU[i * 4].group)], at: { x: 0, z: MASU.zN + 2 }, report: '一の門、まだ破れず！', reportAfter: 60 },
      { gate: F.gate2, groups: [], at: { x: 2, z: -60 }, report: '二の門、まだ破れず！　枡形で横矢を受けております！', reportAfter: 50 },
      { groups: [F.hon], at: { x: 2, z: -70 }, done: () => false },
    ], { runner: '使番' });

    rt.setPhase('brief');
    rt.obj('main', '三日月堀を越え、城将今福浄閑を討て', 'main');   // K358（検品）：携帯の二行で「…城将今福…」と切れた
    rt.obj('loose', '組を散開させて堀へ寄せよ', 'side');
    rt.say('大久保忠世', `${nm(rt)}、あれが諏訪原の城じゃ。大井川を見下ろす台地の端に建っておる`, 4.5);
    rt.say('大久保忠世', '正面は丸馬出、まわりは三日月堀じゃ。横から打って出るぞ', 5.5);
    rt.say('大久保忠世', 'その方の組は先手じゃ。堀の際まで寄せ、門破りの者どもを大手門へ通す', 4.5);
    rt.say('大久保忠世', '左右の口から出る敵を撃て。押し返した隙に門へ寄せよ', 5);
    rt.after(17, () => this.approach(rt));
  },

  // ① 三日月堀の際まで寄せる
  approach(rt) {
    const F = rt.flags;
    if (F.step >= 1) return;
    F.step = 1; F.stepT = rt.t;
    rt.setPhase('approach');
    sfx('taiko', 1);
    rt.banner('寄せよ', '三日月堀の際まで');
    rt.obj('main', '組を率い、城の前の三日月堀の際まで寄せる', 'main');
    rt.say('大久保忠世', '寄せよ！　城の鉄砲と矢が来る。固まって歩けば的になるぞ', 4);
    rt.say('大久保忠世', '組を散らせ。散開すれば鉄砲も矢も当たりにくい', 4);
    rt.say('', typeof isTouch !== 'undefined' && isTouch ? '号令の「陣形」で、横陣、縦陣、散開の順に替わる。散開して矢玉を避けよ' : '号令を開き、９の「陣形」で横陣、縦陣、散開と替えよ。散開して矢玉を避けよ', 7);
    rt.zone('edge', EDGE.x, EDGE.z, EDGE.r);
    rt.marker('edge', { x: EDGE.x, z: EDGE.z }, '三日月堀の際', { h: 2.5 });
    // 味方の先手も堀の手前まで出る
    const go = (g, x, z) => { g.order = 'move'; g.dest = { x, z }; g.speed = 2.6; g.facing = Math.PI; g.onArrive = (gg) => { gg.order = 'hold'; gg.anchor = { x, z }; gg.aggro = 8; }; };
    go(F.okuboG, -9, 8); go(F.left, -24, 6); go(F.right, 22, 6); go(F.ram, -15, 17);
    // 後ろの大勢も、堀へ向かって押し出す
    F.mainDA.advance(18, 16);
  },

  // ② 丸馬出から打って出る
  sortie(rt) {
    const F = rt.flags;
    if (F.step >= 2) return;
    F.step = 2; F.stepT = rt.t;
    rt.setPhase('sortie');
    rt.unzone('edge'); rt.unmark('edge');
    rt.award((t) => t.side.push('堀の際まで寄せた'), '堀の際まで寄せた');
    rt.say('大久保忠世', 'よし、ここで踏みとどまれ！　……むっ、馬出の脇の口が開いたぞ', 3.5);
    // 大久保組にも、寄せの持ち場から脇口へ進む下知を出す。
    // 三日月堀の外を通り、脇の出撃口を味方の槍と鉄砲で押さえる。
    for (const [g, x] of [[F.okuboG, -17], [F.left, -21], [F.right, 21]]) {
      g.order = 'move'; g.dest = { x, z: -15 }; g.speed = 2.6;
      g.onArrive = (gg) => { gg.order = 'hold'; gg.anchor = { x, z: -15 }; gg.aggro = 12; gg.facing = Math.PI; };
      for (const u of g.units) u.aiT = 0;
    }
    rt.after(3, () => {
      F.sorties = [-1, 1].map((s) => {
        // 出撃隊は脇口から攻める下知を守る。射手の護衛へ転じると、閉じた大手門の塀際まで戻って止まる。
        // 11/18 ム三：act bot「6分で2人・斬り合う相手が少ない」。出撃の足軽を各十一→十五人に。
        const g = enemyGroup(rt, { faction: 'takeda', name: '馬出の出撃', anchor: { x: s * 4.5, z: -23.5 }, facing: s * Math.PI / 2, width: 5, aggro: 10, morale: 90, noAI: true, fleeDir: { x: s, z: 0.15 } },
          [{ type: 'samurai', n: 1, o: { horse: true } }, { type: 'cavalry', n: 2 }, { type: 'samurai', n: 1 }, { type: 'ashigaru', n: 15 }]);
        g.order = 'move'; g.dest = { x: s * 17, z: -23.5 }; g.speed = 3.4; g.dmgMult = 0.55;   // K358：0.8 から（act bot が出撃に囲まれて倒れた）
        // 脇口を押さえる先手と戦い、退いた主人公を援護の届かない所まで追わない。
        // 持ち場を基準に敵を選び、本人へ寄せる共通の処理にも持ち場を渡す。
        g.onArrive = (gg) => { gg.order = 'hold'; gg.aggro = 12; gg.interiorHold = true; gg.facing = 0; };
        // 11/18 K285：noFake では後詰めの絵が共通の手（depth_real.js）で崩れない本物の「遠くの備」になり、馬出の中に重なって立ち、storm まで本人を突いた。noFake の時は後詰めを付けない
        if (!rt.def.world?.noFake) KIT.backOf(rt, g, { flag: 'takeda', armor: 0x3a2622, kind: 'spear', w: 8, depth: 8, count: 50, gap: 3, seed: 91 + s });
        return g;
      });
      sfx('taiko', 1);
      rt.army.play('eshout', { x: 0, z: -18 }, 2);
      rt.banner('丸馬出より打って出る', '左右の脇の口から');
      rt.say('足軽', '馬出から出てきたぞ！　左右から回り込んでくる！', 3);
      rt.say('大久保忠世', '受け止めよ！　槍を揃えて押し返せ！', 3);
      rt.obj('main', '丸馬出から出る城兵を受け止め、押し返す', 'main');
      rt.obj('sortie', '打って出た敵を崩せ', 'side');
      F.sorties.forEach((g, i) => rt.marker('so' + i, centerOf(g), () => `打って出た敵・${moraleWord(g.morale)}`, { red: true, group: g }));
      // 一斉射：脇の口から出て横に回る所を、先手の鉄砲が揃えて撃つ（勝ち筋：出てきた所が一番脆い）
      rt.after(3.5, () => volley(rt, [F.left, F.right], { who: '大久保忠世', waitLine: '脇の口から出た所を狙え。まだ撃つな……', wait: 2.2, line: '先手の鉄砲、放てぇっ！', banner: ['一斉射', '先手の鉄砲が、馬出から出た敵へ揃えて放つ'], r: 60, hit: 26 }));
    });
  },

  // ③ 門破り
  breach(rt, pushedBack) {
    const F = rt.flags;
    if (F.step >= 3) return;
    F.step = 3; F.stepT = rt.t;
    rt.setPhase('breach');
    rt.unmark('so0'); rt.unmark('so1');
    if (pushedBack) {
      rt.objDone('sortie');
      rt.award((t) => t.side.push('馬出の出撃を押し返した'), '副任務：馬出の出撃を押し返した');
    } else rt.objFail('sortie');
    sfx('horagai', 0.9);
    rt.banner('門を破れ', '門破りの組、大手の一の門へ');
    for (const m of F.sideDA) m.advance(14, 9, { charge: true });
    rt.say('大久保忠世', pushedBack ? 'ようやった！　敵は馬出へ逃げ込んだ。今じゃ、門破りを通せ！' : '構うな、今のうちに門破りを通すぞ！', 4);
    rt.say('大久保忠世', `${nm(rt)}、門破りを守れ。馬出の脇から土橋を渡って一の門。奥は右へ折れて二の門じゃ`, 6);
    rt.obj('main', '門破りの組を守り、大手の一の門・二の門を破る', 'main');
    rt.obj('guard', '門破りの組を半分より多く生かして、門を破れ', 'side');
    F.rams = [F.ram];
    F.ramN0 = F.ram.count;
    // 11/18 cloud-34 の見回り（150〜200秒に本人が野にひとり・塊が写らない）：門の段は本人のすぐ後ろに大久保の槍組（本物二十人）が付き従い、本人と一つの塊で門へ寄せる
    if (!rt.G.lord) {
      const P0 = rt.player.u.pos;
      F.escortG = allyGroup(rt, { faction: 'tokugawa', name: '大久保の槍組', anchor: { x: P0.x, z: P0.z + 5 }, facing: Math.PI, width: 12, aggro: 6, seekRange: 10, noRout: true, order: 'hold', formation: 'line' },
        [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 19, o: { hat: 'jingasa_n' } }]);
      F.escortG.defMult = 2;
    }
    // K358：出撃を押し返した後は、馬出の守りの半分が城内へ退き、残りの打ち込みも浅い（門破りの組が十六人の中を通って毎回全滅し、門の段が止まっていた）
    { let k = 0; for (const u of F.umaG.units) if (u.alive && ++k > 7) rt.army.despawn(u); }
    // 出撃の残りも馬出へ逃げ込む（残しておくと信長で出陣の本人を徳川の陣の奥まで追い、囲んで討った）
    for (const g of F.sorties || []) for (const u of g.units) if (u.alive) rt.army.despawn(u);
    F.umaG.dmgMult = Math.min(F.umaG.dmgMult ?? 1, 0.5);
    // 門破りの組は道すじに沿って門へ。大久保組と左右の先手は馬出の城兵を抑える
    const R = F.ram;
    R.order = 'assault'; R.formation = 'line'; R.aggro = 3; R.defMult = 3;   // K358：門破りは竹束と楯で身を守る
    R.assault = (u) => route(rt, u.pos.x, u.pos.z, { x: 0, z: -40 });
    R.assault.gateOnly = true;
    F.okuboG.order = 'assault'; F.okuboG.aggro = 7;
    // 11/19 07:50 クラウド：一の門が破れた後も大久保組は馬出の内 (0,-16) に着いたまま、門破りが枡形の二の門を打つ間二十秒余り立っていた（act bot breach「着いて待つ」大久保組@6,-15・-3,-18）。
    //   一の門が破れたら枡形の西の半分（二の門の前を塞がない所）へ入り、門破りの背を守る
    F.okuboG.assault = (u) => (F.step === 3 && !F.gate.alive ? (inMasu(u.pos.x, u.pos.z) ? { x: -4, z: -41 } : route(rt, u.pos.x, u.pos.z, { x: -4, z: -41 })) : inUma(u.pos.x, u.pos.z) ? { x: 0, z: -16 } : route(rt, u.pos.x, u.pos.z, { x: 0, z: -44 }));
    // 脇口の外で待機を続けず、左右から馬出へ入り、門へ向かう組を援護する。
    for (const [g, x] of [[F.left, -4], [F.right, 4]]) {
      g.order = 'assault';
      g.assault = (u) => (inUma(u.pos.x, u.pos.z) ? { x, z: -16 } : route(rt, u.pos.x, u.pos.z, { x, z: -16 }));
    }
    for (const g of [F.okuboG, F.left, F.right, R]) {
      g.onArrive = null; g.dest = null;
      for (const u of g.units) u.aiT = 0;
    }
    rt.marker('ram', () => (R.count ? R.center() : F.rams[F.rams.length - 1].center()), () => `門破りの組（${ramCount(F)}人）`);
    rt.marker('gate', () => gateFront(curGate(F), 0), () => `${gateName(F)} ${gatePct(F)}%`, { h: 4.5 });
    F.ramNextT = 0; F.ramWaves = 0;
    // その方の弓組の役目：隅櫓の射手を射落とす（黙らせれば門破りがはかどる）
    rt.obj('towers', '弓組で隅櫓の射手を射落とせ', 'side');
    TOWERS.forEach(([x, z], i) => rt.marker('tw' + i, { x, z, y: rt.world.heightAt(x, z) + DECK() + 1 }, () => `隅櫓の射手 ${F.towerU.filter((u) => u.alive && u.tower.x === x).length}人`, { red: true, h: 2 }));
    rt.after(6, () => {
      rt.say('大久保忠世', '隅櫓の弓と鉄砲が、門破りの者を上から狙うておる。その方の弓組で射落とせ！', 4.5);
      rt.say('', typeof isTouch !== 'undefined' && isTouch ? '隊の札で「弓隊」を選べ。櫓の射手に照準を合わせ、「敵を狙え」じゃ' : '号令の輪で「弓隊」に替えよ。櫓の射手に照準を合わせ、「敵を狙え」じゃ', 7);
    });
    // 門にかかったころ、搦手から城兵が回り込んで門破りを狙う
    rt.after(28, () => this.flankers(rt));
  },

  // 搦手から城兵が堀沿いに回り込み、門破りを狙う（一度目は西、二度目は東）
  flankers(rt, east) {
    const F = rt.flags;
    if (F.step !== 3) return;
    const s = east ? 1 : -1;
    const g = enemyGroup(rt, { faction: 'takeda', name: '搦手の城兵', anchor: { x: s * 46, z: -25 }, facing: -s * Math.PI / 2, width: 4, aggro: 8, order: 'attack', seekRange: 60, noAI: true, dmgMult: 0.5, fleeDir: { x: s, z: 0.2 } },
      [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: east ? 7 : 6 }]);   // K358：十一・九から（門破りの組を外で討ち尽くし、門の段が止まった）
    g.focus = F.rams.flatMap((r) => r.units).find((u) => u.alive) || null;
    // 回り込む城兵の後ろに、同じ旗の控えが堀沿いに続く（軽い作り。数人ずつに見せない）
    if (!rt.def.world?.noFake) KIT.backOf(rt, g, { flag: 'takeda', armor: 0x3a2622, kind: 'spear', w: 8, depth: 10, count: 60, gap: 3, seed: 95 + (east ? 1 : 0) });   // 11/18 K285：上の馬出と同じ訳で noFake の時は付けない
    g._t0 = rt.t;
    F.flanks = [...(F.flanks || []), g];
    F.flank = g;
    rt.banner('搦手より城兵', `${east ? '東' : '西'}の堀沿いから門破りを狙う`);
    rt.say('足軽', `${east ? '東' : '西'}の堀沿いから城兵が回り込んでくる！　門破りの者が危ない！`, 3.5);
    rt.marker('flank', centerOf(g), () => `搦手の城兵・${moraleWord(g.morale)}`, { red: true, group: g });
  },

  // ④ 本曲輪へ
  storm(rt) {
    const F = rt.flags;
    if (F.step >= 4) return;
    F.step = 4; F.stepT = rt.t;
    rt.setPhase('storm');
    // 大手の本隊が三日月堀の際まで詰め、本人が控える土橋の手前 (0,18) の前に立つ（写真の悪い所②：控えの間、本人が空の野に一人で立っていた）
    F.mainDA?.moveTo?.(0, 9, 24);
    if (F.hon) F.hon.dmgMult = Math.min(F.hon.dmgMult ?? 1, 0.4);
    // 門が破れたら、馬出と塀の射手・搦手へ回った城兵は城の奥へ退く（崩れにすると陣の前まで逃げ回りながら射て、信長で出陣の本人が倒れた）
    for (const g of [F.umaG, F.wallG, ...(F.flanks || []), ...(F.sorties || [])]) if (g && g.count) for (const u of g.units) if (u.alive) rt.army.despawn(u);   // K358：本曲輪の城兵は門を破られ浮き足立つ（act bot が押し込んで十数秒で倒れた）
    // 11/19 01:50 クラウド：搦手の城兵の印は門破りの段の中でしか消さず、回り込みの最中に二の門が破れると、兵を退かせた後も本曲輪の段の終わりまで赤い印が残った（act bot「行けず 151秒 搦手の城兵 180秒」）
    rt.unmark('gate'); rt.unmark('ram'); rt.unmark('flank');
    if (F.ram.count > F.ramN0 / 2) { rt.objDone('guard'); rt.award((t) => t.side.push('門破りの組を守った'), '副任務：門破りの組を守った'); } else rt.objFail('guard');
    sfx('horagai', 1);
    rt.banner('二の門、破れる', '本曲輪へ押し込め');
    rt.say('足軽', '二の門が破れたぞーっ！', 2.5);
    rt.say('大久保忠世', '押し込め！　城将の今福浄閑を探せ。討てば城は落ちる！', 4);
    rt.obj('main', '本曲輪へ押し込み、城将今福浄閑を討つ', 'main');
    rt.obj('jokan', '組と今福浄閑を討ち取れ', 'side');
    const target = () => (F.jokan.alive ? { x: F.jokan.pos.x, z: F.jokan.pos.z } : F.hon.center());
    for (const g of [F.okuboG, F.left, F.right, ...F.rams]) {
      g.order = 'assault'; g.aggro = 9; g.noRout = true;
      g.assault = (u) => route(rt, u.pos.x, u.pos.z, target());
      for (const u of g.units) u.aiT = 0;
    }
    // 11/19 08:40 クラウド：大久保の槍組（本物二十人）は門の段の間だけ本人の横へ付き、本曲輪の段は三日月堀の際 (5,6) に六十秒余り立ったままだった（act bot storm 296〜356秒）。本曲輪の段も道すじを通って本人の左右へ付き従う
    if (F.escortG && !gone(F.escortG)) {
      const g = F.escortG; g.order = 'assault'; g.aggro = 9; g.dest = null;
      // 11/21 21:40 クラウド：行き先が本人の左右二点（±2.5）だけで、七人が (8,-45) に一点に重なり止まった（携帯の act bot storm 246秒・重なり6組）。一人ずつ本人の後ろ三列にずらす
      g.assault = (u) => { const P = rt.player.u.pos, s = u.slot | 0, c = s % 5, r = (s / 5 | 0) % 4, sd = (c - 2) * 1.5 + (c < 2 ? -1.2 : c > 2 ? 1.2 : 0); return route(rt, u.pos.x, u.pos.z, { x: P.x + sd, z: P.z + 1.5 + r * 1.4 }); };
      for (const u of g.units) u.aiT = 0;
    }
    F.hon.stay = false; F.hon.noAI = false; F.hon.interiorHold = false;
    F.hon.order = 'assault'; F.hon.assault = (u) => honWay(rt, u); F.hon.seekRange = 30; F.hon.aggro = 18;
    // 寄り所は二の門の内（東）の広い所に。枡形の真北 (0,-52) だと、枡形へ出た城兵が帰る道で枡形の北の塀に当たり (6,-43) に二十余人が重なって止まった
    F.hon.anchor = { x: GATE2.x + 14, z: GATE2.z - 2 };
    for (const u of F.hon.units) u.aiT = 0;
    F.jokan.announced = false; F.jokan.invuln = false;
    rt.marker('jokan', unitPos(F.jokan), '城将・今福浄閑', { red: true });
  },

  // 城将の最後の一戦：浄閑を城兵の塊から出し、旗本と二の門の内（寄せ手の来る所）へ打って出る
  lastStand(rt) {
    const F = rt.flags;
    F.lastStand = rt.t;
    const at = { x: F.jokan.pos.x, z: F.jokan.pos.z };
    // 旗本二人の組を作り、浄閑その人を城兵の組から移す（作り直すと、名のある将の記録に元の浄閑が「生きて残る」と残った）
    F.jokanG = enemyGroup(rt, { faction: 'takeda', name: '今福浄閑の旗本', anchor: at, fixed: true, facing: 0, width: 3, aggro: 18, noRout: true, dmgMultPlayer: 0.2 },
      [{ type: 'samurai', n: 1 }]);   // fixed：見えない所へ移さない。二人でも数の盛りで四人になり、足軽の本人が囲まれ倒れた（act bot 371秒）   // 旗本四騎・傷の重さ半分では、信長で出陣の本人が囲まれて倒れた（act bot 422秒）
    const j = F.jokan;
    F.hon.units = F.hon.units.filter((x) => x !== j);
    j.group = F.jokanG; j.slot = F.jokanG.units.length; j.target = null; j.moveTo = null; j.fleeing = false; F.jokanG.units.push(j); F.jokanG.leader = j; F.jokanG.initial = F.jokanG.units.length;
    F.jokanG.noRetinue = true;   // 11/18 クラウド：供回りの仕組み（lord_retinue.js）が見えない所で侍を足し、旗本が二人から九人に膨らんで本人が囲まれ倒れた（act bot 384秒）
    F.jokanG.order = 'assault'; F.jokanG.assault = (u) => honWay(rt, u); F.jokanG.seekRange = 30; F.jokanG.dmgMult = 0.3;
    F.jokanG.anchor = { ...F.hon.anchor };
    for (const u of F.jokanG.units) u.aiT = 0;
    rt.unmark('jokan');
    rt.marker('jokan', unitPos(F.jokan), '城将・今福浄閑', { red: true });
    rt.army.play('eshout', at, 2);
    rt.say('今福浄閑', '城はくれてやる。じゃが浄閑の首は、ただでは渡さぬぞ！', 3.5);
    rt.say('大久保忠世', '城将が打って出たぞ！　討ち取れ！', 3);
  },

  win(rt, how) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.unmark('jokan');
    rt.objDone('main');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; }, '諏訪原城を落とした');
    if (!F.jokanByUs) rt.objFail('jokan');
    if (!F.towersDone) rt.objFail('towers');
    for (const g of [F.hon, F.hon2, F.jokanG, F.umaG, F.wallG, ...(F.flanks || []), ...(F.sorties || [])]) if (g && g.count) { g.noRout = false; g.morale = 0; }
    sfx('horagai', 0.9);
    rt.banner('諏訪原城、落つ', how);
    F.garDA.rout({ hideAfter: 40 });
    rt.say('大久保忠世', `城が落ちたぞ！　${nm(rt)}、見事な先手であった`, 4);
    rt.say('大久保忠世', '殿はこの城を牧野城と改め、遠江の押さえとされるそうな', 4);
    rt.finish({}, 10);
  },

  lose(rt, big, small) {
    if (!rt.canFailMission()) return;
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.tracker.main = false;
    rt.objFail('main');
    rt.banner(big, small);
    rt.finish({}, 7);
  },

  update(rt, dt) {
    const F = rt.flags;
    const p = rt.player.u.pos;
    KIT.backTick(rt);
    // 11/18 16:50 クラウド：櫓の中の守り（naka.js が近くの組から射手を移す「物見櫓の守り」）に移った隅櫓の射手は、組の傷の倍率 0.42 が外れて 1 のまま射ていた
    //   （描かずの試しで四人のうち二人ずつ。act bot が出撃の段に (±17,-13) で櫓の矢 71〜90 を受け 58・80秒で倒れた）。移った後も元の組と同じ倍率に
    if (!(F.twFixT > rt.t)) { F.twFixT = rt.t + 2; for (const g of rt.army.groups) if (g.team === 1 && g.interiorHold && /櫓の守り/.test(g.name || '')) { if (!(g.dmgMult <= 0.42)) g.dmgMult = 0.42; for (const o of g.units) if (o.type === 'bow' && o.dmg > 7) o.dmg = 7; }
      // 11/21 15:40 クラウド：布陣の表（fujin_layout.js の swT1・swT2）が足した武田の「本曲輪の守り」二組だけ本人への倍が 1 のままで、足軽の一突き26が一秒に三つ重なり
      //   枡形の内 (-2,-37) で命九割三分から五秒で倒れた（携帯の act bot storm 188秒・bot_act_mobile_1431_fall.md）。本曲輪の城兵（F.hon 0.4）と同じ重さに。味方との斬り合いの倍はそのまま
      for (const g of rt.army.groups) if (g.team === 1 && /本曲輪の守り/.test(g.name || '')) { if (!(g.dmgMultPlayer <= 0.4)) g.dmgMultPlayer = 0.4;
        // 11/21 19:45 クラウド：矢玉は本人の倍（dmgMultPlayer）を見ないので、この二組の鉄砲は一発28のまま（携帯の act bot storm 191秒に命63→28・209秒に倒れた）。
        //   櫓・馬出・大手の射手（鉄砲0.38・弓0.6 に組の0.42）と同じく一本7までに
        for (const o of g.units) if ((o.type === 'gun' || o.type === 'bow') && o.dmg > 7) o.dmg = 7;
        // 11/21 21:55 クラウド：門の段にこの組（号令 attack）が塀の外の寄せ手を追って一の門の東の塀の内 (9,-34) に五人重なり止まった（携帯の act bot breach 131秒）。
        //   門の段からは本曲輪の城兵と同じ道すじ（honWay：空堀より外は追わず、枡形は門を通す）で動かす
        if (F.step >= 3 && !g.swHonWay) { g.swHonWay = true; g.order = 'assault'; g.assault = (u) => honWay(rt, u); g.seekRange = 30; for (const o of g.units) o.aiT = 0; } } }   // 右の櫓の鉄砲は中で弓に持ち替えても鉄砲の傷 20.7 のまま（描かずの試しで本人へ一本 13.5）。弓の傷にそろえる
    // 11/18 16:55 クラウド：出撃の段は城兵が堀の外で味方と斬り合うので、塀・柵の上からの筋書きの矢と石（siege_feel.js の一本9・組の倍率なし）は放たない
    //   （描かずの試しで本人へ届く矢の多くがこれ・一本13.5。act bot が出撃の段に 58・80・87秒で倒れた）。櫓と馬出の本物の射手は射続ける
    F.noVolley = F.step === 2;
    // 櫓の射手は櫓の床に立たせる
    for (const u of F.towerU) {
      const y = rt.world.heightAt(u.tower.x, u.tower.z) + DECK() + 0.08;
      u.mesh.position.y = u.alive ? y : y - 0.1;
    }
    if (F.ending) return;
    // K358：搦手から回った城兵が一人二人になったら、城へ逃げ戻る（残り一人を追って門破りの段が350秒止まっていた）
    // 11/19 cloud-15 の見回り（196秒・西の搦手の城兵五人が堀沿い (-47,-5) で重なって止まる）：回り込みは七十秒まで。過ぎれば城へ逃げ戻る
    if (F.flank && !gone(F.flank) && rt.t - (F.flank._t0 || rt.t) > 70) { F.flank.noRout = false; F.flank.morale = 0; F.flank.routed = true; }
    if (F.flank && !gone(F.flank) && F.flank.count <= 2) { F.flank.noRout = false; F.flank.morale = 0; F.flank.routed = true; }
    // 馬出は五秒の射撃と七秒の支度を繰り返す。斉射の後に前進・退避できる間を残す。
    // 放たれた矢玉と、接近した相手への白兵戦は共通の判定に任せる。
    F.umaG.fire = rt.t % 12 < 5;
    // 11/18 クラウドし：寄せの備（門破り・大久保組・左右の先手）の旗持ちは、assault の号令では湧いた所（持ち場の元）に残り、
    //   門破りの後続の旗が一本ずつ陣の前 (-18,40) に二百秒立ち尽くした（act bot の止まり・描かずの試し）。二秒ごとに持ち場を仲間の塊へ移し、仲間が尽きた旗は槍を取って門へ
    if (F.step >= 3 && rt.t > (F.stdT || 0)) {
      F.stdT = rt.t + 2;
      for (const g of [F.okuboG, F.left, F.right, ...(F.rams || [])]) {
        if (!g || !g.count || g.order !== 'assault') continue;
        let x = 0, z = 0, n = 0;
        for (const u of g.units) if (u.alive && !u.stdHeld && !u.fleeing) { x += u.pos.x; z += u.pos.z; n++; }
        // 旗は仲間の塊へまっすぐ向かうと馬出の土塁に掛かって (1,-17) に残った。仲間と同じ道すじ（route）で塊へ
        const s = n && g.units.find((u) => u.alive && u.stdHeld);
        const r = s ? route(rt, s.pos.x, s.pos.z, { x: x / n, z: z / n }) : null;
        if (n) g.anchor = r ? (r.pos ? { x: r.pos.x, z: r.pos.z } : { x: r.x, z: r.z }) : { x: x / n, z: z / n };
        else for (const u of g.units) if (u.alive && u.stdHeld) { u.stdHeld = false; u.aiT = 0; }
      }
    }
    // 散開したか
    if (F.step >= 1 && !F.looseDone && rt.squadGroups.some((g) => g.formation === 'loose')) {
      F.looseDone = true; rt.objDone('loose');
      rt.award((t) => t.side.push('組を散開させた'), '副任務：組を散開させた');
      rt.say('大久保忠世', 'それでよい。間を空ければ、鉄砲一発で二人は倒れぬ', 3);
    }
    // 11/17 検品（kenpin/suwahara_3koma.jpg）：出撃と門の段で組が三人まで減り、244〜454秒は本人のまわりに一、二人（散歩に見えた）。
    //   組が五人を割ったら、大久保組の後ろから新手の槍を組に入れる（二度まで・三十秒あける）。名簿の者でなく、寄せ手の足軽を預かる
    // 11/18 クラウドし：出撃の段から先は大久保組が後ろにいる。本人の組は崩れて逃げ散らない（act bot：門の段 214〜230秒で組の全員が逃げ、本人から二百m 離れた・天王寺と同じ手）
    if (F.step >= 2) for (const g of rt.squadGroups) if (g.count && !g.noRout) { g.noRout = true; g.routed = false; }
    // 11/18 22:55 クラウド：新手を待つ三十秒の間に残りの数人が一度に討たれると、新手が残っているのに「組、潰える」で負けた（描く流し storm 230秒）。
    //   組の全員が討たれた時は、三十秒を待たず新手を回す（負けは三度の新手を使い切った後だけ）
    const wiped = rt.squad.length && !rt.squad.some((s) => s.alive);
    if (F.step >= 2 && F.step <= 4 && rt.squad.length && (F.reinf || 0) < 3 && (rt.t > (F.reinfT || 0) || wiped)) {   // 三度まで（組が崩れて逃げなくなった分、本曲輪で潰えた回があった）
      // 11/18 クラウドし：逃げた兵も生きていると数え、組が崩れて五人とも逃げた時（act bot 230秒 storm の前）に新手が来なかった。逃げていない者だけを数える
      const alive = rt.squad.filter((s) => s.alive && !s.fleeing).length;
      if (alive < 5) {
        F.reinf = (F.reinf || 0) + 1; F.reinfT = rt.t + 30;
        const back = { x: p.x + (Math.random() - 0.5) * 4, z: p.z + 7 };
        rt.makeSquad(back, Math.PI, [{ kind: 'spear', n: Math.min(8, 12 - alive), members: [] }]);
        rt.say('大久保忠世', `${nm(rt)}の組が細った。わしの組から槍を回す、率いて行け`, 3.5);
      }
    }
    if (F.step === 1) {
      const d = Math.hypot(p.x - EDGE.x, p.z - EDGE.z);
      rt.objProgress('main', `あと ${Math.max(0, Math.round(d - EDGE.r))}m`);
      if ((d < EDGE.r && rt.t - F.stepT > 12) || rt.t - F.stepT > 50) {
        if (!F.looseDone) rt.objFail('loose');
        this.sortie(rt);
      }
    }
    if (F.step === 2 && F.sorties) {
      const live = F.sorties.reduce((a, g) => a + (gone(g) ? 0 : g.count), 0);
      rt.objProgress('main', `打って出た敵 ${live}人`);
      const t = rt.t - F.stepT;
      if (F.sorties.every(gone)) this.breach(rt, true);
      else if (t > 110) {
        // 押し返しきれないまま長引いたら、城兵は馬出へ引き揚げる（先へ進めるように）
        for (const g of F.sorties) { g.noRout = false; g.morale = 0; }
        this.breach(rt, false);
      }
    }
    // K358：門の段が七十秒を過ぎても櫓が残れば、大久保組の鉄砲衆が櫓を撃ち黙らせる（act bot が櫓の矢と弾を浴び続けて倒れた）
    if (F.step >= 3 && !F.towersDone && rt.t - F.stepT > 70 && !F.towerShot) {
      F.towerShot = true;
      rt.say('大久保忠世', '鉄砲衆、隅櫓を撃て！　射手を黙らせよ！', 3);
      rt.after(2, () => { sfx('volley', 0.9); for (const u of F.towerU) if (u.alive) rt.army.kill(u, null); });
    }
    if (F.step >= 3 && !F.towersDone) {
      const left = F.towerU.filter((u) => u.alive).length;
      rt.objProgress('towers', `残り ${left}/${F.towerU.length}人`);
      if (!left) {
        F.towersDone = true;
        rt.objDone('towers'); rt.unmark('tw0'); rt.unmark('tw1');
        rt.award((t) => t.side.push('隅櫓の射手を黙らせた'), '副任務：隅櫓の射手を黙らせた');
        rt.say('大久保忠世', '櫓が黙ったぞ！　門破りの者ども、今のうちに叩け！', 3.5);
        F.ramBoost = true;
        for (const g of F.rams) for (const u of g.units) u.dmg *= 1.5;
      }
      for (let i = 0; i < TOWERS.length; i++) if (!F.towerU.some((u) => u.alive && u.tower.x === TOWERS[i][0])) rt.unmark('tw' + i);
    }
    if (F.step === 3) {
      // 大久保の槍組は本人の左右に並ぶ（二秒ごとに持ち場を本人の横へ移す。背に置くとカメラの後ろに隠れて写らなかった）
      if (F.escortG && !gone(F.escortG) && rt.t > (F.escortT || 0)) {
        F.escortT = rt.t + 2;
        const P0 = rt.player.u.pos;
        F.escortG.anchor = { x: P0.x, z: P0.z - 1 }; F.escortG.order = 'hold'; F.escortG.dest = null;
      }
      rt.objProgress('main', `${gateName(F)} ${gatePct(F)}% ・ 門破り ${ramCount(F)}人`);
      // 11/18 クラウド：act bot「門破りの組の印に着いても6秒なにも起きない」（K175）。組のそばへ来たら、門破りの者が声を掛けて後ろの組も門へ駆け出す（三十秒に一度まで）
      { const P = rt.player.u, R0 = F.rams.find((g) => g.count) || null, c = R0 && R0.center();
        if (c && Math.hypot(P.pos.x - c.x, P.pos.z - c.z) < 7 && rt.t > (F.ramMetT ?? -99)) {
          F.ramMetT = rt.t + 30;
          rt.say('門破りの足軽', (F.ramMetN = (F.ramMetN || 0) + 1) % 2 ? 'かたじけない！　門はわしらが打ち破る。脇から来る城兵を頼みますぞ' : '来てくだされたか！　皆、もうひと押しじゃ！', 3.5);
          rt.army.play('shout', c, 1.5);
          for (const g of F.rams) if (g.count) for (const u of g.units) u.aiT = 0;
        } }
      // 門破りが減ったら、後ろから次の者が駆けつける（止まらないように。三度まで）
      // 11/18 cloud-34 の見回り（162秒に門破り1人・本人の組は39m 離れ本人が野にひとり）：門破りは竹束と楯で固く（1.8→3）。十二人で次の組を呼ぶと本人が倒れる回が増えたので八人のまま
      if (ramCount(F) < 8 && rt.t > F.ramNextT && F.ramWaves < 8) {   // K358：三度で尽きると門の段が止まった（bot 190秒から先へ進まず）
        F.ramWaves++; F.ramNextT = rt.t + 30;
        rt.say('大久保忠世', '門破りが減った！　次の者、行けっ！', 3);
        const g = allyGroup(rt, { faction: 'tokugawa', name: '門破りの組', anchor: { x: -16, z: 40 }, facing: Math.PI, width: 5, aggro: 3, noRout: true, order: 'assault' },
          [{ type: 'ashigaru', n: 12, o: { hat: 'jingasa_n' } }]);
        g.assault = F.ram.assault; g.defMult = 3;
        if (F.ramBoost) for (const u of g.units) u.dmg *= 1.5;
        F.rams.push(g);
      }
      // 狙った門破りが倒れても、主人公の追撃へ転じず次の門破りを狙う。
      for (const g of F.flanks || []) {
        if (gone(g) || (g.focus && g.focus.alive && !g.focus.fleeing)) continue;
        let next = null;
        for (const r of F.rams) {
          next = r.units.find((u) => u.alive && !u.fleeing);
          if (next) break;
        }
        if (!next) continue;
        g.focus = next;
        for (const u of g.units) { u.target = null; u.aiT = 0; }
      }
      if (F.flank && gone(F.flank) && !F.flank.done) { F.flank.done = true; rt.unmark('flank'); rt.say('大久保忠世', '搦手の者を追い払ったか。門はもうすぐじゃ！', 3); }
      if ((!F.gate.alive || gatePct(F) <= 40) && !F.flank2) { F.flank2 = true; this.flankers(rt, true); }
      // K358：門破りの後続が本物の兵の枠で空になり、門が一度も打たれず段が止まった。百秒を過ぎたら大久保組の大槌が門を打ち続ける（門ごとに一分半ほど）
      if (rt.t - F.stepT > 70) { const gt = curGate(F); if (gt && gt.alive) { if (!F.malletSaid) { F.malletSaid = true; rt.say('大久保忠世', '大槌を持て！　門を打ち破れ！', 3); } rt.army.damage(gt, 90 * dt, null, { kind: 'gateWork' }); } }
    }
    if (F.step === 4) {
      // 11/18 クラウドし：今福浄閑に付く旗本の輪（taisho_guard.js の名の無い組・侍五人）が、寄った本人を枡形から馬出の前 (0,-11) まで追い、
      //   倍の掛からない一太刀31ずつで倒した（act bot 296・383秒、「侍」の傷の持ち主が空）。浄閑の旗本と同じ重さにし、空堀より外へは追わせない
      const rg = F.jokan.oGuardG;
      if (rg) {
        if (!rg.suwaSoft) { rg.suwaSoft = true; rg.dmgMult = 0.3; rg.dmgMultPlayer = 0.2; }
        for (const o of rg.units) if (o.alive && o.target && o.target.pos.z > MOAT.z - MOAT.hw) { o.target = null; o.moveTo = null; o.aiT = 0; }
      }
      // 11/18 クラウド：act bot「6分で4人・斬り合う相手が少ない」。本曲輪の城兵が半ばを割るか四十秒たったら、奥に詰めていた城兵が一度だけ繰り出す（奥の塊の中から本物の兵を出す）
      if (!F.hon2 && !F.ending && (F.hon.count <= 18 || rt.t - F.stepT > 30)) {   // 11/18 03:50：半ばの十四・四十秒では本人が着く前に味方が討ち尽くした（act bot 6〜7分で2〜4人）
        F.hon2 = enemyGroup(rt, { faction: 'takeda', name: '本曲輪の奥の城兵', anchor: { x: 6, z: -80 }, facing: 0, width: 8, aggro: 18, fleeDir: { x: 0, z: -1 } },   // 11/18：上の本曲輪の城兵と同じ（東の角から塀の外へ抜けて跳ね戻る）
          [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 20 }]);
        F.hon2.order = 'assault'; F.hon2.assault = (u) => honWay(rt, u); F.hon2.seekRange = 30; F.hon2.dmgMult = 0.4;
        F.hon2.anchor = { ...F.hon.anchor };
        for (const u of F.hon2.units) u.aiT = 0;
        rt.army.play('eshout', { x: 6, z: -78 }, 2);
        rt.say('足軽', '奥からまだ出てくるぞ！', 2.5);
      }
      const live = F.hon.count + (F.hon2 ? F.hon2.count : 0);
      { const pp = rt.player.u.pos; if (!F.honIn && inHon(pp.x, pp.z) && pp.z < MASU.zN) F.honIn = rt.t; }
      rt.objProgress('main', `本曲輪の城兵 ${live}人`);
      if (!F.jokan.alive) this.win(rt, '城将・今福浄閑、討たれる');
      // 11/18 クラウド：act bot「任務で名を挙げた今福浄閑が一度も前に出ず（いちばん近くて70m）、討たれないまま城が落ちた」。
      //   城兵が崩れたら、浄閑は旗本数騎と二の門の内へ打って出て最後の一戦をする（城を枕に討死）。四十五秒で討てなければ城を捨てて落ちる
      else if ((F.hon.routed || live <= 3) && rt.t - F.stepT > 15 && !F.lastStand) this.lastStand(rt);
      // 11/19 06:35 クラウド：信長で出陣の大将は崩れの後に陣の前から歩き出すので、四十五秒では浄閑の所へ着く前に城が落ち、本曲輪の段の討ち取り0（act bot 356秒・storm 145秒で討0）。
      //   大将の回だけ、本人が本曲輪へ入ってから四十五秒（入らねば九十秒）まで浄閑は粘る
      else if (F.lastStand && (rt.t - F.lastStand > (rt.G.lord ? (F.honIn > F.lastStand ? F.honIn - F.lastStand + 45 : 90) : 45) || F.jokanG.routed)) this.win(rt, '城兵は城を捨てて落ちていく');
      // 保険：本曲輪で長く揉み合ったら、城兵は城を捨てて落ちる
      // 11/18 05:25 クラウド：足軽で出た時、bot は百五秒待って本曲輪へ入るので百秒で崩れると斬る相手が残らなかった（6〜7分で0〜5人）。足軽の時だけ、二の門を越え本曲輪へ入ってから三十五秒（入らねば百五十秒）で崩れる。
      //   信長で出陣の時は大将が外で矢玉を受ける時が延びて倒れたので百秒のまま
      // 11/19 05:30 クラウド：三十五秒では入ってすぐ崩れ、足軽の討ち取りが 1〜6 に留まった（斬り合う相手が少ない）。入ってから六十秒（入らねば百七十五秒）に延ばす
      else if (rt.t - F.stepT > 100 && !F.hon.routed && (rt.G.lord || (F.honIn ? rt.t - F.honIn > 60 : rt.t - F.stepT > 175))) { for (const g of [F.hon, F.hon2]) if (g) { g.noRout = false; g.morale = 0; g.routed = true; } }   // 崩れの印も立てる（士気だけでは崩れに移らず、本曲輪の段が終わらなかった）   // K358：170 から（一戦が長く、本曲輪で揉み合う間に倒れた）
    }
    // 日暮れ（時間切れ）
    const left = TIME_LIMIT - rt.t;
    if (F.step >= 3 && left < 150) {
      const o = rt.objectives.find((x) => x.id === 'main');
      if (o) o.progress = `${o.progress}・日暮れまで ${Math.max(0, Math.ceil(left / 60))}分`;
    }
    if (left < 200 && !F.after) { F.after = true; rt.world.setTime('after'); }
    if (left < 90 && !F.dusk) { F.dusk = true; rt.world.setTime('dusk'); rt.say('大久保忠世', '日が傾いてきた。急げ、日暮れまでに城を落とすのじゃ！', 3.5); }
    if (left <= 0) {
      rt.say('大久保忠世', '……日が暮れた。今日の攻めはここまでじゃ。退けい', 4);
      this.lose(rt, '日暮れ', '城は落ちず、寄せ手は陣へ引き揚げた');
    }
    // 組の全滅
    if (rt.squad.length && !rt.squad.some((s) => s.alive)) {
      rt.say('大久保忠世', `${nm(rt)}の組が潰えたか……下がれ、下がって手当てを受けよ`, 4);
      this.lose(rt, '組、潰える', '預かった二十人を失った');
    }
  },

  onKill(rt, v, k) {
    const F = rt.flags;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
    KIT.carrion(rt, v);
    if (v === F.jokan) {
      if (k && (k.isPlayer || k.isSub)) { F.jokanByUs = true; rt.objDone('jokan'); rt.award((t) => { t.special = { label: '城将討ち取り', pts: 30 }; }, '城将・今福浄閑を討ち取った'); }
      else rt.say('足軽', '今福浄閑、討ち取ったりーっ！', 3);
      F.hon.morale -= 40;
    }
  },

  onRout(rt, g) {
    const F = rt.flags;
    if (F.sorties && F.sorties.includes(g)) rt.say('足軽', '馬出の敵が逃げ戻っていくぞ！', 2.5);
  },

  onStructHit(rt, s) {
    const F = rt.flags;
    if (s !== F.gate && s !== F.gate2) return;
    const pct = gatePct(F);
    const said = (F.gateSaid = F.gateSaid || {})[s.name] = F.gateSaid[s.name] || [];
    const next = [75, 50, 25].find((q) => pct <= q && !said.includes(q));
    if (next) {
      said.push(next);
      rt.bark(`${gateName(F)}が軋んでいる（残り ${pct}%）`);
      if (next === 25) rt.say('門破りの頭 本多作左', 'もう一息じゃ！　閂が折れるぞ！', 2.5);
    }
  },

  onStructDestroyed(rt, s) {
    const F = rt.flags;
    if (s !== F.gate && s !== F.gate2) return;
    if (s.mesh && s.mesh.userData.fall) s.mesh.userData.fall();   // 扉が内へ倒れる
    rt.scene.add(stumps(rt.world, s.seg));
    sfx('wood', 1.2);
    if (s === F.gate2) { this.storm(rt); return; }
    rt.banner('一の門、破れる', '枡形へ押し込め');
    rt.obj('main', '枡形の奥の二の門を破れ', 'main');
    rt.say('足軽', '一の門が破れたぞ！', 2.5);
    rt.say('大久保忠世', '枡形じゃ！　四方の塀から撃たれるぞ、止まるな。右へ折れて二の門を破れ！', 4);
  },

  onFinish(rt) {
    const R = rt.G.rel && rt.G.rel.okubo;
    if (R && rt.tracker.main) { R.trust += 10; R.like += 8; }
  },
};

// 両軍の総勢（徳川 約一万、城兵 約千）。討たれた兵一人を、遠くの大勢の損害に見立てる
suwahara.force = (rt) => {
  const F = rt.flags;
  const b = Math.max(0, 1000 - (F.ek || 0) * 6 - (F.step >= 4 ? 100 : 0) - (F.ending && rt.tracker.main ? 400 : 0));
  return { a: 10000 - (F.ak || 0) * 25, a0: 10000, b, b0: 1000 };
};
suwahara.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '寄せの下知まで待つ' : '');
suwahara.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
suwahara.sides = { a: { name: '徳川軍', mon: 'tokugawa' }, b: { name: '武田方 諏訪原城', mon: 'takeda' } };
suwahara.date = (rt) => {
  const w = rt.world;
  const time = { day: '昼', storm: '昼', after: '昼下がり', dusk: '夕暮れ' }[w.timeKey] || '昼';
  return `天正三年八月　秋・${w.rainLevel > 0.5 ? '雨' : '晴'}・${time}`;
};
suwahara.history = '諏訪原城は、武田方が大井川の西の台地に築いた遠江攻めの拠点で、丸馬出と三日月堀の縄張りが残る。ただし残る縄張りには徳川時代の改修も含まれ、今の城跡の形すべてを武田時代のものとは決められない。この戦の曲輪・門・堀の配置は城跡をもとにした推定である。天正三年、長篠の戦いの後に徳川家康はこの城を攻め、八月に落とした。城兵の多くは小山城の方へ退いたと伝わり、城将・今福浄閑の最期には諸説がある。家康は城を牧野城と改め、武田方の高天神城に向き合う押さえとした。';

// 素直な遊び手：印へ向かい、近くの敵を突く。散開・突撃・ついて来いの号令も使う
const WAIT = { x: -3, z: -36.5 };
// 11/18 15:45 クラウド：本曲輪・枡形から土橋へ退く道。まっすぐ (0,-30) へ向かうと、本曲輪の東からは枡形の東の塀、枡形の隅からは南の塀に当たって止まり、
//   追って来た浄閑に倒された（信長で出陣 act bot 300秒 (-6,-35)・直し無しの main でも）。二の門 → 枡形の真ん中 → 一の門 と順にくぐる
function outWay(x, z) {
  if (inMasu(x, z)) return Math.abs(x) > 2 && z < HON.z1 - 1.5 ? { x: 0, z: HON.z1 - 3 } : { x: 0, z: HON.z1 + 4 };
  if (x > GATE2.x + 0.5 && z > MASU.zN - 4) return Math.abs(z - GATE2.z) > 1.2 ? { x: GATE2.x + 1.8, z: GATE2.z } : { x: GATE2.x - 3, z: GATE2.z };
  return { x: MASU.hw + 3, z: MASU.zN - 3 };
}
   // 枡形の入口の脇（二の門の前を空け、奥の塀の射手から遠い所）
suwahara.botBrain = (b, inp, { goTo, patientStrike }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW');
  if (!u.alive || F.ending) return;
  const cmd = (id) => { if (!(b.botCmdT > b.t)) { inp.quickCmd = id; b.botCmdT = b.t + 2; } };
  // 前の号令で弓組だけを選んでいたら、全隊に戻す
  // 11/18 04:00：次のコマですぐ外すと、同じ時に遊び手が輪で選んだ「敵を狙え」が狙いの無いまま放され、号令が出なかった（act bot breach 143秒★★★）。二秒は狙いを残す
  if (b.botSelBow && !(b.botCmdT > b.t)) { b.botSelBow = false; p.selGroup = 'all'; p.lock = null; }
  // 門破りの間、弓組に隅櫓の射手を狙わせる（弓組を選び、射手に狙いを定めて「敵を狙え」）
  const bowG = b.squadGroups.find((g) => g.kind === 'bow' && g.count);
  if (F.step === 3 && bowG && !F.towersDone && !(bowG.focus && bowG.focus.alive) && !(b.botCmdT > b.t)) {
    const tw = F.towerU.filter((o) => o.alive).sort((a1, a2) => Math.hypot(a1.pos.x - u.pos.x, a1.pos.z - u.pos.z) - Math.hypot(a2.pos.x - u.pos.x, a2.pos.z - u.pos.z))[0];
    // 11/18 04:05：組の選びを弓組へ替えると「部隊指揮・弓隊」の札が号令の丸の上に出て、遊び手が輪を押せなかった（act bot breach 141秒★★★）。選びは替えず、弓組に直に狙わせる
    if (tw) { bowG.order = 'attack'; bowG.focus = tw; bowG.seekRange = 20; for (const x of bowG.units) x.aiT = 0; b.botCmdT = b.t + 2; }
  }
  // 寄せ始めたら組を散開させる
  if (F.step >= 1 && F.step < 3 && b.squad.length && !b.squadGroups.every((g) => g.formation === 'loose')) cmd('form');
  // 同じ囲いの中の敵だけを追う（塀越しの敵に吸い寄せられない）
  // 囲いごとの区分（枡形は二の門が破れるまで本曲輪と別）
  const reg = (x, z) => (inMasu(x, z) ? (F.gate2.alive ? 3 : 2) : inHon(x, z) ? 2 : inUma(x, z) ? 1 : 0);
  const my = reg(u.pos.x, u.pos.z);
  // K358：信長で出陣（大将）は堀の際へ出ず、陣の前で下知する。寄って来た敵だけを払う（大将は狙われやすく、一人で前へ出て囲まれ倒れた）
  // 11/18 04:40：槍の供（lordHata）が付いた今、後ろに留まると行き先のピンへ 0/46・討ち取り0（act bot）。大将も組と一緒にピンへ進み、間合いだけ狭く取る
  const lordBack = false;
  // 11/19 00:40 クラウド：足軽で出た回、百五秒待ってから二の門の外 (10,-41) の城兵の群れへ一人で斬り込み、三方から突かれて退く途中に倒れた（act bot storm 381秒・本曲輪の城兵の崩れの三十秒前）。
  //   本曲輪の城兵が崩れるまで、二の門の外に味方より敵が多い間は枡形の内で待ち、枡形へ入って来た敵だけを斬る
  let gateCrowd = false;
  if (F.step === 4 && F.hon && !F.hon.routed && !F.gate2.alive && !(inHon(u.pos.x, u.pos.z) && !inMasu(u.pos.x, u.pos.z) && u.pos.z < MASU.zN)) {
    let en = 0, fr = 0;
    const inner = inMasu(u.pos.x, u.pos.z);   // 枡形の内なら二の門の外を、土橋の外なら一の門の前（枡形と土橋）を見る
    for (const o of b.army.units) { if (!o.alive || o.fleeing || o === u || (inner ? Math.hypot(o.pos.x - GATE2.x - 5, o.pos.z - GATE2.z + 3) > 10 || inMasu(o.pos.x, o.pos.z) : Math.hypot(o.pos.x - GATE.x, o.pos.z - GATE.z - 3) > 8)) continue; if (o.team === u.team) fr++; else en++; }
    gateCrowd = en >= 3 && en >= fr;
  }
  const range = lordBack ? 5 : F.step === 2 ? 9 : F.step === 3 ? 18 : gateCrowd ? 5 : 11;
  const e = b.army.nearestEnemy(u, range, (o) => !o.tower && !o.fleeing && !o.invuln && (reg(o.pos.x, o.pos.z) === my || (my === 1 && reg(o.pos.x, o.pos.z) === 0 && o.pos.z < -22) || Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) < 3) && !(F.step === 2 && inMika(o.pos.x, o.pos.z) && !inMika(u.pos.x, u.pos.z) && Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) > 3) && !(F.step === 2 && inUma(o.pos.x, o.pos.z) && !inUma(u.pos.x, u.pos.z)));   // 出撃の段は三日月堀の底の敵を追って降りない。11/19 02:00 クラウド：馬出の内の敵も追って脇口をくぐらない（信長で出陣が 67秒に馬出の内 (-7,-21) へ入り、門破りの段に出口の無い内で矢を浴び 104秒に倒れた）
  // K358：深手（六割を切る）なら徳川の陣の前まで退いて手当てする（本人の受ける傷は共通で八割より軽くならない＝K360⑦。退かずに囲まれ3回とも倒れた）
  //   手当て済み（bandaged）でも、八割五分まで戻るまでは陣の前で息を整える（傷は少しずつ戻る）
  // 11/18 21:55 クラウド：storm で本曲輪の城兵に三方から囲まれると、六割を切ってから退いても背に一太刀ずつ受けて倒れた（act bot 3回で倒れ4・189〜305秒）。
  //   人と同じく、三人より多く囲まれたら七割五分で退き始める
  // 11/21 05:35 クラウド（K582 の関所）：信長で出陣の回、出撃の段に脇口 (-18,-15) で出撃の侍・足軽に三方から囲まれ、命七割七分から六秒で倒れた（act bot sortie 62秒・囲みを数えるのが本曲輪の段だけで六割まで退かず）。出撃の段でも囲みを数える
  let near = 0; if (F.step === 4 || F.step === 2) for (const o of b.army.units) if (o.alive && o.team !== u.team && !o.fleeing && Math.abs(o.pos.x - u.pos.x) < 4 && Math.abs(o.pos.z - u.pos.z) < 4) near++;
  // 11/19 01:00 クラウド：信長で出陣の回、枡形の内で二の門から来た奥の城兵に囲まれ、七割五分から退いても一の門の際で背を突かれ倒れた（act bot storm 257秒・奥の城兵の傷176）。大将は九割で退き始める
  // 11/19 03:00 クラウド：足軽で出た回、枡形の内で待つ間に二の門から奥の城兵が入り、二人に挟まれ五割まで削られてから退いても、狭い枡形で出口を塞がれ倒れた（act bot storm 258〜275秒 (2,-39)→(-7,-42)）。枡形の内では二人で七割五分から退く
  const masuTight = F.step === 4 && inMasu(u.pos.x, u.pos.z) && near >= 2;
  // 11/19 06:55 クラウド：信長で出陣の回、浄閑の最後の一戦に着いても、浄閑と旗本と残りの城兵で三人を数え九割で退き、浄閑と斬り結べず storm の討ち取り0（act bot lordstand_0632）。
  //   城兵が崩れた後（浄閑の最後の一戦）に槍の供が四人より多くそばにいる間は、大将も七割五分まで踏み止まる
  let mine = 0; if (F.lastStand && b.G && b.G.lord) for (const o of b.army.units) if (o.alive && o.team === u.team && o !== u && !o.fleeing && Math.abs(o.pos.x - u.pos.x) < 6 && Math.abs(o.pos.z - u.pos.z) < 6) mine++;
  if (u.hp < u.maxHp * (near >= 3 || masuTight ? (b.G && b.G.lord && mine <= 4 ? 0.9 : 0.75) : 0.6)) F.botRest = true; else if (u.hp > u.maxHp * 0.85) F.botRest = false;
  if (F.step >= 1 && F.botRest) {
    inp.leftPressed = false;
    // 11/18 19:40 クラウド：退いて手当てする間も組に「かかれ」を残し、本曲輪の前で組だけが戦い続けて潰えた（act bot storm 374秒「組、潰える」・描かずの試しで本人は陣の前 (1,44)、組は (14,-18) で 9→0）。退く時は組を連れて下がる
    if (b.squad.length && b.squadGroups.some((g) => g.count && g.order === 'attack')) cmd('follow');
    if (p.treatmentReady && p.treatmentLeft > 0) { inp.k.add('KeyE'); return; }
    // 11/18 16:40：三日月堀の底にいる時は、まず真っすぐ外の縁へ上がる（陣へ向かう斜めの道では法面を這うだけで十秒余り矢を浴びた）
    // 11/19 07:55 クラウド：馬出の柵の外・三日月堀の内の縁の間（土塁の外の際）では、この縁の内と外で退きの行き先が二つに割れ、(-9,-14)↔(-10,-13) を往き来して命一割のまま十秒動けず倒れた（act bot 信長で出陣 sortie 92秒）。際も堀の中と同じく真っすぐ外へ
    const lip = !inUma(u.pos.x, u.pos.z) && u.pos.z > MOAT.z + MOAT.hw && Math.hypot(u.pos.x - UMA.x, u.pos.z - UMA.z) < MIKA.r0 && Math.abs(Math.atan2(u.pos.x - UMA.x, u.pos.z - UMA.z)) < MIKA.span + 0.1;
    if (inMika(u.pos.x, u.pos.z) || lip) { const dx = u.pos.x - UMA.x, dz = u.pos.z - UMA.z, dl = Math.hypot(dx, dz) || 1; goTo(p, inp, UMA.x + dx / dl * (MIKA.r1 + 3.5), UMA.z + dz / dl * (MIKA.r1 + 3.5), 1.2); inp.guardHold = false; return; }
    // 城の囲いの外（堀の手前）なら、真っすぐ徳川の陣の前へ（route は城へ入る道なので使わない）
    // 11/18 15:55：目当て (20,-20) の二m 手前で着いたと見なすと、そこ（馬出から十九m）がまだ「馬出のそば」で、陣へ退かずに立ち続け鉄砲に倒れた（act bot 365秒 (19,-19)）→ (23,-20)
    // 11/18 09:00：storm で隅櫓が落ちた後は、馬出の脇の三日月堀の底 (11,-12) を通らず堀の外 (±20,-20) へ（底で遅くなり柵越しに侍に打たれて倒れた・act bot 399秒）。櫓が残る間は弓が届くので元の道
    // 11/18 23:05 クラウド：馬出の西・東の際（柵の外・三日月堀の端より北）から (±15,-6) へ斜めに向かうと三日月堀の端の法面に掛かり、命一割のまま二十秒動けず倒れた（act bot 信長で出陣 breach 84秒 (-11,-19)）。先に横へ堀の端の外まで出る
    // 11/19 01:30 クラウド：門破りの段に空堀の底 (25,-28) で深手を負うと、堀の底を土橋へ横に歩いて隅櫓の矢を浴び続け倒れた（act bot breach 164〜200秒・弓60）。馬出の脇口より外なら、先に南の岸へ上がる
    if (F.step <= 3 && Math.abs(u.pos.z - MOAT.z) < MOAT.hw + 0.3 && Math.abs(u.pos.x) > 12) { goTo(p, inp, u.pos.x, MOAT.z + MOAT.hw + 2.5, 1.2); inp.guardHold = false; return; }
    // 11/19 02:40 クラウド：本曲輪の段（storm）でも、空堀の底 (23,-29)・(9,-29) で深手を負うと、底を土橋へ横に歩いて隅櫓の矢と鉄砲を浴び続け、命一割のまま三十秒さまよって倒れた（act bot 足軽 storm 275〜306秒）。
    //   土橋（|x|<4）より外の底なら、脇口の外（|x|>12）は真っすぐ南の岸へ、内は斜めに外へ出ながら岸へ上がる
    if (F.step === 4 && Math.abs(u.pos.z - MOAT.z) < MOAT.hw + 0.3 && Math.abs(u.pos.x) > 4 && !inUma(u.pos.x, u.pos.z)) { const ax = Math.abs(u.pos.x) > 12 ? u.pos.x : (Math.sign(u.pos.x) || 1) * 14; goTo(p, inp, ax, MOAT.z + MOAT.hw + 2.5, 1.2); inp.guardHold = false; return; }
    if (!inUma(u.pos.x, u.pos.z) && !inMika(u.pos.x, u.pos.z) && u.pos.z < UMA.z + 4 && u.pos.z > MOAT.z + MOAT.hw && Math.abs(u.pos.x) < MIKA.r1 + 1.5 && Math.hypot(u.pos.x - UMA.x, u.pos.z - UMA.z) < MIKA.r1 + 1) { goTo(p, inp, (Math.sign(u.pos.x) || 1) * (MIKA.r1 + 3), Math.min(u.pos.z, UMA.z), 1.2); inp.guardHold = false; return; }
    if (!inUma(u.pos.x, u.pos.z) && !inMasu(u.pos.x, u.pos.z) && !inHon(u.pos.x, u.pos.z) && u.pos.z > MOAT.z + MOAT.hw) { const ru = Math.hypot(u.pos.x - UMA.x, u.pos.z - UMA.z), far = F.step === 4 && !F.towerU.some((o) => o.alive), nearUma = u.pos.z < -6 && ru < (far ? MIKA.r1 + 0.6 : 14); goTo(p, inp, nearUma ? (Math.sign(u.pos.x) || 1) * (far ? 23 : 15) : 0, nearUma ? (far ? -20 : -6) : 46, 2); inp.guardHold = false; return; }
    // 門が二つとも破れた後（本曲輪へ押し込む段）は、破れた門をくぐって土橋の外まで下がる
    // 11/18 08:40：本曲輪から土橋へ下がった後、(0,20) へ真っすぐ向かうと馬出の内へ入り、南の柵に掛かって (0,-11) で二十秒止まり、追って来た侍に倒された（act bot 296秒）。馬出の内なら北の脇口から出て、弧の外を回る
    const sx = Math.sign(u.pos.x) || 1;
    if (F.step === 4 && !F.gate.alive && !F.gate2.alive && inUma(u.pos.x, u.pos.z)) { goTo(p, inp, sx * 12.5, -23, 1.2); inp.guardHold = true; return; }
    if (F.step === 4 && !F.gate.alive && !F.gate2.alive) { const q = inMasu(u.pos.x, u.pos.z) || inHon(u.pos.x, u.pos.z) ? outWay(u.pos.x, u.pos.z) : u.pos.z < MOAT.z + MOAT.hw + 1 && Math.abs(u.pos.x) < 5 ? { x: sx * 3, z: -24 } : u.pos.z < -6 && Math.hypot(u.pos.x - UMA.x, u.pos.z - UMA.z) < 14 ? { x: sx * 15, z: -6 } : { x: 0, z: 20 }; goTo(p, inp, q.x, q.z, 1.5); inp.guardHold = true; return; }
  }
  // 門破りの間に深手を負ったら、馬出の内まで下がって息を整える
  // 11/18 15:50 クラウド：息を整える間（botRest）に馬出の内にいると、どの退きにも掛からず門破りの後へ戻り、命一割のまま隅櫓の矢の届く (-6,-25) へ出て倒れた（act bot breach 179秒）。
  //   馬出の内なら南の奥（隅櫓から三十七m余り）で構えて待つ
  if (F.step === 3 && F.botRest && inUma(u.pos.x, u.pos.z)) { goTo(p, inp, 0, -12.5, 1.2); inp.guardHold = true; return; }
  // 11/19 01:30 クラウド：深手（botRest）でも命が四割五分より上だと、空堀と土橋の上ではどの退きにも掛からず一の門の前の敵へ斬り掛かって倒れた（act bot breach 185〜200秒 (-3,-25)→(-4,-32)）。息を整える間は馬出の内へ下がる
  if (F.step === 3 && (u.hp < u.maxHp * 0.45 || F.botRest) && !inUma(u.pos.x, u.pos.z)) {
    const back = inMasu(u.pos.x, u.pos.z) || (Math.abs(u.pos.x) < 5 && u.pos.z < MOAT.z + 4) ? { x: 0, z: -20 } : route(b, u.pos.x, u.pos.z, { x: 0, z: -20 });
    if (!back.isStruct) { goTo(p, inp, back.x, back.z, 1.5); inp.guardHold = false; return; }
  }
  // 深手なら組の後ろへ下がって息を整える
  if (e && u.hp < u.maxHp * 0.45) {
    p.yaw = F.step === 2 ? Math.atan2(-u.pos.x, 18 - u.pos.z) : Math.atan2(u.pos.x - e.pos.x, u.pos.z - e.pos.z);
    inp.k.add('KeyW');
    inp.guardHold = false;
    return;
  }
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d > 2.4) inp.k.add('KeyW');
    // K358：構えずに受けた刃は共通の決まりで命の四〜六割を削る。振りを受けてから返す（共通の patientStrike。くじの突きと構えで囲まれて倒れた）
    if (patientStrike) patientStrike(p, inp, e, d);
    else { if (d < 3.2 && Math.random() < 0.5) inp.leftPressed = true; inp.guardHold = (b.army.threats || []).length > 0 && Math.random() < 0.6; }
    if (b.squad.length && b.squadGroups[0].order !== 'attack' && d < 14) cmd('attack');
    return;
  }
  inp.guardHold = false;
  if (b.squad.length && b.squadGroups[0].order === 'attack') cmd('follow');
  // 行き先
  let q = null;
  if (F.step === 0) q = null;
  else if (F.step === 1) q = { x: EDGE.x, z: EDGE.z + EDGE.r - 1.5 };   // K358：堀の際の輪の後ろ端（馬出の弓の届く際で立ち止まらない）
  else if (F.step === 2) {
    // K358：出撃は組の前列で受ける。本人は一列後ろ（堀の際で一人で受けて囲まれた）
    // 11/18 09:30：出撃は脇口 (±17,-23.5) で持ち場を守り (0,19) まで来ないので、足軽で出た回は討ち取り0・突き0（act bot mikastorm_2）。
    //   人数の多い方の出撃へ、脇口を押さえる先手の一列後ろ（三日月堀の外 ±19,-12）まで出て受ける
    const so = (F.sorties || []).filter((g) => !gone(g)).sort((a, c) => c.count - a.count)[0];
    q = so && !lordBack ? { x: Math.sign(so.center().x || 1) * 19, z: -12 } : { x: 0, z: 19 };
    // 11/18 16:00 クラウド：陣の前 (0,19) から (±19,-12) へまっすぐ向かうと三日月堀の底を突っ切り、底から上がれず物見櫓の矢を浴びて倒れた（act bot sortie 86・88秒）。堀の外 (±19,0) を回る
    if (q.z < 0 && u.pos.z > -2 && Math.abs(u.pos.x) < Math.abs(q.x) - 2.5) q = { x: q.x, z: 0 };
  }
  else if (F.step === 3) {
    // 搦手の敵が門破りに迫っていれば迎え撃ち、そうでなければ門破りと一緒に門へ
    const fl = F.flank && !gone(F.flank) ? F.flank.center() : null;
    // 門破りの組の少し後ろについて行き、門にかかったら馬出の内で搦手からの敵に備える（先走って矢玉を一人で浴びない）
    // 11/18 cloud-34 の見回り（162秒に門破り一人のそばで本人が野にひとり）：一番人数の多い門破りの組について行く（初めの組の残り一人を追わない）
    const live = F.rams.filter((r) => r.count).sort((a, c) => c.count - a.count)[0] || F.ram;
    const rc = live.center();
    const atGate = F.gate.alive && Math.abs(rc.x) < 5 && rc.z < MOAT.z + 3;
    const fq = { x: rc.x, z: rc.z + 3 };
    // 二の門にかかったら、門の前を塞がないよう枡形の西の端で待つ
    if (!F.gate.alive && inMasu(u.pos.x, u.pos.z)) { q = WAIT; if (Math.hypot(q.x - u.pos.x, q.z - u.pos.z) > 1.5) goTo(p, inp, q.x, q.z, 1.5); return; }
    const follow = reg(rc.x, rc.z) === my && Math.hypot(rc.x - u.pos.x, rc.z - u.pos.z) > 4 ? fq : route(b, u.pos.x, u.pos.z, fq);
    q = fl && reg(fl.x, fl.z) === 0 && my === 0 && Math.hypot(fl.x - u.pos.x, fl.z - u.pos.z) < 30 ? fl : atGate ? (my === 1 || (Math.abs(u.pos.x) < 5 && u.pos.z < MOAT.z + 4) ? { x: 0, z: -22 } : route(b, u.pos.x, u.pos.z, { x: 0, z: -22 })) : follow;
  } else if (F.step === 4) {
    // 門が破れた直後は味方を先に行かせ、枡形で一息おいてから押し込む（K358：14秒では本曲輪の城兵に一人で囲まれ3回とも倒れた。城兵が浮き足立つ百秒まで待つ）
    const j = F.jokan.alive ? F.jokan.pos : F.hon.center();
    // K358：枡形の端でも本曲輪の城兵が寄せて来て倒れた。崩れる百秒までは土橋の外（堀の手前）で味方の後ろに控える
    const outside = !inUma(u.pos.x, u.pos.z) && !inMasu(u.pos.x, u.pos.z) && !inHon(u.pos.x, u.pos.z) && u.pos.z > MOAT.z + MOAT.hw;
    // 11/19 05:00 クラウド：足軽で出た回、深手を手当てして戻った後も、二の門の外に城兵が多い間は徳川の陣の前 (0,18) で六十秒立ち、本曲輪の段の討ち取り0（描かずの足跡 303〜353秒）。
    //   百五秒を過ぎて櫓が皆落ちていれば、馬出の内 (0,-14) で待ち、土橋へ出て来る城兵を受ける（信長で出陣の大将は元の陣の前のまま。04:50 の枝で大将が二回しくじった）
    // 11/19 08:50 クラウド：信長で出陣の回、門の段から枡形の内 (-3,-36) に居たまま本曲輪の段の待ちに入り、二の門から来た城兵に枡形の北西の隅 (-6,-44) へ押し込まれ、退こうにも囲まれて十五秒で倒れた（act bot storm 254秒・bot_act_1119_escortstorm_fail.md）。
    //   大将は待つ間、枡形・本曲輪・土橋・馬出の内に居れば、退きと同じ道で陣の前へ出る
    const lordWait = b.G && b.G.lord && !outside && (b.t - F.stepT < 105 || gateCrowd);
    if (lordWait) { const sx = Math.sign(u.pos.x) || 1; q = inMasu(u.pos.x, u.pos.z) || inHon(u.pos.x, u.pos.z) ? outWay(u.pos.x, u.pos.z) : u.pos.z < MOAT.z + MOAT.hw + 1 && Math.abs(u.pos.x) < 5 ? { x: sx * 3, z: -24 } : u.pos.z < -6 && Math.hypot(u.pos.x - UMA.x, u.pos.z - UMA.z) < 14 ? { x: sx * 15, z: -6 } : { x: 0, z: 18 }; }
    else q = gateCrowd && inUma(u.pos.x, u.pos.z) ? { x: 0, z: -14 } : b.t - F.stepT < 105 || gateCrowd ? (outside ? (b.t - F.stepT >= 105 && !(b.G && b.G.lord) && !F.towerU.some((o) => o.alive) ? { x: 0, z: -14 } : { x: 0, z: 18 }) : WAIT) : route(b, u.pos.x, u.pos.z, { x: j.x, z: j.z });
  }
  if (lordBack) q = { x: 0, z: 26 };
  if (q) {
    if (q.isStruct) q = gateFront(q);
    goTo(p, inp, q.x, q.z, 1.5);
  }
};

export { suwahara };
// K358：共通の退き（survive）は堀と馬出の囲いを知らず、敵の中へ退いて倒れた。三割を切るまでは戦の頭（botBrain の息継ぎ）に任せる
suwahara.botDefendsFort = true;
// 11/19 02:40 クラウド：門が二つとも破れた後に三割を切ると、共通の退き（survive）が味方の方へ下がり空堀の底へ降りて、隅櫓の矢の下を三十秒さまよい倒れた（act bot 足軽 storm 306秒）。
//   本曲輪の外（空堀・土橋・馬出のまわり）にいる間は、三割を切っても戦の頭の退き道に任せる
// 11/19 05:50 クラウド：信長で出陣の回、門破りの段に馬出の内 (-2,-11) で三割を切ると、共通の退きが味方（門破り）の方へ下がり馬出の西の奥 (-9,-22) へ出て隅櫓の矢を浴び倒れた（act bot breach 91秒）。
//   門破りの段に馬出の内にいる間も、戦の頭の退き道（馬出の南の奥で構えて待つ）に任せる
suwahara.botOwnRetreat = (b) => { const F = b.flags, u = b.player.u; return (F.step === 3 && inUma(u.pos.x, u.pos.z)) || (F.step === 4 && !inHon(u.pos.x, u.pos.z) && !inMasu(u.pos.x, u.pos.z) && u.pos.z < 0); };
// K358：信長で出陣の旗本は既定では全員鉄砲で、寄せた出撃の槍を受ける者がいず、大将が一人で囲まれ倒れた。槍の供を前に立てる（稲生・森部と同じ）
suwahara.lordHata = { spear: 20, gun: 10 };
