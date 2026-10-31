// 人の処理：顔の材質。外部向けの入口は humans.js。
import { MEM_TIGHT } from './settings.js';
import { preparationFrame, HEAD, HSTAT } from './humans_shared.js';
import * as THREE from 'three';
import { astcRetry } from './astc_rt.js';
import { WET } from './world.js';
import { PEOPLE_DET, PEOPLE_GLSL, peopleDetail } from './people_tex.js';

// 顔の絵：日焼けの色を掛け、月代・髭（無精髭・口髭・顎髭）を描き、閉じたまぶたに目の線
const headMats = new Map();
// 兵の顔の絵は、顔の形（12通り）ごとに一枚だけ作り、肌の色は材質の色で掛ける（肌の色ごとに重い絵を作り直さない＝戦の始めに止まらない）
const headTexs = new Map();
let faceRenderer = null;
const faceTextures = new Set();
const faceCopies = new Set();
// 転送済みの絵を保持し、描画用のキャンバスの記憶だけ返す。
// 復帰時もこの写しから再転送できるので、空にしたキャンバスには戻らない。
function releaseFaceCanvas(tex) {
  if (typeof createImageBitmap !== 'function') return;
  const c = tex.image;
  let uploaded = false, bitmap = null, disposed = false;
  const release = () => {
    if (!uploaded || !bitmap || disposed) return;
    // iPhone：送った後の写し（ImageBitmap）も GPU process に乗る（1024² 24 枚で +93MB。10/20 iPad）。顔 21 枚で 33MB なので手放し、
    //   image は 1×1 の canvas に（描画器が落ちて戻った時だけ、顔が一色になる）
    if (MEM_TIGHT) { bitmap.close(); bitmap = null; c.width = c.height = 1; tex.image = c; tex.onUpdate = null; return; }
    tex.image = bitmap;
    c.width = c.height = 0;
    tex.onUpdate = null;
  };
  tex.onUpdate = () => { uploaded = true; release(); };
  faceTextures.add(tex);
  tex.addEventListener('dispose', () => {
    disposed = true; faceTextures.delete(tex);
    faceCopies.delete(work);
    bitmap?.close(); c.width = c.height = 0;
  });
  const work = createImageBitmap(c, { imageOrientation: 'none', premultiplyAlpha: 'none', colorSpaceConversion: 'none' })
    .then(copy => { if (disposed) copy.close(); else { bitmap = copy; release(); } })
    .catch(() => { /* 写せない端末では、再転送できる元の絵を残す */ })
    .finally(() => faceCopies.delete(work));
  faceCopies.add(work);
  if (faceRenderer && !faceRenderer.getContext().isContextLost()) faceRenderer.initTexture(tex);
}
async function finishFaceCopies(current) {
  // 端末で画像の複製が終わらなくても、支度の制限時間と取り消しを守る。
  // 絵は元のキャンバスで描ける。複製が後で終われば通常どおり手放す。
  while (faceCopies.size && current()) await preparationFrame();
}
// 見分けるための造形。肖像や実際の容貌を再現した史実の値ではない。
// 年・髭・肌は今ある顔の値を使い、眉と目の傾き、鼻と顎の特徴を補う。
const FACE_STYLE = {
  '織田信長': { browT: 0.8, browSlope: 0.13, eyeTilt: 0.1, nose: 1.22, nw: 0.82, chin: 1.25 },
  '羽柴秀吉': { browT: 0.75, browSlope: -0.09, eyeTilt: 0.04, eye: 1.35, nose: 0.88, nw: 1.2 },
  '徳川家康': { browT: 1.15, browSlope: -0.05, eyeTilt: -0.06, eye: 1.22, gaunt: -0.35 },
  '柴田勝家': { browT: 1.5, browSlope: 0.08, eyeTilt: 0.06, jaw: 1.45, nw: 1.3 },
  '明智光秀': { browT: 0.7, browSlope: 0.02, eyeTilt: -0.04, eye: 1.18, nose: 1.2, nw: 0.85 },
  '浅井長政': { browT: 1, browSlope: -0.02, eyeTilt: 0, eye: 0.9, jaw: 1.08, gaunt: 0.25 },
  '武田信玄': { browT: 1.4, browSlope: -0.08, eyeTilt: -0.08, eye: 1.3, nw: 1.3, gaunt: 0.05 },
  '武田勝頼': { browT: 0.85, browSlope: 0.09, eyeTilt: 0.08, eye: 0.95, nose: 1.18, chin: 1.15 },
};
const faceStyles = new Map();
const SOLDIER_AGES = [23, 40, 25, 47, 36, 59, 29, 43, 22, 54, 38, 45];
function faceStyle(key, F) {
  const name = String(key), m = /^c(\d+)/.exec(name), k = m ? 'c' + (+m[1] % 12) : name;
  if (faceStyles.has(k)) return faceStyles.get(k);
  const i = m ? +m[1] % 12 : 0;
  const f = { ...F, browT: F.browT ?? F.brow ?? 1, ...(m ? { age: SOLDIER_AGES[i], browT: 0.8 + (i % 4) * 0.15, browSlope: (i % 3 - 1) * 0.07, eyeTilt: (i % 5 - 2) * 0.035 } : FACE_STYLE[name.slice(2)] || {}) };
  faceStyles.set(k, f);
  return f;
}
// 顔の値（年・幅・こけ・顎）から MakeHuman の作り分けを選ぶ。兵は顔の型（12通り）で散らす
function mhPick(key, F) {
  const age = F.age ?? (F.t >= 6 ? 58 : F.t >= 3 ? 42 : 28);
  const m = /^c?(\d+)/.exec(String(key));
  if (typeof key === 'number' || m) return [0, 2, 1, 3, 2, 5, 1, 3, 0, 4, 2, 3][(+(m ? m[1] : key)) % 12];
  if (age >= 55) return (F.w || 1) > 1.04 ? 4 : 5;
  if ((F.w || 1) > 1.06) return 4;
  if (age < 32) return (F.gaunt ?? 0.5) > 0.55 || (F.w || 1) < 0.97 ? 0 : 1;
  // 壮年：えらの張った人は角顔、こけた人は面長。どちらでもない人は名前で散らす（同じ顔が並ばないよう）
  if ((F.jaw || 1) >= 1.15) return 2;
  if ((F.gaunt ?? 0.5) > 0.55) return 3;
  let hk = 0; for (const ch of String(key)) hk = (hk * 31 + ch.charCodeAt(0)) % 997;
  return hk % 2 ? 2 : 3;
}
// MakeHuman の顔は鼻の下が短い：髭・唇の絵を描く高さを、実写スキャンの頭の高さへ読み替える（顎・唇・鼻の下・鼻先・目）
const MH_Y = [[-3, -3], [-0.9, -0.9], [0.1, 0.22], [0.5, 0.82], [0.85, 1.1], [1.72, 1.72], [9, 9]];
function mhPaintY(y) {
  for (let i = 1; i < MH_Y.length; i++) if (y <= MH_Y[i][0]) { const [a0, b0] = MH_Y[i - 1], [a1, b1] = MH_Y[i]; return b0 + (b1 - b0) * (y - a0) / (a1 - a0); }
  return y;
}
function mhSkin(key, F) {
  const i = mhPick(key, F), age = F.age ?? (F.t >= 6 ? 58 : F.t >= 3 ? 42 : 28);
  return HEAD.skins[i === 5 || age >= 55 ? 2 : i <= 1 && age < 34 ? 0 : 1];
}
function headMaterial(key, look, F) {
  if (headMats.has(key)) return headMats.get(key);
  // 名のある武将（g:）と本人は細かく描き、髭と眉は一本ずつの毛で描く
  const named = key === 'player' || String(key).startsWith('g:');
  // 日焼け：肌の色を掛ける
  const sk = new THREE.Color(look.skin || 0xb58c68).getHSL({});
  // 写真の肌（明るめの白人の肌）を、日焼けした色へ寄せる：少し暗く、黄みと赤みを足す
  const tn = new THREE.Color().setHSL(0.07, 0.34, 0.5 + (sk.l - 0.4) * 0.6);
  // MakeHuman の肌の写真は明るい：やや暗く、褐色へ（陣中で日と風に焼けた肌）
  let hk = 0; for (const ch of String(key)) hk = (hk * 31 + ch.charCodeAt(0)) % 997;
  const pk = named ? 0.93 + (hk % 13) / 12 * 0.12 : Math.max(0.82, Math.min(1.12, 0.9 + sk.l * 0.55));   // 兵は今ある肌の色の幅を、写真にも反映する
  // 名将は写真に強い褐色を重ねない。元の肌色に軽い個人差だけを掛ける。
  const tint = named ? [Math.min(255, 244 * pk) | 0, Math.min(255, 239 * pk) | 0, Math.min(255, 232 * pk) | 0] : HEAD.mh ? [Math.min(255, (122 + tn.r * 108) * pk) | 0, Math.min(255, (122 + tn.g * 112) * pk) | 0, Math.min(255, (112 + tn.b * 104) * pk * (0.97 + (hk % 7) / 6 * 0.06)) | 0]
    : [Math.min(255, 140 + tn.r * 110) | 0, Math.min(255, 150 + tn.g * 115) | 0, Math.min(255, 145 + tn.b * 110) | 0];
  const texKey = named ? null : 'c' + ((look.face | 0) % 12) + (look.monk ? '|m' : '');
  if (texKey && headTexs.has(texKey)) { const m = mkHeadMat(headTexs.get(texKey), null, tint); headMats.set(key, m); return m; }
  const _tf0 = performance.now();
  const img = (HEAD.mh ? mhSkin(texKey ? (look.face | 0) % 12 : key, F) : HEAD.col).image, N = named ? 1024 : 512;
  const c = document.createElement('canvas'); c.width = c.height = N;
  // 顔の絵は CPU の絵で描く（GPU の絵は混んだ機械で一枚に何十秒も止まることがあった）
  const CPU = { willReadFrequently: true };
  let g = c.getContext('2d', CPU);
  g.drawImage(img, 0, 0, N, N);
  if (named) {
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = `rgb(${tint[0]},${tint[1]},${tint[2]})`;
    g.fillRect(0, 0, N, N);
    g.globalCompositeOperation = 'source-over';
  }
  // 三角形ごとに、その場所（頭の座標）で髪・髭・目の濃さを決めて、絵の上に塗る
  const geo = HEAD.mh ? HEAD.vars[mhPick(texKey ? (look.face | 0) % 12 : key, F)] : HEAD.geo, pos = geo.attributes.position, uv = geo.attributes.uv, idx = geo.index;
  const hair = new THREE.Color(F.hair || 0x15110d);
  const hs = `${(hair.r * 255) | 0},${(hair.g * 255) | 0},${(hair.b * 255) | 0}`;
  const t = F.t ?? 1;
  let stub = [0.12, 0.35, 0.45, 0.35, 0.35, 0.3, 0.4, 0.3][t] * (named ? 0.6 : 0.55), mus = [3, 4, 5, 6, 7].includes(t), goat = [4, 6].includes(t), full = [5, 7].includes(t);
  // 僧は髭も剃る（剃り跡だけ）
  if (look.monk) { stub = Math.min(stub, 0.18); mus = goat = full = false; }
  // 名のある武将：髭の形と量は人ごと（F.beard。無ければ模様の番号から）。黒く塗った塊にせず、薄い影と細い毛の房で描く
  // 兵も同じ作り（薄い影と細い毛の房）。塗った塊の髭は近くで描いた顔に見えるので、量は武将より少なく
  const BD = named ? { mus: mus ? 0.7 : 0, musW: 1, musH: 1, droop: 0.4, goat: goat || full ? 0.7 : 0, goatW: 1, side: full ? 0.7 : 0, stub: 1, ...(F.beard || {}) }
    : { mus: mus ? 0.45 : 0, musW: 0.85, musH: 0.75, droop: 0.35, goat: goat || full ? 0.4 : 0, goatW: 0.85, side: full ? 0.35 : 0, stub: 1 };
  if (BD) { stub *= BD.stub; mus = BD.mus > 0.02; goat = BD.goat > 0.02; full = BD.side > 0.02; }
  const age = F.age ?? (t >= 6 ? 58 : t >= 3 ? 42 : 28), old = Math.max(0, Math.min(1, (age - 28) / 32));
  const rnd = (() => { let a = 99 + (named ? String(key).length * 7 + (F.w || 1) * 1000 : 0); return () => ((a = (Math.floor(a) * 16807) % 2147483647) / 2147483647); })();
  // 名のある武将の肌：色むら・日焼け・しわ（tone）と、汗の照り（rough）の絵
  // 兵の顔も tone を使う（写真の赤い唇を、日焼けした肌の色へ寄せる。紅を差したような唇は人形に見える）
  const tone = document.createElement('canvas'), rough = named ? document.createElement('canvas') : null;
  let tg = null, rg = null;
  tone.width = tone.height = N; tg = tone.getContext('2d', CPU);
  if (named) {
    rough.width = rough.height = 256; rg = rough.getContext('2d', CPU); rg.fillStyle = 'rgb(140,140,140)'; rg.fillRect(0, 0, 256, 256);
  }
  const Gs = (a, b, sa, sb) => Math.exp(-(a * a) / (2 * sa * sa) - (b * b) / (2 * sb * sb));
  // 髭や髪は別の絵に塗ってから、ぼかして重ねる（三角の角が見えないように）
  const face = g;
  const strands = [];
  const ov = document.createElement('canvas'); ov.width = ov.height = N;
  g = ov.getContext('2d', CPU);
  for (let i = 0; i < idx.count; i += 3) {
    const a = idx.getX(i), b = idx.getX(i + 1), cc = idx.getX(i + 2);
    const x = (pos.getX(a) + pos.getX(b) + pos.getX(cc)) / 3, z = (pos.getZ(a) + pos.getZ(b) + pos.getZ(cc)) / 3;
    let y = (pos.getY(a) + pos.getY(b) + pos.getY(cc)) / 3;
    if (HEAD.mh) y = mhPaintY(y);
    let al = 0, colr = hs;
    const th = Math.atan2(x, z);
    // 月代（額の上から頭頂は剃ってある：青く）
    // 剃り跡は青みがかった灰（陣中で伸びかけた毛の点々。肌色のままの坊主頭に見せない）
    if (y > 2.75 && Math.abs(th) < 1.9) { al = named ? 0.4 : 0.55; colr = '44,48,56'; }
    // 横と後ろの髪（耳の上から後ろ）
    if ((Math.abs(th) > 1.75 && y > 0.6) || (Math.abs(th) > 1.35 && y > 1.5 && y < 3.2)) al = 0.92;
    // 僧は頭を剃る（剃り跡の青さだけ）
    if (look.monk && y > 0.6 && (Math.abs(th) > 1.35 || y > 2.75)) al = 0.2;
    // 髭の生える所：頬の下・顎・口の周り
    const face = z > 0.6 && y < 1.05 && y > -1.3 && Math.abs(x) < 2.6;
    // 無精髭：兵は三角ごとの濃さのむらを付けない（斑が泥の塗りに見える）。色は青みがかった灰（剃り跡の青さ）
    if (face && !(y > 0.25 && y < 0.72 && Math.abs(x) < 0.55 && z > 1.8)) { const sa = stub * (named ? 0.6 + rnd() * 0.4 : 0.5) * (HEAD.mh ? 0.6 * Math.min(1, Math.max(0, (1.05 - y) / 0.45)) : 1); if (sa > al) { al = sa; if (!named) colr = '48,46,52'; } }
    let inMus = mus && y > 0.72 && y < 1.02 && Math.abs(x) < 0.85 && z > 1.7;
    let inGoat = goat && y < 0.1 && Math.abs(x) < 0.7 && z > 1.2;
    let inSide = full && face && (y < 0.3 || Math.abs(x) > 0.8);
    if (BD) {
      // 口髭：幅（musW）・厚み（musH）・端の垂れ（droop）。鼻の下の真ん中は薄く
      const x0 = Math.abs(x + 0.09), dx = x0 / (0.8 * BD.musW);
      const yc = 0.8 - BD.droop * 0.26 * dx * dx, hh = 0.12 * BD.musH * (1 - 0.45 * dx * dx);
      inMus = mus && dx < 1 && Math.abs(y - yc) < hh && z > 1.6;
      inGoat = goat && y < 0.12 && x0 < 0.62 * BD.goatW * (0.6 + 0.4 * Math.min(1, (0.12 - y) / 0.6)) && z > 1.1;
      // 頬の髭の上の縁：耳の下から口の端へ下がる線（頬の高い所まで塗った箱の髭にしない）。縁は三角ごとに少し揺らす
      const sideTop = 0.42 + 0.38 * Math.min(1, Math.max(0, (x0 - 0.8) / 0.9)) + (rnd() - 0.5) * 0.16;
      inSide = full && face && ((x0 > 0.8 && y < sideTop) || y < 0.3) && !(y > 0.25 && y < 0.72 && x0 < 0.6 && z > 1.8);
      const dens = inMus ? BD.mus : inGoat ? BD.goat : inSide ? BD.side : 0;
      if (dens > 0) al = Math.max(al, 0.1 + 0.22 * dens);   // 毛の下の肌の薄い影
    } else {
      if (inMus || inGoat || inSide) colr = hs;
      // 兵の髭は塗りつぶさない（黒い塊は描いた髭に見える）：地の肌が少し透ける濃さに
      if (inMus) al = Math.max(al, 0.52);
      if (inGoat) al = Math.max(al, 0.52);
      if (inSide) al = Math.max(al, 0.42);
    }
    if (!named && z > 0.8) {
      // 兵の顔：唇を肌の色へ寄せ、鼻と頬に日焼けの赤み、額に日焼け（名のある武将より簡単に）
      const x0 = Math.abs(x + 0.09), fr = Math.min(1, (z - 0.8) / 0.9);
      const lip = Gs(x0 / 0.65, (y - 0.22) / 0.36, 1, 1) * (z > 1.6 ? 1 : 0);
      const red = 0.06 * Gs(x0, y - 1.15, 0.28, 0.35) + 0.045 * Gs(x0 - 1.1, y - 1.05, 0.35, 0.35);
      const sun = 0.14 * Gs(x0, y - 2.35, 0.9, 0.45) + 0.08 * Gs(x0 - 1.2, y - 1.35, 0.3, 0.25);
      const tri = (r, g_, b_, al_) => { if (al_ < 0.005) return; tg.fillStyle = `rgba(${r},${g_},${b_},${Math.min(0.85, al_ * fr)})`; tg.beginPath(); tg.moveTo(uv.getX(a) * N, uv.getY(a) * N); tg.lineTo(uv.getX(b) * N, uv.getY(b) * N); tg.lineTo(uv.getX(cc) * N, uv.getY(cc) * N); tg.closePath(); tg.fill(); };
      tri(150, 60, 45, red * 0.6); tri(95, 55, 30, sun * 0.6); tri(122, 86, 66, Math.min(1, 1.1 * lip));
      // 戦場の汚れ：頬・額・顎の土と汗の筋（型ごとに場所が違う）。目の下と小鼻の脇の陰（彫りを深く見せる）
      const sd = ((look.face | 0) % 12) * 1.7 + 0.3;
      const mud = 0.16 * Gs(x0 - 0.9 - 0.3 * Math.sin(sd), y - 0.9 - 0.8 * Math.cos(sd * 1.3), 0.35, 0.28) + 0.1 * Gs(x + 0.6 * Math.sin(sd * 2.1), y - 2.3, 0.4, 0.18) + 0.08 * Gs(x0, y + 0.55, 0.5, 0.25);
      const hol = 0.12 * Gs(x0 - 0.62, y - 1.5, 0.3, 0.1) + 0.1 * Gs(x0 - 0.33, y - 0.95, 0.1, 0.18);
      tri(72, 56, 40, mud); tri(60, 36, 28, hol);
      // 年のしわ（型ごとに年が違う）：額の横じわ・目尻・ほうれい線
      const ft = (look.face | 0) % 12, oldC = old;
      if (oldC > 0.05) {
        let wr = 0;
        if (y > 2.15 && y < 2.85 && x0 < 1.25) wr += 0.14 * oldC * Math.pow(Math.abs(Math.cos((y - 2.15) * Math.PI * 2.4)), 14) * (1 - x0 / 1.3);
        { const aa = Math.atan2(y - 1.72, x0 - 0.98), d = Math.hypot(y - 1.72, x0 - 0.98); if (x0 > 1.0 && d < 0.42) wr += 0.2 * oldC * Math.pow(Math.abs(Math.cos(aa * 5)), 10) * (1 - d / 0.42); }
        { const vx = 0.4, vy = -0.8, q = Math.max(0, Math.min(1, ((x0 - 0.42) * vx + (y - 1.12) * vy) / 0.8)); const d = Math.hypot(x0 - 0.42 - vx * q, y - 1.12 - vy * q); wr += 0.22 * oldC * Math.exp(-(d * d) / 0.004); }
        tri(55, 32, 24, wr);
      }
      // 古傷：型ごとに、頬・眉・鼻筋を斜めに走る刀傷（白っぽく盛り上がり、縁は赤黒い）
      const SC = [null, null, [0.5, 1.9, 1.3, 0.8], null, null, [-0.2, 2.4, 0.5, 1.6], null, [1.2, 1.5, 0.7, 0.3], null, null, [-1.1, 1.3, -0.4, 0.6], null][ft];
      if (SC) {
        const [ax, ay, bx, by] = SC, vx = bx - ax, vy = by - ay, L2 = vx * vx + vy * vy;
        const q = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / L2)), d = Math.hypot(x - ax - vx * q, y - ay - vy * q);
        const taper = Math.sin(q * Math.PI);
        tri(110, 50, 45, 0.45 * Math.exp(-(d * d) / 0.012) * taper);
        tri(205, 170, 150, 0.6 * Math.exp(-(d * d) / 0.0025) * taper);
      }
    }
    if (named) {
      // 肌の色むら：鼻・頬の赤み、額・鼻筋・頬骨の日焼け、目の下の影。年ごとのしわ（額の横じわ・目尻・ほうれい線）
      const x0 = Math.abs(x + 0.09), fr = z > 0.8 ? Math.min(1, (z - 0.8) / 0.9) : 0;
      if (fr > 0) {
        const red = 0.06 * Gs(x0, y - 1.15, 0.28, 0.35) + 0.045 * Gs(x0 - 1.1, y - 1.05, 0.35, 0.35) + 0.03 * rnd();
        const sun = 0.12 * Gs(x0, y - 2.35, 0.9, 0.45) + 0.1 * Gs(x0, y - 1.5, 0.22, 0.5) + 0.07 * Gs(x0 - 1.2, y - 1.35, 0.3, 0.25);
        const bag = (0.08 + 0.14 * old) * Gs(x0 - 0.62, y - 1.46, 0.28, 0.09);
        let wr = 0;
        if (y > 2.15 && y < 2.85 && x0 < 1.25) wr += (0.05 + 0.26 * old) * Math.pow(Math.abs(Math.cos((y - 2.15) * Math.PI * 2.4)), 14) * (1 - x0 / 1.3);
        { const a = Math.atan2(y - 1.72, x0 - 0.98), d = Math.hypot(y - 1.72, x0 - 0.98); if (x0 > 1.0 && d < 0.46) wr += (0.06 + 0.36 * old) * Math.pow(Math.abs(Math.cos(a * 5)), 10) * (1 - d / 0.42); }
        { const ax = 0.42, ay = 1.12, bx = 0.82, by = 0.32; const vx = bx - ax, vy = by - ay, L2 = vx * vx + vy * vy; const q = Math.max(0, Math.min(1, ((x0 - ax) * vx + (y - ay) * vy) / L2)); const d = Math.hypot(x0 - ax - vx * q, y - ay - vy * q); wr += (0.12 + 0.3 * old) * Math.exp(-(d * d) / (2 * 0.045 * 0.045)); }
        // 目の下の皺（年）と、眉間の縦皺（しかめ癖）
        wr += 0.2 * old * Math.pow(Math.abs(Math.cos((y - 1.42) * 26)), 8) * Gs(x0 - 0.62, y - 1.42, 0.3, 0.08);
        wr += (0.05 + 0.15 * old) * Gs(x0 - 0.14, y - 1.98, 0.035, 0.12);
        const pc = (r, g_, b, a) => { if (a < 0.005) return; tg.fillStyle = `rgba(${r},${g_},${b},${Math.min(0.6, a * fr)})`; tg.beginPath(); tg.moveTo(uv.getX(a_) * N, uv.getY(a_) * N); tg.lineTo(uv.getX(b_) * N, uv.getY(b_) * N); tg.lineTo(uv.getX(c_) * N, uv.getY(c_) * N); tg.closePath(); tg.fill(); };
        const a_ = a, b_ = b, c_ = cc;
        // 唇：写真の赤い唇を、日焼けした肌に近い色へ寄せる
        const lip = Gs(x0 / 0.65, (y - 0.22) / 0.36, 1, 1) * (z > 1.6 ? 1 : 0);
        pc(140, 78, 62, red); pc(100, 70, 48, sun); pc(70, 40, 35, bag); pc(55, 32, 24, wr);
        // 唇はほぼ肌の色に（紅を差した線に見せない。口の形は顔の形の陰で見える）
        if (lip > 0.01) { tg.fillStyle = `rgba(124,86,66,${Math.min(0.92, lip * fr)})`; tg.beginPath(); tg.moveTo(uv.getX(a_) * N, uv.getY(a_) * N); tg.lineTo(uv.getX(b_) * N, uv.getY(b_) * N); tg.lineTo(uv.getX(c_) * N, uv.getY(c_) * N); tg.closePath(); tg.fill(); }
        // 汗の照り：額・鼻筋・頬骨は滑らか、髭の所は荒い
        const sh = Gs(x0, y - 2.3, 0.8, 0.35) + Gs(x0, y - 1.35, 0.2, 0.4) + 0.6 * Gs(x0 - 1.15, y - 1.35, 0.25, 0.2);
        const rv = Math.round(Math.max(60, Math.min(220, 140 - 80 * Math.min(1, sh) + (inMus || inGoat || inSide ? 60 : 0))));
        rg.fillStyle = `rgb(${rv},${rv},${rv})`; rg.beginPath(); rg.moveTo(uv.getX(a) * 256, uv.getY(a) * 256); rg.lineTo(uv.getX(b) * 256, uv.getY(b) * 256); rg.lineTo(uv.getX(cc) * 256, uv.getY(cc) * 256); rg.closePath(); rg.fill();
      }
    }
    // 眉を濃く
    let brow = false;
    // 眉：兵は細く薄く（太い墨の眉は描いた顔に見える）
    for (const sd of [-1, 1]) { const dx = (x - sd * 0.7) / 0.6, dy = (y - 2.02 + Math.abs(x) * 0.05 - (Math.abs(x) - 0.7) * (F.browSlope || 0)) / ((named ? 0.085 : 0.075) * (F.browT ?? 1)); if (z > 1.5 && dx * dx + dy * dy < 1) { al = Math.max(al, named ? 0.7 : 0.55); brow = true; } }
    if (al <= 0.01) continue;
    // 毛の向き（頭の座標）：口髭は下と外へ、顎髭は下へ、頬の髭は下と前へ、眉は外へ
    if (BD) {
      const isMus = inMus;
      const isBeard = inGoat || inSide;
      if (isMus || isBeard || brow) {
        const sx = Math.sign(x + 0.09) || 1;
        const D = brow ? [sx, 0.12, 0] : isMus ? [sx * 0.8, -0.55 - 0.4 * BD.droop, 0.1] : [sx * (inSide && !inGoat ? 0.3 : 0.12), -1, 0.25];
        // 毛の房：長さと濃さは髭の量で（薄い髭は短く疎ら）
        const dens = brow ? 1 : isMus ? BD.mus : inGoat ? BD.goat : BD.side;
        // 兵の眉は細く疎らに（太く濃い眉は墨で描いた顔に見える）
        strands.push([a, b, cc, D, brow ? (named ? 0.28 : 0.22) : (isMus ? 0.3 : 0.42) * (0.6 + 0.5 * dens), brow ? (named ? 0.62 : 0.5) : 0.35 + 0.4 * dens, brow ? (named ? 1 : 0.45) : dens]);
        al *= brow ? 0.35 : 1;
      }
    }
    g.fillStyle = `rgba(${colr},${al})`;
    g.beginPath();
    g.moveTo(uv.getX(a) * N, uv.getY(a) * N); g.lineTo(uv.getX(b) * N, uv.getY(b) * N); g.lineTo(uv.getX(cc) * N, uv.getY(cc) * N);
    g.closePath(); g.fill();
  }
  face.filter = `blur(${named ? N / 400 : N / 220}px)`;   // 兵の髭・髪の縁は柔らかく（塗った縁に見せない）
  face.drawImage(ov, 0, 0);
  // 肌の色むら・日焼け・しわ（ぼかして重ねる）
  if (tg) { face.filter = `blur(${N / 300}px)`; face.drawImage(tone, 0, 0); }
  face.filter = 'none';
  // 無精髭の粒
  // 兵は塗りを粒に抜いて重ねる（剃り跡・生えかけの毛の点々。一様な灰の塗りに見せない）
  if (named) { face.globalAlpha = 0.15; face.drawImage(ov, 0, 0); face.globalAlpha = 1; }
  else { const gc_ = grainOf(ov, N); face.globalAlpha = 0.4; face.drawImage(gc_, 0, 0); face.globalAlpha = 1; gc_.width = gc_.height = 0; }
  tone.width = tone.height = ov.width = ov.height = 0;
  // 一本ずつの毛：三角の中の点から、毛の向き（頭の座標）を絵の上の向きに直して短い線を引く
  if (strands.length) {
    face.lineCap = 'round';
    const P3 = (i) => [pos.getX(i), pos.getY(i), pos.getZ(i)], T2 = (i) => [uv.getX(i) * N, uv.getY(i) * N];
    for (const [a, b, cc, D, len, am, dens = 1] of strands) {
      const pa = P3(a), pb = P3(b), pc = P3(cc), ta = T2(a), tb = T2(b), tc = T2(cc);
      const e1 = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]], e2 = [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]];
      const d11 = e1[0] * e1[0] + e1[1] * e1[1] + e1[2] * e1[2], d12 = e1[0] * e2[0] + e1[1] * e2[1] + e1[2] * e2[2], d22 = e2[0] * e2[0] + e2[1] * e2[1] + e2[2] * e2[2];
      const L = Math.hypot(D[0], D[1], D[2]), Dn = D.map((v) => (v / L) * len);
      const r1 = Dn[0] * e1[0] + Dn[1] * e1[1] + Dn[2] * e1[2], r2 = Dn[0] * e2[0] + Dn[1] * e2[1] + Dn[2] * e2[2];
      const det = d11 * d22 - d12 * d12;
      if (Math.abs(det) < 1e-9) continue;
      const al_ = (r1 * d22 - r2 * d12) / det, be = (r2 * d11 - r1 * d12) / det;
      let du = al_ * (tb[0] - ta[0]) + be * (tc[0] - ta[0]), dv = al_ * (tb[1] - ta[1]) + be * (tc[1] - ta[1]);
      const dl = Math.hypot(du, dv);
      if (dl > N * 0.03) { du *= N * 0.03 / dl; dv *= N * 0.03 / dl; }
      const area = Math.abs((tb[0] - ta[0]) * (tc[1] - ta[1]) - (tc[0] - ta[0]) * (tb[1] - ta[1])) / 2;
      const n = Math.min(60, Math.ceil((area / 5) * (0.35 + 0.9 * dens)));
      for (let k = 0; k < n; k++) {
        let p = rnd(), q = rnd(); if (p + q > 1) { p = 1 - p; q = 1 - q; }
        const px = ta[0] + p * (tb[0] - ta[0]) + q * (tc[0] - ta[0]), py = ta[1] + p * (tb[1] - ta[1]) + q * (tc[1] - ta[1]);
        const j = 0.6 + rnd() * 0.7, bend = (rnd() - 0.5) * 0.5;
        // 毛の色は一本ずつ少し違う（年寄りは白い毛が混じる）
        const grey = rnd() < old * 0.45 ? '150,142,130' : hs;
        face.strokeStyle = `rgba(${grey},${am * (0.35 + rnd() * 0.65)})`;
        face.lineWidth = (0.45 + rnd() * 0.55) * (named ? 1 : 0.75);
        face.beginPath(); face.moveTo(px, py);
        face.quadraticCurveTo(px + du * j * 0.5 - dv * bend * 0.3, py + dv * j * 0.5 + du * bend * 0.3, px + du * j, py + dv * j);
        face.stroke();
      }
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  astcRetry(tex, false);   // iPhone：顔の材質は alpha を使わないので、透ける画素があっても ASTC で（astc_rt）
  let rTex = null;
  if (rough) { rg.filter = 'blur(3px)'; rg.drawImage(rough, 0, 0); rTex = new THREE.CanvasTexture(rough); rTex.flipY = false; }
  releaseFaceCanvas(tex);
  if (rTex) releaseFaceCanvas(rTex);
  if (texKey) headTexs.set(texKey, tex);
  HSTAT.tFace = (HSTAT.tFace || 0) + (performance.now() - _tf0); HSTAT.nFace = (HSTAT.nFace || 0) + 1; HSTAT.maxFace = Math.max(HSTAT.maxFace || 0, performance.now() - _tf0);
  const m = mkHeadMat(tex, rTex, named ? null : tint);
  headMats.set(key, m);
  return m;
}
// 塗りを細かな粒に抜いた写し（兵の無精髭）。粒の型は大きさごとに一枚
const grainMasks = new Map();
function grainOf(src, N) {
  if (!grainMasks.has(N)) {
    const m = document.createElement('canvas'); m.width = m.height = N;
    const mg = m.getContext('2d'), im = mg.createImageData(N, N);
    let a = 12345; const r = () => ((a = (a * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < N * N; i++) { const v = r(); im.data[i * 4 + 3] = v < 0.42 ? 150 + v * 250 : 0; }
    mg.putImageData(im, 0, 0);
    grainMasks.set(N, m);
  }
  const c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d');
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = 'destination-in'; g.drawImage(grainMasks.get(N), 0, 0);
  return c;
}
// MakeHuman の肌には凹凸の絵が無いので、細かな毛穴と肌理の凹凸をキャンバスで作って繰り返し貼る（一枚だけ）
let MH_PORES = null;
function mhPores() {
  if (MH_PORES) return MH_PORES;
  const N = 256, c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d'), im = g.createImageData(N, N), H = new Float32Array(N * N);
  let a = 777; const r = () => ((a = (a * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < 900; k++) { const x = r() * N | 0, y = r() * N | 0, d = 0.5 + r(); for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) { const q = Math.exp(-(i * i + j * j) / (1.2 * d)); H[((y + j + N) % N) * N + ((x + i + N) % N)] -= q * (0.6 + r() * 0.4); } }
  for (let i = 0; i < N * N; i++) H[i] += (r() - 0.5) * 0.25;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = H[y * N + ((x + 1) % N)] - H[y * N + ((x - 1 + N) % N)], dy = H[((y + 1) % N) * N + x] - H[((y - 1 + N) % N) * N + x];
    const l = Math.hypot(dx, dy, 1), o = (y * N + x) * 4;
    im.data[o] = 128 - (dx / l) * 127; im.data[o + 1] = 128 - (dy / l) * 127; im.data[o + 2] = 128 + (1 / l) * 127; im.data[o + 3] = 255;
  }
  g.putImageData(im, 0, 0);
  MH_PORES = new THREE.CanvasTexture(c); MH_PORES.wrapS = MH_PORES.wrapT = THREE.RepeatWrapping; MH_PORES.repeat.set(10, 10); MH_PORES.flipY = false;
  return MH_PORES;
}
function mkHeadMat(tex, rTex, tint) {
  const m = new THREE.MeshStandardMaterial({   // 10/24：Physical をやめ Standard に（GPU を軽く）
    map: tex, normalMap: HEAD.mh ? mhPores() : HEAD.nrm, normalScale: HEAD.mh ? new THREE.Vector2(0.5, 0.5) : new THREE.Vector2(0.8, 0.8), roughness: rTex ? 0.95 : 0.78, roughnessMap: rTex, metalness: 0,
  });
  if (tint) m.color.setRGB(tint[0] / 255, tint[1] / 255, tint[2] / 255, THREE.SRGBColorSpace);
  // 表面下散乱の近似：光の当たらない側にも、赤みのある光が少し回り込む
  // 笠・兜の陰（uHatAO）：縁の下になる額と目元は暗く、顔の下ほど明るい（影の絵の細かさでは笠の影が顔に落ち切らないので）
  m.onBeforeCompile = headCompile;
  m.customProgramCacheKey = () => 'scanhead';
  return m;
}
// mhPaintY の GLSL（MakeHuman の頭の高さ → 実写スキャンの頭の高さ）。スキャンの頭の時はそのまま
const MHY_GLSL = () => HEAD && HEAD.mh ? `float mhy(float y) {
  if (y <= -0.9) return y;
  if (y <= 0.1) return -0.9 + (y + 0.9) * 1.12;
  if (y <= 0.5) return 0.22 + (y - 0.1) * 1.5;
  if (y <= 0.85) return 0.82 + (y - 0.5) * 0.8;
  if (y <= 1.72) return 1.1 + (y - 0.85) * 0.7126;
  return y;
}
` : 'float mhy(float y) { return y; }\n';
function headCompile(sh) {
  sh.uniforms.uSkinRain = WET;
  sh.uniforms.uHatAO = (this.userData && this.userData.ao) || { value: 0 };
  sh.uniforms.uFaceV = (this.userData && this.userData.fv) || { value: new THREE.Vector4(0, 0, 0, 0) };
  // 表情（x 口を開く・y 苦しむ（顔をしかめる）・z 怒る（眉を寄せて下げる））。頭の座標（1 が 4cm ほど）で形を動かす
  sh.uniforms.uExpr = (this.userData && this.userData.ex) || { value: new THREE.Vector4(0, 0, 0, 0) };
  peopleDetail(); sh.uniforms.uPD = PEOPLE_DET;
  // MakeHuman の頭は表情を形の差（morph）で動かす：ここでの頂点の押し引きはしない
  const exM = !!(HEAD && HEAD.exMorph);
  sh.vertexShader = 'uniform vec4 uExpr;\nvarying vec3 vHP;\n' + MHY_GLSL() + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
 // MakeHuman の頭は鼻の下が短い：陰や汚れ・表情の場所は、実写スキャンの頭の高さへ読み替えて決める（絵の mhPaintY と同じ）
 vec3 hp0 = position; hp0.y = mhy(position.y);
 vHP = hp0;
 if (${exM ? 'false' : 'true'} && uExpr.x + uExpr.y + uExpr.z > 0.001) {
   float ex0 = abs(hp0.x + 0.09), front = smoothstep(0.4, 1.4, hp0.z);
   // 顎が下がる：口より下ほど大きく、顔の横へ行くほど小さく
   float jaw = smoothstep(0.3, 0.05, hp0.y) * smoothstep(-1.6, -0.4, hp0.y + 0.0) * smoothstep(2.4, 0.9, ex0) * front;
   jaw = max(jaw, smoothstep(0.3, -0.6, hp0.y) * smoothstep(2.4, 1.0, ex0) * front);
   transformed.y -= (uExpr.x * 0.34 + uExpr.y * 0.12) * jaw;
   transformed.z -= (uExpr.x * 0.08) * jaw;
   // しかめる：口の端が横へ引かれ、頬が上がり、目が細まる
   float corner = exp(-pow(ex0 - 0.6, 2.0) / 0.05 - pow(hp0.y - 0.25, 2.0) / 0.04) * front;
   transformed.x += sign(hp0.x + 0.09) * (uExpr.y * 0.1 + uExpr.x * 0.05) * corner;
   float cheek = exp(-pow(ex0 - 0.95, 2.0) / 0.12 - pow(hp0.y - 1.25, 2.0) / 0.08) * front;
   transformed.y += (uExpr.y * 0.1 + uExpr.z * 0.04) * cheek;
   // 眉：怒りは眉頭が下がって寄り、苦しみは眉頭が上がって寄る
   float brow = exp(-pow(ex0 - 0.55, 2.0) / 0.12 - pow(hp0.y - 2.02, 2.0) / 0.03) * front;
   float inner = smoothstep(1.0, 0.2, ex0);
   transformed.y += brow * (uExpr.y * 0.08 * inner - uExpr.z * 0.1 * (0.4 + inner));
   transformed.x -= sign(hp0.x + 0.09) * brow * (uExpr.z + uExpr.y) * 0.05;
 }`);
  sh.fragmentShader = `uniform float uHatAO, uSkinRain;\nuniform vec4 uFaceV, uExpr;\nuniform sampler2D uPD;\nvarying vec3 vHP;\nfloat skinD;
float fh3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float fn3(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(fh3(i), fh3(i + vec3(1,0,0)), f.x), mix(fh3(i + vec3(0,1,0)), fh3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(fh3(i + vec3(0,0,1)), fh3(i + vec3(1,0,1)), f.x), mix(fh3(i + vec3(0,1,1)), fh3(i + vec3(1,1,1)), f.x), f.y), f.z); }
float faceWet;
` + PEOPLE_GLSL + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
    {
      // 肌の写真の細かなむら（毛穴・しみ・肌理）：色を僅かに揺らし、下で凹凸にも使う
      skinD = texture2D(uPD, vMapUv * 11.0).r - 0.5 + (texture2D(uPD, vMapUv * 3.7 + 0.31).r - 0.5) * 0.6;
      diffuseColor.rgb *= 1.0 + skinD * 0.28;
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.08, 0.94, 0.9), clamp(-skinD * 1.2, 0.0, 0.35));
    }
    {
      // 兵ごとの顔の汚れ（uFaceV）：土と埃の斑・汗の流れた筋・日焼けの赤み。場所は w でずらす
      float x0 = abs(vHP.x + 0.09), fr = smoothstep(0.6, 1.5, vHP.z);
      vec3 q = vHP + vec3(uFaceV.w * 3.1, uFaceV.w * 1.7, 0.0);
      float blot = smoothstep(0.5, 0.85, fn3(q * 0.9) * 0.65 + fn3(q * 2.7) * 0.35);
      float dust = (0.35 + 0.65 * fn3(q * 6.0)) * (smoothstep(-0.6, 0.6, -vHP.y + 1.2) * 0.6 + 0.4);
      float mud = clamp(blot * uFaceV.x * 0.8 + dust * uFaceV.x * 0.22, 0.0, 1.0) * fr;
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.52, 0.44, 0.36), mud);
      // 汗の筋：こめかみと額から頬へ流れた跡（埃が流されて少し明るく、濡れて照る）
      float st = smoothstep(0.72, 0.95, fn3(vec3(vHP.x * 5.0 + uFaceV.w, vHP.y * 0.7, 0.0))) * smoothstep(2.6, 1.2, vHP.y) * smoothstep(-0.5, 0.6, vHP.y);
      faceWet = uFaceV.y * (st * 0.8 + 0.45 * exp(-x0 * x0 / 0.9 - pow(vHP.y - 2.3, 2.0) / 0.25)) * fr;
      // 笠が守る額と、横殴りの雨に濡れる頬を分ける。汗の個人差と既存の斑を使う。
      float rainSkin = uSkinRain * fr * (0.35 + st * 0.45)
        * (1.0 - uHatAO * smoothstep(1.2, 2.4, vHP.y) * 0.8);
      faceWet = max(faceWet, rainSkin);
      diffuseColor.rgb *= 1.0 - rainSkin * 0.07;
      diffuseColor.rgb *= 1.0 + st * uFaceV.y * uFaceV.x * 0.18 * fr;
      // 眉間・頬・口元の力みを表情の値と結ぶ。既存の顔だけを使い、模様の枚数は増やさない。
      float tense = clamp(uExpr.y + uExpr.z * 0.7, 0.0, 1.0) * fr;
      float browCrease = exp(-x0 * x0 / 0.035 - pow(vHP.y - 2.05, 2.0) / 0.12);
      float cheekFold = exp(-pow(x0 - (0.45 + (1.0 - vHP.y) * 0.3), 2.0) / 0.018)
        * exp(-pow(vHP.y - 0.7, 2.0) / 0.28);
      diffuseColor.rgb *= 1.0 - tense * (browCrease * 0.16 + cheekFold * 0.12);
      // 日焼けの赤み：鼻・頬・耳
      float fl = exp(-x0 * x0 / 0.12 - pow(vHP.y - 1.2, 2.0) / 0.25) + 0.8 * exp(-pow(x0 - 1.15, 2.0) / 0.15 - pow(vHP.y - 1.1, 2.0) / 0.2) + 0.6 * smoothstep(3.3, 3.9, abs(vHP.x));
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.12, 0.86, 0.78), clamp(fl, 0.0, 1.0) * uFaceV.z * 0.7);
      // 兜・笠の縁のすぐ下の額：縁の影に沈む（照らし方だけでは明るい帯が残るので、色そのものを落とす）
      diffuseColor.rgb *= 1.0 - smoothstep(0.35, 0.55, uHatAO) * 0.5 * smoothstep(2.06, 2.24, vHP.y);
      // 肌：塗った橙のように鮮やかにしない（日と風に焼けて、少しくすむ）
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(dot(diffuseColor.rgb, vec3(0.3, 0.55, 0.15))) * vec3(1.1, 0.96, 0.84), 0.26);
      // 肌の細かなむら（そばかす・しみ・毛細血管の赤み）：一様な塗りの肌は人形に見える
      diffuseColor.rgb *= 0.93 + 0.1 * fn3(vHP * 7.0) - 0.05 * smoothstep(0.62, 0.9, fn3(vHP * 23.0 + 3.1));
      // 剃り跡：顎・頬の下・口のまわりが青黒く沈む（唇は除く）。一様な灰にせず、毛穴の点々で
      {
        float lip = exp(-x0 * x0 / 0.22 - pow(vHP.y - 0.22, 2.0) / 0.03);
        float jawR = smoothstep(1.0, 0.55, vHP.y) * smoothstep(-1.3, -0.6, vHP.y) * smoothstep(1.55, 0.9, x0) * (1.0 - lip);
        float stb = jawR * smoothstep(0.3, 0.7, fn3(vHP * 46.0)) * fr;
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.62, 0.62, 0.68), stb * 0.3);
      }
      // 月代：剃った頭頂は、伸びかけの毛の点々で青黒く沈む（肌色のままの坊主頭にしない）
      float th = abs(atan(vHP.x, vHP.z));
      float sk = smoothstep(2.55, 2.95, vHP.y) * smoothstep(2.05, 1.7, th);
      float dots = smoothstep(0.35, 0.75, fn3(vHP * 38.0));
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.5, 0.52, 0.58), sk * (0.45 + 0.35 * dots));
      // 開いた口の中：唇の間が暗く、歯が少し覗く
      float mo = uExpr.x + uExpr.y * 0.35;
      if (mo > 0.01) {
        float mouth = exp(-x0 * x0 / (0.16 + uExpr.y * 0.1) - pow(vHP.y - 0.2, 2.0) / (0.004 + 0.012 * mo)) * smoothstep(1.4, 1.8, vHP.z);
        float teeth = exp(-x0 * x0 / 0.08 - pow(vHP.y - 0.26, 2.0) / 0.0015) * smoothstep(1.4, 1.8, vHP.z) * mo;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.09, 0.03, 0.025), clamp(mouth * mo * ${exM ? '0.7' : '1.6'}, 0.0, 0.92));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.56, 0.46), clamp(teeth * ${exM ? '0.0' : '0.6'}, 0.0, 0.6));
      }
    }`).replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
    {
      // 肌理の凹凸（遠くでは均して、ちらつかせない）
      float fwS = fwidth(vMapUv.x * 11.0) * 512.0;
      normal = pdBump(-vViewPosition, normal, skinD * 0.0015 * (1.0 - smoothstep(0.7, 2.0, fwS)), faceDirection);
    }`).replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
    {
      // 汗と脂の照り：額の真ん中・鼻筋・頬骨は滑らか（顔の形が光で立つ）
      float x0 = abs(vHP.x + 0.09), fr = smoothstep(0.9, 1.7, vHP.z);
      float tz = exp(-x0 * x0 / 0.5 - pow(vHP.y - 2.35, 2.0) / 0.12) + exp(-x0 * x0 / 0.05 - pow(vHP.y - 1.45, 2.0) / 0.2) + 0.7 * exp(-pow(x0 - 1.1, 2.0) / 0.06 - pow(vHP.y - 1.4, 2.0) / 0.05);
      roughnessFactor *= 1.0 - 0.38 * clamp(tz, 0.0, 1.0) * fr;
      roughnessFactor *= 1.0 - 0.28 * clamp(faceWet, 0.0, 1.0);
      // 毛穴と肌理：照りを細かく斑にし、ろうのような一様な照りにしない
      // 汗のある鼻・額だけは照りを残す。頬の乾いた肌理と同じ粗さに潰さない。
      roughnessFactor = clamp(roughnessFactor + (fn3(vHP * 55.0) - 0.5) * 0.16 + (fn3(vHP * 9.0) - 0.5) * 0.08, mix(0.62, 0.46, clamp(faceWet + tz * fr * 0.35, 0.0, 1.0)), 0.94);
    }`).replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
    {
      // 空の見え方：上を向いた面（額・頬骨・鼻筋の上）は空の光を受け、下を向いた面（顎の下・鼻の下・眉の下・頬の下）は沈む
      // 曇りの日や日陰で、顔が正面から一様に照らされた平たいお面に見えないよう（光の向きで陰影が出る）
      vec3 nW = inverseTransformDirection(normal, viewMatrix);
      float sky = 0.32 + 0.68 * smoothstep(-0.75, 0.65, nW.y);
      reflectedLight.indirectDiffuse *= sky;
      // 曇りでも空は日のある側が明るい：日の側の頬骨と鼻筋は明るく、反対の頬と鼻の脇は沈む（正面から一様に照らしたお面にしない）
      #if NUM_DIR_LIGHTS > 0
      reflectedLight.indirectDiffuse *= 0.68 + 0.64 * clamp(dot(normal, directionalLights[0].direction) * 0.5 + 0.5, 0.0, 1.0);
      #endif
      reflectedLight.indirectSpecular *= 0.35 + 0.65 * smoothstep(-0.3, 0.7, nW.y);
    }
    reflectedLight.indirectDiffuse += diffuseColor.rgb * vec3(0.07, 0.035, 0.025) * (1.0 - max(dot(normal, vec3(0.0, 0.0, 1.0)), 0.0));
    // 肌の縁：光が薄い肌を透けて、輪郭がほのかに赤く明るむ（切り抜いた絵のような縁にしない）
    reflectedLight.indirectDiffuse += diffuseColor.rgb * vec3(0.5, 0.3, 0.22) * pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 3.0) * 0.16;
    {
      // 眉庇・笠の縁のすぐ下（額）は、縁の影がくっきり落ちる（額だけ明るい帯にしない）
      // 縁の陰は上ほど深い：額は沈み、目元は陰の中、鼻から下へ少しずつ明るむ（顔の上半分が縁の陰に入る）
      // 笠の影を二重に黒くせず、頬と口の形へ地面からの光を残す。
      float occ = max(0.22, 1.0 - uHatAO * (0.22 + 0.56 * smoothstep(0.5, 2.0, vHP.y) + 0.35 * smoothstep(2.0, 2.2, vHP.y)));
      // 眼窩の陰（目のまわりは彫りが深く、空の光が回り込みにくい）
      float eo = exp(-(pow(vHP.x + 0.69, 2.0) + pow(vHP.y - 1.74, 2.0) * 2.2) / 0.09) + exp(-(pow(vHP.x - 0.51, 2.0) + pow(vHP.y - 1.74, 2.0) * 2.2) / 0.09);
      reflectedLight.indirectDiffuse *= 1.0 - 0.62 * clamp(eo, 0.0, 1.0);
      reflectedLight.indirectSpecular *= 1.0 - 0.6 * clamp(eo, 0.0, 1.0);
      // 顔の窪みの陰：眉の下の張り出し・鼻の脇から口の端への溝（法令線）・鼻の下・下唇の下・顎の下。顔が箱のように平らに見えないよう
      {
        float x1 = abs(vHP.x + 0.09), frt = smoothstep(0.7, 1.5, vHP.z);
        float bw = exp(-pow(vHP.y - 1.9, 2.0) / 0.012) * smoothstep(1.35, 0.3, x1);
        vec2 na = vec2(0.42, 1.05), nb = vec2(0.72, 0.22), pq = vec2(x1, vHP.y) - na, ab = nb - na;
        float nl = exp(-pow(length(pq - ab * clamp(dot(pq, ab) / dot(ab, ab), 0.0, 1.0)), 2.0) / 0.012);
        float un = exp(-x1 * x1 / 0.12 - pow(vHP.y - 0.78, 2.0) / 0.008);
        float ul = exp(-x1 * x1 / 0.25 - pow(vHP.y + 0.08, 2.0) / 0.01);
        float cav = clamp((bw * 0.8 + nl * 0.7 + un * 0.6 + ul * 0.5) * frt + smoothstep(-0.7, -1.4, vHP.y) * 0.6, 0.0, 1.0);
        reflectedLight.indirectDiffuse *= 1.0 - 0.6 * cav;
        reflectedLight.directDiffuse *= 1.0 - 0.4 * cav;
        reflectedLight.indirectSpecular *= 1.0 - 0.5 * cav;
      }
      reflectedLight.directDiffuse *= occ; reflectedLight.directSpecular *= occ;
      reflectedLight.indirectDiffuse *= mix(1.0, occ, 0.6); reflectedLight.indirectSpecular *= occ;
      // 陣笠・兜の下の底上げ：影に沈んでも顔が潰れて真っ黒にならない程度に、ごく弱く自ら光らせる
      reflectedLight.indirectDiffuse += diffuseColor.rgb * uHatAO * 0.16 * (1.0 - occ * 0.5);
    }`);
}
// 新しく作った人の材質の絵の仕組み（シェーダ）を、見せる前に作り始める（main.js が渡す。作り始めたら true）。
//   描く時に初めて作ると、その場で出来上がりを待って一コマが数十〜百 ms 固まる。作り始めてから三コマ待つ間に、描く側の裏で出来上がる
let COMPILE = null;
let COMPILE_ASYNC = null;
function setHumanCompiler(f, fAsync, renderer) {
  COMPILE = f; COMPILE_ASYNC = fAsync || null;
  if (renderer && faceRenderer !== renderer) {
    faceRenderer = renderer;
    renderer.domElement.addEventListener('webglcontextrestored', () => {
      // 描画器の復帰後、保持した写しから同じ顔を再転送する。材質の写しも同じ絵を参照する。
      for (const tex of faceTextures) tex.needsUpdate = true;
    });
  }
}

export { headMats, headTexs, faceRenderer, finishFaceCopies, faceStyles, faceStyle, mhPick, headMaterial, MH_PORES, headCompile, COMPILE, COMPILE_ASYNC, setHumanCompiler };
