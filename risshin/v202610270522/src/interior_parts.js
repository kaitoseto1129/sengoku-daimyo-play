// 城・寺・屋敷の室内部品。部品の関数を差し替えれば、買った素材でも同じ配置と当たりを使える。
// 形・材質・絵は使い回す。設営時に材質ごとにまとめ、光は絵に焼く（灯りの影や毎コマの生成なし）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { solidRect, tawara } from './props.js';
import { S } from './settings.js';
import { residenceRoofGeo, residenceRoofMat } from './residence_parts.js';
import { addInterior, nakaRoomAt } from './naka.js';
import { interiorLayout, shitaragaharaTempleMats, shitaragaharaHomePanels, interiorPartitionHeight, interiorPartitionSpans } from './interior_layouts.js';
import { addNaibu } from './naibu_kit.js';
import { cgtOn, cgtHas, cgtKitGroup, cgtBox, cgtParts, cgtSpend, KitBatch } from './cgt.js';   // 買った素材（床・畳・柱）。読めていれば差し替える

// 小堂の格天井の裏板より上へ、梁とその上の架構を逃がす高さ。
export const SHITARAGAHARA_CEILING_LIFT = .12;
const cacheUsers = [];
let earthPicture = null;
const shapes = new Map(), materials = new Map(), rooms = new Map(), panels = new Map(), templeDecor = new Map(), layoutDecor = new Map();
let villageWoodTexture;
let inabaBoardPicture, inabaPlasterPicture;
// 本堂の天蓋は薄い鏡板ではなく、頭貫へ渡す吊り受け材の下面から吊るす。
export const INABA_ALTAR_SUSPENSION_DROP = .12;
// 稲葉山の来迎壁の上端。天蓋を天井下へ下げる量も含め、絵と当たりで共有する。
export function inabaAltarBackHeight(p, h) {
  const scale = p.h / 1.75;
  const ceiling = (h - (p.y || 0)) / scale;
  const drop = Math.min(0, ceiling - (INABA_ALTAR_SUSPENSION_DROP + .1) / scale - 2.27);
  return (2.14 + drop) * scale;
}

function shape(w, h, d) {
  const key = `${w}:${h}:${d}`;
  if (!shapes.has(key)) shapes.set(key, new THREE.BoxGeometry(w, h, d));
  return shapes.get(key);
}
// 設楽原の長押の推定形。下端の見込みを薄くし、柱へ付く背面は動かさない。
// 間仕切りは両面、外周は室内側だけを削る。同じ原形を設営時に使い回す。
export function nageshiGeometry(w, h, d, face = 0) {
  const key = `長押:${face}`;
  if (!shapes.has(key)) {
    const geo = new THREE.BoxGeometry(1, 1, 1), p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) if (p.getY(i) < 0) {
      const z = p.getZ(i);
      if (!face || Math.sign(z) === face) p.setZ(i, z - Math.sign(z) * .2);
    }
    geo.computeVertexNormals();
    shapes.set(key, geo);
  }
  const geo = shapes.get(key).clone().scale(w, h, d);
  // 薄く削った長押も木地の長手へ木目を通す。傾斜面を含め、
  // 建具と共用する縦木目を横材へ合わせる。外周の回転前に割り付ける。
  const p = geo.attributes.position, normal = geo.attributes.normal, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const across = Math.abs(normal.getY(i)) > .5 ? p.getZ(i) / d : p.getY(i) / h;
    uv.setXY(i, across + .5, p.getX(i) / w + .5);
  }
  return geo;
}
function picture(kind) {
  if (['villageWood', 'tatamiCore', 'tatamiWeave', 'tatamiHeriWeave', 'washi'].includes(kind)) return villagePicture(kind);
  if (kind === 'villageWood' && villageWoodTexture) return villageWoodTexture;
  if (kind === 'inabaBoard' && inabaBoardPicture) return inabaBoardPicture;
  if (kind === 'inabaPlaster' && inabaPlasterPicture) return inabaPlasterPicture;
  const S = 256, cv = document.createElement('canvas'); cv.width = S; cv.height = S;
  const g = cv.getContext('2d');
  let seed = kind.length * 977 + 13; const R = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  if (kind === 'earthM') {
    // 森部の小壁は土の仕上げを見せる推定復元。淡い鏝むらと砂・すさを
    // 一枚へ焼き、堂と二棟の屋敷で共用する。木組みや毎コマの処理は増やさない。
    g.fillStyle = '#eee9df'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(100,83,58,${.012 + R() * .018})`;
      g.beginPath(); g.ellipse(R() * S, R() * S, 12 + R() * 32, 3 + R() * 10, (R() - .5) * .5, 0, Math.PI * 2); g.fill();
    }
    for (let i = 0; i < 650; i++) {
      const x = R() * S, y = R() * S;
      g.fillStyle = R() < .5 ? 'rgba(92,75,49,.09)' : 'rgba(255,252,239,.17)';
      g.fillRect(x, y, 1, 1);
      if (i % 7 === 0) {
        g.strokeStyle = 'rgba(118,99,62,.09)'; g.lineWidth = .5;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + 2 + R() * 4, y + (R() - .5) * 3); g.stroke();
      }
    }
  } else if (kind === 'boardsM') {
    // 森部の板間。板の長手（奥行き）へ木目と鉋むらを通す。
    // 絵は材質ごとに一度だけ作り、同じ幅の床板で使い回す。
    g.fillStyle = '#eee6d5'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 65; i++) {
      const x = R() * S, bend = (R() - .5) * 20;
      g.strokeStyle = `rgba(70,49,28,${.04 + R() * .1})`;
      g.lineWidth = .5 + R() * 1.5;
      g.beginPath(); g.moveTo(x, 0);
      g.bezierCurveTo(x + bend, S / 3, x - bend, S * 2 / 3, x, S); g.stroke();
    }
    const light = g.createLinearGradient(0, 0, S, 0);
    light.addColorStop(0, 'rgba(55,36,20,.12)'); light.addColorStop(.3, 'rgba(255,250,230,.06)');
    light.addColorStop(1, 'rgba(55,36,20,.08)');
    g.fillStyle = light; g.fillRect(0, 0, S, S);
  } else if (kind === 'banM') {
    // 薬師堂の幡。厚い板ではなく、退色した布の経糸・緯糸を二枚で共用する。
    g.fillStyle = '#d0c5a7'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < S; i += 4) {
      g.fillStyle = 'rgba(72,60,38,.12)'; g.fillRect(i, 0, 1, S);
      g.fillStyle = 'rgba(250,241,212,.22)'; g.fillRect(0, i, S, 1);
    }
    for (const x of [3, S - 6]) {
      g.fillStyle = 'rgba(72,60,38,.25)'; g.fillRect(x, 0, 3, S);
    }
  } else if (kind === 'tatamiM') {
    // 森部の座敷用。長さ約二メートルの畳で、藺草を幅方向へ細かく通す。
    // 織り糸の位置で草の上下を交互に替え、太い横縞だけの畳表にしない。
    g.fillStyle = '#aaa378'; g.fillRect(0, 0, S, S);
    for (let y = 0; y < S; y++) {
      g.fillStyle = y % 2 ? 'rgba(70,65,34,.22)' : 'rgba(224,215,167,.22)';
      g.fillRect(0, y, S, 1);
      for (let x = 8; x < S; x += 24) {
        g.fillStyle = (y + (x - 8) / 24) % 2 ? 'rgba(66,59,32,.24)' : 'rgba(232,221,176,.28)';
        g.fillRect(x, y, 2, 1);
      }
    }
    for (let i = 0; i < 90; i++) {
      g.fillStyle = `rgba(88,79,44,${.03 + R() * .06})`;
      g.fillRect(R() * S, Math.floor(R() * S), 6 + R() * 24, 1);
    }
  } else if (kind === 'waraM') {
    // 森部の畳床の短辺。圧した藁の層と切り口を描き、木の板に見せない。
    // 一枚を全畳で共用し、草一本ごとの形や毎コマの処理は足さない。
    g.fillStyle = '#8b7950'; g.fillRect(0, 0, S, S);
    for (let row = 0; row < 16; row++) {
      const yy = (row + .5) * S / 16;
      for (let col = 0; col < 40; col++) {
        const x = (col + .5 + (R() - .5) * .6) * S / 40;
        const y = yy + (R() - .5) * 5;
        const rx = 1.5 + R() * 1.3, ry = 2 + R() * 2;
        g.fillStyle = R() < .5 ? '#b8a473' : '#a28c5c';
        g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#655635';
        g.beginPath(); g.ellipse(x, y, rx * .45, ry * .45, 0, 0, Math.PI * 2); g.fill();
      }
      g.fillStyle = 'rgba(52,43,24,.2)'; g.fillRect(0, (row + 1) * S / 16 - 1, S, 1);
    }
  } else if (kind === 'heriM') {
    // 無地の畳縁も黒い木の帯にせず、縦横の糸と折り返しの陰で表す。
    // 二棟の全畳で一枚を共用し、模様や金糸は足さない推定復元。
    g.fillStyle = '#4b4939'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < S; i += 4) {
      g.fillStyle = 'rgba(215,206,165,.13)'; g.fillRect(i, 0, 1, S);
      g.fillStyle = 'rgba(12,11,8,.22)'; g.fillRect(0, i, S, 1);
    }
    for (const x of [0, S - 12]) {
      g.fillStyle = 'rgba(12,11,8,.24)'; g.fillRect(x, 0, 12, S);
    }
    // 折り返した縁を留める細い縫い目。四・四センチの絵を長手へ繰り返すので、
    // 約五・五ミリの針目を両端へ納める。隣の畳の表や縁の外へ糸を描かない。
    // 共有画像に焼き、畳ごとの糸の形・材質・毎コマの処理は増やさない。
    for (const x of [14, S - 16]) {
      g.fillStyle = 'rgba(10,9,6,.24)'; g.fillRect(x - 1, 0, 4, S);
      for (let y = 4; y < S; y += 32) {
        g.fillStyle = 'rgba(191,178,135,.38)'; g.fillRect(x, y, 2, 12);
        g.fillStyle = 'rgba(10,9,6,.4)';
        g.fillRect(x, y - 1, 2, 1); g.fillRect(x, y + 12, 2, 1);
      }
    }
  } else if (kind === 'tatami') {
    g.fillStyle = '#9d9868'; g.fillRect(0, 0, S, S);
    // 藺草の織り目：細い筋と、畳の目ごとの濃淡
    for (let y = 0; y < S; y += 3) { g.fillStyle = `rgba(${R() < 0.5 ? '120,116,76' : '190,184,130'},${0.18 + R() * 0.16})`; g.fillRect(0, y, S, 1 + (R() < 0.3)); }
    for (let i = 0; i < 160; i++) { g.fillStyle = `rgba(${90 + R() * 80},${88 + R() * 70},${50 + R() * 40},0.1)`; g.fillRect(R() * S, R() * S, 6 + R() * 40, 2); }
    // 足の擦れた跡と染み
    for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(60,48,30,0.1)'; g.beginPath(); g.ellipse(R() * S, R() * S, 12 + R() * 30, 6 + R() * 14, R() * 3, 0, 7); g.fill(); }
    const light = g.createLinearGradient(0, 0, S, S); light.addColorStop(0, 'rgba(255,248,212,.16)'); light.addColorStop(1, 'rgba(40,32,20,.14)');
    g.fillStyle = light; g.fillRect(0, 0, S, S);
  } else if (kind === 'inabaTatamiBorder') {
    // 座敷の畳縁は黒い角材でなく、無地の織物を巻いた推定の納まり。
    // 織り目と縫い留めは一枚の絵に焼き、縁の形・床高・毎コマの処理を増やさない。
    g.fillStyle = '#292b22'; g.fillRect(0, 0, S, S);
    for (let y = 0; y < S; y += 4) {
      g.fillStyle = y % 8 ? '#34372a' : '#23251e'; g.fillRect(0, y, S, 1);
    }
    for (let x = 0; x < S; x += 8) {
      g.fillStyle = 'rgba(164,153,114,.12)'; g.fillRect(x, 0, 1, S);
    }
    for (const x of [12, S - 12]) {
      g.fillStyle = '#1d2019'; g.fillRect(x - 2, 0, 4, S);
      g.fillStyle = '#80795b';
      for (let y = 3; y < S; y += 12) g.fillRect(x, y, 1, 4);
    }
  } else if (kind === 'inabaBoard') {
    // 板間の板目を長手へ通す。床の三色で一枚の絵を共有し、板や釘は増やさない。
    g.fillStyle = '#eee4cf'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 100; i++) {
      const x = R() * S, bend = (R() - .5) * 18;
      g.strokeStyle = i % 3 ? 'rgba(88,66,38,.12)' : 'rgba(255,250,231,.22)';
      g.lineWidth = .5 + R(); g.beginPath(); g.moveTo(x, 0);
      g.bezierCurveTo(x + bend, S * .3, x - bend, S * .7, x, S); g.stroke();
    }
    // 板の端を黒く囲まず、踏まれる中央だけ淡く擦れた面にする。
    const wear = g.createLinearGradient(0, 0, S, 0);
    wear.addColorStop(0, 'rgba(255,249,228,0)');
    wear.addColorStop(.5, 'rgba(255,249,228,.12)');
    wear.addColorStop(1, 'rgba(255,249,228,0)');
    g.fillStyle = wear; g.fillRect(0, 0, S, S);
  } else if (kind === 'inabaPlaster') {
    // 主殿・館・遠侍と本堂の小壁は、単色の箱でなく土の塗り壁として仕上げる推定。
    // 淡い鏝むらと細かな砂粒を一枚へ焼き、壁色を掛けて座敷と堂で共有する。
    g.fillStyle = '#f0ece2'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 45; i++) {
      g.fillStyle = i % 2 ? 'rgba(255,253,244,.05)' : 'rgba(105,90,68,.025)';
      g.beginPath();
      g.ellipse(R() * S, R() * S, 24 + R() * 45, 3 + R() * 9,
        (R() - .5) * .4, 0, Math.PI * 2); g.fill();
    }
    for (let i = 0; i < 1800; i++) {
      g.fillStyle = i % 3 ? 'rgba(115,100,77,.055)' : 'rgba(255,253,244,.16)';
      g.fillRect(R() * S, R() * S, 1, 1);
    }
  } else if (kind === 'earth') {
    // 用屋の踏み固めた土間。木目や板の継ぎ目を付けず、土粒と踏み跡を一枚に焼く。
    g.fillStyle = '#74634c'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 1600; i++) {
      g.fillStyle = R() < .5 ? 'rgba(39,31,22,.16)' : 'rgba(182,159,119,.18)';
      const size = 1 + R() * 3;
      g.fillRect(R() * S, R() * S, size, size);
    }
    for (let i = 0; i < 20; i++) {
      g.fillStyle = 'rgba(47,37,26,.05)'; g.beginPath();
      g.ellipse(R() * S, R() * S, 8 + R() * 20, 4 + R() * 8, R() * Math.PI, 0, Math.PI * 2); g.fill();
    }
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
  } else if (kind === 'shoji' || kind === 'shojiPaper' || kind === 'washi' || kind === 'shojiM' || kind === 'shojiPaperInaba') {
    // 障子紙：楮の繊維のむらと、煤けた下の隅。細い桟を組む（縦 4 本×横 6 段ほど。貼り継ぎの線も）
    const paper = g.createRadialGradient(S / 2, S * 0.4, 10, S / 2, S * 0.4, S * 0.78);
    paper.addColorStop(0, '#e6dfc8'); paper.addColorStop(1, '#b9b39c');
    g.fillStyle = paper; g.fillRect(0, 0, S, S);
    if (kind === 'shojiPaperInaba') {
      // 稲葉山の高画質だけ、障子紙を小判の和紙で貼り継いだ推定の納まりにする。
      // 紙ごとの淡い差と糊代を共有の絵へ焼き、組子や戸の形は増やさない。
      const cols = 2, rows = 3, cw = S / cols, ch = S / rows;
      for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
        g.fillStyle = (row + col) % 2 ? 'rgba(255,248,225,.07)' : 'rgba(108,96,73,.035)';
        g.fillRect(col * cw, row * ch, cw, ch);
      }
      for (let col = 1; col < cols; col++) {
        g.fillStyle = 'rgba(116,103,79,.13)'; g.fillRect(col * cw - 1, 0, 3, S);
        g.fillStyle = 'rgba(255,248,225,.15)'; g.fillRect(col * cw + 2, 0, 1, S);
      }
      for (let row = 1; row < rows; row++) {
        g.fillStyle = 'rgba(116,103,79,.13)'; g.fillRect(0, row * ch - 1, S, 3);
        g.fillStyle = 'rgba(255,248,225,.15)'; g.fillRect(0, row * ch + 2, S, 1);
      }
    }
    for (let i = 0; i < 260; i++) { g.strokeStyle = `rgba(${R() < 0.5 ? '255,250,230' : '120,104,80'},${0.1 + R() * 0.12})`; g.lineWidth = 1; g.beginPath(); const x = R() * S, y = R() * S; g.moveTo(x, y); g.lineTo(x + (R() - 0.5) * 30, y + (R() - 0.5) * 12); g.stroke(); }
    const dirt = g.createLinearGradient(0, S * 0.7, 0, S); dirt.addColorStop(0, 'rgba(80,66,46,0)'); dirt.addColorStop(1, 'rgba(80,66,46,0.32)'); g.fillStyle = dirt; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 2; i++) { g.fillStyle = 'rgba(214,205,180,0.8)'; g.fillRect(20 + R() * 190, 20 + R() * 190, 18 + R() * 18, 14 + R() * 12); }   // 破れの貼り直し
    // 組子を立体で組む障子には紙の繊維だけを使い、紙の裏へ木の絵を重ねない。
    if (kind === 'shoji') {
      g.fillStyle = '#4a3624';
      for (let x = 0; x < S; x += S / 4) g.fillRect(x - 2, 0, 4, S);
      for (let y = 0; y < S; y += S / 6) g.fillRect(0, y - 1.5, S, 3);
      g.fillStyle = 'rgba(0,0,0,0.25)'; for (let x = 0; x < S; x += S / 4) g.fillRect(x + 2, 0, 2, S);
    }
  } else if (kind === 'scroll') {
    // 床の間の掛軸。文字は描かず、裂地の表装と紙本の墨竹を一枚に焼く。
    g.fillStyle = '#776c4d'; g.fillRect(0, 0, S, S);
    for (let y = 0; y < S; y += 4) {
      g.fillStyle = 'rgba(215,199,151,.12)'; g.fillRect(0, y, S, 1);
    }
    g.fillStyle = '#b4a77d'; g.fillRect(18, 36, S - 36, 174);
    g.fillStyle = '#d8d0b8'; g.fillRect(25, 43, S - 50, 160);
    g.save(); g.beginPath(); g.rect(25, 43, S - 50, 160); g.clip();
    for (let i = 0; i < 3; i++) {
      const x = 76 + i * 43;
      g.strokeStyle = 'rgba(46,48,37,.72)'; g.lineWidth = 2 + i % 2;
      g.beginPath(); g.moveTo(x, 207); g.lineTo(x + 14, 60 + i * 18); g.stroke();
      for (let j = 0; j < 4; j++) {
        const y = 90 + j * 27, bx = x + (207 - y) * .09;
        g.lineWidth = 1; g.beginPath(); g.moveTo(bx - 3, y); g.lineTo(bx + 4, y); g.stroke();
        for (const side of [-1, 1]) {
          g.beginPath(); g.moveTo(bx, y);
          g.quadraticCurveTo(bx + side * 20, y - 22, bx + side * 34, y - 17);
          g.quadraticCurveTo(bx + side * 20, y - 7, bx, y);
          g.fillStyle = 'rgba(46,48,37,.65)'; g.fill();
        }
      }
    }
    g.restore();
  } else if (kind === 'fusumaM') {
    // 在所の座敷は無地の紙襖として推定復元。金の砂子や御殿向けの松山図を使わない。
    g.fillStyle = '#c6bda5'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 280; i++) {
      g.strokeStyle = R() < .5 ? 'rgba(245,236,211,.16)' : 'rgba(100,86,63,.12)';
      const x = R() * S, y = R() * S;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + 2 + R() * 10, y + (R() - .5) * 3); g.stroke();
    }
    const dirt = g.createLinearGradient(0, S * .7, 0, S);
    dirt.addColorStop(0, 'rgba(80,66,46,0)'); dirt.addColorStop(1, 'rgba(80,66,46,.18)');
    g.fillStyle = dirt; g.fillRect(0, 0, S, S);
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
    // 無地指定の座敷は和紙とする推定。絵襖の金砂子・松の絵と使い分ける。
    const plainFusuma = kind === 'fusumaPlainInaba';
    if (plainFusuma) {
      g.fillStyle = '#d7cdb7'; g.fillRect(0, 0, S, S);
    } else {
      // 襖：地は金茶の砂子紙。下の隅に松と山の墨絵。縁は黒漆
      g.fillStyle = '#cdbd96'; g.fillRect(0, 0, S, S);
      for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(${R() < 0.4 ? '236,214,150' : '150,130,90'},${0.1 + R() * 0.2})`; g.fillRect(R() * S, R() * S, 1 + R() * 3, 1 + R() * 2); }
      const mist = g.createLinearGradient(0, S * 0.45, 0, S); mist.addColorStop(0, 'rgba(120,128,108,0)'); mist.addColorStop(1, 'rgba(90,98,80,0.5)');
      g.fillStyle = mist; g.beginPath(); g.moveTo(0, S * 0.82); g.lineTo(S * 0.28, S * 0.6); g.lineTo(S * 0.46, S * 0.74); g.lineTo(S * 0.76, S * 0.5); g.lineTo(S, S * 0.76); g.lineTo(S, S); g.lineTo(0, S); g.fill();
      g.strokeStyle = '#3c3524'; g.lineWidth = 6; g.beginPath(); g.moveTo(S * 0.25, S * 0.95); g.quadraticCurveTo(S * 0.3, S * 0.6, S * 0.27, S * 0.3); g.stroke();
      g.fillStyle = '#4a5238'; for (const [x, y] of [[0.2, 0.3], [0.33, 0.38], [0.18, 0.46], [0.3, 0.26]]) { g.beginPath(); g.ellipse(S * x, S * y, 36, 9, -0.1, 0, 7); g.fill(); }
    }
    if (kind === 'fusumaPaperInaba' || plainFusuma) {
      // 稲葉山の襖は小判の和紙を貼り継ぐ推定の納まり。
      // 横線だけの巻紙状にせず、縦の継ぎ目を段ごとにずらし、紙ごとの淡いむらも焼く。
      // 固定襖と動く襖で絵を共有し、形の数や毎コマの処理は増やさない。
      const rows = 4, rowH = S / rows;
      for (let row = 0; row < rows; row++) {
        const seamX = S * (row % 2 ? .6 : .4), top = row * rowH;
        g.fillStyle = row % 2 ? 'rgba(247,237,211,.045)' : 'rgba(109,93,65,.025)';
        g.fillRect(0, top, seamX, rowH);
        g.fillStyle = row % 2 ? 'rgba(109,93,65,.025)' : 'rgba(247,237,211,.045)';
        g.fillRect(seamX, top, S - seamX, rowH);
        g.fillStyle = 'rgba(104,88,58,.10)'; g.fillRect(seamX - 1, top, 2, rowH);
        g.fillStyle = 'rgba(244,232,197,.16)'; g.fillRect(seamX + 1, top, 1, rowH);
      }
      for (let row = 1; row < rows; row++) {
        const y = row * rowH;
        g.fillStyle = 'rgba(104,88,58,.10)'; g.fillRect(0, y - 1, S, 2);
        g.fillStyle = 'rgba(244,232,197,.16)'; g.fillRect(0, y + 1, S, 1);
      }
      // 下張り越しの骨当たりを淡く焼き、障子のように木の格子を表へ出さない。
      // 紙の貼り継ぎとは別の割り付けで、下地の縦横の骨を表す推定。
      // 共通の紙の絵だけで表し、見えない内部材や描画の束は増やさない。
      for (let axis = 0; axis < 2; axis++) {
        const bays = axis === 0 ? 3 : 7;
        for (let i = 1; i < bays; i++) {
          const at = S * i / bays;
          const shade = axis === 0 ? g.createLinearGradient(at - 3, 0, at + 3, 0)
            : g.createLinearGradient(0, at - 3, 0, at + 3);
          shade.addColorStop(0, 'rgba(104,88,58,0)');
          shade.addColorStop(.45, 'rgba(104,88,58,.035)');
          shade.addColorStop(.65, 'rgba(244,232,197,.045)');
          shade.addColorStop(1, 'rgba(244,232,197,0)');
          g.fillStyle = shade;
          if (axis === 0) g.fillRect(at - 3, 0, 6, S);
          else g.fillRect(0, at - 3, S, 6);
        }
      }
      for (let i = 0; i < 160; i++) {
        const x = R() * S, y = R() * S;
        g.strokeStyle = i % 2 ? 'rgba(246,233,200,.13)' : 'rgba(114,98,69,.09)';
        g.lineWidth = .5; g.beginPath(); g.moveTo(x, y);
        g.lineTo(x + (R() - .5) * 10, y + 2 + R() * 5); g.stroke();
      }
    }
    const dirt = g.createLinearGradient(0, 0, 0, S); dirt.addColorStop(0, 'rgba(60,48,30,0.18)'); dirt.addColorStop(0.3, 'rgba(60,48,30,0)'); dirt.addColorStop(1, 'rgba(60,48,30,0.25)'); g.fillStyle = dirt; g.fillRect(0, 0, S, S);
    // 稲葉山の襖の縁は実物の框で組む。紙にも黒帯を描くと二重の縁に
    // 見えるため、紙面の端へ黒帯を重ねない。
    if (kind !== 'fusumaPaperInaba' && !plainFusuma) {
      g.fillStyle = 'rgba(30,22,16,0.7)'; g.fillRect(0, 0, S, 5); g.fillRect(0, S - 5, S, 5); g.fillRect(0, 0, 5, S); g.fillRect(S - 5, 0, 5, S);
    }
  }
  if (kind === 'fusumaM') {
    // 森部の襖は小判の和紙を貼り継いだ推定復元。一枚の大きな紙に見せない。
    // 障子の継ぎ目は実際に重ねた紙の端で表す。小判ごとにさらに継ぎ目を描かない。
    // 紙ごとの淡い色差と重ね代だけを共用の絵へ焼き、桟や戸板は増やさない。
    // 縦の継ぎ目は段ごとにずらし、木の格子に見える濃い線を避ける。
    const rows = 6, stepY = S / rows, stepX = S / 3;
    const opacity = .055;
    for (let row = 0; row < rows; row++) {
      const y = row * stepY, offset = row % 2 ? stepX / 2 : 0;
      for (let col = -1; col < 3; col++) {
        const x = col * stepX + offset;
        g.fillStyle = `rgba(244,234,206,${.015 + R() * .025})`;
        g.fillRect(x, y, stepX, stepY);
        if (x > 0 && x < S) {
          g.fillStyle = `rgba(92,78,53,${opacity})`; g.fillRect(x, y, 1.5, stepY);
          g.fillStyle = 'rgba(249,240,215,.08)'; g.fillRect(x + 1.5, y, 1, stepY);
        }
      }
      if (row > 0) {
        g.fillStyle = `rgba(92,78,53,${opacity})`; g.fillRect(0, y, S, 1.5);
        g.fillStyle = 'rgba(249,240,215,.08)'; g.fillRect(0, y + 1.5, S, 1);
      }
    }
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (kind === 'tatamiWeave' || kind === 'tatamiHeriWeave')
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (kind === 'villageWood') villageWoodTexture = t;
  if (kind === 'tatami' || kind === 'tatamiHeri' || kind === 'hieiTatamiCore' || kind === 'hieiShojiPaper' || kind === 'hieiFloorTimber') t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (kind === 'inabaBoard') inabaBoardPicture = t;
  if (kind === 'inabaPlaster') inabaPlasterPicture = t;
  if (kind === 'earth' || kind === 'tatami' || kind === 'tatamiHeri' || kind === 'hieiTatamiCore' || kind === 'hieiShojiPaper' || kind === 'hieiFloorTimber') t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (['heriM', 'tatamiM', 'waraM', 'earthM'].includes(kind)) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
// 天井板も床・建具と同じ木目を共有する。絵を棟ごとに作り直さない。
export function inabaBoardTexture() { return picture('inabaBoard'); }
function mat(color, kind = '') {
  const key = `${color}:${kind}`;
  if (!materials.has(key)) materials.set(key, new THREE.MeshBasicMaterial({ color,
    map: kind === 'earthM' ? (earthPicture ||= picture(kind)) : kind ? picture(kind) : null }));
  return materials.get(key);
}
function box(g, w, h, d, x, y, z, color, kind = '') {
  const m = new THREE.Mesh(shape(w, h, d), mat(color, kind)); cacheUsers.push(new WeakRef(m)); m.position.set(x, y, z); g.add(m); return m;
}
// 長押の無紋の鉄金具。外周も間仕切りと同じ原形・材質を使い、静止した束へまとめる。
export function nageshiNail(g, home, x, y, z, tilt, sideWall = false) {
  const m = box(g, home ? .044 : .065, home ? .05 : .07, home ? .008 : .012,
    x, y, z, 0x39372f);
  m.rotation.set(tilt, sideWall ? Math.PI / 2 : 0, 0, 'YXZ');
  return m;
}
// 建具の木目を材の長手へ通す。格子と枠で寸法別の原形・材質を共用する。
export function timberBox(g, w, h, d, x, y, z, color) {
  const key = `建具の枠の木目:${w}:${h}:${d}`;
  if (!shapes.has(key)) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const pos = geo.attributes.position, normal = geo.attributes.normal, uv = geo.attributes.uv;
    const sizes = [w, h, d], along = sizes.indexOf(Math.max(w, h, d));
    for (let i = 0; i < pos.count; i++) {
      const coords = [pos.getX(i), pos.getY(i), pos.getZ(i)];
      const normals = [Math.abs(normal.getX(i)), Math.abs(normal.getY(i)), Math.abs(normal.getZ(i))];
      const face = normals.indexOf(Math.max(...normals));
      const across = [0, 1, 2].find(axis => axis !== along && axis !== face)
        ?? (along + 1) % 3;
      uv.setXY(i, coords[across] / sizes[across] + .5, coords[along] / sizes[along] + .5);
    }
    shapes.set(key, geo);
  }
  const mesh = new THREE.Mesh(shapes.get(key), mat(color, 'villageWood'));
  cacheUsers.push(new WeakRef(mesh)); mesh.position.set(x, y, z); g.add(mesh);
}
// 小堂の外周丸柱。建具と同じ木地を使い、柱頭・柱脚の絞りでも木目を縦へ通す。
// 回転体の既定の縦座標は輪の番号なので、実際の高さへ直して木目の伸び縮みを避ける。
export function templeRoundPost(radius, h, color) {
  const key = '小堂の外周丸柱の木地';
  if (!shapes.has(key)) {
    const geo = new THREE.LatheGeometry([
      new THREE.Vector2(0, -.5), new THREE.Vector2(.82, -.5),
      new THREE.Vector2(1, -.42), new THREE.Vector2(1, .38),
      new THREE.Vector2(.82, .5), new THREE.Vector2(0, .5),
    ], 12);
    const pos = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setY(i, pos.getY(i) + .5);
    shapes.set(key, geo);
  }
  const post = new THREE.Mesh(shapes.get(key), mat(color, 'villageWood'));
  post.scale.set(radius, h, radius);
  cacheUsers.push(new WeakRef(post)); return post;
}
// 小堂の格間・調度と民家の竿縁天井の板。板戸の木目を共用し、上下の木目を板の長手へ通す。
export function templeCeilingBoard(w, d, color, thickness = .018) {
  const key = `天井板:${w}:${d}:${thickness}`;
  if (!shapes.has(key)) {
    const geo = new THREE.BoxGeometry(w, thickness, d);
    const pos = geo.attributes.position, normal = geo.attributes.normal, uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) if (Math.abs(normal.getY(i)) > .5)
      uv.setXY(i, (pos.getZ(i) + d / 2) / d, (pos.getX(i) + w / 2) / w);
    shapes.set(key, geo);
  }
  const mesh = new THREE.Mesh(shapes.get(key), mat(color, 'villageWood'));
  cacheUsers.push(new WeakRef(mesh)); return mesh;
}
// 内陣の調度と建具枠の木部。脚・束は縦、框・貫・天板は長手へ木目を通す。
// 同寸の形と既存の木肌を共有し、小口へ長手の木目を引き伸ばさない。
// 調度の外寸・当たり・まとめ描きは保ち、設営時だけ貼り方を用意する。
function roundVessel(g, top, bottom, h, x, y, z, color) {
  const key = `round:${top}:${bottom}:${h}`;
  if (!shapes.has(key)) shapes.set(key, new THREE.CylinderGeometry(top, bottom, h, 12));
  const m = new THREE.Mesh(shapes.get(key), mat(color));
  cacheUsers.push(new WeakRef(m)); m.position.set(x, y, z); g.add(m);
}
// 仏具の口は内側まで厚みのある輪にする。形は寸法ごとに共有し、設営時に束ねる。
function vesselRim(g, top, bottom, h, thickness, x, y, z, color) {
  const key = `仏具の口縁:${top}:${bottom}:${h}:${thickness}`;
  if (!shapes.has(key)) {
    const profile = [[bottom, -h / 2], [top, h / 2],
      [top - thickness, h / 2], [bottom - thickness, -h / 2], [bottom, -h / 2]];
    shapes.set(key, new THREE.LatheGeometry(profile.map(([r, yy]) => new THREE.Vector2(r, yy)), 12));
  }
  const m = new THREE.Mesh(shapes.get(key), mat(color));
  cacheUsers.push(new WeakRef(m)); m.position.set(x, y, z); g.add(m);
}

// 森部の建具の木組み。板間と同じ木目を長手へ通し、木口は短辺の目へ替える。
// 形は寸法ごとに一度だけ作る。固定戸・動く戸で材質と形を共有する。
function moribeTimberBox(g, w, h, d, x, y, z, color, grainAxis = null, chamfer = false) {
  const key = `森部の建具木目:${w}:${h}:${d}:${grainAxis}:${chamfer}`;
  if (!shapes.has(key)) {
    let geo;
    if (chamfer) {
      // 戸脇柱も外周柱と同じ五〜六ミリの面取りにそろえる。原形は三棟で共用する。
      const source = '森部の戸脇柱の原形';
      if (!shapes.has(source)) {
        const outline = new THREE.Shape();
        outline.moveTo(-.46, -.5);
        outline.lineTo(.46, -.5); outline.lineTo(.5, -.46);
        outline.lineTo(.5, .46); outline.lineTo(.46, .5);
        outline.lineTo(-.46, .5); outline.lineTo(-.5, .46);
        outline.lineTo(-.5, -.46); outline.closePath();
        const base = new THREE.ExtrudeGeometry(outline,
          { depth: 1, bevelEnabled: false, steps: 1, curveSegments: 1 });
        base.translate(0, 0, -.5); base.rotateX(-Math.PI / 2);
        shapes.set(source, base);
      }
      geo = shapes.get(source).clone().scale(w, h, d);
    } else geo = shape(w, h, d).clone();
    const pos = geo.attributes.position, normal = geo.attributes.normal, uv = geo.attributes.uv;
    const sizes = [w, h, d], axis = grainAxis ?? (h >= w && h >= d ? 1 : w >= d ? 0 : 2);
    const a = (axis + 1) % 3, b = (axis + 2) % 3;
    const at = (attr, i, k) => k === 0 ? attr.getX(i) : k === 1 ? attr.getY(i) : attr.getZ(i);
    for (let i = 0; i < pos.count; i++) {
      const end = Math.abs(at(normal, i, axis)) > .5;
      const across = end || Math.abs(at(normal, i, a)) < .5 ? a : b;
      const along = end ? b : axis;
      // 長い柱へ木目一枚を引き伸ばさず、外周柱と同じ実寸で縦目を通す。
      uv.setXY(i, at(pos, i, across) / (chamfer ? .3 : sizes[across]) + .5,
        at(pos, i, along) / (chamfer ? end ? .3 : 1.2 : sizes[along]) + .5);
    }
    shapes.set(key, geo);
  }
  const m = new THREE.Mesh(shapes.get(key), mat(color, 'boardsM'));
  cacheUsers.push(new WeakRef(m)); m.position.set(x, y, z); g.add(m); return m;
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
function doorTimber(g, w, h, d, x, y, z, color, grained) {
  if (!grained) return box(g, w, h, d, x, y, z, color);
  const across = w > h;
  const m = box(g, across ? h : w, across ? w : h, d, x, y, z, color, 'inabaBoard');
  if (across) m.rotation.z = Math.PI / 2;
  return m;
}
// 本堂の内陣境の舟肘木。下面の両端を削り、柱頭の大斗から桁を受ける推定形。
// 単位形を一つ共有し、外寸と面数を角材のまま室内の束へまとめる。
function inabaHallHijiki(g, length, height, width, x, y, z) {
  const key = '稲葉山本堂の舟肘木';
  if (!shapes.has(key)) {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const p = geometry.attributes.position;
    for (let i = 0; i < p.count; i++)
      if (p.getY(i) < 0) p.setX(i, p.getX(i) * .6);
    geometry.computeVertexNormals();
    // 内陣境も外周と揃え、舟肘木の長手へ木目を通す。
    const n = geometry.attributes.normal, uv = geometry.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      if (Math.abs(n.getX(i)) > .5) continue;
      uv.setXY(i, (Math.abs(n.getY(i)) > .5 ? p.getZ(i) : p.getY(i)) + .5, p.getX(i) + .5);
    }
    shapes.set(key, geometry);
  }
  const m = new THREE.Mesh(shapes.get(key), mat(0x493522, 'inabaBoard'));
  m.scale.set(length, height, width); m.rotation.y = Math.PI / 2;
  m.position.set(x, y, z); cacheUsers.push(new WeakRef(m)); g.add(m);
}

function inabaFusuma(w = .9, h = 1.8, painted = false, inaba = false) {
  const kit = painted || inaba ? null : bought('slide_door_a', w, h, .06); if (kit) return kit;
  const g = new THREE.Group();
  if (inaba) {
    // 稲葉山の座敷は角引手を落とし込む推定の納まり。紙面を実際に抜き、
    // 両面から金縁と奥の暗い底が見えるようにする。引き溝へ突き出さない。
    const x = w / 2 - .13, y = h * .47;
    const x0 = x - .03, x1 = x + .03, y0 = y - .04, y1 = y + .04;
    for (const [a, b, c, d] of [
      [-w / 2 + .03, x0, .03, h - .03],
      [x1, w / 2 - .03, .03, h - .03],
      [x0, x1, .03, y0], [x0, x1, y1, h - .03],
    ]) {
      const key = `襖の紙面:${w}:${h}:${a}:${b}:${c}:${d}:${S.quality}`;
      if (!shapes.has(key)) {
        const geo = shape(b - a, d - c, S.quality === 'high' ? .002 : .035).clone();
        const pos = geo.attributes.position, uv = geo.attributes.uv, normal = geo.attributes.normal;
        // 引手の穴で分けても絵柄を引き伸ばさず、一枚の紙としてつなぐ。
        for (let j = 0; j < pos.count; j++) {
          const u = (pos.getX(j) + (a + b) / 2 + w / 2 - .03) / (w - .06);
          uv.setXY(j, normal.getZ(j) < 0 ? 1 - u : u,
            (pos.getY(j) + (c + d) / 2 - .03) / (h - .06));
        }
        shapes.set(key, geo);
      }
      // 高画質の襖は厚い紙の塊にせず、組子の両面へ薄い紙を張る推定の造り。
      // 表裏で形と絵を共有し、引手の穴と既存の外寸を保つ。
      for (const z of S.quality === 'high' ? [-.0165, .0165] : [0]) {
        const paper = new THREE.Mesh(shapes.get(key), mat(0xffffff, S.quality === 'high' ? (painted ? 'fusumaPaperInaba' : 'fusumaPlainInaba') : 'fusuma'));
        paper.position.set((a + b) / 2, (c + d) / 2, z);
        cacheUsers.push(new WeakRef(paper)); g.add(paper);
      }
    }
    if (S.quality === 'high') {
      // 紙だけを二枚浮かせず、框の内側に下地骨と引手の力板を納める推定。
      // 縦横は厚みを半分ずつに分け、引手の窪みを骨で塞がない。
      // 紙面の内側で止め、固定襖・動く襖とも既存の形と材質の束へまとめる。
      const left = -w / 2 + .03, right = w / 2 - .03;
      const cols = Math.max(2, Math.round((right - left) / .18));
      const rows = Math.max(3, Math.round((h - .06) / .2));
      for (let j = 1; j < cols; j++) {
        const xx = left + (right - left) * j / cols;
        const cut = xx > x0 - .012 && xx < x1 + .012;
        if (cut) {
          box(g, .012, y0 - .03, .012, xx, (y0 + .03) / 2, -.006, 0x9b8057);
          box(g, .012, h - .03 - y1, .012, xx, (h - .03 + y1) / 2, -.006, 0x9b8057);
        } else box(g, .012, h - .06, .012, xx, h / 2, -.006, 0x9b8057);
      }
      for (let j = 1; j < rows; j++) {
        const yy = .03 + (h - .06) * j / rows;
        if (yy > y0 - .012 && yy < y1 + .012) {
          box(g, x0 - left, .012, .012, (left + x0) / 2, yy, .006, 0x9b8057);
          box(g, right - x1, .012, .012, (right + x1) / 2, yy, .006, 0x9b8057);
        } else box(g, right - left, .012, .012, 0, yy, .006, 0x9b8057);
      }
      // 引手は薄紙へ直接付けず、穴の周囲の力板で受ける。
      for (const xx of [x0 - .012, x1 + .012])
        box(g, .02, .12, .03, xx, y, 0, 0x9b8057);
      for (const yy of [y0 - .012, y1 + .012])
        box(g, .064, .02, .03, x, yy, 0, 0x9b8057);
    }
    box(g, .06, .08, .004, x, y, 0, 0x211b15);
    for (const xx of [x0, x1]) box(g, .004, .08, .035, xx, y, 0, 0x493b28);
    for (const yy of [y0, y1]) box(g, .06, .004, .035, x, yy, 0, 0x493b28);
    for (const side of [-1, 1]) {
      for (const xx of [x0, x1]) box(g, .008, .088, .004, xx, y, side * .019, 0x66553a);
      for (const yy of [y0, y1]) box(g, .068, .008, .004, x, yy, side * .019, 0x66553a);
      if (S.quality === 'high') {
        // 角引手の縁は、上下の小釘で下地の力板へ留める推定の納まり。
        // 紙面へ金縁を貼っただけにせず、表裏とも同じ取付けを見せる。
        // 縁の厚み内へ釘頭を納め、戸の溝・開閉・当たりは変えない。
        // 固定襖と動く襖で箱と材質を共有し、既存の束へ設営時だけまとめる。
        for (const yy of [y0, y1]) {
          box(g, .005, .005, .001, x, yy, side * .0215, 0x39352d);
          box(g, .003, .0008, .0004, x, yy, side * .0222, 0x211b15);
        }
      }
    }
  } else box(g, w - .06, h - .06, .035, 0, h / 2, 0, 0xffffff, 'fusuma');
  inabaFrame(g, w, h, 0x32271c, false, inaba && S.quality === 'high');
  if (!inaba) box(g, .06, .08, .055, w / 2 - .13, .85, 0, 0x66553a);
  return g;
}
function inabaFrame(g, w, h, color, recessedHandle = false, fittedCorners = recessedHandle, grained = false) {
  // 稲葉山の木地の障子・板戸は、鏡板や組子だけでなく框にも木目を通す。
  // 横框は横、縦框と引手の木口は縦に揃え、漆塗りの襖・格子戸は従来の仕上げを使う。
  // 既存の板目と箱を共有し、引手の窪み・溝・戸の外寸は変えない。
  const throughTenons = fittedCorners && S.quality === 'high';
  for (const y of [.02, h - .02]) {
    if (!throughTenons) {
      doorTimber(g, w, .04, .06, 0, y, 0, color, grained);
      continue;
    }
    // 襖・格子戸の塗り框も、木地の障子・板戸と同じ通しほぞで組む推定。
    // 塗り框だけ四隅を突き付けにせず、仕上げは既存の漆色で揃える。
    // 込栓だけを付けた突き付けにせず、横框の芯を欠いて縦目の木口を出す。
    // 表裏の頬とほぞを重ねず、共通の箱・木目を設営時の束へまとめる。
    for (const z of [-.02, .02])
      doorTimber(g, w, .04, .02, 0, y, z, color, grained);
    for (const [left, right] of [
      [-w / 2, -w / 2 + .01], [-w / 2 + .03, w / 2 - .03], [w / 2 - .01, w / 2],
    ]) {
      const core = box(g, .04, right - left, .02, (left + right) / 2, y, 0, color, grained ? 'inabaBoard' : '');
      core.rotation.z = Math.PI / 2;
    }
    for (const x of [-w / 2 + .02, w / 2 - .02])
      box(g, .02, .04, .02, x, y, 0, color, grained ? 'inabaBoard' : '');
  }
  if (fittedCorners && S.quality === 'high') {
    // 稲葉山の引き戸は框の上下を細くして、敷居・鴨居の溝へ掛ける推定の納まり。
    // 框の端を溝の面へ接するだけにせず、下は五ミリ、上は八ミリ差し込む。
    // 動く戸の拡縮後も、既存の幅六十四ミリ・深さ八／二十ミリの溝内へ収める。
    // 固定戸と動く戸で形・材質を共有し、戸口の幅や開閉中の処理は変えない。
    for (const [height, y] of [[.005, -.0025], [.008, h + .004]])
      doorTimber(g, w - .08, height, .04, 0, y, 0, color, grained);
  }
  // 稲葉山の建具は縦框を上下の横框の内側で止める推定の納まり。
  // 四隅で同じ面を重ねず、近くで見た時のちらつきを防ぐ。
  // 固定戸と動く戸で共有し、外寸・引手・引き溝は同じにする。
  const inset = fittedCorners ? .04 : 0;
  for (const x of [-w / 2 + .02, w / 2 - .02]) {
    if (!recessedHandle || x < 0) { doorTimber(g, .04, h - inset * 2, .06, x, h / 2, 0, color, grained); continue; }
    // 引手を貼るだけにせず、召し合わせ框の両面を九ミリ掘り込む推定の納まり。
    // 上下と左右の木口を残し、底板は二つの窪みの間に通す。
    // 固定戸・動く戸とも同じ箱の形を共有し、設営時に既存の束へまとめる。
    const endH = (h - inset * 2 - .09) / 2;
    for (const y of [inset + endH / 2, h - inset - endH / 2]) doorTimber(g, .04, endH, .06, x, y, 0, color, grained);
    for (const side of [-1, 1]) doorTimber(g, .009, .09, .06, x + side * .0155, h / 2, 0, color, grained);
    doorTimber(g, .022, .09, .04, x, h / 2, 0, color, grained);
  }
  if (throughTenons) {
    // 稲葉山の建具は、框のほぞを留める込栓を両面へ納める推定。
    // 襖・格子戸の栓も漆で仕上げ、木地用の明るい木口を塗り框へ持ち込まない。
    // 横框の厚み内へ木口だけを出し、引き溝・引手・紙面には張り出さない。
    // 共通の箱と既存の材質を使い、固定戸も可動戸も設営時にまとめる。
    for (const x of [-w / 2 + .02, w / 2 - .02])
      for (const y of [.02, h - .02]) for (const side of [-1, 1])
        box(g, .01, .01, .002, x, y, side * .0305, grained ? 0x493b28 : 0x19120d);
  }
}
function inabaShoji(w = .9, h = 1.8, inaba = false, reversePaper = false) {
  if (inaba) {
    // 稲葉山の腰付障子の推定。桟を紙の絵にせず、斜めからも厚みのある組子にする。
    // 動く戸と固定の障子に同じ形を使い、結合後の材質と形は使い回す。
    const g = new THREE.Group(), bottom = h * (.28 / 1.8);
    const paperH = h - bottom - .04, paperW = w - .08;
    // 障子紙は組子の片面へ貼る。中央へ埋めて両面に組子を露出させない。
    // 右戸は半回転しても紙の面が揃うよう、貼る側を先に反転する。
    const thinPaper = S.quality === 'high';
    // 高画質の稲葉山では紙の四辺に一センチの糊代を取り、框と腰貫の裏へ納める。
    // 開口ぴったりの紙を木口へ突き付けず、斜めから見ても端が離れて見えないようにする。
    // 固定障子と動く障子で共有し、組子・戸の外寸・引き溝は保つ。
    const paperLap = thinPaper ? .01 : 0;
    box(g, paperW + paperLap * 2, paperH + paperLap * 2, thinPaper ? .002 : .012, 0, bottom + paperH / 2,
      thinPaper ? (reversePaper ? .019 : -.019) : 0, 0xffffff, thinPaper ? 'shojiPaperInaba' : 'shojiPaper');
    if (S.quality === 'high') {
      // 腰板も一枚色の塊にせず、框の内側へ薄い縦板を納める推定の造り。
      // 板の目地の奥には暗い下地を残し、開けた障子の両面から板割りが見える。
      // 固定障子・動く障子で共通の箱と材質を使い、六センチの框から出さない。
      // 腰板の四辺を框と腰貫の溝へ五ミリ差し込む推定の納まり。
      // 木口を突き付けただけの面にせず、逆光でも板端から光を漏らさない。
      // 固定障子と動く戸に同じ部品を使い、外寸・引き溝・当たりは保つ。
      const lap = .005;
      const panelW = w - .08 + lap * 2, panelBottom = .04 - lap, panelTop = bottom - .0225 + lap;
      const panelH = panelTop - panelBottom;
      const boards = Math.max(2, Math.round(panelW / .24)), boardW = panelW / boards;
      box(g, panelW, panelH, .018, 0, (panelBottom + panelTop) / 2, 0, 0x493522);
      for (let j = 0; j < boards; j++) {
        const x = -panelW / 2 + (j + .5) * boardW;
        const color = j % 3 === 0 ? 0x795b3b : j % 3 === 1 ? 0x725539 : 0x806143;
        // 腰板にも縦の板目を通す。板床と同じ絵を共有し、戸の形は増やさない。
        for (const side of [-1, 1])
          box(g, boardW - .004, panelH, .006, x,
            (panelBottom + panelTop) / 2, side * .012, color, 'inabaBoard');
      }
    } else box(g, w - .06, bottom, .03, 0, bottom / 2, 0, 0x795b3b);
    inabaFrame(g, w, h, 0x795b3b, S.quality === 'high', S.quality === 'high', S.quality === 'high');
    if (thinPaper) {
      // 腰貫の見付けを縦框へ食い込ませず、内面で止める推定の仕口。
      // 薄いほぞだけを五ミリ差し、框の両面の込栓で受ける。
      // 固定障子・可動戸とも同じ形を使い、紙・腰板・引き溝の位置は保つ。
      doorTimber(g, paperW, .045, .045, 0, bottom, 0, 0x795b3b, true);
      for (const side of [-1, 1]) {
        doorTimber(g, .005, .025, .025, side * (paperW / 2 + .0025),
          bottom, 0, 0x795b3b, true);
        for (const face of [-1, 1])
          box(g, .008, .008, .001, side * (paperW / 2 + .003),
            bottom, face * .0305, 0x493b28);
      }
    } else doorTimber(g, w - .06, .045, .045, 0, bottom, 0, 0x795b3b, false);
    const cols = Math.max(2, Math.round(paperW / .22));
    const rows = Math.max(3, Math.round(paperH / .25));
    if (thinPaper) {
      // 障子紙は大きな一枚板にせず、二升ごとに継いだ重ね張りを推定する。
      // 糊代は組子の裏へ揃え、紙側だけに薄い重なりを見せる。
      // 右戸は紙と同じ側へ反転し、固定障子・可動戸で形と材質を共有する。
      const paperSide = reversePaper ? 1 : -1;
      const seamZ = paperSide * .0205, seamW = .012;
      for (let j = 2; j < cols; j += 2)
        box(g, seamW, paperH + paperLap * 2, .001,
          -paperW / 2 + paperW * j / cols, bottom + paperH / 2,
          seamZ, 0xe8e1ce, 'shojiPaperInaba');
      for (let j = 2; j < rows; j += 2) {
        // 縦の糊代との交点は一段外へ重ね、同じ面のちらつきを避ける。
        box(g, paperW + paperLap * 2, seamW, .001,
          0, bottom + paperH * j / rows, seamZ + paperSide * .001,
          0xe8e1ce, 'shojiPaperInaba');
      }
      // 組子の交点は厚みを半分ずつ欠いた相欠きの推定復元。
      // 縦横の角材を貫通させたり、片方の表面だけ控えたりせず、両面を面一にする。
      // 紙に接する裏半分は縦、表半分は横を通し、残る半分を交点で止める。
      // 同寸の箱と木目を共有し、固定・可動の障子とも設営時に既存の束へまとめる。
      // 右戸は紙と一緒に組子の表裏も反転する。紙だけ反転すると、
      // 建て込んだ左右の戸で相欠きの表裏が逆になり、横組子が紙側へ回る。
      // 固定障子・動く障子で同じ納まりを使い、形と材質は共有する。
      const face = reversePaper ? -1 : 1;
      const dx = paperW / cols, dy = paperH / rows;
      for (let j = 1; j < cols; j++) {
        const x = -paperW / 2 + dx * j;
        doorTimber(g, .018, paperH + .005, .018, x, bottom + (paperH + .005) / 2, -.009 * face, 0x795b3b, true);
        for (let k = 0; k < rows; k++) {
          const a = bottom + dy * k + (k > 0 ? .0075 : 0);
          const b = bottom + dy * (k + 1) - (k + 1 < rows ? .0075 : -.005);
          doorTimber(g, .018, b - a, .018, x, (a + b) / 2, .009 * face, 0x795b3b, true);
        }
      }
      for (let j = 1; j < rows; j++) {
        const y = bottom + dy * j;
        // 横組子の両端は縦框へ五ミリ差し込む推定の納まり。
        // 上端の縦組子も上框へ掛け、框の内面へ接するだけにしない。
        // 紙の寸法・戸の外寸・引き溝は保ち、既存の共通形へまとめる。
        doorTimber(g, paperW + .01, .015, .018, 0, y, .009 * face, 0x795b3b, true);
        for (let k = 0; k < cols; k++) {
          const a = -paperW / 2 + dx * k + (k > 0 ? .009 : -.005);
          const b = -paperW / 2 + dx * (k + 1) - (k + 1 < cols ? .009 : -.005);
          doorTimber(g, b - a, .015, .018, (a + b) / 2, y, -.009 * face, 0x795b3b, true);
        }
      }
    } else {
      for (let j = 1; j < cols; j++)
        doorTimber(g, .018, paperH, .036, -paperW / 2 + paperW * j / cols, bottom + paperH / 2, 0, 0x795b3b, false);
      for (let j = 1; j < rows; j++)
        doorTimber(g, paperW, .015, .036, 0, bottom + paperH * j / rows, 0, 0x795b3b, false);
    }
    // 引手は召し合わせの縦框へ彫り込む。両面に納め、引き違いの溝へ突き出さない。
    for (const z of S.quality === 'high' ? [-.021, .021] : [-.031, .031])
      box(g, .022, .09, .002, w / 2 - .02, h * .5, z, 0x493522);
    return g;
  }
  const kit = bought('slide_door_c', w, h, .06); if (kit) return kit;
  const g = new THREE.Group(); box(g, w - .04, h - .04, .025, 0, h / 2, 0, 0xffffff, 'shoji'); inabaFrame(g, w, h, 0x795b3b); return g;
}
function villageFusuma(w = .9, h = 1.8, painted = false, plain = false, villagePlain = false) {
  const g = new THREE.Group();
  // 集落の民家は金砂子や松の絵を入れず、無地の紙と木地の縁で復元する。
  if (!plain) box(g, w - .06, h - .06, .035, 0, h / 2, 0, 0xffffff, 'fusuma');
  if (plain && S.quality === 'high') {
    // 設楽原の無地襖は木地の縁。横框は横、竪框は縦へ木目を通す。
    // 隅は横框の内面で止め、紙・引手の厚みと戸の滑る外寸は保つ。
    // 障子と同じ原形・材質の仕組みを使い、固定襖と動く襖で共有する。
    for (const y of [.02, h - .02])
      timberBox(g, w, .04, .06, 0, y, 0, 0x32271c);
    for (const x of [-w / 2 + .02, w / 2 - .02])
      timberBox(g, .04, h - .08, .06, x, h / 2, 0, 0x32271c);
  } else villageFrame(g, w, h, 0x32271c);
  if (plain) {
    // 紙の上の突起で代用せず、表裏に指を掛ける窪みと薄い口縁を付ける。
    const x = w / 2 - .13, y = Math.min(.85, h * .5);
    // 襖は厚い紙板にせず、木の下地の両面へ薄い和紙を張る。
    // 引手の口を四方で抜き、縁と口の見込みだけで厚みを受ける。
    // 固定の襖と動く襖で原形・材質を共有し、設営時に一度だけ束ねる。
    const left = -w / 2 + .03, right = w / 2 - .03;
    const x0 = x - .0275, x1 = x + .0275, y0 = y - .0375, y1 = y + .0375;
    // 高画質の襖紙も障子と同じ薄さにする。下地との離れは保ち、
    // 引手の切り口を二ミリ厚の板にしない。紙の継ぎ代も新しい表面へ沿わせる。
    const paperThickness = S.quality === 'high' ? .0008 : .002;
    const paperBack = .0155, paperFront = paperBack + paperThickness;
    // 引手の周囲と貼り継ぎにも同じ紙目を通す。紙片ごとに絵全体を
    // 縮めると、細い帯だけ繊維や補修跡が潰れる。戸の座標と実寸で貼る。
    // 同寸・同位置の原形は表裏・固定襖・動く襖で共有する。
    const paperPatch = (a, b, c, d, depth, surface, color) => {
      const mesh = box(g, b - a, d - c, depth, (a + b) / 2,
        (c + d) / 2, surface, color, 'washi');
      if (S.quality !== 'high') return;
      const key = `民家の襖紙:${w}:${a}:${b}:${c}:${d}:${depth}`;
      if (!shapes.has(key)) {
        const geo = mesh.geometry.clone(), pos = geo.attributes.position, uv = geo.attributes.uv;
        for (let i = 0; i < pos.count; i++) uv.setXY(i,
          (pos.getX(i) + (a + b) / 2 + w / 2) / .9,
          (pos.getY(i) + (c + d) / 2) / 1.8);
        shapes.set(key, geo);
      }
      mesh.geometry = shapes.get(key);
    };
    for (const [a, b, c, d] of [[left, x0, .03, h - .03], [x1, right, .03, h - .03],
      [x0, x1, .03, y0], [x0, x1, y1, h - .03]])
      for (const side of [-1, 1])
        paperPatch(a, b, c, d, paperThickness,
          side * (paperBack + paperThickness / 2), 0xc5bba0);
    if (S.quality === 'high') {
      // 民家の襖紙は小さな紙を継いだ推定の姿。八ミリの重ね代を両面に残す。
      // 引手の口は抜き、縁の内面で止める。原形を作る時だけ既存の束へまとめる。
      const patches = [[left, x0, .03, h - .03], [x1, right, .03, h - .03],
        [x0, x1, .03, y0], [x0, x1, y1, h - .03]];
      const seam = (a, b, c, d, surface) => {
        for (const [pa, pb, pc, pd] of patches) {
          const l = Math.max(a, pa), r = Math.min(b, pb);
          const low = Math.max(c, pc), high = Math.min(d, pd);
          if (r <= l || high <= low) continue;
          for (const side of [-1, 1])
            paperPatch(l, r, low, high, .0005, side * surface, 0xbfb59b);
        }
      };
      const cols = Math.max(1, Math.ceil((right - left) / .3));
      const rows = Math.max(1, Math.ceil((h - .06) / .45));
      for (let i = 1; i < cols; i++) {
        const xx = left + (right - left) * i / cols;
        seam(xx - .004, xx + .004, .03, h - .03, paperFront + .00025);
      }
      for (let i = 1; i < rows; i++) {
        const yy = .03 + (h - .06) * i / rows;
        // 横の継ぎ代は紙面で受け、縦の継ぎ代と交わる所だけ一枚分持ち上げる。
        // 全幅を高くすると、交点以外の下に光が通る隙間が残る。
        for (let j = 0; j < cols; j++) {
          const a = left + (right - left) * j / cols;
          const b = left + (right - left) * (j + 1) / cols;
          seam(a + (j ? .004 : 0), b - (j + 1 < cols ? .004 : 0),
            yy - .004, yy + .004, paperFront + .00025);
          if (j + 1 < cols) seam(b - .004, b + .004,
            yy - .004, yy + .004, paperFront + .00075);
        }
      }
    }
    // 下地の骨は縁の内側へ納め、紙の表へ突き出させない。
    for (const xx of [left + .015, right - .015])
      box(g, .03, h - .08, .03, xx, h / 2, 0, 0x795b3b);
    for (const yy of [.055, h - .055])
      box(g, w - .12, .03, .03, 0, yy, 0, 0x795b3b);
    // 無地の襖も周囲の縁だけで紙を支えず、内側に組子の下地を組む推定復元。
    // 骨は両面の紙より薄くし、引手の口と、その四周の受け木を避ける。
    // 寸法ごとの原形に一度だけ組み込み、固定の襖と滑る襖で共有する。
    const boneLeft = left + .03, boneRight = right - .03;
    const boneBottom = .07, boneTop = h - .07, boneW = .012;
    const nx = Math.max(2, Math.round((boneRight - boneLeft) / .3));
    const ny = Math.max(2, Math.round((boneTop - boneBottom) / .3));
    // 高画質の無地襖は、障子と同じく縦横の骨を半分ずつ欠いて組む推定の下地。
    // 縦骨の表半分と横骨の裏半分を通し、残り半分だけ交点で欠く。
    // 引手を受ける四周の木は両面とも避け、紙の間の厚みと戸の外寸は保つ。
    const lap = S.quality === 'high';
    const verticalBone = (xx, a, b, depth, zz) => {
      const pieces = Math.abs(xx - x) < .0535
        ? [[a, Math.min(b, y - .0575)], [Math.max(a, y + .0575), b]] : [[a, b]];
      for (const [low, high] of pieces) if (high > low)
        box(g, boneW, high - low, depth, xx, (low + high) / 2, zz, 0x795b3b);
    };
    const horizontalBone = (yy, a, b, depth, zz) => {
      const pieces = Math.abs(yy - y) < .0635
        ? [[a, Math.min(b, x0 - .02)], [Math.max(a, x1 + .02), b]] : [[a, b]];
      for (const [left, right] of pieces) if (right > left)
        box(g, right - left, boneW, depth, (left + right) / 2, yy, zz, 0x795b3b);
    };
    for (let i = 1; i < nx; i++) {
      const xx = boneLeft + (boneRight - boneLeft) * i / nx;
      verticalBone(xx, boneBottom, boneTop, lap ? .009 : .018, lap ? .0045 : 0);
      if (lap) {
        let bottom = boneBottom;
        for (let j = 1; j < ny; j++) {
          const yy = boneBottom + (boneTop - boneBottom) * j / ny;
          verticalBone(xx, bottom, yy - boneW / 2, .009, -.0045);
          bottom = yy + boneW / 2;
        }
        verticalBone(xx, bottom, boneTop, .009, -.0045);
      }
    }
    for (let j = 1; j < ny; j++) {
      const yy = boneBottom + (boneTop - boneBottom) * j / ny;
      if (lap) horizontalBone(yy, boneLeft, boneRight, .009, -.0045);
      for (let i = 0; i < nx; i++) {
        const a = boneLeft + (boneRight - boneLeft) * i / nx + (i ? boneW / 2 : 0);
        const b = boneLeft + (boneRight - boneLeft) * (i + 1) / nx - (i < nx - 1 ? boneW / 2 : 0);
        horizontalBone(yy, a, b, lap ? .009 : .018, lap ? .0045 : 0);
      }
    }
    // 引手の四周にも骨を回し、薄い紙の切り口を宙に残さない。
    for (const xx of [x0 - .01, x1 + .01])
      box(g, .02, .115, .03, xx, y, 0, 0x795b3b);
    for (const yy of [y0 - .01, y1 + .01])
      box(g, .055, .02, .03, x, yy, 0, 0x795b3b);
    box(g, .055, .075, .02, x, y, 0, 0x211a14);
    for (const side of [-1, 1]) {
      // 窪みの底を紙面より奥へ置き、上下左右の見込みで口縁へつなぐ。
      for (const dx of [-.027, .027]) box(g, .001, .075, .0075, x + dx, y, side * .01375, 0x493725);
      for (const dy of [-.037, .037]) box(g, .055, .001, .0075, x, y + dy, side * .01375, 0x493725);
      for (const dx of [-.031, .031]) box(g, .007, .089, .006, x + dx, y, side * .0205, 0x66553a);
      for (const dy of [-.041, .041]) box(g, .069, .007, .006, x, y + dy, side * .0205, 0x66553a);
    }
  } else box(g, .06, .08, .055, w / 2 - .13, .85, 0, 0x66553a);
  return g;
}
function villageFrame(g, w, h, color, fitted = false, gripY = null) {
  for (const y of [.02, h - .02]) box(g, w, .04, .06, 0, y, 0, color);
  // 設楽原の建具は竪框を上下の横框の内側へ納める。
  // 同じ厚みの木を隅で重ねると、表裏の面がちらついて継ぎ目も消える。
  for (const x of [-w / 2 + .02, w / 2 - .02]) box(g, .04, h - (fitted ? .08 : 0), .06, x, h / 2, 0, color);
}
// 指掛けの裏まで紙や鏡板で塞がない。口に重なる所だけ抜き、框への貼り代は残す。
// 左右の原形を作る時だけ分割し、既存の形・材質の束へまとめる。
function gripPanel(g, w, h, depth, z, color, kind, gripX, bottom = .03) {
  const left = -w / 2, right = w / 2, top = h - .03;
  const x0 = Math.max(left, gripX - .012), x1 = Math.min(right, gripX + .012);
  const y = Math.min(.85, h * .5), y0 = y - .06, y1 = y + .06;
  for (const [a, b, c, d] of [[left, x0, bottom, top], [x1, right, bottom, top],
    [x0, x1, bottom, y0], [x0, x1, y1, top]]) {
    if (b > a && d > c) box(g, b - a, d - c, depth, (a + b) / 2, (c + d) / 2, z, color, kind);
  }
}
function villageShoji(w = .9, h = 1.8, kumiko = false, right = false, waist = false, grain = false) {
  const kit = kumiko ? null : bought('slide_door_c', w, h, .06); if (kit) return kit;
  const g = new THREE.Group();
  // 設楽原は組子の片面へ薄い紙を貼る。中央に厚い紙板を挟むと、
  // 木が紙を貫いて両面へ突き出し、裏からも組子の絵が二重に見えてしまう。
  // 紙の表を組子の裏面へ合わせ、固定の障子と動く戸で同じ部品を使う。
  // 設楽原の土間境は腰板付き障子で推定復元。足元まで紙と組子だけにせず、
  // 上の採光部と下の杉板を分ける。固定の建具と滑る戸で同じ原形を使う。
  const waistTop = kumiko && waist ? h / 6 : .02;
  // 設楽原の紙は五ミリ厚の板にせず、組子の裏へ薄く張る。
  // 木へ接する面は保ち、指掛けと紙の木口にも薄さを残す。
  const thinPaper = grain && S.quality === 'high';
  const paperThickness = thinPaper ? .0008 : .005;
  const paperBack = -.025 - paperThickness;
  if (kumiko) gripPanel(g, w - .04, h, paperThickness, -.025 - paperThickness / 2, 0xffffff, 'washi',
    (right ? -1 : 1) * (w / 2 - .02), waist ? waistTop + .02 : .03);
  else box(g, w - .04, h - .04, .025, 0, h / 2, 0, 0xffffff, 'shoji');
  if (kumiko && grain && S.quality === 'high') {
    // 設楽原の明かり障子も、小さな和紙を重ねて張る推定の仕上げ。
    // 紙側だけに八ミリの継ぎ代を残し、組子側へ紙を突き出さない。
    // 引手の切り口は元の紙と同じ範囲で抜く。設営時に既存の建具へ束ねる。
    const left = -w / 2 + .02, rightEdge = w / 2 - .02;
    const bottom = waist ? waistTop + .02 : .03, top = h - .03;
    const gripX = (right ? -1 : 1) * (w / 2 - .02);
    const gripY = Math.min(.85, h * .5);
    const patches = [[left, gripX - .012, bottom, top],
      [gripX + .012, rightEdge, bottom, top],
      [gripX - .012, gripX + .012, bottom, gripY - .06],
      [gripX - .012, gripX + .012, gripY + .06, top]];
    const seam = (x0, x1, y0, y1, z) => {
      for (const [a, b, c, d] of patches) {
        const l = Math.max(left, x0, a), r = Math.min(rightEdge, x1, b);
        const low = Math.max(bottom, y0, c), high = Math.min(top, y1, d);
        if (r > l && high > low)
          box(g, r - l, high - low, .0002, (l + r) / 2, (low + high) / 2,
            z, 0xe6dfcd, 'washi');
      }
    };
    const cols = Math.max(1, Math.ceil((rightEdge - left) / .3));
    const rows = Math.max(1, Math.ceil((top - bottom) / .45));
    for (let i = 1; i < cols; i++) {
      const x = left + (rightEdge - left) * i / cols;
      seam(x - .004, x + .004, bottom, top, paperBack - .0001);
    }
    for (let i = 1; i < rows; i++) {
      const y = bottom + (top - bottom) * i / rows;
      seam(left, rightEdge, y - .004, y + .004, paperBack - .0003);
    }
  }
  if (kumiko) {
    // 設楽原の框と組子にも長手の木目を通す。紙・腰板と指掛けの寸法は共用する。
    // 固定障子と滑る障子で同じ材を使い、原形・絵は設営時だけ用意する。
    const timber = grain ? timberBox : box;
    // 紙を押して開ける姿にせず、召し合わせの縦框に表裏から指を掛ける溝を切る。
    // 溝の底は框の表面から一センチ下げ、上下の木と細い両縁を残す。
    // 右戸も紙は組子の同じ側。戸全体を裏返さず、指掛けを彫る縦框だけ左右で替える。
    const gripY = Math.min(.85, h * .5), gripH = .12, stileX = (right ? -1 : 1) * (w / 2 - .02);
    for (const yy of [.02, h - .02]) timber(g, w, .04, .06, 0, yy, 0, 0x795b3b);
    timber(g, .04, h - .08, .06, -stileX, h / 2, 0, 0x795b3b);
    const lower = gripY - gripH / 2, upper = gripY + gripH / 2;
    timber(g, .04, lower - .04, .06, stileX, (lower + .04) / 2, 0, 0x795b3b);
    timber(g, .04, h - .04 - upper, .06, stileX, (h - .04 + upper) / 2, 0, 0x795b3b);
    for (const dx of [-.016, .016]) timber(g, .008, gripH, .06, stileX + dx, gripY, 0, 0x795b3b);
    timber(g, .024, gripH, .04, stileX, gripY, 0, 0x493725);
    // 設楽原の障子は紙に描いた線だけにせず、框の間へ木の組子を組む。
    // 縦四つ・横六つの割付。紙の前に木を納め、固定の障子と滑る戸で形・材質を共有する。
    const iw = w - .04, ih = h - .02 - waistTop;
    // 高画質の設楽原は交点を相欠きにする推定の納まり。
    // 横木を縦木の脇へ突き付けるだけにせず、半分ずつ欠いて組み合わせる。
    // 戸の厚みと紙の面は保ち、原形を作る時だけ同じ木材の束へ納める。
    const lap = grain && S.quality === 'high';
    for (let j = 1; j < 4; j++) {
      const x = -iw / 2 + iw * j / 4;
      if (!lap) {
        timber(g, .016, ih - .04, .05, x, waistTop + ih / 2, 0, 0x795b3b);
        continue;
      }
      timber(g, .016, ih - .04, .025, x, waistTop + ih / 2, .0125, 0x795b3b);
      let bottom = waistTop + .02;
      for (let row = 1; row < 6; row++) {
        const y = waistTop + ih * row / 6, low = y - .007, high = y + .007;
        timber(g, .016, low - bottom, .025, x, (bottom + low) / 2, -.0125, 0x795b3b);
        bottom = high;
      }
      timber(g, .016, h - .04 - bottom, .025, x, (bottom + h - .04) / 2, -.0125, 0x795b3b);
    }
    // 横組子の紙側は交点を通し、表側だけを縦組子の内面で切る。
    // 両端も縦框の内面で止める。紙の位置・戸の寸法・滑る溝は共通のまま使う。
    // 設楽原の障子の原形を作る時だけ割り、既存の束へまとめる。
    if (lap) for (let j = 1; j < 6; j++)
      timber(g, iw - .04, .014, .025, 0, waistTop + ih * j / 6, -.0125, 0x795b3b);
    for (let j = 1; j < 6; j++) for (let bay = 0; bay < 4; bay++) {
      const left = -iw / 2 + iw * bay / 4 + (bay === 0 ? .02 : .008);
      const right = -iw / 2 + iw * (bay + 1) / 4 - (bay === 3 ? .02 : .008);
      timber(g, right - left, .014, lap ? .025 : .05, (left + right) / 2,
        waistTop + ih * j / 6, lap ? .0125 : 0, 0x795b3b);
    }
    if (waist) {
      // 腰板は三枚を框と中桟の内面へ納める推定の作り。表へ棒を貼って目地を表さない。
      // 薄い裏板を残した三ミリの継ぎ目で、土間側からも板の厚みが見えるようにする。
      // 原形と材質は既存の束へまとめ、動く戸の外寸・溝・当たりを保つ。
      const innerW = w - .08, joint = .003, low = .04, high = waistTop - .02;
      box(g, innerW, high - low, .009, 0, (low + high) / 2, 0, 0x59412b);
      for (let j = 0; j < 3; j++) {
        const left = -innerW / 2 + innerW * j / 3 + (j ? joint / 2 : 0);
        const right = -innerW / 2 + innerW * (j + 1) / 3 - (j < 2 ? joint / 2 : 0);
        for (const side of [-1, 1]) {
          const color = j % 2 ? 0x826344 : 0x8a6a48;
          if (grain && S.quality === 'high') {
            // 腰板は縦に接いだ杉板。箱の面ごとに異なる絵の向きを使わず、
            // 天井板と共用の原形を立て、表裏の木目を板の長手へ揃える。
            // 厚み・目地・裏桟との位置は保ち、固定障子と滑る戸で共用する。
            const board = templeCeilingBoard(high - low, right - left, color, .008);
            board.rotation.set(0, Math.PI / 2, Math.PI / 2);
            board.position.set((left + right) / 2, (low + high) / 2, side * .0085);
            g.add(board);
          } else box(g, right - left, high - low, .008, (left + right) / 2,
            (low + high) / 2, side * .0085, color, 'villageWood');
        }
      }
      // 腰板の三枚接ぎは裏桟で束ねる推定復元。板戸と同じく片面だけに付け、
      // 縦板の裏面へ接して框の見込み内に収める。左右の戸も裏桟の面を揃える。
      // 原形・材質は共用し、引違いの溝や戸の当たりを広げない。
      if (grain) for (const fraction of [1 / 3, 2 / 3]) {
        const yy = low + (high - low) * fraction;
        timber(g, innerW, .025, .012, 0, yy,
          -.0185, 0x59412b);
        // 腰板の三枚それぞれを裏桟へ留める推定の釘頭。
        // 桟の裏面へ接し、框の見込み内に納めて引違いの相方へ触れさせない。
        // 固定障子と動く障子で箱・材質を共用し、既存の建具の束へまとめる。
        for (let j = 0; j < 3; j++)
          box(g, .01, .01, .002, -innerW / 2 + innerW * (j + .5) / 3,
            yy, -.0255, 0x39362e);
      }
      timber(g, innerW, .04, .06, 0, waistTop, 0, 0x795b3b);
    }
  } else villageFrame(g, w, h, 0x795b3b);
  return g;
}
function villageItado(w = .9, h = 1.8, village = false, rightHand = false) {
  const g = new THREE.Group();
  if (!village) box(g, w - .06, h - .06, .03, 0, h / 2, 0, 0x4a3828);
  if (village) {
    // 入口の框と裏桟も木地を見せる。縦框は縦、横桟は横へ木目を通し、
    // 同じ寸法の原形と材質を共用する。引手の彫り込みと二本の溝の外寸は保つ。
    const wood = S.quality === 'high' ? timberBox : box;
    // 設楽原の板戸は幅広の一枚板で代用せず、框の内側へ四枚の板を納める推定の作り。
    // 継ぎ目の線を表へ貼らず、板の間に細い目地を残す。奥の薄い裏板で外への透けを防ぐ。
    // 板は指掛けのある縦框の内側で止め、同寸の原形・材質を全戸で共有する。
    const innerW = w - .08, plankW = innerW / 4, joint = .003;
    box(g, innerW, h - .08, .012, 0, h / 2, 0, 0x30221a);
    for (let j = 0; j < 4; j++) {
      const left = -innerW / 2 + plankW * j + (j ? joint / 2 : 0);
      const right = -innerW / 2 + plankW * (j + 1) - (j < 3 ? joint / 2 : 0);
      for (const side of [-1, 1]) {
        const color = j % 2 ? 0x4a3828 : 0x503d2b;
        if (S.quality === 'high') {
          // 縦に接いだ鏡板は木目も縦へ通す。横框用の箱の絵をそのまま引き伸ばさない。
          // 腰障子と同じ板の原形・材質を使い、厚みと目地、引違いの余白は保つ。
          const board = templeCeilingBoard(h - .08, right - left, color, .009);
          board.rotation.set(0, Math.PI / 2, Math.PI / 2);
          board.position.set((left + right) / 2, h / 2, side * .0105);
          g.add(board);
        } else box(g, right - left, h - .08, .009, (left + right) / 2, h / 2,
          side * .0105, color, 'villageWood');
      }
    }
    // 横桟は鏡板を貫く太い棒にせず、裏面へ添える推定の作り。
    // 板の裏面から框の裏面までの見込みへ納め、引き違う戸との隙間を保つ。
    for (const yy of [h * .25, h * .5, h * .75]) {
      wood(g, w - .08, .045, .015, 0, yy, -.0225, 0x2e2218);
      // 裏桟と四枚の鏡板を留める釘頭。板ごとに留め、桟を貼っただけの姿にしない。
      // 桟の裏面へ接して納める。既存の箱・材質と静止した束を使い、溝の見込みは保つ。
      for (let j = 0; j < 4; j++)
        box(g, .012, .012, .003, -innerW / 2 + plankW * (j + .5), yy, -.0315, 0x39362e);
    }
    for (const yy of [.02, h - .02]) wood(g, w, .04, .06, 0, yy, 0, 0x241a12);
    // 右戸は指掛けの側だけを替える。戸全体を裏返すと裏桟が片方だけ表へ出る。
    const hand = rightHand ? -1 : 1;
    wood(g, .04, h - .08, .06, hand * (-w / 2 + .02), h / 2, 0, 0x241a12);
    // 召し合わせの框に指掛けを彫り、表裏の両面から引けるようにする。
    const x = hand * (w / 2 - .02), gripY = Math.min(.85, h * .5), gripH = .12;
    const lower = gripY - gripH / 2, upper = gripY + gripH / 2;
    wood(g, .04, lower - .04, .06, x, (lower + .04) / 2, 0, 0x241a12);
    wood(g, .04, h - .04 - upper, .06, x, (h - .04 + upper) / 2, 0, 0x241a12);
    wood(g, .04, gripH, .036, x, gripY, 0, 0x241a12);
    for (const side of [-1, 1])
      box(g, .024, gripH, .002, x, gripY, side * .019, 0x16120e);
    for (const dx of [-.016, .016]) wood(g, .008, gripH, .06, x + dx, gripY, 0, 0x241a12);
    // 縦框の枘を上下の横框へ差し、両面の込栓で抜けを止める推定の納まり。
    // 横框の中の枘は描き足さず、外へ出る栓の木口だけを表す。
    // 左右の戸で共用し、引手・鏡板・二本溝の位置と通れる幅は保つ。
    if (S.quality === 'high') for (const side of [-1, 1]) for (const yy of [.02, h - .02]) {
      const jointX = side * (w / 2 - .02);
      for (const face of [-1, 1])
        wood(g, .012, .012, .003, jointX, yy, face * .0315, 0x795b3b);
    }
    return g;
  }
  for (let k = 1; k < 6; k++) box(g, w - .06, .045, .05, 0, h * k / 6, 0, 0x2e2218);
  villageFrame(g, w, h, 0x241a12);
  box(g, .05, .1, .06, w / 2 - .12, .9, 0, 0x1a1410); return g;
}
// 格子戸：寺の内陣と外陣の境。黒漆の框に細い縦格子と三本の貫。透けて奥の灯が見える
function villageKoshi(w = .9, h = 1.8, hikite = false, fitted = hikite, rightHand = false) {
  const g = new THREE.Group();
  // 設楽原の内陣境は腰板だけでなく、縦格子・貫・框・引手板も木地を見せる。
  // 固定建具と滑る戸で同じ木目を使い、横木は横、縦木は縦へ通す。
  const grain = fitted && S.quality === 'high';
  const wood = (group, w, h, d, x, y, z, color) => grain
    ? timberBox(group, w, h, d, x, y, z, color)
    : box(group, w, h, d, x, y, z, color);
  // 設楽原の格子は腰板へ突き通さず、下の貫で受ける。
  // 腰板と縦格子が同じ面で重なると、表裏とも木目のない縞がちらつく。
  // 固定の格子と動く格子戸で同じ納まりを使い、既存の束へまとめる。
  const bottom = fitted ? .32 : .03, top = h - (fitted ? .04 : .03);
  const rails = [.32, h * .55, h - .3];
  // 右戸も裏桟は内陣側へ揃え、引手板と、その周りの格子の欠き取りだけ左右を替える。
  const gripX = (rightHand ? -1 : 1) * (w / 2 - .09), gripY = h * .5;
  // 小堂は固定の格子も引き戸も、框の内側を約十センチの同じ割りで組む。
  // 幅にかかわらず八本では、狭い固定建具だけ目が詰まり、戸を開くと格子の密度が変わる。
  // 框の内面から割り付け、端の格子も框へ食い込ませない。原形を作る時だけ計算する。
  const clearW = w - .08;
  const divisions = fitted ? Math.max(2, Math.round(clearW / .1)) : 9;
  // 設楽原の格子と貫は相欠きで組む。片面ずつ通して木の重なりを避け、
  // 突き付けただけの格子にしない。固定建具と引き戸の原形で共用する。
  const latticeX = k => -clearW / 2 + k * clearW / divisions;
  const lap = grain;
  for (let k = 1; k < divisions; k++) {
    const x = fitted ? latticeX(k) : -w / 2 + k * w / 9;
    if (!fitted) { box(g, .022, top - bottom, .03, x, (bottom + top) / 2, 0, 0x2a1c12); continue; }
    // 裏側の縦格子は貫の内面で止め、交点で木の面を重ねない。
    // 引手板の所は表裏とも抜き、窪みへ格子を突き通さない。
    const cuts = rails.map(y => [y - .0175, y + .0175]);
    if (hikite && Math.abs(x - gripX) < .07 + .011) cuts.push([gripY - .11, gripY + .11]);
    if (lap) {
      // 表側の縦格子は貫を通し、引手板の所だけ抜く。
      const spans = hikite && Math.abs(x - gripX) < .081
        ? [[bottom, gripY - .11], [gripY + .11, top]] : [[bottom, top]];
      for (const [a, b] of spans) {
        const low = Math.max(bottom, a), high = Math.min(top, b);
        if (high > low) wood(g, .022, high - low, .015, x, (low + high) / 2, .0075, 0x2a1c12);
      }
    }
    cuts.sort((a, b) => a[0] - b[0]);
    let start = bottom;
    for (const [low, high] of cuts) {
      const end = Math.min(top, low);
      if (end > start) wood(g, .022, end - start, lap ? .015 : .03, x, (start + end) / 2, lap ? -.0075 : 0, 0x2a1c12);
      start = Math.max(start, high);
    }
    if (top > start) wood(g, .022, top - start, lap ? .015 : .03, x, (start + top) / 2, lap ? -.0075 : 0, 0x2a1c12);
  }
  for (const y of rails) {
    const half = w / 2 - (fitted ? .04 : .03);
    if (lap) {
      const spans = hikite && Math.abs(y - gripY) < .1275
        ? [[-half, Math.max(-half, gripX - .07)], [Math.min(half, gripX + .07), half]]
        : [[-half, half]];
      for (const [a, b] of spans) {
        if (b <= a) continue;
        // 裏側の貫を通し、表側だけ縦格子の脇で欠く。引手の窪みも残す。
        wood(g, b - a, .035, .02, (a + b) / 2, y, -.01, 0x2a1c12);
        for (let k = 0; k < divisions; k++) {
          const left = Math.max(a, k ? latticeX(k) + .011 : -half);
          const right = Math.min(b, k + 1 < divisions ? latticeX(k + 1) - .011 : half);
          if (right > left) wood(g, right - left, .035, .02, (left + right) / 2, y, .01, 0x2a1c12);
        }
      }
      continue;
    }
    // 引手板を横切る貫も板の側面へ納め、窪みの中へ木を残さない。
    if (fitted && hikite && Math.abs(y - gripY) < .11 + .0175) {
      for (const [a, b] of [[-half, Math.max(-half, gripX - .07)], [Math.min(half, gripX + .07), half]])
        if (b > a) wood(g, b - a, .035, .04, (a + b) / 2, y, 0, 0x2a1c12);
    } else wood(g, half * 2, .035, .04, 0, y, 0, 0x2a1c12);
  }
  if (fitted) {
    // 鏡板は左右の竪框・下框・貫の内側へ納める。框より薄くし、木口を露出させない。
    const low = .04, high = .32 - .035 / 2;
    // 小堂の腰板は三枚の縦板で組む推定の納まり。幅広の一枚板へ線を貼らず、
    // 表裏の板の間に三ミリの目地を残す。薄い裏板で向こう側への透けを防ぐ。
    // 固定の格子と引き戸で原形を共用し、框の外寸と滑る戸の当たりは保つ。
    const innerW = w - .08, joint = .003, mid = (low + high) / 2;
    box(g, innerW, high - low, .01, 0, mid, 0, 0x241a12);
    for (let j = 0; j < 3; j++) {
      const left = -innerW / 2 + innerW * j / 3 + (j ? joint / 2 : 0);
      const right = -innerW / 2 + innerW * (j + 1) / 3 - (j < 2 ? joint / 2 : 0);
      for (const side of [-1, 1]) {
        const color = j % 2 ? 0x36271a : 0x3a2a1c;
        if (grain && S.quality === 'high') {
          // 内陣境の腰板も縦板の長手へ木目を揃え、横向きの貫と描き分ける。
          // 固定格子と滑る格子戸は同じ原形を使い、板の厚みと裏桟の位置を保つ。
          const board = templeCeilingBoard(high - low, right - left, color, .006);
          board.rotation.set(0, Math.PI / 2, Math.PI / 2);
          board.position.set((left + right) / 2, mid, side * .008);
          g.add(board);
        } else box(g, right - left, high - low, .006,
          (left + right) / 2, mid, side * .008, color, 'villageWood');
      }
    }
    if (grain) {
      // 小堂の腰板も三枚を裏桟で束ねる推定の造り。薄い板を並べただけにしない。
      // 桟は板の裏面へ接し、釘頭まで六センチの框の内側へ納める。
      // 固定格子と動く戸で形・材質を共用し、既存の建具の束へまとめる。
      for (const fraction of [1 / 3, 2 / 3]) {
        const y = low + (high - low) * fraction;
        wood(g, innerW, .025, .012, 0, y, -.017, 0x2a1c12);
        for (let j = 0; j < 3; j++)
          box(g, .01, .01, .002, -innerW / 2 + innerW * (j + .5) / 3,
            y, -.024, 0x39362e);
      }
    }
  } else box(g, w - .06, .26, .03, 0, .16, 0, 0x3a2a1c);   // 腰の板
  if (grain) {
    for (const y of [.02, h - .02]) wood(g, w, .04, .06, 0, y, 0, 0x1e140e);
    for (const x of [-w / 2 + .02, w / 2 - .02])
      wood(g, .04, h - .08, .06, x, h / 2, 0, 0x1e140e);
  } else villageFrame(g, w, h, 0x1e140e, fitted && S.quality === 'high');
  if (hikite) {
    // 内陣の動く格子戸には引手板を渡す。格子の隙間に金具だけを浮かせない。
    // 内陣・外陣の両側から指を掛けられるよう、板の表裏に引手を納める。
    const x = gripX, y = gripY;
    // 引手は板へ貼り付けた黒い突起にせず、口を抜いて両面から指が掛かる窪みにする。
    // 板の見付けと戸の外寸は保ち、共通の原形を作る時だけ分割する。
    for (const side of [-1, 1]) {
      wood(g, (.14 - .075) / 2, .22, .055,
        x + side * (.14 + .075) / 4, y, 0, 0x3a2a1c);
      wood(g, .075, (.22 - .13) / 2, .055,
        x, y + side * (.22 + .13) / 4, 0, 0x3a2a1c);
    }
    box(g, .075, .13, .035, x, y, 0, 0x16120e);
    for (const side of [-1, 1]) {
      for (const dx of [-.03, .03]) {
        box(g, .015, .13, .008, x + dx, y, side * .031, 0x66553a);
        box(g, .003, .095, .0135, x + Math.sign(dx) * .0225, y, side * .02425, 0x493725);
      }
      for (const dy of [-.05625, .05625]) {
        box(g, .045, .0175, .008, x, y + dy, side * .031, 0x66553a);
        box(g, .045, .003, .0135, x, y + Math.sign(dy) * .0475, side * .02425, 0x493725);
      }
    }
  }
  return g;
}
function inabaKoshi(w = .9, h = 1.8, inaba = false, reverseJoinery = false) {
  const g = new THREE.Group();
  if (inaba) {
    // 稲葉山の堂・小祠の格子戸は推定の納まり。腰の鏡板を框へ納め、
    // 竪子を腰貫と上框の間で止める。固定の格子と動く戸で同じ形を使う。
    const wood = 0x2a1c12, width = w - .08, waist = h * (.3 / 1.8);
    inabaFrame(g, w, h, 0x1e140e, S.quality === 'high');
    if (S.quality === 'high') {
      // 本堂・小祠の腰板は、幅広の一枚板でなく三枚の杉板を框へ納める推定。
      // 板継ぎの奥に実を残し、堂の内外を透かす隙間にしない。
      // 固定格子と動く戸で共有し、溝・引手・戸の厚みは同じにする。
      const plankW = width / 3, plankH = waist - .08;
      // 腰板の四辺は框と腰貫の溝へ五ミリ差し込む推定の納まり。
      // 木口へ突き付けるだけにせず、薄い鏡板を厚い框の内側で受ける。
      // 中の板継ぎの目地は残し、固定戸と可動戸で同じ形を使う。
      const lap = .005;
      // 本堂と小祠の腰板も、障子・板戸と共有の板目で木の面を表す。
      for (let j = 0; j < 3; j++) {
        const left = -width / 2 + j * plankW + (j === 0 ? -lap : .0015);
        const right = -width / 2 + (j + 1) * plankW + (j === 2 ? lap : -.0015);
        box(g, right - left, plankH + lap * 2, .018,
          (left + right) / 2, waist / 2, 0,
          j === 1 ? 0x503b28 : 0x493522, 'inabaBoard');
      }
      for (let j = 1; j < 3; j++)
        box(g, .01, plankH + lap * 2, .008, -width / 2 + j * plankW,
          waist / 2, 0, 0x2e2218);
    } else box(g, width, waist - .08, .018, 0, waist / 2, 0, 0x493522);
    // 高画質の腰板の下端は、既存の下框の上端から溝へ差し込んで受ける。
    // さらに同じ所へ横木を重ねると、板面へ食い込み、框が二段に見える。
    // 本堂・小祠の固定格子と動く戸を同じ納まりにし、共通の形を減らす。
    if (S.quality === 'high') {
      // 腰貫は縦框へ突き付けるだけにせず、薄いほぞを五ミリ差して受ける推定。
      // 本体の木口は框の内面で止め、表裏へ角材を重ねない。
      // 固定格子・可動戸で共有し、戸の外寸と引き溝は保つ。
      doorTimber(g, width, .04, .045, 0, waist - .02, 0, wood, true);
      for (const side of [-1, 1]) {
        doorTimber(g, .005, .022, .025, side * (width / 2 + .0025),
          waist - .02, 0, wood, true);
        // ほぞを留める込栓の木口。引手と同じく框の厚み内へ納める。
        for (const face of [-1, 1])
          box(g, .008, .008, .001, side * (width / 2 + .003),
            waist - .02, face * .03, 0x493b28);
      }
    } else for (const y of [.04, waist - .02])
      doorTimber(g, width, .04, .045, 0, y, 0, wood, false);
    // 高画質の竪子は腰貫と上框へ差し込む。腰貫の上へ五ミリ浮かせると、
    // 明るい外や灯明を背にした時に全ての竪子の足元が透けて見える。
    // 戸の外寸・引き溝・当たりは保ち、固定格子と動く戸の共通形だけを直す。
    const bottom = S.quality === 'high' ? waist - .03 : waist + .005;
    const top = S.quality === 'high' ? h - .03 : h - .04;
    const bays = Math.max(3, Math.round(width / .1));
    const rails = [.36, .72].map(t => waist + .005 + (h - .04 - waist - .005) * t);
    if (S.quality === 'high') {
      // 本堂・小祠の格子は縦横を半分ずつ欠いて組む推定。
      // 横貫だけ薄くして竪子へ貫通させず、表裏とも同じ面へ納める。
      // 固定格子と動く戸で形・材質を共有し、設営時に既存の束へまとめる。
      // 右戸は引手を中央へ向けて半回転するため、相欠きも先に裏返す。
      // 建て込んだ左右で横貫と竪子の表裏を揃える。
      const face = reverseJoinery ? -1 : 1;
      const pitch = width / bays;
      for (let j = 1; j < bays; j++) {
        const x = -width / 2 + pitch * j;
        doorTimber(g, .022, top - bottom, .015, x, (bottom + top) / 2, -.0075 * face, wood, true);
        let start = bottom;
        for (let k = 0; k <= rails.length; k++) {
          const end = k < rails.length ? rails[k] - .015 : top;
          doorTimber(g, .022, end - start, .015, x, (start + end) / 2, .0075 * face, wood, true);
          start = end + .03;
        }
      }
      for (const yy of rails) {
        // 横貫の木口も縦框へ五ミリ差し込み、竪子との相欠きだけで支えない。
        // 本堂・小祠の固定格子と可動戸で同じ形を共有する。
        doorTimber(g, width + .01, .03, .015, 0, yy, .0075 * face, wood, true);
        for (let j = 0; j < bays; j++) {
          const a = -width / 2 + pitch * j + (j > 0 ? .011 : -.005);
          const b = -width / 2 + pitch * (j + 1) - (j + 1 < bays ? .011 : -.005);
          doorTimber(g, b - a, .03, .015, (a + b) / 2, yy, -.0075 * face, wood, true);
        }
      }
    } else {
      for (let j = 1; j < bays; j++)
        doorTimber(g, .022, top - bottom, .03, -width / 2 + width * j / bays,
          (bottom + top) / 2, 0, wood, false);
      for (const yy of rails) doorTimber(g, width, .03, .03, 0, yy, 0, wood, false);
    }
    // 引手は縦框へ彫り込んだ形。金具を戸の表へ張り出さない。
    for (const z of S.quality === 'high' ? [-.021, .021] : [-.031, .031])
      box(g, .022, .09, .002, w / 2 - .02, h * .5, z, 0x120f0b);
    return g;
  }
  for (let k = 1; k < 9; k++) box(g, .022, h - .06, .03, -w / 2 + k * w / 9, h / 2, 0, 0x2a1c12);
  for (const y of [.32, h * .55, h - .3]) box(g, w - .06, .035, .04, 0, y, 0, 0x2a1c12);
  box(g, w - .06, .26, .03, 0, .16, 0, 0x3a2a1c);   // 腰の板
  inabaFrame(g, w, h, 0x1e140e); return g;
}
function inabaTatami(w = .9, d = 1.8, flush = false) {
  // 稲葉山の高画質は敷居と面を揃えた専用の畳を使う。
  // 素材の有無で、布縁・短辺の折り返し・六センチの床厚を置き換えない。
  const kit = flush ? null : bought('tatami_floor_modular_a', w, .06, d);
  const g = new THREE.Group();
  if (false) {
    // 畳表は約五ミリ、縁の麻布は約二ミリの目で揃える推定の仕上げ。
    // 薄い折り返しへ一枚ぶんの絵を縮めず、展開した布の座標で木口までつなぐ。
    // 寸法と貼る位置ごとの原形を共有し、材質は表・縁で各一つ。設営時だけ作る。
    const surface = (w, h, d, x, y, z, kind) => {
      if (kind === 'tatamiCore') return box(g, w, h, d, x, y, z, 0xffffff, kind);
      const heri = kind === 'tatamiHeri', texture = heri ? 'tatamiHeriWeave' : 'tatamiWeave';
      const key = `畳の布目:${texture}:${w}:${h}:${d}:${x}:${y}:${z}`;
      if (!shapes.has(key)) {
        const geo = shape(w, h, d).clone(), pos = geo.attributes.position;
        const normal = geo.attributes.normal, uv = geo.attributes.uv;
        for (let i = 0; i < pos.count; i++) {
          const px = pos.getX(i) + x, py = pos.getY(i) + y, pz = pos.getZ(i) + z;
          const nx = normal.getX(i), nz = normal.getZ(i);
          // 上面から端へ回した布の長さを使い、織り目の向きと細かさを保つ。
          const u = Math.abs(nx) > .5 ? px + nx * (.06 - py) : px;
          const v = Math.abs(nz) > .5 ? pz + nz * (.06 - py) : pz;
          uv.setXY(i, u / (heri ? .128 : .9), v / (heri ? .128 : .45));
        }
        shapes.set(key, geo);
      }
      const mesh = new THREE.Mesh(shapes.get(key), mat(0xffffff, texture));
      cacheUsers.push(new WeakRef(mesh)); mesh.position.set(x, y, z); g.add(mesh);
    };
    // 設楽原の敷き畳・置き畳は、畳床と、それを包む畳表・畳縁を分ける。
    // 畳縁も上端六センチに納め、歩行面から浮く黒い棒にしない。
    // 箱と材質は共用し、設営時にほかの内装と一緒に束ねる。
    const border = Math.min(.044, w / 4), end = Math.min(.012, d / 4);
    // 短辺の框は畳表を下へ回し、裏へ折って藁床を包む。
    // 置き畳の木口も中央だけ藁が露出した姿にせず、畳縁との境で納める。
    // 折り返しの厚みを畳床から取り、元の外寸と六センチの歩行面を保つ。
    const facing = .002, clearW = w - border * 2;
    surface(clearW, .056, d - end * 2, 0, .028, 0, 'tatamiCore');
    for (const side of [-1, 1]) {
      const z = side * (d / 2 - (end + facing) / 2);
      surface(clearW, .056 - facing, end - facing,
        0, (.056 + facing) / 2, z, 'tatamiCore');
      surface(clearW, facing, end - facing,
        0, facing / 2, z, 'tatami');
      surface(clearW, .056, facing,
        0, .028, side * (d - facing) / 2, 'tatami');
    }
    surface(w - border * 2, .004, d, 0, .058, 0, 'tatami');
    for (const x of [-w / 2 + border / 2, w / 2 - border / 2]) {
      // 縁の下も藁床。長辺を木色の塊のまま露出させず、上の麻布を
      // 外側面から裏へ折り返す推定の納まり。厚みを元の外寸の内側へ取る。
      // 端の折り返しとは面を重ねず、同じ布・藁の材質で内装の束へまとめる。
      const side = Math.sign(x), cloth = Math.min(.002, border / 4);
      surface(border - cloth, .054 - cloth, d - end * 2,
        x - side * cloth / 2, (.054 + cloth) / 2, 0, 'tatamiCore');
      surface(cloth, .054 - cloth, d - end * 2,
        x + side * (border - cloth) / 2, (.054 + cloth) / 2, 0, 'tatamiHeri');
      surface(border, cloth, d - end * 2, x, cloth / 2, 0, 'tatamiHeri');
      surface(border, .006, d, x, .057, 0, 'tatamiHeri');
      // 畳縁は短辺の端で畳床へ折り返す。置き畳の木口にも厚みを残す。
      for (const z of [-d / 2 + end / 2, d / 2 - end / 2])
        surface(border, .054, end, x, .027, z, 'tatamiHeri');
    }
    return g;
  }
  // 素材に穴や切り欠きがあっても、下の暗い基壇を床のすき間として見せない。
  // 稲葉山の畳表は縁の内側で止める。同じ高さへ縁を重ねると面がちらつく。
  // 六センチ全部を藺草や布の塊にせず、藁床と薄い畳表に分ける。
  // 短辺は布で囲まず、上端の藺草の折り返しと、その下の藁床を見せる。
  // 既存の藁・縁・箱を共有し、室内を作る時だけ束へまとめる。
  const fitted = flush && !kit;
  const wrap = .0015;
  // 薄い小口へ上面と同じ絵を押し縮めず、面ごとの実寸で木地と織り目を貼る。
  const weave = (mesh, kind) => {
    const { width, height, depth } = mesh.geometry.parameters;
    const key = `稲葉山の畳の面:${kind}:${width}:${height}:${depth}`;
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
  if (fitted) weave(box(g, w - wrap * 2, .056, d - .004,
    0, .028, 0, 0xffffff, 'hieiTatamiCore'), '藁床');
  const surface = box(g, fitted ? w - .088 : w, kit ? .045 : fitted ? .004 : .06,
    fitted ? d - .004 : d, 0, kit ? .0225 : fitted ? .058 : .03, 0, 0xffffff, 'tatami');
  if (fitted) weave(surface, '畳表');
  if (kit) { g.add(kit); return g; }
  if (fitted) for (const side of [-1, 1])
    weave(box(g, w - .088, .012, .002, 0, .054, side * (d / 2 - .001),
      0xb3a47a, 'tatami'), '表の折り返し');
  // 畳縁は長い辺だけに付ける。稲葉山の座敷は織り目と縫い目を共有する。
  for (const x of [-w / 2 + .022, w / 2 - .022]) {
    box(g, .044, fitted ? .004 : .066, d, x, fitted ? .058 : .033, 0,
      flush ? 0xffffff : 0x1d1c18, flush ? 'inabaTatamiBorder' : '');
    if (fitted) weave(box(g, wrap, .056, d,
      Math.sign(x) * (w / 2 - wrap / 2), .028, 0,
      0xffffff, 'inabaTatamiBorder'), '縁の巻き込み');
  }
  return g;
}
function villageTatami(w = .9, d = 1.8, layered = false, flush = false) {
  // 設楽原の畳は畳床・畳表・畳縁の実寸を優先する。
  // 共通素材へ全体を伸縮すると、座敷幅に応じて縁幅まで変わり、置き畳の木口も失われる。
  const kit = layered ? null : bought('tatami_floor_modular_a', w, .06, d);
  const g = new THREE.Group();
  if (layered) {
    // 畳表は約五ミリ、縁の麻布は約二ミリの目で揃える推定の仕上げ。
    // 薄い折り返しへ一枚ぶんの絵を縮めず、展開した布の座標で木口までつなぐ。
    // 寸法と貼る位置ごとの原形を共有し、材質は表・縁で各一つ。設営時だけ作る。
    const surface = (w, h, d, x, y, z, kind) => {
      if (kind === 'tatamiCore') return box(g, w, h, d, x, y, z, 0xffffff, kind);
      const heri = kind === 'tatamiHeri', texture = heri ? 'tatamiHeriWeave' : 'tatamiWeave';
      const key = `畳の布目:${texture}:${w}:${h}:${d}:${x}:${y}:${z}`;
      if (!shapes.has(key)) {
        const geo = shape(w, h, d).clone(), pos = geo.attributes.position;
        const normal = geo.attributes.normal, uv = geo.attributes.uv;
        for (let i = 0; i < pos.count; i++) {
          const px = pos.getX(i) + x, py = pos.getY(i) + y, pz = pos.getZ(i) + z;
          const nx = normal.getX(i), nz = normal.getZ(i);
          // 上面から端へ回した布の長さを使い、織り目の向きと細かさを保つ。
          const u = Math.abs(nx) > .5 ? px + nx * (.06 - py) : px;
          const v = Math.abs(nz) > .5 ? pz + nz * (.06 - py) : pz;
          uv.setXY(i, u / (heri ? .128 : .9), v / (heri ? .128 : .45));
        }
        shapes.set(key, geo);
      }
      const mesh = new THREE.Mesh(shapes.get(key), mat(0xffffff, texture));
      cacheUsers.push(new WeakRef(mesh)); mesh.position.set(x, y, z); g.add(mesh);
    };
    // 設楽原の敷き畳・置き畳は、畳床と、それを包む畳表・畳縁を分ける。
    // 畳縁も上端六センチに納め、歩行面から浮く黒い棒にしない。
    // 箱と材質は共用し、設営時にほかの内装と一緒に束ねる。
    const border = Math.min(.044, w / 4), end = Math.min(.012, d / 4);
    // 短辺の框は畳表を下へ回し、裏へ折って藁床を包む。
    // 置き畳の木口も中央だけ藁が露出した姿にせず、畳縁との境で納める。
    // 折り返しの厚みを畳床から取り、元の外寸と六センチの歩行面を保つ。
    const facing = .002, clearW = w - border * 2;
    surface(clearW, .056, d - end * 2, 0, .028, 0, 'tatamiCore');
    for (const side of [-1, 1]) {
      const z = side * (d / 2 - (end + facing) / 2);
      surface(clearW, .056 - facing, end - facing,
        0, (.056 + facing) / 2, z, 'tatamiCore');
      surface(clearW, facing, end - facing,
        0, facing / 2, z, 'tatami');
      surface(clearW, .056, facing,
        0, .028, side * (d - facing) / 2, 'tatami');
    }
    surface(w - border * 2, .004, d, 0, .058, 0, 'tatami');
    for (const x of [-w / 2 + border / 2, w / 2 - border / 2]) {
      // 縁の下も藁床。長辺を木色の塊のまま露出させず、上の麻布を
      // 外側面から裏へ折り返す推定の納まり。厚みを元の外寸の内側へ取る。
      // 端の折り返しとは面を重ねず、同じ布・藁の材質で内装の束へまとめる。
      const side = Math.sign(x), cloth = Math.min(.002, border / 4);
      surface(border - cloth, .054 - cloth, d - end * 2,
        x - side * cloth / 2, (.054 + cloth) / 2, 0, 'tatamiCore');
      surface(cloth, .054 - cloth, d - end * 2,
        x + side * (border - cloth) / 2, (.054 + cloth) / 2, 0, 'tatamiHeri');
      surface(border, cloth, d - end * 2, x, cloth / 2, 0, 'tatamiHeri');
      surface(border, .006, d, x, .057, 0, 'tatamiHeri');
      // 畳縁は短辺の端で畳床へ折り返す。置き畳の木口にも厚みを残す。
      for (const z of [-d / 2 + end / 2, d / 2 - end / 2])
        surface(border, .054, end, x, .027, z, 'tatamiHeri');
    }
    return g;
  }
  // 素材に穴や切り欠きがあっても、下の暗い基壇を床のすき間として見せない。
  // 比叡山の畳は六センチの厚みを畳床と薄い畳表に分ける。
  // 上がり口で見える小口へ表の織り目を引き伸ばさず、藁の断面を出す。
  // 縁・上面・当たりの高さは揃え、共通の箱と材質で設営時にまとめる。
  const hieiLayered = flush && !kit;
  // 藁の床は縁の下まで通す。布の幅だけ床を欠くと、小口まで黒い角材になってしまう。
  // 長辺の外側だけ薄い布を巻き、小口には縁の下の藁も見せる。
  const wrap = .0015;
  const core = hieiLayered ? box(g, w - wrap * 2, .056, d, 0, .028, 0, 0xffffff, 'hieiTatamiCore') : null;
  const surface = box(g, hieiLayered ? w - .088 : w, kit ? .045 : hieiLayered ? .004 : .06,
    d, 0, kit ? .0225 : hieiLayered ? .058 : .03, 0, 0xffffff, 'tatami');
  const weave = (mesh, kind) => {
    const { width, height, depth } = mesh.geometry.parameters;
    const key = `稲葉山の畳の面:${kind}:${width}:${height}:${depth}`;
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
  if (kit) { g.add(kit); return g; }
  if (hieiLayered) for (const side of [-1, 1])
    weave(box(g, w - .088, .012, .002, 0, .054, side * (d / 2 - .001),
      0xb3a47a, 'tatami'), '表の折り返し');
  // 畳縁は長い辺だけに付ける。稲葉山の座敷は織り目と縫い目を共有する。
  for (const x of [-w / 2 + .022, w / 2 - .022]) {
    box(g, .044, hieiLayered ? .004 : .066, d, x, hieiLayered ? .058 : .033, 0,
      flush ? 0xffffff : 0x1d1c18, flush ? 'inabaTatamiBorder' : '');
    if (hieiLayered) weave(box(g, wrap, .056, d,
      Math.sign(x) * (w / 2 - wrap / 2), .028, 0,
      0xffffff, 'inabaTatamiBorder'), '縁の巻き込み');
  }
  return g;
}
function inabaUsuberi(g, w, d, x, y, z) {
  box(g, w - .05, .008, d - .024, x, y + .006, z, 0xffffff, 'tatami');
  for (const side of [-1, 1]) {
    box(g, .025, .01, d, x + side * (w / 2 - .0125), y + .007, z,
      0xffffff, 'inabaTatamiBorder');
    // 木口は布で四周を囲まず、短辺の折り返しを草の色で見せる。
    box(g, w - .05, .008, .012, x, y + .006, z + side * (d / 2 - .006),
      0xb3a47a, 'tatami');
  }
}
function inabaTatamiTiles(x0, x1, z0, z1) {
  const width = x1 - x0, depth = z1 - z0;
  const baseX = Math.max(2, Math.round(width / 1.8) * 2);
  const baseZ = Math.max(2, Math.round(depth / 1.8) * 2);
  let nx = baseX, nz = baseZ, best = Infinity;
  // 幅と奥行きを別々に丸めると、浅い座敷で一畳が正方形に近づく。
  // 半畳の升をなるべく正方形にし、一畳の縦横比と大きさを一緒に選ぶ。
  // 偶数の升を保つので、回り敷きの端に半端な畳や隙間はできない。
  for (let x = Math.max(2, baseX - 2); x <= baseX + 2; x += 2) {
    for (let z = Math.max(2, baseZ - 2); z <= baseZ + 2; z += 2) {
      const sx = width / x, sz = depth / z;
      const score = 4 * Math.log(sx / sz) ** 2 + Math.log(sx * sz / .81) ** 2;
      if (score < best) { best = score; nx = x; nz = z; }
    }
  }
  const sx = (x1 - x0) / nx, sz = (z1 - z0) / nz, out = [];
  const tile = (x, z, across) => out.push([
    x0 + (x + (across ? 1 : .5)) * sx,
    z0 + (z + (across ? .5 : 1)) * sz,
    across ? sz : sx, across ? sx * 2 : sz * 2, across ? Math.PI / 2 : 0,
  ]);
  let left = 0, right = nx, back = 0, front = nz;
  while (right - left > 2 && front - back > 2) {
    // 前後は横向き、左右は縦向き。次の列では継ぎ目が半畳ずれる。
    for (let x = left; x < right; x += 2) {
      tile(x, back, true); tile(x, front - 1, true);
    }
    for (let z = back + 1; z < front - 1; z += 2) {
      tile(left, z, false); tile(right - 1, z, false);
    }
    left++; right--; back++; front--;
  }
  if (right - left === 2) {
    for (let z = back; z < front; z++) tile(left, z, true);
  } else {
    for (let x = left; x < right; x++) tile(x, back, false);
  }
  // 回り敷きの芯が細長いと、外周と芯の継ぎ目に四枚の角が集まる。
  // 一畳の升二つを組み直し、四つ目を作らない納まりを設営時だけ探す。
  // 探索量は固定の上限で抑え、収まらない場合は元の割り付けを保つ。
  const corners = new Map();
  for (const [x, z, w, d, rot] of out) {
    const dx = (rot ? d : w) / 2, dz = (rot ? w : d) / 2;
    for (const vx of [x - dx, x + dx]) for (const vz of [z - dz, z + dz]) {
      const key = Math.round((vx - x0) / sx) + ',' + Math.round((vz - z0) / sz);
      corners.set(key, (corners.get(key) || 0) + 1);
    }
  }
  if (![...corners.values()].some(n => n === 4)) return out;
  const cells = new Uint16Array(nx * nz), placed = [];
  let attempts = 0;
  const fit = () => {
    if (++attempts > 4096) return false;
    const start = cells.indexOf(0);
    if (start < 0) return true;
    const x = start % nx, z = Math.floor(start / nx), id = placed.length + 1;
    for (const across of [true, false]) {
      if (across ? x + 1 >= nx : z + 1 >= nz) continue;
      const next = start + (across ? 1 : nx);
      if (cells[next]) continue;
      cells[start] = cells[next] = id;
      let valid = true;
      for (let vz = Math.max(1, z); valid && vz <= Math.min(nz - 1, z + (across ? 1 : 2)); vz++) {
        for (let vx = Math.max(1, x); vx <= Math.min(nx - 1, x + (across ? 2 : 1)); vx++) {
          const a = cells[(vz - 1) * nx + vx - 1], b = cells[(vz - 1) * nx + vx];
          const c = cells[vz * nx + vx - 1], d = cells[vz * nx + vx];
          if (a && b && c && d && a !== b && a !== c && a !== d && b !== c && b !== d && c !== d) {
            valid = false; break;
          }
        }
      }
      placed.push([x, z, across]);
      if (valid && fit()) return true;
      placed.pop(); cells[start] = cells[next] = 0;
    }
    return false;
  };
  if (fit()) {
    out.length = 0;
    for (const [x, z, across] of placed) tile(x, z, across);
  }
  return out;
}
// 掘込引手の周囲は板を分け、表裏の底を板面より奥へ納める。設営時だけ作る。
function pullPanel(g, w, h, d, x, y, px, py, pw, ph, color, kind = '', mirrored = false) {
  // 森部の縦板は框・桟と同じ木目の写し方を使う。
  // 掘込引手で分けた板も、表裏は長手、上下の木口は短辺の目にする。
  const left = x - w / 2, right = x + w / 2, bottom = y - h / 2, top = y + h / 2;
  const panelBox = (group, ww, hh, dd, xx, yy, zz, tint, surface) => {
    if (kind === 'boardsM') {
      const mesh = moribeTimberBox(group, ww, hh, dd, xx, yy, zz, tint);
      // 引手を掘って分けた鏡板も一本の縦板として木目を通す。
      // 切片ごとに長辺を選ぶと、穴の脇だけ横目になり、上下で節も伸び縮みする。
      // 元の板の座標で写し、掘った底と側面まで同じ木取りにそろえる。
      const key = `森部の板戸鏡板:${ww}:${hh}:${dd}:${xx - left}:${yy - bottom}:${zz}:${w}:${h}:${d}:${mirrored}`;
      if (!shapes.has(key)) {
        const geo = mesh.geometry.clone();
        const pos = geo.attributes.position, normal = geo.attributes.normal, uv = geo.attributes.uv;
        for (let i = 0; i < pos.count; i++) {
          const end = Math.abs(normal.getY(i)) > .5;
          const side = Math.abs(normal.getX(i)) > .5;
          // 右戸は後で部材の中心を左右へ写す。切片の中の写し方も反転し、
          // 引手の上下と脇で一本の板の木目をつなぐ。形と材質は共用する。
          const u = side ? (pos.getZ(i) + zz) / d + .5
            : ((mirrored ? -1 : 1) * pos.getX(i) + xx - left) / w;
          const v = end ? (pos.getZ(i) + zz) / d + .5 : (pos.getY(i) + yy - bottom) / h;
          uv.setXY(i, u, v);
        }
        shapes.set(key, geo);
      }
      mesh.geometry = shapes.get(key);
      return mesh;
    }
    const mesh = box(group, ww, hh, dd, xx, yy, zz, tint, surface);
    if (kind !== 'fusumaM') return mesh;
    // 引手の穴で分けても襖紙は一枚の面として貼る。箱ごとに絵を繰り返すと、
    // 引手の上下へ紙の継ぎ目と下端の汚れが現れ、無地の襖が継ぎはぎに見える。
    // 表裏それぞれ戸全体の座標で写し、固定戸・動く戸で同じ形を使い回す。
    const key = `森部の襖紙:${ww}:${hh}:${dd}:${xx - left}:${yy - bottom}:${w}:${h}:${mirrored}`;
    if (!shapes.has(key)) {
      const geo = mesh.geometry.clone();
      const pos = geo.attributes.position, normal = geo.attributes.normal, uv = geo.attributes.uv;
      for (let i = 0; i < pos.count; i++) {
        if (Math.abs(normal.getZ(i)) < .5) continue;
        // 右襖は切片の中心を左右へ写すので、切片内の座標も反転する。
        // 引手の脇と上下で紙の貼り継ぎ・色むらが途切れないようにする。
        const u = ((mirrored ? -1 : 1) * pos.getX(i) + xx - left) / w;
        uv.setXY(i, normal.getZ(i) > 0 ? u : 1 - u, (pos.getY(i) + yy - bottom) / h);
      }
      shapes.set(key, geo);
    }
    mesh.geometry = shapes.get(key);
    return mesh;
  };
  const a = Math.max(left, px - pw / 2), b = Math.min(right, px + pw / 2);
  const low = py - ph / 2, high = py + ph / 2;
  if (b <= a) { panelBox(g, w, h, d, x, y, 0, color, kind); return; }
  if (a > left) panelBox(g, a - left, h, d, (left + a) / 2, y, 0, color, kind);
  if (right > b) panelBox(g, right - b, h, d, (b + right) / 2, y, 0, color, kind);
  panelBox(g, b - a, low - bottom, d, (a + b) / 2, (bottom + low) / 2, 0, color, kind);
  panelBox(g, b - a, top - high, d, (a + b) / 2, (high + top) / 2, 0, color, kind);
  // 六ミリずつ掘り、芯を残す。裏側の引手まで貫通させない。
  panelBox(g, b - a, ph, d - .012, (a + b) / 2, py, 0, color, kind);
}
// 一枚の幅は0.9m。足もとを原点とする。襖の破壊や当たりは呼び出し側が受け持つ。
export function fusuma(w = .9, h = 1.8, painted = false, plain = false, mirrored = false) {
  const kit = painted || plain ? null : bought('slide_door_a', w, h, .06); if (kit) return kit;
  const g = new THREE.Group();
  if (plain) {
    // 森部の固定襖も動く襖と同じ原寸から作り、框と引手の位置をそろえる。
    g.scale.set(w / .9, h / 1.8, 1);
    w = .9; h = 1.8;
  }
  const pullX = w / 2 - .13, pullY = plain ? h * .47 : .85;
  // 森部の襖芯は四周を框へ五ミリ差し、六ミリの受け溝へ納める推定復元。
  // 内法への突き付けだけにせず、溝底に一ミリ、表裏に二ミリの遊びを残す。
  // 固定戸と動く戸は同じ形・引手・外寸を使い、既存の材質別の束へまとめる。
  if (plain) pullPanel(g, w - .07, h - .07, .035, 0, h / 2, pullX, pullY, .052, .072, 0xffffff, 'fusumaM', mirrored);
  else box(g, w - .06, h - .06, .035, 0, h / 2, 0, 0xffffff, 'fusuma');
  frame(g, w, h, 0x32271c, plain, false, plain, null, h - .034, false, null, .0195);
  // 森部の襖は、紙を貫く金属の出っ張りではなく縁付きの掘込引手で推定復元。
  // 表裏に暗い底と薄い金属縁を納め、指を掛けるくぼみを見せる。
  // 固定戸も動く戸も同じ原寸の形を拡縮し、横滑りする溝の厚みを出ない。
  // 三ミリ厚の金属縁の裏を、三十五ミリ厚の襖紙面へ付ける。
  // 中心を二十一ミリに置くと二ミリ浮き、近くから縁の下が透けてしまう。
  const pullRimZ = .035 / 2 + .003 / 2;
  if (plain) for (const side of [-1, 1]) {
    box(g, .052, .072, .001, pullX, pullY, side * .012, 0x1a1410);
    // 掘込引手の内側も金属で包む推定復元。縁と底だけでは、
    // 斜めから見たくぼみに襖紙の切断面が露出する。
    // 底の表から紙面まで折り返しを納め、表裏の間には芯を残す。
    // 固定襖と動く襖で共用し、既存の金属色の束へまとめる。
    for (const x of [-.0255, .0255]) box(g, .001, .072, .005,
      pullX + x, pullY, side * .015, 0x66553a);
    for (const y of [-.0355, .0355]) box(g, .05, .001, .005,
      pullX, pullY + y, side * .015, 0x66553a);
    for (const x of [-.028, .028]) box(g, .004, .08, .003,
      pullX + x, pullY, side * pullRimZ, 0x66553a);
    for (const y of [-.038, .038]) box(g, .052, .004, .003,
      pullX, pullY + y, side * pullRimZ, 0x66553a);
  }
  else box(g, .06, .08, .055, pullX, pullY, 0, 0x66553a);
  // 森部の右襖も表裏を返さず、引手と框の配置だけを左右へ写す。
  // 障子と同じ納まりにし、敷居の二本の溝へ同じ面を向けて立てる。
  if (plain && mirrored) for (const part of g.children) part.position.x *= -1;
  return g;
}
function frame(g, w, h, color, joined = false, recessedPull = false, panelGroove = false, railJoints = null, panelGrooveTop = h - .034, latticeJoints = false, rearRailJoints = null, panelGrooveHalf = .017) {
  // 障子の組子の端は框へ五ミリ差す。裏から掘った六ミリの仕口で受け、
  // 框と桟を重ねず、紙を張る裏面もそろえる推定復元。設営時だけ共用の形へまとめる。
  const sockets = [];
  if (rearRailJoints) {
    // 板戸の裏桟のほぞ穴。板を受ける溝とつなぎ、框の表側は残す。
    if (panelGroove) sockets.push([-w / 2 + .034, w / 2 - .034,
      .034, panelGrooveTop, -.017, .017]);
    for (const y of rearRailJoints) for (const side of [-1, 1]) {
      const x = side * (w / 2 - .037);
      sockets.push([x - .003, x + .003, y - .013, y + .013, -.031, -.014]);
    }
  }
  if (latticeJoints === 'koshi') {
    // 腰板の受け溝も同じ切り欠きへ含め、格子の穴を加えても塞がない。
    if (panelGroove) sockets.push([-w / 2 + .034, w / 2 - .034,
      .034, panelGrooveTop, -.017, .017]);
    // 格子戸の縦格子は上框へ五ミリ差す。六ミリの穴に底と側面の遊びを残す。
    for (let k = 1; k < 9; k++) {
      const x = -(w - .08) / 2 + k * (w - .08) / 9;
      sockets.push([x - .012, x + .012, h - .04, h - .034, -.011, .011]);
    }
  } else if (latticeJoints) {
    for (let i = 1; i < 4; i++) {
      const x = -(w - .08) / 2 + (w - .08) * i / 4;
      sockets.push([x - .009, x + .009, .034, .04, -.031, -.005]);
      sockets.push([x - .009, x + .009, h - .04, h - .034, -.031, -.005]);
    }
    for (let j = 1; j < 6; j++) {
      const y = .04 + (h - .08) * j / 6;
      sockets.push([-w / 2 + .034, -w / 2 + .04, y - .009, y + .009, -.031, -.005]);
      sockets.push([w / 2 - .04, w / 2 - .034, y - .009, y + .009, -.031, -.005]);
    }
  }
  const wood = (group, ww, hh, dd, x, y, z, tint, grain = null) => {
    const put = joined ? timberBox : box;
    const grainAxis = grain ?? (hh >= ww && hh >= dd ? 1 : ww >= dd ? 0 : 2);
    if (sockets.length) {
      let pieces = [[x - ww / 2, x + ww / 2, y - hh / 2, y + hh / 2, z - dd / 2, z + dd / 2]];
      for (const hole of sockets) {
        const next = [];
        for (const p of pieces) {
          const a = Math.max(p[0], hole[0]), b = Math.min(p[1], hole[1]);
          const low = Math.max(p[2], hole[2]), high = Math.min(p[3], hole[3]);
          const rear = Math.max(p[4], hole[4]), fore = Math.min(p[5], hole[5]);
          if (b <= a || high <= low || fore <= rear) { next.push(p); continue; }
          next.push([p[0], a, p[2], p[3], p[4], p[5]], [b, p[1], p[2], p[3], p[4], p[5]],
            [a, b, p[2], low, p[4], p[5]], [a, b, high, p[3], p[4], p[5]],
            [a, b, low, high, p[4], rear], [a, b, low, high, fore, p[5]]);
        }
        pieces = next.filter(p => p[1] > p[0] && p[3] > p[2] && p[5] > p[4]);
      }
      for (const p of pieces) put(group, p[1] - p[0], p[3] - p[2], p[5] - p[4],
        (p[0] + p[1]) / 2, (p[2] + p[3]) / 2, (p[4] + p[5]) / 2, tint, grainAxis);
      return;
    }
    if (!panelGroove) return put(group, ww, hh, dd, x, y, z, tint, joined ? grainAxis : '');
    // 板戸の鏡板・襖芯を四周の框へ五ミリ差し、六ミリの溝で受ける推定復元。
    // 溝底に一ミリ、表裏に二ミリの遊びを残す。黒い線を貼らず木を分けて彫る。
    // 既存のほぞ・引手と同じ木取りを保ち、設営時だけ共用の形へまとめる。
    const left = x - ww / 2, right = x + ww / 2;
    const bottom = y - hh / 2, top = y + hh / 2;
    const back = z - dd / 2, front = z + dd / 2;
    const a = Math.max(left, -w / 2 + .034), b = Math.min(right, w / 2 - .034);
    const low = Math.max(bottom, .034), high = Math.min(top, panelGrooveTop);
    const rear = Math.max(back, -panelGrooveHalf), fore = Math.min(front, panelGrooveHalf);
    if (b <= a || high <= low || fore <= rear) return put(group, ww, hh, dd, x, y, z, tint, joined ? grainAxis : '');
    const piece = (x0, x1, y0, y1, z0, z1) => {
      if (x1 > x0 && y1 > y0 && z1 > z0) put(group, x1 - x0, y1 - y0, z1 - z0,
        (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, tint, grainAxis);
    };
    piece(left, a, bottom, top, back, front);
    piece(b, right, bottom, top, back, front);
    piece(a, b, bottom, low, back, front);
    piece(a, b, high, top, back, front);
    piece(a, b, low, high, back, rear);
    piece(a, b, low, high, fore, front);
  };
  // 森部の框は呼び出し側で上溝へ二十八ミリ、下溝へ六ミリ掛けている。
  // 別のほぞを足すと、戸丈の拡縮で溝底の二ミリの遊びを越え、鴨居・敷居を貫く。
  // 窓・間仕切り・外の板戸とも框の端だけを溝へ納め、固定戸と動く戸をそろえる。
  // 森部の四隅は横框の通しほぞを縦框へ納める推定復元。
  // 穴の表裏に二センチずつ木を残し、戸の外側にはほぞの木口を見せる。
  // 戸丈・戸幅は増やさず、上下の溝と引手を保つ。設営時だけ共用の箱へまとめる。
  const post = (x, bottom, top) => {
    if (!joined) { wood(g, .04, top - bottom, .06, x, (bottom + top) / 2, 0, color); return; }
    const cuts = [bottom, top];
    for (const y of [.01, .03, h - .03, h - .01]) if (y > bottom && y < top) cuts.push(y);
    if (railJoints) for (const joint of railJoints) {
      for (const y of [joint - .01, joint + .01]) if (y > bottom && y < top) cuts.push(y);
    }
    cuts.sort((a, b) => a - b);
    for (let i = 1; i < cuts.length; i++) {
      const low = cuts[i - 1], high = cuts[i], middle = (low + high) / 2;
      const mortise = middle > .01 && middle < .03 || middle > h - .03 && middle < h - .01
        || railJoints && railJoints.some(joint => Math.abs(middle - joint) < .01);
      // 穴の周りの短い切片も同じ縦框。切片の長辺で木取りを選ぶと、
      // ほぞ穴の脇だけ横目、框の端だけ奥行き方向の木目になってしまう。
      // 元の縦材の繊維方向を渡し、共用の形・材質で木口までそろえる。
      if (mortise) {
        for (const side of [-1, 1]) wood(g, .04, high - low, .02, x, middle, side * .02, color, 1);
      } else wood(g, .04, high - low, .06, x, middle, 0, color, 1);
    }
  };
  for (const y of [.02, h - .02]) wood(g, joined ? w - .08 : w, .04, .06, 0, y, 0, color);
  for (const x of [-w / 2 + .02, w / 2 - .02]) {
    if (joined) for (const y of [.02, h - .02]) wood(g, .04, .02, .02, x, y, 0, color);
    // 薬師堂の格子戸は三本の貫も縦框へ通しほぞで留める推定復元。
    // 框側は四隅と同じほぞ穴を取り、木同士を重ねず表裏の厚みを残す。
    // 固定戸・動く戸で同じ形を使い、外寸と引手・滑る溝は保つ。
    if (joined && railJoints) for (const y of railJoints) {
      wood(g, .04, .02, .02, x, y, 0, color);
      for (const side of [-1, 1]) box(g, .009, .009, .002, x, y, side * .031, 0x6a5038);
    }
    if (!recessedPull || x < 0) {
      post(x, 0, h);
      continue;
    }
    // 森部の引手は縦框の両面を浅く掘る推定復元。六センチの木を黒い塊で貫かない。
    // 上下の通し木と左右の縁を残し、底を框の表面から五ミリ奥へ納める。
    // 固定戸・動く戸とも同じ形を使い、二本の溝や引手の位置は変えない。
    const bottom = h * .47 - .06, top = bottom + .12;
    post(x, 0, bottom);
    post(x, top, h);
    for (const side of [-1, 1]) {
      wood(g, .007, .12, .06, x + side * .0165, h * .47, 0, color);
      box(g, .026, .12, .001, x, h * .47, side * .0245, 0x3a2a1c);
    }
    wood(g, .026, .12, .048, x, h * .47, 0, color);
  }
  if (joined) {
    // 森部の建具は框を突き付けただけにせず、横框のほぞを縦框へ込栓で留める推定復元。
    // 四隅の表裏へ木口を出し、引手のくぼみと上下の溝には張り出さない。
    // 箱と木の材質は共用し、固定戸も引き戸も既存の束へまとめる。
    for (const x of [-w / 2 + .02, w / 2 - .02]) {
      for (const y of [.02, h - .02]) for (const side of [-1, 1]) {
        box(g, .009, .009, .002, x, y, side * .031, 0x6a5038);
      }
    }
  }
}
export function shoji(w = .9, h = 1.8, pull = false, mirrored = false) {
  const g = new THREE.Group();
  if (pull) {
    // 固定障子の組子・框も、引き違い障子と同じ比率で敷居と鴨居へ納める。
    g.scale.set(w / .9, h / 1.8, 1);
    w = .9; h = 1.8;
  }
  // 森部は固定戸・動く戸・窓とも、この框と組子で二本の溝へ納める。
  // 素材の読み込みで別の戸へ替えると、框の引手や溝との寸法がそろわない。
  const kit = pull ? null : bought('slide_door_c', w, h, .06); if (kit) return kit;
  if (pull) {
    // 森部の障子は組子を木で組み、紙に桟を描かない推定復元。
    // 紙は裏へ張り、縦横の組子は半分ずつ欠き合わせた厚みで納める。
    // 框の内側で止め、戸の六センチの厚みと既存の溝からはみ出さない。
    const iw = w - .08, ih = h - .08;
    // 紙を一枚の厚板にせず、半幅・組子一段分の小判を裏から張り継ぐ推定復元。
    // 四ミリの重ね代は組子の裏へ納め、裏から見た時も紙の継ぎ目を残す。
    // 重ね代だけ紙厚分を逃がし、各小判の中央は組子の裏へ貼り付ける。
    // 固定戸・動く戸・窓とも共通部品へまとめ、材質と描画の束は増やさない。
    const paperW = iw / 2, paperH = ih / 6, paperT = .0004, lap = .004;
    for (let row = 0; row < 6; row++) for (let col = 0; col < 2; col++) {
      // 外周も四ミリだけ框の裏へ貼り掛け、内法で紙が途切れないようにする。
      const x0 = -iw / 2 + col * paperW - lap;
      const x1 = -iw / 2 + (col + 1) * paperW + (col === 1 ? lap : 0);
      const y0 = .04 + row * paperH - lap;
      const y1 = .04 + (row + 1) * paperH + (row === 5 ? lap : 0);
      // 紙全体を段番号だけ奥へ送ると、上の段ほど組子から浮いてしまう。
      // 各小判は同じ裏面へ張り、左と下の糊代だけを薄く折り返す。
      const paper = box(g, x1 - x0, y1 - y0, paperT, (x0 + x1) / 2, (y0 + y1) / 2,
        -.012 - paperT / 2, 0xffffff, 'shojiM');
      // 煤と補修跡は障子一枚の座標で写す。小判ごとに絵を繰り返すと、
      // 各段の下に煤の帯が付き、同じ貼り直しが十二回並んでしまう。
      // 紙の重ね代は残し、窓・固定戸・動く戸で同じ形と材質を使い回す。
      const key = `森部の障子紙:${row}:${col}:${mirrored}`;
      if (!shapes.has(key)) {
        // 糊代の端から四ミリで貼り面へ戻す。分割した形も十二枚分を共用し、
        // 紙片や材質の数を増やさない。四枚の交点は縦二層・横一層で逃がす。
        const geo = new THREE.BoxGeometry(x1 - x0, y1 - y0, paperT, col ? 3 : 1, row ? 3 : 1);
        const pos = geo.attributes.position, normal = geo.attributes.normal, uv = geo.attributes.uv;
        for (let i = 0; i < pos.count; i++) {
          const ix = Math.round((pos.getX(i) / (x1 - x0) + .5) * (col ? 3 : 1));
          const iy = Math.round((pos.getY(i) / (y1 - y0) + .5) * (row ? 3 : 1));
          const xx = col ? [x0, x0 + lap, x0 + lap * 2, x1][ix] : [x0, x1][ix];
          const yy = row ? [y0, y0 + lap, y0 + lap * 2, y1][iy] : [y0, y1][iy];
          const foldX = col && ix < 2 ? 1 : 0, foldY = row && iy < 2 ? 2 : 0;
          // 右戸は最後に紙片の中心を左右へ写す。糊代の折り返しも紙片の中で
          // 同じ向きへ写し、重ねた中央ではなく外周の框の裏だけが浮くのを防ぐ。
          pos.setXYZ(i, (mirrored ? -1 : 1) * (xx - (x0 + x1) / 2), yy - (y0 + y1) / 2,
            pos.getZ(i) - paperT * (foldX + foldY));
          if (Math.abs(normal.getZ(i)) < .5) continue;
          const u = (xx + iw / 2) / iw;
          const v = (yy - .04) / ih;
          // 障子紙は表裏で同じ一枚。裏面だけ左右反転すると、
          // 補修紙と繊維むらが実際には反対側へ移り、透ける紙としてつながらない。
          // 建物内の同じ位置へ写し、裏から見た時の反転は面の向きに任せる。
          uv.setXY(i, u, v);
        }
        // 左右へ写した面の表裏もそろえる。負の倍率を描画や結合へ持ち越さず、
        // 紙を表裏から見ても同じ重ね代を保つ。左右それぞれの形は一度だけ作る。
        if (mirrored) {
          const indices = geo.index;
          for (let i = 0; i < indices.count; i += 3) {
            const second = indices.getX(i + 1);
            indices.setX(i + 1, indices.getX(i + 2));
            indices.setX(i + 2, second);
          }
        }
        geo.computeVertexNormals();
        shapes.set(key, geo);
      }
      paper.geometry = shapes.get(key);
    }
    // 半分に欠くのは交点だけ。交点の間は二十四ミリの厚みを残し、
    // 縦横の桟が全長で前後にずれた薄板にならないようにする。
    // 固定戸・動く戸・窓で同じ形を使い、設営時に既存の束へまとめる。
    const half = .009;
    for (let i = 1; i < 4; i++) {
      const x = -iw / 2 + iw * i / 4;
      let bottom = .04;
      for (let j = 1; j <= 6; j++) {
        const crossY = .04 + ih * j / 6;
        const top = j < 6 ? crossY - half : h - .04;
        moribeTimberBox(g, .018, top - bottom, .024, x, (bottom + top) / 2, 0, 0x795b3b);
        if (j < 6) moribeTimberBox(g, .018, .018, .012, x, crossY, .006, 0x795b3b);
        bottom = crossY + half;
      }
    }
    for (let j = 1; j < 6; j++) {
      const y = .04 + ih * j / 6;
      // 裏半分は通し、表半分だけ縦桟の左右で止める。
      moribeTimberBox(g, iw, .018, .012, 0, y, -.006, 0x795b3b);
      for (let i = 0; i < 4; i++) {
        const left = -iw / 2 + iw * i / 4 + (i ? half : 0);
        const right = -iw / 2 + iw * (i + 1) / 4 - (i < 3 ? half : 0);
        moribeTimberBox(g, right - left, .018, .012, (left + right) / 2, y, .006, 0x795b3b);
      }
    }
    // 框へ突き付けるだけにせず、縦横の組子の木口を五ミリ差して支える。
    // 仕口の奥に一ミリの遊びを残し、紙・引手・戸の溝には張り出さない。
    for (let i = 1; i < 4; i++) {
      const x = -iw / 2 + iw * i / 4;
      for (const y of [.0375, h - .0375]) moribeTimberBox(g, .018, .005, .024, x, y, 0, 0x795b3b, 1);
    }
    for (let j = 1; j < 6; j++) {
      const y = .04 + ih * j / 6;
      for (const x of [-iw / 2 - .0025, iw / 2 + .0025]) {
        moribeTimberBox(g, .005, .018, .024, x, y, 0, 0x795b3b, 0);
      }
    }
    // 六センチ厚の框の裏面へ、組子の裏面と紙の糊代をそろえる推定復元。
    // 組子を框の芯へ置いたままだと、外周の紙だけが框へ潜り込む。
    // 紙と組子を一緒に十八ミリ寄せ、框を足す前に設営時だけ位置を決める。
    // 窓・固定戸・動く戸は同じ部品を使い、戸幅・引手・横滑りは保つ。
    for (const part of g.children) part.position.z -= .018;
    frame(g, w, h, 0x795b3b, true, true, false, null, h - .034, true);
    // 右戸は引手と框の配置だけを左右へ写す。紙を張る裏面と組子の表面はそろえる。
    // 紙片内の折り返しは上で写してある。框・組子と一緒に中心を移し、負の倍率は使わない。
    if (mirrored) for (const part of g.children) part.position.x *= -1;
  } else { box(g, w - .04, h - .04, .025, 0, h / 2, 0, 0xffffff, 'shoji'); frame(g, w, h, 0x795b3b); }
  return g;
}
// 板戸：黒ずんだ杉の鏡板に、横の桟を五段（寺の堂・蔵の間仕切り）。一枚0.9m、足もと原点
export function itado(w = .9, h = 1.8, joined = false, mirrored = false) {
  const g = new THREE.Group();
  if (joined) {
    // 堂の固定板戸と動く板戸で、框の太さ・板割り・木栓をそろえる。
    g.scale.set(w / .9, h / 1.8, 1);
    w = .9; h = 1.8;
  }
  const rails = joined ? [h / 6, h / 3, h * .55, h * 2 / 3, h * 5 / 6] : null;
  if (joined) {
    // 森部の板戸は一枚の鏡板へ線を貼らず、縦板を桟でつなぐ推定復元。
    // 既存の板間の木目を共用し、框の内側で板ごとの木口と目地を見せる。
    // 板間の溝へ雇い実を挟む推定復元。一枚の薄い裏板で全面を塞がず、
    // 表裏に二ミリの目地を残し、継ぎ目だけで向こう側の光を止める。
    // 四周は框の溝へ五ミリ差し、板の端を框の表へ重ねない。
    const innerW = w - .08, innerH = h - .07, panelW = w - .07;
    const boards = Math.max(2, Math.round(panelW / .2));
    const boardW = panelW / boards;
    for (let i = 0; i < boards; i++) {
      // 外周は框の溝へ差す。板ごとに左右を削ると、框際にも光の隙間が残る。
      const left = -panelW / 2 + i * boardW + (i ? .001 : 0);
      const right = -panelW / 2 + (i + 1) * boardW - (i < boards - 1 ? .001 : 0);
      pullPanel(g, right - left, innerH, .03,
        (left + right) / 2, h / 2,
        w / 2 - .12, h * .47, .042, .092, 0x4a3828, 'boardsM', mirrored);
      if (i) moribeTimberBox(g, .012, innerH, .006,
        -panelW / 2 + i * boardW, h / 2, 0, 0x4a3828);
    }
    // 横桟は裏の板面へ掛ける。板の中央を貫く桟にせず、表は縦板を見せる。
    // 桟の裏面も框の厚さ六センチへ納め、引き違う二本の溝には出さない。
    // 等間隔の中央桟は、裏の掘込引手の上端へ重なって指の掛かる所を塞いでいた。
    // 中央だけ上へ逃がし、引手の木縁まで桟の間へ納める。固定戸・動く戸で共用する。
    for (const y of rails) {
      moribeTimberBox(g, innerW, .045, .015, 0, y, -.0225, 0x2e2218);
      // 裏桟の木口を框へ五ミリ差す推定復元。穴の奥と上下に一ミリの遊びを残す。
      // 固定戸と横滑りする戸で共用し、既存の木目・材質の束へまとめる。
      for (const side of [-1, 1]) moribeTimberBox(g, .005, .024, .015,
        side * (innerW / 2 + .0025), y, -.0225, 0x2e2218, 0);
    }
    // 木栓の木口は表の板面と裏の桟面へ付ける。板面から一センチ浮かせない。
    // 既存の箱と木の材質を使い、固定戸・動く戸とも設営時にまとめる。
    for (const y of rails) for (let i = 0; i < boards; i++) for (const side of [-1, 1]) {
      box(g, .014, .014, .002, -panelW / 2 + (i + .5) * boardW,
        y, side > 0 ? .016 : -.03, 0x4a3828);
    }
  } else box(g, w - .06, h - .06, .03, 0, h / 2, 0, 0x4a3828);
  if (!joined) for (let k = 1; k < 6; k++) box(g, w - .06, .045, .05, 0, h * k / 6, 0, 0x2e2218);
  frame(g, w, h, 0x241a12, joined, false, joined, null, h - .034, false, rails);
  // 森部の板戸も障子・格子戸と同じ高さに引手をそろえる。
  if (joined) {
    // 板を貫く黒い塊にせず、表裏の板面へ浅い掘込引手の底と木縁を納める推定復元。
    // 桟の間に収め、框より外へ出さない。動く戸も固定戸も同じ部品を使う。
    const px = w / 2 - .12, py = h * .47;
    for (const side of [-1, 1]) {
      box(g, .042, .092, .001, px, py, side * .0095, 0x1a1410);
      for (const x of [-.025, .025]) box(g, .008, .108, .008,
        px + x, py, side * .019, 0x2e2218);
      for (const y of [-.05, .05]) box(g, .042, .008, .008,
        px, py + y, side * .019, 0x2e2218);
    }
  } else box(g, .05, .1, .06, w / 2 - .12, .9, 0, 0x1a1410);
  // 右戸も鏡板と裏桟の面をそろえ、引手の位置だけ左右へ写す。
  if (joined && mirrored) for (const part of g.children) part.position.x *= -1;
  return g;
}
// 格子戸：寺の内陣と外陣の境。黒漆の框に細い縦格子と三本の貫。透けて奥の灯が見える
export function koshi(w = .9, h = 1.8, pull = false, mirrored = false) {
  const g = new THREE.Group();
  if (pull) {
    // 森部の固定戸と動く戸は同じ原寸の框・腰板・貫から作る。
    // 動く戸だけ拡縮すると、閉めた時に隣の腰板と貫の高さがずれる。
    g.scale.set(w / .9, h / 1.8, 1);
    w = .9; h = 1.8;
  }
  if (pull) {
    // 薬師堂の格子は腰板の上で止め、框の内側へ納める。
    // 腰板と同じ面へ縦格子を通すと、下半分が重なってちらつく。
    // 腰板は下框から下の貫まで、縦格子はその貫の上から上框までで受ける。
    const iw = w - .08, waistTop = .32 - .035 / 2, barBottom = .32 + .035 / 2;
    // 貫と縦格子を同じ場所へ貫通させず、交点は相欠きで組む推定復元。
    // 前後に半分ずつ残し、横から見た時も木同士が突き抜けないようにする。
    const rails = [.32, h * .55, h - .3];
    // 縦格子も貫と同じ四センチの見込みにそろえる。
    // 三センチの縦材では、相欠きの交点だけ表裏に五ミリの段差が残る。
    // 交点は二センチずつ残し、固定戸・動く戸とも表裏を面一に納める。
    for (let k = 1; k < 9; k++) {
      const x = -iw / 2 + k * iw / 9;
      let bottom = barBottom;
      for (const top of [rails[1] - .0175, rails[2] - .0175, h - .04]) {
        moribeTimberBox(g, .022, top - bottom, .04, x, (bottom + top) / 2, 0, 0x2a1c12);
        if (top < h - .04) moribeTimberBox(g, .022, .035, .02, x, top + .0175, .01, 0x2a1c12);
        bottom = top + .035;
      }
      // 上框と下貫へ短いほぞを差し、縦格子を突き付けただけにしない推定復元。
      // 下貫も同寸の穴で受け、腰板の溝・相欠き・戸の外寸は保つ。
      for (const y of [barBottom - .0025, h - .0375]) {
        moribeTimberBox(g, .022, .005, .02, x, y, 0, 0x2a1c12, 1);
      }
    }
    for (let j = 0; j < rails.length; j++) {
      if (j === 0) {
        // 腰板を下貫へ五ミリ差し、六ミリの溝で受ける推定復元。
        // 溝底に一ミリ、表裏に二ミリの遊びを残し、貫の木と板を重ねない。
        // 下側は腰板の溝、上側は縦格子のほぞ穴。間に木を通して両方を受ける。
        moribeTimberBox(g, iw, .035 - .012, .04, 0, rails[j], 0, 0x2a1c12);
        for (const side of [-1, 1]) moribeTimberBox(g, iw, .006, .009,
          0, barBottom - .003, side * .0155, 0x2a1c12);
        for (let k = 0; k < 9; k++) {
          const left = -iw / 2 + iw * k / 9 + (k ? .012 : 0);
          const right = -iw / 2 + iw * (k + 1) / 9 - (k < 8 ? .012 : 0);
          moribeTimberBox(g, right - left, .006, .022, (left + right) / 2,
            barBottom - .003, 0, 0x2a1c12, 0);
        }
        for (const side of [-1, 1]) moribeTimberBox(g, iw, .006, .003,
          0, waistTop + .003, side * .0185, 0x2a1c12);
        continue;
      }
      // 縦格子の間は貫の全厚を残し、交点だけ裏半分でつなぐ。
      for (let k = 0; k < 9; k++) {
        const left = -iw / 2 + iw * k / 9 + (k ? .011 : 0);
        const right = -iw / 2 + iw * (k + 1) / 9 - (k < 8 ? .011 : 0);
        moribeTimberBox(g, right - left, .035, .04, (left + right) / 2, rails[j], 0, 0x2a1c12);
        if (k) moribeTimberBox(g, .022, .035, .02, -iw / 2 + iw * k / 9, rails[j], -.01, 0x2a1c12);
      }
    }
    // 腰板は框と下貫の間へ納め、板同士を相じゃくりで継ぐ推定復元。
    // 全面の裏板で目地を塞がず、厚さ三センチの前後を半分ずつ欠き、
    // 裏の継ぎ目を一センチずらして受ける。表裏とも板目と目地を残す。
    // 固定戸・動く戸で形と材質を共用し、戸厚と二本の溝は保つ。
    // 左右と下も框の六ミリの溝へ五ミリ差す。格子の開口部は彫らず、
    // 腰板の高さだけを受ける。固定戸・動く戸とも同じ共用部品で納める。
    const panelW = iw + .01, panelBottom = .035, panelTop = waistTop + .005;
    const boards = Math.max(2, Math.round(panelW / .2)), boardW = panelW / boards;
    for (let k = 0; k < boards; k++) for (let side = 0; side < 2; side++) {
      const left = -panelW / 2 + k * boardW + (side && k > 0 ? .01 : 0);
      const right = -panelW / 2 + (k + 1) * boardW + (side && k < boards - 1 ? .01 : 0);
      // 四周の差し込みは残し、板間だけ二ミリの目地を取る。
      const start = left + (k > 0 ? .001 : 0), end = right - (k < boards - 1 ? .001 : 0);
      moribeTimberBox(g, end - start, panelTop - panelBottom, .015,
        (start + end) / 2, (panelTop + panelBottom) / 2, side ? -.0075 : .0075, 0x3a2a1c);
    }
  } else {
    for (let k = 1; k < 9; k++) box(g, .022, h - .06, .03, -w / 2 + k * w / 9, h / 2, 0, 0x2a1c12);
    for (const y of [.32, h * .55, h - .3]) box(g, w - .06, .035, .04, 0, y, 0, 0x2a1c12);
    box(g, w - .06, .26, .03, 0, .16, 0, 0x3a2a1c);
  }
  frame(g, w, h, 0x1e140e, pull, pull, pull, pull ? [.32, h * .55, h - .3] : null,
    pull ? .32 - .035 / 2 + .006 : h - .034, pull ? 'koshi' : false);
  // 森部の右戸も格子と貫の相欠きの表裏を保ち、引手だけ召合せへ向ける。
  // 半回転で裏返さず、障子と同じく部品の中心を左右へ写す。
  if (pull && mirrored) for (const part of g.children) part.position.x *= -1;
  return g;
}
export function tatami(w = .9, d = 1.8, thickness = .06, woven = false) {
  // 森部の畳は畳表と麻の畳縁を別々に織った共通部品で仕上げる。
  // 汎用の購入畳で早戻りすると、下の畳縁と寸法に合う織り目が作られない。
  const kit = woven ? null : bought('tatami_floor_modular_a', w, thickness, d);
  const g = new THREE.Group();
  const heriW = .044;
  // 素材に穴や切り欠きがあっても、下の暗い基壇を床のすき間として見せない。
  if (woven) {
    // 森部は藁床の木口と畳表を分ける。入口から見える側面まで藺草の表で包まない。
    // 床・畳寄せと同じ高さを保ち、薄い表だけを藁床の上へ載せる推定復元。
    const surfaceH = Math.min(.001, thickness / 4), coreH = thickness - surfaceH;
    // 長辺の縁は表と藁床の両脇へ納める。同じ面に布と藺草を重ねると、
    // 上面と短辺の木口でちらつく。外寸・床高を保ち、短辺は縁で包まない。
    const innerW = w - heriW * 2;
    // 畳縁の下にも藁床を通す。縁の幅全部を布の塊にせず、
    // 左右一ミリだけ布の折り返しへ譲り、短辺には藁の木口を見せる。
    const coreW = w - surfaceH * 2;
    const core = box(g, coreW, coreH, d, 0, coreH / 2, 0, 0xffffff, 'waraM');
    // 畳幅が違っても藁の太さを変えない。絵は幅三十センチ・厚さ六・二センチ分。
    // 元の箱をそのまま使い、寸法ごとの写し方だけを設営時に一度作る。
    const coreKey = `moribe:藁床:${coreW}:${coreH}:${d}`;
    if (!shapes.has(coreKey)) {
      const geo = core.geometry.clone(), pos = geo.attributes.position, normal = geo.attributes.normal, uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) {
        const side = Math.abs(normal.getX(i)) > .5, top = Math.abs(normal.getY(i)) > .5;
        uv.setXY(i, (side ? pos.getZ(i) : pos.getX(i)) / .3,
          top ? pos.getZ(i) / .3 : (pos.getY(i) + coreH / 2) / .062);
      }
      shapes.set(coreKey, geo);
    }
    core.geometry = shapes.get(coreKey);
    const surface = box(g, innerW, surfaceH, d, 0, thickness - surfaceH / 2, 0, 0xffffff, 'tatamiM');
    // 二棟で幅の違う畳も、同じ細かさの藺草と織り糸にする。
    // 共有材質の繰り返し数は変えず、寸法ごとに一度だけ形へ写す。
    const key = `moribe:畳表:${w}:${d}:${surfaceH}`;
    if (!shapes.has(key)) {
      const geo = surface.geometry.clone(), pos = geo.attributes.position, normal = geo.attributes.normal, uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) {
        const side = Math.abs(normal.getX(i)) > .5, end = Math.abs(normal.getZ(i)) > .5;
        uv.setXY(i, (side ? pos.getY(i) : pos.getX(i)) / .9 + .5,
          (end ? pos.getY(i) : -pos.getZ(i)) / 1.8 + .5);
      }
      shapes.set(key, geo);
    }
    surface.geometry = shapes.get(key);
    // 短辺は黒い畳縁で包まず、表を藁床へ留める縫い糸を見せる推定復元。
    // 上面から木口へ糸を回し、縁の下へは出さない。箱と麻色の材質を共用し、
    // 部屋の静止した形へまとめる。糸は表面へ一ミリ出し、歩く高さは変えない。
    const stitches = Math.max(2, Math.round(innerW / .18));
    for (let i = 0; i < stitches; i++) {
      const x = -innerW / 2 + (i + .5) * innerW / stitches;
      for (const side of [-1, 1]) {
        box(g, .002, .001, .018, x, thickness + .0005,
          side * (d / 2 - .009), 0x9b8057);
        box(g, .002, .022, .001, x, thickness - .011,
          side * (d / 2 + .0005), 0x9b8057);
      }
    }
  } else box(g, w, kit ? .045 : thickness, d, 0, kit ? .0225 : thickness / 2, 0, 0xffffff, 'tatami');
  if (kit) { g.add(kit); return g; }
  // 畳縁（黒の麻）：長い辺だけに付ける
  for (const x of [-w / 2 + heriW / 2, w / 2 - heriW / 2]) {
    if (!woven) {
      box(g, heriW, .066, d, x, .033, 0, 0x1d1c18);
      continue;
    }
    // 森部の畳縁は薄い麻布を上から側面へ折る推定復元。
    // 藁床と表の上端は従来どおり。上面と側面は木口で突き合わせ、
    // 重なった面を作らず、寸法ごとの形と既存の布材質を共用する。
    const clothH = Math.min(.001, thickness / 4), sideH = thickness - clothH;
    const wrap = (ww, hh, xx, yy, fold) => {
      const edge = box(g, ww, hh, d, xx, yy, 0, 0xffffff, 'heriM');
      // 幅四・四センチの縁へ正方形の絵を縮めず、長手だけ繰り返す。
      // 共用の形は書き換えない。縁用の形も寸法ごとに一度だけ作る。
      const key = `moribe:畳縁:${ww}:${hh}:${d}:${fold}`;
      if (!shapes.has(key)) {
        const geo = edge.geometry.clone(), pos = geo.attributes.position, normal = geo.attributes.normal, mapped = geo.attributes.uv;
        for (let i = 0; i < mapped.count; i++) {
          const side = Math.abs(normal.getX(i)) > .5, end = Math.abs(normal.getZ(i)) > .5;
          // 折り返す角から布幅の座標を続け、上面と側面の織り目をつなぐ。
          const across = fold && side
            ? (fold > 0 ? 1 : 0) + fold * (sideH - yy - pos.getY(i)) / .044
            : (side ? pos.getY(i) : pos.getX(i)) / .044 + .5;
          mapped.setXY(i, across,
            (end ? pos.getY(i) : pos.getZ(i)) / .044);
        }
        shapes.set(key, geo);
      }
      edge.geometry = shapes.get(key);
    };
    wrap(heriW, clothH, x, thickness - clothH / 2, 0);
    const side = Math.sign(x);
    wrap(clothH, sideH, side * (w / 2 - clothH / 2), sideH / 2, side);
  }
  return g;
}
function inabaItado(w = .9, h = 1.8, inaba = false, reverseRails = false) {
  const g = new THREE.Group();
  if (inaba) {
    // 稲葉山の用屋は幅広の一枚板にせず、縦板を裏桟で留めた推定の板戸。
    // 三枚の板を框の内側へ納め、両面から継ぎ目が見えるようにする。
    // 溝と当たりに収まる厚みを保ち、共通の束へ一度だけまとめる。
    const fittedPanel = S.quality === 'high';
    const panelInset = fittedPanel ? .04 : .03;
    const width = (w - panelInset * 2) / 3;
    if (fittedPanel) {
      // 板端は厚いまま框へ食い込ませず、薄い実を五ミリ差し込む推定の納まり。
      // 目地の実と四周の差し込みは一枚へまとめ、重なる面のちらつきを防ぐ。
      // 表裏の板面は框の内面で止め、戸の外寸・引き溝・当たりは保つ。
      box(g, w - .07, h - .07, .01, 0, h / 2, 0, 0x2e2218, 'inabaBoard');
    }
    // 板戸も平らな茶色だけにせず、既存の板目を縦板の表裏へ通す。
    // 高画質の共通材質へまとめ、引き戸の幅・溝・当たりは保つ。
    for (let j = 0; j < 3; j++) {
      const x = -w / 2 + panelInset + (j + .5) * width;
      box(g, width - .004, h - panelInset * 2, .03, x,
        h / 2, 0, j === 1 ? 0x51402e : 0x4a3828, fittedPanel ? 'inabaBoard' : '');
    }
    // 右の戸は引手を内へ向けるため半回転する。裏桟を先に反対面へ置き、
    // 建て込んだ後は左右とも同じ裏面へ揃える。
    for (const t of [.22, .5, .78]) {
      // 裏桟は左右の縦框の内面で止め、木目を横へ通す。
      // 縦板と共通の絵・形を使い、戸の厚みと二本の溝は保つ。
      // 高画質では裏桟を框の厚み内へ納める推定の造り。
      // 板裏で受け、框面から一ミリ控える。戸の外寸と開閉の軌道は保つ。
      const fittedRail = S.quality === 'high';
      const railZ = (reverseRails ? 1 : -1) * (fittedRail ? .022 : .024);
      doorTimber(g, w - (fittedRail ? .08 : .06), .065, fittedRail ? .014 : .018,
        0, h * t, railZ, 0x2e2218, fittedRail);
      if (fittedRail) for (const side of [-1, 1])
        // 桟端は薄いほぞで縦框へ五ミリ差す推定。表面を重ねず、共通の木部へまとめる。
        doorTimber(g, .005, .035, .008, side * (w / 2 - .0375),
          h * t, railZ, 0x2e2218, true);
      if (S.quality === 'high') {
        // 番所・板倉・長屋の板戸は、三枚の縦板を裏桟へ釘で留める推定の造り。
        // 桟と反対の板面へ角釘の頭を納め、右戸を回しても留める面を揃える。
        // 裏桟側には釘先を折り返す推定の納まり。表の釘頭だけで終わらせず、
        // 板と桟を両面で留める。右戸を回しても釘先は同じ裏面へ揃える。
        // 框の厚み（三センチ）内へ納め、共通の箱・鉄の材質で設営時にまとめる。
        const back = reverseRails ? 1 : -1;
        for (let j = 0; j < 3; j++) {
          const nailX = -w / 2 + panelInset + (j + .5) * width;
          box(g, .014, .014, .003, nailX, h * t, -back * .0165, 0x252321);
          // 桟の裏面は二十九ミリ。折った先を一ミリ厚にして溝へ突き出さない。
          box(g, .005, .007, .001, nailX, h * t, back * .0295, 0x252321);
          box(g, .005, .018, .001, nailX, h * t - .0125, back * .0295, 0x252321);
        }
      }
    }
  } else {
    box(g, w - .06, h - .06, .03, 0, h / 2, 0, 0x4a3828);
    for (let k = 1; k < 6; k++) box(g, w - .06, .045, .05, 0, h * k / 6, 0, 0x2e2218);
  }
  inabaFrame(g, w, h, 0x241a12, inaba && S.quality === 'high', inaba && S.quality === 'high', inaba && S.quality === 'high');
  if (inaba) {
    // 用屋の板戸も縦框の両面に引手を納める。板面へ黒い塊を浮かせない。
    // 障子・格子戸と同じ召し合わせ側に置き、二本の引き溝へ突き出さない。
    for (const z of S.quality === 'high' ? [-.021, .021] : [-.031, .031])
      box(g, .022, .09, .002, w / 2 - .02, h * .5, z, 0x1a1410);
  } else box(g, .05, .1, .06, w / 2 - .12, .9, 0, 0x1a1410);
  return g;
}
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
// 森部の屋敷の書き物道具は推定復元。座卓の原寸で、絵と当たりに同じ部材表を渡す。
// 幅・高さ・奥行き・中心の横位置・底の高さ・中心の奥行き・色。
export const MORIBE_WRITING_TOOLS = [
  [.36, .002, .28, -.2, .46, .04, 0xcfc3a2], // 字を描かない料紙
  [.14, .012, .24, .3, .46, -.06, 0x252321], // 硯の底
  [.012, .012, .24, .236, .472, -.06, 0x252321],
  [.012, .012, .24, .364, .472, -.06, 0x252321],
  [.116, .012, .012, .3, .472, -.174, 0x252321],
  [.116, .012, .012, .3, .472, .054, 0x252321],
  [.116, .007, .108, .3, .472, 0, 0x252321], // 手前の陸と奥のくぼんだ海
  [.025, .012, .07, .3, .479, .005, 0x1a1410], // 陸に置いた墨
  [.008, .008, .24, .13, .46, .09, 0x9b8057], // 筆軸
  [.012, .008, .045, .13, .46, .2325, 0x3a2a1c], // 筆の穂
];

export function tsukue(braced = false) {
  const g = new THREE.Group();
  const wood = braced ? timberBox : box;
  if (braced) {
    // 森部の座卓は推定復元。幅をそろえた三枚の天板を裏の横木で受ける。
    // 継ぎ目の下にも木を残し、畳まで抜ける隙間にしない。
    // 無地の箱材をやめ、建具と共用の木目を各材の長手へ通す。
    // 天板の表は横目、脚は縦目、切断面は木口とし、二棟で形と材質を使い回す。
    // 脚身を下張りへ食い込ませず、脚先の三センチ角のほぞだけを差す。
    // 下張りも同寸で欠き、天板の下面へほぞの上端を納める推定復元。
    // 二棟で同じ形・材質を使い、完成時にほかの木部とまとめる。
    const halfTenon = .015;
    const backingRows = [-.35, -.24 - halfTenon, -.24 + halfTenon,
      .24 - halfTenon, .24 + halfTenon, .35];
    for (let i = 1; i < backingRows.length; i++) {
      const back = backingRows[i - 1], front = backingRows[i];
      const spans = i === 2 || i === 4
        ? [[-.6, -.48 - halfTenon], [-.48 + halfTenon, .48 - halfTenon], [.48 + halfTenon, .6]]
        : [[-.6, .6]];
      for (const [left, right] of spans) wood(g, right - left, .02, front - back,
        (left + right) / 2, .39, (back + front) / 2, 0x493022, 0);
    }
    for (let i = 0; i < 3; i++) wood(g, 1.2, .06, .7 / 3 - .002,
      0, .43, -.35 + (i + .5) * .7 / 3, i % 2 ? 0x503827 : 0x493022);
    // 幕板は脚の内面で止め、左右の貫で脚の開きを抑える。
    // 既存の座卓と同じ外寸・材質に納め、調度の当たりや通り道を変えない。
    for (const z of [-.24, .24]) wood(g, .89, .07, .04, 0, .345, z, 0x493022);
    for (const x of [-.48, .48]) {
      wood(g, .04, .07, .41, x, .345, 0, 0x493022);
      wood(g, .04, .045, .41, x, .13, 0, 0x493022);
    }
  } else box(g, 1.2, .08, .7, 0, .42, 0, 0x493022);
  for (const x of [-.48, .48]) for (const z of [-.24, .24]) {
    const legH = braced ? .38 : .4;
    if (braced) {
      // 下貫の肩を脚へ突き付けるだけにせず、細い通しほぞで留める推定復元。
      // 脚は穴の上下と左右の頬に分け、木同士を同じ場所へ重ねない。
      // 脚の外寸と下貫の肩は保ち、既存の木目・材質の束へまとめる。
      const mortiseBottom = .1175, mortiseTop = .1425, tenonWidth = .02;
      wood(g, .07, mortiseBottom, .07, x, mortiseBottom / 2, z, 0x493022, 1);
      wood(g, .07, legH - mortiseTop, .07,
        x, (mortiseTop + legH) / 2, z, 0x493022, 1);
      for (const side of [-1, 1]) wood(g, .025, .025, .07,
        x + side * .0225, .13, z, 0x493022, 1);
      // 貫の細いほぞだけ脚を抜き、木口を外へ二ミリ出す。
      // 横木の長手は奥行き方向、脚身は縦目のままにする。
      wood(g, tenonWidth, .025, .072,
        x, .13, z + Math.sign(z) * .001, 0x493022, 2);
      // 横から打つ込栓がほぞを押さえる。木口だけ脚の両側面へ出す。
      for (const side of [-1, 1]) wood(g, .004, .01, .01,
        x + side * .035, .13, z, 0x6a5038, 0);
      wood(g, .03, .02, .03, x, .39, z, 0x493022, 1);
      // 幕板を受ける脚の表裏へ込栓の木口を出し、留め付けを見せる。
      // 板の面と重ねず、脚から二ミリだけ出す。引き戸の通り道は空ける。
      for (const side of [-1, 1]) wood(g, .012, .012, .004,
        x, .345, z + side * .035, 0x6a5038, 2);
    } else wood(g, .07, legH, .07, x, legH / 2, z, 0x493022);
  }
  // 既存の箱と色を共用し、二棟とも設営時に室内の静止した形へまとめる。
  if (braced) for (const [w, h, d, x, bottom, z, color] of MORIBE_WRITING_TOOLS) {
    box(g, w, h, d, x, bottom + h / 2, z, color);
  }
  return g;
}
export function tomyo(oil = false) {
  if (oil) {
    // 小堂の須弥壇には低い灯明皿。油面を皿の内側へ納め、縁へ渡した灯芯に火を置く。
    // 全ての皿で形と材質を共有し、光源や毎コマの処理を増やさない。
    const g = new THREE.Group();
    const bowl = '小堂の灯明皿', rim = '小堂の灯明皿の縁', surface = '小堂の灯明の油', flame = '小堂の灯明の火';
    const wickKey = '小堂の灯明の灯芯';
    // 底のない筒では下から油の裏が見える。底と内壁を一続きにし、油面は内側へ収める。
    if (!shapes.has(bowl)) shapes.set(bowl, new THREE.LatheGeometry([
      new THREE.Vector2(0, -.0225), new THREE.Vector2(.045, -.0225),
      new THREE.Vector2(.085, -.005), new THREE.Vector2(.105, .0225),
      new THREE.Vector2(.097, .0225), new THREE.Vector2(.08, -.003),
      new THREE.Vector2(.037, -.0145), new THREE.Vector2(0, -.0145),
    ], 12));
    if (!shapes.has(rim)) shapes.set(rim, new THREE.TorusGeometry(.102, .006, 4, 12));
    if (!shapes.has(surface)) shapes.set(surface, new THREE.CylinderGeometry(.087, .087, .003, 12));
    // 灯芯は油へ浸す端から皿の縁まで斜めに渡す。油面の上に浮いた角材にしない。
    // 炎の下端も灯芯の先へ接し、丸い光の玉ではなく先の尖った形にする。
    // 二基の灯明で原形を共有し、既存の須弥壇の束へまとめる。
    const wickRise = .02, wickRun = .05;
    if (!shapes.has(wickKey)) shapes.set(wickKey,
      new THREE.CylinderGeometry(.0035, .0035, Math.hypot(wickRise, wickRun), 6));
    if (!shapes.has(flame)) shapes.set(flame, new THREE.LatheGeometry([
      new THREE.Vector2(0, -.032), new THREE.Vector2(.006, -.025),
      new THREE.Vector2(.011, -.012), new THREE.Vector2(.008, .002),
      new THREE.Vector2(.003, .023), new THREE.Vector2(0, .035),
    ], 8));
    box(g, .18, .025, .18, 0, .0125, 0, 0x514337);
    box(g, .035, .2, .035, 0, .125, 0, 0x615744);
    for (const [key, yy, color] of [[bowl, .2475, 0x76654d], [rim, .27, 0x76654d], [surface, .26, 0x8b713e], [flame, .31, 0xffd08b]]) {
      const m = new THREE.Mesh(shapes.get(key), mat(color));
      if (key === rim) m.rotation.x = Math.PI / 2;
      m.position.set(0, yy, key === flame ? .05 + wickRun : 0);
      cacheUsers.push(new WeakRef(m)); g.add(m);
    }
    const wick = new THREE.Mesh(shapes.get(wickKey), mat(0x403122));
    wick.rotation.x = Math.atan2(wickRun, wickRise);
    wick.position.set(0, .258 + wickRise / 2, .05 + wickRun / 2);
    cacheUsers.push(new WeakRef(wick)); g.add(wick);
    return g;
  }
  const kit = bought('japanese_lamp_emissive', .32, .95, .32); if (kit) return kit;
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
  // 笠の下面は上框の上端（一・一五三メートル）で受ける。
  // 従来の笠は上框へ一・八センチ沈んでいたため、笠の厚みを詰める。
  // 頂部と宝珠の差し込みは保ち、火袋の框を笠で埋めない推定の納まり。
  // 一つの形を全棟で共有し、既存のまとめ描きへ含める。
  const roofBottom = 1.153, roofTop = 1.225;
  if (!shapes.has('hieiLampRoof')) shapes.set('hieiLampRoof',
    new THREE.CylinderGeometry(.06, .22, roofTop - roofBottom, 4, 1).rotateY(Math.PI / 4));
  const roof = new THREE.Mesh(shapes.get('hieiLampRoof'), mat(bronze));
  cacheUsers.push(new WeakRef(roof)); roof.position.y = (roofBottom + roofTop) / 2; g.add(roof);
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
    // 索引の有無や uv の有無が混じると mergeGeometries は null を返す（比叡山の堂の中で落ちた）。
    // 混じる時は、共通の属性だけの索引なしにそろえてから束ねる。
    const sig = (g) => (g.index ? 'i' : 'n') + Object.keys(g.attributes).sort().join();
    let geo = list.every((g) => sig(g) === sig(list[0])) ? mergeGeometries(list) : null;
    if (!geo) {
      const flat = list.map((g) => g.index ? g.toNonIndexed() : g);
      const keys = ['position', 'normal', 'uv'].filter((k) => flat.every((g) => g.attributes[k]));
      geo = mergeGeometries(flat.map((g) => { const n = new THREE.BufferGeometry(); for (const k of keys) n.setAttribute(k, g.attributes[k]); return n; }));
      flat.forEach((g) => { if (!list.includes(g)) g.dispose(); });
    }
    list.forEach((g) => g.dispose());
    if (!geo) continue;
    const mesh = new THREE.Mesh(geo, material); out.add(mesh);
  }
  return out;
}
// 寺の破れる襖にも同じ部品を使う。部品内の材質ごとに一つの群れにして描く。
function villagePanelInstances(kind, count, w = .9, h = 1.8) {
  // 設楽原の建具は実寸の原形を共有し、腰板・組子・框・引手を伸縮させない。
  const key = kind + ':' + w + ':' + h + ':' + (cgtOn() && cgtHas('slide_door_a'));
  const waist = kind === 'shojiKoshi' || kind === 'shojiKoshiRight';
  const villageBoard = kind === 'itadoVillage' || kind === 'itadoVillageRight';
  const templeDoor = kind === 'koshiHikite' || kind === 'koshiHikiteRight';
  if (!panels.has(key)) panels.set(key, batchInterior(kind === 'fusumaPlain' || kind === 'fusumaVillage' ? villageFusuma(w, h, false, true, kind === 'fusumaVillage') : kind === 'fusuma' ? villageFusuma(w, h) : kind === 'fusumaE' ? villageFusuma(w, h, true) : kind === 'itado' || villageBoard ? villageItado(w, h, villageBoard, kind === 'itadoVillageRight') : kind === 'koshiHiei' ? hieiKoshi(w, h, true) : kind === 'shojiHiei' ? hieiShoji(w, h, true) : kind === 'koshi' || templeDoor ? villageKoshi(w, h, templeDoor, templeDoor, kind === 'koshiHikiteRight') : villageShoji(w, h, waist || kind === 'shojiKumiko' || kind === 'shojiKumikoRight', kind === 'shojiKumikoRight' || kind === 'shojiKoshiRight', waist, waist || kind === 'shojiKumiko' || kind === 'shojiKumikoRight')));
  return panels.get(key).children.map(m => { const copy = new THREE.InstancedMesh(m.geometry, m.material, Math.max(1, count)); cacheUsers.push(new WeakRef(copy)); return copy; });
}
export function panelInstances(kind, count, w = .9, h = 1.8) {
  if (arguments.length === 4 && typeof w === 'number' && ['fusumaVillage', 'fusumaPlain', 'shojiKumiko', 'shojiKumikoRight', 'shojiKoshi', 'shojiKoshiRight', 'itadoVillage', 'itadoVillageRight', 'koshiHikite', 'koshiHikiteRight'].includes(kind)) return villagePanelInstances(kind, count, w, h);
  if (!kind.endsWith('M') && !kind.endsWith('MR')) return mainPanelInstances(kind, count, arguments[2], arguments[3], arguments[4]);
  const key = kind + ':' + (cgtOn() && cgtHas('slide_door_a'));
  if (!panels.has(key)) panels.set(key, batchInterior(kind === 'fusuma' ? fusuma() : kind === 'fusumaM' || kind === 'fusumaMR' ? fusuma(.9, 1.8, false, true, kind === 'fusumaMR') : kind === 'fusumaE' ? fusuma(.9, 1.8, true) : kind === 'itado' || kind === 'itadoM' || kind === 'itadoMR' ? itado(.9, 1.8, kind !== 'itado', kind === 'itadoMR') : kind === 'koshi' || kind === 'koshiM' || kind === 'koshiMR' ? koshi(.9, 1.8, kind !== 'koshi', kind === 'koshiMR') : shoji(.9, 1.8, kind === 'shojiM' || kind === 'shojiMR', kind === 'shojiMR')));
  return panels.get(key).children.map((m) => { const copy = new THREE.InstancedMesh(m.geometry, m.material, Math.max(1, count)); cacheUsers.push(new WeakRef(copy)); return copy; });
}
function mainPanelInstances(kind, count, inaba = false, w = .9, h = 1.8) {
  const key = kind + ':' + (cgtOn() && cgtHas('slide_door_a')) + ':' + inaba + ':' + w + ':' + h;
  // 小窓へ背の高い戸を縮めると、框・組子・引手まで細くなる。
  // 稲葉山は実寸で組み、同じ種類・寸法の戸で形と材質を共有する。
  if (!panels.has(key)) panels.set(key, inaba ? batchInterior(kind === 'fusuma' ? inabaFusuma(w, h, false, inaba) : kind === 'fusumaE' ? inabaFusuma(w, h, true, inaba) : kind === 'itado' || kind === 'itadoR' ? inabaItado(w, h, inaba, kind === 'itadoR') : kind === 'koshi' || kind === 'koshiR' ? inabaKoshi(w, h, inaba, kind === 'koshiR') : inabaShoji(w, h, inaba, kind === 'shojiR')) : batchInterior(kind === 'fusuma' ? hieiFusuma(w, h) : kind === 'fusumaPlain' ? hieiFusuma(w, h, false, true) : kind === 'fusumaE' ? hieiFusuma(w, h, true) : kind === 'itado' || kind === 'itadoHiei' ? hieiItado(w, h, kind === 'itadoHiei') : kind === 'koshi' || kind === 'koshiHiei' ? hieiKoshi(w, h, kind === 'koshiHiei') : hieiShoji(w, h, kind === 'shojiHiei')));
  return panels.get(key).children.map((m) => { const copy = new THREE.InstancedMesh(m.geometry, m.material, Math.max(1, count)); cacheUsers.push(new WeakRef(copy)); return copy; });
}
// 二本の溝は戸の中心（前後各四センチ）に合わせる。左右へ引いた戸の下にも敷居を続ける。
export function slidingDoorTrack(w, h, window = false, wallOffset = 0, entry = false) {
  // 明かり障子は窓の内側で重ねる。引き込み用の長い敷居を隣の柱まで突き出させない。
  // 横材の木口は戸当たりの内面で止める。縦枠と同じ見込みのまま
  // 芯を越えると、敷居・鴨居の端で表裏の面が重なってちらつく。
  // 窓の縦枠は幅六センチ、通行用の戸当たりは幅四センチ。
  const g = new THREE.Group(), span = window ? w : w * 2 + .04;
  // 設楽原の敷居・鴨居・戸当たりは無地の角材にせず、木目を各材の長手へ通す。
  // 建具と同じ木の絵を使い、横材と縦材で絵の向きだけ変える。
  // 寸法ごとの原形と材質を共有し、既存の静止した木枠の束へまとめる。
  const timber = (w, h, d, x, y, z, color) => timberBox(g, w, h, d, x, y, z, color);
  for (const upper of [false, true]) {
    // 戸の下端は敷居の溝底で受け、上端は鴨居の溝へ差し込む。
    // 以前は上下とも溝底まで十五ミリ空き、戸が浮いて見えた。
    // 外寸と戸の高さは保ち、溝の両岸だけを戸の上下へ二十五ミリ掛ける。
    timber(span, .055, .22, 0, upper ? h + .0275 : -.0275, 0, 0x493829);
    for (const z of [-.095, 0, .095]) timber(span, .025, .015, 0, upper ? h - .0125 : .0125, z, 0x3a2a1c);
  }
  if (!window && !entry && Math.abs(wallOffset) > .16) {
    // 設楽原の間仕切りは戸の下端が床から六センチ。
    // 溝底の下に残っていた五ミリの隙間を敷板で受け、床から敷居を浮かせない。
    // 固定建具側との隙間も埋め、二列の敷居を一続きの木口にする。
    // 溝と戸の通りは保ち、共通の箱・材質で静止した木枠へまとめる。
    timber(span, .005, .22, 0, -.0575, 0, 0x493829);
    const depth = Math.abs(wallOffset) - .16;
    timber(span, .06, depth, 0, -.03,
      -Math.sign(wallOffset) * (.11 + depth / 2), 0x493829);
  }
  if (window && Math.abs(wallOffset) > .11) {
    // 設楽原の明かり障子は壁より室内側。窓枠の四周を内壁まで延ばし、
    // 敷居を宙に浮かせず、開けた窓の脇から壁の裏側が見える隙間もふさぐ。
    // 溝の外端で木口を突き付け、動く戸の二本の溝には材を重ねない。
    const depth = Math.abs(wallOffset) - .11;
    const z = -Math.sign(wallOffset) * (.11 + depth / 2);
    for (const upper of [false, true])
      timber(span, .055, depth, 0, upper ? h + .0275 : -.0275, z, 0x493829);
    // 窓脇の見込みは厚い一枚の塊にせず、四周の框で薄い羽目板を受ける推定の納まり。
    // 板を溝側へ張り出させず、元の六センチの外寸に収める。木枠の当たりは共用する。
    const stile = Math.min(.025, depth / 4), rail = Math.min(.045, h / 4);
    const fieldDepth = depth - stile * 2, fieldH = h - rail * 2;
    const boards = Math.max(1, Math.ceil(fieldDepth / .15)), joint = .003;
    for (const side of [-1, 1]) {
      const x = side * (w / 2 + .03);
      for (const edge of [-1, 1]) {
        timber(.06, h, stile, x, h / 2, z + edge * (depth - stile) / 2, 0x493829);
        timber(.06, rail, fieldDepth, x, h / 2 + edge * (h - rail) / 2, z, 0x493829);
      }
      // 目地の奥には裏板を残す。窓を開けた時も壁裏まで透かさない。
      timber(.012, fieldH, fieldDepth, x + side * .024, h / 2, z, 0x30221a);
      for (let i = 0; i < boards; i++) {
        const back = z - fieldDepth / 2 + fieldDepth * i / boards + (i ? joint / 2 : 0);
        const front = z - fieldDepth / 2 + fieldDepth * (i + 1) / boards - (i + 1 < boards ? joint / 2 : 0);
        timber(.048, fieldH, front - back, x - side * .006, h / 2,
          (back + front) / 2, i % 2 ? 0x493829 : 0x513e2c);
      }
    }
  } else if (wallOffset !== 0) {
    // 間仕切りの手前へ出した鴨居を、壁側の鴨居と小壁へつなぐ受け材。
    // 溝の上に載せ、滑る戸や引手の通り道へは下ろさない。
    timber(span, .06, Math.abs(wallOffset) + .22, 0, h + .085, -wallOffset / 2, 0x493829);
  }
  if (window) for (const side of [-1, 1])
    timber(.06, h + .11, .22, side * (w / 2 + .03), h / 2, 0, 0x493829);
  else for (const side of [-1, 1]) {
    // 全開の戸の外端は戸口の中心から一口幅。敷居と鴨居の端を戸当たりで結ぶ。
    // 召し合わせの重なり分も空け、滑る框へ木を食い込ませない。
    timber(.04, h + .11, .22, side * (w + .04), h / 2, 0, 0x493829);
  }
  if (!window && Math.abs(wallOffset) > .11) {
    // 外壁より内側へ引いた入口の両端を、壁まで板で閉じる推定の納まり。
    // 戸の引き込み先の外に置き、閉じた板戸の横を回って入れないようにする。
    // 間仕切り側は固定建具の表面で止める。引き込み端の裏を開けたままにせず、
    // 襖・障子・格子戸の溝を側板で納める。柱や固定の框へ板を埋め込まない。
    const depth = Math.abs(wallOffset) - .11 - (entry ? 0 : .03);
    if (depth <= 0) return g;
    const z = -Math.sign(wallOffset) * (.11 + depth / 2);
    // 引き込み脇は一枚の厚板にせず、上下の枠で縦板を受ける。
    // 木口の目地には薄い裏板を残し、閉じた板戸の横を透かさない。
    // 外寸は元の側板と揃え、戸の溝・柱・通行幅と当たりを保つ。
    const railH = Math.min(.06, h / 4), count = Math.max(1, Math.ceil(depth / .18));
    const boardH = h - railH * 2, joint = .003;
    for (const side of [-1, 1]) {
      const x = side * (w + .04);
      for (const yy of [railH / 2, h - railH / 2])
        timber(.04, railH, depth, x, yy, z, 0x493829);
      timber(.008, boardH, depth, x + side * .016, h / 2, z, 0x30221a);
      for (let i = 0; i < count; i++) {
        const back = z - depth / 2 + depth * i / count + (i ? joint / 2 : 0);
        const front = z - depth / 2 + depth * (i + 1) / count - (i + 1 < count ? joint / 2 : 0);
        timber(.032, boardH, front - back, x - side * .004, h / 2,
          (back + front) / 2, i % 2 ? 0x493829 : 0x513e2c);
      }
    }
  }
  return g;
}
function place(g, part, x, z, rot = 0, y = 0) { part.position.set(x, y, z); part.rotation.y = rot; g.add(part); return part; }

let glowShape, glowMat;
export function lightPool() {
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
function villageFurnishLayout(layout, h = 2.7, { partitions = true, dim = false } = {}) {

  
  // 今の山岳戦と前の比叡山で調度を共有。出入り案内が使う型の名前は変えない。
  const inabaHigh = false;
  const hiei = layout.profile === 'hiei' || layout.profile === 'hieizan';
  const village = S.quality === 'high' && layout.profile === 'shitaragahara';
  const villageHome = village && layout.kind === 'minka';
  const templeAltar = hiei || layout.profile === 'echizen_ikko' || layout.profile === 'iwamura_hondo' || ['takato', 'shitaragahara'].includes(layout.profile) && layout.kind === 'hondo';
  const hieiSobo = layout.profile === 'hieizan' && layout.kind === 'sobo';
  const hieiKuri = layout.profile === 'hieizan' && layout.kind === 'kuri';
  const hieiTatami = hieiSobo || hieiKuri;
  const japanese = !!layout.profile && cgtOn() && cgtHas('naibu_tatami_floor_modular_a');
  const purchased = cgtOn() && cgtHas('Floor_Tatami') && !cgtHas('tatami_floor_modular_a');
  const key = JSON.stringify([layout, h, partitions, dim, purchased, japanese, cgtOn() && cgtHas('tatami_floor_modular_a'), village]);
  if (layoutDecor.has(key)) { const copy = layoutDecor.get(key).clone(); cacheUsers.push(new WeakRef(copy)); return copy; }
  const g = new THREE.Group(), kb = purchased || japanese ? new KitBatch() : null;
  for (const p of layout.props) {
    const part = new THREE.Group();
    const moribeStorage = layout.profile === 'moribe' && layout.kind === 'yashiki' && p.part === 'storage';
    // 神宮寺の堂は家庭用の仏壇へ替えず、下の須弥壇・本尊・灯明を使う。
    const kit = p.part === 'stove' && !villageHome && !hieiKuri ? bought('furnace_complete', p.w, p.h, p.d) : p.part === 'storage' && !villageHome && !hieiTatami ? bought('drawer_a', p.w, p.h, p.d) : p.part === 'altar' && !templeAltar ? bought('butsudan', p.w, p.h, p.d) : null;
    if (kit) part.add(kit);
    else if (p.part === 'storage' && villageHome) {
      // 土間の木櫃は脚木で底を土から浮かせる推定のしつらえ。
      // 蓋は幅いっぱいの一枚板にせず、三枚の板と二本の押さえ木で組む。
      // 脚・蓋とも元の外寸に収め、収納脇の通り道と当たりを保つ。
      // 蓋だけでなく胴の縦板・脚木・押さえ桟にも長手の木目を通す。
      // 天井と建具の原形・材質を共用し、外寸と当たり、静止した束の数を保つ。
      const foot = .08, lid = .065, wall = .035, batten = .02, joint = .003;
      // 底板の上で側板を受ける。底の厚みを胴から引き、下端の木口を重ねない。
      const bodyBottom = foot + wall, bodyH = p.h - lid - bodyBottom;
      const bodyY = bodyBottom + bodyH / 2;
      // 横桟を板へ留める木栓。桟を置くだけにせず、各板との取り合いを表す推定の納まり。
      // 栓の原形・材質は全戸で共用し、表面から三ミリだけ出して静止した内装へまとめる。
      const pegKey = '民家の木櫃の木栓';
      if (!shapes.has(pegKey)) shapes.set(pegKey, new THREE.CylinderGeometry(.006, .006, .006, 6));
      const peg = (x, y, z, axis) => {
        const m = new THREE.Mesh(shapes.get(pegKey), mat(0x8a7250));
        if (axis === 'z') m.rotation.x = Math.PI / 2;
        if (axis === 'x') m.rotation.z = Math.PI / 2;
        m.position.set(x, y, z); cacheUsers.push(new WeakRef(m)); part.add(m);
      };
      for (const x of [-p.w * .32, p.w * .32])
        timberBox(part, .09, foot, p.d - .04, x, foot / 2, 0, 0x493829);
      // 胴も一枚の塊にせず、底板と四周の側板で組む。目地の奥には薄い裏板を残す。
      // 押さえ桟まで元の外寸へ納め、土間の通り道と当たりは広げない。
      // 底も三枚の接ぎ板とし、各板を奥行き方向の二本の脚木で受ける。
      // 木目は板の長手へ通し、胴と同じ幅の一枚の塊にはしない。
      for (let i = 0; i < 3; i++)
        timberBox(part, p.w, wall, p.d / 3 - joint, 0, foot + wall / 2,
          (i - 1) * p.d / 3, i % 2 ? 0x59412b : 0x493829);
      for (const side of [-1, 1]) {
        const z = side * (p.d / 2 - batten - wall / 2);
        timberBox(part, p.w, bodyH, .012, 0, bodyY,
          side * (p.d / 2 - batten - wall + .006), 0x493829);
        for (let i = 0; i < 4; i++)
          timberBox(part, p.w / 4 - joint, bodyH, wall, (i - 1.5) * p.w / 4,
            bodyY, z, i % 2 ? 0x71593e : 0x655039);
        // 縦板と平行な縦桟では四枚を束ねられない。上下の横桟で全ての板を留める。
        // 妻側と高さを揃え、元の見込みの内に納める。通り道と当たりは広げない。
        for (const yy of [bodyBottom + .06, bodyBottom + bodyH - .06]) {
          timberBox(part, p.w, .045, batten, 0, yy,
            side * (p.d - batten) / 2, 0x59412b);
          for (let i = 0; i < 4; i++)
            peg((i - 1.5) * p.w / 4, yy, side * p.d / 2, 'z');
        }
        const depth = p.d - (wall + batten) * 2;
        // 妻側も縦板を二枚接ぐ。裏板と横桟で目地を受け、無地の一枚壁にしない。
        timberBox(part, .012, bodyH, depth,
          side * (p.w / 2 - wall + .006), bodyY, 0, 0x493829);
        for (let i = 0; i < 2; i++)
          timberBox(part, wall - .012, bodyH, depth / 2 - joint,
            side * (p.w / 2 - (wall - .012) / 2), bodyY,
            (i ? 1 : -1) * depth / 4, i ? 0x71593e : 0x655039);
        for (const yy of [bodyBottom + .06, bodyBottom + bodyH - .06]) {
          timberBox(part, batten, .045, depth, side * (p.w / 2 - wall - batten / 2),
            yy, 0, 0x59412b);
          for (const z of [-depth / 4, depth / 4])
            peg(side * (p.w / 2 - wall - batten), yy, z, 'x');
        }
      }
      // 暗い裏板を目地の奥へ残し、継ぎ目を中身の透ける穴にしない。
      timberBox(part, p.w, .015, p.d, 0, p.h - lid + .0075, 0, 0x493829);
      // 蓋の接ぎ板は木目を長手へ通す。天井・建具と板材を共用し、厚みと目地は保つ。
      for (let i = 0; i < 3; i++) {
        const board = templeCeilingBoard(p.w, p.d / 3 - .003,
          i % 2 ? 0x71593e : 0x786044, .025);
        board.position.set(0, p.h - .0375, (i - 1) * p.d / 3); part.add(board);
      }
      for (const x of [-p.w * .32, p.w * .32]) {
        timberBox(part, .055, .025, p.d, x, p.h - .0125, 0, 0x59412b);
        for (let i = 0; i < 3; i++) peg(x, p.h, (i - 1) * p.d / 3, 'y');
      }
    }
    else if (p.part === 'alcove') {
      if (inabaHigh) {
        // 稲葉山の主殿・山麓館の床の間。床柱・床框・落し掛けで囲い、
        // 掛物だけを壁へ貼った形にしない。全て調度の当たりの内側へ納める。
        // 全体を縦に縮めず、柱・壁の長さと上部の位置だけを天井高へ合わせる。
        // 床框の厚み、花入と掛物の形は保つ。
        const alcoveH = Math.min(p.h, h - (p.y || 0) - .045);
        // 土台の前端を床框の背面で止め、同じ面を二重に描かない。
        // 床框と落し掛けも床柱の内面へ突き付け、柱の表を横木で覆わない。
        // 外寸・床板の高さ・調度の当たりは保ち、既存の箱と材質を共有する。
        const betweenPosts = 2.06;
        box(part, 2.3, .18, .73, 0, .09, -.06, 0x604831);
        // 床の間も座敷と同じ塗り壁で納め、背面・袖壁・落し掛け上の
        // 小壁だけ単色にしない。既存の土壁の絵と材質を共有する。
        box(part, 2.3, alcoveH, .06, 0, alcoveH / 2, -.395, 0xcfc3a2, 'inabaPlaster');
        for (const x of [-1.09, 1.09]) {
          box(part, .12, alcoveH, .12, x, alcoveH / 2, .365, 0x493522, 'inabaBoard');
          box(part, .06, alcoveH, .73, x, alcoveH / 2, -.06, 0xcfc3a2, 'inabaPlaster');
        }
        // 床板・小天井・横木は長手へ木目を通す。縦の床柱と同じ絵を
        // 九十度回して共有し、板の枚数・室内の束・当たりは増やさない。
        const crossGrain = (w, h, d, y, z, color) => {
          const board = box(part, h, w, d, 0, y, z, color, 'inabaBoard');
          board.rotation.z = Math.PI / 2;
        };
        crossGrain(betweenPosts, .14, .12, .14, .365, 0x493522);  // 床框
        crossGrain(betweenPosts, .12, .12, alcoveH - .4, .365, 0x493522);  // 落し掛け
        box(part, 2.3, .34, .06, 0, alcoveH - .17, .365, 0xcfc3a2, 'inabaPlaster');
        // 床の間の内側も板敷きと小天井で納める推定。床柱の間で板を割り、
        // 床框・掛物・落し掛けに継ぎ目を重ねない。既存の束へ設営時だけまとめる。
        const innerW = betweenPosts, innerD = .67, innerZ = -.06;
        for (let j = 0; j < 3; j++) {
          const z = innerZ - innerD / 2 + (j + .5) * innerD / 3;
          crossGrain(innerW, .008, innerD / 3 - .004, .181, z,
            j % 2 ? 0x6a5038 : 0x72573d);
          crossGrain(innerW, .012, innerD / 3 - .004, alcoveH - .03, z,
            j % 2 ? 0x756046 : 0x80694d);
        }
        // 小天井の回縁も長手へ木目を通す。前後の材を通し、左右の材は
        // その内側へ突き付けて、四隅で同じ面を重ねない推定の納まり。
        // 板を受ける幅・天井高・床柱と、既存の木部の束は保つ。
        const trimW = .035, trimY = alcoveH - .05;
        for (const z of [innerZ - innerD / 2, innerZ + innerD / 2])
          crossGrain(innerW + trimW, trimW, trimW, trimY, z, 0x493522);
        for (const x of [-innerW / 2, innerW / 2]) {
          const trim = box(part, trimW, innerD - trimW, trimW,
            x, trimY, innerZ, 0x493522, 'inabaBoard');
          trim.rotation.x = Math.PI / 2;
        }
        // 主殿・山麓館の床飾りは推定。掛物の脇に薄板と素朴な花入を据え、
        // 花は少ない枝葉で表す。床板の上・床柱の内側へ収め、通路へ出さない。
        // 丸い供具と同じ形の箱・材質を共有し、設営時に既存の室内の束へまとめる。
        const vaseX = -.65, vaseZ = -.06, boardTop = .197;
        box(part, .36, .012, .28, vaseX, boardTop - .006, vaseZ, 0x493522, 'inabaBoard');
        roundVessel(part, .075, .055, .12, vaseX, boardTop + .06, vaseZ, 0x675343);
        roundVessel(part, .035, .075, .08, vaseX, boardTop + .16, vaseZ, 0x675343);
        roundVessel(part, .035, .035, .08, vaseX, boardTop + .24, vaseZ, 0x675343);
        // 口を土色の円盤で塞がず、縁と暗い内側を胴の上端へ納める。
        roundVessel(part, .041, .035, .012, vaseX, boardTop + .28, vaseZ, 0x675343);
        roundVessel(part, .029, .029, .002, vaseX, boardTop + .287, vaseZ, 0x211b15);
        const stem = box(part, .009, .38, .009, vaseX + .03, boardTop + .45, vaseZ, 0x59412b);
        stem.rotation.z = -.16;
        const twig = box(part, .008, .19, .008, vaseX - .02, boardTop + .47, vaseZ, 0x59412b);
        twig.rotation.z = .55;
        for (const [x, yy, angle] of [[.07, .58, -.7], [-.07, .54, .7], [.035, .48, -.9]]) {
          const leaf = box(part, .065, .018, .025, vaseX + x, boardTop + yy, vaseZ, 0x596044);
          leaf.rotation.z = angle;
        }
        // 掛物は縦横比を保ち、吊り紐まで落し掛けの下へ収める。
        const scrollTop = Math.min(1.9, alcoveH - .56), scrollBottom = scrollTop - 1.25;
        const scroll = bought('wall_scroll', .55, 1.25, .035);
        if (scroll) place(part, scroll, 0, -.35, 0, scrollBottom);
        else {
          box(part, .55, 1.25, .012, 0, scrollBottom + .625, -.35, 0xffffff, 'scroll');
          // 軸木・八双・吊り紐を表装の寸法へ揃え、襖の黒縁で囲まない。
          box(part, .61, .025, .025, 0, scrollBottom, -.35, 0x493522);
          box(part, .55, .016, .018, 0, scrollTop, -.35, 0x493522);
          // 掛物の紐を空中で途切れさせず、背壁へ打った折釘で受ける推定の納まり。
          // 八双の左右から中央の支点までつなぎ、釘の根元は塗り壁へ差し込む。
          // 落し掛けの下と既存の床の間の外寸に納め、箱と鉄色を使い回す。
          const cordRise = .06, cordHalf = .12;
          const cordLength = Math.hypot(cordHalf, cordRise);
          for (const side of [-1, 1]) {
            const cord = box(part, cordLength, .006, .006,
              side * cordHalf / 2, scrollTop + cordRise / 2, -.35, 0x6a5038);
            cord.rotation.z = -side * Math.atan2(cordRise, cordHalf);
          }
          box(part, .009, .009, .026, 0, scrollTop + cordRise, -.36, 0x252321);
          box(part, .009, .018, .009, 0, scrollTop + cordRise + .005, -.347, 0x252321);
        }
      } else if (japanese && addNaibu(kb, 'wall_scroll', p.x, (p.y || 0) + .8, p.z - .35 * Math.cos(p.rot || 0), .55, 1.25, .04, p.rot || 0)) {
        box(part, 2.3, .18, .85, 0, .09, 0, 0x604831);
        box(part, 2.3, 2.5, .08, 0, 1.25, -.43, 0xcfc3a2);
      } else part.add(tokonoma(2.3));
    } else if (p.part === 'chest') {
      const w = p.w ?? .85, h = p.h ?? .7, d = p.d ?? .7;
      if (japanese && addNaibu(kb, 'drawer_a', p.x, p.y || 0, p.z, w, h, d, p.rot || 0)) continue;
      box(part, w, h, d, 0, h / 2, 0, 0x503923);
      for (const yy of [.23, .48]) box(part, w - .06, .02, .03, 0, yy, d / 2, 0x252321);
    } else if (p.part === 'hearth') {
      if (villageHome) {
        // 民家の囲炉裏は板床を切り、炉縁より下に土の炉壁と灰床を納める。
        // 梁から自在鉤で吊った鉄鍋はそのまま、床の上の浅い箱にしない。
        // 炉縁は木、炉壁は土として分ける。四周の木目を材の長手へ通す。
        // 建具と同じ原形・材質を全戸で共用し、炉の開口や床の寸法は保つ。
        for (const side of [-1, 1]) {
          timberBox(part, p.w, .08, .09, 0, 0, side * (p.d - .09) / 2, 0x493022);
          timberBox(part, .09, .08, p.d - .18, side * (p.w - .09) / 2, 0, 0, 0x493022);
          box(part, p.w - .18, .12, .025, 0, -.09, side * ((p.d - .18) / 2 - .0125), 0x514337);
          box(part, .025, .12, p.d - .18, side * ((p.w - .18) / 2 - .0125), -.09, 0, 0x514337);
        }
        box(part, p.w - .18, .025, p.d - .18, 0, -.14, 0, 0x817563);
        // 炉の薪を角材二本と一枚の赤い板で済ませず、灰へ沈めた薪と熾火に分ける。
        // 薪の原形・材質は全戸で共有し、光源や毎コマ動く火の粒は増やさない。
        const fuelKey = '民家の炉の薪';
        if (!shapes.has(fuelKey)) shapes.set(fuelKey, new THREE.CylinderGeometry(.023, .029, .26, 7));
        for (const [x, z, angle] of [[-.1, -.025, -.12], [.09, .015, .16], [0, -.035, 1.35]]) {
          const fuel = new THREE.Mesh(shapes.get(fuelKey), mat(0x30221a));
          fuel.rotation.set(Math.PI / 2, 0, angle);
          fuel.position.set(x, -.102, z);
          cacheUsers.push(new WeakRef(fuel)); part.add(fuel);
        }
        for (const [x, z, width] of [[-.052, .035, .035], [.025, -.05, .025], [.065, .075, .03], [-.12, -.09, .02]])
          box(part, width, .012, .025, x, -.075, z, 0x8e4928);
        // 丸い鍋と取っ手の形は全戸で共有。室内を作る時だけ配置する。
        const potKey = '民家の鉄鍋', handleKey = '民家の鍋の弦', lidKey = '民家の鍋の蓋';
        // 鉄鍋は外底から口縁・内壁へ折り返し、厚みのある器にする推定の造り。
        // 口の半径・底の高さは保ち、蓋と弦の耳を受ける。全戸で同じ回転体を使う。
        if (!shapes.has(potKey)) shapes.set(potKey, new THREE.LatheGeometry([
          new THREE.Vector2(0, -1), new THREE.Vector2(.38, -.93),
          new THREE.Vector2(.7, -.72), new THREE.Vector2(.91, -.4),
          new THREE.Vector2(1, -.045), new THREE.Vector2(1, 0),
          new THREE.Vector2(.955, 0), new THREE.Vector2(.955, -.045),
          new THREE.Vector2(.865, -.38), new THREE.Vector2(.66, -.68),
          new THREE.Vector2(.35, -.885), new THREE.Vector2(0, -.955),
        ], 12));
        if (!shapes.has(handleKey)) shapes.set(handleKey, new THREE.TorusGeometry(.16, .012, 4, 12, Math.PI));
        // 木蓋は三枚の接ぎ板を丸く切る。目地には板の厚みを残し、上の二本の桟でつなぐ。
        // 鍋口へ掛かる外径・下面の高さを保ち、作る時だけ結合して原形を共有する。
        if (!shapes.has(lidKey)) {
          const radius = .20, joint = .002, boards = [];
          for (let i = 0; i < 3; i++) {
            const low = -radius + radius * 2 * i / 3 + (i ? joint / 2 : 0);
            const high = -radius + radius * 2 * (i + 1) / 3 - (i < 2 ? joint / 2 : 0);
            const a = Math.asin(low / radius), b = Math.asin(high / radius);
            const outline = new THREE.Shape();
            outline.moveTo(radius * Math.cos(a), low);
            outline.absarc(0, 0, radius, a, b, false);
            outline.lineTo(-radius * Math.cos(b), high);
            outline.absarc(0, 0, radius, Math.PI - b, Math.PI - a, false);
            outline.closePath();
            const board = new THREE.ExtrudeGeometry(outline,
              { depth: .025, bevelEnabled: false, curveSegments: 4, steps: 1 });
            board.rotateX(Math.PI / 2); board.translate(0, .0125, 0); boards.push(board);
          }
          shapes.set(lidKey, mergeGeometries(boards));
          for (const board of boards) board.dispose();
        }
        const pot = new THREE.Mesh(shapes.get(potKey), mat(0x292723));
        pot.scale.set(.19, .215, .19); pot.position.y = .43;
        cacheUsers.push(new WeakRef(pot)); part.add(pot);
        const lid = new THREE.Mesh(shapes.get(lidKey), mat(0x655039));
        lid.position.y = .4425; cacheUsers.push(new WeakRef(lid)); part.add(lid);
        for (const x of [-.085, .085])
          box(part, .03, .035, .30, x, .4725, 0, 0x51412e);
        // 弦の両端は鍋の胴から離れていたため、鋳出した耳で受ける推定の納まり。
        // 耳は弦の端と胴へ掛け、自在鉤・鍋底の高さは保つ。共通の箱で全戸へ使い回す。
        for (const side of [-1, 1])
          box(part, .056, .045, .035, side * .176, .4, 0, 0x292723);
        const handle = new THREE.Mesh(shapes.get(handleKey), mat(0x292723));
        handle.position.y = .4; cacheUsers.push(new WeakRef(handle)); part.add(handle);
        // 外観側の小屋梁は奥行き方向に一間ほどで並び、幅いっぱいを渡る。
        // 内寸へ外壁の厚みを戻して同じ柱割りを使い、炉の真上から最寄りの梁まで横木を掛ける。
        const outerD = Math.max(...layout.rooms.map(r => r.z1)) * 2 + .18;
        const bays = Math.max(2, Math.round(outerD / 1.8)), step = outerD / bays;
        const beamZ = -outerD / 2 + Math.round((p.z + outerD / 2) / step) * step;
        // 調度を裏向きに置く時も、横木と締め縄の先を実際の梁へ向ける。
        const tieZ = (beamZ - p.z) * Math.cos(p.rot || 0);
        const top = h - .18;
        timberBox(part, .09, .07, Math.abs(tieZ) + .18, 0, top, tieZ / 2, 0x493829);
        // 自在竹の上端も吊り木へ縄で留める推定の納まり。
        // 梁側の締め縄だけでは竹の先が木へ刺さった姿になるため、
        // 竹と横木を抱く二重の結束を補う。全戸で箱と材質を共用する。
        const bambooTieLow = top - .08, bambooTieHigh = top + .045;
        for (const z of [-.028, .028]) {
          for (const x of [-.052, .052])
            box(part, .014, bambooTieHigh - bambooTieLow, .014,
              x, (bambooTieLow + bambooTieHigh) / 2, z, 0x897557);
          for (const yy of [bambooTieLow, bambooTieHigh])
            box(part, .118, .014, .014, 0, yy, z, 0x897557);
        }
        // 炉の吊り木は梁の下面に触れるだけでなく、梁ごと縄で抱いて留める推定の納まり。
        // 外観の梁は上端が床から h + .02、厚さ二十センチ。横木の下まで一周させる。
        // 二重の縄を既存の箱と材質で組み、静止した調度の束へまとめる。
        const tieBottom = top - .045, tieTop = h + .035;
        for (const x of [-.027, .027]) {
          for (const z of [-.105, .105])
            box(part, .014, tieTop - tieBottom, .014, x, (tieTop + tieBottom) / 2, tieZ + z, 0x897557);
          for (const yy of [tieBottom, tieTop])
            box(part, .014, .014, .224, x, yy, tieZ, 0x897557);
        }
        // 炉の上に薪などを乾かす火棚を補う推定のしつらえ。
        // 板で塞がず、中央は自在竹を通す。炉の外へ張り出さず、頭上も一・八メートル以上空ける。
        // 四隅の吊り縄は二本の受け木へ結び、受け木を既存の小屋梁へ掛ける。
        // 箱の原形・材質を共用し、据え付けの内装と一度だけまとめる。
        const rackY = Math.min(1.92, top - .25), rackW = p.w - .12, rackD = p.d - .12;
        if (rackY >= 1.82) {
          const halfW = rackW / 2, halfD = rackD / 2, rail = .035;
          for (const x of [-halfW + rail / 2, halfW - rail / 2]) {
            timberBox(part, rail, rail, rackD, x, rackY, 0, 0x493829);
            const back = Math.min(-halfD, tieZ - .09), front = Math.max(halfD, tieZ + .09);
            timberBox(part, .045, .05, front - back, x, top, (back + front) / 2, 0x493829);
            // 火棚の受け木も小屋梁ごと抱いて留め、下面に添えただけにしない。
            for (const z of [tieZ - .105, tieZ + .105])
              box(part, .014, tieTop - tieBottom, .014, x, (tieTop + tieBottom) / 2, z, 0x897557);
            for (const yy of [tieBottom, tieTop])
              box(part, .014, .014, .224, x, yy, tieZ, 0x897557);
            for (const z of [-halfD + rail / 2, halfD - rail / 2]) {
              // 吊り縄は木の芯を貫かず、桟と受け木の左右から回して上下で結ぶ。
              const low = rackY - .025, high = top + .03;
              for (const side of [-1, 1]) box(part, .012, high - low, .012,
                x + side * .0265, (low + high) / 2, z, 0x897557);
              for (const yy of [rackY - .025, top + .03])
                box(part, .065, .012, .025, x, yy, z, 0x897557);
            }
          }
          for (const z of [-halfD + rail / 2, halfD - rail / 2])
            timberBox(part, rackW - rail * 2, rail, rail, 0, rackY, z, 0x493829);
          // 自在竹の通る十二センチの穴を二本の縦桟で囲む。
          // 切り放したすのこの内端を縦桟で受け、前後の框へ荷重をつなぐ推定の納まり。
          // 桟同士は木口で突き付け、木目と原形・材質は既存の木材を共用する。
          const opening = .06, innerRail = .025;
          for (const side of [-1, 1])
            timberBox(part, innerRail, .025, rackD - rail * 2,
              side * (opening + innerRail / 2), rackY, 0, 0x59412b);
          for (const z of [-rackD / 4, 0, rackD / 4]) for (const side of [-1, 1]) {
            const length = halfW - rail - opening - innerRail;
            timberBox(part, length, .025, .025,
              side * (opening + innerRail + length / 2), rackY, z, 0x59412b);
          }
        }
        // 自在鉤は角材の棒で代用せず、節のある竹へ鉄の吊り棒を通す。
        // 下端の鉤を鍋の弦へ掛け、竹・鉄棒・鉤の原形は全戸で共有する。
        const bambooKey = '民家の自在竹', nodeKey = '民家の自在竹の節';
        const rodKey = '民家の自在鉤の鉄棒', hookKey = '民家の自在鉤の曲がり';
        if (!shapes.has(bambooKey)) shapes.set(bambooKey, new THREE.CylinderGeometry(.0225, .0225, 1, 8));
        if (!shapes.has(nodeKey)) shapes.set(nodeKey, new THREE.CylinderGeometry(.026, .026, .018, 8));
        if (!shapes.has(rodKey)) shapes.set(rodKey, new THREE.CylinderGeometry(.009, .009, .28, 8));
        if (!shapes.has(hookKey)) shapes.set(hookKey, new THREE.TorusGeometry(.024, .009, 4, 10, Math.PI * 1.5));
        const bamboo = new THREE.Mesh(shapes.get(bambooKey), mat(0x6c5739));
        bamboo.scale.y = top - .8; bamboo.position.y = (top + .8) / 2;
        cacheUsers.push(new WeakRef(bamboo)); part.add(bamboo);
        for (let yy = .83; yy < top - .04; yy += .32) {
          const node = new THREE.Mesh(shapes.get(nodeKey), mat(0x59412b));
          node.position.y = yy; cacheUsers.push(new WeakRef(node)); part.add(node);
        }
        const rod = new THREE.Mesh(shapes.get(rodKey), mat(0x292723));
        rod.position.y = .67; cacheUsers.push(new WeakRef(rod)); part.add(rod);
        const hook = new THREE.Mesh(shapes.get(hookKey), mat(0x292723));
        // 円弧の左端を鉄棒の下端へ接続し、右上の口から鍋の弦を受ける。
        hook.position.set(.024, .54, 0); hook.rotation.z = Math.PI;
        cacheUsers.push(new WeakRef(hook)); part.add(hook);
        timberBox(part, .22, .045, .045, .06, .89, 0, 0x59412b); // 高さを留める横木
      } else if (japanese && addNaibu(kb, 'furnace', p.x, 0, p.z, p.w, .18, p.d)) {
        addNaibu(kb, 'kettle_low', p.x, .18, p.z, .35, .25, .35);
      } else {
        box(part, p.w, .12, p.d, 0, .06, 0, 0x493022);
        box(part, p.w - .18, .025, p.d - .18, 0, .13, 0, 0x211b17);
        box(part, .35, .25, .35, 0, .3, 0, 0x292723);
      }
      place(part, lightPool(), 0, 0, 0, villageHome ? -.075 : .2);
    } else if (p.part === 'ammo' && layout.profile === 'yagura' && japanese && addNaibu(kb, 'drawer_a', p.x, p.y || 0, p.z, p.w ?? .85, p.h ?? .55, p.d ?? .7)) {
      // 矢の束と弾の箱。棚の上の矢は軽い共通の形。
      for (let q = 0; q < 5; q++) box(part, .018, .02, (p.d ?? .7) - .05, (q - 2) * .07, (p.h ?? .55) + .04, 0, 0x9b8057);
    }
    else if (p.part === 'bedding') {
      if (inabaHigh) {
      if (inabaHigh && layout.kind === 'nagaya') {
        // 長屋の寝所は薄い敷物と木枕の推定復元。厚い一枚板や現代の枕に見せない。
        // 藺草の絵・箱・材質を共有し、既存の寝具の範囲と高さの中へ納める。
        // 無地の帯を表へ重ねず、番所・本堂と同じ薄縁で布縁と草の木口を納める。
        inabaUsuberi(part, p.w, p.d, 0, 0, 0);
        const headZ = -p.d / 2 + .15;
        // 木枕の脚は薄縁の表から天板裏まで通し、浮いた角材にしない。
        // 天板は横目、脚は縦目にして、既存の木部の絵と束を共有する。
        const matTop = .01, pillowBottom = .0875;
        doorTimber(part, p.w * .44, .025, .16, 0, .1, headZ, 0x6a5038, true);
        for (const x of [-p.w * .15, p.w * .15])
          box(part, .035, pillowBottom - matTop, .14,
            x, (matTop + pillowBottom) / 2, headZ, 0x493522, 'inabaBoard');
        // 足元に畳んだ掛け布を添える推定の寝支度。敷物・木枕と別の布として
        // 折り返しと縫い端を見せ、既存の寝具の外寸・高さへ納める。
        // 共通の箱と材質を室内の束へまとめ、通路や毎コマの処理は増やさない。
        const clothW = p.w - .12, clothD = Math.min(.42, p.d * .3);
        const footZ = p.d / 2 - clothD / 2 - .07;
        // 掛け布の下面を薄縁へ載せ、折った層と縫い端も隙間なく重ねる。
        // 寝具の外寸・当たりを保ち、箱の枚数や毎コマの処理は増やさない。
        const layerH = .014, clothTop = matTop + layerH * 3;
        for (let j = 0; j < 3; j++)
          box(part, clothW - j * .012, layerH, clothD - j * .016,
            0, matTop + (j + .5) * layerH, footZ + j * .008,
            j % 2 ? 0x74664e : 0x81735a);
        for (const x of [-clothW / 2 + .025, clothW / 2 - .025])
          box(part, .012, .004, clothD - .04, x, clothTop + .002, footZ + .016, 0x5d523e);
        box(part, clothW - .06, .004, .012, 0, clothTop + .002,
          footZ - clothD / 2 + .04, 0x5d523e);
      } else {
        box(part, p.w, .06, p.d, 0, .03, 0, 0x958669);
        box(part, p.w * .8, .12, .22, 0, .09, -p.d / 2 + .15, 0x6a5e48);
      }
    
      } else {
      box(part, p.w, .06, p.d, 0, .03, 0, 0x958669);
      box(part, p.w * .8, .12, .22, 0, .09, -p.d / 2 + .15, 0x6a5e48);
    }
    } else if (p.part === 'sutraChest' && village && layout.kind === 'hondo') {
      // 経箱は引き出し家具を流用せず、台輪・板組の胴・かぶせ蓋で復元する。
      // 蓋は閉じた姿。外寸を当たりと揃え、木と金具は既存の原形・材質へまとめる。
      const base = .05, lid = .055, wall = .025, bodyTop = p.h - lid;
      timberBox(part, p.w, base, p.d, 0, base / 2, 0, 0x32271c);
      timberBox(part, p.w - .04, wall, p.d - .04, 0, base + wall / 2, 0, 0x59412b);
      const bodyH = bodyTop - base;
      for (const side of [-1, 1]) {
        timberBox(part, p.w - .04, bodyH, wall, 0, base + bodyH / 2,
          side * (p.d / 2 - .02 - wall / 2), 0x493022);
        timberBox(part, wall, bodyH, p.d - .04 - wall * 2,
          side * (p.w / 2 - .02 - wall / 2), base + bodyH / 2, 0, 0x493022);
      }
      // 三枚の蓋板を接ぎ、目地の下に接ぎ代を残す。上面へ金具の文字や紋は足さない。
      for (let i = 0; i < 3; i++) {
        const depth = p.d / 3;
        timberBox(part, p.w, lid, depth - .002, 0, p.h - lid / 2,
          -p.d / 2 + (i + .5) * depth, i % 2 ? 0x59412b : 0x493022);
        if (i) timberBox(part, p.w, lid / 2, .002, 0, bodyTop + lid / 4,
          -p.d / 2 + i * depth, 0x493022);
      }
      // 手前の掛金と背の蝶番は外寸の内側へ収め、歩く場所へ突起を出さない。
      box(part, .045, .09, .006, 0, bodyTop - .015, p.d / 2 - .003, 0x39362e);
      for (const x of [-p.w * .3, p.w * .3])
        box(part, .07, .07, .006, x, bodyTop, -p.d / 2 + .003, 0x39362e);
    } else if (p.part === 'sutraDesk' && village && layout.kind === 'hondo') {
      // 内陣の経机は低い天板・四脚・貫で組み、前卓と用途を分ける。
      // 経本は開いた折本に縦の墨跡を添え、紙と表紙を共通の形で表す。
      // 天板は三枚の板を接ぎ、裏の幕板を四脚の内面へ納める推定の造り。
      // 脚へ横木を突き通さず、経本と鈴のある上面の高さ・机の外寸は保つ。
      // 箱と材質は共用し、内陣の動かない調度へ一度だけまとめる。
      const plankD = p.d / 3, joint = .002;
      for (let i = 0; i < 3; i++) {
        const back = -p.d / 2 + i * plankD + (i ? joint / 2 : 0);
        const front = -p.d / 2 + (i + 1) * plankD - (i < 2 ? joint / 2 : 0);
        // 天板にも接ぎ板の長手へ木目を通す。天井・板戸と同じ絵と原形を共用する。
        const board = templeCeilingBoard(p.w, front - back,
          i === 1 ? 0x432b1c : 0x3a2417, .04);
        board.position.set(0, p.h - .02, (back + front) / 2); part.add(board);
        // 接ぎ目は天板を貫く隙間にせず、下半分に接ぎ代を残す推定の納まり。
        // 二ミリの目地の奥だけを同じ木材で受け、上面と裏桟には重ねない。
        if (i) timberBox(part, p.w, .02, joint,
          0, p.h - .03, -p.d / 2 + i * plankD, 0x3a2417);
      }
      const legX = p.w * .39, legZ = p.d * .32, legHalf = .0275;
      const apronH = .07, apronY = p.h - .04 - apronH / 2;
      // 三枚の天板を裏桟で束ねる推定の納まり。木目と直交させ、
      // 前後の幕板の内面で受ける。天板の下面へ接し、脚や幕板には重ねない。
      for (const x of [-p.w * .22, p.w * .22])
        timberBox(part, .035, .025, legZ * 2 - .025,
          x, p.h - .04 - .0125, 0, 0x493022);
      // 天板と同じ木材を使い、幕板・脚・貫もそれぞれの長手へ木目を通す。
      for (const side of [-1, 1]) {
        timberBox(part, (legX - legHalf) * 2, apronH, .025,
          0, apronY, side * legZ, 0x493022);
        timberBox(part, .025, apronH, (legZ - legHalf) * 2,
          side * legX, apronY, 0, 0x493022);
      }
      // 貫の木口は脚の内面で受ける。脚の中へ同じ高さの面を重ねない。
      for (const x of [-legX, legX]) {
        for (const z of [-legZ, legZ])
          timberBox(part, .055, p.h - .04, .055, x, (p.h - .04) / 2, z, 0x493022);
        timberBox(part, .035, .045, (legZ - legHalf) * 2, x, .11, 0, 0x59412b);
      }
      timberBox(part, (legX - legHalf) * 2, .04, .035, 0, .11, -legZ, 0x59412b);
      // 開いた折本の表紙は両端の紙へ沿わせる。全幅の厚板で谷折りの下を埋めない。
      // 左右の表紙の外端を天板へ接し、中央の紙も同じ高さで机へ載せる。
      // 共通の箱・材質で作り、経机の静止した束へまとめる。
      const foldAngle = .12, leafW = .06, coverH = .004;
      const foldStep = leafW * Math.cos(foldAngle), foldRise = leafW * Math.sin(foldAngle);
      const paperBase = p.h + coverH * Math.cos(foldAngle);
      for (const side of [-1, 1]) {
        const cover = box(part, leafW, coverH, .23, side * 2.5 * foldStep,
          p.h + foldRise / 2 + coverH * Math.cos(foldAngle) / 2, 0, 0x514b3d);
        cover.rotation.z = -side * foldAngle;
      }
      // 折本は六枚の箱を重ねず、一続きの紙を山折り・谷折りにする。
      // 折り目で木口同士を交差させず、紙の厚みと前後の断面も残す。
      // 原形は共有し、経机の内側で既存の調度と一度だけ束ねる。
      const bookKey = '小堂の経机の折本';
      if (!shapes.has(bookKey)) {
        const paper = new THREE.Shape(), step = .06 * Math.cos(.12);
        // 折本は積んだ冊子ではなく一続きの紙。八ミリ厚の板状だった断面を
        // 厚手の紙を表す〇・八ミリへ薄くし、折り目の谷を厚みで埋めない。
        // 紙の下端と表紙の接点は動かさず、机に接する谷折りも同じ位置に保つ。
        const rise = .06 * Math.sin(.12), paperThickness = .0008;
        for (let i = 0; i <= 6; i++) {
          const x = (i - 3) * step;
          const y = (i % 2) * rise - (i === 2 || i === 4 ? coverH * Math.cos(foldAngle) : 0);
          if (i === 0) paper.moveTo(x, y + paperThickness);
          else paper.lineTo(x, y + paperThickness);
        }
        for (let i = 6; i >= 0; i--)
          paper.lineTo((i - 3) * step, (i % 2) * rise
            - (i === 2 || i === 4 ? coverH * Math.cos(foldAngle) : 0));
        paper.closePath();
        const folded = new THREE.ExtrudeGeometry(paper,
          { depth: .21, bevelEnabled: false, steps: 1, curveSegments: 1 });
        folded.translate(0, 0, -.105); shapes.set(bookKey, folded);
      }
      const book = new THREE.Mesh(shapes.get(bookKey), mat(0xcfc6b0));
      book.position.y = paperBase;
      cacheUsers.push(new WeakRef(book)); part.add(book);
      // 白紙の折本では読経の机に見えないため、各紙面へ縦書きの墨跡を添える。
      // 特定の経典の本文は復元せず、余白と筆の濃淡だけを表す推定のしつらえ。
      // 谷折りの沈みも紙と揃え、墨を机へ埋めたり紙面から浮かせたりしない。
      // 原形・材質は共用し、経机と同じ静止した束へまとめる。
      for (let leaf = 0; leaf < 6; leaf++) {
        const edgeY = i => (i % 2) * foldRise
          - (i === 2 || i === 4 ? coverH * Math.cos(foldAngle) : 0);
        const y0 = edgeY(leaf), y1 = edgeY(leaf + 1);
        const tilt = Math.atan2(y1 - y0, foldStep);
        for (let column = 0; column < 2; column++) {
          const t = column ? .3 : .7;
          const x = (leaf - 3 + t) * foldStep;
          const inkY = paperBase + y0 + (y1 - y0) * t + .00115;
          for (let row = 0; row < 6; row++) {
            const width = .005 + (leaf + column + row) % 3 * .0015;
            const ink = box(part, width, .0005, .012,
              x, inkY, -.075 + row * .03, row % 3 ? 0x39362d : 0x575045);
            ink.rotation.z = tilt;
          }
        }
      }
      // 読経用の鈴と撥を経本の脇へ添える推定のしつらえ。
      // 鈴は上が開いた厚みのある鉢形。机の内側へ収め、通路や家具の当たりは増やさない。
      const bellKey = '小堂の鈴';
      if (!shapes.has(bellKey)) shapes.set(bellKey, new THREE.LatheGeometry([
        new THREE.Vector2(0, 0), new THREE.Vector2(.045, 0),
        new THREE.Vector2(.07, .025), new THREE.Vector2(.085, .065),
        new THREE.Vector2(.085, .09), new THREE.Vector2(.077, .09),
        new THREE.Vector2(.077, .065), new THREE.Vector2(.062, .03),
        new THREE.Vector2(.038, .012), new THREE.Vector2(0, .012),
      ], 16));
      // 鈴を板の塊へ直置きせず、中央がくぼんだ布の輪台で受ける推定の納まり。
      // 底と縁の高さを鈴の底へ合わせ、机の外へ広げない。原形と材質は共有する。
      const cushionKey = '小堂の鈴の輪台';
      if (!shapes.has(cushionKey)) shapes.set(cushionKey, new THREE.LatheGeometry([
        new THREE.Vector2(0, 0), new THREE.Vector2(.085, 0),
        new THREE.Vector2(.105, .008), new THREE.Vector2(.11, .025),
        new THREE.Vector2(.1, .04), new THREE.Vector2(.075, .04),
        new THREE.Vector2(.06, .025), new THREE.Vector2(0, .025),
      ], 16));
      const cushion = new THREE.Mesh(shapes.get(cushionKey), mat(0x514b3d));
      cushion.position.set(.34, p.h, .04);
      cacheUsers.push(new WeakRef(cushion)); part.add(cushion);
      const bell = new THREE.Mesh(shapes.get(bellKey), mat(0x8a713d));
      bell.position.set(.34, p.h + .025, .04);
      cacheUsers.push(new WeakRef(bell)); part.add(bell);
      // 撥も角材の棒から丸い柄と打つ頭へ替える。天板へ接し、経本と輪台の間を空ける。
      const strikerKey = '小堂の鈴の撥';
      if (!shapes.has(strikerKey)) shapes.set(strikerKey, new THREE.LatheGeometry([
        new THREE.Vector2(0, -.085), new THREE.Vector2(.006, -.085),
        new THREE.Vector2(.007, .035), new THREE.Vector2(.012, .045),
        new THREE.Vector2(.012, .075), new THREE.Vector2(.008, .085),
        new THREE.Vector2(0, .085),
      ], 10));
      const striker = new THREE.Mesh(shapes.get(strikerKey), mat(0x786044));
      striker.rotation.z = -Math.PI / 2;
      striker.position.set(.33, p.h + .012, -.15);
      cacheUsers.push(new WeakRef(striker)); part.add(striker);
      // 僧の座は下で内陣の範囲を確かめ、一枚だけ置く。
      // ここにも置くと、六センチずれた半畳が重なって縁と畳表がちらつく。
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
      const cushion = villageTatami(across ? matD : matW, across ? matW : matD, false, true);
      cushion.scale.y = .05 / .06;
      place(part, cushion, 0, 0, across ? Math.PI / 2 : 0, seat);
    } else if (p.part === 'offering') {
      if (village && layout.kind === 'hondo') {
        // 小堂の前卓は天板の下を幕板で受け、四脚を貫で固める推定の姿。
        // 香炉を載せる処理と一緒に組み、当たりと同じ外寸へ納める。
        const leg = .065, inset = .055, legH = p.h - .055;
        const legX = p.w / 2 - inset - leg / 2, legZ = p.d / 2 - inset - leg / 2;
        // 幕板と貫は四脚の間へ納める。脚を貫く横木や隅の重なりを残さない。
        const clearW = legX * 2 - leg, clearD = legZ * 2 - leg;
        // 天板は三枚の接ぎ板とし、木端の目地を幕板の上へ納める。
        // 上面・外寸は保ち、香炉の脚や供具を浮かせない。形と材質は既存の箱を共用する。
        const boards = 3, joint = .002, boardD = p.d / boards;
        for (let i = 0; i < boards; i++) {
          const back = -p.d / 2 + i * boardD + (i ? joint / 2 : 0);
          const front = -p.d / 2 + (i + 1) * boardD - (i < boards - 1 ? joint / 2 : 0);
          // 経机と同じく、目地に沿う木目を既存の板材で表す。板の枚数と厚みは保つ。
          const board = templeCeilingBoard(p.w, front - back, 0x3a2417, .055);
          board.position.set(0, p.h - .0275, (back + front) / 2); part.add(board);
          // 経机と同じく、目地の底へ接ぎ代を納めて脚間まで透かさない。
          // 板の下半分だけをつなぎ、供具・幕板・裏桟の位置は保つ。
          if (i) timberBox(part, p.w, .0275, joint,
            0, p.h - .04125, -p.d / 2 + i * boardD, 0x3a2417);
        }
        // 前卓も接ぎ板の裏へ二本の桟を渡し、中央の板を木端だけで支えない。
        // 桟の端は前後の幕板の内面まで、上端は天板の下面までに収める。
        // 経机と同じ共通材で一度だけ組み、供具の高さと通路は保つ。
        for (const x of [-p.w * .22, p.w * .22])
          timberBox(part, .04, .03, legZ * 2 - .035,
            x, p.h - .055 - .015, 0, 0x493022);
        // 脚は縦、幕板と貫は横へ木目を通し、天板だけ木で脚は無地の姿にしない。
        // 建具の木材を共用して一度だけ束ね、脚間の通りと当たりの外寸は保つ。
        for (const x of [-legX, legX]) {
          for (const z of [-legZ, legZ]) timberBox(part, leg, legH, leg, x, legH / 2, z, 0x3a2417);
          timberBox(part, .035, .09, clearD, x, p.h - .1, 0, 0x493022);
          timberBox(part, .055, .055, clearD, x, legH * .3, 0, 0x59412b);
        }
        for (const z of [-legZ, legZ]) {
          timberBox(part, clearW, .09, .035, 0, p.h - .1, z, 0x493022);
          timberBox(part, clearW, .055, .055, 0, legH * .3, z, 0x59412b);
        }
        // 小堂の前卓。供物を白い箱で代用せず、灰を納めた香炉と三本の脚を置く。
        // 丸い三足香炉。底と内壁のある器にし、下から覗いても灰の裏側が見えないようにする。
        // 口は塞がず、厚みの内側へ灰を納める。回転体は小堂の供具で共有し、一度だけ束ねる。
        const bowlKey = '小堂の香炉の胴', rimKey = '小堂の香炉の口縁', ashKey = '小堂の香炉の灰';
        if (!shapes.has(bowlKey)) shapes.set(bowlKey, new THREE.LatheGeometry([
          new THREE.Vector2(0, -.06), new THREE.Vector2(.085, -.06),
          new THREE.Vector2(.107, -.035), new THREE.Vector2(.12, .06),
          new THREE.Vector2(.106, .06), new THREE.Vector2(.096, -.035),
          new THREE.Vector2(0, -.045),
        ], 12));
        if (!shapes.has(rimKey)) shapes.set(rimKey, new THREE.TorusGeometry(.113, .012, 4, 12));
        if (!shapes.has(ashKey)) shapes.set(ashKey, new THREE.CylinderGeometry(.1, .1, .008, 12));
        for (const [key, color, yy] of [[bowlKey, 0x615744, .09], [rimKey, 0x615744, .15], [ashKey, 0xaaa18b, .145]]) {
          const m = new THREE.Mesh(shapes.get(key), mat(color));
          if (key === rimKey) m.rotation.x = Math.PI / 2;
          m.position.y = p.h + yy; cacheUsers.push(new WeakRef(m)); part.add(m);
        }
        for (let i = 0; i < 3; i++) {
          const angle = i * Math.PI * 2 / 3;
          box(part, .035, .04, .035, Math.sin(angle) * .075, p.h + .02, Math.cos(angle) * .075, 0x615744);
        }
        // 線香は角材でなく細い丸軸にする。灰へ下端を差し、先端だけ熾す。
        // 軸と火先は同じ円柱を使い回し、煙の粒や光源を増やさず前卓の束へまとめる。
        const incenseKey = '小堂の線香の丸軸';
        if (!shapes.has(incenseKey))
          shapes.set(incenseKey, new THREE.CylinderGeometry(1, 1, 1, 8));
        for (const x of [-.035, 0, .035]) {
          for (const [radius, height, yy, color] of [
            [.004, .16, .22, 0x594b35], [.0045, .012, .306, 0x9b5130],
          ]) {
            const incense = new THREE.Mesh(shapes.get(incenseKey), mat(color));
            incense.scale.set(radius, height, radius);
            incense.position.set(x, p.h + yy, 0);
            cacheUsers.push(new WeakRef(incense)); part.add(incense);
          }
        }
        // 香炉だけだった前卓に花立と燭台を添える推定のしつらえ。
        // 本尊に向かって左に花、右に灯を置き、全て天板の内側へ収める。
        // 器は中空の口を持つ回転体。形と材質を共有し、静止した供具として一度だけ束ねる。
        const vaseKey = '小堂の花立', candleKey = '小堂の燭台', waxKey = '小堂の蝋燭', flameKey = '小堂の灯炎';
        if (!shapes.has(vaseKey)) shapes.set(vaseKey, new THREE.LatheGeometry([
          new THREE.Vector2(0, 0), new THREE.Vector2(.065, 0),
          new THREE.Vector2(.085, .05), new THREE.Vector2(.075, .13),
          new THREE.Vector2(.035, .2), new THREE.Vector2(.045, .25),
          new THREE.Vector2(.033, .25), new THREE.Vector2(.025, .2),
          new THREE.Vector2(.06, .12), new THREE.Vector2(.055, .025), new THREE.Vector2(0, .025),
        ], 12));
        if (!shapes.has(candleKey)) shapes.set(candleKey, new THREE.LatheGeometry([
          new THREE.Vector2(0, 0), new THREE.Vector2(.09, 0),
          new THREE.Vector2(.09, .025), new THREE.Vector2(.025, .06),
          new THREE.Vector2(.018, .23), new THREE.Vector2(.065, .25),
          new THREE.Vector2(.065, .265), new THREE.Vector2(0, .265),
        ], 12));
        // 蝋燭は上へ広がる胴と、芯の周りの浅いくぼみを作る。
        // 芯を角材、炎を楕円球で代用せず、細い丸芯と先の尖った炎にする。
        // 原形は供具で共有し、灯りの更新や光源は増やさない。
        const wickKey = '小堂の蝋燭の芯';
        if (!shapes.has(waxKey)) shapes.set(waxKey, new THREE.LatheGeometry([
          new THREE.Vector2(0, -.08), new THREE.Vector2(.016, -.08),
          new THREE.Vector2(.019, -.02), new THREE.Vector2(.024, .07),
          new THREE.Vector2(.023, .08), new THREE.Vector2(.01, .073),
          new THREE.Vector2(.006, .067), new THREE.Vector2(0, .067),
        ], 10));
        if (!shapes.has(wickKey)) shapes.set(wickKey, new THREE.CylinderGeometry(.003, .004, .025, 6));
        if (!shapes.has(flameKey)) shapes.set(flameKey, new THREE.LatheGeometry([
          new THREE.Vector2(0, -.028), new THREE.Vector2(.007, -.021),
          new THREE.Vector2(.011, -.009), new THREE.Vector2(.008, .004),
          new THREE.Vector2(.003, .019), new THREE.Vector2(0, .028),
        ], 8));
        const sideX = Math.min(.4, p.w / 2 - .12);
        for (const [key, color, x, yy] of [[vaseKey, 0x615744, -sideX, 0],
          [candleKey, 0x615744, sideX, 0], [waxKey, 0xc7b88e, sideX, .345],
          [flameKey, 0xffd08b, sideX, .45]]) {
          const m = new THREE.Mesh(shapes.get(key), mat(color));
          m.position.set(x, p.h + yy, 0); cacheUsers.push(new WeakRef(m)); part.add(m);
        }
        const wick = new THREE.Mesh(shapes.get(wickKey), mat(0x403122));
        wick.position.set(sideX, p.h + .4245, 0);
        cacheUsers.push(new WeakRef(wick)); part.add(wick);
        // 供花の枝は花立の口へ束ねる。平行な角材では、左右の枝が細い首を突き抜ける。
        // 枝と尖った薄葉の原形を共有し、既存の静止した供具の束へまとめる推定の姿。
        const stemKey = '小堂の供花の枝', leafKey = '小堂の供花の葉';
        if (!shapes.has(stemKey)) shapes.set(stemKey, new THREE.CylinderGeometry(.002, .004, 1, 6));
        if (!shapes.has(leafKey)) {
          const leaf = new THREE.Shape();
          leaf.moveTo(0, 0);
          leaf.quadraticCurveTo(-.025, .045, 0, .09);
          leaf.quadraticCurveTo(.025, .045, 0, 0);
          shapes.set(leafKey, new THREE.ExtrudeGeometry(leaf,
            { depth: .002, bevelEnabled: false, curveSegments: 4, steps: 1 }));
        }
        for (const [dx, top] of [[-.035, .48], [0, .58], [.035, .52]]) {
          const rise = top - .19;
          const stem = new THREE.Mesh(shapes.get(stemKey), mat(0x594b35));
          stem.scale.y = Math.hypot(dx, rise);
          stem.rotation.z = -Math.atan2(dx, rise);
          stem.position.set(-sideX + dx / 2, p.h + (top + .19) / 2, 0);
          cacheUsers.push(new WeakRef(stem)); part.add(stem);
          for (const sign of [-1, 1]) {
            const t = sign < 0 ? .65 : .82;
            const leaf = new THREE.Mesh(shapes.get(leafKey), mat(0x59613b));
            leaf.position.set(-sideX + dx * t, p.h + .19 + rise * t, 0);
            leaf.rotation.z = sign * .8;
            cacheUsers.push(new WeakRef(leaf)); part.add(leaf);
          }
        }
      } else if (layout.profile === 'hieizan') {
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
      if (layout.profile === 'moribe' && layout.kind === 'yashiki') part.add(tsukue(true));
      else if (hieiSobo) {
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
    else if (p.part === 'waterJar' && villageHome) {
      // 水甕は底・胴・口縁・内壁を一続きにし、水面を口より下へ納める。
      // 全戸で原形と材質を共用し、動かない調度の束へ一度だけまとめる。
      const jarKey = '民家の炊事の水甕', waterKey = '民家の水甕の水面';
      if (!shapes.has(jarKey)) shapes.set(jarKey, new THREE.LatheGeometry([
        new THREE.Vector2(0, 0), new THREE.Vector2(.12, 0),
        new THREE.Vector2(.18, .08), new THREE.Vector2(.22, .28),
        new THREE.Vector2(.21, .43), new THREE.Vector2(.175, .56),
        new THREE.Vector2(.19, .59), new THREE.Vector2(.19, .62),
        new THREE.Vector2(.165, .62), new THREE.Vector2(.15, .58),
        new THREE.Vector2(.185, .43), new THREE.Vector2(.195, .28),
        new THREE.Vector2(.155, .09), new THREE.Vector2(.1, .035),
        new THREE.Vector2(0, .035),
      ], 12));
      if (!shapes.has(waterKey)) shapes.set(waterKey, new THREE.CircleGeometry(.165, 12));
      const jar = new THREE.Mesh(shapes.get(jarKey), mat(0x62513e, 'earth'));
      const water = new THREE.Mesh(shapes.get(waterKey), mat(0x696f62));
      water.rotation.x = -Math.PI / 2; water.position.y = .5;
      for (const mesh of [jar, water]) { cacheUsers.push(new WeakRef(mesh)); part.add(mesh); }
      // 炊事の水を汲む木の柄杓を口へ渡す推定のしつらえ。
      // 椀は底と内壁を持ち、柄の下面を甕の口へ載せる。外寸からはみ出させない。
      // 全戸で原形・材質を共用し、水面と同じ静止した調度の束へまとめる。
      const scoopKey = '民家の水甕の柄杓の椀', handleKey = '民家の水甕の柄杓の柄';
      if (!shapes.has(scoopKey)) shapes.set(scoopKey, new THREE.LatheGeometry([
        new THREE.Vector2(0, -.045), new THREE.Vector2(.04, -.045),
        new THREE.Vector2(.055, -.03), new THREE.Vector2(.062, .008),
        new THREE.Vector2(.053, .008), new THREE.Vector2(.047, -.025),
        new THREE.Vector2(.033, -.035), new THREE.Vector2(0, -.035),
      ], 12));
      if (!shapes.has(handleKey)) shapes.set(handleKey,
        new THREE.CylinderGeometry(.007, .009, .245, 8));
      const scoop = new THREE.Mesh(shapes.get(scoopKey), mat(0x786044));
      scoop.position.set(-.1, .628, 0);
      const handle = new THREE.Mesh(shapes.get(handleKey), mat(0x786044));
      handle.rotation.z = -Math.PI / 2;
      handle.position.set(.0725, .628, 0);
      for (const mesh of [scoop, handle]) { cacheUsers.push(new WeakRef(mesh)); part.add(mesh); }
      part.scale.set(p.w / .44, p.h / .62, p.d / .44);
    }
    else if (p.part === 'stove') {
      if (villageHome) {
        // 土の竈は焚口を実際にくぼませ、外壁側へ背を向けて土間から薪を入れる。
        // 床の上の黒い四角と角釜ではなく、炉床・袖・上部を組み、丸い鉄釜を据える。
        box(part, .85, .1, .7, 0, .05, 0, 0x75634b);
        // 焚口のすぐ奥を土の塊で塞がず、釜底の下まで炉を通す。
        // 奥壁と左右の袖で同じ外寸を囲み、中央に薪と熱の通る空間を残す。
        // 奥壁の上部に煙道を残し、釜底から背面上部の煙抜きへつなぐ。
        // 炉を密閉せず、焚口や土間側へ煙の出口を向けない推定の造り。
        box(part, .85, .2, .1, 0, .2, -.3, 0x75634b);
        for (const side of [-1, 1])
          box(part, .365, .1, .1, side * .2425, .35, -.3, 0x75634b);
        for (const side of [-1, 1]) box(part, .25, .3, .6, side * .3, .25, .05, 0x75634b);
        // 釜口を丸く抜き、口縁で釜を受ける。炉内の釜底まで土で埋めない。
        // 穴付きの天端も全戸で同じ形・材質を使い、既存の調度の束へまとめる。
        const throatKey = '民家の竈の釜口';
        if (!shapes.has(throatKey)) {
          const top = new THREE.Shape();
          top.moveTo(-.425, -.35); top.lineTo(.425, -.35);
          top.lineTo(.425, .35); top.lineTo(-.425, .35); top.closePath();
          const hole = new THREE.Path();
          hole.absarc(0, 0, .25, 0, Math.PI * 2, true); top.holes.push(hole);
          // 釜口とは別に背面の煙道を抜く。下の奥壁の切り欠きと重ね、
          // 黒い面を貼るだけでなく、厚い土の天端を貫く口にする。
          // 回転後は奥行きが反転するため、正の側へ穴を描く。
          const flue = new THREE.Path();
          flue.moveTo(-.06, .27); flue.lineTo(-.06, .325);
          flue.lineTo(.06, .325); flue.lineTo(.06, .27); flue.closePath();
          top.holes.push(flue);
          const geo = new THREE.ExtrudeGeometry(top, { depth: .25, bevelEnabled: false, curveSegments: 12, steps: 1 });
          geo.rotateX(Math.PI / 2); shapes.set(throatKey, geo);
        }
        const throat = new THREE.Mesh(shapes.get(throatKey), mat(0x75634b));
        throat.position.y = .65; cacheUsers.push(new WeakRef(throat)); part.add(throat);
        // 炉内の煤も煙道の入口を塞がない形に分ける。
        box(part, .35, .2, .015, 0, .2, -.242, 0x221c17);
        for (const side of [-1, 1])
          box(part, .115, .1, .015, side * .1175, .35, -.242, 0x221c17);
        box(part, .35, .012, .6, 0, .106, .05, 0x514337);
        // 焚口の奥を空の黒い箱にせず、炉床の灰と釜へ差し入れた薪を納める。
        // 囲炉裏と薪の原形・材質を共用し、土間の通路へはみ出させない。
        box(part, .32, .012, .52, 0, .118, .05, 0x817563);
        const fuelKey = '民家の炉の薪';
        if (!shapes.has(fuelKey)) shapes.set(fuelKey, new THREE.CylinderGeometry(.023, .029, .26, 7));
        for (const x of [-.085, 0, .085]) {
          const fuel = new THREE.Mesh(shapes.get(fuelKey), mat(0x30221a));
          fuel.rotation.x = Math.PI / 2; fuel.position.set(x, .148, .12);
          cacheUsers.push(new WeakRef(fuel)); part.add(fuel);
          // 薪の奥の端だけ熾し、火の粒や追加の光源は作らない。
          box(part, .025, .012, .03, x, .17, -.005, 0x8e4928);
        }
        const potKey = '民家の竈の鉄釜', lidKey = '民家の竈の木蓋';
        // 半球一枚では釜口に厚みがなく、土の釜口へ掛かる部分もない。
        // 外底・羽・口縁・内底を一続きにし、羽の下面を竈の天端へ載せる推定の造り。
        // 蓋の下面まで口縁を立ち上げ、蓋の周りの隙間からも鉄の内壁が見えるようにする。
        // 全戸で同じ回転体を使い、動かない調度の束へ一度だけまとめる。
        if (!shapes.has(potKey)) shapes.set(potKey, new THREE.LatheGeometry([
          new THREE.Vector2(0, -.22), new THREE.Vector2(.1, -.2),
          new THREE.Vector2(.2, -.13), new THREE.Vector2(.245, -.035),
          new THREE.Vector2(.25, -.02), new THREE.Vector2(.3, -.02),
          new THREE.Vector2(.3, 0), new THREE.Vector2(.263, 0),
          new THREE.Vector2(.263, .0175), new THREE.Vector2(.238, .0175),
          new THREE.Vector2(.238, -.03), new THREE.Vector2(.19, -.12),
          new THREE.Vector2(.09, -.18), new THREE.Vector2(0, -.195),
        ], 12));
        if (!shapes.has(lidKey)) {
          // 木蓋は三枚の接ぎ板を円形に切り、上の二本の押さえ木でつなぐ推定の造り。
          // 二ミリの目地に板の木口を残す。外径・厚みは保ち、全戸で一つの原形を共有する。
          const radius = .245, joint = .002, boards = [];
          for (let i = 0; i < 3; i++) {
            const low = -radius + radius * 2 * i / 3 + (i ? joint / 2 : 0);
            const high = -radius + radius * 2 * (i + 1) / 3 - (i < 2 ? joint / 2 : 0);
            const a = Math.asin(low / radius), b = Math.asin(high / radius);
            const outline = new THREE.Shape();
            outline.moveTo(radius * Math.cos(a), low);
            outline.absarc(0, 0, radius, a, b, false);
            outline.lineTo(-radius * Math.cos(b), high);
            outline.absarc(0, 0, radius, Math.PI - b, Math.PI - a, false);
            outline.closePath();
            const board = new THREE.ExtrudeGeometry(outline,
              { depth: .035, bevelEnabled: false, curveSegments: 4, steps: 1 });
            board.rotateX(Math.PI / 2); board.translate(0, .0175, 0); boards.push(board);
          }
          shapes.set(lidKey, mergeGeometries(boards));
          for (const board of boards) board.dispose();
        }
        const pot = new THREE.Mesh(shapes.get(potKey), mat(0x292723));
        pot.position.y = .67;
        const lid = new THREE.Mesh(shapes.get(lidKey), mat(0x786044));
        lid.position.y = .705;
        for (const mesh of [pot, lid]) { cacheUsers.push(new WeakRef(mesh)); part.add(mesh); }
        for (const x of [-.12, .12]) box(part, .035, .035, .38, x, .74, 0, 0x59412b);
      } else {
        box(part, .85, .65, .7, 0, .325, 0, 0x75634b);
        box(part, .3, .25, .025, 0, .22, .36, 0x221c17);
        box(part, .42, .18, .42, 0, .72, 0, 0x292723);
      }
    } else if (p.part === 'altar') {
      if (village) {
      // 須弥壇：下框・黒漆の腰（金の格狭間）・上框の三段に、蓮台の本尊と光背。前に小さな前卓と香炉
      if (village && layout.kind === 'hondo') {
        // 下框も一枚の厚板にせず、四周の框・受け木・敷板で組む推定復元。
        // 框・受け木・敷板は長手へ木目を通す。建具と同じ原形・材質を使い回す。
        // 外寸と腰の据わる高さは保ち、隅で横木を重ねない。
        for (const side of [-1, 1]) {
          timberBox(part, 2.1, .14, .1, 0, .07, side * .45, 0x24170f);
          timberBox(part, .1, .14, .8, side * 1, .07, 0, 0x24170f);
          timberBox(part, .08, .1, .78, side * .6, .05, 0, 0x493022);
          // 敷板の四辺を框の内側の受け段へ載せ、木口だけの突き付けにしない。
          // 板の下面で止め、上面と既存の受け木には重ねない。
          timberBox(part, 1.9, .02, .01, 0, .09, side * .395, 0x24170f);
          timberBox(part, .01, .02, .78, side * .945, .09, 0, 0x24170f);
        }
        const joint = .002;
        for (let i = 0; i < 4; i++) {
          const back = -.4 + i * .2 + (i ? joint / 2 : 0);
          const front = -.4 + (i + 1) * .2 - (i < 3 ? joint / 2 : 0);
          timberBox(part, 1.9, .04, front - back, 0, .12, (back + front) / 2, 0x24170f);
          // 二ミリの目地は下半分の接ぎ代で受け、壇の中まで光を通さない。
          if (i) timberBox(part, 1.9, .02, joint,
            0, .11, -.4 + i * .2, 0x24170f);
        }
      } else box(part, 2.1, .14, 1, 0, .07, 0, 0x24170f);
      if (village && layout.kind === 'hondo') {
        // 小堂の須弥壇の腰は塊にせず、四周の羽目板を上下の框と束で受ける。
        // 格狭間の奥へ板を引き、板端は束の裏へ掛ける。裏板で目地からの透けを止める。
        // 元の腰の外寸に収め、内陣の通路・当たりは保つ。箱と材質は共用する。
        // 腰の羽目板は幅二十五センチ以下の縦板を接ぐ推定の仕上げ。
        // 天井板・建具の原形と木目を立てて使い、目地の奥は既存の裏板で受ける。
        // 設営時だけ割り、調度の束へまとめる。見込みと框の納まりは変えない。
        const waistBoards = (left, right, side, flank = false) => {
          const count = Math.max(1, Math.ceil((right - left) / .25));
          for (let j = 0; j < count; j++) {
            const a = left + (right - left) * j / count + (j ? .001 : 0);
            const b = left + (right - left) * (j + 1) / count - (j < count - 1 ? .001 : 0);
            const board = templeCeilingBoard(.3, b - a,
              j % 2 ? 0x302016 : 0x2a1a12, .028);
            board.rotation.set(0, flank ? 0 : Math.PI / 2, Math.PI / 2);
            board.position.set(flank ? side * .911 : (a + b) / 2,
              .29, flank ? (a + b) / 2 : side * .396);
            part.add(board);
          }
        };
        for (const side of [-1, 1]) {
          box(part, 1.85, .3, .018, 0, .29, side * .373, 0x1c120d);
          const edges = [-.925, -.275, .275, .925], joint = .002;
          for (let i = 0; i < edges.length - 1; i++) {
            const left = edges[i] + (i ? joint / 2 : 0);
            const right = edges[i + 1] - (i < edges.length - 2 ? joint / 2 : 0);
            waistBoards(left, right, side);
          }
          box(part, .018, .3, .746, side * .888, .29, 0, 0x1c120d);
          for (let i = 0; i < 2; i++) {
            const center = (i ? 1 : -1) * .2055;
            waistBoards(center - .409 / 2, center + .409 / 2, side, true);
          }
          // 側面の中央の継ぎ目は内側の束で受け、金の格狭間の奥へ収める。
          timberBox(part, .055, .3, .045, side * .8695, .29, 0, 0x493022);
        }
      } else box(part, 1.85, .3, .82, 0, .29, 0, 0x2a1a12);
      if (village && layout.kind === 'hondo') {
        // 小堂の内陣は推定のしつらえ。本尊の背後を来迎壁と来迎柱で受け、
        // 須弥壇だけを住居の壁際へ置いた姿にしない。壇の奥行きの内側へ納める。
        // 木枠の内面で羽目を止め、光背・天蓋や左右の通路へ重ねない。
        // 来迎壁は一枚の平板にせず、上下の横木と二本の間柱で土壁を受ける推定の納まり。
        // 元の壁の外寸・厚みに収め、来迎柱や頭貫へ木を重ねず、通路と当たりも保つ。
        // 土壁を木枠より八ミリ奥へ引き、木口と塗り壁の見込みを表裏に残す。
        // 共通の箱と材質を使い、須弥壇の静止した束へ一度だけまとめる。
        const wallBottom = .56, wallTop = 1.98, railH = .06, studW = .045;
        // 丸柱は柱頭・柱脚で細くなるため、平らな壁端を柱の最大径へ
        // 突き付けるだけでは縦に光が漏れる。両端の縦框を柱へ差し込み、
        // 土壁は框の内面で止める。元の壇の外寸と通路は広げない。
        const stileW = .05, stileX = .875;
        // 土壁を囲う縦框・間柱は縦、横木は横へ木目を通し、塗り壁と区別する。
        for (const side of [-1, 1]) timberBox(part, stileW, wallTop - wallBottom, .04,
          side * stileX, (wallBottom + wallTop) / 2, -.46, 0x493022);
        const infillBottom = wallBottom + railH, infillTop = wallTop - railH;
        for (const y of [wallBottom + railH / 2, wallTop - railH / 2])
          timberBox(part, (stileX - stileW / 2) * 2, railH, .04, 0, y, -.46, 0x493022);
        const edges = [-stileX + stileW / 2, -.3, .3, stileX - stileW / 2];
        for (const x of [edges[1], edges[2]])
          timberBox(part, studW, infillTop - infillBottom, .04,
            x, (infillBottom + infillTop) / 2, -.46, 0x493022);
        for (let i = 0; i < edges.length - 1; i++) {
          const left = edges[i] + (i ? studW / 2 : 0);
          const right = edges[i + 1] - (i < edges.length - 2 ? studW / 2 : 0);
          box(part, right - left, infillTop - infillBottom, .024,
            (left + right) / 2, (infillBottom + infillTop) / 2, -.46, 0xbdb39a);
        }
        // 来迎柱は角材の棒で代用せず、円柱の胴と頭貫で来迎壁を受ける推定の姿。
        // 胴の上下を少し細め、上下の木口を台輪・頭貫へ納める。元の柱の外寸と通路を保つ。
        const pillarKey = '小堂の来迎丸柱';
        if (!shapes.has(pillarKey)) shapes.set(pillarKey, new THREE.LatheGeometry([
          new THREE.Vector2(0, 0), new THREE.Vector2(.032, 0),
          new THREE.Vector2(.04, .12), new THREE.Vector2(.04, 1.3),
          new THREE.Vector2(.032, 1.46), new THREE.Vector2(0, 1.46),
        ], 12));
        for (const x of [-.93, .93]) {
          // 回転体の縦方向へ建具と同じ木目を通す。丸柱の原形と材質は左右で共有する。
          const pillar = new THREE.Mesh(shapes.get(pillarKey), mat(0x493022, 'villageWood'));
          pillar.position.set(x, .54, -.46);
          cacheUsers.push(new WeakRef(pillar)); part.add(pillar);
          timberBox(part, .08, .04, .08, x, .54, -.46, 0x493022);
        }
        // 頭貫と台輪は長手の木目に揃え、来迎柱との取り合いを見せる。
        timberBox(part, 1.94, .04, .08, 0, 2, -.46, 0x493022);
        timberBox(part, 1.78, .04, .08, 0, .54, -.46, 0x493022);
        // 格狭間は金板で埋めず、曲線の縁の内側に黒い腰を見せる。
        const key = '小堂の須弥壇の格狭間';
        if (!shapes.has(key)) {
          const outline = (path, w, h) => {
            path.moveTo(-.5 * w, -.5 * h);
            path.lineTo(.5 * w, -.5 * h);
            path.quadraticCurveTo(.48 * w, -.05 * h, .35 * w, .02 * h);
            path.quadraticCurveTo(.25 * w, .45 * h, .08 * w, .28 * h);
            path.quadraticCurveTo(0, .55 * h, -.08 * w, .28 * h);
            path.quadraticCurveTo(-.25 * w, .45 * h, -.35 * w, .02 * h);
            path.quadraticCurveTo(-.48 * w, -.05 * h, -.5 * w, -.5 * h);
            path.closePath();
          };
          const frame = new THREE.Shape(), opening = new THREE.Path();
          outline(frame, .4, .18); outline(opening, .34, .125);
          frame.holes.push(opening);
          // 格狭間の縁に厚みを付け、斜めからも内側の木口が見える透かし彫りにする。
          // 裏面を羽目板へ合わせ、元の框より外へ張り出さない。五か所で原形を共有する。
          const carving = new THREE.ExtrudeGeometry(frame,
            { depth: .012, bevelEnabled: false, steps: 1, curveSegments: 8 });
          carving.translate(0, 0, -.006);
          shapes.set(key, carving);
        }
        // 正面だけの飾りで終わらせず、左右の腰にも同じ格狭間を回す推定の造り。
        // 側面は腰の外面へ向け、上框・下框から張り出さない。原形と材質は三面で共有する。
        for (const [x, z, rot] of [[-.55, .416, 0], [0, .416, 0], [.55, .416, 0],
          [-.931, 0, -Math.PI / 2], [.931, 0, Math.PI / 2]]) {
          const frame = new THREE.Mesh(shapes.get(key), mat(0x8a6c30));
          frame.position.set(x, .29, z); frame.rotation.y = rot;
          cacheUsers.push(new WeakRef(frame)); part.add(frame);
        }
        // 腰の羽目板を上下の框と束で受ける。背面も框組みにし、
        // 来迎壁の下や内陣の脇から見える裏側を羽目板だけで支えない推定の納まり。
        // 据え付けの調度へ一度だけまとめ、須弥壇の当たりや内陣の通路は広げない。
        // 横框は横、束は縦へ木目を通し、彫り物を受ける木組みを塗りつぶさない。
        for (const yy of [.165, .415]) {
          for (const side of [-1, 1])
            timberBox(part, 1.85, .05, .018, 0, yy, side * .419, 0x493022);
          for (const side of [-1, 1]) timberBox(part, .018, .05, .82, side * .934, yy, 0, 0x493022);
        }
        for (const side of [-1, 1]) for (const x of [-.85, -.275, .275, .85])
          timberBox(part, .045, .2, .018, x, .29, side * .419, 0x493022);
        for (const side of [-1, 1]) for (const z of [-.34, .34])
          timberBox(part, .018, .2, .045, side * .934, .29, z, 0x493022);
      } else for (const x of [-.55, 0, .55]) box(part, .4, .18, .01, x, .29, .415, 0x8a6c30);
      if (village && layout.kind === 'hondo') {
        // 須弥壇の上框は四周の木と内側の敷板で組む推定復元。
        // 框の内側に一センチの受け段を欠き、敷板の端を載せる。
        // 木口を触れさせるだけにせず、上面・外寸を保って板と框の重なりも避ける。
        for (const side of [-1, 1]) {
          timberBox(part, 2.1, .1, .11, 0, .49, side * .445, 0x24170f);
          timberBox(part, .11, .1, .78, side * .995, .49, 0, 0x24170f);
          timberBox(part, 1.88, .04, .01, 0, .46, side * .385, 0x24170f);
          timberBox(part, .01, .04, .76, side * .935, .46, 0, 0x24170f);
          timberBox(part, .08, .04, .76, side * .6, .46, 0, 0x493022);
        }
        // 板の継ぎ目の奥には受け木と腰を残し、壇の内部を透かさない。
        const boardD = .78 / 3, joint = .002;
        for (let i = 0; i < 3; i++) {
          const back = -.39 + i * boardD + (i ? joint / 2 : 0);
          const front = -.39 + (i + 1) * boardD - (i < 2 ? joint / 2 : 0);
          // 敷板も塗りつぶした箱にせず、継ぎ目と平行な木目を既存の板材で表す。
          const board = templeCeilingBoard(1.88, front - back, 0x24170f, .06);
          board.position.set(0, .51, (back + front) / 2); part.add(board);
          // 上框の敷板も目地の下半分だけつなぎ、本尊の下に貫通した隙間を残さない。
          // 板の表面・裏面と外寸は保ち、共通の木材で静止した調度へまとめる。
          if (i) timberBox(part, 1.88, .03, joint,
            0, .495, -.39 + i * boardD, 0x24170f);
        }
      } else box(part, 2.1, .1, 1, 0, .49, 0, 0x24170f);
      if (village && layout.kind === 'hondo') {
        // 蓮台の下は角箱で済ませず、上下の框と腰を備えた八角の台座で補う推定の姿。
        // 元の外寸・上端に収め、須弥壇の供具と内陣の通路を保つ。
        // 八角柱の原形と材質を使い回し、ほかの調度と同じ静止した束へまとめる。
        const key = '小堂の八角の台座';
        if (!shapes.has(key)) shapes.set(key, new THREE.CylinderGeometry(1, 1, 1, 8).rotateY(Math.PI / 8));
        for (const [w, height, d, y, color] of [
          [.6, .025, .5, .5525, 0x6e5424],
          [.51, .05, .41, .59, 0x59412b],
          [.6, .025, .5, .6275, 0x6e5424],
        ]) {
          const base = new THREE.Mesh(shapes.get(key), mat(color));
          // 八角の一辺を正面へ向け、縮尺は回転後の外寸から決める。
          base.scale.set(w / (2 * Math.cos(Math.PI / 8)), height, d / (2 * Math.cos(Math.PI / 8)));
          base.position.set(0, y, -.1); cacheUsers.push(new WeakRef(base)); part.add(base);
        }
      } else box(part, .6, .1, .5, 0, .59, -.1, 0x6e5424);
      if (village && layout.kind === 'hondo') {
        // 宗派・印相は断定せず、蓮台に結跏して手を重ねる小さな坐像として補う。
        // 全身と蓮弁は一つの球を共有し、光背も既存の調度と一緒にまとめる。
        const key = '小堂の坐像';
        if (!shapes.has(key)) shapes.set(key, new THREE.SphereGeometry(1, 12, 8));
        const round = (w, h, d, x, y, z, color) => {
          const m = new THREE.Mesh(shapes.get(key), mat(color));
          cacheUsers.push(new WeakRef(m)); m.scale.set(w / 2, h / 2, d / 2);
          m.position.set(x, y, z); part.add(m); return m;
        };
        // 舟形光背は楕円球で代用せず、頂の尖った薄い板と縁にする推定のしつらえ。
        // 元の外寸を保ち、来迎壁と像の間に納める。形は使い回し、設営時だけ束ねる。
        const haloKey = '小堂の舟形光背', haloRimKey = '小堂の舟形光背の縁';
        if (!shapes.has(haloKey)) {
          const outline = (path, scale = 1) => {
            path.moveTo(0, -.55 * scale);
            path.bezierCurveTo(-.5 * scale, -.5 * scale, -.6 * scale, .05 * scale, 0, .55 * scale);
            path.bezierCurveTo(.6 * scale, .05 * scale, .5 * scale, -.5 * scale, 0, -.55 * scale);
            path.closePath();
          };
          const board = new THREE.Shape(), rim = new THREE.Shape(), inset = new THREE.Path();
          outline(board); outline(rim); outline(inset, .9); rim.holes.push(inset);
          shapes.set(haloKey, new THREE.ExtrudeGeometry(board, { depth: .035, bevelEnabled: false, curveSegments: 12 }));
          shapes.set(haloRimKey, new THREE.ExtrudeGeometry(rim, { depth: .008, bevelEnabled: false, curveSegments: 12 }));
        }
        for (const [shape, z, color] of [[haloKey, -.3775, 0x7a5e26], [haloRimKey, -.3425, 0x8a6c30]]) {
          const halo = new THREE.Mesh(shapes.get(shape), mat(color));
          halo.position.set(0, 1.18, z); cacheUsers.push(new WeakRef(halo)); part.add(halo);
        }
        round(.68, .17, .48, 0, .69, -.08, 0x8a6c30);   // 蓮台
        // 蓮台の上下に蓮弁を重ねる。坐像と同じ球の原形を伸ばし、段ごとに半弁ずらす。
        for (let row = 0; row < 2; row++) for (let i = 0; i < 12; i++) {
          const angle = (i + row * .5) * Math.PI * 2 / 12;
          const petal = new THREE.Mesh(shapes.get(key), mat(row ? 0x9b7c38 : 0x796028));
          petal.scale.set(.075, .095, .035);
          petal.position.set(Math.sin(angle) * .27, .65 + row * .075, -.08 + Math.cos(angle) * .18);
          petal.rotation.set(row ? -.3 : .3, angle, 0);
          cacheUsers.push(new WeakRef(petal)); part.add(petal);
        }
        for (const x of [-.18, .18]) round(.4, .19, .35, x, .82, .01, 0xa48b4a);
        round(.42, .57, .3, 0, 1.08, -.1, 0xa48b4a);   // 袈裟に包まれた胴
        round(.25, .29, .24, 0, 1.48, -.1, 0xa48b4a);
        round(.13, .1, .13, 0, 1.64, -.12, 0x665331);   // 肉髻
        // 球の頭だけにせず、伏せた目・鼻筋・長い耳で仏像の顔を作る。
        // 金色の隆起で表し、黒い目玉や文字は貼らない。原形・材質は胴と共用する。
        for (const side of [-1, 1]) {
          round(.045, .13, .055, side * .125, 1.455, -.085, 0xa48b4a);
          round(.055, .009, .015, side * .049, 1.49, .014, 0x8a6c30);
          round(.06, .012, .018, side * .049, 1.51, .009, 0xa48b4a);
        }
        round(.026, .065, .038, 0, 1.465, .023, 0xa48b4a);
        round(.052, .008, .013, 0, 1.42, .013, 0x8a6c30);
        for (const x of [-.23, .23]) round(.13, .4, .18, x, 1.07, -.01, 0xa48b4a);
        round(.24, .08, .14, 0, .94, .13, 0xa48b4a);    // 膝上の両手
        // 胸の衣端と膝の衣文を薄い隆起にする。指物のような角材を像へ重ねない。
        round(.035, .35, .025, -.035, 1.14, .037, 0x8a6c30).rotation.z = -.4;
        for (const side of [-1, 1])
          round(.22, .014, .025, side * .18, .846, .177, 0x8a6c30).rotation.z = side * .12;
      } else {
        box(part, .45, .7, .4, 0, .99, -.1, 0xa48b4a);
        box(part, .28, .28, .28, 0, 1.48, -.1, 0xa48b4a);
        box(part, .9, .9, .03, 0, 1.25, -.36, 0x7a5e26);
      }
      const villageAltar = village && layout.kind === 'hondo';
      if (villageAltar) {
        // 小堂の供水は白い箱で代用せず、須弥壇の上框へ小さな器と受け皿を据える推定のしつらえ。
        // 本尊の蓮台と左右の灯明を避け、壇の内側へ納める。器の底と内壁も一続きにする。
        const cupKey = '小堂の供水器', plateKey = '小堂の供水器の受け皿', waterKey = '小堂の供水';
        if (!shapes.has(cupKey)) shapes.set(cupKey, new THREE.LatheGeometry([
          new THREE.Vector2(0, 0), new THREE.Vector2(.032, 0),
          new THREE.Vector2(.032, .018), new THREE.Vector2(.05, .045),
          new THREE.Vector2(.055, .075), new THREE.Vector2(.048, .075),
          new THREE.Vector2(.043, .045), new THREE.Vector2(.025, .025),
          new THREE.Vector2(0, .025),
        ], 12));
        if (!shapes.has(plateKey)) shapes.set(plateKey, new THREE.LatheGeometry([
          new THREE.Vector2(0, 0), new THREE.Vector2(.055, 0),
          new THREE.Vector2(.075, .012), new THREE.Vector2(.075, .018),
          new THREE.Vector2(.052, .008), new THREE.Vector2(0, .008),
        ], 12));
        if (!shapes.has(waterKey)) shapes.set(waterKey, new THREE.CircleGeometry(.046, 12));
        // 形と材質は二組で共用し、ほかの調度と一緒に設営時だけ束ねる。
        for (const x of [-.4, .4]) for (const [key, yy, color] of [
          [plateKey, .54, 0x8b806c], [cupKey, .548, 0x8b806c], [waterKey, .611, 0x696f62],
        ]) {
          const m = new THREE.Mesh(shapes.get(key), mat(color));
          if (key === waterKey) m.rotation.x = -Math.PI / 2;
          m.position.set(x, yy, .3); cacheUsers.push(new WeakRef(m)); part.add(m);
        }
      }
      // 小堂の香炉は独立した前卓へ置く。須弥壇の縁に同じ供具を重ねない。
      if (!villageAltar) {
        box(part, .5, .04, .22, 0, .54, .38, 0x2a1810); box(part, .12, .1, .12, 0, .6, .38, 0x6a5a3a);
      }
      place(part, tomyo(villageAltar), -.75, 0, 0, .55); place(part, tomyo(villageAltar), .75, 0, 0, .55);
      if (templeAltar) {
        // 古い堂の内陣の推定：家庭用仏壇ではなく、須弥壇の本尊を覆う天蓋と幡。
        // 須弥壇と同じ範囲に収め、左右の通路を空ける。形・材質は箱の共通部品を使う。
        if (villageAltar) {
          // 小堂の天蓋は推定の框組み。下面を一枚の厚板にせず、
          // 四周の框で奥へ入った鏡板を受け、下から見上げても深さが分かるようにする。
          // 元の外寸・吊り位置を保ち、共通の箱と材質で既存の調度の束へまとめる。
          for (const z of [-.41, .25])
            timberBox(part, 1.55, .08, .06, 0, 2.18, z, 0x3a2417);
          for (const x of [-.745, .745])
            timberBox(part, .06, .08, .6, x, 2.18, -.08, 0x3a2417);
          // 鏡板は三枚の接ぎ板とする推定の納まり。木目を長手へ通し、
          // 木端の目地を下面からも見せる。端は框へ一センチ掛け、二本の受け桟へ載せる。
          // 暗い裏板を元の厚みの内側に残し、目地から上の蓋板を透かさない。
          // 天井板と同じ原形・材質を共用し、近づいた時だけ須弥壇の束へまとめる。
          box(part, 1.45, .002, .62, 0, 2.209, -.08, 0x30221a);
          const boardD = .62 / 3, joint = .002;
          for (let i = 0; i < 3; i++) {
            const back = -.39 + i * boardD + (i ? joint / 2 : 0);
            const front = -.39 + (i + 1) * boardD - (i < 2 ? joint / 2 : 0);
            const board = templeCeilingBoard(1.45, front - back, i % 2 ? 0x59412b : 0x60472f);
            board.position.set(0, 2.199, (back + front) / 2); part.add(board);
          }
          for (const x of [-.24, .24])
            timberBox(part, .035, .05, .6, x, 2.165, -.08, 0x3a2417);
        } else box(part, 1.55, .08, .72, 0, 2.18, -.08, 0x3a2417);
        if (villageAltar) {
          // 天蓋の上面も金色の塊にせず、木の框と接ぎ板で蓋をする推定復元。
          // 吊り金具の座る高さと外寸を保ち、下の鏡板・受け桟へ荷重を渡す。
          // 建具と同じ原形・材質を使い回し、静止した調度の束へまとめる。
          const rim = .055, joint = .002, depth = .82 - rim * 2;
          for (const side of [-1, 1]) {
            timberBox(part, 1.7, .06, rim, 0, 2.24,
              -.08 + side * (.82 - rim) / 2, 0x59412b);
            timberBox(part, rim, .06, depth, side * (1.7 - rim) / 2,
              2.24, -.08, 0x59412b);
          }
          for (let i = 0; i < 4; i++) {
            const back = -.08 - depth / 2 + depth * i / 4 + (i ? joint / 2 : 0);
            const front = -.08 - depth / 2 + depth * (i + 1) / 4 - (i < 3 ? joint / 2 : 0);
            timberBox(part, 1.7 - rim * 2, .06, front - back,
              0, 2.24, (back + front) / 2, i % 2 ? 0x60472f : 0x59412b);
          }
        } else box(part, 1.7, .06, .82, 0, 2.24, -.08, 0x8a6c30);
        if (village && layout.kind === 'hondo') {
          // 推定の吊り金具。細い角材を天井へ突き付けず、上下の座金で吊り棒を受ける。
          // 天蓋から天井裏の梁まで通し、原形・材質は四隅で共有して調度の束へまとめる。
          // 吊り棒は薄い天井板で止めず、下で組む天井裏の受け梁まで通す。
          // 梁の下面で棒を止めず、梁を貫いて上の座金と横栓で受ける推定の納まり。
          // 下で組む吊り梁の上端と揃え、天蓋の縮尺を戻して高さを決める。
          const beamTop = (h + SHITARAGAHARA_CEILING_LIFT + .44 - (p.y || 0)) / (p.h / 1.5), top = 2.27;
          const plate = .008, rodBottom = top + plate, rodTop = beamTop + plate + .025;
          const rodH = rodTop - rodBottom;
          if (rodH > 0) {
            const key = '小堂の天蓋の吊り棒';
            if (!shapes.has(key)) shapes.set(key, new THREE.CylinderGeometry(.009, .009, 1, 8));
            for (const x of [-.6, .6]) for (const z of [-.3, .14]) {
              const rod = new THREE.Mesh(shapes.get(key), mat(0x39362e));
              rod.scale.y = rodH; rod.position.set(x, (rodBottom + rodTop) / 2, z);
              cacheUsers.push(new WeakRef(rod)); part.add(rod);
              for (const yy of [top + plate / 2, beamTop + plate / 2])
                box(part, .06, plate, .06, x, yy, z, 0x39362e);
              // 栓の下面を座金へ載せ、棒だけが梁から抜け落ちる姿にしない。
              // 四隅は既存の箱・金属材質を共用し、静止した調度の束へまとめる。
              box(part, .05, .012, .012, x, beamTop + plate + .006, z, 0x39362e);
            }
          }
        }
        for (const x of [-.68, .68]) {
          if (villageAltar) {
            // 幡の吊り材は鏡板の下で宙に止めず、天蓋の側框から横木へ掛ける推定の納まり。
            // 框の下面は二・一四メートル。薄い座金で受け、斜めの鉄棒を左右で共用する。
            // 棒の原形・材質は既存の天蓋と共通にし、動かない調度へ一度だけまとめる。
            const anchorX = Math.sign(x) * .745, anchorY = 2.132, bottom = 1.915;
            box(part, .04, .008, .04, anchorX, 2.136, -.08, 0x39362e);
            const key = '小堂の天蓋の吊り棒';
            if (!shapes.has(key)) shapes.set(key, new THREE.CylinderGeometry(.009, .009, 1, 8));
            const hanger = new THREE.Mesh(shapes.get(key), mat(0x39362e));
            hanger.scale.set(.6, Math.hypot(anchorX - x, anchorY - bottom), .6);
            hanger.rotation.z = -Math.atan2(anchorX - x, anchorY - bottom);
            hanger.position.set((x + anchorX) / 2, (bottom + anchorY) / 2, -.08);
            cacheUsers.push(new WeakRef(hanger)); part.add(hanger);
          } else box(part, .035, .28, .035, x, 2.0, -.08, 0x8a6c30);
          if (villageAltar) {
            // 小堂の幡は厚い一枚板にせず、横木から下げた薄い布と二本の脚に分ける。
            // 横木で吊り棒と布の上端を結び、裾の切れ目にも奥行きを残す。
            // 元の幅・下端に収め、箱と材質は共用して須弥壇の束へ一度だけまとめる。
            box(part, .16, .025, .035, x, 1.9025, -.08, 0x8a6c30);
            box(part, .12, .38, .008, x, 1.70, -.08, 0x95815a);
            for (const side of [-1, 1]) {
              const tail = box(part, .04, .15, .008, x + side * .04, 1.435, -.08, 0x95815a);
              // 二本の裾をわずかに表裏へ折り、分厚い木札の断面を見せない。
              tail.rotation.x = side * .08;
            }
            // 縁は金色の角棒ではなく、布を折り返して縫った細い帯とする推定の姿。
            // 表裏へ薄く納め、下の二本の脚も同じ縫い縁でつなぐ。原形と布色は共用する。
            for (const face of [-1, 1]) {
              const z = -.08 + face * .0045;
              for (const yy of [1.525, 1.875])
                box(part, .12, .009, .001, x, yy, z, 0x6e542c);
              for (const side of [-1, 1]) {
                box(part, .006, .38, .001, x + side * .057, 1.70, z, 0x6e542c);
                const edging = new THREE.Group();
                edging.position.set(x + side * .04, 1.435, -.08);
                edging.rotation.x = side * .08;
                for (const edge of [-1, 1])
                  box(edging, .004, .15, .001, edge * .018, 0, face * .0045, 0x6e542c);
                box(edging, .032, .006, .001, 0, -.072, face * .0045, 0x6e542c);
                part.add(edging);
              }
            }
          } else box(part, .12, .54, .025, x, 1.63, -.08, 0x95815a);
        }
      }
      }
    } else if (moribeStorage) {
      // 在所の収納は蓋付きの木櫃で推定復元。購入素材の引き出し箪笥へ置き換えない。
      // 蓋・底・補強帯も調度の当たりの内側へ納め、共通の箱と材質へまとめる。
      const { w, h, d } = p;
      // 鉄帯と板の表面を同じ面へ重ねると、近寄った時にちらつく。
      // 帯の幅だけ板を欠き、下に木を残して鉄を納める推定復元。
      // 櫃の外寸と当たりを保ち、既存の箱・材質へまとめる。
      const bands = [-w * .34, w * .34];
      const cuts = [-w / 2, bands[0] - .02, bands[0] + .02,
        bands[1] - .02, bands[1] + .02, w / 2];
      // 帯の欠きで分けた胴板・蓋板も、幅方向へ通る一枚の横板として写す。
      // 切片の長辺で選ぶと帯の下だけ縦目になり、節の大きさも変わってしまう。
      // 元の板幅と位置で木目をつなぎ、二棟の櫃で寸法ごとの形を使い回す。
      const plank = (ww, hh, dd, xx, yy, zz, color) => {
        const mesh = timberBox(part, ww, hh, dd, xx, yy, zz, color, 0);
        const key = `森部の木櫃横板:${ww}:${hh}:${dd}:${xx}:${w}`;
        if (!shapes.has(key)) {
          const geo = mesh.geometry.clone();
          const pos = geo.attributes.position, normal = geo.attributes.normal, uv = geo.attributes.uv;
          for (let i = 0; i < pos.count; i++) {
            if (Math.abs(normal.getX(i)) > .5) continue;
            uv.setY(i, (pos.getX(i) + xx) / w + .5);
          }
          shapes.set(key, geo);
        }
        mesh.geometry = shapes.get(key);
      };
      // 一枚の塊ではなく横板を組んだ櫃とする推定復元。目地の奥には
      // 下地を残し、隙間から中を透かさない。板の木目は長手へ通す。
      // 胴板の木口を畳へ直接載せず、左右の畳ずりで底板を受ける推定の納まり。
      // 外寸内で底を三センチ上げ、畳の上面・蓋の高さ・調度の当たりは保つ。
      const footH = .03, bodyH = h - .1 - footH;
      for (const x of [-w / 2 + .05, w / 2 - .05]) {
        timberBox(part, .08, footH, d, x, footH / 2, 0, 0x503923, 2);
      }
      // 底板は胴の内面へ納め、側板と同じ面を重ねない。
      timberBox(part, w - .06, .025, d - .06, 0, footH + .0125, 0, 0x503923, 0);
      box(part, w - .06, bodyH - .025, d - .06,
        0, footH + .025 + (bodyH - .025) / 2, 0, 0x2e2218);
      const rows = Math.max(2, Math.round(bodyH / .16)), rowH = bodyH / rows;
      for (let q = 0; q < rows; q++) for (const side of [-1, 1]) {
        const cy = footH + (q + .5) * rowH;
        for (let i = 1; i < cuts.length; i++) {
          const depth = i % 2 === 0 ? .012 : .03;
          plank(cuts[i] - cuts[i - 1], rowH - .002, depth,
            (cuts[i] + cuts[i - 1]) / 2, cy, side * (d / 2 - .03 + depth / 2), 0x503923);
        }
        // 側板の木口は前後の板の内面へ納め、四隅で同じ面を重ねない。
        timberBox(part, .03, rowH - .002, d - .06, side * (w / 2 - .015), cy, 0, 0x503923);
      }
      box(part, w, .02, d, 0, h - .09, 0, 0x252321);
      box(part, w, .02, d, 0, h - .07, 0, 0x503923);
      const lidBoards = Math.max(2, Math.round(d / .18)), lidD = d / lidBoards;
      for (let q = 0; q < lidBoards; q++) for (let i = 1; i < cuts.length; i++) {
        const height = i % 2 === 0 ? .048 : .06;
        plank(cuts[i] - cuts[i - 1], height, lidD - .002,
          (cuts[i] + cuts[i - 1]) / 2, h - .06 + height / 2,
          -d / 2 + (q + .5) * lidD, 0x604831);
      }
      for (const x of bands) {
        // 蓋と胴を一本の鉄帯で固定せず、蓋の合わせ目で分ける推定復元。
        // 後ろは蝶番の軸でつなぎ、前は別の留め金で押さえる。
        // 既存の鉄色と箱を共用し、金具も調度の外寸へ納める。
        const seam = h - .08, lowerH = seam - .002 - footH, upperH = h - .012 - seam - .002;
        for (const side of [-1, 1]) {
          box(part, .04, lowerH, .012, x, footH + lowerH / 2, side * (d / 2 - .012), 0x252321);
          box(part, .04, upperH, .012, x, seam + .002 + upperH / 2,
            side * (d / 2 - .012), 0x252321);
        }
        box(part, .04, .012, d, x, h - .006, 0, 0x252321);
        // 蝶番の軸は三つの巻きに分け、左右を胴、中央を蓋の帯へ留める。
        // 木口は同じ面へ重ねず、巻き同士にも一ミリの隙間を残す。
        for (let j = 0; j < 3; j++) box(part, .012, .014, .014,
          x + (j - 1) * .013, seam, -d / 2 + .007, 0x252321);
        // 留め金は帯より内側に納めた鉄板と横向きの受けで表す。
        // 帯の合わせ目を覆い、黒い面へ同じ面の飾りを重ねない。
        box(part, .024, .052, .004, x, seam - .008, d / 2 - .004, 0x66553a);
        box(part, .032, .008, .008, x, seam - .022, d / 2 - .004, 0x252321);
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
    if (!kit && p.part === 'altar') part.scale.set(p.w / 2.1, p.h / 1.5, p.d / (layout.profile === 'moribe' && layout.kind === 'hondo' ? 1.3 : 1));
    place(g, part, p.x, p.z, p.rot || 0, p.y || 0);
    
  }
  for (const room of layout.rooms) if (room.floor === 'tatami') {
    const back = Math.min(...layout.rooms.map(r => r.z0));
    const front = Math.max(...layout.rooms.map(r => r.z1));
    const x0 = room.x0 + .24, x1 = room.x1 - .24;
    const z0 = room.z0 + (room.z0 === back ? .24 : .12);
    const z1 = room.z1 - (room.z1 === front ? .24 : .12);
    for (const [x, z, w, d, rot] of tatamiTiles(x0, x1, z0, z1))
      place(g, villageTatami(w - .002, d - .002, true), x, z, rot, room.y || 0);
  }
  for (const m of shitaragaharaTempleMats(layout))
    place(g, villageTatami(m.w, m.d, true), m.x, m.z, m.rot, m.y);
  // 天井の高い堂・広間は、戸の高さ（約2.3m）で鴨居を通し、上は小壁にする（六メートルの襖を立てない）
  const temple = ['hondo', 'chudo', 'temple'].includes(layout.kind), ph = layout.profile === 'hieizan' ? hieiPartitionHeight(layout.kind, h) : interiorPartitionHeight(layout, h);
  const shitaragaharaFrame = layout.profile === 'shitaragahara' && ['minka', 'hondo'].includes(layout.kind);
  // 固定建具の柱・敷居・鴨居も、滑る戸の枠と同じ木目で納める。
  // 横材は横、柱は縦へ木目を通し、寸法と通れる幅はそのまま使う。
  const partitionTimber = (group, w, h, d, x, y, z, color) => village && shitaragaharaFrame
    ? timberBox(group, w, h, d, x, y, z, color)
    : box(group, w, h, d, x, y, z, color);
  // 低い小堂と民家では、長押の上端と天井の回縁の下面を離す。
  // 外周の長押も同じ高さに揃え、格縁・竿縁を横木へ埋め込まない。
  const railY = shitaragaharaFrame ? Math.min(ph + .42, h - (village ? .22 : .09)) : ph + .42;
  // 設楽原の内法長押は柱の両面を抱く見込みにする。
  // 柱と同じ厚みでは柱の中へ埋まり、長押が柱際で途切れて見える。
  // 固定壁と戸口で同じ寸法を使い、鴨居より上なので引き戸の溝には触れない。
  const railDepth = village && shitaragaharaFrame ? .22 : .14;
  // 外周の長押は壁から二十センチ内側の芯、厚み十センチ。
  // 間仕切りの長押もその内面で止め、同じ高さの上下面を交差させない。
  const railLeft = village && shitaragaharaFrame ? Math.min(...layout.rooms.map(r => r.x0)) + .25 : -Infinity;
  const railRight = village && shitaragaharaFrame ? Math.max(...layout.rooms.map(r => r.x1)) - .25 : Infinity;
  const partitionRail = (group, len, center) => {
    const left = Math.max(-len / 2, railLeft - center);
    const right = Math.min(len / 2, railRight - center);
    if (right > left) {
      if (village && shitaragaharaFrame) {
        const rail = new THREE.Mesh(nageshiGeometry(right - left, .12, railDepth), mat(0x2e2016, 'villageWood'));
        rail.position.set((left + right) / 2, railY, 0);
        cacheUsers.push(new WeakRef(rail)); group.add(rail);
      } else box(group, right - left, .12, railDepth, (left + right) / 2, railY, 0, 0x2e2016);
    }
  };
  // 民家の脇襖・障子は前後四センチの二本溝で受ける。
  // 柱間だけを彫り、柱の下と上には元の木を残す。原形・材質は共用する。
  const homeGroovedRail = (group, len, height, bottom, upper = false, fixedKoshi = false) => {
    // 小堂の固定格子は一本溝へ落とし込む推定の納まり。
    // 民家の引違い用の二本溝と作りを共有し、元の敷居・鴨居の外寸を保つ。
    const depth = fixedKoshi ? (upper ? .12 : .1) : .18, groove = .008;
    const shoulders = fixedKoshi ? [[-depth / 2, -.032], [.032, depth / 2]]
      : [[-.09, -.072], [-.008, .008], [.072, .09]];
    const rail = new THREE.Group();
    const spans = interiorPartitionSpans(-len / 2, len / 2);
    timberBox(rail, len, height - groove, depth, 0, (height - groove) / 2, 0, 0x3a2a1c);
    for (const span of spans) {
      // 見込み六センチの框へ片側二ミリの余裕を取る。
      for (const [a, b] of shoulders)
        timberBox(rail, span.bx - span.ax, groove, b - a,
          (span.ax + span.bx) / 2, height - groove / 2, (a + b) / 2, 0x3a2a1c);
    }
    let left = -len / 2;
    for (let i = 0; i <= spans.length; i++) {
      const right = i < spans.length ? spans[i].ax : len / 2;
      if (right > left) timberBox(rail, right - left, groove, depth,
        (left + right) / 2, height - groove / 2, 0, 0x3a2a1c);
      if (i < spans.length) left = spans[i].bx;
    }
    if (upper) rail.rotation.x = Math.PI;
    rail.position.y = upper ? bottom + height : bottom;
    group.add(rail);
  };
  const partitionUpper = (group, len) => {
    const low = ph + .1, height = h - low;
    if (village && layout.kind === 'hondo' && height > .18) {
      // 村外れの小堂の推定復元。内陣境の上まで住居の土壁で塞がず、
      // 鴨居と天井の間に簡素な連子欄間を納める。長押の上下で分け、
      // 柱頭の肘木を避けて両端に余白を残す。動く格子戸の溝には入れない。
      const inset = .24, width = len - inset * 2;
      if (width > .2) {
        // 格天井の回縁の下面（天井から八センチ下）で欄間を止める。
        // 上框を回縁の中へ埋めず、その下へ接して連子の木口を受ける。
        const top = h - .08, frameBottom = top - .04;
        // 木の連子と上框は柱・鴨居と同じ材質にし、塗り潰した面にしない。
        timberBox(group, width, .04, .06, 0, top - .02, 0, 0x3a2a1c);
        const bays = Math.max(2, Math.round(width / .16));
        // 連子は長押の上下で木口を受ける。長押の中へ一本の木を通さず、
        // 上の框も含めて内面で止め、欄間の小さな隙間に横木を重ねない。
        for (const [a, b] of [[low, Math.min(frameBottom, railY - .06)],
          [Math.max(low, railY + .06), frameBottom]]) {
          if (b <= a) continue;
          for (let i = 0; i <= bays; i++)
            // 両端は連子の外面を小壁の内面へ突き付ける。当たりと同じ割りにする。
            timberBox(group, .025, b - a, .035, -width / 2 + .0125 + (width - .025) * i / bays,
              (a + b) / 2, 0, 0x3a2a1c);
        }
        for (const side of [-1, 1]) box(group, inset, top - low, .06,
          side * (len - inset) / 2, (low + top) / 2, 0, 0xbdb39a);
        return;
      }
    }
    box(group, len, height, .06, 0, low + height / 2, 0, temple ? 0xbdb39a : 0xcfc6b0);
  };
  const partitionPost = (group, x, edge = 0, center = 0) => {
    if (village && layout.kind === 'hondo') {
      // 小堂の内陣境は、来迎柱と同じく丸柱で受ける推定の姿。
      // 柱頭・柱脚を少し絞り、角材の柱頭で肘木へつなぐ。通路と戸の溝の外寸は保つ。
      // 高さ一の原形と材質を共有し、建物ごとの高さだけ写しへ反映する。
      const key = '小堂の内陣境の丸柱';
      if (!shapes.has(key)) shapes.set(key, new THREE.LatheGeometry([
        new THREE.Vector2(0, 0), new THREE.Vector2(.05, 0),
        new THREE.Vector2(.06, .08), new THREE.Vector2(.06, .88),
        new THREE.Vector2(.05, 1), new THREE.Vector2(0, 1),
      ], 12));
      // 内陣境も来迎柱と同じ縦の木目を使い、横向きの肘木と木の向きを分ける。
      const pillar = new THREE.Mesh(shapes.get(key), mat(0x3a2a1c, 'villageWood'));
      pillar.position.set(x, 0, 0); pillar.scale.y = h;
      cacheUsers.push(new WeakRef(pillar)); group.add(pillar);
      partitionTimber(group, .12, .06, .14, x, h - .03, 0, 0x3a2a1c);
      // 内陣境の柱にも外周と同じ二段の肘木を置き、格天井の回縁を下から受ける。
      // 外周と同じく長押の上に一センチ空け、二段の上面を回縁の下面へ合わせる。
      // 長押と肘木を食い込ませず、格子戸の溝と内陣への通り道を空ける。
      // 箱の形と材質は共有し、固定の間仕切りと一緒に一度だけ束ねる。
      // 外壁に取り付く端の柱は肘木を室内へ寄せる。木口を壁の外へ突き出さない。
      const headX = x - edge * .16;
      partitionTimber(group, .34, .04, .24, headX, h - .13, 0, 0x3a2a1c);
      partitionTimber(group, .44, .03, .24, headX, h - .095, 0, 0x3a2a1c);
      // 内陣境の長押にも外周と同じ無紋の釘隠しを据える推定の納まり。
      // 内陣・外陣の両面へ置き、柱や長押へ埋めず、引き戸より上に収める。
      // 箱と鉄色の材質を共用し、固定の間仕切りへ一度だけまとめる。
      const nailX = Math.max(railLeft - center + .0325, Math.min(railRight - center - .0325, x));
      for (const side of [-1, 1]) {
        nageshiNail(group, false, nailX, railY, side * (railDepth * .4 + .006),
          side * Math.atan(railDepth * .2 / .12));
      }
    } else {
      partitionTimber(group, .12, h, .14, x, h / 2, 0, 0x3a2a1c);
      if (villageHome) {
        // 民家の長押も柱へ留める。堂の大きな釘隠しは使わず、小さな無紋の鉄金具で納める推定。
        // 外壁際では長押の端からはみ出さず、表裏とも木の面へ接して据える。
        const nailX = Math.max(railLeft - center + .022, Math.min(railRight - center - .022, x));
        for (const side of [-1, 1]) {
          nageshiNail(group, true, nailX, railY, side * (railDepth * .4 + .004),
            side * Math.atan(railDepth * .2 / .12));
        }
      }
    }
  };
  if (partitions) {
    for (const wall of layout.walls) {
      if (wall.guideOnly) continue;
      const len = Math.hypot(wall.bx - wall.ax, wall.bz - wall.az);
      const rot = Math.atan2(-(wall.bz - wall.az), wall.bx - wall.ax);
      const top = new THREE.Group(), center = (wall.ax + wall.bx) / 2;
      const sill = .06;
      if (villageHome) {
        homeGroovedRail(top, len, sill, 0);
        homeGroovedRail(top, len, .1, ph, true);
      } else if (village && layout.kind === 'hondo') {
        homeGroovedRail(top, len, sill, 0, false, true);
        homeGroovedRail(top, len, .1, ph, true, true);
      } else {
        partitionTimber(top, len, sill, .1, 0, sill / 2, 0, 0x3a2a1c);
        partitionTimber(top, len, .1, .12, 0, ph + .05, 0, 0x3a2a1c);
      }
      partitionRail(top, len, center);
      if (villageHome) {
        for (const leaf of shitaragaharaHomePanels(-len / 2, len / 2)) {
          const width = leaf.bx - leaf.ax;
          const panel = wall.kind === 'shoji'
            ? villageShoji(width, ph - sill, true, leaf.right, true, true)
            : villageFusuma(width, ph - sill, false, true, true);
          place(top, panel, (leaf.ax + leaf.bx) / 2, leaf.offset,
            leaf.right && wall.kind !== 'shoji' ? Math.PI : 0, sill);
        }
        partitionUpper(top, len);
      } else {
        for (const span of interiorPartitionSpans(-len / 2, len / 2)) {
          const width = span.bx - span.ax - .12;
          if (width <= 0) continue;
          const count = Math.max(1, Math.ceil(width / .9));
          for (let j = 0; j < count; j++) {
            const x = span.ax + .06 + width * (j + .5) / count;
            place(top, villageKoshi(width / count, ph - sill, false, true), x, 0, 0, sill);
            if (village && layout.kind === 'hondo') {
              // 上下框から八ミリの実を出して溝で受ける。柱間と中央の引き戸は動かさない。
              // 実は横木の外寸内へ納め、同じ木目の原形・材質と静止した束を共用する。
              for (const y of [sill - .004, ph + .004])
                timberBox(top, width / count - .008, .008, .056, x, y, 0, 0x1e140e);
            }
          }
          const upper = new THREE.Group();
          partitionUpper(upper, span.bx - span.ax);
          upper.position.x = (span.ax + span.bx) / 2; top.add(upper);
        }
      }
      const bays = Math.max(1, Math.round(len / 1.8));
      for (let j = 0; j <= bays; j++)
        partitionPost(top, -len / 2 + len * j / bays, j === 0 ? -1 : j === bays ? 1 : 0, center);
      place(g, top, center, (wall.az + wall.bz) / 2, rot);
    }
    for (const portal of layout.portals) {
      let left = -Infinity, right = Infinity;
      for (const wall of layout.walls) {
        if (Math.abs(wall.az - portal.z) > .001 || Math.abs(wall.bz - portal.z) > .001) continue;
        const a = Math.min(wall.ax, wall.bx), b = Math.max(wall.ax, wall.bx);
        if (b <= portal.x + .001) left = Math.max(left, b);
        if (a >= portal.x - .001) right = Math.min(right, a);
      }
      if (!Number.isFinite(left) || !Number.isFinite(right)) continue;
      const width = right - left, top = new THREE.Group();
      const sill = .06;
      partitionTimber(top, width, sill, .1, 0, sill / 2, 0, 0x3a2a1c);
      partitionTimber(top, width, .1, .12, 0, ph + .05, 0, 0x3a2a1c);
      partitionRail(top, width, portal.x); partitionUpper(top, width);
      place(g, top, portal.x, portal.z);
    }
  }
  {
    const rs = layout.rooms, hw = Math.max(...rs.map(r => r.x1)), hd = Math.max(...rs.map(r => r.z1));
    if (village && layout.kind === 'hondo') {
      const pillarZ = hd - .16;
      // 梁・受け木・吊り木は単色の箱にせず、材の長手へ木目を通す。
      // 建具と同じ絵・寸法別の原形を共用し、釘の金属とは分けて既存の束へまとめる。
      // 内陣境でも丸柱の上へ梁を架け、長い受け木を途中で支える。
      // 間取りの境を共用し、欄間・格子戸の上へ下がる梁や部屋ごとの二重梁にしない。
      const beamZ = [-pillarZ, pillarZ];
      for (const room of rs) for (const z of [room.z0, room.z1]) {
        if (z <= -pillarZ || z >= pillarZ || beamZ.some(v => Math.abs(v - z) < .01)) continue;
        beamZ.push(z);
      }
      // 格天井の裏板上端は h + .10。梁の下面をそこへ揃え、
      // 二センチ下へ突き出していた梁で格間・回縁を切らない。
      const roofH = h + SHITARAGAHARA_CEILING_LIFT;
      for (const z of beamZ) {
        timberBox(g, (hw - .08) * 2, .22, .12, 0, roofH + .09, z, 0x3a2a1c);
        // 内陣境の丸柱にも受け木を載せる。外周だけでは柱頭と梁の間に
        // 十センチの空洞が残る。固定格子・戸口と同じ柱割りを設営時だけ拾う。
        const supports = [-hw + .16, hw - .16];
        const support = x => {
          if (!supports.some(v => Math.abs(v - x) < .001)) supports.push(x);
        };
        for (const wall of layout.walls) {
          if (wall.guideOnly || !wall.paper || Math.abs(wall.az - z) > .001
              || Math.abs(wall.bz - z) > .001) continue;
          const len = Math.abs(wall.bx - wall.ax), center = (wall.ax + wall.bx) / 2;
          const bays = Math.max(1, Math.round(len / 1.8));
          const end = Math.abs(wall.ax) > Math.abs(wall.bx) ? -1 : 1;
          support(center + end * (len / 2 - .06));
          for (let i = 1; i < bays; i++) support(center - len / 2 + len * i / bays);
        }
        for (const portal of layout.portals || []) {
          if (Math.abs(portal.z - z) > .001) continue;
          let left = -Infinity, right = Infinity;
          for (const wall of layout.walls) {
            if (wall.guideOnly || !wall.paper || Math.abs(wall.az - z) > .001
                || Math.abs(wall.bz - z) > .001) continue;
            const a = Math.min(wall.ax, wall.bx), b = Math.max(wall.ax, wall.bx);
            if (b <= portal.x + .01) left = Math.max(left, b);
            if (a >= portal.x - .01) right = Math.min(right, a);
          }
          if (Number.isFinite(left) && Number.isFinite(right)) {
            support(left - .06); support(right + .06);
          }
        }
        // 柱頭から梁下面までをつなぎ、既存の木材の束へまとめる。
        for (const x of supports)
          timberBox(g, .16, .1, .12, x, h + .05, z, 0x3a2a1c);
      }
      // 受け木の下端を梁の上端へ揃える。天井板を貫く厚い角材にせず、
      // 内陣・外陣の格縁を同じ架構へ吊る。木口は前後の梁の内側に収める。
      // 室内の格天井と同じ柱内面・格割りから受け木の位置を決める。
      // 吊り木を格間の薄板へ付けず、奥行き方向に通る格縁の上へ留める。
      const ceilingWidth = hw * 2 - .32;
      const ceilingBays = Math.max(2, Math.round(ceilingWidth / .75));
      const supportX = ceilingWidth * (Math.max(1, Math.round(ceilingBays / 2 + 1)) / ceilingBays - .5);
      // 吊り木の下端も格縁へ添えて留める。上端に触れるだけの木口では吊れない。
      // 格縁の側面へ二十五ミリ掛け、釘と添え木は格縁の下面より上へ収める推定の継手。
      // 長短の吊り木で共用し、既存の木材・金属と静止した内装の束へまとめる。
      const hangerFoot = (x, z) => {
        const side = x < 0 ? -1 : 1;
        timberBox(g, .04, .06, .04, x + side * .035, h + .005, z, 0x493022);
        for (const yy of [h - .0125, h + .02]) {
          box(g, .08, .006, .006, x + side * .02, yy, z, 0x39362e);
          box(g, .006, .014, .014, x + side * .058, yy, z, 0x39362e);
        }
      };
      for (const x of [-supportX, supportX]) {
        timberBox(g, .1, .1, pillarZ * 2 + .08, x, roofH + .25, 0, 0x3a2a1c);
        for (const room of rs) {
          // 中央一本だけでは長い格縁の端寄りを吊れない。
          // 回縁の内側を四尺ほど以下に割り、内陣・外陣それぞれで
          // 受け木から格縁へ吊る推定の納まり。境の回縁には重ねない。
          const back = room.z0 + .2, front = room.z1 - .2;
          if (front <= back) continue;
          const count = Math.max(1, Math.ceil((front - back) / 1.2));
          // 下端は格縁の上端、上端は受け木へ六センチ差し込み、横から釘で留める推定の納まり。
          // 木口を受け木の下面へ触れさせるだけでは天井を吊れない。
          for (let i = 0; i < count; i++) {
            const z = back + (front - back) * (i + .5) / count;
            timberBox(g, .04, .26 + SHITARAGAHARA_CEILING_LIFT, .04,
              x, h + .13 + SHITARAGAHARA_CEILING_LIFT / 2, z, 0x493022);
            hangerFoot(x, z);
            box(g, .12, .008, .008, x, roofH + .235, z, 0x39362e);
            for (const side of [-1, 1])
              box(g, .006, .016, .016, x + side * .053, roofH + .235, z, 0x39362e);
          }
        }
      }
      // 二列の吊り木だけへ格天井を預けず、直交する野縁で各列の格縁も受ける推定の納まり。
      // 野縁は裏板の上、受け木の下へ納める。既存の吊り木の脇で木口を止め、
      // 同じ高さの材を重ねない。追加の吊り木も格縁の上端まで届かせる。
      // 箱と材質を共有し、近づいて内装を作る時だけ既存の静止した束へまとめる。
      for (const room of rs) {
        const back = room.z0 + .2, front = room.z1 - .2;
        if (front <= back) continue;
        const count = Math.max(1, Math.ceil((front - back) / 1.2));
        const ends = [-hw + .16, -supportX - .02, -supportX + .02,
          supportX - .02, supportX + .02, hw - .16];
        for (let i = 0; i < count; i++) {
          const z = back + (front - back) * (i + .5) / count;
          for (let j = 0; j < ends.length; j += 2)
            if (ends[j + 1] > ends[j]) timberBox(g, ends[j + 1] - ends[j], .06, .06,
              (ends[j] + ends[j + 1]) / 2, roofH + .17, z, 0x3a2a1c);
          for (let j = 1; j < ceilingBays; j++) {
            const x = ceilingWidth * (j / ceilingBays - .5);
            if (Math.abs(Math.abs(x) - supportX) < .01) continue;
            // 直交する野縁にも吊り木を差して留める。下端は格縁に揃え、天井下へ釘を出さない。
            timberBox(g, .04, .19 + SHITARAGAHARA_CEILING_LIFT, .04,
              x, h + .095 + SHITARAGAHARA_CEILING_LIFT / 2, z, 0x493022);
            hangerFoot(x, z);
            box(g, .008, .008, .08, x, roofH + .17, z, 0x39362e);
            for (const side of [-1, 1])
              box(g, .016, .016, .006, x, roofH + .17, z + side * .033, 0x39362e);
          }
        }
      }
      const altar = layout.props.find(p => p.part === 'altar');
      if (altar) {
        const rot = altar.rot || 0, c = Math.cos(rot), sn = Math.sin(rot);
        // 天蓋の吊り梁は二本の受け木の上へ架け、両端を五センチ掛ける。
        // 格天井の中へ全幅の梁を埋めると、前後の梁・吊り木と交差し、
        // 吊り棒も薄い裏板の高さで終わる。受け木から本尊の上まで荷重をつなぐ。
        for (const localZ of [-.3, .14]) {
          const z = altar.z + localZ * altar.d * c;
          const x = altar.x + localZ * altar.d * sn;
          const half = Math.max(supportX + .05, Math.abs(x) + .6 * altar.w / 2.1 + .03);
          timberBox(g, half * 2, .14, .1, 0, roofH + .37, z, 0x3a2a1c);
        }
      }
    }
  }
  if (kb && kb.n) g.add(kb.build({ basic: true, tint: .8, shadow: false, camBlock: false }));
  const mesh = batchInterior(g);
  if (dim) shadeNight(mesh);
  layoutDecor.set(key, mesh);
  const copy = mesh.clone(); cacheUsers.push(new WeakRef(copy)); return copy;
}

export function furnishLayout(layout, h = 2.7, { partitions = true, dim = false } = {}) {
  if (layout.profile === 'shitaragahara' && S.quality === 'high') return villageFurnishLayout(layout, h, { partitions, dim });
  if (layout.profile !== 'moribe') return mainFurnishLayout(layout, h, { partitions, dim });
  
  // 今の山岳戦と前の比叡山で調度を共有。出入り案内が使う型の名前は変えない。
  const hiei = layout.profile === 'hiei' || layout.profile === 'hieizan';
  const village = S.quality === 'high' && layout.profile === 'shitaragahara';
  const villageHome = village && layout.kind === 'minka';
  const hieiSobo = layout.profile === 'hieizan' && layout.kind === 'sobo';
  const hieiKuri = layout.profile === 'hieizan' && layout.kind === 'kuri';
  const hieiTatami = hieiSobo || hieiKuri;
  const templeAltar = hiei || layout.profile === 'echizen_ikko' || layout.profile === 'iwamura_hondo' || ['takato', 'moribe'].includes(layout.profile) && layout.kind === 'hondo';
  const japanese = !!layout.profile && cgtOn() && cgtHas('naibu_tatami_floor_modular_a');
  const purchased = cgtOn() && cgtHas('Floor_Tatami') && !cgtHas('tatami_floor_modular_a');
  // 森部は素材の読み込みによらず、八寸ほどの板と根太上の継ぎ目を残す。
  // 購入床の二メートル単位の区切りでは、naka.js の目地と板割りが食い違う。
  const inabaHigh = false;
  const moribeBoards = layout.profile === 'moribe';
  const key = JSON.stringify([layout, h, partitions, dim, purchased, japanese, cgtOn() && cgtHas('tatami_floor_modular_a'), moribeBoards]);
  if (layoutDecor.has(key)) { const copy = layoutDecor.get(key).clone(); cacheUsers.push(new WeakRef(copy)); return copy; }
  const g = new THREE.Group(), kb = purchased || japanese ? new KitBatch() : null;
  for (const p of layout.props) {
    const part = new THREE.Group();
    const moribeStorage = layout.profile === 'moribe' && layout.kind === 'yashiki' && p.part === 'storage';
    // 神宮寺の堂は家庭用の仏壇へ替えず、下の須弥壇・本尊・灯明を使う。
    const kit = p.part === 'stove' ? bought('furnace_complete', p.w, p.h, p.d) : p.part === 'storage' && !moribeStorage ? bought('drawer_a', p.w, p.h, p.d) : p.part === 'altar' && !templeAltar ? bought('butsudan', p.w, p.h, p.d) : null;
    if (kit) part.add(kit);
    else if (p.part === 'riceBales') {
      // 既存の藁俵を室内の束へまとめる。外用の無限高の当たりは作らない。
      const rice = tawara({ heightAt: () => 0 }, 0, 0, 0,
        inabaHigh && layout.kind === 'kura' ? p.bales ?? 3 : 3, { solid: false });
      if (inabaHigh && layout.kind === 'kura') {
        // 兵糧の推定の納め方。板床へ俵を直置きせず、二本の敷木と横板で受ける。
        // 縄の下端も含む実寸で敷木へ載せ、床への埋まりと当たりからのはみ出しを防ぐ。
        // 同寸の箱・木目・材質を共有し、設営時に室内の束へまとめる。
        const baseH = .08;
        for (const x of [-p.w * .28, p.w * .28])
          box(part, .09, .05, p.d, x, .025, 0, 0x493522, 'inabaBoard');
        for (const z of [-p.d / 3, 0, p.d / 3]) {
          const board = box(part, .03, p.w, .22, 0, .065, z, 0x604831, 'inabaBoard');
          board.rotation.z = Math.PI / 2;
        }
        rice.geometry.computeBoundingBox();
        const bounds = rice.geometry.boundingBox;
        rice.scale.set(p.w / (bounds.max.x - bounds.min.x),
          (p.h - baseH) / (bounds.max.y - bounds.min.y), p.d / (bounds.max.z - bounds.min.z));
        rice.position.set(-(bounds.min.x + bounds.max.x) * rice.scale.x / 2,
          baseH - bounds.min.y * rice.scale.y, -(bounds.min.z + bounds.max.z) * rice.scale.z / 2);
      } else rice.scale.set(p.w / .75, p.h / .54, p.d / 1.64);
      part.add(rice);
    }
    else if (p.part === 'alcove') {
      if (inabaHigh) {
        // 稲葉山の主殿・山麓館の床の間。床柱・床框・落し掛けで囲い、
        // 掛物だけを壁へ貼った形にしない。全て調度の当たりの内側へ納める。
        // 全体を縦に縮めず、柱・壁の長さと上部の位置だけを天井高へ合わせる。
        // 床框の厚み、花入と掛物の形は保つ。
        const alcoveH = Math.min(p.h, h - (p.y || 0) - .045);
        // 土台の前端を床框の背面で止め、同じ面を二重に描かない。
        // 床框と落し掛けも床柱の内面へ突き付け、柱の表を横木で覆わない。
        // 外寸・床板の高さ・調度の当たりは保ち、既存の箱と材質を共有する。
        const betweenPosts = 2.06;
        box(part, 2.3, .18, .73, 0, .09, -.06, 0x604831);
        // 床の間も座敷と同じ塗り壁で納め、背面・袖壁・落し掛け上の
        // 小壁だけ単色にしない。既存の土壁の絵と材質を共有する。
        box(part, 2.3, alcoveH, .06, 0, alcoveH / 2, -.395, 0xcfc3a2, 'inabaPlaster');
        for (const x of [-1.09, 1.09]) {
          box(part, .12, alcoveH, .12, x, alcoveH / 2, .365, 0x493522, 'inabaBoard');
          box(part, .06, alcoveH, .73, x, alcoveH / 2, -.06, 0xcfc3a2, 'inabaPlaster');
        }
        // 床板・小天井・横木は長手へ木目を通す。縦の床柱と同じ絵を
        // 九十度回して共有し、板の枚数・室内の束・当たりは増やさない。
        const crossGrain = (w, h, d, y, z, color) => {
          const board = box(part, h, w, d, 0, y, z, color, 'inabaBoard');
          board.rotation.z = Math.PI / 2;
        };
        crossGrain(betweenPosts, .14, .12, .14, .365, 0x493522);  // 床框
        crossGrain(betweenPosts, .12, .12, alcoveH - .4, .365, 0x493522);  // 落し掛け
        box(part, 2.3, .34, .06, 0, alcoveH - .17, .365, 0xcfc3a2, 'inabaPlaster');
        // 床の間の内側も板敷きと小天井で納める推定。床柱の間で板を割り、
        // 床框・掛物・落し掛けに継ぎ目を重ねない。既存の束へ設営時だけまとめる。
        const innerW = betweenPosts, innerD = .67, innerZ = -.06;
        for (let j = 0; j < 3; j++) {
          const z = innerZ - innerD / 2 + (j + .5) * innerD / 3;
          crossGrain(innerW, .008, innerD / 3 - .004, .181, z,
            j % 2 ? 0x6a5038 : 0x72573d);
          crossGrain(innerW, .012, innerD / 3 - .004, alcoveH - .03, z,
            j % 2 ? 0x756046 : 0x80694d);
        }
        // 小天井の回縁も長手へ木目を通す。前後の材を通し、左右の材は
        // その内側へ突き付けて、四隅で同じ面を重ねない推定の納まり。
        // 板を受ける幅・天井高・床柱と、既存の木部の束は保つ。
        const trimW = .035, trimY = alcoveH - .05;
        for (const z of [innerZ - innerD / 2, innerZ + innerD / 2])
          crossGrain(innerW + trimW, trimW, trimW, trimY, z, 0x493522);
        for (const x of [-innerW / 2, innerW / 2]) {
          const trim = box(part, trimW, innerD - trimW, trimW,
            x, trimY, innerZ, 0x493522, 'inabaBoard');
          trim.rotation.x = Math.PI / 2;
        }
        // 主殿・山麓館の床飾りは推定。掛物の脇に薄板と素朴な花入を据え、
        // 花は少ない枝葉で表す。床板の上・床柱の内側へ収め、通路へ出さない。
        // 丸い供具と同じ形の箱・材質を共有し、設営時に既存の室内の束へまとめる。
        const vaseX = -.65, vaseZ = -.06, boardTop = .197;
        box(part, .36, .012, .28, vaseX, boardTop - .006, vaseZ, 0x493522, 'inabaBoard');
        roundVessel(part, .075, .055, .12, vaseX, boardTop + .06, vaseZ, 0x675343);
        roundVessel(part, .035, .075, .08, vaseX, boardTop + .16, vaseZ, 0x675343);
        roundVessel(part, .035, .035, .08, vaseX, boardTop + .24, vaseZ, 0x675343);
        // 口を土色の円盤で塞がず、縁と暗い内側を胴の上端へ納める。
        roundVessel(part, .041, .035, .012, vaseX, boardTop + .28, vaseZ, 0x675343);
        roundVessel(part, .029, .029, .002, vaseX, boardTop + .287, vaseZ, 0x211b15);
        const stem = box(part, .009, .38, .009, vaseX + .03, boardTop + .45, vaseZ, 0x59412b);
        stem.rotation.z = -.16;
        const twig = box(part, .008, .19, .008, vaseX - .02, boardTop + .47, vaseZ, 0x59412b);
        twig.rotation.z = .55;
        for (const [x, yy, angle] of [[.07, .58, -.7], [-.07, .54, .7], [.035, .48, -.9]]) {
          const leaf = box(part, .065, .018, .025, vaseX + x, boardTop + yy, vaseZ, 0x596044);
          leaf.rotation.z = angle;
        }
        // 掛物は縦横比を保ち、吊り紐まで落し掛けの下へ収める。
        const scrollTop = Math.min(1.9, alcoveH - .56), scrollBottom = scrollTop - 1.25;
        const scroll = bought('wall_scroll', .55, 1.25, .035);
        if (scroll) place(part, scroll, 0, -.35, 0, scrollBottom);
        else {
          box(part, .55, 1.25, .012, 0, scrollBottom + .625, -.35, 0xffffff, 'scroll');
          // 軸木・八双・吊り紐を表装の寸法へ揃え、襖の黒縁で囲まない。
          box(part, .61, .025, .025, 0, scrollBottom, -.35, 0x493522);
          box(part, .55, .016, .018, 0, scrollTop, -.35, 0x493522);
          // 掛物の紐を空中で途切れさせず、背壁へ打った折釘で受ける推定の納まり。
          // 八双の左右から中央の支点までつなぎ、釘の根元は塗り壁へ差し込む。
          // 落し掛けの下と既存の床の間の外寸に納め、箱と鉄色を使い回す。
          const cordRise = .06, cordHalf = .12;
          const cordLength = Math.hypot(cordHalf, cordRise);
          for (const side of [-1, 1]) {
            const cord = box(part, cordLength, .006, .006,
              side * cordHalf / 2, scrollTop + cordRise / 2, -.35, 0x6a5038);
            cord.rotation.z = -side * Math.atan2(cordRise, cordHalf);
          }
          box(part, .009, .009, .026, 0, scrollTop + cordRise, -.36, 0x252321);
          box(part, .009, .018, .009, 0, scrollTop + cordRise + .005, -.347, 0x252321);
        }
      } else if (japanese && addNaibu(kb, 'wall_scroll', p.x, (p.y || 0) + .8, p.z - .35 * Math.cos(p.rot || 0), .55, 1.25, .04, p.rot || 0)) {
        box(part, 2.3, .18, .85, 0, .09, 0, 0x604831);
        box(part, 2.3, 2.5, .08, 0, 1.25, -.43, 0xcfc3a2);
      } else part.add(tokonoma(2.3));
    }
    else if (p.part === 'chest') {
      const sutraBundle = inabaHigh && layout.kind === 'hondo';
      // 経箱の上の包みも登録済みの高さへ含め、内陣の当たりを広げない。
      const w = p.w ?? .85, h = (p.h ?? .7) - (sutraBundle ? .08 : 0), d = p.d ?? .7;
      // 主殿・館・遠侍・板倉・長屋と本堂の経箱はここで作る。後段に置くと共通の収納に先に拾われ、
      // 脚・箱底・被せ蓋・手掛けのある専用の作りへ到達しない。
      if (inabaHigh && ['goten', 'tamari', 'kura', 'nagaya', 'hondo'].includes(layout.kind)) {
        // 主殿・山麓館も引き出しの収納にせず、遠侍と同じ長持を据える推定。
        // 蓋箱は帯を貼った一塊で済ませず、脚・箱身・被せ蓋を
        // 分ける推定の納まり。既存の外寸と当たりの内側で組み、戸の通り道を保つ。
        const footH = Math.min(.08, h * .16);
        const lidH = Math.min(.055, h * .12), bottom = footH + .025;
        // 蓋箱の板目を面ごとに通す。無地の箱へ筋だけを足さず、
        // 身は縦板、底・蓋・底桟は長手の板目で組む推定のしつらえ。
        // 外寸内の既存の箱形と木目を使い、設営時の室内の束へまとめる。
        const crossBoard = (width, height, depth, x, y, z, alongX = true) => {
          const board = box(part, alongX ? height : width, alongX ? width : depth,
            alongX ? depth : height, x, y, z, 0x604831, 'inabaBoard');
          if (alongX) board.rotation.z = Math.PI / 2;
          else board.rotation.x = Math.PI / 2;
        };
        for (const x of [-w * .32, w * .32])
          crossBoard(.065, footH, d - .06, x, footH / 2, 0, false);
        crossBoard(w - .04, .025, d - .04, 0, footH + .0125, 0);
        const bodyH = h - lidH - bottom - .006;
        box(part, w - .04, bodyH, d - .04, 0, bottom + bodyH / 2, 0, 0x493522);
        for (const side of [-1, 1]) {
          const frontN = Math.max(2, Math.ceil((w - .04) / .24));
          const sideN = Math.max(2, Math.ceil((d - .06) / .24));
          for (let j = 0; j < frontN; j++)
            box(part, (w - .04) / frontN - .003, bodyH, .008,
              -(w - .04) / 2 + (j + .5) * (w - .04) / frontN,
              bottom + bodyH / 2, side * (d / 2 - .016), 0x604831, 'inabaBoard');
          for (let j = 0; j < sideN; j++)
            box(part, .008, bodyH, (d - .06) / sideN - .003,
              side * (w / 2 - .016), bottom + bodyH / 2,
              -(d - .06) / 2 + (j + .5) * (d - .06) / sideN, 0x604831, 'inabaBoard');
        }
        // 蓋下の暗い継ぎ目と、端板・側板の木口。箱の外へ金具を突き出さない。
        box(part, w - .025, .006, d - .025, 0, h - lidH - .003, 0, 0x211b15);
        crossBoard(w, lidH, d, 0, h - lidH / 2, 0);
        if (layout.kind === 'nagaya') {
          // 長屋の私物箱は推定の板組み。蓋の継ぎ目と反り止めの桟を付け、
          // 蓋裏の桟は箱身の内側へ納める。寝所・戸の引き先へは広げない。
          // 共通の箱・材質を設営時の束へ足し、開閉や毎コマの処理は増やさない。
          for (const z of [-d / 6, d / 6])
            box(part, w - .04, .002, .003, 0, h - .001, z, 0x493522);
          for (const x of [-w * .32, w * .32])
            box(part, .035, .025, d - .08, x, h - lidH - .0125, 0, 0x493522);
        }
        for (const x of [-w / 2 + .035, w / 2 - .035])
          for (const z of [-d / 2 + .017, d / 2 - .017])
            box(part, .025, bodyH, .008, x, bottom + bodyH / 2, z, 0x493522);
        // 手掛けは側板の表へ揃え、追加した板の内側へ埋めない。
        for (const x of [-w / 2 + .011, w / 2 - .011])
          box(part, .002, .025, Math.min(.12, d * .3), x, h * .65, 0, 0x211b15);
        if (sutraBundle) {
          // 本堂の収納を住居の長持だけで済ませず、経典を布で包んだ推定のしつらえ。
          // 蓋の上の薄板に載せ、折り返しと留め紐を外寸内へ納める。
          // 共通の箱・布色・木目を使い、設営時に既存の室内の束へまとめる。
          const bw = w * .72, bd = d * .68;
          crossBoard(bw + .025, .008, bd + .025, 0, h + .004, 0);
          box(part, bw, .05, bd, 0, h + .033, 0, 0x81735a);
          box(part, bw - .018, .004, bd * .55, 0, h + .06, bd * .18, 0x74664e);
          for (const x of [-bw * .28, bw * .28]) {
            box(part, .012, .004, bd, x, h + .064, 0, 0x5d523e);
            for (const side of [-1, 1])
              box(part, .012, .054, .004, x, h + .035, side * (bd / 2 - .002), 0x5d523e);
            box(part, .025, .008, .018, x, h + .07, .025, 0x5d523e);
          }
        }
      } else if (inabaHigh) {
        // 主殿・山麓館の蓋箱も、後段の到達しない分岐へ置かずここで作る。
        // 底桟・身・被せ蓋と鉄の金具を推定し、既存の木目と箱形を共有する。
        // 取っ手まで当たりの内側へ収め、縁側の障子の引き先を空ける。
        const wood = 'inabaBoard', iron = 0x252321;
        const lidH = Math.min(.07, h * .14), bottom = .04, lidY = h - lidH;
        for (const x of [-w * .32, w * .32])
          box(part, .06, bottom, d - .04, x, bottom / 2, 0, 0x3a2a1c, wood);
        box(part, w - .02, lidY - bottom - .004, d - .02,
          0, (bottom + lidY - .004) / 2, 0, 0x503923, wood);
        // 蓋の合わせ目には暗い内蓋を残し、中まで透ける隙間にしない。
        box(part, w - .04, .008, d - .04, 0, lidY, 0, 0x2e2218);
        box(part, w - .008, lidH, d - .008, 0, h - lidH / 2, 0, 0x604831, wood);
        for (const x of [-w * .32, w * .32]) {
          box(part, .025, .003, d - .012, x, h - .0015, 0, iron);
          for (const side of [-1, 1]) {
            const z = side * (d / 2 - .003);
            box(part, .025, h - bottom - .012, .006,
              x, (h + bottom) / 2 - .006, z, iron);
            for (const y of [bottom + .04, h - .025])
              box(part, .009, .009, .002, x, y, side * (d / 2 - .001), 0x494740);
          }
        }
        // 正面の掛金。両脇の持ち手は板へ埋めず、座金と下がった輪で納める。
        box(part, .035, .1, .006, 0, lidY - .02, d / 2 - .003, iron);
        for (const side of [-1, 1]) {
          const x = side * (w / 2 - .003), y = h * .55;
          for (const z of [-d * .12, d * .12]) {
            box(part, .006, .035, .035, x, y, z, iron);
            box(part, .006, .055, .012, x, y - .025, z, iron);
          }
          box(part, .006, .012, d * .24 + .012, x, y - .0525, 0, iron);
        }

      } else {
        if (japanese && addNaibu(kb, 'drawer_a', p.x, p.y || 0, p.z, w, h, d, p.rot || 0)) continue;
        box(part, w, h, d, 0, h / 2, 0, 0x503923);
        for (const yy of [.23, .48]) box(part, w - .06, .02, .03, 0, yy, d / 2, 0x252321);
      }
    }
    else if (p.part === 'documentShelf' && inabaHigh) {
      // 主殿・山麓館の文書棚。素木の柱・貫・棚板で組む推定のしつらえ。
      // 共通の箱と木目を共有し、文書も棚の外寸内へ納めて室内の束にまとめる。
      const post = .04, shelf = .025;
      for (const x of [-(p.w - post) / 2, (p.w - post) / 2]) {
        for (const z of [-(p.d - post) / 2, (p.d - post) / 2])
          doorTimber(part, post, p.h, post, x, p.h / 2, z, 0x795b3b, true);
        doorTimber(part, post, .055, p.d - post * 2,
          x, .12, 0, 0x604831, true);
      }
      for (const y of [.18, .6, p.h - shelf / 2]) {
        doorTimber(part, p.w - post * 2, shelf, p.d,
          0, y, 0, 0x795b3b, true);
        // 棚板を背面の貫だけで受けず、前後の桟と左右の受け桟を四本の柱へ納める推定。
        // 桟の上端は棚板の下面へ合わせ、文書の置き場と棚の外寸は保つ。
        // 左右の桟は長手へ木目を回し、既存の箱・材質と室内の束を使い回す。
        for (const z of [-(p.d - post) / 2, (p.d - post) / 2])
          doorTimber(part, p.w - post * 2, .055, post,
            0, y - .04, z, 0x604831, true);
        for (const x of [-(p.w - post) / 2, (p.w - post) / 2]) {
          const rail = doorTimber(part, p.d - post * 2, .055, post,
            x, y - .04, 0, 0x604831, true);
          rail.rotation.y = Math.PI / 2;
        }
      }
      // 文書は文字を描かず、包紙と結び紐で表す。棚の前へ張り出さない。
      for (const y of [.18, .6]) for (const side of [-1, 1]) {
        const x = side * p.w * .23, base = y + shelf / 2;
        box(part, p.w * .34, .065, p.d * .65,
          x, base + .0325, 0, 0xb9ac8c);
        box(part, .012, .003, p.d * .65,
          x, base + .0665, 0, 0x65563e);
      }
    }
    else if (p.part === 'spearRack') {
      // 短槍を立て掛ける台。足・受け桟・柄・穂先を共通の箱で組み、設営時に束へまとめる。
      // 上げ床と梁下の余白を取り、穂先を天井へ突き抜けさせない。
      const height = Math.min(p.h, h - (p.y || 0) - .28);
      for (const x of [-p.w * .4, p.w * .4]) {
        const foot = doorTimber(part, .065, .08, p.d, x, .04, 0, 0x3a2a1c, inabaHigh);
        if (inabaHigh) {
          // 足の長手にも木目を通し、柱の木口だけで台を支えない納まりにする。
          foot.geometry = shape(.065, p.d, .08); foot.rotation.x = Math.PI / 2;
        }
        doorTimber(part, .055, height * .65, .055, x, height * .325, -.08, 0x604831, inabaHigh);
        if (inabaHigh) {
          // 番所・長屋・遠侍の槍掛けは、足へ支柱を立てるだけにせず控えで受ける推定。
          // 足の前端と支柱をつなぎ、槍を受ける横桟の下へ納める。
          // 台の外寸内で共通の角材・板目を使い、通路の当たりや毎コマの処理は増やさない。
          const footZ = p.d / 2 - .04, postZ = -.06;
          const bottom = .08, top = height * .22;
          const rise = top - bottom, run = postZ - footZ;
          const brace = doorTimber(part, .035, Math.hypot(rise, run), .035,
            x, (bottom + top) / 2, (footZ + postZ) / 2, 0x604831, true);
          brace.rotation.x = Math.atan2(run, rise);
        }
      }
      for (const yy of [.14, height * .6])
        doorTimber(part, p.w, .065, .08, 0, yy, -.04, 0x493522, inabaHigh);
      for (const x of [-p.w * .25, 0, p.w * .25]) {
        if (inabaHigh) {
          // 番所・長屋の槍掛けは柄を横桟の前に浮かせず、切欠きの受けへ納める推定。
          // 左右の爪で柄を挟み、下の枕で石突を受ける。元の台の外寸へ収め、
          // 共通の箱と材質を設営時の束へ足す。槍の高さと通路の当たりは保つ。
          for (const side of [-1, 1])
            box(part, .018, .045, .12, x + side * .024,
              height * .6, .02, 0x493522);
          box(part, .066, .03, .07, x, .065, .035, 0x493522);
        }
        if (inabaHigh) {
          // 室内の武具を四角い棒と傾いた金属片で済ませず、丸い柄と鎬のある穂へ。
          // 同じ台の外寸・梁下へ収め、形は三本と各建物で共有する推定のしつらえ。
          roundVessel(part, .0125, .0125, height - .24,
            x, (height - .24) / 2 + .08, .035, 0x604831);
          roundVessel(part, .02, .02, .08, x, height - .2, .035, 0x252321);
          const key = '稲葉山の武具掛けの槍穂';
          if (!shapes.has(key)) shapes.set(key,
            new THREE.ConeGeometry(1, 1, 4).rotateY(Math.PI / 4));
          const blade = new THREE.Mesh(shapes.get(key), mat(0x9a9a9e));
          cacheUsers.push(new WeakRef(blade));
          blade.scale.set(.045 / Math.SQRT2, .16, .016 / Math.SQRT2);
          blade.position.set(x, height - .08, .035); part.add(blade);
        } else {
          box(part, .025, height - .24, .025, x, (height - .24) / 2 + .08, .035, 0x604831);
          box(part, .04, .08, .04, x, height - .2, .035, 0x252321);
          const blade = box(part, .045, .16, .016, x, height - .08, .035, 0x9a9a9e);
          blade.rotation.z = Math.PI / 12;
        }
      }
    }
    else if (p.part === 'hearth') {
      if (japanese && addNaibu(kb, 'furnace', p.x, 0, p.z, p.w, .18, p.d)) {
        addNaibu(kb, 'kettle_low', p.x, .18, p.z, .35, .25, .35);
      } else {
        box(part, p.w, .12, p.d, 0, .06, 0, 0x493022);
        box(part, p.w - .18, .025, p.d - .18, 0, .13, 0, 0x211b17);
        box(part, .35, .25, .35, 0, .3, 0, 0x292723);
      }
      place(part, lightPool(), 0, 0, 0, .2);
    }
    else if (p.part === 'ammo' && layout.profile === 'yagura' && japanese && addNaibu(kb, 'drawer_a', p.x, p.y || 0, p.z, p.w ?? .85, p.h ?? .55, p.d ?? .7)) {
      // 矢の束と弾の箱。棚の上の矢は軽い共通の形。
      for (let q = 0; q < 5; q++) box(part, .018, .02, (p.d ?? .7) - .05, (q - 2) * .07, (p.h ?? .55) + .04, 0, 0x9b8057);
    }
    else if (p.part === 'bedding') {
      if (inabaHigh) {
      if (inabaHigh && layout.kind === 'nagaya') {
        // 長屋の寝所は薄い敷物と木枕の推定復元。厚い一枚板や現代の枕に見せない。
        // 藺草の絵・箱・材質を共有し、既存の寝具の範囲と高さの中へ納める。
        // 無地の帯を表へ重ねず、番所・本堂と同じ薄縁で布縁と草の木口を納める。
        inabaUsuberi(part, p.w, p.d, 0, 0, 0);
        const headZ = -p.d / 2 + .15;
        // 木枕の脚は薄縁の表から天板裏まで通し、浮いた角材にしない。
        // 天板は横目、脚は縦目にして、既存の木部の絵と束を共有する。
        const matTop = .01, pillowBottom = .0875;
        doorTimber(part, p.w * .44, .025, .16, 0, .1, headZ, 0x6a5038, true);
        for (const x of [-p.w * .15, p.w * .15])
          box(part, .035, pillowBottom - matTop, .14,
            x, (matTop + pillowBottom) / 2, headZ, 0x493522, 'inabaBoard');
        // 足元に畳んだ掛け布を添える推定の寝支度。敷物・木枕と別の布として
        // 折り返しと縫い端を見せ、既存の寝具の外寸・高さへ納める。
        // 共通の箱と材質を室内の束へまとめ、通路や毎コマの処理は増やさない。
        const clothW = p.w - .12, clothD = Math.min(.42, p.d * .3);
        const footZ = p.d / 2 - clothD / 2 - .07;
        // 掛け布の下面を薄縁へ載せ、折った層と縫い端も隙間なく重ねる。
        // 寝具の外寸・当たりを保ち、箱の枚数や毎コマの処理は増やさない。
        const layerH = .014, clothTop = matTop + layerH * 3;
        for (let j = 0; j < 3; j++)
          box(part, clothW - j * .012, layerH, clothD - j * .016,
            0, matTop + (j + .5) * layerH, footZ + j * .008,
            j % 2 ? 0x74664e : 0x81735a);
        for (const x of [-clothW / 2 + .025, clothW / 2 - .025])
          box(part, .012, .004, clothD - .04, x, clothTop + .002, footZ + .016, 0x5d523e);
        box(part, clothW - .06, .004, .012, 0, clothTop + .002,
          footZ - clothD / 2 + .04, 0x5d523e);
      } else {
        box(part, p.w, .06, p.d, 0, .03, 0, 0x958669);
        box(part, p.w * .8, .12, .22, 0, .09, -p.d / 2 + .15, 0x6a5e48);
      }
    
      } else {
      box(part, p.w, .06, p.d, 0, .03, 0, 0x958669);
      box(part, p.w * .8, .12, .22, 0, .09, -p.d / 2 + .15, 0x6a5e48);
    
      }
    }
    else if (p.part === 'offering') {
      {
        box(part, p.w, .08, p.d, 0, p.h - .04, 0, 0x785b3c);
        for (const x of [-.4, .4]) box(part, .07, p.h, .07, x, p.h / 2, 0, 0x59412b);
        box(part, .18, .18, .18, 0, p.h + .09, 0, 0xd8d0bd);
      }
    }
    else if (p.part === 'desk') {
      if (layout.profile === 'moribe' && layout.kind === 'yashiki') part.add(tsukue(true));
      else if (hieiSobo) {
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
        hieiScroll(part, bayW - t, radius, x, y, 0, 0, true);
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
    else if (p.part === 'waterJar' && villageHome) {
      // 水甕は底・胴・口縁・内壁を一続きにし、水面を口より下へ納める。
      // 全戸で原形と材質を共用し、動かない調度の束へ一度だけまとめる。
      const jarKey = '民家の炊事の水甕', waterKey = '民家の水甕の水面';
      if (!shapes.has(jarKey)) shapes.set(jarKey, new THREE.LatheGeometry([
        new THREE.Vector2(0, 0), new THREE.Vector2(.12, 0),
        new THREE.Vector2(.18, .08), new THREE.Vector2(.22, .28),
        new THREE.Vector2(.21, .43), new THREE.Vector2(.175, .56),
        new THREE.Vector2(.19, .59), new THREE.Vector2(.19, .62),
        new THREE.Vector2(.165, .62), new THREE.Vector2(.15, .58),
        new THREE.Vector2(.185, .43), new THREE.Vector2(.195, .28),
        new THREE.Vector2(.155, .09), new THREE.Vector2(.1, .035),
        new THREE.Vector2(0, .035),
      ], 12));
      if (!shapes.has(waterKey)) shapes.set(waterKey, new THREE.CircleGeometry(.165, 12));
      const jar = new THREE.Mesh(shapes.get(jarKey), mat(0x62513e, 'earth'));
      const water = new THREE.Mesh(shapes.get(waterKey), mat(0x696f62));
      water.rotation.x = -Math.PI / 2; water.position.y = .5;
      for (const mesh of [jar, water]) { cacheUsers.push(new WeakRef(mesh)); part.add(mesh); }
      // 炊事の水を汲む木の柄杓を口へ渡す推定のしつらえ。
      // 椀は底と内壁を持ち、柄の下面を甕の口へ載せる。外寸からはみ出させない。
      // 全戸で原形・材質を共用し、水面と同じ静止した調度の束へまとめる。
      const scoopKey = '民家の水甕の柄杓の椀', handleKey = '民家の水甕の柄杓の柄';
      if (!shapes.has(scoopKey)) shapes.set(scoopKey, new THREE.LatheGeometry([
        new THREE.Vector2(0, -.045), new THREE.Vector2(.04, -.045),
        new THREE.Vector2(.055, -.03), new THREE.Vector2(.062, .008),
        new THREE.Vector2(.053, .008), new THREE.Vector2(.047, -.025),
        new THREE.Vector2(.033, -.035), new THREE.Vector2(0, -.035),
      ], 12));
      if (!shapes.has(handleKey)) shapes.set(handleKey,
        new THREE.CylinderGeometry(.007, .009, .245, 8));
      const scoop = new THREE.Mesh(shapes.get(scoopKey), mat(0x786044));
      scoop.position.set(-.1, .628, 0);
      const handle = new THREE.Mesh(shapes.get(handleKey), mat(0x786044));
      handle.rotation.z = -Math.PI / 2;
      handle.position.set(.0725, .628, 0);
      for (const mesh of [scoop, handle]) { cacheUsers.push(new WeakRef(mesh)); part.add(mesh); }
      part.scale.set(p.w / .44, p.h / .62, p.d / .44);
    }
    else if (p.part === 'stove') {
      if (villageHome) {
        // 土の竈は焚口を実際にくぼませ、外壁側へ背を向けて土間から薪を入れる。
        // 床の上の黒い四角と角釜ではなく、炉床・袖・上部を組み、丸い鉄釜を据える。
        box(part, .85, .1, .7, 0, .05, 0, 0x75634b);
        // 焚口のすぐ奥を土の塊で塞がず、釜底の下まで炉を通す。
        // 奥壁と左右の袖で同じ外寸を囲み、中央に薪と熱の通る空間を残す。
        // 奥壁の上部に煙道を残し、釜底から背面上部の煙抜きへつなぐ。
        // 炉を密閉せず、焚口や土間側へ煙の出口を向けない推定の造り。
        box(part, .85, .2, .1, 0, .2, -.3, 0x75634b);
        for (const side of [-1, 1])
          box(part, .365, .1, .1, side * .2425, .35, -.3, 0x75634b);
        for (const side of [-1, 1]) box(part, .25, .3, .6, side * .3, .25, .05, 0x75634b);
        // 釜口を丸く抜き、口縁で釜を受ける。炉内の釜底まで土で埋めない。
        // 穴付きの天端も全戸で同じ形・材質を使い、既存の調度の束へまとめる。
        const throatKey = '民家の竈の釜口';
        if (!shapes.has(throatKey)) {
          const top = new THREE.Shape();
          top.moveTo(-.425, -.35); top.lineTo(.425, -.35);
          top.lineTo(.425, .35); top.lineTo(-.425, .35); top.closePath();
          const hole = new THREE.Path();
          hole.absarc(0, 0, .25, 0, Math.PI * 2, true); top.holes.push(hole);
          // 釜口とは別に背面の煙道を抜く。下の奥壁の切り欠きと重ね、
          // 黒い面を貼るだけでなく、厚い土の天端を貫く口にする。
          // 回転後は奥行きが反転するため、正の側へ穴を描く。
          const flue = new THREE.Path();
          flue.moveTo(-.06, .27); flue.lineTo(-.06, .325);
          flue.lineTo(.06, .325); flue.lineTo(.06, .27); flue.closePath();
          top.holes.push(flue);
          const geo = new THREE.ExtrudeGeometry(top, { depth: .25, bevelEnabled: false, curveSegments: 12, steps: 1 });
          geo.rotateX(Math.PI / 2); shapes.set(throatKey, geo);
        }
        const throat = new THREE.Mesh(shapes.get(throatKey), mat(0x75634b));
        throat.position.y = .65; cacheUsers.push(new WeakRef(throat)); part.add(throat);
        // 炉内の煤も煙道の入口を塞がない形に分ける。
        box(part, .35, .2, .015, 0, .2, -.242, 0x221c17);
        for (const side of [-1, 1])
          box(part, .115, .1, .015, side * .1175, .35, -.242, 0x221c17);
        box(part, .35, .012, .6, 0, .106, .05, 0x514337);
        // 焚口の奥を空の黒い箱にせず、炉床の灰と釜へ差し入れた薪を納める。
        // 囲炉裏と薪の原形・材質を共用し、土間の通路へはみ出させない。
        box(part, .32, .012, .52, 0, .118, .05, 0x817563);
        const fuelKey = '民家の炉の薪';
        if (!shapes.has(fuelKey)) shapes.set(fuelKey, new THREE.CylinderGeometry(.023, .029, .26, 7));
        for (const x of [-.085, 0, .085]) {
          const fuel = new THREE.Mesh(shapes.get(fuelKey), mat(0x30221a));
          fuel.rotation.x = Math.PI / 2; fuel.position.set(x, .148, .12);
          cacheUsers.push(new WeakRef(fuel)); part.add(fuel);
          // 薪の奥の端だけ熾し、火の粒や追加の光源は作らない。
          box(part, .025, .012, .03, x, .17, -.005, 0x8e4928);
        }
        const potKey = '民家の竈の鉄釜', lidKey = '民家の竈の木蓋';
        // 半球一枚では釜口に厚みがなく、土の釜口へ掛かる部分もない。
        // 外底・羽・口縁・内底を一続きにし、羽の下面を竈の天端へ載せる推定の造り。
        // 蓋の下面まで口縁を立ち上げ、蓋の周りの隙間からも鉄の内壁が見えるようにする。
        // 全戸で同じ回転体を使い、動かない調度の束へ一度だけまとめる。
        if (!shapes.has(potKey)) shapes.set(potKey, new THREE.LatheGeometry([
          new THREE.Vector2(0, -.22), new THREE.Vector2(.1, -.2),
          new THREE.Vector2(.2, -.13), new THREE.Vector2(.245, -.035),
          new THREE.Vector2(.25, -.02), new THREE.Vector2(.3, -.02),
          new THREE.Vector2(.3, 0), new THREE.Vector2(.263, 0),
          new THREE.Vector2(.263, .0175), new THREE.Vector2(.238, .0175),
          new THREE.Vector2(.238, -.03), new THREE.Vector2(.19, -.12),
          new THREE.Vector2(.09, -.18), new THREE.Vector2(0, -.195),
        ], 12));
        if (!shapes.has(lidKey)) {
          // 木蓋は三枚の接ぎ板を円形に切り、上の二本の押さえ木でつなぐ推定の造り。
          // 二ミリの目地に板の木口を残す。外径・厚みは保ち、全戸で一つの原形を共有する。
          const radius = .245, joint = .002, boards = [];
          for (let i = 0; i < 3; i++) {
            const low = -radius + radius * 2 * i / 3 + (i ? joint / 2 : 0);
            const high = -radius + radius * 2 * (i + 1) / 3 - (i < 2 ? joint / 2 : 0);
            const a = Math.asin(low / radius), b = Math.asin(high / radius);
            const outline = new THREE.Shape();
            outline.moveTo(radius * Math.cos(a), low);
            outline.absarc(0, 0, radius, a, b, false);
            outline.lineTo(-radius * Math.cos(b), high);
            outline.absarc(0, 0, radius, Math.PI - b, Math.PI - a, false);
            outline.closePath();
            const board = new THREE.ExtrudeGeometry(outline,
              { depth: .035, bevelEnabled: false, curveSegments: 4, steps: 1 });
            board.rotateX(Math.PI / 2); board.translate(0, .0175, 0); boards.push(board);
          }
          shapes.set(lidKey, mergeGeometries(boards));
          for (const board of boards) board.dispose();
        }
        const pot = new THREE.Mesh(shapes.get(potKey), mat(0x292723));
        pot.position.y = .67;
        const lid = new THREE.Mesh(shapes.get(lidKey), mat(0x786044));
        lid.position.y = .705;
        for (const mesh of [pot, lid]) { cacheUsers.push(new WeakRef(mesh)); part.add(mesh); }
        for (const x of [-.12, .12]) box(part, .035, .035, .38, x, .74, 0, 0x59412b);
      } else {
        box(part, .85, .65, .7, 0, .325, 0, 0x75634b);
        box(part, .3, .25, .025, 0, .22, .36, 0x221c17);
        box(part, .42, .18, .42, 0, .72, 0, 0x292723);
      }
    } else if (p.part === 'altar') {
      const moribeAltar = layout.profile === 'moribe' && layout.kind === 'hondo';
      const altar = moribeAltar ? new THREE.Group() : part;
      if (moribeAltar) {
        // 小堂の須弥壇を奥へ納め、前卓は床から独立して立てる。
        altar.position.z = -.2; altar.scale.z = .9; part.add(altar);
      }
      // 須弥壇：下框・黒漆の腰（金の格狭間）・上框の三段に、蓮台の本尊と光背。前に小さな前卓と香炉
      if (moribeAltar) {
        // 須弥壇の上下框は平らな箱ではなく、段と反りのある繰形で推定復元。
        // 一つの断面を四周へ回し、上框は半回転して共用する。
        // 外寸・腰の高さ・灯明の載る上面は保ち、既存の漆の束へまとめる。
        const key = 'moribe:須弥壇:繰形';
        if (!shapes.has(key)) {
          const rings = [[0, 1.05, .5], [.18, 1.05, .5], [.18, 1.025, .475],
            [.32, 1.02, .47], [.58, .99, .44], [.8, .965, .425], [1, .965, .425]];
          const positions = [], indices = [];
          for (const [yy, x, z] of rings) {
            positions.push(-x, yy, -z, x, yy, -z, x, yy, z, -x, yy, z);
          }
          for (let i = 1; i < rings.length; i++) for (let j = 0; j < 4; j++) {
            const a = (i - 1) * 4 + j, b = (i - 1) * 4 + (j + 1) % 4;
            indices.push(a, a + 4, b, b, a + 4, b + 4);
          }
          const top = (rings.length - 1) * 4;
          indices.push(0, 1, 2, 0, 2, 3, top, top + 2, top + 1, top, top + 3, top + 2);
          const base = new THREE.BufferGeometry();
          base.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
          // 共用の箱と同じ属性をそろえ、漆の部品を一つの形へ結合できるようにする。
          base.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(positions.length / 3 * 2), 2));
          base.setIndex(indices);
          const geo = base.toNonIndexed(); geo.computeVertexNormals(); base.dispose();
          shapes.set(key, geo);
        }
        for (const upper of [false, true]) {
          const frame = new THREE.Mesh(shapes.get(key), mat(0x24170f));
          cacheUsers.push(new WeakRef(frame));
          frame.scale.y = upper ? .1 : .14;
          if (upper) { frame.rotation.x = Math.PI; frame.position.y = .54; }
          altar.add(frame);
        }
      } else box(altar, 2.1, .14, 1, 0, .07, 0, 0x24170f);
      box(altar, 1.85, .3, .82, 0, .29, 0, 0x2a1a12);
      if (moribeAltar) {
        // 格狭間を金色の四角い板だけで済ませず、曲線の透かしと奥の陰で推定復元。
        // 正面と左右で一つの形と材質を使い、須弥壇の腰へ納める。
        const key = 'moribe:sumidan:kouzama';
        if (!shapes.has(key)) {
          const outline = new THREE.Shape();
          outline.moveTo(-.2, -.09); outline.lineTo(.2, -.09);
          outline.lineTo(.2, .09); outline.lineTo(-.2, .09); outline.closePath();
          const hole = new THREE.Path();
          hole.moveTo(-.16, -.055); hole.lineTo(-.16, .005);
          hole.bezierCurveTo(-.13, .005, -.13, .055, -.08, .045);
          hole.bezierCurveTo(-.04, .035, -.025, .045, 0, .065);
          hole.bezierCurveTo(.025, .045, .04, .035, .08, .045);
          hole.bezierCurveTo(.13, .055, .13, .005, .16, .005);
          hole.lineTo(.16, -.055); hole.closePath();
          outline.holes.push(hole);
          shapes.set(key, new THREE.ExtrudeGeometry(outline, { depth: .012, bevelEnabled: false, curveSegments: 4 }));
        }
        for (const x of [-.55, 0, .55]) {
          box(altar, .4, .18, .006, x, .29, .414, 0x160f0b);
          const m = new THREE.Mesh(shapes.get(key), mat(0x8a6c30));
          cacheUsers.push(new WeakRef(m)); m.position.set(x, .29, .421); altar.add(m);
        }
        // 正面の三つの格狭間も框と束で区切る推定復元。
        // 側面だけにあった受け木を正面へ巡らせ、透かしを腰の平板へ貼っただけにしない。
        // 開口の外へ納め、既存の箱・漆の材質を共用して室内の束へまとめる。
        const frontPosts = [-.79, -.275, .275, .79];
        for (const x of frontPosts) {
          box(altar, .04, .3, .024, x, .29, .438, 0x24170f);
        }
        // 横框の木口は束の内面で止める。通しの箱を重ねると、
        // 束との交点で同じ漆の面が重なり、寄った時にちらつく。
        for (const yy of [.18, .4]) for (let i = 1; i < frontPosts.length; i++) {
          const left = frontPosts[i - 1] + .02, right = frontPosts[i] - .02;
          box(altar, right - left, .04, .024, (left + right) / 2, yy, .438, 0x24170f);
        }
        // 内陣へ入って横から見ても無地の箱にしない。側面も同じ格狭間で推定復元。
        // 腰の側面（幅一・八五メートル）の外へ透かしと陰を重ね、下框・上框の内へ収める。
        // 左右の通り道を変えず、部品は既存の材質別の束へまとめる。
        for (const side of [-1, 1]) {
          box(altar, .006, .18, .4, side * .929, .29, 0, 0x160f0b);
          const m = new THREE.Mesh(shapes.get(key), mat(0x8a6c30));
          cacheUsers.push(new WeakRef(m));
          m.rotation.y = side * Math.PI / 2;
          m.position.set(side * .936, .29, 0); altar.add(m);
          // 側面の横框も束へ通しほぞで留める推定復元。
          // 束は穴の上下と両頬を残し、横框の肩は従来どおり束の内面で止める。
          // 格狭間の開口・壇の外寸は保ち、既存の箱と漆の材質へまとめる。
          const postX = side * .938;
          for (const z of [-.24, .24]) {
            for (const [bottom, top] of [[.14, .17], [.19, .39], [.41, .44]]) {
              box(altar, .024, top - bottom, .04, postX, (bottom + top) / 2, z, 0x24170f);
            }
            for (const yy of [.18, .4]) {
              for (const cheek of [-1, 1]) {
                box(altar, .006, .02, .04, postX + cheek * .009, yy, z, 0x24170f);
              }
              // ほぞ先を束の外へ二ミリ出し、側面の込栓で抜けを止める。
              box(altar, .012, .02, .042, postX, yy,
                z + Math.sign(z) * .001, 0x24170f);
              for (const face of [-1, 1]) {
                box(altar, .004, .008, .008, postX + face * .012, yy, z, 0x3a2417);
              }
            }
          }
          for (const yy of [.18, .4]) box(altar, .024, .04, .44, side * .938, yy, 0, 0x24170f);
        }
      } else for (const x of [-.55, 0, .55]) box(altar, .4, .18, .01, x, .29, .415, 0x8a6c30);
      if (!moribeAltar) box(altar, 2.1, .1, 1, 0, .49, 0, 0x24170f);
      if (moribeAltar) {
        // 本尊背面の板壁と框も推定復元。光背の裏へ納め、須弥壇の幅と奥行きを出ない。
        // 側面を囲わず、内陣の左右の通り道と灯明の位置を保つ。
        // 背板は一枚の大板にせず、左右の竪框と上下の横框の内側へ六枚を納める。
        // 目地の裏にも薄板を残し、本尊の背後から壁や光が透けない推定復元。
        // 背板は縦目、竪框は縦目、横框は横目にする。無地の色だけで板を表さず、
        // 建具と同じ木目の形・材質を共用し、壇の寸法と左右の通り道は保つ。
        // 背板の框は天蓋の下面（二・一四メートル）で止める。
        // 竪框を天蓋へ突き抜けさせず、鏡板の上端も上框の下面へ納める。
        timberBox(altar, 1.7, 1.46, .012, 0, 1.33, -.484, 0x3a2417);
        const backBoardW = 1.7 / 6;
        for (let i = 0; i < 6; i++) {
          // 縦板の継ぎ目を板厚いっぱいの突き付けにせず、相じゃくりで推定復元。
          // 裏半分の継ぎ目を十二ミリずらし、正面の目地を隣の板で受ける。
          // 両端は框の内面まで納め、板厚・裏桟・既存の当たりの範囲を保つ。
          // 二層とも共用の形と木材を使い、設営時に既存の束へまとめる。
          for (let layer = 0; layer < 2; layer++) {
            const left = -.85 + i * backBoardW + (layer && i > 0 ? .012 : 0);
            const right = -.85 + (i + 1) * backBoardW + (layer && i < 5 ? .012 : 0);
            const lo = left + (i > 0 ? .001 : 0);
            const hi = right - (i < 5 ? .001 : 0);
            timberBox(altar, hi - lo, 1.46, .024,
              (lo + hi) / 2, 1.33, -.442 - layer * .024,
              i % 2 ? 0x6a5038 : 0x6a5238, 1);
          }
        }
        // 竪框も上下の横框の内面（〇・六〜二・〇六メートル）へ納める。
        // 四隅で木目の面を重ねず、背面から見ても框の継ぎ目を保つ。
        for (const x of [-.89, .89]) timberBox(altar, .08, 1.46, .1, x, 1.33, -.46, 0x3a2417);
        for (const yy of [.56, 2.10]) timberBox(altar, 1.86, .08, .1, 0, yy, -.46, 0x3a2417);
        // 背の縦板を上下の框だけで支えず、裏側の二本の桟で押さえる推定復元。
        // 桟は竪框の内面で止め、板裏へ接する。厚みも框の背面以内へ納め、
        // 須弥壇の当たりと背後の通路を広げない。木目付きの箱と材質は共用する。
        for (const yy of [.90, 1.76]) {
          timberBox(altar, 1.7, .06, .02, 0, yy, -.50, 0x3a2417, 0);
          // 六枚の板を裏桟へ留める釘頭。裏面からだけ見せ、正面の光背に重ねない。
          for (let i = 0; i < 6; i++) timberBox(altar, .009, .009, .002,
            -.85 + (i + .5) * backBoardW, yy, -.511, 0x3a3024);
        }
        // 当時の本尊の姿は未詳。薬師堂の推定復元として、蓮台・結跏趺坐・薬壺を表す。
        // 丸みは一つの球を寸法だけ変えて共用し、最後に既存の材質別の束へまとめる。
        const key = 'moribe:yakushi:round';
        if (!shapes.has(key)) shapes.set(key, new THREE.SphereGeometry(1, 12, 8));
        const round = (x, y, z, sx, sy, sz, color = 0xa48b4a) => {
          const m = new THREE.Mesh(shapes.get(key), mat(color));
          cacheUsers.push(new WeakRef(m)); m.position.set(x, y, z); m.scale.set(sx, sy, sz); altar.add(m);
          return m;
        };
        round(0, 1.22, -.36, .43, .57, .025, 0x7a5e26); // 舟形の光背
        round(0, .59, -.1, .35, .06, .27, 0x6e5424);
        for (let i = 0; i < 10; i++) {
          const a = i * Math.PI / 5;
          round(Math.cos(a) * .28, .65, -.1 + Math.sin(a) * .2, .1, .045, .09, 0x8a6c30);
        }
        round(0, .77, -.06, .32, .13, .23); // 組んだ膝と衣
        round(0, 1.03, -.12, .2, .29, .15);
        round(0, 1.4, -.12, .13, .16, .12);
        round(0, 1.56, -.12, .075, .055, .075, 0x393127); // 螺髪と肉髻
        // 顔を球のままにせず、伏せた目と眉・鼻・口を本尊の正面へ納める推定表現。
        // 眼球を白く描かず、金色のまぶたの下に細い陰を置く。既存の球と材質を共用する。
        for (const side of [-1, 1]) {
          round(side * .047, 1.435, -.012, .035, .007, .008, 0x6e5424).rotation.z = side * .12;
          round(side * .047, 1.409, -.003, .032, .006, .008, 0x393127);
          round(side * .047, 1.416, -.002, .034, .009, .009);
        }
        round(0, 1.394, .001, .014, .043, .016);
        round(0, 1.371, .012, .02, .013, .016);
        round(0, 1.344, -.003, .029, .005, .008, 0x6e5424);
        round(0, 1.338, -.004, .023, .005, .008);
        // 黒い一塊だった髪に小さな螺髪を並べ、頂の肉髻と区別する。
        // 頭と同じ球を寸法だけ変え、設営時に既存の材質別の束へまとめる。
        for (let row = 0; row < 3; row++) {
          const angle = .65 + row * .27, count = 12 - row * 2;
          const radius = .13 * Math.cos(angle), yy = 1.4 + .16 * Math.sin(angle);
          for (let i = 0; i < count; i++) {
            const a = (i + (row % 2) * .5) * Math.PI * 2 / count;
            round(Math.cos(a) * radius, yy, -.12 + Math.sin(a) * radius * .92,
              .018, .018, .018, 0x393127);
          }
        }
        for (const x of [-.135, .135]) round(x, 1.38, -.12, .025, .085, .035);
        // 本尊は入口（＋奥行き）を向く。像自身の左手は見る人の右に来る。
        round(.2, 1.02, .01, .065, .18, .07).rotation.z = .45;
        round(.15, .89, .12, .1, .035, .07); // 薬壺を受ける左の掌
        round(.15, .96, .12, .065, .065, .06, 0x6e5424);
        round(.15, 1.025, .12, .07, .018, .065, 0x8a6c30);
        round(-.21, 1.08, .02, .06, .16, .065).rotation.z = .3;
        round(-.23, 1.23, .07, .05, .095, .025); // 右手の施無畏印
      } else {
        box(altar, .6, .1, .5, 0, .59, -.1, 0x6e5424);
        box(altar, .45, .7, .4, 0, .99, -.1, 0xa48b4a);
        box(altar, .28, .28, .28, 0, 1.48, -.1, 0xa48b4a);
        box(altar, .9, .9, .03, 0, 1.25, -.36, 0x7a5e26);
      }
      if (moribeAltar) {
        // 前卓の天板も無地の一枚箱にせず、四周の框と三枚の鏡板で推定復元。
        // 上面は仏具の底と同じ五十センチ。目地の下を裏板で閉じ、
        // 木目は長手へ通す。建具と同じ形・材質を共用し、設営時にまとめる。
        for (const z of [.33, .63]) timberBox(part, 1.25, .08, .04, 0, .46, z, 0x2a1810);
        for (const x of [-.605, .605]) timberBox(part, .04, .08, .26, x, .46, .48, 0x2a1810);
        // 脚を天板の裏へ突き付けただけにせず、四本の上ほぞを裏板へ差す推定復元。
        // 裏板の下三センチだけ同じ寸法のほぞ穴を空け、上二センチは通して鏡板を受ける。
        // 木同士を重ねず、既存の木目・材質別の束へまとめる。卓の外寸と当たりは保つ。
        timberBox(part, 1.17, .02, .26, 0, .46, .48, 0x2a1810);
        const tenonHalf = .013;
        const backingRows = [.35, .38 - tenonHalf, .38 + tenonHalf,
          .58 - tenonHalf, .58 + tenonHalf, .61];
        for (let i = 1; i < backingRows.length; i++) {
          const back = backingRows[i - 1], front = backingRows[i];
          const spans = i === 2 || i === 4
            ? [[-.585, -.5 - tenonHalf], [-.5 + tenonHalf, .5 - tenonHalf], [.5 + tenonHalf, .585]]
            : [[-.585, .585]];
          for (const [left, right] of spans) timberBox(part, right - left, .03, front - back,
            (left + right) / 2, .435, (back + front) / 2, 0x2a1810);
        }
        const tableBoardDepth = .26 / 3;
        for (let i = 0; i < 3; i++) timberBox(part, 1.17, .03,
          tableBoardDepth - .002, 0, .485, .35 + (i + .5) * tableBoardDepth, 0x2a1810);
        for (const x of [-.5, .5]) for (const z of [.38, .58]) {
          // 四方の下貫を通しほぞでつなぐ推定復元。
          // 交差するほぞは上下に相欠きし、脚の中でも木を重ねない。
          // 分けた脚も縦目を保ち、共用の形・材質へ設営時にまとめる。
          const mortiseBottom = .1475, mortiseTop = .1725;
          timberBox(part, .06, mortiseBottom, .06,
            x, mortiseBottom / 2, z, 0x24170f, 1);
          // 幕板も肩を脚へ突き付けるだけにせず、上下に違えたほぞで組む。
          // 脚の中央を同寸で欠き、直交する二本のほぞ同士も重ねない推定復元。
          // 下貫の上から幕板の穴までは縦目を通し、脚頭も天板のほぞへつなぐ。
          timberBox(part, .06, .35 - mortiseTop, .06,
            x, (.35 + mortiseTop) / 2, z, 0x24170f, 1);
          timberBox(part, .06, .01, .06, x, .415, z, 0x24170f, 1);
          for (const face of [-1, 1]) timberBox(part, .06, .03, .02,
            x, .365, z + face * .02, 0x24170f, 1);
          for (const side of [-1, 1]) timberBox(part, .02, .03, .06,
            x + side * .02, .395, z, 0x24170f, 1);
          timberBox(part, .062, .03, .02, x, .365, z, 0x24170f, 0);
          timberBox(part, .02, .03, .062, x, .395, z, 0x24170f, 2);
          for (const face of [-1, 1]) {
            timberBox(part, .06, .0125, .0175,
              x, .15375, z + face * .02125, 0x24170f, 1);
            // ほぞの木口を脚の外へ二ミリ出し、込栓で抜けを留める。
            timberBox(part, .012, .012, .004,
              x, .16, z + face * .03, 0x6a5038);
          }
          for (const side of [-1, 1]) timberBox(part, .0175, .0125, .06,
            x + side * .02125, .16625, z, 0x24170f, 1);
          timberBox(part, .062, .0125, .025,
            x + Math.sign(x) * .001, .15375, z, 0x24170f, 0);
          // 前後の貫のほぞは上半分を通す。外側の木口も脚から二ミリだけ出す。
          timberBox(part, .025, .0125, .062,
            x, .16625, z + Math.sign(z - .48) * .001, 0x24170f, 2);
          timberBox(part, tenonHalf * 2, .03, tenonHalf * 2, x, .435, z, 0x24170f);
          // 幕板と脚の仕口を留める込栓の木口。表裏へ二ミリだけ出し、
          // 内陣から卓の周囲を見ても四本の脚の留め付けが分かるようにする。
          // 二方向の込栓を各ほぞの高さへ合わせ、穴のない脚へ飾りだけを付けない。
          for (const face of [-1, 1]) {
            timberBox(part, .012, .012, .004,
              x, .365, z + face * .03, 0x6a5038);
            timberBox(part, .004, .012, .012,
              x + face * .03, .395, z, 0x6a5038);
          }
        }
        // 前卓は四方の貫で脚をつなぎ、天板の下には幕板を渡す推定復元。
        // 貫と幕板の肩は脚の内面へ納め、細いほぞだけ脚へ通す。
        // 共通の箱と漆の材質へまとめ、卓の寸法・通り道・当たりは変えない。
        for (const z of [.38, .58]) {
          timberBox(part, .94, .045, .045, 0, .16, z, 0x24170f);
          timberBox(part, .94, .08, .04, 0, .38, z, 0x24170f);
        }
        for (const x of [-.5, .5]) {
          timberBox(part, .045, .045, .14, x, .16, .48, 0x24170f);
          timberBox(part, .04, .08, .14, x, .38, .48, 0x24170f);
        }
        // 当時の仏具の個別の姿は不明。中央の香炉、向かって左の花瓶、右の燭台で推定復元。
        // 円形も設営時に共通の形・材質へまとめ、灯りや毎コマの処理は増やさない。
        const vessel = (rt, rb, height, x, yy, color) => {
          const key = `moribe:仏具:${rt}:${rb}:${height}`;
          if (!shapes.has(key)) shapes.set(key, new THREE.CylinderGeometry(rt, rb, height, 12));
          const m = new THREE.Mesh(shapes.get(key), mat(color));
          cacheUsers.push(new WeakRef(m)); m.position.set(x, yy, .48); part.add(m); return m;
        };
        // 花瓶の口と燭台の受け皿は、外壁から内壁へ折り返した断面で作る。
        // 円板を口へ重ねず、縁の厚みと底までの深さを残す。形は設営時だけ作って共用する。
        const vesselShell = (name, profile, x, color) => {
          const key = `moribe:仏具:中空:${name}`;
          if (!shapes.has(key)) shapes.set(key,
            new THREE.LatheGeometry(profile.map(([r, yy]) => new THREE.Vector2(r, yy)), 12));
          const m = new THREE.Mesh(shapes.get(key), mat(color));
          cacheUsers.push(new WeakRef(m)); m.position.set(x, 0, .48); part.add(m);
        };
        // 香炉は三本の脚を卓の上面へ据える推定復元。胴の下の一センチの浮きを残さない。
        // 縁も金属の円板で口を塞がず、中空の輪と低い灰面に分ける。
        for (const [x, z] of [[-.043, .025], [.043, .025], [0, -.045]]) {
          box(part, .018, .025, .018, x, .5125, .48 + z, 0x6a5a3a);
        }
        // 胴も底から内壁へ折り返し、口縁だけが中空の器にしない。
        // 灰を胴の内側へ落とし、線香の根元までつなぐ推定復元。形と材質は共用する。
        vesselShell('香炉の胴', [[0, .51], [.05, .51], [.075, .59],
          [.061, .59], [.04, .525], [0, .525]], 0, 0x6a5a3a);
        const rimKey = 'moribe:香炉:口縁';
        if (!shapes.has(rimKey)) {
          const profile = [[.061, -.009], [.075, -.009], [.075, .009], [.061, .009], [.061, -.009]];
          shapes.set(rimKey, new THREE.LatheGeometry(profile.map(([r, yy]) => new THREE.Vector2(r, yy)), 12));
        }
        const rim = new THREE.Mesh(shapes.get(rimKey), mat(0x8a6c30));
        cacheUsers.push(new WeakRef(rim)); rim.position.set(0, .599, .48); part.add(rim);
        vessel(.055, .055, .004, 0, .57, 0x454037); // 灰は内壁まで広げ、口縁より下へ納める。
        for (const x of [-.025, .025]) box(part, .006, .095, .006, x, .615, .48, 0x493624);
        vessel(.055, .075, .025, -.4, .5125, 0x6a5a3a);
        vesselShell('花瓶の胴', [[.055, .525], [.065, .525], [.035, .645],
          [.027, .645], [.055, .535], [.055, .525]], -.4, 0x6a5a3a);
        vesselShell('花瓶の口', [[.027, .645], [.035, .645], [.05, .69],
          [.05, .694], [.042, .694], [.027, .645]], -.4, 0x8a6c30);
        vessel(.054, .054, .004, -.4, .535, 0x292723);
        // 花枝は口元で途切れさせず、中空の花瓶の底へ差す。
        // 花と葉の位置は保ち、内陣から口を見下ろしても枝を宙に浮かせない。
        // 設営時に既存の箱へまとめ、卓の幅と奥行きの中へ収める。
        const stemBottom = .537, stemTop = .8 + .115 * Math.cos(.22);
        const stemRun = .025 + .115 * Math.sin(.22) - .006;
        const stemRise = stemTop - stemBottom;
        for (const side of [-1, 1]) {
          box(part, .008, Math.hypot(stemRise, stemRun), .008,
            -.4 + side * (.006 + stemRun / 2), (stemBottom + stemTop) / 2, .48,
            0x493624).rotation.z = -side * Math.atan2(stemRun, stemRise);
          box(part, .07, .025, .025, -.4 + side * .05, .82, .48, 0x586044).rotation.z = side * .4;
          box(part, .055, .04, .045, -.4 + side * .05, .91, .48, 0xc6bda5);
        }
        vessel(.075, .085, .025, .4, .5125, 0x6a5a3a);
        vessel(.018, .035, .2, .4, .625, 0x8a6c30);
        // 中央だけ蝋燭の底まで立ち上げ、深くした皿の上へ蝋燭を浮かせない。
        vesselShell('燭台の受け皿', [[0, .725], [.025, .725], [.065, .744],
          [.065, .75], [.059, .75], [.022, .733], [.022, .75], [0, .75]], .4, 0x8a6c30);
        vessel(.018, .021, .12, .4, .81, 0xd8c7a0); // 消えた蝋燭。新たな光源を置かない。
        box(part, .004, .012, .004, .4, .876, .48, 0x292723);
      } else {
        box(part, .5, .04, .22, 0, .54, .38, 0x2a1810); box(part, .12, .1, .12, 0, .6, .38, 0x6a5a3a);
      }
      // 森部の灯明は須弥壇の上框へ載せ、天蓋から下がる幡より手前に納める。
      // 奥行きの中央では油皿が幡の下端へ重なる。台座まで壇内に収め、共通部品を使う。
      const lampZ = moribeAltar ? .22 : 0, lampY = moribeAltar ? .54 : .55;
      place(altar, tomyo(moribeAltar), -.75, lampZ, 0, lampY);
      place(altar, tomyo(moribeAltar), .75, lampZ, 0, lampY);
      if (templeAltar) {
        // 古い堂の内陣の推定：家庭用仏壇ではなく、須弥壇の本尊を覆う天蓋と幡。
        // 須弥壇と同じ範囲に収め、左右の通路を空ける。形・材質は箱の共通部品を使う。
        if (moribeAltar) {
          // 天蓋の下面も厚い一枚板で済ませず、框・鏡板・受け桟で推定復元。
          // 外形と吊り元の高さを保ち、幡の吊り棒も下の受け桟へ付ける。
          // 木目付きの共用部品を設営時にまとめ、内陣の通路には張り出さない。
          for (const z of [-.415, .255]) {
            timberBox(altar, 1.55, .08, .05, 0, 2.18, z, 0x3a2417);
          }
          for (const x of [-.75, .75]) {
            // 幡を吊る受け桟の端を框へ突き付けず、薄いほぞで差す推定復元。
            // 框の内側二センチだけを同寸で欠き、外側の木と上下面は残す。
            // 鏡板・吊り棒・天蓋の外寸は保ち、共用の箱と材質へまとめる。
            for (const z of [-.24, .08]) {
              timberBox(altar, .05, .08, .30, x, 2.18, z, 0x3a2417, 2);
            }
            const side = Math.sign(x);
            timberBox(altar, .03, .08, .02, side * .76, 2.18, -.08, 0x3a2417, 2);
            timberBox(altar, .02, .0125, .02, side * .735, 2.14625, -.08, 0x3a2417, 2);
            timberBox(altar, .02, .0425, .02, side * .735, 2.19875, -.08, 0x3a2417, 2);
            timberBox(altar, .02, .025, .02, side * .735, 2.165, -.08, 0x3a2417, 0);
          }
          // 鏡板は框の内側へ三枚。板継ぎは相じゃくりで推定復元する。
          // 二ミリの突き付け目地を板厚いっぱいに通さず、上半分をずらして受ける。
          // 外周・下面・上面の高さは保ち、既存の木目と材質へまとめる。
          const boardDepth = .62 / 3;
          for (let i = 0; i < 3; i++) {
            for (let layer = 0; layer < 2; layer++) {
              const back = -.39 + i * boardDepth + (layer && i > 0 ? .015 : 0);
              const front = -.39 + (i + 1) * boardDepth + (layer && i < 2 ? .015 : 0);
              // 目地は継ぎ目だけに取り、框際には透ける隙間を残さない。
              const lo = back + (i > 0 ? .001 : 0), hi = front - (i < 2 ? .001 : 0);
              timberBox(altar, 1.45, .015, hi - lo,
                0, 2.19 + (layer + .5) * .015, (lo + hi) / 2, 0x6a5038);
            }
          }
          // 受け桟は板の下面に当て、両端を左右の框へ納める。
          // 下面は幡の吊り棒の上端（二・一四メートル）とそろえる。
          timberBox(altar, 1.45, .05, .035, 0, 2.165, -.08, 0x3a2417);
        } else box(altar, 1.55, .08, .72, 0, 2.18, -.08, 0x3a2417);
        // 森部の上板は下框・鏡板の上端（二・二二メートル）へ載せる。
        // 従来は一センチ食い込んでいた。天蓋の上端と吊り金具の始点は保ち、
        // 板厚だけ五センチへ納めて、横からも二段の木組みを見せる。
        if (moribeAltar) {
          // 上板も金色の一枚箱にせず、木の框へ三枚の板を納める推定復元。
          // 五センチの厚みと外寸は保ち、目地の下は裏板で閉じる。
          // 下框と同じ木目付き部品を使い、設営時に材質別の束へまとめる。
          // 上框の四隅は相欠きで組む推定復元。前後材の下半分と
          // 側材の上半分を通し、木口の突き付けだけで枠を閉じない。
          // 外寸・板の受け・吊り鉄の位置は保ち、共用の箱と材質へまとめる。
          for (const z of [-.46, .30]) {
            timberBox(altar, 1.7, .025, .06, 0, 2.2325, z, 0x3a2417, 0);
            timberBox(altar, 1.58, .025, .06, 0, 2.2575, z, 0x3a2417, 0);
          }
          for (const x of [-.82, .82]) {
            timberBox(altar, .06, .025, .7, x, 2.2325, -.08, 0x3a2417, 2);
            timberBox(altar, .06, .025, .82, x, 2.2575, -.08, 0x3a2417, 2);
          }
          timberBox(altar, 1.58, .02, .7, 0, 2.23, -.08, 0x6a5038);
          const topBoardDepth = .7 / 3;
          for (let i = 0; i < 3; i++) {
            // 上板も下の鏡板と同じ相じゃくりで推定復元する。
            // 継ぎ目だけ二ミリ空け、上半分を十五ミリずらして隣の板で受ける。
            // 框際は隙間を取らず、三センチの板厚・外寸・吊り鉄の位置は保つ。
            // 共通の木目付きの箱を使い、設営時に既存の材質の束へまとめる。
            for (let layer = 0; layer < 2; layer++) {
              const back = -.43 + i * topBoardDepth + (layer && i > 0 ? .015 : 0);
              const front = -.43 + (i + 1) * topBoardDepth + (layer && i < 2 ? .015 : 0);
              const lo = back + (i > 0 ? .001 : 0), hi = front - (i < 2 ? .001 : 0);
              timberBox(altar, 1.58, .015, hi - lo,
                0, 2.24 + (layer + .5) * .015, (lo + hi) / 2, 0x6a5038);
            }
          }
        } else box(altar, 1.7, .06, .82, 0, 2.24, -.08, 0x8a6c30);
        if (moribeAltar) {
          // 吊り元を薄い天井板だけで受けず、左右の格縁へ渡す受け木に留める推定復元。
          // 格縁の割り付けは naka.js とそろえ、受け木の上端を格縁の下面へ掛ける。
          // 調度の倍率を戻し、既存の箱と材質へまとめる。通路の当たりは増やさない。
          const sx = p.w / 2.1, sy = p.h / 1.5;
          const ceiling = (h - (p.y || 0)) / sy;
          const inner = layout.rooms[0], width = inner.x1 - inner.x0 - .32;
          const bays = Math.max(1, Math.round(width / .75));
          const spacing = width / bays;
          // 四本の吊り金具の外側にある格縁を選び、両端をその幅の内側へ納める。
          const rail = Math.min(bays, Math.ceil((width / 2 + .6 * sx) / spacing));
          const bearingX = -width / 2 + rail * spacing;
          // 吊り棒を薄い鏡板だけへ差さず、前後の框を抱く鉄帯へつなぐ推定復元。
          // 二筋の帯を四本の棒で吊り、框の下面まで折り返して天蓋を受ける。
          // 箱と鉄色は共用し、壇の左右の通路には張り出さない。
          for (const x of [-.6, .6]) {
            box(altar, .06, .008, .832, x, 2.274, -.08, 0x3a3024);
            for (const side of [-1, 1]) {
              box(altar, .06, .066, .008, x, 2.245, -.08 + side * .414, 0x3a3024);
              box(altar, .06, .008, .05, x, 2.216, -.08 + side * .385, 0x3a3024);
            }
          }
          const rodBottom = 2.278, rise = ceiling - .2 / sy - rodBottom;
          if (rise > 0) for (const z of [-.34, .18]) {
            timberBox(altar, (bearingX * 2 + .06) / sx, .08 / sy, .08,
              0, ceiling - .16 / sy, z, 0x3a2417);
            // 格縁は奥行き方向へ通る。前後へ吊り鉄を置くと格縁の中へ貫通する。
            // 左右の格縁の外側から受け木の底へ回す吊り鉄で推定復元し、
            // 天井板より下の側面へ留める。既存の箱と鉄色を使い回す。
            for (const side of [-1, 1]) {
              const outerX = side * (bearingX + .033) / sx;
              box(altar, .006 / sx, .18 / sy, .04,
                outerX, ceiling - .11 / sy, z, 0x3a3024);
              box(altar, .076 / sx, .006 / sy, .04,
                side * (bearingX - .002) / sx, ceiling - .203 / sy, z, 0x3a3024);
              // 留め頭は格縁へ当てた吊り鉄の外面へ出し、天井板を突き抜けない。
              box(altar, .006 / sx, .024 / sy, .024,
                side * (bearingX + .039) / sx, ceiling - .06 / sy, z, 0x3a3024);
            }
          }
          if (rise > 0) for (const x of [-.6, .6]) for (const z of [-.34, .18]) {
            box(altar, .025, rise, .025, x, rodBottom + rise / 2, z, 0x3a3024);
            // 吊り元の小さな座金を受け木の下面へ納める。
            box(altar, .06, .008 / sy, .06, x, ceiling - .204 / sy, z, 0x3a3024);
          }
        }
        for (const x of [-.68, .68]) {
          if (moribeAltar) {
            // 幡頭を縦棒の木口へ直付けせず、横木で受ける推定復元。
            // 布の上端（一・八六メートル）へ横木の下面を合わせ、
            // 縦棒は横木の上面で止める。共通の木目付き部品へまとめる。
            timberBox(altar, .035, .26, .035, x, 2.01, -.08, 0x3a2417, 1);
            timberBox(altar, .16, .02, .035, x, 1.87, -.08, 0x3a2417, 0);
            // 長方形一枚の布から、幡頭・幡身・二本の幡足を持つ姿へ推定復元。
            // 吊り元と裾の高さは保ち、足の間は実際に空ける。
            // 折り目は静止した形へ焼き、左右で同じ形・布の材質を共用する。
            const key = 'moribe:幡:布';
            if (!shapes.has(key)) {
              const body = new THREE.BoxGeometry(.12, .36, .002, 6, 4, 1);
              body.translate(0, .07, 0);
              const bp = body.attributes.position;
              for (let i = 0; i < bp.count; i++) {
                // 上の九センチを三角の幡頭とし、細い吊り口から身へ広げる。
                const taper = 1 - Math.max(0, (bp.getY(i) - .16) / .09) * .8;
                bp.setX(i, bp.getX(i) * taper);
              }
              const pieces = [body];
              for (const side of [-1, 1]) {
                const foot = new THREE.BoxGeometry(.04, .14, .002, 2, 1, 1);
                foot.translate(side * .04, -.18, 0); pieces.push(foot);
              }
              const geo = mergeGeometries(pieces);
              pieces.forEach(piece => piece.dispose());
              const pos = geo.attributes.position;
              for (let i = 0; i < pos.count; i++) {
                pos.setZ(i, pos.getZ(i) + Math.sin((pos.getX(i) / .12 + .5) * Math.PI * 4) * .004);
              }
              geo.computeVertexNormals(); shapes.set(key, geo);
            }
            const cloth = new THREE.Mesh(shapes.get(key), mat(0x95815a, 'banM'));
            cacheUsers.push(new WeakRef(cloth)); cloth.position.set(x, 1.61, -.08); altar.add(cloth);
            // 布の上端は吊り棒の下面（一・八六メートル）へ縫い留める。
            box(altar, .024, .012, .006, x, 1.854, -.08, 0x95815a, 'banM');
          } else {
            box(altar, .035, .28, .035, x, 2.0, -.08, 0x8a6c30);
            box(altar, .12, .54, .025, x, 1.63, -.08, 0x95815a);
          }
        }
      }
    } else if (moribeStorage) {
      // 在所の収納は蓋付きの木櫃で推定復元。購入素材の引き出し箪笥へ置き換えない。
      // 蓋・底・補強帯も調度の当たりの内側へ納め、共通の箱と材質へまとめる。
      const { w, h, d } = p;
      // 鉄帯と板の表面を同じ面へ重ねると、近寄った時にちらつく。
      // 帯の幅だけ板を欠き、下に木を残して鉄を納める推定復元。
      // 櫃の外寸と当たりを保ち、既存の箱・材質へまとめる。
      const bands = [-w * .34, w * .34];
      const cuts = [-w / 2, bands[0] - .02, bands[0] + .02,
        bands[1] - .02, bands[1] + .02, w / 2];
      // 帯の欠きで分けた胴板・蓋板も、幅方向へ通る一枚の横板として写す。
      // 切片の長辺で選ぶと帯の下だけ縦目になり、節の大きさも変わってしまう。
      // 元の板幅と位置で木目をつなぎ、二棟の櫃で寸法ごとの形を使い回す。
      const plank = (ww, hh, dd, xx, yy, zz, color) => {
        const mesh = timberBox(part, ww, hh, dd, xx, yy, zz, color, 0);
        const key = `森部の木櫃横板:${ww}:${hh}:${dd}:${xx}:${w}`;
        if (!shapes.has(key)) {
          const geo = mesh.geometry.clone();
          const pos = geo.attributes.position, normal = geo.attributes.normal, uv = geo.attributes.uv;
          for (let i = 0; i < pos.count; i++) {
            if (Math.abs(normal.getX(i)) > .5) continue;
            uv.setY(i, (pos.getX(i) + xx) / w + .5);
          }
          shapes.set(key, geo);
        }
        mesh.geometry = shapes.get(key);
      };
      // 一枚の塊ではなく横板を組んだ櫃とする推定復元。目地の奥には
      // 下地を残し、隙間から中を透かさない。板の木目は長手へ通す。
      // 胴板の木口を畳へ直接載せず、左右の畳ずりで底板を受ける推定の納まり。
      // 外寸内で底を三センチ上げ、畳の上面・蓋の高さ・調度の当たりは保つ。
      const footH = .03, bodyH = h - .1 - footH;
      for (const x of [-w / 2 + .05, w / 2 - .05]) {
        timberBox(part, .08, footH, d, x, footH / 2, 0, 0x503923, 2);
      }
      // 底板は胴の内面へ納め、側板と同じ面を重ねない。
      timberBox(part, w - .06, .025, d - .06, 0, footH + .0125, 0, 0x503923, 0);
      box(part, w - .06, bodyH - .025, d - .06,
        0, footH + .025 + (bodyH - .025) / 2, 0, 0x2e2218);
      const rows = Math.max(2, Math.round(bodyH / .16)), rowH = bodyH / rows;
      for (let q = 0; q < rows; q++) for (const side of [-1, 1]) {
        const cy = footH + (q + .5) * rowH;
        for (let i = 1; i < cuts.length; i++) {
          const depth = i % 2 === 0 ? .012 : .03;
          plank(cuts[i] - cuts[i - 1], rowH - .002, depth,
            (cuts[i] + cuts[i - 1]) / 2, cy, side * (d / 2 - .03 + depth / 2), 0x503923);
        }
        // 側板の木口は前後の板の内面へ納め、四隅で同じ面を重ねない。
        timberBox(part, .03, rowH - .002, d - .06, side * (w / 2 - .015), cy, 0, 0x503923);
      }
      box(part, w, .02, d, 0, h - .09, 0, 0x252321);
      box(part, w, .02, d, 0, h - .07, 0, 0x503923);
      const lidBoards = Math.max(2, Math.round(d / .18)), lidD = d / lidBoards;
      for (let q = 0; q < lidBoards; q++) for (let i = 1; i < cuts.length; i++) {
        const height = i % 2 === 0 ? .048 : .06;
        plank(cuts[i] - cuts[i - 1], height, lidD - .002,
          (cuts[i] + cuts[i - 1]) / 2, h - .06 + height / 2,
          -d / 2 + (q + .5) * lidD, 0x604831);
      }
      for (const x of bands) {
        // 蓋と胴を一本の鉄帯で固定せず、蓋の合わせ目で分ける推定復元。
        // 後ろは蝶番の軸でつなぎ、前は別の留め金で押さえる。
        // 既存の鉄色と箱を共用し、金具も調度の外寸へ納める。
        const seam = h - .08, lowerH = seam - .002 - footH, upperH = h - .012 - seam - .002;
        for (const side of [-1, 1]) {
          box(part, .04, lowerH, .012, x, footH + lowerH / 2, side * (d / 2 - .012), 0x252321);
          box(part, .04, upperH, .012, x, seam + .002 + upperH / 2,
            side * (d / 2 - .012), 0x252321);
        }
        box(part, .04, .012, d, x, h - .006, 0, 0x252321);
        // 蝶番の軸は三つの巻きに分け、左右を胴、中央を蓋の帯へ留める。
        // 木口は同じ面へ重ねず、巻き同士にも一ミリの隙間を残す。
        for (let j = 0; j < 3; j++) box(part, .012, .014, .014,
          x + (j - 1) * .013, seam, -d / 2 + .007, 0x252321);
        // 留め金は帯より内側に納めた鉄板と横向きの受けで表す。
        // 帯の合わせ目を覆い、黒い面へ同じ面の飾りを重ねない。
        box(part, .024, .052, .004, x, seam - .008, d / 2 - .004, 0x66553a);
        box(part, .032, .008, .008, x, seam - .022, d / 2 - .004, 0x252321);
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
    if (!kit && p.part === 'altar') part.scale.set(p.w / 2.1, p.h / 1.5, p.d / (layout.profile === 'moribe' && layout.kind === 'hondo' ? 1.3 : 1));
    place(g, part, p.x, p.z, p.rot || 0, p.y || 0);
    
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
      const moribeRoom = layout.profile === 'moribe' && layout.kind === 'yashiki';
      let tiles;
      if (moribeRoom) {
        // 間仕切りの敷居は室内側へ二十六・五センチ張り出す。
        // 奥の部屋以外はその木口から畳寄せを始め、畳と敷居を重ねない。
        const rearSill = layout.portals.some(p => Math.abs(p.z - r.z0) < .001) ? .27 : .26;
        const z0 = r.z0 + rearSill;
        // 固定戸の敷居は壁芯から奥側へ十一・五センチ出る。
        // 畳寄せごとその木口で止め、敷居の下へ畳の端を潜らせない。
        const z1 = r.z1 - (layout.portals.some(p => Math.abs(p.z - r.z1) < .001) ? .115 : 0);
        // 左右と奥の地覆の内面から畳寄せを始める。木の下へ畳を潜らせない。
        const x0 = r.x0 + .26, x1 = r.x1 - .26;
        // 奥行きの浅い座敷に半畳ずらしを使うと、端が二十センチの切れ端になる。
        // 部屋ごとに幅を均等に割り、畳寄せの内側へ一列に納める（間取りは推定復元）。
        const width = x1 - x0 - .2, depth = z1 - z0 - .2;
        const n = Math.max(1, Math.round(width / .9)), tw = width / n;
        tiles = Array.from({ length: n }, (_, i) => [x0 + .1 + (i + .5) * tw, (z0 + z1) / 2, tw, depth]);
        // 畳の端と壁・敷居の間を畳寄せで受け、床板の溝を残さない。
        // 畳寄せも無地の帯にせず、板間と共用の木目を長手へ通す。
        // 前後の材は幅方向へ木目を通し、隅の突き付けで木目の向きを切り替える。
        // 形・絵・材質は使い回し、足場も同じ範囲で高さをそろえる。
        // 建具と共通の木口用の写し方を使い、側面まで板の表と同じ木目にしない。
        for (const x of [x0 + .05, x1 - .05]) timberBox(g, .1, .066, z1 - z0,
          x, (r.y || 0) + .033, (z0 + z1) / 2, 0x493624);
        for (const z of [z0 + .05, z1 - .05]) timberBox(g, width, .066, .1,
          (r.x0 + r.x1) / 2, (r.y || 0) + .033, z, 0x493624);
        // 戸口の敷居は脇の固定戸より八センチ浅い。畳寄せを一律に止めると、
        // 出入りする中央だけ下地が露出するため、戸脇柱の内側へ寄せ板を延ばす。
        // 敷居の木口で止め、横滑りする戸の溝と柱には重ねない。
        for (const p of layout.portals) {
          if (Math.abs(p.z - r.z1) > .001) continue;
          let left = -Infinity, right = Infinity;
          for (const v of layout.walls) {
            if (v.guideOnly || Math.abs(v.az - p.z) > .001 || Math.abs(v.bz - p.z) > .001) continue;
            const a = Math.min(v.ax, v.bx), b = Math.max(v.ax, v.bx);
            if (b <= p.x && b > left) left = b;
            if (a >= p.x && a < right) right = a;
          }
          if (Number.isFinite(left) && Number.isFinite(right) && right - left > .14) {
            timberBox(g, right - left - .14, .066, .08,
              (left + right) / 2, (r.y || 0) + .033, r.z1 - .075, 0x493624);
          }
        }
      } else tiles = tatamiTiles(r.x0 + .1, r.x1 - .1, r.z0 + .1, r.z1 - .1);
      for (const [cx, cz, w, d] of tiles) {
        const x = cx - w / 2, z = cz - d / 2, floorY = r.y || 0;
        // 森部の座敷は畳同士を寄せる。二センチの隙間から床板を露出させない。
        const gap = moribeRoom ? .002 : .02;
        // 森部は購入した畳も畳寄せ・足場と同じ六・六センチへそろえる。
        const thickness = moribeRoom ? .066 : .06;
        // 森部は素材の読み込み状況によらず、畳寄せに合う表と縁を残す。
        if (japanese && !moribeRoom && addNaibu(kb, 'tatami_floor_modular_a', cx, floorY, cz, w - gap, thickness, d - gap)) continue;
        if (purchased && !layout.profile) kb.add('Floor_Tatami', x, floorY + .035, z + d, 0, w / 2, .12, d / 2);
        else place(g, tatami(w - gap, d - gap, thickness, moribeRoom), cx, cz, 0, floorY);
      }
    } else if (r.floor === 'boards' && moribeBoards) {
      // 堂と屋敷の板間は幅約八寸の板で推定復元。購入素材が読めても同じ板割りを使う。
      // 間仕切りの敷居と壁際の地覆を避け、歩く床の高さは六ミリ以内へ納める。
      const rearSill = layout.portals.some(p => Math.abs(p.z - r.z0) < .001);
      const frontSill = layout.portals.some(p => Math.abs(p.z - r.z1) < .001);
      // 地覆の内面は壁芯から二十三センチ。板をその木口で止め、壁の下へ潜らせない。
      // 正面も地覆の内面で止め、戸口の中だけ板を入口まで延ばす。
      const x0 = r.x0 + .23, x1 = r.x1 - .23;
      // 戸口だけでなく脇の固定戸の敷居まで避け、床板を木の下へ重ねない。
      const z0 = r.z0 + (rearSill ? .27 : .23), z1 = r.z1 - (frontSill ? .115 : .23);
      let floorOpening = !frontSill && layout.entryDoor?.side === 1
        ? { ...layout.entryDoor, extension: .13 } : null;
      if (frontSill) {
        // 固定戸の敷居は奥へ十一・五センチ、開く戸口は三・五センチ。
        // 一律に切ると戸口の前だけ八センチの下地が露出する。
        // 戸脇柱の内面で板幅を分け、戸口だけ敷居の木口まで通す。
        const portal = layout.portals.find(p => Math.abs(p.z - r.z1) < .001);
        let left = -Infinity, right = Infinity;
        for (const v of layout.walls) {
          if (v.guideOnly || Math.abs(v.az - portal.z) > .001 || Math.abs(v.bz - portal.z) > .001) continue;
          const a = Math.min(v.ax, v.bx), b = Math.max(v.ax, v.bx);
          if (b <= portal.x && b > left) left = b;
          if (a >= portal.x && a < right) right = a;
        }
        if (Number.isFinite(left) && Number.isFinite(right) && right - left > .14) {
          floorOpening = { x: (left + right) / 2, w: right - left - .14, extension: .08 };
        }
      }
      const width = x1 - x0, depth = z1 - z0;
      if (width > 0 && depth > 0) {
        const count = Math.max(1, Math.round(width / .24)), bw = width / count;
        const colors = [0x806345, 0x85684a, 0x7c6043];
        // 堂の長い床板は根太の上で継ぎ、隣の板と木口をずらす推定復元。
        // 外側の床下と同じ根太割りを使い、板の途中を宙で突き合わせない。
        const back = Math.min(...layout.rooms.map(room => room.z0));
        const buildingDepth = Math.max(...layout.rooms.map(room => room.z1)) - back;
        const joistStep = buildingDepth / Math.ceil(buildingDepth / .45);
        for (let i = 0; i < count; i++) {
          const x = x0 + (i + .5) * bw;
          const left = x - (bw - .003) / 2, right = x + (bw - .003) / 2;
          const cuts = [left, right];
          // 戸脇に掛かる板だけ幅を分け、開口側を敷居の木口まで長くする。
          // 短い継ぎ足しで木目を横向きにせず、長手を通した切欠き板として納める。
          if (floorOpening) for (const edge of [floorOpening.x - floorOpening.w / 2, floorOpening.x + floorOpening.w / 2]) {
            if (edge > left && edge < right) cuts.push(edge);
          }
          cuts.sort((a, b) => a - b);
          for (let j = 1; j < cuts.length; j++) {
            const cx = (cuts[j - 1] + cuts[j]) / 2;
            const endZ = z1 + (floorOpening && Math.abs(cx - floorOpening.x) < floorOpening.w / 2 ? floorOpening.extension : 0);
            const joint = depth > 2.4
              ? back + Math.round(((z0 + endZ) / 2 + (i % 2 ? joistStep : 0) - back) / joistStep) * joistStep : endZ;
            // 長い板の木口は根太の上で相じゃくりにする推定復元。
            // 上半分の継ぎ目から下半分を十五ミリずらし、三ミリの目地の底にも
            // 仕上げ板を残す。板の上端・下面は保ち、共用の形と材質へまとめる。
            const joined = joint > z0 + .3 && joint < endZ - .3;
            const ends = joined ? [joint, endZ] : [endZ];
            let start = z0;
            for (let k = 0; k < ends.length; k++) {
              // 長辺も相じゃくりで納める。三ミリの目地を板厚いっぱいに
              // 開けず、下半分を隣の板の下へ十五ミリ掛ける推定復元。
              // 木口の継ぎと同じ二層を使い、別の細い実や描画の束は増やさない。
              const end = ends[k], layers = 2;
              for (let layer = 0; layer < layers; layer++) {
                const lower = joined && layer === 0;
                let left = cuts[j - 1], right = cuts[j];
                if (layer === 0) {
                  if (j === 1 && i > 0) left += Math.min(.015, (right - left) / 2);
                  if (j === cuts.length - 1 && i < count - 1) right += .015;
                }
                const back = start + (lower && k > 0 ? .015 : 0)
                  + (k > 0 ? .0015 : 0);
                const front = end + (lower && k < ends.length - 1 ? .015 : 0)
                  - (k < ends.length - 1 ? .0015 : 0);
                const thickness = .012 / layers;
                const yy = (r.y || 0) - .006 + thickness * (layer + .5);
                const color = colors[(i + k) % colors.length];
                if (layer === 0 && endZ > z1 && front > z1) {
                  // 切欠きは戸口へ出る部分だけ。室内側まで下半分を削ると、
                  // 板の相じゃくりが戸脇から奥まで途切れてしまう。
                  // 入口の肩で分け、室内では隣の板の下へ実を残す。
                  // 切欠きの先や相じゃくりの短い部分も、元の床板の長手へ木目を通す。
                  // 箱の長辺から選ぶと、戸口の肩だけ木目が横向きになってしまう。
                  if (z1 > back) timberBox(g, right - left, thickness, z1 - back,
                    (left + right) / 2, yy, (back + z1) / 2, color, 2);
                  const doorLeft = floorOpening.x - floorOpening.w / 2;
                  const doorRight = floorOpening.x + floorOpening.w / 2;
                  // 戸脇で隣の板が終わる所は、下半分も板端まで残す。
                  // 通常の十五ミリのずらしを続けて、薄い上半分だけを張り出させない。
                  const tongueLeft = cuts[j - 1] <= doorLeft + .015
                    ? Math.max(cuts[j - 1], doorLeft) : Math.max(left, doorLeft);
                  const tongueRight = Math.min(right, doorRight), tongueBack = Math.max(back, z1);
                  if (tongueRight > tongueLeft) timberBox(g, tongueRight - tongueLeft, thickness,
                    front - tongueBack, (tongueLeft + tongueRight) / 2, yy, (tongueBack + front) / 2, color, 2);
                } else timberBox(g, right - left, thickness, front - back, (left + right) / 2,
                  yy, (back + front) / 2, color, 2);
              }
              // 板床は相じゃくりだけで浮かせず、根太へ留めた角釘の頭を見せる推定復元。
              // 各板の両端に近い根太だけを拾い、木口の継ぎ目では左右の板へ打ち分ける。
              // 戸口の細い切欠きには打たず、敷居・畳・板の目地へ釘をはみ出させない。
              // 既存の箱と鉄色を使い、室内の形へ一度まとめる。足場と当たりは増やさない。
              const boardWidth = cuts[j] - cuts[j - 1];
              if (boardWidth >= .08) {
                const first = Math.ceil((start + .02 - back) / joistStep);
                const last = Math.floor((end - .02 - back) / joistStep);
                for (let q = first; q <= last; q++) {
                  if (q !== first && q !== last) continue;
                  const z = back + q * joistStep;
                  for (const x of [cuts[j - 1] + .025, cuts[j] - .025]) {
                    box(g, .008, .002, .008, x, (r.y || 0) + .006, z, 0x252321);
                  }
                }
                // 根太上で継ぐ二枚の木口にも留めを残す。中心線から二センチ振り分ける。
                if (joined) for (const z of k === 0 ? [end - .02] : [start + .02]) {
                  for (const x of [cuts[j - 1] + .025, cuts[j] - .025]) {
                    box(g, .008, .002, .008, x, (r.y || 0) + .006, z, 0x252321);
                  }
                }
              }
              start = end;
            }
          }
        }
      }
    } else if (r.floor === 'earth') box(g, r.x1 - r.x0, .025, r.z1 - r.z0, (r.x0 + r.x1) / 2, (r.y || 0) + .013, (r.z0 + r.z1) / 2, 0x655847);
  }
  // 天井の高い堂・広間は、戸の高さ（約2.3m）で鴨居を通し、上は小壁にする（六メートルの襖を立てない）
  const temple = ['hondo', 'chudo', 'temple'].includes(layout.kind);
  // 森部の屋敷の襖・障子は外の戸口と同じ内法。天井までは鴨居と小壁にする。
  const moribeHouse = layout.profile === 'moribe' && layout.kind === 'yashiki';
  const ph = moribeHouse ? Math.min(2.2, h) : h > 3 ? 2.3 : h;
  // 森部は敷居の厚さと戸の下端を分け、固定戸も動く戸も上下の溝へ掛ける。
  // 八ミリの下溝へ六ミリ、三センチの上溝へ二十八ミリ掛ける。
  const panelY = moribeHouse ? .07 : layout.profile === 'moribe' ? .04 : 0;
  const panelBottom = layout.profile === 'moribe' ? panelY - .006 : panelY;
  const panelH = layout.profile === 'moribe' ? ph + .028 - panelBottom : ph;
  const upperWall = (part, len, centerX) => {
    // 森部の間仕切り梁は naka.js で天井下二十八〜四センチに渡す。
    // 小壁と中束は梁の下面で止め、梁を貫いて天井まで伸ばさない。
    const moribe = layout.profile === 'moribe';
    const top = h - (moribe ? .28 : 0);
    const rise = top - ph - .1, yy = ph + .1 + rise / 2;
    const color = temple ? 0xbdb39a : 0xcfc6b0;
    if (!moribe) {
      box(part, len, rise, .06, 0, yy, 0, color);
      return;
    }
    // 土の粒とすさは五十センチ角の同じ縮尺で写す。細長い小壁へ一枚の絵を
    // 引き伸ばさず、貫の上下・戸口と脇の小壁も建物内の座標でつなぐ。
    // 表裏で同じ位置を使い、形と材質は設営時に作って使い回す。
    const earth = (width, height, x, y) => {
      const m = box(part, width, height, .06, x, y, 0, color, 'earthM');
      const key = `森部の小壁:${width}:${height}:${centerX + x}:${y}`;
      if (!shapes.has(key)) {
        const geo = m.geometry.clone(), pos = geo.attributes.position, normal = geo.attributes.normal, uv = geo.attributes.uv;
        for (let i = 0; i < pos.count; i++) {
          const across = Math.abs(normal.getX(i)) > .5 ? pos.getZ(i) : pos.getX(i) + centerX + x;
          uv.setXY(i, across / .5, (pos.getY(i) + y) / .5);
        }
        shapes.set(key, geo);
      }
      m.geometry = shapes.get(key);
    };
    // 梁の上端から天井板までの四センチだけは別の小壁で閉じる。
    // 戸脇柱は梁の下面で止まるため、この高さでは柱幅を引かない。
    // 固定建具と戸口の小壁を柱芯でつなぎ、天井際の十四センチの抜けを塞ぐ。
    // 形の数と材質は保ち、梁や横滑りする戸の範囲へは張り出さない。
    if (len > 0) earth(len, .04, 0, h - .02);
    if (rise <= 0) return;
    // 小壁は柱・束の間へ納める推定復元。裏面も木の面を壁より前へ出し、
    // 土壁と同じ面でちらつかせない。束の見込みは長押の背（七センチ）へそろえる。
    // 固定戸と動く戸口で同じ割り付けを使い、既存の形・材質の束へまとめる。
    const bays = Math.max(1, Math.ceil(len / .9)), step = len / bays;
    // 堂の背の高い小壁は中束だけでなく小壁貫でつなぐ推定復元。
    // 土壁を上下へ分けて貫の間へ納め、表裏で木と土の面を重ねない。
    // 低い屋敷の小壁には無理に足さず、鴨居・長押・梁の位置も保つ。
    const tieH = temple && rise >= .24 ? .06 : 0;
    for (let i = 0; i < bays; i++) {
      const left = -len / 2 + i * step + (i === 0 ? .07 : .04);
      const right = -len / 2 + (i + 1) * step - (i === bays - 1 ? .07 : .04);
      if (right > left) {
        const x = (left + right) / 2;
        if (tieH) {
          const wallH = (rise - tieH) / 2;
          for (const side of [-1, 1]) {
            earth(right - left, wallH, x, yy + side * (tieH + wallH) / 2);
          }
          timberBox(part, right - left, tieH, .14, x, yy, 0, 0x3a2a1c);
        } else earth(right - left, rise, x, yy);
      }
      if (i > 0) timberBox(part, .08, rise, .14, -len / 2 + i * step, yy, 0, 0x3a2a1c);
    }
  };
  const innerNageshi = (part, len, centerX) => {
    const y = ph + (moribeHouse ? .12 : .42);
    if (layout.profile === 'moribe') {
      // 長押は柱を両側から挟む横木。柱・中束の面（七センチ）へ背を掛ける。
      // 小壁の芯へ埋めず、固定の間仕切りと戸口を同じ高さでつなぐ推定復元。
      // 戸の上端より高く納め、引き戸の二本の溝には張り出さない。
      // 側壁の長押は壁芯から二十三〜三十三センチ内側を通る。
      // 間仕切りの木口はその内面で止め、同じ高さの木同士を交差させない。
      // 固定戸と動く戸口は同じ位置から切り詰め、戸脇の継ぎ目はつないでおく。
      const wallLeft = Math.min(...layout.rooms.map(r => r.x0)) + .33;
      const wallRight = Math.max(...layout.rooms.map(r => r.x1)) - .33;
      const left = Math.max(-len / 2, wallLeft - centerX);
      const right = Math.min(len / 2, wallRight - centerX);
      if (right > left) for (const side of [-1, 1]) {
        // 側壁の長押（naka.js）と成を十センチにそろえる。
        // 十二センチでは曲がり角で上下に一センチずつ段が付き、
        // 堂・座敷を巡る長押が同じ高さでつながらない。
        const x = (left + right) / 2, z = side * .1;
        const mesh = timberBox(part, right - left, .1, .06, x, y, z, 0x2e2016, 0);
        // 固定戸の上と戸口の上は一本の長押として木目をつなぐ。
        // 切片ごとに絵を一枚伸ばすと、柱筋で節が途切れ、短い継ぎ木に見える。
        // 敷居・鴨居と同じ室内座標・実寸の倍率で写す。木口だけ短辺へ替える。
        const key = `森部の長押木目:${right - left}:${centerX + x}:${y}:${z}`;
        if (!shapes.has(key)) {
          const geo = mesh.geometry.clone();
          const pos = geo.attributes.position, normal = geo.attributes.normal, uv = geo.attributes.uv;
          for (let i = 0; i < pos.count; i++) {
            const end = Math.abs(normal.getX(i)) > .5;
            const across = Math.abs(normal.getY(i)) > .5 ? pos.getZ(i) + z : pos.getY(i) + y;
            uv.setXY(i, (end ? pos.getY(i) + y : across) / .3,
              end ? (pos.getZ(i) + z) / .3 : (pos.getX(i) + x + centerX) / 1.2);
          }
          shapes.set(key, geo);
        }
        mesh.geometry = shapes.get(key);
      }
    } else box(part, len, .12, .14, 0, y, 0, 0x2e2016);
  };
  const groovedRail = (part, len, z0, z1, tracks, head = false, centerX = 0) => {
    // 溝の木も戸の框と同じ木目を共用し、長手と木口の向きをそろえる。
    // 森部の溝は黒い帯を木の上へ載せず、底と溝脇の木へ分けて彫り込む。
    // 鴨居は上ほぞを受ける深さ、敷居は浅い溝とし、既存の箱・材質を使う。
    const height = head ? .1 : panelY, depth = head ? .03 : .008;
    const bottom = head ? ph : 0, top = bottom + height;
    // 柱芯まで渡す木をそのまま重ねず、柱身の所だけ欠く。
    // 手前の二本の溝は柱より前を通るので、引き切る位置まで途切れさせない。
    // 側壁の柱は見込み十六センチ、戸脇は十四センチ。形と材質は共用する。
    const notch = ['hondo', 'yashiki'].includes(layout.kind);
    const wallLeft = Math.min(...layout.rooms.map(r => r.x0)) + .16;
    const wallRight = Math.max(...layout.rooms.map(r => r.x1)) - .16;
    const railPiece = (back, front, hh, yy, shade = false) => {
      const put = (left, right, a, b) => {
        if (right <= left || b <= a) return;
        if (shade) box(part, right - left, hh, b - a,
          (left + right) / 2, yy, (a + b) / 2, 0x1e140e);
        else {
          // 溝脇と柱際の短い欠きも、元の敷居・鴨居の長手へ木目を通す。
          // 切片の寸法で向きと絵の倍率を選ぶと、柱際だけ横目になり、
          // 溝を挟んで節が伸び縮みする。一本の木の座標を固定戸と戸口で共用する。
          const x = (left + right) / 2, z = (a + b) / 2;
          const mesh = timberBox(part, right - left, hh, b - a, x, yy, z, 0x3a2a1c, 0);
          const key = `森部の建具溝木目:${right - left}:${hh}:${b - a}:${centerX + x}:${yy}:${z}`;
          if (!shapes.has(key)) {
            const geo = mesh.geometry.clone();
            const pos = geo.attributes.position, normal = geo.attributes.normal, uv = geo.attributes.uv;
            for (let i = 0; i < pos.count; i++) {
              const end = Math.abs(normal.getX(i)) > .5;
              const across = Math.abs(normal.getY(i)) > .5 ? pos.getZ(i) + z : pos.getY(i) + yy;
              uv.setXY(i, (end ? pos.getY(i) + yy : across) / .3,
                end ? (pos.getZ(i) + z) / .3 : (pos.getX(i) + x + centerX) / 1.2);
            }
            shapes.set(key, geo);
          }
          mesh.geometry = shapes.get(key);
        }
      };
      if (!notch) { put(-len / 2, len / 2, back, front); return; }
      put(-len / 2 + .07, len / 2 - .07, back, front);
      for (const side of [-1, 1]) {
        const end = side * len / 2;
        const x = centerX + end;
        const halfDepth = Math.abs(x - wallLeft) < .001 || Math.abs(x - wallRight) < .001 ? .08 : .07;
        const left = side < 0 ? end : end - .07, right = left + .07;
        put(left, right, back, Math.min(front, -halfDepth));
        put(left, right, Math.max(back, halfDepth), front);
      }
    };
    railPiece(z0, z1, height - depth,
      head ? bottom + depth + (height - depth) / 2 : (height - depth) / 2);
    let edge = z0;
    for (const track of tracks) {
      const left = track - .032, right = track + .032;
      if (left > edge) railPiece(edge, left, depth,
        head ? bottom + depth / 2 : top - depth / 2);
      // 陰は溝の底だけ。上面と重ねず、開いた建具の足元にも深さを残す。
      railPiece(left, right, .001,
        head ? bottom + depth - .0005 : top - depth + .0005, true);
      edge = right;
    }
    if (z1 > edge) railPiece(edge, z1, depth,
      head ? bottom + depth / 2 : top - depth / 2);
  };
  if (partitions && layout.profile === 'moribe') {
    // 堂の格子戸・屋敷の襖と障子を柱へ納める。戸口の幅を保ち、当たりの厚み内に収める。
    // 端が重なる柱は一度だけ作り、共通の箱と材質で室内へまとめる。
    const posts = new Set();
    for (const v of layout.walls) {
      if (v.guideOnly) continue;
      for (const [x, z] of [[v.ax, v.az], [v.bx, v.bz]]) {
        const key = `${x}:${z}`;
        if (posts.has(key)) continue;
        posts.add(key);
        // 両端は naka.js の側壁の通し柱を共用する。柱と釘隠しを二重に描かない。
        if (['hondo', 'yashiki'].includes(layout.kind) && layout.rooms.some(r =>
          Math.abs(x - (r.x0 + .16)) < .001 || Math.abs(x - (r.x1 - .16)) < .001)) continue;
        // 森部の戸脇柱は間仕切り梁の下面へ納める推定復元。
        // 十四センチ角の柱を梁へ貫通させず、梁の上の小壁・中束と分ける。
        // 梁は naka.js と同じく天井下二十八〜四センチ。既存の木目・材質へまとめる。
        const beamJoint = ['hondo', 'yashiki'].includes(layout.kind);
        const postH = beamJoint ? h - .28 : h;
        timberBox(g, .14, postH, .14, x, postH / 2, z, 0x3a2a1c, 1, true);
        // 敷居・鴨居の端を受ける戸脇柱には込栓の木口を見せる推定復元。
        // 鴨居は上溝の底より上、敷居は下溝の底より下で留める。
        // 木口だけを柱面から二ミリ出し、横へ滑る戸の溝を塞がない。
        // 柱の重複を除いたここで一組ずつ作り、既存の箱と木の色へまとめる。
        for (const pinY of [panelY / 2, ph + .065]) {
          for (const side of [-1, 1]) {
            box(g, .022, .022, .004, x, pinY, z + side * .07, 0x6a5038);
          }
        }
        // 外周の長押と同じく、間仕切りも柱への留めを釘隠しで表す推定復元。
        // 両室から見える長押の表面へ一組だけ納め、戸の滑る溝より上に置く。
        // 柱の重複を除いた所で作り、既存の箱と鉄色の材質へまとめる。
        const nailY = ph + (moribeHouse ? .12 : .42);
        for (const side of [-1, 1]) {
          box(g, .07, .07, .012, x, nailY, z + side * .136, 0x252321);
        }
      }
    }
  }
  if (partitions) for (const v of layout.walls) {
    if (v.guideOnly) continue;
    const len = Math.hypot(v.bx - v.ax, v.bz - v.az);
    // 森部の固定戸は両端の十四センチ角の柱の内面へ納める。
    // 柱芯間をそのまま戸幅にすると、左右の縦框が七センチずつ柱へ埋まる。
    // 敷居・鴨居は柱芯まで渡し、戸板だけを柱の間へ割り付ける。
    // 動く戸と同じく、柱の内面から二ミリ離して框を納める。
    const inset = layout.profile === 'moribe' ? .072 : 0;
    const panelSpan = len - inset * 2, n = Math.ceil(panelSpan / .9);
    const rot = Math.atan2(-(v.bz - v.az), v.bx - v.ax);
    const moribeBoard = layout.profile === 'moribe' && !v.paper;
    if (layout.profile === 'moribe') {
      // 動く戸口の敷居とつなぎ、固定の襖・障子・格子戸も同じ高さで受ける。
      const sill = new THREE.Group();
      // 奥の二本は固定戸、手前の二本は開いた戸が滑る位置へ通す。
      groovedRail(sill, len, -.115, .265, [-.04, .04, .115, .195], false, (v.ax + v.bx) / 2);
      place(g, sill, (v.ax + v.bx) / 2, (v.az + v.bz) / 2, rot);
    }
    if ((v.paper || moribeBoard) && ph < h) {
      const top = new THREE.Group();
      if (layout.profile === 'moribe') groovedRail(top, len, -.115, .265, [-.04, .04, .115, .195], true, (v.ax + v.bx) / 2);
      else box(top, len, .1, .12, 0, ph + .05, 0, 0x3a2a1c); // 鴨居
      innerNageshi(top, len, (v.ax + v.bx) / 2); // 内法長押
      upperWall(top, len, (v.ax + v.bx) / 2);
      place(g, top, (v.ax + v.bx) / 2, (v.az + v.bz) / 2, rot);
    }
    for (let i = 0; i < n; i++) {
      // 脇の建具も二本の溝へ引き違いに納め、召合せを二十四ミリ重ねる。
      // 柱側の両端は動かさず、重なりの分だけ各戸を広げる（推定復元）。
      // 手前の二本は開いた戸口の戸板用に空け、固定壁の当たりの厚み内に収める。
      const overlap = layout.profile === 'moribe' ? .024 : 0;
      const panelW = (panelSpan + overlap * (n - 1)) / n;
      const t = (inset + panelW / 2 + i * (panelW - overlap)) / len;
      const track = layout.profile === 'moribe' ? (i % 2 ? .04 : -.04) : 0;
      const x = v.ax + (v.bx - v.ax) * t - Math.sin(rot) * track;
      const z = v.az + (v.bz - v.az) * t + Math.cos(rot) * track;
      // 森部の脇の建具も二枚一組の召合せへ引手を向ける。
      // 森部の右戸は左右用の部品で表裏をそろえ、召合せへ引手を向ける。
      // 一枚だけの狭い脇戸はそのまま。形・材質・当たりは既存の物を使う。
      const panelRot = rot + (layout.profile === 'moribe' && i % 2 === 1 ? Math.PI : 0);
      if (v.paper && temple) {
        const moribe = layout.profile === 'moribe';
        place(g, koshi(panelW, panelH, moribe, moribe && i % 2 === 1), x, z, moribe ? rot : panelRot, panelBottom); continue;
      }
      // この戦の僧坊は入口の動く障子と同じ桟・紙で間仕切りを揃える。
      if (v.paper && hiei && layout.kind === 'sobo') { place(g, shoji(panelW, ph), x, z, rot); continue; }
      if (v.paper && (layout.profile === 'echizen_ikko' && layout.kind === 'sobo' || layout.profile === 'takato' && layout.kind === 'goten' || layout.profile === 'moribe' && layout.kind === 'yashiki')) {
        const paperDoor = v.kind === 'shoji';
        place(g, paperDoor ? shoji(panelW, panelH, moribeHouse, moribeHouse && i % 2 === 1) : fusuma(panelW, panelH, false, moribeHouse, moribeHouse && i % 2 === 1), x, z, moribeHouse ? rot : panelRot, panelBottom); continue;
      }
      // 御殿・屋敷の間仕切りは絵のある襖（買った板の戸は古びて見えるので、町屋・寺の脇の間だけに使う）
      const painted = ['goten', 'yashiki', 'shisha'].includes(layout.kind);
      if (v.paper && !painted && japanese && addNaibu(kb, 'slide_door_a', x, 0, z, panelW, ph, .06, rot)) continue;
      if (v.paper) place(g, fusuma(panelW, ph, painted), x, z, rot);
      else {
        // 板戸も障子と同じく表裏を保ち、右戸の引手だけを召合せへ向ける。
        if (moribeBoard) place(g, itado(panelW, panelH, true, i % 2 === 1), x, z, rot, panelBottom);
        else {
          const wall = new THREE.Group(); box(wall, panelW, h, .08, 0, h / 2, 0, 0x795b3b);
          place(g, wall, x, z, rot);
        }
      }
    }
  }
  // 比叡山の間仕切りの端を柱で受ける。戸口側は壁の内へ半分寄せ、開口幅を狭めない。
  
  // 戸口の上も鴨居と小壁でふさぐ（引き戸は naka_doors.js が戸口にはめる）
  if (partitions && ph < h) for (const p of layout.portals || []) {
    let l = -Infinity, r = Infinity;
    for (const v of layout.walls) {
      if (v.guideOnly || (!v.paper && !(layout.profile === 'moribe' && p.kind === 'itado')) || Math.abs(v.az - p.z) > .01 || Math.abs(v.bz - p.z) > .01) continue;
      const a = Math.min(v.ax, v.bx), b = Math.max(v.ax, v.bx);
      if (b <= p.x + .01 && b > l) l = b;
      if (a >= p.x - .01 && a < r) r = a;
    }
    if (!isFinite(l) || !isFinite(r)) continue;
    const top = new THREE.Group(), len = r - l;
    if (layout.profile === 'moribe') {
      // 引き切った戸を受ける戸当たり。固定戸の手前の二本の溝へ納める推定復元。
      // 動く戸の幅は柱の見付け七センチ・召合せの半分十二ミリ・遊び二ミリを両端から引く。
      // 同じ幅で全開時の木口を求め、その外へ一センチ空けて厚さ四センチの戸当たりを置く。
      // 柱芯の口幅で決めると、開き切った戸から約二十センチ離れてしまう。
      const movingSpan = len - 2 * (.07 + .012 + .002);
      const stopX = movingSpan + .012 + .01 + .02;
      const stopH = ph - panelY - .02;
      for (const side of [-1, 1]) {
        timberBox(top, .04, stopH, .18, side * stopX, panelY + stopH / 2, .155, 0x3a2a1c);
      }
    }
    if (layout.profile === 'moribe') groovedRail(top, len, -.035, .265, [.115, .195], true, (l + r) / 2);
    else box(top, len, .1, .12, 0, ph + .05, 0, 0x3a2a1c);
    innerNageshi(top, len, (l + r) / 2);
    upperWall(top, len, (l + r) / 2);
    const sillH = layout.profile === 'moribe' ? panelY : .04;
    if (layout.profile === 'moribe') groovedRail(top, len, -.035, .265, [.115, .195], false, (l + r) / 2);
    else box(top, len, sillH, .1, 0, sillH / 2, 0, 0x3a2a1c); // 敷居
    place(g, top, (l + r) / 2, p.z, 0);
  }
  if (['chudo', 'hondo', 'kuri', 'sobo', 'goten'].includes(layout.kind)) {
    const rs = layout.rooms, hw = Math.max(...rs.map(r => r.x1)), hd = Math.max(...rs.map(r => r.z1));
    // 森部の薬師堂は須弥壇上の二灯を使う。共通の床置き灯台まで足すと、
    // 内陣の左右の通路に、体も手もすり抜ける別の灯台が二本並んでしまう。
    // 壇上の灯明・灯芯の光と当たりは naka.js と同じ位置のまま残す。
    if (!(layout.profile === 'moribe' && layout.kind === 'hondo')) {
      for (const x of [-hw + .5, hw - .5]) {
        place(g, tomyo(layout.profile === 'moribe'), x, hd - .75); place(g, lightPool(), x, hd - .75, 0, .09);
      }
    }
    // 越前・森部の堂は張った天井の上に梁を納める。番所の見せる梁は naka.js で組む。
    if (!['echizen_ikko', 'takato', 'moribe'].includes(layout.profile)) for (const z of [-hd * .5, hd * .5]) {
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
function mainFurnishLayout(layout, h = 2.7, { partitions = true, dim = false } = {}) {
  
  // 今の山岳戦と前の比叡山で調度を共有。出入り案内が使う型の名前は変えない。
  const villageHome = false;
  const hiei = layout.profile === 'hiei' || layout.profile === 'hieizan';
  const hieiSobo = layout.profile === 'hieizan' && layout.kind === 'sobo';
  const hieiKuri = layout.profile === 'hieizan' && layout.kind === 'kuri';
  const hieiTatamiFloor = hieiSobo || hieiKuri;
  const templeAltar = layout.profile === 'inabayama' && layout.kind === 'hondo' || hiei || layout.profile === 'echizen_ikko' || layout.profile === 'iwamura_hondo' || layout.profile === 'takato' && layout.kind === 'hondo';
  const japanese = !!layout.profile && cgtOn() && cgtHas('naibu_tatami_floor_modular_a');
  const purchased = cgtOn() && cgtHas('Floor_Tatami') && !cgtHas('tatami_floor_modular_a');
  const inabaHigh = layout.profile === 'inabayama' && S.quality === 'high';
  const key = JSON.stringify([layout, h, partitions, dim, purchased, japanese, cgtOn() && cgtHas('tatami_floor_modular_a'), inabaHigh]);
  if (layoutDecor.has(key)) { const copy = layoutDecor.get(key).clone(); cacheUsers.push(new WeakRef(copy)); return copy; }
  const g = new THREE.Group(), kb = purchased || japanese ? new KitBatch() : null;
  for (const p of layout.props) {
    const part = new THREE.Group();
    const moribeStorage = layout.profile === 'moribe' && layout.kind === 'yashiki' && p.part === 'storage';
    // 神宮寺の堂は家庭用の仏壇へ替えず、下の須弥壇・本尊・灯明を使う。
    const kit = p.part === 'stove' ? bought('furnace_complete', p.w, p.h, p.d) : p.part === 'storage' && !moribeStorage ? bought('drawer_a', p.w, p.h, p.d) : p.part === 'altar' && !templeAltar ? bought('butsudan', p.w, p.h, p.d) : null;
    if (kit) part.add(kit);
    else if (p.part === 'riceBales') {
      // 既存の藁俵を室内の束へまとめる。外用の無限高の当たりは作らない。
      const rice = tawara({ heightAt: () => 0 }, 0, 0, 0,
        inabaHigh && layout.kind === 'kura' ? p.bales ?? 3 : 3, { solid: false });
      if (inabaHigh && layout.kind === 'kura') {
        // 兵糧の推定の納め方。板床へ俵を直置きせず、二本の敷木と横板で受ける。
        // 縄の下端も含む実寸で敷木へ載せ、床への埋まりと当たりからのはみ出しを防ぐ。
        // 同寸の箱・木目・材質を共有し、設営時に室内の束へまとめる。
        const baseH = .08;
        for (const x of [-p.w * .28, p.w * .28])
          box(part, .09, .05, p.d, x, .025, 0, 0x493522, 'inabaBoard');
        for (const z of [-p.d / 3, 0, p.d / 3]) {
          const board = box(part, .03, p.w, .22, 0, .065, z, 0x604831, 'inabaBoard');
          board.rotation.z = Math.PI / 2;
        }
        rice.geometry.computeBoundingBox();
        const bounds = rice.geometry.boundingBox;
        rice.scale.set(p.w / (bounds.max.x - bounds.min.x),
          (p.h - baseH) / (bounds.max.y - bounds.min.y), p.d / (bounds.max.z - bounds.min.z));
        rice.position.set(-(bounds.min.x + bounds.max.x) * rice.scale.x / 2,
          baseH - bounds.min.y * rice.scale.y, -(bounds.min.z + bounds.max.z) * rice.scale.z / 2);
      } else rice.scale.set(p.w / .75, p.h / .54, p.d / 1.64);
      part.add(rice);
    }
    else if (p.part === 'alcove') {
      if (inabaHigh) {
        // 稲葉山の主殿・山麓館の床の間。床柱・床框・落し掛けで囲い、
        // 掛物だけを壁へ貼った形にしない。全て調度の当たりの内側へ納める。
        // 全体を縦に縮めず、柱・壁の長さと上部の位置だけを天井高へ合わせる。
        // 床框の厚み、花入と掛物の形は保つ。
        const alcoveH = Math.min(p.h, h - (p.y || 0) - .045);
        // 土台の前端を床框の背面で止め、同じ面を二重に描かない。
        // 床框と落し掛けも床柱の内面へ突き付け、柱の表を横木で覆わない。
        // 外寸・床板の高さ・調度の当たりは保ち、既存の箱と材質を共有する。
        const betweenPosts = 2.06;
        box(part, 2.3, .18, .73, 0, .09, -.06, 0x604831);
        // 床の間も座敷と同じ塗り壁で納め、背面・袖壁・落し掛け上の
        // 小壁だけ単色にしない。既存の土壁の絵と材質を共有する。
        box(part, 2.3, alcoveH, .06, 0, alcoveH / 2, -.395, 0xcfc3a2, 'inabaPlaster');
        for (const x of [-1.09, 1.09]) {
          box(part, .12, alcoveH, .12, x, alcoveH / 2, .365, 0x493522, 'inabaBoard');
          box(part, .06, alcoveH, .73, x, alcoveH / 2, -.06, 0xcfc3a2, 'inabaPlaster');
        }
        // 床板・小天井・横木は長手へ木目を通す。縦の床柱と同じ絵を
        // 九十度回して共有し、板の枚数・室内の束・当たりは増やさない。
        const crossGrain = (w, h, d, y, z, color) => {
          const board = box(part, h, w, d, 0, y, z, color, 'inabaBoard');
          board.rotation.z = Math.PI / 2;
        };
        crossGrain(betweenPosts, .14, .12, .14, .365, 0x493522);  // 床框
        crossGrain(betweenPosts, .12, .12, alcoveH - .4, .365, 0x493522);  // 落し掛け
        box(part, 2.3, .34, .06, 0, alcoveH - .17, .365, 0xcfc3a2, 'inabaPlaster');
        // 床の間の内側も板敷きと小天井で納める推定。床柱の間で板を割り、
        // 床框・掛物・落し掛けに継ぎ目を重ねない。既存の束へ設営時だけまとめる。
        const innerW = betweenPosts, innerD = .67, innerZ = -.06;
        for (let j = 0; j < 3; j++) {
          const z = innerZ - innerD / 2 + (j + .5) * innerD / 3;
          crossGrain(innerW, .008, innerD / 3 - .004, .181, z,
            j % 2 ? 0x6a5038 : 0x72573d);
          crossGrain(innerW, .012, innerD / 3 - .004, alcoveH - .03, z,
            j % 2 ? 0x756046 : 0x80694d);
        }
        // 小天井の回縁も長手へ木目を通す。前後の材を通し、左右の材は
        // その内側へ突き付けて、四隅で同じ面を重ねない推定の納まり。
        // 板を受ける幅・天井高・床柱と、既存の木部の束は保つ。
        const trimW = .035, trimY = alcoveH - .05;
        for (const z of [innerZ - innerD / 2, innerZ + innerD / 2])
          crossGrain(innerW + trimW, trimW, trimW, trimY, z, 0x493522);
        for (const x of [-innerW / 2, innerW / 2]) {
          const trim = box(part, trimW, innerD - trimW, trimW,
            x, trimY, innerZ, 0x493522, 'inabaBoard');
          trim.rotation.x = Math.PI / 2;
        }
        // 主殿・山麓館の床飾りは推定。掛物の脇に薄板と素朴な花入を据え、
        // 花は少ない枝葉で表す。床板の上・床柱の内側へ収め、通路へ出さない。
        // 丸い供具と同じ形の箱・材質を共有し、設営時に既存の室内の束へまとめる。
        const vaseX = -.65, vaseZ = -.06, boardTop = .197;
        box(part, .36, .012, .28, vaseX, boardTop - .006, vaseZ, 0x493522, 'inabaBoard');
        roundVessel(part, .075, .055, .12, vaseX, boardTop + .06, vaseZ, 0x675343);
        roundVessel(part, .035, .075, .08, vaseX, boardTop + .16, vaseZ, 0x675343);
        roundVessel(part, .035, .035, .08, vaseX, boardTop + .24, vaseZ, 0x675343);
        // 口を土色の円盤で塞がず、縁と暗い内側を胴の上端へ納める。
        roundVessel(part, .041, .035, .012, vaseX, boardTop + .28, vaseZ, 0x675343);
        roundVessel(part, .029, .029, .002, vaseX, boardTop + .287, vaseZ, 0x211b15);
        const stem = box(part, .009, .38, .009, vaseX + .03, boardTop + .45, vaseZ, 0x59412b);
        stem.rotation.z = -.16;
        const twig = box(part, .008, .19, .008, vaseX - .02, boardTop + .47, vaseZ, 0x59412b);
        twig.rotation.z = .55;
        for (const [x, yy, angle] of [[.07, .58, -.7], [-.07, .54, .7], [.035, .48, -.9]]) {
          const leaf = box(part, .065, .018, .025, vaseX + x, boardTop + yy, vaseZ, 0x596044);
          leaf.rotation.z = angle;
        }
        // 掛物は縦横比を保ち、吊り紐まで落し掛けの下へ収める。
        const scrollTop = Math.min(1.9, alcoveH - .56), scrollBottom = scrollTop - 1.25;
        const scroll = bought('wall_scroll', .55, 1.25, .035);
        if (scroll) place(part, scroll, 0, -.35, 0, scrollBottom);
        else {
          box(part, .55, 1.25, .012, 0, scrollBottom + .625, -.35, 0xffffff, 'scroll');
          // 軸木・八双・吊り紐を表装の寸法へ揃え、襖の黒縁で囲まない。
          box(part, .61, .025, .025, 0, scrollBottom, -.35, 0x493522);
          box(part, .55, .016, .018, 0, scrollTop, -.35, 0x493522);
          // 掛物の紐を空中で途切れさせず、背壁へ打った折釘で受ける推定の納まり。
          // 八双の左右から中央の支点までつなぎ、釘の根元は塗り壁へ差し込む。
          // 落し掛けの下と既存の床の間の外寸に納め、箱と鉄色を使い回す。
          const cordRise = .06, cordHalf = .12;
          const cordLength = Math.hypot(cordHalf, cordRise);
          for (const side of [-1, 1]) {
            const cord = box(part, cordLength, .006, .006,
              side * cordHalf / 2, scrollTop + cordRise / 2, -.35, 0x6a5038);
            cord.rotation.z = -side * Math.atan2(cordRise, cordHalf);
          }
          box(part, .009, .009, .026, 0, scrollTop + cordRise, -.36, 0x252321);
          box(part, .009, .018, .009, 0, scrollTop + cordRise + .005, -.347, 0x252321);
        }
      } else if (japanese && addNaibu(kb, 'wall_scroll', p.x, (p.y || 0) + .8, p.z - .35 * Math.cos(p.rot || 0), .55, 1.25, .04, p.rot || 0)) {
        box(part, 2.3, .18, .85, 0, .09, 0, 0x604831);
        box(part, 2.3, 2.5, .08, 0, 1.25, -.43, 0xcfc3a2);
      } else part.add(tokonoma(2.3));
    }
    else if (p.part === 'chest') {
      const sutraBundle = inabaHigh && layout.kind === 'hondo';
      // 経箱の上の包みも登録済みの高さへ含め、内陣の当たりを広げない。
      const w = p.w ?? .85, h = (p.h ?? .7) - (sutraBundle ? .08 : 0), d = p.d ?? .7;
      // 主殿・館・遠侍・板倉・長屋と本堂の経箱はここで作る。後段に置くと共通の収納に先に拾われ、
      // 脚・箱底・被せ蓋・手掛けのある専用の作りへ到達しない。
      if (inabaHigh && ['goten', 'tamari', 'kura', 'nagaya', 'hondo'].includes(layout.kind)) {
        // 主殿・山麓館も引き出しの収納にせず、遠侍と同じ長持を据える推定。
        // 蓋箱は帯を貼った一塊で済ませず、脚・箱身・被せ蓋を
        // 分ける推定の納まり。既存の外寸と当たりの内側で組み、戸の通り道を保つ。
        const footH = Math.min(.08, h * .16);
        const lidH = Math.min(.055, h * .12), bottom = footH + .025;
        // 蓋箱の板目を面ごとに通す。無地の箱へ筋だけを足さず、
        // 身は縦板、底・蓋・底桟は長手の板目で組む推定のしつらえ。
        // 外寸内の既存の箱形と木目を使い、設営時の室内の束へまとめる。
        const crossBoard = (width, height, depth, x, y, z, alongX = true) => {
          const board = box(part, alongX ? height : width, alongX ? width : depth,
            alongX ? depth : height, x, y, z, 0x604831, 'inabaBoard');
          if (alongX) board.rotation.z = Math.PI / 2;
          else board.rotation.x = Math.PI / 2;
        };
        for (const x of [-w * .32, w * .32])
          crossBoard(.065, footH, d - .06, x, footH / 2, 0, false);
        crossBoard(w - .04, .025, d - .04, 0, footH + .0125, 0);
        const bodyH = h - lidH - bottom - .006;
        box(part, w - .04, bodyH, d - .04, 0, bottom + bodyH / 2, 0, 0x493522);
        for (const side of [-1, 1]) {
          const frontN = Math.max(2, Math.ceil((w - .04) / .24));
          const sideN = Math.max(2, Math.ceil((d - .06) / .24));
          for (let j = 0; j < frontN; j++)
            box(part, (w - .04) / frontN - .003, bodyH, .008,
              -(w - .04) / 2 + (j + .5) * (w - .04) / frontN,
              bottom + bodyH / 2, side * (d / 2 - .016), 0x604831, 'inabaBoard');
          for (let j = 0; j < sideN; j++)
            box(part, .008, bodyH, (d - .06) / sideN - .003,
              side * (w / 2 - .016), bottom + bodyH / 2,
              -(d - .06) / 2 + (j + .5) * (d - .06) / sideN, 0x604831, 'inabaBoard');
        }
        // 蓋下の暗い継ぎ目と、端板・側板の木口。箱の外へ金具を突き出さない。
        box(part, w - .025, .006, d - .025, 0, h - lidH - .003, 0, 0x211b15);
        crossBoard(w, lidH, d, 0, h - lidH / 2, 0);
        if (layout.kind === 'nagaya') {
          // 長屋の私物箱は推定の板組み。蓋の継ぎ目と反り止めの桟を付け、
          // 蓋裏の桟は箱身の内側へ納める。寝所・戸の引き先へは広げない。
          // 共通の箱・材質を設営時の束へ足し、開閉や毎コマの処理は増やさない。
          for (const z of [-d / 6, d / 6])
            box(part, w - .04, .002, .003, 0, h - .001, z, 0x493522);
          for (const x of [-w * .32, w * .32])
            box(part, .035, .025, d - .08, x, h - lidH - .0125, 0, 0x493522);
        }
        for (const x of [-w / 2 + .035, w / 2 - .035])
          for (const z of [-d / 2 + .017, d / 2 - .017])
            box(part, .025, bodyH, .008, x, bottom + bodyH / 2, z, 0x493522);
        // 手掛けは側板の表へ揃え、追加した板の内側へ埋めない。
        for (const x of [-w / 2 + .011, w / 2 - .011])
          box(part, .002, .025, Math.min(.12, d * .3), x, h * .65, 0, 0x211b15);
        if (sutraBundle) {
          // 本堂の収納を住居の長持だけで済ませず、経典を布で包んだ推定のしつらえ。
          // 蓋の上の薄板に載せ、折り返しと留め紐を外寸内へ納める。
          // 共通の箱・布色・木目を使い、設営時に既存の室内の束へまとめる。
          const bw = w * .72, bd = d * .68;
          crossBoard(bw + .025, .008, bd + .025, 0, h + .004, 0);
          box(part, bw, .05, bd, 0, h + .033, 0, 0x81735a);
          box(part, bw - .018, .004, bd * .55, 0, h + .06, bd * .18, 0x74664e);
          for (const x of [-bw * .28, bw * .28]) {
            box(part, .012, .004, bd, x, h + .064, 0, 0x5d523e);
            for (const side of [-1, 1])
              box(part, .012, .054, .004, x, h + .035, side * (bd / 2 - .002), 0x5d523e);
            box(part, .025, .008, .018, x, h + .07, .025, 0x5d523e);
          }
        }
      } else if (inabaHigh) {
        // 主殿・山麓館の蓋箱も、後段の到達しない分岐へ置かずここで作る。
        // 底桟・身・被せ蓋と鉄の金具を推定し、既存の木目と箱形を共有する。
        // 取っ手まで当たりの内側へ収め、縁側の障子の引き先を空ける。
        const wood = 'inabaBoard', iron = 0x252321;
        const lidH = Math.min(.07, h * .14), bottom = .04, lidY = h - lidH;
        for (const x of [-w * .32, w * .32])
          box(part, .06, bottom, d - .04, x, bottom / 2, 0, 0x3a2a1c, wood);
        box(part, w - .02, lidY - bottom - .004, d - .02,
          0, (bottom + lidY - .004) / 2, 0, 0x503923, wood);
        // 蓋の合わせ目には暗い内蓋を残し、中まで透ける隙間にしない。
        box(part, w - .04, .008, d - .04, 0, lidY, 0, 0x2e2218);
        box(part, w - .008, lidH, d - .008, 0, h - lidH / 2, 0, 0x604831, wood);
        for (const x of [-w * .32, w * .32]) {
          box(part, .025, .003, d - .012, x, h - .0015, 0, iron);
          for (const side of [-1, 1]) {
            const z = side * (d / 2 - .003);
            box(part, .025, h - bottom - .012, .006,
              x, (h + bottom) / 2 - .006, z, iron);
            for (const y of [bottom + .04, h - .025])
              box(part, .009, .009, .002, x, y, side * (d / 2 - .001), 0x494740);
          }
        }
        // 正面の掛金。両脇の持ち手は板へ埋めず、座金と下がった輪で納める。
        box(part, .035, .1, .006, 0, lidY - .02, d / 2 - .003, iron);
        for (const side of [-1, 1]) {
          const x = side * (w / 2 - .003), y = h * .55;
          for (const z of [-d * .12, d * .12]) {
            box(part, .006, .035, .035, x, y, z, iron);
            box(part, .006, .055, .012, x, y - .025, z, iron);
          }
          box(part, .006, .012, d * .24 + .012, x, y - .0525, 0, iron);
        }

      } else {
        if (japanese && addNaibu(kb, 'drawer_a', p.x, p.y || 0, p.z, w, h, d, p.rot || 0)) continue;
        box(part, w, h, d, 0, h / 2, 0, 0x503923);
        for (const yy of [.23, .48]) box(part, w - .06, .02, .03, 0, yy, d / 2, 0x252321);
      }
    }
    else if (p.part === 'documentShelf' && inabaHigh) {
      // 主殿・山麓館の文書棚。素木の柱・貫・棚板で組む推定のしつらえ。
      // 共通の箱と木目を共有し、文書も棚の外寸内へ納めて室内の束にまとめる。
      const post = .04, shelf = .025;
      for (const x of [-(p.w - post) / 2, (p.w - post) / 2]) {
        for (const z of [-(p.d - post) / 2, (p.d - post) / 2])
          doorTimber(part, post, p.h, post, x, p.h / 2, z, 0x795b3b, true);
        doorTimber(part, post, .055, p.d - post * 2,
          x, .12, 0, 0x604831, true);
      }
      for (const y of [.18, .6, p.h - shelf / 2]) {
        doorTimber(part, p.w - post * 2, shelf, p.d,
          0, y, 0, 0x795b3b, true);
        // 棚板を背面の貫だけで受けず、前後の桟と左右の受け桟を四本の柱へ納める推定。
        // 桟の上端は棚板の下面へ合わせ、文書の置き場と棚の外寸は保つ。
        // 左右の桟は長手へ木目を回し、既存の箱・材質と室内の束を使い回す。
        for (const z of [-(p.d - post) / 2, (p.d - post) / 2])
          doorTimber(part, p.w - post * 2, .055, post,
            0, y - .04, z, 0x604831, true);
        for (const x of [-(p.w - post) / 2, (p.w - post) / 2]) {
          const rail = doorTimber(part, p.d - post * 2, .055, post,
            x, y - .04, 0, 0x604831, true);
          rail.rotation.y = Math.PI / 2;
        }
      }
      // 文書は文字を描かず、包紙と結び紐で表す。棚の前へ張り出さない。
      for (const y of [.18, .6]) for (const side of [-1, 1]) {
        const x = side * p.w * .23, base = y + shelf / 2;
        box(part, p.w * .34, .065, p.d * .65,
          x, base + .0325, 0, 0xb9ac8c);
        box(part, .012, .003, p.d * .65,
          x, base + .0665, 0, 0x65563e);
      }
    }
    else if (p.part === 'spearRack') {
      // 短槍を立て掛ける台。足・受け桟・柄・穂先を共通の箱で組み、設営時に束へまとめる。
      // 上げ床と梁下の余白を取り、穂先を天井へ突き抜けさせない。
      const height = Math.min(p.h, h - (p.y || 0) - .28);
      for (const x of [-p.w * .4, p.w * .4]) {
        const foot = doorTimber(part, .065, .08, p.d, x, .04, 0, 0x3a2a1c, inabaHigh);
        if (inabaHigh) {
          // 足の長手にも木目を通し、柱の木口だけで台を支えない納まりにする。
          foot.geometry = shape(.065, p.d, .08); foot.rotation.x = Math.PI / 2;
        }
        doorTimber(part, .055, height * .65, .055, x, height * .325, -.08, 0x604831, inabaHigh);
        if (inabaHigh) {
          // 番所・長屋・遠侍の槍掛けは、足へ支柱を立てるだけにせず控えで受ける推定。
          // 足の前端と支柱をつなぎ、槍を受ける横桟の下へ納める。
          // 台の外寸内で共通の角材・板目を使い、通路の当たりや毎コマの処理は増やさない。
          const footZ = p.d / 2 - .04, postZ = -.06;
          const bottom = .08, top = height * .22;
          const rise = top - bottom, run = postZ - footZ;
          const brace = doorTimber(part, .035, Math.hypot(rise, run), .035,
            x, (bottom + top) / 2, (footZ + postZ) / 2, 0x604831, true);
          brace.rotation.x = Math.atan2(run, rise);
        }
      }
      for (const yy of [.14, height * .6])
        doorTimber(part, p.w, .065, .08, 0, yy, -.04, 0x493522, inabaHigh);
      for (const x of [-p.w * .25, 0, p.w * .25]) {
        if (inabaHigh) {
          // 番所・長屋の槍掛けは柄を横桟の前に浮かせず、切欠きの受けへ納める推定。
          // 左右の爪で柄を挟み、下の枕で石突を受ける。元の台の外寸へ収め、
          // 共通の箱と材質を設営時の束へ足す。槍の高さと通路の当たりは保つ。
          for (const side of [-1, 1])
            box(part, .018, .045, .12, x + side * .024,
              height * .6, .02, 0x493522);
          box(part, .066, .03, .07, x, .065, .035, 0x493522);
        }
        if (inabaHigh) {
          // 室内の武具を四角い棒と傾いた金属片で済ませず、丸い柄と鎬のある穂へ。
          // 同じ台の外寸・梁下へ収め、形は三本と各建物で共有する推定のしつらえ。
          roundVessel(part, .0125, .0125, height - .24,
            x, (height - .24) / 2 + .08, .035, 0x604831);
          roundVessel(part, .02, .02, .08, x, height - .2, .035, 0x252321);
          const key = '稲葉山の武具掛けの槍穂';
          if (!shapes.has(key)) shapes.set(key,
            new THREE.ConeGeometry(1, 1, 4).rotateY(Math.PI / 4));
          const blade = new THREE.Mesh(shapes.get(key), mat(0x9a9a9e));
          cacheUsers.push(new WeakRef(blade));
          blade.scale.set(.045 / Math.SQRT2, .16, .016 / Math.SQRT2);
          blade.position.set(x, height - .08, .035); part.add(blade);
        } else {
          box(part, .025, height - .24, .025, x, (height - .24) / 2 + .08, .035, 0x604831);
          box(part, .04, .08, .04, x, height - .2, .035, 0x252321);
          const blade = box(part, .045, .16, .016, x, height - .08, .035, 0x9a9a9e);
          blade.rotation.z = Math.PI / 12;
        }
      }
    }
    else if (p.part === 'hearth') {
      if (japanese && addNaibu(kb, 'furnace', p.x, 0, p.z, p.w, .18, p.d)) {
        addNaibu(kb, 'kettle_low', p.x, .18, p.z, .35, .25, .35);
      } else {
        box(part, p.w, .12, p.d, 0, .06, 0, 0x493022);
        box(part, p.w - .18, .025, p.d - .18, 0, .13, 0, 0x211b17);
        box(part, .35, .25, .35, 0, .3, 0, 0x292723);
      }
      place(part, lightPool(), 0, 0, 0, .2);
    }
    else if (p.part === 'ammo' && layout.profile === 'yagura' && japanese && addNaibu(kb, 'drawer_a', p.x, p.y || 0, p.z, p.w ?? .85, p.h ?? .55, p.d ?? .7)) {
      // 矢の束と弾の箱。棚の上の矢は軽い共通の形。
      for (let q = 0; q < 5; q++) box(part, .018, .02, (p.d ?? .7) - .05, (q - 2) * .07, (p.h ?? .55) + .04, 0, 0x9b8057);
    }
    else if (p.part === 'bedding') {
      if (inabaHigh) {
      if (inabaHigh && layout.kind === 'nagaya') {
        // 長屋の寝所は薄い敷物と木枕の推定復元。厚い一枚板や現代の枕に見せない。
        // 藺草の絵・箱・材質を共有し、既存の寝具の範囲と高さの中へ納める。
        // 無地の帯を表へ重ねず、番所・本堂と同じ薄縁で布縁と草の木口を納める。
        inabaUsuberi(part, p.w, p.d, 0, 0, 0);
        const headZ = -p.d / 2 + .15;
        // 木枕の脚は薄縁の表から天板裏まで通し、浮いた角材にしない。
        // 天板は横目、脚は縦目にして、既存の木部の絵と束を共有する。
        const matTop = .01, pillowBottom = .0875;
        doorTimber(part, p.w * .44, .025, .16, 0, .1, headZ, 0x6a5038, true);
        for (const x of [-p.w * .15, p.w * .15])
          box(part, .035, pillowBottom - matTop, .14,
            x, (matTop + pillowBottom) / 2, headZ, 0x493522, 'inabaBoard');
        // 足元に畳んだ掛け布を添える推定の寝支度。敷物・木枕と別の布として
        // 折り返しと縫い端を見せ、既存の寝具の外寸・高さへ納める。
        // 共通の箱と材質を室内の束へまとめ、通路や毎コマの処理は増やさない。
        const clothW = p.w - .12, clothD = Math.min(.42, p.d * .3);
        const footZ = p.d / 2 - clothD / 2 - .07;
        // 掛け布の下面を薄縁へ載せ、折った層と縫い端も隙間なく重ねる。
        // 寝具の外寸・当たりを保ち、箱の枚数や毎コマの処理は増やさない。
        const layerH = .014, clothTop = matTop + layerH * 3;
        for (let j = 0; j < 3; j++)
          box(part, clothW - j * .012, layerH, clothD - j * .016,
            0, matTop + (j + .5) * layerH, footZ + j * .008,
            j % 2 ? 0x74664e : 0x81735a);
        for (const x of [-clothW / 2 + .025, clothW / 2 - .025])
          box(part, .012, .004, clothD - .04, x, clothTop + .002, footZ + .016, 0x5d523e);
        box(part, clothW - .06, .004, .012, 0, clothTop + .002,
          footZ - clothD / 2 + .04, 0x5d523e);
      } else {
        box(part, p.w, .06, p.d, 0, .03, 0, 0x958669);
        box(part, p.w * .8, .12, .22, 0, .09, -p.d / 2 + .15, 0x6a5e48);
      }
    
      } else {
      box(part, p.w, .06, p.d, 0, .03, 0, 0x958669);
      box(part, p.w * .8, .12, .22, 0, .09, -p.d / 2 + .15, 0x6a5e48);
    
      }
    }
    else if (p.part === 'offering') {
      if (inabaHigh) {
      if (inabaHigh && layout.kind === 'shrine') {
        // 小祠の供物は白い立方体で済ませず、三方と皿に載せる推定のしつらえ。
        // 台と供具を既存の当たりの高さ・奥行きへ収め、格子戸の引き先は空ける。
        // 神前の奥に閉じた厨子を置く推定。御神体は見せず、供物台は元の高さを保つ。
        // 台と同じ外寸内へ納め、間取りの高さにも厨子の上端を含める。
        const shrineTop = p.h, shrineBottom = .85, shrineW = .7, shrineD = .12;
        const shrineZ = -p.d / 2 + shrineD / 2;
        for (const x of [-shrineW / 2 + .025, shrineW / 2 - .025])
          box(part, .05, shrineBottom, shrineD, x, shrineBottom / 2, shrineZ, 0x59412b);
        box(part, shrineW + .08, .05, shrineD + .04, 0, shrineBottom + .025, shrineZ, 0x59412b);
        box(part, shrineW, shrineTop - shrineBottom - .1, shrineD,
          0, (shrineBottom + shrineTop) / 2, shrineZ, 0x493522);
        for (const x of [-shrineW / 4, shrineW / 4]) {
          box(part, shrineW / 2 - .012, shrineTop - shrineBottom - .18, .025,
            x, (shrineBottom + shrineTop) / 2, shrineZ + shrineD / 2, 0x785b3c);
          box(part, .018, .045, .012, x * .18, shrineBottom + .35,
            shrineZ + shrineD / 2 + .018, 0x39352d);
        }
        box(part, shrineW + .1, .05, shrineD + .06, 0, shrineTop - .025, shrineZ, 0x59412b);
        const offeringH = .65, tableY = offeringH * .7, tableH = .04;
        box(part, p.w, tableH, p.d, 0, tableY - tableH / 2, 0, 0x785b3c);
        for (const x of [-p.w * .34, p.w * .34]) {
          for (const z of [-p.d * .28, p.d * .28])
            box(part, .045, tableY - tableH, .045, x, (tableY - tableH) / 2, z, 0x59412b);
          box(part, .06, .025, p.d * .8, x, .025, 0, 0x59412b);
        }
        const trayY = offeringH - .07, footH = trayY - tableY - .025;
        // 三方の脚は二本の棒で済ませず、三面を抜いた箱状に組む推定。
        // 穴は黒い絵を貼らず、上下の板と左右の縁で実際に空ける。
        // 台・皿の外寸内で既存の箱と材質を共有し、毎コマの処理は増やさない。
        const footW = .19, footD = .17, boardT = .012;
        const rimH = footH * .25, holeW = .075;
        const footBoard = (width, x, z, side = false) => {
          const edgeW = (width - holeW) / 2;
          for (const yy of [tableY + rimH / 2, tableY + footH - rimH / 2])
            box(part, side ? boardT : width, rimH, side ? width : boardT,
              x, yy, z, 0xa58d66);
          for (const sign of [-1, 1])
            box(part, side ? boardT : edgeW, footH - rimH * 2, side ? edgeW : boardT,
              x + (side ? 0 : sign * (holeW + edgeW) / 2), tableY + footH / 2,
              z + (side ? sign * (holeW + edgeW) / 2 : 0), 0xa58d66);
        };
        footBoard(footW, 0, footD / 2 - boardT / 2);
        for (const sign of [-1, 1])
          footBoard(footD - boardT * 2, sign * (footW / 2 - boardT / 2), 0, true);
        box(part, footW, footH, boardT,
          0, tableY + footH / 2, -footD / 2 + boardT / 2, 0xa58d66);
        box(part, .24, .025, .22, 0, trayY - .0125, 0, 0xc1aa80);
        for (const z of [-.105, .105]) box(part, .24, .02, .01, 0, trayY + .01, z, 0xa58d66);
        for (const x of [-.115, .115]) box(part, .01, .02, .2, x, trayY + .01, 0, 0xa58d66);
        roundVessel(part, .075, .06, .015, 0, trayY + .0275, 0, 0xd8d0bd);
        roundVessel(part, .015, .045, .035, 0, trayY + .0525, 0, 0xe1d6bb);
      } else {
        box(part, p.w, .08, p.d, 0, p.h - .04, 0, 0x785b3c);
        for (const x of [-.4, .4]) box(part, .07, p.h, .07, x, p.h / 2, 0, 0x59412b);
        box(part, .18, .18, .18, 0, p.h + .09, 0, 0xd8d0bd);
      }
    
      } else {
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
        // 線香は角棒でなく丸い軸にし、下端を灰へ差し込む。
        // 全堂で形・材質を共有し、既存の前卓のまとめ描きへ含める。
        if (!shapes.has('hieiOfferingIncense')) shapes.set('hieiOfferingIncense',
          new THREE.CylinderGeometry(.0045, .0045, .12, 8));
        for (const x of [-.035, .035]) {
          const incense = new THREE.Mesh(shapes.get('hieiOfferingIncense'), mat(0x493526));
          cacheUsers.push(new WeakRef(incense));
          incense.position.set(x, top + .215, 0); part.add(incense);
        }
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
        // 燭台は球の積み重ねにせず、平らな足・竿・受け皿を連続した断面で作る。
        // 蝋燭の上面は芯へ向かってくぼませ、皿へ底を据える。個別の遺品の復元ではない。
        // 外寸・火先・当たりを保ち、形は全堂で共有して設営時だけまとめる。
        if (!shapes.has('hieiOfferingCandlestick')) shapes.set('hieiOfferingCandlestick', new THREE.LatheGeometry([
          new THREE.Vector2(0, 0), new THREE.Vector2(.065, 0),
          new THREE.Vector2(.075, .008), new THREE.Vector2(.075, .018),
          new THREE.Vector2(.055, .03), new THREE.Vector2(.025, .04),
          new THREE.Vector2(.0175, .055), new THREE.Vector2(.012, .145),
          new THREE.Vector2(.02, .17), new THREE.Vector2(.05, .173),
          new THREE.Vector2(.05, .188), new THREE.Vector2(.041, .188),
          new THREE.Vector2(.037, .18), new THREE.Vector2(0, .18),
        ], 12));
        if (!shapes.has('hieiOfferingCandle')) shapes.set('hieiOfferingCandle', new THREE.LatheGeometry([
          new THREE.Vector2(0, 0), new THREE.Vector2(.0125, 0),
          new THREE.Vector2(.013, .05), new THREE.Vector2(.0125, .065),
          new THREE.Vector2(.008, .065), new THREE.Vector2(.004, .06),
          new THREE.Vector2(0, .06),
        ], 12));
        for (const [key, cy, color] of [
          ['hieiOfferingCandlestick', top, 0x79613b],
          ['hieiOfferingCandle', top + .18, 0xd8c9a2],
        ]) {
          const mesh = new THREE.Mesh(shapes.get(key), mat(color));
          cacheUsers.push(new WeakRef(mesh)); mesh.position.set(candleX, cy, 0); part.add(mesh);
        }
        // 灯芯の下端をくぼんだ蝋へ差し、元の火先までつなぐ。
        box(part, .004, .018, .004, candleX, top + .249, 0, 0x493526);
        // 油皿と同じ火の材質を使う。別の木色として扱うと、暗さの処理と
        // この戦の材質変換で炎まで暗くなる。光源・描画の束は増やさない。
        altarOval(part, .014, .022, .014, candleX, top + .264, 0xffd08b);
      }
    
      }
    }
    else if (inabaHigh && p.part === 'raiban') {
      // 礼盤は上下框を四隅の束でつなぎ、羽目板を内側へ控える推定の木組み。
      // 一枚の箱で腰を埋めず、正面・側面とも框と板の見込みを分ける。
      // 寸法と上端は間取りの当たりと共有し、設営時に既存の束へ結合する。
      const frameH = .04, matH = .025, top = p.h - matH;
      const postW = .045, bodyH = top - frameH * 2, bodyY = top / 2;
      // 上下を厚い一枚板で済ませず、四周の框と内側の受け板へ分ける推定。
      // 前後の框は横木目、側框は前後の木目にし、隅で材を重ねない。
      // 座面の畳・外寸・当たりを保ち、既存の木目と箱を使い回す。
      for (const yy of [frameH / 2, top - frameH / 2]) {
        for (const side of [-1, 1]) {
          doorTimber(part, p.w, frameH, postW, 0, yy,
            side * (p.d - postW) / 2, 0x24170f, true);
          const rail = box(part, postW, p.d - postW * 2, frameH,
            side * (p.w - postW) / 2, yy, 0, 0x24170f, 'inabaBoard');
          rail.rotation.x = Math.PI / 2;
        }
        const support = box(part, .012, p.w - postW * 2, p.d - postW * 2,
          0, yy + (frameH - .012) / 2, 0, 0x3a2417, 'inabaBoard');
        support.rotation.z = Math.PI / 2;
      }
      for (const x of [-p.w / 2 + postW / 2, p.w / 2 - postW / 2])
        for (const z of [-p.d / 2 + postW / 2, p.d / 2 - postW / 2])
          box(part, postW, bodyH, postW, x, bodyY, z, 0x24170f, 'inabaBoard');
      // 腰の羽目板は縦板を框の内側へ納め、細い目地の奥を下地で受ける。
      // 板割りは設営時だけ作り、内陣の通路や毎コマの処理を増やさない。
      for (const side of [-1, 1]) {
        box(part, p.w - postW * 2, bodyH, .018,
          0, bodyY, side * (p.d / 2 - .035), 0x3a2417);
        box(part, .018, bodyH, p.d - postW * 2,
          side * (p.w / 2 - .035), bodyY, 0, 0x3a2417);
        const frontW = (p.w - postW * 2) / 3, sideD = (p.d - postW * 2) / 2;
        for (let j = 0; j < 3; j++)
          box(part, frontW - .003, bodyH, .006,
            -p.w / 2 + postW + (j + .5) * frontW, bodyY,
            side * (p.d / 2 - .023), 0x49301c, 'inabaBoard');
        for (let j = 0; j < 2; j++) {
          const board = box(part, sideD - .003, bodyH, .006,
            side * (p.w / 2 - .023), bodyY,
            -p.d / 2 + postW + (j + .5) * sideD, 0x49301c, 'inabaBoard');
          board.rotation.y = Math.PI / 2;
        }
      }
      // 礼盤の座面も共通の畳表・布縁・短辺の折り返しで納める推定。
      // 幅の長い座面に合わせて回し、布縁を長辺へ通す。
      // 厚みだけを既存の二・五センチへ合わせ、台の外寸と当たりを保つ。
      const seat = hieiTatami(p.d - .04, p.w - .04, true);
      seat.scale.y = matH / .06;
      seat.rotation.y = Math.PI / 2;
      seat.position.y = top;
      part.add(seat);
    }
    else if (p.part === 'sutraDesk') {
      // 内陣の低い経机と折本の経典。個別の調度は不明なので推定とし、
      // 絵と当たりを同じ寸法へ収める。箱・材質は既存の束で使い回す。
      // 本堂の折本は机高に比例させず四センチ厚にする推定。
      // 礼盤前の高い机でも経典が十九センチ厚にならないよう、
      // 登録した総高から本の厚さを引いて天板・脚・貫を一緒に納める。
      const fittedBook = inabaHigh && layout.kind === 'hondo';
      const bookH = fittedBook ? Math.min(.04, p.h * .28) : p.h * .28;
      const topY = fittedBook ? p.h - bookH : p.h * .72, topH = .035;
      const cleatH = inabaHigh && layout.kind === 'hondo' ? .025 : 0;
      if (inabaHigh && layout.kind === 'hondo') {
        // 経机の天板も長手の板目と板継ぎで納める推定。目地の奥は下板で受ける。
        // 本と合わせた総高・外寸を保ち、既存の木部の絵と束へまとめる。
        const boards = Math.max(2, Math.ceil(p.d / .24)), depth = p.d / boards;
        doorTimber(part, p.w, .006, p.d, 0, topY - topH + .003, 0, 0x24170f, true);
        for (let j = 0; j < boards; j++)
          doorTimber(part, p.w, topH - .006, depth - .002, 0,
            topY - (topH - .006) / 2, -p.d / 2 + (j + .5) * depth,
            j % 2 ? 0x493522 : 0x3a2417, true);
        // 寄せた天板は左右の受け桟で束ね、四本の脚から支える推定の納まり。
        // 桟の長手を板継ぎと直交させ、天板裏へ接する。既存の木部を共有する。
        for (const x of [-p.w * .36, p.w * .36]) {
          const cleat = doorTimber(part, p.d * .8, cleatH, .055,
            x, topY - topH - cleatH / 2, 0, 0x493522, true);
          cleat.rotation.y = Math.PI / 2;
        }
      } else box(part, p.w, topH, p.d, 0, topY - topH / 2, 0, 0x3a2417);
      if (inabaHigh && layout.kind === 'hondo') {
        // 本堂の経机は平らな文机と分け、左右の筆返しと天板下の幕板を補う推定。
        // 折本・磬子の置き場を空け、既存の外寸と高さの内側で納める。
        // 箱と材質は共有し、設営時にほかの仏具と同じ束へまとめる。
        const returnH = Math.min(.05, (p.h - topY) * .45);
        for (const side of [-1, 1]) {
          // 垂直な板と蓋の角をなくし、天板から先へ反り上がる筆返しにする推定。
          // 三段の傾きで曲面を近似し、端も机の幅・登録済みの高さへ収める。
          // 左右とも共通の箱と木目を使い、設営時の仏具の束へ結合する。
          const run = Math.min(.065, p.w * .1), rise = returnH - .009;
          for (let j = 0; j < 3; j++) {
            const a = j / 3, b = (j + 1) / 3;
            const ax = side * (p.w / 2 - .012 - run * (1 - a));
            const bx = side * (p.w / 2 - .012 - run * (1 - b));
            const ay = topY + .003 + rise * a * a;
            const by = topY + .003 + rise * b * b;
            const lip = box(part, Math.hypot(bx - ax, by - ay) + .001, .012, p.d - .02,
              (ax + bx) / 2, (ay + by) / 2, 0, 0x493522, 'inabaBoard');
            lip.rotation.z = Math.atan2(by - ay, bx - ax);
          }
        }
        // 幕板の端を脚間で浮かせず、脚芯から五ミリ差し込む推定の仕口。
        // 上端も受け桟の下面へ下げ、撥脚の上部と実際につなぐ。
        // 既存の箱を寸法変更するだけにし、机の外寸と当たりは保つ。
        const apronH = .045, apronTop = topY - topH - cleatH;
        for (const z of [-p.d * .32, p.d * .32])
          box(part, p.w * .72 + .01, apronH, .025,
            0, apronTop - apronH / 2, z, 0x493522);
      }
      for (const x of [-p.w * .36, p.w * .36]) {
        if (inabaHigh && layout.kind === 'hondo') {
          // 経机の脚は文机と同じ直線の角材にせず、裾を開いた撥脚の推定形にする。
          // 二段の材を傾けてつなぎ、既存の机の外寸と足元の横木の内側へ収める。
          // 共通の箱・木の材質を設営時に束ね、当たりと通路は変えない。
          const legTop = topY - topH - cleatH, kneeY = legTop * .45, footY = .05;
          const kneeX = x + Math.sign(x) * .012, footX = x + Math.sign(x) * .045;
          for (const z of [-p.d * .32, p.d * .32]) {
            for (const [ax, ay, bx, by] of [
              [x, legTop, kneeX, kneeY], [kneeX, kneeY, footX, footY],
            ]) {
              const leg = box(part, .04, Math.hypot(bx - ax, by - ay), .045,
                (ax + bx) / 2, (ay + by) / 2, z, 0x493522, 'inabaBoard');
              leg.rotation.z = -Math.atan2(bx - ax, by - ay);
            }
          }
        } else for (const z of [-p.d * .32, p.d * .32])
          box(part, .045, topY - topH, .045, x, (topY - topH) / 2, z, 0x493522);
        const spreadFoot = inabaHigh && layout.kind === 'hondo';
        if (spreadFoot) {
          // 足元の横木を板床から立ち上げ、五センチ高の脚端を受ける。
          // 従来の下面二センチの浮きをなくし、脚と横木の長手へ木目を通す。
          // 寸法は経机の当たりの内側に保ち、既存の形・材質へまとめる。
          const foot = doorTimber(part, p.d * .8, .05, .14,
            x + Math.sign(x) * .02, .025, 0, 0x493522, true);
          foot.rotation.y = Math.PI / 2;
        } else box(part, .055, .03, p.d * .8, x, .035, 0, 0x493522);
      }
      if (inabaHigh && layout.kind === 'hondo') {
        // 中央の貫が四本の脚の間で浮いていたため、左右の脚をつなぐ足貫で受ける。
        // 撥脚の傾きから接合位置を取り、木口を五ミリ差し込む推定の木組み。
        const braceY = topY * .4, legTop = topY - topH - cleatH, kneeY = legTop * .45;
        const spread = braceY >= kneeY
          ? .012 * (legTop - braceY) / (legTop - kneeY)
          : .012 + .033 * (kneeY - braceY) / (kneeY - .05);
        const braceX = p.w * .36 + spread;
        for (const side of [-1, 1]) {
          const rail = doorTimber(part, p.d * .64 + .01, .035, .04,
            side * braceX, braceY, 0, 0x493522, true);
          rail.rotation.y = Math.PI / 2;
        }
        doorTimber(part, braceX * 2 + .01, .035, .04,
          0, braceY, 0, 0x493522, true);
      } else box(part, p.w * .72, .035, .04, 0, topY * .4, 0, 0x493522);
      const bookW = p.w * .48, bookD = p.d * .64;
      if (inabaHigh && layout.kind === 'hondo') {
        // 折本は厚い一塊にせず、交互に折り返す紙と小口の陰を組む。
        // 表紙の内側へ収め、既存の箱・紙色を設営時の束へまとめる。
        const bottom = topY + .006, pitch = (bookH - .012) / 6;
        const paperH = Math.min(.003, pitch / 4);
        for (let j = 0; j < 6; j++) {
          const low = bottom + j * pitch, high = low + pitch;
          for (const yy of [low + paperH / 2, high - paperH / 2])
            box(part, bookW, paperH, bookD, 0, yy, 0, 0xd8d0bd);
          const foldZ = (j % 2 ? -1 : 1) * (bookD / 2 - paperH / 2);
          box(part, bookW, pitch, paperH, 0, (low + high) / 2, foldZ, 0xc9c0a9);
        }
      } else box(part, bookW, bookH - .012, bookD, 0, topY + bookH / 2, 0, 0xd8d0bd);
      for (const yy of [topY + .003, p.h - .003])
        box(part, bookW + .02, .006, bookD + .02, 0, yy, 0, 0x515c52);
      // 折り重なった紙の小口。文字や新しい絵は足さない。
      for (let j = 1; j < 4 && !(inabaHigh && layout.kind === 'hondo'); j++)
        box(part, bookW, .002, .004, 0, topY + bookH * j / 4, bookD / 2, 0x9b927b);
      if (inabaHigh && layout.kind === 'hondo') {
        // 経机の手前に僧が座る薄縁を敷く推定のしつらえ。
        // 床の飾りとして束ね、歩行や兵の道案内を塞ぐ調度にはしない。
        // 内陣と格子戸の引き先を確かめ、狭い堂では敷物をはみ出させない。
        const seatW = .75, seatD = .7, seatZ = p.d / 2 + .1 + seatD / 2;
        const x0 = p.x - seatW / 2, x1 = p.x + seatW / 2;
        const z0 = p.z + seatZ - seatD / 2, z1 = p.z + seatZ + seatD / 2;
        const inside = layout.rooms.some(r => r.name === '内陣'
          && x0 > r.x0 + .15 && x1 < r.x1 - .15
          && z0 > r.z0 + .15 && z1 < r.z1 - .15);
        const clear = !layout.portals.some(v => x1 > v.x - 2.15 && x0 < v.x + 2.15
          && z1 > v.z - .22 && z0 < v.z + .22)
          && !layout.props.some(v => v !== p && x1 > v.x - v.w / 2
            && x0 < v.x + v.w / 2 && z1 > v.z - v.d / 2 && z0 < v.z + v.d / 2);
        if (inside && clear && !p.rot) {
          // 外陣と同じ薄縁を使い、布縁の織り目・縫い目と藺草の折り返しを揃える。
          // 厚い座布団状の縁や木口の横線を重ねず、上げ床に薄く敷く。
          // 共通の形と材質を使い、置き場・戸の通り道・床の当たりは保つ。
          inabaUsuberi(part, seatW, seatD, 0, 0, seatZ);
        }
        // 常在寺の個別の仏具は不明。読経の磬子と木の撞木を添える推定のしつらえ。
        // 経典の両脇に納め、机の既存の外寸・高さと内陣の通路は保つ。
        const bellX = p.w * .36, radius = Math.min(p.w * .08, p.d * .18);
        const cushionH = bookH * .18, bellH = bookH * .62;
        box(part, radius * 2.2, cushionH, radius * 2.2,
          bellX, topY + cushionH / 2, 0, 0x515c52);
        // 口を黒い円盤で塞がず、厚い口縁から底へ続く内面を持たせる。
        // 外側と内側の二つの共通形を設営時だけ拡縮し、既存の材質の束へまとめる。
        // 座布団・当たり・机上の外寸と高さは保つ。
        for (const inside of [false, true]) {
          const key = inside ? '磬子の内面' : '磬子の外面';
          if (!shapes.has(key)) {
            const profile = inside
              ? [[.83, 1], [.78, .35], [.5, .18], [0, .18]]
              : [[0, 0], [.62, 0], [.88, .3], [1, .8], [1, 1], [.83, 1]];
            shapes.set(key, new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 12));
          }
          const bell = new THREE.Mesh(shapes.get(key), mat(inside ? 0x29231b : 0x79653d));
          cacheUsers.push(new WeakRef(bell));
          bell.scale.set(radius, bellH, radius);
          bell.position.set(bellX, topY + cushionH, 0); part.add(bell);
        }
        box(part, radius * 1.8, .018, .022,
          -bellX, topY + .009, 0, 0x9b8057);
        box(part, radius * .48, .028, .032,
          -bellX - radius * .66, topY + .014, 0, 0x493522);
      }
    }
    else if (p.part === 'desk') {
      if (inabaHigh) {
      if (inabaHigh) {
        // 主殿・館と番所の文机は、低い天板と脚・足固めに硯箱と紙を添える推定。
        // 筆記具まで含めて既存の当たりの高さへ収め、下の縮尺で机全体を揃える。
        // 天板は三枚の板を寄せる推定の納まり。板目を天板の長手へ通し、
        // 継ぎ目の下には暗い面を残す。既存の板目・箱を設営時の束で使い回す。
        box(part, 1.2, .008, .7, 0, .334, 0, 0x2e2218);
        const boardD = .7 / 3;
        for (let j = 0; j < 3; j++) {
          const plank = box(part, .05, 1.2, boardD - .003,
            0, .355, -.35 + (j + .5) * boardD,
            j === 1 ? 0x604831 : 0x59412b, 'inabaBoard');
          plank.rotation.z = Math.PI / 2;
        }
        for (const x of [-.48, .48]) {
          // 寄せた天板を脚の木口だけで受けず、脚間の吸付き桟で支える推定。
          // 天板の下面へ接し、紙・硯・机の外寸には触れない。
          // 長手の木目は足固めと同じ向きにし、既存の束へまとめる。
          const cleat = box(part, .09, .58, .045, x, .3075, 0, 0x493022, 'inabaBoard');
          cleat.rotation.x = Math.PI / 2;
          // 足固めは回転後の厚さ三十五ミリで床へ据える。
          // 脚を床まで突き通さず、足固めへ五ミリ差して吸付き桟まで立てる推定。
          // 文机を部屋ごとの実寸へ縮めても、畳・板間と足元の間を空けない。
          const footH = .035, legBottom = footH - .005, legTop = .285;
          for (const z of [-.24, .24])
            box(part, .065, legTop - legBottom, .065, x, (legBottom + legTop) / 2, z, 0x493022, 'inabaBoard');
          const foot = box(part, .08, .58, footH, x, footH / 2, 0, 0x3a2417, 'inabaBoard');
          foot.rotation.x = Math.PI / 2;
        }
        const tie = box(part, .04, .96, .04, 0, .13, -.24, 0x3a2417, 'inabaBoard');
        tie.rotation.z = Math.PI / 2;
        // 白紙は文字を描かず、小口と文鎮で紙の重なりを表す。
        box(part, .46, .012, .38, -.2, .386, .015, 0xd8d0bd);
        box(part, .44, .003, .36, -.19, .3935, .02, 0xe1d6bb);
        box(part, .3, .018, .025, -.19, .404, -.12, 0x39352d);
        box(part, .24, .035, .3, .32, .3975, 0, 0x2a1810);
        // 硯の陸と墨池を浅い縁で囲む。筆は箱の内側に横たえ、机の外へ出さない。
        box(part, .16, .012, .21, .32, .421, 0, 0x494740);
        box(part, .12, .004, .07, .32, .429, -.055, 0x171b19);
        for (const x of [.23, .41]) box(part, .012, .02, .24, x, .425, 0, 0x252321);
        // 稲葉山の文机は硯だけにせず、磨る墨と水滴、筆を受ける筆架を添える推定。
        // 箱の共通形と既存の色を使い、全て天板上・調度の当たりの高さ内へ納める。
        // 墨は陸の脇へ横たえ、墨池と紙を覆わない。
        box(part, .035, .015, .09, .365, .4345, .015, 0x171b19);
        // 小さな角形の水滴。肩を一段絞り、注ぎ口と空気穴を暗い面で表す。
        box(part, .075, .035, .075, .08, .3975, -.19, 0x494740);
        box(part, .06, .015, .06, .08, .4225, -.19, 0x494740);
        box(part, .022, .014, .022, .08, .437, -.151, 0x494740);
        box(part, .009, .002, .009, .08, .445, -.151, 0x171b19);
        box(part, .008, .002, .008, .08, .431, -.2, 0x171b19);
        // 筆架の二つの山で軸を支え、筆を硯の縁から浮かせたままにしない。
        box(part, .065, .008, .035, .32, .419, .1, 0x494740);
        for (const x of [.297, .343])
          box(part, .012, .012, .035, x, .429, .1, 0x494740);
        box(part, .2, .012, .012, .32, .442, .1, 0x9b8057);
        box(part, .04, .014, .014, .2, .442, .1, 0x39352d);
      } else part.add(tsukue());
    
      } else {
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
    }
    else if (p.part === 'altar') {
      const altarScaleY = p.h / (inabaHigh && layout.kind === 'hondo' ? 1.75 : 1.5);
      const ceilingY = (h - (p.y || 0)) / altarScaleY;
      const canopyClearance = .1 + (inabaHigh && layout.kind === 'hondo' ? INABA_ALTAR_SUSPENSION_DROP : 0);
      const canopyDrop = inabaHigh ? Math.min(0, ceilingY - canopyClearance / altarScaleY - 2.27) : 0;
      if (inabaHigh) {
      // 須弥壇：下框・黒漆の腰（金の格狭間）・上框の三段に、蓮台の本尊と光背。前に小さな前卓と香炉
      box(part, 2.1, .14, 1, 0, .07, 0, 0x24170f);
      box(part, 1.85, .3, .82, 0, .29, 0, 0x2a1a12);
      if (inabaHigh && layout.kind === 'hondo') {
        // 稲葉山の須弥壇は金の四角を貼るだけにせず、腰の格狭間を透かしの輪郭で組む推定。
        // 黒漆の腰を背に残し、正面三つと側面の意匠を同じ形・材質で使い回す。
        const key = '須弥壇の格狭間';
        if (!shapes.has(key)) {
          const outline = new THREE.Shape();
          outline.moveTo(-.5, -.5); outline.lineTo(.5, -.5);
          outline.lineTo(.5, -.18);
          outline.bezierCurveTo(.5, .08, .25, -.02, .22, .22);
          outline.bezierCurveTo(.2, .36, .06, .32, 0, .5);
          outline.bezierCurveTo(-.06, .32, -.2, .36, -.22, .22);
          outline.bezierCurveTo(-.25, -.02, -.5, .08, -.5, -.18);
          outline.closePath();
          const hole = new THREE.Path();
          hole.moveTo(-.42, -.35); hole.lineTo(-.42, -.18);
          hole.bezierCurveTo(-.42, -.02, -.18, -.1, -.15, .16);
          hole.bezierCurveTo(-.13, .23, -.04, .23, 0, .31);
          hole.bezierCurveTo(.04, .23, .13, .23, .15, .16);
          hole.bezierCurveTo(.18, -.1, .42, -.02, .42, -.18);
          hole.lineTo(.42, -.35); hole.closePath();
          outline.holes.push(hole);
          shapes.set(key, new THREE.ShapeGeometry(outline, 6));
        }
        for (const x of [-.55, 0, .55]) {
          const panel = new THREE.Mesh(shapes.get(key), mat(0x8a6c30));
          panel.scale.set(.4, .18, 1); panel.position.set(x, .29, .416); part.add(panel);
        }
        for (const side of [-1, 1]) {
          const panel = new THREE.Mesh(shapes.get(key), mat(0x8a6c30));
          panel.scale.set(.45, .18, 1); panel.rotation.y = side * Math.PI / 2;
          panel.position.set(side * .926, .29, 0); part.add(panel);
        }
        // 壇の框は上下の細い繰形で腰とつなぐ。壇の外寸と内陣の通路は保つ。
        for (const yy of [.16, .42])
          box(part, 1.97, .035, .9, 0, yy, 0, 0x49301c);
      } else for (const x of [-.55, 0, .55]) box(part, .4, .18, .01, x, .29, .415, 0x8a6c30);
      box(part, 2.1, .1, 1, 0, .49, 0, 0x24170f);
      if (inabaHigh && layout.kind === 'hondo') {
        // 本尊の像容は不明。箱の立像で済ませず、衣をまとい結跏趺坐する仏像の推定形。
        // 一つの球を伸縮して蓮弁・衣・顔・手に共有し、既存の須弥壇の内側へ納める。
        const key = '本堂の座像';
        if (!shapes.has(key)) shapes.set(key, new THREE.SphereGeometry(1, 12, 8));
        const oval = (x, y, z, w, h, d, color, tilt = 0) => {
          const m = new THREE.Mesh(shapes.get(key), mat(color));
          m.scale.set(w / 2, h / 2, d / 2); m.position.set(x, y, z); m.rotation.z = tilt;
          part.add(m);
        };
        oval(0, 1.23, -.36, .88, 1.04, .035, 0x7a5e26); // 舟形の光背
        roundVessel(part, .32, .27, .09, 0, .585, -.1, 0x6e5424);
        for (let j = 0; j < 10; j++) {
          const a = j * Math.PI * 2 / 10;
          oval(Math.sin(a) * .25, .64, -.1 + Math.cos(a) * .18,
            .18, .13, .16, j % 2 ? 0x9b7c37 : 0x80622c);
        }
        oval(0, .75, -.07, .72, .24, .43, 0x9b8041); // 組んだ脚と衣の裾
        oval(0, 1.03, -.12, .4, .55, .3, 0xa48b4a);
        for (const side of [-1, 1]) {
          oval(side * .22, 1.03, -.08, .16, .36, .2, 0x92773b, side * .28);
          oval(side * .13, .86, .055, .28, .11, .13, 0xa48b4a, side * .18);
          oval(side * .145, 1.42, -.11, .055, .15, .065, 0xa48b4a); // 耳
        }
        oval(0, .89, .1, .19, .07, .1, 0xb19752); // 膝上で重ねた手
        oval(0, 1.29, -.12, .12, .12, .12, 0xa48b4a);
        oval(0, 1.43, -.11, .27, .3, .245, 0xa48b4a);
        oval(0, 1.55, -.13, .265, .17, .235, 0x494033); // 髪と肉髻
        oval(0, 1.64, -.13, .1, .1, .1, 0x494033);
        oval(0, 1.43, .016, .04, .07, .04, 0xb19752);
        for (const x of [-.055, .055]) box(part, .055, .012, .012, x, 1.46, .008, 0x594626);
        box(part, .055, .009, .01, 0, 1.365, .011, 0x594626);
      } else {
        box(part, .6, .1, .5, 0, .59, -.1, 0x6e5424);
        box(part, .45, .7, .4, 0, .99, -.1, 0xa48b4a);
        box(part, .28, .28, .28, 0, 1.48, -.1, 0xa48b4a);
        box(part, .9, .9, .03, 0, 1.25, -.36, 0x7a5e26);
      }
      if (inabaHigh && layout.kind === 'hondo') {
        // 三具足を備えた前卓の推定。中央に香炉、向かって左に花立、右に燭台。
        // 須弥壇の既存の当たり（幅二・一、奥行き一）の中に納め、内陣の道を塞がない。
        // 前卓も一枚の塊にせず、框へ天板を落とし、脚の内面へ貫を納める推定。
        // 仏具を受ける上面・脚元・外寸は保ち、共通の木目と箱を室内の束へまとめる。
        const tableRail = (w, hh, dd, x, yy, z) => {
          const timber = box(part, hh, w, dd, x, yy, z, 0x2a1810, 'inabaBoard');
          timber.rotation.z = Math.PI / 2;
        };
        for (const z of [.265, .455]) tableRail(1.45, .05, .03, 0, .72, z);
        // 側框は前後へ渡る材。縦木目の箱をそのまま置かず、長手を
        // 前後へ回して天板の木口を受ける。外寸と框の高さは保つ。
        for (const x of [-.71, .71]) {
          const timber = box(part, .03, .16, .05, x, .72, .36, 0x2a1810, 'inabaBoard');
          timber.rotation.x = Math.PI / 2;
        }
        // 板の端は框で受け、細い目地の下には暗い下地を残す。
        tableRail(1.39, .008, .16, 0, .699, .36);
        for (let j = 0; j < 2; j++)
          tableRail(1.39, .042, .078, 0, .724, .32 + j * .08);
        // 脚を壇へ埋めず、壇上面から足座・脚・天板裏へつなぐ推定の納まり。
        // 足座は前後へ木目を通し、既存の前卓の外寸と仏具の高さに収める。
        const altarTop = .54, footH = .025, legTop = .695;
        const legBottom = altarTop + footH;
        for (const x of [-.62, .62]) {
          const foot = box(part, .1, .18, footH,
            x, altarTop + footH / 2, .36, 0x2a1810, 'inabaBoard');
          foot.rotation.x = Math.PI / 2;
          box(part, .06, legTop - legBottom, .16,
            x, (legBottom + legTop) / 2, .36, 0x2a1810, 'inabaBoard');
        }
        tableRail(1.18, .04, .04, 0, .61, .36);
        // 天板直下の幕板も脚の間で止め、貫や仏具へ重ねない。
        for (const z of [.295, .425]) tableRail(1.18, .035, .025, 0, .6775, z);
        const bronze = 0x6a5a3a;
        // 香炉は三脚で受け、灰面と口縁を分ける。煙や新しい灯りは足さない。
        for (const [x, z] of [[-.055, .32], [.055, .32], [0, .415]])
          roundVessel(part, .012, .016, .04, x, .765, z, bronze);
        roundVessel(part, .085, .06, .09, 0, .825, .36, bronze);
        vesselRim(part, .09, .09, .018, .012, 0, .875, .36, bronze);
        // 灰は口縁より下へ納め、上からも金属の内面と深さが見えるようにする。
        roundVessel(part, .077, .077, .004, 0, .874, .36, 0xaba28e);
        // 灰へ差した線香の軸と燃え残り。前卓の範囲内に静止した形で納め、
        // 煙・光源・毎コマの処理を増やさず、既存の木と灰の材質を使う。
        for (const x of [-.025, 0, .025]) {
          box(part, .004, .08, .004, x, .916, .36, 0x6e6245);
          box(part, .004, .012, .004, x, .962, .36, 0x49351e);
          box(part, .005, .004, .005, x, .97, .36, 0xaba28e);
        }
        // 花立は胴・首・口を分け、供花は枝と葉を静止した形で添える。
        roundVessel(part, .055, .04, .13, -.48, .81, .36, bronze);
        roundVessel(part, .025, .035, .06, -.48, .905, .36, bronze);
        vesselRim(part, .045, .025, .025, .006, -.48, .9475, .36, bronze);
        // 花立の口を金属の円盤で塞がず、口縁の内側に暗い水面を納める。
        // 供花は既存の座像の球を使い回し、前卓の範囲と本尊の前を空ける推定。
        roundVessel(part, .029, .029, .002, -.48, .949, .36, 0x211b15);
        box(part, .012, .23, .012, -.48, 1.065, .36, 0x4a5238);
        for (const x of [-.52, -.44]) box(part, .07, .025, .025, x, 1.05, .36, 0x4a5238);
        for (let j = 0; j < 5; j++) {
          const angle = j * Math.PI * 2 / 5;
          const petal = new THREE.Mesh(shapes.get('本堂の座像'), mat(0xc7bca0));
          petal.scale.set(.026, .032, .012);
          petal.position.set(-.48 + Math.sin(angle) * .024,
            1.185 + Math.cos(angle) * .024, .36);
          petal.rotation.z = -angle;
          part.add(petal);
        }
        roundVessel(part, .012, .012, .012, -.48, 1.185, .37, 0x9b8041);
        roundVessel(part, .07, .07, .025, .48, .7575, .36, bronze);
        roundVessel(part, .016, .025, .22, .48, .88, .36, bronze);
        roundVessel(part, .06, .06, .02, .48, 1, .36, bronze);
        roundVessel(part, .018, .018, .14, .48, 1.08, .36, 0xd8d0bd);
        // 燭台は白い棒で終わらせず、蝋の上面に灯芯と静止した火を載せる。
        // 壇上の灯明と同じ軽い作り。光源・揺れ・毎コマの生成は増やさない。
        box(part, .006, .014, .006, .48, 1.157, .36, 0x30251a);
        const candleFlame = new THREE.Mesh(shapes.get('本堂の座像'), mat(0xffd08b));
        candleFlame.scale.set(.009, .026, .009);
        candleFlame.position.set(.48, 1.187, .36);
        part.add(candleFlame);
      } else {
        box(part, .5, .04, .22, 0, .54, .38, 0x2a1810); box(part, .12, .1, .12, 0, .6, .38, 0x6a5a3a);
      }
      if (inabaHigh && layout.kind === 'hondo') {
        // 須弥壇の上へ床置きの背高い灯明台を載せず、低い金属の灯明皿を据える推定。
        // 壇の上面で脚を受け、本尊・前卓・天蓋と重ねない。左右で形と材質を共有する。
        const key = '壇上の灯芯の火';
        if (!shapes.has(key)) shapes.set(key, new THREE.SphereGeometry(1, 8, 6));
        for (const x of [-.75, .75]) {
          roundVessel(part, .055, .09, .035, x, .5575, 0, 0x6a5a3a);
          roundVessel(part, .018, .025, .14, x, .645, 0, 0x6a5a3a);
          roundVessel(part, .1, .045, .035, x, .7325, 0, 0x8a744b);
          roundVessel(part, .085, .085, .004, x, .748, 0, 0x49351e);
          box(part, .035, .008, .012, x + .07, .755, 0, 0x30251a);
          const flame = new THREE.Mesh(shapes.get(key), mat(0xffd08b));
          flame.scale.set(.012, .035, .012); flame.position.set(x + .08, .786, 0);
          part.add(flame);
        }
      } else {
        place(part, hieiTomyo(), -.75, 0, 0, .55); place(part, hieiTomyo(), .75, 0, 0, .55);
      }
      if (templeAltar) {
        // 古い堂の内陣の推定：家庭用仏壇ではなく、須弥壇の本尊を覆う天蓋と幡。
        // 須弥壇と同じ範囲に収め、左右の通路を空ける。形・材質は箱の共通部品を使う。
        // 内陣の床上げを含め、天蓋と幡を格天井の下へ納める。本尊の寸法は保つ。
        // 本堂の本尊は高さ一・七五を基準に拡縮する。吊り材にも同じ縮尺を
        // 使わないと、天蓋が宙に浮いたり、低い堂で天井を突き抜けたりする。
        const altarScaleY = p.h / (inabaHigh && layout.kind === 'hondo' ? 1.75 : 1.5);
        const ceilingY = (h - (p.y || 0)) / altarScaleY;
        const canopyClearance = .1 + (inabaHigh && layout.kind === 'hondo' ? INABA_ALTAR_SUSPENSION_DROP : 0);
      const canopyDrop = inabaHigh ? Math.min(0, ceilingY - canopyClearance / altarScaleY - 2.27) : 0;
        if (!(inabaHigh && layout.kind === 'hondo')) {
          box(part, 1.55, .08, .72, 0, 2.18 + canopyDrop, -.08, 0x3a2417);
          box(part, 1.7, .06, .82, 0, 2.24 + canopyDrop, -.08, 0x8a6c30);
        }
        if (inabaHigh && layout.kind === 'hondo') {
          // 来迎壁と天蓋の吊り材を補う推定復元。須弥壇の当たりの範囲内に納め、
          // 内陣の左右の通路と格子戸の引き込み先を空ける。
          const canopyTop = 2.27 + canopyDrop, wallTop = inabaAltarBackHeight(p, h) / altarScaleY;
          // 来迎壁の縦板と柱は縦目、框・横桟は長手の板目で納める。
          // 板床の絵と材質を共有し、既存の束・寸法・通路はそのまま使う。
          const crossGrain = (w, hh, d, yy, zz, color) => {
            const timber = box(part, hh, w, d, 0, yy, zz, color, 'inabaBoard');
            timber.rotation.z = Math.PI / 2;
          };
          // 上側も厚い一枚の箱で覆わず、四周の框へ薄い天板を掛ける推定。
          // 金色の縁は残し、隅の材は突き付けて同じ面を重ねない。
          // 既存の外寸・上端と吊り位置を保ち、木目と材質は室内の束で共有する。
          for (const z of [-.465, .305])
            box(part, 1.7, .06, .05, 0, canopyTop - .03, z, 0x8a6c30);
          for (const x of [-.825, .825])
            box(part, .05, .06, .72, x, canopyTop - .03, -.08, 0x8a6c30);
          // 板端を框に一センチ掛け、細い目地の下は暗い裏板で受ける。
          box(part, 1.62, .003, .74, 0, canopyTop - .0165, -.08, 0x3a2417);
          for (let j = 0; j < 5; j++)
            crossGrain(1.62, .015, .74 / 5 - .003, canopyTop - .0075,
              -.45 + (j + .5) * .74 / 5, j % 2 ? 0x604831 : 0x6a5038);
          box(part, 2.1, wallTop, .06, 0, wallTop / 2, -.46, 0x79674e);
          for (const x of [-1, 1]) box(part, .08, wallTop, .08, x, wallTop / 2, -.46, 0x3a2417, 'inabaBoard');
          crossGrain(2.1, .08, .08, wallTop - .04, -.46, 0x3a2417);
          // 来迎壁は柱の間へ縦板を納め、横桟で受ける推定の作り。
          // 光背の後ろの板面を割り、柱と下框の内側で止める。
          // 須弥壇の外寸・左右の通路・格子戸の引き先は広げない。
          const wallBase = .54, boardTop = wallTop - .08;
          crossGrain(1.92, .06, .08, wallBase + .03, -.46, 0x3a2417);
          const boardW = 1.92 / 8, boardH = boardTop - wallBase - .06;
          if (boardH > 0) for (let j = 0; j < 8; j++) {
            const x = -.96 + (j + .5) * boardW;
            box(part, boardW - .006, boardH, .008, x,
              wallBase + .06 + boardH / 2, -.426,
              j % 2 ? 0x806e53 : 0x75634b, 'inabaBoard');
          }
          for (const yy of [wallBase + .28, boardTop - .22])
            if (yy > wallBase + .06 && yy < boardTop)
              crossGrain(1.92, .045, .02, yy, -.495, 0x493522);
          // 吊り天蓋も一枚の板にせず、四周の框で内側の板を受ける。
          // 天蓋の既存の厚み内へ納め、格天井との間の吊り材は保つ。
          const canopyY = 2.14 + canopyDrop;
          for (const z of [-.42, .26])
            crossGrain(1.55, .08, .04, canopyY + .04, z, 0x49301c);
          for (const x of [-.755, .755]) {
            const timber = box(part, .04, .64, .08, x, canopyY + .04, -.08, 0x49301c, 'inabaBoard');
            timber.rotation.x = Math.PI / 2;
          }
          // 見上げる鏡板の目地は裏板で受け、天蓋の空洞を露出させない推定の納まり。
          // 鏡板の上面へ接して四周の框にも五ミリ掛け、金縁・吊り材の下へ納める。
          // 共通の木目と箱を既存の束へまとめ、仏具の外寸と内陣の通路は保つ。
          crossGrain(1.48, .003, .65, canopyY + .0815, -.08, 0x3a2417);
          for (let j = 0; j < 5; j++)
            crossGrain(1.47, .008, .64 / 5 - .006, canopyY + .076,
              -.4 + (j + .5) * .64 / 5, j % 2 ? 0x604831 : 0x6a5038);
          const hangerTop = ceilingY - INABA_ALTAR_SUSPENSION_DROP / altarScaleY;
          const hangingH = hangerTop - canopyTop;
          if (hangingH > .001) for (const x of [-.55, .55]) for (const z of [-.3, .14]) {
            // 吊り棒の上端を頭貫上の受け材へ留め、天井板へ荷重を掛けない推定の納まり。
            // 金具も天井下と天蓋上の隙間へ収め、低い堂で両端を重ねない。
            // 共通の箱・鉄色を使い、設営時に室内の束へまとめる。
            const plateH = Math.min(.012, hangingH / 4);
            box(part, .05, plateH, .05, x, hangerTop - plateH / 2, z, 0x4b4030);
            box(part, .04, plateH, .04, x, canopyTop + plateH / 2, z, 0x4b4030);
            box(part, .018, hangingH - plateH * 2, .018,
              x, canopyTop + hangingH / 2, z, 0x4b4030);
          }
        }
        for (const x of [-.68, .68]) {
          box(part, .035, .28, .035, x, 2.0 + canopyDrop, -.08, 0x8a6c30);
          if (inabaHigh && layout.kind === 'hondo') {
            // 本堂の幡は厚い一枚板でなく、吊り紐・上桟・薄い布と垂れで表す推定。
            // 既存の幅・高さの内側へ納め、天蓋と同じ吊り位置を保つ。
            // 共通の箱・材質を設営時に束ね、揺れや毎コマの処理は足さない。
            for (const side of [-1, 1])
              box(part, .008, .045, .008, x + side * .04, 1.8775 + canopyDrop, -.08, 0x6a5038);
            box(part, .12, .015, .02, x, 1.8475 + canopyDrop, -.08, 0x8a6c30);
            box(part, .11, .32, .006, x, 1.68 + canopyDrop, -.08, 0x95815a);
            for (const side of [-1, 1])
              box(part, .012, .32, .008, x + side * .049, 1.68 + canopyDrop, -.08, 0x6e5424);
            box(part, .11, .02, .008, x, 1.53 + canopyDrop, -.08, 0x6e5424);
            for (let j = 0; j < 3; j++)
              box(part, .026, j === 1 ? .16 : .13, .006,
                x + (j - 1) * .038, (j === 1 ? 1.44 : 1.455) + canopyDrop, -.08, 0x95815a);
          } else box(part, .12, .54, .025, x, 1.63 + canopyDrop, -.08, 0x95815a);
        }
      }
    
      } else {
      // 須弥壇：下框・黒漆の腰（金の格狭間）・上框の三段に、蓮台の本尊と光背。前に小さな前卓と香炉
      {
        // 下框を一つの角箱にせず、地覆から腰の框へ段を絞って受ける。
        // 焼失前の繰形の細部は推定。元の幅・奥行き・高さの内側へ納め、
        // 本尊の高さと内陣の通路を保つ。共通の箱・漆の材質でまとめ描きする。
        let bottom = 0;
        for (const [w, depth, height] of [[2.1, 1, .04], [2.02, .94, .03],
          [1.94, .88, .03], [1.85, .82, .04]]) {
          box(part, w, height, depth, 0, bottom + height / 2, 0, 0x24170f);
          bottom += height;
        }
      }
      {
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
      }
      hieiAltarWaist(part);
      {
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
      }
      {
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
      }
      {
        // 本尊の背後は通常の白壁で終えず、光背を受ける来迎壁を設ける。
        // 焼失前の細部は推定。柱・地覆・頭貫で板壁を囲み、須弥壇の
        // 当たりの幅・奥行き・天蓋までの高さへ収める。共通の箱と材質を使う。
        const bottom = .54, top = 2.14, back = -.455;
        // 一枚板へ線を重ねず、枠の内寸に六枚の縦板を納める。
        // 目地の奥は薄い下地で閉じ、背後の白壁や外光を透かさない。
        // 板の表裏とも元の厚みへ収め、既存の形・材質のまとめ描きを使う。
        const width = 1.72, height = top - bottom - .16, pitch = width / 6;
        box(part, width, height, .012, 0, (bottom + top) / 2, back - .014, 0x3a2417);
        // 単色の板にせず、縦板・柱・横木それぞれの長手へ実寸の木目を通す。
        // 経机と同じ寸法別の形・材質を使い回し、既存の室内の束へまとめる。
        for (let i = 0; i < 6; i++) hieiRitualTimber(part, pitch - .003, height, .024,
          -width / 2 + (i + .5) * pitch, (bottom + top) / 2, back + .008, 0x634832);
        for (const x of [-.9, .9]) hieiRitualTimber(part, .08, top - bottom, .08, x, (bottom + top) / 2, back, 0x3a2417);
        // 横木の本体は柱の内面で止め、細い枘を柱へ差して込栓で留める。
        // 焼失前の仕口は推定。板壁を上下の横木へ突き合わせるだけにせず、
        // 四隅の接合を見せる。須弥壇の外寸内で共通の箱・材質をまとめ描きする。
        for (const y of [bottom + .04, top - .04]) {
          hieiRitualTimber(part, width, .08, .08, 0, y, back, 0x3a2417);
          for (const x of [-.9, .9]) {
            hieiRitualTimber(part, .08, .035, .03, x, y, back, 0x3a2417);
            // 栓は枘を前後に貫き、木口だけを柱面へわずかに出す。
            // 壁板の目地・天蓋・本尊には重ねず、背後の通路も狭めない。
            hieiRitualTimber(part, .018, .018, .088, x, y, back, 0x95704a);
          }
        }
        // 来迎壁の裏にも板押さえを渡し、縦板を上下の框だけで支えない。
        // 焼失前の細かな仕口は推定。横木を両側の柱へ差し、裏面の込栓で留める。
        // 須弥壇の奥行き一メートル以内へ納め、背後の通路と調度の当たりは広げない。
        // 共通の箱・材質を設営時のまとめ描きへ含め、毎コマの処理は増やさない。
        for (const y of [bottom + .48, top - .48]) {
          hieiRitualTimber(part, width, .07, .025, 0, y, back - .0325, 0x3a2417);
          for (const x of [-.9, .9]) {
            // 柱内の枘と、柱の裏へわずかに出る栓の木口。
            hieiRitualTimber(part, .08, .035, .025, x, y, back - .0075, 0x3a2417);
            hieiRitualTimber(part, .022, .022, .008, x, y, back - .041, 0x95704a);
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
      } else {
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
      }
      box(part, .5, .04, .22, 0, .54, .38, 0x2a1810);
      {
        // 香炉を角箱で済ませず、三脚・丸い胴・口縁と灰に分ける。
        // 焼失前の個別の意匠は推定。既存の卓と須弥壇の範囲へ収める。
        // 丸い形と材質は共有し、設営時のまとめ描きだけへ加える。
        for (let i = 0; i < 3; i++) {
          const a = i * Math.PI * 2 / 3;
          altarOval(part, .025, .035, .025,
            Math.sin(a) * .045, .5775, .38 + Math.cos(a) * .045, 0x6a5a3a);
        }
        hieiIncenseBowl(part, .14, .075, .14, 0, .5805, .38, 0x6a5a3a, 0xb6ad96);
      }
      const hangingLamp = layout.profile === 'hieizan' && layout.kind === 'chudo';
      // 吊り棒が天蓋を貫かないよう、灯籠を天蓋の左右へ納める。
      for (const side of [-1, 1]) place(part,
        hangingLamp ? hieiHangingLamp() : hieiTomyo(layout.profile === 'hieizan'), side * (hangingLamp ? .9 : .75), 0, 0, .55);
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
        if (inabaHigh && layout.kind === 'hondo') {
          // 来迎壁と天蓋の吊り材を補う推定復元。須弥壇の当たりの範囲内に納め、
          // 内陣の左右の通路と格子戸の引き込み先を空ける。
          const canopyTop = 2.27 + canopyDrop, wallTop = inabaAltarBackHeight(p, h) / altarScaleY;
          // 来迎壁の縦板と柱は縦目、框・横桟は長手の板目で納める。
          // 板床の絵と材質を共有し、既存の束・寸法・通路はそのまま使う。
          const crossGrain = (w, hh, d, yy, zz, color) => {
            const timber = box(part, hh, w, d, 0, yy, zz, color, 'inabaBoard');
            timber.rotation.z = Math.PI / 2;
          };
          // 上側も厚い一枚の箱で覆わず、四周の框へ薄い天板を掛ける推定。
          // 金色の縁は残し、隅の材は突き付けて同じ面を重ねない。
          // 既存の外寸・上端と吊り位置を保ち、木目と材質は室内の束で共有する。
          for (const z of [-.465, .305])
            box(part, 1.7, .06, .05, 0, canopyTop - .03, z, 0x8a6c30);
          for (const x of [-.825, .825])
            box(part, .05, .06, .72, x, canopyTop - .03, -.08, 0x8a6c30);
          // 板端を框に一センチ掛け、細い目地の下は暗い裏板で受ける。
          box(part, 1.62, .003, .74, 0, canopyTop - .0165, -.08, 0x3a2417);
          for (let j = 0; j < 5; j++)
            crossGrain(1.62, .015, .74 / 5 - .003, canopyTop - .0075,
              -.45 + (j + .5) * .74 / 5, j % 2 ? 0x604831 : 0x6a5038);
          box(part, 2.1, wallTop, .06, 0, wallTop / 2, -.46, 0x79674e);
          for (const x of [-1, 1]) box(part, .08, wallTop, .08, x, wallTop / 2, -.46, 0x3a2417, 'inabaBoard');
          crossGrain(2.1, .08, .08, wallTop - .04, -.46, 0x3a2417);
          // 来迎壁は柱の間へ縦板を納め、横桟で受ける推定の作り。
          // 光背の後ろの板面を割り、柱と下框の内側で止める。
          // 須弥壇の外寸・左右の通路・格子戸の引き先は広げない。
          const wallBase = .54, boardTop = wallTop - .08;
          crossGrain(1.92, .06, .08, wallBase + .03, -.46, 0x3a2417);
          const boardW = 1.92 / 8, boardH = boardTop - wallBase - .06;
          if (boardH > 0) for (let j = 0; j < 8; j++) {
            const x = -.96 + (j + .5) * boardW;
            box(part, boardW - .006, boardH, .008, x,
              wallBase + .06 + boardH / 2, -.426,
              j % 2 ? 0x806e53 : 0x75634b, 'inabaBoard');
          }
          for (const yy of [wallBase + .28, boardTop - .22])
            if (yy > wallBase + .06 && yy < boardTop)
              crossGrain(1.92, .045, .02, yy, -.495, 0x493522);
          // 吊り天蓋も一枚の板にせず、四周の框で内側の板を受ける。
          // 天蓋の既存の厚み内へ納め、格天井との間の吊り材は保つ。
          const canopyY = 2.14 + canopyDrop;
          for (const z of [-.42, .26])
            crossGrain(1.55, .08, .04, canopyY + .04, z, 0x49301c);
          for (const x of [-.755, .755]) {
            const timber = box(part, .04, .64, .08, x, canopyY + .04, -.08, 0x49301c, 'inabaBoard');
            timber.rotation.x = Math.PI / 2;
          }
          // 見上げる鏡板の目地は裏板で受け、天蓋の空洞を露出させない推定の納まり。
          // 鏡板の上面へ接して四周の框にも五ミリ掛け、金縁・吊り材の下へ納める。
          // 共通の木目と箱を既存の束へまとめ、仏具の外寸と内陣の通路は保つ。
          crossGrain(1.48, .003, .65, canopyY + .0815, -.08, 0x3a2417);
          for (let j = 0; j < 5; j++)
            crossGrain(1.47, .008, .64 / 5 - .006, canopyY + .076,
              -.4 + (j + .5) * .64 / 5, j % 2 ? 0x604831 : 0x6a5038);
          const hangerTop = ceilingY - INABA_ALTAR_SUSPENSION_DROP / altarScaleY;
          const hangingH = hangerTop - canopyTop;
          if (hangingH > .001) for (const x of [-.55, .55]) for (const z of [-.3, .14]) {
            // 吊り棒の上端を頭貫上の受け材へ留め、天井板へ荷重を掛けない推定の納まり。
            // 金具も天井下と天蓋上の隙間へ収め、低い堂で両端を重ねない。
            // 共通の箱・鉄色を使い、設営時に室内の束へまとめる。
            const plateH = Math.min(.012, hangingH / 4);
            box(part, .05, plateH, .05, x, hangerTop - plateH / 2, z, 0x4b4030);
            box(part, .04, plateH, .04, x, canopyTop + plateH / 2, z, 0x4b4030);
            box(part, .018, hangingH - plateH * 2, .018,
              x, canopyTop + hangingH / 2, z, 0x4b4030);
          }
        }
        for (const x of [-.68, .68]) {
          box(part, .035, .28, .035, x, 2.0 + canopyDrop, -.08, 0x8a6c30);
          if (inabaHigh && layout.kind === 'hondo') {
            // 本堂の幡は厚い一枚板でなく、吊り紐・上桟・薄い布と垂れで表す推定。
            // 既存の幅・高さの内側へ納め、天蓋と同じ吊り位置を保つ。
            // 共通の箱・材質を設営時に束ね、揺れや毎コマの処理は足さない。
            for (const side of [-1, 1])
              box(part, .008, .045, .008, x + side * .04, 1.8775 + canopyDrop, -.08, 0x6a5038);
            box(part, .12, .015, .02, x, 1.8475 + canopyDrop, -.08, 0x8a6c30);
            box(part, .11, .32, .006, x, 1.68 + canopyDrop, -.08, 0x95815a);
            for (const side of [-1, 1])
              box(part, .012, .32, .008, x + side * .049, 1.68 + canopyDrop, -.08, 0x6e5424);
            box(part, .11, .02, .008, x, 1.53 + canopyDrop, -.08, 0x6e5424);
            for (let j = 0; j < 3; j++)
              box(part, .026, j === 1 ? .16 : .13, .006,
                x + (j - 1) * .038, (j === 1 ? 1.44 : 1.455) + canopyDrop, -.08, 0x95815a);
          } else box(part, .12, .54, .025, x, 1.63 + canopyDrop, -.08, 0x95815a);
        }
      }
    
      }
    }
    else if (inabaHigh && p.part === 'ammo') {
      // 番所・長屋の矢箱は中身のない塊にせず、底・側板・端板を組んだ開き箱にする推定。
      // 矢は横向きに納め、鏃・矢羽まで既存の幅・奥行き・高さの中へ収める。
      const w = p.w, d = p.d, h = p.h, wallH = h * .68;
      // 無地の箱にせず、底・側板は幅方向、端板・敷木は奥行き方向へ木目を通す。
      // 既存の板目と形を使い、板の数・箱の外寸・当たりは増やさない。
      doorTimber(part, w, .04, d, 0, .04, 0, 0x503923, true);
      for (const z of [-d / 2 + .02, d / 2 - .02])
        doorTimber(part, w, wallH, .04, 0, .06 + wallH / 2, z, 0x604831, true);
      for (const x of [-w / 2 + .02, w / 2 - .02]) {
        const end = doorTimber(part, d - .08, wallH, .04,
          x, .06 + wallH / 2, 0, 0x503923, true);
        end.rotation.y = Math.PI / 2;
      }
      for (const x of [-w * .32, w * .32]) {
        const foot = doorTimber(part, d - .02, .02, .06,
          x, .01, 0, 0x3a2a1c, true);
        foot.rotation.y = Math.PI / 2;
        box(part, .03, .008, d - .02, x, .024, 0, 0x252321);
        for (const z of [-d / 2 + .006, d / 2 - .006])
          box(part, .03, wallH + .04, .012, x, .04 + wallH / 2, z, 0x252321);
      }
      const key = '矢箱の鏃';
      if (!shapes.has(key)) shapes.set(key, new THREE.ConeGeometry(.018, .065, 4).rotateZ(Math.PI / 2));
      // 矢を箱の空中へ並べず、底板から立てた二本の受け桟へ載せる推定の納まり。
      // 桟の上面を矢柄の下面へ揃え、鏃と矢羽には触れない位置で支える。
      // 既存の箱の内側へ収め、共通の形・材質と設営時の束を使う。
      const arrowY = h * .8, restBottom = .06, restTop = arrowY - .006;
      for (const x of [-w * .12, w * .12]) {
        const rest = doorTimber(part, d - .08, restTop - restBottom, .035,
          x, (restBottom + restTop) / 2, 0, 0x604831, true);
        rest.rotation.y = Math.PI / 2;
      }
      for (let j = 0; j < 5; j++) {
        const z = (j - 2) * (d - .14) / 5, y = arrowY;
        box(part, w - .18, .012, .012, 0, y, z, 0x9b8057);
        const head = new THREE.Mesh(shapes.get(key), mat(0x494740));
        head.position.set(-w / 2 + .075, y, z); part.add(head);
        for (const side of [-1, 1])
          box(part, .08, .035, .008, w / 2 - .14, y + side * .014, z, 0xb3ab94);
        box(part, .018, .014, .014, w / 2 - .075, y, z, 0x493522);
      }
    }
    else if (p.part === 'tomyo' && hieiTatamiFloor) {
      part.add(hieiTomyo(true));
      place(part, lightPool(), 0, 0, 0, .09);
    }
    else if (p.part === 'kyozukue' && layout.profile === 'hieizan') {
      // 礼盤から本尊に向かって使う経机。天板・幕板・四脚と経巻を分ける。
      // 天板・框・脚・貫の長手へ木目を通し、隣の礼盤と同じ木肌へ揃える。
      // 寸法別の形と材質を使い回し、経巻まで間取りの当たりの高さに収める。
      const top = p.h - .07, leg = .045;
      // 経机の天板も四周の框と板に分け、経巻の下に厚い一塊を置かない。
      // 板割は推定。上面・外寸・経巻の高さは保ち、目地の奥は薄板で閉じる。
      const rim = .035, innerW = p.w - rim * 2, innerD = p.d - rim * 2;
      for (const x of [-(p.w - rim) / 2, (p.w - rim) / 2]) hieiRitualTimber(part,
        rim, .035, p.d, x, top - .0175, 0, 0x302015);
      for (const z of [-(p.d - rim) / 2, (p.d - rim) / 2]) hieiRitualTimber(part,
        innerW, .035, rim, 0, top - .0175, z, 0x302015);
      hieiRitualTimber(part, innerW, .008, innerD, 0, top - .031, 0, 0x302015);
      for (let i = 0; i < 3; i++) hieiRitualTimber(part, innerW, .027, innerD / 3 - .002,
        0, top - .0135, -innerD / 2 + (i + .5) * innerD / 3,
        i === 1 ? 0x493023 : 0x302015);
      const footX = p.w / 2 - .07, footZ = p.d / 2 - .06;
      // 幕板を脚の芯まで貫通させず、脚の内面へ納める。
      // 同じ面の重なりを除き、内陣側からも四脚と幕板の継ぎ目を見せる。
      for (const x of [-footX, footX]) {
        for (const z of [-footZ, footZ]) hieiRitualTimber(part, leg, top - .035, leg, x, (top - .035) / 2, z, 0x302015);
        hieiRitualTimber(part, leg, .08, footZ * 2 - leg, x, top - .075, 0, 0x493023);
      }
      for (const z of [-footZ, footZ]) hieiRitualTimber(part, footX * 2 - leg, .08, leg, 0, top - .075, z, 0x493023);
      // 経机の四脚を足元の貫で結び、天板直下の幕板だけで支えない。
      // 個別の仕口は推定。脚の内面で止め、礼盤側の膝を入れる所は空ける。
      // 共通の箱と材質でまとめ、経巻までを含む外寸・当たりは保つ。
      const tieY = Math.min(.075, (top - .035) / 3), tieH = .035;
      for (const x of [-footX, footX]) hieiRitualTimber(part, leg, tieH, footZ * 2 - leg,
        x, tieY, 0, 0x493023);
      // 本尊側だけ左右をつなぎ、手前は脚を差し入れられる開いた形にする。
      hieiRitualTimber(part, footX * 2 - leg, tieH, leg, 0, tieY, -footZ, 0x493023);
      // 根本中堂の経机は幕板・貫を脚へ枘差しし、両方向の枘を高さ違いで納める。
      // 細かな仕口は推定。栓の木口だけ脚の外面へ出し、礼盤側の膝の空間を保つ。
      // 共通の箱と材質で設営時にまとめ、調度の外寸・当たりは変えない。
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const x = sx * footX, z = sz * footZ;
        for (const [y, depth] of [[top - .06, .018], [tieY, .012]]) {
          // 奥行き方向は四脚へ差す。低い左右の貫は本尊側の二脚だけ。
          hieiRitualTimber(part, depth, .014, leg - .006, x, y, z, 0x493023);
          hieiRitualTimber(part, .008, .012, .012, x + sx * (leg / 2 + .004),
            y, z - sz * .012, 0x795b3b);
          if (y !== tieY || sz < 0) {
            const crossY = y === tieY ? y + .008 : y - .025;
            hieiRitualTimber(part, leg - .006, .012, depth, x, crossY, z, 0x493023);
            hieiRitualTimber(part, .012, .012, .008, x - sx * .012,
              crossY, z + sz * (leg / 2 + .004), 0x795b3b);
          }
        }
      }
      // 経机の経巻も白紙で終えず、僧坊の文机と同じ縦の墨跡で表す。
      // 特定の経典本文の復元ではない。巻軸から離した紙面だけへ納め、
      // 共通の箱・材質を設営時の束へ含める。調度の外寸と通路は保つ。
      box(part, p.w - .2, .006, p.d - .14, 0, top + .003, 0, 0xcac1a5);
      const inkW = p.w - .28, inkD = p.d - .2;
      if (inkW > .06 && inkD > .04) {
        const columns = Math.max(1, Math.round(inkW / .065));
        const rows = Math.max(1, Math.round(inkD / .035));
        const pitchX = inkW / columns, pitchZ = inkD / rows;
        for (let column = 0; column < columns; column++) for (let row = 0; row < rows; row++) {
          const x = inkW / 2 - (column + .5) * pitchX;
          const z = -inkD / 2 + (row + .5) * pitchZ;
          const width = Math.min(.012 + (column + row * 3) % 3 * .004, pitchX * .4);
          box(part, width, .0006, Math.min(.015, pitchZ * .45), x, top + .0063, z, 0x39362d);
          if ((column + row) % 2 === 0) box(part, Math.min(.006, pitchX * .15), .0006,
            Math.min(.008, pitchZ * .24), x + width / 2, top + .0063, z + pitchZ * .26, 0x575045);
        }
      }
      for (const x of [-(p.w - .2) / 2, (p.w - .2) / 2]) hieiScroll(part, p.d - .1, .022, x, top + .027, 0, Math.PI / 2);
    }
    else if (p.part === 'raiban' && layout.profile === 'hieizan') {
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
      // 幕板は四脚の内面で止め、上端を板座の下面へ合わせる。
      // 外周へずらした幕板が脚と板座を貫いていたため、脚芯から割り直す。
      // 細かな仕口は推定。外寸・敷物・通路の当たりと描画の束は保つ。
      const apronTop = seat - .04, apronY = apronTop - .04;
      for (const z of [-footZ, footZ]) hieiRitualTimber(part,
        footX * 2 - leg, .08, .055, 0, apronY, z, 0x493023);
      for (const x of [-footX, footX]) hieiRitualTimber(part,
        .055, .08, footZ * 2 - leg, x, apronY, 0, 0x493023);
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
      const cushion = hieiTatami(across ? matD : matW, across ? matW : matD, true);
      cushion.scale.y = .05 / .06;
      place(part, cushion, 0, 0, across ? Math.PI / 2 : 0, seat);
    }
    else if (p.part === 'storage' && hieiKuri) {
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
    }
    else if (p.part === 'storage' && hieiSobo) {
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
        hieiScroll(part, bayW - t, radius, x, y, 0, 0, true);
      }
    }
    else {
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
    if (p.part === 'alcove') part.scale.set(p.w / 2.3, inabaHigh ? 1 : p.h / 2.5, p.d / .85);
    if (!kit && p.part === 'altar') part.scale.set(p.w / 2.1, p.h / (inabaHigh && layout.kind === 'hondo' ? 1.75 : layout.profile === 'hieizan' ? 2.27 : 1.5), p.d / 1);
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
  if (layout.profile === 'inabayama') {
  let floorRooms = layout.floorPieces ? layout.rooms.flatMap(r => layout.floorPieces.map(v => ({ ...r, x0: Math.max(r.x0, v[0]), x1: Math.min(r.x1, v[1]), z0: Math.max(r.z0, v[2]), z1: Math.min(r.z1, v[3]) })).filter(r => r.x1 > r.x0 && r.z1 > r.z0)) : layout.rooms;
  if (inabaHigh && layout.kind === 'goten') for (const p of layout.props) {
    if (p.part !== 'alcove') continue;
    // 据え付けの床の間には畳を敷き込まない。奥壁・脇壁まで床の間の
    // 区画とし、残る座敷を床框の前と横に分けて畳寄せで納める。
    // 床の間自身の板床と土台を使い、歩く床や調度の当たりは変えない。
    floorRooms = floorRooms.flatMap(r => {
      if (r.floor !== 'tatami' || p.x + p.w / 2 <= r.x0 || p.x - p.w / 2 >= r.x1
        || p.z + p.d / 2 <= r.z0 || p.z - p.d / 2 >= r.z1) return [r];
      const x0 = Math.max(r.x0, p.x - p.w / 2), z0 = Math.max(r.z0, p.z - p.d / 2);
      const x1 = Math.min(r.x1, p.x + p.w / 2), z1 = Math.min(r.z1, p.z + p.d / 2);
      const left = x0 - r.x0 < .04 ? r.x0 : x0;
      const right = r.x1 - x1 < .04 ? r.x1 : x1;
      const back = z0 - r.z0 < .04 ? r.z0 : z0;
      const front = r.z1 - z1 < .04 ? r.z1 : z1;
      const pieces = [];
      if (left > r.x0) pieces.push({ ...r, x1: left });
      if (right < r.x1) pieces.push({ ...r, x0: right });
      if (back > r.z0) pieces.push({ ...r, x0: left, x1: right, z1: back });
      if (front < r.z1) pieces.push({ ...r, x0: left, x1: right, z0: front });
      return pieces;
    });
  }
  const raisedFloor = (r, height, cap = 0) => {
    const w = r.x1 - r.x0, d = r.z1 - r.z0;
    const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
    if (!inabaHigh || w <= .08 || d <= .08) {
      box(g, w, height, d, cx, height / 2, cz, 0x6a5038);
      return;
    }
    // 上段・内陣・用屋の床上げは、無地の塊でなく横木目の蹴込み板で包む推定。
    // 框の下までに納め、側板の端は前後の板へ突き付ける。外寸と歩く高さは保つ。
    // 既存の箱・木目・材質を使い、設営時に室内の束へまとめる。
    const thickness = .02, apronH = height - cap;
    box(g, w - thickness * 2, height, d - thickness * 2,
      cx, height / 2, cz, 0x3a2a1c);
    if (apronH <= 0) return;
    // 長い上段や内陣の蹴込みを一枚板にせず、六尺ほどの板を継ぐ推定の納まり。
    // 木口の目地は背後の暗い下地で受け、上下端と隅の突き付け位置は保つ。
    // 板と留め釘は既存の形・材質で作り、室内の束へ設営時だけ結合する。
    const apron = (length, x, z, across) => {
      const count = Math.max(1, Math.ceil(length / 1.8)), span = length / count;
      for (let j = 0; j < count; j++) {
        const offset = -length / 2 + (j + .5) * span;
        const bx = x + (across ? 0 : offset), bz = z + (across ? offset : 0);
        const board = doorTimber(g, span - .003, apronH, thickness,
          bx, apronH / 2, bz, j % 2 ? 0x644b34 : 0x6a5038, true);
        if (across) board.rotation.y = Math.PI / 2;
        const face = across ? Math.sign(x - cx) : Math.sign(z - cz);
        for (const end of [-1, 1]) {
          const nail = end * (span / 2 - Math.min(.04, span / 4));
          box(g, across ? .003 : .012, .012, across ? .012 : .003,
            bx + (across ? face * (thickness / 2 + .001) : nail), apronH / 2,
            bz + (across ? nail : face * (thickness / 2 + .001)), 0x39332b);
        }
      }
    };
    for (const z of [r.z0 + thickness / 2, r.z1 - thickness / 2]) apron(w, cx, z, false);
    for (const x of [r.x0 + thickness / 2, r.x1 - thickness / 2]) apron(d - thickness * 2, x, cz, true);
  };
  for (const r of floorRooms) {
    if (r.floor === 'tatami') {
      // 稲葉山の広間・上段・遠侍は歩く床高を畳の上面とする。
      // 六センチの畳を床組みへ落とし込み、敷居へ畳を突き出さない。
      const recessedTatami = inabaHigh;
      const tatamiBaseY = (r.y || 0) - (recessedTatami ? .06 : 0);
      if (inabaHigh && r.y > 0) {
        // 奥座敷の畳だけが浮かないよう、上段の床組みを板で包む。
        // 周囲の框は下の畳寄せと兼ねる。同じ高さへ二重に重ねると面がちらつく。
        raisedFloor(r, tatamiBaseY);
      }
      // 稲葉山の座敷は室内寸法へ割り付け、壁際に細い畳を残さない。
      // 外周柱は壁端から十六センチの芯、見込み十四センチ。
      // 畳を柱の内面（二十三センチ）で止め、間仕切りや床の間の境は保つ。
      const outer = layout.rooms;
      const columnBorder = inabaHigh && ['goten', 'tamari'].includes(layout.kind);
      // 可動戸の敷居は壁芯から前後十六センチ、引き先まで開口の倍の幅を使う。
      // 同じ床高の畳・畳寄せで溝を埋めず、敷居の木口へ突き付ける。
      const sillCuts = [];
      if (columnBorder) for (const p of layout.portals || []) {
        if (Math.abs((p.sill || 0) - (r.y || 0)) > .001) continue;
        let left = -Infinity, right = Infinity;
        for (const v of layout.walls) {
          if (v.guideOnly || Math.abs(v.az - p.z) > .001 || Math.abs(v.bz - p.z) > .001) continue;
          const a = Math.min(v.ax, v.bx), b = Math.max(v.ax, v.bx);
          if (b <= p.x + .001) left = Math.max(left, b);
          if (a >= p.x - .001) right = Math.min(right, a);
        }
        if (isFinite(left) && isFinite(right)) {
          const center = (left + right) / 2, reach = right - left + .04;
          sillCuts.push([center - reach, center + reach, p.z - .16, p.z + .16]);
        }
      }
      const leftInset = columnBorder && outer.some(q => Math.abs(q.x0 - r.x0) < .001) ? .23 : .1;
      const rightInset = columnBorder && outer.some(q => Math.abs(q.x1 - r.x1) < .001) ? .23 : .1;
      const backInset = columnBorder && r.z0 === Math.min(...outer.map(q => q.z0)) ? .23
        : sillCuts.some(v => Math.abs(v[2] + .16 - r.z0) < .001) ? .17 : .1;
      const frontInset = columnBorder && r.z1 === Math.max(...outer.map(q => q.z1)) ? .23
        : sillCuts.some(v => Math.abs(v[2] + .16 - r.z1) < .001) ? .17 : .1;
      const floorD = r.z1 - r.z0 - backInset - frontInset;
      if (inabaHigh) {
        // 主殿・館・遠侍の壁際は畳寄せで納める。
        // 畳の外に残る柱際の帯を裸の板床にせず、畳面と上端を揃える。
        // 敷居や引き戸の溝へ張り出さず、既存の部屋の内側だけに収める。
        const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
        const floorY = tatamiBaseY;
        // 畳寄せも無地の帯にせず、床柱と共有の板目を材の長手へ通す。
        // 縦材を回して使い、上面も側面も同じ木目の向きに揃える。
        // 広い館の畳寄せを端から端まで一本材にせず、六尺ほどで継ぐ推定。
        // 継ぎ目の下半分は受け材を残し、上半分の木口だけ一ミリ控える。
        // 隅は前後の材へ左右の材を突き付け、畳面と敷居の高さを保つ。
        // 共通の箱と木目を使い、設営時に既存の木部の束へまとめる。
        const railPiece = (length, x, z, across, width) => {
          const count = Math.max(1, Math.ceil(length / 1.8)), span = length / count;
          for (let j = 0; j < count; j++) {
            const offset = -length / 2 + (j + .5) * span;
            const px = x + (across ? 0 : offset), pz = z + (across ? offset : 0);
            for (let half = 0; half < 2; half++) {
              const near = half && j > 0 ? .001 : 0;
              const far = half && j + 1 < count ? .001 : 0;
              const center = (near - far) / 2;
              const timber = box(g, .03, span - near - far, width,
                px + (across ? 0 : center), floorY + .015 + half * .03,
                pz + (across ? center : 0), 0x604831, 'inabaBoard');
              timber.rotation.z = Math.PI / 2;
              if (across) timber.rotation.y = Math.PI / 2;
            }
          }
        };
        const tatamiRail = (length, x, z, across, width) => {
          let pieces = [[x - (across ? width : length) / 2, x + (across ? width : length) / 2,
            z - (across ? length : width) / 2, z + (across ? length : width) / 2]];
          for (const [x0, x1, z0, z1] of sillCuts) {
            const next = [];
            for (const [a, b, c, d] of pieces) {
              const l = Math.max(a, x0), rr = Math.min(b, x1);
              const back = Math.max(c, z0), front = Math.min(d, z1);
              if (rr <= l || front <= back) { next.push([a, b, c, d]); continue; }
              if (l > a) next.push([a, l, c, d]);
              if (rr < b) next.push([rr, b, c, d]);
              if (back > c) next.push([l, rr, c, back]);
              if (front < d) next.push([l, rr, front, d]);
            }
            pieces = next;
          }
          for (const [a, b, c, d] of pieces) {
            if (b - a < .001 || d - c < .001) continue;
            railPiece(across ? d - c : b - a, (a + b) / 2, (c + d) / 2,
              across, across ? b - a : d - c);
          }
        };
        for (const [z, width] of [[r.z0 + backInset / 2, backInset], [r.z1 - frontInset / 2, frontInset]])
          tatamiRail(r.x1 - r.x0, cx, z, false, width);
        const innerZ = (r.z0 + backInset + r.z1 - frontInset) / 2;
        for (const [x, width] of [[r.x0 + leftInset / 2, leftInset], [r.x1 - rightInset / 2, rightInset]])
          tatamiRail(floorD, x, innerZ, true, width);
      }
      const tiles = inabaHigh
        ? inabaTatamiTiles(r.x0 + leftInset, r.x1 - rightInset, r.z0 + backInset, r.z1 - frontInset)
        : tatamiTiles(r.x0 + .1, r.x1 - .1, r.z0 + .1, r.z1 - .1);
      for (const [cx, cz, w, d, rot = 0] of tiles) {
        const x = cx - w / 2, z = cz - d / 2, floorY = tatamiBaseY;
        // 稲葉山の畳は寄せ敷きにし、二センチの隙間から下地板を見せない。
        // 回した畳も同じ三ミリの目地とし、専用の畳縁まで共通の形で揃える。
        const joint = inabaHigh ? .003 : .02;
        if (!inabaHigh && japanese && addNaibu(kb, 'tatami_floor_modular_a', cx, floorY, cz, w - joint, .06, d - joint, rot)) continue;
        if (purchased && !layout.profile) kb.add('Floor_Tatami', x, floorY + .035, z + d, 0, w / 2, .12, d / 2);
        else place(g, inabaTatami(w - joint, d - joint, inabaHigh), cx, cz, rot, floorY);
      }
    } else if (inabaHigh && r.floor === 'earth') {
      // 番所・兵糧蔵・長屋の入口は土間。共通の下地板を土の表面で覆い、
      // 奥の上げ床・敷居とは分ける。床の当たりと通れる高さはそのまま使う。
      // 土粒と踏み跡を土間全体へ引き伸ばさず、一・五歩ごとの実寸で繰り返す。
      // 材質は全棟で、張る形は同寸の土間で共有し、設営時の束へまとめる。
      const width = r.x1 - r.x0, depth = r.z1 - r.z0;
      const floor = box(g, width, .006, depth,
        (r.x0 + r.x1) / 2, (r.y || 0), (r.z0 + r.z1) / 2, 0xffffff, 'earth');
      const key = `稲葉山の土間:${width}:${depth}`;
      if (!shapes.has(key)) {
        const geo = floor.geometry.clone(), uv = geo.attributes.uv;
        for (let i = 0; i < uv.count; i++)
          uv.setXY(i, uv.getX(i) * width / 1.5, uv.getY(i) * depth / 1.5);
        shapes.set(key, geo);
      }
      floor.geometry = shapes.get(key);
    } else if (r.floor === 'boards' && (r.y > 0 || inabaHigh) && layout.profile === 'inabayama') {
      // 外陣・縁側も上げ床と同じ板割りで納める推定。高さのない床組みは重ねない。
      // 設営時に共通の部品へまとめ、歩く床と戸の敷居の高さを保つ。
      const floorY = r.y || 0;
      const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
      if (floorY > 0) raisedFloor(r, floorY, inabaHigh ? .04 : 0);
      // 主殿・山麓館の縁側と遠侍の入口も框で板端を包む推定の納まり。
      // 板割りと角釘を框の内側へ収め、畳寄せや障子の敷居へ木口を出さない。
      const framedFloor = inabaHigh && ['goten', 'tamari', 'hondo', 'kura', 'bansho', 'nagaya', 'shrine'].includes(layout.kind);
      if (!inabaHigh) for (let x = r.x0 + .3; x < r.x1; x += .3)
        box(g, .008, .004, r.z1 - r.z0, x, r.y + .002, cz, 0x3a2a1c);
      if (inabaHigh) {
        // 床板と目地は九センチ幅の框の内側で止める。
        // 框より高い板面や継ぎ目を重ねず、段鼻と敷居につながる縁材を見せる。
        const inset = framedFloor ? .09 : 0;
        const left = r.x0 + inset, right = r.x1 - inset;
        const back = r.z0 + inset, front = r.z1 - inset;
        const count = Math.max(1, Math.round((right - left) / .3));
        const boardW = (right - left) / count;
        for (let j = 0; j < count; j++) {
          const x0 = left + j * boardW, x1 = left + (j + 1) * boardW;
          if (j > 0) box(g, .008, .004, front - back,
            x0, floorY + .002, cz, 0x3a2a1c);
          // 木口の継ぎ目で板面も分け、隣の板とは継ぐ位置と古色をずらす推定。
          // 框際に短すぎる端材を残さず、床高・敷居・角釘の位置は保つ。
          // 一つの平面と三色の材質を共有し、設営時に既存の束へまとめる。
          if (x1 - x0 > .008) {
            const key = '稲葉山の板床の面';
            if (!shapes.has(key)) shapes.set(key, new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2));
            let start = back, piece = 0;
            for (let joint = back + (j % 2 ? .9 : 1.8); ; joint += 1.8) {
              const end = joint < front - .18 ? joint : front;
              const near = start + (piece > 0 ? .004 : 0);
              const far = end - (end < front ? .004 : 0);
              const tone = (j + piece) % 3;
              const plank = new THREE.Mesh(shapes.get(key),
                mat(tone === 0 ? 0x6a5038 : tone === 1 ? 0x72573d : 0x644b34, 'inabaBoard'));
              plank.scale.set(x1 - x0 - .008, 1, far - near);
              place(g, plank, (x0 + x1) / 2, (near + far) / 2, 0, floorY + .001);
              if (end === front) break;
              start = end; piece++;
            }
          }
          // 板の木口は継ぎ目の前後で留める推定の納まり。
          // 目地だけの面にせず、框際も同じ角釘の頭で留める。
          // 板の内側だけに置き、既存の束へ結合する。床高と当たりは増やさない。
          const nailInset = Math.min(.04, boardW * .2);
          for (const x of [x0 + nailInset, x1 - nailInset])
            for (const z of [back + .04, front - .04])
              box(g, .012, .002, .012, x, floorY + .002, z, 0x39332b);
          for (let z = back + (j % 2 ? .9 : 1.8); z < front - .18; z += 1.8) {
            box(g, x1 - x0, .004, .008, (x0 + x1) / 2, floorY + .002, z, 0x3a2a1c);
            // 端の短い板では框際の留めと重ねず、木口から四センチ離す。
            for (const end of [-1, 1]) {
              const nailZ = z + end * .04;
              if (nailZ <= back + .08 || nailZ >= front - .08) continue;
              for (const x of [x0 + nailInset, x1 - nailInset])
                box(g, .012, .002, .012, x, floorY + .002, nailZ, 0x39332b);
            }
          }
        }
      }
      if (framedFloor) {
        // 内陣・用屋の段鼻と座敷前の板間を框で納め、引き戸の敷居へつなぐ。
        // 左右も框で板の木口を包み、四隅は前後の框の内側へ納める。
        // 既存の箱と材質を共有し、床の高さも通れる幅も変えない。
        // 段鼻と板端の框にも長手の板目を通し、床板との取り合いを見せる。
        // 長屋・館の長い框は相欠きで継ぐ推定の納まり。
        // 上下半分の木口を八センチずつずらし、材の端と隅の突き付けは保つ。
        // 共通の箱と板目を使い、設営時に既存の床の束へまとめる。
        const floorFrame = (length, x, z, alongZ) => {
          const count = Math.max(1, Math.ceil(length / 2.4)), span = length / count;
          for (let j = 0; j < count; j++) for (let half = 0; half < (count > 1 ? 2 : 1); half++) {
            const shift = half ? .08 : -.08;
            const start = -length / 2 + j * span + (j > 0 ? shift + .001 : 0);
            const end = -length / 2 + (j + 1) * span + (j + 1 < count ? shift - .001 : 0);
            const offset = (start + end) / 2, height = count > 1 ? .02 : .04;
            const timber = box(g, height, end - start, .09,
              x + (alongZ ? 0 : offset), floorY - .04 + height * (half + .5),
              z + (alongZ ? offset : 0), 0x493522, 'inabaBoard');
            timber.rotation.z = Math.PI / 2;
            if (alongZ) timber.rotation.y = Math.PI / 2;
          }
        };
        for (const z of [r.z0 + .045, r.z1 - .045])
          floorFrame(r.x1 - r.x0, cx, z, false);
        for (const x of [r.x0 + .045, r.x1 - .045])
          floorFrame(r.z1 - r.z0 - .18, x, cz, true);
      }
    } else if (r.floor === 'earth') box(g, r.x1 - r.x0, .025, r.z1 - r.z0, (r.x0 + r.x1) / 2, (r.y || 0) + .013, (r.z0 + r.z1) / 2, 0x655847);
  }
  if (inabaHigh) {
    // 番所の文机には、板間へ直に座らせず薄縁の座を添える推定。
    // 経机の薄縁は調度側で縁と木口まで組む。同じ場所へ二枚重ねない。
    // 奥座敷の文机は既に畳敷きなので重ねない。戸の引き先と調度の間も空ける。
    // 既存の藺草・縁・箱を共有し、床高と当たりは増やさない。
    for (const p of layout.props) {
      if (p.part !== 'desk') continue;
      const width = Math.min(.75, p.w);
      // 小番所の座は板戸の前へ出さず、残る板間の奥行きへ納める。
      // 座の奥行きは五十センチを下限にし、間仕切りまで六十五センチ空ける。
      // 間取りを反転した場合も、机の向きに沿った手前の端で判断する。
      const direction = Math.cos(p.rot || 0);
      const deskRoom = floorRooms.find(r => r.floor === 'boards'
        && p.x >= r.x0 && p.x <= r.x1 && p.z >= r.z0 && p.z <= r.z1);
      const available = deskRoom && layout.kind === 'bansho'
        ? (direction < 0 ? p.z - deskRoom.z0 : deskRoom.z1 - p.z) - p.d / 2 - .1 - .65
        : .7;
      const depth = Math.min(.7, available);
      if (depth < .5) continue;
      const offset = p.d / 2 + .1 + depth / 2;
      const x = p.x + Math.sin(p.rot || 0) * offset;
      const z = p.z + Math.cos(p.rot || 0) * offset;
      const room = floorRooms.find(r => r.floor === 'boards'
        && x - width / 2 >= r.x0 + .1 && x + width / 2 <= r.x1 - .1
        && z - depth / 2 >= r.z0 + .1 && z + depth / 2 <= r.z1 - .1);
      if (!room) continue;
      if (layout.props.some(q => q !== p
        && Math.abs(q.x - x) < (q.w + width) / 2 + .08
        && Math.abs(q.z - z) < (q.d + depth) / 2 + .08)) continue;
      if ((layout.portals || []).some(v => Math.abs(v.x - x) < 2.3 + width / 2
        && Math.abs(v.z - z) < .3 + depth / 2)) continue;
      const y = room.y || 0;
      inabaUsuberi(g, width, depth, x, y, z);
    }
  }
  if (inabaHigh && layout.kind === 'hondo') {
    // 外陣の礼拝用の薄縁は推定のしつらえ。内陣の格子戸と玄関を結ぶ
    // 中央二・三歩と壁際を板敷きのまま残し、須弥壇の前へ通れるようにする。
    // 厚い畳床や家具の当たりを増やさず、既存の藺草の絵・箱・材質へまとめる。
    for (const r of floorRooms) {
      if (r.name !== '外陣' || r.floor !== 'boards') continue;
      // 玄関戸は外壁から三十四センチ内側の溝を滑る。
      // 両端を四十センチずつ控えるだけでは、薄縁の端と戸の間が
      // 六センチほどしか残らない。玄関側は九十センチ控え、
      // 礼拝の座と戸を開ける立ち所を分ける。反対向きの堂も同じ納まり。
      const naijin = layout.rooms.find(room => room.name === '内陣');
      if (!naijin) continue;
      const entryPositive = r.z0 + r.z1 > naijin.z0 + naijin.z1;
      const back = r.z0 + (entryPositive ? .4 : .9);
      const front = r.z1 - (entryPositive ? .9 : .4);
      const depth = Math.min(1.8, front - back);
      const width = Math.min(.9, (r.x1 - r.x0) / 2 - 1.35);
      if (depth < .9 || width < .6) continue;
      const cx = (r.x0 + r.x1) / 2, cz = (back + front) / 2, y = r.y || 0;
      for (const side of [-1, 1]) {
        const x = cx + side * (1.15 + width / 2);
        inabaUsuberi(g, width, depth, x, y, cz);
      }
    }
  }
  } else {
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
      if (hieiTatami) {
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
      const tatamiInset = hieiTatamiFloor ? .23 : .1;
      const backInset = hieiTatamiFloor && r.z0 === Math.min(...layout.rooms.map(room => room.z0)) ? .23 : .16;
      const frontInset = .16;
      if (hieiTatamiFloor) {
        const width = r.x1 - r.x0, depth = r.z1 - r.z0, yy = (r.y || 0) + .03;
        for (const [z, inset] of [[r.z0 + backInset / 2, backInset], [r.z1 - frontInset / 2, frontInset]]) floorTimber(width, .06, inset, (r.x0 + r.x1) / 2, yy, z);
        for (const x of [r.x0 + tatamiInset / 2, r.x1 - tatamiInset / 2]) floorTimber(tatamiInset, .06, depth - backInset - frontInset, x, yy, (r.z0 + backInset + r.z1 - frontInset) / 2);
      }
      const tiles = hieiTatamiFloor
        ? hieiTatamiTiles(r.x0 + tatamiInset, r.x1 - tatamiInset, r.z0 + backInset, r.z1 - frontInset)
        : tatamiTiles(r.x0 + .1, r.x1 - .1, r.z0 + .1, r.z1 - .1);
      // 僧坊の畳は二センチの板床を露出させず、細い合わせ目で敷き詰める。
      // 比叡山は高画質でも専用部品を使い、畳寄せ・敷居・戸の溝は越えない。
      const seam = hieiTatamiFloor ? .003 : .02;
      for (const [cx, cz, w, d, rot = 0] of tiles) {
        const x = cx - w / 2, z = cz - d / 2, floorY = r.y || 0;
        if (!hieiTatamiFloor && japanese && addNaibu(kb, 'tatami_floor_modular_a', cx, floorY, cz, w - seam, .06, d - seam, rot)) continue;
        if (purchased && !layout.profile) kb.add('Floor_Tatami', x, floorY + .035, z + d, 0, w / 2, .12, d / 2);
        else place(g, hieiTatami(w - seam, d - seam, hieiTatamiFloor), cx, cz, rot, floorY);
      }
      } else {
      // 小座敷は実寸の畳を収め、余りを板縁へ回す。部屋に合わせて畳を伸縮しない。
      // 外周の柱は壁端から十六センチ内側の芯に八センチの半幅を持つ。
      // 畳を十センチだけ引くと柱へ十四センチ食い込むため、柱の内面で止める。
      // 間仕切り側は元の十センチを保ち、襖の敷居と引き込み先を空ける。
      let sideInset = villageHome ? .24 : .1;
      let backInset = villageHome && Math.abs(r.z0 - Math.min(...layout.rooms.map(room => room.z0))) < .001 ? .24 : .1;
      let frontInset = villageHome && Math.abs(r.z1 - Math.max(...layout.rooms.map(room => room.z1))) < .001 ? .24 : .1;
      const width = r.x1 - r.x0 - sideInset * 2, depth = r.z1 - r.z0 - backInset - frontInset;
      let tiles;
      if (villageHome) {
        // 六尺×三尺ほどの推定寸法。狭い奥行きでは横向きにし、切れ端を足さない。
        // 枚数が同じなら奥行きに長い向きを選ぶ。設営時だけ計算し、畳の原形を共有する。
        const across = Math.floor(width / 1.8) * Math.floor(depth / .9);
        const along = Math.floor(width / .9) * Math.floor(depth / 1.8);
        const rotated = across > along, tileW = rotated ? 1.8 : .9, tileD = rotated ? .9 : 1.8;
        const columns = Math.floor(width / tileW), rows = Math.floor(depth / tileD);
        const extraX = (width - columns * tileW) / 2, extraZ = (depth - rows * tileD) / 2;
        sideInset += extraX; backInset += extraZ; frontInset += extraZ;
        tiles = [];
        for (let i = 0; i < columns; i++) for (let j = 0; j < rows; j++)
          tiles.push([r.x0 + sideInset + (i + .5) * tileW,
            r.z0 + backInset + (j + .5) * tileD, tileW, tileD, rotated]);
      } else tiles = tatamiTiles(r.x0 + .1, r.x1 - .1, r.z0 + .1, r.z1 - .1);
      for (const [cx, cz, w, d, rotated] of tiles) {
        const x = cx - w / 2, z = cz - d / 2, floorY = r.y || 0;
        // 設楽原の敷き詰めた畳は二ミリの目地で納める。二センチ引くと板床が帯状に露出する。
        // 畳寄せまで同じ目地幅とし、民家は畳床・縁幅も実寸の作りで揃える。
        const joint = villageHome ? .002 : .02, tw = w - joint, td = d - joint;
        if (!villageHome && japanese && addNaibu(kb, 'tatami_floor_modular_a', cx, floorY, cz, tw, .06, td)) continue;
        if (purchased && !layout.profile) kb.add('Floor_Tatami', x, floorY + .035, z + d, 0, w / 2, .12, d / 2);
        else place(g, tatami(rotated ? td : tw, rotated ? tw : td, villageHome),
          cx, cz, rotated ? Math.PI / 2 : 0, floorY);
      }
      if (villageHome) {
        // 小座敷の畳寄せ。畳の厚みと同じ高さで四周を受け、板縁との境に断面を露出させない。
        // 敷居や壁の外へ出さず、固定の木だけを既存の内装の束へまとめる。
        // 柱の内面まで広げた板縁も六センチ厚に揃え、既存の歩行面を保つ。
        // 四辺は畳と同じ寸法を使い、隅で板同士を重ねない。
        const floorY = r.y || 0;
        let pieces = [
          [r.x0, r.x0 + sideInset, r.z0, r.z1], [r.x1 - sideInset, r.x1, r.z0, r.z1],
          [r.x0 + sideInset, r.x1 - sideInset, r.z0, r.z0 + backInset],
          [r.x0 + sideInset, r.x1 - sideInset, r.z1 - frontInset, r.z1],
        ];
        // 間仕切りの敷居は同じ六センチの高さ。畳寄せを重ねると上面がちらつく。
        // 固定建具と戸口の敷居へ木口を突き付け、その手前には畳寄せを残す。
        // 設営時だけ切り分け、床と通路の高さは保つ。
        const sills = layout.walls.filter(wall => !wall.guideOnly && wall.paper
          && Math.abs(wall.az - wall.bz) <= .001);
        // 間仕切り柱は敷居より奥行きが四センチ大きい。
        // 敷居だけを避けず、端柱・中間柱・戸口の柱の根元まで板縁を切り欠く。
        const postCuts = [];
        const cutPost = (x, z) => postCuts.push([x - .06, x + .06, z - .07, z + .07]);
        for (const wall of sills) {
          const len = Math.abs(wall.bx - wall.ax), center = (wall.ax + wall.bx) / 2;
          const bays = Math.max(1, Math.round(len / 1.8));
          const end = Math.abs(wall.ax) > Math.abs(wall.bx) ? -1 : 1;
          cutPost(center + end * (len / 2 - .06), wall.az);
          for (let j = 1; j < bays; j++) cutPost(center - len / 2 + len * j / bays, wall.az);
        }
        // 中央の開口にも敷居がある。壁のない部分だけ除外すると、
        // 六センチの上面が畳寄せと重なり、出入りのたびに足元がちらつく。
        for (const portal of layout.portals || []) {
          let left = -Infinity, right = Infinity;
          for (const wall of sills) {
            if (Math.abs(wall.az - portal.z) > .01) continue;
            const a = Math.min(wall.ax, wall.bx), b = Math.max(wall.ax, wall.bx);
            if (b <= portal.x + .01) left = Math.max(left, b);
            if (a >= portal.x - .01) right = Math.min(right, a);
          }
          if (Number.isFinite(left) && Number.isFinite(right) && right > left) {
            sills.push({ ax: left, bx: right, az: portal.z, bz: portal.z });
            cutPost(left - .06, portal.z);
            cutPost(right + .06, portal.z);
          }
        }
        const cuts = sills.map(wall => [Math.min(wall.ax, wall.bx), Math.max(wall.ax, wall.bx),
          wall.az - .05, wall.az + .05]).concat(postCuts);
        // 板縁も柱の内面で切り欠く。畳だけを引いても、周りの板が柱脚を貫いてしまう。
        // 内壁と同じ柱割り・見付けを使い、裏板と表の板を一緒に納める。
        // 建物全体の寸法から割り、座敷の奥行きで柱の位置を変えない。
        const x0 = Math.min(...layout.rooms.map(room => room.x0));
        const x1 = Math.max(...layout.rooms.map(room => room.x1));
        const z0 = Math.min(...layout.rooms.map(room => room.z0));
        const z1 = Math.max(...layout.rooms.map(room => room.z1));
        for (const face of ['z', 'x']) {
          const len = face === 'z' ? x1 - x0 : z1 - z0, span = len + .18;
          const bays = Math.max(2, Math.round(span / 1.8));
          const center = face === 'z' ? (x0 + x1) / 2 : (z0 + z1) / 2;
          for (const side of [-1, 1]) for (let i = 0; i <= bays; i++) {
            const corner = i === 0 || i === bays;
            if (face === 'x' && corner) continue;
            const t = corner ? center + (i ? 1 : -1) * (len / 2 - .16)
              : center - span / 2 + span * i / bays;
            const x = face === 'z' ? t : (side < 0 ? x0 + .16 : x1 - .16);
            const z = face === 'x' ? t : (side < 0 ? z0 + .16 : z1 - .16);
            const halfX = face === 'z' ? .08 : .07;
            const halfZ = face === 'x' || corner ? .08 : .07;
            cuts.push([x - halfX, x + halfX, z - halfZ, z + halfZ]);
          }
        }
        for (const [left, right, back, front] of cuts) {
          pieces = pieces.flatMap(([x0, x1, z0, z1]) => {
            const a = Math.max(x0, left), b = Math.min(x1, right);
            const c = Math.max(z0, back), d = Math.min(z1, front);
            if (a >= b || c >= d) return [[x0, x1, z0, z1]];
            return [[x0, a, z0, z1], [b, x1, z0, z1], [a, b, z0, c], [a, b, d, z1]]
              .filter(([x0, x1, z0, z1]) => x1 - x0 > .001 && z1 - z0 > .001);
          });
        }
        for (const [x0, x1, z0, z1] of pieces) {
          // 板縁は長辺へ木目を通し、一間ほどの板を継ぐ推定の納まり。
          // 畳の割り付けで残った幅も一尺以下の板に割り、幅広の一枚板で埋めない。
          // 敷居を避けた範囲を保ち、目地の下には裏板を残して床下を透かさない。
          const alongX = x1 - x0 >= z1 - z0;
          const length = alongX ? x1 - x0 : z1 - z0;
          const width = alongX ? z1 - z0 : x1 - x0;
          const count = Math.max(1, Math.ceil(length / 1.8)), step = length / count;
          const rows = Math.max(1, Math.ceil(width / .3)), rowWidth = width / rows;
          box(g, x1 - x0, .01, z1 - z0, (x0 + x1) / 2, floorY + .005, (z0 + z1) / 2, 0x493829);
          for (let row = 0; row < rows; row++) for (let i = 0; i < count; i++) {
            const back = i * step + (i ? .0015 : 0);
            const front = (i + 1) * step - (i + 1 < count ? .0015 : 0);
            const left = row * rowWidth + (row ? .0015 : 0);
            const right = (row + 1) * rowWidth - (row + 1 < rows ? .0015 : 0);
            const cross = (left + right) / 2;
            const board = templeCeilingBoard(front - back, right - left, (i + row) % 2 ? 0x655039 : 0x59412b, .05);
            place(g, board, alongX ? x0 + (back + front) / 2 : (x0 + x1) / 2,
              alongX ? (z0 + z1) / 2 : z0 + (back + front) / 2,
              alongX ? 0 : Math.PI / 2, floorY + .035);
            // 回転後の短手も板幅ぶんだけずらす。上面・裏板・歩行面の高さは共通。
            if (alongX) board.position.z = z0 + cross;
            else board.position.x = x1 - cross;
          }
        }
      }
      }
    } else if (r.floor === 'earth') {
      const floor = box(g, r.x1 - r.x0, .025, r.z1 - r.z0, (r.x0 + r.x1) / 2,
        (r.y || 0) + (villageHome ? -.0125 : .013), (r.z0 + r.z1) / 2, 0x655847);
      if (villageHome) floor.material = mat(0x655847, 'earth');
    }
  }
  if (inabaHigh) {
    // 番所の文机には、板間へ直に座らせず薄縁の座を添える推定。
    // 経机の薄縁は調度側で縁と木口まで組む。同じ場所へ二枚重ねない。
    // 奥座敷の文机は既に畳敷きなので重ねない。戸の引き先と調度の間も空ける。
    // 既存の藺草・縁・箱を共有し、床高と当たりは増やさない。
    for (const p of layout.props) {
      if (p.part !== 'desk') continue;
      const width = Math.min(.75, p.w), depth = .7;
      const offset = p.d / 2 + .1 + depth / 2;
      const x = p.x + Math.sin(p.rot || 0) * offset;
      const z = p.z + Math.cos(p.rot || 0) * offset;
      const room = floorRooms.find(r => r.floor === 'boards'
        && x - width / 2 >= r.x0 + .1 && x + width / 2 <= r.x1 - .1
        && z - depth / 2 >= r.z0 + .1 && z + depth / 2 <= r.z1 - .1);
      if (!room) continue;
      if (layout.props.some(q => q !== p
        && Math.abs(q.x - x) < (q.w + width) / 2 + .08
        && Math.abs(q.z - z) < (q.d + depth) / 2 + .08)) continue;
      if ((layout.portals || []).some(v => Math.abs(v.x - x) < 2.3 + width / 2
        && Math.abs(v.z - z) < .3 + depth / 2)) continue;
      const y = room.y || 0;
      inabaUsuberi(g, width, depth, x, y, z);
    }
  }
  if (inabaHigh && layout.kind === 'hondo') {
    // 外陣の礼拝用の薄縁は推定のしつらえ。内陣の格子戸と玄関を結ぶ
    // 中央二・三歩と壁際を板敷きのまま残し、須弥壇の前へ通れるようにする。
    // 厚い畳床や家具の当たりを増やさず、既存の藺草の絵・箱・材質へまとめる。
    for (const r of floorRooms) {
      if (r.name !== '外陣' || r.floor !== 'boards') continue;
      // 玄関戸は外壁から三十四センチ内側の溝を滑る。
      // 両端を四十センチずつ控えるだけでは、薄縁の端と戸の間が
      // 六センチほどしか残らない。玄関側は九十センチ控え、
      // 礼拝の座と戸を開ける立ち所を分ける。反対向きの堂も同じ納まり。
      const naijin = layout.rooms.find(room => room.name === '内陣');
      if (!naijin) continue;
      const entryPositive = r.z0 + r.z1 > naijin.z0 + naijin.z1;
      const back = r.z0 + (entryPositive ? .4 : .9);
      const front = r.z1 - (entryPositive ? .9 : .4);
      const depth = Math.min(1.8, front - back);
      const width = Math.min(.9, (r.x1 - r.x0) / 2 - 1.35);
      if (depth < .9 || width < .6) continue;
      const cx = (r.x0 + r.x1) / 2, cz = (back + front) / 2, y = r.y || 0;
      for (const side of [-1, 1]) {
        const x = cx + side * (1.15 + width / 2);
        inabaUsuberi(g, width, depth, x, y, cz);
      }
    }
  }
  }
  // 天井の高い堂・広間は、戸の高さ（約2.3m）で鴨居を通し、上は小壁にする（六メートルの襖を立てない）
  if (layout.profile === 'inabayama') {
  const partitionHead = h, hieiHall = false;
  const temple = ['hondo', 'chudo', 'temple'].includes(layout.kind);
  const inaba = layout.profile === 'inabayama';
  const inabaUtility = inaba && ['kura', 'bansho', 'nagaya'].includes(layout.kind);
  const inabaShrine = inabaHigh && layout.kind === 'shrine';
  // 用屋は可動板戸（naka_doors.js）と同じ梁下の内法高で鴨居をつなぐ。
  // 小祠の固定格子も、動く神前の戸と同じ梁下の高さで納める。
  const beamHead = inabaHigh && (inabaUtility || inabaShrine) ? .4 : .2;
  const ph = inaba ? Math.min(2.3, h - (inabaHigh ? beamHead : .02)) : h > 3 ? 2.3 : h;
  // 座敷の回縁の下面は天井から八センチ下。長押の中心だけを十センチ
  // 下げると十二センチ厚の上端が食い込む。戸口・外周（naka.js）も同寸にする。
  const lowNageshi = inabaHigh && ['goten', 'tamari'].includes(layout.kind);
  const nageshiH = lowNageshi ? .08 : .12;
  const nageshiY = inabaHigh ? Math.min(ph + .42, h - (lowNageshi ? .14 : .1)) : ph + .42;
  if (partitions) for (const v of layout.walls) {
    if (v.guideOnly) continue;
    const len = Math.hypot(v.bx - v.ax, v.bz - v.az);
    // 稲葉山の長い紙の間仕切りは柱間ごとに二枚で納める推定復元。
    // 中間の柱と建具の継ぎ目を揃え、紙の途中に柱を重ねない。
    const framedPaper = inabaHigh && v.paper && ['goten', 'tamari', 'hondo', 'shrine'].includes(layout.kind);
    const pairedShoji = framedPaper && v.kind === 'shoji';
    const pairedKoshi = framedPaper && (temple || inabaShrine && v.kind === 'koshi');
    const pairedFusuma = framedPaper && !pairedShoji && !pairedKoshi && ['goten', 'tamari'].includes(layout.kind);
    const pairedTrack = pairedShoji || pairedKoshi || pairedFusuma;
    // 脇の建具も内法寸法で渡し、共通の框の差し込みを一度だけ使う。
    // 下五ミリ・上八ミリの実が溝底へ食い込まず、動く戸とも上下を揃える。
    const leafBottom = v.sill || 0;
    const leafHeight = ph - leafBottom;
    const spans = framedPaper ? Math.max(1, Math.ceil(len / 1.8)) : 1;
    const n = framedPaper ? spans * 2 : Math.ceil(len / .9);
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
      if (!pairedTrack) box(top, len, .1, .12, 0, ph + .05, 0, 0x3a2a1c);  // 鴨居
      // 稲葉山の本堂は下で組む頭貫・舟肘木で受ける。同じ高さに長押を重ねない。
      if (lowNageshi) {
        // 主殿・館・遠侍の長押も柱上で継ぎ、外周と同じ納まりにする推定。
        // 柱芯の三ミリの継ぎを釘隠しで留め、木目は材の長手へ通す。
        // 既存の板目・箱・材質を共有し、戸の溝や当たりは動かさない。
        for (let j = 0; j < spans; j++) {
          const a = -len / 2 + len * j / spans + (j > 0 ? .0015 : 0);
          const b = -len / 2 + len * (j + 1) / spans - (j + 1 < spans ? .0015 : 0);
          doorTimber(top, b - a, nageshiH, .14, (a + b) / 2, nageshiY, 0, 0x2e2016, true);
        }
      } else if (!inabaShrine && !(inabaHigh && layout.kind === 'hondo'))
        box(top, len, nageshiH, .14, 0, nageshiY, 0, 0x2e2016);    // 内法長押
      const capH = h - ph - .1, capY = ph + .1 + capH / 2;
      if (inabaShrine && capH > .001) {
        // 神前の小壁は柱間へ納め、縦板の木口を上框の下面で止める。
        // 戸口上と同じ納まりにし、板と上框を柱へ貫通させない。
        const headH = Math.min(.04, capH);
        const boardH = capH - headH, boardY = ph + .1 + boardH / 2;
        for (let bay = 0; bay < spans; bay++) {
          const a = -len / 2 + len * bay / spans + (bay === 0 ? .09 : .045);
          const b = -len / 2 + len * (bay + 1) / spans - (bay + 1 === spans ? .09 : .045);
          const bayW = b - a;
          if (bayW <= .001) continue;
          doorTimber(top, bayW, headH, .14, (a + b) / 2,
            h - headH / 2, 0, 0x3a2a1c, true);
          if (boardH <= .001) continue;
          box(top, bayW, boardH, .052, (a + b) / 2, boardY, 0, 0x493522);
          const boards = Math.max(1, Math.ceil(bayW / .3)), width = bayW / boards;
          for (let j = 0; j < boards; j++)
            box(top, width - .004, boardH, .06, a + (j + .5) * width,
              boardY, 0, j % 2 ? 0x725539 : 0x795b3b, 'inabaBoard');
        }
      } else if (lowNageshi && capH > .001) {
        // 主殿・館・遠侍の小壁は、柱と長押の内側へ塗り込める推定の納まり。
        // 一枚の壁を木部へ貫通させず、柱際と長押際で面を止める。
        // 既存の箱・材質へ設営時にまとめ、戸の溝と通行の当たりは保つ。
        const bottom = ph + .1, railBottom = nageshiY - nageshiH / 2;
        const railTop = nageshiY + nageshiH / 2;
        for (let bay = 0; bay < spans; bay++) {
          const a = -len / 2 + len * bay / spans + (bay === 0 ? .09 : .045);
          const b = -len / 2 + len * (bay + 1) / spans - (bay + 1 === spans ? .09 : .045);
          if (b - a <= .001) continue;
          const lowerTop = Math.min(h, railBottom), upperBottom = Math.max(bottom, railTop);
          if (lowerTop > bottom)
            box(top, b - a, lowerTop - bottom, .06, (a + b) / 2,
              (bottom + lowerTop) / 2, 0, 0xcfc6b0, 'inabaPlaster');
          if (h > upperBottom)
            box(top, b - a, h - upperBottom, .06, (a + b) / 2,
              (upperBottom + h) / 2, 0, 0xcfc6b0, 'inabaPlaster');
        }
      } else if (inabaHigh && layout.kind === 'hondo' && capH > .001) {
        // 内陣境の小壁を丸柱・頭貫・舟肘木へ貫通させない。
        // 柱間ごとに塗り止め、上部は肘木の張り出しまで避ける推定の納まり。
        // 頭貫の高さは木部で塞ぐ。既存の箱と壁材を設営時の束へまとめる。
        const postAt = j => j === 0 ? -len / 2 + .07
          : j === spans ? len / 2 - .07 : -len / 2 + len * j / spans;
        const infill = (bottom, ceiling, inset) => {
          const y0 = Math.max(ph + .1, bottom), y1 = Math.min(h, ceiling);
          if (y1 - y0 <= .001) return;
          for (let bay = 0; bay < spans; bay++) {
            const a = postAt(bay) + inset, b = postAt(bay + 1) - inset;
            if (b - a > .001)
              box(top, b - a, y1 - y0, .06, (a + b) / 2, (y0 + y1) / 2, 0, 0xbdb39a, 'inabaPlaster');
          }
        };
        infill(ph + .1, h - .2, .07);
        infill(h - .12, h - .08, .071);
        infill(h - .08, h, .181);
      } else box(top, len, capH, .06, 0, capY, 0, temple ? 0xbdb39a : 0xcfc6b0);   // 小壁
      if (inabaHigh && ['goten', 'tamari', 'hondo', 'shrine'].includes(layout.kind)) {
        // 座敷と本堂の建具を柱・敷居で受ける推定の納まり。戸口の幅と引き戸の溝は空ける。
        // 柱は間仕切り側へ寄せ、開いた戸が通る前後の溝に突き出さない。
        // 本堂の内陣境も外周・内陣隅と同じ丸柱にする推定復元。
        // 上げ床から舟肘木の下面まで立て、柱芯と柱頭を揃える。
        // 半径六センチは固定壁の当たり内で、前後十二センチの戸の溝を空ける。
        const roundPosts = layout.kind === 'hondo';
        // 本堂は礎盤の外径まで固定壁の内側へ控え、格子戸の口へ出さない。
        const postInset = roundPosts ? .07 : .045;
        const postX = j => j === 0 ? -len / 2 + postInset
          : j === spans ? len / 2 - postInset : -len / 2 + len * j / spans;
        const addPost = x => {
          if (!roundPosts) { doorTimber(top, .09, h, .14, x, h / 2, 0, 0x3a2a1c, lowNageshi); return; }
          const key = '稲葉山本堂の間仕切り丸柱';
          if (!shapes.has(key)) shapes.set(key, new THREE.CylinderGeometry(.06, .06, 1, 10));
          // 内陣境も外周と同じ二段の礎盤で受ける推定の納まり。
          // 丸柱の形と材質を共有し、柱身は頭貫の下面で止める。
          const bottom = v.sill || 0, baseH = .06, shaftH = h - .2 - bottom - baseH;
          for (let tier = 0; tier < 2; tier++) {
            const base = new THREE.Mesh(shapes.get(key), mat(tier ? 0x6a5038 : 0x3a2a1c));
            const radius = tier ? .065 : .07;
            base.scale.set(radius / .06, baseH / 2, radius / .06);
            base.position.set(x, bottom + baseH * (tier / 2 + .25), 0);
            top.add(base);
          }
          const post = new THREE.Mesh(shapes.get(key), mat(0x3a2a1c, 'inabaBoard'));
          post.scale.y = shaftH;
          post.position.set(x, bottom + baseH + shaftH / 2, 0);
          top.add(post);
        };
        addPost(postX(0)); addPost(postX(spans));
        // 柱は固定壁の厚みの中に置き、左右へ引く戸の溝へ張り出さない。
        // 既存の箱と材質へまとめ、当たりと開口幅は固定壁のまま保つ。
        if (framedPaper) for (let j = 1; j < spans; j++) addPost(postX(j));
        if (inabaHigh && ['goten', 'tamari'].includes(layout.kind)) {
          // 主殿・山麓館・遠侍の間仕切りも、外周と同じ柱筋で長押を留める推定の納まり。
          // 八角の釘隠しを両面へ納め、開いた襖・障子の溝（前後十二センチ）へ出さない。
          // 形と材質は共有し、設営時に木部と同じ束へまとめる。
          const key = '座敷の釘隠し';
          if (!shapes.has(key)) shapes.set(key,
            new THREE.CylinderGeometry(.04, .04, .012, 8).rotateX(Math.PI / 2));
          for (let j = 0; j <= spans; j++) {
            const x = postX(j);
            for (const side of [-1, 1]) {
              const cap = new THREE.Mesh(shapes.get(key), mat(0x252321));
              cap.position.set(x, nageshiY, side * .076);
              top.add(cap);
              // 外周と同じ留め鋲を両面へ。既存の金具を縮め、戸の溝へ出さない。
              const boss = new THREE.Mesh(shapes.get(key), mat(0x494239));
              boss.scale.set(.3, .3, .5);
              boss.position.set(x, nageshiY, side * .084);
              top.add(boss);
            }
          }
        }
        if (inabaHigh && layout.kind === 'hondo') {
          // 内陣境の柱頭は頭貫でつなぎ、舟肘木で上の桁を受ける推定の納まり。
          // 鴨居より上に収め、開いた格子戸の二本の溝と通り口を空ける。
          // 設営時に既存の箱・材質へまとめ、光源や毎コマの処理は増やさない。
          // 戸口上の頭貫と同じく、固定格子側も材の長手へ木目を通す。
          // 格子戸と共有する木の絵を使い、単色の帯で内陣の木組みを途切れさせない。
          doorTimber(top, len, .08, .12, 0, h - .16, 0, 0x493522, true);
          for (let j = 0; j <= spans; j++) {
            const x = postX(j);
            // 頭貫を丸柱へ通した所に楔を添える推定の納まり。
            // 柱際だけを締め、格子戸が滑る前後十二センチの溝は空ける。
            // 両面で一つの形を共有し、既存の木部の束へ設営時だけ結合する。
            const wedgeKey = '本堂の頭貫の楔';
            if (!shapes.has(wedgeKey)) {
              const geometry = new THREE.BoxGeometry(.12, 1, .025);
              const position = geometry.attributes.position;
              for (let i = 0; i < position.count; i++)
                position.setY(i, position.getY(i) > 0
                  ? .012 + (position.getX(i) + .06) / .12 * .014 : 0);
              geometry.computeVertexNormals();
              shapes.set(wedgeKey, geometry);
            }
            for (const side of [-1, 1]) {
              const wedge = new THREE.Mesh(shapes.get(wedgeKey), mat(0x8a6a48));
              cacheUsers.push(new WeakRef(wedge));
              const inward = j === spans ? -1 : 1;
              wedge.position.set(x + inward * .025, h - .17, side * .0725);
              if (inward < 0) wedge.rotation.y = Math.PI;
              top.add(wedge);
            }
            // 角材を二段重ねるだけにせず、大斗の両脇を皿斗のように立ち上げ、
            // 舟肘木の細い下面を受ける。上面は既存の二本の桁へ届かせる。
            // 大斗の外寸と肘木の桁行幅を揃え、鴨居や格子戸の溝へ下げない。
            box(top, .14, .025, .22, x, h - .1275, 0, 0x493522);
            for (const side of [-1, 1])
              box(top, .14, .035, .025, x, h - .0975, side * .0975, 0x493522);
            inabaHallHijiki(top, .36, .05, .14, x, h - .055, 0);
          }
          for (const z of [-.14, .14])
            doorTimber(top, len, .04, .08, 0, h - .02, z, 0x3a2a1c, true);
        }
        const sill = v.sill || 0;
        // 戸口の敷居と上端を揃え、畳・内陣の床から角材を突き出さない。
        if (pairedTrack) {
          // 脇の襖・障子・格子も黒線だけの平らな框に載せず、六センチ厚の建具を
          // 二本の溝へ納める。中央の動く戸と同じ溝底・縁の高さに揃える。
          // 深さだけを刻み、敷居の上面・建具・柱・外側の引き込み溝は動かさない。
          // 固定建具の敷居・鴨居も可動戸の枠と同じ横木目で納める。
          // 溝底は暗色のまま残し、木部の形・材質は既存の部品を共有する。
          doorTimber(top, len, .032, .16, 0, sill - .024, 0, 0x3a2a1c, true);
          doorTimber(top, len, .088, .16, 0, ph + .056, 0, 0x3a2a1c, true);
          let edge = -.08;
          for (const z of [-.04, .04]) {
            const near = z - .032, width = near - edge;
            if (width > .001) {
              doorTimber(top, len, .008, width, 0, sill - .004, edge + width / 2, 0x3a2a1c, true);
              doorTimber(top, len, .012, width, 0, ph + .006, edge + width / 2, 0x3a2a1c, true);
            }
            box(top, len, .002, .064, 0, sill - .007, z, 0x211b15);
            box(top, len, .002, .064, 0, ph + .011, z, 0x211b15);
            edge = z + .032;
          }
          const width = .08 - edge;
          if (width > .001) {
            doorTimber(top, len, .008, width, 0, sill - .004, edge + width / 2, 0x3a2a1c, true);
            doorTimber(top, len, .012, width, 0, ph + .006, edge + width / 2, 0x3a2a1c, true);
          }
        } else box(top, len, .04, .14, 0, sill - .02, 0, 0x3a2a1c);
        const sillSupport = pairedTrack ? Math.max(0, sill - .04) : sill;
        if (sillSupport) doorTimber(top, len, sillSupport, .08, 0, sillSupport / 2, 0, 0x6a5038, pairedTrack);
      }
      place(g, top, (v.ax + v.bx) / 2, (v.az + v.bz) / 2, rot);
    }
    if (inabaHigh && inabaUtility && !v.paper) {
      // 板の間仕切りを柱・上框・土台で受ける。建具の溝（前後十二センチ）は空ける。
      // 固定壁の範囲だけに組み、開けた板戸が通る口へ柱を足さない。
      const frame = new THREE.Group(), spans = Math.max(1, Math.ceil(len / 1.8));
      for (let j = 0; j <= spans; j++)
        box(frame, .1, h, .14, -len / 2 + .05 + (len - .1) * j / spans, h / 2, 0, 0x3a2a1c, 'inabaBoard');
      // 柱と縦板は縦目、上框・敷居・貫は横目。既存の板目と材質を共有する。
      const crossTimber = (width, height, depth, yy, zz, color) => {
        const timber = box(frame, height, width, depth, 0, yy, zz, color, 'inabaBoard');
        timber.rotation.z = Math.PI / 2;
      };
      // 土間から上げた板床と、動く板戸の敷居を同じ高さで受ける。
      const sill = v.sill || 0;
      // 上框・敷居を柱へ差した仕口は込栓で留める推定の納まり。
      // 板壁へ釘を並べるだけにせず、上下の横木を受ける柱の表へ木口を出す。
      // 柱幅の内側、開いた板戸の溝より奥へ納め、既存の箱と材質を共有する。
      for (let j = 0; j <= spans; j++) {
        const x = -len / 2 + .05 + (len - .1) * j / spans;
        for (const yy of [sill - .02, ph + .05, h - .05]) {
          if (yy - .016 < 0) continue;
          for (const side of [-1, 1])
            box(frame, .032, .032, .008, x, yy, side * .074, 0x8a6a48, 'inabaBoard');
        }
      }
      // 上框と敷居は柱の内面で止める。柱を横断させると見付けの面が
      // 同じ位置へ重なり、近くでちらつく。貫は従来どおり柱筋をつなぐ。
      const postStep = (len - .1) / spans;
      for (let j = 0; j < spans; j++) {
        const width = postStep - .1;
        if (width <= .001) continue;
        const x = -len / 2 + .05 + (j + .5) * postStep;
        for (const [height, yy] of [[.1, h - .05], [.1, ph + .05], [.04, sill - .02]]) {
          const timber = box(frame, height, width, .14, x, yy, 0, 0x3a2a1c, 'inabaBoard');
          timber.rotation.z = Math.PI / 2;
        }
        // 土間側の腰板も柱間へ納め、敷居の下面で止める推定の納まり。
        // 一枚の塊を柱・敷居へ重ねず、上げ床の蹴込みと同じ横目で受ける。
        // 板戸の溝から離れた固定壁内だけに置き、共通の形・絵・材質へまとめる。
        const apronH = sill - .04;
        if (apronH > .001) {
          const apron = box(frame, apronH, width, .08,
            x, apronH / 2, 0, 0x6a5038, 'inabaBoard');
          apron.rotation.z = Math.PI / 2;
        }
        // 戸口の鴨居を脇の柱間まで通し、縦板はその上下で止める推定。
        // 下げた鴨居を板壁へ突き当てず、梁下の小壁まで木組みで受ける。
        // 板戸の溝より奥の固定壁内だけを分け、共通の形・材質へまとめる。
        const bands = [[sill, ph], [ph + .1, h - .1]];
        for (const [bottom, top] of bands) if (top - bottom > .001)
          box(frame, width, top - bottom, .08, x, (bottom + top) / 2, 0, 0x3a2a1c);
        const boards = Math.max(1, Math.ceil(width / .3)), boardW = width / boards;
        for (let k = 0; k < boards; k++) {
          const bx = x - width / 2 + (k + .5) * boardW;
          const color = (j + k) % 3 === 0 ? 0x795b3b : (j + k) % 3 === 1 ? 0x725539 : 0x806143;
          for (const side of [-1, 1]) {
            for (const [bottom, top] of bands) if (top - bottom > .001)
              box(frame, boardW - .008, top - bottom, .004,
                bx, (bottom + top) / 2, side * .042, color, 'inabaBoard');
            for (const yy of [.65, 1.8]) {
              // 貫の表へ角釘を留め、柱際や上げ床の框には重ねない。
              if (yy - .04 <= sill || yy + .1 >= h) continue;
              box(frame, .018, .018, .004, bx, yy, side * .067, 0x29251f);
            }
          }
        }
      }
      // 用屋の板間仕切りも貫で柱同士をつなぐ推定復元。
      // 固定壁の両面に納め、開口と、前後十二センチを滑る板戸の溝は空ける。
      // 箱と材質は既存の物を共有し、設営時に室内の束へまとめる。
      for (const yy of [.65, 1.8]) {
        if (yy - .04 <= sill || yy + .1 >= h) continue;
        for (const side of [-1, 1]) {
          crossTimber(len, .08, .025, yy, side * .0525, 0x493522);
          // 四角い飾りを浮かせず、柱の受け口へ先細りの楔を差す推定の納まり。
          // 単位形は一つだけ作り、両面・全ての用屋で共有する。
          const wedgeKey = '稲葉山の貫楔';
          if (!shapes.has(wedgeKey)) {
            const geo = new THREE.BoxGeometry(1, 1, 1), pos = geo.attributes.position;
            for (let v = 0; v < pos.count; v++) if (pos.getY(v) > 0)
              pos.setY(v, .5 - .8 * (pos.getX(v) + .5));
            pos.needsUpdate = true; geo.computeVertexNormals();
            shapes.set(wedgeKey, geo);
          }
          for (let j = 0; j <= spans; j++) {
            const x = -len / 2 + .05 + (len - .1) * j / spans;
            const inward = j === spans ? -1 : 1;
            box(frame, .085, .012, .004, x, yy + .044, side * .072, 0x211b15);
            const wedge = new THREE.Mesh(shapes.get(wedgeKey), mat(0x8a6a48, 'inabaBoard'));
            wedge.scale.set(.09, .025, .02);
            // 太い木口を柱の外へ残し、細い先を柱側へ向ける。
            wedge.rotation.y = inward > 0 ? Math.PI : 0;
            wedge.position.set(x + inward * .025, yy + .0525, side * .075);
            frame.add(wedge);
          }
        }
      }
      place(g, frame, (v.ax + v.bx) / 2, (v.az + v.bz) / 2, rot);
    }
    for (let i = 0; i < n; i++) {
      let along = len * (i + .5) / n, panelW = len / n;
      if (pairedTrack) {
        // 柱芯で二等分すると縦框が柱の中へ埋まる。各柱の内面で二枚を割る。
        // 本堂の丸柱は礎盤まで含めて十四センチ。座敷の角柱用の九センチでは、
        // 格子戸の縦框が柱脚へ食い込む。上で組んだ礎盤と同じ幅で内面を取り、
        // 座敷の角柱は従来寸法にする。
        // 中央の動く戸と引き込み先の溝・当たりは保ち、固定建具だけを納め直す。
        // 本堂は礎盤の外径まで逃がし、格子の縦框を柱脚へ埋めない。
        const postW = layout.kind === 'hondo' ? .14 : .09;
        const span = Math.floor(i / 2);
        const a = len * span / spans + (span === 0 ? postW : postW / 2);
        const b = len * (span + 1) / spans - (span === spans - 1 ? postW : postW / 2);
        panelW = (b - a) / 2;
        along = a + (i % 2 + .5) * panelW;
      }
      const x = v.ax + (v.bx - v.ax) * along / len, z = v.az + (v.bz - v.az) * along / len;
      if (v.paper && (temple || inabaShrine && v.kind === 'koshi')) {
        const sill = v.sill || 0;
        // 内陣の上がり框まで格子を落とさず、動く戸と下端・上端を揃える。
        if (sill && !pairedKoshi) box(g, len / n, sill, .08, x, sill / 2, z, 0x3a2a1c);
        // 内陣と小祠の神前の脇の格子は、柱間の二枚を敷居・鴨居の溝へ納める。
        // 開けた中央の格子戸は、その外側の溝を通る。部品と材質は共有する。
        const track = pairedKoshi ? (i % 2 ? .04 : -.04) : 0;
        // 柱際の端を保ち、召し合わせの框だけ三センチ重ねる。
        const overlap = pairedKoshi ? .015 : 0, shift = i % 2 ? -overlap / 2 : overlap / 2;
        place(g, inabaKoshi(panelW + overlap, leafHeight, inabaHigh, inabaHigh && i % 2 === 1),
          x + Math.cos(rot) * shift + Math.sin(rot) * track,
          z - Math.sin(rot) * shift + Math.cos(rot) * track,
          rot + (inabaHigh && i % 2 ? Math.PI : 0), leafBottom); continue;
      }
      if (inaba && v.kind === 'koshi') { place(g, inabaKoshi(len / n, ph, inabaHigh, inabaHigh && i % 2 === 1), x, z, rot + (inabaHigh && i % 2 ? Math.PI : 0)); continue; }
      // 稲葉山の縁側は、動く戸だけでなく両脇の間仕切りも明かり障子に揃える。
      if (v.paper && layout.profile === 'inabayama' && v.kind === 'shoji') {
        // 遠侍の固定障子も、動く戸と同じ敷居から鴨居までに収める。
        const sill = v.sill || 0;
        if (sill && !pairedShoji) box(g, len / n, sill, .08, x, sill / 2, z, 0x6a5038);
        // 柱間の二枚を前後の溝へ振り分け、召し合わせに厚みを持たせる。
        // 柱・固定壁の範囲に収め、左右へ開く戸の引き込み先は塞がない。
        const track = pairedShoji ? (i % 2 ? .04 : -.04) : 0;
        const overlap = pairedShoji ? .015 : 0, shift = i % 2 ? -overlap / 2 : overlap / 2;
        place(g, inabaShoji(panelW + overlap, leafHeight, inabaHigh, pairedShoji && i % 2 === 1),
          x + Math.cos(rot) * shift + Math.sin(rot) * track,
          z - Math.sin(rot) * shift + Math.cos(rot) * track,
          rot + (pairedShoji && i % 2 ? Math.PI : 0), leafBottom); continue;
      }
      // この戦の僧坊は入口の動く障子と同じ桟・紙で間仕切りを揃える。
      if (v.paper && hiei && layout.kind === 'sobo') { place(g, inabaShoji(len / n, ph), x, z, rot); continue; }
      if (v.paper && (layout.profile === 'echizen_ikko' && layout.kind === 'sobo' || layout.profile === 'takato' && layout.kind === 'goten')) {
        place(g, v.kind === 'shoji' ? inabaShoji(len / n, ph) : inabaFusuma(len / n, ph), x, z, rot); continue;
      }
      // 御殿・屋敷の間仕切りは絵のある襖（買った板の戸は古びて見えるので、町屋・寺の脇の間だけに使う）
      // 無地指定は建物の用途より優先し、動く戸と脇の固定戸の紙を揃える。
      const painted = v.kind === 'fusumaE' || v.kind !== 'fusuma' && ['goten', 'yashiki', 'shisha'].includes(layout.kind);
      if (v.paper && !painted && !inabaHigh && japanese && addNaibu(kb, 'slide_door_a', x, 0, z, len / n, ph, .06, rot)) continue;
      if (v.paper) {
        // 稲葉山の座敷は柱間の二枚を引き違いに納める。
        // 引手を召し合わせへ向け、動く襖の溝（前後十二センチ）より内側で重ねる。
        // 固定の二枚を同じ面へ貼るだけの納まりを避け、当たりと通り道は保つ。
        const paired = pairedFusuma;
        const leafRot = rot + (paired && i % 2 ? Math.PI : 0);
        // 六センチ厚の縁が交差しない二本の溝へ納める。
        // 柱際の端は保ち、召し合わせだけ三センチ重ねて斜めからの隙間を塞ぐ。
        const track = paired ? (i % 2 ? .04 : -.04) : 0;
        const overlap = paired ? .015 : 0, shift = i % 2 ? -overlap / 2 : overlap / 2;
        const leafX = x + Math.cos(rot) * shift + Math.sin(rot) * track;
        const leafZ = z - Math.sin(rot) * shift + Math.cos(rot) * track;
        place(g, inabaFusuma(panelW + overlap, leafHeight, painted, inabaHigh), leafX, leafZ, leafRot, leafBottom);
      }
      else {
        // 高画質の用屋は上の木組みの柱間へ縦板を納めてある。
        if (inabaHigh && inabaUtility) continue;
        const wall = new THREE.Group(); box(wall, len / n, h, .08, 0, h / 2, 0, 0x795b3b);
        if (inabaUtility) {
          // 外壁と同じ縦板。戸袋側にも板継ぎを入れ、板戸の続きとして見せる。
          const boards = Math.ceil(len / n / .3);
          for (let j = 1; j < boards; j++) box(wall, .008, h, .084, -len / n / 2 + j * len / n / boards, h / 2, 0, 0x3a2a1c);
        }
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
  // 高画質の稲葉山は naka.js が動く戸と同じ寸法で柱・敷居・鴨居・小壁を組む。
  // ここでも重ねると、溝がちらつき、上段では敷居の高さも食い違う。
  // 塗り壁だけは隣の柱間と同じ材質でまとめる。戸口上にも長押・頭貫の
  // 木部を避けた塗り止めを設け、一枚の白い箱を貫通させない。
  if (partitions && inabaHigh && (lowNageshi || layout.kind === 'hondo')) for (const p of layout.portals || []) {
    let l = -Infinity, r = Infinity;
    for (const v of layout.walls) {
      if (v.guideOnly || Math.abs(v.az - p.z) > .01 || Math.abs(v.bz - p.z) > .01) continue;
      const a = Math.min(v.ax, v.bx), b = Math.max(v.ax, v.bx);
      if (b <= p.x + .01 && b > l) l = b;
      if (a >= p.x - .01 && a < r) r = a;
    }
    if (!isFinite(l) || !isFinite(r) || r - l < .5 || r - l > 4.4) continue;
    const top = new THREE.Group(), bottom = ph + .1;
    const railBottom = lowNageshi ? nageshiY - nageshiH / 2 : h - .2;
    const railTop = lowNageshi ? nageshiY + nageshiH / 2 : h - .12;
    const bands = lowNageshi
      ? [[bottom, Math.min(h, railBottom), 0], [Math.max(bottom, railTop), h, 0]]
      : [[bottom, Math.min(h, railBottom), 0],
        [Math.max(bottom, railTop), h - .08, 0],
        [Math.max(bottom, h - .08), h, .11]];
    // 本堂の戸口脇の舟肘木は、柱芯から十八センチ、開口へ十一センチ張り出す。
    // 頭貫上の小壁も高さで分け、肘木の端へ塗り壁を貫通させない。
    for (const [a, b, inset] of bands) {
      if (b - a <= .001) continue;
      box(top, r - l - inset * 2, b - a, .06, 0, (a + b) / 2, 0,
        temple ? 0xbdb39a : 0xcfc6b0, 'inabaPlaster');
    }
    place(g, top, (l + r) / 2, p.z, 0);
  }
  if (partitions && ph < h && !inabaHigh) for (const p of layout.portals || []) {
    let l = -Infinity, r = Infinity;
    for (const v of layout.walls) {
      if (v.guideOnly || (!v.paper && !inaba) || Math.abs(v.az - p.z) > .01 || Math.abs(v.bz - p.z) > .01) continue;
      const a = Math.min(v.ax, v.bx), b = Math.max(v.ax, v.bx);
      if (b <= p.x + .01 && b > l) l = b;
      if (a >= p.x - .01 && a < r) r = a;
    }
    if (!isFinite(l) || !isFinite(r)) continue;
    const top = new THREE.Group(), len = r - l;
    box(top, len, .1, .12, 0, ph + .05, 0, 0x3a2a1c);
    if (!inabaUtility && !inabaShrine) box(top, len, .12, .14, 0, nageshiY, 0, 0x2e2016);
    box(top, len, h - ph - .1, .06, 0, ph + .1 + (h - ph - .1) / 2, 0, inabaUtility || inabaShrine ? 0x795b3b : temple ? 0xbdb39a : 0xcfc6b0);
    if (inabaUtility) {
      // 板倉・番所・長屋は戸の上も板で塞ぎ、座敷用の長押と白い小壁を持ち込まない。
      const boards = Math.ceil(len / .3);
      for (let j = 1; j < boards; j++) box(top, .008, h - ph - .1, .064, -len / 2 + j * len / boards, (h + ph + .1) / 2, 0, 0x3a2a1c);
    }
    const trackLen = inaba && S.quality === 'high' ? len * 2 : len;
    const track = inaba && S.quality === 'high' ? .12 : .027;
    const trackDepth = trackLen > len ? track * 2 + .08 : .1;
    box(top, trackLen, .04, trackDepth, 0, (p.sill || 0) + .02, 0, 0x3a2a1c);   // 敷居
    if (trackLen > len) box(top, trackLen, .1, trackDepth, 0, ph + .05, 0, 0x3a2a1c); // 引き込む先まで鴨居を通す
    if (inaba) {
      // 戸の外側に柱を納め、開口幅は狭めない。共通の箱と材質で戸の溝も添える。
      for (const x of [-len / 2 - .04, len / 2 + .04]) box(top, .08, h, .14, x, h / 2, 0, 0x3a2a1c);
      for (const z of [-track, track]) {
        box(top, trackLen, .006, .008, 0, (p.sill || 0) + .043, z, 0x211b15);
        box(top, trackLen, .006, .008, 0, ph - .004, z, 0x211b15);
      }
    }
    place(g, top, (l + r) / 2, p.z, 0);
  }
  } else {
  const inaba = false, inabaUtility = false, lowNageshi = false, nageshiH = .12;
  const temple = ['hondo', 'chudo', 'temple'].includes(layout.kind);
  const hieiHall = layout.profile === 'hieizan' && ['hondo', 'chudo'].includes(layout.kind);
  // 比叡山の僧坊は竿縁天井まで戸を伸ばさず、二メートルの建具の上に鴨居・小壁を納める。
  const ph = hieiPartitionHeight(layout.kind, h);
  // 比叡山は外周・柱列と同じ高さで長押を回す。低い僧坊でも天井との間を残す。
  const nageshiY = hieiNageshiHeight(layout.kind, h);
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
    const sill = hieiSobo ? HIEI_SOBO_SILL : .04;
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
    const pairedFusuma = false, leafHeight = ph, leafBottom = 0;
    const rot = Math.atan2(-(v.bz - v.az), v.bx - v.ax);
    if (layout.profile === 'hieizan' && v.paper) {
      // 固定の建具も敷居と鴨居の二本溝で受ける。
      // 動く戸の持ち出した溝とは分け、壁の線に納める。
      const sill = new THREE.Group();
      const sillH = hieiSobo ? HIEI_SOBO_SILL : .04;
      // 堂の内陣境も僧坊と同じく端柱の内面で止め、柱脚へ溝ごと貫通させない。
      // 柱との接合は下で短い枘と込栓を補う。建具の幅・二本溝の位置は保つ。
      if (panelSpan > .001) hieiGroovedSill(sill, panelSpan, sillH, .14);
      place(g, sill, (v.ax + v.bx) / 2, (v.az + v.bz) / 2, rot);
    }
    if (v.paper && ph < h) {
      const top = new THREE.Group();
      // 通し柱へ二本溝を彫り抜かず、鴨居本体を柱の内面で止める。
      // 接合は下の枘と込栓で受け、動く戸の溝・開口幅は保つ。
      if (panelSpan > .001) hieiGroovedKamoi(top, panelSpan, ph, .14);
      partitionNageshi(top, len);
      partitionTop(top, len, inset);

      place(g, top, (v.ax + v.bx) / 2, (v.az + v.bz) / 2, rot);
    }
    if (inabaHigh && inabaUtility && !v.paper) {
      // 板の間仕切りを柱・上框・土台で受ける。建具の溝（前後十二センチ）は空ける。
      // 固定壁の範囲だけに組み、開けた板戸が通る口へ柱を足さない。
      const frame = new THREE.Group(), spans = Math.max(1, Math.ceil(len / 1.8));
      for (let j = 0; j <= spans; j++)
        box(frame, .1, h, .14, -len / 2 + .05 + (len - .1) * j / spans, h / 2, 0, 0x3a2a1c, 'inabaBoard');
      // 柱と縦板は縦目、上框・敷居・貫は横目。既存の板目と材質を共有する。
      const crossTimber = (width, height, depth, yy, zz, color) => {
        const timber = box(frame, height, width, depth, 0, yy, zz, color, 'inabaBoard');
        timber.rotation.z = Math.PI / 2;
      };
      // 土間から上げた板床と、動く板戸の敷居を同じ高さで受ける。
      const sill = v.sill || 0;
      // 上框・敷居を柱へ差した仕口は込栓で留める推定の納まり。
      // 板壁へ釘を並べるだけにせず、上下の横木を受ける柱の表へ木口を出す。
      // 柱幅の内側、開いた板戸の溝より奥へ納め、既存の箱と材質を共有する。
      for (let j = 0; j <= spans; j++) {
        const x = -len / 2 + .05 + (len - .1) * j / spans;
        for (const yy of [sill - .02, ph + .05, h - .05]) {
          if (yy - .016 < 0) continue;
          for (const side of [-1, 1])
            box(frame, .032, .032, .008, x, yy, side * .074, 0x8a6a48, 'inabaBoard');
        }
      }
      // 上框と敷居は柱の内面で止める。柱を横断させると見付けの面が
      // 同じ位置へ重なり、近くでちらつく。貫は従来どおり柱筋をつなぐ。
      const postStep = (len - .1) / spans;
      for (let j = 0; j < spans; j++) {
        const width = postStep - .1;
        if (width <= .001) continue;
        const x = -len / 2 + .05 + (j + .5) * postStep;
        for (const [height, yy] of [[.1, h - .05], [.1, ph + .05], [.04, sill - .02]]) {
          const timber = box(frame, height, width, .14, x, yy, 0, 0x3a2a1c, 'inabaBoard');
          timber.rotation.z = Math.PI / 2;
        }
        // 土間側の腰板も柱間へ納め、敷居の下面で止める推定の納まり。
        // 一枚の塊を柱・敷居へ重ねず、上げ床の蹴込みと同じ横目で受ける。
        // 板戸の溝から離れた固定壁内だけに置き、共通の形・絵・材質へまとめる。
        const apronH = sill - .04;
        if (apronH > .001) {
          const apron = box(frame, apronH, width, .08,
            x, apronH / 2, 0, 0x6a5038, 'inabaBoard');
          apron.rotation.z = Math.PI / 2;
        }
        // 戸口の鴨居を脇の柱間まで通し、縦板はその上下で止める推定。
        // 下げた鴨居を板壁へ突き当てず、梁下の小壁まで木組みで受ける。
        // 板戸の溝より奥の固定壁内だけを分け、共通の形・材質へまとめる。
        const bands = [[sill, ph], [ph + .1, h - .1]];
        for (const [bottom, top] of bands) if (top - bottom > .001)
          box(frame, width, top - bottom, .08, x, (bottom + top) / 2, 0, 0x3a2a1c);
        const boards = Math.max(1, Math.ceil(width / .3)), boardW = width / boards;
        for (let k = 0; k < boards; k++) {
          const bx = x - width / 2 + (k + .5) * boardW;
          const color = (j + k) % 3 === 0 ? 0x795b3b : (j + k) % 3 === 1 ? 0x725539 : 0x806143;
          for (const side of [-1, 1]) {
            for (const [bottom, top] of bands) if (top - bottom > .001)
              box(frame, boardW - .008, top - bottom, .004,
                bx, (bottom + top) / 2, side * .042, color, 'inabaBoard');
            for (const yy of [.65, 1.8]) {
              // 貫の表へ角釘を留め、柱際や上げ床の框には重ねない。
              if (yy - .04 <= sill || yy + .1 >= h) continue;
              box(frame, .018, .018, .004, bx, yy, side * .067, 0x29251f);
            }
          }
        }
      }
      // 用屋の板間仕切りも貫で柱同士をつなぐ推定復元。
      // 固定壁の両面に納め、開口と、前後十二センチを滑る板戸の溝は空ける。
      // 箱と材質は既存の物を共有し、設営時に室内の束へまとめる。
      for (const yy of [.65, 1.8]) {
        if (yy - .04 <= sill || yy + .1 >= h) continue;
        for (const side of [-1, 1]) {
          crossTimber(len, .08, .025, yy, side * .0525, 0x493522);
          // 四角い飾りを浮かせず、柱の受け口へ先細りの楔を差す推定の納まり。
          // 単位形は一つだけ作り、両面・全ての用屋で共有する。
          const wedgeKey = '稲葉山の貫楔';
          if (!shapes.has(wedgeKey)) {
            const geo = new THREE.BoxGeometry(1, 1, 1), pos = geo.attributes.position;
            for (let v = 0; v < pos.count; v++) if (pos.getY(v) > 0)
              pos.setY(v, .5 - .8 * (pos.getX(v) + .5));
            pos.needsUpdate = true; geo.computeVertexNormals();
            shapes.set(wedgeKey, geo);
          }
          for (let j = 0; j <= spans; j++) {
            const x = -len / 2 + .05 + (len - .1) * j / spans;
            const inward = j === spans ? -1 : 1;
            box(frame, .085, .012, .004, x, yy + .044, side * .072, 0x211b15);
            const wedge = new THREE.Mesh(shapes.get(wedgeKey), mat(0x8a6a48, 'inabaBoard'));
            wedge.scale.set(.09, .025, .02);
            // 太い木口を柱の外へ残し、細い先を柱側へ向ける。
            wedge.rotation.y = inward > 0 ? Math.PI : 0;
            wedge.position.set(x + inward * .025, yy + .0525, side * .075);
            frame.add(wedge);
          }
        }
      }
      place(g, frame, (v.ax + v.bx) / 2, (v.az + v.bz) / 2, rot);
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
        const sill = .04;
        place(g, hieiKoshi(panelW, ph - sill, false, hieiHall), panelX, panelZ, rot, sill); continue;
      }
      // 比叡山の僧坊も、入口は障子、奥の座敷は襖。動く戸と脇の建具を揃える。
      if (v.paper && hiei && layout.kind === 'sobo') {
        // 動く戸と同じく、下框を敷居へ埋めず上面で受ける。
        const sill = hieiSobo ? HIEI_SOBO_SILL : 0;
        const plain = hieiSobo && v.kind !== 'shoji';
        // 襖の引き手を戸口へ向ける。障子は紙を同じ側へ張ったまま使う。
        const portal = hieiSobo && layout.portals.find(p => Math.abs(p.z - v.az) < .01);
        const reverse = plain && portal && x > portal.x;
        place(g, plain ? hieiFusuma(panelW, ph - sill, false, true) : hieiShoji(panelW, ph - sill, hieiSobo), panelX, panelZ, rot + (reverse ? Math.PI : 0), sill); continue;
      }
      if (v.paper && (layout.profile === 'echizen_ikko' && layout.kind === 'sobo' || layout.profile === 'takato' && layout.kind === 'goten')) {
        place(g, v.kind === 'shoji' ? hieiShoji(len / n, ph) : hieiFusuma(len / n, ph), x, z, rot); continue;
      }
      // 御殿・屋敷の間仕切りは絵のある襖（買った板の戸は古びて見えるので、町屋・寺の脇の間だけに使う）
      // 遠侍は動く戸も脇の固定戸も無地の和紙で揃え、同じ襖の形・溝・敷居を使う。
      const painted = ['goten', 'yashiki', 'shisha'].includes(layout.kind);
      if (v.paper && !painted && !inabaHigh && japanese && addNaibu(kb, 'slide_door_a', x, 0, z, len / n, ph, .06, rot)) continue;
      if (v.paper) {
        // 稲葉山の座敷は柱間の二枚を引き違いに納める。
        // 引手を召し合わせへ向け、動く襖の溝（前後十二センチ）より内側で重ねる。
        // 固定の二枚を同じ面へ貼るだけの納まりを避け、当たりと通り道は保つ。
        const paired = pairedFusuma;
        const leafRot = rot + (paired && i % 2 ? Math.PI : 0);
        // 六センチ厚の縁が交差しない二本の溝へ納める。
        // 柱際の端は保ち、召し合わせだけ三センチ重ねて斜めからの隙間を塞ぐ。
        const track = paired ? (i % 2 ? .04 : -.04) : 0;
        const overlap = paired ? .015 : 0, shift = i % 2 ? -overlap / 2 : overlap / 2;
        const leafX = x + Math.cos(rot) * shift + Math.sin(rot) * track;
        const leafZ = z - Math.sin(rot) * shift + Math.cos(rot) * track;
        place(g, hieiFusuma(panelW + overlap, leafHeight, painted, inabaHigh), leafX, leafZ, leafRot, leafBottom);
      }
      else {
        // 高画質の用屋は上の木組みの柱間へ縦板を納めてある。
        if (inabaHigh && inabaUtility) continue;
        const wall = new THREE.Group(); box(wall, len / n, h, .08, 0, h / 2, 0, 0x795b3b);
        if (inabaUtility) {
          // 外壁と同じ縦板。戸袋側にも板継ぎを入れ、板戸の続きとして見せる。
          const boards = Math.ceil(len / n / .3);
          for (let j = 1; j < boards; j++) box(wall, .008, h, .084, -len / n / 2 + j * len / n / boards, h / 2, 0, 0x3a2a1c);
        }
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
        if ((hieiSobo || hieiHall) && b - a > .24) {
          // 敷居の枘は溝底より下で柱へ差し、前後の込栓で留める推定の納まり。
          // 柱の内面を基準にし、戸の引き込み先・畳・通路へは出さない。
          const inward = x < (a + b) / 2 ? 1 : -1;
          const jointX = x + inward * .06;
          const jointY = hieiSobo ? .025 : .018;
          hieiRitualTimber(g, .06, hieiSobo ? .025 : .018, .04, jointX, jointY, v.az, 0x795b3b);
          for (const side of [-1, 1]) box(g, .012, .012, .008,
            x + inward * .045, jointY, v.az + side * .064, 0x95704a);
        }
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
          if (b - a > .24) {
            const inward = x < (a + b) / 2 ? 1 : -1;
            hieiRitualTimber(g, .12, .05, .06, x + inward * .03,
              ph + .055, v.az, 0x795b3b);
          }
          for (const side of [-1, 1]) box(g, .025, .035, .008,
            x, ph + .05, v.az + side * .064, 0x95704a);
        }
      }
    }
  }
  // 戸口の上も鴨居と小壁でふさぐ（引き戸は naka_doors.js が戸口にはめる）
  // 高画質の稲葉山は naka.js が動く戸と同じ寸法で柱・敷居・鴨居・小壁を組む。
  // ここでも重ねると、溝がちらつき、上段では敷居の高さも食い違う。
  // 塗り壁だけは隣の柱間と同じ材質でまとめる。戸口上にも長押・頭貫の
  // 木部を避けた塗り止めを設け、一枚の白い箱を貫通させない。
  if (partitions && inabaHigh && (lowNageshi || layout.kind === 'hondo')) for (const p of layout.portals || []) {
    let l = -Infinity, r = Infinity;
    for (const v of layout.walls) {
      if (v.guideOnly || Math.abs(v.az - p.z) > .01 || Math.abs(v.bz - p.z) > .01) continue;
      const a = Math.min(v.ax, v.bx), b = Math.max(v.ax, v.bx);
      if (b <= p.x + .01 && b > l) l = b;
      if (a >= p.x - .01 && a < r) r = a;
    }
    if (!isFinite(l) || !isFinite(r) || r - l < .5 || r - l > 4.4) continue;
    const top = new THREE.Group(), bottom = ph + .1;
    const railBottom = lowNageshi ? nageshiY - nageshiH / 2 : h - .2;
    const railTop = lowNageshi ? nageshiY + nageshiH / 2 : h - .12;
    const bands = lowNageshi
      ? [[bottom, Math.min(h, railBottom), 0], [Math.max(bottom, railTop), h, 0]]
      : [[bottom, Math.min(h, railBottom), 0],
        [Math.max(bottom, railTop), h - .08, 0],
        [Math.max(bottom, h - .08), h, .11]];
    // 本堂の戸口脇の舟肘木は、柱芯から十八センチ、開口へ十一センチ張り出す。
    // 頭貫上の小壁も高さで分け、肘木の端へ塗り壁を貫通させない。
    for (const [a, b, inset] of bands) {
      if (b - a <= .001) continue;
      box(top, r - l - inset * 2, b - a, .06, 0, (a + b) / 2, 0,
        temple ? 0xbdb39a : 0xcfc6b0, 'inabaPlaster');
    }
    place(g, top, (l + r) / 2, p.z, 0);
  }
  if (partitions && ph < h && !inabaHigh) for (const p of layout.portals || []) {
    let l = -Infinity, r = Infinity;
    for (const v of layout.walls) {
      if (v.guideOnly || (!v.paper && !inaba) || Math.abs(v.az - p.z) > .01 || Math.abs(v.bz - p.z) > .01) continue;
      const a = Math.min(v.ax, v.bx), b = Math.max(v.ax, v.bx);
      if (b <= p.x + .01 && b > l) l = b;
      if (a >= p.x - .01 && a < r) r = a;
    }
    if (!isFinite(l) || !isFinite(r)) continue;
    const top = new THREE.Group(), len = r - l;
if (layout.profile === 'hieizan') {
    box(top, len, .1, .12, 0, ph + .05, 0, 0x3a2a1c);
    partitionNageshi(top, len);
    partitionTop(top, len);
    {
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
    }   // 敷居
    }
    place(g, top, (l + r) / 2, p.z, 0);
  }
  }
  if (['chudo', 'hondo', 'kuri', 'sobo', 'goten'].includes(layout.kind)) {
    const rs = layout.rooms, hw = Math.max(...rs.map(r => r.x1)), hd = Math.max(...rs.map(r => r.z1));
    // 比叡山の堂は須弥壇の左右に既に油皿があり、明かりもその火先へ焼き込む。
    // 僧坊・庫裏の置き灯明も間取りの調度で描く。固定位置へ同じ灯具を重ねない。
    const altarLit = layout.profile === 'hieizan' && ['chudo', 'hondo', 'sobo', 'kuri'].includes(layout.kind);
    if (!inabaHigh && !altarLit) for (const x of [-hw + .5, hw - .5]) {
      // 比叡山の隅の灯明も須弥壇と同じ油皿・灯芯に揃える。
      // 汎用の灯具へ置き換えず、共通の形と材質を使って一度だけまとめる。
      place(g, hieiTomyo(layout.profile === 'hieizan'), x, hd - .75); place(g, lightPool(), x, hd - .75, 0, .09);
    }
    // 比叡山・越前の堂と僧坊は梁を天井の上へ納め、格縁・竿縁を遮らない。
    if (!['hieizan', 'echizen_ikko', 'takato', 'inabayama'].includes(layout.profile)) for (const z of [-hd * .5, hd * .5]) {
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

// 比叡山の既存の内装も保ち、森部の実寸の建具・畳・灯明とは作り分ける。
function hieiFusuma(w = .9, h = 1.8, painted = false, plain = false) {
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
  hieiFrame(g, w, h, 0x32271c, plain);
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

function hieiFrame(g, w, h, color, fitted = false, gripY = null) {
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

function hieiShoji(w = .9, h = 1.8, kumiko = false) {
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
  hieiFrame(g, w, h, 0x795b3b, kumiko, kumiko ? gripY : null);
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

function hieiKoshi(w = .9, h = 1.8, hikite = false, fitted = hikite) {
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
  if (!fitted) hieiFrame(g, w, h, 0x1e140e);
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

function hieiTatami(w = .9, d = 1.8, flush = false) {
  // 比叡山は素材の読み込み後も、敷居と揃えた畳床・畳表・縁を使う。
  const kit = flush ? null : bought('tatami_floor_modular_a', w, .06, d);
  const g = new THREE.Group();
  const heriW = .044;
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

function hieiTomyo(oil = false) {
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

function hieiPanelInstances(kind, count, w = .9, h = 1.8) {
  // 比叡山は戸口ごとの実寸で組む。戸全体を伸ばして框・引き手まで太らせない。
  // 同じ種類と寸法は保存済みの形・材質を共有する。
  const key = kind + ':' + w + ':' + h + ':' + (cgtOn() && cgtHas('slide_door_a'));
  if (!panels.has(key)) panels.set(key, batchInterior(kind === 'fusuma' ? hieiFusuma(w, h) : kind === 'fusumaPlain' ? hieiFusuma(w, h, false, true) : kind === 'fusumaE' ? hieiFusuma(w, h, true) : kind === 'itado' || kind === 'itadoHiei' ? hieiItado(w, h, kind === 'itadoHiei') : kind === 'koshi' || kind === 'koshiHiei' ? hieiKoshi(w, h, kind === 'koshiHiei') : hieiShoji(w, h, kind === 'shojiHiei')));
  return panels.get(key).children.map((m) => { const copy = new THREE.InstancedMesh(m.geometry, m.material, Math.max(1, count)); cacheUsers.push(new WeakRef(copy)); return copy; });
}


export function hieiRitualTimber(g, w, h, d, x, y, z, color) {
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

function altarOval(g, w, h, d, x, y, z, color) {
  if (!shapes.has('altarOval')) shapes.set('altarOval', new THREE.SphereGeometry(1, 12, 8));
  const m = new THREE.Mesh(shapes.get('altarOval'), mat(color));
  cacheUsers.push(new WeakRef(m)); m.scale.set(w / 2, h / 2, d / 2); m.position.set(x, y, z); g.add(m); return m;
}

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

function hieiScroll(g, length, radius, x, y, z, rot = 0, tied = false) {
  if (!shapes.has('hieiScroll')) shapes.set('hieiScroll', new THREE.CylinderGeometry(1, 1, 1, 8));
  for (const axis of [true, false]) {
    const m = new THREE.Mesh(shapes.get('hieiScroll'), mat(axis ? 0x59412b : 0xcac1a5));
    cacheUsers.push(new WeakRef(m));
    m.scale.set(axis ? radius * .3 : radius, axis ? length : length * .86, axis ? radius * .3 : radius);
    m.rotation.set(0, rot, Math.PI / 2); m.position.set(x, y, z); g.add(m);
  }
  if (tied) {
    // 棚へ納める経巻は巻き留めの紐で閉じ、机上の開いた経巻と分ける。
    // 意匠は推定。紙の外側だけへ細い輪と結び目を置き、巻物の外寸内へ納める。
    // 輪は共有の円筒、結び目は共有の箱。室内の既存のまとめ描きへ含める。
    if (!shapes.has('hieiScrollTie')) shapes.set('hieiScrollTie',
      new THREE.CylinderGeometry(1, 1, 1, 8, 1, true));
    const tieRadius = radius + .001;
    const band = new THREE.Mesh(shapes.get('hieiScrollTie'), mat(0x59412b));
    cacheUsers.push(new WeakRef(band));
    band.scale.set(tieRadius, .006, tieRadius);
    band.rotation.set(0, rot, Math.PI / 2); band.position.set(x, y, z); g.add(band);
    const knot = box(g, .012, .006, .014, x, y + tieRadius, z, 0x59412b);
    knot.rotation.y = rot;
    // 結び端は巻紙の上へ寝かせ、棚板や隣の巻物まで垂らさない。
    const tail = box(g, Math.min(.035, length * .15), .003, .005,
      x, y + tieRadius + .0015, z, 0x59412b);
    tail.rotation.y = rot + .35;
  }
}

function villagePicture(kind) {
  if (kind === 'villageWood' && villageWoodTexture) return villageWoodTexture;
  const S = 256, cv = document.createElement('canvas'); cv.width = S; cv.height = S;
  const g = cv.getContext('2d');
  let seed = kind.length * 977 + 13; const R = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  if (kind === 'villageWood') {
    // 設楽原の板戸・腰障子は縦板の木目を共有する。板の割りと立体の目地は既存の形を使う。
    // 白地に薄い濃淡だけを描き、板ごとの木の色を保つ。節や金具の絵を全板へ繰り返さない。
    g.fillStyle = '#eee9dc'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 100; i++) {
      const x = R() * S, bend = (R() - .5) * 12;
      g.strokeStyle = R() < .65 ? 'rgba(66,48,27,.13)' : 'rgba(255,253,240,.2)';
      g.lineWidth = .5 + R();
      g.beginPath(); g.moveTo(x, 0);
      g.bezierCurveTo(x + bend, S / 3, x - bend, S * 2 / 3, x, S);
      g.stroke();
    }
  } else if (kind === 'earth') {
    // 民家の土間は板の色違いにせず、締めた土の粒と擦れを描く。
    // 全戸で一枚を共有し、床の高さ・当たりや毎コマの処理は増やさない。
    g.fillStyle = '#a99b83'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 450; i++) {
      const x = R() * S, y = R() * S, r = 1 + R() * 5;
      g.fillStyle = R() < .5 ? 'rgba(68,54,34,.08)' : 'rgba(218,206,174,.09)';
      g.beginPath(); g.ellipse(x, y, r, r * .65, R() * Math.PI, 0, Math.PI * 2); g.fill();
    }
    for (let i = 0; i < 700; i++) {
      g.fillStyle = R() < .6 ? 'rgba(61,48,31,.15)' : 'rgba(224,211,180,.18)';
      g.fillRect(R() * S, R() * S, 1 + R(), 1 + R());
    }
    // 小さな粒の間に、踏み締められた浅い擦れを残す。深い割れ目や溝にはしない。
    for (let i = 0; i < 24; i++) {
      g.strokeStyle = 'rgba(222,207,176,.12)'; g.lineWidth = 1 + R() * 2;
      const x = R() * S, y = R() * S;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + 4 + R() * 12, y + (R() - .5) * 5); g.stroke();
    }
  } else if (kind === 'tatamiCore') {
    // 畳床の木口は木板でなく、圧した藁の層として描く。設楽原の手作り畳だけで共有する。
    g.fillStyle = '#88734e'; g.fillRect(0, 0, S, S);
    for (let y = 0; y < S; y += 4) {
      g.fillStyle = y % 8 ? 'rgba(57,43,25,.24)' : 'rgba(207,185,134,.3)';
      g.fillRect(0, y, S, 1);
    }
    for (let i = 0; i < 420; i++) {
      g.strokeStyle = R() < .5 ? 'rgba(64,47,27,.3)' : 'rgba(214,191,139,.35)';
      const x = R() * S, y = R() * S;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + 3 + R() * 18, y + (R() - .5) * 3); g.stroke();
    }
  } else if (kind === 'tatamiHeri' || kind === 'tatamiHeriWeave') {
    // 無紋の麻布の推定。黒い塗り板に見えないよう、経糸と緯糸の交点だけ薄く出す。
    g.fillStyle = '#302e26'; g.fillRect(0, 0, S, S);
    for (let q = 0; q < S; q += 4) {
      g.fillStyle = 'rgba(156,146,116,.12)'; g.fillRect(q, 0, 1, S);
      g.fillStyle = 'rgba(10,9,7,.24)'; g.fillRect(0, q, S, 1);
      for (let x = (q % 8 ? 2 : 0); x < S; x += 8) {
        g.fillStyle = 'rgba(177,165,131,.13)'; g.fillRect(x, q, 2, 1);
      }
    }
  } else if (kind === 'tatami' || kind === 'tatamiWeave') {
    g.fillStyle = '#9d9868'; g.fillRect(0, 0, S, S);
    // 藺草の織り目：細い筋と、畳の目ごとの濃淡
    for (let y = 0; y < S; y += 3) { g.fillStyle = `rgba(${R() < 0.5 ? '120,116,76' : '190,184,130'},${0.18 + R() * 0.16})`; g.fillRect(0, y, S, 1 + (R() < 0.3)); }
    for (let i = 0; i < 160; i++) { g.fillStyle = `rgba(${90 + R() * 80},${88 + R() * 70},${50 + R() * 40},0.1)`; g.fillRect(R() * S, R() * S, 6 + R() * 40, 2); }
    // 実寸で繰り返す設楽原の畳表には、大きな染みや明暗を反復させない。
    if (kind !== 'tatamiWeave') {
      // 足の擦れた跡と染み
      for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(60,48,30,0.1)'; g.beginPath(); g.ellipse(R() * S, R() * S, 12 + R() * 30, 6 + R() * 14, R() * 3, 0, 7); g.fill(); }
      const light = g.createLinearGradient(0, 0, S, S); light.addColorStop(0, 'rgba(255,248,212,.16)'); light.addColorStop(1, 'rgba(40,32,20,.14)');
      g.fillStyle = light; g.fillRect(0, 0, S, S);
    }
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
  } else if (kind === 'shoji' || kind === 'shojiPaper' || kind === 'washi') {
    // 障子紙：楮の繊維のむらと、煤けた下の隅。細い桟を組む（縦 4 本×横 6 段ほど。貼り継ぎの線も）
    const paper = g.createRadialGradient(S / 2, S * 0.4, 10, S / 2, S * 0.4, S * 0.78);
    paper.addColorStop(0, '#e6dfc8'); paper.addColorStop(1, '#b9b39c');
    g.fillStyle = paper; g.fillRect(0, 0, S, S);
    if (kind === 'shojiPaperInaba') {
      // 稲葉山の高画質だけ、障子紙を小判の和紙で貼り継いだ推定の納まりにする。
      // 紙ごとの淡い差と糊代を共有の絵へ焼き、組子や戸の形は増やさない。
      const cols = 2, rows = 3, cw = S / cols, ch = S / rows;
      for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
        g.fillStyle = (row + col) % 2 ? 'rgba(255,248,225,.07)' : 'rgba(108,96,73,.035)';
        g.fillRect(col * cw, row * ch, cw, ch);
      }
      for (let col = 1; col < cols; col++) {
        g.fillStyle = 'rgba(116,103,79,.13)'; g.fillRect(col * cw - 1, 0, 3, S);
        g.fillStyle = 'rgba(255,248,225,.15)'; g.fillRect(col * cw + 2, 0, 1, S);
      }
      for (let row = 1; row < rows; row++) {
        g.fillStyle = 'rgba(116,103,79,.13)'; g.fillRect(0, row * ch - 1, S, 3);
        g.fillStyle = 'rgba(255,248,225,.15)'; g.fillRect(0, row * ch + 2, S, 1);
      }
    }
    for (let i = 0; i < 260; i++) { g.strokeStyle = `rgba(${R() < 0.5 ? '255,250,230' : '120,104,80'},${0.1 + R() * 0.12})`; g.lineWidth = 1; g.beginPath(); const x = R() * S, y = R() * S; g.moveTo(x, y); g.lineTo(x + (R() - 0.5) * 30, y + (R() - 0.5) * 12); g.stroke(); }
    const dirt = g.createLinearGradient(0, S * 0.7, 0, S); dirt.addColorStop(0, 'rgba(80,66,46,0)'); dirt.addColorStop(1, 'rgba(80,66,46,0.32)'); g.fillStyle = dirt; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 2; i++) { g.fillStyle = 'rgba(214,205,180,0.8)'; g.fillRect(20 + R() * 190, 20 + R() * 190, 18 + R() * 18, 14 + R() * 12); }   // 破れの貼り直し
    // 組子を立体で組む障子には紙の繊維だけを使い、紙の裏へ木の絵を重ねない。
    if (kind === 'shoji') {
      g.fillStyle = '#4a3624';
      for (let x = 0; x < S; x += S / 4) g.fillRect(x - 2, 0, 4, S);
      for (let y = 0; y < S; y += S / 6) g.fillRect(0, y - 1.5, S, 3);
      g.fillStyle = 'rgba(0,0,0,0.25)'; for (let x = 0; x < S; x += S / 4) g.fillRect(x + 2, 0, 2, S);
    }
  } else if (kind === 'scroll') {
    // 床の間の掛軸。文字は描かず、裂地の表装と紙本の墨竹を一枚に焼く。
    g.fillStyle = '#776c4d'; g.fillRect(0, 0, S, S);
    for (let y = 0; y < S; y += 4) {
      g.fillStyle = 'rgba(215,199,151,.12)'; g.fillRect(0, y, S, 1);
    }
    g.fillStyle = '#b4a77d'; g.fillRect(18, 36, S - 36, 174);
    g.fillStyle = '#d8d0b8'; g.fillRect(25, 43, S - 50, 160);
    g.save(); g.beginPath(); g.rect(25, 43, S - 50, 160); g.clip();
    for (let i = 0; i < 3; i++) {
      const x = 76 + i * 43;
      g.strokeStyle = 'rgba(46,48,37,.72)'; g.lineWidth = 2 + i % 2;
      g.beginPath(); g.moveTo(x, 207); g.lineTo(x + 14, 60 + i * 18); g.stroke();
      for (let j = 0; j < 4; j++) {
        const y = 90 + j * 27, bx = x + (207 - y) * .09;
        g.lineWidth = 1; g.beginPath(); g.moveTo(bx - 3, y); g.lineTo(bx + 4, y); g.stroke();
        for (const side of [-1, 1]) {
          g.beginPath(); g.moveTo(bx, y);
          g.quadraticCurveTo(bx + side * 20, y - 22, bx + side * 34, y - 17);
          g.quadraticCurveTo(bx + side * 20, y - 7, bx, y);
          g.fillStyle = 'rgba(46,48,37,.65)'; g.fill();
        }
      }
    }
    g.restore();
  } else if (kind === 'fusumaM') {
    // 在所の座敷は無地の紙襖として推定復元。金の砂子や御殿向けの松山図を使わない。
    g.fillStyle = '#c6bda5'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 280; i++) {
      g.strokeStyle = R() < .5 ? 'rgba(245,236,211,.16)' : 'rgba(100,86,63,.12)';
      const x = R() * S, y = R() * S;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + 2 + R() * 10, y + (R() - .5) * 3); g.stroke();
    }
    const dirt = g.createLinearGradient(0, S * .7, 0, S);
    dirt.addColorStop(0, 'rgba(80,66,46,0)'); dirt.addColorStop(1, 'rgba(80,66,46,.18)');
    g.fillStyle = dirt; g.fillRect(0, 0, S, S);
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
    // 無地指定の座敷は和紙とする推定。絵襖の金砂子・松の絵と使い分ける。
    const plainFusuma = kind === 'fusumaPlainInaba';
    if (plainFusuma) {
      g.fillStyle = '#d7cdb7'; g.fillRect(0, 0, S, S);
    } else {
      // 襖：地は金茶の砂子紙。下の隅に松と山の墨絵。縁は黒漆
      g.fillStyle = '#cdbd96'; g.fillRect(0, 0, S, S);
      for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(${R() < 0.4 ? '236,214,150' : '150,130,90'},${0.1 + R() * 0.2})`; g.fillRect(R() * S, R() * S, 1 + R() * 3, 1 + R() * 2); }
      const mist = g.createLinearGradient(0, S * 0.45, 0, S); mist.addColorStop(0, 'rgba(120,128,108,0)'); mist.addColorStop(1, 'rgba(90,98,80,0.5)');
      g.fillStyle = mist; g.beginPath(); g.moveTo(0, S * 0.82); g.lineTo(S * 0.28, S * 0.6); g.lineTo(S * 0.46, S * 0.74); g.lineTo(S * 0.76, S * 0.5); g.lineTo(S, S * 0.76); g.lineTo(S, S); g.lineTo(0, S); g.fill();
      g.strokeStyle = '#3c3524'; g.lineWidth = 6; g.beginPath(); g.moveTo(S * 0.25, S * 0.95); g.quadraticCurveTo(S * 0.3, S * 0.6, S * 0.27, S * 0.3); g.stroke();
      g.fillStyle = '#4a5238'; for (const [x, y] of [[0.2, 0.3], [0.33, 0.38], [0.18, 0.46], [0.3, 0.26]]) { g.beginPath(); g.ellipse(S * x, S * y, 36, 9, -0.1, 0, 7); g.fill(); }
    }
    if (kind === 'fusumaPaperInaba' || plainFusuma) {
      // 稲葉山の襖は小判の和紙を貼り継ぐ推定の納まり。
      // 横線だけの巻紙状にせず、縦の継ぎ目を段ごとにずらし、紙ごとの淡いむらも焼く。
      // 固定襖と動く襖で絵を共有し、形の数や毎コマの処理は増やさない。
      const rows = 4, rowH = S / rows;
      for (let row = 0; row < rows; row++) {
        const seamX = S * (row % 2 ? .6 : .4), top = row * rowH;
        g.fillStyle = row % 2 ? 'rgba(247,237,211,.045)' : 'rgba(109,93,65,.025)';
        g.fillRect(0, top, seamX, rowH);
        g.fillStyle = row % 2 ? 'rgba(109,93,65,.025)' : 'rgba(247,237,211,.045)';
        g.fillRect(seamX, top, S - seamX, rowH);
        g.fillStyle = 'rgba(104,88,58,.10)'; g.fillRect(seamX - 1, top, 2, rowH);
        g.fillStyle = 'rgba(244,232,197,.16)'; g.fillRect(seamX + 1, top, 1, rowH);
      }
      for (let row = 1; row < rows; row++) {
        const y = row * rowH;
        g.fillStyle = 'rgba(104,88,58,.10)'; g.fillRect(0, y - 1, S, 2);
        g.fillStyle = 'rgba(244,232,197,.16)'; g.fillRect(0, y + 1, S, 1);
      }
      // 下張り越しの骨当たりを淡く焼き、障子のように木の格子を表へ出さない。
      // 紙の貼り継ぎとは別の割り付けで、下地の縦横の骨を表す推定。
      // 共通の紙の絵だけで表し、見えない内部材や描画の束は増やさない。
      for (let axis = 0; axis < 2; axis++) {
        const bays = axis === 0 ? 3 : 7;
        for (let i = 1; i < bays; i++) {
          const at = S * i / bays;
          const shade = axis === 0 ? g.createLinearGradient(at - 3, 0, at + 3, 0)
            : g.createLinearGradient(0, at - 3, 0, at + 3);
          shade.addColorStop(0, 'rgba(104,88,58,0)');
          shade.addColorStop(.45, 'rgba(104,88,58,.035)');
          shade.addColorStop(.65, 'rgba(244,232,197,.045)');
          shade.addColorStop(1, 'rgba(244,232,197,0)');
          g.fillStyle = shade;
          if (axis === 0) g.fillRect(at - 3, 0, 6, S);
          else g.fillRect(0, at - 3, S, 6);
        }
      }
      for (let i = 0; i < 160; i++) {
        const x = R() * S, y = R() * S;
        g.strokeStyle = i % 2 ? 'rgba(246,233,200,.13)' : 'rgba(114,98,69,.09)';
        g.lineWidth = .5; g.beginPath(); g.moveTo(x, y);
        g.lineTo(x + (R() - .5) * 10, y + 2 + R() * 5); g.stroke();
      }
    }
    const dirt = g.createLinearGradient(0, 0, 0, S); dirt.addColorStop(0, 'rgba(60,48,30,0.18)'); dirt.addColorStop(0.3, 'rgba(60,48,30,0)'); dirt.addColorStop(1, 'rgba(60,48,30,0.25)'); g.fillStyle = dirt; g.fillRect(0, 0, S, S);
    // 稲葉山の襖の縁は実物の框で組む。紙にも黒帯を描くと二重の縁に
    // 見えるため、紙面の端へ黒帯を重ねない。
    if (kind !== 'fusumaPaperInaba' && !plainFusuma) {
      g.fillStyle = 'rgba(30,22,16,0.7)'; g.fillRect(0, 0, S, 5); g.fillRect(0, S - 5, S, 5); g.fillRect(0, 0, 5, S); g.fillRect(S - 5, 0, 5, S);
    }
  }
  if (kind === 'fusumaM') {
    // 森部の襖は小判の和紙を貼り継いだ推定復元。一枚の大きな紙に見せない。
    // 障子の継ぎ目は実際に重ねた紙の端で表す。小判ごとにさらに継ぎ目を描かない。
    // 紙ごとの淡い色差と重ね代だけを共用の絵へ焼き、桟や戸板は増やさない。
    // 縦の継ぎ目は段ごとにずらし、木の格子に見える濃い線を避ける。
    const rows = 6, stepY = S / rows, stepX = S / 3;
    const opacity = .055;
    for (let row = 0; row < rows; row++) {
      const y = row * stepY, offset = row % 2 ? stepX / 2 : 0;
      for (let col = -1; col < 3; col++) {
        const x = col * stepX + offset;
        g.fillStyle = `rgba(244,234,206,${.015 + R() * .025})`;
        g.fillRect(x, y, stepX, stepY);
        if (x > 0 && x < S) {
          g.fillStyle = `rgba(92,78,53,${opacity})`; g.fillRect(x, y, 1.5, stepY);
          g.fillStyle = 'rgba(249,240,215,.08)'; g.fillRect(x + 1.5, y, 1, stepY);
        }
      }
      if (row > 0) {
        g.fillStyle = `rgba(92,78,53,${opacity})`; g.fillRect(0, y, S, 1.5);
        g.fillStyle = 'rgba(249,240,215,.08)'; g.fillRect(0, y + 1.5, S, 1);
      }
    }
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (kind === 'tatamiWeave' || kind === 'tatamiHeriWeave')
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (kind === 'villageWood') villageWoodTexture = t;
  if (kind === 'tatami' || kind === 'tatamiHeri' || kind === 'hieiTatamiCore' || kind === 'hieiShojiPaper' || kind === 'hieiFloorTimber') t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
// 天井板も床・建具と同じ木目を共有する。絵を棟ごとに作り直さない。


function hieiItado(w = .9, h = 1.8, fitted = false) {
  const g = new THREE.Group();
  if (fitted) {
    // 比叡山の外戸は縦板を框へ納め、内側の横桟で受ける推定の作り。
    // 板の目地の奥は薄板で閉じる。戸厚は既存の二本溝と当たりの内側に保つ。
    const inner = w - .08, height = h - .08;
    const count = Math.max(2, Math.ceil(inner / .18)), pitch = inner / count;
    // 手掛けは黒い札を貼らず、板・下地・裏桟を欠いて両面から指を掛ける。
    // 細部は推定。窪みの底を戸厚の中央へ置き、溝と通行の当たりは保つ。
    const gripY = Math.min(.95, h / 2), gripXs = [-w / 2 + .07, w / 2 - .07];
    const timber = (width, tall, depth, x, y, z, color) => {
      let pieces = [[x - width / 2, x + width / 2, y - tall / 2, y + tall / 2]];
      for (const gx of gripXs) {
        const next = [];
        for (const [a, b, c, d] of pieces) {
          const left = Math.max(a, gx - .0125), right = Math.min(b, gx + .0125);
          const bottom = Math.max(c, gripY - .06), top = Math.min(d, gripY + .06);
          if (left >= right || bottom >= top) { next.push([a, b, c, d]); continue; }
          if (left > a) next.push([a, left, c, d]);
          if (right < b) next.push([right, b, c, d]);
          if (bottom > c) next.push([left, right, c, bottom]);
          if (top < d) next.push([left, right, top, d]);
        }
        pieces = next;
      }
      for (const [a, b, c, d] of pieces) hieiRitualTimber(g, b - a, d - c, depth,
        (a + b) / 2, (c + d) / 2, z, color);
    };
    timber(inner, height, .012, 0, h / 2, 0, 0x4a3828);
    for (let i = 0; i < count; i++) timber(pitch - .003, height, .012,
      -inner / 2 + (i + .5) * pitch, h / 2, -.012, i % 2 ? 0x59412b : 0x4a3828);
    for (const y of [h * .25, h * .5, h * .75]) {
      timber(inner, .055, .02, 0, y, .016, 0x2e2218);
      // 縦板を裏桟へ留める釘の頭。板を並べるだけにせず、表側からも
      // 三段の桟へ留まる作りを見せる。焼失前の金具の配置は推定。
      // 手掛けの欠き込みには打たず、戸厚と二本溝の内側へ納める。
      // 小さな角釘を共通の箱・材質で束ね、動く戸の描画回数は増やさない。
      for (let i = 0; i < count; i++) {
        const x = -inner / 2 + (i + .5) * pitch;
        if (Math.abs(y - gripY) < .067
          && gripXs.some(gx => Math.abs(x - gx) < .0195)) continue;
        box(g, .014, .014, .003, x, y, -.0195, 0x241f1a);
      }
      // 横桟を框の側面へ突き付けるだけにせず、短い枘と込栓で留める。
      // 比叡山の板戸だけの推定の仕口。枘は框の中、栓の木口は裏面へ
      // 一ミリだけ出し、手掛けの窪み・戸厚・二本溝の間隔を保つ。
      // 同寸の形と材質を固定の束へまとめ、開閉中の処理は増やさない。
      for (const side of [-1, 1]) {
        hieiRitualTimber(g, .026, .025, .012,
          side * (w / 2 - .033), y, .016, 0x2e2218);
        hieiRitualTimber(g, .01, .012, .032,
          side * (w / 2 - .026), y, .015, 0x795b3b);
      }
    }
    for (const x of [-w / 2 + .02, w / 2 - .02]) {
      hieiRitualTimber(g, .04, h, .06, x, h / 2, 0, 0x241a12);
    }
    for (const y of [.02, h - .02]) hieiRitualTimber(g, inner, .04, .06, 0, y, 0, 0x241a12);
    // 上下の框も縦框へ枘差しし、裏面の込栓で留める推定の納まり。
    // 木口を突き付けるだけで終えず、横桟と同じ部品を共有する。
    // 栓は框の裏へ一ミリだけ出し、上下の実と引き戸の行程は保つ。
    for (const y of [.02, h - .02]) for (const side of [-1, 1]) {
      hieiRitualTimber(g, .026, .02, .02,
        side * (w / 2 - .033), y, 0, 0x241a12);
      hieiRitualTimber(g, .01, .012, .012,
        side * (w / 2 - .026), y, .025, 0x795b3b);
    }
    // 手掛けの底だけでは、欠いた板の端が宙に残り黒い穴に見える。
    // 両面から底へ落ちる側壁を付け、彫り込みの内面を木肌で閉じる。
    // 表は板面、裏は桟の面までとし、框・戸厚・二本溝の外へ出さない。
    for (const x of gripXs) {
      box(g, .025, .12, .002, x, gripY, 0, 0x1a1410);
      for (const [a, b] of [[-.018, -.001], [.001, .026]]) {
        const depth = b - a, z = (a + b) / 2;
        for (const side of [-1, 1]) {
          hieiRitualTimber(g, .004, .12, depth,
            x + side * .0105, gripY, z, 0x4a3828);
          hieiRitualTimber(g, .017, .004, depth,
            x, gripY + side * .058, z, 0x59412b);
        }
      }
    }
    hieiDoorTongues(g, w, h, 0x241a12);
    return g;
  }
  box(g, w - .06, h - .06, .03, 0, h / 2, 0, 0x4a3828);
  for (let k = 1; k < 6; k++) box(g, w - .06, .045, .05, 0, h * k / 6, 0, 0x2e2218);
  frame(g, w, h, 0x241a12);
  box(g, .05, .1, .06, w / 2 - .12, .9, 0, 0x1a1410); return g;
}
// 格子戸：寺の内陣と外陣の境。黒漆の框に細い縦格子と三本の貫。透けて奥の灯が見える
