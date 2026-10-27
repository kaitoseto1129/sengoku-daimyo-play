// 城・寺・屋敷の室内部品。部品の関数を差し替えれば、買った素材でも同じ配置と当たりを使える。
// 形・材質・絵は使い回す。設営時に材質ごとにまとめ、光は絵に焼く（灯りの影や毎コマの生成なし）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { solidRect, tawara } from './props.js';
import { S } from './settings.js';
import { residenceRoofGeo, residenceRoofMat } from './residence_parts.js';
import { addInterior, nakaRoomAt } from './naka.js';
import { interiorLayout, shitaragaharaTempleMats, shitaragaharaHomePanels, interiorPartitionHeight, interiorPartitionSpans, igaFixedPanelRange } from './interior_layouts.js';
import { addNaibu } from './naibu_kit.js';
import { cgtOn, cgtHas, cgtKitGroup, cgtBox, cgtParts, cgtSpend, KitBatch } from './cgt.js';   // 買った素材（床・畳・柱）。読めていれば差し替える

// 小堂の格天井の裏板より上へ、梁とその上の架構を逃がす高さ。
export const SHITARAGAHARA_CEILING_LIFT = .12;
const cacheUsers = [];
let earthPicture = null;
const shapes = new Map(), materials = new Map(), rooms = new Map(), panels = new Map(), templeDecor = new Map(), layoutDecor = new Map();
let villageWoodTexture;
let doorWoodTexture, plasterTexture, inabaBoardPicture, inabaPlasterPicture;
export const INABA_ALTAR_SUSPENSION_DROP = .12;
// 御影堂の吊り受け。設営時と内装生成時に同じ格縁・壇の縮尺で割り付ける。
export function nodaCanopySupport(layout, p, h) {
  const inner = layout.rooms.find(r => r.floor === 'boards');
  const sx = p.w / 2.1, sy = p.h / 1.5, sz = p.d;
  const bottom = 2.27, top = (h - .14 - (p.y || 0)) / sy;
  if (!inner || top <= bottom) return null;
  const x0 = inner.x0 + .16, span = inner.x1 - inner.x0 - .32;
  const step = span / Math.max(1, Math.round(span / .75));
  const left = (x0 + Math.floor((p.x - .55 * sx - x0) / step) * step - p.x) / sx;
  const right = (x0 + Math.ceil((p.x + .55 * sx - x0) / step) * step - p.x) / sx;
  return { sx, sy, sz, bottom, top, left, right };
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
  // 建具にも板床と同じ木肌を使い、向きと実寸は箱の側で合わせる。
  if (kind === 'doorWood') return doorWoodTexture ||= picture('floorWood');
  if (kind === 'plasterWall' && plasterTexture) return plasterTexture;
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
  } else if (kind === 'tatami' || kind === 'igaTatami') {
    g.fillStyle = '#9d9868'; g.fillRect(0, 0, S, S);
    // 藺草の織り目：細い筋と、畳の目ごとの濃淡
    for (let y = 0; y < S; y += 3) { g.fillStyle = `rgba(${R() < 0.5 ? '120,116,76' : '190,184,130'},${0.18 + R() * 0.16})`; g.fillRect(0, y, S, 1 + (R() < 0.3)); }
    for (let i = 0; i < 160; i++) { g.fillStyle = `rgba(${90 + R() * 80},${88 + R() * 70},${50 + R() * 40},0.1)`; g.fillRect(R() * S, R() * S, 6 + R() * 40, 2); }
    // 足の擦れた跡と染み
    for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(60,48,30,0.1)'; g.beginPath(); g.ellipse(R() * S, R() * S, 12 + R() * 30, 6 + R() * 14, R() * 3, 0, 7); g.fill(); }
    const light = g.createLinearGradient(0, 0, S, S); light.addColorStop(0, 'rgba(255,248,212,.16)'); light.addColorStop(1, 'rgba(40,32,20,.14)');
    g.fillStyle = light; g.fillRect(0, 0, S, S);
  } else if (kind === 'igaRush') {
    // 四十センチ角のむしろ。横の藁を縦糸で交互に押さえ、座と寝床で目の太さをそろえる。
    g.fillStyle = '#e4d8bb'; g.fillRect(0, 0, S, S);
    for (let y = 0; y < S; y += 4) {
      g.fillStyle = y % 8 ? '#d5c6a4' : '#eee3c9'; g.fillRect(0, y, S, 3);
      g.fillStyle = '#ad9c78'; g.fillRect(0, y + 3, S, 1);
      for (let x = 0; x < S; x += 16) {
        const xx = x + (y % 8 ? 8 : 0);
        g.fillStyle = '#887957'; g.fillRect(xx, y, 2, 4);
        g.fillStyle = '#c6b58e'; g.fillRect(xx, y, 1, 3);
      }
    }
  } else if (kind === 'igaBoard') {
    // 六十センチ角の板肌。縦方向は両端でつなぎ、小窓でも木目を伸ばさない。
    g.fillStyle = '#eee8dc'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 150; i++) {
      const x = R() * S, phase = R() * Math.PI * 2, bend = 1 + R() * 2;
      g.strokeStyle = `rgba(77,59,37,${.04 + R() * .1})`; g.lineWidth = .5 + R();
      for (const offset of [-S, 0, S]) {
        g.beginPath();
        for (let y = 0; y <= S; y += 4) {
          const px = x + offset + Math.sin(y / S * Math.PI * 2 + phase) * bend;
          if (y) g.lineTo(px, y); else g.moveTo(px, y);
        }
        g.stroke();
      }
    }
  } else if (kind === 'igaPlaster') {
    // 土塗りの細かな粒と藁すさ。石積みや白い漆喰にせず、淡い土色を保つ。
    // 継ぎ目をまたぐ粒も描き、壁の途中に絵の四角い境を作らない。
    g.fillStyle = '#eee8dc'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 2400; i++) {
      const x = R() * S, y = R() * S, size = .4 + R() * .8;
      g.fillStyle = i % 2 ? 'rgba(82,64,39,.09)' : 'rgba(255,252,231,.18)';
      for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S])
        g.fillRect(x + dx, y + dy, size, size);
    }
    g.strokeStyle = 'rgba(117,94,56,.13)'; g.lineWidth = .55;
    for (let i = 0; i < 85; i++) {
      const x = R() * S, y = R() * S, angle = R() * Math.PI, len = 1 + R() * 3;
      for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) {
        g.beginPath(); g.moveTo(x + dx, y + dy);
        g.lineTo(x + dx + Math.cos(angle) * len, y + dy + Math.sin(angle) * len); g.stroke();
      }
    }
  } else if (kind === 'igaEarth') {
    // 土間は踏み締めた土。粒と短い藁を一枚へ焼き、各小屋で共有する。
    g.fillStyle = '#82715b'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 2400; i++) {
      g.fillStyle = R() < .5 ? 'rgba(48,38,28,.14)' : 'rgba(199,181,149,.16)';
      g.fillRect(R() * S, R() * S, 1 + R() * 2, 1 + R() * 2);
    }
    g.strokeStyle = 'rgba(184,163,120,.24)'; g.lineWidth = .8;
    for (let i = 0; i < 45; i++) {
      const x = 4 + R() * (S - 8), y = 4 + R() * (S - 8), a = R() * Math.PI;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 3, y + Math.sin(a) * 3); g.stroke();
    }
  } else if (kind === 'igaScroll') {
    // 床の掛物は襖絵を流用せず、裂の表装と紙本の水墨を一枚の絵へまとめる。
    g.fillStyle = '#746c51'; g.fillRect(0, 0, S, S);
    for (let y = 0; y < S; y += 4) {
      g.fillStyle = 'rgba(218,205,165,.12)'; g.fillRect(0, y, S, 1);
    }
    g.fillStyle = '#c5b991'; g.fillRect(24, 38, 208, 174);
    g.fillStyle = '#d7cdb0'; g.fillRect(30, 44, 196, 162);
    // 墨の濃淡で遠山と岸辺を描く。文字や、襖の金砂子・太い縁は入れない。
    for (let i = 0; i < 3; i++) {
      g.fillStyle = `rgba(54,57,47,${.1 + i * .08})`;
      g.beginPath(); g.moveTo(30, 170 + i * 10);
      g.lineTo(74, 102 + i * 22); g.lineTo(112, 144 + i * 10);
      g.lineTo(166, 82 + i * 32); g.lineTo(226, 161 + i * 12);
      g.lineTo(226, 190); g.lineTo(30, 190); g.fill();
    }
    g.strokeStyle = 'rgba(44,44,35,.65)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(54, 192); g.lineTo(61, 159); g.lineTo(51, 145);
    g.moveTo(61, 168); g.lineTo(76, 153); g.stroke();
    for (let i = 0; i < 160; i++) {
      g.fillStyle = 'rgba(75,65,42,.07)'; g.fillRect(30 + R() * 196, 44 + R() * 162, 1, 2);
    }
  } else if (kind === 'igaShoji') {
    // 伊賀の障子紙は三十センチ角の紙肌を共用する。
    // 小窓と背の高い障子で繊維を引き伸ばさず、端をまたぐ繊維もつなぐ。
    g.fillStyle = '#ded6bd'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 360; i++) {
      const x = R() * S, y = R() * S, dx = (R() - .5) * 12, dy = (R() - .5) * 5;
      g.strokeStyle = R() < .5 ? 'rgba(255,250,230,.2)' : 'rgba(120,104,80,.13)';
      g.lineWidth = .7;
      for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
        g.beginPath(); g.moveTo(x + ox, y + oy);
        g.lineTo(x + ox + dx, y + oy + dy); g.stroke();
      }
    }
  } else if (kind === 'inabaTatamiBorder') {
    // 座敷の畳縁は黒い角材でなく、無地の織物を巻いた推定の納まり。
    // 織り目と縫い留めは一枚の絵に焼き、縁の形・床高・毎コマの処理を増やさない。
    g.fillStyle = '#292b22'; g.fillRect(0, 0, S, S);
    for (let y = 0; y < S; y += 4) {
      g.fillStyle = y % 8 ? '#34372a' : '#23251e'; g.fillRect(0, y, S, 1);

    }
  } else if (kind === 'tatamiBorder') {
    // 野田福島の畳縁は黒い木材でなく、無紋の織布で表す推定復元。
    // 家紋や格式を示す柄は足さず、経糸と緯糸の細かな起伏だけを焼き込む。
    g.fillStyle = '#292820'; g.fillRect(0, 0, S, S);
    for (let y = 0; y < S; y += 4) for (let x = 0; x < S; x += 4) {
      const vertical = (x / 4 + y / 4) % 2 === 0;
      g.fillStyle = vertical ? '#39372c' : '#201f19';
      g.fillRect(x, y, vertical ? 2 : 4, vertical ? 4 : 2);
    }
  } else if (kind === 'floorWood') {
    // 野田福島の板間。板の長手へ木目を通し、形を増やさず木肌を表す。
    // 無彩色の絵に既存の床色を掛け、全棟で一枚を共有する。
    g.fillStyle = '#e2e2e2'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 100; i++) {
      const x = R() * S, bend = 2 + R() * 7;
      g.strokeStyle = R() < .7 ? 'rgba(65,65,65,.12)' : 'rgba(255,255,255,.22)';
      g.lineWidth = .5 + R();
      g.beginPath(); g.moveTo(x, 0);
      g.bezierCurveTo(x + bend, S * .32, x - bend, S * .68, x, S);
      g.stroke();
    }
  } else if (kind === 'plasterWall') {
    // 小壁の仕上げは推定。平らな単色面で済ませず、塗りむらと細かな砂粒を焼く。
    // 亀裂や装飾は足さず、全棟・全色で一枚を共有する。
    g.fillStyle = '#eeeeee'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 90; i++) {
      g.fillStyle = R() < .5 ? 'rgba(110,110,110,.025)' : 'rgba(255,255,255,.08)';
      g.beginPath(); g.ellipse(R() * S, R() * S, 8 + R() * 25, 2 + R() * 5, R() * .3, 0, Math.PI * 2); g.fill();
    }
    for (let i = 0; i < 2400; i++) {
      g.fillStyle = R() < .5 ? 'rgba(100,100,100,.08)' : 'rgba(255,255,255,.18)';
      g.fillRect(Math.floor(R() * S), Math.floor(R() * S), 1, 1);
    }
  } else if (kind === 'earthFloor') {
    // 庫裏・民家・用屋の土間は磨いた一枚板にせず、締めた土の粒と色むらで示す推定復元。
    // 一メートル四方の絵を全棟で共用し、凹凸の形や毎コマの処理は増やさない。
    g.fillStyle = '#dedede'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 24; i++) {
      const x = R() * S, y = R() * S, radius = 12 + R() * 25;
      // 繰り返しの境でも土のむらを切らない。
      for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) {
        const patch = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, radius);
        patch.addColorStop(0, 'rgba(70,70,70,.1)'); patch.addColorStop(1, 'rgba(70,70,70,0)');
        g.fillStyle = patch; g.fillRect(x + dx - radius, y + dy - radius, radius * 2, radius * 2);
      }
    }
    for (let i = 0; i < 1800; i++) {
      g.fillStyle = R() < .65 ? 'rgba(65,65,65,.15)' : 'rgba(255,255,255,.22)';
      g.fillRect(Math.floor(R() * S), Math.floor(R() * S), 1, 1);
    }
  } else if (kind === 'fusumaPlain') {
    // 詰所と僧坊の紙襖。個別の絵柄は不明なので、金砂子や松山図は足さない。
    g.fillStyle = '#c9c1a8'; g.fillRect(0, 0, S, S);
    // 野田福島の無地襖は、紙を貼り継いだ面として推定復元する。
    // 黒い格子を描かず、薄い重なりと紙ごとのわずかな色むらを焼き込む。
    // 固定の袖と動く襖で一枚の絵を共有し、形と毎コマの処理は増やさない。
    const rows = 4, overlap = 2;
    for (let row = 0; row < rows; row++) {
      const top = S * row / rows, bottom = S * (row + 1) / rows;
      const seam = S * (row % 2 ? .58 : .44);
      g.fillStyle = row % 2 ? 'rgba(255,249,224,.035)' : 'rgba(104,92,70,.025)';
      g.fillRect(0, top, seam, bottom - top);
      g.fillStyle = 'rgba(104,92,70,.07)';
      g.fillRect(seam, top, overlap, bottom - top);
      g.fillStyle = 'rgba(255,249,224,.09)';
      g.fillRect(seam + overlap, top, 1, bottom - top);
      if (row) {
        g.fillStyle = 'rgba(104,92,70,.07)';
        g.fillRect(0, top, S, overlap);
        g.fillStyle = 'rgba(255,249,224,.09)';
        g.fillRect(0, top + overlap, S, 1);
      }
    }
    for (let i = 0; i < 300; i++) {
      g.strokeStyle = R() < .5 ? 'rgba(255,249,224,.13)' : 'rgba(104,92,70,.1)';
      const x = R() * S, y = R() * S;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + (R() - .5) * 16, y + R() * 7); g.stroke();
    }
    const wear = g.createLinearGradient(0, S * .65, 0, S);
    wear.addColorStop(0, 'rgba(82,68,45,0)'); wear.addColorStop(1, 'rgba(82,68,45,.15)');
    g.fillStyle = wear; g.fillRect(0, 0, S, S);
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
    if (kind === 'shojiPaper') {
      // 野田福島の障子は大判一枚の紙に見せず、小判の和紙を貼り継ぐ推定復元。
      // 組子の黒線は描かず、紙ごとの色むらと糊代の重なりだけを共有の絵へ焼く。
      // 腰付き・腰窓・固定の袖も同じ紙を使い、形と開閉の処理は増やさない。
      const rows = 6, lap = 2;
      for (let row = 0; row < rows; row++) {
        const top = S * row / rows, bottom = S * (row + 1) / rows;
        const seam = S * (row % 2 ? .56 : .44);
        for (const [left, right] of [[0, seam], [seam, S]]) {
          g.fillStyle = `rgba(113,101,78,${.018 + R() * .035})`;
          g.fillRect(left, top, right - left, bottom - top);
        }
        // 二枚重なる糊代はわずかに暗く、紙端は明るくする。
        g.fillStyle = 'rgba(108,94,69,.12)';
        g.fillRect(seam - lap / 2, top, lap, bottom - top);
        if (row) g.fillRect(0, top, S, lap);
        g.fillStyle = 'rgba(255,249,226,.13)';
        g.fillRect(seam + lap / 2, top, 1, bottom - top);
        if (row) g.fillRect(0, top + lap, S, 1);
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
  } else if (kind === 'igaFusumaPlain') {
    // 伊賀の小城館は無地の紙張り。金砂子や松の絵を付けず、紙の繊維だけを残す。
    g.fillStyle = '#cfc5ab'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 260; i++) {
      g.strokeStyle = 'rgba(104,88,62,0.08)'; g.lineWidth = .7;
      const x = R() * S, y = R() * S;
      const dx = R() * 10, dy = R() * 3;
      // 紙肌を繰り返しても、端で繊維が途切れた升目を作らない。
      for (const ox of [-S, 0]) for (const oy of [-S, 0]) {
        g.beginPath(); g.moveTo(x + ox, y + oy);
        g.lineTo(x + ox + dx, y + oy + dy); g.stroke();
      }
    }
    // 貼り継ぎは下の fusuma が戸の実寸に合わせて両面へ納める。
    // 絵にも四段の継ぎ目を入れると、幅・高さの違う固定戸と引き戸で
    // 立体の継ぎ目とずれて二重になるため、共有の紙肌は繊維だけにする。
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
  if (kind === 'igaPlaster' || kind === 'igaEarth' || kind === 'igaBoard' || kind === 'igaRush' || kind === 'igaTatami' || kind === 'igaShoji' || kind === 'igaFusumaPlain' || kind === 'fusumaPlain') t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (kind === 'tatami' || kind === 'tatamiHeri' || kind === 'hieiTatamiCore' || kind === 'hieiShojiPaper' || kind === 'hieiFloorTimber') t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (kind === 'inabaBoard') inabaBoardPicture = t;
  if (kind === 'inabaPlaster') inabaPlasterPicture = t;
  if (kind === 'earth' || kind === 'tatami' || kind === 'tatamiHeri' || kind === 'hieiTatamiCore' || kind === 'hieiShojiPaper' || kind === 'hieiFloorTimber') t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (['heriM', 'tatamiM', 'waraM', 'earthM'].includes(kind)) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (kind === 'tatamiBorder' || kind === 'floorWood' || kind === 'earthFloor' || kind === 'plasterWall') t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (kind === 'plasterWall') plasterTexture = t;
  if (kind === 'tatami' || kind === 'tatamiHeri' || kind === 'hieiTatamiCore' || kind === 'hieiShojiPaper' || kind === 'hieiFloorTimber') t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
// 天井板も床・建具と同じ木目を共有する。絵を棟ごとに作り直さない。
export function inabaBoardTexture() { return picture('inabaBoard'); }
function mat(color, kind = '') {
  if (kind === 'doorWoodCross') kind = 'doorWood';
  const key = `${color}:${kind}`;
  if (!materials.has(key)) materials.set(key, new THREE.MeshBasicMaterial({ color,
    map: kind === 'earthM' ? (earthPicture ||= picture(kind)) : kind ? picture(kind) : null }));
  return materials.get(key);
}
// 天井板も板床と同じ木肌を共用する。室内側で焼いた灯明・煤の頂点色を残す。
export function ceilingWoodMaterial() {
  const key = 'ceilingWood';
  if (!materials.has(key)) materials.set(key, new THREE.MeshBasicMaterial({
    map: picture('floorWood'), vertexColors: true,
  }));
  return materials.get(key);
}
function box(g, w, h, d, x, y, z, color, kind = '') {
  let geometry = shape(w, h, d);
  if (kind === 'tatamiBorder' || kind === 'floorWood' || kind === 'doorWood' || kind === 'doorWoodCross' || kind === 'earthFloor' || kind === 'plasterWall') {
    // 畳縁の織り目・板床の木目・土間の土粒を実寸に合わせる。
    // 切り欠いた端材も同じ縮尺。形は寸法ごと、材質と絵は全棟で共有する。
    // 土間は玄関の敷居で分割しても同じ局所座標から絵を続ける。
    const earth = kind === 'earthFloor', plaster = kind === 'plasterWall', cross = kind === 'doorWoodCross', door = kind === 'doorWood' || cross;
    const originX = earth ? x - w / 2 : 0, originZ = earth ? z + d / 2 : 0;
    const key = `${kind}:${w}:${h}:${d}` + (earth ? `:${originX}:${originZ}` : door ? `:${x}:${y}` : '');
    if (!shapes.has(key)) {
      const cloth = geometry.clone(), uv = cloth.attributes.uv;
      for (let i = 0; i < uv.count; i++) {
        const face = Math.floor(i / 4);
        if (plaster) {
          // 幅の違う袖壁と戸口上でも一メートル四方の同じ粒度にする。
          const across = face < 2 ? d : w, along = face >= 2 && face < 4 ? d : h;
          uv.setXY(i, uv.getX(i) * across, uv.getY(i) * along);
          continue;
        }
        if (door) {
          // 縦板の表裏は幅三十センチ・長さ一・八メートルで木目を通す。
          // 引手で切った上下の板も同じ座標を使い、彫り込みで木目を切らない。
          const pos = cloth.attributes.position;
          // 横框・横組子は長手へ木目を回す。切った相欠きも元の材の位置から続ける。
          if (cross) {
            uv.setXY(i, (face < 2 || face >= 4 ? pos.getY(i) + y : pos.getZ(i)) / .3,
              (face < 2 ? pos.getZ(i) : pos.getX(i) + x) / 1.8);
            continue;
          }
          uv.setXY(i, (face < 2 ? pos.getZ(i) : pos.getX(i) + x) / .3,
            (face >= 2 && face < 4 ? pos.getZ(i) : pos.getY(i) + y) / 1.8);
          continue;
        }
        const across = face < 2 ? d : w, along = face < 2 ? h : face < 4 ? d : h;
        // 木目は三十センチ幅・一・八メートル長を基準にする。
        // 切り欠いた板でも同じ縮尺で、上面の長手を奥行きへ揃える。
        uv.setXY(i, uv.getX(i) * across / (earth ? 1 : kind === 'floorWood' ? .3 : .128)
            + (earth && face >= 2 && face < 4 ? originX : 0),
          uv.getY(i) * along / (earth ? 1 : kind === 'floorWood' ? 1.8 : .128)
            - (earth && face === 2 ? originZ : 0));
      }
      shapes.set(key, cloth);
    }
    geometry = shapes.get(key);
  }
  const m = new THREE.Mesh(geometry, mat(color, kind)); cacheUsers.push(new WeakRef(m)); m.position.set(x, y, z); g.add(m); return m;
}
// 庫裏の器棚と食膳で椀を共有。口・内壁・高台を持つ形を設営時に一度だけ作る。
function kitchenBowlShape() {
  if (!shapes.has('nodaShelfBowl')) {
    const rim = [[0, 0], [.045, 0], [.055, .025], [.085, .085], [.078, .09], [.048, .03], [0, .02]];
    shapes.set('nodaShelfBowl', new THREE.LatheGeometry(rim.map(([x, y]) => new THREE.Vector2(x, y)), 10));
  }
  return shapes.get('nodaShelfBowl');
}
// 野田福島の炊事道具。鍋の胴・口縁・底・中身は民家と庫裏で共有する。
// 原点から高さ二十三センチの中へ収め、調度の当たりより上へ出さない。
function cookingPot(parent, y) {
  if (!shapes.has('nodaPotBody')) {
    shapes.set('nodaPotBody', new THREE.CylinderGeometry(.19, .145, .22, 12, 1, true));
    const rim = new THREE.TorusGeometry(.19, .012, 4, 12);
    rim.rotateX(Math.PI / 2); shapes.set('nodaPotRim', rim);
    shapes.set('nodaPotBottom', new THREE.CylinderGeometry(.145, .145, .018, 12));
    shapes.set('nodaPotContents', new THREE.CylinderGeometry(.18, .18, .008, 12));
    // 両耳は中の詰まった角材でなく、つるを通せる穴のある鉄の輪。
    // 元の持ち手と同じ幅・奥行きに納め、民家と庫裏で形を共有する。
    const ear = new THREE.TorusGeometry(.026, .009, 4, 8);
    ear.rotateX(Math.PI / 2); ear.scale(.7, 1, 1);
    shapes.set('nodaPotEar', ear);
  }
  for (const [key, yy, color] of [['nodaPotBody', .11, 0x292723], ['nodaPotRim', .218, 0x393630],
    ['nodaPotBottom', .009, 0x292723], ['nodaPotContents', .184, 0x423c2d]]) {
    const m = new THREE.Mesh(shapes.get(key), mat(color));
    cacheUsers.push(new WeakRef(m)); m.position.y = y + yy; parent.add(m);
  }
  for (const x of [-.205, .205]) {
    const ear = new THREE.Mesh(shapes.get('nodaPotEar'), mat(0x292723));
    cacheUsers.push(new WeakRef(ear)); ear.position.set(x, y + .18, 0); parent.add(ear);
  }
}
// 長押の無紋の鉄金具。外周も間仕切りと同じ原形・材質を使い、静止した束へまとめる。
export function nageshiNail(g, home, x, y, z, tilt, sideWall = false) {
  const m = box(g, home ? .044 : .065, home ? .05 : .07, home ? .008 : .012,
    x, y, z, 0x39372f);
  m.rotation.set(tilt, sideWall ? Math.PI / 2 : 0, 0, 'YXZ');
  return m;
}
// 編み目を寸法に合わせて繰り返す。座だけ目が太くならないよう、共有の原形から一度だけ作る。
function igaRushMat(g, w, h, d) {
  const m = box(g, w, h, d, 0, h / 2, 0, 0x958669, 'igaRush');
  const key = `igaRush:${w}:${h}:${d}`;
  if (!shapes.has(key)) {
    const geo = m.geometry.clone(), p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i,
      (Math.abs(n.getX(i)) > .5 ? p.getZ(i) : p.getX(i)) / .4,
      (Math.abs(n.getY(i)) > .5 ? p.getZ(i) : p.getY(i)) / .4);
    shapes.set(key, geo);
  }
  m.geometry = shapes.get(key);
}
// 板戸・腰障子の鏡板と板間に使う。原形を直接変えず、同寸の板肌用の形を共有する。
function igaBoard(g, w, h, d, y, color) {
  const m = box(g, w, h, d, 0, y, 0, color, 'igaBoard');
  const key = `igaBoard:${w}:${h}:${d}`;
  if (!shapes.has(key)) {
    const geo = m.geometry.clone(), p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i,
      (Math.abs(n.getX(i)) > .5 ? p.getZ(i) : p.getX(i)) / .6,
      (Math.abs(n.getY(i)) > .5 ? p.getZ(i) : p.getY(i)) / .6);
    shapes.set(key, geo);
  }
  m.geometry = shapes.get(key);
  return m;
}
// 館の外周と間仕切りの小壁は同じ土塗り。幅が違っても粒の大きさを保つ。
function igaPlaster(g, w, h, d, x, y, z, color) {
  const m = box(g, w, h, d, x, y, z, color, 'igaPlaster');
  const key = `igaPlaster:${w}:${h}:${d}`;
  if (!shapes.has(key)) {
    const geo = m.geometry.clone(), p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i,
      (Math.abs(n.getX(i)) > .5 ? p.getZ(i) : p.getX(i)) / .6,
      (Math.abs(n.getY(i)) > .5 ? p.getZ(i) : p.getY(i)) / .6);
    shapes.set(key, geo);
  }
  m.geometry = shapes.get(key);
}
export function igaPlasterWalls(walls) {
  const g = new THREE.Group();
  for (const [x, y, z, w, h, d, color] of walls) igaPlaster(g, w, h, d, x, y, z, color);
  const mesh = batchInterior(g); shadeNight(mesh); return mesh;
}
// 伊賀の建具の框・組子も板戸と同じ木肌を使う。
// 横材は原形を回して長手へ木目を通す。固定戸と可動戸で形・材質を共有し、
// 相欠きで短く切った組子も木目の縮尺と既存の位置・厚みを保つ。
function igaDoorTimber(g, w, h, d, x, y, z, color, horizontal = false) {
  const m = horizontal ? igaBoard(g, h, w, d, y, color) : igaBoard(g, w, h, d, y, color);
  if (horizontal) m.rotation.z = -Math.PI / 2;
  m.position.x = x; m.position.z = z;
  return m;
}
// 館の天井板・柱・長押も板戸・板間と同じ木肌を使う。材の長手へ木目を通し、
// 床の間で切った板も同じ縮尺にする。近づいて室内を作る時だけ束ねる。
// 煙の重なる所は濃い方を採り、火元の数だけ梁全体を黒くしない。
// 室内を組む時だけ呼び、囲炉裏と竈で同じ煤の広がりを使う。
export function igaSootShade(sources, x, y, z) {
  let darkness = 0;
  for (const source of sources) {
    const rise = y - source.y;
    const upper = Math.max(0, Math.min(1, (rise - 1.2) / 1.2));
    const radius = 1.2 + Math.max(0, rise) * .7;
    const dx = x - source.x, dz = z - source.z;
    const spread = Math.max(0, 1 - (dx * dx + dz * dz) / (radius * radius));
    darkness = Math.max(darkness, upper * (.12 + .42 * spread));
  }
  return 1 - darkness;
}
export function igaCeilingBoards(boards, soot = null) {
  const g = new THREE.Group();
  for (const [x, y, z, w, h, d, color, axis, slope = 0, yaw = 0] of boards) {
    if (axis && axis !== 'boardX' && axis !== 'boardZ') {
      // 柱は縦木、長押は横木。原形の縦の木目を材の軸へ回し、
      // 柱高や横木の長さで木肌を引き伸ばさない。同寸の形と材質は共有する。
      const m = axis === 'x' ? igaBoard(g, h, w, d, y, color)
        : axis === 'z' ? igaBoard(g, w, d, h, y, color)
        : igaBoard(g, w, h, d, y, color);
      if (axis === 'x') m.rotation.z = -Math.PI / 2;
      else if (axis === 'z') m.rotation.x = Math.PI / 2;
      // 登り梁・垂木は木目を長手へ通した後、屋根と同じ勾配へ傾ける。
      // 位置は動かさず原形を共有し、束ねる時だけ回す。
      // 棟方向の屋中は、縦木を奥行きへ寝かせてから断面を傾ける。
      // 既定の回転順では寝かせる前に傾き、長手が横へ振れて妻壁を貫く。
      // 屋根面に沿う断面と縄の向きをそろえ、茅下地を棟と平行に保つ。
      if (axis === 'z' && slope) m.rotation.order = 'ZXY';
      if (slope) m.rotation.z += slope;
      // 水平の火打材は、木目を材の軸へ通した形を鉛直軸の周りに回す。
      // 局所の木目と断面を保ち、原形の頂点を書き換えずに共有する。
      if (yaw) m.rotation.set(m.rotation.x, yaw, m.rotation.z, 'YXZ');
      m.position.x = x; m.position.z = z;
      continue;
    }
    // 入口の板は座敷と直交する。原形も回し、木目を短辺へ横切らせない。
    // 床の間で切った天井板は、短くなっても切る前の木目を保つ。
    // 細片の縦横から選び直すと、同じ板の途中で木目が直角に曲がる。
    const across = axis === 'boardX' || axis !== 'boardZ' && w > d;
    const m = igaBoard(g, across ? d : w, h, across ? w : d, y, color);
    if (across) m.rotation.y = Math.PI / 2;
    m.position.x = x; m.position.z = z;
  }
  const mesh = batchInterior(g);
  // 炉のある家の柱にも、木肌の上から従来と同じ煤を焼く。
  // 束ねた後の専用の形だけを染め、共有の原形・材質は変えない。
  if (soot) for (const m of mesh.children) {
    const p = m.geometry.attributes.position, colors = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      colors.fill(igaSootShade(soot, p.getX(i), p.getY(i), p.getZ(i)), i * 3, i * 3 + 3);
    }
    m.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const key = 'soot:' + m.material.uuid;
    if (!materials.has(key)) {
      const material = m.material.clone(); material.vertexColors = true; materials.set(key, material);
    }
    m.material = materials.get(key);
  }
  shadeNight(mesh);
  return mesh;
}
// 伊賀の板間は木肌だけの一枚板にせず、三十センチほどの床板で納める。
// 炉・框で切った床ごとに端を止め、同じ柱筋から目地を通す。
// 目地は共有の箱形と木材で静止した束へまとめ、足場の高さは変えない。
function igaFloorBoards(g, x0, x1, z0, z1, y, h, color, originX, joistZ = 0, joistStep = 0) {
  const floor = igaBoard(g, x1 - x0, h, z1 - z0, y - h / 2, color);
  floor.position.x = (x0 + x1) / 2;
  floor.position.z = (z0 + z1) / 2;
  const first = Math.floor((x0 - originX) / .3) + 1;
  for (let i = first; originX + i * .3 < x1 - .004; i++) {
    const x = originX + i * .3;
    if (x <= x0 + .004) continue;
    box(g, .003, .001, z1 - z0, x, y + .0005, (z0 + z1) / 2, 0x4a3828);
  }
  // 木口は床下の根太の上で継ぐ。隣の板とは一つおきに継ぎ位置をずらし、
  // 炉や框で切った床でも、残った板の範囲だけへ三ミリの目地を納める。
  // 共通の箱形・木材を静止した束へ焼き込み、足場と毎コマの処理は増やさない。
  if (joistStep > 0) {
    const firstBoard = Math.floor((x0 - originX) / .3);
    for (let i = firstBoard; originX + i * .3 < x1 - .004; i++) {
      const left = Math.max(x0, originX + i * .3) + .0015;
      const right = Math.min(x1, originX + (i + 1) * .3) - .0015;
      if (right <= left) continue;
      for (let j = 1; joistZ + j * joistStep < z1 - .004; j++) {
        const z = joistZ + j * joistStep;
        if (z <= z0 + .004 || (i + j) % 2 !== 0) continue;
        box(g, right - left, .001, .003, (left + right) / 2, y + .0005, z, 0x4a3828);
        // 継いだ両方の木口を根太へ留める角い釘頭の推定復元。
        // 炉や框で切った細片には打たず、目地から三センチ離して板端の割れを避ける。
        // 共通の小箱を静止した床の束へ納め、足場・材質・毎コマの処理は増やさない。
        if (right - left >= .12) for (const end of [-1, 1]) {
          const nailZ = z + end * .03;
          if (nailZ - .004 <= z0 || nailZ + .004 >= z1) continue;
          for (const nailX of [left + .035, right - .035])
            box(g, .008, .001, .008, nailX, y + .0005, nailZ, 0x292723);
        }
      }
    }
  }
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
function villagePanelInstances(kind, count, w = .9, h = 1.8) {
  // 設楽原の建具は実寸の原形を共有し、腰板・組子・框・引手を伸縮させない。
  const key = kind + ':' + w + ':' + h + ':' + (cgtOn() && cgtHas('slide_door_a'));
  const waist = kind === 'shojiKoshi' || kind === 'shojiKoshiRight';
  const villageBoard = kind === 'itadoVillage' || kind === 'itadoVillageRight';
  const templeDoor = kind === 'koshiHikite' || kind === 'koshiHikiteRight';
  if (!panels.has(key)) panels.set(key, batchInterior(kind === 'fusumaPlain' || kind === 'fusumaVillage' ? villageFusuma(w, h, false, true, kind === 'fusumaVillage') : kind === 'fusuma' ? villageFusuma(w, h) : kind === 'fusumaE' ? villageFusuma(w, h, true) : kind === 'itado' || villageBoard ? villageItado(w, h, villageBoard, kind === 'itadoVillageRight') : kind === 'koshiHiei' ? hieiKoshi(w, h, true) : kind === 'shojiHiei' ? hieiShoji(w, h, true) : kind === 'koshi' || templeDoor ? villageKoshi(w, h, templeDoor, templeDoor, kind === 'koshiHikiteRight') : villageShoji(w, h, waist || kind === 'shojiKumiko' || kind === 'shojiKumikoRight', kind === 'shojiKumikoRight' || kind === 'shojiKoshiRight', waist, waist || kind === 'shojiKumiko' || kind === 'shojiKumikoRight')));
  return panels.get(key).children.map(m => { const copy = new THREE.InstancedMesh(m.geometry, m.material, Math.max(1, count)); cacheUsers.push(new WeakRef(copy)); return copy; });
}
function igaFusuma(w = .9, h = 1.8, painted = false, plain = true) {
  const g = new THREE.Group();
  const paper = box(g, w - .06, h - .06, .035, 0, h / 2, 0, 0xffffff, plain ? 'igaFusumaPlain' : 'fusuma');
  if (plain) {
    // 伊賀の固定襖と動く襖で、同じ紙の繊維を同じ実寸で見せる。
    // 戸一枚へ絵を引き伸ばすと、幅の違う建具だけ繊維が太くなっていた。
    // 三十センチ角の紙肌として割り付け、寸法ごとの形と一枚の材質を共有する。
    const key = `igaFusumaPaper:${w}:${h}`;
    if (!shapes.has(key)) {
      // 引手の底を紙の表へ貼らず、両面の紙と芯を切り欠いて落とし込む。
      // 固定襖・引き戸で同じ原形を共有し、戸厚と開閉の当たりは保つ。
      const halfW = (w - .06) / 2, halfH = (h - .06) / 2;
      const gripX = w / 2 - .13, gripY = h * .47 - h / 2;
      const outline = new THREE.Shape();
      outline.moveTo(-halfW, -halfH); outline.lineTo(halfW, -halfH);
      outline.lineTo(halfW, halfH); outline.lineTo(-halfW, halfH); outline.closePath();
      const hole = new THREE.Path();
      hole.moveTo(gripX - .022, gripY - .032);
      hole.lineTo(gripX - .022, gripY + .032);
      hole.lineTo(gripX + .022, gripY + .032);
      hole.lineTo(gripX + .022, gripY - .032); hole.closePath();
      outline.holes.push(hole);
      const geo = new THREE.ExtrudeGeometry(outline, { depth: .035, bevelEnabled: false, steps: 1, curveSegments: 1 });
      geo.translate(0, 0, -.0175);
      const p = geo.attributes.position;
      const n = geo.attributes.normal, uv = geo.attributes.uv;
      for (let i = 0; i < p.count; i++) uv.setXY(i,
        (Math.abs(n.getX(i)) > .5 ? p.getZ(i) : p.getX(i)) / .3,
        (Math.abs(n.getY(i)) > .5 ? p.getZ(i) : p.getY(i)) / .3);
      shapes.set(key, geo);
    }
    paper.geometry = shapes.get(key);
  }
  if (plain) fusumaMiterFrame(g, w, h, 0x32271c);
  else igaFrame(g, w, h, 0x32271c);
  if (plain) {
    // 伊賀の無地襖は一枚の大きな紙に見せず、小紙を重ねた面として推定復元する。
    // 紙の継ぎ目は框の内側で止め、段ごとに縦の継ぎ目をずらす。
    // 固定戸・可動戸の共通部品へ焼き込み、戸厚や引手、滑る当たりは保つ。
    const paperW = w - .08, paperH = h - .08;
    const rows = Math.max(1, Math.ceil(paperH / .45));
    const columns = Math.max(1, Math.ceil(paperW / .3));
    // 紙の貼り継ぎも落とし引手の口で切る。線だけを紙面へ重ねると、
    // 引手のくぼみを紙の帯が横切り、指を掛ける穴を塞いで見える。
    // 鉄座の外寸まで逃がし、固定襖・動く襖の両面を同じ納まりにする。
    const gripX = w / 2 - .13, gripY = h * .47;
    const gripLeft = gripX - .03, gripRight = gripX + .03;
    const gripBottom = gripY - .04, gripTop = gripY + .04;
    for (const face of [-1, 1]) for (let row = 0; row < rows; row++) {
      const bottom = .04 + row * paperH / rows;
      const top = .04 + (row + 1) * paperH / rows;
      if (row) {
        const runs = bottom + .001 > gripBottom && bottom - .001 < gripTop
          ? [[-paperW / 2, gripLeft], [gripRight, paperW / 2]] : [[-paperW / 2, paperW / 2]];
        for (const [a, b] of runs) if (b > a)
          box(g, b - a, .002, .001, (a + b) / 2, bottom, face * .018, 0xc7bfa6);
      }
      for (let column = 1; column <= columns; column++) {
        const x = -paperW / 2 + (column - (row % 2 ? .5 : 0)) * paperW / columns;
        if (x >= paperW / 2 - .002) continue;
        const runs = x + .001 > gripLeft && x - .001 < gripRight
          ? [[bottom, Math.min(top, gripBottom)], [Math.max(bottom, gripTop), top]] : [[bottom, top]];
        for (const [a, b] of runs) if (b > a)
          box(g, .002, b - a, .001, x, (a + b) / 2, face * .018, 0xc7bfa6);
      }
    }
    igaDoorTenons(g, w, h, 0x32271c);
    // 伊賀の無地襖は、縁の四隅を留めで納める推定復元。
    // 重ねた角材だけに見せず、両面に斜めの継ぎ目を出す。
    // 框の見付け内で止め、固定戸と引き戸で同じ形・材質を使い回す。
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const face of [-1, 1]) {
      const joint = box(g, .052, .002, .001,
        sx * (w / 2 - .02), sy > 0 ? h - .02 : .02,
        face * .0305, 0x1a1410);
      joint.rotation.z = sx * sy * Math.PI / 4;
    }
    // 伊賀の襖は両面に縁付きの落とし引手を納める。戸厚の内側に収め、
    // 引違いの溝を滑る時も、隣の戸へ取っ手を突き出さない。
    const x = w / 2 - .13, y = h * .47;
    // 厚さ二十四ミリの底を残し、表裏とも紙面から五ミリくぼませる。
    box(g, .044, .064, .024, x, y, 0, 0x1a1410);
    for (const side of [-1, 1]) {
      for (const dx of [-.026, .026]) box(g, .008, .08, .004, x + dx, y, side * .021, 0x66553a);
      for (const dy of [-.036, .036]) box(g, .044, .008, .004, x, y + dy, side * .021, 0x66553a);
    }
  } else box(g, .06, .08, .055, w / 2 - .13, .85, 0, 0x66553a);
  return g;
}
// 無地襖の縁は四隅を留めで切り合わせる。斜めの線だけを貼って
// 縦横の角材を重ねず、裏面まで同じ切り口にする。原形は寸法ごとに共有する。
function fusumaMiterFrame(g, w, h, color) {
  for (const horizontal of [true, false]) for (const side of [-1, 1]) {
    const mesh = horizontal
      ? box(g, w, .04, .06, 0, side < 0 ? .02 : h - .02, 0, color, 'igaBoard')
      : box(g, .04, h, .06, side * (w / 2 - .02), h / 2, 0, color, 'igaBoard');
    const key = `fusumaMiter:${w}:${h}:${horizontal}:${side}`;
    if (!shapes.has(key)) {
      const geo = mesh.geometry.clone(), p = geo.attributes.position;
      const n = geo.attributes.normal, uv = geo.attributes.uv;
      for (let i = 0; i < p.count; i++) {
        if (horizontal) {
          const inset = .02 - side * p.getY(i);
          p.setX(i, Math.sign(p.getX(i)) * (w / 2 - inset));
        } else {
          const inset = .02 - side * p.getX(i);
          p.setY(i, Math.sign(p.getY(i)) * (h / 2 - inset));
        }
        // 伊賀の襖縁も障子・柱と共通の木肌にする。留めで切った後に
        // 木目を材の長手へ通し、細い縁でも六十センチの縮尺を保つ。
        // 表裏・見込みを同じ原形へ焼き込み、固定戸と動く戸で共有する。
        uv.setXY(i, horizontal
          ? (Math.abs(n.getY(i)) > .5 ? p.getZ(i) : p.getY(i)) / .6
          : (Math.abs(n.getX(i)) > .5 ? p.getZ(i) : p.getX(i)) / .6,
        horizontal ? p.getX(i) / .6
          : (Math.abs(n.getY(i)) > .5 ? p.getZ(i) : p.getY(i)) / .6);
      }
      geo.computeVertexNormals();
      shapes.set(key, geo);
    }
    mesh.geometry = shapes.get(key);
  }
}
function igaFrame(g, w, h, color, joined = false, handleSide = 0) {
  // 伊賀の障子・板戸は横框を縦框の間へ納める。四隅で角材を
  // 同じ面へ重ねず、ほぞ差しの肩と込栓を両面に見せる推定復元。
  for (const y of [.02, h - .02]) {
    if (joined) igaDoorTimber(g, w - .08, .04, .06, 0, y, 0, color, true);
    else box(g, w, .04, .06, 0, y, 0, color);
  }
  for (const x of [-w / 2 + .02, w / 2 - .02]) {
    if (joined && handleSide && Math.sign(x) === handleSide) {
      // 障子の指掛けは縦框へ彫り込む推定復元。黒い印を表へ貼るだけにせず、
      // 両面を七ミリくぼませ、縁と底を木で残す。原形は固定戸・可動戸で共用する。
      const gripY = h / 2, gripH = .12;
      const endH = (h - gripH) / 2;
      for (const y of [endH / 2, h - endH / 2])
        igaDoorTimber(g, .04, endH, .06, x, y, 0, color);
      igaDoorTimber(g, .04, gripH, .046, x, gripY, 0, color);
      for (const side of [-1, 1])
        igaDoorTimber(g, .013, gripH, .06, x + side * .0135, gripY, 0, color);
    }
    else if (joined) igaDoorTimber(g, .04, h, .06, x, h / 2, 0, color);
    else box(g, .04, h, .06, x, h / 2, 0, color);
  }
  if (joined) for (const x of [-w / 2 + .02, w / 2 - .02]) for (const top of [false, true])
    for (const face of [-1, 1]) {
      box(g, .04, .002, .001, x, top ? h - .04 : .04, face * .0305, 0x3a2a1c);
      box(g, .01, .01, .002, x, top ? h - .02 : .02, face * .031, 0x604831);
    }
}
// 伊賀の引き戸は縦框の上下を溝へ掛ける推定復元。
// 平らな框を敷居へ載せるだけにせず、上を深く、下を浅く差す。
// 幅六・四センチの既存の溝に納め、戸厚・滑る位置・通れる幅は保つ。
function igaDoorTenons(g, w, h, color) {
  for (const x of [-w / 2 + .02, w / 2 - .02]) {
    box(g, .03, .012, .05, x, h + .006, 0, color);
    box(g, .03, .008, .05, x, -.004, 0, color);
  }
}
// 伊賀の館の入口は腰障子として推定復元。小さな明かり取りは紙障子のまま。
// 描く部材と固定・可動の当たりで同じ腰板高を使う。
export function igaShojiKoshi(h) { return h >= 1.2 ? .3 : 0; }
// 伊賀の戸の框は厚さ六センチ。溝は両側に二ミリの逃げを取り、
// 外戸・窓・間仕切りで同じ幅にする。二本の溝の中心間隔は七・五センチ。
export const IGA_DOOR_GROOVE_W = .064;
function igaShoji(w = .9, h = 1.8, iga = false, handleSide = 1) {
  const kit = iga ? null : bought('slide_door_c', w, h, .06); if (kit) return kit;
  const g = new THREE.Group();
  const koshi = iga ? igaShojiKoshi(h) : 0;
  const paper = box(g, w - .04, h - .04 - koshi, iga ? .004 : .025, 0, (h + koshi) / 2, iga ? -.014 : 0, 0xffffff, iga ? 'igaShoji' : 'shoji');
  if (iga) {
    // 紙の絵は戸一枚へ引き伸ばさず、実寸へ割り付ける。
    // 原形は寸法ごとに一度だけ作り、固定戸・可動戸・窓で使い回す。
    const key = `igaShojiPaper:${w}:${h}:${koshi}`;
    if (!shapes.has(key)) {
      const geo = paper.geometry.clone(), p = geo.attributes.position;
      const n = geo.attributes.normal, uv = geo.attributes.uv;
      for (let i = 0; i < p.count; i++) uv.setXY(i,
        (Math.abs(n.getX(i)) > .5 ? p.getZ(i) : p.getX(i)) / .3,
        (Math.abs(n.getY(i)) > .5 ? p.getZ(i) : p.getY(i)) / .3);
      shapes.set(key, geo);
    }
    paper.geometry = shapes.get(key);
  }
  igaFrame(g, w, h, 0x795b3b, iga, iga ? handleSide : 0);
  if (iga) {
    igaDoorTenons(g, w, h, 0x795b3b);
    const paperBottom = .04 + koshi;
    if (koshi) {
      igaBoard(g, w - .08, koshi, .028, .04 + koshi / 2, 0x795b3b);
      igaDoorTimber(g, w - .08, .04, .04, 0, paperBottom - .02, 0, 0x604831, true);
      for (const side of [-1, 1]) for (let x = -w / 2 + .22; x < w / 2 - .04; x += .18)
        box(g, .004, koshi - .04, .002, x, .04 + (koshi - .04) / 2, side * .015, 0x604831);
      // 腰板は上下の溝へ差し、上の横桟を縦框へほぞ差しする推定復元。
      // 板継ぎだけで終わらせず、溝際の陰と差し口・込栓を両面へ納める。
      // 溝の逃げの内側で共通の箱形を使い、固定戸・引き戸で共有する。
      for (const side of [-1, 1]) {
        for (const yy of [.042, paperBottom - .042])
          box(g, w - .08, .004, .002, 0, yy, side * .015, 0x3a2a1c);
        for (const end of [-1, 1]) {
          const x = end * (w / 2 - .02), railY = paperBottom - .02;
          for (const edge of [-1, 1])
            box(g, .04, .003, .001, x, railY + edge * .02, side * .0305, 0x3a2a1c);
          box(g, .012, .012, .001, x, railY, side * .0305, 0x604831);
        }
      }
    }
    // 組子の間隔を実寸から決める。明かり取りの小障子まで縦三本・横五本にすると、
    // 背の高い建具より極端に細かな格子になる。固定戸と動く戸を同じ割り付けで納める。
    // 桟の太さ・紙を貼る裏側の位置は共通にし、小窓だけ組子を詰め込まない。
    const clearW = w - .08, clearH = h - .08 - koshi;
    const columns = Math.max(2, Math.round(clearW / .22));
    const rows = Math.max(2, Math.round(clearH / .28));
    // 組子の交点は相欠きで納める推定復元。縦横とも厚い棒のまま
    // 重ねず、縦桟は表側、横桟は紙側へ半分ずつ残す。
    // 共通の箱形を設営時に束ねるため、開閉中に部材は作らない。
    const columnStep = clearW / columns, rowStep = clearH / rows;
    // 紙の継ぎ目は下の貼り継ぎへ一本化する。全ての桟へ両面の帯を
    // 重ねると、裏の千鳥継ぎと二重になり、紙の表にも余分な格子が出る。
    // 組子の端も框へ短ほぞで差す推定復元。相欠きの交点だけでなく、
    // 四周の框まで荷をつなぐ。差し口は紙を貼らない表側だけに納め、
    // 固定障子・引き戸・小窓で寸法別の木材と静止した束を共用する。
    const tenon = .015;
    for (let k = 1; k < columns; k++) {
      const x = -clearW / 2 + k * columnStep;
      for (const side of [-1, 1]) {
        const yy = side < 0 ? paperBottom : h - .04;
        igaDoorTimber(g, .006, tenon, .014, x,
          yy + side * tenon / 2, .009, 0x795b3b);
        for (const edge of [-1, 1])
          box(g, .001, tenon, .001, x + edge * .006,
            yy + side * tenon / 2, .0305, 0x3a2a1c);
      }
      igaDoorTimber(g, .012, clearH, .014, x, (paperBottom + h - .04) / 2, .009, 0x795b3b);
      for (let row = 0; row < rows; row++) {
        const bottom = paperBottom + row * rowStep + (row ? .005 : 0);
        const top = paperBottom + (row + 1) * rowStep - (row + 1 < rows ? .005 : 0);
        igaDoorTimber(g, .012, top - bottom, .014, x, (bottom + top) / 2, -.005, 0x795b3b);
      }
    }
    for (let k = 1; k < rows; k++) {
      const y = paperBottom + k * rowStep;
      for (const side of [-1, 1]) {
        const xx = side * (clearW / 2 + tenon / 2);
        igaDoorTimber(g, tenon, .006, .014, xx, y, -.005, 0x604831, true);
        for (const edge of [-1, 1])
          box(g, tenon, .001, .001, xx, y + edge * .005,
            .0305, 0x3a2a1c);
      }
      igaDoorTimber(g, clearW, .01, .014, 0, y, -.005, 0x604831, true);
      for (let column = 0; column < columns; column++) {
        // 差し口の際だけ半ミリ引き、奥の木肌を細い陰として見せる。
        const left = -clearW / 2 + column * columnStep + (column ? .0065 : 0);
        const right = -clearW / 2 + (column + 1) * columnStep - (column + 1 < columns ? .0065 : 0);
        igaDoorTimber(g, right - left, .01, .014, (left + right) / 2, y, .009, 0x795b3b, true);
      }
    }
    // 紙の貼り継ぎは組子の裏で受ける。共通の絵に三段の線を描くと、
    // 小窓と腰障子で継ぎ目が桟から外れ、空中で紙を継ぐ形になっていた。
    // 横は二段ごと、縦は組子の位置で交互に継ぐ推定復元。
    // 紙の裏面だけに薄い重なりを置き、固定戸・可動戸で同じ原形を使う。
    for (let row = 0; row < rows; row += 2) {
      const bottom = paperBottom + row * clearH / rows;
      const top = paperBottom + Math.min(rows, row + 2) * clearH / rows;
      if (row) box(g, clearW, .003, .001, 0, bottom, -.017, 0xb9b39c);
      const column = Math.max(1, Math.min(columns - 1, Math.round(columns / 2) + (row % 4 ? 1 : 0)));
      box(g, .003, top - bottom, .001,
        -clearW / 2 + column * clearW / columns, (bottom + top) / 2, -.017, 0xb9b39c);
    }
    // 召し合わせ側の指掛けの底だけを暗くする。縁より奥へ納め、彫った段差を残す。
    for (const side of [-1, 1]) box(g, .014, .12, .001, handleSide * (w / 2 - .02), h * .5, side * .0235, 0x3a2a1c);
  }
  return g;
}
function igaTatamiPart(w = .9, d = 1.8) {
  // 伊賀の館は床の間に合わせた一畳・半畳を同じ部品で納める。
  // 藁の畳床・薄い表・布縁を共通部品で組む。小口へ畳表を回さず、
  // 六センチの床高と縁幅、伊賀の表の織り目の縮尺は保つ。
  const g = tatami(w, d, true), surface = g.children[1];
  surface.material = mat(0xffffff, 'igaTatami');
  const key = `igaTatamiSurface:${w}:${d}`;
  if (!shapes.has(key)) {
    const geo = surface.geometry.clone(), p = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / .9, -p.getZ(i) / 1.8);
    shapes.set(key, geo);
  }
  surface.geometry = shapes.get(key);
  return g;
}
// 板戸：黒ずんだ杉の鏡板に、横の桟を五段（寺の堂・蔵の間仕切り）。一枚0.9m、足もと原点
function igaItado(w = .9, h = 1.8, iga = false, handleSide = 1) {
  const g = new THREE.Group();
  const handleY = iga ? h / 2 : .9;
  const handleX = handleSide * (w / 2 - .12);
  if (iga) {
    // 引手の所は鏡板を両面から欠き、薄い芯を残す。黒い板を表へ
    // 貼るだけにせず、指を掛ける深さを戸厚の内側へ納める。
    // 外戸・窓・室内戸で寸法ごとの原形を共有し、開閉時は作り直さない。
    const left = -w / 2 + .03, right = w / 2 - .03;
    const hx0 = handleX - .025, hx1 = handleX + .025;
    const hy0 = handleY - .05, hy1 = handleY + .05;
    for (const [x0, x1, y0, y1] of [
      [left, hx0, .03, h - .03], [hx1, right, .03, h - .03],
      [hx0, hx1, .03, hy0], [hx0, hx1, hy1, h - .03],
    ]) {
      const board = igaBoard(g, x1 - x0, y1 - y0, .03,
        (y0 + y1) / 2, 0x4a3828);
      board.position.x = (x0 + x1) / 2;
    }
    box(g, .05, .1, .01, handleX, handleY, 0, 0x4a3828);
  } else box(g, w - .06, h - .06, .03, 0, h / 2, 0, 0x4a3828);
  if (iga) {
    // 伊賀の板戸は鏡板を一枚の平面にせず、縦板の継ぎ目を両面へ入れる。
    // 横桟と框の内側に納め、戸の厚みと二本の溝の間隔を変えない。
    const boards = Math.max(2, Math.round((w - .08) / .18));
    for (let k = 1; k < boards; k++) {
      const x = -w / 2 + .04 + k * (w - .08) / boards;
      const spans = Math.abs(x - handleX) < .028
        ? [[.04, handleY - .05], [handleY + .05, h - .04]] : [[.04, h - .04]];
      for (const [low, high] of spans) for (const side of [-1, 1])
        box(g, .006, high - low, .002, x, (low + high) / 2, side * .016, 0x241a12);
    }
    // 引手は黒い四角だけにせず、指を掛ける内側と木の縁を分ける。
    // 元の引手の内側へ重ね、開閉中の当たりも既存の戸厚に収める。
    for (const side of [-1, 1]) {
      // 欠いた鏡板の芯へ底を納め、両面とも九ミリのくぼみを残す。
      box(g, .05, .1, .002, handleX, handleY, side * .006, 0x1a1410);
      for (const x of [-.033, .033])
        igaDoorTimber(g, .016, .132, .008, handleX + x, handleY, side * .026, 0x2e2218);
      for (const y of [-.058, .058])
        igaDoorTimber(g, .05, .016, .008, handleX, handleY + y, side * .026, 0x2e2218, true);
    }
  }
  // 伊賀の明かり取りは高さ六十センチほど。小窓は二段、背の高い戸は
  // 四段に分け、中央の引手を横桟で塞がない。両面で同じ納まりを使う。
  // 原形の寸法から設営時だけ決め、既存の戸の束・溝・当たりは共用する。
  const rails = iga ? (h >= 1.2 ? 4 : 2) : 5;
  for (let k = 1; k <= rails; k++) {
    const y = h * k / (rails + 1);
    // 伊賀の桟戸は鏡板の片面へ横桟を添える。板を貫通する角材では、
    // 裏面にも桟が現れ、折り返す釘先が板から浮いてしまう。
    // 板の表（十五ミリ）から框の表（三十ミリ）までに納め、戸厚は保つ。
    // 横桟と引手の木枠も框と同じ木肌にし、横材の木目を長手へ通す。
    // 既存の原形・材質を共有し、戸厚と引き違いの溝は保つ。
    if (iga) igaDoorTimber(g, w - .06, .045, .015, 0, y, .0225, 0x2e2218, true);
    else box(g, w - .06, .045, .05, 0, y, 0, 0x2e2218);
    if (iga) {
      // 縦板を横桟へ留める鍛鉄釘を見せる推定復元。
      // 一方は角い釘頭、裏は折り返した釘先とし、板を桟へ貼っただけにしない。
      // 框の内側・既存の戸厚に納め、同寸の原形を引き戸の束で使い回す。
      const boards = Math.max(2, Math.round((w - .08) / .18));
      for (let j = 0; j < boards; j++) {
        const x = -w / 2 + .04 + (j + .5) * (w - .08) / boards;
        box(g, .012, .012, .003, x, y, .0315, 0x211a14);
        box(g, .006, .022, .003, x, y + .006, -.0165, 0x211a14);
      }
      // 横桟は縦框へほぞ差しする推定復元。端を重ねるだけにせず、
      // 框の両面へ差し口と抜け止めの込栓を見せる。
      // 框の表から二ミリ以内に納め、共有部品として束ねて溝と当たりを保つ。
      for (const end of [-1, 1]) for (const side of [-1, 1]) {
        const x = end * (w / 2 - .02);
        for (const edge of [-1, 1])
          box(g, .04, .003, .001, x, y + edge * .0225, side * .0305, 0x1a1410);
        box(g, .014, .014, .002, x, y, side * .031, 0x795b3b);
      }
    }
  }
  if (iga) igaFrame(g, w, h, 0x241a12, true);
  else frame(g, w, h, 0x241a12);
  if (iga) igaDoorTenons(g, w, h, 0x241a12);
  if (!iga) box(g, .05, .1, .06, w / 2 - .12, handleY, 0, 0x1a1410);
  return g;
}
// 格子戸：寺の内陣と外陣の境。黒漆の框に細い縦格子と三本の貫。透けて奥の灯が見える

function igaPanelInstances(kind, count, size = null) {
  const iga = true, profile = null;
  const w = typeof profile === 'number' ? profile : size?.w ?? .9;
  const h = typeof size === 'number' ? size : size?.h ?? 1.8;
  const key = kind + ':' + iga + ':' + w + ':' + h + ':' + (cgtOn() && cgtHas('slide_door_a'));
  if (!panels.has(key)) {
    let panel;
    if (iga) {
      panel = kind === 'fusumaPlain' ? igaFusuma(w, h)
        : kind === 'fusuma' ? fusuma(w, h) : kind === 'fusumaE' ? fusuma(w, h, true)
        : kind === 'itado' || kind === 'itadoRight' ? igaItado(w, h, true, kind === 'itadoRight' ? -1 : 1)
        : kind === 'koshi' ? koshi(w, h) : igaShoji(w, h, true, kind === 'shojiRight' ? -1 : 1);
    } else {
      panel = kind === 'fusuma' ? fusuma(w, h)
        : kind === 'fusumaPlain' ? fusuma(w, h, false, true) : kind === 'fusumaE' ? fusuma(w, h, true)
        : kind === 'itado' ? itado(w, h)
        : kind === 'koshi' || kind === 'koshiHiei' ? koshi(w, h, kind === 'koshiHiei')
        : shoji(w, h, kind === 'shojiHiei');
    }
    panels.set(key, batchInterior(panel));
  }
  return panels.get(key).children.map((m) => { const copy = new THREE.InstancedMesh(m.geometry, m.material, Math.max(1, count)); cacheUsers.push(new WeakRef(copy)); return copy; });
}
export function fusuma(w = .9, h = 1.8, painted = false, plain = false, operable = true) {
  const kit = painted || plain ? null : bought('slide_door_a', w, h, .06); if (kit) return kit;
  const g = new THREE.Group();
  // 無地の襖紙は四周の框の内面へ納める。框へ一センチずつ食い込ませない。
  const inset = plain ? .08 : .06;
  if (plain && operable) {
    // 野田福島の詰所・僧坊の引手は、襖紙の上に金具を貼らず両面を彫り込む。
    // 四周の紙を開口で切り、芯を残して閉じた襖から光を漏らさない。
    // 固定の袖は一枚のまま。共通の戸を作る時だけ割り、開閉中は形を使い回す。
    const x = w / 2 - .13, y = h * .48, left = x - .026, right = x + .026;
    const bottom = y - .036, top = y + .036;
    const x0 = -w / 2 + inset / 2, x1 = w / 2 - inset / 2;
    box(g, left - x0, h - inset, .035, (x0 + left) / 2, h / 2, 0, 0xffffff, 'fusumaPlain');
    box(g, x1 - right, h - inset, .035, (right + x1) / 2, h / 2, 0, 0xffffff, 'fusumaPlain');
    box(g, .052, bottom - inset / 2, .035, x, (inset / 2 + bottom) / 2, 0, 0xffffff, 'fusumaPlain');
    box(g, .052, h - inset / 2 - top, .035, x, (top + h - inset / 2) / 2, 0, 0xffffff, 'fusumaPlain');
    box(g, .052, .072, .017, x, y, 0, 0x59432e);
  } else box(g, w - inset, h - inset, .035, 0, h / 2, 0, 0xffffff, plain ? 'fusumaPlain' : 'fusuma');
  // 野田福島の詰所・僧坊の襖も、障子と同じ木肌で縁を組む。
  // 竪框と横框で木目を返し、固定の袖も動く戸も同じ部品を共有する。
  frame(g, w, h, plain ? 0x59432e : 0x32271c, plain, false, plain);
  if (plain && operable) {
    // 無地の襖は金具の塊でなく、両面に縁付きの引手を納める推定復元。
    // 紙面より少し深い底と四周の縁で凹みを表し、框の厚み内に収める。
    const x = w / 2 - .13, y = h * .48;
    for (const side of [-1, 1]) {
      box(g, .052, .072, .004, x, y, side * .0105, 0x241a12);
      for (const dx of [-.03, .03]) box(g, .008, .088, .008, x + dx, y, side * .0235, 0x66553a, 'doorWood');
      for (const dy of [-.04, .04]) box(g, .052, .008, .008, x, y + dy, side * .0235, 0x66553a, 'doorWoodCross');
    }
  } else if (operable) box(g, .06, .08, .055, w / 2 - .13, .85, 0, 0x66553a);
  return g;
}
function frame(g, w, h, color, joinery = false, fingerPull = false, woodGrain = false) {
  const vertical = woodGrain ? 'doorWood' : '', horizontal = woodGrain ? 'doorWoodCross' : '';
  for (const y of [.02, h - .02]) {
    if (!joinery) { box(g, w, .04, .06, 0, y, 0, color, vertical); continue; }
    // 野田福島の框の四隅は相欠きの推定復元。横框は裏半分、竪框は
    // 表半分を掛け、表の継ぎ目の奥には木を残して光を漏らさない。
    // 戸の外寸・溝・当たりを保ち、共有する建具の形を作る時だけ組む。
    box(g, w, .04, .03, 0, y, -.015, color, horizontal);
    box(g, w - .083, .04, .03, 0, y, .015, color, horizontal);
    for (const x of [-w / 2 + .02, w / 2 - .02])
      box(g, .04, .04, .03, x, y, .015, color, vertical);
  }
  // 竪框の胴は横框の内面で止め、四隅の掛かりと同じ面を重ねない。
  for (const x of [-w / 2 + .02, w / 2 - .02]) {
    if (!fingerPull) {
      box(g, .04, joinery ? h - .08 : h, .06, x, h / 2, 0, color, vertical);
      continue;
    }
    // 障子の指掛けは框の両面を六ミリ彫る推定復元。黒い板を表面へ貼らず、
    // 上下と左右に木を残し、凹みの底まで同じ框の厚みへ納める。
    // 固定の袖は彫らず、動く戸だけ形を共有して既存の束へまとめる。
    const y = h * .48, pullH = Math.min(.15, h * .15);
    const bottom = y - pullH / 2, top = y + pullH / 2;
    box(g, .04, bottom - .04, .06, x, (bottom + .04) / 2, 0, color, vertical);
    box(g, .04, h - .04 - top, .06, x, (h - .04 + top) / 2, 0, color, vertical);
    for (const side of [-1, 1]) box(g, .009, pullH, .06, x + side * .0155, y, 0, color, vertical);
    box(g, .022, pullH, .048, x, y, 0, 0x3a2a1c, vertical);
  }
}
export function shoji(w = .9, h = 1.8, kumiko = false, waist = false, operable = true) {
  const kit = kumiko ? null : bought('slide_door_c', w, h, .06); if (kit) return kit;
  const g = new THREE.Group(), rail = h * .18;
  // 組子の障子紙は竪框・上框の内側から張る。腰付きは腰桟の上端から始め、
  // 動く戸も固定の袖も、木枠の中へ紙を突き通さない同じ納まりにする。
  const paperBottom = waist ? rail + .02 : kumiko ? .04 : .02;
  const paperTop = h - (kumiko ? .04 : .02), paperWidth = w - (kumiko ? .08 : .04);
  // 野田福島の紙は組子の裏へ一枚張る。紙を挟んで同じ格子を二重に作らず、
  // 紙面と組子の裏面を合わせ、框の厚みの中へ納める。
  box(g, paperWidth, paperTop - paperBottom, kumiko ? .004 : .025,
    0, (paperTop + paperBottom) / 2, kumiko ? -.009 : 0, 0xffffff, kumiko ? 'shojiPaper' : 'shoji');
  // 高の野田福島の障子は無地の棒にせず、框・組子の長手に沿う木肌で納める。
  // 腰板と同じ絵・材質を共用し、戸を滑らせる処理や部材の数は増やさない。
  frame(g, w, h, 0x795b3b, kumiko, kumiko && operable, kumiko);
  if (waist) {
    // 野田福島の僧坊・庫裏の間仕切りは腰付き障子とする推定復元。
    // 紙と組子を腰板へ通さず、固定の袖と動く戸で同じ比率を使う。
    if (!kumiko) box(g, w - .08, rail - .06, .03, 0, (rail + .02) / 2, 0, 0x795b3b, 'doorWood');
    box(g, w - .08, .04, .06, 0, rail, 0, 0x795b3b, kumiko ? 'doorWoodCross' : '');
    if (kumiko) {
      // 僧坊・庫裏の腰板は、線を貼った一枚板でなく縦板を接ぐ推定復元。
      // 継ぎ目の実を残し、表裏だけ三ミリ落として光の抜けない厚みを持たせる。
      // 固定の袖と動く障子で共用し、元の板と目地と同じ箱の数で束ねる。
      const width = w - .08, bottom = .04, top = rail - .02, trim = .018;
      const boards = Math.max(2, Math.ceil(width / .22)), step = width / boards, joint = .006;
      for (let i = 0; i < boards; i++) {
        const left = -width / 2 + step * i, right = left + step;
        const a = left + (i ? joint / 2 : 0);
        const b = right - (i + 1 < boards ? joint / 2 : 0);
        box(g, b - a, top - bottom, .03, (a + b) / 2, (bottom + top) / 2, 0, 0x795b3b, 'doorWood');
        if (i) box(g, joint, top - bottom, .024, left, (bottom + top) / 2, 0, 0x795b3b, 'doorWood');
      }
      // 腰板の端を押縁で留める推定復元。御影堂の格子戸と同じ断面を使い、
      // 紙と腰桟にはかぶせず、框の厚みの内側で四周を受ける。
      for (const side of [-1, 1]) {
        for (const y of [bottom + trim / 2, top - trim / 2])
          box(g, width, trim, .012, 0, y, side * .022, 0x3a2a1c, 'doorWoodCross');
        for (const x of [-width / 2 + trim / 2, width / 2 - trim / 2])
          box(g, trim, top - bottom - trim * 2, .012, x, (bottom + top) / 2, side * .022, 0x3a2a1c, 'doorWood');
      }
    }
  }
  if (kumiko) {
    // 野田福島の高だけ。組子側と紙を張った側を分け、一本の木組みで受ける。
    // 動く戸・固定の袖とも同じ形を使い、生成時に材質ごとの束へまとめる。
    const bottom = waist ? rail + .02 : .04, top = h - .04;
    // 框と腰桟の内寸で割り付ける。戸全体の幅・高さを基準にすると、
    // 細い固定の袖で竪組子が框へ食い込み、腰桟の上だけ格間が半端になる。
    // 一間未満の細い袖には無理に竪組子を立てず、横組子の木口も同じ内寸で受ける。
    const width = w - .08, height = top - bottom;
    const nx = Math.max(1, Math.round(width / .22)), ny = Math.max(1, Math.round(height / .28));
    // 組子の交点は相欠きで組む推定復元。紙側の半分は竪材を通し、
    // 室内側の半分は横材を通す。横材を突き付けただけの形にしない。
    // 交点の面を重ねず、腰桟・框・障子紙と元の厚みを保つ。
    // 相欠きの継ぎ目には一ミリの逃げを残す。上下の木が同じ面で
    // つながって一本の格子に見えないようにし、奥の半材で紙を受ける。
    // 隙間を戸の裏まで貫通させず、形・材質・開閉の処理は共用する。
    const joint = .001, rows = [];
    for (let i = 1; i < ny; i++) {
      const y = bottom + height * i / ny;
      if (y - .009 > bottom && y + .009 < top) rows.push(y);
    }
    for (let i = 1; i < nx; i++) {
      const x = -width / 2 + width * i / nx;
      box(g, .018, top - bottom, .014, x, (top + bottom) / 2, 0, 0x795b3b, 'doorWood');
      let start = bottom;
      for (let j = 0; j <= rows.length; j++) {
        const end = j < rows.length ? rows[j] - .009 - joint : top;
        if (end > start) box(g, .018, end - start, .014,
          x, (start + end) / 2, .014, 0x795b3b, 'doorWood');
        if (j < rows.length) start = rows[j] + .009 + joint;
      }
    }
    // 固定の袖と滑る障子で共用し、生成時だけ既存の材質ごとの束へまとめる。
    for (const y of rows) {
      box(g, width, .018, .014, 0, y, .014, 0x795b3b, 'doorWoodCross');
      for (let j = 0; j < nx; j++) {
        const left = -width / 2 + width * j / nx + (j ? .009 + joint : 0);
        const right = -width / 2 + width * (j + 1) / nx - (j + 1 < nx ? .009 + joint : 0);
        if (right > left) box(g, right - left, .018, .014,
          (left + right) / 2, y, 0, 0x795b3b, 'doorWoodCross');
      }
    }
  }
  return g;
}
// 板戸：黒ずんだ杉の鏡板に、横の桟を五段（寺の堂・蔵の間仕切り）。一枚0.9m、足もと原点
export function itado(w = .9, h = 1.8, joinery = false) {
  const g = new THREE.Group();
  // 玄関・用屋の鏡板も四センチ幅の框の内寸へ収める。
  // 縦板の目地と裏桟が使う幅に揃え、四隅で板を框へ埋めない。
  const inset = joinery ? .08 : .06;
  if (joinery) {
    // 野田福島の玄関・用屋の鏡板は、黒い線を貼った一枚板でなく
    // 縦板を接いで組む推定復元。継ぎ目だけ両面を浅く落とし、
    // 中央の実は残して外の光を通さない。戸の外寸・厚み・当たりは保つ。
    const width = w - inset, count = Math.max(2, Math.round(width / .22));
    const step = width / count, joint = .008;
    // 引手の底を板の表へ貼らず、鏡板そのものを両面から欠く。
    // 中央に十八ミリの木を残し、閉めた板戸から外の光を漏らさない。
    // 戸の共通形を作る時だけ割り、開閉中の処理と外寸は増やさない。
    const pullY = h * .42, pullHalfH = .045;
    for (let i = 0; i < count; i++) {
      const left = -width / 2 + step * i, right = left + step;
      const a = left + (i ? joint / 2 : 0);
      const b = right - (i + 1 < count ? joint / 2 : 0);
      const cuts = [a, b];
      for (const edge of [-1, 1]) {
        const x = edge * (w / 2 - .12);
        for (const t of [x - .0225, x + .0225]) if (t > a && t < b) cuts.push(t);
      }
      cuts.sort((a, b) => a - b);
      for (let j = 0; j + 1 < cuts.length; j++) {
        const left = cuts[j], right = cuts[j + 1], x = (left + right) / 2;
        const pull = Math.abs(Math.abs(x) - (w / 2 - .12)) < .0225;
        if (!pull) box(g, right - left, h - inset, .03, x, h / 2, 0, 0x4a3828, 'doorWood');
        else {
          const bottom = pullY - pullHalfH, top = pullY + pullHalfH;
          box(g, right - left, bottom - inset / 2, .03, x, (bottom + inset / 2) / 2, 0, 0x4a3828, 'doorWood');
          box(g, right - left, h - inset / 2 - top, .03, x, (h - inset / 2 + top) / 2, 0, 0x4a3828, 'doorWood');
          box(g, right - left, pullHalfH * 2, .018, x, pullY, 0, 0x4a3828, 'doorWood');
        }
      }
      if (i) box(g, joint, h - inset, .024, left, h / 2, 0, 0x4a3828, 'doorWood');
    }
  } else box(g, w - inset, h - inset, .03, 0, h / 2, 0, 0x4a3828);
  if (joinery) {
    // 玄関・用屋の鏡板は四周の押縁で受ける推定復元。
    // 框の内面へ納め、板端の目地を覆う。表裏とも戸厚六センチの内側に
    // 収め、二本の溝を滑る外寸と当たりは変えない。
    const width = w - .08, height = h - .08, trim = .018;
    // 押縁は縦横で材の長手へ木目を通す。鏡板と同じ木肌を使い、
    // 横の押縁や裏桟まで縦板の繊維に見せない。戸の共通形を作る時だけ適用する。
    for (const side of [-1, 1]) {
      for (const y of [.04 + trim / 2, h - .04 - trim / 2])
        box(g, width, trim, .012, 0, y, side * .021, 0x2e2218, 'doorWoodCross');
      for (const x of [-width / 2 + trim / 2, width / 2 - trim / 2])
        box(g, trim, height - trim * 2, .012, x, h / 2, side * .021, 0x2e2218, 'doorWood');
    }
    // 用屋の板戸は裏の三本の横桟で縦板を受ける推定復元。
    // 表まで横桟を突き通さず、表は縦板と留め栓だけを見せる。
    // 裏桟は板の裏面から框の裏面までに納め、溝を通る厚みは保つ。
    const railH = .075, railW = width - trim * 2;
    for (const ratio of [.18, .5, .82]) {
      const y = h * ratio;
      // 裏桟の木口は左右の押縁の内面で止め、同じ面の木を重ねない。
      box(g, railW, railH, .015, 0, y, -.0225, 0x2e2218, 'doorWoodCross');
      // 板を留める木栓は框の厚み内に納め、左右の戸を裏返しても溝に当てない。
      const boards = Math.max(2, Math.round(width / .22));
      for (const side of [-1, 1]) for (let i = 0; i < boards; i++) box(g, .014, .014, .003,
        -railW / 2 + railW * (i + .5) / boards, y, side < 0 ? -.0305 : .0165, 0x795b3b);
    }
  } else {
    for (let k = 1; k < 6; k++) box(g, w - .06, .045, .05, 0, h * k / 6, 0, 0x2e2218);
  }
  // 野田福島の板戸も鏡板・裏桟と同じ木肌で框を組む。
  // 竪框は縦目、上下の框は横目とし、既存の形・材質を共有する。
  frame(g, w, h, 0x241a12, joinery, false, joinery);
  if (joinery) {
    // 板戸の引手は黒い突起でなく、両面に縁と暗い底を持つ掘り込みで表す。
    // 桟と重ならない高さへ置き、框と同じ厚みの内に収めて溝を通す。
    // 左右の框寄りに引手を設け、右の戸も表裏を返さず扱えるようにする。
    // 裏桟は二枚とも同じ側へ向け、玄関で片方だけ外へ露出させない。
    const y = h * .42;
    for (const edge of [-1, 1]) for (const side of [-1, 1]) {
      const x = edge * (w / 2 - .12);
      box(g, .045, .09, .003, x, y, side * .0105, 0x1a1410);
      for (const dx of [-.026, .026]) box(g, .007, .104, .008, x + dx, y, side * .021, 0x241a12);
      for (const dy of [-.0485, .0485]) box(g, .045, .007, .008, x, y + dy, side * .021, 0x241a12);
    }
  } else box(g, .05, .1, .06, w / 2 - .12, .9, 0, 0x1a1410);
  return g;
}
// 格子戸：寺の内陣と外陣の境。黒漆の框に細い縦格子と三本の貫。透けて奥の灯が見える
// 格子戸の射線用の木材。人の当たりは戸一枚のまま、矢・槍だけ格子の隙間を通す。
// 左端・足元からの寸法を設営時に用意し、動く戸は絵と同じ倍率で伸ばす。
// 動く紙戸の木だけを槍で受ける。共有形（幅九十・高さ百八十センチ）と同じ割り。
export function paperDoorTimbers(kind, sx, sy, waist = false, w = .9, h = 1.8) {
  const pieces = [];
  const add = (x0, x1, y0, y1) => pieces.push([x0 * sx, x1 * sx, y0 * sy, y1 * sy, .03]);
  for (const y of [0, h - .04]) add(0, w, y, y + .04);
  for (const x of [0, w - .04]) add(x, x + .04, .04, h - .04);
  if (kind === 'shoji') {
    const bottom = waist ? h * .18 + .02 : .04, top = h - .04, width = w - .08;
    if (waist) add(.04, w - .04, .04, bottom);
    const nx = Math.max(1, Math.round(width / .22));
    const ny = Math.max(1, Math.round((top - bottom) / .28));
    for (let i = 1; i < nx; i++) {
      const x = .04 + width * i / nx;
      add(x - .009, x + .009, bottom, top);
    }
    for (let i = 1; i < ny; i++) {
      const y = bottom + (top - bottom) * i / ny;
      add(.04, w - .04, y - .009, y + .009);
    }
  }
  return pieces;
}
export function koshiTimbers(w, h, sx = 1, sy = 1) {
  const pieces = [], scale = h / 1.8, width = w - .08, railH = .035 * scale;
  const add = (x0, x1, y0, y1, r) => pieces.push([x0 * sx, x1 * sx, y0 * sy, y1 * sy, r]);
  for (const y of [0, h - .04]) add(0, w, y, y + .04, .03);
  for (const x of [0, w - .04]) add(x, x + .04, .04, h - .04, .03);
  add(.04, w - .04, .04, .32 * scale - railH / 2, .015);
  for (const y of [.32 * scale, h * .55, h - .3 * scale])
    add(.04, w - .04, y - railH / 2, y + railH / 2, .02);
  const count = Math.max(1, Math.round(width / .1));
  const half = Math.min(.022, width / (count + 1) * .5) / 2;
  let bottom = .32 * scale + railH / 2;
  for (const top of [h * .55 - railH / 2, h - .3 * scale - railH / 2, h - .04]) {
    if (top > bottom) for (let k = 1; k <= count; k++) {
      const x = .04 + k * width / (count + 1);
      add(x - half, x + half, bottom, top, .015);
    }
    bottom = top + railH;
  }
  return pieces;
}
export function koshi(w = .9, h = 1.8, joinery = false, operable = true) {
  const g = new THREE.Group();
  // 高の野田福島は障子と同じ木肌を共用する。縦板・竪格子は縦目、
  // 貫と押縁は長手の横目にし、固定の袖と滑る戸で材の向きを揃える。
  const vertical = joinery ? 'doorWood' : '', horizontal = joinery ? 'doorWoodCross' : '';
  // 御影堂の腰板へ縦格子を貫通させない。動く戸と固定の袖は同じ比率で割り、
  // 戸を鴨居の高さへ伸ばしても腰板・貫の高さが隣とずれないようにする。
  const scale = joinery ? h / 1.8 : 1;
  // 野田福島の腰板は下框と一番下の貫の内面まで入れる。
  // 板の上に透ける隙間を残さず、縦格子は貫の上から上框の内面までで受ける。
  const railH = .035 * scale, width = w - (joinery ? .08 : .06);
  const bottom = joinery ? .32 * scale + railH / 2 : .03, top = h - (joinery ? .04 : .03 * scale);
  if (joinery) {
    // 御影堂の格子は框の内寸で割る。狭い固定の袖へ八本を押し込まず、
    // 横貫の上下の内面で縦格子を止め、木材を突き通さない推定復元。
    // 固定の袖も動く戸も同じ部品を束ね、毎コマの処理は増やさない。
    const count = Math.max(1, Math.round(width / .1));
    const bars = [h * .55, h - .3 * scale];
    let lo = bottom;
    for (const hi of [...bars.map(y => y - railH / 2), top]) {
      if (hi > lo) for (let k = 1; k <= count; k++)
        box(g, Math.min(.022, width / (count + 1) * .5), hi - lo, .03,
          -width / 2 + k * width / (count + 1), (hi + lo) / 2, 0, 0x2a1c12, vertical);
      lo = hi + railH;
    }
  } else for (let k = 1; k < 9; k++) box(g, .022, top - bottom, .03,
    -w / 2 + k * w / 9, (top + bottom) / 2, 0, 0x2a1c12);
  for (const y of [.32 * scale, h * .55, h - .3 * scale])
    box(g, width, railH, .04, 0, y, 0, 0x2a1c12, horizontal);
  const waistBottom = joinery ? .04 : .03 * scale;
  const waistTop = joinery ? .32 * scale - railH / 2 : .29 * scale;
  if (joinery) {
    // 腰板は線を貼った一枚の箱でなく、実を残して縦板を接ぐ推定復元。
    // 表裏の目地だけ浅く落とし、板の間から内陣の光が漏れないようにする。
    // 動く格子戸と固定の袖で同じ部品・材質を使い、生成時に束ねる。
    const boards = Math.max(2, Math.round(width / .22)), trim = .018;
    const step = width / boards, joint = .006, height = waistTop - waistBottom;
    const y = (waistTop + waistBottom) / 2;
    // 押縁の下は通した板端とし、浅い目地を押縁の外へ突き出さない。
    for (const yy of [waistBottom + trim / 2, waistTop - trim / 2])
      box(g, width, trim, .03, 0, yy, 0, 0x3a2a1c, horizontal);
    for (let i = 0; i < boards; i++) {
      const left = -width / 2 + step * i, right = left + step;
      const a = left + (i ? joint / 2 : 0);
      const b = right - (i + 1 < boards ? joint / 2 : 0);
      box(g, b - a, height - trim * 2, .03, (a + b) / 2, y, 0, 0x3a2a1c, vertical);
      if (i) box(g, joint, height - trim * 2, .024, left, y, 0, 0x3a2a1c, vertical);
    }
    // 御影堂の腰板は四周の押縁で受ける推定復元。板の端を框へ突き付けるだけにせず、
    // 固定の袖と滑る格子戸で同じ納まりにする。押縁は框の厚み内へ収め、溝を保つ。
    // 上下を通し、左右の木口をその内面で止める。形と材質は既存の束で共有する。
    for (const side of [-1, 1]) {
      const z = side * .022;
      for (const y of [waistBottom + trim / 2, waistTop - trim / 2])
        box(g, width, trim, .012, 0, y, z, 0x2a1c12, horizontal);
      for (const x of [-width / 2 + trim / 2, width / 2 - trim / 2])
        box(g, trim, height - trim * 2, .012, x, (waistBottom + waistTop) / 2, z, 0x2a1c12, vertical);
    }
  } else box(g, width, waistTop - waistBottom, .03, 0, (waistTop + waistBottom) / 2, 0, 0x3a2a1c);
  // 御影堂の動く格子戸は竪框を実際に彫り、表面へ黒い板を貼らない。
  // 障子と同じ指掛けの木組みを使い回し、左右・表裏から指を掛けられる形にする。
  // 固定の袖には彫らず、框の厚みと既存の引き込み溝は保つ。
  frame(g, w, h, 0x1e140e, joinery, joinery && operable, joinery);
  if (joinery) {
    // 御影堂の横貫は框との接点を込栓で留める推定復元。
    // 格子や指掛けのない框の中だけへ木口を見せ、裏側からも納まりを読めるようにする。
    // 木口は框の面から半ミリだけ出して面のちらつきを避け、引き戸の溝を保つ。
    // 固定の袖と動く戸で形・材質を共有し、室内の束へまとめる。
    const peg = Math.min(.014, railH * .45);
    for (const y of [.32 * scale, h * .55, h - .3 * scale])
      for (const x of [-w / 2 + .02, w / 2 - .02]) for (const side of [-1, 1])
        box(g, peg, peg, .006, x, y, side * .0275, 0x795b3b, vertical);
  }
  return g;
}
export function tatami(w = .9, d = 1.8, wovenBorder = false) {
  // 織布の縁を指定した畳は、柱際の切り欠きと同じ畳表・縁・厚さで組む。
  // 購入部品の読み込み状況で、一室の途中から縁の意匠を変えない。
  const kit = wovenBorder ? null : bought('tatami_floor_modular_a', w, .06, d);
  const g = new THREE.Group();
  // 素材に穴や切り欠きがあっても、下の暗い基壇を床のすき間として見せない。
  // 縁と同じ高さの表面を重ねず、畳表は縁の内面で止める。
  box(g, wovenBorder ? w - .088 : w, kit ? .045 : .06, d, 0, kit ? .0225 : .03, 0, 0xffffff, 'tatami');
  if (kit) { g.add(kit); return g; }
  // 畳縁（黒の麻）：長い辺だけに付ける
  // 高の野田福島は畳縁も畳表・敷居と同じ六センチに納める。
  // 縁だけ六ミリ盛り上げて、引き戸の下框へ食い込ませない。
  const borderH = wovenBorder ? .06 : .066;
  for (const x of [-w / 2 + .022, w / 2 - .022]) box(g, .044, borderH, d, x, borderH / 2, 0,
    wovenBorder ? 0xffffff : 0x1d1c18, wovenBorder ? 'tatamiBorder' : ''); return g;
}
// 畳の割り付け：通常は一列おきに半畳ずらす。堂の広間では列を通す指定も使える。
export function tatamiTiles(x0, x1, z0, z1, tw = .9, td = 1.8, stagger = true) {
  const out = [];
  for (let x = x0, c = 0; x < x1 - .02; x += tw, c++) {
    const w = Math.min(tw, x1 - x);
    for (let z = z0 - (stagger && c % 2 ? td / 2 : 0); z < z1 - .02; z += td) {
      const a = Math.max(z0, z), b = Math.min(z1, z + td);
      if (w > .1 && b - a > .1) out.push([x + w / 2, (a + b) / 2, w, b - a]);
    }
  }
  return out;
}
// 床の仕上げだけを切り欠く。部屋の畳割りと畳寄せは分割しない。
function floorWithout(pieces, hole) {
  return pieces.flatMap(([x0, x1, z0, z1]) => {
    const a = Math.max(x0, hole.x0), b = Math.min(x1, hole.x1);
    const c = Math.max(z0, hole.z0), d = Math.min(z1, hole.z1);
    if (a >= b || c >= d) return [[x0, x1, z0, z1]];
    return [[x0, a, z0, z1], [b, x1, z0, z1], [a, b, z0, c], [a, b, d, z1]]
      .filter(v => v[1] - v[0] > .001 && v[3] - v[2] > .001);
  });
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
export function tomyo(oil = false, hieiOil = false, plain = false) {
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
  const kit = plain || oil ? null : bought('japanese_lamp_emissive', .32, .95, .32); if (kit) return kit;
  const g = new THREE.Group(); box(g, .32, .05, .32, 0, .025, 0, 0x39291d);
  if (plain) {
    // 野田福島の室内灯は角材の火袋でなく、台に載せた油皿と灯芯で表す。
    // 中世の灯明皿を参考にした推定復元。台の高さ・幅と灯りの位置は保つ。
    // 参照：https://www.tnm.jp/modules/r_exhibition/index.php?controller=item&id=7467&lang=ja
    if (!shapes.has('nodaLampDish')) {
      const profile = [[0, 0], [.045, 0], [.065, .008], [.09, .035],
        [.09, .043], [.08, .043], [.056, .015], [0, .015]];
      shapes.set('nodaLampDish', new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 12));
      shapes.set('nodaLampOil', new THREE.CylinderGeometry(.06, .06, .004, 12));
    }
    box(g, .05, .72, .05, 0, .405, 0, 0x604329);
    box(g, .18, .035, .18, 0, .7825, 0, 0x604329);
    for (const [key, y, color] of [['nodaLampDish', .8, 0x9b7855], ['nodaLampOil', .821, 0x55452b]]) {
      const m = new THREE.Mesh(shapes.get(key), mat(color));
      m.position.y = y; g.add(m); cacheUsers.push(new WeakRef(m));
    }
    // 灯芯は皿の縁へ渡し、炎は芯の先だけに置く。毎コマ形を作らない。
    box(g, .012, .008, .065, 0, .843, .055, 0x30251e);
    box(g, .018, .09, .018, 0, .892, .077, 0xffd08b);
    return g;
  }
  box(g, .05, .75, .05, 0, .4, 0, 0x604329); box(g, .18, .08, .18, 0, .8, 0, 0xcbb37a);
  if (hieiOil) {
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
  if (S.quality === 'high' && layout.profile === 'nodafukushima' && layout.kind === 'hondo') {
    // 須弥壇の二灯も、描いた油皿の灯芯から内陣を照らす。
    // 壇・灯具を描く時と同じ縮尺と向きで、設営時だけ火先を求める。
    const lamps = [];
    for (const p of layout.props) if (p.part === 'altar') {
      const rot = p.rot || 0, c = Math.cos(rot), s = Math.sin(rot);
      for (const side of [-1, 1]) {
        // 灯明は縮めず、壇上の高さ五十五センチへ据えている。
        // 据え付け高を縮尺と取り違えると、光だけが壇の腰まで下がる。
        // 灯具の炎へ据え付け高を足してから、壇全体と同じ縮尺で変換する。
        const x = side * .75 * p.w / 2.1, z = .077 * p.d;
        lamps.push([p.x + x * c + z * s, (p.y || 0) + (.55 + .892) * p.h / 1.5,
          p.z - x * s + z * c]);
      }
    }
    return lamps;
  }
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
export function panelInstances(kind, count, kumiko = false, plain = false, joinery = false, waist = false) {
  if (arguments[2] === 'iga') return igaPanelInstances(kind, count, arguments[3]);
  if (typeof kumiko === 'number' && typeof plain === 'number' && ['fusumaVillage', 'fusumaPlain', 'shojiKumiko', 'shojiKumikoRight', 'shojiKoshi', 'shojiKoshiRight', 'itadoVillage', 'itadoVillageRight', 'koshiHikite', 'koshiHikiteRight'].includes(kind)) return villagePanelInstances(kind, count, kumiko, plain);
  if (kind.endsWith('M') || kind.endsWith('MR')) return mirroredPanelInstances(kind, count);
  if (typeof plain === 'number' && typeof kumiko === 'boolean' && kumiko && !kind.endsWith('Hiei')) return inabaPanelInstances(kind, count, plain, joinery);
  if (typeof plain === 'number') return hieiPanelInstances(kind, count, plain, joinery);
  if (typeof kumiko === 'number') return hieiPanelInstances(kind, count, kumiko, plain);
  const key = kind + ':' + (cgtOn() && cgtHas('slide_door_a')) + ':' + kumiko + ':' + plain + ':' + joinery + ':' + waist;
  if (!panels.has(key)) panels.set(key, batchInterior(kind === 'fusuma' ? fusuma(.9, 1.8, false, plain) : kind === 'fusumaE' ? fusuma(.9, 1.8, true, plain) : kind === 'itado' ? itado(.9, 1.8, joinery) : kind === 'koshi' ? koshi(.9, 1.8, joinery) : shoji(.9, 1.8, kumiko, waist)));
  return panels.get(key).children.map((m) => { const copy = new THREE.InstancedMesh(m.geometry, m.material, Math.max(1, count)); cacheUsers.push(new WeakRef(copy)); return copy; });
}
function mirroredPanelInstances(kind, count) {
  const key = '森部:' + kind, right = kind.endsWith('MR');
  if (!panels.has(key)) {
    let panel;
    if (kind.startsWith('shoji')) panel = moribeShoji(.9, 1.8, right);
    else if (kind.startsWith('itado')) panel = moribeItado(.9, 1.8, right);
    else if (kind.startsWith('koshi')) panel = moribeKoshi(.9, 1.8, right);
    else {
      panel = villageFusuma(.9, 1.8, false, true);
      if (right) for (const part of panel.children) part.position.x *= -1;
    }
    panels.set(key, batchInterior(panel));
  }
  return panels.get(key).children.map(m => {
    const copy = new THREE.InstancedMesh(m.geometry, m.material, Math.max(1, count));
    cacheUsers.push(new WeakRef(copy)); return copy;
  });
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

// 低い用屋では鴨居の上端（戸の上端から十センチ）を梁の下面より下へ納める。
// 動く戸・固定の袖・当たりで共有し、室内を作る時だけ使う。
export function nodaDoorHeight(h) {
  return Math.min(2.3, h - .4);
}

// 庫裏・僧坊の間仕切り障子は組子を畳の座敷へ、紙面を土間・入口へ向ける。
// 入口が反対向きの間取りも、固定の袖と動く戸で同じ部屋境界から決める。
export function nodaShojiReverse(layout, z) {
  return ['sobo', 'kuri'].includes(layout.kind)
    && layout.rooms.some(r => r.floor === 'tatami' && Math.abs(r.z1 - z) < .01);
}

// 野田・福島の長押は間仕切り・独立柱・外周で高さを共有する。
// 鴨居と欄間の上でつなぎ、天井の低い用屋でも天井板へ埋めない。
export function nodaNageshiHeight(kind, h) {
  const ph = nodaDoorHeight(h);
  const ranma = ['hondo', 'sobo', 'kuri'].includes(kind) && h - ph > 1;
  return Math.min(ph + (ranma ? .76 : .42), h - .08);
}

// 野田福島の間仕切りの柱割り。描く柱と矢・槍を受ける柱を同じ寸法にする。
// 設営と室内生成の時だけ使い、戸口と前後の引き込み溝は空ける。
export function nodaPartitionPosts(layout, v) {
  const a = Math.min(v.ax, v.bx), b = Math.max(v.ax, v.bx), n = Math.max(1, Math.ceil((b - a) / 1.8));
  const pw = Math.min(.16, b - a);
  // 御影堂の境も内陣・外陣の独立柱と同じ柱筋にする。
  // 戸口の両端は残し、柱を戸の引き込み溝へ突き出さない。
  const hallPosts = layout.kind === 'hondo' ? layout.props.filter(p => p.part === 'hallPost') : [];
  if (hallPosts.length) {
    const positions = [a + pw / 2, b - pw / 2];
    for (const p of hallPosts) if (p.x > a + pw && p.x < b - pw
      && !positions.some(x => Math.abs(x - p.x) < pw)) positions.push(p.x);
    return { width: pw, positions };
  } else {
    const positions = [a + pw / 2];
    if (b - a > pw) positions.push(b - pw / 2);
    // 板間・土間の梁端を間仕切りの柱で受ける。梁割りは naka.js と揃え、
    // 袖壁の内側だけへ柱を立てる。板戸・襖の開口と引き込み溝は空ける。
    // 座敷の竿縁天井には梁を見せないため、従来の柱割りを使う。
    const supports = [];
    for (const room of layout.rooms) {
      if (room.floor === 'tatami' || Math.min(Math.abs(room.z0 - v.az), Math.abs(room.z1 - v.az)) > .01) continue;
      const x0 = room.x0 + .1, x1 = room.x1 - .1;
      const count = Math.max(1, Math.ceil((x1 - x0) / 1.7));
      for (let i = 0; i <= count; i++) {
        const x = x0 + (x1 - x0) * i / count;
        if (x >= a + pw / 2 && x <= b - pw / 2
          && !supports.some(p => Math.abs(p - x) < .16)) supports.push(x);
      }
    }
    if (supports.length) {
      for (const x of supports) if (!positions.some(p => Math.abs(p - x) < .16)) positions.push(x);
    } else for (let i = 1; i < n; i++) positions.push(a + pw / 2 + (b - a - pw) * i / n);
    return { width: pw, positions };
  }
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

// 屋敷と評定の間。局所+zが入口。通れる幅2.4mの戸口と、廊下から室内へ抜ける口を空ける。
function mainLayoutProps(layout, h = 2.7, { partitions = true, dim = false } = {}) {
  
  // 今の山岳戦と前の比叡山で調度を共有。出入り案内が使う型の名前は変えない。
  const villageHome = false, nodaJoinery = false;
  const hiei = layout.profile === 'hiei' || layout.profile === 'hieizan';
  const hieiSobo = layout.profile === 'hieizan' && layout.kind === 'sobo';
  const hieiKuri = layout.profile === 'hieizan' && layout.kind === 'kuri';
  const hieiTatamiFloor = hieiSobo || hieiKuri;
  const hieiTatami = hieiTatamiFloor;
  const templeAltar = layout.profile === 'inabayama' && layout.kind === 'hondo' || hiei || layout.profile === 'echizen_ikko' || layout.profile === 'iwamura_hondo' || layout.profile === 'takato' && layout.kind === 'hondo';
  const japanese = !!layout.profile && cgtOn() && cgtHas('naibu_tatami_floor_modular_a');
  const purchased = cgtOn() && cgtHas('Floor_Tatami') && !cgtHas('tatami_floor_modular_a');
  const inabaHigh = layout.profile === 'inabayama' && S.quality === 'high';
  const key = JSON.stringify([layout, h, partitions, dim, purchased, japanese, cgtOn() && cgtHas('tatami_floor_modular_a'), inabaHigh]);
  if (layoutDecor.has(key)) { const copy = layoutDecor.get(key).clone(); cacheUsers.push(new WeakRef(copy)); return copy; }
  const g = new THREE.Group(), kb = purchased || japanese ? new KitBatch() : null;
  if (layout.profile === 'iga') {
for (const p of layout.props) {
    const part = new THREE.Group();
    // 館の取次と陣小屋の木櫃も蓋付きの板組みにする。
    // 民家と原形・材質を共用し、間取りで決めた外寸と当たりを保つ。
    const moribeStorage = false;
    const igaStorage = layout.profile === 'iga' &&
      (layout.kind === 'minka' && p.part === 'storage' || ['nagaya', 'yashiki'].includes(layout.kind) && p.part === 'chest');
    // 神宮寺の堂は家庭用の仏壇へ替えず、下の須弥壇・本尊・灯明を使う。
    const igaStove = layout.profile === 'iga' && p.part === 'stove';
    const kit = p.part === 'stove' && !igaStove && !hieiKuri ? bought('furnace_complete', p.w, p.h, p.d) : p.part === 'storage' && !igaStorage && !hieiTatami ? bought('drawer_a', p.w, p.h, p.d) : p.part === 'altar' && !templeAltar ? bought('butsudan', p.w, p.h, p.d) : null;
    if (kit) part.add(kit);
    else if (igaStove) {
      // 麓の民家の竈は土を塗った胴・灰床・奥まった焚口と羽釜で復元する。
      // 炎や光源は足さず、逃れた家の冷えた炊事場として静止した束へまとめる。
      const w = p.w, d = p.d, h = p.h, bodyH = h * .72;
      box(part, w, .06, d, 0, .03, 0, 0x75634b);
      box(part, w, bodyH - .06, d * .55, 0, (bodyH + .06) / 2, -d * .225, 0x75634b);
      for (const side of [-1, 1])
        box(part, w * .27, bodyH - .06, d * .45,
          side * w * .365, (bodyH + .06) / 2, d * .275, 0x75634b);
      // 焚口の上は直角の横穴にせず、土を塗り固めた丸い迫りで受ける推定復元。
      // 側壁の間に半円の口を抜き、奥行きも胴へつなぐ。二軒で原形を共有する。
      const mouthR = w * .23, springY = bodyH * .45;
      const mouthKey = `igaStove:迫り:${w}:${d}:${h}`;
      if (!shapes.has(mouthKey)) {
        const arch = new THREE.Shape();
        arch.moveTo(-mouthR, bodyH);
        arch.lineTo(mouthR, bodyH);
        arch.lineTo(mouthR, springY);
        arch.absarc(0, springY, mouthR, 0, Math.PI, false);
        arch.closePath();
        shapes.set(mouthKey, new THREE.ExtrudeGeometry(arch,
          { depth: d * .45, bevelEnabled: false, curveSegments: 8, steps: 1 }));
      }
      const mouth = new THREE.Mesh(shapes.get(mouthKey), mat(0x75634b));
      mouth.position.z = d * .05; part.add(mouth);
      box(part, w * .46, .015, d * .4, 0, .0675, d * .25, 0x544b3e);
      const mouthTop = springY + mouthR;
      box(part, w * .46, mouthTop - .06, .008, 0, (mouthTop + .06) / 2, d * .055, 0x241e18);
      // 木蓋のつまみも登録した高さへ収める。平らな円板だけにせず、
      // 二枚継ぎの蓋を反り止めで受ける。二軒で形と材質を共用する。
      const lidTop = h - .025;
      // 円筒の胴と宙に浮いた羽を分けず、丸底から肩・羽・口縁までつなぐ。
      // 羽の下面を竈の上端へ載せ、丸底は焚口より上の胴の中へ落とす推定復元。
      // 蓋の高さと調度の外寸は保ち、二軒で同じ原形・鉄の材質を使う。
      const potKey = `igaStove:羽釜:${w}:${h}`;
      if (!shapes.has(potKey)) shapes.set(potKey, new THREE.LatheGeometry([
        new THREE.Vector2(0, bodyH - .1),
        new THREE.Vector2(w * .12, bodyH - .085),
        new THREE.Vector2(w * .23, bodyH - .045),
        new THREE.Vector2(w * .27, bodyH),
        new THREE.Vector2(w * .34, bodyH),
        new THREE.Vector2(w * .34, bodyH + .025),
        new THREE.Vector2(w * .27, bodyH + .025),
        new THREE.Vector2(w * .25, lidTop - .055),
        new THREE.Vector2(w * .27, lidTop - .045),
        new THREE.Vector2(w * .27, lidTop - .03),
        new THREE.Vector2(0, lidTop - .03),
      ], 12));
      const pot = new THREE.Mesh(shapes.get(potKey), mat(0x292723));
      cacheUsers.push(new WeakRef(pot)); part.add(pot);
      const lidKey = `igaStove:蓋:${w}`;
      if (!shapes.has(lidKey)) shapes.set(lidKey, new THREE.CylinderGeometry(w * .28, w * .28, .03, 12));
      const lid = new THREE.Mesh(shapes.get(lidKey), mat(0x795b3b));
      lid.position.y = lidTop - .015;
      cacheUsers.push(new WeakRef(lid)); part.add(lid);
      box(part, .003, .002, w * .54, 0, lidTop, 0, 0x493022);
      box(part, w * .4, .025, .035, 0, lidTop + .0125, 0, 0x604831);
    }
    else if (igaStorage) {
      // 麓の民家・陣小屋・館の取次の収納は蓋付きの板櫃で推定復元する。
      // 脚・胴・蓋・反り止めを指定寸法の内側へ納め、板間と戸の通り幅を保つ。
      const w = p.w, d = p.d, h = p.h, foot = .06, lid = .04;
      // 胴を無垢の塊にせず、底板と四方の側板で組む。木肌は柱・建具と共有し、
      // 胴の縦板、蓋の長手、反り止めの向きへ木目を通す。
      const timber = (width, height, depth, x, y, z, color, across = false) => {
        const board = igaBoard(part, across ? depth : width, height,
          across ? width : depth, y, color);
        if (across) board.rotation.y = Math.PI / 2;
        board.position.x = x; board.position.z = z;
      };
      for (const x of [-1, 1]) for (const z of [-1, 1])
        timber(.08, foot, .08, x * (w / 2 - .07), foot / 2, z * (d / 2 - .07), 0x3a2a1c);
      const bodyH = h - foot - lid - .02, bodyY = foot + bodyH / 2;
      timber(w - .08, .03, d - .08, 0, foot + .015, 0, 0x795b3b, true);
      for (const side of [-1, 1]) {
        timber(w - .02, bodyH, .03, 0, bodyY, side * (d / 2 - .025), 0x795b3b);
        timber(.03, bodyH, d - .08, side * (w / 2 - .025), bodyY, 0, 0x795b3b);
      }
      timber(w, lid, d, 0, h - lid / 2 - .02, 0, 0x604831, true);
      for (const x of [-w * .3, w * .3])
        timber(.045, .02, d - .02, x, h - .01, 0, 0x3a2a1c);
      // 板継ぎも共通の箱形で作り、毎コマの生成や専用の材質を増やさない。
      for (let x = -w / 2 + .18; x < w / 2 - .03; x += .18)
        for (const z of [-1, 1])
          box(part, .008, h - foot - lid - .02, .004, x, (h + foot - lid - .02) / 2, z * (d / 2 - .009), 0x604831);
      // 側板と蓋も板を接いで納める。正面だけ板目があり、横と上が
      // 一塊に見える仕上げを避ける。継ぎ目は外寸の内側へ置く。
      for (let z = -d / 2 + .18; z < d / 2 - .03; z += .18) {
        for (const x of [-1, 1])
          box(part, .004, bodyH, .003, x * (w / 2 - .009), foot + bodyH / 2, z, 0x604831);
        // 蓋の反り止めは上へ出ているため、目地はその下で止める。
        const edge = w * .3, halfBatten = .0225;
        for (const [a, b] of [[-w / 2 + .02, -edge - halfBatten],
          [-edge + halfBatten, edge - halfBatten], [edge + halfBatten, w / 2 - .02]])
          if (b > a) box(part, b - a, .002, .003, (a + b) / 2, h - .02, z, 0x493522);
      }
      // 板端を留める木栓。金属帯を足さず、脚・蓋と同じ共有部品へまとめる。
      for (const x of [-1, 1]) for (const z of [-1, 1]) for (const yy of [foot + .07, foot + bodyH - .07])
        box(part, .005, .016, .016, x * (w / 2 - .008), yy, z * (d / 2 - .065), 0x493522);
    }
    else if (p.part === 'alcove') {
      if (layout.profile === 'iga') {
        // 小城館の床の間は指定した当たりの内側に納める。購入した掛物も
        // 同じ群れへ入れ、位置・回転・寸法が後の縮尺から外れないようにする。
        const w = p.w, d = p.d, h = p.h, post = .08;
        // 床柱・落掛・天井の縁も柱梁と同じ木肌にそろえる。
        // 原形の縦の木目を材の長手へ回し、寸法と仕口の位置は保つ。
        // 形・材質は共有し、調度と同じ静止した束へまとめる。
        const timber = (width, height, depth, x, y, z, color, axis) => {
          const wood = axis === 'x' ? igaBoard(part, height, width, depth, y, color)
            : axis === 'z' ? igaBoard(part, width, depth, height, y, color)
            : igaBoard(part, width, height, depth, y, color);
          if (axis === 'x') wood.rotation.z = -Math.PI / 2;
          else if (axis === 'z') wood.rotation.x = Math.PI / 2;
          wood.position.x = x; wood.position.z = z;
        };
        // 床の間の下部は一塊の台にせず、床框で地板の木口を受ける推定復元。
        // 高さと外寸は保ち、既存の当たり・畳・床柱へ張り出さない。
        const frameD = .08, boardD = d - frameD;
        box(part, w, .09, d, 0, .045, 0, 0x604831);
        // 床框と地板は長手へ木目を通す。板間・建具の木肌と形を共用し、
        // 木目の縮尺を保ったまま横へ回す。外寸と床の高さは変えない。
        const crossBoard = (width, height, depth, y, z, color) => {
          const board = igaBoard(part, depth, height, width, y, color);
          board.rotation.y = Math.PI / 2; board.position.z = z;
        };
        crossBoard(w, .12, frameD, .06, (d - frameD) / 2, 0x493522);
        // 地板は奥行き方向に三枚ほどを継ぎ、目地を床框の手前で止める。
        // 共通の箱形・材質で作り、ほかの調度と一緒に静止した束へまとめる。
        const boards = Math.max(1, Math.round(boardD / .15));
        for (let i = 0; i < boards; i++) {
          const z = -d / 2 + (i + .5) * boardD / boards;
          crossBoard(w, .03, boardD / boards, .105, z, 0x6a5038);
          if (i > 0) box(part, w - post * 2, .002, .003, 0, .12,
            -d / 2 + i * boardD / boards, 0x493522);
        }
        // 床の間の背壁と脇壁も座敷と同じ土塗りで納める推定復元。
        // 単色の板に見える面を残さず、藁すさと土粒を実寸でそろえる。
        // 既存の土壁の絵・寸法別の形を共有し、外寸と当たりは変えない。
        igaPlaster(part, w, h - .12, .04, 0, (h + .12) / 2, -d / 2 + .02, 0xcfc3a2);
        // 床柱だけの棚にせず、床脇の壁と落掛の奥の天井まで囲う。
        // 指定された幅・奥行き・高さの中へ納め、座敷と通り道へ張り出さない。
        for (const x of [-(w - .04) / 2, (w - .04) / 2])
          igaPlaster(part, .04, h - .12, d - post, x, (h + .12) / 2, -post / 2, 0xcfc3a2);
        // 低い天井も座敷の天井と同じ木肌で張る。既存の目地に合わせて
        // 木目を奥行きへ向け、落掛や側壁の内側に納める。
        // 側壁は四センチ厚。床柱の八センチを両側から引くと、
        // 天井と側壁の間に四センチずつ穴が残る。壁の内面まで張り、
        // 背壁の内面から落掛の裏までを回縁と同じ寸法で囲う。
        const ceilingW = w - .08, ceilingD = d - post - .04;
        const ceilingZ = -post / 2 + .02, ceilingBottom = h - .04;
        // 背面と脇壁も奥の柱・地覆・頭つなぎで受ける推定復元。
        // 正面の床柱だけでは、背壁と低い天井を支える木組みがなかった。
        // 壁の内面へ納め、地板・掛物・座敷側の通路には張り出さない。
        // 床柱と同じ木肌・原形を使い、既存の静止した束へまとめる。
        const rearPost = .06, rearZ = -d / 2 + .04 + rearPost / 2;
        const rearX = w / 2 - .04 - rearPost / 2;
        const sillH = .06, capH = .08;
        for (const side of [-1, 1]) {
          timber(rearPost, ceilingBottom - .12, rearPost,
            side * rearX, (.12 + ceilingBottom) / 2, rearZ, 0x614832, 'y');
          // 脇の地覆は奥柱から正面の床柱まで渡し、地板の上で壁を受ける。
          const frontZ = (d - post) / 2;
          timber(rearPost, sillH, frontZ - rearZ,
            side * rearX, .12 + sillH / 2, (rearZ + frontZ) / 2, 0x614832, 'z');
        }
        timber(rearX * 2, sillH, rearPost, 0, .12 + sillH / 2, rearZ, 0x614832, 'x');
        timber(rearX * 2, capH, rearPost, 0, ceilingBottom - capH / 2,
          rearZ, 0x614832, 'x');
        // 奥の地覆と天井受けも奥柱へほぞ差しする推定復元。
        // 横木を柱へ重ねるだけにせず、内側の肩と込栓を見せる。
        // 背壁の室内面に収め、掛物・地板・床の間の開口は空ける。
        const rearTenon = .02, rearFace = rearZ + rearPost / 2;
        for (const side of [-1, 1]) for (const [jointY, railH] of [
          [.12 + sillH / 2, sillH], [ceilingBottom - capH / 2, capH],
        ]) {
          timber(rearTenon, railH / 3, rearPost / 2,
            side * (rearX + rearTenon / 2), jointY, rearZ, 0x614832, 'x');
          const shoulderX = side * (rearX - rearPost / 2);
          box(part, .002, railH, .002, shoulderX, jointY,
            rearFace + .001, 0x493522);
          for (const edge of [-1, 1])
            box(part, rearPost, .002, .002, side * rearX,
              jointY + edge * railH / 6, rearFace + .001, 0x493522);
          box(part, .012, .012, .004, side * (rearX + .005),
            jointY, rearFace + .002, 0x98774d);
        }
        const ceilingBoard = igaBoard(part, ceilingW, .04, ceilingD,
          h - .02, 0x7a6448);
        ceilingBoard.position.z = ceilingZ;
        // 床の間の低い天井も一枚板で済ませず、回縁と竿縁で納める推定復元。
        // 座敷と同じく竿縁は床の間に平行。板の継ぎ目を直交させ、
        // 側壁・背壁・落掛の内側だけに置く。共通の箱形で静止した束へまとめる。
        // 脇の回縁を通し、前後の回縁はその内面へ突き付ける。
        // 四隅で同じ下面を重ねると木目がちらつくため、実際の材も重ねない。
        // 材の本数・天井高・共有する形と材質は保つ。
        const ceilingTrim = .03, innerCeilingW = ceilingW - ceilingTrim * 2;
        for (const x of [-(ceilingW - ceilingTrim) / 2, (ceilingW - ceilingTrim) / 2])
          timber(ceilingTrim, .04, ceilingD, x, ceilingBottom - .02, ceilingZ, 0x493522, 'z');
        for (const z of [ceilingZ - (ceilingD - ceilingTrim) / 2, ceilingZ + (ceilingD - ceilingTrim) / 2])
          timber(innerCeilingW, .04, ceilingTrim, 0, ceilingBottom - .02, z, 0x493522, 'x');
        const ceilingBoards = Math.max(2, Math.ceil(ceilingW / .24));
        for (let i = 1; i < ceilingBoards; i++)
          box(part, .004, .002, ceilingD - .06,
            -ceilingW / 2 + i * ceilingW / ceilingBoards,
            ceilingBottom - .001, ceilingZ, 0x493522);
        timber(ceilingW - .06, .025, .025, 0,
          ceilingBottom - .0125, ceilingZ, 0x493522, 'x');
        // 床柱は落掛で切らず、座敷の天井まで通す。落掛の上に小壁だけが
        // 残る棚のような納まりを避け、左右の柱で小壁と回縁まで受ける。
        // 床の間の低い天井・落掛の高さは保ち、共通の箱形を使う。
        const postH = Math.max(h, h - (p.y || 0));
        for (const x of [-(w - post) / 2, (w - post) / 2])
          timber(post, postH, post, x, postH / 2, (d - post) / 2, 0x614832, 'y');
        // 落掛は床柱の内面で突き合わせず、両端を二センチ差して受ける推定復元。
        // 柱の表には差し口と込栓を見せ、外寸・戸口・床の高さは保つ。
        timber(w - post * 2 + .04, .1, post, 0, h - .05, (d - post) / 2, 0x614832, 'x');
        for (const side of [-1, 1]) {
          const shoulderX = side * (w / 2 - post);
          box(part, .003, .1, .002, shoulderX, h - .05, d / 2 - .001, 0x493522);
          box(part, .02, .002, .002, shoulderX + side * .01,
            h - .1, d / 2 - .001, 0x493522);
          box(part, .018, .018, .004, side * (w - post) / 2,
            h - .05, d / 2 - .002, 0x493522);
        }
        // 落掛の上を座敷の天井へつなぐ。上と脇に隙間のある置き家具に見せない。
        const upper = Math.max(0, h - (p.y || 0) - h);
        if (upper > .001) {
          const upperY = h + upper / 2;
          // 落掛より上も下の背壁・脇壁と同じ土塗りにする。
          // 一色の箱へ戻すと座敷の天井際だけ土肌が途切れるため、
          // 寸法別の形と共有材質を使い、同じ静止した束へ納める。
          igaPlaster(part, w, upper, .06, 0, upperY, (d - post) / 2, 0xcfc3a2);
          // 落掛の上は正面だけでなく脇・背面も座敷の天井まで閉じる。
          // 床の間自体の低い天井は残し、脇から小壁の裏を見通せない造りにする。
          // 既存の壁と同じ厚み・材質で、静止した調度の束へまとめる。
          for (const x of [-(w - .04) / 2, (w - .04) / 2])
            igaPlaster(part, .04, upper, d - post, x, upperY, -post / 2, 0xcfc3a2);
          igaPlaster(part, w, upper, .04, 0, upperY, -d / 2 + .02, 0xcfc3a2);
          // 落掛上の小壁も土壁だけで立てず、床柱を頭つなぎで結ぶ推定復元。
          // 束は落掛の上から横木の下面まで。座敷の天井を突き抜けず、
          // 襖・障子の引きしろと床の間の開口へは下ろさない。
          const capH = Math.min(.08, upper), capY = h + upper - capH / 2;
          const frontZ = (d - post) / 2;
          timber(w - post * 2, capH, post, 0, capY, frontZ, 0x614832, 'x');
          const studH = upper - capH;
          if (studH > .08) {
            const bays = Math.max(1, Math.ceil((w - post * 2) / .6));
            for (let i = 1; i < bays; i++) {
              const x = -w / 2 + post + (w - post * 2) * i / bays;
              timber(.04, studH, post, x, h + studH / 2, frontZ, 0x614832, 'y');
            }
          }
        }
        const sw = Math.min(.45, w - post * 4), sh = Math.min(1.1, h - .5);
        const scroll = bought('wall_scroll', sw, sh, .025);
        if (scroll) place(part, scroll, 0, -d / 2 + .06, 0, .12 + (h - .12 - sh) / 2);
        else {
          const bottom = .12 + (h - .12 - sh) / 2, back = -d / 2 + .06;
          box(part, sw, sh, .015, 0, bottom + sh / 2, back, 0xffffff, 'igaScroll');
          // 上下の軸と軸先を表装の幅から少し出し、掛物を壁板から離す。
          for (const yy of [bottom, bottom + sh])
            box(part, sw + .06, .018, .025, 0, yy, back + .008, 0x493b29);
          // 吊り紐は上の軸から中央の釘へ。共通の箱形・材質を使い回す。
          const rise = .08, half = sw * .36, length = Math.hypot(half, rise);
          for (const side of [-1, 1]) {
            const cord = box(part, length, .005, .005, side * half / 2,
              bottom + sh + rise / 2, back, 0x8c7c56);
            cord.rotation.z = -side * Math.atan2(rise, half);
          }
          // 紐の頂点を壁から浮かせたままにせず、折れ釘へ掛ける。
          // 背壁から紐の手前へ軸を出し、先を上へ返す。既存の鉄色と箱形を共用する。
          const nailY = bottom + sh + rise;
          box(part, .008, .008, .028, 0, nailY, back - .006, 0x302b26);
          box(part, .008, .018, .008, 0, nailY + .005, back + .004, 0x302b26);
        }
      } else if (japanese && addNaibu(kb, 'wall_scroll', p.x, (p.y || 0) + .8, p.z - .35 * Math.cos(p.rot || 0), .55, 1.25, .04, p.rot || 0)) {
        box(part, 2.3, .18, .85, 0, .09, 0, 0x604831);
        box(part, 2.3, 2.5, .08, 0, 1.25, -.43, 0xcfc3a2);
      } else part.add(tokonoma(2.3));
    } else if (p.part === 'chest') {
      const w = p.w ?? .85, h = p.h ?? .7, d = p.d ?? .7;
      if (layout.profile === 'iga') {
        // 陣小屋の収納は引き出し箪笥でなく、蓋と運搬用の把手を持つ木櫃で復元する。
        // 指定した当たりの中に金具まで納め、床高と寝床の脇の通り幅を保つ。
        // 胴を無垢の角塊にせず、底板と四方の板で組む推定復元。
        // 蓋・側板も既存の板肌を使い、金具・外寸・通路の当たりは保つ。
        const timber = (width, height, depth, x, y, z, color, across = false) => {
          const board = igaBoard(part, across ? depth : width, height,
            across ? width : depth, y, color);
          if (across) board.rotation.y = Math.PI / 2;
          board.position.x = x; board.position.z = z;
        };
        const bodyH = h - .07;
        timber(w - .02, .03, d - .02, 0, .015, 0, 0x503923, true);
        for (const side of [-1, 1]) {
          timber(w - .02, bodyH, .03, 0, bodyH / 2,
            side * (d / 2 - .025), 0x503923);
          timber(.03, bodyH, d - .08, side * (w / 2 - .025),
            bodyH / 2, 0, 0x503923);
        }
        timber(w, .06, d, 0, h - .03, 0, 0x604831, true);
        // 正面・側面と蓋の板継ぎ。蓋の目地は鉄帯の手前で切る。
        for (let x = -w / 2 + .18; x < w / 2 - .03; x += .18)
          for (const side of [-1, 1])
            box(part, .003, bodyH - .04, .004, x, bodyH / 2,
              side * (d / 2 - .009), 0x3a2a1c);
        for (let z = -d / 2 + .18; z < d / 2 - .03; z += .18) {
          for (const side of [-1, 1])
            box(part, .004, bodyH - .04, .003, side * (w / 2 - .009),
              bodyH / 2, z, 0x3a2a1c);
          const band = w * .32, halfBand = .0175;
          for (const [a, b] of [[-w / 2 + .02, -band - halfBand],
            [-band + halfBand, band - halfBand], [band + halfBand, w / 2 - .02]])
            if (b > a) box(part, b - a, .002, .003, (a + b) / 2,
              h - .001, z, 0x3a2a1c);
        }
        for (const x of [-w * .32, w * .32]) {
          box(part, .035, .008, d - .02, x, h - .004, 0, 0x252321);
          for (const z of [-1, 1])
            box(part, .035, h - .08, .008, x, (h - .08) / 2, z * (d / 2 - .006), 0x252321);
          // 帯金は板へ打った鋲で留める推定復元。平らな帯を貼るだけにせず、
          // 蓋と胴を別々に留め、蓋の合わせ目には鋲をまたがせない。
          // 外寸の内側へ納め、既存の箱形・材質で静止した調度の束へまとめる。
          for (const z of [-d / 2 + .045, 0, d / 2 - .045])
            box(part, .012, .004, .012, x, h - .002, z, 0x252321);
          for (const side of [-1, 1]) for (const yy of [.045, bodyH - .035])
            box(part, .012, .012, .004, x, yy, side * (d / 2 - .003), 0x252321);
        }
        box(part, .07, .14, .012, 0, h - .12, d / 2 - .006, 0x252321);
        for (const x of [-1, 1]) {
          for (const z of [-.09, .09]) {
            // 運搬用の把手は細い棒を側板へ直付けせず、座金と鋲で受ける。
            // 持ち手を含む元の外寸を保ち、寝床や通路へ張り出さない。
            box(part, .008, .09, .05, x * (w / 2 - .01), h * .55, z, 0x252321);
            for (const yy of [-.032, .032])
              box(part, .004, .012, .012, x * (w / 2 - .004), h * .55 + yy, z, 0x252321);
            box(part, .012, .07, .018, x * (w / 2 - .006), h * .55, z, 0x252321);
          }
          box(part, .012, .018, .2, x * (w / 2 - .006), h * .55 - .035, 0, 0x252321);
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
      const hearthY = layout.profile === 'iga' ? p.y || 0 : 0;
      if (layout.profile === 'iga' && layout.kind === 'minka') {
        // 炉は板床から切り下げる。炉縁だけを床面へ出し、灰床と熾火をその下へ納める。
        // 灰床の下と四周を土で囲い、木の炉縁へ熾火が直接当たらない納まりにする推定復元。
        // 土底は床下の高さまで下ろし、板床へ空けた穴の中だけに納める。
        // 二軒とも既存の箱形・材質を共有し、静止した調度の束へまとめる。
        const liningW = p.w - .16, liningD = p.d - .16, liningT = .025;
        const ashBottom = -.0875, liningBottom = -hearthY;
        box(part, liningW, ashBottom - liningBottom, liningD,
          0, (ashBottom + liningBottom) / 2, 0, 0x65503a);
        for (const x of [-1, 1])
          box(part, liningT, .0875, liningD,
            x * (liningW - liningT) / 2, -.04375, 0, 0x65503a);
        for (const z of [-1, 1])
          box(part, liningW - liningT * 2, .0875, liningT,
            0, -.04375, z * (liningD - liningT) / 2, 0x65503a);
        box(part, liningW - liningT * 2, .025, liningD - liningT * 2, 0, -.075, 0, 0x756c5e);
        // 炉縁も板間・柱と同じ木肌で納める。単色の角材では石の枠に見えるため、
        // 四本とも長手へ木目を通し、短辺を長辺へ差した所に込栓を見せる推定復元。
        // 炉の外寸・灰床との離隔・床上二センチの高さは保つ。
        // 原形と材質は二軒で共有し、既存の静止した調度の束へまとめる。
        for (const x of [-1, 1]) {
          const rail = igaBoard(part, .08, p.d, .14, -.05, 0x493022);
          rail.rotation.x = Math.PI / 2;
          rail.position.x = x * (p.w / 2 - .04);
        }
        for (const z of [-1, 1]) {
          igaDoorTimber(part, p.w - .16, .14, .08,
            0, -.05, z * (p.d / 2 - .04), 0x493022, true);
          for (const x of [-1, 1])
            box(part, .014, .002, .014,
              x * (p.w / 2 - .04), .021, z * (p.d / 2 - .04), 0x795b3b);
        }
        // 炉底の一枚の赤い角板を、灰に埋まった薪と割れ目の熾火へ替える。
        // 炉縁より下に収め、鍋・自在鉤・通路の当たりは保つ。
        // 二軒で同じ先細りの薪を使い、既存の静止した調度の束へまとめる。
        const coalKey = 'igaHearthCharcoal';
        if (!shapes.has(coalKey)) {
          const geo = new THREE.BoxGeometry(.32, .035, .065), pos = geo.attributes.position;
          for (let i = 0; i < pos.count; i++)
            if (pos.getX(i) > 0) {
              pos.setY(i, pos.getY(i) * .7);
              pos.setZ(i, pos.getZ(i) * .65);
            }
          geo.computeVertexNormals(); shapes.set(coalKey, geo);
        }
        for (let i = 0; i < 3; i++) {
          const log = new THREE.Group();
          const coal = new THREE.Mesh(shapes.get(coalKey), mat(0x29231e));
          cacheUsers.push(new WeakRef(coal)); log.add(coal);
          // 焼け残った黒い面に細い赤熱部と灰を残し、全体を赤く塗らない。
          box(log, .21, .003, .009, -.015, .018, .006, i === 1 ? 0xb9662d : 0x8a4224);
          for (const x of [-.1, .07])
            box(log, .018, .004, .047, x, .018, -.004, 0x756c5e);
          log.position.set((i - 1) * .025, -.043 + (i === 1 ? .019 : 0), (i - 1) * .09);
          log.rotation.y = i === 1 ? .9 : -.18;
          part.add(log);
        }
        // 自在鉤を梁の下面へ掛ける。共通の形と材質で作り、揺らす処理は加えない。
        const beamY = h - .25 - hearthY, hookY = .55;
        box(part, .045, beamY - hookY, .045, 0, (beamY + hookY) / 2, 0, 0x493022);
        box(part, .2, .045, .045, .075, hookY, 0, 0x292723);
        box(part, .025, .12, .025, .16, hookY + .04, 0, 0x292723);
        // 棒と鉤だけでは釜の高さを留められない。自在鉤の調節用の横木と
        // 吊り紐を添える推定復元。横木を傾けて棒へ噛ませ、梁から紐で受ける。
        // 形と材質は共通の箱を使い、既存の静止した調度の束へまとめる。
        const latchY = Math.min(1.15, beamY - .3), latchX = -.12;
        const latch = box(part, .34, .055, .065, latchX, latchY, 0, 0x604831);
        latch.rotation.z = -.18;
        const tieX = latchX - .12, tieY = latchY + .022;
        // 吊り梁は高さ二十・奥行き十六センチ。紐を梁の中で途切れさせず、
        // 両側から上へ回し、鉤の棒と調節紐をそれぞれ梁へ留める推定復元。
        // 既存の箱形と紐の材質で作り、静止した調度の束へ収める。
        const ropeZ = .088, ropeBottom = beamY - .025, ropeTop = beamY + .208;
        for (const x of [0, tieX]) {
          for (const z of [-ropeZ, ropeZ])
            box(part, .012, ropeTop - ropeBottom, .012,
              x, (ropeTop + ropeBottom) / 2, z, 0x958669);
          for (const yy of [ropeBottom, ropeTop])
            box(part, .012, .012, ropeZ * 2 + .012, x, yy, 0, 0x958669);
        }
        box(part, .012, ropeBottom - tieY, .012,
          tieX, (ropeBottom + tieY) / 2, -ropeZ, 0x958669);
        box(part, .012, .012, ropeZ, tieX, tieY, -ropeZ / 2, 0x958669);
        for (const z of [-.038, .038])
          box(part, .035, .045, .012, tieX, tieY, z, 0x958669);
        box(part, .06, .016, .09, tieX, tieY - .025, 0, 0x958669);
        // 弦は木蓋の外へ回し、胴の両脇の耳で受ける。
        // 幅二十八センチの弦では直径三十一・六センチの蓋を突き抜けていた。
        // 上端は自在鉤へ掛けたまま、共通の箱形で耳と弦をつなぐ。
        const bailBottom = .3, bailTop = hookY + .025, bailX = .19;
        for (const side of [-1, 1]) {
          box(part, .06, .04, .045, side * .165, bailBottom, 0, 0x292723);
          box(part, .025, bailTop - bailBottom, .025, side * bailX,
            (bailBottom + bailTop) / 2, 0, 0x292723);
        }
        box(part, bailX * 2 + .025, .025, .025, 0, bailTop, 0, 0x292723);
        {
          // 汎用の釜へ替えると、別に組んだ弦と胴の接続が寸法次第で外れる。
          // 伊賀の炉は丸底・口縁・木蓋を同じ実寸で組み、弦の下端を胴へ差す。
          // 二軒で原形を共有し、既存の調度の束へまとめる。
          const key = 'igaHearthPot';
          if (!shapes.has(key)) shapes.set(key, new THREE.LatheGeometry([
            new THREE.Vector2(0, .16), new THREE.Vector2(.09, .17),
            new THREE.Vector2(.145, .21), new THREE.Vector2(.175, .28),
            new THREE.Vector2(.16, .35), new THREE.Vector2(.145, .36),
            new THREE.Vector2(.16, .37), new THREE.Vector2(.16, .385),
            new THREE.Vector2(0, .385),
          ], 12));
          const pot = new THREE.Mesh(shapes.get(key), mat(0x292723));
          cacheUsers.push(new WeakRef(pot)); part.add(pot);
          const lidKey = 'igaHearthPotLid';
          if (!shapes.has(lidKey)) shapes.set(lidKey, new THREE.CylinderGeometry(.158, .158, .02, 12));
          const lid = new THREE.Mesh(shapes.get(lidKey), mat(0x795b3b));
          lid.position.y = .395; cacheUsers.push(new WeakRef(lid)); part.add(lid);
          // 木蓋は二枚を継ぎ、反り止めを兼ねたつまみを付ける。
          box(part, .003, .002, .31, 0, .406, 0, 0x493022);
          box(part, .22, .025, .035, 0, .4175, 0, 0x604831);
        }
      } else if (japanese && addNaibu(kb, 'furnace', p.x, hearthY, p.z, p.w, .18, p.d)) {
        addNaibu(kb, 'kettle_low', p.x, hearthY + .18, p.z, .35, .25, .35);
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
    } else if (p.part === 'spearRack' && layout.profile === 'iga') {
      // 槍は壁へ立てず二脚の横掛けで受ける。穂先まで間取りと共通の当たりへ納める。
      // 設営時だけ作り、既存の室内の束へまとめる。材質はほかの木・鉄と共用する。
      // 奥壁へ横向きに置く陣小屋の横掛けは、登録済みの外寸を局所の寸法へ戻す。
      // 最後にほかの調度と同じ仕組みで回し、槍先まで当たりの内側へ納める。
      const w = p.across ? p.d : p.w, d = p.across ? p.w : p.d, h = p.h;
      // 柱・足・貫は板間や文机と同じ木肌を使い、材の長手へ木目を通す。
      // 共通の原形と材質で作り、既存の静止した室内の束へまとめる。
      const timber = (width, height, depth, x, y, z, color, axis) => {
        const wood = axis === 'x' ? igaBoard(part, height, width, depth, y, color)
          : axis === 'z' ? igaBoard(part, width, depth, height, y, color)
          : igaBoard(part, width, height, depth, y, color);
        if (axis === 'x') wood.rotation.z = -Math.PI / 2;
        else if (axis === 'z') wood.rotation.x = Math.PI / 2;
        wood.position.x = x; wood.position.z = z;
      };
      // 二脚を足元の貫でつなぎ、長い槍を載せた時に別々に倒れる形を避ける推定復元。
      // 柱心まで差し、込栓を室内側へ見せる。登録済みの外寸と通路は保つ。
      const postX = -w / 2 + .05, tieY = h * .18;
      timber(.05, .07, d * .56, postX, tieY, 0, 0x604831, 'z');
      for (const z of [-d * .28, d * .28]) {
        timber(w, .08, .24, 0, .04, z, 0x503923, 'x');
        timber(.07, h, .07, postX, h / 2, z, 0x503923, 'y');
        box(part, .012, .022, .022, postX + .038, tieY, z, 0x98774d);
        for (let q = 0; q < 3; q++) {
          const armY = h * (.3 + q * .27);
          timber(w - .06, .05, .06, .02, armY, z, 0x604831, 'x');
          // 腕木を柱から突き出すだけにせず、下から方杖で受ける推定復元。
          // 槍の下面と留め木を避け、三段とも登録済みの外寸へ納める。
          // 木目は斜材の長手へ回し、共通の板肌・原形を静止した束へまとめる。
          const braceX0 = postX + .035, braceX1 = w / 2 - .09;
          const braceBottom = armY - .2, braceTop = armY - .025;
          const run = braceX1 - braceX0, rise = braceTop - braceBottom;
          const length = Math.hypot(run, rise), angle = Math.atan2(rise, run);
          const brace = igaBoard(part, .035, length, .045,
            (braceBottom + braceTop) / 2, 0x604831);
          brace.rotation.z = angle - Math.PI / 2;
          brace.position.x = (braceX0 + braceX1) / 2; brace.position.z = z;
          // 腕木の差し口を込栓で留める。木口は柱の両面へ出し、柄には触れない。
          for (const face of [-1, 1])
            box(part, .018, .018, .008, postX, armY, z + face * .038, 0x98774d);
          // 横木だけでは丸い柄が転がり落ちる。先端へ留め木を立てる推定復元。
          // 柄の置き場を空け、登録済みの幅・高さの中へ納める。
          timber(.035, .07, .06, w / 2 - .0275, armY + .06, z, 0x604831, 'y');
        }
      }
      // 番所の備え槍は角棒と四角錐で済ませず、丸柄・口金・鎬のある穂で納める。
      // 同寸の三本は原形を共有し、設営時に従来の材質の束へまとめる。
      const round = (key, radius, length) => {
        if (!shapes.has(key)) {
          const geo = new THREE.CylinderGeometry(radius, radius, length, 8);
          geo.rotateX(Math.PI / 2); shapes.set(key, geo);
        }
        return shapes.get(key);
      };
      const shaft = round(`伊賀の槍柄:${d}`, .0175, d - .25);
      const collar = round('伊賀の槍口金', .023, .12);
      const butt = round('伊賀の槍石突', .021, .1);
      if (!shapes.has('伊賀の槍穂')) {
        const geo = new THREE.BufferGeometry();
        // 切先・両刃・茎側の底と、表裏の鎬。穂先は柄の外（＋奥行き）へ向ける。
        geo.setAttribute('position', new THREE.Float32BufferAttribute([
          0, 0, .12, -.035, 0, -.06, 0, 0, -.12, .035, 0, -.06,
          0, .009, -.06, 0, -.009, -.06,
        ], 3));
        geo.setIndex([0, 4, 1, 1, 4, 2, 2, 4, 3, 3, 4, 0,
          0, 1, 5, 1, 2, 5, 2, 3, 5, 3, 0, 5]);
        const tip = geo.toNonIndexed(); geo.dispose();
        tip.computeVertexNormals();
        tip.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(tip.attributes.position.count * 2), 2));
        shapes.set('伊賀の槍穂', tip);
      }
      for (let q = 0; q < 3; q++) {
        // 横掛けの上面へ丸柄の下面を合わせ、空中へ浮かせない。
        const yy = h * (.3 + q * .27) + .025 + .0175;
        for (const [geo, z, color] of [[shaft, -.125, 0x795b3b],
          [collar, d / 2 - .3, 0x252321], [butt, -d / 2 + .05, 0x252321],
          [shapes.get('伊賀の槍穂'), d / 2 - .12, 0x9a9a9e]]) {
          const mesh = new THREE.Mesh(geo, mat(color));
          mesh.position.set(.04, yy, z); part.add(mesh);
        }
      }
    } else if (p.part === 'ammo' && layout.profile === 'iga') {
      // 番所の矢櫃の推定復元。底板と四方の板を組み、矢の先を箱へ納める。
      // 板床・武具掛けと同じ木肌を使い、板の長手へ木目を通す。
      // 原形と材質は共有し、室内の静止物へまとめて描く。
      const w = p.w, d = p.d, rim = .45, arrowTop = p.h - .03;
      igaBoard(part, w, .06, d, .03, 0x503923);
      // 底板も三枚で納め、継ぎ目は箱の内側だけに見せる。
      for (const x of [-w / 6, w / 6])
        box(part, .002, .001, d - .1, x, .0605, 0, 0x30251b);
      const boardH = (rim - .06) / 3;
      for (let row = 0; row < 3; row++) {
        const yy = .06 + (row + .5) * boardH;
        for (const side of [-1, 1]) {
          const long = igaDoorTimber(part, d, boardH - .002, .05,
            side * (w - .05) / 2, yy, 0, 0x503923, true);
          long.rotation.y = Math.PI / 2;
          igaDoorTimber(part, w - .1, boardH - .002, .05,
            0, yy, side * (d - .05) / 2, 0x503923, true);
          // 木口を留める木栓。箱の外寸を保ち、矢や通路へ張り出さない。
          for (const end of [-1, 1])
            box(part, .003, .014, .014, side * (w / 2 - .0015), yy,
              end * (d / 2 - .025), 0x98774d);
        }
      }
      for (const z of [-1, 1]) for (let q = 0; q < 4; q++) {
        const x = (q - 1.5) * .12, az = z * .12, top = arrowTop - (q % 2) * .04;
        // 備え矢を角棒と十字板で済ませず、丸い矢柄・三方の羽・弦を受ける筈で組む。
        // 矢先は櫃の内へ納めたまま、元の外寸と高さを保つ推定復元。
        // 二種類の長さで原形を共有し、既存の静止した調度の束へ焼き込む。
        const shaftH = top - .1, shaftKey = `igaArrowShaft:${shaftH}`;
        if (!shapes.has(shaftKey)) shapes.set(shaftKey,
          new THREE.CylinderGeometry(.007, .007, shaftH, 8));
        const shaft = new THREE.Mesh(shapes.get(shaftKey), mat(0x9b8057));
        shaft.position.set(x, .08 + shaftH / 2, az);
        cacheUsers.push(new WeakRef(shaft)); part.add(shaft);
        for (let feather = 0; feather < 3; feather++) {
          const angle = feather * Math.PI * 2 / 3;
          const vane = box(part, .025, .16, .002,
            x + Math.cos(angle) * .0195, top - .11,
            az + Math.sin(angle) * .0195, 0xc8bda4);
          vane.rotation.y = -angle;
        }
        // 筈の溝を黒線だけにせず、二本の耳の間に隙間を残す。
        for (const side of [-1, 1])
          box(part, .004, .02, .012, x + side * .005, top - .01, az, 0x9b8057);
        box(part, .018, .025, .018, x, top - .2, az, 0x493022);
      }
    } // 武具の間の弾薬を米俵に置き換えず、下の箱と矢の束を使う。
    else if (p.part === 'waterJar' && layout.profile === 'iga') {
      // 水甕は箱で代用せず、膨らんだ胴と厚い口縁を持つ焼き物にする。
      // 蓋を載せた静止物とし、二軒で原形・材質を共有する。
      const key = `igaWaterJar:${p.w}:${p.d}:${p.h}`;
      if (!shapes.has(key)) {
        const radius = p.w / 2, bodyH = p.h - .04;
        const outline = [[0, 0], [.58, 0], [.83, .12], [1, .4], [.92, .72],
          [.69, .9], [.72, .94], [.72, 1], [.61, 1], [.61, .93]];
        shapes.set(key, new THREE.LatheGeometry(outline.map(([r, y]) =>
          new THREE.Vector2(r * radius, y * bodyH)), 12));
      }
      const jar = new THREE.Mesh(shapes.get(key), mat(0x63503b));
      jar.scale.z = p.d / p.w; part.add(jar);
      const lidW = p.w * .76, lidD = p.d * .76;
      for (let j = 0; j < 3; j++)
        igaDoorTimber(part, lidW / 3 - .002, .02, lidD,
          (j - 1) * lidW / 3, p.h - .03, 0, 0x795b3b);
      igaDoorTimber(part, lidW * .7, .02, .06, 0, p.h - .01, 0, 0x493022, true);
    }
    else if (p.part === 'seatMat' && layout.profile === 'iga') {
      // 番所の板間に敷く一人分のむしろ。厚い座布団や寝床へ置き換えない。
      // 編み目は寝むしろと同じ絵を使い、横縞の角棒を重ねない。
      igaRushMat(part, p.w, p.h, p.d);
      for (const x of [-1, 1])
        box(part, .025, p.h, p.d, x * (p.w / 2 - .0125), p.h / 2, 0, 0x6a5e48);
    }
    else if (p.part === 'bedding') {
      if (layout.profile === 'iga') {
        // 陣小屋の寝床は薄い敷きむしろと藁の枕で推定復元する。
        // 編み目は座と同じ縮尺の共有材質。枕まで間取りの高さの内側へ納める。
        const matH = Math.min(.025, p.h / 3), pillowH = p.h - matH;
        const pillowZ = -p.d / 2 + .15;
        igaRushMat(part, p.w, matH, p.d);
        for (const x of [-1, 1])
          box(part, .025, matH, p.d, x * (p.w / 2 - .0125), matH / 2, 0, 0x6a5e48);
        // 藁枕は角箱でなく、二か所を紐で締めた藁束にする推定復元。
        // 寝床の高さと幅は保ち、丸い原形を寝床どうしで共有して束へ焼き込む。
        const pillowKey = 'igaStrawPillow';
        if (!shapes.has(pillowKey)) shapes.set(pillowKey, new THREE.CylinderGeometry(1, 1, 1, 10));
        const pillow = (x, length, radiusY, radiusZ, color) => {
          const mesh = new THREE.Mesh(shapes.get(pillowKey), mat(color));
          mesh.scale.set(radiusY, length, radiusZ);
          mesh.rotation.z = Math.PI / 2;
          mesh.position.set(x, matH + pillowH / 2, pillowZ);
          cacheUsers.push(new WeakRef(mesh)); part.add(mesh);
        };
        pillow(0, p.w * .6, pillowH / 2, .11, 0x8c7953);
        for (const x of [-p.w * .2, p.w * .2])
          pillow(x, .018, pillowH / 2 + .002, .112, 0x514831);
      } else {
        box(part, p.w, .06, p.d, 0, .03, 0, 0x958669);
        box(part, p.w * .8, .12, .22, 0, .09, -p.d / 2 + .15, 0x6a5e48);
      }
    } else if (p.part === 'tomyo' && hieiTatami) {
      part.add(tomyo(true));
      place(part, lightPool(), 0, 0, 0, .09);
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
    }
    else if (p.part === 'offering') {
      {
        box(part, p.w, .08, p.d, 0, p.h - .04, 0, 0x785b3c);
        for (const x of [-.4, .4]) box(part, .07, p.h, .07, x, p.h / 2, 0, 0x59412b);
        box(part, .18, .18, .18, 0, p.h + .09, 0, 0xd8d0bd);
      }
    }
    else if (p.part === 'desk') {
      if (layout.profile === 'iga') {
        // 番所・館の文机は板脚を貫で結ぶ推定復元。従来の横木は
        // 左右の脚を結ばず、四本脚の前後へ添えただけになっていた。
        // 天板・脚・貫も共有の木肌で作り、寸法と紙・硯の高さを保つ。
        const top = igaBoard(part, .7, .08, 1.2, .42, 0x493022);
        top.rotation.y = Math.PI / 2;
        for (const x of [-.48, .48]) {
          const leg = igaBoard(part, .06, .32, .52, .22, 0x493022);
          leg.position.x = x;
          // 館の文机は畳ずりで板脚を受ける推定復元。細い足先だけを
          // 畳へ載せず、前後へ通した木で支える。番所の板間は従来の足を使う。
          // 足を畳ずりの厚さだけ短くし、天板・料紙・当たりの高さは保つ。
          const runnerH = layout.kind === 'yashiki' ? .025 : 0;
          if (runnerH) {
            const runner = igaBoard(part, .09, runnerH, .62, runnerH / 2, 0x493022);
            runner.position.x = x;
          }
          for (const z of [-.21, .21]) {
            box(part, .06, .06 - runnerH, .1, x, (.06 + runnerH) / 2, z, 0x493022);
            if (runnerH) {
              // 足のほぞを畳ずりへ差し、横栓の木口を両側へ出す。
              // 下面へ突き抜かず、共通の木肌と静止した束で納める。
              const tenon = igaBoard(part, .03, .018, .04, runnerH - .009, 0x493022);
              tenon.position.set(x, runnerH - .009, z);
              box(part, .098, .008, .008, x, .016, z, 0x795b3b);
            }
          }
          // 貫の突き出した木口へ楔を納め、板脚の表に飾りの栓だけを置かない。
          box(part, .012, .09, .025, Math.sign(x) * .515, .17, 0, 0x795b3b);
        }
        const tie = igaBoard(part, .08, .07, 1.04, .17, 0x493022);
        tie.rotation.y = Math.PI / 2;
        box(part, .96, .05, .035, 0, .475, -.32, 0x493022);
        // 館の取次・番所の文机。文字を捏造せず、折った料紙と硯・筆を納める。
        // 机と一緒に指定寸法へ縮め、座敷や戸の引きしろへはみ出さない。
        box(part, .38, .006, .29, -.16, .463, .02, 0xd8cdb0);
        // 硯は平らな黒板にせず、墨をする陸と墨汁をためる海を彫り分ける。
        // 底・縁・陸を同じ石色で組み、海の底だけを低くして窪みを残す。
        // 墨も横たえ、机の登録高に含む五十センチの内側へ収める。
        box(part, .19, .012, .25, .29, .466, -.02, 0x33312b);
        for (const side of [-1, 1]) {
          box(part, .03, .017, .25, .29 + side * .08, .4805, -.02, 0x33312b);
          box(part, .13, .017, .03, .29, .4805, -.02 + side * .11, 0x33312b);
        }
        box(part, .13, .017, .09, .29, .4805, .045, 0x33312b);
        box(part, .126, .001, .126, .29, .4725, -.065, 0x171816);
        box(part, .025, .01, .07, .29, .494, .045, 0x171816);
        box(part, .012, .012, .25, .1, .466, .03, 0x795b3b);
        box(part, .014, .009, .055, .1, .466, .18, 0x292723);
      } else if (layout.profile === 'moribe' && layout.kind === 'yashiki') part.add(tsukue(true));
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
    else if (p.part === 'stove') {
      box(part, .85, .65, .7, 0, .325, 0, 0x75634b);
      box(part, .3, .25, .025, 0, .22, .36, 0x221c17);
      box(part, .42, .18, .42, 0, .72, 0, 0x292723);
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
      const fullHeight = .5;
      part.scale.set(p.w / 1.2, p.h / fullHeight, p.d / .7);
    }
    if (!kit && p.part === 'stove' && !igaStove) part.scale.set(p.w / .85, p.h / .9, p.d / .7);
    if (p.part === 'alcove' && layout.profile !== 'iga') part.scale.set(p.w / 2.3, p.h / 2.5, p.d / .85);
    if (!kit && p.part === 'altar') part.scale.set(p.w / 2.1, p.h / 1.5, p.d / (layout.profile === 'moribe' && layout.kind === 'hondo' ? 1.3 : 1));
    place(g, part, p.x, p.z, p.rot || 0, p.y || 0);
    
  }
} else {
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
      // 主殿・館の文書棚は背が開いたままだと、包みが奥壁との隙間へ落ちる。
      // 個別の調度は不明なので、柱・棚板・背面の受け桟の内側に縦板を納める推定。
      // 外寸と当たりは保ち、木目・形・材質は既存の室内の束へまとめる。
      const backWidth = p.w - post * 2;
      const backBoards = Math.max(2, Math.ceil(backWidth / .24));
      const boardWidth = backWidth / backBoards;
      const shelfLevels = [.18, .6, p.h - shelf / 2];
      for (let level = 0; level < shelfLevels.length - 1; level++) {
        const bottom = shelfLevels[level] + shelf / 2;
        const top = shelfLevels[level + 1] - .0675;
        if (top <= bottom) continue;
        for (let j = 0; j < backBoards; j++)
          doorTimber(part, boardWidth - .002, top - bottom, .018,
            -backWidth / 2 + (j + .5) * boardWidth, (bottom + top) / 2,
            -p.d / 2 + .009, j % 2 ? 0x795b3b : 0x604831, true);
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

}
if (nodaJoinery) {
      if (!(nodaJoinery && layout.kind === 'hondo')) {
        box(part, .5, .04, .22, 0, .54, .38, 0x2a1810); box(part, .12, .1, .12, 0, .6, .38, 0x6a5a3a);
      }
      // 御影堂の壇上も室内と同じ油皿を使い、別形式の購入灯具を混ぜない。
      place(part, tomyo(nodaJoinery), -.75, 0, 0, .55); place(part, tomyo(nodaJoinery), .75, 0, 0, .55);
      if (templeAltar) {
        // 古い堂の内陣の推定：家庭用仏壇ではなく、須弥壇の本尊を覆う天蓋と幡。
        // 須弥壇と同じ範囲に収め、左右の通路を空ける。形・材質は箱の共通部品を使う。
        if (nodaJoinery && layout.kind === 'hondo') {
          // 御影堂の天蓋は平板を重ねず、外枠と格縁で六間の鏡板を受ける推定復元。
          // 木口は受け材の内面で止め、鏡板の下面を格縁より奥へ納める。
          // 外寸・吊り点は保ち、共有する箱と材質を内装の束へ生成時だけ加える。
          // 無地だった天蓋の木部にも室内と共通の木肌を通す。
          // 格縁は材の長手へ、鏡板は奥行きへ揃え、横木へ縦の木目を貼らない。
          // 形を回して同じ箱・材質を使い、開閉中や毎コマの処理は増やさない。
          const canopyTimber = (w, h, d, x, y, z, color) => {
            const alongX = w > d;
            const timber = box(part, alongX ? d : w, h, alongX ? w : d,
              x, y, z, color, 'floorWood');
            if (alongX) timber.rotation.y = Math.PI / 2;
          };
          for (const x of [-.745, .745]) canopyTimber(.06, .08, .72, x, 2.18, -.08, 0x3a2417);
          for (const z of [-.41, .25]) canopyTimber(1.43, .08, .06, 0, 2.18, z, 0x3a2417);
          canopyTimber(1.43, .08, .035, 0, 2.18, -.08, 0x3a2417);
          const span = 1.43 / 3;
          for (let i = 1; i < 3; i++) for (const z of [-.23875, .07875])
            canopyTimber(.035, .08, .2825, -.715 + span * i, 2.18, z, 0x3a2417);
          for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
            const left = -.715 + span * i + (i ? .0175 : 0);
            const right = -.715 + span * (i + 1) - (i < 2 ? .0175 : 0);
            const back = j ? -.0625 : -.38, front = j ? .22 : -.0975;
            box(part, right - left, .03, front - back,
              (left + right) / 2, 2.205, (back + front) / 2, 0x95815a, 'floorWood');
          }
          // 上框は外枠の上面へ載せ、二枚の板の面を重ねない。
          box(part, 1.7, .05, .82, 0, 2.245, -.08, 0x8a6c30);
        } else {
          box(part, 1.55, .08, .72, 0, 2.18, -.08, 0x3a2417);
          box(part, 1.7, .06, .82, 0, 2.24, -.08, 0x8a6c30);
        }
        if (nodaJoinery && layout.kind === 'hondo') {
          // 吊り金具を薄い鏡板だけへ突き付けず、格縁の下へ渡した吊り受け木で受ける推定復元。
          // 室内と同じ格縁の割り付けを使い、左右の吊り点を挟む格縁へ木口を合わせる。
          // 壇の縮尺と床仕上げの高さを戻し、受け木の下面で吊り材を止める。
          const support = nodaCanopySupport(layout, p, h);
          if (support) {
            const { sx, sy, sz, bottom, top, left, right } = support;
            for (const z of [-.34, .18]) {
              box(part, right - left, .06 / sy, .08 / sz,
                (left + right) / 2, top + .03 / sy, z, 0x3a2a1c);
              for (const x of [-.55, .55])
                box(part, .02, top - bottom, .02, x, (top + bottom) / 2, z, 0x6a5a3a);
            }
          }
        }
        for (const x of [-.68, .68]) {
          if (nodaJoinery && layout.kind === 'hondo') {
            // 御影堂の幡は厚い板と角棒で吊らず、紐・上端の受け・薄い布に分ける推定復元。
            // 元の幅十二センチ・下端の高さを保ち、像や灯明、内陣の通路へ張り出さない。
            // 布の折りと下の垂れは共通の箱で組み、静止した内装へ一度だけ束ねる。
            box(part, .008, .24, .008, x, 2.02, -.08, 0x8a6c30);
            box(part, .12, .025, .02, x, 1.8875, -.08, 0x8a6c30);
            for (let i = -1; i <= 1; i++) {
              const z = -.08 + (i === 0 ? .004 : -.004);
              box(part, .04, .41, .006, x + i * .04, 1.67, z, 0x95815a);
              box(part, .032, .105, .006, x + i * .04, 1.4125, z, 0x95815a);
            }
          } else {
            box(part, .035, .28, .035, x, 2.0, -.08, 0x8a6c30);
            box(part, .12, .54, .025, x, 1.63, -.08, 0x95815a);
          }
        }
      }

} else {
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
        hangingLamp ? hieiHangingLamp() : tomyo(false, layout.profile === 'hieizan'), side * (hangingLamp ? .9 : .75), 0, 0, .55);
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
    // 伊賀は硯と筆返しを含む上端まで指定高へ収める。天板だけで縮尺を
    // 決めると、上の調度が登録した当たりの高さから突き出してしまう。
    if (!kit && p.part === 'desk') part.scale.set(p.w / 1.2, p.h / (layout.profile === 'iga' ? .5 : hieiSobo ? .512 : .46), p.d / .7);
    if (!kit && p.part === 'stove') part.scale.set(p.w / .85, p.h / .9, p.d / .7);
    if (p.part === 'alcove' && layout.profile !== 'iga') part.scale.set(p.w / 2.3, inabaHigh ? 1 : p.h / 2.5, p.d / .85);
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
}

  return g;
}

export function furnishLayout(layout, h = 2.7, { partitions = true, dim = false } = {}) {
  if (layout.profile === 'shitaragahara' && S.quality === 'high') return villageFurnishLayout(layout, h, { partitions, dim });
  const nodaJoinery = S.quality === 'high' && layout.profile === 'nodafukushima';
  const inabaHigh = S.quality === 'high' && layout.profile === 'inabayama';
  const inaba = layout.profile === 'inabayama';
  const lowNageshi = inabaHigh && ['goten', 'tamari'].includes(layout.kind), nageshiH = lowNageshi ? .08 : .12;
  // 今の山岳戦と前の比叡山で調度を共有。出入り案内が使う型の名前は変えない。
  const hiei = layout.profile === 'hiei' || layout.profile === 'hieizan';
  const village = S.quality === 'high' && layout.profile === 'shitaragahara';
  const villageHome = village && layout.kind === 'minka';
  const hieiSobo = layout.profile === 'hieizan' && layout.kind === 'sobo';
  const hieiKuri = layout.profile === 'hieizan' && layout.kind === 'kuri';
  const hieiTatami = hieiSobo || hieiKuri, hieiTatamiFloor = hieiTatami;
  const templeAltar = hiei || layout.profile === 'echizen_ikko' || layout.profile === 'iwamura_hondo' || ['takato', 'nodafukushima'].includes(layout.profile) && layout.kind === 'hondo';
  const japanese = !!layout.profile && cgtOn() && cgtHas('naibu_tatami_floor_modular_a');
  const purchased = cgtOn() && cgtHas('Floor_Tatami') && !cgtHas('tatami_floor_modular_a');
  const key = JSON.stringify([layout, h, partitions, dim, purchased, japanese, cgtOn() && cgtHas('tatami_floor_modular_a'), nodaJoinery]);
  if (layoutDecor.has(key)) { const copy = layoutDecor.get(key).clone(); cacheUsers.push(new WeakRef(copy)); return copy; }
  const g = new THREE.Group(), kb = purchased || japanese ? new KitBatch() : null;
  // 野田福島の畳寄せ・上がり框にも床板と同じ木肌を使う。
  // 横材は形ごと回し、木目を短辺へ走らせない。寸法と材質の箱は使い回す。
  const floorTimber = (w, h, d, x, y, z, color, alongX = w > d) => {
    const m = box(g, alongX ? d : w, h, alongX ? w : d, x, y, z, color, 'floorWood');
    if (alongX) m.rotation.y = Math.PI / 2;
  };
  if (!nodaJoinery && layout.profile !== 'moribe') g.add(mainLayoutProps(layout, h, { partitions, dim }));
  else for (const p of layout.props) {
    const part = new THREE.Group();
    const moribeStorage = layout.profile === 'moribe' && layout.kind === 'yashiki' && p.part === 'storage';
    // 神宮寺の堂は家庭用の仏壇へ替えず、下の須弥壇・本尊・灯明を使う。
    const kit = p.part === 'stove' && !nodaJoinery && !hieiKuri ? bought('furnace_complete', p.w, p.h, p.d) : p.part === 'storage' && !nodaJoinery && !hieiTatami ? bought('drawer_a', p.w, p.h, p.d) : p.part === 'altar' && !templeAltar ? bought('butsudan', p.w, p.h, p.d) : null;
    if (kit) part.add(kit);
    else if (nodaJoinery && p.part === 'storage') {
      // 蓋付き木箱（chest）は下の専用の板蓋・補強桟・手掛けで組む。
      // 収納の代用箱だけをここで作り、専用の木組みを遮らない。
      // 砦の詰所・僧坊・寺務の板間・民家の収納は、引き出し箪笥でなく
      // 蓋付きの木箱とする推定復元。購入部品の有無で用途を変えない。
      // 蓋・脚・金具まで配置の寸法内へ収め、戸の引き代と通路を保つ。
      const w = p.w, h = p.h, d = p.d, foot = Math.min(.07, h * .12), lid = Math.min(.06, h * .1);
      box(part, w - .04, h - foot - lid - .01, d - .04,
        0, foot + (h - foot - lid - .01) / 2, 0, 0x665039);
      box(part, w, lid, d, 0, h - lid / 2, 0, 0x786044);
      for (const x of [-1, 1]) {
        box(part, .07, foot, d - .04, x * (w / 2 - .065), foot / 2, 0, 0x493624);
        // 蓋の補強帯は上面と前後へ回す。箱の外へ金具を突き出さない。
        box(part, .035, .008, d - .02, x * w * .3, h - .004, 0, 0x302b24);
        for (const side of [-1, 1]) box(part, .035, lid + .09, .012,
          x * w * .3, h - (lid + .09) / 2, side * (d / 2 - .008), 0x302b24);
        // 両側の持ち手は角張った環。共通の箱だけで組み、内装と一緒に束ねる。
        for (const z of [-.065, .065]) box(part, .012, .07, .014,
          x * (w / 2 - .009), h * .57, z, 0x302b24);
        box(part, .012, .014, .144, x * (w / 2 - .009), h * .57 - .035, 0, 0x302b24);
      }
      box(part, .065, .13, .012, 0, h - lid - .04, d / 2 - .008, 0x302b24);
    }
    else if (p.part === 'hallPost') {
      if (nodaJoinery && layout.kind === 'hondo') {
        // 御影堂の柱頭は横梁の下面（天井から二十七センチ下）で受ける。
        // 柱と受けを天井まで伸ばすと、梁を突き抜けて格縁にも重なる。
        // 木組みは推定。柱の上へ十二センチの受け材を載せ、梁へ木口を納める。
        // 室内図は不明。堂の独立柱は丸柱とし、用屋の角柱と分ける推定復元。
        // 足元は四角い根巻で畳寄せ・板床の切り欠きへ納める。
        const top = p.h - .27, cap = .12, shaft = top - cap;
        // 丸柱にも周囲の梁と同じ木肌を使う。円周へ横木目を巻かず、
        // 柱身は高さ方向へ通す。寸法ごとに一度だけ割り付け、四本で共有する。
        const shaftKey = `nodaHallShaft:${p.w}:${p.d}:${shaft}`;
        if (!shapes.has(shaftKey)) {
          const geometry = new THREE.CylinderGeometry(1, 1, 1, 12);
          const pos = geometry.attributes.position, normal = geometry.attributes.normal, uv = geometry.attributes.uv;
          const circumference = Math.PI * .375 * (p.w + p.d);
          for (let i = 0; i < uv.count; i++) {
            if (Math.abs(normal.getY(i)) < .5) {
              uv.setXY(i, uv.getX(i) * circumference / .3,
                ((pos.getY(i) + .5) * (shaft - .07) + .07) / 1.8);
            } else {
              uv.setXY(i, pos.getX(i) * p.w * .375 / .3, pos.getZ(i) * p.d * .375 / 1.8);
            }
          }
          shapes.set(shaftKey, geometry);
        }
        const column = new THREE.Mesh(shapes.get(shaftKey), mat(0x3a2a1c, 'doorWood'));
        column.scale.set(p.w * .375, shaft - .07, p.d * .375);
        column.position.y = (shaft + .07) / 2; part.add(column);
        box(part, p.w * .75, .07, p.d * .75, 0, .035, 0, 0x3a2a1c, 'doorWood');
        // 一枚の板状の柱頭を、丸柱の上の斗と横梁を受ける肘木に分ける推定復元。
        // 元の十二センチの高さ・柱頭幅に納め、格天井や長押へ張り出さない。
        box(part, p.w * .8, cap / 2, p.d * .8, 0, shaft + cap / 4, 0, 0x3a2a1c, 'doorWood');
        // 肘木の端を角材のままにせず、下端を斜めに落として斗から梁へ広がる形にする。
        // 細部は推定。元の外寸・上端を保ち、四本の柱で同じ形と木肌を使う。
        const hijikiKey = `nodaHallHijiki:${p.w}:${p.d}`;
        if (!shapes.has(hijikiKey)) {
          const outline = new THREE.Shape();
          outline.moveTo(-p.w / 2, cap / 2);
          outline.lineTo(p.w / 2, cap / 2);
          outline.lineTo(p.w / 2, cap * .375);
          outline.lineTo(p.w / 4, 0);
          outline.lineTo(-p.w / 4, 0);
          outline.lineTo(-p.w / 2, cap * .375); outline.closePath();
          const geometry = new THREE.ExtrudeGeometry(outline,
            { depth: p.d * .65, bevelEnabled: false, steps: 1 });
          geometry.translate(0, 0, -p.d * .325);
          const pos = geometry.attributes.position, uv = geometry.attributes.uv;
          for (let i = 0; i < uv.count; i++)
            uv.setXY(i, pos.getY(i) / .3, pos.getX(i) / 1.8);
          shapes.set(hijikiKey, geometry);
        }
        const hijiki = new THREE.Mesh(shapes.get(hijikiKey), mat(0x3a2a1c, 'doorWoodCross'));
        hijiki.position.y = shaft + cap / 2; part.add(hijiki);
        cacheUsers.push(new WeakRef(hijiki));
        // 柱頭から梁へ差すほぞと、それを留める込栓の推定復元。
        // ほぞは naka.js の横梁（下面は top）へ収め、格天井へ突き抜けさせない。
        // 込栓の木口だけを梁の両側へ見せ、柱の既存の幅と通路は保つ。
        box(part, p.w * .3, .16, .1, 0, top + .08, 0, 0x3a2a1c, 'doorWood');
        for (const side of [-1, 1]) box(part, .035, .035, .014,
          0, top + .08, side * .107, 0x795b3b);
      } else {
        // 外陣の柱。共通の箱と材質で束ね、柱頭の受けも当たりの幅内へ納める。
        box(part, p.w * .75, p.h, p.d * .75, 0, p.h / 2, 0, 0x3a2a1c);
        box(part, p.w, .12, p.d, 0, p.h - .06, 0, 0x3a2a1c);
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
          // 下軸は角棒にせず、表装を巻く丸い軸と左右の軸先に分ける推定。
          // 紙の下端を軸の上面へつなぎ、全幅は従来の六十一センチへ収める。
          // 主殿・山麓館で同じ円柱と材質を使い、設営時の室内の束へ結合する。
          const rollerKey = '稲葉山の掛物の下軸';
          if (!shapes.has(rollerKey)) shapes.set(rollerKey, new THREE.CylinderGeometry(1, 1, 1, 12));
          const roller = (x, length, radius) => {
            const m = new THREE.Mesh(shapes.get(rollerKey), mat(0x493522));
            m.scale.set(radius, length, radius); m.rotation.z = Math.PI / 2;
            m.position.set(x, scrollBottom - .0125, -.35);
            cacheUsers.push(new WeakRef(m)); part.add(m);
          };
          roller(0, .55, .0125);
          for (const side of [-1, 1]) roller(side * .29, .03, .017);
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
    } else if (nodaJoinery && p.part === 'writingDesk') {
      // 硯・筆・書写の紙を載せた低い文机。道具の上端まで家具の当たりの寸法に納める。
      // 共通の箱と材質を使い、近づいた時の生成と結合だけで描く。
      const top = p.h - .035;
      // 詰所・寺務・僧坊の文机は、無地の塊でなく横木目の三枚の板を接ぐ推定復元。
      // 元の厚みと上面を保ち、細い目地の下は受け桟で支える。床板の絵と材質を共用する。
      for (let i = 0; i < 3; i++) {
        const back = -p.d / 2 + p.d * i / 3 + (i ? .0005 : 0);
        const front = -p.d / 2 + p.d * (i + 1) / 3 - (i < 2 ? .0005 : 0);
        const plank = box(part, front - back, .045, p.w, 0,
          top - .0225, (back + front) / 2, 0x795b3b, 'floorWood');
        plank.rotation.y = Math.PI / 2;
      }
      const lx = p.w * .36, lz = p.d * .33, legH = top - .045;
      for (const x of [-lx, lx]) for (const z of [-lz, lz])
        box(part, .045, legH, .045, x, legH / 2, z, 0x503923, 'doorWood');
      for (const x of [-lx, lx])
        box(part, .045, .025, p.d - .04, x, legH - .0125, 0, 0x503923, 'floorWood');
      // 四脚を左右の貫と奥の貫でつなぐ推定復元。座る側は膝を入れるため空ける。
      // 木口は脚の内面へ納め、机の外寸・通路・当たりを保つ。既存の木材の束へ結合する。
      const railY = legH * .35;
      for (const x of [-lx, lx])
        box(part, .025, .035, lz * 2 - .045, x, railY, 0, 0x503923, 'floorWood');
      box(part, lx * 2 - .045, .035, .025, 0, railY, -lz, 0x503923, 'doorWoodCross');
      // 紙に読めない文字を描かず、紙の重なり・硯の海・筆の穂で用途を示す。
      box(part, p.w * .4, .008, p.d * .52, -p.w * .16, top + .004, 0, 0xcfc3a2);
      box(part, p.w * .38, .004, p.d * .5, -p.w * .17, top + .01, -.008, 0xe0d4b7);
      // 硯の海は黒い板を貼らず、底と周囲の石で実際に窪ませる。
      // 墨を磨る陸と海を分け、墨も陸へ載せる推定復元。
      // 文机の外寸・道具を含む高さ内で、既存の箱と材質を共用する。
      const inkX = p.w * .26, inkW = p.w * .15, inkD = p.d * .34;
      const seaW = p.w * .09, seaD = p.d * .13, seaZ = -p.d * .06;
      box(part, inkW, .004, inkD, inkX, top + .002, 0, 0x35332e);
      for (const side of [-1, 1]) box(part, (inkW - seaW) / 2, .02, inkD,
        inkX + side * (inkW + seaW) / 4, top + .014, 0, 0x35332e);
      const seaBack = seaZ - seaD / 2, seaFront = seaZ + seaD / 2;
      for (const [a, b] of [[-inkD / 2, seaBack], [seaFront, inkD / 2]])
        box(part, seaW, .02, b - a, inkX, top + .014, (a + b) / 2, 0x35332e);
      box(part, seaW, .001, seaD, inkX, top + .0045, seaZ, 0x171916);
      box(part, p.w * .035, .01, p.d * .09, inkX, top + .029, p.d * .085, 0x171916);
      // 硯へ水を足す小皿も備える推定復元。紙・墨・筆だけの机にしない。
      // 器棚の椀の内壁・底を共用し、硯の奥へ小さく納める。
      // 皿の上端は道具込みの高さ内。家具の外寸や戸の引き代は変えない。
      const waterDish = new THREE.Mesh(kitchenBowlShape(), mat(0x38251c));
      waterDish.scale.set(.5, .35, .5);
      waterDish.position.set(inkX, top, -p.d * .34);
      part.add(waterDish); cacheUsers.push(new WeakRef(waterDish));
      // 筆の軸は天板から浮かせず、小さな木の筆置きで受ける。
      // 受けの上面を軸の下面へ合わせ、紙・硯と同じ机の高さ内へ収める。
      // 野田福島の文机だけに共通の箱と木の材質を足し、生成時に机へ束ねる。
      box(part, .045, .014, .035, -p.w * .1, top + .007, p.d * .33, 0x503923);
      box(part, p.w * .29, .012, .012, -p.w * .1, top + .02, p.d * .33, 0x806044);
      box(part, p.w * .065, .014, .018, p.w * .0775, top + .02, p.d * .33, 0x292723);
    } else if (nodaJoinery && p.part === 'documentShelf') {
      // 僧坊の経巻と寺務の文書を置く低い棚の推定復元。引き戸の引き代へ張り出さない。
      for (const x of [-1, 1]) box(part, .045, p.h, p.d,
        x * (p.w / 2 - .0225), p.h / 2, 0, 0x59412b, 'doorWood');
      // 経巻棚の背を幅広の無垢板一枚にせず、縦板を接いで納める推定復元。
      // 裏の薄板で目地を受け、板間から外へ光が抜けないようにする。
      // 元の背板の厚み三十五ミリへ収め、棚前の立ち所と障子の引き代は保つ。
      const backW = p.w - .09, backZ = -p.d / 2;
      box(part, backW, p.h, .012, 0, p.h / 2, backZ + .006, 0x59412b, 'doorWood');
      const backN = Math.max(2, Math.ceil(backW / .22)), boardW = backW / backN;
      for (let i = 0; i < backN; i++) {
        const left = -backW / 2 + boardW * i + (i ? .001 : 0);
        const right = -backW / 2 + boardW * (i + 1) - (i + 1 < backN ? .001 : 0);
        box(part, right - left, p.h, .023, (left + right) / 2,
          p.h / 2, backZ + .0235, 0x795b3b, 'doorWood');
      }
      // 棚板は側板と背板の内面で止める。板を突き通すと外側の面が重なり、
      // 棚の側面・背面がちらつくため、既存の外寸の内側で木口を納める。
      for (const y of [.035, p.h * .48, p.h - .025]) {
        // 棚板も奥行きを三枚に割り、木目を左右の受け桟へ渡す。
        // 目地は二ミリ。箱と木肌は共用し、室内の生成時だけ棚ごと束ねる。
        const depth = p.d - .035;
        for (let i = 0; i < 3; i++) {
          const back = -p.d / 2 + .035 + depth * i / 3 + (i ? .001 : 0);
          const front = -p.d / 2 + .035 + depth * (i + 1) / 3 - (i < 2 ? .001 : 0);
          const board = box(part, front - back, .035, backW,
            0, y, (back + front) / 2, 0x795b3b, 'floorWood');
          board.rotation.y = Math.PI / 2;
        }
        // 棚板を側板へ突き付けるだけにせず、下面を左右の受け桟で支える推定復元。
        // 最下段は床との隙間に収め、上の段と同じ桟を床へ突き抜かせない。
        // 経巻・文書と正面の取り出し口を保ち、棚の外寸内で既存の箱へ束ねる。
        const railH = Math.min(.035, y - .0175);
        for (const side of [-1, 1])
          box(part, .025, railH, p.d - .035,
            side * (p.w / 2 - .045 - .0125), y - .0175 - railH / 2, .0175, 0x59412b);
      }
      if (!shapes.has('nodaDocumentRoll')) {
        const roll = new THREE.CylinderGeometry(1, 1, 1, 8);
        roll.rotateX(Math.PI / 2); shapes.set('nodaDocumentRoll', roll);
        // 結び紐は巻物へ角材を差さず、紙の外周へ回す。端面の巻き重ねも共通形で表す。
        const band = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true);
        band.rotateX(Math.PI / 2); shapes.set('nodaDocumentBand', band);
        shapes.set('nodaDocumentEdge', new THREE.RingGeometry(.91, 1, 12));
      }
      for (const y of [.0525, p.h * .48 + .0175]) for (const x of [-p.w * .25, 0, p.w * .25]) {
        const radius = Math.min(.045, p.h * .1), length = p.d * .68;
        const roll = new THREE.Mesh(shapes.get('nodaDocumentRoll'), mat(0xcfc3a2));
        roll.scale.set(radius, radius, length); roll.position.set(x, y + radius, 0); part.add(roll);
        const band = new THREE.Mesh(shapes.get('nodaDocumentBand'), mat(0x6a5038));
        band.scale.set(radius + .001, radius + .001, .012);
        band.position.set(x, y + radius, 0); part.add(band);
        // 表裏の木口に紙の巻き重ねを見せ、棚の脇からも紙束と分かるようにする推定復元。
        // 六巻とも形と材質を共有し、内装の生成時に棚と一緒に束ねる。
        for (const side of [-1, 1]) for (const size of [.45, .7, .95]) {
          const edge = new THREE.Mesh(shapes.get('nodaDocumentEdge'), mat(0x958669));
          edge.scale.setScalar(radius * size); edge.rotation.y = side < 0 ? Math.PI : 0;
          edge.position.set(x, y + radius, side * (length / 2 + .0005)); part.add(edge);
        }
        box(part, .012, .006, .018, x, y + radius * 2 + .003, 0, 0x6a5038);
      }
    } else if (p.part === 'kitchenShelf') {
      // 庫裏の推定の器棚。脚・棚板・背の貫を荷の当たりの内側へ収める。
      // 器は口と内側もある共通の形。室内生成時に棚ごと束ね、毎コマ組み直さない。
      for (const x of [-.38, .38]) for (const z of [-.30, .30])
        box(part, .07, .8, .07, x, .4, z, 0x59412b);
      for (const yy of [.08, .38, .74]) {
        if (nodaJoinery) {
          // 野田福島の器棚は棚板を脚へ突き通さず、左右の受け桟で支える推定復元。
          // 受け桟の木口は前後の脚の内面で止め、板の下面へ接する。
          // 棚の外寸・器の位置は保ち、共通の箱と材質で室内の束へまとめる。
          for (const x of [-.38, .38])
            box(part, .06, .06, .53, x, yy - .05, 0, 0x59412b);
          // 一枚の平板から三枚の棚板へ。脚に当たる四隅だけを欠き、
          // 棚板と柱の同じ面を重ねず、木口と細い板継ぎを見せる。
          const step = .7 / 3;
          for (let i = 0; i < 3; i++) {
            const back = -.35 + i * step + (i ? .0015 : 0);
            const front = -.35 + (i + 1) * step - (i < 2 ? .0015 : 0);
            box(part, .69, .04, front - back, 0, yy, (back + front) / 2, 0x795b3b);
            for (const side of [-1, 1]) {
              // 脚の外側には一センチの板の出を残す。
              box(part, .01, .04, front - back, side * .42, yy, (back + front) / 2, 0x795b3b);
              const lo = Math.max(back, -.265), hi = Math.min(front, .265);
              if (hi > lo) box(part, .07, .04, hi - lo, side * .38, yy, (lo + hi) / 2, 0x795b3b);
              for (const [a, b] of [[back, Math.min(front, -.335)], [Math.max(back, .335), front]])
                if (b > a) box(part, .07, .04, b - a, side * .38, yy, (a + b) / 2, 0x795b3b);
            }
          }
        } else box(part, .85, .04, .7, 0, yy, 0, 0x795b3b);
        // 背の貫も脚の内面へ納める。器を取る正面は空ける。
        // 最上段は脚の上端で止め、指定した棚の高さを越えない。
        const railH = nodaJoinery ? Math.min(.06, .8 - yy - .02) : .06;
        box(part, nodaJoinery ? .69 : .76, railH, .04, 0, yy + .02 + railH / 2, -.30, 0x59412b);
      }
      if (nodaJoinery) {
        // 庫裏と器置きの棚は、背の筋交いで左右の脚をつなぐ推定復元。
        // 背の貫の外側へ薄い材を添え、器を取る正面と棚の外寸を保つ。
        // 形・材質は既存の箱を共有し、室内と一緒に一度だけ結合する。
        const brace = box(part, Math.hypot(.76, .56), .045, .012,
          0, .44, -.34, 0x59412b);
        brace.rotation.z = Math.atan2(.56, .76);
        // 留める木栓の木口を脚の背面にだけ見せる。
        for (const side of [-1, 1]) box(part, .018, .018, .004,
          side * .38, .44 + side * .28, -.348, 0x38251c);
      }
      for (const yy of [.1, .4]) for (const x of [-.20, .20]) for (let i = 0; i < 3; i++) {
        const bowl = new THREE.Mesh(kitchenBowlShape(), mat(0x38251c));
        bowl.position.set(x, yy + i * .025, 0); part.add(bowl);
      }
      part.scale.set(p.w / .85, p.h / .8, p.d / .7);
    } else if (nodaJoinery && p.part === 'mealTray') {
      // 庫裏の食事用の低い膳。脚・天板・縁・椀・箸を指定寸法へ納める。
      // 棚の椀と共通の形・材質を使い、室内生成時に一束へ結合する。
      const top = p.h - .1;
      for (const x of [-p.w * .36, p.w * .36]) for (const z of [-p.d * .32, p.d * .32])
        box(part, .04, top - .03, .04, x, (top - .03) / 2, z, 0x38251c);
      box(part, p.w, .03, p.d, 0, top - .015, 0, 0x59412b);
      for (const x of [-1, 1]) box(part, .02, .02, p.d,
        x * (p.w / 2 - .01), top + .01, 0, 0x38251c);
      for (const z of [-1, 1]) box(part, p.w - .04, .02, .02,
        0, top + .01, z * (p.d / 2 - .01), 0x38251c);
      for (const x of [-p.w * .21, p.w * .21]) {
        const bowl = new THREE.Mesh(kitchenBowlShape(), mat(0x38251c));
        bowl.position.set(x, top, -.04); part.add(bowl); cacheUsers.push(new WeakRef(bowl));
      }
      for (const z of [p.d * .28, p.d * .32])
        box(part, p.w * .55, .008, .008, 0, top + .004, z, 0xb29b72);
    } else if (p.part === 'kitchenBench') {
      // 庫裏の推定の調理台。天板・脚・貫に、俎板と木の杓子を載せる。
      // 共通の箱と材質だけで組み、室内の束へ結合する。道具まで当たりの寸法内に収める。
      const legH = nodaJoinery ? .565 : .58;
      for (const x of [-.53, .53]) for (const z of [-.22, .22])
        box(part, .08, legH, .08, x, legH / 2, z, 0x59412b);
      for (const z of [-.22, .22]) box(part, nodaJoinery ? .98 : 1.14, .07, .06, 0, .18, z, 0x59412b);
      for (const x of [-.53, .53]) box(part, .06, .07, nodaJoinery ? .36 : .5, x, .18, 0, 0x59412b);
      if (nodaJoinery) {
        // 野田福島の調理台は脚の内面で貫を止め、上にも受け桟を渡す推定復元。
        // 天板下面は五十六・五センチ。桟はそこへ接し、脚と板へ突き抜けない。
        for (const z of [-.22, .22]) box(part, .98, .07, .06, 0, .53, z, 0x59412b);
        for (const x of [-.53, .53]) box(part, .06, .07, .36, x, .53, 0, 0x59412b);
        // 黒い線を貼った一枚板でなく、厚みのある三枚の板を接ぐ。
        // 下三センチは継ぎ目の裏まで通し、調理台を透ける隙間にしない。
        box(part, 1.3, .03, .65, 0, .58, 0, 0x795b3b);
        const boardD = .65 / 3;
        for (let i = 0; i < 3; i++) {
          const back = -.325 + i * boardD + (i ? .0015 : 0);
          const front = -.325 + (i + 1) * boardD - (i < 2 ? .0015 : 0);
          box(part, 1.3, .04, front - back, 0, .615, (back + front) / 2, 0x795b3b);
        }
      } else {
        box(part, 1.3, .07, .65, 0, .6, 0, 0x795b3b);
        for (const z of [-.108, .108]) box(part, 1.26, .004, .008, 0, .637, z, 0x59412b);
      }
      // 俎板と杓子は互いに重ねずに置く。
      box(part, .65, .05, .4, -.22, .66, 0, 0xb29b72);
      box(part, .07, .025, .3, .43, .65, -.07, 0xa38a61);
      box(part, .16, .035, .12, .43, .655, .13, 0xa38a61);
      part.scale.set(p.w / 1.3, p.h / .7, p.d / .65);
    } else if (p.part === 'waterJar') {
      // 庫裏の水甕。厚みのある口と内壁・底まで一つの回転体で作り、
      // 水面は口より下へ納める。形と材質を保存し、室内の束へ結合する。
      if (!shapes.has('nodaWaterJar')) {
        const profile = [[0, 0], [.23, 0], [.33, .12], [.36, .42], [.31, .68], [.29, .7],
          [.265, .7], [.285, .66], [.33, .42], [.30, .14], [.21, .05], [0, .05]];
        shapes.set('nodaWaterJar', new THREE.LatheGeometry(profile.map(([x, y]) => new THREE.Vector2(x, y)), 12));
        const water = new THREE.CircleGeometry(.31, 12);
        water.rotateX(-Math.PI / 2); shapes.set('nodaJarWater', water);
      }
      part.add(new THREE.Mesh(shapes.get('nodaWaterJar'), mat(0x65503c)));
      const water = new THREE.Mesh(shapes.get('nodaJarWater'), mat(0x36423e));
      water.position.y = .48; part.add(water);
      if (nodaJoinery) {
        // 水を汲む木の柄杓を甕の口に渡す推定復元。柄と汲み椀を
        // 既存の幅・高さへ収め、土間の通り道と荷の当たりは広げない。
        // 椀は底と内壁のある回転体を共用し、水甕と一緒に束ねる。
        if (!shapes.has('nodaWaterLadle')) {
          const profile = [[0, 0], [.065, 0], [.08, .015], [.085, .085],
            [.073, .085], [.068, .02], [0, .02]];
          shapes.set('nodaWaterLadle', new THREE.LatheGeometry(
            profile.map(([x, y]) => new THREE.Vector2(x, y)), 8));
        }
        const ladle = new THREE.Mesh(shapes.get('nodaWaterLadle'), mat(0x9b8057));
        ladle.position.set(.14, .57, 0); part.add(ladle);
        box(part, .43, .025, .035, -.1, .665, 0, 0x9b8057);
      }
      part.scale.set(p.w / .72, p.h / .7, p.d / .72);
    } else if (nodaJoinery && p.part === 'washingTub') {
      // 庫裏の米研ぎ桶。底と内壁のある木桶を低い台に載せる推定復元。
      // 水面は口より下。形と材質は保存し、近づいた時だけ室内の束へ結合する。
      if (!shapes.has('nodaWashingTub')) {
        const profile = [[0, .08], [.27, .08], [.34, .5], [.31, .5], [.245, .12], [0, .12]];
        shapes.set('nodaWashingTub', new THREE.LatheGeometry(
          profile.map(([x, y]) => new THREE.Vector2(x, y)), 12));
        const hoop = new THREE.TorusGeometry(1, .018, 4, 12);
        hoop.rotateX(Math.PI / 2); shapes.set('nodaTubHoop', hoop);
        const water = new THREE.CircleGeometry(.28, 12);
        water.rotateX(-Math.PI / 2); shapes.set('nodaTubWater', water);
      }
      box(part, .72, .08, .72, 0, .04, 0, 0x493624);
      part.add(new THREE.Mesh(shapes.get('nodaWashingTub'), mat(0x9b8057)));
      // 木桶の側板は一枚の滑らかな器にせず、十二枚の板の継ぎ目を見せる。
      // 回転体の十二面と同じ向きへ細い目地を沿わせ、底から口へ広がる勾配も揃える。
      // 元の外寸内で組み、箍・水面・当たりは共用する。生成時だけ内装の束へ結合する。
      const staveTilt = Math.atan2(.07, .42), staveH = Math.hypot(.42, .07);
      for (let i = 0; i < 12; i++) {
        const angle = i * Math.PI / 6;
        const seam = box(part, .004, staveH, .002,
          Math.sin(angle) * .3045, .29, Math.cos(angle) * .3045, 0x695735);
        seam.rotation.set(staveTilt, angle, 0, 'YXZ');
      }
      for (const y of [.19, .43]) {
        const radius = .27 + (y - .08) * .07 / .42;
        const hoop = new THREE.Mesh(shapes.get('nodaTubHoop'), mat(0x695735));
        hoop.scale.setScalar(radius); hoop.position.y = y; part.add(hoop);
      }
      const water = new THREE.Mesh(shapes.get('nodaTubWater'), mat(0x687165));
      water.position.y = .35; part.add(water);
      part.scale.set(p.w / .72, p.h / .55, p.d / .72);
    } else if (p.part === 'firewood') {
      // 薪を土間へ直置きせず、低い桟積みの台へ載せる推定復元。
      // 割った木口と樹皮側を共通の箱で表し、荷の寸法と当たりを揃える。
      for (const x of [-.3, .3]) box(part, .1, .1, .65, x, .05, 0, 0x493624);
      for (const z of [-.24, .24]) box(part, .85, .06, .08, 0, .13, z, 0x59412b);
      for (let row = 0; row < 3; row++) for (let col = 0; col < 4 - row % 2; col++) {
        const x = (col - (3 - row % 2) / 2) * .18, y = .215 + row * .11;
        box(part, .145, .1, .54, x, y, 0, 0x59412b);
        for (const side of [-1, 1]) box(part, .12, .075, .008, x, y, side * .27, 0xa38a61);
      }
      part.scale.set(p.w / .85, p.h / .5, p.d / .65);
    } else if (p.part === 'riceBales') {
      // 荷の当たりの内側へ三俵。胴と縄は全ての蔵で共用し、室内の束へ結合する。
      if (!shapes.has('riceBale')) {
        const bale = new THREE.CylinderGeometry(.18, .18, .72, 10);
        bale.rotateZ(Math.PI / 2);
        const pos = bale.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          const bulge = 1 - .22 * (pos.getX(i) / .36) ** 2;
          pos.setY(i, pos.getY(i) * bulge); pos.setZ(i, pos.getZ(i) * bulge);
        }
        bale.computeVertexNormals();
        shapes.set('riceBale', bale);
        const rope = new THREE.TorusGeometry(.176, .012, 4, 10);
        rope.rotateY(Math.PI / 2); shapes.set('riceBaleRope', rope);
      }
      if (nodaJoinery && !shapes.has('nodaRiceBale')) {
        // 一段だけの円筒は両端しか頂点がなく、胴まで細くなって縄が浮く。
        // 四段で中央の膨らみを作り、縄の内面へ胴を寄せる。全ての蔵で形を共有する。
        const bale = new THREE.CylinderGeometry(.18, .18, .72, 10, 4);
        bale.rotateZ(Math.PI / 2);
        const pos = bale.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          const bulge = 1 - .22 * (pos.getX(i) / .36) ** 2;
          pos.setY(i, pos.getY(i) * bulge); pos.setZ(i, pos.getZ(i) * bulge);
        }
        bale.computeVertexNormals(); shapes.set('nodaRiceBale', bale);
      }
      // 野田福島の兵糧は一枚の薄板へ直置きせず、通風する桟積みの荷台で床から離す推定復元。
      // 元の荷の幅・奥行き・高さへ収め、中央の運び道と板戸の引き代を保つ。
      if (nodaJoinery) {
        for (const x of [-.27, .27]) box(part, .12, .12, .68, x, .06, 0, 0x503923);
        for (let j = 0; j < 5; j++) box(part, .78, .06, .12, 0, .15, (j - 2) * .135, 0x795b3b);
      } else box(part, .78, .08, .68, 0, .04, 0, 0x503923);
      for (const [yy, zz] of [[.26, -.17], [.26, .17], [.57, 0]]) {
        const baleY = yy + (nodaJoinery ? .1 : 0);
        const bale = new THREE.Mesh(shapes.get(nodaJoinery ? 'nodaRiceBale' : 'riceBale'), mat(0xb69b65));
        bale.position.set(0, baleY, zz); part.add(bale);
        for (const xx of [-.22, .22]) {
          const rope = new THREE.Mesh(shapes.get('riceBaleRope'), mat(0x695735));
          rope.position.set(xx, baleY, zz); part.add(rope);
        }
      }
      part.scale.set(p.w / .8, p.h / (nodaJoinery ? .85 : .75), p.d / .7);
    } else if (p.part === 'spearRack') {
      // 番の控えの短い槍掛け。槍も台も配置の寸法へ収め、通路へ穂先を出さない。
      if (nodaJoinery && !shapes.has('nodaRackShaft')) {
        // 角材の柄と四角い金属片ではなく、丸柄と鎬のある穂先にする。
        // 番所・詰所で共用し、内装の生成時に既存の束へ結合する。
        shapes.set('nodaRackShaft', new THREE.CylinderGeometry(.0175, .0175, 2.1, 6));
        const blade = new THREE.BufferGeometry();
        const ring = [[-.0225, .045, 0], [0, .045, .009], [.0225, .045, 0], [0, .045, -.009]];
        const vertices = [];
        for (let i = 0; i < 4; i++) {
          const a = ring[i], b = ring[(i + 1) % 4];
          vertices.push(0, .18, 0, ...a, ...b, 0, 0, 0, ...b, ...a);
        }
        blade.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        blade.computeVertexNormals(); shapes.set('nodaRackBlade', blade);
      }
      for (const x of [-.32, .32]) {
        box(part, .09, 1.35, .09, x, .675, 0, 0x503923);
        box(part, .14, .08, .62, x, .04, 0, 0x503923);
      }
      for (const yy of [.22, 1.2]) box(part, .78, .08, .1, 0, yy, .09, 0x3a2a1c);
      if (nodaJoinery) {
        // 立てた槍の石突を床から浮かせず、左右の脚へ掛けた下台で受ける推定復元。
        // 柄の下端は五センチ。台の上面を同じ高さへ合わせ、前後の縁で外れを防ぐ。
        // 元の足と家具の外寸内へ納め、共通の箱・材質で内装と一緒に束ねる。
        box(part, .55, .03, .14, 0, .035, .16, 0x503923);
        for (const z of [.10, .22]) box(part, .55, .03, .02, 0, .065, z, 0x503923);
      }
      for (const x of [-.24, 0, .24]) {
        if (nodaJoinery) {
          // 横木の前へ柄を浮かせるだけにせず、切り欠いた木の受けへ納める。
          // 左右の小片の間を柄より広く取り、槍身へ木を突き通さない。
          for (const side of [-1, 1]) box(part, .025, .045, .08,
            x + side * .035, 1.2, .18, 0x3a2a1c);
          const shaft = new THREE.Mesh(shapes.get('nodaRackShaft'), mat(0x665034));
          shaft.position.set(x, 1.1, .16); part.add(shaft);
        } else box(part, .035, 2.1, .035, x, 1.1, .16, 0x665034);
        box(part, .055, .1, .055, x, 2.13, .16, 0x252321);
        if (nodaJoinery) {
          const tip = new THREE.Mesh(shapes.get('nodaRackBlade'), mat(0x9b9d99));
          tip.position.set(x, 2.18, .16); part.add(tip);
        } else {
          const tip = box(part, .045, .18, .018, x, 2.27, .16, 0x9b9d99);
          tip.rotation.z = .12;
        }
      }
      part.scale.set(p.w / .8, p.h / 2.36, p.d / .7);
    } else if (p.part === 'chest') {
      const w = p.w ?? .85, h = p.h ?? .7, d = p.d ?? .7;
      if (nodaJoinery) {
        // 寺務長屋の道具箱は引き出し家具に替えず、被せ蓋の木箱として推定復元。
        // 蓋・桟・手掛けまで元の当たりの内側へ納め、板戸の引き代を保つ。
        const lid = h * .12;
        // 胴も無垢の塊でなく底板と四周の側板で組む推定復元。
        // 前後の板を通し、妻板はその内面で止めて四隅を重ねない。
        // 三ミリの目地は板厚の半分までとし、箱の中へ隙間を貫通させない。
        // 長屋・寺務の箱も塗り潰した板にせず、側板は横、補強桟は縦へ木目を通す。
        // 蓋と底は奥行きへ通し、建具・床と同じ木肌を生成時の束で共用する。
        const bodyW = w - .04, bodyD = d - .04, bodyH = h - lid;
        const board = Math.min(.025, bodyW / 6, bodyD / 6, bodyH / 6);
        box(part, bodyW - board * 2, board, bodyD - board * 2,
          0, board / 2, 0, 0x503923, 'floorWood');
        const rows = Math.max(2, Math.ceil((bodyH - board) / .18));
        const rowH = (bodyH - board) / rows;
        for (const side of [-1, 1]) {
          box(part, bodyW, bodyH, board / 2, 0, bodyH / 2,
            side * (bodyD / 2 - board * .75), 0x503923, 'doorWoodCross');
          box(part, board / 2, bodyH, bodyD - board * 2,
            side * (bodyW / 2 - board * .75), bodyH / 2, 0, 0x503923, 'doorWoodCross');
          for (let i = 0; i < rows; i++) {
            const bottom = board + i * rowH + (i ? .0015 : 0);
            const top = board + (i + 1) * rowH - (i + 1 < rows ? .0015 : 0);
            box(part, bodyW, top - bottom, board / 2, 0, (bottom + top) / 2,
              side * (bodyD / 2 - board / 4), 0x795b3b, 'doorWoodCross');
            box(part, board / 2, top - bottom, bodyD - board * 2,
              side * (bodyW / 2 - board / 4), (bottom + top) / 2, 0, 0x795b3b, 'doorWoodCross');
          }
        }
        // 蓋は短い板を接ぎ、上の補強桟で押さえる。桟を蓋の中へ埋めず、
        // 桟の厚みを板から引いて箱の高さを保つ。生成時だけ共通の箱へ束ねる。
        const cleat = Math.min(.012, lid / 3), count = Math.max(2, Math.ceil(w / .3));
        const boardW = w / count;
        for (let i = 0; i < count; i++) {
          const left = -w / 2 + i * boardW + (i ? .0015 : 0);
          const right = -w / 2 + (i + 1) * boardW - (i + 1 < count ? .0015 : 0);
          box(part, right - left, lid - cleat, d, (left + right) / 2,
            h - (lid + cleat) / 2, 0, 0x795b3b, 'floorWood');
        }
        for (const x of [-w * .3, w * .3]) {
          box(part, .04, cleat, d - .02, x, h - cleat / 2, 0, 0x493624, 'floorWood');
          for (const side of [-1, 1]) box(part, .04, h - lid, .015,
            x, (h - lid) / 2, side * (d / 2 - .0125), 0x493624, 'doorWood');
        }
        for (const side of [-1, 1]) box(part, .015, .035, d * .26,
          side * (w / 2 - .0125), h * .55, 0, 0x30251e, 'doorWoodCross');
      } else {
        if (japanese && addNaibu(kb, 'drawer_a', p.x, p.y || 0, p.z, w, h, d, p.rot || 0)) continue;
        box(part, w, h, d, 0, h / 2, 0, 0x503923);
        for (const yy of [.23, .48]) box(part, w - .06, .02, .03, 0, yy, d / 2, 0x252321);
      }
    } else if (p.part === 'hearth') {
      if (nodaJoinery) {
        // 板間の炉は黒い箱で覆わず、低い炉縁の内に灰床・炭・五徳を組む推定復元。
        // 炉縁は無地の角材を突き付けず、四隅を相欠きで組む推定の納まり。
        // 奥行きの材の下半分へ横材の上半分を掛け、同じ面を重ねない。
        // 木目は各材の長手へ通す。六棟とも共通の形・材質で既存の束へまとめる。
        // 炉の内寸・高さを保ち、灰床・五徳・床板の切り欠きは動かさない。
        for (const x of [-.36, .36]) {
          hieiRitualTimber(part, .08, .03, .7, x, .015, 0, 0x493022);
          hieiRitualTimber(part, .08, .03, .54, x, .045, 0, 0x493022);
        }
        for (const z of [-.31, .31]) {
          hieiRitualTimber(part, .64, .03, .08, 0, .015, z, 0x493022);
          hieiRitualTimber(part, .8, .03, .08, 0, .045, z, 0x493022);
          // 継ぎ目の込栓は炉縁の上面だけに出し、炉内や歩く板間へ張り出さない。
          for (const x of [-.36, .36])
            hieiRitualTimber(part, .012, .002, .012, x, .06, z, 0x795b3b);
        }
        box(part, .64, .012, .54, 0, .006, 0, 0x8a8070);
        for (const z of [-.14, .14]) {
          box(part, .36, .045, .055, 0, .035, z, 0x30251e);
          box(part, .12, .012, .035, .06, .063, z, 0x8a4226);
        }
        // 五徳は脚だけで釜底へ突き付けず、三足で鉄の輪を受ける推定復元。
        // 輪の上端を釜底の高さへ揃え、灰床・炭・炉縁と元の外寸を保つ。
        // 六棟の民家で同じ輪と材質を共用し、室内生成時だけ束ねる。
        if (!shapes.has('nodaHearthTrivet')) {
          const ring = new THREE.TorusGeometry(.13, .012, 6, 18);
          ring.rotateX(Math.PI / 2); shapes.set('nodaHearthTrivet', ring);
        }
        const trivet = new THREE.Mesh(shapes.get('nodaHearthTrivet'), mat(0x292723));
        trivet.position.y = .158; part.add(trivet); cacheUsers.push(new WeakRef(trivet));
        for (let i = 0; i < 3; i++) {
          const angle = Math.PI / 6 + i * Math.PI * 2 / 3;
          box(part, .025, .138, .025, Math.cos(angle) * .13, .089,
            Math.sin(angle) * .13, 0x292723);
        }
        cookingPot(part, .17);
        part.scale.set(p.w / .8, p.h / .45, p.d / .7);
      } else if (japanese && addNaibu(kb, 'furnace', p.x, 0, p.z, p.w, .18, p.d)) {
        addNaibu(kb, 'kettle_low', p.x, .18, p.z, .35, .25, .35);
      } else {
        box(part, p.w, .12, p.d, 0, .06, 0, 0x493022);
        box(part, p.w - .18, .025, p.d - .18, 0, .13, 0, 0x211b17);
        box(part, .35, .25, .35, 0, .3, 0, 0x292723);
      }
      place(part, lightPool(), 0, 0, 0, .2);
    } else if (nodaJoinery && p.part === 'ammo') {
      // 野田砦の番所の矢箱は、閉じた角材に棒を載せず、底・側板と矢を受ける横木で組む推定復元。
      // 羽根・鏃まで既存の置き場と当たりの高さへ収める。共通の箱と材質で一度だけ束ねる。
      const w = p.w, d = p.d, h = p.h, board = .035;
      box(part, w, board, d, 0, board / 2, 0, 0x503923);
      for (const side of [-1, 1]) {
        box(part, board, h - board, d, side * (w - board) / 2,
          (h + board) / 2, 0, 0x795b3b);
        box(part, w - board * 2, h - board, board, 0,
          (h + board) / 2, side * (d - board) / 2, 0x795b3b);
        box(part, w - board * 2, .04, .045, 0, h - .04, side * d * .24, 0x604831);
      }
      const arrowY = h - .011, tip = -d / 2 + board + .025;
      for (let i = 0; i < 5; i++) {
        const x = (i - 2) * Math.min(.12, (w - .16) / 4);
        box(part, .014, .014, d - board * 2 - .07, x, arrowY, 0, 0x9b8057);
        // 鏃は先端へ細くし、羽根は筈側の上下と左右へ分ける。
        box(part, .024, .012, .045, x, arrowY, tip + .0225, 0x35332e);
        box(part, .012, .01, .02, x, arrowY, tip - .01, 0x35332e);
        const featherZ = d / 2 - board - .09;
        box(part, .048, .006, .11, x, arrowY, featherZ, 0xb6aa91);
        box(part, .006, .048, .11, x, arrowY, featherZ, 0xb6aa91);
        box(part, .02, .018, .025, x, arrowY, d / 2 - board - .0275, 0x604831);
      }
    } else if (p.part === 'ammo' && layout.profile === 'yagura' && japanese && addNaibu(kb, 'drawer_a', p.x, p.y || 0, p.z, p.w ?? .85, p.h ?? .55, p.d ?? .7)) {
      // 矢の束と弾の箱。棚の上の矢は軽い共通の形。
      for (let q = 0; q < 5; q++) box(part, .018, .02, (p.d ?? .7) - .05, (q - 2) * .07, (p.h ?? .55) + .04, 0, 0x9b8057);
    } // 武具の間の弾薬を米俵に置き換えず、下の箱と矢の束を使う。
    else if (p.part === 'bedding' || p.part === 'sittingMat') {
      if (nodaJoinery && (p.part === 'sittingMat' || ['nagaya', 'sobo', 'minka'].includes(layout.kind))) {
        // 文机前の座る筵と、兵・僧・民家の寝床の筵を共用する推定復元。
        // 厚い枕付きの板状にせず、編み目と縁を見せる。元の幅・奥行きと
        // 当たりの高さに納め、板戸の引き代や中央の通路へ広げない。
        const seated = p.part === 'sittingMat';
        // 横向きの寝床も筵と巻いた掛け物を一緒に回す。配置の外寸は変えず、
        // 既存の形と材質で組み、掛け物だけを一・八メートル幅へ引き伸ばさない。
        const bedding = new THREE.Group(), crosswise = !seated && p.crosswise;
        const bedW = crosswise ? p.d : p.w, bedD = crosswise ? p.w : p.d;
        bedding.rotation.y = crosswise ? Math.PI / 2 : 0; part.add(bedding);
        const height = p.h ?? .12, matH = seated ? height : height * .2;
        // 筵の芯は左右の縁の内面で止める。同じ面へ縁を重ねると、
        // 僧坊・砦・民家で見下ろした時に縁がちらつく。外寸は保つ。
        const borderW = .025, innerW = bedW - borderW * 2;
        box(bedding, innerW, matH, bedD, 0, matH / 2, 0, 0x958669);
        const rows = Math.max(1, Math.round(bedD / .1));
        for (let i = 1; i < rows; i++) box(bedding, innerW, height * .025, .012,
          0, matH, -bedD / 2 + bedD * i / rows, 0x756746);
        for (const side of [-1, 1]) box(bedding, borderW, matH, bedD,
          side * (bedW - borderW) / 2, matH / 2, 0, 0x605238);
        if (!seated) {
          const rollW = bedW * .8, rollD = Math.min(.25, bedD * .2);
          const rollZ = -bedD / 2 + rollD / 2 + .04;
          // 巻いた掛け物を角材で代用せず、潰れた布の巻きと二本の結び紐で表す。
          // 筵からの高さ・占有範囲は保ち、三つの形を全棟で共有する。
          if (!shapes.has('nodaBeddingRoll')) {
            const roll = new THREE.CylinderGeometry(1, 1, 1, 12);
            const tie = new THREE.CylinderGeometry(1, 1, 1, 12, 1, true);
            roll.rotateZ(Math.PI / 2); tie.rotateZ(Math.PI / 2);
            shapes.set('nodaBeddingRoll', roll); shapes.set('nodaBeddingTie', tie);
          }
          const rollH = height - matH, tieH = height * .025;
          const roll = new THREE.Mesh(shapes.get('nodaBeddingRoll'), mat(0x6a5e48));
          roll.scale.set(rollW, (rollH - tieH) / 2, (rollD - tieH) / 2);
          roll.position.set(0, matH + rollH / 2, rollZ);
          bedding.add(roll); cacheUsers.push(new WeakRef(roll));
          for (const side of [-1, 1]) {
            const tie = new THREE.Mesh(shapes.get('nodaBeddingTie'), mat(0x453d2d));
            tie.scale.set(.022, rollH / 2, rollD / 2);
            tie.position.set(side * rollW * .28, matH + rollH / 2, rollZ);
            bedding.add(tie); cacheUsers.push(new WeakRef(tie));
          }
        }
      } else {
        box(part, p.w, .06, p.d, 0, .03, 0, 0x958669);
        box(part, p.w * .8, .12, .22, 0, .09, -p.d / 2 + .15, 0x6a5e48);
      }
    } else if (p.part === 'maejoku') {
      // 御影堂の前卓は須弥壇の上に埋めず、礼盤との間に独立して置く推定復元。
      // 仏具まで配置の寸法内に収め、当たりと内陣の通路を揃える。
      const threeGusoku = nodaJoinery && layout.kind === 'hondo';
      const top = p.h - (threeGusoku ? .41 : .18);
      if (threeGusoku) {
        // 前卓の天板は長手へ木目を通す板組み。薄い下地で目地の下も受ける推定復元。
        // 仏具を載せる面と脚の上端は動かさず、元の六センチの厚みへ収める。
        box(part, p.w, .02, p.d, 0, top - .05, 0, 0x24170f, 'floorWood');
        for (let i = 0; i < 3; i++) {
          const back = -p.d / 2 + p.d * i / 3 + (i ? .00075 : 0);
          const front = -p.d / 2 + p.d * (i + 1) / 3 - (i < 2 ? .00075 : 0);
          const plank = box(part, front - back, .04, p.w,
            0, top - .02, (back + front) / 2, 0x24170f, 'floorWood');
          plank.rotation.y = Math.PI / 2;
        }
      } else box(part, p.w, .06, p.d, 0, top - .03, 0, 0x24170f);
      if (threeGusoku) {
        // 御影堂の前卓も板状の脚で塞がず、四脚を貫で結ぶ推定復元。
        // 貫は脚の内面で止め、足元から見ても木材を突き通さない。
        // 仏具を含む外寸・通路・当たりは共用し、静止した箱の束へ納める。
        const lx = p.w * .4, lz = p.d * .32, leg = .06;
        const legH = top - .06, railY = legH * .35;
        for (const x of [-lx, lx]) for (const z of [-lz, lz])
          box(part, leg, legH, leg, x, legH / 2, z, 0x3a2417);
        // 天板の裏は脚間の桟で受ける。木口を脚の内面へ納め、下の貫と離す。
        const apronH = Math.min(.06, legH * .2);
        for (const z of [-lz, lz])
          box(part, lx * 2 - leg, apronH, .035, 0,
            legH - apronH / 2, z, 0x3a2417, 'doorWoodCross');
        for (const x of [-lx, lx])
          box(part, .035, apronH, lz * 2 - leg, x,
            legH - apronH / 2, 0, 0x3a2417, 'floorWood');
        for (const z of [-lz, lz])
          box(part, lx * 2 - leg, .04, .035, 0, railY, z, 0x3a2417);
        for (const x of [-lx, lx])
          box(part, .035, .04, lz * 2 - leg, x, railY, 0, 0x3a2417);
      } else {
        for (const x of [-p.w * .4, p.w * .4]) {
          box(part, .07, top - .06, p.d * .7, x, (top - .06) / 2, 0, 0x3a2417);
          box(part, .12, .04, p.d, x, .02, 0, 0x24170f);
        }
        box(part, p.w * .8, .06, .04, 0, top * .35, 0, 0x3a2417);
      }
      if (nodaJoinery && layout.kind === 'hondo') {
        // 御影堂の香炉は中の詰まった角材にせず、三足・胴・口縁・灰を分ける推定復元。
        // 前卓の幅・奥行き・高さの内側に納め、通路と当たりを変えない。
        // 回転体は共有し、前卓と一緒に生成時だけ材質ごとに束ねる。
        if (!shapes.has('nodaIncenseBowl')) {
          const rim = [[0, .03], [.055, .03], [.085, .055], [.1, .12],
            [.1, .15], [.087, .15], [.087, .12], [.07, .065], [0, .05]];
          shapes.set('nodaIncenseBowl', new THREE.LatheGeometry(rim.map(([x, y]) => new THREE.Vector2(x, y)), 12));
          const ash = new THREE.CircleGeometry(.079, 12);
          ash.rotateX(-Math.PI / 2); shapes.set('nodaIncenseAsh', ash);
        }
        const bowl = new THREE.Mesh(shapes.get('nodaIncenseBowl'), mat(0x6a5a3a));
        bowl.scale.z = .8; bowl.position.y = top; part.add(bowl); cacheUsers.push(new WeakRef(bowl));
        const ash = new THREE.Mesh(shapes.get('nodaIncenseAsh'), mat(0x8a8070));
        ash.scale.z = .8; ash.position.y = top + .105; part.add(ash); cacheUsers.push(new WeakRef(ash));
        for (let i = 0; i < 3; i++) {
          const angle = i * Math.PI * 2 / 3;
          box(part, .025, .04, .025, Math.sin(angle) * .052, top + .02,
            Math.cos(angle) * .042, 0x6a5a3a);
        }
        // 三具足の推定復元。正面から左に花立、中央に香炉、右に燭台。
        // 卓の高さ・位置は保ち、花や蝋燭も既存の幅と奥行きの内側へ収める。
        // 花立の回転体も共有し、室内を作る時だけ既存の束へまとめる。
        if (!shapes.has('nodaFlowerVase')) {
          const rim = [[0, 0], [.055, 0], [.055, .025], [.04, .04],
            [.065, .1], [.06, .14], [.026, .18], [.026, .22],
            [.034, .23], [.024, .23], [.017, .215], [.017, .18], [0, .17]];
          shapes.set('nodaFlowerVase', new THREE.LatheGeometry(rim.map(([x, y]) => new THREE.Vector2(x, y)), 12));
        }
        const vase = new THREE.Mesh(shapes.get('nodaFlowerVase'), mat(0x6a5a3a));
        vase.position.set(-p.w * .34, top, 0); part.add(vase); cacheUsers.push(new WeakRef(vase));
        for (const side of [-1, 0, 1]) {
          const x = -p.w * .34 + side * .035, flowerY = top + .37 - Math.abs(side) * .035;
          box(part, .009, flowerY - top - .18, .009, x, (flowerY + top + .18) / 2, 0, 0x526044);
          box(part, .055, .014, .025, x + side * .015, flowerY - .06, 0, 0x526044);
          box(part, .045, .025, .04, x, flowerY, 0, 0xc7bba0);
        }
        const candleX = p.w * .34;
        box(part, .14, .025, .14, candleX, top + .0125, 0, 0x6a5a3a);
        box(part, .025, .16, .025, candleX, top + .105, 0, 0x6a5a3a);
        box(part, .12, .025, .12, candleX, top + .1975, 0, 0x6a5a3a);
        box(part, .035, .14, .035, candleX, top + .28, 0, 0xcfc3a2);
        box(part, .008, .018, .008, candleX, top + .359, 0, 0x30251e);
      } else {
        box(part, .22, .14, .18, 0, top + .07, 0, 0x6a5a3a);
        box(part, .18, .04, .14, 0, p.h - .02, 0, 0x8a8070);
      }
    } else if (nodaJoinery && p.part === 'sutraDesk') {
      // 御影堂の経卓。四脚と貫で支えた低い漆の卓に、開いた折本を載せる推定復元。
      // 文字は描かず、木表紙と折り目で経巻を示す。全て配置の外寸内で共通の箱へ束ねる。
      const top = p.h - .045, legH = top - .045;
      const lx = p.w * .36, lz = p.d * .32;
      // 経卓の天板も一塊にせず、三枚の板を接いで脚の上の桟で受ける推定復元。
      // 目地の下は薄い下地を通し、折本の下から床が透けないようにする。
      // 外寸と卓の高さを保ち、既存の箱・木肌を室内の生成時だけ束ねる。
      box(part, p.w, .02, p.d, 0, top - .035, 0, 0x24170f, 'floorWood');
      for (let i = 0; i < 3; i++) {
        const back = -p.d / 2 + p.d * i / 3 + (i ? .00075 : 0);
        const front = -p.d / 2 + p.d * (i + 1) / 3 - (i < 2 ? .00075 : 0);
        const plank = box(part, front - back, .025, p.w, 0,
          top - .0125, (back + front) / 2, 0x24170f, 'floorWood');
        plank.rotation.y = Math.PI / 2;
      }
      for (const x of [-lx, lx]) for (const z of [-lz, lz])
        box(part, .04, legH, .04, x, legH / 2, z, 0x3a2417, 'doorWood');
      // 桟は脚の内面で止め、上面を天板の下面へ合わせる。
      // 木口を脚へ突き通さず、低い経卓でも既存の貫と重ねない。
      const apronH = Math.min(.06, legH * .2);
      for (const z of [-lz, lz])
        box(part, lx * 2 - .04, apronH, .035, 0,
          legH - apronH / 2, z, 0x3a2417, 'doorWoodCross');
      for (const x of [-lx, lx])
        box(part, .035, apronH, lz * 2 - .04, x,
          legH - apronH / 2, 0, 0x3a2417, 'floorWood');
      // 読経する側（礼盤・筵のある手前）は膝を入れるため、低い貫で塞がない。
      // 文机と同じ三方の貫で支える推定の納まり。天板直下の幕板は四方に残す。
      // 御影堂の内外陣・僧坊だけの共通経卓で、外寸や通路の当たりは変えない。
      box(part, lx * 2 - .04, .035, .035, 0, legH * .35, -lz, 0x3a2417);
      for (const x of [-lx, lx])
        box(part, .035, .035, lz * 2 - .04, x, legH * .35, 0, 0x3a2417);
      const bookW = p.w * .65, bookD = p.d * .65;
      box(part, bookW + .02, .012, bookD + .02, 0, top + .006, 0, 0x66523b);
      // 折本は平たい角材を並べず、紙を山折り・谷折りで連ねる推定復元。
      // 隣の紙端を同じ高さへ合わせ、谷の下も木表紙から浮かせない。
      // 紙厚まで含めて元の本の高さへ納め、共通の箱を生成時だけ傾ける。
      const leafW = bookW / 8, rise = .016, paperT = .002;
      const angle = Math.atan2(rise, leafW), slopeW = Math.hypot(leafW, rise);
      for (let i = 0; i < 8; i++) {
        const leaf = box(part, slopeW, paperT, bookD,
          -bookW / 2 + (i + .5) * leafW,
          top + .012 + paperT / 2 + rise / 2, 0, i % 2 ? 0xcfc3a2 : 0xe0d4b7);
        leaf.rotation.z = i % 2 ? -angle : angle;
      }
      for (const side of [-1, 1]) box(part, .035, .012, bookD + .02,
        side * (bookW - .035) / 2, top + .034, 0, 0x66523b);
    } else if (p.part === 'raiban' && layout.profile !== 'hieizan') {
      // 内陣の低い礼盤。下框・漆の壇・座を、当たりと同じ寸法内に収める。
      // 共通の箱と材質を使い、室内を作る時だけ組む。
      box(part, p.w, p.h * .2, p.d, 0, p.h * .1, 0, 0x24170f);
      const tatamiSeat = nodaJoinery && layout.kind === 'hondo';
      if (tatamiSeat) {
        // 礼盤の腰を一塊の角材にせず、上下框と四隅の束で羽目板を受ける推定復元。
        // 板は框より内側へ納め、木口も束の内面で止める。座・踏み段と外寸は保つ。
        // 既存の箱と材質へ生成時だけ束ね、歩行の当たりは増やさない。
        const width = p.w * .82, depth = p.d * .76, cz = -p.d * .1;
        const bottom = p.h * .2, top = p.h * .7;
        const rail = Math.min(.035, (top - bottom) / 4), post = Math.min(.045, width * .1, depth * .1);
        const panelH = top - bottom - rail * 2, middle = (bottom + top) / 2;
        for (const yy of [bottom + rail / 2, top - rail / 2]) {
          for (const side of [-1, 1]) {
            box(part, width, rail, post, 0, yy, cz + side * (depth - post) / 2, 0x3a2417);
            box(part, post, rail, depth - post * 2,
              side * (width - post) / 2, yy, cz, 0x3a2417);
          }
        }
        for (const side of [-1, 1]) {
          for (const end of [-1, 1]) box(part, post, panelH, post,
            side * (width - post) / 2, middle, cz + end * (depth - post) / 2, 0x3a2417);
          box(part, width - post * 2, panelH, .012,
            0, middle, cz + side * (depth / 2 - post + .006), 0x513a27);
          box(part, .012, panelH, depth - post * 2,
            side * (width / 2 - post + .006), middle, cz, 0x513a27);
        }
      } else box(part, p.w * .82, p.h * .5, p.d * .76, 0, p.h * .45, -p.d * .1, 0x3a2417);
      box(part, p.w * .68, p.h * .3 - (tatamiSeat ? .004 : 0), p.d * .65,
        0, p.h * .85 - (tatamiSeat ? .002 : 0), -p.d * .1, tatamiSeat ? 0x958669 : 0x66523b);
      if (!tatamiSeat) box(part, p.w * .7, p.h * .2, p.d * .22, 0, p.h * .3, p.d * .35, 0x3a2417);
      if (tatamiSeat) {
        // 礼盤も外陣と共通の畳表・織布の縁で納める推定復元。
        // 織り目を立体の棒で描かず、元の上端と当たりの内側へ収める。
        const sw = p.w * .68, sd = p.d * .65, cz = -p.d * .1;
        const edge = Math.min(.035, sw * .08);
        box(part, sw - edge * 2, .004, sd, 0, p.h - .002, cz, 0xffffff, 'tatami');
        for (const side of [-1, 1]) box(part, edge, .004, sd,
          side * (sw - edge) / 2, p.h - .002, cz, 0xffffff, 'tatamiBorder');
        // 踏み段も黒い棒を貼らず、木目のある三枚の板と裏の受けで組む。
        // 板の継ぎ目の下も受けで閉じ、元の段の高さ・幅を保つ。
        const stepD = p.d * .22, boardT = Math.min(.018, p.h * .1);
        box(part, p.w * .7, p.h * .2 - boardT, stepD, 0,
          p.h * .3 - boardT / 2, p.d * .35, 0x3a2417);
        for (let i = 0; i < 3; i++) {
          const back = -stepD / 2 + stepD * i / 3 + (i ? .001 : 0);
          const front = -stepD / 2 + stepD * (i + 1) / 3 - (i < 2 ? .001 : 0);
          const board = box(part, front - back, boardT, p.w * .7, 0,
            p.h * .4 - boardT / 2, p.d * .35 + (back + front) / 2, 0x795b3b, 'floorWood');
          board.rotation.y = Math.PI / 2;
        }
      }
    } else if (p.part === 'offering' && layout.profile !== 'hieizan') {
      // 御影堂の脇卓は供物まで含めて配置の高さに収める。
      // 脚も卓の幅に合わせ、内陣の通路へ張り出させない。
      const top = nodaJoinery ? p.h - .18 : p.h;
      const legH = nodaJoinery ? top - .08 : p.h;
      if (nodaJoinery && layout.kind === 'hondo') {
        // 脇卓も前卓と同じ板組みで受け、供飯の下を木目のない角材にしない。
        // 下地と三枚の板を元の八センチ厚へ納め、供物・脚・当たりの位置を保つ。
        box(part, p.w, .02, p.d, 0, top - .07, 0, 0x785b3c, 'floorWood');
        for (let i = 0; i < 3; i++) {
          const back = -p.d / 2 + p.d * i / 3 + (i ? .00075 : 0);
          const front = -p.d / 2 + p.d * (i + 1) / 3 - (i < 2 ? .00075 : 0);
          const plank = box(part, front - back, .06, p.w,
            0, top - .03, (back + front) / 2, 0x785b3c, 'floorWood');
          plank.rotation.y = Math.PI / 2;
        }
      } else box(part, p.w, .08, p.d, 0, top - .04, 0, 0x785b3c);
      if (nodaJoinery && layout.kind === 'hondo') {
        // 脇卓は奥行きの中央に二本の棒だけを立てず、四脚と貫で天板を支える推定復元。
        // 貫の木口は脚の内面で止め、全て元の卓の寸法・当たりへ納める。
        const lx = p.w * .36, lz = p.d * .36, railY = legH * .35;
        for (const x of [-lx, lx]) for (const z of [-lz, lz])
          box(part, .07, legH, .07, x, legH / 2, z, 0x59412b);
        const apronH = Math.min(.05, legH * .2);
        for (const z of [-lz, lz])
          box(part, lx * 2 - .07, apronH, .04, 0,
            legH - apronH / 2, z, 0x59412b, 'doorWoodCross');
        for (const x of [-lx, lx])
          box(part, .04, apronH, lz * 2 - .07, x,
            legH - apronH / 2, 0, 0x59412b, 'floorWood');
        for (const z of [-lz, lz])
          box(part, lx * 2 - .07, .04, .04, 0, railY, z, 0x59412b);
        for (const x of [-lx, lx])
          box(part, .04, .04, lz * 2 - .07, x, railY, 0, 0x59412b);
      } else for (const x of [-1, 1]) box(part, .07, legH, .07,
        x * (nodaJoinery ? p.w * .36 : .4), legH / 2, 0, 0x59412b);
      if (nodaJoinery && layout.kind === 'hondo') {
        // 脇卓の供物は白い角材で済ませず、供飯の椀と盛った飯を分ける推定復元。
        // 左右の卓で同じ形・材質を使い、器の口を飯で塞がず縁を見せる。
        // 台・椀・飯を既存の十八センチの高さへ収め、通路の当たりは広げない。
        box(part, .28, .025, .28, 0, top + .0125, 0, 0x24170f);
        if (!shapes.has('nodaOfferingBowl')) {
          const rim = [[.045, 0], [.045, .018], [.075, .028], [.11, .075],
            [.11, .085], [.098, .085], [.098, .075], [.063, .035], [0, .035]];
          shapes.set('nodaOfferingBowl', new THREE.LatheGeometry(rim.map(([x, y]) => new THREE.Vector2(x, y)), 12));
          shapes.set('nodaOfferingRice', new THREE.SphereGeometry(1, 12, 6));
        }
        const bowl = new THREE.Mesh(shapes.get('nodaOfferingBowl'), mat(0x3a2417));
        bowl.position.y = top + .025; part.add(bowl); cacheUsers.push(new WeakRef(bowl));
        const rice = new THREE.Mesh(shapes.get('nodaOfferingRice'), mat(0xd8d0bd));
        rice.scale.set(.086, .065, .086); rice.position.y = top + .11;
        part.add(rice); cacheUsers.push(new WeakRef(rice));
      } else box(part, .18, .18, .18, 0, top + .09, 0, 0xd8d0bd);
    }
    else if (p.part === 'tomyo' && hieiTatami) {
      part.add(tomyo(false, true));
      place(part, lightPool(), 0, 0, 0, .09);
    } else if (p.part === 'bedding') {
      box(part, p.w, .06, p.d, 0, .03, 0, 0x958669);
      box(part, p.w * .8, .12, .22, 0, .09, -p.d / 2 + .15, 0x6a5e48);
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
      if (nodaJoinery) {
        // 庫裏の竈は土の袖と上部で焚き口を囲み、奥行きのある火床を残す。
        // 火床も鍋も配置済みの寸法内に納め、中央の通路と煙抜きの位置を保つ。
        box(part, .85, .1, .7, 0, .05, 0, 0x75634b);
        for (const x of [-.2925, .2925]) box(part, .265, .55, .7, x, .375, 0, 0x75634b);
        box(part, .32, .55, .12, 0, .375, -.29, 0x65533e);
        // 釜の真下を土で塞がず、左右の袖の間に釜穴を残す推定復元。
        // 前後の土だけで釜を受け、焚き口から釜底まで火の通りをつなぐ。
        // 元の竈の外寸と共通の箱・材質を使い、煙抜きと通路は動かさない。
        box(part, .32, .22, .19, 0, .54, -.255, 0x75634b);
        // 焚き口の上を直線の角材状にせず、土を厚く盛った丸い口にする推定復元。
        // 正面から火床まで抜けた形にし、裏面・口の内側にも厚みを持たせる。
        // 元の袖と釜穴の間だけを使い、竈の外寸・当たり・煙抜きは保つ。
        if (!shapes.has('nodaStoveMouth')) {
          const face = new THREE.Shape();
          face.moveTo(-.16, .65); face.lineTo(.16, .65); face.lineTo(.16, .30);
          face.bezierCurveTo(.16, .38, .09, .43, 0, .43);
          face.bezierCurveTo(-.09, .43, -.16, .38, -.16, .30);
          face.closePath();
          const mouth = new THREE.ExtrudeGeometry(face, { depth: .19, bevelEnabled: false, curveSegments: 6 });
          mouth.translate(0, 0, .16); shapes.set('nodaStoveMouth', mouth);
        }
        const mouth = new THREE.Mesh(shapes.get('nodaStoveMouth'), mat(0x75634b));
        part.add(mouth); cacheUsers.push(new WeakRef(mouth));
        // 火床を一様な黒板にせず、灰の上へ割り薪を置く推定復元。
        // 奥を炭化させ、手前の木口には割れ目を残す。全て焚き口の内側へ収める。
        box(part, .32, .012, .56, 0, .106, .02, 0x8a8070);
        box(part, .25, .004, .27, 0, .114, -.065, 0x494139);
        if (!shapes.has('nodaStoveLog')) {
          const log = new THREE.CylinderGeometry(.029, .033, .3, 5);
          log.rotateX(Math.PI / 2); shapes.set('nodaStoveLog', log);
        }
        for (const x of [-.075, .075]) {
          const log = new THREE.Mesh(shapes.get('nodaStoveLog'), mat(0x3a2b20));
          log.position.set(x, .147, .1); part.add(log); cacheUsers.push(new WeakRef(log));
          // 灰をかぶった奥側と熾火。発光する灯りや動く火の形は増やさない。
          box(part, .036, .009, .13, x, .176, .015, 0x494139);
          box(part, .024, .006, .065, x, .1835, -.005, 0x8a4226);
          box(part, .016, .03, .002, x, .146, .251, 0x9b8057);
          box(part, .003, .022, .003, x, .146, .252, 0x29221c);
        }
        // 土の口を黒い板で塞がず、袖の内面だけ煤けさせる。
        // 薪から釜底までの空洞と、丸い焚き口の輪郭は開けたままにする。
        for (const x of [-.159, .159])
          box(part, .002, .18, .4, x, .22, .04, 0x494139);
        // 釜底を穴へ落とし、胴を土の縁で受ける。天板の上へ浮かせない。
        cookingPot(part, .575);
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
if (nodaJoinery) {
      // 御影堂の上下框は一枚の塊でなく、四周の框と内側の板で組む推定復元。
      // 前後の框を通し、妻の木口は内面で止める。外寸・高さ・通路は変えない。
      // 二ミリの継ぎ目は内板で裏打ちし、壇を貫く隙間にしない。
      // 木肌と箱は既存の物を共用し、室内生成時に静止した束へまとめる。
      const framedAltar = nodaJoinery && layout.kind === 'hondo';
      if (framedAltar) for (const [bottom, height] of [[0, .14], [.44, .1]]) {
        const rail = .1, seam = .002, yy = bottom + height / 2;
        for (const side of [-1, 1]) {
          box(part, 2.1, height, rail, 0, yy, side * .45, 0x24170f, 'doorWoodCross');
          box(part, rail, height, .8, side, yy, 0, 0x24170f, 'doorWood');
        }
        box(part, 1.9, height / 2, .8, 0, bottom + height / 4, 0, 0x24170f, 'doorWoodCross');
        box(part, 1.9 - seam * 2, height / 2, .8 - seam * 2,
          0, bottom + height * .75, 0, 0x24170f, 'doorWoodCross');
      }
      else box(part, 2.1, .14, 1, 0, .07, 0, 0x24170f);
      if (nodaJoinery && layout.kind === 'hondo') {
        // 格狭間の直後へ黒板を貼らず、腰の胴を十センチほど奥へ引く推定復元。
        // 開口の周りは上下の框と束で支え、脇からも彫りの厚みと奥行きが見える。
        // 元の壇の外寸内へ納め、共通の箱・材質を静止した内装へ束ねる。
        box(part, 1.65, .3, .62, 0, .29, 0, 0x2a1a12);
        for (const y of [.17, .41]) {
          box(part, 1.87, .06, .05, 0, y, .395, 0x24170f);
          for (const side of [-1, 1])
            box(part, .05, .06, .78, side * .91, y, -.02, 0x24170f);
        }
        for (const [a, b] of [[-.935, -.75], [-.35, -.2], [.2, .35], [.75, .935]])
          box(part, b - a, .18, .05, (a + b) / 2, .29, .395, 0x24170f);
        for (const side of [-1, 1]) for (const [a, b] of [[-.41, -.37], [-.05, .05]])
          box(part, .05, .18, b - a, side * .91, .29, (a + b) / 2, 0x24170f);
        // 御影堂の須弥壇の腰は金の四角板で塞がず、曲線の格狭間と奥の暗がりで表す。
        // 意匠は推定。三面とも同じ抜き形・材質を使い、室内の生成時に束ねる。
        if (!shapes.has('nodaAltarKozama')) {
          const rim = new THREE.Shape();
          rim.moveTo(-.2, -.09); rim.lineTo(.2, -.09);
          rim.lineTo(.2, .09); rim.lineTo(-.2, .09); rim.closePath();
          const hole = new THREE.Path();
          hole.moveTo(-.16, -.055);
          hole.lineTo(-.13, -.025);
          hole.bezierCurveTo(-.17, .005, -.13, .045, -.08, .035);
          hole.bezierCurveTo(-.055, .03, -.035, .065, 0, .065);
          hole.bezierCurveTo(.035, .065, .055, .03, .08, .035);
          hole.bezierCurveTo(.13, .045, .17, .005, .13, -.025);
          hole.lineTo(.16, -.055); hole.closePath();
          rim.holes.push(hole);
          shapes.set('nodaAltarKozama', new THREE.ExtrudeGeometry(rim,
            { depth: .012, bevelEnabled: false, curveSegments: 6 }));
        }
        for (const x of [-.55, 0, .55]) {
          const rim = new THREE.Mesh(shapes.get('nodaAltarKozama'), mat(0x8a6c30));
          rim.position.set(x, .29, .42); part.add(rim); cacheUsers.push(new WeakRef(rim));
        }
        // 内陣の脇から見える左右の腰にも格狭間を納める推定復元。
        // 正面の形を使い回し、短い側面には幅を縮めて二間ずつ収める。
        // 上下框の内側で止め、須弥壇の寸法と両脇の通路は保つ。
        for (const side of [-1, 1]) for (const z of [-.21, .21]) {
          const rim = new THREE.Mesh(shapes.get('nodaAltarKozama'), mat(0x8a6c30));
          rim.scale.x = .8; rim.rotation.y = side * Math.PI / 2;
          rim.position.set(side * .935, .29, z);
          part.add(rim); cacheUsers.push(new WeakRef(rim));
        }
      } else {
        box(part, 1.85, .3, .82, 0, .29, 0, 0x2a1a12);
        for (const x of [-.55, 0, .55]) box(part, .4, .18, .01, x, .29, .415, 0x8a6c30);
      }
      if (!framedAltar) box(part, 2.1, .1, 1, 0, .49, 0, 0x24170f);
      if (nodaJoinery && layout.kind === 'hondo') {
        // 御影堂は親鸞の御木像を祀る。像の細部は推定。蓮台と仏の光背は付けない。
        // 参照：https://www.hongwanji.or.jp/850800houyou/news/002037.html
        // 御木像の背後は後屏で受ける推定復元。光背へ置き換えず、
        // 須弥壇の上框から立て、天蓋の下と壇の奥行きの内側へ収める。
        // 三面の鏡板を框で納め、中央の像・両脇の灯明・内陣の通路は保つ。
        // 既存の箱と材質を内装へ束ね、毎コマの処理は加えない。
        const screenBottom = .54, screenTop = 1.76, screenZ = -.425;
        const screenH = screenTop - screenBottom, screenY = (screenBottom + screenTop) / 2;
        // 鏡板は幅広い無地の塊にせず、縦木目の三枚接ぎとする推定復元。
        // 目地の奥は薄い裏板で閉じ、背後の白壁を透かさない。
        // 元の板厚三十五ミリと框の内寸に納め、壇の背後を狭めない。
        const screenWidth = .46, screenPitch = screenWidth / 3, screenJoint = .0015;
        for (const x of [-.5, 0, .5]) {
          box(part, screenWidth, screenH - .08, .012,
            x, screenY, screenZ - .0115, 0x95815a, 'doorWood');
          for (let i = 0; i < 3; i++) {
            const left = x - screenWidth / 2 + screenPitch * i + (i ? screenJoint / 2 : 0);
            const right = x - screenWidth / 2 + screenPitch * (i + 1) - (i < 2 ? screenJoint / 2 : 0);
            box(part, right - left, screenH - .08, .023,
              (left + right) / 2, screenY, screenZ + .006, 0x95815a, 'doorWood');
          }
          // 裏の板押さえは框の内面で止め、板の背面へ接して支える。
          // 竪框の厚みの内側へ収め、共通部品と生成時のまとめ描きを使う。
          box(part, screenWidth, .04, .01,
            x, screenY, screenZ - .0225, 0x3a2417, 'doorWoodCross');
        }
        for (const x of [-.75, -.25, .25, .75])
          box(part, .04, screenH, .055, x, screenY, screenZ, 0x3a2417, 'doorWood');
        // 後屏の横框を竪框へ突き通さず、三間それぞれの内面で止める。
        // 同じ面の木が重なるちらつきを除き、縦横の木目も材の長手へ揃える。
        // 外寸と通路は保ち、既存の形・材質を共用して室内の束へまとめる。
        for (const yy of [screenBottom + .02, screenTop - .02])
          for (const x of [-.5, 0, .5])
            box(part, .46, .04, .055, x, yy, screenZ, 0x3a2417, 'doorWoodCross');
        box(part, .72, .12, .58, 0, .6, -.06, 0x513a27);
        // 御木像の僧形を角材の頭・胴で済ませず、丸い剃髪の頭と、
        // 肩から膝へ落ちる法衣で表す推定復元。仏の螺髪や光背は付けない。
        // 須弥壇の既存の寸法内へ納め、形・材質は全ての堂で使い回す。
        if (!shapes.has('nodaPortraitHead')) {
          shapes.set('nodaPortraitHead', new THREE.SphereGeometry(1, 12, 8));
          shapes.set('nodaPortraitRobe', new THREE.CylinderGeometry(.16, .25, .42, 12));
        }
        const portraitRound = (x, y, z, w, h, d, color) => {
          const mesh = new THREE.Mesh(shapes.get('nodaPortraitHead'), mat(color));
          mesh.position.set(x, y, z); mesh.scale.set(w, h, d);
          part.add(mesh); cacheUsers.push(new WeakRef(mesh));
        };
        portraitRound(0, .74, -.04, .325, .08, .24, 0x30251e);
        const robe = new THREE.Mesh(shapes.get('nodaPortraitRobe'), mat(0x30251e));
        robe.position.set(0, .98, -.1); robe.scale.z = .65;
        part.add(robe); cacheUsers.push(new WeakRef(robe));
        portraitRound(0, 1.31, -.08, .115, .125, .115, 0x977657);
        // 顔を外陣へ向け、鼻筋と法衣の襟を小さな木彫の起伏で示す。
        // 文字や実在が確かめられない紋様は足さない。
        portraitRound(0, 1.3, .025, .025, .04, .028, 0x977657);
        for (const side of [-1, 1]) {
          const collar = box(part, .035, .19, .025, side * .045, 1.12, .012, 0x594735);
          collar.rotation.z = side * -.4;
        }
        box(part, .45, .1, .18, 0, .94, .14, 0x977657);
        for (const x of [-.24, .24]) box(part, .13, .3, .24, x, 1.02, .02, 0x30251e);
      } else {
        box(part, .6, .1, .5, 0, .59, -.1, 0x6e5424);
        box(part, .45, .7, .4, 0, .99, -.1, 0xa48b4a);
        box(part, .28, .28, .28, 0, 1.48, -.1, 0xa48b4a);
        box(part, .9, .9, .03, 0, 1.25, -.36, 0x7a5e26);
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

}
if (nodaJoinery) {
      if (!(nodaJoinery && layout.kind === 'hondo')) {
        box(part, .5, .04, .22, 0, .54, .38, 0x2a1810); box(part, .12, .1, .12, 0, .6, .38, 0x6a5a3a);
      }
      // 御影堂の壇上も室内と同じ油皿を使い、別形式の購入灯具を混ぜない。
      place(part, tomyo(false, false, nodaJoinery), -.75, 0, 0, .55); place(part, tomyo(false, false, nodaJoinery), .75, 0, 0, .55);
      if (templeAltar) {
        // 古い堂の内陣の推定：家庭用仏壇ではなく、須弥壇の本尊を覆う天蓋と幡。
        // 須弥壇と同じ範囲に収め、左右の通路を空ける。形・材質は箱の共通部品を使う。
        if (nodaJoinery && layout.kind === 'hondo') {
          // 御影堂の天蓋は平板を重ねず、外枠と格縁で六間の鏡板を受ける推定復元。
          // 木口は受け材の内面で止め、鏡板の下面を格縁より奥へ納める。
          // 外寸・吊り点は保ち、共有する箱と材質を内装の束へ生成時だけ加える。
          // 無地だった天蓋の木部にも室内と共通の木肌を通す。
          // 格縁は材の長手へ、鏡板は奥行きへ揃え、横木へ縦の木目を貼らない。
          // 形を回して同じ箱・材質を使い、開閉中や毎コマの処理は増やさない。
          const canopyTimber = (w, h, d, x, y, z, color) => {
            const alongX = w > d;
            const timber = box(part, alongX ? d : w, h, alongX ? w : d,
              x, y, z, color, 'floorWood');
            if (alongX) timber.rotation.y = Math.PI / 2;
          };
          for (const x of [-.745, .745]) canopyTimber(.06, .08, .72, x, 2.18, -.08, 0x3a2417);
          for (const z of [-.41, .25]) canopyTimber(1.43, .08, .06, 0, 2.18, z, 0x3a2417);
          canopyTimber(1.43, .08, .035, 0, 2.18, -.08, 0x3a2417);
          const span = 1.43 / 3;
          for (let i = 1; i < 3; i++) for (const z of [-.23875, .07875])
            canopyTimber(.035, .08, .2825, -.715 + span * i, 2.18, z, 0x3a2417);
          for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
            const left = -.715 + span * i + (i ? .0175 : 0);
            const right = -.715 + span * (i + 1) - (i < 2 ? .0175 : 0);
            const back = j ? -.0625 : -.38, front = j ? .22 : -.0975;
            box(part, right - left, .03, front - back,
              (left + right) / 2, 2.205, (back + front) / 2, 0x95815a, 'floorWood');
          }
          // 上框は外枠の上面へ載せ、二枚の板の面を重ねない。
          box(part, 1.7, .05, .82, 0, 2.245, -.08, 0x8a6c30);
        } else {
          box(part, 1.55, .08, .72, 0, 2.18, -.08, 0x3a2417);
          box(part, 1.7, .06, .82, 0, 2.24, -.08, 0x8a6c30);
        }
        if (nodaJoinery && layout.kind === 'hondo') {
          // 吊り金具を薄い鏡板だけへ突き付けず、格縁の下へ渡した吊り受け木で受ける推定復元。
          // 室内と同じ格縁の割り付けを使い、左右の吊り点を挟む格縁へ木口を合わせる。
          // 壇の縮尺と床仕上げの高さを戻し、受け木の下面で吊り材を止める。
          const support = nodaCanopySupport(layout, p, h);
          if (support) {
            const { sx, sy, sz, bottom, top, left, right } = support;
            for (const z of [-.34, .18]) {
              box(part, right - left, .06 / sy, .08 / sz,
                (left + right) / 2, top + .03 / sy, z, 0x3a2a1c);
              for (const x of [-.55, .55])
                box(part, .02, top - bottom, .02, x, (top + bottom) / 2, z, 0x6a5a3a);
            }
          }
        }
        for (const x of [-.68, .68]) {
          if (nodaJoinery && layout.kind === 'hondo') {
            // 御影堂の幡は厚い板と角棒で吊らず、紐・上端の受け・薄い布に分ける推定復元。
            // 元の幅十二センチ・下端の高さを保ち、像や灯明、内陣の通路へ張り出さない。
            // 布の折りと下の垂れは共通の箱で組み、静止した内装へ一度だけ束ねる。
            box(part, .008, .24, .008, x, 2.02, -.08, 0x8a6c30);
            box(part, .12, .025, .02, x, 1.8875, -.08, 0x8a6c30);
            for (let i = -1; i <= 1; i++) {
              const z = -.08 + (i === 0 ? .004 : -.004);
              box(part, .04, .41, .006, x + i * .04, 1.67, z, 0x95815a);
              box(part, .032, .105, .006, x + i * .04, 1.4125, z, 0x95815a);
            }
          } else {
            box(part, .035, .28, .035, x, 2.0, -.08, 0x8a6c30);
            box(part, .12, .54, .025, x, 1.63, -.08, 0x95815a);
          }
        }
      }

} else {
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
        hangingLamp ? hieiHangingLamp() : tomyo(false, layout.profile === 'hieizan'), side * (hangingLamp ? .9 : .75), 0, 0, .55);
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
    // 伊賀は硯と筆返しを含む上端まで指定高へ収める。天板だけで縮尺を
    // 決めると、上の調度が登録した当たりの高さから突き出してしまう。
    if (!kit && p.part === 'desk') part.scale.set(p.w / 1.2, p.h / (layout.profile === 'iga' ? .5 : hieiSobo ? .512 : .46), p.d / .7);
    if (!kit && p.part === 'stove') part.scale.set(p.w / .85, p.h / .9, p.d / .7);
    if (p.part === 'alcove' && layout.profile !== 'iga') part.scale.set(p.w / 2.3, inabaHigh ? 1 : p.h / 2.5, p.d / .85);
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
  // 野田福島の敷居は間仕切りの前後二十センチまである。
  // 畳寄せ・板間の框もその外端で止め、敷居や二本の溝へ床を重ねない。
  // 歩く床と部屋の範囲は保ち、生成時の仕上げ寸法だけを縮める。
  // 外壁の地覆は壁面から二十六センチまで室内へ出る（naka.js）。
  // 部屋の端へ畳寄せを置くと地覆の下へ隠れるため、外周だけその内面で止める。
  // 間仕切り側は従来の敷居で納め、床の当たりや調度の位置は動かさない。
  const floorBounds = nodaJoinery ? layout.rooms.reduce((b, r) => {
    b.x0 = Math.min(b.x0, r.x0); b.x1 = Math.max(b.x1, r.x1);
    b.z0 = Math.min(b.z0, r.z0); b.z1 = Math.max(b.z1, r.z1);
    return b;
  }, { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity }) : null;
  const finishRooms = nodaJoinery ? layout.rooms.map(r => {
    if (r.floor !== 'tatami' && r.floor !== 'boards') return r;
    const x0 = Math.max(r.x0, floorBounds.x0 + .26);
    const x1 = Math.min(r.x1, floorBounds.x1 - .26);
    let z0 = Math.max(r.z0, floorBounds.z0 + .26);
    let z1 = Math.min(r.z1, floorBounds.z1 - .26);
    for (const p of layout.portals || []) {
      if (Math.abs(p.z - r.z0) < .01) z0 = Math.max(z0, p.z + .2);
      if (Math.abs(p.z - r.z1) < .01) z1 = Math.min(z1, p.z - .2);
    }
    return { ...r, x0, x1, z0, z1 };
  }) : layout.rooms;
  let floorRooms = layout.floorPieces ? finishRooms.flatMap(r => layout.floorPieces.map(v => ({ ...r, x0: Math.max(r.x0, v[0]), x1: Math.min(r.x1, v[1]), z0: Math.max(r.z0, v[2]), z1: Math.min(r.z1, v[3]) })).filter(r => r.x1 > r.x0 && r.z1 > r.z0)) : finishRooms;
  if (nodaJoinery && layout.entrySill) floorRooms = floorRooms.flatMap(r => {
    // 玄関の二本溝と同じ範囲だけ仕上げを抜く。左右の床と歩ける下地は残す。
    // 畳の外陣は一室のまま割り付け、下で敷居に当たる畳・畳寄せだけ切る。
    if (r.floor === 'tatami') return [r];
    const v = layout.entrySill, a = Math.max(r.x0, v.x0), b = Math.min(r.x1, v.x1);
    const c = Math.max(r.z0, v.z0), d = Math.min(r.z1, v.z1);
    if (a >= b || c >= d) return [r];
    return [[r.x0, a, r.z0, r.z1], [b, r.x1, r.z0, r.z1], [a, b, r.z0, c], [a, b, d, r.z1]]
      .filter(p => p[1] - p[0] > .001 && p[3] - p[2] > .001)
      .map(([x0, x1, z0, z1]) => ({ ...r, x0, x1, z0, z1 }));
  });
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
  const hieiFloorTimber = (w, h, d, x, y, z) => {
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
      hieiFloorTimber(b - a, HIEI_SOBO_SILL, d - c,
        (a + b) / 2, (r.y || 0) + HIEI_SOBO_SILL / 2, (c + d) / 2);
    }
  };
  for (let r of floorRooms) {
    if (!nodaJoinery && !hieiTatami) {
    // 伊賀の上がり床は畳下も板で支え、入口から見える段差の側面を塞ぐ。
    if (layout.profile === 'iga' && r.y > 0 && ['boards', 'tatami'].includes(r.floor)) {
      const framed = r.floor === 'boards' && layout.rooms.some(v => v.floor === 'earth'
        && Math.abs(v.z0 - r.z1) < .01 && v.x0 < r.x1 && v.x1 > r.x0);
      let pieces = [[r.x0, r.x1, r.z0, r.z1 - (framed ? .12 : 0)]];
      for (const p of layout.props) if (p.part === 'hearth' && layout.kind === 'minka') {
        const a = p.x - p.w / 2, b = p.x + p.w / 2, c = p.z - p.d / 2, d = p.z + p.d / 2;
        pieces = pieces.flatMap(([x0, x1, z0, z1]) => {
          if (a >= x1 || b <= x0 || c >= z1 || d <= z0) return [[x0, x1, z0, z1]];
          return [[x0, Math.max(x0, a), z0, z1], [Math.min(x1, b), x1, z0, z1],
            [Math.max(x0, a), Math.min(x1, b), z0, Math.max(z0, c)],
            [Math.max(x0, a), Math.min(x1, b), Math.min(z1, d), z1]];
        }).filter(([x0, x1, z0, z1]) => x1 > x0 && z1 > z0);
      }
      // 上がり床を木の塊で埋めず、床板の下を根太と際の木で支える。
      // 炉を避けて切り分けた各床の内側だけで組み、床高・灰床・敷居は保つ。
      // 寸法の等しい木は共通の箱形を使い、調度と同じ静止した束へまとめる。
      const boardH = Math.min(.03, r.y), joistH = r.y - boardH;
      const boardEdge = ['minka', 'nagaya', 'bansho'].includes(layout.kind);
      // 板寄せ・框・根太も板戸と共通の木肌で組む。床板だけに木目があり、
      // その端を受ける材が単色の帯になるのを避け、木目を各材の長手へ通す。
      // 寸法ごとの原形と材質を共有し、既存の静止した室内の束へ納める。
      const floorTimber = (w, h, d, x, y, z, alongZ = false) => {
        const wood = alongZ ? igaBoard(g, w, d, h, y, 0x604831)
          : igaDoorTimber(g, w, h, d, x, y, z, 0x604831, true);
        if (alongZ) {
          wood.rotation.x = Math.PI / 2;
          wood.position.x = x; wood.position.z = z;
        }
      };
      const backEdge = !layout.rooms.some(v => Math.abs(v.z1 - r.z0) < .01);
      const frontEdge = !layout.rooms.some(v => Math.abs(v.z0 - r.z1) < .01);
      for (const [x0, x1, z0, z1] of pieces) {
        const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
        const bays = Math.max(1, Math.ceil(d / .9));
        // 板寄せと床板を同じ高さで重ねない。炉を避けた各床板も内側で止める。
        const bx0 = boardEdge ? Math.max(x0, r.x0 + .24) : x0;
        const bx1 = boardEdge ? Math.min(x1, r.x1 - .24) : x1;
        const bz0 = boardEdge && backEdge ? Math.max(z0, r.z0 + .24) : z0;
        const bz1 = boardEdge && frontEdge ? Math.min(z1, r.z1 - .24) : z1;
        if (bx1 > bx0 && bz1 > bz0) {
          // 板間は単色の面で済ませず、板戸と共有する木肌を六十センチごとに貼る。
          // 上面の木目は床板の長手（奥行き）へ通す。炉や框で分けても縮尺は変えない。
          // 畳下の板には足さず、形・材質は設営時に共有して既存の束へまとめる。
          if (r.floor === 'boards') {
            igaFloorBoards(g, bx0, bx1, bz0, bz1, r.y, boardH, 0x8a6a48, r.x0 + .24,
              z0, joistH > .001 ? d / bays : 0);
          } else box(g, bx1 - bx0, boardH, bz1 - bz0,
            (bx0 + bx1) / 2, r.y - boardH / 2, (bz0 + bz1) / 2, 0x8a6a48);
        }
        if (joistH <= .001) continue;
        const edgeW = Math.min(.06, w / 2), edgeD = Math.min(.06, d / 2);
        for (const x of [x0 + edgeW / 2, x1 - edgeW / 2])
          floorTimber(edgeW, joistH, d, x, joistH / 2, cz, true);
        const innerW = w - edgeW * 2;
        if (innerW <= .001) continue;
        for (const z of [z0 + edgeD / 2, z1 - edgeD / 2])
          floorTimber(innerW, joistH, edgeD, cx, joistH / 2, z);
        // 床板の長手は奥行き方向。根太は直交させ、両端を際の木へ掛ける。
        for (let i = 1; i < bays; i++)
          floorTimber(innerW, joistH, Math.min(.06, d / bays), cx, joistH / 2,
            z0 + i * d / bays);
      }
      // 板間の壁際は柱の室内面まで板寄せで納める推定復元。
      // 一面の床板を柱へ潜らせたままにせず、床板の端を受ける横木を見せる。
      // 上端は既存の板床と同じ。土間際の上がり框・戸の敷居には重ねない。
      if (boardEdge) {
        const edge = .24, boardH = Math.min(.03, r.y);
        // 外壁側は板寄せどうしで突き合わせ、土間側は幅十二センチの框まで延ばす。
        // 両端を一律に二十四センチ引くと、框の左右に床のない隙間が残る。
        const start = r.z0 + (backEdge ? edge : 0);
        const end = r.z1 - (framed ? .12 : frontEdge ? edge : 0);
        if (end > start) for (const x of [r.x0 + edge / 2, r.x1 - edge / 2])
          floorTimber(edge, boardH, end - start, x, r.y - boardH / 2,
            (start + end) / 2, true);
        for (const [z, outer] of [[r.z0 + edge / 2, backEdge], [r.z1 - edge / 2, frontEdge]])
          if (outer) floorTimber(r.x1 - r.x0, boardH, edge,
            (r.x0 + r.x1) / 2, r.y - boardH / 2, z);
        // 板寄せは床板を受ける材。板壁の下端は別の地覆で押さえ、
        // 民家・陣小屋・番所も柱の間で壁板が床へ突き当たるだけにしない。
        // 柱心から室内面より奥に納める推定復元。土間際の戸の二本の溝と
        // 引きしろへは延ばさず、共有の木材で静止した室内の束へ焼き込む。
        const footH = .08, footD = .06, footInset = .16;
        const footZ0 = r.z0 + (backEdge ? footInset + footD / 2 : 0);
        const footZ1 = r.z1 - (framed ? .24 : frontEdge ? footInset + footD / 2 : 0);
        if (footZ1 > footZ0) for (const x of [r.x0 + footInset, r.x1 - footInset])
          floorTimber(footD, footH, footZ1 - footZ0, x,
            r.y + footH / 2, (footZ0 + footZ1) / 2, true);
        for (const [z, outer] of [[r.z0 + footInset, backEdge], [r.z1 - footInset, frontEdge]])
          if (outer) floorTimber(r.x1 - r.x0 - footInset * 2 + footD,
            footH, footD, (r.x0 + r.x1) / 2, r.y + footH / 2, z);
      }
      // 民家・陣小屋・番所の土間際は、床板の木口を上がり框で受ける推定復元。
      // 床の上端と既存の足場を保ち、板間の内側だけへ納める。
      if (framed) {
        const frameD = .12;
        floorTimber(r.x1 - r.x0, r.y, frameD,
          (r.x0 + r.x1) / 2, r.y / 2, r.z1 - frameD / 2);
        // 框と床板の継ぎ目。板目の筋はこの横木の手前で止める。
        box(g, r.x1 - r.x0, .002, .006,
          (r.x0 + r.x1) / 2, r.y + .001, r.z1 - frameD, 0x4a3828);
      }
    }
    if (layout.profile === 'iga' && layout.kind === 'yashiki' && r.floor === 'boards') {
      // 館の低い入口は上がり床の処理を通らないので、単色の下地だけが残っていた。
      // 板間と同じ共有の木肌を薄く重ね、柱際は板寄せで受ける。
      // 仕上げは一ミリ以内。敷居・足場の高さと引き戸の通りは保つ。
      const edge = .24, floorY = r.y || 0, finishH = .001;
      const finish = (x0, x1, z0, z1, color) => {
        if (x1 <= x0 || z1 <= z0) return;
        if (color === 0x8a6a48) {
          igaFloorBoards(g, x0, x1, z0, z1, floorY + finishH, finishH, color, r.x0 + edge);
          return;
        }
        const across = x1 - x0 > z1 - z0;
        const board = igaBoard(g, across ? z1 - z0 : x1 - x0, finishH,
          across ? x1 - x0 : z1 - z0,
          floorY + finishH / 2, color);
        if (across) board.rotation.y = Math.PI / 2;
        board.position.x = (x0 + x1) / 2;
        board.position.z = (z0 + z1) / 2;
      };
      // 入口の板の木口も前後の板寄せで受ける。側面だけに横木があると、
      // 床板が正面の壁や座敷の上がり口へ直接突き当たっていた。
      // 戸の敷居より低い既存の仕上げ厚で納め、足場・開口・溝は保つ。
      const endEdge = Math.min(edge, (r.z1 - r.z0) / 3);
      finish(r.x0 + edge, r.x1 - edge, r.z0 + endEdge, r.z1 - endEdge, 0x8a6a48);
      for (const z0 of [r.z0, r.z1 - endEdge])
        finish(r.x0 + edge, r.x1 - edge, z0, z0 + endEdge, 0x604831);
      for (const side of [-1, 1]) {
        const x0 = side < 0 ? r.x0 : r.x1 - edge;
        finish(x0, x0 + edge, r.z0, r.z1, 0x604831);
      }
      // 館の入口も土壁の足元を地覆で納め、座敷だけに横木がある造りにしない。
      // 外周柱の室内面より壁側へ置き、障子の敷居の手前で止める。
      // 正面の外戸やその引きしろへは渡さず、共通の箱形・木材を使う。
      const startZ = r.z0 + .24, endZ = r.z1 - .08;
      // 入口の地覆も座敷・柱と同じ木肌へそろえ、長手へ木目を通す。
      // 短い横木の幅から向きを決めず、奥行き方向の材として回す。
      // 元の外寸・高さを保ち、共有する原形と材質を室内の束へ納める。
      if (endZ > startZ) for (const x of [r.x0 + .1, r.x1 - .1]) {
        const timber = igaBoard(g, .04, endZ - startZ, .08,
          floorY + .04, 0x604831);
        timber.rotation.x = Math.PI / 2;
        timber.position.x = x;
        timber.position.z = (startZ + endZ) / 2;
      }
    }
    if (r.floor === 'tatami') {
      if (layout.profile !== 'iga') {
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
      } else {
      // 造り付けの床の間へ畳・畳寄せ・地覆を潜り込ませない。
      // 設営時だけ外形で切り分け、床下の板と歩く足場はそのまま支えに使う。
      const alcoves = layout.profile === 'iga' && layout.kind === 'yashiki'
        ? layout.props.filter(p => p.part === 'alcove') : [];
      const outsideAlcoves = (x0, x1, z0, z1) => {
        let pieces = [[x0, x1, z0, z1]];
        for (const p of alcoves) {
          // 壁際の床の間は柱筋まで造り付けとして扱う。
          // 調度の外寸だけで畳を切ると、背面と壁の数センチの隙間にも
          // 細長い畳ができる。畳寄せの幅より狭い余白は座敷へ含めない。
          const edge = .24;
          const a = p.x - p.w / 2 - r.x0 <= edge ? r.x0 : p.x - p.w / 2;
          const b = r.x1 - p.x - p.w / 2 <= edge ? r.x1 : p.x + p.w / 2;
          const c = p.z - p.d / 2 - r.z0 <= edge ? r.z0 : p.z - p.d / 2;
          const d = r.z1 - p.z - p.d / 2 <= edge ? r.z1 : p.z + p.d / 2;
          pieces = pieces.flatMap(([l, r, n, s]) => {
            if (a >= r || b <= l || c >= s || d <= n) return [[l, r, n, s]];
            return [[l, Math.max(l, a), n, s], [Math.min(r, b), r, n, s],
              [Math.max(l, a), Math.min(r, b), n, Math.max(n, c)],
              [Math.max(l, a), Math.min(r, b), Math.min(s, d), s]];
          }).filter(([l, r, n, s]) => r - l > .002 && s - n > .002);
        }
        return pieces;
      };
      const floorWood = (w, h, d, x, y, z) => {
        for (const [l, r, n, s] of outsideAlcoves(x - w / 2, x + w / 2, z - d / 2, z + d / 2)) {
          // 畳寄せと地覆も板間・床框と同じ木肌で納める。
          // 床の間で切った後の長短では向きを変えず、元の横木の長手へ木目を通す。
          // 共通の原形・材質を使い、足場と調度の外寸は保つ。
          const across = w > d;
          // 伊賀の畳寄せ・地覆は長い一枚の木肌にせず、継いだ材として納める推定復元。
          // 床の間を避けた後で等分し、端だけ極端に短い材を残さない。
          const length = across ? r - l : s - n;
          const count = layout.profile === 'iga' ? Math.max(1, Math.ceil(length / 2.4)) : 1;
          const pitch = length / count;
          for (let i = 0; i < count; i++) {
            const center = (across ? l : n) + (i + .5) * pitch;
            const wood = igaBoard(g, across ? s - n : r - l, h,
              pitch, y, 0x604831);
            if (across) wood.rotation.y = Math.PI / 2;
            wood.position.x = across ? center : (l + r) / 2;
            wood.position.z = across ? (n + s) / 2 : center;
            // 継ぎ目は上面だけの細い陰。木を離して床へ穴を開けず、既存の束へまとめる。
            if (i) box(g, across ? .002 : r - l, .001, across ? s - n : .002,
              across ? center - pitch / 2 : (l + r) / 2, y + h / 2,
              across ? (n + s) / 2 : center - pitch / 2, 0x4a3828);
          }
        }
      };
      let z0 = r.z0, z1 = r.z1;
      if (partitions && layout.profile === 'iga' && layout.kind === 'yashiki') {
        // 座敷の境には幅四十八センチの敷居がある。畳と畳寄せを
        // その木の内側へ重ねず、敷居の側面で止める。床下の板と足場は保つ。
        for (const p of layout.portals) {
          if (Math.abs(p.z - r.z0) < .01) z0 = r.z0 + .24;
          if (Math.abs(p.z - r.z1) < .01) z1 = r.z1 - .24;
        }
      }
      const igaTatami = layout.profile === 'iga' && layout.kind === 'yashiki';
      // 外周柱の室内面は壁際から二十三センチ。十センチの畳寄せでは
      // 畳と縁が柱の中へ入り込むため、柱筋まで板敷きで納める推定復元。
      // 間仕切り側は既存の敷居際を保ち、奥壁側だけ同じ柱筋へそろえる。
      const sideInset = igaTatami ? .24 : .1;
      const outerZ0 = igaTatami ? Math.min(...layout.rooms.map(v => v.z0)) : null;
      const backInset = igaTatami && Math.abs(r.z0 - outerZ0) < .01 ? .24 : .1;
      const tileX0 = r.x0 + sideInset, tileX1 = r.x1 - sideInset;
      const tileZ0 = z0 + backInset, tileZ1 = z1 - .1;
      if (igaTatami) {
        // 畳の外周の余白は畳寄せで納める。畳と同じ上端にそろえ、
        // 入口や襖の敷居との間に下地の板がむき出しの溝を残さない。
        const floorY = r.y || 0, rw = r.x1 - r.x0, rd = z1 - z0;
        for (const x of [r.x0 + sideInset / 2, r.x1 - sideInset / 2])
          floorWood(sideInset, .06, rd, x, floorY + .03, (z0 + z1) / 2);
        floorWood(rw - sideInset * 2, .06, backInset,
          (r.x0 + r.x1) / 2, floorY + .03, z0 + backInset / 2);
        floorWood(rw - sideInset * 2, .06, .1,
          (r.x0 + r.x1) / 2, floorY + .03, z1 - .05);
        // 館の土壁の足元は、畳寄せの上へ地覆を添えて柱間を納める推定復元。
        // 畳寄せだけでは土壁が畳へ直接突き当たっていた。外周だけに置き、
        // 襖・障子の敷居や引きしろには横木を足さない。共通の箱形と木材を使う。
        const footY = floorY + .1;
        // 地覆は外周柱の見付けより壁側へ納める。座敷境の柱まで伸ばし、
        // 幅広い敷居に合わせて引いた畳の端で横木まで途切れさせない。
        for (const x of [r.x0 + .1, r.x1 - .1])
          floorWood(.04, .08, r.z1 - r.z0 - .16, x, footY, (r.z0 + r.z1) / 2);
        if (Math.abs(r.z0 - outerZ0) < .01)
          floorWood(rw - .16, .08, .04, (r.x0 + r.x1) / 2, footY, r.z0 + .1);
      }
      // 伊賀の一間ほどの浅い座敷は一列に納める。半畳ずらしで端に細片を作らない。
      const rw = tileX1 - tileX0, rd = tileZ1 - tileZ0;
      const fitted = layout.profile === 'iga' && layout.kind === 'yashiki' && rd < 2.2;
      // 一メートルほどの浅い取次は、短辺を奥行きへ向ける。
      // 奥座敷と同じ向きでは約半メートル幅の小畳が十三枚並んでしまう。
      // 二倍ほどの長辺を横へ通し、奥座敷は従来どおり長辺を奥行きへ納める。
      const across = fitted && rd < 1.35;
      const count = Math.max(1, Math.round(rw / (fitted ? across ? rd * 2 : rd / 2 : .9)));
      const tiles = fitted ? Array.from({ length: count }, (_, i) => [tileX0 + (i + .5) * rw / count, (tileZ0 + tileZ1) / 2, rw / count, rd])
        : tatamiTiles(tileX0, tileX1, tileZ0, tileZ1);
      // 床の間を、敷いた畳から後で切り抜くと一枚が細い木口と短い畳に分かれる。
      // 先に床の間を除いた矩形へ分け、それぞれを一畳・半畳の並びで納める。
      // 伊賀の浅い奥座敷だけに使い、床の間の外寸と座敷の足場は保つ。
      const tatamiFloorY = r.y || 0;
      const fittedTiles = fitted && alcoves.length
        ? outsideAlcoves(tileX0, tileX1, tileZ0, tileZ1).flatMap(([l, r, n, s]) => {
          const w = r - l, d = s - n;
          const half = Math.min(w, d) / Math.max(w, d) > .75;
          if (half) {
            // 床の間の手前に残る半畳を長方形へ引き伸ばさない。
            // 正方形を座敷側へ寄せ、床の間側の余りは板で納める推定復元。
            // 床高と歩ける範囲を保ち、畳寄せと同じ共有木材を使う。
            const edge = Math.min(w, d);
            if (d > edge) floorWood(w, .06, d - edge,
              (l + r) / 2, tatamiFloorY + .03, n + (d - edge) / 2);
            if (w > edge) floorWood(w - edge, .06, d,
              r - (w - edge) / 2, tatamiFloorY + .03, (n + s) / 2);
            return [[l + edge / 2, s - edge / 2, edge, edge, false]];
          }
          const across = d < 1.35;
          const count = Math.max(1, Math.round(w / (across ? d * 2 : d / 2)));
          return Array.from({ length: count }, (_, i) =>
            [l + (i + .5) * w / count, (n + s) / 2, w / count, d, across]);
        })
        : alcoves.length ? tiles.flatMap(([cx, cz, w, d]) =>
          outsideAlcoves(cx - w / 2, cx + w / 2, cz - d / 2, cz + d / 2)
            .map(([l, r, n, s]) => [(l + r) / 2, (n + s) / 2, r - l, s - n, across])) : tiles;
      for (const [cx, cz, w, d, plannedAcross = across] of fittedTiles) {
        const x = cx - w / 2, z = cz - d / 2, floorY = r.y || 0;
        // 床の間を避けた半畳は、割り付け前と長短が逆になることがある。
        // 伊賀の館では切り分けた一枚の実寸で縁と織り目の向きを決める。
        // 床の間・畳寄せ・敷居までの外寸は保ち、共通の畳を回して使う。
        const tileAcross = igaTatami ? w > d : plannedAcross;
        // 伊賀の敷き詰めた畳は目地を二ミリに抑える。二センチの板床の溝を残さない。
        // 畳寄せ・敷居まで同じ寸法で納める。
        const joint = layout.profile === 'iga' ? .002 : .02;
        // 畳縁と織り目も長辺に合わせて回す。幅だけを伸ばすと短辺に縁が付く。
        const tw = (tileAcross ? d : w) - joint, td = (tileAcross ? w : d) - joint;
        const turn = tileAcross ? Math.PI / 2 : 0;
        // 伊賀専用の畳を素材の読み込み状態で置き換えない。
        // 半畳も二ミリの目地・一定の縁幅・実寸の織り目でそろえる。
        if (!igaTatami && japanese && addNaibu(kb, 'tatami_floor_modular_a', cx, floorY, cz, tw, .06, td, turn)) continue;
        if (purchased && !layout.profile) kb.add('Floor_Tatami', x, floorY + .035, z + d, 0, w / 2, .12, d / 2);
        else place(g, igaTatami ? igaTatamiPart(tw, td) : tatami(tw, td), cx, cz, turn, floorY);
      }
      }
    } else if (r.floor === 'earth') {
      const floor = box(g, r.x1 - r.x0, .025, r.z1 - r.z0,
        (r.x0 + r.x1) / 2, (r.y || 0) + (villageHome ? -.0125 : .013), (r.z0 + r.z1) / 2,
        layout.profile === 'iga' ? 0xffffff : 0x655847, layout.profile === 'iga' ? 'igaEarth' : '');
      if (layout.profile === 'iga') {
        // 幅の違う小屋でも粒を引き伸ばさない。土間専用の形も寸法ごとに共有し、
        // 共通の箱形の座標は変えず、六十センチごとの同じ土肌を繰り返す。
        const key = `igaEarth:${r.x1 - r.x0}:${r.z1 - r.z0}`;
        if (!shapes.has(key)) {
          const geo = floor.geometry.clone(), p = geo.attributes.position, uv = geo.attributes.uv;
          for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / .6, p.getZ(i) / .6);
          shapes.set(key, geo);
        }
        floor.geometry = shapes.get(key);
      }
      if (villageHome) floor.material = mat(0x655847, 'earth');
    }

      continue;
    }
    // 敷居と外壁の間の細い余白は木で納め、細切れや負の寸法の畳を作らない。
    if (nodaJoinery && r.floor === 'tatami' && (r.x1 - r.x0 <= .2 || r.z1 - r.z0 <= .2)) {
      floorTimber(r.x1 - r.x0, .06, r.z1 - r.z0, (r.x0 + r.x1) / 2,
        (r.y || 0) + .03, (r.z0 + r.z1) / 2, 0x604831);
      continue;
    }
    if (r.floor === 'tatami') {
      const entry = nodaJoinery ? layout.entrySill : null;
      const trimBox = (w, h, d, x, y, z, color) => {
        const rect = [[x - w / 2, x + w / 2, z - d / 2, z + d / 2]];
        for (const [a, b, c, e] of entry ? floorWithout(rect, entry) : rect)
          floorTimber(b - a, h, e - c, (a + b) / 2, y, (c + e) / 2, color, w > d);
      };
      if (nodaJoinery) {
        // 畳を壁・板間・土間へ直接突き付けず、周囲の余白を畳寄せと框で納める。
        // 畳と同じ六センチの高さに収め、引き戸の溝や通り道へ張り出さない。
        // 部屋を作る時だけ共通の箱と材質を使い、調度と一緒に束ねる。
        const rw = r.x1 - r.x0, rd = r.z1 - r.z0, floorY = r.y || 0;
        const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
        if (rw > .2 && rd > .2) {
          for (const x of [r.x0 + .05, r.x1 - .05])
            trimBox(.1, .06, rd, x, floorY + .03, cz, 0x604831);
          for (const z of [r.z0 + .05, r.z1 - .05])
            trimBox(rw - .2, .06, .1, cx, floorY + .03, z, 0x604831);
        }
        // 御影堂の独立柱にも畳寄せを回す推定復元。切り欠きだけの隙間を残さず、
        // 柱と畳の間を幅五センチの木で納める。外陣の床を作る時だけ共通の箱へ束ねる。
        if (layout.kind === 'hondo') for (const p of layout.props) {
          if (p.part !== 'hallPost' || p.x <= r.x0 || p.x >= r.x1 || p.z <= r.z0 || p.z >= r.z1) continue;
          const hw = p.w * .375, hd = p.d * .375, trim = .05;
          for (const side of [-1, 1]) {
            trimBox(trim, .06, (hd + trim) * 2,
              p.x + side * (hw + trim / 2), floorY + .03, p.z, 0x604831);
            trimBox(hw * 2, .06, trim,
              p.x, floorY + .03, p.z + side * (hd + trim / 2), 0x604831);
          }
        }
      }
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
        for (const [z, inset] of [[r.z0 + backInset / 2, backInset], [r.z1 - frontInset / 2, frontInset]]) hieiFloorTimber(width, .06, inset, (r.x0 + r.x1) / 2, yy, z);
        for (const x of [r.x0 + tatamiInset / 2, r.x1 - tatamiInset / 2]) hieiFloorTimber(tatamiInset, .06, depth - backInset - frontInset, x, yy, (r.z0 + backInset + r.z1 - frontInset) / 2);
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
        else place(g, hieiTatamiPart(w - seam, d - seam, hieiTatami), cx, cz, rot, floorY);
      }
      } else {
      // 野田福島の座敷は畳寄せの内寸で割り付ける。固定寸法で端を切ると、
      // 詰所では細長い切れ端、僧坊では描かれない細い隙間が残る。
      // 京間を目安に列と段の寸法を揃え、半畳ずらしの端も半畳で納める。
      const rw = r.x1 - r.x0 - .2, rd = r.z1 - r.z0 - .2;
      // 幅と奥行きを別々に丸めると、僧坊の浅い座敷などで畳が細長くなる。
      // 列数・段数を前後一つずつ比べ、京間の寸法と一対二の比へ近づける。
      // 縦横の向きも下で比べる。生成時だけ計算し、畳寄せと切り欠きは保つ。
      const fit = (width, depth) => {
        const columns = Math.max(1, Math.round(width / .955));
        const rows = Math.max(1, Math.round(depth / 1.91));
        const measure = (nx, nz) => {
          const tw = width / nx, td = depth / nz;
          return { tw, td, score: Math.abs(Math.log(tw / .955))
            + Math.abs(Math.log(td / 1.91)) + Math.abs(Math.log(td / (2 * tw))) };
        };
        // 同点なら従来の割りを使い、必要のない細分化は避ける。
        let best = measure(columns, rows);
        for (let nx = Math.max(1, columns - 1); nx <= columns + 1; nx++)
          for (let nz = Math.max(1, rows - 1); nz <= rows + 1; nz++) {
            const candidate = measure(nx, nz);
            if (candidate.score < best.score - 1e-6) best = candidate;
          }
        return best;
      };
      const straight = nodaJoinery ? fit(rw, rd) : { tw: .9, td: 1.8 };
      const turned = nodaJoinery ? fit(rd, rw) : null;
      const rotate = turned && turned.score < straight.score;
      const { tw, td } = rotate ? turned : straight;
      // 御影堂の畳の外陣は列を通す敷き方で推定復元する。
      // 座敷の半畳ずらしを堂へ流用せず、畳寄せの内寸で全列を同じ割りにする。
      // 柱際の切り欠き・敷居の除外は下の共通処理を使う。
      const stagger = !(nodaJoinery && layout.kind === 'hondo');
      const tiles = rotate
        ? tatamiTiles(r.z0 + .1, r.z1 - .1, r.x0 + .1, r.x1 - .1, tw, td, stagger)
        : tatamiTiles(r.x0 + .1, r.x1 - .1, r.z0 + .1, r.z1 - .1, tw, td, stagger);
      // 高の畳は二センチの溝を残さず、四ミリの目地で寄せる。
      // 柱際・敷居際の切り欠きにも同じ余白を使い、畳縁の幅は保つ。
      const joint = nodaJoinery ? .002 : .01;
      for (const [a, b, w, d] of tiles) {
        const cx = rotate ? b : a, cz = rotate ? a : b, rot = rotate ? Math.PI / 2 : 0;
        const x = cx - w / 2, z = cz - d / 2, floorY = r.y || 0;
        // 御影堂の独立柱は床下から立つ。柱際の畳だけ切り欠き、
        // 畳表と縁を柱へ貫通させない。畳の向きへ座標を戻して同じ口で切る。
        const posts = nodaJoinery && layout.kind === 'hondo' ? layout.props.filter(p => p.part === 'hallPost'
          && Math.abs(p.x - cx) < (rotate ? d : w) / 2 + p.w * .375 + .05
          && Math.abs(p.z - cz) < (rotate ? w : d) / 2 + p.d * .375 + .05) : [];
        const holes = posts.map(p => ({ x0: p.x - p.w * .375 - .05, x1: p.x + p.w * .375 + .05,
          z0: p.z - p.d * .375 - .05, z1: p.z + p.d * .375 + .05 }));
        if (entry && entry.x0 < cx + (rotate ? d : w) / 2 && entry.x1 > cx - (rotate ? d : w) / 2
          && entry.z0 < cz + (rotate ? w : d) / 2 && entry.z1 > cz - (rotate ? w : d) / 2) holes.push(entry);
        if (holes.length) {
          const mat = new THREE.Group();
          const cutBox = (left, right, back, front, height, color, texture) => {
            let pieces = [[left, right, back, front]];
            for (const hole of holes) {
              // 回した畳も同じ敷居・柱の範囲で抜き、元の長辺の縁を保つ。
              pieces = floorWithout(pieces, rotate
                ? { x0: cz - hole.z1, x1: cz - hole.z0, z0: hole.x0 - cx, z1: hole.x1 - cx }
                : { x0: hole.x0 - cx, x1: hole.x1 - cx, z0: hole.z0 - cz, z1: hole.z1 - cz });
            }
            for (const [x0, x1, z0, z1] of pieces) {
              const m = box(mat, x1 - x0, height, z1 - z0,
                (x0 + x1) / 2, height / 2, (z0 + z1) / 2, color, texture);
              if (!nodaJoinery || x0 === left && x1 === right && z0 === back && z1 === front) continue;
              // 柱・敷居で切った断片へ畳表一枚分の絵を縮め直さない。
              // 回して敷いた畳も、切る前の表と縁の位置から織り目を続ける。
              // 寸法と切り位置ごとに形を共有し、室内を組む時だけ計算する。
              const key = `tatamiCut:${texture}:${height}:${left}:${right}:${back}:${front}:${x0}:${x1}:${z0}:${z1}`;
              if (!shapes.has(key)) {
                const geometry = m.geometry.clone(), uv = geometry.attributes.uv;
                const scaleX = texture === 'tatamiBorder' ? .128 : right - left;
                const scaleZ = texture === 'tatamiBorder' ? .128 : front - back;
                for (let i = 8; i < 16; i++) {
                  const border = texture === 'tatamiBorder';
                  uv.setXY(i, uv.getX(i) * (border ? 1 : (x1 - x0) / scaleX) + (x0 - left) / scaleX,
                    uv.getY(i) * (border ? 1 : (z1 - z0) / scaleZ)
                      + (i < 12 ? front - z1 : z0 - back) / scaleZ);
                }
                shapes.set(key, geometry);
              }
              m.geometry = shapes.get(key);
            }
          };
          const borderInset = nodaJoinery ? .044 : 0;
          cutBox(-w / 2 + joint + borderInset, w / 2 - joint - borderInset,
            -d / 2 + joint, d / 2 - joint, .06, 0xffffff, 'tatami');
          // 切り欠きの途中へ新しい畳縁を足さず、元の長辺の縁だけ残す。
          for (const side of [-1, 1]) {
            const edge = side * (w / 2 - joint - .022);
            cutBox(edge - .022, edge + .022, -d / 2 + joint, d / 2 - joint, nodaJoinery ? .06 : .066,
              nodaJoinery ? 0xffffff : 0x1d1c18, nodaJoinery ? 'tatamiBorder' : '');
          }
          place(g, mat, cx, cz, rot, floorY);
          continue;
        }
        // 野田福島の高は、切り欠きのある畳もない畳も同じ無紋の織布で納める。
        // 共用の形・材質を使い、購入部品で畳縁を上書きしない。
        if (!nodaJoinery && japanese && addNaibu(kb, 'tatami_floor_modular_a', cx, floorY, cz, w - .02, .06, d - .02, rot)) continue;
        if (purchased && !layout.profile) kb.add('Floor_Tatami', x, floorY + .035, z + d, 0, w / 2, .12, d / 2);
        else place(g, tatami(w - joint * 2, d - joint * 2, nodaJoinery), cx, cz, rot, floorY);
      }
      }
    } else if (nodaJoinery && r.floor === 'boards') {
      // 板間は部屋ごとに割り付ける。共通の箱・材質を使い、室内の生成時に一束へまとめる。
      // 薄い板床と周囲の框は敷居の溝より低くし、引き戸の下端を塞がない。
      const rw = r.x1 - r.x0, rd = r.z1 - r.z0, floorY = r.y || 0;
      const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
      if (floorY > 0) {
        // 蔵・物置の上げ床は四周の框で板端と床下を納める推定復元。
        // 土間との境も同じ床高で受け、薄い床板だけを宙へ浮かせない。
        // 横框を通し、側框は内面で止めて四隅の面を重ねない。
        const trim = Math.min(.1, rw / 4, rd / 4);
        for (const z of [r.z0 + trim / 2, r.z1 - trim / 2])
          floorTimber(rw, floorY, trim, cx, floorY / 2, z, 0x604831);
        for (const x of [r.x0 + trim / 2, r.x1 - trim / 2])
          floorTimber(trim, floorY, rd - trim * 2, x, floorY / 2, cz, 0x604831);
      }
      // 民家の囲炉裏の灰床へ板を張らない。炉縁の内側だけを抜き、
      // 床板の継ぎ目も同じ口で切る。形と材質は既存の箱を共有する。
      const hearth = layout.kind === 'minka' ? layout.props.find(p => p.part === 'hearth') : null;
      // 御影堂の内陣も柱は床下から立つ。外陣の畳と同じく、
      // 柱際の床板を切り欠いて木の寄せ材で納める。板の目地も柱へ通さない。
      const posts = layout.kind === 'hondo' ? layout.props.filter(p => p.part === 'hallPost'
        && p.x > r.x0 && p.x < r.x1 && p.z > r.z0 && p.z < r.z1) : [];
      const holes = posts.map(p => ({ x0: p.x - p.w * .375 - .05, x1: p.x + p.w * .375 + .05,
        z0: p.z - p.d * .375 - .05, z1: p.z + p.d * .375 + .05 }));
      if (hearth) holes.push({ x0: hearth.x - hearth.w * .4, x1: hearth.x + hearth.w * .4,
        z0: hearth.z - hearth.d / .7 * .27, z1: hearth.z + hearth.d / .7 * .27 });
      const floorBox = (w, h, d, x, y, z, color, grain = false, timber = false) => {
        let pieces = [[x - w / 2, x + w / 2, z - d / 2, z + d / 2]];
        for (const hole of holes) pieces = pieces.flatMap(([x0, x1, z0, z1]) => {
          const a = Math.max(x0, hole.x0), b = Math.min(x1, hole.x1);
          const c = Math.max(z0, hole.z0), e = Math.min(z1, hole.z1);
          if (a >= b || c >= e) return [[x0, x1, z0, z1]];
          return [[x0, a, z0, z1], [b, x1, z0, z1], [a, b, z0, c], [a, b, e, z1]]
            .filter(v => v[1] > v[0] && v[3] > v[2]);
        });
        for (const [left, right, back, front] of pieces) {
          if (timber) {
            // 炉・柱・敷居で短く切っても、元の框の長手へ木目を保つ。
            floorTimber(right - left, h, front - back, (left + right) / 2, y,
              (back + front) / 2, color, w > d);
            continue;
          }
          const m = box(g, right - left, h, front - back, (left + right) / 2, y, (back + front) / 2,
            color, grain ? 'floorWood' : '');
          if (grain && (right - left < w - .0001 || front - back < d - .0001)) {
            // 炉・柱で切り欠いても木目の起点を元の板へ戻す。
            // 形は変更せず、同じ寸法・切り位置の部品を使い回す。
            const key = `floorCut:${w}:${h}:${d}:${left - x}:${right - x}:${back - z}:${front - z}`;
            if (!shapes.has(key)) {
              const geometry = m.geometry.clone(), uv = geometry.attributes.uv;
              for (let i = 8; i < 16; i++) {
                const top = i < 12;
                uv.setXY(i, uv.getX(i) + (left - x + w / 2) / .3,
                  uv.getY(i) + (top ? z + d / 2 - front : back - z + d / 2) / 1.8);
              }
              shapes.set(key, geometry);
            }
            m.geometry = shapes.get(key);
          }
        }
      };
      // 框の下へ同じ高さの床面を重ねると、板間の四周がちらつく。
      // 床板は框の内面で止め、細い端の床だけは一枚で納める。
      const framed = rw > .2 && rd > .2;
      if (!framed) floorBox(rw, .018, rd, cx, floorY + .009, cz, 0x8a6a48, true);
      for (const p of posts) {
        const hw = p.w * .375, hd = p.d * .375, trim = .05;
        for (const side of [-1, 1]) {
          floorTimber(trim, .018, (hd + trim) * 2,
            p.x + side * (hw + trim / 2), floorY + .009, p.z, 0x604831);
          floorTimber(hw * 2, .018, trim,
            p.x, floorY + .009, p.z + side * (hd + trim / 2), 0x604831);
        }
      }
      if (framed) {
        const x0 = r.x0 + .1, x1 = r.x1 - .1, z0 = r.z0 + .1, z1 = r.z1 - .1;
        const count = Math.max(1, Math.round((x1 - x0) / .3)), width = (x1 - x0) / count;
        for (let i = 0; i < count; i++) {
          // 一枚床へ盛った黒い線を貼らず、厚さ十八ミリの床板を実際に割る。
          // 長手の目地は四ミリ、木口は三ミリ。短辺の継ぎ目は隣列とずらす。
          // 端は框へ隙間なく納め、炉・丸柱の切り欠きも同じ口で作る。
          // 元の目地用の箱を床板へ替え、共有材質と室内の結合を使う。
          const left = x0 + i * width + (i ? .002 : 0);
          const right = x0 + (i + 1) * width - (i + 1 < count ? .002 : 0);
          let back = z0, joint = z0 + (i % 2 ? .9 : 1.8);
          while (back < z1) {
            // 框際に十センチ未満の端材を残さず、最後の一枚へまとめる。
            const end = joint < z1 - .1 ? joint : z1;
            const a = back + (back > z0 ? .0015 : 0);
            const b = end - (end < z1 ? .0015 : 0);
            floorBox(right - left, .018, b - a, (left + right) / 2,
              floorY + .009, (a + b) / 2, 0x8a6a48, true);
            back = end; joint += 1.8;
          }
        }
        for (const x of [r.x0 + .05, r.x1 - .05])
          floorBox(.1, .018, rd, x, floorY + .009, cz, 0x604831, false, true);
        for (const z of [r.z0 + .05, r.z1 - .05])
          floorBox(rw - .2, .018, .1, cx, floorY + .009, z, 0x604831, false, true);
      }
    } else if (r.floor === 'earth') box(g, r.x1 - r.x0, .025, r.z1 - r.z0,
      (r.x0 + r.x1) / 2, (r.y || 0) + (nodaJoinery ? .0125 : .013), (r.z0 + r.z1) / 2,
      0x655847, nodaJoinery ? 'earthFloor' : '');
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
  // 天井の高い堂・広間は、戸の高さ（約2.3m）で鴨居を通し、上は小壁にする（六メートルの襖を立てない）
  // 低い用屋の桁の下端（天井から二十七センチ）より戸を低くする。
  const temple = ['hondo', 'chudo', 'temple'].includes(layout.kind), ph = inaba ? Math.min(2.3, h - (inabaHigh && ['kura', 'bansho', 'nagaya', 'shrine'].includes(layout.kind) ? .4 : .2)) : layout.profile === 'iga' ? Math.min(2.05, h - .2) : nodaJoinery ? nodaDoorHeight(h) : layout.profile === 'hieizan' ? hieiPartitionHeight(layout.kind, h) : h > 3 ? 2.3 : h;
  // 御影堂・僧坊・庫裏の境は鴨居の上まで一枚壁にしない。欄間の意匠は不明のため、
  // 彫刻や紋を足さず、木枠と透かし格子の推定復元。戸の動く高さは保つ。
  // 僧坊の襖・障子の上も同じ木組みで納め、長押は格子の上へそろえる。
  // 庫裏も炊事の土間と座敷の間に透かしを残す推定復元。障子と引き代は保つ。
  const ranma = nodaJoinery && ['hondo', 'sobo', 'kuri'].includes(layout.kind) && h - ph > 1;
  // 用屋の固定壁も板戸と同じく縦板を接ぐ。目地を黒い棒で貼らず、
  // 表裏を浅く落として中央の実を残す。袖と鴨居上の小壁で共用し、
  // 元の板・目地と同じ箱の数で、当たりの厚みと遮光を保つ。
  // 固定の袖・小壁も動く板戸と同じ縦の木肌で仕上げる。
  // 浅く落とした実にも同じ木目を通し、無地の帯を板の継ぎ目へ残さない。
  const boardedPanel = (parent, width, height, depth, x, y, z) => {
    const count = Math.max(1, Math.ceil(width / .3)), step = width / count, joint = .008;
    for (let i = 0; i < count; i++) {
      const edge = x - width / 2 + step * i;
      const left = edge + (i ? joint / 2 : 0);
      const right = edge + step - (i + 1 < count ? joint / 2 : 0);
      box(parent, right - left, height, depth, (left + right) / 2, y, z, 0x795b3b, 'doorWood');
      if (i) box(parent, joint, height, depth - .012, edge, y, z, 0x795b3b, 'doorWood');
    }
  };
  const partitionTop = (parent, width, x, z, color, boarded = false, posts = null) => {
    const finish = nodaJoinery && !boarded ? 'plasterWall' : '';
    const bottom = ph + .1, top = ranma ? ph + .7 : bottom;
    // 野田福島の間仕切りは柱頭を受ける桁の下面で小壁を止める。
    // 天井まで一枚で張ると高さ二十二センチの桁を壁板が貫通する。
    // 欄間・鴨居・引き戸の高さはそのまま、固定の壁板と目地だけを納める。
    const wallTop = nodaJoinery ? h - .27 : h;
    // 桁の上端から天井までの五センチは別の埋木で閉じ、隙間を残さない。
    if (nodaJoinery) box(parent, width, .05, .06, x, h - .025, z, color, 'doorWoodCross');
    // 欄間と小壁も建具と同じ柱の内面で止める。通し材のままでは
    // 格子・横桟・壁板が柱身を貫通し、柱際へ半端な格子が残る。
    // 柱頭より上の埋木は通し、柱のある高さだけ生成時に切り分ける。
    let spans = [[x - width / 2, x + width / 2]];
    if (posts) for (const px of posts.positions) {
      const left = px - posts.width / 2, right = px + posts.width / 2;
      spans = spans.flatMap(([a, b]) => right <= a || left >= b ? [[a, b]]
        : [[a, Math.max(a, left)], [Math.min(b, right), b]].filter(([a, b]) => b - a > .001));
    }
    for (const [left, right] of spans) {
      const width = right - left, x = (left + right) / 2;
      if (ranma) {
        // 欄間は上下だけでなく左右も框で受け、細い格子を枠の代わりにしない。
        // 柱の内面に納め、格子と中桟の木口を框の内面で止める推定復元。
        // 縦横の木目は建具と共用し、静止した内装の束へ生成時だけ加える。
        const frame = Math.min(.06, width / 3), innerLeft = left + frame, innerRight = right - frame;
        for (const yy of [bottom + .03, top - .03])
          box(parent, width, .06, .08, x, yy, z, 0x2a1c12, 'doorWoodCross');
        for (const xx of [left + frame / 2, right - frame / 2])
          box(parent, frame, top - bottom - .12, .08, xx, (bottom + top) / 2, z, 0x2a1c12, 'doorWood');
        const count = Math.max(1, Math.ceil((innerRight - innerLeft) / .25));
        const step = (innerRight - innerLeft) / count;
        for (let i = 1; i < count; i++)
          box(parent, .025, top - bottom - .12, .035,
            innerLeft + step * i, (bottom + top) / 2, z, 0x2a1c12, 'doorWood');
        // 横桟の木口は縦桟の内面で受ける。交差部に同じ表裏の面を重ねない。
        // 既存の箱と材質を共用し、内装を生成する時だけ一束へ結合する。
        for (let i = 0; i < count; i++) {
          const left = innerLeft + step * i + (i ? .0125 : 0);
          const right = innerLeft + step * (i + 1) - (i + 1 < count ? .0125 : 0);
          if (right > left) box(parent, right - left, .025, .035,
            (left + right) / 2, (bottom + top) / 2, z, 0x2a1c12, 'doorWoodCross');
        }
      }
      if (wallTop > top) {
        if (boarded) {
          boardedPanel(parent, width, wallTop - top, .06, x, (wallTop + top) / 2, z);
        } else if (nodaJoinery && wallTop - top >= .55) {
          // 高い小壁を一枚の塗り板にせず、横貫と間柱で受ける推定復元。
          // 既存の柱間・桁下で割り、塗り壁を木の表面へ重ねない。
          // 欄間と戸の引き代は保ち、共通の箱・木肌を生成時だけ束ねる。
          const mid = (top + wallTop) / 2, timber = .045;
          box(parent, width, timber, .075, x, mid, z, 0x795b3b, 'doorWoodCross');
          const stud = width >= 1.1 ? timber : 0;
          for (const [low, high] of [[top, mid - timber / 2], [mid + timber / 2, wallTop]]) {
            if (stud) box(parent, stud, high - low, .075, x, (low + high) / 2, z, 0x795b3b, 'doorWood');
            const panels = stud ? [[left, x - stud / 2], [x + stud / 2, right]] : [[left, right]];
            for (const [a, b] of panels)
              box(parent, b - a, high - low, .06, (a + b) / 2, (low + high) / 2, z, color, finish);
          }
        } else box(parent, width, wallTop - top, .06, x, (wallTop + top) / 2, z, color, finish);
      }
    }
  };
  // 固定の襖・障子・格子も、動く戸と同じ敷居から鴨居までに納める。
  // 畳際は六センチ、板間は二・八センチ。敷居へ下框を埋め込まない。
  const sillAt = (x, z) => layout.rooms.some(r => r.floor === 'tatami' && x >= r.x0 && x <= r.x1
    && (Math.abs(r.z0 - z) < .01 || Math.abs(r.z1 - z) < .01)) ? .06 : .028;
  const hieiHall = layout.profile === 'hieizan' && ['hondo', 'chudo'].includes(layout.kind);
  // 比叡山の僧坊は竿縁天井まで戸を伸ばさず、二メートルの建具の上に鴨居・小壁を納める。
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
  const hieiPartitionTop = (top, len, postInset = 0) => {
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
  const igaHouse = layout.profile === 'iga' && layout.kind === 'yashiki';
  const iga = layout.profile === 'iga';
  // 伊賀の間仕切りも外周柱・建具と同じ木肌で組む。
  // 鴨居・敷居・長押は横、戸口柱は縦に木目を通す。
  // 寸法と溝・当たりを保ち、共有の原形を既存の静止した束へまとめる。
  const partitionTimber = (top, w, hh, d, x, y, z, color, horizontal = true) =>
    iga ? igaDoorTimber(top, w, hh, d, x, y, z, color, horizontal)
      : box(top, w, hh, d, x, y, z, color);
  // 板壁の民家・陣小屋・番所は間仕切りの上も板で納め、館の土壁と作り分ける。
  const igaBoardWall = iga && ['minka', 'nagaya', 'bansho'].includes(layout.kind);
  const upperWallColor = igaBoardWall ? 0x795b3b : ['hondo', 'chudo', 'temple'].includes(layout.kind) ? 0xbdb39a : 0xcfc6b0;
  // 伊賀の小壁の骨組み。横木と束の木目を長手へ通し、束の両端を
  // 頭つなぎ・長押へ差して込栓で留める推定復元。単色の棒の突き合わせを残さない。
  // 戸の溝より上だけで組み、既存の箱形・木肌を共有して静止した束へまとめる。
  const upperFrame = (top, len, capH, capD, studW, bay) => {
    igaDoorTimber(top, len, capH, capD, 0, h - capH / 2, 0, 0x3a2a1c, true);
    const bottom = ph + .19, studH = h - capH - bottom;
    if (studH <= .01) return;
    const bays = Math.max(1, Math.ceil(len / bay));
    const tenon = Math.min(.04, capH / 3);
    for (let j = 0; j <= bays; j++) {
      const x = -len / 2 + studW / 2 + j * (len - studW) / bays;
      igaDoorTimber(top, studW, studH, .12, x, bottom + studH / 2, 0, 0x3a2a1c);
      for (const [jointY, pegY, depth] of [
        [bottom, bottom - tenon / 2, .14],
        [h - capH, h - capH + tenon / 2, capD],
      ]) {
        igaDoorTimber(top, studW * .5, tenon, .06, x, pegY, 0, 0x3a2a1c);
        for (const side of [-1, 1]) {
          box(top, studW, .003, .003, x, jointY, side * .0615, 0x211a14);
          box(top, .014, .014, .008, x, pegY, side * (depth / 2 + .003), 0x98774d);
        }
      }
    }
  };
  // 戸口の上と両脇で同じ板張りを使う。設営時に既存の室内の束へまとめる。
  const upperWall = (top, len) => {
    const height = h - ph - .1, centerY = ph + .1 + height / 2;
    // 伊賀の板壁は戸口の上まで縦の木目を通す。土壁には板肌を掛けない。
    // 板戸・板間と同じ実寸の原形と材質を使い、目地だけの単色面を残さない。
    if (igaBoardWall) igaBoard(top, len, height, .06, centerY, upperWallColor);
    else if (igaHouse) igaPlaster(top, len, height, .06, 0, centerY, 0, upperWallColor);
    else box(top, len, height, .06, 0, centerY, 0, upperWallColor);
    if (igaHouse) {
      // 長田丸・朝屋丸の館の小壁も、上端を頭つなぎで受ける推定復元。
      // 土壁だけを天井へ突き当てず、柱・鴨居から束を立てて横木へ結ぶ。
      // 板壁の細かな縦材とは分け、柱間を一間程度に納める。
      // 襖・障子の溝より上で、共通の箱形・材質を静止した束へまとめる。
      upperFrame(top, len, Math.min(.12, height), .14, .08, 1.8);
    }
    if (!igaBoardWall) return;
    const count = Math.max(1, Math.ceil(len / .18));
    for (let j = 1; j < count; j++) for (const side of [-1, 1])
      box(top, .006, height, .004, -len / 2 + j * len / count,
        centerY, side * .031, 0x4a3828);
    // 吹き抜けに見える間仕切りの板端を頭つなぎで受け、長押から縦材を渡す。
    // 戸口の上も同じ横木でつなぐ推定復元。引き戸の鴨居・溝より上に納め、
    // 共通の箱形と木材を使って静止した室内の束へまとめる。
    upperFrame(top, len, Math.min(.14, height), .16, .06, .9);
  };

  if (partitions) for (const v of layout.walls) {
    if (v.guideOnly) continue;
    const sill = hieiSobo ? HIEI_SOBO_SILL : .04;
    const len = Math.hypot(v.bx - v.ax, v.bz - v.az);
    if (inaba) {
      const inabaUtility = ['kura', 'bansho', 'nagaya', 'shrine'].includes(layout.kind);
      const inabaShrine = layout.kind === 'shrine';
      const spans = Math.max(1, Math.round(len / 1.8));
      const pairedFusuma = inabaHigh && v.paper && !temple && v.kind !== 'shoji' && v.kind !== 'koshi';
      const pairedShoji = inabaHigh && v.paper && v.kind === 'shoji';
      const pairedKoshi = inabaHigh && v.paper && (temple || v.kind === 'koshi');
      const pairedTrack = pairedFusuma || pairedShoji || pairedKoshi;
      const framedPaper = pairedTrack;
      const n = pairedTrack ? spans * 2 : Math.max(1, Math.ceil(len / .9));
      const rot = Math.atan2(-(v.bz - v.az), v.bx - v.ax);
      const nageshiY = lowNageshi ? h - .3 : ph + .42;
      const leafBottom = v.sill || 0, leafHeight = ph - leafBottom;
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
            // 座敷の敷居・鴨居も柱へほぞ差しし、両面の込栓で抜けを留める推定。
            // 釘隠しは長押の留め具なので、建具を受ける横木の仕口とは分ける。
            // 固定建具の溝は前後四センチ、可動戸の溝は十二センチ。
            // 栓は柱の表から四ミリだけ出し、どちらの戸の動きにも触れさせない。
            // 既存の箱・木部材へ設営時にまとめ、毎コマの処理を増やさない。
            for (const yy of [(v.sill || 0) - .02, ph + .05]) {
              if (yy < .016) continue;
              for (const side of [-1, 1])
                box(top, .026, .032, .008, x, yy, side * .07, 0x8a6a48, 'inabaBoard');
            }
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
      const sill = v.sill || 0;
      crossTimber(len, .1, .14, h - .05, 0, 0x3a2a1c);
      crossTimber(len, .08, .14, sill + .04, 0, 0x3a2a1c);
      for (let bay = 0; bay < spans; bay++) {
        const a = -len / 2 + len * bay / spans + .1;
        const b = -len / 2 + len * (bay + 1) / spans - .1;
        const count = Math.max(1, Math.ceil((b - a) / .3));
        for (let j = 0; j < count; j++) box(frame, (b - a) / count - .004,
          h - sill - .18, .06, a + (j + .5) * (b - a) / count,
          (h + sill) / 2, 0, 0x795b3b, 'inabaBoard');
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
      // 長島の番所と館の縁側は、動く障子と同じ形・紙で脇の固定戸も揃える。
      if (v.paper && layout.profile === 'nagashima' && (layout.kind === 'bansho' || v.kind === 'shoji')) { place(g, shoji(len / n, ph), x, z, rot); continue; }
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
    continue;
    }
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
    const pairedFusuma = false, leafHeight = ph, leafBottom = 0;
    const fixedRange = igaFixedPanelRange(layout, v);
    const panelStart = inset + fixedRange.start;
    const panelSpan = fixedRange.end - fixedRange.start - inset * 2, n = Math.ceil(panelSpan / .9);
    const rot = Math.atan2(-(v.bz - v.az), v.bx - v.ax);
    const baseY = iga ? (layout.portals.find(p => Math.abs(p.z - v.az) < .01 && Math.abs(p.z - v.bz) < .01)?.y || 0) : 0;
    if (iga) {
      if ((v.paper || iga) && ph < h) {
        const top = new THREE.Group();
        partitionTimber(top, len, .1, iga ? .48 : .12, 0, ph + .05, 0, 0x3a2a1c); // 鴨居は戸の引きしろまで通す
        if (iga) {
          // 上がり口の敷居を宙に浮かせず、土間・板間まで框の木口を下ろす。
          // 敷居の引きしろと同じ幅で支え、共通の箱形と材質へまとめる。
          if (baseY > 0) partitionTimber(top, len, baseY, .48, 0, baseY / 2, 0, 0x604831);
          partitionTimber(top, len, .04, .48, 0, baseY + .02, 0, 0x3a2a1c);
          for (const z of [.11, .185]) {
            box(top, len, .004, IGA_DOOR_GROOVE_W, 0, baseY + .041, z, 0x1a1410);
            box(top, len, .004, IGA_DOOR_GROOVE_W, 0, ph - .001, z, 0x1a1410);
          }
          // 館の固定戸は引きしろの後ろで受ける。動く戸の二本の溝とは別に、
          // 固定戸の下框・上框を納める溝も通し、敷居の平らな面へ立てない。
          if (igaHouse && v.paper) {
            box(top, len, .004, IGA_DOOR_GROOVE_W, 0, baseY + .041, 0, 0x1a1410);
            box(top, len, .004, IGA_DOOR_GROOVE_W, 0, ph - .001, 0, 0x1a1410);
          }
        }
        // 館の長押は柱の両面へ掛ける。柱心へ一本置くと柱に埋まり、
        // 外周の長押から続く表面が間仕切りだけ引っ込んでしまう。
        // 戸の上端より上に納め、引き戸の二本の溝には張り出さない。
        if (igaHouse) for (const face of [-1, 1])
          partitionTimber(top, len, .12, .1, 0, ph + .13, face * .08, 0x2e2016);
        else partitionTimber(top, len, .12, .14, 0, ph + (iga ? .13 : .42), 0, 0x2e2016);
        upperWall(top, len);
        place(g, top, (v.ax + v.bx) / 2, (v.az + v.bz) / 2, rot);
      }
    } else {
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
    if (v.paper && ph < h && !(nodaJoinery && Math.abs(v.az - v.bz) <= .01)) {
      const top = new THREE.Group();
if (layout.profile !== 'hieizan') {
      // 野田福島は下で戸袋側まで通す一本の鴨居と長押を組む。面を重ねない。
      if (!nodaJoinery) {
        box(top, len, .1, .12, 0, ph + .05, 0, 0x3a2a1c);                     // 鴨居
        box(top, len, .12, .14, 0, ph + .42, 0, 0x2e2016);                    // 内法長押
      }
      partitionTop(top, len, 0, 0, temple ? 0xbdb39a : 0xcfc6b0);

} else {
      // 通し柱へ二本溝を彫り抜かず、鴨居本体を柱の内面で止める。
      // 接合は下の枘と込栓で受け、動く戸の溝・開口幅は保つ。
      if (layout.profile === 'hieizan') {
        if (panelSpan > .001) hieiGroovedKamoi(top, panelSpan, ph, .14);
      } else box(top, len, .1, .12, 0, ph + .05, 0, 0x3a2a1c);
      partitionNageshi(top, len);
      hieiPartitionTop(top, len, inset);

}
      place(g, top, (v.ax + v.bx) / 2, (v.az + v.bz) / 2, rot);
    }
    }
    if (nodaJoinery && (v.paper || v.kind === 'itado') && Math.abs(v.az - v.bz) <= .01) {
      // 固定の建具は柱心をまたいで並べず、柱の内面どうしの寸法で納める。
      // 柱割りは絵・当たりと共有し、動く戸の開口と引き込み溝は保つ。
      const posts = nodaPartitionPosts(layout, v), { width, positions } = posts;
      const end = Math.max(v.ax, v.bx), sill = sillAt((v.ax + v.bx) / 2, v.az);
      const panelH = ph - sill;
      let left = Math.min(v.ax, v.bx);
      // 番所・長屋・板倉・民家の袖も柱間へ納める。
      // 建具だけでなく欄間・小壁も同じ柱割りで納める。
      partitionTop(g, len, (v.ax + v.bx) / 2, v.az,
        !v.paper ? 0x795b3b : temple ? 0xbdb39a : 0xcfc6b0, !v.paper, posts);
      const fill = (a, b) => {
        if (b - a <= .08) return;
        if (!v.paper) {
          const span = b - a, cx = (a + b) / 2;
          boardedPanel(g, span, panelH, .08, cx, (ph + sill) / 2, v.az);
          // 用屋の袖壁は土間を板表、板間を裏桟側とする推定復元。
          // 動く板戸と同じ向きにし、北向きの寺務長屋も間取りから表裏を決める。
          // 両面に重ねていた横桟と木栓を片面へまとめ、戸の引き代は保つ。
          const side = layout.rooms.some(r => r.floor === 'boards'
            && cx >= r.x0 && cx <= r.x1 && Math.abs(r.z0 - v.az) < .01) ? 1 : -1;
          for (const height of [.3, ph * .5, ph - .15]) {
            // 桟の両端は柱へ四センチ差し、同じ木肌の材質へ束ねる。
            box(g, span + .08, .07, .035, cx, height, v.az + side * .0575, 0x4a3828, 'doorWoodCross');
            for (const x of [a - .02, b + .02])
              box(g, .018, .025, .008, x, height, v.az + side * .084, 0x795b3b);
          }
          return;
        }
        const count = Math.max(1, Math.ceil((b - a) / .9)), pw = (b - a) / count;
        for (let i = 0; i < count; i++) {
          // 柱間の固定の袖には引手を付けない。狭い袖で引手が框の外へ
          // はみ出すのも避け、開けられる戸だけに手掛かりを残す。
          const panel = temple ? koshi(pw, panelH, true, false)
            : v.kind === 'shoji' ? shoji(pw, panelH, true, ['sobo', 'kuri'].includes(layout.kind), false) : fusuma(pw, panelH, false, true, false);
          const reverse = v.kind === 'shoji' && nodaShojiReverse(layout, v.az);
          place(g, panel, a + pw * (i + .5), v.az, reverse ? Math.PI : 0, sill);
        }
      };
      for (const x of positions.sort((a, b) => a - b)) {
        fill(left, Math.min(end, x - width / 2));
        left = Math.max(left, x + width / 2);
      }
      fill(left, end);
      continue;
    }
    for (let i = 0; i < n; i++) {
      const t = (panelStart + panelSpan * (i + .5) / n) / len;
      const x = v.ax + (v.bx - v.ax) * t, z = v.az + (v.bz - v.az) * t;
if (nodaJoinery) {
      const sill = nodaJoinery && v.paper ? sillAt(x, z) : 0, panelH = ph - sill;
      if (v.paper && temple) { place(g, koshi(len / n, panelH, nodaJoinery, false), x, z, rot, sill); continue; }
      // この戦の僧坊は入口の動く障子と同じ桟・紙で間仕切りを揃える。
      if (v.paper && hiei && layout.kind === 'sobo') { place(g, shoji(len / n, ph), x, z, rot); continue; }
      if (v.paper && (['echizen_ikko', 'nodafukushima'].includes(layout.profile) && layout.kind === 'sobo' || layout.profile === 'nodafukushima' && layout.kind === 'kuri' || ['takato', 'nodafukushima'].includes(layout.profile) && layout.kind === 'goten')) {
        place(g, v.kind === 'shoji' ? shoji(len / n, panelH, nodaJoinery) : fusuma(len / n, panelH, false, nodaJoinery), x, z, rot, sill); continue;
      }

} else {
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
      if (v.paper && igaHouse) {
        // 固定の障子・襖も動く戸と同じ敷居上端へ置く。下框を木の中へ埋めない。
        const panelY = baseY + .04;
        // 引手は各壁片の中央でなく、実際に開閉する戸口の召し合わせへ向ける。
        // 左右の壁片ごとに半数を裏返すと、戸口に接する襖・障子の引手が
        // 逆の端へ付いてしまう。既存の戸口の位置を使い、形と溝は保つ。
        const portal = layout.portals.find(p => Math.abs(p.z - v.az) < .01 && Math.abs(p.z - v.bz) < .01);
        const right = portal && x > portal.x, isShoji = v.kind === 'shoji';
        // 障子は紙を同じ側へ貼る。戸全体を裏返さず、右の戸の指掛けだけを左へ移す。
        const panelRot = rot + (right && !isShoji ? Math.PI : 0);
        place(g, isShoji ? igaShoji(panelSpan / n, ph - panelY, true, right ? -1 : 1) : igaFusuma(panelSpan / n, ph - panelY, false, true), x, z, panelRot, panelY); continue;
      }
      if (v.paper && temple) {
        const sill = layout.profile === 'hieizan' ? .04 : 0;
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
        place(g, hieiFusuma(len / n + overlap, leafHeight, painted, inabaHigh), leafX, leafZ, leafRot, leafBottom);
      }
      else if (iga) {
        // 固定の板壁も動く板戸と同じく、厚さ四センチの敷居の上へ立てる。
        // 敷居下面から組むと、下框の半分が敷居へ埋まり、上下の框の見付けが違っていた。
        const panelY = iga ? baseY + .04 : baseY;
        const wall = new THREE.Group(), wh = iga ? ph - panelY : h;
        // 民家・番所・陣小屋の間仕切りも、開く板戸と同じ木肌で納める。
        // 既存の縦目地・横貫を残し、板の高さが変わっても木目の縮尺は保つ。
        if (igaBoardWall) igaBoard(wall, len / n, wh, .08, wh / 2, 0x795b3b);
        else box(wall, len / n, wh, .08, 0, wh / 2, 0, 0x795b3b);
        // 板戸の両脇も同じ高さの鴨居へ結び、柱と板の押縁を見せる。
        if (iga) {
          // 隣の板壁と同じ柱を二重に立てない。差し口・楔と同じ受け持ちにし、
          // 一つの柱へ両側の横貫を納める。端の柱も一度だけ組む。
          const posts = i === 0 ? [-len / n / 2, len / n / 2] : [len / n / 2];
          // 柱は縦、框と横貫は横へ木目を通し、板壁だけ木肌がある状態をなくす。
          // 鴨居と同じ寸法別の原形・材質を使い、既存の静止した束へ納める。
          for (const px of posts)
            igaDoorTimber(wall, .06, wh, .12, px, wh / 2, 0, 0x3a2a1c);
          // 縦板の木口は下框と上框で受ける推定復元。貫だけでは
          // 板の上下端がむき出しになる。両端を柱へ掛け、可動戸の溝へは出さない。
          for (const yy of [.04, wh - .04])
            igaDoorTimber(wall, len / n, .08, .12, 0, yy, 0, 0x3a2a1c, true);
          // 小屋・番所・民家の板壁は柱間を一枚板にせず、縦板の継ぎ目と
          // 二段の横貫を両面へ見せる。共通の形・材質を使い、設営時に束ねる。
          const count = Math.max(1, Math.ceil(len / n / .18));
          for (let j = 1; j < count; j++) for (const side of [-1, 1])
            box(wall, .006, wh - .16, .004, -len / n / 2 + j * len / n / count,
              wh / 2, side * .041, 0x4a3828);
          for (const yy of [wh / 3, wh * 2 / 3]) {
            igaDoorTimber(wall, len / n, .08, .12, 0, yy, 0, 0x3a2a1c, true);
            // 横貫を柱へ重ねただけにせず、差し口と楔で納める推定復元。
            // 両隣の壁片が柱を共有するので、右端の柱だけに一組を付ける。
            // 左端は最初の壁片が受け持ち、同じ位置の部材を二重に描かない。
            for (const px of posts) for (const side of [-1, 1]) {
              for (const dy of [-.041, .041])
                box(wall, .058, .003, .003, px, yy + dy, side * .0615, 0x211a14);
              // 小さな楔を柱の両面で締める。先端へ細くした原形を使い、
              // 引き戸の溝が始まる奥行きより手前へ収める。
              const wedge = box(wall, .018, .11, .012,
                px + .02, yy + .005, side * .068, 0x795b3b);
              const key = 'igaPartitionWedge';
              if (!shapes.has(key)) {
                const geo = wedge.geometry.clone(), pos = geo.attributes.position;
                for (let j = 0; j < pos.count; j++)
                  if (pos.getY(j) < 0) pos.setZ(j, pos.getZ(j) * .3);
                geo.computeVertexNormals(); shapes.set(key, geo);
              }
              wedge.geometry = shapes.get(key);
            }
          }
        }
        place(g, wall, x, z, rot, panelY);
      }
      else {
        const boarded = nodaJoinery && v.kind === 'itado';
        const bottom = boarded ? sillAt(x, z) : 0, top = boarded ? ph : h;
        const wall = new THREE.Group();
        if (boarded) {
          // 板戸脇の袖は敷居の上から鴨居の下まで。床下から天井までの
          // 一枚板で横木を埋めず、鴨居上の小壁は戸口と同じ納まりにする。
          partitionTop(wall, len / n, 0, 0, 0x795b3b, true);
          // 固定の袖壁も一枚の面へ黒線を貼らず、縦板を接いで組む推定復元。
          // 表裏の継ぎ目だけ六ミリ落とし、中央の実で光を遮る。
          // 元の壁厚・箱の数を保ち、板戸の引き代と当たりは変えない。
          const width = len / n, boards = Math.max(1, Math.ceil(width / .3));
          const step = width / boards, joint = .012, middle = (top + bottom) / 2;
          for (let j = 0; j < boards; j++) {
            const edge = -width / 2 + step * j;
            const left = edge + (j ? joint / 2 : 0);
            const right = edge + step - (j + 1 < boards ? joint / 2 : 0);
            box(wall, right - left, top - bottom, .08,
              (left + right) / 2, middle, 0, 0x795b3b);
            if (j) box(wall, joint, top - bottom, .068,
              edge, middle, 0, 0x795b3b);
          }
          // 桟の外端を八センチ以内に収め、前後十四センチの戸の通り道を空ける。
          for (const side of [-1, 1]) {
            for (const height of [.3, ph * .5, ph - .15])
              box(wall, width, .07, .035, 0, height, side * .0575, 0x4a3828);
          }
        } else box(wall, len / n, top - bottom, .08, 0, (top + bottom) / 2, 0, 0x795b3b);
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
  if (partitions && nodaJoinery && ['hondo', 'sobo', 'kuri', 'goten', 'bansho', 'nagaya', 'kura', 'minka'].includes(layout.kind)) {
    // 内陣の格子、座敷の襖・障子、番所・長屋・板倉の板戸を柱で受ける。
    // 柱は固定の壁の幅に納め、共通の襖・障子が滑る戸口を狭めない。
    // 柱頭は下で組む桁の下面へ突き付ける。天井まで伸ばすと
    // 桁を二十二センチ貫通し、上端が竿縁・格縁にも重なる。
    // 堂と用屋で同じ納まりを使い、静止した形だけを直す。
    const partitionPostH = h - .27;
    for (const v of layout.walls) {
      if (v.guideOnly || Math.abs(v.az - v.bz) > .01) continue;
      const { width, positions } = nodaPartitionPosts(layout, v);
      // 柱は縦、桁・長押は横へ木目を通す。建具と同じ木肌・材質を共有し、
      // 柱割り・戸の引き代・当たりはそのまま、静止した内装の束へまとめる。
      for (const x of positions) {
        box(g, width, partitionPostH, .16, x, partitionPostH / 2, v.az, 0x3a2a1c, 'doorWood');
        // 柱頭を桁へ差す枘を、両面の込栓で留める推定の納まり。
        // 桁の下面へ柱を突き付けただけにせず、受ける柱筋を室内から読めるようにする。
        // 栓の木口だけを桁から四ミリ出し、欄間・長押・建具の溝へは張り出させない。
        // 共通の箱と材質を内装の束へ含め、当たりと毎コマの処理は増やさない。
        // 御影堂は下の桁継ぎに同じ栓があるため重ねない。
        if (layout.kind !== 'hondo') for (const side of [-1, 1]) box(g, .025, .035, .008,
          x, h - .16, v.az + side * .104, 0x95704a);
      }
    }
    // 御影堂の左右の口は同じ柱列。通し材は一組にし、口の上の欄間だけを別々に組む。
    const partitionRows = new Set();
    for (const p of layout.portals) {
      if (partitionRows.has(p.z)) continue;
      partitionRows.add(p.z);
      const rs = layout.rooms, x0 = Math.min(...rs.map(r => r.x0)), x1 = Math.max(...rs.map(r => r.x1));
      // 長押より上の桁で柱列を受ける。部品の箱と材質は共用。
      // 御影堂は側壁の柱の外面で木口を止める。柱心は壁から十六センチ、
      // 柱幅は十四センチ。外壁まで突き出さず、柱頭の全面で桁端を受ける。
      const girderInset = layout.kind === 'hondo' ? .09 : 0;
      const girderLeft = x0 + girderInset, girderRight = x1 - girderInset;
      if (layout.kind === 'hondo') {
        // 御影堂の長い桁は一本の角材にせず、実際の柱上で上下を欠いて継ぐ推定復元。
        // 上下の継ぎ目を柱幅の中でずらし、柱のない戸口の上では継がない。
        // 元の桁の外寸を保ち、鴨居・欄間・引き戸の通り道は変えない。
        const joints = [];
        for (const wall of layout.walls) {
          if (wall.guideOnly || Math.abs(wall.az - p.z) > .01 || Math.abs(wall.bz - p.z) > .01) continue;
          for (const x of nodaPartitionPosts(layout, wall).positions) {
            if (x - girderLeft < .4 || girderRight - x < .4
              || joints.some(j => Math.abs(j - x) < .4)) continue;
            joints.push(x);
          }
        }
        joints.sort((a, b) => a - b);
        for (const upper of [false, true]) {
          let left = girderLeft;
          const yy = h - (upper ? .105 : .215);
          for (const x of joints) {
            const end = x + (upper ? .06 : -.06);
            box(g, end - .001 - left, .11, .2, (left + end - .001) / 2, yy, p.z, 0x3a2a1c, 'doorWoodCross');
            left = end + .001;
          }
          box(g, girderRight - left, .11, .2, (left + girderRight) / 2, yy, p.z, 0x3a2a1c, 'doorWoodCross');
        }
        // 重ねた継手を留める木栓の木口だけを両面へ見せる。
        // 既存の箱と木の材質で束ね、毎コマの処理や当たりは増やさない。
        for (const x of joints) for (const side of [-1, 1])
          box(g, .025, .035, .008, x, h - .16, p.z + side * .104, 0x795b3b);
      } else box(g, girderRight - girderLeft, .22, .2, (x0 + x1) / 2, h - .16, p.z, 0x3a2a1c, 'doorWoodCross');
      // 板戸にも鴨居・敷居と戸口上の板を付け、天井まで伸びた戸にしない。
      // 二本の溝は柱の手前と奥を通る。引き込んだ戸を柱へ食い込ませない。
      // 畳寄せと同じ六センチの敷居に納め、動く戸の下框が畳へ沈まないようにする。
      // naka_doors.js の戸の下端と同じ部屋境界・寸法を使う。
      const sill = sillAt(p.x, p.z);
      box(g, x1 - x0, .088, .4, (x0 + x1) / 2, ph + .056, p.z, 0x3a2a1c, 'doorWoodCross');
      box(g, x1 - x0, sill, .4, (x0 + x1) / 2, sill / 2, p.z, 0x3a2a1c, 'doorWoodCross');
      // 動く襖・障子・格子戸の前後十四センチの通り道に、幅七センチの溝を残す。
      for (const [a, b] of [[-.2, -.175], [-.105, .105], [.175, .2]]) {
        box(g, x1 - x0, .012, b - a, (x0 + x1) / 2, sill + .006, p.z + (a + b) / 2, 0x3a2a1c, 'doorWoodCross');
        box(g, x1 - x0, .012, b - a, (x0 + x1) / 2, ph + .006, p.z + (a + b) / 2, 0x3a2a1c, 'doorWoodCross');
      }
      // 長押は小壁の中へ埋めず、柱の両面へ添える推定復元。
      // 柱の厚み十六センチの外面で受け、内陣・座敷・入口のどちら側からも木組みを見せる。
      // 戸と欄間より上へ納め、形と材質は固定の間仕切りと一緒に束ねる。
      const nageshiY = nodaNageshiHeight(layout.kind, h);
      // 外周の長押の内面は部屋の端から三十三センチ。木口をそこで止め、
      // 側壁の長押へ横材を突き通さない。敷居・鴨居と戸の引き代は保つ。
      const nageshiLen = x1 - x0 - .66;
      for (const side of [-1, 1])
        box(g, nageshiLen, .12, .1, (x0 + x1) / 2, nageshiY, p.z + side * .13, 0x2e2016, 'doorWoodCross');
      // 長押を柱へ留める位置に無紋の釘隠しを添える推定復元。
      // 堂・僧坊・詰所は留め金、板倉などの用屋は小さな木栓で納める。
      // 実際の柱割りを共用し、柱のない戸口や長押の木口には付けない。
      // 静止した箱を既存の内装へ束ね、引き戸の溝と毎コマの処理は増やさない。
      const formal = ['hondo', 'sobo', 'goten'].includes(layout.kind);
      const fasteners = new Set(), fastenerW = formal ? .06 : .035;
      for (const wall of layout.walls) {
        if (wall.guideOnly || Math.abs(wall.az - p.z) > .01 || Math.abs(wall.bz - p.z) > .01) continue;
        for (const x of nodaPartitionPosts(layout, wall).positions) {
          if (x - fastenerW / 2 < x0 + .33 || x + fastenerW / 2 > x1 - .33 || fasteners.has(x)) continue;
          fasteners.add(x);
          for (const side of [-1, 1]) box(g, fastenerW, fastenerW, .012,
            x, nageshiY, p.z + side * .186, formal ? 0x302b24 : 0x795b3b);
          // 鴨居も柱へ差して留める推定復元。長押の釘隠しとは別に、
          // 柱筋の交点だけへ込栓の木口を見せる。低い柱頭には付けない。
          // 鴨居の溝より上の固定材へ納め、滑る戸の通りを保つ。
          // 共通の箱・材質で内装と一緒に束ね、開閉中の処理は増やさない。
          if (ph + .074 < partitionPostH) for (const side of [-1, 1])
            box(g, .025, .035, .008, x, ph + .056,
              p.z + side * .204, 0x795b3b);
        }
      }
    }
    for (const p of layout.portals) {
      let l = -Infinity, r = Infinity;
      for (const v of layout.walls) {
        if (v.guideOnly || Math.abs(v.az - p.z) > .01 || Math.abs(v.bz - p.z) > .01) continue;
        const a = Math.min(v.ax, v.bx), b = Math.max(v.ax, v.bx);
        if (b <= p.x + .01 && b > l) l = b;
        if (a >= p.x - .01 && a < r) r = a;
      }
      if (!isFinite(l) || !isFinite(r)) continue;
      const cx = (l + r) / 2, len = r - l;
      const boarded = ['bansho', 'nagaya', 'kura', 'minka'].includes(layout.kind);
      if (h - ph > .1) partitionTop(g, len, cx, p.z,
        boarded ? 0x795b3b : temple ? 0xbdb39a : 0xcfc6b0, boarded);
    }
  }
  if (partitions && ph < h && !nodaJoinery) for (const p of layout.portals || []) {
    let l = -Infinity, r = Infinity;
    for (const v of layout.walls) {
      if (v.guideOnly || !v.paper && !iga || Math.abs(v.az - p.z) > .01 || Math.abs(v.bz - p.z) > .01) continue;
      const a = Math.min(v.ax, v.bx), b = Math.max(v.ax, v.bx);
      if (b <= p.x + .01 && b > l) l = b;
      if (a >= p.x - .01 && a < r) r = a;
    }
    if (!isFinite(l) || !isFinite(r)) continue;
    const top = new THREE.Group(), len = r - l;
    if (inabaHigh) {
      // 柱・敷居・鴨居は動く戸と一緒に組む。上部の塗り壁だけを残す。
      const low = ph + .1, high = h - .24;
      if (high > low && !['kura', 'bansho', 'nagaya', 'shrine', 'hondo'].includes(layout.kind)) {
        const cut = lowNageshi ? h - .3 : ph + .42;
        for (const [a, b] of [[low, Math.min(high, cut - nageshiH / 2)],
          [Math.max(low, cut + nageshiH / 2), high]])
          if (b > a) box(top, len, b - a, .06, 0, (a + b) / 2, 0, 0xcfc6b0, 'inabaPlaster');
        place(g, top, (l + r) / 2, p.z, 0);
      }
      continue;
    }
    if (iga) {
      partitionTimber(top, len, .1, iga ? .48 : .12, 0, ph + .05, 0, 0x3a2a1c);
      // 戸口の上も両脇と同じ柱面へ長押を通す。
      if (igaHouse) for (const face of [-1, 1])
        partitionTimber(top, len, .12, .1, 0, ph + .13, face * .08, 0x2e2016);
      else partitionTimber(top, len, .12, .14, 0, ph + (iga ? .13 : .42), 0, 0x2e2016);
      upperWall(top, len);
      if (iga && p.y > 0) partitionTimber(top, len, p.y, .48, 0, p.y / 2, 0, 0x604831);
      partitionTimber(top, len, .04, iga ? .48 : .1, 0, (p.y || 0) + .02, 0, 0x3a2a1c);   // 二本の溝を納め、敷居は板間の上端へ
      if (iga) for (const z of [.11, .185]) {
        box(top, len, .004, IGA_DOOR_GROOVE_W, 0, (p.y || 0) + .041, z, 0x1a1410);
        box(top, len, .004, IGA_DOOR_GROOVE_W, 0, ph - .001, z, 0x1a1410);
      }
      // 戸の脇に柱を立てる。柱は間仕切りの側に納め、開けた幅を狭めない。
      if (iga) for (const side of [-1, 1]) {
        const postX = side * (len / 2 + .06);
        // 土間際の方立は土へ直に立てず、礎石で受ける推定復元。
        // 石は戸口の外側へ納め、上がり框・引き戸の溝と通れる幅を保つ。
        // 館の板敷きには足さず、民家・陣小屋・番所で同じ形と材質を使う。
        const stoneTop = igaBoardWall ? .106 : 0;
        if (igaBoardWall) box(top, .22, .08, .28,
          side * (len / 2 + .11), .066, 0, 0x777267);
        partitionTimber(top, .12, h - stoneTop, .14, postX,
          (h + stoneTop) / 2, 0, 0x3a2a1c, false);
        if (igaHouse || igaBoardWall) {
          // 敷居も柱へ短ほぞで差す推定復元。鴨居だけを留めると、
          // 上がり口の横木が柱の足元へ突き付いたままになる。
          // 戸の溝より壁側へ納め、敷居の上端と通れる幅は保つ。
          const sillY = (p.y || 0) + .02;
          partitionTimber(top, .06, .02, .1,
            side * (len / 2 + .03), sillY, 0, 0x3a2a1c);
          for (const face of [-1, 1]) {
            const surface = face * .071;
            for (const edge of [-1, 1])
              box(top, .06, .002, .003, side * (len / 2 + .03),
                sillY + edge * .01, surface, 0x211a14);
            box(top, .003, .02, .003, postX, sillY, surface, 0x211a14);
            box(top, .012, .012, .008, side * (len / 2 + .035),
              sillY, face * .074, 0x795b3b);
          }
          // 鴨居を柱の内面で突き合わせず、短ほぞを柱へ差して込栓で留める推定復元。
          // 民家・陣小屋・番所の板戸も同じ柱組で受ける。館だけに仕口を付けると、
          // 梁の見える小屋では鴨居の木口が柱へ突き当たったままになっていた。
          // 溝は柱より手前の二本を保ち、仕口も柱の幅に収めて戸の引きしろを空ける。
          partitionTimber(top, .06, .06, .1, side * (len / 2 + .03), ph + .05, 0, 0x3a2a1c);
          for (const face of [-1, 1]) {
            // 柱の両面に差し口の輪郭と、ほぞを貫く木栓の木口を出す。
            const surface = face * .071;
            for (const edge of [-1, 1])
              box(top, .06, .003, .003, side * (len / 2 + .03),
                ph + .05 + edge * .03, surface, 0x211a14);
            box(top, .003, .06, .003, postX, ph + .05, surface, 0x211a14);
            box(top, .022, .022, .008, side * (len / 2 + .035),
              ph + .05, face * .074, 0x795b3b);
          }
        }
        if (igaHouse) {
          // 館の外周と同じく、間仕切りの長押も柱へ留める。
          // 襖の両側から見える位置へ釘隠しと継ぎ目を納め、
          // 開けた戸が滑る溝（奥行き .11・.185）には出さない。
          // 厚い角材に見える四角の塊をやめ、外周と同じ薄い八角の鉄座と鋲にする。
          // 二つの館・左右・両面で原形と材質を共用し、設営時に既存の束へまとめる。
          const plateKey = 'igaPartitionNailPlate', headKey = 'igaPartitionNailHead';
          if (!shapes.has(plateKey)) shapes.set(plateKey, new THREE.CylinderGeometry(.034, .034, .003, 8));
          if (!shapes.has(headKey)) shapes.set(headKey, new THREE.CylinderGeometry(.004, .01, .006, 8));
          for (const face of [-1, 1]) {
            const plate = new THREE.Mesh(shapes.get(plateKey), mat(0x302b26));
            const head = new THREE.Mesh(shapes.get(headKey), mat(0x484039));
            // 円柱の上端を室内へ向け、座の裏を長押の表面へ密着させる。
            plate.rotation.x = head.rotation.x = -face * Math.PI / 2;
            plate.position.set(postX, ph + .13, face * .1315);
            head.position.set(postX, ph + .13, face * .136);
            top.add(plate, head);
            box(top, .005, .1, .004, postX + side * .045, ph + .13, face * .132, 0x211a14);
          }
        }
      }
    } else if (layout.profile === 'hieizan') {
    box(top, len, .1, .12, 0, ph + .05, 0, 0x3a2a1c);
    partitionNageshi(top, len);
    if (layout.profile === 'hieizan') hieiPartitionTop(top, len);
    else partitionTop(top, len, 0, 0, temple ? 0xbdb39a : 0xcfc6b0);
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
    }   // 敷居
    } else {
      box(top, len, .1, .12, 0, ph + .05, 0, 0x3a2a1c);
      partitionNageshi(top, len);
      partitionTop(top, len);
      box(top, len, .04, .1, 0, .02, 0, 0x3a2a1c);
    }
    place(g, top, (l + r) / 2, p.z, 0);
  }
  if (['chudo', 'hondo', 'kuri', 'sobo', 'goten'].includes(layout.kind)) {
    const rs = layout.rooms, hw = Math.max(...rs.map(r => r.x1)), hd = Math.max(...rs.map(r => r.z1));
    // 野田福島の室内灯は naka.js で戸と家具を避けて置く。二重に足さない。
    const altarLit = layout.profile === 'hieizan' && ['chudo', 'hondo', 'sobo', 'kuri'].includes(layout.kind);
    if (!nodaJoinery && !altarLit) for (const x of [-hw + .5, hw - .5]) {
      const z = hd - .75;
      const room = nodaJoinery ? rs.find(r => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) : null;
      // 灯明の台も床面へ載せる。畳に台を埋めず、灯りの面も同じだけ持ち上げる。
      const floorY = room ? (room.y || 0) + (room.floor === 'tatami' ? .06 : room.floor === 'earth' ? .025 : .018) : 0;
      place(g, tomyo(), x, z, 0, floorY); place(g, lightPool(), x, z, 0, floorY + .09);
    }
    // 野田福島の庫裏の見せる梁は naka.js で組み、ここでは二重に足さない。
    // 越前の堂・僧坊は張った天井の上に梁を納める。
    if (!['hieizan', 'echizen_ikko', 'takato', 'nodafukushima'].includes(layout.profile)) for (const z of [-hd * .5, hd * .5]) {
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

// 比叡山の建具は実寸で組み、野田福島の共有形と混ぜない。
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

function hieiTatamiPart(w = .9, d = 1.8, flush = false) {
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

function hieiPanelInstances(kind, count, w = .9, h = 1.8) {
  // 比叡山は戸口ごとの実寸で組む。戸全体を伸ばして框・引き手まで太らせない。
  // 同じ種類と寸法は保存済みの形・材質を共有する。
  const key = kind + ':' + w + ':' + h + ':' + (cgtOn() && cgtHas('slide_door_a'));
  if (!panels.has(key)) panels.set(key, batchInterior(kind === 'fusuma' ? hieiFusuma(w, h) : kind === 'fusumaPlain' ? hieiFusuma(w, h, false, true) : kind === 'fusumaE' ? hieiFusuma(w, h, true) : kind === 'itado' || kind === 'itadoHiei' ? hieiItado(w, h, kind === 'itadoHiei') : kind === 'koshi' || kind === 'koshiHiei' ? hieiKoshi(w, h, kind === 'koshiHiei') : hieiShoji(w, h, kind === 'shojiHiei')));
  return panels.get(key).children.map((m) => { const copy = new THREE.InstancedMesh(m.geometry, m.material, Math.max(1, count)); cacheUsers.push(new WeakRef(copy)); return copy; });
}

function altarOval(g, w, h, d, x, y, z, color) {
  if (!shapes.has('altarOval')) shapes.set('altarOval', new THREE.SphereGeometry(1, 12, 8));
  const m = new THREE.Mesh(shapes.get('altarOval'), mat(color));
  cacheUsers.push(new WeakRef(m)); m.scale.set(w / 2, h / 2, d / 2); m.position.set(x, y, z); g.add(m); return m;
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

export function inabaAltarBackHeight(p, h) {
  const scale = p.h / 1.75;
  const ceiling = (h - (p.y || 0)) / scale;
  const drop = Math.min(0, ceiling - (INABA_ALTAR_SUSPENSION_DROP + .1) / scale - 2.27);
  return (2.14 + drop) * scale;
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

function hieiBuddhaFace(g, y) {
  for (const side of [-1, 1]) {
    altarOval(g, .04, .11, .045, side * .112, y - .005, -.1, 0xa48b4a);
    altarOval(g, .04, .009, .012, side * .045, y + .018, .003, 0x50452c);
    altarOval(g, .046, .009, .012, side * .045, y + .04, -.003, 0x6e5424);
  }
  altarOval(g, .025, .05, .035, 0, y - .005, .012, 0xa48b4a);
  altarOval(g, .04, .009, .012, 0, y - .045, .008, 0x6e5424);
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

function moribeFrame(g, w, h, color, joined = false, finger = false, grain = false) {
  // 縦框と横框は同じ面へ重ねず、四隅を相欠きで受ける。
  for (const y of [.02, h - .02]) moribeTimberBox(g, w, .04, .03, 0, y, -.015, color, 0);
  for (const x of [-(w - .04) / 2, (w - .04) / 2]) {
    moribeTimberBox(g, .04, h, .03, x, h / 2, .015, color, 1);
    if (!finger) moribeTimberBox(g, .04, h - .08, .03, x, h / 2, -.015, color, 1);
    else {
      const y = h * .47, low = y - .075, high = y + .075;
      moribeTimberBox(g, .04, low - .04, .03, x, (low + .04) / 2, -.015, color, 1);
      moribeTimberBox(g, .04, h - .04 - high, .03, x, (h - .04 + high) / 2, -.015, color, 1);
      box(g, .022, .15, .018, x, y, -.009, 0x30251b);
    }
  }
}
function moribeShoji(w = .9, h = 1.8, mirrored = false) {
  const g = new THREE.Group(), iw = w - .08, ih = h - .08;
  gripPanel(g, iw, ih, .004, -.014, 0xffffff, 'washi', (mirrored ? -1 : 1) * (w / 2 - .02), .04);
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
    moribeFrame(g, w, h, 0x795b3b, true, true, false, null, h - .034, true);
    // 右戸は引手と框の配置だけを左右へ写す。紙を張る裏面と組子の表面はそろえる。
    // 紙片内の折り返しは上で写してある。框・組子と一緒に中心を移し、負の倍率は使わない。
    if (mirrored) for (const part of g.children) part.position.x *= -1;

  return g;
}
function moribeItado(w = .9, h = 1.8, mirrored = false) {
  const g = new THREE.Group(), joined = true;
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
  moribeFrame(g, w, h, 0x241a12, joined, false, joined, null, h - .034, false, rails);
  // 森部の板戸も障子・格子戸と同じ高さに引手をそろえる。
  if (joined) {
    // 板を貫く黒い塊にせず、表裏の板面へ浅い掘込引手の底と木縁を納める推定復元。
    // 桟の間に収め、框より外へ出さない。動く戸も固定戸も同じ部品を使う。
    const px = w / 2 - .12, py = h * .47;

    for (const side of [-1, 1]) {
      box(g, .042, .092, .002, px, py, side * .01, 0x211a14);
      for (const dx of [-.025, .025]) moribeTimberBox(g, .008, .108, .008, px + dx, py, side * .023, 0x4a3828);
    }
  }
  if (mirrored) for (const part of g.children) part.position.x *= -1;
  return g;
}
function moribeKoshi(w = .9, h = 1.8, mirrored = false) {
  const g = new THREE.Group(), pull = true;
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
  moribeFrame(g, w, h, 0x1e140e, pull, pull, pull, pull ? [.32, h * .55, h - .3] : null,
    pull ? .32 - .035 / 2 + .006 : h - .034, pull ? 'koshi' : false);
  // 森部の右戸も格子と貫の相欠きの表裏を保ち、引手だけ召合せへ向ける。
  // 半回転で裏返さず、障子と同じく部品の中心を左右へ写す。
  if (pull && mirrored) for (const part of g.children) part.position.x *= -1;

  return g;
}

function inabaPanelInstances(kind, count, w = .9, h = 1.8) {
  const right = kind.endsWith('R'), base = right ? kind.slice(0, -1) : kind;
  const key = `稲葉山:${kind}:${w}:${h}`;
  if (!panels.has(key)) {
    const panel = base === 'shoji' ? inabaShoji(w, h, true, right)
      : base === 'koshi' ? inabaKoshi(w, h, true, right)
      : base === 'itado' ? hieiItado(w, h, true)
      : inabaFusuma(w, h, base === 'fusumaE', true);
    if (right && base === 'itado') panel.rotation.y = Math.PI;
    panels.set(key, batchInterior(panel));
  }
  return panels.get(key).children.map(m => {
    const copy = new THREE.InstancedMesh(m.geometry, m.material, Math.max(1, count));
    cacheUsers.push(new WeakRef(copy)); return copy;
  });
}
