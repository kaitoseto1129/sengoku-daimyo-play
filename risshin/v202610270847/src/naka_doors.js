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
import { addDeck, FL } from './floors.js';
import { INTERIOR_WALLS } from './shironaka.js';
import { koshiTimbers, paperDoorTimbers, nodaDoorHeight, nodaShojiReverse, ceilingWoodMaterial, panelInstances, slidingDoorTrack, batchInterior, hieiRitualTimber, inabaBoardTexture, hieiPartitionHeight, HIEI_DOOR_TRACK, HIEI_ENTRY_TRACK, HIEI_LEAF_OVERLAP, HIEI_SOBO_SILL, igaShojiKoshi } from './interior_parts.js';
import { interiorPartitionHeight, interiorPartitionHeaders, shitaragaharaEntryInset } from './interior_layouts.js';
import { S as SETTINGS } from './settings.js';

export const DOORS = [];
// 窓の内壁から柱の室内面まで十三センチ。戸厚・当たりと一センチの隙間を見込む。
// 溝の絵も同じ値を使い、開けた障子・板戸を外周柱へ滑り込ませない。
export const IGA_WINDOW_INSET = .17;
// 館は格子・雨戸・明かり障子の順。戸厚六センチの四枚を別々の溝へ納める。
export const IGA_SHOJI_WINDOW_INSET = IGA_WINDOW_INSET + .15;
const SKIP = ['tenshu', 'yagura', 'gate'];
const TEMPLE = ['hondo', 'chudo', 'temple'];
const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
const moving = new Set();
// 御影堂の十二角の丸柱。柱身と同じ面の向きを一度だけ用意する。
const hallPostNormals = Array.from({ length: 12 }, (_, j) => {
  const a = (j + .5) * Math.PI / 6;
  return { x: Math.sin(a), z: Math.cos(a) };
});
const hallPostApothem = Math.cos(Math.PI / 12);
const MORIBE_PANEL_R = .03;
let windowRailGeo, windowRailMat;
// 窓枠は横木と竪枠で同じ形を回して使い、木目を材の長手へ向ける。
const windowJambTurn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);

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
  if (I.profile === 'moribe') return moribeAddNakaDoors(I, lv, y0, y1);
  if (['iga', 'hieizan', 'shitaragahara'].includes(I.profile)) return addNakaDoorsHiei(I, lv, y0, y1);
  if (I.profile === 'nodafukushima' && SETTINGS.quality === 'high') return addNodaDoors(I, lv, y0, y1);
  if (SKIP.includes(I.kind) || I.open || I.profile === 'yagura') return;
  const portals = [...(lv.layout.portals || [])];
  // 稲葉山の玄関も同じ引き戸で閉じる。外から操作でき、板倉には板戸を納める。
  if (I.profile === 'inabayama' && lv.k === 0) portals.push({
    x: I.door.lx, z: I.door.side * lv.d / 2, w: I.door.w, exterior: true,
    kind: ['hondo', 'shrine'].includes(I.kind) ? 'koshi' : ['goten', 'tamari'].includes(I.kind) ? 'shoji' : 'itado',
  });
  if (I.door.sliding && lv.k === 0 && I.profile !== 'inabayama') portals.push({
    x: I.door.lx, z: I.door.side * (lv.d / 2 - .08), w: I.door.w,
    exterior: true, entry: true, kind: I.door.sliding,
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
    const d = { I, lv, kind, entry: !!p.entry, exterior: !!p.exterior, window: !!p.window, lx: (l + r) / 2, lz: p.z, W, n, pw: W / n, h: doorH - sill, y: lv.y + sill, x, z, solid, saved: null, open: 0, want: 0, meshes: null, base: 0 };
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
    if (I.profile === 'toride' && p.entry) {
      // 墨俣の板壁より外の二本の溝へ納め、全開まで壁や戸枠へ食い込ませない。
      // 戸の足は五センチの敷居の上。横へ滑っても溝の位置は変えない。
      d.track = .05; d.trackZ = I.door.side * .185;
      d.leafY = d.y + .05; d.leafH = d.h - .05;
    }
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
  const joinery = SETTINGS.quality === 'high' && I.profile === 'nodafukushima';
  const portals = [...(lv.layout.portals || [])];
  // 設楽原の入口は雨戸を兼ねる板戸。二本の溝を内壁より室内側へ置く。
  // 内壁の柱は壁面から七センチ、敷居は溝の中心から十一センチ張り出す。
  // 二本の溝と敷居の見込みを含めて離し、開いた板戸も柱の手前へ収める。
  if (SETTINGS.quality === 'high' && I.profile === 'shitaragahara' && lv.k === 0 && ['minka', 'hondo'].includes(I.kind)) {
    const bottom = I.kind === 'minka' ? (lv.layout.rooms.find(r => r.floor === 'earth')?.y || 0) : 0;
    // 小堂の正面は入口の左右に明かり障子がある。板戸を同じ通りへ引くと
    // 紙戸と窓の見込み板を貫くため、板戸の溝だけ二十八センチ室内側へ離す。
    // 敷居・鴨居・戸当たりと当たり判定も、この位置を共用する。
    const entryInset = shitaragaharaEntryInset(I.kind);
    portals.push({ x: I.door.lx, z: I.door.side * (lv.d / 2 - entryInset),
      w: I.door.w, kind: 'itado', exterior: true, bottom,
      wallOffset: -I.door.side * entryInset,
      height: Math.min(I.door.h ?? Math.min(lv.h - .3, 2), lv.h) - bottom });
  }
  // 明かり障子は窓の半分へ二枚を重ねる。柱の外へ飛び出させない。
  for (const v of lv.windows || []) if (v.sliding && v.face === 'z') {
    // 設楽原の紙障子は外壁の内側へ納める。雨の当たる外の窓枠へ紙戸を張り出させない。
    // 内壁の柱と二本の溝の間に余白を取り、裏窓も同じ見込みで左右に滑らせる。
    const inset = SETTINGS.quality === 'high' && I.profile === 'shitaragahara'
      && ['minka', 'hondo'].includes(I.kind) ? -.36 : .25;
    portals.push({ x: v.t, z: v.s * (lv.d / 2 + inset), w: v.w,
      kind: 'shoji', exterior: true, window: true, bottom: v.y0, height: v.y1 - v.y0,
      wallOffset: inset < 0 ? v.s * (inset + .1) : 0 });
  }
  // 比叡山の正面入口にも同じ引き戸を使う。外壁の開口幅・高さに合わせる。
  if (I.profile === 'hieizan' && lv === I.levels[0]) portals.push({
    x: I.door.lx, z: I.door.side * (lv.d / 2 - HIEI_ENTRY_TRACK), entry: true,
    // 炊事の庫裏は堂の内陣用の格子戸にせず、土間を閉じる板戸にする。
    // 僧坊も外戸は板戸にし、紙障子は軒内の明かり取りと座敷境に残す。
    kind: ['sobo', 'kuri'].includes(I.kind) ? 'itado' : 'koshi',
  });
  // 伊賀の外戸は雨風を受ける板戸にする。館の紙障子は入口の内側に残し、
  // 外へ紙だけを露出させない。室内の戸と同じ形の共有・開閉の仕組みを使う。
  if (I.profile === 'iga' && lv.k === 0) portals.push({
    x: I.door.lx, z: I.door.side * lv.d / 2, w: I.door.w, exterior: true,
    kind: 'itado',
  });
  // 館も紙の外側に雨戸を納め、民家・陣小屋・番所は板戸だけにする推定復元。
  // 窓は通路にせず、室内から共通の札で開閉する。
  if (I.profile === 'iga' && ['yashiki', 'minka', 'nagaya', 'bansho'].includes(I.kind)) for (const w of lv.windows || []) {
    if (w.face !== 'z' || w.shoji) continue;
    const window = { x: w.t, z: w.s * (lv.d / 2 - .1), window: true,
      side: w.s, w: w.w, y: w.y0, top: w.y1 };
    portals.push({ ...window, kind: 'itado', initialOpen: I.kind === 'yashiki' });
    if (I.kind === 'yashiki') portals.push({ ...window, kind: 'shoji', inset: IGA_SHOJI_WINDOW_INSET });
  }
  for (const p of portals) {
    const width = p.window ? p.w : I.door.w;
    let l = p.exterior || p.entry || p.window ? p.x - width / 2 : -Infinity;
    let r = p.exterior || p.entry || p.window ? p.x + width / 2 : Infinity, paper = true;
    for (const v of p.exterior || p.entry || p.window ? [] : lv.layout.walls) {
      if (v.guideOnly || Math.abs(v.az - p.z) > .01 || Math.abs(v.bz - p.z) > .01) continue;
      const a = Math.min(v.ax, v.bx), b = Math.max(v.ax, v.bx);
      if (b <= p.x + .01 && b > l) { l = b; paper = v.paper; }
      if (a >= p.x - .01 && a < r) r = a;
    }
    if (p.exterior) { l = p.x - p.w / 2; r = p.x + p.w / 2; }
    if (!isFinite(l) || !isFinite(r) || r - l < .5 || r - l > 4.4) continue;
    const temple = TEMPLE.includes(I.kind);
if (I.profile === 'hieizan' || I.profile === 'iga') {
    const kind = I.profile === 'iga' && p.kind === 'fusuma' ? 'fusumaPlain'
      : p.kind || (temple ? 'koshi' : !paper ? 'itado' : ['goten', 'yashiki', 'shisha'].includes(I.kind) ? 'fusumaE' : 'shoji');
    const W = r - l, n = Math.max(2, Math.round(W / 1.8) * 2);
    if (I.profile === 'iga') {
      // 伊賀は壁の前の二本の溝へ戸を納める。当たりと閉める時の人よけも同じ位置にそろえる。
      const trackSide = p.window ? -p.side : p.exterior ? -I.door.side : 1;
      const trackZ = p.z + (I.profile === 'iga' ? trackSide * ((p.window ? p.inset ?? IGA_WINDOW_INSET : p.exterior ? .34 : .11) + .0375) : 0);
      const [ax, az] = I.P(l, trackZ), [bx, bz] = I.P(r, trackZ), rad = I.profile === 'iga' ? .035 : .06;
      // 敷居を上げても戸の上端は鴨居の下にそろえる。外の戸口は土間の高さを保つ。
      const floorY = p.y || 0;
      const h = (p.window ? p.top : p.exterior ? I.door.h ?? Math.min(lv.h - .3, 2)
        : I.profile === 'iga' ? Math.min(2.05, lv.h - .2) : lv.h > 3 ? 2.3 : lv.h - .02) - floorY;
      const iga = I.profile === 'iga', doorTop = lv.y + floorY + h;
      const solid = { k: 's', ax, az, bx, bz, r: rad, yBot: iga ? lv.y + floorY : y0, yTop: iga ? doorTop : p.exterior ? lv.y + h : y1, naka: I.id, fusuma: kind !== 'itado', bodyOverlap: iga && !!p.window,
        x0: Math.min(ax, bx) - rad, x1: Math.max(ax, bx) + rad, z0: Math.min(az, bz) - rad, z1: Math.max(az, bz) + rad };
      SOLIDS.push(solid); INTERIOR_WALLS.push(solid);
      const [x, z] = I.P((l + r) / 2, trackZ);
      const d = { I, lv, kind, exterior: !!p.exterior, window: !!p.window, lx: (l + r) / 2, lz: p.z, trackZ, trackSide, W, n, pw: W / n, h, y: lv.y + floorY, x, z, interactPos: { x, z }, solid, saved: null, open: 0, want: 0, meshes: null, base: 0 };
      // 二本の溝にある縦框を四センチ重ね、閉じた召し合わせの見通しを塞ぐ。
      // 開き切った時の通れる幅は保ち、増した戸幅の半分だけ引きしろも延ばす。
      d.overlap = iga ? .04 : 0;
      d.panelW = d.pw + d.overlap;
      d.travel = (W + d.overlap) / 2;
      // 伊賀は一枚ずつの戸に別々の当たりを持たせ、滑った分だけ通れる幅を開く。
      // 当たりは設営時に一度だけ作り、開閉中は座標だけを書き換える。
      if (I.profile === 'iga') {
        d.leaves = [solid];
        for (let j = 1; j < n; j++) {
          const leaf = { ...solid };
          SOLIDS.push(leaf); INTERIOR_WALLS.push(leaf); d.leaves.push(leaf);
        }
        // 紙を貫けても木の框は貫けない。固定の建具と同じ四センチ幅で分け、
        // 引き戸一枚ごとの当たりを設営時に作る。開閉中は既存の当たりだけを動かす。
        if (kind === 'fusumaPlain' || kind === 'shoji') {
          d.frames = [];
          const bottom = d.y + .04, top = d.y + d.h;
          const bottomRail = .04 + (kind === 'shoji' ? igaShojiKoshi(d.h - .04) : 0);
          for (let j = 0; j < n; j++) {
            const parts = [];
            for (const [a, b, low, high] of [
              [0, d.panelW, bottom, bottom + bottomRail],
              [0, d.panelW, top - .04, top],
              [0, .04, bottom + bottomRail, top - .04],
              [d.panelW - .04, d.panelW, bottom + bottomRail, top - .04],
            ]) {
              const frame = { ...solid, r: .02, yBot: low, yTop: high,
                fusuma: false, bodyOverlap: true, leafStart: a, leafEnd: b };
              SOLIDS.push(frame); INTERIOR_WALLS.push(frame); parts.push(frame);
            }
            d.frames.push(parts);
          }
        }
        slideSolids(d);
        // 引き切った戸の外端を戸当たりで受ける。紙の戸とは分け、
        // 二本の溝をまたぐ止め木に体や槍がすり抜けないようにする。
        for (const side of [-1, 1]) {
          const stopX = d.lx + side * (W + d.overlap + .03);
          const [sx0, sz0] = I.P(stopX, trackZ - .045);
          const [sx1, sz1] = I.P(stopX, trackZ + .045);
          const stop = { k: 's', ax: sx0, az: sz0, bx: sx1, bz: sz1, r: .03,
            yBot: lv.y + floorY + .04, yTop: doorTop, naka: I.id, bodyOverlap: true,
            x0: Math.min(sx0, sx1) - .03, x1: Math.max(sx0, sx1) + .03,
            z0: Math.min(sz0, sz1) - .03, z1: Math.max(sz0, sz1) + .03 };
          SOLIDS.push(stop); INTERIOR_WALLS.push(stop);
        }
        // 鴨居と小壁は戸と一緒に滑らせない。引き戸の上まで紙の当たりにすると、
        // 開けた時に小壁をすり抜け、閉めた時は小壁まで槍が通っていた。
        // 外の戸口の横木は naka.js が作るので、ここでは室内の間仕切りだけを受け持つ。
        if (!p.exterior && !p.window && doorTop < y1) {
          const [hx0, hz0] = I.P(l, p.z), [hx1, hz1] = I.P(r, p.z);
          // 戸口の上も固定の間仕切りと同じ鴨居の見込みにする。
          // 厚い当たりは成十センチの横木だけに付け、小壁まで広げない。
          const cap = Math.min(doorTop + .1, y1);
          for (const [bottom, top, radius] of [[doorTop, cap, .24], [cap, y1, .08]]) {
            if (top <= bottom) continue;
            const header = { k: 's', ax: hx0, az: hz0, bx: hx1, bz: hz1, r: radius,
              yBot: bottom, yTop: top, naka: I.id, bodyOverlap: true,
              x0: Math.min(hx0, hx1) - radius, x1: Math.max(hx0, hx1) + radius,
              z0: Math.min(hz0, hz1) - radius, z1: Math.max(hz0, hz1) + radius };
            SOLIDS.push(header); INTERIOR_WALLS.push(header);
          }
        }
      }
      (I.doors || (I.doors = [])).push(d); DOORS.push(d);
      // 明かりを採るため館の雨戸だけ開けて始める。紙障子は閉じたまま、別々に扱える。
      if (temple || p.initialOpen) { d.open = d.want = 1; if (d.leaves) slideSolids(d); else solidOff(d); }
    } else {
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
} else {
    const plain = SETTINGS.quality === 'high' && I.profile === 'shitaragahara' && I.kind === 'minka' && p.kind === 'fusuma';
    const baseKind = plain ? 'fusumaPlain' : p.kind || (temple ? 'koshi' : !paper ? 'itado' : ['goten', 'yashiki', 'shisha'].includes(I.kind) ? 'fusumaE' : 'shoji');
    const W = r - l, n = p.window ? 2 : Math.max(2, Math.round(W / 1.8) * 2);
    // 固定の襖・格子と同じ面へ引くと戸が埋まる。設楽原の間仕切りは手前の二本の溝を使う。
    // 敷居の奥端も柱から二センチ離し、奥の戸の当たりを固定壁へ重ねない。
    // 明かり障子も敷居・鴨居の二本の溝に沿って滑らせる。
    const villageTrack = SETTINGS.quality === 'high' && I.profile === 'shitaragahara';
    // 設楽原の間仕切りは六センチの敷居へ載せる。襖だけでなく障子・格子戸も
    // 固定建具と下端を揃え、溝を床下へ埋めない。鴨居は動かさず戸を短くする。
    // 外の板戸と明かり障子は、それぞれの開口で決めた下端を保つ。
    const bottom = p.bottom ?? (villageTrack && !p.exterior ? .06 : 0);
    const kind = villageTrack && baseKind === 'itado' ? 'itadoVillage'
      : villageTrack && baseKind === 'shoji' ? (I.kind === 'minka' && !p.window ? 'shojiKoshi' : 'shojiKumiko')
      : villageTrack && baseKind === 'koshi' ? 'koshiHikite' : baseKind;
    // 裏向きの民家も入口側へ引く。常に正方向へ出すと奥座敷の畳に
    // 襖の敷居と開いた戸が食い込み、土間側の障子も上がり框から外れる。
    const doorZ = p.z + (villageTrack && !p.exterior ? I.door.side * .20 : 0);
    // 設楽原の框は見込み六センチ。線分の半径へ厚み全体を渡すと
    // 十二センチの見えない板になり、二本の溝の間まで当たりが重なる。
    // 格子戸の引手金具だけは表裏に三・五センチ出るため、その外面まで受ける。
    const rad = villageTrack ? (kind === 'koshiHikite' ? .035 : .03) : .06;
    const [ax, az] = I.P(l, doorZ), [bx, bz] = I.P(r, doorZ);
    // 設楽原の木の格子戸は、固定の格子と同じ当たりにする。開いた所だけ通せる。
    const paperPanel = kind !== 'itado' && kind !== 'itadoVillage' && !(villageTrack && baseKind === 'koshi');
    const solid = { k: 's', ax, az, bx, bz, r: rad, yBot: y0, yTop: y1, naka: I.id, fusuma: paperPanel,
      x0: Math.min(ax, bx) - rad, x1: Math.max(ax, bx) + rad, z0: Math.min(az, bz) - rad, z1: Math.max(az, bz) + rad };
    SOLIDS.push(solid); INTERIOR_WALLS.push(solid);
    const [x, z] = I.P((l + r) / 2, doorZ);
    // 設楽原の戸は枠の寸法そのもの。上端を二センチ削ると、閉めても鴨居の下が帯状に抜ける。
    const clearance = villageTrack ? 0 : .02;
    const h = p.height ?? (p.exterior ? Math.min(I.door.h ?? Math.min(lv.h - .3, 2), lv.h) - clearance
      : interiorPartitionHeight(lv.layout, lv.h) - bottom - (lv.h > 3 ? 0 : clearance));
    if (villageTrack && !p.exterior && paper && ['minka', 'hondo'].includes(I.kind)) {
      // 戸を開けても鴨居と欄間は残る。動く戸とは別の当たりを、内装の枠と同じ面に置く。
      // 一度だけ登録し、体の上側と射線も止める。徒歩の頭上には通れる高さを残す。
      const ph = interiorPartitionHeight(lv.layout, lv.h);
      if (ph < lv.h) {
        for (const piece of interiorPartitionHeaders(lv.layout, lv.h, l, r)) {
          const [a, b] = I.P(piece.ax, p.z), [c, e] = I.P(piece.bx, p.z);
          const rad = piece.r;
          const header = { k: 's', ax: a, az: b, bx: c, bz: e, r: rad,
            yBot: lv.y + piece.y0, yTop: lv.y + piece.y1, naka: I.id, bodyOverlap: true,
            x0: Math.min(a, c) - rad, x1: Math.max(a, c) + rad,
            z0: Math.min(b, e) - rad, z1: Math.max(b, e) + rad };
          SOLIDS.push(header); INTERIOR_WALLS.push(header);
        }
      }
    }
    if (p.exterior) solid.yTop = lv.y + bottom + h;
    // 設楽原は戸の下端も見た目に合わせる。土間の板戸は低い床まで、襖・格子戸は敷居まで。
    if (villageTrack || p.window) solid.yBot = lv.y + bottom;
    // 左右に引く戸は当たりも二つに分ける。開閉中も戸のある所だけを塞ぎ、使い回す。
    let otherSolid = null;
    if (villageTrack) {
      solid.yTop = lv.y + bottom + h;
      // 敷居の手前では足が戸の下端より低い。足元だけで除外せず、
      // 身体に触れる戸を止める。明かり障子と、下で複製する框・組子も共用する。
      solid.bodyOverlap = true;
      otherSolid = { ...solid };
      SOLIDS.push(otherSolid); INTERIOR_WALLS.push(otherSolid);
    }
    // 紙戸の上下の横框も木で受ける。腰障子は杉板と中桟まで同じ当たりへまとめる。
    // 開閉中は座標だけを書き換え、木部も紙の戸と同じ二本の溝に沿わせる。
    const woodSolids = villageTrack && paperPanel ? [solid, otherSolid].map(s => {
      const lower = kind === 'shojiKoshi' ? h / 6 + .02 : .04;
      // 紙の両脇の竪框も木として受ける。上下の框の内側だけに納める。
      const ranges = [[0, lower, 0], [h - .04, h, 0],
        [lower, h - .04, -1], [lower, h - .04, 1]];
      const pieces = ranges.map(([low, high, edge]) => {
        const wood = { ...s, r: edge ? .02 : .03, fusuma: false, edge, doorLeaf: s,
          yBot: lv.y + bottom + low, yTop: lv.y + bottom + high };
        SOLIDS.push(wood); INTERIOR_WALLS.push(wood);
        return wood;
      });
      if (kind === 'shojiKoshi' || kind === 'shojiKumiko') {
        // 紙の部分は槍を通し、木の組子だけ受ける。戸と同じ実寸の四列・六段割り。
        // 当たりは設営時に作り、開閉中は既存の戸と一緒に座標だけ動かす。
        const width = W / 2 + (p.window ? .015 : .03), iw = width - .04;
        const waistTop = kind === 'shojiKoshi' ? h / 6 : .02;
        const ih = h - .02 - waistTop;
        const bar = (a, b, low, high, radius, halfDepth) => {
          const wood = { ...s, r: radius, fusuma: false, edge: 0, doorLeaf: s,
            kumiko: { a, b, halfDepth }, yBot: lv.y + bottom + low, yTop: lv.y + bottom + high };
          SOLIDS.push(wood); INTERIOR_WALLS.push(wood); pieces.push(wood);
        };
        for (let j = 1; j < 4; j++) {
          const x = -iw / 2 + iw * j / 4;
          bar(x, x, waistTop + .02, h - .04, .008, .025);
        }
        for (let j = 1; j < 6; j++) {
          const y = waistTop + ih * j / 6;
          bar(-iw / 2 + .02, iw / 2 - .02, y - .007, y + .007, .025, 0);
        }
      }
      return pieces;
    }) : null;
    // 窓の二枚は召し合わせを三センチ重ねたまま、外端を窓枠の内側へ納める。
    // 全開では二枚の中心が揃う距離だけ滑らせ、框を縦枠へ突き込まない。
    const travel = (W - (p.window && villageTrack ? .03 : 0)) / 2;
    const d = { I, lv, kind, exterior: !!p.exterior, window: !!p.window, windowLeaf: 0, wallOffset: p.wallOffset || 0, villageTrack, lx: (l + r) / 2, lz: doorZ, W, n, pw: W / n, travel, h, y: lv.y + bottom, x, z, solid, otherSolid, woodSolids, saved: null, open: 0, want: 0, meshes: null, base: 0 };
    if (villageTrack) {
      // 敷居・鴨居の端を結ぶ戸当たりも、見た目と同じ場所で体を止める。
      // 固定壁より手前の溝にあるため、壁の当たりだけでは柱をすり抜けてしまう。
      // slidingDoorTrack の縦材と寸法を揃え、設営時だけ二本を登録する。
      const radius = d.window ? .03 : .02;
      const end = d.window ? W / 2 + .03 : W + .04;
      for (const side of [-1, 1]) {
        const lx = d.lx + side * end;
        const [ax, az] = I.P(lx, doorZ - .11 + radius);
        const [bx, bz] = I.P(lx, doorZ + .11 - radius);
        const post = { k: 's', ax, az, bx, bz, r: radius,
          yBot: d.y - .055, yTop: d.y + h + .055, naka: I.id, bodyOverlap: true,
          x0: Math.min(ax, bx) - radius, x1: Math.max(ax, bx) + radius,
          z0: Math.min(az, bz) - radius, z1: Math.max(az, bz) + radius };
        SOLIDS.push(post); INTERIOR_WALLS.push(post);
      }
      const returnOffset = d.exterior ? d.wallOffset : I.door.side * .20;
      const returnDepth = Math.abs(returnOffset) - .11 - (d.exterior ? 0 : .03);
      if (returnDepth > 0) {
        // 入口の引き込み端と、明かり障子の窓脇を外壁へつなぐ側板。
        // 窓も見た目の見込みを残し、脇の木を抜けて紙戸の裏へ手を伸ばせないようにする。
        // 見た目と同じ厚み・高さで設営時だけ作り、戸の通る二本の溝は空ける。
        // 間仕切りの引き込み端も側板で閉じ、見える木を射線が抜けないようにする。
        // 固定建具の表面までとし、滑る戸の溝や通行幅へは張り出さない。
        const sign = Math.sign(returnOffset), radius = d.window ? .03 : .02;
        for (const side of [-1, 1]) {
          const lx = d.lx + side * (d.window ? W / 2 + .03 : W + .04);
          // 線分の両端にも半径が付くため、側板の木口から半径分だけ内側へ収める。
          const [ax, az] = I.P(lx, doorZ - sign * (.11 + radius));
          const [bx, bz] = I.P(lx, doorZ - sign * (.11 + returnDepth - radius));
          const panel = { k: 's', ax, az, bx, bz, r: radius,
            yBot: d.y, yTop: d.y + h, naka: I.id, bodyOverlap: true,
            x0: Math.min(ax, bx) - radius, x1: Math.max(ax, bx) + radius,
            z0: Math.min(az, bz) - radius, z1: Math.max(az, bz) + radius };
          SOLIDS.push(panel); INTERIOR_WALLS.push(panel);
        }
      }
      // 戸を開けても鴨居と、その上の受け材は残る。外壁より手前へ出た
      // 木組みも体と射線を止め、頭だけ鴨居をすり抜けないようにする。
      // slidingDoorTrack と同じ外寸を使い、開閉中には作り直さない。
      // 木口は縦枠の内面まで。横材と戸当たりの当たりを重ねず、
      // slidingDoorTrack の見た目と同じ長さで受ける。
      const span = d.window ? W : W * 2 + .04;
      if (!d.window) {
        // 板戸・襖・格子戸の敷居は、開けても床より高い溝の岸が残る。
        // 見える二十五ミリの上端へ足場を合わせ、板間や内陣で足を木へ沈めない。
        // 引き込み先まで同じ敷居とし、窓台は歩行面にしない。設営時だけ登録する。
        const id = addDeck({ cx: d.x, cz: d.z, rot: I.rot,
          x0: -span / 2, x1: span / 2, z0: -.11, z1: .11,
          y: d.y + .025, roof: lv.y + lv.h, pad: 0, name: '引き戸の敷居' });
        FL.decks[id].interior = true;
      }
      const header = (depth, z, low, high) => {
        const r = depth / 2;
        const [ax, az] = I.P(d.lx - span / 2 + r, z);
        const [bx, bz] = I.P(d.lx + span / 2 - r, z);
        const solid = { k: 's', ax, az, bx, bz, r,
          yBot: d.y + h + low, yTop: d.y + h + high, naka: I.id, bodyOverlap: true,
          x0: Math.min(ax, bx) - r, x1: Math.max(ax, bx) + r,
          z0: Math.min(az, bz) - r, z1: Math.max(az, bz) + r };
        SOLIDS.push(solid); INTERIOR_WALLS.push(solid);
      };
      header(.22, doorZ, -.025, .055);
      if (d.window) {
        // 窓台と上下の見込み板も絵と同じ厚みで受ける。
        // 開いた障子の下や上から木枠をすり抜けず、紙戸の溝だけを動かす。
        header(.22, doorZ, -h - .055, -h + .025);
        if (Math.abs(d.wallOffset) > .11) {
          const depth = Math.abs(d.wallOffset) - .11;
          const z = doorZ - Math.sign(d.wallOffset) * (.11 + depth / 2);
          header(depth, z, 0, .055);
          header(depth, z, -h - .055, -h);
        }
      }
      // 通行用の戸は、手前の鴨居と壁側の鴨居を結ぶ上の受け材にも当たりを残す。
      const offset = d.exterior ? d.wallOffset : I.door.side * .20;
      if (!d.window && offset !== 0)
        header(Math.abs(offset) + .22, doorZ - offset / 2, .055, .115);
    }
    (I.doors || (I.doors = [])).push(d); DOORS.push(d);
    if (temple && !p.exterior) { d.open = d.want = 1; if (!otherSolid) solidOff(d); }
    if (otherSolid) pose(d);

}
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
  if (I.profile === 'moribe') return moribeBuildNakaDoorMeshes(I, grp);
  if (['iga', 'hieizan', 'shitaragahara'].includes(I.profile)) return buildNakaDoorMeshesHiei(I, grp);
  if (I.profile === 'nodafukushima' && SETTINGS.quality === 'high') return buildNodaDoorMeshes(I, grp);
  if (!I.doors) return;
  const fitted = SETTINGS.quality === 'high' && I.profile === 'inabayama';
  if (fitted && I.doors.length) {
    // 引き先を溝だけで終わらせず、戸尻を受ける縦の戸当たりを添える推定の納まり。
    // 引き分けは全開時の外端で受ける。
    // 窓は naka.js の戸じゃくり付き縦枠で受ける。角材を重ねると
    // 二本の溝の欠きを塞ぎ、閉じた戸の縦框と七ミリ重なってしまう。
    // 召し合わせの重なりと戸の厚みも逃がし、動く框へ木枠を食い込ませない。
    stopShape ||= new THREE.BoxGeometry(1, 1, 1);
    // 戸当たりも框の仕上げへ揃える。襖・格子戸は塗り、障子・板戸は縦の木目。
    // 木目の絵と材質は全棟で共有し、設営時だけ二種類までにまとめる。
    inabaStopWood ||= new THREE.MeshStandardMaterial({ map: inabaBoardTexture(), roughness: 1, metalness: 0 });
    inabaStopPaint ||= new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 });
    const groups = new Map();
    for (const d of I.doors) {
      if (d.window) continue;
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
        const end = d.W + overhang + .025;
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
    const key = (fitted ? d.kind + ':' + d.leafW + ':' + d.leafH : d.kind)
      + (I.door.buildPanels && d.entry ? ':entry' : '');
    if (!by.has(key)) by.set(key, []);
    by.get(key).push(d);
  }
  for (const list of by.values()) {
    const kind = list[0].kind, w = fitted ? list[0].leafW : .9, h = fitted ? list[0].leafH : 1.8;
    const pairedLeaves = fitted && ['itado', 'shoji', 'koshi'].includes(kind);
    const count = list.reduce((s, d) => s + (pairedLeaves ? d.n / 2 : d.n), 0);
    const meshes = I.door.buildPanels && list[0].entry
      ? I.door.buildPanels(count) : panelInstances(kind, count, fitted, w, h);
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
  const windows = I.doors.filter(d => d.windowJambs);
  if (windows.length) {
    // 敷居・鴨居は共通の箱を一束にする。二本の溝を残し、開いた障子も壁の手前で受ける。
    if (!windowRailGeo) {
      windowRailGeo = new THREE.BoxGeometry(1, 1, 1);
      const pos = windowRailGeo.attributes.position, uv = windowRailGeo.attributes.uv;
      for (let j = 0; j < pos.count; j++) {
        const face = Math.floor(j / 4);
        // 横木の側面は横方向へ木目を通し、木口は断面として納める。
        uv.setXY(j, (face < 2 ? pos.getZ(j) : face < 4 ? pos.getZ(j) : pos.getY(j)) + .5,
          (face < 2 ? pos.getY(j) : pos.getX(j)) + .5);
      }
    }
    // 天井・柱と同じ木肌を共用し、無地の窓枠だけが浮いて見えるのを防ぐ。
    windowRailMat ||= new THREE.MeshLambertMaterial({ color: 0x3a2a1c, map: ceilingWoodMaterial().map });
    const rails = new THREE.InstancedMesh(windowRailGeo, windowRailMat, windows.length * 10);
    let index = 0;
    for (const d of windows) {
      Q.setFromAxisAngle(Y, I.rot - (d.axisX ? Math.PI / 2 : 0));
      for (const rail of d.windowRails) {
        S.set(d.W * 2, rail.yTop - rail.yBot, rail.r * 2);
        P.set((rail.ax + rail.bx) / 2, (rail.yBot + rail.yTop) / 2, (rail.az + rail.bz) / 2);
        M.compose(P, Q, S); rails.setMatrixAt(index++, M);
      }
      // 引き込んだ内障子の端も竪枠で受ける。窓の開口だけでなく、
      // 二倍幅の敷居・鴨居の両端をつなぎ、横木が宙に突き出した形にしない。
      // 戸の全開位置より外へ納め、二本の溝と紙戸の通り道を空ける。
      Q.multiply(windowJambTurn);
      for (const jamb of d.windowJambs) {
        S.set(jamb.yTop - jamb.yBot, jamb.r * 2, .4);
        P.set((jamb.ax + jamb.bx) / 2, (jamb.yBot + jamb.yTop) / 2, (jamb.az + jamb.bz) / 2);
        M.compose(P, Q, S); rails.setMatrixAt(index++, M);
      }
    }
    // 間仕切りは竪枠だけ。予約した未使用の行列を描かない。
    rails.count = index;
    rails.computeBoundingSphere(); grp.add(rails);
  }
if (I.profile === 'hieizan' || I.profile === 'iga') {
  if (I.profile === 'hieizan') {
    // 正面戸・間仕切り・明かり障子を一束で描く。動く戸とは分けて更新しない。
    // 戸当たりも建具の框と同じ実寸の木肌にする。単位箱の引き伸ばしをやめ、
    // 窓と座敷で高さが違っても縦の木目と小口の縮尺を揃える。
    // 同寸の形・材質を共有し、全ての戸当たりを設営時に一束へまとめる。
    const stops = new THREE.Group();
    for (const d of I.doors) {
      const frame = d.frame || I, sill = sillHeight(d), height = panelHeight(d);
      for (const side of [-1, 1]) {
        const x = d.lx + side * (stopOffset(d) + .025);
        const stop = hieiRitualTimber(stops, .05, height, .18,
          frame.x + x * frame.c + d.lz * frame.s, d.y + sill + height / 2,
          frame.z - x * frame.s + d.lz * frame.c, 0x795b3b);
        stop.rotation.y = frame.rot;
        // 正面戸・座敷境の戸当たりを、敷居と鴨居へ枘差しして込栓で留める。
        // 細かな仕口は推定。枘は横木の内側、栓の木口は溝の外へ納める。
        // 窓は別の窓台で受けるため除き、既存のまとめ描きだけに含める。
        if (!d.window) for (const [y, direction] of [[d.y + sill, -1], [d.y + d.h, 1]]) {
          const joint = hieiRitualTimber(stops, .025, .04, .06,
            frame.x + x * frame.c + d.lz * frame.s, y,
            frame.z - x * frame.s + d.lz * frame.c, 0x795b3b);
          joint.rotation.y = frame.rot;
          for (const face of [-1, 1]) {
            const z = d.lz + face * .094;
            const peg = hieiRitualTimber(stops, .012, .012, .008,
              frame.x + x * frame.c + z * frame.s, y + direction * .012,
              frame.z - x * frame.s + z * frame.c, 0x95704a);
            peg.rotation.y = frame.rot;
          }
        }
      }
    }
    const joined = batchInterior(stops);
    for (const mesh of joined.children) mesh.receiveShadow = true;
    grp.add(joined);
  }
  const by = new Map();
  for (const d of I.doors) {
    // 伊賀の戸は小窓も外戸も間仕切りも実寸で組む。標準幅の戸を伸縮すると、
    // 狭い外戸の框と引手が潰れ、館では固定の襖・障子と桟の太さが違っていた。
    // 同じ種類・寸法の戸は原形と材質を共有し、開閉中は行列だけを動かす。
    d.fittedPanel = I.profile === 'iga' || d.tracked;
    if (d.tracked) d.panelW = d.pw + HIEI_LEAF_OVERLAP;
    // 障子・板戸は左右で引手だけを替え、二枚とも同じ面を室内へ向ける。
    // 外壁の向きで裏返す時も、同寸の左右の原形をそれぞれ共用する。
    const split = I.profile === 'iga' && (d.kind === 'shoji' || d.kind === 'itado');
    for (const right of split ? [false, true] : [false]) {
      const reverse = split && igaReverseFace(d);
      const kind = (right !== reverse) ? d.kind + 'Right' : d.kind;
      const key = kind + (d.fittedPanel ? ':' + d.panelW + ':' + (I.profile === 'iga' ? d.h - .04 : panelHeight(d)) : '');
      if (!by.has(key)) by.set(key, []);
      by.get(key).push({ d, right, kind, count: split ? d.n / 2 : d.n });
    }
  }
  for (const entries of by.values()) {
    const list = entries.map(v => v.d);
    const first = list[0], size = first.fittedPanel ? { w: first.panelW, h: I.profile === 'iga' ? first.h - .04 : panelHeight(first) } : null;
    const count = entries.reduce((s, v) => s + v.count, 0);
    const kind = entries[0].kind;
    const panelKind = I.profile === 'hieizan' ? kind === 'shoji' ? 'shojiHiei' : kind === 'koshi' ? 'koshiHiei' : kind === 'itado' ? 'itadoHiei' : kind : kind;
    const meshes = I.profile === 'iga' ? panelInstances(kind, count, 'iga', size)
      : first.tracked ? panelInstances(panelKind, count, false, first.pw + HIEI_LEAF_OVERLAP, panelHeight(first)) : panelInstances(panelKind, count);
    let i = 0;
    for (const { d, right, count } of entries) {
      if (right) { d.rightMeshes = meshes; d.rightBase = i; }
      else { d.meshes = meshes; d.base = i; }
      i += count;
    }
    for (const m of meshes) { m.count = count; grp.add(m); }
    for (const d of list) pose(d);
    for (const m of meshes) m.computeBoundingSphere();
    if (I.profile === 'iga' || I.profile === 'hieizan') {
      // 閉じた戸だけの範囲では、壁の前へ引いた戸が視界の端で消える。
      // 開閉両端を包む範囲を初回だけ作り、滑っている途中も同じ範囲を使う。
      const states = list.map(d => d.open);
      const bounds = meshes.map(m => m.boundingSphere.clone());
      for (const open of [0, 1]) {
        for (const d of list) { d.open = open; pose(d); }
        for (let j = 0; j < meshes.length; j++) {
          meshes[j].computeBoundingSphere();
          bounds[j].union(meshes[j].boundingSphere);
        }
      }
      for (let j = 0; j < list.length; j++) { list[j].open = states[j]; pose(list[j]); }
      for (let j = 0; j < meshes.length; j++) meshes[j].boundingSphere.copy(bounds[j]);
    }
  }

} else {
  const by = new Map(), tracks = new THREE.Group();
  for (const d of I.doors) {
    // 高画質の設楽原は窓の障子・入口の板戸・座敷の襖も実寸で組む。
    // 同じ寸法は原形と描画の束を共有し、窓だけ框が細くなる拡大縮小を避ける。
    const key = d.villageTrack ? `${d.kind}:${d.pw + (d.window ? .015 : .03)}:${d.h}` : d.kind;
    if (!by.has(key)) by.set(key, []); by.get(key).push(d);
    if (d.villageTrack) {
      // 民家と小堂で違う入口の引き込み寸法を、そのまま鴨居の受け材にも使う。
      // 表・裏どちらの入口でも壁まで届かせ、溝の上の受けを宙に残さない。
      const wallOffset = d.exterior ? d.wallOffset : I.door.side * .20;
      const track = slidingDoorTrack(d.W, d.h, d.window, wallOffset, d.exterior && !d.window);
      track.position.set(d.x, d.y, d.z); track.rotation.y = I.rot; tracks.add(track);
    }
  }
  // 動かない木枠は建物ごとに一度まとめ、戸だけを既存の仕組みで滑らせる。
  if (tracks.children.length) grp.add(batchInterior(tracks));
  for (const list of by.values()) {
    const kind = list[0].kind, fitted = list[0].villageTrack;
    const width = fitted ? list[0].pw + (list[0].window ? .015 : .03) : .9;
    const height = fitted ? list[0].h : 1.8;
    const count = list.reduce((s, d) => s + d.n, 0);
    // 障子の紙と板戸・格子戸の裏桟は左右で表裏を揃える。原形を共有し、戸の総数は増やさない。
    const handed = kind === 'shojiKumiko' || kind === 'shojiKoshi' || kind === 'itadoVillage' || kind === 'koshiHikite';
    const leftMeshes = panelInstances(fitted && kind === 'fusumaPlain' ? 'fusumaVillage' : kind, handed ? count / 2 : count, width, height);
    const rightMeshes = handed ? panelInstances(kind + 'Right', count / 2, width, height) : null;
    const meshes = rightMeshes ? leftMeshes.concat(rightMeshes) : leftMeshes;
    let i = 0;
    for (const d of list) {
      d.meshes = leftMeshes; d.rightMeshes = rightMeshes;
      d.base = handed ? i / 2 : i; i += d.n;
    }
    for (const m of meshes) { m.count = handed ? count / 2 : count; grp.add(m); }
    for (const d of list) pose(d);
    if (list.some(d => d.villageTrack)) {
      // 設楽原の戸は開くと枠の外まで滑る。閉じた位置だけで描画範囲を決めると、
      // 戸口や内陣を斜めから見る時に、壁の前へ引いた戸が消えてしまう。
      // 全閉・全開の両端を一度だけ含め、開閉中は同じ範囲を使う。
      const opened = list.map(d => d.open);
      const windowLeaves = list.map(d => d.windowLeaf);
      for (const d of list) if (d.villageTrack) { d.open = 0; pose(d); }
      const bounds = meshes.map(m => { m.computeBoundingBox(); return m.boundingBox.clone(); });
      for (const d of list) if (d.villageTrack) { d.open = 1; pose(d); }
      for (let j = 0; j < meshes.length; j++) {
        const m = meshes[j];
        m.computeBoundingBox(); bounds[j].union(m.boundingBox);
      }
      // 右戸を左へ重ねる場合も含める。左右の原形は別の描画の束なので、
      // 左戸だけを動かした範囲では、反対へ引いた右戸が画面端で消える。
      for (const d of list) if (d.villageTrack && d.window) {
        d.windowLeaf = d.windowLeaf === 1 ? 0 : 1; pose(d);
      }
      for (let j = 0; j < meshes.length; j++) {
        const m = meshes[j];
        m.computeBoundingBox(); bounds[j].union(m.boundingBox);
        m.boundingBox.copy(bounds[j]);
        m.boundingSphere = bounds[j].getBoundingSphere(new THREE.Sphere());
      }
      for (let j = 0; j < list.length; j++) {
        list[j].open = opened[j]; list[j].windowLeaf = windowLeaves[j]; pose(list[j]);
      }
    } else for (const m of meshes) m.computeBoundingSphere();
  }

}
}

function pose(d, open = d.open) {
  if (d.I.profile === 'iga') return igaPose(d);
  if (d.joinery || d.tracked || d.I.profile === 'shitaragahara') return poseHiei(d, open);
  const I = d.I, k = open, e = k * k * (3 - 2 * k);
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
  if (d.joinery || d.tracked) {
  const reverseWindow = false;

  if (!d.meshes && !d.leaves) return;
  const I = d.frame || d.I, k = open, e = k * k * (3 - 2 * k);
  // 敷居の上面から鴨居の下面までを建具の高さにする。
  // 戸口の当たりと操作の基準は床面のまま保つ。
  const sill = d.joinery ? d.sill : sillHeight(d);
  if (d.joinery) {
    Q.setFromAxisAngle(Y, I.rot - (d.axisX ? Math.PI / 2 : 0));
    S.set(d.pw / .9, (d.h + d.headLap - d.sill) / 1.8, 1);
  } else if (d.tracked) S.set(1, 1, 1);
  else S.set(d.pw / .9, panelHeight(d) / 1.8, 1);
  // 内障子の紙越しに直射の筋を通さず、開いた中央の幅だけ光を入れる。
  // 戸が動く時だけ既存の形を伸縮し、共有材質や形は作り直さない。
  if (d.lightShaft) {
    // 召合せが離れるまでは直射を通さず、重なりを除いた開口幅へ合わせる。
    const clear = Math.max(0, Math.min(1,
      (2 * e * d.travel[d.n / 2] - (d.pw - d.pitch)) / d.W));
    d.lightShaft.visible = clear > .001;
    d.lightShaft.scale.x = clear;
  }
  for (let j = 0; j < d.n; j++) {
    // 障子と板戸は右用の部品で引手を向かい合わせ、表裏は二枚ともそろえる。
    const right = j >= d.n / 2;
    const meshes = d.rightMeshes && (reverseWindow ? !right : right) ? d.rightMeshes : d.meshes;
    const index = d.base + (d.rightMeshes && right ? j - d.n / 2 : j);
    const turn = I.profile === 'moribe' && right && !d.rightMeshes ? Math.PI : 0;
    if (d.meshes) Q.setFromAxisAngle(Y, I.rot + (d.axisX ? -Math.PI / 2 : 0)
      + (reverseWindow ? Math.PI : 0) + turn);
    if (d.window && d.I.profile === 'moribe') {
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
    // 正面の板戸も裏桟を室内へ向ける。座敷境は従来の向きとする。
    // 溝・戸の行程・当たりは同じ寸法を使う。
    // 正の縮尺と回転を使い、共通の形・材質をそのまま使い回す。
    const reverse = d.tracked && (d.kind === 'shoji'
      ? (d.window ? d.window.s > 0 : d.entry && d.I.door.side > 0)
      : d.kind === 'itado' ? d.entry && d.I.door.side > 0
      : !left && (d.kind === 'fusuma' || d.kind === 'fusumaPlain' || d.kind === 'fusumaE' || d.kind === 'koshi'));
    Q.setFromAxisAngle(Y, I.rot + (reverse ? Math.PI : 0));
    // 閉めた時は二本の溝（前後に少しずらす）。開けると左右の壁の前へ引き込む
if (d.joinery) {
    const travel = -d.W / 2 + d.pw / 2 + j * d.pitch
      + e * (d.joinery ? d.travel[j] : (left ? -1 : 1) * d.W / 2);
    const offset = (j % 2 ? 1 : -1) * (d.joinery ? .14 : .02 + .045 * e);
    const lx = d.lx + (d.axisX ? -offset : travel);
    // 玄関は外壁の厚みも避け、二枚とも壁の室内側の溝へ収める。
    // 柱の室内端（外壁から約二十三センチ）より、戸の框ごと内側へ離す。
    const lz = d.entry ? d.lz - I.door.side * (.32 + (j % 2) * .1)
      : d.lz + (d.axisX ? travel : offset);
    const x = I.x + lx * I.c + lz * I.s, z = I.z - lx * I.s + lz * I.c;
    if (d.joinery) {
      // 座標の入れ物は設営時のものを使う。戸が閉まり始めてもすり抜けず、
      // 開いた中央には見えない一枚壁を残さない。障子の高さも腰窓に合わせる。
      const leaf = d.leaves[j], half = d.pw / 2;
      const dx = (d.axisX ? I.s : I.c) * half, dz = (d.axisX ? I.c : -I.s) * half;
      leaf.ax = x - dx; leaf.az = z - dz; leaf.bx = x + dx; leaf.bz = z + dz;
      leaf.x0 = Math.min(leaf.ax, leaf.bx) - leaf.r; leaf.x1 = Math.max(leaf.ax, leaf.bx) + leaf.r;
      leaf.z0 = Math.min(leaf.az, leaf.bz) - leaf.r; leaf.z1 = Math.max(leaf.az, leaf.bz) + leaf.r;
      leaf.yBot = d.y + sill; leaf.yTop = d.y + d.h + d.headLap;
    }
    if (d.meshes) {
      // 襖の引手は閉めた中央へ向ける。板戸は両端の引手を使い、
      // 右の戸も表裏を保つ。裏桟が左右で反対側へ出るのを防ぐ。
      // 裏向きの玄関・左右の雨戸も、二枚とも裏桟を室内側へ向ける。
      const boardReverse = d.joinery && d.kind === 'itado' && (d.entry ? I.door.side < 0
        : d.window ? (d.axisX ? d.sourceWindow.s > 0 : d.sourceWindow.s < 0) : d.roomBoardReverse);
      // 内障子は組子を室内、紙を格子窓側へ向ける推定復元。
      // 同じ向きで四面へ置くと、西面・正面だけ紙の裏を室内へ見せてしまう。
      // 板戸の裏桟とは表裏が逆。窓の面から一度決めた向きで、開閉中も溝を保つ。
      const shojiReverse = d.joinery && d.kind === 'shoji' && d.window
        && (d.axisX ? d.sourceWindow.s < 0 : d.sourceWindow.s > 0);
      const reverse = boardReverse || shojiReverse || d.roomShojiReverse || d.joinery && !left && (d.kind === 'fusuma' || d.kind === 'fusumaE');
      Q.setFromAxisAngle(Y, I.rot - (d.axisX ? Math.PI / 2 : 0) + (reverse ? Math.PI : 0));
      P.set(x, d.y + sill, z); M.compose(P, Q, S);
      for (const m of d.meshes) m.setMatrixAt(d.base + j, M);
    }

} else {
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
  }
  if (d.meshes) for (const m of d.meshes) m.instanceMatrix.needsUpdate = true;
  } else {

  const I = d.I, k = d.open, e = k * k * (3 - 2 * k);
  if (d.otherSolid) {
    // 二本の溝と左右の戸幅を、見た目と同じ位置へ動かす。全開でも引き込んだ戸は残る。
    for (let j = 0; j < 2; j++) {
      const s = j ? d.otherSolid : d.solid, side = j ? 1 : -1;
      // 明かり障子は触れた戸を動かし、相方は元の溝へ残す。
      // 二枚を中央の一面で代用せず、召し合わせの重なりも見た目と揃える。
      const inset = d.window ? .0075 : .015;
      const center = d.window
        ? d.lx + side * (d.W / 4 - inset) + windowShift(d, j) * e * d.travel
        : d.lx + side * d.W * (.25 + e / 2);
      const a = center - d.W / 4 - inset, b = center + d.W / 4 + inset;
      const lz = d.lz + side * .04;
      // 線分の両端にも半径が付く。戸の木口から半径分だけ内へ収め、
      // 開いた板戸・襖・格子戸の脇を、見えない六センチの出っ張りで狭めない。
      const solidA = a + s.r, solidB = b - s.r;
      s.ax = I.x + solidA * I.c + lz * I.s; s.az = I.z - solidA * I.s + lz * I.c;
      s.bx = I.x + solidB * I.c + lz * I.s; s.bz = I.z - solidB * I.s + lz * I.c;
      s.x0 = Math.min(s.ax, s.bx) - s.r; s.x1 = Math.max(s.ax, s.bx) + s.r;
      s.z0 = Math.min(s.az, s.bz) - s.r; s.z1 = Math.max(s.az, s.bz) + s.r;
      if (d.woodSolids) for (const wood of d.woodSolids[j]) {
        if (wood.kumiko) {
          const v = wood.kumiko, x = (a + b) / 2;
          // 横組子の木口と、縦組子の見込みから線分の丸みを差し引く。
          const dx = v.halfDepth ? 0 : wood.r;
          const dz = v.halfDepth ? v.halfDepth - wood.r : 0;
          wood.ax = I.x + (x + v.a + dx) * I.c + (lz - dz) * I.s;
          wood.az = I.z - (x + v.a + dx) * I.s + (lz - dz) * I.c;
          wood.bx = I.x + (x + v.b - dx) * I.c + (lz + dz) * I.s;
          wood.bz = I.z - (x + v.b - dx) * I.s + (lz + dz) * I.c;
        } else if (wood.edge) {
          // 竪框は幅四センチ・見込み六センチ。二本の溝を戸と一緒に滑る。
          const x = wood.edge < 0 ? a + .02 : b - .02;
          wood.ax = I.x + x * I.c + (lz - .01) * I.s;
          wood.az = I.z - x * I.s + (lz - .01) * I.c;
          wood.bx = I.x + x * I.c + (lz + .01) * I.s;
          wood.bz = I.z - x * I.s + (lz + .01) * I.c;
        } else {
          // 横框の厚みは六センチ。端の丸みも外寸の内側へ収める。
          wood.ax = I.x + (a + wood.r) * I.c + lz * I.s;
          wood.az = I.z - (a + wood.r) * I.s + lz * I.c;
          wood.bx = I.x + (b - wood.r) * I.c + lz * I.s;
          wood.bz = I.z - (b - wood.r) * I.s + lz * I.c;
        }
        wood.x0 = Math.min(wood.ax, wood.bx) - wood.r; wood.x1 = Math.max(wood.ax, wood.bx) + wood.r;
        wood.z0 = Math.min(wood.az, wood.bz) - wood.r; wood.z1 = Math.max(wood.az, wood.bz) + wood.r;
      }
    }
  }
  if (d.window && !d.otherSolid) {
    // 開いた半分だけ当たりも抜く。重なった二枚と腰壁は当たりを残す。
    const a = d.lx - d.W / 2 + e * d.travel, b = d.lx + d.W / 2, s = d.solid;
    s.ax = I.x + a * I.c + d.lz * I.s; s.az = I.z - a * I.s + d.lz * I.c;
    s.bx = I.x + b * I.c + d.lz * I.s; s.bz = I.z - b * I.s + d.lz * I.c;
    s.x0 = Math.min(s.ax, s.bx) - s.r; s.x1 = Math.max(s.ax, s.bx) + s.r;
    s.z0 = Math.min(s.az, s.bz) - s.r; s.z1 = Math.max(s.az, s.bz) + s.r;
  }
  if (!d.meshes) return;
  // 二本の溝を通る戸は召し合わせで三センチ重ねる。
  // 端を突き合わせるだけでは、斜めから紙戸の向こうへ光が抜ける。
  const overlap = d.villageTrack ? (d.window ? .015 : .03) : 0;
  Q.setFromAxisAngle(Y, I.rot);
  // 実寸の建具は固定建具と同じ框幅・引手の寸法を保ったまま滑らせる。
  if (d.villageTrack) S.set(1, 1, 1);
  else S.set((d.pw + overlap) / .9, d.h / 1.8, 1);
  // 裏窓は紙を室内側、組子を外側へ向ける。正面と同じ向きでは紙が雨側へ出る。
  // 半回転と左右の原形の交換を組み合わせ、召し合わせの指掛けは中央へ残す。
  // 負の拡大率は使わず、既存の二種類の原形と行列だけで納める。
  const rearWindow = d.villageTrack && d.window && d.lz < 0 && !!d.rightMeshes;
  if (rearWindow) Q.setFromAxisAngle(Y, I.rot + Math.PI);
  for (let j = 0; j < d.n; j++) {
    const left = j < d.n / 2;
    // 左右の戸は引手を召し合わせへ向ける。障子・板戸・格子戸は専用の右戸で表裏を保つ。
    // 形と材質は共有し、明かり障子を片側へ重ねる時も同じ向きを保つ。
    if (d.villageTrack && (d.kind === 'fusumaPlain' || d.kind === 'itado'))
      Q.setFromAxisAngle(Y, I.rot + (left ? 0 : Math.PI));
    // 閉めた時は二本の溝（前後に少しずらす）。開けると左右の壁の前へ引き込む
    const inset = d.window && d.villageTrack ? (left ? 1 : -1) * .0075 : 0;
    const lx = d.lx - d.W / 2 + (j + .5) * d.pw + inset
      + (d.window ? windowShift(d, j) : (left ? -1 : 1)) * e * d.travel;
    const lz = d.lz + (j % 2 ? 1 : -1) * (d.villageTrack ? .04 : .02 + .045 * e);
    P.set(I.x + lx * I.c + lz * I.s, d.y, I.z - lx * I.s + lz * I.c); M.compose(P, Q, S);
    const meshes = d.rightMeshes && (rearWindow ? left : !left) ? d.rightMeshes : d.meshes;
    const index = d.base + (d.rightMeshes && !left ? j - d.n / 2 : j);
    for (const m of meshes) m.setMatrixAt(index, M);
  }
  for (const m of d.meshes) m.instanceMatrix.needsUpdate = true;
  if (d.rightMeshes) for (const m of d.rightMeshes) m.instanceMatrix.needsUpdate = true;
  }
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
  if (want && !d.joinery && !d.window && !d.villageTrack && !d.tracked && !d.slidingSolids && !d.leaves) solidOff(d);
  moving.add(d);
  if (rt.army && rt.army.play) rt.army.play('wood', { x: d.x, z: d.z }, .3);
}
// 戸口の帯に立っているか。稲葉山の玄関は柱の裏の溝まで含める。
function genericInDoorway(d, o) {
  if (d.I.profile === 'iga') return igaInDoorway(d, o);
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

let pickT = -1, pick = null, pickLeaf = 0;
const pickPoint = { x: 0, z: 0 };
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

function genericNearest(rt) {
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
  if (rt.def.key === 'shitaragahara') return villageNakaDoorTick(rt, dt, flagged);
  if (rt.def.key === 'iga' || rt.def.battleKey === 'iga') return igaNakaDoorTick(rt, dt, flagged);
  if (rt.def.key === 'moribe') return moribeNakaDoorTick(rt, dt, flagged);
  if (DOORS[0]?.joinery) return nodaNakaDoorTick(rt, dt, flagged);
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

function inDoorway(d, o) {
  if (!d.joinery) return genericInDoorway(d, o);
  if (d.joinery) {
  if (d.window) return false; // 腰窓の下に立つ兵を、通り抜ける戸口の兵として扱わない。
  const dx = o.pos.x - d.I.x, dz = o.pos.z - d.I.z;
  const lx = dx * d.I.c - dz * d.I.s, lz = dx * d.I.s + dz * d.I.c;
  if (d.joinery) {
    // 玄関の板戸は壁より室内側の溝にある。壁の線だけで調べると、
    // 内側の戸の前に立つ人を見落として閉じてしまう。
    const a = d.entry ? d.lz - d.I.door.side * .42 : d.lz - .14;
    const b = d.entry ? d.lz - d.I.door.side * .32 : d.lz + .14;
    return lz > Math.min(a, b) - .35 && lz < Math.max(a, b) + .35
      && Math.abs(lx - d.lx) < d.W / 2 + .35 && Math.abs(o.pos.y - d.y) < 1.2;
  }
  return Math.abs(lz - d.lz) < .35 && Math.abs(lx - d.lx) < d.W / 2 + .1 && Math.abs(o.pos.y - d.y) < 1.2;
  }
  const I = d.frame || d.I, dx = o.pos.x - I.x, dz = o.pos.z - I.z;
  const lx = dx * I.c - dz * I.s, lz = dx * I.s + dz * I.c;
  return Math.abs(lz - d.lz) < .35 && Math.abs(lx - d.lx) < d.W / 2 + .1 && atDoorHeight(d, o);
}

// 正面戸の外から来る兵も含めて調べる。兵の配列をそのまま使い、毎コマ入れ物を作らない。
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
  if (d.joinery && !d.window && !touch) {
    // 野田福島の広い戸口は中心点でなく開口の幅で測る。
    // 端へ寄った兵も通れ、袖壁の前にいる者には反応しない。
    // 玄関は外壁から内側へ寄せた、実際に板戸が滑る溝までを測る。
    const I = d.I, dx = p.x - I.x, dz = p.z - I.z;
    const x = dx * I.c - dz * I.s, z = dx * I.s + dz * I.c;
    const along = x - d.lx;
    if (Math.abs(along) > d.W / 2 + .1) return Infinity;
    const across = z - d.lz + (d.entry ? I.door.side * .37 : 0);
    return Math.hypot(Math.max(0, Math.abs(along) - d.W / 2), across);
  }
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
  // 板戸も左右の手掛けへ合わせ、板の中央や手掛けのない高さに札を出さない。
  // 候補の配列や座標の入れ物は毎コマ作らない。
  const shoji = d.kind === 'shoji';
  const itado = d.kind === 'itado';
  const fusuma = d.kind === 'fusuma' || d.kind === 'fusumaPlain' || d.kind === 'fusumaE';
  const fittedGrip = shoji || itado || fusuma || d.kind === 'koshi';
  // 窓障子の手掛けも、描いた框の高さへ札を置く。床の高さへ札を落とさない。
  const gripY = d.y + sillHeight(d) + (itado ? Math.min(.95, panelHeight(d) / 2)
    : fittedGrip ? Math.min(.85, panelHeight(d) * .48) : panelHeight(d) / 2);
  const grips = shoji || itado ? 2 : 1;
  for (let candidate = 0; candidate < d.leaves.length * grips; candidate++) {
    const j = Math.floor(candidate / grips), leaf = d.leaves[j];
    const dx = leaf.bx - leaf.ax, dz = leaf.bz - leaf.az;
    const length2 = dx * dx + dz * dz;
    let t;
    if (fittedGrip) {
      const inset = (fusuma ? .13 : itado ? .07 : .035) / (d.pw + HIEI_LEAF_OVERLAP);
      t = shoji || itado ? (candidate % grips ? 1 - inset : inset)
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
      if (hieiPartitionBetween(d, p, j)) continue;
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

// 比叡山では、隣室の固定建具や手前の引き戸を越えて引き手へ手を伸ばせない。
// 戸の手前までの線と間仕切りを局所座標で比べる。戸口の空きはそのまま通す。
// 近い戸から届く候補を調べ、毎コマの形・配列・座標の作り直しはしない。
function hieiPartitionBetween(d, p, targetLeaf) {
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
function igaInDoorway(d, o) {
  const [lx, lz] = d.I.L(o.pos.x, o.pos.z);
  // 伊賀は開いた戸にも当たりが残る。戸口の幅だけを調べると、柱の脇の
  // 引きしろにいる人へ戸が重なってから止まる。滑った分まで閉まる前に調べる。
  // 滑らせる時と同じ補間を使い、座標や形を毎コマ作り足さない。
  const slide = d.leaves ? d.open * d.open * (3 - 2 * d.open) : 0;
  if (d.leaves) {
    // 高い明かり障子は足元でなく上体との重なりを見る。閉じた戸の
    // 当たりと同じ体幅・戸厚を使い、引きしろの端でも人へ押し込まない。
    const radius = o.mounted ? .7 : .3, height = o.mounted ? 2.4 : 1.7;
    const margin = radius + d.solid.r;
    return o.pos.y < d.y + d.h - .05 && o.pos.y + height >= d.y
      && Math.abs(lz - d.trackZ) < margin + .0375
      && Math.abs(lx - d.lx) < d.W / 2 + d.overlap / 2 + slide * d.travel + margin;
  }
  const reach = d.W / 2 * (1 + slide) + .1;
  return Math.abs(lz - d.trackZ) < .35 && Math.abs(lx - d.lx) < reach && Math.abs(o.pos.y - d.y) < 1.2;
}

// 伊賀の戸は開く時も壁際へ滑る。引きしろに人がいれば、その体の手前で止める。
// 今より体へ近づく戸だけを止め、戸口で押す人から離れる動きは妨げない。
function openingBlocked(d, o, nextOpen) {
  if (!o.alive) return false;
  const height = o.mounted ? 2.4 : 1.7;
  if (o.pos.y >= d.y + d.h - .05 || o.pos.y + height < d.y) return false;
  const I = d.I, dx = o.pos.x - I.x, dz = o.pos.z - I.z;
  const lx = dx * I.c - dz * I.s, lz = dx * I.s + dz * I.c;
  const margin = (o.mounted ? .7 : .3) + d.solid.r;
  const now = d.open * d.open * (3 - 2 * d.open);
  const next = nextOpen * nextOpen * (3 - 2 * nextOpen);
  for (let j = 0; j < d.n; j++) {
    const track = d.trackZ + d.trackSide * ((j % 2) - .5) * .075;
    if (Math.abs(lz - track) >= margin) continue;
    const center = d.lx - d.W / 2 + (j + .5) * d.pw;
    const shift = (j < d.n / 2 ? -1 : 1) * d.travel;
    const offset = lx - center - now * shift, nextOffset = lx - center - next * shift;
    const gap = Math.abs(offset) - d.panelW / 2;
    // 更新の間が空いても、移動の途中で体を通り抜けないよう軌跡まで調べる。
    const nextGap = (offset * nextOffset <= 0 ? 0 : Math.min(Math.abs(offset), Math.abs(nextOffset))) - d.panelW / 2;
    if (nextGap < margin && nextGap < gap - .000001) return true;
  }
  return false;
}

// 袖の前へ引く時も戻す時も、次の位置までの帯を調べる。
// 戸口の中心から外れた人へ板戸・襖を押し込まない。座標の入れ物は増やさない。
function movingOverlaps(d, o, nextOpen, opening) {
  if (!o.alive) return false;
  // 腰窓の内障子も人の上半身へ押し込まない。窓の下や上の階にいる者は除く。
  // 戸口とは違い、足元からの距離でなく紙戸と体の高さの重なりで調べる。
  if (d.window) {
    if (o.pos.y + 1.6 <= d.y + d.sill || o.pos.y >= d.y + d.h + d.headLap) return false;
  } else if (Math.abs(o.pos.y - d.y) >= 1.2) return false;
  // 妻側の窓では障子が奥行き方向へ滑る。回転した僧坊・長屋も同じ向きで調べる。
  const alongX = d.axisX ? d.I.s : d.I.c, alongZ = d.axisX ? d.I.c : -d.I.s;
  const now = d.open * d.open * (3 - 2 * d.open);
  const next = nextOpen * nextOpen * (3 - 2 * nextOpen);
  for (let j = 0; j < d.leaves.length; j++) {
    const leaf = d.leaves[j], cx = (leaf.ax + leaf.bx) / 2, cz = (leaf.az + leaf.bz) / 2;
    const dx = o.pos.x - cx, dz = o.pos.z - cz;
    const along = dx * alongX + dz * alongZ;
    const across = -dx * alongZ + dz * alongX;
    const shift = (next - now) * d.travel[j];
    // 開ける時は人へ近づく戸だけを止める。戸口の人から離れる戸まで
    // 止めると、閉じた戸の正面に立ったまま開けられなくなる。
    if (opening && shift * along <= 0) continue;
    if (Math.abs(across) < leaf.r + .4
      && along > Math.min(0, shift) - d.pw / 2 - .4
      && along < Math.max(0, shift) + d.pw / 2 + .4) return true;
  }
  return false;
}

function doorMovementOccupied(rt, d, flagged, nextOpen, opening = false) {
  const u = rt.player && rt.player.u;
  if (u && u.alive && ((!opening && inDoorway(d, u)) || movingOverlaps(d, u, nextOpen, opening))) return true;
  const occupants = d.entry ? rt.army?.units || flagged : flagged;
  for (const o of occupants) {
    if (o.alive && (d.entry || o.naka === d.I.id + 1)
      && ((!opening && inDoorway(d, o)) || movingOverlaps(d, o, nextOpen, opening))) return true;
  }
  return false;
}


// 玄関・間仕切り・窓とも、描いた引手の高さまで手を伸ばす。
// 足元から一・一メートルに固定すると、低い板戸や襖の引手を遮る
// 調度・手前の戸の上を通り、逆に引手より高い物で操作を遮ってしまう。
// 板戸と紙戸の共通形の引手位置を、描く時と同じ倍率で戻す。
function doorHandY(d, pos) {
  return d.joinery
    ? d.y + d.sill + (d.h + d.headLap - d.sill) * (d.kind === 'itado' ? .42 : .48)
    : pos.y + 1.1;
}
// 窓の固定枠も見える木の厚みで遮る。回転した堂でも世界座標の箱へ
// 広げず、敷居・鴨居・竪枠の向きへ戻す。既存の材と数値だけを使う。
function windowTimberBetween(d, timber, jamb, pos, targetX, targetZ) {
  const handY = doorHandY(d, pos);
  if (handY < timber.yBot || handY > timber.yTop) return false;
  const alongX = d.axisX ? d.I.s : d.I.c, alongZ = d.axisX ? d.I.c : -d.I.s;
  const dx = pos.x - (timber.ax + timber.bx) / 2;
  const dz = pos.z - (timber.az + timber.bz) / 2;
  const reachX = targetX - pos.x, reachZ = targetZ - pos.z;
  const x = dx * alongX + dz * alongZ, z = -dx * alongZ + dz * alongX;
  const vx = reachX * alongX + reachZ * alongZ;
  const vz = -reachX * alongZ + reachZ * alongX;
  const hw = jamb ? timber.r : d.W, hd = jamb ? .2 : timber.r;
  let lo = .001, hi = .999;
  if (Math.abs(vx) < 1e-8) {
    if (Math.abs(x) > hw) return false;
  } else {
    const a = (-hw - x) / vx, b = (hw - x) / vx;
    lo = Math.max(lo, Math.min(a, b)); hi = Math.min(hi, Math.max(a, b));
  }
  if (Math.abs(vz) < 1e-8) {
    if (Math.abs(z) > hd) return false;
  } else {
    const a = (-hd - z) / vz, b = (hd - z) / vz;
    lo = Math.max(lo, Math.min(a, b)); hi = Math.min(hi, Math.max(a, b));
  }
  return lo <= hi;
}
// 手から引手への線を、厚みのある板の向きへ戻して調べる。
// 板と平行な手の動きや木口の角も拾う。点・配列は作らない。
function doorBoardBetween(x, z, vx, vz, ax, az, bx, bz, radius) {
  const wx = bx - ax, wz = bz - az, length = Math.hypot(wx, wz);
  if (length < 1e-8) return false;
  const ux = wx / length, uz = wz / length;
  const dx = x - (ax + bx) / 2, dz = z - (az + bz) / 2;
  const along = dx * ux + dz * uz, across = -dx * uz + dz * ux;
  const da = vx * ux + vz * uz, dc = -vx * uz + vz * ux;
  let lo = .001, hi = .999;
  if (Math.abs(da) < 1e-8) {
    if (Math.abs(along) > length / 2) return false;
  } else {
    const a = (-length / 2 - along) / da, b = (length / 2 - along) / da;
    lo = Math.max(lo, Math.min(a, b)); hi = Math.min(hi, Math.max(a, b));
  }
  if (Math.abs(dc) < 1e-8) {
    if (Math.abs(across) > radius) return false;
  } else {
    const a = (-radius - across) / dc, b = (radius - across) / dc;
    lo = Math.max(lo, Math.min(a, b)); hi = Math.min(hi, Math.max(a, b));
  }
  return lo <= hi;
}

// 引き戸の引手までの間に間仕切りや別の戸板があれば、向こう側を操作しない。
// 野田福島の襖・障子は、開口から手が届く側でだけ札を出す。
function partitionBetween(d, pos, targetX, targetZ, targetLeaf = null) {
  const I = d.I, dx = pos.x - I.x, dz = pos.z - I.z;
  const x = dx * I.c - dz * I.s, z = dx * I.s + dz * I.c;
  const tx = targetX - I.x, tz = targetZ - I.z;
  const vx = tx * I.c - tz * I.s - x, vz = tx * I.s + tz * I.c - z;
  if (d.entry) {
    // 外壁の裏へ引いた板戸は、壁越しには触れない。
    // 正面だけでなく側壁・背面も調べ、角の外から引き込んだ戸を触らせない。
    // 外壁の当たりと同じ内面を使う。回転した長屋も局所座標で判定し、
    // 窓は腰壁と格子があるため玄関の操作経路として扱わない。
    for (let axis = 0; axis < 2; axis++) {
      const from = axis ? z : x, delta = axis ? vz : vx;
      if (Math.abs(delta) < 1e-8) continue;
      const edge = (axis ? d.lv.d : d.lv.w) / 2 - .08;
      const width = (axis ? d.lv.w : d.lv.d) / 2 - .08;
      for (let side = -1; side <= 1; side += 2) {
        const t = (side * edge - from) / delta;
        if (t <= .001 || t >= .999) continue;
        const along = axis ? x + vx * t : z + vz * t;
        if (Math.abs(along) > width + .06) continue;
        if (axis && side === I.door.side
          && Math.abs(along - I.door.lx) <= I.door.w / 2 - .06) continue;
        return true;
      }
    }
  }
  for (const wall of d.lv.layout.walls) {
    if (wall.guideOnly) continue;
    if (d.joinery) {
      // 歩行用の間仕切りと同じ厚み。紙の袖も手は通さない。
      if (doorBoardBetween(x, z, vx, vz, wall.ax, wall.az, wall.bx, wall.bz, .08)) return true;
      continue;
    }
    const wx = wall.bx - wall.ax, wz = wall.bz - wall.az;
    const cross = vx * wz - vz * wx;
    if (Math.abs(cross) < 1e-8) continue;
    const ax = wall.ax - x, az = wall.az - z;
    const t = (ax * wz - az * wx) / cross, u = (ax * vz - az * vx) / cross;
    if (t > .001 && t < .999 && u >= 0 && u <= 1) return true;
  }
  if (d.joinery) {
    // 柱・槍掛け・須弥壇などの向こう側へ手を通さない。
    // 室内と同じ調度の寸法・高さを使う。低い机や膳の上からは届く。
    // 設営済みの値だけで線と箱を調べ、毎コマ点や配列を作らない。
    const localHandY = doorHandY(d, pos) - d.lv.y;
    // 全開の玄関戸は引き込み先の竪枠へ寄る。戸板だけを調べると、
    // 枠の裏側から木を突き抜けて引手を選べてしまう。
    // 描画・歩行と同じ左右の竪枠を使い、手が届く側へ回った時だけ扱う。
    const frame = d.lv.entryFrame;
    if (frame && localHandY >= frame.sill && localHandY <= frame.postH) {
      for (let side = -1; side <= 1; side += 2) {
        const postX = I.door.lx + side * (frame.span / 2 + .04);
        if (doorBoardBetween(x, z, vx, vz,
          postX, frame.z - .2, postX, frame.z + .2, .04)) return true;
      }
    }
    for (const p of d.lv.layout.props) {
      if (localHandY < (p.y || 0) || localHandY > (p.y || 0) + p.h) continue;
      // 御影堂の柱は柱身と柱頭を分け、見える木のない所で障子の札を隠さない。
      // 当たりと室内の造りに揃え、毎コマの形や入れ物は増やさない。
      const hallPost = d.I.kind === 'hondo' && p.part === 'hallPost';
      const postY = localHandY - (p.y || 0);
      if (hallPost && postY > p.h - .27) continue;
      const postBase = hallPost && postY < p.h - .39;
      const postBlock = hallPost && !postBase && postY < p.h - .33;
      // 柱頭の斗と肘木も室内の絵・当たりと同じ幅にする。
      const halfW = p.w * (postBase ? .75 : postBlock ? .8 : 1) / 2;
      const halfD = p.d * (postBase ? .75 : postBlock ? .8 : hallPost ? .65 : 1) / 2;
      const c = Math.cos(p.rot || 0), s = Math.sin(p.rot || 0);
      const px = (x - p.x) * c - (z - p.z) * s;
      const pz = (x - p.x) * s + (z - p.z) * c;
      const ux = vx * c - vz * s, uz = vx * s + vz * c;
      let lo = .001, hi = .999;
      if (hallPost && postY >= .07 && postY < p.h - .39) {
        // 柱身は四角い箱でなく、絵・歩行の当たりと同じ十二角で調べる。
        // 根巻と柱頭は下の箱のまま。木のない角越しでも引き戸へ手が届く。
        const rx = p.w * .375, rz = p.d * .375;
        for (const n of hallPostNormals) {
          const from = px / rx * n.x + pz / rz * n.z - hallPostApothem;
          const delta = ux / rx * n.x + uz / rz * n.z;
          if (Math.abs(delta) < 1e-8) {
            if (from > 0) { hi = -1; break; }
          } else if (delta > 0) hi = Math.min(hi, -from / delta);
          else lo = Math.max(lo, -from / delta);
          if (lo > hi) break;
        }
        if (lo <= hi) return true;
        continue;
      }
      if (Math.abs(ux) < 1e-8) {
        if (Math.abs(px) > halfW) continue;
      } else {
        const a = (-halfW - px) / ux, b = (halfW - px) / ux;
        lo = Math.max(lo, Math.min(a, b)); hi = Math.min(hi, Math.max(a, b));
      }
      if (Math.abs(uz) < 1e-8) {
        if (Math.abs(pz) > halfD) continue;
      } else {
        const a = (-halfD - pz) / uz, b = (halfD - pz) / uz;
        lo = Math.max(lo, Math.min(a, b)); hi = Math.min(hi, Math.max(a, b));
      }
      if (lo <= hi) return true;
    }
    // 狭い入口では隣の戸にも手が届く。閉じた板戸・襖越しには札を出さず、
    // 開いた後は実際に横へ滑った戸板だけで調べる。既存の当たりを使い回す。
    const reachX = targetX - pos.x, reachZ = targetZ - pos.z, handY = doorHandY(d, pos);
    for (const other of I.doors) {
      if (other.lv !== d.lv || !other.joinery) continue;
      // 開いた内障子の引手へ、竪枠や横木を突き抜けて手を伸ばさない。
      // 自分の戸の枠も調べ、木の手前へ回れば同じ「閉める」の札が出る。
      if (other.window) {
        for (const timber of other.windowJambs) if (windowTimberBetween(other, timber, true, pos, targetX, targetZ)) return true;
        for (const timber of other.windowRails) if (windowTimberBetween(other, timber, false, pos, targetX, targetZ)) return true;
      }
      if (other === d && !targetLeaf) continue;
      for (const leaf of other.leaves) {
        // 四枚戸を重ねた時も、手前の戸板越しに奥の引手を選ばない。
        // 触れる一枚だけを除き、同じ組の残りも実際の溝の位置で調べる。
        if (leaf === targetLeaf) continue;
        if (handY < leaf.yBot || handY > leaf.yTop) continue;
        if (doorBoardBetween(pos.x, pos.z, reachX, reachZ,
          leaf.ax, leaf.az, leaf.bx, leaf.bz, leaf.r)) return true;
      }
    }
  }
  return false;
}
// 兵の自動開閉も、札と同じく壁越しには行わない。
// 玄関は外壁より内側に板戸があるため、その溝までの通り道を調べる。
// 野田福島の高だけに使い、設営済みの座標で判定する。
function canReachDoor(d, pos) {
  if (!d.joinery) return true;
  const inset = d.entry ? -d.I.door.side * .37 : 0;
  return !partitionBetween(d, pos, d.x + inset * d.I.s, d.z + inset * d.I.c);
}
function nearest(rt) {
  if (!DOORS.some(d => d.joinery)) return genericNearest(rt);
  if (pickT === rt.t) return pick?.I.disabled ? null : pick;
  pickT = rt.t; pick = null;
  const u = rt.player && rt.player.u;
  if (!u || !u.alive || rt.player.mounted) return null;
  // 森部は戸口の出入りと同じ条件で手を使う。倒れている間や登っている間、
  // 選択中・終戦後には、窓や内陣の格子戸を遠隔で動かさない。
  const handsBusy = u.downed || u.climb || rt.over || rt.choice;

  let bd = 1.5;
  for (const d of DOORS) {
    let dist;
if (d.joinery) {
    // 高い格子窓の板戸も同じ床から扱う。窓下端と足元を比べて札を消さない。
    const floorY = d.joinery && d.window ? d.lv.y : d.y;
    if (d.I.disabled || (d.I.id + 1 !== u.naka && !(d.entry && !u.naka)) || Math.abs(u.pos.y - floorY) > 1.2) continue;
    // 開いた戸は壁の前まで引かれている。戸口の中心ではなく、
    // 絵と当たりが使う各戸の位置から操作札を選ぶ。窓の内障子も同じ扱い。
    // 座標は設営時の入れ物を使い、毎コマ新しい点や配列を作らない。
    const at = d.interactPos;
    if (d.joinery) {
      const alongX = d.axisX ? d.I.s : d.I.c, alongZ = d.axisX ? d.I.c : -d.I.s;
      let closest = Infinity;
      for (let j = 0; j < d.leaves.length; j++) {
        const leaf = d.leaves[j];
        const cx = (leaf.ax + leaf.bx) / 2, cz = (leaf.az + leaf.bz) / 2;
        // 紙面や鏡板の中央でなく、実際に彫った引手・指掛けから操作する。
        // 共通形は幅九十センチから伸縮するため、引手の位置も同じ比率で移す。
        // 襖は右の引手一つ、板戸と障子・格子戸は左右の指掛けを使う。
        const fusuma = d.kind === 'fusuma' || d.kind === 'fusumaE';
        const inset = fusuma ? .13 : d.kind === 'itado' ? .12 : .02;
        const half = (.45 - inset) * d.pw / .9;
        for (let edge = 0; edge < (fusuma ? 1 : 2); edge++) {
          // 右の襖は描く時に半回転させ、引手を召合せへ向けている。
          // 操作する点も同じ向きへ返し、開けた右戸を実際の引手から閉められるようにする。
          const reach = fusuma ? (j < d.n / 2 ? half : -half) : edge === 0 ? half : -half;
          const x = cx + reach * alongX, z = cz + reach * alongZ;
          const distance = (x - u.pos.x) ** 2 + (z - u.pos.z) ** 2;
          if (distance >= closest || distance >= bd * bd) continue;
          if (partitionBetween(d, u.pos, x, z, leaf)) continue;
          closest = distance; at.x = x; at.z = z;
        }
      }
      if (!isFinite(closest)) continue;
    }
    dist = Math.hypot(at.x - u.pos.x, at.z - u.pos.z);

} else {
    if (d.I.disabled) continue;
    if (d.I.id + 1 !== u.naka && !((d.entry || d.window) && !u.naka)) continue;
    // 明かり障子の基準は腰壁の上。僧坊の床高も加わるので、外の地面からは
    // 足元との差が一・二メートルを超えていた。窓は下の三次元の手掛け距離で
    // 判定し、腰壁・窓枠越しの遮りも従来どおり調べる。通常の戸は階を区別する。
    if (!d.window && Math.abs(u.pos.y - d.y) > 1.2) continue;
    dist = doorDistance(d, u.pos, true);

}
    if (dist < bd) { bd = dist; pick = d; }
  }
  return pick;
}

function nodaNakaDoorTick(rt, dt, flagged) {
  if (!DOORS.length) return;
  if (rt.addInteract && !rt._nakaDoors) {
    rt._nakaDoors = true;
    rt.addInteract('naka_to', () => { const d = nearest(rt); return d && !(d.want && rt.def.doorCloseOK?.(rt) === false) ? (d.joinery ? d.interactPos : d.touch) : null; }, '開ける', () => {
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
      const d = nearest(rt);
if (d?.joinery) {
      if (d && !d.window && !d.want && doorDistance(d, u.pos) < 1.1 && canReachDoor(d, u.pos)) setWant(rt, d, 1);

} else {
      if (d && !d.window && !d.want && doorDistance(d, u.pos) < 1.1) setWant(rt, d, 1);

}
    }
    for (const o of flagged) {
      if (o.isPlayer || !o.alive || !o.naka) continue;
      const I = DOORS.find((d) => d.I.id + 1 === o.naka)?.I;
      if (!I || !I.doors || I.disabled) continue;
      for (const d of I.doors) if (!d.window && !d.want && doorDistance(d, o.pos) < 1.2 && Math.abs(o.pos.y - d.y) < 1.2 && canReachDoor(d, o.pos)) setWant(rt, d, 1);
    }
    // 外から入る兵も玄関で止めない。五分の一秒ごとに既存の兵だけを調べる。
    for (const d of DOORS) {
      if (!d.entry || d.want || d.I.disabled) continue;
      for (const o of rt.army?.units || []) {
        if (o.isPlayer || !o.alive || o.isStruct || o.farSim || o.mounted) continue;
        if (Math.abs(o.pos.y - d.y) < 1.2 && doorDistance(d, o.pos) < 1.2
          && canReachDoor(d, o.pos)) {
          setWant(rt, d, 1); break;
        }
      }
    }
  }
  for (const d of moving) {
    // 焼失した建物は共通の片付け済み。閉まりかけの戸の当たりを戻さない。
    if (d.I.disabled) { moving.delete(d); continue; }
    // 閉め始めに空いていても、滑る途中で人が入ったら開き直す。
    // 閉め切った後の判定では戸が体を横切るため、形と当たりを動かす前に止める。
    if (d.tracked && !d.want && doorwayOccupied(rt, d)) { setWant(rt, d, 1); continue; }
    // 野田福島の戸は、人のいる戸口へ閉じ込まない。閉め切る直前だけでなく
    // 動き始めから調べ、通っている間は開き直す。既存の兵と座標を使う。
    if (d.joinery && !d.want && doorMovementOccupied(rt, d, flagged, Math.max(0, d.open - dt * 2.6))) setWant(rt, d, 1);
    const nextOpen = Math.max(0, Math.min(1, d.open + (d.want ? 1 : -1) * dt * 2.6));
    // 開いた戸を引き込む袖の前にも人が立てる。重なる手前で待ち、
    // 人が離れたら同じ札の操作のまま再開する。窓の内障子も同じ扱い。
    if (d.joinery && d.want && doorMovementOccupied(rt, d, flagged, nextOpen, true)) continue;
    if (d.tracked && leafSweepOccupied(rt, d, nextOpen)) continue;
    d.open = nextOpen;
    pose(d);
    if (d.open !== d.want) continue;
    if (d.want && d.tracked) nodaSolidOff(d);
    if (!d.want) {
      // 閉め切った時に戸口に人が立っていれば、開けたままにして待つ
      const u = rt.player && rt.player.u;
      const occupants = d.entry ? rt.army?.units || flagged : flagged;
      if ((u && inDoorway(d, u)) || occupants.some((o) => o.alive && (d.entry || o.naka === d.I.id + 1) && inDoorway(d, o))) { d.open = .02; continue; }
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

function nodaBuildNakaDoorMeshes(I, grp) {
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
    for (const d of list) nodaPose(d);
    for (const m of allMeshes) {
      m.computeBoundingSphere();
      // 閉じた時の範囲だけで判定すると、左右へ引いた戸が画面の端で消える。
      // 森部は開閉の両端を含む範囲を一度だけ確保し、動く間の再計算を省く。
      if (I.profile === 'moribe') m.boundingSphere.radius += Math.max(...list.map(d => d.W / 2)) + .1;
    }
  }
}

function nodaSolidOff(d) {
  const s = d.solid;
  if (!d.saved) d.saved = { ax: s.ax, az: s.az, bx: s.bx, bz: s.bz, x0: s.x0, x1: s.x1, z0: s.z0, z1: s.z1 };
  s.ax = s.az = s.bx = s.bz = s.x0 = s.x1 = s.z0 = s.z1 = 1e9;
}

function nodaPose(d) {
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
      if (meshes) for (const m of meshes) m.setMatrixAt(index, M);
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
  // 中の兵は戸口へ来たら自分で開ける。設楽原の遊び手は引手の札で横へ引く。
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
      // 設楽原は直前の掃引判定で、動く戸の範囲だけを確かめ済み。
      // 窓全体でも止めると、動かない右戸の前にいるだけで左の障子を閉め切れない。
      // 開度だけを戻して見た目・当たりと食い違わせず、二本の溝の位置を保つ。
      const u = rt.player && rt.player.u;
      if (moribe ? moribeDoorwayOccupied(rt, d, flagged, 0)
        : (u && moribeInDoorway(d, u)) || flagged.some((o) => o.alive && o.naka === d.I.id + 1 && moribeInDoorway(d, o))) { d.open = .02; continue; }
      if (d.saved) Object.assign(d.solid, d.saved);
    }
    moving.delete(d);
  }
}



function windowShift(d, j) {
  return d.villageTrack && d.windowLeaf === 1 ? (j ? -1 : 0) : (j ? 0 : 1);
}

function villageInDoorway(d, o) {
  if (d.tracked) return villageHieiInDoorway(d, o);
  if (d.villageTrack && d.window && (o.pos.y + 1.65 <= d.y || o.pos.y >= d.y + d.h)) return false;
  const dx = o.pos.x - d.I.x, dz = o.pos.z - d.I.z;
  const lx = dx * d.I.c - dz * d.I.s, lz = dx * d.I.s + dz * d.I.c;
  return Math.abs(lz - d.lz) < .35 && Math.abs(lx - d.lx) < d.W / 2 + .1 && Math.abs(o.pos.y - d.lv.y) < 1.2;
}

// 設楽原の板戸・襖・格子戸・明かり障子は、引き込み先の人も挟まない。
// 二枚の戸が次の位置まで掃く範囲を調べる。座標や当たりは毎コマ作り直さない。
function sweptDoorway(d, o, next) {
  if (!o.alive) return false;
  // 兵ごとの背丈と肩幅を使う。固定の体格では、大柄な兵の頭や肩へ戸が入り、
  // 小柄な兵からは離れていても止まってしまう。設楽原以外の開閉は従来どおり。
  const bodyHeight = d.villageTrack ? (o.bodyHeight ?? 1.65) : 1.65;
  const bodyRadius = d.villageTrack ? (o.bodyRadius ?? .3) : .3;
  const trackReach = d.villageTrack ? bodyRadius + (d.kind === 'koshiHikite' ? .035 : .03) : .35;
  // 設楽原の低い土間・戸前の段・跳躍中も、床からの距離でなく戸と体の重なりで受ける。
  // 足が床から一・二メートル離れただけで、まだ触れている戸を動かさない。
  if (d.villageTrack) {
    if (o.pos.y + bodyHeight <= d.y || o.pos.y >= d.y + d.h) return false;
  } else if (Math.abs(o.pos.y - d.lv.y) >= 1.2) return false;
  const dx = o.pos.x - d.I.x, dz = o.pos.z - d.I.z;
  const lx = dx * d.I.c - dz * d.I.s, lz = dx * d.I.s + dz * d.I.c;
  const from = d.open * d.open * (3 - 2 * d.open), to = next * next * (3 - 2 * next);
  if (d.window) {
    // 明かり障子は選ばれた一枚の行程だけ調べる。相方の溝へ反応させず、
    // 左右どちらを引く時も、腰壁の上から身を寄せた人を挟まない。
    const j = d.villageTrack ? d.windowLeaf : 0, side = j ? 1 : -1;
    if (o.pos.y + bodyHeight <= d.y || o.pos.y >= d.y + d.h || Math.abs(lz - (d.lz + side * .04)) >= trackReach) return false;
    const inset = d.villageTrack ? .0075 : 0;
    const a = d.lx + side * (d.W / 4 - inset) + windowShift(d, j) * from * d.travel;
    const b = d.lx + side * (d.W / 4 - inset) + windowShift(d, j) * to * d.travel;
    if ((b - a) * (lx - a) <= 0) return false;
    const reach = d.villageTrack ? bodyRadius : .315;
    return lx > Math.min(a, b) - d.W / 4 - inset - reach && lx < Math.max(a, b) + d.W / 4 + inset + reach;
  }
  for (let j = 0; j < 2; j++) {
    const side = j ? 1 : -1;
    if (Math.abs(lz - (d.lz + side * .04)) >= trackReach) continue;
    const a = d.lx + side * d.W * (.25 + from / 2);
    const b = d.lx + side * d.W * (.25 + to / 2);
    // 戸から離れる向きなら動かす。閉じた戸へ近づいて開ける操作を妨げない。
    if ((b - a) * (lx - a) <= 0) continue;
    const reach = d.villageTrack ? bodyRadius + .015 : .315;
    if (lx > Math.min(a, b) - d.W / 4 - reach && lx < Math.max(a, b) + d.W / 4 + reach) return true;
  }
  return false;
}
function villageHieiInDoorway(d, o) {
  const I = d.frame || d.I, dx = o.pos.x - I.x, dz = o.pos.z - I.z;
  const lx = dx * I.c - dz * I.s, lz = dx * I.s + dz * I.c;
  return Math.abs(lz - d.lz) < .35 && Math.abs(lx - d.lx) < d.W / 2 + .1 && atDoorHeight(d, o);
}

// 正面戸の外から来る兵も含めて調べる。兵の配列をそのまま使い、毎コマ入れ物を作らない。
function villageDoorReachable(d, u, x = d.x, z = d.z, target = d.y + d.h / 2, leaf = null) {
  const px = u.pos.x, pz = u.pos.z, dx = x - px, dz = z - pz;
  // 設楽原の引手は、近さを測る時と同じ手の高さから届くかを調べる。
  // 目の高さから斜めに下ろすと、手前の腰壁や横框の上を越して
  // 奥の戸へ札が出てしまう。既存の木枠・柱の当たりをそのまま使う。
  const eye = u.pos.y + (d.villageTrack ? .85 : 1.2);
  for (const wall of INTERIOR_WALLS) {
    // 引手を探す時は触れる一枚だけを除く。引違いで重なった相方は残し、
    // 手前の板や紙を突き抜けて奥の引手へ操作札を出さない。
    // 戸口中央への自動開閉の判断では、従来どおり二枚を除く。
    if (wall === d.solid && (!leaf || leaf === d.solid)
      || wall === d.otherSolid && (!leaf || leaf === d.otherSolid)) continue;
    // 触れる一枚の引手は、その戸自身の木枠でも遮らない。重なった相方の框は残す。
    if (wall.doorLeaf && (wall.doorLeaf === d.solid || wall.doorLeaf === d.otherSolid)
      && (!leaf || wall.doorLeaf === leaf)) continue;
    if (d.villageTrack) {
      // 壁の芯だけでなく厚みも調べる。斜めから柱の脇をかすめても、
      // 木の中を通して裏の引手へ触れない。壁端は丸い当たりに合わせる。
      const wx = wall.bx - wall.ax, wz = wall.bz - wall.az;
      const length = Math.hypot(wx, wz), radius = wall.r || 0;
      // 来迎柱などは始点と終点が同じ丸柱。線の長さがなくても省かず、
      // 仮の軸で高さを調べ、下の端円で柱の太さを判定する。
      const pole = length < .000001;
      const tx = pole ? 1 : wx / length, tz = pole ? 0 : wz / length;
      const along = (px - wall.ax) * tx + (pz - wall.az) * tz;
      const across = (px - wall.ax) * -tz + (pz - wall.az) * tx;
      const da = dx * tx + dz * tz, db = dx * -tz + dz * tx;
      let lo = .001, hi = .999;
      if (Math.abs(da) < .000001) {
        if (along < 0 || along > length) lo = 1;
      } else {
        const a = -along / da, b = (length - along) / da;
        lo = Math.max(lo, Math.min(a, b)); hi = Math.min(hi, Math.max(a, b));
      }
      if (Math.abs(db) < .000001) {
        if (Math.abs(across) > radius) lo = 1;
      } else {
        const a = (-radius - across) / db, b = (radius - across) / db;
        lo = Math.max(lo, Math.min(a, b)); hi = Math.min(hi, Math.max(a, b));
      }
      const dy = target - eye;
      if (Math.abs(dy) < .000001) {
        if (eye <= wall.yBot || eye >= wall.yTop) continue;
      } else {
        const a = (wall.yBot - eye) / dy, b = (wall.yTop - eye) / dy;
        lo = Math.max(lo, Math.min(a, b)); hi = Math.min(hi, Math.max(a, b));
      }
      if (lo < hi) return false;
      // 両端の円も調べ、壁の線分の先を回り込む手だけを通す。
      const rayLength2 = dx * dx + dz * dz;
      for (let end = 0; end < (pole ? 1 : 2); end++) {
        const ex = (end ? wall.bx : wall.ax) - px, ez = (end ? wall.bz : wall.az) - pz;
        // 引手の真下から手を伸ばす時も、丸柱や枠の丸い端を省かない。
        // 水平の長さがない手の軌跡は、柱の断面と上下の範囲で調べる。
        if (rayLength2 <= .000001) {
          if (ex * ex + ez * ez < radius * radius
            && Math.max(eye, target) > wall.yBot && Math.min(eye, target) < wall.yTop) return false;
          continue;
        }
        const center = (ex * dx + ez * dz) / rayLength2;
        const distance2 = ex * ex + ez * ez - center * center * rayLength2;
        if (distance2 >= radius * radius) continue;
        const reach = Math.sqrt((radius * radius - distance2) / rayLength2);
        let a = Math.max(.001, center - reach), b = Math.min(.999, center + reach);
        if (Math.abs(dy) >= .000001) {
          const c = (wall.yBot - eye) / dy, e = (wall.yTop - eye) / dy;
          a = Math.max(a, Math.min(c, e)); b = Math.min(b, Math.max(c, e));
        }
        if (a < b) return false;
      }
      continue;
    }
    const wx = wall.bx - wall.ax, wz = wall.bz - wall.az;
    const cross = dx * wz - dz * wx;
    const ax = wall.ax - px, az = wall.az - pz;
    if (Math.abs(cross) < .000001) continue;
    const t = (ax * wz - az * wx) / cross;
    const s = (ax * dz - az * dx) / cross;
    const margin = (wall.r || 0) / Math.max(.01, Math.hypot(wx, wz));
    if (t <= .001 || t >= .999 || s < -margin || s > 1 + margin) continue;
    const y = eye + (target - eye) * t;
    if (y > wall.yBot && y < wall.yTop) return false;
  }
  return true;
}

function igaReverseFace(d) {
  return (d.exterior || d.window) && d.trackSide < 0 && (d.kind === 'itado' || d.kind === 'shoji');
}

// 引き込み先の端を竪框で閉じる。二本溝の外側で戸を受け、戸口の幅は保つ。
// 焼失前の細部は推定。形と当たりを同じ寸法にし、設営時だけ用意する。
function igaPose(d) {
  if (!d.meshes) return;
  const I = d.I, k = d.open, e = k * k * (3 - 2 * k);
  // 伊賀の敷居は四センチ厚。戸の下框を敷居へ埋めず、溝の上から鴨居まで納める。
  // 当たりは敷居の下端まで残し、見た目だけを既存の溝の高さへ合わせる。
  const sill = I.profile === 'iga' ? .04 : 0;
  Q.setFromAxisAngle(Y, I.rot);
  if (d.fittedPanel) S.set(1, 1, 1);
  else S.set(d.pw / .9, (d.h - sill) / 1.8, 1);
  for (let j = 0; j < d.n; j++) {
    const left = j < d.n / 2;
    // 外戸の横桟と窓の組子は室内側へ向ける。裏返す戸は原形の左右も
    // 替えてあるため、引手は閉じ合わせる側に残り、溝と当たりも変わらない。
    if (I.profile === 'iga') Q.setFromAxisAngle(Y, I.rot +
      (igaReverseFace(d) || !left && d.kind !== 'shoji' && d.kind !== 'itado' ? Math.PI : 0));
    // 閉めた時は二本の溝（前後に少しずらす）。開けると左右の壁の前へ引き込む
    const lx = d.lx - d.W / 2 + (j + .5) * d.pw + (left ? -1 : 1) * e * d.travel;
    // 伊賀の戸は厚さ六センチの框が重ならない間隔で滑らせる。
    // 外の戸は開き切った時も内壁の柱から離し、二枚とも敷居の幅へ納める。
    const lz = I.profile === 'iga'
      ? d.trackZ + d.trackSide * ((j % 2) - .5) * .075
      : d.lz + (j % 2 ? 1 : -1) * (.02 + .045 * e);
    // 滑っている戸は毎コマ更新する。座標の配列を作らず、共有の位置へ直接書く。
    P.set(I.x + lx * I.c + lz * I.s, d.y + sill, I.z - lx * I.s + lz * I.c);
    M.compose(P, Q, S);
    const rightPanel = d.fittedPanel && (d.kind === 'shoji' || d.kind === 'itado') && !left;
    const meshes = rightPanel ? d.rightMeshes : d.meshes;
    const index = rightPanel ? d.rightBase + j - d.n / 2 : d.base + j;
    if (meshes) for (const m of meshes) m.setMatrixAt(index, M);
  }
  for (const m of d.meshes) m.instanceMatrix.needsUpdate = true;
  if (d.rightMeshes) for (const m of d.rightMeshes) m.instanceMatrix.needsUpdate = true;
}
function slideSolids(d) {
  const I = d.I, e = d.open * d.open * (3 - 2 * d.open), half = d.W / 2;
  for (let j = 0; j < d.n; j++) {
    const s = d.leaves[j], shift = (j < d.n / 2 ? -1 : 1) * e * d.travel;
    const l = d.lx - half + j * d.pw + shift - d.overlap / 2, r = l + d.panelW;
    // 描く戸と同じ二本の溝へ当たりを置く。中央へ厚い当たりを重ねると、
    // 開いた戸の脇でも見えない板に引っ掛かり、戸の裏へ寄れなくなる。
    const trackZ = d.trackZ + d.trackSide * ((j % 2) - .5) * .075;
    s.ax = I.x + l * I.c + trackZ * I.s;
    s.az = I.z - l * I.s + trackZ * I.c;
    s.bx = I.x + r * I.c + trackZ * I.s;
    s.bz = I.z - r * I.s + trackZ * I.c;
    s.x0 = Math.min(s.ax, s.bx) - s.r; s.x1 = Math.max(s.ax, s.bx) + s.r;
    s.z0 = Math.min(s.az, s.bz) - s.r; s.z1 = Math.max(s.az, s.bz) + s.r;
    if (d.frames) for (const frame of d.frames[j]) {
      // 幅四センチの框は中心から二センチずつ。当たりを開口側へ余分に張り出さない。
      const a = l + frame.leafStart + .02, b = l + frame.leafEnd - .02;
      frame.ax = I.x + a * I.c + trackZ * I.s;
      frame.az = I.z - a * I.s + trackZ * I.c;
      frame.bx = I.x + b * I.c + trackZ * I.s;
      frame.bz = I.z - b * I.s + trackZ * I.c;
      frame.x0 = Math.min(frame.ax, frame.bx) - frame.r;
      frame.x1 = Math.max(frame.ax, frame.bx) + frame.r;
      frame.z0 = Math.min(frame.az, frame.bz) - frame.r;
      frame.z1 = Math.max(frame.az, frame.bz) + frame.r;
    }
  }
}
function igaDoorReachable(d, u, targetX, targetZ, targetY) {
  const I = d.I, p = u.pos;
  // 戸口の脇から斜めに手を伸ばす時も、実際の開口を通れば扱える。
  // 立ち位置の横幅では切らず、下の外壁・柱際・別の戸の交差で遮る。
  const dx = targetX - p.x, dz = targetZ - p.z, handY = p.y + .9;
  const dy = targetY - handY;
  for (const wall of INTERIOR_WALLS) {
    if (wall.naka !== I.id || wall === d.solid || d.leaves?.includes(wall)
      || d.frames?.some(parts => parts.includes(wall))) continue;
    const wx = wall.bx - wall.ax, wz = wall.bz - wall.az;
    const len = Math.hypot(wx, wz);
    if (len < .00001) continue;
    const ax = p.x - wall.ax, az = p.z - wall.az, radius = wall.r || 0;
    // 壁の中心線だけでなく厚みまで調べる。壁と平行に手を伸ばす時も、
    // 柱際の板や戸当たりを通り抜けて向こうの戸を扱わせない。
    // 小窓へ伸ばす手は、手元から引手までの高さの変化も含める。
    // 壁に沿う軸・壁厚の軸・高さの順に交差範囲を絞り、毎回の配列は作らない。
    let near = .001, far = .999;
    for (let axis = 0; axis < 3; axis++) {
      const origin = axis === 0 ? (ax * wx + az * wz) / len
        : axis === 1 ? (ax * wz - az * wx) / len : handY;
      const delta = axis === 0 ? (dx * wx + dz * wz) / len
        : axis === 1 ? (dx * wz - dz * wx) / len : dy;
      const low = axis === 0 ? 0 : axis === 1 ? -radius : wall.yBot;
      const high = axis === 0 ? len : axis === 1 ? radius : wall.yTop;
      if (Math.abs(delta) < .00001) {
        if (origin < low || origin > high) { far = -1; break; }
      } else {
        const a = (low - origin) / delta, b = (high - origin) / delta;
        near = Math.max(near, Math.min(a, b));
        far = Math.min(far, Math.max(a, b));
        if (near > far) break;
      }
    }
    if (near <= far) return false;
  }
  // 番所の槍掛け・館の床の間も、引手へ伸ばす手を遮る。
  // 通行と描画が使う外寸へ手の線を通し、低い文机やむしろの上は扱えるままにする。
  // 回した陣小屋でも調度と同じ局所座標で調べ、候補ごとの配列は作らない。
  const px = p.x - I.x, pz = p.z - I.z;
  const lx = px * I.c - pz * I.s, lz = px * I.s + pz * I.c;
  const rx = dx * I.c - dz * I.s, rz = dx * I.s + dz * I.c;
  for (const prop of d.lv.layout.props) {
    let near = .001, far = .999;
    for (let axis = 0; axis < 3; axis++) {
      const origin = axis === 0 ? lx : axis === 1 ? handY - d.lv.y : lz;
      const delta = axis === 0 ? rx : axis === 1 ? dy : rz;
      const center = axis === 0 ? prop.x : axis === 1 ? (prop.y || 0) + prop.h / 2 : prop.z;
      const half = (axis === 0 ? prop.w : axis === 1 ? prop.h : prop.d) / 2;
      if (Math.abs(delta) < .00001) {
        if (origin < center - half || origin > center + half) { far = -1; break; }
      } else {
        const a = (center - half - origin) / delta, b = (center + half - origin) / delta;
        near = Math.max(near, Math.min(a, b));
        far = Math.min(far, Math.max(a, b));
        if (near > far) break;
      }
    }
    if (near <= far) return false;
  }
  return true;
}

// 設楽原の指掛けは戸の中央ではなく八十五センチまで。格子戸だけ中央の金具を使う。
// 遊び手・住人・兵で同じ高さを参照し、低い横木の上から戸を操作しない。
function villageGripHeight(d) {
  return d.y + (d.kind === 'koshiHikite' ? d.h / 2 : Math.min(.85, d.h / 2));
}

// 自動で開くのは通行用の戸口の正面だけ。明かり障子は札で操作する。
// 壁際にいる兵が、壁の向こうや横へ引き込んだ戸へ反応するのも防ぐ。
function walkDoorReachable(d, u) {
  if (d.window) return false;
  // 段の下や床下から、平面上で近いだけの戸を開けない。
  // 操作札と同じ手の高さ・届く距離を使い、戸口の正面へ来てから開く。
  if (d.villageTrack) {
    // 設楽原の建具は立って手を掛ける。倒れ中・登り中・騎乗中の者が
    // 戸前に残した移動の判定だけで、板戸や襖を押し開けない。
    if (u.downed || u.climb || u.mounted) return false;
    const gripY = villageGripHeight(d);
    if (Math.hypot(d.x - u.pos.x, d.z - u.pos.z, gripY - u.pos.y - .85) >= 1.5) return false;
  }
  const dx = u.pos.x - d.I.x, dz = u.pos.z - d.I.z;
  const lx = dx * d.I.c - dz * d.I.s, lz = dx * d.I.s + dz * d.I.c;
  return Math.abs(lx - d.lx) < d.W / 2 && Math.abs(lz - d.lz) < .8
    && villageDoorReachable(d, u, d.x, d.z, d.villageTrack ? villageGripHeight(d) : d.y + d.h / 2);
}

function villageNearest(rt) {
  const u = rt.player && rt.player.u;
  if (!u || !u.alive || rt.player.mounted) return null;
  // 森部は戸口の出入りと同じ条件で手を使う。倒れている間や登っている間、
  // 選択中・終戦後には、窓や内陣の格子戸を遠隔で動かさない。
  const handsBusy = u.downed || u.climb || rt.over || rt.choice;
  if (handsBusy) return null;
  if (pickT === rt.t) return pick?.I.disabled ? null : pick;
  pickT = rt.t; pick = null;
  let bd = 1.5;
  for (const d of DOORS) {
if (d.tracked) {
    if (d.I.disabled) continue;
    if (d.I.id + 1 !== u.naka && !((d.entry || d.window) && !u.naka)) continue;
    // 明かり障子の基準は腰壁の上。僧坊の床高も加わるので、外の地面からは
    // 足元との差が一・二メートルを超えていた。窓は下の三次元の手掛け距離で
    // 判定し、腰壁・窓枠越しの遮りも従来どおり調べる。通常の戸は階を区別する。
    if (!d.window && Math.abs(u.pos.y - d.y) > 1.2) continue;
    const dist = doorDistance(d, u.pos, true);
    if (dist < bd) { bd = dist; pick = d; pickPoint.x = d.touch.x; pickPoint.z = d.touch.z; }

} else {
    if (d.I.disabled || (!d.exterior && d.I.id + 1 !== u.naka)) continue;
    // 出入りの札と同じく、倒れ中や登り中は引手の札も出さない。
    // 自動で開ける場合も上の判定を共用し、手動だけを止めて抜け道を残さない。
    if (d.villageTrack && (u.downed || u.climb || u.mounted)) continue;
    // 設楽原は下の段からも実際に届く引手を選ぶ。手の高さ・距離・遮りは下で調べる。
    if (!d.villageTrack && Math.abs(u.pos.y - d.lv.y) > 1.2) continue;
    if (d.villageTrack) {
      // 札は空いた戸口でなく、滑った戸の召し合わせ側の引手へ出す。
      // 窓は選んだ一枚が相方へ重なる。左右の引手を調べ、壁を挟まない近い方を使う。
      const e = d.open * d.open * (3 - 2 * d.open);
      // 設楽原の戸は実寸で組み、引手の端からの距離と高さは伸縮しない。
      // 召し合わせの重なり三センチを差し引き、動く戸の引手と札の参照点を揃える。
      // 窓も半幅の戸へ一・五センチ足し、中心を七・五ミリ寄せるため同じ差し引きになる。
      const inset = d.kind === 'fusumaPlain' ? .13 : d.kind === 'koshiHikite' ? .09 : .02;
      const gripX = inset - .015;
      const gripY = villageGripHeight(d);
      // 段や床下からも平面上の距離だけで戸を選べていた。
      // 手の高さから引手までの実距離を使い、届く戸だけに札を出す。
      const handY = u.pos.y + .85;
      for (let j = 0; j < 2; j++) {
        const side = j ? 1 : -1;
        const shift = d.window ? windowShift(d, j) : side;
        const lx = d.lx + shift * e * d.travel + side * gripX;
        const lz = d.lz + side * .04;
        const x = d.I.x + lx * d.I.c + lz * d.I.s;
        const z = d.I.z - lx * d.I.s + lz * d.I.c;
        const dist = Math.hypot(x - u.pos.x, z - u.pos.z, gripY - handY);
        if (dist < bd && villageDoorReachable(d, u, x, z, gripY, j ? d.otherSolid : d.solid)) {
          bd = dist; pick = d; pickLeaf = j; pickPoint.x = x; pickPoint.z = z;
        }
      }
    } else {
      const dist = Math.hypot(d.x - u.pos.x, d.z - u.pos.z);
      if (dist < bd) { bd = dist; pick = d; pickPoint.x = d.x; pickPoint.z = d.z; }
    }

}
  }
  return pick;
}

// 遊び手と室内の兵で、同じ引手の位置・高さ・壁よけを使う。
// 開いた戸の引手も追い、座標の箱は設営時の物を使い回す。
function igaHandleDistance(d, u, dist, mark = false) {
  const I = d.I, slide = d.open * d.open * (3 - 2 * d.open);
  const inset = d.kind === 'shoji' ? .02 : d.kind === 'itado' ? .12 : .13;
  const handleY = d.y + .04 + (d.h - .04) * (d.kind === 'fusumaPlain' ? .47 : .5);
  // 斜面に建つ館・小屋は床が地面より高い。平面の距離だけでは、
  // 段の下から手の届かない引手を扱えてしまう。壁よけと同じ手の高さで測る。
  const handY = u.pos.y + .9;
  for (let j = 0; j < d.n; j++) {
    const side = j < d.n / 2 ? -1 : 1;
    const lx = d.lx - d.W / 2 + (j + .5) * d.pw
      + side * (slide * d.travel - (d.panelW / 2 - inset));
    const lz = d.trackZ + d.trackSide * ((j % 2) - .5) * .075;
    const x = I.x + lx * I.c + lz * I.s, z = I.z - lx * I.s + lz * I.c;
    const reach = Math.hypot(x - u.pos.x, z - u.pos.z, handleY - handY);
    if (reach >= dist || !igaDoorReachable(d, u, x, z, handleY)) continue;
    dist = reach;
    if (mark) { d.interactPos.x = x; d.interactPos.z = z; }
  }
  return dist;
}

function igaNearest(rt) {
  if (pickT === rt.t) return pick?.I.disabled ? null : pick;
  pickT = rt.t; pick = null;
  const u = rt.player && rt.player.u;
  if (!u || !u.alive || rt.player.mounted) return null;
  let bd = 1.5, closed = false, passage = false;
  for (const d of DOORS) {
    if (d.I.disabled) continue;
    if (d.I.id + 1 !== u.naka && !((d.exterior || d.entry || d.window && d.tracked) && !u.naka) ||
      Math.abs(d.window ? u.pos.y + .9 - d.y - d.h / 2 : u.pos.y - d.y) > 1.2) continue;
    let dist = doorDistance(d, u.pos, true);
    if (d.I.profile === 'iga') {
      dist = igaHandleDistance(d, u, 1.5, true);
    }
    if (dist >= 1.5) continue;
    // 伊賀の狭い入口では、開けた外の戸のすぐ奥に板戸・障子がある。
    // 外の「閉める」ばかり拾わず、通りたい閉じた戸の「開ける」を先に出す。
    const prefer = d.I.profile === 'iga' && !d.want;
    // 小窓の雨戸・障子より、閉じた戸口を先に扱う。
    // 窓の引手が少し近いだけで、上がり口の板戸を開けられなくしない。
    const through = prefer && !d.window;
    if (prefer && !closed || prefer === closed &&
        (through && !passage || through === passage && dist < bd)) {
      bd = dist; closed = prefer; passage = through; pick = d;
    }
  }
  return pick;
}

function villageNakaDoorTick(rt, dt, flagged) {
  const moribe = false;
  if (!DOORS.length) return;
  if (rt.addInteract && !rt._nakaDoors) {
    rt._nakaDoors = true;
    rt.addInteract('naka_to', () => { const d = villageNearest(rt); return d && !(d.want && rt.def.doorCloseOK?.(rt) === false) ? pickPoint : null; }, '開ける', () => {
      const d = villageNearest(rt);
      if (d) {
        // 途中で引く戸を入れ替えると瞬間に位置が変わる。全閉から開く時だけ選ぶ。
        if (d.villageTrack && d.window && d.open === 0 && !d.want) d.windowLeaf = pickLeaf;
        setWant(rt, d, d.want ? 0 : 1);
      }
    }, { r: 1.5, prio: -3 });
    const it = rt.interacts[rt.interacts.length - 1];
    Object.defineProperty(it, 'label', { get: () => (villageNearest(rt) && villageNearest(rt).want ? '閉める' : '開ける'), configurable: true });
  }
  // 中の兵は戸口へ来たら自分で開ける。設楽原の遊び手は引手の札で横へ引く。
  autoT -= dt;
  if (autoT <= 0) {
    autoT = .2;
    const u = rt.player && rt.player.u;
    if (u && u.alive && (rt.player.blockedWalkT || 0) >= .5) {
      // 板戸・襖・障子・格子戸は、体で押しただけでは滑らせない。
      // 閉めた直後に歩行の詰まりで開き直すのも防ぐ。住人と兵の開閉は下で扱う。
      const d = villageNearest(rt);
      if (d?.tracked) {
        if (!d.window && !d.want && doorDistance(d, u.pos) < 1.1) setWant(rt, d, 1);
      } else if (d && !d.villageTrack && !d.want
        && Math.hypot(d.x - u.pos.x, d.z - u.pos.z) < 1.1) setWant(rt, d, 1);
    }
    for (const o of flagged) {
      if (o.isPlayer || !o.alive || !o.naka) continue;
      const I = DOORS.find((d) => d.I.id + 1 === o.naka)?.I;
      if (!I || I.disabled || !I.doors) continue;
      for (const d of I.doors) if (!d.window && !d.want && (d.tracked ? doorDistance(d, o.pos) : Math.hypot(d.x - o.pos.x, d.z - o.pos.z)) < 1.2 && Math.abs(o.pos.y - d.lv.y) < 1.2
        && (!d.villageTrack || walkDoorReachable(d, o))) setWant(rt, d, 1);
    }
    // 外の住人や兵も、戸口まで来れば板戸を開けて入れる。
    // 室内の名簿だけでは入口の外側にいる者が抜けるため、通行用の外戸だけを補う。
    if (rt.army) for (const d of DOORS) {
      if (!d.villageTrack || !d.exterior || d.window || d.want || d.I.disabled) continue;
      for (const o of rt.army.units) {
        if (o.isPlayer || !o.alive || o.isStruct || o.mounted || o.naka) continue;
        if (Math.hypot(d.x - o.pos.x, d.z - o.pos.z) < 1.2 && walkDoorReachable(d, o)) {
          setWant(rt, d, 1); break;
        }
      }
    }
    for (const d of DOORS) if (!d.I.disabled && d.entry && !d.want) {
      for (const o of rt.army?.units || []) {
        if (o.isPlayer || !o.alive || Math.abs(o.pos.y - d.y) > 1.2) continue;
        if (doorDistance(d, o.pos) < 1.2) { setWant(rt, d, 1); break; }
      }
    }
  }
  for (const d of moving) {
    // 焼失した建物は共通の片付け済み。閉まりかけの戸の当たりを戻さない。
    if (d.I.disabled) { moving.delete(d); continue; }
    // 閉め始めに空いていても、滑る途中で人が入ったら開き直す。
    // 閉め切った後の判定では戸が体を横切るため、形と当たりを動かす前に止める。
    if (d.tracked && !d.want && doorwayOccupied(rt, d)) { setWant(rt, d, 1); continue; }
    const next = Math.max(0, Math.min(1, d.open + (d.want ? 1 : -1) * dt * 2.6));
    if (d.otherSolid || d.villageTrack && d.window) {
      // 開く時も壁際へ退いた人の手前で待つ。人が離れれば同じ操作のまま再開する。
      const u = rt.player && rt.player.u;
      if ((u && sweptDoorway(d, u, next)) || flagged.some((o) => o.naka === d.I.id + 1 && sweptDoorway(d, o, next))) continue;
      // 外戸の引き込み先も外の兵・住人を挟まない。既存の兵と戸を調べ、毎コマ配列を作らない。
      if (d.villageTrack && d.exterior && rt.army) {
        let blocked = false;
        for (const o of rt.army.units) {
          if (o.isPlayer || o.isStruct || o.naka) continue;
          if (sweptDoorway(d, o, next)) { blocked = true; break; }
        }
        if (blocked) continue;
      }
    }
    if (d.tracked && leafSweepOccupied(rt, d, next)) continue;
    d.open = next;
    pose(d);
    if (d.open !== d.want) continue;
    if (d.want && d.tracked) solidOff(d);
    if (!d.want && !d.villageTrack) {
      // 閉め切った時に戸口に人が立っていれば、開けたままにして待つ
      // 設楽原は直前の掃引判定で、動く戸の範囲だけを確かめ済み。
      // 窓全体でも止めると、動かない右戸の前にいるだけで左の障子を閉め切れない。
      // 開度だけを戻して見た目・当たりと食い違わせず、二本の溝の位置を保つ。
      const u = rt.player && rt.player.u;
      if (moribe ? moribeDoorwayOccupied(rt, d, flagged, 0)
        : (u && moribeInDoorway(d, u)) || flagged.some((o) => o.alive && o.naka === d.I.id + 1 && moribeInDoorway(d, o))) { d.open = .02; continue; }
      if (d.saved) Object.assign(d.solid, d.saved);
    }
    moving.delete(d);
  }
}



// 伊賀の戸は実寸の引手と戸板の当たりを使い、描かれる前から開閉する。
function igaNakaDoorTick(rt, dt, flagged) {
  if (!DOORS.length) return;
  if (rt.addInteract && !rt._nakaDoors) {
    rt._nakaDoors = true;
    rt.addInteract('naka_to', () => { const d = igaNearest(rt); return d && !(d.want && rt.def.doorCloseOK?.(rt) === false) ? d.interactPos : null; }, '開ける', () => {
      const d = igaNearest(rt);
      if (d && !(d.want && rt.def.doorCloseOK?.(rt) === false)) setWant(rt, d, d.want ? 0 : 1);
    }, { r: 1.5, prio: -3 });
    const it = rt.interacts[rt.interacts.length - 1];
    Object.defineProperty(it, 'label', { get: () => igaNearest(rt)?.want ? '閉める' : '開ける', configurable: true });
  }
  autoT -= dt;
  if (autoT <= 0) {
    autoT = .2;
    for (const d of DOORS) {
      if (d.I.disabled || d.window || d.want) continue;
      const units = d.exterior ? rt.army?.units || flagged : flagged;
      const u = rt.player?.u;
      if (u?.alive && (rt.player.blockedWalkT || 0) >= .5 && igaHandleDistance(d, u, 1.1) < 1.1) setWant(rt, d, 1);
      for (const o of units) {
        if (o.isPlayer || !o.alive || o.downed || o.climb || o.mounted || o.isStruct
          || (o.naka && o.naka !== d.I.id + 1) || (!d.exterior && o.naka !== d.I.id + 1)) continue;
        if (Math.abs(o.pos.y - d.y) < 1.2 && doorDistance(d, o.pos) < 1.2 && igaHandleDistance(d, o, 1.2) < 1.2) {
          setWant(rt, d, 1); break;
        }
      }
    }
  }
  for (const d of moving) {
    if (d.I.disabled) { moving.delete(d); continue; }
    const occupants = d.exterior ? rt.army?.units || flagged : flagged;
    const u = rt.player?.u;
    const next = Math.max(0, Math.min(1, d.open + (d.want ? 1 : -1) * dt * 2.6));
    if (d.want) {
      if ((u && openingBlocked(d, u, next)) || occupants.some(o => (d.exterior || o.naka === d.I.id + 1) && openingBlocked(d, o, next))) continue;
    } else if ((u && igaInDoorway(d, u)) || occupants.some(o => o.alive && (d.exterior || o.naka === d.I.id + 1) && igaInDoorway(d, o))) continue;
    d.open = next;
    slideSolids(d); igaPose(d);
    if (d.open === d.want) moving.delete(d);
  }
}

function addNodaDoors(I, lv, y0, y1) {
  if (SKIP.includes(I.kind) || I.open || I.profile === 'yagura') return;
  const joinery = SETTINGS.quality === 'high' && I.profile === 'nodafukushima';
  const portals = [...(lv.layout.portals || [])];
  // 御影堂の正面は物置の板戸と分け、内陣と共通の格子戸とする推定復元。
  // 閉じても礼拝の場が見える。玄関は閉じて始め、同じ札・溝・横滑りを使う。
  // 僧坊・庫裏と砦・民家の玄関は雨風を避ける板戸を保つ。
  if (joinery && lv.k === 0) portals.push({ entry: true, kind: I.kind === 'hondo' ? 'koshi' : 'itado', x: I.door.lx, z: I.door.side * lv.d / 2 });
  // 格子窓の内障子と、兵糧蔵・物置・民家の板戸。格子は残し、雨風を避ける戸を室内へ引く。
  if (joinery && ['hondo', 'sobo', 'kuri', 'goten', 'bansho', 'nagaya', 'kura', 'minka'].includes(I.kind)) for (const v of lv.windows || []) {
    if (v.shoji) continue;
    const axisX = v.face === 'x';
    // 物置の雨戸も窓定義の指定を使い、紙障子へ戻さず共通の敷居・札で滑らせる。
    portals.push({ window: v, kind: v.doorKind || (I.kind === 'minka' ? 'itado' : 'shoji'),
      x: axisX ? v.s * (lv.w / 2 - .48) : v.t,
      z: axisX ? v.t : v.s * (lv.d / 2 - .48) });
  }
  // 比叡山の正面入口にも同じ引き戸を使う。外壁の開口幅・高さに合わせる。
  if (I.profile === 'hieizan' && lv === I.levels[0]) portals.push({
    x: I.door.lx, z: I.door.side * (lv.d / 2 - HIEI_ENTRY_TRACK), entry: true,
    // 炊事の庫裏は堂の内陣用の格子戸にせず、土間を閉じる板戸にする。
    // 僧坊も外戸は板戸にし、紙障子は軒内の明かり取りと座敷境に残す。
    kind: ['sobo', 'kuri'].includes(I.kind) ? 'itado' : 'koshi',
  });
  // 伊賀の外戸は雨風を受ける板戸にする。館の紙障子は入口の内側に残し、
  // 外へ紙だけを露出させない。室内の戸と同じ形の共有・開閉の仕組みを使う。
  if (I.profile === 'iga' && lv.k === 0) portals.push({
    x: I.door.lx, z: I.door.side * lv.d / 2, w: I.door.w, exterior: true,
    kind: 'itado',
  });
  // 館も紙の外側に雨戸を納め、民家・陣小屋・番所は板戸だけにする推定復元。
  // 窓は通路にせず、室内から共通の札で開閉する。
  if (I.profile === 'iga' && ['yashiki', 'minka', 'nagaya', 'bansho'].includes(I.kind)) for (const w of lv.windows || []) {
    if (w.face !== 'z' || w.shoji) continue;
    const window = { x: w.t, z: w.s * (lv.d / 2 - .1), window: true,
      side: w.s, w: w.w, y: w.y0, top: w.y1 };
    portals.push({ ...window, kind: 'itado', initialOpen: I.kind === 'yashiki' });
    if (I.kind === 'yashiki') portals.push({ ...window, kind: 'shoji', inset: IGA_SHOJI_WINDOW_INSET });
  }
  for (const p of portals) {
    const width = p.window ? p.w : I.door.w;
    let l = p.exterior || p.entry || p.window ? p.x - width / 2 : -Infinity;
    let r = p.exterior || p.entry || p.window ? p.x + width / 2 : Infinity, paper = true;
    for (const v of p.exterior || p.entry || p.window ? [] : lv.layout.walls) {
      if (v.guideOnly || Math.abs(v.az - p.z) > .01 || Math.abs(v.bz - p.z) > .01) continue;
      const a = Math.min(v.ax, v.bx), b = Math.max(v.ax, v.bx);
      if (b <= p.x + .01 && b > l) { l = b; paper = v.paper; }
      if (a >= p.x - .01 && a < r) r = a;
    }
    if (p.entry) { l = p.x - I.door.w / 2; r = p.x + I.door.w / 2; }
    const window = p.window, axisX = window?.face === 'x';
    if (window) { l = -window.w / 2; r = window.w / 2; }
    if (!isFinite(l) || !isFinite(r) || r - l < .5 || r - l > 4.4) continue;
    const temple = TEMPLE.includes(I.kind);

    const kind = I.profile === 'iga' && p.kind === 'fusuma' ? 'fusumaPlain'
      : p.kind || (temple ? 'koshi' : !paper ? 'itado' : ['goten', 'yashiki', 'shisha'].includes(I.kind) ? 'fusumaE' : 'shoji');
    const W = r - l, n = Math.max(2, Math.round(W / 1.8) * 2);
if (joinery) {
    const [ax, az] = window ? I.P(p.x + (axisX ? 0 : l), p.z + (axisX ? l : 0)) : I.P(l, p.z);
    const [bx, bz] = window ? I.P(p.x + (axisX ? 0 : r), p.z + (axisX ? r : 0)) : I.P(r, p.z), rad = .06;
    const solid = { k: 's', ax, az, bx, bz, r: rad, yBot: window ? lv.y + window.y0 : y0, yTop: window ? lv.y + window.y1 : y1, naka: I.id, fusuma: kind !== 'itado',
      x0: Math.min(ax, bx) - rad, x1: Math.max(ax, bx) + rad, z0: Math.min(az, bz) - rad, z1: Math.max(az, bz) + rad };
    SOLIDS.push(solid); INTERIOR_WALLS.push(solid);
    const lx = window ? p.x : (l + r) / 2, [x, z] = I.P(lx, p.z);
    // 低い用屋でも戸の上端を桁の下へ収める。固定の袖と鴨居も同じ高さを使う。
    const h = window ? window.y1 - window.y0 : p.entry ? I.door.h ?? Math.min(lv.h - .3, 2) : joinery ? nodaDoorHeight(lv.h) : lv.h > 3 ? 2.3 : lv.h - .02;
    // 御影堂は玄関まで畳敷き。玄関も間仕切りも畳表の高さで受け、
    // 板戸の下框と当たりを畳へ埋めない。窓の敷居は従来どおり。
    const sill = joinery && !window && lv.layout.rooms.some(r => r.floor === 'tatami'
      && p.x >= r.x0 && p.x <= r.x1 && (Math.abs(r.z0 - p.z) < .01 || Math.abs(r.z1 - p.z) < .01)) ? .06 : .028;
    // 別々の溝を通る戸を突き合わせるだけでは、閉めても召合せに隙間が残る。
    // 野田福島の高は框を三センチ重ね、閉めた時の両端は保つ。
    // 戸幅を絵・格子の射線・歩行の当たりで共用し、部品の数は増やさない。
    const overlap = joinery ? .03 : 0, pw = (W + overlap * (n - 1)) / n;
    // 鴨居の溝は開口の上から十二ミリ。上框を開口の高さで止めると
    // 溝に掛からず、戸が敷居だけで立つ形になる。十ミリ掛けて底に二ミリ残す。
    // 玄関・間仕切り・内障子で共用し、鴨居や敷居の位置は動かさない。
    const headLap = joinery ? .01 : 0;
    const d = { I, lv, kind, window: !!window, sourceWindow: window, axisX, entry: !!p.entry, lx, lz: p.z, W, n, pw, pitch: pw - overlap, h, headLap, sill, joinery, y: lv.y + (window ? window.y0 : 0), x, z, interactPos: { x, z }, solid, saved: null, open: 0, want: 0, meshes: null, base: 0 };
    // 部屋の表裏は設営時に決め、開閉中に間取りを探し直さない。
    d.roomShojiReverse = joinery && kind === 'shoji' && !window && nodaShojiReverse(lv.layout, p.z);
    // 入口が北向きの寺務・物置長屋では、板間も戸の反対側になる。
    // 間仕切りの裏桟は土間へ出さず板間へ向ける。設営時に一度だけ決め、
    // 玄関・窓と同じく、左右の戸の表裏を揃えたまま滑らせる。
    d.roomBoardReverse = joinery && kind === 'itado' && !window && !p.entry
      && lv.layout.rooms.some(r => r.floor === 'boards' && p.x >= r.x0 && p.x <= r.x1
        && Math.abs(r.z0 - p.z) < .01);
    // 四枚戸は左右二枚ずつを別々の溝で重ねて引く。
    // 全てを同じ距離だけ動かすと、重ならず横一列に広がり、袖の外へ突き出す。
    // 二枚戸は従来の引き代を保つ。絵と移動中の当たりで同じ値を使い回す。
    if (joinery) d.travel = Array.from({ length: n }, (_, j) => {
      const side = j < n / 2 ? -1 : 1;
      // 召合せの重なりで戸幅を増した分、二枚戸の引き代を半分ずつ短くする。
      // 幅だけ増して元の距離を滑らせると、全開時に框が竪枠へ食い込む。
      // 敷居の両端で木口を止め、玄関・間仕切り・内障子で同じ納まりにする。
      if (n === 2) return side * (W - overlap) / 2;
      const closed = -W / 2 + pw / 2 + j * d.pitch;
      return side * (W / 2 + pw / 2) - closed;
    });
    (I.doors || (I.doors = [])).push(d); DOORS.push(d);
    if (joinery) {
      // この戦だけ戸一枚ごとの当たりを用意する。開閉中も絵と同じ溝を通す。
      d.leaves = [solid];
      for (let j = 1; j < n; j++) {
        const leaf = { ...solid };
        d.leaves.push(leaf); SOLIDS.push(leaf); INTERIOR_WALLS.push(leaf);
      }
      if (kind === 'koshi') {
        const timbers = koshiTimbers(.9, 1.8, d.pw / .9, (h + headLap - sill) / 1.8);
        for (const leaf of d.leaves) { leaf.lattice = timbers; leaf.fusuma = false; }
      }
      if (['shoji', 'fusuma', 'fusumaE'].includes(kind)) {
        const waist = kind === 'shoji' && !window && ['sobo', 'kuri'].includes(I.kind);
        const timbers = paperDoorTimbers(kind, d.pw / .9, (h + headLap - sill) / 1.8, waist);
        for (const leaf of d.leaves) leaf.paperTimbers = timbers;
      }
      if (window) {
        // 敷居・鴨居も見える木の範囲だけ受ける。二本の溝は塞がず、
        // 絵と当たりに同じ八本の材を使う。設営時にだけ作る。
        d.windowRails = [];
        for (const top of [false, true]) for (const [a, b] of [[-.2, .2], [-.2, -.175], [-.105, .105], [.175, .2]]) {
          const base = b - a === .4, offset = (a + b) / 2;
          const [ax, az] = I.P(lx + (axisX ? -offset : -W), p.z + (axisX ? -W : offset));
          const [bx, bz] = I.P(lx + (axisX ? -offset : W), p.z + (axisX ? W : offset));
          const h = base ? .028 : .012;
          const y = d.y + (top ? d.h + (base ? .026 : .006) : base ? .014 : .034);
          const rail = { k: 's', ax, az, bx, bz, r: (b - a) / 2, naka: I.id,
            yBot: y - h / 2, yTop: y + h / 2,
            x0: Math.min(ax, bx) - (b - a) / 2, x1: Math.max(ax, bx) + (b - a) / 2,
            z0: Math.min(az, bz) - (b - a) / 2, z1: Math.max(az, bz) + (b - a) / 2,
          };
          d.windowRails.push(rail); SOLIDS.push(rail); INTERIOR_WALLS.push(rail);
        }
        // 内障子を受ける竪枠は紙戸と別の固定材。開閉しても木には人や矢を通さない。
        // 設営時に一度だけ作り、描く側もこの位置・高さを使う。
        d.windowJambs = [];
        for (const side of [-1, 1]) {
          const along = side * (W + .04), r = .04;
          const [ax, az] = I.P(lx + (axisX ? -.16 : along), p.z + (axisX ? along : -.16));
          const [bx, bz] = I.P(lx + (axisX ? .16 : along), p.z + (axisX ? along : .16));
          const jamb = { k: 's', ax, az, bx, bz, r, naka: I.id,
            yBot: d.y - .014, yTop: d.y + h + .066,
            x0: Math.min(ax, bx) - r, x1: Math.max(ax, bx) + r,
            z0: Math.min(az, bz) - r, z1: Math.max(az, bz) + r };
          d.windowJambs.push(jamb); SOLIDS.push(jamb); INTERIOR_WALLS.push(jamb);
        }
      } else if (!p.entry) {
        // 間仕切りも全開位置で戸を受ける竪枠を備える推定復元。
        // 二本溝の外端へ納め、中央の開口と引き代は保つ。
        // 窓の竪枠と同じ形・材質で束ね、当たりも同じ位置に作る。
        d.windowRails = []; d.windowJambs = [];
        const reach = n === 2 ? W : W / 2 + pw;
        for (const side of [-1, 1]) {
          const along = lx + side * (reach + .025), r = .025;
          const [ax, az] = I.P(along, p.z - .175);
          const [bx, bz] = I.P(along, p.z + .175);
          const jamb = { k: 's', ax, az, bx, bz, r, naka: I.id,
            yBot: d.y + sill, yTop: d.y + h,
            x0: Math.min(ax, bx) - r, x1: Math.max(ax, bx) + r,
            z0: Math.min(az, bz) - r, z1: Math.max(az, bz) + r };
          d.windowJambs.push(jamb); SOLIDS.push(jamb); INTERIOR_WALLS.push(jamb);
        }
      }
    }
    if (temple && !p.entry && !window) {
      d.open = d.want = 1;
      if (!joinery) solidOff(d);
    }
    if (joinery) pose(d);

}
  }
}

function buildNodaDoorMeshes(I, grp) {
  if (!I.doors) return;
  const windows = I.doors.filter(d => d.windowJambs);
  if (windows.length) {
    // 敷居・鴨居は共通の箱を一束にする。二本の溝を残し、開いた障子も壁の手前で受ける。
    if (!windowRailGeo) {
      windowRailGeo = new THREE.BoxGeometry(1, 1, 1);
      const pos = windowRailGeo.attributes.position, uv = windowRailGeo.attributes.uv;
      for (let j = 0; j < pos.count; j++) {
        const face = Math.floor(j / 4);
        // 横木の側面は横方向へ木目を通し、木口は断面として納める。
        uv.setXY(j, (face < 2 ? pos.getZ(j) : face < 4 ? pos.getZ(j) : pos.getY(j)) + .5,
          (face < 2 ? pos.getY(j) : pos.getX(j)) + .5);
      }
    }
    // 天井・柱と同じ木肌を共用し、無地の窓枠だけが浮いて見えるのを防ぐ。
    windowRailMat ||= new THREE.MeshLambertMaterial({ color: 0x3a2a1c, map: ceilingWoodMaterial().map });
    const rails = new THREE.InstancedMesh(windowRailGeo, windowRailMat, windows.length * 10);
    let index = 0;
    for (const d of windows) {
      Q.setFromAxisAngle(Y, I.rot - (d.axisX ? Math.PI / 2 : 0));
      for (const rail of d.windowRails) {
        S.set(d.W * 2, rail.yTop - rail.yBot, rail.r * 2);
        P.set((rail.ax + rail.bx) / 2, (rail.yBot + rail.yTop) / 2, (rail.az + rail.bz) / 2);
        M.compose(P, Q, S); rails.setMatrixAt(index++, M);
      }
      // 引き込んだ内障子の端も竪枠で受ける。窓の開口だけでなく、
      // 二倍幅の敷居・鴨居の両端をつなぎ、横木が宙に突き出した形にしない。
      // 戸の全開位置より外へ納め、二本の溝と紙戸の通り道を空ける。
      Q.multiply(windowJambTurn);
      for (const jamb of d.windowJambs) {
        S.set(jamb.yTop - jamb.yBot, jamb.r * 2, .4);
        P.set((jamb.ax + jamb.bx) / 2, (jamb.yBot + jamb.yTop) / 2, (jamb.az + jamb.bz) / 2);
        M.compose(P, Q, S); rails.setMatrixAt(index++, M);
      }
    }
    // 間仕切りは竪枠だけ。予約した未使用の行列を描かない。
    rails.count = index;
    rails.computeBoundingSphere(); grp.add(rails);
  }
  const by = new Map();
  for (const d of I.doors) {
    // 座敷の腰付き障子と腰窓の紙障子は別の形を共有する。
    const waist = d.joinery && d.kind === 'shoji' && !d.window && ['sobo', 'kuri'].includes(I.kind);
    const key = d.tracked ? d.kind + ':' + d.pw + ':' + panelHeight(d) : d.kind + ':' + waist;
    if (!by.has(key)) by.set(key, []);
    by.get(key).push(d);
  }
  for (const list of by.values()) {
if (I.profile !== 'hieizan') {
    const kind = list[0].kind;
    // 固定の袖と動く襖で同じ無地の紙・木枠を使う。形と材質は種類ごとに共有する。
    const plain = list[0].joinery && ['goten', 'sobo'].includes(I.kind) && ['fusuma', 'fusumaE'].includes(kind);
    const waist = list[0].joinery && kind === 'shoji' && !list[0].window && ['sobo', 'kuri'].includes(I.kind);
    const count = list.reduce((s, d) => s + d.n, 0), meshes = panelInstances(kind, count, kind === 'shoji' && list[0].joinery, plain, ['itado', 'koshi'].includes(kind) && list[0].joinery, waist);
    let i = 0;
    for (const d of list) { d.meshes = meshes; d.base = i; i += d.n; }
    for (const m of meshes) { m.count = count; grp.add(m); }
    for (const d of list) pose(d);
    // 野田福島の戸は開閉の両端まで描画範囲に含める。毎コマの範囲計算は要らない。
    let travel = 0;
    for (const d of list) if (d.joinery) for (const shift of d.travel) travel = Math.max(travel, Math.abs(shift));
    for (const m of meshes) { m.computeBoundingSphere(); m.boundingSphere.radius += travel; }

}
  }
}

function moribeBuildNakaDoorMeshes(I, grp) { return nodaBuildNakaDoorMeshes(I, grp); }

function moribePose(d) { return nodaPose(d); }

// 森部の外戸・内戸・明かり障子は、元の二本溝と一枚ごとの当たりを共用する。
function moribeAddNakaDoors(I, lv, y0, y1) {
  if (SKIP.includes(I.kind) || I.open) return;
  const portals = [...(lv.layout.portals || [])];
  if (lv.k === 0) portals.push({ exterior: true, x: I.door.lx,
    z: I.door.side * (lv.d / 2 - .34), w: I.door.w,
    kind: I.kind === 'hondo' ? 'koshi' : 'itado', h: I.door.h });
  for (const v of lv.windows || []) if (v.sliding) portals.push({ window: true,
    axisX: v.face === 'x', x: v.face === 'x' ? v.s * (lv.w / 2 - .1) : v.t,
    z: v.face === 'x' ? v.t : v.s * (lv.d / 2 - .1),
    w: v.w, bottom: v.y0, h: v.y1 - v.y0, kind: 'shoji' });
  for (const p of portals) {
    let l = p.w ? -p.w / 2 : -Infinity, r = p.w ? p.w / 2 : Infinity, paper = true;
    if (!p.w) for (const v of lv.layout.walls) {
      if (v.guideOnly || Math.abs(v.az - p.z) > .01 || Math.abs(v.bz - p.z) > .01) continue;
      const a = Math.min(v.ax, v.bx), b = Math.max(v.ax, v.bx);
      if (b <= p.x + .01 && b > l) { l = b; paper = v.paper; }
      if (a >= p.x - .01 && a < r) r = a;
    }
    if (!isFinite(l) || !isFinite(r) || r - l < .5 || r - l > 4.4) continue;
    const W = r - l, n = p.window ? 2 : Math.max(2, Math.round(W / 1.8) * 2);
    const lx = p.w ? p.x : (l + r) / 2, lz = p.z;
    const bottom = p.bottom || 0, h = p.h ?? (I.kind === 'yashiki' ? Math.min(2.2, lv.h) : lv.h > 3 ? 2.3 : lv.h);
    const kind = p.kind || (I.kind === 'hondo' ? 'koshi' : !paper ? 'itado' : 'fusuma');
    const [x, z] = I.P(lx, lz);
    const solid = { k: 's', r: MORIBE_PANEL_R, yBot: lv.y + bottom, yTop: lv.y + bottom + h,
      naka: I.id, fusuma: kind !== 'itado' && kind !== 'koshi', bodyOverlap: true };
    const d = { I, lv, kind, exterior: !!p.exterior, window: !!p.window, axisX: !!p.axisX,
      lx, lz, W, n, pw: W / n, h, y: lv.y + bottom, x, z,
      spot: { x, z }, interactPos: { x, z }, solid, saved: null,
      open: I.kind === 'hondo' && !p.exterior && !p.window ? 1 : 0,
      want: I.kind === 'hondo' && !p.exterior && !p.window ? 1 : 0, meshes: null, base: 0 };
    const leaves = [solid];
    for (let j = 1; j < n; j++) leaves.push({ ...solid });
    if (p.window) d.windowSolids = leaves;
    else d.panelSolids = leaves;
    for (const leaf of leaves) {
      if (solid.fusuma) { leaf.paperFrameX = .04; leaf.paperFrameY = .04; }
      SOLIDS.push(leaf); INTERIOR_WALLS.push(leaf);
    }
    (I.doors || (I.doors = [])).push(d); DOORS.push(d);
    if (p.exterior) I.entryDoor = d;
    moribePose(d);
  }
}
