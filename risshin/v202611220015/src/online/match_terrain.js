// オンライン対戦・諸大名戦・模擬合戦の戦場の地形（K601 30〜45・K603 47〜57・11/21 iMac k592）
//   一つの表から ①布陣の和紙の絵図（fujin_ui.js）②3D の戦場（match.js の world：高さ・林・川と浅瀬・村・道）③AI の高所（general_ai.js の view.hills）を作る。
//   「布陣の地図と3Dの戦場が関係ない」は禁止（K601 82）なので、絵図と戦場は必ずこの表だけを見る。
//   座標：地図の真ん中が原点の m（x 東西・z 南北）。自分の側は −z（南）、相手は +z（北）。地図は 400×300（MATCH_MAPS と同じ）。
//   地形の本当の効き目（森で騎馬の足が落ちる・川を渡る間は遅い・坂は登りが遅い）は、戦の兵の動き（army_move.js の terrainFx：木の込み具合・傾き・水の深さ）がそのまま出す。
//   ここの suitAt は布陣の札に出す『適性』と『地形効果』の目安（数の上乗せでなく、実の動きの重さを言葉にした物）。

const G = (x, z, cx, cz, r) => Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / (r * r));

// hills：{x,z,r,h,name,desc}／forests：{x,z,r,sx?,sz?,n,name}／rivers：[{ name, pts, w, depth, fords:[{x,z,w,name,desc}] }]（向きは自由・浅瀬と橋の所だけ膝）
//   villages：{x,z,name,desc}／roads：[[x,z]...]／labels：[{x,z,name,desc}]（地名の札だけ・街道や口）／zone：置ける範囲（K605：戦場ごとに変える）
//   11/21 K605（iMac の長）：筋書きの戦の地形と布陣図（docs/fujin/k15_tennoji_okayama.md・shitaragahara.md・sekigahara.md・川中島の作り）から、
//   対戦の戦場を四つ（天王寺・岡山／関ヶ原／設楽原／川中島）。対戦の盤 400×300 に縮め、自分は南（−z）・相手は北（+z）。地名は戦術の意味を一言で
const wave = (n, f) => Array.from({ length: n }, (_, i) => f(i));
const KAWA_PTS = wave(53, (i) => { const x = -208 + i * 8; return [x, 6 * Math.sin(x / 70)]; });
export const TERRAIN = {
  heigen: {
    name: '平原の戦い', desc: '丘と林のある広い平原。騎馬が走りやすく、物見ヶ丘の取り合いになる',
    hills: [{ x: 118, z: -40, r: 42, h: 7, name: '物見ヶ丘', desc: '自陣の高所。鉄砲・弓が遠くまで届く。騎馬は登りが遅い' }, { x: -122, z: 62, r: 40, h: 6.5, name: '松ヶ丘', desc: '敵の側の高所。取られると上から撃たれる' }],
    forests: [{ x: -150, z: -38, r: 30, sx: 1.2, n: 70, name: '林' }, { x: 152, z: 70, r: 28, sx: 1.1, n: 64, name: '林' }, { x: -30, z: 18, r: 16, n: 26, name: '小さな森' }],
    villages: [{ x: 46, z: -96, name: '田中村', desc: '家並みで槍が守りやすい。騎馬の突撃は切れる' }],
    roads: [[[0, -160], [10, -100], [-4, -30], [6, 40], [-6, 110], [0, 160]]],
    labels: [{ x: -4, z: -10, name: '街道の辻', desc: '両軍の間の進軍路。正面の主戦場になりやすい' }],
    rivers: [],
  },
  kawa: {
    name: '川と橋の戦い', desc: '川は二つの橋と東の浅瀬でしか渡れない。渡り口の押し合いが要',
    hills: [{ x: -120, z: -70, r: 40, h: 6, name: '鳶ヶ丘', desc: '自陣の高所。鉄砲で橋を見下ろせる' }, { x: 110, z: 80, r: 40, h: 6.5, name: '鷺ヶ丘', desc: '敵の側の高所' }],
    forests: [{ x: 150, z: -60, r: 26, sx: 1.2, n: 56, name: '林' }, { x: -150, z: 70, r: 28, sx: 1.2, n: 60, name: '林' }],
    villages: [{ x: -40, z: -100, name: '川辺村', desc: '家並みで槍が守りやすい' }],
    roads: [[[-60, -160], [-58, -60], [-60, 0], [-56, 60], [-50, 160]], [[70, -160], [74, -50], [70, 0], [66, 70], [72, 160]]],
    labels: [],
    rivers: [{ name: '川', pts: KAWA_PTS, w: 8, depth: 1.8, ew: true,
      fords: [{ x: -60, z: 6 * Math.sin(-60 / 70), w: 12, name: '下の橋', bridge: true, desc: '正面の渡り口。主戦場になりやすい' }, { x: 70, z: 6 * Math.sin(70 / 70), w: 12, name: '上の橋', bridge: true, desc: 'ここでしか渡れない。狭く、押し合いになる' }, { x: 150, z: 6 * Math.sin(150 / 70), w: 18, name: '東の浅瀬', desc: '渡る間は遅く隊列が崩れる。側面を突く道' }] }],
  },
  // 天王寺・岡山（慶長二十年五月七日）：北の奥に大坂城、真ん中に茶臼山、左（西）に天王寺口、右（東）に岡山口と平野川。徳川（自分）は南から
  tennoji: {
    name: '天王寺・岡山の戦い', season: '初夏（五月）・晴', desc: '茶臼山の高所と天王寺口・岡山口の二つの道。右は平野川で塞がる',
    hills: [{ x: 78, z: 22, r: 34, h: 9, name: '茶臼山', desc: '真ん中の高所。真田の陣。天王寺口を見下ろす' }, { x: -20, z: 150, r: 60, h: 7, name: '大坂城', desc: '敵の後ろ。本陣の奥（ここへは寄せにくい）' }, { x: -40, z: 104, r: 22, h: 4, name: '真田丸跡', desc: '城の南の出丸の跡。小さな高み' }],
    forests: [{ x: 160, z: 70, r: 26, n: 50, name: '林' }, { x: -150, z: -40, r: 22, sz: 1.4, n: 40, name: '川ぞいの林' }, { x: 120, z: -110, r: 18, n: 24, name: '林' }],
    villages: [{ x: 22, z: 52, name: '四天王寺', desc: '寺の伽藍。槍で守りやすく、正面の盾になる' }, { x: -60, z: -110, name: '平野の村', desc: '自陣の後ろの村' }],
    roads: [[[168, -160], [170, -40], [164, 60], [170, 160]], [[30, -160], [34, -60], [28, 20], [24, 90], [10, 150]], [[-70, -160], [-74, -60], [-70, 20], [-60, 100], [-40, 150]], [[-200, -130], [-150, -80], [-110, -40], [-74, -20]]],
    labels: [{ x: 32, z: -30, name: '天王寺口', desc: '正面の主戦場になりやすい' }, { x: -74, z: -30, name: '岡山口', desc: '東の進軍路。側面を突かれやすい' }, { x: 168, z: -60, name: '紀州街道', desc: '西の大回りの道' }, { x: -168, z: -95, name: '奈良街道', desc: '川の外から回り込む道' }],
    rivers: [{ name: '平野川', pts: wave(40, (i) => { const z = -160 + i * 8.3; return [-118 + 6 * Math.sin(z / 50), z]; }), w: 6, depth: 1.7,
      fords: [{ x: -118 + 6 * Math.sin(-20 / 50), z: -20, w: 10, name: '岡山口の橋', bridge: true, desc: '平野川を渡る唯一の橋' }, { x: -118 + 6 * Math.sin(-100 / 50), z: -100, w: 14, name: '浅瀬', desc: '渡る間は遅い。奈良街道からの回り道' }] }],
    zone: { xr: -104 },   // 右（東）は平野川まで
  },
  // 関ヶ原（慶長五年九月十五日）：盆地。自分（東軍）は南から、相手（西軍）は北の笹尾山・天満山。左に松尾山（どちらにも付く高所）、右の奥に南宮山
  sekigahara: {
    name: '関ヶ原の戦い', season: '晩秋（九月）・霧のち晴', desc: '盆地。左の松尾山を取った側が横から突ける。前に藤川',
    hills: [{ x: 40, z: 125, r: 34, h: 10, name: '笹尾山', desc: '石田三成の陣。敵の本陣の高所' }, { x: -60, z: 100, r: 34, h: 7, name: '天満山', desc: '敵の右の高所。宇喜多の大軍' }, { x: 170, z: 10, r: 32, h: 13, name: '松尾山', desc: '左の高い山。取った側が横から突ける' }, { x: -165, z: -95, r: 38, h: 10, name: '南宮山', desc: '右の奥の山。登ると戦場が遠い' }, { x: 0, z: -138, r: 24, h: 5, name: '桃配山', desc: '自陣の後ろの小山。本陣に良い' }],
    forests: [{ x: 160, z: 40, r: 30, sz: 1.3, n: 60, name: '松尾山の林' }, { x: -160, z: -60, r: 30, n: 50, name: '林' }, { x: 120, z: 120, r: 22, n: 30, name: '林' }],
    villages: [{ x: 10, z: -10, name: '関ヶ原宿', desc: '道の集まる宿。真ん中の要' }],
    roads: [[[0, -160], [4, -60], [10, -10], [0, 60], [-10, 160]], [[10, -10], [60, 60], [90, 160]], [[10, -10], [-80, 40], [-180, 90]]],
    labels: [{ x: 4, z: -55, name: '中山道', desc: '東西の大道。真ん中の進軍路' }, { x: 70, z: 75, name: '北国街道', desc: '笹尾山の脇へ抜ける道' }, { x: -110, z: 55, name: '伊勢街道', desc: '天満山の南を回る道' }],
    rivers: [{ name: '藤川', pts: wave(53, (i) => { const x = -208 + i * 8; return [x, 58 + 5 * Math.sin(x / 45)]; }), w: 5, depth: 1.5, ew: true,
      fords: [{ x: -60, z: 58 + 5 * Math.sin(-60 / 45), w: 16, name: '藤川の浅瀬', desc: '敵の前の小川。渡る間は遅い' }, { x: 2, z: 58 + 5 * Math.sin(2 / 45), w: 14, name: '中山道の橋', bridge: true, desc: '道の橋。押し合いになる' }, { x: 90, z: 58 + 5 * Math.sin(90 / 45), w: 16, name: '北の浅瀬', desc: '笹尾山の前の浅瀬' }] }],
  },
  // 設楽原（天正三年五月二十一日）：連吾川を挟む。自分（織田・徳川）は南の弾正山の高み、相手（武田）は北の段丘。川は浅瀬だらけ（騎馬は渡る間が遅い）
  shitara: {
    name: '設楽原の戦い', season: '初夏（五月）・晴', desc: '連吾川を挟む。浅瀬は多いが渡る間は遅い。自陣の弾正山から鉄砲で見下ろせる',
    hills: [{ x: -50, z: -78, r: 50, h: 6, name: '弾正山', desc: '自陣の高み。鉄砲を並べて川を見下ろす' }, { x: 110, z: -118, r: 28, h: 7, name: '茶臼山', desc: '信長の本陣の山' }, { x: 40, z: 100, r: 60, h: 5, name: '才ノ神', desc: '敵の段丘。武田の本陣' }],
    forests: [{ x: 175, z: -10, r: 24, sz: 1.6, n: 46, name: '林' }, { x: -175, z: 10, r: 24, sz: 1.6, n: 46, name: '林' }, { x: -120, z: 110, r: 22, n: 30, name: '林' }],
    villages: [{ x: 120, z: 40, name: '竹広', desc: '川向こうの村。騎馬の寄せの道' }],
    roads: [[[-160, -150], [-80, -40], [0, 0], [60, 60], [140, 160]]],
    labels: [{ x: 0, z: 30, name: '設楽原', desc: '川を渡った野。騎馬が走りやすい' }, { x: -100, z: -55, name: '伊那街道', desc: '斜めに抜ける道' }],
    rivers: [{ name: '連吾川', pts: wave(53, (i) => { const x = -208 + i * 8; return [x, -12 + 4 * Math.sin(x / 33)]; }), w: 4, depth: 1.2, ew: true,
      fords: [{ x: -120, z: -12 + 4 * Math.sin(-120 / 33), w: 22, name: '浅瀬', desc: '渡る間は遅く、隊列が崩れる' }, { x: -10, z: -12 + 4 * Math.sin(-10 / 33), w: 26, name: '浅瀬', desc: '真ん中の渡り。正面の主戦場' }, { x: 110, z: -12 + 4 * Math.sin(110 / 33), w: 22, name: '浅瀬', desc: '左の渡り' }] }],
    zone: { fz: [-64, -36], bz: [-140, -100] },   // 柵の前（川の手前）まで出られる
  },
  // 川中島・八幡原（永禄四年九月十日）：広い平原。右（東）に千曲川、敵の後ろ（北）に犀川。左の奥に妻女山
  kawanaka: {
    name: '川中島の戦い', season: '秋（九月）・朝霧', desc: '広い八幡原。右は千曲川、敵の後ろは犀川。騎馬の野',
    hills: [{ x: 160, z: 110, r: 40, h: 14, name: '妻女山', desc: '左の奥の高い山。上から回り込む道' }, { x: -70, z: -125, r: 26, h: 5, name: '茶臼山', desc: '自陣の後ろの小山' }],
    forests: [{ x: 150, z: 40, r: 28, sz: 1.3, n: 50, name: '林' }, { x: -40, z: 70, r: 18, n: 26, name: '小さな森' }, { x: 60, z: -60, r: 16, n: 22, name: '小さな森' }],
    villages: [{ x: -150, z: -110, name: '海津城下', desc: '自陣の後ろの城下' }, { x: 20, z: 10, name: '八幡社', desc: '原の真ん中の社' }],
    roads: [[[-170, -160], [-100, -60], [0, 0], [80, 80], [120, 160]]],
    labels: [{ x: 0, z: -30, name: '八幡原', desc: '広い平原。騎馬の野・霧で敵が見えにくい' }],
    rivers: [{ name: '千曲川', pts: wave(40, (i) => { const z = -160 + i * 8.3; return [-165 + 6 * Math.sin(z / 60), z]; }), w: 7, depth: 1.8,
      fords: [{ x: -165 + 6 * Math.sin(-40 / 60), z: -40, w: 18, name: '雨宮の渡し', desc: '千曲川の浅瀬。横から回る道' }] },
    { name: '犀川', pts: wave(53, (i) => { const x = -208 + i * 8; return [x, 150 + 4 * Math.sin(x / 40)]; }), w: 7, depth: 1.8, ew: true, fords: [] }],
    zone: { xr: -150 },
  },
};
export const terrainOf = (mapId) => TERRAIN[mapId] || TERRAIN.heigen;
/** 置ける範囲（K605）：前の列 fz・後ろ bz・左の端 xl（+x）・右の端 xr（−x） */
export const zoneOf = (mapId) => ({ fz: [-92, -62], bz: [-148, -110], xl: 196, xr: -196, ...(terrainOf(mapId).zone || {}) });

// 折れ線への近さ（川）
function distPoly(pts, x, z) {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2)), d = Math.hypot(x - (ax + dx * t), z - (az + dz * t));
    if (d < best) best = d;
  }
  return best;
}
const fordAt = (R, x, z, pad = 0) => R.fords.find((f) => Math.hypot(x - f.x, z - f.z) <= f.w + pad) || null;

/** 地面の高さ（3D の world.height と同じ物）。地図の外は少しずつ上がって戦場を囲む */
export function heightOf(mapId, x, z) {
  const T = terrainOf(mapId);
  let h = 0.35 * Math.sin(x * 0.045) * Math.cos(z * 0.037);
  for (const q of T.hills) h += q.h * G(x, z, q.x, q.z, q.r);
  // 川床：浅瀬と橋の所は膝まで、ほかは背丈より深く掘る（world の水面は岸の高さで決まるので、岸を残して床を下げる）
  for (const R of T.rivers || []) {
    const d = distPoly(R.pts, x, z), w = R.w;
    if (d < w + 3) {
      const f = fordAt(R, x, z, 8);
      const k = Math.cos(Math.min(1, d / (w + 3)) * Math.PI / 2) ** 2;
      const fk = f ? Math.min(1, Math.max(0, (Math.hypot(x - f.x, z - f.z) - f.w + 4) / 8)) : 1;   // 浅瀬の縁で滑らかに深くなる
      h -= k * (0.75 + 1.9 * fk);
    }
  }
  const ox = Math.max(0, Math.abs(x) - 205), oz = Math.max(0, Math.abs(z) - 158);
  h += (ox + oz) * 0.18;
  return h;
}

/** その地点の地形：'river'|'ford'|'forest'|'hill'|'village'|'road'|'plain' と名 */
export function terrainAt(mapId, x, z) {
  const T = terrainOf(mapId);
  for (const R of T.rivers || []) {
    if (distPoly(R.pts, x, z) < R.w + 2) { const f = fordAt(R, x, z); return f ? { kind: 'ford', name: f.name } : { kind: 'river', name: R.name || '川' }; }
  }
  for (const f of T.forests) if (((x - f.x) / (f.r * (f.sx || 1))) ** 2 + ((z - f.z) / (f.r * (f.sz || 1))) ** 2 < 1) return { kind: 'forest', name: f.name };
  for (const q of T.hills) if (q.h * G(x, z, q.x, q.z, q.r) > 2.4) return { kind: 'hill', name: q.name };
  for (const v of T.villages) if (Math.hypot(x - v.x, z - v.z) < 20) return { kind: 'village', name: v.name };
  return { kind: 'plain', name: '平原' };
}

// 兵種の適性（K601 39〜44）：騎馬＝平原・翼／槍＝中央・村／鉄砲＝高所・平原（森は射線が落ちる）／弓＝高所・林の縁
//   ◎ 良い（+10%）・○ 普通（0）・△ 悪い（−10%）。強さの上乗せでなく、実の動き（足・射線・隊列）の重さを短く言った物
const SUIT = {
  plain: { 騎馬: 2, 槍: 1, 鉄砲: 2, 弓: 1 },
  road: { 騎馬: 2, 槍: 1, 鉄砲: 1, 弓: 1 },
  hill: { 騎馬: 0, 槍: 1, 鉄砲: 2, 弓: 2 },
  forest: { 騎馬: 0, 槍: 1, 鉄砲: 0, 弓: 1 },
  village: { 騎馬: 0, 槍: 2, 鉄砲: 1, 弓: 1 },
  ford: { 騎馬: 0, 槍: 0, 鉄砲: 0, 弓: 0 },
  river: { 騎馬: 0, 槍: 0, 鉄砲: 0, 弓: 0 },
};
export const SUIT_MARK = ['△', '○', '◎'];
// 地形の効き目の一行（数字だけでなく何が起きるか）
const WHY = {
  plain: { 騎馬: '突撃が一番効く', 鉄砲: '射線が通る' },
  hill: { 騎馬: '坂で足が落ちる', 鉄砲: '高所から撃ち下ろす', 弓: '高所から遠くへ届く' },
  forest: { 騎馬: '木で足が落ちる', 鉄砲: '射線が木に遮られる', 槍: '伏せるのに良い', 弓: '伏せるのに良い' },
  village: { 騎馬: '家並みで突撃が切れる', 槍: '家並みで守りやすい' },
  ford: { 騎馬: '渡る間は衝撃が落ちる', 槍: '渡る間は隊列が崩れる', 鉄砲: '渡る間は撃てない', 弓: '渡る間は撃てない' },
  river: { 騎馬: '深くて渡れない', 槍: '深くて渡れない', 鉄砲: '深くて渡れない', 弓: '深くて渡れない' },
};
/** 兵種 kind（'騎馬'|'槍'|'鉄砲'|'弓'）がその地点でどうか：{ terrain, name, grade(0..2), mark, pct, why } */
export function suitAt(mapId, kind, x, z) {
  const t = terrainAt(mapId, x, z), k = SUIT[t.kind] ? kind : '槍';
  const grade = SUIT[t.kind]?.[k] ?? 1;
  return { terrain: t.kind, name: t.name, grade, mark: SUIT_MARK[grade], pct: (grade - 1) * 10, why: WHY[t.kind]?.[k] || '' };
}

// 武将の兵種（K601：一人の武将＝単一兵種の1000人隊）。house.js の得意の型（kata・fav）から：騎馬重視→騎馬・鉄砲重視→鉄砲・弓→弓・ほか（標準・槍・守備）→槍
export function heishuOf(kata) {
  return kata === 'kiba' || kata === '騎馬' ? '騎馬' : kata === 'teppo' || kata === '鉄砲' ? '鉄砲' : kata === 'yumi' || kata === '弓' ? '弓' : '槍';
}

/** 3D の戦場の world（match.js の matchDef が稽古場の world の代わりに使う） */
export function matchWorld(mapId) {
  const T = terrainOf(mapId);
  const inField = (x, z) => Math.abs(x) < 196 && Math.abs(z) < 150;
  return {
    seed: 57 + Object.keys(TERRAIN).indexOf(mapId) * 9, clearAir: true, southSun: false,
    // 地面の網は既定で ±180m しか無く、400×300 の盤の端（左翼・右翼の ±196m）が網の外だった。盤より少し広く
    groundHalf: 232,
    height: (x, z) => heightOf(mapId, x, z),
    // 林（groves）は表の所だけに置く。散らばる木は戦場の外の縁だけ（中に一本木を立てない＝絵図と同じ）
    trees: 60, noBamboo: true,
    treePlace: (x, z) => (inField(x, z) ? 0 : 1),
    groves: T.forests.map((f) => ({ x: f.x, z: f.z, r: f.r, n: f.n, sx: f.sx || 1, sz: f.sz || 1 })),
    clear: (x, z) => inField(x, z) && !T.forests.some((f) => Math.hypot(x - f.x, z - f.z) < f.r * 1.2),
    paths: T.roads.map((pts) => ({ pts, w: 3 })),
    // 川：水面と川床は world の streams。浅瀬は点（x, z）で渡す（world_common.js の fordLift が z を見る＝南北の川でも浅瀬が効く）
    ...(T.rivers?.length ? { riverCross: true, streams: T.rivers.map((R) => ({ pts: R.pts, w: R.w, depth: R.depth, fords: R.fords.map((f) => ({ x: f.x, z: f.z, w: f.w })) })) } : {}),
    tufts: 2200, time: 'day',
  };
}

/** AI の高所（general_ai.js の view.hills）：丘の頂 */
export const hillsOf = (mapId) => terrainOf(mapId).hills.map((q) => ({ x: q.x, z: q.z }));
