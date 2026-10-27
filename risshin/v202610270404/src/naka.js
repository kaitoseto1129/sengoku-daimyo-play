// ======================================================================
// naka.js … 天守・櫓・御殿の「中」（kaito 10/2「天守や櫓の中に入れるように。天守の中で大将を見つける」）
// 建てる側（props.tenshu・castle_parts の隅櫓・櫓門・御殿）が addInterior で「階の並び」を渡すだけで、
//   ・当たり：階ごとの床（floors.js の deck。上の階は階段の口を空ける）・中の階段（inner の坂）・壁（その階の高さだけ効く SOLIDS）
//     ・入口（戸口の隙間と、外から上がる石段）・階段の口の手すり
//   ・見た目（近づいた時だけ作る・近い時だけ描く）：板の床・内の壁と柱・狭間と窓（穴）・窓からの光の筋・灯明・急な箱階段
//     光は頂点の色に焼き込む（MeshBasic。画質「低」でも重くしない。中の灯りで陰を作らない）
//   ・中にいる兵に u.naka を付ける（units.js：上下の階の者とは斬り合わない）
//   ・遊び手が中にいる時：カメラは寄せて部屋の内に収める（player.js が nakaCamClamp を呼ぶ）。日の光を少し落とす
// 戦ごとに nakaReset（battle.js が SOLIDS と一緒に空にする）。nakaTick は battle.js が毎コマ呼ぶ。
// ======================================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FL, addDeck, addRamp } from './floors.js';
import { SOLIDS } from './props.js';
import { INTERIOR_WALLS, makeInteriorGuards, interiorSafeSpot, interiorFloorBlocked, interiorBlocked } from './shironaka.js';
import { interiorLayout, interiorFloorAt, interiorWaypoint, prepareInteriorPaths, okeFixedPanel } from './interior_layouts.js';
import { furnishLayout, templeBoatGeometry, nageshiGeometry, interiorWoodTexture, interiorPlasterTexture, hieiAltarLamps, hieiNageshiHeight, hieiPartitionHeight, HIEI_DOOR_TRACK, HIEI_ENTRY_TRACK, HIEI_SOBO_SILL, tomyo, batchInterior, MORIBE_WRITING_TOOLS, lightPool, inabaBoardTexture, inabaAltarBackHeight, INABA_ALTAR_SUSPENSION_DROP } from './interior_parts.js';
import { setInteriorSound } from './audio.js';
import { S } from './settings.js';
import { woodTex } from './nature.js';
import { addNaibu, addNaibuStairs } from './naibu_kit.js';
import { cgtOn, cgtHas, KitBatch } from './cgt.js';   // 買った素材（床・畳・武器の棚）
import { yaguraTick } from './yagura_play.js';
import { addNakaDoors, addNakaTransomSolids, nakaLatticeMembers, nakaFusumaMembers, nakaShojiMembers, nakaDoorStiles, buildNakaDoorMeshes, nakaDoorTick, resetNakaDoors, nakaWallBetween } from './naka_doors.js';
import { drawGroundAt } from './render_camera.js';

const REDUCE_MOTION = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
const INABA_WALL_BOARD = new THREE.BoxGeometry(1, 1, 1);
// 森部の油灯。描画部品 tomyo(true) の台座・支柱・受皿・油皿と同じ高さと最大半径。
// 床置きと須弥壇上で共用し、炎には木や金属の当たりを付けない。
const MORIBE_LAMP_PARTS = [[.16, 0, .06], [.035, .06, .73], [.13, .73, .78], [.09, .78, .83]];

export const NAKA = { list: [], flagged: [], t: 0, outer: false, cur: null, dim: 1, lt: null };
// 兵の判定の印は戦をまたいでも戻さず、前の戦の控えと取り違えない。
let roomScanPass = 0;

export function nakaReset() {
  setInteriorSound(null);
  for (const v of NAKA.hidden || []) v.mesh.visible = v.visible;
  NAKA.hidden = null;
  for (const u of NAKA.flagged) { u.naka = null; u.nakaLevel = null; }
  if (NAKA.lt) {
    const lt = NAKA.lt;
    if (lt.sunLight && Math.abs(lt.sunLight.intensity - lt.sunSet) < 1e-4) lt.sunLight.intensity = lt.sun;
    if (lt.hemiLight && Math.abs(lt.hemiLight.intensity - lt.hemiSet) < 1e-4) lt.hemiLight.intensity = lt.hemi;
  }
  NAKA.ft = 0; NAKA.guardsReady = false; NAKA.horseHintAt = 0;
  INTERIOR_WALLS.length = 0; resetNakaDoors();
  NAKA.list.length = 0; NAKA.flagged.length = 0; NAKA.t = 0; NAKA.outer = false; NAKA.cur = null; NAKA.dim = 1; NAKA.lt = null; NAKA.pp = null;
}

// 四角 [-hw,hw]×[-hd,hd] から穴 h（x0,x1,z0,z1）を抜いた残り（四つまでの四角）
function rectMinus(hw, hd, h) {
  if (!h) return [[-hw, hw, -hd, hd]];
  if (h.x1 <= -hw || h.x0 >= hw || h.z1 <= -hd || h.z0 >= hd) return [[-hw, hw, -hd, hd]];
  const out = [];
  const x0 = Math.max(-hw, h.x0), x1 = Math.min(hw, h.x1), z0 = Math.max(-hd, h.z0), z1 = Math.min(hd, h.z1);
  if (x0 - -hw > 0.05) out.push([-hw, x0, -hd, hd]);
  if (hw - x1 > 0.05) out.push([x1, hw, -hd, hd]);
  if (z0 - -hd > 0.05) out.push([x0, x1, -hd, z0]);
  if (hd - z1 > 0.05) out.push([x0, x1, z1, hd]);
  return out;
}

function seg(I, ax, az, bx, bz, y0, y1, r = 0.14) {
  const [wax, waz] = I.P(ax, az), [wbx, wbz] = I.P(bx, bz);
  const o = { k: 's', ax: wax, az: waz, bx: wbx, bz: wbz, r, yBot: y0, yTop: y1, naka: I.id,
    x0: Math.min(wax, wbx) - r, x1: Math.max(wax, wbx) + r, z0: Math.min(waz, wbz) - r, z1: Math.max(waz, wbz) + r };
  SOLIDS.push(o);
  INTERIOR_WALLS.push(o);
  return o;
}

// 桶狭間の採光窓。壁厚を覆う脇枠・窓台・上框の寸法を絵と当たりで共有する。
function okeWindowFrame(v, hw, hd, height, put) {
  const depth = v.grilleOffset + .26;
  const off = v.s * ((v.face === 'z' ? hd : hw) + (v.grilleOffset - .26) / 2);
  const frame = (t, y, w, h, grain) => put(v.face === 'z' ? t : off, y,
    v.face === 'z' ? off : t, v.face === 'z' ? w : depth, h, v.face === 'z' ? depth : w, grain);
  for (const side of [-1, 1]) frame(v.t + side * (v.w / 2 + .03),
    (v.y0 + v.y1) / 2, .06, v.y1 - v.y0, 'post');
  for (const y of [v.y0 - .03, v.y1 + .03]) frame(v.t, y, v.w + .12, .06,
    v.face === 'z' ? 'beamX' : 'beamZ');
  // 窓台と上框を板壁に浮かせず、腰束と吊束で床・桁へつなぐ推定復元。
  // 内側の木部だけを足し、格子の開口と壁外の引き戸の筋を空ける。
  // 同じ寸法を描画と当たりで使い、設営時に既存の束へまとめる。
  const inner = v.s * ((v.face === 'z' ? hd : hw) - .16);
  for (const side of [-1, 1]) {
    const t = v.t + side * (v.w / 2 + .05);
    for (const [bottom, top] of [[0, v.y0 - .06], [v.y1 + .06, height]]) {
      if (top - bottom <= .01) continue;
      put(v.face === 'z' ? t : inner, (bottom + top) / 2,
        v.face === 'z' ? inner : t, v.face === 'z' ? .1 : .14,
        top - bottom, v.face === 'z' ? .14 : .1, 'post');
    }
  }
}

// 詰所・民家の内寸は外寸から .24 小さい。外壁と同じ一間割りを使い、
// 大きさによって内外の柱の本数が変わったり、梁端が柱から外れたりしないようにする。
const okeHutBays = len => Math.max(1, Math.round((len + .24) / 1.8));
const okeHutPost = (len, q) => -(len + .24) / 2 + q * (len + .24) / okeHutBays(len);

// 桶狭間の板間の梁・桁。描く寸法と木の当たりを設営時だけ共有する。
function okeRoomBeams(lv, put, peg = null) {
  const step = (lv.w + .24) / okeHutBays(lv.w);
  for (const r of lv.layout.rooms) {
    if (r.floor !== 'boards') continue;
    const z0 = r.z0 + .1, z1 = r.z1 - .1;
    const hearth = lv.layout.kind === 'minka' ? lv.layout.props.find(p => p.part === 'hearth'
      && p.x > r.x0 && p.x < r.x1 && p.z > r.z0 && p.z < r.z1) : null;
    let supportL = r.x0 + .16, supportR = r.x1 - .16;
    if (hearth) for (let x = okeHutPost(lv.w, 1); x < r.x1 - .1; x += step) {
      if (x < hearth.x - .365) supportL = x;
      if (x > hearth.x + .365) { supportR = x; break; }
    }
    for (let x = okeHutPost(lv.w, 1); x < r.x1 - .1; x += step) {
      // 梁端の下を欠き、桁の上面で受ける推定の仕口。太い木をそのまま交差させない。
      // 中央は元の梁せいを保ち、両端だけ桁の半幅に合わせる。絵と当たりで共用する。
      // 煙抜きへ重なる梁は両側の受け木までで止める。板だけ抜いて梁で口を塞がない。
      const spans = hearth && Math.abs(x - hearth.x) < .28 + .085
        ? [[z0, Math.min(z1, hearth.z - .33)], [Math.max(z0, hearth.z + .33), z1]] : [[z0, z1]];
      for (const [a, b] of spans) {
        if (b - a <= .001) continue;
        const seat = Math.min(.09, (b - a) / 2);
        const middle = b - a - seat * 2;
        if (middle > .001) {
          // 煙抜きの受け木と交わる梁は下側を相欠きにする推定復元。
          // 上側の木を残し、受け木の上面で受ける。描画と当たりを同時に切る。
          let spans = [[a + seat, b - seat]];
          if (hearth && (Math.abs(x - supportL) < .001 || Math.abs(x - supportR) < .001)) {
            for (const z of [hearth.z - .33, hearth.z + .33]) {
              const next = [];
              for (const [back, front] of spans) {
                const low = Math.max(back, z - .05), high = Math.min(front, z + .05);
                if (low >= high) { next.push([back, front]); continue; }
                if (low > back) next.push([back, low]);
                if (front > high) next.push([high, front]);
                put(x, lv.y + lv.h - .06, (low + high) / 2, .17, .1, high - low);
              }
              spans = next;
            }
          }
          for (const [back, front] of spans)
            put(x, lv.y + lv.h - .13, (back + front) / 2, .17, .24, front - back);
        }
        for (const z of [a + seat / 2, b - seat / 2]) {
          put(x, lv.y + lv.h - .06, z, .17, .1, seat);
          // 込栓は梁端から下の桁・煙抜きの受け木へ縦に通す推定復元。
          // 横から梁だけへ刺した栓では桁を留められない。欠き込みの中央から
          // 梁端の下面を越えて打ち、頭だけを上面へ二ミリ出す。
          if (peg && seat >= .028) peg(x, lv.y + lv.h - .108, z);
        }
      }
    }
    for (const z of [z0, z1]) {
      // 桁端の下半分を枕木の内面まで欠く推定復元。
      // 一枚の箱のままでは枕木と七センチ重なり、両方の下面が同じ面に出ていた。
      // 上半分を通し、下半分は枕木の間だけにする。絵と木の当たりを共用する。
      const left = r.x0 + .1, right = r.x1 - .1;
      const seat = Math.min(.16, (right - left) / 2);
      put((left + right) / 2, lv.y + lv.h - .145, z, right - left, .07, .18, 'beamX');
      if (right - left > seat * 2) put((left + right) / 2, lv.y + lv.h - .215,
        z, right - left - seat * 2, .07, .18, 'beamX');
      // 枕木も同じ呼び口へ移し、柱頭に見える木だけ人・槍・矢を止める。
      for (const x of [r.x0 + .16, r.x1 - .16])
        put(x, lv.y + lv.h - .215, z, .2, .07, .24, 'beamZ', 0x6a5038);
    }
    // 民家の煙抜きの枠を天井板だけに浮かせず、両脇の梁へ受け木でつなぐ推定復元。
    // 炉口の真上は空け、梁がない壁際では側柱の上へ納める。絵と当たりで共有する。
    if (hearth) {
      // 開口の前後を一本ずつ渡し、切った梁端と煙抜きの枠を隣の梁・側柱へ受ける。
      // 内縁は口の端へそろえる。描く木と当たりは同じ呼び口を使う。
      // 受け木の上面は梁端の欠き込みの下面へそろえる。
      // 天井直下へ置くと梁端の厚みをほぼ丸ごと貫通し、仕口が埋まってしまう。
      const seatBottom = lv.y + lv.h - .06 - .1 / 2;
      const supportHeight = .13;
      // 梁の外面まで掛け、欠いた下半分へ納める。側柱側は柱心で受ける。
      const left = supportL - (supportL > r.x0 + .17 ? .085 : 0);
      const right = supportR + (supportR < r.x1 - .17 ? .085 : 0);
      for (const z of [hearth.z - .33, hearth.z + .33]) {
        if (right - left > .01) put((left + right) / 2, seatBottom - supportHeight / 2,
          z, right - left, supportHeight, .1);
        // 受け木と両脇の梁の相欠きも込栓で留める推定復元。
        // 切った梁端の栓だけでは、受け木の両端が留まっていなかった。
        // 既存の栓を梁上から受け木へ通す。側柱で受ける端には重ねない。
        if (peg) for (const x of [supportL, supportR]) {
          if (x > r.x0 + .17 && x < r.x1 - .17)
            peg(x, lv.y + lv.h - .108, z);
        }
      }
      // 煙抜きの切り口を受ける枠も、梁と同じ寸法で描画・当たりへ渡す。
      // 天井板だけを止めると、見えている枠へ槍や矢が抜けてしまう。
      // 口の幅は変えず、四隅を相欠きにして枠同士をつなぐ推定復元。
      // 枠の下面を受け木の上面へ下ろし、従来の七センチの浮きをなくす。
      // 上端は保ち、木肌と煤は梁と同じ束へまとめる。
      const frameTop = lv.y + lv.h + .09, frameBottom = seatBottom;
      const frameY = (frameTop + frameBottom) / 2, frameHeight = frameTop - frameBottom;
      const halfHeight = frameHeight / 2;
      for (const x of [hearth.x - .305, hearth.x + .305]) {
        // 左右材は下半分を通し、上半分の両端を前後材のほぞへ譲る。
        // 欠いた部分も同じ呼び口で作り、見えない木の当たりを残さない。
        put(x, frameBottom + halfHeight / 2, hearth.z, .05, halfHeight, .66, 'beamZ');
        put(x, frameTop - halfHeight / 2, hearth.z, .05, halfHeight, .56, 'beamZ');
      }
      for (const z of [hearth.z - .305, hearth.z + .305])
        put(hearth.x, frameY, z, .56, frameHeight, .05, 'beamX');
      for (const x of [hearth.x - .305, hearth.x + .305])
        for (const z of [hearth.z - .305, hearth.z + .305]) {
          put(x, frameTop - halfHeight / 2, z, .05, halfHeight, .05, 'beamX');
          // 既存の二十センチの栓を上下の材へ通し、頭だけ二ミリ出す。
          // 梁と同じ原形・木肌を使い、設営時の束へまとめる。
          if (peg) peg(x, frameTop - .098, z);
        }
    }
  }
}
// 比叡山の堂の格子窓。描く桟と当たりを同じ割付から作る（設営時だけ）。
function hieiWindowBars(I, v, bar, fitted = false) {
  if (I.open || I.profile !== 'hieizan' || !['chudo', 'hondo'].includes(I.kind)) return false;
  const h = v.y1 - v.y0, count = Math.max(2, Math.ceil(v.w / .15));
  if (fitted) {
    // 格子の四周を框で受け、縦桟と横桟は互いの側面までで納める。
    // 同じ厚さの箱を重ねると交点の表裏がちらつくため、見える面を重ねない。
    // 焼失前の細部は推定。通行・矢の当たりは従来の一体の桟を使う。
    const pitch = (v.w - .04) / count, left = v.t - (v.w - .04) / 2;
    for (const cy of [v.y0 + .02, v.y1 - .02]) bar(v.t, cy, v.w, .04);
    for (let q = 0; q <= count; q++) bar(left + q * pitch, (v.y0 + v.y1) / 2, .04, h - .08);
    for (const f of [1 / 3, 2 / 3]) for (let q = 0; q < count; q++) {
      bar(left + (q + .5) * pitch, v.y0 + .02 + (h - .04) * f, pitch - .04, .04);
    }
    return true;
  }
  for (let q = 0; q <= count; q++) bar(v.t + (q / count - .5) * (v.w - .04), (v.y0 + v.y1) / 2, .04, h);
  for (const f of [0, 1 / 3, 2 / 3, 1]) bar(v.t, v.y0 + .02 + (h - .04) * f, v.w, .04);
  return true;
}

// 一つの面（局所の t 軸に沿う長さ len）の壁を、穴（{t0,t1,y0,y1}）を避けて区切る：[t0,t1,y0,y1] の並び
export function facePanels(len, h, holes) {
  // 戸口と窓が横に重なっても、どちらの穴も塞がない。
  const cuts = [-len / 2, len / 2];
  for (const v of holes) cuts.push(Math.max(-len / 2, Math.min(len / 2, v.t0)), Math.max(-len / 2, Math.min(len / 2, v.t1)));
  cuts.sort((a, b) => a - b);
  const out = [];
  for (let i = 1; i < cuts.length; i++) {
    const a = cuts[i - 1], b = cuts[i];
    if (b - a < .02) continue;
    const mid = (a + b) / 2, spans = holes.filter(v => v.t0 < mid && v.t1 > mid).sort((v, w) => v.y0 - w.y0);
    let y = 0;
    for (const v of spans) {
      const low = Math.max(0, Math.min(h, v.y0)), high = Math.max(0, Math.min(h, v.y1));
      if (low > y + .02) out.push([a, b, y, low]);
      y = Math.max(y, high);
    }
    if (h > y + .02) out.push([a, b, y, h]);
  }
  return out;
}

// 窓の穴は設営時に一度決め、当たりと室内の絵で使い回す。
function windowsFor(I, lv, k) {
  if (lv.windows) return lv.windows;
  const hw = lv.w / 2, hd = lv.d / 2, h = lv.h;
  const goten = !['tenshu', 'yagura', 'gate'].includes(I.kind);
  let wins = I.wins ? I.wins(lv, k) : null;
  // 稲葉山の小祠は側壁に窓のない外形。内側だけに明かり障子を描かない。
  if (!wins && S.quality === 'high' && I.profile === 'inabayama' && I.kind === 'shrine') wins = [];
  if (!wins) {
    wins = [];
    if (!goten) {
      const nw = Math.max(1, Math.round(lv.w / 2.6));
      for (let q = 0; q < nw; q++) for (const sd of [-1, 1]) wins.push({ face: 'z', s: sd, t: -hw + (q + .5) * lv.w / nw, w: .8, y0: h * .5, y1: h * .5 + .5 });
      const nd = Math.max(1, Math.round(lv.d / 2.6));
      for (let q = 0; q < nd; q++) for (const sd of [-1, 1]) wins.push({ face: 'x', s: sd, t: -hd + (q + .5) * lv.d / nd, w: .7, y0: h * .5, y1: h * .5 + .5 });
    } else {
      for (const sd of [-1, 1]) for (const t of [-hd * .45, hd * .45]) wins.push({ face: 'x', s: sd, t, w: 1.4, y0: .7, y1: 1.9, shoji: true });
    }
  }
  return lv.windows = wins;
}

// o: { name, kind('tenshu'|'yagura'|'gate'|'goten'), x, z, rot, levels: [{ y, w, d, h }],
//      door: { side(+1＝局所の +z の面), lx, w }, approach: { pad, len } か null, oku（御殿の奥の間の割合）,
//      wins(lv, k) → [{ face: 'z'|'x', s: ±1, t, w, y0, y1 }]（外の格子窓の場所に合わせる。無ければ自動）, where（大将の居場所の言い方） }
export function addInterior(world, o) {
  
  const rot = o.rot || 0, c = Math.cos(rot), s = Math.sin(rot);
  const I = {
    id: NAKA.list.length, name: o.name || '櫓', kind: o.kind || 'yagura', profile: o.profile || null, x: o.x, z: o.z, rot, c, s,
    levels: o.levels.map((l, k) => ({ ...l, k })), door: { side: 1, lx: 0, w: 1.3, ...(o.door || {}) },
    templePaper: !!o.templePaper,
    hasExterior: !!o.hasExterior, open: !!o.open, team: o.team, oku: o.oku ?? (o.kind === 'goten' ? .4 : 0), wins: o.wins || null, built: false, mesh: null, glows: [], stairs: [], seen: {}, onEnter: null, onLevel: null,
  };
  // 近い建物の範囲が重なっても、同じ兵の全室探索は一巡に一度だけ。
  // 最初に見つかった建物を採る順番と、階ごとの判定は保つ。
  I.scanUnit = (o) => {
    if (!o.alive || o.isStruct || o.naka) return;
    if (o._roomScanPass !== roomScanPass) {
      o._roomScanPass = roomScanPass;
      o._roomScanResult = nakaRoomAt(o.pos.x, o.pos.z, o.pos.y);
    }
    const r = o._roomScanResult;
    if (r && r.I === I) { o.naka = I.id + 1; o.nakaLevel = r.lv.k; NAKA.flagged.push(o); }
  };
  I.sgOverhead = world.def.battleKey === 'shigisan';
  I.P = (lx, lz) => [I.x + lx * c + lz * s, I.z - lx * s + lz * c];
  I.L = (wx, wz) => { const dx = wx - I.x, dz = wz - I.z; return [dx * c - dz * s, dx * s + dz * c]; };
  const Ls = I.levels, ds = I.door.side;
  for (const lv of Ls) {
    lv.room = { I, lv };
    lv.layout = interiorLayout(I.kind, lv.w, lv.d, { oku: I.oku || .4, side: ds, profile: I.profile, entryX: I.door.lx, entryW: I.door.w, raisedTatami: S.quality === 'high',
      slidingClearance: S.quality === 'high' && I.profile === 'inabayama' ? .2 : 0 });
    if (S.quality === 'high' && I.profile === 'inabayama') {
      // 番所・長屋の短槍は上げ床から梁下へ収め、穂先の上に五センチ空ける。
      // 絵だけ短くすると当たりが天井近くへ残るため、設営時の寸法から揃える。
      for (const p of lv.layout.props) {
        if (p.part === 'spearRack') p.h = Math.min(p.h, lv.h - .34 - (p.y || 0));
        // 床の間は上部の木組みを天井下へ納め、絵と当たりで高さを共有する。
        if (p.part === 'alcove') p.h = Math.min(p.h, lv.h - (p.y || 0) - .045);
      }
    }
    if (I.profile === 'moribe' && lv.k === 0 && !I.open) {
      // 板床の木口も実際の戸口に合わせ、左右の地覆の下へ延ばさない。
      lv.layout.entryDoor = { x: I.door.lx, w: I.door.w, side: ds };
    }
  }
  I.R = Math.hypot(Ls[0].w, Ls[0].d) / 2 + (o.approach ? o.approach.pad + o.approach.len : 0);
  // 階段：k → k+1。上の階の壁ぎわ（階ごとに前と奥を互い違い）に、x の向きへ上る急な箱階段
  for (let k = 0; k + 1 < Ls.length; k++) {
    const lv = Ls[k], up = Ls[k + 1], rise = up.y - lv.y;
    const sg = (k % 2 === 0 ? -1 : 1) * ds;
    const available = Math.max(.6, Math.min(lv.w, up.w) - 2.2);
    const fold = available < rise * .75 && Math.min(lv.d, up.d) >= 3.8;
    const L = Math.min(available, Math.max(2.4, rise * (fold ? .46 : .92)));
    const lz = sg * (Math.min(lv.d, up.d) / 2 - .8), endZ = fold ? lz - sg * 1.25 : lz;
    const st = { k, sg, L, lz, y0: lv.y, y1: up.y, w: .95, fold,
      headX: fold ? -L / 2 : L / 2, headZ: endZ,
      hole: { x0: -L / 2 - .25, x1: L / 2 + .25,
        z0: Math.min(lz, endZ) - .7, z1: Math.max(lz, endZ) + .7 } };
    const mid = (lv.y + up.y) / 2;
    st.runs = fold ? [
      { ax: -L / 2, az: lz, bx: L / 2, bz: lz, ya: lv.y, yb: mid },
      { ax: L / 2, az: endZ, bx: -L / 2, bz: endZ, ya: mid, yb: up.y },
    ] : [{ ax: -L / 2, az: lz, bx: L / 2, bz: lz, ya: lv.y, yb: up.y }];
    st.points = [{ x: -L / 2 - .5, z: lz, y: lv.y }];
    if (fold) st.points.push({ x: L / 2, z: lz, y: mid }, { x: L / 2, z: endZ, y: mid });
    st.points.push({ x: st.headX + (fold ? -.5 : .5), z: endZ, y: up.y });
    I.stairs.push(st);
    for (const run of st.runs) {
      const [ax, az] = I.P(run.ax, run.az), [bx, bz] = I.P(run.bx, run.bz);
      addRamp({ ax, az, bx, bz, w: st.w, ya: run.ya, yb: run.yb, inner: true });
      const sign = Math.sign(run.bx - run.ax);
      if (L > 1.2) seg(I, run.ax + sign * .9, run.az - sg * .55, run.bx - sign * .4, run.az - sg * .55, run.ya - .4, run.ya + .6, .1);
    }
    if (fold) {
      const [cx, cz] = I.P(L / 2, (lz + endZ) / 2);
      addDeck({ cx, cz, rot, x0: -.5, x1: .5, z0: -.95, z1: .95, y: mid, roof: up.y + up.h, name: '階段の踊り場' });
    }
    // 手すりは出口から兵一人ぶん離し、上下どちらからも曲がれる口を残す。
    const hz = sg < 0 ? st.hole.z1 : st.hole.z0;
    if (fold) seg(I, st.hole.x0 + 1.1, hz, st.hole.x1, hz, up.y - .3, up.y + 1.2, .08);
    else seg(I, st.hole.x0, hz, st.hole.x1 - 1.1, hz, up.y - .3, up.y + 1.2, .08);
  }

  // 床と壁
  I.deckIds = [];
  for (let k = 0; k < Ls.length; k++) {
    const lv = Ls[k], hw = lv.w / 2, hd = lv.d / 2;
    const hole = k > 0 ? I.stairs[k - 1].hole : null;
    lv.pieces = rectMinus(hw, hd, hole);
    {
      // 上り口と次の階段の下に調度を置かない。見た目と当たりの両方から外す。
      const stair = I.stairs[k];
      lv.layout.props = lv.layout.props.filter(p => {
        const overlaps = v => v && p.x + p.w / 2 + .25 > v.x0 && p.x - p.w / 2 - .25 < v.x1 && p.z + p.d / 2 + .25 > v.z0 && p.z - p.d / 2 - .25 < v.z1;
        return !overlaps(hole) && !overlaps(stair ? { x0: -stair.L / 2 - .7, x1: stair.L / 2 + .7, z0: stair.hole.z0 - .2, z1: stair.hole.z1 + .2 } : null);
      });
    }
    if (['tenshu', 'yagura', 'gate'].includes(I.kind) && k === 0 && lv.y > world.heightAt(I.x, I.z) + 1 && lv.w > 2.5) {
      lv.drop = { x0: -hw + .12, x1: -hw + .7, z0: -.45, z1: .45 };
      const remain = [];
      for (const [x0, x1, z0, z1] of lv.pieces) {
        const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
        for (const r of rectMinus((x1 - x0) / 2, (z1 - z0) / 2, { x0: lv.drop.x0 - cx, x1: lv.drop.x1 - cx, z0: lv.drop.z0 - cz, z1: lv.drop.z1 - cz })) remain.push([r[0] + cx, r[1] + cx, r[2] + cz, r[3] + cz]);
      }
      lv.pieces = remain;
      seg(I, lv.drop.x1 + .1, -.55, lv.drop.x1 + .1, .55, lv.y - .4, lv.y + .75, .08);
    }
    let main = null, area = -1;
    // 桶狭間の畳は六センチ、板床は一・二センチの仕上げ厚がある。
    // 下地の高さで歩かせず、部屋ごとの仕上げ面へ床の当たりを合わせる。
    // 境の余白を広げず、畳の高さが入口の板間へ張り出すのも防ぐ。
    const finishedFloor = I.profile === 'okehazama' && ['bansho', 'minka', 'hondo'].includes(I.kind);
    const walkingPieces = finishedFloor ? lv.layout.rooms.flatMap(r => lv.pieces.map(v => [
      Math.max(r.x0, v[0]), Math.min(r.x1, v[1]), Math.max(r.z0, v[2]), Math.min(r.z1, v[3]),
      (r.y || 0) + (r.floor === 'tatami' ? .06 : .012),
    ]).filter(v => v[1] > v[0] && v[3] > v[2])) : lv.pieces;
    for (const [x0, x1, z0, z1, finish = 0] of walkingPieces) {
      const [cx, cz] = I.P((x0 + x1) / 2, (z0 + z1) / 2);
      const id = addDeck({ x0: -(x1 - x0) / 2, x1: (x1 - x0) / 2, z0: -(z1 - z0) / 2, z1: (z1 - z0) / 2, rot, cx, cz, y: lv.y + finish, ...(finishedFloor ? { pad: 0 } : {}), name: `${I.name} ${k + 1}階`, roof: lv.y + lv.h });
      FL.decks[id].interior = true;
      const a = (x1 - x0) * (z1 - z0);
      if (a > area) { area = a; main = id; }
    }
    I.deckIds.push(main);
    lv.layout.floorPieces = lv.pieces;
    if (I.profile === 'moribe') {
      // 畳寄せまで含む座敷の上面へ足を載せる。板床の高さのまま畳へ沈ませない。
      // 回転した屋敷も描画と同じ室内寸法を使い、余白を付けて板間へ張り出さない。
      const surface = (x0, x1, z0, z1, rise, name) => {
        const [cx, cz] = I.P((x0 + x1) / 2, (z0 + z1) / 2);
        const id = addDeck({ cx, cz, rot, x0: -(x1 - x0) / 2, x1: (x1 - x0) / 2,
          z0: -(z1 - z0) / 2, z1: (z1 - z0) / 2, y: lv.y + rise, pad: 0,
          roof: lv.y + lv.h, name });
        FL.decks[id].interior = true;
      };
      for (const r of lv.layout.rooms) if (r.floor === 'tatami') {
        // 畳寄せの外の地覆際は板床。描く畳寄せと同じ範囲だけ足場を上げる。
        const rearSill = lv.layout.portals.some(p => Math.abs(p.z - r.z0) < .001) ? .27 : .26;
        const frontSill = lv.layout.portals.some(p => Math.abs(p.z - r.z1) < .001) ? .115 : 0;
        surface(r.x0 + .26, r.x1 - .26, r.z0 + rearSill, r.z1 - frontSill, .066, r.name);
        // 戸口だけ八センチ延ばした畳寄せにも足を載せる。
        // 固定戸の前や柱の下を広く上げず、描いた寄せ板と同じ幅・高さにする。
        for (const p of lv.layout.portals) {
          if (Math.abs(p.z - r.z1) > .001) continue;
          let left = -Infinity, right = Infinity;
          for (const v of lv.layout.walls) {
            if (v.guideOnly || Math.abs(v.az - p.z) > .001 || Math.abs(v.bz - p.z) > .001) continue;
            const a = Math.min(v.ax, v.bx), b = Math.max(v.ax, v.bx);
            if (b <= p.x && b > left) left = b;
            if (a >= p.x && a < right) right = a;
          }
          if (Number.isFinite(left) && Number.isFinite(right) && right - left > .14) {
            surface(left + .07, right - .07, r.z1 - .115, r.z1 - .035, .066, '戸口の畳寄せ');
          }
        }
      }
      // 襖・障子・格子戸の敷居は、固定部と開口部を続けて同じ高さで踏めるようにする。
      const sillY = I.kind === 'yashiki' ? .07 : .04;
      for (const p of lv.layout.portals) surface(-hw + .1, hw - .1, p.z - .035, p.z + .265, sillY, '間仕切りの敷居');
      // 固定建具の敷居だけは奥へ十一・五センチ出る。戸口と同じ幅の足場では、
      // 畳寄せとの間の八センチで足が板床へ落ち、描いた敷居へ沈んでしまう。
      // 奥側の張り出しも実際の木の範囲だけ受け、戸口の板間はかさ上げしない。
      for (const v of lv.layout.walls) {
        if (v.guideOnly || Math.abs(v.az - v.bz) > .001) continue;
        surface(Math.min(v.ax, v.bx), Math.max(v.ax, v.bx),
          v.az - .115, v.az - .035, sillY, '固定建具の敷居');
      }
      // 外の板戸の敷居は、左右へ引き切る所まで続く（b_moribe.js）。
      // 戸口の幅だけに足場を置くと、堂前の縁を横に歩いた時に足が木へ沈む。
      // 描いた敷居の全幅・見込みだけを受け、縁全体はかさ上げしない。
      const outerSillHalf = I.door.w + .08;
      surface(I.door.lx - outerSillHalf, I.door.lx + outerSillHalf,
        ds * hd + .07, ds * hd + .25, .04, '戸口の敷居');
    }
    if (lv.drop) lv.layout.props = lv.layout.props.filter(p => !(p.x + p.w / 2 + .3 > lv.drop.x0 && p.x - p.w / 2 - .3 < lv.drop.x1 + 1.3 && p.z + p.d / 2 + .3 > lv.drop.z0 && p.z - p.d / 2 - .3 < lv.drop.z1));
    const y0 = lv.y - 1.2, y1 = lv.y + lv.h, iw = hw - 0.08, id = hd - 0.08;
    // 外壁の当たりも狭間を抜く。兵の足は腰壁が止め、筒先と矢は穴を通る。
    const wins = windowsFor(I, lv, k);
    if (I.profile === 'moribe') {
      // 窓枠は下の frame で体・槍・手へ同じ寸法を登録する。
      // ここで枠全体を重ねて登録すると、敷居・鴨居の溝まで手を遮り、
      // 開いた障子の見える隙間と操作できる範囲が食い違う。
      const hands = lv.handObstacles || (lv.handObstacles = []);
      if (['yashiki', 'hondo'].includes(I.kind)) {
        // 外周の柱も、見えている十四〜十六センチの木で手・体・槍を止める。
        // 壁芯だけの判定では、室内へ出た柱を斜めに透かして建具を操作できる。
        // 窓脇・戸脇・背面・四隅は描画側の post と同じ柱筋を使う。
        const posts = new Set();
        const handPost = (x, z, width, depth) => {
          const key = `${x}:${z}`;
          if (posts.has(key)) return;
          posts.add(key);
          hands.push({ x0: x - width / 2, x1: x + width / 2,
            z0: z - depth / 2, z1: z + depth / 2, y0: lv.y, y1 });
          // 手だけの当たりでは、壁より室内へ出た柱先を体と槍がすり抜ける。
          // 丸い線分の端まで柱の内側へ納め、戸口や障子の開口は狭めない。
          const r = Math.min(width, depth) / 2;
          seg(I, x - width / 2 + r, z - depth / 2 + r,
            x + width / 2 - r, z + depth / 2 - r, lv.y, y1, r).bodyOverlap = true;
        };
        for (const side of [-1, 1]) {
          for (const end of [-1, 1]) handPost(side * (hw - .16), end * (hd - .16), .14, .14);
          const bays = Math.max(2, Math.round(lv.w / 1.9));
          for (let q = 1; q < bays; q++) handPost(-hw + q * lv.w / bays, -ds * (hd - .16), .16, .14);
          if (k === 0) handPost(I.door.lx + side * (I.door.w / 2 + .08), ds * (hd - .16), .16, .14);
        }
        for (const o of wins) for (const side of [-1, 1]) {
          const t = o.t + side * (o.w / 2 + .08);
          if (o.face === 'z') handPost(t, o.s * (hd - .16), .16, .14);
          else handPost(o.s * (hw - .16), t, .14, .16);
        }
      }
      if (k === 0 && ['yashiki', 'hondo'].includes(I.kind)) {
        // 外壁から室内へ渡す戸口の竪枠も、描いた二センチの板だけで手を止める。
        // 戸口中央や、外壁の前を横滑りする板戸の引手は塞がない。
        for (const side of [-1, 1]) {
          const edge = I.door.lx + side * (I.door.w / 2 - .01);
          const off = ds * (hd - .08);
          hands.push({ x0: edge - .01, x1: edge + .01, z0: off - .15, z1: off + .15,
            y0: lv.y, y1: lv.y + I.door.h });
          // 手だけでなく体と槍も竪枠で受ける。丸い端は板の内側へ納める。
          // 外壁の当たりより室内へ出た見込みまで、描画前から同じ木で止める。
          seg(I, edge, off - .14, edge, off + .14,
            lv.y, lv.y + I.door.h, .01).bodyOverlap = true;
        }
        // 上の見込み板も左右と同じ開口へ納める。跳んで見上げた時に
        // 二センチの木を透かして、反対側の板戸の引手へ届かせない。
        const off = ds * (hd - .08);
        hands.push({ x0: I.door.lx - I.door.w / 2 + .02, x1: I.door.lx + I.door.w / 2 - .02,
          z0: off - .15, z1: off + .15, y0: lv.y + I.door.h - .02, y1: lv.y + I.door.h });
        // 上の板も見える二センチの厚みだけで受け、戸口の中央は空ける。
        // 線分の丸い端を含めても左右の竪枠より外へ当たりを広げない。
        seg(I, I.door.lx - I.door.w / 2 + .17, off,
          I.door.lx + I.door.w / 2 - .17, off,
          lv.y + I.door.h - .02, lv.y + I.door.h, .15).bodyOverlap = true;
      }
    }
    const opening = wins.reduce((n, v) => n + v.w * Math.max(0, v.y1 - v.y0) * (v.shoji ? .45 : 1), 0);
    const light = Math.min(1, opening / Math.max(1, lv.w * lv.d * .12));
    lv.layout.dim = Math.min(.85, .28 + light * (world.def.time === 'night' ? .1 : world.def.time === 'dusk' ? .3 : .5));
    for (const face of ['x', 'z']) for (const sd of [-1, 1]) {
      const len = face === 'z' ? lv.w : lv.d, off = face === 'z' ? id : iw;
      const holes = wins.filter(v => v.face === face && v.s === sd && (!v.shoji || v.sliding || I.profile === 'hieizan' && I.kind === 'sobo'))
        .map(v => ({ t0: v.t - v.w / 2, t1: v.t + v.w / 2, y0: v.y0 + 1.2, y1: v.y1 + 1.2 }));
      if (k === 0 && face === 'z' && sd === ds) holes.push({ t0: I.door.lx - I.door.w / 2, t1: I.door.lx + I.door.w / 2, y0: I.door.rail ? 1.2 + I.door.rail : 0, y1: Math.min(lv.h, I.door.h ?? Math.min(lv.h - .3, 2)) + 1.2 });
      for (const [t0, t1, a0, a1] of facePanels(len, lv.h + 1.2, holes)) {
        // 幅1.1mの戸口に半径.14mの丸い壁端を足すと、人の幅.9mより狭くなる。
        // 戸口に接する壁端だけ、見た目の壁厚.12mに合わせる。
        const jamb = k === 0 && face === 'z' && sd === ds && a0 < 1.2 + (I.door.h ?? 2)
          && (Math.abs(t1 - I.door.lx + I.door.w / 2) < .001 || Math.abs(t0 - I.door.lx - I.door.w / 2) < .001);
        if (face === 'z') {
          const wall = seg(I, t0, sd * off, t1, sd * off, y0 + a0, y0 + a1, jamb ? .06 : .14);
          // 頭上の横木は足だけでなく体の高さで止める。馬のまま低い戸口へ入らない。
          if (k === 0 && sd === ds && a0 > 1.2 && t0 < I.door.lx + I.door.w / 2 && t1 > I.door.lx - I.door.w / 2) wall.bodyOverlap = true;
        }
        else seg(I, sd * off, t0, sd * off, t1, y0 + a0, y0 + a1);
      }
    }
    if (!I.open) for (const v of wins) if (!v.shoji) {
      const off = v.s * ((v.face === 'z' ? hd : hw) - .1);
      // 三本だけの見えない棒を残さず、実際の縦桟・横桟の間を空ける。
      if (hieiWindowBars(I, v, (t, cy, w, h) => {
        const a = t - w / 2 + .02, b = t + w / 2 - .02;
        if (v.face === 'z') seg(I, a, off, b, off, lv.y + cy - h / 2, lv.y + cy + h / 2, .02);
        else seg(I, off, a, off, b, lv.y + cy - h / 2, lv.y + cy + h / 2, .02);
      })) continue;
      // 稲葉山の外の連子は七本。室内側へ別の三本の当たりを置かず、
      // 見える木と同じ間隔・壁からの距離で受ける。設営時だけ作る。
      const exterior = S.quality === 'high' && I.profile === 'inabayama' && v.exteriorLattice && v.latticeStep != null;
      const count = exterior ? 3 : 1, step = exterior ? v.latticeStep : v.w * .3;
      const depth = exterior ? v.latticeOffset : -.1;
      const radius = exterior ? v.latticeWidth / 2 : .025;
      const halfDepth = exterior ? Math.max(.001, .025 - radius) : .025;
      for (let q = -count; q <= count; q++) {
        const t = v.t + q * step;
        if (v.face === 'z') seg(I, t, v.s * (hd + depth) - halfDepth, t, v.s * (hd + depth) + halfDepth, lv.y + v.y0, lv.y + v.y1, radius);
        else seg(I, v.s * (hw + depth) - halfDepth, t, v.s * (hw + depth) + halfDepth, t, lv.y + v.y0, lv.y + v.y1, radius);
      }
    }
    if (I.profile === 'moribe') for (const v of wins) {
      if (!v.shoji || !v.sliding) continue;
      // 開いた明かり障子の見込み板・敷居・鴨居も、描いた木の範囲で受ける。
      // 壁芯だけの当たりでは室内へ出た窓枠を槍や手が透かしてしまう。
      // 窓の中央と二本の溝は空け、設営時にだけ既存の当たりへ登録する。
      const across = v.s * ((v.face === 'z' ? hd : hw) - .04);
      const hands = lv.handObstacles || (lv.handObstacles = []);
      const frame = (t0, t1, a0, a1, bottom, top) => {
        const x0 = v.face === 'z' ? t0 : a0, x1 = v.face === 'z' ? t1 : a1;
        const z0 = v.face === 'z' ? a0 : t0, z1 = v.face === 'z' ? a1 : t1;
        const low = lv.y + bottom, high = lv.y + top;
        hands.push({ x0, x1, z0, z1, y0: low, y1: high });
        const r = Math.min(x1 - x0, z1 - z0) / 2;
        seg(I, x0 + r, z0 + r, x1 - r, z1 - r, low, high, r).bodyOverlap = true;
      };
      for (const side of [-1, 1]) {
        const t = v.t + side * (v.w / 2 + .025);
        frame(t - .025, t + .025, across - .15, across + .15, v.y0, v.y1);
      }
      // 下地の木と溝脇の木を分け、二本の溝だけを戸の通り道として空ける。
      // 溝の深さ全体を空けると、開いた障子の敷居・鴨居の縁を槍と手が透かす。
      frame(v.t - v.w / 2 - .1, v.t + v.w / 2 + .1,
        across - .15, across + .15, v.y0 - .08, v.y0 - .008);
      frame(v.t - v.w / 2 - .1, v.t + v.w / 2 + .1,
        across - .15, across + .15, v.y1 + .03, v.y1 + .08);
      // 描画の railBox と同じ位置へ登録する。溝は壁の向きによらず
      // 窓芯から前後四センチ、幅六・四センチ。設営時だけ作る。
      const windowAxis = v.s * ((v.face === 'z' ? hd : hw) - .1);
      // 描画と同じ排水欠きを当たりにも残す。溝間と外縁だけを欠き、
      // 内側の縁・鴨居・敷居の下地は木として受ける（設営時だけ）。
      const half = (v.w + .2) / 2, drain = v.w / 2 - .04;
      const sillLip = (back, front) => {
        const outward = v.s > 0 ? back >= windowAxis - .008 - .0001
          : front <= windowAxis + .008 + .0001;
        if (!outward) {
          frame(v.t - half, v.t + half, back, front, v.y0 - .008, v.y0);
          return;
        }
        const cuts = [-half, -drain - .012, -drain + .012,
          drain - .012, drain + .012, half];
        for (let q = 0; q < cuts.length; q += 2) {
          frame(v.t + cuts[q], v.t + cuts[q + 1], back, front, v.y0 - .008, v.y0);
        }
      };
      let edge = across - .15;
      for (const end of [windowAxis - .072, windowAxis + .008, across + .15]) {
        if (end > edge) {
          sillLip(edge, end);
          frame(v.t - v.w / 2 - .1, v.t + v.w / 2 + .1,
            edge, end, v.y1, v.y1 + .03);
        }
        edge = end + .064;
      }
    }
    if (!I.open && I.profile === 'okehazama') for (const v of wins) {
      if (v.shoji || v.grilleOffset == null) continue;
      // 内側へ張り出した窓枠は外壁の当たりでは覆えない。開口は空け、木部だけを止める。
      // 形の長手を線分にし、壁厚と枠幅を同じ寸法で受ける。設営時だけ登録する。
      okeWindowFrame(v, hw, hd, lv.h, (x, y, z, w, h, d) => {
        const radius = Math.min(w, d) / 2;
        const dx = w / 2 - radius, dz = d / 2 - radius;
        seg(I, x - dx, z - dz, x + dx, z + dz,
          lv.y + y - h / 2, lv.y + y + h / 2, radius).bodyOverlap = true;
      });
    }
    // 高い格子窓の前には踏み台。低い窓や井楼には置かない。
    lv.firingSteps = [];
    for (const v of wins) if (!v.shoji && v.y0 > 1.8) {
      // 狭間の踏み台で入口の足場を持ち上げない。戸口と人一人ぶんの幅を空ける。
      if (k === 0 && v.face === 'z' && v.s === ds && Math.abs(v.t - I.door.lx) < (v.w + I.door.w) / 2 + .6) continue;
      const across = v.s * ((v.face === 'z' ? hd : hw) - .6), yy = lv.y + v.y0 - 1.25;
      v.stepY = yy - lv.y;
      const lx = v.face === 'z' ? v.t : across, lz = v.face === 'z' ? across : v.t;
      const [cx, cz] = I.P(lx, lz), [ax, az] = I.P(lx - (v.face === 'x' ? v.s * 1.1 : 0), lz - (v.face === 'z' ? v.s * 1.1 : 0));
      const angle = rot + (v.face === 'x' ? Math.PI / 2 : 0);
      addRamp({ ax, az, bx: cx, bz: cz, w: v.w, ya: lv.y, yb: yy, inner: true });
      const stepId = addDeck({ cx, cz, rot: angle, x0: -v.w / 2, x1: v.w / 2, z0: -.3, z1: .3, y: yy, roof: lv.y + lv.h, name: '狭間の踏み台' });
      FL.decks[stepId].interior = true;
      lv.firingSteps.push({ x: lx, z: lz, y: yy, w: v.face === 'z' ? v.w : .6, d: v.face === 'z' ? .6 : v.w });
    }
    // 狭間の持ち場と目線。設営時に作り、射手と本人の視点で使い回す。
    lv.shots = wins.filter(v => !v.shoji).map(v => {
      const lx = v.face === 'z' ? v.t : v.s * (hw - .6);
      const lz = v.face === 'z' ? v.s * (hd - .6) : v.t;
      const [x, z] = I.P(lx, lz);
      // 射手の足元は実際の踏み台に合わせる。戸口で踏み台を省いた窓は板床の高さ。
      const y = lv.y + (v.stepY || 0);
      return { x, z, y, lx, lz, face: v.face, s: v.s, t: v.t, w: v.w,
        y0: lv.y + v.y0, y1: lv.y + v.y1,
        heading: rot + (v.face === 'z' ? v.s > 0 ? 0 : Math.PI : v.s * Math.PI / 2) };
    });
    // 本堂の内陣・遠侍の座敷・小祠の神前も、見える床組みと同じ高さで歩く。敷居まで床を通す。
    const raisedBoards = I.profile === 'inabayama' && (['kura', 'bansho', 'nagaya'].includes(I.kind)
      || S.quality === 'high' && ['hondo', 'tamari', 'shrine'].includes(I.kind));
    if (raisedBoards || I.kind === 'goten' && lv.layout.rooms[0].raised !== false) {
      // 遠侍を分けた時も、奥の控えだけでなく取次の畳まで床を通す。
      const raisedRooms = S.quality === 'high' && I.profile === 'inabayama' && I.kind === 'tamari'
        ? lv.layout.rooms.filter(r => r.y > 0) : [lv.layout.rooms[0]];
      // 稲葉山の上段は、見えている床組みの端と襖の敷居まで歩ける床を通す。
      // 周囲を引くと、畳の端や戸口だけ足元が下の広間へ沈む。
      const fullRaisedFloor = raisedBoards || S.quality === 'high' && I.profile === 'inabayama' && I.kind === 'goten';
      for (const r of raisedRooms) for (const v of lv.pieces) {
        const insetX = fullRaisedFloor ? 0 : .15, insetZ = fullRaisedFloor ? 0 : .2;
        const x0 = Math.max(r.x0 + insetX, v[0]), x1 = Math.min(r.x1 - insetX, v[1]), z0 = Math.max(r.z0 + insetZ, v[2]), z1 = Math.min(r.z1 - insetZ, v[3]);
        if (x1 <= x0 || z1 <= z0) continue;
        const [cx, cz] = I.P((x0 + x1) / 2, (z0 + z1) / 2);
        const id = addDeck({ cx, cz, x0: -(x1 - x0) / 2, x1: (x1 - x0) / 2, z0: -(z1 - z0) / 2, z1: (z1 - z0) / 2, rot, y: lv.y + (r.y || .16), roof: lv.y + lv.h, name: raisedBoards ? r.name : '上段の間' });
        FL.decks[id].interior = true;
      }
    }
    for (const stair of [I.stairs[k], I.stairs[k - 1]]) if (stair) {
      const lane = { x0: -stair.L / 2 - .8, x1: stair.L / 2 + .8, z0: stair.hole.z0 - .3, z1: stair.hole.z1 + .3 };
      lv.layout.walls = lv.layout.walls.flatMap(v => {
        if (Math.abs(v.az - v.bz) < .01 && v.az > lane.z0 && v.az < lane.z1) {
          const a = Math.min(v.ax, v.bx), b = Math.max(v.ax, v.bx), out = [];
          if (a < lane.x0) out.push({ ...v, ax: a, bx: Math.min(b, lane.x0) });
          if (b > lane.x1) out.push({ ...v, ax: Math.max(a, lane.x1), bx: b });
          return out;
        }
        if (Math.abs(v.ax - v.bx) < .01 && v.ax > lane.x0 && v.ax < lane.x1) {
          const a = Math.min(v.az, v.bz), b = Math.max(v.az, v.bz), out = [];
          if (a < lane.z0) out.push({ ...v, az: a, bz: Math.min(b, lane.z0) });
          if (b > lane.z1) out.push({ ...v, az: Math.max(a, lane.z1), bz: b });
          return out;
        }
        return [v];
      });
    }
    // 型の間仕切り。戸口・階段の動線を空け、紙だけ槍が通る。
    if (I.kind === 'goten') I.okuZ = -ds * (hd - lv.d * (I.oku || .4));
    for (const wall of lv.layout.walls) {
      const v = okeFixedPanel(lv.layout, wall);
      if (I.profile === 'okehazama' && ['bansho', 'minka', 'hondo'].includes(I.kind) && v.paper && !v.guideOnly) {
        // 建具の上の鴨居・長押・小壁を紙扱いにしない。絵と同じ内法で当たりを分ける。
        const ph = ['bansho', 'minka'].includes(I.kind) ? Math.min(2, lv.h - .2) : lv.h > 3 ? 2.3 : lv.h;
        // 固定格子は空隙と木部を分ける。面で体を止め、槍は描いた木にだけ当てる。
        const woodenLattice = I.kind === 'hondo' && v.kind !== 'shoji';
        // 固定側も動く戸と同じ厚さ六センチ。線分端の丸みを框の内側へ戻し、
        // 戸口へ八センチ張り出す見えない面で、開いた戸への接近を妨げない。
        const panelLen = Math.hypot(v.bx - v.ax, v.bz - v.az);
        const panelR = Math.min(.03, panelLen / 2);
        const insetX = (v.bx - v.ax) / panelLen * panelR;
        const insetZ = (v.bz - v.az) / panelLen * panelR;
        seg(I, v.ax + insetX, v.az + insetZ, v.bx - insetX, v.bz - insetZ,
          lv.y + .06, lv.y + ph, panelR).fusuma = true;
        if (woodenLattice) {
          const len = v.bx - v.ax, count = Math.ceil(len / .9), width = len / count;
          for (let j = 0; j < count; j++) {
            const x = v.ax + (j + .5) * width;
            // 固定側も引き戸と同じ原寸の木組みを伸ばす。框・縦格子の
            // 太さと上下端を絵へ合わせ、透かしに見えない木の当たりを残さない。
            nakaLatticeMembers(width, ph - .06, width / .9, (ax, az, bx, bz, low, high, r) => {
              seg(I, x + ax, v.az + az, x + bx, v.az + bz, lv.y + .06 + low, lv.y + .06 + high, r);
            }, true);
          }
        }
        // 固定建具の敷居は木。紙の面と分け、描いた下框へ矢や槍を通さない。
        // 敷居の端も描いた木口で止める。引き込み側の敷居は戸の仕組みが受け持つ。
        const sillR = Math.min(.07, panelLen / 2);
        const sillX = (v.bx - v.ax) / panelLen * sillR;
        const sillZ = (v.bz - v.az) / panelLen * sillR;
        seg(I, v.ax + sillX, v.az + sillZ, v.bx - sillX, v.bz - sillZ,
          lv.y - .04, lv.y + .06, sillR);
        // 固定側の敷居も、溝の底と両脇の縁を分ける。
        // 溝まで上端の高さで埋めず、室内部品の幅 .036m の溝縁だけを木として止める。
        const ux = (v.bx - v.ax) / panelLen, uz = (v.bz - v.az) / panelLen;
        for (const offset of [-.052, .052]) {
          const radius = Math.min(.018, panelLen / 2);
          seg(I, v.ax + ux * radius - uz * offset, v.az + uz * radius + ux * offset,
            v.bx - ux * radius - uz * offset, v.bz - uz * radius + ux * offset,
            lv.y + .06, lv.y + .072, radius);
        }
        const grooveR = Math.min(.034, panelLen / 2);
        seg(I, v.ax + ux * grooveR, v.az + uz * grooveR,
          v.bx - ux * grooveR, v.bz - uz * grooveR, lv.y + .06, lv.y + .061, grooveR);
        if (!woodenLattice) {
          // 固定の襖・障子の木框まで紙として突き抜けていたため、紙面から分ける。
          // 固定襖も動く襖と同じ原寸から伸ばし、框の当たりを絵の倍率へ合わせる。
          // 設営時にだけ登録し、戸口や滑る戸の溝へ当たりを張り出させない。
          const len = Math.hypot(v.bx - v.ax, v.bz - v.az), count = Math.ceil(len / .9);
          const width = len / count, ux = (v.bx - v.ax) / len, uz = (v.bz - v.az) / len;
          const bottom = lv.y + .06, top = lv.y + ph;
          const shoji = I.kind === 'hondo' && v.kind === 'shoji';
          const scaled = shoji || v.kind === 'fusumaPlain';
          const fw = .04 * (scaled ? width / .9 : 1), fh = .04 * (scaled ? (ph - .06) / 1.8 : 1);
          for (let i = 0; i < count; i++) {
            const left = i * width, right = (i + 1) * width;
            if (v.kind === 'fusumaPlain') {
              // 固定襖の木骨も動く襖と同じ寸法で止め、紙面とは分ける。
              const center = (left + right) / 2;
              // 室内部品と同じく右戸を半回転し、引き手の下地板も召し合わせ側へ向ける。
              // 左右対称の木骨だけでなく、片側にある下地の当たりまで絵へそろえる。
              const direction = i % 2 ? -1 : 1;
              nakaFusumaMembers(width, top - bottom, (ax, az, bx, bz, low, high, r) => {
                ax *= direction; az *= direction; bx *= direction; bz *= direction;
                seg(I, v.ax + ux * (center + ax) - uz * az, v.az + uz * (center + ax) + ux * az,
                  v.ax + ux * (center + bx) - uz * bz, v.az + uz * (center + bx) + ux * bz,
                  bottom + low, bottom + high, r);
              });
            }
            if (shoji) nakaDoorStiles(width, top - bottom, i % 2 ? -1 : 1, .48, .12,
              (ax, az, bx, bz, low, high, radius) => {
                const center = (left + right) / 2;
                seg(I, v.ax + ux * (center + ax) - uz * az, v.az + uz * (center + ax) + ux * az,
                  v.ax + ux * (center + bx) - uz * bz, v.az + uz * (center + bx) + ux * bz,
                  bottom + low, bottom + high, radius);
              });
            else for (const t of [left + fw / 2, right - fw / 2]) {
              const x = v.ax + ux * t, z = v.az + uz * t;
              const radius = Math.min(fw / 2, .03), half = .03 - radius;
              seg(I, x - uz * half, z + ux * half, x + uz * half, z - ux * half,
                bottom, top, radius);
            }
            for (const [low, high] of [[bottom, bottom + fh], [top - fh, top]]) {
              // 横框の木口は実際の縦框の内面へ納める。動く戸と同じ倍率で止める。
              const radius = Math.min(.03, (width - 2 * fw) / 2);
              seg(I, v.ax + ux * (left + fw + radius), v.az + uz * (left + fw + radius),
                v.ax + ux * (right - fw - radius), v.az + uz * (right - fw - radius), low, high, radius);
            }
          }
        }
        if (I.kind === 'hondo' && v.kind === 'shoji') {
          // 固定側も動く腰障子と同じ木部だけを止める。鏡板を框の厚みまで膨らませない。
          const len = v.bx - v.ax, count = Math.ceil(len / .9), width = len / count;
          for (let j = 0; j < count; j++) {
            const x = v.ax + (j + .5) * width;
            nakaShojiMembers(width, ph - .06, (ax, az, bx, bz, low, high, r) => {
              seg(I, x + ax, v.az + az, x + bx, v.az + bz, lv.y + .06 + low, lv.y + .06 + high, r);
            });
          }
        }
        if (lv.y + ph < y1) {
          if (woodenLattice) addNakaTransomSolids(I, lv, Math.min(v.ax, v.bx), Math.max(v.ax, v.bx), v.az, ph);
          else {
            const upper = seg(I, v.ax, v.az, v.bx, v.bz, lv.y + ph, y1, .08);
            upper.bodyOverlap = true;
          }
        }
      } else if (I.profile === 'moribe') {
      // 森部の紙の間仕切りでも、上の鴨居・小壁は木と土。戸と一緒に槍を通さない。
      const ph = I.profile === 'moribe' ? I.kind === 'yashiki' ? Math.min(2.2, lv.h) : lv.h > 3 ? 2.3 : lv.h : lv.h;
      // 薬師堂の腰板付き格子戸は紙の襖ではない。脇の木製建具も槍を受ける。
      seg(I, v.ax, v.az, v.bx, v.bz, y0, lv.y + ph, .08).fusuma = v.paper && !(I.profile === 'moribe' && I.kind === 'hondo');
      if (I.profile === 'moribe' && I.kind === 'yashiki' && v.paper && !v.guideOnly) {
        // 固定の襖・障子も紙だけを槍が通る。動く戸と同じ框幅を使い、
        // 脇の建具の木枠まで紙扱いにしない。体の当たりは既存の壁に任せる。
        // furnishLayout と同じ柱際の遊び・召合せ・二本の溝へ設営時だけ登録する。
        const len = Math.hypot(v.bx - v.ax, v.bz - v.az), inset = .072;
        const span = len - inset * 2, count = Math.ceil(span / .9);
        const width = (span + .024 * (count - 1)) / count;
        const ux = (v.bx - v.ax) / len, uz = (v.bz - v.az) / len;
        const bottom = .07 - .006, height = ph + .028 - bottom, radius = .03;
        for (let j = 0; j < count; j++) {
          const start = inset + j * (width - .024), track = j % 2 ? .04 : -.04;
          const [ax, az] = I.P(v.ax + ux * (start + radius) + uz * track,
            v.az + uz * (start + radius) + ux * track);
          const [bx, bz] = I.P(v.ax + ux * (start + width - radius) + uz * track,
            v.az + uz * (start + width - radius) + ux * track);
          INTERIOR_WALLS.push({ k: 's', ax, az, bx, bz, r: radius, naka: I.id,
            yBot: lv.y + bottom, yTop: lv.y + bottom + height, fusuma: true,
            paperFrameX: .04 * width / .9, paperFrameY: .04 * height / 1.8,
            paperLattice: v.kind === 'shoji',
            paperEdgeInset: radius,
            x0: Math.min(ax, bx) - radius, x1: Math.max(ax, bx) + radius,
            z0: Math.min(az, bz) - radius, z1: Math.max(az, bz) + radius });
        }
      }
      if (ph < lv.h) seg(I, v.ax, v.az, v.bx, v.bz, lv.y + ph, y1, .08).bodyOverlap = true;
      } else {
      if (S.quality !== 'high' || I.profile !== 'inabayama' || !v.paper || v.guideOnly) {
      if (I.profile === 'hieizan' && v.paper) {
        // 襖・障子・格子の上は鴨居と小壁。紙の建具と分け、頭上まで紙扱いにしない。
        const ph = hieiPartitionHeight(I.kind, lv.h);
        // 堂の固定格子も動く格子戸と同じ木の当たり。僧坊の襖・障子と分ける。
        seg(I, v.ax, v.az, v.bx, v.bz, y0, lv.y + ph, .08).fusuma = !['chudo', 'hondo', 'temple'].includes(I.kind);
        if (I.kind === 'sobo' && !v.guideOnly && Math.abs(v.az - v.bz) <= .01) {
          // 共通の室内部品が立てる幅十二センチの端柱は、紙越しの槍も止める。
          // 紙の当たりの内側で木部を分け、戸口と引き込み先の幅は保つ。
          const a = Math.min(v.ax, v.bx), b = Math.max(v.ax, v.bx);
          const postWidth = Math.min(.12, (b - a) / 2);
          if (postWidth > .001) {
            seg(I, a, v.az, a + postWidth, v.az, y0, lv.y + ph, .06);
            seg(I, b - postWidth, v.az, b, v.az, y0, lv.y + ph, .06);
          }
        }
        if (ph < lv.h) seg(I, v.ax, v.az, v.bx, v.bz, lv.y + ph, y1, .08);
      } else seg(I, v.ax, v.az, v.bx, v.bz, y0, y1, .08).fusuma = v.paper;

        continue;
      }
      // 固定の建具も動く戸と同じ内法高で分ける。
      // 上段・内陣の床下と、鴨居から天井までの小壁を紙扱いにしない。
      const sillY = lv.y + (v.sill || 0);
      // 梁を見せる小祠の神前は、固定格子の当たりも梁下の建具高に揃える。
      const headY = lv.y + Math.min(2.3, lv.h - (I.kind === 'shrine' ? .4 : .2));
      if (sillY > y0) seg(I, v.ax, v.az, v.bx, v.bz, y0, sillY, .08);
      // 本堂の内陣境と小祠の神前は木格子。動く格子戸と固定格子で材の当たりを揃える。
      const lattice = v.kind === 'koshi' || I.kind === 'hondo';
      seg(I, v.ax, v.az, v.bx, v.bz, sillY, headY, .08).fusuma = !lattice;
      if (!lattice && ['goten', 'tamari'].includes(I.kind)) {
        // 襖・障子の紙は槍を通すが、両端と柱間の角柱は木として受ける。
        // 固定建具と同じ一・八歩以内の柱割り・九センチ幅・十四センチの見込み。
        // 当たりは柱の芯だけへ設営時に足し、前後の引き戸の溝と中央の口を空ける。
        const len = Math.hypot(v.bx - v.ax, v.bz - v.az);
        if (len > .09) {
          const dx = (v.bx - v.ax) / len, dz = (v.bz - v.az) / len;
          const spans = Math.max(1, Math.ceil(len / 1.8));
          for (let j = 0; j <= spans; j++) {
            const along = j === 0 ? .045 : j === spans ? len - .045 : len * j / spans;
            const x = v.ax + dx * along, z = v.az + dz * along;
            seg(I, x - dz * .025, z + dx * .025, x + dz * .025, z - dx * .025,
              sillY, headY, .045);
          }
        }
      }
      if (headY < y1) seg(I, v.ax, v.az, v.bx, v.bz, headY, y1, .08).bodyOverlap = true;
      }
    }
    if (I.profile === 'okehazama' && ['bansho', 'minka', 'hondo'].includes(I.kind)) {
      // 内張りより室内へ張り出す柱も木として止める。壁の当たりだけでは柱へ体が埋まる。
      // buildInside と同じ柱割り・戸脇位置。設営時だけ登録し、戸口の幅は保つ。
      for (const face of ['z', 'x']) for (const sd of [-1, 1]) {
        const len = face === 'z' ? lv.w : lv.d;
        const off = (face === 'z' ? hd : hw) - .16;
        const column = t => {
          // buildInside の壁面は半幅から .1、柱心はさらに .06 内側。
          // off は既にその柱心なので、もう一度 .06 引いて見えない出っ張りを作らない。
          // 戸脇も同じ位置で止め、引き戸へ寄る時に柱の手前で体が止まるのを防ぐ。
          const center = sd * off;
          // 堂の柱は舟肘木の下面で止める。柱頭を受け木・天井まで貫通させない。
          const top = I.kind === 'hondo' ? lv.y + lv.h - .3 : y1;
          if (face === 'z') seg(I, t - .01, center, t + .01, center, lv.y, top, .07);
          else seg(I, center, t - .01, center, t + .01, lv.y, top, .07);
        };
        const hutFrame = I.kind === 'bansho' || I.kind === 'minka';
        const n = hutFrame ? okeHutBays(len) : Math.max(2, Math.round(len / 1.9));
        for (let q = 0; q <= n; q++) {
          // 隅柱は前後の面で一度だけ登録する。側壁の柱心と交わる位置へそろえ、
          // 二本の柱が隅を挟んで離れて立つ形と、重複した当たりをなくす。
          const corner = q === 0 || q === n;
          const t = corner ? (q === 0 ? -1 : 1) * (len / 2 - .16)
            : hutFrame ? okeHutPost(len, q) : -len / 2 + q * len / n;
          if (k === 0 && face === 'z' && sd === ds && Math.abs(t - I.door.lx) < I.door.w / 2 + .2) continue;
          if (face === 'z' || !corner) column(t);
          if (I.kind === 'hondo') {
            // 堂の外周の舟肘木も内陣境と同様に、描いた木部の高さだけ止める。
            const ct = Math.max(-len / 2 + .26, Math.min(len / 2 - .26, t));
            const bracket = (half, radius, low, high) => {
              if (face === 'z') seg(I, ct - half, sd * (off - .04), ct + half, sd * (off - .04), lv.y + low, lv.y + high, radius).bodyOverlap = true;
              else seg(I, sd * (off - .04), ct - half, sd * (off - .04), ct + half, lv.y + low, lv.y + high, radius).bodyOverlap = true;
            };
            bracket(.15, .11, lv.h - .3, lv.h - .14);
            bracket(.18, .12, lv.h - .16, lv.h - .08);
          }
        }
        if (k === 0 && face === 'z' && sd === ds) for (const side of [-1, 1]) {
          const t = I.door.lx + side * (I.door.w / 2 + .08);
          column(t);
          if (I.kind === 'hondo') {
            // 入口の戸脇柱も桁を舟肘木で受ける。高い木部だけ止め、格子戸の内法は空ける。
            seg(I, t - .15, sd * (off - .04), t + .15, sd * (off - .04),
              y1 - .3, y1 - .14, .11).bodyOverlap = true;
            seg(I, t - .18, sd * (off - .04), t + .18, sd * (off - .04),
              y1 - .16, y1 - .08, .12).bodyOverlap = true;
          }
        }
      }
      // 間仕切りの端を側壁の柱で受ける推定復元。紙の固定建具とは別に木として止める。
      // 開いた脇口の戸板の端より外へ納め、左右の引き込みと通れる幅を保つ。
      for (let j = 0; j + 1 < lv.layout.rooms.length; j++) {
        const z = lv.layout.rooms[j].z1;
        for (const side of [-1, 1]) {
          const x = side * (hw - .16);
          // 堂の間仕切り端も外周柱と同じく舟肘木の下面で止める。
          // 柱を天井まで通すと肘木・受け木・回縁を貫き、見えない木の当たりも残る。
          const postTop = I.kind === 'hondo' ? lv.h - .3 : lv.h;
          seg(I, x, z - .02, x, z + .02, lv.y, lv.y + postTop, .05);
          if (I.kind === 'hondo') {
            // 間仕切り端の柱頭も外周の舟肘木で受ける。絵と同じ木部だけ止める。
            // 既存の柱頭に近い所は重ねず、障子・格子戸の内法を空ける。
            const n = Math.max(2, Math.round(lv.d / 1.9));
            const regular = -hd + Math.round((z + hd) * n / lv.d) * lv.d / n;
            // 半幅 .3m の受け木から外れた障子境にも柱頭を残す。
            // 隣の受け木の端から一センチ離し、絵と同じ幅だけ止める。
            const distance = Math.abs(z - regular), span = Math.min(.6, 2 * (distance - .31));
            if (distance >= .5) {
              const boatHalf = Math.min(.26, span / 2) - .11, seatHalf = span / 2 - .12;
              seg(I, side * (hw - .2), z - boatHalf, side * (hw - .2), z + boatHalf,
                y1 - .3, y1 - .14, .11).bodyOverlap = true;
              seg(I, side * (hw - .2), z - seatHalf, side * (hw - .2), z + seatHalf,
                y1 - .16, y1 - .08, .12).bodyOverlap = true;
            }
          }
        }
      }
    }
    if (!I.open && I.profile === 'okehazama' && ['bansho', 'minka'].includes(I.kind)) {
      // 木がある高さだけ止める。鴨居の下や襖口に見えない壁を作らない。
      okeRoomBeams(lv, (x, y, z, w, h, d) => {
        const radius = Math.min(w, d) / 2;
        const dx = w > d ? w / 2 - radius : 0;
        const dz = d > w ? d / 2 - radius : 0;
        seg(I, x - dx, z - dz, x + dx, z + dz, y - h / 2, y + h / 2, radius).bodyOverlap = true;
      });
    }
    if (I.profile === 'okehazama' && I.kind === 'hondo') {
      // 内陣の中央柱は左右の脇口の外。絵と同じ幅・奥行きで、木の柱として止める。
      const z = lv.layout.rooms[0].z1;
      seg(I, -.01, z, .01, z, lv.y, lv.y + lv.h - .4, .07);
      // 内陣境だけでなく、入口の障子境の桁も描いた位置で止める。
      // buildInside と同じ部屋の境を使い、格子戸・障子の内法へは下げない。
      if (!I.open) for (let j = 0; j + 1 < lv.layout.rooms.length; j++) {
        const boundary = lv.layout.rooms[j].z1;
        seg(I, -lv.w / 2 + .22, boundary, lv.w / 2 - .22, boundary,
          lv.y + lv.h - .16, lv.y + lv.h, .12).bodyOverlap = true;
      }
      // 室内部品と同じく、内陣境と障子境の戸脇柱の舟肘木を木として止める。
      // 設営時だけ登録し、引き戸の動きや通れる高さは変えない。
      // 外周の舟肘木と同じく体高も見る。跳んだ時に足が木より低くても、
      // 頭や肩だけが柱頭・受け木へ入り込まない。木の下の通り道は残す。
      const pillarHead = (x, boundary = z) => {
        // 舟肘木と受け木は室内部品と同じ高さ。桁内の角材の当たりも残さない。
        seg(I, x - .15, boundary, x + .15, boundary, lv.y + lv.h - .4, lv.y + lv.h - .24, .11).bodyOverlap = true;
        seg(I, x - .18, boundary, x + .18, boundary, lv.y + lv.h - .24, lv.y + lv.h - .16, .12).bodyOverlap = true;
      };
      pillarHead(0);
      for (const p of lv.layout.portals) {
        if (Math.abs(p.z - z) > .01 && p.kind !== 'shoji') continue;
        let l = -Infinity, r = Infinity;
        for (const v of lv.layout.walls) {
          if (Math.abs(v.az - p.z) > .01 || Math.abs(v.bz - p.z) > .01) continue;
          const a = Math.min(v.ax, v.bx), b = Math.max(v.ax, v.bx);
          if (b <= p.x && b > l) l = b;
          if (a >= p.x && a < r) r = a;
        }
        if (Number.isFinite(l) && Number.isFinite(r)) {
          pillarHead(l - .06, p.z); pillarHead(r + .06, p.z);
        }
      }
    }
    if (I.profile === 'moribe') {
      // 紙の間仕切りでも十四センチ角の柱は槍を止める。
      // 描画と同じ両端だけへ当たりを置き、開いた戸口は空ける。
      const posts = new Set();
      for (const v of lv.layout.walls) {
        if (v.guideOnly) continue;
        for (const [x, z] of [[v.ax, v.az], [v.bx, v.bz]]) {
          const key = `${x}:${z}`;
          if (posts.has(key)) continue;
          posts.add(key);
          // 間仕切り端の柱は下で登録する側壁の通し柱と共用し、手と体の当たりも一本にする。
          if (!I.open && ['hondo', 'yashiki'].includes(I.kind)
            && Math.abs(Math.abs(x) - (hw - .16)) < .001) continue;
          // 戸脇柱の頭は間仕切り梁の下面で止める。梁・小壁は別の当たりで受ける。
          const postTop = ['hondo', 'yashiki'].includes(I.kind) ? y1 - .28 : y1;
          seg(I, x, z, x, z, lv.y, postTop, .07).bodyOverlap = true;
          // 戸脇柱は手も止める。壁芯を横切らない斜めの操作でも、
          // 十四センチ角の木を透かして襖・格子戸の引手へ届かせない。
          // 調度と共通の判定へ設営時に登録し、毎コマの形は増やさない。
          (lv.handObstacles || (lv.handObstacles = [])).push({
            x0: x - .07, x1: x + .07, z0: z - .07, z1: z + .07, y0: lv.y, y1: postTop,
          });
        }
      }
    }
    if (I.profile === 'moribe' && !I.open && ['yashiki', 'hondo'].includes(I.kind)) {
      // 入口の見せる梁は天井より三十二センチ下がる。見える木だけに当たりを置き、
      // 梁の下の出入りは残す。近づいて内装を描く前から同じ位置で受ける。
      const entry = lv.layout.rooms[lv.layout.rooms.length - 1];
      const beamZ = (entry.z0 + entry.z1) / 2;
      // 梁は手も止める。跳び上がった時も、見える木を透かして建具の引手へ届かせない。
      // 入口と間仕切りは描画と同じ幅・成・見込みで登録し、梁の下は空ける。
      // 間仕切りの体の当たりは上の小壁・戸口の鴨居が受け持つ。
      const hands = lv.handObstacles || (lv.handObstacles = []);
      // 描画の seatedBeam と同じく、頭貫へ掛ける両端の上側を欠く。
      // 一本の当たりで覆うと、欠いた空間にも見えない木が残ってしまう。
      // 中央と左右の木口に分け、体・槍・引手へ伸ばす手を見える木だけで受ける。
      const beamPart = (x0, x1, z0, z1, bottom, top, body) => {
        const y0 = lv.y + lv.h + bottom, y1 = lv.y + lv.h + top;
        hands.push({ x0, x1, z0, z1, y0, y1 });
        if (body) {
          const r = Math.min(x1 - x0, z1 - z0) / 2;
          seg(I, x0 + r, z0 + r, x1 - r, z1 - r, y0, y1, r).bodyOverlap = true;
        }
      };
      if (k === 0) {
        // 外装の戸口を包む見込み板も、描いた二センチの木だけで受ける。
        // 壁芯の当たりだけでは室内へ出た板を手や槍がすり抜ける。
        // 外の板戸の溝より奥で止め、開けた戸口の内法は絵とそろえる。
        const halfDoor = I.door.w / 2, doorH = I.door.h;
        const back = ds > 0 ? hd - .23 : -hd - .07;
        const front = ds > 0 ? hd + .07 : -hd + .23;
        for (const side of [-1, 1]) {
          const x = I.door.lx + side * (halfDoor - .01);
          beamPart(x - .01, x + .01, back, front, -lv.h, doorH - lv.h, true);
        }
        beamPart(I.door.lx - halfDoor + .02, I.door.lx + halfDoor - .02,
          back, front, doorH - .02 - lv.h, doorH - lv.h, true);
      }
      // 隅柱と窓脇柱は壁より室内へ出る。窓枠だけの当たりでは柱の木を
      // 透かして障子の引手へ届くため、描画の post と同じ柱身も登録する。
      // 隅柱は正背面で一度だけ作る割り付けに合わせ、戸口や溝は狭めない。
      for (const sideX of [-1, 1]) for (const sideZ of [-1, 1]) {
        const x = sideX * (hw - .16), z = sideZ * (hd - .16);
        beamPart(x - .07, x + .07, z - .07, z + .07, -lv.h, 0, true);
      }
      for (const win of wins) {
        if (!win.shoji || !win.sliding) continue;
        for (const side of [-1, 1]) {
          const t = win.t + side * (win.w / 2 + .08);
          if (win.face === 'z') {
            const z = win.s * (hd - .16);
            beamPart(t - .08, t + .08, z - .07, z + .07, -lv.h, 0, true);
          } else {
            const x = win.s * (hw - .16);
            beamPart(x - .07, x + .07, t - .08, t + .08, -lv.h, 0, true);
          }
        }
      }
      // 柱より室内へ出る長押にも、描いた十センチ角の木だけ当たりを付ける。
      // 壁の当たりだけでは十一センチ出た木へ体と槍が入り、跳ぶと木越しに引手へ届く。
      // 正背面へ側面の木口を突き付ける割り付けも描画とそろえ、設営時だけ登録する。
      const nageshi = (I.kind === 'yashiki' ? 2.32 : 2.72) - lv.h;
      for (const side of [-1, 1]) {
        const z = side * (hd - .28), x = side * (hw - .28);
        beamPart(-hw + .13, hw - .13, z - .05, z + .05,
          nageshi - .05, nageshi + .05, true);
        beamPart(x - .05, x + .05, -hd + .33, hd - .33,
          nageshi - .05, nageshi + .05, true);
      }
      const seatedBeam = (z, bottom, top, depth, body = false) => {
        beamPart(-hw + .23, hw - .23, z - depth / 2, z + depth / 2, bottom, top, body);
        for (const side of [-1, 1]) {
          const x = side * (hw - .165);
          beamPart(x - .065, x + .065, z - depth / 2, z + depth / 2, bottom, -.2, body);
        }
      };
      seatedBeam(beamZ, -.32, -.08, .17, true);
      // 入口と間仕切りの梁を受ける側柱は、描く十四×十六センチの木で受ける。
      // 壁だけの当たりでは室内へ出た柱先を体と槍がすり抜け、
      // 柱越しに建具を操作できる。梁と同じく室内を描く前に登録する。
      // 描画側の post(p.z) と同じ列へそろえる。入口の一本だけで済ませると、
      // 格子戸・襖・障子の脇で側柱を透かして手が届いてしまう。
      const sidePosts = new Set([beamZ, ...lv.layout.portals.map(p => p.z)]);
      for (const postZ of sidePosts) for (const side of [-1, 1]) {
        const x = side * (hw - .16);
        // 描画側と同じく、入口の柱は深い梁の下面、間仕切りはその梁の下面まで。
        const postTop = y1 - (Math.abs(postZ - beamZ) < .001 ? .32 : .28);
        seg(I, x, postZ - .01, x, postZ + .01, lv.y, postTop, .07).bodyOverlap = true;
        hands.push({ x0: x - .07, x1: x + .07, z0: postZ - .08, z1: postZ + .08,
          y0: lv.y, y1: postTop });
      }
      for (const p of lv.layout.portals) {
        seatedBeam(p.z, -.28, -.04, .18);
        // 間仕切りの内法長押は小壁の当たりより両面へ五センチ出る。
        // 共通内装の innerNageshi と同じ高さ・幅・見込みで木だけを受け、
        // 側壁の長押へ木口を納める。戸口の下や滑る戸の溝は塞がない。
        const headHeight = I.kind === 'yashiki' ? Math.min(2.2, lv.h) : lv.h > 3 ? 2.3 : lv.h;
        const innerNageshi = headHeight + (I.kind === 'yashiki' ? .12 : .42) - lv.h;
        for (const side of [-1, 1]) {
          const z = p.z + side * .1;
          // 内法長押の成は描画と同じ十センチ。十二センチの当たりを残すと、
          // 上下へ一センチずつ見えない木が出て、槍や引手へ伸ばす手を止める。
          beamPart(-hw + .33, hw - .33, z - .03, z + .03,
            innerNageshi - .05, innerNageshi + .05, true);
        }
      }
    }
    addNakaDoors(I, lv, y0, y1);   // 間仕切りの口に引き戸（naka_doors.js）
    if (finishedFloor) for (const d of I.doors || []) {
      if (d.lv !== lv) continue;
      // 鴨居は中央の壁面だけでなく、二筋の溝を覆う張り出しまで木として止める。
      // 戸の動く溝は空け、下へ出る溝縁だけも絵と同じ厚みで登録する。設営時だけ使う。
      const trackWood = (left, right, z, depth, bottom, top) => {
        const radius = Math.min((right - left) / 2, depth / 2);
        seg(I, left + radius, z, right - radius, z,
          lv.y + bottom, lv.y + top, radius).bodyOverlap = true;
      };
      if (d.exterior) {
        // 外戸の敷居も、描いた二筋の溝縁の上で足を受ける。
        // props.js の板戸・格子戸と同じ幅・奥行き・上端を使い、
        // 全開の引き込みまで支える。外の床なので室内扱いにはしない。
        const width = Math.min(lv.w + .04, d.W * 2 + .1);
        const [cx, cz] = I.P(d.lx, d.lz + ds * .175);
        addDeck({ cx, cz, x0: -width / 2, x1: width / 2,
          z0: -.14, z1: .14, rot, y: lv.y + .018, pad: 0,
          roof: lv.y + I.door.h, name: `${I.name}の外戸の敷居` });
        const left = d.lx - width / 2, right = d.lx + width / 2, ph = I.door.h;
        trackWood(left, right, d.lz + ds * .175, .28, ph, ph + .1);
        for (const offset of [.085, .175, .265]) {
          trackWood(left, right, d.lz + ds * offset, offset === .175 ? .002 : .012,
            ph - .018, ph);
        }
        continue;
      }
      // 襖・障子・内陣格子の敷居は、畳より高い溝縁で足を受ける。
      // 部屋の床だけでは板間側で足が木へ沈む。開口だけでなく、左右の引き込みまで
      // interior_parts.js の敷居と同じ長さにする。壁・柱で切れる端も同じ所で止める。
      let left = d.lx - d.W / 2, right = d.lx + d.W / 2;
      for (const v of lv.layout.walls) {
        if (v.guideOnly || Math.abs(v.az - d.lz) > .01 || Math.abs(v.bz - d.lz) > .01) continue;
        const a = Math.min(v.ax, v.bx), b = Math.max(v.ax, v.bx);
        if (Math.abs(b - (d.lx - d.W / 2)) < .01) left = Math.max(d.lx - d.W - .05, a);
        if (Math.abs(a - (d.lx + d.W / 2)) < .01) right = Math.min(d.lx + d.W + .05, b);
      }
      // 描いた幅 .48m・上端 .078m に合わせ、引き込みも一枚の足場で受ける。
      // 戸の当たりは別に残し、閉じた戸は通さない。
      const sill = addDeck({ cx: d.x, cz: d.z, x0: left - d.lx, x1: right - d.lx,
        z0: -.24, z1: .24, rot, y: lv.y + .078, pad: 0,
        roof: lv.y + lv.h, name: `${I.name}の敷居` });
      FL.decks[sill].interior = true;
      const ph = d.h + .06;
      trackWood(left, right, d.lz, .48, ph, ph + .1);
      // 溝幅は室内部品と同じ六・八センチ。上框の脇の木も描いた位置で止める。
      for (const [a, b] of [[-.24, -.154], [-.086, .086], [.154, .24]]) {
        trackWood(left, right, d.lz + (a + b) / 2, b - a, ph - .018, ph);
      }
    }
    if (S.quality === 'high' && I.profile === 'inabayama') {
      // 上段・内陣・板間の敷居は低い側にも十六センチ張り出す。
      // 部屋の境だけで床高を替えると、開いた戸を通る足が框へ沈む。
      // 見える敷居の幅・二本の溝の見込みと同じ範囲を歩く床にも登録する。
      lv.thresholds = [];
      for (const door of I.doors || []) {
        if (door.lv !== lv || door.exterior || door.y <= lv.y + .04) continue;
        // 敷居は戸口だけでなく、左右へ引いた戸の下まで続く。
        // 描く横幅（二倍の開口幅＋八センチ）と歩ける幅を揃え、
        // 内陣・上段・板間の敷居の端だけ足が低い床へ沈まないようにする。
        const halfW = door.W + .04, halfD = door.track + .04;
        const threshold = { x0: door.lx - halfW, x1: door.lx + halfW,
          z0: door.lz - halfD, z1: door.lz + halfD, y: door.y - lv.y };
        lv.thresholds.push(threshold);
        const [cx, cz] = I.P(door.lx, door.lz);
        const id = addDeck({ cx, cz, x0: -halfW, x1: halfW, z0: -halfD, z1: halfD,
          rot, y: door.y, roof: lv.y + lv.h, name: '上がり口の敷居' });
        FL.decks[id].interior = true;
      }
    }
    if (S.quality === 'high' && I.profile === 'inabayama' && I.kind === 'hondo') {
      // 内陣の独立柱は描くだけにせず、同じ芯・太さ・高さで当たりを作る。
      // 戸の中央と引き先を避けた四隅だけ。設営時に座標を決めて室内の絵にも渡す。
      const room = lv.layout.rooms.find(r => r.name === '内陣');
      if (room) {
        lv.naijinPosts = [];
        // 内陣境の回縁は薄い小壁へ寄せる。隅柱も肘木と同じ芯で受ける。
        const frontInset = room.z1 < hd - .001 ? .15 : .21;
        const backInset = room.z0 > -hd + .001 ? .15 : .21;
        for (const x of [room.x0 + .21, room.x1 - .21])
          for (const z of [room.z0 + backInset, room.z1 - frontInset]) {
            const bottom = room.y || 0, top = lv.h - .12;
            if (top <= bottom) continue;
            // 丸柱の下に木製の礎盤を据える推定。板床から浮かせず、
            // 柱身は礎盤の上から立て、足元の広がりにも同じ当たりを持たせる。
            const baseH = .06, baseR = .085;
            lv.naijinPosts.push({ x, z, bottom, top, baseH, baseR });
            // 丸柱と同じ芯・半径。武器の判定にも使える短い線分を保つ。
            seg(I, x - .01, z, x + .01, z, lv.y + bottom + baseH, lv.y + top, .06);
            seg(I, x - .01, z, x + .01, z, lv.y + bottom, lv.y + bottom + baseH, baseR);
          }
      }
    }
    if (I.profile === 'hieizan') for (const d of I.doors || []) {
      if (d.lv !== lv || d.window) continue;
      // 正面・座敷・内陣の敷居も、描いた木の上面を踏む。
      // 板床だけでは足が四〜六センチ沈む。引き込み先と戸当たりまで
      // 同じ幅の足場を設営時に登録し、焼失時は堂の床と一緒に片付ける。
      // 窓の敷居は腰壁の上なので、人が乗る床にはしない。
      const sill = d.entry ? .05 : I.kind === 'sobo' ? HIEI_SOBO_SILL : .04;
      const span = d.W + 2 * d.pw + .1;
      const [cx, cz] = I.P(d.lx, d.lz);
      const id = addDeck({ cx, cz, rot, x0: -span / 2, x1: span / 2,
        z0: -.09, z1: .09, y: lv.y + sill, roof: lv.y + d.h,
        pad: 0, name: `${I.name}の敷居` });
      FL.decks[id].interior = true;
      if (d.entry || d.h >= lv.h) continue;
      // 引き戸を開けても鴨居と小壁は残る。描いた間仕切りの線で支え、戸と一緒に消さない。
      const z = d.lz - HIEI_DOOR_TRACK;
      seg(I, d.lx - d.W / 2, z, d.lx + d.W / 2, z, lv.y + d.h, y1, .08);
    }
    // 戸口から一歩入った場所には調度を置かない。絵と当たりを一緒に外す。
    if (k === 0) {
      // 合図の小さな板倉では、入口用の余白が奥壁まで届き、脇の蓋箱も消えていた。
      // 玄関の内寄りの溝から三十センチ奥までを立ち所にし、そこへ掛かる荷だけ外す。
      // 箱の周囲にも人の半径分を取り、中央から奥へ歩ける幅は残す。
      const shallowInabaStore = S.quality === 'high' && I.profile === 'inabayama' && I.kind === 'kura' && lv.d < 2.3;
      const entryMargin = shallowInabaStore ? .3 : .5;
      // 小祠は奥行きが浅い。入口の立ち所を拝所までに留め、神前の供物台を消さない。
      const entryDepth = shallowInabaStore ? .34 + .3
        : S.quality === 'high' && I.profile === 'inabayama' && I.kind === 'shrine'
        ? Math.min(1.6, lv.d * .4) : 1.6;
      lv.layout.props = lv.layout.props.filter(p => !(p.x + p.w / 2 + entryMargin > I.door.lx - I.door.w / 2
        && p.x - p.w / 2 - entryMargin < I.door.lx + I.door.w / 2
        && ds * p.z + p.d / 2 + entryMargin > hd - entryDepth));
    }
    if (I.profile === 'yagura') {
      // 箱の当たりと見た目を同じ配置にする。設営時だけ動線を調べる。
      const lanes = [];
      for (const st of [I.stairs[k], I.stairs[k - 1]]) if (st) lanes.push({ x0: -st.L / 2 - .6, x1: st.L / 2 + .6, z0: st.hole.z0 - .2, z1: st.hole.z1 + .2 });
      if (lv.drop) lanes.push({ x0: lv.drop.x0, x1: lv.drop.x1 + 1.3, z0: lv.drop.z0 - .35, z1: lv.drop.z1 + .35 });
      const entryLen = I.open ? .8 : 1.5;
      if (k === 0) lanes.push({ x0: I.door.lx - .75, x1: I.door.lx + .75, z0: ds > 0 ? hd - entryLen : -hd, z1: ds > 0 ? hd : -hd + entryLen });
      for (const v of wins) if (!v.shoji && !I.open) {
        if (v.face === 'z') lanes.push({ x0: v.t - v.w / 2, x1: v.t + v.w / 2, z0: v.s > 0 ? hd - 1.3 : -hd, z1: v.s > 0 ? hd : -hd + 1.3 });
      }
      const clear = p => Math.abs(p.x) + p.w / 2 < hw && Math.abs(p.z) + p.d / 2 < hd && !lanes.some(v => p.x + p.w / 2 + .25 > v.x0 && p.x - p.w / 2 - .25 < v.x1 && p.z + p.d / 2 + .25 > v.z0 && p.z - p.d / 2 - .25 < v.z1);
      const keep = p => { lanes.push({ x0: p.x - p.w / 2, x1: p.x + p.w / 2, z0: p.z - p.d / 2, z1: p.z + p.d / 2 }); return true; };
      lv.layout.props = lv.layout.props.filter(p => {
        if (clear(p)) return keep(p);
        for (const x of [-hw + .55, hw - .55]) for (const z of [hd * .3, -hd * .3, 0]) {
          p.x = x; p.z = z;
          if (clear(p)) return keep(p);
        }
        return false;
      });
    }
    if (k === Ls.length - 1 && I.oku) {
      const room = lv.layout.rooms[0], spot = { x: -I.door.lx * .3, z: -ds * (hd - lv.d * I.oku / 2) };
      if (!interiorSafeSpot(lv, spot.x, spot.z, spot, room)) {
        lv.layout.props = lv.layout.props.filter(p => p.x + p.w / 2 <= room.x0 || p.x - p.w / 2 >= room.x1 || p.z + p.d / 2 <= room.z0 || p.z - p.d / 2 >= room.z1);
      }
    }
    for (const p of lv.layout.props) {
      // 稲葉山の床の間と槍掛けは、絵と当たりを同じ梁下の高さへ納める。
      // 絵だけ縮めると、天井際に見えない調度の当たりが残る。
      if (S.quality === 'high' && I.profile === 'inabayama') {
        // 床柱と小天井は回縁の中ほどまで立ち上げる。
        // 十センチ控えると回縁の下面との間に隙間が残るため、絵・当たりを一緒に揃える。
        if (p.part === 'alcove') p.h = Math.min(p.h, lv.h - (p.y || 0) - .045);
        if (p.part === 'spearRack') p.h = Math.min(p.h, lv.h - (p.y || 0) - .28);
      }
      const ww = p.w ?? (p.part === 'alcove' ? 2.3 : p.part === 'altar' ? 2.1 : p.part === 'desk' ? 1.2 : p.part === 'counter' ? 1.1 : .85);
      const dd = p.d ?? (p.part === 'alcove' ? .85 : p.part === 'altar' ? 1 : .7);
      const top = lv.y + (p.y || 0) + p.h + (p.part === 'stones' ? .18 : p.part === 'ammo' ? .05 : 0);
      const x0 = p.x - ww / 2, x1 = p.x + ww / 2, z0 = p.z - dd / 2, z1 = p.z + dd / 2;
      if (I.profile !== 'moribe') {
      seg(I, x0, z0, x1, z0, lv.y - .4, top, .04);
      seg(I, x0, z1, x1, z1, lv.y - .4, top, .04);
      seg(I, x0, z0, x0, z1, lv.y - .4, top, .04);
      seg(I, x1, z0, x1, z1, lv.y - .4, top, .04);
      if (I.profile === 'okehazama' && I.kind === 'hondo' && p.part === 'altar') {
        // 天蓋の上を囲いの面で塞がず、描いた四本の吊り金具と留め板だけを止める。
        // interior_parts.js の壇の倍率・向き・仕上げ床の高さへそろえ、設営時だけ登録する。
        const sx = ww / 2.1, sy = p.h / 2.27, sz = dd;
        const c = Math.cos(p.rot || 0), s = Math.sin(p.rot || 0);
        // 吊り金具は格縁へ渡した受け木の下面で止める。
        // 天井際まで延ばすと、見えていない金具が受け木の上にも残る。
        // interior_parts.js の受け木・留め板と同じ高さと柱割りを使う。
        const bottom = top, cap = lv.y + (p.y || 0) + (lv.h - (p.y || 0) - .16) * sy;
        if (cap > bottom) for (const x of [-.62, .62]) for (const z of [-.35, .19]) {
          const px = p.x + x * sx * c + z * sz * s;
          const pz = p.z - x * sx * s + z * sz * c;
          const mountTop = cap - .0125 * sy;
          const fitted = mountTop - bottom > .16 * sy, inset = fitted ? .068 * sy : 0;
          seg(I, px, pz, px, pz, bottom + inset, (fitted ? mountTop : cap) - inset, .009 * Math.max(sx, sz));
          if (fitted) {
            // 天蓋の取付座・角環も描いた鉄だけ止める。環の中央に面を張らない。
            // 寸法は interior_parts.js と共通。設営時だけ登録する。
            const iron = (cx, halfWidth, low, high, depth) => {
              const radius = depth * sz / 2, half = Math.max(0, halfWidth * sx - radius);
              const xx = px + cx * sx * c, zz = pz - cx * sx * s;
              seg(I, xx - half * c, zz + half * s, xx + half * c, zz - half * s,
                low, high, radius);
            };
            for (const side of [-1, 1]) {
              const end = side < 0 ? bottom : mountTop, cy = end - side * .04 * sy;
              iron(0, .04, Math.min(end, end - side * .012 * sy),
                Math.max(end, end - side * .012 * sy), .08);
              for (const edge of [-1, 1]) {
                const yy = cy + edge * .028 * sy;
                iron(0, .032, yy - .004 * sy, yy + .004 * sy, .008);
                iron(edge * .028, .004, cy - .024 * sy, cy + .024 * sy, .008);
              }
            }
          }
          const radius = .04 * sz, half = Math.max(0, .04 * sx - radius);
          seg(I, px - half * c, pz + half * s, px + half * c, pz - half * s,
            cap - .0125 * sy, cap + .0125 * sy, radius);
        }
        if (cap > bottom) {
          const inner = lv.layout.rooms[0], x0 = inner.x0 + .16, x1 = inner.x1 - .16;
          const step = (x1 - x0) / Math.max(1, Math.round((x1 - x0) / .75));
          const left = x0 + Math.floor((p.x - .62 - x0) / step) * step - p.x;
          const right = x0 + Math.ceil((p.x + .62 - x0) / step) * step - p.x;
          // 絵だけだった二本の受け木にも、木のある高さだけ当たりを付ける。
          // 金具の間や天蓋の上を面で塞がず、内陣の空間を残す。
          const radius = .05 * sz, cx = (left + right) / 2 * sx;
          const half = Math.max(0, (right - left + .075) / 2 * sx - radius);
          for (const z of [-.35, .19]) {
            const px = p.x + cx * c + z * sz * s;
            const pz = p.z - cx * s + z * sz * c;
            seg(I, px - half * c, pz + half * s, px + half * c, pz - half * s,
              cap, cap + .04 * sy, radius).bodyOverlap = true;
          }
        }
      }
      if (S.quality === 'high' && I.profile === 'inabayama' && I.kind === 'hondo' && p.part === 'altar') {
        // 本尊より高い来迎壁にも当たりを通す。台全体を天井まで塞がず、
        // 背板と両端の柱の見込みだけに納め、内陣の左右の道は広げも狭めもしない。
        // 反転した間取りも絵と同じ奥側に置き、設営時だけ一枚の壁を足す。
        const backTop = lv.y + (p.y || 0) + inabaAltarBackHeight(p, lv.h);
        const backZ = p.z - Math.cos(p.rot || 0) * .46 * dd;
        const radius = .04 * dd, half = ww / 2 - radius;
        if (backTop > top)
          seg(I, p.x - half, backZ, p.x + half, backZ, top, backTop, radius);
      }
      } else {
      const moribeAltar = I.profile === 'moribe' && I.kind === 'hondo' && p.part === 'altar';
      const moribeDesk = I.profile === 'moribe' && I.kind === 'yashiki' && p.part === 'desk';
      const moribeStorage = I.profile === 'moribe' && I.kind === 'yashiki' && p.part === 'storage';
      // 戸の引手へ伸ばす手も、調度の実際の部材で受ける。設営時に一度だけ寸法を残す。
      const handBox = (x0, x1, z0, z1, y0, y1) => {
        if (I.profile !== 'moribe') return;
        (lv.handObstacles || (lv.handObstacles = [])).push({ x0, x1, z0, z1, y0, y1 });
      };
      if (moribeStorage) {
        // 畳に載せた木櫃は、描いた底から蓋までで受ける。
        // 共通調度の四センチの丸い壁端を外へ足すと、櫃の脇に見えない縁ができる。
        // 細い当たりを外寸の内側へ納め、跳んだ時も胴を木へ通さない。
        // 手と体と槍の範囲をそろえ、設営時だけ既存の四辺を作る。
        const bottom = lv.y + (p.y || 0), r = .005;
        handBox(x0, x1, z0, z1, bottom, top);
        seg(I, x0 + r, z0 + r, x1 - r, z0 + r, bottom, top, r).bodyOverlap = true;
        seg(I, x0 + r, z1 - r, x1 - r, z1 - r, bottom, top, r).bodyOverlap = true;
        seg(I, x0 + r, z0 + r, x0 + r, z1 - r, bottom, top, r).bodyOverlap = true;
        seg(I, x1 - r, z0 + r, x1 - r, z1 - r, bottom, top, r).bodyOverlap = true;
      }
      if (!moribeAltar && !moribeDesk && !moribeStorage) {
        handBox(x0, x1, z0, z1, lv.y + (p.y || 0), top);
        seg(I, x0, z0, x1, z0, lv.y - .4, top, .04);
        seg(I, x0, z1, x1, z1, lv.y - .4, top, .04);
        seg(I, x0, z0, x0, z1, lv.y - .4, top, .04);
        seg(I, x1, z0, x1, z1, lv.y - .4, top, .04);
      }
      if (moribeDesk) {
        // 足の高さだけでなく胴との重なりを見て、天板・幕板へ体を通さない。
        // 座卓の下を床までの箱で埋めず、天板・脚・幕板・貫だけで受ける。
        // interior_parts.js の座卓と同じ寸法・倍率で、畳の上に載せる。
        // 設営時だけ作り、戸の引手へ届く手も同じ木の範囲で判定する。
        const sx = ww / 1.2, sy = p.h / .46, sz = dd / .7;
        const baseY = lv.y + (p.y || 0);
        const timber = (x, z, w, d, bottom, height) => {
          const ax = p.x + (x - w / 2) * sx, bx = p.x + (x + w / 2) * sx;
          const az = p.z + (z - d / 2) * sz, bz = p.z + (z + d / 2) * sz;
          const low = baseY + bottom * sy, high = low + height * sy;
          handBox(ax, bx, az, bz, low, high);
          if (w > .1 && d > .1) {
            // 広い天板は四辺で受け、角を大きく丸めない。
            seg(I, ax, az, bx, az, low, high, .005).bodyOverlap = true;
            seg(I, ax, bz, bx, bz, low, high, .005).bodyOverlap = true;
            seg(I, ax, az, ax, bz, low, high, .005).bodyOverlap = true;
            seg(I, bx, az, bx, bz, low, high, .005).bodyOverlap = true;
            return;
          }
          // 細長い木は一本の線分と半幅で受け、四辺の壁を増やさない。
          if (bx - ax >= bz - az) {
            const radius = (bz - az) / 2;
            seg(I, ax + radius, (az + bz) / 2, bx - radius, (az + bz) / 2, low, high, radius).bodyOverlap = true;
          } else {
            const radius = (bx - ax) / 2;
            seg(I, (ax + bx) / 2, az + radius, (ax + bx) / 2, bz - radius, low, high, radius).bodyOverlap = true;
          }
        };
        // 下張りと三枚の天板は一続きの厚みとして扱う。
        timber(0, 0, 1.2, .7, .38, .08);
        for (const x of [-.48, .48]) for (const z of [-.24, .24]) timber(x, z, .07, .07, 0, .4);
        for (const z of [-.24, .24]) timber(0, z, .89, .04, .31, .07);
        for (const x of [-.48, .48]) {
          timber(x, 0, .04, .41, .31, .07);
          timber(x, 0, .04, .41, .1075, .045);
        }
        // 硯のくぼみや筆の脇を一枚の壁で埋めず、描く道具の部材だけで受ける。
        // 座卓と同じ倍率・畳上の高さへ合わせ、設営時にだけ登録する。
        for (const [w, h, d, x, bottom, z] of MORIBE_WRITING_TOOLS) {
          timber(x, z, w, d, bottom, h);
        }
      }
      if (moribeAltar) {
        // 前卓の天板・壇上の本尊も体の高さで受け、足元が低くても胴を通さない。
        // 須弥壇の寸法だけでは、上にある背板と天蓋を槍がすり抜ける。
        // 調度の描画と同じ倍率・奥への寄せで、木のある範囲だけを受ける。
        // 内陣の左右や天蓋の下を、床から天井までの見えない壁で塞がない。
        const sx = ww / 2.1, sy = p.h / 1.5, sz = dd / 1.3;
        const baseY = lv.y + (p.y || 0);
        const upperFrame = (width, za, zb, bottom, height, shifted = true) => {
          const left = p.x - width * sx / 2, right = p.x + width * sx / 2;
          const back = p.z + (shifted ? za * .9 - .2 : za) * sz;
          const front = p.z + (shifted ? zb * .9 - .2 : zb) * sz;
          const low = baseY + bottom * sy, high = baseY + height * sy;
          handBox(left, right, back, front, low, high);
          seg(I, left, back, right, back, low, high, .015).bodyOverlap = true;
          seg(I, left, front, right, front, low, high, .015).bodyOverlap = true;
          seg(I, left, back, left, front, low, high, .015).bodyOverlap = true;
          seg(I, right, back, right, front, low, high, .015).bodyOverlap = true;
        };
        // 壇と前卓をまとめた高さ一・五メートルの箱にせず、描いた部材ごとに受ける。
        // 前卓の両脇へ寄れ、低い卓の上や須弥壇の脇の空間を見えない壁で塞がない。
        upperFrame(2.1, -.5, .5, 0, .54); // 奥へ寄せた須弥壇
        upperFrame(1.25, .31, .65, .42, .5, false); // 前卓の天板
        for (const x of [-.5, .5]) for (const z of [.38, .58]) {
          const ax = p.x + (x - .03) * sx, bx = p.x + (x + .03) * sx;
          const zz = p.z + z * sz;
          handBox(ax, bx, zz - .03 * sz, zz + .03 * sz, baseY, baseY + .42 * sy);
          seg(I, ax, zz, bx, zz, baseY, baseY + .42 * sy, .03 * sz).bodyOverlap = true;
        }
        // 前卓の貫と幕板も、描いた木の範囲だけ手と槍を止める。
        // 脚と天板だけの当たりでは、内陣から横木を透かして操作できてしまう。
        // 卓の下を一枚の壁で埋めず、八本を設営時に登録する。
        const tableRail = (x, z, width, depth, bottom, height) => {
          const cx = p.x + x * sx, cz = p.z + z * sz;
          const hw = width * sx / 2, hd = depth * sz / 2;
          const low = baseY + bottom * sy, high = low + height * sy;
          handBox(cx - hw, cx + hw, cz - hd, cz + hd, low, high);
          // 線分の丸い端も木の外へ出さず、細い横木の厚さへ納める。
          const rad = Math.min(hw, hd);
          seg(I, cx - hw + rad, cz - hd + rad, cx + hw - rad, cz + hd - rad, low, high, rad).bodyOverlap = true;
        };
        for (const z of [.38, .58]) {
          tableRail(0, z, .94, .045, .1375, .045);
          tableRail(0, z, .94, .04, .34, .08);
        }
        for (const x of [-.5, .5]) {
          tableRail(x, .48, .045, .14, .1375, .045);
          tableRail(x, .48, .04, .14, .34, .08);
        }
        // 前卓の三具足も絵だけにせず、香炉・花瓶・燭台の部材で受ける。
        // 須弥壇側の奥寄せは掛けず、interior_parts.js の前卓と同じ位置へ置く。
        // 卓上を一枚の壁で塞がず、器の間と燭台の細い支柱の脇は空ける。
        // 設営時だけ既存の当たりへ加え、形・材質・毎コマの物は増やさない。
        for (const [x, z] of [[-.043, .505], [.043, .505], [0, .435]]) {
          tableRail(x, z, .018, .018, .5, .025);
        }
        tableRail(0, .48, .15, .15, .51, .098); // 香炉の胴と口縁
        for (const x of [-.025, .025]) tableRail(x, .48, .006, .006, .5675, .095);
        // 花瓶は裾・胴・口を分け、細くなる首の左右を空ける。
        tableRail(-.4, .48, .15, .15, .5, .025);
        tableRail(-.4, .48, .13, .13, .525, .12);
        tableRail(-.4, .48, .1, .1, .645, .049);
        tableRail(.4, .48, .17, .17, .5, .025); // 燭台の台座
        tableRail(.4, .48, .07, .07, .525, .2); // 支柱
        tableRail(.4, .48, .13, .13, .725, .025); // 受け皿
        tableRail(.4, .48, .042, .042, .75, .12); // 蝋燭
        tableRail(.4, .48, .004, .004, .87, .012); // 灯芯
        // 光背と本尊の間、頭の左右まで一つの箱で塞がない。
        // 蓮台・膝・胴・頭・両腕を描画の寸法で分け、内陣の空いた所へ寄れるようにする。
        // 壇の奥寄せと奥行き九割は共通。設営時だけ登録し、毎コマの仕事は増やさない。
        upperFrame(.86, -.385, -.335, .65, 1.79); // 薄い舟形光背
        upperFrame(.76, -.39, .19, .53, .695); // 蓮台と蓮弁
        upperFrame(.64, -.29, .17, .64, .9); // 組んだ膝
        upperFrame(.4, -.27, .03, .74, 1.32); // 胴と衣
        upperFrame(.32, -.255, .035, 1.24, 1.615); // 耳・頭・肉髻
        // 左右に寄る腕と薬壺は、中心の胴へ幅を足さず個別に受ける。
        tableRail(.19, .075 * .9 - .2, .3, .31 * .9, .855, .355);
        tableRail(-.22, .04 * .9 - .2, .23, .2 * .9, .9, .425);
        upperFrame(1.86, -.51, -.41, .54, 2.14); // 背板の框は天蓋の下面で止める
        // 天蓋の下框は中空。外形全体の箱で受けると、框の間の空間でも槍や手が止まる。
        // 描画と同じ框・鏡板・受け桟・上板へ分け、奥寄せと奥行き九割もそろえる。
        const canopyTimber = (x, z, width, depth, bottom, height) => {
          tableRail(x, z * .9 - .2, width, depth * .9, bottom, height);
        };
        for (const z of [-.415, .255]) canopyTimber(0, z, 1.55, .05, 2.14, .08);
        for (const x of [-.75, .75]) canopyTimber(x, -.08, .05, .62, 2.14, .08);
        const mirrorDepth = .62 / 3;
        for (let i = 0; i < 3; i++) {
          canopyTimber(0, -.39 + (i + .5) * mirrorDepth,
            1.45, mirrorDepth - .002, 2.19, .03);
        }
        canopyTimber(0, -.08, 1.45, .035, 2.14, .05);
        canopyTimber(0, -.08, 1.7, .82, 2.22, .05);
        // 幡の布は壁にせず、吊り棒と幡頭を受ける横木だけ描いた位置で受ける。
        for (const x of [-.68, .68]) {
          canopyTimber(x, -.08, .035, .035, 1.88, .26);
          canopyTimber(x, -.08, .16, .035, 1.86, .02);
        }
        // 須弥壇上の二基も、床の灯明と同じく台座・支柱・皿で手と槍を受ける。
        // 描画側の奥寄せと奥行き九割の縮尺を戻し、細い支柱の左右は空ける。
        // 内陣を一枚の壁で塞がず、設営時だけ既存の当たりへ登録する。
        for (const x of [-.75, .75]) for (const [radius, bottom, top] of MORIBE_LAMP_PARTS) {
          tableRail(x, .22 * .9 - .2, radius * 2, radius * 2 * .9,
            .54 + bottom, top - bottom);
        }
        // 吊り棒と天井側の受け木も、描いた細い部材だけで槍・手を止める。
        // interior_parts.js と同じ格縁の割り付け・壇の奥寄せを使い、
        // 天蓋から天井までを一枚の見えない壁にはしない（設営時だけ）。
        const ceiling = (lv.h - (p.y || 0)) / sy;
        const inner = lv.layout.rooms[0], width = inner.x1 - inner.x0 - .32;
        const bays = Math.max(1, Math.round(width / .75)), spacing = width / bays;
        const rail = Math.min(bays, Math.ceil((width / 2 + .6 * sx) / spacing));
        const bearingX = -width / 2 + rail * spacing;
        // 天蓋の下側の吊り鉄も絵と同じ三面だけで受ける。
        // 幡の間や本尊の上を、一枚の見えない壁で塞がない。
        for (const x of [-.6, .6]) {
          canopyTimber(x, -.08, .06, .832, 2.27, .008);
          for (const side of [-1, 1]) {
            canopyTimber(x, -.08 + side * .414, .06, .008, 2.212, .066);
            canopyTimber(x, -.08 + side * .385, .06, .05, 2.212, .008);
          }
        }
        const rodBottom = 2.278, rise = ceiling - .2 / sy - rodBottom;
        if (rise > 0) for (const z of [-.34, .18]) {
          const shiftedZ = z * .9 - .2;
          tableRail(0, shiftedZ, (bearingX * 2 + .06) / sx, .08 * .9,
            ceiling - .2 / sy, .08 / sy);
          // 吊り鉄は格縁の左右の外面に沿い、底で受け木を抱く。
          // 描画と同じ向き・幅にそろえ、前後の空間に見えない帯を残さない。
          for (const side of [-1, 1]) {
            tableRail(side * (bearingX + .033) / sx, shiftedZ,
              .006 / sx, .04 * .9, ceiling - .2 / sy, .18 / sy);
            tableRail(side * (bearingX - .002) / sx, shiftedZ, .076 / sx, .04 * .9,
              ceiling - .206 / sy, .006 / sy);
            tableRail(side * (bearingX + .039) / sx, shiftedZ,
              .006 / sx, .024 * .9, ceiling - .072 / sy, .024 / sy);
          }
          for (const x of [-.6, .6]) {
            tableRail(x, shiftedZ, .025, .025 * .9, rodBottom, rise);
            tableRail(x, shiftedZ, .06, .06 * .9,
              ceiling - .208 / sy, .008 / sy);
          }
        }
      }
    }
    }
    if (I.profile === 'moribe' && ['hondo', 'yashiki'].includes(I.kind)) {
      // 屋敷の床置き灯明だけ、台座・支柱・皿の当たりをここで登録する。
      // 堂の灯明は須弥壇の部材として登録済み。通路へ見えない灯台を足さず、
      // 光も実際の壇上の灯芯へそろえる（調度と同じ奥寄せ・倍率）。
      const temple = I.kind === 'hondo';
      lv.oilLamps = [];
      if (temple) {
        const altar = lv.layout.props.find(p => p.part === 'altar');
        if (altar) for (const side of [-1, 1]) {
          const sy = altar.h / 1.5;
          lv.oilLamps.push({ x: altar.x + side * .75 * altar.w / 2.1,
            z: altar.z + (.22 * .9 - .2) * altar.d / 1.3,
            y: lv.y + (altar.y || 0) + .54 * sy,
            flameY: lv.y + (altar.y || 0) + (.54 + .9) * sy });
        }
      }
      for (let q = 0; !temple && q < 2; q++) {
        const room = lv.layout.rooms[q];
        const x = (q === 0 ? 1 : -1) * (hw - .6);
        const z = room.z1 - .5;
        const y = lv.y + (room.y || 0) + (room.floor === 'tatami' ? .066 : 0);
        lv.oilLamps.push({ x, z, y });
        for (const [radius, bottom, top] of MORIBE_LAMP_PARTS) {
          seg(I, x, z, x, z, y + bottom, y + top, radius).bodyOverlap = true;
          (lv.handObstacles || (lv.handObstacles = [])).push({
            x0: x - radius, x1: x + radius, z0: z - radius, z1: z + radius,
            y0: y + bottom, y1: y + top,
          });
        }
      }
    }
    // 外壁ぎわの狭い廊下。両端を空け、互い違いの階段へ抜けられる。
    if (['tenshu', 'yagura', 'gate'].includes(I.kind) && lv.w >= 5 && lv.d >= 5) {
      lv.hallX = hw - 1.8;
      lv.layout.walls.push({ ax: lv.hallX, az: -hd + 1.8, bx: lv.hallX, bz: hd - 1.8, paper: false, guideOnly: true });
      // 道案内だけの線には、人や矢を止める見えない壁を作らない。
    }
    prepareInteriorPaths(lv.layout, lv.w, lv.d);
  }
  // 入口：戸口の外の踊り場と、地面から上がる石段（外壁の足もとの当たりの外まで）
  const L0 = Ls[0], hd0 = L0.d / 2;
  if (o.approach) {
    const { pad } = o.approach;
    let len = o.approach.len;
    if (I.profile === 'okehazama' && ['bansho', 'minka'].includes(I.kind) && o.approach.gy == null) {
      // 斜面の高床へ九十センチの間に何段も詰め込まない。
      // 一段の高さ .22m・踏面 .28m を目安に、下り口の地面を測り直して延ばす。
      // 外観側で幅と全長を測った上り口は、その床高・長さ・下端をそのまま使う。
      // 砦の囲いからはみ出さない長さで止め、設営時だけ調べる。
      const limit = Math.max(len, 8.1);
      for (let q = 0; q <= 24; q++) {
        const [sx, sz] = I.P(I.door.lx, ds * (hd0 + pad + len));
        const rise = L0.y - world.heightAt(sx, sz);
        const steps = Math.max(1, Math.ceil(rise / .22));
        if (len / steps >= .28 || len >= limit) break;
        len = Math.min(limit, len + .3);
      }
      // 接近判定も延びた階段の下端まで含め、室内を作る前に登り始められるようにする。
      I.R += len - o.approach.len;
    }
    const [tx, tz] = I.P(I.door.lx, ds * (hd0 + pad)), [bx, bz] = I.P(I.door.lx, ds * (hd0 + pad + len));
    const gy = o.approach.gy ?? (I.profile === 'moribe' ? drawGroundAt(world, bx, bz) : world.heightAt(bx, bz));
    I.approach = { pad, len, gy, stepsBuilt: !!o.approach.stepsBuilt };
    if (I.profile === 'moribe') {
      // 外の段は buildOuter と同じ段数・踏面へ足を載せる。
      // 坂の足場では踏板に足が沈み、幅の余白では段の横に浮いてしまう。
      // 設営時だけ登録し、描画や毎コマの部材作成は増やさない。
      const rise = L0.y - gy, n = Math.max(3, Math.round(rise / .28));
      for (let q = 0; q < n; q++) {
        const t = (q + 1) / n;
        const [cx, cz] = I.P(I.door.lx, ds * (hd0 + pad + len * (1 - t) + len / n / 2));
        addDeck({ cx, cz, rot, x0: -(I.door.w + .3) / 2, x1: (I.door.w + .3) / 2,
          z0: -(len / n + .02) / 2, z1: (len / n + .02) / 2,
          y: gy + rise * t, pad: 0, name: `${I.name}の段` });
      }
    } else addRamp({ ax: bx, az: bz, bx: tx, bz: tz, w: o.approach.w ?? I.door.w + 0.3, ya: gy, yb: L0.y, inner: true });   // 横からは乗らない（下の端から上る）
    const [cx, cz] = I.P(I.door.lx, ds * (hd0 + pad / 2 - 0.1));
    addDeck({ x0: -(I.door.w + 0.4) / 2, x1: (I.door.w + 0.4) / 2, z0: -(pad + 0.4) / 2, z1: (pad + 0.4) / 2, rot, cx, cz, y: L0.y, name: `${I.name}の戸口`, pad: I.profile === 'moribe' ? 0 : .4 });
    const [ox, oz] = I.P(I.door.lx, ds * (hd0 + pad + len + 0.8));
    I.doorOut = { x: ox, z: oz };
  } else {
    const [ox, oz] = I.P(I.door.lx, ds * (hd0 + 1.2));
    I.doorOut = { x: ox, z: oz };
  }
  {
    const okeEntry = I.profile === 'okehazama' && ['hondo', 'bansho', 'minka'].includes(I.kind);
    let entryZ = hd0 - (I.profile === 'moribe' && ['yashiki', 'hondo'].includes(I.kind) ? .5 : okeEntry ? .55 : 1.1);
    if (S.quality === 'high' && I.profile === 'inabayama'
      && ['goten', 'kura', 'bansho', 'nagaya', 'tamari', 'shrine'].includes(I.kind)) {
      // 一律に一・一歩入ると、主殿・館の広間の障子や番所・遠侍の内戸へ重なる。
      // 奥座敷の襖より入口に近い内戸を選び、玄関との間に立ち所を取る。
      let inner = null;
      for (const door of I.doors || []) {
        if (door.lv !== L0 || door.exterior) continue;
        if (!inner || ds * door.lz > ds * inner.lz) inner = door;
      }
      const entry = I.entryDoor;
      if (inner && entry) {
        const innerEdge = ds * (inner.lz + inner.trackZ) + inner.track;
        entryZ = (ds * (entry.lz + entry.trackZ) - entry.track + innerEdge) / 2;
        // 退室の立ち所も入口の間に限る。座敷から閉じた内戸を飛び越えない。
        // 戸の当たりの半径まで含め、反対向きの番所でも同じ溝を基準にする。
        I.entryLimit = innerEdge + .06;
      }
    }
    if (I.profile === 'hieizan' && I.kind === 'sobo') {
      // 正面戸を開けても、閉じた座敷の障子を越えて入室させない。
      // 実際の二組の戸の中間を立ち所にし、出る札もこの板間からだけ使う。
      const inner = I.doors?.find(d => !d.entry && d.kind === 'shoji');
      const outer = I.doors?.find(d => d.entry);
      if (inner && outer) {
        const landing = (inner.lz + outer.lz) * ds / 2;
        entryZ = landing;
        I.entryLimit = inner.lz * ds + .2;
      }
    }
    const [ix, iz] = I.P(I.door.lx, ds * entryZ);
    I.doorIn = { x: ix, z: iz, y: okeEntry ? L0.y + .012 : inabaFloorY(I, L0, I.door.lx, ds * entryZ) };
  }
  // 大将の居場所：一番上の階の、上り口から遠い側（御殿は奥の間）
  const top = Ls[Ls.length - 1];
  let sp;
  if (I.oku) sp = I.P(-I.door.lx * 0.3, -ds * (top.d / 2 - top.d * I.oku / 2));
  else {
    const st = I.stairs[I.stairs.length - 1];
    sp = st ? I.P(-st.L * 0.15, -st.sg * Math.max(0, top.d / 2 - 1.1)) : I.P(0, -ds * Math.max(0, top.d / 2 - 1.0));
  }
  const local = I.L(sp[0], sp[1]), safe = { x: local[0], z: local[1] };
  const room = I.oku ? top.layout.rooms[0] : null;
  interiorSafeSpot(top, safe.x, safe.z, safe, room);
  sp = I.P(safe.x, safe.z);
  // 家具を避けて移した先の床高を使う。奥の間を指定しない番所・板倉も
  // 上げ床や敷居へ足を沈めず、玄関の土間へ移った場合は床を上げない。
  const spotY = S.quality === 'high' && I.profile === 'inabayama'
    ? inabaFloorY(I, top, safe.x, safe.z) : top.y + (room?.y || 0);
  I.lordSpot = { x: sp[0], z: sp[1], y: spotY };
  const spotRoom = I.profile === 'okehazama' && ['bansho', 'minka', 'hondo'].includes(I.kind)
    ? top.layout.rooms.find(r => safe.x >= r.x0 && safe.x <= r.x1 && safe.z >= r.z0 && safe.z <= r.z1) : null;
  I.lordSpot = { x: sp[0], z: sp[1], y: top.y + (spotRoom
    ? (spotRoom.y || 0) + (spotRoom.floor === 'tatami' ? .06 : .012) : (room?.y || 0)) };
  I.where = o.where || (I.oku ? `${I.name}の奥の間` : Ls.length > 1 ? `${I.name}の最上階` : `${I.name}の中`);
  NAKA.list.push(I);
  // 桶狭間の遠い砦・村は接近時に登録される。追加した棟にも入口の踏板を作る。
  NAKA.outer = false;
  // 隅櫓・天守の戸口の外に篝を一つ（外から入口が分かる。B101）。足もとが地面の戸口だけ
  if (o.entryFire !== false && (I.kind === 'yagura' || I.kind === 'tenshu') && world && world.addFire) {
    const [fx, fz] = I.P(I.door.lx + 1.1, ds * (Ls[0].d / 2 + 1.1));
    if (Math.abs(world.heightAt(fx, fz) - Ls[0].y) < 1.2) world.addFire(fx, fz, { torch: true, h: 0.9 });
  }
  return I;
}

// 点がどの建物の何階の中か（{ I, lv } か null）
export function nakaRoomAt(x, z, y) {
  for (const I of NAKA.list) {
    if (I.disabled) { if (I.mesh) I.mesh.visible = false; continue; }
    if (Math.abs(x - I.x) > I.R + 1 || Math.abs(z - I.z) > I.R + 1) continue;
    const dx = x - I.x, dz = z - I.z, lx = dx * I.c - dz * I.s, lz = dx * I.s + dz * I.c;
    for (let k = I.levels.length - 1; k >= 0; k--) {
      const lv = I.levels[k];
      if (Math.abs(lx) > lv.w / 2 + 0.05 || Math.abs(lz) > lv.d / 2 + 0.05) continue;
      if (y >= lv.y - 0.6 && y <= lv.y + lv.h) return lv.room;
    }
  }
  return null;
}
// 点 (x,z) を足もとに含む建物（大将の居場所を探す。高さは問わない）
export function nakaFind(x, z) {
  for (const I of NAKA.list) {
    if (I.disabled) { if (I.mesh) I.mesh.visible = false; continue; }
    const dx = x - I.x, dz = z - I.z, lx = dx * I.c - dz * I.s, lz = dx * I.s + dz * I.c, lv = I.levels[0];
    if (Math.abs(lx) <= lv.w / 2 + 0.3 && Math.abs(lz) <= lv.d / 2 + 0.3) return I;
  }
  return null;
}

// 道しるべ（任務の印）：建物の外なら戸口、中なら上の階への階段の上り口、御殿は奥の間の口、着けば的（大将）。
// rt.marker の pos に関数として渡す（印が一歩ずつ先を指す。真っすぐ寄せて壁に詰まらない）
// 稲葉山の内陣・上段・板倉は十六センチの上げ床を持つ。
// 入口や道案内も実際の床高へ揃え、板倉へ入った瞬間や敷居で足元を床下へ置かない。
// 境では高い側を採り、設営済みの間取りを読むだけで座標や配列を作らない。
function inabaFloorY(I, lv, x, z) {
  if (S.quality !== 'high' || I.profile !== 'inabayama') return lv.y;
  let raised = 0;
  for (const r of lv.layout.rooms) {
    if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1)
      raised = Math.max(raised, r.y || 0);
  }
  if (lv.thresholds) for (const threshold of lv.thresholds) {
    if (x >= threshold.x0 && x <= threshold.x1 && z >= threshold.z0 && z <= threshold.z1)
      raised = Math.max(raised, threshold.y);
  }
  return lv.y + raised;
}

export function nakaGuide(I, target) {
  const way = { x: 0, z: 0, y: 0 }, local = { x: 0, z: 0 };
  let goIn = false, active = null, up = true, step = 0;
  const setWay = (lx, lz, y) => { way.x = I.x + lx * I.c + lz * I.s; way.z = I.z - lx * I.s + lz * I.c; way.y = y; return way; };
  const d = q => Math.hypot(q.x - NAKA.pp.x, q.z - NAKA.pp.z);
  return () => {
    const p = NAKA.pp, tg = typeof target === 'function' ? target() : target;
    if (I.disabled || !tg || tg.alive === false) { active = null; return null; }
    const pos = tg.pos || tg;
    if (!p) return pos;
    const r = nakaRoomAt(p.x, p.z, p.y);
    if (!r || r.I !== I) {
      active = null;
      const out = I.doorOut, inn = I.doorIn;
      const low = I.approach ? I.approach.gy : inn.y;
      if ((d(out) < 1.6 && Math.abs(p.y - low) < 1) || (d(inn) < 3.5 && Math.abs(p.y - inn.y) < .8)) goIn = true;
      else if (d(out) > 5 || p.y < Math.min(low, inn.y) - 1 || p.y > inn.y + 1) goIn = false;
      return goIn ? inn : out;
    }
    const targetRoom = pos.y != null ? nakaRoomAt(pos.x, pos.z, pos.y) : null;
    const goal = targetRoom?.I === I ? targetRoom.lv.k : r.lv.k;
    if (active) {
      const q = active.points[step]; setWay(q.x, q.z, q.y);
      if (d(way) < .65 && Math.abs(p.y - q.y) < .65) {
        step += up ? 1 : -1;
        if (step < 0 || step >= active.points.length) active = null;
      }
      if (active) { const next = active.points[step]; return setWay(next.x, next.z, next.y); }
    }
    if (r.lv.k !== goal) {
      up = r.lv.k < goal; active = I.stairs[up ? r.lv.k : r.lv.k - 1];
      step = up ? 0 : active.points.length - 1;
      const q = active.points[step]; return setWay(q.x, q.z, q.y);
    }
    const dx = p.x - I.x, dz = p.z - I.z, tx = pos.x - I.x, tz = pos.z - I.z;
    interiorWaypoint(r.lv.layout, dx * I.c - dz * I.s, dx * I.s + dz * I.c, tx * I.c - tz * I.s, tx * I.s + tz * I.c, local);
    return setWay(local.x, local.z, inabaFloorY(I, r.lv, local.x, local.z));
  };
}

// 森部の視線は壁芯だけでなく、柱・框・戸板の見込みでも止める。
// 建物の向きへ戻して既存の部材の箱を調べ、平行に寄った時や木口も拾う。
// 高さも同時に絞るので、低い調度の上や開いた戸口に見えない壁を残さない。
function moribeCameraHit(I, w, p, dx, dz, eyeY, dy) {
  const px = (p.x - I.x) * I.c - (p.z - I.z) * I.s;
  const pz = (p.x - I.x) * I.s + (p.z - I.z) * I.c;
  const vx = dx * I.c - dz * I.s, vz = dx * I.s + dz * I.c;
  const ax = (w.ax - I.x) * I.c - (w.az - I.z) * I.s;
  const az = (w.ax - I.x) * I.s + (w.az - I.z) * I.c;
  const bx = (w.bx - I.x) * I.c - (w.bz - I.z) * I.s;
  const bz = (w.bx - I.x) * I.s + (w.bz - I.z) * I.c;
  let near = 0, far = 1;
  for (let axis = 0; axis < 3; axis++) {
    const start = axis === 0 ? px : axis === 1 ? pz : eyeY;
    const delta = axis === 0 ? vx : axis === 1 ? vz : dy;
    const low = axis === 0 ? Math.min(ax, bx) - w.r : axis === 1 ? Math.min(az, bz) - w.r : w.yBot;
    const high = axis === 0 ? Math.max(ax, bx) + w.r : axis === 1 ? Math.max(az, bz) + w.r : w.yTop;
    if (Math.abs(delta) < 1e-8) {
      if (start < low || start > high) return 1;
    } else {
      const a = (low - start) / delta, b = (high - start) / delta;
      near = Math.max(near, Math.min(a, b));
      far = Math.min(far, Math.max(a, b));
      if (near > far) return 1;
    }
  }
  return near;
}

// カメラを部屋の内に収める（player.js）。中にいなければ何もしない
export function nakaCamClamp(v, overhead = true) {
  const C = NAKA.cur;
  if (!C) return false;
  const { I, lv } = C;
  const dx = v.x - I.x, dz = v.z - I.z;
  let lx = dx * I.c - dz * I.s, lz = dx * I.s + dz * I.c;
  const margin = lv.cameraWallMargin ?? .3;
  const mx = Math.max(0, lv.w / 2 - Math.min(margin, lv.w / 4)), mz = Math.max(0, lv.d / 2 - Math.min(margin, lv.d / 4));
  lx = Math.max(-mx, Math.min(mx, lx)); lz = Math.max(-mz, Math.min(mz, lz));
  v.x = I.x + lx * I.c + lz * I.s; v.z = I.z - lx * I.s + lz * I.c;
  // 信貴山の三人称は梁の上から見る。近い天井・壁は専用材質で薄くする。
  if (I.sgOverhead && overhead) { v.y = lv.y + lv.h + .8; return true; }
  // 梁の下端（天井より約四十センチ下）とカメラの間にも余白を残す。
  v.y = Math.max(lv.y + 0.5, Math.min(lv.y + Math.max(.5, lv.h - Math.max(.8, lv.cameraClearance ?? .8)), v.y));
  // 本人の目からカメラまでの線を、間仕切り・廊下・外壁で止める。
  const p = NAKA.pp;
  if (p) {
    const dx = v.x - p.x, dz = v.z - p.z, eyeY = Math.min(lv.y + lv.h - .5, p.y + 1.46);
    let first = 1;
    for (const w of INTERIOR_WALLS) {
      if (w.naka !== I.id) continue;
      if (I.profile === 'moribe') {
        first = Math.min(first, moribeCameraHit(I, w, p, dx, dz, eyeY, v.y - eyeY));
        continue;
      }
      const sx = w.bx - w.ax, sz = w.bz - w.az, den = dx * sz - dz * sx;
      if (Math.abs(den) < 1e-8) continue;
      const ax = w.ax - p.x, az = w.az - p.z;
      const t = (ax * sz - az * sx) / den, q = (ax * dz - az * dx) / den;
      const y = eyeY + (v.y - eyeY) * t;
      if (t >= 0 && t < first && q >= 0 && q <= 1 && y >= w.yBot && y <= w.yTop) first = t;
    }
    if (first < 1) {
      const gap = lv.cameraWallMargin ?? .2;
      const t = Math.max(0, first - gap / Math.max(gap, Math.hypot(dx, dz)));
      v.x = p.x + dx * t; v.z = p.z + dz * t; v.y = eyeY + (v.y - eyeY) * t;
    }
  }
  return true;
}

// 狭間の内側で外を向いている時だけ、自分の目で小窓をのぞく。
export function nakaWindowAt(u, yaw) {
  const C = NAKA.cur;
  if (!C || !u.alive || u.downed || u.climb) return null;
  const I = C.I, dx = u.pos.x - I.x, dz = u.pos.z - I.z;
  const lx = dx * I.c - dz * I.s, lz = dx * I.s + dz * I.c;
  for (const v of C.lv.shots) {
    const along = v.face === 'z' ? lx : lz, across = v.face === 'z' ? lz : lx;
    const edge = (v.face === 'z' ? C.lv.d : C.lv.w) / 2;
    if (Math.abs(along - v.t) > v.w / 2 - .1 || edge - across * v.s > 1.05 || edge - across * v.s < -.05) continue;
    if (u.pos.y + 1.46 < v.y0 || u.pos.y + 1.46 > v.y1 || Math.cos(yaw - v.heading) < .7) continue;
    return v;
  }
  return null;
}

// ---------------- 見た目 ----------------
// 稲葉山の灯明皿と火は共通の形から室内の束へまとめる。
const OIL_DISH = new THREE.CylinderGeometry(1, 1, 1, 12);
const OIL_FLAME = new THREE.SphereGeometry(1, 8, 6);
// 長押の釘隠し。八角の薄い金具を共有し、設営時に木部と同じ束へまとめる。
const NAGESHI_KANAGU = new THREE.CylinderGeometry(.04, .04, .012, 8).rotateX(Math.PI / 2);
// 桁の継ぎ材と込栓は同じ単位形から作り、室内の木部へ結合する。
const INABA_GIRDER_PART = new THREE.BoxGeometry(1, 1, 1);
// 本堂内陣の丸柱。四本とも単位形を使い回し、設営時に木部へ結合する。
const INABA_HALL_POST = new THREE.CylinderGeometry(1, 1, 1, 12);
// 内陣の貫の楔も共通形にする。側面と上下面は長手の木目、両端は木口。
const INABA_HALL_WEDGE = INABA_GIRDER_PART.clone();
{
  const p = INABA_HALL_WEDGE.attributes.position;
  const n = INABA_HALL_WEDGE.attributes.normal, uv = INABA_HALL_WEDGE.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (Math.abs(n.getZ(i)) <= .5)
      uv.setXY(i, (Math.abs(n.getY(i)) > .5 ? x : y) + .5, z + .5);
    p.setY(i, (y + .5) * (.25 + .75 * (z + .5)));
  }
  INABA_HALL_WEDGE.scale(.09, .028, .22);
  INABA_HALL_WEDGE.computeVertexNormals();
}
// 舟肘木は両端の下を斜めに削る推定形。上端の受け面と外寸は角材と揃える。
// 箱と同じ面数の共通形を使い、室内を組む時だけ伸縮して束へまとめる。
const INABA_HALL_HIJIKI = new THREE.BoxGeometry(1, 1, 1);
{
  const p = INABA_HALL_HIJIKI.attributes.position;
  for (let i = 0; i < p.count; i++)
    if (p.getY(i) < 0) p.setX(i, p.getX(i) * .6);
  INABA_HALL_HIJIKI.computeVertexNormals();
  // 舟肘木の下面と側面にも長手の木目を通す。単位形で一度だけ割り付ける。
  const n = INABA_HALL_HIJIKI.attributes.normal, uv = INABA_HALL_HIJIKI.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    if (Math.abs(n.getX(i)) > .5) continue;
    uv.setXY(i, (Math.abs(n.getY(i)) > .5 ? p.getZ(i) : p.getY(i)) + .5, p.getX(i) + .5);
  }
}
// 用屋の貫を柱際で締める楔。下端は水平、上端だけ先へ薄くした共通形。
const INABA_NUKI_WEDGE = new THREE.BoxGeometry(.24, 1, .04);
{
  const p = INABA_NUKI_WEDGE.attributes.position;
  for (let i = 0; i < p.count; i++)
    p.setY(i, p.getY(i) > 0 ? .014 + (p.getX(i) + .12) / .24 * .026 : 0);
  INABA_NUKI_WEDGE.computeVertexNormals();
}
let MAT = null;
let ceilingWood = null;
let earthenWall = null;
let moribePostShape = null;
function moribePostGeometry() {
  if (moribePostShape) return moribePostShape;
  // 室内の外周柱は四隅を小さく落とした角柱で推定復元する。
  // 十四〜十六センチ角に対して面は五〜六ミリ。三棟で原形を共用する。
  const outline = new THREE.Shape();
  outline.moveTo(-.46, -.5);
  outline.lineTo(.46, -.5); outline.lineTo(.5, -.46);
  outline.lineTo(.5, .46); outline.lineTo(.46, .5);
  outline.lineTo(-.46, .5); outline.lineTo(-.5, .46);
  outline.lineTo(-.5, -.46); outline.closePath();
  moribePostShape = new THREE.ExtrudeGeometry(outline,
    { depth: 1, bevelEnabled: false, steps: 1, curveSegments: 1 });
  moribePostShape.translate(0, 0, -.5);
  moribePostShape.rotateX(-Math.PI / 2);
  return moribePostShape;
}
function earthenWallMaterial() {
  if (earthenWall) return earthenWall;
  // 森部の内壁用。土粒と短いすさを一枚へ描き、三棟で絵・材質を共用する。
  // 色と室内の陰は既存の頂点色に任せ、設営後に描き直さない。
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#faf9f6'; ctx.fillRect(0, 0, 128, 128);
  let seed = 1561;
  const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 1600; i++) {
    const x = rand() * 128, y = rand() * 128;
    ctx.fillStyle = `rgba(75,64,43,${.025 + rand() * .055})`;
    ctx.fillRect(x, y, 1, 1);
  }
  ctx.strokeStyle = 'rgba(100,82,48,.1)'; ctx.lineWidth = .5;
  for (let i = 0; i < 45; i++) {
    const x = 3 + rand() * 122, y = 3 + rand() * 122;
    ctx.beginPath(); ctx.moveTo(x, y);
    ctx.lineTo(x + rand() * 4 - 2, y + rand() * 4 - 2); ctx.stroke();
  }
  const map = new THREE.CanvasTexture(cv); map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  earthenWall = new THREE.MeshBasicMaterial({ map, vertexColors: true });
  return earthenWall;
}
function ceilingWoodMaterial() {
  if (ceilingWood) return ceilingWood;
  // 森部三棟で一枚だけ共用。色は頂点色へ任せ、木目の明暗だけを掛ける。
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#f5f3ee'; ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 48; i++) {
    const x = (i * 37 % 128) + .5, bend = Math.sin(i * 2.3) * 2;
    ctx.strokeStyle = `rgba(65,49,29,${.04 + (i % 5) * .012})`;
    ctx.lineWidth = i % 3 ? .5 : 1;
    ctx.beginPath(); ctx.moveTo(x, 0);
    ctx.bezierCurveTo(x + bend, 42, x - bend, 86, x, 128); ctx.stroke();
  }
  const map = new THREE.CanvasTexture(cv); map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  // 木口だけは年輪の絵へ切り替える。同じ材質・描画一束のまま、面の印で選ぶ。
  const endCv = document.createElement('canvas'); endCv.width = endCv.height = 128;
  const endCtx = endCv.getContext('2d');
  endCtx.fillStyle = '#f5f3ee'; endCtx.fillRect(0, 0, 128, 128);
  for (let ring = 1; ring <= 28; ring++) {
    endCtx.beginPath();
    for (let q = 0; q <= 96; q++) {
      const angle = q * Math.PI * 2 / 96;
      const radius = ring * 4 + Math.sin(angle * 3 + ring * .23) * .7;
      const x = 38 + Math.cos(angle) * radius, y = 46 + Math.sin(angle) * radius * .84;
      if (q) endCtx.lineTo(x, y); else endCtx.moveTo(x, y);
    }
    endCtx.strokeStyle = `rgba(65,49,29,${.08 + ring % 3 * .025})`;
    endCtx.lineWidth = ring % 3 ? .6 : 1; endCtx.stroke();
  }
  const endMap = new THREE.CanvasTexture(endCv); endMap.colorSpace = THREE.SRGBColorSpace;
  endMap.wrapS = endMap.wrapT = THREE.RepeatWrapping;
  ceilingWood = new THREE.MeshBasicMaterial({ map, vertexColors: true });
  ceilingWood.onBeforeCompile = shader => {
    shader.uniforms.woodEndMap = { value: endMap };
    shader.vertexShader = shader.vertexShader.replace('#include <common>',
      '#include <common>\nattribute float woodEnd;\nvarying float vWoodEnd;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvWoodEnd = woodEnd;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>',
      '#include <common>\nuniform sampler2D woodEndMap;\nvarying float vWoodEnd;')
      .replace('#include <map_fragment>', `
#ifdef USE_MAP
  vec4 sampledDiffuseColor = vWoodEnd > .5
    ? texture2D(woodEndMap, vMapUv) : texture2D(map, vMapUv);
  diffuseColor *= sampledDiffuseColor;
#endif
`);
  };
  ceilingWood.customProgramCacheKey = () => 'moribe-wood-end';
  return ceilingWood;
}
function mats() {
  if (MAT) return MAT;
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const g = cv.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,220,160,1)'); gr.addColorStop(0.35, 'rgba(255,170,80,0.45)'); gr.addColorStop(1, 'rgba(255,140,40,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  MAT = {
    base: new THREE.MeshBasicMaterial({ vertexColors: true }),
    // 比叡山の床・柱・格天井は光を受け、梁の側面と下面に陰影を付ける。
    // 堂ごとに材質や光源を足さず、暗部を補う弱い照りも一つの材質で共有する。
    hieiBase: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, emissive: 0x514c41, emissiveIntensity: .16 }),
    shaft: new THREE.MeshBasicMaterial({ color: 0xfff0d2, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }),
    glow: new THREE.SpriteMaterial({ map: tex, color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.55 }),
    door: new THREE.MeshLambertMaterial({ vertexColors: true }),
  };
  return MAT;
}
function colorize(g, hex, emit) {
  g = g.index ? g.toNonIndexed() : g;
  const col = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = col.r; a[i * 3 + 1] = col.g; a[i * 3 + 2] = col.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  g.userData.emit = !!emit;
  return g;
}

// 中を作る（近づいた時に一度だけ）
function buildInside(rt, I) {
  
  I.built = true;
  const M = mats(), list = [], lamps = [], winPts = [], paper = [], ceilingWood = [], plaster = [], timbers = [];
  const naibu = I.profile || ['yagura', 'gate'].includes(I.kind) ? new KitBatch() : null;
  const put = (g, lx, y, lz, hex, emit, wood = false) => { g.translate(lx, y, lz); g.rotateY(I.rot); g.translate(I.x, 0, I.z); (wood ? ceilingWood : list).push(colorize(g, hex, emit)); };
  // 桶狭間の柱・梁・天井板は同じ基本形から作り、設営時に一束へまとめる。
  const interiorBox = I.profile === 'okehazama' ? new THREE.BoxGeometry(1, 1, 1) : null;
  // 長福寺の外周の長押も、内陣境と同じ簡素な八角の釘隠しで柱へ留める推定復元。
  // 原形は堂ごとに一つ。壁の束へ焼き込み、光源や毎コマの処理は増やさない。
  const nailCover = I.profile === 'okehazama' && I.kind === 'hondo'
    ? new THREE.CylinderGeometry(.045, .045, .012, 8).rotateX(Math.PI / 2) : null;
  const plainBox = (lx, y, lz, w, h, d, hex, emit) => put(interiorBox ? interiorBox.clone().scale(w, h, d) : new THREE.BoxGeometry(w, h, d), lx, y, lz, hex, emit);
  // 民家の囲炉裏から煙抜きへ上がった煤を、既存の板・梁の頂点色へ焼き込む推定復元。
  // 炉を外した家や別の建物には煤を付けない。木目のある天井板も同じ頂点色で煤けさせる。
  const smokeBox = (hearth, lx, y, lz, w, h, d, hex, grain = null, grainStart = 0, grainWidth = 1, wedge = null, boardGrid = null, miter = null) => {
    if (!hearth && !grain) { box(lx, y, lz, w, h, d, hex); return; }
    const g = colorize(interiorBox.clone().scale(w, h, d), hex);
    const p = g.attributes.position, c = g.attributes.color;
    if (miter) {
      // 格天井の押縁の四隅は留め継ぎとする推定復元。
      // 外縁の長さを保ち、内縁だけを両端で削って四十五度の木口を合わせる。
      // 共通の箱の頂点だけを動かし、部品数・材質・毎コマの仕事は増やさない。
      const alongX = grain === 'beamX', length = alongX ? w : d, width = alongX ? d : w;
      for (let i = 0; i < p.count; i++) {
        const cross = alongX ? p.getZ(i) : p.getX(i);
        const along = alongX ? p.getX(i) : p.getZ(i);
        const end = Math.sign(along) * (length / 2 - width / 2 + miter.side * cross);
        if (alongX) p.setX(i, end); else p.setZ(i, end);
      }
      g.computeVertexNormals();
    }
    if (wedge) {
      // 貫を締める楔は下端を薄く、打ち込む上端を厚くする推定の形。
      // 柱側の面を動かさず、室内側だけを削る。同じ箱・木肌・煤の処理を共有する。
      for (let i = 0; i < p.count; i++) {
        const thickness = .25 + .75 * (p.getY(i) / h + .5);
        if (wedge.axis === 'x') p.setX(i, -wedge.side * w / 2 + (p.getX(i) + wedge.side * w / 2) * thickness);
        else p.setZ(i, -wedge.side * d / 2 + (p.getZ(i) + wedge.side * d / 2) * thickness);
      }
      g.computeVertexNormals();
    }
    if (hearth) {
      // 炉の近くだけ柱脚まで黒くせず、煙が上がる高さへ煤を寄せる推定復元。
      // 板壁・柱・梁で同じ床と天井を基準にし、窓で分かれた板の上下もつなぐ。
      const lv = I.levels[0], low = lv.y + hearth.h + .15;
      const rise = Math.max(.1, lv.y + lv.h - .25 - low);
      for (let i = 0; i < p.count; i++) {
        const dx = (p.getX(i) + lx - hearth.x) / 1.35;
        const dz = (p.getZ(i) + lz - hearth.z) / 1.1;
        const height = Math.max(0, Math.min(1, (p.getY(i) + y - low) / rise));
        const falloff = Math.max(0, 1 - (dx * dx + dz * dz) / 4);
        const shade = 1 - .7 * falloff * falloff * height;
        c.setXYZ(i, c.getX(i) * shade, c.getY(i) * shade, c.getZ(i) * shade);
      }
    }
    if (grain === 'wallX' || grain === 'wallZ') {
      // 縦板は高さ方向へ木目を通す。窓で分かれた上下も建物内の同じ基準で貼り、
      // 短い切り口ごとに節を引き延ばさない。天井と同じ木肌・描画の束を使う。
      const uv = g.attributes.uv, normals = g.attributes.normal;
      for (let i = 0; i < uv.count; i++) {
        const end = Math.abs(normals.getY(i)) > .5;
        const across = grain === 'wallZ' ? p.getX(i) + lx : p.getZ(i) + lz;
        uv.setXY(i, end ? .5 : (across - grainStart) / grainWidth,
          end ? .5 : (p.getY(i) + y - I.levels[0].y) / I.levels[0].h);
      }
    } else if (grain === 'post') {
      // 柱は四面とも高さ方向へ繊維を通し、木口には節を長く引き延ばさない。
      // 天井・板壁と同じ木肌と束を使い、形・当たり・描画回数は増やさない。
      const uv = g.attributes.uv, normals = g.attributes.normal;
      for (let i = 0; i < uv.count; i++) {
        const end = Math.abs(normals.getY(i)) > .5;
        const across = Math.abs(normals.getX(i)) > .5 ? p.getZ(i) / d : p.getX(i) / w;
        // 桶狭間の柱は部材の長さで木目を引き伸ばさず、同じ床高から木取りする。
        // 木口も実寸の断面へ貼り、舟肘木・室内の鴨居と縮尺をそろえる。
        uv.setXY(i, end ? p.getX(i) + .5 : across + .5,
          end ? p.getZ(i) + .5 : p.getY(i) + y - I.levels[0].y + .5);
      }
    } else if (grain === 'beamX' || grain === 'beamZ' || grain === 'x' || grain === 'z') {
      // 梁・桁・天井板の木目は下面と側面の両方で長手へ通す。
      // 木口へ長手の節を引き延ばさず、切り欠きの小面も同じ木肌で納める。
      // 竿縁天井の横板と格天井の鏡板も面ごとに貼る。箱の既定の座標では、
      // 薄い板の側面に板幅いっぱいの木目が縮み、木口にも長い節が出ていた。
      const uv = g.attributes.uv, normals = g.attributes.normal;
      const alongX = grain === 'beamX' || grain === 'x', width = alongX ? d : w;
      for (let i = 0; i < uv.count; i++) {
        const end = Math.abs(alongX ? normals.getX(i) : normals.getZ(i)) > .5;
        const cross = alongX ? p.getZ(i) : p.getX(i);
        const across = alongX ? p.getZ(i) + lz : p.getX(i) + lx;
        const along = alongX ? p.getX(i) + lx : p.getZ(i) + lz;
        const u = Math.abs(normals.getY(i)) > .5
          ? boardGrid ? (across - (alongX ? boardGrid.z : boardGrid.x)) / (boardGrid.width || .3) : cross / width + .5
          : p.getY(i) / h + .5;
        // 柱と同じく一メートルを木目一周期にする。長い梁だけ節が引き伸ばされず、
        // 格天井の鏡板も格間の奥行きで繊維の細かさを変えない。
        // 欠いた板は切る前の原点を保ち、相じゃくりの上下で木目をつなぐ。
        const v = boardGrid ? along - (alongX ? boardGrid.x : boardGrid.z)
          : (alongX ? p.getX(i) : p.getZ(i)) + .5;
        uv.setXY(i, end ? cross + .5 : u, end ? p.getY(i) + .5 : v);
      }
    }
    g.translate(lx, y, lz); g.rotateY(I.rot); g.translate(I.x, 0, I.z);
    (grain ? ceilingWood : list).push(g);
  };
  // 天井板は幅いっぱいの一枚板にせず、竿縁・梁の上で継ぐ推定復元。
  // 竿縁の間では板の小口を一枚おきにずらす。木目の板は一棟につき一束へまとめる。
  const ceilingBoards = (x0, x1, z0, z1, y, origin, supportStep, hearth = null, boardOriginZ = z0) => {
    // 板の長辺は相じゃくりの推定復元。下面の目地は三ミリに抑え、
    // 上半分を隣の板へ掛ける。九ミリの黒い帯で継ぎ目を埋める作りにしない。
    // 短辺は従来どおり竿縁・梁の上で継ぎ、木口だけを少し奥へ納める。
    // 上下の板も同じ箱・木肌・煤を使い、既存の天井の束へまとめる。
    const joint = .003, lap = .012;
    const boardBox = (x, z, w, d) => smokeBox(hearth, x, y + .004, z, w, .006, d, 0x57412e, 'x');
    const bays = Math.max(1, Math.round(1.8 / supportStep));
    const span = bays * supportStep;
    // 煙抜きで分けた四辺も、部屋全体の板幅・継ぎ目・木色を共有する。
    // 切り口ごとに並べ直すと、穴の前後で同じ天井板の目地が食い違う。
    let row = Math.max(0, Math.floor((z0 - boardOriginZ + .000001) / .3));
    for (; boardOriginZ + row * .3 < z1 - .01; row++) {
      const edge = boardOriginZ + row * .3;
      const z = Math.max(z0, edge), end = Math.min(z1, edge + .3);
      if (end - z <= .009) continue;
      const offset = row % 2 ? Math.max(1, Math.floor(bays / 2)) * supportStep : span;
      let start = x0, board = Math.floor((x0 - origin - offset + .000001) / span) + 1;
      const panel = endX => {
        // 板ごとに木色をわずかに変える。竿縁が継ぎ目を隠す所でも板の長さが分かる。
        // 煙抜きで分けた板も、切る前の一枚の位置から木目を貼る。
        // 切り口ごとに木目を伸ばし直さず、穴の左右・前後で繊維と節をつなぐ。
        const boardGrid = { x: origin + offset + (board - 1) * span, z: edge, span };
        if (endX - start > .02) {
          const color = (row + board) % 3 === 0 ? 0x80694c : (row + board) % 3 === 1 ? 0x7a6448 : 0x766044;
          smokeBox(hearth, (start + endX) / 2, y + .003, (z + end) / 2,
            endX - start - joint, .006, end - z - joint, color, 'x', 0, 1, null, boardGrid);
          // 煙抜き・回縁の端でじゃくりを切る。切片へ掛かりを足して炉の口を塞がない。
          // 同じ一枚の座標で木目を貼り、段欠きの上下で節の位置を変えない。
          const back = edge <= z0 + .000001 ? z0 : Math.min(z1, edge + lap);
          const front = Math.min(z1, edge + .3 + lap);
          if (front > back) smokeBox(hearth, (start + endX) / 2, y + .009, (back + front) / 2,
            endX - start - joint, .006, front - back, color, 'x', 0, 1, null, boardGrid);
        }
        start = endX; board++;
      };
      for (let x = origin + offset; x < x1 - .05; x += span) {
        if (x <= x0 + .05) continue;
        panel(x);
        boardBox(x, (z + end) / 2, joint, end - z);
      }
      panel(x1);
    }
  };
  const floorBoardShape = new THREE.BoxGeometry(1, 1, 1);
  const hieiBox = (lx, y, lz, w, h, d, hex, emit, grainAxis = null) => {
    // 外周の見える柱だけを面取りする。梁・長押・溝・仕口の小部材は従来の寸法。
    // 外形と歩く当たりは保ち、設営時に木目付きの形へまとめる。
    const post = I.profile === 'moribe' && ['yashiki', 'hondo'].includes(I.kind)
      && hex === DARK && !emit && h > .5 && w >= .13 && w <= .17 && d >= .13 && d <= .17;
    const g = post ? moribePostGeometry().clone().scale(w, h, d) : new THREE.BoxGeometry(w, h, d);
    const red = hex >> 16 & 255, green = hex >> 8 & 255, blue = hex & 255;
    if (I.profile === 'hieizan' && !emit && red > green * 1.18 && green > blue * 1.15) {
      const axis = h >= w && h >= d ? 1 : w >= d ? 0 : 2;
      const cross = axis === 0 ? [1, 2] : axis === 1 ? [0, 2] : [0, 1];
      const p = g.attributes.position, normal = g.attributes.normal, uv = g.attributes.uv;
      const component = (a, i, k) => k === 0 ? a.getX(i) : k === 1 ? a.getY(i) : a.getZ(i);
      const offset = (lx * .37 + y * .19 + lz * .53) % 1;
      for (let i = 0; i < p.count; i++) {
        const end = Math.abs(component(normal, i, axis)) > .5;
        const side = end || Math.abs(component(normal, i, cross[0])) > .5 ? cross[1] : cross[0];
        uv.setXY(i, component(p, i, side) / .45 + offset,
          end ? component(p, i, cross[0]) / .45 : component(p, i, axis) / 2.4);
      }
      g.translate(lx, y, lz); g.rotateY(I.rot); g.translate(I.x, 0, I.z);
      timbers.push(colorize(g, hex, emit));
      return;
    }
    const earth = I.profile === 'moribe' && ['yashiki', 'hondo'].includes(I.kind) && hex === WALL;
    if (earth) {
      // 穴の上下で壁を分けても粒の大きさ・位置をそろえる。窓枠と柱は木のまま残す。
      const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
      for (let i = 0; i < p.count; i++) {
        const across = Math.abs(n.getX(i)) > .5 ? lz + p.getZ(i) : lx + p.getX(i);
        uv.setXY(i, across / .5, (y + p.getY(i)) / .5);
      }
    }
    const timber = I.profile === 'moribe' && !emit && [0x6a5038, 0x3a2a1c, 0x6a5238, 0x2e2216].includes(hex);
    if (timber) {
      // 柱は縦、梁・長押・竿縁は長手へ木目を通す。天井板と同じ絵・材質を共用する。
      // 木口は短辺二方向の目に替え、側面の長い木目を端面まで引き延ばさない。
      const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
      // 欠き込んで短くした部分も、分割前の一本の木と同じ繊維方向にする。
      const axis = grainAxis ?? (h >= w && h >= d ? 1 : w >= d ? 0 : 2);
      const a = (axis + 1) % 3, b = (axis + 2) % 3;
      const phase = lx * .37 + lz * .19 + y * .11;
      const component = (attribute, i, axis) => axis === 0 ? attribute.getX(i) : axis === 1 ? attribute.getY(i) : attribute.getZ(i);
      const origin = axis => axis === 0 ? lx : axis === 1 ? y : lz;
      const ends = new Float32Array(p.count);
      for (let i = 0; i < p.count; i++) {
        const end = Math.abs(component(n, i, axis)) > .5;
        if (end) {
          ends[i] = 1;
          uv.setXY(i, (component(p, i, a) + origin(a)) / .3 + phase,
            (component(p, i, b) + origin(b)) / .3);
          continue;
        }
        const across = Math.abs(component(n, i, a)) < .5 ? a : b;
        // 仕口で分けた梁・回縁も建物内の同じ座標から木目を取る。
        // 箱ごとの中心を基準にすると、欠いた部分で木目が飛んで継ぎ木に見える。
        uv.setXY(i, (component(p, i, across) + origin(across)) / .3,
          (component(p, i, axis) + origin(axis)) / 1.2);
      }
      g.setAttribute('woodEnd', new THREE.BufferAttribute(ends, 1));
    }
    put(g, lx, y, lz, hex, emit);
    if (timber) list[list.length - 1].userData.ceilingWood = true;
    if (earth) list[list.length - 1].userData.earthenWall = true;
  };
  // 稲葉山の天井板は単色の箱でなく、板の長手へ木目を通す。
  // 共通の箱・床と建具の絵を使い、設営時に一棟一束へまとめる。
  const ceilingBoard = (lx, y, lz, w, h, d, hex, alongX = false) => {
    const g = INABA_WALL_BOARD.clone(), p = g.attributes.position, uv = g.attributes.uv;
    // 板幅や継ぎ材の長さで木目を伸縮させず、三十センチ幅・二・四歩の絵を共有する。
    const acrossScale = (alongX ? d : w) / .3, lengthScale = (alongX ? w : d) / 2.4;
    for (let i = 0; i < p.count; i++) uv.setXY(i,
      ((alongX ? p.getZ(i) : p.getX(i)) + .5) * acrossScale,
      ((alongX ? p.getX(i) : p.getZ(i)) + .5) * lengthScale);
    g.scale(w, h, d);
    put(g, lx, y, lz, hex);
    ceilingWood.push(list[list.length - 1]);
  };
  // 用屋・小祠の見せる梁と桁も、下面と側面へ材の長手に沿う板目を通す。
  // 天井板用の平面投影では側面の絵が一本の線になるため、面ごとに割り付ける。
  // 既存の木部の束と絵を共有し、角材の寸法・面数・当たりは変えない。
  const exposedTimber = (lx, y, lz, w, h, d, hex, alongX = false, turn = 0) => {
    const g = INABA_GIRDER_PART.clone(), p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
    // 玄関の柱・障子窓の縦枠は縦目。梁用の横目を回さず貼ると木口が側面へ出る。
    // 同じ箱と木目の束を共有し、戸じゃくりの細い木口にも材の向きを通す。
    const upright = alongX === 'y';
    const scaled = S.quality === 'high' && I.profile === 'inabayama';
    const lengthScale = scaled ? (upright ? h : alongX ? w : d) / 2.4 : 1;
    for (let i = 0; i < p.count; i++) {
      if (upright) {
        if (Math.abs(n.getY(i)) > .5) continue;
        const side = Math.abs(n.getX(i)) > .5;
        uv.setXY(i, ((side ? p.getZ(i) : p.getX(i)) + .5) * (scaled ? (side ? d : w) / .3 : 1),
          (p.getY(i) + .5) * lengthScale);
        continue;
      }
      if (Math.abs(alongX ? n.getX(i) : n.getZ(i)) > .5) continue;
      const top = Math.abs(n.getY(i)) > .5;
      const across = top ? (alongX ? p.getZ(i) : p.getX(i)) : p.getY(i);
      const acrossScale = scaled ? (top ? (alongX ? d : w) : h) / .3 : 1;
      uv.setXY(i, (across + .5) * acrossScale,
        ((alongX ? p.getX(i) : p.getZ(i)) + .5) * lengthScale);
    }
    g.scale(w, h, d);
    if (turn) g.rotateY(turn);
    put(g, lx, y, lz, hex);
    ceilingWood.push(list[list.length - 1]);
  };
  const hijiki = (x, y, z, length, height, width, turn = false) => {
    const g = INABA_HALL_HIJIKI.clone().scale(length, height, width);
    if (turn) g.rotateY(Math.PI / 2);
    put(g, x, y, z, 0x3a2a1c);
    ceilingWood.push(list[list.length - 1]);
  };
  // 丸柱は円周の絵を縦へ通し、頭貫・天井と同じ木目の束へ納める。
  // 木製の礎盤も柱身と同じ絵を共有し、上下面は木口、側面は縦目で納める。
  const hallBase = (x, y, z, radius, height, hex) => {
    put(INABA_HALL_POST.clone().scale(radius, height, radius), x, y, z, hex);
    ceilingWood.push(list[list.length - 1]);
  };
  const hallShaft = (x, y, z, height) => {
    put(INABA_HALL_POST.clone().scale(.06, height, .06), x, y, z, 0x3a2a1c);
    ceilingWood.push(list[list.length - 1]);
  };
  const box = (...args) => { return (I.profile === 'okehazama' ? plainBox : hieiBox)(...args);
  };
  const grp = new THREE.Group();
  const Ls = I.levels, ds = I.door.side;
  const goten = !['tenshu', 'yagura', 'gate'].includes(I.kind);
  const okeBansho = I.profile === 'okehazama' && ['bansho', 'minka'].includes(I.kind);
  const paperWindows = I.templePaper || I.profile === 'moribe';
  // 稲葉山の用屋と小祠は板張りと貫で納め、座敷の白壁・長押を使わない。
  const inabaBoards = S.quality === 'high' && I.profile === 'inabayama' && ['kura', 'bansho', 'nagaya', 'shrine'].includes(I.kind);
  const plainCeiling = I.profile === 'inabayama' && ['kura', 'bansho', 'nagaya'].includes(I.kind)
    // 小祠は座敷の竿縁天井にせず、梁と桁を見せる推定の納まり。
    || S.quality === 'high' && I.profile === 'inabayama' && I.kind === 'shrine'
    || I.profile === 'echizen_ikko' && I.kind === 'bansho'
    || ['nodafukushima', 'usayama', 'iga', 'takato', 'tottori', 'okehazama'].includes(I.profile) && ['kura', 'bansho', 'nagaya'].includes(I.kind)
    || I.profile === 'iwamura_' + I.kind && ['kura', 'bansho', 'nagaya'].includes(I.kind);
  const WOOD = 0x6a5038, DARK = 0x3a2a1c, WALL = I.sgOverhead ? 0x817967 : goten ? 0xb8ab90 : 0xa89a80, FLOOR = 0x8a6a48, BOARD = I.sgOverhead ? 0x514b3d : 0x6a5238;
  for (let k = 0; k < Ls.length; k++) {
    const lv = Ls[k], hw = lv.w / 2, hd = lv.d / 2, h = lv.h, y = lv.y;
    // 座敷の長押は回縁の下へ二センチ空け、間仕切り（interior_parts.js）と揃える。
    const lowNageshi = S.quality === 'high' && I.profile === 'inabayama' && ['goten', 'tamari'].includes(I.kind);
    const nageshiH = lowNageshi ? .08 : .12, nageshiOffset = lowNageshi ? .14 : .1;
    // 民家の炉から屋根裏へ煙を逃がす推定復元。炉を撤去した間取りには穴を残さない。
    // 天井の下地と仕上げを同じ口で切り、梁は構造材として残す。煙の粒や光源は増やさない。
    const hearth = I.profile === 'okehazama' && I.kind === 'minka'
      ? lv.layout.props.find(p => p.part === 'hearth') : null;
    const smokeVent = hearth ? { x0: hearth.x - .28, x1: hearth.x + .28,
      z0: hearth.z - .28, z1: hearth.z + .28 } : null;
    // 外周・戸脇・間仕切り端の柱を同じ木肌で仕上げる。炉のある家は煤も共有する。
    const pillar = (x, yy, z, w, ph, d, hex) => I.profile === 'okehazama'
      ? smokeBox(hearth, x, yy, z, w, ph, d, hex, 'post') : box(x, yy, z, w, ph, d, hex);
    // 民家の囲炉裏は仕上げ板と下地の両方を切り、炉床まで見える口を作る。
    // 調度の配置が確定した後だけ処理し、歩ける床と炉の当たりは変えない。
    let floorPieces = lv.pieces;
    if (I.profile === 'okehazama' && I.kind === 'minka') {
      for (const p of lv.layout.props) {
        if (p.part !== 'hearth') continue;
        const x0 = p.x - (p.w - .18) / 2, x1 = p.x + (p.w - .18) / 2;
        const z0 = p.z - (p.d - .18) / 2, z1 = p.z + (p.d - .18) / 2;
        const pieces = [];
        for (const v of floorPieces) {
          const a = Math.max(v[0], x0), b = Math.min(v[1], x1);
          const c = Math.max(v[2], z0), d = Math.min(v[3], z1);
          if (a >= b || c >= d) { pieces.push(v); continue; }
          for (const r of [[v[0], a, v[2], v[3]], [b, v[1], v[2], v[3]],
            [a, b, v[2], c], [a, b, d, v[3]]]) {
            if (r[1] > r[0] && r[3] > r[2]) pieces.push(r);
          }
        }
        floorPieces = pieces;
      }
    }
    const decor = furnishLayout(lv.layout, h, { partitions: true, dim: true });
    decor.position.set(I.x, y, I.z); decor.rotation.y = I.rot; grp.add(decor);
    if (lv.hallX != null) box(lv.hallX, y + h / 2, 0, 0.08, h, lv.d - 3.6, WALL);
    if (lv.drop) {
      const v = lv.drop, cx = (v.x0 + v.x1) / 2;
      // 穴の底には板を置かない。下の敵と地面が見える。
      box(v.x1 + .1, y + .7, 0, .08, .1, 1.1, DARK);
      for (const z of [-.55, .55]) box(v.x1 + .1, y + .35, z, .08, .7, .08, DARK);
    }
    // 床（階段の口は空ける）・天井（上の階段の口は空ける）
    // 稲葉山の広間は六センチの畳厚だけ下地を下げる。
    // 畳面を歩行床・障子の敷居に揃え、下地板が畳を覆うのも防ぐ。
    // 部屋と階段口で設営時だけ分け、板間・土間・上段の下地高は保つ。
    floorPieces = S.quality === 'high' && I.profile === 'inabayama'
      && lv.layout.rooms.some(r => r.floor === 'tatami' && !(r.y > 0))
      ? lv.pieces.flatMap(([px0, px1, pz0, pz1]) => lv.layout.rooms.map(r => [
        Math.max(px0, r.x0), Math.min(px1, r.x1), Math.max(pz0, r.z0), Math.min(pz1, r.z1),
        r.floor === 'tatami' && !(r.y > 0) ? -.06 : 0,
      ]).filter(v => v[1] > v[0] && v[3] > v[2]))
      : lv.pieces;
    for (const [x0, x1, z0, z1, offset = 0] of floorPieces) {
      if (I.profile === 'moribe') {
        // 森部は上の板割りを仕上げ床とし、模型の床板・目地を下へ重ねない。
        // 下地の上端を厚さ一・二センチの仕上げ板の下面へ合わせる。
        // 既存の箱へまとめ、素材の有無で床の継ぎ目や描画数を変えない。
        box((x0 + x1) / 2, y - .043, (z0 + z1) / 2,
          x1 - x0, .074, z1 - z0, FLOOR);
        continue;
      }
      const [fx, fz] = I.P((x0 + x1) / 2, (z0 + z1) / 2);
      if (!naibu || !addNaibu(naibu, 'floor_modular_a', fx, y + offset - .08, fz, x1 - x0, .08, z1 - z0, I.rot)) box((x0 + x1) / 2, y + offset - .04, (z0 + z1) / 2, x1 - x0, .08, z1 - z0, FLOOR);
    }
    const upSt = I.stairs[k];
    if (I.profile === 'okehazama') {
    if (!I.open) for (const [x0, x1, z0, z1] of rectMinus(hw, hd, upSt ? upSt.hole : smokeVent)) box((x0 + x1) / 2, y + h + 0.03, (z0 + z1) / 2, x1 - x0, 0.06, z1 - z0, goten ? 0x7a6448 : DARK);
    // 天井の作り：御殿は竿縁天井（一尺五寸ごとの細い竿縁と回縁）、櫓・天守は上の床を支える根太を見せる
    if (!I.open && okeBansho) {
      // 推定の詰所：座敷の竿縁と回縁、板敷きの控えの梁を間仕切りで納める。
      // 共通の箱を設営時にまとめ、畳の真上へ太い梁を突き出さない。
      // 天井板と同じ木目・材質へまとめ、炉の煤も従来どおり頂点色へ焼き込む。
      // 梁の切り欠きは短い部材でも奥行き方向、桁・煙抜きの受け木は横方向。
      okeRoomBeams(lv, (x, yy, z, w, bh, d, grain, hex = DARK) => smokeBox(hearth, x, yy, z, w, bh, d, hex,
        grain || (Math.abs(w - .17) < .001 ? 'beamZ' : 'beamX')),
      (x, yy, z) => smokeBox(hearth, x, yy, z, .028, .2, .028, 0x927352, 'post'));
      for (const r of lv.layout.rooms) {
        const tatami = r.floor === 'tatami';
        // 控えの梁は正面の柱割りとそろえる。板壁の途中で梁端が浮かないよう、
        // 外周の柱と同じ間数で割り、奥側は間仕切り上の桁へ納める推定復元。
        const step = tatami ? .45 : (lv.w + .24) / okeHutBays(lv.w);
        const origin = tatami ? r.x0 : -(lv.w + .24) / 2;
        const z0 = r.z0 + .1, z1 = r.z1 - .1, cz = (z0 + z1) / 2;
        // 竿縁に直交する天井板の継ぎ目。控えの梁の上も板組みとして見せる。
        // 薄い共通の箱を室内の形へ一度だけまとめ、毎コマの処理は増やさない。
        if (smokeVent && !tatami) {
          for (const [a, b, c, d] of rectMinus(hw, hd, smokeVent)) {
            const left = Math.max(a, r.x0 + .1), right = Math.min(b, r.x1 - .1);
            const back = Math.max(c, z0), front = Math.min(d, z1);
            if (right - left > .01 && front - back > .01)
              ceilingBoards(left, right, back, front, y + h - .003, origin, step, hearth, z0);
          }
          // 切り口の枠は okeRoomBeams で梁・受け木と一緒に作る。
        } else ceilingBoards(r.x0 + .1, r.x1 - .1, z0, z1, y + h - .003, origin, step, hearth);
        if (tatami) {
          // 側面の回縁は壁際から .1、半幅 .04。竿縁も半幅まで見込み、
          // 最後の一本が回縁に重なる時は省く。
          // 前後の端は下側の肩を回縁の内面で止め、上側のほぞを三センチ掛ける推定復元。
          // 長福寺の入口と同じ仕口とし、突き付けただけの木口で天井板を支えない。
          // 既存の箱と木肌を使い、室内の束へまとめる。天井高と回縁の位置は保つ。
          const left = r.x0 + .14, right = r.x1 - .14, half = .035 / 2;
          for (let q = r.x0 + step; q + half < right; q += step) {
            if (q - half < left) continue;
            // 民家は座敷側も同じ炉から煤を付ける。壁・回縁との境で急に木色を戻さない。
            // 炉のない詰所は従来の色を保ち、共有材質の頂点色だけで仕上げる。
            smokeBox(hearth, q, y + h - .033, cz, half * 2, .02, z1 - z0 - .08, DARK, 'beamZ');
            smokeBox(hearth, q, y + h - .013, cz, half * 2, .02, z1 - z0 - .02, DARK, 'beamZ');
          }
        }
        if (!tatami) {
          // 控えの梁端を受ける桁。細い回縁だけで太い梁を支えた形にせず、
          // 間仕切りと外壁の柱の上へ納める推定復元。座敷の竿縁は横切らない。
          // 低い詰所では従来の深い桁が鴨居の内法へ下がっていた。
          // 梁の下端へそろえ、襖の上端と戸口の高さを保つ。
          const beamBottom = h - .25;
          for (const zz of [z0, z1]) {
            // 桁の両端は側柱の柱頭で受ける。簡素な枕木と込栓による推定の納まり。
            // 壁際かつ鴨居より上に収め、入口や引き戸の二筋へ張り出さない。
            for (const xx of [r.x0 + .16, r.x1 - .16]) {
              // 枕木と桁の欠き込みは okeRoomBeams で当たりと一緒に作る。
              // 込栓は桁の上から枕木へ縦に通す推定復元。小口だけを浮かせず、
              // 桁の幅の内へ寄せ、枕木の下面手前まで差す。頭は桁上へ二ミリ出す。
              // 桁上面は天井高から .11m 下。共通の箱と煤の材質を使い回す。
              const pegTop = y + h - .108, pegBottom = y + beamBottom + .002;
              smokeBox(hearth, xx, (pegTop + pegBottom) / 2, zz + .065,
                .025, pegTop - pegBottom, .025, 0x927352, 'post');
            }
          }
        }
        // 前後の回縁を通し、側面の木口をその内面へ突き付ける推定の納まり。
        // 隅で下面が重なるとちらつくため、四本とも柱心まで伸ばさない。
        // 竿縁・回縁も天井板と共有する木肌へまとめ、下面と側面の木目を長手へ通す。
        // 天井板の下面は天井高より三ミリ下。回縁の上端もそこへ合わせ、
        // 七ミリの隙間を残さず板端を受ける。四辺とも同じ高さ・断面で納める。
        const trimY = y + h - .003 - .08 / 2;
        for (const zz of [z0, z1]) {
          const left = r.x0 + .06, right = r.x1 - .06;
          if (!tatami) {
            smokeBox(hearth, (left + right) / 2, trimY, zz, right - left, .08, .08, DARK, 'beamX');
            continue;
          }
          // 座敷の回縁にも竿縁の上ほぞを受ける欠きを入れる推定復元。
          // 下六センチは通し、上二センチの内側三センチだけを欠く。
          // ほぞと回縁の表面を重ねず、外側の木と下の肩受けは残す。
          // 同じ箱・木肌を室内の束へまとめ、天井高や毎コマの仕事は変えない。
          smokeBox(hearth, (left + right) / 2, y + h - .053, zz,
            right - left, .06, .08, DARK, 'beamX');
          let start = left;
          const half = .035 / 2;
          for (let q = r.x0 + step; q + half < r.x1 - .14; q += step) {
            if (q - half < r.x0 + .14) continue;
            const a = q - half, b = q + half;
            if (a > start) smokeBox(hearth, (start + a) / 2, y + h - .013, zz,
              a - start, .02, .08, DARK, 'beamX');
            smokeBox(hearth, q, y + h - .013, zz + (zz === z0 ? -.015 : .015),
              .035, .02, .05, DARK, 'beamX');
            start = b;
          }
          if (right > start) smokeBox(hearth, (start + right) / 2, y + h - .013, zz,
            right - start, .02, .08, DARK, 'beamX');
        }
        for (const xx of [r.x0 + .1, r.x1 - .1]) smokeBox(hearth, xx, trimY, cz, .08, .08, z1 - z0 - .08, DARK, 'beamZ');
      }
    }
    if (!I.open && I.profile === 'okehazama' && I.kind === 'hondo') {
      // 長福寺の天井は推定復元。内陣と外陣の格天井を別々に割り付け、
      // 入口の板間は竿縁にする。間仕切りの上を格間の途中で横切らせない。
      // 共通の箱から一度だけ作り、既存の室内の束へまとめる。
      // 格縁・押縁・回縁・桁も鏡板と同じ木肌を使う。木目は各部材の長手へ通し、
      // 木口へ節を引き延ばさない。既存の天井の束へ移すだけで形・描画回数は増やさない。
      const ceiling = (x, yy, z, w, bh, d, hex, miter = null) =>
        smokeBox(null, x, yy, z, w, bh, d, hex, w >= d ? 'beamX' : 'beamZ', 0, 1, null, null, miter);
      // 格縁のほぞと同じ三センチの穴を回縁へ掘る推定復元。
      // 上一センチ・下九センチと穴の奥の木を残し、表面を重ねない。
      // 設営時だけ分割し、短い切片も元の回縁の長手へ木目を通す。
      const mortisedRim = (x, z, w, d, holes) => {
        const grain = w >= d ? 'beamX' : 'beamZ';
        const part = (a, b, c, e, yy, height) => smokeBox(null,
          (a + b) / 2, yy, (c + e) / 2, b - a, height, e - c, DARK, grain);
        const bounds = [x - w / 2, x + w / 2, z - d / 2, z + d / 2];
        part(...bounds, y + h - .095, .09);
        part(...bounds, y + h - .005, .01);
        let pieces = [bounds];
        for (const hole of holes) {
          const next = [];
          for (const [a, b, c, e] of pieces) {
            const left = Math.max(a, hole[0]), right = Math.min(b, hole[1]);
            const back = Math.max(c, hole[2]), front = Math.min(e, hole[3]);
            if (right <= left || front <= back) { next.push([a, b, c, e]); continue; }
            for (const v of [[a, left, c, e], [right, b, c, e],
              [left, right, c, back], [left, right, front, e]])
              if (v[1] - v[0] > .001 && v[3] - v[2] > .001) next.push(v);
          }
          pieces = next;
        }
        for (const v of pieces) part(...v, y + h - .03, .04);
      };
      const sideMortises = [[], []];
      for (let q = 0; q < lv.layout.rooms.length; q++) {
        const r = lv.layout.rooms[q], x0 = r.x0 + .16, x1 = r.x1 - .16;
        const z0 = r.z0 + .1, z1 = r.z1 - .1, width = x1 - x0, depth = z1 - z0;
        const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
        if (width <= .1 || depth <= .1) continue;
        if (q === lv.layout.rooms.length - 1) {
          // 入口の竿縁は端を回縁へ掛ける推定の仕口。下側の肩は回縁の内面で止め、
          // 上側のほぞだけを差し込む。端面を突き付けた細い棒で天井板を受けない。
          // 板目は竿縁と直交させ、共通の箱を既存の天井の束へまとめる。
          for (let x = x0 + .45; x + .0175 < x1 - .01; x += .45) {
            ceiling(x, y + h - .035, cz, .035, .03, depth - .14, DARK);
            ceiling(x, y + h - .01, cz, .035, .02, depth - .04, DARK);
          }
          ceilingBoards(x0, x1, z0, z1, y + h - .003, x0, .45);
        } else {
          const nx = Math.max(1, Math.round(width / .75)), nz = Math.max(1, Math.round(depth / .75));
          const cw = width / nx, cd = depth / nz;
          // 格縁の交点は相欠きにする推定復元。横材の下半分と縦材の上半分を通し、
          // 残りの半分は相手の側面で止める。突付けだけで鏡板を支えず、木も重ねない。
          // 共通の箱を既存の束へまとめ、格間・天井高・通れる高さは保つ。
          // 四周は太い回縁が受け持つ。外端の格縁を重ねず、
          // 格縁の肩は回縁の内面で止め、上側の細いほぞだけを三センチ差し込む推定復元。
          // 木口を突き付けた棒にせず、下から見える肩と回縁の下面は重ねない。
          // ほぞも共有の箱・木肌で既存の束へまとめ、吊り天蓋の柱割りは保つ。
          for (let i = 1; i < nx; i++) {
            ceiling(x0 + i * cw, y + h - .03, cz, .075, .06, depth - .14, DARK);
            for (const z of [z0 + .055, z1 - .055])
              ceiling(x0 + i * cw, y + h - .03, z, .035, .04, .03, DARK);
            for (let j = 0; j < nz; j++) {
              const back = z0 + j * cd + (j ? .0375 : .07);
              const front = z0 + (j + 1) * cd - (j + 1 < nz ? .0375 : .07);
              ceiling(x0 + i * cw, y + h - .09, (back + front) / 2,
                .075, .06, front - back, DARK);
            }
          }
          for (let j = 1; j < nz; j++) {
            const z = z0 + j * cd;
            sideMortises[0].push([x0 - .02, x0 + .01, z - .0175, z + .0175]);
            sideMortises[1].push([x1 - .01, x1 + .02, z - .0175, z + .0175]);
            ceiling(cx, y + h - .09, z, width - .02, .06, .075, DARK);
            for (const x of [x0 - .005, x1 + .005])
              ceiling(x, y + h - .03, z, .03, .04, .035, DARK);
            for (let i = 0; i < nx; i++) {
              const left = x0 + i * cw + (i ? .0375 : .01);
              const right = x0 + (i + 1) * cw - (i + 1 < nx ? .0375 : .01);
              ceiling((left + right) / 2, y + h - .03, z,
                right - left, .06, .075, DARK);
            }
          }
          // 相欠きの格縁は、上下を重ねるだけでなく込栓で留める推定復元。
          // 栓の軸は木の中なので作らず、下面へ出る木口だけを二ミリ見せる。
          // 格縁の下端より低い既存の回縁内へ納め、共通の形・木肌でまとめる。
          for (let i = 1; i < nx; i++) for (let j = 1; j < nz; j++)
            smokeBox(null, x0 + i * cw, y + h - .121, z0 + j * cd,
              .022, .002, .022, 0x95704a, 'post');
          for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
            // 外端は格縁の半幅ではなく、実際に受ける回縁の内面まで張る。
            // 側面の回縁との隙間と、前後の回縁へ鏡板・押縁が食い込む納まりを直す。
            const leftEdge = x0 + i * cw + (i ? .0375 : .01);
            const rightEdge = x0 + (i + 1) * cw - (i + 1 < nx ? .0375 : .01);
            const backEdge = z0 + j * cd + (j ? .0375 : .07);
            const frontEdge = z0 + (j + 1) * cd - (j + 1 < nz ? .0375 : .07);
            const x = (leftEdge + rightEdge) / 2, z = (backEdge + frontEdge) / 2;
            // 鏡板を格縁へ突き付けただけにせず、四辺を細い押縁で受ける推定の納まり。
            // 板の下面へ重ね、格縁の内側で止める。入口の竿縁天井へは足さない。
            // 共通の箱と木の材質を既存の束へまとめ、毎コマの処理や描画回数は増やさない。
            const pw = rightEdge - leftEdge, pd = frontEdge - backEdge, trim = .022;
            // 鏡板は細い線を貼った一枚の面でなく、幅三十センチほどの板を継ぐ推定復元。
            // 板の両端を押縁へ掛け、長辺は相じゃくりで継ぐ推定の納まり。
            // 厚さ十二ミリを上下に分けて継ぎ目をずらし、黒い細片で目地を埋めない。
            // 内陣・外陣とも同じ割付と共通の箱を使い、既存の天井の束へまとめる。
            const boards = Math.max(1, Math.ceil(pw / .3)), bw = pw / boards, joint = .003, lap = .012;
            for (let b = 0; b < boards; b++) {
              const bx = x - pw / 2 + (b + .5) * bw;
              const left = b ? joint / 2 : 0, right = b + 1 < boards ? joint / 2 : 0;
              // 鏡板にも竿縁天井と同じ木目を通す。長手を板の繊維へ合わせ、
              // 押縁・格縁は従来の木色のまま、一棟分の天井板の束へまとめる。
              const color = (i + j + b) % 2 ? 0x786047 : 0x80684d;
              // 相じゃくりの上下も、切る前の一枚から木取りする推定復元。
              // 幅の違う切片へ木目を伸ばし直さず、段欠きの側面でも繊維をつなぐ。
              const boardGrid = { x: bx - bw / 2, z: backEdge, width: bw, span: pd };
              if (boards === 1) {
                smokeBox(null, bx, y + h - .006, z, bw, .012, pd, color, 'z', 0, 1, null, boardGrid);
                continue;
              }
              smokeBox(null, bx + (left - right) / 2, y + h - .009, z,
                bw - left - right, .006, pd, color, 'z', 0, 1, null, boardGrid);
              // 上半分の目地は下半分から十二ミリずらす。格間の外へは張り出さず、
              // 隣の上半分とも重ねない。下面・押縁・天井高は元の位置に保つ。
              const upperLeft = bx - bw / 2 + (b ? lap + joint / 2 : 0);
              const upperRight = bx + bw / 2 + (b + 1 < boards ? lap - joint / 2 : 0);
              smokeBox(null, (upperLeft + upperRight) / 2, y + h - .003, z,
                upperRight - upperLeft, .006, pd, color, 'z', 0, 1, null, boardGrid);
            }
            for (const side of [-1, 1]) {
              ceiling(x + side * (pw - trim) / 2, y + h - .021, z,
                trim, .018, pd, WOOD, { side });
              ceiling(x, y + h - .021, z + side * (pd - trim) / 2,
                pw, .018, trim, WOOD, { side });
            }
          }
        }
        // 各間の回縁を柱と小壁へ納める。間仕切りの両面にも天井の端を受ける木を残す。
        // 側面の回縁の内面（壁際から .17m）で木口を止める。
        // 間仕切り上の桁は境から前後へ .12m 張り出す。回縁をその中へ
        // 九センチ埋めず、桁の側面へ突き付ける。格間側の端は保つ推定の納まり。
        // 外周側は従来の太さを使い、鏡板・押縁・竿縁の受けを動かさない。
        for (const front of [false, true]) {
          const shared = front ? q + 1 < lv.layout.rooms.length : q > 0;
          const depth = shared ? .05 : .14;
          const z = (front ? z1 : z0) + (shared ? (front ? -.045 : .045) : 0);
          if (q === lv.layout.rooms.length - 1) {
            // 入口の竿縁の上ほぞを受ける穴を回縁の上端へ欠く推定復元。
            // 下の肩を受ける木は通し、ほぞと回縁の同じ面を重ねない。
            // 外周側は穴の奥の木も残す。既存の箱・木肌で設営時だけ作る。
            const left = x0 + .01, right = x1 - .01, half = .0175;
            const sign = front ? 1 : -1;
            const holeBack = front ? z1 - .07 : z0 + .02;
            const holeFront = front ? z1 - .02 : z0 + .07;
            const back = z - depth / 2, end = z + depth / 2;
            ceiling(cx, y + h - .08, z, right - left, .12, depth, DARK);
            let start = left;
            for (let x = x0 + .45; x + half < right; x += .45) {
              const a = x - half, b = x + half;
              if (a > start) ceiling((start + a) / 2, y + h - .01, z,
                a - start, .02, depth, DARK);
              // 間仕切り側の細い回縁は穴が上へ抜ける。外周側だけ奥の木を残す。
              const rest = front ? end - holeFront : holeBack - back;
              if (rest > .001) ceiling(x, y + h - .01,
                z + sign * (depth - rest) / 2, b - a, .02, rest, DARK);
              start = b;
            }
            if (right > start) ceiling((start + right) / 2, y + h - .01, z,
              right - start, .02, depth, DARK);
          } else {
            const nx = Math.max(1, Math.round(width / .75)), holes = [];
            const back = front ? z1 - .07 : z0 + .04;
            for (let i = 1; i < nx; i++) {
              const x = x0 + i * width / nx;
              holes.push([x - .0175, x + .0175, back, back + .03]);
            }
            mortisedRim(cx, z, width - .02, depth, holes);
          }
        }
      }
      // 間仕切り上の桁も側面の回縁へほぞで留める推定復元。
      // 桁の肩は従来の内面で止め、上側の細いほぞだけ三センチ掛ける。
      // 回縁は同じ高さを欠き、ほぞと木を重ねない。設営時だけ既存の束へまとめる。
      for (let j = 0; j + 1 < lv.layout.rooms.length; j++) {
        const z = lv.layout.rooms[j].z1;
        sideMortises[0].push([-hw + .14, -hw + .17, z - .04, z + .04]);
        sideMortises[1].push([hw - .17, hw - .14, z - .04, z + .04]);
      }
      // 四周の回縁は従来の柱頭へ納め、部屋ごとの天井の端とつなぐ。
      for (const side of [-1, 1]) {
        mortisedRim(side * (hw - .1), 0, .14, lv.d - .08, sideMortises[side < 0 ? 0 : 1]);
      }
      // 内陣境と入口の障子境で、部屋ごとの天井の端を桁で受ける推定復元。
      // 障子境にも桁を通し、格天井と竿縁天井の間の下地を露出させない。
      // 両側の回縁・戸脇の柱頭へ納め、共通の箱を既存の束へまとめる。
      // 側面の回縁の内面は壁際から .17m。桁の肩をそこで止め、
      // ほぞは上で欠いた穴へ納める。桁の高さ・柱頭の受けは保つ。
      for (let j = 0; j + 1 < lv.layout.rooms.length; j++) {
        const z = lv.layout.rooms[j].z1;
        ceiling(0, y + h - .08, z, lv.w - .34, .16, .24, DARK);
        for (const side of [-1, 1])
          smokeBox(null, side * (hw - .155), y + h - .03, z,
            .03, .04, .08, DARK, 'beamX');
      }
    } else if (!I.open) {
      const hole = upSt ? upSt.hole : null, step = ['hondo', 'chudo'].includes(I.kind) ? .75
        : I.profile === 'hieizan' && ['sobo', 'kuri'].includes(I.kind) || goten && !plainCeiling ? .45 : .5;
      const hieiHall = I.profile === 'hieizan' && ['hondo', 'chudo'].includes(I.kind);
      const hieiRooms = I.profile === 'hieizan' && ['sobo', 'kuri'].includes(I.kind);
      // 比叡山の格天井は回縁の内寸を等分する。固定間隔の余りを端で切ると、
      // 壁際だけ細い格間になり、回縁へ不揃いな板が納まっていた。
      // 格縁と板で同じ割付を使い、既存のまとめ描きへ納める。
      // 僧坊・庫裏の竿縁も回縁の内寸を等分し、両端だけ狭い間隔になるのを防ぐ。
      // 板の継ぎ目も下で同じ支点を使う。堂と生活の間で回縁の位置は異なる。
      const insetX = hieiHall ? .1 : hieiRooms ? .08 : 0;
      const gridX = hieiHall || hieiRooms ? (lv.w - insetX * 2) / Math.max(1, Math.round((lv.w - insetX * 2) / step)) : step;
      // 外周の横梁は壁から十センチ内側。梁幅の半分と回縁幅を空ける。
      // 間仕切りの梁は室境が芯なので、従来の十七センチで納まる。
      const ceilingFront = r => Math.max(r.z0, -hd + .1) + .09 + .08;
      const ceilingBack = r => Math.min(r.z1, hd - .1) - .09 - .08;
      // 板間も回縁の内寸で根太を等分し、壁際だけ半端な間隔にしない。
      // 天井板の継ぎ目と根太で同じ割付を使う。設営時だけ計算する。
      const boardBearingStart = -hw + .12;
      const boardBearingStep = (lv.w - .24) / Math.max(1, Math.ceil((lv.w - .24) / 1.2));
      // 内陣境の小壁を格間がまたがないよう、部屋ごとに等分する。細部の割付は推定。
      // 境の回縁は一材を共有し、格縁・天井板ともその側面で止める。
      const ceilingZones = hieiHall ? lv.layout.rooms.map(r => {
        const z0 = Math.max(-hd + .1, r.z0), z1 = Math.min(hd - .1, r.z1);
        return { z0, z1, grid: (z1 - z0) / Math.max(1, Math.round((z1 - z0) / step)) };
      }) : [{ z0: -hd, z1: hd, grid: step }];
      for (let q = -hw + insetX + gridX; q < hw - (hieiRooms ? .08 : .1) - (hieiHall || hieiRooms ? .001 : 0); q += gridX) {
        if (hole && q > hole.x0 - .05 && q < hole.x1 + .05) continue;
        if (hieiHall) {
          // 格縁の上部を欠き、格間の板を受ける段を残す。細かな断面は推定。
          // 板の下面と段の上面を揃え、板端を宙に浮かせない。
          // 共通の箱と木材のまとめ描きだけで組み、毎コマの処理は増やさない。
          for (const zone of ceilingZones) {
            box(q, y + h - .065, (zone.z0 + zone.z1) / 2,
              .1, .09, zone.z1 - zone.z0 - .16, DARK);
            box(q, y + h - .01, (zone.z0 + zone.z1) / 2,
              .075, .02, zone.z1 - zone.z0 - .12, DARK);
            // 縦の格縁も回縁へ枘差しし、下面の込栓で抜けを留める。
            // 横格縁と同じ推定の仕口。枘は回縁の芯より手前で止め、
            // 板受けの段・天井板へ出さず、共通の箱と木材の束へ納める。
            for (const [z, side] of [[zone.z0 + .08, -1], [zone.z1 - .08, 1]]) {
              box(q, y + h - .07, z + side * .015, .035, .025, .06, DARK);
              box(q, y + h - .088, z + side * .02, .012, .056, .012, 0x95704a);
    }
    }
    }
    }
    }
    } else {
    const moribeCeiling = I.profile === 'moribe' && ['yashiki', 'hondo'].includes(I.kind);
    if (!I.open && !moribeCeiling) for (const [x0, x1, z0, z1] of rectMinus(hw, hd, upSt ? upSt.hole : null)) box((x0 + x1) / 2, y + h + 0.03, (z0 + z1) / 2, x1 - x0, 0.06, z1 - z0, goten ? 0x7a6448 : DARK);
    if (I.profile === 'inabayama') {
    // 天井の作り：御殿は竿縁天井（一尺五寸ごとの細い竿縁と回縁）、櫓・天守は上の床を支える根太を見せる
    if (!I.open) {
      if (inabaBoards) {
        // 蔵・番所・長屋は化粧天井ではなく、梁の上に張った板の裏を見せる。
        // 板面と板継ぎを既存の束へ足し、梁と根太の形・材質を使い回す。
        for (const [x0, x1, z0, z1] of rectMinus(hw, hd, upSt ? upSt.hole : null)) {
          const count = Math.ceil((x1 - x0) / .3);
          for (let i = 1; i < count; i++)
            box(x0 + (x1 - x0) * i / count, y + h - .002, (z0 + z1) / 2,
              .008, .004, z1 - z0, DARK);
          // 木口は下の根太の上で継ぐ。梁間の根太と同じ割り付けを使う。
          // 隣の板を交互に継ぎ、階段の穴で分けた範囲の中だけに描く。
          const width = (x1 - x0) / count;
          const girderZ = hd - .16, joists = Math.max(2, Math.ceil((lv.d - .32) / .45));
          for (let i = 0; i < count; i++) {
            const support = Math.max(1, Math.min(joists - 1, Math.round(joists * (i % 2 ? .25 : .75))));
            const jointZ = -girderZ + girderZ * 2 * support / joists;
            const joined = jointZ > z0 + .18 && jointZ < z1 - .18;
            // 線だけの継ぎ目にせず、根太の芯で板面も二枚に分ける。
            // 木口を四ミリずつ控え、隣の板とは継ぐ位置と古色をずらす。
            // 下地で隙間を受け、同じ木部の束へ結合する。根太と床高は保つ。
            for (let piece = 0; piece < (joined ? 2 : 1); piece++) {
              const near = joined && piece === 1 ? jointZ + .004 : z0;
              const far = joined && piece === 0 ? jointZ - .004 : z1;
              const tone = (i + piece) % 3;
              ceilingBoard(x0 + (i + .5) * width, y + h + .001, (near + far) / 2,
                width - .008, .008, far - near,
                tone === 0 ? 0x6a5238 : tone === 1 ? 0x725a40 : 0x644c34);
            }
            if (joined) box(x0 + (i + .5) * width, y + h - .002, jointZ,
              width, .004, .008, DARK);
          }
        }
      }
      const inabaHall = S.quality === 'high' && I.profile === 'inabayama' && I.kind === 'hondo';
      const naijin = inabaHall ? lv.layout.rooms.find(r => r.name === '内陣') : null;
      const roomCeiling = S.quality === 'high' && I.profile === 'inabayama' && goten && !plainCeiling && !upSt;
      const hole = upSt ? upSt.hole : null, step = ['hondo', 'chudo'].includes(I.kind) ? .75 : goten && !plainCeiling ? .45 : .5;
      // 稲葉山の板倉・番所・長屋・小祠は、下で柱筋に合わせた梁と根太を組む。
      // 共通の半歩刻みの横木を重ねると、柱から外れた材が梁と二重に走る。
      // 板裏を支える専用の木組みを使い、ほかの戦の天井割りは保つ。
      for (let q = -hw + step; !roomCeiling && !inabaBoards && q < hw - .1; q += step) {
        if (hole && q > hole.x0 - .05 && q < hole.x1 + .05) continue;
        if (goten && !plainCeiling) box(q, y + h - .015, 0, .035, .035, lv.d - .2, 0x3a2a1c);
        else box(q, y + h - .04, 0, .07, .08, lv.d - .2, 0x2e2216);
      }
      // 堂（本堂・中堂）は格天井：竿縁に直交する格縁を足して、格間を組む
      if (!roomCeiling && ['hondo', 'chudo'].includes(I.kind)) for (let q = -hd + .75; q < hd - .1; q += .75) {
        // 稲葉山の堂は内陣を格天井、外陣を竿縁とする推定。境で格縁を止める。
        if (naijin && (q < naijin.z0 || q > naijin.z1)) continue;
        box(0, y + h - .02, q, lv.w - .2, .05, .05, 0x2a1c12);
      }
      if (goten && !roomCeiling) { for (const sd of [-1, 1]) { box(0, y + h - .05, sd * (hd - .16), lv.w - .2, .08, .08, DARK); box(sd * (hw - .16), y + h - .05, 0, .08, .08, lv.d - .2, DARK); } }
      if (roomCeiling) {
        // 一枚の平らな面で済ませず、各室で板継ぎを止め、間仕切りの上にも回縁を納める。
        // 既存の束へ設営時だけまとめる。梁を見せる蔵・番所・長屋には加えない。
        for (const r of lv.layout.rooms) {
          // 座敷と本堂の間仕切りは厚さ六センチ。回縁の壁側を小壁の面へ合わせる。
          // 外周と同じ十二センチ逃がすと、襖・障子の上だけ細い帯が残る。
          // 外周は各室の回縁だけで納め、建物全体の回縁を二重に重ねない。
          const partitioned = ['goten', 'tamari', 'hondo'].includes(I.kind);
          const x0 = r.x0 + .12, x1 = r.x1 - .12;
          const z0 = r.z0 + (partitioned && r.z0 > -hd + .001 ? .06 : .12);
          const z1 = r.z1 - (partitioned && r.z1 < hd - .001 ? .06 : .12);
          if (x1 <= x0 || z1 <= z0) continue;
          const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
          if (r === naijin) {
            // 内陣の四隅も柱頭から格天井を受ける推定の納まり。
            // 外周の中柱と内陣境の肘木だけでは、隅の回縁が宙に浮く。
            // 頭貫を四周へ回し、隅柱の上で直交する舟肘木を組む。
            // 格縁・鏡板より下、格子戸の鴨居より上に収める。
            // 舟肘木の共通形と木部の束へ設営時だけまとめる。
            // 頭貫も格縁と同じ板目を材の長手へ通し、下面と側面を木材で揃える。
            for (const z of [z0, z1])
              exposedTimber(cx, y + h - .16, z, x1 - x0, .08, .12, DARK, true);
            for (const x of [x0, x1])
              exposedTimber(x, y + h - .16, cz, .12, .08, z1 - z0 - .12, DARK);
            // 天蓋の吊り元は鏡板から離し、左右の頭貫へ渡した二本の受け材へ留める推定。
            // 格縁の下面と一センチ離し、共有の木部の束へ設営時だけ結合する。
            const altar = lv.layout.props.find(p => p.part === 'altar');
            if (altar) for (const offset of [-.3, .14]) {
              const z = altar.z + Math.cos(altar.rot || 0) * offset * altar.d;
              exposedTimber(cx, y + h - INABA_ALTAR_SUSPENSION_DROP + .03, z,
                x1 - x0 + .12, .06, .08, DARK, true);
              // 吊り棒を梁下面の座金だけへ突き付けず、梁を抱く鉄帯と横栓で留める推定。
              // 須弥壇側の吊り棒と同じ縮尺・回転で四か所へ納める。
              // 共通の箱を既存の束へ結合し、鏡板・格縁・通路には出さない。
              const bottom = y + h - INABA_ALTAR_SUSPENSION_DROP;
              const metal = (x, yy, zz, w, hh, d) =>
                put(INABA_GIRDER_PART.clone().scale(w, hh, d), x, yy, zz, 0x4b4030);
              const rot = altar.rot || 0, c = Math.cos(rot), s = Math.sin(rot);
              for (const side of [-1, 1]) {
                const localX = side * .55 * altar.w / 2.1;
                const px = altar.x + localX * c + offset * altar.d * s;
                const pz = altar.z - localX * s + offset * altar.d * c;
                for (const face of [-1, 1])
                  metal(px, bottom + .0185, pz + face * .046, .04, .107, .012);
                metal(px, bottom + .066, pz, .04, .012, .104);
                metal(px, bottom - .018, pz, .012, .012, .116);
              }
            }
            for (const x of [x0, x1]) for (const z of [z0, z1]) {
              // 戸口側も隅柱の内側に納め、戸の溝へ材を出さない。
              const px = x + (x === x0 ? .09 : -.09);
              const pz = z + (z === z0 ? .09 : -.09);
              // 舟肘木だけを天井へ貼らず、内陣の上げ床から隅柱で受ける。
              // 外周の柱とは芯が違うため、四隅の頭貫の下へ独立して納める推定。
              // 壁際に収め、中央の格子戸と左右の引き込み先は空ける。
              hijiki(px, y + h - .105, pz, .3, .03, .1);
              hijiki(px, y + h - .075, pz, .3, .03, .1, true);
            }
            for (const post of lv.naijinPosts || []) {
              // 居館の角柱と分けた推定復元。柱頭の大斗で直交する肘木を受ける。
              // 大斗の厚みだけ柱を短くし、格天井や既存の肘木へ重ねない。
              const shaftTop = post.top - .04, shaftBottom = post.bottom + post.baseH;
              // 礎盤の下座と上座も丸柱の共通形で作り、設営時の木部の束へまとめる。
              // 上座を一回り絞り、柱の木口を板床へ直接突き込まない納まりにする。
              hallBase(post.x, y + post.bottom + post.baseH / 4, post.z,
                post.baseR, post.baseH / 2, DARK);
              hallBase(post.x, y + post.bottom + post.baseH * .75, post.z,
                .075, post.baseH / 2, WOOD);
              hallShaft(post.x, y + (shaftBottom + shaftTop) / 2, post.z, shaftTop - shaftBottom);
              exposedTimber(post.x, y + post.top - .02, post.z, .18, .04, .18, DARK, true);
            }
            // 内陣の側柱を貫でつなぐ推定復元。頭の肘木だけで独立させず、
            // 柱を通す横材と楔で固める。左右の壁際だけに納め、格子戸の
            // 開口・引き先と須弥壇前の通路へ横材を渡さない。
            const posts = lv.naijinPosts || [];
            for (const back of posts) {
              const front = posts.find(p => p.x === back.x && p.z > back.z);
              if (!front) continue;
              // 柱脚も側面の地覆で結ぶ推定の納まり。柱の礎盤の内側で止め、
              // 板床へ材を埋めず、中央の格子戸・須弥壇前へは横木を渡さない。
              // 既存の貫と同じ木部の束へまとめ、床高や通れる口は変えない。
              const footBottom = Math.max(back.bottom, front.bottom);
              const footStart = back.z + back.baseR, footEnd = front.z - front.baseR;
              if (footEnd > footStart) {
                exposedTimber(back.x, y + footBottom + .05, (footStart + footEnd) / 2,
                  .09, .1, footEnd - footStart, DARK);
                // 地覆の上端を柱脚へ差すほぞ。礎盤とは重ねず、木口を残す。
                for (const post of [back, front]) {
                  const direction = post === back ? 1 : -1;
                  exposedTimber(post.x, y + footBottom + .085,
                    post.z + direction * (post.baseR + .055) / 2,
                    .045, .03, post.baseR - .055 + .002, WOOD);
                }
              }
              const railY = y + Math.max(back.bottom, front.bottom) + .95;
              exposedTimber(back.x, railY, (back.z + front.z) / 2,
                .07, .11, front.z - back.z + .2, WOOD);
              for (const post of [back, front]) {
                // 加工と木目の割り付けは共通形で済ませ、貫の上へ同寸で差す。
                put(INABA_HALL_WEDGE.clone(), post.x, railY + .055, post.z, DARK);
                ceilingWood.push(list[list.length - 1]);
              }
            }
            // 内陣は格縁の一升ごとに鏡板を納める推定復元。
            // 長い天井板の継ぎ目を格間へ横切らせず、端にも細い升を残さない。
            const nx = Math.max(1, Math.round((x1 - x0) / .75));
            const nz = Math.max(1, Math.round((z1 - z0) / .75));
            const cw = (x1 - x0) / nx, cd = (z1 - z0) / nz;
            // 格縁は側面へ突き付けるだけでなく、上下半分を相欠きで組む推定。
            // 縦材は下半分、横材は上半分を通し、交点の残りの半分は欠き取る。
            // 下面・上面を揃え、一ミリの木口の目地を残す。鏡板の受け幅は保つ。
            // 設営時だけ既存の木部の束へまとめ、材質と毎コマの処理は増やさない。
            // 相欠きの半材にも長手の木目を通す。縦横で向きを替え、鏡板と共通の絵を使う。
            // 回縁の内面で下半分に肩を作り、上半分だけをほぞとして差す推定。
            // 全厚の格縁を回縁の芯まで貫通させず、一ミリの目地で木口を分ける。
            const shoulder = .031;
            for (let i = 1; i < nx; i++) {
              const x = x0 + i * cw;
              exposedTimber(x, y + h - .0375, cz, .05, .025, z1 - z0 - shoulder * 2, DARK);
              for (let j = 0; j < nz; j++) {
                const a = z0 + j * cd + (j > 0 ? .026 : 0);
                const b = z0 + (j + 1) * cd - (j + 1 < nz ? .026 : 0);
                exposedTimber(x, y + h - .0125, (a + b) / 2, .05, .025, b - a, DARK);
              }
            }
            for (let j = 1; j < nz; j++)
              exposedTimber(cx, y + h - .0125, z0 + j * cd, x1 - x0, .025, .05, DARK, true);
            for (let j = 1; j < nz; j++) for (let i = 0; i < nx; i++) {
              const a = x0 + i * cw + (i > 0 ? .026 : shoulder);
              const b = x0 + (i + 1) * cw - (i + 1 < nx ? .026 : shoulder);
              exposedTimber((a + b) / 2, y + h - .0375, z0 + j * cd, b - a, .025, .05, DARK, true);
            }
            for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
              // 鏡板を升ごとの単色の面で済ませず、幅三十センチほどの板で納める推定。
              // 板端は格縁の上へ掛け、継ぎ目は各升の内側だけに留める。
              // 格縁・回縁・天蓋の寸法は保ち、既存の木部の束へ設営時だけ結合する。
              const panelW = cw - .035, panelD = cd - .035;
              const boards = Math.max(1, Math.ceil(panelW / .3)), width = panelW / boards;
              for (let b = 0; b < boards; b++) {
                const left = x0 + i * cw + .0175 + b * width;
                const joint = b + 1 < boards ? .003 : 0;
                ceilingBoard(left + (width - joint) / 2, y + h - .006, z0 + (j + .5) * cd,
                  width - joint, .012, panelD,
                  (i + j + b) % 3 === 0 ? 0x756046 : (i + j + b) % 3 === 1 ? 0x80694d : 0x7a6448);
              }
            }
          } else {
            // 床の間のある座敷は竿縁を床の間と平行に通す推定の納まり。
            // 全室を同じ向きにすると、奥座敷だけ竿縁が床の間へ突き当たる。
            // 間取りの実際の床の間から判定し、天井板と木口の継ぎも一緒に回す。
            const across = lv.layout.props.some(p => p.part === 'alcove'
              && p.x >= r.x0 && p.x <= r.x1 && p.z >= r.z0 && p.z <= r.z1);
            const u0 = across ? z0 : x0, u1 = across ? z1 : x1;
            const v0 = across ? x0 : z0, v1 = across ? x1 : z1;
            const uc = (u0 + u1) / 2, vc = (v0 + v1) / 2;
            // 設営時だけ軸を替え、従来の木部の束・材質へまとめる。
            const ceilingBox = (u, yy, v, ww, hh, dd, color) => {
              if (across) box(v, yy, u, dd, hh, ww, color);
              else box(u, yy, v, ww, hh, dd, color);
            };
            // 竿縁の下面・側面にも長手の木目を通す。床の間で向きを替える室は
            // 木目も一緒に回し、継手の半材まで同じ木部の束へ納める。
            const ceilingRail = (u, yy, v, ww, hh, dd, color) => {
              if (across) exposedTimber(v, yy, u, dd, hh, ww, color, true);
              else exposedTimber(u, yy, v, ww, hh, dd, color);
            };
            // 竿縁は四十五センチほどを目安に、回縁間で均等に割る。
            const saoBays = Math.max(1, Math.round((u1 - u0) / .45));
            const spacing = (u1 - u0) / saoBays;
            for (let i = 1; i < saoBays; i++) {
              // 長い竿縁を一本材にせず、相欠きで継ぐ推定の納まり。
              // 隣の竿とは継ぐ位置をずらし、上下半分の材を重ねて受ける。
              // 天井板との上下関係・回縁までの長さは保ち、既存の木部の束へ納める。
              const u = u0 + i * spacing, railY = y + h - .015;
              const pieces = Math.max(1, Math.ceil((v1 - v0) / 2.4));
              const length = (v1 - v0) / pieces, lap = .06;
              // 竿縁の端も回縁の内面で肩を止め、上半分の細いほぞで受ける。
              // 床の間に合わせて向きを替える室も同じ仕口・木目を使う。
              const shoulder = .031;
              for (const side of [-1, 1]) {
                const end = side < 0 ? v0 : v1;
                ceilingRail(u, railY + .00875, end - side * shoulder / 2,
                  .0175, .0175, shoulder, DARK);
              }
              let start = v0 + shoulder;
              for (let j = 1; j < pieces; j++) {
                const joint = v0 + (j + (i % 2 ? .12 : -.12)) * length;
                const end = joint - lap;
                ceilingRail(u, railY, (start + end) / 2, .035, .035, end - start, DARK);
                // 半材の木口に一ミリの目地を残し、下面にも継手を見せる。
                ceilingRail(u, railY - .00875, joint - .0005,
                  .035, .0175, lap * 2 - .001, DARK);
                ceilingRail(u, railY + .00875, joint + .0005,
                  .035, .0175, lap * 2 - .001, DARK);
                start = joint + lap;
              }
              const end = v1 - shoulder;
              ceilingRail(u, railY, (start + end) / 2, .035, .035, end - start, DARK);
            }
            // 天井板の木口は竿縁の上で受け、隣の板と継ぎ目をずらす。
            const boardCount = Math.max(1, Math.round((v1 - v0) / .3));
            const boardDepth = (v1 - v0) / boardCount;
            for (let j = 0; j < boardCount; j++) {
              const a = v0 + j * boardDepth, b = v0 + (j + 1) * boardDepth;
              if (j > 0) ceilingBox(uc, y + h - .002, a, u1 - u0, .004, .008, 0x58432e);
              // 木口は黒線を貼るだけにせず、竿縁の芯で板を分けて受ける。
              // 隣の列とは継ぐ位置をずらし、端の板も回縁まで納める。
              // 設営時に既存の束へまとめ、材質や毎コマの処理は増やさない。
              let start = u0, piece = 0;
              const firstJoint = j % 2 ? 2 : 4;
              for (let i = firstJoint; ; i += 4) {
                const end = i < saoBays ? u0 + i * spacing : u1;
                const gap = i < saoBays ? .004 : 0;
                const center = (start + end - gap) / 2, v = (a + b) / 2;
                const length = end - start - gap, width = b - a - .008;
                ceilingBoard(across ? v : center, y + h + .001, across ? center : v,
                  across ? width : length, .008, across ? length : width,
                  (j + piece) % 3 === 0 ? 0x7a6448 : (j + piece) % 3 === 1 ? 0x756046 : 0x80694d, !across);
                if (i >= saoBays) break;
                ceilingBox(end, y + h - .002, (a + b) / 2, .008, .004, b - a - .008, 0x58432e);
                start = end + gap; piece++;
              }
            }
          }
          // 座敷の長い回縁は六尺ほどで相欠きに継ぐ推定の納まり。
          // 上下の半材で受け合い、木口だけ一ミリ控える。格天井の回縁は保つ。
          // 外寸と隅の突き付けを変えず、既存の木部の束へ設営時だけまとめる。
          const ceilingTrim = (length, x, z, across) => {
            const pieces = ['goten', 'tamari'].includes(I.kind) ? Math.max(1, Math.ceil(length / 1.8)) : 1;
            if (pieces === 1) {
              exposedTimber(x, y + h - .045, z, across ? length : .06, .07,
                across ? .06 : length, DARK, across);
              return;
            }
            const span = length / pieces, lap = .06;
            for (let i = 0; i < pieces; i++) for (let half = 0; half < 2; half++) {
              const start = -length / 2 + i * span
                + (i > 0 ? (half ? -lap : lap) + .0005 : 0);
              const end = -length / 2 + (i + 1) * span
                + (i + 1 < pieces ? (half ? -lap : lap) - .0005 : 0);
              const offset = (start + end) / 2;
              exposedTimber(x + (across ? offset : 0), y + h - .0625 + half * .035,
                z + (across ? 0 : offset), across ? end - start : .06, .035,
                across ? .06 : end - start, DARK, across);
            }
          };
          for (const z of [z0, z1]) ceilingTrim(x1 - x0, cx, z, true);
          // 回縁の隅も前後の材の内側へ突き付け、下面を二重にしない。
          for (const x of [x0, x1]) ceilingTrim(z1 - z0 - .06, x, cz, false);
        }
      }
    }
    for (const st of lv.firingSteps) box(st.x, st.y - .05, st.z, st.w, .1, st.d, DARK);
    // 稲葉山の高画質は共通の室内部品で床板・目地・框を一度だけ納める。
    // 同じ高さに別の板面を重ねると、外陣や縁側でちらつき、上がり框も隠れる。
    // 共通部品も階段口を除いた範囲を使うため、ここでは下地だけを残す。
    if (I.profile !== 'okehazama' && !(S.quality === 'high' && I.profile === 'inabayama')) {
      // 床板の目地（長い方向へ数本）
      for (const [x0, x1, z0, z1] of lv.pieces) for (let q = -hw + .9; q < x1 - .02; q += .9) if (q > x0 + .02) box(q, y + .002, (z0 + z1) / 2, .02, .006, z1 - z0, 0x4a3828);
    }
    } else {
    // 森部の天井は各室・各格間で板を納める推定復元。一枚の平板へ黒線だけを描かない。
    // 奥座敷は竿縁と直交する板目、堂の内陣は格間ごとの短い板とし、既存の描画へまとめる。
    const ceilingShape = moribeCeiling && !I.open ? new THREE.BoxGeometry(1, 1, 1) : null;
    const ceilingColors = [0x7a6448, 0x80694c, 0x756044];
    // 森部の張り天井は厚さ一・五センチの板で推定復元する。
    // 六センチの厚板にせず、下面は竿縁・格縁の上端へ据えたまま裏板を密着させる。
    const ceilingBoardH = .015, ceilingBackingH = .012;
    // 板の継ぎ目と、それを受ける竿縁・根太は同じ一尺五寸の割り付けを使う。
    // 取次だけ五十センチ割りにすると、二棟とも板の木口が竿縁の間へ落ちる。
    const ceilingRailPitch = .45;
    const ceilingBoards = (x0, x1, z0, z1, alongX, seed) => {
      const span = alongX ? z1 - z0 : x1 - x0, count = Math.max(1, Math.round(span / .3));
      const width = span / count;
      // 長い天井板は約二メートルごとに継ぐ。木口は下の竿縁の上へ納める。
      // 奥座敷は板と竿縁の向きが逆なので、奥行き方向の受け木へ継ぎ目を合わせる。
      const ends = [];
      const railStart = alongX ? -hw + .16 : z0 + .07;
      const railSpan = alongX ? lv.w - .32 : z1 - z0 - .14;
      const railCount = Math.max(1, Math.round(railSpan / ceilingRailPitch));
      const railStep = railSpan / railCount;
      // 板継ぎの三ミリの目地を屋根裏まで貫通させない。裏に薄板を納める推定復元。
      // 部屋・格間ごとに一枚を共用の箱から作り、下の板目と竿縁・格縁は残す。
      // 既存の室内の形へまとめるので、描画回数や毎コマの仕事は増やさない。
      const backing = ceilingShape.clone();
      backing.scale(x1 - x0, ceilingBackingH, z1 - z0);
      put(backing, (x0 + x1) / 2, y + h + ceilingBoardH + ceilingBackingH / 2, (z0 + z1) / 2, DARK);
      for (let i = 0; i < count; i++) {
        const t = (alongX ? z0 : x0) + (i + .5) * width;
        // 木口を全列で一直線にせず、隣の板とは受け木一本分ずらす推定復元。
        // 継ぎ目は必ず竿縁・根太の上。配列はこの部屋の板で使い回す。
        ends.length = 0; ends.push(alongX ? x0 : z0);
        // 等分点を受け木へ丸めると、ずらした側の板だけ二・五メートルほどに伸びる。
        // 直前の木口から二メートル以内の受け木を選び、端の板も同じ長さに収める。
        const finish = alongX ? x1 : z1;
        while (finish - ends[ends.length - 1] > 2) {
          const start = ends[ends.length - 1];
          let rail = Math.min(railCount - 1, Math.floor((start + 2 - railStart) / railStep));
          // 最初の継ぎ目だけ受け木一本分ずらし、隣の板と木口をそろえない。
          if (ends.length === 1 && (i + seed) % 2 && rail > 1) rail--;
          const joint = railStart + rail * railStep;
          if (rail < 1 || joint <= start + .1 || joint >= finish - .1) break;
          ends.push(joint);
        }
        ends.push(alongX ? x1 : z1);
        for (let j = 0; j < ends.length - 1; j++) {
          const start = ends[j], end = ends[j + 1];
          // 長手の継ぎ目は相じゃくりで推定復元。上半分の木口を十五ミリずらし、
          // 下から見える目地を残しながら、板厚を貫く突き付けの隙間をなくす。
          // 長辺も相じゃくりにし、三ミリの目地の奥に別の裏板が見える作りを避ける。
          // 隣の板の上半分を十五ミリずらして受け、部屋・格間の外周は延ばさない。
          // 同じ箱と材質別の束を使い、描画回数と毎コマの処理は増やさない。
          const joined = ends.length > 2, layers = 2;
          for (let layer = 0; layer < layers; layer++) {
            const lo = start + (layer === 1 && j > 0 ? .015 : 0);
            const hi = end + (layer === 1 && j < ends.length - 2 ? .015 : 0);
            const acrossLo = t - width / 2 + (layer === 1 && i > 0 ? .015 : 0);
            const acrossHi = t + width / 2 + (layer === 1 && i < count - 1 ? .015 : 0);
            const boardWidth = acrossHi - acrossLo - .003;
            const acrossCenter = (acrossLo + acrossHi) / 2;
            const boardLength = hi - lo - (joined ? .003 : 0);
            const thickness = ceilingBoardH / layers;
            const board = ceilingShape.clone();
            board.scale(alongX ? boardLength : boardWidth, thickness, alongX ? boardWidth : boardLength);
            // 下面と側面は長手へ木目を通し、木口は厚みと幅で写す。
            // 全面を下面と同じ座標にすると、側面や継ぎ目の木口で木目が一本の線につぶれる。
            // 格間も座敷も同じ絵・材質を使い、設営時だけ面の向きを合わせる。
            const pos = board.attributes.position, normal = board.attributes.normal, uv = board.attributes.uv;
            // 相じゃくりの上下は同じ一枚の板。中心と厚さが違っても、
            // 建物内の同じ位置から木目を取り、段のところで繊維をずらさない。
            const lengthCenter = (lo + hi) / 2;
            const layerY = thickness * (layer + .5);
            // 継ぎ目の配列 ends を隠さず、上半分の板も継ぎ位置を参照できるようにする。
            const woodEnds = new Float32Array(pos.count);
            for (let v = 0; v < pos.count; v++) {
              const across = (alongX ? pos.getZ(v) : pos.getX(v)) + acrossCenter;
              const length = (alongX ? pos.getX(v) : pos.getZ(v)) + lengthCenter;
              const height = pos.getY(v) + layerY;
              const end = Math.abs(alongX ? normal.getX(v) : normal.getZ(v)) > .5;
              woodEnds[v] = end ? 1 : 0;
              const underside = Math.abs(normal.getY(v)) > .5;
              const phase = i * .37 + seed * .19 + j * .23;
              uv.setXY(v, (end || underside ? across : height) / .3 + phase,
                end ? height / .3 : length / 1.2);
            }
            board.setAttribute('woodEnd', new THREE.BufferAttribute(woodEnds, 1));
            put(board, alongX ? (lo + hi) / 2 : acrossCenter, y + h + thickness * (layer + .5), alongX ? acrossCenter : (lo + hi) / 2,
              ceilingColors[(i + seed) % ceilingColors.length]);
            list[list.length - 1].userData.ceilingWood = true;
          }
        }
      }
    };
    if (!I.open && moribeCeiling) for (let r = 0; r < lv.layout.rooms.length; r++) {
      const room = lv.layout.rooms[r];
      if (I.kind === 'hondo' && r === 0) {
        const width = lv.w - .32, depth = room.z1 - room.z0 - .14;
        const cols = Math.max(1, Math.round(width / .75)), rows = Math.max(1, Math.round(depth / .75));
        for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
          // 周囲の板は回縁の上へ延ばし、壁際に天井の抜けを残さない。
          ceilingBoards(i === 0 ? -hw : -hw + .16 + width * i / cols,
            i === cols - 1 ? hw : -hw + .16 + width * (i + 1) / cols,
            j === 0 ? room.z0 : room.z0 + .07 + depth * j / rows,
            j === rows - 1 ? room.z1 : room.z0 + .07 + depth * (j + 1) / rows, true, i + j);
        }
      } else ceilingBoards(room.x0, room.x1, room.z0, room.z1, I.kind !== 'yashiki' || r !== 0, r);
    }
    if (ceilingShape) ceilingShape.dispose();
    // 天井の作り：御殿は竿縁天井（一尺五寸ごとの細い竿縁と回縁）、櫓・天守は上の床を支える根太を見せる
    if (!I.open) {
      const moribeHouse = I.profile === 'moribe' && I.kind === 'yashiki';
      const moribeHall = I.profile === 'moribe' && I.kind === 'hondo';
      // 回縁の下側を梁・頭貫の上端（天井下四センチ）で欠く推定復元。
      // 前後の回縁だけでなく、頭貫に掛かる左右の木口も同じ納まりにする。
      // 側面の頭貫にも同じ欠きを取り、左右の回縁を木の中へ埋めない。
      // 設営時に幅と奥行きを分割し、既存の木目・材質の束へまとめる。
      const ceilingBearings = moribeHouse || moribeHall
        ? [[-hd + .09, -hd + .23], [hd - .23, hd - .09],
          ...lv.layout.portals.map(p => [p.z - .09, p.z + .09])] : [];
      const sideCeilingBearings = moribeHouse || moribeHall
        ? [[-hw + .09, -hw + .23], [hw - .23, hw - .09]] : [];
      // 竿縁の端は回縁へ二十五ミリ差す。回縁側も同じ位置を欠き、
      // 木口の突き付けや、木同士を貫通させただけの仕口にしない（推定復元）。
      // 設営時だけ割り付けを持ち、既存の材質別の形へまとめる。
      const ceilingMortises = [];
      const ceilingTenon = (x, z, width, depth, grainAxis) => {
        ceilingMortises.push({ x0: x - width / 2, x1: x + width / 2,
          z0: z - depth / 2, z1: z + depth / 2 });
        // 短いほぞでも元の竿縁・格縁の長手へ繊維を通す。
        // 寸法から向きを選ぶと、木口だけ九十度変わって継ぎ木に見える。
        box(x, y + h - .0125, z, width, .025, depth, DARK, false, grainAxis);
      };
      const ceilingRail = (x, z, length, alongX) => {
        box(x, y + h - .025, z, alongX ? length : .035, .05, alongX ? .035 : length, DARK);
        for (const side of [-1, 1]) {
          const endX = x + (alongX ? side * (length / 2 + .0125) : 0);
          const endZ = z + (alongX ? 0 : side * (length / 2 + .0125));
          const width = alongX ? .025 : .035, depth = alongX ? .035 : .025;
          ceilingTenon(endX, endZ, width, depth, alongX ? 0 : 2);
        }
      };
      const ceilingBorder = (x, z, width, depth, height) => {
        const back = z - depth / 2, front = z + depth / 2;
        const left = x - width / 2, right = x + width / 2;
        const widthCuts = [left, right];
        // 隅の通し柱は天井まで届く。回縁の木口を柱の内面で止め、
        // 頭貫の上で薄くした部分も柱頭へ食い込ませない。
        // 四隅の十四センチ角は下の柱と同寸。分割は設営時だけ行う。
        for (const edge of [-hw + .23, hw - .23]) {
          if (edge > left && edge < right) widthCuts.push(edge);
        }
        for (const [a, b] of sideCeilingBearings) {
          if (a > left && a < right) widthCuts.push(a);
          if (b > left && b < right) widthCuts.push(b);
        }
        for (const m of ceilingMortises) {
          if (m.z1 <= back || m.z0 >= front || m.x1 <= left || m.x0 >= right) continue;
          for (const edge of [m.x0, m.x1]) if (edge > left && edge < right) widthCuts.push(edge);
        }
        widthCuts.sort((a, b) => a - b);
        const cuts = [back, front];
        for (const edge of [-hd + .23, hd - .23]) {
          if (edge > back && edge < front) cuts.push(edge);
        }
        for (const [a, b] of ceilingBearings) {
          if (a > back && a < front) cuts.push(a);
          if (b > back && b < front) cuts.push(b);
        }
        for (const m of ceilingMortises) {
          if (m.z1 <= back || m.z0 >= front || m.x1 <= left || m.x0 >= right) continue;
          for (const edge of [m.z0, m.z1]) if (edge > back && edge < front) cuts.push(edge);
        }
        cuts.sort((a, b) => a - b);
        for (let i = 1; i < cuts.length; i++) {
          const a = cuts[i - 1], b = cuts[i];
          if (b - a < .0001) continue;
          const mid = (a + b) / 2;
          const bearing = ceilingBearings.some(([lo, hi]) => mid > lo && mid < hi);
          for (let j = 1; j < widthCuts.length; j++) {
            const lo = widthCuts[j - 1], hi = widthCuts[j];
            if (hi - lo < .0001) continue;
            const center = (lo + hi) / 2;
            if (Math.abs(center) > hw - .23 && Math.abs(mid) > hd - .23) continue;
            const sideBearing = sideCeilingBearings.some(([l, r]) => center > l && center < r);
            const rise = bearing || sideBearing ? Math.min(height, .04) : height;
            const mortise = ceilingMortises.some(m => center > m.x0 && center < m.x1 && mid > m.z0 && mid < m.z1);
            const top = mortise ? -.025 : 0;
            if (rise + top > 0) box(center, y + h + (top - rise) / 2, mid,
              hi - lo, rise + top, b - a, DARK, false, width >= depth ? 0 : 2);
            // 梁に掛かる回縁は成が浅い。その実際の下面へ栓の木口をそろえる。
            // 下から打つ栓は縦の繊維。薄く見せた木口の寸法で向きを選ばない。
            if (mortise) box(center, y + h - rise - .0005, mid, .012, .003, .012, WOOD, false, 1);
          }
        }
      };
      const hole = upSt ? upSt.hole : null, step = moribeHouse ? ceilingRailPitch : ['hondo', 'chudo'].includes(I.kind) ? .75 : goten && !plainCeiling ? .45 : .5;
      // 森部は左右の回縁の間を等分し、端だけ細い格間になる作りを避ける。
      const framed = moribeHouse || moribeHall;
      const bays = Math.max(1, Math.round((lv.w - .32) / step));
      const spacing = framed ? (lv.w - .32) / bays : step;
      for (let q = framed ? -hw + .16 + spacing : -hw + step; q < hw - (framed ? .2 : .1); q += spacing) {
        if (hole && q > hole.x0 - .05 && q < hole.x1 + .05) continue;
        if (moribeHall) {
          // 格天井の格縁は内陣だけ。外陣の竿縁は下で別の間隔に割り付ける。
          const r = lv.layout.rooms[0];
          // 内陣の格縁は竿縁より成を取り、天井板を格の上で受ける。
          // 上端を板の下面へそろえ、内陣だけ十二センチの深さを見せる推定復元。
          // 格縁の交点は相欠きで組む推定復元。縦材の下半分を欠き、
          // 横材の下半分を差す。木口を突き付けただけの格子にしない。
          const depth = r.z1 - r.z0 - .14, rows = Math.max(1, Math.round(depth / .75));
          box(q, y + h - .03, (r.z0 + r.z1) / 2, .06, .06, r.z1 - r.z0 - .22, DARK);
          // 格縁の端も上側のほぞを回縁へ差す推定復元。受け側も同寸で欠き、
          // 木口の突き付けだけにせず、頭貫より上の二十五ミリで納める。
          for (const z of [r.z0 + .0975, r.z1 - .0975]) ceilingTenon(q, z, .06, .025, 2);
          let start = r.z0 + .11;
          for (let i = 1; i <= rows; i++) {
            const joint = r.z0 + .07 + depth * i / rows;
            const end = i === rows ? r.z1 - .11 : joint - .03;
            if (end > start) box(q, y + h - .09, (start + end) / 2, .06, .06, end - start, DARK);
            start = joint + .03;
          }
        } else if (moribeHouse) {
          // 取次は奥行き方向。奥座敷は下で向きを変え、部屋ごとに回縁へ納める。
          for (const r of lv.layout.rooms.slice(1)) if (r.floor === 'tatami') ceilingRail(q, (r.z0 + r.z1) / 2, r.z1 - r.z0 - .22, false);
        } else if (goten && !plainCeiling) box(q, y + h - .015, 0, .035, .035, lv.d - .2, 0x3a2a1c);
        else box(q, y + h - .04, 0, .07, .08, lv.d - .2, 0x2e2216);
      }
      if (moribeHouse) {
        // 座敷ごとの竿縁と回縁。入口は太い梁を見せ、座敷との作りの違いを残す。
        for (const r of lv.layout.rooms) {
          const rearRoom = r === lv.layout.rooms[0];
          const depth = r.z1 - r.z0 - .14;
          if (rearRoom) {
            // 奥座敷の机の正面に沿う竿縁として推定復元。板の目地も直交させる。
            // 回縁の間を等分し、部材は従来どおり設営時に材質別へまとめる。
            const rails = Math.max(1, Math.round(depth / ceilingRailPitch));
            for (let i = 1; i < rails; i++) ceilingRail(0, r.z0 + .07 + depth * i / rails, lv.w - .4, true);
          }
          // 隅は前後の回縁を左右の外面まで渡し、木口の欠けを残さない。
          // 八センチ成の回縁の上端を天井板の下面へ付け、端の板を宙に浮かせない。
          for (const z of [r.z0 + .07, r.z1 - .07]) ceilingBorder(0, z, lv.w - .24, .08, .08);
        }
      }
      // 堂（本堂・中堂）は格天井：竿縁に直交する格縁を足して、格間を組む
      if (moribeHall) {
        const inner = lv.layout.rooms[0];
        // 外陣は一尺五寸ほどの竿縁で推定復元。内陣の格間の幅を流用しない。
        // 左右の回縁の間へ等分して納め、既存の天井と同じ材質別の形へまとめる。
        const outer = lv.layout.rooms[1], width = outer.x1 - outer.x0 - .32;
        const rails = Math.max(1, Math.round(width / ceilingRailPitch));
        for (let i = 1; i < rails; i++) {
          ceilingRail(outer.x0 + .16 + width * i / rails,
            (outer.z0 + outer.z1) / 2, outer.z1 - outer.z0 - .22, false);
        }
        // 奥行きも前後の回縁から等分し、格縁の木口を左右の回縁へ納める。
        const depth = inner.z1 - inner.z0 - .14, rows = Math.max(1, Math.round(depth / .75));
        // 横材は下半分を通し、上半分だけ縦材の幅で欠く。
        // 交点の下面にも横材の木目が通り、材同士の面は重ならない。
        // 設営時に材質別へまとめ、描画回数や毎コマの処理は増やさない。
        for (let i = 1; i < rows; i++) {
          const z = inner.z0 + .07 + depth * i / rows;
          box(0, y + h - .09, z, lv.w - .4, .06, .06, DARK);
          for (const side of [-1, 1]) ceilingTenon(side * (hw - .1875), z, .025, .06, 0);
          for (let j = 0; j < bays; j++) {
            const left = j === 0 ? -hw + .2 : -hw + .16 + spacing * j + .03;
            const right = j === bays - 1 ? hw - .2 : -hw + .16 + spacing * (j + 1) - .03;
            if (right > left) box((left + right) / 2, y + h - .03,
              z, right - left, .06, .06, DARK);
          }
        }
        for (const r of lv.layout.rooms) {
          const coffer = r === inner;
          for (const z of [r.z0 + .07, r.z1 - .07]) ceilingBorder(0, z, lv.w - .24, .08, coffer ? .12 : .08);
        }
      } else if (['hondo', 'chudo'].includes(I.kind)) for (let q = -hd + .75; q < hd - .1; q += .75) box(0, y + h - .02, q, lv.w - .2, .05, .05, 0x2a1c12);
      if (moribeHouse || moribeHall) {
        // 入口の板天井は、板目に直交する根太を見せて中央の梁で受ける推定復元。
        // 梁の上端へ根太の下端をそろえ、板だけが幅いっぱいに渡る作りを避ける。
        // 三棟とも既存の箱と材質へまとめ、戸の鴨居より上に納める。
        const entry = lv.layout.rooms[lv.layout.rooms.length - 1];
        const entryWidth = entry.x1 - entry.x0 - .32;
        const joists = Math.max(1, Math.round(entryWidth / ceilingRailPitch));
        const entryZ = (entry.z0 + entry.z1) / 2;
        // 側面の頭貫は天井下二十〜四センチ、柱の内面は壁芯から二十三センチ。
        // 梁の両端だけ上側を欠き、頭貫の下へ掛ける。一本の箱で交差させない。
        // 柱頭・梁下面と中央の成は保ち、既存の木目・材質別の束へまとめる。
        const seatedBeam = (z, bottom, top, depth, posts = []) => {
          // 戸脇柱は梁下面への突き付けにせず、込栓の高さまで上ほぞを差す。
          // 梁の下面だけ同寸で欠き、表裏と上端の木は通して残す（推定復元）。
          // 柱頭・戸の通り道は保ち、設営時に既存の木の束へまとめる。
          const mortiseTop = bottom + .14;
          let left = -hw + .23;
          for (const x of posts) {
            if (Math.abs(x) >= hw - .26) continue;
            const right = x - .03;
            if (right > left) box((left + right) / 2, y + h + (bottom + top) / 2,
              z, right - left, top - bottom, depth, DARK, false, 0);
            box(x, y + h + (mortiseTop + top) / 2, z,
              .06, top - mortiseTop, depth, DARK, false, 0);
            for (const face of [-1, 1]) box(x, y + h + (bottom + mortiseTop) / 2,
              z + face * (depth / 4 + .02), .06, .14, depth / 2 - .04, DARK, false, 0);
            box(x, y + h + (bottom + mortiseTop) / 2, z,
              .06, .14, .08, DARK, false, 1);
            left = x + .03;
          }
          const right = hw - .23;
          if (right > left) box((left + right) / 2, y + h + (bottom + top) / 2,
            z, right - left, top - bottom, depth, DARK, false, 0);
          for (const side of [-1, 1]) {
            // 側柱にも上ほぞを差す。梁の木口を四片に分け、柱頭を
            // 突き付けただけの納まりや、ほぞと梁の重なりを残さない。
            const jointY = y + h + (bottom - .2) / 2, jointH = -.2 - bottom;
            box(side * (hw - .21), jointY, z, .04, jointH, depth, DARK, false, 0);
            box(side * (hw - .115), jointY, z, .03, jointH, depth, DARK, false, 0);
            for (const face of [-1, 1]) box(side * (hw - .16), jointY,
              z + face * (depth / 4 + .02), .06, jointH, depth / 2 - .04, DARK, false, 0);
          }
        };
        seatedBeam(entryZ, -.32, -.08, .17);
        // 入口の梁と柱の仕口に込栓の木口を見せる推定復元。
        // 柱筋で梁を前後から留め、木口は梁の面から二ミリだけ出す。
        // 金具で貼り付けず、既存の木色・材質別の束へ納める。
        // 込栓は梁の前後へ通す。露出面を木口にし、薄い寸法から横目を選ばない。
        for (const side of [-1, 1]) for (const face of [-1, 1]) {
          box(side * (hw - .16), y + h - .26, entryZ + face * .084,
            .025, .025, .006, WOOD, false, 2);
        }
        // 両端は間仕切りの梁と正面の頭貫へ掛け、下側を欠いた推定復元。
        // 梁の上端は天井下四センチ。八センチ成の根太をそのまま通すと
        // 木が交差するため、掛かる部分だけ半分の成にして上面をそろえる。
        // 前後の回縁は壁芯から三〜十一センチ。根太の木口はその内面で止める。
        // 梁の見込みだけで切ると、回縁へ二センチ入り、天井際の木が重なる。
        // 梁・頭貫の上へ掛ける薄い木口も回縁の範囲を除き、同じ材質へまとめる。
        const rearBearing = entry.z0 + .11, frontBearing = entry.z1 - .23;
        for (let i = 1; i < joists; i++) {
          const x = entry.x0 + .16 + entryWidth * i / joists;
          box(x, y + h - .04, (rearBearing + frontBearing) / 2,
            .06, .08, frontBearing - rearBearing, DARK, false, 2);
          // 梁へ掛ける短い木口も、欠く前の根太と同じ奥行き方向にする。
          box(x, y + h - .02, entry.z0 + .015, .06, .04, .03, DARK, false, 2);
          box(x, y + h - .02, entry.z1 - .17, .06, .04, .12, DARK, false, 2);
          // 入口の根太は中央の梁へ木栓で留めた推定復元。
          // 梁下面へ木口だけ二ミリ出し、根太ごとの接合位置を見せる。
          // 既存の箱・木色へまとめ、戸の溝や歩く高さには張り出さない。
          box(x, y + h - .32, entryZ, .022, .004, .022, WOOD, false, 1);
        }
        // 間仕切りの柱頭へ梁を渡し、隣り合う天井の端を受ける（推定復元）。
        // 戸と鴨居より上へ納め、開いた襖・障子の通り道を空ける。
        for (const p of lv.layout.portals) {
          // 戸脇柱と梁の仕口も、入口の梁と同じ込栓で留めた推定復元。
          // 固定建具の両端から柱筋を拾い、同じ柱に二本の栓を重ねない。
          // 栓の木口だけを梁の両面へ出し、鴨居より上へ納める。
          const joints = new Set();
          for (const wall of lv.layout.walls) {
            if (wall.guideOnly || Math.abs(wall.az - p.z) > .001 || Math.abs(wall.bz - p.z) > .001) continue;
            for (const x of [wall.ax, wall.bx]) {
              // 側壁の柱との仕口は内側へ寄せ、梁の木口からはみ出させない。
              const jointX = Math.max(-hw + .16, Math.min(hw - .16, x));
              if (joints.has(jointX)) continue;
              joints.add(jointX);
            }
          }
          seatedBeam(p.z, -.28, -.04, .18, [...joints].sort((a, b) => a - b));
          for (const jointX of joints) for (const face of [-1, 1]) {
            const pegY = Math.abs(jointX) > hw - .23 ? -.24 : -.16;
            box(jointX, y + h + pegY, p.z + face * .089,
              .025, .025, .006, WOOD, false, 2);
          }
        }
        // 部屋の前後だけでなく左右にも回縁を渡し、竿縁・格縁の端を木で受ける。
        // 前後の回縁と竿縁・格縁の木口は、この回縁の内面（二十センチ）へそろえる。
        // 左右の回縁は前後の回縁の内面（十一センチ）で止める。
        // 前後を隅まで通した分だけ左右を短くし、隙間も面の重なりも残さない。
        for (const r of lv.layout.rooms) for (const x of [r.x0 + .16, r.x1 - .16]) {
          const coffer = moribeHall && r === lv.layout.rooms[0];
          ceilingBorder(x, (r.z0 + r.z1) / 2, .08, r.z1 - r.z0 - .22, coffer ? .12 : .08);
        }
      } else if (goten) { for (const sd of [-1, 1]) { box(0, y + h - .05, sd * (hd - .16), lv.w - .2, .08, .08, DARK); box(sd * (hw - .16), y + h - .05, 0, .08, .08, lv.d - .2, DARK); } }
    }
    for (const st of lv.firingSteps) box(st.x, st.y - .05, st.z, st.w, .1, st.d, DARK);
    if (I.profile === 'moribe') {
    // 床板の目地（長い方向へ数本）
    if (I.profile === 'moribe') {
      // 板間の目地は furnishLayout の床板と同じ割り付けにする。
      // 敷居の二本の溝と壁際の地覆を避け、端だけ細い板や二重の継ぎ目を作らない。
      for (const r of lv.layout.rooms) {
        if (r.floor !== 'boards') continue;
        const rearSill = lv.layout.portals.some(p => Math.abs(p.z - r.z0) < .001);
        const frontSill = lv.layout.portals.some(p => Math.abs(p.z - r.z1) < .001);
        // 地覆の内面（二十三センチ）で切る床板と、目地の端をそろえる。
        const x0 = r.x0 + .23, x1 = r.x1 - .23;
        const z0 = r.z0 + (rearSill ? .27 : .23), z1 = r.z1 - (frontSill ? .115 : .23);
        let floorOpening = !frontSill && lv.layout.entryDoor?.side === 1
          ? { ...lv.layout.entryDoor, extension: .13 } : null;
        // 間仕切りの戸口も、仕上げ床と同じ八センチの切欠きへ目地を延ばす。
        // 固定戸の敷居で一律に止めると、開けた戸口の床板を黒線が横切る。
        // 戸脇柱の内面で幅を切り、敷居の溝や畳寄せへ線を重ねない。
        if (frontSill) {
          const portal = lv.layout.portals.find(p => Math.abs(p.z - r.z1) < .001);
          let left = -Infinity, right = Infinity;
          for (const v of lv.layout.walls) {
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
        if (width <= 0 || depth <= 0) continue;
        const count = Math.max(1, Math.round(width / .24)), bw = width / count;
        const floorY = y + (r.y || 0);
        // 板の隙間（三ミリ）の中へ陰を置く。板の上へ黒線を重ねない。
        // 正面は十三センチ、間仕切りは八センチ、戸口の板だけ延びる。脇の地覆に線を描かず、
        // 戸口を横切る継ぎ目も作らない。床板と同じ切欠きへ納める。
        for (let i = 1; i < count; i++) {
          const x = x0 + i * bw;
          const end = z1 + (floorOpening && Math.abs(x - floorOpening.x) < floorOpening.w / 2 ? floorOpening.extension : 0);
          box(x, floorY + .002, (z0 + end) / 2, .002, .006, end - z0, 0x4a3828);
        }
        box((x0 + x1) / 2, floorY + .002, z0, width, .006, .003, 0x4a3828);
        const cuts = [x0, x1];
        if (floorOpening) for (const edge of [floorOpening.x - floorOpening.w / 2, floorOpening.x + floorOpening.w / 2]) {
          if (edge > x0 && edge < x1) cuts.push(edge);
        }
        cuts.sort((a, b) => a - b);
        for (let i = 1; i < cuts.length; i++) {
          const x = (cuts[i - 1] + cuts[i]) / 2;
          const end = z1 + (floorOpening && Math.abs(x - floorOpening.x) < floorOpening.w / 2 ? floorOpening.extension : 0);
          box(x, floorY + .002, end, cuts[i] - cuts[i - 1], .006, .003, 0x4a3828);
        }
      }
    } else for (const [x0, x1, z0, z1] of lv.pieces) for (let q = -hw + .9; q < x1 - .02; q += .9) if (q > x0 + .02) box(q, y + .002, (z0 + z1) / 2, .02, .006, z1 - z0, 0x4a3828);
    } else {
    // 比叡山の板敷きは細い板幅で継ぐ。畳の下には目地を重ねない。
    const boardStep = .3;
    const boardRooms = lv.layout.rooms.filter(r => r.floor === 'boards');
    // 庫裏の畳を退けた所も下地の一枚面で終えず、低い床の板として張る。
    // 食事の間の幅内だけに納め、炊事の土間や畳寄せへ板を重ねない。
    if (I.profile === 'hieizan' && I.kind === 'kuri') for (const r of lv.layout.rooms) {
      if (r.floor === 'tatami') boardRooms.push({
        x0: r.x0, x1: r.x1, z0: r.z1 - HIEI_ENTRY_TRACK - .1, z1: r.z1,
      });
    }
    const hallFloorFrame = I.profile === 'hieizan' && ['chudo', 'hondo'].includes(I.kind);
    const soboFloorFrame = I.profile === 'hieizan' && I.kind === 'sobo';
    // 堂の板端を白壁へ突き付けず、四周の床框で受ける。細かな納まりは推定。
    // 側面を通し、正背面はその内側で止める。板の目地も框を横切らせない。
    // 共通の箱と材質で設営時にまとめ、戸口・内陣境の通路は保つ。
    const floorRim = hallFloorFrame || soboFloorFrame ? .12 : 0;
    if (hallFloorFrame) for (const side of [-1, 1]) {
      box(side * (hw - floorRim / 2), y + .006, 0,
        floorRim, .012, lv.d, 0x795b3b);
      box(0, y + .006, side * (hd - floorRim / 2),
        lv.w - floorRim * 2, .012, floorRim, 0x795b3b);
    }
    if (soboFloorFrame) for (const r of boardRooms) {
      // 僧坊の入口も板端を床框で受ける。畳の座敷へは回さず、
      // 座敷境の敷居に接続する。板・框の上面は従来の床高に揃える。
      // 左右を通し、正面の框はその内面で止めて隅の面を重ねない。
      for (const side of [-1, 1]) box(side * (hw - floorRim / 2), y + .006,
        (r.z0 + r.z1) / 2, floorRim, .012, r.z1 - r.z0, 0x795b3b);
      for (const edge of [-hd, hd]) {
        if (Math.abs(r.z0 - edge) > .001 && Math.abs(r.z1 - edge) > .001) continue;
        box(0, y + .006, edge - Math.sign(edge) * floorRim / 2,
          lv.w - floorRim * 2, .012, floorRim, 0x795b3b);
      }
    }
    for (const [x0, x1, z0, z1] of lv.pieces) for (const r of boardRooms) {
      const a = Math.max(x0, r.x0, -hw + floorRim), b = Math.min(x1, r.x1, hw - floorRim);
      const c = Math.max(z0, r.z0, -hd + floorRim), d = Math.min(z1, r.z1, hd - floorRim);
      if (b <= a || d <= c) continue;
      if (floorBoardShape) {
        // 線を盛り上げた目地ではなく、床框と同じ高さの板を張る。
        // 千鳥の継ぎ目を細く空け、板ごとに木色を変える。板割は推定。
        // 部屋・階段の穴・床框の内寸で切り、畳や戸口の敷居へ渡さない。
        // 壁芯から一定幅で切ると、床框や内陣境に細い切れ端が残る。
        // 部屋の仕上げ内寸を等分し、長手も半枚を単位に千鳥へ継ぐ。
        // 階段の穴はこの割付を切り抜き、穴の前後で目地をずらさない。
        const roomLeft = Math.max(r.x0, -hw + floorRim), roomRight = Math.min(r.x1, hw - floorRim);
        const roomFront = Math.max(r.z0, -hd + floorRim), roomBack = Math.min(r.z1, hd - floorRim);
        const pitch = (roomRight - roomLeft) / Math.max(1, Math.round((roomRight - roomLeft) / boardStep));
        const halfLength = (roomBack - roomFront) / Math.max(1, Math.round((roomBack - roomFront) / .9));
        const length = halfLength * 2;
        const firstCol = Math.floor((a - roomLeft) / pitch);
        for (let i = firstCol; roomLeft + i * pitch < b - .001; i++) {
          const left = Math.max(a, roomLeft + i * pitch);
          const right = Math.min(b, roomLeft + (i + 1) * pitch);
          if (right - left <= .003) continue;
          const offset = roomFront + (i % 2) * halfLength;
          const firstRow = Math.floor((c - offset) / length);
          for (let j = firstRow; offset + j * length < d - .001; j++) {
            const front = Math.max(c, offset + j * length);
            const back = Math.min(d, offset + (j + 1) * length);
            if (back - front <= .003) continue;
            const tone = ((i * 7 + j * 3) % 5 + 5) % 5;
            // 床板も梁・床框と同じ木材の束へ入れ、板の長手へ木目を通す。
            // 直接 put すると木肌のない材質へ入り、床だけ平らな色になっていた。
            // 板割・目地・床高は保ち、共有する形・材質で設営時にまとめる。
            box((left + right) / 2, y + .006, (front + back) / 2,
              right - left - .003, .012, back - front - .003,
              [0x806044, 0x866648, 0x8a6a48, 0x836346, 0x8d6c4d][tone]);
          }
        }
      } else for (let q = -hw + boardStep; q < b - .02; q += boardStep) {
        if (q > a + .02) box(q, y + .002, (c + d) / 2, .02, .006, d - c, 0x4a3828);
      }
    }
    }
    }
    }
    // 梁（天井の下の横木。階段の口の上は通さない）と、桁（長い向きの太い横木）
    // 御殿・堂は梁を天井の上に隠す（書院造）。櫓・天守と、天井を張らない建物だけ梁と桁を見せる
    const showBeams = !goten || I.open || plainCeiling || (I.profile === 'anegawa' && I.kind === 'nagaya')
      || (I.profile === 'kanegasaki' && ['bansho', 'kura', 'nagaya'].includes(I.kind));
    // 稲葉山の用屋は壁の柱筋へ梁を載せる。等間隔の別割りで柱間へ浮かせない。
    const inabaBeamFrame = inabaBoards && plainCeiling;
    const beamBays = Math.max(2, Math.round(lv.w / 1.9));
    const beamStart = inabaBeamFrame ? -hw + lv.w / beamBays : -hw + .8;
    const beamStep = inabaBeamFrame ? lv.w / beamBays : 1.7;
    if (showBeams) for (let q = beamStart; q < hw - .3; q += beamStep) {
      if (upSt && q > upSt.hole.x0 - 0.15 && q < upSt.hole.x1 + 0.15) continue;
      const [beamX, beamZ] = I.P(q, 0);
      // 稲葉山の梁は根太の下面で止める。素材の指定高は下端、箱は中心なので
      // 同じ値を渡すと素材だけ天井を突き抜ける。上下端を共通にする。
      const beamBottom = h - .29, beamHeight = .24;
      const beamY = y + (inabaBeamFrame ? beamBottom : h - .25);
      if (inabaBeamFrame) {
        // 用屋・小祠の梁端は桁の下面へ掛ける推定の仕口。
        // 太い角材同士を貫通させず、桁幅十五センチの受けを上側から欠く。
        // 下の九センチは柱上まで通し、上側は桁の内面で止める。
        // 共通の木部へ設営時だけ結合し、梁下の高さと歩く当たりは保つ。
        const seatY = h - .2, lowerH = seatY - beamBottom;
        const innerLength = lv.d - .47 - .002;
        exposedTimber(q, y + beamBottom + lowerH / 2, 0,
          .17, lowerH, lv.d - .2, DARK);
        exposedTimber(q, y + seatY + (beamHeight - lowerH) / 2, 0,
          .17, beamHeight - lowerH, innerLength, DARK);
      } else if (!naibu || !addNaibu(naibu, 'beam', beamX, beamY, beamZ, .17, beamHeight, lv.d - .2, I.rot))
        box(q, y + h - .13, 0, .17, beamHeight, lv.d - .2, DARK);
      if (inabaBeamFrame) for (const sd of [-1, 1]) {
        // 開口の上は鴨居から短い束で受ける。戸や窓の中へ柱を通さない。
        let base = 0;
        for (const v of lv.windows) if (v.face === 'z' && v.s === sd && Math.abs(q - v.t) < v.w / 2 + .08)
          base = Math.max(base, v.y1 + .1);
        if (k === 0 && sd === ds && Math.abs(q - I.door.lx) < I.door.w / 2 + .2)
          base = Math.max(base, (I.door.h ?? Math.min(h - .3, 2)) + .1);
        // 戸・窓の上の束も柱と同じ縦目にし、梁の横目と分ける。
        if (base > 0 && base < beamBottom) exposedTimber(q, y + (base + beamBottom) / 2, sd * (hd - .16),
          .16, beamBottom - base, .14, DARK, 'y');
        // 用屋・小祠の見せる梁は、柱頭との仕口を込栓で表す推定の納まり。
        // 梁の両側面に木栓の木口を納め、角材同士を重ねただけの接合にしない。
        // 開口より上の梁の厚み内に置き、戸・窓・通路の当たりは増やさない。
        // 既存の箱と木の材質へ設営時だけまとめる。
        for (const face of [-1, 1]) {
          box(q + face * .088, y + h - .225, sd * (hd - .16),
            .012, .045, .045, 0x8a6a48);
          box(q + face * .095, y + h - .225, sd * (hd - .16),
            .003, .025, .004, 0x493522);
        }
      }
    }
    if (showBeams) {
      // 稲葉山の板倉・番所・長屋・小祠では、桁を外周の柱の真上に載せる。
      // 室内へ寄せた二本の横木では柱がなく、梁も途中だけで受ける形になる。
      const girderZ = inabaBeamFrame ? hd - .16 : hd * .55;
      for (const side of [-1, 1]) {
        if (inabaBeamFrame && lv.w > 6) {
          // 長屋などの長い桁を一本の角材で済ませず、柱上で相欠きに継ぐ推定。
          // 上下の材を半分ずつ重ね、継ぎ目と込栓を室内側に見せる。
          // 柱筋・梁の高さは保ち、戸口・窓より上の既存の桁の範囲に収める。
          const jointX = -hw + lv.w * Math.floor(beamBays / 2) / beamBays;
          const left = -hw + .1, right = hw - .1, lap = .24;
          const timber = (a, b, bottom, height) => exposedTimber((a + b) / 2,
            y + bottom + height / 2, side * girderZ, b - a, height, .15, DARK, true);
          timber(left, jointX - lap, h - .2, .2);
          timber(jointX + lap, right, h - .2, .2);
          timber(jointX - lap, jointX + lap - .003, h - .2, .098);
          timber(jointX - lap + .003, jointX + lap, h - .1, .1);
          for (const offset of [-.12, .12]) put(INABA_GIRDER_PART.clone()
            .scale(.035, .035, .012), jointX + offset, y + h - .1,
            side * (girderZ - .076), 0x8a6a48);
        } else if (inabaBeamFrame)
          exposedTimber(0, y + h - .1, side * girderZ, lv.w - .2, .2, .15, DARK, true);
        else box(0, y + h - .1, side * girderZ, lv.w - .2, .2, .15, DARK);
      }
      if (inabaBeamFrame && !upSt) {
        // 妻側の根太の端も柱上の受け材へ載せる推定の納まり。
        // 正面と裏の桁だけでは、直交する根太の両端が板壁へ突き当たる。
        // 上面を根太の下面へ揃え、両端は既存の桁の内側で止める。
        // 一棟につき二本を既存の束へ結合し、戸・窓の開口は保つ。
        for (const side of [-1, 1])
          exposedTimber(side * (hw - .06), y + h - .13, 0,
            .14, .16, lv.d - .47, DARK);
        // 用屋・小祠の隅は火打梁で固める推定の木組み。
        // 桁と妻側の受け材へ両端を掛け、板裏へ斜材を貼るだけにしない。
        // 短い板倉でも四隅が重ならない長さにし、戸・窓の上の梁厚へ納める。
        // 同じ角材の形を使い、設営時に既存の木部の束へまとめる。
        const braceRun = Math.min(.65, (lv.w - .32) / 3, (lv.d - .47) / 3);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
          const ax = sx * (hw - .06), az = sz * (hd - .16 - braceRun);
          const bx = sx * (hw - .06 - braceRun), bz = sz * (hd - .16);
          const dx = bx - ax, dz = bz - az;
          // 火打梁は木目を長手へ割り付けてから回す。斜材も梁と同じ木部へまとめる。
          exposedTimber((ax + bx) / 2, y + h - .13, (az + bz) / 2,
            Math.hypot(dx, dz), .12, .1, DARK, true, Math.atan2(-dz, dx));
          // 両端の込栓は材の上面へ収める。開口や歩行の当たりは増やさない。
          for (const t of [.12, .88])
            box(ax + dx * t, y + h - .068, az + dz * t, .025, .004, .025, WOOD);
        }
        // 梁間の天井板を受ける根太。梁の上端へ載せ、端は柱上の桁で受ける推定。
        // 既存の束と材質にまとめ、室内を作る時だけ足す。
        const joists = Math.max(2, Math.ceil((lv.d - .32) / .45));
        for (let j = 1; j < joists; j++) {
          const joistZ = -girderZ + girderZ * 2 * j / joists;
          // 根太は板用の平面投影を使わず、梁と同じく下面・側面へ長手の木目を通す。
          // 板の継ぎ目と同じ割り付け・寸法を保ち、木部の束と材質を共有する。
          if (lv.w > 6) {
            // 長屋の根太を建物の端から端まで一本材にせず、梁上で継ぐ推定。
            // 隣の根太とは継ぐ梁をずらし、梁上で上下半分を相欠きにする推定。
            // 継手の全長十二センチを梁幅十七センチの内へ収める。
            // 板裏を受ける上面と根太の下面は保ち、共通の木部の束へ結合する。
            let start = -hw + .1;
            const lap = .06, halfH = .025;
            for (let bay = j % 2 ? 1 : 2; ; bay += 2) {
              const joint = bay < beamBays;
              const end = joint ? -hw + bay * beamStep : hw - .1;
              const far = end - (joint ? lap : 0);
              exposedTimber((start + far) / 2, y + h - .025, joistZ,
                far - start, .05, .045, WOOD, true);
              if (!joint) break;
              // 半材の木口は一ミリ控え、下面にも継ぐ位置を見せる。
              // 上下を重ねた範囲も同じ梁で受け、宙に浮く継手にしない。
              exposedTimber(end - .0005, y + h - .0375, joistZ,
                lap * 2 - .001, halfH, .045, WOOD, true);
              exposedTimber(end + .0005, y + h - .0125, joistZ,
                lap * 2 - .001, halfH, .045, WOOD, true);
              start = end + lap;
            }
          } else exposedTimber(0, y + h - .025, joistZ, lv.w - .2, .05, .045, WOOD, true);
          // 上に載る天井板の留め釘を、根太の下面に並べない。
          // 下面の飾り釘は省き、板裏・根太・梁の上下関係が見える納まりにする。
        }
      }
    }
    // 窓（外の格子窓の場所に合わせる）
    const wins = windowsFor(I, lv, k);
    if (S.quality === 'high' && I.profile === 'inabayama') for (const door of I.doors || []) {
      if (door.lv !== lv) continue;
      // 玄関と室内で同じ戸の寸法を使う。敷居・鴨居の溝を戸の移動先まで通す。
      // 室内も玄関も、この戸口の両脇へ一組だけ柱を納める。
      const cx = door.lx, cz = door.lz, top = door.y + door.h;
      const postW = door.exterior ? .1 : .08, postD = door.window ? .36 : door.exterior ? .28 : .14;
      // 障子窓の見込みは外壁まで通す。溝だけの薄い枠では、開けた時に
      // 上下の壁の切り口が露出する。戸と溝は動かさず、四方の木枠だけを深くする。
      const frameZ = cz + (door.window ? Math.sign(cz) * .06 : 0);
      // 明かり障子の窓枠は腰壁の上で止める。玄関用の柱を床から天井まで重ねない。
      const postBottom = door.window ? door.y - .04 : y;
      const postTop = door.window ? top + .1 : y + h;
      // 室内の戸口の脇柱は共通の間仕切りが既に持つ。
      // 同じ面へ別幅の柱を重ねず、長押・釘隠しと一体の柱を使う。
      // 玄関・窓や、脇に柱のない口には従来どおり枠を納める。
      const partitionFrame = !door.exterior
        && ['goten', 'tamari', 'hondo', 'shrine', 'kura', 'bansho', 'nagaya'].includes(I.kind);
      for (const side of [-1, 1]) {
        const edge = cx + side * door.W / 2;
        const sharedPost = partitionFrame && lv.layout.walls.some(v => !v.guideOnly
          && Math.abs(v.az - cz) < .001 && Math.abs(v.bz - cz) < .001
          && Math.abs((side < 0 ? Math.max(v.ax, v.bx) : Math.min(v.ax, v.bx)) - edge) < .001);
        if (!sharedPost && door.window) {
          // 明かり障子の召し合わせは三センチ重ねるため、閉めた両端も
          // 窓枠へ一・五センチ入る。角材のままでは縦框が埋まるので、
          // 二本の溝につながる戸じゃくりを縦枠にも刻んで受ける。
          // 可動戸の幅・軌道・当たりは保ち、共通の木部の束へまとめる。
          const rebate = .022, near = frameZ - postD / 2, far = frameZ + postD / 2;
          const leafZ = cz + door.trackZ;
          // 四隅は横枠を受ける欠きを設ける。縦枠を全高で通すと、
          // 四センチ張り出す敷居・鴨居と表面が重なってちらつく。
          // 開口内の戸じゃくりは保ち、上下だけ横枠の木口で突き合わせる。
          const railLap = .04;
          exposedTimber(edge + side * (postW + rebate) / 2, (door.y + top) / 2,
            frameZ, postW - rebate, door.h, postD, DARK, 'y');
          for (const [a, b] of [[postBottom, door.y], [top, postTop]])
            if (b > a) exposedTimber(edge + side * (postW + railLap) / 2, (a + b) / 2,
              frameZ, postW - railLap, b - a, postD, DARK, 'y');
          let end = near;
          for (const track of [-door.track, door.track]) {
            const a = Math.max(near, leafZ + track - .032);
            const b = Math.min(far, leafZ + track + .032);
            if (a > end) exposedTimber(edge + side * rebate / 2, (door.y + top) / 2,
              (end + a) / 2, rebate, door.h, a - end, DARK, 'y');
            end = Math.max(end, b);
          }
          if (far > end) exposedTimber(edge + side * rebate / 2, (door.y + top) / 2,
            (end + far) / 2, rebate, door.h, far - end, DARK, 'y');
        } else if (!sharedPost) {
          // 稲葉山の玄関の脇柱は、横に通る鴨居を欠き込んで受ける推定の納まり。
          // 柱を天井まで一本で貫くと、鴨居と同じ面が重なり木目もちらつく。
          // 主殿・館・遠侍・番所・蔵も、本堂と同じ十センチ厚の鴨居を使う。
          // 建具の種類にかかわらず柱を欠き、横材の木口が柱へ埋まるのを防ぐ。
          // 敷居は床下、鴨居は戸の上端から十センチ。木枠の外寸と戸の溝は保つ。
          const jambPieces = door.exterior && !door.window
            ? [[postBottom, top], [top + .1, postTop]] : [[postBottom, postTop]];
          for (const [bottom, head] of jambPieces) if (head > bottom) {
            // 玄関の戸は柱より室内側を滑る。上下の横枠だけ深くしても、
            // 脇柱との間に外が見える隙間が残るので、縦の見込みも揃える。
            // 柱は手前の戸の表から一センチ控え、左右へ滑る戸を貫かない。
            // 鴨居より上の柱と、窓・室内の間仕切りの寸法は保つ。
            const entryJamb = door.exterior && !door.window && head <= top;
            const reach = entryJamb ? Math.max(postD / 2,
              Math.abs(door.trackZ) - door.track - .032 - .01) : postD / 2;
            const jambD = postD / 2 + reach;
            const jambZ = frameZ - (entryJamb ? I.door.side * (reach - postD / 2) / 2 : 0);
            exposedTimber(edge + side * postW / 2, (bottom + head) / 2,
              jambZ, postW, head - bottom, jambD, DARK, 'y');
          }
        }
      }
      const trackW = door.W * (door.window ? 1 : 2) + .08;
      const trackD = door.track * 2 + .08;
      const trackZ = cz + door.trackZ;
      // 玄関の溝は柱の裏へ寄せてある。敷居・鴨居は溝だけの細い棒にせず、
      // 壁の柱まで見込みを通す。戸の軌道と柱の間に隙間を残さない。
      // 足元と戸の上だけを広げ、動く戸・開口・窓の枠はそのまま使う。
      const entryFrame = door.exterior && !door.window;
      const frameNear = entryFrame ? Math.min(cz - postD / 2, trackZ - trackD / 2) : trackZ - trackD / 2;
      const frameFar = entryFrame ? Math.max(cz + postD / 2, trackZ + trackD / 2) : trackZ + trackD / 2;
      const railZ = door.window ? frameZ : (frameNear + frameFar) / 2;
      const railD = door.window ? postD : frameFar - frameNear;
      // 敷居の上面を戸の下端に揃える。上げ床や窓台へ四センチの角材を重ねない。
      // 六センチ厚の框を受ける実際の溝を二本刻む。黒い細線だけでは
      // 開けた後も平らな角材が残るため、溝底と溝を挟む木部を分ける。
      // 戸の下端・上端と軌道は保ち、既存の木部の束へ設営時だけまとめる。
      // 敷居・鴨居も梁と同じ板目を長手へ通す。溝底は暗いまま残し、
      // 木部だけを既存の木目の束へ移す。寸法・溝・戸の当たりは変えない。
      exposedTimber(cx, door.y - .024, railZ, trackW, .032, railD, DARK, true);
      // 内陣・上段・用屋の上げ床では、開口の敷居の下も框で支える。
      // 脇の固定壁には腰板があるが、中央だけ空くと敷居が宙に浮く。
      // 低い側の床から敷居の下面まで納め、戸の溝と通れる高さは保つ。
      const sillBase = door.y - y - .04;
      if (!door.exterior && sillBase > .001)
        exposedTimber(cx, y + sillBase / 2, railZ, door.W + .08, sillBase, railD, WOOD, true);
      exposedTimber(cx, top + .056, railZ, trackW, .088, railD, DARK, true);
      let railEdge = railZ - railD / 2;
      for (const z of [-door.track, door.track]) {
        const groove = trackZ + z, grooveNear = groove - .032;
        const width = grooveNear - railEdge;
        if (width > .001) {
          exposedTimber(cx, door.y - .004, railEdge + width / 2, trackW, .008, width, DARK, true);
          exposedTimber(cx, top + .006, railEdge + width / 2, trackW, .012, width, DARK, true);
        }
        box(cx, door.y - .007, groove, trackW - .04, .002, .064, 0x211b15);
        box(cx, top + .011, groove, trackW - .04, .002, .064, 0x211b15);
        // 戸当たりの下でも溝を木口まで抜かず、端の二センチを埋めて受ける推定。
        // 全開の戸尻から五ミリ逃がし、溝の中だけに納めて周囲の材と面を重ねない。
        // 溝底は埋め木の内側で止め、ちらつきも防ぐ。既存の木部の束へまとめる。
        for (const side of [-1, 1]) {
          const endX = cx + side * (trackW / 2 - .01);
          exposedTimber(endX, door.y - .004, groove, .02, .008, .064, DARK, true);
          exposedTimber(endX, top + .006, groove, .02, .012, .064, DARK, true);
        }
        railEdge = groove + .032;
      }
      const railEnd = railZ + railD / 2, endWidth = railEnd - railEdge;
      if (endWidth > .001) {
        exposedTimber(cx, door.y - .004, railEdge + endWidth / 2, trackW, .008, endWidth, DARK, true);
        exposedTimber(cx, top + .006, railEdge + endWidth / 2, trackW, .012, endWidth, DARK, true);
      }
      // 戸当たりは二本の溝それぞれへ納める推定の木組み。
      // 溝の間まで横長の塊で塞がず、戸の厚みに合わせた木片で戸尻を受ける。
      // 縦目と上の木口を既存の材質で表し、敷居・鴨居と同じ束へまとめる。
      // 窓は柱間、玄関と内戸は左右の引き込み先で止め、全開の框から五ミリ逃がす。
      const stopX = trackW / 2 - .01;
      for (const side of [-1, 1]) for (const track of [-door.track, door.track]) {
        const stopZ = trackZ + track;
        exposedTimber(cx + side * stopX, door.y + .035, stopZ, .02, .07, .064, WOOD, 'y');
        exposedTimber(cx + side * stopX, top - .035, stopZ, .02, .07, .064, WOOD, 'y');
        // 戸尻を受ける木片は敷居・鴨居へ角釘で留める推定の納まり。
        // 木片を置くだけにせず、二本の溝それぞれの上下に釘頭を納める。
        // 戸の通る内側へ金具を出さず、既存の箱と室内の束を使い回す。
        for (const offset of [-.018, .018]) {
          box(cx + side * stopX, door.y + .071, stopZ + offset, .008, .002, .008, 0x29251f);
          box(cx + side * stopX, top - .071, stopZ + offset, .008, .002, .008, 0x29251f);
        }
      }
      if (!door.exterior) {
        // 戸の上を天井まで開け放さず、両脇の小壁とつなぐ。用屋・小祠は板で納める。
        const capH = y + h - top - .1;
        if (capH > .001 && inabaBoards) {
          // 蔵・番所・長屋も小祠と同じく、鴨居上を縦目の板で閉じる。
          // 上框の下面で板端を止め、木目と目地を既存の木部の束へ納める。
          const headH = Math.min(I.kind === 'shrine' ? .04 : .1, capH);
          const boardH = capH - headH, boardY = top + .1 + boardH / 2;
          if (boardH > .001) {
            box(cx, boardY, cz, door.W, boardH, .052, DARK);
            const boards = Math.max(1, Math.ceil(door.W / .3)), width = door.W / boards;
            for (let j = 0; j < boards; j++)
              exposedTimber(cx - door.W / 2 + (j + .5) * width,
                boardY, cz, width - .004, boardH, .06,
                j % 2 ? 0x725539 : 0x795b3b, 'y');
          }
          // 両脇の板間仕切りの上框へ、長手に木目の通る横材をつなぐ。
          exposedTimber(cx, y + h - headH / 2, cz,
            door.W, headH, .14, DARK, true);
        // 座敷・本堂の塗り小壁は隣の固定壁と同じ束で作り、長押・頭貫を避ける。
        } else if (capH > .001 && !['goten', 'tamari', 'hondo'].includes(I.kind)) box(cx, top + .1 + capH / 2, cz, door.W, capH, .06,
          I.kind === 'hondo' ? 0xbdb39a : 0xcfc6b0);
        // 座敷は両脇の長押とつなぐ。本堂は下の頭貫でつなぎ、重なる材を置かない。
        if (!inabaBoards && I.kind !== 'hondo') exposedTimber(cx, y + Math.min(door.y - y + door.h + .42, h - nageshiOffset), cz,
          door.W, nageshiH, .14, 0x2e2016, true);
        if (I.kind === 'hondo') {
          // 内陣境の頭貫は中央の開口にも通し、両脇だけで途切れさせない。
          // 両脇の柱頭・舟肘木は固定格子側にあるため重ねず、桁だけをつなぐ。
          // 引き戸と鴨居の上だけに納め、二本の溝と通り口は空ける。
          // 内陣の格天井と同じ木部の束へまとめ、開口上でも頭貫の長手に木目を通す。
          exposedTimber(cx, y + h - .16, cz, door.W, .08, .12, 0x493522, true);
          for (const z of [-.14, .14])
            exposedTimber(cx, y + h - .02, cz + z, door.W, .04, .08, DARK, true);
        }
      }
    }
    // 四つの面：穴のある壁（内の側）。入口の階は戸口も穴
    for (const face of ['z', 'x']) for (const sd of [-1, 1]) {
      const len = face === 'z' ? lv.w : lv.d, off = (face === 'z' ? hd : hw) - 0.1;
      const okeWall = okeBansho || I.profile === 'okehazama' && I.kind === 'hondo';
      const holes = wins.filter((o) => o.face === face && o.s === sd && (!o.shoji || paperWindows)).map((o) => ({ t0: o.t - o.w / 2, t1: o.t + o.w / 2, y0: o.y0, y1: o.y1 }));
      if (k === 0 && face === 'z' && sd === ds) holes.push({ t0: I.door.lx - I.door.w / 2, t1: I.door.lx + I.door.w / 2, y0: I.door.rail || 0, y1: I.door.h ?? Math.min(h - 0.3, 2.0) });
      // 板壁の隅は前後の壁へ左右の壁を突き付ける。下地・化粧板・貫を
      // それぞれ相手の内面で止め、隅柱の裏で同じ面を交差させない。
      // 開口の位置と壁の当たりは保ち、稲葉山の高画質の木部だけ納め直す。
      const wallLen = inabaBoards && face === 'x' ? len - .26 : len;
      for (const [t0, t1, a0, a1] of facePanels(wallLen, h, holes.filter((o) => o.t1 > -len / 2 && o.t0 < len / 2))) {
        const tm = (t0 + t1) / 2, tw = t1 - t0, yy = y + (a0 + a1) / 2, hh = a1 - a0;
        if (I.profile === 'okehazama' && I.kind === 'hondo') {
          // 長福寺の外周の小壁も、障子上と同じ塗り肌にする推定復元。
          // 一メートルの目盛りを全壁で共有し、窓の上下でも模様をつなぐ。
          // 元の壁を置き換えて一束にし、板張り・開口・当たりは同じ位置に保つ。
          const g = colorize(interiorBox.clone().scale(tw, hh, .06), 0xbdb39a);
          const p = g.attributes.position, uv = g.attributes.uv, normals = g.attributes.normal;
          // 窓の見込み・小壁の上下端も実寸で塗り肌を回し、正面の模様を線状に引き延ばさない。
          for (let i = 0; i < p.count; i++) {
            const side = Math.abs(normals.getX(i)) > .5, top = Math.abs(normals.getY(i)) > .5;
            uv.setXY(i, side ? p.getZ(i) + .03 : p.getX(i) + tm + len / 2,
              top ? p.getZ(i) + .03 : p.getY(i) + yy - y);
          }
          if (face === 'x') g.rotateY(-Math.PI / 2);
          g.translate(face === 'z' ? tm : sd * off, yy, face === 'z' ? sd * off : tm);
          g.rotateY(I.rot); g.translate(I.x, 0, I.z); plaster.push(g);
        } else if (face === 'z') box(tm, yy, sd * off, tw, hh, 0.06, inabaBoards ? BOARD : WALL); else box(sd * off, yy, tm, 0.06, hh, tw, inabaBoards ? BOARD : WALL);
      }
      if (okeWall) {
        // 外の板壁に対応する内張りを推定復元。詰所は桁まで板、堂は外の白い小壁の下まで板。
        // 戸口の上も同じ開口で切り、板目や見切りを開いた戸の通り道へ渡さない。
        const boardH = okeBansho ? h : Math.min(h, (h + .06) * .78);
        // 床板の木口を板壁へ突き付けたままにせず、壁際の地覆で納める推定復元。
        // 畳際は畳寄せと同じ仕上げ高さから立ち上げる。戸口や窓の下まで横木を渡さない。
        // 共通の箱を既存の室内の束へ入れ、床・建具の当たりや毎コマの処理は増やさない。
        for (const room of lv.layout.rooms) {
          const edge = face === 'z' ? (sd > 0 ? room.z1 : room.z0) : (sd > 0 ? room.x1 : room.x0);
          const boundary = sd * (face === 'z' ? hd : hw);
          if (Math.abs(edge - boundary) > .01) continue;
          const start = face === 'z' ? room.x0 : room.z0, end = face === 'z' ? room.x1 : room.z1;
          const finish = (room.y || 0) + (room.floor === 'tatami' ? .06 : .012);
          const gaps = holes.filter(v => v.y0 < finish + .08 && v.y1 > finish)
            .map(v => ({ t0: v.t0, t1: v.t1, y0: 0, y1: .08 }));
          for (const [a, b] of facePanels(len, .08, gaps)) {
            // 前後の地覆を通し、側面の木口はその内面へ納める。
            // 壁心の寄せ .1、地覆の寄せ .07、半厚 .04 を合わせる。
            // 同じ八センチで両面を切ると隅で十三センチ重なり、上面がちらつく。
            const cornerInset = .1 + .07 + .04;
            const startInset = face === 'x' && Math.abs(start + hd) < .01 ? cornerInset : .08;
            const endInset = face === 'x' && Math.abs(end - hd) < .01 ? cornerInset : .08;
            const left = Math.max(a, start + startInset), right = Math.min(b, end - endInset);
            if (right - left < .02) continue;
            const t = (left + right) / 2;
            // 地覆も柱・梁と同じ木肌へまとめ、木目を長手へ通す。
            if (face === 'z') smokeBox(hearth, t, y + finish + .04, sd * (off - .07), right - left, .08, .08, DARK, 'beamX');
            else smokeBox(hearth, sd * (off - .07), y + finish + .04, t, .08, .08, right - left, DARK, 'beamZ');
          }
        }
        const unit = new THREE.BoxGeometry(1, 1, 1);
        const lining = (t, yy, width, height, depth, color, inset = 0, start = 0) => {
          if (inset) {
            smokeBox(hearth, face === 'z' ? t : sd * (off - .035 - inset), yy,
              face === 'z' ? sd * (off - .035 - inset) : t,
              face === 'z' ? width : depth, height, face === 'z' ? depth : width,
              color, face === 'z' ? 'wallZ' : 'wallX', start, boardWidth);
            return;
          }
          const g = unit.clone();
          g.scale(face === 'z' ? width : depth, height, face === 'z' ? depth : width);
          put(g, face === 'z' ? t : sd * (off - .035 - inset), yy,
            face === 'z' ? sd * (off - .035 - inset) : t, color);
        };
        // 線が板面より浮いていた内張りを、幅三十センチほどの縦板と奥まった目地にする。
        // 板割りは窓の上下でも通し、切り口は既存の窓枠・戸脇柱へ納める推定復元。
        // 仕上げ面の位置は保ち、目地の奥も下地で塞ぐ。同じ箱を既存の室内の束へまとめる。
        const boardCount = Math.max(1, Math.ceil(len / .3)), boardWidth = len / boardCount;
        const boardColors = okeBansho ? [0x79634c, 0x735d47, 0x80694f] : [0x654832, 0x60442f, 0x6c4e36];
        for (const [a, b, low, high] of facePanels(len, boardH, holes)) {
          lining((a + b) / 2, y + (low + high) / 2, b - a, high - low, .028, 0x463322);
          const first = Math.max(0, Math.floor((a + len / 2) / boardWidth));
          for (let i = first; i < boardCount; i++) {
            const start = -len / 2 + i * boardWidth, end = start + boardWidth;
            if (start >= b) break;
            const left = Math.max(a, start + (i ? .0015 : 0));
            const right = Math.min(b, end - (i + 1 < boardCount ? .0015 : 0));
            if (right - left <= .001) continue;
            lining((left + right) / 2, y + (low + high) / 2, right - left, high - low,
              .012, boardColors[i % boardColors.length], .014, start);
          }
        }
        if (!okeBansho) for (const [a, b, low, high] of facePanels(len, boardH + .04, holes)) {
          if (high < boardH || low >= boardH + .04) continue;
          // 長福寺の板壁と漆喰の見切り。前後を通し、側面の木口はその内面で受ける。
          // 四隅で同じ高さの木を貫通させず、柱・長押と同じ木肌を長手へ通す。
          const inset = face === 'z' ? .1 : .1 + .035 + .065 / 2;
          const left = Math.max(a, -len / 2 + inset), right = Math.min(b, len / 2 - inset);
          if (right - left < .02) continue;
          const t = (left + right) / 2, center = sd * (off - .035);
          if (face === 'z') smokeBox(null, t, y + boardH, center, right - left, .08, .065, DARK, 'beamX');
          else smokeBox(null, center, y + boardH, t, .065, .08, right - left, DARK, 'beamZ');
        }
        unit.dispose();
        if (okeBansho) {
          // 詰所・民家の板壁は、外側の貫と同じ高さで内側も柱へつなぐ推定復元。
          // 外壁の高さは h + .3、室内床は外壁の原点から .18 上。
          // 戸口と格子窓では木を切り、通路・採光の口へ横木を渡さない。
          // 共通の箱を既存の室内の束へまとめ、毎コマの処理は増やさない。
          const nukiY = (h + .3) * .55 - .18, thickness = .1;
          const gaps = holes.filter(v => v.y0 < nukiY + thickness / 2 && v.y1 > nukiY - thickness / 2)
            .map(v => ({ t0: v.t0, t1: v.t1, y0: 0, y1: thickness }));
          for (const [a, b] of facePanels(len, thickness, gaps)) {
            // 前後の貫は隅柱の中で止め、側面はその内面へ突き付ける。
            // 全幅の木を交差させると、隅柱の外に木口が出て下面も二重になる。
            // 前後の貫の内面は壁際から .1 + .09 + .05。開口で切る位置は保つ。
            const inset = face === 'z' ? .16 : .24;
            const left = Math.max(a, -len / 2 + inset), right = Math.min(b, len / 2 - inset);
            if (right - left < .02) continue;
            // 柱・梁と同じ木肌を共有し、貫も長手へ繊維を通す。民家の炉の煤も合わせる。
            if (face === 'z') smokeBox(hearth, (left + right) / 2, y + nukiY, sd * (off - .09), right - left, thickness, .1, DARK, 'beamX');
            else smokeBox(hearth, sd * (off - .09), y + nukiY, (left + right) / 2, .1, thickness, right - left, DARK, 'beamZ');
      }
      }
      }
      if (inabaBoards) {
        // 板壁の内面も線だけの一枚板にせず、三十センチほどの縦板で納める推定。
        // 窓・戸口で板を切り、目地の奥には既存の下地を残す。
        // 単位形を使い回して木部の束へ結合し、描画回数と毎コマの処理を増やさない。
        const boardLen = face === 'x' ? len - .272 : len;
        const count = Math.ceil(boardLen / .3), width = boardLen / count;
        for (let j = 0; j < count; j++) {
          const center = -boardLen / 2 + (j + .5) * width;
          const cuts = holes.map(o => ({ ...o, t0: o.t0 - center, t1: o.t1 - center }));
          for (const [a, b, lo, hi] of facePanels(width, h, cuts)) {
            if (b - a <= .008 || hi - lo <= .008) continue;
            const t = center + (a + b) / 2, yy = y + (lo + hi) / 2;
            // 縦板も柱と同じ縦目で納める。単色の箱では板の面・切り口に
            // 木目がなく、梁や可動板戸と質感が食い違う。
            // 共通の角材・板目の束を使い、板幅・目地・開口はそのまま保つ。
            exposedTimber(face === 'z' ? t : sd * (off - .032), yy,
              face === 'z' ? sd * (off - .032) : t,
              face === 'z' ? b - a - .008 : .008, hi - lo - .008,
              face === 'z' ? .008 : b - a - .008,
              j % 3 === 0 ? 0x6a5238 : j % 3 === 1 ? 0x725a40 : 0x644c34, 'y');
          }
        }
        // 用屋・小祠の柱脚を地覆でつなぐ推定の納まり。
        // 土間と上げ床で高さを分け、戸口は壁と同じ開口で切る。
        // 隅柱の内側で木口を止め、床や引き戸の敷居へ重ねない。
        // 木目・単位形を使い回し、設営時だけ既存の木部へ結合する。
        for (const room of lv.layout.rooms) {
          const edge = sd < 0 ? (face === 'z' ? room.z0 : room.x0)
            : (face === 'z' ? room.z1 : room.x1);
          if (Math.abs(edge - sd * (face === 'z' ? hd : hw)) > .001) continue;
          const start = Math.max(-len / 2 + .24, face === 'z' ? room.x0 : room.z0);
          const end = Math.min(len / 2 - .24, face === 'z' ? room.x1 : room.z1);
          if (end <= start) continue;
          const bottom = room.y || 0, center = (start + end) / 2;
          const cuts = holes.map(o => ({ t0: o.t0 - center, t1: o.t1 - center,
            y0: o.y0 - bottom, y1: o.y1 - bottom }));
          for (const [a, b, lo, hi] of facePanels(end - start, .1, cuts)) {
            if (b <= a || hi <= lo) continue;
            const t = center + (a + b) / 2, yy = y + bottom + (lo + hi) / 2;
            exposedTimber(face === 'z' ? t : sd * (off - .06), yy,
              face === 'z' ? sd * (off - .06) : t,
              face === 'z' ? b - a : .09, hi - lo,
              face === 'z' ? .09 : b - a, DARK, face === 'z');
          }
        }
        const railLen = len - (face === 'z' ? .2 : .37);
        for (const railY of [.65, 1.8]) for (const [a, b, lo, hi] of facePanels(railLen, .08, holes.map(o => ({ ...o, y0: o.y0 - railY, y1: o.y1 - railY })))) {
          // 長屋の長い貫は柱芯で相欠きに継ぐ推定。開口で切った端は保ち、
          // 継ぎの見込みを半分ずつ受ける。既存の木部へ結合し、通路の当たりは増やさない。
          const bays = Math.max(2, Math.round(len / 1.9));
          const joints = [];
          if (b - a > 4) for (let j = 1; j < bays; j++) {
            const t = -len / 2 + j * len / bays;
            if (t > a + .2 && t < b - .2 && !holes.some(o => t > o.t0 - .08 && t < o.t1 + .08)) joints.push(t);
          }
          const yy = y + railY + (lo + hi) / 2, offset = sd * (off - .055), lap = .06;
          const timber = (left, right, across = offset, depth = .06) => {
            if (face === 'z') exposedTimber((left + right) / 2, yy, across, right - left, hi - lo, depth, DARK, true);
            else exposedTimber(across, yy, (left + right) / 2, depth, hi - lo, right - left, DARK);
          };
          let start = a;
          for (let j = 0; j <= joints.length; j++) {
            const end = j < joints.length ? joints[j] : b;
            timber(start + (j ? lap : 0), end - (j < joints.length ? lap : 0));
            if (j < joints.length) for (const side of [-1, 1])
              timber(end - lap + (side > 0 ? .001 : 0), end + lap - (side < 0 ? .001 : 0), offset + side * .015, .03);
            start = end;
          }
        }
      }
      // 腰板（櫓・天守：壁の下の一間ほどは板張り、上は漆喰。戸口の所は空ける）
      if (!goten) {
        const wb = (t0, t1) => { if (t1 - t0 < 0.05) return; const tm = (t0 + t1) / 2, tw = t1 - t0; if (face === 'z') box(tm, y + 0.55, sd * (off - 0.03), tw, 1.1, 0.04, BOARD); else box(sd * (off - 0.03), y + 0.55, tm, 0.04, 1.1, tw, BOARD); };
        for (const [a, b, low, high] of facePanels(len, 1.1, holes)) { if (low === 0 && high === 1.1) wb(a, b); else { const mid = (a + b) / 2; if (face === 'z') box(mid, y + (low + high) / 2, sd * (off - .03), b - a, high - low, .04, BOARD); else box(sd * (off - .03), y + (low + high) / 2, mid, .04, high - low, b - a, BOARD); } }
        // 板の継ぎ目（縦）
        for (let t = -len / 2 + 0.45; t < len / 2 - 0.2; t += 0.45) { if (holes.some(v => t > v.t0 - .02 && t < v.t1 + .02 && v.y0 < 1.1)) continue; if (face === 'z') box(t, y + 0.55, sd * (off - 0.055), 0.015, 1.08, 0.01, 0x3a2a1c); else box(sd * (off - 0.055), y + 0.55, t, 0.01, 1.08, 0.015, 0x3a2a1c); }
      }
      // 柱：隅と窓の両脇。長押（横の木）
      if (I.profile === 'hieizan') {
      const n = Math.max(2, Math.round(len / 1.9));
      if (I.profile === 'inabayama') {
      const inabaFrame = S.quality === 'high' && I.profile === 'inabayama';
      const posts = [], hallSupports = [];
      for (let q = 0; q <= n; q++) {
        // 稲葉山の隅柱は前後の柱筋（壁端から十六センチ）へ揃える。
        // 各面の端へ別々に立てると、一つの隅にずれた二本の柱が残る。
        // 隅の一本は前後面で作り、側面の頭貫も同じ柱へ納める。
        const corner = q === 0 || q === n;
        if (inabaFrame && corner && face === 'x') continue;
        posts.push(inabaFrame && corner ? (q === 0 ? -1 : 1) * (len / 2 - .16) : -len / 2 + q * len / n);
      }
      if (inabaFrame) for (const o of holes) for (const t of [o.t0 - .09, o.t1 + .09])
        if (t > -len / 2 && t < len / 2 && !posts.some(v => Math.abs(v - t) < .12)) posts.push(t);
      for (const t of posts) {
        if (k === 0 && face === 'z' && sd === ds && Math.abs(t - I.door.lx) < I.door.w / 2 + .2) continue;
        if (inabaFrame && holes.some(o => t > o.t0 - .08 && t < o.t1 + .08)) continue;
        const cornerPost = inabaFrame && Math.abs(Math.abs(t) - (len / 2 - .16)) < .001;
        const hallPost = inabaFrame && I.kind === 'hondo' && (cornerPost || Math.abs(t) < len / 2 - .15);
        if (hallPost) {
          hallSupports.push(t);
          // 本堂の外周は隅柱も内陣・中柱と同じ丸柱にする推定復元。
          // 住居用の角柱を肘木へ突き通さず、柱頭の大斗で受ける。
          // 元の角柱の幅内に納め、開口・引き戸の溝へ張り出さない。
          // 内陣の円柱形と既存の木部の束・材質を使い回す。
          const px = face === 'z' ? t : sd * (off - .06);
          const pz = face === 'z' ? sd * (off - .06) : t;
          // 外周も内陣と同じく礎盤で柱の木口を受ける推定の納まり。
          // 元の柱幅十四センチ以内で二段に絞り、板床や戸の溝へ張り出さない。
          // 内陣の上げ床へ礎盤を埋めない。外陣側も含め、実際の板床の上から据える。
          // 柱頭の高さは保ち、床の段差と礎盤の厚みだけ柱身を短くする。
          // 反転した間取りも室の範囲から拾い、形と材質は従来の物を共有する。
          let bottom = 0;
          for (const r of lv.layout.rooms) {
            if (px >= r.x0 && px <= r.x1 && pz >= r.z0 && pz <= r.z1)
              bottom = Math.max(bottom, r.y || 0);
          }
          const baseH = .06, shaftH = h - .19 - bottom - baseH;
          hallBase(px, y + bottom + baseH / 4, pz, .07, baseH / 2, DARK);
          hallBase(px, y + bottom + baseH * .75, pz, .065, baseH / 2, WOOD);
          hallShaft(px, y + bottom + baseH + shaftH / 2, pz, shaftH);
          exposedTimber(px, y + h - .17, pz, cornerPost || face === 'z' ? .16 : .14,
            .04, cornerPost || face === 'x' ? .16 : .14, DARK, face === 'z');
        } else if (inabaBoards || lowNageshi) {
          // 用屋・小祠に加え、主殿・館・遠侍の外周柱にも縦目を通す。
          // 座敷の横目の長押・縦目の間仕切り柱と木部の仕上げを揃える。
          // 既存の単位形・木目の束を使い、柱筋・太さ・戸の引き先は保つ。
          let postH = h;
          if (inabaBeamFrame) {
            // 用屋の柱頭を天井板まで突き通さず、梁・桁の下面で受ける推定の納まり。
            // 窓脇に足した柱は桁で止め、梁のある柱筋だけ九センチ低くする。
            // 妻側は根太の受け材、隅は前後の桁へ納める。形と当たりは増やさない。
            const bay = Math.round((t + hw) / beamStep);
            const underBeam = face === 'z' && bay > 0 && bay < beamBays
              && Math.abs(t - (-hw + bay * beamStep)) < .001
              && !(upSt && t > upSt.hole.x0 - .15 && t < upSt.hole.x1 + .15);
            postH = h - (underBeam ? .29 : face === 'x' ? .21 : .2);
          }
          if (face === 'z') exposedTimber(t, y + postH / 2, sd * (off - .06), .16, postH, .14, DARK, 'y');
          else exposedTimber(sd * (off - .06), y + postH / 2, t, .14, postH, .16, DARK, 'y');
        } else if (face === 'z') box(t, y + h / 2, sd * (off - .06), .16, h, .14, DARK);
        else box(sd * (off - .06), y + h / 2, t, .14, h, .16, DARK);
        if (inabaBoards && !cornerPost
          && Math.abs(t) < len / 2 - .15) {
          // 小祠も用屋と同じ貫構造なので、柱との接合を共通の楔で締める推定復元。
          // 窓・戸口と隅には出さない。
          // 柱の表に納め、玄関の引き戸の溝より壁側に収める。
          // 共通形を既存の木部へ結合し、描画回数・毎コマの処理は増やさない。
          for (const railY of [.65, 1.8]) {
            if (railY + .08 >= h || holes.some(o => t + .12 > o.t0 && t - .12 < o.t1
              && railY + .08 > o.y0 && railY + .04 < o.y1)) continue;
            const wedge = INABA_NUKI_WEDGE.clone();
            if (face === 'x') wedge.rotateY(Math.PI / 2);
            put(wedge, face === 'z' ? t : sd * (off - .105), y + railY + .04,
              face === 'z' ? sd * (off - .105) : t, 0x8a6a48);
          }
        }
        if (hallPost) {
          // 本堂外周の柱も舟肘木で天井際の桁を受ける推定の納まり。
          // 内陣境と同じ二段の寸法を使い、窓・玄関を避けた柱筋だけに置く。
          // 壁の内側へ寄せ、開く障子の溝より上で既存の回縁につなぐ。
          // 設営時に既存の束へ結合するため、材質や毎コマの処理は増えない。
          const supportOff = sd * (off - .14);
          if (face === 'z') {
            exposedTimber(t, y + h - .12, supportOff, .12, .06, .22, DARK);
            if (cornerPost) {
              // 隅の一本は前後面で作る。上下二段の肘木を直交させ、
              // 同じ大斗から前後・側面の頭貫を受ける推定の納まり。
              // 上段は下段の上へ載せ、交点で同じ下面を重ねない。
              hijiki(t - Math.sign(t) * .08, y + h - .065, sd * (off - .06),
                .36, .05, .14);
            } else hijiki(t, y + h - .065, supportOff, .36, .05, .14, true);
          } else {
            exposedTimber(supportOff, y + h - .12, t, .22, .06, .12, DARK, true);
            hijiki(supportOff, y + h - .065, t, .36, .05, .14);
          }
        }
      }
      if (inabaFrame && I.kind === 'hondo') {
        // 本堂の塗り壁の足元は木の見切りで板床へ納める推定。
        // 内陣の上げ床と外陣を別々の高さで受け、玄関・丸柱の礎盤は避ける。
        // 設営時だけ既存の木部へ結合し、戸の溝や通路の当たりは増やさない。
        for (const room of lv.layout.rooms) {
          if (face === 'z' && (sd < 0 ? room.z0 > -hd + .001 : room.z1 < hd - .001)) continue;
          const a = Math.max(-len / 2 + .23, face === 'z' ? room.x0 : room.z0);
          const b = Math.min(len / 2 - .23, face === 'z' ? room.x1 : room.z1);
          if (b <= a) continue;
          const center = (a + b) / 2, bottom = room.y || 0;
          const cuts = holes.map(o => ({ ...o, t0: o.t0 - center, t1: o.t1 - center,
            y0: o.y0 - bottom, y1: o.y1 - bottom }));
          for (const t of hallSupports) cuts.push({ t0: t - center - .075,
            t1: t - center + .075, y0: 0, y1: .07 });
          for (const [left, right, low, high] of facePanels(b - a, .07, cuts)) {
            if (right - left < .01 || high - low < .001) continue;
            const t = center + (left + right) / 2, yy = y + bottom + (low + high) / 2;
            if (face === 'z') exposedTimber(t, yy, sd * (off - .05),
              right - left, high - low, .04, DARK, true);
            else exposedTimber(sd * (off - .05), yy, t,
              .04, high - low, right - left, DARK);
          }
        }
        // 本堂の外周も柱頭を頭貫でつなぐ推定復元。中柱の舟肘木だけで
        // 天井の回縁を受けず、内陣から外陣まで四周に材を通す。
        // 玄関・障子の上端より上に納め、既存の木部の束へまとめる。
        const offset = sd * (off - .06);
        // 柱芯は壁端から十六センチ。前後の材は相手の外面まで通し、
        // 左右の材は内面へ突き付けて、隅の下面を重ねない。
        const tieLen = len - (face === 'z' ? .2 : .44);
        // 長い一本材で済ませず、実際に立てた丸柱の芯で頭貫を継ぐ推定。
        // 窓と玄関を避けた柱だけを使い、開口の上へ継ぎ目を置かない。
        // 柱上は見込み半分の相欠きで受ける推定。柱頭の込栓も既存の木部へまとめる。
        const joints = hallSupports.filter(t => t > -tieLen / 2 + .2 && t < tieLen / 2 - .2).sort((a, b) => a - b);
        const lap = .06;
        let start = -tieLen / 2;
        for (let j = 0; j <= joints.length; j++) {
          const end = j < joints.length ? joints[j] : tieLen / 2;
          const a = start + (j > 0 ? lap : 0), b = end - (j < joints.length ? lap : 0);
          // 外周の頭貫も単色の角材にせず、各面の長手に沿う木目で天井の木組みへつなぐ。
          // 継ぐ位置と寸法は保ち、既存の木部の束・材質を共有する。
          exposedTimber(face === 'z' ? (a + b) / 2 : offset, y + h - .17,
            face === 'z' ? offset : (a + b) / 2,
            face === 'z' ? b - a : .12, .1, face === 'z' ? .12 : b - a,
            DARK, face === 'z');
          start = end;
        }
        for (const t of joints) {
          // 左右の材を柱芯で十二センチ重ね、室内側と壁側で半分ずつ受ける。
          // 木口と合わせ面に一ミリの目地を残し、黒線だけの突き合わせにしない。
          // 木目は各材の長手へ通し、既存の木部の束に設営時だけ結合する。
          for (const side of [-1, 1]) {
            const along = t + side * .0005, across = offset + side * .03025;
            exposedTimber(face === 'z' ? along : across, y + h - .17,
              face === 'z' ? across : along,
              face === 'z' ? lap * 2 - .001 : .0595, .1,
              face === 'z' ? .0595 : lap * 2 - .001, DARK, face === 'z');
          }
        }
        for (const t of hallSupports) {
          const peg = INABA_GIRDER_PART.clone().scale(.025, .025, .008);
          if (face === 'x') peg.rotateY(Math.PI / 2);
          put(peg, face === 'z' ? t : offset - sd * .062, y + h - .17,
            face === 'z' ? offset - sd * .062 : t, WOOD);
        }
      }
      // 用屋は貫、本堂は頭貫と舟肘木で受ける。座敷用の長押を重ねない。
      if (!inabaBoards && !(inabaFrame && I.kind === 'hondo')) {
        // 長押も開口で切り、窓の紙や玄関の引き戸を横切らせない。
        // 稲葉山は間仕切りと同じ内法高を基準にし、外周だけ長押を低くしない。
        const railY = inabaFrame ? Math.min(Math.min(2.3, h - .2) + .42, h - nageshiOffset) : h * .8;
        const railH = inabaFrame ? nageshiH : .1;
        const railHoles = inabaFrame ? holes.map(o => ({ ...o, y0: o.y0 - railY + railH / 2, y1: o.y1 - railY + railH / 2 })) : [];
        // 座敷の長押は隅で前後の材に左右の材を突き付ける推定の納まり。
        // 柱芯は壁端から十六センチ、長押の厚みは十センチ。
        // 前後は相手の外面、左右は相手の内面で止め、隅柱の外へ突き出さない。
        // 開口の切り欠きは同じ座標を使い、設営時の既存の束だけで納める。
        const inabaNageshi = inabaFrame && ['goten', 'tamari', 'hondo'].includes(I.kind);
        const railLen = inabaNageshi ? len - (face === 'z' ? .22 : .42) : len;
        for (const [a, b, lo, hi] of facePanels(railLen, railH, railHoles)) {
          // 主殿・館・遠侍の長押は長い一本材にせず、柱上で継ぐ推定の納まり。
          // 四歩を超える区間だけ柱芯で割り、見込み半分の相欠きで受ける。
          // 開口の切り欠きと隅の納まりは保ち、設営時の木部の束へ結合する。
          const joints = inabaNageshi && b - a > 4
            ? posts.filter(t => t > a + 1 && t < b - 1
              && !holes.some(o => t > o.t0 - .08 && t < o.t1 + .08)).sort((u, v) => u - v)
            : [];
          const yy = y + railY - railH / 2 + (lo + hi) / 2;
          let start = a;
          const lap = .08;
          for (let j = 0; j <= joints.length; j++) {
            const end = j < joints.length ? joints[j] : b;
            const near = start + (j > 0 ? lap / 2 : 0);
            const far = end - (j < joints.length ? lap / 2 : 0);
            // 座敷の外周も間仕切りと同じ板目で納める。横材の長手へ木目を通し、
            // 柱上の継ぎ・窓の切り欠き・釘隠しは元の位置に保つ。
            // 共有の角材と絵を既存の木部へ結合し、描画回数は増やさない。
            if (inabaNageshi) {
              if (face === 'z') exposedTimber((near + far) / 2, yy, sd * (off - .06), far - near, hi - lo, .1, DARK, true);
              else exposedTimber(sd * (off - .06), yy, (near + far) / 2, .1, hi - lo, far - near, DARK);
            } else if (face === 'z') box((near + far) / 2, yy, sd * (off - .06), far - near, hi - lo, .1, DARK);
            else box(sd * (off - .06), yy, (near + far) / 2, .1, hi - lo, far - near, DARK);
            if (j < joints.length) {
              // 柱上の継ぎは黒い線だけで済ませず、見込みを半分ずつ欠いて重ねる。
              // 室内側と壁側の木口をずらし、二ミリの目地を残す推定の納まり。
              // 長押の外寸と釘隠しの位置は保ち、既存の木部の束へ結合する。
              for (const side of [-1, 1]) {
                const center = end + side * .001;
                const offset = sd * (off - .06) + side * .025;
                if (face === 'z') exposedTimber(center, yy, offset,
                  lap - .002, hi - lo, .05, DARK, true);
                else exposedTimber(offset, yy, center,
                  .05, hi - lo, lap - .002, DARK);
              }
            }
            start = end;
          }
        }
        if (inabaFrame && ['goten', 'tamari'].includes(I.kind)) for (const t of posts) {
          // 主殿・館・遠侍の柱筋に釘隠しを納める推定の細工。
          // 開口と隅は避け、長押や柱のない所へ金具だけを浮かせない。
          if (Math.abs(t) > len / 2 - .15
            || k === 0 && face === 'z' && sd === ds && Math.abs(t - I.door.lx) < I.door.w / 2 + .2
            || holes.some(o => t > o.t0 - .08 && t < o.t1 + .08)) continue;
          // 長押の室内側の面へ金具の裏を密着させる。
          // 旧位置は二センチ宙に浮いていたため、長押と金具の厚みから求める。
          // 中央の鋲も金具の表へ接し、柱・戸の溝・当たりは動かさない。
          const capOffset = off - .06 - .1 / 2 - .012 / 2;
          const bossOffset = capOffset - .012 / 2 - .006 / 2;
          const cap = NAGESHI_KANAGU.clone();
          if (face === 'x') cap.rotateY(Math.PI / 2);
          put(cap, face === 'z' ? t : sd * capOffset, y + railY,
            face === 'z' ? sd * capOffset : t, 0x252321);
          // 平板を貼っただけにせず、中央の留め鋲を室内側へ打ち出す推定の細工。
          // 八角金具の形を縮めて共有し、戸の溝より壁側の厚みだけで納める。
          const boss = NAGESHI_KANAGU.clone().scale(.3, .3, .5);
          if (face === 'x') boss.rotateY(Math.PI / 2);
          put(boss, face === 'z' ? t : sd * bossOffset, y + railY,
            face === 'z' ? sd * bossOffset : t, 0x494239);
        }
      }
      } else if (I.profile !== 'moribe') {
      // 比叡山は外壁を組んだ時の柱筋へ合わせる。正面の戸柱は下で別に描く。
      const sharedPosts = lv.wallPosts?.find(v => v.face === face && v.side === sd);
      const posts = sharedPosts ? sharedPosts.positions : [];
      const framed = wins.filter(o => o.face === face && o.s === sd && (!o.shoji || I.templePaper));
      if (!sharedPosts) for (let q = 0; q <= n; q++) {
        const t = -len / 2 + q * len / n;
        // 窓を貫く柱をやめ、開口の外に立つ左右の柱へ置き換える。
        if (framed.some(o => Math.abs(t - o.t) < o.w / 2 + .24)) continue;
        posts.push(t);
      }
      for (const o of framed) {
        if (!sharedPosts) posts.push(o.t - o.w / 2 - .08, o.t + o.w / 2 + .08);
        // 窓台と窓の上枠は開口の外へ納め、光と見通しを塞がない。
        for (const yy of [o.y0 - .05, o.y1 + .05]) {
          if (face === 'z') box(o.t, y + yy, sd * (off - .06), o.w, .1, .14, DARK);
          else box(sd * (off - .06), y + yy, o.t, .14, .1, o.w, DARK);
        }
      }
      for (const t of posts) {
        if (k === 0 && face === 'z' && sd === ds && Math.abs(t - I.door.lx) < I.door.w / 2 + .2) continue;
        // 比叡山の正面は戸柱と同じ奥行きに揃える。通常の柱の室内側の面は
        // 手前の溝を滑る戸へ重なっていた。開口と柱筋は保ち、壁側へ納める。
        const entryFrame = I.profile === 'hieizan' && k === 0 && face === 'z' && sd === ds;
        if (face === 'z') box(t, y + h / 2, sd * (entryFrame ? hd - .22 : off - .06), .16, h, entryFrame ? .1 : .14, DARK);
        else box(sd * (off - .06), y + h / 2, t, .14, h, .16, DARK);
      }
      // 正面の引き戸にも戸柱・鴨居・敷居を付ける。開口内へ柱を出さず、
      // 戸が左右へ滑る長さまで二本の溝を通す。室内の形と同じまとめ描きへ収める。
      if (I.profile === 'hieizan' && k === 0 && face === 'z' && sd === ds) {
        const dh = Math.min(h, I.door.h ?? 2), dw = I.door.w, cx = I.door.lx;
        // 四枚建ては左右二枚ずつ重なるので、引き込み先は片側一枚幅で足りる。
        // 動く戸・戸当たりと同じ枚数から溝の全長を取り、余った横木を残さない。
        // 引き込み先の竪框は溝の端から外へ五センチ出る。
        // 敷居・鴨居もその外面まで延ばし、竪框の上下を宙に浮かせない。
        const leaves = Math.max(2, Math.round(dw / 1.8) * 2), span = dw + 2 * dw / leaves + .1;
        // 戸柱の室内側に二本の溝を通し、外壁へ建具を埋め込まない。
        for (const side of [-1, 1]) {
          const x = cx + side * (dw / 2 + .08);
          box(x, y + h / 2, sd * (hd - .22), .16, h, .1, DARK);
          // 戸柱の背（壁から十七センチ）と内壁の面（十三センチ）を
          // 見込み板でつなぐ。斜めから外壁との隙間が透けないようにする。
          // 開口の外で止め、室内側の二本溝と滑る戸には張り出さない。
          // 焼失前の細部は推定。既存のまとめ描きに含める。
          box(x, y + h / 2, sd * (hd - .15), .16, h, .04, WOOD);
        }
        for (const yy of [.025, dh + .05]) {
          // 正面戸も上框を鴨居の溝へ納め、開閉中に上端の隙間を見せない。
          const upper = yy > 1;
          const trackZ = sd * (hd - HIEI_ENTRY_TRACK);
          if (upper) {
            // 間仕切り・明かり障子と同じく、下面へ深さ八ミリの二本溝を掘る。
            // 黒線を下へ貼っただけの突起を除き、引き込み先まで三本の畝で戸を受ける。
            // 鴨居の上端・戸の高さ・行程は保ち、共通の箱を既存のまとめ描きへ納める。
            box(cx, y + dh + .054, trackZ, span, .092, .18, WOOD);
            for (const [a, b] of [[-.09, -.0445], [-.0355, .0355], [.0445, .09]]) {
              box(cx, y + dh + .004, trackZ + (a + b) / 2, span, .008, b - a, WOOD);
            }
            for (const track of [-.04, .04]) box(cx, y + dh + .0085, trackZ + track, span, .001, .009, DARK);
          } else {
            // 敷居の溝は上面に黒線を貼らず、深さ八ミリの二本溝として掘る。
            // 三本の畝と溝底を同じ床高の内側へ納め、戸の行程・当たりは保つ。
            // 正面の障子・格子戸で共有し、近づいた時のまとめ描きだけに含める。
            box(cx, y + .021, trackZ, span, .042, .18, WOOD);
            for (const [a, b] of [[-.09, -.0445], [-.0355, .0355], [.0445, .09]]) {
              box(cx, y + .046, trackZ + (a + b) / 2, span, .008, b - a, WOOD);
            }
            for (const track of [-.04, .04]) box(cx, y + .0425, trackZ + track, span, .001, .009, DARK);
          }
        }
        // 持ち出した鴨居を壁につなぐ。間仕切りと同じく、つなぎ材の
        // 下面を鴨居上面へ揃え、三センチの食い込みをなくす。
        // 厚みと戸の溝・開口は保ち、小壁の内側へ納める。
        box(cx, y + dh + .13, sd * (hd - HIEI_ENTRY_TRACK / 2), span, .06, HIEI_ENTRY_TRACK + .12, DARK);
        // 上のつなぎ材だけでは、内壁と鴨居の間に高さ七センチの隙間が残る。
        // 戸口上端へ見込み板を納め、小壁の裏側が見える穴を閉じる。
        // 内壁の面と鴨居の背面で止め、二本溝・滑る戸・開口には出さない。
        // 細部は推定。既存の箱と木材のまとめ描きだけで作る。
        const revealFront = .13, revealBack = HIEI_ENTRY_TRACK - .09;
        box(cx, y + dh + .035, sd * (hd - (revealFront + revealBack) / 2),
          dw, .07, revealBack - revealFront, WOOD);
      }
      // 比叡山の内法長押は間仕切りの鴨居の上に高さを揃える。
      // 天井高に比例させて堂の高所へ浮かせず、低い僧坊でも天井内へ収める。
      {
        // 外側にある地覆・腰貫を室内側にも通し、柱脚と壁の腰をつなぐ。
        // 正面は戸口だけでなく、開いた建具と戸当たりの範囲まで空ける。
        // 外壁の穴だけで切ると、引き込み先の地覆・腰貫が戸の下框や腰板を貫く。
        // 既存の壁の当たりの内側へ納め、設営時のまとめ描きだけを足す。
        const railHoles = [...holes];
        if (k === 0 && face === 'z' && sd === ds) {
          // 四枚建ての引き込みは片側一枚幅。二枚建ての幅で貫を切ると、
          // 戸当たりの外にも横木のない隙間が残る。敷居・鴨居と同じ全長で切る。
          const dw = I.door.w, leaves = Math.max(2, Math.round(dw / 1.8) * 2);
          const reach = dw / 2 + dw / leaves + .06;
          railHoles.push({
            t0: I.door.lx - reach, t1: I.door.lx + reach,
            y0: 0, y1: I.door.h ?? Math.min(h - .3, 2),
          });
        }
        for (const [cy, thick] of [[.12, .16], [.72, .1]]) {
          const bottom = cy - thick / 2;
          const cuts = railHoles.map(o => ({ ...o, y0: o.y0 - bottom, y1: o.y1 - bottom }));
          for (const [a, b, low, high] of facePanels(len, thick, cuts)) {
            if (face === 'z') box((a + b) / 2, y + bottom + (low + high) / 2, sd * (off - .09), b - a, high - low, .08, WOOD);
            else box(sd * (off - .09), y + bottom + (low + high) / 2, (a + b) / 2, .08, high - low, b - a, WOOD);
          }
        }
        const base = hieiNageshiHeight(I.kind, h) - .05;
        const cuts = holes.map(o => ({ ...o, y0: o.y0 - base, y1: o.y1 - base }));
        // 正面の戸柱は引き戸の溝を避けて室内側へ寄せてある。
        // 長押も同じ柱面で受け、柱と横木の間に隙間を残さない。
        const nageshiInset = k === 0 && face === 'z' && sd === ds ? .22 : .06;
        // 左右の長押を通し材とし、前後の長押はその内面で止める。
        // 正面は戸柱へ寄せた分だけ端を戻し、隅で同じ面の木を重ねない。
        const frontInset = k === 0 ? .32 : .16;
        const minT = face === 'z' ? -hw + .21 : -hd + (ds < 0 ? frontInset : .16) - .05;
        const maxT = face === 'z' ? hw - .21 : hd - (ds > 0 ? frontInset : .16) + .05;
        for (const [a, b, low, high] of facePanels(len, .1, cuts)) {
          const start = Math.max(a, minT), end = Math.min(b, maxT);
          if (end <= start) continue;
          if (face === 'z') box((start + end) / 2, y + base + (low + high) / 2, sd * (off - nageshiInset), end - start, high - low, .1, DARK);
          else box(sd * (off - .06), y + base + (low + high) / 2, (start + end) / 2, .1, high - low, end - start, DARK);
        }
      }
      } else {
      const moribeFrame = I.profile === 'moribe' && ['yashiki', 'hondo'].includes(I.kind);
      // 頭貫の表裏は柱の内面で止める。柱芯を通すほぞは柱内へ隠れる。
      // 側面の隅柱も正背面で作った一本を使い、同じ柱幅を引く。
      const headPosts = moribeFrame
        ? [[-len / 2 + .09, -len / 2 + .23], [len / 2 - .23, len / 2 - .09]] : null;
      const footPosts = moribeFrame ? headPosts.map(v => v.slice()) : null;
      const post = (t) => {
        if (I.profile === 'moribe' && ['yashiki', 'hondo'].includes(I.kind)
          && Math.abs(Math.abs(t) - len / 2) < .001) {
          // 四隅は二面それぞれの壁端へ柱を置かず、室内の隅に一本を通す。
          // 壁端の二本は互いに離れ、回縁と長押の曲がり角に柱が無くなる。
          // 正背面でだけ作り、左右の壁面・長押の背へ同じ十四センチ角を納める。
          if (face === 'z') box(Math.sign(t) * (hw - .16), y + h / 2,
            sd * (hd - .16), .14, h, .14, DARK);
          return;
        }
        // 森部の側柱は入口・間仕切りの梁の下面で止める。
        // 天井まで通すと柱頭が見せる梁を貫く。外の通し柱はそのまま桁を受ける。
        // 梁の成は上で作る入口（二十四センチ）・間仕切りと同じ位置から求める。
        let postH = h;
        if (I.profile === 'moribe' && ['yashiki', 'hondo'].includes(I.kind) && face === 'x') {
          const entry = lv.layout.rooms[lv.layout.rooms.length - 1];
          if (Math.abs(t - (entry.z0 + entry.z1) / 2) < .001) postH = h - .32;
          else if (lv.layout.portals.some(p => Math.abs(t - p.z) < .001)) postH = h - .28;
        }
        if (headPosts && postH > h - .2) headPosts.push([t - .08, t + .08]);
        if (footPosts) footPosts.push([t - .08, t + .08]);
        if (face === 'z') box(t, y + postH / 2, sd * (off - .06), .16, postH, .14, DARK);
        else box(sd * (off - .06), y + postH / 2, t, .14, postH, .16, DARK);
        if (moribeFrame && face === 'x' && postH < h - .2) {
          // 入口・間仕切りの梁の欠きへ側柱の上ほぞを納める。
          // 梁下面から頭貫の下面まで。既存の梁の範囲内なので内法は保つ。
          const tenonH = h - .2 - postH;
          box(sd * (off - .06), y + postH + tenonH / 2, t,
            .06, tenonH, .08, DARK, false, 1);
        }
        if (I.profile === 'moribe' && ['yashiki', 'hondo'].includes(I.kind)) {
          // 長押の柱への留め付けを、小さな鉄の釘隠しで推定復元する。
          // 内側の長押の表面へ納め、戸や窓の溝には出さない。
          // 箱と鉄色は既存の材質別の束へまとめ、光源や動く部品を増やさない。
          const nailY = y + (I.kind === 'yashiki' ? 2.32 : 2.72);
          const surface = sd * (off - .236);
          // 四隅は長押同士の継ぎ目なので、両面に金具を重ねない。
          if (Math.abs(t) < len / 2 - .33) {
            if (face === 'z') box(t, nailY, surface, .07, .07, .012, 0x252321);
            else box(surface, nailY, t, .012, .07, .07, 0x252321);
          }
        }
      };
      // 森部の入口で見せる梁の両端を受ける。外の礎石付き通し柱と同じ柱筋へ納める。
      const entryRoom = I.profile === 'moribe' && ['yashiki', 'hondo'].includes(I.kind) && face === 'x'
        ? lv.layout.rooms[lv.layout.rooms.length - 1] : null;
      const entryPost = entryRoom ? (entryRoom.z0 + entryRoom.z1) / 2 : null;
      for (let q = 0; q <= n; q++) {
        // 森部の側壁は外の通し柱と同じ柱筋へ納める。等間隔の仮の中柱は作らない。
        // 間仕切りの梁を受ける柱は下で戸口の列から決め、礎石・床下の横木へつなぐ。
        if (entryRoom && q > 0 && q < n) continue;
        const t = -len / 2 + q * len / n;
        if (entryPost !== null && Math.abs(t - entryPost) < .16) continue;
        if (k === 0 && face === 'z' && sd === ds && Math.abs(t - I.door.lx) < I.door.w / 2 + .2) continue;
        // 明かり障子の中央に柱を立てず、窓の両脇へ移す。
        if (I.profile === 'moribe' && wins.some(o => o.face === face && o.s === sd && Math.abs(t - o.t) < o.w / 2 + .16)) continue;
        post(t);
      }
      if (entryRoom) for (const p of lv.layout.portals) post(p.z);
      if (entryPost !== null) post(entryPost);
      if (I.profile === 'moribe' && k === 0 && face === 'z' && sd === ds) {
        // 外の戸脇柱から内側の長押・天井まで木をつなぐ。戸が滑る外側の溝は空ける。
        for (const edge of [-1, 1]) post(I.door.lx + edge * (I.door.w / 2 + .08));
        // 鴨居の内側も柱へ掛け、戸口を見上げた時に小壁の切り口を露出させない。
        // 外の鴨居は壁芯から内側九センチまで。内の鴨居も柱と同じ
        // 十四センチの見込みにし、木口をそこで合わせる。
        // 十八センチのままでは二センチ重なり、上下面がちらつく。
        // 薬師堂と屋敷は外側と同じく戸脇柱の内面で止める。
        // 柱の室内面へ鴨居の側面を重ねず、柱の縦目と横木の木口を分ける。
        const lintelW = ['yashiki', 'hondo'].includes(I.kind) ? I.door.w : I.door.w + .3;
        box(I.door.lx, y + I.door.h + .06, sd * (off - .06), lintelW, .12, .14, DARK);
        // 外壁と同じ中束を内側にも見せ、小壁を鴨居から頭貫へつなぐ。
        // 束の下端は戸の上なので、開閉や出入りの通り道には張り出さない。
        const lintelTop = I.door.h + .12, tieBottom = h - .2;
        if (tieBottom > lintelTop) {
          box(I.door.lx, y + (lintelTop + tieBottom) / 2, sd * (off - .06),
            .12, tieBottom - lintelTop, .12, DARK);
          // 堂と屋敷は下の通しの頭貫で受け、戸口だけの横木を重ねない。
          if (!['yashiki', 'hondo'].includes(I.kind)) box(I.door.lx, y + h - .12, sd * (off - .06), I.door.w + .3, .16, .14, DARK);
        }
      }
      if (I.profile === 'moribe') for (const o of wins) {
        if (o.face !== face || o.s !== sd) continue;
        for (const edge of [-1, 1]) {
          const t = o.t + edge * (o.w / 2 + .08);
          post(t);
          // 明かり障子の敷居・鴨居を窓脇柱へ込栓で留めた推定復元。
          // 柱の室内面に木口だけを見せ、横へ滑る框と溝には出さない。
          // 入口・間仕切り梁と同じ木の色へまとめ、設営時にだけ作る。
          if (o.shoji && o.sliding && ['yashiki', 'hondo'].includes(I.kind)) {
            const surface = sd * (off - .132);
            for (const jointY of [o.y0 - .04, o.y1 + .04]) {
              if (face === 'z') box(t, y + jointY, surface, .025, .025, .006, WOOD);
              else box(surface, y + jointY, t, .006, .025, .025, WOOD);
            }
          }
        }
      }
      if (I.profile === 'moribe' && ['yashiki', 'hondo'].includes(I.kind)) {
        // 室内の柱脚も地覆でつなぐ推定復元。土壁の下端を床板へ直に載せない。
        // 壁の当たりの厚みへ納め、戸口だけは左右へ分けて出入りを塞がない。
        // 正背面の木口へ側面を納め、既存の箱と材質へまとめる。
        const foot = sd * (off - .08);
        // 地覆の見える部分は柱の内面で止め、柱身へのほぞは木の中へ隠す。
        // 一本の横木を柱へ通すと、室内面で縦目と横目が重なってちらつく。
        // 梁下で止まる側柱も柱脚にはあるので、頭貫とは別に全柱を使う。
        // 戸口も除き、分けた材は設営時だけ既存の木目と材質へまとめる。
        if (face === 'z' && k === 0 && sd === ds) footPosts.push([
          I.door.lx - I.door.w / 2, I.door.lx + I.door.w / 2,
        ]);
        footPosts.sort((a, b) => a[0] - b[0]);
        let footEdge = -len / 2 + .23;
        const footEnd = len / 2 - .23;
        const footPiece = (left, right) => {
          if (right - left < .0001) return;
          const center = (left + right) / 2;
          if (face === 'z') box(center, y + .1, foot, right - left, .14, .1, DARK, false, 0);
          else box(foot, y + .1, center, .1, .14, right - left, DARK, false, 2);
        };
        for (const [left, right] of footPosts) {
          footPiece(footEdge, Math.min(left, footEnd));
          footEdge = Math.max(footEdge, right);
        }
        footPiece(footEdge, footEnd);
        // 外の頭貫に対応する横木を室内にも巡らせ、柱頭と天井際をつなぐ推定復元。
        // 戸口だけの短い頭貫はこの通し材へ置き換え、同じ面を重ねて描かない。
        // 正背面の木口へ側面を納め、障子・襖の鴨居と開閉の溝より上に置く。
        // 頭貫の芯は壁芯から十六センチ内側、見込みは十四センチ。
        // 内面は二十三センチなので、側面の木口も地覆と同じ位置で止める。
        // off で引いた十センチを含め、四隅の上下面を重ねてちらつかせない。
        // 通し柱・窓脇柱の表へ頭貫を重ねると、縦目と横目が同じ面でちらつく。
        // 柱を残して見える横木だけ柱間に納める推定復元。梁下で止まる柱は除く。
        // 分けた横木も元の長手へ木目を通し、既存の材質別の形へまとめる。
        headPosts.sort((a, b) => a[0] - b[0]);
        let edge = -len / 2 + (face === 'z' ? .09 : .23);
        const end = len / 2 - (face === 'z' ? .09 : .23);
        const tie = (left, right) => {
          if (right - left < .0001) return;
          const center = (left + right) / 2;
          if (face === 'z') box(center, y + h - .12, sd * (off - .06),
            right - left, .16, .14, DARK, false, 0);
          else box(sd * (off - .06), y + h - .12, center,
            .14, .16, right - left, DARK, false, 2);
        };
        for (const [left, right] of headPosts) {
          tie(edge, Math.min(left, end));
          edge = Math.max(edge, right);
        }
        tie(edge, end);
      }
      // 森部の屋敷は戸の上へ内法長押をそろえ、外の戸口（高さ二・二メートル）を横切らない。
      const nageshiY = I.profile === 'moribe' && I.kind === 'yashiki' ? 2.32
        : I.profile === 'moribe' && I.kind === 'hondo' ? 2.72 : h * .8;
      if (I.profile === 'moribe') {
        // 長押は柱の室内側へ掛ける。従来の位置では柱面より二センチ奥へ埋まる。
        // 柱の内面（off - .13）へ背をそろえ、四隅は正背面の長押へ側面の木口を納める。
        // 正背面は隅柱まで通し、側面の木口を正背面の長押の内面へ突き付ける。
        // off はすでに壁芯から十センチ内側。その分を落とすと側面が十センチ
        // 突き抜け、四隅で木が重なる。長押の背・見込みから止める位置を求める。
        // 三棟とも既存の箱・材質別の束へまとめ、建具の溝と内法は保つ。
        const inner = sd * (off - .18);
        if (face === 'z') {
          box(0, y + nageshiY, inner, len - .26, .1, .1, DARK);
          // 隅柱も長押の留めを見せる。通常の柱の処理では四隅を除いているため、
          // 正背面に一枚だけ釘隠しを納め、側面の継ぎ目へ金具を重ねない。
          // 長押の端からはみ出さず、ほかの釘隠しと同じ箱・鉄色へまとめる。
          for (const side of [-1, 1]) box(side * (hw - .18), y + nageshiY,
            sd * (off - .236), .07, .07, .012, 0x252321);
        } else {
          const end = hd - .1 - .18 - .05;
          box(inner, y + nageshiY, 0, .1, .1, end * 2, DARK);
        }
      } else if (face === 'z') box(0, y + nageshiY, sd * (off - 0.06), len, 0.1, 0.1, DARK);
      else box(sd * (off - 0.06), y + nageshiY, 0, 0.1, 0.1, len, DARK);
      }
      for (const [a, b, low, high] of facePanels(len, .12, holes)) { if (face === 'z') box((a + b) / 2, y + (low + high) / 2, sd * (off - .03), b - a, high - low, .05, DARK); else box(sd * (off - .03), y + (low + high) / 2, (a + b) / 2, .05, high - low, b - a, DARK); }
      } else {
      const n = okeBansho ? okeHutBays(len) : Math.max(2, Math.round(len / 1.9));
      // 長福寺の外周柱は舟肘木の下端へ納める。内陣境と同様、柱→肘木→受け木で支える。
      // 入口の戸脇柱も同じ高さにし、登録する木の当たりとそろえる。
      const postH = I.profile === 'okehazama' && I.kind === 'hondo' ? h - .3 : h;
      for (let q = 0; q <= n; q++) {
        // 桶狭間の隅柱は両壁の柱心を合わせた一本。上の当たりと同じ位置を使う。
        // 堂の舟肘木は二方向とも残して、各面の回縁を受ける。
        const corner = okeWall && (q === 0 || q === n);
        const t = corner ? (q === 0 ? -1 : 1) * (len / 2 - .16)
          : okeBansho ? okeHutPost(len, q) : -len / 2 + q * len / n;
        if (k === 0 && face === 'z' && sd === ds && Math.abs(t - I.door.lx) < I.door.w / 2 + .2) continue;
        if (face === 'z') pillar(t, y + postH / 2, sd * (off - .06), .16, postH, .14, DARK);
        else if (!corner) pillar(sd * (off - .06), y + postH / 2, t, .14, postH, .16, DARK);
        if (okeBansho && q > 0 && q < n) {
          // 詰所・民家の貫を柱へ留める込栓の小口を推定復元。
          // 板壁の途中や隅へ散らさず、実際の柱と貫の交点だけへ納める。
          // 小口は柱面から二ミリだけ出し、既存の柱の当たりと通れる幅を保つ。
          const pegY = (h + .3) * .55 - .18;
          if (!holes.some(v => t + .016 > v.t0 && t - .016 < v.t1
            && pegY + .016 > v.y0 && pegY - .016 < v.y1)) {
            // 込栓も楔・柱と同じ木肌と煤で仕上げる。打ち込み方向へ繊維を通し、
            // 室内に見える小口へ長い板目を貼らない。共通の木の束へまとめる。
            if (face === 'z') smokeBox(hearth, t, y + pegY, sd * (off - .126),
              .032, .032, .012, 0x927352, 'beamZ');
            else smokeBox(hearth, sd * (off - .126), y + pegY, t,
              .012, .032, .032, 0x927352, 'beamX');
            // 貫穴の脇で楔を打ち、柱と貫を締める推定復元。込栓の正面へ重ねない。
            // 下面も貫へ掛け、柱面から四センチ以内に収める。入口・窓の内法は空ける。
            const edge = t + .057, inward = -sd;
            if (!holes.some(v => edge + .018 > v.t0 && edge - .018 < v.t1
              && pegY + .1 > v.y0 && pegY - .04 < v.y1)) {
              if (face === 'z') smokeBox(hearth, edge, y + pegY + .03, sd * (off - .15),
                .032, .14, .04, 0x806044, 'post', 0, 1, { axis: 'z', side: inward });
              else smokeBox(hearth, sd * (off - .15), y + pegY + .03, edge,
                .04, .14, .032, 0x806044, 'post', 0, 1, { axis: 'x', side: inward });
            }
          }
        }
        if (I.profile === 'okehazama' && I.kind === 'hondo') {
          // 堂の柱頭と天井の回縁を舟肘木でつなぐ簡素な推定復元。
          // 隅は片持ちにせず壁の内へ寄せ、戸口の上も開口高より上に収める。
          const ct = Math.max(-len / 2 + .26, Math.min(len / 2 - .26, t));
          const boat = templeBoatGeometry().clone();
          if (face === 'x') boat.rotateY(Math.PI / 2);
          put(boat, face === 'z' ? ct : sd * (off - .1), y + h - .22,
            face === 'z' ? sd * (off - .1) : ct, DARK, false, true);
          if (face === 'z') {
            smokeBox(null, ct, y + h - .12, sd * (off - .1), .6, .08, .24, WOOD, 'beamX');
          } else {
            smokeBox(null, sd * (off - .1), y + h - .12, ct, .24, .08, .6, WOOD, 'beamZ');
          }
        }
      }
      if (I.profile === 'okehazama' && ['bansho', 'minka', 'hondo'].includes(I.kind)) {
        // 間仕切りと同じ内法長押を外周にも回す。堂の高い入口は横木で横切らない。
        // 詰所・民家も鴨居直上の内法長押にそろえ、天井の回縁との間に小壁を残す。
        // furnishLayout の固定襖側・動く襖側と同じ高さ。窓や高い戸口は従来どおり切り欠く。
        const top = okeBansho ? Math.min(h - .2, Math.min(2, h - .2) + .12) : 2.3 + .42, bottom = top - .06;
        const gaps = holes.filter(v => v.y0 < top + .06 && v.y1 > bottom)
          .map(v => ({ t0: v.t0, t1: v.t1, y0: 0, y1: .12 }));
        for (const [a, b] of facePanels(len, .12, gaps)) {
          // 正面・背面の長押を通し、側面はその内側へ木口を突き付ける推定復元。
          // 隅で二本を貫通させず、開口で切った区間も同じ端で納める。
          // 通す材の内面は室内境から二十三センチ（壁心 .1＋寄せ .06＋半厚 .07）。
          // 十三センチで切ると隅で十センチ食い込み、上下の面が重なってちらつく。
          // 既存の箱と材質だけを使い、前後の長押の内面で側面の木口を止める。
          // 長押も柱・梁と同じ木肌の束へ入れ、無地の帯に見せない。
          if (face === 'z') put(nageshiGeometry(b - a).clone(),
            (a + b) / 2, y + top, sd * (off - .06), DARK, false, true);
          else {
            const cornerInset = .1 + .06 + .14 / 2;
            const start = Math.max(a, -len / 2 + cornerInset), end = Math.min(b, len / 2 - cornerInset);
            if (end - start > .001) put(nageshiGeometry(end - start).clone().rotateY(Math.PI / 2),
              sd * (off - .06), y + top, (start + end) / 2, DARK, false, true);
          }
        }
        if (okeBansho || nailCover) {
          // 外周の長押も柱へ留める推定復元。詰所は添え板・鉄釘、堂は内陣と同じ釘隠し。
          // 室内側だけに置き、隅や開口を横切る留めは作らない。
          const joint = t => {
            // 堂の添え板は幅二十二センチ。詰所の幅で調べると、端が開口へ二センチ出る。
            const halfWidth = nailCover ? .11 : .09;
            if (Math.abs(t) + halfWidth > len / 2 || gaps.some(v => t + halfWidth > v.t0 && t - halfWidth < v.t1)) return;
            if (nailCover) {
              // 紙や板壁の途中へ金物を散らさず、柱と長押の交点だけへ納める。
              // 室内側の面へ密着させ、高い入口の切り欠きには置かない。
              // 添え板もここで納め、室内部品側で同じ釘隠しを重ねて作らない。
              // 添え板も長押と同じ横木の木肌で納め、金物だけを鉄色の束へ残す。
              // 寸法と位置は保ち、共有する木の材質へまとめる。
              if (face === 'z') smokeBox(null, t, y + top, sd * (off - .136), .22, .12, .016, 0x493322, 'beamX');
              else smokeBox(null, sd * (off - .136), y + top, t, .016, .12, .22, 0x493322, 'beamZ');
              const plate = nailCover.clone();
              if (face === 'x') plate.rotateY(Math.PI / 2);
              put(plate, face === 'z' ? t : sd * (off - .15), y + top,
                face === 'z' ? sd * (off - .15) : t, 0x34302a);
              if (face === 'z') box(t, y + top, sd * (off - .16), .018, .018, .008, 0x524b3c);
              else box(sd * (off - .16), y + top, t, .008, .018, .018, 0x524b3c);
              return;
            }
            // 詰所・民家の留め木も横へ木目を通す。炉の近くは柱・長押と同じ煤を受ける。
            // 鉄釘へ木目や煤の木材処理を重ねず、既存の形と当たりの内に収める。
            if (face === 'z') {
              smokeBox(hearth, t, y + top, sd * (off - .138), .18, .12, .016, 0x493322, 'beamX');
              box(t, y + top, sd * (off - .15), .028, .028, .008, 0x34302a);
            } else {
              smokeBox(hearth, sd * (off - .138), y + top, t, .016, .12, .18, 0x493322, 'beamZ');
              box(sd * (off - .15), y + top, t, .008, .028, .028, 0x34302a);
            }
          };
          for (let q = 1; q < n; q++) {
            // 詰所・民家は外側の柱割りを共有する。内寸を等分すると留め木が柱心から外れる。
            const t = okeBansho ? okeHutPost(len, q) : -len / 2 + q * len / n;
            if (k === 0 && face === 'z' && sd === ds && Math.abs(t - I.door.lx) < I.door.w / 2 + .2) continue;
            joint(t);
          }
          // 通し長押の両端も隅柱へ留める推定復元。側面はこの材の内側で止まるので、
          // 留めを二重に回さず、前後の面だけへ既存の添え板・釘を納める。
          if (face === 'z') for (const side of [-1, 1]) {
            const t = side * (len / 2 - .16);
            if (k === 0 && sd === ds && Math.abs(t - I.door.lx) < I.door.w / 2 + .2) continue;
            joint(t);
          }
          if (k === 0 && face === 'z' && sd === ds) for (const side of [-1, 1]) joint(I.door.lx + side * (I.door.w / 2 + .08));
          if (face === 'x') for (let j = 0; j + 1 < lv.layout.rooms.length; j++) {
            // 間仕切り端の側柱にも長押の留めを納める。等間隔の柱から外れる所を補い、
            // 近い留めは重ねない。既存の箱・材質へまとめ、戸筋には張り出さない。
            const t = lv.layout.rooms[j].z1;
            const frameLen = okeBansho ? len + .24 : len;
            const nearest = Math.round((t + frameLen / 2) * n / frameLen);
            const columnT = okeBansho ? okeHutPost(len, nearest) : -len / 2 + nearest * len / n;
            if (nearest > 0 && nearest < n && Math.abs(t - columnT) < .2) continue;
            joint(t);
          }
        }
        // 等間隔の柱だけでは戸脇が抜けるため、開口の外に柱を納める。
        if (k === 0 && face === 'z' && sd === ds) for (const side of [-1, 1]) {
          const t = I.door.lx + side * (I.door.w / 2 + .08);
          pillar(t, y + postH / 2, sd * (off - .06), .16, postH, .14, DARK);
          if (okeBansho) {
            // 戸口で切った貫も戸脇柱へ留める。等間隔の柱と同じ込栓を使い、
            // 板戸の外側の溝へ突き出さず、柱の室内面だけに小口を見せる推定復元。
            const pegY = (h + .3) * .55 - .18;
            smokeBox(hearth, t, y + pegY, sd * (off - .126),
              .032, .032, .012, 0x927352, 'beamZ');
            // 戸脇も一般の柱と同じく、貫穴の脇へ楔を打って締める推定復元。
            // 左右とも戸口から離れる側へ納め、板戸の引き手・戸筋と開口を空ける。
            // 既存の箱・木肌・煤を使い、室内の束へまとめる。
            const edge = t + side * .057;
            if (!holes.some(v => edge + .018 > v.t0 && edge - .018 < v.t1
              && pegY + .1 > v.y0 && pegY - .04 < v.y1)) {
              smokeBox(hearth, edge, y + pegY + .03, sd * (off - .15),
                .032, .14, .04, 0x806044, 'post', 0, 1, { axis: 'z', side: -sd });
            }
          }
          if (I.kind === 'hondo') {
            // 長福寺の入口だけ柱頭の受けが抜けていた。周囲と同じ原形を既存の束へ納める推定復元。
            // 鴨居より上で桁へつなぎ、引き戸の二筋と開口の高さは保つ。
            // 周囲の柱頭と同じ木肌へそろえる。舟肘木の原形と天井の材質を共有する。
            put(templeBoatGeometry().clone(), t, y + h - .22, sd * (off - .1), DARK, false, true);
            smokeBox(null, t, y + h - .12, sd * (off - .1), .6, .08, .24, WOOD, 'beamX');
          }
        }
        if (face === 'x') {
          // 襖・障子・内陣格子の鴨居と長押を、板壁だけで受けず側柱へ納める。
          // 細い柱を既存の箱の束へまとめ、戸筋の前後へ張り出させない。
          for (let j = 0; j + 1 < lv.layout.rooms.length; j++) {
            const z = lv.layout.rooms[j].z1;
            // 外周・戸脇と同じ柱頭の高さを使い、舟肘木の中へ柱を突き通さない。
            // 詰所・民家は従来の高さ。堂も柱幅・戸筋・通れる幅は保つ。
            pillar(sd * (hw - .16), y + postH / 2, z, .1, postH, .14, DARK);
            if (I.kind === 'hondo') {
              // 内陣境と明かり障子の端にも、回縁を受ける柱頭を納める推定復元。
              // 等間隔の柱頭と近接する時はそちらで受け、部品を重ねない。
              const regular = -hd + Math.round((z + hd) * n / lv.d) * lv.d / n;
              // 柱頭の受けを省く距離に受け木の全幅を使わない。
              // 障子境の柱まで届かない所は補い、隣の受け木との重なりを幅で避ける。
              const distance = Math.abs(z - regular), span = Math.min(.6, 2 * (distance - .31));
              if (distance >= .5) {
                const boat = templeBoatGeometry().clone();
                boat.scale(Math.min(1, span / .52), 1, 1);
                boat.rotateY(Math.PI / 2);
                // 内陣境・障子境の受け木も長手へ木目を通し、無地の部品を残さない。
                put(boat, sd * (hw - .2), y + h - .22, z, DARK, false, true);
                smokeBox(null, sd * (hw - .2), y + h - .12, z, .24, .08, span, WOOD, 'beamZ');
              }
            }
          }
        }
      } else if (face === 'z') box(0, y + h * 0.8, sd * (off - 0.06), len, 0.1, 0.1, DARK); else box(sd * (off - 0.06), y + h * 0.8, 0, 0.1, 0.1, len, DARK);
      // 桶狭間は部屋ごとの仕上げ高に合わせた地覆を上で作る。
      // 汎用の見切りを重ねると、板間の床際に高さの違う横木が二段に見える。
      if (!okeWall) for (const [a, b, low, high] of facePanels(len, .12, holes)) { if (face === 'z') box((a + b) / 2, y + (low + high) / 2, sd * (off - .03), b - a, high - low, .05, DARK); else box(sd * (off - .03), y + (low + high) / 2, (a + b) / 2, .05, high - low, b - a, DARK); }
      }
    }
    for (const o of wins) {
      const [px, pz] = o.face === 'z' ? [o.t, o.s * (hd - 0.1)] : [o.s * (hw - 0.1), o.t];
      if (o.shoji) {   // 明かり障子：外の光で白く光る紙と、細い桟
        if (o.sliding && I.profile !== 'moribe') {
          winPts.push([px, y + (o.y0 + o.y1) / 2, pz, .7]);
          continue;
        }
        if (I.profile === 'moribe' && o.sliding) {
          // 紙と桟は引き戸側で描く。窓枠に二本の溝を通し、半開きでも紙を重ねて塞がない。
          // 縦の見込み板も外壁から内壁まで通し、開いた窓に土壁の切り口を露出させない。
          // 窓幅の外へ納め、二枚の障子が重なる溝と開口は空ける。
          for (const side of [-1, 1]) {
            const edge = o.t + side * (o.w / 2 + .025);
            if (o.face === 'z') box(edge, y + (o.y0 + o.y1) / 2, pz + o.s * .06, .05, o.y1 - o.y0, .3, DARK);
            else box(px + o.s * .06, y + (o.y0 + o.y1) / 2, edge, .3, o.y1 - o.y0, .05, DARK);
          }
          // 込栓は上の窓脇柱で描く。ここにも置くと同じ仕口に二組でき、
          // こちらの木口は柱面より奥へ埋まる。室内面へ出した一組だけを残す。
          // 明かり障子も間仕切りと同じく、敷居は浅く、鴨居は深く溝を彫る。
          // 黒線を無垢の木へ重ねず、溝底と溝脇を既存の箱・材質へまとめる。
          // 見込みは縦枠とそろえ、二本の溝は動く戸と同じ位置へ通す。
          // 排水欠きで短く分けた端も、敷居・鴨居の一本の木として長手へ木目を通す。
          // 寸法任せでは短い端だけ見込み方向へ繊維が変わり、継ぎ木に見えてしまう。
          const railGrain = o.face === 'z' ? 0 : 2;
          const railBox = (across, yy, width, height, depth, color = DARK) => {
            if (o.face === 'z') box(px, yy, pz + across, width, height, depth, color, false, railGrain);
            else box(px + across, yy, pz, depth, height, width, color, false, railGrain);
          };
          const z0 = o.s * .06 - .15, z1 = o.s * .06 + .15;
          for (const head of [false, true]) {
            const bottom = y + (head ? o.y1 : o.y0 - .08);
            const depth = head ? .03 : .008;
            railBox((z0 + z1) / 2, bottom + (head ? depth : 0) + (.08 - depth) / 2,
              o.w + .2, .08 - depth, .3);
            const lipY = bottom + (head ? depth / 2 : .08 - depth / 2);
            // 雨中の窓も二本の溝から外へ水を逃がす推定復元。
            // 縦枠の内側で溝間と外縁だけを欠き、室内側の縁は残す。
            // 左右の壁で外向きを反転し、鴨居と障子の軌道は変えない。
            const half = (o.w + .2) / 2, drain = o.w / 2 - .04;
            const lip = (back, front) => {
              if (front <= back) return;
              const outward = o.s > 0 ? back >= -.008 - .0001 : front <= .008 + .0001;
              const spans = !head && outward
                ? [[-half, -drain - .012], [-drain + .012, drain - .012], [drain + .012, half]]
                : [[-half, half]];
              for (const [left, right] of spans) {
                const along = (left + right) / 2, across = (back + front) / 2;
                if (o.face === 'z') box(px + along, lipY, pz + across, right - left, depth, front - back, DARK, false, railGrain);
                else box(px + across, lipY, pz + along, front - back, depth, right - left, DARK, false, railGrain);
              }
            };
            let edge = z0;
            for (const track of [-.04, .04]) {
              const left = track - .032, right = track + .032;
              lip(edge, left);
              railBox(track, bottom + (head ? depth - .0005 : .08 - depth + .0005),
                o.w + .2, .001, .064, 0x1e140e);
              edge = right;
            }
            lip(edge, z1);
          }
          // 戸板を別に描いても、紙を透かす窓明かりは床・柱・天井へ焼き込む。
          // 設営時だけ既存の焼き込みへ渡し、毎コマの光源は増やさない。
          winPts.push([px, y + (o.y0 + o.y1) / 2, pz, .7]);
          continue;
        }
        if (paperWindows) {
          // 紙と桟を別の形にし、裏の灯明を暖かい透けとして紙に残す。
          const ph = o.y1 - o.y0, py = y + (o.y0 + o.y1) / 2;
          // 両端の戸当たりの外面まで上下の横木を通し、五センチ幅の竪框を受ける。
          const span = o.w * 2 + .1;
          const track = o.s * ((o.face === 'z' ? hd : hw) - HIEI_ENTRY_TRACK);
          const windowTimber = (t, yy, width, height, depth = .18, offset = track) => {
            if (o.face === 'z') box(px + t, yy, offset, width, height, depth, DARK);
            else box(offset, yy, pz + t, depth, height, width, DARK);
          };
          // 窓の敷居・鴨居も黒線を框へ重ねず、三本の畝で深さ八ミリの二本溝を作る。
          // 上下とも戸の高さの外へ掘り、開口・引き込み先・四センチの枠厚は保つ。
          // 正面戸と同じく既存の箱をまとめ描きし、開閉中の処理は増やさない。
          for (const [edge, direction] of [[y + o.y0, -1], [y + o.y1, 1]]) {
            windowTimber(0, edge + direction * .024, span, .032);
            for (const [a, b] of [[-.09, -.046], [-.034, .034], [.046, .09]]) {
              windowTimber(0, edge + direction * .004, span, .008,
                b - a, track + (a + b) / 2);
            }
            for (const groove of [-.04, .04]) windowTimber(0,
              edge + direction * .0075, span, .001, .012, track + groove);
          }
          // 持ち出した窓の敷居・鴨居を窓台と上枠へつなぎ、溝だけを宙に浮かせない。
          // 建具の下端より下・上端より上に納め、横へ滑る二枚の障子を空ける。
          // 柱側へ戻す板も既存のまとめ描きに含め、開閉中の処理は増やさない。
          const wallOffset = o.s * ((o.face === 'z' ? hd : hw) - .16);
          const returnDepth = Math.abs(wallOffset - track) + .14;
          for (const yy of [y + o.y0 - .05, y + o.y1 + .06]) {
            windowTimber(0, yy, span, .04, returnDepth, (wallOffset + track) / 2);
          }
          if (I.profile === 'moribe') {
            // 細い組子だけで窓を受けず、上下の敷居・鴨居を両脇の柱へ渡す。
            for (const yy of [y + o.y0 - .04, y + o.y1 + .04]) {
              if (o.face === 'z') box(px, yy, pz, o.w + .2, .08, .14, DARK);
              else box(px, yy, pz, .14, .08, o.w + .2, DARK);
            }
          }
          continue;
        }
        const [wx, wz] = I.P(px, pz);
        const bought = naibu && addNaibu(naibu, 'slide_door_c', wx, y + o.y0, wz, o.w, o.y1 - o.y0, .055, I.rot + (o.face === 'x' ? Math.PI / 2 : 0));
        if (!bought) {
          if (o.face === 'z') box(px, y + (o.y0 + o.y1) / 2, pz - o.s * 0.05, o.w, o.y1 - o.y0, 0.02, 0xd8d0b8, true); else box(px - o.s * 0.05, y + (o.y0 + o.y1) / 2, pz, 0.02, o.y1 - o.y0, o.w, 0xd8d0b8, true);
          for (let q = 1; q < 4; q++) { const t = -o.w / 2 + q * o.w / 4; if (o.face === 'z') box(px + t, y + (o.y0 + o.y1) / 2, pz - o.s * 0.07, 0.025, o.y1 - o.y0, 0.02, DARK); else box(px - o.s * 0.07, y + (o.y0 + o.y1) / 2, pz + t, 0.02, o.y1 - o.y0, 0.025, DARK); }
        }
      } else if (I.profile === 'okehazama' && o.grilleOffset != null && !I.open) {
        // 外の格子だけでは内張りの切り口が露出する。窓台・上框・脇枠で壁厚を納める推定復元。
        // 開口の外側へ木を置き、既存の格子と壁の当たり・見通せる幅は保つ。
        // 内張りの表から外の格子までつなぎ、格子そのものは二重に描かない。
        // 窓台・上框は横、脇枠・束は縦へ木目を通す。柱・梁と同じ木肌の束へまとめる。
        okeWindowFrame(o, hw, hd, h, (x, yy, z, w, h, d, grain) =>
          smokeBox(hearth, x, y + yy, z, w, h, d, DARK, grain));
      } else if (o.grilleOffset == null) {
        // 格子（縦の木。間から外が見える）と、窓の下の敷居
      if (I.profile === 'inabayama') {
        if (!I.open && !o.exteriorLattice) for (let q = -1; q <= 1; q++) { const t = q * o.w * 0.3; if (o.face === 'z') box(px + t, y + (o.y0 + o.y1) / 2, pz, 0.05, o.y1 - o.y0, 0.05, DARK); else box(px, y + (o.y0 + o.y1) / 2, pz + t, 0.05, o.y1 - o.y0, 0.05, DARK); }
        if (o.exteriorLattice && o.face === 'z') {
          // 連子は外側の一組を共有し、内外の壁の間を窓枠で包む。
          // 開口の中へ二重の格子を立てず、壁の厚みから外が見えるようにする。
          // 内壁の窓枠から外の連子まで見込みを通し、格子を宙に浮かせない。
          // 外側の格子の位置は当たりと共有し、内側の枠端は従来のまま保つ。
          const frameOuter = I.profile === 'inabayama' && S.quality === 'high' && o.latticeOffset != null
            ? o.latticeOffset + .15 : .37;
          const frameD = frameOuter + .07;
          const frameZ = pz + o.s * (frameOuter - .07) / 2;
          for (const yy of [o.y0 - .03, o.y1 + .03])
            box(px, y + yy, frameZ, o.w + .12, .06, frameD, DARK);
          for (const t of [-o.w / 2 - .03, o.w / 2 + .03])
            box(px + t, y + (o.y0 + o.y1) / 2, frameZ, .06, o.y1 - o.y0, frameD, DARK);
          if (o.shutter) {
            // 内戸の二本の溝を窓台と上枠に刻む。戸は柱間で重ね、壁の外へ引き出さない。
            // 動く板戸と同じ前後四センチの芯を使い、共通の木部へ設営時だけまとめる。
            for (const track of [-.04, .04]) for (const yy of [o.y0 - .003, o.y1 + .003])
              box(px, y + yy, pz + track, o.w, .004, .064, 0x211b15);
          }
        }
        if (o.face === 'z') box(px, y + o.y0 - 0.03, pz - o.s * 0.05, o.w + 0.2, 0.06, 0.16, DARK); else box(px - o.s * 0.05, y + o.y0 - 0.03, pz, 0.16, 0.06, o.w + 0.2, DARK);
      } else {
        const hieiGrid = hieiWindowBars(I, o, (t, cy, w, h) => {
          if (o.face === 'z') box(t, y + cy, pz, w, h, .04, DARK);
          else box(px, y + cy, t, .04, h, w, DARK);
        }, true);
        if (!hieiGrid && !I.open) for (let q = -1; q <= 1; q++) { const t = q * o.w * 0.3; if (o.face === 'z') box(px + t, y + (o.y0 + o.y1) / 2, pz, 0.05, o.y1 - o.y0, 0.05, DARK); else box(px, y + (o.y0 + o.y1) / 2, pz + t, 0.05, o.y1 - o.y0, 0.05, DARK); }
        // 比叡山の堂は上の framed と共通の柱筋で窓台・上枠・縦枠を作っている。
        // ここでも額縁を重ねると、室内側の面（壁芯から二十三センチ）が一致して
        // ちらつく。格子の框は残し、外壁ともつながる一組の窓枠で受ける。
        if (!hieiGrid) {
          if (o.face === 'z') box(px, y + o.y0 - 0.03, pz - o.s * 0.05, o.w + 0.2, 0.06, 0.16, DARK); else box(px - o.s * 0.05, y + o.y0 - 0.03, pz, 0.16, 0.06, o.w + 0.2, DARK);
        }
      }
      }
      winPts.push([px, y + (o.y0 + o.y1) / 2, pz, o.shoji ? 0.7 : 1]);
    }
    // 窓からの光の筋（一つの階に三つまで）
    let ns = 0;
    for (const o of wins) {
      if (ns >= 3 || o.shoji || o.shutter || I.open) continue;
      ns++;
      const len2 = Math.min(3.2, (o.y0 + o.y1) / 2 + 1.2), g = new THREE.PlaneGeometry(o.w * 0.9, len2);
      // 窓から内へ、下り気味に差し込む板
      g.translate(0, -len2 / 2, 0); g.rotateX(-0.75);
      if (o.face === 'x') g.rotateY(-o.s * Math.PI / 2); else if (o.s > 0) g.rotateY(Math.PI);
      const [px, pz] = o.face === 'z' ? [o.t, o.s * (hd - 0.12)] : [o.s * (hw - 0.12), o.t];
      g.translate(px, y + (o.y0 + o.y1) / 2, pz); g.rotateY(I.rot); g.translate(I.x, 0, I.z);
      const sh = new THREE.Mesh(g, M.shaft); sh.renderOrder = 3; grp.add(sh);
    }
    // 急な箱階段。狭い階は踊り場で折り返す。
    if (upSt) {
      for (const run of upSt.runs) {
        const L = Math.abs(run.bx - run.ax), sign = Math.sign(run.bx - run.ax);
        const [sx, sz] = I.P((run.ax + run.bx) / 2, run.az);
        const bought = naibu && addNaibuStairs(naibu, sx, run.ya, sz, L, run.yb - run.ya, upSt.w, I.rot + (sign < 0 ? Math.PI : 0));
        const rise = run.yb - run.ya, n = Math.max(4, Math.round(rise / .3));
        if (!bought) for (let q = 0; q < n; q++) box(run.ax + sign * (q + .5) * L / n, run.ya + (q + 1) * rise / n - .03, run.az, L / n + .06, .06, upSt.w, WOOD);
        if (!bought) for (const e of [-1, 1]) {
          const g = new THREE.BoxGeometry(Math.hypot(rise, L), .26, .06); g.rotateZ(Math.atan2(rise, L) * sign);
          put(g, (run.ax + run.bx) / 2, run.ya + rise / 2 - .05, run.az + e * upSt.w / 2, DARK);
        }
      }
      if (upSt.fold) box(upSt.L / 2, (upSt.y0 + upSt.y1) / 2 - .06, (upSt.lz + upSt.headZ) / 2, 1, .12, 1.9, WOOD);
    }
    if (I.profile === 'okehazama') {
      for (const lamp of lv.layout.props) {
        if (lamp.part !== 'tomyodai') continue;
        const lx = lamp.x + Math.sin(lamp.rot || 0) * .09;
        const lz = lamp.z + Math.cos(lamp.rot || 0) * .09;
        const ly = y + (lamp.y || 0) + .9375;
        box(lx, ly, lz, .04, .05, .04, 0xffd49a, true);
        lamps.push([lx, ly, lz]);
      }
    } else if (I.profile === 'inabayama') {
    // 灯明。中は暗いので一つの階に一つか二つ
    const ln = goten || lv.w > 6 ? 2 : 1;
    // 稲葉山は用屋も灯明台を調度と重ねず、引き戸の引き先も空ける。
    // 小祠では神前の格子戸、小さな板倉では玄関の板戸の溝へ元の壁際の台が掛かる。
    // 番所と長屋も板戸・武具・寝具を避け、置き直した先の板床の高さを使う。
    // 戸が通る全幅を仮の壁として、既存の家具・床穴を避ける処理へ渡す。
    // 室内を組む時だけ作り、実際の当たりや兵の通路には追加しない。
    const lampSpots = [];
    const lampLevel = S.quality === 'high' && I.profile === 'inabayama' && ['goten', 'tamari', 'hondo', 'shrine', 'kura', 'bansho', 'nagaya'].includes(I.kind) ? {
      ...lv, layout: { ...lv.layout, walls: lv.layout.walls.concat(
        (I.doors || []).filter(d => d.lv === lv).map(d => ({
          ax: d.lx - d.W * (d.window ? .5 : 1),
          bx: d.lx + d.W * (d.window ? .5 : 1),
          az: d.lz + d.trackZ, bz: d.lz + d.trackZ,
        }))) },
    } : null;
    for (let q = 0; q < ln; q++) {
      
      const sgS = upSt ? upSt.sg : -ds;
      let lx = (q === 0 ? 1 : -1) * (hw - 0.6), lz = -sgS * (hd - 0.6) * (q === 0 ? 1 : 0.2);
      // 小祠は供物台の左右を先に選び、拝所側の格子戸の溝から離す。
      if (lampLevel && I.kind === 'shrine') lz = -ds * (hd - .6) * .5;
      if (lampLevel) {
        const spot = { x: lx, z: lz };
        if (!interiorSafeSpot(lampLevel, lx, lz, spot, null, lampSpots)) continue;
        lx = spot.x; lz = spot.z; lampSpots.push(spot);
      }
      // 稲葉山の上げ床では灯明台の脚も板間・上段の床高へ揃える。
      // 室内を組む時だけ調べ、灯りの形と光点を同じ高さへ移す。
      const lampRoom = S.quality === 'high' && I.profile === 'inabayama'
        ? lv.layout.rooms.find(r => lx >= r.x0 && lx <= r.x1 && lz >= r.z0 && lz <= r.z1) : null;
      const lampY = y + (lampRoom?.y || 0);
      const [lampX, lampZ] = I.P(lx, lz);
      const oilLamp = S.quality === 'high' && I.profile === 'inabayama';
      const flameY = lampY + (oilLamp ? .91 : 1.08);
      if (oilLamp) {
        // 紙の角箱で覆わず、脚付きの灯明台に油皿と灯芯を載せる推定のしつらえ。
        // 新しい光源は増やさず、火・光点・床の明かりを同じ台に揃える。
        box(lx, lampY + .03, lz, .3, .06, .3, DARK);
        box(lx, lampY + .42, lz, .05, .78, .05, WOOD);
        put(OIL_DISH.clone().scale(.13, .045, .13), lx, lampY + .825, lz, 0x9b8057);
        put(OIL_DISH.clone().scale(.105, .006, .105), lx, lampY + .85, lz, 0x49351e);
        box(lx + .065, lampY + .86, lz, .04, .012, .012, 0x30251a);
        put(OIL_FLAME.clone().scale(.022, .065, .022), lx + .08, flameY, lz, 0xffd49a, true);
      } else if (!naibu || !addNaibu(naibu, 'japanese_lamp_emissive', lampX, lampY, lampZ, .32, 1.26, .32, I.rot)) {
        box(lx, lampY + 0.45, lz, 0.05, 0.9, 0.05, DARK); box(lx, lampY + 0.03, lz, 0.3, 0.06, 0.3, DARK);
        box(lx, lampY + 1.08, lz, 0.26, 0.36, 0.26, 0xffd49a, true);
      }
      lamps.push([lx + (oilLamp ? .08 : 0), flameY, lz]);
      if (lampRoom) {
        // 灯明台の真下へ床の明かりを納め、畳や内陣の上げ床へ埋めない。
        // 共通の形と材質を使い、室内を組む時だけ置く。
        const pool = lightPool();
        pool.position.set(lampX, lampY + .015, lampZ);
        grp.add(pool);
      }
      const [wx, wz] = I.P(lx + (oilLamp ? .08 : 0), lz), sp = new THREE.Sprite(M.glow); sp.position.set(wx, flameY, wz); sp.scale.setScalar(I.lampGlowScale ?? 0.8); sp.renderOrder = 4; grp.add(sp);
      I.glows.push(sp);
    }
    } else {
    // 灯明（台と火袋）。中は暗いので一つの階に一つか二つ
    const moribeHall = I.profile === 'moribe' && I.kind === 'hondo';
    // 在所の屋敷も油皿と灯芯で推定復元する。二灯はまとめた形・材質を共用する。
    const moribeHouse = I.profile === 'moribe' && I.kind === 'yashiki';
    const oilLamp = moribeHouse ? batchInterior(tomyo(true)) : null;
    const ln = lv.oilLamps?.length ?? (goten || lv.w > 6 ? 2 : 1);
    for (let q = 0; q < ln; q++) {
      const oil = lv.oilLamps?.[q];
      const sgS = upSt ? upSt.sg : -ds;
      const lx = oil?.x ?? (q === 0 ? 1 : -1) * (hw - .6);
      // 屋敷は各座敷の前寄りへ一灯ずつ。奥の収納箱と取次の襖の軌道から離す。
      // 部屋の境から五十センチ戻し、灯台の台座を敷居や横滑りする戸へ重ねない。
      const lz = oil?.z ?? -sgS * (hd - 0.6) * (q === 0 ? 1 : 0.2);
      // 座敷の灯台は畳の上へ載せ、台座を畳の中へ埋めない。
      const lampY = oil?.y ?? y;
      const flameY = oil?.flameY ?? lampY + (moribeHall || moribeHouse ? .9 : 1.08);
      const [lampX, lampZ] = I.P(lx, lz);
      if (oilLamp) {
        const lamp = oilLamp.clone(); lamp.position.set(lampX, lampY, lampZ); lamp.rotation.y = I.rot; grp.add(lamp);
      }
      // 森部の堂は共通部品で置いた灯明に光を合わせ、入口へ別の灯台を重ねない。
      if (!moribeHall && !moribeHouse && (!naibu || !addNaibu(naibu, 'japanese_lamp_emissive', lampX, y, lampZ, .32, 1.26, .32, I.rot))) {
        box(lx, y + 0.45, lz, 0.05, 0.9, 0.05, DARK); box(lx, y + 0.03, lz, 0.3, 0.06, 0.3, DARK);
        box(lx, y + 1.08, lz, 0.26, 0.36, 0.26, 0xffd49a, true);
      }
      lamps.push([lx, flameY, lz]);
      const [wx, wz] = I.P(lx, lz), sp = new THREE.Sprite(M.glow); sp.position.set(wx, flameY, wz); sp.scale.setScalar(I.lampGlowScale ?? 0.8); sp.renderOrder = 4; grp.add(sp);
      I.glows.push(sp);
    }
    }
    // 森部の堂・在所は専用の須弥壇・座卓・木櫃でしつらえる。
    // 共通の槍掛けと旗を足すと、本尊の背板や座敷の調度へ重なる。
    // 武具：槍掛けに数本（天守・櫓）。御殿の奥の間は一段高い上段
    if (!goten && !['hieizan', 'moribe', 'okehazama'].includes(I.profile) && lv.w > 2.5) {
      const sz = upSt ? -upSt.sg : -ds;
      box(0, y + Math.min(1.9, h - .4), sz * (hd - 0.22), Math.min(1.8, lv.w * 0.5), 0.06, 0.08, DARK);
      for (let q = -1; q <= 1; q++) { const ph = Math.min(2.65, h - .3), g = new THREE.CylinderGeometry(.022, .022, ph, 5); g.rotateX(sz * .12); put(g, q * .4, y + ph / 2, sz * (hd - .3), 0x2c2016); box(q * .4, y + ph - .1, sz * (hd - .13), .04, .2, .03, 0x9a9a9e); }
      box(hw - .35, y + h * .45, 0, .035, h * .85, .035, DARK);
      box(hw - .55, y + h * .6, .02, .4, h * .4, .025, 0x9c8d66);
    }
    // 稲葉山の高画質は furnishLayout が上段の床組み・畳・框を同じ床高で作る。
    // 旧来の一枚板を重ねると畳面と同じ高さになり、畳縁や目地を覆ってちらつく。
    if (I.kind === 'goten' && I.okuZ != null && lv.layout.rooms[0].raised !== false
      && !(S.quality === 'high' && I.profile === 'inabayama')) {
      const backD = lv.d * I.oku, bz = -ds * (hd - backD / 2);
      box(0, y + 0.08, bz - ds * 0.1, lv.w - 0.3, 0.16, backD - 0.4, 0x8a8050);
    }
  }
  // 光を頂点の色に焼き込む：暗い地に、灯明の暖かい明かりと窓の明かり
  for (const g of new Set([...list, ...timbers, ...plaster, ...ceilingWood])) {
    if (g.userData.emit) continue;
    const P = g.attributes.position, C = g.attributes.color;
    for (let i = 0; i < P.count; i++) {
      const wx = P.getX(i), wy = P.getY(i), wz = P.getZ(i);
      const dx0 = wx - I.x, dz0 = wz - I.z, lx = dx0 * I.c - dz0 * I.s, lz = dx0 * I.s + dz0 * I.c;
      let r = 0.4, gg = 0.37, b = 0.35;
      for (const [ax, ay, az] of lamps) { const d = Math.hypot(lx - ax, wy - ay, lz - az), f = Math.max(0, 1 - d / 4.2); r += f * f * 1.15; gg += f * f * 0.8; b += f * f * 0.42; }
      for (const [ax, ay, az, k2] of winPts) { const d = Math.hypot(lx - ax, wy - ay, lz - az), f = Math.max(0, 1 - d / 3.2); r += f * f * 0.6 * k2; gg += f * f * 0.6 * k2; b += f * f * 0.6 * k2; }
      C.setXYZ(i, Math.min(1, C.getX(i) * r * 1.3), Math.min(1, C.getY(i) * gg * 1.3), Math.min(1, C.getZ(i) * b * 1.3));
    }
  }
  // 買った素材（cgt.js）：板の間の床板・武器の棚を足す（畳と柱は共通部品）（読めていれば。形・当たり・光の焼き込みは変えない。暗い室内に合わせて絵を暗くする）
  // 森部の板間は furnishLayout の木目付きの板を使う。
  // 購入床を重ねると板の目地と根太上の継ぎ目が隠れるため、二重に張らない。
  if (!['yagura', 'moribe', 'okehazama'].includes(I.profile) && cgtOn() && cgtHas('Floor_Boards')) {
    const kb = new KitBatch();
    for (let k = 0; k < Ls.length; k++) {
      const lv = Ls[k];
      if (I.profile === 'inabayama') {
      // 高画質の稲葉山は furnishLayout が床板・目地・釘・框を床高に揃えて組む。
      // その上へ別の床素材を載せると木口や框が隠れ、敷居より床が浮いて見える。
      // 作り込んだ板床をそのまま使い、重複する面と描画を増やさない。
      const boardPieces = S.quality === 'high' && I.profile === 'inabayama'
        ? []
        : lv.pieces;
      for (const [x0, x1, z0, z1, rise = 0] of boardPieces) {
        const nx = Math.max(1, Math.round((x1 - x0) / 2)), nz = Math.max(1, Math.round((z1 - z0) / 2)), cw = (x1 - x0) / nx, cd = (z1 - z0) / nz;
        for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
          const [wx, wz] = I.P(x0 + i * cw, z1 - j * cd);
          const floor = interiorFloorAt(lv.layout, x0 + (i + .5) * cw, z1 - (j + .5) * cd);
          if (floor === 'earth' || floor === 'tatami') continue; // 畳と土間は共通部品で敷いてある
          kb.add('Floor_Boards', wx, lv.y + rise + 0.006, wz, I.rot, cw / 2, 0.12, cd / 2);
        }
      }
      } else {
      // 森部は畳寄せ・地覆と敷居の木口で床板を切る。
      // 共通部品の板間と同じ余白を取り、戸の二本の溝へ板を重ねない。
      const boardPieces = I.profile === 'moribe' ? lv.pieces.flatMap(([x0, x1, z0, z1]) => lv.layout.rooms
        .filter(r => r.floor === 'boards')
        .map(r => {
          const rearSill = lv.layout.portals.some(p => Math.abs(p.z - r.z0) < .001);
          const frontSill = lv.layout.portals.some(p => Math.abs(p.z - r.z1) < .001);
          return [Math.max(x0, r.x0 + .23), Math.min(x1, r.x1 - .23),
            Math.max(z0, r.z0 + (rearSill ? .27 : .23)), Math.min(z1, r.z1 - (frontSill ? .115 : .1))];
        })
        .filter(([a, b, c, d]) => b > a && d > c)) : lv.pieces;
      for (const [x0, x1, z0, z1] of boardPieces) {
        const nx = Math.max(1, Math.round((x1 - x0) / 2)), nz = Math.max(1, Math.round((z1 - z0) / 2)), cw = (x1 - x0) / nx, cd = (z1 - z0) / nz;
        // 森部の購入床も長い板を根太の上で継ぐ。床下の根太割りは b_moribe.js と共通。
        // 隣の列では根太一本分ずらし、等分した継ぎ目を根太の間へ落とさない。
        const moribe = I.profile === 'moribe', joistStep = lv.d / Math.ceil(lv.d / .45);
        const ends = [];
        for (let i = 0; i < nx; i++) {
          ends.length = 0; ends.push(z1);
          if (moribe) {
            if (z1 - z0 > 2.4) {
              const joint = -lv.d / 2 + Math.round(((z0 + z1) / 2 + (i % 2 ? joistStep : 0) + lv.d / 2) / joistStep) * joistStep;
              if (joint > z0 + .3 && joint < z1 - .3) ends.push(joint);
            }
          } else for (let j = 1; j < nz; j++) ends.push(z1 - j * cd);
          ends.push(z0);
          for (let j = 0; j < ends.length - 1; j++) {
            const front = ends[j], back = ends[j + 1], depth = front - back;
            const [wx, wz] = I.P(x0 + i * cw, front);
            const floor = interiorFloorAt(lv.layout, x0 + (i + .5) * cw, (front + back) / 2);
            if (floor === 'earth' || floor === 'tatami') continue; // 畳と土間は共通部品で敷いてある
            kb.add('Floor_Boards', wx, lv.y + 0.006, wz, I.rot, cw / 2, 0.12, depth / 2);
          }
        }
      }
      }
      // 比叡山の堂・僧坊は間取りの調度だけを使う。汎用の武具棚は
      // 戸口や引き戸の引き込み先を確かめずに置かれるため、追加しない。
      if (I.profile !== 'hieizan' && !goten && Ls[k].w > 4) {
        const sg = (I.stairs[k] ? -I.stairs[k].sg : ds) > 0 ? -1 : 1, hdk = lv.d / 2;   // 槍掛けの反対の壁
        const [wx, wz] = I.P(sg > 0 ? -1.0 : 1.0, sg * (hdk - 0.2));
        kb.add('Rack_Weapons', wx, lv.y, wz, I.rot + (sg > 0 ? 0 : Math.PI), 1, 1, 1);
      }
    }
    if (kb.n) grp.add(kb.build({ basic: true, tint: 0.55, shadow: false, camBlock: false }));
  }
  if (paper.length) {
    // 一つの堂につき一束。光源を増やさず、桟は不透明、紙だけやわらかく光らせる。
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const glow = ctx.createRadialGradient(32, 38, 4, 32, 38, 44);
    glow.addColorStop(0, '#fff0c9'); glow.addColorStop(1, '#a99c7f');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, 64, 64);
    const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshStandardMaterial({ map, color: 0xe8dabc, emissive: 0xe6ac62, emissiveMap: map, emissiveIntensity: .45, transparent: true, opacity: .84, roughness: 1, side: THREE.DoubleSide });
    grp.add(new THREE.Mesh(mergeGeometries(paper), mat));
  }
  if (naibu && naibu.n) grp.add(naibu.build({ basic: true, tint: .65, shadow: false, camBlock: false }));
  if (ceilingWood.length) {
    const key = I.profile === 'okehazama' ? 'okeCeilingWood' : 'ceilingWood';
    if (!M[key]) {
      const map = I.profile === 'okehazama' ? interiorWoodTexture() : inabaBoardTexture().clone();
      if (I.profile !== 'okehazama') { map.wrapS = map.wrapT = THREE.RepeatWrapping; map.needsUpdate = true; }
      M[key] = new THREE.MeshBasicMaterial({ vertexColors: true, map });
    }
    const wood = new THREE.Mesh(mergeGeometries(ceilingWood), M[key]);
    wood.matrixAutoUpdate = false; grp.add(wood);
  }
  // 木目付きの天井板・柱・梁・長押を一束にする。灯明と窓の焼き込みも共通にする。
  const wood = list.filter(g => g.userData.ceilingWood);
  if (wood.length) {
    const ceiling = new THREE.Mesh(mergeGeometries(wood), ceilingWoodMaterial());
    ceiling.matrixAutoUpdate = false; grp.add(ceiling);
  }
  // 土壁は一棟一束。形・頂点数は増やさず、柱・建具・床へ土の絵を掛けない。
  const earth = list.filter(g => g.userData.earthenWall);
  if (earth.length) {
    const wall = new THREE.Mesh(mergeGeometries(earth), earthenWallMaterial());
    wall.matrixAutoUpdate = false; grp.add(wall);
  }
  const textured = new Set(ceilingWood);
  if (floorBoardShape) floorBoardShape.dispose();
  if (interiorBox) interiorBox.dispose();
  if (nailCover) nailCover.dispose();
  const m = new THREE.Mesh(mergeGeometries(list.filter(g => !textured.has(g) && !g.userData.ceilingWood && !g.userData.earthenWall)), I.profile === 'hieizan' ? M.hieiBase : M.base);
  m.matrixAutoUpdate = false;
  grp.add(m);
  if (plaster.length) {
    // 塗り肌の絵と材質は堂を建て直しても共有し、光源は増やさない。
    M.plaster ||= new THREE.MeshBasicMaterial({ vertexColors: true, map: interiorPlasterTexture() });
    const wall = new THREE.Mesh(mergeGeometries(plaster), M.plaster);
    wall.matrixAutoUpdate = false; grp.add(wall);
  }
  if (timbers.length) {
    M.hieiTimber ||= new THREE.MeshStandardMaterial({ vertexColors: true, map: woodTex(), bumpMap: woodTex(), bumpScale: .015, roughness: 1, metalness: 0, emissive: 0x514c41, emissiveIntensity: .16 });
    const timber = new THREE.Mesh(mergeGeometries(timbers), M.hieiTimber);
    timber.matrixAutoUpdate = false;
    grp.add(timber);
    for (const g of timbers) g.dispose();
  }
  grp.userData.naka = I.id; grp.userData.noMerge = true;
  buildNakaDoorMeshes(I, grp);
  if (rt.world.def.interiorMaterial) grp.traverse(o => {
    if (o.isMesh) o.material = Array.isArray(o.material) ? o.material.map(rt.world.def.interiorMaterial) : rt.world.def.interiorMaterial(o.material);
  });
  rt.scene.add(grp);
  if (I.sgOverhead) {
    // 共有材質を変えず、一棟の中で複製を使い回す。点描を使わず近い梁・壁だけ半透明にする。
    const copies = new Map();
    const smooth = mat => {
      if (!copies.has(mat)) {
        const m = mat.clone(); m.userData.sgSmoothNear = true;
        m.transparent = true; m.depthWrite = false; m.alphaHash = false; m.forceSinglePass = true;
        copies.set(mat, m);
      }
      return copies.get(mat);
    };
    grp.traverse(o => { if (o.isMesh) o.material = Array.isArray(o.material) ? o.material.map(smooth) : smooth(o.material); });
  }
  I.mesh = grp;
  // 戦固有の見通しは、後から作る室内にも棟を渡して適用する。
  rt.world.def.prepareInteriorMesh?.(grp, I);
}

// 外の見た目：戸口と外から上がる階段。後から登録された棟だけを追加してまとめる。
function buildOuter(rt) {
  mainBuildOuter(rt);
  NAKA.outer = true;
  const list = [], wood = [];
  for (const I of NAKA.list) {
    if (I.profile !== 'moribe') continue;
    
    if (I.disabled) { if (I.mesh) I.mesh.visible = false; continue; }
    if (I.outerBuilt) continue;
    I.outerBuilt = true;
    const lv = I.levels[0], ds = I.door.side, hd = lv.d / 2;
    const put = (g, lx, y, lz, hex, grainAxis = null) => {
      const timber = I.profile === 'moribe'
        && [0x2e2218, 0x4e3c2a, 0x56432f, 0x493624, 0x55422f].includes(hex);
      if (timber) {
        // 木段・縁板も室内と同じ木目と木口を使う。三棟の木だけ一束へまとめる。
        // 回転前の座標で長手を選び、向きの違う屋敷でも板目を横へ通す。
        g.computeBoundingBox();
        const bounds = g.boundingBox;
        const w = bounds.max.x - bounds.min.x, h = bounds.max.y - bounds.min.y, d = bounds.max.z - bounds.min.z;
        const axis = grainAxis ?? (h >= w && h >= d ? 1 : w >= d ? 0 : 2);
        const a = (axis + 1) % 3, b = (axis + 2) % 3;
        const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
        const component = (attr, i, axis) => axis === 0 ? attr.getX(i) : axis === 1 ? attr.getY(i) : attr.getZ(i);
        const origin = axis => axis === 0 ? lx : axis === 1 ? y : lz;
        const ends = new Float32Array(p.count);
        for (let i = 0; i < p.count; i++) {
          const end = Math.abs(component(n, i, axis)) > .5;
          ends[i] = end ? 1 : 0;
          const across = Math.abs(component(n, i, a)) < .5 ? a : b;
          uv.setXY(i, (component(p, i, end ? a : across) + origin(end ? a : across)) / .3,
            (component(p, i, end ? b : axis) + origin(end ? b : axis)) / (end ? .3 : 1.2));
        }
        g.setAttribute('woodEnd', new THREE.BufferAttribute(ends, 1));
      }
      g.translate(lx, y, lz); g.rotateY(I.rot); g.translate(I.x, 0, I.z);
      (timber ? wood : list).push(colorize(g, hex));
    };
    // 戸口：柱二本と鴨居。入口の穴を空けたままにする。
    const dh = I.door.h ?? Math.min(lv.h - 0.3, 2.0);
    // 壁の穴を塞がず、枠から中が見える戸口にする。
    const off = I.kind === 'goten' ? 0.2 : 0.08;
    if (!I.hasExterior) { const g = new THREE.BoxGeometry(I.door.w + 0.3, 0.16, 0.2); put(g, I.door.lx, lv.y + dh + 0.08, ds * (hd + off + 0.04), 0x2e2218); }
    if (!I.hasExterior) for (const e of [-1, 1]) { const g = new THREE.BoxGeometry(0.16, dh, 0.2); put(g, I.door.lx + e * (I.door.w / 2 + 0.08), lv.y + dh / 2, ds * (hd + off + 0.04), 0x2e2218); }
    if (I.approach && !I.approach.stepsBuilt) {
      const { pad, len, gy } = I.approach, rise = lv.y - gy, n = Math.max(3, Math.round(rise / 0.28));
      // 在所の屋敷は木の踏み段。堂の石段と区別し、上り口の当たりは共通のまま使う。
      const stone = I.kind !== 'goten' && I.kind !== 'gate'
        && !(I.profile === 'moribe' && I.kind === 'yashiki');
      const timberSteps = I.profile === 'moribe' && I.kind === 'yashiki';
      // 森部の木段は、石段を茶色にした地面までの塊ではなく、踏板と左右のささら桁で復元。
      // 段の上面・幅・奥行きは既存の足場にそろえ、出入りの高さを変えない。
      // 幅六十センチほどの踏板を一枚の厚板にせず、二枚の板をささら桁へ掛ける。
      // 目地の底は薄い下張りで受け、既存の歩く高さと踏面の広さを保つ。
      const treadDepth = len / n + .02;
      const tread = timberSteps ? new THREE.BoxGeometry(I.door.w + .3, .05, treadDepth / 2 - .003) : null;
      const treadBacking = timberSteps ? new THREE.BoxGeometry(I.door.w + .3, .01, treadDepth) : null;
      // 森部の堂の石段は切石を組んだ推定復元。段ごとの一枚岩にはせず、
      // 隣の段と縦目地をずらす。歩く上面・段数は共通の足場へそろえる。
      const templeStone = I.profile === 'moribe' && I.kind === 'hondo'
        ? new THREE.BoxGeometry(1, 1, 1) : null;
      for (let q = 0; q < n; q++) {
        const t = (q + 1) / n, top = gy + rise * t, lz = ds * (hd + pad + len * (1 - t) + len / n / 2);
        if (tread) {
          put(treadBacking.clone(), I.door.lx, top - .055, lz, 0x2e2218);
          for (const side of [-1, 1]) put(tread.clone(), I.door.lx, top - .025,
            lz + side * treadDepth / 4, side < 0 ? 0x4e3c2a : 0x56432f);
        } else if (templeStone) {
          const width = I.door.w + .3;
          // 堂前の地面は左右・段ごとに高さが違う。上り口一点の高さで
          // 石の底を切ると、低い側で石段と下地が宙に浮いて堂へ続かない。
          // 設営時だけ各段の下を一尺ほどの間隔で測り、低い土へ根入れする。
          // 踏面・段数・歩く足場は共通の入口と同じままにする。
          let bottom = gy - .3;
          const nx = Math.ceil(width / .3), nz = Math.ceil(treadDepth / .3);
          for (let ix = 0; ix <= nx; ix++) for (let iz = 0; iz <= nz; iz++) {
            const [px, pz] = I.P(I.door.lx - width / 2 + width * ix / nx,
              lz - treadDepth / 2 + treadDepth * iz / nz);
            bottom = Math.min(bottom, drawGroundAt(rt.world, px, pz) - .08);
          }
          const height = Math.max(.1, top - bottom);
          const count = Math.max(2, Math.round(width / .7)), unit = width / count;
          // 偶数段と奇数段で半石ずらし、端の半石も同じ形から作る。
          // 目地は三ミリ。下地を五センチ下げて敷き、石の隙間から地中を透かさない。
          const backing = templeStone.clone(); backing.scale(width, height - .05, treadDepth);
          put(backing, I.door.lx, top - .05 - (height - .05) / 2, lz, 0x625d54);
          let left = -width / 2;
          for (let j = 0; j < count + (q % 2); j++) {
            const right = Math.min(width / 2, -width / 2 + (j + 1 - (q % 2) / 2) * unit);
            const block = templeStone.clone(); block.scale(right - left - .003, height, treadDepth);
            put(block, I.door.lx + (left + right) / 2, top - height / 2, lz,
              (q + j) % 2 ? 0x7c7468 : 0x847c70);
            left = right;
          }
        } else {
          const g = new THREE.BoxGeometry(I.door.w + 0.3, Math.max(0.1, top - gy + 0.3), treadDepth);
          put(g, I.door.lx, (top + gy - 0.3) / 2, lz, stone ? (q % 2 ? 0x7c7468 : 0x847c70) : (q % 2 ? 0x4e3c2a : 0x56432f));
        }
      }
      if (templeStone) templeStone.dispose();
      if (tread) {
        tread.dispose(); treadBacking.dispose();
        // 斜めの角材のままでは、踏板の奥側へ桁が突き抜ける。
        // 上端を各踏板の下張り下面で段状に欠き、下面は従来の勾配を残す。
        // 三筋ともこの一つの形を共用し、歩く面・段数・礎石の位置は保つ。
        const stringerCenterY = gy + rise / 2 + rise / (2 * n) - .12;
        const stringerBottom = lv.y + rise / (2 * n) - .12
          - .09 * Math.cos(Math.atan2(rise, len));
        const outline = new THREE.Shape();
        outline.moveTo(0, lv.y - .06);
        for (let q = 0; q < n; q++) {
          const end = len * (q + 1) / n;
          outline.lineTo(end, lv.y - rise * q / n - .06);
          if (q + 1 < n) outline.lineTo(end, lv.y - rise * (q + 1) / n - .06);
        }
        outline.lineTo(len, stringerBottom - rise);
        outline.lineTo(0, stringerBottom);
        outline.closePath();
        const stringer = new THREE.ExtrudeGeometry(outline,
          { depth: .12, bevelEnabled: false, steps: 1, curveSegments: 1 });
        stringer.translate(0, -stringerCenterY, -.06);
        stringer.rotateY(-ds * Math.PI / 2);
        stringer.translate(0, 0, -ds * len / 2);
        const foot = new THREE.BoxGeometry(.3, .08, .3);
        const post = new THREE.BoxGeometry(1, 1, 1);
        const landingBeam = new THREE.BoxGeometry(.12, .14, pad + .2);
        const stepStone = new THREE.BoxGeometry(.32, 1, len / n + .12);
        // 礎石の中心だけで底を決めると、斜面の低い端で石が浮く。
        // 実際の石の幅・奥行き全体を測り、下端だけを土へ根入れする。
        // 段と踊り場の上面は動かさず、設営時だけ共通の形を伸ばす。
        const stoneBase = (x, z, width, depth, top) => {
          let bottom = top - .08;
          const nx = Math.ceil(width / .15), nz = Math.ceil(depth / .15);
          for (let ix = 0; ix <= nx; ix++) for (let iz = 0; iz <= nz; iz++) {
            const [px, pz] = I.P(x - width / 2 + width * ix / nx,
              z - depth / 2 + depth * iz / nz);
            bottom = Math.min(bottom, drawGroundAt(rt.world, px, pz) - .08);
          }
          return bottom;
        };
        // 幅約二メートルの踏板と踊り場は中央でも受ける推定復元。
        // 中央のささら桁・受け桁も束と礎石へつなぎ、薄い板を左右だけで渡さない。
        // 部材は設営時に同じ形から複製してまとめ、歩く面と戸口の当たりは保つ。
        put(new THREE.BoxGeometry(I.door.w + .4, .14, .14), I.door.lx, lv.y - .19, ds * (hd + pad - .04), 0x4e3c2a);
        for (const side of [-1, 0, 1]) {
          const x = I.door.lx + side * (I.door.w / 2 + .05);
          // ささら桁の下端は最下段の下の踏石で受け、土へ刺さる部分を水平に切る。
          // 石の上面は踏板の下へ納め、既存の歩く高さ・段数は変えない。
          const stepZ = ds * (hd + pad + len - len / (2 * n));
          const [stepX, stepWorldZ] = I.P(x, stepZ);
          const stepGround = drawGroundAt(rt.world, stepX, stepWorldZ);
          const bearing = Math.min(gy + rise / n - .07, Math.max(gy + .02, stepGround + .02));
          const centerY = stringerCenterY;
          const beam = stringer.clone(), vertices = beam.attributes.position;
          for (let j = 0; j < vertices.count; j++) {
            vertices.setY(j, Math.max(vertices.getY(j), bearing - centerY));
          }
          beam.computeVertexNormals();
          put(beam, x, centerY, ds * (hd + pad + len / 2), 0x4e3c2a, 2);
          // 切った桁の下面全体を石へ載せる。地中へ根入れし、横から土が透けない。
          const slope = Math.atan2(rise, len);
          const lowY = gy + rise / (2 * n) - .12 - .09 * Math.cos(slope);
          const stoneDepth = Math.max(len / n + .12,
            (bearing - lowY) * len / Math.max(.01, rise) + .09 * Math.sin(slope) + .12);
          const stoneZ = ds * (hd + pad + len + .06 - stoneDepth / 2);
          const stone = stepStone.clone(), stoneBottom = stoneBase(x, stoneZ, .32, stoneDepth, bearing);
          stone.scale(1, bearing - stoneBottom, stoneDepth / (len / n + .12));
          put(stone, x, (bearing + stoneBottom) / 2, stoneZ, 0x827b6d);
          // 踊り場の束を礎石で受け、木口を土へ直接埋めない。
          // 段の下端とは地面の高さが違うため、束の真下を一度だけ読む。
          const lz = ds * (hd + pad - .04), [px, pz] = I.P(x, lz);
          const bottom = drawGroundAt(rt.world, px, pz) + .08, top = lv.y - .26;
          const footTop = bottom, footBottom = stoneBase(x, lz, .3, .3, footTop);
          const footStone = foot.clone(); footStone.scale(1, (footTop - footBottom) / .08, 1);
          put(footStone, x, (footTop + footBottom) / 2, lz, 0x827b6d);
          if (top > bottom) {
            const g = post.clone(); g.scale(.12, top - bottom, .12);
            put(g, x, (bottom + top) / 2, lz, 0x4e3c2a);
          }
          put(landingBeam.clone(), x, lv.y - .19,
            ds * (hd + pad / 2 - .1), 0x4e3c2a);
        }
        stringer.dispose(); foot.dispose(); post.dispose(); landingBeam.dispose(); stepStone.dispose();
      }
      // 森部の堂は石段を上がって木の縁へ出る。中央の踊り場も左右の縁と同じ板敷きにする。
      const timberVeranda = I.profile === 'moribe' && I.kind === 'hondo';
      const landingZ = ds * (hd + pad / 2 - .1), landingDepth = pad + .4;
      if (timberSteps) {
        // 屋敷の踊り場も踏板と同じ板敷き。受け桁の上で三枚へ割り、入口まで続ける。
        // 上面と下面は従来どおり。設営時に共通の描画へまとめ、毎コマの仕事を増やさない。
        put(new THREE.BoxGeometry(I.door.w + .4, .09, landingDepth), I.door.lx, lv.y - .075, landingZ, 0x4e3c2a);
        const board = new THREE.BoxGeometry(I.door.w + .4, .03, landingDepth / 3 - .003);
        for (let q = 0; q < 3; q++) put(board.clone(), I.door.lx, lv.y - .015,
          landingZ + (q - 1) * landingDepth / 3, q % 2 ? 0x4e3c2a : 0x56432f);
        board.dispose();
      } else if (timberVeranda) {
        // 薬師堂の中央も左右の縁と同じ厚さ二センチの四列の板で納める。
        // 一枚の厚い床へ目地の線を貼らず、隙間の下は薄い下地で受ける。
        // 戸口より内側の三十センチは別の板とし、外の板目を壁際からそろえる。
        put(new THREE.BoxGeometry(I.door.w + .4, .1, landingDepth), I.door.lx, lv.y - .07, landingZ, 0x493624);
        put(new THREE.BoxGeometry(I.door.w + .4, .02, .3), I.door.lx, lv.y - .01, ds * (hd - .15), 0x55422f);
        const verandaDepth = pad + .1, boardDepth = verandaDepth / 4;
        const board = new THREE.BoxGeometry(I.door.w + .4, .02, boardDepth - .003);
        for (let q = 0; q < 4; q++) put(board.clone(), I.door.lx, lv.y - .01,
          ds * (hd + (q + .5) * boardDepth), 0x55422f);
        board.dispose();
      } else {
        const g = new THREE.BoxGeometry(I.door.w + .4, .12, landingDepth);
        put(g, I.door.lx, lv.y - .06, landingZ, stone ? 0x847c70 : 0x4e3c2a);
      }
    }
  }
  const M = mats();
  if (wood.length && !M.outerWood) {
    // 外の木は従来の雨空の明暗を保ち、絵と木口の処理だけ室内と共用する。
    const source = ceilingWoodMaterial();
    M.outerWood = new THREE.MeshLambertMaterial({ map: source.map, vertexColors: true });
    M.outerWood.onBeforeCompile = source.onBeforeCompile;
    M.outerWood.customProgramCacheKey = source.customProgramCacheKey;
  }
  for (const [parts, material] of [[list, M.door], [wood, M.outerWood]]) {
    if (!parts.length) continue;
    const m = new THREE.Mesh(mergeGeometries(parts), material);
    m.castShadow = true; m.receiveShadow = true; m.matrixAutoUpdate = false;
    rt.scene.add(m);
  }
}

// 出入りの札も間仕切りを越さない。動いた引き戸の現在の当たりを直接調べる。
// 徒歩の体幅・体高で柱と戸板を避ける。座標や配列は毎コマ作らない。
function entryPathClear(I, p, q) {
  // 石段・敷居は歩いて越える。床より上の腰板・鴨居は頭から足まで調べる。
  const floor = I.levels[0].y, bottom = Math.max(p.y, floor) + .1;
  const rise = Math.max(q.y ?? floor, floor) + .1 - bottom;
  const outside = I.exteriorSolids;
  for (let group = 0; group < (outside ? 2 : 1); group++) {
    const walls = group ? outside : INTERIOR_WALLS;
    for (const w of walls) {
      if (!group && w.naka !== I.id) continue;
      let start = 0, end = 1;
      if (Math.abs(rise) < .000001) {
        if (bottom > w.yTop || bottom + 1.6 < w.yBot) continue;
      } else {
        const a = (w.yBot - 1.6 - bottom) / rise, b = (w.yTop - bottom) / rise;
        start = Math.max(0, Math.min(a, b)); end = Math.min(1, Math.max(a, b));
        if (start > end) continue;
      }
      // 堂の縁柱も含め、中心線だけ通る狭い隙間へ出入りの札で飛ばさない。
      if (nakaWallBetween(w, p.x + (q.x - p.x) * start, p.z + (q.z - p.z) * start,
        p.x + (q.x - p.x) * end, p.z + (q.z - p.z) * end, .3)) return false;
    }
  }
  return true;
}
// 出入りの札でも体の幅全体を確かめる。中央と両肩の三本の線だけでは、
// その間にある細い戸当たりや引き残した框をすり抜けてしまう。
// 壁に沿う座標で幅三十五センチ分を広げ、移動区間との重なりを調べる。
// 腰の一点だけでなく、敷居を越える足元十センチから頭までを通す。
// 点の線分で登録した柱も、肩が触れる幅を残して調べる。
// 回転した屋敷も同じ判定を使い、毎コマの仮の物や配列は作らない。
function moribeEntryBlocked(p, q) {
  if (interiorBlocked(SOLIDS, p, q)) return true;
  for (const w of SOLIDS) {
    if (w.naka == null || w.k !== 's') continue;
    const radius = (w.r || 0) + .35;
    if (Math.max(p.x, q.x) < Math.min(w.ax, w.bx) - radius
      || Math.min(p.x, q.x) > Math.max(w.ax, w.bx) + radius
      || Math.max(p.z, q.z) < Math.min(w.az, w.bz) - radius
      || Math.min(p.z, q.z) > Math.max(w.az, w.bz) + radius) continue;
    const sx = w.bx - w.ax, sz = w.bz - w.az, length = Math.hypot(sx, sz);
    const ux = length > .000001 ? sx / length : 1;
    const uz = length > .000001 ? sz / length : 0;
    const px = p.x - w.ax, pz = p.z - w.az, dx = q.x - p.x, dz = q.z - p.z;
    let near = 0, far = 1;
    for (let axis = 0; axis < 3; axis++) {
      const start = axis === 2 ? p.y : axis ? -px * uz + pz * ux : px * ux + pz * uz;
      const delta = axis === 2 ? q.y - p.y : axis ? -dx * uz + dz * ux : dx * ux + dz * uz;
      const low = axis === 2 ? w.yBot - 1.7 : -radius;
      const high = axis === 2 ? w.yTop - .1 : axis ? radius : length + radius;
      if (Math.abs(delta) < .000001) {
        if (start < low || start > high) { far = -1; break; }
      } else {
        const a = (low - start) / delta, b = (high - start) / delta;
        near = Math.max(near, Math.min(a, b)); far = Math.min(far, Math.max(a, b));
      }
      if (near > far) break;
    }
    if (near <= far) return true;
  }
  return false;
}

// 戸口と石段の前だけ札を出す。横壁越しや別の階からは入れない。
function entryPos(rt, I, out) {
  if (I.disabled || (!rt.def.town && !['okehazama', 'moribe'].includes(I.profile))) return null;
  // 閉じた入口の戸を、出入りの札で飛び越えない。
  if (I.doors?.some(d => d.exterior && d.open < .95)) return null;
  // 正面の引き戸を開け終えるまでは、入退室の札でも戸を通り抜けさせない。
  if (I.profile === 'hieizan' && I.doors) {
    for (const d of I.doors) if (d.entry && (!d.want || d.open < 1)) return null;
  }
  const pl = rt.player, u = pl.u, p = u.pos, lv = I.levels[0];
  if (!u.alive || u.downed || rt.over || rt.choice || pl.mounted || u.climb) return null;
  // 玄関の戸を開け切ってから、上がり口の案内を出す。
  if (I.entryDoor && I.entryDoor.open < .99) return null;
  const dx = p.x - I.x, dz = p.z - I.z;
  const lx = dx * I.c - dz * I.s, lz = (dx * I.s + dz * I.c) * I.door.side;
  // 森部は体の幅も戸口の内側へ納め、戸脇の壁から斜めにすり抜けない。
  if (Math.abs(lx - I.door.lx) > I.door.w / 2 + (I.profile === 'moribe' ? -.28 : .4)) return null;
  // 森部は外の板戸を十分に引いてから出入りする。移動の札でも閉じた戸を越えない。
  // 開け始めの指示だけで通さず、共通の引き戸が実際に動いた量で判定する。
  if (I.profile === 'moribe' && I.doors) for (const d of I.doors) {
    if (d.exterior && !d.window && d.lv === lv && d.open < .8) return null;
  }
  if (!out) {
    if (I.entryLimit != null && lz < I.entryLimit) return null;
    if (!NAKA.cur || NAKA.cur.I !== I || NAKA.cur.lv.k !== 0 || lz <= lv.d / 2 - 2.2) return null;
    // 長福寺の外陣や詰所の座敷から、閉じた障子・襖を飛び越して外へ出さない。
    if (I.profile === 'okehazama'
      && (!entryPathClear(I, p, I.doorIn) || !entryPathClear(I, I.doorIn, I.doorOut))) return null;
    // 外の板戸が開いていても、閉じた障子・板戸や調度を出入りの札で越えない。
    // 横滑りする戸の現在の当たりを使い、歩く時と同じ通り道を確かめる。
    if (I.profile === 'moribe' && moribeEntryBlocked(p, I.doorOut)) return null;
    return I.doorIn;
  }
  if (NAKA.cur || I.ladderId != null || lz < lv.d / 2 - 0.05) return null;
  const reach = I.approach ? I.approach.pad + I.approach.len : 0;
  if (lz > lv.d / 2 + reach + 2) return null;
  const low = I.approach ? Math.min(I.approach.gy, lv.y) : I.ladderId != null ? I.doorOut.y : lv.y;
  if (p.y < low - 0.8 || p.y > lv.y + 1) return null;
  // 入る時も板壁・戸脇柱・開いた戸板を越さない。戸口の脇から斜めに抜ける札を防ぐ。
  if (I.profile === 'okehazama' && !entryPathClear(I, p, I.doorIn)) return null;
  if (I.profile === 'moribe' && moribeEntryBlocked(p, I.doorIn)) return null;
  return I.doorOut;
}

function entryActions(rt, I) {
  // 登録と行き先は一度だけ作る。毎コマは既存の座標を返すだけ。
  I.actions = true;
  const ladder = I.ladderId != null ? FL.ladders[I.ladderId] : null;
  if (ladder) { I.doorOut.x = ladder.topX; I.doorOut.z = ladder.topZ; I.doorOut.y = ladder.y1; }
  // 森部の床と段は描いた地面にそろえてある。退出先も同じ高さを使い、土へ沈めない。
  else I.doorOut.y = I.profile === 'moribe'
    ? drawGroundAt(rt.world, I.doorOut.x, I.doorOut.z)
    : rt.world.heightAt(I.doorOut.x, I.doorOut.z);
  const move = (out) => {
    if (!entryPos(rt, I, !out)) return;
    if (!I.built) buildInside(rt, I);
    const pl = rt.player, u = pl.u, q = out ? I.doorOut : I.doorIn;
    u.pos.set(q.x, q.y, q.z);
    pl.vel.x = 0; pl.vel.y = 0; pl.vel.z = 0;
    u.vel.x = 0; u.vel.y = 0; u.vel.z = 0;
    if (u.mesh) u.mesh.position.copy(u.pos);
    if (u.push) { u.push.x = 0; u.push.z = 0; }
    pl.lock = null;
    u.heading = I.rot + (I.door.side > 0 ? Math.PI : 0) + (out ? Math.PI : 0);
    pl.yaw = u.heading; pl.camYawOff = 0;
  };
  rt.addInteract(`naka_in_${I.id}`, () => entryPos(rt, I, true), '中へ入る', () => move(false), { r: (I.approach ? I.approach.len + I.approach.pad : 0) + 3 });
  rt.addInteract(`naka_out_${I.id}`, () => entryPos(rt, I, false), '外へ出る', () => move(true), { r: 2.5 });
  for (const lv of I.levels) {
    if (!lv.drop) continue;
    const [x, z] = I.P(Math.min(lv.w / 2 - .6, lv.drop.x1 + .9), 0), spot = { x, y: lv.y, z };
    const [tx, tz] = I.P(-lv.w / 2 - .65, 0);
    const fallTop = { x: tx, y: lv.y + .15, z: tz }, fallBottom = { x: tx, y: 0, z: tz };
    // 押した時だけ庇や床の絵も調べる。道具と当たりの配列は使い回す。
    const fallRay = new THREE.Raycaster(), fallOrigin = new THREE.Vector3(), fallDirection = new THREE.Vector3(), fallHits = [];
    const fallBlocked = () => {
      fallOrigin.set(fallTop.x, fallTop.y, fallTop.z);
      fallDirection.set(fallBottom.x - fallTop.x, fallBottom.y - fallTop.y, fallBottom.z - fallTop.z);
      fallRay.far = fallDirection.length() - .1; fallRay.near = .05;
      fallDirection.normalize(); fallRay.set(fallOrigin, fallDirection); fallHits.length = 0;
      // 板の絵（Sprite）は raycaster.camera が要る。無いと matrixWorld の例外で戦が止まった（信貴山）
      fallRay.camera = rt.camera || rt.world?.camera || fallRay.camera;
      try { fallRay.intersectObjects(rt.scene.children, true, fallHits); } catch (e) { fallHits.length = 0; }
      for (const hit of fallHits) {
        const m = hit.object;
        if (!m.isMesh || !m.material || m.material.visible === false || m.material.transparent || m.material.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile) continue;
        let visible = true, root = m;
        for (let at = m; at && at !== rt.scene; at = at.parent) { if (!at.visible) visible = false; root = at; }
        if (!visible || rt.army.units.some(u => u.mesh === root)) continue;
        return true;
      }
      return false;
    };
    let readyAt = 0;
    lv.dropStones = 8; // 設営時の備え。戦の最中の自動補充はしない。
    const dropId = `yagura_drop_${I.id}_${lv.k}`;
    let aim = null, aimAt = -99, hintAt = -99, aimDistance = 2;
    const inside = () => !I.disabled && NAKA.cur?.I === I && NAKA.cur.lv === lv && rt.player.u.alive && !rt.player.u.downed && !rt.player.mounted && !rt.player.u.climb && !rt.choice && !rt.over;
    const inspectEnemy = enemy => {
      if (!enemy.alive || enemy.downed || enemy.isStruct || enemy.team === rt.player.u.team || enemy.pos.y >= lv.y - .6) return;
      if (nakaRoomAt(enemy.pos.x, enemy.pos.z, enemy.pos.y)?.I === I) return;
      fallBottom.x = enemy.pos.x; fallBottom.y = enemy.pos.y + 1; fallBottom.z = enemy.pos.z;
      if (interiorFloorBlocked(fallTop, fallBottom, 0, 0, false) || interiorBlocked(SOLIDS, fallTop, fallBottom, false, 0, 0) || fallBlocked()) return;
      const d = Math.hypot(enemy.pos.x - tx, enemy.pos.z - tz);
      if (d < aimDistance) { aimDistance = d; aim = enemy; }
    };
    const findAim = () => {
      if (!inside() || !lv.dropStones || rt.t < readyAt || Math.hypot(rt.player.u.pos.x - x, rt.player.u.pos.z - z) > 1.8) return null;
      // 近い敵だけを半秒ごとに調べる。矢印と札は同じ落下経路の判定を使う。
      if (rt.t - aimAt >= .5) { aimAt = rt.t; aim = null; aimDistance = 2; rt.army.forNear(tx, tz, 2, inspectEnemy); }
      return aim?.alive && !aim.downed && Math.hypot(aim.pos.x - tx, aim.pos.z - tz) < 2 && aim.pos.y < lv.y - .6 ? aim : null;
    };
    if (I.sgOverhead) rt.marker(dropId, () => { const enemy = findAim(); return enemy ? enemy.pos : null; }, '↓ 石を落とす相手', { h: 1.8 });
    const available = () => {
      if (!inside()) return null;
      const wait = Math.max(0, Math.ceil(readyAt - rt.t));
      if (lv.dropWait !== wait) { lv.dropWait = wait; const it = rt.interacts.find(it => it.id === dropId); if (it) it.label = `石を落とす（残り${lv.dropStones}個${wait ? `・準備あと${wait}秒` : ''}）`; }
      if (I.sgOverhead) {
        if (!findAim()) return null;
        // 二秒の札を八秒おきに出す。押している間は長押しを途切れさせない。
        if (rt.t - hintAt >= 8) hintAt = rt.t;
        if (rt.t - hintAt > 2 && rt.holdId !== dropId) return null;
      }
      return spot;
    };
    const strike = spear => {
      if (!available() || Math.hypot(rt.player.u.pos.x - x, rt.player.u.pos.z - z) > 1.8) return;
      const u = rt.player.u;
      if (rt.t < readyAt) { rt.bark(`準備中。あと${Math.ceil(readyAt - rt.t)}秒`); return; }
      if (!spear && !lv.dropStones) { rt.bark('用意した石は尽きた。戦の間は補充できない'); return; }
      if (spear && (u.wpnKind || u.lookWeapon || u.weapon) !== 'spear') return;
      let target = null, distance = 2, tooLow = false;
      rt.army.forNear(tx, tz, 2, enemy => {
        if (!enemy.alive || enemy.downed || enemy.isStruct || enemy.team === u.team || enemy.pos.y >= lv.y - .6) return;
        // 石落としは外の敵だけ。同じ櫓の下の階へ壁越しに当てない。
        if (nakaRoomAt(enemy.pos.x, enemy.pos.z, enemy.pos.y)?.I === I) return;
        if (spear && lv.y - enemy.pos.y > 3) { tooLow = true; return; }
        fallBottom.x = enemy.pos.x; fallBottom.y = enemy.pos.y + 1; fallBottom.z = enemy.pos.z;
        if (interiorFloorBlocked(fallTop, fallBottom, 0, 0, false) || interiorBlocked(SOLIDS, fallTop, fallBottom, false, 0, 0) || fallBlocked()) return;
        const d = Math.hypot(enemy.pos.x - tx, enemy.pos.z - tz);
        if (d < distance) { distance = d; target = enemy; }
      });
      if (I.sgOverhead && !target) { aim = null; aimAt = -99; return; }
      readyAt = rt.t + (spear ? 1.2 : 2.5);
      if (!spear) lv.dropStones--;
      // 高さによる威力の増加は、奥の固い大将との戦いを軽くしないよう保留する。
      if (target) rt.army.damage(target, spear ? 24 : 32, u, { kind: spear ? 'thrust' : 'slam', pierce: true, yaguraDrop: true });
      const it = rt.interacts.find(it => it.id === dropId); if (it) it.label = `石を落とす（残り${lv.dropStones}個・準備あと${Math.ceil(readyAt - rt.t)}秒）`;
      if (rt.bark) rt.bark(target ? (spear ? '下の敵を突いた' : `約${Math.round(lv.y - target.pos.y)}歩の高さから石が当たった。残り${lv.dropStones}個`) : spear && tooLow ? '敵は低すぎて槍が届かない' : '穴の真下に敵はいない');
    };
    rt.addInteract(dropId, available, '石を落とす（残り八個・補充なし）', () => strike(false), { r: 1.8, hold: .6 });
    rt.addInteract(`yagura_thrust_${I.id}_${lv.k}`, () => {
      const u = rt.player.u;
      return (u.wpnKind || u.lookWeapon || u.weapon) === 'spear' ? available() : null;
    }, '下を突く', () => strike(true), { r: 1.8 });
  }
}

// 毎コマ（battle.js）
export function nakaTick(rt, dt) {
  if (!NAKA.list.length || !rt.player) return;
  if (MAT) { const time = rt.world.timeKey || rt.world.def.time; MAT.shaft.opacity = time === 'night' ? 0 : time === 'dusk' ? .015 : .07; }
  if (rt.army) rt.army.interiorRooms = NAKA.list;
  if (!NAKA.outer) buildOuter(rt);
  const u = rt.player.u, p = u.pos;
  NAKA.pp = p;
  NAKA.t += dt;
  if (!NAKA.guardsReady && rt.ready && rt.army) {
    NAKA.guardsReady = true;
    for (const I of NAKA.list) {
      if (I.disabled || I.profile !== 'yagura' || I.guards) continue;
      let ref = null, closest = 35;
      for (const g of rt.army.groups) {
        if (g.civ || g.isPlayerSquad || g.interiorHold || g.order !== 'hold' || !g.anchor || (I.team != null && I.team !== g.team)) continue;
        const d = Math.hypot(g.anchor.x - I.x, g.anchor.z - I.z);
        if (d < closest && g.units.some(o => o.alive && !o.isStruct && !o.isOfficer && !o.isGeneral && !o.name && !o._interiorGuard && !o.mounted)) { closest = d; ref = g; }
      }
      I.team ??= ref ? ref.team : rt.def.town ? 0 : 1;
      if (ref) makeInteriorGuards(rt, I, { team: I.team, faction: ref.faction, source: ref });
      else I.guards = [];
    }
  }
  const prev = NAKA.cur;
  NAKA.cur = u.alive ? nakaRoomAt(p.x, p.z, p.y) : null;
  const C = NAKA.cur;
  u.naka = C ? C.I.id + 1 : null;
  u.nakaLevel = C ? C.lv.k : null;
  setInteriorSound(C ? C.I : null);
  // 外の草・鳥は入口を出るまで描かない。元の表示状態は戻す。
  if (C && !NAKA.hidden) {
    NAKA.hidden = [];
    for (const mesh of [rt.world.nearGrass, rt.world.birds]) if (mesh) NAKA.hidden.push({ mesh, visible: mesh.visible });
  }
  if (C && NAKA.hidden) for (const v of NAKA.hidden) v.mesh.visible = false;
  if (!C && NAKA.hidden) { for (const v of NAKA.hidden) v.mesh.visible = v.visible; NAKA.hidden = null; }
  let prepare = null, prepareD = Infinity;
  for (const I of NAKA.list) {
    if (I.disabled) { if (I.mesh) I.mesh.visible = false; continue; }
    if (!I.actions) entryActions(rt, I);
    if (rt.player.mounted && !rt.over && !rt.choice && !(NAKA.horseHintAt > NAKA.t)) {
      const lv = I.levels[0], dx = p.x - I.x, dz = p.z - I.z;
      const lx = dx * I.c - dz * I.s, lz = (dx * I.s + dz * I.c) * I.door.side;
      const reach = I.approach ? I.approach.pad + I.approach.len : 0;
      if ((I.ladderId != null || I.door.w < 1.52 || (I.door.h ?? Math.min(lv.h - .3, 2)) < 2.4)
        && Math.abs(lx - I.door.lx) < I.door.w / 2 + .7 && lz >= lv.d / 2 - .1 && lz < lv.d / 2 + reach + 2
        && p.y >= (I.approach ? I.approach.gy : rt.world.heightAt(p.x, p.z)) - .8 && p.y <= lv.y + 1) {
        NAKA.horseHintAt = NAKA.t + 8;
        rt.bark('ここは馬を降りて入る');
      }
    }
    const d = Math.hypot(p.x - I.x, p.z - I.z);
    const near = C ? C.I === I : d < I.R + 12;
    if (near && rt.ready && rt.army && I.profile === 'yagura') yaguraTick(rt, I, C?.I === I, dt);
    if (!I.built && (near || (!C && d < I.R + 16)) && d < prepareD) { prepare = I; prepareD = d; }
    if (I.mesh) I.mesh.visible = near;
  }
  if (prepare) buildInside(rt, prepare);
  if (prev && (!C || prev.I !== C.I)) { prev.I.leftAt = NAKA.t; rt.unmark('naka-stair'); }
  if (C && (!prev || prev.I !== C.I || prev.lv !== C.lv)) {
    const I = C.I, k = C.lv.k;
    if (!I.seen.in) { I.seen.in = true; if (I.onEnter) I.onEnter(rt, I); else if (rt.bark) rt.bark(I.levels.length > 1 ? `${I.name}の中。階段の印へ` : `${I.name}の${C.lv.layout.rooms.find(r => { const [x, z] = I.L(p.x, p.z); return x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1; })?.name || '入口'}`); }
    else if ((!prev || prev.I !== I) && NAKA.t - (I.leftAt ?? NAKA.t) >= 8 && rt.bark) rt.bark(I.levels.length > 1 ? `${I.name}の${k + 1}階` : `${I.name}の${C.lv.layout.rooms.find(r => { const [x, z] = I.L(p.x, p.z); return x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1; })?.name || '入口'}`);
    rt.unmark('naka-stair');
    const stair = I.stairs[k];
    if (stair) { const point = stair.points[0], [x, z] = I.P(point.x, point.z); rt.marker('naka-stair', { x, z, y: point.y }, '階段の上り口'); }
    if (!I.seen[k]) { I.seen[k] = true; if (I.onLevel) I.onLevel(rt, I, k); }
  }
  // 灯明のゆらぎ
  for (const I of NAKA.list) {
    if (I.disabled) { if (I.mesh) I.mesh.visible = false; continue; }
    if (!I.mesh || !I.mesh.visible) continue;
    for (let i = 0; i < I.glows.length; i++) { const sp = I.glows[i], t = NAKA.t * 7 + i * 1.7 + I.id; sp.visible = !rt.camera || sp.position.distanceTo(rt.camera.position) > 1.6; sp.scale.setScalar((S.reduceMotion || REDUCE_MOTION?.matches ? .78 : 0.78 + Math.sin(t) * 0.04 + Math.sin(t * 2.3) * 0.03) * ((I.lampGlowScale ?? .8) / .8)); }
  }
  // 中は暗い：日の光と空の明かりを少し落とす（ほかが値を替えたら、それを新しい元にする）
  const W = rt.world;
  if (W && W.sun && W.hemi) {
    const want = C ? (C.I.open ? .85 : C.lv.layout.dim) : 1;
    if (S.reduceMotion || REDUCE_MOTION?.matches) NAKA.dim = want;
    else NAKA.dim += (want - NAKA.dim) * Math.min(1, dt * 3);
    if (Math.abs(NAKA.dim - 1) < 0.002) NAKA.dim = 1;
    const lt = NAKA.lt || (NAKA.lt = { sunLight: W.sun, hemiLight: W.hemi, sun: W.sun.intensity, hemi: W.hemi.intensity, sunSet: W.sun.intensity, hemiSet: W.hemi.intensity });
    if (Math.abs(W.sun.intensity - lt.sunSet) > 1e-4) lt.sun = W.sun.intensity;
    if (Math.abs(W.hemi.intensity - lt.hemiSet) > 1e-4) lt.hemi = W.hemi.intensity;
    lt.sunSet = W.sun.intensity = lt.sun * NAKA.dim;
    lt.hemiSet = W.hemi.intensity = lt.hemi * (0.4 + NAKA.dim * 0.6);
  }
  nakaDoorTick(rt, dt, NAKA.flagged);
  // 登録済みの兵は階段を渡ったコマに更新。未登録の近い兵だけ間引いて探す。
  for (const o of rt.army?.units || NAKA.flagged) {
    if (!o.naka && !o._innerStair && !o._interiorGuard) continue;
    const r = o.alive ? nakaRoomAt(o.pos.x, o.pos.z, o.pos.y) : null;
    o.naka = r ? r.I.id + 1 : null; o.nakaLevel = r ? r.lv.k : null;
  }
  // 中にいる兵の印（0.2 秒ごと）
  NAKA.ft = (NAKA.ft || 0) - dt;
  if (NAKA.ft > 0 || !rt.army) return;
  NAKA.ft = 0.2;
  if (rt.squad) for (let j = 0; j < rt.squad.length; j++) rt.squad[j]._innerRank = j;
  for (const o of NAKA.flagged) { o.naka = null; o.nakaLevel = null; }
  NAKA.flagged.length = 0;
  u.naka = C ? C.I.id + 1 : null;
  u.nakaLevel = C ? C.lv.k : null;
  roomScanPass++;
  for (const I of NAKA.list) {
    if (I.disabled) { if (I.mesh) I.mesh.visible = false; continue; }
    rt.army.forNear(I.x, I.z, I.R, I.scanUnit);
  }
}

// 比叡山の既存の内装も保ち、森部の実寸の建具・畳・灯明とは作り分ける。








function mainBuildOuter(rt) {
  NAKA.outer = true;
  const list = [], wood = [];
  let landingShape = null;
  for (const I of NAKA.list) {
    if (I.profile === 'moribe') continue;
    
    if (I.outerBuilt) continue;
    I.outerBuilt = true;
    if (I.disabled) { if (I.mesh) I.mesh.visible = false; continue; }
    const lv = I.levels[0], ds = I.door.side, hd = lv.d / 2;
    const put = (g, lx, y, lz, hex, wooden = false) => {
      g.translate(lx, y, lz); g.rotateY(I.rot); g.translate(I.x, 0, I.z);
      (wooden ? wood : list).push(colorize(g, hex));
    };
    // 戸口：柱二本と鴨居。入口の穴を空けたままにする。
    const dh = I.door.h ?? Math.min(lv.h - 0.3, 2.0);
    // 壁の穴を塞がず、枠から中が見える戸口にする。
    const off = I.kind === 'goten' ? 0.2 : 0.08;
    if (!I.hasExterior) { const g = new THREE.BoxGeometry(I.door.w + 0.3, 0.16, 0.2); put(g, I.door.lx, lv.y + dh + 0.08, ds * (hd + off + 0.04), 0x2e2218); }
    if (!I.hasExterior) for (const e of [-1, 1]) { const g = new THREE.BoxGeometry(0.16, dh, 0.2); put(g, I.door.lx + e * (I.door.w / 2 + 0.08), lv.y + dh / 2, ds * (hd + off + 0.04), 0x2e2218); }
    if (I.profile === 'okehazama') {
    if (I.approach && !I.approach.stepsBuilt) {
      // 桶狭間の簡素な詰所に寺堂と同じ石段を付けない。低い床は木の踏み台一段、
      // 斜面で床が高くなる所だけ段を増やす推定復元。歩ける坂と踊り場の位置は保つ。
      const fieldHut = I.profile === 'okehazama' && ['bansho', 'minka'].includes(I.kind);
      const { pad, len, gy } = I.approach, rise = lv.y - gy;
      const n = fieldHut ? Math.max(1, Math.ceil(rise / .22)) : Math.max(3, Math.round(rise / .28));
      const stone = !fieldHut && I.kind !== 'goten' && I.kind !== 'gate';
      const templeStone = I.profile === 'okehazama' && I.kind === 'hondo';
      const stoneBox = templeStone ? new THREE.BoxGeometry(1, 1, 1) : null;
      // 長福寺の入口は推定復元。一枚の巨大な石塊でなく、目地を持つ踏石を据える。
      // 目地の底にも下地を残し、踊り場は地面まで受ける。歩行用の坂は共通のまま。
      const stoneDeck = (width, depth, top, centerZ, row) => {
        const bottom = Math.min(gy - .3, top - .12), joint = .006;
        const base = stoneBox.clone().scale(width, top - bottom - .025, depth);
        put(base, I.door.lx, (bottom + top - .025) / 2, centerZ, 0x625e55);
        // 一段おきに端を半石とし、縦目地を続けない。原形・材質は全段で使い回す。
        const count = Math.max(2, Math.ceil(width / .8)), pitch = width / count;
        let start = -width / 2;
        for (let j = 0; start < width / 2 - .001; j++) {
          const end = Math.min(width / 2, -width / 2 + (j + (row % 2 ? .5 : 1)) * pitch);
          const block = stoneBox.clone().scale(end - start - joint, .12, depth - joint);
          put(block, I.door.lx + (start + end) / 2, top - .06, centerZ,
            (j + row) % 2 ? 0x7c7468 : 0x847c70);
          start = end;
        }
      };
      const timber = fieldHut ? new THREE.BoxGeometry(1, 1, 1) : null;
      // 木取りは回転前の部材で決める。踏板は横、脚は縦、側桁は坂に沿う繊維にし、
      // 木口へ板目を引き延ばさない。木肌と材質は全棟で共有し、設営時だけまとめる。
      const timberPart = (w, h, d, axis) => {
        const g = timber.clone(); g.scale(w, h, d);
        const p = g.attributes.position, normals = g.attributes.normal, uv = g.attributes.uv;
        for (let i = 0; i < p.count; i++) {
          const end = Math.abs(axis === 'x' ? normals.getX(i) : axis === 'y' ? normals.getY(i) : normals.getZ(i)) > .5;
          let across, along;
          if (axis === 'x') {
            across = Math.abs(normals.getY(i)) > .5 ? p.getZ(i) / d : p.getY(i) / h;
            along = p.getX(i) / w;
          } else if (axis === 'y') {
            across = Math.abs(normals.getX(i)) > .5 ? p.getZ(i) / d : p.getX(i) / w;
            along = p.getY(i) / h;
          } else {
            across = Math.abs(normals.getY(i)) > .5 ? p.getX(i) / w : p.getY(i) / h;
            along = p.getZ(i) / d;
          }
          uv.setXY(i, end ? .5 + (axis === 'x' ? p.getY(i) : p.getX(i)) : across + .5,
            end ? .5 + (axis === 'z' ? p.getY(i) : p.getZ(i)) : along + .5);
        }
        return g;
      };
      // 詰所・民家の踏板と踊り場を、一枚の幅広い板ではなく側桁に渡す板で納める。
      // 板の長手は左右の脚・桁を結ぶ向き。共通の箱を設営時だけ既存の束へまとめる。
      const plankDeck = (width, depth, top, centerZ, color, thickness = .06) => {
        const count = Math.max(1, Math.ceil(depth / .24)), pitch = depth / count;
        for (let j = 0; j < count; j++) {
          const board = timberPart(width, thickness, pitch - .003, 'x');
          put(board, I.door.lx, top - thickness / 2, centerZ - depth / 2 + (j + .5) * pitch,
            j % 2 ? 0x4e3c2a : color, true);
        }
      };
      for (let q = 0; q < n; q++) {
        const t = (q + 1) / n, top = gy + rise * t, lz = ds * (hd + pad + len * (1 - t) + len / n / 2);
        if (fieldHut) {
          // 踏板を木の塊にせず、両脇の脚で支える。脚の下端は斜面の地面へ納める。
          const width = I.door.w + .3, depth = len / n + .02;
          plankDeck(width, depth, top, lz, q % 2 ? 0x4e3c2a : 0x56432f);
          for (const side of [-1, 1]) {
            const lx = I.door.lx + side * (width / 2 - .1);
            const [wx, wz] = I.P(lx, lz);
            const bottom = Math.min(top - .08, rt.world.heightAt(wx, wz) - .05);
            const leg = timberPart(.12, top - .06 - bottom, Math.max(.08, depth - .12), 'y');
            put(leg, lx, (bottom + top - .06) / 2, lz, 0x3a2a1c, true);
          }
          continue;
        }
        if (templeStone) {
          stoneDeck(I.door.w + .3, len / n + .02, top, lz, q);
          continue;
        }
        const g = new THREE.BoxGeometry(I.door.w + 0.3, Math.max(0.1, top - gy + 0.3), len / n + 0.02);
        put(g, I.door.lx, (top + gy - 0.3) / 2, lz, stone ? (q % 2 ? 0x7c7468 : 0x847c70) : (q % 2 ? 0x4e3c2a : 0x56432f));
      }
      if (fieldHut) plankDeck(I.door.w + .4, pad + .4, lv.y, ds * (hd + pad / 2 - .1), 0x56432f);
      else if (templeStone) stoneDeck(I.door.w + .4, pad + .4, lv.y, ds * (hd + pad / 2 - .1), n);
      if (timber) timber.dispose();
      if (stoneBox) stoneBox.dispose();
    }
    continue;
    }
    if (I.approach) {
      const { pad, len, gy } = I.approach, rise = lv.y - gy, n = Math.max(3, Math.round(rise / 0.28));
      // 稲葉山の主殿・山麓館も、遠侍・用屋と同じ木の踏板と支えで上がる推定復元。
      // 木色の塊を積んだ階段にせず、本堂の石段とは分ける。
      const woodSteps = S.quality === 'high' && I.profile === 'inabayama'
        && ['goten', 'tamari', 'kura', 'bansho', 'nagaya', 'shrine'].includes(I.kind);
      // 稲葉山の本堂は石段と堂内の板床の間を、束で支えた木の踏板でつなぐ推定。
      // 同じ場所の石の踊り場は作らず、下の共通の框・踏板・根太を使う。
      const inabaHallLanding = S.quality === 'high' && I.profile === 'inabayama' && I.kind === 'hondo';
      const stone = !woodSteps && I.kind !== 'goten' && I.kind !== 'gate';
      // 同じ階段の踏板は一つの形を複製し、最後に外構の束へまとめる。
      const tread = woodSteps ? new THREE.BoxGeometry(I.door.w + .3, .09, len / n + .02) : null;
      for (let q = 0; q < n; q++) {
        const t = (q + 1) / n, top = gy + rise * t, lz = ds * (hd + pad + len * (1 - t) + len / n / 2);
        const stepH = woodSteps ? .09 : Math.max(0.1, top - gy + 0.3);
        const g = tread ? tread.clone() : new THREE.BoxGeometry(I.door.w + 0.3, stepH, len / n + 0.02);
        put(g, I.door.lx, woodSteps ? top - stepH / 2 : (top + gy - 0.3) / 2, lz, stone ? (q % 2 ? 0x7c7468 : 0x847c70) : (q % 2 ? 0x4e3c2a : 0x56432f));
      }
      if (woodSteps) {
        // 各段を独立した細柱で支えず、左右のささら桁で踏板を受ける推定。
        // 上端は踏板の裏へ段ごとに欠き込み、下端は斜めに通す。
        // 同じ形を左右で共有して外構へ結合し、歩行用の坂と段の高さは保つ。
        const outline = new THREE.Shape();
        outline.moveTo(0, rise / n - .09);
        for (let q = 0; q < n; q++) {
          outline.lineTo(len * (q + 1) / n, rise * (q + 1) / n - .09);
          if (q + 1 < n) outline.lineTo(len * (q + 1) / n, rise * (q + 2) / n - .09);
        }
        outline.lineTo(len, rise - .27); outline.lineTo(0, -.27); outline.closePath();
        const stringer = new THREE.ExtrudeGeometry(outline, { depth: .12, bevelEnabled: false, steps: 1, curveSegments: 1 });
        stringer.translate(0, 0, -.06); stringer.rotateY(ds * Math.PI / 2);
        for (const side of [-1, 1])
          put(stringer.clone(), I.door.lx + side * (I.door.w / 2 - .05), gy,
            ds * (hd + pad + len), 0x3a2a1c);
        stringer.dispose();
      }
      if (tread) tread.dispose();
      if (woodSteps) {
        // 稲葉山の玄関の上がり台は、濡れ縁に載せた受け材と板張りで納める推定。
        // 厚い一枚の塊をやめ、板の端を二本の横木で受ける。上面と歩行床は保つ。
        // 共通の角材を伸縮し、外構の束へ一度だけまとめる。
        const width = I.door.w + .4, depth = pad + .4;
        const centerZ = ds * (hd + pad / 2 - .1);
        const count = Math.max(2, Math.ceil(width / .24)), boardW = width / count;
        for (const side of [-1, 1])
          put(INABA_GIRDER_PART.clone().scale(width, .04, .1), I.door.lx,
            lv.y - .09, centerZ + side * (depth / 2 - .1), 0x3a2a1c);
        // 上がり台の受け材を宙へ浮かせず、四隅の束石と束柱で支える推定。
        // 斜面でも各足元の地面へ据え、柱頭は横木の下面で止める。
        // 足は台の内側に納め、共有の角材を外構の束へ一度だけ結合する。
        for (const sideX of [-1, 1]) for (const sideZ of [-1, 1]) {
          const x = I.door.lx + sideX * (width / 2 - .16);
          const z = centerZ + sideZ * (depth / 2 - .1);
          const [wx, wz] = I.P(x, z), ground = rt.world.heightAt(wx, wz);
          const top = lv.y - .11, stoneH = .08;
          if (top - ground <= stoneH + .03) continue;
          put(INABA_GIRDER_PART.clone().scale(.24, stoneH, .24), x,
            ground + stoneH / 2, z, 0x7c7468);
          const bottom = ground + stoneH;
          put(INABA_GIRDER_PART.clone().scale(.12, top - bottom, .12), x,
            (bottom + top) / 2, z, 0x3a2a1c);
        }
        // 目地の下にも薄い板を通し、床下や下段の縁側を隙間から透かさない。
        put(INABA_GIRDER_PART.clone().scale(width, .01, depth), I.door.lx,
          lv.y - .065, centerZ, 0x30281f);
        for (let i = 0; i < count; i++) {
          const x = I.door.lx - width / 2 + (i + .5) * boardW;
          put(INABA_GIRDER_PART.clone().scale(boardW - .004, .06, depth), x,
            lv.y - .03, centerZ, i % 2 ? 0x56432f : 0x4e3c2a);
          for (const side of [-1, 1])
            put(INABA_GIRDER_PART.clone().scale(.014, .002, .014), x,
              lv.y + .001, centerZ + side * (depth / 2 - .1), 0x252321);
        }
      } else if (!inabaHallLanding && !(I.profile === 'hieizan' && ['chudo', 'hondo', 'sobo'].includes(I.kind))) {
        const g = new THREE.BoxGeometry(I.door.w + 0.4, 0.12, pad + 0.4); put(g, I.door.lx, lv.y - 0.06, ds * (hd + pad / 2 - 0.1), stone ? 0x847c70 : 0x4e3c2a);
      }
      if (I.profile === 'hieizan' && I.kind === 'chudo') {
        // 中堂には寺の外形が持つ木の縁側があり、石段もその先端へ接する。
        // 同じ床高へ汎用の石の踊り場を重ねず、縁の踏板を仕上げにする。
      } else if (inabaHallLanding || I.profile === 'hieizan' && ['sobo', 'hondo'].includes(I.kind)) {
        // 僧坊と山の小堂の上がり口は、縁框に納めた木の踏板で板床へつなぐ。
        // 小堂も床を上げた木造の堂として扱い、石段はこの踏板の手前で止める。
        // 板割は推定。既存の踊り場と同じ高さ・範囲で、石段と戸の溝を保つ。
        // 単位箱を使い回し、設営時のまとめ描きだけへ加える。
        landingShape ||= new THREE.BoxGeometry(1, 1, 1);
        const width = I.door.w + .4, depth = pad + .4, rim = .08;
        const center = hd + pad / 2 - .1;
        const timber = (x, z, w, d, color) => {
          const g = landingShape.clone(); g.scale(w, .12, d);
          put(g, I.door.lx + x, lv.y - .06, ds * z, color);
        };
        for (const side of [-1, 1]) {
          timber(side * (width - rim) / 2, center, rim, depth, 0x4e3c2a);
          timber(0, center + side * (depth - rim) / 2, width - rim * 2, rim, 0x4e3c2a);
        }
        const span = width - rim * 2, count = Math.max(1, Math.ceil(span / .24));
        const pitch = span / count;
        for (let q = 0; q < count; q++)
          timber(-span / 2 + (q + .5) * pitch, center, pitch - .003, depth - rim * 2, q % 2 ? 0x56432f : 0x4e3c2a);
      }
    }
  }
  if (wood.length) {
    const M = mats();
    M.okeOuterWood ||= new THREE.MeshLambertMaterial({ vertexColors: true, map: interiorWoodTexture() });
    const mesh = new THREE.Mesh(mergeGeometries(wood), M.okeOuterWood);
    mesh.castShadow = mesh.receiveShadow = true; mesh.matrixAutoUpdate = false;
    rt.scene.add(mesh);
  }
  if (landingShape) landingShape.dispose();
  if (list.length) {
    const mesh = new THREE.Mesh(mergeGeometries(list), mats().door);
    mesh.castShadow = mesh.receiveShadow = true; mesh.matrixAutoUpdate = false;
    rt.scene.add(mesh);
  }
}
