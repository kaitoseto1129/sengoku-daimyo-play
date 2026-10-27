// 城・寺・屋敷の室内部品。部品の関数を差し替えれば、買った素材でも同じ配置と当たりを使える。
// 形・材質・絵は使い回す。設営時に材質ごとにまとめ、光は絵に焼く（灯りの影や毎コマの生成なし）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { solidRect, tawara } from './props.js';
import { S } from './settings.js';
import { residenceRoofGeo, residenceRoofMat } from './residence_parts.js';
import { addInterior, nakaRoomAt } from './naka.js';
import { interiorLayout } from './interior_layouts.js';
import { addNaibu } from './naibu_kit.js';
import { cgtOn, cgtHas, cgtKitGroup, cgtBox, cgtParts, cgtSpend, KitBatch } from './cgt.js';   // 買った素材（床・畳・柱）。読めていれば差し替える

const cacheUsers = [];
const shapes = new Map(), materials = new Map(), rooms = new Map(), panels = new Map(), templeDecor = new Map(), layoutDecor = new Map();
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
function picture(kind) {
  if (kind === 'inabaBoard' && inabaBoardPicture) return inabaBoardPicture;
  if (kind === 'inabaPlaster' && inabaPlasterPicture) return inabaPlasterPicture;
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
  } else if (kind === 'shoji' || kind === 'shojiPaper' || kind === 'shojiPaperInaba') {
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
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (kind === 'inabaBoard') inabaBoardPicture = t;
  if (kind === 'inabaPlaster') inabaPlasterPicture = t;
  if (kind === 'earth' || kind === 'tatami' || kind === 'tatamiHeri' || kind === 'hieiTatamiCore' || kind === 'hieiShojiPaper' || kind === 'hieiFloorTimber') t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
// 天井板も床・建具と同じ木目を共有する。絵を棟ごとに作り直さない。
export function inabaBoardTexture() { return picture('inabaBoard'); }
function mat(color, kind = '') {
  const key = `${color}:${kind}`;
  if (!materials.has(key)) materials.set(key, new THREE.MeshBasicMaterial({ color, map: kind ? picture(kind) : null }));
  return materials.get(key);
}
function box(g, w, h, d, x, y, z, color, kind = '') {
  const m = new THREE.Mesh(shape(w, h, d), mat(color, kind)); cacheUsers.push(new WeakRef(m)); m.position.set(x, y, z); g.add(m); return m;
}
// 稲葉山の建具の木目は材の長手へ通す。腰板と同じ絵を共有し、
// 横材は設営時に箱を回すだけで、形の数や開閉中の処理を増やさない。
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
// 供具の丸い胴と脚。同じ寸法の形と材質を共有し、室内の束へまとめる。
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
export function itado(w = .9, h = 1.8, inaba = false, reverseRails = false) {
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
export function panelInstances(kind, count, inaba = false, w = .9, h = 1.8) {
  const key = kind + ':' + (cgtOn() && cgtHas('slide_door_a')) + ':' + inaba + ':' + w + ':' + h;
  // 小窓へ背の高い戸を縮めると、框・組子・引手まで細くなる。
  // 稲葉山は実寸で組み、同じ種類・寸法の戸で形と材質を共有する。
  if (!panels.has(key)) panels.set(key, inaba ? batchInterior(kind === 'fusuma' ? inabaFusuma(w, h, false, inaba) : kind === 'fusumaE' ? inabaFusuma(w, h, true, inaba) : kind === 'itado' || kind === 'itadoR' ? itado(w, h, inaba, kind === 'itadoR') : kind === 'koshi' || kind === 'koshiR' ? inabaKoshi(w, h, inaba, kind === 'koshiR') : inabaShoji(w, h, inaba, kind === 'shojiR')) : batchInterior(kind === 'fusuma' ? fusuma(w, h) : kind === 'fusumaPlain' ? fusuma(w, h, false, true) : kind === 'fusumaE' ? fusuma(w, h, true) : kind === 'itado' ? itado(w, h) : kind === 'koshi' || kind === 'koshiHiei' ? koshi(w, h, kind === 'koshiHiei') : shoji(w, h, kind === 'shojiHiei')));
  return panels.get(key).children.map((m) => { const copy = new THREE.InstancedMesh(m.geometry, m.material, Math.max(1, count)); cacheUsers.push(new WeakRef(copy)); return copy; });
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
export function furnishLayout(layout, h = 2.7, { partitions = true, dim = false } = {}) {
  // 今の山岳戦と前の比叡山で調度を共有。出入り案内が使う型の名前は変えない。
  const hiei = layout.profile === 'hiei' || layout.profile === 'hieizan';
  const hieiSobo = layout.profile === 'hieizan' && layout.kind === 'sobo';
  const hieiKuri = layout.profile === 'hieizan' && layout.kind === 'kuri';
  const hieiTatami = hieiSobo || hieiKuri;
  const templeAltar = layout.profile === 'inabayama' && layout.kind === 'hondo' || hiei || layout.profile === 'echizen_ikko' || layout.profile === 'iwamura_hondo' || layout.profile === 'takato' && layout.kind === 'hondo';
  const japanese = !!layout.profile && cgtOn() && cgtHas('naibu_tatami_floor_modular_a');
  const purchased = cgtOn() && cgtHas('Floor_Tatami') && !cgtHas('tatami_floor_modular_a');
  const inabaHigh = layout.profile === 'inabayama' && S.quality === 'high';
  const key = JSON.stringify([layout, h, partitions, dim, purchased, japanese, cgtOn() && cgtHas('tatami_floor_modular_a'), inabaHigh]);
  if (layoutDecor.has(key)) { const copy = layoutDecor.get(key).clone(); cacheUsers.push(new WeakRef(copy)); return copy; }
  const g = new THREE.Group(), kb = purchased || japanese ? new KitBatch() : null;
  for (const p of layout.props) {
    const part = new THREE.Group();
    // 神宮寺の堂は家庭用の仏壇へ替えず、下の須弥壇・本尊・灯明を使う。
    const kit = p.part === 'stove' && !hieiKuri ? bought('furnace_complete', p.w, p.h, p.d) : p.part === 'storage' && !hieiTatami ? bought('drawer_a', p.w, p.h, p.d) : p.part === 'altar' && !templeAltar ? bought('butsudan', p.w, p.h, p.d) : null;
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
      const seat = tatami(p.d - .04, p.w - .04, true);
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
        place(part, tomyo(), -.75, 0, 0, .55); place(part, tomyo(), .75, 0, 0, .55);
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
    else if (p.part === 'tomyo' && hieiTatami) {
      part.add(tomyo(true));
      place(part, lightPool(), 0, 0, 0, .09);
    }
    else if (p.part === 'kyozukue' && layout.profile === 'hieizan') {
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
        hieiScroll(part, bayW - t, radius, x, y, 0);
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
    const pairedFusuma = false, leafHeight = ph, leafBottom = 0;
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
        place(g, fusuma(panelW + overlap, leafHeight, painted, inabaHigh), leafX, leafZ, leafRot, leafBottom);
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
  }
  if (['chudo', 'hondo', 'kuri', 'sobo', 'goten'].includes(layout.kind)) {
    const rs = layout.rooms, hw = Math.max(...rs.map(r => r.x1)), hd = Math.max(...rs.map(r => r.z1));
    // 比叡山の堂は須弥壇の左右に既に油皿があり、明かりもその火先へ焼き込む。
    // 僧坊・庫裏の置き灯明も間取りの調度で描く。固定位置へ同じ灯具を重ねない。
    const altarLit = layout.profile === 'hieizan' && ['chudo', 'hondo', 'sobo', 'kuri'].includes(layout.kind);
    if (!inabaHigh && !altarLit) for (const x of [-hw + .5, hw - .5]) {
      // 比叡山の隅の灯明も須弥壇と同じ油皿・灯芯に揃える。
      // 汎用の灯具へ置き換えず、共通の形と材質を使って一度だけまとめる。
      place(g, tomyo(layout.profile === 'hieizan'), x, hd - .75); place(g, lightPool(), x, hd - .75, 0, .09);
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
