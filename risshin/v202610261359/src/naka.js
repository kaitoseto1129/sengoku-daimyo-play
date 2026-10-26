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
import { interiorLayout, interiorFloorAt, interiorWaypoint, prepareInteriorPaths } from './interior_layouts.js';
import { furnishLayout, hieiAltarLamps, hieiNageshiHeight, hieiPartitionHeight, HIEI_DOOR_TRACK, HIEI_ENTRY_TRACK, HIEI_SOBO_SILL } from './interior_parts.js';
import { setInteriorSound } from './audio.js';
import { S } from './settings.js';
import { woodTex } from './nature.js';
import { addNaibu, addNaibuStairs } from './naibu_kit.js';
import { cgtOn, cgtHas, KitBatch } from './cgt.js';   // 買った素材（床・畳・武器の棚）
import { yaguraTick } from './yagura_play.js';
import { addNakaDoors, buildNakaDoorMeshes, nakaDoorTick, resetNakaDoors } from './naka_doors.js';

const REDUCE_MOTION = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;

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
    lv.layout = interiorLayout(I.kind, lv.w, lv.d, { oku: I.oku || .4, side: ds, profile: I.profile, entryX: I.door.lx });
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
    for (const [x0, x1, z0, z1] of lv.pieces) {
      const [cx, cz] = I.P((x0 + x1) / 2, (z0 + z1) / 2);
      const id = addDeck({ x0: -(x1 - x0) / 2, x1: (x1 - x0) / 2, z0: -(z1 - z0) / 2, z1: (z1 - z0) / 2, rot, cx, cz, y: lv.y, name: `${I.name} ${k + 1}階`, roof: lv.y + lv.h });
      FL.decks[id].interior = true;
      const a = (x1 - x0) * (z1 - z0);
      if (a > area) { area = a; main = id; }
    }
    I.deckIds.push(main);
    lv.layout.floorPieces = lv.pieces;
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
    if (lv.drop) lv.layout.props = lv.layout.props.filter(p => !(p.x + p.w / 2 + .3 > lv.drop.x0 && p.x - p.w / 2 - .3 < lv.drop.x1 + 1.3 && p.z + p.d / 2 + .3 > lv.drop.z0 && p.z - p.d / 2 - .3 < lv.drop.z1));
    const y0 = lv.y - 1.2, y1 = lv.y + lv.h, iw = hw - 0.08, id = hd - 0.08;
    // 外壁の当たりも狭間を抜く。兵の足は腰壁が止め、筒先と矢は穴を通る。
    const wins = windowsFor(I, lv, k);
    const opening = wins.reduce((n, v) => n + v.w * Math.max(0, v.y1 - v.y0) * (v.shoji ? .45 : 1), 0);
    const light = Math.min(1, opening / Math.max(1, lv.w * lv.d * .12));
    lv.layout.dim = Math.min(.85, .28 + light * (world.def.time === 'night' ? .1 : world.def.time === 'dusk' ? .3 : .5));
    for (const face of ['x', 'z']) for (const sd of [-1, 1]) {
      const len = face === 'z' ? lv.w : lv.d, off = face === 'z' ? id : iw;
      const holes = wins.filter(v => v.face === face && v.s === sd && (!v.shoji || I.profile === 'hieizan' && I.kind === 'sobo'))
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
      for (let q = -1; q <= 1; q++) {
        const t = v.t + q * v.w * .3;
        if (v.face === 'z') seg(I, t, off - .025, t, off + .025, lv.y + v.y0, lv.y + v.y1, .025);
        else seg(I, off - .025, t, off + .025, t, lv.y + v.y0, lv.y + v.y1, .025);
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
    if (I.kind === 'goten' && lv.layout.rooms[0].raised !== false) {
      const r = lv.layout.rooms[0];
      for (const v of lv.pieces) {
        const x0 = Math.max(r.x0 + .15, v[0]), x1 = Math.min(r.x1 - .15, v[1]), z0 = Math.max(r.z0 + .2, v[2]), z1 = Math.min(r.z1 - .2, v[3]);
        if (x1 <= x0 || z1 <= z0) continue;
        const [cx, cz] = I.P((x0 + x1) / 2, (z0 + z1) / 2);
        const id = addDeck({ cx, cz, x0: -(x1 - x0) / 2, x1: (x1 - x0) / 2, z0: -(z1 - z0) / 2, z1: (z1 - z0) / 2, rot, y: lv.y + .16, roof: lv.y + lv.h, name: '上段の間' });
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
    for (const v of lv.layout.walls) {
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
    }
    addNakaDoors(I, lv, y0, y1);   // 間仕切りの口に引き戸（naka_doors.js）
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
    if (k === 0) lv.layout.props = lv.layout.props.filter(p => !(p.x + p.w / 2 + .5 > I.door.lx - I.door.w / 2
      && p.x - p.w / 2 - .5 < I.door.lx + I.door.w / 2
      && ds * p.z + p.d / 2 + .5 > hd - 1.6));
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
      const ww = p.w ?? (p.part === 'alcove' ? 2.3 : p.part === 'altar' ? 2.1 : p.part === 'desk' ? 1.2 : p.part === 'counter' ? 1.1 : .85);
      const dd = p.d ?? (p.part === 'alcove' ? .85 : p.part === 'altar' ? 1 : .7);
      const top = lv.y + (p.y || 0) + p.h + (p.part === 'stones' ? .18 : p.part === 'ammo' ? .05 : 0);
      const x0 = p.x - ww / 2, x1 = p.x + ww / 2, z0 = p.z - dd / 2, z1 = p.z + dd / 2;
      seg(I, x0, z0, x1, z0, lv.y - .4, top, .04);
      seg(I, x0, z1, x1, z1, lv.y - .4, top, .04);
      seg(I, x0, z0, x0, z1, lv.y - .4, top, .04);
      seg(I, x1, z0, x1, z1, lv.y - .4, top, .04);
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
    I.approach = { pad, len, gy };
    addRamp({ ax: bx, az: bz, bx: tx, bz: tz, w: I.door.w + 0.3, ya: gy, yb: L0.y, inner: true });   // 横からは乗らない（下の端から上る）
    const [cx, cz] = I.P(I.door.lx, ds * (hd0 + pad / 2 - 0.1));
    addDeck({ x0: -(I.door.w + 0.4) / 2, x1: (I.door.w + 0.4) / 2, z0: -(pad + 0.4) / 2, z1: (pad + 0.4) / 2, rot, cx, cz, y: L0.y, name: `${I.name}の戸口` });
    const [ox, oz] = I.P(I.door.lx, ds * (hd0 + pad + len + 0.8));
    I.doorOut = { x: ox, z: oz };
  } else {
    const [ox, oz] = I.P(I.door.lx, ds * (hd0 + 1.2));
    I.doorOut = { x: ox, z: oz };
  }
  {
    let depth = 1.1;
    if (I.profile === 'hieizan' && I.kind === 'sobo') {
      // 正面戸を開けても、閉じた座敷の障子を越えて入室させない。
      // 実際の二組の戸の中間を立ち所にし、出る札もこの板間からだけ使う。
      const inner = I.doors?.find(d => !d.entry && d.kind === 'shoji');
      const outer = I.doors?.find(d => d.entry);
      if (inner && outer) {
        const landing = (inner.lz + outer.lz) * ds / 2;
        depth = hd0 - landing;
        I.entryLimit = inner.lz * ds + .2;
      }
    }
    const [ix, iz] = I.P(I.door.lx, ds * (hd0 - depth));
    I.doorIn = { x: ix, z: iz, y: L0.y };
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
  I.lordSpot = { x: sp[0], z: sp[1], y: top.y + (room?.y || 0) };
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
    return setWay(local.x, local.z, r.lv.y);
  };
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
let MAT = null;
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
  const M = mats(), list = [], timbers = [], lamps = [], winPts = [], paper = [];
  const naibu = I.profile || ['yagura', 'gate'].includes(I.kind) ? new KitBatch() : null;
  const put = (g, lx, y, lz, hex, emit) => { g.translate(lx, y, lz); g.rotateY(I.rot); g.translate(I.x, 0, I.z); list.push(colorize(g, hex, emit)); };
  // 比叡山は天井板・格縁・柱も共通の箱から寸法を取ってまとめる。
  const floorBoardShape = I.profile === 'hieizan' ? new THREE.BoxGeometry(1, 1, 1) : null;
  const box = (lx, y, lz, w, h, d, hex, emit) => {
    const g = floorBoardShape ? floorBoardShape.clone().scale(w, h, d) : new THREE.BoxGeometry(w, h, d);
    const red = hex >> 16 & 255, green = hex >> 8 & 255, blue = hex & 255;
    // 比叡山の茶色い木部だけに木肌を付け、白壁・石・金具の色は保つ。
    // 材の長手へ木目を通し、床板・格天井・竿縁・梁で同じ縮尺を使う。
    // 設営時に貼り方を決め、一棟一束・全棟共通の材質で描く。
    if (floorBoardShape && !emit && red > green * 1.18 && green > blue * 1.15) {
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
  const grp = new THREE.Group();
  const Ls = I.levels, ds = I.door.side;
  const goten = !['tenshu', 'yagura', 'gate'].includes(I.kind);
  const plainCeiling = I.profile === 'inabayama' && ['kura', 'bansho'].includes(I.kind)
    || I.profile === 'echizen_ikko' && I.kind === 'bansho'
    || ['nodafukushima', 'usayama', 'iga', 'takato'].includes(I.profile) && ['kura', 'bansho', 'nagaya'].includes(I.kind)
    || I.profile === 'iwamura_' + I.kind && ['kura', 'bansho', 'nagaya'].includes(I.kind);
  const WOOD = 0x6a5038, DARK = 0x3a2a1c, WALL = I.sgOverhead ? 0x817967 : goten ? 0xb8ab90 : 0xa89a80, FLOOR = 0x8a6a48, BOARD = I.sgOverhead ? 0x514b3d : 0x6a5238;
  for (let k = 0; k < Ls.length; k++) {
    const lv = Ls[k], hw = lv.w / 2, hd = lv.d / 2, h = lv.h, y = lv.y;
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
    for (const [x0, x1, z0, z1] of lv.pieces) {
      const [fx, fz] = I.P((x0 + x1) / 2, (z0 + z1) / 2);
      if (!naibu || !addNaibu(naibu, 'floor_modular_a', fx, y - .08, fz, x1 - x0, .08, z1 - z0, I.rot)) box((x0 + x1) / 2, y - .04, (z0 + z1) / 2, x1 - x0, .08, z1 - z0, FLOOR);
    }
    const upSt = I.stairs[k];
    if (!I.open) for (const [x0, x1, z0, z1] of rectMinus(hw, hd, upSt ? upSt.hole : null)) box((x0 + x1) / 2, y + h + 0.03, (z0 + z1) / 2, x1 - x0, 0.06, z1 - z0, goten ? 0x7a6448 : DARK);
    // 天井の作り：御殿は竿縁天井（一尺五寸ごとの細い竿縁と回縁）、櫓・天守は上の床を支える根太を見せる
    if (!I.open) {
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
      if (['hondo', 'chudo'].includes(I.kind)) for (const zone of ceilingZones) for (let q = zone.z0 + zone.grid; q < zone.z1 - (hieiHall ? .001 : .1); q += zone.grid) {
        if (hieiHall) {
          // 同じ高さの格縁を交差部で重ねると、下面がちらつく。
          // 横の格縁は縦の格縁・回縁の側面までとし、格間の内寸へ納める。
          // 設営時のまとめ描きに含め、動く間の形や材質は増やさない。
          const bays = Math.max(1, Math.round((lv.w - .2) / gridX));
          for (let i = 0; i < bays; i++) {
            // 横の格縁にも板受けを通す。上下それぞれの材の側面で止め、
            // 縦の格縁・回縁との交点に同じ面を重ねない。
            for (const [edge, half, cy, depth, width] of [
              [.08, .05, y + h - .065, .09, .1],
              [.06, .0375, y + h - .01, .02, .075],
            ]) {
              const a = -hw + .1 + i * gridX + (i === 0 ? edge : half);
              const b = -hw + .1 + (i + 1) * gridX - (i === bays - 1 ? edge : half);
              if (b > a) box((a + b) / 2, cy, q, b - a, depth, width, 0x2a1c12);
            }
            // 横格縁の木口を突き付けるだけにせず、細い枘を縦格縁・回縁へ差す。
            // 左右からの枘は芯の手前で止め、下面の込栓で抜けを留める推定の納まり。
            // 枘は材の中、栓の木口だけ下面へ出し、天井板・格間へ張り出させない。
            // 共通の箱と木材のまとめ描きを使い、当たりや毎コマの処理は足さない。
            const left = -hw + .1 + i * gridX + (i === 0 ? .08 : .05);
            const right = -hw + .1 + (i + 1) * gridX - (i === bays - 1 ? .08 : .05);
            if (right > left) for (const [x, side] of [[left, -1], [right, 1]]) {
              box(x + side * .015, y + h - .07, q, .06, .025, .035, DARK);
              box(x + side * .02, y + h - .088, q, .012, .056, .012, 0x95704a);
            }
          }
        } else box(0, y + h - .02, q, lv.w - .2, .05, .05, 0x2a1c12);
      }
      // 比叡山は下で堂・座敷ごとの回縁を組む。御殿用を重ねると、
      // 壁際が二重になり、僧坊では間仕切りを越えた桟が天井板へ突き出す。
      if (goten && !hieiHall && !hieiRooms) { for (const sd of [-1, 1]) { box(0, y + h - .05, sd * (hd - .16), lv.w - .2, .08, .08, DARK); box(sd * (hw - .16), y + h - .05, 0, .08, .08, lv.d - .2, DARK); } }
      // 比叡山の堂は格間ごとに板を納める。格縁より板を奥へ引き、厚みのある格天井にする。
      // 三枚の板を格間の中で止め、階段の穴にも板を渡さない。
      if (hieiHall) {
        // 格縁の端を四周の回縁で受ける。外壁の長押とは別に、天井の高さへ納める。
        // 隅も回縁同士を重ねず、左右の通し材の内側へ納める。
        const borders = new Set();
        for (const zone of ceilingZones) { borders.add(zone.z0); borders.add(zone.z1); }
        // 四周も同じ段で板端を受ける。側面を通し、横材はその内面へ納める。
        for (const z of borders) {
          box(0, y + h - .065, z, lv.w - .36, .09, .16, DARK);
          box(0, y + h - .01, z, lv.w - .32, .02, .12, DARK);
        }
        for (const x of [-hw + .1, hw - .1]) {
          box(x, y + h - .065, 0, .16, .09, lv.d - .04, DARK);
          box(x, y + h - .01, 0, .12, .02, lv.d - .08, DARK);
        }
      }
      if (hieiHall) for (const zone of ceilingZones) for (const [x0, x1, z0, z1] of rectMinus(hw, hd, hole)) {
        for (let x = -hw + .1; x < Math.min(x1, hw - .1) - .04; x += gridX) for (let z = zone.z0; z < Math.min(z1, zone.z1) - .04; z += zone.grid) {
          const a = Math.max(x + .04, x0, -hw + .16), b = Math.min(x + gridX - .04, x1, hw - .16);
          const c = Math.max(z + .04, z0, zone.z0 + .06), d = Math.min(z + zone.grid - .04, z1, zone.z1 - .06);
          if (b - a < .04 || d - c < .04) continue;
          // 黒線だけで割らず、三枚の板を格縁へ納める。細い目地の奥は既存の下地で閉じる。
          for (let q = 0; q < 3; q++) {
            const start = c + (d - c) * q / 3, end = c + (d - c) * (q + 1) / 3;
            box((a + b) / 2, y + h - .01, (start + end) / 2,
              b - a, .02, end - start - .003, q === 1 ? 0x7a6348 : 0x80694c);
          }
        }
      }
      // 僧坊・庫裏は部屋ごとの板張り。庫裏の細部も推定とし、共通部品で組む。
      if (hieiRooms) {
        // 下地の下面より板を下げ、板の下面へ竿縁の上端を合わせる。
        // 板と目地を部屋ごとの回縁の内側で止める。
        for (const r of lv.layout.rooms) {
          // 左右の回縁は壁から十二センチ。前後は横梁の実際の位置から割る。
          // 板を八センチの位置まで張ると回縁へ食い込むため、竿縁の端と同じ面へ納める。
          const left = r.x0 + .12, right = r.x1 - .12;
          const front = ceilingFront(r), back = ceilingBack(r);
          // 天井板を部屋幅いっぱいの一枚板にせず、短い板を千鳥に継ぐ。
          // 座敷の継ぎ目は竿縁の真上に置く。入口は一・二メートル間隔の根太で受ける。
          // 支えの間隔の整数倍で千鳥に継ぎ、板の端が宙に浮かないようにする。板割は推定。
          // 目地は回縁の内側だけ。既存のまとめ描きに含め、毎コマは作らない。
          // 比叡山は回縁の内寸を等分し、部屋端だけ細い切れ端にしない。
          // 千鳥の継ぎ目と竿縁の支点は保ち、板幅だけを部屋ごとに揃える。
          const boardRows = Math.max(1, Math.round((back - front) / .3));
          const boardPitch = (back - front) / boardRows;
          let row = 0;
          for (let z = I.profile === 'hieizan' ? front : r.z0; z < back - .001;
            z += I.profile === 'hieizan' ? boardPitch : .3, row++) {
            const begin = Math.max(z, front);
            const end = Math.min(z + (I.profile === 'hieizan' ? boardPitch : .3), back);
            if (end - begin <= .003 || right - left <= .003) continue;
            const bearingStep = r.floor === 'tatami' ? gridX : boardBearingStep;
            const bearingStart = r.floor === 'tatami' ? -hw + insetX : boardBearingStart;
            const jointSpan = r.floor === 'tatami' ? bearingStep * 4 : bearingStep * 2;
            const start = bearingStart + (row % 2 ? jointSpan / 2 : jointSpan);
            // 板を支点の上で継ぎ、目地に厚みを見せる。毎コマ作らず既存の一束へまとめる。
            let a = left, piece = 0;
            for (let x = start; a < right - .001; x += jointSpan) {
              if (x <= a + .001) continue;
              const b = Math.min(x, right);
              box((a + b) / 2, y + h - .012, (begin + end) / 2,
                b - a - .003, .02, end - begin - .003,
                (row + piece) % 3 === 1 ? 0x7a6348 : 0x80694c);
              a = b; piece++;
            }
          }
        }
        // 座敷の竿縁だけでなく、板間の天井板の端も回縁で受ける。
        // 入口の壁際に残っていた隙間を閉じ、部屋ごとに四周へ納める。
        for (const r of lv.layout.rooms) {
          // 境の横梁は中心から九センチ張り出す。その側面から回縁を組む。
          // 左右を通し材とし、横の回縁・竿縁は内側の面で止める。
          // 同じ高さの材を隅で交差させず、下面のちらつきと梁への食い込みを防ぐ。
          const front = ceilingFront(r), back = ceilingBack(r);
          for (const z of [front - .04, back + .04]) box((r.x0 + r.x1) / 2, y + h - .0325, z, r.x1 - r.x0 - .24, .065, .08, DARK);
          for (const x of [r.x0 + .08, r.x1 - .08]) box(x, y + h - .0325, (front + back) / 2, .08, .065, back - front + .16, DARK);
        }
        // 天井板の下面（天井高から二・二センチ下）で梁を受ける。
        // 梁の上端を下地まで伸ばすと、板を貫いて木口や目地を覆ってしまう。
        const beamY = y + h - .022 - .14 / 2;
        // 横梁を通し材とし、根太・縦梁の木口はその側面で受ける。
        // 同じ高さの箱を交差させると、下面が重なってちらつく。
        // 接合部の細部は推定。設営時だけ割り、既存のまとめ描きへ納める。
        const beamZ = new Set();
        for (const r of lv.layout.rooms) for (const z of [r.z0, r.z1]) beamZ.add(Math.max(-hd + .1, Math.min(hd - .1, z)));
        const crossBeams = [...beamZ].sort((a, b) => a - b);
        const longBeam = (x, width, z0, z1) => {
          let start = z0;
          for (const z of crossBeams) {
            if (z + .09 <= start || z - .09 >= z1) continue;
            const end = Math.min(z1, z - .09);
            if (end > start) box(x, beamY, (start + end) / 2, width, .14, end - start, DARK);
            start = Math.max(start, z + .09);
          }
          if (z1 > start) box(x, beamY, (start + z1) / 2, width, .14, z1 - start, DARK);
        };
        for (const r of lv.layout.rooms) if (r.floor !== 'tatami') {
          // 庫裏は左右に土間と畳の間が並ぶ。根太を土間の回縁の内側で止める。
          for (let x = boardBearingStart + boardBearingStep; x < r.x1 - .12 - .001; x += boardBearingStep) {
            if (x <= r.x0 + .12 + .001) continue;
            longBeam(x, .09, r.z0 + .08, r.z1 - .08);
            if (I.kind === 'sobo') {
              // 入口板間の根太を横梁へ枘差しし、込栓で抜けを止める。
              // 根太の木口は横梁の側面、枘は梁内へ納め、外へは栓の木口だけ出す。
              // 焼失前の細かな仕口は推定。共通の箱を設営時のまとめ描きへ含める。
              for (const edge of [r.z0, r.z1]) {
                const z = Math.max(-hd + .1, Math.min(hd - .1, edge));
                box(x, beamY + .02, z, .045, .07, .16, DARK);
                for (const face of [-1, 1]) box(x, beamY + .02, z + face * .094,
                  .032, .032, .008, 0x95704a);
              }
            }
          }
        }
        // 庫裏の縦の間仕切りにも梁を掛け、両側の天井の回縁を受ける。
        const beamX = new Set();
        for (const r of lv.layout.rooms) for (const x of [r.x0, r.x1]) {
          if (x > -hw + .1 && x < hw - .1) beamX.add(x);
        }
        for (const x of beamX) longBeam(x, .18, -hd + .1, hd - .1);
        // 板間だけでなく、奥と控えの座敷の境にも横梁を通す。
        // 間仕切りの柱頭で竿縁天井を受け、襖・障子の鴨居より上に納める。
        // 共有する境の梁は一度だけ作り、既存のまとめ描きへ収める。
        for (const z of beamZ) box(0, beamY, z, lv.w - .2, .14, .18, DARK);
      }
    }
    for (const st of lv.firingSteps) box(st.x, st.y - .05, st.z, st.w, .1, st.d, DARK);
    // 比叡山の板敷きは細い板幅で継ぐ。畳の下には目地を重ねない。
    const boardStep = I.profile === 'hieizan' ? .3 : .9;
    const boardRooms = I.profile === 'hieizan' ? lv.layout.rooms.filter(r => r.floor === 'boards') : [{ x0: -hw, x1: hw, z0: -hd, z1: hd }];
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
    // 梁（天井の下の横木。階段の口の上は通さない）と、桁（長い向きの太い横木）
    // 御殿・堂は梁を天井の上に隠す（書院造）。櫓・天守と、天井を張らない建物だけ梁と桁を見せる
    const showBeams = !goten || I.open || plainCeiling || (I.profile === 'anegawa' && I.kind === 'nagaya');
    if (showBeams) for (let q = -hw + 0.8; q < hw - 0.3; q += 1.7) {
      if (upSt && q > upSt.hole.x0 - 0.15 && q < upSt.hole.x1 + 0.15) continue;
      const [beamX, beamZ] = I.P(q, 0);
      if (!naibu || !addNaibu(naibu, 'beam', beamX, y + h - .25, beamZ, .17, .24, lv.d - .2, I.rot)) box(q, y + h - 0.13, 0, 0.17, 0.24, lv.d - 0.2, DARK);
    }
    if (showBeams) { box(0, y + h - 0.1, hd * 0.55, lv.w - 0.2, 0.2, 0.15, DARK); box(0, y + h - 0.1, -hd * 0.55, lv.w - 0.2, 0.2, 0.15, DARK); }
    // 窓（外の格子窓の場所に合わせる）
    const wins = windowsFor(I, lv, k);
    // 四つの面：穴のある壁（内の側）。入口の階は戸口も穴
    for (const face of ['z', 'x']) for (const sd of [-1, 1]) {
      const len = face === 'z' ? lv.w : lv.d, off = (face === 'z' ? hd : hw) - 0.1;
      const holes = wins.filter((o) => o.face === face && o.s === sd && (!o.shoji || I.templePaper)).map((o) => ({ t0: o.t - o.w / 2, t1: o.t + o.w / 2, y0: o.y0, y1: o.y1 }));
      if (k === 0 && face === 'z' && sd === ds) holes.push({ t0: I.door.lx - I.door.w / 2, t1: I.door.lx + I.door.w / 2, y0: I.door.rail || 0, y1: I.door.h ?? Math.min(h - 0.3, 2.0) });
      for (const [t0, t1, a0, a1] of facePanels(len, h, holes.filter((o) => o.t1 > -len / 2 && o.t0 < len / 2))) {
        const tm = (t0 + t1) / 2, tw = t1 - t0, yy = y + (a0 + a1) / 2, hh = a1 - a0;
        if (face === 'z') box(tm, yy, sd * off, tw, hh, 0.06, WALL); else box(sd * off, yy, tm, 0.06, hh, tw, WALL);
      }
      // 腰板（櫓・天守：壁の下の一間ほどは板張り、上は漆喰。戸口の所は空ける）
      if (!goten) {
        const wb = (t0, t1) => { if (t1 - t0 < 0.05) return; const tm = (t0 + t1) / 2, tw = t1 - t0; if (face === 'z') box(tm, y + 0.55, sd * (off - 0.03), tw, 1.1, 0.04, BOARD); else box(sd * (off - 0.03), y + 0.55, tm, 0.04, 1.1, tw, BOARD); };
        for (const [a, b, low, high] of facePanels(len, 1.1, holes)) { if (low === 0 && high === 1.1) wb(a, b); else { const mid = (a + b) / 2; if (face === 'z') box(mid, y + (low + high) / 2, sd * (off - .03), b - a, high - low, .04, BOARD); else box(sd * (off - .03), y + (low + high) / 2, mid, .04, high - low, b - a, BOARD); } }
        // 板の継ぎ目（縦）
        for (let t = -len / 2 + 0.45; t < len / 2 - 0.2; t += 0.45) { if (holes.some(v => t > v.t0 - .02 && t < v.t1 + .02 && v.y0 < 1.1)) continue; if (face === 'z') box(t, y + 0.55, sd * (off - 0.055), 0.015, 1.08, 0.01, 0x3a2a1c); else box(sd * (off - 0.055), y + 0.55, t, 0.01, 1.08, 0.015, 0x3a2a1c); }
      }
      // 柱：隅と窓の両脇。長押（横の木）
      const n = Math.max(2, Math.round(len / 1.9));
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
    }
    for (const o of wins) {
      const [px, pz] = o.face === 'z' ? [o.t, o.s * (hd - 0.1)] : [o.s * (hw - 0.1), o.t];
      if (o.shoji) {   // 明かり障子：外の光で白く光る紙と、細い桟
        if (I.templePaper) {
          // 明かり障子の戸は naka_doors が作る。ここでは引き込み先まで溝を通す。
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
          // 戸柱は動く戸の溝より外へ寄せ、開口の幅を保つ。
          const jamb = o.s * ((o.face === 'z' ? hd : hw) - .22);
          for (const side of [-1, 1]) windowTimber(side * (o.w / 2 + .04), py, .08, ph + .08, .08, jamb);
          // 持ち出した縦枠の背も壁の窓柱へつなぐ。上下の横木だけでは、
          // 窓を斜めから見た時に縦枠と壁の間が素通しになっていた。
          // 見込み板は開口の外、動く障子の溝より壁側へ納める。細部は推定。
          // 壁柱の内面（十三センチ）と縦枠の背（十八センチ）の間だけを埋める。
          // 下の戻し板の上面から上の戻し板の下面まで通し、枠の四隅に光の抜ける隙間を残さない。
          const revealBottom = y + o.y0 - .03, revealTop = y + o.y1 + .04;
          const reveal = o.s * ((o.face === 'z' ? hd : hw) - .155);
          for (const side of [-1, 1]) windowTimber(side * (o.w / 2 + .04), (revealBottom + revealTop) / 2,
            .08, revealTop - revealBottom, .05, reveal);
          // 紙の明るさだけで終わらせず、障子越しの光を床・柱・天井へ焼き込む。
          // 下の共通処理は通らないため、ここで窓の明かりを一度だけ登録する。
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
      winPts.push([px, y + (o.y0 + o.y1) / 2, pz, o.shoji ? 0.7 : 1]);
    }
    // 窓からの光の筋（一つの階に三つまで）
    let ns = 0;
    for (const o of wins) {
      if (ns >= 3 || o.shoji || I.open) continue;
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
    // 比叡山は堂の須弥壇・僧坊の入口にある油皿を光らせる。別の火袋を重ねず、光源の数も増やさない。
    const altarLamps = hieiAltarLamps(lv.layout);
    const ln = altarLamps.length || (goten || lv.w > 6 ? 2 : 1);
    for (let q = 0; q < ln; q++) {
      const sgS = upSt ? upSt.sg : -ds;
      const lx = altarLamps.length ? altarLamps[q][0] : (q === 0 ? 1 : -1) * (hw - 0.6);
      const lz = altarLamps.length ? altarLamps[q][2] : -sgS * (hd - 0.6) * (q === 0 ? 1 : 0.2);
      const ly = y + (altarLamps.length ? altarLamps[q][1] : 1.08);
      const [lampX, lampZ] = I.P(lx, lz);
      if (!altarLamps.length && (!naibu || !addNaibu(naibu, 'japanese_lamp_emissive', lampX, y, lampZ, .32, 1.26, .32, I.rot))) {
        box(lx, y + 0.45, lz, 0.05, 0.9, 0.05, DARK); box(lx, y + 0.03, lz, 0.3, 0.06, 0.3, DARK);
        box(lx, y + 1.08, lz, 0.26, 0.36, 0.26, 0xffd49a, true);
      }
      lamps.push([lx, ly, lz]);
      const [wx, wz] = I.P(lx, lz), sp = new THREE.Sprite(M.glow); sp.position.set(wx, ly, wz); sp.scale.setScalar(I.lampGlowScale ?? 0.8); sp.renderOrder = 4; grp.add(sp);
      I.glows.push(sp);
    }
    // 比叡山の堂・僧坊・庫裏は各間取りの調度を使い、汎用の槍掛けと掛物を重ねない。
    // 須弥壇の背面や明かり障子へ槍を突き出さず、炊事場を武具の間にしない。
    if (!goten && I.profile !== 'hieizan' && lv.w > 2.5) {
      const sz = upSt ? -upSt.sg : -ds;
      box(0, y + Math.min(1.9, h - .4), sz * (hd - 0.22), Math.min(1.8, lv.w * 0.5), 0.06, 0.08, DARK);
      for (let q = -1; q <= 1; q++) { const ph = Math.min(2.65, h - .3), g = new THREE.CylinderGeometry(.022, .022, ph, 5); g.rotateX(sz * .12); put(g, q * .4, y + ph / 2, sz * (hd - .3), 0x2c2016); box(q * .4, y + ph - .1, sz * (hd - .13), .04, .2, .03, 0x9a9a9e); }
      box(hw - .35, y + h * .45, 0, .035, h * .85, .035, DARK);
      box(hw - .55, y + h * .6, .02, .4, h * .4, .025, 0x9c8d66);
    }
    if (I.kind === 'goten' && I.okuZ != null && lv.layout.rooms[0].raised !== false) {
      const backD = lv.d * I.oku, bz = -ds * (hd - backD / 2);
      box(0, y + 0.08, bz - ds * 0.1, lv.w - 0.3, 0.16, backD - 0.4, 0x8a8050);

    }
  }
  // 光を頂点の色に焼き込む：暗い地に、灯明の暖かい明かりと窓の明かり
  for (const g of list) {
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
  // 比叡山は上で床框に納めた三十センチ幅の板を張っている。
  // 汎用の床を重ねると千鳥の継ぎ目・木色を覆い、同じ高さの面もちらつく。
  // 専用の板敷きを仕上げとして使い、床の形と材質を二重に持たない。
  if (!['yagura', 'hieizan'].includes(I.profile) && cgtOn() && cgtHas('Floor_Boards')) {
    const kb = new KitBatch();
    for (let k = 0; k < Ls.length; k++) {
      const lv = Ls[k];
      // 堂の追加の床板も、上で組んだ幅十二センチの床框の内面で止める。
      // 壁まで敷くと框を覆うため、自作の板敷きと同じ内寸へ納める。
      const rim = I.profile === 'hieizan' && ['chudo', 'hondo'].includes(I.kind) ? .12 : 0;
      for (const [x0, x1, z0, z1] of lv.pieces) {
        // 比叡山の板間は部屋の境で割る。中心だけの判定では二メートルの板が
        // 障子の敷居を越え、隣の座敷の畳へ重なっていた。階段の口も空ける。
        const areas = I.profile === 'hieizan'
          ? lv.layout.rooms.filter(r => r.floor === 'boards').map(r => [
            Math.max(x0, r.x0, -lv.w / 2 + rim), Math.min(x1, r.x1, lv.w / 2 - rim),
            Math.max(z0, r.z0, -lv.d / 2 + rim), Math.min(z1, r.z1, lv.d / 2 - rim),
          ])
          : [[x0, x1, z0, z1]];
        for (const [a, b, c, d] of areas) {
          if (b - a < .02 || d - c < .02) continue;
          const nx = Math.max(1, Math.round((b - a) / 2)), nz = Math.max(1, Math.round((d - c) / 2)), cw = (b - a) / nx, cd = (d - c) / nz;
          for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
            const [wx, wz] = I.P(a + i * cw, d - j * cd);
            const floor = interiorFloorAt(lv.layout, a + (i + .5) * cw, d - (j + .5) * cd);
            if (floor === 'earth' || floor === 'tatami') continue; // 畳と土間は共通部品で敷いてある
            kb.add('Floor_Boards', wx, lv.y + 0.006, wz, I.rot, cw / 2, 0.12, cd / 2);
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

// 外の見た目：戸口（暗い口）と、外から上がる石段（戦の始めに全部まとめて一つ）
function buildOuter(rt) {
  NAKA.outer = true;
  const list = [];
  let landingShape;
  for (const I of NAKA.list) {
    if (I.disabled) { if (I.mesh) I.mesh.visible = false; continue; }
    const lv = I.levels[0], ds = I.door.side, hd = lv.d / 2;
    const put = (g, lx, y, lz, hex) => { g.translate(lx, y, lz); g.rotateY(I.rot); g.translate(I.x, 0, I.z); list.push(colorize(g, hex)); };
    // 戸口：柱二本と鴨居。入口の穴を空けたままにする。
    const dh = I.door.h ?? Math.min(lv.h - 0.3, 2.0);
    // 壁の穴を塞がず、枠から中が見える戸口にする。
    const off = I.kind === 'goten' ? 0.2 : 0.08;
    if (!I.hasExterior) { const g = new THREE.BoxGeometry(I.door.w + 0.3, 0.16, 0.2); put(g, I.door.lx, lv.y + dh + 0.08, ds * (hd + off + 0.04), 0x2e2218); }
    if (!I.hasExterior) for (const e of [-1, 1]) { const g = new THREE.BoxGeometry(0.16, dh, 0.2); put(g, I.door.lx + e * (I.door.w / 2 + 0.08), lv.y + dh / 2, ds * (hd + off + 0.04), 0x2e2218); }
    if (I.approach) {
      const { pad, len, gy } = I.approach, rise = lv.y - gy, n = Math.max(3, Math.round(rise / 0.28));
      const stone = I.kind !== 'goten' && I.kind !== 'gate';
      for (let q = 0; q < n; q++) {
        const t = (q + 1) / n, top = gy + rise * t, lz = ds * (hd + pad + len * (1 - t) + len / n / 2);
        const g = new THREE.BoxGeometry(I.door.w + 0.3, Math.max(0.1, top - gy + 0.3), len / n + 0.02);
        put(g, I.door.lx, (top + gy - 0.3) / 2, lz, stone ? (q % 2 ? 0x7c7468 : 0x847c70) : (q % 2 ? 0x4e3c2a : 0x56432f));
      }
      if (I.profile === 'hieizan' && I.kind === 'chudo') {
        // 中堂には寺の外形が持つ木の縁側があり、石段もその先端へ接する。
        // 同じ床高へ汎用の石の踊り場を重ねず、縁の踏板を仕上げにする。
      } else if (I.profile === 'hieizan' && ['sobo', 'hondo'].includes(I.kind)) {
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
        const count = Math.max(1, Math.round((width - rim * 2) / .3));
        const pitch = (width - rim * 2) / count;
        for (let i = 0; i < count; i++) timber(-width / 2 + rim + (i + .5) * pitch,
          center, pitch - .003, depth - rim * 2, i % 2 ? 0x695039 : 0x72573d);
        // 踏板の裏を根太で受け、張り出した左右の框は礎石上の束へ載せる。
        // 焼失前の細部は推定。回転後の地面へ合わせ、土中に短い束を重ねない。
        // 床下だけに納め、石段・戸の溝・通れる幅は変えない。
        const under = (x, z, w, h, d, cy, color) => {
          const g = landingShape.clone(); g.scale(w, h, d);
          put(g, I.door.lx + x, cy, ds * z, color);
        };
        under(0, center, width - rim * 2, .08, .1, lv.y - .16, 0x4e3c2a);
        for (const side of [-1, 1]) {
          const x = side * (width - rim) / 2, z = center;
          const [wx, wz] = I.P(I.door.lx + x, ds * z);
          const ground = rt.world.heightAt(wx, wz), top = lv.y - .12;
          if (top - ground < .18) continue;
          under(x, z, .22, .12, .22, ground + .04, 0x7c7468);
          const bottom = ground + .1;
          under(x, z, rim, top - bottom, rim, (bottom + top) / 2, 0x4e3c2a);
        }
      } else {
        const g = new THREE.BoxGeometry(I.door.w + 0.4, 0.12, pad + 0.4); put(g, I.door.lx, lv.y - 0.06, ds * (hd + pad / 2 - 0.1), stone ? 0x847c70 : 0x4e3c2a);
      }
    }
  }
  landingShape?.dispose();
  if (!list.length) return;
  const m = new THREE.Mesh(mergeGeometries(list), mats().door);
  m.castShadow = true; m.receiveShadow = true; m.matrixAutoUpdate = false;
  rt.scene.add(m);
}

// 戸口と石段の前だけ札を出す。横壁越しや別の階からは入れない。
function entryPos(rt, I, out) {
  if (I.disabled || !rt.def.town) return null;
  // 正面の引き戸を開け終えるまでは、入退室の札でも戸を通り抜けさせない。
  if (I.profile === 'hieizan' && I.doors) {
    for (const d of I.doors) if (d.entry && (!d.want || d.open < 1)) return null;
  }
  const pl = rt.player, u = pl.u, p = u.pos, lv = I.levels[0];
  if (!u.alive || u.downed || rt.over || rt.choice || pl.mounted || u.climb) return null;
  const dx = p.x - I.x, dz = p.z - I.z;
  const lx = dx * I.c - dz * I.s, lz = (dx * I.s + dz * I.c) * I.door.side;
  if (Math.abs(lx - I.door.lx) > I.door.w / 2 + .4) return null;
  if (!out) {
    if (I.entryLimit != null && lz < I.entryLimit) return null;
    return NAKA.cur && NAKA.cur.I === I && NAKA.cur.lv.k === 0 && lz > lv.d / 2 - 2.2 ? I.doorIn : null;
  }
  if (NAKA.cur || I.ladderId != null || lz < lv.d / 2 - 0.05) return null;
  const reach = I.approach ? I.approach.pad + I.approach.len : 0;
  if (lz > lv.d / 2 + reach + 2) return null;
  const low = I.approach ? Math.min(I.approach.gy, lv.y) : I.ladderId != null ? I.doorOut.y : lv.y;
  if (p.y < low - 0.8 || p.y > lv.y + 1) return null;
  return I.doorOut;
}

function entryActions(rt, I) {
  // 登録と行き先は一度だけ作る。毎コマは既存の座標を返すだけ。
  I.actions = true;
  const ladder = I.ladderId != null ? FL.ladders[I.ladderId] : null;
  if (ladder) { I.doorOut.x = ladder.topX; I.doorOut.z = ladder.topZ; I.doorOut.y = ladder.y1; }
  else I.doorOut.y = rt.world.heightAt(I.doorOut.x, I.doorOut.z);
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
