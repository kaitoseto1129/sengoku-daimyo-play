// ======================================================================
// naka_doors.js … 城の御殿・寺の堂・屋敷の「中」の引き戸（kaito 10/14「障子を開けられる」）
//   naka.js の間取り（interior_layouts の portals＝間仕切りの口）に、襖・障子・板戸をはめる。
//   ・近づくと「開ける／閉める」の札（hud は naka_ で始まる札を指で押せる釦にする）。押すと戸が左右の壁の前へ滑る
//   ・閉めている間は当たりがある（紙の戸は槍が通る）。中の兵が戸口へ来ると自分で開ける。遊び手が押し続けても開く
//   ・形は interior_parts の panelInstances を使い回し、一つの建物・一つの種類で一つの InstancedMesh。動く間だけ行列を書く
//   ・寺の堂（内陣と外陣の境）は格子戸。開け放った形から始める（本尊が見える）。玄関を含め、ほかは閉めて始める
// ======================================================================
import * as THREE from 'three';
import { SOLIDS } from './props.js';
import { INTERIOR_WALLS } from './shironaka.js';
import { panelInstances, inabaBoardTexture, hieiPartitionHeight, HIEI_DOOR_TRACK, HIEI_ENTRY_TRACK, HIEI_LEAF_OVERLAP, HIEI_SOBO_SILL } from './interior_parts.js';
import { S as SETTINGS } from './settings.js';

export const DOORS = [];
const SKIP = ['tenshu', 'yagura', 'gate'];
const TEMPLE = ['hondo', 'chudo', 'temple'];
const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
const moving = new Set();
// 森部の建具は共通部品の框が厚さ六センチ。当たりも表裏三センチにそろえる。
// 開閉時の挟み込み判定にも使い、見えている框へ体や槍を食い込ませない。
const MORIBE_PANEL_R = .03;
let stopShape, stopMaterial;
let inabaStopWood, inabaStopPaint;
const stopColor = new THREE.Color();

export function resetNakaDoors() {
  DOORS.length = 0; moving.clear();
  // 再戦で時刻が戻っても、前の建物の戸を操作候補に残さない。
  // 兵の自動開閉の待ち時刻も、新しい戦の戸へ持ち越さない。
  pickT = -1; pick = null; autoT = 0;
}

// 間仕切りの口ごとに戸を一組。lv.layout.walls の当たりを作った後に呼ぶ（y0・y1 は壁と同じ高さの幅）
export function addNakaDoors(I, lv, y0, y1) {
  if (I.profile === 'okehazama') return okeAddNakaDoors(I, lv, y0, y1);
  if (I.profile === 'moribe') return moribeAddNakaDoors(I, lv, y0, y1);
  if (I.profile === 'hieizan') return addNakaDoorsHiei(I, lv, y0, y1);
  if (SKIP.includes(I.kind) || I.open || I.profile === 'yagura') return;
  const portals = [...(lv.layout.portals || [])];
  // 稲葉山の玄関も同じ引き戸で閉じる。外から操作でき、板倉には板戸を納める。
  if (I.profile === 'inabayama' && lv.k === 0) portals.push({
    x: I.door.lx, z: I.door.side * lv.d / 2, w: I.door.w, exterior: true,
    kind: ['hondo', 'shrine'].includes(I.kind) ? 'koshi' : ['goten', 'tamari'].includes(I.kind) ? 'shoji' : 'itado',
  });
  // 明かり障子は二枚の引き違い。柱間の中で重ね、端の戸を妻壁へ突き出さない。
  for (const v of lv.windows || []) if (v.sliding || v.shutter) portals.push({
    x: v.t, z: v.s * (lv.d / 2 - .1), w: v.w, exterior: true,
    window: true, kind: v.shutter ? 'itado' : 'shoji', sill: v.y0, top: v.y1,
    shutter: v.shutter,
  });
  for (const p of portals) {
    let l = p.exterior ? p.x - p.w / 2 : -Infinity, r = p.exterior ? p.x + p.w / 2 : Infinity, paper = true;
    for (const v of lv.layout.walls) {
      if (p.exterior) break;
      if (v.guideOnly || Math.abs(v.az - p.z) > .01 || Math.abs(v.bz - p.z) > .01) continue;
      const a = Math.min(v.ax, v.bx), b = Math.max(v.ax, v.bx);
      if (b <= p.x + .01 && b > l) { l = b; paper = v.paper; }
      if (a >= p.x - .01 && a < r) r = a;
    }
    if (!isFinite(l) || !isFinite(r) || r - l < .5 || r - l > 4.4) continue;
    const temple = TEMPLE.includes(I.kind);
    const kind = p.kind || (temple ? 'koshi' : !paper ? 'itado' : ['goten', 'yashiki', 'shisha'].includes(I.kind) ? 'fusumaE' : 'shoji');
    const W = r - l, n = p.window ? 2 : Math.max(2, Math.round(W / 1.8) * 2);
    const inabaTrack = SETTINGS.quality === 'high' && I.profile === 'inabayama';
    const sill = p.sill || 0;
    // 用屋の梁下は天井から二十九センチ。内戸の鴨居（十センチ厚）も
    // その下へ納め、板戸が梁を貫いたまま左右へ滑らないようにする。
    // 戸・溝・鴨居と当たりは、この内法高を一緒に使う。
    // 小祠も梁を見せる造りなので、神前の格子戸の鴨居を梁下へ揃える。
    const beamHead = inabaTrack && ['kura', 'bansho', 'nagaya', 'shrine'].includes(I.kind) ? .4 : .2;
    // 高画質の稲葉山は鴨居と小壁の分を残す。固定の建具と同じ内法高を使う。
    const doorH = p.window ? p.top : p.exterior ? I.door.h ?? Math.min(lv.h - .3, 2) : I.profile === 'inabayama' ? Math.min(2.3, lv.h - (SETTINGS.quality === 'high' ? beamHead : .02)) : lv.h > 3 ? 2.3 : lv.h - .02;
    // 稲葉山の戸は固定戸と同じく敷居へ五ミリ、鴨居へ八ミリ差し込む推定の納まり。
    // 溝底（下八ミリ・上十二ミリ）には余裕を残す。枠の基準高は動かさず、
    // 戸だけを伸ばして、開閉中も横框が溝の上に浮かないようにする。
    const footInset = inabaTrack ? .005 : 0, headInset = inabaTrack ? .008 : 0;
    const [ax, az] = I.P(l, p.z), [bx, bz] = I.P(r, p.z), rad = .06;
    // 木格子を紙の襖扱いにしない。閉じた格子越しに槍が素通りせず、開いた戸と同じ木の当たりを使う。
    const solid = { k: 's', ax, az, bx, bz, r: rad, yBot: inabaTrack || p.window ? lv.y + sill : y0, yTop: inabaTrack || p.window ? lv.y + doorH : y1, naka: I.id, fusuma: kind !== 'itado' && !(inabaTrack && kind === 'koshi'),
      x0: Math.min(ax, bx) - rad, x1: Math.max(ax, bx) + rad, z0: Math.min(az, bz) - rad, z1: Math.max(az, bz) + rad };
    SOLIDS.push(solid); INTERIOR_WALLS.push(solid);
    if (inabaTrack && !p.exterior && lv.y + doorH < y1) {
      // 鴨居と小壁は壁の線に固定し、戸と一緒に左右へ動かさない。
      // 引き込んだ襖・障子の上に見えない壁を残さず、開いた口の頭上は塞ぐ。
      const cap = { ...solid, yBot: lv.y + doorH, yTop: y1, fusuma: false, bodyOverlap: true };
      SOLIDS.push(cap); INTERIOR_WALLS.push(cap);
    }
    const [x, z] = I.P((l + r) / 2, p.z);
    const d = { I, lv, kind, exterior: !!p.exterior, window: !!p.window, lx: (l + r) / 2, lz: p.z, W, n, pw: W / n, h: doorH - sill, y: lv.y + sill, x, z, solid, saved: null, open: 0, want: 0, meshes: null, base: 0 };
    // 共通の框が下五ミリ・上八ミリの差し込みを持つため、内法寸法で渡す。
    // 戸全体も伸ばすと二重に差し込み、溝底を突き抜けて当たりともずれる。
    d.leafH = d.h;
    d.leafY = d.y;
    // 鴨居上の固定壁は従来の高さ。差し込む戸の当たりだけ絵の上下端へ合わせる。
    if (inabaTrack) { solid.yBot = d.y - footInset; solid.yTop = d.y + d.h + headInset; }
    // 稲葉山は柱と脇の建具の表を通る二本の溝。開閉中も前後へずらさない。
    // 前後の溝に入る戸は、召し合わせの縦框を三センチ重ねる。
    // 等分した幅のまま突き合わせると、斜めから紙の間に向こう側が見える。
    // 戸口と移動量は保ち、絵と一枚ごとの当たりに同じ実幅を渡す。
    d.leafW = d.pw + (inabaTrack ? .03 : 0);
    // この戦の戸は一枚ごとに当たりを持たせ、見える戸と同じ溝を滑らせる。
    // 設営時だけ作り、開閉中は座標を書き換える。
    if (inabaTrack) {
      d.slidingSolids = [solid];
      for (let j = 1; j < n; j++) {
        const leaf = { ...solid };
        d.slidingSolids.push(leaf); SOLIDS.push(leaf); INTERIOR_WALLS.push(leaf);
      }
    }
    d.track = inabaTrack ? (p.exterior ? .04 : .12) : 0;
    // 玄関は内側の柱の裏へ引く。柱は外壁線から室内へ二十三センチ出るため、
    // 壁寄りの溝も三十センチ離す（戸の厚み六センチと当たりの半径も収まる）。
    // 敷居・鴨居と動く戸の当たりも、この同じ溝の位置を使う。
    d.trackZ = inabaTrack && p.exterior && !p.window ? -I.door.side * .34 : 0;
    d.spot = { x, z };
    (I.doors || (I.doors = [])).push(d); DOORS.push(d);
    if (p.exterior && !p.window) I.entryDoor = d;
    if (temple && !p.exterior) { d.open = d.want = 1; solidOff(d); }
    // 連子の内戸は片側へ重ねて始める。近づいて閉めても外の格子は残す。
    if (p.shutter) d.open = d.want = 1;
    if (d.slidingSolids) {
      pose(d);
      // 区画の表は設営後に作り直さないため、戸一枚の全移動範囲を先に登録する。
      // 開け放って始める内陣・連子窓も、閉じた位置まで含める。
      // 当たり本体は従来どおり戸と一緒に動かし、空いた口を塞がない。
      for (let j = 0; j < d.n; j++) {
        const leaf = d.slidingSolids[j];
        const travel = d.window ? (j === 0 ? d.pw : 0) : (j < d.n / 2 ? -1 : 1) * d.W / 2;
        const dx = travel * I.c, dz = -travel * I.s;
        const ax = leaf.ax - dx * d.open, bx = leaf.bx - dx * d.open;
        const az = leaf.az - dz * d.open, bz = leaf.bz - dz * d.open;
        leaf.sweep = {
          x0: Math.min(ax, bx, ax + dx, bx + dx), x1: Math.max(ax, bx, ax + dx, bx + dx),
          z0: Math.min(az, bz, az + dz, bz + dz), z1: Math.max(az, bz, az + dz, bz + dz),
        };
      }
    }
  }
}

function addNakaDoorsHiei(I, lv, y0, y1) {
  if (SKIP.includes(I.kind) || I.open || I.profile === 'yagura') return;
  const portals = [...(lv.layout.portals || [])];
  // 比叡山の正面入口にも同じ引き戸を使う。外壁の開口幅・高さに合わせる。
  if (I.profile === 'hieizan' && lv === I.levels[0]) portals.push({
    x: I.door.lx, z: I.door.side * (lv.d / 2 - HIEI_ENTRY_TRACK), entry: true,
    // 炊事の庫裏は堂の内陣用の格子戸にせず、土間を閉じる板戸にする。
    kind: I.kind === 'sobo' ? 'shoji' : I.kind === 'kuri' ? 'itado' : 'koshi',
  });
  for (const p of portals) {
    let l = p.entry ? p.x - I.door.w / 2 : -Infinity;
    let r = p.entry ? p.x + I.door.w / 2 : Infinity, paper = true;
    for (const v of lv.layout.walls) {
      if (p.entry || v.guideOnly || Math.abs(v.az - p.z) > .01 || Math.abs(v.bz - p.z) > .01) continue;
      const a = Math.min(v.ax, v.bx), b = Math.max(v.ax, v.bx);
      if (b <= p.x + .01 && b > l) { l = b; paper = v.paper; }
      if (a >= p.x - .01 && a < r) r = a;
    }
    if (p.exterior) { l = p.x - I.door.w / 2; r = p.x + I.door.w / 2; }
    if (!isFinite(l) || !isFinite(r) || r - l < .5 || r - l > 4.4) continue;
    const temple = TEMPLE.includes(I.kind);
    const kind = p.kind || (temple ? 'koshi' : !paper ? 'itado' : ['goten', 'yashiki', 'shisha'].includes(I.kind) ? 'fusumaE' : 'shoji');
    const W = r - l, n = Math.max(2, Math.round(W / 1.8) * 2);
    const tracked = I.profile === 'hieizan';
    const lz = p.z + (tracked && !p.entry ? HIEI_DOOR_TRACK : 0);
    const [ax, az] = I.P(l, lz), [bx, bz] = I.P(r, lz), rad = .06;
    const doorH = p.entry ? Math.min(lv.h, I.door.h ?? 2) : tracked && ['sobo', 'chudo', 'hondo'].includes(I.kind) ? hieiPartitionHeight(I.kind, lv.h) : lv.h > 3 ? 2.3 : lv.h - .02;
    // 比叡山の木格子は紙戸の貫通扱いにしない。襖と障子は従来どおり。
    const solid = { k: 's', ax, az, bx, bz, r: rad, yBot: y0, yTop: p.entry || tracked ? lv.y + doorH : y1, naka: I.id, fusuma: kind !== 'itado' && !(tracked && kind === 'koshi'),
      x0: Math.min(ax, bx) - rad, x1: Math.max(ax, bx) + rad, z0: Math.min(az, bz) - rad, z1: Math.max(az, bz) + rad };
    SOLIDS.push(solid); INTERIOR_WALLS.push(solid);
    const [x, z] = I.P((l + r) / 2, lz);
    // 固定の襖・障子と同じ高さで鴨居の下を滑らせる。
    const d = { I, lv, kind, tracked, entry: !!p.entry, lx: (l + r) / 2, lz, W, n, pw: W / n, h: doorH, y: lv.y, x, z, touch: { x, z }, solid, saved: null, open: 0, want: 0, meshes: null, base: 0 };
    (I.doors || (I.doors = [])).push(d); DOORS.push(d);
    // 比叡山の建具は、引き込んだ先でも体を通さない。
    // 設営時に戸ごとの当たりを用意し、焼失時は堂の当たりと一緒に片付ける。
    if (tracked) {
      d.leaves = Array.from({ length: n }, () => ({ ...solid, r: .035, yBot: lv.y + sillHeight(d) }));
      for (const leaf of d.leaves) { SOLIDS.push(leaf); INTERIOR_WALLS.push(leaf); }
    }
    // 内陣の脇口は開けて本尊を見せる。正面戸は閉め、外からも札で開ける。
    if (temple && !p.entry) { d.open = d.want = 1; solidOff(d); }
    if (tracked) { pose(d); addDoorStops(d); }
  }
  if (I.profile === 'hieizan' && I.kind === 'sobo') {
    // 明かり障子も正面戸と同じ二本溝で滑らせる。腰壁と窓上の壁は残す。
    for (const v of lv.windows || []) {
      if (!v.shoji) continue;
      const hw = lv.w / 2, hd = lv.d / 2;
      const [x, z] = I.P(v.face === 'z' ? v.t : v.s * (hw - HIEI_ENTRY_TRACK),
        v.face === 'z' ? v.s * (hd - HIEI_ENTRY_TRACK) : v.t);
      const rot = I.rot + (v.face === 'x' ? Math.PI / 2 : 0);
      const frame = { x, z, rot, c: Math.cos(rot), s: Math.sin(rot) };
      const y = lv.y + v.y0, W = v.w, rad = .035;
      const solid = { k: 's', ax: x - W / 2 * frame.c, az: z + W / 2 * frame.s,
        bx: x + W / 2 * frame.c, bz: z - W / 2 * frame.s,
        r: rad, yBot: y, yTop: lv.y + v.y1, naka: I.id, fusuma: true };
      solid.x0 = Math.min(solid.ax, solid.bx) - rad; solid.x1 = Math.max(solid.ax, solid.bx) + rad;
      solid.z0 = Math.min(solid.az, solid.bz) - rad; solid.z1 = Math.max(solid.az, solid.bz) + rad;
      const d = { I, lv, frame, kind: 'shoji', tracked: true, window: v, entry: false,
        lx: 0, lz: 0, W, n: 2, pw: W / 2, h: v.y1 - v.y0, y,
        x, z, touch: { x, z }, solid, saved: null, open: 0, want: 0, meshes: null, base: 0 };
      d.leaves = Array.from({ length: 2 }, () => ({ ...solid }));
      for (const leaf of [solid, ...d.leaves]) { SOLIDS.push(leaf); INTERIOR_WALLS.push(leaf); }
      (I.doors || (I.doors = [])).push(d); DOORS.push(d);
      pose(d);
      addDoorStops(d);
    }
  }
}

// 近づいて中を作る時（naka.js の buildInside）に、戸の形を grp へ足す
export function buildNakaDoorMeshes(I, grp) {
  if (I.profile === 'okehazama') return okeBuildNakaDoorMeshes(I, grp);
  if (I.profile === 'moribe') return moribeBuildNakaDoorMeshes(I, grp);
  if (I.profile === 'hieizan') return buildNakaDoorMeshesHiei(I, grp);
  if (!I.doors) return;
  const fitted = SETTINGS.quality === 'high' && I.profile === 'inabayama';
  if (fitted && I.doors.length) {
    // 引き先を溝だけで終わらせず、戸尻を受ける縦の戸当たりを添える推定の納まり。
    // 引き分けは全開時の外端、窓の引き違いは柱間の両端で受ける。
    // 召し合わせの重なりと戸の厚みも逃がし、動く框へ木枠を食い込ませない。
    stopShape ||= new THREE.BoxGeometry(1, 1, 1);
    // 戸当たりも框の仕上げへ揃える。襖・格子戸は塗り、障子・板戸は縦の木目。
    // 木目の絵と材質は全棟で共有し、設営時だけ二種類までにまとめる。
    inabaStopWood ||= new THREE.MeshStandardMaterial({ map: inabaBoardTexture(), roughness: 1, metalness: 0 });
    inabaStopPaint ||= new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 });
    const groups = new Map();
    for (const d of I.doors) {
      const painted = ['fusuma', 'fusumaE', 'koshi'].includes(d.kind);
      const material = painted ? inabaStopPaint : inabaStopWood;
      let group = groups.get(material);
      if (!group) { group = []; groups.set(material, group); }
      group.push(d);
    }
    for (const [material, doors] of groups) {
      const stops = new THREE.InstancedMesh(stopShape, material, doors.length * 2);
      stops.receiveShadow = true;
      let index = 0;
      for (const d of doors) {
        stopColor.setHex(d.kind === 'koshi' ? 0x1e140e
          : ['fusuma', 'fusumaE'].includes(d.kind) ? 0x32271c : d.kind === 'itado' ? 0x241a12 : 0x795b3b);
        const overhang = (d.leafW - d.pw) / 2;
        const end = (d.window ? d.W / 2 : d.W) + overhang + .025;
        const lz = d.lz + d.trackZ;
        Q.setFromAxisAngle(Y, I.rot);
        S.set(.05, d.h + .013, d.track * 2 + .08);
        for (const side of [-1, 1]) {
          const lx = d.lx + side * end;
          P.set(I.x + lx * I.c + lz * I.s, d.y + d.h / 2 + .0015,
            I.z - lx * I.s + lz * I.c);
          M.compose(P, Q, S); stops.setMatrixAt(index, M);
          stops.setColorAt(index++, stopColor);
        }
      }
      // 設営後は戸当たりの行列も色も更新しない。
      stops.computeBoundingSphere(); grp.add(stops);
    }
  }
  const by = new Map();
  for (const d of I.doors) {
    const key = fitted ? d.kind + ':' + d.leafW + ':' + d.leafH : d.kind;
    if (!by.has(key)) by.set(key, []);
    by.get(key).push(d);
  }
  for (const list of by.values()) {
    const kind = list[0].kind, w = fitted ? list[0].leafW : .9, h = fitted ? list[0].leafH : 1.8;
    const pairedLeaves = fitted && ['itado', 'shoji', 'koshi'].includes(kind);
    const count = list.reduce((s, d) => s + (pairedLeaves ? d.n / 2 : d.n), 0);
    const meshes = panelInstances(kind, count, fitted, w, h);
    // 右戸を半回転しても、板戸の裏桟・障子の紙・格子の相欠きを左右で同じ面へ揃える。
    // 右戸の形と材質も建物内で共有する。
    const rightMeshes = pairedLeaves ? panelInstances(kind + 'R', count, true, w, h) : null;
    const allMeshes = rightMeshes ? meshes.concat(rightMeshes) : meshes;
    let i = 0;
    for (const d of list) { d.meshes = meshes; d.rightMeshes = rightMeshes; d.base = i; i += pairedLeaves ? d.n / 2 : d.n; }
    for (const m of allMeshes) { m.count = count; grp.add(m); }
    for (const d of list) pose(d);
    // 閉じた位置だけの範囲では、脇へ引いた戸が視野の端で消える。
    // 稲葉山の戸の最大移動量を一度だけ足し、開閉中の範囲計算を省く。
    const travel = SETTINGS.quality === 'high' && I.profile === 'inabayama'
      ? list.reduce((r, d) => Math.max(r, d.W / 2), 0) : 0;
    for (const m of allMeshes) { m.computeBoundingSphere(); m.boundingSphere.radius += travel; }
  }
}

function buildNakaDoorMeshesHiei(I, grp) {
  if (!I.doors) return;
  if (I.profile === 'hieizan') {
    // 正面戸・間仕切り・明かり障子を一束で描く。動く戸とは分けて更新しない。
    stopShape ||= new THREE.BoxGeometry(1, 1, 1);
    // 戸当たりも外周の木部と同じく光を受ける。暗い堂内でここだけ明るく浮かせない。
    // 正面戸・座敷・窓で一つの材質を共有し、影を描く回数は増やさない。
    stopMaterial ||= new THREE.MeshStandardMaterial({ color: 0x795b3b, roughness: 1, metalness: 0 });
    const stops = new THREE.InstancedMesh(stopShape, stopMaterial, I.doors.length * 2);
    stops.receiveShadow = true;
    let index = 0;
    for (const d of I.doors) {
      const frame = d.frame || I, sill = sillHeight(d), height = panelHeight(d);
      Q.setFromAxisAngle(Y, frame.rot); S.set(.05, height, .18);
      for (const side of [-1, 1]) {
        const x = d.lx + side * (stopOffset(d) + .025);
        P.set(frame.x + x * frame.c + d.lz * frame.s, d.y + sill + height / 2,
          frame.z - x * frame.s + d.lz * frame.c);
        M.compose(P, Q, S); stops.setMatrixAt(index++, M);
      }
    }
    stops.computeBoundingSphere(); grp.add(stops);
  }
  const by = new Map();
  for (const d of I.doors) {
    // 正面戸・座敷の戸・明かり障子は寸法が違う。同寸の戸だけをまとめ描きする。
    const key = d.tracked ? d.kind + ':' + d.pw + ':' + panelHeight(d) : d.kind;
    if (!by.has(key)) by.set(key, []);
    by.get(key).push(d);
  }
  for (const list of by.values()) {
    const first = list[0], kind = first.kind;
    const count = list.reduce((s, d) => s + d.n, 0);
    const panelKind = I.profile === 'hieizan' ? kind === 'shoji' ? 'shojiHiei' : kind === 'koshi' ? 'koshiHiei' : kind : kind;
    const meshes = first.tracked ? panelInstances(panelKind, count, false, first.pw + HIEI_LEAF_OVERLAP, panelHeight(first)) : panelInstances(panelKind, count);
    let i = 0;
    for (const d of list) { d.meshes = meshes; d.base = i; i += d.n; }
    for (const m of meshes) { m.count = count; grp.add(m); }
    if (I.profile === 'hieizan') {
      // 閉じた時だけの範囲では、横へ滑った障子が画面端で消える。
      // 両端の範囲を設営時に一度だけ合わせ、動く間の計算は増やさない。
      for (const d of list) pose(d, 0);
      for (const m of meshes) m.computeBoundingSphere();
      const closed = meshes.map(m => m.boundingSphere.clone());
      for (const d of list) pose(d, 1);
      for (let j = 0; j < meshes.length; j++) {
        meshes[j].computeBoundingSphere();
        meshes[j].boundingSphere.union(closed[j]);
      }
      for (const d of list) pose(d);
    } else {
      for (const d of list) pose(d);
      for (const m of meshes) m.computeBoundingSphere();
    }
  }
}

function pose(d) {
  if (d.tracked) return poseHiei(d);
  const I = d.I, k = d.open, e = k * k * (3 - 2 * k);
  if (d.slidingSolids) for (let j = 0; j < d.n; j++) {
    const side = j < d.n / 2 ? -1 : 1, s = d.slidingSolids[j];
    const slide = d.window ? (j === 0 ? e * d.pw : 0) : side * e * d.W / 2;
    const center = d.lx - d.W / 2 + (j + .5) * d.pw + slide;
    const a = center - d.leafW / 2, b = center + d.leafW / 2;
    const z = d.lz + d.trackZ + (j % 2 ? 1 : -1) * d.track;
    s.ax = I.x + a * I.c + z * I.s; s.az = I.z - a * I.s + z * I.c;
    s.bx = I.x + b * I.c + z * I.s; s.bz = I.z - b * I.s + z * I.c;
    s.x0 = Math.min(s.ax, s.bx) - s.r; s.x1 = Math.max(s.ax, s.bx) + s.r;
    s.z0 = Math.min(s.az, s.bz) - s.r; s.z1 = Math.max(s.az, s.bz) + s.r;
  }
  if (!d.meshes) return;
  if (d.slidingSolids) S.set(1, 1, 1);
  else S.set(d.leafW / .9, d.leafH / 1.8, 1);
  // 稲葉山の襖・障子・板戸・格子戸は、左右の引手を召し合わせ側へ向ける。
  // 共通の一枚を半回転して使い、右の戸だけ引手が戸尻へ行くのを防ぐ。
  // 戸の幅・溝・当たりと、左右へ滑る距離は同じに保つ。
  const pairedHandles = SETTINGS.quality === 'high' && I.profile === 'inabayama'
    && ['fusuma', 'fusumaE', 'shoji', 'itado', 'koshi'].includes(d.kind);
  // 正面側の外障子は紙を外へ、組子を室内へ向ける。
  // 右戸用の裏返した形を左へ、通常の形を右へ使えば、半回転する
  // 引手の向きは保ったまま紙と組子だけを揃えられる。裏側の窓と内戸は従来どおり。
  const paperOutward = d.rightMeshes && d.kind === 'shoji' && d.exterior && d.lz > 0;
  for (let j = 0; j < d.n; j++) {
    const left = j < d.n / 2;
    Q.setFromAxisAngle(Y, I.rot + (pairedHandles && !left ? Math.PI : 0));
    // 閉めた時は二本の溝（前後に少しずらす）。開けると左右の壁の前へ引き込む
    const slide = d.window ? (j === 0 ? e * d.pw : 0) : (left ? -1 : 1) * e * d.W / 2;
    const lx = d.lx - d.W / 2 + (j + .5) * d.pw + slide;
    const lz = d.lz + d.trackZ + (j % 2 ? 1 : -1) * (d.track || .02 + .045 * e);
    // 動く間も座標の配列を作らず、共通のベクトルと行列へ直接書く。
    P.set(I.x + lx * I.c + lz * I.s, d.leafY, I.z - lx * I.s + lz * I.c); M.compose(P, Q, S);
    const meshes = d.rightMeshes && (paperOutward ? left : !left) ? d.rightMeshes : d.meshes;
    const index = d.base + (d.rightMeshes && !left ? j - d.n / 2 : j);
    for (const m of meshes) m.setMatrixAt(index, M);
  }
  for (const m of d.meshes) m.instanceMatrix.needsUpdate = true;
  if (d.rightMeshes) for (const m of d.rightMeshes) m.instanceMatrix.needsUpdate = true;
}

function poseHiei(d, open = d.open) {
  const reverseWindow = false;
  if (!d.meshes && !d.leaves) return;
  const I = d.frame || d.I, k = open, e = k * k * (3 - 2 * k);
  // 敷居の上面から鴨居の下面までを建具の高さにする。
  // 戸口の当たりと操作の基準は床面のまま保つ。
  const sill = sillHeight(d);
  if (d.tracked) S.set(1, 1, 1);
  else S.set(d.pw / .9, panelHeight(d) / 1.8, 1);
  for (let j = 0; j < d.n; j++) {
    // 障子と板戸は右用の部品で引手を向かい合わせ、表裏は二枚ともそろえる。
    const right = j >= d.n / 2;
    const meshes = d.rightMeshes && (reverseWindow ? !right : right) ? d.rightMeshes : d.meshes;
    const index = d.base + (d.rightMeshes && right ? j - d.n / 2 : j);
    const turn = I.profile === 'moribe' && right && !d.rightMeshes ? Math.PI : 0;
    if (d.meshes) Q.setFromAxisAngle(Y, I.rot + (d.axisX ? -Math.PI / 2 : 0)
      + (reverseWindow ? Math.PI : 0) + turn);
    if (d.window) {
      const along = -d.W / 2 + (j + .5) * d.pw
        + (j === 0 ? .006 + e * (d.pw - .012) : -.006);
      const track = j === 0 ? -.04 : .04;
      const lx = d.lx + (d.axisX ? track : along), lz = d.lz + (d.axisX ? along : track);
      P.set(I.x + lx * I.c + lz * I.s, d.y, I.z - lx * I.s + lz * I.c); M.compose(P, Q, S);
      if (meshes) for (const m of meshes) m.setMatrixAt(index, M);   // 設営の始め（部品を配る前）は当たりだけ。比叡山の僧坊で読み込みが止まった（10/27）
      continue;
    }
    const left = j < d.n / 2;
    // 右の襖・比叡山の格子戸は裏返して引き手を召し合わせ側へ向ける。
    // 外周の障子は左右の框に手掛けがある。片面張りの紙を外へ、組子を室内へ向ける。
    // 側窓の専用座標も正の奥行きが正の壁側なので、壁の符号で向きを揃える。
    // 座敷境は従来の向きとし、溝・戸の行程・当たりは同じ寸法を使う。
    // 正の縮尺と回転を使い、共通の形・材質をそのまま使い回す。
    const reverse = d.tracked && (d.kind === 'shoji'
      ? (d.window ? d.window.s > 0 : d.entry && d.I.door.side > 0)
      : !left && (d.kind === 'fusuma' || d.kind === 'fusumaPlain' || d.kind === 'fusumaE' || d.kind === 'koshi'));
    Q.setFromAxisAngle(Y, I.rot + (reverse ? Math.PI : 0));
    // 閉めた時は二本の溝（前後に少しずらす）。開けると左右の壁の前へ引き込む
    // 幅だけ広げると全開時に戸当たりへ食い込むため、左右の組を内へ半分寄せる。
    // 召し合わせに重なりを作り、斜めから見ても襖・障子の間に素通しの隙間を残さない。
    const overlap = d.tracked ? HIEI_LEAF_OVERLAP : 0;
    const lx = d.lx - d.W / 2 + (j + .5) * d.pw + (left ? -1 : 1) * (e * leafTravel(d, j) - overlap / 2);
    const lz = d.lz + (j % 2 ? 1 : -1) * (d.tracked ? .04 : .02 + .045 * e);
    // 室内の形をまだ作っていない時も、同じ溝・開き具合で当たりを動かす。
    // 行列や当たりの入れ物は使い回し、動いている戸だけを書き換える。
    if (d.leaves) {
      const leaf = d.leaves[j], a = lx - (d.pw + overlap) / 2, b = lx + (d.pw + overlap) / 2;
      leaf.ax = I.x + a * I.c + lz * I.s; leaf.az = I.z - a * I.s + lz * I.c;
      leaf.bx = I.x + b * I.c + lz * I.s; leaf.bz = I.z - b * I.s + lz * I.c;
      leaf.x0 = Math.min(leaf.ax, leaf.bx) - leaf.r; leaf.x1 = Math.max(leaf.ax, leaf.bx) + leaf.r;
      leaf.z0 = Math.min(leaf.az, leaf.bz) - leaf.r; leaf.z1 = Math.max(leaf.az, leaf.bz) + leaf.r;
    }
    if (!d.meshes) continue;
    P.set(I.x + lx * I.c + lz * I.s, d.y + sill, I.z - lx * I.s + lz * I.c); M.compose(P, Q, S);
    for (const m of d.meshes) m.setMatrixAt(d.base + j, M);
  }
  if (d.meshes) for (const m of d.meshes) m.instanceMatrix.needsUpdate = true;
}

function setWant(rt, d, want) {
  if (d.want === want) return;
  if (!want && d.tracked) {
    // 閉め始めから戸口を止める。人がいる間は閉めず、戸を体へ滑り込ませない。
    if (doorwayOccupied(rt, d)) return;
    if (d.saved) Object.assign(d.solid, d.saved);
  }
  d.want = want;
  // 比叡山は引き戸が開き切ってから通す。正面の入室札とも時機を揃え、
  // 動き始めの障子・襖・格子戸を体が突き抜けないようにする。
  if (want && !d.tracked && !d.slidingSolids) solidOff(d);
  moving.add(d);
  if (rt.army && rt.army.play) rt.army.play('wood', { x: d.x, z: d.z }, .3);
}
// 戸口の帯に立っているか。稲葉山の玄関は柱の裏の溝まで含める。
function inDoorway(d, o) {
  if (d.tracked) return inDoorwayHiei(d, o);
  if (d.window) return false;
  const I = d.I, dx = o.pos.x - I.x, dz = o.pos.z - I.z;
  const lx = dx * I.c - dz * I.s, lz = dx * I.s + dz * I.c;
  // 壁の線と戸の溝の両方を見て、室内側で開閉する玄関が人を挟まないようにする。
  const clearance = d.slidingSolids ? (o.bodyRadius || .3) + d.solid.r : .35;
  const atWall = Math.abs(lz - d.lz) < clearance;
  const atTrack = !!d.slidingSolids && Math.abs(lz - d.lz - d.trackZ) < clearance + d.track;
  // 戸口の端でも体の幅まで見る。中心だけが脇へ出た人に戸を閉めない。
  const edgeClearance = d.slidingSolids ? clearance : .1;
  return (atWall || atTrack) && Math.abs(lx - d.lx) < d.W / 2 + edgeClearance && Math.abs(o.pos.y - d.y) < 1.2;
}

function inDoorwayHiei(d, o) {
  const I = d.frame || d.I, dx = o.pos.x - I.x, dz = o.pos.z - I.z;
  const lx = dx * I.c - dz * I.s, lz = dx * I.s + dz * I.c;
  return Math.abs(lz - d.lz) < .35 && Math.abs(lx - d.lx) < d.W / 2 + .1 && atDoorHeight(d, o);
}

// 引き込み先も含め、一枚の戸が次の位置までに体へ近づくかを調べる。
// 戸口だけの判定では、脇へ開く襖が壁際の人へ食い込む。離れる向きは止めない。
function leafApproaches(d, o, next) {
  if (!o.alive) return false;
  // 腰高の明かり障子は足元でなく上半身に当たる。窓台より低い者と、
  // 上の階の者は止めず、見える戸の上下端で体との重なりを調べる。
  if (d.window ? o.pos.y + 1.6 <= d.y || o.pos.y >= d.y + d.h
    : Math.abs(o.pos.y - d.y) >= 1.2) return false;
  const I = d.I, dx = o.pos.x - I.x, dz = o.pos.z - I.z;
  const x = dx * I.c - dz * I.s, z = dx * I.s + dz * I.c;
  const nowE = d.open * d.open * (3 - 2 * d.open), nextE = next * next * (3 - 2 * next);
  const radius = (o.bodyRadius || .3) + d.solid.r;
  for (let j = 0; j < d.n; j++) {
    const side = j < d.n / 2 ? -1 : 1;
    const center = d.lx - d.W / 2 + (j + .5) * d.pw;
    // 窓は片側の一枚だけを隣の戸へ重ねる。絵・当たりと同じ移動量を使う。
    const travel = d.window ? (j === 0 ? d.pw : 0) : side * d.W / 2;
    const a = center + nowE * travel, b = center + nextE * travel;
    const dzLeaf = z - d.lz - d.trackZ - (j % 2 ? 1 : -1) * d.track;
    if (Math.abs(dzLeaf) >= radius) continue;
    const nowX = Math.max(0, Math.abs(x - a) - d.leafW / 2);
    const nextX = Math.max(0, Math.abs(x - b) - d.leafW / 2);
    const sweepX = Math.max(0, Math.min(a, b) - d.leafW / 2 - x, x - Math.max(a, b) - d.leafW / 2);
    if (sweepX * sweepX + dzLeaf * dzLeaf < radius * radius
      && (nowX * nowX + dzLeaf * dzLeaf >= radius * radius || nextX < nowX)) return true;
  }
  return false;
}

let pickT = -1, pick = null;
// 壁の端にある柱も含め、手から戸までの線と壁の厚みを比べる。
// 共通の数値だけで計算し、札を探すたびに形や配列を作らない。
function pointSegmentDistanceSq(x, z, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, lengthSq = dx * dx + dz * dz;
  const t = lengthSq > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / lengthSq)) : 0;
  return (x - ax - t * dx) ** 2 + (z - az - t * dz) ** 2;
}
// 稲葉山の戸は手が届く面から操作する。引き込んだ戸が近くても、
// 間仕切りや妻壁の向こうから開閉しない。既存の壁の当たりを使う。
function doorReachable(d, u, targetX = d.spot.x, targetZ = d.spot.z) {
  const ax = u.pos.x, az = u.pos.z, dx = targetX - ax, dz = targetZ - az;
  // 用屋の連子窓は窓台が床上一・二七歩。腰の高さだけで手の届く線を
  // 調べると、開いた窓の下の板壁に遮られて内側の板戸を操作できない。
  // 窓の中央へ手を上げ、立った人の届く高さまでで既存の壁を調べる。
  const handY = d.window && d.I.profile === 'inabayama' && SETTINGS.quality === 'high'
    ? Math.max(u.pos.y + 1, Math.min(u.pos.y + 1.6, d.y + d.h / 2))
    : u.pos.y + 1;
  for (const wall of INTERIOR_WALLS) {
    if (wall === d.solid || d.slidingSolids?.includes(wall)
      || handY < wall.yBot || handY > wall.yTop) continue;
    const wx = wall.bx - wall.ax, wz = wall.bz - wall.az;
    const cross = dx * wz - dz * wx;
    if (Math.abs(cross) >= .000001) {
      const qx = wall.ax - ax, qz = wall.az - az;
      const t = (qx * wz - qz * wx) / cross;
      const s = (qx * dz - qz * dx) / cross;
      if (t >= 0 && t <= 1 && s >= 0 && s <= 1) return false;
    }
    // 中心線を横切らなくても、脇柱の角や平行な壁に手が遮られる。
    // 当たりの半径をそのまま使い、玄関と内戸の両方で同じ厚みを見る。
    const radiusSq = (wall.r || 0) ** 2;
    if (Math.min(
      pointSegmentDistanceSq(wall.ax, wall.az, ax, az, targetX, targetZ),
      pointSegmentDistanceSq(wall.bx, wall.bz, ax, az, targetX, targetZ),
      pointSegmentDistanceSq(ax, az, wall.ax, wall.az, wall.bx, wall.bz),
      pointSegmentDistanceSq(targetX, targetZ, wall.ax, wall.az, wall.bx, wall.bz),
    ) < radiusSq) return false;
  }
  return true;
}

// 自動で開ける時は札の的（窓や引き込んだ戸）ではなく、通る戸口を見る。
// 広い本堂の戸口も端から通れるよう、中央一点でなく開口の幅で測る。
// 稲葉山だけ実際の溝を使い、回転した番所も同じ局所座標で扱う。
function autoDoorNear(d, u, reach) {
  if (d.tracked) return Math.abs(u.pos.y - d.y) < 1.2 && doorDistance(d, u.pos) < reach;
  if (Math.abs(u.pos.y - d.y) >= 1.2) return false;
  if (!d.slidingSolids) return Math.hypot(d.x - u.pos.x, d.z - u.pos.z) < reach;
  const I = d.I, dx = u.pos.x - I.x, dz = u.pos.z - I.z;
  const x = dx * I.c - dz * I.s, z = dx * I.s + dz * I.c;
  const edge = Math.max(0, Math.abs(x - d.lx) - d.W / 2);
  return edge * edge + (z - d.lz - d.trackZ) ** 2 < reach * reach;
}

// 戸口の手の届く点へ調べる。中央への斜線では、端の人が脇壁に遮られる。
function autoDoorReachable(d, u) {
  if (d.tracked) return true;
  if (!d.slidingSolids) return true;
  const I = d.I, dx = u.pos.x - I.x, dz = u.pos.z - I.z;
  const x = Math.max(d.lx - d.W / 2 + .1, Math.min(d.lx + d.W / 2 - .1, dx * I.c - dz * I.s));
  const z = d.lz + d.trackZ;
  return doorReachable(d, u, I.x + x * I.c + z * I.s, I.z - x * I.s + z * I.c);
}

function nearest(rt) {
  if (rt.world.def.battleKey === 'hieizan' || DOORS[0]?.I.profile === 'hieizan') return nearestHiei(rt);
  if (pickT === rt.t) return pick?.I.disabled ? null : pick;
  pickT = rt.t; pick = null;
  const u = rt.player && rt.player.u;
  if (!u || !u.alive || rt.player.mounted) return null;
  let bd = 1.5, bestScore = Infinity;
  const preferPassage = SETTINGS.quality === 'high' && rt.world.def.battleKey === 'inabayama';
  for (const d of DOORS) {
    if (d.I.disabled || (!d.exterior && d.I.id + 1 !== u.naka) || (u.naka && d.I.id + 1 !== u.naka) || Math.abs(u.pos.y - (d.window ? d.lv.y : d.y)) > 1.2) continue;
    let passageAhead = false;
    // 稲葉山は開いた襖・障子の引き込み先でも操作できるよう、動く戸の表へ札を寄せる。
    // 閉じた戸口だけを的にすると、脇へ滑った戸の前に立っても「閉める」が出ない。
    // 絵・当たりと同じ幅と溝を使い、毎コマの配列・ベクトル生成は避ける。
    if (d.I.profile === 'inabayama' && SETTINGS.quality === 'high') {
      const I = d.I, dx = u.pos.x - I.x, dz = u.pos.z - I.z;
      const ux = dx * I.c - dz * I.s, uz = dx * I.s + dz * I.c;
      // 玄関や内戸の口に立った時は、脇の明かり窓より通る戸を選ぶ。
      // 戸尻の前や開け放った口では従来の近さを使い、窓も操作できるようにする。
      passageAhead = preferPassage && !d.window && !d.want
        && Math.abs(ux - d.lx) <= d.W / 2;
      const e = d.open * d.open * (3 - 2 * d.open);
      const shojiGrip = d.kind === 'shoji';
      const fusumaGrip = d.kind === 'fusuma' || d.kind === 'fusumaE';
      const timberGrip = d.kind === 'itado' || d.kind === 'koshi';
      const fittedGrip = shojiGrip || fusumaGrip || timberGrip;
      let best = Infinity, bestX = 0, bestZ = 0;
      for (let j = 0; j < d.n; j++) {
        const slide = d.window ? (j === 0 ? e * d.pw : 0) : (j < d.n / 2 ? -1 : 1) * e * d.W / 2;
        const center = d.lx - d.W / 2 + (j + .5) * d.pw + slide;
        const lz = d.lz + d.trackZ + (j % 2 ? 1 : -1) * d.track;
        // 襖は召し合わせ側の角引手、障子は左右の縦框の手掛けを操作の的にする。
        // 紙面の中央や引手のない戸尻から操作せず、右戸の半回転も絵と揃える。
        // 板戸・格子戸も召し合わせ框の彫り込み引手へ揃える。
        // 板面や格子の空隙を的にせず、引き込んだ後も実際の引手から閉める。
        // 毎コマの配列やベクトルは増やさない。
        const inset = Math.max(0, d.leafW / 2 - .08);
        const gripInset = Math.max(0, d.leafW / 2 - (timberGrip ? .02 : shojiGrip ? .035 : .13));
        for (let point = 0; point < (shojiGrip ? 2 : fittedGrip ? 1 : 4); point++) {
          const lx = fittedGrip
            ? center + (shojiGrip ? (point ? 1 : -1) : (j < d.n / 2 ? 1 : -1)) * gripInset
            : point === 0 ? Math.max(center - d.leafW / 2, Math.min(center + d.leafW / 2, ux))
              : point === 1 ? center : center + (point === 2 ? -inset : inset);
          const distance = (lx - ux) ** 2 + (lz - uz) ** 2;
          if (distance >= best || distance >= bd * bd) continue;
          d.spot.x = I.x + lx * I.c + lz * I.s;
          d.spot.z = I.z - lx * I.s + lz * I.c;
          if (!doorReachable(d, u)) continue;
          best = distance;
          bestX = d.spot.x; bestZ = d.spot.z;
        }
      }
      if (!isFinite(best)) continue;
      // 最後に調べた戸が壁の裏でも、札は手の届く最寄りの戸に残す。
      d.spot.x = bestX; d.spot.z = bestZ;
    }
    const dist = Math.hypot(d.spot.x - u.pos.x, d.spot.z - u.pos.z);
    // 玄関脇の明かり障子へ札を奪われず、同程度に近い通行用の戸を選ぶ。
    // 窓も一・五歩まで操作できるまま、選ぶ順だけ三十五センチ控える。
    // 稲葉山以外は従来どおり最寄りの戸を選ぶ。
    // 距離と手の届く線の確認を通った戸だけを優先する。壁越しには選ばない。
    const score = dist + (preferPassage && d.window ? .35 : 0) - (passageAhead ? 2 : 0);
    if (dist < bd && score < bestScore) {
      bestScore = score; pick = d;
      // 窓に加えた優先度を距離の上限へ使うと、後の戸を調べ落とす。
      if (!preferPassage) bd = dist;
    }
  }
  return pick;
}

function nearestHiei(rt) {
  if (pickT === rt.t) return pick?.I.disabled ? null : pick;
  pickT = rt.t; pick = null;
  const u = rt.player && rt.player.u;
  if (!u || !u.alive || rt.player.mounted) return null;
  let bd = 1.5;
  for (const d of DOORS) {
    if (d.I.disabled) continue;
    if (d.I.id + 1 !== u.naka && !((d.entry || d.window) && !u.naka)) continue;
    // 明かり障子の基準は腰壁の上。僧坊の床高も加わるので、外の地面からは
    // 足元との差が一・二メートルを超えていた。窓は下の三次元の手掛け距離で
    // 判定し、腰壁・窓枠越しの遮りも従来どおり調べる。通常の戸は階を区別する。
    if (!d.window && Math.abs(u.pos.y - d.y) > 1.2) continue;
    const dist = doorDistance(d, u.pos, true);
    if (dist < bd) { bd = dist; pick = d; }
  }
  return pick;
}

let autoT = 0;
// 毎コマ（naka.js の nakaTick の終わり）。flagged：中にいる兵
export function nakaDoorTick(rt, dt, flagged) {
  if (rt.def.key === 'okehazama') return okeNakaDoorTick(rt, dt, flagged);
  if (rt.def.key === 'moribe') return moribeNakaDoorTick(rt, dt, flagged);
  if (!DOORS.length) return;
  if (rt.addInteract && !rt._nakaDoors) {
    rt._nakaDoors = true;
    rt.addInteract('naka_to', () => { const d = nearest(rt); return d && !(d.want && rt.def.doorCloseOK?.(rt) === false) ? d.tracked ? d.touch : d.spot : null; }, '開ける', () => {
      const d = nearest(rt); if (d) setWant(rt, d, d.want ? 0 : 1);
    }, { r: 1.5, prio: -3 });
    const it = rt.interacts[rt.interacts.length - 1];
    Object.defineProperty(it, 'label', { get: () => (nearest(rt) && nearest(rt).want ? '閉める' : '開ける'), configurable: true });
  }
  // 中の兵は戸口へ来たら自分で開ける。遊び手も閉じた戸へ押し続けると開く
  autoT -= dt;
  if (autoT <= 0) {
    autoT = .2;
    const u = rt.player && rt.player.u;
    if (u && u.alive && (rt.player.blockedWalkT || 0) >= .5) {
      const nearestDoor = nearest(rt);
      if (nearestDoor?.slidingSolids || SETTINGS.quality === 'high' && rt.def.battleKey === 'inabayama') {
        // 近い明かり障子に操作の的を奪われても、押している玄関・内戸を開ける。
        for (const d of DOORS) {
          if (!d.slidingSolids || d.window || d.want || d.I.disabled
            || (!d.exterior && u.naka !== d.I.id + 1) || (u.naka && u.naka !== d.I.id + 1)
            || !autoDoorNear(d, u, 1.1)) continue;
          if (autoDoorReachable(d, u)) { setWant(rt, d, 1); break; }
        }
      } else {
        const d = nearestDoor;
        if (d && !d.window && !d.want && doorDistance(d, u.pos) < 1.1) setWant(rt, d, 1);
      }
    }
    for (const o of flagged) {
      if (o.isPlayer || !o.alive || !o.naka) continue;
      const I = DOORS.find((d) => d.I.id + 1 === o.naka)?.I;
      if (!I || I.disabled || !I.doors) continue;
      for (const d of I.doors) if (!d.window && !d.want && autoDoorNear(d, o, 1.2) && autoDoorReachable(d, o)) setWant(rt, d, 1);
    }
    // 外から来る兵も正面の障子を開ける。入口で立ち往生させない。
    for (const d of DOORS) if (!d.I.disabled && d.entry && !d.want) {
      for (const o of rt.army?.units || []) {
        if (o.isPlayer || !o.alive || Math.abs(o.pos.y - d.y) > 1.2) continue;
        if (doorDistance(d, o.pos) < 1.2) { setWant(rt, d, 1); break; }
      }
    }
    // 稲葉山の玄関は外の兵にも開けられる。室内の兵だけを見ると、
    // 城・館・堂へ入ろうとする兵が閉じた戸の外で詰まってしまう。
    for (const d of DOORS) {
      if (!d.slidingSolids || !d.exterior || d.window || d.want || d.I.disabled) continue;
      for (const o of rt.army?.units || flagged) {
        if (o.isPlayer || !o.alive || o.isStruct || o.mounted || (o.naka && o.naka !== d.I.id + 1)) continue;
        const reach = d.W / 2 + Math.abs(d.trackZ) + 1.2;
        if (Math.abs(o.pos.x - d.x) > reach || Math.abs(o.pos.z - d.z) > reach) continue;
        if (autoDoorNear(d, o, 1.2) && autoDoorReachable(d, o)) {
          setWant(rt, d, 1); break;
        }
      }
    }
  }
  for (const d of moving) {
    if (d.I.disabled) { moving.delete(d); continue; }
    if (d.tracked && !d.want && doorwayOccupied(rt, d)) { setWant(rt, d, 1); continue; }
    // 玄関の外にいる兵も、戸口と引き込み先で挟まない。
    // 既存の兵の並びを使い、毎コマの配列は作らない。
    const exteriorEntry = !!d.slidingSolids && d.exterior;
    const occupants = exteriorEntry ? rt.army?.units || flagged : flagged;
    if (d.slidingSolids && !d.want) {
      // 閉まり切ってからでは遅い。人が戸口にいる間は閉じずに引き戻す。
      const u = rt.player && rt.player.u;
      if ((u && u.alive && inDoorway(d, u)) || occupants.some(o => o.alive && (o.naka === d.I.id + 1 || exteriorEntry && !o.naka) && inDoorway(d, o))) setWant(rt, d, 1);
    }
    const next = Math.max(0, Math.min(1, d.open + (d.want ? 1 : -1) * dt * 2.6));
    if (d.tracked && leafSweepOccupied(rt, d, next)) continue;
    if (d.slidingSolids) {
      const u = rt.player && rt.player.u;
      let blocked = u && leafApproaches(d, u, next);
      if (!blocked) for (const o of occupants) {
        if (o === u || !(o.naka === d.I.id + 1 || exteriorEntry && !o.naka)) continue;
        if (leafApproaches(d, o, next)) { blocked = true; break; }
      }
      if (blocked) {
        // 引き込み先の人にも閉じる戸を押し付けない。閉まりかけの位置で
        // 止め続けずに開き直し、城館・本堂の通り口を空ける。
        if (!d.want) setWant(rt, d, 1);
        continue;
      }
    }
    d.open = next;
    pose(d);
    if (d.open !== d.want) continue;
    if (d.want && d.tracked) solidOff(d);
    if (!d.want) {
      // 閉め切った時に戸口に人が立っていれば、開けたままにして待つ
      const u = rt.player && rt.player.u;
      if ((u && inDoorway(d, u)) || occupants.some((o) => o.alive && (o.naka === d.I.id + 1 || exteriorEntry && !o.naka) && inDoorway(d, o))) { d.open = .02; continue; }
      if (d.saved && !d.slidingSolids) Object.assign(d.solid, d.saved);
    }
    moving.delete(d);
  }
}

function leafTravel(d, j) {
  return d.tracked && d.n === 4 ? d.pw * (j === 0 || j === 3 ? 1 : 2) : d.W / 2;
}

function stopOffset(d) { return d.n === 4 ? d.W / 2 + d.pw : d.W; }

function addDoorStops(d) {
  const I = d.frame || d.I;
  for (const side of [-1, 1]) {
    const x = d.lx + side * (stopOffset(d) + .025), a = d.lz - .09, b = d.lz + .09;
    const ax = I.x + x * I.c + a * I.s, az = I.z - x * I.s + a * I.c;
    const bx = I.x + x * I.c + b * I.s, bz = I.z - x * I.s + b * I.c;
    const r = .025;
    const solid = { k: 's', ax, az, bx, bz, r, naka: d.I.id,
      yBot: d.y + sillHeight(d), yTop: d.y + d.h,
      x0: Math.min(ax, bx) - r, x1: Math.max(ax, bx) + r,
      z0: Math.min(az, bz) - r, z1: Math.max(az, bz) + r };
    SOLIDS.push(solid); INTERIOR_WALLS.push(solid);
  }
}

function sillHeight(d) { return d.window ? 0 : d.tracked ? (d.entry ? .05 : d.I.kind === 'sobo' ? HIEI_SOBO_SILL : .04) : 0; }

function panelHeight(d) { return d.h - sillHeight(d); }

function atDoorHeight(d, o) {
  // 明かり障子は腰壁の上にある。足元の高さだけで除外すると、
  // 窓下の人の頭や肩を戸が横切る。戸の上下端と体全体で比べる。
  if (d.tracked && d.window) return o.pos.y + (o.bodyHeight || 1.72 * (o.mesh?.scale.y || 1)) > d.y + sillHeight(d) && o.pos.y < d.y + d.h;
  return Math.abs(o.pos.y - d.y) < 1.2;
}

function doorwayOccupied(rt, d) {
  const u = rt.player && rt.player.u;
  if (u && u.alive && inDoorway(d, u)) return true;
  const units = rt.army && rt.army.units;
  if (units) for (const o of units) if (o.alive && inDoorway(d, o)) return true;
  return false;
}

function leafSweepHits(d, o, from, to) {
  if (!o || !o.alive || !atDoorHeight(d, o)) return false;
  const I = d.frame || d.I, dx = o.pos.x - I.x, dz = o.pos.z - I.z;
  const x = dx * I.c - dz * I.s, z = dx * I.s + dz * I.c;
  const radius = o.bodyRadius || .3;
  if (Math.abs(z - d.lz) > radius + .075 || Math.abs(x - d.lx) > d.W + radius) return false;
  for (let j = 0; j < d.n; j++) {
    const direction = j < d.n / 2 ? -1 : 1;
    // 描く戸・動く当たりと同じ召し合わせの幅と中心を使う。
    // 框の重なりの端まで調べ、引き込み先で体をかすめてから止まらないようにする。
    const base = d.lx - d.W / 2 + (j + .5) * d.pw - direction * HIEI_LEAF_OVERLAP / 2;
    const travel = leafTravel(d, j);
    const a = base + direction * from * travel, b = base + direction * to * travel;
    const half = (d.pw + HIEI_LEAF_OVERLAP) / 2;
    const nearestX = Math.max(Math.min(a, b) - half, Math.min(Math.max(a, b) + half, x));
    const gapZ = Math.max(0, Math.abs(z - d.lz - (j % 2 ? .04 : -.04)) - .035);
    if ((x - nearestX) ** 2 + gapZ * gapZ < radius * radius) return true;
  }
  return false;
}

function leafSweepOccupied(rt, d, next) {
  const from = d.open * d.open * (3 - 2 * d.open), to = next * next * (3 - 2 * next);
  const player = rt.player && rt.player.u;
  if (leafSweepHits(d, player, from, to)) return true;
  const units = rt.army && rt.army.units;
  if (units) for (const o of units) if (o !== player && leafSweepHits(d, o, from, to)) return true;
  return false;
}

function doorDistance(d, p, touch = false) {
  if (!d.tracked) return Math.hypot(d.x - p.x, d.z - p.z);
  const I = d.frame || d.I, dx0 = p.x - I.x, dz0 = p.z - I.z;
  const lx = dx0 * I.c - dz0 * I.s, lz = dx0 * I.s + dz0 * I.c;
  // 自動で開ける判定は戸口へ向かう者だけ。脇で戦う兵につられて開けない。
  if (!touch) {
    if (Math.abs(lx - d.lx) > d.W / 2 + .1) return Infinity;
    return Math.hypot(Math.max(0, Math.abs(lx - d.lx) - d.W / 2), lz - d.lz);
  }
  // 外からは外壁の開口越しに届く範囲だけ。壁の裏へ引き込んだ戸は内側から扱う。
  // 側窓は戸の座標を九十度回すと、戸の正の奥行きが建物の正の横方向になる。
  // 正背面・側面とも壁の符号が外向き。逆にすると室内側を外と誤り、
  // 外からは腰壁や窓脇の壁を越えて障子を扱えてしまう。
  const wallSide = d.window ? d.window.s : d.I.door.side;
  const outside = d.window ? wallSide * lz > HIEI_ENTRY_TRACK
    : d.entry && wallSide * lz > d.lv.d / 2;
  if (outside && Math.abs(lx - d.lx) > d.W / 2 + .1) return Infinity;
  let best = Infinity, bestX = d.touch.x, bestZ = d.touch.z;
  // 紙面や格子の中央を押して開けず、描かれた引き手へ手を伸ばす。
  // 障子は左右の框、襖・格子戸は召し合わせ側。右の戸の反転も描画と揃える。
  // 板戸には従来の判定を使う。候補の配列や座標の入れ物は毎コマ作らない。
  const shoji = d.kind === 'shoji';
  const fusuma = d.kind === 'fusuma' || d.kind === 'fusumaPlain' || d.kind === 'fusumaE';
  const fittedGrip = shoji || fusuma || d.kind === 'koshi';
  // 窓障子の手掛けも、描いた框の高さへ札を置く。床の高さへ札を落とさない。
  const gripY = d.y + sillHeight(d) + (fittedGrip ? Math.min(.85, panelHeight(d) * .48) : panelHeight(d) / 2);
  const grips = shoji ? 2 : 1;
  for (let candidate = 0; candidate < d.leaves.length * grips; candidate++) {
    const j = Math.floor(candidate / grips), leaf = d.leaves[j];
    const dx = leaf.bx - leaf.ax, dz = leaf.bz - leaf.az;
    const length2 = dx * dx + dz * dz;
    let t;
    if (fittedGrip) {
      const inset = (fusuma ? .13 : .035) / (d.pw + HIEI_LEAF_OVERLAP);
      t = shoji ? (candidate % grips ? 1 - inset : inset)
        : j < d.n / 2 ? 1 - inset : inset;
    } else t = length2 > 0 ? Math.max(0, Math.min(1,
      ((p.x - leaf.ax) * dx + (p.z - leaf.az) * dz) / length2)) : 0;
    const x = leaf.ax + dx * t, z = leaf.az + dz * t;
    if (outside) {
      // 斜めからも壁の開口を通して手を伸ばす。遊び手の横位置だけでは、
      // 窓枠や戸柱の裏へ滑った戸を、白壁越しに扱えてしまう。
      // 窓は戸専用の座標、正面戸は建物の座標で、同じ開口幅を使う。
      const tx = (x - I.x) * I.c - (z - I.z) * I.s;
      const tz = (x - I.x) * I.s + (z - I.z) * I.c;
      const wallZ = wallSide * (d.window ? HIEI_ENTRY_TRACK : d.lv.d / 2);
      const along = (wallZ - lz) / (tz - lz);
      if (along > 0 && along < 1) {
        if (Math.abs(lx + (tx - lx) * along - d.lx) > d.W / 2) continue;
        // 腰壁や窓上の小壁も手を遮る。横幅だけでは、低い地面から
        // 腰壁を斜めに突き抜けて明かり障子の手掛けへ届いてしまう。
        // 手から引き手への線が、外壁の実際の開口高を通る時だけ扱える。
        const handY = p.y + 1, wallY = handY + (gripY - handY) * along;
        if (wallY < d.y || wallY > d.y + d.h) continue;
      }
    }
    // 腰の高さの手から引き手までを測る。窓の下の低い地面から、
    // 横の距離だけで高い障子を扱えるようにしない。
    const distance = Math.hypot(p.x - x, p.z - z, gripY - (p.y + 1));
    if (distance >= best) continue;
    // 柱の陰の一枚だけで戸全体を候補から外さない。
    // 各戸へ実際に手が届くか調べ、届く戸の中から最寄りの引き手を選ぶ。
    if (touch) {
      d.touch.x = x; d.touch.z = z; d.touch.y = gripY;
      if (partitionBetween(d, p, j)) continue;
      bestX = x; bestZ = z;
    }
    best = distance;
  }
  if (touch) { d.touch.x = bestX; d.touch.z = bestZ; }
  return best;
}

function doorStopBetween(d, p, wx, wz, handY, rise) {
  if (!d.tracked) return false;
  const I = d.frame || d.I, dx = p.x - I.x, dz = p.z - I.z;
  const x = dx * I.c - dz * I.s, z = dx * I.s + dz * I.c;
  const rx = wx * I.c - wz * I.s, rz = wx * I.s + wz * I.c;
  for (let side = -1; side <= 1; side += 2) {
    const cx = d.lx + side * (stopOffset(d) + .025);
    let near = .001, far = .999;
    if (Math.abs(rx) < .000001) {
      if (Math.abs(x - cx) > .025) continue;
    } else {
      const a = (cx - .025 - x) / rx, b = (cx + .025 - x) / rx;
      near = Math.max(near, Math.min(a, b)); far = Math.min(far, Math.max(a, b));
    }
    if (Math.abs(rz) < .000001) {
      if (Math.abs(z - d.lz) > .09) continue;
    } else {
      const a = (d.lz - .09 - z) / rz, b = (d.lz + .09 - z) / rz;
      near = Math.max(near, Math.min(a, b)); far = Math.min(far, Math.max(a, b));
    }
    if (near <= far) {
      const ya = handY + rise * near, yb = handY + rise * far;
      if (Math.max(ya, yb) >= d.y + sillHeight(d) && Math.min(ya, yb) <= d.y + d.h) return true;
    }
  }
  return false;
}

function partitionBetween(d, p, targetLeaf) {
  if (!d.tracked) return false;
  const I = d.I;
  const dx = p.x - I.x, dz = p.z - I.z;
  const ax = dx * I.c - dz * I.s, az = dx * I.s + dz * I.c;
  const tx = d.touch.x - I.x, tz = d.touch.z - I.z;
  const rx = tx * I.c - tz * I.s - ax, rz = tx * I.s + tz * I.c - az;
  // 建物の角から斜めに手を伸ばす時も、側壁を突き抜けて戸を扱わない。
  // 操作する戸の面だけでなく、手が横切る四周の壁を実際の窓・戸口で調べる。
  // 既存の開口寸法を借り、戸を選ぶ時にも配列や形を作らない。
  const hand = p.y + 1 - d.lv.y, riseToGrip = d.touch.y - (p.y + 1);
  for (let axis = 0; axis < 2; axis++) {
    const start = axis === 0 ? ax : az, delta = axis === 0 ? rx : rz;
    if (Math.abs(delta) < .000001) continue;
    const half = (axis === 0 ? d.lv.w : d.lv.d) / 2;
    for (let side = -1; side <= 1; side += 2) {
      const along = (side * half - start) / delta;
      if (along <= .001 || along >= .999) continue;
      const height = hand + riseToGrip * along;
      if (height < 0 || height > d.lv.h) continue;
      const across = axis === 0 ? az + rz * along : ax + rx * along;
      const span = (axis === 0 ? d.lv.d : d.lv.w) / 2;
      if (Math.abs(across) > span) continue;
      let opening = axis === 1 && side === I.door.side && d.lv === I.levels[0]
        && Math.abs(across - I.door.lx) < I.door.w / 2
        && height <= (I.door.h ?? 2);
      if (!opening) for (const window of d.lv.windows || []) {
        if (window.face === (axis === 0 ? 'x' : 'z') && window.s === side
          && Math.abs(across - window.t) < window.w / 2
          && height >= window.y0 && height <= window.y1) { opening = true; break; }
      }
      if (!opening) return true;
    }
  }
  for (const v of d.lv.layout.walls) {
    if (v.guideOnly) continue;
    if (fixedPanelBetween(v, ax, az, rx, rz)) return true;
  }
  // 正面の障子と座敷の障子は近い。間仕切りの口だけを調べると、
  // 閉じた正面戸越しに奥の戸を開けられる。滑った後の実際の戸も調べる。
  // 既存の戸の当たりを世界座標で使い、操作する時に配列や形を作らない。
  const wx = d.touch.x - p.x, wz = d.touch.z - p.z, handY = p.y + 1;
  // 低い襖と窓障子では引き手の高さが違う。手から引き手への線で遮りを調べる。
  const rise = d.touch.y - handY;
  // 経巻棚・須弥壇なども手を遮る。描画と通行が使う調度の寸法を借り、
  // 低い机の上には手を通す。比叡山だけの判定で、入れ物は作らない。
  for (const prop of d.lv.layout.props) {
    let near = .001, far = .999;
    for (let axis = 0; axis < 3; axis++) {
      const start = axis === 0 ? ax : axis === 1 ? handY - d.lv.y : az;
      const delta = axis === 0 ? rx : axis === 1 ? rise : rz;
      const center = axis === 0 ? prop.x : axis === 1 ? (prop.y || 0) + prop.h / 2 : prop.z;
      const half = (axis === 0 ? prop.w : axis === 1 ? prop.h : prop.d) / 2;
      if (Math.abs(delta) < .000001) {
        if (start < center - half || start > center + half) { far = -1; break; }
      } else {
        const a = (center - half - start) / delta, b = (center + half - start) / delta;
        near = Math.max(near, Math.min(a, b)); far = Math.min(far, Math.max(a, b));
        if (near > far) break;
      }
    }
    if (near <= far) return true;
  }
  // 比叡山の堂内・縁の柱も、引き手へ伸ばす手を遮る。
  // 固定の間仕切りだけでは、戸脇の丸柱越しに開閉できてしまう。
  // 柱は設営時に借りた当たりを使い、操作の候補を調べる時だけ線分と比べる。
  const reach2 = wx * wx + wz * wz;
  if (reach2 > .000001 && I.doorPosts) for (const post of I.doorPosts) {
    const along = Math.max(0, Math.min(1, ((post.x - p.x) * wx + (post.z - p.z) * wz) / reach2));
    const y = handY + rise * along;
    if (y < post.yBot || y > post.yTop) continue;
    const dx = p.x + wx * along - post.x, dz = p.z + wz * along - post.z;
    if (dx * dx + dz * dz < post.r * post.r) return true;
  }
  for (const other of I.doors || []) {
    if (other.lv !== d.lv) continue;
    if (doorStopBetween(other, p, wx, wz, handY, rise)) return true;
    // 二本溝で重なった同じ組の戸も手を遮る。狙った一枚だけを除き、
    // 手前の紙や格子を突き抜けて奥の引き手を扱わない。
    // 引き手ごとに調べるので、手前にある戸からは引き続き開閉できる。
    const leaves = other.leaves;
    if (!leaves) continue;
    for (let j = 0; j < leaves.length; j++) {
      if (other === d && j === targetLeaf) continue;
      const leaf = leaves[j];
      if (slidingPanelBetween(leaf, p, wx, wz, handY, rise)) return true;
    }
  }
  return false;
}

function slidingPanelBetween(leaf, p, wx, wz, handY, rise) {
  const sx = leaf.bx - leaf.ax, sz = leaf.bz - leaf.az, length = Math.hypot(sx, sz);
  if (length < .000001) return false;
  const c = sx / length, s = sz / length;
  const dx = p.x - (leaf.ax + leaf.bx) / 2, dz = p.z - (leaf.az + leaf.bz) / 2;
  let near = .001, far = .999;
  for (let axis = 0; axis < 3; axis++) {
    const start = axis === 0 ? dx * c + dz * s : axis === 1 ? -dx * s + dz * c : handY;
    const delta = axis === 0 ? wx * c + wz * s : axis === 1 ? -wx * s + wz * c : rise;
    const low = axis === 0 ? -length / 2 : axis === 1 ? -leaf.r : leaf.yBot;
    const high = axis === 0 ? length / 2 : axis === 1 ? leaf.r : leaf.yTop;
    if (Math.abs(delta) < .000001) {
      if (start < low || start > high) return false;
    } else {
      const a = (low - start) / delta, b = (high - start) / delta;
      near = Math.max(near, Math.min(a, b)); far = Math.min(far, Math.max(a, b));
      if (near > far) return false;
    }
  }
  return true;
}

function fixedPanelBetween(v, ax, az, rx, rz) {
  const sx = v.bx - v.ax, sz = v.bz - v.az, length = Math.hypot(sx, sz);
  if (length < .000001) return false;
  const c = sx / length, s = sz / length;
  const dx = ax - (v.ax + v.bx) / 2, dz = az - (v.az + v.bz) / 2;
  let near = .001, far = .999;
  for (let axis = 0; axis < 2; axis++) {
    const start = axis === 0 ? dx * c + dz * s : -dx * s + dz * c;
    const delta = axis === 0 ? rx * c + rz * s : -rx * s + rz * c;
    const half = axis === 0 ? length / 2 : .06;
    if (Math.abs(delta) < .000001) {
      if (start < -half || start > half) return false;
    } else {
      const a = (-half - start) / delta, b = (half - start) / delta;
      near = Math.max(near, Math.min(a, b)); far = Math.min(far, Math.max(a, b));
      if (near > far) return false;
    }
  }
  return true;
}

// 森部は戸板・框・引手の実寸を使い、他の戦は上の共通処理を使う。
function moribeAddNakaDoors(I, lv, y0, y1) {
  if (SKIP.includes(I.kind) || I.open || I.profile === 'yagura') return;
  const portals = [...(lv.layout.portals || [])];
  // 森部の三棟は外の戸口にも板戸を納める。壁の前へ引き、内側の障子とは別に動かす。
  if (I.profile === 'moribe' && lv.k === 0 && ['hondo', 'yashiki'].includes(I.kind)) {
    portals.push({ x: I.door.lx, z: I.door.side * (lv.d / 2 + .16), w: I.door.w, kind: 'itado', exterior: true });
  }
  for (const p of portals) {
    let l = -Infinity, r = Infinity, paper = true;
    if (p.exterior) { l = p.x - p.w / 2; r = p.x + p.w / 2; paper = false; }
    for (const v of p.exterior ? [] : lv.layout.walls) {
      if (v.guideOnly || Math.abs(v.az - p.z) > .01 || Math.abs(v.bz - p.z) > .01) continue;
      const a = Math.min(v.ax, v.bx), b = Math.max(v.ax, v.bx);
      if (b <= p.x + .01 && b > l) { l = b; paper = v.paper; }
      if (a >= p.x - .01 && a < r) r = a;
    }
    if (!isFinite(l) || !isFinite(r) || r - l < .5 || r - l > 4.4) continue;
    const temple = TEMPLE.includes(I.kind);
    const kind = p.kind || (temple ? 'koshi' : !paper ? 'itado' : ['goten', 'yashiki', 'shisha'].includes(I.kind) ? 'fusumaE' : 'shoji');
    // 森部の間仕切りは十四センチ角の戸脇柱の内面へ戸を納める。
    // 召合せ用に足す幅（二十四ミリ）は両端にも十二ミリずつ出るため、
    // その分も引く。鴨居の当たりは柱芯まで残し、戸板とその当たりだけをそろえる。
    // 柱へ框を密着させず、片側二ミリの遊びを取る。召合せの重なりは残す。
    // 外戸も戸口の見込み板（二センチ）と召合せの張り出しを引く。
    // 内外とも框の端と縦木の間には二ミリの遊びを残す。
    const inset = I.profile === 'moribe' ? (p.exterior ? .02 : .07) + .012 + .002 : 0;
    const W = r - l - inset * 2, n = Math.max(2, Math.round(W / 1.8) * 2);
    const [ax, az] = I.P(l, p.z), [bx, bz] = I.P(r, p.z), rad = .06;
    // 森部の格子戸は腰板・框・貫のある木製建具。閉じた戸を紙扱いで槍が抜けないようにする。
    // 戸板ごとの当たりへもこの区別を引き継ぎ、開けば横へ動いた位置だけで受ける。
    const solid = { k: 's', ax, az, bx, bz, r: rad, yBot: y0, yTop: p.exterior ? lv.y + I.door.h : y1, naka: I.id, fusuma: kind !== 'itado' && !(I.profile === 'moribe' && kind === 'koshi'),
      x0: Math.min(ax, bx) - rad, x1: Math.max(ax, bx) + rad, z0: Math.min(az, bz) - rad, z1: Math.max(az, bz) + rad };
    if (I.profile !== 'moribe') { SOLIDS.push(solid); INTERIOR_WALLS.push(solid); }
    const [x, z] = I.P((l + r) / 2, p.z);
    // 固定の襖・障子と高さをそろえ、閉じた戸の上に鴨居を残す。
    const headH = I.profile === 'moribe' && I.kind === 'yashiki' ? Math.min(2.2, lv.h) : lv.h > 3 ? 2.3 : lv.h;
    // 森部の内戸も固定戸と同じく、上下の框を敷居・鴨居の溝へ掛ける。
    // 下框は六ミリ、上框は二十八ミリ掛け、溝底に二ミリの遊びを残す。
    // 森部の外の板戸は、敷居・鴨居の溝へ上下の框を掛ける。
    // 上を二センチ空けると框が鴨居の外に浮き、横へ引く戸を保持できない。
    // 外装の上溝（三センチ）の底から二ミリ離し、形と当たりを同じ戸丈にする。
    const exteriorGroove = I.profile === 'moribe' && p.exterior;
    const doorH = p.exterior ? I.door.h + (exteriorGroove ? .028 : -.02) : I.profile === 'moribe' ? headH + .028 : lv.h > 3 ? 2.3 : lv.h - .02;
    if (I.profile === 'moribe' && !p.exterior) {
      // 開くのは戸板だけ。鴨居と小壁の当たりは開閉から切り離して残す。
      const headY = lv.y + headH;
      solid.yTop = lv.y + doorH;
      if (headY < y1) {
        const head = { ...solid, yBot: headY, yTop: y1, fusuma: false, bodyOverlap: true };
        SOLIDS.push(head); INTERIOR_WALLS.push(head);
      }
    }
    // 屋敷の内側は厚さ六・六センチの畳より敷居を高くし、戸を畳へ埋めない。
    // 外の下溝は敷居上面四センチから八ミリ下がる。底に二ミリの遊びを残す。
    const sill = exteriorGroove ? .034 : I.profile === 'moribe' ? (!p.exterior && I.kind === 'yashiki' ? .07 : .04) - .006 : 0;
    const d = { I, lv, kind, exterior: !!p.exterior, lx: (l + r) / 2, lz: p.z, W, n, pw: W / n, h: doorH - sill, y: lv.y + sill, x, z, solid, saved: null, open: 0, want: 0, meshes: null, base: 0 };
    if (I.profile === 'moribe') {
      {
        // 室内の戸当たりは furnishLayout と同じ四センチ幅・十八センチの見込み。
        // 全開の戸の木口から一センチ離し、見える木だけで体・槍・手を止める。
        // 設営時に登録し、開閉中の形や毎コマの仕事は増やさない。
        // 外の板戸は b_moribe.js の縦木（幅四・見込み十八センチ）へ合わせる。
        // 内側の戸当たりと同様に、描いた木の範囲で体・槍・手を止める。
        const stopX = W + .012 + .01 + .02;
        const stopZ = p.exterior ? p.z : p.z + .155;
        // 戸当たりは溝へ延ばさず、敷居の上から従来の上端までに納める。
        const stopBottom = p.exterior ? lv.y + .04 : d.y + .006;
        const stopTop = p.exterior ? lv.y + I.door.h : lv.y + headH - .02;
        for (const side of [-1, 1]) {
          const sx = d.lx + side * stopX;
          const [ax, az] = I.P(sx, stopZ - .07), [bx, bz] = I.P(sx, stopZ + .07);
          const stop = { k: 's', ax, az, bx, bz, r: .02, yBot: stopBottom, yTop: stopTop,
            naka: I.id, bodyOverlap: true,
            x0: Math.min(ax, bx) - .02, x1: Math.max(ax, bx) + .02,
            z0: Math.min(az, bz) - .02, z1: Math.max(az, bz) + .02 };
          SOLIDS.push(stop); INTERIOR_WALLS.push(stop);
          (lv.handObstacles || (lv.handObstacles = [])).push({
            x0: sx - .02, x1: sx + .02, z0: stopZ - .09, z1: stopZ + .09,
            y0: stopBottom, y1: stopTop,
          });
        }
      }
      // 戸口全体の壁を消す代わりに、戸板一枚ずつへ当たりを持たせる。
      // 開いた戸も引き残した戸も、見えている位置で体を止める。
      d.panelSolids = [];
      for (let j = 0; j < n; j++) {
        // 戸板の下端は敷居の上。壁用の床下四十センチまで当たりを延ばさない。
        // 上端も描く框へそろえ、外の板戸だけ鴨居まで見えない木を残さない。
        const leaf = { ...solid, r: MORIBE_PANEL_R, yBot: d.y, yTop: d.y + d.h };
        // 紙だけ槍を通す。共用部品の四センチ幅の框を戸幅・戸丈と同じ比率で残す。
        if (kind === 'shoji' || kind === 'fusuma') {
          leaf.paperFrameX = .04 * (d.pw + .024) / .9;
          leaf.paperFrameY = .04 * d.h / 1.8;
          leaf.paperLattice = kind === 'shoji';
        }
        d.panelSolids.push(leaf); SOLIDS.push(leaf); INTERIOR_WALLS.push(leaf);
      }
      moribePose(d);
    }
    (I.doors || (I.doors = [])).push(d); DOORS.push(d);
    // 森部の堂は内陣の格子戸も閉じて納め、「開ける」で入る。
    if (temple && I.profile !== 'moribe') { d.open = d.want = 1; moribeSolidOff(d); }
  }
  // 明かり障子は二枚を引き違いにする。片方へ重ね、狭い外陣でも間仕切りへ突き抜けない。
  // 腰壁は残し、窓の中は二枚の戸板と同じ位置に当たりを置く。
  if (I.profile === 'moribe') for (const win of lv.windows || []) {
    if (!win.shoji || !win.sliding) continue;
    const axisX = win.face === 'x';
    const lx = axisX ? win.s * (lv.w / 2 - .1) : win.t;
    const lz = axisX ? win.t : win.s * (lv.d / 2 - .1);
    const [x, z] = I.P(lx, lz);
    // 敷居の八ミリの溝へ下框を六ミリ、鴨居の三センチの溝へ上框を二十八ミリ掛ける。
    // 上を二センチ空けた戸では鴨居に掛からず、横滑りする障子を支えられない。
    // 上下とも溝底から二ミリ離し、形・当たり・引手に同じ戸丈と下端を渡す。
    // 縦枠の内法をそのまま戸幅にすると、閉めた框も開き切った框も縦枠へ接する。
    // 左右に二ミリずつ遊びを残す。形・当たり・引手・横滑りは同じ有効幅を使う。
    const span = win.w - .004;
    const d = { I, lv, kind: 'shoji', exterior: true, window: true, axisX, lx, lz,
      W: span, n: 2, pw: span / 2, h: win.y1 - win.y0 + .034, y: lv.y + win.y0 - .006,
      x, z, open: 0, want: 0, meshes: null, base: 0 };
    d.windowSolids = [];
    for (let j = 0; j < 2; j++) {
      const solid = { k: 's', ax: 0, az: 0, bx: 0, bz: 0, r: MORIBE_PANEL_R,
        yBot: d.y, yTop: d.y + d.h, naka: I.id, fusuma: true,
        paperFrameX: .04 * (d.pw + .012) / .9, paperFrameY: .04 * d.h / 1.8, paperLattice: true,
        x0: 0, x1: 0, z0: 0, z1: 0 };
      d.windowSolids.push(solid); SOLIDS.push(solid); INTERIOR_WALLS.push(solid);
    }
    moribePose(d);
    (I.doors || (I.doors = [])).push(d); DOORS.push(d);
  }
}

function moribeBuildNakaDoorMeshes(I, grp) {
  if (!I.doors) return;
  if (I.profile === 'hieizan') {
    // 正面戸・間仕切り・明かり障子を一束で描く。動く戸とは分けて更新しない。
    stopShape ||= new THREE.BoxGeometry(1, 1, 1);
    // 戸当たりも外周の木部と同じく光を受ける。暗い堂内でここだけ明るく浮かせない。
    // 正面戸・座敷・窓で一つの材質を共有し、影を描く回数は増やさない。
    stopMaterial ||= new THREE.MeshStandardMaterial({ color: 0x795b3b, roughness: 1, metalness: 0 });
    const stops = new THREE.InstancedMesh(stopShape, stopMaterial, I.doors.length * 2);
    stops.receiveShadow = true;
    let index = 0;
    for (const d of I.doors) {
      const frame = d.frame || I, sill = sillHeight(d), height = panelHeight(d);
      Q.setFromAxisAngle(Y, frame.rot); S.set(.05, height, .18);
      for (const side of [-1, 1]) {
        const x = d.lx + side * (stopOffset(d) + .025);
        P.set(frame.x + x * frame.c + d.lz * frame.s, d.y + sill + height / 2,
          frame.z - x * frame.s + d.lz * frame.c);
        M.compose(P, Q, S); stops.setMatrixAt(index++, M);
      }
    }
    stops.computeBoundingSphere(); grp.add(stops);
  }
  const by = new Map();
  for (const d of I.doors) { if (!by.has(d.kind)) by.set(d.kind, []); by.get(d.kind).push(d); }
  for (const [kind, list] of by) {
    // 在所の無地襖と堂の引手付き格子戸も、固定の間仕切りと同じ部品を使い回す。
    const panelKind = I.profile === 'moribe' && ['shoji', 'fusuma', 'koshi', 'itado'].includes(kind) ? kind + 'M' : kind;
    // 襖・障子・板戸・格子戸の右戸は左右を写した共用部品へまとめる。
    // 紙や鏡板の面を裏返さず、板戸の裏桟も二枚とも同じ室内側へ向ける。
    // 窓と間仕切りを一棟分まとめ、戸ごとの描画や毎コマの生成は増やさない。
    const mirrored = panelKind === 'fusumaM' || panelKind === 'shojiM' || panelKind === 'itadoM' || panelKind === 'koshiM';
    const count = list.reduce((s, d) => s + (mirrored ? d.n / 2 : d.n), 0);
    const meshes = panelInstances(panelKind, count);
    const rightMeshes = mirrored ? panelInstances(panelKind + 'R', count) : null;
    let i = 0;
    for (const d of list) {
      d.meshes = meshes; d.rightMeshes = rightMeshes; d.base = i;
      i += mirrored ? d.n / 2 : d.n;
    }
    const allMeshes = rightMeshes ? meshes.concat(rightMeshes) : meshes;
    for (const m of allMeshes) { m.count = count; grp.add(m); }
    for (const d of list) moribePose(d);
    for (const m of allMeshes) {
      m.computeBoundingSphere();
      // 閉じた時の範囲だけで判定すると、左右へ引いた戸が画面の端で消える。
      // 森部は開閉の両端を含む範囲を一度だけ確保し、動く間の再計算を省く。
      if (I.profile === 'moribe') m.boundingSphere.radius += Math.max(...list.map(d => d.W / 2)) + .1;
    }
  }
}

function moribePose(d) {
  const I = d.I, k = d.open, e = k * k * (3 - 2 * k);
  // 森部の召合せは框を少し重ね、引き違い戸を木口同士の突き合わせにしない。
  // 形と当たりへ同じ幅を渡し、開いた窓も二本の溝で引き重ねる。
  const leafW = d.pw + (I.profile === 'moribe' ? d.window ? .012 : .024 : 0);
  // 紙戸の当たりも二本の溝に沿って重ね、開いた半分へ見えない壁を残さない。
  // 座標と範囲は既存の物を書き換え、動く間も新しい形や配列を作らない。
  if (d.windowSolids) for (let j = 0; j < 2; j++) {
    // 召合せの重なりは窓の内側へ寄せる。左右の木口を縦枠へ食い込ませない。
    // 開け切った時は二枚の中心をそろえ、同じ窓幅の中で引き重ねる。
    const solid = d.windowSolids[j], along = -d.W / 2 + j * d.pw
      + (j === 0 ? .006 + e * (d.pw - .012) : -.006);
    const track = j === 0 ? -.04 : .04;
    const edge = along - (leafW - d.pw) / 2;
    // 丸い線分の端まで戸幅へ納める。端点を木口へ置くと半径分だけ窓枠へ食い込む。
    const ax = d.lx + (d.axisX ? track : edge + solid.r), az = d.lz + (d.axisX ? edge + solid.r : track);
    const bx = ax + (d.axisX ? 0 : leafW - 2 * solid.r), bz = az + (d.axisX ? leafW - 2 * solid.r : 0);
    solid.paperEdgeInset = solid.r;
    solid.ax = I.x + ax * I.c + az * I.s; solid.az = I.z - ax * I.s + az * I.c;
    solid.bx = I.x + bx * I.c + bz * I.s; solid.bz = I.z - bx * I.s + bz * I.c;
    solid.x0 = Math.min(solid.ax, solid.bx) - solid.r; solid.x1 = Math.max(solid.ax, solid.bx) + solid.r;
    solid.z0 = Math.min(solid.az, solid.bz) - solid.r; solid.z1 = Math.max(solid.az, solid.bz) + solid.r;
  }
  if (!d.meshes && !d.panelSolids) return;
  if (d.meshes) S.set(leafW / .9, d.h / 1.8, 1);
  // 障子紙は組子の裏（部品の奥行きの負側）へ張る。東と背面の窓は
  // 表裏を返して紙を室内へ向け、左右の部品も交換して引手を召合せに保つ。
  // 溝・戸板の当たり・引手の操作位置は従来のまま、共用部品だけで納める。
  const reverseWindow = d.window && (d.axisX ? d.lx > 0 : d.lz < 0);
  for (let j = 0; j < d.n; j++) {
    // 障子と板戸は右用の部品で引手を向かい合わせ、表裏は二枚ともそろえる。
    const right = j >= d.n / 2;
    const meshes = d.rightMeshes && (reverseWindow ? !right : right) ? d.rightMeshes : d.meshes;
    const index = d.base + (d.rightMeshes && right ? j - d.n / 2 : j);
    const turn = I.profile === 'moribe' && right && !d.rightMeshes ? Math.PI : 0;
    if (d.meshes) Q.setFromAxisAngle(Y, I.rot + (d.axisX ? -Math.PI / 2 : 0)
      + (reverseWindow ? Math.PI : 0) + turn);
    if (d.window) {
      const along = -d.W / 2 + (j + .5) * d.pw
        + (j === 0 ? .006 + e * (d.pw - .012) : -.006);
      const track = j === 0 ? -.04 : .04;
      const lx = d.lx + (d.axisX ? track : along), lz = d.lz + (d.axisX ? along : track);
      P.set(I.x + lx * I.c + lz * I.s, d.y, I.z - lx * I.s + lz * I.c); M.compose(P, Q, S);
      for (const m of meshes) m.setMatrixAt(index, M);
      continue;
    }
    const left = j < d.n / 2;
    // 右の襖・比叡山の格子戸は裏返して引き手を召し合わせ側へ向ける。
    // 外周の障子は左右の框に手掛けがある。片面張りの紙を外へ、組子を室内へ向ける。
    // 側窓の専用座標も正の奥行きが正の壁側なので、壁の符号で向きを揃える。
    // 座敷境は従来の向きとし、溝・戸の行程・当たりは同じ寸法を使う。
    // 正の縮尺と回転を使い、共通の形・材質をそのまま使い回す。
    const reverse = d.tracked && (d.kind === 'shoji'
      ? (d.window ? d.window.s > 0 : d.entry && d.I.door.side > 0)
      : !left && (d.kind === 'fusuma' || d.kind === 'fusumaPlain' || d.kind === 'fusumaE' || d.kind === 'koshi'));
    Q.setFromAxisAngle(Y, I.rot + (reverse ? Math.PI : 0));
    // 閉めた時は二本の溝（前後に少しずらす）。開けると左右の壁の前へ引き込む
    const lx = d.lx - d.W / 2 + (j + .5) * d.pw + (left ? -1 : 1) * e * d.W / 2;
    // 森部は敷居の二本の溝をまっすぐ滑る。内側は固定戸と柱の手前へ逃がし、
    // 外の板戸は壁から離した溝へ納める。開く途中で前後へ曲がらない。
    const track = I.profile === 'moribe'
      ? d.exterior ? (j % 2 ? .04 : -.04) : (j % 2 ? .195 : .115)
      : (j % 2 ? 1 : -1) * (.02 + .045 * e);
    const lz = d.lz + track;
    if (d.panelSolids) {
      // 形と同じ二本の溝をまっすぐ動かす。回転した屋敷でも両端と範囲をそろえる。
      const leaf = d.panelSolids[j], ax = lx - leafW / 2 + leaf.r, bx = lx + leafW / 2 - leaf.r;
      // 木口の外へ丸い当たりを足さず、紙と框の境は元の木口から測る。
      if (leaf.paperFrameX) leaf.paperEdgeInset = leaf.r;
      leaf.ax = I.x + ax * I.c + lz * I.s; leaf.az = I.z - ax * I.s + lz * I.c;
      leaf.bx = I.x + bx * I.c + lz * I.s; leaf.bz = I.z - bx * I.s + lz * I.c;
      leaf.x0 = Math.min(leaf.ax, leaf.bx) - leaf.r; leaf.x1 = Math.max(leaf.ax, leaf.bx) + leaf.r;
      leaf.z0 = Math.min(leaf.az, leaf.bz) - leaf.r; leaf.z1 = Math.max(leaf.az, leaf.bz) + leaf.r;
    }
    if (!d.meshes) continue;
    P.set(I.x + lx * I.c + lz * I.s, d.y, I.z - lx * I.s + lz * I.c); M.compose(P, Q, S);
    for (const m of meshes) m.setMatrixAt(index, M);
  }
  if (d.meshes) for (const m of d.meshes) m.instanceMatrix.needsUpdate = true;
  if (d.rightMeshes) for (const m of d.rightMeshes) m.instanceMatrix.needsUpdate = true;
}

function moribeSolidOff(d) {
  const s = d.solid;
  if (!d.saved) d.saved = { ax: s.ax, az: s.az, bx: s.bx, bz: s.bz, x0: s.x0, x1: s.x1, z0: s.z0, z1: s.z1 };
  s.ax = s.az = s.bx = s.bz = s.x0 = s.x1 = s.z0 = s.z1 = 1e9;
}

function moribeSetWant(rt, d, want) {
  if (d.want === want) return;
  if (!want && d.tracked) {
    // 閉め始めから戸口を止める。人がいる間は閉めず、戸を体へ滑り込ませない。
    if (moribeDoorwayOccupied(rt, d)) return;
    if (d.saved) Object.assign(d.solid, d.saved);
  }
  d.want = want;
  // 森部は戸が十分に引かれるまで当たりを残す。
  if (want && d.I.profile !== 'moribe') moribeSolidOff(d);
  moving.add(d);
  if (rt.army && rt.army.play) rt.army.play('wood', { x: d.x, z: d.z }, .3);
}

function moribeInDoorway(d, o, moveStep = 0, opening = false) {
  if (d.window && d.I.profile !== 'moribe') return false;
  const I = d.I, dx = o.pos.x - I.x, dz = o.pos.z - I.z;
  const lx = dx * I.c - dz * I.s, lz = dx * I.s + dz * I.c;
  // 森部は前後の溝と人の体の厚みまで見る。毎コマ座標の配列を作らない。
  const moribe = I.profile === 'moribe';
  // 民の子供や体格の違う兵も、見えている体の高さで挟み込みを調べる。
  // 一律一・七メートルでは、窓下の小柄な人で戸が止まり、背の高い人の頭を戸が横切る。
  const bodyHeight = o.bodyHeight || 1.72 * (o.mesh?.scale.y || 1);
  if (moribe && d.window) {
    // 明かり障子は戸口ではない。側窓は奥行き方向へ一枚だけ動き、
    // もう一枚は動かない。moribePose と同じ軌道・戸幅で引き先の体だけを調べる。
    // 腰壁の前に立っただけで、閉める操作を戸口への立ち入りと取り違えない。
    if (moveStep <= 0 || o.pos.y >= d.y + d.h || o.pos.y + bodyHeight <= d.y) return false;
    const next = Math.max(0, Math.min(1, d.open + (opening ? moveStep : -moveStep)));
    const from = d.open * d.open * (3 - 2 * d.open), to = next * next * (3 - 2 * next);
    const along = d.axisX ? lz : lx, across = d.axisX ? lx : lz;
    const center = (d.axisX ? d.lz : d.lx) - d.W / 2 + d.pw / 2 + .006;
    const a = center + from * (d.pw - .012), b = center + to * (d.pw - .012);
    const half = (d.pw + .012) / 2 + .35;
    // 人の中心が進む側にあれば、既に框へ接していても待つ。
    // 体の半幅まで除外すると、引き先で接した人へ戸を押し込んでしまう。
    if (b === a || (b > a ? along <= a : along >= a)) return false;
    return Math.abs(across - (d.axisX ? d.lx : d.lz) + .04) < .35 + MORIBE_PANEL_R
      && along > Math.min(a, b) - half && along < Math.max(a, b) + half;
  }
  // 森部は段の下や跳び上がった人も、体が戸板の高さへ掛かれば挟まない。
  // 足元同士の差だけでは、頭や胴が木へ重なっていても戸が通ってしまう。
  if (moribe ? o.pos.y >= d.y + d.h || o.pos.y + bodyHeight <= d.y
    : Math.abs(o.pos.y - d.y) >= 1.2) return false;
  if (!moribe) return !opening && Math.abs(lz - d.lz) < .35
    && Math.abs(lx - d.lx) < d.W / 2 + .1;
  // 森部の浅い板間では、戸口から六十五センチ離れた人まで
  // 閉める妨げにしない。閉める時と閉め切った時も、二本の溝を
  // 滑る戸板と体が重なる範囲だけを調べ、引き戸の前後に立ち所を残す。
  // 開いた戸の脇にも人が立てる。次の位置まで戸板が通る帯を調べ、
  // 戸口の外側で人を柱・壁へ押し込む前に開き直す。形や配列は作らない。
  const next = Math.max(0, Math.min(1, d.open + (opening ? moveStep : -moveStep)));
  const from = d.open * d.open * (3 - 2 * d.open), to = next * next * (3 - 2 * next);
  const half = (d.pw + .024) / 2 + .35;
  for (let j = 0; j < d.n; j++) {
    const side = j < d.n / 2 ? -1 : 1;
    const center = d.lx - d.W / 2 + (j + .5) * d.pw;
    const a = center + side * from * d.W / 2, b = center + side * to * d.W / 2;
    const track = d.exterior ? (j % 2 ? .04 : -.04) : (j % 2 ? .195 : .115);
    // 開く時は戸板の進む先だけで待つ。戸前に立つ人や、既に接した人が
    // 離れる方向まで止めず、横へ引く戸で脇の人を柱へ押し込まない。
    if (opening && (side < 0 ? lx >= a : lx <= a)) continue;
    if (Math.abs(lz - d.lz - track) < .35 + MORIBE_PANEL_R
      && lx > Math.min(a, b) - half && lx < Math.max(a, b) + half) return true;
  }
  return false;
}

function moribeDoorwayOccupied(rt, d, flagged, moveStep, opening = false) {
  const u = rt.player && rt.player.u;
  if (u && u.alive && moribeInDoorway(d, u, moveStep, opening)) return true;
  for (const o of flagged) if (o.alive && o.naka === d.I.id + 1 && moribeInDoorway(d, o, moveStep, opening)) return true;
  // 外の板戸と明かり障子は、縁・段・窓外の兵も挟む。
  // 室内に入った印が付く前から、次に戸板が通る位置を確かめる。
  // 窓の腰壁は残し、動く時だけ既存の兵の配列を使う。
  if (d.I.profile === 'moribe' && d.exterior && rt.army?.units) {
    for (const o of rt.army.units) {
      if (o.alive && !o.naka && moribeInDoorway(d, o, moveStep, opening)) return true;
    }
  }
  return false;
}

function moribeDoorReachable(d, u, targetX = d.lx, targetZ = d.lz, targetLeaf = -1) {
  const I = d.I, dx = u.pos.x - I.x, dz = u.pos.z - I.z;
  const lx = dx * I.c - dz * I.s, lz = dx * I.s + dz * I.c;
  const alongX = targetX - lx, alongZ = targetZ - lz;
  const handY = u.pos.y + 1, pullY = d.y + d.h * .47;
  // 外からは、操作する窓そのものか正面の戸口だけを通して手が届く。
  // 側壁の近くでは距離だけで選ぶと、壁の向こうの板戸や反対側の障子を開けてしまう。
  for (let axis = 0; axis < 2; axis++) {
    const edge = (axis === 0 ? d.lv.w : d.lv.d) / 2;
    for (let side = -1; side <= 1; side += 2) {
      // 外壁の外面は壁芯から四センチ、室内の壁面は十三センチ。
      // 一面との交点だけでは、壁に沿う手や窓脇を斜めにかすめる手が土壁へ通る。
      // 描いた壁の箱との重なりを取り、その入口と出口の両方を開口へ納める。
      let near = 0, far = 1;
      for (let a = 0; a < 3; a++) {
        const start = a === 0 ? lx : a === 1 ? lz : handY;
        const delta = a === 0 ? alongX : a === 1 ? alongZ : pullY - handY;
        const limit = (a === 0 ? d.lv.w : d.lv.d) / 2 + .04;
        const low = a === 2 ? d.lv.y : a === axis ? side * edge - (side > 0 ? .13 : .04) : -limit;
        const high = a === 2 ? d.lv.y + d.lv.h : a === axis ? side * edge + (side > 0 ? .04 : .13) : limit;
        if (Math.abs(delta) < .000001) {
          if (start < low || start > high) { far = -1; break; }
        } else {
          const t0 = (low - start) / delta, t1 = (high - start) / delta;
          near = Math.max(near, Math.min(t0, t1));
          far = Math.min(far, Math.max(t0, t1));
          if (near > far) break;
        }
      }
      if (near > far || far <= .001 || near >= .999) continue;
      const across0 = axis === 0 ? lz + alongZ * near : lx + alongX * near;
      const across1 = axis === 0 ? lz + alongZ * far : lx + alongX * far;
      const reachY0 = handY + (pullY - handY) * near;
      const reachY1 = handY + (pullY - handY) * far;
      if (d.window && axis === (d.axisX ? 0 : 1)
        && side === Math.sign(d.axisX ? d.lx : d.lz)
        && Math.max(Math.abs(across0 - (d.axisX ? d.lz : d.lx)), Math.abs(across1 - (d.axisX ? d.lz : d.lx))) < d.W / 2
        && Math.min(reachY0, reachY1) >= d.y + .006 && Math.max(reachY0, reachY1) <= d.y + d.h - .028) continue;
      if (axis === 1 && side === I.door.side
        && Math.max(Math.abs(across0 - I.door.lx), Math.abs(across1 - I.door.lx)) < I.door.w / 2
        && Math.min(reachY0, reachY1) >= d.lv.y + (I.door.rail || 0)
        && Math.max(reachY0, reachY1) <= d.lv.y + I.door.h) continue;
      return false;
    }
  }
  for (const v of d.lv.layout.walls) {
    if (v.guideOnly || Math.abs(v.az - v.bz) > .01) continue;
    // 固定の建具も体の当たりと同じ厚みで手を止める。
    // 壁芯との交点だけでは、框の厚みの中を横切る手や、
    // 芯へ届く手前で止まる斜めの手が、脇の襖・障子・格子戸を透かしてしまう。
    // 部屋の座標で調べ、回転した屋敷でも同じ範囲を使う。配列は作らない。
    let near = 0, far = 1;
    for (let axis = 0; axis < 3; axis++) {
      const start = axis === 0 ? lx : axis === 1 ? lz : handY;
      const delta = axis === 0 ? alongX : axis === 1 ? alongZ : pullY - handY;
      const low = axis === 0 ? Math.min(v.ax, v.bx) - .08 : axis === 1 ? v.az - .08 : d.lv.y;
      const high = axis === 0 ? Math.max(v.ax, v.bx) + .08 : axis === 1 ? v.az + .08 : d.lv.y + d.lv.h;
      if (Math.abs(delta) < .001) {
        if (start < low || start > high) { far = -1; break; }
      } else {
        const a = (low - start) / delta, b = (high - start) / delta;
        near = Math.max(near, Math.min(a, b));
        far = Math.min(far, Math.max(a, b));
        if (near > far) break;
      }
    }
    if (near <= far && far > .001 && near < .999) return false;
  }
  // 開き具合で戸口全体を塞がず、横へ動いた戸板そのものが手を遮るか調べる。
  // 引き残した隙間からは操作でき、開け切った戸や窓の障子越しには手を通さない。
  for (const other of I.doors) {
    if (other.lv !== d.lv || other === d && targetLeaf < 0) continue;
    const leaves = other.panelSolids || other.windowSolids;
    if (!leaves) continue;
    for (let j = 0; j < leaves.length; j++) {
      // 引き重ねた障子も手を遮る。選んだ一枚の引手だけを除き、
      // 同じ窓の手前の戸を透かして、隠れた奥の引手を操作させない。
      // 兵が戸口の中央へ近づく判定は、従来どおり対象の戸を除く。
      if (other === d && j === targetLeaf) continue;
      const leaf = leaves[j];
      const adx = leaf.ax - I.x, adz = leaf.az - I.z;
      const bdx = leaf.bx - I.x, bdz = leaf.bz - I.z;
      const ax = adx * I.c - adz * I.s, az = adx * I.s + adz * I.c;
      const bx = bdx * I.c - bdz * I.s, bz = bdx * I.s + bdz * I.c;
      let near = 0, far = 1;
      for (let axis = 0; axis < 3; axis++) {
        const start = axis === 0 ? lx : axis === 1 ? lz : handY;
        const delta = axis === 0 ? alongX : axis === 1 ? alongZ : pullY - handY;
        const low = axis === 0 ? Math.min(ax, bx) - leaf.r : axis === 1 ? Math.min(az, bz) - leaf.r : leaf.yBot;
        const high = axis === 0 ? Math.max(ax, bx) + leaf.r : axis === 1 ? Math.max(az, bz) + leaf.r : leaf.yTop;
        if (Math.abs(delta) < .001) {
          if (start < low || start > high) { far = -1; break; }
        } else {
          const a = (low - start) / delta, b = (high - start) / delta;
          near = Math.max(near, Math.min(a, b));
          far = Math.min(far, Math.max(a, b));
          if (near > far) break;
        }
      }
      if (near <= far && far > .001 && near < .999) return false;
    }
  }
  // 須弥壇・前卓・本尊・天蓋は、体の当たりと同じ部材ごとに調べる。
  // 前卓の上や壇の脇を、調度全体の見えない箱で塞がない。
  if (d.lv.handObstacles) for (const p of d.lv.handObstacles) {
    let near = 0, far = 1;
    for (let axis = 0; axis < 3; axis++) {
      const start = axis === 0 ? lx : axis === 1 ? lz : handY;
      const delta = axis === 0 ? alongX : axis === 1 ? alongZ : pullY - handY;
      const low = axis === 0 ? p.x0 : axis === 1 ? p.z0 : p.y0;
      const high = axis === 0 ? p.x1 : axis === 1 ? p.z1 : p.y1;
      if (Math.abs(delta) < .001) {
        if (start < low || start > high) { far = -1; break; }
      } else {
        const a = (low - start) / delta, b = (high - start) / delta;
        near = Math.max(near, Math.min(a, b));
        far = Math.min(far, Math.max(a, b));
        if (near > far) break;
      }
    }
    if (near <= far && far > .001 && near < .999) return false;
  }
  return true;
}

function moribeNearest(rt) {
  const u = rt.player && rt.player.u;
  if (!u || !u.alive || rt.player.mounted) return null;
  // 森部は戸口の出入りと同じ条件で手を使う。倒れている間や登っている間、
  // 選択中・終戦後には、窓や内陣の格子戸を遠隔で動かさない。
  const handsBusy = u.downed || u.climb || rt.over || rt.choice;
  if (pickT === rt.t) return pick?.I.profile === 'moribe' && handsBusy ? null : pick;
  pickT = rt.t; pick = null;
  let bd = 1.5;
  for (const d of DOORS) {
    if (d.I.profile === 'moribe' && handsBusy) continue;
    if (d.I.id + 1 !== u.naka && (!d.exterior || u.naka)) continue;
    // 森部は窓も出入口も、足元と下框ではなく手元と引手の高さで調べる。
    // 戸口の段の下や高い地面から、上下に遠い引手の札を出さない。
    const heightGap = d.I.profile === 'moribe'
      ? Math.abs(u.pos.y + 1 - (d.y + d.h * .47)) : Math.abs(u.pos.y - d.y);
    if (heightGap > 1.2) continue;
    if (d.I.profile === 'moribe') {
      // 戸口の空中ではなく、横へ動いた戸の引手に札を出す。
      // 描画と同じ割り付け・溝・拡縮を使い、毎コマの物や配列は増やさない。
      const e = d.open * d.open * (3 - 2 * d.open), I = d.I;
      const leafW = d.pw + (d.window ? .012 : .024);
      const inset = d.kind === 'shoji' || d.kind === 'koshi' ? .02 : d.kind === 'fusuma' ? .13 : .12;
      const pull = ( .45 - inset) * leafW / .9;
      for (let j = 0; j < d.n; j++) {
        const left = j < d.n / 2;
        const along = -d.W / 2 + (j + .5) * d.pw + (d.window
          ? j === 0 ? .006 + e * (d.pw - .012) : -.006
          : (left ? -1 : 1) * e * d.W / 2) + (left ? pull : -pull);
        const track = d.window || d.exterior ? (j % 2 ? .04 : -.04) : (j % 2 ? .195 : .115);
        const lx = d.lx + (d.axisX ? track : along), lz = d.lz + (d.axisX ? along : track);
        const x = I.x + lx * I.c + lz * I.s, z = I.z - lx * I.s + lz * I.c;
        // 水平距離だけでは、段の下から斜めに遠い引手にも届いてしまう。
        // 高さも含む実際の距離を使い、近い引手を選ぶ。物や配列は増やさない。
        const dist = Math.hypot(x - u.pos.x, z - u.pos.z, heightGap);
        if (dist >= bd || !moribeDoorReachable(d, u, lx, lz, j)) continue;
        bd = dist; pick = d; d.pullX = x; d.pullZ = z;
      }
    } else {
      const dist = Math.hypot(d.x - u.pos.x, d.z - u.pos.z);
      if (dist < bd) { bd = dist; pick = d; }
    }
  }
  return pick;
}

function moribeNakaDoorTick(rt, dt, flagged) {
  if (!DOORS.length) return;
  if (rt.addInteract && !rt._nakaDoors) {
    rt._nakaDoors = true;
    rt.addInteract('naka_to', () => { const d = moribeNearest(rt); return d && !(d.want && rt.def.doorCloseOK?.(rt) === false) ? { x: d.pullX ?? d.x, z: d.pullZ ?? d.z } : null; }, '開ける', () => {
      const d = moribeNearest(rt);
      // 札を選んでから戦況が変わった時も、閉めてよいかを実行時に確かめる。
      if (d && !(d.want && rt.def.doorCloseOK?.(rt) === false)) moribeSetWant(rt, d, d.want ? 0 : 1);
    }, { r: 1.5, prio: -3 });
    const it = rt.interacts[rt.interacts.length - 1];
    Object.defineProperty(it, 'label', { get: () => (moribeNearest(rt) && moribeNearest(rt).want ? '閉める' : '開ける'), configurable: true });
  }
  // 中の兵は戸口へ来たら自分で開ける。
  // 桶狭間の遊び手は「開ける」の札で操作する。閉じた襖・障子・外戸へ
  // 押し続けただけで開くと、閉めておいた建具まで意図せず動いてしまう。
  // ほかの戦の押し開ける操作は従来どおり残す。
  autoT -= dt;
  if (autoT <= 0) {
    autoT = .2;
    const u = rt.player && rt.player.u;
    if (u && u.alive && (rt.player.blockedWalkT || 0) >= .5) {
      const d = moribeNearest(rt);
      // 腰壁へ歩き続けても明かり障子は通り道にならない。窓は札で開ける。
      if (d && !d.window && !d.want && Math.hypot(d.x - u.pos.x, d.z - u.pos.z) < 1.1) moribeSetWant(rt, d, 1);
    }
    for (const o of flagged) {
      if (o.isPlayer || !o.alive || !o.naka) continue;
      const I = DOORS.find((d) => d.I.id + 1 === o.naka)?.I;
      if (!I || !I.doors) continue;
      // 森部では遊び手と同じく、倒れた兵・登っている兵・騎乗中の兵は戸を操作しない。
      // 戸口に倒れているだけで襖や内陣の格子戸が勝手に開くのを防ぐ。
      if (I.profile === 'moribe' && (o.downed || o.climb || o.mounted || o.isStruct)) continue;
      for (const d of I.doors) if (!d.window && !d.want && Math.hypot(d.x - o.pos.x, d.z - o.pos.z) < 1.2 && Math.abs(o.pos.y - d.y) < 1.2
        && (I.profile !== 'moribe' || moribeDoorReachable(d, o))) moribeSetWant(rt, d, 1);
    }
    // 森部の外の兵には、室内に入るまで naka の印が付かない。
    // 外の板戸も内側と同じ距離・高さ・手の届く範囲で開き、戸前で立ち往生させない。
    // 窓や壁越しの操作は除き、既存の兵と戸の配列だけを使う。
    if (rt.army?.units) for (const d of DOORS) {
      if (d.I.profile !== 'moribe' || !d.exterior || d.window || d.want) continue;
      for (const o of rt.army.units) {
        if (o.isPlayer || !o.alive || o.naka || o.isStruct || o.mounted || o.downed || o.climb) continue;
        if (Math.abs(o.pos.y - d.y) >= 1.2 || Math.hypot(d.x - o.pos.x, d.z - o.pos.z) >= 1.2) continue;
        if (!moribeDoorReachable(d, o)) continue;
        moribeSetWant(rt, d, 1);
        break;
      }
    }
  }
  for (const d of moving) {
    const moribe = d.I.profile === 'moribe';
    // 閉まり切ってから待つと人を戸で挟む。人がいる間は引き戻して口を空ける。
    if (moribe && !d.want && moribeDoorwayOccupied(rt, d, flagged, dt * 2.6)) moribeSetWant(rt, d, 1);
    // 襖・障子・板戸の引き先に人がいれば、その場で待ち、離れたら続ける。
    // 既存の戸板の割り付けで調べ、待つ間は行列も書き直さない。
    if (moribe && d.want && moribeDoorwayOccupied(rt, d, flagged, dt * 2.6, true)) continue;
    d.open = Math.max(0, Math.min(1, d.open + (d.want ? 1 : -1) * dt * 2.6));
    moribePose(d);
    if (d.open !== d.want) continue;
    if (d.want && d.tracked) moribeSolidOff(d);
    if (!d.want) {
      // 閉め切った時に戸口に人が立っていれば、開けたままにして待つ
      const u = rt.player && rt.player.u;
      if (moribe ? moribeDoorwayOccupied(rt, d, flagged, 0)
        : (u && moribeInDoorway(d, u)) || flagged.some((o) => o.alive && o.naka === d.I.id + 1 && moribeInDoorway(d, o))) { d.open = .02; continue; }
      if (d.saved) Object.assign(d.solid, d.saved);
    }
    moving.delete(d);
  }
}

function solidOff(d) {
  const s = d.solid;
  if (!d.saved) d.saved = { ax: s.ax, az: s.az, bx: s.bx, bz: s.bz, x0: s.x0, x1: s.x1, z0: s.z0, z1: s.z1 };
  s.ax = s.az = s.bx = s.bz = s.x0 = s.x1 = s.z0 = s.z1 = 1e9;
}

// 無地襖の紙の内側にある木骨。fusuma() の原寸を実寸へ伸ばし、固定・可動で共有する。
// 紙の空所は通し、縦三本・横六本の木だけを止める。設営時にだけ呼ぶ。
export function nakaFusumaMembers(w, h, add) {
  const sx = w / .9, sy = h / 1.8, radius = Math.min(.009 * sx, .012);
  for (let i = 1; i < 4; i++) {
    const x = -w / 2 + i * w / 4;
    add(x, -.012 + radius, x, .012 - radius, .04 * sy, h - .04 * sy, radius);
  }
  const half = (w - .08 * sx) / 2 - .012;
  for (let i = 1; i < 7; i++) {
    const y = i * h / 7;
    add(-half, 0, half, 0, y - .009 * sy, y + .009 * sy, .012);
  }
  // 無地襖の引き手の下地板。固定戸も動く戸も同じ原寸から伸ばす。
  // 紙の空所と区別し、描いた下地のある所だけを木として止める。
  const pullX = w / 2 - .13 * sx, pullY = h * .48;
  // 引き手の口まで厚い下地板で塞がず、fusuma() と同じ四辺と薄い芯へ分ける。
  // 掘込みの底は厚さ一・二センチ。左右の固定襖・動く襖とも原寸から伸ばす。
  const wood = (left, right, bottom, top, depth) => {
    const r = Math.min((right - left) / 2, depth / 2);
    add(left + r, -depth / 2 + r, right - r, depth / 2 - r, bottom, top, r);
  };
  for (const side of [-1, 1]) {
    wood(pullX + (side < 0 ? -.09 : .03) * sx,
      pullX + (side < 0 ? -.03 : .09) * sx,
      pullY - .09 * sy, pullY + .09 * sy, .024);
    wood(pullX - .03 * sx, pullX + .03 * sx,
      pullY + (side < 0 ? -.09 : .05) * sy,
      pullY + (side < 0 ? -.05 : .09) * sy, .024);
  }
  wood(pullX - .03 * sx, pullX + .03 * sx,
    pullY - .05 * sy, pullY + .05 * sy, .012);
}

// 長福寺の縦框。指掛けの上下・細い縁・薄い木芯を、描画と同じ原寸から伸ばす。
// 固定障子と動く戸で共有し、掘った口を厚さ六センチの見えない木で埋めない。
export function nakaDoorStiles(w, h, pullSide, pullRatio, pullHeight, add) {
  const sx = w / .9, sy = h / 1.8;
  const wood = (x, width, bottom, top, depth) => {
    const r = Math.min(width, depth) / 2;
    const dx = width / 2 - r, dz = depth / 2 - r;
    add(x - dx, -dz, x + dx, dz, bottom, top, r);
  };
  for (const side of [-1, 1]) {
    const x = side * (w / 2 - .02 * sx);
    if (side !== pullSide) { wood(x, .04 * sx, 0, h, .06); continue; }
    const height = pullHeight * sy, y = h * pullRatio;
    wood(x, .04 * sx, 0, y - height / 2, .06);
    wood(x, .04 * sx, y + height / 2, h, .06);
    for (const edge of [-1, 1]) wood(x + edge * .01875 * sx,
      .0025 * sx, y - height / 2, y + height / 2, .06);
    wood(x, .035 * sx, y - height / 2, y + height / 2, .036);
  }
}

// 長福寺の腰障子。鏡板・腰桟・組子を描画と同じ実寸で登録する。
// 紙面まで厚さ六センチの木として塞がず、固定側・可動側で共有する。
export function nakaShojiMembers(w, h, add) {
  const sx = w / .9, sy = h / 1.8, waist = h * .2;
  const wood = (left, right, bottom, top, depth) => {
    const r = Math.min((right - left) / 2, depth / 2);
    add(left + r, -depth / 2 + r, right - r, depth / 2 - r, bottom, top, r);
  };
  const left = -w / 2 + .04 * sx, right = w / 2 - .04 * sx;
  // 腰板は共有部品と同じ薄い裏板・四枚の鏡板・四周の押縁で止める。
  // 押縁の厚みを腰板全面へ広げず、目地と板の中央に見えない木を残さない。
  // 固定障子と引き戸の両方で使い、設営時だけ当たりを登録する。
  const boardBottom = .04 * sy, boardTop = waist - .02 * sy;
  wood(left, right, boardBottom, boardTop, .021);
  const boardWidth = (right - left) / 4;
  for (let i = 0; i < 4; i++) wood(left + i * boardWidth + (i ? .0015 * sx : 0),
    left + (i + 1) * boardWidth - (i < 3 ? .0015 * sx : 0), boardBottom, boardTop, .025);
  const trimX = .012 * sx, trimY = .012 * sy;
  for (const side of [-1, 1]) {
    const bottom = side < 0 ? boardBottom : boardTop - trimY;
    wood(left, right, bottom, bottom + trimY, .033);
    const x = side < 0 ? left : right - trimX;
    wood(x, x + trimX, boardBottom + trimY, boardTop - trimY, .033);
  }
  // 腰桟は框と同じ六センチ。紙の上の組子とは厚みを分ける。
  wood(left, right, waist - .02 * sy, waist + .02 * sy, .06);
  // 障子の原形と同じ内法・組子幅から割り、紙の空所へ見えない木を残さない。
  const bottom = waist + .02 * sy, top = h - .04 * sy;
  const gapX = (right - left - 3 * .018 * sx) / 4;
  const gapY = (top - bottom - 5 * .018 * sy) / 6;
  for (let i = 1; i < 4; i++) {
    const x = left + i * gapX + (i - .5) * .018 * sx;
    wood(x - .009 * sx, x + .009 * sx, bottom, top, .016);
  }
  for (let i = 1; i < 6; i++) {
    const y = bottom + i * gapY + (i - .5) * .018 * sy;
    wood(left, right, y - .009 * sy, y + .009 * sy, .016);
  }
}

// 長福寺の格子戸。体を止める面とは別に、框・格子・貫・腰板だけを木として登録する。
// 固定戸は実寸、動く戸は標準幅 .9m の形を伸ばすので横方向の倍率も受け取る。
export function nakaLatticeMembers(w, h, sx, add, scaled = false, pull = false) {
  const wood = (x, y, width, height, depth) => {
    const r = Math.min(width, depth) / 2;
    const dx = Math.max(0, width / 2 - r), dz = Math.max(0, depth / 2 - r);
    add(x - dx, -dz, x + dx, dz, y - height / 2, y + height / 2, r);
  };
  const sy = h / 1.8;
  const frameY = scaled ? sy : 1;
  for (const y of [.02 * frameY, h - .02 * frameY]) wood(0, y, w, .04 * frameY, .06);
  if (pull) nakaDoorStiles(w, h, 1, .5, .14, add);
  else for (const x of [-w / 2 + .02 * sx, w / 2 - .02 * sx]) wood(x, h / 2, .04 * sx, h, .06);
  // koshi() と同じく腰板の上から上框の内側までを格子とする。
  // 固定側も標準形を伸ばすため、框際・腰板際の寸法は実寸の倍率でそろえる。
  const bottom = .31 * sy, top = h - .04 * sy, innerWidth = w - .08 * sx;
  const gap = (innerWidth - 8 * .022 * sx) / 9;
  for (let k = 1; k < 9; k++) wood(-innerWidth / 2 + k * gap + (k - .5) * .022 * sx, (bottom + top) / 2,
    .022 * sx, top - bottom, .03);
  // 横桟は縦子と面をそろえた厚さ。固定戸・引き戸とも絵のない張り出しを残さない。
  // 腰桟は腰板の上端から縦子の下端まで。絵と同じ高さで木だけを止める。
  wood(0, .29 * sy, innerWidth, .04 * sy, .03);
  for (const y of [h * .55, h - .3 * sy]) wood(0, y, innerWidth, .035 * sy, .03);
  wood(0, .155 * sy, innerWidth, .23 * sy, .03);
}

// 長福寺の欄間は塗り壁ではなく透かした格子。室内部品と同じ木部だけを止める。
// 固定格子の上と脇口の上で共有し、設営時だけ作る。
export function addNakaTransomSolids(I, lv, l, r, z, ph) {
  const wood = (left, right, bottom, top, depth) => {
    const radius = Math.min((right - left) / 2, depth / 2);
    const [ax, az] = I.P(left + radius, z), [bx, bz] = I.P(right - radius, z);
    const s = { k: 's', ax, az, bx, bz, r: radius, yBot: lv.y + bottom, yTop: lv.y + top,
      naka: I.id, fusuma: false, bodyOverlap: true,
      x0: Math.min(ax, bx) - radius, x1: Math.max(ax, bx) + radius,
      z0: Math.min(az, bz) - radius, z1: Math.max(az, bz) + radius };
    SOLIDS.push(s); INTERIOR_WALLS.push(s);
  };
  const low = ph + .1, height = lv.h - low, len = r - l;
  wood(l, r, ph, low, .12); // 鴨居
  wood(l, r, ph + .36, ph + .48, .14); // 長押
  wood(l, r, lv.h - .06, lv.h, .06); // 上框
  // 室内部品と同じ縦框と、その内側へ納めた組子だけを止める。
  // 透かしの部分を見えない板で埋めず、左右の脇口にも同じ寸法を使う。
  const inner = len - .12, top = lv.h - .06, latticeH = height - .06;
  // 絵と同じく縦框は上框の下面まで。上の六センチは横の上框が受け持つ。
  wood(l, l + .06, low, top, .06);
  wood(r - .06, r, low, top, .06);
  const n = Math.max(1, Math.ceil(inner / .18));
  // 描画と同じく縦組子の太さを引き、框際まで空隙をそろえる。
  const gap = (inner - (n - 1) * .025) / n;
  const gapY = (latticeH - 3 * .025) / 4;
  for (let i = 1; i < n; i++) {
    const x = l + .06 + i * gap + (i - .5) * .025;
    wood(x - .0125, x + .0125, low, top, .04);
  }
  for (let i = 1; i < 4; i++) {
    const y = low + i * gapY + (i - .5) * .025;
    wood(l + .06, r - .06, y - .0125, y + .0125, .04);
  }
}

// 桶狭間の戸当たりは描いた木部と同じ位置で止める。
// 戸脇柱とは別に、全開位置の外端へ置く。設営時だけ登録し、戸口は狭めない。
function okeAddDoorStopSolids(I, lv, p, l, r, h) {
  const width = r - l, center = (l + r) / 2;
  let left = l, right = r;
  if (!p.exterior) for (const v of lv.layout.walls) {
    if (v.guideOnly || Math.abs(v.az - p.z) > .01 || Math.abs(v.bz - p.z) > .01) continue;
    if (Math.abs(Math.max(v.ax, v.bx) - l) < .01) left = Math.max(l - width / 2 - .05, Math.min(v.ax, v.bx));
    if (Math.abs(Math.min(v.ax, v.bx) - r) < .01) right = Math.min(r + width / 2 + .05, Math.max(v.ax, v.bx));
  }
  if (!p.exterior) {
    // 引き込みまで延びる鴨居も、室内部品と同じ木の範囲で止める。
    // 中央の戸筋を板で塞がず、二筋の溝縁とその上の肩だけ登録する。
    // 当たりは設営時に作り、戸の開閉中には増やさない。
    const timber = (back, front, bottom, top) => {
      const radius = Math.min((right - left) / 2, (front - back) / 2);
      const z = p.z + (back + front) / 2;
      const [ax, az] = I.P(left + radius, z), [bx, bz] = I.P(right - radius, z);
      const s = { k: 's', ax, az, bx, bz, r: radius,
        yBot: lv.y + bottom, yTop: lv.y + top,
        naka: I.id, fusuma: false, bodyOverlap: true,
        x0: Math.min(ax, bx) - radius, x1: Math.max(ax, bx) + radius,
        z0: Math.min(az, bz) - radius, z1: Math.max(az, bz) + radius };
      SOLIDS.push(s); INTERIOR_WALLS.push(s);
    };
    // 幅 .17m の肩は中心が前後 .155m。上框を受ける溝は .068m 空ける。
    for (const side of [-1, 1]) timber(side * .155 - .085, side * .155 + .085, h, h + .1);
    for (const [back, front] of [[-.24, -.154], [-.086, .086], [.154, .24]]) {
      timber(back, front, h - .018, h);
    }
  }
  const depth = p.exterior ? .28 : .48;
  const z = p.z + (p.exterior ? I.door.side * .175 : 0), radius = .025;
  for (const side of [-1, 1]) {
    const edge = center + side * width, end = edge + side * .05;
    // 室内の溝が短い所は既存の壁柱で受け、描かれていない戸当たりは作らない。
    if (!p.exterior && (end < left - .001 || end > right + .001)) continue;
    const x = edge + side * radius;
    const stop = (centerZ, thickness, bottom, top) => {
      const [ax, az] = I.P(x, centerZ - thickness / 2 + radius);
      const [bx, bz] = I.P(x, centerZ + thickness / 2 - radius);
      const s = { k: 's', ax, az, bx, bz, r: radius, yBot: lv.y + bottom, yTop: lv.y + top,
        // 板間は敷居より低い。肩まで含めて描いた木部だけで止める。
        naka: I.id, fusuma: false, bodyOverlap: true,
        x0: Math.min(ax, bx) - radius, x1: Math.max(ax, bx) + radius,
        z0: Math.min(az, bz) - radius, z1: Math.max(az, bz) + radius };
      SOLIDS.push(s); INTERIOR_WALLS.push(s);
    };
    if (p.exterior) stop(z, depth, 0, h);
    else {
      // 室内部品と同じく、本体は溝縁の間、上下のほぞは二筋の溝だけへ差す。
      // 全幅の見えない木で敷居・鴨居の切り欠きを埋めず、矢や槍も実際の木で止める。
      // 設営時だけ分け、戸の開閉中に形や当たりを作り直さない。
      stop(z, depth, .078, h - .018);
      for (const track of [-.12, .12]) {
        stop(z + track, .068, .06, .078);
        stop(z + track, .068, h - .018, h);
      }
    }
  }
}

// 間仕切りの口ごとに戸を一組。lv.layout.walls の当たりを作った後に呼ぶ（y0・y1 は壁と同じ高さの幅）
function okeAddNakaDoors(I, lv, y0, y1) {
  // 比叡山は実寸の四枚建て・窓戸の行程を使い、桶狭間の二枚戸と分ける。
  if (I.profile === 'hieizan') return addNakaDoorsHiei(...arguments);
  if (SKIP.includes(I.kind) || I.open || I.profile === 'yagura') return;
  const portals = [...(lv.layout.portals || [])];
  // 桶狭間の入口にも実物の引き戸を納める。内側の間仕切りとは高さを分ける。
  if (I.profile === 'okehazama' && ['bansho', 'minka', 'hondo'].includes(I.kind) && lv.k === 0) {
    portals.push({ x: I.door.lx, z: I.door.side * (lv.d / 2 + .12), exterior: true,
      kind: I.kind === 'hondo' ? 'koshi' : 'itado' });
  }
  for (const p of portals) {
    let l = -Infinity, r = Infinity, paper = true;
    for (const v of lv.layout.walls) {
      if (p.entry || v.guideOnly || Math.abs(v.az - p.z) > .01 || Math.abs(v.bz - p.z) > .01) continue;
      const a = Math.min(v.ax, v.bx), b = Math.max(v.ax, v.bx);
      if (b <= p.x + .01 && b > l) { l = b; paper = v.paper; }
      if (a >= p.x - .01 && a < r) r = a;
    }
    if (p.exterior) { l = p.x - I.door.w / 2; r = p.x + I.door.w / 2; }
    if (!isFinite(l) || !isFinite(r) || r - l < .5 || r - l > 4.4) continue;
    const temple = TEMPLE.includes(I.kind);
    const kind = p.kind || (temple ? 'koshi' : !paper ? 'itado' : ['goten', 'yashiki', 'shisha'].includes(I.kind) ? 'fusumaE' : 'shoji');
    const W = r - l, n = Math.max(2, Math.round(W / 1.8) * 2);
    // 桶狭間の戸板は厚さ六センチの框へ納める。見えない当たりだけを
    // 十二センチに膨らませず、開いた戸と戸脇柱の間にも描いた通りの余裕を残す。
    const [ax, az] = I.P(l, p.z), [bx, bz] = I.P(r, p.z), rad = I.profile === 'okehazama' ? .03 : .06;
    // 格子の空隙を透明な板で塞がない。木部は下で別に登録し、面は体だけを止める。
    const paperPanel = kind !== 'itado';
    const solid = { k: 's', ax, az, bx, bz, r: rad, yBot: y0, yTop: y1, naka: I.id, fusuma: paperPanel,
      x0: Math.min(ax, bx) - rad, x1: Math.max(ax, bx) + rad, z0: Math.min(az, bz) - rad, z1: Math.max(az, bz) + rad };
    SOLIDS.push(solid); INTERIOR_WALLS.push(solid);
    const [x, z] = I.P((l + r) / 2, p.z);
    // 詰所の襖は室内の鴨居の下に収める（interior_parts.js と同じ内法）。
    const doorH = p.exterior ? I.door.h : I.profile === 'okehazama' && ['bansho', 'minka'].includes(I.kind) ? Math.min(2, lv.h - .2) : lv.h > 3 ? 2.3 : lv.h - .02;
    if (I.profile === 'okehazama' && ['bansho', 'minka', 'hondo'].includes(I.kind)) {
      okeAddDoorStopSolids(I, lv, p, l, r, doorH);
      // 戸の上の鴨居・小壁は、戸を開けても残る。見た目と同じ高さで体と矢を止める。
      solid.yBot = lv.y; solid.yTop = lv.y + doorH;
      // 高床の入口では、段の途中にいる人の頭・肩も戸板で止める。
      // 滑る前の挟み込み判定と同じ体高を、移動中の当たりにも使う。
      solid.bodyOverlap = true;
      if (!p.exterior && solid.yTop < y1) {
        if (I.kind === 'hondo' && kind === 'koshi') addNakaTransomSolids(I, lv, l, r, p.z, doorH);
        else {
          const lintel = { ...solid, yBot: solid.yTop, yTop: y1, fusuma: false, bodyOverlap: true };
          SOLIDS.push(lintel); INTERIOR_WALLS.push(lintel);
        }
      }
      if (!p.exterior) {
        // 室内部品の戸脇柱（幅 .12、奥行き .14）は紙の間仕切りと分ける。
        // 開けた後も木の柱は残り、襖と同じ扱いで槍が突き抜けない。
        // 当たりは戸口の外へ納め、建具の通れる幅を狭めない。
        for (const cx of [l - .06, r + .06]) {
          const [ax, az] = I.P(cx, p.z - .01), [bx, bz] = I.P(cx, p.z + .01), radius = .06;
          // 長福寺の戸脇柱は舟肘木の下面まで。柱頭の木部は naka.js が受け持つ。
          const postTop = I.kind === 'hondo' ? lv.h - .4 : lv.h;
          const post = { k: 's', ax, az, bx, bz, r: radius, yBot: lv.y, yTop: lv.y + postTop,
            naka: I.id, fusuma: false,
            x0: Math.min(ax, bx) - radius, x1: Math.max(ax, bx) + radius,
            z0: Math.min(az, bz) - radius, z1: Math.max(az, bz) + radius };
          SOLIDS.push(post); INTERIOR_WALLS.push(post);
        }
      }
    }
    // 室内の敷居は畳の上面。下框を畳へ埋めず、鴨居の高さは変えない。
    // 外戸は外の板敷きの溝を使うので、従来の高さを保つ。
    const sillY = !p.exterior && I.profile === 'okehazama' && ['bansho', 'minka', 'hondo'].includes(I.kind) ? .06 : 0;
    // 二枚引き違いの召し合わせは框を四センチ重ねる推定復元。
    // 戸尻と全開時の外端は動かさず、中央側だけを各二センチ延ばす。
    const lap = I.profile === 'okehazama' && ['bansho', 'minka', 'hondo'].includes(I.kind) && n === 2 ? .02 : 0;
    const d = { I, lv, kind, exterior: !!p.exterior, lx: (l + r) / 2, lz: p.z, W, n, lap, pw: W / n + lap, h: doorH - sillY, y: lv.y + sillY, x, z, interact: { x, z }, solid, saved: null, open: 0, want: 0, meshes: null, base: 0 };
    if (I.profile === 'okehazama' && ['bansho', 'minka', 'hondo'].includes(I.kind)) {
      // 左右の戸を別々に止める。開閉途中も見えている戸の幅だけ当たりを残す。
      d.rightSolid = { ...solid };
      SOLIDS.push(d.rightSolid); INTERIOR_WALLS.push(d.rightSolid);
      if (kind === 'koshi') {
        d.frameSolids = [];
        for (let j = 0; j < n; j++) nakaLatticeMembers(d.pw, d.h, d.pw / .9,
          (ax, az, bx, bz, bottom, top, r) => {
            const s = { ...solid, r, yBot: d.y + bottom, yTop: d.y + top, fusuma: false, nakaDoor: d };
            d.frameSolids.push({ s, j, ax, az, bx, bz });
            SOLIDS.push(s); INTERIOR_WALLS.push(s);
          }, true, true);
      }
      if (kind === 'fusumaPlain' || kind === 'shoji') {
        // 動く襖・障子も、紙面と木框を分ける。固定側と同じく木には槍・矢を通さない。
        // 標準幅 .9m・高さ 1.8m の共有部品を伸ばした実寸に合わせる。
        // 当たりは設営時に用意し、開閉中は既存の座標だけを更新する。
        d.frameSolids = [];
        const fw = .04 * d.pw / .9, fh = .04 * d.h / 1.8;
        const frame = (j, ax, az, bx, bz, bottom, top, r) => {
          const s = { ...solid, r, yBot: d.y + bottom, yTop: d.y + top, fusuma: false, nakaDoor: d };
          d.frameSolids.push({ s, j, ax, az, bx, bz });
          SOLIDS.push(s); INTERIOR_WALLS.push(s);
        };
        for (let j = 0; j < n; j++) {
          // 横框は伸縮した縦框の内側まで。細い戸でも紙の前へ見えない木を残さない。
          const railRadius = Math.min(.03, (d.pw - 2 * fw) / 2);
          for (const bottom of [0, d.h - fh]) frame(j, -d.pw / 2 + fw + railRadius, 0,
            d.pw / 2 - fw - railRadius, 0, bottom, bottom + fh, railRadius);
          const r = Math.min(fw / 2, .03);
          if (kind === 'shoji' && I.kind === 'hondo') nakaDoorStiles(d.pw, d.h,
            j < n / 2 ? 1 : -1, .48, .12,
            (ax, az, bx, bz, low, high, radius) => frame(j, ax, az, bx, bz, low, high, radius));
          else for (const x of [(-d.pw + fw) / 2, (d.pw - fw) / 2]) {
            frame(j, x, -.03 + r, x, .03 - r, 0, d.h, r);
          }
          if (kind === 'fusumaPlain') nakaFusumaMembers(d.pw, d.h,
            (ax, az, bx, bz, low, high, radius) => frame(j, ax, az, bx, bz, low, high, radius));
          if (I.kind === 'hondo' && kind === 'shoji') nakaShojiMembers(d.pw, d.h,
            (ax, az, bx, bz, low, high, radius) => frame(j, ax, az, bx, bz, low, high, radius));
        }
      }
      okeSlideSolids(d);
    }
    (I.doors || (I.doors = [])).push(d); DOORS.push(d);
    // 内陣の格子戸は本尊が見えるよう開ける。入口側の明かり障子は札で開ける。
    if (temple && kind !== 'shoji' && !p.exterior) {
      d.open = d.want = 1;
      if (d.rightSolid) okeSlideSolids(d); else okeSolidOff(d);
    }
  }
}

// 近づいて中を作る時（naka.js の buildInside）に、戸の形を grp へ足す
function okeBuildNakaDoorMeshes(I, grp) {
  // 比叡山は実寸の四枚建て・窓戸の行程を使い、桶狭間の二枚戸と分ける。
  if (I.profile === 'hieizan') return buildNakaDoorMeshesHiei(...arguments);
  if (!I.doors) return;
  if (I.profile === 'hieizan') {
    // 正面戸・間仕切り・明かり障子を一束で描く。動く戸とは分けて更新しない。
    stopShape ||= new THREE.BoxGeometry(1, 1, 1);
    // 戸当たりも外周の木部と同じく光を受ける。暗い堂内でここだけ明るく浮かせない。
    // 正面戸・座敷・窓で一つの材質を共有し、影を描く回数は増やさない。
    stopMaterial ||= new THREE.MeshStandardMaterial({ color: 0x795b3b, roughness: 1, metalness: 0 });
    const stops = new THREE.InstancedMesh(stopShape, stopMaterial, I.doors.length * 2);
    stops.receiveShadow = true;
    let index = 0;
    for (const d of I.doors) {
      const frame = d.frame || I, sill = sillHeight(d), height = panelHeight(d);
      Q.setFromAxisAngle(Y, frame.rot); S.set(.05, height, .18);
      for (const side of [-1, 1]) {
        const x = d.lx + side * (stopOffset(d) + .025);
        P.set(frame.x + x * frame.c + d.lz * frame.s, d.y + sill + height / 2,
          frame.z - x * frame.s + d.lz * frame.c);
        M.compose(P, Q, S); stops.setMatrixAt(index++, M);
      }
    }
    stops.computeBoundingSphere(); grp.add(stops);
  }
  const by = new Map();
  for (const d of I.doors) { if (!by.has(d.kind)) by.set(d.kind, []); by.get(d.kind).push(d); }
  for (const [kind, list] of by) {
    // 板戸の裏桟と障子紙の裏表を保つ。右戸は引き手だけを反対側へ納めた共有部品にする。
    const handed = I.profile === 'okehazama' && (kind === 'itado' || kind === 'shoji');
    const count = list.reduce((s, d) => s + (handed ? d.n / 2 : d.n), 0);
    const meshes = panelInstances(kind, count, I.profile);
    const rightMeshes = handed ? panelInstances(kind, count, I.profile, true) : null;
    let i = 0;
    for (const d of list) { d.meshes = meshes; d.rightMeshes = rightMeshes; d.base = i; i += handed ? d.n / 2 : d.n; }
    const allMeshes = rightMeshes ? [...meshes, ...rightMeshes] : meshes;
    for (const m of allMeshes) { m.count = count; grp.add(m); }
    for (const d of list) okePose(d);
    for (const m of allMeshes) {
      m.computeBoundingSphere();
      // 桶狭間の戸は左右へ引き込む。初期姿勢から最大の移動幅まで一度だけ描画範囲を広げる。
      if (I.profile === 'okehazama') m.boundingSphere.radius += Math.max(...list.map(d => d.W / 2));
    }
  }
}

// 襖・格子戸の右戸は表裏を半回転する。描画と木部の当たりで向きを共有する。
function okePanelReversed(d, j) {
  return d.I.profile === 'okehazama' && j >= d.n / 2 && (d.kind === 'fusumaPlain' || d.kind === 'koshi');
}

function okePose(d) {
  // 比叡山は実寸の四枚建て・窓戸の行程を使い、桶狭間の二枚戸と分ける。
  if (d.tracked) return poseHiei(...arguments);
  if (!d.meshes) return;
  const I = d.I, k = d.open, e = k * k * (3 - 2 * k);
  S.set(d.pw / .9, d.h / 1.8, 1);
  for (let j = 0; j < d.n; j++) {
    const left = j < d.n / 2;
    // 表裏が同じ襖・格子戸は半回転できる。障子と板戸は紙・裏桟を裏返さない。
    const turn = okePanelReversed(d, j);
    Q.setFromAxisAngle(Y, I.rot + (turn ? Math.PI : 0));
    // 閉めた時は二本の溝（前後に少しずらす）。開けると左右の壁の前へ引き込む
    const lx = okePanelX(d, j, e);
    // 桶狭間の外戸は柱・板壁より外の二本の溝へ納める。開閉中も溝を変えず、壁へ埋まらず横に滑る。
    const lz = d.lz + (I.profile === 'okehazama' && d.exterior
      ? I.door.side * (.14 + (j % 2) * .07)
      : I.profile === 'okehazama' && ['bansho', 'minka', 'hondo'].includes(I.kind)
      // 内戸は厚さ .14m の戸脇柱より前後へ離す。框の厚さを含めても柱に食い込まない。
      ? (j % 2 ? 1 : -1) * .12
      : (j % 2 ? 1 : -1) * (.02 + .045 * e));
    // 開閉中は共有の座標を直接更新し、戸一枚ごとの座標配列を毎コマ作らない。
    P.set(I.x + lx * I.c + lz * I.s, d.y, I.z - lx * I.s + lz * I.c);
    M.compose(P, Q, S);
    const meshes = !left && d.rightMeshes ? d.rightMeshes : d.meshes;
    const index = d.base + (d.rightMeshes && !left ? j - d.n / 2 : j);
    for (const m of meshes) m.setMatrixAt(index, M);
  }
  for (const m of d.meshes) m.instanceMatrix.needsUpdate = true;
  if (d.rightMeshes) for (const m of d.rightMeshes) m.instanceMatrix.needsUpdate = true;
}
// 戸板と木框の当たりで同じ中心を使う。拡幅した分だけ中央へ寄せ、戸尻は溝端に保つ。
function okePanelX(d, j, e) {
  const side = j < d.n / 2 ? -1 : 1;
  return d.lx - d.W / 2 + (j + .5) * d.W / d.n + side * (e * d.W / 2 - d.lap / 2);
}
// 設営時に作った二本の当たりを動かす。毎コマ形・材質・座標の箱を作らない。
function okeSlideSolids(d) {
  const I = d.I, e = d.open * d.open * (3 - 2 * d.open);
  for (let side = -1; side <= 1; side += 2) {
    const s = side < 0 ? d.solid : d.rightSolid;
    // 桶狭間の二枚戸は、戸袋へ消えるのでなく壁の前に残る。
    // 戸口の残り幅だけでなく、横へ滑った戸板全体を同じ戸筋で止める。
    const shift = side * e * d.W / 2;
    const edge = d.lx + side * d.W / 2 + shift, inner = d.lx + shift - side * d.lap;
    const lz = d.lz + (d.exterior ? I.door.side * (side < 0 ? .14 : .21) : side * .12);
    // 線分の端には半径が足される。框の木口からはみ出さない位置へ
    // 両端を戻し、全開時も戸口へ見えない突起を残さない。
    const outerEnd = edge - side * s.r, innerEnd = inner + side * s.r;
    s.ax = I.x + outerEnd * I.c + lz * I.s; s.az = I.z - outerEnd * I.s + lz * I.c;
    s.bx = I.x + innerEnd * I.c + lz * I.s; s.bz = I.z - innerEnd * I.s + lz * I.c;
    s.x0 = Math.min(s.ax, s.bx) - s.r; s.x1 = Math.max(s.ax, s.bx) + s.r;
    s.z0 = Math.min(s.az, s.bz) - s.r; s.z1 = Math.max(s.az, s.bz) + s.r;

  }
  if (d.frameSolids) for (const f of d.frameSolids) {
    const s = f.s;
    const lx = okePanelX(d, f.j, e);
    // 右襖の引き手の下地板は左右対称ではない。木骨ごと描画と同じ半回転を使い、
    // 紙だけの所に見えない木を残さず、実際の下地板へ槍・矢を通さない。
    const direction = okePanelReversed(d, f.j) ? -1 : 1;
    const lz = d.lz + (d.exterior ? I.door.side * (.14 + (f.j % 2) * .07) : (f.j % 2 ? 1 : -1) * .12);
    s.ax = I.x + (lx + direction * f.ax) * I.c + (lz + direction * f.az) * I.s;
    s.az = I.z - (lx + direction * f.ax) * I.s + (lz + direction * f.az) * I.c;
    s.bx = I.x + (lx + direction * f.bx) * I.c + (lz + direction * f.bz) * I.s;
    s.bz = I.z - (lx + direction * f.bx) * I.s + (lz + direction * f.bz) * I.c;
    s.x0 = Math.min(s.ax, s.bx) - s.r; s.x1 = Math.max(s.ax, s.bx) + s.r;
    s.z0 = Math.min(s.az, s.bz) - s.r; s.z1 = Math.max(s.az, s.bz) + s.r;
  }
}
function okeSolidOff(d) {
  const s = d.solid;
  if (!d.saved) d.saved = { ax: s.ax, az: s.az, bx: s.bx, bz: s.bz, x0: s.x0, x1: s.x1, z0: s.z0, z1: s.z1 };
  s.ax = s.az = s.bx = s.bz = s.x0 = s.x1 = s.z0 = s.z1 = 1e9;
}
function okeSetWant(rt, d, want) {
  // 比叡山は実寸の四枚建て・窓戸の行程を使い、桶狭間の二枚戸と分ける。
  if (d.tracked) return setWant(...arguments);
  if (d.want === want) return;
  if (!want && d.tracked) {
    // 閉め始めから戸口を止める。人がいる間は閉めず、戸を体へ滑り込ませない。
    if (doorwayOccupied(rt, d)) return;
    if (d.saved) Object.assign(d.solid, d.saved);
  }
  d.want = want;
  if (want && !d.rightSolid) okeSolidOff(d);
  moving.add(d);
  if (rt.army && rt.army.play) rt.army.play('wood', { x: d.x, z: d.z }, .3);
}
function okeDoorBodyOverlap(d, o) {
  // 歩行時の壁判定と体高をそろえ、足が床より低くても頭が戸へ届けば拾う。
  // 戸の上に立つ人や、戸の下を完全に外れた人は開閉を妨げない。
  return o.pos.y < d.y + d.h - .05 && o.pos.y + (o.mounted ? 2.4 : 1.7) >= d.y;
}

// 戸口の帯（壁の線の前後0.35m・戸の幅の内）に立っているか
function okeAtDoorHeight(d, o) {
  // 明かり障子は腰壁の上にある。足元の高さだけで除外すると、
  // 窓下の人の頭や肩を戸が横切る。戸の上下端と体全体で比べる。
  if (d.tracked && d.window) return o.pos.y + (o.bodyHeight || 1.72 * (o.mesh?.scale.y || 1)) > d.y + sillHeight(d) && o.pos.y < d.y + d.h;
  return Math.abs(o.pos.y - d.y) < 1.2;
}

function okeInDoorway(d, o) {
  // 比叡山は実寸の四枚建て・窓戸の行程を使い、桶狭間の二枚戸と分ける。
  if (d.tracked) return inDoorwayHiei(...arguments);
  const dx = o.pos.x - d.I.x, dz = o.pos.z - d.I.z;
  const lx = dx * d.I.c - dz * d.I.s, lz = dx * d.I.s + dz * d.I.c;
  return Math.abs(lz - d.lz) < .35 && Math.abs(lx - d.lx) < d.W / 2 + .1
    && (d.rightSolid ? okeDoorBodyOverlap(d, o) : Math.abs(o.pos.y - d.y) < 1.2);
}

// 桶狭間の戸は開いても壁の前に残る。開閉の一歩分で、人を挟まないか調べる。
function okeSlidingDoorHits(d, o, nextOpen) {
  if (!o.alive || !okeDoorBodyOverlap(d, o)) return false;
  const opening = nextOpen > d.open;
  if (!opening && okeInDoorway(d, o)) return true;
  const I = d.I, dx = o.pos.x - I.x, dz = o.pos.z - I.z;
  const lx = dx * I.c - dz * I.s, lz = dx * I.s + dz * I.c;
  const before = d.open * d.open * (3 - 2 * d.open);
  const after = nextOpen * nextOpen * (3 - 2 * nextOpen);
  // 歩兵の半径は室内壁と同じ .3m。戸の厚みも足し、押し戻しが起きる前に止める。
  // 外戸へ寄る馬は、向きによる前後の長さも army_move.js とそろえる。
  const body = o.mounted ? .55 + .7 * Math.abs(Math.sin(o.heading) * I.s + Math.cos(o.heading) * I.c) : .3;
  const radius = body + d.solid.r;
  for (let side = -1; side <= 1; side += 2) {
    const track = d.lz + (d.exterior ? I.door.side * (side < 0 ? .14 : .21) : side * .12);
    // 開く時は外端が新たに通る帯を調べる。戸口側の人は、離れていく戸板を止めない。
    // 閉じる時は従来どおり戸板全体の通る幅を調べる。
    const a = d.lx + side * ((opening ? 1 + before : after) * d.W / 2 - (opening ? 0 : d.lap));
    const b = d.lx + side * (1 + (opening ? after : before)) * d.W / 2;
    const gapX = Math.max(Math.min(a, b) - lx, 0, lx - Math.max(a, b));
    const gapZ = lz - track;
    if (gapX * gapX + gapZ * gapZ < radius * radius) return true;
  }
  return false;
}


// 壁の厚みと柱の端まで含めて、操作する手前に木部があるか調べる。
// 壁に沿う線・長さゼロの柱も拾い、毎コマの座標や配列は作らない。
export function nakaWallBetween(w, ax, az, bx, bz, bodyRadius = 0) {
  const ex = w.bx - w.ax, ez = w.bz - w.az, len = Math.hypot(ex, ez);
  const ux = len > .000001 ? ex / len : 1, uz = len > .000001 ? ez / len : 0;
  const px = ax - w.ax, pz = az - w.az, dx = bx - ax, dz = bz - az;
  const radius = (w.r || 0) + bodyRadius;
  let lo = .001, hi = .999;
  for (let axis = 0; axis < 2; axis++) {
    const pos = axis ? -px * uz + pz * ux : px * ux + pz * uz;
    const delta = axis ? -dx * uz + dz * ux : dx * ux + dz * uz;
    const min = -radius, max = axis ? radius : len + radius;
    if (Math.abs(delta) < .000001) {
      if (pos < min || pos > max) return false;
    } else {
      const a = (min - pos) / delta, b = (max - pos) / delta;
      lo = Math.max(lo, Math.min(a, b)); hi = Math.min(hi, Math.max(a, b));
      if (lo > hi) return false;
    }
  }
  return true;
}
// 近い別の戸でも、間の襖・障子・板壁を越して操作しない。
// 目の高さの線分だけ調べ、既存の当たりを使う。座標の箱は毎コマ作らない。
function okeDoorReachable(d, u, x = d.x, z = d.z, handle = false) {
  if (d.I.profile !== 'okehazama') return true;
  const ax = u.pos.x, az = u.pos.z;
  const eye = u.pos.y + 1.2;
  // 段の上り下りでも、肩から実物の引き手へ手を伸ばす線で遮りを調べる。
  // 肩の高さだけで選ぶと、低い腰板を越して札が出たり、上の小壁に遮られたりする。
  const targetY = handle ? d.y + d.h * (d.kind === 'itado' || d.kind === 'koshi' ? .5 : .48) : eye;
  const rise = targetY - eye;
  // 堂の縁柱も室内の柱と同じ遮りにする。設営時の当たりを使い、配列は複製しない。
  const outside = d.I.exteriorSolids;
  for (let group = 0; group < (outside ? 2 : 1); group++) {
    const walls = group ? outside : INTERIOR_WALLS;
    for (const s of walls) {
      // 引き手を選ぶ時は、同じ組の戸板・木框も手前を遮る。
      // 兵が戸口の中心を目指す時だけ自分の戸を除き、閉じた戸も開けられるようにする。
      if ((!group && s.naka !== d.I.id) || (!handle && (s === d.solid || s === d.rightSolid || s.nakaDoor === d))) continue;
      let start = 0, end = 1;
      if (Math.abs(rise) < .000001) {
        if (eye < s.yBot || eye > s.yTop) continue;
      } else {
        const a = (s.yBot - eye) / rise, b = (s.yTop - eye) / rise;
        start = Math.max(0, Math.min(a, b)); end = Math.min(1, Math.max(a, b));
        if (start > end) continue;
      }
      if (nakaWallBetween(s, ax + (x - ax) * start, az + (z - az) * start,
        ax + (x - ax) * end, az + (z - az) * end)) return false;
    }
  }
  return true;
}

function okeNearest(rt) {
  // 比叡山は実寸の四枚建て・窓戸の行程を使い、桶狭間の二枚戸と分ける。
  if (rt.def.key === 'hieizan') return nearestHiei(...arguments);
  if (pickT === rt.t) return pick?.I.disabled ? null : pick;
  pickT = rt.t; pick = null;
  const u = rt.player && rt.player.u;
  if (!u || !u.alive || rt.player.mounted) return null;
  let bd = 1.5;
  for (const d of DOORS) {
    if ((!d.exterior && d.I.id + 1 !== u.naka) || (d.exterior && u.naka && d.I.id + 1 !== u.naka)
      || (d.I.profile !== 'okehazama' && Math.abs(u.pos.y - d.y) > 1.2)) continue;
    if (d.I.profile === 'okehazama') {
      // 札は空いた戸口に残さず、実際に滑った戸の引き手へ付ける。
      // okePose() と同じ拡大率・半回転・二筋を使い、開閉途中も追従させる。
      const I = d.I, e = d.open * d.open * (3 - 2 * d.open);
      const playerZ = (u.pos.x - I.x) * I.s + (u.pos.z - I.z) * I.c;
      const inset = d.kind === 'fusumaPlain' ? .13 : d.kind === 'itado' ? .12 : .02;
      const pull = (.45 - inset) * d.pw / .9;
      // 高床の入口も平面距離だけで選ばず、実際の指掛けまで届く所へ札を出す。
      const pullY = d.y + d.h * (d.kind === 'itado' || d.kind === 'koshi' ? .5 : .48);
      const reachY = pullY - (u.pos.y + 1.2);
      for (let j = 0; j < d.n; j++) {
        const left = j < d.n / 2;
        const lx = okePanelX(d, j, e) + (left ? pull : -pull);
        const track = d.lz + (d.exterior ? I.door.side * (.14 + (j % 2) * .07) : (j % 2 ? 1 : -1) * .12);
        // 紙面の裏を目標にすると、重なった固定戸を越して手が届く。
        // 遊び手側の面を調べ、壁・柱で隠れた引き手は選ばない。
        const lz = track + (playerZ >= track ? .035 : -.035);
        const x = I.x + lx * I.c + lz * I.s, z = I.z - lx * I.s + lz * I.c;
        const dist = Math.hypot(x - u.pos.x, z - u.pos.z, reachY);
        if (dist < bd && okeDoorReachable(d, u, x, z, true)) {
          bd = dist; pick = d; d.interact.x = x; d.interact.z = z;
        }
      }
      continue;
    }
    const x = d.x, z = d.z;
    const dist = Math.hypot(x - u.pos.x, z - u.pos.z);
    if (dist < bd && okeDoorReachable(d, u, x, z)) {
      bd = dist; pick = d; d.interact.x = x; d.interact.z = z;
    }
  }
  return pick;
}


// 毎コマ（naka.js の nakaTick の終わり）。flagged：中にいる兵
function okeNakaDoorTick(rt, dt, flagged) {
  // 比叡山は実寸の四枚建て・窓戸の行程を使い、桶狭間の二枚戸と分ける。
  if (!DOORS.length) return;
  if (rt.addInteract && !rt._nakaDoors) {
    rt._nakaDoors = true;
    rt.addInteract('naka_to', () => { const d = okeNearest(rt); return d && !(d.want && rt.def.doorCloseOK?.(rt) === false) ? d.interact : null; }, '開ける', () => {
      const d = okeNearest(rt); if (d) okeSetWant(rt, d, d.want ? 0 : 1);
    }, { r: 1.5, prio: -3 });
    const it = rt.interacts[rt.interacts.length - 1];
    Object.defineProperty(it, 'label', { get: () => (okeNearest(rt) && okeNearest(rt).want ? '閉める' : '開ける'), configurable: true });
  }
  // 中の兵は戸口へ来たら自分で開ける。
  // 桶狭間の遊び手は「開ける」の札で操作する。閉じた襖・障子・外戸へ
  // 押し続けただけで開くと、閉めておいた建具まで意図せず動いてしまう。
  // ほかの戦の押し開ける操作は従来どおり残す。
  autoT -= dt;
  if (autoT <= 0) {
    autoT = .2;
    const u = rt.player && rt.player.u;
    if (u && u.alive && (rt.player.blockedWalkT || 0) >= .5) {
      const d = okeNearest(rt);
      if (d && d.I.profile !== 'okehazama' && !d.want
        && Math.hypot(d.interact.x - u.pos.x, d.interact.z - u.pos.z) < 1.1) okeSetWant(rt, d, 1);
    }
    for (const o of flagged) {
      if (o.isPlayer || !o.alive || !o.naka) continue;
      const I = DOORS.find((d) => d.I.id + 1 === o.naka)?.I;
      if (!I || !I.doors) continue;
      // 兵も壁越しには開けない。長福寺の狭い縁の板間から、奥の格子戸だけが開くのを防ぐ。
      for (const d of I.doors) if (!d.want && Math.hypot(d.x - o.pos.x, d.z - o.pos.z) < 1.2
        && (I.profile === 'okehazama' ? okeDoorBodyOverlap(d, o) : Math.abs(o.pos.y - d.y) < 1.2)
        && okeDoorReachable(d, o)) okeSetWant(rt, d, 1);
    }
    // 桶狭間の外戸は屋外の徒歩兵も開ける。室内の兵だけ調べると、閉じた板戸の前で入れなくなる。
    // 既存の兵を五分の一秒ごとに調べ、距離・高さ・壁の向こうを除く。馬は屋内へ招き入れない。
    const units = rt.army?.units;
    if (units) for (const d of DOORS) {
      if (!d.exterior || d.want || d.I.profile !== 'okehazama') continue;
      for (const o of units) {
        // 高床の段では足元だけで除外しない。頭・肩が戸へ届く兵は、戸板の当たりと同じ高さで拾う。
        // 戸の上や床下に全身が隠れた兵は除き、段の途中で閉じた板戸に詰まるのを防ぐ。
        if (o.isPlayer || !o.alive || o.mounted || o.naka || !okeDoorBodyOverlap(d, o)) continue;
        const dx = d.x - o.pos.x, dz = d.z - o.pos.z;
        if (dx * dx + dz * dz >= 1.2 * 1.2 || !okeDoorReachable(d, o)) continue;
        okeSetWant(rt, d, 1);
        break;
      }
    }
  }
  for (const d of moving) {
    if (d.rightSolid) {
      // 開く時は引き込み先が空くまで待つ。閉じる時は触れる前に引き返して開く。
      const nextOpen = Math.max(0, Math.min(1, d.open + (d.want ? 1 : -1) * dt * 2.6));
      const u = rt.player && rt.player.u;
      let occupied = u && okeSlidingDoorHits(d, u, nextOpen);
      // 外戸の引き込みには屋外の兵・馬も立つ。室内の者だけでは戸板が体へ入り込む。
      // 動いている外戸だけ既存の兵の並びを調べ、新しい配列は作らない。
      const occupants = d.exterior ? rt.army?.units || flagged : flagged;
      for (const o of occupants) {
        if (occupied) break;
        if (o === u) continue;
        if (okeSlidingDoorHits(d, o, nextOpen)) occupied = true;
      }
      if (occupied) {
        if (!d.want) okeSetWant(rt, d, 1);
        continue;
      }
    }
    d.open = Math.max(0, Math.min(1, d.open + (d.want ? 1 : -1) * dt * 2.6));
    if (d.rightSolid) okeSlideSolids(d);
    okePose(d);
    if (d.open !== d.want) continue;
    if (d.want && d.tracked) okeSolidOff(d);
    if (!d.want) {
      // 閉め切った時に戸口に人が立っていれば、開けたままにして待つ
      const u = rt.player && rt.player.u;
      if ((u && okeInDoorway(d, u)) || flagged.some((o) => o.alive && o.naka === d.I.id + 1 && okeInDoorway(d, o))) { d.open = .02; continue; }
      if (d.saved) Object.assign(d.solid, d.saved);
    }
    moving.delete(d);
  }
}

// 比叡山の実寸建具。形・材質と動作中の行列は共通の保存先を使う。
