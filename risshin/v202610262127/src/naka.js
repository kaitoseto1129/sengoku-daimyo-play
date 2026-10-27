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
import { furnishLayout, lightPool, inabaBoardTexture, inabaAltarBackHeight, INABA_ALTAR_SUSPENSION_DROP, hieiAltarLamps, hieiNageshiHeight, hieiPartitionHeight, HIEI_DOOR_TRACK, HIEI_ENTRY_TRACK, HIEI_SOBO_SILL } from './interior_parts.js';
import { setInteriorSound } from './audio.js';
import { S } from './settings.js';
import { woodTex } from './nature.js';
import { addNaibu, addNaibuStairs } from './naibu_kit.js';
import { cgtOn, cgtHas, KitBatch } from './cgt.js';   // 買った素材（床・畳・武器の棚）
import { yaguraTick } from './yagura_play.js';
import { addNakaDoors, buildNakaDoorMeshes, nakaDoorTick, resetNakaDoors } from './naka_doors.js';

const REDUCE_MOTION = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
const INABA_WALL_BOARD = new THREE.BoxGeometry(1, 1, 1);

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
    for (const v of lv.layout.walls) {
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
      seg(I, x0, z0, x1, z0, lv.y - .4, top, .04);
      seg(I, x0, z1, x1, z1, lv.y - .4, top, .04);
      seg(I, x0, z0, x0, z1, lv.y - .4, top, .04);
      seg(I, x1, z0, x1, z1, lv.y - .4, top, .04);
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
    let entryZ = hd0 - 1.1;
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
    I.doorIn = { x: ix, z: iz, y: inabaFloorY(I, L0, I.door.lx, ds * entryZ) };
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
  const M = mats(), list = [], timbers = [], lamps = [], winPts = [], paper = [], ceilingWood = [];
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
  const grp = new THREE.Group();
  const Ls = I.levels, ds = I.door.side;
  const goten = !['tenshu', 'yagura', 'gate'].includes(I.kind);
  // 稲葉山の用屋と小祠は板張りと貫で納め、座敷の白壁・長押を使わない。
  const inabaBoards = S.quality === 'high' && I.profile === 'inabayama' && ['kura', 'bansho', 'nagaya', 'shrine'].includes(I.kind);
  const plainCeiling = I.profile === 'inabayama' && ['kura', 'bansho', 'nagaya'].includes(I.kind)
    // 小祠は座敷の竿縁天井にせず、梁と桁を見せる推定の納まり。
    || S.quality === 'high' && I.profile === 'inabayama' && I.kind === 'shrine'
    || I.profile === 'echizen_ikko' && I.kind === 'bansho'
    || ['nodafukushima', 'usayama', 'iga', 'takato'].includes(I.profile) && ['kura', 'bansho', 'nagaya'].includes(I.kind)
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
      const [fx, fz] = I.P((x0 + x1) / 2, (z0 + z1) / 2);
      if (!naibu || !addNaibu(naibu, 'floor_modular_a', fx, y + offset - .08, fz, x1 - x0, .08, z1 - z0, I.rot)) box((x0 + x1) / 2, y + offset - .04, (z0 + z1) / 2, x1 - x0, .08, z1 - z0, FLOOR);
    }
    const upSt = I.stairs[k];
    if (!I.open) for (const [x0, x1, z0, z1] of rectMinus(hw, hd, upSt ? upSt.hole : null)) box((x0 + x1) / 2, y + h + 0.03, (z0 + z1) / 2, x1 - x0, 0.06, z1 - z0, goten ? 0x7a6448 : DARK);
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
    } else {
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
    // 高画質の稲葉山は共通室内部品が部屋ごとに床板・框・畳・土間を仕上げる。
    // 建物全体へ古い板目を重ねると、土間や畳にも二センチ幅の線が浮き、
    // 板間の框と敷居も横切る。専用の板割りだけを使って重複をなくす。
    const boardRooms = S.quality === 'high' && I.profile === 'inabayama' ? []
      : I.profile === 'hieizan' ? lv.layout.rooms.filter(r => r.floor === 'boards')
      : [{ x0: -hw, x1: hw, z0: -hd, z1: hd }];
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
    // 梁（天井の下の横木。階段の口の上は通さない）と、桁（長い向きの太い横木）
    // 御殿・堂は梁を天井の上に隠す（書院造）。櫓・天守と、天井を張らない建物だけ梁と桁を見せる
    const showBeams = !goten || I.open || plainCeiling || (I.profile === 'anegawa' && I.kind === 'nagaya');
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
      const holes = wins.filter((o) => o.face === face && o.s === sd && (!o.shoji || I.templePaper)).map((o) => ({ t0: o.t - o.w / 2, t1: o.t + o.w / 2, y0: o.y0, y1: o.y1 }));
      if (k === 0 && face === 'z' && sd === ds) holes.push({ t0: I.door.lx - I.door.w / 2, t1: I.door.lx + I.door.w / 2, y0: I.door.rail || 0, y1: I.door.h ?? Math.min(h - 0.3, 2.0) });
      // 板壁の隅は前後の壁へ左右の壁を突き付ける。下地・化粧板・貫を
      // それぞれ相手の内面で止め、隅柱の裏で同じ面を交差させない。
      // 開口の位置と壁の当たりは保ち、稲葉山の高画質の木部だけ納め直す。
      const wallLen = inabaBoards && face === 'x' ? len - .26 : len;
      for (const [t0, t1, a0, a1] of facePanels(wallLen, h, holes.filter((o) => o.t1 > -len / 2 && o.t0 < len / 2))) {
        const tm = (t0 + t1) / 2, tw = t1 - t0, yy = y + (a0 + a1) / 2, hh = a1 - a0;
        if (face === 'z') box(tm, yy, sd * off, tw, hh, 0.06, inabaBoards ? BOARD : WALL); else box(sd * off, yy, tm, 0.06, hh, tw, inabaBoards ? BOARD : WALL);
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
      } else {
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
      }
      for (const [a, b, low, high] of facePanels(len, .12, holes)) { if (face === 'z') box((a + b) / 2, y + (low + high) / 2, sd * (off - .03), b - a, high - low, .05, DARK); else box(sd * (off - .03), y + (low + high) / 2, (a + b) / 2, .05, high - low, b - a, DARK); }
    }
    for (const o of wins) {
      const [px, pz] = o.face === 'z' ? [o.t, o.s * (hd - 0.1)] : [o.s * (hw - 0.1), o.t];
      if (o.shoji) {   // 明かり障子：外の光で白く光る紙と、細い桟
        if (o.sliding) {
          winPts.push([px, y + (o.y0 + o.y1) / 2, pz, .7]);
          continue;
        }
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
    if (I.profile === 'inabayama') {
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
    // 稲葉山の高画質は furnishLayout が上段の床組み・畳・框を同じ床高で作る。
    // 旧来の一枚板を重ねると畳面と同じ高さになり、畳縁や目地を覆ってちらつく。
    if (I.kind === 'goten' && I.okuZ != null && lv.layout.rooms[0].raised !== false
      && !(S.quality === 'high' && I.profile === 'inabayama')) {
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
    if (!M.ceilingWood) {
      // 寸法に応じて繰り返す室内専用の絵を一枚だけ持つ。建具や床の貼り方は保つ。
      const map = inabaBoardTexture().clone();
      map.wrapS = map.wrapT = THREE.RepeatWrapping; map.needsUpdate = true;
      M.ceilingWood = new THREE.MeshBasicMaterial({ vertexColors: true, map });
    }
    const wood = new THREE.Mesh(mergeGeometries(ceilingWood), M.ceilingWood);
    wood.matrixAutoUpdate = false; grp.add(wood);
  }
  const textured = new Set(ceilingWood);
  if (floorBoardShape) floorBoardShape.dispose();
  const m = new THREE.Mesh(mergeGeometries(list.filter(g => !textured.has(g))), I.profile === 'hieizan' ? M.hieiBase : M.base);
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
      } else if (!inabaHallLanding) {
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
  // 玄関の戸を開け切ってから、上がり口の案内を出す。
  if (I.entryDoor && I.entryDoor.open < .99) return null;
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
