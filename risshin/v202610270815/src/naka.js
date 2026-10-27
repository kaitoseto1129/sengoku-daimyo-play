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
import { FL, addDeck, addRamp, rampSurface } from './floors.js';
import { SOLIDS } from './props.js';
import { INTERIOR_WALLS, makeInteriorGuards, interiorSafeSpot, interiorFloorBlocked, interiorBlocked } from './shironaka.js';
import { interiorLayout, interiorFloorAt, shitaragaharaTempleMats, shitaragaharaHomePanels, interiorPartitionHeight, interiorPartitionHeaders, interiorPartitionSpans, interiorWaypoint, prepareInteriorPaths, interiorPropBlocksWalk, igaFixedPanelRange } from './interior_layouts.js';
import { nodaDoorHeight, nodaNageshiHeight, nodaPartitionPosts, koshiTimbers, paperDoorTimbers, nodaCanopySupport, ceilingWoodMaterial as nodaWoodMaterial, inabaBoardTexture, INABA_ALTAR_SUSPENSION_DROP, inabaAltarBackHeight, tomyo, lightPool, furnishLayout, nageshiGeometry, nageshiNail, templeCeilingBoard, templeRoundPost, timberBox, batchInterior, SHITARAGAHARA_CEILING_LIFT, hieiAltarLamps, hieiNageshiHeight, hieiPartitionHeight, HIEI_DOOR_TRACK, HIEI_ENTRY_TRACK, HIEI_SOBO_SILL, MORIBE_WRITING_TOOLS, igaCeilingBoards, igaSootShade, igaPlasterWalls, igaShojiKoshi, IGA_DOOR_GROOVE_W } from './interior_parts.js';
import { setInteriorSound } from './audio.js';
import { S } from './settings.js';
import { woodTex } from './nature.js';
import { addNaibu, addNaibuStairs } from './naibu_kit.js';
import { cgtOn, cgtHas, KitBatch } from './cgt.js';   // 買った素材（床・畳・武器の棚）
import { yaguraTick } from './yagura_play.js';
import { addNakaDoors, buildNakaDoorMeshes, nakaDoorTick, resetNakaDoors, IGA_WINDOW_INSET, IGA_SHOJI_WINDOW_INSET } from './naka_doors.js';
import { drawGroundAt } from './render_camera.js';

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

// 窓の穴は設営時に一度決め、当たりと室内の絵で使い回す。
function windowsFor(I, lv, k) {
  if (lv.windows) return lv.windows;
  const hw = lv.w / 2, hd = lv.d / 2, h = lv.h;
  const goten = !['tenshu', 'yagura', 'gate'].includes(I.kind);
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
    // 二組の戸の間に、閉じた障子にも触れず立てる土間を残す。
    const entryDepth = S.quality === 'high' && I.profile === 'shitaragahara' && I.kind === 'minka' ? 1.65 : null;
    lv.layout = interiorLayout(I.kind, lv.w, lv.d, { oku: I.oku || .4, side: ds, profile: I.profile, entryX: I.door.lx, entryDepth, use: o.interiorUse, entryW: I.door.w, raisedTatami: I.profile === 'inabayama' && S.quality === 'high', slidingWindows: I.templePaper });
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
if (I.profile === 'nodafukushima') {
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
      const off = v.s * ((v.face === 'z' ? hd : hw) - .1);
      // 三本だけの見えない棒を残さず、実際の縦桟・横桟の間を空ける。
      if (hieiWindowBars(I, v, (t, cy, w, h) => {
        const a = t - w / 2 + .02, b = t + w / 2 - .02;
        if (v.face === 'z') seg(I, a, off, b, off, lv.y + cy - h / 2, lv.y + cy + h / 2, .02);
        else seg(I, off, a, off, b, lv.y + cy - h / 2, lv.y + cy + h / 2, .02);
      })) continue;
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
if (I.profile !== 'shitaragahara') {
    for (const v of lv.layout.walls) {
      if (I.profile === 'moribe') {
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
        if (ph < lv.h) {
          if (!v.guideOnly && Math.abs(v.az - v.bz) <= .01) {
            hieiPartitionHead(I, lv, Math.min(v.ax, v.bx), Math.max(v.ax, v.bx), v.az,
              ['sobo', 'chudo', 'hondo'].includes(I.kind) ? Math.min(.12, Math.abs(v.bx - v.ax) / 2) : 0);
          } else seg(I, v.ax, v.az, v.bx, v.bz, lv.y + ph, y1, .08);
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
    addNakaDoors(I, lv, y0, y1);   // 間仕切りの口に引き戸（naka_doors.js）
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
      // 砦の玄関は間仕切りの敷居まで。短い長屋でも奥の寝具・槍掛けや
      // 詰所の調度を玄関の荷物と取り違えて消さない。
      // 戸口前後の立ち所は間取り側で空けてあり、ここでは入口だけを守る。
      let entryBack = hd - 1.6;
      const fortEntry = S.quality === 'high' && I.profile === 'nodafukushima'
        && ['goten', 'bansho', 'nagaya', 'kura'].includes(I.kind);
      // 河口の民家は土間の左右に水・薪・炊事台を分けてある。
      // 五十センチの余白では戸口を塞がない炊事台まで消えるため、
      // 高の民家も十センチの余白で実際の戸口への張り出しを調べる。
      const homeEntry = S.quality === 'high' && I.profile === 'nodafukushima' && I.kind === 'minka';
      const entryMargin = fortEntry || homeEntry ? .1 : .5;
      if (fortEntry) {
        for (const portal of lv.layout.portals) entryBack = Math.max(entryBack, ds * portal.z + .2);
      }
      lv.layout.props = lv.layout.props.filter(p => !(p.x + p.w / 2 + entryMargin > I.door.lx - I.door.w / 2
        && p.x - p.w / 2 - entryMargin < I.door.lx + I.door.w / 2
        && ds * p.z + p.d / 2 + entryMargin > entryBack));
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
      const top = lv.y + (p.y || 0) + p.h + (p.part === 'stones' ? .18 : p.part === 'ammo' ? .05 : 0);
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
      const x0 = p.x - ww / 2, x1 = p.x + ww / 2, z0 = p.z - dd / 2, z1 = p.z + dd / 2;
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
      if (S.quality === 'high' && I.profile === 'shitaragahara' && I.kind === 'hondo'
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
      } else if (!(S.quality === 'high' && I.profile === 'shitaragahara' && I.kind === 'hondo' && p.part === 'altar')) {
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
      if (S.quality === 'high' && I.profile === 'shitaragahara' && I.kind === 'hondo' && p.part === 'altar') {
        // 壇の上端は五十四センチ。本尊の高さまで四周を見えない壁で囲わず、
        // 壇・来迎壁・本尊・供具を見える寸法ごとに受ける。
        // 調度の拡縮・向きも絵に揃え、左右の内陣の通路は空ける。設営時だけ登録する。
        const sx = ww / 2.1, sy = p.h / 1.5, sz = dd, c = Math.cos(p.rot || 0), s = Math.sin(p.rot || 0);
        const base = lv.y + (p.y || 0);
        const back = (a, b, low, high, radius) => {
          const z = -.46 * sz;
          seg(I, p.x + a * sx * c + z * s, p.z - a * sx * s + z * c,
            p.x + b * sx * c + z * s, p.z - b * sx * s + z * c,
            base + low * sy, base + high * sy, radius * Math.max(sx, sz));
        };
        back(-.89, .89, .54, 1.98, .02); // 来迎壁
        // 壁の外側に立つ二本の丸柱も、壇より上の胴を受ける。
        // 壁だけでは柱の端を矢や槍が抜ける。絵と同じ柱芯・半径に納める。
        for (const x of [-.93, .93]) back(x, x, .54, 2, .04);
        back(-.97, .97, 1.98, 2.02, .04); // 来迎柱をつなぐ頭貫
        // 本尊は蓮台・膝・胴・腕・頭を分け、像の両脇を塞がない。
        // 光背の尖りまで四角い壁にせず、高さごとの幅と像の首・肉髻を分ける。
        // 調度と同じ局所寸法を使い、設営時だけ登録する。
        const front = (a, b, z, low, high, radius) => {
          const zz = z * sz;
          seg(I, p.x + a * sx * c + zz * s, p.z - a * sx * s + zz * c,
            p.x + b * sx * c + zz * s, p.z - b * sx * s + zz * c,
            base + low * sy, base + high * sy, radius * Math.max(sx, sz));
        };
        front(-.23, .23, -.08, .605, .7925, .11); // 蓮台と蓮弁
        for (const x of [-.18, .18]) front(x, x, .01, .725, .915, .175); // 結跏した膝
        front(0, 0, -.1, .795, 1.365, .15); // 胴
        for (const x of [-.23, .23]) front(x, x, -.01, .87, 1.27, .065); // 腕
        front(-.05, .05, .13, .9, .98, .07); // 両手
        front(0, 0, -.1, 1.335, 1.625, .125); // 頭
        front(0, 0, -.12, 1.59, 1.69, .065); // 肉髻
        for (const [low, high, half] of [[.63, .8, .3], [.8, 1.4, .4], [1.4, 1.5, .24],
          [1.5, 1.58, .17], [1.58, 1.66, .1], [1.66, 1.73, .035]])
          front(-half + .0175, half - .0175, -.36, low, high, .0175);
        // 天蓋も見える木部だけを受ける。壇から天井までの一枚の壁にせず、
        // 框・鏡板・裏桟・蓋板と四本の吊り棒を、調度と同じ寸法で登録する。
        // 設営時に一度だけ作り、内陣の通路や本尊の周りの空間は残す。
        const canopyBox = (x, z, w, d, low, high) => {
          const alongX = w * sx >= d * sz;
          const radius = Math.min(w * sx, d * sz) / 2;
          const span = Math.max(w * sx, d * sz) / 2 - radius;
          const xx = x * sx, zz = z * sz;
          const dx = alongX ? span : 0, dz = alongX ? 0 : span;
          seg(I, p.x + (xx - dx) * c + (zz - dz) * s,
            p.z - (xx - dx) * s + (zz - dz) * c,
            p.x + (xx + dx) * c + (zz + dz) * s,
            p.z - (xx + dx) * s + (zz + dz) * c,
            base + low * sy, base + high * sy, radius).bodyOverlap = true;
        };
        // 下框・腰・上框と八角の台座。回転した堂でも調度と同じ位置へ一度だけ登録する。
        canopyBox(0, 0, 2.1, 1, 0, .14);
        canopyBox(0, 0, 1.88, .86, .14, .44);
        canopyBox(0, 0, 2.1, 1, .44, .54);
        canopyBox(0, -.1, .6, .5, .54, .64);
        for (const x of [-.4, .4]) {
          front(x, x, .3, .54, .558, .075); // 供水の受け皿
          front(x, x, .3, .558, .623, .055); // 供水器
        }
        for (const x of [-.75, .75]) {
          canopyBox(x, 0, .18, .18, .55, .575); // 灯明台の足
          canopyBox(x, 0, .035, .035, .575, .775); // 竿
          front(x, x, 0, .775, .826, .108); // 油皿（炎の周りは空ける）
        }
        for (const z of [-.41, .25]) canopyBox(0, z, 1.55, .06, 2.14, 2.22);
        for (const x of [-.745, .745]) canopyBox(x, -.08, .06, .6, 2.14, 2.22);
        canopyBox(0, -.08, 1.45, .62, 2.19, 2.21); // 鏡板と裏板
        for (const x of [-.24, .24]) canopyBox(x, -.08, .035, .6, 2.14, 2.19);
        canopyBox(0, -.08, 1.7, .82, 2.21, 2.27); // 上面の框と接ぎ板
        const beamTop = (lv.h + SHITARAGAHARA_CEILING_LIFT + .44 - (p.y || 0)) / sy;
        if (beamTop + .033 > 2.278) for (const x of [-.6, .6]) for (const z of [-.3, .14]) {
          front(x, x, z, 2.278, beamTop + .033, .009);
          for (const low of [2.27, beamTop]) canopyBox(x, z, .06, .06, low, low + .008);
          canopyBox(x, z, .05, .012, beamTop + .008, beamTop + .02);
        }
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
  if (o.approach) {
    const { pad, len } = o.approach;
    const [tx, tz] = I.P(I.door.lx, ds * (hd0 + pad)), [bx, bz] = I.P(I.door.lx, ds * (hd0 + pad + len));
    const gy = world.heightAt(bx, bz);
    // 設楽原の民家の踏み段は、十二センチ低い土間と板戸の敷居へつなぐ。
    // 板間の高さまで上げると、戸を開けた先に見た目と当たりの段差が残る。
    const villageHall = S.quality === 'high' && I.profile === 'shitaragahara' && I.kind === 'hondo';
    // 小堂の石段は室内より十一センチ低い縁板へ上がる。絵と段の足場で同じ上端を使う。
    const entryFloor = villageHall ? -.11
      : S.quality === 'high' && I.profile === 'shitaragahara' && I.kind === 'minka'
        ? (L0.layout.rooms.find(r => r.floor === 'earth')?.y || 0) : 0;
    const entryY = L0.y + entryFloor;
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
    let entryZ = hd0 - 1.1;
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
  const M = mats(), list = [], woodFloorList = [], timbers = [], igaBoards = [], plasterWalls = [], lamps = [], winPts = [], paper = [], ceilingWood = [], smokeStains = [];
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
  const inabaBoards = S.quality === 'high' && I.profile === 'inabayama' && ['kura', 'bansho', 'nagaya', 'shrine'].includes(I.kind);
  const plainCeiling = I.profile === 'inabayama' && ['kura', 'bansho'].includes(I.kind)
    || I.profile === 'shitaragahara' && I.kind === 'minka'
    || I.profile === 'iga' && I.kind === 'minka'
    || I.profile === 'nodafukushima' && ['kuri', 'minka'].includes(I.kind)
    || I.profile === 'echizen_ikko' && I.kind === 'bansho'
    || ['nodafukushima', 'usayama', 'iga', 'takato', 'tottori'].includes(I.profile) && ['kura', 'bansho', 'nagaya'].includes(I.kind)
    || I.profile === 'iwamura_' + I.kind && ['kura', 'bansho', 'nagaya'].includes(I.kind)
    || I.profile === 'nagashima' && ['kura', 'nagaya'].includes(I.kind);
  const WOOD = 0x6a5038, DARK = 0x3a2a1c, WALL = I.sgOverhead ? 0x817967 : goten ? 0xb8ab90 : 0xa89a80, FLOOR = 0x8a6a48, BOARD = I.sgOverhead ? 0x514b3d : 0x6a5238;
  for (let k = 0; k < Ls.length; k++) {
    const lv = Ls[k], hw = lv.w / 2, hd = lv.d / 2, h = lv.h, y = lv.y;
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
    const decor = furnishLayout(lv.layout, h, { partitions: true, dim: true });
    decor.position.set(I.x, y, I.z); decor.rotation.y = I.rot; grp.add(decor);
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
    const floorPieces = hearth ? woodPieces.flatMap(([x0, x1, z0, z1]) => {
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      return rectMinus((x1 - x0) / 2, (z1 - z0) / 2, {
        x0: hearth.x - (hearth.w - .18) / 2 - cx, x1: hearth.x + (hearth.w - .18) / 2 - cx,
        z0: hearth.z - (hearth.d - .18) / 2 - cz, z1: hearth.z + (hearth.d - .18) / 2 - cz,
      }).map(([a, b, c, d]) => [a + cx, b + cx, c + cz, d + cz]);
    }) : woodPieces;
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
    for (const [x0, x1, z0, z1] of floorPieces) {
      const [fx, fz] = I.P((x0 + x1) / 2, (z0 + z1) / 2);
      // 民家と小堂は板の下面に暗い裏面を置く。目地を床の上の黒い棒で代用しない。
      if (villageHome || villageHall) box((x0 + x1) / 2, y - .06, (z0 + z1) / 2, x1 - x0, .04, z1 - z0, DARK);
      else if (nodaJoinery || !naibu || !addNaibu(naibu, 'floor_modular_a', fx, y - .08, fz, x1 - x0, .08, z1 - z0, I.rot)) box((x0 + x1) / 2, y - .04, (z0 + z1) / 2, x1 - x0, .08, z1 - z0, FLOOR);
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
    const upSt = I.stairs[k];
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
    } else {
    const moribeCeiling = I.profile === 'moribe' && ['yashiki', 'hondo'].includes(I.kind);
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
    if (!I.open) {
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

} else {
    // 設楽原の民家は奥の座敷だけ竿縁天井。板間と土間は梁を見せる推定復元。
    if (!I.open && !moribeCeiling) {
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
    for (const st of lv.firingSteps) box(st.x, st.y - .05, st.z, st.w, .1, st.d, DARK);
    // 稲葉山の高画質は共通の室内部品で床板・目地・框を一度だけ納める。
    // 同じ高さに別の板面を重ねると、外陣や縁側でちらつき、上がり框も隠れる。
    // 共通部品も階段口を除いた範囲を使うため、ここでは下地だけを残す。
    if (!(S.quality === 'high' && I.profile === 'inabayama')) {
      // 床板の目地（長い方向へ数本）
      for (const [x0, x1, z0, z1] of lv.pieces) for (let q = -hw + .9; q < x1 - .02; q += .9) if (q > x0 + .02) box(q, y + .002, (z0 + z1) / 2, .02, .006, z1 - z0, 0x4a3828);
    }
    } else if (I.profile === 'moribe') {
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
    if (!I.open) {
      const hole = upSt ? upSt.hole : null, step = ['hondo', 'chudo'].includes(I.kind) ? .75 : goten && !plainCeiling ? .45 : .5;
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
      if (!villageHall && ['hondo', 'chudo'].includes(I.kind)) for (let q = -hd + .75; q < hd - .1; q += .75) box(0, y + h - .02, q, lv.w - .2, .05, .05, 0x2a1c12);
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
    for (const st of lv.firingSteps) box(st.x, st.y - .05, st.z, st.w, .1, st.d, DARK);
    // 設楽原の板目は板間だけに納める。畳の周りの板縁や土間へ同じ目地を通さない。
    const boardPieces = villageHome || villageHall ? floorPieces.flatMap(([x0, x1, z0, z1]) =>
      lv.layout.rooms.filter(r => r.floor === 'boards').map(r =>
        [Math.max(x0, r.x0), Math.min(x1, r.x1), Math.max(z0, r.z0), Math.min(z1, r.z1)])
        .filter(([a, b, c, d]) => b > a && d > c)) : lv.pieces;
    boardFloors[k] = boardPieces;
    // 民家と小堂の床板は一尺ほどの幅。九十センチの大板に見せず、細い継ぎ目で板を割る。
    const boardStep = villageHome || villageHall ? .3 : .9;
    const jointWidth = .02;
    if (villageHome || villageHall) {
      // 民家の板間と小堂の内陣・外陣は四センチ厚の板を張り、三ミリの目地に木口の深さを残す推定復元。
      // 隣の列は継ぎ位置を半間ずらす。上面は既存の歩行面と畳の下端へ揃える。
      // 民家は炉を抜いた床片へ切り詰め、土間・畳・囲炉裏へ板を張り出させない。
      // 天井・板戸と同じ木目と原形を共用し、木目は床板の長手へ通す。
      // 床板だけ一束へ結合し、窓と灯明の頂点色も共通の焼き込みへ渡す。
      const joint = .003, length = 1.8;
      const colors = [0x8a6a48, 0x826344, 0x90704d];
      // 民家と小堂の板床は柱の際で切り欠く。柱脚を床板で覆わず、
      // 小堂の丸柱にも四角い根際の逃げを取り、外周の柱割りに合わせる。
      // 設営時だけ床片を分け、歩行面と床下の受け材はそのまま使う。
      let plankedPieces = boardPieces;
      const notchPost = (x, z, rx, rz) => {
        plankedPieces = plankedPieces.flatMap(([x0, x1, z0, z1]) => {
          const a = Math.max(x0, x - rx), b = Math.min(x1, x + rx);
          const c = Math.max(z0, z - rz), d = Math.min(z1, z + rz);
          if (a >= b || c >= d) return [[x0, x1, z0, z1]];
          return [[x0, a, z0, z1], [b, x1, z0, z1], [a, b, z0, c], [a, b, d, z1]]
            .filter(([a, b, c, d]) => b - a > joint && d - c > joint);
        });
      };
      if (villageHome || villageHall) {
        for (const face of ['z', 'x']) {
          const len = face === 'z' ? lv.w : lv.d;
          const templeBays = villageHall && face === 'z';
          const span = templeBays ? len + .3 : villageHome ? len + .18 : len;
          const bays = Math.max(2, Math.round(span / (templeBays ? 3 : villageHome ? 1.8 : 1.9)));
          for (const side of [-1, 1]) for (let q = 0; q <= bays; q++) {
            const corner = q === 0 || q === bays;
            if (face === 'x' && corner) continue;
            const t = Math.max(-len / 2, Math.min(len / 2, -span / 2 + q * span / bays));
            if (face === 'z' && side === ds && Math.abs(t - I.door.lx) < I.door.w / 2 + .2) continue;
            const x = face === 'z' ? (corner ? Math.sign(t) * (hw - .16) : t) : side * (hw - .16);
            const z = face === 'x' ? t : side * (hd - .16);
            const rx = villageHall || face === 'z' ? .08 : .07;
            const rz = villageHall || face === 'x' || corner ? .08 : .07;
            notchPost(x, z, rx, rz);
          }
        }
      }
      if (villageHome || villageHall) {
        // 民家の間仕切り柱にも、小堂と同じく床板の逃げを取る。
        // 柱割りは固定建具・戸口と揃え、民家は見込み十四センチの角柱に合わせる。
        // 設営時だけ切り分け、敷居・開く戸・歩行面の位置は保つ。
        const postHalfZ = villageHome ? .07 : .06;
        for (const wall of lv.layout.walls) {
          if (wall.guideOnly || !wall.paper || Math.abs(wall.az - wall.bz) > .001) continue;
          const len = Math.abs(wall.bx - wall.ax), center = (wall.ax + wall.bx) / 2;
          const bays = Math.max(1, Math.round(len / 1.8));
          const end = Math.abs(wall.ax) > Math.abs(wall.bx) ? -1 : 1;
          notchPost(center + end * (len / 2 - .06), wall.az, .06, postHalfZ);
          for (let j = 1; j < bays; j++)
            notchPost(center - len / 2 + len * j / bays, wall.az, .06, postHalfZ);
        }
        for (const portal of lv.layout.portals || []) {
          let left = -Infinity, right = Infinity;
          for (const wall of lv.layout.walls) {
            if (wall.guideOnly || !wall.paper || Math.abs(wall.az - portal.z) > .01
                || Math.abs(wall.bz - portal.z) > .01) continue;
            const a = Math.min(wall.ax, wall.bx), b = Math.max(wall.ax, wall.bx);
            if (b <= portal.x + .01) left = Math.max(left, b);
            if (a >= portal.x - .01) right = Math.min(right, a);
          }
          if (Number.isFinite(left) && Number.isFinite(right)) {
            notchPost(left - .06, portal.z, .06, postHalfZ);
            notchPost(right + .06, portal.z, .06, postHalfZ);
          }
        }
      }
      if (villageHall) {
        // 小堂の板端は腰板の内面に沿う床框で受ける推定の納まり。
        // 四周を八センチ幅で組み、前後の木口は側面の框へ突き付ける。
        // 柱脚の切り欠きを共用し、床高・戸口・畳の歩行面は変えない。
        const outerX = hw - .16, outerZ = hd - .16;
        const innerX = outerX - .08, innerZ = outerZ - .08;
        const rims = [
          [-outerX, -innerX, -outerZ, outerZ], [innerX, outerX, -outerZ, outerZ],
          [-innerX, innerX, -outerZ, -innerZ], [-innerX, innerX, innerZ, outerZ],
        ];
        for (const [x0, x1, z0, z1] of plankedPieces) for (const [rx0, rx1, rz0, rz1] of rims) {
          const a = Math.max(x0, rx0), b = Math.min(x1, rx1);
          const c = Math.max(z0, rz0), d = Math.min(z1, rz1);
          if (b - a <= joint || d - c <= joint) continue;
          entryTimber((a + b) / 2, y - .02, (c + d) / 2,
            b - a, .04, d - c, 0x795b3b);
        }
        // 仕上げ板も框の内面で止め、同じ高さの面を重ねない。
        plankedPieces = plankedPieces.map(([x0, x1, z0, z1]) => [
          Math.max(x0, -innerX), Math.min(x1, innerX),
          Math.max(z0, -innerZ), Math.min(z1, innerZ),
        ]).filter(([a, b, c, d]) => b - a > joint && d - c > joint);
      }
      for (let col = 0; col < Math.ceil(lv.w / boardStep); col++) {
        const left = -hw + col * boardStep, right = Math.min(hw, left + boardStep);
        for (const [x0, x1, z0, z1] of plankedPieces) {
          const a = Math.max(left, x0), b = Math.min(right, x1);
          if (b - a <= joint) continue;
          let back = z0, piece = 0;
          const place = front => {
            if (front - back > joint) {
              const plank = templeCeilingBoard(front - back - joint, b - a - joint, 0xffffff, .04);
              if (!M.woodFloor) {
                M.woodFloor = plank.material.clone();
                M.woodFloor.vertexColors = true;
              }
              put(plank.geometry.clone().rotateY(Math.PI / 2),
                (a + b) / 2, y - .02, (back + front) / 2,
                colors[(col + piece++) % colors.length], false, woodFloorList);
            }
            back = front;
          };
          for (let z = -hd + (col % 2 ? length / 2 : length); z < z1; z += length)
            if (z > z0) place(z);
          place(z1);
        }
      }
    } else for (const [x0, x1, z0, z1] of boardPieces) for (let q = -hw + boardStep; q < x1 - .02; q += boardStep) if (q > x0 + .02) box(q, y + .002, (z0 + z1) / 2, jointWidth, .006, z1 - z0, 0x4a3828);

}
    }
    // 引き戸の引きしろの両端を敷居から鴨居までの戸当たりで結ぶ。
    // 外戸・間仕切り・明かり障子で同じ溝と開き幅を使い、
    // 止め木は動く戸と分けて既存の静止した室内の束へまとめる。
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
    // 梁（天井の下の横木。階段の口の上は通さない）と、桁（長い向きの太い横木）
    // 御殿・堂は梁を天井の上に隠す（書院造）。櫓・天守と、天井を張らない建物だけ梁と桁を見せる
    // 設楽原の民家は外観側の小屋梁・叉首・母屋・垂木を室内からも使う。
    // 別の柱割りと勾配の木組みを重ねず、座敷の竿縁天井だけをここで作る。
    const showBeams = !villageHome && (!goten || I.open || plainCeiling || (I.profile === 'anegawa' && I.kind === 'nagaya')
      || (I.profile === 'kanegasaki' && ['bansho', 'kura', 'nagaya'].includes(I.kind)));
    // 稲葉山の用屋は壁の柱筋へ梁を載せる。等間隔の別割りで柱間へ浮かせない。
    const inabaBeamFrame = inabaBoards && plainCeiling;
    const beamBays = Math.max(2, Math.round(lv.w / 1.9));
    const beamStart = inabaBeamFrame ? -hw + lv.w / beamBays : -hw + .8;
    const beamStep = inabaBeamFrame ? lv.w / beamBays : 1.7;
    if (showBeams && !igaOpenRoof) for (let q = beamStart; q < hw - .3; q += beamStep) {
      if (upSt && q > upSt.hole.x0 - 0.15 && q < upSt.hole.x1 + 0.15) continue;
      const [wx, wz] = I.P(q, 0);
      if (!naibu || !addNaibu(naibu, 'beam', wx, y + h - .25, wz, .17, .24, lv.d - .2, I.rot)) box(q, y + h - 0.13, 0, 0.17, 0.24, lv.d - .2, DARK);
    }
    if (showBeams && !igaOpenRoof) { box(0, y + h - 0.1, hd * 0.55, lv.w - 0.2, 0.2, 0.15, DARK); box(0, y + h - 0.1, -hd * 0.55, lv.w - 0.2, 0.2, 0.15, DARK); }
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
      const holes = wins.filter((o) => o.face === face && o.s === sd && (!o.shoji || o.sliding || I.templePaper)).map((o) => ({ t0: o.t - o.w / 2, t1: o.t + o.w / 2, y0: o.y0, y1: o.y1 }));
      if (k === 0 && face === 'z' && sd === ds) holes.push({ t0: I.door.lx - I.door.w / 2, t1: I.door.lx + I.door.w / 2, y0: I.door.rail || 0, y1: I.door.h ?? Math.min(h - 0.3, 2.0) });
      // 設楽原の小堂は外壁と同じ三間の柱割り。内寸だけで割ると柱が明かり障子を貫く。
      const templeBays = S.quality === 'high' && I.profile === 'shitaragahara' && I.kind === 'hondo' && face === 'z';
      // 民家の側壁も外観と同じ一間割りにする。内寸を一・九メートルで割ると、
      // 側面だけ柱と小屋梁の通りがずれ、一本の柱が内外で二本に見える。
      const homeBays = villageHome;
      const span = templeBays ? len + .3 : homeBays ? len + .18 : len;
      const n = Math.max(2, Math.round(span / (templeBays ? 3 : homeBays ? 1.8 : 1.9)));
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
      if (nodaJoinery) {
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
      // 腰板（櫓・天守：壁の下の一間ほどは板張り、上は漆喰。戸口の所は空ける）
      // 伊賀の民家・陣小屋・番所は上で全面の板壁と押縁を組んでいる。
      // 共通の腰板を重ねると下半分の木肌を覆い、押縁の脇にも余分な目地が出る。
      if (!goten && !igaBoardWall) {
        const wb = (t0, t1) => { if (t1 - t0 < 0.05) return; const tm = (t0 + t1) / 2, tw = t1 - t0; if (face === 'z') box(tm, y + 0.55, sd * (off - 0.03), tw, 1.1, 0.04, BOARD); else box(sd * (off - 0.03), y + 0.55, tm, 0.04, 1.1, tw, BOARD); };
        for (const [a, b, low, high] of facePanels(len, 1.1, holes)) { if (low === 0 && high === 1.1) wb(a, b); else { const mid = (a + b) / 2; if (face === 'z') box(mid, y + (low + high) / 2, sd * (off - .03), b - a, high - low, .04, BOARD); else box(sd * (off - .03), y + (low + high) / 2, mid, .04, high - low, b - a, BOARD); } }
        // 板の継ぎ目（縦）
        for (let t = -len / 2 + 0.45; t < len / 2 - 0.2; t += 0.45) { if (holes.some(v => t > v.t0 - .02 && t < v.t1 + .02 && v.y0 < 1.1)) continue; if (face === 'z') box(t, y + 0.55, sd * (off - 0.055), 0.015, 1.08, 0.01, 0x3a2a1c); else box(sd * (off - 0.055), y + 0.55, t, 0.01, 1.08, 0.015, 0x3a2a1c); }
      }
      // 柱：隅と窓の両脇。長押（横の木）
if (nodaJoinery) {
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
          } else if (face === 'z') {
            entryTimber(head, y + h - .13, sd * (off - .06), .34, .04, .24, DARK);
            entryTimber(head, y + h - .095, sd * (off - .06), .44, .03, .24, DARK);
          } else {
            entryTimber(sd * (off - .06), y + h - .13, head, .24, .04, .34, DARK);
            entryTimber(sd * (off - .06), y + h - .095, head, .24, .03, .44, DARK);
          }
        }
      }
      if (I.profile === 'shitaragahara' && S.quality === 'high') {
        // 間仕切りと外周の内法長押を同じ高さで結ぶ。堂の窓の途中で横木を途切れさせない。
        // 戸口や窓が長押まで届く場合は、その開口だけを避ける。
        // 長押を柱芯から室内へ寄せ、柱の面より二センチ出して抱かせる。
        // 柱芯のままでは柱の見込みに埋まり、横木の端が柱際で消えてしまう。
        // 長押の上端は天井から十六センチ下。回縁の下面との間を七センチ空ける。
        // 間仕切り側と揃え、小堂の肘木や民家の竿縁天井へ横木を重ねない。
        const railY = Math.min(interiorPartitionHeight(lv.layout, h) + .42, h - .22), band = .12;
        // 長押を柱へ留める無紋の鉄金具。民家は堂より小さく、間仕切りと同じ寸法で納める推定。
        // 長押の室内側の面へ据え、柱や横木の中へ埋めない。静止した内装の束にまとめる。
        if (villageHall || villageHome) for (let q = 0; q <= n; q++) {
          const nailD = villageHome ? .008 : .012, nailOff = off - .14 - nailD / 2;
          if (face === 'x' && (q === 0 || q === n)) continue;
          const t = Math.max(-len / 2, Math.min(len / 2, -span / 2 + q * span / n));
          // 戸口のため省いた柱には釘隠しも付けない。鴨居より上に
          // 長押が通っていても、柱のない位置へ金具だけを残さない。
          if (k === 0 && face === 'z' && sd === ds && Math.abs(t - I.door.lx) < I.door.w / 2 + .2) continue;
          if (holes.some(v => t > v.t0 - .035 && t < v.t1 + .035
            && v.y0 < railY + .035 && v.y1 > railY - .035)) continue;
          if (face === 'z') {
            const x = q === 0 || q === n ? Math.sign(t) * (hw - .16) : t;
            nageshiNail(ceilingBoards, villageHome, x, y + railY, sd * nailOff,
              -sd * Math.atan(.02 / band));
          } else nageshiNail(ceilingBoards, villageHome, sd * nailOff, y + railY, t,
            -sd * Math.atan(.02 / band), true);
        }
        for (const [a, b, lo, hi] of facePanels(len, band, holes.filter(v => v.y0 < railY + band / 2 && v.y1 > railY - band / 2)
          .map(v => ({ ...v, y0: 0, y1: band })))) {
          // 柱と腰板だけでなく長押も同じ木地にする。木目は原形の長手へ通し、
          // 既存の床板・壁板の束へまとめる。隅の削ぎ合わせと開口の切り欠きは保つ。
          const railList = villageHome || villageHall ? woodFloorList : list;
          if (face === 'z') put(nageshiGeometry(b - a, hi - lo, .1, -sd),
            (a + b) / 2, y + railY + (lo + hi - band) / 2, sd * (off - .10), DARK, false, railList);
          else {
            // 正面・背面の長押を通し、側面の木口をその内面へ突き付ける。
            // 壁から二十センチ内側の芯と厚み五センチを差し引く。
            // 四隅で同じ高さの横木を交差させると、上下面が重なってちらつく。
            const end = hd - .25, left = Math.max(a, -end), right = Math.min(b, end);
            if (right > left) {
              const rail = nageshiGeometry(right - left, hi - lo, .1, -sd).rotateY(Math.PI / 2);
              // 正背面の長押は下端ほど薄い。側面の木口もその勾配へ
              // 合わせ、隅の下側に二センチの三角の隙間を残さない。
              // 開口で切れた木口は伸ばさず、四隅に接する端だけを削ぎ合わせる。
              const vertices = rail.attributes.position;
              for (let j = 0; j < vertices.count; j++) {
                const z = vertices.getZ(j), localY = vertices.getY(j);
                const extend = .02 * (band - lo - hi) / (2 * band) - .02 * localY / band + .01;
                if (left === -end && z < 0) vertices.setZ(j, z - extend);
                if (right === end && z > 0) vertices.setZ(j, z + extend);
              }
              rail.computeVertexNormals();
              put(rail, sd * (off - .10), y + railY + (lo + hi - band) / 2, (left + right) / 2, DARK, false, railList);
            }
          }
        }
      } else {
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
      const across = o.face === 'z' ? 'x' : 'z';
      const depthAxis = o.face === 'z' ? 'z' : 'x';
      if (o.sliding) {
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
      } else {
        // 格子（縦の木。間から外が見える）と、窓の下の敷居
if (nodaJoinery) {
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
if (I.profile === 'hieizan') {
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
      winPts.push([px, y + (o.y0 + o.y1) / 2, pz, o.shoji || I.profile === 'iga' && I.kind === 'yashiki' ? 0.7 : 1]);
    }
    // 窓からの光の筋（一つの階に三つまで）
    let ns = 0;
    for (const o of wins) {
      // 伊賀の窓は引き戸で塞がるため、閉じた板戸を貫く固定の光筋を置かない。
      if (ns >= 3 || o.shoji || o.shutter || I.open || I.profile === 'iga') continue;
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
    } else {
    // 灯明（台と火袋）。中は暗いので一つの階に一つか二つ
if (nodaJoinery || I.profile === 'hieizan' || I.profile === 'inabayama') {
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
    } else if (I.profile === 'moribe') {
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
      const [wx, wz] = I.P(lx, lz), sp = new THREE.Sprite(M.glow); sp.position.set(wx, flameY, wz); sp.scale.setScalar(I.lampGlowScale ?? 0.8); sp.renderOrder = 4; grp.add(sp); I.glows.push(sp);
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
    // 森部の堂・在所は専用の須弥壇・座卓・木櫃でしつらえる。
    // 共通の槍掛けと旗を足すと、本尊の背板や座敷の調度へ重なる。
    // 武具：槍掛けに数本（天守・櫓）。御殿の奥の間は一段高い上段
    }
    if (!goten && !['iga', 'hieizan', 'moribe'].includes(I.profile) && lv.w > 2.5) {
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
  if (!nodaJoinery && !['yagura', 'iga', 'hieizan', 'moribe'].includes(I.profile) && cgtOn() && cgtHas('Floor_Boards')) {
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
      const pieces = villageFloor ? boardFloors[k] : lv.pieces;
      for (const [x0, x1, z0, z1] of pieces) {
        const nx = Math.max(1, Math.round((x1 - x0) / 2)), nz = Math.max(1, Math.round((z1 - z0) / 2)), cw = (x1 - x0) / nx, cd = (z1 - z0) / nz;
        for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
          const [wx, wz] = I.P(x0 + i * cw, z1 - j * cd);
          const floor = interiorFloorAt(lv.layout, x0 + (i + .5) * cw, z1 - (j + .5) * cd);
          if (floor === 'earth' || floor === 'tatami') continue; // 畳と土間は共通部品で敷いてある
          kb.add('Floor_Boards', wx, lv.y + 0.006, wz, I.rot, cw / 2, 0.12, cd / 2);
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
      const { pad, len, gy } = I.approach, rise = lv.y - gy, n = Math.max(3, Math.round(rise / 0.28));
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

      // 御影堂も正面の木の縁へ木階段で上がる推定復元。
      // 僧坊・庫裏、砦の詰所・用屋と河口の民家は同じ踏板とささら桁を使う。
      // 石の塊を木色へ替えるだけにせず、床下を空け、歩く斜面は既存のものを保つ。
      const timberEntry = S.quality === 'high' && I.profile === 'nodafukushima'
        && ['hondo', 'sobo', 'kuri', 'goten', 'bansho', 'nagaya', 'kura', 'minka'].includes(I.kind);
      const stone = !timberEntry && I.kind !== 'goten' && I.kind !== 'gate';
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
        put(g, I.door.lx, lv.y - .06, landingZ, stone ? 0x847c70 : 0x4e3c2a);
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
  if (I.disabled || (!rt.def.town && !villageEntry && !['iga', 'moribe'].includes(I.profile))) return null;
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
    for (let i = 0; i < I.glows.length; i++) { const sp = I.glows[i], t = NAKA.t * 7 + i * 1.7 + I.id; sp.visible = !rt.camera || sp.position.distanceTo(rt.camera.position) > 1.6; sp.scale.setScalar((S.reduceMotion || REDUCE_MOTION?.matches ? .78 : 0.78 + Math.sin(t) * 0.04 + Math.sin(t * 2.3) * 0.03) * (sp.userData.glowScale / .8)); }
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
    if (I.profile === 'moribe' || S.quality === 'high' && I.profile === 'shitaragahara') continue;
    
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

  }
  if (landingShape) landingShape.dispose();
  if (list.length) {
    const mesh = new THREE.Mesh(mergeGeometries(list), mats().door);
    mesh.castShadow = mesh.receiveShadow = true; mesh.matrixAutoUpdate = false;
    rt.scene.add(mesh);
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
