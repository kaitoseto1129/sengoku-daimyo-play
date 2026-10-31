// 身の回り（カメラから四十メートルほど）を、その日の合戦の場に見せる。
// 踏み荒らした泥・轍・水たまり・倒れた槍と旗・刺さった矢・脱げた陣笠・季節の丈の高い草・地を這う土埃や靄。
// 戦ごとの中身は b_<戦>.js の def.timeslip に書く（季節・濡れ・土埃・草の色・倒れた物の多さ・置き物）。
// 形と材質は戦をまたいで使い回し、置き物は一つの束で描く（描く回数は九つまで）。
// 中身は六メートルの升ごとに場所から決まるので、歩き回っても同じ所には同じ物がある（後ろを付いてこない）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WIND_STATE, distToPolyline } from './world.js';
import { overlapsCastleGround } from './castle_mask.js';
import { leafTex } from './nature.js';
import { sakamogi, takataba, nobori, jinmaku, bobosaku, tawara, makeKitBatch, finalizeKitBatch } from './props.js';

const CELL = 6, RADIUS = 42, MOVE = 5;
const CAP = { mud: 140, rut: 48, pool: 70, spear: 44, arrow: 90, kasa: 14, flag: 10, grass: 320, branch: 10, blot: 80 };

// 場所から決まる 0〜1 の数
function h01(i, j, k) {
  let v = Math.sin(i * 127.1 + j * 311.7 + k * 74.7) * 43758.5453;
  return v - Math.floor(v);
}

// ---- 絵（キャンバス。一度だけ作る） ----
let TEX = null;
function canvasTex(w, h, draw, round = false) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  // 丸い跡は縁へ向けて必ず透かし、四角い板の縁を見せない。
  if (round) {
    g.globalCompositeOperation = 'destination-in';
    const m = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    m.addColorStop(0, 'rgba(0,0,0,1)'); m.addColorStop(0.6, 'rgba(0,0,0,0.9)'); m.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = m; g.fillRect(0, 0, w, h);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
function rnd(seed) { let s = seed | 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) | 0; return (s >>> 0) / 4294967296; }; }
function textures() {
  if (TEX) return TEX;
  // 泥：濃い踏み跡の斑に、草鞋と蹄の跡。縁は透けて地面へ溶ける。
  const mud = canvasTex(256, 256, (g, w, h) => {
    const r = rnd(11);
    for (let i = 0; i < 70; i++) {
      const x = w / 2 + (r() - 0.5) * w * 0.6, y = h / 2 + (r() - 0.5) * h * 0.6, rad = 18 + r() * 46;
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      const d = 30 + r() * 26;
      gr.addColorStop(0, `rgba(${d + 22},${d + 14},${d + 4},0.55)`); gr.addColorStop(1, 'rgba(40,30,20,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, rad, 0, 7); g.fill();
    }
    // 草鞋の跡（細長い楕円）と蹄の跡（三日月）
    for (let i = 0; i < 26; i++) {
      const x = 40 + r() * 176, y = 40 + r() * 176, a = r() * 6.3;
      g.save(); g.translate(x, y); g.rotate(a);
      g.fillStyle = 'rgba(22,16,10,0.55)';
      if (i % 3) { g.beginPath(); g.ellipse(0, 0, 4.5, 11, 0, 0, 7); g.fill(); g.fillStyle = 'rgba(120,100,76,0.35)'; g.beginPath(); g.ellipse(1.5, -2, 2, 6, 0, 0, 7); g.fill(); }
      else { g.lineWidth = 4; g.strokeStyle = 'rgba(20,14,8,0.6)'; g.beginPath(); g.arc(0, 0, 8, 0.3, 2.9); g.stroke(); }
      g.restore();
    }
  }, true);
  // 轍：二本の溝。縁は盛り上がった土の明るい筋。縦に繰り返す。
  const rut = canvasTex(128, 256, (g, w, h) => {
    const r = rnd(23);
    for (const cx of [w * 0.25, w * 0.75]) {
      for (let y = 0; y < h; y += 2) {
        const wob = Math.sin(y * 0.05 + cx) * 2 + (r() - 0.5) * 2;
        const gr = g.createLinearGradient(cx - 16 + wob, 0, cx + 16 + wob, 0);
        gr.addColorStop(0, 'rgba(130,110,80,0)'); gr.addColorStop(0.18, 'rgba(140,118,86,0.35)');
        gr.addColorStop(0.35, 'rgba(26,19,12,0.75)'); gr.addColorStop(0.65, 'rgba(30,22,14,0.75)');
        gr.addColorStop(0.82, 'rgba(140,118,86,0.3)'); gr.addColorStop(1, 'rgba(130,110,80,0)');
        g.fillStyle = gr; g.fillRect(cx - 16 + wob, y, 32, 2);
      }
    }
    // 間の蹄と足の跡
    for (let i = 0; i < 18; i++) { g.fillStyle = 'rgba(28,20,12,0.45)'; g.beginPath(); g.ellipse(w / 2 + (r() - 0.5) * 30, r() * h, 4, 7, r(), 0, 7); g.fill(); }
  });
  // 水たまり：濁った暗い泥水。縁は濡れた土に溶かし、明るい輪にしない（空を映した白い輪に見えていた。箕作 10/29）。
  const pool = canvasTex(128, 128, (g, w, h) => {
    const r = rnd(37);
    g.fillStyle = 'rgba(0,0,0,0)'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9; i++) {
      const x = w / 2 + (r() - 0.5) * 50, y = h / 2 + (r() - 0.5) * 40, rad = 18 + r() * 22;
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, 'rgba(92,84,72,0.34)'); gr.addColorStop(0.55, 'rgba(78,66,52,0.24)'); gr.addColorStop(1, 'rgba(70,58,44,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, rad, 0, 7); g.fill();
    }
  }, true);
  // 丈の高い草：細く弓なりの葉の束（10/29 b3）。葉ごとに青い緑〜枯れ色を揺らし、彩度は低め。
  //   根元は土に沈む暗さ、穂先ほど明るい。先の細い塗りの葉（線の太さが一定の棒に見せない）。
  const grass = canvasTex(256, 256, (g, w, h) => {
    const r = rnd(51);
    const hues = [[0.62, 0.68, 0.46], [0.56, 0.62, 0.42], [0.7, 0.7, 0.5], [0.82, 0.74, 0.52], [0.9, 0.8, 0.58]];
    for (let i = 0; i < 38; i++) {
      const x0 = w * 0.5 + (r() - 0.5) * w * 0.22, side = r() < 0.5 ? -1 : 1;
      const tall = 0.45 + r() * 0.5, lean = side * (0.04 + r() * r() * 0.4) * w;
      const tipY = h * (1 - tall) + Math.abs(lean) * 0.35 * r(), tipX = x0 + lean;
      const cx = x0 + lean * 0.15, cy = h - (h - tipY) * (0.75 + r() * 0.2);
      const bw = 2.2 + r() * 2.6;
      const c = hues[Math.floor(r() * r() * hues.length)], v = 150 + r() * 75;
      const gr = g.createLinearGradient(0, h, 0, tipY);
      gr.addColorStop(0, `rgb(${v * c[0] * 0.32 | 0},${v * c[1] * 0.32 | 0},${v * c[2] * 0.3 | 0})`);
      gr.addColorStop(0.35, `rgb(${v * c[0] * 0.7 | 0},${v * c[1] * 0.7 | 0},${v * c[2] * 0.66 | 0})`);
      gr.addColorStop(1, `rgb(${Math.min(255, v * c[0] * 1.12) | 0},${Math.min(255, v * c[1] * 1.08) | 0},${Math.min(255, v * c[2] * 1.02) | 0})`);
      g.fillStyle = gr;
      g.beginPath(); g.moveTo(x0 - bw, h);
      g.quadraticCurveTo(cx - bw * 0.6, cy, tipX, tipY);
      g.quadraticCurveTo(cx + bw * 0.6, cy, x0 + bw, h); g.closePath(); g.fill();
      // 穂：枯れた葉の先にだけ、細い淡い穂
      if (c[0] > 0.8 && r() < 0.35) { g.fillStyle = 'rgba(206,192,156,0.95)'; g.beginPath(); g.ellipse(tipX, tipY + 6, 1.6, 8, lean * 0.004, 0, 7); g.fill(); }
    }
  });
  // 土埃・靄：柔らかな丸
  const puff = canvasTex(64, 64, (g, w) => {
    const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, w);
  });
  // 接地の影：置いた物の下の柔らかな暗がり。縁は透かして地面に溶かす。
  const blot = canvasTex(64, 64, (g, w) => {
    const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.45, 'rgba(0,0,0,0.7)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, w);
  });
  rut.wrapT = THREE.RepeatWrapping;
  TEX = { mud, rut, pool, grass, puff, blot };
  return TEX;
}

// ---- 形（一度だけ作る） ----
let GEO = null;
function paint(geo, hex) {
  const c = new THREE.Color(hex), n = geo.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo.index ? geo.toNonIndexed() : geo;
}
function shapes() {
  if (GEO) return GEO;
  const flat = (w, d) => { const g = new THREE.PlaneGeometry(w, d); g.rotateX(-Math.PI / 2); return g; };
  // 倒れた長柄の槍：三間ほどの柄と穂。地面に寝かせる（+x が穂先）
  const shaft = new THREE.CylinderGeometry(0.022, 0.026, 4.6, 5, 1, true); shaft.rotateZ(Math.PI / 2); shaft.translate(0, 0.03, 0);
  const tip = new THREE.ConeGeometry(0.028, 0.3, 4); tip.rotateZ(-Math.PI / 2); tip.translate(2.45, 0.03, 0);
  const spear = mergeGeometries([paint(shaft, 0x3a2c1e), paint(tip, 0x8a8c8c)]);
  // 地に刺さった矢：細い篦と白い矢羽根（斜めに刺さる）
  const arrows = [];
  for (let k = 0; k < 3; k++) {
    const a = new THREE.CylinderGeometry(0.006, 0.006, 0.75, 3, 1, true); a.translate(0, 0.32, 0);
    const f = new THREE.PlaneGeometry(0.03, 0.14); f.translate(0, 0.62, 0);
    const one = mergeGeometries([paint(a, 0x6e5a3e), paint(f, 0xd8d0bc)]);
    one.rotateZ(0.35 + k * 0.12); one.rotateY(k * 2.1); one.translate((k - 1) * 0.35, 0, (k % 2) * 0.3);
    arrows.push(one);
  }
  const arrow = mergeGeometries(arrows);
  // 脱げた陣笠：浅い円錐を伏せずに転がした形
  // 脱げた陣笠：鉢を上にして縁を土に付け、片側を少し浮かせる。縁の側は泥で汚す（宙に立つ黒い輪に見えた。10/29）
  const kasa = new THREE.ConeGeometry(0.34, 0.13, 12, 2, true); kasa.translate(0, 0.065, 0); kasa.rotateZ(0.16); kasa.translate(0, 0.02, 0);
  const kasaG = paint(kasa, 0x3a3024);
  { const p = kasaG.attributes.position, c = kasaG.attributes.color;
    for (let i = 0; i < p.count; i++) { const k = Math.min(1, Math.max(0, p.getY(i) / 0.12)); c.setXYZ(i, c.getX(i) * (0.62 + k * 0.38), c.getY(i) * (0.6 + k * 0.4), c.getZ(i) * (0.58 + k * 0.42)); } }
  // 折れた旗指物：短い竿と泥に落ちた布（布は色を後で替える。竿は暗い木）
  const pole = new THREE.CylinderGeometry(0.02, 0.02, 2.2, 4, 1, true); pole.rotateZ(Math.PI / 2 - 0.08); pole.translate(0.2, 0.06, 0);
  const cloth = new THREE.PlaneGeometry(0.62, 1.3, 2, 3); cloth.rotateX(-Math.PI / 2 + 0.12);
  { const p = cloth.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) + 0.012 + Math.max(0, Math.sin(p.getX(i) * 7 + p.getZ(i) * 4)) * 0.03); }
  cloth.translate(1.0, 0, 0.45);
  const clothG = paint(cloth, 0xffffff);
  { const p = clothG.attributes.position, c = clothG.attributes.color;
    for (let i = 0; i < p.count; i++) { const k = 0.55 + 0.45 * Math.min(1, Math.max(0, 1 - Math.abs(p.getZ(i) - 0.45) / 0.7)) * (0.7 + 0.3 * Math.sin(p.getX(i) * 11)); c.setXYZ(i, k, k * 0.96, k * 0.9); } }
  const flag = mergeGeometries([paint(pole, 0x2e241a), clothG]);
  // 嵐で折れた枝：太い枝と小枝と葉の塊
  const lim = new THREE.CylinderGeometry(0.07, 0.13, 3.4, 6, 1, true); lim.rotateZ(Math.PI / 2 - 0.1); lim.translate(0, 0.12, 0);
  const tw1 = new THREE.CylinderGeometry(0.02, 0.05, 1.4, 4, 1, true); tw1.rotateZ(0.9); tw1.rotateY(0.6); tw1.translate(1.0, 0.45, 0.3);
  const tw2 = new THREE.CylinderGeometry(0.02, 0.05, 1.2, 4, 1, true); tw2.rotateZ(-0.8); tw2.rotateY(-0.5); tw2.translate(0.4, 0.4, -0.35);
  const leaf = new THREE.IcosahedronGeometry(0.55, 0); leaf.scale(1.4, 0.6, 1); leaf.translate(1.55, 0.45, 0.1);
  const leaf2 = new THREE.IcosahedronGeometry(0.45, 0); leaf2.scale(1.2, 0.55, 1); leaf2.translate(0.7, 0.35, -0.55);
  const branch = mergeGeometries([paint(lim, 0x3c3024), paint(tw1, 0x3c3024), paint(tw2, 0x3c3024), paint(leaf, 0x2f3a22), paint(leaf2, 0x34401f)]);
  // 丈の高い草：細い葉の束を六枚の板に分け、向き・傾き・根の位置をずらして交差させる。
  //   上ほど外へ倒して弓なりに曲げる。手前の大きな株でも、一枚の板の向き（扇の面）が見えないようにする（10/29 b3）。
  const blades = [];
  for (let k = 0; k < 6; k++) {
    const wd = 0.36 + (k % 3) * 0.08, ht = 0.8 + ((k * 5) % 3) * 0.1;
    const p = new THREE.PlaneGeometry(wd, ht, 1, 2), q = p.attributes.position;
    const lean = 0.1 + (k % 3) * 0.09;
    for (let i = 0; i < q.count; i++) {
      const t = q.getY(i) / ht + 0.5;
      q.setXYZ(i, q.getX(i) * (0.35 + t * 0.8), t * ht * (1 - t * lean * 0.6), lean * t * t);
    }
    p.rotateZ((k % 2 ? 1 : -1) * (0.08 + (k % 3) * 0.05));
    p.rotateY(k * 2.4 + 0.2);
    p.translate(Math.cos(k * 1.9) * 0.06, 0, Math.sin(k * 1.9) * 0.06);
    blades.push(p);
  }
  const grass = mergeGeometries(blades);
  { const n = grass.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0); }   // 葉は地面と同じ光を受ける
  GEO = { mud: flat(1, 1), rut: flat(1, 1), pool: flat(1, 1), blot: flat(1, 1), spear, arrow, kasa: kasaG, flag, branch, grass };
  return GEO;
}

// ---- 足元の草の株（共通。10/29 b3） ----
// 細く弓なりの葉を十枚、根の位置と向きを散らして交差させる（板の向き・扇の面が見えない）。
// 高さ1（いちばん高い葉）・広がり半径0.5ほど。頂点の色：根元は暗く、穂先ほど明るい。葉ごとに緑〜枯れ色、彩度は低め。
// 法線は根元ほど横へ寝かせ、頂点の色を使わない材質でも根元が暗く見える。一つの形を全戦で使い回す（三十三角）。
// kind='sedge'：低く広く垂れる夏草（羊歯の平たい三角の代わり。高さ0.4・半径0.9ほど・七枚）。
const FIELD_GRASS = {};
let FIELD_GRASS_MAT = null;
export function fieldGrassGeo(kind = 'grass') {
  if (FIELD_GRASS[kind]) return FIELD_GRASS[kind];
  const sedge = kind === 'sedge', NB = sedge ? 7 : 10;
  const pos = [], col = [], nor = [];
  const hues = [[0.5, 0.56, 0.36], [0.44, 0.5, 0.32], [0.56, 0.58, 0.4], [0.66, 0.6, 0.42], [0.74, 0.66, 0.46]];
  for (let i = 0; i < NB; i++) {
    const a = i * 2.39996 + Math.sin(i * 7.1) * 0.3, ca = Math.cos(a), sa = Math.sin(a);
    const r0 = 0.015 + (i % 3) * 0.022, bx = Math.cos(a + 1.3) * r0, bz = Math.sin(a + 1.3) * r0;
    const h = sedge ? 0.3 + (i % 3) * 0.06 : 0.55 + ((i * 7) % 10) * 0.05, lean = sedge ? 0.55 + (i % 3) * 0.17 : 0.12 + ((i * 3) % 5) * 0.09;
    const w = sedge ? 0.028 + (i % 2) * 0.008 : 0.016 + (i % 2) * 0.006;
    const tw = (i % 2 ? 1 : -1) * 0.5;   // 葉を中ほどでねじる
    const c = hues[(i * 3) % 5 === 4 || i === 7 ? 4 : (i * 3) % 4];
    const pt = (t, side) => {
      const ang = a + Math.PI / 2 + tw * t, ww = w * (1 - t) * side;
      const out = sedge ? lean * t : lean * t * t, y = sedge ? h * (2.1 * t - 1.35 * t * t) : h * (t * (1.25 - 0.25 * t)) * (1 - lean * 0.35 * t * t);
      return [bx + ca * out + Math.cos(ang) * ww, y, bz + sa * out + Math.sin(ang) * ww];
    };
    const T = [0, 0.48, 1];
    for (let s = 0; s < 2; s++) {
      const t0 = T[s], t1 = T[s + 1];
      const L0 = pt(t0, -1), R0 = pt(t0, 1), L1 = pt(t1, -1), R1 = pt(t1, 1);
      const tri = s === 1 ? [[L0, t0], [R0, t0], [L1, t1]] : [[L0, t0], [R0, t0], [R1, t1], [L0, t0], [R1, t1], [L1, t1]];
      for (const [v, t] of tri) {
        pos.push(...v);
        const k = 0.3 + 0.75 * Math.pow(t, 0.8);
        col.push(Math.min(1, c[0] * k * 1.35), Math.min(1, c[1] * k * 1.35), Math.min(1, c[2] * k * 1.35));
        const up = 0.35 + 0.65 * t, nx = ca * (1 - up) + Math.cos(a + Math.PI / 2) * 0.2, nz = sa * (1 - up) + Math.sin(a + Math.PI / 2) * 0.2;
        const l = Math.hypot(nx, up, nz); nor.push(nx / l, up / l, nz / l);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.dispose = () => {};   // 全戦で共有する形。戦の後始末で消さない
  return (FIELD_GRASS[kind] = g);
}
export function fieldGrassMat() {
  if (!FIELD_GRASS_MAT) { FIELD_GRASS_MAT = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, side: THREE.DoubleSide }); FIELD_GRASS_MAT.dispose = () => {}; }
  return FIELD_GRASS_MAT;
}

// ---- 材質（一度だけ作る。濡れ具合は戦ごとに数値だけ替える） ----
let MAT = null;
function materials() {
  if (MAT) return MAT;
  const T = textures();
  const decal = (map, extra = {}) => new THREE.MeshStandardMaterial({
    map, transparent: true, depthWrite: false, roughness: 0.95, metalness: 0,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, ...extra,
  });
  const grass = new THREE.MeshStandardMaterial({ map: T.grass, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.9, metalness: 0 });
  // 草の先だけを風でそよがせる（形は動かさず、描く時に先をずらすだけ）。
  const sway = { value: 0 };
  grass.onBeforeCompile = (sh) => {
    sh.uniforms.tsSway = sway;
    sh.vertexShader = 'uniform float tsSway;\n' + sh.vertexShader.replace('#include <begin_vertex>',
      `#include <begin_vertex>
      #ifdef USE_INSTANCING
      float tsPh = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.53;
      #else
      float tsPh = 0.0;
      #endif
      float tsK = max(0.0, position.y) * max(0.0, position.y);
      // カメラのすぐ前の株は縮めて、自分の姿を隠さない。
      #ifdef USE_INSTANCING
      transformed *= smoothstep(3.0, 7.5, distance(cameraPosition.xz, instanceMatrix[3].xz));
      #endif
      transformed.x += sin(tsSway * 1.7 + tsPh) * 0.12 * tsK;
      transformed.z += cos(tsSway * 1.3 + tsPh) * 0.08 * tsK;`);
  };
  // 草の色の彩度を落とす（鮮やかな黄緑の板に見せない）。戦ごとの色は保ち、灰へ三割寄せる。
  const _fs = grass.onBeforeCompile;
  grass.onBeforeCompile = (sh) => {
    _fs(sh);
    sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      diffuseColor.rgb = mix(vec3(dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11))), diffuseColor.rgb, 0.68);`);
  };
  grass.customProgramCacheKey = () => 'tsGrass2';
  // grassShape:'blade' の戦の草：絵の板でなく、共通の細い葉の株（fieldGrassGeo）。そよぎと彩度は同じ。
  const grassBlade = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.9, metalness: 0 });
  grassBlade.onBeforeCompile = grass.onBeforeCompile;
  grassBlade.customProgramCacheKey = () => 'tsGrassBlade';
  MAT = {
    mud: decal(T.mud),
    rut: decal(T.rut),
    pool: decal(T.pool, { roughness: 0.5, metalness: 0, envMapIntensity: 0.3, opacity: 0.5, emissiveIntensity: 0.04 }),
    blot: new THREE.MeshBasicMaterial({ map: T.blot, color: 0x000000, transparent: true, opacity: 0.42, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }),
    solid: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0, side: THREE.DoubleSide }),
    grass, grassBlade, sway,
    puff: new THREE.PointsMaterial({ map: T.puff, size: 7, sizeAttenuation: true, transparent: true, depthWrite: false, opacity: 0.12, color: 0xb8a68a }),
  };
  return MAT;
}

// 置き物の束（InstancedMesh）。数は上限まで先に取り、使う分だけ描く。
function pool(scene, geo, mat, cap, o = {}) {
  const m = new THREE.InstancedMesh(geo, mat, cap);
  m.count = 0; m.frustumCulled = false;
  m.castShadow = !!o.cast; m.receiveShadow = true;
  m.userData.noMerge = true; m.userData.noFreeze = true;
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.userData.timeslip = true;
  if (o.color) m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
  scene.add(m);
  return m;
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const _mud = new THREE.Color(0x4e4234);
const _tx = new THREE.Vector3(), _tz = new THREE.Vector3();
const _n = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _qy = new THREE.Quaternion(), _c = new THREE.Color();
const _lean = new THREE.Vector3(1, 0, 0), _dry = new THREE.Color();

// 道のそばか・道の向き（轍を道に沿わせる）
function nearPath(paths, x, z) {
  let best = Infinity, dir = 0, w = 4;
  for (const p of paths) {
    const pts = p.pts || p; if (!pts || pts.length < 2) continue;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
      const d = Math.hypot(x - ax - dx * t, z - az - dz * t);
      if (d < best) { best = d; dir = Math.atan2(dx, dz); w = p.w || 4; }
    }
  }
  return { d: best, dir, w };
}

export function timeslipField(rt) {
  const ts = rt.def.timeslip; if (!ts || globalThis.__noTimeslip || globalThis.__apx?.noTimeslip) return null;   // __noTimeslip：重さを前後で比べる時だけ
  const W = rt.world, scene = rt.scene;
  const G = shapes(), M = materials();
  const wet = ts.wet ?? 0, dust = ts.dust ?? 0.5;
  M.mud.color.setHex(ts.mudColor ?? (wet > 0.5 ? 0x8a7a68 : 0xa08c70));   // mudColor：夜の戦は暗い土（月明かりの地面より明るい斑を浮かせない）
  M.mud.roughness = wet > 0.5 ? 0.45 : 0.95;
  M.mud.opacity = Math.min(ts.mudOpacity ?? (wet > 0.5 ? 0.42 : 0.25), 0.42);   // 濃い絵と土色を掛けても、地肌を残して黒つぶれを防ぐ。
  M.rut.color.copy(M.mud.color); M.rut.roughness = M.mud.roughness; M.rut.opacity = Math.min(M.mud.opacity * 1.3, 0.5);
  // 泥の色を暗くして、空の色をわずかに混ぜる（白く光らせない）。
  M.pool.color.copy(M.mud.color).multiplyScalar(0.62).lerp(_c.copy(W.hemi?.color || _c.setHex(0xb8cbd8)).multiplyScalar(0.5), 0.18);
  M.pool.emissive.copy(M.pool.color).multiplyScalar(0.5);
  // poolDim：暗い嵐の昼など、地面より明るい水たまりが白い染みに見える戦だけ映りを落とす（桶狭間 10/28）。
  if (ts.poolDim) { M.pool.color.multiplyScalar(ts.poolDim); M.pool.emissive.multiplyScalar(ts.poolDim * 0.4); }
  M.grass.color.setHex(ts.grass ?? 0x8a9a5a);
  // 指定した戦だけ葉の垂れる株へ替える。次の戦では共有の絵へ戻す。
  M.grass.map = ts.grassTexture ? leafTex(ts.grassTexture) : textures().grass;
  M.grass.emissive.copy(M.grass.color).multiplyScalar(ts.grassLift || 0);   // 夜の戦：篝火に照らされた地面の上で、草だけ黒い影に見せない
  const blade = ts.grassShape === 'blade';
  if (blade) { M.grassBlade.color.set(0xffffff).lerp(M.grass.color, 0.35); M.grassBlade.emissive.copy(M.grass.emissive); }
  M.puff.color.setHex(ts.hazeColor ?? (wet > 0.5 ? 0xc4cacc : 0xbaa686));   // 夜の戦は暗い靄（光る白い粒にしない）
  M.puff.size = wet > 0.5 ? 9 : 6;
  const P = {
    mud: pool(scene, G.mud, M.mud, CAP.mud),
    rut: pool(scene, G.rut, M.rut, CAP.rut),
    pool: wet > 0.3 && (ts.pools ?? 1) > 0 ? pool(scene, G.pool, M.pool, CAP.pool) : null,
    spear: pool(scene, G.spear, M.solid, CAP.spear),
    arrow: pool(scene, G.arrow, M.solid, CAP.arrow),
    kasa: pool(scene, G.kasa, M.solid, CAP.kasa),
    flag: pool(scene, G.flag, M.solid, CAP.flag, { color: true }),
    blot: pool(scene, G.blot, M.blot, CAP.blot),
    branch: ts.branches ? pool(scene, G.branch, M.solid, CAP.branch, { cast: true }) : null,
    grass: pool(scene, blade ? fieldGrassGeo() : G.grass, blade ? M.grassBlade : M.grass, Math.min(560, ts.grassCap ?? CAP.grass), { color: true }),   // grassCap：芒の原など草の多い戦だけ株の上限を上げる（三角は少ない板二枚）
  };
  // ---- 地を這う土埃・靄（一つの点の束。風に流れ、近くで斬り合うと濃くなる） ----
  const NP = 26, haze = new Float32Array(NP * 3);
  const hazeGeo = new THREE.BufferGeometry(); hazeGeo.setAttribute('position', new THREE.BufferAttribute(haze, 3).setUsage(THREE.DynamicDrawUsage));
  const puffs = new THREE.Points(hazeGeo, M.puff); puffs.frustumCulled = false; puffs.renderOrder = 2; puffs.userData.noMerge = true; puffs.userData.timeslip = true;
  scene.add(puffs);
  const paths = [...(W.def.paths || []), ...(ts.paths || [])];
  const fights = (typeof ts.fights === 'function' ? ts.fights(rt) : ts.fights) || [];
  const flagColors = (ts.flagColors || [0xe8e2d2, 0x1c1a18]).map((h) => new THREE.Color(h).lerp(_mud, 0.4));   // 地に落ちた布は泥を吸う。白地のまま地面に白い四角が浮いていた（10/28）
  const grassColors = (ts.grassTints || [0xffffff, 0xd8e0b8, 0xf0e2b0]).map((h) => new THREE.Color(h));
  const streams = W.def.streams || [];
  const paddy = W.def.paddy;
  const skip = ts.skip;   // 置かない所（陣の中・城の中など）
  const noGrass = ts.noGrass;   // 草だけ生やさない所（砦の庭・町屋の中など。踏み跡と倒れた物は置く）

  // 地面の傾きに合わせて寝かせる
  // ex・ez は物の半分の長さ（回した後の手前の軸と横の軸）。両端の高さから面を決め、中ほどが窪めば窪みへ下ろして端を浮かせない。
  function lay(x, z, rot, sx, sy, sz, lift = 0.03, ex = 0.6, ez = 0.6) {
    ex = Math.max(0.6, ex); ez = Math.max(0.6, ez);
    const c = Math.cos(rot), s = Math.sin(rot), ax = c * ex, az = -s * ex, bx = s * ez, bz = c * ez;
    const h = W.heightAt(x, z), xp = W.heightAt(x + ax, z + az), xm = W.heightAt(x - ax, z - az);
    const zp = W.heightAt(x + bx, z + bz), zm = W.heightAt(x - bx, z - bz);
    _tx.set(2 * ax, xp - xm, 2 * az); _tz.set(2 * bx, zp - zm, 2 * bz);
    _n.crossVectors(_tz, _tx).normalize();
    _q.setFromUnitVectors(_up, _n).multiply(_qy.setFromAxisAngle(_up, rot));
    _p.set(x, Math.min(h, (xp + xm + zp + zm) / 4) + lift, z); _s.set(sx, sy, sz);
    return _m.compose(_p, _q, _s);
  }
  // 倒れた物の下に柔らかな接地の影を敷く（物と同じ面に）
  function blot(x, z, rot, w, d, ex, ez) { put(P.blot, lay(x, z, rot, w, 1, d, 0.02, ex, ez)); }
  function put(mesh, mtx) {
    if (!mesh || mesh.count >= mesh.instanceMatrix.count) return -1;
    mesh.setMatrixAt(mesh.count, mtx);
    return mesh.count++;
  }
  function putGround(mesh, x, z, rot, sx, sz, lift) {
    // 普請中の土の砦は足跡を残す。砂利を敷いた城では従来どおり除く。
    if (!mesh || !ts.workGround && overlapsCastleGround(W, x, z, Math.hypot(sx, sz) * 0.5)) return;
    put(mesh, lay(x, z, rot, sx, 1, sz, lift, sx * 0.5, sz * 0.5));
  }
  // 川からの近さ（水の上は 0 未満。岸の葦に使う）
  function bank(x, z) {
    let b = Infinity;
    for (const st of streams) if (st.pts) b = Math.min(b, distToPolyline(x, z, st.pts) - (st.w || 2) - 0.6);
    return b;
  }
  function fightNear(x, z) {
    let k = 0;
    for (const f of fights) { const d = Math.hypot(x - f[0], z - f[1]); if (d < f[2]) k = Math.max(k, 1 - d / f[2]); }
    return k;
  }

  let cx = 1e9, cz = 1e9, castleCount = -1;
  function rebuild(fx, fz) {
    cx = fx; cz = fz;
    castleCount = W._castlePolys?.length || 0;
    for (const k in P) if (P[k]) P[k].count = 0;
    const i0 = Math.floor((fx - RADIUS) / CELL), i1 = Math.floor((fx + RADIUS) / CELL);
    const j0 = Math.floor((fz - RADIUS) / CELL), j1 = Math.floor((fz + RADIUS) / CELL);
    // 近い升から埋める（上限に届いても、足元が先に満ちる）
    const cells = [];
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const x = (i + 0.5) * CELL, z = (j + 0.5) * CELL, d = Math.hypot(x - fx, z - fz);
      if (d < RADIUS) cells.push(d * 1000 + cells.length, i, j);
    }
    const order = [];
    for (let k = 0; k < cells.length; k += 3) order.push(k);
    order.sort((a, b) => cells[a] - cells[b]);
    const lim = W.def.moveLim || W.half || 300;
    for (const k of order) {
      const i = cells[k + 1], j = cells[k + 2];
      const r = (n) => h01(i, j, n);
      const x = (i + r(1)) * CELL, z = (j + r(2)) * CELL;
      if (Math.abs(x) > lim || Math.abs(z) > lim) continue;
      if (skip && skip(x, z)) continue;
      // 急な斜面（城山・堤の法）には置かない。平らな跡を斜面に寝かせると縁が地面に切られて四角い影に見える。
      if (ts.maxSlope && Math.hypot(W.heightAt(x + 1.5, z) - W.heightAt(x - 1.5, z), W.heightAt(x, z + 1.5) - W.heightAt(x, z - 1.5)) / 3 > ts.maxSlope) continue;
      const bk = bank(x, z);
      if (bk < 0) continue;
      if (W.def.water && W.inWaterAt?.(x, z)) continue;   // 湖・海の水面に泥や矢を浮かべない
      const road = nearPath(paths, x, z), onRoad = road.d < road.w * 0.5 + 0.8;
      const pd = paddy ? paddy(x, z) : 0;
      const fight = fightNear(x, z);
      const trample = Math.min(1, (onRoad ? 0.8 : 0) + fight * 0.8 + (ts.trample ?? 0.25));
      // 轍：道の上だけ、道に沿って
      if (onRoad && r(3) < 0.75) {
        const rx = (i + 0.5) * CELL, rz = (j + 0.5) * CELL;
        putGround(P.rut, rx + (r(4) - 0.5), rz + (r(5) - 0.5), road.dir + (r(6) - 0.5) * 0.12, 1.9, CELL + 1.5, 0.035);
      }
      // 踏み荒らした泥（田の水面には置かない）
      if (pd < 0.4 && r(7) < trample) putGround(P.mud, x, z, r(8) * 6.28, 2.4 + r(9) * 2.6, 2 + r(10) * 2.4, 0.03);
      // 水たまり：雨の日の凹みと道
      if (P.pool && pd < 0.4 && r(11) < wet * (ts.pools ?? 1) * (onRoad ? 0.7 : 0.35)) {
        const px = (i + r(12)) * CELL, pz = (j + r(13)) * CELL;
        putGround(P.pool, px, pz, r(14) * 6.28, 1 + r(15) * 2.2, 0.8 + r(16) * 1.6, 0.04);
      }
      // 倒れた物：戦った所ほど多い
      const db = (ts.debris ?? 1) * (0.25 + fight * 1.6);
      if (r(17) < 0.1 * db) {
        const sx = (i + r(18)) * CELL, sz = (j + r(19)) * CELL, rot = r(20) * 6.28;
        const m = lay(sx, sz, rot, 1, 1, 1, -0.012, 2.45, 0.3);
        if (!ts.laySpear || ts.laySpear(W, sx, sz, rot, m)) { put(P.spear, m); blot(sx, sz, rot, 5.2, 0.4, 2.45, 0.3); }
      }
      if (r(21) < 0.2 * db * (ts.arrows ?? 1)) { const ax = (i + r(22)) * CELL, az = (j + r(23)) * CELL; put(P.arrow, lay(ax, az, r(24) * 6.28, 1, 1, 1, -0.05)); }
      if (r(25) < 0.04 * db) {
        const kx = (i + r(26)) * CELL, kz = (j + r(27)) * CELL, kr = r(28) * 6.28;
        put(P.kasa, lay(kx, kz, kr, 1, 1, 1, -0.02, 0.35, 0.35)); blot(kx, kz, kr, 1.0, 1.0, 0.35, 0.35);
      }
      if (r(29) < 0.025 * db) {
        const fx = (i + r(30)) * CELL, fz = (j + r(31)) * CELL, fr = r(32) * 6.28;
        const n = put(P.flag, lay(fx, fz, fr, 1, 1, 1, -0.005, 1.3, 1.1));
        if (n >= 0) { P.flag.setColorAt(n, flagColors[Math.floor(r(33) * flagColors.length) % flagColors.length]); blot(fx + Math.cos(fr) * 0.7, fz - Math.sin(fr) * 0.7, fr, 2.4, 1.6, 1.3, 1.1); }
      }
      if (P.branch && r(34) < ts.branches) {
        const bx = (i + r(35)) * CELL, bz = (j + r(36)) * CELL, br = r(37) * 6.28, bs = 0.9 + r(38) * 0.5;
        put(P.branch, lay(bx, bz, br, bs, 0.9 + r(38) * 0.4, 0.9 + r(39) * 0.5, -0.03, 1.7 * bs, 0.6));
        blot(bx + Math.cos(br) * 0.6 * bs, bz - Math.sin(br) * 0.6 * bs, br, 3.8 * bs, 1.8, 1.7 * bs, 0.6);
      }
      // 季節の丈の高い草：道と田と踏まれた所を避け、株で固まる
      if (!onRoad && pd < 0.3 && !(noGrass && noGrass(x, z))) {
        const cover = W.grassAt ? W.grassAt(x, z) : 1;
        const want = Math.max((ts.tallGrass ?? 1) * cover * (1 - trample * 0.6), bk < 7 ? (ts.reeds ?? 0) : 0);
        for (let g = 0; g < 3; g++) {
          if (r(40 + g) > want * 0.8) continue;
          const gx = (i + r(43 + g)) * CELL, gz = (j + r(46 + g)) * CELL;
          const s = 0.7 + r(49 + g) * 0.9;
          // 踏まれた所は低く傾いた株にする。同じ草の形と株数を使う。
          const crushed = ts.crushedGrass ? fightNear(gx, gz) * .65 : 0;
          _q.setFromAxisAngle(_up, r(52 + g) * 6.28);
          if (crushed > 0) _q.multiply(_qy.setFromAxisAngle(_lean, crushed * .9));
          _m.compose(_p.set(gx, W.heightAt(gx, gz) - 0.05, gz), _q, _s.set(s, s * (0.8 + r(55 + g) * 0.6) * (ts.grassH ?? 1) * (1 - crushed * .65), s));
          const n = put(P.grass, _m);
          // 株ごとに明るさと枯れ具合を揺らす（同じ黄緑の株が並ばない）。三割ほどは枯れ色へ寄せる。
          if (n >= 0) {
            _c.copy(grassColors[Math.floor(r(58 + g) * grassColors.length) % grassColors.length]);
            const dry = r(61 + g), lit = 0.8 + r(64 + g) * 0.24;
            if (dry < 0.32) _c.multiply(_dry.setRGB(1.1, 0.96, 0.74));
            _c.multiplyScalar(lit);
            P.grass.setColorAt(n, _c);
          }
        }
      }
    }
    for (const k in P) if (P[k]) {
      P[k].visible = P[k].count > 0;   // 空の束は描かない
      P[k].instanceMatrix.needsUpdate = true;
      if (P[k].instanceColor) P[k].instanceColor.needsUpdate = true;
    }
  }

  // 靄と土埃の粒：カメラのまわり三十メートルに散らし、風で流す
  for (let k = 0; k < NP; k++) { haze[k * 3] = 1e5; haze[k * 3 + 1] = -1e5; haze[k * 3 + 2] = 1e5; }
  let fightT = 0, heat = 0, t = 0;
  function tick(dt) {
    const cam = rt.camera || rt.game?.camera; const f = cam ? cam.position : rt.player?.u?.pos;
    if (!f) return;
    if (Math.hypot(f.x - cx, f.z - cz) > MOVE || castleCount !== (W._castlePolys?.length || 0)) rebuild(f.x, f.z);
    t += dt; M.sway.value = t * (0.8 + (WIND_STATE.gust || 1) * 0.6);
    // 近くで斬り合う兵の数（半秒ごと）で土埃を濃くする
    fightT -= dt;
    if (fightT <= 0) {
      fightT = 0.5;
      let n = 0; const pp = rt.player?.u?.pos;
      if (pp && rt.army) for (const u of rt.army.units) if (u.alive && (u.atk || u.swing || u.target) && Math.abs(u.pos.x - pp.x) < 25 && Math.abs(u.pos.z - pp.z) < 25) n++;
      heat = Math.min(1, n / 18);
    }
    const want = (0.05 + dust * 0.06 + heat * 0.12 * (0.4 + dust)) * (wet > 0.5 ? 0.9 : 1);
    M.puff.opacity += (want - M.puff.opacity) * Math.min(1, dt * 1.5);
    const wx = WIND_STATE.dirX ?? 0.56, wz = WIND_STATE.dirZ ?? 0.82, sp = (wet > 0.5 ? 0.6 : 1.1) * (WIND_STATE.gust || 1);
    for (let k = 0; k < NP; k++) {
      let x = haze[k * 3], z = haze[k * 3 + 2];
      x += wx * sp * dt; z += wz * sp * dt;
      if (Math.hypot(x - f.x, z - f.z) > 32) {
        const a = Math.random() * 6.28, d = 6 + Math.random() * 24;
        x = f.x + Math.sin(a) * d; z = f.z + Math.cos(a) * d;
      }
      haze[k * 3] = x; haze[k * 3 + 2] = z; haze[k * 3 + 1] = W.heightAt(x, z) + 0.7 + (k % 3) * 0.35;
    }
    hazeGeo.attributes.position.needsUpdate = true;
  }

  // 戦ごとの置き物（陣幕・馬防柵・竹束・逆茂木・幟の列・俵）。史実の場所に一度だけ置く。
  // 坂の上の積み物は四隅で一番低い所まで下ろして浮かせず、下に接地の影を一枚敷く（形と材質は散らし物と共用）
  const seat = (o, x, z, rot, ex, ez) => {
    const c = Math.cos(rot), sn = Math.sin(rot);
    let lo = W.heightAt(x, z);
    for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) lo = Math.min(lo, W.heightAt(x + c * ex * a + sn * ez * b, z - sn * ex * a + c * ez * b));
    o.position.y = lo - 0.03;
    const sh = new THREE.Mesh(G.blot, M.blot);
    sh.matrix.copy(lay(x, z, rot, ex * 2.6, 1, ez * 2.6, 0.02, ex, ez)); sh.matrixAutoUpdate = false;
    sh.userData.timeslip = true; scene.add(sh);
    return o;
  };
  const kit = makeKitBatch(), tag = (o) => { if (o && o.isObject3D) { o.userData.timeslip = true; scene.add(o); } return o; };
  for (const s of ts.sets || []) {
    let o = null;
    if (s.k === 'sakamogi') o = sakamogi(W, s.x, s.z, s.rot || 0, s.len || 6, kit);
    else if (s.k === 'takataba') { for (let n = 0; n < (s.n || 1); n++) tag(takataba(W, s.x + Math.cos(s.rot || 0) * n * 2.1, s.z - Math.sin(s.rot || 0) * n * 2.1, s.rot || 0)); }
    else if (s.k === 'nobori') {
      const n = s.n || 1, dx = s.dx ?? 3, dz = s.dz ?? 0;
      for (let q = 0; q < n; q++) tag(nobori(W, s.x + dx * q, s.z + dz * q, s.kind || 'oda', s.h || 5));
    }
    else if (s.k === 'jinmaku') o = jinmaku(W, s.x, s.z, s.w || 10, s.d || 8, s.gap ?? 4, { mon: s.mon });
    else if (s.k === 'bobosaku') o = bobosaku(W, s.seg, { noTrench: true });
    else if (s.k === 'tawara') o = seat(tawara(W, s.x, s.z, s.rot || 0, s.n || 6), s.x, s.z, s.rot || 0, 0.55, (s.n || 6) > 3 ? 0.9 : 0.65);
    tag(o);
  }
  finalizeKitBatch(rt, kit);
  for (const m of kit.meshes) if (m && m.userData) m.userData.timeslip = true;

  // 世界の毎コマの更新に一つ足す（この戦の世界だけ。戦が終われば世界ごと捨てられる）
  const base = W.update;
  W.update = function (dt, focus) { base.call(this, dt, focus); try { tick(dt); } catch (e) { /* 飾りの失敗で戦を止めない */ } };
  return { P, rebuild };
}
