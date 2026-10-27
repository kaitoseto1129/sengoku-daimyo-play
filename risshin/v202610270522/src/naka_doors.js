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
import { panelInstances, slidingDoorTrack, batchInterior, hieiRitualTimber, inabaBoardTexture, hieiPartitionHeight, HIEI_DOOR_TRACK, HIEI_ENTRY_TRACK, HIEI_LEAF_OVERLAP, HIEI_SOBO_SILL } from './interior_parts.js';
import { interiorPartitionHeight, interiorPartitionHeaders, shitaragaharaEntryInset } from './interior_layouts.js';
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
  if (I.profile === 'moribe') return moribeAddNakaDoors(I, lv, y0, y1);
  if (I.profile === 'hieizan' || I.profile === 'shitaragahara') return addNakaDoorsHiei(I, lv, y0, y1);
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
  for (const p of portals) {
    let l = p.entry ? p.x - I.door.w / 2 : -Infinity;
    let r = p.entry ? p.x + I.door.w / 2 : Infinity, paper = true;
    for (const v of lv.layout.walls) {
      if (p.entry || v.guideOnly || Math.abs(v.az - p.z) > .01 || Math.abs(v.bz - p.z) > .01) continue;
      const a = Math.min(v.ax, v.bx), b = Math.max(v.ax, v.bx);
      if (b <= p.x + .01 && b > l) { l = b; paper = v.paper; }
      if (a >= p.x - .01 && a < r) r = a;
    }
    if (p.exterior) { l = p.x - p.w / 2; r = p.x + p.w / 2; }
    if (!isFinite(l) || !isFinite(r) || r - l < .5 || r - l > 4.4) continue;
    const temple = TEMPLE.includes(I.kind);
if (I.profile === 'hieizan') {
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
  if (I.profile === 'hieizan' || I.profile === 'shitaragahara') return buildNakaDoorMeshesHiei(I, grp);
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
    // 正面戸・座敷の戸・明かり障子は寸法が違う。同寸の戸だけをまとめ描きする。
    const key = d.tracked ? d.kind + ':' + d.pw + ':' + panelHeight(d) : d.kind;
    if (!by.has(key)) by.set(key, []);
    by.get(key).push(d);
  }
  for (const list of by.values()) {
    const first = list[0], kind = first.kind;
    const count = list.reduce((s, d) => s + d.n, 0);
    const panelKind = I.profile === 'hieizan' ? kind === 'shoji' ? 'shojiHiei' : kind === 'koshi' ? 'koshiHiei' : kind === 'itado' ? 'itadoHiei' : kind : kind;
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
  if (d.tracked || d.I.profile === 'shitaragahara') return poseHiei(d, open);
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
  if (d.tracked) {
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
  if (want && !d.window && !d.villageTrack && !d.tracked && !d.slidingSolids) solidOff(d);
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
  if (rt.def.key === 'shitaragahara') return villageNakaDoorTick(rt, dt, flagged);
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

function solidOff(d) {
  const s = d.solid;
  if (!d.saved) d.saved = { ax: s.ax, az: s.az, bx: s.bx, bz: s.bz, x0: s.x0, x1: s.x1, z0: s.z0, z1: s.z1 };
  s.ax = s.az = s.bx = s.bz = s.x0 = s.x1 = s.z0 = s.z1 = 1e9;
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

