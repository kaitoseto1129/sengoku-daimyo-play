// オンライン対戦・諸大名戦・模擬合戦の戦場の地形（K601 30〜45・K603 47〜57・11/21 iMac k592）
//   一つの表から ①布陣の和紙の絵図（fujin_ui.js）②3D の戦場（match.js の world：高さ・林・川と浅瀬・村・道）③AI の高所（general_ai.js の view.hills）を作る。
//   「布陣の地図と3Dの戦場が関係ない」は禁止（K601 82）なので、絵図と戦場は必ずこの表だけを見る。
//   座標：地図の真ん中が原点の m（x 東西・z 南北）。自分の側は −z（南）、相手は +z（北）。地図は 400×300（MATCH_MAPS と同じ）。
//   地形の本当の効き目（森で騎馬の足が落ちる・川を渡る間は遅い・坂は登りが遅い）は、戦の兵の動き（army_move.js の terrainFx：木の込み具合・傾き・水の深さ）がそのまま出す。
//   ここの suitAt は布陣の札に出す『適性』と『地形効果』の目安（数の上乗せでなく、実の動きの重さを言葉にした物）。

const G = (x, z, cx, cz, r) => Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / (r * r));

// hills：{x,z,r,h,name}（r は裾の広さの目安）／forests：{x,z,r,sx?,sz?,n,name}／river：{pts,w,depth,fords:[{x,w,name}]}／villages：{x,z,name}／roads：[[x,z]...]
export const TERRAIN = {
  heigen: {
    hills: [{ x: 118, z: -40, r: 42, h: 7, name: '丘' }, { x: -122, z: 62, r: 40, h: 6.5, name: '丘' }],
    forests: [{ x: -150, z: -38, r: 30, sx: 1.2, n: 70, name: '林' }, { x: 152, z: 70, r: 28, sx: 1.1, n: 64, name: '林' }, { x: -30, z: 18, r: 16, n: 26, name: '小さな森' }],
    villages: [{ x: 46, z: -96, name: '村' }],
    roads: [[[0, -160], [10, -100], [-4, -30], [6, 40], [-6, 110], [0, 160]]],
    river: null,
  },
  kawa: {
    hills: [{ x: -120, z: -70, r: 40, h: 6, name: '丘' }, { x: 110, z: 80, r: 40, h: 6.5, name: '丘' }],
    forests: [{ x: 150, z: -60, r: 26, sx: 1.2, n: 56, name: '林' }, { x: -150, z: 70, r: 28, sx: 1.2, n: 60, name: '林' }],
    villages: [{ x: -40, z: -100, name: '村' }],
    roads: [[[-60, -160], [-58, -60], [-60, 0], [-56, 60], [-50, 160]], [[70, -160], [74, -50], [70, 0], [66, 70], [72, 160]]],
    // 川は東西に流れる。橋の所（-60・70）と東の浅瀬（150）だけ膝の深さで渡れる。ほかは深くて渡れない
    river: { pts: Array.from({ length: 53 }, (_, i) => { const x = -208 + i * 8; return [x, 6 * Math.sin(x / 70)]; }), w: 8, depth: 1.8,
      fords: [{ x: -60, w: 12, name: '橋' }, { x: 70, w: 12, name: '橋' }, { x: 150, w: 18, name: '浅瀬' }] },
  },
};
export const terrainOf = (mapId) => TERRAIN[mapId] || TERRAIN.heigen;

const riverZ = (R, x) => {
  const p = R.pts; if (x <= p[0][0]) return p[0][1];
  for (let i = 1; i < p.length; i++) if (x <= p[i][0]) { const a = p[i - 1], b = p[i], t = (x - a[0]) / (b[0] - a[0]); return a[1] + (b[1] - a[1]) * t; }
  return p[p.length - 1][1];
};

/** 地面の高さ（3D の world.height と同じ物。川床は world の streams が削る）。地図の外は少しずつ上がって戦場を囲む */
export function heightOf(mapId, x, z) {
  const T = terrainOf(mapId);
  let h = 0.35 * Math.sin(x * 0.045) * Math.cos(z * 0.037);
  for (const q of T.hills) h += q.h * G(x, z, q.x, q.z, q.r);
  // 川床：浅瀬と橋の所は膝まで、ほかは背丈より深く掘る（world の水面は岸の高さで決まるので、岸を残して床を下げる）
  if (T.river) {
    const dz = Math.abs(z - riverZ(T.river, x)), w = T.river.w;
    if (dz < w + 3) {
      const f = T.river.fords.find((q) => Math.abs(x - q.x) <= q.w + 4);
      const k = Math.cos(Math.min(1, dz / (w + 3)) * Math.PI / 2) ** 2;
      const fk = f ? Math.min(1, Math.max(0, (Math.abs(x - f.x) - f.w + 4) / 8)) : 1;   // 浅瀬の縁で滑らかに深くなる
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
  if (T.river) {
    const dz = Math.abs(z - riverZ(T.river, x));
    if (dz < T.river.w + 2) { const f = T.river.fords.find((q) => Math.abs(x - q.x) <= q.w); return f ? { kind: 'ford', name: f.name } : { kind: 'river', name: '川' }; }
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
    seed: 57 + (mapId === 'kawa' ? 9 : 0), clearAir: true, southSun: false,
    height: (x, z) => heightOf(mapId, x, z),
    // 林（groves）は表の所だけに置く。散らばる木は戦場の外の縁だけ（中に一本木を立てない＝絵図と同じ）
    trees: 60, noBamboo: true,
    treePlace: (x, z) => (inField(x, z) ? 0 : 1),
    groves: T.forests.map((f) => ({ x: f.x, z: f.z, r: f.r, n: f.n, sx: f.sx || 1, sz: f.sz || 1 })),
    clear: (x, z) => inField(x, z) && !T.forests.some((f) => Math.hypot(x - f.x, z - f.z) < f.r * 1.2),
    paths: T.roads.map((pts) => ({ pts, w: 3 })),
    ...(T.river ? { riverCross: true, streams: [{ pts: T.river.pts, w: T.river.w, depth: T.river.depth, fords: T.river.fords.map((f) => ({ x: f.x, w: f.w })) }] } : {}),
    tufts: 2200, time: 'day',
  };
}

/** AI の高所（general_ai.js の view.hills）：丘の頂 */
export const hillsOf = (mapId) => terrainOf(mapId).hills.map((q) => ({ x: q.x, z: q.z }));
