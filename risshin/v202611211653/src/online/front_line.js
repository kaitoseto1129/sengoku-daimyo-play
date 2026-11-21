// 見えない戦線と地形の取り合い（K603 47〜49・11/21 iMac k592）
//   ・戦線は線を描かない。両軍の生きた隊が、自陣から敵陣へどれだけ押し出しているか（兵の数で重みを付けた平均）で量る。一隊だけ突出しても戦線は進まない
//   ・取り合う所＝高所（丘）・橋・渡河点（浅瀬）・村・街道の真ん中。旗を立てて取る遊びにはしない：その場の周りに自分の隊が居て、敵の隊が居ない間だけ『押さえている』。
//     一度押さえた所は、敵が来て居座るまで押さえたまま（離れてもすぐには失わない＝戦線の後ろに残る）
//   ・15分の判定の『戦線 10%』（pvp_rules.timeParts の front）＝戦線の押しが七割・取り合う所の数が三割
//   ・AI（general_ai.js）は view.keys を見て、近くの空いた所・敵に押さえられた所を取りに行く（家の型で好みが違う）
import { terrainOf } from './match_terrain.js';

const R_HOLD = 35;   // 押さえる輪（m）

/** その地図の取り合う所：[{ id, kind:'hill'|'bridge'|'ford'|'village'|'road', x, z, w }] */
export function keyPoints(mapId) {
  const T = terrainOf(mapId), out = [];
  T.hills.forEach((q, i) => out.push({ id: `hill${i}`, kind: 'hill', x: q.x, z: q.z, w: 1.2 }));
  if (T.river) {
    const zAt = (x) => T.river.pts.reduce((b, p) => (Math.abs(p[0] - x) < Math.abs(b[0] - x) ? p : b))[1];
    T.river.fords.forEach((f, i) => out.push({ id: `ford${i}`, kind: f.name === '橋' ? 'bridge' : 'ford', x: f.x, z: zAt(f.x), w: 1.3 }));
  }
  T.villages.forEach((v, i) => out.push({ id: `village${i}`, kind: 'village', x: v.x, z: v.z, w: 0.8 }));
  // 街道の真ん中（両軍のちょうど間の道）。川の地図では橋と重なるので足さない
  if (!T.river) T.roads.forEach((pts, i) => { const m = pts.reduce((b, p) => (Math.abs(p[1]) < Math.abs(b[1]) ? p : b)); out.push({ id: `road${i}`, kind: 'road', x: m[0], z: m[1], w: 0.8 }); });
  return out;
}

const live = (S) => S.state !== '敗走' && S.b?.aliveNominal?.() > 0;
const pow = (S) => S.b.aliveNominal() * Math.max(0.2, (S.b.morale ?? 100) / 100);

/** 一秒ごと：取り合う所の持ち主を更新して返す。M.keys＝{ id: { holder: 0|1|null, since } } */
export function tickKeys(M, mapId, t) {
  const K = M.keyPts || (M.keyPts = keyPoints(mapId));
  const st = M.keys || (M.keys = {});
  for (const k of K) {
    const p = [0, 0];
    for (const S of M.sonae || []) { if (!live(S)) continue; const d = Math.hypot(S.b.pos.x - k.x, S.b.pos.z - k.z); if (d < R_HOLD) p[S.team ? 1 : 0] += pow(S) * (1 - d / R_HOLD * 0.5); }
    const s = st[k.id] || (st[k.id] = { holder: null, since: t });
    // 自分だけが居る（敵が三割未満）なら押さえる。両方が居る間は前の持ち主のまま（揉み合い）
    const h = p[0] > 50 && p[1] < p[0] * 0.3 ? 0 : p[1] > 50 && p[0] < p[1] * 0.3 ? 1 : s.holder;
    if (h !== s.holder) { s.holder = h; s.since = t; }
    s.contest = p[0] > 50 && p[1] > 50;
  }
  return st;
}

/** 戦線の押し（0〜1）：その側の生きた隊の、自陣の本陣→敵の本陣の筋の上の位置を兵の重みで平均 */
export function pushOf(M, team, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz || 1;
  let s = 0, n = 0;
  for (const S of M.sonae || []) {
    if ((S.team ? 1 : 0) !== team || !live(S)) continue;
    const k = Math.max(0, Math.min(1, ((S.b.pos.x - a.x) * dx + (S.b.pos.z - a.z) * dz) / L2)), w = S.b.aliveNominal();
    s += k * w; n += w;
  }
  return n ? s / n : 0;
}

/** 判定の front（0〜1・0.5 が五分）：押しの差が七割・押さえた所の重みの差が三割 */
export function frontValue(M, team, homes) {
  const [h0, h1] = homes; if (!h0 || !h1) return 0.5;
  const mine = team ? h1 : h0, foe = team ? h0 : h1;
  const pa = pushOf(M, team, mine, foe), pb = pushOf(M, 1 - team, foe, mine);
  const K = M.keyPts || [], st = M.keys || {};
  const tot = K.reduce((a, k) => a + k.w, 0) || 1;
  const held = (tm) => K.reduce((a, k) => a + (st[k.id]?.holder === tm ? k.w : 0), 0) / tot;
  const v = 0.5 + 0.7 * (pa - pb) / 2 + 0.3 * (held(team) - held(1 - team)) / 2;
  return Math.max(0, Math.min(1, v));
}

/** AI へ渡す取り合う所（自分の側から見た持ち主：mine・foe・null） */
export function keysView(M, team) {
  return (M.keyPts || []).map((k) => { const h = M.keys?.[k.id]?.holder; return { x: k.x, z: k.z, kind: k.kind, w: k.w, held: h == null ? null : h === team ? 'mine' : 'foe', contest: !!M.keys?.[k.id]?.contest }; });
}
