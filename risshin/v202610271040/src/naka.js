import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FL, addDeck, addRamp, rampSurface } from './floors.js';
import { SOLIDS } from './props.js';
import { INTERIOR_WALLS, makeInteriorGuards, interiorSafeSpot, interiorFloorBlocked, interiorBlocked } from './shironaka.js';
import { interiorLayout, interiorFloorAt, shitaragaharaTempleMats, shitaragaharaHomePanels, interiorPartitionHeight, interiorPartitionHeaders, interiorPartitionSpans, interiorWaypoint, prepareInteriorPaths, interiorPropBlocksWalk, igaFixedPanelRange, interiorLampSpot } from './interior_layouts.js';
import { HONNOJI_ALTAR_FRAME, honnojiCeilingPieces, honnojiCeilingRims, honnojiCeilingGrid, honnojiAltarLamps, interiorPanelHeight, interiorHeadTieHeight, inabaBoardTexture, INABA_ALTAR_SUSPENSION_DROP, inabaAltarBackHeight, tomyo, lightPool, furnishLayout, nageshiGeometry, nageshiNail, templeCeilingBoard, templeRoundPost, timberBox, batchInterior, SHITARAGAHARA_CEILING_LIFT, hieiAltarLamps, hieiNageshiHeight, hieiPartitionHeight, HIEI_DOOR_TRACK, HIEI_ENTRY_TRACK, HIEI_SOBO_SILL, MORIBE_WRITING_TOOLS, nodaDoorHeight, nodaNageshiHeight, nodaPartitionPosts, koshiTimbers, paperDoorTimbers, nodaCanopySupport, ceilingWoodMaterial as nodaWoodMaterial, igaCeilingBoards, igaSootShade, igaPlasterWalls, igaShojiKoshi, IGA_DOOR_GROOVE_W, interiorDoorHeight, interiorDoorSill, interiorJinageshiHeight, hallBracketGeometry, hallPostGeometry, interiorPlasterMaterial } from './interior_parts.js';
import { setInteriorSound } from './audio.js';
import { S } from './settings.js';
import { thatchTex, woodTex } from './nature.js';
import { addNaibu, addNaibuStairs } from './naibu_kit.js';
import { cgtOn, cgtHas, KitBatch } from './cgt.js';
import { yaguraTick } from './yagura_play.js';
import { addNakaDoors, buildNakaDoorMeshes, nakaDoorTick, resetNakaDoors, nakaDoorStopOffset, NAKA_WINDOW_TRACK, IGA_WINDOW_INSET, IGA_SHOJI_WINDOW_INSET } from './naka_doors.js';
import { drawGroundAt } from './render_camera.js';
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

const REDUCE_MOTION = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
const INABA_WALL_BOARD = new THREE.BoxGeometry(1, 1, 1);
// 森部の油灯。描画部品 tomyo(true) の台座・支柱・受皿・油皿と同じ高さと最大半径。
// 床置きと須弥壇上で共用し、炎には木や金属の当たりを付けない。
const MORIBE_LAMP_PARTS = [[.16, 0, .06], [.035, .06, .73], [.13, .73, .78], [.09, .78, .83]];

export const NAKA = { list: [], flagged: [], t: 0, outer: false, cur: null, dim: 1, lt: null };
// 兵の判定の印は戦をまたいでも戻さず、前の戦の控えと取り違えない。
let roomScanPass = 0;
// 民家の油皿の原形は全戸で共有。光の焼き込みには設営時の写しを渡す。
let villageOilDish, villageOilRim, villageOilSurface;

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

// 連子窓の框・縦連子・横貫。窓の左下を基準に、内外と当たりで寸法を共有する。
// 設営時だけ使う。横貫は縦連子の側面で止め、木口の面を重ねない。
export function windowLatticeMembers(w, h) {
  const members = [];
  for (const side of [-1, 1]) {
    members.push([side * (w / 2 - .025), h / 2, .05, h, .07]);
    members.push([0, h / 2 + side * (h / 2 - .025), w - .1, .05, .07]);
  }
  const bays = Math.max(2, Math.round((w - .1) / .18));
  for (let q = 1; q < bays; q++)
    members.push([-w / 2 + .05 + (w - .1) * q / bays, h / 2, .025, h - .1, .04]);
  for (const ratio of [.3, .7]) for (let q = 0; q < bays; q++) {
    const start = -w / 2 + .05 + (w - .1) * q / bays + (q ? .0125 : 0);
    const end = -w / 2 + .05 + (w - .1) * (q + 1) / bays - (q + 1 < bays ? .0125 : 0);
    members.push([(start + end) / 2, .05 + (h - .1) * ratio, end - start, .035, .05]);
  }
  return members;
}

// 野田福島の鴨居。描く横木と同じ厚みで受け、戸が通る二本の溝は空ける。
// 玄関は五センチ、間仕切りは十四センチずれた戸を使うため、溝幅を渡す。
// 設営時だけ作り、形・材質や開閉中の仕事は増やさない。
function nodaLintelSolids(I, left, right, z, y, lips) {
  seg(I, left + .2, z, right - .2, z, y + .012, y + .1, .2);
  for (const [a, b] of lips) {
    const radius = (b - a) / 2;
    seg(I, left + radius, z + (a + b) / 2, right - radius, z + (a + b) / 2,
      y, y + .012, radius);
  }
}

// 比叡山の欄間は透けた格子。鴨居から天井まで一枚の見えない壁にしない。
// 室内部品と同じ割付で、柱・横桟・縦桟・小壁だけに当たりを作る。
// 設営時に一度登録し、堂が焼ける時は既存の室内の当たりと一緒に外す。
function hieiPartitionHead(I, lv, ax, bx, z, inset = 0) {
  const hall = ['chudo', 'hondo'].includes(I.kind), sobo = I.kind === 'sobo';
  const ph = hieiPartitionHeight(I.kind, lv.h), y = lv.y;
  if (!(hall || sobo)) { seg(I, ax, z, bx, z, y + ph, y + lv.h, .08); return; }
  const head = sobo ? lv.h - .022 - .14 : lv.h - .11;
  const nageshi = hieiNageshiHeight(I.kind, lv.h);
  const bottom = ph + .1, upper = nageshi - .06;
  // 固定建具の端柱は欄間の両脇まで通る。脇戸の上には端柱を足さない。
  if (inset) {
    seg(I, ax, z, ax + inset, z, y + ph, y + head, .06);
    seg(I, bx - inset, z, bx, z, y + ph, y + head, .06);
  }
  seg(I, ax, z, bx, z, y + ph, y + bottom, .07);
  const left = ax + inset, right = bx - inset, len = right - left;
  if (len <= .001) return;
  if (upper - bottom < (sobo ? .09 : .15)) {
    seg(I, left, z, right, z, y + bottom, y + lv.h, .08);
    return;
  }
  // 格子の厚みも描く材に合わせ、隙間へ太い当たりを張り出させない。
  for (const [a, b] of [[bottom, bottom + .03], [upper - .03, upper]]) {
    seg(I, left, z, right, z, y + a, y + b, .025);
  }
  const count = Math.max(1, Math.ceil(len / (hall ? .14 : .18)));
  for (let i = 0; i <= count; i++) {
    const x = left + .0125 + i * (len - .025) / count;
    seg(I, x - .0125, z, x + .0125, z,
      y + bottom + .03, y + upper - .03, .0175);
  }
  // 長押より上の小壁と天井の梁は木・塗り壁の当たりを保つ。
  seg(I, left, z, right, z, y + upper, y + lv.h, .08);
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

// 外周の地長押も各室の床から測る。上がり床の境で分け、同じ高さの材は通す。
// 設営時の当たりと、近づいた時の室内で同じ割付・開口を使う。
function outerJinageshi(lv, face, side, holes, holeOffset = 0) {
  const len = face === 'z' ? lv.w : lv.d;
  const edge = side * (face === 'z' ? lv.d : lv.w) / 2;
  const spans = [];
  for (const r of lv.layout.rooms) {
    const boundary = face === 'z' ? side < 0 ? r.z0 : r.z1 : side < 0 ? r.x0 : r.x1;
    if (Math.abs(boundary - edge) > .001) continue;
    const a = face === 'z' ? r.x0 : r.z0, b = face === 'z' ? r.x1 : r.z1;
    const railY = .32 + (r.y || 0);
    const cuts = holes.filter(o => o.y0 - holeOffset < railY + .045 && o.y1 - holeOffset > railY - .045)
      .map(o => ({ t0: o.t0, t1: o.t1, y0: 0, y1: .09 }));
    for (const [t0, t1] of facePanels(len, .09, cuts)) {
      const start = Math.max(a, t0), end = Math.min(b, t1);
      if (end - start > .001) spans.push([start, end, railY]);
    }
  }
  spans.sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const span of spans) {
    const last = out[out.length - 1];
    if (last && Math.abs(last[1] - span[0]) < .001 && last[2] === span[2]) last[1] = span[1];
    else out.push(span);
  }
  return out;
}

// 窓の穴は設営時に一度決め、当たりと室内の絵で使い回す。
function windowsFor(I, lv, k) {
  if (lv.windows) return lv.windows;
  const hw = lv.w / 2, hd = lv.d / 2, h = lv.h;
  const goten = !['tenshu', 'yagura', 'gate'].includes(I.kind);
  // 岩村の板小屋は、裏の連子窓だけを外観と同じ位置で抜く。床高は地面から五十五センチ。
  if (I.profile === 'iwamura_' + I.kind && ['kura', 'bansho', 'nagaya'].includes(I.kind)) {
    return lv.windows = S.quality === 'high'
      ? [{ face: 'z', s: -I.door.side, t: 0, w: .78, y0: 1.27, y1: 1.73, shutter: true }] : [];
  }
  let wins = I.wins ? I.wins(lv, k) : null;
  // この戦の板壁の詰所・用屋には、外壁にない明かり障子を内側だけ描かない。
  if (!wins && S.quality === 'high' && I.profile === 'nodafukushima'
    && ['goten', 'nagaya', 'bansho', 'kura', 'minka'].includes(I.kind)) wins = [];
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
    hasExterior: !!o.hasExterior, roof: o.roof || null, open: !!o.open, team: o.team, oku: o.oku ?? (o.kind === 'goten' ? .4 : 0), wins: o.wins || null, built: false, mesh: null, glows: [], stairs: [], seen: {}, onEnter: null, onLevel: null,
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
    // 二組の戸の間に、閉じた障子にも触れず立てる土間を残す。
    const entryDepth = S.quality === 'high' && I.profile === 'shitaragahara' && I.kind === 'minka' ? 1.65 : null;
    lv.layout = interiorLayout(I.kind, lv.w, lv.d, { oku: I.oku || .4, side: ds, profile: I.profile, entryX: I.door.lx, entryW: I.door.w, shrineOffering: S.quality === 'high', doorClearance: S.quality === 'high', boardFinish: .012, entryDepth, use: o.interiorUse, slidingWindows: I.templePaper, raisedTatami: S.quality === 'high',
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
    // 本能寺の付属棟の表口にも建具を付ける。戸幅を実際の開口に合わせ、
    // 既存の引き戸と同じ札・横滑り・挟み込み防止を使う。蔵の表戸の初期状態は naka_doors.js で決める。
    if (lv.k === 0 && I.profile?.startsWith('honnoji_') && !lv.layout.portals.some(p => p.exterior)) {
      const kind = ['kura', 'kuri'].includes(I.kind) ? 'itado'
        : ['hondo', 'chudo', 'temple'].includes(I.kind) ? 'koshi' : 'shoji';
      lv.layout.portals.push({ x: I.door.lx, z: ds * lv.d / 2, axis: 'z', kind,
        l: I.door.lx - I.door.w / 2, r: I.door.lx + I.door.w / 2, exterior: true,
        floorY: I.profile === 'honnoji_kuri' ? lv.layout.rooms[1].y - .04 : 0 });
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
    const earth = S.quality === 'high' && I.profile === 'shitaragahara' && I.kind === 'minka'
      ? lv.layout.rooms.find(r => r.floor === 'earth') : null;
    if (earth) {
      // 土間と上がり床を別の歩行面にする。床の高さは見た目にも同じ値を渡す。
      lv.pieces = lv.pieces.flatMap(([x0, x1, z0, z1]) => {
        const pieces = [];
        if (z0 < earth.z0) pieces.push([x0, x1, z0, Math.min(z1, earth.z0), 0]);
        const a = Math.max(z0, earth.z0), b = Math.min(z1, earth.z1);
        if (b > a) pieces.push([x0, x1, a, b, earth.y]);
        if (z1 > earth.z1) pieces.push([x0, x1, Math.max(z0, earth.z1), z1, 0]);
        return pieces;
      });
    }
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
    for (const [x0, x1, z0, z1, floorY = 0] of lv.pieces) {
      const [cx, cz] = I.P((x0 + x1) / 2, (z0 + z1) / 2);
      // 土間を分けた民家では、板間の足場を既定の四十センチだけ土間へ広げない。
      const id = addDeck({ x0: -(x1 - x0) / 2, x1: (x1 - x0) / 2, z0: -(z1 - z0) / 2, z1: (z1 - z0) / 2, rot, cx, cz, y: lv.y + floorY, name: `${I.name} ${k + 1}階`, roof: lv.y + lv.h, pad: earth || ['iga', 'moribe'].includes(I.profile) ? 0 : undefined });
      FL.decks[id].interior = true;
      const a = (x1 - x0) * (z1 - z0);
      if (a > area) { area = a; main = id; }
    }
    I.deckIds.push(main);
    lv.layout.floorPieces = lv.pieces;
    // 本能寺の付属棟は床組でなく、畳縁・土間の仕上げ面に足を載せる。
    // 部屋と床片の重なりだけを使い、階段の穴や隣の板間へ歩行面を広げない。
    // 二条御所の歩行高は外観を作る側で合わせているため、ここでは重ねない。
    // 設営時だけ足場を登録し、既存の床の升目で調べる。
    if (I.profile?.startsWith('honnoji_') && I.profile !== 'honnoji_nijo' || I.profile === 'hieizan' && ['sobo', 'kuri'].includes(I.kind)) {
      for (const r of lv.layout.rooms) {
        if (I.profile === 'hieizan' && r.floor !== 'tatami') continue;
        const raisedBack = I.profile === 'hieizan' && I.kind === 'kuri' ? r.z1 - HIEI_ENTRY_TRACK - .1 : r.z1;
        const finish = r.floor === 'tatami' ? I.profile === 'hieizan' ? HIEI_SOBO_SILL : .066 : r.floor === 'earth' ? .0255 : 0;
        if (!finish && !r.y) continue;
        for (const v of lv.pieces) {
          const x0 = Math.max(r.x0, v[0]), x1 = Math.min(r.x1, v[1]);
          const z0 = Math.max(r.z0, v[2]), z1 = Math.min(raisedBack, v[3]);
          if (x1 <= x0 || z1 <= z0) continue;
          const [cx, cz] = I.P((x0 + x1) / 2, (z0 + z1) / 2);
          const id = addDeck({ cx, cz, rot, x0: -(x1 - x0) / 2, x1: (x1 - x0) / 2,
            z0: -(z1 - z0) / 2, z1: (z1 - z0) / 2, y: lv.y + (r.y || 0) + finish,
            roof: lv.y + lv.h, pad: 0, name: r.name });
          FL.decks[id].interior = true;
        }
      }
    }
    if (earth) {
      // 手前の二本の溝まで框を張り出し、障子の下に土間との隙間を残さない。
      const [cx, cz] = I.P(0, (ds > 0 ? earth.z0 : earth.z1) + ds * .16);
      const id = addDeck({ x0: -hw, x1: hw, z0: -.16, z1: .16, rot, cx, cz,
        y: lv.y, roof: lv.y + lv.h, pad: 0, name: '上がり框' });
      FL.decks[id].interior = true;
    }
    if (S.quality === 'high' && I.profile === 'shitaragahara') {
      // 六センチ厚の畳は、絵だけでなく足場も表へ上げる。
      // 板縁・土間・中央の参道を持ち上げず、設営時に畳の範囲だけ登録する。
      const matDeck = (x0, x1, z0, z1, floorY, name, localRot = 0) => {
        const [cx, cz] = I.P((x0 + x1) / 2, (z0 + z1) / 2);
        const id = addDeck({ cx, cz, rot: rot + localRot, x0: -(x1 - x0) / 2, x1: (x1 - x0) / 2,
          z0: -(z1 - z0) / 2, z1: (z1 - z0) / 2, y: lv.y + floorY + .06,
          roof: lv.y + lv.h, pad: 0, name });
        FL.decks[id].interior = true;
      };
      if (I.kind === 'minka') for (const r of lv.layout.rooms) if (r.floor === 'tatami') {
        for (const v of lv.pieces) {
          // 畳寄せも畳と同じ六センチ厚。壁際や敷居前で足だけ板床へ沈ませない。
          const x0 = Math.max(r.x0, v[0]), x1 = Math.min(r.x1, v[1]);
          const z0 = Math.max(r.z0, v[2]), z1 = Math.min(r.z1, v[3]);
          if (x1 > x0 && z1 > z0) matDeck(x0, x1, z0, z1, r.y || 0, '小座敷の畳');
        }
      }
      if (I.kind === 'hondo') for (const m of shitaragaharaTempleMats(lv.layout))
        matDeck(m.x - m.w / 2, m.x + m.w / 2, m.z - m.d / 2, m.z + m.d / 2,
          m.y, m.name, m.rot);
    }
    lv.layout.floorPieces = lv.pieces;
    // 部屋と床片の重なりだけを使い、階段の穴や隣の板間へ歩行面を広げない。
    // 二条御所の歩行高は外観を作る側で合わせているため、ここでは重ねない。
    // 設営時だけ足場を登録し、既存の床の升目で調べる。
    if (I.profile?.startsWith('honnoji_') && I.profile !== 'honnoji_nijo' || I.profile === 'hieizan' && ['sobo', 'kuri'].includes(I.kind)) {
      for (const r of lv.layout.rooms) {
        if (I.profile === 'hieizan' && r.floor !== 'tatami') continue;
        const raisedBack = I.profile === 'hieizan' && I.kind === 'kuri' ? r.z1 - HIEI_ENTRY_TRACK - .1 : r.z1;
        const finish = r.floor === 'tatami' ? I.profile === 'hieizan' ? HIEI_SOBO_SILL : .066 : r.floor === 'earth' ? .0255 : 0;
        if (!finish && !r.y) continue;
        for (const v of lv.pieces) {
          const x0 = Math.max(r.x0, v[0]), x1 = Math.min(r.x1, v[1]);
          const z0 = Math.max(r.z0, v[2]), z1 = Math.min(raisedBack, v[3]);
          if (x1 <= x0 || z1 <= z0) continue;
          const [cx, cz] = I.P((x0 + x1) / 2, (z0 + z1) / 2);
          const id = addDeck({ cx, cz, rot, x0: -(x1 - x0) / 2, x1: (x1 - x0) / 2,
            z0: -(z1 - z0) / 2, z1: (z1 - z0) / 2, y: lv.y + (r.y || 0) + finish,
            roof: lv.y + lv.h, pad: 0, name: r.name });
          FL.decks[id].interior = true;
        }
      }
    }
    // 野田福島の座敷は厚さ六センチの畳。下地の床だけで足を受けると、
    // 御影堂・僧坊・庫裏・詰所の畳と、蔵・物置の上げ床に歩く上面を揃える。
    // 階段の穴は既存の床片で避け、設営時だけ既存の床検索へ登録する。
    if (S.quality === 'high' && I.profile === 'nodafukushima') {
      for (const r of lv.layout.rooms) {
        if (r.floor !== 'tatami' && !(r.floor === 'boards' && r.y > 0)) continue;
        const finishH = r.floor === 'tatami' ? .06 : .018;
        for (const [a, b, c, d] of lv.pieces) {
          const x0 = Math.max(a, r.x0), x1 = Math.min(b, r.x1);
          const z0 = Math.max(c, r.z0), z1 = Math.min(d, r.z1);
          if (x1 <= x0 || z1 <= z0) continue;
          const [cx, cz] = I.P((x0 + x1) / 2, (z0 + z1) / 2);
          const id = addDeck({ cx, cz, rot, x0: -(x1 - x0) / 2, x1: (x1 - x0) / 2,
            z0: -(z1 - z0) / 2, z1: (z1 - z0) / 2, y: lv.y + (r.y || 0) + finishH,
            roof: lv.y + lv.h, pad: 0, name: `${I.name}の${r.name}` });
          FL.decks[id].interior = true;
        }
      }
    }
    // 比叡山の僧坊と庫裏は畳・畳寄せが六センチ高い。板床の当たりだけでは足が畳へ沈む。
    // 座敷と食事の間だけ上面の足場を足し、入口の板間・炊事の土間は元の高さに保つ。
    // 設営時に登録し、既存の床の升目検索と焼失時の片付けをそのまま使う。
    if (I.profile === 'hieizan' && ['sobo', 'kuri'].includes(I.kind)) {
      for (const r of lv.layout.rooms) {
        if (r.floor !== 'tatami') continue;
        // 庫裏は入口の板戸の引き込み先を畳より低い板敷きにしている。
        // 描く畳寄せの端で足場も止め、戸の前で足が浮かないようにする。
        const raisedBack = I.kind === 'kuri' ? r.z1 - HIEI_ENTRY_TRACK - .1 : r.z1;
        for (const [a, b, c, d] of lv.pieces) {
          const x0 = Math.max(a, r.x0), x1 = Math.min(b, r.x1);
          const z0 = Math.max(c, r.z0), z1 = Math.min(d, raisedBack);
          if (x1 <= x0 || z1 <= z0) continue;
          const [cx, cz] = I.P((x0 + x1) / 2, (z0 + z1) / 2);
          const id = addDeck({ cx, cz, rot, x0: -(x1 - x0) / 2, x1: (x1 - x0) / 2,
            z0: -(z1 - z0) / 2, z1: (z1 - z0) / 2, y: lv.y + (r.y || 0) + HIEI_SOBO_SILL,
            roof: lv.y + lv.h, pad: 0, name: `${I.name}の${r.name}` });
          FL.decks[id].interior = true;
        }
      }
    }
    if (I.profile === 'moribe') {
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
      }
    }
    if (S.quality === 'high' && I.profile === 'nodafukushima' && ['hondo', 'sobo', 'kuri', 'goten', 'bansho', 'nagaya', 'kura', 'minka'].includes(I.kind)) {
      // 内障子は窓の倍の幅へ引き込む。僧坊の机や庫裏の竈・棚を、
      // 開いた戸と敷居・鴨居の通りへ置かない。民家の器棚や兵糧蔵の俵も同じ高さで避ける。
      // 設営時に絵と当たりを一緒に寄せる。
      // 腰窓より低い文机・筵・水甕まで室内へ押し出さず、窓下を使えるようにする。
      for (const v of wins) {
        if (v.shoji) continue;
        const axisX = v.face === 'x', edge = (axisX ? hw : hd) - .8;
        for (const p of lv.layout.props) {
          const along = axisX ? p.z : p.x, half = (axisX ? p.d : p.w) / 2;
          if (Math.abs(along - v.t) >= v.w + half + .12) continue;
          // 後で調度を載せる畳・板床の高さも含め、敷居から鴨居までと比べる。
          // 敷居の下面は窓下端より十四ミリ低い。矢箱の矢・石の上端も数える。
          const room = lv.layout.rooms.find(r => p.x >= r.x0 && p.x <= r.x1 && p.z >= r.z0 && p.z <= r.z1);
          const base = p.part === 'hallPost' ? 0 : p.part === 'hearth' || !room ? p.y || 0
            : (room.y || 0) + (room.floor === 'tatami' ? .06 : room.floor === 'earth' ? .025 : .018);
          const top = base + (p.part === 'hallPost' ? lv.h : p.h) + (p.part === 'stones' ? .18 : p.part === 'ammo' ? .05 : 0);
          if (top + .04 < v.y0 - .014 || base - .04 > v.y1 + .066) continue;
          if (axisX) {
            if (v.s > 0) p.x = Math.min(p.x, edge - p.w / 2);
            else p.x = Math.max(p.x, -edge + p.w / 2);
          } else {
            if (v.s > 0) p.z = Math.min(p.z, edge - p.d / 2);
            else p.z = Math.max(p.z, -edge + p.d / 2);
          }
        }
      }
    }
    const opening = wins.reduce((n, v) => n + v.w * Math.max(0, v.y1 - v.y0) * ((v.shoji || v.paperBacked) ? .45 : 1), 0);
    const light = Math.min(1, opening / Math.max(1, lv.w * lv.d * .12));
    lv.layout.dim = Math.min(.85, .28 + light * (world.def.time === 'night' ? .1 : world.def.time === 'dusk' ? .3 : .5));
    // 岩村の開閉できる障子窓には、外壁の当たりにも同じ穴を抜く。
    // 全面の壁を残すと、障子を引いても見えない土壁が視線と矢を遮ってしまう。
    // 腰壁・窓上の壁は残し、紙と框の遮りは動く戸板の当たりに任せる。
    const slidingShoji = S.quality === 'high' && (I.profile === 'iwamura' || I.profile?.startsWith('iwamura_'));
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
      if (I.profile === 'anegawa' && S.quality === 'high' && ['hondo', 'yashiki'].includes(I.kind)) {
        // 地長押は柱の内面を包む。室内の絵と同じ張り出しまで木で止める。
        // 戸口・窓を欠いてから隅を納め、入口の幅と外戸の引き込みは保つ。
        for (const [t0, t1, railY] of outerJinageshi(lv, face, sd, holes, 1.2)) {
          const start = face === 'x' ? Math.max(t0, -len / 2 + .275) : t0;
          const end = face === 'x' ? Math.min(t1, len / 2 - .275) : t1;
          if (end - start <= .06) continue;
          const at = sd * ((face === 'z' ? hd : hw) - .245);
          if (face === 'z') seg(I, start + .03, at, end - .03, at, lv.y + railY - .045, lv.y + railY + .045, .03).fusuma = false;
          else seg(I, at, start + .03, at, end - .03, lv.y + railY - .045, lv.y + railY + .045, .03).fusuma = false;
        }
      }
    }
    if (!I.open && k === 0 && S.quality === 'high' && I.profile === 'shitaragahara'
        && ['minka', 'hondo'].includes(I.kind)) {
      // 戸口の見込み枠は壁芯から前後十五センチある。外壁の線だけで
      // 止めると、戸を開けた時に縦枠の木口や頭上の鴨居へ体が入り込む。
      // buildInside の三本の木と同じ外寸だけを受け、戸口の幅は保つ。
      const dh = I.door.h ?? Math.min(lv.h - .3, 2);
      const bottom = earth ? earth.y : 0, dz = ds * hd;
      for (const side of [-1, 1]) {
        const x = I.door.lx + side * (I.door.w / 2 + .05);
        seg(I, x, dz - .1, x, dz + .1,
          lv.y + bottom, lv.y + dh, .05).bodyOverlap = true;
      }
      seg(I, I.door.lx - I.door.w / 2 + .05, dz,
        I.door.lx + I.door.w / 2 - .05, dz,
        lv.y + dh, lv.y + dh + .1, .15).bodyOverlap = true;
    }
    if (!I.open) for (const v of wins) {
      if (S.quality === 'high' && I.profile === 'shitaragahara'
          && ['minka', 'hondo'].includes(I.kind) && v.sliding && v.face === 'z') {
        // 障子の溝と外枠を結ぶ見込み板も、絵と同じ木部だけを受ける。
        // 開いた紙戸の四周に槍や体が抜ける隙間を残さず、窓の中央は塞がない。
        // 下の buildInside と同じ内外端を使い、設営時だけ四本を登録する。
        const inner = hd - .36 + .11;
        const outer = I.kind === 'hondo'
          ? hd + .15 + .1 - (v.exteriorLattice ? .09 : .08) : hd + .15;
        const depth = outer - inner, center = v.s * (inner + outer) / 2;
        for (const side of [-1, 1]) {
          const t = v.t + side * (v.w / 2 + .025);
          seg(I, t, v.s * (inner + .025), t, v.s * (outer - .025),
            lv.y + v.y0 - .05, lv.y + v.y1 + .05, .025).bodyOverlap = true;
        }
        for (const yy of [v.y0 - .025, v.y1 + .025])
          seg(I, v.t - v.w / 2 + depth / 2, center,
            v.t + v.w / 2 - depth / 2, center,
            lv.y + yy - .025, lv.y + yy + .025, depth / 2).bodyOverlap = true;
      }
      // 民家の外格子は障子を開けても残る。外観と同じ本数・柱芯で木部だけを受ける。
      // 外寸は内寸より十八センチ大きい。紙戸は既存の内側の溝を滑らせる。
      if (S.quality === 'high' && I.profile === 'shitaragahara' && I.kind === 'minka'
          && v.exteriorLattice && v.face === 'z') {
        const bars = Math.max(2, Math.round(v.w / .18)), offset = v.s * (hd + .09 + .08);
        for (let j = 0; j < bars; j++) {
          const t = v.t + (j - (bars - 1) / 2) * v.w / bars;
          seg(I, t, offset, t, offset, lv.y + v.y0, lv.y + v.y1, .0175);
        }
        // 外格子を受ける窓枠も、外観と同じ幅七センチ・見込み二十八センチで受ける。
        // 内側の障子枠だけでは、外の縦枠・上下枠を体や武器がすり抜ける。
        // 木部だけを設営時に登録し、格子の隙間と障子の二本の溝は塞がない。
        for (const side of [-1, 1]) {
          const t = v.t + side * (v.w / 2 + .035);
          seg(I, t, offset - .105, t, offset + .105,
            lv.y + v.y0 - .06, lv.y + v.y1 + .06, .035).bodyOverlap = true;
        }
        for (const yy of [v.y0 - .03, v.y1 + .03])
          seg(I, v.t - v.w / 2 + .14, offset, v.t + v.w / 2 - .14, offset,
            lv.y + yy - .03, lv.y + yy + .03, .14).bodyOverlap = true;
        continue;
      }
      const villageLattice = S.quality === 'high' && I.profile === 'shitaragahara'
        && I.kind === 'hondo' && v.exteriorLattice && v.face === 'z';
      if (villageLattice) {
        // 小堂の裏窓は連子だけでなく、外観の縦枠・上下枠も残る。
        // 幅七センチ・見込み十八センチを外観と揃え、障子を開けても木を抜けさせない。
        const center = v.s * (hd + .15 + .1);
        for (const side of [-1, 1]) {
          const t = v.t + side * (v.w / 2 + .035);
          seg(I, t, center - .055, t, center + .055,
            lv.y + v.y0 - .07, lv.y + v.y1 + .07, .035).bodyOverlap = true;
        }
        for (const yy of [v.y0 - .035, v.y1 + .035])
          seg(I, v.t - v.w / 2 + .09, center, v.t + v.w / 2 - .09, center,
            lv.y + yy - .035, lv.y + yy + .035, .09).bodyOverlap = true;
      }
      // 裏窓の障子を開けても外の連子は残る。紙戸の有無とは別に木の当たりを登録する。
      if (v.shoji && !villageLattice) continue;
      if (I.profile === 'anegawa' && I.kind === 'hondo' && S.quality === 'high') {
        // 小堂の窓は外装に一組だけ組む。見えない三本の当たりを残さず、
        // 壁厚を通した連子と横貫の位置・太さをそのまま使う。
        const off = v.s * ((v.face === 'z' ? hd : hw) + .01);
        for (const [t, yy, ww, hh, depth] of windowLatticeMembers(v.w, v.y1 - v.y0)) {
          const radius = Math.min(ww, depth + .22) / 2;
          const along = Math.max(0, ww / 2 - radius), across = Math.max(0, (depth + .22) / 2 - radius);
          const a = v.t + t - along, b = v.t + t + along;
          const low = lv.y + v.y0 + yy - hh / 2, high = low + hh;
          if (v.face === 'z') seg(I, a, off - across, b, off + across, low, high, radius);
          else seg(I, off - across, a, off + across, b, low, high, radius);
        }
      } else if (I.profile === 'anegawa' && S.quality === 'high') {
        // 民家・館・番小屋の窓も、描く四方框・連子・横貫と同じ割り付けで止める。
        // 三本だけの見えない棒を残さず、木のない隙間からは矢と筒先が通る。
        const off = v.s * ((v.face === 'z' ? hd : hw) - .1);
        for (const [t, yy, ww, hh, depth] of windowLatticeMembers(v.w, v.y1 - v.y0)) {
          const radius = Math.min(ww, depth) / 2;
          const along = Math.max(0, ww / 2 - radius), across = Math.max(0, depth / 2 - radius);
          const a = v.t + t - along, b = v.t + t + along;
          const low = lv.y + v.y0 + yy - hh / 2;
          if (v.face === 'z') seg(I, a, off - across, b, off + across, low, low + hh, radius);
          else seg(I, off - across, a, off + across, b, low, low + hh, radius);
        }
      } else if (I.profile === 'nodafukushima') {
      // 野田福島の用屋は外壁に格子がある。内側へ別の三本を重ねず、
      // 外の七本と同じ位置・太さで受ける。内障子の溝とは離しておく。
      const lattice = v.outerLattice, count = lattice ? lattice.divisions : 2;
      const off = (v.face === 'z' ? hd : hw) + (lattice ? lattice.offset : -.1);
      const radius = lattice ? lattice.width / 2 : .025;
      const half = lattice ? lattice.depth / 2 - radius : .025;
      for (let q = 0; q <= count; q++) {
        const t = v.t + (lattice ? -v.w / 2 + q * v.w / count : (q - 1) * v.w * .3);
        if (v.face === 'z') seg(I, t, v.s * off - half, t, v.s * off + half, lv.y + v.y0, lv.y + v.y1, radius);
        else seg(I, v.s * off - half, t, v.s * off + half, t, lv.y + v.y0, lv.y + v.y1, radius);
      }
      // 寺の窓の横桟も、描く格子と同じ高さ・厚みだけで受ける。
      // 開いた内障子の溝を塞がず、桟の間は矢や槍を通す。
      for (const t of lattice?.crossbars || []) {
        const cy = lv.y + v.y0 + (v.y1 - v.y0) * t;
        const edge = v.s * ((v.face === 'z' ? hd : hw) + lattice.crossOffset);
        const r = lattice.crossDepth / 2;
        const span = (v.w + lattice.width) / 2 - r;
        if (v.face === 'z') seg(I, v.t - span, edge, v.t + span, edge,
          cy - lattice.crossHeight / 2, cy + lattice.crossHeight / 2, r);
        else seg(I, edge, v.t - span, edge, v.t + span,
          cy - lattice.crossHeight / 2, cy + lattice.crossHeight / 2, r);
      }

continue;
}
      if (!slidingShoji) {
      const off = v.s * ((v.face === 'z' ? hd : hw) - .1);
      // 三本だけの見えない棒を残さず、実際の縦桟・横桟の間を空ける。
      if (hieiWindowBars(I, v, (t, cy, w, h) => {
        const a = t - w / 2 + .02, b = t + w / 2 - .02;
        if (v.face === 'z') seg(I, a, off, b, off, lv.y + cy - h / 2, lv.y + cy + h / 2, .02);
        else seg(I, off, a, off, b, lv.y + cy - h / 2, lv.y + cy + h / 2, .02);
      })) continue;
      if (I.profile?.startsWith('honnoji_')) {
      // 本能寺の連子窓は約十五センチ間隔。描く縦木と同じ割付で、窓から体が抜けないようにする（推定）。
      const honnoji = I.profile?.startsWith('honnoji_'), n = honnoji ? Math.ceil(v.w / .15) : 4;
      for (let q = 1; q < n; q++) {
        const t = v.t + (honnoji ? -v.w / 2 + q * v.w / n : (q - 2) * v.w * .3);
        if (v.face === 'z') seg(I, t, v.s * (hd - .1) - .025, t, v.s * (hd - .1) + .025, lv.y + v.y0, lv.y + v.y1, .025);
        else seg(I, v.s * (hw - .1) - .025, t, v.s * (hw - .1) + .025, t, lv.y + v.y0, lv.y + v.y1, .025);
      }
      } else if (I.profile === 'inabayama') {
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
      } else {
      // 小堂の裏窓は外観の七本と当たりを揃える。室内側に別の三本を置かない。
      // 外寸は内寸より三十センチ大きく、格子は壁面から十二センチ外に付く。
      // 幅は柱間の七割、高さは開口の上下へ二センチずつ掛かる外観と同じ値。
      const bars = villageLattice ? 3 : 1;
      const pitch = villageLattice ? v.w / 7 : v.w * .3;
      const offset = villageLattice ? hd + .15 + .12 : hd - .1;
      const bottom = lv.y + v.y0 - (villageLattice ? .02 : 0);
      const top = lv.y + v.y1 + (villageLattice ? .02 : 0);
      for (let q = -bars; q <= bars; q++) {
        const t = v.t + q * pitch;
        if (v.face === 'z') seg(I, t, v.s * offset - .025, t, v.s * offset + .025, bottom, top, .025);
        else seg(I, v.s * (hw - .1) - .025, t, v.s * (hw - .1) + .025, t, bottom, top, .025);
      }

      }
      } else {
      // 岩村の裏窓は外観の七本の連子だけを受ける。
      // 内側へ三本の当たりを残すと、板戸を引いても空所で槍が止まり、
      // 外に見える連子には槍が抜ける。外壁厚も含めて描画側へそろえる。
      if (slidingShoji && v.shutter && v.face === 'z') {
        const utility = I.profile === 'iwamura_' + I.kind && ['kura', 'bansho', 'nagaya'].includes(I.kind);
        const pitch = utility ? .12 : v.w / 7;
        const normal = v.s * (hd + (utility ? .34 : .27));
        const halfWidth = utility ? .0225 : .025;
        const end = utility ? 0 : .02;
        for (let q = -3; q <= 3; q++) {
          const t = v.t + q * pitch;
          // 長さゼロの線は射線の判定が省くため、見込みの中心に五ミリ残す。
          seg(I, t, normal - .0025, t, normal + .0025, lv.y + v.y0 - end, lv.y + v.y1 + end, halfWidth);
        }
      } else for (let q = -1; q <= 1; q++) {
        const t = v.t + q * v.w * .3;
        if (v.face === 'z') seg(I, t, v.s * (hd - .1) - .025, t, v.s * (hd - .1) + .025, lv.y + v.y0, lv.y + v.y1, .025);
        else seg(I, v.s * (hw - .1) - .025, t, v.s * (hw - .1) + .025, t, lv.y + v.y0, lv.y + v.y1, .025);
      }

      }
    }
    // 伊賀の格子窓は縦材だけでなく、中央の横桟でも槍と矢を止める。
    // 室内に描く幅四センチ・見込み五センチの横木へ合わせ、
    // 格子の隙間と内側を滑る雨戸・障子はそのまま通す。
    if (I.profile === 'iga' && !I.open) for (const v of wins) if (!v.shoji) {
      const midY = lv.y + (v.y0 + v.y1) / 2;
      const off = v.s * ((v.face === 'z' ? hd : hw) - .1);
      const start = v.t - v.w / 2 + .025, end = v.t + v.w / 2 - .025;
      const rail = v.face === 'z'
        ? seg(I, start, off, end, off, midY - .02, midY + .02, .025)
        : seg(I, off, start, off, end, midY - .02, midY + .02, .025);
      rail.bodyOverlap = true;
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
    // 高い格子窓の前には踏み台。低い窓や井楼には置かない。
    lv.firingSteps = [];
    for (const v of wins) if (!v.shoji && v.y0 > 1.8) {
      // 本能寺の経蔵の高窓は経巻棚の上へ明かりを通す窓。
      // 城の狭間用の踏み台・坂を自動で置くと、棚の前の板間が持ち上がる。
      // 高窓と格子は保ち、描く踏み台・歩行面・射手の足元をまとめて作らない。
      if (I.profile === 'honnoji_kyozo') continue;
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
    // 岩村の座敷は畳の上端を歩く。板床の高さのままでは足が畳へ六・六センチ沈む。
    // 上段も同じ厚さを足し、敷居と調度に合わせる。床片で切り、階段の穴を塞がない。
    const tatamiWalk = S.quality === 'high' && ['iwamura', 'iwamura_yashiki'].includes(I.profile);
    // 岩村の基本形の板床も、調度と同じ十二ミリの板厚を足元へ渡す。
    // 内陣・神座・長屋の上げ床だけでなく、外陣と屋敷の板縁も板の上を歩く。
    // 専用の板敷きの上端へ、設営時だけ歩行面を登録する。
    const boardWalk = S.quality === 'high' && (I.profile === 'iwamura' || I.profile?.startsWith('iwamura_'));
    // 用屋の土間も、描いた叩きの上端へ足元をそろえる。
    // 灯明・地覆と同じ二十五・五ミリを使い、床片の外へ歩行面を広げない。
    // 土間の仕上げは買った板床の有無によらず共通。毎コマの処理は増やさない。
    const earthWalk = S.quality === 'high' && I.profile === 'iwamura_' + I.kind
      && ['kura', 'bansho', 'nagaya'].includes(I.kind);
    for (const room of lv.layout.rooms) if (tatamiWalk && room.floor === 'tatami'
      || boardWalk && room.floor === 'boards'
      || earthWalk && room.floor === 'earth') for (const piece of lv.pieces) {
      const x0 = Math.max(room.x0, piece[0]), x1 = Math.min(room.x1, piece[1]);
      const z0 = Math.max(room.z0, piece[2]), z1 = Math.min(room.z1, piece[3]);
      if (x1 <= x0 || z1 <= z0) continue;
      const [cx, cz] = I.P((x0 + x1) / 2, (z0 + z1) / 2);
      const id = addDeck({ cx, cz, rot, x0: -(x1 - x0) / 2, x1: (x1 - x0) / 2,
        z0: -(z1 - z0) / 2, z1: (z1 - z0) / 2,
        y: lv.y + (room.y || 0) + (room.floor === 'tatami' ? .066 : room.floor === 'earth' ? .0255 : .012),
        roof: lv.y + lv.h, name: room.name, pad: 0 });
      FL.decks[id].interior = true;
    }
    const raisedSanctuary = S.quality === 'high' && ['iwamura_hondo', 'iwamura_shrine'].includes(I.profile) && lv.layout.rooms[0].raised;
    const raisedUtility = S.quality === 'high' && I.profile === 'iwamura_' + I.kind && ['kura', 'bansho', 'nagaya'].includes(I.kind) && lv.layout.rooms[0].raised;
    // 土間・入口より高い板間と畳。足場の余白を広げず、床の端で一段上がる。
    if (I.profile === 'anegawa') for (const r of lv.layout.rooms) {
      if (!['boards', 'tatami'].includes(r.floor) || !(r.y > 0)) continue;
      for (const v of lv.pieces) {
        const x0 = Math.max(r.x0, v[0]), x1 = Math.min(r.x1, v[1]), z0 = Math.max(r.z0, v[2]), z1 = Math.min(r.z1, v[3]);
        if (x1 <= x0 || z1 <= z0) continue;
        const [cx, cz] = I.P((x0 + x1) / 2, (z0 + z1) / 2);
        const id = addDeck({ cx, cz, x0: -(x1 - x0) / 2, x1: (x1 - x0) / 2, z0: -(z1 - z0) / 2, z1: (z1 - z0) / 2, rot, y: lv.y + r.y, roof: lv.y + lv.h, pad: 0, name: r.name });
        FL.decks[id].interior = true;
      }
      if (S.quality === 'high') for (const edge of [r.z0, r.z1]) {
        if (!lv.layout.walls.some(w => !w.guideOnly
          && Math.abs(w.az - edge) < .001 && Math.abs(w.bz - edge) < .001)) continue;
        // 敷居は床境から両側へ十七センチ。低い側にも同じ高さの足場を置き、
        // 土間・外陣の足が受け材へ潜らないようにする。戸の通れる幅は変えない。
        for (const lower of lv.layout.rooms) {
          if ((lower.y || 0) >= r.y || !(Math.abs(lower.z0 - edge) < .001
            || Math.abs(lower.z1 - edge) < .001)) continue;
          for (const v of lv.pieces) {
            const x0 = Math.max(r.x0, lower.x0, v[0]), x1 = Math.min(r.x1, lower.x1, v[1]);
            const z0 = Math.max(edge - .17, lower.z0, v[2]), z1 = Math.min(edge + .17, lower.z1, v[3]);
            if (x1 <= x0 || z1 <= z0) continue;
            const [cx, cz] = I.P((x0 + x1) / 2, (z0 + z1) / 2);
            const id = addDeck({ cx, cz, x0: -(x1 - x0) / 2, x1: (x1 - x0) / 2,
              z0: -(z1 - z0) / 2, z1: (z1 - z0) / 2, rot, y: lv.y + r.y,
              roof: lv.y + lv.h, pad: 0, name: '敷居' });
            FL.decks[id].interior = true;
          }
        }
      }
    }
    if (I.profile === 'inabayama') {
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
    } else if (!tatamiWalk && !boardWalk && ((I.kind === 'goten' && lv.layout.rooms[0].raised !== false) || raisedSanctuary || raisedUtility)) {
      const r = lv.layout.rooms[0];
      // 岩村の上段・内陣・神座・用屋の板間は引き戸の敷居まで床を通す。
      const fitted = (S.quality === 'high' && I.profile === 'iwamura') || raisedSanctuary || raisedUtility;
      const insetX = fitted ? 0 : .15, insetZ = fitted ? 0 : .2;
      for (const v of lv.pieces) {
        const x0 = Math.max(r.x0 + insetX, v[0]), x1 = Math.min(r.x1 - insetX, v[1]), z0 = Math.max(r.z0 + insetZ, v[2]), z1 = Math.min(r.z1 - insetZ, v[3]);
        if (x1 <= x0 || z1 <= z0) continue;
        const [cx, cz] = I.P((x0 + x1) / 2, (z0 + z1) / 2);
        // 岩村の上げ床は描いた段鼻で止める。既定の余白では低い側へ四十センチ
        // 張り出し、土間や外陣で足が浮き、戸口の手前で見えない段を上ってしまう。
        const id = addDeck({ cx, cz, x0: -(x1 - x0) / 2, x1: (x1 - x0) / 2, z0: -(z1 - z0) / 2, z1: (z1 - z0) / 2,
          rot, y: lv.y + (fitted ? r.y || 0 : .16), roof: lv.y + lv.h, pad: fitted ? 0 : .4,
          name: raisedSanctuary || raisedUtility ? r.name : '上段の間' });
        FL.decks[id].interior = true;
      }
    }
        // 伊賀は上がり床・畳厚・土間の表面へ足場をそろえ、足が床へ埋まらないようにする。
    // 既定の余白四十センチを足すと、板間や畳の高さが土間へ張り出す。
    // 下地の床も含めて実寸で止め、見える上がり框の位置で段を上り下りする。
    if (I.profile === 'iga') for (const r of lv.layout.rooms) if (r.floor === 'earth' || (['boards', 'tatami'].includes(r.floor) && r.y > 0)) {
      const [cx, cz] = I.P((r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2);
      const id = addDeck({ cx, cz, rot, x0: -(r.x1 - r.x0) / 2, x1: (r.x1 - r.x0) / 2,
        z0: -(r.z1 - r.z0) / 2, z1: (r.z1 - r.z0) / 2,
        y: lv.y + (r.y || 0) + (r.floor === 'earth' ? .0255 : r.floor === 'tatami' ? .06 : 0), roof: lv.y + lv.h, name: r.name, pad: 0 });
      FL.decks[id].interior = true;
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
if (S.quality === 'high' && I.profile === 'nodafukushima') {
    const nodaPartitions = S.quality === 'high' && I.profile === 'nodafukushima';
    const partitionH = nodaPartitions ? nodaDoorHeight(lv.h) : Math.min(2.3, lv.h - .3);
    for (const v of lv.layout.walls) {
      const wall = seg(I, v.ax, v.az, v.bx, v.bz,
        y0, nodaPartitions && v.paper ? lv.y + partitionH : y1, .08);
      wall.fusuma = v.paper;
      // 紙の間仕切りでも木の柱には矢・槍が通らない。描画と同じ柱割りを使い、
      // 戸口を狭めず、柱の間の紙だけは従来どおり突き通せるようにする。
      if (nodaPartitions && v.paper && !v.guideOnly && Math.abs(v.az - v.bz) <= .01) {
        const { width, positions } = nodaPartitionPosts(lv.layout, v);
        if (['hondo', 'goten', 'sobo', 'kuri'].includes(I.kind)) {
          // 内陣の固定の袖も、描く側と同じ柱間・格子割りで射線を受ける。
          // 人の移動用の壁は増やさず、木の部分の寸法だけ一度用意する。
          const start = Math.min(v.ax, v.bx), end = Math.max(v.ax, v.bx);
          const sill = lv.layout.rooms.some(r => r.floor === 'tatami'
            && (Math.abs(r.z0 - v.az) < .01 || Math.abs(r.z1 - v.az) < .01)) ? .06 : .028;
          const temple = I.kind === 'hondo', timbers = [];
          // 固定の襖・障子も動く戸と同じく、紙だけ槍を通す。
          // 袖は伸縮した九十センチの戸でなく、描く時の柱間寸法で框・組子・腰板を割る。
          if (temple) { wall.lattice = timbers; wall.fusuma = false; }
          else wall.paperTimbers = timbers;
          wall.yBot = lv.y + sill;
          let left = start;
          const fill = (a, b) => {
            if (b - a <= .08) return;
            const count = Math.max(1, Math.ceil((b - a) / .9)), pw = (b - a) / count;
            const parts = temple ? koshiTimbers(pw, partitionH - sill)
              : paperDoorTimbers(v.kind === 'shoji' ? 'shoji' : 'fusuma', 1, 1,
                v.kind === 'shoji' && ['sobo', 'kuri'].includes(I.kind), pw, partitionH - sill);
            for (let j = 0; j < count; j++) for (const part of parts) {
              const offset = a + pw * j - start;
              timbers.push([part[0] + offset, part[1] + offset, part[2], part[3], part[4]]);
            }
          };
          for (const x of [...positions].sort((a, b) => a - b)) {
            fill(left, Math.min(end, x - width / 2));
            left = Math.max(left, x + width / 2);
          }
          fill(left, end);
        }
        for (const x of positions) {
          const half = width / 2 - .005;
          // 柱頭は描く柱と同じく桁の下面で止める。桁の上や脇へ
          // 見えない柱を残さず、上部は下の桁・埋木で別々に受ける。
          const postTop = lv.y + lv.h - .27;
          for (const side of [-1, 1]) {
            seg(I, x - half, v.az + side * .075, x + half, v.az + side * .075, y0, postTop, .005);
            seg(I, x + side * half, v.az - .075, x + side * half, v.az + .075, y0, postTop, .005);
          }
        }
      }
    }
    // 同じ柱列に口が二つあっても、通し材と固定の欄間の当たりは一組だけ。
    const partitionRows = new Set();
    if (nodaPartitions) for (const p of lv.layout.portals) {
      const firstInRow = !partitionRows.has(p.z);
      partitionRows.add(p.z);
      // 紙戸の上は紙でなく鴨居と小壁。開けた戸口の上にも同じ当たりを通す。
      // 御影堂・僧坊・庫裏は透かし欄間の木組みだけを受け、格子の隙間を一枚壁で塞がない。
      // 高さは interior_parts.js の partitionTop と揃える。
      const left = Math.min(...lv.layout.rooms.map(r => r.x0)), right = Math.max(...lv.layout.rooms.map(r => r.x1));
      const ranma = ['hondo', 'sobo', 'kuri'].includes(I.kind) && lv.h - partitionH > 1;
      const top = partitionH + (ranma ? .7 : .1);
      if (firstInRow) {
        nodaLintelSolids(I, left, right, p.z, lv.y + partitionH,
          [[-.2, -.175], [-.105, .105], [.175, .2]]);
        // 小壁・桁・天井下の埋木は、見える厚みと高さをそれぞれ使う。
        // 桁まで薄い一枚壁にすると、幅二十センチの梁の脇を矢が抜ける。
        const beamBottom = lv.y + lv.h - .27, beamTop = lv.y + lv.h - .05;
        if (lv.y + top < beamBottom) seg(I, left, p.z, right, p.z, lv.y + top, beamBottom, .03);
        seg(I, left + .1, p.z, right - .1, p.z, beamBottom, beamTop, .1);
        seg(I, left, p.z, right, p.z, beamTop, y1, .03);
      }
      if (ranma) {
        // 横組子は厚さ三・五センチ。上下框と同じ八センチの壁にせず、
        // 見える木の脇の空隙を残す。端も描く框の幅で止める。
        // 固定の袖と戸口は別々に格子を割る。描く側の partitionTop と
        // 同じ二十五センチ以下の割りを使い、縦桟だけ矢が抜けるのを防ぐ。
        // 設営時だけ作り、開閉や毎コマの処理へ仕事を足さない。
        let l = -Infinity, r = Infinity;
        const lattice = (a, b) => {
          const width = b - a, count = Math.max(1, Math.ceil(width / .25));
          for (const [low, high, radius] of [[.1, .16, .04], [.3875, .4125, .0175], [.64, .7, .04]])
            seg(I, a + radius, p.z, b - radius, p.z,
              lv.y + partitionH + low, lv.y + partitionH + high, radius);
          for (let i = 0; i <= count; i++) {
            const x = a + .0125 + (width - .025) * i / count;
            seg(I, x - .0125, p.z, x + .0125, p.z,
              lv.y + partitionH + .16, lv.y + partitionH + .64, .0175);
          }
        };
        for (const v of lv.layout.walls) {
          if (v.guideOnly || Math.abs(v.az - p.z) > .01 || Math.abs(v.bz - p.z) > .01) continue;
          const a = Math.min(v.ax, v.bx), b = Math.max(v.ax, v.bx);
          if (v.paper && firstInRow) {
            // 固定の袖の欄間も、描く側と同じ柱の内面で割る。
            // 全幅で割り直すと柱間の縦桟と当たりがずれ、見える隙間を
            // 見えない木が塞ぐ。柱そのものは上で用意した当たりで受ける。
            const posts = nodaPartitionPosts(lv.layout, v);
            let spans = [[a, b]];
            for (const x of posts.positions) {
              const left = x - posts.width / 2, right = x + posts.width / 2;
              spans = spans.flatMap(([lo, hi]) => right <= lo || left >= hi ? [[lo, hi]]
                : [[lo, Math.max(lo, left)], [Math.min(hi, right), hi]]
                  .filter(([lo, hi]) => hi - lo > .001));
            }
            for (const [lo, hi] of spans) lattice(lo, hi);
          }
          if (b <= p.x + .01 && b > l) l = b;
          if (a >= p.x - .01 && a < r) r = a;
        }
        if (isFinite(l) && isFinite(r)) lattice(l, r);
      }
    }
    addNakaDoors(I, lv, y0, y1);   // 間仕切りの口に引き戸（naka_doors.js）
    if (S.quality === 'high' && I.profile === 'nodafukushima' && k === 0) {
      // 玄関の引き込み先にも竪枠を立て、敷居・鴨居の端と全開の板戸を受ける。
      // 戸の移動範囲の外へ置く。絵と当たりは同じ寸法を使い、中央の通り幅を保つ。
      const entry = I.doors?.find(d => d.entry && d.lv === lv);
      const frame = lv.entryFrame = {
        z: ds * (hd - .37), span: Math.min(lv.w - .2, I.door.w * 2),
        h: I.door.h ?? Math.min(lv.h - .3, 2), postH: lv.h, sill: entry?.sill ?? .028,
      };
      // 玄関の敷居は外壁より内側。床の仕上げも同じ四辺で切り、
      // 畳表・畳縁で板戸の溝を埋めない。内装を作る時だけ使う。
      lv.layout.entrySill = { x0: I.door.lx - frame.span / 2, x1: I.door.lx + frame.span / 2,
        z0: frame.z - .2, z1: frame.z + .2 };
      nodaLintelSolids(I, I.door.lx - frame.span / 2, I.door.lx + frame.span / 2,
        frame.z, lv.y + frame.h, [[-.2, -.085], [-.015, .015], [.085, .2]]);
      for (const side of [-1, 1]) {
        const x = I.door.lx + side * (frame.span / 2 + .04);
        seg(I, x, frame.z - .2, x, frame.z + .2,
          lv.y + frame.sill, lv.y + frame.postH, .04);
      }
    }
    // 玄関・間仕切りの敷居も描く上面を踏む。窓の敷居は足場にしない。
    // 戸を開けても残る固定材なので、開閉中に床や形を作り直さない。
    if (nodaPartitions) for (const d of I.doors || []) {
      if (d.lv !== lv || d.window) continue;
      const frame = d.entry ? lv.entryFrame : null;
      const span = frame ? frame.span : lv.w;
      const [cx, cz] = I.P(frame ? d.lx : 0, frame ? frame.z : d.lz);
      const id = addDeck({ cx, cz, rot, x0: -span / 2, x1: span / 2,
        z0: -.2, z1: .2, y: lv.y + d.sill, roof: lv.y + d.h,
        pad: 0, name: `${I.name}の敷居` });
      FL.decks[id].interior = true;
    }

} else {
    if (I.profile === 'iga') {
      // 伊賀の鴨居は二本の溝を受ける見込み四十八センチ・成十センチ。
      // 小壁と一緒に厚さ十六センチで止めると、引きしろ側の木へ槍や体が入る。
      // 見える横木の範囲だけ厚くし、その上の小壁と戸口の高さは保つ。
      const igaHeader = (v, top) => {
        const cap = Math.min(top + .1, y1);
        if (cap > top) seg(I, v.ax, v.az, v.bx, v.bz, top, cap, .24).bodyOverlap = true;
        if (cap < y1) seg(I, v.ax, v.az, v.bx, v.bz, cap, y1, .08).bodyOverlap = true;
      };
      for (const v of lv.layout.walls) {
        if (I.profile === 'iga' && v.paper) {
          // 紙が通すのは襖・障子の部分だけ。敷居下と鴨居上の小壁は木・土壁として止める。
          // 動く戸の上の横木と同じ高さに分け、固定の間仕切りだけ槍が抜ける隙を残さない。
          const base = lv.y + (lv.layout.portals.find(p => Math.abs(p.z - v.az) < .01 && Math.abs(p.z - v.bz) < .01)?.y || 0) + .04;
          const top = lv.y + Math.min(2.05, lv.h - .2);
          // 固定戸の上下の框も四センチの木。紙の範囲へ含めると、
          // 見えている木枠まで槍が抜けるため、共通部品の寸法で分ける。
          const paperBottom = base + .04 + (v.kind === 'shoji' ? igaShojiKoshi(top - base) : 0), paperTop = top - .04;
          // 敷居・小壁と戸の厚みを分ける。戸まで壁厚の当たりにすると、
          // 薄い襖の手前に見えない面が残り、開けた戸の脇へ寄れなかった。
          // 紙は襖の鏡板（三・五センチ）、木の框・腰板は六センチへ合わせる。
          // 敷居とその下の框は見込み四十八センチ。紙の戸の薄い当たりと分ける。
          if (base > y0) seg(I, v.ax, v.az, v.bx, v.bz, y0, base, .24).bodyOverlap = true;
          const len = Math.hypot(v.bx - v.ax, v.bz - v.az);
          const range = igaFixedPanelRange(lv.layout, v), span = range.end - range.start;
          const ax = v.ax + (v.bx - v.ax) * range.start / len;
          const az = v.az + (v.bz - v.az) * range.start / len;
          const bx = v.ax + (v.bx - v.ax) * range.end / len;
          const bz = v.az + (v.bz - v.az) * range.end / len;
          // 方立の中を紙扱いにせず、柱の当たりと建具の当たりを分ける。
          seg(I, ax, az, bx, bz, base, paperBottom, .03);
          seg(I, ax, az, bx, bz, paperBottom, paperTop, .0175).fusuma = true;
          seg(I, ax, az, bx, bz, paperTop, top, .03).bodyOverlap = true;
          igaHeader(v, top);
          // 固定の襖・障子の縦框も、描く側と同じ枚数・位置で止める。
          // 引きしろの後ろの固定戸だけを受け持ち、動く戸の溝へは張り出さない。
          const n = Math.ceil(span / .9);
          for (let j = 0; j < n; j++) for (const edge of [.02, span / n - .02]) {
            const t = (range.start + j * span / n + edge) / len;
            const x = v.ax + (v.bx - v.ax) * t, z = v.az + (v.bz - v.az) * t;
            seg(I, x, z - .01, x, z + .01, base, top, .02).bodyOverlap = true;
          }
        } else if (I.profile === 'iga' && !v.paper) {
          // 板間の間仕切りも、板戸の両脇の見える厚みに当たりを合わせる。
          // 敷居と小壁は厚みを残し、板の部分だけは横貫の見込み十二センチで止める。
          // 従来の十六センチの当たりでは、開けた板戸の脇に見えない壁が残った。
          const base = lv.y + (lv.layout.portals.find(p => Math.abs(p.z - v.az) < .01 && Math.abs(p.z - v.bz) < .01)?.y || 0) + .04;
          const top = lv.y + Math.min(2.05, lv.h - .2);
          // 下框は敷居上端から。敷居・上がり框は描く見込みまで体と槍を止める。
          if (base > y0) seg(I, v.ax, v.az, v.bx, v.bz, y0, base, .24).bodyOverlap = true;
          seg(I, v.ax, v.az, v.bx, v.bz, base, top, .06);
          igaHeader(v, top);
        } else seg(I, v.ax, v.az, v.bx, v.bz, y0, y1, .08).fusuma = v.paper;
      }
      addNakaDoors(I, lv, y0, y1);   // 間仕切りの口に引き戸（naka_doors.js）
      // 土間の戸口柱も室内の方立と同じ礎石で受ける。
      // 外壁の当たりだけでは、室内へ張り出した柱の足元をすり抜けていた。
      // 石の内端は開口の外、奥端は板戸の溝の手前へ納める。
      // 館の戸口にも描画と同じ通し柱の当たりを付ける。
      // 壁の当たりだけでは、内側へ出た柱の面へ体や槍が入り込む。
      if (I.profile === 'iga' && k === 0 && ['minka', 'nagaya', 'bansho', 'yashiki'].includes(I.kind)) {
        const z = ds * (hd - .16);
        const stone = I.kind !== 'yashiki';
        for (const side of [-1, 1]) {
          const px = I.door.lx + side * (I.door.w / 2 + .07);
          const sx = I.door.lx + side * (I.door.w / 2 + .11);
          const parts = [[px, .14, .14, lv.y + (stone ? .106 : 0), y1]];
          if (stone) parts.push([sx, .22, .28, lv.y + .026, lv.y + .106]);
          for (const [cx, width, depth, bottom, top] of parts) {
            const x0 = cx - width / 2 + .005, x1 = cx + width / 2 - .005;
            const z0 = z - depth / 2 + .005, z1 = z + depth / 2 - .005;
            for (const [ax, az, bx, bz] of [[x0, z0, x1, z0], [x0, z1, x1, z1],
              [x0, z0, x0, z1], [x1, z0, x1, z1]])
              seg(I, ax, az, bx, bz, bottom, top, .005).bodyOverlap = true;
          }
        }
      }
      // 伊賀の窓敷居・鴨居は室内へ四十八センチ張り出す。
      // 戸だけに当たりがあると、開けた窓の横木へ体や槍が入ってしまう。
      // 描く横木と同じ高さ・出幅で止め、雨戸と障子に二重登録しない。
      if (I.profile === 'iga') for (const d of I.doors || []) {
        if (d.lv !== lv || !d.window || d.kind !== 'itado') continue;
        const radius = .24, halfLength = d.W + .04;
        const z = d.lz + d.trackSide * radius;
        for (const bottom of [d.y, d.y + d.h])
          seg(I, d.lx - halfLength + radius, z, d.lx + halfLength - radius, z,
            bottom, bottom + .04, radius).bodyOverlap = true;
      }
      // 間仕切り柱は戸や板壁と別に止める。民家・陣小屋・番所も
      // 壁端から戸口側へ出る柱の見付けまで、木の当たりを持たせる。
      // furnishLayout の柱（幅 .12・見込み .14）と位置・高さをそろえ、
      // 戸の通れる幅と、手前の二本の溝へ滑る動きは保つ。
      if (I.profile === 'iga') for (const d of I.doors || []) {
        if (d.lv !== lv || d.exterior || d.window) continue;
        const stone = ['minka', 'nagaya', 'bansho'].includes(I.kind);
        for (const side of [-1, 1]) {
          const x = d.lx + side * (d.W / 2 + .06);
          seg(I, x, d.lz - .01, x, d.lz + .01,
            lv.y + (stone ? .106 : 0), y1, .06).bodyOverlap = true;
          // 土間の方立を受ける礎石も、見える外寸だけ体と槍を止める。
          // 石の内端は開口の外。柱の当たりを床まで延ばさず、石の上端から受ける。
          // 四辺は設営時だけ登録し、戸の溝と通れる幅へ張り出さない。
          if (stone) {
            const cx = d.lx + side * (d.W / 2 + .11);
            const x0 = cx - .105, x1 = cx + .105;
            const z0 = d.lz - .135, z1 = d.lz + .135;
            for (const [ax, az, bx, bz] of [[x0, z0, x1, z0], [x0, z1, x1, z1],
              [x0, z0, x0, z1], [x1, z0, x1, z1]])
              seg(I, ax, az, bx, bz, lv.y + .026, lv.y + .106, .005).bodyOverlap = true;
          }
        }
      }
      // 伊賀の引き戸は、外の戸口も室内の上がり口も敷居の上を踏む。
      // 外の敷居は壁より内側へ寄せてあり、土間の足場だけでは足が木へ埋まる。
      if (I.profile === 'iga') for (const d of I.doors || []) {
        if (d.lv !== lv || d.window) continue;
        const sillZ = d.exterior ? d.lz - ds * .21 : d.lz;
        const halfDepth = d.exterior ? .26 : .24;
        // 敷居は開口だけでなく、戸を引く両脇にも続いている。
        // 土間からその木へ乗った時も足を沈めず、描いた敷居の全幅を踏めるようにする。
        // 外戸は左右の引きしろ、間仕切りは両端の壁際まで。足場の数は増やさない。
        const halfWidth = d.exterior ? d.W + .1 : (lv.w - .2) / 2;
        const sillX = d.exterior ? d.lx : 0;
        const [cx, cz] = I.P(sillX, sillZ);
        // 敷居も木の端で足場を止め、土間の手前から見えない段へ乗せない。
        const id = addDeck({ cx, cz, rot, x0: -halfWidth, x1: halfWidth,
          z0: -halfDepth, z1: halfDepth, y: d.y + .04, roof: lv.y + lv.h,
          name: d.exterior ? '戸口の敷居' : '上がり口の敷居', pad: 0 });
        FL.decks[id].interior = true;
      }
    } else {
if (['hieizan', 'moribe', 'inabayama'].includes(I.profile) || I.profile?.startsWith('honnoji_')) {
    for (const v of lv.layout.walls) {
      if (I.profile === 'anegawa' && v.paper && !v.guideOnly) {
        // 襖・障子・内陣の格子の上は固定の小壁。見た目と同じ鴨居の高さで
        // 当たりを分け、紙を突ける槍も天井際の小壁では止める。
        const headY = lv.y + interiorDoorHeight(lv.layout, lv.h);
        // 固定の襖・障子・格子も、動く戸と同じ上がり床の敷居から始める。
        // 床下まで紙や格子の当たりを伸ばさず、柱の当たりは下で別に残す。
        const sillY = lv.y + interiorDoorSill(lv.layout, { x: (v.ax + v.bx) / 2, z: (v.az + v.bz) / 2 });
        // 小堂の木格子は紙の襖と分け、閉じた内陣境を槍で素通りさせない。
        seg(I, v.ax, v.az, v.bx, v.bz, sillY, headY, .08).fusuma = I.kind !== 'hondo';
        if (S.quality === 'high' && ['hondo', 'yashiki'].includes(I.kind)) {
          // 固定建具の両面にある地長押は紙でなく木。描く高さ・張り出しに合わせ、
          // 槍を木で止める。戸口には渡さず、前後十三センチの引き戸の溝も空ける。
          const len = Math.hypot(v.bx - v.ax, v.bz - v.az);
          if (len > .025) {
            const ux = (v.bx - v.ax) / len, uz = (v.bz - v.az) / len;
            for (const side of [-1, 1]) {
              const dx = -uz * side * .0775, dz = ux * side * .0775;
              const railY = lv.y + interiorJinageshiHeight(lv.layout,
                (v.ax + v.bx) / 2 + dx, (v.az + v.bz) / 2 + dz);
              seg(I, v.ax + dx + ux * .0125, v.az + dz + uz * .0125,
                v.bx + dx - ux * .0125, v.bz + dz - uz * .0125,
                railY - .04, railY + .04, .0125).fusuma = false;
            }
          }
        }
        if (headY < y1) {
          const head = seg(I, v.ax, v.az, v.bx, v.bz, headY, y1, .08);
          head.fusuma = false; head.bodyOverlap = true;
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
      continue;
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
        if (ph < lv.h) {
          if (!v.guideOnly && Math.abs(v.az - v.bz) <= .01) {
            hieiPartitionHead(I, lv, Math.min(v.ax, v.bx), Math.max(v.ax, v.bx), v.az,
              ['sobo', 'chudo', 'hondo'].includes(I.kind) ? Math.min(.12, Math.abs(v.bx - v.ax) / 2) : 0);
          } else seg(I, v.ax, v.az, v.bx, v.bz, lv.y + ph, y1, .08);
        }
      } else if (I.profile?.startsWith('honnoji_') && v.paper) {
        // 紙を通る槍でも、固定格子・柱・鴨居とその上の小壁は止める。
        // 建具の高さと二枚ごとの柱割りは furnishLayout とそろえる。
        const ph = Math.min(2.2, lv.h - .3);
        seg(I, v.ax, v.az, v.bx, v.bz, y0, lv.y + ph, .08).fusuma = v.kind !== 'koshi';
        if (ph < lv.h) seg(I, v.ax, v.az, v.bx, v.bz, lv.y + ph, y1, .08);
        const len = Math.hypot(v.bx - v.ax, v.bz - v.az);
        if (!v.guideOnly && v.kind !== 'koshi' && len > .12) {
          const dx = (v.bx - v.ax) / len, dz = (v.bz - v.az) / len;
          const post = (t) => seg(I,
            v.ax + dx * (t - .06), v.az + dz * (t - .06),
            v.ax + dx * (t + .06), v.az + dz * (t + .06), y0, lv.y + ph, .06);
          post(.06); post(len - .06);
          const n = Math.max(2, Math.round(len / 1.8) * 2);
          for (let i = 2; i < n; i += 2) post(i * len / n);
        }
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
    if (I.profile === 'anegawa') {
      // 間仕切りと戸口の柱脚も床板の欠きへ渡す。外周柱だけを避けると、
      // 小堂の礎盤や土間境の柱へ表板と角釘が入り込む。
      if (S.quality === 'high') lv.partitionPosts = [];
      // 紙・板の建具と木柱を分ける。furnishLayout の柱割りと同じ位置・太さだけを
      // 木として登録し、板壁から張り出す柱もすり抜けないようにする。戸口幅は保つ。
      // 当たりは設営時に一度だけ作り、動く戸の前後十三センチの溝へは出さない。
      const post = (x, z, rot) => {
        if (lv.partitionPosts) {
          const extent = I.kind === 'hondo' ? .097
            : .08 * (Math.abs(Math.cos(rot)) + Math.abs(Math.sin(rot))) + .002;
          lv.partitionPosts.push([x - extent, x + extent, z - extent, z + extent]);
        }
        const dx = Math.cos(rot) * .01, dz = -Math.sin(rot) * .01;
        seg(I, x - dx, z - dz, x + dx, z + dz, y0, y1, .07).fusuma = false;
        if (I.kind === 'hondo' && S.quality === 'high') {
          // 内陣の丸柱を受ける二段の礎盤も、見える張り出しまで木として扱う。
          // interior_parts の礎盤と同じ床高・半径・高さを使い、格子戸の溝は空ける。
          const raised = Math.max(0, ...lv.layout.rooms.map(r => r.y || 0));
          // 床境の礎盤の下段は外陣まで続く。見える木と同じ高さを木の当たりにする。
          for (const [radius, bottom, top] of [[.095, 0, raised + .025], [.085, raised + .025, raised + .065]])
            seg(I, x - dx * .1, z - dz * .1, x + dx * .1, z + dz * .1,
              lv.y + bottom, lv.y + top, radius).fusuma = false;
        }
      };
      for (const v of lv.layout.walls) {
        if (v.guideOnly) continue;
        const len = Math.hypot(v.bx - v.ax, v.bz - v.az);
        if (len < .16) continue;
        const x = (v.ax + v.bx) / 2, z = (v.az + v.bz) / 2;
        const rot = Math.atan2(-(v.bz - v.az), v.bx - v.ax);
        const bays = Math.max(1, Math.ceil(len / 1.8));
        for (let q = 0; q <= bays; q++) {
          const atOpening = lv.layout.portals.some(p => Math.abs(p.z - z) < .01
            && (q === 0 && p.x < Math.min(v.ax, v.bx) || q === bays && p.x > Math.max(v.ax, v.bx)));
          if (atOpening) continue;
          const t = -len / 2 + q * len / bays + (q === 0 ? .08 : q === bays ? -.08 : 0);
          post(x + Math.cos(rot) * t, z - Math.sin(rot) * t, rot);
        }
      }
      for (const p of lv.layout.portals) {
        let l = -Infinity, r = Infinity;
        for (const v of lv.layout.walls) {
          if (v.guideOnly || Math.abs(v.az - p.z) > .01 || Math.abs(v.bz - p.z) > .01) continue;
          const a = Math.min(v.ax, v.bx), b = Math.max(v.ax, v.bx);
          if (b <= p.x + .01 && b > l) l = b;
          if (a >= p.x - .01 && a < r) r = a;
        }
        if (!isFinite(l) || !isFinite(r)) continue;
        post(l - .08, p.z, 0); post(r + .08, p.z, 0);
      }
    }
    addNakaDoors(I, lv, y0, y1);   // 間仕切りの口に引き戸（naka_doors.js）
    if (I.profile === 'anegawa' && S.quality === 'high') {
      // 外戸・襖・障子・内陣の格子戸の戸当たりにも、見える木と同じ当たりを付ける。
      // 引き込み先で木をすり抜けず、戸の移動と元の開口は妨げない。
      // 設営時だけ登録し、動く戸と分けて固定の木として残す。
      for (const d of I.doors || []) {
        if (d.lv !== lv) continue;
        const reach = d.W + .02 + .035;
        const halfDepth = d.entry ? d.track + .04 : .17;
        for (const side of [-1, 1]) {
          const x = d.lx + side * reach;
          if (!d.entry && !lv.layout.walls.some(v => !v.guideOnly
            && Math.abs(v.az - d.lz) < .01 && Math.abs(v.bz - d.lz) < .01
            && x - .035 >= Math.min(v.ax, v.bx) - .001
            && x + .035 <= Math.max(v.ax, v.bx) + .001)) continue;
          seg(I, x, d.lz - halfDepth + .035, x, d.lz + halfDepth - .035,
            d.y, d.y + d.h, .035).fusuma = false;
        }
      }
    }
    if (k === 0 && I.profile === 'anegawa' && S.quality === 'high' && I.entryDoor && I.kind !== 'hondo') {
      // 外へ張り出す敷居の両端を束と束石で受ける推定の納まり。
      // 戸口と登り口の外に置き、地面の高さ・絵・当たりを設営時にそろえる。
      const d = I.entryDoor, reach = (d.W + 2 * d.travel) / 2 + .035;
      d.sillSupports = [];
      for (const side of [-1, 1]) {
        const x = d.lx + side * reach, z = d.lz;
        let ground = -Infinity;
        for (const dx of [-.11, .11]) for (const dz of [-.11, .11]) {
          const [wx, wz] = I.P(x + dx, z + dz);
          ground = Math.max(ground, world.heightAt(wx, wz));
        }
        const top = d.y - .04;
        if (top <= ground + .06) continue;
        d.sillSupports.push({ x, z, ground, top });
        seg(I, x - .05, z, x + .05, z, ground - .04, ground + .04, .06);
        seg(I, x, z, x, z, ground + .04, top, .06);
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
    // 本能寺の戸口上は鴨居・小壁が残る。戸を開けても視点が上の隣室へ抜けないよう、
    // 設営時だけ登録し、戸幅と通れる高さは建具の実寸を共用する。
    if (I.profile?.startsWith('honnoji_')) for (const d of I.doors || []) {
      if (d.lv !== lv || d.exterior) continue;
      seg(I, d.lx - d.W / 2, d.lz, d.lx + d.W / 2, d.lz,
        d.solid.yTop, lv.y + lv.h, .08);
      // 板間・外陣から戸口をまたぐ時も、足を敷居の木へ沈めない。
      // 動く戸と同じ敷居高を使い、二条御所の床組の差も合わせる。
      // 幅は開口内、奥行きは描く二本溝の外寸まで。両脇の壁や隣室へ広げない。
      const [cx, cz] = I.P(d.lx, d.lz);
      const depth = d.track + .04;
      const id = addDeck({ cx, cz, rot, x0: -d.W / 2, x1: d.W / 2,
        z0: -depth, z1: depth,
        y: lv.y - (I.profile === 'honnoji_nijo' ? .065 : 0) + d.sill,
        roof: d.solid.yTop, pad: 0, name: `${I.name}の敷居` });
      FL.decks[id].interior = true;
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
      hieiPartitionHead(I, lv, d.lx - d.W / 2, d.lx + d.W / 2, z);
    }

} else {
    const villagePartition = S.quality === 'high' && I.profile === 'shitaragahara'
      && ['minka', 'hondo'].includes(I.kind);
    const partitionTop = lv.y + interiorPartitionHeight(lv.layout, lv.h);
    // 民家の紙戸と柱を分ける。幅十二・見込み十四センチの角柱は
    // furnishLayout の柱と揃え、襖越しの槍も木のある所では止める。
    const homePost = (x, z) => {
      seg(I, x, z - .01, x, z + .01, lv.y, y1, .06).bodyOverlap = true;
    };
    // 小堂の丸柱と二段の肘木も、欄間の隙間を抜ける射線を木部で止める。
    // furnishLayout の柱割り・柱頭の寸法に合わせ、格子戸の通り道は広げて塞がない。
    const hallPost = (x, z, edge = 0) => {
      seg(I, x, z - .001, x, z + .001, lv.y, y1, .06).bodyOverlap = true;
      const head = x - edge * .16;
      // 見える肘木は下段が厚さ四センチ、上段が三センチ。
      // 古い厚い当たりを残すと、長押の上の空いた所まで見えない木で塞いでしまう。
      for (const [width, low, high] of [[.34, .15, .11], [.44, .11, .08]])
        seg(I, head - width / 2 + .12, z, head + width / 2 - .12, z,
          y1 - low, y1 - high, .12).bodyOverlap = true;
    };
    for (const v of lv.layout.walls) {
      // 設楽原の固定建具も、動く戸と同じ鴨居の高さで区切る。
      // 小壁まで紙戸扱いにすると槍が木部を抜け、内陣の壁越しにも届いてしまう。
      const split = villagePartition && v.paper && partitionTop < y1;
      // 小堂の内陣境は木の格子。襖と同じ「紙を突き通せる壁」にはしない。
      const paperPanel = v.paper && !(villagePartition && I.kind === 'hondo');
      const homePanel = villagePartition && I.kind === 'minka' && v.paper;
      // 民家の固定戸も動く戸と同じ見込み六センチ。十六センチの見えない厚みを残さない。
      if (!homePanel) seg(I, v.ax, v.az, v.bx, v.bz, y0, split ? partitionTop : y1, .08).fusuma = paperPanel;
      // 固定の襖・障子も四周の框は紙扱いにしない。動く戸と同じ四センチの見付け。
      // 柱の内面へ納めた建具の木だけを受け、紙面の中央は従来どおり槍を通す。
      if (homePanel) {
        // 二本の溝を受ける敷居も絵と同じ高さ六・見込み十八センチに揃える。
        seg(I, v.ax + .09, v.az, v.bx - .09, v.bz, lv.y, lv.y + .06, .09);
        for (const span of shitaragaharaHomePanels(v.ax, v.bx)) {
          const z = v.az + span.offset;
          seg(I, span.ax, z, span.bx, z, lv.y + .06, partitionTop, .03).fusuma = true;
          for (const [low, high] of [[lv.y + .06, lv.y + .1], [partitionTop - .04, partitionTop]])
            seg(I, span.ax + .03, z, span.bx - .03, z, low, high, .03);
          // 腰障子の杉板も框の内側だけで受け、紙面と同じ厚みへ納める。
          if (v.kind === 'shoji') {
            const bottom = lv.y + .06, height = partitionTop - bottom;
            const width = span.bx - span.ax, center = (span.ax + span.bx) / 2;
            const waistTop = height / 6, iw = width - .04, ih = height - .02 - waistTop;
            seg(I, span.ax + .03, z, span.bx - .03, z, lv.y + .06,
              bottom + waistTop + .02, .03);
            // 固定障子の組子も、滑る障子と同じ四列・六段の木部だけで受ける。
            // 紙の部分を塞がず、設営時に登録した細い当たりを使い回す。
            // 縦材は見付け十六ミリ・見込み五センチ。端の丸みまで木の内側へ納める。
            for (let j = 1; j < 4; j++) {
              const x = center - iw / 2 + iw * j / 4;
              seg(I, x, z - .017, x, z + .017,
                bottom + waistTop + .02, partitionTop - .04, .008);
            }
            for (let j = 1; j < 6; j++) {
              const y = bottom + waistTop + ih * j / 6;
              seg(I, center - iw / 2 + .045, z, center + iw / 2 - .045, z,
                y - .007, y + .007, .025);
            }
          }
          // 見た目と同じ柱間・枚数で竪框を分ける。召し合わせの木も槍を止め、
          // 紙面全体を木の壁にはしない。設営時だけ登録し、開く戸の溝へは延ばさない。
          for (const x of [span.ax + .02, span.bx - .02]) {
            seg(I, x, z - .01, x, z + .01,
              lv.y + .1, partitionTop - .04, .02);
          }
        }
      }
      if (split) for (const p of interiorPartitionHeaders(lv.layout, lv.h, v.ax, v.bx, true))
        seg(I, p.ax, v.az, p.bx, v.bz, lv.y + p.y0, lv.y + p.y1, p.r).bodyOverlap = true;
      if (split) {
        // 固定建具の外壁側の柱と中間柱。戸口側の柱は下で一度だけ登録する。
        const len = Math.abs(v.bx - v.ax), center = (v.ax + v.bx) / 2;
        const bays = Math.max(1, Math.round(len / 1.8));
        const end = Math.abs(v.ax) > Math.abs(v.bx) ? -1 : 1;
        const post = I.kind === 'hondo' ? hallPost : homePost;
        post(center + end * (len / 2 - .06), v.az, end);
        for (let j = 1; j < bays; j++) post(center - len / 2 + len * j / bays, v.az);
      }
    }
    addNakaDoors(I, lv, y0, y1);   // 間仕切りの口に引き戸（naka_doors.js）
    if (villagePartition) for (const door of I.doors || []) {
      if (door.lv !== lv || door.window) continue;
      // 動かない敷居にも足を載せる。引き込み先までの幅と溝の岸の上端を、
      // slidingDoorTrack と揃える。窓の敷居を歩ける床にはしない。
      const id = addDeck({ cx: door.x, cz: door.z, rot, x0: -door.W - .04, x1: door.W + .04,
        z0: -.11, z1: .11, y: door.y + .025, roof: lv.y + lv.h, pad: 0, name: '引き戸の敷居' });
      FL.decks[id].interior = true;
      if (!door.exterior) {
        const post = I.kind === 'hondo' ? hallPost : homePost;
        for (const side of [-1, 1])
          post(door.lx + side * (door.W / 2 + .06), door.lz - ds * .20);
        // 引き戸は入口側へ二十センチ寄せてある。裏向きの間取りも
        // 同じ向きで戻し、見えている固定の敷居へ足場を重ねる。
        const [cx, cz] = I.P(door.lx, door.lz - ds * .20);
        const sill = addDeck({ cx, cz, rot, x0: -door.W / 2, x1: door.W / 2,
          z0: -.05, z1: .05, y: lv.y + .06, roof: lv.y + lv.h, pad: 0, name: '間仕切りの敷居' });
        FL.decks[sill].interior = true;
      }
    }

    }
    }
    }
    // 戸口から一歩入った場所には調度を置かない。絵と当たりを一緒に外す。
    if (k === 0) {
      if (I.profile === 'honnoji_soshido') {
      // 小さな祖師堂は表口の全幅に余白を足すと、脇の礼盤まで消えてしまう。
      // 中央の一・三メートルに左右四十センチの余白を取り、内陣の格子戸まで通す。
      // 須弥壇・経机と同じ軸の礼盤は残し、描く調度と当たりをそろえる（配置は推定）。
      const smallHall = I.profile === 'honnoji_soshido';
      const halfEntry = smallHall ? Math.min(.65, I.door.w / 2) : I.door.w / 2;
      const margin = smallHall ? .4 : .5;
      lv.layout.props = lv.layout.props.filter(p => !(p.x + p.w / 2 + margin > I.door.lx - halfEntry
        && p.x - p.w / 2 - margin < I.door.lx + halfEntry
        && ds * p.z + p.d / 2 + .5 > hd - 1.6));
      } else {
      // 合図の小さな板倉では、入口用の余白が奥壁まで届き、脇の蓋箱も消えていた。
      // 玄関の内寄りの溝から三十センチ奥までを立ち所にし、そこへ掛かる荷だけ外す。
      // 箱の周囲にも人の半径分を取り、中央から奥へ歩ける幅は残す。
      const shallowInabaStore = S.quality === 'high' && I.profile === 'inabayama' && I.kind === 'kura' && lv.d < 2.3;
      // 小祠は奥行きが浅い。入口の立ち所を拝所までに留め、神前の供物台を消さない。
      const entryDepth = I.profile === 'toride' ? .85 : shallowInabaStore ? .34 + .3
        : S.quality === 'high' && I.profile === 'inabayama' && I.kind === 'shrine'
        ? Math.min(1.6, lv.d * .4) : 1.6;
      // 砦の玄関は間仕切りの敷居まで。短い長屋でも奥の寝具・槍掛けや
      // 詰所の調度を玄関の荷物と取り違えて消さない。
      // 戸口前後の立ち所は間取り側で空けてあり、ここでは入口だけを守る。
      let entryBack = hd - entryDepth;
      const fortEntry = S.quality === 'high' && I.profile === 'nodafukushima'
        && ['goten', 'bansho', 'nagaya', 'kura'].includes(I.kind);
      // 河口の民家は土間の左右に水・薪・炊事台を分けてある。
      // 五十センチの余白では戸口を塞がない炊事台まで消えるため、
      // 高の民家も十センチの余白で実際の戸口への張り出しを調べる。
      const homeEntry = S.quality === 'high' && I.profile === 'nodafukushima' && I.kind === 'minka';
      const entryMargin = I.profile === 'toride' ? .25 : shallowInabaStore ? .3 : fortEntry || homeEntry ? .1 : .5;
      if (fortEntry) {
        for (const portal of lv.layout.portals) entryBack = Math.max(entryBack, ds * portal.z + .2);
      }
      lv.layout.props = lv.layout.props.filter(p => !(p.x + p.w / 2 + entryMargin > I.door.lx - I.door.w / 2
        && p.x - p.w / 2 - entryMargin < I.door.lx + I.door.w / 2
        && ds * p.z + p.d / 2 + entryMargin > entryBack));
      }
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
      if (S.quality === 'high' && I.profile === 'nodafukushima' && p.part !== 'hearth') {
        // 配置を寄せ終えてから床面へ載せる。畳・板床に脚や須弥壇を埋めず、
        // 当たりの上端にも同じ高さを使う。囲炉裏の灰床だけは床へ埋めたまま。
        const room = lv.layout.rooms.find(r => p.x >= r.x0 && p.x <= r.x1 && p.z >= r.z0 && p.z <= r.z1);
        if (room) p.y = (room.y || 0) + (room.floor === 'tatami' ? .06 : room.floor === 'earth' ? .025 : .018);
        // 堂の柱は畳の上の家具にせず床下から立てる。天井まで絵と当たりを揃える。
        if (p.part === 'hallPost') { p.y = 0; p.h = lv.h; }
      }

      if (!interiorPropBlocksWalk(lv.layout, p)) {
        // 薄いむしろは踏める足場にする。寝床の高さには藁枕も含まれるため、
        // 全面を枕の高さへ持ち上げず、描く敷物の上端へ足をそろえる。
        const [cx, cz] = I.P(p.x, p.z);
        const matH = p.part === 'bedding' ? Math.min(.025, p.h / 3) : p.h;
        // 伊賀の座と寝むしろの外では板間・畳へ戻す。敷物の周囲を浮かせない。
        const id = addDeck({ cx, cz, rot: rot + (p.rot || 0),
          x0: -p.w / 2, x1: p.w / 2, z0: -p.d / 2, z1: p.d / 2,
          y: lv.y + (p.y || 0) + matH, roof: lv.y + lv.h, name: '敷きむしろ', pad: I.profile === 'iga' ? 0 : undefined });
        FL.decks[id].interior = true;
        continue;
      }
      // 稲葉山の床の間と槍掛けは、絵と当たりを同じ梁下の高さへ納める。
      // 絵だけ縮めると、天井際に見えない調度の当たりが残る。
      if (S.quality === 'high' && I.profile === 'inabayama') {
        // 床柱と小天井は回縁の中ほどまで立ち上げる。
        // 十センチ控えると回縁の下面との間に隙間が残るため、絵・当たりを一緒に揃える。
        if (p.part === 'alcove') p.h = Math.min(p.h, lv.h - (p.y || 0) - .045);
        if (p.part === 'spearRack') p.h = Math.min(p.h, lv.h - (p.y || 0) - .28);
      }
      // 床に敷く筵は描いたまま歩ける。通路・立ち所と同じ指定で当たりも外す。
      if (p.walkable) continue;
      const ww = p.w ?? (p.part === 'alcove' ? 2.3 : p.part === 'altar' ? 2.1 : p.part === 'desk' ? 1.2 : p.part === 'counter' ? 1.1 : .85);
      const dd = p.d ?? (p.part === 'alcove' ? .85 : p.part === 'altar' ? 1 : .7);
      // 岩村の板床上の調度は、描画側と同じ十二ミリの上張りから当たりを立てる。
      // 須弥壇・神座・筵も上げ床と板厚を含めて判定する。
      const onBoards = boardWalk && !lv.layout.floorAligned && lv.layout.rooms.some(r => r.floor === 'boards'
        && p.x >= r.x0 && p.x <= r.x1 && p.z >= r.z0 && p.z <= r.z1);
      // 岩村の須弥壇は壇座の上を空ける。像の高さまで幅いっぱいの箱にすると、
      // 本尊の左右の空間にも見えない壁ができる。上の像・光背は下で別に受ける。
      const templeAltar = S.quality === 'high' && I.profile === 'iwamura_hondo' && p.part === 'altar';
      const iwamuraBedding = boardWalk && I.profile === 'iwamura_nagaya' && p.part === 'bedding';
      const iwamuraRack = S.quality === 'high' && p.part === 'yariRack'
        && (I.profile === 'iwamura' || I.profile?.startsWith('iwamura_'));
      const propHeight = templeAltar ? p.h * .54 / 1.5 : iwamuraBedding ? Math.min(.025, p.h / 4) : p.h;
      const top = lv.y + (p.y || 0) + (onBoards ? .012 : 0) + propHeight + (p.part === 'stones' ? .18 : p.part === 'ammo' ? .05 : 0);
      // 岩村の礼拝座・文机の座は薄い筵の上を歩く。
      // 板間・畳の歩行面だけでは足が筵へ沈むため、描いた範囲と上端を共有する。
      // 設営時だけ登録し、反転した室内でも回転と床高を調度へ合わせる。
      if ((boardWalk && ['prayerMat', 'sittingMat'].includes(p.part)) || iwamuraBedding) {
        const [cx, cz] = I.P(p.x, p.z);
        const id = addDeck({ cx, cz, rot: rot + (p.rot || 0),
          x0: -ww / 2, x1: ww / 2, z0: -dd / 2, z1: dd / 2,
          y: top, roof: lv.y + lv.h, name: '筵の座', pad: 0 });
        FL.decks[id].interior = true;
      }
      // 長屋の寝所は薄い筵と藁枕。枕の高さを筵全体の当たりへ広げない。
      // 枕だけ描画と同じ位置・寸法で受け、反転した寝所も同じ床面へ納める。
      // 設営時に登録し、形や材質・毎コマの処理は増やさない。
      if (iwamuraBedding) {
        const base = top - propHeight, radius = (p.h - propHeight) / 2;
        const c = Math.cos(p.rot || 0), s = Math.sin(p.rot || 0);
        const z = -dd / 2 + .15, half = ww * .65 / 2;
        const [cx, cz] = I.P(p.x + z * s, p.z + z * c);
        const id = addDeck({ cx, cz, rot: rot + (p.rot || 0),
          x0: -half, x1: half, z0: -radius, z1: radius,
          y: base + p.h, roof: lv.y + lv.h, name: '藁枕', pad: 0 });
        FL.decks[id].interior = true;
        const span = Math.max(0, half - radius);
        seg(I, p.x - span * c + z * s, p.z + span * s + z * c,
          p.x + span * c + z * s, p.z - span * s + z * c,
          top, base + p.h, radius);
        p.reachBoxes = [
          { x0: -ww / 2, x1: ww / 2, z0: -dd / 2, z1: dd / 2,
            y0: base - lv.y, y1: top - lv.y },
          { x0: -half, x1: half, z0: z - radius, z1: z + radius,
            y0: top - lv.y, y1: base + p.h - lv.y },
        ];
      }
      const x0 = p.x - ww / 2, x1 = p.x + ww / 2, z0 = p.z - dd / 2, z1 = p.z + dd / 2;
      if (S.quality === 'high' && I.profile === 'nodafukushima' && I.kind === 'hondo' && p.part === 'hallPost') {
        // 丸柱の角に見えない当たりを残さない。共有する十二角の柱身と
        // 四角い根巻・柱頭の受けを分け、絵と同じ高さ・太さで受ける。
        const base = lv.y + (p.y || 0), capTop = base + p.h - .27, shaftTop = capTop - .12;
        for (let j = 0; j < 12; j++) {
          const a = j * Math.PI / 6, b = (j + 1) * Math.PI / 6;
          seg(I, p.x + Math.sin(a) * ww * .375, p.z + Math.cos(a) * dd * .375,
            p.x + Math.sin(b) * ww * .375, p.z + Math.cos(b) * dd * .375,
            base + .07, shaftTop, .005);
        }
        // 根巻・斗・肘木を別々に受け、細くなった柱頭の角に見えない壁を残さない。
        for (const [sx, sz, bottom, upper] of [[.75, .75, lv.y - .4, base + .07],
          [.8, .8, shaftTop, shaftTop + .06], [1, .65, shaftTop + .06, capTop]]) {
          const hx = ww * sx / 2 - .005, hz = dd * sz / 2 - .005;
          for (const side of [-1, 1]) {
            seg(I, p.x - hx, p.z + side * hz, p.x + hx, p.z + side * hz, bottom, upper, .005);
            seg(I, p.x + side * hx, p.z - hz, p.x + side * hx, p.z + hz, bottom, upper, .005);
          }
        }
        continue;
      }
      if (p.solids) for (const piece of p.solids) {
        const w = piece.w ?? ww, d = piece.d ?? dd;
        const upper = lv.y + (piece.y || 0) + piece.h;
        const ax = piece.x - w / 2, bx = piece.x + w / 2;
        const az = piece.z - d / 2, bz = piece.z + d / 2;
        seg(I, ax, az, bx, az, lv.y - .4, upper, .04);
        seg(I, ax, bz, bx, bz, lv.y - .4, upper, .04);
        seg(I, ax, az, ax, bz, lv.y - .4, upper, .04);
        seg(I, bx, az, bx, bz, lv.y - .4, upper, .04);
      }
      if (I.profile === 'anegawa') {
      if (I.profile !== 'moribe') {
      seg(I, x0, z0, x1, z0, lv.y - .4, top, .04);
      seg(I, x0, z1, x1, z1, lv.y - .4, top, .04);
      seg(I, x0, z0, x0, z1, lv.y - .4, top, .04);
      seg(I, x1, z0, x1, z1, lv.y - .4, top, .04);
      if (I.profile === 'anegawa' && I.kind === 'yashiki' && S.quality === 'high' && p.part === 'alcove') {
        // 床の間の上の小壁も、見える塗り壁と同じ位置・高さで受ける。
        // 調度全体を天井まで埋めず、落掛より下の空間を残す。
        const sx = p.w / 2.46, sy = p.h / 2.5, sz = p.d / .91;
        const base = lv.y + (p.y || 0), ceiling = lv.y + lv.h;
        const turn = p.rot || 0, c = Math.cos(turn), s = Math.sin(turn);
        const upperWall = (ax, az, bx, bz, bottom, radius) => {
          const low = base + bottom * sy;
          if (ceiling > low) seg(I,
            p.x + ax * sx * c + (az + .015) * sz * s,
            p.z - ax * sx * s + (az + .015) * sz * c,
            p.x + bx * sx * c + (bz + .015) * sz * s,
            p.z - bx * sx * s + (bz + .015) * sz * c,
            low, ceiling, radius);
        };
        upperWall(-1.03, .33, 1.03, .33, 2.46, .03 * sz);
        for (const x of [-1.07, 1.07]) upperWall(x, -.425, x, .36, 2.32, .04 * sx);
        upperWall(-1.15, -.43, 1.15, -.43, 2.5, .04 * sz);
      }
      if (I.profile === 'anegawa' && S.quality === 'high' && p.part === 'altar') {
        // 小堂の調度の高さは壇の当たり用。本尊の光背と天蓋・吊り金具は
        // その上まで続くので、見える木と金具にも当たりを付ける。
        // furnishLayout の縮尺・位置を共有し、天蓋の下の空間は塞がない。
        const sx = p.w / 2.1, sy = p.h / 1.5, sz = p.d;
        const base = lv.y + (p.y || 0), turn = p.rot || 0;
        const c = Math.cos(turn), s = Math.sin(turn);
        const edge = (ax, az, bx, bz, low, high, radius) =>
          seg(I, p.x + ax * sx * c + az * sz * s, p.z - ax * sx * s + az * sz * c,
            p.x + bx * sx * c + bz * sz * s, p.z - bx * sx * s + bz * sz * c,
            base + low * sy, base + high * sy, radius);
        const frame = (ax, bx, az, bz, low, high) => {
          edge(ax, az, bx, az, low, high, .01);
          edge(ax, bz, bx, bz, low, high, .01);
          edge(ax, az, ax, bz, low, high, .01);
          edge(bx, az, bx, bz, low, high, .01);
        };
        frame(-.47, .47, -.395, .01, 1.5, 1.65); // 本尊の頭部と光背の上端
        frame(-.85, .85, -.49, .33, 2.06, 2.27); // 天蓋の覆輪から上框まで
        const hangTop = (lv.h - (p.y || 0) - .17) / sy;
        if (hangTop > 2.27) for (const x of [-.6, .6]) for (const z of [-.32, .16])
          edge(x, z, x, z, 2.27, hangTop, .011 * Math.max(sx, sz));
        // 天蓋の吊り受け梁も見える位置で止める。床の道探しは塞がず、梁下は通せる。
        const room = lv.layout.rooms.find(r => r.name === '内陣');
        if (I.kind === 'hondo' && room) for (const side of [-1, 1]) {
          const x = p.x + side * .6 * sx;
          seg(I, x, room.z0 + .02, x, room.z1 - .02,
            lv.y + lv.h - .17, lv.y + lv.h - .05, .045).bodyOverlap = true;
        }
      }
      if (I.profile === 'anegawa' && p.part === 'hearth') {
        // 炉の調度の四辺だけでは、炉上の受け梁と両脇の支柱がすり抜ける。
        // interior_parts の炉と同じ床高・柱位置・梁の上下端で、設営時だけ当たりを作る。
        const room = lv.layout.rooms.find(r => p.x >= r.x0 && p.x <= r.x1 && p.z >= r.z0 && p.z <= r.z1);
        const baseY = lv.y + (p.y || 0), beamY = lv.h - (p.y || 0) - .12;
        if (room && beamY > .75) {
          for (const x of [room.x0 + .08, room.x1 - .08]) {
            seg(I, x, p.z - .04, x, p.z + .04, baseY, baseY + beamY - .1, .08);
            // 梁の下は通す。道探しには足元の支柱だけを渡し、絵は既存の木組みを使う。
            lv.layout.walls.push({ ax: x, az: p.z - .04, bx: x, bz: p.z + .04,
              paper: false, guideOnly: true });
          }
          const beam = seg(I, room.x0 + .08, p.z, room.x1 - .08, p.z,
            baseY + beamY - .1, baseY + beamY + .1, .08);
          // 梁の下面へ頭や肩が掛かる時も止める。通常の徒歩では梁下を通せる高さを保つ。
          if (S.quality === 'high') beam.bodyOverlap = true;
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
      }
      continue;
      }
      if (I.profile === 'nodafukushima' && S.quality === 'high') {
      const nodaAltar = S.quality === 'high' && I.profile === 'nodafukushima' && I.kind === 'hondo' && p.part === 'altar';
      // 御影堂は壇の上框までを台として受ける。像の頭まで壇全幅を塞がない。
      const bodyTop = nodaAltar ? lv.y + (p.y || 0) + .54 * p.h / 1.5 : top;
      seg(I, x0, z0, x1, z0, lv.y - .4, bodyTop, .04);
      seg(I, x0, z1, x1, z1, lv.y - .4, bodyTop, .04);
      seg(I, x0, z0, x0, z1, lv.y - .4, bodyTop, .04);
      seg(I, x1, z0, x1, z1, lv.y - .4, bodyTop, .04);
      if (nodaAltar) {
        // 御木像・後屏・灯明と、頭上の天蓋・吊り金具を別々に受ける。
        // 内陣から見える空隙を一枚の見えない壁で塞がない。
        // interior_parts.js の天蓋と同じ寸法・縮尺で、設営時だけ線を作る。
        const sx = p.w / 2.1, sy = p.h / 1.5, sz = p.d;
        const base = lv.y + (p.y || 0), c = Math.cos(p.rot || 0), s = Math.sin(p.rot || 0);
        const altarSeg = (ax, az, bx, bz, bottom, upper, radius) => seg(I,
          p.x + ax * sx * c + az * sz * s, p.z - ax * sx * s + az * sz * c,
          p.x + bx * sx * c + bz * sz * s, p.z - bx * sx * s + bz * sz * c,
          bottom, upper, radius);
        // 台座・法衣・腕・頭の外寸。設営時だけ作り、描く形や毎コマの処理は増やさない。
        const altarBox = (x, z, w, d, low, high) => {
          const a = x - w / 2, b = x + w / 2, c = z - d / 2, e = z + d / 2;
          for (const zz of [c, e]) altarSeg(a, zz, b, zz, base + low * sy, base + high * sy, .004);
          for (const xx of [a, b]) altarSeg(xx, c, xx, e, base + low * sy, base + high * sy, .004);
        };
        altarBox(0, -.06, .72, .58, .54, .66);
        altarBox(0, -.04, .65, .48, .66, .82);
        altarBox(0, -.1, .5, .325, .82, 1.19);
        for (const side of [-1, 1]) altarBox(side * .24, .02, .13, .24, .87, 1.17);
        altarBox(0, .14, .45, .18, .89, .99);
        altarBox(0, -.08, .23, .23, 1.185, 1.435);
        altarBox(0, .025, .05, .056, 1.26, 1.34);
        // 壇上の左右の灯明も、細い支柱の脇を空けたまま皿まで受ける。
        for (const x of [-.75, .75]) {
          altarBox(x, 0, .32, .32, .55, .60);
          altarBox(x, 0, .05, .05, .60, 1.315);
          altarBox(x, 0, .18, .18, 1.315, 1.393);
        }
        // 後屏は上框から立つ薄い板。全高を受けても本尊の前は塞がない。
        const screenBottom = base + .54 * sy, screenTop = base + 1.76 * sy;
        for (const z of [-.4485, -.4015])
          altarSeg(-.766, z, .766, z, screenBottom, screenTop, .004);
        for (const x of [-.766, .766])
          altarSeg(x, -.4485, x, -.4015, screenBottom, screenTop, .004);
        // 上框は幅一・七メートル、奥行き八十二センチ。下の木枠も同じ四辺で受ける。
        const bottom = base + 2.14 * sy, upper = base + 2.27 * sy;
        for (const z of [-.49, .33]) altarSeg(-.85, z, .85, z, bottom, upper, .015);
        for (const x of [-.85, .85]) altarSeg(x, -.49, x, .33, bottom, upper, .015);
        // 吊り材は受け木の下面で止める。鏡板まで見えない金具を伸ばさず、
        // 格縁へ渡した受け木の四辺にも、見える幅・高さだけ当たりを付ける。
        const support = nodaCanopySupport(lv.layout, p, lv.h);
        if (support) {
          const top = base + support.top * sy;
          for (const z of [-.34, .18]) {
            for (const x of [-.55, .55]) altarSeg(x, z, x, z, upper, top, .01);
            const back = z - .04 / sz, front = z + .04 / sz;
            const left = support.left, right = support.right;
            for (const zz of [back + .005 / sz, front - .005 / sz])
              altarSeg(left, zz, right, zz, top, top + .06, .005);
            for (const x of [left + .005 / sx, right - .005 / sx])
              altarSeg(x, back, x, front, top, top + .06, .005);
          }
        }
      }
      continue;
      }
      if (I.profile === 'moribe') {
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
      if (!p.solids && !moribeAltar && !moribeDesk && !moribeStorage) {
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
      }
      } else if (S.quality === 'high' && I.profile === 'shitaragahara' && I.kind === 'hondo'
          && ['offering', 'sutraDesk'].includes(p.part)) {
        // 前卓・経机の脚間を床下まで続く見えない壁で塞がない。
        // 内装と同じ天板・四脚・幕板・貫だけを設営時に登録する。
        const offering = p.part === 'offering', base = lv.y + (p.y || 0);
        const c = Math.cos(p.rot || 0), s = Math.sin(p.rot || 0);
        const timber = (x, z, w, d, low, high) => {
          const r = Math.min(w, d) / 2;
          const dx = w >= d ? w / 2 - r : 0, dz = d > w ? d / 2 - r : 0;
          seg(I, p.x + (x - dx) * c + (z - dz) * s,
            p.z - (x - dx) * s + (z - dz) * c,
            p.x + (x + dx) * c + (z + dz) * s,
            p.z - (x + dx) * s + (z + dz) * c,
            base + low, base + high, r).bodyOverlap = true;
        };
        const thickness = offering ? .055 : .04, leg = offering ? .065 : .055;
        const legX = offering ? ww / 2 - .055 - leg / 2 : ww * .39;
        const legZ = offering ? dd / 2 - .055 - leg / 2 : dd * .32;
        const legH = p.h - thickness;
        const apronH = offering ? .09 : .07;
        const apronTop = offering ? p.h - .055 : legH;
        const apronWidth = offering ? .035 : .025;
        const tieH = offering ? .055 : .045, tieY = offering ? legH * .3 : .11;
        // 天板は接ぎ板ごとに受け、外周の丸みも板幅の内側に収める。
        for (let j = 0; j < 3; j++)
          timber(0, -dd / 2 + (j + .5) * dd / 3, ww, dd / 3, legH, p.h);
        // 三枚の天板を受ける裏桟も、見える木部と同じ位置で槍・矢を受ける。
        // 前卓と経机それぞれの幅・厚みを使い、幕板の内側だけに納める。
        // 脚間全体を塞がず、設営時に既存の木材の当たりへ二本だけ足す。
        const battenW = offering ? .04 : .035, battenH = offering ? .03 : .025;
        for (const x of [-ww * .22, ww * .22])
          timber(x, 0, battenW, legZ * 2 - apronWidth, legH - battenH, legH);
        for (const x of [-legX, legX]) {
          for (const z of [-legZ, legZ]) timber(x, z, leg, leg, 0, legH);
          timber(x, 0, apronWidth, legZ * 2 - leg, apronTop - apronH, apronTop);
          timber(x, 0, offering ? .055 : .035, legZ * 2 - leg, tieY - tieH / 2, tieY + tieH / 2);
        }
        for (const z of [-legZ, legZ]) {
          timber(0, z, legX * 2 - leg, apronWidth, apronTop - apronH, apronTop);
          if (offering || z < 0)
            timber(0, z, legX * 2 - leg, offering ? .055 : .035,
              tieY - (offering ? .055 : .04) / 2, tieY + (offering ? .055 : .04) / 2);
        }
      } else if (S.quality === 'high' && I.profile === 'shitaragahara' && I.kind === 'minka' && p.part === 'storage') {
        // 土間の木櫃は八センチの脚木で浮いている。床下まで続く四周の壁を残さず、
        // 胴・蓋・二本の脚木と押さえ木だけを、調度と同じ高さ・向きで受ける。
        // 設営時だけ作り、毎コマは既存の当たりを使う。
        const c = Math.cos(p.rot || 0), s = Math.sin(p.rot || 0), base = lv.y + (p.y || 0);
        const timber = (x, z, w, d, low, high) => {
          const r = Math.min(w, d) / 2;
          const dx = w >= d ? w / 2 - r : 0, dz = d > w ? d / 2 - r : 0;
          seg(I, p.x + (x - dx) * c + (z - dz) * s,
            p.z - (x - dx) * s + (z - dz) * c,
            p.x + (x + dx) * c + (z + dz) * s,
            p.z - (x + dx) * s + (z + dz) * c,
            base + low, base + high, r).bodyOverlap = true;
        };
        for (const x of [-ww * .32, ww * .32]) {
          timber(x, 0, .09, dd - .04, 0, .08);
          timber(x, 0, .055, dd, p.h - .025, p.h);
        }
        // 胴の側面は蓋板の上端まで。押さえ木のない所に上端の壁を作らない。
        for (const side of [-1, 1]) {
          timber(0, side * (dd / 2 - .0175), ww, .035, .08, p.h - .025);
          timber(side * (ww / 2 - .0175), 0, .035, dd - .07, .08, p.h - .025);
        }
        timber(0, 0, ww, dd, .08, .115); // 底板
        timber(0, 0, ww, dd, p.h - .065, p.h - .025); // 蓋の裏板と接ぎ板
      } else if (S.quality === 'high' && I.profile === 'shitaragahara' && I.kind === 'minka' && p.part === 'stove') {
        // 土間の竈を高さ九十センチの見えない箱で囲わない。
        // 焚口・背面の煙道を空け、土の袖・天端・鉄釜・木蓋だけで受ける。
        // 裏向きの家でも描く調度と同じ回転を使う。登録は設営時だけ。
        const c = Math.cos(p.rot || 0), s = Math.sin(p.rot || 0), base = lv.y + (p.y || 0);
        const piece = (x, z, w, d, low, high) => {
          const r = Math.min(w, d) / 2;
          const dx = w >= d ? w / 2 - r : 0, dz = d > w ? d / 2 - r : 0;
          seg(I, p.x + (x - dx) * c + (z - dz) * s,
            p.z - (x - dx) * s + (z - dz) * c,
            p.x + (x + dx) * c + (z + dz) * s,
            p.z - (x + dx) * s + (z + dz) * c,
            base + low, base + high, r).bodyOverlap = true;
        };
        piece(0, 0, .85, .7, 0, .1); // 炉床
        piece(0, -.3, .85, .1, .1, .3); // 奥壁の下部
        for (const side of [-1, 1]) {
          piece(side * .2425, -.3, .365, .1, .3, .4); // 煙道の両脇
          piece(side * .3, .05, .25, .6, .1, .4); // 焚口の袖
        }
        // 丸い釜口の外側だけを短い帯へ割る。背面の煙抜きも土で塞がない。
        const strips = 8, step = .85 / strips;
        for (let j = 0; j < strips; j++) {
          const a = -.425 + j * step, b = a + step, x = (a + b) / 2;
          // 帯の中で最大の穴幅を使い、丸い開口の中へ当たりを張り出さない。
          const near = a <= 0 && b >= 0 ? 0 : Math.min(Math.abs(a), Math.abs(b));
          const hole = Math.sqrt(Math.max(0, .25 * .25 - near * near));
          const back = a < .06 && b > -.06 ? -.27 : -.35;
          if (hole < .35) piece(x, (hole + .35) / 2, step, .35 - hole, .4, .65);
          if (-hole > back) piece(x, (back - hole) / 2, step, -hole - back, .4, .65);
        }
        // 釜底は炉内へ下がり、羽は天端へ掛かる。蓋と押さえ木の上に壁を残さない。
        piece(0, 0, .4, .4, .45, .54);
        piece(0, 0, .5, .5, .54, .65);
        piece(0, 0, .6, .6, .65, .67);
        piece(0, 0, .526, .526, .67, .6875);
        piece(0, 0, .49, .49, .6875, .7225);
        for (const x of [-.12, .12]) piece(x, 0, .035, .38, .7225, .7575);
      } else if (S.quality === 'high' && I.profile === 'shitaragahara' && I.kind === 'minka' && p.part === 'waterJar') {
        // 土間の丸い水甕を床下まで続く四角い壁で囲わない。
        // 胴・肩・口縁の外径へ高さ別に合わせ、脇に見えない角を残さない。
        // 調度の寸法と床高を使い、設営時だけ七つの円形の当たりを登録する。
        const base = lv.y + (p.y || 0), scale = p.h / .62;
        const radius = Math.max(ww, dd) / .44;
        for (const [low, high, r] of [[0, .08, .18], [.08, .28, .22],
          [.28, .43, .22], [.43, .50, .21], [.50, .56, .193],
          [.56, .59, .19], [.59, .62, .19]])
          seg(I, p.x, p.z, p.x, p.z, base + low * scale, base + high * scale,
            r * radius).bodyOverlap = true;
      } else if (S.quality === 'high' && I.profile === 'shitaragahara' && I.kind === 'hondo' && p.part === 'sutraChest') {
        // 経箱の外側を床下から続く壁で囲わず、台輪・底板・胴・蓋で受ける。
        // 内陣の通路へ当たりを張り出さず、裏向きの堂でも調度の向きを共用する。
        // 設営時だけ登録し、毎コマの形や材質は増やさない。
        const c = Math.cos(p.rot || 0), s = Math.sin(p.rot || 0), base = lv.y + (p.y || 0);
        const timber = (x, z, w, d, low, high) => {
          const r = Math.min(w, d) / 2;
          const dx = w >= d ? w / 2 - r : 0, dz = d > w ? d / 2 - r : 0;
          seg(I, p.x + (x - dx) * c + (z - dz) * s,
            p.z - (x - dx) * s + (z - dz) * c,
            p.x + (x + dx) * c + (z + dz) * s,
            p.z - (x + dx) * s + (z + dz) * c,
            base + low, base + high, r).bodyOverlap = true;
        };
        const foot = .05, lid = .055, wall = .025, bodyTop = p.h - lid;
        timber(0, 0, ww, dd, 0, foot);
        timber(0, 0, ww - .04, dd - .04, foot, foot + wall);
        for (const side of [-1, 1]) {
          timber(0, side * (dd / 2 - .02 - wall / 2), ww - .04, wall, foot, bodyTop);
          timber(side * (ww / 2 - .02 - wall / 2), 0, wall, dd - .04 - wall * 2, foot, bodyTop);
        }
        // 蓋の目地は下半分に接ぎ代がある。板と同じ高さで隙間を受ける。
        for (let i = 0; i < 3; i++) {
          timber(0, -dd / 2 + (i + .5) * dd / 3, ww, dd / 3 - .002, bodyTop, p.h);
          if (i) timber(0, -dd / 2 + i * dd / 3, ww, .002, bodyTop, bodyTop + lid / 2);
        }
      } else if (!p.solids && !templeAltar && !iwamuraRack && !(S.quality === 'high' && I.profile === 'shitaragahara' && I.kind === 'hondo' && p.part === 'altar')) {
        seg(I, x0, z0, x1, z0, lv.y - .4, top, .04);
        seg(I, x0, z1, x1, z1, lv.y - .4, top, .04);
        seg(I, x0, z0, x0, z1, lv.y - .4, top, .04);
        seg(I, x1, z0, x1, z1, lv.y - .4, top, .04);
      }
      if (S.quality === 'high' && I.profile === 'shitaragahara' && I.kind === 'minka' && p.part === 'hearth') {
        // 炉縁の当たりだけでは、その上の鉄鍋・弦・自在鉤を武器が抜ける。
        // 調度と同じ寸法・向きで木部と鉄部だけを受け、弦の内側は空ける。
        // 設営時だけ登録し、鍋の幅を天井まで引き延ばした見えない壁は作らない。
        const c = Math.cos(p.rot || 0), s = Math.sin(p.rot || 0), base = lv.y + (p.y || 0);
        const piece = (a, b, z, low, high, radius, endZ = z) => seg(I,
          p.x + a * c + z * s, p.z - a * s + z * c,
          p.x + b * c + endZ * s, p.z - b * s + endZ * c,
          base + low, base + high, radius).bodyOverlap = true;
        piece(0, 0, 0, .3, .344, .18); // 丸い鍋胴の上半分
        piece(0, 0, 0, .344, .43, .19);
        piece(0, 0, 0, .43, .455, .185); // 木蓋
        for (const x of [-.085, .085]) piece(x, x, -.135, .455, .49, .015, .135); // 蓋の桟
        // 半円の弦は六つに分け、中央の空間へ矢が通る余地を残す。
        for (let j = 0; j < 6; j++) {
          const a = Math.PI * j / 6, b = Math.PI * (j + 1) / 6;
          const ya = .4 + .16 * Math.sin(a), yb = .4 + .16 * Math.sin(b);
          piece(.16 * Math.cos(a), .16 * Math.cos(b), 0,
            Math.min(ya, yb) - .012, Math.max(ya, yb) + .012, .012);
        }
        piece(0, 0, 0, .53, .81, .009); // 鉄の吊り棒
        piece(0, 0, 0, .8, lv.h - .18, .0225); // 自在竹
        piece(-.05, .17, 0, .8675, .9125, .0225); // 高さを留める横木
        // 頭上の火棚も、内装と同じ木枠・桟だけで受ける。
        // 棚全体を板の当たりで塞がず、自在竹の穴とすのこの隙間を残す。
        // 設営時に登録し、跳躍中の頭と槍・矢にも同じ木部を使う。
        const rackY = Math.min(1.92, lv.h - .43);
        if (rackY >= 1.82) {
          const halfW = (p.w - .12) / 2, halfD = (p.d - .12) / 2;
          const rail = .035, opening = .06, innerRail = .025;
          // 線分の端の丸みまで木口の内側へ納め、隙間を狭めない。
          const rackWood = (x, z, w, d, height) => {
            const radius = Math.min(w, d) / 2;
            const dx = w >= d ? w / 2 - radius : 0;
            const dz = d > w ? d / 2 - radius : 0;
            piece(x - dx, x + dx, z - dz,
              rackY - height / 2, rackY + height / 2, radius, z + dz);
          };
          for (const side of [-1, 1]) {
            rackWood(side * (halfW - rail / 2), 0, rail, halfD * 2, rail);
            rackWood(0, side * (halfD - rail / 2), halfW * 2 - rail * 2, rail, rail);
            rackWood(side * (opening + innerRail / 2), 0,
              innerRail, halfD * 2 - rail * 2, .025);
            const length = halfW - rail - opening - innerRail;
            for (const z of [-halfD / 2, 0, halfD / 2])
              rackWood(side * (opening + innerRail + length / 2), z, length, .025, .025);
          }
        }
      }
      // 岩村の槍掛けは支柱・横木・短槍を別々に受ける。
      // 棚全体を高い箱で囲むと、部材のない空所まで槍や戸へ伸ばす手を止める。
      // 描く調度と同じ寸法・拡縮・床高を使い、設営時だけ当たりを登録する。
      if (iwamuraRack) {
        const base = lv.y + (p.y || 0) + (onBoards ? .012 : 0);
        const sx = ww / .7, sy = p.h / 2.05, sz = dd / .6;
        const c = Math.cos(p.rot || 0), s = Math.sin(p.rot || 0);
        p.reachBoxes = [];
        const member = (x, yy, z, width, height, depth) => {
          x *= sx; yy *= sy; z *= sz;
          width *= sx; height *= sy; depth *= sz;
          const radius = Math.min(width, depth) / 2;
          const hx = Math.max(0, width / 2 - radius);
          const hz = Math.max(0, depth / 2 - radius);
          const bottom = base + yy - height / 2, upper = base + yy + height / 2;
          p.reachBoxes.push({ x0: x - width / 2, x1: x + width / 2,
            z0: z - depth / 2, z1: z + depth / 2, y0: bottom - lv.y, y1: upper - lv.y });
          seg(I, p.x + (x - hx) * c + (z - hz) * s, p.z - (x - hx) * s + (z - hz) * c,
            p.x + (x + hx) * c + (z + hz) * s, p.z - (x + hx) * s + (z + hz) * c,
            bottom, upper, radius);
        };
        for (const side of [-1, 1]) {
          member(side * .28, .04, 0, .08, .08, .6);
          member(side * .28, .79, -.12, .06, 1.42, .07);
        }
        member(0, .12, .04, .62, .08, .12);
        for (const yy of [.65, 1.38]) member(0, yy, -.08, .62, .07, .07);
        for (const x of [-.17, 0, .17]) {
          member(x, .98, 0, .026, 1.72, .026);
          member(x, 1.845, 0, .035, .07, .035);
          member(x, 1.965, 0, .09, .17, .028);
        }
      }
      // 岩村の両堂は、須弥壇の背後に天井近くまで来迎壁と柱が立つ。
      // 壇の高さだけの当たりでは上半分へ槍が抜けるため、描画と同じ
      // 拡縮・床高・向きで壁、左右の柱、上の横木だけを受ける。
      // 壇前の板間や本尊の周囲を見えない壁で塞がず、設営時だけ登録する。
      if (templeAltar) {
        const base = lv.y + (p.y || 0) + (onBoards ? .012 : 0);
        const sx = ww / 2.1, sy = p.h / 1.5, sz = dd;
        const c = Math.cos(p.rot || 0), s = Math.sin(p.rot || 0);
        // 戸へ手を伸ばす判定も、壇・像・来迎壁の実際の部材を共用する。
        // 部材の間の空所を大きな箱で塞がず、天井までの壁は手を遮る。
        p.reachBoxes = [];
        // 須弥壇と前卓を一つの箱で囲むと、幅の狭い前卓の両脇まで塞がる。
        // 描く側の壇（奥行き八十センチ）と前卓を別々に受け、内陣の板間を空ける。
        // 反転した堂も調度と同じ向きへ回す。設営時だけ当たりを登録する。
        const footprint = (width, back, front, height) => {
          const left = -width * sx / 2, right = width * sx / 2;
          p.reachBoxes.push({ x0: left, x1: right, z0: back * sz, z1: front * sz,
            y0: base - lv.y, y1: base - lv.y + height * sy });
          const edge = (ax, az, bx, bz) => seg(I,
            p.x + ax * c + az * sz * s, p.z - ax * s + az * sz * c,
            p.x + bx * c + bz * sz * s, p.z - bx * s + bz * sz * c,
            base, base + height * sy, .04);
          edge(left, back, right, back);
          edge(left, front, right, front);
          edge(left, back, left, front);
          edge(right, back, right, front);
        };
        footprint(2.1, -.5, .3, .54);
        footprint(1.2, .31, .49, .44);
        const head = (lv.h - (base - lv.y)) / sy - .06;
        const lintel = Math.min(.12, (head - .54) / 2);
        if (head > .66) {
          const timber = (x, bottom, upper, width, depth, localZ = -.45) => {
            const radius = depth * sz / 2;
            const half = Math.max(0, width * sx / 2 - radius);
            const z = localZ * sz, a = x * sx - half, b = x * sx + half;
            p.reachBoxes.push({ x0: a - radius, x1: b + radius, z0: z - radius, z1: z + radius,
              y0: base - lv.y + bottom * sy, y1: base - lv.y + upper * sy });
            seg(I, p.x + a * c + z * s, p.z - a * s + z * c,
              p.x + b * c + z * s, p.z - b * s + z * c,
              base + bottom * sy, base + upper * sy, radius);
          };
          timber(0, .54, head - lintel, 1.76, .06);
          for (const side of [-1, 1]) timber(side * .94, 0, head, .12, .08);
          timber(0, head - lintel, head, 2, .08);
          // 共通調度の蓮台・坐像・光背と同じ寸法から当たりを取る。
          // 反対向きの堂も同じ変換を使い、毎コマの形や材質は増やさない。
          timber(0, .54, .9, .68, .5, -.1);
          timber(0, .9, 1.3, .52, .3, -.1);
          timber(0, 1.3, 1.6, .24, .22, -.1);
          timber(0, .62, 1.74, .9, .05, -.36);
        }
      }
      if (S.quality === 'high' && I.profile === 'shitaragahara' && I.kind === 'hondo'
          && ['offering', 'sutraDesk'].includes(p.part)) {
        // 前卓の供具と経机の鈴は天板より上にある。金属の器を槍や矢が
        // 素通りしないよう、見える胴・口縁の高さと太さだけを受ける。
        // 机全体を供具の高さへ広げず、花枝・線香・炎の周りも空ける。
        // 設営時だけ登録し、回転した間取りでも調度と同じ座標を使う。
        const c = Math.cos(p.rot || 0), s = Math.sin(p.rot || 0);
        const base = lv.y + (p.y || 0) + p.h;
        const vessel = (x, z, low, high, radius) => {
          const xx = p.x + x * c + z * s, zz = p.z - x * s + z * c;
          seg(I, xx, zz, xx, zz, base + low, base + high, radius).bodyOverlap = true;
        };
        if (p.part === 'offering') {
          vessel(0, 0, .03, .15, .12); // 香炉の胴
          vessel(0, 0, .138, .162, .125); // 香炉の口縁
          const side = Math.min(.4, p.w / 2 - .12);
          vessel(-side, 0, 0, .13, .085); // 花立の胴
          vessel(-side, 0, .13, .2, .075);
          vessel(-side, 0, .2, .25, .045); // 花立の首と口
          vessel(side, 0, 0, .025, .09); // 燭台の足
          vessel(side, 0, .025, .06, .09);
          vessel(side, 0, .06, .23, .025); // 燭台の竿
          vessel(side, 0, .23, .265, .065); // 受け皿
        } else {
          vessel(.34, .04, 0, .04, .11); // 鈴を受ける輪台
          vessel(.34, .04, .025, .05, .07);
          vessel(.34, .04, .05, .115, .085); // 鈴の胴と口縁
        }
      }
      if (p.part === 'altar' && ['honnoji_kodo', 'honnoji_soshido'].includes(I.profile)) {
        // 来迎壁と柱は調度の高さを越えて天井まで続く。壇全体を高い箱で塞がず、
        // 描く木部だけに当たりを足し、左右の通り道と格子戸の引き代を保つ。
        const f = HONNOJI_ALTAR_FRAME, sx = ww / 2.1, sy = p.h / 1.5, sz = dd;
        const base = lv.y + (p.y || 0), c = Math.cos(p.rot || 0), s = Math.sin(p.rot || 0);
        // 斗・桁・格縁の接続高を描く木部と共有し、天井まで見えない柱を残さない。
        const bearingTop = lv.y + lv.h - f.ceilingDrop, capitalTop = bearingTop - f.bearingH * sy;
        const frameSeg = (left, right, z, bottom, upper, depth) => {
          const az = z * sz;
          seg(I, p.x + left * sx * c + az * s, p.z - left * sx * s + az * c,
            p.x + right * sx * c + az * s, p.z - right * sx * s + az * c,
            bottom, upper, depth * sz / 2);
        };
        // 来迎壁の板を受ける地覆も、描く木部と同じ幅・高さ・厚さで避ける。
        frameSeg(-f.screenW / 2, f.screenW / 2, f.screenZ, base, base + f.sillH * sy, f.sillD);
        frameSeg(-f.screenW / 2, f.screenW / 2, f.screenZ,
          base + f.sillH * sy, capitalTop - f.screenDrop * sy, f.screenD);
        for (const x of [-f.postX, f.postX]) {
          const capitalY = capitalTop - f.capitalH * sy;
          frameSeg(x - f.postW / 2, x + f.postW / 2, f.postZ, base, capitalY, f.postW);
          frameSeg(x - f.capitalW / 2, x + f.capitalW / 2, f.postZ,
            capitalY, capitalTop, f.capitalW);
        }
        frameSeg(-f.bearingW / 2, f.bearingW / 2, f.postZ, capitalTop, bearingTop, f.bearingD);
        frameSeg(-f.beamW / 2, f.beamW / 2, f.postZ,
          capitalTop - (f.beamDrop + f.beamH / 2) * sy,
          capitalTop - (f.beamDrop - f.beamH / 2) * sy, f.beamD);
      }
    }
    lv.oilLamps = [];
    for (let q = 0; I.profile === 'moribe' && I.kind !== 'hondo' && q < Math.min(2, lv.layout.rooms.length); q++) {
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
    // 灯明台は描き始める前に位置と当たりを決め、近づいた時も同じ座標を使う。
    // 台の下全体を壁にせず、足板・支柱・受け皿の高さだけで体と武器を止める。
    if (I.profile === 'iga') {
      // 番所の槍掛けは右壁にある。灯明台は左壁の手前へ置き、
      // 槍の台座と油皿を重ねず、奥の文机・中央の板戸も空ける。
      lv.igaLamps = lv.layout.rooms.filter(r => ['boards', 'tatami'].includes(r.floor)).map(room => ({
        room, x: room.x0 + .45,
        z: room.z1 - .45, y: lv.y + (room.y || 0) + (room.floor === 'tatami' ? .06 : 0),
      }));
      for (const lamp of lv.igaLamps) {
        for (const [half, bottom, top] of [[.13, 0, .06], [.025, .06, .4], [.12, .4, .448]]) {
          const x0 = lamp.x - half + .005, x1 = lamp.x + half - .005;
          const z0 = lamp.z - half + .005, z1 = lamp.z + half - .005;
          for (const [ax, az, bx, bz] of [[x0, z0, x1, z0], [x0, z1, x1, z1],
            [x0, z0, x0, z1], [x1, z0, x1, z1]])
            seg(I, ax, az, bx, bz, lamp.y + bottom, lamp.y + top, .005).bodyOverlap = true;
        }
      }
    }
    // 伊賀の見せる小屋組にも木の当たりを持たせる。
    // 床から天井まで塞がず、描く梁・桁の高さと見込みだけを止める。
    // 設営時に登録し、近づいて室内を描き始めても当たりを増やさない。
    if (I.profile === 'iga' && ['minka', 'nagaya', 'bansho'].includes(I.kind)) {
      const postX = hw - .16, beamBottom = lv.y + lv.h - .24;
      // 炉の吊り梁が小屋組の梁へ重なる所は一本の太い材で受ける推定復元。
      // 絵・柱・当たりで同じ寸法を使い、設営後は作り直さない。
      lv.igaRoofBeams = [-hd * .55, hd * .55].map(z => ({ z, d: .18, bottom: -.24, top: 0, postSpan: .16 }));
      if (I.kind === 'minka') for (const p of lv.layout.props) if (p.part === 'hearth') {
        const beam = lv.igaRoofBeams.find(b => Math.abs(b.z - p.z) < (b.d + .16) / 2);
        if (beam) {
          const front = Math.min(beam.z - beam.d / 2, p.z - .08);
          const back = Math.max(beam.z + beam.d / 2, p.z + .08);
          beam.z = (front + back) / 2; beam.d = back - front;
          beam.bottom = -.25; beam.postSpan = beam.d;
        } else lv.igaRoofBeams.push({ z: p.z, d: .16, bottom: -.25, top: -.05, postSpan: .16 });
      }
      for (const side of [-1, 1])
        seg(I, side * postX, -hd + .17, side * postX, hd - .17,
          beamBottom, lv.y + lv.h, .09).bodyOverlap = true;
      // 妻側にも同じ太さの梁を描く。中央の二本だけに当たりを付けると、
      // 隅柱を結ぶ妻梁へ槍や視点が抜ける。描画と同じ柱心まで含める。
      // 梁の木口は柱の外面で止める。壁端まで伸ばすと柱から八センチ出て板壁へ刺さる。
      const beamEnd = postX + .08;
      for (const z of [-hd + .16, hd - .16])
        seg(I, -beamEnd + .09, z, beamEnd - .09, z,
          beamBottom, lv.y + lv.h, .09).bodyOverlap = true;
      for (const b of lv.igaRoofBeams)
        seg(I, -beamEnd + b.d / 2, b.z, beamEnd - b.d / 2, b.z,
          lv.y + lv.h + b.bottom, lv.y + lv.h + b.top, b.d / 2).bodyOverlap = true;
      // 四隅の火打材も、描く斜材の高さと幅だけ槍・視点を止める。
      // 丸い当たりの端の半径を引き、梁・桁へ差す端を描画の長さにそろえる。
      // 設営時だけ登録し、床から頭上までを見えない壁で塞がない。
      const cornerRun = Math.min(.55, hw * .25, hd * .25);
      const braceHalf = (Math.SQRT2 * cornerRun / 2 + .04 - .06) / Math.SQRT2;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        // 炉の吊り梁とまとめた横梁は柱芯も移る。火打材も実際の梁芯へ合わせる。
        const beam = lv.igaRoofBeams[sz < 0 ? 0 : 1];
        const cx = sx * (postX - cornerRun / 2), cz = beam.z - sz * cornerRun / 2;
        seg(I, cx - sx * braceHalf, cz + sz * braceHalf,
          cx + sx * braceHalf, cz - sz * braceHalf,
          lv.y + lv.h - .18, lv.y + lv.h - .06, .06).bodyOverlap = true;
      }
    }
    // 館の入口の横架材・根太も見えている木だけを止める。
    // 座敷の竿縁とは分け、下の描画と同じ柱筋・差し込み寸法へ合わせる。
    // 当たりは設営時に一度だけ登録し、入口全体を見えない壁で塞がない。
    if (!I.open && I.profile === 'iga' && I.kind === 'yashiki') {
      const bottom = lv.y + lv.h - .24, top = lv.y + lv.h;
      for (const r of lv.layout.rooms) if (r.floor === 'boards') {
        const supportZ0 = r.z0, supportZ1 = r.z1 - .16;
        // 両端は幅十六センチの側柱の外面まで。丸い当たりの半径も
        // 内側へ引き、描く木口を越えて外壁の外まで槍や体を止めない。
        for (const z of [supportZ0, supportZ1])
          seg(I, r.x0 + .16, z, r.x1 - .16, z, bottom, top, .08).bodyOverlap = true;
        for (let x = r.x0 + 1.7; x < r.x1 - .1; x += 1.7)
          seg(I, x, supportZ0 + .02, x, supportZ1 - .02,
            bottom, top, .085).bodyOverlap = true;
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
  // 庫裏の表口は土間でなく、十八センチ上げた配膳の板間へ通じる。
  // 間取りの床高を階段・踊り場・入室先で共用し、敷居の前へ段差を残さない。
  const honnojiEntryFloor = I.profile === 'honnoji_kuri'
    ? L0.layout.rooms.find(r => r.floor === 'boards' && I.door.lx >= r.x0 && I.door.lx <= r.x1
      && ds * hd0 >= r.z0 && ds * hd0 <= r.z1) : null;
  const honnojiEntryY = L0.y + (honnojiEntryFloor?.y || 0);
  if (o.approach) {
    const { pad, len } = o.approach;
    const [tx, tz] = I.P(I.door.lx, ds * (hd0 + pad)), [bx, bz] = I.P(I.door.lx, ds * (hd0 + pad + len));
    const gy = I.profile === 'moribe' ? drawGroundAt(world, bx, bz) : world.heightAt(bx, bz);
    // 設楽原の民家の踏み段は、十二センチ低い土間と板戸の敷居へつなぐ。
    // 板間の高さまで上げると、戸を開けた先に見た目と当たりの段差が残る。
    const villageHall = S.quality === 'high' && I.profile === 'shitaragahara' && I.kind === 'hondo';
    // 小堂の石段は室内より十一センチ低い縁板へ上がる。絵と段の足場で同じ上端を使う。
    const approachFloor = villageHall ? -.11
      : S.quality === 'high' && I.profile === 'shitaragahara' && I.kind === 'minka'
        ? (L0.layout.rooms.find(r => r.floor === 'earth')?.y || 0) : 0;
    const entryY = I.profile?.startsWith('honnoji_') ? honnojiEntryY : L0.y + approachFloor;
    // 高画質の設楽原だけ、見える踏板・石段の段数を足場にも渡す。
    // 坂一本のまま扱い、段ごとの床や毎コマの物体は増やさない。
    const steps = S.quality === 'high' && I.profile === 'shitaragahara' && ['minka', 'hondo'].includes(I.kind)
      ? Math.max(3, Math.round((entryY - gy) / .28)) : 0;
    I.approach = { pad, len, gy, y: entryY, steps };
    addRamp({ ax: bx, az: bz, bx: tx, bz: tz, w: I.door.w + 0.3, ya: gy, yb: entryY, steps, inner: true });   // 横からは乗らない（下の端から上る）
    // 小堂は既存の縁側を歩く。高い踊り場で縁板を覆わず、外壁の床框だけ室内へつなぐ。
    const landingDepth = villageHall ? .35 : pad + .4;
    const [cx, cz] = I.P(I.door.lx, ds * (villageHall ? hd0 - .025 : hd0 + pad / 2 - .1));
    addDeck({ x0: -(I.door.w + 0.4) / 2, x1: (I.door.w + 0.4) / 2, z0: -landingDepth / 2, z1: landingDepth / 2,
      rot, cx, cz, y: villageHall ? L0.y : entryY, ...(villageHall ? { pad: 0 } : {}), name: `${I.name}の戸口` });
    const [ox, oz] = I.P(I.door.lx, ds * (hd0 + pad + len + 0.8));
    I.doorOut = { x: ox, z: oz };
  } else {
    const [ox, oz] = I.P(I.door.lx, ds * (hd0 + 1.2));
    I.doorOut = { x: ox, z: oz };
  }
  {
    if (I.profile === 'iga') {
      // 伊賀の上がり口は外壁から約一メートル。従来の一歩先は閉じた板戸・障子に重なる。
      // 外の戸を開けてから、その敷居のすぐ内側へ入り、室内の戸は札で別に開ける。
      const inset = I.profile === 'iga' ? .35 : 1.1;
      const entryZ = ds * (hd0 - inset), [ix, iz] = I.P(I.door.lx, entryZ);
      const earthEntry = I.profile === 'iga' && L0.layout.rooms.find(r => r.floor === 'earth'
        && I.door.lx >= r.x0 && I.door.lx <= r.x1 && entryZ >= r.z0 && entryZ <= r.z1);
      let entryY = L0.y + (earthEntry ? (earthEntry.y || 0) + .0255 : 0);
      // 伊賀の入室先は外戸の敷居の上。土間や下地床の高さへ移すと、
      // 足が四センチの木へ埋まる。描く敷居・足場と同じ範囲と上端を使う。
      // 室内の戸は開けず、着地点の高さだけを設営時に決める。
      if (I.profile === 'iga') for (const d of I.doors || []) {
        if (d.lv !== L0 || d.window) continue;
        const sillZ = d.exterior ? d.lz - ds * .21 : d.lz;
        const halfDepth = d.exterior ? .26 : .24;
        if (Math.abs(I.door.lx - d.lx) <= d.W / 2 && Math.abs(entryZ - sillZ) <= halfDepth)
          entryY = Math.max(entryY, d.y + .04);
      }
      I.doorIn = { x: ix, z: iz, y: entryY };
    } else {
    let entryZ = hd0 - (I.profile === 'moribe' && ['yashiki', 'hondo'].includes(I.kind) ? .5 : 1.1);
    if (I.profile?.startsWith('honnoji_')) {
      // 表戸と最初の内戸の間に立つ。狭い僧坊でも閉じた障子を飛び越えない。
      let inner = null, outer = null;
      for (const door of I.doors || []) {
        if (door.lv !== L0) continue;
        if (door.exterior) outer = door;
        else if (!inner || ds * door.lz > ds * inner.lz) inner = door;
      }
      if (inner && outer) {
        const innerEdge = ds * inner.lz + inner.track;
        entryZ = (ds * outer.lz - outer.track + innerEdge) / 2;
        I.entryLimit = innerEdge + .06;
      }
    }
    if (S.quality === 'high' && I.profile === 'inabayama') {
      let inner = null, outer = null;
      for (const door of I.doors || []) {
        if (door.lv !== L0 || door.window) continue;
        if (door.exterior) outer = door;
        else if (!inner || ds * door.lz > ds * inner.lz) inner = door;
      }
      if (inner && outer) {
        const innerEdge = ds * (inner.lz + inner.trackZ) + .04;
        entryZ = (ds * (outer.lz + outer.trackZ) - .04 + innerEdge) / 2;
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
    if (S.quality === 'high' && I.profile === 'shitaragahara' && I.kind === 'minka') {
      const outer = I.doors.find(d => d.exterior && !d.window);
      // 土間の建具は腰障子。動く戸と同じ種類を探し、着地点と出口の範囲を決める。
      const inner = I.doors.find(d => !d.exterior && d.kind === 'shojiKoshi');
      // 戸の面の中間へ降ろす。旧位置は土間の障子と重なり、板間へ押し出されていた。
      if (outer && inner) {
        entryZ = ds * (outer.lz + inner.lz) / 2;
        I.entryMinZ = inner.lz * ds + .4;
      }
    }
    const [ix, iz] = I.P(I.door.lx, ds * entryZ); I.doorIn = { x: ix, z: iz, y: L0.y };
    const entryRoom = L0.layout.rooms.find(r => I.door.lx >= r.x0 && I.door.lx <= r.x1 && ds * entryZ >= r.z0 && ds * entryZ <= r.z1);
    I.doorIn.y += entryRoom?.y || 0;
    }
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
  const spotY = S.quality === 'high' && ['inabayama', 'nodafukushima'].includes(I.profile)
    ? inabaFloorY(I, top, safe.x, safe.z) : top.y + (room?.y || 0);
  I.lordSpot = { x: sp[0], z: sp[1], y: spotY };
  I.where = o.where || (I.oku ? `${I.name}の奥の間` : Ls.length > 1 ? `${I.name}の最上階` : `${I.name}の中`);
  NAKA.list.push(I);
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
// 稲葉山の内陣・上段・板倉と、野田福島の部屋別の仕上げ床。
// 入口や道案内も実際の床高へ揃え、板倉へ入った瞬間や敷居で足元を床下へ置かない。
// 境では高い側を採り、設営済みの間取りを読むだけで座標や配列を作らない。
function inabaFloorY(I, lv, x, z) {
  if (S.quality !== 'high' || !['inabayama', 'nodafukushima'].includes(I.profile)) return lv.y;
  let raised = 0;
  for (const r of lv.layout.rooms) {
    if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1)
      raised = Math.max(raised, (r.y || 0) + (I.profile === 'nodafukushima'
        ? r.floor === 'tatami' ? .06 : r.floor === 'boards' ? .018 : .025 : 0));
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
let nukiWedge = null;
// 貫を柱の仕口へ締める楔。薄い先端を柱へ差し、厚い頭だけを外へ残す推定の納まり。
// 原形は全棟で共有し、設営時に複製した分も既存の木部へ結合する。
function nukiWedgeShape() {
  if (!nukiWedge) {
    nukiWedge = new THREE.BoxGeometry(.12, 1, .04);
    const p = nukiWedge.attributes.position;
    for (let i = 0; i < p.count; i++)
      p.setY(i, p.getY(i) > 0 ? .004 + .024 * (p.getX(i) / .12 + .5) : 0);
    nukiWedge.computeVertexNormals();
  }
  return nukiWedge.clone();
}
let iwamuraLampDish = null;
let iwamuraLampOil = null;
let iwamuraBraceShape = null;
let iwamuraBeamGrainShape = null;
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

// 室内の天井板と壁板は雨ざらしの材と分け、淡い木目を一枚の絵で共有する。
let anegawaCeilingWood = null;
let entryWood = null;
let endWood = null;
let innerThatch = null;
function innerThatchMaterial() {
  // 外の茅と同じ絵を共有し、室内では影と煤を頂点色へ焼き込む。
  if (!innerThatch) innerThatch = new THREE.MeshBasicMaterial({ map: thatchTex(), vertexColors: true });
  return innerThatch;
}
function endWoodMaterial() {
  if (endWood) return endWood;
  // 梁・柱の切断面は縦木目を回さず、年輪のある木口として補う。
  // 姉川の全建物で小さな絵と材質を一つずつ共有する。
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#ede0c7'; ctx.fillRect(0, 0, 64, 64);
  for (let r = 3; r < 100; r += 3) {
    ctx.strokeStyle = r % 2 ? 'rgba(110,76,40,.18)' : 'rgba(110,76,40,.10)';
    ctx.lineWidth = .7; ctx.beginPath();
    ctx.ellipse(22, 27, r, r * .91, .2, 0, Math.PI * 2); ctx.stroke();
  }
  const map = new THREE.CanvasTexture(cv); map.colorSpace = THREE.SRGBColorSpace;
  endWood = new THREE.MeshBasicMaterial({ map, vertexColors: true });
  return endWood;
}
function anegawaCeilingWoodMaterial() {
  if (anegawaCeilingWood) return anegawaCeilingWood;
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 128;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#ede0c7'; ctx.fillRect(0, 0, 64, 128);
  for (let q = 0; q < 36; q++) {
    ctx.strokeStyle = q % 3 ? 'rgba(110,76,40,.12)' : 'rgba(255,249,225,.24)';
    ctx.lineWidth = q % 4 ? .6 : 1;
    ctx.beginPath();
    for (let t = 0; t <= 128; t += 4) {
      const x = q * 64 / 36 + Math.sin(t * Math.PI / 64 + q * 1.7) * .65;
      if (!t) ctx.moveTo(x, t); else ctx.lineTo(x, t);
    }
    ctx.stroke();
  }
  const map = new THREE.CanvasTexture(cv); map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  anegawaCeilingWood = new THREE.MeshBasicMaterial({ map, vertexColors: true });
  return anegawaCeilingWood;
}

// 壁の柱位置。姉川の小屋組も同じ割付を読み、窓の上へ梁を浮かせない。
function wallPostPositions(I, wins, face, side, len) {
  const n = Math.max(2, Math.round(len / 1.9));
  const openings = I.profile === 'anegawa' ? wins.filter(o => o.face === face && o.s === side) : [];
  const posts = new Set();
  const inset = I.profile === 'anegawa' ? .16 : 0;
  for (let q = 0; q <= n; q++) {
    // 姉川の隅柱は両壁の内側から同じ十六センチの位置に置く。
    // 壁端のままでは前後の柱と左右の柱がずれ、隅に二本の柱が立ってしまう。
    const t = q === 0 ? -len / 2 + inset : q === n ? len / 2 - inset : -len / 2 + q * len / n;
    if (!openings.some(o => Math.abs(t - o.t) < o.w / 2 + .08)) posts.add(t);
  }
  for (const o of openings) for (const sign of [-1, 1]) posts.add(o.t + sign * (o.w / 2 + .08));
  return posts;
}

// 中を作る（近づいた時に一度だけ）
function buildInside(rt, I) {
  if (I.profile === 'anegawa') return anegawaBuildInside(rt, I);
  
  I.built = true;
  const M = mats(), list = [], woodFloorList = [], timbers = [], igaBoards = [], plasterWalls = [], lamps = [], winPts = [], paper = [], ceilingWood = [], smokeStains = [];
  let oilLamp;
  const fineIwamura = S.quality === 'high' && (I.profile === 'iwamura' || I.profile?.startsWith('iwamura_'));
  const naibu = I.profile || ['yagura', 'gate'].includes(I.kind) ? new KitBatch() : null;
  const smokeSources = [];
  let soot = null;
  const put = (g, lx, y, lz, hex, emit, target = list) => {
    g.translate(lx, y, lz);
    g = colorize(g, hex, emit);
    // 炉の板間と竈の土間は、それぞれの煙の上がる所だけ壁・柱を煤けさせる推定の姿。
    // 座敷・寺の堂や灯明は汚さず、間仕切りを越えて煤を広げない。
    // 局所座標の頂点色へ一度だけ焼き込み、材質・面数・毎コマの仕事は増やさない。
    if (smokeSources.length && !emit) {
      const p = g.attributes.position, colors = g.attributes.color;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), z = p.getZ(i);
        let shade = 1;
        for (const smoke of smokeSources) {
          const height = p.getY(i) - smoke.y;
          if (height <= 1.2 || z < smoke.z0 || z > smoke.z1) continue;
          const spread = smoke.spread + height * .35, dx = x - smoke.x, dz = z - smoke.z;
          const plume = Math.max(0, 1 - (dx * dx + dz * dz) / (spread * spread));
          // 外壁まで煤をつなぎ、板間との境だけ薄くする。竈の背後の壁を白く残さない。
          const edge = Math.min(1, smoke.fadeBack ? (z - smoke.z0) / .35 : 1,
            smoke.fadeFront ? (smoke.z1 - z) / .35 : 1);
          shade = Math.min(shade, 1 - .36 * plume * edge * Math.min(1, (height - 1.2) / .8));
        }
        colors.setXYZ(i, colors.getX(i) * shade, colors.getY(i) * shade, colors.getZ(i) * shade);
      }
    }
    if (soot && !emit) {
      const p = g.attributes.position, c = g.attributes.color;
      for (let i = 0; i < p.count; i++) {
        const shade = igaSootShade(soot, p.getX(i), p.getY(i), p.getZ(i));
        c.setXYZ(i, c.getX(i) * shade, c.getY(i) * shade, c.getZ(i) * shade);
      }
    }
    g.rotateY(I.rot); g.translate(I.x, 0, I.z); target.push(g);
  };
  // 比叡山は天井板・格縁・柱も共通の箱から寸法を取ってまとめる。
  const floorBoardShape = new THREE.BoxGeometry(1, 1, 1);
  const box = (lx, y, lz, w, h, d, hex, emit, grainAxis = null) => {
    let g = floorBoardShape ? floorBoardShape.clone().scale(w, h, d) : new THREE.BoxGeometry(w, h, d);
    if (nodaJoinery && !emit && (hex === DARK || hex === WOOD || hex === 0x2e2216)) {
      // 柱・梁・長押も無地の角材にせず、材の長手へ木肌を通す推定復元。
      // 根太も天井板と同じ絵・描画の束を共用し、元の煤けた色を残す。
      // 短く欠いた掛かりは外寸の長辺で向きを決めず、元の材の繊維を続ける。
      g = g.toNonIndexed();
      const pos = g.attributes.position, uv = g.attributes.uv;
      const axis = grainAxis ?? (h >= w && h >= d ? 1 : w >= d ? 0 : 2);
      for (let j = 0; j < pos.count; j++) {
        const x = pos.getX(j) + lx, yy = pos.getY(j) + y, z = pos.getZ(j) + lz;
        const face = Math.floor(j / 6), normal = Math.floor(face / 2);
        // 木口は断面、側面は長手を使う。側面へ厚み方向の木目を引き伸ばさない。
        const along = axis === 0 ? x : axis === 1 ? yy : z;
        const across = normal === 0 ? (axis === 2 ? yy : z)
          : normal === 1 ? (axis === 0 ? z : x) : (axis === 0 ? yy : x);
        uv.setXY(j, across / .3, (normal === axis ? (axis === 1 ? z : yy) : along) / 1.8);
      }
      g.userData.ceilingWood = true;
    }
    const red = hex >> 16 & 255, green = hex >> 8 & 255, blue = hex & 255;
    if ((I.profile === 'hieizan' || fineIwamura && Math.min(w, h, d) >= .025 && Math.max(w, h, d) >= .24) && !emit && red > green * 1.18 && green > blue * 1.15) {
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
    } else put(g, lx, y, lz, hex, emit);

  };
  const mainCeilingBoard = (lx, y, lz, w, h, d, hex, alongX = false) => {
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
  const houseTimber = (x, y, z, w, h, d, color, axis, slope = 0, yaw = 0) => {
    if (I.profile === 'iga') igaBoards.push([x, y, z, w, h, d, color, axis, slope, yaw]);
    else box(x, y, z, w, h, d, color);
  };
  const grp = new THREE.Group(), ceilingBoards = new THREE.Group(), lampParts = new THREE.Group();
  // 設楽原の戸口枠・窓の見込み板・天井の縁も、動く建具と同じ木目を長手へ通す。
  // 天井板の束へまとめ、寸法別の原形と材質を共用する。近づいた時に一度だけ作る。
  const entryTimber = (x, y, z, w, h, d, color) =>
    timberBox(ceilingBoards, w, h, d, x, y, z, color);
  const Ls = I.levels, ds = I.door.side, boardFloors = [];
  const toride = I.profile === 'toride';
  // 天井板の長手へ木目を通す。切った板も局所座標から続け、全棟で同じ絵を使う。
  // 既存の板を置き換えるだけにし、形の枚数や毎コマの仕事は増やさない。
  const ceilingBoard = (left, right, back, front, yy, alongZ, hex) => {
    const g = new THREE.BoxGeometry(right - left, .012, front - back).toNonIndexed();
    g.translate((left + right) / 2, yy, (back + front) / 2);
    const pos = g.attributes.position, uv = g.attributes.uv;
    for (let j = 0; j < pos.count; j++) uv.setXY(j,
      (alongZ ? pos.getX(j) : pos.getZ(j)) / .3,
      (alongZ ? pos.getZ(j) : pos.getX(j)) / 1.8);
    colorize(g, hex); g.userData.ceilingWood = true;
    return g;
  };
  const kuriCeiling = S.quality === 'high' && I.profile === 'nodafukushima' && I.kind === 'kuri';
  const nodaJoinery = S.quality === 'high' && I.profile === 'nodafukushima';
  const soboCeiling = nodaJoinery && I.kind === 'sobo';
  const fortCeiling = nodaJoinery && I.kind === 'goten';
  const utilityCeiling = nodaJoinery && ['nagaya', 'bansho', 'kura', 'minka'].includes(I.kind);
  const nodaHall = nodaJoinery && ['hondo', 'chudo'].includes(I.kind);
  const nodaBoards = S.quality === 'high' && I.profile === 'nodafukushima'
    && ['goten', 'nagaya', 'bansho', 'kura', 'minka'].includes(I.kind);
  const goten = !['tenshu', 'yagura', 'gate'].includes(I.kind);
  const honnojiUtility = ['honnoji_kuri', 'honnoji_kura', 'honnoji_umagura', 'honnoji_umaya', 'honnoji_naya', 'honnoji_kyozo'].includes(I.profile);
  const honnojiWaist = ['honnoji_sobo', 'honnoji_hojo', 'honnoji_kyakuden', 'honnoji_kodo', 'honnoji_soshido'].includes(I.profile);
  // 伊賀の灯明は角材の塊でなく、浅い土器の油皿へ灯芯を渡す推定復元。
  // 皿・口縁・油面の原形は建物内で共有し、設営時だけ既存の束へ焼き込む。
  const igaOilDish = I.profile === 'iga' ? new THREE.CylinderGeometry(.09, .06, .03, 12) : null;
  const igaOilRim = I.profile === 'iga' ? new THREE.TorusGeometry(.081, .009, 6, 12) : null;
  const igaOilSurface = I.profile === 'iga' ? new THREE.CylinderGeometry(.071, .071, .003, 12) : null;
  if (igaOilRim) igaOilRim.rotateX(Math.PI / 2);
  // 館の釘隠しは厚い四角の塊にせず、薄い八角の鉄座と中央の鋲で推定復元。
  // 原形は館内で共用し、外周の長押と同じ静止した束へ焼き込む。
  const igaNailPlate = I.profile === 'iga' && I.kind === 'yashiki'
    ? new THREE.CylinderGeometry(.034, .034, .003, 8) : null;
  const igaNailHead = igaNailPlate ? new THREE.CylinderGeometry(.004, .01, .006, 8) : null;
  const nailCover = (x, y, z, face, side) => {
    const plate = igaNailPlate.clone(), head = igaNailHead.clone();
    // 円柱の上面を室内へ向け、鉄座の裏を長押の表へ密着させる。
    if (face === 'z') {
      plate.rotateX(-side * Math.PI / 2); head.rotateX(-side * Math.PI / 2);
      put(plate, x, y, z + side * .0055, 0x302b26);
      put(head, x, y, z + side * .001, 0x484039);
    } else {
      plate.rotateZ(side * Math.PI / 2); head.rotateZ(side * Math.PI / 2);
      put(plate, x + side * .0055, y, z, 0x302b26);
      put(head, x + side * .001, y, z, 0x484039);
    }
  };
  // 炉を焚く伊賀の民家は天井を張らず、小屋裏へ煙が抜ける梁の見える造りにする。
  const igaHearth = I.profile === 'iga' && I.kind === 'minka';
  // 室内図のない陣小屋・番所は、民家と同じ茅屋根の小屋組を見せる推定復元。
  // 仮の兵舎まで細かな天井板と根太で二重に塞がず、館の竿縁天井とは作りを分ける。
  const igaOpenRoof = I.profile === 'iga' && ['minka', 'nagaya', 'bansho'].includes(I.kind);
  const paperWindows = I.templePaper || I.profile === 'moribe';
  // 稲葉山の用屋と小祠は板張りと貫で納め、座敷の白壁・長押を使わない。
  const boardInterior = I.profile === 'iwamura_' + I.kind && ['kura', 'bansho', 'nagaya'].includes(I.kind);
  // 八幡の社は、神座・板戸と外周の内壁も板張りでそろえる推定復元。
  // 用屋の床組とは分け、既存の壁片・窓の穴・木材の束を使う。
  const boardWalls = boardInterior || fineIwamura && I.profile === 'iwamura_shrine' && I.kind === 'shrine';
  // 八幡社の戸口上も、神座の板間・板戸と同じ板張りで納める推定復元。
  const boardedEntry = boardInterior || (fineIwamura && I.profile === 'iwamura_shrine' && I.kind === 'shrine');
  const inabaBoards = S.quality === 'high' && I.profile === 'inabayama' && ['kura', 'bansho', 'nagaya', 'shrine'].includes(I.kind);
  const plainCeiling = I.profile === 'inabayama' && ['kura', 'bansho', 'nagaya'].includes(I.kind)
    // 小祠は座敷の竿縁天井にせず、梁と桁を見せる推定の納まり。
    || S.quality === 'high' && I.profile === 'inabayama' && I.kind === 'shrine'
    || I.profile === 'shitaragahara' && I.kind === 'minka'
    || I.profile === 'iga' && I.kind === 'minka'
    || I.profile === 'nodafukushima' && ['kuri', 'minka'].includes(I.kind)
    || I.profile === 'echizen_ikko' && I.kind === 'bansho'
    || ['nodafukushima', 'usayama', 'iga', 'takato', 'miki', 'tottori', 'arioka'].includes(I.profile) && ['kura', 'bansho', 'nagaya'].includes(I.kind)
    || I.profile === 'iwamura_' + I.kind && ['kura', 'bansho', 'nagaya'].includes(I.kind)
    || honnojiUtility || fineIwamura && I.kind === 'shrine' || I.profile === 'nagashima' && ['kura', 'nagaya'].includes(I.kind);
  const coffered = ['hondo', 'chudo'].includes(I.kind) || I.profile === 'arioka' && I.kind === 'temple';
  const exposedIwamura = fineIwamura && plainCeiling;
  const WOOD = 0x6a5038, DARK = 0x3a2a1c, WALL = toride ? 0x726552 : I.sgOverhead ? 0x817967 : boardWalls ? 0x716654 : goten ? 0xb8ab90 : 0xa89a80, FLOOR = 0x8a6a48, BOARD = I.sgOverhead ? 0x514b3d : 0x6a5238;
  for (let k = 0; k < Ls.length; k++) {
    const lv = Ls[k], hw = lv.w / 2, hd = lv.d / 2, h = lv.h, y = lv.y;
    const inabaBeamFrame = inabaBoards && plainCeiling;
    const beamBays = Math.max(2, Math.round(lv.w / 1.9));
    const crosswiseBeams = exposedIwamura && lv.d > lv.w;
    const beamRun = crosswiseBeams ? lv.d : lv.w;
    const beamH = fineIwamura && boardInterior ? Math.min(.24, h - interiorPanelHeight(lv.layout, h) - .12) : .24;
    const beamStep = exposedIwamura ? beamRun / Math.max(2, Math.round(beamRun / 1.9)) : inabaBeamFrame ? lv.w / beamBays : 1.7;
    const showBeams = !(I.profile === 'shitaragahara' && I.kind === 'minka') && (!goten || I.open || plainCeiling
      || I.profile === 'anegawa' && I.kind === 'nagaya'
      || I.profile === 'kanegasaki' && ['bansho', 'kura', 'nagaya'].includes(I.kind));
    // 堂の内陣だけ、柱頭で天井を受ける簡素な斗・肘木を組む推定復元。
    // 個々の堂の意匠は不明なので、外陣や住宅に装飾を広げない。
    const sanctuary = fineIwamura && I.profile === 'iwamura_hondo'
      ? lv.layout.rooms.find(room => room.name === '内陣') : null;
    // 岩村の灯明は下の配置へ一本化する。固定位置にも重ねると、
    // 狭い外陣では入口の格子戸の引込み先に台が残る。
    // 共通の開閉が持つ戸の全移動範囲と、調度・間仕切りを避けた台だけを置く。
    const nodaHearth = nodaJoinery && ['minka', 'kuri'].includes(I.kind)
      ? lv.layout.props.find(p => p.part === (I.kind === 'kuri' ? 'stove' : 'nodaHearth')) : null;
    // 壁際の炉でも煙抜きの受け材を柱へ突き込まない。
    // 壁の柱の室内端（二十三センチ）と十七センチの受け材の間に三センチ残す。
    // 天井板・根太・梁もこの開口を共用し、絵だけ穴をずらさない。
    const smokeInset = .23 + .17 + .03;
    const smokeHole = nodaHearth ? { x0: Math.max(-hw + smokeInset, nodaHearth.x - .65), x1: Math.min(hw - smokeInset, nodaHearth.x + .65),
      z0: Math.max(-hd + smokeInset, nodaHearth.z - .6), z1: Math.min(hd - smokeInset, nodaHearth.z + .6) } : null;
    // 炉・竈の煙は天井板だけでなく、口を受ける横枠・根太・梁にも当たる。
    // 板より下の木組みだけを既存の頂点色で煤けさせる。生成時の光の焼き込みにまとめる。
    if (!I.open && smokeHole) smokeStains.push({ ...smokeHole, top: y + h - .018, bottom: y + h - .55 });
    const upSt = I.stairs[k];   // 上の階段の穴。天井の穴（ceilingHole）より先に決める（墨俣で宣言の前に読んで落ちていた）
    const ceilingHole = upSt ? upSt.hole : smokeHole;
    // 煙抜きの幅だけ木を切り、口の両脇には根太・梁を残す。
    // 太さも含めて避けるので、梁の端が開口へ突き出さない。
    const smokeSpans = (lo, hi, across, alongX, halfWidth) => {
      if (!smokeHole) return [[lo, hi]];
      const a0 = (alongX ? smokeHole.z0 : smokeHole.x0) - .17;
      const a1 = (alongX ? smokeHole.z1 : smokeHole.x1) + .17;
      if (across + halfWidth <= a0 || across - halfWidth >= a1) return [[lo, hi]];
      // 開口の外側に付く十七センチの受け材の外面で木口を止める。
      // 開口の縁まで伸ばすと、切った梁・根太が受け材を貫通する。
      const b0 = (alongX ? smokeHole.x0 : smokeHole.z0) - .17;
      const b1 = (alongX ? smokeHole.x1 : smokeHole.z1) + .17;
      return [[lo, Math.min(hi, b0)], [Math.max(lo, b1), hi]].filter(v => v[1] - v[0] > .02);
    };
    // 土間の竈も煙の出る火元。竈の上面から立ち上る範囲を梁と板壁へ焼く。
    soot = igaHearth ? lv.layout.props.filter(p => p.part === 'hearth' || p.part === 'stove')
      .map(p => ({ x: p.x, z: p.z, y: y + (p.y || 0) + (p.part === 'stove' ? p.h : 0) })) : null;
    // 座敷の長押は回縁の下へ二センチ空け、間仕切り（interior_parts.js）と揃える。
    const lowNageshi = S.quality === 'high' && I.profile === 'inabayama' && ['goten', 'tamari'].includes(I.kind);
    const nageshiH = lowNageshi ? .08 : .12, nageshiOffset = lowNageshi ? .14 : .1;
    const templeCeiling = !I.open && !I.stairs[k] && ['honnoji_kodo', 'honnoji_soshido'].includes(I.profile);
    const roomCeiling = !I.stairs[k] && ['honnoji_sobo', 'honnoji_hojo', 'honnoji_kyakuden', 'honnoji_nijo'].includes(I.profile);
    // 外周の内壁も柱頭と同じ高さで止め、回縁・桁の下面へ納める。
    // 天井まで張ると座敷の塗り壁や蔵の縦板が横木へ食い込む（納まりは推定）。
    // 窓と戸口は既存の分割を使い、設営時の形だけを短くする。
    const perimeterTop = (honnojiUtility && !I.stairs[k]) || templeCeiling ? h - .18 : roomCeiling ? h - .08 : h;
    // 本能寺の柱脚・幅木は床組へ埋めず、接する室の高い仕上げ面から立てる。
    const floorFinish = (x, z) => {
      let foot = 0;
      if (I.profile?.startsWith('honnoji_')) for (const r of lv.layout.rooms)
        if (x >= r.x0 - .01 && x <= r.x1 + .01 && z >= r.z0 - .01 && z <= r.z1 + .01)
          foot = Math.max(foot, (r.y || 0) + (r.floor === 'tatami' ? .066 : r.floor === 'earth' ? .0255 : 0));
      return foot;
    };
    // 方丈・客殿の床の間には独立した背板と側壁がある。
    // 座敷の腰板・長押・幅木をその中へ通さず、畳・天井と同じ外形で止める。
    // 設営時だけ切り分け、既存の材質別のまとまりへ収める（納まりは推定）。
    const alcoveTrim = ['honnoji_hojo', 'honnoji_kyakuden'].includes(I.profile);
    const wallTrimBox = (cx, yy, cz, w, bh, d, color) => {
      if (!alcoveTrim) { box(cx, yy, cz, w, bh, d, color); return; }
      for (const [x0, x1, z0, z1] of honnojiCeilingPieces(lv.layout,
        cx - w / 2, cx + w / 2, cz - d / 2, cz + d / 2))
        box((x0 + x1) / 2, yy, (z0 + z1) / 2, x1 - x0, bh, z1 - z0, color);
    };
    // 本能寺の灯明は下で調度・引き戸を避けて据え、同じ位置から明かりを焼く。
    // 板縁の既定位置にも作ると、狭い棟で障子や配膳棚へ重なる。
    const decor = furnishLayout(lv.layout, h, { partitions: true, dim: true, lamps: !fineIwamura && !I.profile?.startsWith('honnoji_') });
    decor.position.set(I.x, y, I.z); decor.rotation.y = I.rot; grp.add(decor);
    // 岩村の引分け戸は、引込み先を敷居から鴨居まで通した戸当たりで受ける推定復元。
    // 上下の小片だけで戸を止めず、縦框を全高で受ける。二筋とも同じ縦材の内へ納める。
    // 開いた戸の端から外へ納め、戸板・引手や通れる口を狭めない。
    // 戸の幅と二筋の溝を共用し、入口・襖・障子・内陣の格子戸をそろえる。
    // 窓の引違いは動き方が違うため含めない。既存の木材の束へ結合する。
    if (fineIwamura && I.doors) for (const door of I.doors) {
      if (door.lv !== lv || door.window) continue;
      const bottom = door.y, head = bottom + door.h;
      for (const side of [-1, 1]) {
        const end = door.lx + side * nakaDoorStopOffset(door);
        box(end, (bottom + head) / 2, door.lz, .05, head - bottom,
          door.track * 2 + .08, DARK);
      }
    }
    // 岩村の入口の板戸も、開いた先まで二筋の敷居と鴨居で受ける推定復元。
    if (fineIwamura && k === 0 && I.doors) for (const door of I.doors) if (door.entry) {
      // 召し合わせと引き残しを含む戸当たりの外面まで横木を通す。
      // 戸口幅の二倍では、端の縦材だけが敷居・鴨居からはみ出す。
      const railW = 2 * (nakaDoorStopOffset(door) + .025), head = door.h + (door.sill || 0);
      // 用屋の土間では、内へ引いた戸柱も礎石で受ける推定復元。
      // 柱と同じ幅・奥行きに納め、左右の戸の溝と通れる口を狭めない。
      const entryFoot = boardInterior && interiorFloorAt(lv.layout, door.lx, door.lz) === 'earth' ? .08 : 0;
      // 溝は角材の上へ樋端を足さず、材の内へ八ミリ掘る。
      // 敷居上端四センチと鴨居下端を保ち、戸板を二筋へ差し込む。
      // 室内の間仕切りと同じ六・四センチの内法で、引込み先まで通す。
      box(door.lx, y + .016, door.lz, railW, .032, .34, DARK);
      box(door.lx, y + head + .054, door.lz, railW, .092, .34, DARK);
      for (const [a, b] of [[-.17, -door.track - .032],
        [-door.track + .032, door.track - .032], [door.track + .032, .17]]) {
        box(door.lx, y + .036, door.lz + (a + b) / 2, railW, .008, b - a, DARK);
        box(door.lx, y + head + .004, door.lz + (a + b) / 2, railW, .008, b - a, DARK);
      }
      for (const side of [-1, 1]) {
        box(door.lx, y + .0325, door.lz + side * door.track, railW, .001, .064, 0x1e160f);
        box(door.lx, y + head + .0075, door.lz + side * door.track, railW, .001, .064, 0x1e160f);
      }
      // 岩村の戸口は、内へ引いた戸柱を天井まで通す推定復元。
      // 鴨居の高さで柱を切らず、上の小壁を左右の柱と天井で受ける。
      // 引込み先の溝と戸板の通りは空け、既存の室内の束へまとめる。
      const upperH = h - head - .1;
      // 入口の上も室内の用途に合わせる推定復元。外壁の穴は広げず、
      // 内へ引いた戸柱の間だけに欄間・縦板を納め、戸の溝より上で組む。
      const transom = ['goten', 'yashiki', 'hondo'].includes(I.kind);
      const low = Math.min(interiorPanelHeight(lv.layout, h) + .42, h - .06) + .06;
      const high = h - .08;
      if (transom && high - low >= .15 && low > head + .1) {
        box(door.lx, y + (head + .1 + low) / 2, door.lz,
          door.W, low - head - .1, .06, WALL);
        box(door.lx, y + (high + h) / 2, door.lz, door.W, h - high, .08, DARK);
        // 入口の欄間も四周の枠で受ける推定復元。桟を小壁へ直接立てず、
        // 室内の欄間と同じ四センチの下枠へ納める。戸の鴨居と溝は変えない。
        const frame = .04, innerW = door.W - frame * 2;
        const innerLow = low + frame, innerH = high - innerLow;
        const centerY = (innerLow + high) / 2;
        box(door.lx, y + low + frame / 2, door.lz, innerW, frame, .08, DARK);
        for (const side of [-1, 1]) {
          box(door.lx + side * (door.W - frame) / 2, y + (low + high) / 2,
            door.lz, frame, high - low, .08, DARK);
        }
        const count = Math.max(1, Math.round(innerW / .18));
        for (let j = 1; j < count; j++) {
          box(door.lx - innerW / 2 + j * innerW / count, y + centerY,
            door.lz, .025, innerH, .035, WOOD);
        }
        // 堂の横貫は縦桟の側面で継ぎ、内陣境の欄間と同じ納まりにする。
        // 同じ面を交点へ重ねず、見上げた時のちらつきも防ぐ。
        // 既存の木材の束へ設営時だけ結合し、戸の内法は変えない。
        if (I.kind === 'hondo') for (let j = 0; j < count; j++) {
          const a = door.lx - innerW / 2 + j * innerW / count + (j ? .0125 : 0);
          const b = door.lx - innerW / 2 + (j + 1) * innerW / count - (j < count - 1 ? .0125 : 0);
          box((a + b) / 2, y + centerY, door.lz, b - a, .025, .035, WOOD);
        }
      } else if (upperH > .02) {
        // 岩村の用屋・社の入口上も、間仕切りと同じ縦板で閉じる推定復元。
        // 黒い凸棒を板目の代わりに貼らず、板端の隙間を奥の実で塞ぐ。
        // 元の壁厚の内へ納め、戸の鴨居・長押・通れる口は動かさない。
        if (boardedEntry) {
          const count = Math.max(1, Math.ceil(door.W / .24));
          const width = door.W / count, yy = y + head + .1 + upperH / 2;
          box(door.lx, yy, door.lz, door.W, upperH, .012, DARK);
          for (let j = 0; j < count; j++) {
            box(door.lx - door.W / 2 + (j + .5) * width, yy, door.lz,
              width - .002, upperH, .06,
              j % 3 === 0 ? BOARD : j % 3 === 1 ? 0x71583e : 0x80694c);
          }
          // 入口上の縦板も、室内の間仕切りと同じ横桟で押さえる推定復元。
          // 長押の上下に納め、板の目地だけが天井へ伸びる作りにしない。
          // 戸の鴨居より上だけを使い、既存の木材の束へ結合する。
          const nageshi = Math.min(interiorPanelHeight(lv.layout, h) + .42, h - .06);
          for (const [a, b] of [[head + .1, nageshi - .06], [nageshi + .06, h]]) {
            if (b - a < .1) continue;
            const yy = y + (a + b) / 2;
            for (const face of [-1, 1]) {
              box(door.lx, yy, door.lz + face * .0425,
                door.W - .02, .05, .025, 0x59412b);
              for (let j = 0; j < count; j++) {
                box(door.lx - door.W / 2 + (j + .5) * door.W / count,
                  yy, door.lz + face * .056, .012, .012, .002, 0x292723);
              }
            }
          }
        } else box(door.lx, y + head + .1 + upperH / 2, door.lz,
          door.W, upperH, .06, WALL);
      }
      for (const side of [-1, 1]) {
        const postX = door.lx + side * (door.W / 2 + .06);
        const endX = door.lx + side * (railW / 2 - .06);
        for (const x of [postX, endX]) {
          if (entryFoot) box(x, y + entryFoot / 2, door.lz, .12, entryFoot, .14, 0x777369);
          box(x, y + (h + entryFoot) / 2, door.lz, .12, h - entryFoot, .14, DARK);
          // 内へ引いた戸柱も鴨居を枘差し・込栓で受ける推定復元。
          // 栓は柱幅の内、鴨居の両面へ納めて建具を妨げない。
          // 木口だけを既存の木材の束へ結合し、描画の回数は増やさない。
          for (const face of [-1, 1]) {
            box(x, y + head + .05, door.lz + face * .172,
              .026, .032, .004, WOOD);
          }
        }
        // 引込み先の鴨居も端柱で受ける推定復元。戸は柱の前後の溝を通る。
        // 外側の木口を敷居・鴨居の端にそろえ、中央の戸口は狭めない。
      }
      // 内へ引いた主殿・侍屋敷・堂の戸柱も、室内と同じ高さの長押でつなぐ推定復元。
      // 堂も入口だけ鴨居と小壁で終わらせず、外陣の柱と同じ内法長押を回す。
      if (['goten', 'yashiki', 'hondo'].includes(I.kind)) {
        const nageshiY = Math.min(interiorPanelHeight(lv.layout, h) + .42, h - .06);
        if (nageshiY - .06 > head + .1) {
          box(door.lx, y + nageshiY, door.lz, railW, .12, .14, DARK);
          // 堂の入口も内陣境と同じ無紋の釘隠しで留める推定復元。
          // 戸柱の上だけに納め、格子戸の引込み先には張り出さない。
          for (const side of [-1, 1]) for (const face of [-1, 1]) {
            const postX = door.lx + side * (door.W / 2 + .06);
            box(postX, y + nageshiY, door.lz + face * .075, .07, .07, .01, 0x292723);
            box(postX, y + nageshiY, door.lz + face * .083, .018, .018, .008, 0x494338);
          }
          // 主殿・侍屋敷も、内へ引いた戸柱から外壁側の長押へつなぐ推定復元。
          // 堂だけにつなぐと住宅の入口は長押の木口が宙で途切れる。
          // 格子戸・板戸と二筋の溝より上に納め、既存の木材の束へまとめる。
          const wallZ = ds * (hd - .16), depth = Math.abs(wallZ - door.lz);
          if (depth > .14) for (const side of [-1, 1]) {
            box(door.lx + side * (door.W / 2 + .06), y + nageshiY, (wallZ + door.lz) / 2,
              .14, .12, depth, DARK);
          }
        }
      }
      // 内へ引いた戸枠と外壁の戸口を見込み板でつなぐ推定復元。
      // 二筋の溝より外から壁の内面までを塞ぎ、開いた戸の脇に床下や壁の裏を見せない。
      // 左右は内法の外へ納め、通れる幅と戸が滑る範囲を保つ。
      const frameEdge = door.lz + ds * .17, wallEdge = ds * (hd - .1);
      const depth = Math.abs(wallEdge - frameEdge), revealZ = (frameEdge + wallEdge) / 2;
      if (depth > .001) {
        // 見込みは無地の一体箱にせず、縦の脇板と横の天板・敷板で納める推定復元。
        // 暗い裏板で目地を塞ぎ、仕上げ面は従来と同じ内法・高さにそろえる。
        // 箱の原形と材質を共有し、近づいて室内を作る時だけ既存の束へ結合する。
        iwamuraBeamGrainShape ??= new THREE.BoxGeometry(1, 1, 1);
        const revealBoard = (x, yy, z, w, h, d, color) =>
          put(iwamuraBeamGrainShape.clone().scale(w, h, d), x, yy, z, color);
        revealBoard(door.lx, y + .015, revealZ, door.W + .24, .03, depth, DARK);
        revealBoard(door.lx, y + head + .055, revealZ, door.W + .24, .09, depth, DARK);
        for (const side of [-1, 1]) {
          revealBoard(door.lx + side * (door.W / 2 + .065), y + head / 2, revealZ,
            .11, head, depth, DARK);
        }
        const count = Math.max(1, Math.ceil(depth / .18)), pitch = depth / count;
        for (let j = 0; j < count; j++) {
          const z = revealZ - depth / 2 + (j + .5) * pitch;
          const width = pitch - Math.min(.001, pitch * .1);
          const shade = j % 2 ? WOOD : BOARD;
          revealBoard(door.lx, y + .035, z, door.W + .24, .01, width, shade);
          revealBoard(door.lx, y + head + .005, z, door.W + .24, .01, width, shade);
          for (const side of [-1, 1]) {
            revealBoard(door.lx + side * (door.W / 2 + .005), y + head / 2, z,
              .01, head, width, shade);
            // 脇板は縦目、敷板と天板は横目。木口と目地の手前で止める。
            revealBoard(door.lx + side * (door.W / 2 - .0005), y + head / 2, z,
              .001, head - .12, .002, DARK);
            for (const top of [false, true]) revealBoard(door.lx,
              y + (top ? head - .0005 : .0405), z + side * width * .2,
              door.W + .12, .001, .002, DARK);
          }
        }
      }
    }
    // 玄関の板戸も二本の溝を持つ敷居・鴨居で受ける。開いた戸は壁の前へ滑る。
    if (lv.entryFrame) {
      const { z, span, h: dh, postH, sill } = lv.entryFrame;
      // 動く戸と同じ高さの敷居を使う。御影堂の畳の上でも溝を埋めない。
      // 戸の中心は受け材の中心から前後五センチ。幅七センチの溝を上下に刻む。
      box(I.door.lx, y + sill / 2, z, span, sill, .4, DARK);
      box(I.door.lx, y + dh + .056, z, span, .088, .4, DARK);
      for (const [a, b] of [[-.2, -.085], [-.015, .015], [.085, .2]]) {
        box(I.door.lx, y + sill + .006, z + (a + b) / 2, span, .012, b - a, DARK);
        box(I.door.lx, y + dh + .006, z + (a + b) / 2, span, .012, b - a, DARK);
      }
      // 玄関の竪枠は鴨居で途切れさせず、柱として天井まで通す。
      // 戸の引き込み先の外で木組みを受け、当たりも同じ高さへ揃える。
      for (const side of [-1, 1]) {
        const x = I.door.lx + side * (span / 2 + .04);
        box(x, y + (sill + postH) / 2, z, .08, postH - sill, .4, DARK);
        // 玄関も間仕切りと同じ差し鴨居の推定復元。横木を柱の内面へ
        // 突き付けるだけにせず、溝より上のほぞを柱へ差して込栓で留める。
        // 戸の二本の溝と開口は保ち、栓の木口だけを柱の両面へ見せる。
        box(x - side * .02, y + dh + .056, z, .04, .05, .12, DARK);
        for (const face of [-1, 1]) box(x, y + dh + .056,
          z + face * .204, .025, .035, .008, WOOD);
      }
    }
    if (lv.hallX != null) box(lv.hallX, y + h / 2, 0, 0.08, h, lv.d - 3.6, WALL);
    if (lv.drop) {
      const v = lv.drop, cx = (v.x0 + v.x1) / 2;
      // 穴の底には板を置かない。下の敵と地面が見える。
      box(v.x1 + .1, y + .7, 0, .08, .1, 1.1, DARK);
      for (const z of [-.55, .55]) box(v.x1 + .1, y + .35, z, .08, .7, .08, DARK);
    }
    const boardFloor = I.profile?.startsWith('honnoji_') && I.profile !== 'honnoji_nijo';
    const smoke = I.profile === 'honnoji_kuri' && !upSt
      ? { x0: -hw + .65, x1: -hw + 2.55, z0: -hd + .5, z1: -hd + 1.4 } : null;
    const ceilingBox = (cx, yy, cz, w, bh, d, color, frameClear = 0) => {
      if (!smoke) { box(cx, yy, cz, w, bh, d, color); return; }
      const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
      const a = Math.max(x0, smoke.x0 - frameClear), b = Math.min(x1, smoke.x1 + frameClear);
      const c = Math.max(z0, smoke.z0 - frameClear), e = Math.min(z1, smoke.z1 + frameClear);
      if (a >= b || c >= e) { box(cx, yy, cz, w, bh, d, color); return; }
      for (const [l, r, n, f] of [[x0, a, z0, z1], [b, x1, z0, z1], [a, b, z0, c], [a, b, e, z1]])
        if (r > l && f > n) box((l + r) / 2, yy, (n + f) / 2, r - l, bh, f - n, color);
    };
    const villageHome = S.quality === 'high' && I.profile === 'shitaragahara' && I.kind === 'minka';
    const villageHall = S.quality === 'high' && I.profile === 'shitaragahara' && I.kind === 'hondo';
    const earth = villageHome ? lv.layout.rooms.find(r => r.floor === 'earth') : null;
    const woodPieces = earth ? lv.pieces.filter(v => v[3] <= earth.z0 || v[2] >= earth.z1) : lv.pieces;
    const hearth = villageHome ? lv.layout.props.find(p => p.part === 'hearth') : null;
    const parlor = villageHome ? lv.layout.rooms.find(r => r.floor === 'tatami') : null;
    smokeSources.length = 0;
    if (villageHome) for (const source of lv.layout.props) {
      if (!['hearth', 'stove'].includes(source.part)) continue;
      const room = lv.layout.rooms.find(r => source.z >= r.z0 && source.z <= r.z1);
      if (!room || !['boards', 'earth'].includes(room.floor)) continue;
      // 竈は背面の煙抜きから上がる。裏向きの民家も調度と同じ向きで位置を決める。
      const offset = source.part === 'stove' ? -.3 * source.d / .7 : 0;
      smokeSources.push({ x: source.x + Math.sin(source.rot || 0) * offset,
        z: source.z + Math.cos(source.rot || 0) * offset, y: y + (source.y || 0),
        z0: room.z0, z1: room.z1, spread: source.part === 'stove' ? .6 : 1.1,
        fadeBack: room.z0 > -hd + .01, fadeFront: room.z1 < hd - .01 });
    }
    // 囲炉裏は板床へ切り込む。歩行用の床は保ち、見た目の床板と目地だけ炉の内側で抜く。
    const rawFloorPieces = hearth ? woodPieces.flatMap(([x0, x1, z0, z1]) => {
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      return rectMinus((x1 - x0) / 2, (z1 - z0) / 2, {
        x0: hearth.x - (hearth.w - .18) / 2 - cx, x1: hearth.x + (hearth.w - .18) / 2 - cx,
        z0: hearth.z - (hearth.d - .18) / 2 - cz, z1: hearth.z + (hearth.d - .18) / 2 - cz,
      }).map(([a, b, c, d]) => [a + cx, b + cx, c + cz, d + cz]);
    }) : woodPieces;
    const floorPieces = S.quality === 'high' && I.profile === 'inabayama'
      ? rawFloorPieces.flatMap(([a, b, c, d]) => lv.layout.rooms.map(r => [
        Math.max(a, r.x0), Math.min(b, r.x1), Math.max(c, r.z0), Math.min(d, r.z1),
        r.floor === 'tatami' && !(r.y > 0) ? -.06 : 0,
      ]).filter(v => v[1] > v[0] && v[3] > v[2])) : rawFloorPieces;
    if (earth) {
      // 上がり框は障子の敷居の下へ納める。戸が滑る面と徒歩の通り道は塞がない。
      // 両端は側壁の内面で止め、土間まで下りる側柱を切り欠く。
      // 無地の全幅の箱では柱脚・板壁へ木口が突き抜けるため、
      // 見える框だけを長手の木目で組み、既存の静止した木材の束へ納める。
      const edge = ds > 0 ? earth.z0 : earth.z1, centerZ = edge + ds * .16;
      let pieces = [[-hw + .13, hw - .13, centerZ - .16, centerZ + .16]];
      const span = lv.d + .18, bays = Math.max(2, Math.round(span / 1.8));
      for (let q = 1; q < bays; q++) {
        const z = -span / 2 + q * span / bays;
        if (z < earth.z0 || z > earth.z1) continue;
        for (const side of [-1, 1]) {
          const x = side * (hw - .16);
          pieces = pieces.flatMap(([x0, x1, z0, z1]) => {
            const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
            return rectMinus((x1 - x0) / 2, (z1 - z0) / 2,
              { x0: x - .07 - cx, x1: x + .07 - cx, z0: z - .08 - cz, z1: z + .08 - cz })
              .map(([a, b, c, d]) => [a + cx, b + cx, c + cz, d + cz]);
          });
        }
      }
      for (const [x0, x1, z0, z1] of pieces)
        entryTimber((x0 + x1) / 2, y + earth.y / 2, (z0 + z1) / 2,
          x1 - x0, -earth.y, z1 - z0, DARK);
    }
    if (villageHome) {
      // 板床と座敷の下地を根太・大引で受ける推定復元。土間へ床組を延ばさない。
      // 炉は炉縁の外まで空け、炉の底へ木を通さない。
      // 根太・大引・床束にも材の長手へ木目を通す。無地の塊にせず、柱・建具の原形と材質を共用する。
      const beam = (x, yy, z, w, h, d) => entryTimber(x, yy, z, w, h, d, DARK);
      const post = (x, z) => {
        // 床束は土へ直接差さず、根石で受ける推定復元。
        // 石の四隅の地面を測り、斜面でも下端を地中へ納める。
        // 床下の低い所は石を低くし、大引や床板へ突き出させない。
        let low = Infinity, high = -Infinity;
        for (const dx of [-.12, .12]) for (const dz of [-.12, .12]) {
          const [wx, wz] = I.P(x + dx, z + dz), ground = rt.world.heightAt(wx, wz);
          low = Math.min(low, ground); high = Math.max(high, ground);
        }
        const joinY = y - .22;
        if (high >= joinY) return;
        const top = Math.min(high + .08, joinY), bottom = low - .04;
        box(x, (top + bottom) / 2, z, .24, top - bottom, .24, 0x777063);
        if (top < joinY) beam(x, (top + joinY) / 2, z, .1, joinY - top, .1);
      };
      const underfloor = hearth ? woodPieces.flatMap(([x0, x1, z0, z1]) => {
        const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
        return rectMinus((x1 - x0) / 2, (z1 - z0) / 2, {
          x0: hearth.x - hearth.w / 2 - .06 - cx, x1: hearth.x + hearth.w / 2 + .06 - cx,
          z0: hearth.z - hearth.d / 2 - .06 - cz, z1: hearth.z + hearth.d / 2 + .06 - cz,
        }).map(([a, b, c, d]) => [a + cx, b + cx, c + cz, d + cz]);
      }) : woodPieces;
      // 根太の上端は床の裏板の下面へ、大引の上端は根太の下面へ合わせる。
      // 材の幅も含めて床片へ切り詰め、炉際と土間際へ木口を突き出させない。
      // 床板と同じ奥壁を基準に四十五センチ間隔で割る。
      // 全奥行きの等分では、一・八メートルと半間ずらしの板の継ぎ目が根太から外れる。
      const rows = Math.max(1, Math.ceil(lv.d / .45));
      const columns = Math.max(2, Math.ceil(lv.w / 1.8));
      // 座敷と板間の境、土間際で切れる床板の木口も根太で受ける。
      // 等間隔の根太と近い時は幅をまとめ、同じ高さへ二本を重ねない。
      const floorEnds = lv.layout.rooms.flatMap(room => [room.z0, room.z1])
        .filter(z => z > -hd + .09 && z < hd - .09);
      for (const [x0, x1, z0, z1] of underfloor) {
        const spans = [];
        for (let j = 1; j < rows; j++) {
          const z = -hd + j * .45;
          if (z - .03 >= z0 && z + .03 <= z1)
            spans.push([z - .03, z + .03]);
        }
        for (const z of floorEnds) {
          if (z < z0 || z > z1) continue;
          spans.push([Math.max(z0, z - .045), Math.min(z1, z + .045)]);
        }
        spans.sort((a, b) => a[0] - b[0]);
        const supports = [];
        for (const span of spans) {
          const last = supports[supports.length - 1];
          if (last && span[0] <= last[1]) last[1] = Math.max(last[1], span[1]);
          else supports.push(span);
        }
        for (const [back, front] of supports)
          beam((x0 + x1) / 2, y - .11, (back + front) / 2, x1 - x0, .06, front - back);
        for (let j = 1; j < columns; j++) {
          const x = -hw + j * lv.w / columns;
          if (x - .05 < x0 || x + .05 > x1) continue;
          beam(x, y - .18, (z0 + z1) / 2, .1, .08, z1 - z0);
          const count = Math.max(1, Math.ceil((z1 - z0) / 1.8));
          for (let q = 0; q < count; q++) {
            const z = z0 + (q + .5) * (z1 - z0) / count;
            post(x, z);
          }
        }
      }
      if (hearth) {
        // 炉で切った根太と大引の木口は四周の受け材へ納め、隅の床束で地面へ支える。
        const a = hearth.w / 2 + .06, b = hearth.d / 2 + .06;
        for (const side of [-1, 1]) {
          beam(hearth.x + side * (a + .05), y - .15, hearth.z, .1, .14, (b + .1) * 2);
          beam(hearth.x, y - .15, hearth.z + side * (b + .05), a * 2, .14, .1);
          for (const end of [-1, 1]) post(hearth.x + side * (a + .05), hearth.z + end * (b + .05));
        }
      }
    }
    // 設楽原の小堂の床組は外観側で柱割り・板の継ぎ目に合わせて組む。
    // 室内側にも根太・大引・礎石を作ると、異なる割りの材が同じ床下で交差する。
    // 須弥壇と内陣境の柱を受ける外観側の床組を共用し、ここでは板床だけを張る。
    // 床（階段の口は空ける）・天井（上の階段の口は空ける）
    if (I.profile?.startsWith('honnoji_')) {
    const floorBase = (x0, x1, z0, z1, top) => {
      const [fx, fz] = I.P((x0 + x1) / 2, (z0 + z1) / 2);
      if (!naibu || !addNaibu(naibu, 'floor_modular_a', fx, top - .08, fz, x1 - x0, .08, z1 - z0, I.rot)) box((x0 + x1) / 2, top - .04, (z0 + z1) / 2, x1 - x0, .08, z1 - z0, FLOOR);
    };
    for (const [x0, x1, z0, z1] of lv.pieces) {
      if (!boardFloor) { floorBase(x0, x1, z0, z1, y); continue; }
      // 板間だけ下地を板厚ぶん下げる。畳・土間と歩行面の高さは保つ。
      for (const r of lv.layout.rooms) {
        const a = Math.max(x0, r.x0), b = Math.min(x1, r.x1);
        const c = Math.max(z0, r.z0), d = Math.min(z1, r.z1);
        if (b > a && d > c) floorBase(a, b, c, d, y + (r.y || 0) - (r.floor === 'boards' ? .024 : 0));
      }
      }
    } else {
    for (const [x0, x1, z0, z1, offset = 0] of floorPieces) {
      const [fx, fz] = I.P((x0 + x1) / 2, (z0 + z1) / 2);
      // 民家と小堂は板の下面に暗い裏面を置く。目地を床の上の黒い棒で代用しない。
      if (villageHome || villageHall) box((x0 + x1) / 2, y - .06, (z0 + z1) / 2, x1 - x0, .04, z1 - z0, DARK);
      else if (nodaJoinery || !naibu || !addNaibu(naibu, 'floor_modular_a', fx, y + offset - .08, fz, x1 - x0, .08, z1 - z0, I.rot)) box((x0 + x1) / 2, y + offset - .04, (z0 + z1) / 2, x1 - x0, .08, z1 - z0, FLOOR);
      if (villageHome) for (const room of lv.layout.rooms) if (room.floor === 'tatami') {
        // 小座敷も畳の下を床板で受ける。裏面だけでは畳床との間に四センチの空洞が残る。
        // 階段・炉の穴を除いた床片と座敷の重なりだけに張り、土間や敷居の高さは変えない。
        // 畳の外に見える板縁まで一枚の下地にせず、四周を木目の通る板で納める。
        // 畳と同じ柱の内面・襖側の余白で割り、隅は前後の板へ突き付ける。
        // 隠れる下地だけ一枚にし、厚み・歩行面は保つ。原形と材質は戸口の木部と共用する。
        const left = room.x0 + .24, right = room.x1 - .24;
        const back = room.z0 + (ds > 0 ? .24 : .1);
        const front = room.z1 - (ds > 0 ? .1 : .24);
        for (const [ax, bx, az, bz, edge] of [
          [left, right, back, front, false],
          [room.x0, room.x1, room.z0, back, true],
          [room.x0, room.x1, front, room.z1, true],
          [room.x0, left, back, front, true],
          [right, room.x1, back, front, true],
        ]) {
          const a = Math.max(x0, ax), b = Math.min(x1, bx);
          const c = Math.max(z0, az), d = Math.min(z1, bz);
          if (b <= a || d <= c) continue;
          if (edge) entryTimber((a + b) / 2, y - .02, (c + d) / 2,
            b - a, .04, d - c, FLOOR);
          else box((a + b) / 2, y - .02, (c + d) / 2, b - a, .04, d - c, FLOOR);
        }
      }
    }
    }
    if (I.profile?.startsWith('honnoji_')) {
      // 付属棟の板間は浮いた目地の線をやめ、厚さのある板を張る（割付は推定）。
      // 下地へ納めて上面を元の歩行面へそろえ、二ミリの目透かしだけを残す。
      // 二条御所は外観側に床の仕上げがあるため、ここでは重ねない。
      if (boardFloor) for (const r of lv.layout.rooms) if (r.floor === 'boards') {
        // 外壁際の板端を床框で受ける（納まりは推定）。板の仕上げ面とそろえ、
        // 間仕切りの敷居や畳の部屋へは回さない。隅は左右を通して前後を突き付ける。
        const rim = .12;
        const left = r.x0 + (Math.abs(r.x0 + hw) < .001 ? rim : 0);
        const right = r.x1 - (Math.abs(r.x1 - hw) < .001 ? rim : 0);
        const front = r.z0 + (Math.abs(r.z0 + hd) < .001 ? rim : 0);
        const back = r.z1 - (Math.abs(r.z1 - hd) < .001 ? rim : 0);
        const floorFrame = (a, b, c, d) => {
          for (const piece of lv.pieces) {
            const x0 = Math.max(a, piece[0]), x1 = Math.min(b, piece[1]);
            const z0 = Math.max(c, piece[2]), z1 = Math.min(d, piece[3]);
            if (x1 > x0 && z1 > z0) box((x0 + x1) / 2, y + (r.y || 0) - .012,
              (z0 + z1) / 2, x1 - x0, .024, z1 - z0, 0x795b3b);
          }
        };
        if (left > r.x0) floorFrame(r.x0, left, r.z0, r.z1);
        if (right < r.x1) floorFrame(right, r.x1, r.z0, r.z1);
        if (front > r.z0) floorFrame(left, right, r.z0, front);
        if (back < r.z1) floorFrame(left, right, back, r.z1);
        const w = r.x1 - r.x0, d = r.z1 - r.z0, acrossX = w >= d;
        const span = acrossX ? d : w, n = Math.ceil(span / .26);
        const length = acrossX ? w : d, bays = Math.ceil(length / 1.91), pitch = length / bays;
        for (let row = 0; row < n; row++) {
          const near = (acrossX ? r.z0 : r.x0) + row * span / n + (row ? .001 : 0);
          const far = (acrossX ? r.z0 : r.x0) + (row + 1) * span / n - (row < n - 1 ? .001 : 0);
          let start = 0;
          // 隣の板で継ぐ位置を一間ずらし、木口を千鳥へ納める。
          for (let joint = 1 + row % 2; ; joint += 2) {
            const end = Math.min(length, joint * pitch);
            const a = (acrossX ? r.x0 : r.z0) + start + (start ? .001 : 0);
            const b = (acrossX ? r.x0 : r.z0) + end - (end < length ? .001 : 0);
            // 階段などの床の穴には板を渡さない。既存の木部へ設営時にまとめる。
            for (const piece of lv.pieces) {
              const x0 = Math.max(piece[0], left, acrossX ? a : near), x1 = Math.min(piece[1], right, acrossX ? b : far);
              const z0 = Math.max(piece[2], front, acrossX ? near : a), z1 = Math.min(piece[3], back, acrossX ? far : b);
              if (x1 > x0 && z1 > z0) box((x0 + x1) / 2, y + (r.y || 0) - .012, (z0 + z1) / 2,
                x1 - x0, .024, z1 - z0, row % 3 === 0 ? 0x826344 : FLOOR);
            }
            if (end >= length) break;
            start = end;
          }
        }
      }
    }
    const moribeCeiling = I.profile === 'moribe' && ['yashiki', 'hondo'].includes(I.kind);
    if (I.profile === 'iga') {
    if (!I.open && !igaOpenRoof) for (const [x0, x1, z0, z1] of rectMinus(hw, hd, upSt ? upSt.hole : null)) box((x0 + x1) / 2, y + h + 0.03, (z0 + z1) / 2, x1 - x0, 0.06, z1 - z0, goten ? 0x7a6448 : DARK);
    // 天井の作り：御殿は竿縁天井（一尺五寸ごとの細い竿縁と回縁）、櫓・天守は上の床を支える根太を見せる
    if (!I.open && I.profile === 'iga' && I.kind === 'yashiki') {
      // 館は座敷ごとに竿縁と回縁を納め、板敷きの入口には太い根太を見せる。
      for (const r of lv.layout.rooms) {
        const tatamiRoom = r.floor === 'tatami';
        const rz = (r.z0 + r.z1) / 2;
        // 柱面へ掛けた回縁を天井材の基準にする。竿縁を壁まで突き抜けさせず、
        // 板の継ぎ目も回縁の内側で止め、壁際へ黒い線を残さない。
        const frameX0 = r.x0 + .27, frameX1 = r.x1 - .27;
        const frameZ0 = r.z0 + (Math.abs(r.z0 + hd) < .01 ? .27 : .08);
        const frameZ1 = r.z1 - (Math.abs(r.z1 - hd) < .01 ? .27 : .08);
        // 床の間の小壁は座敷の天井まで立つ。竿縁・目地・回縁を
        // その内側へ貫通させず、平面の外形で切って小壁の表へ納める。
        // 切り分けは室内を作る時だけ。既存の木材と静止した束を使う。
        const alcoves = lv.layout.props.filter(p => p.part === 'alcove'
          && p.x + p.w / 2 > r.x0 && p.x - p.w / 2 < r.x1
          && p.z + p.d / 2 > r.z0 && p.z - p.d / 2 < r.z1);
        const ceilingBox = (x, yy, z, w, hh, d, color, woodGrain = false) => {
          // 板と竿縁・回縁を同じ木肌で納める。横木は切り分ける前の
          // 長手を保ち、床の間の脇で短くなっても木目を九十度回さない。
          let pieces = [[x - w / 2, x + w / 2, z - d / 2, z + d / 2]];
          for (const p of alcoves) {
            const a = p.x - p.w / 2, b = p.x + p.w / 2;
            const n = p.z - p.d / 2, s = p.z + p.d / 2;
            pieces = pieces.flatMap(([x0, x1, z0, z1]) => {
              if (a >= x1 || b <= x0 || n >= z1 || s <= z0) return [[x0, x1, z0, z1]];
              return [[x0, Math.max(x0, a), z0, z1], [Math.min(x1, b), x1, z0, z1],
                [Math.max(x0, a), Math.min(x1, b), z0, Math.max(z0, n)],
                [Math.max(x0, a), Math.min(x1, b), Math.min(z1, s), z1]];
            }).filter(([x0, x1, z0, z1]) => x1 - x0 > .001 && z1 - z0 > .001);
          }
          for (const [x0, x1, z0, z1] of pieces) {
            if (woodGrain) igaBoards.push([(x0 + x1) / 2, yy, (z0 + z1) / 2,
              x1 - x0, hh, z1 - z0, color,
              woodGrain === true ? (w > d ? 'boardX' : 'boardZ') : woodGrain]);
            else box((x0 + x1) / 2, yy, (z0 + z1) / 2, x1 - x0, hh, z1 - z0, color);
          }
        };
        // 床の間へ竿縁の端を向ける床刺しを避け、続く取次の座敷も同じ向きに納める。
        if (tatamiRoom) {
          // 固定の四十五センチ刻みでは、回縁際だけ狭い竿縁の間が残る。
          // 部屋ごとに柱間を等分し、天井板の木口も同じ竿縁の上で継ぐ。
          const ceilingBays = Math.max(1, Math.round((frameZ1 - frameZ0) / .45));
          const ceilingPitch = (frameZ1 - frameZ0) / ceilingBays;
          // 回縁の内寸を板幅で等分し、端だけ細い板を残さない。
          // 板端は回縁へ掛け、目地は二ミリに抑える。八ミリの黒い溝を
          // 座敷いっぱいに並べず、竿縁の上で継ぐ木口は従来どおりずらす。
          const boardX0 = frameX0 + .02, boardX1 = frameX1 - .02;
          const boardCount = Math.max(1, Math.round((boardX1 - boardX0) / .3));
          const boardWidth = (boardX1 - boardX0) / boardCount;
          for (let i = 1; i < boardCount; i++)
            ceilingBox(boardX0 + i * boardWidth, y + h - .002, (frameZ0 + frameZ1) / 2,
              .002, .004, frameZ1 - frameZ0 - .08, DARK);
          // 天井板の木口は竿縁の上で継ぐ推定復元。長い一枚板に見せず、
          // 隣り合う板の継ぎ目をずらす。床の間は既存の切り分けで避け、
          // 共通の木材で静止した室内の束へ納める。
          // 端の短い板も木目は奥行きへ通す。幅より短い木口で向きを選び直さない。
          // 回縁の内面で板を止めると木口を受けられない。
          // 両端を回縁へ二センチ掛け、途中の継ぎ目は竿縁の上に保つ。
          for (let board = 0; board < boardCount; board++) {
            const x = boardX0 + board * boardWidth;
            let start = frameZ0 + .02, piece = 0;
            for (let joint = 1 + board % 2; start < frameZ1 - .02; joint += 2, piece++) {
              const end = frameZ0 + joint * ceilingPitch;
              const stop = Math.min(end, frameZ1 - .02);
              ceilingBox(x + boardWidth / 2, y + h - .0015, (start + stop) / 2,
                boardWidth - .002, .003, stop - start - .002,
                (board + piece) % 2 ? 0x7d674b : 0x766044, 'boardZ');
              start = stop;
            }
          }
          for (let bay = 1; bay < ceilingBays; bay++) {
            const q = frameZ0 + bay * ceilingPitch;
            ceilingBox((frameX0 + frameX1) / 2, y + h - .025, q,
              frameX1 - frameX0, .05, .035, DARK, 'x');
            // 竿縁の端は回縁へ差す推定復元。回縁の室内面に差し口の
            // 両脇と下端を見せ、横木を重ねただけの接合にしない。
            // 床の間を横切る所は既存の切り分けを使い、共有の箱形へまとめる。
            for (const side of [-1, 1]) {
              const jointX = side < 0 ? frameX0 + .042 : frameX1 - .042;
              for (const edge of [-1, 1])
                ceilingBox(jointX, y + h - .025, q + edge * .019,
                  .003, .05, .003, 0x211a14);
              ceilingBox(jointX, y + h - .051, q,
                .003, .003, .041, 0x211a14);
            }
          }
        } else {
          // 入口も座敷と同じ木肌の天井板で張る。単色の面に目地だけを
          // 描くのでなく、根太の上で木口を継ぎ、一列おきに継ぎ目をずらす。
          // 共通の板材の束へ加え、材質と描く回数は増やさない。
          // 回縁の内寸を等分し、端に細い切れ端を残さない。
          // 以前の黒い目地は板の合わせ目から四センチずれていた。
          // 実際の板間だけを二ミリ空け、座敷と同じ細い目地で納める。
          // 板端は四周とも回縁へ二センチ掛ける。内面への突き付けにせず、
          // 根太上の木口継ぎと二ミリの板目地はそのまま保つ。
          const rowStart = frameZ0 + .02, rowEnd = frameZ1 - .02;
          const rows = Math.max(1, Math.round((rowEnd - rowStart) / .3));
          const rowDepth = (rowEnd - rowStart) / rows;
          // 根太も回縁の内側で等分し、壁際だけ狭い間隔を残さない。
          // 板の千鳥継ぎと同じ支点を使う。柱間の細部は推定復元。
          const bearingX0 = frameX0 + .02, bearingX1 = frameX1 - .02;
          const bearingBays = Math.max(1, Math.ceil((bearingX1 - bearingX0) / 1.7));
          const bearingPitch = (bearingX1 - bearingX0) / bearingBays;
          for (let row = 0; row < rows; row++) {
            const z = rowStart + row * rowDepth, end = z + rowDepth;
            let start = bearingX0, piece = 0;
            for (let joint = 1 + row % 2; start < bearingX1 - .001; joint += 2) {
              const stop = Math.min(bearingX0 + joint * bearingPitch, bearingX1);
              ceilingBox((start + stop) / 2, y + h - .0015, (z + end) / 2,
                stop - start - .002, .003, end - z - .002,
                (row + piece) % 2 ? 0x7d674b : 0x766044, 'boardX');
              start = stop; piece++;
            }
          }
          // 入口の見せる根太は、両端を柱筋の横架材へ掛ける。
          // 細い回縁だけでは根太の下半分が宙に出るため、壁際と
          // 座敷境の柱へ太い受け材を渡す。座敷の竿縁とは分ける。
          // 座敷境は間仕切りの柱心、外壁側は隅柱の柱心へそろえる。
          // 両端を一律に八センチ引くと、受け材が柱筋から八センチずれる。
          const supportZ0 = r.z0, supportZ1 = r.z1 - .16;
          for (const z of [supportZ0, supportZ1]) {
            // 柱心は壁から十六センチ、柱幅は十六センチ。
            // 木口を柱の外面で止め、両端が柱から板壁へ八センチ突き出すのを防ぐ。
            houseTimber((r.x0 + r.x1) / 2, y + h - .12, z, r.x1 - r.x0 - .16, .24, .16, DARK, 'x');
            // 受け材と側柱の取り合いにも差し口と込栓を見せる推定復元。
            // 根太側だけに仕口があると、受け材の端は壁へ突き刺さったままに見える。
            // 外周柱の室内面へ納め、戸口・天井高は変えず静止した束へ焼き込む。
            for (const side of [-1, 1]) {
              const surface = side < 0 ? r.x0 + .232 : r.x1 - .232;
              const jointZ = z + (z < rz ? 1 : -1) * .082;
              for (const yy of [-.24, -.002])
                box(surface, y + h + yy, jointZ, .004, .004, .08, 0x211a14);
              // 木栓は柱を貫く向き。小口だけ柱の表へ出し、受け材の中央に置く。
              box(surface - side * .004, y + h - .12, jointZ,
                .012, .025, .025, WOOD);
            }
          }
          const joistZ0 = supportZ0 + .02, joistZ1 = supportZ1 - .02;
          for (let bay = 1; bay < bearingBays; bay++) {
            const q = bearingX0 + bay * bearingPitch;
            // 根太を受け材の表面で突き合わせず、両端を六センチ差す推定復元。
            // 仕口の縁と抜け止めの込栓を下面に見せる。天井高・戸の開口は保つ。
            houseTimber(q, y + h - .12, (joistZ0 + joistZ1) / 2,
              .17, .24, joistZ1 - joistZ0, DARK, 'z');
            for (const side of [-1, 1]) {
              const faceZ = side < 0 ? supportZ0 + .08 : supportZ1 - .08;
              for (const dx of [-.087, .087])
                box(q + dx, y + h - .241, faceZ - side * .03,
                  .004, .002, .06, 0x211a14);
              box(q, y + h - .241, faceZ - side * .06,
                .178, .002, .004, 0x211a14);
              box(q, y + h - .244, faceZ - side * .03,
                .022, .008, .022, WOOD);
            }
          }
        }
        // 外周の内壁は壁際から十三センチ、柱面は二十三センチ内側。
        // 八センチの位置では回縁が壁に埋まるため、背を柱面へ掛ける。
        // 座敷境の小壁は中央にあるので、その側だけ従来の八センチを保つ。
        // 天井板の下面は h - .003。回縁の上面もそこへ合わせ、
        // 板端と受け材の間に七ミリの隙間を残さない。
        // 入口・座敷・床の間の返しで同じ高さを使う。
        const ceilingFrameY = y + h - .003 - .08 / 2;
        for (const z of [frameZ0, frameZ1])
          ceilingBox((frameX0 + frameX1) / 2, ceilingFrameY, z,
            frameX1 - frameX0 + .08, .08, .08, DARK, 'x');
        for (const x of [frameX0, frameX1])
          ceilingBox(x, ceilingFrameY, (frameZ0 + frameZ1) / 2,
            .08, .08, frameZ1 - frameZ0 - .08, DARK, 'z');
        // 床の間の張り出す二辺にも回縁を返し、切った竿縁の端を受ける。
        for (const p of alcoves) {
          const x0 = Math.max(frameX0, p.x - p.w / 2 - .04);
          const x1 = Math.min(frameX1, p.x + p.w / 2 + .04);
          const z0 = Math.max(frameZ0, p.z - p.d / 2);
          const z1 = Math.min(frameZ1, p.z + p.d / 2);
          if (x1 <= x0 || z1 <= z0) continue;
          houseTimber((x0 + x1) / 2, ceilingFrameY, z1 + .04, x1 - x0, .08, .08, DARK, 'x');
          // 脇の返しは正面の回縁の内面で止めず、芯まで四センチ差す。
          // 木口の突き合わせだけにせず、奥の回縁から床の間の角まで
          // 受けを連続させる推定復元。共通の木材と静止した束を使う。
          const returnEnd = z1 + .04;
          for (const x of [p.x - p.w / 2 - .04, p.x + p.w / 2 + .04])
            if (x >= frameX0 && x <= frameX1)
              houseTimber(x, ceilingFrameY, (z0 + returnEnd) / 2, .08, .08, returnEnd - z0, DARK, 'z');
        }
      }
    }
    } else if (fineIwamura || nodaJoinery) {
    if (fineIwamura && !I.open) for (const [x0, x1, z0, z1] of rectMinus(hw, hd, upSt ? upSt.hole : null)) box((x0 + x1) / 2, y + h + 0.03, (z0 + z1) / 2, x1 - x0, 0.06, z1 - z0, goten ? 0x7a6448 : DARK);
    const residenceCeiling = fineIwamura && ['goten', 'yashiki'].includes(I.kind);
    // 床の間には専用の内天井がある。座敷の天井板・目地も竿縁と同じ境で止める。
    // 高画質の岩村を組む時だけ切り分け、共通の天井下地は残す。
    const ceilingAlcoves = residenceCeiling ? lv.layout.props.filter(p => p.part === 'alcove') : [];
    const ceilingBoard = (cx, yy, cz, width, height, depth, color) => {
      let pieces = [[cx - width / 2, cx + width / 2, cz - depth / 2, cz + depth / 2]];
      for (const p of ceilingAlcoves) {
        const ax = p.x - p.w / 2 - .01, bx = p.x + p.w / 2 + .01;
        const az = p.z - p.d / 2 - .01, bz = p.z + p.d / 2 + .01;
        const remaining = [];
        for (const [l, r, a, b] of pieces) {
          if (bx <= l || ax >= r || bz <= a || az >= b) {
            remaining.push([l, r, a, b]);
            continue;
          }
          const x0 = Math.max(l, ax), x1 = Math.min(r, bx);
          const z0 = Math.max(a, az), z1 = Math.min(b, bz);
          if (x0 > l) remaining.push([l, x0, a, b]);
          if (x1 < r) remaining.push([x1, r, a, b]);
          if (z0 > a) remaining.push([x0, x1, a, z0]);
          if (z1 < b) remaining.push([x0, x1, z1, b]);
        }
        pieces = remaining;
      }
      for (const [l, r, a, b] of pieces) if (r - l > .001 && b - a > .001) {
        box((l + r) / 2, yy, (a + b) / 2, r - l, height, b - a, color);
      }
    };
    // 見せる梁と天井板の継手で同じ割付を使う。板の端を梁のない所へ浮かせない。
    // 奥行きの長い用屋は短辺へ梁を渡す。桁と上張りの継手も同じ向きへそろえる。
    const crosswiseBeams = exposedIwamura && lv.d > lv.w;
    const beamRun = crosswiseBeams ? lv.d : lv.w, beamSpan = crosswiseBeams ? lv.w : lv.d;
    const inabaBeamFrame = inabaBoards && plainCeiling;
    const beamBays = Math.max(2, Math.round(lv.w / 1.9));
    const beamH = fineIwamura && boardInterior ? Math.min(.24, h - interiorPanelHeight(lv.layout, h) - .12) : .24;
    const beamStep = exposedIwamura ? beamRun / Math.max(2, Math.round(beamRun / 1.9)) : 1.7;
    const beamBox = (u, yy, v, length, height, width, color) => {
      if (crosswiseBeams) box(v, yy, u, width, height, length, color);
      else box(u, yy, v, length, height, width, color);
      // 岩村の見せる梁・桁・根太は、下面にも材の長手へ木目を通す推定復元。
      // 継手の黒線だけが浮かないよう、二筋を異なる長さで途切れさせる。
      // 原形は全棟で共有し、近づいて組む時だけ既存の木材の束へ結合する。
      if (!exposedIwamura || (color !== DARK && color !== WOOD)
        || height < .07 || Math.max(length, width) < .5) return;
      iwamuraBeamGrainShape ??= new THREE.BoxGeometry(1, 1, 1);
      const alongU = length >= width, run = Math.max(length, width), span = Math.min(length, width);
      for (const side of [-1, 1]) {
        const grainRun = run * (side < 0 ? .63 : .47);
        const along = side * run * .1, across = side * span * .23;
        const gu = u + (alongU ? along : across), gv = v + (alongU ? across : along);
        const gl = alongU ? grainRun : .003, gw = alongU ? .003 : grainRun;
        const grain = iwamuraBeamGrainShape.clone().scale(
          crosswiseBeams ? gw : gl, .001, crosswiseBeams ? gl : gw);
        put(grain, crosswiseBeams ? gv : gu, yy - height / 2 - .0005,
          crosswiseBeams ? gu : gv, color === DARK ? 0x302317 : 0x59412b);
      }
    };
    // 主殿と侍屋敷は、部屋ごとの竿縁に直交する向きへ天井板を張る推定復元。
    // 回縁の内へ納め、隣の座敷や縁側まで一枚の板目を通さない。
    if (residenceCeiling && !I.open) for (const room of lv.layout.rooms) {
      const x0 = room.x0 + .12, x1 = room.x1 - .12;
      const z0 = room.z0 + .12, z1 = room.z1 - .12;
      // 座敷の天井を一枚の平板にせず、竿縁の上で板を継ぐ推定復元。
      // 四つの竿縁間隔を板の長さとし、隣の板は二間隔ずらす。
      // 下の竿縁と同じ部屋寸法から割り付け、継手を支えのない所へ浮かせない。
      const rods = Math.max(1, Math.round((room.z1 - room.z0) / .45));
      const rodPitch = (room.z1 - room.z0) / rods;
      const boards = Math.max(1, Math.round((x1 - x0) / .3));
      const boardWidth = (x1 - x0) / boards;
      for (let i = 0; i < boards; i++) {
        const left = x0 + i * boardWidth, right = left + boardWidth;
        for (let span = -1; span * 4 + (i % 2) * 2 < rods; span++) {
          const start = span * 4 + (i % 2) * 2;
          const a = Math.max(z0, room.z0 + start * rodPitch);
          const b = Math.min(z1, room.z0 + (start + 4) * rodPitch);
          if (b <= a) continue;
          ceilingBoard((left + right) / 2, y + h - .004, (a + b) / 2,
            right - left - .006, .008, b - a,
            (i + span + 3) % 3 === 0 ? 0x756044 : (i + span + 3) % 3 === 1 ? 0x7a6448 : 0x80694c);
          // 主殿・屋敷の天井板にも長手の木目を残す。板ごとに端をずらし、
          // 継手や回縁へ突き通さず、床の間は板と同じ切欠きで除く。
          // 堂の鏡板と同じ細い箱を既存の束へ結合し、材質や毎コマの処理は増やさない。
          for (const side of [-1, 1]) {
            const start = a + .06 + ((i + (side > 0 ? 1 : 0)) % 3) * .015;
            const end = b - .06 - ((i + span + 3) % 3) * .015;
            if (end <= start) continue;
            ceilingBoard((left + right) / 2 + side * boardWidth * .2,
              y + h - .0085, (start + end) / 2, .0025, .001, end - start, 0x695339);
          }
          // 板の木口は竿縁の上へ納め、室内から継ぎ目だけが見えるようにする。
          if (a > z0 + .01) ceilingBoard((left + right) / 2, y + h - .009, a,
            boardWidth - .006, .002, .006, 0x493525);
        }
      }
      for (let i = 1; i < boards; i++) {
        const q = x0 + i * boardWidth;
        ceilingBoard(q, y + h - .002, (z0 + z1) / 2, .009, .004, z1 - z0, 0x493525);
      }
    }
    // 堂の板割りは下で格間・部屋ごとに納める。
    // 梁を見せる小屋・社は上張りの板目。既存の束へ結合し、描く数は増やさない。
    if (fineIwamura && !residenceCeiling && I.kind !== 'hondo' && !I.open) for (const [x0, x1, z0, z1] of rectMinus(hw, hd, upSt ? upSt.hole : null)) {
      const u0 = crosswiseBeams ? z0 : x0, u1 = crosswiseBeams ? z1 : x1;
      const v0 = crosswiseBeams ? x0 : z0, v1 = crosswiseBeams ? x1 : z1;
      const hu = beamRun / 2, hv = beamSpan / 2;
      for (let q = -hv + .3; q < v1 - .02; q += .3) if (q > v0 + .02) {
        beamBox((u0 + u1) / 2, y + h - .002, q, u1 - u0, .004, .009, 0x493525);
      }
      // 上張りの木口は梁上で継ぐ。隣の列は一つ先の梁へずらす推定復元。
      // 長屋でも短辺へ渡した梁と直交させ、継手を支えのない所へ浮かせない。
      if (exposedIwamura) for (let row = 0; -hv + row * .3 < v1; row++) {
        const a = Math.max(v0, -hv + row * .3 + .005);
        const b = Math.min(v1, -hv + (row + 1) * .3 - .005);
        if (b <= a) continue;
        for (let span = -1; -hu + (span * 2 + row % 2) * beamStep < u1; span++) {
          const start = -hu + (span * 2 + row % 2) * beamStep;
          const left = Math.max(u0, start + .005), right = Math.min(u1, start + beamStep * 2 - .005);
          if (right <= left) continue;
          const shade = (row + span + 3) % 3;
          beamBox((left + right) / 2, y + h - .006, (a + b) / 2, right - left, .008, b - a,
            shade === 0 ? 0x756044 : shade === 1 ? 0x7a6448 : 0x80694c);
          // 梁上の板は全列へ木目を通し、目地と紛れる一本の直線にしない。
          // 板端を避けた短い二筋をずらし、長屋の短辺へ渡す梁にも向きを合わせる。
          // 原形は梁と共有し、設営時だけ既存の束へ結合する。
          const grainStart = left + .07 + (row % 3) * .015;
          const grainEnd = right - .07 - shade * .015;
          if (grainEnd > grainStart) for (const side of [-1, 1]) {
            const run = grainEnd - grainStart;
            const u = (grainStart + grainEnd) / 2 + side * run * .12;
            const v = (a + b) / 2 + side * (b - a) * (.16 + shade * .025);
            const length = run * (side < 0 ? .61 : .43);
            iwamuraBeamGrainShape ??= new THREE.BoxGeometry(1, 1, 1);
            const grain = iwamuraBeamGrainShape.clone().scale(
              crosswiseBeams ? .002 : length, .001, crosswiseBeams ? length : .002);
            put(grain, crosswiseBeams ? v : u, y + h - .0105,
              crosswiseBeams ? u : v, side < 0 ? 0x695339 : 0x705a3e);
          }
        }
      }
    }


    // 民家の炉と庫裏の竈は煙を小屋裏へ逃がす口を残す。配置時だけ作る。
    if (!I.open && nodaJoinery) for (const [x0, x1, z0, z1] of rectMinus(hw, hd, ceilingHole)) box((x0 + x1) / 2, y + h + 0.03, (z0 + z1) / 2, x1 - x0, 0.06, z1 - z0, goten ? 0x7a6448 : DARK);
    if (!I.open && nodaJoinery) {
      // 竿縁や梁の上は一枚の平板でなく板天井。部屋ごとに板継ぎを揃え、
      // 煙抜き・階段の開口は天井板と同じ範囲で切る。室内を作る時だけ束ねる。
      const pieces = rectMinus(hw, hd, ceilingHole);
      // 煤は板を重ねず、天井板そのものへ焼き込む。目地・木口・煙抜きを塞がない。
      // 板の形と枚数は保ち、既存の頂点色の束へ生成時だけまとめる。
      const clean = new THREE.Color(0x7a6448);
      const soot = smokeHole ? new THREE.Color(0x3b3025) : null;
      const ceilingPlank = (left, right, back, front, alongZ) => {
        const g = ceilingBoard(left, right, back, front, y + h - .012, alongZ, 0x7a6448);
        const pos = g.attributes.position, colors = g.attributes.color;
        if (smokeHole) for (let j = 0; j < pos.count; j++) {
          const x = pos.getX(j), z = pos.getZ(j);
          const distance = Math.hypot(Math.max(smokeHole.x0 - x, 0, x - smokeHole.x1),
            Math.max(smokeHole.z0 - z, 0, z - smokeHole.z1));
          const amount = Math.max(0, Math.min(1, (.55 - distance) / .38));
          const tint = amount * amount * (3 - 2 * amount);
          colors.setXYZ(j, clean.r + (soot.r - clean.r) * tint,
            clean.g + (soot.g - clean.g) * tint, clean.b + (soot.b - clean.b) * tint);
        }
        g.rotateY(I.rot); g.translate(I.x, 0, I.z); list.push(g);
      };
      for (const r of lv.layout.rooms) for (const [a, b, c, d] of pieces) {
        if (nodaHall && r.floor !== 'tatami') continue;
        const x0 = Math.max(a, r.x0 + .06), x1 = Math.min(b, r.x1 - .06);
        const z0 = Math.max(c, r.z0 + .06), z1 = Math.min(d, r.z1 - .06);
        if (x1 <= x0 || z1 <= z0) continue;
        // 板厚十八ミリの上六ミリを目地の裏まで通し、相じゃくりの掛かりとする推定復元。
        // 見上げる目地は残し、板継ぎから屋根裏の光を漏らさない。
        // 煙抜き・階段は切り欠いた同じ範囲を使い、静止した箱の束へ加える。
        box((x0 + x1) / 2, y + h - .003, (z0 + z1) / 2,
          x1 - x0, .006, z1 - z0, 0x7a6448);
        // 板間・土間の根太は横向きなので、天井板は奥行き方向へ張る。
        // 座敷は奥行き方向の竿縁に対して横へ張り、板と受け材を平行にしない。
        const alongZ = r.floor !== 'tatami';
        const across0 = alongZ ? r.x0 : r.z0, across1 = alongZ ? x1 : z1;
        // 御影堂の外陣は回縁の内側を等分した竿縁。下で組む実際の柱間と
        // 起点・本数を揃え、天井板の木口の継ぎ目が受け材のない所へ浮かないようにする。
        const hallSpan = r.x1 - r.x0 - .32;
        const along0 = alongZ ? r.z0 : r.x0 + (nodaHall ? .16 : 0);
        const lo = alongZ ? z0 : x0, hi = alongZ ? z1 : x1;
        const acrossLo = alongZ ? x0 : z0;
        const support = alongZ ? .5 : nodaHall ? hallSpan / Math.max(1, Math.round(hallSpan / .45)) : .45;
        for (let i = 0; across0 + i * .3 < across1; i++) {
          const edge = across0 + i * .3;
          if (!alongZ) {
            // 座敷の天井は黒線を貼った一枚板でなく、厚みのある板を竿縁へ掛ける。
            // 御影堂の外陣・僧坊・詰所・庫裏で共用する推定復元。
            // 木口は下の竿縁の芯で継ぎ、隣の列と二本分ずらす。
            const back = Math.max(z0, edge + .003), front = Math.min(z1, edge + .297);
            if (front - back <= .012) continue;
            let left = lo;
            const plank = right => {
              if (right - left > .012) ceilingPlank(left, right, back, front, false);
            };
            for (let q = along0 + support * (i % 2 ? 2 : 4); q < hi - .006; q += support * 4) {
              if (q <= lo + .006) continue;
              plank(q - .003);
              left = q + .003;
            }
            plank(hi);
            continue;
          }
          // 用屋・庫裏・民家の板間と土間も、線だけの平天井から厚みのある板へ替える。
          // 短辺は根太の芯で継ぎ、煙抜き・階段の開口は板そのものを切り欠く。
          // 座敷と同じ板厚・目地を使い、静止した内装の束へ生成時だけ加える。
          const a = Math.max(acrossLo, edge + .003), b = Math.min(across1, edge + .297);
          if (b - a < .012) continue;
          let back = lo;
          const plank = front => {
            if (front - back > .012) ceilingPlank(a, b, back, front, true);
          };
          for (let q = along0 + support * (i % 2 ? 2 : 4); q < hi - .006; q += support * 4) {
            if (q <= lo + .006) continue;
            plank(q - .003);
            back = q + .003;
          }
          plank(hi);
        }
      }
    }
    if (!I.open && smokeHole) {
      const v = smokeHole, cx = (v.x0 + v.x1) / 2, cz = (v.z0 + v.z1) / 2;
      // 受け材の内面を開口の縁へ合わせる。中心を縁に置くと、
      // 煙抜きへ材の半分が突き出す。切った根太・梁は縁の受け材へつなぐ。
      // 奥行きの受け材を通し、横の受け材はその内面で納める。
      for (const side of [-1, 1]) {
        const x = side < 0 ? v.x0 - .085 : v.x1 + .085;
        box(x, y + h - .19, cz, .17, .12, v.z1 - v.z0 + .34, DARK);
        // 横枠の掛かる内側半分だけ上端を欠く。重ねた材の同じ面を残さない。
        box(x + side * .0425, y + h - .07, cz, .085, .12, v.z1 - v.z0 + .34, DARK);
        box(x - side * .0425, y + h - .07, cz, .085, .12, v.z1 - v.z0, DARK);
      }
      for (const z of [v.z0 - .085, v.z1 + .085]) {
        box(cx, y + h - .13, z, v.x1 - v.x0, .24, .17, DARK);
        // 煙抜きの横枠も突き付けだけにせず、上半分を奥行きの枠へ掛ける。
        // 下半分の木口は内面で止め、溝のような継ぎ目と込栓を室内から見せる推定復元。
        // 開口の外だけへ納め、煙の通りと天井の高さを保つ。
        for (const side of [-1, 1]) {
          const end = side < 0 ? v.x0 : v.x1;
          box(end + side * .0425, y + h - .07, z, .085, .12, .17, DARK, null, 0);
          for (const face of [-1, 1]) box(end - side * .08, y + h - .105,
            z + face * .0875, .035, .035, .015, WOOD);
        }
      }
    }
    // 天井の作り：御殿は竿縁天井（一尺五寸ごとの細い竿縁と回縁）、櫓・天守は上の床を支える根太を見せる
    if (fineIwamura) {
// 天井の作り：御殿は竿縁天井（一尺五寸ごとの細い竿縁と回縁）、櫓・天守は上の床を支える根太を見せる
    if (!I.open) {
      const hole = upSt ? upSt.hole : null, step = ['hondo', 'chudo'].includes(I.kind) ? .75 : goten && !plainCeiling ? .45 : .5;
      // 岩村の堂の室内図は不明。内陣は格天井、外陣は竿縁として用途を分けた推定復元。
      // 間取りの境を使うので、小堂でも格縁が外陣へはみ出さない。
      const templeCeiling = fineIwamura && I.kind === 'hondo';
      // 主殿と侍屋敷は部屋ごとに竿縁を納める推定復元。
      // 奥壁の床の間へ竿縁が突き当たらないよう、奥壁と平行に渡す。
      if (residenceCeiling) for (const room of lv.layout.rooms) {
        const count = Math.max(1, Math.round((room.z1 - room.z0) / .45));
        for (let q = 1; q < count; q++) {
          // 広い主殿でも竿縁を端から端まで一本の材にしない推定復元。
          // 一間以内で継ぎ、隣の竿縁とは継手を半間隔ずらす。回縁の内で止める。
          // 部屋を組む時だけ既存の木材の束へ結合し、描く束と材質は増やさない。
          const left = room.x0 + .1, right = room.x1 - .1;
          const joints = Math.max(1, Math.ceil((right - left) / 1.8));
          const pitch = (right - left) / joints, offset = q % 2 ? .5 : 0;
          const rodZ = room.z0 + q * (room.z1 - room.z0) / count;
          // 床の間は専用の内天井と脇壁で納める。座敷の竿縁をその中へ通さない。
          // 調度と同じ寸法で切り分け、反対向きの床の間でも側壁の手前へ木口を収める。
          let spans = [[left, right]];
          for (const p of lv.layout.props) {
            if (p.part !== 'alcove' || Math.abs(rodZ - p.z) > p.d / 2 + .01) continue;
            const a = p.x - p.w / 2 - .01, b = p.x + p.w / 2 + .01;
            const clipped = [];
            for (const [l, r] of spans) {
              if (b <= l || a >= r) clipped.push([l, r]);
              else {
                if (a > l) clipped.push([l, a]);
                if (b < r) clipped.push([b, r]);
              }
            }
            spans = clipped;
          }
          // 継手は隙間で切らず相欠きとして示す。床の間を避けた各区間は連続した木で受ける。
          for (const [l, r] of spans) {
            box((l + r) / 2, y + h - .025, rodZ, r - l, .05, .035, DARK);
            for (let i = -1; i < joints; i++) {
              const a = Math.max(l, left + (i + offset) * pitch);
              const b = Math.min(r, left + (i + offset + 1) * pitch);
              // 竿縁も材の長手へ木目を通す。床の間の切欠きと継手の手前で止める。
              // 一区間一本に抑え、天井板と同じ色を既存の木材の束へ結合する。
              const grainStart = a + .09, grainEnd = b - .09;
              if (grainEnd > grainStart) box((grainStart + grainEnd) / 2,
                y + h - .0505, rodZ + (q % 2 ? .007 : -.007),
                grainEnd - grainStart, .001, .002, 0x695339);
              if (b - a <= .006 || a <= l + .006) continue;
              box(a, y + h - .0505, rodZ, .003, .001, .035, 0x241b12);
              const lap = Math.min(.06, (b - a) / 2);
              for (const side of [-1, 1]) {
                box(a + lap / 2, y + h - .025, rodZ + side * .018,
                  lap, .002, .001, 0x241b12);
                box(a, y + h - .0375, rodZ + side * .018,
                  .003, .025, .001, 0x241b12);
                box(a + lap, y + h - .0125, rodZ + side * .018,
                  .003, .025, .001, 0x241b12);
              }
            }
          }
        }
      }
      if (templeCeiling) for (const room of lv.layout.rooms) {
        const lattice = room.name === '内陣', pitch = lattice ? .75 : .45;
        // 回縁の内法を等分し、壁際だけ細い格間が残らないようにする。
        // 外陣の竿縁も同じ回縁で受け、板目と直交する向きを保つ。
        const x0 = room.x0 + .12, x1 = room.x1 - .12;
        const z0 = room.z0 + .12, z1 = room.z1 - .12;
        const nx = Math.max(1, Math.round((x1 - x0) / pitch));
        const nz = Math.max(1, Math.round((z1 - z0) / pitch));
        // 格間の鏡板を格縁の上で受ける推定復元。板の継ぎ目を格縁の下へ通さない。
        // 外陣も回縁の内で板割りを止め、内陣へ一枚の板目を通さない。
        // 設営時に既存の室内の束へ結合するので、毎コマの生成や描く束は増えない。
        if (lattice) {
          const cellW = (x1 - x0) / nx, cellD = (z1 - z0) / nz;
          for (let ix = 0; ix < nx; ix++) for (let iz = 0; iz < nz; iz++) {
            // 鏡板の端を格縁の上へ十ミリ掛ける。内面で止めると受け縁ごと
            // 格縁から離れ、格間の中に板が浮く。外周は回縁の内へ納める。
            const a = x0 + ix * cellW - .01, b = x0 + (ix + 1) * cellW + .01;
            const c = z0 + iz * cellD - .01, d = z0 + (iz + 1) * cellD + .01;
            // 鏡板も板幅で割り、線を貼った一枚板にしない推定復元。
            // 上の天井下地を残して目地の奥を塞ぎ、四辺は受け縁の上へ差す。
            // 同じ幅・厚みの箱を既存の束へ結合し、毎コマの処理は増やさない。
            const boards = Math.max(1, Math.round((d - c) / .3));
            const boardD = (d - c) / boards;
            for (let q = 0; q < boards; q++) {
              const back = c + q * boardD + (q ? .002 : 0);
              const front = c + (q + 1) * boardD - (q < boards - 1 ? .002 : 0);
              const shade = (ix + iz + q) % 3;
              box((a + b) / 2, y + h - .002, (back + front) / 2,
                b - a, .02, front - back,
                shade === 0 ? 0x756044 : shade === 1 ? 0x7a6448 : 0x80694c);
              // 岩村の鏡板は無地の色面にせず、長辺へ細い木目を通す推定復元。
              // 板の下面に納め、継ぎ目・四辺の受け縁へ線を突き通さない。
              // 二本だけを既存の木材の束へ結合し、材質と毎コマの処理を増やさない。
              for (const side of [-1, 1]) {
                const left = a + .045 + (shade + (side > 0 ? 1 : 0)) * .012;
                const right = b - .045 - (2 - shade) * .01;
                const grainZ = (back + front) / 2 + side * (front - back) * .2;
                if (right > left && grainZ > c + .025 && grainZ < d - .025)
                  box((left + right) / 2, y + h - .0125, grainZ,
                    right - left, .001, .0025, 0x695339);
              }
            }
            // 鏡板の四辺を細い受け縁で支える推定復元。
            // 格縁より上へ納め、板面を奥へ引いた格間として見せる。
            // 内陣だけに使い、外陣の竿縁天井や格子戸の内法は変えない。
            const rim = .025;
            for (const side of [-1, 1]) {
              box((a + b) / 2, y + h - .021, side < 0 ? c + rim / 2 : d - rim / 2,
                b - a, .018, rim, WOOD);
              box(side < 0 ? a + rim / 2 : b - rim / 2, y + h - .021, (c + d) / 2,
                rim, .018, d - c - rim * 2, WOOD);
            }
          }
        } else {
          const boards = Math.max(1, Math.round((z1 - z0) / .3));
          const boardWidth = (z1 - z0) / boards, rodPitch = (x1 - x0) / nx;
          // 外陣の天井板も竿縁四間隔で継ぐ推定復元。隣の板は二間隔ずらす。
          // 下の竿縁と割付を共有し、幅の広い堂でも一本の長大な板にしない。
          // 既存の室内の束へ組み込み、材質と毎コマの処理は増やさない。
          for (let row = 0; row < boards; row++) {
            const a = z0 + row * boardWidth, b = a + boardWidth;
            for (let span = -1; span * 4 + (row % 2) * 2 < nx; span++) {
              const start = span * 4 + (row % 2) * 2;
              const left = Math.max(x0, x0 + start * rodPitch);
              const right = Math.min(x1, x0 + (start + 4) * rodPitch);
              if (right <= left) continue;
              const shade = (row + span + 3) % 3;
              box((left + right) / 2, y + h - .004, (a + b) / 2,
                right - left - .006, .008, boardWidth - .006,
                shade === 0 ? 0x756044 : shade === 1 ? 0x7a6448 : 0x80694c);
              // 外陣の竿縁天井も板目を長手へ通す。内陣の鏡板と同じ細い木目を使い、
              // 板ごとに端をずらして継手で止める。格縁や板の目地には重ねない。
              for (const side of [-1, 1]) {
                const grainStart = left + .06 + ((row + (side > 0 ? 1 : 0)) % 3) * .015;
                const grainEnd = right - .06 - shade * .015;
                if (grainEnd > grainStart) box((grainStart + grainEnd) / 2,
                  y + h - .0085, (a + b) / 2 + side * boardWidth * .2,
                  grainEnd - grainStart, .001, .0025, 0x695339);
              }
              if (left > x0 + .01) box(left, y + h - .009, (a + b) / 2,
                .006, .002, boardWidth - .006, 0x493525);
            }
          }
          for (let q = 1; q < boards; q++) {
            box((x0 + x1) / 2, y + h - .002, z0 + q * (z1 - z0) / boards,
              x1 - x0, .004, .009, 0x493525);
          }
        }
        for (let q = 1; q < nx; q++) {
          const rodX = x0 + q * (x1 - x0) / nx;
          if (lattice) {
            box(rodX, y + h - .025, (z0 + z1) / 2, .04, .05, z1 - z0 + .08, DARK);
            // 岩村の格縁も材の長手へ木目を通す。三格ごとの継手をまたがず、
            // 交点の相欠きの線と回縁から控えて、既存の木材の束へ結合する。
            // 原形を梁と共有し、材質や毎コマの処理は増やさない。
            iwamuraBeamGrainShape ??= new THREE.BoxGeometry(1, 1, 1);
            const cellD = (z1 - z0) / nz;
            for (let j = 0; j < nz; j++) {
              const a = z0 + j * cellD + .07;
              const b = z0 + (j + 1) * cellD - .07;
              if (b <= a) continue;
              put(iwamuraBeamGrainShape.clone().scale(.002, .001, b - a),
                rodX + ((q + j) % 2 ? .007 : -.007), y + h - .0505,
                (a + b) / 2, 0x695339);
            }
            // 内陣の長い格縁も、交差する横材の上で継ぐ推定復元。
            // 三格ごとの相欠きを下面と側面へ示し、材を貫く隙間は開けない。
            // 格間の割付を共用し、短い小堂には継手を増やさない。
            for (let j = 3; j < nz; j += 3) {
              const jointZ = z0 + j * cellD;
              box(rodX, y + h - .0505, jointZ, .04, .001, .003, 0x241b12);
              for (const side of [-1, 1]) {
                box(rodX + side * .0205, y + h - .025, jointZ + .03,
                  .001, .002, .06, 0x241b12);
                box(rodX + side * .0205, y + h - .0375, jointZ,
                  .001, .025, .003, 0x241b12);
                box(rodX + side * .0205, y + h - .0125, jointZ + .06,
                  .001, .025, .003, 0x241b12);
              }
            }
          } else {
            // 外陣の竿縁も一間以内で継ぐ推定復元。隣の竿縁とは継手をずらす。
            // 回縁に差し込む両端は保ち、内陣の格縁とは作りを分ける。
            const start = z0 - .04, end = z1 + .04;
            const joints = Math.max(1, Math.ceil((end - start) / 1.8));
            const pitch = (end - start) / joints, offset = q % 2 ? .5 : 0;
            // 継手を貫通する隙間にせず、相欠きの重なりを下面と側面へ示す。
            // 回縁に差した両端まで木を通し、設営時の同じ束にまとめる。
            box(rodX, y + h - .025, (start + end) / 2, .04, .05, end - start, DARK);
            for (let i = -1; i < joints; i++) {
              const a = Math.max(start, start + (i + offset) * pitch);
              const b = Math.min(end, start + (i + offset + 1) * pitch);
              // 外陣の竿縁にも長手の木目を残し、鏡板のある内陣とは作りを分ける。
              // 回縁と相欠きの内へ線を通さず、住宅と同じ形・材質の束へ納める。
              const grainStart = a + .09, grainEnd = b - .09;
              if (grainEnd > grainStart) box(rodX + (q % 2 ? .007 : -.007),
                y + h - .0505, (grainStart + grainEnd) / 2,
                .002, .001, grainEnd - grainStart, 0x695339);
              if (b - a <= .006 || a <= start + .006) continue;
              box(rodX, y + h - .0505, a, .04, .001, .003, 0x241b12);
              const lap = Math.min(.06, (b - a) / 2);
              for (const side of [-1, 1]) {
                box(rodX + side * .0205, y + h - .025, a + lap / 2,
                  .001, .002, lap, 0x241b12);
                box(rodX + side * .0205, y + h - .0375, a,
                  .001, .025, .003, 0x241b12);
                box(rodX + side * .0205, y + h - .0125, a + lap,
                  .001, .025, .003, 0x241b12);
              }
            }
          }
        }
        if (lattice) for (let q = 1; q < nz; q++) {
          // 格縁の交点で同じ下面を重ねると、見上げた時にちらつく。
          // 横材を縦材の側面で継ぎ、両端だけ回縁へ差し込む。内陣の既存の束へまとめる。
          const pitch = (x1 - x0) / nx;
          for (let i = 0; i < nx; i++) {
            const a = x0 + i * pitch + (i === 0 ? -.04 : .02);
            const b = x0 + (i + 1) * pitch + (i === nx - 1 ? .04 : -.02);
            box((a + b) / 2, y + h - .025, z0 + q * (z1 - z0) / nz,
              b - a, .05, .04, DARK);
            // 横の格縁も横目にそろえ、縦材の仕口と両端の回縁へ木目を突き通さない。
            // 縦の格縁と同じ原形を使い、交点ごとに短く止める。
            if (b - a > .14) {
              iwamuraBeamGrainShape ??= new THREE.BoxGeometry(1, 1, 1);
              put(iwamuraBeamGrainShape.clone().scale(b - a - .14, .001, .002),
                (a + b) / 2, y + h - .0505,
                z0 + q * (z1 - z0) / nz + ((q + i) % 2 ? .007 : -.007), 0x695339);
            }
          }
          // 内陣の格縁は単なる突付けにせず、交点を相欠きで組む推定復元。
          // 通す縦材は残し、下面の両脇へ横材を受ける仕口の境を示す。
          // 木を切り離さず、細い目地だけを既存の木材の束へ結合する。
          const jointZ = z0 + q * (z1 - z0) / nz;
          for (let i = 1; i < nx; i++) {
            const jointX = x0 + i * pitch;
            for (const side of [-1, 1]) {
              box(jointX + side * .02, y + h - .0505, jointZ,
                .002, .001, .04, 0x241b12);
            }
          }
        }
      }
      // 岩村の用屋と社には座敷の細かな天井縁を付けず、下で組む梁と桁を見せる。
      for (let q = -hw + step; !templeCeiling && !residenceCeiling && !exposedIwamura && q < hw - .1; q += step) {
        if (hole && q > hole.x0 - .05 && q < hole.x1 + .05) continue;
        if (goten && !plainCeiling) box(q, y + h - .015, 0, .035, .035, lv.d - .2, 0x3a2a1c);
        else box(q, y + h - .04, 0, .07, .08, lv.d - .2, 0x2e2216);
      }
      // 堂（本堂・中堂）は格天井：竿縁に直交する格縁を足して、格間を組む
      if (templeCeiling) {
        const boundary = lv.layout.portals[0]?.z;
        if (boundary != null) box(0, y + h - .04, boundary, lv.w - .2, .08, .08, DARK);
      } else if (['hondo', 'chudo'].includes(I.kind)) for (let q = -hd + .75; q < hd - .1; q += .75) box(0, y + h - .02, q, lv.w - .2, .05, .05, 0x2a1c12);
      if (residenceCeiling || templeCeiling) {
        // 間仕切りの上でも回縁で天井を受け、内陣・外陣と各座敷の境をそろえる。
        // 主殿・侍屋敷は一間以内、堂は二間以内の材で回縁を継ぐ推定復元。
        // 継手は突付けの隙間にせず、相欠きの境を下面と内側面にだけ示す。
        // 元の回縁を下地として残し、天井裏が透ける穴や通行の当たりは増やさない。
        // 岩村の床の間は専用の内天井と脇壁を持つため、回縁もその外で止める。
        // 天井板と同じ切欠きを使い、床柱・落とし掛けを貫く横木や宙に残る継手を除く。
        // 既存の木材の束へ組み込み、毎コマの処理と描く束は増やさない。
        const ceilingRail = (cx, cz, length, alongX) => {
          ceilingBoard(cx, y + h - .05, cz, alongX ? length : .08, .08, alongX ? .08 : length, DARK);
          // 堂の回縁も壁の端まで一本の長大な材にせず、住宅と同じ相欠きで納める。
          // 堂は長めの材を使い、既存の木材の束に継手だけを加える。
          const count = Math.max(1, Math.ceil(length / (templeCeiling ? 3.6 : 1.8)));
          for (let j = 1; j < count; j++) {
            const joint = -length / 2 + j * length / count;
            const x = cx + (alongX ? joint : 0), z = cz + (alongX ? 0 : joint);
            ceilingBoard(x, y + h - .0905, z, alongX ? .004 : .08, .001, alongX ? .08 : .004, 0x241b12);
            // 木口の線を上下でずらし、相欠きの重なりを示す。
            for (const side of [-1, 1]) {
              ceilingBoard(x + (alongX ? .04 : side * .0405), y + h - .07,
                z + (alongX ? side * .0405 : .04), alongX ? .08 : .001, .002, alongX ? .001 : .08, 0x241b12);
              for (const end of [0, 1]) {
                ceilingBoard(x + (alongX ? end * .08 : side * .0405), y + h - (end ? .05 : .08),
                  z + (alongX ? side * .0405 : end * .08), alongX ? .003 : .001,
                  end ? .04 : .02, alongX ? .001 : .003, 0x241b12);
              }
            }
          }
        };
        for (const room of lv.layout.rooms) for (const sd of [-1, 1]) {
          ceilingRail((room.x0 + room.x1) / 2, (sd < 0 ? room.z0 : room.z1) - sd * .08,
            room.x1 - room.x0 - .16, true);
          // 縦の回縁は横材の内面で止める。隅で同じ下面を重ねず、ちらつきを防ぐ。
          ceilingRail((sd < 0 ? room.x0 : room.x1) - sd * .08, (room.z0 + room.z1) / 2,
            room.z1 - room.z0 - .24, false);
        }
      } else if (goten) { for (const sd of [-1, 1]) { box(0, y + h - .05, sd * (hd - .16), lv.w - .2, .08, .08, DARK); box(sd * (hw - .16), y + h - .05, 0, .08, .08, lv.d - .2, DARK); } }
    }
    for (const st of lv.firingSteps) box(st.x, st.y - .05, st.z, st.w, .1, st.d, DARK);
    // 岩村の板割りと千鳥の継手は専用の板床が持つ。目地を二重に載せない。
    if (!fineIwamura) for (const [x0, x1, z0, z1] of lv.pieces) for (let q = -hw + .9; q < x1 - .02; q += .9) if (q > x0 + .02) box(q, y + .002, (z0 + z1) / 2, .02, .006, z1 - z0, 0x4a3828);


    }
if (nodaJoinery) {
    if (!I.open) {
      const hole = ceilingHole, step = ['hondo', 'chudo'].includes(I.kind) ? .75 : goten && !plainCeiling ? .45 : .5;
      for (let q = -hw + step; q < hw - .1; q += step) {
        if (nodaHall || soboCeiling || fortCeiling || utilityCeiling) continue;
        if (upSt && q > hole.x0 - .05 && q < hole.x1 + .05) continue;
        if (goten && !plainCeiling) box(q, y + h - .015, 0, .035, .035, lv.d - .2, 0x3a2a1c);
        else if (!kuriCeiling) for (const [z0, z1] of smokeSpans(-hd + .1, hd - .1, q, false, .035))
          box(q, y + h - .04, (z0 + z1) / 2, .07, .08, z1 - z0, 0x2e2216);
      }
      // 庫裏・僧坊・砦の用屋・民家は部屋ごとの天井。土間と板間は根太と梁を見せる。
      // 襖・障子の境で竿縁を切り、板敷きの入口も独立した回縁で納める。
      if (kuriCeiling || soboCeiling || fortCeiling || utilityCeiling) for (const r of lv.layout.rooms) {
        // 詰所でも入口の板間は座敷の竿縁にせず、根太と梁を見せる。
        const fine = r.floor === 'tatami', step = fine ? .45 : .5;
        const x0 = r.x0 + .1, x1 = r.x1 - .1, z0 = r.z0 + .1, z1 = r.z1 - .1;
        const saoEnds = [], joistEnds = [[], []];
        if (fine) {
          // 厚さ十八ミリの天井板の下面へ竿縁を当てる。
          // 板へ埋めず、三十五ミリ角の木口を回縁まで見せる。
          // 芯だけで判定すると、端の竿縁が回縁へ食い込む。
          // 両側の材幅まで内面へ納め、端の板は回縁で受ける。
          for (let q = r.x0 + step; q + .0175 < x1 - .04; q += step) {
            for (const [a, b] of smokeSpans(z0 + .04, z1 - .04, q, false, .0175))
              box(q, y + h - .018 - .035 / 2, (a + b) / 2, .035, .035, b - a, DARK);
            // 竿縁の木口を回縁へ突き付けるだけにせず、上半分を四センチ掛ける推定復元。
            // 座敷の回縁側も同じ幅だけ欠き、重なる面や浮いた木口を残さない。
            saoEnds.push(q);
            for (const side of [-1, 1]) box(q, y + h - .018 - .0175 / 2,
              side < 0 ? z0 + .02 : z1 - .02, .035, .0175, .04, DARK);
          }
        } else {
          // 板間・土間の根太は奥行き方向の梁へ直交させる。
          // 同じ向きに重ねず梁の上で受け、煙抜きの四周の受け材で切り口を支える。
          // 根太も七センチの幅まで回縁の内側へ収める。
          // 部屋の端に近い一本を重ねず、同じ高さの面のちらつきを防ぐ。
          for (let q = r.z0 + step; q + .035 < z1 - .04; q += step)
            for (const [a, b] of smokeSpans(x0 + .04, x1 - .04, q, true, .035)) {
              // 板厚十八ミリの下面で受け、根太の上端を板へ埋めない。
              box((a + b) / 2, y + h - .018 - .04, q, b - a, .08, .07, 0x2e2216);
              // 根太も突き付けだけにせず、上半分を回縁へ四センチ掛ける推定復元。
              // 煙抜きで切れた端には足さず、実際に回縁へ届く端だけを記録する。
              for (const side of [-1, 1]) {
                const end = side < 0 ? a : b, edge = side < 0 ? x0 + .04 : x1 - .04;
                if (Math.abs(end - edge) > .001) continue;
                box(end + side * .02, y + h - .018 - .02, q,
                  .04, .04, .07, 0x2e2216, null, 0);
                joistEnds[side < 0 ? 0 : 1].push(q);
              }
            }
        }
        // 根太と竿縁の下半分は回縁の内面で止め、上半分だけ掛ける。
        // 前後の回縁を通し、左右の木口はその内面で止める。
        // 四隅で同じ面の木を重ねず、見上げた時のちらつきを防ぐ。
        const rimY = y + h - .018 - .08 / 2;
        for (const z of [z0, z1]) {
          if (!fine) {
            box((x0 + x1) / 2, rimY, z, x1 - x0 + .08, .08, .08, DARK);
            continue;
          }
          const inside = z === z0 ? 1 : -1, left = x0 - .04, right = x1 + .04;
          // 外側半分と下側は通し、室内側の上半分だけ竿縁の掛かりを受ける。
          box((left + right) / 2, rimY, z - inside * .02, right - left, .08, .04, DARK);
          box((left + right) / 2, y + h - .018 - .0175 - .0625 / 2,
            z + inside * .02, right - left, .0625, .04, DARK);
          let edge = left;
          for (const q of saoEnds) {
            box((edge + q - .0175) / 2, y + h - .018 - .0175 / 2,
              z + inside * .02, q - .0175 - edge, .0175, .04, DARK);
            edge = q + .0175;
          }
          box((edge + right) / 2, y + h - .018 - .0175 / 2,
            z + inside * .02, right - edge, .0175, .04, DARK);
        }
        // 庫裏も左右を回縁で納め、根太の端を壁へ突き付けない。
        for (const x of [x0, x1]) {
          if (fine) {
            box(x, rimY, (z0 + z1) / 2, .08, .08, z1 - z0 - .08, DARK);
            continue;
          }
          // 根太の掛かりと同じ幅で内側の上半分だけを欠く。
          // 外側と下側を通し、材を重ねずに木口を支える。既存の箱の束へ納める。
          const inside = x === x0 ? 1 : -1, back = z0 + .04, front = z1 - .04;
          box(x - inside * .02, rimY, (back + front) / 2, .04, .08, front - back, DARK);
          box(x + inside * .02, y + h - .018 - .06, (back + front) / 2,
            .04, .04, front - back, DARK);
          let edge = back;
          for (const q of joistEnds[x === x0 ? 0 : 1]) {
            box(x + inside * .02, y + h - .018 - .02, (edge + q - .035) / 2,
              .04, .04, q - .035 - edge, DARK);
            edge = q + .035;
          }
          box(x + inside * .02, y + h - .018 - .02, (edge + front) / 2,
            .04, .04, front - edge, DARK);
        }
      }
      // 御影堂の室内図は不明。内陣は格天井、畳の外陣は竿縁天井とする推定復元。
      // 部屋ごとに回縁で納め、格縁を内陣の境から外陣へ突き抜けさせない。
      if (nodaHall) for (const r of lv.layout.rooms) {
        const x0 = r.x0 + .16, x1 = r.x1 - .16, z0 = r.z0 + .16, z1 = r.z1 - .16;
        const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, rw = x1 - x0, rd = z1 - z0;
        const coffer = r.floor === 'boards', spacing = coffer ? .75 : .45;
        const nx = Math.max(1, Math.round(rw / spacing)), nz = Math.max(1, Math.round(rd / .75));
        // 相欠きの木口には一ミリの逃げを残す。交点の裏半分は通し、
        // 継ぎ目を天井裏へ抜かず、縦横が一体の板に見えるのを防ぐ。
        const cofferJoint = .001;
        const saoEnds = [];
        for (let i = 1; i < nx; i++) {
          const x = x0 + rw * i / nx;
          if (!coffer) {
            // 外陣も座敷と同じ板厚の下で竿縁を受ける。
            box(x, y + h - .018 - .035 / 2, cz, .035, .035, rd - .08, DARK);
            // 木口は回縁へ上半分を四センチ掛ける推定復元。
            // 下半分は内面で止め、回縁側にも同じ幅の欠きを設ける。
            saoEnds.push(x);
            for (const side of [-1, 1]) box(x, y + h - .018 - .0175 / 2,
              side < 0 ? z0 + .02 : z1 - .02, .035, .0175, .04, DARK);
            continue;
          }
          // 格縁の交点は相欠きで組む推定復元。縦材は下半分を通し、
          // 上半分は横材の幅だけ欠く。回縁の内面で木口を止める。
          box(x, y + h - .06, cz, .08, .04, rd - .08, DARK);
          for (let j = 0; j < nz; j++) {
            const back = z0 + rd * j / nz + .04 + (j ? cofferJoint : 0);
            const front = z0 + rd * (j + 1) / nz - .04 - (j + 1 < nz ? cofferJoint : 0);
            box(x, y + h - .02, (back + front) / 2, .08, .04, front - back, DARK);
          }
          // 格縁の木口も回縁へ四センチ掛ける。下半分は内面で止め、
          // 上半分だけ回縁の欠きへ納める推定復元。
          for (const side of [-1, 1]) box(x, y + h - .02,
            side < 0 ? z0 + .02 : z1 - .02, .08, .04, .04, DARK);
        }
        if (coffer) {
          // 横材は上半分を通し、下半分を縦材へ掛ける。交点に同じ面を
          // 重ねず、元の八センチ角・格間の寸法を保つ。生成時だけ束ねる。
          for (let j = 1; j < nz; j++) {
            const z = z0 + rd * j / nz;
            box(cx, y + h - .02, z, rw - .08, .04, .08, DARK);
            for (const side of [-1, 1]) box(side < 0 ? x0 + .02 : x1 - .02,
              y + h - .02, z, .04, .04, .08, DARK);
            for (let i = 0; i < nx; i++) {
              const left = x0 + rw * i / nx + .04 + (i ? cofferJoint : 0);
              const right = x0 + rw * (i + 1) / nx - .04 - (i + 1 < nx ? cofferJoint : 0);
              box((left + right) / 2, y + h - .06, z, right - left, .04, .08, DARK);
            }
          }
          // 格間の鏡板も板幅で割る推定復元。格縁の内側だけへ納め、
          // 外陣の竿縁天井と同じく板の継ぎ目を見せる。
          // 内装の生成時に既存の箱の束へ加え、材質と描画回数は増やさない。
          for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
            const cx = x0 + rw * (i + .5) / nx, cz = z0 + rd * (j + .5) / nz;
            const pw = rw / nx - .08, pd = rd / nz - .08;
            // 鏡板も上六ミリを目地の裏へ通す。格縁の内側だけを覆い、
            // 板の継ぎ目を空へ抜ける穴にせず、元の十八ミリ厚へ収める。
            box(cx, y + h - .003, cz, pw, .006, pd, 0x80664a);
            // 一枚板へ黒い線を貼らず、板厚まで分かれた目地にする。
            // 板の両端は左右の押縁に掛け、目地の奥には天井下地が見える。
            // 表の板と裏の掛かりは同じ材質で束ね、毎コマの処理を増やさない。
            // 九ミリの割れ目は板が離れて見えるため、継ぎ目は二ミリにする。
            // 格縁との境にも二ミリの逃げを取り、木口を密着させない。
            // 逃げは二十五ミリの押縁の上へ隠し、六ミリの裏板で塞ぐ。
            const clearance = .002, faceD = pd - clearance * 2;
            const boards = Math.max(1, Math.ceil(faceD / .3)), boardD = faceD / boards, joint = .002;
            for (let b = 0; b < boards; b++) {
              const back = cz - faceD / 2 + boardD * b + (b ? joint / 2 : 0);
              const front = cz - faceD / 2 + boardD * (b + 1) - (b + 1 < boards ? joint / 2 : 0);
              const g = ceilingBoard(cx - pw / 2 + clearance, cx + pw / 2 - clearance, back, front,
                y + h - .012, false, 0x80664a);
              g.rotateY(I.rot); g.translate(I.x, 0, I.z); list.push(g);
            }
            // 鏡板の四周を細い押縁で受ける推定復元。格縁との隙間へ
            // 板の木口を露出させず、押縁の四隅も重ねない。
            // 格縁の内面へ納め、既存の箱の束と木の材質を使う。
            const trim = .025;
            for (const side of [-1, 1]) {
              box(cx, y + h - .028, cz + side * (pd - trim) / 2,
                pw, .02, trim, WOOD);
              box(cx + side * (pw - trim) / 2, y + h - .028, cz,
                trim, .02, pd - trim * 2, WOOD);
            }
          }
        }
        const rimY = y + h - (coffer ? .05 : .018 + .1 / 2);
        // 内陣の回縁は一枚の角材へ格縁を突き付けず、掛かりと同じ幅で
        // 室内側の上四センチを欠く。外側と下側は通し、接合面の重なりを避ける。
        // 形は生成時に既存の木材の束へまとめ、毎コマの処理は増やさない。
        const cofferRim = (alongX, off, lo, hi, inside, origin, span, count) => {
          const member = (a, b, across, height, yy, depth) => {
            if (b - a <= .001) return;
            box(alongX ? (a + b) / 2 : across, yy, alongX ? across : (a + b) / 2,
              alongX ? b - a : depth, height, alongX ? depth : b - a, DARK);
          };
          member(lo, hi, off - inside * .02, .1, rimY, .04);
          member(lo, hi, off + inside * .02, .06, y + h - .07, .04);
          let edge = lo;
          for (let i = 1; i < count; i++) {
            const q = origin + span * i / count;
            member(edge, q - .04, off + inside * .02, .04, y + h - .02, .04);
            edge = q + .04;
          }
          member(edge, hi, off + inside * .02, .04, y + h - .02, .04);
        };
        for (const z of [z0, z1]) {
          if (coffer) {
            cofferRim(true, z, x0 - .04, x1 + .04, z === z0 ? 1 : -1, x0, rw, nx);
            continue;
          }
          // 外陣の回縁は外側と下側を通し、室内側の上半分だけ欠く。
          // 掛けた竿縁と同じ面を重ねず、木口を受ける木組みにする。
          const inside = z === z0 ? 1 : -1, left = x0 - .04, right = x1 + .04;
          box(cx, rimY, z - inside * .02, rw + .08, .1, .04, DARK);
          box(cx, y + h - .018 - .0175 - .0825 / 2,
            z + inside * .02, rw + .08, .0825, .04, DARK);
          let edge = left;
          for (const x of saoEnds) {
            box((edge + x - .0175) / 2, y + h - .018 - .0175 / 2,
              z + inside * .02, x - .0175 - edge, .0175, .04, DARK);
            edge = x + .0175;
          }
          box((edge + right) / 2, y + h - .018 - .0175 / 2,
            z + inside * .02, right - edge, .0175, .04, DARK);
        }
        // 内陣・外陣も通し材の内面へ突き付け、四隅の上下面を重ねない。
        for (const x of [x0, x1]) {
          if (coffer) cofferRim(false, x, z0 + .04, z1 - .04, x === x0 ? 1 : -1, z0, rd, nz);
          else box(x, rimY, cz, .08, .1, rd - .08, DARK);
        }
      }
      if (nodaHall) {
        // 内陣・外陣の独立柱も壁際の柱列へ横木でつなぐ推定復元。
        // 同じ柱筋には一組だけ。長押は柱の両面へ添え、柱頭の桁で天井を受ける。
        // 室内生成時に既存の箱の束へ加え、戸口と頭上の通りは空ける。
        // 格縁の下面は天井から八センチ下。横桁の上端もここで止め、
        // 柱頭の受け（下面は天井から二十七センチ下）との接続を保つ。
        // 外陣の竿縁より低い内陣の格縁へ、横桁を三センチ突き通さない。
        const beamTop = y + h - .08, beamBottom = y + h - .27;
        const rows = new Set();
        for (const p of lv.layout.props) {
          if (p.part !== 'hallPost' || rows.has(p.z)) continue;
          rows.add(p.z);
          const length = lv.w - .32, nageshi = nodaNageshiHeight(I.kind, h);
          // 桁は柱頭へ掛け、長押の木口だけ外周の長押の内面で止める。
          // 側壁を回る長押と同じ場所へ材を重ねない。
          for (const side of [-1, 1]) box(0, y + nageshi, p.z + side * (p.d * .375 + .05),
            lv.w - .66, .12, .1, DARK);
          // 壁から壁まで一本の角材にせず、柱頭の上で上下を掛けて継ぐ推定復元。
          // 継ぎ目を柱のない所へ置かず、元の桁の外寸と頭上の通りを保つ。
          const joints = lv.layout.props.filter(q => q.part === 'hallPost' && q.z === p.z)
            .map(q => q.x).sort((a, b) => a - b);
          const mid = (beamTop + beamBottom) / 2, halfH = (beamTop - beamBottom) / 2;
          for (const upper of [false, true]) {
            let left = -length / 2;
            for (let j = 0; j <= joints.length; j++) {
              const end = j < joints.length ? joints[j] + (upper ? .12 : -.12) : length / 2;
              const right = end - (j < joints.length ? .002 : 0);
              box((left + right) / 2, upper ? mid + halfH / 2 : mid - halfH / 2,
                p.z, right - left, halfH, .2, DARK);
              left = end + .002;
            }
          }
          // 継いだ材を留める込栓も桁の側面へ納め、同じ箱と材質へ束ねる。
          for (const x of joints) for (const side of [-1, 1])
            box(x, mid, p.z + side * .102, .028, .028, .004, WOOD);
        }
        // 奥行き方向も同じ柱筋の桁で結び、内陣の格天井を壁だけで支えない。
        // 天井の上へ納め、格子戸の欄間や天蓋の吊り材へ突き通さない。
        const columns = new Set();
        for (const p of lv.layout.props) {
          if (p.part !== 'hallPost' || columns.has(p.x)) continue;
          columns.add(p.x);
          // 奥行きの桁は板天井の上へ納める。下面を横桁の高さにすると、
          // 内陣の鏡板・格縁と外陣の天井板を八センチ貫通してしまう。
          // 柱筋の交点だけ短い受け木でつなぎ、柱間の天井面を保つ推定復元。
          // 既存の箱と材質へ束ね、毎コマの処理は増やさない。
          const girderBottom = y + h;
          box(p.x, girderBottom + .13, 0, .24, .26, lv.d - .32, DARK);
          for (const q of lv.layout.props) {
            if (q.part !== 'hallPost' || q.x !== p.x) continue;
            box(p.x, (beamTop + girderBottom) / 2, q.z,
              .24, girderBottom - beamTop, .2, DARK);
          }
          // 奥行きの柱筋にも両面の長押を添える推定復元。
          // 横方向と同じ高さで柱をつなぎ、室内からも木組みの連続が見えるようにする。
          // 欄間の上に収め、格子戸の引き代と須弥壇の天蓋は空ける。
          const nageshi = nodaNageshiHeight(I.kind, h);
          // 横方向の長押と一枚の面を重ねると、交点の上下面がちらつく。
          // 柱筋と格子戸上の横材の側面で木口を止め、通し材へ突き付ける。
          // 室内生成時だけ切り分け、形・材質と既存の結合処理を共用する。
          let spans = [[-hd + .33, hd - .33]];
          const joints = [];
          for (const q of lv.layout.props) if (q.part === 'hallPost' && q.x === p.x)
            for (const side of [-1, 1]) joints.push([q.z + side * (q.d * .375 + .05), .05]);
          for (const portal of lv.layout.portals)
            for (const side of [-1, 1]) joints.push([portal.z + side * .13, .05]);
          for (const [z, half] of joints) spans = spans.flatMap(([a, b]) => {
            if (z + half <= a || z - half >= b) return [[a, b]];
            return [[a, Math.max(a, z - half)], [Math.min(b, z + half), b]]
              .filter(([left, right]) => right - left > .001);
          });
          for (const side of [-1, 1]) for (const [a, b] of spans)
            box(p.x + side * (p.w * .375 + .05), y + nageshi, (a + b) / 2,
              .1, .12, b - a, DARK);
          // 奥行きの長押も独立柱へ留める推定復元。横材との切り欠きの
          // 間に残る材だけへ釘隠しを付け、空所へ金具を浮かせない。
          // 横方向と同じ寸法・材質で室内の束へ加える。
          for (const q of lv.layout.props) {
            if (q.part !== 'hallPost' || q.x !== p.x
              || !spans.some(([a, b]) => q.z - .03 >= a && q.z + .03 <= b)) continue;
            for (const side of [-1, 1]) box(q.x + side * (q.w * .375 + .106),
              y + nageshi, q.z, .012, .06, .06, 0x302b24);
          }
        }
        // 外周と間仕切りだけでなく、堂内の独立柱でも長押の留め位置を示す。
        // 意匠は不明なので無紋の釘隠しとし、柱を挟む横方向の通し材へ添える推定復元。
        // 奥行き材は上で切り欠きの間の実材を確かめ、横方向とは別に留める。
        // 既存の箱と結合処理を使い、室内を作る時だけ組み立てる。
        for (const p of lv.layout.props) {
          if (p.part !== 'hallPost') continue;
          const nageshi = nodaNageshiHeight(I.kind, h);
          for (const side of [-1, 1]) {
            box(p.x, y + nageshi, p.z + side * (p.d * .375 + .106),
              .06, .06, .012, 0x302b24);
          }
        }
      }
      // ほかの戦の堂は従来の格天井を保つ。
      if (!nodaHall && ['hondo', 'chudo'].includes(I.kind)) for (let q = -hd + .75; q < hd - .1; q += .75) box(0, y + h - .02, q, lv.w - .2, .05, .05, 0x2a1c12);
      // 野田福島の堂・座敷・用屋は上で部屋ごとの回縁を組んである。
      // 建物全体の回縁を重ねると同じ高さの面がちらつき、二重の木口も見える。
      // 間仕切りで納めた木組みを使い、従来の回縁はほかの建物だけに残す。
      if (goten && !nodaHall && !kuriCeiling && !soboCeiling && !fortCeiling && !utilityCeiling) {
        for (const sd of [-1, 1]) {
          box(0, y + h - .05, sd * (hd - .16), lv.w - .2, .08, .08, DARK);
          box(sd * (hw - .16), y + h - .05, 0, .08, .08, lv.d - .2, DARK);
        }
      }
    }
    for (const st of lv.firingSteps) box(st.x, st.y - .05, st.z, st.w, .1, st.d, DARK);
    // 野田福島の高は部屋別の板幅・炉・柱の切り欠きに合わせた目地を使う。
    // 建物全体を横切る目地を重ねず、畳と土間にも板の線を足さない。
    if (!nodaJoinery) for (const [x0, x1, z0, z1] of lv.pieces) for (let q = -hw + .9; q < x1 - .02; q += .9) if (q > x0 + .02) box(q, y + .002, (z0 + z1) / 2, .02, .006, z1 - z0, 0x4a3828);

    }
    } else {
    // 設楽原の民家は奥の座敷だけ竿縁天井。板間と土間は梁を見せる推定復元。
    if (!I.open && !toride && !moribeCeiling && !I.profile?.startsWith('honnoji_')) {
      // 炉のある板間と土間まで平天井で塞がない。茅屋根は既存の外観を使い、梁の上を小屋裏へ開く。
      // 座敷の天井板は下の竿縁・回縁に合わせて張る。一枚の平板と目地の重ね描きにしない。
      const ceiling = parlor ? []
        : rectMinus(hw, hd, upSt ? upSt.hole : null);
      if (villageHall) {
        // 小堂の裏板も一尺ほどの幅へ割る推定の納まり。一枚の平板で堂全体を覆わず、
        // 内陣境で板を切り、外周の柱頭の内側へ収める。格間の板との高さは保つ。
        // 上二センチは相欠きの重なりを表し、下四センチの目地から屋根へ光を抜かない。
        // 同寸の板と木目は共用し、近づいた時だけ既存の天井の束へまとめる。
        const left = -hw + .08, right = hw - .08;
        const cols = Math.max(1, Math.ceil((right - left) / 1.8));
        const width = (right - left) / cols, joint = .003;
        const colors = [0x7a6448, 0x756044, 0x80694c];
        for (const room of lv.layout.rooms) {
          const back = Math.max(-hd + .08, room.z0), front = Math.min(hd - .08, room.z1);
          const rows = Math.max(1, Math.ceil((front - back) / .3)), depth = (front - back) / rows;
          for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
            const x = left + (col + .5) * width, z = back + (row + .5) * depth;
            const color = colors[(row + col) % colors.length];
            const board = templeCeilingBoard(width - joint, depth - joint, color, .04);
            board.position.set(x, y + h + .06, z); ceilingBoards.add(board);
            const lap = templeCeilingBoard(width, depth, color, .02);
            lap.position.set(x, y + h + .09, z); ceilingBoards.add(lap);
          }
        }
      } else for (const [x0, x1, z0, z1] of ceiling)
        box((x0 + x1) / 2, y + h + .03, (z0 + z1) / 2, x1 - x0, .06, z1 - z0, goten ? 0x7a6448 : DARK);
    }
    if (I.profile === 'inabayama') {
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
              mainCeilingBoard(x0 + (i + .5) * width, y + h + .001, (near + far) / 2,
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
      const hole = upSt ? upSt.hole : null, step = coffered ? .75 : goten && !plainCeiling ? .45 : .5;
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
                mainCeilingBoard(left + (width - joint) / 2, y + h - .006, z0 + (j + .5) * cd,
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
                mainCeilingBoard(across ? v : center, y + h + .001, across ? center : v,
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
    } else if (I.profile?.startsWith('honnoji_')) {
    const boardCeiling = !upSt && ['honnoji_sobo', 'honnoji_hojo', 'honnoji_kyakuden', 'honnoji_nijo', 'honnoji_kodo', 'honnoji_soshido'].includes(I.profile);
    // 板天井の裏の面は板厚ぶん上へ逃がし、板の下面と重ねない。
    if (!I.open && !(honnojiUtility && !upSt)) for (const [x0, x1, z0, z1] of rectMinus(hw, hd, upSt ? upSt.hole : smoke)) box((x0 + x1) / 2, y + h + .03 + (boardCeiling ? .024 : 0), (z0 + z1) / 2, x1 - x0, .06, z1 - z0, goten ? 0x7a6448 : DARK);
    // 竿縁に直交する杉板を張る。隣の板では継ぐ竿縁を二本ずらす推定の納まり。
    // 周囲は回縁の上へ掛け、板の下面を竿縁の上面へ当てる。設営時だけ既存の木部へ結合する。
    const ceilingBoards = (r, rodsAlongX, rodPitch) => {
      const width = rodsAlongX ? r.x1 - r.x0 : r.z1 - r.z0;
      const length = rodsAlongX ? r.z1 - r.z0 : r.x1 - r.x0;
      const inset = .09, gap = .002, bearing = .015;
      // 回縁の内側を均等に割り、端の細い板を省いて下地が見える隙間を残さない。
      // 継ぎ目は実際の竿縁の芯へ合わせる。部屋ごとの等間隔を固定の四十五センチへ戻さない。
      // 隣の板は二本分ずらし、板同士だけ二ミリの目透かしを取る（割付は推定）。
      const rows = Math.max(1, Math.ceil((width - inset * 2) / .3));
      const pitch = (width - inset * 2) / rows;
      for (let row = 0; row < rows; row++) {
        // 周囲の板端は回縁の上へ一・五センチ掛ける。内面で突き付けるだけにしない。
        // 格天井と同じ掛かり代を取り、板同士の目透かしと床の間の切り欠きは保つ（納まりは推定）。
        const a = inset + row * pitch + (row ? gap / 2 : -bearing);
        const b = inset + (row + 1) * pitch - (row < rows - 1 ? gap / 2 : -bearing);
        let start = inset;
        for (let joint = row % 2 ? 2 : 4; ; joint += 4) {
          const end = Math.min(length - inset, inset + joint * rodPitch);
          const near = start + (start > inset ? gap / 2 : -bearing);
          const far = end - (end < length - inset ? gap / 2 : -bearing);
          const color = row % 3 === 0 ? 0x765d3e : 0x7a6448;
          if (far > near) {
            const bounds = rodsAlongX
              ? [r.x0 + a, r.x0 + b, r.z0 + near, r.z0 + far]
              : [r.x0 + near, r.x0 + far, r.z0 + a, r.z0 + b];
            for (const [x0, x1, z0, z1] of honnojiCeilingPieces(lv.layout, ...bounds))
              box((x0 + x1) / 2, y + h + .012, (z0 + z1) / 2, x1 - x0, .024, z1 - z0, color);
          }
          if (end >= length - inset) break;
          start = end;
        }
      }
    };
    if (!I.open && smoke) {
      const cx = (smoke.x0 + smoke.x1) / 2, cz = (smoke.z0 + smoke.z1) / 2;
      const w = smoke.x1 - smoke.x0, d = smoke.z1 - smoke.z0;
      // 煙抜きの受け材も梁と同じ高さにし、上面で天井板の端を支える。
      for (const x of [smoke.x0 - .09, smoke.x1 + .09]) box(x, y + h - .12, cz, .18, .24, d + .36, DARK);
      for (const z of [smoke.z0 - .09, smoke.z1 + .09]) box(cx, y + h - .12, z, w, .24, .18, DARK);
    }
    // 天井の作り：御殿は竿縁天井（一尺五寸ごとの細い竿縁と回縁）、櫓・天守は上の床を支える根太を見せる
    if (!I.open && !upSt && ['honnoji_kodo', 'honnoji_soshido'].includes(I.profile)) {
      // 講堂・祖師堂は内陣と外陣で格縁を止める。板縁は竿縁とし、堂全体を一枚の格天井にしない。
      for (const r of lv.layout.rooms) {
        const w = r.x1 - r.x0, d = r.z1 - r.z0, cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
        const veranda = I.profile === 'honnoji_kodo' && r === lv.layout.rooms[2];
        // 回縁の厚みを含めて割り付け、壁際も中ほどと同じ格間にする（推定）。
        const { nx, nz, x0: gx0, z0: gz0, gw, gd } = honnojiCeilingGrid(r);
        // 回縁の内面は壁から九センチ。竿縁と板目は内面で止める（納まりは推定）。
        const inset = .09, clearW = w - inset * 2, clearD = d - inset * 2;
        // 南北の回縁を通し、東西の木口はその内面へ納める（仕口は推定）。
        for (const z of [r.z0 + .05, r.z1 - .05]) box(cx, y + h - .04, z, clearW, .08, .08, DARK);
        for (const x of [r.x0 + .05, r.x1 - .05]) box(x, y + h - .04, cz, .08, .08, d, DARK);
        if (veranda) {
          // 板縁も回縁の内側を等分し、板の継ぎ目を受ける竿縁と同じ割付を使う。
          const rodCount = Math.max(0, Math.ceil((clearW + inset - .11) / .45) - 1);
          const rodPitch = clearW / (rodCount + 1);
          for (let q = 1; q <= rodCount; q++)
            box(r.x0 + inset + q * rodPitch, y + h - .025, cz, .035, .05, clearD, DARK);
          ceilingBoards(r, false, rodPitch);
        } else {
          // 南北の格縁を通し、東西の格縁はその側面へ納める推定の組み方。
          // 同じ高さの角材を交差部で重ねず、端の木口も回縁の内面で止める。
          // 部材は従来の天井木部へ設営時にまとめ、描画と毎コマの処理は増やさない。
          for (let i = 1; i < nx; i++) box(gx0 + i * gw, y + h - .025, cz, .06, .05, clearD, DARK);
          for (let j = 1; j < nz; j++) for (let i = 0; i < nx; i++) {
            const left = gx0 + i * gw + .03;
            const right = gx0 + (i + 1) * gw - .03;
            box((left + right) / 2, y + h - .025, gz0 + j * gd, right - left, .05, .06, DARK);
          }
        }
        // 板縁は竿縁の上に厚みのある板を張り、内外陣は格間ごとに納める。
        if (!veranda) {
          for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
            // 杉板の端は格縁・回縁の上面へ一・五センチ掛ける推定の納まり。
            // 木口を側面へ突き付けるだけにせず、下面で木部に載せて支える。
            // 隣の格間の板とは三センチ離れ、下面に見える格縁の幅は変えない。
            const bearing = .015;
            const left = gx0 + i * gw + .03 - bearing;
            const right = gx0 + (i + 1) * gw - .03 + bearing;
            const near = gz0 + j * gd + .03 - bearing;
            const far = gz0 + (j + 1) * gd - .03 + bearing;
            // 継ぎ目の線を板面の下へ浮かせず、厚みのある杉板の間に二ミリの目透かしを取る。
            // 板の下面を格縁の上面、上面を下地の下面へそろえる（納まりは推定）。
            // 箱の数は従来の板と継ぎ目の合計と同じ。既存の木部へ設営時にまとめる。
            const boards = Math.max(1, Math.ceil((right - left) / .25));
            const boardW = (right - left) / boards;
            for (let q = 0; q < boards; q++) {
              const a = left + q * boardW + (q ? .001 : 0);
              const b = left + (q + 1) * boardW - (q < boards - 1 ? .001 : 0);
              box((a + b) / 2, y + h + .012, (near + far) / 2,
                b - a, .024, far - near, q % 2 ? 0x765d3e : 0x7a6448);
            }
          }
        }
      }
    } else if (!I.open && !upSt && ['honnoji_sobo', 'honnoji_hojo', 'honnoji_kyakuden', 'honnoji_nijo'].includes(I.profile)) {
      // 本能寺の座敷・板縁と二条御所は部屋ごとの竿縁天井。間仕切りで止め、各室に回縁を巡らす。
      // 御所の上段・広間・板縁も別々に割り付け、襖や障子の上を一本の竿縁でまたがない（推定）。
      for (const r of lv.layout.rooms) {
        const w = r.x1 - r.x0, d = r.z1 - r.z0, cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
        // 方丈・客殿・二条御所の床の間に竿縁を突き当てず、床框と平行に通す（割付は推定）。
        // 床の間のある座敷だけを選び、隣の座敷と板縁は従来の短辺方向を保つ。
        // 棟の回転前の座標で決めるため、北向きの客殿も同じ納まりになる。
        const alcoves = ['honnoji_hojo', 'honnoji_kyakuden', 'honnoji_nijo'].includes(I.profile)
          ? lv.layout.props.filter(p => p.part === 'alcove'
            && p.x >= r.x0 && p.x <= r.x1 && p.z >= r.z0 && p.z <= r.z1) : [];
        // 床の間へ通る回縁を切り、露出する境だけを共通の割付で受ける。
        for (const [x0, x1, z0, z1] of honnojiCeilingRims(lv.layout, r))
          box((x0 + x1) / 2, y + h - .04, (z0 + z1) / 2, x1 - x0, .08, z1 - z0, DARK);
        const rodsAlongX = alcoves.length > 0 || w < d;
        // 本堂・書院と同じく、竿縁の上面を天井板の下面へ当て、木口を回縁の内面へ納める。
        // 寸法だけを直し、既存の材質別のまとまりと設営時だけの処理を保つ。
        const inset = .09, clearW = w - inset * 2, clearD = d - inset * 2;
        // 壁から四十五センチずつ送ると、端だけ狭い割付になる。
        // 回縁の内面間を等分し、両端にも同じ間隔を残す（割付は推定）。
        // 本数は従来以下とし、床の間の切り欠きと木口の納まりを保つ。
        const span = rodsAlongX ? clearD : clearW;
        const rodCount = Math.max(0, Math.ceil((span + inset - .11) / .45) - 1);
        const pitch = span / (rodCount + 1);
        if (rodsAlongX) {
          for (let q = 1; q <= rodCount; q++) {
            const z = r.z0 + inset + q * pitch;
            // 座敷の竿縁を床の間の側壁・独立した天井へ通さない。
            // 太さも含めて床框の範囲を避け、木口は側壁の外面へ納める（推定）。
            // 設営時だけ分割し、既存の木部と材質へまとめる。
            let spans = [[r.x0 + inset, r.x1 - inset]];
            for (const p of alcoves) {
              if (z + .0175 <= p.z - p.d / 2 || z - .0175 >= p.z + p.d / 2) continue;
              const left = p.x - p.w / 2, right = p.x + p.w / 2;
              spans = spans.flatMap(([a, b]) => right <= a || left >= b ? [[a, b]]
                : [[a, Math.max(a, left)], [Math.min(b, right), b]].filter(([l, r]) => r - l > .001));
            }
            for (const [a, b] of spans) box((a + b) / 2, y + h - .02, z, b - a, .04, .035, DARK);
          }
        } else {
          for (let q = 1; q <= rodCount; q++) {
            const x = r.x0 + inset + q * pitch;
            box(x, y + h - .02, cz, .035, .04, clearD, DARK);
          }
        }
        ceilingBoards(r, rodsAlongX, pitch);
      }
    } else if (!I.open && honnojiUtility && !upSt) {
      // 庫裏・板倉・馬舎は見せる梁組。板は短辺へ架けた梁に直交させる（推定）。
      // 一枚の板へ線を貼らず、厚みのある板を梁の上へ載せる。板端は梁の割付へ合わせる。
      // 二ミリの目透かしだけを残し、庫裏の煙抜きも同じ範囲で切り欠く。
      const acrossZ = lv.w >= lv.d, long = acrossZ ? lv.w : lv.d, short = acrossZ ? lv.d : lv.w;
      const rows = Math.max(1, Math.ceil(short / .3)), span = short / rows;
      const beams = Math.max(2, Math.round(long / 1.9));
      // 隣の板は継ぐ梁をずらす。既存の木部へまとめ、描画と毎コマの処理は増やさない。
      for (let row = 0; row < rows; row++) {
        const s = -short / 2 + (row + .5) * span;
        let start = -long / 2;
        for (let q = 1 + row % 2; ; q += 2) {
          const end = q < beams ? -long / 2 + q * long / beams : long / 2;
          const a = start + (start > -long / 2 ? .001 : 0);
          const b = end - (end < long / 2 ? .001 : 0);
          const color = row % 3 === 0 ? 0x765d3e : 0x7a6448;
          if (acrossZ) ceilingBox((a + b) / 2, y + h + .03, s, b - a, .06, span - .002, color);
          else ceilingBox(s, y + h + .03, (a + b) / 2, span - .002, .06, b - a, color);
          // 板厚の中央の実で長手の継ぎ目を塞ぐ（板組は推定）。
          // 二ミリの目地は下面に残し、小屋裏や空を素通しにしない。
          if (q < beams) {
            if (acrossZ) ceilingBox(end, y + h + .03, s, .018, .012, span - .002, DARK);
            else ceilingBox(s, y + h + .03, end, span - .002, .012, .018, DARK);
          }
          if (q >= beams) break;
          start = end;
        }
      }
      // 板の幅方向も同じ実でつなぎ、十字の目地の奥まで塞ぐ。
      // 煙抜きは板と同じ範囲で切り欠き、竈の上を閉じない。
      for (let row = 1; row < rows; row++) {
        const s = -short / 2 + row * span;
        if (acrossZ) ceilingBox(0, y + h + .03, s, long, .012, .018, DARK);
        else ceilingBox(s, y + h + .03, 0, .018, .012, long, DARK);
      }
    }
    } else if (I.profile === 'moribe') {
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
      const hole = upSt ? upSt.hole : null, step = moribeHouse ? ceilingRailPitch : coffered ? .75 : goten && !plainCeiling ? .45 : .5;
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
      } else if (coffered) for (let q = -hd + .75; q < hd - .1; q += .75) box(0, y + h - .02, q, lv.w - .2, .05, .05, 0x2a1c12);
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
    } else if (I.profile === 'hieizan') {
    // 比叡山は堂の格天井と僧坊の竿縁を部屋ごとに組む推定復元。
    // 板は格縁・竿縁の上で受け、回縁の隅と梁の交点は突き付ける。
    // 木目・箱・描画の束を共用し、設営後は更新しない。
    if (!I.open) {
      const hall = ['chudo', 'hondo'].includes(I.kind);
      for (const room of lv.layout.rooms) {
        const x0 = room.x0 + .12, x1 = room.x1 - .12;
        const z0 = room.z0 + .12, z1 = room.z1 - .12;
        if (x1 <= x0 || z1 <= z0) continue;
        const nx = Math.max(1, Math.round((x1 - x0) / (hall ? .75 : .45)));
        const nz = hall ? Math.max(1, Math.round((z1 - z0) / .75)) : 1;
        const dx = (x1 - x0) / nx, dz = (z1 - z0) / nz;
        const rail = hall ? .06 : .035, railH = hall ? .1 : .05;
        // 天井を階段の口へ渡さない。板と受け木は同じ切り欠きを使う。
        const piece = (ax, bx, az, bz, cy, thick, color, alongX, board = false) => {
          for (const [px0, px1, pz0, pz1] of rectMinus(hw, hd, upSt ? upSt.hole : null)) {
            const left = Math.max(ax, px0), right = Math.min(bx, px1);
            const back = Math.max(az, pz0), front = Math.min(bz, pz1);
            if (right <= left || front <= back) continue;
            if (board) {
              const g = ceilingBoard(left, right, back, front, cy, !alongX, color);
              g.scale(1, thick / .012, 1);
              // 板の厚みだけを変え、既に入れた床上の高さは保つ。
              g.translate(0, cy * (1 - thick / .012), 0);
              g.rotateY(I.rot); g.translate(I.x, 0, I.z); list.push(g);
            } else exposedTimber((left + right) / 2, cy, (back + front) / 2,
              right - left, thick, front - back, color, alongX);
          }
        };
        // 回縁の外にも板を延ばし、壁際と部屋境に残る八センチの抜けをふさぐ。
        // 格縁・竿縁の割り付けと高さは保ち、板端だけ回縁の上へ載せる。
        piece(room.x0, room.x1, room.z0, room.z1, y + h + .024, .012, DARK, false, true);
        for (let j = 0; j < nz; j++) {
          const back = j ? z0 + j * dz + rail / 2 : room.z0;
          const front = j + 1 < nz ? z0 + (j + 1) * dz - rail / 2 : room.z1;
          const boards = Math.max(1, Math.round((front - back) / .3));
          for (let q = 0; q < boards; q++) for (let i = 0; i < nx;) {
            // 僧坊は竿縁ごとの短い板を並べず、約一・八メートルの板を張る推定。
            // 隣の列は二本分ずらし、木口を必ず竿縁の芯で受ける。
            // 堂の格間は従来どおり一間ずつ納め、同じ箱と材質へまとめる。
            const end = Math.min(nx, i + (hall ? 1 : i === 0 && q % 2 ? 2 : 4));
            const left = i ? x0 + i * dx + (hall ? rail / 2 : .0015) : room.x0;
            const right = end < nx ? x0 + end * dx - (hall ? rail / 2 : .0015) : room.x1;
            // 突き付けた板の隙間から下地が見えていたため、板厚の半分を
            // 相じゃくりで重ねる推定の納まり。下からの三ミリの目地は残す。
            // 木口は従来の竿縁芯で受け、格縁・回縁の外へ板を出さない。
            // 共通の箱・木目を既存の束へまとめ、開閉や毎コマの処理は増やさない。
            const boardBack = back + (front - back) * q / boards;
            const boardFront = back + (front - back) * (q + 1) / boards;
            for (let layer = 0; layer < 2; layer++) {
              const lap = layer ? .015 : 0;
              piece(left + (!hall && i ? lap : 0),
                right + (!hall && end < nx ? lap : 0),
                boardBack + (q ? lap : 0),
                boardFront - (q + 1 < boards ? .003 : 0) + (q + 1 < boards ? lap : 0),
                y + h + .0045 + layer * .009, .009,
                q % 2 ? 0x7a6348 : 0x80694c, true, true);
            }
            i = end;
          }
        }
        for (let i = 1; i < nx; i++) {
          const left = x0 + i * dx - rail / 2, right = left + rail;
          if (!hall) {
            piece(left, right, z0, z1, y + h - railH / 2, railH, DARK, false);
            continue;
          }
          // 堂の格縁は側面へ突き付けるだけでなく、相欠きで組む推定の納まり。
          // 縦材の下半分を通し、横材の上半分を欠きへ落とす。
          // 外寸と天井板の受け高は保ち、交点で木を二重に重ねない。
          piece(left, right, z0, z1, y + h - railH * .75, railH / 2, DARK, false);
          for (let j = 0; j < nz; j++) {
            piece(left, right, z0 + j * dz + (j ? rail / 2 : 0),
              z0 + (j + 1) * dz - (j + 1 < nz ? rail / 2 : 0),
              y + h - railH / 4, railH / 2, DARK, false);
          }
        }
        if (hall) for (let j = 1; j < nz; j++) {
          const back = z0 + j * dz - rail / 2, front = back + rail;
          piece(x0, x1, back, front, y + h - railH / 4, railH / 2, DARK, true);
          for (let i = 0; i < nx; i++) {
            piece(x0 + i * dx + (i ? rail / 2 : 0), x0 + (i + 1) * dx - (i + 1 < nx ? rail / 2 : 0),
              back, front, y + h - railH * .75, railH / 2, DARK, true);
          }
        }
        for (const x of [x0 - .04, x1 + .04]) piece(x - .04, x + .04, z0 - .08, z1 + .08,
          y + h - .045, .09, DARK, false);
        for (const z of [z0 - .04, z1 + .04]) piece(x0, x1, z - .04, z + .04,
          y + h - .045, .09, DARK, true);
        // 僧坊の板間は梁を見せ、座敷の竿縁だけで広い板裏を支えない。
        if (!hall && room.floor !== 'tatami') {
          for (const z of [z0 + .12, z1 - .12]) piece(x0, x1, z - .07, z + .07,
            y + h - .16, .14, DARK, true);
          for (const x of [x0 + .12, x1 - .12]) piece(x - .06, x + .06, z0 + .19, z1 - .19,
            y + h - .16, .14, DARK, false);
        }
      }
    }
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

    } else {
// 天井の作り：御殿は竿縁天井（一尺五寸ごとの細い竿縁と回縁）、櫓・天守は上の床を支える根太を見せる
    // 天井の作り：御殿は竿縁天井（一尺五寸ごとの細い竿縁と回縁）、櫓・天守は上の床を支える根太を見せる
    if (!I.open && !toride) {
      const hole = upSt ? upSt.hole : null, step = coffered ? .75 : goten && !plainCeiling ? .45 : .5;
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
      if (villageHall) {
        // 推定の格天井は内陣・外陣ごとに納める。間仕切りを跨ぐ格間を作らない。
        // 境の小壁の真上にも回縁を通し、格縁の端を受ける。
        const ceilingColors = [0x7a6448, 0x756044, 0x80694c];
        for (const room of lv.layout.rooms) {
          const x0 = room.x0 + .16, x1 = room.x1 - .16;
          // 外周は壁から離し、内陣と外陣の境は小壁の中心で受ける。
          const z0 = room.z0 + (Math.abs(room.z0 + hd) < .01 ? .16 : 0);
          const z1 = room.z1 - (Math.abs(room.z1 - hd) < .01 ? .16 : 0);
          const cw = x1 - x0, cd = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
          const nx = Math.max(2, Math.round(cw / .75)), nz = Math.max(2, Math.round(cd / .75));
          // 回縁の隅は横木の内側で止める。面を重ねると、下から見た木口がちらつく。
          const backRail = Math.abs(room.z0 + hd) < .01;
          // 内陣境にも隣室と共用する横木がある。外陣側もその内面で止め、
          // 左右の回縁を境の横木へ八センチ突き通さない。
          const railBack = z0 + .04, railFront = z1 - .04;
          // 回縁の上端も格縁・天井板の下面へ合わせる。上端が一センチ低いと、
          // 四周の板端が受け木から浮く。見付けと柱割りは保ち、回縁だけを持ち上げる。
          const rimY = y + h - .04;
          // 回縁と直交する格縁も、それぞれの長手へ木目を通して同じ束へ収める。
          for (const x of [x0, x1]) entryTimber(x, rimY, (railBack + railFront) / 2,
            .08, .08, railFront - railBack, DARK);
          // 境の回縁は内陣側で一度だけ描く。
          if (backRail) entryTimber(cx, rimY, z0, cw + .08, .08, .08, DARK);
          entryTimber(cx, rimY, z1, cw + .08, .08, .08, DARK);
          // 格縁は交点で同じ下面を二重に描かず、直交する木を格間ごとに納める。
          // 回縁の内側まで木口を受け、隣の部屋との境にも重ねない。設営時に既存の束へまとめる。
          const gridBack = z0 + .04, gridFront = z1 - .04;
          for (let j = 1; j < nx; j++) {
            const x = x0 + cw * j / nx;
            entryTimber(x, y + h - .025,
              (gridBack + gridFront) / 2, .05, .05, gridFront - gridBack, DARK);
            // 格縁の木口を回縁へ触れさせるだけにせず、細い枘を二十五ミリ差す推定の仕口。
            // 枘は回縁の内部だけに納め、下面や隣室へ全幅の木を突き出さない。
            // 下から込栓で抜けを留め、既存の木材の束・箱の原形を共用する。
            for (const [edge, side] of [[gridBack, -1], [gridFront, 1]]) {
              const z = edge + side * .0125;
              entryTimber(x, y + h - .02, z, .025, .02, .025, DARK);
              entryTimber(x, y + h - .046, z, .01, .072, .01, 0x95704a);
            }
          }
          for (let j = 1; j < nz; j++) for (let i = 0; i < nx; i++) {
            const a = x0 + cw * i / nx + (i === 0 ? .04 : .025);
            const b = x0 + cw * (i + 1) / nx - (i === nx - 1 ? .04 : .025);
            const z = z0 + cd * j / nz;
            entryTimber((a + b) / 2, y + h - .025, z, b - a, .05, .05, DARK);
            // 横格縁も木口を突き付けるだけにせず、回縁・縦格縁へ細い枘を差して留める推定の仕口。
            // 内部の縦格縁は幅五センチ。左右の枘を二センチずつに止め、交点で重ねない。
            // 込栓は受け材の下面へ揃え、細い格縁から長い釘状の木を垂らさない。
            // 既存の原形・木材の束を使い、戸の動きや毎コマの処理は増やさない。
            for (const [edge, side, outer] of [[a, -1, i === 0], [b, 1, i === nx - 1]]) {
              const depth = outer ? .025 : .02, x = edge + side * depth / 2;
              entryTimber(x, y + h - .02, z, depth, .02, .025, DARK);
              const bottom = outer ? -.082 : -.052, top = -.01;
              entryTimber(x, y + h + (bottom + top) / 2, z,
                .008, top - bottom, .008, 0x95704a);
            }
          }
          // 格縁の上に二枚の天井板を載せ、下面に深さを残す。
          // 板端は格縁へ一センチ掛ける。格間と同じ寸法では木口同士が触れるだけで受けがない。
          // 板の下面も格縁の上端へ合わせ、格縁の横腹へ埋め込まない。
          // 近づいた時に一度だけ既存の天井の束へまとめる。
          const bayW = cw / nx, bayD = cd / nz, joint = .006, bearing = .01;
          for (let ix = 0; ix < nx; ix++) for (let iz = 0; iz < nz; iz++) {
            // 外周の回縁は格縁より幅広い。同じ板寸法を使うと外周だけ掛かりが深くなる。
            // 各格間の受け木の内面から割り、四周とも一センチの掛かりへ揃える。
            const left = x0 + ix * bayW + (ix === 0 ? .04 : .025) - bearing;
            const right = x0 + (ix + 1) * bayW - (ix === nx - 1 ? .04 : .025) + bearing;
            const back = z0 + iz * bayD + (iz === 0 ? .04 : .025) - bearing;
            const front = z0 + (iz + 1) * bayD - (iz === nz - 1 ? .04 : .025) + bearing;
            const boardD = (front - back - joint) / 2;
            // 二枚板の継ぎ目は裏側の桟で受ける推定の納まり。
            // 板の上面へ接して両側に掛け、薄い板の木口だけで支え合う姿にしない。
            // 板の上面は十八ミリ、裏板の下面は四十ミリ。間の二十二ミリへ
            // 桟を納め、裏板へ十二ミリ食い込んでいた重なりをなくす。
            // 桟にも長手の木目を通し、既存の木材と静止した束を共用する。
            const boardTop = .018, backingBottom = .04;
            entryTimber((left + right) / 2, y + h + (boardTop + backingBottom) / 2,
              (back + front) / 2, right - left, backingBottom - boardTop, .08, DARK);
            // 接ぎ目の裏桟だけでは二枚の板が留まらない。板ごとに細い釘で
            // 裏桟へ留める推定の納まり。釘頭だけを板面へ貼らず、軸を板と裏桟へ通す。
            // 釘先は裏板の手前で止め、釘頭は板の下面へ接して格縁には重ねない。
            // 共通の箱と鉄の材質を使い、近づいた時に一度だけ天井の束へまとめる。
            const nailTop = backingBottom - .003;
            for (const x of [left + (right - left) * .22, right - (right - left) * .22])
              for (const side of [-1, 1]) {
                const z = (back + front) / 2 + side * .022;
                box(x, y + h + nailTop / 2, z, .003, nailTop, .003, 0x39362e);
                box(x, y + h - .001, z, .009, .002, .009, 0x39362e);
              }
            for (const side of [-1, 1]) {
              const board = templeCeilingBoard(right - left, boardD,
                ceilingColors[(ix + iz + (side > 0 ? 1 : 0)) % ceilingColors.length]);
              board.position.set((left + right) / 2, y + h + .009,
                (back + front) / 2 + side * (boardD + joint) / 2);
              ceilingBoards.add(board);
            }
          }
        }
      }
      for (let q = -hw + step; !villageHall && !parlor && q < hw - .1; q += step) {
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
        else if (hieiRooms) {
          // 畳の間は細い竿縁、板間・炊事の土間は太い根太で受ける。
          // 回縁の内側の面で竿縁を止める。境の横梁まで突き抜かせない。
          for (const r of lv.layout.rooms) if (r.floor === 'tatami' && q - .0175 > r.x0 + .12 && q + .0175 < r.x1 - .12) {
            const front = ceilingFront(r), back = ceilingBack(r);
            // 竿縁を回縁の側面へ突き合わせるだけにせず、両端を二センチ差し込む。
            // 板の継ぎ目を受ける位置は保ち、回縁の下面に込栓の木口を見せる。
            // 細かな仕口は推定。共通の箱と既存のまとめ描きだけを使う。
            box(q, y + h - .0395, (front + back) / 2, .035, .035, back - front + .04, DARK);
            for (const z of [front - .01, back + .01]) box(q, y + h - .068,
              z, .018, .012, .018, 0x95704a);
          }
        }
        else if (goten && !plainCeiling) box(q, y + h - .015, 0, .035, .035, lv.d - .2, 0x3a2a1c);
        else box(q, y + h - .04, 0, .07, .08, lv.d - .2, 0x2e2216);
      }
      // 堂（本堂・中堂）は格天井：竿縁に直交する格縁を足して、格間を組む
      if (!villageHall && coffered) for (let q = -hd + .75; q < hd - .1; q += .75) box(0, y + h - .02, q, lv.w - .2, .05, .05, 0x2a1c12);
      if (parlor) {
        // 小座敷の四周の回縁を先に決め、竿縁の木口を仕口へ納める。
        // 壁まで貫く竿縁や、隅で突き抜ける回縁にせず、一尺五寸ほどの等間隔で納める。
        const x0 = parlor.x0 + .16, x1 = parlor.x1 - .16;
        // 戸口が裏向きの間取りでも、外壁側は柱芯、間仕切り側は鴨居で受ける。
        const back = parlor.z0 + (ds > 0 ? .16 : .04);
        const front = parlor.z1 - (ds > 0 ? .04 : .16);
        const spans = Math.max(1, Math.round((x1 - x0) / .45));
        // 竿縁の端は回縁へ二センチ差し、下面から釘で留める推定の仕口。
        // 内面へ触れるだけの木口では支えがない。回縁側を欠いて受け、
        // 同じ高さの上面を重ねず、天井板を受ける高さも保つ。
        const rodBack = back + .04, rodFront = front - .04;
        // 小座敷の細い竿縁と四周の回縁にも、天井板と共用の木目を通す。
        const rodXs = [];
        for (let j = 1; j < spans; j++) {
          const x = x0 + (x1 - x0) * j / spans;
          rodXs.push(x);
          entryTimber(x, y + h - .0175, (rodBack + rodFront) / 2,
            .035, .035, rodFront - rodBack + .04, DARK);
          for (const z of [rodBack - .01, rodFront + .01]) {
            box(x, y + h - .055, z, .004, .05, .004, 0x39362e);
            box(x, y + h - .081, z, .009, .002, .009, 0x39362e);
          }
        }
        // 回縁の上端を天井板の下面へ揃える。一センチ下では板端が四周で浮く。
        const rimY = y + h - .04;
        for (const z of [back, front]) {
          // 差し込む竿縁の幅だけ回縁の上を欠き、下の四十五ミリを受けとして残す。
          // 設営時に共通材で組み、釘も含めて既存の静止した束へ納める。
          entryTimber((x0 + x1) / 2, y + h - .0575, z,
            x1 - x0 + .08, .045, .08, DARK);
          let left = x0 - .04;
          for (const x of [...rodXs, x1 + .0575]) {
            const right = x - .0175;
            if (right > left) entryTimber((left + right) / 2, y + h - .0175, z,
              right - left, .035, .08, DARK);
            left = x + .0175;
          }
          // 仕口は内面から二センチだけ掘る。外側の厚みを残して木口を隠す。
          for (const x of rodXs) entryTimber(x, y + h - .0175,
            z + (z === back ? -.01 : .01), .035, .035, .06, DARK);
        }
        for (const x of [x0, x1]) entryTimber(x, rimY, (back + front) / 2,
          .08, .08, front - back - .08, DARK);
        // 竿縁に直交する天井板を一尺ほどの幅で張る。端は回縁の上へ掛け、木口を受ける。
        // 六尺ほどの板を竿縁の上で継ぐ。隣の列は継ぐ位置をずらし、全幅一枚の板にしない。
        // 板の継ぎ目を三ミリ開け、奥の裏板を見せる。下面へ線を重ねず、目地に深さを残す。
        // 裏板は座敷の範囲だけに張り、板間・土間の小屋裏は塞がない。
        // 近づいた時だけ作り、既存の天井の束と材質へまとめる。
        // 板端は回縁の上へ二センチ掛ける。部屋の端まで張ると外壁や
        // 間仕切りの小壁へ突き抜け、板間側から天井板の木口が見えてしまう。
        // 裏板も同じ範囲に収め、裏向きの民家でも壁の中へ延ばさない。
        const boardLeft = x0 - .02, boardRight = x1 + .02;
        const z0 = back - .02, z1 = front + .02, colors = [0x7a6448, 0x756044, 0x80694c];
        const joint = .003;
        // 裏板の下面を二十五ミリ厚の天井板の上面へ接する。
        // 五ミリ浮いた二重天井にせず、目地の奥も板で受ける。
        const plankThickness = .025, backingThickness = .02;
        box((boardLeft + boardRight) / 2, y + h + plankThickness + backingThickness / 2, (z0 + z1) / 2,
          boardRight - boardLeft, backingThickness, z1 - z0, DARK);
        const boards = Math.max(1, Math.round((z1 - z0) / .3));
        const railStep = (x1 - x0) / spans, plankSpans = Math.max(1, Math.round(1.8 / railStep));
        // 小堂・板戸と同じ木目を長手へ通す。厚みと継ぎ位置は保ち、既存の天井の束へまとめる。
        const ceilingPlank = (left, right, row, color) => {
          const board = templeCeilingBoard(right - left - joint, (z1 - z0) / boards - joint, color, plankThickness);
          board.position.set((left + right) / 2, y + h + plankThickness / 2, z0 + (z1 - z0) * (row + .5) / boards);
          ceilingBoards.add(board);
          // 座敷の天井板を竿縁へ留める推定の納まり。継ぎ目の両側を別々に留め、
          // 目地の空中へ釘を置かない。竿縁の下面から板まで通し、頭だけを見せる。
          // 共通の箱を静止した内装へまとめ、板間・土間の小屋裏には足さない。
          const cz = z0 + (z1 - z0) * (row + .5) / boards;
          for (const rail of rodXs) {
            if (rail < left - .001 || rail > right + .001) continue;
            const x = Math.max(left + .008, Math.min(right - .008, rail));
            box(x, y + h - .006, cz, .003, .058, .003, 0x39362e);
            box(x, y + h - .036, cz, .007, .002, .007, 0x39362e);
          }
        };
        for (let j = 0; j < boards; j++) {
          let left = boardLeft, piece = 0;
          const start = j % 2 ? Math.max(1, Math.floor(plankSpans / 2)) : plankSpans;
          for (let rail = start; rail < spans; rail += plankSpans) {
            const right = x0 + rail * railStep;
            ceilingPlank(left, right, j, colors[(j + piece++) % colors.length]);
            left = right;
          }
          ceilingPlank(left, boardRight, j, colors[(j + piece) % colors.length]);
        }
      } else if (goten && !villageHall) { for (const sd of [-1, 1]) { box(0, y + h - .05, sd * (hd - .16), lv.w - .2, .08, .08, DARK); box(sd * (hw - .16), y + h - .05, 0, .08, .08, lv.d - .2, DARK); } }
    }
    }
    }
    if (fineIwamura) {
    const beamSpan = crosswiseBeams ? lv.w : lv.d;
    const beamBox = (u, yy, v, length, height, width, color) => {
      if (crosswiseBeams) box(v, yy, u, width, height, length, color);
      else box(u, yy, v, length, height, width, color);
      // 岩村の見せる梁・桁・根太は、下面にも材の長手へ木目を通す推定復元。
      // 継手の黒線だけが浮かないよう、二筋を異なる長さで途切れさせる。
      // 原形は全棟で共有し、近づいて組む時だけ既存の木材の束へ結合する。
      if (!exposedIwamura || (color !== DARK && color !== WOOD)
        || height < .07 || Math.max(length, width) < .5) return;
      iwamuraBeamGrainShape ??= new THREE.BoxGeometry(1, 1, 1);
      const alongU = length >= width, run = Math.max(length, width), span = Math.min(length, width);
      for (const side of [-1, 1]) {
        const grainRun = run * (side < 0 ? .63 : .47);
        const along = side * run * .1, across = side * span * .23;
        const gu = u + (alongU ? along : across), gv = v + (alongU ? across : along);
        const gl = alongU ? grainRun : .003, gw = alongU ? .003 : grainRun;
        const grain = iwamuraBeamGrainShape.clone().scale(
          crosswiseBeams ? gw : gl, .001, crosswiseBeams ? gl : gw);
        put(grain, crosswiseBeams ? gv : gu, yy - height / 2 - .0005,
          crosswiseBeams ? gu : gv, color === DARK ? 0x302317 : 0x59412b);
      }
    };
    const showBeams = !goten || I.open || plainCeiling;
    // 岩村の低い仮小屋でも、梁の下端を板戸と鴨居の上へ納める。
    const beamH = fineIwamura && boardInterior ? Math.min(.24, h - interiorPanelHeight(lv.layout, h) - .12) : .24;
    // 用屋の梁は外周の柱と同じ割付で受ける。壁の途中から生える梁にしない。
    if (showBeams) for (let q = -beamRun / 2 + (exposedIwamura ? beamStep : .8); q < beamRun / 2 - .3; q += beamStep) {
      if (upSt && (crosswiseBeams
        ? q > upSt.hole.z0 - .15 && q < upSt.hole.z1 + .15
        : q > upSt.hole.x0 - .15 && q < upSt.hole.x1 + .15)) continue;
      const [beamX, beamZ] = I.P(crosswiseBeams ? 0 : q, crosswiseBeams ? q : 0);
      // 岩村の見せる梁は、桁・根太と同じ角材で組む。
      // 汎用の梁素材へ替えると、素材の輪郭に対して仕口・込栓と通行の当たりが合わなくなる。
      // 高画質の用屋・社だけ既存の木材の束へ結合し、素材の有無で納まりを変えない。
      if (exposedIwamura || !naibu || !addNaibu(naibu, 'beam', beamX, y + h - beamH - .01, beamZ,
        .17, beamH, beamSpan - .2, I.rot + (crosswiseBeams ? Math.PI / 2 : 0))) {
        beamBox(q, y + h - beamH / 2 - .01, 0, .17, beamH, beamSpan - .2, DARK);
      }
      // 岩村の梁を見せる用屋・社は、梁と桁の交点に込栓の木口を見せる推定復元。
      // 横木を重ねただけにせず、下面の継ぎ目と角栓で組んだ位置を示す。
      // 低い小屋でも内法を狭めず、既存の木材の束へ一度だけ結合する。
      if (exposedIwamura) for (const side of [-1, 1]) {
        const joint = side * (beamSpan / 2 - .16);
        // 梁幅の内に納めた継ぎ目。桁の両側へ薄い線として残す。
        for (const edge of [-1, 1]) beamBox(q, y + h - beamH - .011,
          joint + edge * .075, .15, .002, .006, 0x241b12);
        beamBox(q, y + h - beamH - .013, joint, .034, .006, .034, 0x8a6a48);
        beamBox(q, y + h - beamH - .0165, joint, .014, .001, .026, 0x59412b);
        // 下面だけでなく、梁の両側にも桁を受ける仕口と楔の木口を示す推定復元。
        // 梁の高さの内へ納め、低い小屋の頭上や戸の引込み先へ張り出さない。
        // 向きは梁と同じ変換を使い、長い長屋でも側面の位置をそろえる。
        for (const face of [-1, 1]) {
          const sideU = q + face * .086;
          beamBox(sideU, y + h - beamH * .52 - .01, joint,
            .002, beamH * .48, .105, 0x241b12);
          beamBox(sideU + face * .002, y + h - beamH * .52 - .01, joint,
            .004, beamH * .38, .085, 0x8a6a48);
          beamBox(sideU + face * .0045, y + h - beamH * .52 - .01, joint,
            .001, beamH * .38, .005, 0x59412b);

        }
      }
    }
    if (showBeams) {
      // 桁は梁の両端を壁際の柱で受ける。低い板戸の鴨居も避ける。
      const girderV = exposedIwamura ? beamSpan / 2 - .16 : hd * .55;
      const girderH = exposedIwamura ? beamH : .2;
      if (exposedIwamura) {
        // 岩村の用屋・社は両端も隅柱に端梁を渡す推定復元。
        // 中間の梁だけでは端の上張りと桁の木口を受けられない。
        // 隅柱の芯へそろえ、窓や板戸の鴨居より上の既存の束へ納める。
        const endBeamU = beamRun / 2 - .16, endBeamW = .17;
        for (const side of [-1, 1]) {
          beamBox(side * endBeamU,
            y + h - beamH / 2 - .01, 0, endBeamW, beamH, beamSpan - .2, DARK);
          // 端梁へ突き付けた桁も、ほぞと込栓で受ける推定復元。
          // 中間の梁だけに仕口を描くと、四隅では桁の木口が梁へ貼り付いて見える。
          // 室内へ向く面に納め、梁の下端・戸の内法は変えず既存の束へ結合する。
          const innerU = side * (endBeamU - endBeamW / 2);
          for (const edge of [-1, 1]) {
            const jointV = edge * girderV;
            beamBox(innerU - side * .001, y + h - beamH * .52 - .01,
              jointV, .002, beamH * .48, .105, 0x241b12);
            beamBox(innerU - side * .003, y + h - beamH * .52 - .01,
              jointV, .004, beamH * .38, .085, 0x8a6a48);
            beamBox(side * endBeamU, y + h - beamH - .013,
              jointV, .034, .006, .034, 0x8a6a48);
            // 四隅も短い方杖で柱・端梁・桁を固める推定復元。
            // 中間の柱と同じ内法を確保し、二方向とも鴨居より上へ納める。
            const reach = Math.min(.32, h - beamH - .01 - interiorPanelHeight(lv.layout, h) - .06);
            if (reach > .1) {
              iwamuraBraceShape ??= new THREE.BoxGeometry(1, 1, 1);
              const postX = crosswiseBeams ? jointV : side * endBeamU;
              const postZ = crosswiseBeams ? side * endBeamU : jointV;
              const sx = crosswiseBeams ? edge : side;
              const sz = crosswiseBeams ? side : edge;
              const braceY = y + h - beamH - .01 - reach / 2;
              const alongX = iwamuraBraceShape.clone().scale(.07, Math.SQRT2 * reach, .07);
              alongX.rotateZ(sx * Math.PI / 4);
              put(alongX, postX - sx * reach / 2, braceY, postZ, WOOD);
              const alongZ = iwamuraBraceShape.clone().scale(.07, Math.SQRT2 * reach, .07);
              alongZ.rotateX(-sz * Math.PI / 4);
              put(alongZ, postX, braceY, postZ - sz * reach / 2, WOOD);
            }
          }
        }
        // 岩村の見せる梁と桁は下面をそろえ、交点では梁を通す。
        // 桁を梁の側面で止め、同じ高さの木の下面が重なってちらつくのを防ぐ。
        // 梁と同じ割付・階段の抜きを使い、既存の木材の束へ設営時だけ結合する。
        // 両端も端梁の内面で止め、隅で同じ木材面を重ねない。
        let start = -endBeamU + endBeamW / 2;
        const end = endBeamU - endBeamW / 2;
        const girderPiece = (a, b) => {
          if (b <= a) return;
          for (const side of [-1, 1]) beamBox((a + b) / 2, y + h - girderH / 2 - .01,
            side * girderV, b - a, girderH, .15, DARK);
        };
        for (let q = -beamRun / 2 + beamStep; q < beamRun / 2 - .3; q += beamStep) {
          if (upSt && (crosswiseBeams
            ? q > upSt.hole.z0 - .15 && q < upSt.hole.z1 + .15
            : q > upSt.hole.x0 - .15 && q < upSt.hole.x1 + .15)) continue;
          girderPiece(start, q - .085);
          start = q + .085;
        }
        girderPiece(start, end);
      } else for (const side of [-1, 1]) beamBox(0, y + h - girderH / 2,
        side * girderV, beamRun - .2, girderH, .15, DARK);
    }
    // 岩村の用屋・社の上張りは、梁間に渡した根太でも受ける推定復元。
    // 太い梁だけで広い板面を支えず、板幅二枚ごとに細い受け木を通す。
    // 梁の側面で止めて上端をそろえ、低い小屋の内法と階段の穴を保つ。
    // 近づいて室内を組む時だけ、既存の木材の束へまとめる。
    if (exposedIwamura && !I.open) {
      const hu = beamRun / 2, hv = beamSpan / 2;
      const pieces = rectMinus(hw, hd, upSt ? upSt.hole : null);
      for (let v = -hv + .6; v < hv - .3; v += .6) {
        // 根太も端梁の内面へ突き付け、端梁の中へ潜らせない。
        let start = -hu + .245;
        for (let q = -hu + beamStep; ; q += beamStep) {
          const last = q >= hu - .3, end = last ? hu - .245 : q - .085;
          for (const [x0, x1, z0, z1] of pieces) {
            const u0 = crosswiseBeams ? z0 : x0, u1 = crosswiseBeams ? z1 : x1;
            const v0 = crosswiseBeams ? x0 : z0, v1 = crosswiseBeams ? x1 : z1;
            if (v - .035 < v0 || v + .035 > v1) continue;
            const a = Math.max(start, u0), b = Math.min(end, u1);
            if (b - a > .02) {
              beamBox((a + b) / 2, y + h - .055, v,
                b - a, .09, .07, WOOD);
              // 根太は梁へただ突き付けず、ほぞ穴の縁と木栓で受ける推定復元。
              // 梁・端梁に接する木口だけに付け、階段の切欠きには架空の仕口を描かない。
              // 梁の面へ薄く納め、既存の木材の束と向きの変換を使う。
              for (const side of [-1, 1]) {
                const endU = side < 0 ? a : b, support = side < 0 ? start : end;
                if (Math.abs(endU - support) > .001) continue;
                const faceU = endU - side * .001;
                for (const edge of [-1, 1]) beamBox(faceU, y + h - .055,
                  v + edge * .038, .002, .07, .006, 0x241b12);
                beamBox(faceU, y + h - .093, v, .002, .006, .082, 0x241b12);
                // 根太の側面へ通した小さな角栓。梁の内側へ寄せ、下面へ突き出さない。
                if (b - a > .12) beamBox(endU - side * .045, y + h - .055, v,
                  .018, .018, .074, 0x8a6a48);
              }
            }
          }
          if (last) break;
          start = q + .085;

        }
      }
    }
    } else if (!nodaJoinery) {
    // 引き戸の引きしろの両端を敷居から鴨居までの戸当たりで結ぶ。
    // 外戸・間仕切り・明かり障子で同じ溝と開き幅を使い、
    // 止め木は動く戸と分けて既存の静止した室内の束へまとめる。
    
    
    // 梁（天井の下の横木。階段の口の上は通さない）と、桁（長い向きの太い横木）
    // 御殿・堂は梁を天井の上に隠す（書院造）。櫓・天守と、天井を張らない建物だけ梁と桁を見せる
    // 設楽原の民家は外観側の小屋梁・叉首・母屋・垂木を室内からも使う。
    // 別の柱割りと勾配の木組みを重ねず、座敷の竿縁天井だけをここで作る。
    const showBeams = !templeCeiling && !villageHome && (!goten || I.open || plainCeiling || (I.profile === 'anegawa' && I.kind === 'nagaya')
      || (I.profile === 'kanegasaki' && ['bansho', 'kura', 'nagaya'].includes(I.kind)));
    // 稲葉山の用屋は壁の柱筋へ梁を載せる。等間隔の別割りで柱間へ浮かせない。
    const inabaBeamFrame = inabaBoards && plainCeiling;
    const beamBays = Math.max(2, Math.round(lv.w / 1.9));
    const beamStart = inabaBeamFrame ? -hw + lv.w / beamBays : -hw + .8;
    const beamStep = inabaBeamFrame ? lv.w / beamBays : 1.7;
    if (!I.profile?.startsWith('honnoji_')) {
    if (showBeams && !igaOpenRoof) for (let q = beamStart; q < hw - .3; q += beamStep) {
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
    if (I.profile === 'iga' && showBeams && !igaOpenRoof) { box(0, y + h - 0.1, hd * 0.55, lv.w - 0.2, 0.2, 0.15, DARK); box(0, y + h - 0.1, -hd * 0.55, lv.w - 0.2, 0.2, 0.15, DARK); }
    
    
    } else {
    // 本能寺の講堂・祖師堂は格天井の上へ小屋梁を隠す。
    // 汎用の露出梁を重ねると格間と欄間を横切るため、下の専用の桁だけを残す（架構は推定）。
    if (showBeams && honnojiUtility && !upSt) {
      // 長辺を一本で飛ばさず、短辺へ梁を架ける。壁の柱と同じ割付で、両端を壁際の桁へ掛ける。
      // 梁の上面を天井板へ、両端を桁の内面へ合わせる。仕口は桁の中へ隠し、横木を丸ごと重ねない（架構は推定）。
      // 桁の高さを保ち、低い庫裏でも表戸の鴨居を下へ圧迫しない。
      // 馬舎の中央へ柱は増やさず、入口と世話の通路を保つ。形は既存の材質別のまとまりへ積む。
      const acrossZ = lv.w >= lv.d, long = acrossZ ? lv.w : lv.d;
      const n = Math.max(2, Math.round(long / 1.9));
      for (let q = 1; q < n; q++) {
        const t = -long / 2 + q * long / n;
        // 板は開口の内面まで、梁の木口は十八センチ幅の受け材の外面まで。
        // 同じ切り欠きでは梁が受け材を貫くため、梁だけ引き代を取る（仕口は推定）。
        if (acrossZ) ceilingBox(t, y + h - .12, 0, .18, .24, lv.d - .5, DARK, .18);
        else ceilingBox(0, y + h - .12, t, lv.w - .5, .24, .18, DARK, .18);
        // 梁端の仕口には角の木栓を通す（接合の意匠は推定）。
        // 梁の側面へ二ミリだけ出し、桁と煙抜きの受け材から離す。
        // 既存の箱・木材へ設営時だけまとめ、通路の柱や毎コマの処理は増やさない。
        const end = (acrossZ ? hd : hw) - .38;
        for (const sd of [-1, 1]) for (const face of [-1, 1]) {
          if (acrossZ) ceilingBox(t + face * .09, y + h - .12, sd * end,
            .004, .035, .035, 0x947550, .18);
          else ceilingBox(sd * end, y + h - .12, t + face * .09,
            .035, .035, .004, 0x947550, .18);
        }
      }
      // 梁を受ける長辺の桁を通し、直交する桁はその内面で止める（仕口は推定）。
      // 四隅へ同じ高さの角材を重ねず、短い桁の木口も柱の上へ納める。
      // 桁の内面は壁から二十五センチ。梁端と同じ位置へ合わせる。
      for (const sd of [-1, 1]) {
        box(0, y + h - .09, sd * (hd - .16), lv.w - (acrossZ ? .14 : .5), .18, .18, DARK);
        box(sd * (hw - .16), y + h - .09, 0, .18, .18, lv.d - (acrossZ ? .5 : .14), DARK);
      }
    } else if (showBeams) {
      for (let q = -hw + 0.8; q < hw - 0.3; q += 1.7) {
        if (upSt && q > upSt.hole.x0 - 0.15 && q < upSt.hole.x1 + 0.15) continue;
        const [beamX, beamZ] = I.P(q, 0);
        if (!naibu || !addNaibu(naibu, 'beam', beamX, y + h - .25, beamZ, .17, .24, lv.d - .2, I.rot)) box(q, y + h - 0.13, 0, 0.17, 0.24, lv.d - 0.2, DARK);
      }
      box(0, y + h - 0.1, hd * 0.55, lv.w - 0.2, 0.2, 0.15, DARK); box(0, y + h - 0.1, -hd * 0.55, lv.w - 0.2, 0.2, 0.15, DARK);
    }
    if (templeCeiling) {
      // 講堂・祖師堂の回縁は壁際の桁で受ける（架構は推定）。
      // 桁の上面を回縁の下面へ当て、柱と窓上の束は桁の下面で止める。
      // 南北の桁を通し、東西の木口はその内面へ納める。既存の木部へ一度だけ結合する。
      for (const sd of [-1, 1]) {
        box(0, y + h - .13, sd * (hd - .14), lv.w - .1, .1, .18, DARK);
        box(sd * (hw - .14), y + h - .13, 0, .18, .1, lv.d - .46, DARK);
      }
    }
    }
    }
if (I.profile === 'iga') for (const d of I.doors || []) {
      if (d.lv !== lv) continue;
      const bottom = d.y + .04, height = d.h - .04;
      for (const side of [-1, 1])
        houseTimber(d.lx + side * (d.W + d.overlap + .03), bottom + height / 2, d.trackZ, .06, height, .15, DARK, 'y');
    }
if (I.profile === 'iga' && k === 0) {
      // 外の引き戸も内側の二本の溝へ納める。開けた戸の引きしろまで敷居・鴨居を延ばす。
      // 戸当たり・敷居・鴨居・見込み枠も柱梁と共通の木肌で納める。
      // 横材は長手、縦枠は高さへ木目を通す。溝と開口の寸法は保つ。
      const dh = I.door.h ?? Math.min(h - .3, 2), dz = ds * (hd - .21);
      const railW = I.door.w * 2 + .2;
      // 溝を黒い突起で描かず、敷居の上面と鴨居の下面を八ミリ欠く。
      // 元の上端・下端を保ち、動く板戸と通れる高さは変えない。
      houseTimber(I.door.lx, y + .016, dz, railW, .032, .52, DARK, 'x');
      houseTimber(I.door.lx, y + dh + .054, dz, railW, .092, .52, DARK, 'x');
      // 戸口の両脇は細い見込み板だけでなく、土台から桁へ届く柱で受ける。
      // 外周の等間隔の柱は入口を避けるため、ここで鴨居の支えを補う推定復元。
      // 柱の内面は開口の外、背面は二本の溝より外壁側へ納める。
      const entryStone = ['minka', 'nagaya', 'bansho'].includes(I.kind);
      const postBottom = entryStone ? .106 : 0;
      for (const side of [-1, 1]) {
        const px = I.door.lx + side * (I.door.w / 2 + .07);
        if (entryStone) box(I.door.lx + side * (I.door.w / 2 + .11),
          y + .066, ds * (hd - .16), .22, .08, .28, 0x777267);
        houseTimber(px, y + (h + postBottom) / 2, ds * (hd - .16),
          .14, h - postBottom, .14, DARK, 'y');
        // 鴨居を柱へ差し、室内側に差し口と抜け止めの込栓を見せる。
        const surface = ds * (hd - .231);
        for (const edge of [-1, 1])
          box(px, y + dh + .05 + edge * .04, surface, .1, .003, .003, 0x211a14);
        box(px, y + dh + .05, surface - ds * .003, .022, .022, .008, WOOD);
      }
      // 溝は戸当たりの内面で止める。横木いっぱいまで刻むと、
      // 止め木を貫いて木口まで抜け、開けた戸の受けが欠けて見える。
      // 戸幅と召し合わせの重なりは、実際に滑る外戸から取る。
      const exteriorDoor = I.doors?.find(d => d.lv === lv && d.exterior);
      const grooveW = exteriorDoor ? 2 * (exteriorDoor.W + exteriorDoor.overlap) : I.door.w * 2;
      const halfGroove = IGA_DOOR_GROOVE_W / 2;
      const lands = [[-.05, .34 - halfGroove], [.34 + halfGroove, .415 - halfGroove], [.415 + halfGroove, .47]];
      for (const [a, b] of lands) {
        const trackZ = ds * (hd - (a + b) / 2);
        houseTimber(I.door.lx, y + .036, trackZ, railW, .008, b - a, DARK, 'x');
        houseTimber(I.door.lx, y + dh + .004, trackZ, railW, .008, b - a, DARK, 'x');
      }
      for (const inset of [.34, .415]) {
        const trackZ = ds * (hd - inset);
        box(I.door.lx, y + .0325, trackZ, grooveW, .001, IGA_DOOR_GROOVE_W, 0x1a1410);
        box(I.door.lx, y + dh + .0075, trackZ, grooveW, .001, IGA_DOOR_GROOVE_W, 0x1a1410);
        // 引き込み先で溝を止め、横材の木口には欠きを出さない。
        const capW = (railW - grooveW) / 2;
        if (capW > 0) for (const side of [-1, 1]) {
          const capX = I.door.lx + side * (grooveW + capW) / 2;
          houseTimber(capX, y + .036, trackZ, capW, .008, IGA_DOOR_GROOVE_W, DARK, 'x');
          houseTimber(capX, y + dh + .004, trackZ, capW, .008, IGA_DOOR_GROOVE_W, DARK, 'x');
        }
      }
      // 戸口の見込みを縦枠と上枠で塞ぐ。外壁は内寸より九センチ外、
      // 内壁は十センチ内。それぞれ厚さ六センチの表面まで枠を渡す。
      // 壁の中心までの十九センチだけでは両端に三センチずつ切り口が残る。
      // 枠は開口の外へ納め、内側の戸の溝・引きしろと通れる幅を保つ。
      const reveal = .25, jambZ = ds * (hd - .005);
      for (const side of [-1, 1])
        houseTimber(I.door.lx + side * (I.door.w / 2 + .015), y + dh / 2, jambZ, .03, dh, reveal, WOOD, 'y');
      houseTimber(I.door.lx, y + dh + .015, jambZ, I.door.w + .06, .03, reveal, WOOD, 'x');
    }
if (igaOpenRoof) {
      // 棟は奥行き方向。梁を棟と直交させ、束の真下で両側の柱・桁へ渡す。
      // 従来の奥行き方向の梁と短い横木では、束を受ける横木の端が柱へ届かなかった。
      // 外周柱の内面まで桁を通し、部材は既存の室内の束へまとめる。
      // 内壁の柱心は壁際から十六センチ。桁も同じ柱心へ載せる。
      const postX = hw - .16;
      // 横梁・妻梁の木口は幅十六センチの柱の外面へ納める。
      // 外壁まで突き抜かせず、設営時の梁の当たりも同じ端位置にそろえる。
      const beamWidth = (postX + .08) * 2;
      // 桁の木口も隅柱の外面で止め、当たりと同じ長さにする。
      for (const side of [-1, 1]) houseTimber(side * postX, y + h - .12, 0, .18, .24, lv.d - .16, DARK, 'z');
      // 炉の吊り梁と合わさると横梁の芯が動く。束・貫・方杖も
      // 実際の二本の梁へそろえ、以前の芯に束の足だけを残さない。
      const roofFrameZ = [lv.igaRoofBeams[0].z, lv.igaRoofBeams[1].z];
      const roofFrameCenter = (roofFrameZ[0] + roofFrameZ[1]) / 2;
      const roofFrameSpan = roofFrameZ[1] - roofFrameZ[0];
      for (const b of lv.igaRoofBeams)
        houseTimber(0, y + h + (b.bottom + b.top) / 2, b.z, beamWidth, b.top - b.bottom, b.d, DARK, 'x');
      // 梁と桁の隅には火打材を渡す推定復元。束の方杖だけでは
      // 水平の枠が四角いまま変形するため、四隅を三角に結ぶ。
      // 梁・桁と同じ高さで両端を掛け、板間の頭上や戸の引きしろへ下ろさない。
      const cornerRun = Math.min(.55, hw * .25, hd * .25);
      // 火打材の両端にも抜け止めの込栓を見せる推定復元。
      // 斜材を梁・桁へ重ねるだけにせず、差した端から四センチ内側へ納める。
      // 栓の木口は梁・桁の下面へ出す。斜材の下面では太い横木に隠れる。
      // 八か所で同じ原形を使い、既存の静止した束へ焼き込む。
      const bracePeg = new THREE.BoxGeometry(.022, .02, .022);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const beam = lv.igaRoofBeams[sz < 0 ? 0 : 1];
        // 火打材も梁・桁と同じ木肌へまとめ、斜めの長手へ木目を通す。
        // 原形を四隅で共有し、回してから既存の静止した束へ焼き込む。
        houseTimber(sx * (postX - cornerRun / 2), y + h - .12,
          beam.z - sz * cornerRun / 2, Math.SQRT2 * cornerRun + .08,
          .12, .12, WOOD, 'x', 0, sx * sz * Math.PI / 4);
        put(bracePeg.clone(), sx * (postX - .04), y + h - .245,
          beam.z - sz * (cornerRun - .04), WOOD);
        // 炉の梁は下面も一センチ下がる。栓の木口をその下面へ出す。
        put(bracePeg.clone(), sx * (postX - cornerRun + .04), y + h + beam.bottom - .005,
          beam.z - sz * .04, WOOD);
    }
      bracePeg.dispose();
      // 見せる横梁は柱へ差すほぞと込栓で納める推定復元。
      // 梁を柱へ重ねただけにせず、柱の室内面へ差し口の上下と
      // 抜け止めの木栓を見せる。炉の吊り梁も同じ納まりにする。
      // 共通の箱形・木材を使い、既存の静止した室内の束へ焼き込む。
      const beamJoint = (z, centerY, beamH, beamD, postWidth = .14) => {
        // 炉の吊り梁と通常の梁を一本の幅広い柱で受ける所では、
        // 栓もその柱の両面まで通す。梁幅だけで置くと木口が柱内へ埋まる。
        const postSpan = lv.igaRoofBeams.find(b => Math.abs(b.z - z) < .001)?.postSpan || .16;
        for (const side of [-1, 1]) {
          // 中央は十四センチ、隅は十六センチの柱。仕口をそれぞれの
          // 室内面より二ミリ手前へ出し、太い隅柱の中へ埋めない。
          const surface = side * (postX - postWidth / 2 - .002);
          for (const edge of [-1, 1])
            box(surface, centerY + edge * beamH / 2, z,
              .004, .004, beamD, 0x211a14);
          // 柱を貫く栓の両木口。梁の下面・上面から離し、
          // 板壁の貫に付けた栓と同じ木の色でそろえる。
          for (const face of [-1, 1])
            box(side * postX, centerY, z + face * (Math.max(postSpan / 2, beamD / 2) + .004),
              .025, .025, .008, WOOD);
        }
      };
      for (const b of lv.igaRoofBeams)
        beamJoint(b.z, y + h + (b.bottom + b.top) / 2, b.top - b.bottom, b.d);
      // 外の茅屋根と同じ勾配で小屋組を組む。室内を平天井で塞がない。
      const outerW = lv.w + .18, outerD = lv.d + .18;
      const rise = Math.max(outerW * .5, Math.max(outerW, outerD) * .42) + .5;
      const pitch = rise / (outerW / 2 + .85), angle = Math.atan(pitch);
      // 外の茅は厚さ五十センチ。屋根の表面から一定量を引くだけでは、
      // 勾配の急な屋根ほど棟木と垂木が茅へ埋まる。props.js の屋根裏面に合わせる。
      const roofBottom = y + h + rise + .1 + .15 * pitch - .5 / Math.cos(angle);
      // 垂木の厚みと茅裏の凹凸も見込み、木組みを屋根の内側へ納める。
      const ridgeY = roofBottom - .28, length = Math.hypot(hw, hw * pitch);
      // 垂木の下面へ母屋の上面を合わせる。鉛直の厚みは勾配で変わるため、
      // 一律の高さでは母屋が垂木へ食い込む。束・貫・縄も同じ下面を使う。
      // 垂木は成十六センチの登り梁の上へ載せる。中心間を一律十四センチに
      // すると、急な茅屋根では両材が食い込む。半厚の和を鉛直へ換算し、
      // 母屋・結束・茅下地も同じ基準から積み上げる。
      const rafterOffset = (.16 + .07) / (2 * Math.cos(angle));
      const purlinTopOffset = rafterOffset - .035 / Math.cos(angle);
      const purlinBottomOffset = purlinTopOffset - .18;
      // 露出する棟木・母屋・束・貫も柱梁と同じ木肌にし、長手へ木目を通す。
      // 既存の木材の束へ納め、炉の煤も同じ範囲で受ける。寸法と仕口は保つ。
      houseTimber(0, ridgeY, 0, .16, .18, lv.d, DARK, 'z'); // 棟木
      // 束の上端は母屋・棟木へ短ほぞで差す推定復元。重ねただけの
      // 接合にせず、材の側面に差し口と込栓の木口を見せる。
      // 既存の箱形・木材で静止した室内の束へ納め、当たりは増やさない。
      const roofPostJoint = (x, z, top, width, depth, timberW) => {
        for (const face of [-1, 1]) {
          const surfaceX = x + face * (timberW / 2 + .002);
          for (const edge of [-1, 1])
            box(surfaceX, top + .035, z + edge * depth * .25,
              .003, .07, .003, 0x211a14);
          box(surfaceX, top + .07, z, .003, .003, depth * .5, 0x211a14);
          box(surfaceX + face * .002, top + .035, z,
            .008, .022, .022, WOOD);
        }
        // 束の肩を受け材の下面へそろえ、ほぞの両脇を細い線で示す。
        for (const side of [-1, 1])
          box(x + side * width * .375, top - .001, z,
            width * .25, .002, depth, 0x211a14);
      };
      // 登り梁の端は壁の上より高い。軒桁と束を渡し、梁の端を宙に浮かせない。
      // 軒桁は壁端より十六センチ内側の柱心で登り梁を受ける。
      // 壁端の高さで決めると、勾配の分だけ梁の下面と桁の上面に隙間ができる。
      // 傾けた梁の厚みも鉛直方向へ換算し、桁の上面を梁の下面へ合わせる。
      const eaveY = ridgeY - postX * pitch - .08 / Math.cos(angle) - .09;
      for (const side of [-1, 1]) houseTimber(side * postX, eaveY, 0, .18, .18, lv.d, DARK, 'z');
      // 妻壁も板だけで塞がず、両隅の柱へ妻梁を渡し、束で軒桁・母屋・棟木を受ける推定復元。
      // 民家の中央は妻の煙出しがあるため束を立てず、左右の母屋束で囲う。
      // 既存の静止した室内の束へ焼き込み、共有の木材で納める。
      // 隅柱の心は壁端から十六センチ内側。妻梁を壁端に置くと、
      // 柱へ掛かる部分が一センチしかなく、束まで柱筋から外れる。
      // 梁・束・貫と仕口を同じ柱筋へ移し、妻の板壁とは分けて納める。
      const gableZ = hd - .16;
      const gableSupports = [
        [-postX, eaveY - .09], [postX, eaveY - .09],
        [-hw * .5, ridgeY - hw * pitch * .5 + purlinBottomOffset],
        [hw * .5, ridgeY - hw * pitch * .5 + purlinBottomOffset],
      ];
      if (!igaHearth) gableSupports.push([0, ridgeY - .09]);
      // 妻梁も隅柱へほぞで差し、込栓で留める推定復元。
      // 中央の梁と同じ仕口を使い、隅柱の太さだけ合わせる。
      // 木口と差し口は既存の静止した束へ納める。
      for (const z of [-gableZ, gableZ]) {
        houseTimber(0, y + h - .12, z, beamWidth, .24, .18, DARK, 'x');
        beamJoint(z, y + h - .12, .24, .18, .16);
      }
      // 貫の楔は母屋束と棟束で同じ先細りの原形を使う。
      // 母屋束にも角材を貼るのでなく、差し込んで締める形を見せる推定復元。
      const wedge = new THREE.BoxGeometry(.12, .04, .1);
      const wedgePos = wedge.attributes.position;
      for (let i = 0; i < wedgePos.count; i++)
        if (wedgePos.getX(i) > 0) wedgePos.setY(i, wedgePos.getY(i) * .25);
      wedge.computeVertexNormals();
      // 妻側の母屋束も横貫で結ぶ推定復元。妻梁から立つ束だけでは、
      // 妻の板壁を支える骨組みが左右に分かれたままになる。
      // 一番低い母屋束の内側へ納め、民家の煙出しより下で通す。
      const gableTieTop = ridgeY - hw * pitch * .5 + purlinBottomOffset;
      const gableTieY = y + h + (gableTieTop - y - h) * .4;
      if (gableTieTop > y + h + .25) for (const z of [-gableZ, gableZ]) {
        houseTimber(0, gableTieY, z, hw + .24, .1, .08, WOOD, 'x');
        // 妻の貫は梁間方向へ通る。楔も束の左右の出口へ納め、
        // 棟方向の貫のように束の前後へ貼り付けない。
        // 煙出しのない陣小屋・番所は中央の棟束も締める。
        // 既存の楔を回して使い、静止した室内の束へまとめる。
        for (const side of igaHearth ? [-1, 1] : [-1, 0, 1]) for (const face of [-1, 1]) {
          const g = wedge.clone();
          g.scale(.1 / .12, .035 / .04, .025 / .1);
          g.rotateY(face * Math.PI / 2);
          put(g, side * hw * .5 + face * .08, gableTieY + .045, z, DARK);
        }
      }
      // 棟と軒の間でも垂木を母屋で受ける。梁のある二か所へ束を立て、
      // 母屋だけが屋根裏に浮かないよう、梁から垂木まで荷をつなぐ。
      // 伊賀の見せる小屋組だけに足し、既存の室内の束へまとめる。
      const seatedRoofPost = (x, z, bottom, top, width) => {
        houseTimber(x, (bottom + top) / 2, z, width, top - bottom, width, DARK, 'y');
        // 束の足元も梁へ短ほぞで納める推定復元。上端の仕口だけでなく、
        // 梁上の差し口と抜け止めの込栓を見せ、角材を載せただけにしない。
        // ほぞは梁の内部、差し口は上面、栓の木口は梁の両側面へ納める。
        // 軒桁は棟方向なので栓を左右へ抜く。横梁では炉の吊り梁と
        // まとめた実際の見込みを使い、太くなった梁の中へ木口を埋めない。
        const onEave = Math.abs(Math.abs(x) - postX) < .01;
        const supportDepth = onEave ? .18
          : lv.igaRoofBeams.find(b => Math.abs(b.z - z) < .001)?.d ?? .18;
        houseTimber(x, bottom - .03, z, width * .5, .06, width * .5, DARK, 'y');
        for (const side of [-1, 1]) {
          box(x + side * (width / 2 + .001), bottom + .001, z,
            .002, .002, width + .004, 0x211a14);
          box(x, bottom + .001, z + side * (width / 2 + .001),
            width, .002, .002, 0x211a14);
          const pegEnd = side * (supportDepth / 2 + .004);
          box(x + (onEave ? pegEnd : 0), bottom - .04, z + (onEave ? 0 : pegEnd),
            onEave ? .008 : .022, .022, onEave ? .022 : .008, WOOD);
        }
      };
      // 妻側の束にも梁上のほぞ・込栓と、母屋側の差し口を付ける。
      // 中央の小屋組と同じ納まりを使い、妻だけ角材を突き合わせた形にしない。
      // 民家の煙出しは gableSupports の中央を空けたまま保つ。
      for (const z of [-gableZ, gableZ]) for (const [x, top] of gableSupports) {
        const bottom = y + h;
        if (top <= bottom + .01) continue;
        seatedRoofPost(x, z, bottom, top, .14);
        roofPostJoint(x, z, top, .14, .14, Math.abs(x) > hw * .75 ? .18 : .16);
      }
      for (const side of [-1, 1]) {
        const px = side * hw * .5, top = ridgeY - hw * pitch * .5 + purlinTopOffset;
        houseTimber(px, top - .09, 0, .16, .18, lv.d, DARK, 'z');
        const bottom = y + h, postTop = top - .18;
        if (postTop > bottom + .01) {
          for (const z of roofFrameZ)
            seatedRoofPost(px, z, bottom, postTop, .14);
          for (const z of roofFrameZ)
            roofPostJoint(px, z, postTop, .14, .14, .16);
          // 母屋束も棟方向の貫で結ぶ推定復元。棟束だけを結んでも、
          // 左右の母屋束は独立したままで、屋根の長手方向を固める材がない。
          // 束の内側へ高さを納め、両端は束を貫く木口まで伸ばす。
          if (postTop - bottom > .24) {
            const tieY = bottom + (postTop - bottom) * .45;
            houseTimber(px, tieY, roofFrameCenter, .08, .1, roofFrameSpan + .2, WOOD, 'z');
            // 貫が束から抜けないよう、両面へ楔を添える。形と材質は
            // 既存の室内の束へまとめ、動く処理や描く回数を増やさない。
            for (const z of roofFrameZ) for (const end of [-1, 1]) {
              const g = wedge.clone();
              g.scale(.1 / .12, .035 / .04, .025 / .1);
              if (end < 0) g.rotateY(Math.PI);
              put(g, px, tieY + .045, z + end * .08, DARK);
            }
            // 母屋束にも棟方向の方杖を掛ける推定復元。貫だけで結ばれた
            // 長方形を三角に固め、貫の上端から母屋の下面へ荷を伝える。
            // 左右の母屋で同じ原形を複製し、既存の静止した束へ納める。
            const braceBottom = tieY + .05, braceRise = postTop - braceBottom;
            if (braceRise > .1) {
              const run = Math.min(.55, hd * .4, braceRise);
              const braceLength = Math.hypot(run, braceRise) + .04;
              const tilt = Math.atan2(braceRise, run);
              for (const end of [-1, 1]) {
                // 方杖にも長手の木目を通す。横木の原形を勾配と棟方向へ回し、
                // 既存の端位置・断面を保って柱梁と同じ木材の束へ納める。
                houseTimber(px, braceBottom + braceRise / 2,
                  roofFrameZ[end < 0 ? 0 : 1] - end * run / 2, braceLength, .08, .08,
                  WOOD, 'x', -end * tilt, -Math.PI / 2);
                // 母屋側の方杖も、棟側と同じく受け材へ差して込栓で留める。
                // 下端は束の位置の貫、上端は内側の母屋下面。
                // 傾きに合わせた両端へ納め、栓が斜材から離れて浮かないようにする。
                // 共通の木肌・箱形を静止した束へまとめ、毎コマの処理は足さない。
                for (const upper of [false, true]) {
                  const jointZ = roofFrameZ[end < 0 ? 0 : 1] - end * (upper ? run : 0);
                  const jointY = upper ? postTop : braceBottom;
                  const width = upper ? .16 : .08;
                  const tenonY = jointY + (upper ? .02 : -.02);
                  houseTimber(px, tenonY, jointZ, .04, .04, .04, WOOD, 'y');
                  for (const face of [-1, 1]) {
                    const surfaceX = px + face * (width / 2 + .002);
                    for (const edge of [-1, 1])
                      box(surfaceX, jointY, jointZ + edge * .04,
                        .004, .004, .004, 0x211a14);
                    box(surfaceX + face * .002, tenonY, jointZ,
                      .008, .022, .022, DARK);
                  }
                }
              }
            }
          }
        }
      }
      // 母屋束は棟方向だけでなく梁間方向も貫で結ぶ推定復元。
      // 左右の母屋束と中央の棟束へ通し、長手の貫とは高さをずらして
      // 同じ所へ二つの仕口を掘らない。既存の楔と静止した束を使う。
      const crossTieBottom = y + h;
      const crossTieTop = ridgeY - hw * pitch * .5 + purlinBottomOffset;
      if (crossTieTop - crossTieBottom > .6) {
        const crossTieY = crossTieBottom + (crossTieTop - crossTieBottom) * .22;
        for (const z of roofFrameZ) {
          houseTimber(0, crossTieY, z, hw + .24, .1, .08, WOOD, 'x');
          for (const x of [-hw * .5, 0, hw * .5]) for (const face of [-1, 1]) {
            const g = wedge.clone();
            g.scale(.1 / .12, .035 / .04, .025 / .1);
            g.rotateY(face * Math.PI / 2);
            put(g, x + face * (x === 0 ? .09 : .08), crossTieY + .045, z, DARK);
          }
        }
      }
      for (const z of roofFrameZ) {
        const bottom = y + h;
        // 棟木の下面で束の肩を止める。上端を棟木の中心まで埋めない。
        const ridgePostTop = ridgeY - .09;
        seatedRoofPost(0, z, bottom, ridgePostTop, .16);
        roofPostJoint(0, z, ridgePostTop, .16, .16, .16);
        for (const side of [-1, 1]) {
          const postTop = eaveY - .09, postBottom = y + h;
          // 軒桁が下の桁と重なる場合は束を挟まない。負の高さの材を作らない。
          if (postTop > postBottom + .01) {
            // 軒桁の束も母屋束と同じ短ほぞ・込栓で上下の桁へ留める。
            // 角材を載せただけにせず、既存の仕口と木材を使い回す推定復元。
            // 短い束では上下の仕口が重なるため、木口を足すのは高さがある時だけ。
            if (postTop - postBottom > .18) {
              seatedRoofPost(side * postX, z, postBottom, postTop, .16);
              roofPostJoint(side * postX, z, postTop, .16, .16, .18);
            } else {
              houseTimber(side * postX, (postBottom + postTop) / 2, z, .16, postTop - postBottom, .16, DARK, 'y');
            }
          }
          houseTimber(side * hw / 2, ridgeY - hw * pitch / 2, z,
            length, .16, .14, DARK, 'x', -side * angle);
          // 登り梁を棟木・軒桁へ留める込栓の木口。束だけでなく、
          // 傾いた梁の接合位置にも抜け止めを見せる推定復元。
          // 木口だけ両面へ出し、既存の木材と静止した束へまとめる。
          for (const x of [side * .06, side * postX]) for (const face of [-1, 1])
            box(x, ridgeY - Math.abs(x) * pitch, z + face * .074,
              .022, .022, .012, WOOD);
        }
      }
      // 棟方向の方杖だけでは梁間方向を固められない。棟束から左右の
      // 登り梁へも方杖を渡す推定復元。端は束・登り梁へ差し込み、
      // 屋根の外へ出さず、歩く板間より上の小屋組の中へ納める。
      const crossRun = Math.min(.55, hw * .2);
      const crossBottom = y + h + (ridgeY - .09 - y - h) * .3;
      const crossTop = ridgeY - crossRun * pitch - .04;
      const crossRise = crossTop - crossBottom;
      if (crossRise > .1) {
        const braceLength = Math.hypot(crossRun, crossRise);
        const angle = Math.atan2(crossRise, crossRun);
        for (const z of roofFrameZ) for (const side of [-1, 1]) {
          houseTimber(side * crossRun / 2, (crossBottom + crossTop) / 2, z,
            braceLength + .04, .09, .09, WOOD, 'x', side * angle);
          // 方杖の両端を短ほぞで束・登り梁へ差し、込栓で留める推定復元。
          // 突き合わせだけの端をなくし、栓の木口は方杖の両側面へ出す。
          // 同じ木材と静止した束を使い、頭上の接合だけに納める。
          const inset = Math.min(.06, crossRun / 4);
          for (const run of [inset, crossRun - inset]) for (const face of [-1, 1])
            box(side * run, crossBottom + crossRise * run / crossRun,
              z + face * .05, .022, .022, .012, DARK);
        }
      }
      // 二本の小屋束を棟方向の貫で結ぶ推定復元。梁と棟だけでは、
      // 束が一列ずつ独立し、棟方向へ倒れようとする力を受ける材がなかった。
      // 貫を束へ通し、両端の方杖をその上端から棟木の下面へ納める。
      const tieY = y + h + (ridgeY - .09 - y - h) * .45;
      houseTimber(0, tieY, roofFrameCenter, .1, .12, roofFrameSpan + .24, WOOD, 'z');
      // 棟束の貫も両面の楔で締める推定復元。母屋束と同じ納まりで、
      // 貫の上端と束の差し口に楔を入れ、長い横木を差しただけにしない。
      // 楔は先端へ細くし、原形を四か所で使い回して室内の束へ焼き込む。
      for (const z of roofFrameZ) for (const end of [-1, 1]) {
        const g = wedge.clone();
        if (end < 0) g.rotateY(Math.PI);
        put(g, 0, tieY + .06, z + end * .095, DARK);
      }
      wedge.dispose();
      const braceRun = Math.min(.65, hd * .45), braceRise = ridgeY - .09 - (tieY + .06);
      if (braceRise > .1) {
        const braceLength = Math.hypot(braceRun, braceRise);
        const braceAngle = Math.atan2(braceRise, braceRun);
        for (const side of [-1, 1]) {
          houseTimber(0, tieY + .06 + braceRise / 2,
            roofFrameZ[side < 0 ? 0 : 1] - side * braceRun / 2, braceLength + .08, .09, .09,
            WOOD, 'x', -side * braceAngle, -Math.PI / 2);
          // 棟方向の方杖も両端を短ほぞで納める推定復元。
          // 下端は貫の上面、上端は棟木の下面へ差し、木口だけの突き合わせを避ける。
          // 受け材の両側面へ差し口と込栓を出し、共有の箱形を静止した束へまとめる。
          for (const upper of [false, true]) {
            const jointZ = roofFrameZ[side < 0 ? 0 : 1] - side * (upper ? braceRun : 0);
            const jointY = upper ? ridgeY - .09 : tieY + .06;
            const depth = upper ? .16 : .1;
            const pegY = jointY + (upper ? .018 : -.018);
            for (const face of [-1, 1]) {
              const surfaceX = face * (depth / 2 + .002);
              for (const edge of [-1, 1])
                box(surfaceX, jointY, jointZ + edge * .045,
                  .004, .004, .004, 0x211a14);
              box(surfaceX + face * .002, pegY, jointZ,
                .008, .022, .022, DARK);
            }
          }
        }
      }
      // 妻の柱筋にも垂木を置き、屋中の両端を受ける。片側から六十センチずつ
      // 並べるだけでは、反対の妻に垂木が来ず、茅下地の端が宙に出ていた。
      // 両妻の間を六十センチ以下で均等に割り、結束も同じ位置を使う。
      // 位置の配列は設営時だけ作り、既存の静止した束へまとめる。
      const rafterBays = Math.max(1, Math.ceil(gableZ * 2 / .6));
      const rafterZ = Array.from({ length: rafterBays + 1 }, (_, i) => -gableZ + gableZ * 2 * i / rafterBays);
      for (const z of rafterZ) for (const side of [-1, 1]) {
        houseTimber(side * hw / 2, ridgeY + rafterOffset - hw * pitch / 2, z,
          length, .07, .065, WOOD, 'x', -side * angle);
      }
      // 垂木は母屋だけでなく棟木にも縄で留める推定復元。
      // 棟では左右の垂木を一緒に抱き、山形の上面へ縄を沿わせる。
      // 三か所の原形を全ての交点で使い回し、既存の静止した束へ納める。
      for (const side of [-1, 0, 1]) {
        const px = side * hw * .5, centerY = ridgeY - Math.abs(px) * pitch;
        const bottom = (side === 0 ? -.09 : purlinBottomOffset) - .008, halfWidth = .095;
        const ropeParts = [];
        const ropeBox = (w, h, d, x, yy, z) => {
          const g = new THREE.BoxGeometry(w, h, d);
          g.translate(x, yy, z); ropeParts.push(g);
        };
        // 垂木の厚みは屋根面に垂直。縄も同じ勾配で上面へ接する。
        const top = rafterOffset + .035 / Math.cos(angle) + .008;
        const upperY = x => top - (Math.abs(px + x) - Math.abs(px)) * pitch;
        for (const face of [-1, 1]) {
          const upper = upperY(face * halfWidth);
          ropeBox(.012, upper - bottom, .012, face * halfWidth,
            (upper + bottom) / 2, face * .048);
        }
        const lower = new THREE.BoxGeometry(Math.hypot(halfWidth * 2, .096), .012, .012);
        lower.rotateY(-Math.atan2(.096, halfWidth * 2));
        lower.translate(0, bottom, 0); ropeParts.push(lower);
        // 母屋は一本、棟は頂点で二本に分ける。一本で渡すと棟の垂木へ縄が埋まる。
        const ends = side === 0 ? [-halfWidth, 0, halfWidth] : [-halfWidth, halfWidth];
        for (let j = 1; j < ends.length; j++) {
          const a = ends[j - 1], b = ends[j], ay = upperY(a), by = upperY(b);
          const az = a * .048 / halfWidth, bz = b * .048 / halfWidth;
          const direction = new THREE.Vector3(b - a, by - ay, bz - az);
          const upper = new THREE.BoxGeometry(direction.length(), .012, .012);
          direction.normalize();
          upper.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), direction));
          upper.translate((a + b) / 2, (ay + by) / 2, (az + bz) / 2); ropeParts.push(upper);
        }
        ropeBox(.025, .02, .025, 0, bottom - .013, 0);
        const binding = mergeGeometries(ropeParts);
        for (const g of ropeParts) g.dispose();
        for (const z of rafterZ)
          put(binding.clone(), px, centerY, z, 0x8a7651);
        binding.dispose();
      }
      // 茅を垂木だけで受けず、棟と平行な細い屋中を渡す。
      // 屋根裏を見上げた時も、茅を結び留める下地が垂木と交差する造りにする。
      // 外の茅裏より内側へ納め、民家・陣小屋・番所の静止した室内の束へ加える。
      const rows = Math.max(1, Math.ceil(hw / .4));
      // 垂木と屋中の厚みは屋根面に垂直な寸法。鉛直に一定量だけ離すと、
      // 急な茅屋根では二材が食い込む。両材の半厚を勾配に合わせて換算する。
      const lathOffset = (.07 + .035) / (2 * Math.cos(angle));
      const ropeR = .006, tieTop = .035 / 2 + ropeR;
      const tieBottom = -(.035 / 2 + .07 + ropeR);
      // 屋中と垂木の交点は縄で抱かせる推定復元。釘頭だけを並べず、
      // 二材の上と下を斜めに回し、見上げた時も結び目が見えるようにする。
      // 一つの結束の原形を全交点で共用し、既存の静止した束へ焼き込む。
      const ties = [];
      for (const yy of [tieBottom, tieTop]) {
        const g = new THREE.BoxGeometry(.18, .012, .012);
        g.rotateY(Math.PI / 4); g.translate(0, yy, 0); ties.push(g);
      }
      for (const side of [-1, 1]) {
        const g = new THREE.BoxGeometry(.012, tieTop - tieBottom, .012);
        g.translate(side * .064, (tieTop + tieBottom) / 2, -side * .064); ties.push(g);
      }
      const knot = new THREE.BoxGeometry(.028, .022, .025);
      knot.translate(0, tieBottom - .013, 0); ties.push(knot);
      const tie = mergeGeometries(ties);
      for (const g of ties) g.dispose();
      for (const side of [-1, 1]) for (let q = 0; q < rows; q++) {
        const x = side * (q + .5) * hw / rows;
        const yy = ridgeY + rafterOffset + lathOffset - Math.abs(x) * pitch;
        // 茅下地も垂木と同じ木肌へ納め、棟方向の長手へ木目を通す。
        // 単色の棒だけが屋根裏へ残らないよう、柱梁の共有部品を使う。
        // 屋根面への傾き・断面・縄の位置は保ち、静止した束へまとめる。
        houseTimber(x, yy, 0, .06, .035, lv.d, WOOD, 'z', -side * angle);
        for (const z of rafterZ) {
          const binding = tie.clone();
          binding.rotateZ(-side * angle);
          put(binding, x, yy, z, 0x8a7651);
        }
      }
      tie.dispose();
    }
    if (nodaJoinery) {
    // 梁（天井の下の横木。階段の口の上は通さない）と、桁（長い向きの太い横木）
    // 御殿・堂は梁を天井の上に隠す（書院造）。櫓・天守と、天井を張らない建物だけ梁と桁を見せる
    const showBeams = !goten || I.open || plainCeiling || (I.profile === 'anegawa' && I.kind === 'nagaya');
    // 用屋の細かな木組みは推定。根太の端を部屋の四周の梁・桁で受ける。
    // 間仕切りの位置で受け、民家の煙抜きも同じ範囲で空ける。
    // 室内の生成時だけ既存の箱の束へ加え、毎コマの仕事は増やさない。
    if (utilityCeiling || fortCeiling || soboCeiling || kuriCeiling) for (const r of lv.layout.rooms) {
      // 座敷では梁を隠し、板間と庫裏の土間は四周で根太を受ける。
      // 庫裏の梁も障子の境で止め、竈の煙抜きへ張り出させない。
      if ((fortCeiling || soboCeiling || kuriCeiling) && r.floor === 'tatami') continue;
      const x0 = r.x0 + .1, x1 = r.x1 - .1, z0 = r.z0 + .1, z1 = r.z1 - .1;
      const nx = Math.max(1, Math.ceil((x1 - x0) / 1.7));
      // 天井板十八ミリと根太八十ミリの下で梁・桁を受ける。
      // 根太へ梁の大半を埋めず、掛かりの上半分だけを桁へ納める。
      const bearing = y + h - .018 - .08;
      const beamSeats = [[], []];
      // 前後の桁を通し材にし、奥行きの梁は桁の内面で止める。
      // 四隅も梁の外面まで桁で受け、同じ場所へ木材を突き通さない。
      // 煙抜きは従来と同じ範囲で避け、戸口の高さは保つ。
      for (let j = 0; j <= nx; j++) {
        const x = x0 + (x1 - x0) * j / nx;
        for (const [a, b] of smokeSpans(z0 + .075, z1 - .075, x, false, .085)) {
          box(x, bearing - .12, (a + b) / 2, .17, .24, b - a, DARK);
          // 民家・庫裏の煙抜きで切った梁も、木口を横枠へ突き付けるだけにしない。
          // 枠の外面へ短い受け木を掛け、低く下がる梁の下面を支える推定復元。
          // 縦の添え木で枠へつなぎ、開口の内側と天井板には張り出させない。
          if (smokeHole) for (const side of [-1, 1]) {
            const end = side < 0 ? a : b;
            const edge = side < 0 ? smokeHole.z1 + .17 : smokeHole.z0 - .17;
            if (Math.abs(end - edge) > .001 || b - a < .3) continue;
            const bottom = bearing - .24, frameBottom = y + h - .25;
            box(x, bottom - .035, end - side * .025, .17, .07, .19, DARK);
            box(x, (bottom + frameBottom) / 2, end + side * .035,
              .17, frameBottom - bottom, .07, DARK);
            // 添え木を留める木栓は横面だけへ出し、既存の木材の束へ納める。
            for (const face of [-1, 1]) box(x + face * .0875,
              (bottom + frameBottom) / 2, end + side * .035, .015, .025, .025, WOOD);
          }
          // 用屋の露出した梁端は、平らな棒を桁へ突き付けるだけにせず、
          // 下端を欠いた掛かりと木栓を見せる推定復元。欠き込みは桁の下面で受ける。
          // 煙抜きで切った端には足さず、開口と受け材の間を塞がない。
          for (const side of [-1, 1]) {
            const end = side < 0 ? a : b, edge = side < 0 ? z0 + .075 : z1 - .075;
            if (Math.abs(end - edge) > .001 || b - a < .3) continue;
            // 桁の内面から中心まで上半分だけを延ばす。下半分は桁の手前で止める。
            box(x, bearing - .065, end + side * .0375, .17, .13, .075, DARK, null, 2);
            beamSeats[side < 0 ? 0 : 1].push([x - .085, x + .085]);
            // 込栓は梁の両側面へわずかに出し、同じ木の材質・静止した形の束へ納める。
            for (const face of [-1, 1]) box(x + face * .0875, bearing - .095,
              end - side * .1, .015, .035, .035, WOOD);
          }
        }
      }
      for (const z of [z0, z1]) for (const [a, b] of smokeSpans(x0 - .085, x1 + .085, z, true, .075)) {
        // 梁端の掛かりを桁へ重ねず、受ける桁の上側を実際に欠く。
        // 下側七センチは通して梁を支え、継手も同じ欠き込みで納める推定復元。
        // 煙抜きで切れた梁端には受けを作らず、設営時の箱の束だけで処理する。
        const seats = beamSeats[z === z0 ? 0 : 1];
        const girder = (left, right, bottom, top) => {
          if (right - left <= .001) return;
          const shoulder = bearing - .13;
          if (bottom < shoulder) {
            const upper = Math.min(top, shoulder);
            box((left + right) / 2, (bottom + upper) / 2, z,
              right - left, upper - bottom, .15, DARK);
          }
          if (top <= shoulder) return;
          let spans = [[left, right]];
          const lower = Math.max(bottom, shoulder);
          for (const [lo, hi] of seats) spans = spans.flatMap(([l, r]) => {
            if (hi <= l || lo >= r) return [[l, r]];
            const start = Math.max(l, lo), end = Math.min(r, hi);
            // 掛かりは桁の内側半分まで。外側の木は欠かずに残す。
            box((start + end) / 2, (lower + top) / 2, z + (z === z0 ? -.0375 : .0375),
              end - start, top - lower, .075, DARK);
            return [[l, start], [end, r]].filter(([l, r]) => r - l > .001);
          });
          for (const [l, r] of spans)
            box((l + r) / 2, (lower + top) / 2, z, r - l, top - lower, .15, DARK);
        };
        // 長い桁も一本の角材で済ませず、梁筋で上下を欠いて継ぐ推定復元。
        // 二間隔ごとに納め、煙抜きで短く切った材と四隅は継がない。
        // 継ぎ目は上下でずらして遮光を保ち、同じ面に材を重ねない。
        let left = a;
        for (let j = 2; j < nx; j += 2) {
          const joint = x0 + (x1 - x0) * j / nx;
          if (joint - .45 <= a || joint + .45 >= b) continue;
          const back = joint - .12, front = joint + .12;
          girder(left, back, bearing - .2, bearing);
          for (const upper of [false, true]) {
            const seam = joint + (upper ? .04 : -.04);
            const cy = bearing - (upper ? .05 : .15);
            girder(back, seam - .0015, cy - .05, cy + .05);
            girder(seam + .0015, front, cy - .05, cy + .05);
          }
          // 重なりの中心を留める木栓は桁の両面だけへ出す。
          // 生成時に既存の束へ結合し、戸口の高さと開閉の処理は保つ。
          for (const side of [-1, 1])
            box(joint, bearing - .1, z + side * .078, .025, .035, .006, WOOD);
          left = front;
        }
        girder(left, b, bearing - .2, bearing);
      }
    }
    if (showBeams && !utilityCeiling && !kuriCeiling) for (let q = -hw + 0.8; q < hw - 0.3; q += 1.7) {
      if (upSt && q > upSt.hole.x0 - 0.15 && q < upSt.hole.x1 + 0.15) continue;
      for (const [z0, z1] of smokeSpans(-hd + .1, hd - .1, q, false, .085)) {
        const cz = (z0 + z1) / 2, len = z1 - z0, [beamX, worldZ] = I.P(q, cz);
        if (!naibu || !addNaibu(naibu, 'beam', beamX, y + h - .25, worldZ, .17, .24, len, I.rot)) box(q, y + h - 0.13, cz, 0.17, 0.24, len, DARK);
      }
    }
    if (showBeams && !utilityCeiling && !kuriCeiling) for (const z of [hd * .55, -hd * .55])
      for (const [x0, x1] of smokeSpans(-hw + .1, hw - .1, z, true, .075)) box((x0 + x1) / 2, y + h - .1, z, x1 - x0, .2, .15, DARK);
    }
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
    }
    // 窓（外の格子窓の場所に合わせる）
    const wins = windowsFor(I, lv, k);
    // 伊賀の民家・陣小屋・番所は、外の板壁に内側だけ土壁を重ねない。
    // 館の座敷は従来の塗り壁を保ち、小屋は柱の間の板と貫を見せる。
    const igaBoardWall = I.profile === 'iga' && ['minka', 'nagaya', 'bansho'].includes(I.kind);
    // 板壁の腰と中ほどを二段の貫でつなぐ推定復元。仕口も同じ高さを使い、
    // 戸口・窓では切る。木肌と形は既存の静止した束へまとめる。
    const nukiHeights = igaBoardWall ? [h * .28, h * .55] : [];
    // 四つの面：穴のある壁（内の側）。入口の階は戸口も穴
    for (const face of ['z', 'x']) for (const sd of [-1, 1]) {
      const len = face === 'z' ? lv.w : lv.d, off = (face === 'z' ? hd : hw) - 0.1;
      const faceWins = wins.filter(o => o.face === face && o.s === sd);
      const holes = wins.filter((o) => o.face === face && o.s === sd && (!o.shoji || o.sliding || I.templePaper)).map((o) => ({ t0: o.t - o.w / 2, t1: o.t + o.w / 2, y0: o.y0, y1: o.y1 }));
      if (k === 0 && face === 'z' && sd === ds) holes.push({ t0: I.door.lx - I.door.w / 2, t1: I.door.lx + I.door.w / 2, y0: I.door.rail || 0, y1: I.door.h ?? Math.min(h - 0.3, 2.0) });
      // 設楽原の小堂は外壁と同じ三間の柱割り。内寸だけで割ると柱が明かり障子を貫く。
      const templeBays = S.quality === 'high' && I.profile === 'shitaragahara' && I.kind === 'hondo' && face === 'z';
      // 民家の側壁も外観と同じ一間割りにする。内寸を一・九メートルで割ると、
      // 側面だけ柱と小屋梁の通りがずれ、一本の柱が内外で二本に見える。
      const homeBays = villageHome;
      const span = templeBays ? len + .3 : homeBays ? len + .18 : len;
      const n = Math.max(2, Math.round(span / (templeBays ? 3 : homeBays ? 1.8 : 1.9)));
      if (I.profile?.startsWith('honnoji_')) {
      for (const [t0, t1, a0, a1] of facePanels(len, perimeterTop, holes.filter((o) => o.t1 > -len / 2 && o.t0 < len / 2))) {
        const tm = (t0 + t1) / 2, tw = t1 - t0, yy = y + (a0 + a1) / 2, hh = a1 - a0;
        if (honnojiUtility) {
          // 庫裏・板倉・馬舎の内壁は、線を貼った一枚の面から厚みのある縦板へ替える。
          // 二ミリの目透かしの奥は実を兼ねる裏板で塞ぎ、元の壁厚六センチへ納める（板組は推定）。
          // 窓の上下も壁全体の板割りを共用し、開口へ板を渡さない。
          // 線の箱を板の箱へ置き換え、既存の材質別の形へ設営時だけ結合する。
          if (face === 'z') box(tm, yy, sd * (off + .024), tw, hh, .012, DARK);
          else box(sd * (off + .024), yy, tm, .012, hh, tw, DARK);
          for (let q = Math.floor((t0 + len / 2) / .26); -len / 2 + q * .26 < t1; q++) {
            const near = -len / 2 + q * .26, far = Math.min(len / 2, near + .26);
            const left = Math.max(t0, near + (q ? .001 : 0));
            const right = Math.min(t1, far - (far < len / 2 ? .001 : 0));
            if (right <= left) continue;
            const t = (left + right) / 2;
            if (face === 'z') box(t, yy, sd * (off - .006), right - left, hh, .048, BOARD);
            else box(sd * (off - .006), yy, t, .048, hh, right - left, BOARD);
          }
        } else if (face === 'z') box(tm, yy, sd * off, tw, hh, .06, WALL);
        else box(sd * off, yy, tm, .06, hh, tw, WALL);
        if (honnojiWaist) {
          // 外壁だけにあった腰板を室内側にも張る推定の仕上げ。
          // 外の腰板上端（床組より七十四センチ）に合わせ、床種の境と開口で止める。
          // 柱・幅木の裏へ納め、引き戸の溝には出さない。既存の木部へ設営時だけ結合する。
          for (const r of lv.layout.rooms) {
            const edge = face === 'z' ? sd > 0 ? r.z1 : r.z0 : sd > 0 ? r.x1 : r.x0;
            if (Math.abs(edge - sd * (face === 'z' ? hd : hw)) > .01) continue;
            const a = Math.max(t0, face === 'z' ? r.x0 : r.z0);
            const b = Math.min(t1, face === 'z' ? r.x1 : r.z1);
            const bottom = Math.max(a0, (r.y || 0) + (r.floor === 'tatami' ? .066 : 0));
            const top = Math.min(a1, .74);
            if (b <= a || top <= bottom) continue;
            const t = (a + b) / 2, cy = y + (bottom + top) / 2;
            if (face === 'z') wallTrimBox(t, cy, sd * (off - .04), b - a, top - bottom, .02, BOARD);
            else wallTrimBox(sd * (off - .04), cy, t, .02, top - bottom, b - a, BOARD);
            for (let seam = Math.ceil((a + .02 + len / 2) / .26) * .26 - len / 2; seam < b - .02; seam += .26) {
              if (face === 'z') wallTrimBox(seam, cy, sd * (off - .052), .008, top - bottom, .004, DARK);
              else wallTrimBox(sd * (off - .052), cy, seam, .004, top - bottom, .008, DARK);
            }
          }
        }
      }
      if (honnojiUtility) {
        // 庫裏・板倉・馬舎の板壁を受ける貫（架構は推定）。
        // 柱の内面へ二段を通し、窓・戸口の開口には横木を渡さない。
        // 壁と同じ面の分割を使い、共通の材質別のまとまりへ設営時だけ足す。
        // 四隅で直交する貫を重ねない。南北面を隅柱の外面まで通し、
        // 東西面の木口をその内面へ納める（仕口は推定）。
        // 柱の中心は壁から十六センチ、貫の厚さは十センチ。
        const railEnd = len / 2 - (face === 'z' ? .11 : .21);
        for (const rail of [.65, 1.35]) for (const [a, b, low, high] of facePanels(len, h, holes)) {
          const bottom = Math.max(low, rail - .05), top = Math.min(high, rail + .05);
          const left = Math.max(a, -railEnd), right = Math.min(b, railEnd);
          if (top <= bottom || right - left < .02) continue;
          const t = (left + right) / 2, yy = y + (bottom + top) / 2;
          if (face === 'z') box(t, yy, sd * (off - .06), right - left, top - bottom, .1, DARK);
          else box(sd * (off - .06), yy, t, .1, top - bottom, right - left, DARK);
        }
      }
      } else {
      // 集落の民家は外観と同じ板壁。御殿の塗り壁を内側へ重ねない。
      // 板の割りは窓の上下でも揃え、開口の端だけ切り詰める。
      // 目地の奥には暗い裏面を残し、土間まで同じ板を下ろす。近づいた時だけ既存の束へまとめる。
      const wallPanel = (a, b, low, high) => {
        const mid = (a + b) / 2, cy = y + (low + high) / 2, height = high - low;
        const color = villageHome ? 0x493b2e : WALL;
        if (face === 'z') box(mid, cy, sd * off, b - a, height, .06, color);
        else box(sd * off, cy, mid, .06, height, b - a, color);
        if (!villageHome) return;
        const step = .3, joint = .004, colors = [0x796047, 0x725a42, 0x80674b];
        const first = Math.floor((a + len / 2) / step), last = Math.ceil((b + len / 2) / step);
        for (let j = first; j < last; j++) {
          const left = Math.max(a, -len / 2 + j * step + joint / 2);
          const right = Math.min(b, -len / 2 + (j + 1) * step - joint / 2);
          if (right <= left) continue;
          const t = (left + right) / 2, shade = colors[j % colors.length];
          // 床板・天井板と同じ木目を縦板の長手へ通す。開口で切れた板も
          // 元の板の高さを基準に絵を切り、窓の上下で木目を引き伸ばさない。
          const board = templeCeilingBoard(h, right - left, 0xffffff, .025);
          if (!M.woodFloor) {
            M.woodFloor = board.material.clone();
            M.woodFloor.vertexColors = true;
          }
          const geo = board.geometry.clone(), pos = geo.attributes.position;
          for (let i = 0; i < pos.count; i++)
            pos.setX(i, pos.getX(i) < 0 ? low - h / 2 : high - h / 2);
          // 木目の長手は板材の局所横軸。立ててから壁の向きへ回す。
          const uv = geo.attributes.uv, normal = geo.attributes.normal;
          for (let i = 0; i < pos.count; i++) if (Math.abs(normal.getY(i)) > .5)
            uv.setY(i, (pos.getX(i) + h / 2) / h);
          geo.translate(h / 2 - (low + high) / 2, 0, 0).rotateZ(Math.PI / 2);
          if (face === 'z') geo.rotateY(Math.PI / 2);
          put(geo, face === 'z' ? t : sd * (off - .0475), cy,
            face === 'z' ? sd * (off - .0475) : t, shade, false, woodFloorList);
        }
        // 縦板の裏を横桟で受ける推定の納まり。柱の内面まで渡し、
        // 窓・戸口は壁板と同じ穴で切る。障子の溝より壁側へ収める。
        // 高画質の民家だけ、共通の箱と材質で静止した壁の束へまとめる。
        for (const railY of [.6, 1.3]) {
          const bottom = Math.max(low, railY - .04), top = Math.min(high, railY + .04);
          if (top <= bottom) continue;
          for (let bay = 0; bay < n; bay++) {
            // 隅柱は壁端から十六センチ内側へ寄せた幅十六センチの柱。
            // 中間柱と同じ八センチの逃げでは柱の胴を貫くため、隅だけ内面で止める。
            const left = Math.max(a, -len / 2 + .24, -span / 2 + span * bay / n + .08);
            const right = Math.min(b, len / 2 - .24, -span / 2 + span * (bay + 1) / n - .08);
            if (right <= left) continue;
            const t = (left + right) / 2, yy = y + (bottom + top) / 2;
            if (face === 'z') entryTimber(t, yy, sd * (off - .085), right - left, top - bottom, .05, WOOD);
            else entryTimber(sd * (off - .085), yy, t, .05, top - bottom, right - left, WOOD);
          }
        }
      };
      if (I.profile?.startsWith('honnoji_')) {
      for (const [t0, t1, a0, a1] of facePanels(len, perimeterTop, holes.filter((o) => o.t1 > -len / 2 && o.t0 < len / 2))) {
        const tm = (t0 + t1) / 2, tw = t1 - t0, yy = y + (a0 + a1) / 2, hh = a1 - a0;
        if (honnojiUtility) {
          // 庫裏・板倉・馬舎の内壁は、線を貼った一枚の面から厚みのある縦板へ替える。
          // 二ミリの目透かしの奥は実を兼ねる裏板で塞ぎ、元の壁厚六センチへ納める（板組は推定）。
          // 窓の上下も壁全体の板割りを共用し、開口へ板を渡さない。
          // 線の箱を板の箱へ置き換え、既存の材質別の形へ設営時だけ結合する。
          if (face === 'z') box(tm, yy, sd * (off + .024), tw, hh, .012, DARK);
          else box(sd * (off + .024), yy, tm, .012, hh, tw, DARK);
          for (let q = Math.floor((t0 + len / 2) / .26); -len / 2 + q * .26 < t1; q++) {
            const near = -len / 2 + q * .26, far = Math.min(len / 2, near + .26);
            const left = Math.max(t0, near + (q ? .001 : 0));
            const right = Math.min(t1, far - (far < len / 2 ? .001 : 0));
            if (right <= left) continue;
            const t = (left + right) / 2;
            if (face === 'z') box(t, yy, sd * (off - .006), right - left, hh, .048, BOARD);
            else box(sd * (off - .006), yy, t, .048, hh, right - left, BOARD);
          }
        } else if (face === 'z') box(tm, yy, sd * off, tw, hh, .06, WALL);
        else box(sd * off, yy, tm, .06, hh, tw, WALL);
        if (honnojiWaist) {
          // 外壁だけにあった腰板を室内側にも張る推定の仕上げ。
          // 外の腰板上端（床組より七十四センチ）に合わせ、床種の境と開口で止める。
          // 柱・幅木の裏へ納め、引き戸の溝には出さない。既存の木部へ設営時だけ結合する。
          for (const r of lv.layout.rooms) {
            const edge = face === 'z' ? sd > 0 ? r.z1 : r.z0 : sd > 0 ? r.x1 : r.x0;
            if (Math.abs(edge - sd * (face === 'z' ? hd : hw)) > .01) continue;
            const a = Math.max(t0, face === 'z' ? r.x0 : r.z0);
            const b = Math.min(t1, face === 'z' ? r.x1 : r.z1);
            const bottom = Math.max(a0, (r.y || 0) + (r.floor === 'tatami' ? .066 : 0));
            const top = Math.min(a1, .74);
            if (b <= a || top <= bottom) continue;
            const t = (a + b) / 2, cy = y + (bottom + top) / 2;
            if (face === 'z') wallTrimBox(t, cy, sd * (off - .04), b - a, top - bottom, .02, BOARD);
            else wallTrimBox(sd * (off - .04), cy, t, .02, top - bottom, b - a, BOARD);
            for (let seam = Math.ceil((a + .02 + len / 2) / .26) * .26 - len / 2; seam < b - .02; seam += .26) {
              if (face === 'z') wallTrimBox(seam, cy, sd * (off - .052), .008, top - bottom, .004, DARK);
              else wallTrimBox(sd * (off - .052), cy, seam, .004, top - bottom, .008, DARK);
            }
          }
        }
      }
      if (honnojiUtility) {
        // 庫裏・板倉・馬舎の板壁を受ける貫（架構は推定）。
        // 柱の内面へ二段を通し、窓・戸口の開口には横木を渡さない。
        // 壁と同じ面の分割を使い、共通の材質別のまとまりへ設営時だけ足す。
        // 四隅で直交する貫を重ねない。南北面を隅柱の外面まで通し、
        // 東西面の木口をその内面へ納める（仕口は推定）。
        // 柱の中心は壁から十六センチ、貫の厚さは十センチ。
        const railEnd = len / 2 - (face === 'z' ? .11 : .21);
        for (const rail of [.65, 1.35]) for (const [a, b, low, high] of facePanels(len, h, holes)) {
          const bottom = Math.max(low, rail - .05), top = Math.min(high, rail + .05);
          const left = Math.max(a, -railEnd), right = Math.min(b, railEnd);
          if (top <= bottom || right - left < .02) continue;
          const t = (left + right) / 2, yy = y + (bottom + top) / 2;
          if (face === 'z') box(t, yy, sd * (off - .06), right - left, top - bottom, .1, DARK);
          else box(sd * (off - .06), yy, t, .1, top - bottom, right - left, DARK);
        }
      }
      } else if (nodaJoinery) {
      for (const [t0, t1, a0, a1] of facePanels(len, h, holes)) {
        const tm = (t0 + t1) / 2, tw = t1 - t0, yy = y + (a0 + a1) / 2, hh = a1 - a0;
        const wallColor = nodaBoards ? BOARD : WALL;
        if (nodaBoards) {
          // 砦・民家の板壁は黒い線を貼らず、十八ミリ厚の縦板と奥の受けで組む。
          // 目地の奥にも木を残し、外光を漏らさない。元の六センチの壁厚を保つ。
          // 柱間の同じ板割りを窓の上下へ通し、開口の断片内だけで切る。
          const wallBox = (mid, width, offset, depth, color) => {
            if (face === 'z') box(mid, yy, sd * offset, width, hh, depth, color);
            else box(sd * offset, yy, mid, depth, hh, width, color);
          };
          wallBox(tm, tw, off + .009, .042, DARK);
          for (let i = Math.floor((t0 + len / 2) / .3); -len / 2 + i * .3 < t1; i++) {
            const edge = -len / 2 + i * .3;
            const left = Math.max(t0, edge + .003), right = Math.min(t1, edge + .297);
            if (right - left > .001) wallBox((left + right) / 2, right - left, off - .021, .018, wallColor);
          }
        } else if (face === 'z') box(tm, yy, sd * off, tw, hh, 0.06, wallColor);
        else box(sd * off, yy, tm, 0.06, hh, tw, wallColor);
        if (kuriCeiling) for (const r of lv.layout.rooms) {
          // 炊事土間の腰は板で保護する推定復元。食事の座敷まで板を回さず、
          // 窓・玄関は壁と同じ開口で切る。内障子の溝より壁側へ納める。
          if (r.floor !== 'earth' || (face === 'z'
            && Math.abs((sd < 0 ? r.z0 : r.z1) - sd * hd) > .01)) continue;
          const left = Math.max(t0, face === 'z' ? r.x0 : r.z0);
          const right = Math.min(t1, face === 'z' ? r.x1 : r.z1);
          const bottom = Math.max(a0, .08), top = Math.min(a1, .9);
          if (right - left <= .001 || top - bottom <= .001) continue;
          const waistBox = (mid, width, cy, height, inset, depth, color) => {
            if (face === 'z') box(mid, cy, sd * (off - inset), width, height, depth, color);
            else box(sd * (off - inset), cy, mid, depth, height, width, color);
          };
          // 目地の奥は薄い受け板。縦板は塗り壁・受け板の内面へ順に重ねる。
          waistBox((left + right) / 2, right - left, y + (bottom + top) / 2, top - bottom, .033, .006, DARK);
          for (let i = Math.floor((left + len / 2) / .3); -len / 2 + i * .3 < right; i++) {
            const edge = -len / 2 + i * .3;
            const a = Math.max(left, edge + .003), b = Math.min(right, edge + .297);
            if (b - a > .001) waistBox((a + b) / 2, b - a,
              y + (bottom + top) / 2, top - bottom, .045, .018, BOARD);
          }
          // 押縁も開口の断片内だけに置き、戸口や窓下へ横木を渡さない。
          if (a0 <= .9 && a1 >= .935)
            waistBox((left + right) / 2, right - left, y + .9175, .035, .045, .03, DARK);
        }
        if (nodaBoards) for (const height of [.65, 1.9]) {
          // 板壁の内側にも柱間をつなぐ横桟を通す推定復元。
          // 壁の断片で切り、玄関・格子窓を横切らせない。
          // 内障子の溝より壁側へ納め、開けた紙戸の引き代も保つ。
          const bottom = Math.max(a0, height - .045), top = Math.min(a1, height + .045);
          if (top - bottom < .001) continue;
          const cy = y + (bottom + top) / 2;
          if (face === 'z') box(tm, cy, sd * (off - .065), tw, top - bottom, .07, DARK);
          else box(sd * (off - .065), cy, tm, .07, top - bottom, tw, DARK);
        }
      }
            } else {
      if (I.profile === 'iga' || inabaBoards) {
      // 板壁の隅は前後の壁へ左右の壁を突き付ける。下地・化粧板・貫を
      // それぞれ相手の内面で止め、隅柱の裏で同じ面を交差させない。
      // 開口の位置と壁の当たりは保ち、稲葉山の高画質の木部だけ納め直す。
      const wallLen = inabaBoards && face === 'x' ? len - .26 : len;
      for (const [t0, t1, a0, a1] of facePanels(wallLen, h, holes.filter((o) => o.t1 > -len / 2 && o.t0 < len / 2))) {
        const tm = (t0 + t1) / 2, tw = t1 - t0, yy = y + (a0 + a1) / 2, hh = a1 - a0;
        // 伊賀の縦板は柱と同じ共有の木肌を使い、木目を上下へ通す。
        // 開口を抜いた形と煤の濃淡は保ち、室内の木材の束へまとめる。
        if (igaBoardWall) {
          if (face === 'z') houseTimber(tm, yy, sd * off, tw, hh, .06, BOARD, 'y');
          else houseTimber(sd * off, yy, tm, .06, hh, tw, BOARD, 'y');
        } else if (I.profile === 'iga' && I.kind === 'yashiki') {
          // 館の土壁は小壁と同じ共有の土肌。柱・開口・当たりの寸法はそのまま。
          plasterWalls.push(face === 'z' ? [tm, yy, sd * off, tw, hh, .06, WALL]
            : [sd * off, yy, tm, .06, hh, tw, WALL]);
        } else if (face === 'z') box(tm, yy, sd * off, tw, hh, .06, WALL);
        else box(sd * off, yy, tm, .06, hh, tw, WALL);
        if (igaBoardWall) {
          // 戸口を抜いた壁の範囲だけに押縁を通す。頭上の小壁も同じ板張り。
          for (let t = -len / 2 + .45; t < t1 - .02; t += .45) if (t > t0 + .02) {
            if (face === 'z') houseTimber(t, yy, sd * (off - .045), .025, hh, .025, DARK, 'y');
            else houseTimber(sd * (off - .045), yy, t, .025, hh, .025, DARK, 'y');
          }
          for (const nukiY of nukiHeights) if (a0 <= nukiY - .05 && a1 >= nukiY + .05) {
            // 貫の木口は隅柱の中心まで差す。壁端まで延ばすと、
            // 隅柱を通り越して隣の板壁へ突き出してしまう。
            const a = Math.max(t0, -len / 2 + .16), b = Math.min(t1, len / 2 - .16);
            if (b > a) {
              if (face === 'z') houseTimber((a + b) / 2, y + nukiY, sd * (off - .06), b - a, .1, .08, DARK, 'x');
              else houseTimber(sd * (off - .06), y + nukiY, (a + b) / 2, .08, .1, b - a, DARK, 'z');
            }
          }
        }
      }
      // 伊賀の板壁は柱の足元を土台でつなぎ、縦板の下端を受ける。
      // 戸口は外壁と同じ穴で切り、敷居・引き戸の溝へ横木を重ねない。
      // 共通の箱形から既存の静止した束へまとめ、毎コマの処理は増やさない。
      // 正面・背面は隅柱の心まで通し、側面はその土台の内面へ突き付ける。
      // 四面とも壁幅いっぱいに渡すと、隅柱より先へ木口が出て交差していた。
      const sillLen = len - (face === 'z' ? .32 : .46);
      if (igaBoardWall) for (const [a, b, low, high] of facePanels(sillLen, .12, holes)) {
        if (face === 'z') houseTimber((a + b) / 2, y + (low + high) / 2, sd * (off - .06), b - a, high - low, .14, DARK, 'x');
        else houseTimber(sd * (off - .06), y + (low + high) / 2, (a + b) / 2, .14, high - low, b - a, DARK, 'z');
      }
      } else {
      for (const [t0, t1, a0, a1] of facePanels(len, h, holes.filter((o) => o.t1 > -len / 2 && o.t0 < len / 2))) {
        wallPanel(t0, t1, a0, a1);
      }
      if (earth && earth.y < 0) {
        // 低い土間の外周も床まで壁を下ろす。板間の高さで止めると足元に隙間が残る。
        // 正面の板戸の下は空け、側壁は土間に接する長さだけ継ぎ足す。
        if (face === 'z' && sd * hd >= earth.z0 && sd * hd <= earth.z1) {
          const gaps = k === 0 && sd === ds ? [{ t0: I.door.lx - I.door.w / 2,
            t1: I.door.lx + I.door.w / 2, y0: 0, y1: -earth.y }] : [];
          for (const [a, b, lo, hi] of facePanels(len, -earth.y, gaps))
            wallPanel(a, b, earth.y + lo, earth.y + hi);
        } else if (face === 'x') {
          wallPanel(earth.z0, earth.z1, earth.y, 0);
        }
      }
      if (villageHome) {
        // 板壁の下端は地覆で受ける推定の納まり。低い土間でも板の木口を土へ直置きしない。
        // 土間と板間の境で高さを切り替え、戸口は既存の開口を使って空ける。
        // 隅柱の内面へ木口を突き付け、二面の横木を重ねない。静止した木材の束へ一度だけ足す。
        const feet = face === 'x' && earth
          ? [[-len / 2, earth.z0, 0], [earth.z0, earth.z1, earth.y], [earth.z1, len / 2, 0]]
          : [[-len / 2, len / 2, earth && sd * hd >= earth.z0 && sd * hd <= earth.z1 ? earth.y : 0]];
        const footH = .09;
        // 中間の柱にも木口を納める。一本の地覆を通すと、土間の段差で
        // 柱の胴から横木が突き出す。下の柱と同じ芯・幅で設営時だけ切り欠く。
        const postGaps = [];
        for (let q = 1; q < n; q++) {
          const t = -span / 2 + q * span / n;
          if (k === 0 && face === 'z' && sd === ds && Math.abs(t - I.door.lx) < I.door.w / 2 + .2) continue;
          postGaps.push({ t0: t - .08, t1: t + .08, y0: 0, y1: footH });
        }
        for (const [left, right, bottom] of feet) {
          if (right <= left) continue;
          const gaps = holes.filter(v => v.y0 < bottom + footH && v.y1 > bottom)
            .map(v => ({ ...v, y0: 0, y1: footH })).concat(postGaps);
          // 外壁の戸口は板間を基準にした高さ。土間の低い部分も同じ幅だけ抜く。
          if (k === 0 && face === 'z' && sd === ds)
            gaps.push({ t0: I.door.lx - I.door.w / 2, t1: I.door.lx + I.door.w / 2, y0: 0, y1: footH });
          for (const [a, b] of facePanels(len, footH, gaps)) {
            const x0 = Math.max(a, left, -len / 2 + .24);
            const x1 = Math.min(b, right, len / 2 - .24);
            if (x1 <= x0) continue;
            const t = (x0 + x1) / 2;
            // 地覆も柱・横桟と同じ木材を使い、横木の長手へ木目を通す。
            if (face === 'z') entryTimber(t, y + bottom + footH / 2, sd * (off - .075), x1 - x0, footH, .08, DARK);
            else entryTimber(sd * (off - .075), y + bottom + footH / 2, t, .08, footH, x1 - x0, DARK);
          }
        }
      }
      if (villageHall) {
        // 小堂の内装は推定。腰板の上下を地覆と笠木で受け、板端を横木へ納める。
        // 戸口と窓の開口は壁と共有し、板や笠木を出入りの口へ渡さない。
        // 近づいた時だけ既存の木材の束へ足し、当たりや毎コマの仕事は増やさない。
        const waist = .65, foot = .06, boardTop = waist - .03;
        // 隅だけでなく中間の丸柱でも腰板・地覆・笠木を切り分ける。
        // 下の柱と同じ柱割りを使い、板や横木を柱の胴へ突き通さない。
        // 窓・戸口を抜いた面を柱間へ納め、動く建具の開口は保つ。
        const waistBays = [];
        let bayLeft = -len / 2 + .24;
        for (let q = 1; q < n; q++) {
          const t = -span / 2 + q * span / n;
          if (k === 0 && face === 'z' && sd === ds && Math.abs(t - I.door.lx) < I.door.w / 2 + .2) continue;
          if (t - .08 > bayLeft) waistBays.push([bayLeft, t - .08]);
          bayLeft = t + .08;
        }
        if (len / 2 - .24 > bayLeft) waistBays.push([bayLeft, len / 2 - .24]);
        for (const [left, right, lo, hi] of facePanels(len, waist, holes)) for (const [bay0, bay1] of waistBays) {
          const a = Math.max(left, bay0), b = Math.min(right, bay1);
          if (b <= a) continue;
          const width = b - a, count = Math.max(1, Math.round(width / .3));
          const bottom = Math.max(lo, foot), top = Math.min(hi, boardTop);
          // 目地の奥は暗い裏板にし、塗り壁が白い縞になって透けるのを防ぐ。
          if (top > bottom) {
            if (face === 'z') box((a + b) / 2, y + (bottom + top) / 2, sd * (off - .04), width, top - bottom, .02, DARK);
            else box(sd * (off - .04), y + (bottom + top) / 2, (a + b) / 2, .02, top - bottom, width, DARK);
          }
          for (let j = 0; j < count; j++) {
            if (top <= bottom) break;
            const t = a + width * (j + .5) / count;
            const color = j % 3 === 0 ? 0x71583d : 0x695137;
            // 縦板の木目は上下へ通す。天井板と同じ原形・材質を向きだけ替えて共用し、
            // 既存の静止した束へまとめる。目地・裏板・柱際の切り欠きは同じ寸法に保つ。
            const board = templeCeilingBoard(top - bottom, width / count - .006, color, .035);
            if (face === 'z') {
              board.rotation.set(Math.PI / 2, Math.PI / 2, 0);
              board.position.set(t, y + (bottom + top) / 2, sd * (off - .045));
            } else {
              board.rotation.z = Math.PI / 2;
              board.position.set(sd * (off - .045), y + (bottom + top) / 2, t);
            }
            ceilingBoards.add(board);
          }
          if (lo < foot) {
            const upper = Math.min(hi, foot);
            // 地覆・笠木も腰板と同じ木地とし、横材の長手へ木目を通す。
            // 柱間と開口の切り欠きを保ち、共用の木材の束へまとめる。
            if (face === 'z') entryTimber((a + b) / 2, y + (lo + upper) / 2, sd * (off - .065), width, upper - lo, .07, DARK);
            else entryTimber(sd * (off - .065), y + (lo + upper) / 2, (a + b) / 2, .07, upper - lo, width, DARK);
          }
          if (hi === waist) {
            if (face === 'z') entryTimber((a + b) / 2, y + waist, sd * (off - .065), width, .06, .07, DARK);
            else entryTimber(sd * (off - .065), y + waist, (a + b) / 2, .07, .06, width, DARK);
          }
        }
      }
      }
      }
      }
      // 腰板（櫓・天守：壁の下の一間ほどは板張り、上は漆喰。戸口の所は空ける）
      // 伊賀の民家・陣小屋・番所は上で全面の板壁と押縁を組んでいる。
      // 共通の腰板を重ねると下半分の木肌を覆い、押縁の脇にも余分な目地が出る。
      if (!goten && !toride && !igaBoardWall) {
        const wb = (t0, t1) => { if (t1 - t0 < 0.05) return; const tm = (t0 + t1) / 2, tw = t1 - t0; if (face === 'z') box(tm, y + 0.55, sd * (off - 0.03), tw, 1.1, 0.04, BOARD); else box(sd * (off - 0.03), y + 0.55, tm, 0.04, 1.1, tw, BOARD); };
        for (const [a, b, low, high] of facePanels(len, 1.1, holes)) { if (low === 0 && high === 1.1) wb(a, b); else { const mid = (a + b) / 2; if (face === 'z') box(mid, y + (low + high) / 2, sd * (off - .03), b - a, high - low, .04, BOARD); else box(sd * (off - .03), y + (low + high) / 2, mid, .04, high - low, b - a, BOARD); } }
        // 板の継ぎ目（縦）
        for (let t = -len / 2 + 0.45; t < len / 2 - 0.2; t += 0.45) { if (holes.some(v => t > v.t0 - .02 && t < v.t1 + .02 && v.y0 < 1.1)) continue; if (face === 'z') box(t, y + 0.55, sd * (off - 0.055), 0.015, 1.08, 0.01, 0x3a2a1c); else box(sd * (off - 0.055), y + 0.55, t, 0.01, 1.08, 0.015, 0x3a2a1c); }
      }
      if (!fineIwamura) {
      // 柱：隅と窓の両脇。長押（横の木）
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
      } else if (I.profile?.startsWith('honnoji_')) {
      const nailPosts = ['honnoji_sobo', 'honnoji_hojo', 'honnoji_kyakuden', 'honnoji_nijo'].includes(I.profile) ? [] : null;
      const skirtingPosts = I.profile?.startsWith('honnoji_') ? [] : null;
      // 庫裏・板倉・馬舎の柱頭は、厚さ十八センチの桁の下面で受ける。
      // 天井まで柱を伸ばして桁を貫かず、横架材との仕口へ納める（架構は推定）。
      // 窓・戸口の枠と通行の当たりは既存のまま、設営時の木部だけをそろえる。
      // 竿縁天井の座敷は間仕切り柱と同じく、回縁の下面へ柱頭を納める。
      const postH = perimeterTop;
      const entryDoor = I.profile?.startsWith('honnoji_') && I.profile !== 'honnoji_nijo'
        && k === 0 && face === 'z' && sd === ds
        ? I.doors?.find(d => d.lv === lv && d.exterior) : null;
      // 表口の敷居は壁幅いっぱいに通る。側柱と方立の脚も、その上面へ納める（推定）。
      // 建具と同じ敷居高を使い、土間・板間・畳で柱脚を床や敷居へ埋めない。
      const entryFoot = entryDoor?.sill || 0;
      for (let q = 0; q <= n; q++) {
        // 本能寺の隅柱は四隅に一本ずつ。面ごとに壁端へ立てると、
        // 十六センチずれた二本の柱が角で交差する。南北面で共通の柱を受け持つ。
        const corner = I.profile?.startsWith('honnoji_') && (q === 0 || q === n);
        if (corner && face === 'x') continue;
        const t = corner ? (q === 0 ? -1 : 1) * (len / 2 - .16) : -len / 2 + q * len / n;
        if (k === 0 && face === 'z' && sd === ds && Math.abs(t - I.door.lx) < I.door.w / 2 + .2) continue;
        // 等間隔の柱で本能寺の格子窓を縦断しない。窓の両脇は既存の縦枠で受ける。
        if (I.profile?.startsWith('honnoji_') && wins.some(o => o.face === face && o.s === sd && Math.abs(t - o.t) < o.w / 2 + .08)) continue;
        const px = face === 'z' ? t : sd * (off - .06), pz = face === 'z' ? sd * (off - .06) : t;
        let foot = Math.max(entryFoot, floorFinish(px, pz));
        // 庫裏・馬舎の土間では柱を土へ直接立てず、低い礎石で受ける（納まりは推定）。
        // 敷居で受ける正面と板間は除き、柱頭の高さを保ったまま柱脚だけを石の上へ納める。
        // 既存の色付きの形へ設営時に結合し、描画や毎コマの更新は増やさない。
        if (k === 0 && !entryFoot && ['honnoji_kuri', 'honnoji_umaya'].includes(I.profile)
          && lv.layout.rooms.some(r => r.floor === 'earth' && px >= r.x0 && px <= r.x1 && pz >= r.z0 && pz <= r.z1)) {
          box(px, y + foot + .045, pz, .24, .09, .24, 0x77736a);
          foot += .09;
        }
        if (face === 'z') box(t, y + (foot + postH) / 2, sd * (off - 0.06), 0.16, postH - foot, corner ? .16 : .14, DARK);
        else box(sd * (off - 0.06), y + (foot + postH) / 2, t, 0.14, postH - foot, 0.16, DARK);
        if (honnojiUtility && !upSt && !corner) {
          // 実際に立つ柱だけに楔を添える。窓・表口と、横へ滑る戸の前には出さない。
          // 貫の上面から先端を柱へ差し、左右の頭を柱の脇へ見せる。
          for (const rail of [.65, 1.35]) {
            if (rail + .05 <= foot || rail + .078 >= postH
              || holes.some(v => t + .2 > v.t0 && t - .2 < v.t1
                && rail + .078 > v.y0 && rail + .05 < v.y1)) continue;
            for (const side of [-1, 1]) {
              const wedge = nukiWedgeShape();
              wedge.rotateY((face === 'z' ? 0 : -Math.PI / 2) + (side < 0 ? Math.PI : 0));
              const along = t + side * .13;
              if (face === 'z') put(wedge, along, y + rail + .05, sd * (off - .06), 0x947550);
              else put(wedge, sd * (off - .06), y + rail + .05, along, 0x947550);
            }
          }
        }
        if (nailPosts) nailPosts.push(t);
        if (skirtingPosts) skirtingPosts.push(t);
      }
      if (I.profile?.startsWith('honnoji_') && k === 0 && face === 'z' && sd === ds) {
        // 等間隔の柱は入口を避けるため、戸口の両脇に方立を補う。
        // 柱の内面を開口端へ合わせ、引き戸と人の通れる幅を狭めない。
        // 鴨居の下端も動く戸の上端へ揃え、長押だけが浮く入口にしない。
        // 外壁面を中心に二本の溝を受ける。内壁寄りの枠では外側の戸が鴨居から外れる。
        const frameZ = sd * hd;
        // 庫裏・板倉・馬舎の方立も側柱と同じく桁の下面で止める。
        for (const side of [-1, 1]) {
          const x = I.door.lx + side * (I.door.w / 2 + .08);
          const foot = Math.max(entryFoot, floorFinish(x, frameZ));
          box(x, y + (foot + postH) / 2, frameZ, .16, postH - foot, .32, DARK);
          skirtingPosts.push(x);
        }
        const head = entryDoor ? entryDoor.sill + entryDoor.h : I.door.h ?? Math.min(h - .3, 2);
        // 方立の外を通る戸も鴨居で受ける。方立は太らせず、開いた框の逃げを残す。
        // 御所も naka_doors.js の十センチの溝へそろえ、上框を溝の外へずらさない。
        const track = I.profile === 'honnoji_nijo' ? .1 : .27;
        // 表口も間仕切りと同じく、黒い線を貼る代わりに六ミリの溝を彫る。
        // 框の厚さ六センチに左右一ミリの逃げを取り、溝の底は木を残す（納まりは推定）。
        // 設営時だけ既存の木部へ結合し、開閉中の形や材質は増やさない。
        const groovedEntryRail = (bottom, height, upper) => {
          const cut = .006, half = .031, depth = track * 2 + .08;
          box(0, bottom + (height + (upper ? cut : -cut)) / 2, frameZ,
            lv.w, height - cut, depth, DARK);
          const surfaceY = upper ? bottom + cut / 2 : bottom + height - cut / 2;
          let start = -depth / 2;
          for (const z of [-track, track]) {
            box(0, surfaceY, frameZ + (start + z - half) / 2,
              lv.w, cut, z - half - start, DARK);
            start = z + half;
          }
          box(0, surfaceY, frameZ + (start + depth / 2) / 2,
            lv.w, cut, depth / 2 - start, DARK);
        };
        groovedEntryRail(y + head, .1, true);
        if (I.profile !== 'honnoji_nijo') {
          // 付属棟の表戸を四センチ宙へ浮かせず、下框の下面へ敷居を納める。
          // 開いた戸の足元も受けるよう鴨居と同じ長さにし、二本の溝を横へ通す（推定）。
          // 共通の戸が使う敷居高を参照し、既存の材質別の形へ設営時だけまとめる。
          if (entryDoor) {
            groovedEntryRail(y, entryDoor.sill, false);
          }
        }
      }
      // 本能寺は間仕切りと同じ内法高で四周へ長押を巡らす（推定）。
      // 正面だけ高く、側面では戸の途中、講堂では天井際へ飛ぶ納まりを避ける。
      // 低い僧坊も天井の回縁の下へ納め、既存の形の高さだけをそろえる。
      const railY = I.profile?.startsWith('honnoji_')
        ? Math.min(Math.min(2.2, h - .3) + .24, h - (nailPosts ? .14 : .12)) : h * .8;
      // 庫裏・板倉・馬舎は二段の貫と柱上の桁で受ける。
      // 座敷用の長押まで重ねると、低い棟では桁と同じ位置を占め、
      // 講堂ほど高くない収納棟にも不要な化粧材が浮く。梁組の棟だけ省く（架構は推定）。
      if (!(honnojiUtility && !upSt)) {
        // 南北の長押を隅柱の前で通し、東西の木口はその内面へ納める（仕口は推定）。
        // 四周とも壁幅いっぱいに伸ばして角で重ねず、柱・建具の位置と内法高は保つ。
        if (nailPosts) {
          // 座敷の長押は柱の室内面へ抱かせ、柱芯を貫く角材にしない。
          // 間仕切りと同じ高さ・見付け・面取りにし、隅では木口を突き付ける（造作は推定）。
          // 床の間の切り欠きと材質別のまとめ描きは既存の仕組みを使う。
          for (const [height, yy, depth, offset, color] of [
            [.105, railY - .0075, .05, .155, 0x2e2016],
            [.015, railY + .0525, .04, .15, 0x634832],
          ]) {
            const railLen = len - (face === 'z' ? .46 : .46 + depth * 2);
            if (face === 'z') wallTrimBox(0, y + yy, sd * (off - offset), railLen, height, depth, color);
            else wallTrimBox(sd * (off - offset), y + yy, 0, depth, height, railLen, color);
          }
        } else if (I.profile !== 'moribe') {
          const railLen = I.profile?.startsWith('honnoji_') ? len - (face === 'z' ? .22 : .42) : len;
          if (face === 'z') wallTrimBox(0, y + railY, sd * (off - 0.06), railLen, 0.1, 0.1, DARK);
          else wallTrimBox(sd * (off - 0.06), y + railY, 0, 0.1, 0.1, railLen, DARK);
        }
      }
      if (nailPosts) {
        // 書院・宿坊と同じく、座敷の長押を柱へ留める所に鉄の釘隠しを置く（意匠は推定）。
        // 実際に立てた柱だけを使い、窓や戸口の上に金具を浮かせない。
        // 柱へ抱かせた長押の室内面へ角座を据える。
        // 既存の箱と材質別のまとまりへ設営時だけ足し、描画や毎コマの更新は増やさない。
        const depth = sd * (off - .184);
        for (const t of nailPosts) {
          if (face === 'z') wallTrimBox(t, y + railY, depth, .065, .065, .008, 0x302b26);
          else wallTrimBox(depth, y + railY, t, .008, .065, .065, 0x302b26);
        }
        if (k === 0 && face === 'z' && sd === ds) {
          // 表口の方立も長押の留め所。等間隔の柱を省いた分だけ釘隠しを補う（意匠は推定）。
          // 方立は外壁芯にあり、通常の柱より奥。裏飼いで長押の裏を受ける（造作は推定）。
          // 角座は四周と同じ面へ据え、釘の裏に隙間を残さない。
          // 戸口・二本溝・横へ滑る建具の上に収め、既存の箱と材質へ一度だけまとめる。
          const entryDepth = depth;
          for (const side of [-1, 1]) {
            const x = I.door.lx + side * (I.door.w / 2 + .08);
            wallTrimBox(x, y + railY, sd * (off - .095), .12, .12, .07, DARK);
            wallTrimBox(x, y + railY, entryDepth, .065, .065, .008, 0x302b26);
          }
        }
      }
      // 床種の境で幅木を切り、畳・土間でも仕上げ面から十二センチの見付けを保つ。
      const cuts = [-len / 2, len / 2];
      if (I.profile?.startsWith('honnoji_')) for (const r of lv.layout.rooms)
        for (const t of face === 'z' ? [r.x0, r.x1] : [r.z0, r.z1])
          if (t > -len / 2 && t < len / 2) cuts.push(t);
      cuts.sort((a, b) => a - b);
      // 幅木は柱・方立の側面へ突き付け、柱の中を通さない（納まりは推定）。
      // 隅柱は南北面と共有するため、四辺とも内面から張る。
      // 床種と戸口の分割を保ち、既存の木部へ設営時だけまとめる。
      let skirtingRuns = [[-len / 2, len / 2]];
      if (skirtingPosts) {
        skirtingRuns = [[-len / 2 + .24, len / 2 - .24]];
        for (const post of skirtingPosts) skirtingRuns = skirtingRuns.flatMap(([a, b]) =>
          [[a, Math.min(b, post - .08)], [Math.max(a, post + .08), b]].filter(([l, r]) => r - l > .001));
      }
      for (const [a, b, low, high] of facePanels(len, .12, holes)) for (let i = 1; i < cuts.length; i++) {
        for (const [start, end] of skirtingRuns) {
          const left = Math.max(a, cuts[i - 1], start), right = Math.min(b, cuts[i], end);
          if (right - left < .01) continue;
          const t = (left + right) / 2;
          const foot = face === 'z' ? floorFinish(t, sd * (off - .03)) : floorFinish(sd * (off - .03), t);
          const bottom = low + foot, top = high + foot;
          if (face === 'z') wallTrimBox(t, y + (bottom + top) / 2, sd * (off - .03), right - left, top - bottom, .05, DARK);
          else wallTrimBox(sd * (off - .03), y + (bottom + top) / 2, t, .05, top - bottom, right - left, DARK);
        }
      }
      } else if (nodaJoinery) {
      const posts = [];
      // 四隅は二面に別々の柱を立てず、長押の内隅を受ける一本の隅柱にする。
      // 正面・背面だけで作り、側面の柱列も同じ柱心で止める。
      if (nodaJoinery && face === 'z') posts.push(-len / 2 + .16, len / 2 - .16);
      if (nodaJoinery) for (const o of holes) for (const t of [o.t0 - .08, o.t1 + .08]) {
        if (Math.abs(t) <= len / 2 && !posts.some(p => Math.abs(p - t) < .16)) posts.push(t);
      }
      // 間仕切りの鴨居・桁の端も側壁の柱で受ける。
      // 等間隔の柱だけでは僧坊の襖や砦の板戸の境に柱がなく、横木が壁へ突き当たる。
      // 窓と戸の開口は保ち、室内生成時の同じ箱の束へ加える。
      if (nodaJoinery && face === 'x') for (const p of lv.layout.portals) {
        const t = p.z;
        if (Math.abs(t) >= len / 2 - .16 || holes.some(o => t > o.t0 - .16 && t < o.t1 + .16)
          || posts.some(q => Math.abs(q - t) < .16)) continue;
        posts.push(t);
      }
      // 野田福島の用屋は、部屋ごとの梁端と壁の柱筋を揃える推定復元。
      // 梁と同じ割り付けを使い、玄関・窓の上では短い束で受ける。
      // 先に柱筋を決め、後の等間隔の柱を重ねない。室内の生成時だけ組む。
      const beamTops = [];
      if (face === 'z' && (utilityCeiling || fortCeiling || soboCeiling || kuriCeiling)) for (const r of lv.layout.rooms) {
        if (r.floor === 'tatami' || Math.abs((sd < 0 ? r.z0 : r.z1) - sd * hd) > .01) continue;
        const x0 = r.x0 + .1, x1 = r.x1 - .1;
        const nx = Math.max(1, Math.ceil((x1 - x0) / 1.7));
        for (let j = 0; j <= nx; j++) {
          const t = x0 + (x1 - x0) * j / nx;
          if (posts.some(q => Math.abs(q - t) < .16)) continue;
          let bottom = 0;
          for (const o of holes) if (t > o.t0 - .16 && t < o.t1 + .16)
            bottom = Math.max(bottom, o.y1 + .12);
          if (bottom >= h) continue;
          if (bottom) beamTops.push({ t, bottom });
          else posts.push(t);
        }
      }
      for (let q = 0; q <= n; q++) {
        if (nodaJoinery && (q === 0 || q === n)) continue;
        const t = -len / 2 + q * len / n;
        if (k === 0 && face === 'z' && sd === ds && Math.abs(t - I.door.lx) < I.door.w / 2 + .2) continue;
        // 等間隔の柱を窓の真ん中に立てず、窓・戸口の両脇へ寄せる。
        if (nodaJoinery && (holes.some(o => t > o.t0 - .16 && t < o.t1 + .16) || posts.some(p => Math.abs(p - t) < .16))) continue;
        posts.push(t);
      }
      // 露出した梁・桁は柱頭で受ける。天井まで柱を通すと、用屋では
      // 梁へ三十センチほど貫通する。梁を隠す座敷は従来の高さを保つ。
      // 前後は通し桁、側面は奥行きの梁の下面へ、それぞれ柱頭を納める。
      const timberPostTop = t => {
        // 御影堂の独立柱につながる壁際の柱も、受ける材の下面で止める。
        // 横桁は天井下二十七センチ、奥行きの桁は八センチ。既存の柱も
        // 追加の柱も同じ高さにし、桁や格縁を柱頭で突き抜けさせない。
        if (nodaHall && lv.layout.props.some(p => p.part === 'hallPost'
          && Math.abs((face === 'x' ? p.z : p.x) - t) < .16)) return h - (face === 'x' ? .27 : .08);
        // 御影堂の内外陣境の桁は側壁の柱頭でも受ける。
        // 天井まで通すと柱が桁を貫くため、間仕切りの柱と同じ下面で止める。
        if (nodaHall && face === 'x' && lv.layout.portals.some(p => Math.abs(p.z - t) < .01)) return h - .27;
        if (!(utilityCeiling || fortCeiling || soboCeiling || kuriCeiling)) return h;
        const room = lv.layout.rooms.find(r => (face === 'z'
          ? t >= r.x0 && t <= r.x1 && Math.abs((sd < 0 ? r.z0 : r.z1) - sd * hd) < .01
          : t >= r.z0 && t <= r.z1));
        if (!room || !utilityCeiling && room.floor === 'tatami') return h;
        return h - .018 - .08 - (face === 'z' ? .2 : .24);
      };
      for (const t of posts) {
        const corner = nodaJoinery && face === 'z' && Math.abs(Math.abs(t) - (len / 2 - .16)) < .001;
        const postH = timberPostTop(t);
        if (face === 'z') box(t, y + postH / 2, sd * (off - .06), corner ? .14 : .16, postH, .14, DARK);
        else box(sd * (off - .06), y + postH / 2, t, .14, postH, .16, DARK);
        // 板間・土間の柱頭は無地の角材の交差だけにせず、柱へ差した桁のほぞを留める込栓を
        // 室内側へ見せる推定復元。座敷・堂は既存の長押の納まりを保つ。
        // 柱の内面から三ミリだけ出し、窓の開口や戸の二本の溝には足さない。
        if ((utilityCeiling || fortCeiling || soboCeiling || kuriCeiling)
          && lv.layout.rooms.some(r => r.floor !== 'tatami'
            && (face === 'z' ? t >= r.x0 && t <= r.x1
              && Math.abs((sd < 0 ? r.z0 : r.z1) - sd * hd) < .01
              : t >= r.z0 && t <= r.z1))) {
          // 天井からの固定高では、短くした柱より上の桁へ栓が浮いてしまう。
          // 前後・側面それぞれの柱頭から六センチ下げ、ほぞを受ける柱身へ納める。
          const pegY = y + postH - .06;
          if (face === 'z') box(t, pegY, sd * (off - .133), .035, .035, .006, WOOD);
          else box(sd * (off - .133), pegY, t, .006, .035, .035, WOOD);
        }
      }
      for (const { t, bottom } of beamTops) {
        const top = timberPostTop(t);
        if (top > bottom) box(t, y + (bottom + top) / 2, sd * (off - .06), .16, top - bottom, .14, DARK);
      }
      if (nodaHall) for (const p of lv.layout.props) {
        if (p.part !== 'hallPost') continue;
        // 堂内の柱筋を外周でも受ける推定復元。桁の端を柱のない壁へ突き付けない。
        // 同じ柱筋は一度だけ。窓の前には柱を立てず、窓上の束で桁を受ける。
        const t = face === 'x' ? p.z : p.x;
        if (posts.some(q => Math.abs(q - t) < .16)) continue;
        let bottom = 0;
        for (const o of holes) if (t > o.t0 - .16 && t < o.t1 + .16)
          bottom = Math.max(bottom, o.y1 + .12);
        const top = timberPostTop(t);
        if (bottom >= top) continue;
        posts.push(t);
        if (face === 'z') box(t, y + (bottom + top) / 2, sd * (off - .06), .16, top - bottom, .14, DARK);
        else box(sd * (off - .06), y + (bottom + top) / 2, t, .14, top - bottom, .16, DARK);
      }
      // 低い軒下でも長押を戸口・窓の上へ納める。戸が滑る高さを横木で塞がない。
      // 間仕切りと同じ高さで柱筋をつなぐ。開口が高い面では上へ逃がす。
      const nageshi = nodaJoinery ? Math.min(h - .08, Math.max(nodaNageshiHeight(I.kind, h), ...holes.map(o => o.y1 + .1))) : h * .8;
      // 長押の裏を柱の室内面へ添え、柱の中心へ埋めない。
      // 柱の中心から七センチの面へ、厚さ十センチの長押を接する。
      const nageshiOff = off - (nodaJoinery ? .18 : .06);
      // 四隅は正面・背面の長押へ側面の木口を突き付ける。
      // 全幅の横木を交差させず、同じ高さの上下面のちらつきも防ぐ。
      const nageshiLen = nodaJoinery ? len - (face === 'z' ? .46 : .66) : len;
      if (nodaHall && nageshiLen >= 8) {
        // 御影堂の長押を十数メートルの一本材にしない。個別の継手は推定。
        // 三分割に近い実際の柱上で上下を相欠きにし、柱のない窓上では継がない。
        // 十六センチの掛かりを上下で受け、木口の細い目地以外は隙間を残さない。
        // 生成時の木材の束へまとめ、戸の溝・通路・当たりは変えない。
        const candidates = posts.filter(t => Math.abs(t) < nageshiLen / 2 - .5
          && !holes.some(o => t > o.t0 - .16 && t < o.t1 + .16 && nageshi - .05 < o.y1 + .12));
        const joints = [];
        for (const target of [-nageshiLen / 6, nageshiLen / 6]) {
          let best = null;
          for (const t of candidates) if (Math.abs(t - target) < 1
            && (best === null || Math.abs(t - target) < Math.abs(best - target))) best = t;
          if (best !== null && !joints.includes(best)) joints.push(best);
        }
        joints.sort((a, b) => a - b);
        const ends = [-nageshiLen / 2, ...joints, nageshiLen / 2];
        for (let j = 0; j < ends.length - 1; j++) for (const upper of [false, true]) {
          const shift = upper ? -.08 : .08;
          const a = ends[j] + (j ? shift + .00075 : 0);
          const b = ends[j + 1] + (j < ends.length - 2 ? shift - .00075 : 0);
          const mid = (a + b) / 2, yy = y + nageshi + (upper ? .025 : -.025);
          if (face === 'z') box(mid, yy, sd * nageshiOff, b - a, .05, .1, DARK, null, 0);
          else box(sd * nageshiOff, yy, mid, .1, .05, b - a, DARK, null, 2);
        }
      } else {
      // 柱と長押は、それぞれの戦の柱筋・戸口へ納める。
      if (I.profile === 'iga') {
        // 伊賀は等間隔の柱だけでは戸口の脇と間仕切りの端に柱が来ない。
        // 戸口の内幅を保ち、鴨居・長押を受ける位置を優先して同じ束へまとめる。
        const jointPosts = [], jointPostSpans = new Map();
        if (I.profile === 'iga') {
          // 窓の上下枠も通し柱へ納める。柱の内面を開口の端に合わせ、格子を塞がない。
          for (const v of holes) for (const t of [v.t0 - .08, v.t1 + .08])
            if (Math.abs(t) <= len / 2 && !jointPosts.some(q => Math.abs(q - t) < .16)) jointPosts.push(t);
          // 小屋組の横梁と束の真下に柱を通す。等間隔の飾り柱だけでは梁端が板壁に突き当たる。
          if (igaOpenRoof && face === 'x') for (const b of lv.igaRoofBeams) {
            if (!jointPosts.some(q => Math.abs(q - b.z) < .16)) jointPosts.push(b.z);
            jointPostSpans.set(b.z, b.postSpan);
          }
          if (face === 'x') for (const p of lv.layout.portals)
            if (!jointPosts.some(t => Math.abs(t - p.z) < .16)) jointPosts.push(p.z);
        }
        // 館の長押は柱へ留め、鉄の釘隠しを添える推定復元。
        // 外周と間仕切りで長押が出会う柱には継ぎ目も付ける。
        // 近づいて室内を作る時だけ既存の束へ焼き込み、描く回数は増やさない。
        const igaHouse = I.profile === 'iga' && I.kind === 'yashiki';
        // 小屋の横木も間仕切りの上と高さを通す。壁高の八割では
        // 格子窓の途中で横木が途切れ、戸口の上だけ薄い切り欠きが残る。
        // 館と同じく鴨居より上へ納め、窓枠・戸口の開口高は保つ。
        const nageshiY = I.profile === 'iga' ? Math.min(2.05, h - .2) + .13 : h * .8;
        // 館の長押は柱の室内面へ掛ける。柱より壁側に置くと横木と釘隠しが
        // 柱へ埋まるため、背を柱へ重ね、表は柱面より六センチ手前へ出す。
        const nageshiOff = off - (igaHouse ? .14 : .06);
        const post = t => {
          const span = jointPostSpans.get(t) || .16;
          if (face === 'z') houseTimber(t, y + h / 2, sd * (off - .06), .16, h, .14, DARK, 'y');
          else houseTimber(sd * (off - .06), y + h / 2, t, .14, h, span, DARK, 'y');
          // 小屋の柱脚は土台へ短ほぞで差す推定復元。入口の開口には足さない。
          // 土台上の差し口と込栓を静止した束へ納め、土間から見える足元もつなぐ。
          if (igaBoardWall && Math.abs(t) < len / 2 - .24 &&
              !holes.some(v => t + span / 2 > v.t0 && t - span / 2 < v.t1 && v.y0 < .12)) {
            const surface = sd * (off - .134);
            if (face === 'z') {
              houseTimber(t, y + .09, sd * (off - .06), .08, .06, .07, DARK, 'y');
              box(t, y + .122, surface, .16, .003, .003, 0x211a14);
              box(t, y + .06, surface - sd * .003, .022, .022, .008, WOOD);
            } else {
              houseTimber(sd * (off - .06), y + .09, t, .07, .06, span / 2, DARK, 'y');
              box(surface, y + .122, t, .003, .003, span, 0x211a14);
              box(surface - sd * .003, y + .06, t, .008, .022, .022, WOOD);
            }
          }
          // 板壁の貫は柱へ差し込み、込栓で抜けを止める推定復元。
          // 横木を柱の裏へ重ねただけにせず、柱の室内面に仕口と木栓を見せる。
          // 窓・戸口に掛かる所と隅柱は避け、既存の静止した木組みへまとめる。
          if (igaBoardWall && Math.abs(t) < len / 2 - .16) {
            for (const railY of nukiHeights) if (!holes.some(v => t + .08 > v.t0 && t - .08 < v.t1
                && railY + .05 > v.y0 && railY - .05 < v.y1)) {
              const surface = sd * (off - .134);
              if (face === 'z') {
                for (const yy of [-.05, .05])
                  box(t, y + railY + yy, surface, .15, .004, .004, 0x211a14);
                box(t, y + railY, surface - sd * .003, .025, .025, .008, WOOD);
              } else {
                for (const yy of [-.05, .05])
                  box(surface, y + railY + yy, t, .004, .004, .15, 0x211a14);
                box(surface - sd * .003, y + railY, t, .008, .025, .025, WOOD);
              }
            }
          }
          if (!igaHouse || Math.abs(t) > len / 2 - .16 ||
              holes.some(v => t > v.t0 - .04 && t < v.t1 + .04 && nageshiY > v.y0 - .04 && nageshiY < v.y1 + .04)) return;
          const surface = sd * (nageshiOff - .057);
          if (face === 'z') nailCover(t, y + nageshiY, surface, face, sd);
          else {
            nailCover(surface, y + nageshiY, t, face, sd);
            if (lv.layout.portals.some(p => Math.abs(p.z - t) < .01))
              box(sd * (nageshiOff - .052), y + nageshiY, t + .06, .004, .1, .005, 0x211a14);
          }
        };
        for (let q = 0; q <= n; q++) {
          if (I.profile === 'iga' && (q === 0 || q === n)) {
            // 隅は両壁で一本の角柱を共有する。壁端に二本立てると柱どうしに
            // 隙間が残り、壁際から十六センチ内側を通る桁の柱筋ともずれる。
            // 正面・背面だけで四隅を作り、側面では重ねない。
            if (face === 'z') houseTimber((q === 0 ? -1 : 1) * (hw - .16),
              y + h / 2, sd * (hd - .16), .16, h, .16, DARK, 'y');
            // 隅の長押は正面・背面を通し、側面の木口をその内面へ突き付ける。
            // 釘隠しは通した材の上へ納め、短くした側面の木口の先へ浮かせない。
            if (igaHouse && face === 'z') {
              const t = (q === 0 ? -1 : 1) * (len / 2 - .24);
              const surface = sd * (nageshiOff - .057);
              nailCover(t, y + nageshiY, surface, face, sd);
            }
            continue;
          }
          const t = -len / 2 + q * len / n;
          if (k === 0 && face === 'z' && sd === ds && Math.abs(t - I.door.lx) < I.door.w / 2 + .2) continue;
          if (I.profile === 'iga' && holes.some(v => t + .08 > v.t0 && t - .08 < v.t1)) continue;
          if (jointPosts.some(v => Math.abs(v - t) < .16)) continue;
          post(t);
        }
        for (const t of jointPosts) post(t);
        // 伊賀の館は座敷の鴨居の上へ長押をそろえ、間仕切りから外周まで高さを通す。
        // 明かり取りを長押で横切らない。窓の上下は壁と同じ高さで切り分ける。
        if (I.profile === 'iga') {
          // 館の隅は長押同士を交差させず、通した材の外面と突き付ける内面で止める。
          // 見込み十センチ・壁から二十四センチの材心に合わせ、重複する木口をなくす。
          // 館は間仕切りと同じ成十二センチにそろえる。
          // 開口の切り欠きは保ち、既存の静止した木組みだけを納め直す。
          const railH = igaHouse ? .12 : .1;
          // 板壁の小屋も正面・背面を通し、側面はその内面で止める。
          // 柱心は壁端から十六センチ、見込みは十センチ。両面を柱心で
          // 止めると隅で五センチずつ交差するため、半分の見込みを加減する。
          const railLen = igaHouse ? len - (face === 'z' ? .38 : .58)
            : igaBoardWall ? len - (face === 'z' ? .22 : .42) : len - .32;
          const cuts = holes.map(v => ({ ...v, y0: v.y0 - nageshiY + railH / 2, y1: v.y1 - nageshiY + railH / 2 }));
          for (const [a, b, low, high] of facePanels(railLen, railH, cuts)) {
            if (face === 'z') houseTimber((a + b) / 2, y + nageshiY - railH / 2 + (low + high) / 2, sd * nageshiOff, b - a, high - low, .1, DARK, 'x');
            else houseTimber(sd * nageshiOff, y + nageshiY - railH / 2 + (low + high) / 2, (a + b) / 2, .1, high - low, b - a, DARK, 'z');
          }
        } else if (face === 'z') box(0, y + nageshiY, sd * (off - 0.06), len, 0.1, 0.1, DARK); else box(sd * (off - 0.06), y + nageshiY, 0, 0.1, 0.1, len, DARK);
        // 板壁の足元は上で組んだ木肌付きの土台だけで受ける。
        // 共通の薄い横木を重ねると、隅の納まりと戸口の木口が二重になる。
        if (igaHouse) {
          // 館の地覆は四面を一度だけ組む。正面・背面を隅柱の心まで通し、
          // 側面はその内面で止める。入口だけの追加材と共通の横木を重ねない。
          // 見込み四センチを柱筋へ納め、戸口・引き戸の溝を空けたまま、
          // 柱と共通の木肌を材の長手へ通して既存の静止した束へまとめる。
          const footLen = len - (face === 'z' ? .32 : .36);
          for (const [a, b, low, high] of facePanels(footLen, .12, holes)) {
            if (face === 'z') houseTimber((a + b) / 2, y + (low + high) / 2,
              sd * (off - .06), b - a, high - low, .04, 0x604831, 'x');
            else houseTimber(sd * (off - .06), y + (low + high) / 2,
              (a + b) / 2, .04, high - low, b - a, 0x604831, 'z');
          }
        } else if (!igaBoardWall) for (const [a, b, low, high] of facePanels(len, .12, holes)) { if (face === 'z') box((a + b) / 2, y + (low + high) / 2, sd * (off - .03), b - a, high - low, .05, DARK); else box(sd * (off - .03), y + (low + high) / 2, (a + b) / 2, .05, high - low, b - a, DARK); }
            } else if (I.profile === 'hieizan') {
        // 比叡山は外壁を組んだ時の柱筋へ合わせる。正面の戸柱は下で別に描く。
        const sharedPosts = lv.wallPosts?.find(v => v.face === face && v.side === sd);
        const posts = sharedPosts ? sharedPosts.positions : [];
        const framed = I.profile === 'hieizan' ? wins.filter(o => o.face === face && o.s === sd && (!o.shoji || I.templePaper)) : [];
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
        if (I.profile === 'hieizan') {
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
        } else if (face === 'z') box(0, y + h * 0.8, sd * (off - 0.06), len, 0.1, 0.1, DARK); else box(sd * (off - 0.06), y + h * 0.8, 0, 0.1, 0.1, len, DARK);
        for (const [a, b, low, high] of facePanels(len, .12, holes)) { if (face === 'z') box((a + b) / 2, y + (low + high) / 2, sd * (off - .03), b - a, high - low, .05, DARK); else box(sd * (off - .03), y + (low + high) / 2, (a + b) / 2, .05, high - low, b - a, DARK); }
            } else {
      if (fineIwamura) {
      // 柱：隅と窓の両脇。長押（横の木）
      const n = Math.max(2, Math.round(len / 1.9));
      const posts = [];
      // 岩村の梁を見せる小屋・社は、梁の端を通し柱で受ける推定復元。
      // 柱だけ別の均等割りにすると、梁が柱間の板壁で終わってしまう。
      // 梁を受ける面だけ同じ割付にし、窓の上は下の束で支える。
      const bearingFace = exposedIwamura && face === (crosswiseBeams ? 'x' : 'z');
      const postCount = bearingFace ? Math.round(beamRun / beamStep) : n;
      for (let q = 0; q <= postCount; q++) {
        // 岩村の隅柱は両面の柱芯を壁から十六センチ内側へそろえる。
        // 壁端のままでは隅に二本ずれて立ち、内陣の柱頭・礎盤の判定からも外れる。
        const t = fineIwamura && (q === 0 || q === postCount)
          ? (q === 0 ? -1 : 1) * (len / 2 - .16)
          : bearingFace ? -beamRun / 2 + q * beamStep : -len / 2 + q * len / n;
        if (fineIwamura && faceWins.some(o => Math.abs(t - o.t) < o.w / 2 + .08)) continue;
        posts.push(t);
      }
      // 均等割りの柱が障子や連子窓の途中へ出ないよう、窓の両脇で受ける。
      // 外の窓枠と同じ開口を使い、形は室内の既存の束へ一度だけまとめる。
      if (fineIwamura) for (const o of faceWins) for (const side of [-1, 1]) {
        const t = o.t + side * (o.w / 2 + .08);
        if (Math.abs(t) > len / 2 - .08 || posts.some(p => Math.abs(p - t) < .16)) continue;
        posts.push(t);
      }
      // 岩村の側柱は座敷・内陣の境にも立て、間仕切りの鴨居と天井の回縁を受ける。
      // 均等割りの柱だけでは、部屋の境に柱がなく小壁が宙で終わってしまう。
      // 窓の途中と既存の柱は避け、室内を組む時の木材の束へまとめる。
      if (fineIwamura && face === 'x') for (const wall of lv.layout.walls) {
        if (wall.guideOnly || Math.abs(wall.az - wall.bz) > .01) continue;
        if (Math.min(Math.abs(wall.ax - sd * off), Math.abs(wall.bx - sd * off)) > .2) continue;
        const t = wall.az;
        if (Math.abs(t) > len / 2 - .08 || posts.some(p => Math.abs(p - t) < .16)
          || faceWins.some(o => Math.abs(t - o.t) < o.w / 2 + .08)) continue;
        posts.push(t);
      }
      // 岩村の戸口で省く柱は、長押の継手や胴縁の支点からも外す。
      // 描く直前だけ柱を省くと、入口の真上に柱のない継手が残り、
      // 横木も架空の柱の位置で途切れる。以後は実際に立つ柱だけを使う。
      if (fineIwamura && k === 0 && face === 'z' && sd === ds) {
        for (let j = posts.length - 1; j >= 0; j--) {
          if (Math.abs(posts[j] - I.door.lx) < I.door.w / 2 + .2) posts.splice(j, 1);
        }
      }
      // 岩村の用屋・社は、窓や戸口のために通し柱を抜いた所でも梁を受ける。
      // まぐさ・鴨居から梁下まで束を立てる推定復元。開口と建具の通りは空ける。
      // 梁と同じ割付・向きを使い、既存の室内の束へ組み込む。
      if (bearingFace) {
        const top = h - beamH - .01;
        for (let q = -beamRun / 2 + beamStep; q < beamRun / 2 - .3; q += beamStep) {
          if (upSt && (crosswiseBeams
            ? q > upSt.hole.z0 - .15 && q < upSt.hole.z1 + .15
            : q > upSt.hole.x0 - .15 && q < upSt.hole.x1 + .15)) continue;
          const win = faceWins.find(o => Math.abs(q - o.t) < o.w / 2 + .08);
          const entry = k === 0 && face === 'z' && sd === ds && Math.abs(q - I.door.lx) < I.door.w / 2 + .2;
          if (!win && !entry) continue;
          if (!entry && posts.some(t => Math.abs(t - q) < .16)) continue;
          // 窓で抜いた柱筋は、窓台の下も腰束で受ける推定復元。
          // 上の束だけでは窓台が板壁に浮く。開口・内板戸の溝より下へ納める。
          // 床ごとの地覆の上端から立て、上げ床や土間に柱脚を埋めない。
          // 既存の壁の内側へ収めるため、通行の当たりは壁のものを共用する。
          if (win && !entry) {
            const px = face === 'z' ? q : sd * (off - .06);
            const pz = face === 'z' ? sd * (off - .06) : q;
            const room = lv.layout.rooms.find(r => px >= r.x0 && px <= r.x1
              && pz >= r.z0 && pz <= r.z1);
            const finish = room?.floor === 'boards'
              ? .012
              : room?.floor === 'earth' ? .0255 : 0;
            const foot = (room?.y || 0) + finish + .12;
            const head = win.y0 - .03;
            if (head - foot > .02) {
              const yy = y + (foot + head) / 2;
              if (face === 'z') box(q, yy, sd * (off - .06), .16, head - foot, .14, DARK);
              else box(sd * (off - .06), yy, q, .14, head - foot, .16, DARK);
            }
          }
          const bottom = Math.max(win ? win.y1 + .03 : 0,
            entry ? (I.door.h ?? Math.min(h - .3, 2)) + .1 : 0);
          const height = top - bottom;
          if (height <= .02) continue;
          const yy = y + (bottom + top) / 2;
          if (face === 'z') box(q, yy, sd * (off - .06), .16, height, .14, DARK);
          else box(sd * (off - .06), yy, q, .14, height, .16, DARK);
        }
      }
      // 岩村の堂の内陣は、柱頭の斗・肘木だけを孤立させず頭貫で柱同士をつなぐ推定復元。
      // 長押より上、斗の下面で受ける。柱の側面で止めて木を二重にせず、
      // 格子戸・窓・上げ床には張り出さない。既存の木材の束へ設営時だけ結合する。
      if (sanctuary && interiorHeadTieHeight(lv.layout, h) > .001) {
        const tieH = interiorHeadTieHeight(lv.layout, h);
        const supports = posts.filter(t => {
          const px = face === 'z' ? t : sd * (off - .06);
          const pz = face === 'z' ? sd * (off - .06) : t;
          return px >= sanctuary.x0 + .12 && px <= sanctuary.x1 - .12
            && pz >= sanctuary.z0 + .12 && pz <= sanctuary.z1 - .12;
        }).sort((a, b) => a - b);
        for (let j = 1; j < supports.length; j++) {
          const a = supports[j - 1] + .08, b = supports[j] - .08;
          if (b <= a) continue;
          const t = (a + b) / 2, yy = y + h - .26 - tieH / 2;
          if (face === 'z') box(t, yy, sd * (off - .06), b - a, tieH, .1, WOOD);
          else box(sd * (off - .06), yy, t, .1, tieH, b - a, WOOD);
        }
      }
      for (const t of posts) {
        if (k === 0 && face === 'z' && sd === ds && Math.abs(t - I.door.lx) < I.door.w / 2 + .2) continue;
        // 隅柱・礎盤・斗と肘木は正面側で一度だけ組む。側面の横木には同じ支点を残す。
        const cornerPost = fineIwamura && Math.abs(Math.abs(t) - (len / 2 - .16)) < .001;
        if (cornerPost && face === 'x') continue;
        const px = face === 'z' ? t : sd * (off - .06);
        const pz = face === 'z' ? sd * (off - .06) : t;
        // 用屋の土間の柱を土へ直接差さず、低い礎石で受ける推定復元。
        // 壁際の既存の柱だけに納め、入口の戸柱・板戸の通りには足さない。
        const earthPost = fineIwamura && boardInterior
          && interiorFloorAt(lv.layout, px, pz) === 'earth';
        const sanctuaryPost = sanctuary && px >= sanctuary.x0 + .12 && px <= sanctuary.x1 - .12
          && pz >= sanctuary.z0 + .12 && pz <= sanctuary.z1 - .12;
        // 内陣の柱は上げ床を貫かず、礎盤の上で受ける。上下の木口を同じ高さへそろえる。
        const sanctuaryFloor = sanctuaryPost
          ? (sanctuary.y || 0) + .012 : 0;
        const foot = sanctuaryPost ? sanctuaryFloor + .07 : earthPost ? .08 : 0;
        if (earthPost) {
          const x0 = Math.max(-hw + .07, px - .11), x1 = Math.min(hw - .07, px + .11);
          const z0 = Math.max(-hd + .07, pz - .11), z1 = Math.min(hd - .07, pz + .11);
          box((x0 + x1) / 2, y + .04, (z0 + z1) / 2,
            x1 - x0, .08, z1 - z0, 0x777369);
        }
        if (face === 'z') box(px, y + (h + foot) / 2, pz, .16, h - foot, cornerPost ? .16 : .14, DARK);
        else box(px, y + (h + foot) / 2, pz, .14, h - foot, .16, DARK);
        // 岩村の用屋・社は、梁を受ける柱頭にも仕口と込栓を見せる推定復元。
        // 梁の割付に合う柱だけに付け、窓脇の添柱や隅柱へ架空の仕口を増やさない。
        // 内向きの柱面に納め、既存の木材の束へ結合する。戸の通りと内法は保つ。
        if (bearingFace && t > -beamRun / 2 + .3 && t < beamRun / 2 - .3
          && Math.abs((t + beamRun / 2) / beamStep - Math.round((t + beamRun / 2) / beamStep)) < .001) {
          // 用屋・社の柱と梁を短い方杖で固める推定復元。
          // 通し柱のある梁端だけに付け、窓上の束や戸口には架けない。
          // 下端と厚みも鴨居より上へ収め、低い仮小屋の内法を保つ。
          const braceTop = y + h - beamH - .01;
          const reach = Math.min(.32, h - beamH - .01 - interiorPanelHeight(lv.layout, h) - .06);
          if (reach > .1) {
            iwamuraBraceShape ??= new THREE.BoxGeometry(1, 1, 1);
            const brace = iwamuraBraceShape.clone().scale(.07, Math.SQRT2 * reach, .07);
            if (crosswiseBeams) brace.rotateZ(sd * Math.PI / 4);
            else brace.rotateX(-sd * Math.PI / 4);
            put(brace, px - (crosswiseBeams ? sd * reach / 2 : 0),
              braceTop - reach / 2, pz - (crosswiseBeams ? 0 : sd * reach / 2), WOOD);
          }
          const jointY = y + h - beamH / 2 - .01;
          const inset = sd * (off - .132);
          if (face === 'z') {
            // 柱面の三方に梁のほぞの見付けを刻み、中央の角栓で留める。
            for (const edge of [-1, 1]) box(px + edge * .052, jointY, inset, .003, beamH * .7, .002, 0x241b12);
            box(px, jointY - beamH * .35, inset, .104, .003, .002, 0x241b12);
            box(px, jointY, inset - sd * .003, .022, .022, .006, 0x8a6a48);
          } else {
            for (const edge of [-1, 1]) box(inset, jointY, pz + edge * .052, .002, beamH * .7, .003, 0x241b12);
            box(inset, jointY - beamH * .35, pz, .002, .003, .104, 0x241b12);
            box(inset - sd * .003, jointY, pz, .006, .022, .022, 0x8a6a48);
          }
        }
        if (sanctuary) {
          const px = face === 'z' ? t : sd * (off - .06);
          const pz = face === 'z' ? sd * (off - .06) : t;
          // 既存の柱の上だけに載せ、境の格子戸・欄間より高く納める。
          // 隅では壁の内面で切り、外壁や隣室へ木口を突き出さない。
          if (sanctuaryPost) {
            // 内陣の柱脚は上げ床の上で木製の礎盤に納める推定復元。
            // 壁際で切って既存の束へまとめ、入口・窓・格子戸へ張り出さない。
            const baseX0 = Math.max(sanctuary.x0 + .07, px - .12);
            const baseX1 = Math.min(sanctuary.x1 - .07, px + .12);
            const baseZ0 = Math.max(sanctuary.z0 + .07, pz - .12);
            const baseZ1 = Math.min(sanctuary.z1 - .07, pz + .12);
            // 礎盤は一つの角箱にせず、下の敷板と柱を受ける上の台に分けた推定復元。
            // 高さと外周は保ち、室内を組む時だけ既存の木材の束へまとめる。
            box((baseX0 + baseX1) / 2, y + sanctuaryFloor + .015,
              (baseZ0 + baseZ1) / 2, baseX1 - baseX0, .03, baseZ1 - baseZ0, DARK);
            const neckX0 = Math.max(baseX0, px - .1), neckX1 = Math.min(baseX1, px + .1);
            const neckZ0 = Math.max(baseZ0, pz - .1), neckZ1 = Math.min(baseZ1, pz + .1);
            box((neckX0 + neckX1) / 2, y + sanctuaryFloor + .05,
              (neckZ0 + neckZ1) / 2, neckX1 - neckX0, .04, neckZ1 - neckZ0, DARK);
            const a = Math.max(sanctuary.x0 + .07, px - .22);
            const b = Math.min(sanctuary.x1 - .07, px + .22);
            const c = Math.max(sanctuary.z0 + .07, pz - .22);
            const d = Math.min(sanctuary.z1 - .07, pz + .22);
            box(px, y + h - .2, pz, .22, .12, .22, DARK);
            box((a + b) / 2, y + h - .1, pz, b - a, .08, .12, WOOD);
            // 外周も内陣境と同じ納まり。肘木の交点で下面を重ねない。
            const back = Math.min(d, pz - .06), front = Math.max(c, pz + .06);
            if (back > c) box(px, y + h - .1, (c + back) / 2, .12, .08, back - c, WOOD);
            if (d > front) box(px, y + h - .1, (front + d) / 2, .12, .08, d - front, WOOD);
          }
        }
      }
      // 岩村の壁際は、柱の足元を地覆でつなぐ推定復元。
      // 座敷・用屋も部屋ごとの床高に納め、畳や上げ床へ木を埋めない。
      // 戸口と窓は壁と同じ穴を抜き、既存の木材の束へ結合する。
      if (fineIwamura && goten) for (const room of lv.layout.rooms) {
        const wallZ = sd * (off - .06);
        const onRoom = face === 'z'
          ? Math.abs((sd < 0 ? room.z0 : room.z1) - sd * hd) < .01
          : Math.abs((sd < 0 ? room.x0 : room.x1) - sd * hw) < .01;
        const left = face === 'x' ? room.z0 : room.x0;
        const right = face === 'x' ? room.z1 : room.x1;
        // 畳だけでなく、板張りと土間の仕上げ厚も避けて地覆を据える。
        // 板敷きは読み込んだ素材によらず、十二ミリの仕上げ厚を使う。
        const finish = room.floor === 'tatami' ? .066
          : room.floor === 'boards' ? .012
          : room.floor === 'earth' ? .0255 : 0;
        const floorY = (room.y || 0) + finish;
        const baseY = floorY + .06;
        // 正面の地覆を通し、側面はその内面で止める。隅で上面を重ねない。
        const endInset = face === 'x' ? .22 : .1;
        if (onRoom) for (const [a, b, low, high] of facePanels(len, .12,
          holes.map(o => ({ ...o, y0: o.y0 - baseY + .06, y1: o.y1 - baseY + .06 })))) {
          // 部屋境では側柱まで通す。各室の端を一律に削ると、同じ壁に隙間が残る。
          const start = Math.max(a, left, -len / 2 + endInset);
          const end = Math.min(b, right, len / 2 - endInset);
          if (end <= start) continue;
          const t = (start + end) / 2, yy = y + baseY - .06 + (low + high) / 2;
          if (face === 'z') box(t, yy, wallZ, end - start, high - low, .12, DARK);
          else box(wallZ, yy, t, .12, high - low, end - start, DARK);
        }
      }
      // 岩村の蔵・番所・長屋と八幡社の縦板は、柱間の胴縁で受ける推定復元。
      // 板の目地だけでは支えのない一枚壁になるため、内側へ二段の横木を納める。
      // 壁を横断する別の胴縁は重ねず、この二段だけを柱の側面で受ける。
      // 戸口・窓枠・引込み先の板戸を避け、既存の木材の束へ設営時だけ結合する。
      if (fineIwamura && boardWalls) {
        posts.sort((a, b) => a - b);
        for (const railY of [.5, 1.55]) {
          const pinned = new Set();
          const cuts = holes.map(o => ({ t0: o.t0 - .08, t1: o.t1 + .08,
            y0: o.y0 - railY + .04 - .06, y1: o.y1 - railY + .04 + .06 }));
          const spans = facePanels(len, .08, cuts);
          for (let j = 1; j < posts.length; j++) for (const [a, b, low, high] of spans) {
            const left = Math.max(a, posts[j - 1] + .08), right = Math.min(b, posts[j] - .08);
            if (right - left < .05) continue;
            const t = (left + right) / 2, yy = y + railY - .04 + (low + high) / 2;
            // 外周の板戸は壁より内側へ引く。その通りより壁側に横木を収める。
            if (face === 'z') box(t, yy, sd * (off - .0525), right - left, high - low, .045, WOOD);
            else box(sd * (off - .0525), yy, t, .045, high - low, right - left, WOOD);
            // 柱へ差した胴縁の端を込栓で留める推定復元。
            // 窓枠で途中を切った横木には付けず、通し柱で受ける端だけに納める。
            // 戸口で抜いた柱にも栓を浮かせない。既存の木材の束へ結合する。
            if (low <= .001 && high >= .079) for (const end of [j - 1, j]) {
              const post = posts[end];
              const supported = end === j - 1 ? Math.abs(left - post - .08) < .001
                : Math.abs(right - post + .08) < .001;
              if (!supported || pinned.has(post) || k === 0 && face === 'z' && sd === ds
                && Math.abs(post - I.door.lx) < I.door.w / 2 + .2) continue;
              pinned.add(post);
              if (face === 'z') box(post, y + railY, sd * (off - .133), .024, .024, .006, WOOD);
              else box(sd * (off - .133), y + railY, post, .006, .024, .024, WOOD);
            }
          }
        }
      }
      // 岩村の低い小屋では長押が戸口を横切る。窓と戸口を抜いた壁の内だけに納める。
      // 主殿・侍屋敷・堂の長押は、間仕切り側と高さをそろえて柱をつなぐ。
      const nageshiY = fineIwamura && ['goten', 'yashiki', 'hondo'].includes(I.kind)
        ? Math.min(interiorPanelHeight(lv.layout, h) + .42, h - .06) : h * .8;
      const nageshiPanels = fineIwamura
        ? facePanels(len, .1, holes.map(o => ({ ...o, y0: o.y0 - nageshiY + .05, y1: o.y1 - nageshiY + .05 })))
        : [[-len / 2, len / 2, 0, .1]];
      // 岩村の長押は正面を通し、側面の木口を正面材の内面で止める。
      // 見込み十センチと壁からの位置を使い、隅で上下面を重ねない。
      // 継手・釘隠しもこの切り詰めた範囲を使い、材の外へ残さない。
      const nageshiEnd = len / 2 - (face === 'x' ? .1 + .06 + .1 / 2 : .1);
      const nageshiPieces = fineIwamura
        ? nageshiPanels.map(([a, b, low, high]) => [Math.max(a, -nageshiEnd), Math.min(b, nageshiEnd), low, high])
          .filter(([a, b]) => b > a)
        : nageshiPanels;
      for (const [a, b, low, high] of nageshiPieces) {
        if (face === 'z') box((a + b) / 2, y + nageshiY - .05 + (low + high) / 2, sd * (off - .06), b - a, high - low, .1, DARK);
        else box(sd * (off - .06), y + nageshiY - .05 + (low + high) / 2, (a + b) / 2, .1, high - low, b - a, DARK);
      }
      // 岩村の長い長押は、柱の上で相欠きに継ぐ推定復元。
      // 一本の長大な材に見せず、釘隠しの脇に上下をずらした木口を残す。
      // 開口で切れた材や隅には足さず、既存の室内の束へ一度だけ結合する。
      if (fineIwamura && ['goten', 'yashiki', 'hondo'].includes(I.kind)) for (const t of posts) {
        if (!nageshiPieces.some(([a, b, low, high]) => b - a > 3
          && t > a + .3 && t < b - .3 && low <= .001 && high >= .099)) continue;
        const joint = (along, yy, width, height) => {
          if (face === 'z') box(along, yy, sd * (off - .111), width, height, .002, 0x241b12);
          else box(sd * (off - .111), yy, along, .002, height, width, 0x241b12);
        };
        joint(t - .06, y + nageshiY + .025, .003, .05);
        joint(t, y + nageshiY, .12, .003);
        joint(t + .06, y + nageshiY - .025, .003, .05);
      }
      // 岩村の居館・堂は、柱と長押を留める所に簡素な黒鉄の釘隠しを置く推定復元。
      // 堂も内陣境・入口と同じ留め方にし、外周だけ金具が欠ける造りにしない。
      // 意匠は不明なので家紋は付けない。戸口・窓で切った長押の上だけに納める。
      // 木材と同じ室内の束へ結合し、材質や描く回数を増やさない。
      if (fineIwamura && ['goten', 'yashiki', 'hondo'].includes(I.kind)) for (const t of posts) {
        if (k === 0 && face === 'z' && sd === ds && Math.abs(t - I.door.lx) < I.door.w / 2 + .2) continue;
        if (!nageshiPieces.some(([a, b, low, high]) => t - .035 >= a && t + .035 <= b && low <= .015 && high >= .085)) continue;
        if (face === 'z') {
          box(t, y + nageshiY, sd * (off - .115), .07, .07, .01, 0x292723);
          box(t, y + nageshiY, sd * (off - .123), .018, .018, .008, 0x494338);
        } else {
          box(sd * (off - .115), y + nageshiY, t, .01, .07, .07, 0x292723);
          box(sd * (off - .123), y + nageshiY, t, .008, .018, .018, 0x494338);
        }
      }
      // 岩村の板倉・番所・長屋・社は、柱を足元でもつなぐ腰貫を見せる推定復元。
      // 柱の内に横木を通し、内側の木栓で留める。戸口・窓の穴は壁と共有する。
      // 既存の木材の束へ組み込み、当たりや毎コマの処理は増やさない。
      if (fineIwamura && boardWalls) {
        const tieY = .6, tieH = .12, tieD = .08;
        // 正面の貫を通し、側面の貫はその内面で止める推定復元。
        // 四隅で木を交差させると上下面が重なるため、材の見込みから端を決める。
        const tieEnd = len / 2 - (face === 'x' ? .1 + .06 + tieD / 2 : 0);
        for (const [a, b, low, high] of facePanels(len, tieH,
          holes.map(o => ({ ...o, y0: o.y0 - tieY + tieH / 2, y1: o.y1 - tieY + tieH / 2 })))) {
          const left = Math.max(a, -tieEnd), right = Math.min(b, tieEnd);
          if (right <= left) continue;
          const yy = y + tieY - tieH / 2 + (low + high) / 2;
          if (face === 'z') box((left + right) / 2, yy, sd * (off - .06), right - left, high - low, tieD, WOOD);
          else box(sd * (off - .06), yy, (left + right) / 2, tieD, high - low, right - left, WOOD);
        }
        for (const t of posts) {
          // 側面の貫を止めた隅には、材から外れた木栓を残さない。
          if (face === 'x' && Math.abs(t) + .02 > tieEnd) continue;
          // 戸口へ柱を置かなかった所には木栓も描かない。
          if (k === 0 && face === 'z' && sd === ds && Math.abs(t - I.door.lx) < I.door.w / 2 + .2) continue;
          if (holes.some(o => t > o.t0 - .03 && t < o.t1 + .03 && tieY > o.y0 - .03 && tieY < o.y1 + .03)) continue;
          if (face === 'z') box(t, y + tieY, sd * (off - .145), .04, .04, .03, WOOD);
          else box(sd * (off - .145), y + tieY, t, .03, .04, .04, WOOD);
        }
      }
      // 岩村の平屋は上で床高に合わせた地覆を組む。旧来の床高の横木を重ねない。
      if (!fineIwamura || !goten) for (const [a, b, low, high] of facePanels(len, .12, holes)) { if (face === 'z') box((a + b) / 2, y + (low + high) / 2, sd * (off - .03), b - a, high - low, .05, DARK); else box(sd * (off - .03), y + (low + high) / 2, (a + b) / 2, .05, high - low, b - a, DARK); }

      } else {
      const n = Math.max(2, Math.round(len / 1.9)), span = len;
      for (let q = 0; q <= n; q++) {
        const t = Math.max(-len / 2, Math.min(len / 2, -span / 2 + q * span / n));
        if (k === 0 && face === 'z' && sd === ds && Math.abs(t - I.door.lx) < I.door.w / 2 + .2) continue;
        const postZ = face === 'z' ? sd * hd : t;
        const bottom = earth && postZ >= earth.z0 && postZ <= earth.z1 ? earth.y : 0;
        // 民家と小堂の隅は二面で一本の柱を共有する。
        // 壁端のまま各面へ柱を立てると、芯が十六センチずれた二本になり、
        // 両面の長押も同じ隅柱を抱けない。正背面で内側の芯へ一度だけ立てる。
        const villageCorner = (villageHome || villageHall) && (q === 0 || q === n);
        if (villageHall && (face === 'z' || !villageCorner)) {
          // 小堂の外周も内陣境と同じ丸柱とする推定復元。柱頭の角材で肘木を受ける。
          // 元の見付けに収め、窓・長押・戸の溝を狭めない。原形は堂全体で共用する。
          // 柱も長押・肘木と同じ縦木目にし、静止した木材の束へまとめる。
          // 胴の最大幅と高さは保ち、窓や障子の通り道を狭めない。
          const px = face === 'z' ? (villageCorner ? Math.sign(t) * (hw - .16) : t) : sd * (off - .06);
          const pz = face === 'z' ? sd * (off - .06) : t;
          const post = templeRoundPost(.08, h - .12, DARK);
          post.position.set(px, y + (h - .12) / 2, pz); ceilingBoards.add(post);
          entryTimber(px, y + h - .06, pz, .16, .12, .16, DARK);
        } else if (villageHome) {
          // 民家の角柱も建具・長押と同じ木材で組む。柱だけ単色の箱にせず、
          // 木目を上下へ通す。隅柱の共有・土間までの長さと見付けは保つ。
          // 寸法別の原形と材質を共用し、既存の静止した内装の束へまとめる。
          if (face === 'z') entryTimber(villageCorner ? Math.sign(t) * (hw - .16) : t,
            y + (bottom + h) / 2, sd * (off - .06),
            .16, h - bottom, villageCorner ? .16 : .14, DARK);
          else if (!villageCorner) entryTimber(sd * (off - .06), y + (bottom + h) / 2, t,
            .14, h - bottom, .16, DARK);
        } else if (face === 'z') box(villageCorner ? Math.sign(t) * (hw - .16) : t,
          y + (bottom + h) / 2, sd * (off - 0.06),
          .16, h - bottom, villageCorner ? .16 : .14, DARK);
        else if (!villageCorner) box(sd * (off - 0.06), y + (bottom + h) / 2, t, 0.14, h - bottom, 0.16, DARK);
        if (villageHall) {
          // 小堂の柱頭は簡素な肘木で格天井の回縁を受ける推定復元。
          // 長押の上端（天井下十六センチ）から一センチ空け、回縁の下面まで二段で受ける。
          // 肘木を十二センチ厚にすると長押へ八センチ食い込み、回縁とも面が重なる。
          // 隅では肘木を壁の内側へ寄せ、外壁の外へ木口を突き出させない。
          // 腰板の受け木・格縁と同じ木材を使い、塗りつぶした部材だけを残さない。
          const head = Math.max(-len / 2 + .22, Math.min(len / 2 - .22, t));
          if (villageCorner) {
            // 隅柱の肘木は正背面で一度だけ組む。二面で別々に置くと
            // 柱芯からずれた木が重なり、同じ高さの上下面もちらつく。
            // 二方向の回縁を受ける鉤形にし、木口を突き付けて重ねない。
            if (face === 'z') {
              const sx = Math.sign(t), cx = sx * (hw - .16), cz = sd * (hd - .16);
              for (const [length, height, top] of [[.34, .04, .13], [.44, .03, .095]]) {
                entryTimber(cx - sx * (length - .24) / 2, y + h - top, cz,
                  length, height, .24, DARK);
                entryTimber(cx, y + h - top, cz - sd * length / 2,
                  .24, height, length - .24, DARK);
              }
            }
          }
        }
      }
      // 森部の屋敷は戸の上へ内法長押をそろえ、外の戸口（高さ二・二メートル）を横切らない。
      const nageshiY = I.profile === 'moribe' && I.kind === 'yashiki' ? 2.32
        : I.profile === 'moribe' && I.kind === 'hondo' ? 2.72
        : toride ? Math.max(h * .8, (I.door.h || 1.9) + .06) : h * .8;
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
      }
      }
      // 民家は土間の低さに合わせた地覆、小堂は腰板の地覆で足元を受ける。
      // 共通の巾木を重ねると、土間だけ板間の高さに横木が浮き、柱にも食い込む。
      if (!villageHall && !villageHome) for (const [a, b, low, high] of facePanels(len, .12, holes)) { if (face === 'z') box((a + b) / 2, y + (low + high) / 2, sd * (off - .03), b - a, high - low, .05, DARK); else box(sd * (off - .03), y + (low + high) / 2, (a + b) / 2, .05, high - low, b - a, DARK); }

      }
    }
    }
    if (k === 0 && (villageHome || villageHall)) {
      // 外壁と内壁の間の見込みを木枠で受ける。戸はさらに室内側の二本の溝を滑り、縦枠には当たらない。
      // 戸口の幅を狭めず、動かない三本の木だけを既存の内装の束へまとめる。
      const dh = I.door.h ?? Math.min(h - .3, 2), dz = ds * hd;
      // 民家の板戸と同じく縦枠も土間まで届かせ、下端だけ宙に残さない。
      const bottom = earth ? earth.y : 0;
      for (const side of [-1, 1]) entryTimber(I.door.lx + side * (I.door.w / 2 + .05),
        y + (bottom + dh) / 2, dz, .1, dh - bottom, .3, DARK);
      entryTimber(I.door.lx, y + dh + .05, dz, I.door.w + .2, .1, .3, DARK);
    }
    for (const o of wins) {
      const [px, pz] = o.face === 'z' ? [o.t, o.s * (hd - 0.1)] : [o.s * (hw - 0.1), o.t];
      if (!I.open && I.profile?.startsWith('honnoji_')) {
        // 付属棟の窓は、格子・障子の周りを窓台・まぐさ・縦枠で受ける（細部は推定）。
        // 開口の外へ枠を納め、格子の見える幅と既存の当たりを保つ。
        // 外壁と内壁をまたぐ奥行きにし、壁厚の途中に格子だけが浮く形を避ける。
        // 設営時の共通の材質別の形へ足し、窓ごとの描画や毎コマの更新を増やさない。
        const frameY = y + (o.y0 + o.y1) / 2, frameH = o.y1 - o.y0;
        for (const yy of [y + o.y0 - .04, y + o.y1 + .04]) {
          if (o.face === 'z') box(px, yy, pz + o.s * .05, o.w + .16, .08, .32, DARK);
          else box(px + o.s * .05, yy, pz, .32, .08, o.w + .16, DARK);
        }
        for (const edge of [-1, 1]) {
          const t = edge * (o.w / 2 + .04);
          if (o.face === 'z') box(px + t, frameY, pz + o.s * .05, .08, frameH, .32, DARK);
          else box(px + o.s * .05, frameY, pz + t, .32, frameH, .08, DARK);
          if (!upSt) {
            // 僧坊・方丈・堂も、窓で省いた柱を上下の束で補う（架構は推定）。
            // 畳・土間の仕上げ面から窓台を受け、上は桁か天井の回縁の下面で止める。
            // 開口と当たりは保ち、既存の木部へ設営時だけまとめる。
            const lx = o.face === 'z' ? px + t : o.s * (hw - .16);
            const lz = o.face === 'z' ? o.s * (hd - .16) : pz + t;
            let foot = 0;
            for (const r of lv.layout.rooms) if (lx >= r.x0 && lx <= r.x1 && lz >= r.z0 && lz <= r.z1)
              foot = Math.max(foot, (r.y || 0) + (r.floor === 'tatami' ? .066 : r.floor === 'earth' ? .0255 : 0));
            // 庫裏・馬舎の窓下の束も、土間へ直接差さず礎石で受ける（納まりは推定）。
            // 壁の柱と同じ九センチの石に載せ、窓台・開口の高さは動かさない。
            // 板間側には置かず、既存の材質別の形へ設営時だけまとめる。
            if (k === 0 && ['honnoji_kuri', 'honnoji_umaya'].includes(I.profile)
              && lv.layout.rooms.some(r => r.floor === 'earth'
                && lx >= r.x0 && lx <= r.x1 && lz >= r.z0 && lz <= r.z1)) {
              box(lx, y + foot + .045, lz, o.face === 'z' ? .16 : .22, .09,
                o.face === 'z' ? .22 : .16, 0x77736a);
              foot += .09;
            }
            const head = h - (honnojiUtility || templeCeiling ? .18 : .08);
            for (const [bottom, top] of [[foot, o.y0 - .08], [o.y1 + .08, head]]) {
              if (top <= bottom) continue;
              const yy = y + (bottom + top) / 2;
              if (o.face === 'z') box(lx, yy, lz, .08, top - bottom, .14, DARK);
              else box(lx, yy, lz, .14, top - bottom, .08, DARK);
            }
          }
        }
      }
      const across = o.face === 'z' ? 'x' : 'z';
      const depthAxis = o.face === 'z' ? 'z' : 'x';
      if (o.sliding && !fineIwamura) {
        if ((villageHome || villageHall) && o.face === 'z') {
          // 室内側の障子の溝から外の窓枠まで見込み板でつなぐ。
          // 溝の中心は壁端から三十六センチ内側、枠の見込みは片側十一センチ。
          // 紙と框の通り道を空け、敷居・鴨居の壁側の端へ突き付ける。
          // 小堂の外枠は壁芯から十センチ外、正面は厚さ十六センチ、裏の格子窓は十八センチ。
          // 内寸との差十五センチも含めて内面まで届かせ、開いた障子の四周に光の隙間を残さない。
          const inner = hd - .36 + .11;
          const outer = villageHall ? hd + .15 + .1 - (o.exteriorLattice ? .09 : .08) : hd + .15;
          const depth = outer - inner, wz = o.s * (inner + outer) / 2, wh = o.y1 - o.y0;
          for (const side of [-1, 1]) entryTimber(o.t + side * (o.w / 2 + .025),
            y + (o.y0 + o.y1) / 2, wz, .05, wh + .1, depth, DARK);
          for (const yy of [o.y0 - .025, o.y1 + .025])
            entryTimber(o.t, y + yy, wz, o.w, .05, depth, DARK);
        }
        // 紙と桟は動く戸で共用するが、障子越しの採光は室内の焼き込みにも残す。
        // 光源は増やさず、設楽原の民家・小堂も既存の窓明かりを使う。
        winPts.push([px, y + (o.y0 + o.y1) / 2, pz, o.shoji ? .7 : 1]);
        continue;
      }
      if (o.shoji || o.sliding) {   // 明かり障子と、連子窓の内側の板戸
        if (o.sliding) {
          // 動く障子の二筋を窓枠の内へ納める。紙は共通の引き戸だけに描き、開口を塞がない。
          const sideWindow = o.face === 'x', rail = o.s * ((sideWindow ? hw : hd) - .3);
          for (const height of [o.y0, o.y1]) {
            const direction = height === o.y0 ? 1 : -1;
            // 岩村の窓は溝底を框から八ミリ離す。元の六センチ角の横木へ
            // 黒い面を貼るだけでは、框の下端・上端と溝底が同じ面になる。
            // 横木の溝側を削り、残した三本の畝で深さ二十四ミリの溝を作る推定復元。
            const baseY = y + height - (fineIwamura ? direction * .004 : 0);
            const baseH = fineIwamura ? .052 : .06;
            if (sideWindow) box(rail, baseY, o.t, .18, baseH, o.w + .12, DARK);
            else box(o.t, baseY, rail, o.w + .12, baseH, .18, DARK);
            const trackOffset = fineIwamura ? NAKA_WINDOW_TRACK : .045;
            for (const track of [-trackOffset, trackOffset]) {
              const yy = y + height + direction * (fineIwamura ? .0225 : .031);
              const grooveW = o.w + (fineIwamura ? .024 : 0);
              // 岩村の窓も戸厚六センチに両側二ミリの遊びを取り、
              // 敷居・鴨居の溝底を框の幅まで通す。細い線だけでは
              // 戸じゃくりとつながらず、厚い框を浅い傷へ載せた形になる。
              const grooveD = fineIwamura ? .064 : .014;
              const grooveH = fineIwamura ? .001 : .003;
              if (sideWindow) box(rail + track, yy, o.t, grooveD, grooveH, grooveW, 0x1e160f);
              else box(o.t, yy, rail + track, grooveW, grooveH, grooveD, 0x1e160f);
            }
            // 岩村の窓は黒い線だけの溝にせず、樋端と中樋で二筋を分ける推定復元。
            // 障子・板戸の框は各筋の中心から三センチ以内。三本の縁はその外へ納め、
            // 既存の引違いの動きと四センチの引き残しを保つ。木材の束へ一度だけ結合する。
            if (fineIwamura) {
              const yy = y + height + direction * .034;
              // 六・四センチ幅の溝を残し、中樋と樋端も戸と同じ筋間へ納める。
              const outer = NAKA_WINDOW_TRACK + .042;
              for (const ridge of [-outer, 0, outer]) {
                const depth = ridge === 0 ? .012 : .02;
                // 樋端は縦枠の内面で止め、戸じゃくりの縁へ重ねない。
                if (sideWindow) box(rail + ridge, yy, o.t, depth, .024, o.w, WOOD);
                else box(o.t, yy, rail + ridge, o.w, .024, depth, WOOD);
              }
            }
          }
          for (const side of [-1, 1]) {
            const edge = o.t + side * (o.w / 2 + .03), yy = y + (o.y0 + o.y1) / 2;
            if (fineIwamura) {
              // 縦枠にも二筋の戸じゃくりを設け、閉めた障子・板戸の框を受ける。
              // 戸の端は十二ミリ入る。奥の木を残し、溝だけを三ミリの遊びで抜く。
              // 縦材は敷居の上面から鴨居の下面まで。四隅の同じ面を重ねない。
              const jambH = o.y1 - o.y0 - .06;
              const back = edge + side * .015;
              if (sideWindow) box(rail, yy, back, .18, jambH, .03, DARK);
              else box(back, yy, rail, .03, jambH, .18, DARK);
              const outer = NAKA_WINDOW_TRACK + .042;
              for (const [offset, depth] of [[-outer, .02], [0, .012], [outer, .02]]) {
                const front = edge - side * .015;
                if (sideWindow) box(rail + offset, yy, front, depth, jambH, .03, DARK);
                else box(front, yy, rail + offset, .03, jambH, depth, DARK);
              }
              // 窓の縦枠は敷居・鴨居へほぞ差しし、木栓で留める推定復元。
              // 四隅の木口と栓を室内外へ示す。戸じゃくりの中へは出さず、
              // 障子・板戸の二筋を空け、既存の室内の束へ一度だけ結合する。
              for (const height of [o.y0, o.y1]) for (const face of [-1, 1]) {
                const surface = rail + face * .0905, jointY = y + height;
                if (sideWindow) {
                  for (const end of [-1, 1]) box(surface, jointY, edge + end * .015, .001, .022, .002, 0x241b12);
                  box(surface, jointY + .012, edge, .001, .002, .03, 0x241b12);
                  box(surface, jointY - .012, edge, .001, .002, .03, 0x241b12);
                  box(rail + face * .091, jointY, edge, .002, .009, .009, 0x6a5038);
                } else {
                  for (const end of [-1, 1]) box(edge + end * .015, jointY, surface, .002, .022, .001, 0x241b12);
                  box(edge, jointY + .012, surface, .03, .002, .001, 0x241b12);
                  box(edge, jointY - .012, surface, .03, .002, .001, 0x241b12);
                  box(edge, jointY, rail + face * .091, .009, .009, .002, 0x6a5038);
                }
              }
            } else if (sideWindow) box(rail, yy, edge, .18, o.y1 - o.y0, .06, DARK);
            else box(edge, yy, rail, .06, o.y1 - o.y0, .18, DARK);
          }
          // 岩村の障子は壁の内へ引いて納めているため、窓穴までの見込み板で枠をつなぐ。
          // 敷居・鴨居だけを宙へ浮かせず、四方の板を開口の外へ納めて紙と溝を空ける。
          // 既存の室内の束へ結合し、窓の当たりと戸の滑る範囲はそのまま使う。
          const frameEdge = rail + o.s * .09, wallEdge = sideWindow ? px : pz;
          const reveal = (frameEdge + wallEdge) / 2, depth = Math.abs(frameEdge - wallEdge);
          for (const height of [o.y0, o.y1]) {
            if (sideWindow) box(reveal, y + height, o.t, depth, .06, o.w + .12, WOOD);
            else box(o.t, y + height, reveal, o.w + .12, .06, depth, WOOD);
          }
          for (const side of [-1, 1]) {
            const edge = o.t + side * (o.w / 2 + .03), yy = y + (o.y0 + o.y1) / 2;
            if (sideWindow) box(reveal, yy, edge, depth, o.y1 - o.y0 - .06, .06, WOOD);
            else box(edge, yy, reveal, .06, o.y1 - o.y0 - .06, depth, WOOD);
          }
          // 板戸を閉めた窓の前へ、開口の光を焼き込まない。
          if (!o.shutter) winPts.push([px, y + (o.y0 + o.y1) / 2, pz, .7]);
          continue;
        }
        if (I.templePaper) {
          // 明かり障子の戸は naka_doors が作る。ここでは引き込み先まで溝を通す。
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
        if (I.profile === 'anegawa' && S.quality === 'high') {
          // 明かり取りの障子は縦棒だけにせず、四辺の框で紙と横組子を受ける。
          // 戸口の可動障子とは分け、既存の窓の範囲へ納める推定復元。
          // 框と組子も柱・窓台と同じ木目を使い、材の長手へ通す。
          // 紙は組子の外側へ貼り、室内からは桟、外からは紙越しの桟を見せる。
          // 共有の箱と材質で室内へ結合し、部品数と窓の開口は保つ。
          const ph = o.y1 - o.y0, py = y + (o.y0 + o.y1) / 2;
          const fitting = (t, yy, w, hh, depth, color, emit = false, outward = 0) => {
            const axis = hh > w ? 'y' : o.face === 'z' ? 'x' : 'z';
            const normal = o.s * (-.05 + outward);
            if (o.face === 'z') {
              if (emit) box(px + t, yy, pz + normal, w, hh, depth, color, true);
              else timberBox(px + t, yy, pz + normal, w, hh, depth, color, axis);
            } else {
              if (emit) box(px + normal, yy, pz + t, depth, hh, w, color, true);
              else timberBox(px + normal, yy, pz + t, depth, hh, w, color, axis);
            }
          };
          // 厚さ十二ミリの紙が組子の中央を貫く作りを改め、
          // 厚さ一ミリの紙を桟の外面（二十ミリ）へ接して貼る。
          // 四辺は框の内面へ一ミリ掛け、斜めから見ても隙間を作らない。
          fitting(0, py, o.w - .098, ph - .098, .001, 0xd8d0b8, true, .0205);
          for (const side of [-1, 1]) {
            fitting(side * (o.w / 2 - .025), py, .05, ph, .07, DARK);
            fitting(0, py + side * (ph / 2 - .025), o.w - .1, .05, .07, DARK);
          }
          const columns = Math.max(2, Math.round((o.w - .1) / .22));
          const rows = Math.max(2, Math.round((ph - .1) / .28));
          for (let q = 1; q < columns; q++)
            fitting(-o.w / 2 + .05 + (o.w - .1) * q / columns, py, .018, ph - .1, .04, DARK);
          // 横組子の木口は縦組子の側面へ納める。交点に同じ面を重ねない。
          for (let q = 1; q < rows; q++) for (let col = 0; col < columns; col++) {
            const start = -o.w / 2 + .05 + (o.w - .1) * col / columns + (col ? .009 : 0);
            const end = -o.w / 2 + .05 + (o.w - .1) * (col + 1) / columns - (col + 1 < columns ? .009 : 0);
            fitting((start + end) / 2, y + o.y0 + .05 + (ph - .1) * q / rows,
              end - start, .018, .04, DARK);
          }
          winPts.push([px, py, pz, .7]);
          continue;
        }
        const [wx, wz] = I.P(px, pz);
        const bought = naibu && addNaibu(naibu, 'slide_door_c', wx, y + o.y0, wz, o.w, o.y1 - o.y0, .055, I.rot + (o.face === 'x' ? Math.PI / 2 : 0));
        if (!bought) {
          if (o.face === 'z') box(px, y + (o.y0 + o.y1) / 2, pz - o.s * 0.05, o.w, o.y1 - o.y0, 0.02, 0xd8d0b8, true); else box(px - o.s * 0.05, y + (o.y0 + o.y1) / 2, pz, 0.02, o.y1 - o.y0, o.w, 0xd8d0b8, true);
          for (let q = 1; q < 4; q++) { const t = -o.w / 2 + q * o.w / 4; if (o.face === 'z') box(px + t, y + (o.y0 + o.y1) / 2, pz - o.s * 0.07, 0.025, o.y1 - o.y0, 0.02, DARK); else box(px - o.s * 0.07, y + (o.y0 + o.y1) / 2, pz + t, 0.02, o.y1 - o.y0, 0.025, DARK); }
        }
      } else {
        if (o.paperBacked) {
          // 座敷の連子窓の内側へ紙と細い組子を納め、外の格子・窓枠には重ねない。
          // 既存の箱と共有材質へまとめ、窓ごとの材質や毎コマの処理を増やさない。
          const ph = o.y1 - o.y0, py = y + (o.y0 + o.y1) / 2;
          // 紙と組子だけを開口へ浮かせず、四周を障子の框で受ける（造作は推定）。
          // 上下框を通し、縦框と組子は内面で止める。薄い紙は組子の裏面へ接して張る。
          // 全て窓の内寸へ納め、外の連子・窓枠と通行の当たりは保つ。
          const frame = .035, clearW = o.w - frame * 2, clearH = ph - frame * 2;
          const pane = o.s * .0585, bars = o.s * .075;
          if (o.face === 'z') box(px, py, pz - pane, clearW, clearH, .008, 0xd8d0b8, true);
          else box(px - pane, py, pz, .008, clearH, clearW, 0xd8d0b8, true);
          for (const edge of [-1, 1]) {
            const yy = py + edge * (ph - frame) / 2;
            const t = edge * (o.w - frame) / 2;
            if (o.face === 'z') {
              box(px, yy, pz - bars, o.w, frame, .025, DARK);
              box(px + t, py, pz - bars, frame, clearH, .025, DARK);
            } else {
              box(px - bars, yy, pz, .025, frame, o.w, DARK);
              box(px - bars, py, pz + t, .025, clearH, frame, DARK);
            }
          }
          for (let q = 1; q < 4; q++) {
            const t = -clearW / 2 + q * clearW / 4, yy = py - clearH / 2 + clearH * q / 4;
            if (o.face === 'z') {
              box(px + t, py, pz - bars, .025, clearH, .025, DARK);
              box(px, yy, pz - bars, clearW, .025, .025, DARK);
            } else {
              box(px - bars, py, pz + t, .025, clearH, .025, DARK);
              box(px - bars, yy, pz, .025, .025, clearW, DARK);
            }
          }
        }
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
      } else if (nodaJoinery) {
        if (!I.open && !o.outerLattice) for (let q = -1; q <= 1; q++) { const t = q * o.w * 0.3; if (o.face === 'z') box(px + t, y + (o.y0 + o.y1) / 2, pz, 0.05, o.y1 - o.y0, 0.05, DARK); else box(px, y + (o.y0 + o.y1) / 2, pz + t, 0.05, o.y1 - o.y0, 0.05, DARK); }
        if (nodaJoinery) {
          // 格子と内障子の間は、窓台だけでなく四周の見込み板で納める。
          // 壁の切り口を室内へ露出させず、内障子の外側の框から三センチ離す。
          // 開口は狭めず、壁の範囲に収めた静止材を既存の箱の束へ加える。
          const cy = y + (o.y0 + o.y1) / 2, wh = o.y1 - o.y0;
          for (const yy of [y + o.y0 - .03, y + o.y1 + .03]) {
            if (o.face === 'z') box(px, yy, pz - o.s * .09, o.w, .06, .18, DARK);
            else box(px - o.s * .09, yy, pz, .18, .06, o.w, DARK);
          }
          // 竪板は既存の窓脇柱の室内端から延ばす。柱と同じ面を重ねず、
          // 上下の窓台・まぐさの木口も両脇の板で受ける。
          for (const side of [-1, 1]) {
            const t = side * (o.w / 2 + .03);
            if (o.face === 'z') box(px + t, cy, pz - o.s * .155, .06, wh + .12, .05, DARK);
            else box(px - o.s * .155, cy, pz + t, .05, wh + .12, .06, DARK);
          }
        } else if (o.face === 'z') box(px, y + o.y0 - 0.03, pz - o.s * 0.05, o.w + 0.2, 0.06, 0.16, DARK); else box(px - o.s * 0.05, y + o.y0 - 0.03, pz, 0.16, 0.06, o.w + 0.2, DARK);

} else {
        if (I.profile === 'iga') {
          if (!I.open) for (let q = -1; q <= 1; q++) {
            const t = q * o.w * .3, iga = I.profile === 'iga';
            // 伊賀の縦格子は窓台・まぐさへ二センチ差す推定復元。
            // 木口を枠の面へ突き合わせるだけにせず、両面へ差し口を見せる。
            // 開口と戸の溝は保ち、既存の木材・静止した束へまとめる。
            const barH = o.y1 - o.y0 + (iga ? .04 : 0);
            if (o.face === 'z') houseTimber(px + t, y + (o.y0 + o.y1) / 2, pz, .05, barH, .05, DARK, 'y');
            else houseTimber(px, y + (o.y0 + o.y1) / 2, pz + t, .05, barH, .05, DARK, 'y');
            if (iga) for (const yy of [y + o.y0 - .01, y + o.y1 + .01]) for (const face of [-1, 1]) {
              // 枠の表面は格子の中心から三センチ／十三センチ。
              // 格子の表へ置くと枠へ埋まるので、枠の見込みへ合わせる。
              const surface = -o.s * .05 + face * .081;
              for (const edge of [-1, 1]) {
                if (o.face === 'z') box(px + t + edge * .027, yy, pz + surface, .003, .02, .002, 0x211a14);
                else box(px + surface, yy, pz + t + edge * .027, .002, .02, .003, 0x211a14);
              }
            }
          }
          if (o.face === 'z') houseTimber(px, y + o.y0 - 0.03, pz - o.s * 0.05, o.w + 0.2, 0.06, 0.16, DARK, across); else houseTimber(px - o.s * 0.05, y + o.y0 - 0.03, pz, 0.16, 0.06, o.w + 0.2, DARK, across);
          // 伊賀の明かり取りは上枠も柱へ渡す。格子の上端を壁へ差しただけの形にしない。
          if (I.profile === 'iga') {
            // 明かり取りの格子は横桟で縦材をつなぐ推定復元。
            // 相欠きの交点を同じ厚みへ納め、内側を滑る板戸・障子の溝へ張り出さない。
            // 木口は左右の見込み板へ差し、既存の木材と静止した室内の束を使う。
            if (!I.open) {
              const midY = y + (o.y0 + o.y1) / 2;
              if (o.face === 'z') houseTimber(px, midY, pz, o.w + .03, .04, .05, DARK, across);
              else houseTimber(px, midY, pz, .05, .04, o.w + .03, DARK, across);
              // 縦材と横桟の境は木の色だけで消さず、相欠きの継ぎ目を両面へ出す。
              for (let q = -1; q <= 1; q++) for (const edge of [-1, 1]) for (const side of [-1, 1]) {
                const t = q * o.w * .3 + edge * .025;
                if (o.face === 'z') box(px + t, midY, pz + side * .0255, .002, .04, .001, 0x211a14);
                else box(px + side * .0255, midY, pz + t, .001, .04, .002, 0x211a14);
              }
            }
            if (o.face === 'z') houseTimber(px, y + o.y1 + .03, pz - o.s * .05, o.w + .2, .06, .16, DARK, across);
            else houseTimber(px - o.s * .05, y + o.y1 + .03, pz, .16, .06, o.w + .2, DARK, across);
            // 明かり取りの外には雨除けの小庇を付ける推定復元。
            // 板は外へ水が落ちる勾配で重ね、両脇の柱から出した持送りで受ける。
            // 内側の雨戸・障子の溝には触れず、共通の木材の束へ焼き込む。
            if (!I.open) {
              const zFace = o.face === 'z', yaw = zFace ? -o.s * Math.PI / 2 : o.s > 0 ? 0 : Math.PI;
              const count = Math.ceil((o.w + .32) / .22), boardW = (o.w + .32) / count;
              for (let q = 0; q < count; q++) {
                const t = -o.w / 2 - .16 + (q + .5) * boardW;
                houseTimber(px + (zFace ? t : o.s * .37), y + o.y1 + .12,
                  pz + (zFace ? o.s * .37 : t), .42, .035, boardW + .012,
                  q % 2 ? WOOD : DARK, 'x', -.12, yaw);
              }
              for (const side of [-1, 1]) {
                const t = side * (o.w / 2 + .08);
                houseTimber(px + (zFace ? t : o.s * .34), y + o.y1 + .06,
                  pz + (zFace ? o.s * .34 : t), .36, .07, .06,
                  DARK, 'x', -.12, yaw);
              }
            }
            // 外壁と内壁の間の見込みを板でつなぐ。窓の横から壁の裏へ見通せる隙間を残さない。
            // 外壁は内寸より九センチ外、内壁は十センチ内。壁厚六センチも含め、
            // 縦枠・窓台・まぐさを両壁の表面まで渡す。格子と開口の内幅は保つ。
            // 中心は壁の中心線間の中点に保ち、見込みだけを両端へ三センチ伸ばす。
            const reveal = .25, mid = o.s * .095;
            const wh = o.y1 - o.y0, wy = y + (o.y0 + o.y1) / 2;
            for (const side of [-1, 1]) {
              if (o.face === 'z') houseTimber(px + side * (o.w / 2 + .015), wy, pz + mid, .03, wh, reveal, WOOD, 'y');
              else houseTimber(px + mid, wy, pz + side * (o.w / 2 + .015), reveal, wh, .03, WOOD, 'y');
            }
            // 窓台・まぐさは外周の jointPosts が立てた通し柱で受ける。
            // 別の細い柱を重ねると柱筋がずれ、窓脇だけ二重の段付きになる。
            // 開口の端から八センチ外の同じ柱へ、下の持送りもそろえる。
            for (const yy of [y + o.y0 - .015, y + o.y1 + .015]) {
              if (o.face === 'z') houseTimber(px, yy, pz + mid, o.w + .06, .03, reveal, WOOD, depthAxis);
              else houseTimber(px + mid, yy, pz, reveal, .03, o.w + .06, WOOD, depthAxis);
            }
            // 窓台・まぐさを通し柱の手前で突き合わせず、柱へ差して込栓で留める推定復元。
            // 仕口は柱の室内面へ出し、内側を滑る戸と四本の溝には張り出さない。
            // 共通の箱形・木材を使い、既存の静止した室内の束へまとめる。
            for (const side of [-1, 1]) for (const yy of [y + o.y0 - .03, y + o.y1 + .03]) {
              const t = side * (o.w / 2 + .08), surface = -.134 * o.s;
              if (o.face === 'z') {
                houseTimber(px + t, yy, pz - o.s * .05, .16, .06, .1, DARK, across);
                for (const edge of [-1, 1])
                  box(px + t, yy + edge * .03, pz + surface, .15, .003, .004, 0x211a14);
                box(px + t, yy, pz + surface - o.s * .003, .022, .022, .008, WOOD);
              } else {
                houseTimber(px - o.s * .05, yy, pz + t, .1, .06, .16, DARK, across);
                for (const edge of [-1, 1])
                  box(px + surface, yy + edge * .03, pz + t, .004, .003, .15, 0x211a14);
                box(px + surface - o.s * .003, yy, pz + t, .008, .022, .022, WOOD);
              }
            }
            // 明かり障子・板戸は naka_doors.js の共通部品で横へ滑る。
            // 固定の紙を重ねず、左右の引きしろまで敷居・鴨居と二本の溝を渡す。
            if (['yashiki', 'minka', 'nagaya', 'bansho'].includes(I.kind) && o.face === 'z') {
              const depth = .48, center = pz - o.s * depth / 2, length = o.w * 2 + .08;
              // 窓も正面戸と同じ深さ八ミリの溝へ納める。
              // 下は敷居の上面、上は鴨居の下面を欠き、戸を受ける畝を残す。
              houseTimber(px, y + o.y0 + .016, center, length, .032, depth, DARK, across);
              houseTimber(px, y + o.y1 + .024, center, length, .032, depth, DARK, across);
              // 二本の溝を持つ窓敷居は室内へ張り出す。薄い窓台だけで
              // 浮かせず、両脇の間柱から持送りで受ける推定復元。
              // 戸の下だけに納め、開口と横へ滑る引きしろは空ける。
              const reach = depth - .06, rise = .24;
              for (const side of [-1, 1]) {
                const supportX = px + side * (o.w / 2 + .08);
                // 持送りも長手へ木目を通す。左右で別の形を作らず、
                // 柱梁と共通の寸法別原形を回して、静止した束へ納める。
                houseTimber(supportX, y + o.y0 - rise / 2, pz - o.s * reach / 2,
                  .07, Math.hypot(reach, rise), .07, DARK, 'y',
                  -o.s * Math.atan2(reach, rise), Math.PI / 2);
                // 根元は柱へ、上端は窓敷居の受けへ差す推定復元。
                // 木口を重ねるだけにせず、側面に差し口と抜け止めの木栓を見せる。
                houseTimber(supportX, y + o.y0 - rise,
                  pz + o.s * .015, .09, .1, .12, DARK, 'z');
                houseTimber(supportX, y + o.y0 - .025,
                  pz - o.s * reach, .09, .05, .12, DARK, 'z');
                for (const face of [-1, 1]) {
                  const surfaceX = supportX + face * .046;
                  for (const end of [0, 1]) {
                    const jointY = y + o.y0 - (end ? .025 : rise);
                    const jointZ = pz - o.s * (end ? reach : 0);
                    for (const edge of [-1, 1])
                      box(surfaceX, jointY + edge * .018, jointZ,
                        .002, .003, .055, 0x211a14);
                    box(surfaceX + face * .002, jointY, jointZ,
                      .006, .018, .018, WOOD);
                  }
                }
              }
              // 館は雨戸の二本に加え、内側の明かり障子にも専用の溝を渡す。
              // 四本とも既存の敷居幅へ収め、可動の戸と同じ寸法を使う。
              const insets = [IGA_WINDOW_INSET, IGA_WINDOW_INSET + .075];
              if (I.kind === 'yashiki') insets.push(IGA_SHOJI_WINDOW_INSET, IGA_SHOJI_WINDOW_INSET + .075);
              // 黒い棒を木の表へ貼る代わりに、溝の間だけ木を残す。
              // 館の四本溝も小屋の二本溝も、動く戸と同じ位置で割る。
              const halfGroove = IGA_DOOR_GROOVE_W / 2;
              let start = 0;
              for (const end of [...insets.map(inset => inset - halfGroove), depth]) {
                if (end > start) {
                  const offset = pz - o.s * (start + end) / 2;
                  houseTimber(px, y + o.y0 + .036, offset, length, .008, end - start, DARK, across);
                  houseTimber(px, y + o.y1 + .004, offset, length, .008, end - start, DARK, across);
                }
                start = end + IGA_DOOR_GROOVE_W;
              }
              for (const inset of insets) {
                const track = pz - o.s * inset;
                box(px, y + o.y0 + .0325, track, length, .001, IGA_DOOR_GROOVE_W, 0x1a1410);
                box(px, y + o.y1 + .0075, track, length, .001, IGA_DOOR_GROOVE_W, 0x1a1410);
              }
            }
          }
        } else {
if (I.profile === 'hieizan' || I.profile?.startsWith('honnoji_')) {
        const hieiGrid = hieiWindowBars(I, o, (t, cy, w, h) => {
          if (o.face === 'z') box(t, y + cy, pz, w, h, .04, DARK);
          else box(px, y + cy, t, .04, h, w, DARK);
        }, true);
        if (!I.open && I.profile === 'anegawa' && S.quality === 'high') {
          // 連子窓は三本の棒だけにせず、上下の框へ縦連子を差し、横貫で受ける推定復元。
          // 全部を既存の開口内へ納め、戸口と障子窓には渡さない。
          // 窓台・まぐさ・連子も柱と同じ木目を長手へ通す。
          // 既存の天井材へ結合し、窓ごとの描画回数・毎コマの処理を増やさない。
          const ph = o.y1 - o.y0;
          const lattice = (t, yy, w, hh, depth) => {
            const upright = hh > w;
            if (o.face === 'z') {
              timberBox(px + t, yy, pz, w, hh, depth, DARK, upright ? 'y' : 'x');
            } else {
              timberBox(px, yy, pz + t, depth, hh, w, DARK, upright ? 'y' : 'z');
            }
          };
          // 小堂は外装の一組が壁厚を通して内側にも見える。二重に格子を足さない。
          if (I.kind !== 'hondo') for (const [t, yy, ww, hh, depth] of windowLatticeMembers(o.w, ph))
            lattice(t, y + o.y0 + yy, ww, hh, depth);
        } else if (!hieiGrid && !I.open) {
          if (o.face === 'z') box(px, y + o.y0 - 0.03, pz - o.s * 0.05, o.w + 0.2, 0.06, 0.16, DARK); else box(px - o.s * 0.05, y + o.y0 - 0.03, pz, 0.16, 0.06, o.w + 0.2, DARK);
        }

} else {
        if (!I.open && !o.exteriorLattice) for (let q = -1; q <= 1; q++) { const t = q * o.w * 0.3; if (o.face === 'z') box(px + t, y + (o.y0 + o.y1) / 2, pz, 0.05, o.y1 - o.y0, 0.05, DARK); else box(px, y + (o.y0 + o.y1) / 2, pz + t, 0.05, o.y1 - o.y0, 0.05, DARK); }
        if (o.exteriorLattice && villageHall && o.face === 'z') {
          // 格子は外観の七本を共用し、内壁から外の窓枠まで見込みだけをつなぐ。
          // 外枠の内面は内寸の端から十六センチ外。内壁の面から切れ目なく突き付ける。
          // 二十五センチの見込みでは外枠の手前に一センチの隙間が残る。
          const revealInner = hd - .1, revealOuter = hd + .15 + .1 - .09;
          const depth = revealOuter - revealInner, wz = o.s * (revealInner + revealOuter) / 2;
          const wh = o.y1 - o.y0;
          for (const side of [-1, 1]) box(o.t + side * (o.w / 2 + .025),
            y + (o.y0 + o.y1) / 2, wz, .05, wh + .1, depth, DARK);
          for (const yy of [o.y0 - .025, o.y1 + .025]) box(o.t, y + yy, wz, o.w, .05, depth, DARK);
          // 下の見込み板が窓台を兼ねる。同じ上面に共通の窓台を重ねない。
        } else if (o.face === 'z') box(px, y + o.y0 - 0.03, pz - o.s * 0.05, o.w + 0.2, 0.06, 0.16, DARK);
        else box(px - o.s * 0.05, y + o.y0 - 0.03, pz, 0.16, 0.06, o.w + 0.2, DARK);

}
        }
      }
      }
      }
      winPts.push([px, y + (o.y0 + o.y1) / 2, pz, o.shoji || o.paperBacked || I.profile === 'iga' && I.kind === 'yashiki' ? 0.7 : 1]);
    }
    }
    // 窓からの光の筋（一つの階に三つまで）
    let ns = 0;
    for (const o of wins) {
      // 伊賀の窓は引き戸で塞がるため、閉じた板戸を貫く固定の光筋を置かない。
      if (ns >= 3 || o.shoji || o.shutter || o.paperBacked || I.open || I.profile === 'iga') continue;
      ns++;
      const len2 = Math.min(3.2, (o.y0 + o.y1) / 2 + 1.2), g = new THREE.PlaneGeometry(o.w * 0.9, len2);
      // 窓から内へ、下り気味に差し込む板
      g.translate(0, -len2 / 2, 0); g.rotateX(-0.75);
      const shutter = nodaJoinery ? I.doors?.find(d => d.sourceWindow === o) : null;
      if (shutter) {
        // 窓の中心を原点に残し、戸の引き代と同じ割合で光の幅を変える。
        // 紙の柔らかな明るさは障子の材質で表し、閉めた時の直射は消す。
        const [px, pz] = o.face === 'z' ? [o.t, o.s * (hd - .1)] : [o.s * (hw - .1), o.t];
        const [wx, wz] = I.P(px, pz), sh = new THREE.Mesh(g, M.shaft);
        sh.position.set(wx, y + (o.y0 + o.y1) / 2, wz);
        sh.rotation.y = I.rot + (o.face === 'x' ? -o.s * Math.PI / 2 : o.s > 0 ? Math.PI : 0);
        sh.renderOrder = 3; sh.visible = false; sh.scale.x = 0;
        shutter.lightShaft = sh; grp.add(sh);
        continue;
      }
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
    if (I.profile === 'iga') {
      // 伊賀は板間・座敷ごとに油皿の灯明を置く。土間や建具の引きしろには置かない。
      const igaLamps = lv.igaLamps;
      const ln = igaLamps ? igaLamps.length : goten || lv.w > 6 ? 2 : 1;
      for (let q = 0; q < ln; q++) {
        const sgS = upSt ? upSt.sg : -ds;
        const lamp = igaLamps && igaLamps[q], room = lamp && lamp.room;
        // 設営時に決めた位置を使い、灯明台の絵と当たりをそろえる。
        const lx = lamp ? lamp.x
          : (q === 0 ? 1 : -1) * (hw - 0.6);
        const lz = lamp ? lamp.z : -sgS * (hd - 0.6) * (q === 0 ? 1 : 0.2);
        const lampY = lamp ? lamp.y : y;
        // 油皿の縁にある灯芯を、炎・光のにじみ・柱梁の照り返しで共通の原点にする。
        const flameX = lx + (room ? .065 : 0);
        const flameY = lampY + (room ? .49 : 1.08);
        const [lampX, lampZ] = I.P(lx, lz);
        if (room) {
          // 灯明台は柱・建具と同じ木肌で組む推定復元。台板と支柱で
          // 木目を分け、油皿を載せる上板には四方の縁を納める。
          // 皿・灯芯の高さと台の外寸を保ち、既存の静止した束へまとめる。
          houseTimber(lx, lampY + .03, lz, .26, .06, .26, DARK, 'x');
          houseTimber(lx, lampY + .22, lz, .05, .38, .05, DARK, 'y');
          houseTimber(lx, lampY + .415, lz, .24, .03, .24, WOOD, 'x');
          for (const side of [-1, 1]) {
            houseTimber(lx, lampY + .439, lz + side * .111,
              .24, .018, .018, DARK, 'x');
            houseTimber(lx + side * .111, lampY + .439, lz,
              .018, .018, .204, DARK, 'z');
          }
          put(igaOilDish.clone(), lx, lampY + .445, lz, 0x6b4d36);
          put(igaOilRim.clone(), lx, lampY + .46, lz, 0x806044);
          put(igaOilSurface.clone(), lx, lampY + .461, lz, 0x8a672f);
          box(flameX, lampY + .475, lz, .025, .025, .018, 0x30251c);
          box(flameX, flameY, lz, .018, .045, .018, 0xffd49a, true);
        } else if (!naibu || !addNaibu(naibu, 'japanese_lamp_emissive', lampX, y, lampZ, .32, 1.26, .32, I.rot)) {
          box(lx, y + 0.45, lz, 0.05, 0.9, 0.05, DARK); box(lx, y + 0.03, lz, 0.3, 0.06, 0.3, DARK);
          box(lx, y + 1.08, lz, 0.26, 0.36, 0.26, 0xffd49a, true);
        }
        lamps.push([flameX, flameY, lz]);
        const [wx, wz] = I.P(flameX, lz), sp = new THREE.Sprite(M.glow);
        sp.position.set(wx, flameY, wz);
        // 油皿の小さな光も、揺らす前の大きさを残す。毎コマの共通値で膨らませない。
        sp.userData.glowScale = room ? .32 : (I.lampGlowScale ?? .8);
        sp.scale.setScalar(sp.userData.glowScale); sp.renderOrder = 4; grp.add(sp);
        I.glows.push(sp);
      }
      // 武具：槍掛けに数本（天守・櫓）。御殿の奥の間は一段高い上段
      // 伊賀は間取りに登録した番所の武具置きだけを使う。民家・兵舎・館へ
      // 共通の槍を足すと、炉や寝床・床の間と用途が混ざり、背面の明かり取りも塞ぐ。
    } else if (nodaJoinery || I.profile === 'hieizan' || I.profile === 'inabayama') {
    const lampSpots = [];
    const lampLevel = S.quality === 'high' && I.profile === 'inabayama' && ['goten', 'tamari', 'hondo', 'shrine', 'kura', 'bansho', 'nagaya'].includes(I.kind) ? {
      ...lv, layout: { ...lv.layout, walls: lv.layout.walls.concat(
        (I.doors || []).filter(d => d.lv === lv).map(d => ({
          ax: d.lx - d.W * (d.window ? .5 : 1),
          bx: d.lx + d.W * (d.window ? .5 : 1),
          az: d.lz + d.trackZ, bz: d.lz + d.trackZ,
        }))) },
    } : null;
    // 比叡山は堂の須弥壇・僧坊の入口にある油皿を光らせる。別の火袋を重ねず、光源の数も増やさない。
    const altarLamps = hieiAltarLamps(lv.layout);
    if (nodaJoinery) for (const [lx, ly, lz] of altarLamps) {
      // 形を足さず、既存の壇上の灯明を内陣の明かりへ含める。
      lamps.push([lx, y + ly, lz]);
      const [wx, wz] = I.P(lx, lz), sp = new THREE.Sprite(M.glow);
      sp.position.set(wx, y + ly, wz); sp.scale.setScalar((I.lampGlowScale ?? .8) * .55);
      sp.renderOrder = 4; grp.add(sp); I.glows.push(sp);
    }
    const ln = altarLamps.length || (goten || lv.w > 6 ? 2 : 1);
    for (let q = 0; q < ln; q++) {
      const sgS = upSt ? upSt.sg : -ds;
      if (I.profile === 'hieizan') {
      const lx = altarLamps.length ? altarLamps[q][0] : (q === 0 ? 1 : -1) * (hw - 0.6);
      const lz = altarLamps.length ? altarLamps[q][2] : -sgS * (hd - 0.6) * (q === 0 ? 1 : 0.2);
      const ly = y + (altarLamps.length ? altarLamps[q][1] : 1.08);
      lamps.push([lx, ly, lz]);
      const [wx, wz] = I.P(lx, lz), sp = new THREE.Sprite(M.glow); sp.position.set(wx, ly, wz); sp.scale.setScalar(I.lampGlowScale ?? 0.8); sp.renderOrder = 4; grp.add(sp); I.glows.push(sp);
      continue;
      }
if (nodaJoinery) {
      let lx = (q === 0 ? 1 : -1) * (hw - 0.6), lz = -sgS * (hd - 0.6) * (q === 0 ? 1 : 0.2);
      let floorY = 0;
      if (nodaJoinery) {
        // 灯明の台を家具・間仕切り・引き戸の全移動範囲から離す。
        // 文机の脇と部屋の隅を設営時だけ探し、狭い通路へは足さない。
        let found = false;
        // 二灯とも最初の部屋へ集めず、堂は内陣・外陣、僧坊は奥・控えへ分ける。
        // 置けない部屋だけ次へ回し、狭い入口や戸の引き代へ無理に足さない。
        for (let roomIndex = 0; roomIndex < lv.layout.rooms.length; roomIndex++) {
          const r = lv.layout.rooms[(q + roomIndex) % lv.layout.rooms.length];
          // 隅だけでは窓障子の引き代と重なり、閉じた書写室に灯明が残らない。
          // 文机・経卓・膳の左右を先に探す。読経や食事の場も隅の灯明だけに頼らず、
          // 同じ油皿を手元の脇へ据える推定復元。灯数と光の焼き込みは増やさない。
          const candidates = [];
          for (const p of lv.layout.props) if (['writingDesk', 'sutraDesk', 'mealTray'].includes(p.part)
            && p.x >= r.x0 && p.x <= r.x1 && p.z >= r.z0 && p.z <= r.z1) {
            for (const side of [-1, 1]) candidates.push([p.x + side * (p.w / 2 + .35), p.z]);
          }
          for (const x of [r.x1 - .45, r.x0 + .45])
            for (const z of [r.z1 - .45, r.z0 + .45]) candidates.push([x, z]);
          for (const [x, z] of candidates) {
              if (x < r.x0 + .35 || x > r.x1 - .35 || z < r.z0 + .35 || z > r.z1 - .35) continue;
              // 戸を開けた先の立ち所と、中央の出入りの道も残す。
              if (lv.layout.portals.some(p => Math.abs(x - p.x) < .65 && Math.abs(z - p.z) < 1.2)) continue;
              if (Math.abs(x - I.door.lx) < .75 && (hd - z * ds) < 1.5) continue;
              if (lv.layout.props.some(p => Math.abs(x - p.x) < p.w / 2 + .3 && Math.abs(z - p.z) < p.d / 2 + .3)) continue;
              if (lv.layout.walls.some(v => x > Math.min(v.ax, v.bx) - .3 && x < Math.max(v.ax, v.bx) + .3
                && z > Math.min(v.az, v.bz) - .3 && z < Math.max(v.az, v.bz) + .3)) continue;
              if (I.doors?.some(d => d.lv === lv && (d.axisX
                ? Math.abs(x - d.lx) < .7 && Math.abs(z - d.lz) < d.W + .3
                : Math.abs(x - d.lx) < d.W + .3 && Math.abs(z - d.lz) < .7))) continue;
              if (lamps.some(p => Math.hypot(x - p[0], z - p[2]) < .65)) continue;
              lx = x; lz = z;
              floorY = (r.y || 0) + (r.floor === 'tatami' ? .06 : r.floor === 'earth' ? .025 : .018);
              found = true; break;
          }
          if (found) break;
        }
        if (!found) continue;
      }
      const [lampX, lampZ] = I.P(lx, lz);
      if (nodaJoinery) {
        const light = tomyo(false, false, true);
        light.position.set(lampX, y + floorY, lampZ); light.rotation.y = I.rot; lampParts.add(light);
        // 灯明も人や武器が木部をすり抜けないようにする。
        // 台の幅で上まで塞がず、共用する灯明の台・支柱・皿受けを別々に受ける。
        // 近づいて室内を組む時だけ登録し、戸の開閉や毎コマの形は増やさない。
        const baseY = y + floorY;
        for (const [half, bottom, top] of [[.16, 0, .05], [.025, .05, .765], [.09, .765, .8]]) {
          for (const side of [-1, 1]) {
            seg(I, lx - half + .002, lz + side * (half - .002),
              lx + half - .002, lz + side * (half - .002), baseY + bottom, baseY + top, .002);
            seg(I, lx + side * (half - .002), lz - half + .002,
              lx + side * (half - .002), lz + half - .002, baseY + bottom, baseY + top, .002);
          }
        }
      } else if (!naibu || !addNaibu(naibu, 'japanese_lamp_emissive', lampX, y, lampZ, .32, 1.26, .32, I.rot)) {
        box(lx, y + 0.45, lz, 0.05, 0.9, 0.05, DARK); box(lx, y + 0.03, lz, 0.3, 0.06, 0.3, DARK);
        box(lx, y + 1.08, lz, 0.26, 0.36, 0.26, 0xffd49a, true);
      }
      const lightY = y + (nodaJoinery ? floorY + .892 : 1.08);
      // 油皿の炎は支柱の芯より手前。灯具の向きと同じ位置へ光も寄せる。
      const flameZ = lz + .077;
      lamps.push([lx, lightY, flameZ]);
      const [wx, wz] = I.P(lx, flameZ), sp = new THREE.Sprite(M.glow); sp.position.set(wx, lightY, wz); sp.scale.setScalar(I.lampGlowScale ?? 0.8); sp.renderOrder = 4; grp.add(sp); I.glows.push(sp);

} else {
      const lx = altarLamps.length ? altarLamps[q][0] : (q === 0 ? 1 : -1) * (hw - 0.6);
      const lz = altarLamps.length ? altarLamps[q][2] : -sgS * (hd - 0.6) * (q === 0 ? 1 : 0.2);
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
    }
    } else if (I.profile?.startsWith('honnoji_')) {
    const altarLamps = honnojiAltarLamps(lv.layout);
    const ln = altarLamps.length || (goten || lv.w > 6 ? 2 : 1);
    // 本能寺の付属棟は室ごとの仕上げ面へ据える。調度と引き戸の
    // 引き込み先を避け、灯明が畳へ沈んだり障子を貫いたりしない。
    // 候補は室内を作る時だけ調べ、形・材質と光の焼き込みは従来どおり使う。
    const lampPlaces = [];
    const fittedLamps = !altarLamps.length && I.profile !== 'honnoji_nijo';
    // 一室で全数を使い切らず、襖で隔てた座敷へ一つずつ配る。
    // 一巡して余れば同じ室へ戻す。灯明の総数と戸・調度を避ける余白は保つ。
    if (fittedLamps) for (let pass = 0; pass < ln && lampPlaces.length < ln; pass++) {
    for (const r of lv.layout.rooms) {
      if (lampPlaces.length >= ln) break;
      const xs = [r.x1 - .45, r.x0 + .45, (r.x0 + r.x1) / 2];
      const zs = [r.z1 - .45, r.z0 + .45, (r.z0 + r.z1) / 2];
      candidate: for (const lz of zs) for (const lx of xs) {
        if (lampPlaces.length >= ln || lx - .16 < r.x0 || lx + .16 > r.x1
          || lz - .16 < r.z0 || lz + .16 > r.z1) continue;
        if (lv.layout.props.some(p => Math.abs(lx - p.x) < p.w / 2 + .26
          && Math.abs(lz - p.z) < p.d / 2 + .26)) continue;
        // 四枚引きも含め、全開までの戸の幅と前後の溝を空ける。
        if (I.doors?.some(d => d.lv === lv && Math.abs(lz - d.lz) < d.track + .26
          && Math.abs(lx - d.lx) < d.W + .26)) continue;
        if (lampPlaces.some(p => Math.hypot(lx - p[0], lz - p[1]) < 1.2)) continue;
        lampPlaces.push([lx, lz]);
        break candidate;
      }
    }
    }
    for (let q = 0; q < ln; q++) {
      const sgS = upSt ? upSt.sg : -ds;
      if (fittedLamps && !lampPlaces[q]) continue;
      const lx = altarLamps.length ? altarLamps[q][0] : fittedLamps ? lampPlaces[q][0] : (q === 0 ? 1 : -1) * (hw - 0.6);
      const lz = altarLamps.length ? altarLamps[q][2] : fittedLamps ? lampPlaces[q][1] : -sgS * (hd - 0.6) * (q === 0 ? 1 : 0.2);
      const lampY = y + (fittedLamps ? floorFinish(lx, lz) : 0);
      const flameY = altarLamps.length ? y + altarLamps[q][1] : lampY + .868;
      const flameZ = altarLamps.length ? lz : lz + .093;
      // 須弥壇の灯明は調度に含まれる。重複する置き灯明を作らず、同じ二つの火先だけを使う。
      if (!altarLamps.length) {
        // 僧坊・方丈・庫裏にも、本堂と同じ油皿・灯芯の灯明を据える（造作は推定）。
        // 一棟で形を使い回し、設営時に木部・皿・火先を既存の一束へまとめる。
        // 共有の形を直接動かさず、足もとは仕上げ面、明かりは実際の灯芯に合わせる。
        if (!oilLamp) { oilLamp = tomyo('honnoji'); oilLamp.updateMatrixWorld(true); }
        oilLamp.traverse(o => {
          if (!o.isMesh) return;
          const hex = o.material.color.getHex();
          put(o.geometry.clone().applyMatrix4(o.matrixWorld), lx, lampY, lz, hex, hex === 0xffd08b);
        });
      }
      lamps.push([lx, flameY, flameZ]);
      const [wx, wz] = I.P(lx, flameZ), sp = new THREE.Sprite(M.glow); sp.position.set(wx, flameY, wz); sp.scale.setScalar(I.lampGlowScale ?? 0.8); sp.renderOrder = 4; grp.add(sp);
      I.glows.push(sp);
    }
    } else if (I.profile === 'moribe') {
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
      const [wx, wz] = I.P(lx, lz), sp = new THREE.Sprite(M.glow); sp.position.set(wx, flameY, wz); sp.scale.setScalar(I.lampGlowScale ?? .8); sp.renderOrder = 4; grp.add(sp); I.glows.push(sp);
    }
    } else if (fineIwamura) {
    const ln = goten || lv.w > 6 ? 2 : 1;
    for (let q = 0; q < ln; q++) {
      const sgS = upSt ? upSt.sg : -ds;
      let lx = (q === 0 ? 1 : -1) * (hw - 0.6), lz = -sgS * (hd - 0.6) * (q === 0 ? 1 : 0.2);
      if (fineIwamura) {
        // 夜の居館は奥座敷と取次へ一灯ずつ配る推定復元。
        // 入口側の座標だけで置くと、閉めた襖の奥の文机に灯明が届かない。
        // 堂・社・用屋も、内陣と外陣、上げ床と土間を同じ部屋の並びで扱う。
        const preferredRoom = lv.layout.rooms[Math.min(q, lv.layout.rooms.length - 1)];
        if (preferredRoom) {
          lx = q === 0 ? preferredRoom.x1 - .6 : preferredRoom.x0 + .6;
          lz = (preferredRoom.z0 + preferredRoom.z1) / 2;
        }
        // 灯明台で調度や引き戸の通りを塞がない。壁際の候補だけを室内の組立時に調べる。
        // 戸は全開までの引込み幅も空け、内陣の格子戸と入口の板戸に台を突き通さない。
        const clear = (x, z) => {
          // 台の四隅を一室の床へ収める。中心だけで床を選ぶと、
          // 上段・内陣の段鼻をまたいで台の片側が宙へ浮いてしまう。
          if (!lv.layout.rooms.some(r => x - .24 >= r.x0 && x + .24 <= r.x1
            && z - .24 >= r.z0 && z + .24 <= r.z1)) return false;
          if (lv.layout.props.some(p => Math.abs(x - p.x) < p.w / 2 + .24
            && Math.abs(z - p.z) < p.d / 2 + .24)) return false;
          if (lv.layout.walls.some(v => x > Math.min(v.ax, v.bx) - .24 && x < Math.max(v.ax, v.bx) + .24
            && z > Math.min(v.az, v.bz) - .24 && z < Math.max(v.az, v.bz) + .24)) return false;
          if (I.doors?.some(d => d.lv === lv && !d.window
            && Math.abs(x - d.lx) < d.W + .24 && Math.abs(z - d.lz) < d.track + .24)) return false;
          return !lamps.some(p => Math.abs(p[1] - (y + 1.08)) < .5 && Math.hypot(x - p[0], z - p[2]) < .5);
        };
        if (!clear(lx, lz)) {
          let found = false;
          // 調度を避ける時も、先に割り当てた部屋で置き所を探す。
          const searchRooms = preferredRoom
            ? [preferredRoom, ...lv.layout.rooms.filter(r => r !== preferredRoom)] : lv.layout.rooms;
          for (const room of searchRooms) {
            if (found) break;
            for (const side of [q === 0 ? 1 : -1, q === 0 ? -1 : 1]) {
              if (found) break;
              const x = side > 0 ? room.x1 - .6 : room.x0 + .6;
              for (let z = room.z0 + .6; z <= room.z1 - .6; z += .45) {
                if (clear(x, z)) { lx = x; lz = z; found = true; break; }
              }
            }
          }
          if (!found) continue;
        }
      }
      // 岩村の上段・内陣・用屋の板間では、灯明の台も床の上へ載せる。
      // 板張り・土間の仕上げ厚も含め、台の足を床へ埋めない。
      let lampY = y;
      if (fineIwamura) for (const room of lv.layout.rooms) {
        if (lx >= room.x0 && lx <= room.x1 && lz >= room.z0 && lz <= room.z1) {
          const finish = room.floor === 'tatami' ? .066 : room.floor === 'earth' ? .0255
            : room.floor === 'boards' ? .012 : 0;
          lampY += (room.y || 0) + finish;
          break;
        }
      }
      const [lampX, lampZ] = I.P(lx, lz);
      const lightY = lampY + (fineIwamura ? 1.005 : 1.08);
      if (fineIwamura) {
        // 岩村の室内灯は油皿を載せた灯明台として推定復元する。
        // 箱形の火袋を流用せず、皿・油面・灯芯を見せる。器の原形は全棟で共有し、
        // 配置した形は既存の室内の束へ結合する。戸と調度を避ける配置は共用する。
        // 油皿は蓋のある円柱にせず、底・内面・口縁が続く浅い器にする。
        // 断面と油面は全棟で共有し、設営時に既存の室内の束へ結合する。
        iwamuraLampDish ??= new THREE.LatheGeometry([
          new THREE.Vector2(0, -.5), new THREE.Vector2(.7, -.5),
          new THREE.Vector2(1, .2), new THREE.Vector2(1, .5),
          new THREE.Vector2(.88, .5), new THREE.Vector2(.8, 0),
          new THREE.Vector2(.65, -.25), new THREE.Vector2(0, -.25),
        ], 10);
        iwamuraLampOil ??= new THREE.CircleGeometry(1, 10).rotateX(-Math.PI / 2);
        box(lx, lampY + .03, lz, .3, .06, .3, DARK);
        box(lx, lampY + .49, lz, .05, .86, .05, WOOD);
        box(lx, lampY + .91, lz, .14, .04, .14, DARK);
        put(iwamuraLampDish.clone().scale(.11, .035, .11), lx, lampY + .9475, lz, 0x6a5a3a);
        put(iwamuraLampOil.clone().scale(.09, 1, .09), lx, lampY + .956, lz, 0x3a2a17);
        // 灯芯の内端を油へ浸し、口縁を越えた外端へ炎を合わせる。
        box(lx + .072, lampY + .959, lz, .018, .012, .012, 0xc9b68a);
        box(lx + .088, lampY + .969, lz, .03, .012, .012, 0xc9b68a);
        box(lx + .096, lightY, lz, .012, .06, .012, 0xffd08b, true);
        // 灯明台も描いた部材だけで体と槍を受ける。支柱の周りの空所は塞がない。
        // 上段・内陣の仕上げ面と棟の回転を共用し、室内を組む時だけ登録する。
        // 土台は四辺、細い支柱・皿受け・油皿は中心の短い線で近似する。
        for (const side of [-1, 1]) {
          seg(I, lx - .14, lz + side * .14, lx + .14, lz + side * .14,
            lampY, lampY + .06, .01);
          seg(I, lx + side * .14, lz - .14, lx + side * .14, lz + .14,
            lampY, lampY + .06, .01);
        }
        seg(I, lx, lz, lx, lz, lampY + .06, lampY + .92, .025);
        seg(I, lx, lz, lx, lz, lampY + .89, lampY + .93, .07);
        seg(I, lx, lz, lx, lz, lampY + .93, lampY + .965, .11);
      } else if (!naibu || !addNaibu(naibu, 'japanese_lamp_emissive', lampX, lampY, lampZ, .32, 1.26, .32, I.rot)) {
        box(lx, lampY + 0.45, lz, 0.05, 0.9, 0.05, DARK); box(lx, lampY + 0.03, lz, 0.3, 0.06, 0.3, DARK);
        box(lx, lampY + 1.08, lz, 0.26, 0.36, 0.26, 0xffd49a, true);
      }
      const flameX = lx + (fineIwamura ? .096 : 0);
      lamps.push([flameX, lightY, lz]);
      const [wx, wz] = I.P(flameX, lz), sp = new THREE.Sprite(M.glow); sp.position.set(wx, lightY, wz); sp.scale.setScalar(I.lampGlowScale ?? (fineIwamura ? .22 : .8)); sp.renderOrder = 4; grp.add(sp); I.glows.push(sp);

      }

} else {
    const altar = villageHall ? lv.layout.props.find(p => p.part === 'altar') : null;
    const ln = villageHome ? 1 : goten || lv.w > 6 ? 2 : 1;
    for (let q = 0; q < ln; q++) {
      const sgS = upSt ? upSt.sg : -ds;
      let lx = (q === 0 ? 1 : -1) * (hw - 0.6), lz = -sgS * (hd - 0.6) * (q === 0 ? 1 : 0.2), ly = 1.08;
      if (villageHome) {
        // 民家の推定復元。紙の火袋を持つ背の高い灯具でなく、壁際の低い灯台と油皿。
        lz = parlor ? (parlor.z0 + parlor.z1) / 2 : -ds * (hd - .6);
        // 畳は六センチ厚。台座・油皿・灯芯と焼き込みの光を一緒に持ち上げる。
        const floorY = (parlor?.y || 0) + (parlor ? .06 : 0);
        ly = floorY + .51;
        // 灯台の足は角板の塊でなく、二本の足木を十字に組む推定の造り。
        // 上下へ分けて面を重ねず、支柱の木口は足木の上面と皿受けの下面へ納める。
        // 建具と同じ木目・原形を共用し、静止した内装の束へまとめる。
        entryTimber(lx, y + floorY + .0125, lz, .24, .025, .05, DARK);
        entryTimber(lx, y + floorY + .0375, lz, .05, .025, .24, DARK);
        entryTimber(lx, y + floorY + .225, lz, .045, .35, .045, WOOD);
        entryTimber(lx, y + floorY + .425, lz, .18, .05, .18, 0x544332);
        // 浅い陶製の皿に口縁を立て、油面は縁より低くする。
        if (!villageOilDish) {
          villageOilDish = new THREE.CylinderGeometry(.075, .055, .018, 12);
          villageOilRim = new THREE.TorusGeometry(.069, .009, 4, 12);
          villageOilRim.rotateX(Math.PI / 2);
          villageOilSurface = new THREE.CylinderGeometry(.059, .059, .003, 12);
        }
        put(villageOilDish.clone(), lx, y + floorY + .459, lz, 0x75634b);
        put(villageOilRim.clone(), lx, y + floorY + .471, lz, 0x75634b);
        put(villageOilSurface.clone(), lx, y + floorY + .469, lz, 0x292016);
        box(lx + .055, y + floorY + .477, lz, .035, .008, .012, 0xa39473);
        box(lx + .065, y + ly, lz, .018, .065, .018, 0xffd49a, true);
        // 灯芯は油皿の端。焼き込む光と炎のにじみも、皿の中心でなく同じ端へ合わせる。
        lx += .065;
      } else if (altar) {
        // 須弥壇の左右の灯明は furnishLayout が組む。その炎へ光を合わせ、堂の隅に火袋を重ねない。
        const side = q === 0 ? 1 : -1, c = Math.cos(altar.rot || 0), s = Math.sin(altar.rot || 0);
        // 灯台は壇上の .55、その上の油皿の炎は .31。高さを掛けると光が壇の腰へ沈む。
        // 皿の手前の灯芯（.082）も、調度と同じ伸縮と向きで合わせる。
        const flameX = side * .75 * altar.w / 2.1, flameZ = .082 * altar.d;
        lx = altar.x + flameX * c + flameZ * s;
        lz = altar.z - flameX * s + flameZ * c;
        ly = (altar.y || 0) + (.55 + .31) * altar.h / 1.5;
      }
      const [lampX, lampZ] = I.P(lx, lz);
      if (!villageHome && !altar && (!naibu || !addNaibu(naibu, 'japanese_lamp_emissive', lampX, y, lampZ, .32, 1.26, .32, I.rot))) {
        box(lx, y + 0.45, lz, 0.05, 0.9, 0.05, DARK); box(lx, y + 0.03, lz, 0.3, 0.06, 0.3, DARK);
        box(lx, y + 1.08, lz, 0.26, 0.36, 0.26, 0xffd49a, true);
      }
      lamps.push([lx, y + ly, lz]);
      const [wx, wz] = I.P(lx, lz), sp = new THREE.Sprite(M.glow); sp.position.set(wx, y + ly, wz); sp.scale.setScalar(I.lampGlowScale ?? (villageHome || altar ? .35 : .8)); sp.renderOrder = 4; grp.add(sp); I.glows.push(sp);
    }

    }
    // 武具：槍掛けに数本（天守・櫓）。御殿の奥の間は一段高い上段
    // 本能寺の堂・僧坊・炊事場・経蔵・馬舎を、共通の槍置き場にしない。
    // 武具は物置と納屋に限り、下の購入素材の武器棚とも用途をそろえる。
    const honnoji = I.profile?.startsWith('honnoji_');
    const weaponStore = !['iga', 'hieizan', 'moribe'].includes(I.profile) && (!honnoji || ['honnoji_kura', 'honnoji_naya'].includes(I.profile));
    if (!goten && lv.w > 2.5 && weaponStore) {
      const sz = upSt ? -upSt.sg : -ds;
      box(0, y + Math.min(1.9, h - .4), sz * (hd - 0.22), Math.min(1.8, lv.w * 0.5), 0.06, 0.08, DARK);
      for (let q = -1; q <= 1; q++) { const ph = Math.min(2.65, h - .3), g = new THREE.CylinderGeometry(.022, .022, ph, 5); g.rotateX(sz * .12); put(g, q * .4, y + ph / 2, sz * (hd - .3), 0x2c2016); box(q * .4, y + ph - .1, sz * (hd - .13), .04, .2, .03, 0x9a9a9e); }
      // 本能寺の納屋・物置にも、用途のない共通の掛物は足さない。
      // 堂の祭具や座敷の床の間は、室ごとの調度をそのまま使う。
      if (!I.profile?.startsWith('honnoji_')) {
        box(hw - .35, y + h * .45, 0, .035, h * .85, .035, DARK);
        box(hw - .55, y + h * .6, .02, .4, h * .4, .025, 0x9c8d66);
      }
    }
    const raisedSanctuary = fineIwamura && ['iwamura_hondo', 'iwamura_shrine'].includes(I.profile) && lv.layout.rooms[0].raised;
    const raisedUtility = fineIwamura && boardInterior && lv.layout.rooms[0].raised;
    if ((I.kind === 'goten' && I.okuZ != null && lv.layout.rooms[0].raised !== false) || raisedSanctuary || raisedUtility) {
      if ((fineIwamura && I.profile === 'iwamura') || raisedSanctuary || raisedUtility) {
        // 上段・内陣・神座・用屋の敷居と同じ間取りで床組を納める。階段の穴は床片で除く。
        const room = lv.layout.rooms[0], rise = room.y || 0;
        if (rise > 0) for (const piece of lv.pieces) {
          const x0 = Math.max(room.x0, piece[0]), x1 = Math.min(room.x1, piece[1]);
          const z0 = Math.max(room.z0, piece[2]), z1 = Math.min(room.z1, piece[3]);
          if (x1 > x0 && z1 > z0) box((x0 + x1) / 2, y + rise / 2, (z0 + z1) / 2,
            x1 - x0, rise, z1 - z0, FLOOR);
          // 堂の内陣・社の神座と用屋の板間は、段鼻を上がり框で受ける推定復元。
          // 畳寄せのある主殿とは分け、板床の切り口を細い上框と蹴込みで閉じる。
          // 反転した戸口と床片の境を使い、階段の穴や下の土間へ張り出さない。
          const edge = ds > 0 ? room.z1 : room.z0;
          if ((raisedSanctuary || raisedUtility) && x1 > x0 && z1 > z0
            && edge >= z0 - .001 && edge <= z1 + .001) {
            const depth = Math.min(.12, z1 - z0), capH = Math.min(.06, rise);
            const frameZ = edge - ds * depth / 2;
            // 框の上面も歩行面と同じ仕上げ高へ。基本形の板厚は十二ミリ。
            const finish = .012;
            box((x0 + x1) / 2, y + rise + finish - capH / 2, frameZ,
              x1 - x0, capH, depth, raisedSanctuary ? DARK : WOOD);
            // 上框の下面まで蹴込みを通す。板の仕上げ厚を除くと、
            // 土間・外陣側に十二ミリの隙間が残り、床組の下地が帯状に見える。
            // 床組と同じ面へ重ねず、外側の四ミリだけを見付けとする。
            const kickH = rise + finish - capH;
            box((x0 + x1) / 2, y + kickH / 2, edge - ds * .002,
              x1 - x0, kickH, .012, raisedSanctuary ? DARK : BOARD);
            // 長い上がり框を一本の材にせず、一間以内の材を相欠きで継ぐ推定復元。
            // 継手は元の部屋から割り付け、上面と見付けへ連続させる。
            // 床片の切り口には付けず、戸の敷居・通行面を変えない。
            const joints = Math.max(1, Math.ceil((room.x1 - room.x0) / 1.8));
            const pitch = (room.x1 - room.x0) / joints, lap = Math.min(.06, pitch / 4);
            // 框の木肌も材ごとに長手へ通す推定復元。継手を越す一本の筋にしない。
            // 上面と外陣・土間側の見付けだけへ納め、板床・敷居の溝には重ねない。
            // 既存の箱と木材の束を使い、室内を組む時だけ加える。
            for (let j = 0; j < joints; j++) {
              const start = Math.max(x0 + .04, room.x0 + j * pitch + lap + .025);
              const end = Math.min(x1 - .04, room.x0 + (j + 1) * pitch - lap - .025);
              if (end <= start) continue;
              for (const side of [-1, 1]) {
                const length = (end - start) * (side < 0 ? .76 : .57);
                const center = (start + end) / 2 + side * (end - start) * .06;
                const color = raisedSanctuary ? 0x302317 : 0x59412b;
                box(center, y + rise + finish + .0005, frameZ + side * depth * .22,
                  length, .001, .002, color);
                box(center, y + rise + finish - capH * (side < 0 ? .3 : .7),
                  edge + ds * .0005, length, .002, .001, color);
              }
            }
            for (let j = 1; j < joints; j++) {
              const t = room.x0 + j * pitch;
              if (t - lap <= x0 || t + lap >= x1) continue;
              const top = y + rise + finish + .0005;
              for (const side of [-1, 1]) box(t + side * lap, top,
                frameZ + side * ds * depth / 4, .002, .001, depth / 2, 0x241b12);
              box(t, top, frameZ, lap * 2, .001, .002, 0x241b12);
              // 土間・外陣側の木口と込栓も、框の見付けの内へ納める。
              const front = edge + ds * .0045;
              box(t + lap, y + rise + finish - capH / 2, front,
                .002, capH, .001, 0x241b12);
              box(t, y + rise + finish - capH / 2, front,
                .018, .018, .002, 0x8a6a48);
            }
          }
        }
      } else {
        const backD = lv.d * I.oku, bz = -ds * (hd - backD / 2);
        box(0, y + 0.08, bz - ds * 0.1, lv.w - 0.3, 0.16, backD - 0.4, 0x8a8050);
      }
    }
  }
  igaOilDish?.dispose(); igaOilRim?.dispose(); igaOilSurface?.dispose();
  igaNailPlate?.dispose(); igaNailHead?.dispose();
  // 光を頂点の色に焼き込む：暗い地に、灯明の暖かい明かりと窓の明かり
  for (const g of [...list, ...woodFloorList, ...timbers]) {
    if (g.userData.emit) continue;
    const P = g.attributes.position, C = g.attributes.color;
    for (let i = 0; i < P.count; i++) {
      const wx = P.getX(i), wy = P.getY(i), wz = P.getZ(i);
      const dx0 = wx - I.x, dz0 = wz - I.z, lx = dx0 * I.c - dz0 * I.s, lz = dx0 * I.s + dz0 * I.c;
      for (const stain of smokeStains) {
        // 天井板は上で専用の煤色を付けているため重ねない。煙抜きの下ほど薄くする。
        if (wy >= stain.top - .001 || wy <= stain.bottom) continue;
        const distance = Math.hypot(Math.max(stain.x0 - lx, 0, lx - stain.x1),
          Math.max(stain.z0 - lz, 0, lz - stain.z1));
        const amount = Math.max(0, 1 - distance / .6) * (wy - stain.bottom) / (stain.top - stain.bottom);
        const tint = 1 - .55 * amount * amount * (3 - 2 * amount);
        C.setXYZ(i, C.getX(i) * tint, C.getY(i) * tint, C.getZ(i) * tint);
      }
      let r = 0.4, gg = 0.37, b = 0.35;
      for (const [ax, ay, az] of lamps) { const d = Math.hypot(lx - ax, wy - ay, lz - az), f = Math.max(0, 1 - d / 4.2); r += f * f * 1.15; gg += f * f * 0.8; b += f * f * 0.42; }
      for (const [ax, ay, az, k2] of winPts) { const d = Math.hypot(lx - ax, wy - ay, lz - az), f = Math.max(0, 1 - d / 3.2); r += f * f * 0.6 * k2; gg += f * f * 0.6 * k2; b += f * f * 0.6 * k2; }
      C.setXYZ(i, Math.min(1, C.getX(i) * r * 1.3), Math.min(1, C.getY(i) * gg * 1.3), Math.min(1, C.getZ(i) * b * 1.3));
    }
  }
  // 買った素材（cgt.js）：板の間の床板・武器の棚を足す（畳と柱は共通部品）（読めていれば。形・当たり・光の焼き込みは変えない。暗い室内に合わせて絵を暗くする）
  // 伊賀は木肌・根太上の木口・炉の切り欠きを備えた専用床を使う。
  // 別割りの床材を重ねると板の継ぎ目を覆うため、高画質でも一つの仕上げにする。
  if (!fineIwamura && !nodaJoinery && !['yagura', 'iga', 'hieizan', 'moribe'].includes(I.profile) && cgtOn() && cgtHas('Floor_Boards')) {
    const kb = new KitBatch();
    for (let k = 0; k < Ls.length; k++) {
      const lv = Ls[k];
      // 中心だけで床の種類を選ぶと、約二メートルの板が畳や土間にはみ出す。
      // 設楽原は部屋の境と炉の穴を切った板間を共用し、追加の床板でも囲炉裏を塞がない。
      const villageFloor = S.quality === 'high' && I.profile === 'shitaragahara';
      // 民家と小堂は上で一尺幅の実寸の床板を張ってある。
      // 別素材を上へ重ねると三ミリの目地と継ぎ位置が隠れ、炉縁にも厚い床が食い込む。
      // 手作りの板床と歩行面をそのまま使い、二重の床と余分な描画を省く。
      if (villageFloor && ['minka', 'hondo'].includes(I.kind)) continue;
      if (I.profile === 'inabayama' || I.profile?.startsWith('honnoji_')) {
      // 本能寺の付属棟は、上で部屋ごとに張った厚い板を仕上げとする。
      // 別の床材を上へ重ねると、千鳥の継ぎ目を覆い、床だけ敷居や調度より高くなる。
      // 二条御所は外観側の床を使うため、従来の素材を部屋の境で切って納める。
      const boardPieces = I.profile?.startsWith('honnoji_') || S.quality === 'high' && I.profile === 'inabayama' ? [] : lv.pieces;
      if (I.profile === 'honnoji_nijo') for (const r of lv.layout.rooms) {
        if (r.floor !== 'boards') continue;
        for (const [px0, px1, pz0, pz1] of lv.pieces) {
          const x0 = Math.max(px0, r.x0), x1 = Math.min(px1, r.x1);
          const z0 = Math.max(pz0, r.z0), z1 = Math.min(pz1, r.z1);
          if (x1 > x0 && z1 > z0) boardPieces.push([x0, x1, z0, z1, r.y || 0]);
        }
      }
      for (const [x0, x1, z0, z1, floorY = 0] of boardPieces) {
        const nx = Math.max(1, Math.round((x1 - x0) / 2)), nz = Math.max(1, Math.round((z1 - z0) / 2)), cw = (x1 - x0) / nx, cd = (z1 - z0) / nz;
        for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
          const [wx, wz] = I.P(x0 + i * cw, z1 - j * cd);
          const floor = interiorFloorAt(lv.layout, x0 + (i + .5) * cw, z1 - (j + .5) * cd);
          if (floor === 'earth' || floor === 'tatami') continue; // 畳と土間は共通部品で敷いてある
          // 庫裏の配膳板間は土間より十八センチ高い。素材の床も同じ室の床高へ据え、
          // 上がり框の下へ沈めない。形・材質・枚数は保ち、設営時の高さだけをそろえる。
          kb.add('Floor_Boards', wx, lv.y + floorY + 0.006, wz, I.rot, cw / 2, 0.12, cd / 2);
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
      // 本能寺の堂・僧坊・庫裏・経蔵・馬舎には共通の武器棚を置かない。
      // 内陣や僧の座敷を武具置き場にせず、物置と納屋だけに納める（調度は推定）。
      const weaponStore = I.profile !== 'hieizan' && (!I.profile?.startsWith('honnoji_')
        || ['honnoji_kura', 'honnoji_naya'].includes(I.profile));
      if (!goten && weaponStore && Ls[k].w > 4) {
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
  if (ceilingBoards.children.length) {
    const boards = batchInterior(ceilingBoards);
    boards.position.set(I.x, 0, I.z); boards.rotation.y = I.rot; grp.add(boards);
  }
  if (plasterWalls.length) {
    const walls = igaPlasterWalls(plasterWalls);
    walls.position.set(I.x, 0, I.z); walls.rotation.y = I.rot;
    grp.add(walls);
  }
  if (igaBoards.length) {
    const ceiling = igaCeilingBoards(igaBoards, igaHearth ? soot : null);
    ceiling.position.set(I.x, 0, I.z); ceiling.rotation.y = I.rot;
    grp.add(ceiling);
  }
  if (lampParts.children.length) grp.add(batchInterior(lampParts));
  if (naibu && naibu.n) grp.add(naibu.build({ basic: true, tint: .65, shadow: false, camBlock: false }));
  if (ceilingWood.length) {
    if (!M.ceilingWood) {
      // 寸法に応じて繰り返す室内専用の絵を一枚だけ持つ。建具や床の貼り方は保つ。
      const map = inabaBoardTexture().clone();
      map.wrapS = map.wrapT = THREE.RepeatWrapping; map.needsUpdate = true;
      M.ceilingWood = new THREE.MeshBasicMaterial({ vertexColors: true, map });
    }
    const wood = new THREE.Mesh(mergeGeometries(ceilingWood), M.ceilingWood);
    wood.matrixAutoUpdate = false; grp.add(wood);
  }
  // 土壁は一棟一束。形・頂点数は増やさず、柱・建具・床へ土の絵を掛けない。
  const earthWalls = list.filter(g => g.userData.earthenWall);
  if (earthWalls.length) {
    const wall = new THREE.Mesh(mergeGeometries(earthWalls), earthenWallMaterial());
    wall.matrixAutoUpdate = false; grp.add(wall);
  }
  const textured = new Set(ceilingWood);
  if (floorBoardShape) floorBoardShape.dispose();
  // 木目付きの板は一棟で一束。灯明・煤を焼いた後に分け、板ごとに描かない。
  const wood = list.filter(g => g.userData.ceilingWood);
  if (wood.length) {
    const ceiling = new THREE.Mesh(mergeGeometries(wood), nodaWoodMaterial());
    ceiling.matrixAutoUpdate = false; grp.add(ceiling);
  }
  // 野田福島の高も、壁・柱を無照明の単色面にせず梁と同じ光で受ける。
  // 既存の共有材質を使い、室内ごとの材質・光源・描画回数は増やさない。
  const plainParts = list.filter(g => !g.userData.ceilingWood && !g.userData.earthenWall && !textured.has(g));
  const m = new THREE.Mesh(mergeGeometries(plainParts), I.profile === 'hieizan' || nodaJoinery ? M.hieiBase : M.base);
  m.matrixAutoUpdate = false;
  grp.add(m);
  if (woodFloorList.length) {
    const floor = new THREE.Mesh(mergeGeometries(woodFloorList), M.woodFloor);
    floor.matrixAutoUpdate = false; grp.add(floor);
    for (const geometry of woodFloorList) geometry.dispose();
  }
  if (timbers.length) {
    // 岩村も既存の木肌・陰影の材質を共有する。一棟一束で、毎コマの処理は足さない。
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
  // 畳・梁・建具にも既存の影を受け、窓際だけ一様に明るく浮くのを防ぐ。
  // 灯明の光芒・透ける紙は保ち、影を描く側の物や光源は追加しない。
  if (nodaJoinery) grp.traverse(o => {
    if (!o.isMesh) return;
    const materials = Array.isArray(o.material) ? o.material : [o.material];
    if (materials.every(mat => !mat.transparent && (mat.isMeshStandardMaterial || mat.isMeshLambertMaterial))) o.receiveShadow = true;
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

// 外の見た目：戸口（暗い口）と、外から上がる石段（戦の始めに全部まとめて一つ）
function buildOuter(rt) {
  mainBuildOuter(rt);
  anegawaBuildOuter(rt);
  villageBuildOuter(rt);
  NAKA.outer = true;
  const list = [], wood = [];
  for (const I of NAKA.list) {
    if (I.profile !== 'moribe') continue;
    
    if (I.disabled) { if (I.mesh) I.mesh.visible = false; continue; }
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
    if (I.approach) {
      const { pad, len, gy, y: approachY } = I.approach, entryY = approachY ?? lv.y, rise = entryY - gy, n = Math.max(3, Math.round(rise / 0.28));
      // 在所の屋敷は木の踏み段。堂の石段と区別し、上り口の当たりは共通のまま使う。
      const woodSteps = S.quality === 'high' && I.profile === 'inabayama'
        && ['goten', 'tamari', 'kura', 'bansho', 'nagaya', 'shrine'].includes(I.kind);
      // 稲葉山の本堂は石段と堂内の板床の間を、束で支えた木の踏板でつなぐ推定。
      // 同じ場所の石の踊り場は作らず、下の共通の框・踏板・根太を使う。
      const inabaHallLanding = S.quality === 'high' && I.profile === 'inabayama' && I.kind === 'hondo';
      const timberSteps = I.profile === 'moribe' && I.kind === 'yashiki';
      // 森部の木段は、石段を茶色にした地面までの塊ではなく、踏板と左右のささら桁で復元。
      // 段の上面・幅・奥行きは既存の足場にそろえ、出入りの高さを変えない。
      // 幅六十センチほどの踏板を一枚の厚板にせず、二枚の板をささら桁へ掛ける。
      // 目地の底は薄い下張りで受け、既存の歩く高さと踏面の広さを保つ。
      const treadDepth = len / n + .02;
      const tread = woodSteps ? new THREE.BoxGeometry(I.door.w + .3, .09, len / n + .02) : timberSteps ? new THREE.BoxGeometry(I.door.w + .3, .05, treadDepth / 2 - .003) : null;
      const treadBacking = timberSteps ? new THREE.BoxGeometry(I.door.w + .3, .01, treadDepth) : null;
      // 森部の堂の石段は切石を組んだ推定復元。段ごとの一枚岩にはせず、
      // 隣の段と縦目地をずらす。歩く上面・段数は共通の足場へそろえる。
      const templeStone = I.profile === 'moribe' && I.kind === 'hondo'
        ? new THREE.BoxGeometry(1, 1, 1) : null;
      // 御影堂も正面の木の縁へ木階段で上がる推定復元。
      // 僧坊・庫裏、砦の詰所・用屋と河口の民家は同じ踏板とささら桁を使う。
      // 石の塊を木色へ替えるだけにせず、床下を空け、歩く斜面は既存のものを保つ。
      const timberEntry = S.quality === 'high' && I.profile === 'nodafukushima'
        && ['hondo', 'sobo', 'kuri', 'goten', 'bansho', 'nagaya', 'kura', 'minka'].includes(I.kind);
      const stone = !timberEntry && !woodSteps && !timberSteps && I.kind !== 'goten' && I.kind !== 'gate';
      for (let q = 0; q < n; q++) {
        const t = (q + 1) / n, top = gy + rise * t, lz = ds * (hd + pad + len * (1 - t) + len / n / 2);
        if (timberEntry) {
          // 踏板は幅方向へ渡す二枚の板。継ぎ目を奥行きに通し、両端をささら桁で受ける。
          const depth = len / n;
          for (const side of [-1, 1]) {
            put(new THREE.BoxGeometry(I.door.w + .3, .08, (depth + .02) / 2 - .004),
              I.door.lx, top - .04, lz + side * (depth + .02) / 4,
              (q + (side > 0 ? 1 : 0)) % 2 ? 0x4e3c2a : 0x635039);
            // 斜めの桁に水平な板を載せるだけでは、踏板の手前が宙に浮く。
            // 下端を桁の勾配、上端を踏板の下面に合わせた受け木でつなぐ推定復元。
            const seat = new THREE.BoxGeometry(.12, 1, depth);
            const pos = seat.attributes.position;
            for (let j = 0; j < pos.count; j++) {
              const along = ds * (lz + pos.getZ(j)) - hd - pad;
              pos.setY(j, pos.getY(j) > 0 ? top - .08 : gy + rise * (1 - along / len) - .12);
            }
            seat.computeVertexNormals();
            put(seat, I.door.lx + side * (I.door.w / 2 - .08), 0, lz, 0x3a2a1c);
            // 木栓は受け木の真上で板を留め、木口だけ踏面へ一ミリ見せる。
            for (const edge of [-1, 1]) put(new THREE.BoxGeometry(.022, .004, .022),
              I.door.lx + side * (I.door.w / 2 - .08), top - .001,
              lz + edge * depth / 4, 0x3a2a1c);
          }
          continue;
        }
        const g = new THREE.BoxGeometry(I.door.w + 0.3, timberEntry ? .08 : Math.max(0.1, top - gy + 0.3), len / n + 0.02);
        put(g, I.door.lx, timberEntry ? top - .04 : (top + gy - 0.3) / 2, lz, stone ? (q % 2 ? 0x7c7468 : 0x847c70) : (q % 2 ? 0x4e3c2a : 0x56432f));
      }
      if (timberEntry) {
        // 二本のささら桁で踏板を受け、踊り場は床下の束と横木で支える。
        // 外形と一緒に一度だけ結合し、毎コマの処理や材質は増やさない。
        for (const side of [-1, 1]) {
          const x = I.door.lx + side * (I.door.w / 2 - .08);
          const stringer = new THREE.BoxGeometry(.12, .16, Math.hypot(len, rise));
          stringer.rotateX(ds * Math.atan2(rise, len));
          // 桁の上面を斜面から十二センチ下げ、各段の受け木の下端へ揃える。
          const drop = .12 + .08 * Math.hypot(len, rise) / len;
          put(stringer, x, (lv.y + gy) / 2 - drop, ds * (hd + pad + len / 2), 0x3a2a1c);
          const postH = Math.max(.08, rise - .12);
          put(new THREE.BoxGeometry(.12, postH, .12), x, lv.y - .12 - postH / 2,
            ds * (hd + pad - .06), 0x3a2a1c);
        }
        put(new THREE.BoxGeometry(I.door.w + .3, .14, .12), I.door.lx,
          lv.y - .19, ds * (hd + pad - .06), 0x3a2a1c);
      }
      // 御影堂の踊り場は正面全幅の木の縁。石の板を重ねて木目を隠さない。
      if (!(S.quality === 'high' && I.profile === 'nodafukushima' && I.kind === 'hondo')) {
        if (timberEntry) {
          // 僧坊・庫裏・砦の用屋・民家の踊り場も、一枚の厚板で塞がず板張りにする推定復元。
          // 奥行き方向へ張った板を、建物側と既存の外端の横木で受ける。
          // 元の外寸・厚みと歩く床は保ち、外形の箱の束へ設営時だけ結合する。
          const width = I.door.w + .4, count = Math.max(2, Math.ceil(width / .24));
          const pitch = width / count;
          for (let j = 0; j < count; j++) {
            const g = new THREE.BoxGeometry(pitch - .006, .12, pad + .4);
            put(g, I.door.lx - width / 2 + pitch * (j + .5), lv.y - .06,
              ds * (hd + pad / 2 - .1), j % 3 ? 0x4e3c2a : 0x635039);
          }
        } else {
          const g = new THREE.BoxGeometry(I.door.w + 0.4, 0.12, pad + 0.4); put(g, I.door.lx, lv.y - 0.06, ds * (hd + pad / 2 - 0.1), stone ? 0x847c70 : 0x4e3c2a);
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
        put(g, I.door.lx, entryY - .06, landingZ, stone ? 0x847c70 : 0x4e3c2a);
      }
    }
  }
  const M = mats();
  if (wood.length && !M.outerWood) {
    // 外の木は従来の雨空の明暗を保ち、絵と木口の処理だけ室内と共用する。
    const source = nodaWoodMaterial();
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

// 出入りの札でも体の幅全体を確かめる。中央と両肩の三本の線だけでは、
// その間にある細い戸当たりや引き残した框をすり抜けてしまう。
// 壁に沿う座標で幅三十五センチ分を広げ、移動区間との重なりを調べる。
// 腰の一点だけでなく、敷居を越える足元十センチから頭までを通す。
// 点の線分で登録した柱も、肩が触れる幅を残して調べる。
// 回転した屋敷も同じ判定を使い、毎コマの仮の物や配列は作らない。


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
  // 設楽原の民家・小堂も、町と同じ戸口と踏み段から出入りする。
  // 戦なので町の判定だけでは、下の板戸の確認まで届かなかった。
  const villageEntry = S.quality === 'high' && I.profile === 'shitaragahara'
    && ['minka', 'hondo'].includes(I.kind);
  if (I.disabled || (!rt.def.town && !villageEntry && !['iga', 'moribe'].includes(I.profile) && !(I.profile === 'anegawa' && S.quality === 'high'))) return null;
  // 設楽原の民家と小堂は、板戸を開けてから出入りする。
  // 案内札による移動でも、閉じた戸や開閉途中の戸を飛び越えない。
  const entryDoor = villageEntry ? I.doors?.find(d => d.exterior && !d.window) : null;
  if (entryDoor && (!entryDoor.want || entryDoor.open < .95)) return null;
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
  // 設楽原は実際の肩幅と背丈を戸口へ収める。固定の体格で調べると、
  // 大柄な者が柱・鴨居を抜け、小柄な者は通れる戸口でも札が出ない。
  const bodyRadius = u.bodyRadius ?? .3, bodyHeight = u.bodyHeight ?? 1.65;
  // 板戸は召し合わせで三センチ重なる。全開でも左右に十五ミリずつ
  // 框が残るため、外壁の穴だけで測ると肩が板戸をすり抜ける。
  // 戸の動きと同じ補間で、今実際に空いている幅へ身体を収める。
  const slide = entryDoor ? entryDoor.open * entryDoor.open * (3 - 2 * entryDoor.open) : 1;
  const openingHalf = entryDoor ? Math.min(I.door.w / 2, entryDoor.W * slide / 2 - .015) : I.door.w / 2;
  const entryHalfWidth = villageEntry ? openingHalf - bodyRadius - .02 : I.door.w / 2 + .4;
  // 戸口の高さは板間を基準にした値。十二センチ低い土間では、その分だけ
  // 鴨居の下が高くなる。出入りの着地点と同じ床面から測り、通れる背丈を拒まない。
  // 手前へ引いた板戸の鴨居は、戸の上端より二・五センチ下へ出る。
  // 外壁の開口だけでなく、この低い横木にも頭が当たらない高さを使う。
  const entryTop = entryDoor ? entryDoor.y + entryDoor.h - .025
    : lv.y + (I.door.h ?? Math.min(lv.h - .3, 2));
  const entryHeight = entryTop - I.doorIn.y;
  if (villageEntry && (entryHalfWidth < 0
    || bodyHeight + .02 > entryHeight
    || p.y + bodyHeight + .02 > entryTop)) return null;
  if (Math.abs(lx - I.door.lx) > entryHalfWidth) return null;
  // 低い戸口をくぐる補助でも、閉じた戸を飛び越えない。
  // 外の戸と、外へ出る道筋にある室内の戸が開き切ってから出入りの札を出す。
  if (I.profile === 'iga') for (const d of I.doors || []) {
    if (d.window) continue;
    if (!d.exterior && (out || d.lv.k !== 0 || d.trackZ * I.door.side < lz)) continue;
    if (!d.want || d.open < .98) return null;
  }
  if (!out) {
    // 低い土間も含めて出口の床を基準にし、跳躍中や床下から鴨居・床を飛び越えない。
    if (villageEntry && Math.abs(p.y - I.doorIn.y) > .35) return null;
    // 出口の札は障子から体の幅だけ離れた土間に立ってから出す。
    // 板間から閉じた障子や開閉途中の戸を飛び越えない。
    if (I.entryMinZ != null && lz < I.entryMinZ + (villageEntry ? bodyRadius - .3 : 0)) return null;
    if (I.entryLimit != null && lz < I.entryLimit) return null;
    return NAKA.cur && NAKA.cur.I === I && NAKA.cur.lv.k === 0 && lz > lv.d / 2 - 2.2 ? I.doorIn : null;
  }
  if (NAKA.cur || I.ladderId != null || lz < lv.d / 2 - 0.05) return null;
  const reach = I.approach ? I.approach.pad + I.approach.len : 0;
  if (lz > lv.d / 2 + reach + 2) return null;
  if (villageEntry) {
    // 戸前の段から入る時も、実際の踏面に立っていることを確かめる。
    // 地面から一メートル上まで許す共通判定では、跳躍中や踊り場の下から
    // 床板・受け木を飛び越えて室内へ移れてしまう。
    let surface = I.doorIn.y;
    if (I.approach) {
      const a = I.approach;
      const t = Math.max(0, Math.min(1, (lz - lv.d / 2 - a.pad) / a.len));
      surface = rampSurface(a.gy, a.y, 1 - t, a.steps);
      if (lz > lv.d / 2 + reach) surface = rt.world.heightAt(p.x, p.z);
    } else surface = rt.world.heightAt(p.x, p.z);
    if (Math.abs(p.y - surface) > .35) return null;
  }
  const low = I.approach ? Math.min(I.approach.gy, lv.y) : I.ladderId != null ? I.doorOut.y : lv.y;
  if (p.y < low - 0.8 || p.y > lv.y + 1) return null;
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
    for (let i = 0; i < I.glows.length; i++) {
      const sp = I.glows[i], t = NAKA.t * 7 + i * 1.7 + I.id;
      sp.visible = !rt.camera || sp.position.distanceTo(rt.camera.position) > 1.6;
      const size = sp.userData.nakaGlowScale;
      const sway = S.reduceMotion || REDUCE_MOTION?.matches ? 0 : Math.sin(t) * .04 + Math.sin(t * 2.3) * .03;
      sp.scale.setScalar(size != null ? size * (1 + sway / .78)
        : (.78 + sway) * ((sp.userData.glowScale ?? I.lampGlowScale ?? .8) / .8));
    }
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
  const list = [];
  let landingShape = null;
  for (const I of NAKA.list) {
    if (I.profile === 'moribe' || I.profile === 'anegawa' || S.quality === 'high' && I.profile === 'shitaragahara') continue;
    
    if (I.disabled) { if (I.mesh) I.mesh.visible = false; continue; }
    const lv = I.levels[0], ds = I.door.side, hd = lv.d / 2;
    const put = (g, lx, y, lz, hex) => {
      g.translate(lx, y, lz); g.rotateY(I.rot); g.translate(I.x, 0, I.z);
      list.push(colorize(g, hex));
    };
    // 戸口：柱二本と鴨居。入口の穴を空けたままにする。
    const dh = I.door.h ?? Math.min(lv.h - 0.3, 2.0);
    // 壁の穴を塞がず、枠から中が見える戸口にする。
    const off = I.kind === 'goten' ? 0.2 : 0.08;
    if (!I.hasExterior) { const g = new THREE.BoxGeometry(I.door.w + 0.3, 0.16, 0.2); put(g, I.door.lx, lv.y + dh + 0.08, ds * (hd + off + 0.04), 0x2e2218); }
    if (!I.hasExterior) for (const e of [-1, 1]) { const g = new THREE.BoxGeometry(0.16, dh, 0.2); put(g, I.door.lx + e * (I.door.w / 2 + 0.08), lv.y + dh / 2, ds * (hd + off + 0.04), 0x2e2218); }
    if (I.profile === 'iga') {
    if (I.approach) {
      const { pad, len, gy } = I.approach, rise = lv.y - gy, n = Math.max(3, Math.round(rise / 0.28));
      // 伊賀の茅葺きの小屋・館は木の踏板と束で上がる推定復元。石段にしない。
      const iga = I.profile === 'iga';
      const stone = !iga && I.kind !== 'goten' && I.kind !== 'gate';
      // 束の足は階段下端の高さでそろえず、それぞれの地面へ埋める。
      // 斜面の左右で浮く束をなくす。設営時だけ共通の箱形から作る。
      const timber = iga ? new THREE.BoxGeometry(1, 1, 1) : null;
      const support = (lx, lz, top) => {
        const [wx, wz] = I.P(lx, lz), bottom = rt.world.heightAt(wx, wz) - .15;
        if (top <= bottom) return;
        const post = timber.clone(); post.scale(.12, top - bottom, .12);
        put(post, lx, (bottom + top) / 2, lz, 0x4e3c2a);
      };
      // 高い束は貫で結ぶ推定復元。踏板の下だけに納め、斜面へ横木を埋めない。
      // 地面を五点で調べ、低い束では省く。共有の箱形を設営時の外装へ焼き込む。
      const supportTie = (ax, az, bx, bz, top) => {
        let ground = -Infinity;
        for (let j = 0; j <= 4; j++) {
          const [wx, wz] = I.P(ax + (bx - ax) * j / 4, az + (bz - az) * j / 4);
          ground = Math.max(ground, rt.world.heightAt(wx, wz));
        }
        const tieY = ground + .16;
        if (tieY + .12 >= top) return;
        const length = Math.hypot(bx - ax, bz - az), angle = Math.atan2(-(bz - az), bx - ax);
        const tie = timber.clone(); tie.scale(length + .16, .08, .06); tie.rotateY(angle);
        put(tie, (ax + bx) / 2, tieY, (az + bz) / 2, 0x604831);
        // 束を貫く材の抜け止め。込栓の木口は束の両側面へ出す。
        for (const [x, z] of [[ax, az], [bx, bz]]) for (const face of [-1, 1]) {
          const peg = timber.clone(); peg.scale(.018, .018, .008); peg.rotateY(angle);
          put(peg, x + face * Math.sin(angle) * .064, tieY,
            z + face * Math.cos(angle) * .064, 0x38291d);
        }
      };
      for (let q = 0; q < n; q++) {
        const t = (q + 1) / n, top = gy + rise * t, lz = ds * (hd + pad + len * (1 - t) + len / n / 2);
        if (!iga) {
          const g = new THREE.BoxGeometry(I.door.w + .3, Math.max(.1, top - gy + .3), len / n + .02);
          put(g, I.door.lx, (top + gy - .3) / 2, lz, stone ? (q % 2 ? 0x7c7468 : 0x847c70) : (q % 2 ? 0x4e3c2a : 0x56432f));
        }
        if (iga) {
          // 踏板も踊り場と同じ板張りにする。一枚の塊にせず、
          // 受け木へ直交する板を並べ、留める木栓は受け木の真上へ納める。
          // 外寸・段の上端・歩く足場は保ち、共通の箱形を既存の束へまとめる。
          const width = I.door.w + .3, depth = len / n + .02;
          const boards = Math.max(2, Math.ceil(width / .28)), boardW = width / boards;
          for (let j = 0; j < boards; j++) {
            const lx = I.door.lx - width / 2 + (j + .5) * boardW;
            const board = timber.clone(); board.scale(boardW - .003, .1, depth);
            put(board, lx, top - .05, lz, j % 2 ? 0x56432f : 0x4e3c2a);
            const peg = timber.clone(); peg.scale(.018, .003, .018);
            put(peg, lx, top + .0005, lz, 0x38291d);
          }
          // 木階段の踏板は左右の束を結ぶ受け木へ載せる推定復元。
          // 踊り場と同じ納まりで束の頭へ横木を掛け、踏板の下面まで支える。
          // 共通の箱形を静止した外装へまとめ、歩く高さと戸口の幅は保つ。
          const beam = timber.clone(); beam.scale(I.door.w + .12, .12, .12);
          put(beam, I.door.lx, top - .16, lz, 0x4e3c2a);
          for (const side of [-1, 1])
            support(I.door.lx + side * I.door.w / 2, lz, top - .22);
          supportTie(I.door.lx - I.door.w / 2, lz,
            I.door.lx + I.door.w / 2, lz, top - .22);
        }
      }
      if (!iga) {
        const g = new THREE.BoxGeometry(I.door.w + 0.4, 0.12, pad + 0.4);
        put(g, I.door.lx, lv.y - 0.06, ds * (hd + pad / 2 - 0.1), stone ? 0x847c70 : 0x4e3c2a);
      }
      if (iga) {
        // 踊り場は一枚の塊でなく、前後の受け木へ渡す板張りで推定復元。
        // 板の長手を受け木と直交させ、板端の木栓も受け木の真上へ納める。
        // 外寸と歩く上端は保つ。原形を使い回し、既存の外装の束へ焼き込む。
        const width = I.door.w + .4, depth = pad + .4;
        const boards = Math.max(2, Math.ceil(width / .28)), boardW = width / boards;
        const centerZ = ds * (hd + pad / 2 - .1);
        for (let q = 0; q < boards; q++) {
          const lx = I.door.lx - width / 2 + (q + .5) * boardW;
          const board = timber.clone(); board.scale(boardW - .003, .12, depth);
          put(board, lx, lv.y - .06, centerZ, q % 2 ? 0x56432f : 0x4e3c2a);
          for (const end of [-1, 1]) {
            const peg = timber.clone(); peg.scale(.018, .003, .018);
            put(peg, lx, lv.y + .0005, centerZ + end * (depth / 2 - .08), 0x38291d);
          }
        }
        // 戸口前の踊り場も板だけで浮かせず、二本の受け木と四本の束で支える推定復元。
        // 足場と戸の引きしろは保ち、静止した外装の束へまとめる。
        for (const end of [-1, 1]) {
          const lz = ds * (hd + pad / 2 - .1 + end * ((pad + .4) / 2 - .08));
          const beam = timber.clone(); beam.scale(I.door.w + .4, .12, .12);
          put(beam, I.door.lx, lv.y - .18, lz, 0x4e3c2a);
          for (const side of [-1, 1])
            support(I.door.lx + side * I.door.w / 2, lz, lv.y - .24);
          supportTie(I.door.lx - I.door.w / 2, lz,
            I.door.lx + I.door.w / 2, lz, lv.y - .24);
        }
        for (const side of [-1, 1]) {
          const lx = I.door.lx + side * I.door.w / 2;
          supportTie(lx, centerZ - (depth / 2 - .08),
            lx, centerZ + (depth / 2 - .08), lv.y - .24);
        }
        timber.dispose();
      }
    }
} else {
if (I.approach) {
      const { pad, len, gy } = I.approach, rise = lv.y - gy, n = Math.max(3, Math.round(rise / 0.28));
      // 稲葉山の主殿・山麓館も、遠侍・用屋と同じ木の踏板と支えで上がる推定復元。
      // 木色の塊を積んだ階段にせず、本堂の石段とは分ける。
      const woodSteps = S.quality === 'high' && I.profile === 'inabayama'
        && ['goten', 'tamari', 'kura', 'bansho', 'nagaya', 'shrine'].includes(I.kind);
      // 稲葉山の本堂は石段と堂内の板床の間を、束で支えた木の踏板でつなぐ推定。
      // 同じ場所の石の踊り場は作らず、下の共通の框・踏板・根太を使う。
      const inabaHallLanding = S.quality === 'high' && I.profile === 'inabayama' && I.kind === 'hondo';
      const timberEntry = S.quality === 'high' && I.profile?.startsWith('iwamura');
      if (timberEntry) {
      // 岩村の板葺きの小屋・屋敷・堂社は木の階と踏板で上がる推定復元。
      // 石段への一律の置換を避け、既存の段数・寸法と歩ける当たりは保つ。
      const timberEntry = S.quality === 'high' && (I.profile === 'iwamura' || I.profile?.startsWith('iwamura_'));
      const stone = !timberEntry && I.kind !== 'goten' && I.kind !== 'gate';
      for (let q = 0; q < n; q++) {
        const t = (q + 1) / n, top = gy + rise * t, lz = ds * (hd + pad + len * (1 - t) + len / n / 2);
        const g = new THREE.BoxGeometry(I.door.w + 0.3, timberEntry ? .1 : Math.max(0.1, top - gy + 0.3), len / n + 0.02);
        put(g, I.door.lx, timberEntry ? top - .05 : (top + gy - 0.3) / 2, lz, stone ? (q % 2 ? 0x7c7468 : 0x847c70) : (q % 2 ? 0x4e3c2a : 0x56432f));
      }
      if (timberEntry) for (const side of [-1, 1]) {
        // 踏板を左右のささら桁で受け、踊り場の下には束を立てる。
        const beam = new THREE.BoxGeometry(.12, .14, Math.hypot(len, rise) + .16);
        beam.rotateX(ds * Math.atan2(rise, len));
        put(beam, I.door.lx + side * I.door.w / 2, gy + rise / 2 - .12, ds * (hd + pad + len / 2), 0x4e3c2a);
        // 踊り場の板は左右の根太で受け、根太の下の横木を束へ載せる推定復元。
        // 床面と通行の当たりは保ち、支える木だけを床下へ納める。
        const joist = new THREE.BoxGeometry(.12, .14, pad + .4);
        put(joist, I.door.lx + side * I.door.w / 2, lv.y - .19, ds * (hd + pad / 2 - .1), 0x4e3c2a);
        // 束の足元は階段下端の高さでなく、その柱の直下の地面へ合わせる。
        // 岩村の斜面でも浮かず、礎石の上から横木の下面まで通す推定復元。
        const postX = I.door.lx + side * I.door.w / 2, postZ = ds * (hd + pad / 2);
        const [footX, footZ] = I.P(postX, postZ);
        const groundY = rt.world.heightAt(footX, footZ), postTop = lv.y - .4;
        const clearance = postTop - groundY;
        if (clearance > .02) {
          const stoneH = Math.min(.12, clearance / 3), postBottom = groundY + stoneH;
          const footing = new THREE.BoxGeometry(.26, stoneH + .04, .24);
          put(footing, postX, groundY + (stoneH - .04) / 2, postZ, 0x777369);
          const postH = postTop - postBottom;
          const post = new THREE.BoxGeometry(.12, postH, .12);
          put(post, postX, (postTop + postBottom) / 2, postZ, 0x4e3c2a);
          // 束と横木の間を短い方杖で固める。踊り場の下へ納め、戸口を空ける。
          const reach = Math.min(.35, postH / 2, I.door.w / 5);
          if (reach > .1) {
            const brace = new THREE.BoxGeometry(.07, Math.SQRT2 * reach, .07);
            brace.rotateZ(side * Math.PI / 4);
            put(brace, postX - side * reach / 2, postTop - reach / 2, postZ, 0x4e3c2a);
          }
        }
      }
      if (timberEntry) {
        const bearer = new THREE.BoxGeometry(I.door.w + .24, .14, .14);
        put(bearer, I.door.lx, lv.y - .33, ds * (hd + pad / 2), 0x4e3c2a);
        // 一枚の厚板をやめ、約一尺幅の踏板を横に渡す。既存の束へ結合する。
        const depth = pad + .4, count = Math.max(1, Math.round(depth / .3)), pitch = depth / count;
        for (let q = 0; q < count; q++) {
          const plank = new THREE.BoxGeometry(I.door.w + .4, .12, pitch - .006);
          put(plank, I.door.lx, lv.y - .06, ds * (hd - .3 + (q + .5) * pitch), q % 2 ? 0x4e3c2a : 0x56432f);
        }
      } else {
        const g = new THREE.BoxGeometry(I.door.w + 0.4, 0.12, pad + 0.4); put(g, I.door.lx, lv.y - 0.06, ds * (hd + pad / 2 - 0.1), stone ? 0x847c70 : 0x4e3c2a);
      }
      } else {
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

  }
  if (landingShape) landingShape.dispose();
  if (list.length) {
    const mesh = new THREE.Mesh(mergeGeometries(list), mats().door);
    mesh.castShadow = mesh.receiveShadow = true; mesh.matrixAutoUpdate = false;
    rt.scene.add(mesh);
  }
}

function anegawaBuildInside(rt, I) {
  
  I.built = true;
  const M = mats(), list = [], timbers = [], lamps = [], winPts = [], paper = [], ceilingWood = [];
  const naibu = I.profile || ['yagura', 'gate'].includes(I.kind) ? new KitBatch() : null;
  // 炉と竈のある民家だけ、火の上の梁・屋根裏へ煤を含ませる用途からの補い。
  // 建物を回す前の頂点色へ一度だけ焼き込み、形・材質・毎コマの処理を増やさない。
  const smokeLevel = I.profile === 'anegawa' && I.kind === 'minka' && S.quality === 'high' ? I.levels[0] : null;
  const fires = smokeLevel ? smokeLevel.layout.props.filter(p => p.part === 'hearth' || p.part === 'stove') : [];
  const indoorColor = (g, hex, emit) => {
    g = colorize(g, hex, emit);
    if (fires.length) {
      const pos = g.attributes.position, colors = g.attributes.color;
      for (let j = 0; j < pos.count; j++) {
        const height = Math.min(1, Math.max(0, (pos.getY(j) - smokeLevel.y - smokeLevel.h + .5) / .8));
        if (!height) continue;
        let soot = 0;
        for (const p of fires) {
          const dx = pos.getX(j) - p.x, dz = pos.getZ(j) - p.z;
          soot = Math.max(soot, .18 + .42 / (1 + (dx * dx + dz * dz) * .35));
        }
        const shade = 1 - soot * height;
        colors.setXYZ(j, colors.getX(j) * shade, colors.getY(j) * shade, colors.getZ(j) * shade);
      }
    }
    return g;
  };
  const put = (g, lx, y, lz, hex, emit) => { g.translate(lx, y, lz); g = indoorColor(g, hex, emit); g.rotateY(I.rot); g.translate(I.x, 0, I.z); list.push(g); };
  // 比叡山は天井板・格縁・柱も共通の箱から寸法を取ってまとめる。
  const floorBoardShape = I.profile === 'hieizan' ? new THREE.BoxGeometry(1, 1, 1) : null;
  const box = (lx, y, lz, w, h, d, hex, emit, grainAxis = null) => {
    const g = floorBoardShape ? floorBoardShape.clone().scale(w, h, d) : new THREE.BoxGeometry(w, h, d);
    const red = hex >> 16 & 255, green = hex >> 8 & 255, blue = hex & 255;
    ;
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
  const inabaCeilingBoard = (lx, y, lz, w, h, d, hex, alongX = false) => {
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

  const ceilingBoards = [], wallBoards = [], plasterWalls = [], endBoards = [], thatchLinings = [];
  // 館と小堂の塗り壁は、無地の外周と塗り肌のある間仕切りに分けない。
  // 既存の壁を置き換え、窓・戸口と同じ切り欠きで一棟一束にまとめる。
  const plasterWall = (x, y, z, w, h, d, hex, face) => {
    const unit = new THREE.BoxGeometry(w, h, d), g = unit.toNonIndexed(); unit.dispose();
    const p = g.attributes.position, uv = g.attributes.uv;
    for (let j = 0; j < p.count; j++)
      uv.setXY(j, (face === 'z' ? p.getX(j) + x : p.getZ(j) + z) * .5,
        (p.getY(j) + y) * .5);
    g.translate(x, y, z); g.rotateY(I.rot); g.translate(I.x, 0, I.z);
    plasterWalls.push(colorize(g, hex));
  };
  let ceilingShape = null;
  const ceilingBoard = (x, y, z, w, h, d, hex, offset, wallFace = null, timberAxis = null, slope = 0, turn = null, ridgeEnd = 0) => {
    if (S.quality !== 'high') { box(x, y, z, w, h, d, hex); return; }
    if (!ceilingShape) {
      const unit = new THREE.BoxGeometry(1, 1, 1);
      ceilingShape = unit.toNonIndexed(); unit.dispose();
    }
    const g = ceilingShape.clone(); g.scale(w, h, d);
    const p = g.attributes.position, uv = g.attributes.uv;
    // 木目は板の長手へ。室内座標で割り付けてから建物を回し、
    // 隣の板では絵の位置をずらして同じ筋の繰り返しを目立たせない。
    // 壁板は上下へ木目を通す。横壁も建物を回す前の板幅でそろえる。
    const normal = g.attributes.normal;
    const capIndices = [], sideIndices = [];
    for (let j = 0; j < p.count; j++) {
      const endFace = I.profile === 'anegawa' && timberAxis && Math.abs(timberAxis === 'x'
        ? normal.getX(j) : timberAxis === 'y' ? normal.getY(j) : normal.getZ(j)) > .5;
      if (endFace) {
        const across = timberAxis === 'x' ? p.getZ(j) : p.getX(j);
        const up = timberAxis === 'y' ? p.getZ(j) : p.getY(j);
        const span = Math.max(timberAxis === 'x' ? d : w, timberAxis === 'y' ? d : h);
        uv.setXY(j, .5 + across / span * .9, .5 + up / span * .9);
        capIndices.push(j);
        continue;
      }
      sideIndices.push(j);
      if (timberAxis === 'y') {
        // 外周の角柱も四面に縦の木目を通す。柱頭と柱脚だけは木口にする。
        const cap = Math.abs(normal.getY(j)) > .5;
        const across = Math.abs(normal.getX(j)) > .5 ? p.getZ(j) : p.getX(j);
        uv.setXY(j, (cap ? p.getX(j) : across) * 2 + offset,
          (cap ? p.getZ(j) : p.getY(j)) * .65 + offset * .37);
      } else if (timberAxis) {
        // 竿縁・格縁・回縁の木目を材の長手へ通す。側面も厚みで割り付け、
        // 木口だけは断面へ投影する。一枚の絵と天井板の結合先を共用する。
        const alongX = timberAxis === 'x';
        const cap = Math.abs(alongX ? normal.getX(j) : normal.getZ(j)) > .5;
        const across = Math.abs(normal.getY(j)) > .5
          ? alongX ? p.getZ(j) : p.getX(j) : p.getY(j);
        uv.setXY(j, (cap ? alongX ? p.getZ(j) : p.getX(j) : across) * 2 + offset,
          (cap ? p.getY(j) : alongX ? p.getX(j) : p.getZ(j)) * .65 + offset * .37);
      } else uv.setXY(j, (wallFace === 'x' ? p.getZ(j) : p.getX(j)) * 2 + offset,
        (wallFace ? p.getY(j) : p.getZ(j)) * .65 + offset * .37);
    }
    // 棟で向かい合う垂木の木口を鉛直に切り合わせる。
    // 直角の木口をそのまま傾けると、上半分が棟を越えて相手の材へ食い込む。
    // 軒側の端・断面・木目は保ち、共有する箱を設営時だけ加工する。
    if (ridgeEnd) {
      for (let j = 0; j < p.count; j++) if (ridgeEnd * p.getX(j) < 0)
        p.setX(j, p.getX(j) + p.getY(j) * Math.tan(slope));
      g.computeVertexNormals();
    }
    // 傾いた垂木も、材の座標で木目を割り付けてから屋根勾配へ回す。
    if (turn) g.applyQuaternion(turn); else g.rotateZ(slope);
    g.translate(x, y, z); indoorColor(g, hex); g.rotateY(I.rot); g.translate(I.x, 0, I.z);
    if (capIndices.length) {
      // 切断面だけを一束へ。設営時に分け、開閉中や毎コマには形を作らない。
      g.setIndex(capIndices); endBoards.push(g.toNonIndexed());
      g.setIndex(sideIndices); (wallFace ? wallBoards : ceilingBoards).push(g.toNonIndexed());
      g.dispose();
    } else (wallFace ? wallBoards : ceilingBoards).push(g);
  };
  // 姉川の外周材も室内の木目へそろえる。箱の寸法と当たりは保ち、
  // 天井板と同じ結合形・共有材質へ納めて描く回数を増やさない。
  const timberBox = (x, y, z, w, h, d, hex, axis) => {
    if (I.profile !== 'anegawa' || S.quality !== 'high') { box(x, y, z, w, h, d, hex); return; }
    ceilingBoard(x, y, z, w, h, d, hex, (x + z) * .17, null, axis);
  };
  const grp = new THREE.Group();
  const paperWindows = I.templePaper;
  const Ls = I.levels, ds = I.door.side;
  const goten = !['tenshu', 'yagura', 'gate'].includes(I.kind);
  // 姉川の板倉と番小屋は、外の板壁に合わせて内側も板張りにする。
  const boardWalls = I.profile === 'anegawa' && ['kura', 'bansho'].includes(I.kind);
  // 民家と宿小屋の内壁は、外の土壁に合わせて藁すさを含む荒壁として補う。
  // 高画質の既存の壁面を置き換え、一棟一束・共有材質で納める。
  const earthWalls = I.profile === 'anegawa' && S.quality === 'high' && ['minka', 'nagaya'].includes(I.kind);
  const plainCeiling = I.profile === 'inabayama' && ['kura', 'bansho'].includes(I.kind)
    || I.profile === 'echizen_ikko' && I.kind === 'bansho'
    || ['nodafukushima', 'usayama', 'iga', 'takato', 'tottori', 'anegawa'].includes(I.profile) && ['kura', 'bansho', 'nagaya', 'minka'].includes(I.kind)
    || I.profile === 'iwamura_' + I.kind && ['kura', 'bansho', 'nagaya'].includes(I.kind);
  const WOOD = 0x6a5038, DARK = 0x3a2a1c, WALL = boardWalls ? 0x79634a : earthWalls ? 0xb4a080 : I.sgOverhead ? 0x817967 : goten ? 0xb8ab90 : 0xa89a80, FLOOR = 0x8a6a48, BOARD = I.sgOverhead ? 0x514b3d : 0x6a5238;
  for (let k = 0; k < Ls.length; k++) {
    const lv = Ls[k], hw = lv.w / 2, hd = lv.d / 2, h = lv.h, y = lv.y;
    // 窓と柱の位置は床際の納まりにも使うため、内装を組む前にそろえる。
    const wins = windowsFor(I, lv, k);
    // 板倉・番小屋の梁は前後の柱で受ける。天井板の木口も同じ梁芯へ納める。
    // 戸口の中に立たない柱だけを選び、設営時に一度だけ割り付ける。
    const boardBeamXs = [], boardCrossZs = [];
    if (boardWalls && S.quality === 'high') {
      const front = wallPostPositions(I, wins, 'z', ds, lv.w);
      const back = wallPostPositions(I, wins, 'z', -ds, lv.w);
      for (const x of front) {
        if (Math.abs(x) >= hw - .3 || !back.has(x)
          || k === 0 && Math.abs(x - I.door.lx) < I.door.w / 2 + .2) continue;
        boardBeamXs.push(x);
      }
      boardBeamXs.sort((a, b) => a - b);
      // 横向きの桁も左右の柱芯で受ける。奥行きの一定割合へ置くと、
      // 格子窓の上や柱のない板壁に木口が浮くため、両壁に共通する柱を選ぶ。
      // 本数は二本まで。柱・窓・通路は動かさず、既存の横木を掛け替える。
      const left = wallPostPositions(I, wins, 'x', -1, lv.d);
      const right = wallPostPositions(I, wins, 'x', 1, lv.d);
      const supports = [...left].filter(z => Math.abs(z) < hd - .3 && right.has(z));
      for (const target of [-hd * .55, hd * .55]) {
        let best = null, distance = Infinity;
        for (const z of supports) {
          if (boardCrossZs.includes(z)) continue;
          const delta = Math.abs(z - target);
          if (delta < distance) { best = z; distance = delta; }
        }
        if (best !== null) boardCrossZs.push(best);
      }
      boardCrossZs.sort((a, b) => a - b);
    }
    // 板間の表板は実際の柱脚を欠いて納める。窓で移した柱と戸口の欠きも共有する。
    // 設営時だけ外周柱の断面を渡し、床の足場や建具の動きには加えない。
    const floorPosts = [];
    if (I.profile === 'anegawa' && S.quality === 'high') {
      // 小堂は丸柱だけでなく、床から立ち上がる礎盤の外寸で表板を欠く。
      // 柱脚を貫く板と釘を残さず、下地・歩ける高さは既存のままにする。
      const hallFloor = I.kind === 'hondo';
      for (const face of ['z', 'x']) for (const side of [-1, 1]) {
        const len = face === 'z' ? lv.w : lv.d;
        const fixed = side * ((face === 'z' ? hd : hw) - .16);
        for (const t of wallPostPositions(I, wins, face, side, len)) {
          if (k === 0 && face === 'z' && side === ds && Math.abs(t - I.door.lx) < I.door.w / 2 + .2) continue;
          const x = face === 'z' ? t : fixed, z = face === 'z' ? fixed : t;
          // 脇壁の隅柱は前後の壁で一本だけ立つ。床の欠きも同じ割付にそろえる。
          if (face === 'x' && (Math.abs(t + len / 2 - .16) < .001
            || Math.abs(t - len / 2 + .16) < .001)) continue;
          const rx = hallFloor ? .097 : face === 'z' ? .082 : .072;
          const rz = hallFloor ? .097 : face === 'z' ? .072 : .082;
          floorPosts.push([x - rx, x + rx, z - rz, z + rz]);
        }
      }
      // 戸口脇の柱は等間隔の柱とは別に立つ。入口の板も柱脚へ差し込まない。
      if (k === 0) for (const side of [-1, 1]) {
        const x = I.door.lx + side * (I.door.w / 2 + .08), z = ds * (hd - .16);
        const rx = hallFloor ? .097 : .082, rz = hallFloor ? .097 : .072;
        floorPosts.push([x - rx, x + rx, z - rz, z + rz]);
      }
      // 炉上の受け梁の支柱も床から立つ。外周柱だけを欠くと、
      // この二本には表板と板留めの釘が食い込むため、同じ欠きへ渡す。
      // 調度と当たりが使う柱位置・十六センチ角に、二ミリの逃げをそろえる。
      if (I.kind === 'minka') for (const p of lv.layout.props) {
        if (p.part !== 'hearth' || h - (p.y || 0) - .12 <= .75) continue;
        const room = lv.layout.rooms.find(r => p.x >= r.x0 && p.x <= r.x1
          && p.z >= r.z0 && p.z <= r.z1);
        if (!room) continue;
        for (const x of [room.x0 + .08, room.x1 - .08])
          floorPosts.push([x - .082, x + .082, p.z - .082, p.z + .082]);
      }
    }
    if (lv.partitionPosts) floorPosts.push(...lv.partitionPosts);
    const decor = furnishLayout(lv.layout, h, { partitions: true, dim: true, floorPosts });
    decor.position.set(I.x, y, I.z); decor.rotation.y = I.rot; grp.add(decor);
    if (k === 0 && I.entryDoor) {
      const d = I.entryDoor;
      // 外付けの引き戸にも敷居・鴨居を通し、開けた戸を受ける所まで溝を延ばす。
      // 外へ離した溝から戸口の柱まで一枚の木でつなぎ、枠を宙に浮かせない。
      const compact = d.track < .13;
      const jambZ = ds * hd, railZ = (d.lz + jambZ) / 2 + (compact ? 0 : ds * .055);
      // 小堂の敷居・鴨居も戸と同じ溝幅で納め、縁側の丸柱まで突き出さない。
      const railDepth = Math.abs(d.lz - jambZ) + (compact ? 2 * (d.track + .04) : .23);
      const railWidth = d.W + 2 * d.travel;
      // 内の建具と同じく、框が通る幅を実際に欠いた二筋の溝にする。
      // 敷居の上面と鴨居の下面は保ち、戸を木や黒い線へ埋めない。
      // 外戸も上溝を深くし、下の実が抜けるだけ持ち上げられる納まりにそろえる。
      const grooveDepth = .012, headDepth = .026, halfGroove = .032;
      const railPiece = (yy, zz, hh, dd, hex = DARK) => {
        // 外戸の敷居・鴨居も横木の長手へ木目を通す。
        // 溝底の暗い線はそのまま残し、既存の室内材と結合先を共有する。
        if (hex !== DARK) { box(d.lx, yy, zz, railWidth, hh, dd, hex); return; }
        if (I.profile !== 'anegawa' || S.quality !== 'high' || railWidth <= 3.6) {
          timberBox(d.lx, yy, zz, railWidth, hh, dd, hex, 'x'); return;
        }
        // 小堂の外戸は引き込みまで含めると四メートルを超える。
        // 長い敷居・鴨居は戸口右脇の柱上で相欠きに継ぐ推定復元。
        // 溝の各帯も同じ位置で継ぎ、戸の通る上下面と移動範囲は保つ。
        const left = d.lx - railWidth / 2, right = d.lx + railWidth / 2;
        const joint = d.lx + d.W / 2 + .06, lap = .05;
        timberBox((left + joint - lap) / 2, yy, zz, joint - lap - left, hh, dd, hex, 'x');
        timberBox((joint + lap + right) / 2, yy, zz, right - joint - lap, hh, dd, hex, 'x');
        for (const side of [-1, 1])
          timberBox(joint, yy + side * (hh / 4 + .00025), zz,
            lap * 2, hh / 2 - .0005, dd, hex, 'x');
      };
      railPiece(d.y - (.04 + grooveDepth) / 2, railZ, .04 - grooveDepth, railDepth);
      railPiece(d.y + d.h + (.1 + headDepth) / 2, railZ, .1 - headDepth, railDepth);
      let edge = railZ - railDepth / 2;
      for (const dz of [-d.track, d.track]) {
        const center = d.lz + dz, start = center - halfGroove;
        railPiece(d.y - grooveDepth / 2, (edge + start) / 2, grooveDepth, start - edge);
        railPiece(d.y + d.h + headDepth / 2, (edge + start) / 2, headDepth, start - edge);
        railPiece(d.y - grooveDepth + .0005, center, .001, halfGroove * 2, 0x17120e);
        railPiece(d.y + d.h + headDepth - .0005, center, .001, halfGroove * 2, 0x17120e);
        edge = center + halfGroove;
      }
      const end = railZ + railDepth / 2;
      railPiece(d.y - grooveDepth / 2, (edge + end) / 2, grooveDepth, end - edge);
      railPiece(d.y + d.h + headDepth / 2, (edge + end) / 2, headDepth, end - edge);
      for (const dx of [-d.W / 2 - .06, d.W / 2 + .06])
          timberBox(d.lx + dx, d.y + d.h / 2, jambZ, .12, d.h, .12, DARK, 'y');
      if (I.profile === 'anegawa' && S.quality === 'high') {
        // 開け切った外戸の端を戸当たりで受ける。敷居と鴨居の端をつなぎ、
        // 戸の移動範囲の外へ納めるので、既存の戸口と当たりは狭めない。
        for (const side of [-1, 1])
          timberBox(d.lx + side * (railWidth / 2 + .035), d.y + d.h / 2, d.lz,
            .07, d.h, 2 * (d.track + .04), DARK, 'y');
        for (const p of d.sillSupports || []) {
          box(p.x, p.ground, p.z, .22, .08, .22, 0x777267);
          timberBox(p.x, (p.ground + .04 + p.top) / 2, p.z,
            .12, p.top - p.ground - .04, .12, DARK, 'y');
        }
      }
    }
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
    const floorPieces = S.quality === 'high' && I.profile === 'inabayama'
      && lv.layout.rooms.some(r => r.floor === 'tatami' && !(r.y > 0))
      ? lv.pieces.flatMap(([px0, px1, pz0, pz1]) => lv.layout.rooms.map(r => [
        Math.max(px0, r.x0), Math.min(px1, r.x1), Math.max(pz0, r.z0), Math.min(pz1, r.z1),
        r.floor === 'tatami' && !(r.y > 0) ? -.06 : 0,
      ]).filter(v => v[1] > v[0] && v[3] > v[2]))
      : lv.pieces;
    for (const [x0, x1, z0, z1, offset = 0] of floorPieces) {
      ;
      const [fx, fz] = I.P((x0 + x1) / 2, (z0 + z1) / 2);
      if (!naibu || !addNaibu(naibu, 'floor_modular_a', fx, y + offset - .08, fz, x1 - x0, .08, z1 - z0, I.rot)) box((x0 + x1) / 2, y + offset - .04, (z0 + z1) / 2, x1 - x0, .08, z1 - z0, FLOOR);
    }
    const upSt = I.stairs[k];
    // 姉川の民家・宿小屋と板倉・番小屋は、小屋組を見せる推定復元。
    // 露出する梁・母屋・束は共有木目を材の長手へ通す。寸法と当たりは共通のまま。
    const openRoof = I.profile === 'anegawa' && (['minka', 'nagaya'].includes(I.kind)
      || I.roof?.kind === 'gable' && ['kura', 'bansho'].includes(I.kind));
    const smallHall = I.profile === 'anegawa' && I.kind === 'hondo';
    // 小堂の身舎も縁側と同じ丸柱で受ける。一本の形を使い回し、壁の厚みの範囲に納める。
    // 八角の輪郭を十六分割へ。床と天井に隠れる端面を省き、三角形数は元と同じにする。
    const hallPost = smallHall && S.quality === 'high' ? hallPostGeometry(h) : null;
    // 小堂の外周・戸口の丸柱にも縦の木目を通す。内陣だけ木肌がある不揃いを補う。
    // 円周の実寸で横の目を割り付け、天井材と同じ結合形・材質へ設営時にまとめる。
    const hallPostAt = (x, z) => {
      const g = hallPost.toNonIndexed(), pos = g.attributes.position, uv = g.attributes.uv;
      const offset = (x + z) * .17;
      for (let j = 0; j < pos.count; j++)
        uv.setXY(j, uv.getX(j) + offset, uv.getY(j) + offset * .37);
      g.translate(x, y + h / 2, z); indoorColor(g, DARK);
      g.rotateY(I.rot); g.translate(I.x, 0, I.z); ceilingBoards.push(g);
    };
    // 内陣と同じ丸い釘隠しを外周にも使う。形は一階につき一つだけ作る。
    const hallNail = hallPost ? new THREE.CylinderGeometry(.034, .034, .008, 12) : null;
    // 内陣だけにある木製礎盤を外周・入口の丸柱にもそろえる推定復元。
    // 内陣の上がり床と外陣の板床を柱の位置から読み、床下へ埋めない。
    // 形は階ごとに一つだけ用意し、既存の室内の結合形へ納める。
    const hallBase = hallPost ? new THREE.CylinderGeometry(1, 1, 1, 12) : null;
    const hallBaseAt = (t, face, sd, off) => {
      if (!hallBase) return;
      const px = face === 'z' ? t : sd * (off - .06);
      const pz = face === 'z' ? sd * (off - .06) : t;
      const room = lv.layout.rooms.find(r => px >= r.x0 && px <= r.x1 && pz >= r.z0 && pz <= r.z1);
      const floorY = y + (room?.y || 0);
      // 内陣側の外周柱も、礎盤の下段を下の板床まで下ろす。
      // 上がり床の高さから薄い円盤を置くと、床の外へ張り出す半分が浮く。
      // 上段の位置と半径は保ち、既存の壁の当たりの内側へ納める。
      const baseHeight = floorY - y + .025;
      for (const [radius, height, yy] of [[.095, baseHeight, y + baseHeight / 2], [.085, .04, floorY + .045]]) {
        const base = hallBase.clone();
        base.scale(radius, height, radius);
        put(base, px, yy, pz, 0x503923);
      }
    };
    const hallNailAt = (t, face, sd, off, yy) => {
      if (!hallNail) return;
      const cover = hallNail.clone();
      if (face === 'z') cover.rotateX(Math.PI / 2); else cover.rotateZ(Math.PI / 2);
      put(cover, face === 'z' ? t : sd * (off - .154), yy,
        face === 'z' ? sd * (off - .154) : t, 0x292723);
    };
    if (openRoof && S.quality === 'high') {
      // 小屋組の推定復元。柱頭を桁と妻梁でつなぎ、梁の端を細い長押だけで受けない。
      // 四隅は相欠きで組み、既存の梁の上端へ四センチ掛けて納める。
      // 共通の箱を設営時だけ使い、寄棟・切妻とも室内の結合形へまとめる。
      for (const side of [-1, 1]) {
        // 妻梁を桁の内面へ突き付けるだけにせず、柱頭の上で上下半分ずつ掛ける。
        // 桁の下半分を通し、上半分は妻梁の内面で止める。外寸と梁下の高さは保つ。
        timberBox(side * (hw - .16), y + h + .01, 0, .18, .1, lv.d - .14, DARK, 'z');
        timberBox(side * (hw - .16), y + h + .11, 0, .18, .1, lv.d - .5, DARK, 'z');
        timberBox(0, y + h + .06, side * (hd - .16), lv.w - .5, .2, .18, DARK, 'x');
        for (const end of [-1, 1])
          timberBox(end * (hw - .16), y + h + .1105, side * (hd - .16),
            .18, .099, .18, DARK, 'x');
      }
      // 柱頭と桁の接合は込み栓で留める推定復元。柱のほぞが掛かる高さへ納め、
      // 内側から見える二面に木口を出す。鉄の板や釘の列で代用しない。
      // 既存の木目・箱形へ結合し、梁下の通路や当たりは増やさない。
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        timberBox(sx * (hw - .252), y + h - .02, sz * (hd - .16),
          .004, .022, .022, WOOD, 'x');
        timberBox(sx * (hw - .29), y + h - .02, sz * (hd - .252),
          .022, .022, .004, WOOD, 'z');
      }
    }
    if (openRoof && I.roof?.kind === 'hip') {
      // 村の寄棟は外の屋根と寸法を共有する。切妻の妻壁や棟木を屋根から突き出さない。
      const { ex, ez, ridge, rise } = I.roof;
      const vertices = [-ex, 0, ez, ex, 0, ez, ridge, rise, 0, -ridge, rise, 0,
        ex, 0, -ez, -ex, 0, -ez, -ridge, rise, 0, ridge, rise, 0,
        ex, 0, ez, ex, 0, -ez, ridge, rise, 0,
        -ex, 0, -ez, -ex, 0, ez, -ridge, rise, 0];
      const lining = new THREE.BufferGeometry();
      lining.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
      lining.setIndex([0, 2, 1, 0, 3, 2, 4, 6, 5, 4, 7, 6, 8, 10, 9, 11, 13, 12]);
      lining.computeVertexNormals();
      if (S.quality === 'high') {
        // 村の茅裏を無地の板のように見せず、四面とも棟から軒へ茅束を流す。
        // 元の十四頂点・六三角形を使い、垂木と横木の上の面だけを置き換える。
        const uv = new Float32Array(14 * 2), pos = lining.attributes.position;
        const frontSlope = Math.hypot(ez, rise) / ez;
        const sideSlope = Math.hypot(ex - ridge, rise) / (ex - ridge);
        for (let j = 0; j < pos.count; j++) {
          const front = j < 8;
          uv[j * 2] = (front ? pos.getX(j) : pos.getZ(j)) / 2.6;
          uv[j * 2 + 1] = front ? Math.abs(pos.getZ(j)) * frontSlope / 2.2
            : (Math.abs(pos.getX(j)) - ridge) * sideSlope / 2.2;
        }
        lining.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
        lining.translate(0, y + h - .15, 0);
        const shaded = indoorColor(lining, 0xbba781);
        lining.dispose();
        shaded.rotateY(I.rot); shaded.translate(I.x, 0, I.z);
        thatchLinings.push(shaded);
      } else put(lining, 0, y + h - .15, 0, BOARD);
      const roofY = (x, z) => y + h + rise * Math.min(1 - Math.abs(z) / ez,
        (ex - Math.abs(x)) / (ex - ridge)) - .3;
      // 四周の小壁を茅の裏まで立ち上げ、軒下から空が透ける隙間をふさぐ。
      for (const face of ['x', 'z']) for (const side of [-1, 1]) {
        const half = face === 'z' ? hw : hd;
        const turn = face === 'z' ? ridge + (ex - ridge) * hd / ez
          : ez * (1 - (ex - hw) / (ex - ridge));
        const points = [-half, -turn, turn, half].filter(t => t >= -half && t <= half);
        const shape = new THREE.Shape();
        shape.moveTo(-half, 0); shape.lineTo(half, 0);
        for (let j = points.length - 1; j >= 0; j--) {
          const t = points[j];
          shape.lineTo(t, (face === 'z' ? roofY(t, hd) : roofY(hw, t)) + .15 - y - h);
        }
        shape.closePath();
        const wall = new THREE.ShapeGeometry(shape);
        // 村の寄棟の小壁も、下の荒壁へ続く藁すさ入りの土壁として補う。
        // 屋根際だけ無地の板にせず、同じ縮尺の塗り肌と炉の煤を通す。
        // 元の面を既存の壁の束へ移し、形の数と描画回数は増やさない。
        if (earthWalls) {
          const g = wall.toNonIndexed(); wall.dispose();
          const pos = g.attributes.position, uv = g.attributes.uv;
          for (let j = 0; j < pos.count; j++)
            uv.setXY(j, pos.getX(j) * .5, (pos.getY(j) + y + h) * .5);
          if (face === 'z') {
            if (side > 0) g.rotateY(Math.PI);
            g.translate(0, y + h, side * hd);
          } else {
            g.rotateY(-side * Math.PI / 2);
            g.translate(side * hw, y + h, 0);
          }
          const shaded = indoorColor(g, WALL);
          shaded.rotateY(I.rot); shaded.translate(I.x, 0, I.z);
          plasterWalls.push(shaded);
          continue;
        }
        // 両面を内へ向ける。横面は局所の横座標と奥行きの向きも揃える。
        if (face === 'z') {
          if (side > 0) wall.rotateY(Math.PI);
          put(wall, 0, y + h, side * hd, BOARD);
        } else {
          wall.rotateY(-side * Math.PI / 2);
          put(wall, side * hw, y + h, 0, BOARD);
        }
      }
      // 棟と母屋は寄棟の内側に納め、梁の上の束で支える。設営時にまとめる。
      for (const z of [-hd * .55, 0, hd * .55]) {
        const half = Math.min(hw - .12, ridge + (ex - ridge) * Math.abs(z) / ez);
        timberBox(0, roofY(half, z) - .09, z, half * 2, .18, .14, DARK, 'x');
      }
      // 高画質の梁は外周の柱と同じ割付にする。別の間隔で並べると柱頭から外れる。
      // 窓と戸口の上は既存のまぐさ・鴨居で受け、隅は桁と妻梁の柱芯にそろえる。
      // 奇数の柱間でも短い棟木を受けられるよう、中央の梁と束を補う推定復元。
      const bays = S.quality === 'high'
        ? Math.max(2, Math.round(lv.w / 1.9))
        : Math.max(2, Math.round((lv.w - .4) / 1.8));
      const beamXs = new Set();
      for (let q = 0; q <= bays; q++) beamXs.add(S.quality === 'high'
        ? q === 0 ? -hw + .16 : q === bays ? hw - .16 : -hw + q * lv.w / bays
        : -hw + .2 + q * (lv.w - .4) / bays);
      if (S.quality === 'high') beamXs.add(0);
      // 寄棟の小屋貫も束の脇で楔締めする推定復元。切妻と同じ納まりにする。
      // 一本の形を共有し、梁より上の既存の結合形へ納める。
      const hipWedge = S.quality === 'high' ? new THREE.BoxGeometry(.035, .035, .12) : null;
      if (hipWedge) {
        const pos = hipWedge.attributes.position;
        for (let j = 0; j < pos.count; j++)
          if (pos.getY(j) > 0) pos.setY(j, pos.getY(j) - (pos.getZ(j) + .06) * .2);
        hipWedge.computeVertexNormals();
      }
      const hipPosts = S.quality === 'high'
        ? [-1, 1].map(side => wallPostPositions(I, wins, 'z', side, lv.w)) : null;
      for (const x of beamXs) {
        timberBox(x, y + h - .12, 0, .18, .24, lv.d - .16, DARK, 'z');
        if (S.quality === 'high') {
          // 寄棟の民家も切妻の小屋と同じく、梁端のほぞを柱の上で込栓留めする推定復元。
          // 梁の両側へ一センチずつ木口を出し、梁下の通路には張り出させない。
          // 共有の木目と結合形へ設営時だけ納め、描く束と毎コマの処理は増やさない。
          for (const side of [-1, 1]) {
            if (!hipPosts[(side + 1) / 2].has(x)
              || k === 0 && side === ds && Math.abs(x - I.door.lx) < I.door.w / 2 + .2) continue;
            timberBox(x, y + h - .13, side * (hd - .105), .2, .035, .025, WOOD, 'x');
          }
        }
        // 棟木だけでなく左右の母屋も、同じ梁から束を立てて受ける。
        // 寄棟の隅より外へ束を置かず、上端を母屋の下面へ揃える。
        for (const z of [-hd * .55, 0, hd * .55]) {
          const half = Math.min(hw - .12, ridge + (ex - ridge) * Math.abs(z) / ez);
          if (Math.abs(x) + .07 > half) continue;
          const top = roofY(x, z) - .18, bottom = y + h;
          if (top > bottom) {
            timberBox(x, (top + bottom) / 2, z, .14, top - bottom, .14, DARK, 'y');
            if (S.quality === 'high' && top - bottom > .14) {
              // 村の寄棟も、切妻の小屋と同じく束脚のほぞを込栓で留める推定復元。
              // 梁に直交する向きへ通し、束の両面へ一センチずつ木口を見せる。
              // 短い束には打たず、既存の共有木目と結合形へ納める。
              timberBox(x, bottom + .07, z, .16, .025, .025, WOOD, 'x');
            }
          }
        }
        if (S.quality === 'high') {
          // 寄棟の束を小屋貫でつなぐ。隅木の外や、母屋を受ける束のない所へ延ばさない。
          const supports = [-hd * .55, 0, hd * .55].filter(z => {
            const half = Math.min(hw - .12, ridge + (ex - ridge) * Math.abs(z) / ez);
            return Math.abs(x) + .07 <= half && roofY(x, z) - .18 > y + h + .2;
          });
          if (supports.length > 1) {
            const first = supports[0], last = supports[supports.length - 1];
            const top = Math.min(...supports.map(z => roofY(x, z) - .18));
            const tieY = (y + h + top) / 2;
            timberBox(x, tieY, (first + last) / 2, .08, .1, last - first + .22, WOOD, 'z');
            for (const z of supports) for (const side of [-1, 1]) {
              // 貫の端にはみ出す側へは打たず、束のある所だけを締める。
              const wz = z + side * .13;
              if (wz - .06 < first - .11 || wz + .06 > last + .11) continue;
              const wedge = hipWedge.clone();
              if (side < 0) wedge.rotateY(Math.PI);
              put(wedge, x, tieY + .061, wz, WOOD);
            }
          }
        }
      }
      if (hipWedge) hipWedge.dispose();
      if (S.quality === 'high') {
        // 寄棟も棟に沿う小屋貫で束をつなぐ推定復元。実際に立つ束の間だけへ渡す。
        // 隅側の短い束にも収まる高さでそろえ、母屋・垂木と梁下の通路を空ける。
        const tie = new THREE.BoxGeometry(1, 1, 1);
        for (const z of [-hd * .55, 0, hd * .55]) {
          const half = Math.min(hw - .12, ridge + (ex - ridge) * Math.abs(z) / ez);
          const supports = [...beamXs].filter(x => Math.abs(x) + .07 <= half
            && roofY(x, z) - .18 > y + h + .2).sort((a, b) => a - b);
          if (supports.length < 2) continue;
          const top = Math.min(...supports.map(x => roofY(x, z) - .18));
          const tieY = (y + h + top) / 2;
          for (let q = 1; q < supports.length; q++) {
            const a = supports[q - 1], b = supports[q];
            if (b - a <= .08) continue;
            timberBox((a + b) / 2, tieY, z, b - a, .1, .08, WOOD, 'x');
          }
          // 寄棟の端の束も方杖で小屋貫へつなぐ推定復元。
          // 束の立つ両端だけに置き、屋根の内側・梁より上へ収める。
          // 小屋貫と同じ箱と結合先を使い、通路の当たりや毎コマの処理は増やさない。
          for (const side of [-1, 1]) {
            const index = side < 0 ? 0 : supports.length - 1;
            const end = supports[index], next = supports[index - side];
            const reach = Math.min(.4, Math.abs(next - end) * .3);
            const lower = tieY + .05, upper = top - .08, braceRise = upper - lower;
            if (reach <= .12 || braceRise <= .15) continue;
            const bx = end - side * reach / 2;
            ceilingBoard(bx, (lower + upper) / 2, z, .08, Math.hypot(braceRise, reach), .08,
              DARK, (bx + z) * .17, null, 'y', -side * Math.atan2(reach, braceRise));
          }
        }
        tie.dispose();
      }
      // 寄棟の四面を垂木と隅木で受ける推定復元。隅を越えて反対の屋根面へ突き出さない。
      // 一本の箱の形と向きを使い回し、近づいた時に一度だけ室内の形へまとめる。
      const timber = new THREE.BoxGeometry(1, 1, 1), axis = new THREE.Vector3(0, 1, 0);
      const direction = new THREE.Vector3(), turn = new THREE.Quaternion();
      const rafter = (ax, az, bx, bz, thick, lift = -.06) => {
        const ay = roofY(ax, az) + lift, by = roofY(bx, bz) + lift;
        direction.set(bx - ax, by - ay, bz - az);
        const length = direction.length();
        if (length < .1) return;
        turn.setFromUnitVectors(axis, direction.multiplyScalar(1 / length));
        const x = (ax + bx) / 2, z = (az + bz) / 2;
        if (S.quality === 'high') {
          // 寄棟の垂木・隅木・茅を受ける横木にも長手の木目を通す。
          // 材の座標で割り付けてから四面の勾配へ回し、梁と同じ共有材質へまとめる。
          ceilingBoard(x, (ay + by) / 2, z, thick, length, thick,
            WOOD, (x + z) * .17, null, 'y', 0, turn);
        } else {
          const g = timber.clone(); g.scale(thick, length, thick); g.applyQuaternion(turn);
          put(g, x, (ay + by) / 2, z, WOOD);
        }
      };
      for (let x = -hw + .2; x <= hw - .19; x += .6) {
        const start = Math.max(0, ez * (Math.abs(x) - ridge) / (ex - ridge));
        if (start >= hd - .12) continue;
        for (const side of [-1, 1]) rafter(x, side * start, x, side * (hd - .1), .08);
      }
      for (let z = -hd + .2; z <= hd - .19; z += .6) {
        const start = ridge + (ex - ridge) * Math.abs(z) / ez;
        if (start >= hw - .12) continue;
        for (const side of [-1, 1]) rafter(side * start, z, side * (hw - .1), z, .08);
      }
      const hipEnd = Math.min((hw - .1 - ridge) / (ex - ridge), (hd - .1) / ez);
      if (hipEnd > 0) for (const sx of [-1, 1]) for (const sz of [-1, 1])
        rafter(sx * ridge, 0, sx * (ridge + (ex - ridge) * hipEnd), sz * ez * hipEnd, .14);
      if (S.quality === 'high') {
        // 村の寄棟にも茅を結ぶ横木を渡す。垂木だけで茅裏を受ける形にしない。
        // 四面それぞれの隅木で止め、既存の箱・材質で室内の形へまとめる。
        // 茅下地の交点を縄で締める推定の納まり。各面の二列だけに絞り、
        // 同じ輪を室内へ結合する。屋根面・通路の当たりと毎コマの処理は増やさない。
        const binding = new THREE.TorusGeometry(.055, .007, 3, 8);
        // 横木の下面を垂木の上面へ接地させる。垂木の半厚から上面の鉛直差を求め、
        // 横木の半厚と、横木の幅の中で屋根が上がる分を足して食い込みも避ける。
        // 固定の持ち上げ量では交点に隙間が残るので、長辺側と妻側で勾配を読む。
        const lathLift = slope => -.06 + .04 * Math.hypot(1, slope) + .0225 * (1 + slope);
        const frontLathLift = lathLift(rise / ez);
        const sideLathLift = lathLift(rise / (ex - ridge));
        const bindAt = (x, z, side, front) => {
          const loop = binding.clone();
          loop.scale(1, 1.2, 1);
          loop.rotateY(front ? Math.PI / 2 : 0);
          if (front) loop.rotateX(side * Math.atan(rise / ez));
          else loop.rotateZ(-side * Math.atan(rise / (ex - ridge)));
          put(loop, x, roofY(x, z) + (-.06 + (front ? frontLathLift : sideLathLift)) / 2, z, 0x796443);
        };
        const boundRow = (q, rows) => q === Math.max(1, Math.round(rows / 3))
          || q === Math.max(1, Math.round(rows * 2 / 3));
        const frontRows = Math.max(1, Math.ceil(Math.hypot(hd - .1, (hd - .1) * rise / ez) / .45));
        for (let q = 1; q <= frontRows; q++) {
          const z = (hd - .1) * q / frontRows;
          const half = Math.min(hw - .1, ridge + (ex - ridge) * z / ez);
          for (const side of [-1, 1]) rafter(-half, side * z, half, side * z, .045, frontLathLift);
          if (boundRow(q, frontRows)) for (let n = 0, x = -hw + .2; x <= hw - .19; x += .6, n++) {
            // 隅木の外や横木の木口には巻かず、実際の垂木との交点だけを締める。
            if (n % 2 || Math.abs(x) + .08 >= half) continue;
            for (const side of [-1, 1]) bindAt(x, side * z, side, true);
          }
        }
        const sideRun = hw - .1 - ridge;
        if (sideRun > 0) {
          const sideRows = Math.max(1, Math.ceil(Math.hypot(sideRun, sideRun * rise / (ex - ridge)) / .45));
          for (let q = 1; q <= sideRows; q++) {
            const x = ridge + sideRun * q / sideRows;
            const half = Math.min(hd - .1, ez * (x - ridge) / (ex - ridge));
            for (const side of [-1, 1]) rafter(side * x, -half, side * x, half, .045, sideLathLift);
            if (boundRow(q, sideRows)) for (let n = 0, z = -hd + .2; z <= hd - .19; z += .6, n++) {
              if (n % 2 || Math.abs(z) + .08 >= half) continue;
              for (const side of [-1, 1]) bindAt(side * x, z, side, false);
            }
          }
        }
        binding.dispose();
      }
      timber.dispose();
    } else if (openRoof) {
      // 外の妻壁は表向きの一枚板。内側にも同じ勾配の板を張り、屋根裏から空が透けないようにする。
      // 外の屋根から勾配を受け取り、板葺きに茅葺きの棟高を当てはめない。
      const w = lv.w + .18, d = lv.d + .18;
      const ridge = I.roof?.rise ?? Math.max(w * .5, Math.max(w, d) * .42) + .5;
      const roofSlope = ridge / (I.roof?.run ?? w / 2 + .85);
      // 軒先まで勾配が続くので、妻の両端も壁の上から立ち上がる。
      // 三角だけでは棟が低く、軒寄りにも空の見える隙間が残る。
      const edgeH = ridge - hw * roofSlope;
      for (const sd of [-1, 1]) {
        const shape = new THREE.Shape();
        shape.moveTo(-hw, 0); shape.lineTo(hw, 0); shape.lineTo(hw, edgeH);
        shape.lineTo(0, ridge); shape.lineTo(-hw, edgeH); shape.closePath();
        const g = new THREE.ShapeGeometry(shape);
        if (sd > 0) g.rotateY(Math.PI);
        put(g, 0, y + h, sd * hd, BOARD);
      }
      if (S.quality === 'high') {
        // 屋根の裏に棟木・母屋・束と垂木を組む。寸法は復元の補い。
        // 近づいた時だけ共通の室内材へまとめ、毎コマの処理を増やさない。
        const roofY = lx => y + h + ridge - Math.abs(lx) * roofSlope - (I.roof?.inset ?? .3);
        // 母屋は屋根裏の基準面から十八センチ下まで。妻束も室内の束も
        // 同じ下面で受け、妻側だけ十六センチ材の中へ突き込まない。
        const purlinHeight = .18, purlinBottom = lx => roofY(lx) - purlinHeight;
        // 番小屋・板倉・南の小屋の妻板は一枚の大板にせず、縦板と継ぎ目の押縁で納める推定復元。
        // 押縁は妻板の上端まで通す。母屋用の下がりを引くと上端に三十センチほど継ぎ目が残る。
        // 幅の両端を妻板と同じ勾配で切り、野地板へ突き出さない。
        // 両妻で一本の箱を使い回し、室内を作る時だけ既存の結合形へ加える。
        if (['kura', 'bansho', 'nagaya'].includes(I.kind)) {
          const batten = new THREE.BoxGeometry(1, 1, 1);
          // 棟をまたぐ板は分け、上端を左右の屋根勾配で切る。
          // 元の妻壁は目地の奥に残し、縦木目の板を既存の壁材へ結合する。
          // 二つの妻で同じ箱を使い回し、描画回数と毎コマの処理は増やさない。
          const boards = Math.max(2, Math.round(lv.w / .48) * 2);
          for (const side of [-1, 1]) for (let q = 0; q < boards; q++) {
            const left = -hw + q * lv.w / boards + .001;
            const right = -hw + (q + 1) * lv.w / boards - .001;
            const board = batten.clone(); board.scale(right - left, 1, .006);
            const pos = board.attributes.position, uv = board.attributes.uv;
            for (let j = 0; j < pos.count; j++) {
              const lx = pos.getX(j) + (left + right) / 2;
              const yy = pos.getY(j) > 0 ? ridge - Math.abs(lx) * roofSlope : 0;
              pos.setXYZ(j, lx, yy, pos.getZ(j));
              uv.setXY(j, lx * 2 + q * .31, yy * .65 + q * .17);
            }
            board.computeVertexNormals();
            board.translate(0, y + h, side * (hd - .004));
            board.rotateY(I.rot); board.translate(I.x, 0, I.z);
            wallBoards.push(colorize(board, q % 3 ? BOARD : 0x725b40));
          }
          for (const side of [-1, 1]) for (let q = 1; q < boards; q++) {
            const lx = -hw + q * lv.w / boards;
            const strip = batten.clone(); strip.scale(.036, 1, .022);
            const pos = strip.attributes.position, uv = strip.attributes.uv;
            for (let j = 0; j < pos.count; j++) {
              const x = lx + pos.getX(j);
              const yy = pos.getY(j) > 0 ? ridge - Math.abs(x) * roofSlope - .02 : 0;
              pos.setXYZ(j, x, yy, pos.getZ(j));
              uv.setXY(j, x * 2 + q * .31, yy * .65 + q * .17);
            }
            strip.computeVertexNormals();
            strip.translate(0, y + h, side * (hd - .015));
            strip.rotateY(I.rot); strip.translate(I.x, 0, I.z);
            wallBoards.push(colorize(strip, WOOD));
          }
          batten.dispose();
        }
        // 妻の板壁にも束と貫を納める推定復元。側壁の桁より上を板だけの面にしない。
        // 屋根裏の束とは別に妻面で受け、上端を屋根の裏より下へ収める。
        // 束と貫も梁と同じ木目にそろえ、貫の仕口は楔で締める推定復元。
        // 楔は妻の両面で一つの形を共有し、屋根裏の結合形へ納める。
        const gableWedge = new THREE.BoxGeometry(.12, .035, .035);
        const gableNail = ['kura', 'bansho', 'nagaya'].includes(I.kind)
          ? new THREE.BoxGeometry(.014, .014, .004) : null;
        const wedgePos = gableWedge.attributes.position;
        for (let j = 0; j < wedgePos.count; j++)
          if (wedgePos.getY(j) > 0)
            wedgePos.setY(j, wedgePos.getY(j) - (wedgePos.getX(j) + .06) * .2);
        gableWedge.computeVertexNormals();
        for (const side of [-1, 1]) {
          const z = side * (hd - .07), bottom = y + h;
          for (const lx of [-hw * .55, 0, hw * .55]) {
            const top = purlinBottom(lx);
            if (top <= bottom) continue;
            timberBox(lx, (bottom + top) / 2, z, .12, top - bottom, .12, DARK, 'y');
          }
          // 梁間の貫は桁行の貫より十二センチ下へ通す。
          // 同じ束の中で二方向の材と楔が重ならない、用途からの推定の納まり。
          const tieY = (bottom + purlinBottom(hw * .55)) / 2 - .06;
          if (tieY > bottom + .07) {
            // 貫の両端と上端も勾配の内側へ収め、軒や野地板を突き抜けない。
            const half = Math.min(hw - .12, (roofY(0) - tieY - .05) / roofSlope);
            if (half > .1) {
              // 妻板の内面は hd - .007。貫の外面をそこへ合わせ、
              // 板倉・番小屋などの妻板と下地に五センチの空隙を残さない。
              // 束を貫く位置と楔もそろえ、屋根裏を作る時だけ納める。
              const tieZ = gableNail ? side * (hd - .042) : z - side * .025;
              timberBox(0, tieY, tieZ, half * 2, .1, .07, WOOD, 'x');
              if (gableNail) {
                // 内側から板を留める和釘。貫の端・束・押縁を避け、
                // 一つの形を既存の結合形へまとめる。開口や毎コマの処理は増やさない。
                const boards = Math.max(2, Math.round(lv.w / .48) * 2);
                for (let q = 0; q < boards; q++) {
                  const lx = -hw + (q + .5) * lv.w / boards;
                  if (Math.abs(lx) + .02 > half
                    || [-hw * .55, 0, hw * .55].some(x => Math.abs(lx - x) < .09)) continue;
                  put(gableNail.clone(), lx, tieY, tieZ - side * .037, 0x292723);
                }
              }
              for (const lx of [-hw * .55, 0, hw * .55]) for (const dir of [-1, 1]) {
                const wx = lx + dir * .13;
                // 貫の端と屋根勾配の内側だけへ打ち、細い妻の端には突き出さない。
                if (Math.abs(wx) + .06 > half
                  || roofY(Math.abs(wx) + .06) - .02 < tieY + .079) continue;
                const wedge = gableWedge.clone();
                if (dir < 0) wedge.rotateY(Math.PI);
                put(wedge, wx, tieY + .061, tieZ, WOOD);
              }
            }
          }
        }
        gableWedge.dispose();
        gableNail?.dispose();
        for (const lx of [-hw * .55, 0, hw * .55])
          timberBox(lx, roofY(lx) - purlinHeight / 2, 0, .14, purlinHeight, lv.d - .16, DARK, 'z');
        // 左右の側壁で共通する柱の上へ梁を渡す。窓脇の柱も使い、採光口は保つ。
        // 柱と梁で位置を共有し、束と母屋を受ける小屋組を宙に浮かせない。
        const roofWins = windowsFor(I, lv, k);
        const leftPosts = wallPostPositions(I, roofWins, 'x', -1, lv.d);
        const rightPosts = wallPostPositions(I, roofWins, 'x', 1, lv.d);
        const beamRows = [];
        // 民家・宿小屋も板倉・番小屋と同じく、束の両脇で小屋貫を楔締めする推定の納まり。
        // 一本の形を共有して屋根裏へ結合し、梁下の通路や毎コマの処理は増やさない。
        const roofWedge = ['kura', 'bansho', 'minka', 'nagaya'].includes(I.kind)
          ? new THREE.BoxGeometry(.12, .035, .035) : null;
        if (roofWedge) {
          const pos = roofWedge.attributes.position;
          for (let j = 0; j < pos.count; j++)
            if (pos.getY(j) > 0) pos.setY(j, pos.getY(j) - (pos.getX(j) + .06) * .2);
          roofWedge.computeVertexNormals();
        }
        for (const z of leftPosts) {
          // 妻側の隅柱は既存の妻梁で受ける。同じ所へ室内の梁と束を重ねない。
          if (Math.abs(z) > hd - .2 || !rightPosts.has(z)) continue;
          beamRows.push(z);
          timberBox(0, y + h - .12, z, lv.w - .16, .24, .18, DARK, 'x');
          if (['kura', 'bansho'].includes(I.kind)
            || S.quality === 'high' && ['minka', 'nagaya'].includes(I.kind)) {
            // 姉川の民家・宿小屋にも、板倉・番小屋と同じ梁端の込栓を納める推定復元。
            // 見せる小屋組の梁を柱へ差し、接合部の留め所までそろえる。
            // 柱と梁の重なる範囲を貫き、梁の両面へ一センチずつ木口を見せる。
            // 梁の高さ内へ納め、共通の木目と結合形を使って通路・更新処理は増やさない。
            for (const side of [-1, 1])
              timberBox(side * (hw - .105), y + h - .13, z,
                .025, .035, .2, WOOD, 'z');
          }
          // 棟木だけでなく左右の母屋も、梁の上に立てた束で受ける推定復元。
          // 母屋の下面と梁の上面を端にし、斜めの垂木へ束を突き抜けさせない。
          for (const lx of [-hw * .55, 0, hw * .55]) {
            const bottom = y + h, top = purlinBottom(lx);
            if (top > bottom) {
              timberBox(lx, (bottom + top) / 2, z, .14, top - bottom, .14, DARK, 'y');
              if (S.quality === 'high' && ['kura', 'bansho', 'minka', 'nagaya'].includes(I.kind) && top - bottom > .14) {
                // 民家・宿小屋も束脚を梁へ差す仕口として補う。束を載せただけにせず、
                // 込栓の両端を束の側面へ納める。母屋に近い短い束には打たない。
                // 梁端と同じ木材を使い、梁下の通路・建具・当たりは変えない。
                timberBox(lx, bottom + .07, z, .025, .025, .16, WOOD, 'z');
              }
              if (S.quality === 'high' && top - bottom > .2) {
                // 束頭も母屋へ枘差しする推定復元。束脚だけでなく上端にも込栓を納める。
                // 束の両面へ一センチずつ木口を出し、母屋・垂木の下で止める。
                // 既存の木材と結合形を共用し、梁下の通路と毎コマの処理は変えない。
                timberBox(lx, top - .055, z, .025, .025, .16, WOOD, 'z');
              }
            }
          }
          // 切妻の三本の束も小屋貫でつなぎ、一本ずつ立つだけの小屋組にしない。
          // 左右の短い束の内側の高さを使い、屋根面と梁下の通り道を空ける。
          const tieTop = purlinBottom(hw * .55);
          if (tieTop > y + h + .26) {
            const tieY = (y + h + tieTop) / 2 - .06;
            timberBox(0, tieY, z, hw * 1.1 + .22, .1, .08, WOOD, 'x');
            if (roofWedge) for (const lx of [-hw * .55, 0, hw * .55])
              for (const side of [-1, 1]) {
                // 外端の束も楔の先まで貫で受ける。端からはみ出す側には打たない。
                const wx = lx + side * .13;
                if (Math.abs(wx) + .06 > hw * .55 + .11) continue;
                const wedge = roofWedge.clone();
                if (side < 0) wedge.rotateY(Math.PI);
                put(wedge, wx, tieY + .061, z, WOOD);
              }
          }
        }
        // 桁行にも小屋貫を通し、妻面と各梁上の束をつなぐ推定復元。
        // 母屋の直下に束が独立して並ぶだけにせず、既存の束の高さの中へ納める。
        // 貫の継ぎは束の中心とし、共通の箱を室内へ結合する。梁下の通路は空ける。
        if (beamRows.length) {
          beamRows.push(-hd + .07, hd - .07);
          beamRows.sort((a, b) => a - b);
          for (const lx of [-hw * .55, 0, hw * .55]) {
            const bottom = y + h, top = roofY(lx) - .18;
            if (top <= bottom + .26) continue;
            // 梁間の貫と上下を分け、十センチ高の材の間へ二センチ空ける。
            // 妻束も室内の束も同じ高さを使い、楔・方杖はこの貫へ追従させる。
            const tieY = (bottom + top) / 2 + .06;
            for (let q = 1; q < beamRows.length; q++) {
              const a = beamRows[q - 1], b = beamRows[q];
              if (b - a <= .08) continue;
              // 桁行の小屋貫も梁・束と同じ木肌にそろえ、長手へ木目を通す。
              timberBox(lx, tieY, (a + b) / 2, .08, .1, b - a, WOOD, 'z');
              // 桁行の貫も束際で締める。梁間と同じ楔を向きだけ変えて使い、
              // 両端の束から貫の内側へ打つ。短い継ぎ間には重ねて置かない。
              if (roofWedge && b - a > .38) for (const side of [-1, 1]) {
                const wedge = roofWedge.clone(); wedge.rotateY(side * Math.PI / 2);
                put(wedge, lx, tieY + .061, side < 0 ? a + .13 : b - .13, WOOD);
              }
              if (lx === 0 && ['kura', 'bansho', 'minka', 'nagaya'].includes(I.kind)) {
                // 民家と南の小屋も、板倉・番小屋と同じく棟束を桁行の方杖で支える推定復元。
                // 束と横木だけの四角い枠にせず、梁より上で斜材を受ける。
                // 既存の箱と材質を使い回し、戸口・板間・梁下の通路には出さない。
                const lower = tieY + .05, upper = top - .08;
                const rise = upper - lower, reach = Math.min(.45, (b - a) * .3);
                if (rise > .15 && reach > .12) for (const side of [-1, 1]) {
                  const end = side < 0 ? a : b, dir = -side;
                  // 方杖にも束・貫と同じ木目を材の長手へ通す。
                  // 材の座標で割り付けてから桁行へ傾け、無地の角棒を残さない。
                  // 寄棟と同じ共有材へ結合し、寸法・通路・描く回数は保つ。
                  const braceZ = end + dir * reach / 2;
                  const turn = new THREE.Quaternion().setFromAxisAngle(
                    new THREE.Vector3(1, 0, 0), -dir * Math.atan2(reach, rise));
                  ceilingBoard(lx, (lower + upper) / 2, braceZ, .08, Math.hypot(rise, reach), .08,
                    DARK, (lx + braceZ) * .17, null, 'y', 0, turn);
                  if (['minka', 'nagaya'].includes(I.kind)) {
                    // 方杖の両端を束・貫へ留める木栓。斜材の端から少し内側に納め、
                    // 屋根材へ突き出さず、既存の木肌の結合形へ設営時だけ加える。
                    for (const t of [.12, .88])
                      timberBox(lx, lower + rise * t, end + dir * reach * (1 - t),
                        .1, .022, .022, WOOD, 'x');
                  }
                }
              }
            }
          }
        }
        if (roofWedge) roofWedge.dispose();
        // 梁と束は一間ごと、屋根板を受ける垂木は二尺ほどの間隔で並べる。
        // 左右一本ずつの形を使い回し、番小屋や板倉の屋根裏を組む。
        const run = hw - .1, rise = run * roofSlope, angle = Math.atan2(rise, run);
        // 板葺きは野地板、茅葺きは垂木に直交する横木で屋根を受ける推定復元。
        // 垂木の上端に納め、平天井で小屋組を隠さない。左右で一つの形を使い回す。
        const roofRun = hw + .02, roofLength = Math.hypot(roofRun, roofRun * roofSlope);
        const rafters = Math.max(2, Math.ceil((lv.d - .4) / .6));
        if (I.roof?.lining === 'boards') {
          const board = new THREE.BoxGeometry(roofLength, .025, lv.d + .04);
          for (const sd of [-1, 1]) {
            const g = board.clone(), pos = g.attributes.position;
            // 棟側の木口を鉛直に切り合わせる。直角のまま傾けると、
            // 左右の板厚が棟を越えて交差する。垂木上の高さと軒側の端は保つ。
            for (let j = 0; j < pos.count; j++) if (sd * pos.getX(j) < 0)
              pos.setX(j, pos.getX(j) - sd * pos.getY(j) * roofSlope);
            g.computeVertexNormals(); g.rotateZ(-sd * angle);
            put(g, sd * roofRun / 2, roofY(roofRun / 2) + .07, 0, BOARD);
          }
          board.dispose();
          // 野地板の裏を一枚の平板にせず、棟と平行な板の継ぎ目を入れる。
          // 母屋・垂木より上へ納め、共通の細い箱を設営時にだけ使い回す。
          const rows = Math.max(2, Math.round(roofLength / .24));
          const boarded = S.quality === 'high' && ['kura', 'bansho'].includes(I.kind);
          if (boarded) {
            // 板倉・番小屋の野地板は線だけの板割りにせず、板ごとの木肌を見せる推定復元。
            // 長手を棟へ向け、木口は垂木上で交互に継ぐ。目地の奥には既存の下地を残す。
            // 共通の箱と木目へ設営時だけ結合し、描く回数や毎コマの処理を増やさない。
            const edge = hd + .02, step = (lv.d - .4) / rafters;
            for (const sd of [-1, 1]) for (let row = 0; row < rows; row++) {
              const lx = sd * roofRun * (row + .5) / rows;
              let start = -edge, seam = row % 2 ? 1 : 3;
              while (start < edge - .002) {
                const end = seam < rafters ? -hd + .2 + seam * step : edge;
                ceilingBoard(lx, roofY(lx) + .07 - .014 / Math.cos(angle), (start + end) / 2,
                  roofLength / rows - .002, .002, end - start - .002,
                  (row + seam + (sd > 0 ? 1 : 0)) % 3 ? 0x80684c : 0x7a6448,
                  row * .31 + seam * .17 + sd * .23, null, 'z', -sd * angle);
                start = end; seam += 4;
              }
            }
          } else {
            const joint = new THREE.BoxGeometry(.008, .003, lv.d + .04);
            for (const sd of [-1, 1]) for (let q = 1; q < rows; q++) {
              const lx = sd * roofRun * q / rows, g = joint.clone();
              g.rotateZ(-sd * angle);
              put(g, lx, roofY(lx) + .07 - .014 / Math.cos(angle), 0, DARK);
            }
            joint.dispose();
            // 板倉・番小屋の野地板は、木口も垂木の上で継ぐ推定復元。
            // 隣の板は継ぐ垂木をずらし、棟方向に一枚の長い板や一直線の割れ目にしない。
            // 垂木と同じ割付を使い、薄い目地の共通形を既存の室内へ結合する。
            if (['kura', 'bansho'].includes(I.kind)) {
              const endJoint = new THREE.BoxGeometry(roofLength / rows - .008, .003, .008);
              for (const sd of [-1, 1]) {
                const seam = endJoint.clone(); seam.rotateZ(-sd * angle);
                for (let row = 0; row < rows; row++) {
                  const lx = sd * roofRun * (row + .5) / rows;
                  for (let q = row % 2 ? 1 : 3; q < rafters; q += 4) {
                    const z = -hd + .2 + q * (lv.d - .4) / rafters;
                    put(seam.clone(), lx, roofY(lx) + .07 - .014 / Math.cos(angle), z, DARK);
                  }
                }
                seam.dispose();
              }
              endJoint.dispose();
            }
          }
        } else {
          const batten = new THREE.BoxGeometry(.065, .045, lv.d + .04);
          const rows = Math.max(2, Math.ceil(roofLength / .35));
          // 棟の横木を左右の屋根勾配で二重に置くと、木同士が交差して同じ面がちらつく。
          // 高画質では棟に一本を水平に納め、左右の茅下地は次の段から組む。
          if (S.quality === 'high')
            ceilingBoard(0, roofY(0) + .07, 0, .065, .045, lv.d + .04,
              WOOD, 0, null, 'z');
          for (const sd of [-1, 1]) for (let q = S.quality === 'high' ? 1 : 0; q <= rows; q++) {
            const lx = sd * q * roofRun / rows;
            // 茅を受ける横木も垂木と同じ木肌へそろえ、長手を棟方向へ通す。
            // 共通の箱と室内の材質へ結合し、茅裏に無地の角棒を残さない。
            if (S.quality === 'high')
              ceilingBoard(lx, roofY(lx) + .07, 0, .065, .045, lv.d + .04,
                WOOD, q * .31 + sd * .17, null, 'z', -sd * angle);
            else {
              const g = batten.clone(); g.rotateZ(-sd * angle);
              put(g, lx, roofY(lx) + .07, 0, WOOD);
            }
          }
          batten.dispose();
          if (S.quality === 'high') {
            // 茅下地の横木を垂木へ縄で留める推定の納まり。
            // 前後二本の垂木と左右二段だけに絞り、同じ縄の形を八か所で使い回す。
            // 斜めの輪で上の横木と下の垂木を一緒に抱き、木の中を縄が貫かないようにする。
            const binding = new THREE.TorusGeometry(.105, .006, 4, 12);
            binding.scale(1, .0775 / .105, 1);
            binding.rotateY(-Math.PI / 4); binding.translate(0, .02, 0);
            const rowIds = [Math.max(1, Math.round(rows / 3)), Math.min(rows - 1, Math.round(rows * 2 / 3))];
            const rafterIds = [1, rafters - 1];
            for (const sd of [-1, 1]) for (const row of new Set(rowIds)) {
              const lx = sd * row * roofRun / rows;
              for (const q of new Set(rafterIds)) {
                const z = -hd + .2 + q * (lv.d - .4) / rafters;
                const g = binding.clone(); g.rotateZ(-sd * angle);
                put(g, lx, roofY(lx), z, 0x8b7955);
              }
            }
            binding.dispose();
          }
        }
        for (const sd of [-1, 1]) {
          const timber = new THREE.BoxGeometry(Math.hypot(run, rise), .1, .08);
          timber.rotateZ(-sd * angle);
          for (let q = 0; q <= rafters; q++) {
            const z = -hd + .2 + q * (lv.d - .4) / rafters;
            if (S.quality === 'high')
              ceilingBoard(sd * run / 2, roofY(run / 2), z, Math.hypot(run, rise), .1, .08,
                WOOD, (z + sd * run / 2) * .17, null, 'x', -sd * angle, null, boardWalls ? sd : 0);
            else put(timber.clone(), sd * run / 2, roofY(run / 2), z, WOOD);
          }
          timber.dispose();
        }
      }
    }
    if (!I.open && !openRoof) for (const [x0, x1, z0, z1] of rectMinus(hw, hd, upSt ? upSt.hole : null)) box((x0 + x1) / 2, y + h + 0.03, (z0 + z1) / 2, x1 - x0, 0.06, z1 - z0, goten ? 0x7a6448 : DARK);
    // 天井の作り：御殿は竿縁天井（一尺五寸ごとの細い竿縁と回縁）、櫓・天守は上の床を支える根太を見せる
    if (!I.open && !openRoof && (smallHall || I.profile === 'anegawa' && I.kind === 'yashiki')) {
      // 小堂は内陣だけ格天井、主屋の座敷と取次は竿縁。各室の回縁で竿縁の端を受ける。
      for (const r of lv.layout.rooms) {
        const coffered = smallHall && r.name === '内陣';
        // 主屋の板敷き入口は座敷の竿縁を続けず、板天井を太い横木で受ける用途からの補い。
        // 室ごとの範囲で納め、障子の鴨居・通れる高さと座敷の天井は保つ。
        const entryBeams = I.kind === 'yashiki' && r.floor === 'boards' && S.quality === 'high';
        // 外周は内壁の位置、室境は厚さ六センチの小壁の面へ回縁を寄せる。
        // 一律十センチ空けると、間仕切りの上だけ三センチの黒い帯が残る。
        const fitted = S.quality === 'high', inset = fitted ? .07 : .1;
        const x0 = r.x0 + (Math.abs(r.x0 + hw) < .001 ? .1 : inset);
        const x1 = r.x1 - (Math.abs(r.x1 - hw) < .001 ? .1 : inset);
        const z0 = r.z0 + (Math.abs(r.z0 + hd) < .001 ? .1 : inset);
        const z1 = r.z1 - (Math.abs(r.z1 - hd) < .001 ? .1 : inset);
        const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
        const w = x1 - x0, d = z1 - z0;
        // 入口は短辺へ梁を掛ける。板の継ぎも同じ梁の位置で受ける。
        const entryBays = entryBeams ? Math.max(2, Math.ceil(w / 1.8)) : 0;
        // 姉川の天井材も無地の角棒にせず、鏡板と同じ共有木目で仕上げる。
        // 断面・高さと部品数は保ち、近づいた時の結合形へ一度だけ納める。
        const ceilingTimber = (x, yy, z, ww, hh, dd, hex) =>
          ceilingBoard(x, yy, z, ww, hh, dd, hex, (x + z) * .17, null, ww >= dd ? 'x' : 'z');
        // 回縁の内側で板を割り、竿縁に直交する継ぎ目と格間の鏡板を見せる。
        // 最後だけ細い格間にせず、各室の幅・奥行きに均等に納める。
        // 主屋の床の間は奥壁側。竿縁を床の間と平行に通し、床の間へ突き当てない。
        // 板の長手は竿縁と直交させ、回縁まで同じ向きで納める。
        const nx = Math.max(1, Math.round(w / (coffered ? .75 : .3)));
        const nz = Math.max(1, Math.round(d / (coffered ? .75 : entryBeams ? .9 : .45)));
        if (coffered) {
          for (let ix = 0; ix < nx; ix++) for (let iz = 0; iz < nz; iz++) {
            const px = x0 + (ix + .5) * w / nx, pz = z0 + (iz + .5) * d / nz;
            const pw = w / nx, pd = d / nz;
            if (S.quality === 'high') {
              // 鏡板は格間ごとの一枚色にせず、幅一尺ほどの板を並べる推定復元。
              // 四周の細縁に掛け、板の長手と木目を奥行きへそろえる。
              // 二ミリの目地の奥には既存の天井下地を残し、屋根裏を透かさない。
              // 鏡板の厚みと木口にも材の向きで木目を割り付ける。
              // 水平面だけの投影では、板継ぎに見える側面の絵が一本線につぶれる。
              // 格間の芯から一律七・五ミリだけ退けると、鏡板が幅五センチの
              // 格縁と幅八センチの回縁を貫いていた。各材の内面から一ミリ逃がし、
              // 板の下面は細縁の上端へ載せる。外端の格間も同じ納まりにする。
              const mirrorX0 = px - pw / 2 + (ix === 0 ? .041 : .026);
              const mirrorX1 = px + pw / 2 - (ix === nx - 1 ? .041 : .026);
              const mirrorZ0 = pz - pd / 2 + (iz === 0 ? .041 : .026);
              const mirrorZ1 = pz + pd / 2 - (iz === nz - 1 ? .041 : .026);
              const mirrorW = mirrorX1 - mirrorX0, mirrorD = mirrorZ1 - mirrorZ0;
              const boards = Math.max(1, Math.ceil(mirrorW / .3));
              const pitch = mirrorW / boards;
              for (let q = 0; q < boards; q++) {
                const left = mirrorX0 + q * pitch + (q ? .001 : 0);
                const right = mirrorX0 + (q + 1) * pitch - (q < boards - 1 ? .001 : 0);
                ceilingBoard((left + right) / 2, y + h - .004, (mirrorZ0 + mirrorZ1) / 2,
                  right - left, .018, mirrorD, (q + ix + iz) % 3 ? 0x80684c : 0x7a6448,
                  ix * .31 + iz * .17 + q * .23, null, 'z');
              }
            } else ceilingBoard(px, y + h - .004, pz, pw - .015, .018, pd - .015, 0x80684c, ix * .31 + iz * .17);
            if (S.quality === 'high') {
              // 小堂の鏡板を格縁の内側の細縁で受ける推定の納まり。
              // 格縁の下面より上へ収め、板が格間に浮いて見えるのを防ぐ。
              // 外周の回縁は格縁より太い。端の格間だけ内面へ合わせ、
              // 細縁を回縁へ十五ミリめり込ませず、木口を突き付けて納める。
              const left = px - pw / 2 + (ix === 0 ? .04 : .025);
              const right = px + pw / 2 - (ix === nx - 1 ? .04 : .025);
              const back = pz - pd / 2 + (iz === 0 ? .04 : .025);
              const front = pz + pd / 2 - (iz === nz - 1 ? .04 : .025);
              for (const side of [-1, 1]) {
                ceilingTimber((left + right) / 2, y + h - .025,
                  side < 0 ? back + .011 : front - .011, right - left, .024, .022, WOOD);
                ceilingTimber(side < 0 ? left + .011 : right - .011, y + h - .025,
                  (back + front) / 2, .022, .024, front - back - .044, WOOD);
              }
            }
          }
        } else if (entryBeams) {
          // 十三メートル近い間口を細い一本梁で渡さず、外壁と障子の間へ短い梁を並べる。
          // 板は梁に直交させ、隣の列で継ぎをずらす。目地の奥には既存の下地を残す。
          const rows = Math.max(1, Math.round(d / .3));
          for (let iz = 0; iz < rows; iz++) for (let start = 0; start < entryBays;) {
            const end = Math.min(entryBays, start + (start === 0 && iz % 2 ? 1 : 2));
            const a = x0 + start * w / entryBays + (start ? .001 : 0);
            const b = x0 + end * w / entryBays - (end < entryBays ? .001 : 0);
            const back = z0 + iz * d / rows + (iz ? .001 : 0);
            const front = z0 + (iz + 1) * d / rows - (iz < rows - 1 ? .001 : 0);
            ceilingBoard((a + b) / 2, y + h - .004, (back + front) / 2,
              b - a, .018, front - back, (iz + start) % 3 ? 0x80684c : 0x7a6448,
              iz * .31 + start * .17, null, 'x');
            start = end;
          }
        } else for (let ix = 0; ix < nx; ix++) {
          // 長い一枚板にせず、竿縁の上で板を継ぐ推定復元。
          // 隣の列では二間隔ずらし、木口の継ぎ目を一直線に並べない。
          // 設営時だけ既存の箱へまとめ、毎コマの処理は増やさない。
          const span = S.quality === 'high' ? 4 : nz;
          // 主屋と小堂の竿縁天井は鏡板・床板と同じ二ミリの目地に納める。
          // 六ミリの黒い隙間を板の四周へ回さず、木口は竿縁の上でだけ継ぐ。
          // 外端は回縁へ差し掛け、板数・共有材質・結合先はそのまま使う。
          const joint = fitted ? .002 : .006;
          for (let start = 0; start < nz;) {
            const end = Math.min(nz, start + (start === 0 && ix % 2 ? Math.min(2, span) : span));
            const boardX0 = x0 + ix * w / nx + (fitted && ix === 0 ? 0 : joint / 2);
            const boardX1 = x0 + (ix + 1) * w / nx - (fitted && ix === nx - 1 ? 0 : joint / 2);
            const boardZ0 = z0 + start * d / nz + (fitted && start === 0 ? 0 : joint / 2);
            const boardZ1 = z0 + end * d / nz - (fitted && end === nz ? 0 : joint / 2);
            ceilingBoard((boardX0 + boardX1) / 2, y + h - .004, (boardZ0 + boardZ1) / 2,
              boardX1 - boardX0, .018, boardZ1 - boardZ0, (ix + start) % 3 ? 0x80684c : 0x7a6448,
              ix * .31 + start * .17, null, 'z');
            start = end;
          }
        }
        if (coffered && fitted) {
          // 格縁の交点は相欠きにする推定復元。横材の上半分を欠き、縦材を掛ける。
          // 四周も回縁の内面で止め、木目の違う面が重なるちらつきを防ぐ。
          // 設営時にだけ分割し、既存の木目・材質と室内の結合形を共用する。
          for (let iz = 1; iz < nz; iz++) {
            // 小堂の長い格縁も一本材にせず、主屋と同じ相欠きの継ぎ目を入れる。
            // 隣の列では継ぐ側を返し、合わせ面は一ミリ離す。外寸と下面高は保つ。
            const z = z0 + iz * d / nz, start = x0 + .04, end = x1 - .04;
            const count = Math.max(1, Math.ceil((end - start) / 3.4)), lap = .06;
            const member = (a, b, yy, hh) => {
              const bottom = yy - hh / 2, top = yy + hh / 2;
              const put = (left, right, upper = top) => {
                if (right > left && upper > bottom)
                  ceilingTimber((left + right) / 2, (bottom + upper) / 2, z,
                    right - left, upper - bottom, .05, DARK);
              };
              let cursor = a;
              for (let ix = 1; ix < nx && cursor < b; ix++) {
                const x = x0 + ix * w / nx;
                const left = Math.max(a, x - .025), right = Math.min(b, x + .025);
                if (right <= left) continue;
                put(cursor, left);
                put(left, right, Math.min(top, y + h - .0255));
                cursor = right;
              }
              put(cursor, b);
            };
            for (let q = 0; q < count; q++) {
              const a = start + q * (end - start) / count;
              const b = start + (q + 1) * (end - start) / count;
              member(a + (q ? lap : 0), b - (q < count - 1 ? lap : 0), y + h - .025, .05);
              if (!q) continue;
              const side = iz % 2 ? 1 : -1;
              member(a - lap, a + lap - .001, y + h - .025 + side * .01275, .0245);
              member(a - lap + .001, a + lap, y + h - .025 - side * .01275, .0245);
              // 格縁の長手の継ぎも、交点だけでなく木栓で留める推定復元。
              // 相欠きの範囲内に二本を通し、既存の木目と結合形を使う。
              for (const offset of [-.03, .03])
                ceilingTimber(a + offset, y + h - .025, z, .012, .052, .012, WOOD);
            }
          }
          for (let ix = 1; ix < nx; ix++) for (let iz = 0; iz < nz; iz++) {
            const start = z0 + iz * d / nz + (iz === 0 ? .04 : .025);
            const end = z0 + (iz + 1) * d / nz - (iz === nz - 1 ? .04 : .025);
            if (end > start)
              ceilingTimber(x0 + ix * w / nx, y + h - .025, (start + end) / 2,
                .05, .05, end - start, DARK);
          }
          // 縦材の上半分を交点へ渡す。合わせ面は一ミリ離し、元の外寸を保つ。
          for (let ix = 1; ix < nx; ix++) for (let iz = 1; iz < nz; iz++) {
            const x = x0 + ix * w / nx, z = z0 + iz * d / nz;
            ceilingBoard(x, y + h - .01225, z, .05, .0245, .05, DARK,
              (x + z) * .17, null, 'z');
          }
          // 内陣の格縁の交点は木栓で留める推定の納まり。
          // 下面へ伏せ、格間や通路へ金具を吊り下げない。共通の箱へ結合する。
          for (let ix = 1; ix < nx; ix++) for (let iz = 1; iz < nz; iz++)
            ceilingTimber(x0 + ix * w / nx, y + h - .05, z0 + iz * d / nz,
              .012, .002, .012, WOOD);
        } else {
          if (coffered) for (let ix = 1; ix < nx; ix++)
            ceilingTimber(x0 + ix * w / nx, y + h - .025, cz, .05, .05, d, DARK);
          // 高画質の竿縁も回縁の内面で止める。両端四センチを欠き、
          // 格天井と同じ納まりで横木同士のめり込みをなくす。
          if (entryBeams) {
            // 梁の木口は前後の回縁で止め、障子の溝と通れる高さを保つ。
            // 既存の天井板・木目・結合形を使い、描画回数や毎コマの処理は増やさない。
            for (let ix = 1; ix < entryBays; ix++) {
              const x = x0 + ix * w / entryBays;
              ceilingTimber(x, y + h - .09, cz, .12, .16, d - .08, DARK);
              // 入口の梁を細い回縁だけで受けず、両端の壁際へ持送りを添える推定復元。
              // 上段は梁の下面、下段は壁面へ納め、障子と戸口の内法より上に収める。
              // 天井の共有木目・結合先を使い、設営時だけ作る。
              for (const side of [-1, 1]) {
                const end = side < 0 ? z0 + .04 : z1 - .04;
                ceilingTimber(x, y + h - .19, end - side * .06,
                  .16, .04, .12, DARK);
                ceilingTimber(x, y + h - .23, end - side * .03,
                  .16, .04, .06, DARK);
                // 持送りの上端を左右に残し、梁端を四センチの欠き込みへ納める推定復元。
                // 梁の側面で止めた二枚の頬を共通の箱へ結合し、同じ面を重ねない。
                // 梁下の高さと通路を保ち、木栓で左右の頬と梁をつなぐ。
                for (const sx of [-1, 1])
                  ceilingTimber(x + sx * .07, y + h - .15, end - side * .06,
                    .02, .04, .12, DARK);
                ceilingBoard(x, y + h - .15, end - side * .06,
                  .18, .014, .014, WOOD, x * .17, null, 'x');
              }
            }
          } else for (let iz = 1; iz < nz; iz++) {
            const z = z0 + iz * d / nz;
            if (fitted && !coffered && (smallHall || I.kind === 'yashiki') && w > 3.6) {
              // 長い竿縁を一本材にせず、上下を欠いた相欠きで継ぐ推定復元。
              // 小堂の外陣も主屋と同じ納まりにし、五メートルを超す無継手の竿縁を残さない。
              // 隣の竿縁は継ぎ位置を半間隔ずらし、継ぎ目が一筋に並ばないようにする。
              // 回縁の内面・下面高は保ち、共有木目と既存の結合形へ設営時だけ納める。
              const left = x0 + .04, right = x1 - .04;
              // 継ぎ目を四分の一間隔ずらすと、端の材は一・二五倍まで長くなる。
              // 相欠きの半長六センチも含め、一材が三・六メートルを超えない数に割る。
              const spans = Math.ceil((right - left) * 1.25 / (3.6 - .06)), pitch = (right - left) / spans;
              const ends = [left];
              for (let q = 1; q < spans; q++) ends.push(left + (q + (iz % 2 ? .25 : -.25)) * pitch);
              ends.push(right);
              for (let q = 0; q < ends.length - 1; q++) {
                const a = ends[q], b = ends[q + 1];
                const start = a + (q ? .06 : 0), end = b - (q < ends.length - 2 ? .06 : 0);
                ceilingTimber((start + end) / 2, y + h - .025, z, end - start, .05, .035, DARK);
                // 継ぎの上下材は一ミリ離し、重なる面のちらつきと黒い切れ目を避ける。
                if (q) ceilingTimber(a, y + h - .03775, z, .12, .0245, .035, DARK);
                if (q < ends.length - 2) ceilingTimber(b, y + h - .01225, z, .12, .0245, .035, DARK);
                // 細い竿縁の継ぎにも留め所を補う推定復元。相欠きを上下に
                // 貫く小さな木栓を二本だけ納め、下面に大きな金具を足さない。
                if (q) for (const offset of [-.03, .03])
                  ceilingTimber(a + offset, y + h - .025, z, .008, .052, .008, WOOD);
              }
            } else ceilingTimber(cx, y + h - .025, z, fitted ? w - .08 : w, .05, coffered ? .05 : .035, DARK);
          }
        }
        if (fitted && !entryBeams) {
          // 姉川の格縁・竿縁は回縁へ枘差しする推定の納まり。
          // 木口を突き合わせるだけにせず、細い枘を二センチ差し込み、
          // 回縁の下面から込栓で留める。天井板と回縁の上面には出さない。
          // 既存の木目・箱と結合先を使い、設営時だけ組む。
          const endJoint = (alongZ, fixed, end, side) => {
            const x = alongZ ? fixed : end, z = alongZ ? end : fixed;
            ceilingBoard(x, y + h - .04, z, alongZ ? .024 : .04, .018,
              alongZ ? .04 : .024, DARK, (x + z) * .17, null, alongZ ? 'z' : 'x');
            const pinX = x + (alongZ ? 0 : side * .01);
            const pinZ = z + (alongZ ? side * .01 : 0);
            ceilingTimber(pinX, y + h - .0615, pinZ, .008, .059, .008, WOOD);
          };
          for (let iz = 1; iz < nz; iz++) {
            const z = z0 + iz * d / nz;
            endJoint(false, z, x0 + .04, -1);
            endJoint(false, z, x1 - .04, 1);
          }
          if (coffered) for (let ix = 1; ix < nx; ix++) {
            const x = x0 + ix * w / nx;
            endJoint(true, x, z0 + .04, -1);
            endJoint(true, x, z1 - .04, 1);
          }
        }
        // 隅は片方の回縁の木口をもう片方の側面へ納める。
        // 同じ高さの角材を交差させず、重なった面のちらつきを防ぐ。
        const ceilingTrim = (alongZ, fixed, start, end) => {
          const length = end - start, yy = y + h - .05;
          const member = (a, b, centerY, height) => {
            if (b <= a) return;
            const center = (a + b) / 2;
            ceilingTimber(alongZ ? fixed : center, centerY, alongZ ? center : fixed,
              alongZ ? .08 : b - a, height, alongZ ? b - a : .08, DARK);
          };
          if (!fitted || !(smallHall || I.kind === 'yashiki') || length <= 3.6) {
            member(start, end, yy, .08); return;
          }
          // 主屋と小堂の長い回縁も一本材にせず、竿縁と同じ相欠きで継ぐ推定復元。
          // 一材を三・六メートル以内に納め、上下の合わせ面は一ミリ離す。
          // 隅の納まりと天井高を保ち、既存の木目・結合形へ設営時だけまとめる。
          const count = Math.ceil(length / 3.4), pitch = length / count, lap = .06;
          for (let q = 0; q < count; q++) {
            const a = start + q * pitch, b = start + (q + 1) * pitch;
            member(a + (q ? lap : 0), b - (q < count - 1 ? lap : 0), yy, .08);
            if (q) {
              member(a - lap, a + lap - .001, yy - .02025, .0395);
              member(a - lap + .001, a + lap, yy + .02025, .0395);
              // 長い回縁の相欠きを木栓で留める推定復元。下面へ頭を伏せ、
              // 二材を上下に貫く。隅・天井高と既存のまとめ描きは保つ。
              for (const offset of [-.03, .03]) {
                const t = a + offset;
                ceilingTimber(alongZ ? fixed : t, yy, alongZ ? t : fixed,
                  .012, .082, .012, WOOD);
              }
            }
          }
        };
        for (const z of [z0, z1]) ceilingTrim(false, z, cx - (fitted ? w - .08 : w) / 2, cx + (fitted ? w - .08 : w) / 2);
        for (const x of [x0, x1]) ceilingTrim(true, x, cz - (fitted ? d + .08 : d) / 2, cz + (fitted ? d + .08 : d) / 2);
      }
    } else if (!I.open && !openRoof && boardWalls && S.quality === 'high' && !upSt) {
      // 姉川の板倉・番小屋は、無地の天井と細い横木の重なりを板張りへ替える。
      // 下で組む見せ梁の芯に木口の継ぎを合わせ、隣の列では一間隔ずらす推定復元。
      // 梁の上端へ板の下面を載せ、既存の下地を目地の奥へ残す。
      // 共通の木目と結合形を使い、開閉や毎コマの処理は増やさない。
      const supports = [-hw + .1];
      for (const x of boardBeamXs) {
        if (upSt && x > upSt.hole.x0 - .15 && x < upSt.hole.x1 + .15) continue;
        supports.push(x);
      }
      supports.push(hw - .1);
      const back = -hd + .1, front = hd - .1;
      const rows = Math.max(1, Math.ceil((front - back) / .3));
      for (let iz = 0; iz < rows; iz++) {
        const z0 = back + iz * (front - back) / rows + (iz ? .001 : 0);
        const z1 = back + (iz + 1) * (front - back) / rows - (iz < rows - 1 ? .001 : 0);
        for (let start = 0; start < supports.length - 1;) {
          const end = Math.min(supports.length - 1, start + (start === 0 && iz % 2 ? 1 : 2));
          const x0 = supports[start] + (start ? .001 : 0);
          const x1 = supports[end] - (end < supports.length - 1 ? .001 : 0);
          ceilingBoard((x0 + x1) / 2, y + h - .001, (z0 + z1) / 2,
            x1 - x0, .018, z1 - z0, (iz + start) % 3 ? 0x80684c : 0x7a6448,
            iz * .31 + start * .17, null, 'x');
          start = end;
        }
      }
    }
    for (const st of lv.firingSteps) box(st.x, st.y - .05, st.z, st.w, .1, st.d, DARK);
    if (I.profile === 'anegawa' && S.quality === 'high') {
      // 民家・板倉・番小屋も、主屋・小堂と同じく板間の端を雑巾摺で納める。
      // 正面も壁のある所へ付け、土間・畳・戸口と建具の溝へは渡さない。
      // 柱の木口へ突き当て、柱の中を一本の横木が貫かないようにする。
      for (const r of lv.layout.rooms) {
        if (r.floor !== 'boards') continue;
        const floorY = y + (r.y || 0) + .022;
        const trim = (face, side, start, end) => {
          if (end <= start) return;
          let spans = [[start, end]];
          if (k === 0 && face === 'z' && side === ds) {
            // 戸口の左右は竪枠の外面で止める。外戸を開けても横木が入口を横切らない。
            // 戸幅と入口位置をそのまま読み、逆向き・片寄せの入口にも合わせる。
            const left = I.door.lx - I.door.w / 2 - .162;
            const right = I.door.lx + I.door.w / 2 + .162;
            spans = spans.flatMap(([a, b]) => right <= a || left >= b
              ? [[a, b]] : [[a, Math.max(a, left)], [Math.min(b, right), b]]);
          }
          for (const t of wallPostPositions(I, wins, face, side, face === 'x' ? lv.d : lv.w)) {
            spans = spans.flatMap(([a, b]) => t + .082 <= a || t - .082 >= b
              ? [[a, b]] : [[a, Math.max(a, t - .082)], [Math.min(b, t + .082), b]]);
          }
          for (const [a, b] of spans) if (b - a > .01) {
            if (face === 'x') timberBox(side * (hw - .145), floorY, (a + b) / 2,
              .03, .04, b - a, 0x604831, 'z');
            else timberBox((a + b) / 2, floorY, side * (hd - .145),
              b - a, .04, .03, 0x604831, 'x');
          }
        };
        for (const side of [-1, 1]) {
          if (Math.abs((side < 0 ? r.x0 : r.x1) - side * hw) < .001)
            trim('x', side, r.z0 + .24, r.z1 - .24);
          if (Math.abs((side < 0 ? r.z0 : r.z1) - side * hd) < .001)
            trim('z', side, r.x0 + .24, r.x1 - .24);
        }
      }
    }
    ;
    // 梁（天井の下の横木。階段の口の上は通さない）と、桁（長い向きの太い横木）
    // 御殿・堂は梁を天井の上に隠す（書院造）。櫓・天守と、天井を張らない建物だけ梁と桁を見せる
    // 小屋組を作った部屋では、平天井用の梁を重ねない。
    const showBeams = !openRoof && (!goten || I.open || plainCeiling);
    const inabaBeamFrame = false, beamBays = Math.max(2, Math.round(lv.w / 1.9)), beamStep = lv.w / beamBays;
    const fittedBeams = boardWalls && S.quality === 'high' && showBeams;
    if (fittedBeams) {
      // 板倉と番小屋の見せる梁は、横材の交点を相欠きに納める推定復元。
      // 梁の幅・下面の高さは保ち、下半分を縦材、上半分を横材に分ける。
      // 木目と木口は柱・天井の共有材質へまとめ、毎コマの仕事は増やさない。
      const beams = [], crossZ = boardCrossZs;
      for (const q of boardBeamXs) {
        if (upSt && q > upSt.hole.x0 - .15 && q < upSt.hole.x1 + .15) continue;
        beams.push(q);
        let start = -hd + .1;
        for (const z of crossZ) {
          const end = z - .075;
          timberBox(q, y + h - .13, (start + end) / 2, .17, .24, end - start, DARK, 'z');
          timberBox(q, y + h - .188, z, .17, .124, .15, DARK, 'z');
          start = z + .075;
        }
        timberBox(q, y + h - .13, (start + hd - .1) / 2, .17, .24, hd - .1 - start, DARK, 'z');
        // 板倉・番小屋の梁端を板壁へ突き当てるだけにせず、壁際の持送りで受ける推定復元。
        // 上段は梁下面、下段は壁へ寄せ、戸口・板戸より上の範囲へ納める。
        // 柱と同じ木材へ設営時だけ結合し、通行の当たりや毎コマの処理は増やさない。
        for (const side of [-1, 1]) {
          const end = side * (hd - .1);
          timberBox(q, y + h - .29, end - side * .07, .21, .08, .14, DARK, 'z');
          timberBox(q, y + h - .36, end - side * .035, .21, .06, .07, DARK, 'z');
          // 梁を受ける頬と込栓。梁の両脇で止め、同じ面を重ねない。
          for (const sx of [-1, 1])
            timberBox(q + sx * .095, y + h - .23, end - side * .07,
              .02, .04, .14, DARK, 'y');
          timberBox(q, y + h - .23, end - side * .07, .214, .014, .014, WOOD, 'x');
        }
      }
      for (const z of crossZ) {
        let start = -hw + .1;
        for (const x of beams) {
          const end = x - .085;
          // 横梁の上端も天井板の下面（内高から一センチ下）へ納める。
          // 下端と相欠きの合わせ面は保ち、天井板へ食い込む上の一センチだけを欠く。
          timberBox((start + end) / 2, y + h - .105, z, end - start, .19, .15, DARK, 'x');
          // 合わせ面を一ミリ離し、同じ面を重ねない。
          timberBox(x, y + h - .0675, z, .17, .115, .15, DARK, 'x');
          start = x + .085;
        }
        timberBox((start + hw - .1) / 2, y + h - .105, z, hw - .1 - start, .19, .15, DARK, 'x');
      }
      if (!I.open && !upSt) {
        // 板天井の四周も回縁で受ける用途からの推定。上端を梁上端・天井板下面へそろえる。
        // 梁と桁の木口で区切り、交点へ角材を重ねない。隅は短辺を長辺の内面へ納める。
        // 既存の木目・結合先を使い、設営時だけ作る。
        const edgeTimber = (alongZ, fixed, start, end, joints, halfWidth) => {
          const put = (a, b) => {
            if (b - a <= .002) return;
            timberBox(alongZ ? fixed : (a + b) / 2, y + h - .05,
              alongZ ? (a + b) / 2 : fixed,
              alongZ ? .08 : b - a, .08, alongZ ? b - a : .08, DARK, alongZ ? 'z' : 'x');
          };
          for (const joint of joints) {
            put(start, Math.min(end, joint - halfWidth - .001));
            start = Math.max(start, joint + halfWidth + .001);
          }
          put(start, end);
        };
        for (const side of [-1, 1]) {
          edgeTimber(true, side * (hw - .14), -hd + .1, hd - .1, crossZ, .075);
          edgeTimber(false, side * (hd - .14), -hw + .181, hw - .181, beams, .085);
        }
      }
    }
    if (showBeams && !fittedBeams) for (let q = -hw + 0.8; q < hw - 0.3; q += 1.7) {
      if (upSt && q > upSt.hole.x0 - 0.15 && q < upSt.hole.x1 + 0.15) continue;
      const [beamX, beamZ] = I.P(q, 0);
      // 稲葉山の梁は根太の下面で止める。素材の指定高は下端、箱は中心なので
      // 同じ値を渡すと素材だけ天井を突き抜ける。上下端を共通にする。
      const beamBottom = h - .29, beamHeight = .24;
      const beamY = y + (inabaBeamFrame ? beamBottom : h - .25);
      if (!naibu || !addNaibu(naibu, 'beam', beamX, beamY, beamZ, .17, beamHeight, lv.d - .2, I.rot))
        box(q, y + h - .13, 0, .17, beamHeight, lv.d - .2, DARK);
      ;
    }
    if (showBeams) {
      // 稲葉山の板倉・番所・長屋・小祠では、桁を外周の柱の真上に載せる。
      // 室内へ寄せた二本の横木では柱がなく、梁も途中だけで受ける形になる。
      const girderZ = inabaBeamFrame ? hd - .16 : hd * .55;
      for (const side of [-1, 1]) {
        box(0, y + h - .1, side * girderZ, lv.w - .2, .2, .15, DARK);
      }
      ;
    }
    if (showBeams && !fittedBeams) { box(0, y + h - 0.1, hd * 0.55, lv.w - 0.2, 0.2, 0.15, DARK); box(0, y + h - 0.1, -hd * 0.55, lv.w - 0.2, 0.2, 0.15, DARK); }
    // 四つの面：穴のある壁（内の側）。入口の階は戸口も穴
    for (const face of ['z', 'x']) for (const sd of [-1, 1]) {
      const len = face === 'z' ? lv.w : lv.d, off = (face === 'z' ? hd : hw) - 0.1;
      const holes = wins.filter((o) => o.face === face && o.s === sd && (!o.shoji || paperWindows)).map((o) => ({ t0: o.t - o.w / 2, t1: o.t + o.w / 2, y0: o.y0, y1: o.y1 }));
      if (k === 0 && face === 'z' && sd === ds) holes.push({ t0: I.door.lx - I.door.w / 2, t1: I.door.lx + I.door.w / 2, y0: I.door.rail || 0, y1: I.door.h ?? Math.min(h - 0.3, 2.0) });
      // 小堂は外と同じく戸口の上まで板壁、軒下だけ白い小壁にする。
      const boardTop = smallHall ? Math.min(I.door.h, h) : boardWalls ? h : 0;
      for (const [t0, t1, a0, a1] of facePanels(len, h, holes.filter((o) => o.t1 > -len / 2 && o.t0 < len / 2))) {
        const tm = (t0 + t1) / 2, tw = t1 - t0;
        for (const [low, high, hex] of [[a0, Math.min(a1, boardTop), smallHall ? BOARD : WALL], [Math.max(a0, boardTop), a1, WALL]]) {
          if (high <= low) continue;
          const yy = y + (low + high) / 2, hh = high - low;
          if (I.profile === 'anegawa' && S.quality === 'high' && high <= boardTop) {
            // 板倉・番小屋と小堂の腰板を縦板で納める推定復元。
            // 既存の目地と同じ三十センチ割りを使い、窓台・戸口で板を切る。
            // 壁を置き換えるため面を重ねず、当たりと引き戸の溝は変えない。
            const first = Math.floor((t0 + len / 2) / .3);
            const last = Math.ceil((t1 + len / 2) / .3);
            for (let q = first; q < last; q++) {
              const left = Math.max(t0, -len / 2 + q * .3);
              const right = Math.min(t1, -len / 2 + (q + 1) * .3);
              // 継ぎ目を黒い角棒で覆わず、床板と同じ二ミリの目地として欠く。
              // 窓・戸口の切り口は退けず、板同士が接する所だけ一ミリずつ逃がす。
              const a = left + (left > t0 + .0001 ? .001 : 0);
              const b = right - (right < t1 - .0001 ? .001 : 0);
              if (b - a < .001) continue;
              const t = (a + b) / 2;
              ceilingBoard(face === 'z' ? t : sd * off, yy, face === 'z' ? sd * off : t,
                face === 'z' ? b - a : .06, hh, face === 'z' ? .06 : b - a,
                hex, q * .31 + sd * .17, face);
            }
          } else if (I.profile === 'anegawa' && S.quality === 'high' && (smallHall || I.kind === 'yashiki' || earthWalls)) {
            plasterWall(face === 'z' ? tm : sd * off, yy, face === 'z' ? sd * off : tm,
              face === 'z' ? tw : .06, hh, face === 'z' ? .06 : tw, hex, face);
          } else if (face === 'z') box(tm, yy, sd * off, tw, hh, .06, hex); else box(sd * off, yy, tm, .06, hh, tw, hex);
        }
      }
      if (boardTop > 0 && !(I.profile === 'anegawa' && S.quality === 'high')) {
        // 板の継ぎ目は戸口・窓の穴をよける。設営時に壁と同じ形へまとめる。
        for (let t = -len / 2 + .3; t < len / 2 - .1; t += .3) {
          const cuts = holes.filter(o => t > o.t0 - .01 && t < o.t1 + .01)
            .map(o => ({ ...o, t0: -.01, t1: .01 }));
          for (const [, , low, high] of facePanels(.02, boardTop, cuts)) {
            if (face === 'z') box(t, y + (low + high) / 2, sd * (off - .035), .012, high - low, .012, DARK);
            else box(sd * (off - .035), y + (low + high) / 2, t, .012, high - low, .012, DARK);
          }
        }
      }
      const homeNuki = I.profile === 'anegawa' && S.quality === 'high' && ['minka', 'nagaya'].includes(I.kind);
      const hallNageshi = smallHall && S.quality === 'high';
      const houseNageshi = I.profile === 'anegawa' && S.quality === 'high' && I.kind === 'yashiki';
      const boardNageshi = I.profile === 'anegawa' && S.quality === 'high'
        && ['minka', 'nagaya', 'kura', 'bansho'].includes(I.kind);
      if (boardWalls || homeNuki || hallNageshi || houseNageshi) {
        // 番小屋・板倉に加え、民家と南の小屋も柱間の貫で壁を受ける推定復元。
        // 小堂は丸柱の下部を地長押でつなぐ。内陣の上がり床より上へ納める。
        // 三田村氏館の主屋も柱脚を地長押でつなぐ推定復元。
        // 畳面（一六センチ）より上に納め、板敷きの入口では戸口を欠く。
        // 窓と戸口を同じ開口で欠き、横木で出入りや採光を塞がない。
        // 共通の箱を設営時だけ複製し、既存の壁と一緒に結合する。
        // 地長押は貫と分け、柱の内面を包む位置へ出す。柱の中へ埋めない。
        const railInset = hallNageshi || houseNageshi ? .145 : .055;
        const rails = hallNageshi || houseNageshi ? outerJinageshi(lv, face, sd, holes)
          : [.45, h - .4].flatMap(railY => {
            const cuts = holes.filter(o => o.y0 < railY + .045 && o.y1 > railY - .045)
              .map(o => ({ t0: o.t0, t1: o.t1, y0: 0, y1: .09 }));
            return facePanels(len, .09, cuts).map(([t0, t1]) => [t0, t1, railY]);
          });
        for (const [t0, t1, railY] of rails) {
          // 高画質の地長押・貫は前後の材を通し、左右の材をその内面で止める。
          // 隅で横木の表面を重ねず、柱・窓枠と同じ長手の木目で納める。
          // 開口を欠いた後の範囲だけを縮めるので、窓と戸口へは渡さない。
          const fitted = I.profile === 'anegawa' && S.quality === 'high';
          const corner = .1 + railInset + .03;
          const start = fitted && face === 'x' ? Math.max(t0, -len / 2 + corner) : t0;
          const end = fitted && face === 'x' ? Math.min(t1, len / 2 - corner) : t1;
          if (end <= start) continue;
          if (hallNageshi || houseNageshi) {
            // 地長押も一棟幅の一本材にせず、実際の柱芯で相欠きに継ぐ推定復元。
            // 上下の継ぎ目をずらし、下地へ抜ける溝を作らない。戸口・窓の欠きは保つ。
            const joints = [...wallPostPositions(I, wins, face, sd, len)]
              .filter(t => t > start + .12 && t < end - .12
                && !(k === 0 && face === 'z' && sd === ds
                  && Math.abs(t - I.door.lx) < I.door.w / 2 + .2))
              .sort((a, b) => a - b);
            const ends = [start, ...joints, end];
            for (const layer of [-1, 1]) for (let q = 0; q + 1 < ends.length; q++) {
              const a = ends[q] + (q ? layer * .06 + .0005 : 0);
              const b = ends[q + 1] + (q + 2 < ends.length ? layer * .06 - .0005 : 0);
              const t = (a + b) / 2, yy = y + railY + layer * .0225;
              // 共有の木目と結合先を使い、室内を組む時だけ分割する。
              if (face === 'z') timberBox(t, yy, sd * (off - railInset), b - a, .045, .06, DARK, 'x');
              else timberBox(sd * (off - railInset), yy, t, .06, .045, b - a, DARK, 'z');
            }
            continue;
          }
          const t = (start + end) / 2;
          if (face === 'z') {
            timberBox(t, y + railY, sd * (off - railInset), end - start, .09, .06, DARK, 'x');
          } else {
            timberBox(sd * (off - railInset), y + railY, t, .06, .09, end - start, DARK, 'z');
          }
        }
      }
      // 腰板（櫓・天守：壁の下の一間ほどは板張り、上は漆喰。戸口の所は空ける）
      // 姉川の板倉・番小屋は既に杉の縦板で壁を張っている。
      // 無地の腰板と飾りの目地を重ねず、床から梁まで同じ板壁を見せる。
      if (!goten && !(boardWalls && S.quality === 'high')) {
        const wb = (t0, t1) => { if (t1 - t0 < 0.05) return; const tm = (t0 + t1) / 2, tw = t1 - t0; if (face === 'z') box(tm, y + 0.55, sd * (off - 0.03), tw, 1.1, 0.04, BOARD); else box(sd * (off - 0.03), y + 0.55, tm, 0.04, 1.1, tw, BOARD); };
        for (const [a, b, low, high] of facePanels(len, 1.1, holes)) { if (low === 0 && high === 1.1) wb(a, b); else { const mid = (a + b) / 2; if (face === 'z') box(mid, y + (low + high) / 2, sd * (off - .03), b - a, high - low, .04, BOARD); else box(sd * (off - .03), y + (low + high) / 2, mid, .04, high - low, b - a, BOARD); } }
        // 板の継ぎ目（縦）
        for (let t = -len / 2 + 0.45; t < len / 2 - 0.2; t += 0.45) { if (holes.some(v => t > v.t0 - .02 && t < v.t1 + .02 && v.y0 < 1.1)) continue; if (face === 'z') box(t, y + 0.55, sd * (off - 0.055), 0.015, 1.08, 0.01, 0x3a2a1c); else box(sd * (off - 0.055), y + 0.55, t, 0.01, 1.08, 0.015, 0x3a2a1c); }
      }
      {
      const posts = wallPostPositions(I, wins, face, sd, len);
      // 四隅は前後の壁で一本ずつ作る。左右の壁では柱頭と釘隠しも重ねない。
      // 小屋組は省く前の割付を使うので、隅の梁も同じ柱芯で受けられる。
      if (I.profile === 'anegawa' && face === 'x') {
        posts.delete(-len / 2 + .16);
        posts.delete(len / 2 - .16);
      }
      // 板倉・番小屋・民家の貫を、柱脇の楔で締める推定復元。
      // 長押には付けない。先細りの形を共有し、設営時に壁へ結合する。
      const nukiWedge = S.quality === 'high' && (boardWalls || homeNuki)
        ? new THREE.BoxGeometry(.12, .032, .065) : null;
      if (nukiWedge) {
        const pos = nukiWedge.attributes.position, uv = nukiWedge.attributes.uv;
        const normals = nukiWedge.attributes.normal;
        for (let j = 0; j < pos.count; j++) {
          if (pos.getY(j) > 0) pos.setY(j, pos.getY(j) - (pos.getX(j) + .06) * .2);
          // 楔の木目は打ち込む向きへ。傾斜面と側面で断面を分け、
          // 柱と貫に使う室内木材の絵へそろえる。
          const across = Math.abs(normals.getY(j)) > .5 ? pos.getZ(j) : pos.getY(j);
          uv.setXY(j, across * 2, pos.getX(j) * .65);
        }
        nukiWedge.computeVertexNormals();
      }
      for (const t of posts) {
        if (k === 0 && face === 'z' && sd === ds && Math.abs(t - I.door.lx) < I.door.w / 2 + .2) continue;
        if (hallPost) hallPostAt(face === 'z' ? t : sd * (off - .06),
          face === 'z' ? sd * (off - .06) : t);
        else if (face === 'z') timberBox(t, y + h / 2, sd * (off - .06), .16, h, .14, DARK, 'y');
        else timberBox(sd * (off - .06), y + h / 2, t, .14, h, .16, DARK, 'y');
        if (nukiWedge) for (const railY of [.45, h - .4]) for (const side of [-1, 1]) {
          const center = t + side * .13;
          // 窓・戸口・壁の端には出さず、実際に貫の残る所だけを締める。
          if (Math.abs(center) + .06 > len / 2 || holes.some(o =>
            center + .06 > o.t0 && center - .06 < o.t1
            && railY + .077 > o.y0 && railY - .045 < o.y1)) continue;
          const g = nukiWedge.clone();
          if (side < 0) g.rotateY(Math.PI);
          if (face === 'x') g.rotateY(-Math.PI / 2);
          g.translate(face === 'z' ? center : sd * (off - .075), y + railY + .061,
            face === 'z' ? sd * (off - .075) : center);
          indoorColor(g, WOOD); g.rotateY(I.rot); g.translate(I.x, 0, I.z);
          // 無地の群れへ重ねず、既存の木目の群れに結合する。
          // 形・当たり・描く回数と、開閉中の処理は増やさない。
          wallBoards.push(g);
        }
        if (hallPost) {
          hallBaseAt(t, face, sd, off);
          // 小堂の外周も内陣と同じ柱頭の受けにそろえる。戸口・連子窓の上へ納める。
          const bracket = hallBracketGeometry().clone();
          if (face === 'x') bracket.rotateY(Math.PI / 2);
          put(bracket, face === 'z' ? t : sd * (off - .06), y + h - .19,
            face === 'z' ? sd * (off - .06) : t, DARK);
          // 柱頭の受けも入口・内陣と同じ木肌にする。横材の長手へ木目を通す。
          if (face === 'z') timberBox(t, y + h - .27, sd * (off - .06), .24, .06, .18, DARK, 'x');
          else timberBox(sd * (off - .06), y + h - .27, t, .18, .06, .24, DARK, 'z');
        }
      }
      if (nukiWedge) nukiWedge.dispose();
      if (hallPost) {
        // 回縁の下を台輪でつなぐ推定復元。柱・舟肘木・台輪で格天井と竿縁天井を支える。
        // 前後の台輪を通し、脇の材の木口をその内面で止める。
        const length = face === 'z' ? len : len - .5;
        const member = (a, b, yy, hh) => {
          if (face === 'z') timberBox((a + b) / 2, yy, sd * (off - .06), b - a, hh, .18, DARK, 'x');
          else timberBox(sd * (off - .06), yy, (a + b) / 2, .18, hh, b - a, DARK, 'z');
        };
        // 小堂の長い台輪も一本材にせず、実在する柱の上で相欠きに継ぐ推定復元。
        // 正面の戸口内では柱を省いているため、左右の脇柱を支点に加える。
        // 外寸と高さは保ち、既存の木目の結合先へ設営時だけ納める。
        const supports = posts.filter(t => Math.abs(t) < length / 2 - .3
          && !(k === 0 && face === 'z' && sd === ds
            && Math.abs(t - I.door.lx) < I.door.w / 2 + .2));
        if (k === 0 && face === 'z' && sd === ds) for (const side of [-1, 1]) {
          const t = I.door.lx + side * (I.door.w / 2 + .08);
          if (Math.abs(t) < length / 2 - .3) supports.push(t);
        }
        let joint = null;
        if (length > 4.2) for (const t of supports)
          if (joint === null || Math.abs(t) < Math.abs(joint)) joint = t;
        const yy = y + h - .08;
        if (joint === null) member(-length / 2, length / 2, yy, .12);
        else {
          member(-length / 2, joint - .12, yy, .12);
          member(joint + .12, length / 2, yy, .12);
          member(joint - .12, joint + .118, yy + .03, .06);
          member(joint - .118, joint + .12, yy - .031, .058);
          // 上下の継ぎ材を木栓で留める。天井板へ出さず、共通の木材へまとめる。
          for (const delta of [-.06, .06]) {
            const t = joint + delta;
            timberBox(face === 'z' ? t : sd * (off - .06), yy,
              face === 'z' ? sd * (off - .06) : t, .018, .124, .018, WOOD, 'y');
          }
        }
      }
      // 姉川は間仕切りと同じ内法で長押を通す。小堂の戸口を横木で横切らない。
      // 小堂も内陣の間仕切りと同じ高さへ。柱頭の台輪へ長押を重ねない。
      // 主屋は間仕切りと同じく回縁の下へ離し、長押と釘隠しを天井へ埋めない。
      const nageshi = I.profile === 'anegawa'
        ? Math.min(interiorDoorHeight(lv.layout, h) + (hallNageshi ? .16 : .42), h - (houseNageshi ? .18 : .08)) : h * .8;
      // 主屋の外周も間仕切りと同じ断面で柱を包む。細い横木を柱の中へ埋めず、
      // 柱の室内面より二センチ手前まで長押を出し、その表面へ釘隠しを留める。
      // 番小屋・板倉・民家・宿小屋も、間仕切りと同じ厚みで柱を包む。
      // 十センチ厚のままでは柱へ埋まる。高さは保ち、既存の木目へ結合する。
      const fittedNageshi = houseNageshi || hallNageshi || boardNageshi;
      const nageshiDepth = fittedNageshi ? .18 : .1, nageshiHeight = houseNageshi || hallNageshi ? .12 : .1;
      const nageshiFace = .06 + nageshiDepth / 2;
      // 主屋・小堂の隅では前後の長押を通し、脇の長押を突き付ける。
      // 柱芯の内側への寄り（一六センチ）と材の半厚を両端から引き、同じ面を重ねない。
      const nageshiLength = fittedNageshi ? len - .32 - nageshiDepth : len;
      if (fittedNageshi) {
        // 小屋の長押も隅を突き付け、長い材は柱上で継ぐ。主屋と同じ仕組みを使う。
        // 主屋・小堂の長押は柱上で相欠きに継ぐ推定復元。中央一か所だけでは六メートル以上の材が残る。
        // 一材を四・二メートル以内へ割り、上下の材を半厚ずつ掛ける。継手は実際の柱上へ納める。
        // 設営時だけ既存の箱・木目へ結合し、外寸と引き戸の引き込みは保つ。
        const length = face === 'z' ? len : nageshiLength;
        const supports = [];
        for (const t of posts) {
          if (Math.abs(t) > length / 2 - .3
            || k === 0 && face === 'z' && sd === ds && Math.abs(t - I.door.lx) < I.door.w / 2 + .2) continue;
          supports.push(t);
        }
        if (k === 0 && face === 'z' && sd === ds) for (const side of [-1, 1]) {
          const t = I.door.lx + side * (I.door.w / 2 + .08);
          if (Math.abs(t) < length / 2 - .3) supports.push(t);
        }
        supports.sort((a, b) => a - b);
        const lap = .12, half = nageshiHeight / 2, seam = .002;
        const ends = [-length / 2];
        // 継ぎの掛かり代も材の長さに含め、届く範囲で最も先の柱を使う。
        // 戸口では省いた柱を選ばず、両脇の実在する柱間を渡す。
        while (length / 2 - ends[ends.length - 1] + (ends.length > 1 ? lap : 0) > 4.2) {
          const start = ends[ends.length - 1];
          let next = null;
          for (const t of supports) if (t > start + lap * 2
            && t - start + lap + (ends.length > 1 ? lap : 0) <= 4.2) next = t;
          if (next === null) break;
          ends.push(next);
        }
        ends.push(length / 2);
        const member = (a, b, yy, hh) => {
          if (b <= a) return;
          const center = (a + b) / 2;
          if (face === 'z') timberBox(center, yy, sd * (off - .06), b - a, hh, nageshiDepth, DARK, 'x');
          else timberBox(sd * (off - .06), yy, center, nageshiDepth, hh, b - a, DARK, 'z');
        };
        for (let q = 0; q < ends.length - 1; q++) {
          member(ends[q] + (q ? lap : 0), ends[q + 1] - (q < ends.length - 2 ? lap : 0),
            y + nageshi, nageshiHeight);
          if (!q) continue;
          const joint = ends[q];
          member(joint - lap, joint + lap - seam, y + nageshi + half / 2, half);
          member(joint - lap + seam, joint + lap, y + nageshi - half / 2 - seam / 2, half - seam);
        }
      }
      else if (face === 'z') timberBox(0, y + nageshi, sd * (off - .06), len, nageshiHeight, nageshiDepth, DARK, 'x');
      else timberBox(sd * (off - .06), y + nageshi, 0, nageshiDepth, nageshiHeight, nageshiLength, DARK, 'z');
      if (hallNail) for (const t of posts) {
        if (k === 0 && face === 'z' && sd === ds && Math.abs(t - I.door.lx) < I.door.w / 2 + .2) continue;
        hallNailAt(t, face, sd, off, y + nageshi);
      }
      if (I.profile === 'anegawa' && I.kind === 'yashiki') {
        // 主屋の長押は柱に留める納まりを補う。装飾の家紋は作らず、角形の釘隠しにする。
        // 長押の室内側に薄く納め、引き戸の溝や窓の開口へ張り出させない。
        // 既存の箱と暗い材を使い、室内を作る時だけ同じ群れへまとめる。
        for (const t of posts) {
          if (k === 0 && face === 'z' && sd === ds && Math.abs(t - I.door.lx) < I.door.w / 2 + .2) continue;
          if (face === 'z') {
            box(t, y + nageshi, sd * (off - nageshiFace - .006), .072, .072, .012, 0x292723);
            box(t, y + nageshi, sd * (off - nageshiFace - .014), .026, .026, .004, 0x503923);
          } else {
            box(sd * (off - nageshiFace - .006), y + nageshi, t, .012, .072, .072, 0x292723);
            box(sd * (off - nageshiFace - .014), y + nageshi, t, .004, .026, .026, 0x503923);
          }
        }
      }
      if (I.profile === 'anegawa' && k === 0 && face === 'z' && sd === ds) {
        // 等間隔の柱とは別に、実際の戸口の両脇で鴨居を受ける。通れる幅へは出さない。
        for (const side of [-1, 1]) {
          const t = I.door.lx + side * (I.door.w / 2 + .08);
          // 小堂の戸口も身舎・内陣と同じ丸柱。引き戸の溝の内側へ納める。
          if (hallPost) hallPostAt(t, sd * (off - .06));
          else timberBox(t, y + h / 2, sd * (off - .06), .16, h, .14, DARK, 'y');
          hallNailAt(t, face, sd, off, y + nageshi);
          if (houseNageshi) {
            // 戸口脇は等間隔の柱とは別に立つため、ここでも長押の留めを納める。
            // 外周と同じ角形の釘隠しを長押の表面へ置き、戸の溝と開口を空ける。
            box(t, y + nageshi, sd * (off - nageshiFace - .006), .072, .072, .012, 0x292723);
            box(t, y + nageshi, sd * (off - nageshiFace - .014), .026, .026, .004, 0x503923);
          }
          if (hallPost) {
            hallBaseAt(t, face, sd, off);
            // 入口の丸柱も外周・内陣と同じ舟肘木で台輪を受ける。
            // 共通の形を設営時だけ複製し、戸口と引き戸の溝は空ける。
            put(hallBracketGeometry().clone(), t, y + h - .19, sd * (off - .06), DARK);
            timberBox(t, y + h - .27, sd * (off - .06), .24, .06, .18, DARK, 'x');
          }
        }
        const doorTop = I.door.h ?? Math.min(h - .3, 2);
        timberBox(I.door.lx, y + doorTop + .05, sd * (off - .06), I.door.w + .32, .1, .14, DARK, 'x');
        // 外戸の敷居・鴨居・溝は階の冒頭で一組作る。重ねて溝を埋めない。
      }
      }
      for (const [a, b, low, high] of facePanels(len, .12, holes)) { if (face === 'z') box((a + b) / 2, y + (low + high) / 2, sd * (off - .03), b - a, high - low, .05, DARK); else box(sd * (off - .03), y + (low + high) / 2, (a + b) / 2, .05, high - low, b - a, DARK); }
    }
    if (hallNail) hallNail.dispose();
    if (hallBase) hallBase.dispose();
    for (const o of wins) {
      const [px, pz] = o.face === 'z' ? [o.t, o.s * (hd - 0.1)] : [o.s * (hw - 0.1), o.t];
      if (I.profile === 'anegawa' && S.quality === 'high') {
        // 明かり障子も連子窓と同じく、窓台・まぐさを左右の縦枠で受ける。
        // 上下の横木だけを壁へ浮かせず、開口の外で四方枠に納める推定復元。
        // 同じ箱を使い回して既存の室内へ結合し、窓の明かりと通れる幅は保つ。
        // 主屋と小屋の外壁は内寸端から九センチ外に立つ。内側だけの枠では
        // 壁厚の途中が開くため、内面を保ったまま外壁の外面まで見込みを通す。
        // 小堂は外装の連子が壁厚を通しているので、従来の枠へ納める。
        const throughFrame = I.hasExterior && !smallHall;
        const frameDepth = throughFrame ? .35 : .16;
        const frameOffset = o.s * (throughFrame ? .045 : -.05);
        for (const railY of [o.y0 - .04, o.y1 + .04]) {
          if (o.face === 'z') {
            timberBox(px, y + railY, pz + frameOffset, o.w + .32, .08, frameDepth, DARK, 'x');
          } else {
            timberBox(px + frameOffset, y + railY, pz, frameDepth, .08, o.w + .32, DARK, 'z');
          }
        }
        // 縦枠は上下の横木の内面で止め、木口と面を重ねない。
        // 開口の幅・高さは保ち、枠の木目も縦へ通す。
        if (!I.open) for (const side of [-1, 1]) {
          const t = side * (o.w / 2 + .08), frameY = y + (o.y0 + o.y1) / 2;
          if (o.face === 'z') {
            timberBox(px + t, frameY, pz + frameOffset, .16, o.y1 - o.y0, frameDepth, DARK, 'y');
          } else {
            timberBox(px + frameOffset, frameY, pz + t, frameDepth, o.y1 - o.y0, .16, DARK, 'y');
          }
        }
      }
      if (o.shoji) {   // 明かり障子：外の光で白く光る紙と、細い桟
        if (o.sliding && I.profile !== 'moribe') {
          winPts.push([px, y + (o.y0 + o.y1) / 2, pz, .7]);
          continue;
        }
        ;
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
          ;
          continue;
        }
        if (I.profile === 'anegawa' && S.quality === 'high') {
          // 明かり取りの障子は縦棒だけにせず、四辺の框で紙と横組子を受ける。
          // 戸口の可動障子とは分け、既存の窓の範囲へ納める推定復元。
          // 框と組子も柱・窓台と同じ木目を使い、材の長手へ通す。
          // 紙は組子の外側へ貼り、室内からは桟、外からは紙越しの桟を見せる。
          // 共有の箱と材質で室内へ結合し、部品数と窓の開口は保つ。
          const ph = o.y1 - o.y0, py = y + (o.y0 + o.y1) / 2;
          const fitting = (t, yy, w, hh, depth, color, emit = false, outward = 0) => {
            const axis = hh > w ? 'y' : o.face === 'z' ? 'x' : 'z';
            const normal = o.s * (-.05 + outward);
            if (o.face === 'z') {
              if (emit) box(px + t, yy, pz + normal, w, hh, depth, color, true);
              else timberBox(px + t, yy, pz + normal, w, hh, depth, color, axis);
            } else {
              if (emit) box(px + normal, yy, pz + t, depth, hh, w, color, true);
              else timberBox(px + normal, yy, pz + t, depth, hh, w, color, axis);
            }
          };
          // 厚さ十二ミリの紙が組子の中央を貫く作りを改め、
          // 厚さ一ミリの紙を桟の外面（二十ミリ）へ接して貼る。
          // 四辺は框の内面へ一ミリ掛け、斜めから見ても隙間を作らない。
          fitting(0, py, o.w - .098, ph - .098, .001, 0xd8d0b8, true, .0205);
          for (const side of [-1, 1]) {
            fitting(side * (o.w / 2 - .025), py, .05, ph, .07, DARK);
            fitting(0, py + side * (ph / 2 - .025), o.w - .1, .05, .07, DARK);
          }
          const columns = Math.max(2, Math.round((o.w - .1) / .22));
          const rows = Math.max(2, Math.round((ph - .1) / .28));
          for (let q = 1; q < columns; q++)
            fitting(-o.w / 2 + .05 + (o.w - .1) * q / columns, py, .018, ph - .1, .04, DARK);
          // 横組子の木口は縦組子の側面へ納める。交点に同じ面を重ねない。
          for (let q = 1; q < rows; q++) for (let col = 0; col < columns; col++) {
            const start = -o.w / 2 + .05 + (o.w - .1) * col / columns + (col ? .009 : 0);
            const end = -o.w / 2 + .05 + (o.w - .1) * (col + 1) / columns - (col + 1 < columns ? .009 : 0);
            fitting((start + end) / 2, y + o.y0 + .05 + (ph - .1) * q / rows,
              end - start, .018, .04, DARK);
          }
          winPts.push([px, py, pz, .7]);
          continue;
        }
        const [wx, wz] = I.P(px, pz);
        const bought = naibu && addNaibu(naibu, 'slide_door_c', wx, y + o.y0, wz, o.w, o.y1 - o.y0, .055, I.rot + (o.face === 'x' ? Math.PI / 2 : 0));
        if (!bought) {
          if (o.face === 'z') box(px, y + (o.y0 + o.y1) / 2, pz - o.s * 0.05, o.w, o.y1 - o.y0, 0.02, 0xd8d0b8, true); else box(px - o.s * 0.05, y + (o.y0 + o.y1) / 2, pz, 0.02, o.y1 - o.y0, o.w, 0xd8d0b8, true);
          for (let q = 1; q < 4; q++) { const t = -o.w / 2 + q * o.w / 4; if (o.face === 'z') box(px + t, y + (o.y0 + o.y1) / 2, pz - o.s * 0.07, 0.025, o.y1 - o.y0, 0.02, DARK); else box(px - o.s * 0.07, y + (o.y0 + o.y1) / 2, pz + t, 0.02, o.y1 - o.y0, 0.025, DARK); }
        }
      } else {
        // 格子（縦の木。間から外が見える）と、窓の下の敷居
      {
        const hieiGrid = hieiWindowBars(I, o, (t, cy, w, h) => {
          if (o.face === 'z') box(t, y + cy, pz, w, h, .04, DARK);
          else box(px, y + cy, t, .04, h, w, DARK);
        }, true);
        if (!I.open && I.profile === 'anegawa' && S.quality === 'high') {
          // 連子窓は三本の棒だけにせず、上下の框へ縦連子を差し、横貫で受ける推定復元。
          // 全部を既存の開口内へ納め、戸口と障子窓には渡さない。
          // 窓台・まぐさ・連子も柱と同じ木目を長手へ通す。
          // 既存の天井材へ結合し、窓ごとの描画回数・毎コマの処理を増やさない。
          const ph = o.y1 - o.y0;
          const lattice = (t, yy, w, hh, depth) => {
            const upright = hh > w;
            if (o.face === 'z') {
              timberBox(px + t, yy, pz, w, hh, depth, DARK, upright ? 'y' : 'x');
            } else {
              timberBox(px, yy, pz + t, depth, hh, w, DARK, upright ? 'y' : 'z');
            }
          };
          // 小堂は外装の一組が壁厚を通して内側にも見える。二重に格子を足さない。
          if (!smallHall) for (const [t, yy, ww, hh, depth] of windowLatticeMembers(o.w, ph))
            lattice(t, y + o.y0 + yy, ww, hh, depth);
        } else if (!hieiGrid && !I.open) for (let q = -1; q <= 1; q++) { const t = q * o.w * 0.3; if (o.face === 'z') box(px + t, y + (o.y0 + o.y1) / 2, pz, 0.05, o.y1 - o.y0, 0.05, DARK); else box(px, y + (o.y0 + o.y1) / 2, pz + t, 0.05, o.y1 - o.y0, 0.05, DARK); }
        if (!hieiGrid && !(I.profile === 'anegawa' && S.quality === 'high')) {
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
    // 小堂は既に須弥壇にある二基の灯明を明かりの元にする。外陣へ別の火袋を足さない。
    const altar = smallHall ? lv.layout.props.find(p => p.part === 'altar') : null;
    const ln = altar || goten || lv.w > 6 ? 2 : 1;
    // 姉川の館・小屋は、用途から補った油皿の灯明。火袋を一律に置かない。
    // 油皿と油面・台の形は階ごとに一つ用意し、光の焼き込みと既存の灯りの位置を使う。
    const oilLamp = I.profile === 'anegawa' && S.quality === 'high' && !altar;
    // 中実の円柱ではなく、底から口縁を回って内底へ戻る断面で浅い陶器の皿を作る。
    // 外径・台の高さと灯芯の位置は保ち、二つの灯明に同じ形を使い回す。
    const lampBowl = oilLamp ? new THREE.LatheGeometry([
      [0, 0], [.075, 0], [.095, .006], [.12, .028], [.12, .035],
      [.111, .035], [.111, .029], [.088, .012], [0, .012],
    ].map(([r, yy]) => new THREE.Vector2(r, yy)), 10) : null;
    const lampOil = oilLamp ? new THREE.CircleGeometry(.104, 10) : null;
    if (lampOil) lampOil.rotateX(-Math.PI / 2);
    const lampStand = oilLamp ? new THREE.BoxGeometry(1, 1, 1) : null;
    const lampPoint = oilLamp ? { x: 0, z: 0 } : null;
    for (let q = 0; q < ln; q++) {
      const sgS = upSt ? upSt.sg : -ds;
      let lx = (q === 0 ? 1 : -1) * (hw - 0.6), lz = -sgS * (hd - 0.6) * (q === 0 ? 1 : 0.2);
      if (altar) {
        const offset = (q === 0 ? -.75 : .75) * altar.w / 2.1;
        lx = altar.x + offset * Math.cos(altar.rot || 0);
        lz = altar.z - offset * Math.sin(altar.rot || 0);
      }
      if (oilLamp) {
        // 竈や木箱の上へ灯明台を重ねない。絵・炎・焼き込む光を同じ移動先へそろえる。
        if (!interiorLampSpot(lv.layout, lx, lz, lampPoint, I.doors?.filter(d => d.lv === lv))) continue;
        lx = lampPoint.x; lz = lampPoint.z;
      }
      const room = I.profile === 'anegawa' ? lv.layout.rooms.find(r => lx >= r.x0 && lx <= r.x1 && lz >= r.z0 && lz <= r.z1) : null;
      const baseY = y + (room?.y || 0);
      const flameY = altar ? y + (altar.y || 0) + 1.45 * altar.h / 1.5 : baseY + 1.08;
      const [lampX, lampZ] = I.P(lx, lz);
      if (oilLamp) {
        for (const [w, hh, d, yy] of [[.28, .04, .28, .02], [.045, .91, .045, .495], [.22, .035, .22, .9675]]) {
          const stand = lampStand.clone(); stand.scale(w, hh, d);
          put(stand, lx, baseY + yy, lz, DARK);
        }
        put(lampBowl.clone(), lx, baseY + .985, lz, 0x80674b);
        // 油面を口縁より下へ納める。灯芯の先と既存の炎だけを皿の外へ出す。
        put(lampOil.clone(), lx, baseY + 1.009, lz, 0x302b1d);
        box(lx + .075, baseY + 1.033, lz, .05, .012, .014, 0x302719);
        box(lx + .09, flameY - .02, lz, .018, .055, .018, 0xffd49a, true);
      } else if (!altar && (!naibu || !addNaibu(naibu, 'japanese_lamp_emissive', lampX, baseY, lampZ, .32, 1.26, .32, I.rot))) {
        box(lx, baseY + 0.45, lz, 0.05, 0.9, 0.05, DARK); box(lx, baseY + 0.03, lz, 0.3, 0.06, 0.3, DARK);
        box(lx, flameY, lz, 0.26, 0.36, 0.26, 0xffd49a, true);
      }
      const glowX = lx + (oilLamp ? .09 : 0), glowY = flameY - (oilLamp ? .02 : 0);
      lamps.push([glowX, glowY, lz]);
      const [wx, wz] = I.P(glowX, lz), sp = new THREE.Sprite(M.glow); sp.position.set(wx, glowY, wz); sp.scale.setScalar(altar ? .3 : oilLamp ? .18 : I.lampGlowScale ?? .8); sp.renderOrder = 4; grp.add(sp);
      // 姉川の油皿と須弥壇は、それぞれの小さな炎に合わせた光の径を保つ。
      // 更新時に共通の大きさへ戻すと、光が皿・本尊・建具を覆ってしまう。
      if (I.profile === 'anegawa' && S.quality === 'high') sp.userData.nakaGlowScale = sp.scale.x;
      I.glows.push(sp);
    }
    if (lampBowl) lampBowl.dispose();
    if (lampOil) lampOil.dispose();
    if (lampStand) lampStand.dispose();

    // 稲葉山の高画質は furnishLayout が上段の床組み・畳・框を同じ床高で作る。
    // 旧来の一枚板を重ねると畳面と同じ高さになり、畳縁や目地を覆ってちらつく。
    if (I.kind === 'goten' && I.okuZ != null && lv.layout.rooms[0].raised !== false
      && !(S.quality === 'high' && I.profile === 'inabayama')) {
      const backD = lv.d * I.oku, bz = -ds * (hd - backD / 2);
      box(0, y + 0.08, bz - ds * 0.1, lv.w - 0.3, 0.16, backD - 0.4, 0x8a8050);
    }
  }
  // 光を頂点の色に焼き込む：暗い地に、灯明の暖かい明かりと窓の明かり
  for (const g of list.concat(wallBoards, plasterWalls)) {
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
  // 姉川は furnishLayout が外陣・入口まで木目と板継ぎを敷いている。
  // 別の床を上へ重ねると釘と目地が隠れ、敷居際も浮くため追加しない。
  if (!['yagura', 'anegawa', 'hieizan'].includes(I.profile) && cgtOn() && cgtHas('Floor_Boards')) {
    const kb = new KitBatch();
    for (let k = 0; k < Ls.length; k++) {
      const lv = Ls[k];
      {
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
  if (plasterWalls.length) {
    grp.add(new THREE.Mesh(mergeGeometries(plasterWalls), interiorPlasterMaterial(earthWalls)));
    for (const g of plasterWalls) g.dispose();
  }
  if (ceilingShape) ceilingShape.dispose();
  if (thatchLinings.length) {
    grp.add(new THREE.Mesh(mergeGeometries(thatchLinings), innerThatchMaterial()));
    for (const g of thatchLinings) g.dispose();
  }
  ceilingBoards.push(...wallBoards);
  if (ceilingBoards.length) {
    grp.add(new THREE.Mesh(mergeGeometries(ceilingBoards), anegawaCeilingWoodMaterial()));
    for (const g of ceilingBoards) g.dispose();
  }
  if (endBoards.length) {
    grp.add(new THREE.Mesh(mergeGeometries(endBoards), endWoodMaterial()));
    for (const g of endBoards) g.dispose();
  }
  if (floorBoardShape) floorBoardShape.dispose();
  const m = new THREE.Mesh(mergeGeometries(list), I.profile === 'hieizan' ? M.hieiBase : M.base);

  m.matrixAutoUpdate = false;
  grp.add(m);
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


function anegawaBuildOuter(rt) {
  const list = [], wood = [];
  for (const I of NAKA.list) {
    if (I.profile !== 'anegawa' || I.disabled) continue;
    const lv = I.levels[0], ds = I.door.side, hd = lv.d / 2;
    const put = (g, x, y, z, hex) => {
      g.translate(x, y, z); g.rotateY(I.rot); g.translate(I.x, 0, I.z);
      list.push(colorize(g, hex));
    };
    // 姉川の小堂は props.js で縁側と石段を一組作る。ここで別の石段を重ねない。
    if (I.approach && !(I.profile === 'anegawa' && I.kind === 'hondo')) {
      const woodenEntry = I.profile === 'anegawa' && ['yashiki', 'minka', 'nagaya', 'kura', 'bansho'].includes(I.kind);
      const { pad, len, gy } = I.approach, rise = lv.y - gy;
      const n = woodenEntry ? Math.max(1, Math.ceil(Math.abs(rise) / .18)) : Math.max(3, Math.round(rise / .28));
      const stone = !woodenEntry && I.kind !== 'goten' && I.kind !== 'gate';
      // 館・民家・番小屋には板の踏み段と束を置く推定復元。足場の坂と同じ幅・勾配に納める。
      // 共通の材質で外装へまとめ、束は設営時にだけ作る。
      const timber = woodenEntry ? new THREE.BoxGeometry(1, 1, 1) : null;
      const fitted = woodenEntry && S.quality === 'high';
      // 踏み板・横木・束で一つの木目を共有する。材の長手に割り付け、
      // 姉川の入口だけを一つの結合形へまとめる。足場と戸の溝は変えない。
      const entryTimber = (lx, yy, lz, w, h, d, hex, upright = false, tilt = 0, alongZ = false) => {
        const g = timber.clone(); g.scale(w, h, d);
        const p = g.attributes.position, normal = g.attributes.normal, uv = g.attributes.uv;
        for (let j = 0; j < p.count; j++) {
          const cap = Math.abs(upright ? normal.getY(j) : alongZ ? normal.getZ(j) : normal.getX(j)) > .5;
          const across = upright
            ? Math.abs(normal.getX(j)) > .5 ? p.getZ(j) : p.getX(j)
            : Math.abs(normal.getY(j)) > .5 ? alongZ ? p.getX(j) : p.getZ(j) : p.getY(j);
          uv.setXY(j, (cap ? p.getZ(j) : across) * 2 + lz * .17,
            (cap ? upright ? p.getX(j) : p.getY(j) : upright ? p.getY(j) : alongZ ? p.getZ(j) : p.getX(j)) * .65);
        }
        if (tilt) g.rotateX(tilt);
        g.translate(lx, yy, lz); g.rotateY(I.rot); g.translate(I.x, 0, I.z);
        wood.push(colorize(g, hex));
      };
      const decking = (top, centerZ, w, depth, thickness) => {
        const count = Math.max(1, Math.ceil(depth / .25)), pitch = depth / count;
        for (let j = 0; j < count; j++)
          entryTimber(I.door.lx, top - thickness / 2, centerZ - depth / 2 + (j + .5) * pitch,
            w, thickness, pitch - .002, j % 2 ? 0x56432f : 0x4e3c2a);
      };
      for (let q = 0; q < n; q++) {
        const t = (q + 1) / n, top = gy + rise * t, lz = ds * (hd + pad + len * (1 - t) + len / n / 2);
        if (woodenEntry) {
          if (fitted) {
            decking(top, lz, I.door.w + .3, len / n + .02, .06);
            // 束の上に横木を渡し、分けた踏み板を下から受ける。
            entryTimber(I.door.lx, top - .10, lz, I.door.w + .08, .08, .12, 0x3a2a1c);
          } else {
            const tread = timber.clone(); tread.scale(I.door.w + .3, .06, len / n + .02);
            put(tread, I.door.lx, top - .03, lz, q % 2 ? 0x4e3c2a : 0x56432f);
          }
          for (const side of [-1, 1]) {
            const lx = I.door.lx + side * (I.door.w / 2 - .08);
            // 段ごとの束は、その足元の地面まで下ろす。坂の下端の高さを
            // 全てに使うと、館や尾根の番小屋で束が浮いたり板を突き抜ける。
            const [wx, wz] = I.P(lx, lz);
            const foot = S.quality === 'high' ? rt.world.heightAt(wx, wz) - .04 : gy - .12;
            const height = fitted ? top - .14 - foot : Math.max(.06, top - .06 - foot);
            if (height <= 0) continue;
            if (fitted) entryTimber(lx, foot + height / 2, lz, .12, height, .12, 0x3a2a1c, true);
            else {
              const support = timber.clone(); support.scale(.12, height, .12);
              put(support, lx, foot + height / 2, lz, 0x3a2a1c);
            }
          }
          continue;
        }
        const g = new THREE.BoxGeometry(I.door.w + 0.3, Math.max(0.1, top - gy + 0.3), len / n + 0.02);
        put(g, I.door.lx, (top + gy - 0.3) / 2, lz, stone ? (q % 2 ? 0x7c7468 : 0x847c70) : (q % 2 ? 0x4e3c2a : 0x56432f));
      }
      if (fitted && n > 1) {
        // 踏み段の束を左右のささら桁でつなぐ推定復元。
        // 各段の横木の下面を同じ勾配で受け、踏み板や戸口へ突き出さない。
        // 共有する箱・木目を外装へ結合し、足場と毎コマの処理は増やさない。
        const nearZ = ds * (hd + pad + len - len / n / 2);
        const farZ = ds * (hd + pad + len / n / 2);
        const nearY = gy + rise / n - .19, farY = lv.y - .19;
        const depth = Math.hypot(farZ - nearZ, farY - nearY);
        const tilt = -Math.atan2(farY - nearY, farZ - nearZ);
        for (const side of [-1, 1])
          entryTimber(I.door.lx + side * (I.door.w / 2 - .08),
            (nearY + farY) / 2, (nearZ + farZ) / 2, .12, .1, depth,
            0x3a2a1c, false, tilt, true);
      }
      if (timber && S.quality === 'high') {
        // 踊り場の外側も束で受ける。内側は建物の土台に掛け、戸口と
        // 外戸の溝より下だけに納める。踏み段と同じ形・結合先を使う。
        const lz = ds * (hd + pad + .02);
        entryTimber(I.door.lx, lv.y - .09, lz, I.door.w + .32, .06, .12, 0x3a2a1c);
        for (const side of [-1, 1]) {
          const lx = I.door.lx + side * (I.door.w / 2 + .1);
          const [wx, wz] = I.P(lx, lz);
          const foot = rt.world.heightAt(wx, wz) - .04;
          const height = lv.y - .12 - foot;
          if (height <= 0) continue;
          entryTimber(lx, foot + height / 2, lz, .12, height, .12, 0x3a2a1c, true);
        }
      }
      if (fitted) decking(lv.y, ds * (hd + pad / 2 - .1), I.door.w + .4, pad + .4, .06);
      if (timber) timber.dispose();
    }
  }
  for (const parts of [list, wood]) {
    if (!parts.length) continue;
    if (parts === wood && !entryWood)
      entryWood = new THREE.MeshLambertMaterial({ map: anegawaCeilingWoodMaterial().map, vertexColors: true });
    const mesh = new THREE.Mesh(mergeGeometries(parts), parts === wood ? entryWood : mats().door);
    mesh.castShadow = mesh.receiveShadow = true; mesh.matrixAutoUpdate = false;
    rt.scene.add(mesh);
    for (const g of parts) g.dispose();
  }
}

// 民家は土間の床高、小堂は縁先の高さへ踏板を合わせる。静止した部品だけをまとめる。
function villageBuildOuter(rt) {
  const group = new THREE.Group();
  for (const I of NAKA.list) {
    if (I.disabled || S.quality !== 'high' || I.profile !== 'shitaragahara' || !I.approach) continue;
    const lv = I.levels[0], ds = I.door.side, hd = lv.d / 2;
    const { pad, len, gy } = I.approach, y = I.approach.y ?? lv.y;
    const rise = y - gy, n = I.approach.steps || Math.max(3, Math.round(rise / .28));
    const home = I.kind === 'minka', width = I.door.w + .3;
    const local = new THREE.Group();
    for (let j = 0; j < n; j++) {
      const top = gy + rise * (j + 1) / n;
      const z = ds * (hd + pad + len * (1 - (j + 1) / n) + len / n / 2);
      // 民家の木段は踏板と二本の受け、小堂は石の段。足場の段数と上面を共用する。
      if (home) {
        timberBox(local, width, .055, len / n + .02, I.door.lx, top - .0275, z, 0x56432f);
        for (const side of [-1, 1]) timberBox(local, .1, Math.max(.055, top - gy), len / n,
          I.door.lx + side * (width / 2 - .1), (top + gy) / 2 - .0275, z, 0x3e2e22);
      } else {
        const height = Math.max(.04, top - gy);
        // 石も共通の箱・材質にまとめ、毎コマは作らない。
        const stone = new THREE.Mesh(INABA_WALL_BOARD, mats().door);
        stone.scale.set(width, height, len / n + .02);
        stone.position.set(I.door.lx, top - height / 2, z); local.add(stone);
      }
    }
    if (home) {
      const depth = pad + .4;
      timberBox(local, width + .1, .06, depth, I.door.lx, y - .03,
        ds * (hd + pad / 2 - .1), 0x56432f);
    }
    local.position.set(I.x, 0, I.z); local.rotation.y = I.rot; group.add(local);
  }
  if (group.children.length) rt.scene.add(batchInterior(group));
}
