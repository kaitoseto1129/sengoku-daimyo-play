// 城・寺・屋敷の室内部品。部品の関数を差し替えれば、買った素材でも同じ配置と当たりを使える。
// 形・材質・絵は使い回す。設営時に材質ごとにまとめ、光は絵に焼く（灯りの影や毎コマの生成なし）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { solidRect } from './props.js';
import { S } from './settings.js';
import { residenceRoofGeo, residenceRoofMat } from './residence_parts.js';
import { addInterior, nakaRoomAt } from './naka.js';
import { interiorLayout } from './interior_layouts.js';
import { addNaibu } from './naibu_kit.js';
import { cgtOn, cgtHas, cgtKitGroup, cgtBox, cgtParts, cgtSpend, KitBatch } from './cgt.js';   // 買った素材（床・畳・柱）。読めていれば差し替える

const cacheUsers = [];
const shapes = new Map(), materials = new Map(), rooms = new Map(), panels = new Map(), templeDecor = new Map(), layoutDecor = new Map();
function shape(w, h, d) {
  const key = `${w}:${h}:${d}`;
  if (!shapes.has(key)) shapes.set(key, new THREE.BoxGeometry(w, h, d));
  return shapes.get(key);
}
function picture(kind) {
  const S = 256, cv = document.createElement('canvas'); cv.width = S; cv.height = S;
  const g = cv.getContext('2d');
  let seed = kind.length * 977 + 13; const R = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  if (kind === 'tatami') {
    g.fillStyle = '#9d9868'; g.fillRect(0, 0, S, S);
    // 藺草の織り目：細い筋と、畳の目ごとの濃淡
    for (let y = 0; y < S; y += 3) { g.fillStyle = `rgba(${R() < 0.5 ? '120,116,76' : '190,184,130'},${0.18 + R() * 0.16})`; g.fillRect(0, y, S, 1 + (R() < 0.3)); }
    for (let i = 0; i < 160; i++) { g.fillStyle = `rgba(${90 + R() * 80},${88 + R() * 70},${50 + R() * 40},0.1)`; g.fillRect(R() * S, R() * S, 6 + R() * 40, 2); }
    // 足の擦れた跡と染み
    for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(60,48,30,0.1)'; g.beginPath(); g.ellipse(R() * S, R() * S, 12 + R() * 30, 6 + R() * 14, R() * 3, 0, 7); g.fill(); }
    const light = g.createLinearGradient(0, 0, S, S); light.addColorStop(0, 'rgba(255,248,212,.16)'); light.addColorStop(1, 'rgba(40,32,20,.14)');
    g.fillStyle = light; g.fillRect(0, 0, S, S);
  } else if (kind === 'hieiTatamiCore') {
    // 畳の小口は藺草の織り目でなく、締めた藁の層と縫い糸を見せる。
    // 個別の畳の復元とはせず、僧坊・庫裏で一枚の絵を共有する。
    g.fillStyle = '#94815a'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 640; i++) {
      g.strokeStyle = i % 2 ? 'rgba(220,200,144,.28)' : 'rgba(72,57,33,.24)';
      const x = R() * S, y = R() * S;
      g.beginPath(); g.moveTo(x, y);
      g.lineTo(x + 4 + R() * 24, y + (R() - .5) * 4); g.stroke();
    }
    g.strokeStyle = 'rgba(65,53,32,.38)';
    for (let x = 16; x < S; x += 32) {
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 3, S); g.stroke();
    }
  } else if (kind === 'tatamiHeri') {
    // 僧坊の無地の畳縁も、黒い板ではなく麻布の経糸・緯糸で表す。
    g.fillStyle = '#24251e'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < S; i += 4) {
      g.fillStyle = i % 8 ? '#303128' : '#1d1e19';
      g.fillRect(i, 0, 1, S);
      g.fillStyle = 'rgba(132,128,98,.16)'; g.fillRect(0, i, S, 1);
    }
  } else if (kind === 'hieiFloorTimber') {
    // 畳寄せは塗りつぶした帯にせず、長手へ通る木目を一枚の絵で共有する。
    g.fillStyle = '#b29a76'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 100; i++) {
      const x = R() * S, wave = 1 + R() * 3, phase = R() * Math.PI * 2;
      g.strokeStyle = i % 3 ? 'rgba(66,44,24,.15)' : 'rgba(246,226,185,.18)';
      g.beginPath();
      for (let y = 0; y <= S; y += 8) {
        const xx = x + wave * Math.sin(y / S * Math.PI * 2 + phase);
        if (y) g.lineTo(xx, y); else g.moveTo(xx, y);
      }
      g.stroke();
    }
  } else if (kind === 'hieiShojiPaper') {
    // 障子紙の繊維は実寸で繰り返す。細い手掛け脇でも紙目を押し縮めない。
    g.fillStyle = '#d8d0b8'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 320; i++) {
      g.strokeStyle = i % 2 ? 'rgba(255,250,230,.13)' : 'rgba(120,104,80,.09)';
      g.lineWidth = 1; g.beginPath();
      const x = R() * S, y = R() * S;
      g.moveTo(x, y); g.lineTo(x + (R() - .5) * 18, y + (R() - .5) * 8); g.stroke();
    }
  } else if (kind === 'shoji' || kind === 'shojiPaper') {
    // 障子紙：楮の繊維のむらと、煤けた下の隅。細い桟を組む（縦 4 本×横 6 段ほど。貼り継ぎの線も）
    const paper = g.createRadialGradient(S / 2, S * 0.4, 10, S / 2, S * 0.4, S * 0.78);
    paper.addColorStop(0, '#e6dfc8'); paper.addColorStop(1, '#b9b39c');
    g.fillStyle = paper; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 260; i++) { g.strokeStyle = `rgba(${R() < 0.5 ? '255,250,230' : '120,104,80'},${0.1 + R() * 0.12})`; g.lineWidth = 1; g.beginPath(); const x = R() * S, y = R() * S; g.moveTo(x, y); g.lineTo(x + (R() - 0.5) * 30, y + (R() - 0.5) * 12); g.stroke(); }
    const dirt = g.createLinearGradient(0, S * 0.7, 0, S); dirt.addColorStop(0, 'rgba(80,66,46,0)'); dirt.addColorStop(1, 'rgba(80,66,46,0.32)'); g.fillStyle = dirt; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 2; i++) { g.fillStyle = 'rgba(214,205,180,0.8)'; g.fillRect(20 + R() * 190, 20 + R() * 190, 18 + R() * 18, 14 + R() * 12); }   // 破れの貼り直し
    if (kind === 'shoji') {
    g.fillStyle = '#4a3624';
    for (let x = 0; x < S; x += S / 4) g.fillRect(x - 2, 0, 4, S);
    for (let y = 0; y < S; y += S / 6) g.fillRect(0, y - 1.5, S, 3);
    g.fillStyle = 'rgba(0,0,0,0.25)'; for (let x = 0; x < S; x += S / 4) g.fillRect(x + 2, 0, 2, S);
    }
  } else if (kind === 'fusumaPlain') {
    // 僧坊の推定内装。金砂子や絵を付けず、素紙の繊維と貼り継ぎだけを表す。
    g.fillStyle = '#c9c1ab'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 320; i++) {
      g.fillStyle = i % 2 ? 'rgba(255,250,232,.12)' : 'rgba(98,85,65,.08)';
      g.fillRect(R() * S, R() * S, 2 + R() * 12, 1);
    }
    g.fillStyle = 'rgba(98,85,65,.09)';
    for (let y = S / 3; y < S; y += S / 3) g.fillRect(0, y, S, 1);
    // 僧坊の襖の下部を、擦れを受ける渋い色の腰貼りで保護する推定の仕上げ。
    // 框・引き手を覆わず紙面の中だけに描き、固定襖と動く戸で同じ絵を使う。
    // 厚い板を重ねず、既存の紙の形・材質・二本溝をそのまま使う。
    const waistTop = Math.round(S * .78);
    g.fillStyle = '#70634e'; g.fillRect(0, waistTop, S, S - waistTop);
    for (let i = 0; i < 100; i++) {
      g.fillStyle = i % 2 ? 'rgba(230,214,176,.12)' : 'rgba(40,32,22,.13)';
      g.fillRect(R() * S, waistTop + R() * (S - waistTop), 2 + R() * 10, 1);
    }
    // 紙を貼り継いだ細い重なり。腰貼りを木の腰板のような一色にしない。
    g.fillStyle = 'rgba(40,32,22,.2)'; g.fillRect(0, waistTop, S, 1);
    for (const x of [S / 3, S * 2 / 3]) g.fillRect(x, waistTop + 1, 1, S - waistTop - 1);
  } else {
    // 襖：地は金茶の砂子紙。下の隅に松と山の墨絵。縁は黒漆
    g.fillStyle = '#cdbd96'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(${R() < 0.4 ? '236,214,150' : '150,130,90'},${0.1 + R() * 0.2})`; g.fillRect(R() * S, R() * S, 1 + R() * 3, 1 + R() * 2); }
    const mist = g.createLinearGradient(0, S * 0.45, 0, S); mist.addColorStop(0, 'rgba(120,128,108,0)'); mist.addColorStop(1, 'rgba(90,98,80,0.5)');
    g.fillStyle = mist; g.beginPath(); g.moveTo(0, S * 0.82); g.lineTo(S * 0.28, S * 0.6); g.lineTo(S * 0.46, S * 0.74); g.lineTo(S * 0.76, S * 0.5); g.lineTo(S, S * 0.76); g.lineTo(S, S); g.lineTo(0, S); g.fill();
    g.strokeStyle = '#3c3524'; g.lineWidth = 6; g.beginPath(); g.moveTo(S * 0.25, S * 0.95); g.quadraticCurveTo(S * 0.3, S * 0.6, S * 0.27, S * 0.3); g.stroke();
    g.fillStyle = '#4a5238'; for (const [x, y] of [[0.2, 0.3], [0.33, 0.38], [0.18, 0.46], [0.3, 0.26]]) { g.beginPath(); g.ellipse(S * x, S * y, 36, 9, -0.1, 0, 7); g.fill(); }
    const dirt = g.createLinearGradient(0, 0, 0, S); dirt.addColorStop(0, 'rgba(60,48,30,0.18)'); dirt.addColorStop(0.3, 'rgba(60,48,30,0)'); dirt.addColorStop(1, 'rgba(60,48,30,0.25)'); g.fillStyle = dirt; g.fillRect(0, 0, S, S);
    g.fillStyle = 'rgba(30,22,16,0.7)'; g.fillRect(0, 0, S, 5); g.fillRect(0, S - 5, S, 5); g.fillRect(0, 0, 5, S); g.fillRect(S - 5, 0, 5, S);
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (kind === 'tatami' || kind === 'tatamiHeri' || kind === 'hieiTatamiCore' || kind === 'hieiShojiPaper' || kind === 'hieiFloorTimber') t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function mat(color, kind = '') {
  const key = `${color}:${kind}`;
  if (!materials.has(key)) materials.set(key, new THREE.MeshBasicMaterial({ color, map: kind ? picture(kind) : null }));
  return materials.get(key);
}
function box(g, w, h, d, x, y, z, color, kind = '') {
  const m = new THREE.Mesh(shape(w, h, d), mat(color, kind)); cacheUsers.push(new WeakRef(m)); m.position.set(x, y, z); g.add(m); return m;
}
// 内陣の調度と建具枠の木部。脚・束は縦、框・貫・天板は長手へ木目を通す。
// 同寸の形と既存の木肌を共有し、小口へ長手の木目を引き伸ばさない。
// 調度の外寸・当たり・まとめ描きは保ち、設営時だけ貼り方を用意する。
function hieiRitualTimber(g, w, h, d, x, y, z, color) {
  const axis = h >= w && h >= d ? 1 : w >= d ? 0 : 2;
  const key = `hieiRitualTimber:${w}:${h}:${d}`;
  if (!shapes.has(key)) {
    const geo = shape(w, h, d).clone();
    const pos = geo.attributes.position, normal = geo.attributes.normal, uv = geo.attributes.uv;
    const cross = axis === 0 ? [1, 2] : axis === 1 ? [0, 2] : [0, 1];
    const component = (a, i, k) => k === 0 ? a.getX(i) : k === 1 ? a.getY(i) : a.getZ(i);
    for (let i = 0; i < pos.count; i++) {
      const end = Math.abs(component(normal, i, axis)) > .5;
      const side = end || Math.abs(component(normal, i, cross[0])) > .5 ? cross[1] : cross[0];
      uv.setXY(i, component(pos, i, side) / .45,
        end ? component(pos, i, cross[0]) / .45 : component(pos, i, axis) / 2.4);
    }
    shapes.set(key, geo);
  }
  const m = box(g, w, h, d, x, y, z, color, 'hieiFloorTimber');
  m.geometry = shapes.get(key);
  return m;
}
// 本尊の丸みは一つの形を伸縮して使い、須弥壇と一緒にまとめ描きする。
function altarOval(g, w, h, d, x, y, z, color) {
  if (!shapes.has('altarOval')) shapes.set('altarOval', new THREE.SphereGeometry(1, 12, 8));
  const m = new THREE.Mesh(shapes.get('altarOval'), mat(color));
  cacheUsers.push(new WeakRef(m)); m.scale.set(w / 2, h / 2, d / 2); m.position.set(x, y, z); g.add(m); return m;
}
// 比叡山の香炉は上まで詰まった球で灰を覆わず、口縁から内壁へ折り返す。
// 須弥壇と前卓で同じ器・灰の形を共有し、既存のまとめ描きへ納める。
// 個別の意匠は推定。脚・卓・通路の外寸は変えない。
function hieiIncenseBowl(g, w, h, d, x, bottom, z, color, ashColor) {
  if (!shapes.has('hieiIncenseBowl')) {
    const profile = [[0, 0], [.28, 0], [.45, .22], [.5, .55],
      [.46, 1], [.4, 1], [.4, .25], [.25, .14], [0, .14]];
    shapes.set('hieiIncenseBowl', new THREE.LatheGeometry(
      profile.map(([r, y]) => new THREE.Vector2(r, y)), 12));
    shapes.set('hieiIncenseAsh', new THREE.CircleGeometry(.4, 12).rotateX(-Math.PI / 2));
  }
  const bowl = new THREE.Mesh(shapes.get('hieiIncenseBowl'), mat(color));
  const ash = new THREE.Mesh(shapes.get('hieiIncenseAsh'), mat(ashColor));
  cacheUsers.push(new WeakRef(bowl), new WeakRef(ash));
  bowl.scale.set(w, h, d); bowl.position.set(x, bottom, z);
  ash.scale.set(w, 1, d); ash.position.set(x, bottom + h * .94, z);
  g.add(bowl, ash);
}
// 比叡山の須弥壇の腰。金板を貼るだけでなく、曲線の格狭間を抜いて奥の黒漆を見せる。
// 焼失前の彫刻文様は断定せず、框・束と透かしの奥行きを基本形で補う。
function hieiAltarWaist(g) {
  if (!shapes.has('hieiKozama')) {
    const panel = new THREE.Shape();
    panel.moveTo(-.2, -.09); panel.lineTo(.2, -.09); panel.lineTo(.2, .09); panel.lineTo(-.2, .09); panel.closePath();
    const hole = new THREE.Path();
    hole.moveTo(-.15, -.055); hole.lineTo(.15, -.055);
    hole.quadraticCurveTo(.15, -.015, .11, .005);
    hole.quadraticCurveTo(.08, .035, .045, .035);
    hole.quadraticCurveTo(.015, .035, 0, .065);
    hole.quadraticCurveTo(-.015, .035, -.045, .035);
    hole.quadraticCurveTo(-.08, .035, -.11, .005);
    hole.quadraticCurveTo(-.15, -.015, -.15, -.055); hole.closePath();
    panel.holes.push(hole);
    shapes.set('hieiKozama', new THREE.ExtrudeGeometry(panel, { depth: .02, bevelEnabled: false, curveSegments: 3, steps: 1 }));
  }
  for (const y of [.185, .395]) box(g, 1.85, .035, .035, 0, y, .425, 0x6e5424);
  for (const x of [-.85, -.275, .275, .85]) box(g, .035, .21, .035, x, .29, .425, 0x6e5424);
  for (const x of [-.55, 0, .55]) {
    const m = new THREE.Mesh(shapes.get('hieiKozama'), mat(0x8a6c30));
    cacheUsers.push(new WeakRef(m)); m.position.set(x, .29, .425); g.add(m);
  }
  // 脇口から見える側面も、腰を一枚の箱で終えず框・束・格狭間で納める。
  // 焼失前の意匠は推定。正面の格狭間と形・材質を共有し、上下の框の内側に収める。
  // 壇の幅・奥行きと通行の当たりは広げず、既存の調度と一緒にまとめ描きする。
  for (const side of [-1, 1]) {
    for (const y of [.185, .395]) box(g, .035, .035, .82, side * .94, y, 0, 0x6e5424);
    for (const z of [-.36, .36]) box(g, .035, .21, .035, side * .94, .29, z, 0x6e5424);
    const m = new THREE.Mesh(shapes.get('hieiKozama'), mat(0x8a6c30));
    cacheUsers.push(new WeakRef(m));
    m.rotation.y = side * Math.PI / 2;
    m.position.set(side * .925, .29, 0); g.add(m);
  }
}
// 本尊の足もとの蓮台。上下八枚ずつの蓮弁を、一つの軽い形で交互に重ねる。
// 比叡山の本尊の顔。立像と坐像で同じ顔幅・共通の形を使う。
// 焼失前の容貌の復元とは断定せず、伏し目・鼻筋・口・長い耳を補う。
// 頭部の表面へ薄く納め、須弥壇の寸法と通路の当たりは広げない。
function hieiBuddhaFace(g, y) {
  for (const side of [-1, 1]) {
    altarOval(g, .04, .11, .045, side * .112, y - .005, -.1, 0xa48b4a);
    altarOval(g, .04, .009, .012, side * .045, y + .018, .003, 0x50452c);
    altarOval(g, .046, .009, .012, side * .045, y + .04, -.003, 0x6e5424);
  }
  altarOval(g, .025, .05, .035, 0, y - .005, .012, 0xa48b4a);
  altarOval(g, .04, .009, .012, 0, y - .045, .008, 0x6e5424);
}
function hieiLotus(g) {
  altarOval(g, .48, .1, .32, 0, .67, -.1, 0x6e5424);
  if (!shapes.has('hieiLotusPetal')) shapes.set('hieiLotusPetal', new THREE.SphereGeometry(1, 6, 4));
  for (let row = 0; row < 2; row++) for (let i = 0; i < 8; i++) {
    const a = (i + row * .5) * Math.PI / 4;
    const m = new THREE.Mesh(shapes.get('hieiLotusPetal'), mat(row ? 0xa48b4a : 0x8a6c30));
    cacheUsers.push(new WeakRef(m));
    m.scale.set(.055, .035, .105); m.rotation.set(row ? -.2 : .2, a, 0, 'YXZ');
    m.position.set(Math.sin(a) * .17, .645 + row * .05, -.1 + Math.cos(a) * .09); g.add(m);
  }
}
// 購入した和の部品を実寸の箱へ収める。中央の足もと原点を保ち、当たりと絵を合わせる。
function bought(name, w, h, d) {
  if (!cgtOn()) return null;
  const b = cgtBox(name);
  if (!b || b.h.some(v => !Number.isFinite(v) || v < .00001)) return null;
  const faces = cgtParts(name).reduce((n, p) => n + (p.geo.index ? p.geo.index.count : p.geo.attributes.position.count) / 3, 0);
  if (!cgtSpend(faces)) return null;
  const sx = w / (b.h[0] * 2), sy = h / (b.h[1] * 2), sz = d / (b.h[2] * 2);
  const part = cgtKitGroup(name, sx, sy, sz);
  if (!part) return null;
  const g = new THREE.Group();
  part.position.set(-b.c[0] * sx, -(b.c[1] - b.h[1]) * sy, -b.c[2] * sz);
  g.add(part); return g;
}
// 一枚の幅は0.9m。足もとを原点とする。襖の破壊や当たりは呼び出し側が受け持つ。
export function fusuma(w = .9, h = 1.8, painted = false, plain = false) {
  const kit = painted || plain ? null : bought('slide_door_a', w, h, .06); if (kit) return kit;
  const g = new THREE.Group();
  if (plain) {
    // 比叡山の僧坊の襖は、厚い紙の塊にせず木の下地の両面へ薄紙を張る。
    // 四辺を幅四センチの框の内面で止め、紙と下地を框へ食い込ませない。
    // 細かな断面は推定。固定襖と動く襖で共有し、外寸・重なり・当たりは保つ。
    const innerW = w - .08, innerH = h - .08;
    // 襖の下地は一枚の厚板でなく、細い骨へ両面から紙を張る。
    // 骨は框の内側で受け、横骨は縦骨の側面で止める。細部の割付は推定。
    // 固定側と動く戸で同じ形を使い、戸厚・引き手・溝の寸法は保つ。
    const bone = .018, cols = Math.max(2, Math.round(innerW / .3));
    const rows = Math.max(2, Math.round(innerH / .3));
    for (let i = 1; i < cols; i++) box(g, bone, innerH, .031,
      -innerW / 2 + innerW * i / cols, h / 2, 0, 0x795b3b);
    for (let j = 1; j < rows; j++) for (let i = 0; i < cols; i++) {
      const left = -innerW / 2 + innerW * i / cols + (i ? bone / 2 : 0);
      const right = -innerW / 2 + innerW * (i + 1) / cols - (i < cols - 1 ? bone / 2 : 0);
      box(g, right - left, bone, .031, (left + right) / 2,
        .04 + innerH * j / rows, 0, 0x795b3b);
    }
    // 引き手を紙だけで受けず、最後の縦骨と框へ力骨を掛ける。
    // 焼失前の細部は推定。丸い金具の口を空け、両面の窪みへ木を出さない。
    // 固定襖と動く襖で共有し、既存の箱・木材のまとめ描きへ納める。
    const gripX = w / 2 - .13, gripY = Math.min(.85, h * .48);
    const supportLeft = innerW / 2 - innerW / cols + bone / 2;
    const supportRight = innerW / 2;
    for (const side of [-1, 1]) {
      box(g, supportRight - supportLeft, bone, .031,
        (supportLeft + supportRight) / 2, gripY + side * .05, 0, 0x795b3b);
      box(g, bone, .1 - bone, .031,
        gripX + side * .045, gripY, 0, 0x795b3b);
    }
    // 引き手の口では紙を抜く。底を紙の手前へ貼るだけにせず、
    // 両面とも紙より奥へ指を掛ける窪みを納める。細かな金具は推定。
    const paperKey = `hieiFusumaPaper:${w}:${h}`;
    if (!shapes.has(paperKey)) {
      const paper = new THREE.Shape();
      paper.moveTo(-innerW / 2, .04); paper.lineTo(innerW / 2, .04);
      paper.lineTo(innerW / 2, h - .04); paper.lineTo(-innerW / 2, h - .04); paper.closePath();
      const hole = new THREE.Path();
      hole.absarc(w / 2 - .13, Math.min(.85, h * .48), .025, 0, Math.PI * 2, true);
      paper.holes.push(hole);
      const geo = new THREE.ExtrudeGeometry(paper, { depth: .002, bevelEnabled: false, curveSegments: 3, steps: 1 });
      const position = geo.attributes.position, uv = geo.attributes.uv;
      for (let i = 0; i < position.count; i++) uv.setXY(i,
        (position.getX(i) + innerW / 2) / innerW, (position.getY(i) - .04) / innerH);
      shapes.set(paperKey, geo);
    }
    for (const side of [-1, 1]) {
      const paper = new THREE.Mesh(shapes.get(paperKey), mat(0xffffff, 'fusumaPlain'));
      cacheUsers.push(new WeakRef(paper));
      paper.position.z = side * .0165 - .001; g.add(paper);
    }
    // 腰貼りを紙面の色だけで済ませず、薄紙三枚の小口と貼り重ねを作る。
    // 既存の絵の境へ合わせ、両面とも框・引き手を避ける推定の仕上げ。
    // 寸法ごとの形と紙の材質を保存し、固定襖・動く戸で共有する。
    const waistH = innerH * (1 - Math.round(256 * .78) / 256);
    const pitch = innerW / 3, lap = .006;
    for (let i = 0; i < 3; i++) {
      const left = -innerW / 2 + i * pitch - (i ? lap : 0);
      const right = -innerW / 2 + (i + 1) * pitch;
      const key = `hieiFusumaWaist:${w}:${h}:${i}`;
      if (!shapes.has(key)) {
        const geo = new THREE.BoxGeometry(right - left, waistH, .0006);
        const pos = geo.attributes.position, uv = geo.attributes.uv;
        for (let q = 0; q < pos.count; q++) uv.setXY(q,
          (pos.getX(q) + (left + right) / 2 + innerW / 2) / innerW,
          (pos.getY(q) + waistH / 2) / innerH);
        shapes.set(key, geo);
      }
      for (const side of [-1, 1]) {
        const sheet = new THREE.Mesh(shapes.get(key), mat(0xffffff, 'fusumaPlain'));
        cacheUsers.push(new WeakRef(sheet));
        sheet.position.set((left + right) / 2, .04 + waistH / 2,
          side * (.0178 + i * .0006));
        g.add(sheet);
      }
    }
  } else box(g, w - .06, h - .06, .035, 0, h / 2, 0, 0xffffff, 'fusuma');
  frame(g, w, h, 0x32271c, plain);
  if (plain) hieiDoorTongues(g, w, h, 0x32271c);
  if (plain) {
    // 四隅の枘と込栓は上の共通部品で一度だけ納める。
    // 同じ木口へ別の栓を重ねると、両面が一致して近くでちらつく。
    // 比叡山の僧坊の襖は、突出した箱ではなく指を掛ける浅い丸形の引き手。
    // 両面に縁と暗い底を納め、固定襖・横滑りする襖で同じ形と材質を使う。
    // 細かな金具の意匠は推定。戸の厚みと二本溝の間隔は広げない。
    if (!shapes.has('hieiHikiteRim')) {
      shapes.set('hieiHikiteRim', new THREE.RingGeometry(.025, .035, 12));
      shapes.set('hieiHikiteBottom', new THREE.CircleGeometry(.025, 12));
      const cup = new THREE.CylinderGeometry(.025, .025, .008, 12, 1, true).rotateX(Math.PI / 2);
      // 筒の外側でなく、指を掛ける内側を描く。同じ金具の材質を共有する。
      const index = cup.index.array, normal = cup.attributes.normal;
      for (let i = 0; i < index.length; i += 3) {
        const a = index[i]; index[i] = index[i + 2]; index[i + 2] = a;
      }
      for (let i = 0; i < normal.count; i++) normal.setXYZ(i, -normal.getX(i), -normal.getY(i), -normal.getZ(i));
      shapes.set('hieiHikiteCup', cup);
    }
    for (const side of [-1, 1]) {
      for (const [key, color, depth] of [['hieiHikiteRim', 0x66553a, .019], ['hieiHikiteCup', 0x66553a, .015], ['hieiHikiteBottom', 0x211b16, .011]]) {
        const m = new THREE.Mesh(shapes.get(key), mat(color));
        cacheUsers.push(new WeakRef(m));
        m.position.set(w / 2 - .13, Math.min(.85, h * .48), side * depth);
        m.rotation.y = side < 0 ? Math.PI : 0;
        g.add(m);
      }
    }
    return g;
  }
  box(g, .06, .08, .055, w / 2 - .13, .85, 0, 0x66553a); return g;
}
function frame(g, w, h, color, fitted = false, gripY = null) {
  // 比叡山の框も柱・敷居と同じ実寸の木肌にする。
  // 横框は横、縦框は縦へ木目を通し、固定戸と動く戸で形と材質を共有する。
  const timber = fitted ? hieiRitualTimber : box;
  for (const y of [.02, h - .02]) timber(g, w, .04, .06, 0, y, 0, color);
  // 比叡山の襖・障子は縦框を上下の框の内側へ納める。
  // 手掛けの部分も縦框を重ねず、上下の木口を手掛け材へつなぐ。
  // 同じ面のちらつきを除き、戸の外寸と二本溝は保つ。
  const bottom = fitted ? .04 : 0, top = fitted ? h - .04 : h;
  const spans = gripY == null ? [[bottom, top]] : [[bottom, gripY - .105], [gripY + .105, top]];
  for (const x of [-w / 2 + .02, w / 2 - .02]) for (const [a, b] of spans) {
    if (b > a) timber(g, .04, b - a, .06, x, (a + b) / 2, 0, color);
  }
}
export function shoji(w = .9, h = 1.8, kumiko = false) {
  const kit = !kumiko && bought('slide_door_c', w, h, .06); if (kit) return kit;
  const g = new THREE.Group();
  // 比叡山の背の高い障子は腰板で足元を保護する推定の納まり。
  // 明かり窓の小障子は総紙張りのまま、入口・座敷の固定側と動く戸で共有する。
  const waist = kumiko && h > 1.2 ? .28 : .02;
  // 比叡山の紙は組子の片面へ張る。厚い紙を桟の中央へ埋め込まない。
  // 紙面は組子の背に接し、框の厚みと既存の二本溝の内側へ収める。
  // 紙は上下の框と腰桟の内面へ納める。腰桟を紙面で覆わない。
  const paperBottom = kumiko ? (waist > .02 ? waist + .02 : .04) : waist;
  const paperTop = h - (kumiko ? .04 : .02);
  const gripY = Math.min(.85, h * .48);
  if (kumiko) {
    // 手掛けは框から内側へ三センチ張り出す。紙を一枚で張ると、
    // 裏面の紙が手掛け材と彫り込みを貫くため、その木口で紙を止める。
    // 固定障子と動く障子で共用し、戸厚・二本溝・当たりは変えない。
    const paperPatch = (x0, x1, y0, y1, lap = false) => {
      if (x1 <= x0 || y1 <= y0) return;
      const mesh = box(g, x1 - x0, y1 - y0, lap ? .0006 : .002, (x0 + x1) / 2,
        (y0 + y1) / 2, lap ? -.0248 : -.0235, 0xffffff, 'hieiShojiPaper');
      // 手掛けを避けた五枚を同じ一面の紙として貼る。
      // 各片へ絵全体を伸ばすと、三センチの帯だけ繊維が細かくなり、
      // 紙の切り替わりも見えていた。表裏とも戸の座標から紙目を連続させる。
      // 同寸・同位置の形を保存し、固定障子と横滑りする戸で使い回す。
      const key = `hieiShojiPaper:${x0}:${x1}:${y0}:${y1}:${lap}`;
      if (!shapes.has(key)) {
        const geo = mesh.geometry.clone(), pos = geo.attributes.position, uv = geo.attributes.uv;
        for (let i = 0; i < uv.count; i++) uv.setXY(i,
          (pos.getX(i) + (x0 + x1) / 2) / .3,
          (pos.getY(i) + (y0 + y1) / 2) / .3);
        shapes.set(key, geo);
      }
      mesh.geometry = shapes.get(key);
    };
    // 大判一枚の紙にせず、組子二間ごとの小さな紙を貼り継ぐ推定の仕上げ。
    // 重なりは紙の裏面だけへ〇・六ミリ出し、框・手掛けを覆わない。
    // 五つの紙片で同じ割付と紙目を使い、固定障子・動く戸とも設営時にまとめる。
    const innerW = w - .08, innerH = paperTop - paperBottom;
    const cols = Math.max(1, Math.round(innerW / .22));
    const rows = Math.max(1, Math.round(innerH / .3));
    const paper = (x0, x1, y0, y1) => {
      paperPatch(x0, x1, y0, y1);
      for (let row = 2; row < rows; row += 2) {
        const y = paperBottom + innerH * row / rows;
        paperPatch(x0, x1, Math.max(y0, y - .006), Math.min(y1, y), true);
      }
      for (let col = 2; col < cols; col += 2) {
        const x = -innerW / 2 + innerW * col / cols;
        // 横の貼り継ぎとの交点は一枚分だけ残し、同じ面を重ねない。
        for (let row = 0; row < rows; row += 2) {
          const bottom = paperBottom + innerH * row / rows;
          const top = paperBottom + innerH * Math.min(rows, row + 2) / rows;
          paperPatch(Math.max(x0, x - .006), Math.min(x1, x),
            Math.max(y0, bottom), Math.min(y1, top - (row + 2 < rows ? .006 : 0)), true);
        }
      }
    };
    paper(-w / 2 + .07, w / 2 - .07, paperBottom, paperTop);
    for (const side of [-1, 1]) {
      const x0 = side < 0 ? -w / 2 + .04 : w / 2 - .07;
      paper(x0, x0 + .03, paperBottom, Math.min(paperTop, gripY - .105));
      paper(x0, x0 + .03, Math.max(paperBottom, gripY + .105), paperTop);
    }
  } else box(g, w - .04, paperTop - paperBottom, .025,
    0, (paperTop + paperBottom) / 2, 0, 0xffffff, 'shoji');
  frame(g, w, h, 0x795b3b, kumiko, kumiko ? gripY : null);
  if (kumiko) hieiDoorTongues(g, w, h, 0x795b3b);
  if (waist > .02) {
    // 腰板は下框の上面から腰桟の下面へ納める。
    // 下框へ二センチ食い込ませず、両面の板目地も板の内側で止める。
    const bead = .012, bottom = .04 + bead, top = waist - .02 - bead;
    const center = (bottom + top) / 2, panelWidth = w - .08 - bead * 2;
    // 僧坊の腰障子は細い板を框へ納める。表面に線だけを貼らず、
    // 両面に板の継ぎ目と厚みを見せる。焼失前の板割は推定。
    // 薄い裏板で目地の奥を閉じ、既存の戸厚と二本溝の内側に収める。
    // 腰板を框へ直接突き付けず、両面の押縁で受ける推定の納まり。
    // 板を押縁の内寸へ引き、四隅の面を重ねない。戸厚と二本溝は保つ。
    for (const side of [-1, 1]) {
      for (const yy of [bottom - bead / 2, top + bead / 2]) {
        box(g, w - .08, bead, .015, 0, yy, side * .02, 0x795b3b);
      }
      for (const x of [-(panelWidth + bead) / 2, (panelWidth + bead) / 2]) {
        box(g, bead, top - bottom, .015, x, center, side * .02, 0x795b3b);
      }
    }
    box(g, panelWidth, top - bottom, .008, 0, center, 0, 0x4a3828);
    const boards = Math.max(2, Math.round(panelWidth / .18));
    const boardW = panelWidth / boards;
    // 僧坊の腰障子も、格子戸と同じ縮尺で縦の木目を通す。
    // 単色の板を改め、表裏と小口で木肌を伸ばさない。板取りは推定。
    // 同寸の形と既存の木目材質を固定障子・動く戸で共有する。
    const boardKey = `hieiShojiBoard:${boardW}:${top - bottom}`;
    if (kumiko && !shapes.has(boardKey)) {
      const geo = shape(boardW - .002, top - bottom, .025).clone();
      const pos = geo.attributes.position, normal = geo.attributes.normal, uv = geo.attributes.uv;
      for (let j = 0; j < pos.count; j++) {
        const end = Math.abs(normal.getY(j)) > .5;
        const side = Math.abs(normal.getX(j)) > .5;
        uv.setXY(j, (side ? pos.getZ(j) : pos.getX(j)) / .45,
          end ? pos.getZ(j) / .45 : pos.getY(j) / 2.4);
      }
      shapes.set(boardKey, geo);
    }
    for (let i = 0; i < boards; i++) {
      const board = box(g, boardW - .002, top - bottom, .025,
        (i + .5 - boards / 2) * boardW, center, 0, 0x80694c,
        kumiko ? 'hieiFloorTimber' : '');
      if (kumiko) board.geometry = shapes.get(boardKey);
    }
    (kumiko ? hieiRitualTimber : box)(g, w - .08, .04, .06, 0, waist, 0, 0x795b3b);
    if (kumiko) {
      // 腰桟を縦框へ突き付けたままにせず、枘と込栓で留める推定の納まり。
      // 固定側と横滑りする戸で共有し、栓の木口だけ框の面から三ミリ出す。
      // 共通の箱と材質を使い、設営時のまとめ描きだけへ加える。
      for (const side of [-1, 1]) {
        const x = side * (w / 2 - .02);
        box(g, .04, .018, .018, x, waist, 0, 0x795b3b);
        for (const face of [-1, 1]) box(g, .012, .016, .003,
          x, waist, face * .0315, 0x95704a);
      }
    }
  }
  // 比叡山の障子は絵の線ではなく木の桟で紙を受ける。裏は平らな紙面にする。
  // 同寸の形と木の材質を共有し、固定側も動く戸も設営時にまとめる。
  if (kumiko) {
    // 正面戸と小さな明かり障子で同じ本数を使うと、窓だけ目が極端に細かくなる。
    // 框の内寸から割り付け、端に半端な升を残さない。焼失前の意匠は推定。
    const innerW = w - .08, bottom = waist > .02 ? waist + .02 : .04, innerH = h - .04 - bottom;
    const cols = Math.max(1, Math.round(innerW / .22));
    const rows = Math.max(1, Math.round(innerH / .3));
    // 組子も単色の棒で済ませず、框と同じ縮尺で長手へ木目を通す。
    for (let i = 1; i < cols; i++) hieiRitualTimber(g, .014, innerH, .045, (i / cols - .5) * innerW, bottom + innerH / 2, 0, 0x795b3b);
    // 横組子は縦組子の側面へ納める。同じ厚さの材を交差させると、
    // 表裏の面が重なってちらつく。固定障子と動く障子で同じ納まりを使う。
    // 組子の割付・太さは保ち、設営時にだけ短い材へ分けてまとめ描きする。
    for (let i = 1; i < rows; i++) for (let j = 0; j < cols; j++) {
      const cy = bottom + i * innerH / rows;
      // 手掛け材だけは框より内側へ三センチ張り出す。
      // その高さの横組子は手掛けの内面で止め、同じ面を重ねない。
      const grip = Math.abs(cy - gripY) < .111;
      const left = Math.max(-innerW / 2 + j * innerW / cols + (j > 0 ? .007 : 0), -w / 2 + (grip ? .07 : .04));
      const right = Math.min(-innerW / 2 + (j + 1) * innerW / cols - (j < cols - 1 ? .007 : 0), w / 2 - (grip ? .07 : .04));
      if (right > left) hieiRitualTimber(g, right - left, .012, .045, (left + right) / 2, cy, 0, 0x795b3b);
    }
    // 紙を押さずに開けられるよう、縦框に木の手掛けを納める。
    // 細部は推定。両面の浅い彫り込みを戸の厚みの中へ収め、二本溝に干渉させない。
    // 固定側・動く戸とも共通の箱と材質を使い、設営時だけ作る。
    // 左右の框へ手掛けを彫り、右の戸も紙の表裏を反転せずに使う。
    const y = gripY;
    for (const x of [-w / 2 + .035, w / 2 - .035]) {
      // 黒い板を框の表へ貼らず、周囲の木と薄い底で両面の窪みを組む。
      // 紙を避けた幅三・五センチ・高さ十五センチの中へ指を掛ける。
      // 底を戸厚の中央へ残し、裏へ貫通させない。従来と同じ五つの箱を共有する。
      for (const side of [-1, 1]) {
        hieiRitualTimber(g, .07, .03, .06, x, y + side * .09, 0, 0x795b3b);
        hieiRitualTimber(g, .0175, .15, .06, x + side * .02625, y, 0, 0x795b3b);
      }
      box(g, .035, .15, .008, x, y, 0, 0x2e2218);
    }
  }
  return g;
}
// 板戸：黒ずんだ杉の鏡板に、横の桟を五段（寺の堂・蔵の間仕切り）。一枚0.9m、足もと原点
export function itado(w = .9, h = 1.8) {
  const g = new THREE.Group();
  box(g, w - .06, h - .06, .03, 0, h / 2, 0, 0x4a3828);
  for (let k = 1; k < 6; k++) box(g, w - .06, .045, .05, 0, h * k / 6, 0, 0x2e2218);
  frame(g, w, h, 0x241a12);
  box(g, .05, .1, .06, w / 2 - .12, .9, 0, 0x1a1410); return g;
}
// 格子戸：寺の内陣と外陣の境。黒漆の框に細い縦格子と三本の貫。透けて奥の灯が見える
export function koshi(w = .9, h = 1.8, hikite = false, fitted = hikite) {
  const g = new THREE.Group();
  // 比叡山は框の内寸で格子を割る。狭い引き戸も広い固定戸も八本固定にせず、
  // 同じ程度の格子間隔に揃える。焼失前の割付は推定。共通の形と材質でまとめる。
  const inner = w - .08, divisions = fitted ? Math.max(2, Math.round(inner / .1)) : 9;
  if (fitted) {
    // 比叡山の腰板は下框と腰框の間へ納め、縦格子を腰板へ貫通させない。
    // 固定戸・横滑りする戸で同じ納まりを使う。細かな板割は推定。
    // 薄い裏板で目地の奥を閉じ、両面から板の厚みと継ぎ目を見せる。
    // 共通の箱・既存の木色を使い、戸の厚み・溝・通行の当たりは広げない。
    const boardBottom = .04, boardTop = .29, latticeBottom = .35, latticeTop = h - .04;
    // 腰板を框と同じ面へ貼り付けず、両面の板押さえの奥へ落とし込む。
    // 押さえは縦框と上下の框の内寸へ納め、四隅で面を重ねない。
    // 細かな仕口は推定。固定格子と動く戸で共用し、戸厚と溝は変えない。
    const bead = .012, panelBottom = boardBottom + bead, panelTop = boardTop - bead;
    const panelWidth = inner - bead * 2, panelHeight = panelTop - panelBottom;
    for (const side of [-1, 1]) {
      const depth = side * .0175;
      for (const y of [boardBottom + bead / 2, boardTop - bead / 2]) {
        box(g, inner, bead, .015, 0, y, depth, 0x2a1c12);
      }
      for (const x of [-(inner - bead) / 2, (inner - bead) / 2]) {
        box(g, bead, panelHeight, .015, x, (panelBottom + panelTop) / 2, depth, 0x2a1c12);
      }
    }
    box(g, panelWidth, panelHeight, .008, 0, (panelBottom + panelTop) / 2, 0, 0x1e140e);
    const boards = Math.max(2, Math.round(panelWidth / .18)), boardW = panelWidth / boards;
    // 格子戸の腰板にも縦の木目を通す。単色の板では近くで木材に見えない。
    // 板の実寸で貼り、表裏・小口で木目を伸ばさない。細かな板取りは推定。
    // 同寸の形と既存の木目材質を固定戸・引き戸で共有し、設営時だけ作る。
    const boardKey = `hieiKoshiBoard:${boardW}:${panelHeight}`;
    if (!shapes.has(boardKey)) {
      const geo = shape(boardW - .002, panelHeight, .02).clone();
      const pos = geo.attributes.position, normal = geo.attributes.normal, uv = geo.attributes.uv;
      for (let j = 0; j < pos.count; j++) {
        const end = Math.abs(normal.getY(j)) > .5;
        const side = Math.abs(normal.getX(j)) > .5;
        uv.setXY(j, (side ? pos.getZ(j) : pos.getX(j)) / .45,
          end ? pos.getZ(j) / .45 : pos.getY(j) / 2.4);
      }
      shapes.set(boardKey, geo);
    }
    for (let i = 0; i < boards; i++) {
      const board = box(g, boardW - .002, panelHeight, .02,
        -panelWidth / 2 + (i + .5) * boardW, (panelBottom + panelTop) / 2,
        0, 0x625037, 'hieiFloorTimber');
      board.geometry = shapes.get(boardKey);
    }
    box(g, inner, .06, .05, 0, .32, 0, 0x2a1c12);
    // 横桟を通し、縦格子の木口をその上下の面で受ける。
    // 格子を貫通させず、内陣側からも木の厚みが分かる納まりにする。
    // 固定戸・引き戸で共用し、設営時のまとめ描きだけへ加える。
    const rails = [h * .55, h - .3].filter(y => y - .0175 > latticeBottom && y + .0175 < latticeTop);
    for (const y of rails) box(g, inner, .035, .04, 0, y, 0, 0x2a1c12);
    // 腰框と横桟を縦框へ枘差しし、込栓の木口を両面に見せる。
    // 棒を框へ突き合わせただけの形を改める推定の仕口。固定戸と動く戸で共用する。
    // 枘は縦框の中、栓の木口だけを框の面へ接し、二本溝と通路は広げない。
    for (const y of [.32, ...rails]) for (const side of [-1, 1]) {
      const x = side * (w / 2 - .02);
      box(g, .04, .018, .018, x, y, 0, 0x2a1c12);
      for (const face of [-1, 1]) box(g, .012, .016, .003,
        x, y, face * .0315, 0x95704a);
    }
    for (let k = 1; k < divisions; k++) {
      const x = -inner / 2 + k * inner / divisions;
      let bottom = latticeBottom;
      for (const y of rails) {
        const top = y - .0175;
        if (top > bottom) box(g, .022, top - bottom, .03, x, (bottom + top) / 2, 0, 0x2a1c12);
        bottom = y + .0175;
      }
      if (latticeTop > bottom) box(g, .022, latticeTop - bottom, .03,
        x, (bottom + latticeTop) / 2, 0, 0x2a1c12);
    }
    // 四隅は上下の框へ縦框を納め、同じ面の重なりを残さない。
    for (const y of [.02, h - .02]) box(g, w, .04, .06, 0, y, 0, 0x1e140e);
    for (const side of [-1, 1]) {
      const x = side * (w / 2 - .02);
      // 引き手の埋木へ縦框の木口を合わせる。重ねた同じ面のちらつきを防ぐ。
      // 右の戸は共通の開閉処理で反転するため、引き手側だけを切り分ける。
      if (hikite && side > 0) {
        const gripY = Math.min(.85, h * .48);
        for (const [a, b] of [[.04, gripY - .11], [gripY + .11, h - .04]]) {
          if (b > a) box(g, .04, b - a, .06, x, (a + b) / 2, 0, 0x1e140e);
        }
      } else box(g, .04, h - .08, .06, x, h / 2, 0, 0x1e140e);
    }
  } else {
    for (let k = 1; k < divisions; k++) box(g, .022, h - .06, .03,
      -w / 2 + k * w / 9, h / 2, 0, 0x2a1c12);
    for (const y of [.32, h * .55, h - .3]) box(g, w - .06, .035, .04, 0, y, 0, 0x2a1c12);
    box(g, w - .06, .26, .03, 0, .16, 0, 0x3a2a1c);
  }
  if (!fitted) frame(g, w, h, 0x1e140e);
  else hieiDoorTongues(g, w, h, 0x1e140e);
  if (hikite) {
    // 比叡山の動く格子戸だけに、框へ納まる縦長の引き手を付ける。
    // 黒い板を框へ重ねず、四周の埋木と中央の底で両面に指掛かりを残す。
    // 金具の細部は推定。従来と同じ五つの箱を使い、隣の溝へ突出させない。
    const x = w / 2 - .035, y = Math.min(.85, h * .48);
    for (const side of [-1, 1]) {
      box(g, .07, .045, .06, x, y + side * .0875, 0, 0x1e140e);
      box(g, .024, .13, .06, x + side * .023, y, 0, 0x1e140e);
    }
    box(g, .022, .13, .008, x, y, 0, 0x34312b);
  }
  return g;
}
export function tatami(w = .9, d = 1.8, flush = false) {
  // 比叡山は素材の読み込み後も、敷居と揃えた畳床・畳表・縁を使う。
  const kit = flush ? null : bought('tatami_floor_modular_a', w, .06, d);
  const g = new THREE.Group();
  // 素材に穴や切り欠きがあっても、下の暗い基壇を床のすき間として見せない。
  // 比叡山の畳は六センチの厚みを畳床と薄い畳表に分ける。
  // 上がり口で見える小口へ表の織り目を引き伸ばさず、藁の断面を出す。
  // 縁・上面・当たりの高さは揃え、共通の箱と材質で設営時にまとめる。
  const layered = flush && !kit;
  // 藁の床は縁の下まで通す。布の幅だけ床を欠くと、小口まで黒い角材になってしまう。
  // 長辺の外側だけ薄い布を巻き、小口には縁の下の藁も見せる。
  const wrap = .0015;
  const core = layered ? box(g, w - wrap * 2, .056, d, 0, .028, 0, 0xffffff, 'hieiTatamiCore') : null;
  const surface = box(g, layered ? w - .088 : w, kit ? .045 : layered ? .004 : .06,
    d, 0, kit ? .0225 : layered ? .058 : .03, 0, 0xffffff, 'tatami');
  // 表・藁の小口・縁は各面の実寸で貼る。上面の奥行きを薄い側面にも
  // 使うと、側面だけ布目が潰れ、半畳と一畳で藁の太さも変わっていた。
  // 寸法ごとの形と繰り返す絵を共有し、ほかの戦の畳は書き換えない。
  const weave = (mesh, kind) => {
    const { width, height, depth } = mesh.geometry.parameters;
    const key = `hieiWeaveFaces:${kind}:${width}:${height}:${depth}`;
    if (!shapes.has(key)) {
      const geo = mesh.geometry.clone(), uv = geo.attributes.uv, normal = geo.attributes.normal;
      for (let i = 0; i < uv.count; i++) {
        const side = Math.abs(normal.getX(i)) > .5, top = Math.abs(normal.getY(i)) > .5;
        uv.setXY(i, uv.getX(i) * (side ? depth : width) / .9,
          uv.getY(i) * (top ? depth : height) / .9);
      }
      shapes.set(key, geo);
    }
    mesh.geometry = shapes.get(key);
  };
  if (core) weave(core, 'hieiTatamiCore');
  if (flush && !kit) weave(surface, 'tatami');
  if (kit) { g.add(kit); return g; }
  // 畳縁（黒の麻）：長い辺だけに付ける
  // 比叡山の僧坊は畳寄せ・敷居と同じ六センチで納める。
  // 縁は薄い上面と側面に分ける。畳表の上へ重ねず、縁の内面で畳表を止める。
  // 寸法ごとの形と布の材質は保存し、従来どおり床のまとめ描きへ含める。
  for (const x of [-w / 2 + .022, w / 2 - .022]) {
    const hem = box(g, .044, flush ? .004 : .066, d, x, flush ? .058 : .033, 0,
      flush ? 0xffffff : 0x1d1c18, flush ? 'tatamiHeri' : '');
    if (flush) {
      weave(hem, 'tatamiHeri');
      const side = box(g, wrap, .056, d, Math.sign(x) * (w / 2 - wrap / 2),
        .028, 0, 0xffffff, 'tatamiHeri');
      // 側面の横軸は畳の長さ、縦軸は厚み。薄さで布目を引き伸ばさない。
      weave(side, 'tatamiHeriSide');
    }
  }
  return g;
}
// 畳の割り付け：一列おきに半畳ずらし、四つの角が一点に集まらないようにする（祝儀敷き）。端は切り詰める。
export function tatamiTiles(x0, x1, z0, z1, tw = .9, td = 1.8) {
  const out = [];
  for (let x = x0, c = 0; x < x1 - .02; x += tw, c++) {
    const w = Math.min(tw, x1 - x);
    for (let z = z0 - (c % 2 ? td / 2 : 0); z < z1 - .02; z += td) {
      const a = Math.max(z0, z), b = Math.min(z1, z + td);
      if (w > .1 && b - a > .1) out.push([x + w / 2, (a + b) / 2, w, b - a]);
    }
  }
  return out;
}
// 僧坊は半畳の寸法から一畳を組み、列の端を半畳で納める。
// 隣の列の継ぎ目をずらし、細長い畳や四分の一畳を作らない。
function hieiTatamiTiles(x0, x1, z0, z1) {
  // 控えの座敷は敷居と引き戸の溝を除くと奥行きが浅い。
  // 縦向きだけで割ると全て半畳になり、横並びの短い畳で埋まる。
  // 一畳を二枚の半畳寸法で取れる向きへ替え、端だけ半畳で納める。
  // 形そのものを回し、畳縁も長辺へ沿わせる。間取りと戸の溝は変えない。
  if (z1 - z0 < 1.6 && x1 - x0 > z1 - z0) {
    return hieiTatamiTiles(z0, z1, x0, x1)
      .map(([z, x, w, d]) => [x, z, w, d, Math.PI / 2]);
  }
  const out = [], nx = Math.max(1, Math.round((x1 - x0) / .9));
  const nz = Math.max(1, Math.round((z1 - z0) / .9));
  const ux = (x1 - x0) / nx, uz = (z1 - z0) / nz;
  // 僧の座敷は列ごとに継ぎ目を半畳ずらし、四隅が十字に集まる敷き方を避ける。
  // 端は半畳で納め、敷居・畳寄せの内寸は変えない。設営時だけ共通の畳を並べる。
  for (let col = 0; col < nx; col++) {
    const cx = x0 + (col + .5) * ux;
    let row = 0;
    if (col % 2) {
      out.push([cx, z0 + uz / 2, ux, uz, 0]);
      row = 1;
    }
    for (; row + 1 < nz; row += 2) out.push([cx, z0 + (row + 1) * uz, ux, uz * 2, 0]);
    if (row < nz) out.push([cx, z0 + (row + .5) * uz, ux, uz, 0]);
  }
  return out;
}
export function hashira(h = 2.8) {
  if (cgtOn() && cgtHas('Post_Interior')) { const k = cgtKitGroup('Post_Interior', 0.5, h / 2, 0.5, 0.7); if (k) { const w = new THREE.Group(); w.add(k); return w; } }
  const g = new THREE.Group(); box(g, .16, h, .16, 0, h / 2, 0, 0x614832); return g;
}
export function tokonoma(w = 2.7) {
  const g = new THREE.Group(); box(g, w, .18, .85, 0, .09, 0, 0x604831);
  box(g, w, 2.5, .08, 0, 1.25, -.43, 0xcfc3a2);
  const scroll = bought('wall_scroll', .55, 1.25, .035);
  if (scroll) place(g, scroll, 0, -.37, 0, .775);
  else box(g, .55, 1.25, .025, 0, 1.4, -.37, 0xffffff, 'fusuma');
  for (const x of [-w / 2, w / 2]) { const p = hashira(2.5); p.position.x = x; g.add(p); } return g;
}
export function byobu(n = 4) {
  const g = new THREE.Group();
  for (let i = 0; i < n; i++) { const p = fusuma(.65, 1.5); p.position.set((i - (n - 1) / 2) * .61, 0, (i % 2) * .16); p.rotation.y = i % 2 ? -.2 : .2; g.add(p); } return g;
}
export function tsukue() {
  const g = new THREE.Group(); box(g, 1.2, .08, .7, 0, .42, 0, 0x493022);
  for (const x of [-.48, .48]) for (const z of [-.24, .24]) box(g, .07, .4, .07, x, .2, z, 0x493022); return g;
}
// 僧坊の経巻。巻いた紙と両端の軸を同じ円柱で表し、机・棚で使い回す。
// 個別の経典名や焼失前の調度は断定せず、文字は描かない。
function hieiScroll(g, length, radius, x, y, z, rot = 0) {
  if (!shapes.has('hieiScroll')) shapes.set('hieiScroll', new THREE.CylinderGeometry(1, 1, 1, 8));
  for (const axis of [true, false]) {
    const m = new THREE.Mesh(shapes.get('hieiScroll'), mat(axis ? 0x59412b : 0xcac1a5));
    cacheUsers.push(new WeakRef(m));
    m.scale.set(axis ? radius * .3 : radius, axis ? length : length * .86, axis ? radius * .3 : radius);
    m.rotation.set(0, rot, Math.PI / 2); m.position.set(x, y, z); g.add(m);
  }
}
export function tomyo(oil = false) {
  const kit = oil ? null : bought('japanese_lamp_emissive', .32, .95, .32); if (kit) return kit;
  const g = new THREE.Group(); box(g, .32, .05, .32, 0, .025, 0, 0x39291d);
  box(g, .05, .75, .05, 0, .4, 0, 0x604329); box(g, .18, .08, .18, 0, .8, 0, 0xcbb37a);
  if (oil) {
    // 比叡山の灯明は油皿・油面・灯芯を分ける。共通の丸い形を使い回す。
    altarOval(g, .25, .065, .25, 0, .835, 0, 0x79613b);
    altarOval(g, .19, .008, .19, 0, .864, 0, 0x382b16);
    box(g, .016, .018, .075, 0, .875, .055, 0xb9a47b);
    altarOval(g, .035, .09, .035, 0, .925, .075, 0xffd08b);
  } else box(g, .055, .13, .055, 0, .9, 0, 0xffd08b);
  return g;
}
// 根本中堂は置き灯明ではなく釣灯籠。焼失前の細かな意匠は推定。
// 京都国立博物館「最澄と天台宗のすべて」鑑賞ガイド（2022）の釣灯籠を参考にする。
// https://www.kyohaku.go.jp/jp/learn/assets/guides/2022_saicho_guide_ja.pdf
function hieiHangingLamp() {
  const g = new THREE.Group(), bronze = 0x79613b;
  // 油面・灯芯・火先は置き灯明と同じ高さ。明かりの焼き込みもそのまま使う。
  altarOval(g, .3, .05, .3, 0, .79, 0, bronze);
  altarOval(g, .25, .065, .25, 0, .835, 0, bronze);
  altarOval(g, .19, .008, .19, 0, .864, 0, 0x382b16);
  box(g, .016, .018, .075, 0, .875, .055, 0xb9a47b);
  altarOval(g, .035, .09, .035, 0, .925, .075, 0xffd08b);
  // 火袋を厚い箱で塞がず、四隅の支柱と細い格子から油皿を見せる。
  for (const x of [-.11, .11]) for (const z of [-.11, .11]) {
    box(g, .018, .302, .018, x, .984, z, bronze);
  }
  for (const side of [-1, 1]) {
    // 油皿の受けの上に下框を回し、支柱の下端を受ける。細かな割付は推定。
    // 上框と同じく正背面を通し、側面は内面で止めて隅を重ねない。
    box(g, .238, .018, .018, 0, .824, side * .11, bronze);
    box(g, .018, .018, .202, side * .11, .824, 0, bronze);
    // 横桟は隅の支柱の内面で止め、接合部の表面を二重にしない。
    box(g, .202, .018, .012, 0, 1.07, side * .11, bronze);
    box(g, .012, .018, .202, side * .11, 1.07, 0, bronze);
    // 四面の縦格子を上下の框と横桟の内面へ納め、棒だけの火袋にしない。
    // 油皿と灯芯を見せる間隔を残し、共通の箱・銅色で設営時にまとめる。
    for (const t of [-.036, .036]) for (const [bottom, top] of [[.833, 1.061], [1.079, 1.135]]) {
      box(g, .008, top - bottom, .012, t, (bottom + top) / 2, side * .11, bronze);
      box(g, .012, top - bottom, .008, side * .11, (bottom + top) / 2, t, bronze);
    }
    // 火袋の四隅を上框で結び、その上を四角い笠で覆う。
    // 支柱の上端（一・一三五メートル）へ下面を合わせる。
    // 正背面を通し、側面はその内面で止める。細部は推定。
    // 共通の箱・銅色と設営時のまとめ描きを使い、灯火・当たりは増やさない。
    box(g, .238, .018, .018, 0, 1.144, side * .11, bronze);
    box(g, .018, .018, .202, side * .11, 1.144, 0, bronze);
  }
  // 丸い笠では四隅の框が外へ出るため、四面の勾配と軒のある笠へ替える。
  // 焼失前の意匠は推定。下面の半幅を約十五・六センチとし、
  // 半幅十一・九センチの上框を覆う。灯火・吊り棒の高さは保つ。
  // 一つの形を全棟で共有し、既存のまとめ描きへ含める。
  if (!shapes.has('hieiLampRoof')) shapes.set('hieiLampRoof',
    new THREE.CylinderGeometry(.06, .22, .09, 4, 1).rotateY(Math.PI / 4));
  const roof = new THREE.Mesh(shapes.get('hieiLampRoof'), mat(bronze));
  cacheUsers.push(new WeakRef(roof)); roof.position.y = 1.18; g.add(roof);
  altarOval(g, .09, .08, .09, 0, 1.255, 0, bronze);
  return g;
}
// 堂・僧坊・庫裏の灯明の火先。描く灯明と同じ縮尺・向きで、設営時の明かりにも渡す。
export function hieiAltarLamps(layout) {
  if (layout.profile !== 'hieizan') return [];
  if (['sobo', 'kuri'].includes(layout.kind)) {
    // 通路のために外した灯具は光らせず、描画・当たりと同じ配置を使う。
    return layout.props.filter(p => p.part === 'tomyo').map(p => {
      const rot = p.rot || 0;
      return [p.x + .075 * Math.sin(rot), (p.y || 0) + .925, p.z + .075 * Math.cos(rot)];
    });
  }
  if (!['chudo', 'hondo'].includes(layout.kind)) return [];
  const lamps = [];
  for (const p of layout.props) if (p.part === 'altar') {
    const rot = p.rot || 0;
    for (const side of [-1, 1]) {
      const x = side * (layout.kind === 'chudo' ? .9 : .75) * p.w / 2.1;
      // 灯芯の上の火と同じ位置。卓上へ上げた高さも含める。
      const z = .075 * p.d;
      lamps.push([p.x + x * Math.cos(rot) + z * Math.sin(rot), (p.y || 0) + 1.475 * p.h / 2.27, p.z - x * Math.sin(rot) + z * Math.cos(rot)]);
    }
  }
  return lamps;
}
export function suwari(color = 0x354349, role = 'kerai') {
  const g = new THREE.Group(); box(g, .7, .18, .55, 0, .12, 0, color); box(g, .42, .55, .26, 0, .44, -.08, color);
  box(g, .2, .22, .2, 0, .84, -.08, 0xd5b990); box(g, .22, .07, .22, 0, .96, -.09, 0x24201b);
  if (role === 'lord') { box(g, .16, .3, .16, 0, 1.12, -.09, 0x24201b); box(g, .36, .035, .12, .1, .36, .24, 0xd5c597); }
  if (role === 'elder') box(g, .2, .08, .08, 0, .72, .02, 0xa8a39b);
  return g;
}
// 設営時だけ形をまとめる。購入部品に替えても部品の名前と足もとの原点は変えない。
export function batchInterior(root) {
  root.updateMatrixWorld(true);
  const groups = new Map(), out = new THREE.Group();
  root.traverse((m) => {
    if (!m.isMesh) return;
    const geo = m.geometry.clone().applyMatrix4(m.matrixWorld);
    if (!groups.has(m.material)) groups.set(m.material, []);
    groups.get(m.material).push(geo);
  });
  for (const [material, list] of groups) {
    const geo = mergeGeometries(list); list.forEach((g) => g.dispose());
    const mesh = new THREE.Mesh(geo, material); out.add(mesh);
  }
  return out;
}
// 寺の破れる襖にも同じ部品を使う。部品内の材質ごとに一つの群れにして描く。
export function panelInstances(kind, count, w = .9, h = 1.8) {
  // 比叡山は戸口ごとの実寸で組む。戸全体を伸ばして框・引き手まで太らせない。
  // 同じ種類と寸法は保存済みの形・材質を共有する。
  const key = kind + ':' + w + ':' + h + ':' + (cgtOn() && cgtHas('slide_door_a'));
  if (!panels.has(key)) panels.set(key, batchInterior(kind === 'fusuma' ? fusuma(w, h) : kind === 'fusumaPlain' ? fusuma(w, h, false, true) : kind === 'fusumaE' ? fusuma(w, h, true) : kind === 'itado' ? itado(w, h) : kind === 'koshi' || kind === 'koshiHiei' ? koshi(w, h, kind === 'koshiHiei') : shoji(w, h, kind === 'shojiHiei')));
  return panels.get(key).children.map((m) => { const copy = new THREE.InstancedMesh(m.geometry, m.material, Math.max(1, count)); cacheUsers.push(new WeakRef(copy)); return copy; });
}
function place(g, part, x, z, rot = 0, y = 0) { part.position.set(x, y, z); part.rotation.y = rot; g.add(part); return part; }

let glowShape, glowMat;
function lightPool() {
  if (!glowMat) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const g = cv.getContext('2d'), light = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    light.addColorStop(0, 'rgba(255,190,83,.5)'); light.addColorStop(1, 'rgba(255,190,83,0)');
    g.fillStyle = light; g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
    glowShape = new THREE.PlaneGeometry(3, 3);
    glowMat = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false });
  }
  const m = new THREE.Mesh(glowShape, glowMat); m.rotation.x = -Math.PI / 2; return m;
}
function shadeNight(group) {
  for (const m of group.children) {
    if (m.material.transparent || m.material.color.getHex() === 0xffd08b) continue;
    const key = 'night:' + m.material.uuid;
    if (!materials.has(key)) { const v = m.material.clone(); v.color.multiplyScalar(.55); materials.set(key, v); }
    m.material = materials.get(key);
  }
}
// 本能寺の既存の壁・廊下・燃え方に、共通部品の道具と灯明を重ねる。座標は既存の間取りのまま。
export function furnishTemple(rt, H, y) {
  const key = H.id + ':' + (cgtOn() && cgtHas('tatami_floor_modular_a'));
  if (!templeDecor.has(key)) {
    const g = new THREE.Group(), cx = (H.x0 + H.x1) / 2, cz = (H.z0 + H.z1) / 2;
    const put = (part, x, z, rot = 0, yy = .08) => place(g, part, x - cx, z - cz, rot, yy);
    const putLamp = (x, z) => {
      const lamp = tomyo(), bottom = new THREE.Box3().setFromObject(lamp).min.y;
      put(lamp, x, z, 0, .14 - bottom); put(lightPool(), x, z, 0, .15);
    };
    const KT = cgtOn() && cgtHas('Floor_Tatami') && !cgtHas('tatami_floor_modular_a'), kbT = KT ? new KitBatch() : null;
    for (const [a, b, c, d, kind] of H.floors) if (kind === 'tatami' && KT) {
      box(g, c - a, .04, d - b, (a + c) / 2 - cx, .06, (b + d) / 2 - cz, 0xffffff, 'tatami');
      const nx = Math.max(1, Math.round((c - a) / 2)), nz = Math.max(1, Math.round((d - b) / 2)), cw = (c - a) / nx, cd = (d - b) / nz;
      for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
        const x = a + (i + .5) * cw, z = b + (j + .5) * cd;
        if (!fitInteriorPart(kbT, (i + j) % 2 ? 'Floor_Tatami_X' : 'Floor_Tatami', x - cx, .08, z - cz, cw - .008, .06, cd - .008))
          put(tatami(cw - .008, cd - .008), x, z, 0, .08);
      }
    } else if (kind === 'tatami') {
      box(g, c - a, .04, d - b, (a + c) / 2 - cx, .06, (b + d) / 2 - cz, 0xffffff, 'tatami');
      // 京間（六尺三寸×三尺一寸五分）を半畳ずらしに敷く
      for (const [tx, tz, w, depth] of tatamiTiles(a, c, b, d, .955, 1.91)) put(tatami(w - .008, depth - .008), tx, tz, 0, .08);
    }
    if (H.id === 'goten') {
      put(tokonoma(3), -72.5, 91.9, Math.PI / 2); put(byobu(6), -69.7, 94);
      for (const [x, z] of [[-66.2, 93.6], [-51, 84.5]]) putLamp(x, z);
    } else if (H.id === 'hondo') {
      for (const z of [43, 49]) putLamp(-58.6, z);
    } else { putLamp(-34, 67.2); }
    if (kbT && kbT.n) g.add(kbT.build({ basic: true, tint: 0.8, shadow: false, camBlock: false }));
    templeDecor.set(key, batchInterior(g));
  }
  const g = templeDecor.get(key).clone(); cacheUsers.push(new WeakRef(g)); g.position.set((H.x0 + H.x1) / 2, y, (H.z0 + H.z1) / 2); rt.scene.add(g); return g;
}

// 購入部品を指定した箱に収める。原点や元の寸法に頼らず、当たりと見た目をそろえる。
export function fitInteriorPart(batch, name, x, y, z, w, h, d, rot = 0) {
  if (!batch || !cgtOn()) return false;
  const b = cgtBox(name);
  if (!b || b.h.some(v => !Number.isFinite(v) || v < .00001)) return false;
  const faces = cgtParts(name).reduce((n, p) => n + (p.geo.index ? p.geo.index.count : p.geo.attributes.position.count) / 3, 0);
  if (!cgtSpend(faces)) return false;
  const sx = w / (2 * b.h[0]), sy = h / (2 * b.h[1]), sz = d / (2 * b.h[2]);
  const dx = b.c[0] * sx, dz = b.c[2] * sz, c = Math.cos(rot), sn = Math.sin(rot);
  return batch.add(name, x - dx * c - dz * sn, y + h / 2 - b.c[1] * sy, z + dx * sn - dz * c, rot, sx, sy, sz);
}

// 比叡山の室内戸は柱・固定建具より手前の二本の溝を滑る。
export const HIEI_DOOR_TRACK = .16;
// 僧坊の座敷は畳と敷居を同じ上面へ納める。動く戸もこの高さで受ける。
export const HIEI_SOBO_SILL = .06;

// 比叡山の建具は太い框を溝へ落とさず、細い実を敷居・鴨居へ差す推定の納まり。
// 下は深さ八ミリ、上は四ミリの既存の溝へ余裕を残して納める。
// 固定側と動く戸で同じ箱・材質を使い、戸の行程や通行の当たりは変えない。
function hieiDoorTongues(g, w, h, color) {
  const length = Math.max(.01, w - .08);
  box(g, length, .007, .007, 0, -.0035, 0, color);
  box(g, length, .003, .007, 0, h + .0015, 0, color);
  // 框の四隅も突き合わせだけで終えず、縦框の枘を上下の框へ差して
  // 込栓で留める推定の納まり。栓は戸厚を貫き、両面へ二ミリだけ出す。
  // 襖・障子・格子戸で共用し、既存の箱と材質のまとめ描きへ含める。
  for (const x of [-(w / 2 - .02), w / 2 - .02]) for (const y of [.02, h - .02]) {
    box(g, .018, .04, .018, x, y, 0, color);
    box(g, .012, .012, .064, x, y, 0, 0x95704a);
  }
}

// 座敷と内陣の敷居も正面戸と同じく、黒線ではなく深さ八ミリの二本溝にする。
// 上面の高さと戸の行程は保ち、形・材質は既存の箱とまとめ描きを使う。
function hieiGroovedSill(g, length, height, depth, z = 0) {
  const bottom = height - .008, edge = depth / 2;
  // 外周の木枠と同じ縮尺で木目を通す。溝底の暗色は木肌に替えない。
  hieiRitualTimber(g, length, bottom, depth, 0, bottom / 2, z, 0x795b3b);
  for (const [a, b] of [[-edge, -.0445], [-.0355, .0355], [.0445, edge]]) {
    hieiRitualTimber(g, length, .008, b - a, 0, height - .004, z + (a + b) / 2, 0x795b3b);
  }
  for (const track of [-.04, .04]) {
    box(g, length, .001, .009, 0, bottom + .0005, z + track, 0x241a12);
  }
}
// 鴨居も下面へ溝を掘る。黒い線を下へ貼るだけでは戸の上の突起を木へ埋めてしまう。
// 敷居と同じ共通部品を裏返し、固定側・引き込み先とも八ミリの深さで受ける。
function hieiGroovedKamoi(g, length, y, depth, z = 0) {
  const rail = new THREE.Group();
  hieiGroovedSill(rail, length, .1, depth);
  rail.rotation.x = Math.PI;
  rail.position.set(0, y + .1, z);
  g.add(rail);
}
// 二本溝の召し合わせ。固定の脇戸と動く戸で同じ重なりを使う。
export const HIEI_LEAF_OVERLAP = .02;
// 正面戸は外壁・内側の柱を避けて、室内側の敷居を滑る。
export const HIEI_ENTRY_TRACK = .36;

// 低い小堂も天井まで格子を伸ばさず、鴨居・欄間・小壁を納める余地を残す。
// 動く戸・固定建具・当たりで同じ内法高を使う。焼失前の寸法は推定。
export function hieiPartitionHeight(kind, h) {
  if (kind === 'sobo') return Math.min(2, h - .5);
  if (kind === 'chudo' || kind === 'hondo') return Math.min(2.3, h - .3);
  return h > 3 ? 2.3 : h;
}

// 僧坊の長押は天井梁の下面より下へ納める。外周・間仕切り・釘隠しで共有する。
export function hieiNageshiHeight(kind, h) {
  const ph = hieiPartitionHeight(kind, h);
  return Math.min(h - (kind === 'sobo' ? .24 : .12), ph + .42);
}

// 型の道具と床。材質・形を共有し、建物ごとに一度まとめる。
export function furnishLayout(layout, h = 2.7, { partitions = true, dim = false } = {}) {
  // 今の山岳戦と前の比叡山で調度を共有。出入り案内が使う型の名前は変えない。
  const hiei = layout.profile === 'hiei' || layout.profile === 'hieizan';
  const hieiSobo = layout.profile === 'hieizan' && layout.kind === 'sobo';
  const hieiKuri = layout.profile === 'hieizan' && layout.kind === 'kuri';
  const hieiTatami = hieiSobo || hieiKuri;
  const templeAltar = hiei || layout.profile === 'echizen_ikko' || layout.profile === 'iwamura_hondo' || layout.profile === 'takato' && layout.kind === 'hondo';
  const japanese = !!layout.profile && cgtOn() && cgtHas('naibu_tatami_floor_modular_a');
  const purchased = cgtOn() && cgtHas('Floor_Tatami') && !cgtHas('tatami_floor_modular_a');
  const key = JSON.stringify([layout, h, partitions, dim, purchased, japanese, cgtOn() && cgtHas('tatami_floor_modular_a')]);
  if (layoutDecor.has(key)) { const copy = layoutDecor.get(key).clone(); cacheUsers.push(new WeakRef(copy)); return copy; }
  const g = new THREE.Group(), kb = purchased || japanese ? new KitBatch() : null;
  for (const p of layout.props) {
    const part = new THREE.Group();
    // 神宮寺の堂は家庭用の仏壇へ替えず、下の須弥壇・本尊・灯明を使う。
    const kit = p.part === 'stove' && !hieiKuri ? bought('furnace_complete', p.w, p.h, p.d) : p.part === 'storage' && !hieiTatami ? bought('drawer_a', p.w, p.h, p.d) : p.part === 'altar' && !templeAltar ? bought('butsudan', p.w, p.h, p.d) : null;
    if (kit) part.add(kit);
    else if (p.part === 'alcove') {
      if (japanese && addNaibu(kb, 'wall_scroll', p.x, (p.y || 0) + .8, p.z - .35 * Math.cos(p.rot || 0), .55, 1.25, .04, p.rot || 0)) {
        box(part, 2.3, .18, .85, 0, .09, 0, 0x604831);
        box(part, 2.3, 2.5, .08, 0, 1.25, -.43, 0xcfc3a2);
      } else part.add(tokonoma(2.3));
    } else if (p.part === 'chest') {
      const w = p.w ?? .85, h = p.h ?? .7, d = p.d ?? .7;
      if (japanese && addNaibu(kb, 'drawer_a', p.x, p.y || 0, p.z, w, h, d, p.rot || 0)) continue;
      box(part, w, h, d, 0, h / 2, 0, 0x503923);
      for (const yy of [.23, .48]) box(part, w - .06, .02, .03, 0, yy, d / 2, 0x252321);
    } else if (p.part === 'hearth') {
      if (japanese && addNaibu(kb, 'furnace', p.x, 0, p.z, p.w, .18, p.d)) {
        addNaibu(kb, 'kettle_low', p.x, .18, p.z, .35, .25, .35);
      } else {
        box(part, p.w, .12, p.d, 0, .06, 0, 0x493022);
        box(part, p.w - .18, .025, p.d - .18, 0, .13, 0, 0x211b17);
        box(part, .35, .25, .35, 0, .3, 0, 0x292723);
      }
      place(part, lightPool(), 0, 0, 0, .2);
    } else if (p.part === 'ammo' && layout.profile === 'yagura' && japanese && addNaibu(kb, 'drawer_a', p.x, p.y || 0, p.z, p.w ?? .85, p.h ?? .55, p.d ?? .7)) {
      // 矢の束と弾の箱。棚の上の矢は軽い共通の形。
      for (let q = 0; q < 5; q++) box(part, .018, .02, (p.d ?? .7) - .05, (q - 2) * .07, (p.h ?? .55) + .04, 0, 0x9b8057);
    } // 武具の間の弾薬を米俵に置き換えず、下の箱と矢の束を使う。
    else if (p.part === 'tomyo' && hieiTatami) {
      part.add(tomyo(true));
      place(part, lightPool(), 0, 0, 0, .09);
    } else if (p.part === 'bedding') {
      box(part, p.w, .06, p.d, 0, .03, 0, 0x958669);
      box(part, p.w * .8, .12, .22, 0, .09, -p.d / 2 + .15, 0x6a5e48);
    } else if (p.part === 'kyozukue' && layout.profile === 'hieizan') {
      // 礼盤から本尊に向かって使う経机。天板・幕板・四脚と経巻を分ける。
      // 共通の箱と巻軸を使い、経巻まで間取りの当たりの高さに収める。
      const top = p.h - .07, leg = .045;
      // 経机の天板も四周の框と板に分け、経巻の下に厚い一塊を置かない。
      // 板割は推定。上面・外寸・経巻の高さは保ち、目地の奥は薄板で閉じる。
      const rim = .035, innerW = p.w - rim * 2, innerD = p.d - rim * 2;
      for (const x of [-(p.w - rim) / 2, (p.w - rim) / 2]) box(part,
        rim, .035, p.d, x, top - .0175, 0, 0x302015);
      for (const z of [-(p.d - rim) / 2, (p.d - rim) / 2]) box(part,
        innerW, .035, rim, 0, top - .0175, z, 0x302015);
      box(part, innerW, .008, innerD, 0, top - .031, 0, 0x302015);
      for (let i = 0; i < 3; i++) box(part, innerW, .027, innerD / 3 - .002,
        0, top - .0135, -innerD / 2 + (i + .5) * innerD / 3,
        i === 1 ? 0x493023 : 0x302015);
      const footX = p.w / 2 - .07, footZ = p.d / 2 - .06;
      // 幕板を脚の芯まで貫通させず、脚の内面へ納める。
      // 同じ面の重なりを除き、内陣側からも四脚と幕板の継ぎ目を見せる。
      for (const x of [-footX, footX]) {
        for (const z of [-footZ, footZ]) box(part, leg, top - .035, leg, x, (top - .035) / 2, z, 0x302015);
        box(part, leg, .08, footZ * 2 - leg, x, top - .075, 0, 0x493023);
      }
      for (const z of [-footZ, footZ]) box(part, footX * 2 - leg, .08, leg, 0, top - .075, z, 0x493023);
      // 経机の四脚を足元の貫で結び、天板直下の幕板だけで支えない。
      // 個別の仕口は推定。脚の内面で止め、礼盤側の膝を入れる所は空ける。
      // 共通の箱と材質でまとめ、経巻までを含む外寸・当たりは保つ。
      const tieY = Math.min(.075, (top - .035) / 3), tieH = .035;
      for (const x of [-footX, footX]) box(part, leg, tieH, footZ * 2 - leg,
        x, tieY, 0, 0x493023);
      // 本尊側だけ左右をつなぎ、手前は脚を差し入れられる開いた形にする。
      box(part, footX * 2 - leg, tieH, leg, 0, tieY, -footZ, 0x493023);
      // 根本中堂の経机は幕板・貫を脚へ枘差しし、両方向の枘を高さ違いで納める。
      // 細かな仕口は推定。栓の木口だけ脚の外面へ出し、礼盤側の膝の空間を保つ。
      // 共通の箱と材質で設営時にまとめ、調度の外寸・当たりは変えない。
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const x = sx * footX, z = sz * footZ;
        for (const [y, depth] of [[top - .06, .018], [tieY, .012]]) {
          // 奥行き方向は四脚へ差す。低い左右の貫は本尊側の二脚だけ。
          box(part, depth, .014, leg - .006, x, y, z, 0x493023);
          box(part, .008, .012, .012, x + sx * (leg / 2 + .004),
            y, z - sz * .012, 0x795b3b);
          if (y !== tieY || sz < 0) {
            const crossY = y === tieY ? y + .008 : y - .025;
            box(part, leg - .006, .012, depth, x, crossY, z, 0x493023);
            box(part, .012, .012, .008, x - sx * .012,
              crossY, z + sz * (leg / 2 + .004), 0x795b3b);
          }
        }
      }
      // 紙に文字を描かず、既存の僧坊の経巻と同じ形・材質を使う。
      box(part, p.w - .2, .006, p.d - .14, 0, top + .003, 0, 0xcac1a5);
      for (const x of [-(p.w - .2) / 2, (p.w - .2) / 2]) hieiScroll(part, p.d - .1, .022, x, top + .027, 0, Math.PI / 2);
    } else if (p.part === 'raiban' && layout.profile === 'hieizan') {
      // 礼盤は脚・框・板座・敷物を分ける。全体を間取りの当たり寸法に収める。
      // 形と材質は共通の箱を使い、調度の保存済みの形も使い回す。
      const seat = p.h - .05, leg = .065;
      for (const x of [-p.w / 2 + .09, p.w / 2 - .09]) {
        for (const z of [-p.d / 2 + .09, p.d / 2 - .09]) hieiRitualTimber(part, leg, seat - .04, leg, x, (seat - .04) / 2, z, 0x302015);
      }
      // 四脚の足元を貫で結び、板座だけで脚を支える作りにしない。
      // 細かな仕口は推定。貫は脚の内面で止め、交差面を重ねない。
      // 共通の箱・材質でまとめ、礼盤の外寸と脇口の通路は保つ。
      const footX = p.w / 2 - .09, footZ = p.d / 2 - .09;
      // 貫を脚へ突き合わせるだけにせず、枘を差して込栓で留める推定の納まり。
      // 二方向の枘は上下へ分け、脚の中で交差させない。
      for (const z of [-footZ, footZ]) hieiRitualTimber(part, footX * 2 - leg, .045, .035,
        0, .063, z, 0x493023);
      for (const x of [-footX, footX]) hieiRitualTimber(part, .035, .045, footZ * 2 - leg,
        x, .047, 0, 0x493023);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const x = sx * footX, z = sz * footZ;
        hieiRitualTimber(part, leg * .8, .012, .018, x - sx * leg * .1, .063, z, 0x493023);
        hieiRitualTimber(part, .018, .012, leg * .8, x, .047, z - sz * leg * .1, 0x493023);
        // 栓の木口だけ脚面へ出し、板座・敷物・既存の当たりの内側へ納める。
        hieiRitualTimber(part, .012, .012, leg + .002, x - sx * .01, .063, z, 0x95704a);
        hieiRitualTimber(part, leg + .002, .012, .012, x, .047, z - sz * .01, 0x95704a);
      }
      // 前後の幕板は左右の幕板の内面で止め、隅の下面を二重にしない。
      for (const z of [-p.d / 2 + .07, p.d / 2 - .07]) hieiRitualTimber(part, p.w - .195, .08, .055, 0, seat - .07, z, 0x493023);
      for (const x of [-p.w / 2 + .07, p.w / 2 - .07]) hieiRitualTimber(part, .055, .08, p.d - .08, x, seat - .07, 0, 0x493023);
      // 板座を一枚の塊にせず、四周の框へ三枚の板を納める。
      // 焼失前の細かな板割は推定。上面・敷物・外寸は既存のままにし、
      // 共通の箱と材質でまとめる。敷物の脇と裏から板の納まりが見える。
      const rim = .055, innerW = p.w - rim * 2, innerD = p.d - rim * 2;
      for (const x of [-(p.w - rim) / 2, (p.w - rim) / 2]) hieiRitualTimber(part,
        rim, .04, p.d, x, seat - .02, 0, 0x302015);
      for (const z of [-(p.d - rim) / 2, (p.d - rim) / 2]) hieiRitualTimber(part,
        innerW, .04, rim, 0, seat - .02, z, 0x302015);
      // 板の目地の奥は薄い下地で閉じ、座の裏へ光を通さない。
      hieiRitualTimber(part, innerW, .008, innerD, 0, seat - .036, 0, 0x302015);
      for (let i = 0; i < 3; i++) hieiRitualTimber(part, innerW / 3 - .002, .032, innerD,
        -innerW / 2 + (i + .5) * innerW / 3, seat - .016, 0, i === 1 ? 0x59412b : 0x493023);
      // 礼盤も座敷と同じ畳床・薄い畳表・布縁で組み、小口へ織り目を伸ばさない。
      // 共通部品は寸法に合わせた織り目の形を保存する。意匠は推定。
      // 厚みだけ五センチへ合わせ、座の高さ・外寸・調度の当たりは保つ。
      const matW = p.w - .12, matD = p.d - .12;
      // 共通の畳は奥行き方向の二辺へ縁を付ける。
      // 横長の礼盤へそのまま置くと短辺に縁が付き、畳表の向きも座敷と食い違う。
      // 長辺を奥行きとして組んでから回し、板座に収まる外寸と厚みを保つ。
      const across = matW > matD;
      const cushion = tatami(across ? matD : matW, across ? matW : matD, true);
      cushion.scale.y = .05 / .06;
      place(part, cushion, 0, 0, across ? Math.PI / 2 : 0, seat);
    } else if (p.part === 'offering') {
      if (layout.profile === 'hieizan') {
        // 前卓は四脚と幕板で天板を受ける。供物・香炉・線香まで当たりの高さへ納める。
        // 焼失前の荘厳は推定。脇口の通路と既存の調度の当たりは広げない。
        const top = p.h - .28, leg = .045, inset = .08;
        // 前卓の天板も一枚の箱で済ませず、四周の框へ三枚の板を納める。
        // 板割と仕口は推定。側框を通し、前後の框・鏡板はその内面で止める。
        // 天端と外寸は保ち、供物・香炉の足元や内陣の通路を変えない。
        const rim = .035, innerW = p.w - rim * 2, innerD = p.d - rim * 2;
        for (const x of [-(p.w - rim) / 2, (p.w - rim) / 2]) hieiRitualTimber(part,
          rim, .045, p.d, x, top - .0225, 0, 0x302015);
        for (const z of [-(p.d - rim) / 2, (p.d - rim) / 2]) hieiRitualTimber(part,
          innerW, .045, rim, 0, top - .0225, z, 0x302015);
        // 目地の奥を薄い下地で閉じ、板の下面は既存の幕板で受ける。
        // 共通の箱・材質を設営時にまとめ、毎コマの形や光源は増やさない。
        hieiRitualTimber(part, innerW, .01, innerD, 0, top - .04, 0, 0x302015);
        for (let i = 0; i < 3; i++) hieiRitualTimber(part,
          innerW, .035, innerD / 3 - .002,
          0, top - .0175, -innerD / 2 + (i + .5) * innerD / 3,
          i === 1 ? 0x3a281b : 0x302015);
        const footX = p.w / 2 - inset, footZ = p.d / 2 - inset;
        for (const x of [-footX, footX]) {
          for (const z of [-p.d / 2 + inset, p.d / 2 - inset]) hieiRitualTimber(part, leg, top - .045, leg, x, (top - .045) / 2, z, 0x302015);
          hieiRitualTimber(part, leg, .09, footZ * 2 - leg, x, top - .09, 0, 0x302015);
        }
        for (const z of [-footZ, footZ]) hieiRitualTimber(part, footX * 2 - leg, .09, leg, 0, top - .09, z, 0x302015);
        // 前卓の脚元も貫で結び、上の幕板だけで四脚を支える形にしない。
        // 焼失前の仕口は推定。貫と幕板は脚の内面で止め、木口を突き出さない。
        // 既存の外寸・通路・当たりへ収め、共有の箱と材質でまとめ描きする。
        const tieH = .03, tieY = .055;
        for (const x of [-footX, footX]) hieiRitualTimber(part, leg, tieH, footZ * 2 - leg,
          x, tieY, 0, 0x302015);
        for (const z of [-footZ, footZ]) hieiRitualTimber(part, footX * 2 - leg, tieH, leg,
          0, tieY, z, 0x302015);
        // 前卓の幕板・足元の貫は脚へ枘差しし、込栓で抜けを留める推定の納まり。
        // 二方向の枘は高さをずらし、脚の中で互いを貫かないようにする。
        // 栓の木口だけ脚面へ出す。卓の外寸内で既存の箱・材質とまとめ描きを使う。
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
          const x = sx * footX, z = sz * footZ;
          for (const [y, offset] of [[top - .09, .02], [tieY, .0075]]) {
            // 左右の横材と前後の横材を、それぞれ脚の内側から差し込む。
            hieiRitualTimber(part, leg * .75, .012, .014,
              x - sx * leg * .125, y + offset, z, 0x302015);
            hieiRitualTimber(part, .014, .012, leg * .75,
              x, y - offset, z - sz * leg * .125, 0x302015);
            hieiRitualTimber(part, .012, .012, .008,
              x - sx * .006, y + offset, z + sz * (leg / 2 + .004), 0x795b3b);
            hieiRitualTimber(part, .008, .012, .012,
              x + sx * (leg / 2 + .004), y - offset, z - sz * .006, 0x795b3b);
          }
        }
        // 前卓の三具足は中央に香炉、向かって左に花瓶、右に燭台を置く推定の設え。
        // 供物皿だけで済ませず、すべて既存の卓の幅・当たりの高さへ収める。
        // 丸みの形と箱・材質を使い回し、設営時のまとめ描きに含める。
        for (const [x, z] of [[-.065, -.045], [.065, -.045], [0, .065]]) box(part, .035, .055, .035, x, top + .0275, z, 0x584b30);
        hieiIncenseBowl(part, .23, .13, .2, 0, top + .04, 0, 0x79613b, 0xa49b85);
        // 線香の下端を灰へ差し込み、器を開いた後も宙に浮かせない。
        for (const x of [-.035, .035]) box(part, .009, .12, .009, x, top + .215, 0, 0x493526);
        const vaseX = -p.w * .32, candleX = p.w * .32;
        altarOval(part, .12, .025, .12, vaseX, top + .0125, 0, 0x584b30);
        // 花瓶の口を丸い塊で塞がず、胴・首・口縁から内壁と底へ折り返す。
        // 枝は口の内側へ差す。個別の荘厳は推定とし、元の外寸と当たりを保つ。
        // 全堂で一つの回転体を共有し、既存の室内のまとめ描きへ含める。
        if (!shapes.has('hieiOfferingVase')) shapes.set('hieiOfferingVase', new THREE.LatheGeometry([
          new THREE.Vector2(0, .025), new THREE.Vector2(.045, .025),
          new THREE.Vector2(.065, .055), new THREE.Vector2(.07, .08),
          new THREE.Vector2(.055, .12), new THREE.Vector2(.0325, .135),
          new THREE.Vector2(.0325, .1725), new THREE.Vector2(.04, .1725),
          new THREE.Vector2(.04, .1875), new THREE.Vector2(.025, .1875),
          new THREE.Vector2(.0225, .145), new THREE.Vector2(.045, .115),
          new THREE.Vector2(.057, .08), new THREE.Vector2(.04, .04),
          new THREE.Vector2(0, .04),
        ], 12));
        const vase = new THREE.Mesh(shapes.get('hieiOfferingVase'), mat(0x79613b));
        cacheUsers.push(new WeakRef(vase)); vase.position.set(vaseX, top, 0); part.add(vase);
        // 常緑の枝を低く挿す。焼失前の個別の花材や荘厳は断定しない。
        for (const side of [-1, 1]) {
          box(part, .008, .10, .008, vaseX + side * .014, top + .21, 0, 0x584b30);
          altarOval(part, .055, .025, .03, vaseX + side * .03, top + .245, 0, 0x566044);
        }
        altarOval(part, .15, .03, .15, candleX, top + .015, 0, 0x584b30);
        altarOval(part, .035, .14, .035, candleX, top + .1, 0, 0x79613b);
        altarOval(part, .1, .018, .1, candleX, top + .179, 0, 0xa48b4a);
        box(part, .025, .065, .025, candleX, top + .2205, 0, 0xd8c9a2);
        // 蝋の上端から灯芯を出し、その先を火へ納める。既存の箱を共有する。
        box(part, .004, .012, .004, candleX, top + .256, 0, 0x493526);
        // 油皿と同じ火の材質を使う。別の木色として扱うと、暗さの処理と
        // この戦の材質変換で炎まで暗くなる。光源・描画の束は増やさない。
        altarOval(part, .014, .022, .014, candleX, top + .264, 0xffd08b);
      } else {
        box(part, p.w, .08, p.d, 0, p.h - .04, 0, 0x785b3c);
        for (const x of [-.4, .4]) box(part, .07, p.h, .07, x, p.h / 2, 0, 0x59412b);
        box(part, .18, .18, .18, 0, p.h + .09, 0, 0xd8d0bd);
      }
    }
    else if (p.part === 'desk') {
      if (hieiSobo) {
        // 板・脚・桟の長手へ木目を通す。堂内と同じ絵と寸法別の形を共有する。
        // 僧坊の文机は厚い一個の箱ではなく、三枚の天板を左右の吸付き桟で受ける。
        // 板の合わせ目の奥を下地で閉じ、巻紙の下へ光を通さない。細かな仕口は推定。
        // 天板の上面・脚の位置・外寸は共通の文机と揃え、畳と通路の当たりを保つ。
        hieiRitualTimber(part, 1.2, .012, .7, 0, .386, 0, 0x493022);
        for (let i = 0; i < 3; i++) hieiRitualTimber(part, 1.2, .068, .7 / 3 - .002,
          0, .426, -.35 + (i + .5) * .7 / 3, i === 1 ? 0x59412b : 0x493022);
        for (const x of [-.48, .48]) {
          // 桟の下面を脚の上端へ合わせ、天板を脚へめり込ませない。
          hieiRitualTimber(part, .09, .035, .6, x, .3625, 0, 0x493022);
          // 畳へ細い四脚を直接載せず、左右に畳ずりを通して脚を受ける推定の作り。
          // 脚の下端は畳ずりの上面で止め、天板の高さと調度の外寸は保つ。
          // 共通の箱と木材を既存のまとめ描きへ含め、当たりと更新処理は増やさない。
          const runnerH = .025;
          hieiRitualTimber(part, .09, runnerH, .6, x, runnerH / 2, 0, 0x493022);
          for (const z of [-.24, .24]) {
            hieiRitualTimber(part, .07, .345 - runnerH, .07,
              x, (runnerH + .345) / 2, z, 0x493022);
            // 脚を畳ずりへ載せるだけにせず、短い枘を差して横栓で留める。
            // 個別の文机の復元ではなく推定の仕口。枘は底へ抜かず、
            // 栓の木口だけ左右へ出し、畳に触れる下面と既存の外寸を保つ。
            // 共通の箱と材質を使い、固定調度のまとめ描きに含める。
            hieiRitualTimber(part, .03, .018, .03, x, runnerH - .009, z, 0x493022);
            hieiRitualTimber(part, .098, .008, .008, x, .016, z, 0x795b3b);
          }
        }
        // 僧坊の文机は四本脚だけで終えず、天板の下の幕板と左右の足固めで組む。
        // 焼失前の個別の仕口は推定。正面の膝を入れる所を空け、
        // 既存の脚の内面で材を止める。机の寸法・畳上の位置・通路は保つ。
        // 前後の幕板も脚の上端で止め、吸付き桟の下面へ納める。
        // 高さ九センチの幕板は桟へ三・五センチ食い込み、接合面が重なっていた。
        // 左右と同じ高さに揃え、脚の内面間の長さと机の外寸は保つ。
        for (const z of [-.24, .24]) hieiRitualTimber(part, .89, .055, .045, 0, .3175, z, 0x493022);
        for (const x of [-.48, .48]) {
          hieiRitualTimber(part, .045, .055, .41, x, .3175, 0, 0x493022);
          hieiRitualTimber(part, .045, .05, .41, x, .085, 0, 0x493022);
          // 幕板も脚へ突き合わせただけにせず、枘差しと込栓で四脚を固める。
          // 前後と左右の枘は高さを違え、脚の中で互いを貫かない推定の納まり。
          // 栓の木口だけ外面へ出し、天板・畳ずり・既存の当たりの内側へ収める。
          for (const side of [-1, 1]) {
            const z = side * .24;
            hieiRitualTimber(part, .04, .018, .02, x - Math.sign(x) * .02, .329, z, 0x493022);
            hieiRitualTimber(part, .02, .018, .04, x, .306, z - side * .02, 0x493022);
            hieiRitualTimber(part, .012, .012, .008,
              x - Math.sign(x) * .02, .329, z + side * .035, 0x795b3b);
            hieiRitualTimber(part, .008, .012, .012,
              x + Math.sign(x) * .035, .306, z - side * .02, 0x795b3b);
          }
          // 足固めを脚へ突き付けたままにせず、短い枘で差し、込栓で留める。
          // 個別の文机の復元ではなく推定の納まり。枘は脚の中で止め、
          // 栓の木口だけ外面へ出す。机の外寸・畳・建具の通路は保つ。
          // 既存の箱と材質を使い、室内を作る時のまとめ描きへ含める。
          for (const side of [-1, 1]) {
            hieiRitualTimber(part, .025, .025, .04, x, .085, side * .22, 0x493022);
            for (const face of [-1, 1]) hieiRitualTimber(part, .008, .014, .014,
              x + face * .035, .085, side * .225, 0x795b3b);
          }
        }
        // 既存の机の上だけに、開いた巻紙・巻軸・硯と筆を収める。
        // 机と一緒に縮尺を合わせ、襖の前や座敷の通路へ張り出させない。
        box(part, .56, .004, .35, -.16, .462, 0, 0xd8cfb7);
        // 広げた経巻を白紙で終えず、右から左へ並ぶ縦の墨跡を付ける。
        // 特定の経典本文の復元とはせず、筆の濃淡と行間だけを表す。
        // 巻軸・紙端の内側へ収め、机と一緒に既存の束へまとめる。
        for (let column = 0; column < 7; column++) {
          const x = .045 - column * .065;
          for (let row = 0; row < 8; row++) {
            const z = -.13 + row * .035;
            const width = .012 + (column + row * 3) % 3 * .004;
            box(part, width, .0006, .015, x, .4643, z, 0x39362d);
            // 同じ四角の繰り返しを避け、短い払いを紙面へ添える。
            if ((column + row) % 2 === 0) box(part, .006, .0006, .008,
              x + width / 2, .4643, z + .009, 0x575045);
          }
        }
        for (const x of [-.43, .11]) hieiScroll(part, .39, .026, x, .486, 0, Math.PI / 2);
        // 硯の墨を石の上へ浮かせず、縁より低い墨池へ納める。
        // 墨堂と墨池を底・四周の縁で囲む推定の作り。元の外寸・高さを保ち、
        // 文机と同じ箱・材質のまとめ描きへ含める。
        box(part, .17, .009, .25, .36, .4645, -.02, 0x38332b);
        for (const x of [.29, .43]) box(part, .03, .016, .25,
          x, .477, -.02, 0x38332b);
        box(part, .11, .016, .025, .36, .477, -.1325, 0x38332b);
        box(part, .11, .016, .065, .36, .477, .0725, 0x38332b);
        box(part, .11, .012, .07, .36, .475, .005, 0x38332b);
        box(part, .11, .003, .09, .36, .4705, -.075, 0x171917);
        // 筆先を天板へ伏せず、二山の筆架の谷で軸を受ける推定の設え。
        // 軸の下面と谷の上面を揃え、硯・巻紙・机の外寸には重ねない。
        box(part, .07, .008, .035, .24, .464, -.07, 0x38332b);
        for (const x of [.218, .262]) box(part, .014, .014, .035,
          x, .475, -.07, 0x38332b);
        // 筆を角棒で済ませず、丸い軸・穂首・先細りの穂へ分ける。
        // 筆架の谷へ軸の下面を合わせ、穂先も紙・天板から離す。
        // 全僧坊で形と材質を共有し、室内の既存のまとめ描きに含める。
        const brushPiece = (key, r0, r1, length, z, color) => {
          if (!shapes.has(key)) shapes.set(key,
            new THREE.CylinderGeometry(r1, r0, length, 8).rotateX(Math.PI / 2));
          const mesh = new THREE.Mesh(shapes.get(key), mat(color));
          cacheUsers.push(new WeakRef(mesh));
          mesh.position.set(.24, .474, z); part.add(mesh);
        };
        brushPiece('hieiBrushShaft', .006, .006, .26, .01, 0x795b3b);
        brushPiece('hieiBrushNeck', .006, .007, .012, .146, 0x493526);
        brushPiece('hieiBrushTip', .007, .0008, .033, .1685, 0x30281e);
        // 墨堂へ磨り墨を寝かせる。墨池を塞がず、硯の縁より内へ納める。
        box(part, .035, .009, .05, .36, .4895, .0725, 0x171917);
        // 墨を磨るための水滴を硯の脇へ置く。個別の遺品の復元ではなく推定。
        // 胴から給水口の内壁と底へ折り返し、口を塊で塞がない。
        // 全僧坊で形・材質を共有し、机の既存の高さ以内でまとめ描きする。
        if (!shapes.has('hieiWritingWater')) shapes.set('hieiWritingWater', new THREE.LatheGeometry([
          new THREE.Vector2(0, 0), new THREE.Vector2(.025, 0),
          new THREE.Vector2(.035, .012), new THREE.Vector2(.034, .028),
          new THREE.Vector2(.012, .04), new THREE.Vector2(.012, .048),
          new THREE.Vector2(.006, .048), new THREE.Vector2(.006, .038),
          new THREE.Vector2(.027, .025), new THREE.Vector2(.027, .013),
          new THREE.Vector2(.02, .006), new THREE.Vector2(0, .006),
        ], 12));
        if (!shapes.has('hieiWritingSpout')) shapes.set('hieiWritingSpout', new THREE.LatheGeometry([
          new THREE.Vector2(.009, 0), new THREE.Vector2(.007, .025),
          new THREE.Vector2(.004, .025), new THREE.Vector2(.005, 0),
        ], 8));
        const water = new THREE.Mesh(shapes.get('hieiWritingWater'), mat(0x584b30));
        cacheUsers.push(new WeakRef(water)); water.position.set(.49, .46, -.2); part.add(water);
        const spout = new THREE.Mesh(shapes.get('hieiWritingSpout'), mat(0x584b30));
        cacheUsers.push(new WeakRef(spout)); spout.rotation.x = Math.PI / 3;
        spout.position.set(.49, .478, -.175); part.add(spout);
      } else part.add(tsukue());
    } else if (p.part === 'storage' && hieiKuri) {
      // 庫裏は経巻棚や汎用の箪笥にせず、食器を置く素木の二段棚にする。
      // 個別の復元ではなく推定。畳上の既存の外寸内へ脚・棚板・椀を納める。
      const t = .035, foot = .08, innerW = p.w - t * 2;
      for (const x of [-(p.w - t) / 2, (p.w - t) / 2]) {
        for (const z of [-(p.d - t) / 2, (p.d - t) / 2]) {
          box(part, t, p.h, t, x, p.h / 2, z, 0x59412b);
        }
        box(part, t, p.h - foot, p.d - t * 2, x, (p.h + foot) / 2, 0, 0x795b3b);
      }
      box(part, innerW, p.h - foot, t, 0, (p.h + foot) / 2, -(p.d - t) / 2, 0x634832);
      for (const top of [foot + t, p.h / 2, p.h]) {
        box(part, innerW, t, p.d - t, 0, top - t / 2, t / 2, 0x795b3b);
        for (const x of [-(innerW - t) / 2, (innerW - t) / 2]) {
          box(part, t, t, p.d - t * 2, x, top - t * 1.5, 0, 0x59412b);
        }
      }
      if (!shapes.has('hieiKitchenBowl')) shapes.set('hieiKitchenBowl', new THREE.LatheGeometry([
        new THREE.Vector2(0, 0), new THREE.Vector2(.045, 0),
        new THREE.Vector2(.09, .065), new THREE.Vector2(.085, .075),
        new THREE.Vector2(.074, .062), new THREE.Vector2(.035, .015), new THREE.Vector2(0, .015),
      ], 12));
      for (const y of [foot + t, p.h / 2]) for (const x of [-innerW / 4, innerW / 4]) {
        const bowl = new THREE.Mesh(shapes.get('hieiKitchenBowl'), mat(0x49291b));
        cacheUsers.push(new WeakRef(bowl)); bowl.position.set(x, y, .02); part.add(bowl);
      }
    } else if (p.part === 'storage' && hieiSobo) {
      // 棚の板・框・脚も共通の木目を長手へ通し、塗りつぶした板にしない。
      // 汎用の箪笥ではなく、経巻を横に納める二段の棚。既存の当たりの内寸を使う。
      // 棚板と背板を側板の内面で受ける。全幅の板を重ねると、
      // 側面と天端の同じ面がちらつき、木口が側板を貫いて見える。
      // 背板の手前で棚板を止め、四隅を同じ厚みの板で組む。細かな仕口は推定。
      const t = .035, innerW = p.w - t * 2, footH = .08;
      // 底板は八センチ上げ、細い四脚の荷重を左右の畳ずりで受ける推定の棚にする。
      // 外寸と天板高は保ち、下段の経巻・背板・仕切りも同じ底板へ載せる。
      for (const x of [-p.w / 2 + t / 2, p.w / 2 - t / 2]) {
        // 側も厚い一枚板で済ませず、前後の框を脚まで通し、上下の桟で結ぶ。
        // 鏡板は框の内側へ引いて納める。個別の棚の復元ではなく推定の木組み。
        // 外寸・棚受け・経巻の位置は保ち、共通の箱と材質で一度だけまとめる。
        const stile = .05, rail = .045;
        const panelD = p.d - stile * 2, panelH = p.h - footH - rail * 2;
        // 畳へ細い木口を直接押し付けず、前後の脚を一材の畳ずりへ載せる。
        // 脚の下面を畳ずりの上面で止め、同じ面を重ねない。
        // 共通の箱・材質を設営時にまとめ、棚の当たりと通路の幅は保つ。
        const runnerH = .025;
        hieiRitualTimber(part, t, runnerH, p.d, x, runnerH / 2, 0, 0x59412b);
        for (const z of [-p.d / 2 + t, p.d / 2 - t]) {
          hieiRitualTimber(part, t, footH - runnerH, t * 2,
            x, (footH + runnerH) / 2, z, 0x59412b);
        }
        for (const z of [-(p.d - stile) / 2, (p.d - stile) / 2]) {
          hieiRitualTimber(part, t, p.h - footH, stile, x, (p.h + footH) / 2, z, 0x59412b);
        }
        for (const y of [footH + rail / 2, p.h - rail / 2]) {
          hieiRitualTimber(part, t, rail, panelD, x, y, 0, 0x59412b);
          // 側桟を縦框へ枘差しし、外側から込栓で留める推定の納まり。
          // 枘は框内で止め、鏡板の溝を避けて桟の芯へ置く。
          // 栓の木口だけ框面から一ミリ出し、共通の箱・材質でまとめ描きする。
          const tenonD = stile * .6, tenonT = t * .4;
          for (const end of [-1, 1]) {
            const jointZ = end * (panelD / 2 + tenonD / 2);
            hieiRitualTimber(part, tenonT, rail * .45, tenonD,
              x, y, jointZ, 0x59412b);
            hieiRitualTimber(part, t + .002, .012, .012, x, y, jointZ, 0x95704a);
          }
        }
        // 鏡板は二枚に割り、細い目地の奥も薄い下地で閉じる。
        const backing = .006, face = .012, side = Math.sign(x);
        hieiRitualTimber(part, backing, panelH, panelD,
          x + side * (backing - t) / 2, (p.h + footH) / 2, 0, 0x3a2a1c);
        for (let q = 0; q < 2; q++) hieiRitualTimber(part, face, panelH, panelD / 2 - .002,
          x + side * (backing + face / 2 - t / 2), (p.h + footH) / 2,
          (q - .5) * panelD / 2, q ? 0x634832 : 0x59412b);
      }
      // 背を一枚の厚い塊にせず、上下の框へ縦板を納める。
      // 焼失前の板割は推定。目地の奥は薄い下地で閉じ、棚受け桟の位置は保つ。
      // 既存の背板の厚み・棚の当たりの内側だけを使い、描画は同じ束へまとめる。
      const backZ = -p.d / 2, rim = .035, panelH = p.h - footH - rim * 2;
      hieiRitualTimber(part, innerW, panelH, .008, 0, (p.h + footH) / 2, backZ + .004, 0x3a2a1c);
      for (const y of [footH + rim / 2, p.h - rim / 2]) hieiRitualTimber(part,
        innerW, rim, t, 0, y, backZ + t / 2, 0x59412b);
      const boards = Math.max(2, Math.ceil(innerW / .18)), pitch = innerW / boards;
      for (let i = 0; i < boards; i++) hieiRitualTimber(part,
        pitch - .002, panelH, t - .008,
        -innerW / 2 + (i + .5) * pitch, (p.h + footH) / 2, backZ + (t + .008) / 2,
        i % 2 ? 0x59412b : 0x634832);
      // 長い棚板を両端だけで受けず、中央の仕切りで二間に分ける推定の納まり。
      // 天地の板の内側に仕切りを立て、中段はその側面で止める。
      // 棚も経巻も既存の当たりの内側へ収め、共通の形・材質でまとめる。
      for (const y of [footH + t / 2, p.h - t / 2]) hieiRitualTimber(part, innerW, t, p.d - t, 0, y, t / 2, 0x795b3b);
      hieiRitualTimber(part, t, p.h - footH - t * 2, p.d - t, 0, (p.h + footH) / 2, t / 2, 0x59412b);
      const bayW = (innerW - t) / 2, bayX = (innerW + t) / 4;
      for (const x of [-bayX, bayX]) {
        hieiRitualTimber(part, bayW, t, p.d - t, x, p.h / 2, t / 2, 0x795b3b);
        // 底板も脚へ横から触れるだけにせず、脚を結ぶ下桟で下面を受ける。
        // 中棚・天板と同じく両脇と背へ桟を通し、底板の荷重を脚へ渡す。
        // 焼失前の仕口は推定。桟は棚板の下面・棚の内側に納め、経巻と通路を空ける。
        // 共通の箱・材質を使い、棚と同じ設営時のまとめ描きに含める。
        const cleatW = .018, cleatH = .025;
        for (const underside of [footH, p.h / 2 - t / 2, p.h - t]) {
          const cy = underside - cleatH / 2;
          for (const side of [-1, 1]) hieiRitualTimber(part, cleatW, cleatH, p.d - t,
            x + side * (bayW - cleatW) / 2, cy, t / 2, 0x59412b);
          hieiRitualTimber(part, bayW - cleatW * 2, cleatH, cleatW,
            x, cy, -p.d / 2 + t + cleatW / 2, 0x59412b);
          // 外側の棚受けは側板へ添えるだけにせず、前後の縦框へ枘差しする。
          // 細部は推定。中仕切り側は従来の受けを使い、外寸と棚板高を保つ。
          // 枘は框の内部で止め、込栓の木口だけ側面へ出す。設営時にまとめる。
          const side = Math.sign(x), stileX = side * (p.w - t) / 2;
          const cleatX = x + side * (bayW - cleatW) / 2;
          const tenonW = Math.abs(stileX - cleatX) + t * .3;
          for (const end of [-1, 1]) {
            const jointZ = end * (p.d / 2 - .025);
            hieiRitualTimber(part, tenonW, cleatH * .5, .025,
              cleatX + side * tenonW / 2, cy, jointZ, 0x59412b);
            hieiRitualTimber(part, .008, .01, .01,
              side * (p.w / 2 - .003), cy, jointZ, 0x95704a);
          }
        }
        // 巻物が手前へ転がらないよう、棚板の上に低いこぼれ止めを納める。
        for (const bottom of [footH + t, p.h / 2 + t / 2]) {
          hieiRitualTimber(part, bayW, .025, .02, x, bottom + .0125, p.d / 2 - .01, 0x59412b);
        }
      }
      const radius = Math.min(.045, p.h * .08);
      for (const y of [footH + t + radius, p.h / 2 + t / 2 + radius]) for (const x of [-bayX, bayX]) {
        hieiScroll(part, bayW - t, radius, x, y, 0);
      }
    }
    else if (p.part === 'stove' && hieiKuri) {
      // 土間の竈は黒い四角を貼った炉で済ませず、焚口を奥へ抜き、丸い釜を据える。
      // 細部は推定。共通の箱と丸い形を使い、既存の外寸へ最後に縮尺を合わせる。
      box(part, .85, .08, .7, 0, .04, 0, 0x75634b);
      box(part, .85, .35, .18, 0, .255, -.26, 0x75634b);
      for (const x of [-.30, .30]) box(part, .25, .35, .52, x, .255, .09, 0x75634b);
      box(part, .85, .19, .7, 0, .525, 0, 0x75634b);
      box(part, .35, .35, .012, 0, .255, -.164, 0x221c17);
      box(part, .35, .008, .52, 0, .084, .09, 0x302820);
      for (const x of [-.085, .085]) box(part, .045, .04, .30, x, .108, .12, 0x34281d);
      if (!shapes.has('hieiKettle')) shapes.set('hieiKettle', new THREE.LatheGeometry([
        new THREE.Vector2(0, 0), new THREE.Vector2(.12, 0),
        new THREE.Vector2(.22, .10), new THREE.Vector2(.23, .25),
        new THREE.Vector2(.22, .26), new THREE.Vector2(.205, .245),
        new THREE.Vector2(.19, .12), new THREE.Vector2(.105, .02), new THREE.Vector2(0, .02),
      ], 16));
      const kettle = new THREE.Mesh(shapes.get('hieiKettle'), mat(0x292723));
      cacheUsers.push(new WeakRef(kettle)); kettle.position.y = .56; part.add(kettle);
      if (!shapes.has('hieiKettleRim')) shapes.set('hieiKettleRim',
        new THREE.TorusGeometry(.23, .012, 4, 16).rotateX(Math.PI / 2));
      const rim = new THREE.Mesh(shapes.get('hieiKettleRim'), mat(0x292723));
      cacheUsers.push(new WeakRef(rim)); rim.position.y = .81; part.add(rim);
      for (const x of [-.145, 0, .145]) box(part, .14, .025, x ? .32 : .45,
        x, .8375, 0, 0x795b3b);
      box(part, .035, .05, .30, 0, .875, 0, 0x59412b);
    }
    else if (p.part === 'stove') {
      box(part, .85, .65, .7, 0, .325, 0, 0x75634b);
      box(part, .3, .25, .025, 0, .22, .36, 0x221c17);
      box(part, .42, .18, .42, 0, .72, 0, 0x292723);
    } else if (p.part === 'altar') {
      // 須弥壇：下框・黒漆の腰（金の格狭間）・上框の三段に、蓮台の本尊と光背。前に小さな前卓と香炉
      if (layout.profile === 'hieizan') {
        // 下框を一つの角箱にせず、地覆から腰の框へ段を絞って受ける。
        // 焼失前の繰形の細部は推定。元の幅・奥行き・高さの内側へ納め、
        // 本尊の高さと内陣の通路を保つ。共通の箱・漆の材質でまとめ描きする。
        let bottom = 0;
        for (const [w, depth, height] of [[2.1, 1, .04], [2.02, .94, .03],
          [1.94, .88, .03], [1.85, .82, .04]]) {
          box(part, w, height, depth, 0, bottom + height / 2, 0, 0x24170f);
          bottom += height;
        }
      } else box(part, 2.1, .14, 1, 0, .07, 0, 0x24170f);
      if (layout.profile === 'hieizan') {
        // 腰の芯を一塊にせず、上下の框・四隅の束・奥へ引いた鏡板で組む。
        // 格狭間の奥にも段差を残し、脇口から見ても側板が框へ納まる形にする。
        // 焼失前の仕口は推定。元の腰の外寸内で共通の箱・材質を使い、設営時だけまとめる。
        for (const y of [.1675, .4125]) box(part, 1.85, .055, .82,
          0, y, 0, 0x24170f);
        for (const x of [-.8875, .8875]) for (const z of [-.3725, .3725]) {
          box(part, .075, .19, .075, x, .29, z, 0x24170f);
        }
        for (const z of [-.36, .36]) {
          box(part, 1.7, .19, .025, 0, .29, z, 0x2a1a12);
          for (const x of [-.275, .275]) box(part, .035, .19, .035,
            x, .29, z + Math.sign(z) * .03, 0x24170f);
        }
        // 側面も一枚板で塞がず、中束の両脇へ鏡板を落とし込む。
        // 焼失前の板割は推定。上下の框と隅の束の内寸を使い、
        // 外の格狭間・壇の当たり・脇口の幅は保つ。
        for (const side of [-1, 1]) {
          box(part, .075, .19, .035, side * .8875, .29, 0, 0x24170f);
          for (const z of [-.17625, .17625]) box(part, .025, .19, .3175,
            side * .8625, .29, z, 0x2a1a12);
        }
      } else box(part, 1.85, .3, .82, 0, .29, 0, 0x2a1a12);
      if (layout.profile === 'hieizan') hieiAltarWaist(part);
      else for (const x of [-.55, 0, .55]) box(part, .4, .18, .01, x, .29, .415, 0x8a6c30);
      if (layout.profile === 'hieizan') {
        // 上框も下框に合わせて段を付け、腰から張り出す天板を受ける。
        // 焼失前の繰形は推定。幅・奥行き・上面高は従来の内側に収める。
        // 四周の框へ三枚の板を納め、共通の箱と材質で設営時にまとめる。
        box(part, 1.94, .03, .88, 0, .455, 0, 0x24170f);
        box(part, 2.02, .03, .94, 0, .485, 0, 0x2a1a12);
        const rim = .08, width = 2.1 - rim * 2, depth = 1 - rim * 2;
        for (const x of [-(2.1 - rim) / 2, (2.1 - rim) / 2]) box(part,
          rim, .04, 1, x, .52, 0, 0x24170f);
        for (const z of [-(1 - rim) / 2, (1 - rim) / 2]) box(part,
          width, .04, rim, 0, .52, z, 0x24170f);
        // 板の目地は薄い下地で閉じ、腰の中を透かさない。
        box(part, width, .012, depth, 0, .506, 0, 0x24170f);
        for (let i = 0; i < 3; i++) box(part, width, .028, depth / 3 - .002,
          0, .526, -depth / 2 + (i + .5) * depth / 3, i === 1 ? 0x2a1a12 : 0x24170f);
      } else box(part, 2.1, .1, 1, 0, .49, 0, 0x24170f);
      if (layout.profile === 'hieizan') {
        // 蓮台の受けを一つの角箱にせず、上下の框と引いた腰で支える。
        // 焼失前の繰形は推定。元の幅・奥行き・上面高へ収め、
        // 蓮弁と本尊の位置、須弥壇の当たりは保つ。共有の箱と材質だけを使う。
        for (const y of [.5525, .6275]) box(part, .6, .025, .5,
          0, y, -.1, 0x6e5424);
        // 腰板を框の内側へ引き、隅の束の内面で止める。
        // 板同士を隅で重ねず、側面からも段差が見える納まりにする。
        for (const x of [-.25, .25]) for (const z of [-.3, .1]) {
          box(part, .04, .05, .04, x, .59, z, 0x8a6c30);
        }
        for (const z of [-.29, .09]) box(part, .46, .05, .02,
          0, .59, z, 0x6e5424);
        for (const x of [-.24, .24]) box(part, .02, .05, .36,
          x, .59, -.1, 0x6e5424);
      } else box(part, .6, .1, .5, 0, .59, -.1, 0x6e5424);
      if (layout.profile === 'hieizan') {
        // 本尊の背後は通常の白壁で終えず、光背を受ける来迎壁を設ける。
        // 焼失前の細部は推定。柱・地覆・頭貫で板壁を囲み、須弥壇の
        // 当たりの幅・奥行き・天蓋までの高さへ収める。共通の箱と材質を使う。
        const bottom = .54, top = 2.14, back = -.455;
        // 一枚板へ線を重ねず、枠の内寸に六枚の縦板を納める。
        // 目地の奥は薄い下地で閉じ、背後の白壁や外光を透かさない。
        // 板の表裏とも元の厚みへ収め、既存の形・材質のまとめ描きを使う。
        const width = 1.72, height = top - bottom - .16, pitch = width / 6;
        box(part, width, height, .012, 0, (bottom + top) / 2, back - .014, 0x3a2417);
        for (let i = 0; i < 6; i++) box(part, pitch - .003, height, .024,
          -width / 2 + (i + .5) * pitch, (bottom + top) / 2, back + .008, 0x634832);
        for (const x of [-.9, .9]) box(part, .08, top - bottom, .08, x, (bottom + top) / 2, back, 0x3a2417);
        // 横木の本体は柱の内面で止め、細い枘を柱へ差して込栓で留める。
        // 焼失前の仕口は推定。板壁を上下の横木へ突き合わせるだけにせず、
        // 四隅の接合を見せる。須弥壇の外寸内で共通の箱・材質をまとめ描きする。
        for (const y of [bottom + .04, top - .04]) {
          box(part, width, .08, .08, 0, y, back, 0x3a2417);
          for (const x of [-.9, .9]) {
            box(part, .08, .035, .03, x, y, back, 0x3a2417);
            // 栓は枘を前後に貫き、木口だけを柱面へわずかに出す。
            // 壁板の目地・天蓋・本尊には重ねず、背後の通路も狭めない。
            box(part, .018, .018, .088, x, y, back, 0x95704a);
          }
        }
        // 来迎壁の裏にも板押さえを渡し、縦板を上下の框だけで支えない。
        // 焼失前の細かな仕口は推定。横木を両側の柱へ差し、裏面の込栓で留める。
        // 須弥壇の奥行き一メートル以内へ納め、背後の通路と調度の当たりは広げない。
        // 共通の箱・材質を設営時のまとめ描きへ含め、毎コマの処理は増やさない。
        for (const y of [bottom + .48, top - .48]) {
          box(part, width, .07, .025, 0, y, back - .0325, 0x3a2417);
          for (const x of [-.9, .9]) {
            // 柱内の枘と、柱の裏へわずかに出る栓の木口。
            box(part, .08, .035, .025, x, y, back - .0075, 0x3a2417);
            box(part, .022, .022, .008, x, y, back - .041, 0x95704a);
          }
        }
      }
      if (layout.profile === 'hieizan' && layout.kind === 'chudo') {
        // 根本中堂を汎用の坐像にしない。焼失前の像を写したとされる立像を参考に、
        // 金色の体と朱衣、なだらかな肉髻・狭い額・Ｙ字の衣文を基本形で補う。
        // 参考：京都国立博物館「最澄と天台宗のすべて」鑑賞ガイド（2022）。
        // https://www.kyohaku.go.jp/jp/learn/assets/guides/2022_saicho_guide_ja.pdf
        // 細かな印相は復元と断定しない。天蓋・須弥壇・通路の寸法は共通のまま。
        altarOval(part, .82, 1.4, .04, 0, 1.28, -.36, 0x7a5e26);
        hieiLotus(part);
        for (const x of [-.075, .075]) altarOval(part, .13, .065, .21, x, .758, -.055, 0xa48b4a);
        altarOval(part, .35, .77, .25, 0, 1.15, -.1, 0x783b28);
        altarOval(part, .39, .35, .28, 0, 1.42, -.12, 0x783b28);
        altarOval(part, .09, .1, .09, 0, 1.59, -.1, 0xa48b4a);
        altarOval(part, .22, .27, .22, 0, 1.73, -.1, 0xa48b4a);
        hieiBuddhaFace(part, 1.73);
        altarOval(part, .15, .06, .15, 0, 1.861, -.12, 0x50452c);
        // 袖から前へ出す左手と、胸の高さへ挙げた右手。
        altarOval(part, .14, .33, .16, .2, 1.36, -.07, 0x783b28).rotation.z = .2;
        altarOval(part, .1, .09, .25, .2, 1.24, .015, 0x783b28);
        altarOval(part, .13, .055, .12, .2, 1.27, .16, 0xa48b4a);
        // 薬師の左掌を空にせず、掌の上へ蓋付きの薬壺を載せる。
        // 参考：福岡市美術館「薬師如来立像」（延暦寺の像に倣う像）。
        // https://www.fukuoka-art-museum.jp/collection_highlight/2649/
        // 焼失前の持物の細部は推定。掌に接する底・胴・口・蓋を共有形で組み、
        // 須弥壇の当たりと内陣の通路は広げない。設営時のまとめ描きに含める。
        altarOval(part, .07, .014, .065, .2, 1.3045, .16, 0x79613b);
        altarOval(part, .105, .075, .095, .2, 1.343, .16, 0x8a6c30);
        altarOval(part, .065, .018, .06, .2, 1.382, .16, 0x79613b);
        altarOval(part, .095, .022, .085, .2, 1.402, .16, 0xa48b4a);
        altarOval(part, .027, .025, .027, .2, 1.4255, .16, 0x8a6c30);
        altarOval(part, .14, .3, .16, -.2, 1.37, -.07, 0x783b28).rotation.z = -.2;
        altarOval(part, .09, .23, .1, -.23, 1.36, .07, 0x783b28);
        altarOval(part, .09, .16, .045, -.23, 1.53, .095, 0xa48b4a);
        // 浅い衣文を朱衣の表面に重ねる。すべて既存の丸い形・材質を使い回す。
        for (const side of [-1, 1]) {
          altarOval(part, .018, .34, .014, side * .06, 1.43, .023, 0x4d291d).rotation.z = -side * .35;
        }
        altarOval(part, .018, .39, .014, 0, 1.08, .026, 0x4d291d);
      } else if (layout.profile === 'hieizan') {
        // 焼失前の像の細部は断定せず、衣・膝・手のある本尊と舟形の光背を表す。
        // 天蓋までの高さと須弥壇の幅は変えず、内陣の左右の通路を保つ。
        altarOval(part, .82, 1.22, .04, 0, 1.2, -.36, 0x7a5e26);
        hieiLotus(part);
        altarOval(part, .57, .25, .38, 0, .82, -.08, 0xa48b4a);
        altarOval(part, .38, .53, .28, 0, 1.1, -.12, 0xa48b4a);
        altarOval(part, .22, .27, .22, 0, 1.48, -.1, 0xa48b4a);
        hieiBuddhaFace(part, 1.48);
        altarOval(part, .11, .1, .12, 0, 1.64, -.12, 0x50452c);
        for (const side of [-1, 1]) {
          altarOval(part, .13, .38, .15, side * .2, 1.08, -.06, 0x8a6c30).rotation.z = side * .25;
          altarOval(part, .15, .08, .14, side * .12, .94, .09, 0xa48b4a);
        }
      } else {
        box(part, .45, .7, .4, 0, .99, -.1, 0xa48b4a);
        box(part, .28, .28, .28, 0, 1.48, -.1, 0xa48b4a);
        box(part, .9, .9, .03, 0, 1.25, -.36, 0x7a5e26);
      }
      box(part, .5, .04, .22, 0, .54, .38, 0x2a1810);
      if (layout.profile === 'hieizan') {
        // 香炉を角箱で済ませず、三脚・丸い胴・口縁と灰に分ける。
        // 焼失前の個別の意匠は推定。既存の卓と須弥壇の範囲へ収める。
        // 丸い形と材質は共有し、設営時のまとめ描きだけへ加える。
        for (let i = 0; i < 3; i++) {
          const a = i * Math.PI * 2 / 3;
          altarOval(part, .025, .035, .025,
            Math.sin(a) * .045, .5775, .38 + Math.cos(a) * .045, 0x6a5a3a);
        }
        hieiIncenseBowl(part, .14, .075, .14, 0, .5805, .38, 0x6a5a3a, 0xb6ad96);
      } else box(part, .12, .1, .12, 0, .6, .38, 0x6a5a3a);
      const hangingLamp = layout.profile === 'hieizan' && layout.kind === 'chudo';
      // 吊り棒が天蓋を貫かないよう、灯籠を天蓋の左右へ納める。
      for (const side of [-1, 1]) place(part,
        hangingLamp ? hieiHangingLamp() : tomyo(layout.profile === 'hieizan'), side * (hangingLamp ? .9 : .75), 0, 0, .55);
      if (templeAltar) {
        // 古い堂の内陣の推定：家庭用仏壇ではなく、須弥壇の本尊を覆う天蓋と幡。
        // 須弥壇と同じ範囲に収め、左右の通路を空ける。形・材質は箱の共通部品を使う。
        const framedCanopy = layout.profile === 'hieizan';
        box(part, 1.55, framedCanopy ? .04 : .08, .72, 0, framedCanopy ? 2.20 : 2.18, -.08, 0x3a2417);
        if (framedCanopy) {
          // 天蓋の上も厚い一枚箱にせず、四周の框に板を落とし込む。
          // 上から見る時も板割を見せる。細部は推定とし、従来の外寸・上面高を保つ。
          // 下地で目地を閉じ、吊り棒の付く位置と下面の鏡板は変えない。
          // 共通の箱・材質でまとめ描きし、動く処理や当たりは増やさない。
          const rim = .07, width = 1.7 - rim * 2, depth = .82 - rim * 2;
          for (const x of [-(1.7 - rim) / 2, (1.7 - rim) / 2]) {
            box(part, rim, .06, .82, x, 2.24, -.08, 0x8a6c30);
          }
          for (const z of [-.08 - (.82 - rim) / 2, -.08 + (.82 - rim) / 2]) {
            box(part, width, .06, rim, 0, 2.24, z, 0x8a6c30);
          }
          box(part, width, .024, depth, 0, 2.222, -.08, 0x634832);
          for (let i = 0; i < 3; i++) box(part, width / 3 - .003, .036, depth,
            -width / 2 + (i + .5) * width / 3, 2.252, -.08,
            i === 1 ? 0x95704a : 0x8a6c30);
          // 吊り棒の下端も薄い鏡板だけへ差さず、鉄帯で左右の框を抱く。
          // 上の吊り受けと同じ四点で荷重を渡す推定の納まり。
          // 既存の箱・金具色でまとめ、壇の幅と脇の通路には張り出さない。
          for (const side of [-1, 1]) for (const z of [-.32, .16]) {
            box(part, .27, .008, .035, side * .715, 2.274, z, 0x34312b);
            box(part, .008, .068, .035, side * .854, 2.244, z, 0x34312b);
            box(part, .078, .008, .035, side * .815, 2.206, z, 0x34312b);
          }
        } else box(part, 1.7, .06, .82, 0, 2.24, -.08, 0x8a6c30);
        if (framedCanopy) {
          // 天蓋の下面を一枚の箱で終えず、框で鏡板を受ける納まりにする。
          // 焼失前の意匠は推定。既存の天蓋の幅・高さ・奥行きの中へ収め、
          // 本尊と吊り幡、内陣の通路には張り出さない。共通の箱と材質を使う。
          for (const z of [-.405, .245]) box(part, 1.55, .035, .07, 0, 2.1575, z, 0x8a6c30);
          for (const x of [-.74, .74]) box(part, .07, .035, .58, x, 2.1575, -.08, 0x8a6c30);
          // 鏡板を三間に分け、細い桟の奥へ引いて厚みを見せる。
          for (const x of [-.235, .235]) box(part, .025, .025, .58, x, 2.1525, -.08, 0x8a6c30);
          for (const x of [-.47, 0, .47]) box(part, .445, .008, .57, x, 2.176, -.08, 0x634832);
          // 四隅の留め金は天蓋の側面へ納める。
          for (const x of [-.75, .75]) for (const z of [-.425, .265]) {
            box(part, .12, .045, .025, x, 2.2025, z, 0x34312b);
          }
        }
        for (const x of [-.68, .68]) {
          if (framedCanopy) {
            // 比叡山の吊り幡は棒と一枚板を重ねず、天蓋・吊り材・横木から順に受ける。
            // 個別の意匠は推定。幡身の下に三条の脚を垂らし、元の下端と壇内へ納める。
            // 共通の箱と材質で設営時にまとめ、揺れの更新や新たな当たりは足さない。
            // 吊り材の上端を天蓋の鏡板下面へ接続する。従来は三・二センチ浮いていた。
            // 横木に接する下端は保ち、天蓋の内側だけへ伸ばす。
            const hangerBottom = 1.94, hangerTop = 2.176 - .008 / 2;
            box(part, .025, hangerTop - hangerBottom, .025,
              x, (hangerBottom + hangerTop) / 2, -.08, 0x8a6c30);
            box(part, .2, .03, .035, x, 1.925, -.08, 0x8a6c30);
            box(part, .12, .41, .025, x, 1.705, -.08, 0x95815a);
            // 横木の下面で布を受け、縁取りも幡身の両面へ納める。
            for (const side of [-1, 1]) {
              for (const edge of [-1, 1]) box(part, .009, .41, .003,
                x + edge * .0555, 1.705, -.08 + side * .014, 0x6e542c);
              box(part, .102, .018, .003, x, 1.509, -.08 + side * .014, 0x6e542c);
            }
            for (const offset of [-.043, 0, .043]) {
              const length = offset === 0 ? .14 : .11;
              box(part, .034, length, .025, x + offset, 1.5 - length / 2, -.08, 0x95815a);
            }
          } else {
            box(part, .035, .28, .035, x, 2.0, -.08, 0x8a6c30);
            box(part, .12, .54, .025, x, 1.63, -.08, 0x95815a);
          }
        }
      }
    } else {
      const w = p.w ?? (p.part === 'counter' ? 1.1 : .85), h = p.h ?? .55, d = p.d ?? .7;
      box(part, w, h, d, 0, h / 2, 0, 0x503923);
      for (const x of [-w * .35, w * .35]) box(part, .035, h, d + .03, x, h / 2, 0, 0x252321);
      if (p.part === 'stones') for (const x of [-.2, .2]) box(part, .22, .18, .25, x, h + .09, 0, 0x777267);
      if (p.part === 'ammo') for (let q = 0; q < 5; q++) box(part, .018, .02, d - .05, (q - 2) * .07, h + .04, 0, 0x9b8057);
    }
    // 小さな部屋でも調度の絵を、設営時に決めた当たりの寸法へ合わせる。
    if (!kit && p.part === 'desk') {
      // 比叡山の文机は天板だけでなく経巻の上端までを当たりの高さへ収める。
      // 巻紙・硯も机と一緒に縮め、畳上の脚元と建具脇の通路は保つ。
      const fullHeight = hieiSobo ? .486 + .026 : .46;
      part.scale.set(p.w / 1.2, p.h / fullHeight, p.d / .7);
    }
    if (!kit && p.part === 'stove') part.scale.set(p.w / .85, p.h / .9, p.d / .7);
    if (p.part === 'alcove') part.scale.set(p.w / 2.3, p.h / 2.5, p.d / .85);
    if (!kit && p.part === 'altar') part.scale.set(p.w / 2.1, p.h / (layout.profile === 'hieizan' ? 2.27 : 1.5), p.d / 1);
    place(g, part, p.x, p.z, p.rot || 0, p.y || 0);
    if (layout.profile === 'hieizan' && p.part === 'altar') {
      // 天蓋を四隅の吊り棒で受ける。堂は桁に掛けた吊り受け材の下面で止める。
      // 壇の上だけに収め、内陣の通路へ支柱を立てない。形・材質は共通の箱を使う。
      const bottom = (p.y || 0) + p.h - .015;
      const top = h - (layout.altarSuspensionDrop || 0);
      if (top > bottom) {
        const hangers = new THREE.Group();
        for (const x of [-.6, .6]) for (const z of [-.32, .16]) {
          box(hangers, .025, top - bottom, .025, x * p.w / 2.1, (bottom + top) / 2, z * p.d, 0x302b24);
        }
        place(g, hangers, p.x, p.z, p.rot || 0);
      }
      if (layout.kind === 'chudo') {
        // 天蓋の吊り受け材二本へ小梁を掛け、左右の灯籠も梁から吊るす。
        // 細い天井板へ吊り棒を直接付けない。堂の既存のまとめ描きに含める。
        const lampTop = (p.y || 0) + 1.845 * p.h / 2.27;
        const railTop = top, railBottom = railTop - .06;
        if (railBottom > lampTop) {
          const supports = new THREE.Group();
          for (const x of [-.9, .9]) {
            const lx = x * p.w / 2.1;
            box(supports, .08, .06, .58 * p.d, lx, railTop - .03, -.08 * p.d, 0x4a3020);
            box(supports, .018, railBottom - lampTop, .018,
              lx, (railBottom + lampTop) / 2, 0, 0x302b24);
            // 吊り棒を小梁の下面へ突き付けず、鉄帯を梁の上へ回して横栓で留める。
            // 焼失前の金具の細部は推定。天蓋の吊り元と同じ納まりとし、
            // 共通の箱・材質を設営時にまとめる。灯火と通路の当たりは増やさない。
            for (const side of [-1, 1]) {
              box(supports, .012, .12, .04, lx + side * .046,
                railTop - .054, 0, 0x302b24);
            }
            box(supports, .104, .012, .04, lx, railTop + .006, 0, 0x302b24);
            // 梁下の棒頭まで帯を下ろし、両面を貫く栓で吊り荷重を受ける。
            box(supports, .104, .012, .012, lx, railBottom - .03, 0, 0x302b24);
          }
          place(g, supports, p.x, p.z, p.rot || 0);
        }
      }
    }
  }
  const floorRooms = layout.floorPieces ? layout.rooms.flatMap(r => layout.floorPieces.map(v => ({ ...r, x0: Math.max(r.x0, v[0]), x1: Math.min(r.x1, v[1]), z0: Math.max(r.z0, v[2]), z1: Math.min(r.z1, v[3]) })).filter(r => r.x1 > r.x0 && r.z1 > r.z0)) : layout.rooms;
  // 畳寄せを敷居の下面へ重ねない。同じ上面の板が重なると溝の周りがちらつく。
  // 固定建具と動く戸の敷居を避け、残った床だけを共通の箱で張る。設営時だけ行う。
  const sillCuts = [];
  if (hieiSobo && partitions) {
    for (const v of layout.walls) {
      if (v.guideOnly || !v.paper || Math.abs(v.az - v.bz) > .01) continue;
      sillCuts.push([Math.min(v.ax, v.bx), Math.max(v.ax, v.bx), v.az - .07, v.az + .07]);
    }
    for (const p of layout.portals) {
      let l = -Infinity, r = Infinity;
      for (const v of layout.walls) {
        if (v.guideOnly || !v.paper || Math.abs(v.az - p.z) > .01 || Math.abs(v.bz - p.z) > .01) continue;
        const a = Math.min(v.ax, v.bx), b = Math.max(v.ax, v.bx);
        if (b <= p.x + .01 && b > l) l = b;
        if (a >= p.x - .01 && a < r) r = a;
      }
      if (isFinite(l) && isFinite(r)) sillCuts.push([
        (l + r) / 2 - (r - l), (l + r) / 2 + (r - l),
        p.z + HIEI_DOOR_TRACK - .09, p.z + HIEI_DOOR_TRACK + .09,
      ]);
    }
  }
  // 畳寄せと引き戸脇の板は同じ木部。長すぎる一枚板を分け、木目を実寸で貼る。
  // 寸法ごとの形と一つの材質を保存し、既存の床のまとめ描きへ含める。
  const floorTimber = (w, h, d, x, y, z) => {
    if (w <= .001 || d <= .001) return;
    const alongX = w >= d, length = alongX ? w : d;
    const count = Math.max(1, Math.ceil(length / 2.4)), pitch = length / count;
    for (let i = 0; i < count; i++) {
      const offset = -length / 2 + (i + .5) * pitch;
      const ww = alongX ? pitch : w, dd = alongX ? d : pitch;
      const m = box(g, ww, h, dd, x + (alongX ? offset : 0), y,
        z + (alongX ? 0 : offset), 0x795b3b, 'hieiFloorTimber');
      const key = `hieiFloorTimber:${ww}:${h}:${dd}`;
      if (!shapes.has(key)) {
        const geo = m.geometry.clone(), p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
        for (let j = 0; j < p.count; j++) {
          const end = Math.abs(alongX ? n.getX(j) : n.getZ(j)) > .5;
          const top = Math.abs(n.getY(j)) > .5;
          uv.setXY(j, (top || end ? (alongX ? p.getZ(j) : p.getX(j)) : p.getY(j)) / .45,
            (end ? p.getY(j) : alongX ? p.getX(j) : p.getZ(j)) / 2.4);
        }
        shapes.set(key, geo);
      }
      m.geometry = shapes.get(key);
      // 板を欠かずに薄い継ぎ目を載せ、下地が透ける床の穴を作らない。
      if (i) box(g, alongX ? .002 : w, .001, alongX ? d : .002,
        x + (alongX ? offset - pitch / 2 : 0), y + h / 2,
        z + (alongX ? 0 : offset - pitch / 2), 0x4a3020);
    }
  };
  const floorBorder = (r, z0, z1) => {
    let pieces = [[r.x0, r.x1, z0, z1]];
    for (const [cx0, cx1, cz0, cz1] of sillCuts) {
      const next = [];
      for (const [a, b, c, d] of pieces) {
        const left = Math.max(a, cx0), right = Math.min(b, cx1);
        const front = Math.max(c, cz0), back = Math.min(d, cz1);
        if (right <= left || back <= front) { next.push([a, b, c, d]); continue; }
        if (left > a) next.push([a, left, c, d]);
        if (right < b) next.push([right, b, c, d]);
        if (front > c) next.push([left, right, c, front]);
        if (back < d) next.push([left, right, back, d]);
      }
      pieces = next;
    }
    for (const [a, b, c, d] of pieces) {
      if (b - a < .001 || d - c < .001) continue;
      floorTimber(b - a, HIEI_SOBO_SILL, d - c,
        (a + b) / 2, (r.y || 0) + HIEI_SOBO_SILL / 2, (c + d) / 2);
    }
  };
  for (const floorRoom of floorRooms) {
    let r = floorRoom;
    if (r.floor === 'tatami') {
      if (hieiSobo && layout.portals.some(p => Math.abs(p.z - r.z1) < .01)) {
        // 奥側も敷居の幅を空け、畳と同じ高さの板で受ける。
        // 畳寄せを固定の襖の下框へ食い込ませず、部屋と通行の範囲は保つ。
        const strip = .12;
        floorBorder(r, r.z1 - strip, r.z1);
        r = { ...r, z1: r.z1 - strip };
      }
      if (hieiSobo && layout.portals.some(p => Math.abs(p.z - r.z0) < .01)) {
        // 引き戸は間仕切りの手前の二本溝を滑る。畳と畳寄せを
        // 引き込み先まで退け、障子・襖の下框が畳を横切らないようにする。
        // 部屋の範囲・当たり・天井は保ち、床の仕上げだけを板敷きへ替える。
        const strip = HIEI_DOOR_TRACK + .04 + .12;
        floorBorder(r, r.z0, r.z0 + strip);
        r = { ...r, z0: r.z0 + strip };
      }
      // 僧坊の室内柱は壁から十六センチの芯に厚さ十四センチで立つ。
      // 畳は芯で止めず、柱の内面（二十三センチ）まで畳寄せで受ける。
      // 背面も同じ柱寸法。間仕切り側は敷居を既に避けているので従来の幅を保つ。
      // 敷居を避けた座敷の内寸から割り付け、床高・部屋の当たりは保つ。
      // 庫裏の食事の間も柱の内面で畳を止め、土間との境を畳寄せで受ける。
      // 正面の板戸は壁から三十六センチ内を滑るため、その手前まで畳を退ける。
      // 戸の溝に木枠を重ねず、正面の壁際は下地の板敷きを残す。
      if (hieiKuri) r = { ...r, z1: r.z1 - HIEI_ENTRY_TRACK - .1 };
      const tatamiInset = hieiTatami ? .23 : .1;
      const backInset = hieiTatami && r.z0 === Math.min(...layout.rooms.map(room => room.z0)) ? .23 : .16;
      const frontInset = .16;
      if (hieiTatami) {
        const width = r.x1 - r.x0, depth = r.z1 - r.z0, yy = (r.y || 0) + .03;
        for (const [z, inset] of [[r.z0 + backInset / 2, backInset], [r.z1 - frontInset / 2, frontInset]]) floorTimber(width, .06, inset, (r.x0 + r.x1) / 2, yy, z);
        for (const x of [r.x0 + tatamiInset / 2, r.x1 - tatamiInset / 2]) floorTimber(tatamiInset, .06, depth - backInset - frontInset, x, yy, (r.z0 + backInset + r.z1 - frontInset) / 2);
      }
      const tiles = hieiTatami
        ? hieiTatamiTiles(r.x0 + tatamiInset, r.x1 - tatamiInset, r.z0 + backInset, r.z1 - frontInset)
        : tatamiTiles(r.x0 + .1, r.x1 - .1, r.z0 + .1, r.z1 - .1);
      // 僧坊の畳は二センチの板床を露出させず、細い合わせ目で敷き詰める。
      // 比叡山は高画質でも専用部品を使い、畳寄せ・敷居・戸の溝は越えない。
      const seam = hieiTatami ? .003 : .02;
      for (const [cx, cz, w, d, rot = 0] of tiles) {
        const x = cx - w / 2, z = cz - d / 2, floorY = r.y || 0;
        if (!hieiTatami && japanese && addNaibu(kb, 'tatami_floor_modular_a', cx, floorY, cz, w - seam, .06, d - seam, rot)) continue;
        if (purchased && !layout.profile) kb.add('Floor_Tatami', x, floorY + .035, z + d, 0, w / 2, .12, d / 2);
        else place(g, tatami(w - seam, d - seam, hieiTatami), cx, cz, rot, floorY);
      }
    } else if (r.floor === 'earth') box(g, r.x1 - r.x0, .025, r.z1 - r.z0, (r.x0 + r.x1) / 2, (r.y || 0) + .013, (r.z0 + r.z1) / 2, 0x655847);
  }
  // 天井の高い堂・広間は、戸の高さ（約2.3m）で鴨居を通し、上は小壁にする（六メートルの襖を立てない）
  const temple = ['hondo', 'chudo', 'temple'].includes(layout.kind);
  const hieiHall = layout.profile === 'hieizan' && ['hondo', 'chudo'].includes(layout.kind);
  // 比叡山の僧坊は竿縁天井まで戸を伸ばさず、二メートルの建具の上に鴨居・小壁を納める。
  const ph = layout.profile === 'hieizan' ? hieiPartitionHeight(layout.kind, h) : h > 3 ? 2.3 : h;
  // 比叡山は外周・柱列と同じ高さで長押を回す。低い僧坊でも天井との間を残す。
  const nageshiY = layout.profile === 'hieizan' ? hieiNageshiHeight(layout.kind, h) : ph + .42;
  const partitionNageshi = (top, len) => {
    if (!(hieiSobo || hieiHall)) {
      box(top, len, .12, .14, 0, nageshiY, 0, 0x2e2016);
      return;
    }
    // 僧坊と堂の内陣境は、柱を両側から抱く二枚の長押にする。
    // 欄間・小壁の厚みと柱幅の外へ出し、内陣・外陣にも同じ見付けを向ける。
    // 細部は推定。建具の上に収め、共通の箱・材質のまとめ描きを使う。
    for (const side of [-1, 1]) {
      // 上端の面取り材の下面で本体を止め、同じ面に異なる木色を重ねない。
      // 全高と柱を抱く位置は保ち、堂・僧坊の両面で木の段差を見せる。
      // 幅十二センチの柱面（前後六センチ）まで背を届かせる。
      // 従来は五ミリ離れており、両面の長押が柱から浮いていた。
      // 見付け面と金具の位置は保ち、背面だけを柱へ納める。
      hieiRitualTimber(top, len, .105, .05, 0, nageshiY - .0075, side * .085, 0x2e2016);
      // 上端の薄い面取りを別の木色で表し、壁に埋もれない厚みを見せる。
      hieiRitualTimber(top, len, .015, .04, 0, nageshiY + .0525, side * .08, 0x634832);
    }
  };
  // 僧坊の横梁は天井板の下面（二・二センチ下）から十四センチ下がる。
  // 柱と小壁はその梁下で止め、梁・回縁・天井板を貫かない。
  // naka.js の梁、b_hieizan.js の束と同じ高さへ納める。細かな仕口は推定。
  // 堂の内陣境は格天井の回縁下面（天井高から十一センチ下）で受ける。
  // 天井高まで伸ばすと柱と白い小壁が回縁を貫き、格間へ突き出していた。
  // 固定格子・脇戸の上とも同じ高さで止め、建具と通路の寸法は保つ。
  const partitionHead = hieiSobo || hieiKuri ? h - .022 - .14 : hieiHall ? h - .11 : h;
  const partitionTop = (top, len, postInset = 0) => {
    // 比叡山の固定建具の両端には幅十二センチの通し柱が立つ。
    // 欄間と小壁は柱の内面で止め、格子や塗り壁を柱へ食い込ませない。
    // 戸口上は両脇の柱が開口の外にあるため、従来の内寸を使う。
    len -= postInset * 2;
    if (len <= .001) return;
    const upperWall = (bottom) => {
      const height = partitionHead - bottom;
      if (height <= 0) return;
      if (!hieiHall || height < .8) {
        box(top, len, height, .06, 0, (bottom + partitionHead) / 2, 0, temple ? 0xbdb39a : 0xcfc6b0);
        return;
      }
      // 高い中堂の内陣境を白い一枚板にせず、束と横貫で塗り壁を受ける。
      // 焼失前の割付は推定。柱・長押・天井の内寸へ納め、壁は木部の面で切る。
      // 共通の箱・材質で設営時にまとめ、通路や毎コマの処理は変えない。
      const count = Math.max(1, Math.ceil(len / 1.5)), pitch = len / count;
      const mid = (bottom + partitionHead) / 2, rail = .08, stud = .06;
      hieiRitualTimber(top, len, rail, .08, 0, mid, 0, 0x634832);
      for (let i = 1; i < count; i++) {
        const x = -len / 2 + i * pitch;
        for (const [a, b] of [[bottom, mid - rail / 2], [mid + rail / 2, partitionHead]]) {
          hieiRitualTimber(top, stud, b - a, .08, x, (a + b) / 2, 0, 0x634832);
        }
      }
      for (let i = 0; i < count; i++) {
        const a = -len / 2 + i * pitch + (i > 0 ? stud / 2 : 0);
        const b = -len / 2 + (i + 1) * pitch - (i < count - 1 ? stud / 2 : 0);
        for (const [low, high] of [[bottom, mid - rail / 2], [mid + rail / 2, partitionHead]]) {
          box(top, b - a, high - low, .06, (a + b) / 2, (low + high) / 2, 0, 0xbdb39a);
        }
      }
    };
    const bottom = ph + .1, upper = nageshiY - .06;
    if (!(hieiSobo || hieiHall) || upper - bottom < (hieiSobo ? .09 : .15)) {
      upperWall(bottom);
      return;
    }
    // 僧坊の座敷境と堂の内陣境は、鴨居と長押の間を素木の欄間にする。
    // 焼失前の意匠は推定。堂は縦格子をやや細かくし、既存の柱・長押へ納める。
    // 襖・障子・格子戸の上で同じ納まりを使い、格子の背後に塗り壁を残さない。
    // 動く建具より上・柱筋の面に収め、共通の箱と材質でまとめ描きする。
    const height = upper - bottom, count = Math.max(1, Math.ceil(len / (hieiHall ? .14 : .18)));
    for (const cy of [bottom + .015, upper - .015]) hieiRitualTimber(top, len, .03, .05, 0, cy, 0, 0x795b3b);
    for (let i = 0; i <= count; i++) {
      hieiRitualTimber(top, .025, height - .06, .035, -len / 2 + .0125 + i * (len - .025) / count,
        (bottom + upper) / 2, 0, 0x634832);
    }
    const wallBottom = nageshiY + .06;
    upperWall(wallBottom);
  };
  if (partitions) for (const v of layout.walls) {
    if (v.guideOnly) continue;
    const len = Math.hypot(v.bx - v.ax, v.bz - v.az);
    if (hieiKuri && !v.paper && len > .24) {
      // 庫裏の板壁も柱で受け、天井板の下面から下がる梁下で止める。
      // 焼失前の細部は推定。両端の通路と既存の当たりの内側へ納める。
      const wall = new THREE.Group(), span = len - .24;
      for (const side of [-1, 1]) box(wall, .12, partitionHead, .12,
        side * (len / 2 - .06), partitionHead / 2, 0, 0x3a2a1c);
      for (const y of [.07, partitionHead - .05]) box(wall, span, .1, .1,
        0, y, 0, 0x4a3020);
      const count = Math.max(1, Math.ceil(span / .24)), pitch = span / count;
      const bottom = .12, top = partitionHead - .1;
      for (let q = 0; q < count; q++) box(wall, pitch - .002, top - bottom, .06,
        -span / 2 + (q + .5) * pitch, (bottom + top) / 2, 0,
        q % 2 ? 0x795b3b : 0x806044);
      place(g, wall, (v.ax + v.bx) / 2, (v.az + v.bz) / 2,
        Math.atan2(-(v.bz - v.az), v.bx - v.ax));
      continue;
    }
    // 堂・僧坊の脇戸は、下で立てる幅十二センチの端柱の内面へ納める。
    // 壁の全幅で割ると紙・格子・框が柱を貫く。召し合わせは残し、戸口は狭めない。
    const inset = v.paper && (hieiHall || hieiSobo) && Math.abs(v.az - v.bz) <= .01
      ? Math.min(.12, len / 2) : 0;
    const panelSpan = len - inset * 2, n = Math.ceil(panelSpan / .9);
    const rot = Math.atan2(-(v.bz - v.az), v.bx - v.ax);
    if (layout.profile === 'hieizan' && v.paper) {
      // 固定の建具も敷居と鴨居の二本溝で受ける。
      // 動く戸の持ち出した溝とは分け、壁の線に納める。
      const sill = new THREE.Group();
      const sillH = hieiSobo ? HIEI_SOBO_SILL : .04;
      hieiGroovedSill(sill, len, sillH, .14);
      place(g, sill, (v.ax + v.bx) / 2, (v.az + v.bz) / 2, rot);
    }
    if (v.paper && ph < h) {
      const top = new THREE.Group();
      if (layout.profile === 'hieizan') hieiGroovedKamoi(top, len, ph, .14);
      else box(top, len, .1, .12, 0, ph + .05, 0, 0x3a2a1c);
      partitionNageshi(top, len);
      partitionTop(top, len, inset);
      place(g, top, (v.ax + v.bx) / 2, (v.az + v.bz) / 2, rot);
    }
    for (let i = 0; i < n; i++) {
      const t = (inset + panelSpan * (i + .5) / n) / len;
      const x = v.ax + (v.bx - v.ax) * t, z = v.az + (v.bz - v.az) * t;
      // 比叡山の脇の建具も二本の溝へ交互に納める。
      // 全枚を壁の中心へ並べず、框が前後に重なる納まりにする。
      // 当たりの厚みの内側に収め、動く戸の手前の溝には出さない。
      const track = layout.profile === 'hieizan' && v.paper ? (i % 2 ? .04 : -.04) : 0;
      // 脇戸も召し合わせを重ね、二本溝の間から隣室が透ける隙間を塞ぐ。
      // 両端は柱の内側へ止め、戸口と引き込み先の幅を変えない。
      const overlap = v.paper && (hieiHall || hieiSobo) ? HIEI_LEAF_OVERLAP / 2 : 0;
      const before = i > 0 ? overlap : 0, after = i < n - 1 ? overlap : 0;
      const shift = (after - before) / 2, panelW = panelSpan / n + before + after;
      const panelX = x + Math.cos(rot) * shift + Math.sin(rot) * track;
      const panelZ = z - Math.sin(rot) * shift + Math.cos(rot) * track;
      if (v.paper && temple) {
        const sill = layout.profile === 'hieizan' ? .04 : 0;
        place(g, koshi(panelW, ph - sill, false, hieiHall), panelX, panelZ, rot, sill); continue;
      }
      // 比叡山の僧坊も、入口は障子、奥の座敷は襖。動く戸と脇の建具を揃える。
      if (v.paper && hiei && layout.kind === 'sobo') {
        // 動く戸と同じく、下框を敷居へ埋めず上面で受ける。
        const sill = hieiSobo ? HIEI_SOBO_SILL : 0;
        const plain = hieiSobo && v.kind !== 'shoji';
        // 襖の引き手を戸口へ向ける。障子は紙を同じ側へ張ったまま使う。
        const portal = hieiSobo && layout.portals.find(p => Math.abs(p.z - v.az) < .01);
        const reverse = plain && portal && x > portal.x;
        place(g, plain ? fusuma(panelW, ph - sill, false, true) : shoji(panelW, ph - sill, hieiSobo), panelX, panelZ, rot + (reverse ? Math.PI : 0), sill); continue;
      }
      if (v.paper && (layout.profile === 'echizen_ikko' && layout.kind === 'sobo' || layout.profile === 'takato' && layout.kind === 'goten')) {
        place(g, v.kind === 'shoji' ? shoji(len / n, ph) : fusuma(len / n, ph), x, z, rot); continue;
      }
      // 御殿・屋敷の間仕切りは絵のある襖（買った板の戸は古びて見えるので、町屋・寺の脇の間だけに使う）
      const painted = ['goten', 'yashiki', 'shisha'].includes(layout.kind);
      if (v.paper && !painted && japanese && addNaibu(kb, 'slide_door_a', x, 0, z, len / n, ph, .06, rot)) continue;
      if (v.paper) place(g, fusuma(len / n, ph, painted), x, z, rot);
      else {
        const wall = new THREE.Group(); box(wall, len / n, h, .08, 0, h / 2, 0, 0x795b3b);
        place(g, wall, x, z, rot);
      }
    }
  }
  // 比叡山の間仕切りの端を柱で受ける。戸口側は壁の内へ半分寄せ、開口幅を狭めない。
  if (partitions && layout.profile === 'hieizan') {
    const posts = new Set();
    for (const v of layout.walls) {
      if (v.guideOnly || !v.paper || Math.abs(v.az - v.bz) > .01) continue;
      const a = Math.min(v.ax, v.bx), b = Math.max(v.ax, v.bx);
      for (const x of [a + .06, b - .06]) {
        const key = x.toFixed(3) + ':' + v.az.toFixed(3);
        if (posts.has(key)) continue;
        posts.add(key);
        box(g, Math.min(.12, b - a), partitionHead, .12, x, partitionHead / 2, v.az, 0x3a2a1c);
        if (hieiHall && b - a >= .12) {
          // 内陣境の角柱も堂内の丸柱と同じく、床際を根巻で保護する。
          // 焼失前の金具の細部は推定。敷居の上から柱の四面へ薄板を回し、
          // 柱本体と面を重ねず、持ち出した引き戸の溝・既存の当たりの内側へ納める。
          for (const side of [-1, 1]) {
            box(g, .128, .2, .004, x, .14, v.az + side * .062, 0x34312b);
            box(g, .004, .2, .12, x + side * .062, .14, v.az, 0x34312b);
          }
        }
        if ((hieiHall || hieiSobo) && b - a >= .12) {
          // 内陣境・僧坊の座敷境も外周と同じく、長押を留める釘頭を両面の釘隠しで覆う。
          // 焼失前の細部は推定。建具より上に納め、共通の形・材質でまとめ描きする。
          if (!shapes.has('hieiPartitionNail')) shapes.set('hieiPartitionNail',
            new THREE.CylinderGeometry(.036, .036, .008, 8).rotateX(Math.PI / 2));
          for (const side of [-1, 1]) {
            const nail = new THREE.Mesh(shapes.get('hieiPartitionNail'), mat(0x34312b));
            nail.position.set(x, nageshiY, v.az + side * .114);
            g.add(nail);
          }
        }
        if ((hieiSobo || hieiHall) && b - a >= .12) {
          // 僧坊と内陣境の鴨居は通し柱へ枘差しし、両面の込栓で受ける納まりを補う。
          // 焼失前の仕口は推定。枘は柱の中に収め、外へ出すのは栓の木口だけ。
          // 上框より上・柱幅の内側に置き、障子・襖の引き込み先は広げない。
          for (const side of [-1, 1]) box(g, .025, .035, .008,
            x, ph + .05, v.az + side * .064, 0x95704a);
        }
      }
    }
  }
  // 戸口の上も鴨居と小壁でふさぐ（引き戸は naka_doors.js が戸口にはめる）
  if (partitions && ph < h) for (const p of layout.portals || []) {
    let l = -Infinity, r = Infinity;
    for (const v of layout.walls) {
      if (v.guideOnly || !v.paper || Math.abs(v.az - p.z) > .01 || Math.abs(v.bz - p.z) > .01) continue;
      const a = Math.min(v.ax, v.bx), b = Math.max(v.ax, v.bx);
      if (b <= p.x + .01 && b > l) l = b;
      if (a >= p.x - .01 && a < r) r = a;
    }
    if (!isFinite(l) || !isFinite(r)) continue;
    const top = new THREE.Group(), len = r - l;
    box(top, len, .1, .12, 0, ph + .05, 0, 0x3a2a1c);
    partitionNageshi(top, len);
    partitionTop(top, len);
    if (layout.profile === 'hieizan') {
      // 開けた戸も受ける長さの敷居・鴨居。柱の手前へ持ち出して建具を貫かない。
      // 戸の溝は動く間も同じ位置。形は設営時のまとめ描きに含める。
      const sillH = hieiSobo ? HIEI_SOBO_SILL : .04;
      // 戸当たりの竪框は引き込み端の外へ五センチ出る。
      // 横木をその外面まで通し、敷居と鴨居の間で竪框を受ける。
      const span = len * 2 + .1;
      hieiGroovedSill(top, span, sillH, .18, HIEI_DOOR_TRACK);
      // 鴨居の下面は建具の上框へ合わせる。
      hieiGroovedKamoi(top, span, ph, .18, HIEI_DOOR_TRACK);
      // つなぎ材の下面を鴨居の上面へ載せる。三センチ食い込ませると、
      // 異なる幅の材の上面が交差し、木口の納まりも不自然になる。
      // 厚み六センチと溝の位置は保ち、戸の上框には張り出させない。
      box(top, span, .06, .28, 0, ph + .13, .12, 0x3a2a1c);
    } else box(top, len, .04, .1, 0, .02, 0, 0x3a2a1c);   // 敷居
    place(g, top, (l + r) / 2, p.z, 0);
  }
  if (['chudo', 'hondo', 'kuri', 'sobo', 'goten'].includes(layout.kind)) {
    const rs = layout.rooms, hw = Math.max(...rs.map(r => r.x1)), hd = Math.max(...rs.map(r => r.z1));
    // 比叡山の堂は須弥壇の左右に既に油皿があり、明かりもその火先へ焼き込む。
    // 僧坊・庫裏の置き灯明も間取りの調度で描く。固定位置へ同じ灯具を重ねない。
    const altarLit = layout.profile === 'hieizan' && ['chudo', 'hondo', 'sobo', 'kuri'].includes(layout.kind);
    if (!altarLit) for (const x of [-hw + .5, hw - .5]) {
      // 比叡山の隅の灯明も須弥壇と同じ油皿・灯芯に揃える。
      // 汎用の灯具へ置き換えず、共通の形と材質を使って一度だけまとめる。
      place(g, tomyo(layout.profile === 'hieizan'), x, hd - .75); place(g, lightPool(), x, hd - .75, 0, .09);
    }
    // 比叡山・越前の堂と僧坊は梁を天井の上へ納め、格縁・竿縁を遮らない。
    if (!['hieizan', 'echizen_ikko', 'takato'].includes(layout.profile)) for (const z of [-hd * .5, hd * .5]) {
      const beam = bought('beam', hw * 2, .2, .22);
      if (beam) place(g, beam, 0, z, 0, h - .22);
      else box(g, hw * 2, .2, .22, 0, h - .12, z, 0x3a2a1c);
    }
  }
  if (kb && kb.n) g.add(kb.build({ basic: true, tint: .8, shadow: false, camBlock: false }));
  const mesh = batchInterior(g);
  if (dim) shadeNight(mesh);
  layoutDecor.set(key, mesh);
  const copy = mesh.clone(); cacheUsers.push(new WeakRef(copy)); return copy;
}

// 屋敷と評定の間。局所+zが入口。通れる幅2.4mの戸口と、廊下から室内へ抜ける口を空ける。
export function buildRoom(rt, x, z, { w = 7.2, d = 9, rot = 0, night = false, council = false, collision = true, kind = council ? 'goten' : 'yashiki' } = {}) {
  const KR = cgtOn() && (cgtHas('Floor_Tatami') || cgtHas('tatami_floor_modular_a'));
  const detailed = true && ['goten', 'yashiki', 'nagaya'].includes(kind);
  const key = `${w}:${d}:${night}:${council}:${kind}:${KR ? 1 : 0}:${detailed}`;
  if (!rooms.has(key)) {
    const g = new THREE.Group(), roof = new THREE.Group(), hw = w / 2, hd = d / 2;
    const layout = interiorLayout(kind, w, d, { profile: council ? 'council' : null });
    const wall = (ww, dd, xx, zz, kind = '') => {
      box(g, ww, 2.7, dd, xx, 1.35, zz, kind ? 0xffffff : 0xb4a68b, kind);
    };
    box(g, w, .08, d, 0, -.04, 0, 0x6e5238);
    g.add(furnishLayout(layout));
    wall(w, .12, 0, -hd);
    for (const xx of [-hw, hw]) {
      const n = Math.ceil(d / .9), span = d / n;
      if (kind === 'shrine' || kind === 'nagaya') wall(.12, d, xx, 0);
      else for (let i = 0; i < n; i++) place(g, shoji(span, 2.7), xx, -hd + (i + .5) * span, Math.PI / 2);
    }
    for (const s of [-1, 1]) wall((w - 2.4) / 2, .12, s * (hw / 2 + .6), hd);
    for (const xx of [-hw, hw]) for (const zz of [-hd, hd]) place(g, hashira(2.7), xx, zz);
    if (kind === 'goten') {
      const r = layout.rooms[0];
      box(g, r.x1 - r.x0 - .3, .16, r.z1 - r.z0 - .4, (r.x0 + r.x1) / 2, .08, (r.z0 + r.z1) / 2, 0xada677, 'tatami');
    }
    if (council) {
      const upper = layout.rooms[0], hall = layout.rooms[1];
      place(g, suwari(0x653b30, 'lord'), 0, (upper.z0 + upper.z1) / 2, 0, .16);
      place(g, suwari(), 0, (hall.z0 + hall.z1) / 2 + .8, Math.PI);
      for (const xx of [-hw + 1, hw - 1]) for (const zz of [hall.z0 + .9, hall.z1 - .7]) place(g, suwari(xx < 0 ? 0x4a5147 : 0x494359, zz < 0 ? 'elder' : 'kerai'), xx, zz, xx < 0 ? Math.PI / 2 : -Math.PI / 2);
    }
    if (night) for (const xx of [-hw + .6, hw - .6]) {
      place(g, tomyo(), xx, -hd + 3); place(g, lightPool(), xx, -hd + 3, 0, .075);
    }
    if (detailed) {
      const hip = kind !== 'nagaya', rw = w + 2.0, rd = d + 2.0, rh = hip ? 1.65 : 1.15;
      const r = new THREE.Mesh(residenceRoofGeo(rw, rd, rh, hip), residenceRoofMat(hip ? 'bark' : 'boards'));
      r.position.y = 2.95; r.castShadow = r.receiveShadow = true; roof.add(r);
      if (hip) {
        const upper = new THREE.Mesh(residenceRoofGeo(rw * .35, rd * .35, .65), residenceRoofMat('bark'));
        upper.position.y = 2.95 + rh; upper.castShadow = true; roof.add(upper);
      }
      box(roof, hip ? rw * .35 : rw, .13, .18, 0, 2.95 + rh + (hip ? .65 : 0), 0, 0x594631);
      // 縁側は床と同じ高さ。玄関の口と既存の段を空ける。
      if (hip) for (const side of [-1, 1]) {
        box(g, .8, .1, d + .8, side * (hw + .4), -.04, 0, 0x826344);
        box(g, (w - 2.4) / 2, .1, .8, side * (hw / 2 + .6), -.04, hd + .4, 0x826344);
        for (let q = 0; q <= Math.ceil(d / 2); q++) box(g, .12, 2.85, .12, side * hw, 1.425, -hd + q * d / Math.ceil(d / 2), 0x59432e);
        // 障子の外側に寄せた板戸と戸袋。
        box(g, .09, 2.3, .55, side * (hw + .08), 1.2, -hd + .3, 0x73583d);
      }
    } else for (const s of [-1, 1]) { const r = new THREE.Mesh(shape(w / 2 + .3, .12, d + .8), mat(0x554436)); r.rotation.z = -s * (kind === 'shrine' ? .38 : .22); r.position.set(s * w / 4, 3.2, 0); roof.add(r); }
    const mesh = batchInterior(g);
    if (night) shadeNight(mesh);
    rooms.set(key, { mesh, roof: batchInterior(roof) });
  }
  const template = rooms.get(key), root = template.mesh.clone(), roof = template.roof.clone();
  const y = rt.world.heightAt(x, z) + .1, c = Math.cos(rot), s = Math.sin(rot);
  const P = (lx, lz) => ({ x: x + lx * c + lz * s, z: z - lx * s + lz * c });
  root.traverse(m => { if (m.isMesh) m.userData.camBlock = false; });
  const cameraWalls = new THREE.Group();
  const wallMat = materials.get('cameraWall') || new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false, side: THREE.DoubleSide });
  materials.set('cameraWall', wallMat);
  // 物自体は見える扱いのまま当たりに残す。絵を出さない材質は描画一覧へ入れない。
  wallMat.visible = false;
  const cameraWall = (ax, az, bx, bz) => {
    const len = Math.hypot(bx - ax, bz - az);
    if (len < .01) return;
    const m = new THREE.Mesh(shape(len, 2.7, .14), wallMat);
    m.position.set((ax + bx) / 2, 1.35, (az + bz) / 2);
    m.rotation.y = Math.atan2(-(bz - az), bx - ax); m.userData.camBlock = true;
    cameraWalls.add(m);
  };
  cameraWall(-w / 2, -d / 2, w / 2, -d / 2);
  for (const side of [-1, 1]) cameraWall(side * w / 2, -d / 2, side * w / 2, d / 2);
  cameraWall(-w / 2, d / 2, -1.2, d / 2); cameraWall(1.2, d / 2, w / 2, d / 2);
  for (const v of interiorLayout(kind, w, d).walls) cameraWall(v.ax, v.az, v.bx, v.bz);
  root.add(cameraWalls);
  root.position.set(x, y, z); root.rotation.y = rot; roof.position.copy(root.position); roof.rotation.y = rot;
  root.userData.noMerge = roof.userData.noMerge = true;
  rt.scene.add(root, roof);
  let inside = null;
  if (collision) {
    inside = addInterior(rt.world, { x, z, rot, kind, name: kind === 'nagaya' ? '長屋' : kind === 'shrine' ? '鎮守の社' : kind === 'goten' ? '主殿' : kind === 'temple' ? '寺' : kind === 'inn' ? '宿' : kind === 'toiya' ? '問屋' : kind === 'shisha' ? '使者の間' : kind === 'machiya' ? '町家' : '屋敷', levels: [{ w, d, y: y + .065, h: 2.635 }], door: { w: 2.4, h: 2.635 }, approach: { pad: .1, len: 1.1 } });
    // すでにまとめた見た目を共通の出入り・戦い・音へ渡す。
    inside.mesh = root; inside.built = true; inside.hasExterior = true;
  }
  return { root, roof, x, z, w, d, c, s, y: y + .065, P, inside, layout: inside ? inside.levels[0].layout : interiorLayout(kind, w, d) };
}
export function roomTick(room, pos) {
  if (!room || !pos) return;
  const current = nakaRoomAt(pos.x, pos.z, pos.y);
  room.roof.visible = !room.inside || current?.I !== room.inside || pos.y > room.y + 2.7;
}
// 出世の絵は一度だけ立体を描き、すぐ描画器を閉じる。戦の兵や毎コマの描画は増やさない。
export function drawCouncil(canvas) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false }); renderer.setSize(canvas.width, canvas.height); renderer.setPixelRatio(1);
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0x30281e);
    const room = buildRoom({ scene, world: { heightAt: () => 0 } }, 0, 0, { w: 10.8, d: 9, council: true, collision: false });
    room.roof.visible = false;
    const camera = new THREE.PerspectiveCamera(56, canvas.width / canvas.height, .1, 40);
    camera.position.set(3, 2.6, 3.9); camera.lookAt(0, .65, -2);
    renderer.render(scene, camera); canvas.getContext('2d').drawImage(renderer.domElement, 0, 0); return true;
  } catch (_) { return false; }
  finally { if (renderer) { renderer.dispose(); renderer.forceContextLoss(); } }
}

// 設営の終わりだけ呼ぶ。使っていない控えを制限し、共有中の形は残す。
const roomScenes = [];
export function trimInteriorCache(scene) {
  if (!roomScenes.some(ref => ref.deref() === scene)) roomScenes.push(new WeakRef(scene));
  const used = new Set(), removed = new Set();
  const collect = (value, out) => {
    if (value?.isBufferGeometry) out.add(value);
    else if (value?.traverse) value.traverse(m => { if (m.geometry) out.add(m.geometry); });
    else if (value?.mesh) { collect(value.mesh, out); collect(value.roof, out); }
  };
  for (let i = roomScenes.length - 1; i >= 0; i--) { const live = roomScenes[i].deref(); if (!live) roomScenes.splice(i, 1); else collect(live, used); }
  for (let i = cacheUsers.length - 1; i >= 0; i--) { const live = cacheUsers[i].deref(); if (!live) cacheUsers.splice(i, 1); else collect(live, used); }
  for (const [cache, limit] of [[shapes, 128], [rooms, 16], [layoutDecor, 16], [templeDecor, 8]]) {
    const idle = [];
    for (const [key, value] of cache) { const geos = new Set(); collect(value, geos); if (![...geos].some(g => used.has(g))) idle.push(key); }
    for (const key of idle.slice(0, Math.max(0, idle.length - limit))) { collect(cache.get(key), removed); cache.delete(key); }
  }
  // 別の控えと共有している形も保護する。材質と絵は共通なので捨てない。
  for (const cache of [shapes, rooms, panels, templeDecor, layoutDecor]) for (const value of cache.values()) collect(value, used);
  for (const geo of removed) if (!used.has(geo)) geo.dispose();
}
