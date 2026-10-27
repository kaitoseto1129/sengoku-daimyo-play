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
import { interiorLayout, interiorFloorAt, shitaragaharaTempleMats, shitaragaharaHomePanels, interiorPartitionHeight, interiorPartitionHeaders, interiorPartitionSpans, interiorWaypoint, prepareInteriorPaths } from './interior_layouts.js';
import { inabaBoardTexture, INABA_ALTAR_SUSPENSION_DROP, inabaAltarBackHeight, tomyo, lightPool, furnishLayout, nageshiGeometry, nageshiNail, templeCeilingBoard, templeRoundPost, timberBox, batchInterior, SHITARAGAHARA_CEILING_LIFT, hieiAltarLamps, hieiNageshiHeight, hieiPartitionHeight, HIEI_DOOR_TRACK, HIEI_ENTRY_TRACK, HIEI_SOBO_SILL } from './interior_parts.js';
import { setInteriorSound } from './audio.js';
import { S } from './settings.js';
import { woodTex } from './nature.js';
import { addNaibu, addNaibuStairs } from './naibu_kit.js';
import { cgtOn, cgtHas, KitBatch } from './cgt.js';   // 買った素材（床・畳・武器の棚）
import { yaguraTick } from './yagura_play.js';
import { addNakaDoors, buildNakaDoorMeshes, nakaDoorTick, resetNakaDoors } from './naka_doors.js';
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
    // 二組の戸の間に、閉じた障子にも触れず立てる土間を残す。
    const entryDepth = S.quality === 'high' && I.profile === 'shitaragahara' && I.kind === 'minka' ? 1.65 : null;
    lv.layout = interiorLayout(I.kind, lv.w, lv.d, { oku: I.oku || .4, side: ds, profile: I.profile, entryX: I.door.lx, entryDepth, entryW: I.door.w, raisedTatami: I.profile === 'inabayama' && S.quality === 'high', slidingWindows: I.templePaper });
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
      const id = addDeck({ x0: -(x1 - x0) / 2, x1: (x1 - x0) / 2, z0: -(z1 - z0) / 2, z1: (z1 - z0) / 2, rot, cx, cz, y: lv.y + floorY, name: `${I.name} ${k + 1}階`, roof: lv.y + lv.h, pad: earth ? 0 : undefined });
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
if (I.profile === 'hieizan') {
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
    let entryZ = hd0 - (I.profile === 'moribe' && ['yashiki', 'hondo'].includes(I.kind) ? .5 : 1.1);
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
  const M = mats(), list = [], woodFloorList = [], timbers = [], lamps = [], winPts = [], paper = [], ceilingWood = [];
  const naibu = I.profile || ['yagura', 'gate'].includes(I.kind) ? new KitBatch() : null;
  const smokeSources = [];
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
    g.rotateY(I.rot); g.translate(I.x, 0, I.z); target.push(g);
  };
  // 比叡山は天井板・格縁・柱も共通の箱から寸法を取ってまとめる。
  const floorBoardShape = I.profile === 'hieizan' ? new THREE.BoxGeometry(1, 1, 1) : null;
  const box = (lx, y, lz, w, h, d, hex, emit, grainAxis = null) => {
    const g = floorBoardShape ? floorBoardShape.clone().scale(w, h, d) : new THREE.BoxGeometry(w, h, d);
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
  const grp = new THREE.Group(), ceilingBoards = new THREE.Group();
  // 設楽原の戸口枠・窓の見込み板・天井の縁も、動く建具と同じ木目を長手へ通す。
  // 天井板の束へまとめ、寸法別の原形と材質を共用する。近づいた時に一度だけ作る。
  const entryTimber = (x, y, z, w, h, d, color) =>
    timberBox(ceilingBoards, w, h, d, x, y, z, color);
  const Ls = I.levels, ds = I.door.side, boardFloors = [];
  const goten = !['tenshu', 'yagura', 'gate'].includes(I.kind);
  const paperWindows = I.templePaper || I.profile === 'moribe';
  // 稲葉山の用屋と小祠は板張りと貫で納め、座敷の白壁・長押を使わない。
  const inabaBoards = S.quality === 'high' && I.profile === 'inabayama' && ['kura', 'bansho', 'nagaya', 'shrine'].includes(I.kind);
  const plainCeiling = I.profile === 'inabayama' && ['kura', 'bansho'].includes(I.kind)
    || I.profile === 'shitaragahara' && I.kind === 'minka'
    || I.profile === 'echizen_ikko' && I.kind === 'bansho'
    || ['nodafukushima', 'usayama', 'iga', 'takato', 'tottori'].includes(I.profile) && ['kura', 'bansho', 'nagaya'].includes(I.kind)
    || I.profile === 'iwamura_' + I.kind && ['kura', 'bansho', 'nagaya'].includes(I.kind);
  const WOOD = 0x6a5038, DARK = 0x3a2a1c, WALL = I.sgOverhead ? 0x817967 : goten ? 0xb8ab90 : 0xa89a80, FLOOR = 0x8a6a48, BOARD = I.sgOverhead ? 0x514b3d : 0x6a5238;
  for (let k = 0; k < Ls.length; k++) {
    const lv = Ls[k], hw = lv.w / 2, hd = lv.d / 2, h = lv.h, y = lv.y;
    // 座敷の長押は回縁の下へ二センチ空け、間仕切り（interior_parts.js）と揃える。
    const lowNageshi = S.quality === 'high' && I.profile === 'inabayama' && ['goten', 'tamari'].includes(I.kind);
    const nageshiH = lowNageshi ? .08 : .12, nageshiOffset = lowNageshi ? .14 : .1;
    const decor = furnishLayout(lv.layout, h, { partitions: true, dim: true });
    decor.position.set(I.x, y, I.z); decor.rotation.y = I.rot; grp.add(decor);
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
      else if (!naibu || !addNaibu(naibu, 'floor_modular_a', fx, y - .08, fz, x1 - x0, .08, z1 - z0, I.rot)) box((x0 + x1) / 2, y - .04, (z0 + z1) / 2, x1 - x0, .08, z1 - z0, FLOOR);
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
    const moribeCeiling = I.profile === 'moribe' && ['yashiki', 'hondo'].includes(I.kind);
    const upSt = I.stairs[k];
    // 設楽原の民家は奥の座敷だけ竿縁天井。板間と土間は梁を見せる推定復元。
    const parlor = villageHome ? lv.layout.rooms.find(r => r.floor === 'tatami') : null;
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
    // 梁（天井の下の横木。階段の口の上は通さない）と、桁（長い向きの太い横木）
    // 御殿・堂は梁を天井の上に隠す（書院造）。櫓・天守と、天井を張らない建物だけ梁と桁を見せる
    // 設楽原の民家は外観側の小屋梁・叉首・母屋・垂木を室内からも使う。
    // 別の柱割りと勾配の木組みを重ねず、座敷の竿縁天井だけをここで作る。
    const showBeams = !villageHome && (!goten || I.open || plainCeiling || (I.profile === 'anegawa' && I.kind === 'nagaya'));
    // 稲葉山の用屋は壁の柱筋へ梁を載せる。等間隔の別割りで柱間へ浮かせない。
    const inabaBeamFrame = inabaBoards && plainCeiling;
    const beamBays = Math.max(2, Math.round(lv.w / 1.9));
    const beamStart = inabaBeamFrame ? -hw + lv.w / beamBays : -hw + .8;
    const beamStep = inabaBeamFrame ? lv.w / beamBays : 1.7;
    if (showBeams) for (let q = -hw + 0.8; q < hw - 0.3; q += 1.7) {
      if (upSt && q > upSt.hole.x0 - 0.15 && q < upSt.hole.x1 + 0.15) continue;
      const [wx, wz] = I.P(q, 0);
      if (!naibu || !addNaibu(naibu, 'beam', wx, y + h - .25, wz, .17, .24, lv.d - .2, I.rot)) box(q, y + h - 0.13, 0, 0.17, 0.24, lv.d - .2, DARK);
    }
    if (showBeams) for (const z of [hd * .55, -hd * .55])
      box(0, y + h - .1, z, lv.w - .2, .2, .15, DARK);
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
      } else if (face === 'z') box(0, y + h * 0.8, sd * (off - 0.06), len, 0.1, 0.1, DARK); else box(sd * (off - 0.06), y + h * 0.8, 0, 0.1, 0.1, len, DARK);
      // 民家は土間の低さに合わせた地覆、小堂は腰板の地覆で足元を受ける。
      // 共通の巾木を重ねると、土間だけ板間の高さに横木が浮き、柱にも食い込む。
      if (!villageHall && !villageHome) for (const [a, b, low, high] of facePanels(len, .12, holes)) { if (face === 'z') box((a + b) / 2, y + (low + high) / 2, sd * (off - .03), b - a, high - low, .05, DARK); else box(sd * (off - .03), y + (low + high) / 2, (a + b) / 2, .05, high - low, b - a, DARK); }

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
    // 灯明（台と火袋）。中は暗いので一つの階に一つか二つ
if (I.profile === 'hieizan' || I.profile === 'inabayama') {
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
    const ln = altarLamps.length || (goten || lv.w > 6 ? 2 : 1);
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
    if (!goten && !['hieizan', 'moribe'].includes(I.profile) && lv.w > 2.5) {
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
  for (const g of [...list, ...woodFloorList, ...timbers]) {
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
  if (!['yagura', 'moribe'].includes(I.profile) && cgtOn() && cgtHas('Floor_Boards')) {
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
  const m = new THREE.Mesh(mergeGeometries(list.filter(g => !textured.has(g) && !g.userData.ceilingWood && !g.userData.earthenWall)), I.profile === 'hieizan' ? M.hieiBase : M.base);
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
  if (I.disabled || (!rt.def.town && !villageEntry && I.profile !== 'moribe')) return null;
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
